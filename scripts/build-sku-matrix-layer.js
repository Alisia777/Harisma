#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const hasValue = inlineValue !== undefined || (argv[index + 1] && !String(argv[index + 1]).startsWith('--'));
    if (!hasValue) {
      args[key] = true;
      continue;
    }
    args[key] = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return args;
}

function resolveOptions(args) {
  const root = process.cwd();
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    mirrorLocalFallback: Boolean(args['mirror-local-fallback'])
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readSnapshot(options, name, fallback = null) {
  return readJsonIfExists(path.join(options.inputDir, `${name}.json`))
    ?? readJsonIfExists(path.join(options.baseDataDir, `${name}.json`))
    ?? fallback;
}

function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

function platformKey(value = '') {
  const raw = normalizeToken(value);
  if (!raw || raw === 'all' || raw === 'все') return 'all';
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['oz', 'ozon'].includes(raw)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'yandexmarket', 'ямаркет'].includes(raw)) return 'ya';
  if (['ga', 'goldapple', 'зя', 'золотоеяблоко'].includes(raw)) return 'goldapple';
  if (['letu', 'letual', 'летуаль'].includes(raw)) return 'letu';
  if (['mm', 'magnit', 'magnitmarket', 'магнитмаркет'].includes(raw)) return 'magnit';
  return raw;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function ownerText(sku = {}) {
  if (typeof sku.owner === 'string') return sku.owner.trim();
  const directOwner = String(sku.owner?.name || '').trim();
  if (directOwner) return directOwner;
  const byPlatform = sku.owner?.byPlatform && typeof sku.owner.byPlatform === 'object' ? sku.owner.byPlatform : {};
  const platformOrder = ['wb', 'ozon', 'ym', 'ya', 'ga', 'goldapple', 'letu', 'mm', 'magnit'];
  for (const platform of platformOrder) {
    const platformOwner = String(byPlatform[platform] || '').trim();
    if (platformOwner) return platformOwner;
  }
  return Object.values(byPlatform).map((value) => String(value || '').trim()).find(Boolean) || '';
}

function skuTokens(sku = {}) {
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.nmId,
    sku.nmID,
    sku.barcode
  ];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') values.push(alias);
      else values.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.vendorCode, alias?.nmId);
    });
  }
  Object.values(sku.platformAliases || {}).forEach((aliases) => {
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });
  return values.map(normalizeToken).filter(Boolean);
}

function buildSkuLookup(skus = []) {
  const lookup = new Map();
  skus.forEach((sku) => {
    skuTokens(sku).forEach((token) => {
      if (token && !lookup.has(token)) lookup.set(token, sku);
    });
  });
  return lookup;
}

function aliasRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.aliases) ? payload.aliases : [];
}

function ignoreRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.ignored)) return payload.ignored;
  if (Array.isArray(payload.ignores)) return payload.ignores;
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function activeIgnoreRows(payload = {}) {
  return ignoreRows(payload).filter((row) => {
    const status = normalizeToken(row?.status ?? row?.active ?? 'active');
    return !['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove'].includes(status);
  });
}

function aliasKey(platform = '', apiSku = '') {
  return `${platformKey(platform) || 'all'}|${normalizeToken(apiSku)}`;
}

function issuesByArticle(quality = {}) {
  const map = new Map();
  (quality.issues || []).forEach((issue) => {
    const token = normalizeToken(issue.articleKey || issue.article || '');
    if (!token) return;
    if (!map.has(token)) map.set(token, []);
    map.get(token).push({
      severity: issue.severity || '',
      type: issue.type || '',
      platform: issue.platform || '',
      revenue: Math.round(numberOrZero(issue.revenue)),
      units: Math.round(numberOrZero(issue.units)),
      message: issue.message || issue.action || ''
    });
  });
  return map;
}

const PROBLEM_STATE_META = {
  ok: { label: '\u0412 \u043c\u0430\u0442\u0440\u0438\u0446\u0435', tone: 'ok' },
  missing_owner: { label: '\u041d\u0435\u0442 owner', tone: 'warn' },
  has_critical_issue: { label: '\u0415\u0441\u0442\u044c \u043a\u0440\u0438\u0442\u0438\u0447\u043d\u0430\u044f \u043e\u0448\u0438\u0431\u043a\u0430', tone: 'danger' },
  has_warning: { label: '\u0415\u0441\u0442\u044c \u0437\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u0435', tone: 'warn' },
  api_unmapped: { label: 'API SKU \u0431\u0435\u0437 \u043f\u0430\u0440\u044b', tone: 'danger' },
  ignored: { label: 'API SKU \u0432 ignore', tone: '' },
  duplicate_risk: { label: '\u0420\u0438\u0441\u043a \u0434\u0443\u0431\u043b\u044f \u0432\u044b\u0440\u0443\u0447\u043a\u0438', tone: 'danger' }
};

function isMissingOwnerText(owner = '') {
  const raw = String(owner || '').trim().toLowerCase();
  return !raw
    || raw === 'без owner'
    || raw === 'р‘рµр· owner'
    || raw === 'не в реестре'
    || raw === 'рќрµ рІ сЂрµрµсЃс‚сЂрµ';
}

function problemStatesForItem(owner = '', issues = []) {
  const states = [];
  if (isMissingOwnerText(owner)) states.push('missing_owner');
  if (issues.some((issue) => issue.severity === 'critical' || issue.severity === 'danger')) {
    states.push('has_critical_issue');
  } else if (issues.length) {
    states.push('has_warning');
  }
  return states.length ? states : ['ok'];
}

function summarizeProblemStates(items = [], apiUnmapped = [], ignored = [], duplicateRisks = []) {
  const counts = {};
  const bump = (state) => { counts[state] = (counts[state] || 0) + 1; };
  items.forEach((item) => (item.problemStates || ['ok']).forEach(bump));
  if (apiUnmapped.length) bump('api_unmapped');
  if (ignored.length) bump('ignored');
  if (duplicateRisks.length) bump('duplicate_risk');
  return counts;
}

function buildMatrix(options) {
  const skus = readSnapshot(options, 'skus', []);
  const aliases = aliasRows(readSnapshot(options, 'sku_aliases', { aliases: [] }));
  const ignored = activeIgnoreRows(readSnapshot(options, 'sku_alias_ignore', { ignored: [] }));
  const quality = readSnapshot(options, 'portal_data_quality', { issues: [], summary: {} });
  const skuLookup = buildSkuLookup(Array.isArray(skus) ? skus : []);
  const qualityByArticle = issuesByArticle(quality);
  const aliasesByTarget = new Map();
  const aliasToArticleKey = {};

  aliases.forEach((alias) => {
    const targetToken = normalizeToken(alias.target_sku || alias.targetSku || alias.target || '');
    const apiToken = normalizeToken(alias.api_sku || alias.apiSku || alias.alias || alias.value || '');
    if (!targetToken || !apiToken) return;
    const target = skuLookup.get(targetToken);
    const articleKey = target?.articleKey || target?.article || alias.target_sku || '';
    if (!articleKey) return;
    if (!aliasesByTarget.has(articleKey)) aliasesByTarget.set(articleKey, []);
    const platform = platformKey(alias.platform || 'all') || 'all';
    const row = {
      platform,
      api_sku: alias.api_sku || alias.apiSku || alias.alias || alias.value || '',
      status: alias.status || 'active',
      note: alias.note || '',
      source: alias.source || 'sku_aliases'
    };
    aliasesByTarget.get(articleKey).push(row);
    aliasToArticleKey[aliasKey(platform, row.api_sku)] = articleKey;
  });

  const items = (Array.isArray(skus) ? skus : []).map((sku) => {
    const articleKey = sku.articleKey || sku.article || '';
    const issues = qualityByArticle.get(normalizeToken(articleKey)) || [];
    const owner = ownerText(sku);
    const problemStates = problemStatesForItem(owner, issues);
    return {
      articleKey,
      article: sku.article || articleKey,
      name: sku.name || '',
      owner,
      status: sku.status || sku.registryStatus || '',
      registryStatus: sku.registryStatus || sku.status || '',
      brand: sku.brand || '',
      category: sku.category || '',
      type: sku.type || '',
      aliases: aliasesByTarget.get(articleKey) || [],
      problemStates,
      problemState: problemStates[0] || 'ok',
      problemLabel: PROBLEM_STATE_META[problemStates[0]]?.label || '',
      problemTone: PROBLEM_STATE_META[problemStates[0]]?.tone || '',
      issueCount: issues.length,
      criticalIssueCount: issues.filter((issue) => issue.severity === 'critical' || issue.severity === 'danger').length,
      issues: issues.slice(0, 20)
    };
  });

  const byArticleKey = {};
  items.forEach((item, index) => { if (item.articleKey) byArticleKey[item.articleKey] = index; });

  const apiUnmapped = (quality.issues || [])
    .filter((issue) => issue.type === 'api_sku_unmapped')
    .map((issue) => ({
      platform: platformKey(issue.platform || '') || issue.platform || '',
      api_sku: issue.articleKey || '',
      name: issue.name || '',
      revenue: Math.round(numberOrZero(issue.revenue)),
      units: Math.round(numberOrZero(issue.units)),
      firstDate: issue.firstDate || '',
      lastDate: issue.lastDate || ''
    }));

  const duplicateRisks = (quality.issues || [])
    .filter((issue) => issue.type === 'api_sum_above_aggregate')
    .map((issue) => ({
      platform: platformKey(issue.platform || '') || issue.platform || '',
      platformLabel: issue.platformLabel || issue.platform || '',
      revenue: Math.round(numberOrZero(issue.revenue)),
      aggregateRevenue: Math.round(numberOrZero(issue.aggregateRevenue)),
      overage: Math.round(numberOrZero(issue.overage)),
      message: issue.message || ''
    }));

  return {
    schema: 'portal-sku-matrix-v1',
    generatedAt: new Date().toISOString(),
    source: {
      skus: Array.isArray(skus) ? skus.length : 0,
      aliases: aliases.length,
      ignored: ignored.length,
      dataQualityGeneratedAt: quality.generatedAt || ''
    },
    summary: {
      skuCount: items.length,
      activeSkuCount: items.filter((item) => !/вывод|inactive|disabled/i.test(item.status || item.registryStatus || '')).length,
      aliasCount: aliases.length,
      ignoredApiSkuCount: ignored.length,
      apiUnmappedCount: apiUnmapped.length,
      duplicateRiskCount: duplicateRisks.length,
      duplicateRiskOverage: duplicateRisks.reduce((sum, item) => sum + numberOrZero(item.overage), 0),
      missingOwnerCount: items.filter((item) => isMissingOwnerText(item.owner)).length,
      issueCount: numberOrZero(quality.summary?.issueCount),
      problemStateCounts: summarizeProblemStates(items, apiUnmapped, ignored, duplicateRisks)
    },
    problemStates: PROBLEM_STATE_META,
    items,
    apiUnmapped,
    duplicateRisks,
    ignoredApiSku: ignored.map((row) => ({
      platform: platformKey(row.platform || 'all') || 'all',
      api_sku: row.api_sku || row.apiSku || row.alias || row.value || '',
      status: row.status || 'ignored',
      note: row.note || ''
    })),
    indexes: {
      byArticleKey,
      aliasToArticleKey
    }
  };
}

function writeMatrix(options, matrix) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const outputPath = path.join(options.outputDir, 'sku_matrix.json');
  fs.writeFileSync(outputPath, JSON.stringify(matrix, null, 2), 'utf8');
  const mirrored = [];
  if (options.mirrorLocalFallback) {
    fs.mkdirSync(options.baseDataDir, { recursive: true });
    const mirrorPath = path.join(options.baseDataDir, 'sku_matrix.json');
    fs.copyFileSync(outputPath, mirrorPath);
    mirrored.push(mirrorPath);
  }
  return { outputPath, mirrored };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const matrix = buildMatrix(options);
  const output = writeMatrix(options, matrix);
  console.log(JSON.stringify({ summary: matrix.summary, output }, null, 2));
}

main();
