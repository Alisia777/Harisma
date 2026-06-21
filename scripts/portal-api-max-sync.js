#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { emitSecurityAudit } = require('./portal-security-audit-event');

const BUSINESS_CUTOFF_PLATFORMS = ['wb', 'ozon', 'ya'];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      if (!args.command) args.command = token;
      continue;
    }
    if ([
      '--dry-run',
      '--strict',
      '--skip-health',
      '--skip-data-guard',
      '--skip-magnit-csv',
      '--skip-wb-ads',
      '--skip-iu-drr'
    ].includes(token)) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === '--skip-protected-scope') {
      args.skipProtectedScope = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const raw = normalizeText(value).toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
}

function isoDate(value) {
  const raw = normalizeText(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function monthStart(dateKey) {
  return `${String(dateKey || localDateKey()).slice(0, 7)}-01`;
}

function localDateKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function userEnv(name) {
  if (process.platform !== 'win32') return '';
  try {
    return normalizeText(execFileSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `[Environment]::GetEnvironmentVariable(${JSON.stringify(name)}, 'User')`
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return '';
  }
}

function envValue(env, name) {
  const directValue = normalizeText(env[name] || process.env[name]);
  if (directValue) return directValue;
  if (asBool(env.ALTEA_PORTAL_API_IGNORE_USER_ENV || process.env.ALTEA_PORTAL_API_IGNORE_USER_ENV)) return '';
  return normalizeText(userEnv(name));
}

function ensureEnv(env, name, aliases = []) {
  if (normalizeText(env[name])) return;
  const value = envValue(env, name) || aliases.map((alias) => envValue(env, alias)).find(Boolean) || '';
  if (value) env[name] = value;
}

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function resolveOptions(args) {
  const root = process.cwd();
  const mode = normalizeText(args.mode || envValue(process.env, 'ALTEA_PORTAL_API_MAX_MODE') || 'max').toLowerCase();
  const maxFrom = isoDate(args.from || args['date-from'] || envValue(process.env, 'ALTEA_PORTAL_API_MAX_FROM') || '2024-01-01');
  const explicitTo = isoDate(args.to || args['date-to'] || envValue(process.env, 'ALTEA_PORTAL_API_MAX_TO'));
  const to = explicitTo || localDateKey(-1);
  const recentDays = Math.max(1, Math.trunc(numberOrZero(args['recent-days'] || envValue(process.env, 'ALTEA_PORTAL_API_RECENT_DAYS') || 14)));
  const from = mode === 'daily' || mode === 'recent'
    ? isoDate(args.from || args['date-from']) || addDays(to, -recentDays + 1)
    : maxFrom;
  const platforms = normalizeText(args.platforms || envValue(process.env, 'ALTEA_PORTAL_API_PLATFORMS') || 'wb,ozon,ya,goldapple,letu,magnit')
    .split(',')
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
  const inputFile = path.resolve(args['input-file'] || path.join(root, 'data', 'platform_trends.json'));
  const outputFile = path.resolve(args['output-file'] || inputFile);
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(root, 'data'));
  const chunkDays = Math.max(7, Math.min(92, Math.trunc(numberOrZero(args['chunk-days'] || envValue(process.env, 'ALTEA_PORTAL_API_CHUNK_DAYS') || 31))));
  return {
    command: args.command || 'sync',
    mode,
    from,
    to,
    recentDays,
    platforms,
    inputFile,
    outputFile,
    baseDataDir,
    chunkDays,
    tempDir: path.resolve(args['temp-dir'] || path.join(baseDataDir, '.api_max_tmp')),
    manifestFile: path.resolve(args['manifest-file'] || path.join(baseDataDir, 'portal_api_max_sync.json')),
    dryRun: asBool(args['dry-run'], Boolean(args.dryRun)),
    strict: asBool(args.strict, Boolean(args.strict)),
    skipHealth: asBool(args['skip-health'], Boolean(args.skipHealth)),
    skipDataGuard: asBool(args['skip-data-guard'], Boolean(args.skipDataGuard)),
    skipMagnitCsv: asBool(args['skip-magnit-csv'], Boolean(args.skipMagnitCsv)),
    skipWbAds: asBool(args['skip-wb-ads'], Boolean(args.skipWbAds)),
    skipIuDrr: asBool(args['skip-iu-drr'], Boolean(args.skipIuDrr))
  };
}

function platformSeriesSummary(payload) {
  const result = {};
  for (const platform of Array.isArray(payload?.platforms) ? payload.platforms : []) {
    const key = normalizeText(platform?.key || platform?.platformKey || platform?.label);
    if (!key) continue;
    const dates = (Array.isArray(platform.series) ? platform.series : [])
      .map((point) => isoDate(point?.label || point?.date))
      .filter(Boolean)
      .sort();
    result[key] = {
      points: dates.length,
      from: dates[0] || '',
      to: dates[dates.length - 1] || '',
      revenue: Number((Array.isArray(platform.series) ? platform.series : [])
        .reduce((sum, point) => sum + numberOrZero(point?.revenue), 0).toFixed(4))
    };
  }
  return result;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function pointDate(point) {
  return isoDate(point?.date || point?.label);
}

function refreshDayOffsets(series) {
  const rows = (Array.isArray(series) ? series : [])
    .map((point) => {
      const date = pointDate(point);
      return date ? { ...point, date, label: point.label || date } : null;
    })
    .filter(Boolean)
    .sort((left, right) => pointDate(left).localeCompare(pointDate(right)));
  const latestIndex = Math.max(0, rows.length - 1);
  return rows.map((point, index) => ({
    ...point,
    dayOffset: latestIndex - index
  }));
}

function replaceSeriesWindow(existingSeries, freshSeries, from, to) {
  const byDate = new Map();
  for (const point of Array.isArray(existingSeries) ? existingSeries : []) {
    const date = pointDate(point);
    if (!date || (date >= from && date <= to)) continue;
    byDate.set(date, { ...point, date, label: point.label || date });
  }
  for (const point of Array.isArray(freshSeries) ? freshSeries : []) {
    const date = pointDate(point);
    if (!date || date < from || date > to) continue;
    byDate.set(date, { ...point, date, label: point.label || date });
  }
  return refreshDayOffsets(Array.from(byDate.values()));
}

function articleKey(article) {
  return normalizeText(article?.articleKey || article?.article || article?.sku || article?.id);
}

function mergeArticleWindow(existingArticles, freshArticles, from, to) {
  const byKey = new Map();
  const ensure = (article) => {
    const key = articleKey(article);
    if (!key) return null;
    if (!byKey.has(key)) {
      byKey.set(key, {
        ...cloneJson(article),
        articleKey: key,
        dailyByDate: new Map()
      });
    }
    return byKey.get(key);
  };

  for (const article of Array.isArray(existingArticles) ? existingArticles : []) {
    const target = ensure(article);
    if (!target) continue;
    for (const point of Array.isArray(article.daily) ? article.daily : []) {
      const date = pointDate(point);
      if (!date || (date >= from && date <= to)) continue;
      target.dailyByDate.set(date, { ...point, date, label: point.label || date });
    }
  }

  for (const article of Array.isArray(freshArticles) ? freshArticles : []) {
    const target = ensure(article);
    if (!target) continue;
    Object.assign(target, {
      ...target,
      ...cloneJson(article),
      articleKey: target.articleKey,
      dailyByDate: target.dailyByDate
    });
    for (const point of Array.isArray(article.daily) ? article.daily : []) {
      const date = pointDate(point);
      if (!date || date < from || date > to) continue;
      target.dailyByDate.set(date, { ...point, date, label: point.label || date });
    }
  }

  return Array.from(byKey.values())
    .map((article) => {
      const daily = refreshDayOffsets(Array.from(article.dailyByDate.values()));
      const latestWithPrice = [...daily].reverse().find((point) => numberOrZero(point.price) > 0) || {};
      const { dailyByDate, ...rest } = article;
      return {
        ...rest,
        currentPrice: numberOrZero(rest.currentPrice) || numberOrZero(latestWithPrice.price),
        currentClientPrice: numberOrZero(rest.currentClientPrice) || numberOrZero(latestWithPrice.price),
        currentFillPrice: numberOrZero(rest.currentFillPrice) || numberOrZero(latestWithPrice.price),
        daily
      };
    })
    .filter((article) => article.daily.length)
    .sort((left, right) => articleKey(left).localeCompare(articleKey(right), 'ru'));
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function buildAllSeries(platforms) {
  const byDate = new Map();
  for (const [key, platform] of platforms.entries()) {
    if (key === 'all') continue;
    for (const point of Array.isArray(platform?.series) ? platform.series : []) {
      const date = pointDate(point);
      if (!date) continue;
      const current = byDate.get(date) || {
        date,
        label: date,
        units: 0,
        revenue: 0,
        financeTurnover: 0,
        financialResult: 0,
        estimatedMargin: 0
      };
      current.units += numberOrZero(point.units);
      current.revenue += numberOrZero(point.revenue);
      current.financeTurnover += firstNumber(point.financeTurnover, point.revenue);
      current.financialResult += firstNumber(point.financialResult, point.estimatedMargin);
      current.estimatedMargin += firstNumber(point.financialResult, point.estimatedMargin);
      byDate.set(date, current);
    }
  }
  return refreshDayOffsets(Array.from(byDate.values()).map((point) => ({
    ...point,
    units: Number(point.units.toFixed(4)),
    revenue: Number(point.revenue.toFixed(4)),
    financeTurnover: Number(point.financeTurnover.toFixed(4)),
    financialResult: Number(point.financialResult.toFixed(4)),
    estimatedMargin: Number(point.estimatedMargin.toFixed(4))
  })));
}

function commonBusinessCutoff(summary, requiredPlatforms = BUSINESS_CUTOFF_PLATFORMS) {
  const dates = requiredPlatforms
    .map((key) => isoDate(summary?.[key]?.to))
    .filter(Boolean)
    .sort();
  return dates.length === requiredPlatforms.length ? dates[0] : '';
}

function findPlatform(payload, key) {
  return (Array.isArray(payload?.platforms) ? payload.platforms : [])
    .find((platform) => normalizeText(platform?.key || platform?.platformKey).toLowerCase() === key);
}

function mergePlatformWindow(outputFile, chunkFile, platformKey, from, to) {
  const target = readJson(outputFile, { platforms: [] });
  const source = readJson(chunkFile, { platforms: [] });
  const freshPlatform = findPlatform(source, platformKey);
  if (!freshPlatform) return { merged: false, reason: `${platformKey} platform not found in chunk output` };

  const targetPlatforms = new Map((Array.isArray(target.platforms) ? target.platforms : [])
    .map((platform) => [normalizeText(platform?.key || platform?.platformKey).toLowerCase(), platform])
    .filter(([key]) => key));
  const existingPlatform = targetPlatforms.get(platformKey) || {};
  targetPlatforms.set(platformKey, {
    ...existingPlatform,
    ...freshPlatform,
    key: platformKey,
    series: replaceSeriesWindow(existingPlatform.series, freshPlatform.series, from, to)
  });

  const existingAll = targetPlatforms.get('all') || {};
  targetPlatforms.set('all', {
    ...existingAll,
    key: 'all',
    label: existingAll.label || '\u0412\u0441\u0435 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0438',
    series: buildAllSeries(targetPlatforms)
  });

  const orderedKeys = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'all'];
  const ordered = [
    ...orderedKeys.map((key) => targetPlatforms.get(key)).filter(Boolean),
    ...Array.from(targetPlatforms.entries())
      .filter(([key]) => !orderedKeys.includes(key))
      .map(([, platform]) => platform)
  ];

  const targetExtra = target.extraMarketplace && typeof target.extraMarketplace === 'object' ? target.extraMarketplace : {};
  const targetExtraPlatforms = targetExtra.platforms && typeof targetExtra.platforms === 'object' ? targetExtra.platforms : {};
  const sourceExtraPlatform = source.extraMarketplace?.platforms?.[platformKey] || null;
  const existingExtraPlatform = targetExtraPlatforms[platformKey] || {};
  if (sourceExtraPlatform) {
    targetExtraPlatforms[platformKey] = {
      ...existingExtraPlatform,
      ...sourceExtraPlatform,
      articles: mergeArticleWindow(existingExtraPlatform.articles, sourceExtraPlatform.articles, from, to),
      from: existingExtraPlatform.from && existingExtraPlatform.from < from ? existingExtraPlatform.from : from,
      to: existingExtraPlatform.to && existingExtraPlatform.to > to ? existingExtraPlatform.to : to
    };
  }

  const summary = platformSeriesSummary({ platforms: ordered });
  const businessCutoffDate = commonBusinessCutoff(summary);
  const latestMarketplaceDate = businessCutoffDate || summary.all?.to || target.latestMarketplaceDate || '';
  const next = {
    ...target,
    generatedAt: new Date().toISOString(),
    latestMarketplaceDate,
    businessCutoffDate: latestMarketplaceDate,
    sourceLatestMarketplaceDate: summary.all?.to || target.sourceLatestMarketplaceDate || '',
    platformCutoffDates: Object.fromEntries(BUSINESS_CUTOFF_PLATFORMS.map((key) => [key, summary[key]?.to || ''])),
    platforms: ordered,
    extraMarketplace: {
      ...targetExtra,
      generatedAt: new Date().toISOString(),
      asOfDate: latestMarketplaceDate,
      platforms: targetExtraPlatforms
    }
  };
  writeJson(outputFile, next);
  return { merged: true };
}

function enumerateChunks(from, to, chunkDays) {
  const chunks = [];
  for (let start = from; start <= to;) {
    const end = addDays(start, chunkDays - 1);
    const safeEnd = end > to ? to : end;
    chunks.push({ from: start, to: safeEnd });
    start = addDays(safeEnd, 1);
  }
  return chunks;
}

function applySkippedStep(record, step, context) {
  record.status = context.strict ? 'failed' : 'skipped';
  record.exitCode = context.strict ? 1 : 0;
  record.skippedReason = step.skipReason;
  record.finishedAt = new Date().toISOString();
  if (context.strict) {
    record.error = step.skipReason;
    console.error(`[api-max] blocked ${step.name}: ${step.skipReason}`);
    throw new Error(`${step.name} skipped: ${step.skipReason}`);
  }
  console.log(`[api-max] skipped ${step.name}: ${step.skipReason}`);
  return record;
}

function runNodeStep(step, args, context) {
  const startedAt = new Date().toISOString();
  const record = {
    id: step.id,
    name: step.name,
    status: 'planned',
    startedAt,
    finishedAt: '',
    exitCode: 0,
    skippedReason: ''
  };

  if (step.skipReason) {
    return applySkippedStep(record, step, context);
  }

  console.log(`[api-max] ${step.name} started`);
  console.log(`[api-max] node ${args.join(' ')}`);
  if (context.dryRun) {
    record.status = 'dry-run';
    record.finishedAt = new Date().toISOString();
    return record;
  }

  const result = spawnSync(process.execPath, args, {
    cwd: context.cwd,
    env: context.env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 80
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  record.exitCode = Number(result.status || 0);
  record.finishedAt = new Date().toISOString();
  record.status = record.exitCode === 0 ? 'ok' : 'failed';
  if (result.error) {
    record.status = 'failed';
    record.exitCode = record.exitCode || 1;
    record.error = String(result.error.message || result.error);
  }
  if (record.status === 'failed' && context.strict) {
    throw new Error(`${step.name} failed with exit code ${record.exitCode}`);
  }
  console.log(`[api-max] ${step.name} ${record.status}`);
  return record;
}

function buildSteps(options, env) {
  const steps = [];
  const trendsInput = options.inputFile;
  const trendsOutput = options.outputFile;
  const extraRequested = options.platforms.some((platform) => ['goldapple', 'zya', 'ga', 'letu', 'letual', 'magnit', 'magnitmarket', 'mm'].includes(platform));

  if (options.platforms.includes('wb')) {
    ensureEnv(env, 'ALTEA_WB_API_TOKEN', ['ALTEA_WB_PROMOTION_TOKEN']);
    steps.push({
      id: 'wb',
      name: 'WB API marketplace facts',
      script: 'scripts/portal-wb-orders-trends-sync.js',
      platformKey: 'wb',
      chunked: true,
      extraArgs: ['--partial-refresh-recent-days', '14'],
      skipReason: envValue(env, 'ALTEA_WB_API_TOKEN') ? '' : 'ALTEA_WB_API_TOKEN is missing'
    });
  }

  if (options.platforms.includes('ozon')) {
    ensureEnv(env, 'ALTEA_OZON_CLIENT_ID');
    ensureEnv(env, 'ALTEA_OZON_API_KEY');
    steps.push({
      id: 'ozon',
      name: 'Ozon API marketplace facts',
      script: 'scripts/portal-ozon-finance-trends-sync.js',
      platformKey: 'ozon',
      chunked: true,
      extraArgs: ['--partial-refresh-recent-days', '14'],
      skipReason: envValue(env, 'ALTEA_OZON_CLIENT_ID') && envValue(env, 'ALTEA_OZON_API_KEY')
        ? ''
        : 'ALTEA_OZON_CLIENT_ID / ALTEA_OZON_API_KEY are missing'
    });
  }

  if (options.platforms.includes('ya') || options.platforms.includes('ym') || options.platforms.includes('yandex')) {
    ensureEnv(env, 'ALTEA_YM_API_KEY');
    ensureEnv(env, 'ALTEA_YM_CAMPAIGN_ID');
    ensureEnv(env, 'ALTEA_YM_BUSINESS_ID');
    const hasYmSource = envValue(env, 'ALTEA_YM_API_KEY') || envValue(env, 'ALTEA_YM_SALES_FUNNEL_FILE');
    steps.push({
      id: 'yandex-market',
      name: 'Yandex Market API marketplace facts',
      script: 'scripts/portal-yandex-market-trends-sync.js',
      platformKey: 'ya',
      chunked: true,
      extraArgs: ['--partial-refresh-recent-days', '14'],
      skipReason: hasYmSource ? '' : 'ALTEA_YM_API_KEY or ALTEA_YM_SALES_FUNNEL_FILE is missing'
    });
  }

  if (extraRequested) {
    [
      'ALTEA_ZYA_API_TOKEN',
      'ALTEA_ZYA_API_KEY',
      'ALTEA_ZYA_API_BASE_URL',
      'ALTEA_ZYA_SALES_PATH',
      'ALTEA_ZYA_CLIENT_ID',
      'ALTEA_ZYA_API_METHOD',
      'ALTEA_ZYA_API_BODY_JSON',
      'ALTEA_ZYA_GRAPHQL_QUERY',
      'ALTEA_GOLDAPPLE_API_TOKEN',
      'ALTEA_GOLDAPPLE_API_KEY',
      'ALTEA_GOLDAPPLE_API_BASE_URL',
      'ALTEA_GOLDAPPLE_SALES_PATH',
      'ALTEA_GOLDAPPLE_CLIENT_ID',
      'ALTEA_GOLDAPPLE_API_METHOD',
      'ALTEA_GOLDAPPLE_API_BODY_JSON',
      'ALTEA_GOLDAPPLE_GRAPHQL_QUERY',
      'ALTEA_LETUAL_API_TOKEN',
      'ALTEA_LETUAL_API_BASE_URL',
      'ALTEA_LETUAL_SALES_PATH',
      'ALTEA_LETUAL_CLIENT_ID',
      'ALTEA_LETUAL_API_METHOD',
      'ALTEA_LETUAL_API_BODY_JSON',
      'ALTEA_LETUAL_GRAPHQL_QUERY',
      'ALTEA_MAGNIT_API_TOKEN',
      'ALTEA_MAGNIT_API_KEY',
      'ALTEA_MAGNIT_API_BASE_URL',
      'ALTEA_MAGNIT_SALES_PATH',
      'ALTEA_MAGNIT_CLIENT_ID',
      'ALTEA_MAGNIT_API_METHOD',
      'ALTEA_MAGNIT_API_BODY_JSON',
      'ALTEA_MAGNIT_GRAPHQL_QUERY',
      'ALTEA_MAGNIT_MARKET_API_TOKEN',
      'ALTEA_MAGNIT_MARKET_API_KEY',
      'ALTEA_MAGNIT_MARKET_API_BASE_URL',
      'ALTEA_MAGNIT_MARKET_SALES_PATH',
      'ALTEA_MAGNIT_MARKET_CLIENT_ID',
      'ALTEA_MAGNIT_MARKET_API_METHOD',
      'ALTEA_MAGNIT_MARKET_API_BODY_JSON',
      'ALTEA_MAGNIT_MARKET_GRAPHQL_QUERY',
      'ALTEA_RETAIL_NETWORK_SALES_XLSX'
    ].forEach((name) => ensureEnv(env, name));
    const extraWorkbook = path.join(process.cwd(), '.altea-google-sheet-sync-output', 'api_max_extra_marketplaces.xlsx');
    steps.push({
      id: 'extra-marketplace-workbook',
      name: 'Extra marketplace API workbook build',
      args: [
        'scripts/build-altea-funnel-workbook.js',
        'build',
        '--skip-ozon-api',
        '--skip-wb-funnel',
        '--output',
        extraWorkbook
      ]
    });
    steps.push({
      id: 'extra-marketplace-merge',
      name: 'Extra marketplace API merge',
      args: [
        'scripts/portal-extra-marketplace-trends-sync.js',
        'sync',
        '--workbook',
        extraWorkbook,
        '--base-data-dir',
        options.baseDataDir,
        '--output-dir',
        path.dirname(trendsOutput),
        '--mirror-local-fallback',
        '--ozon-daily-funnel',
        '0'
      ]
    });
  }

  if (options.platforms.includes('magnit') && !options.skipMagnitCsv && !extraRequested) {
    const salesCsv = firstExistingPath([
      envValue(env, 'ALTEA_MAGNIT_SALES_CSV'),
      path.join(options.baseDataDir, 'external_sources', 'magnit_sales.csv'),
      path.join(process.cwd(), '..', 'data', 'external_sources', 'magnit_sales.csv'),
      path.join(process.env.LOCALAPPDATA || '', 'Temp', 'magnit_sales.csv')
    ]);
    const servicesCsv = firstExistingPath([
      envValue(env, 'ALTEA_MAGNIT_SERVICES_CSV'),
      path.join(options.baseDataDir, 'external_sources', 'magnit_services.csv'),
      path.join(process.cwd(), '..', 'data', 'external_sources', 'magnit_services.csv'),
      path.join(process.env.LOCALAPPDATA || '', 'Temp', 'magnit_services.csv')
    ]);
    if (salesCsv) env.ALTEA_MAGNIT_SALES_CSV = salesCsv;
    if (servicesCsv) env.ALTEA_MAGNIT_SERVICES_CSV = servicesCsv;
    steps.push({
      id: 'magnit',
      name: 'Magnit Market daily source normalization',
      args: [
        'scripts/portal-magnit-market-sync.js',
        'sync',
        '--from',
        options.from,
        '--input-file',
        trendsOutput,
        '--output-file',
        trendsOutput,
        '--base-data-dir',
        options.baseDataDir,
        '--raw-output-dir',
        path.join(options.baseDataDir, 'raw'),
        '--mirror-local-fallback',
        '--require-source'
      ],
      skipReason: salesCsv ? '' : 'Magnit API is not configured and ALTEA_MAGNIT_SALES_CSV was not found'
    });
  }

  if (options.platforms.includes('wb') && !options.skipWbAds) {
    ensureEnv(env, 'ALTEA_WB_PROMOTION_TOKEN', ['ALTEA_WB_API_TOKEN']);
    steps.push({
      id: 'wb-ads',
      name: 'WB ads expense facts with channel overrides',
      args: [
        'scripts/portal-wb-ads-sync.js',
        'sync',
        '--from',
        options.from,
        '--to',
        options.to,
        '--input-dir',
        options.baseDataDir,
        '--base-data-dir',
        options.baseDataDir,
        '--output-dir',
        options.baseDataDir,
        '--mirror-local-fallback',
        '--no-external-ads'
      ],
      skipReason: envValue(env, 'ALTEA_WB_PROMOTION_TOKEN') ? '' : 'ALTEA_WB_PROMOTION_TOKEN / ALTEA_WB_API_TOKEN is missing'
    });
  }

  if (options.platforms.includes('ya') || options.platforms.includes('ym') || options.platforms.includes('yandex')) {
    steps.push({
      id: 'yandex-ads-summary',
      name: 'Yandex Market ads summary bridge',
      args: [
        'scripts/portal-yandex-ads-summary-bridge.js',
        'sync',
        '--platform-trends',
        trendsOutput,
        '--ads-summary',
        path.join(options.baseDataDir, 'ads_summary.json'),
        '--output-file',
        path.join(options.baseDataDir, 'ads_summary.json'),
        '--from',
        monthStart(options.to),
        '--to',
        options.to
      ]
    });
  }

  if (!options.skipIuDrr) {
    steps.push({
      id: 'iu-drr',
      name: 'IU/DRR summary rebuild',
      args: [
        'scripts/build-iu-drr-summary.js',
        '--input-dir',
        options.baseDataDir,
        '--base-data-dir',
        options.baseDataDir,
        '--output-dir',
        options.baseDataDir,
        '--from',
        monthStart(options.to),
        '--to',
        options.to,
        '--mirror-local-fallback'
      ]
    });
  }

  if (!options.skipHealth) {
    steps.push({
      id: 'sync-health',
      name: 'Portal sync health after API max sync',
      args: [
        'scripts/portal-sync-health.js',
        '--input-dir',
        options.baseDataDir,
        '--base-data-dir',
        options.baseDataDir,
        '--output-dir',
        options.baseDataDir,
        '--mirror-local-fallback'
      ]
    });
  }

  if (!options.skipDataGuard) {
    steps.push({
      id: 'data-guard',
      name: 'Portal data guard audit after API max sync',
      args: ['scripts/portal-data-guard-audit.js', '--write']
    });
  }

  return steps;
}

function stepAuditSummary(steps) {
  const apiStepIds = new Set([
    'wb',
    'ozon',
    'yandex-market',
    'extra-marketplace-workbook',
    'extra-marketplace-merge',
    'magnit',
    'wb-ads',
    'yandex-ads-summary'
  ]);
  return steps
    .filter((step) => apiStepIds.has(step.id))
    .map((step) => ({
      id: step.id,
      name: step.name,
      configured: !step.skipReason,
      skippedReason: step.skipReason || ''
    }));
}

function configuredApiNames(summary) {
  return summary
    .filter((item) => item.configured)
    .map((item) => item.id);
}

async function emitApiAudit(eventType, payload) {
  try {
    return await emitSecurityAudit({
      eventType,
      source: 'portal-api-max-sync',
      targetType: 'marketplace_api',
      ...payload
    });
  } catch (error) {
    console.warn(`[api-max] security audit skipped: ${error?.message || String(error)}`);
    return null;
  }
}

function windowStepArgs(step, from, to, inputFile, outputFile) {
  return [
    step.script,
    'sync',
    '--from',
    from,
    '--to',
    to,
    '--input-file',
    inputFile,
    '--output-file',
    outputFile,
    ...(step.extraArgs || [])
  ];
}

function runChunkedPlatformStep(step, options, context) {
  const startedAt = new Date().toISOString();
  const record = {
    id: step.id,
    name: step.name,
    status: 'planned',
    startedAt,
    finishedAt: '',
    exitCode: 0,
    skippedReason: '',
    chunkDays: options.chunkDays,
    chunks: []
  };

  if (step.skipReason) {
    return applySkippedStep(record, step, context);
  }

  const chunks = enumerateChunks(options.from, options.to, options.chunkDays);
  console.log(`[api-max] ${step.name}: ${chunks.length} chunks x ${options.chunkDays} days`);
  if (context.dryRun) {
    for (const chunk of chunks) {
      console.log(`[api-max] dry chunk ${step.id} ${chunk.from}..${chunk.to}`);
    }
    record.status = 'dry-run';
    record.finishedAt = new Date().toISOString();
    record.chunks = chunks.map((chunk) => ({ ...chunk, status: 'dry-run' }));
    return record;
  }

  fs.mkdirSync(options.tempDir, { recursive: true });
  const seedPayload = readJson(options.outputFile, readJson(options.inputFile, { platforms: [] }));
  if (!fs.existsSync(options.outputFile)) writeJson(options.outputFile, seedPayload);

  for (const chunk of chunks) {
    const chunkFile = path.join(options.tempDir, `${step.id}-${chunk.from}-${chunk.to}.json`);
    writeJson(chunkFile, readJson(options.outputFile, seedPayload));
    const childRecord = runNodeStep(
      {
        id: `${step.id}:${chunk.from}:${chunk.to}`,
        name: `${step.name} ${chunk.from}..${chunk.to}`
      },
      windowStepArgs(step, chunk.from, chunk.to, chunkFile, chunkFile),
      context
    );
    const chunkRecord = {
      from: chunk.from,
      to: chunk.to,
      status: childRecord.status,
      exitCode: childRecord.exitCode
    };
    if (childRecord.status === 'ok') {
      chunkRecord.merge = mergePlatformWindow(options.outputFile, chunkFile, step.platformKey, chunk.from, chunk.to);
    }
    record.chunks.push(chunkRecord);
    if (childRecord.status === 'failed') {
      record.status = 'failed';
      record.exitCode = childRecord.exitCode || 1;
      if (context.strict) break;
    }
  }

  if (record.status !== 'failed') {
    record.status = record.chunks.some((chunk) => chunk.status === 'failed') ? 'failed' : 'ok';
    record.exitCode = record.status === 'ok' ? 0 : 1;
  }
  record.finishedAt = new Date().toISOString();
  if (record.status === 'failed' && context.strict) {
    throw new Error(`${step.name} failed during chunked sync`);
  }
  console.log(`[api-max] ${step.name} ${record.status}`);
  return record;
}

async function main() {
  const parsedArgs = parseArgs(process.argv);
  const options = resolveOptions(parsedArgs);
  if (parsedArgs.skipProtectedScope) options.skipIuDrr = true;
  if (options.command !== 'sync') throw new Error(`Unsupported command: ${options.command}`);
  if (!options.from || !options.to || options.from > options.to) {
    throw new Error(`Invalid API window: ${options.from || '?'}..${options.to || '?'}`);
  }

  const env = { ...process.env };
  const context = {
    cwd: process.cwd(),
    env,
    dryRun: options.dryRun,
    strict: options.strict
  };
  const steps = buildSteps(options, env);
  const apiSummary = stepAuditSummary(steps);
  const configuredApis = configuredApiNames(apiSummary);
  const startedAt = new Date().toISOString();
  console.log(`[api-max] window ${options.from}..${options.to}; mode=${options.mode}; platforms=${options.platforms.join(',')}`);
  await emitApiAudit('api_connected', {
    outcome: configuredApis.length ? 'ok' : 'warning',
    severity: configuredApis.length ? 'notice' : 'warning',
    targetName: configuredApis.join(',') || 'none',
    metadata: {
      mode: options.mode,
      window: { from: options.from, to: options.to },
      requestedPlatforms: options.platforms,
      configuredApis: apiSummary,
      dryRun: options.dryRun
    }
  });

  const records = [];
  let manifest;
  try {
    for (const step of steps) {
      records.push(step.chunked
        ? runChunkedPlatformStep(step, options, context)
        : runNodeStep(step, step.args, context));
    }
  } catch (error) {
    await emitApiAudit('api_sync_finished', {
      outcome: 'failure',
      severity: 'error',
      targetName: configuredApis.join(',') || 'none',
      metadata: {
        mode: options.mode,
        window: { from: options.from, to: options.to },
        requestedPlatforms: options.platforms,
        configuredApis: apiSummary,
        records,
        error: error?.message || String(error),
        dryRun: options.dryRun
      }
    });
    throw error;
  }

  const platformTrends = readJson(options.outputFile, {});
  manifest = {
    schema: 'portal-api-max-sync-v1',
    generatedAt: new Date().toISOString(),
    startedAt,
    mode: options.mode,
    window: {
      from: options.from,
      to: options.to
    },
    platforms: options.platforms,
    dryRun: options.dryRun,
    strict: options.strict,
    status: records.some((item) => item.status === 'failed') ? 'failed' : 'ok',
    steps: records,
    platformSummary: platformSeriesSummary(platformTrends)
  };
  if (!options.dryRun) writeJson(options.manifestFile, manifest);
  console.log(JSON.stringify(manifest, null, 2));
  await emitApiAudit('api_sync_finished', {
    outcome: manifest.status === 'ok' ? 'ok' : 'failure',
    severity: manifest.status === 'ok' ? 'notice' : 'error',
    targetName: configuredApis.join(',') || 'none',
    metadata: {
      mode: options.mode,
      window: manifest.window,
      requestedPlatforms: options.platforms,
      configuredApis: apiSummary,
      status: manifest.status,
      dryRun: options.dryRun,
      stepStatuses: records.map((record) => ({
        id: record.id,
        status: record.status,
        exitCode: record.exitCode || 0,
        skippedReason: record.skippedReason || ''
      }))
    }
  });
  if (manifest.status !== 'ok' && options.strict) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  commonBusinessCutoff,
  platformSeriesSummary
};
