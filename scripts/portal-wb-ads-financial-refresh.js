const fs = require('fs');
const path = require('path');

const WB_API_BASE_URL = 'https://advert-api.wildberries.ru';
const FINANCIAL_REFRESH_SOURCE = 'wb-upd-financial-refresh';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const [rawKey, inlineValue] = String(token).split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const value = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = value;
  }
  return args;
}

function isoDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(from, to) {
  const result = [];
  let cursor = isoDate(from);
  const end = isoDate(to);
  while (cursor && end && cursor <= end) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function sleep(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

async function wbRequest(options, apiPath, query) {
  const url = new URL(`${options.apiBaseUrl}${apiPath}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: options.token,
        'Content-Type': 'application/json; charset=utf-8'
      },
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status} ${text.slice(0, 500)}`);
    return text.trim() ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFinancialRows(options) {
  const rows = [];
  const diagnostics = { requests: 0, rows: 0, spend: 0, byDate: [], warnings: [] };
  const dates = enumerateDates(options.from, options.to);
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];
    try {
      const payload = await wbRequest(options, '/adv/v1/upd', { from: date, to: date });
      const dayRows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      let spend = 0;
      for (const row of dayRows) {
        const value = numberOrZero(row.updSum ?? row.sum ?? row.spend ?? row.cost ?? row.amount);
        if (value <= 0) continue;
        rows.push({
          reportDate: date,
          advertId: row.advertId || row.advert_id || row.id || '',
          campName: row.campName || row.name || row.advertName || '',
          advertType: row.advertType || row.type || '',
          spend: value
        });
        spend += value;
      }
      diagnostics.requests += 1;
      diagnostics.rows += dayRows.length;
      diagnostics.spend += spend;
      diagnostics.byDate.push({ date, rows: dayRows.length, spend: roundMoney(spend) });
      process.stderr.write(`[wb-financial-refresh] ${date}: ${dayRows.length} rows, ${roundMoney(spend)} RUB\n`);
    } catch (error) {
      diagnostics.warnings.push(`${date}: ${error.message}`);
    }
    if (index < dates.length - 1) await sleep(options.delayMs);
  }
  diagnostics.spend = roundMoney(diagnostics.spend);
  return { rows, diagnostics };
}

function normalizePlatformKey(value) {
  return String(value || '').trim().toLowerCase();
}

function summarizeItemSeries(itemSeries, platformKey) {
  const byDate = new Map();
  for (const row of itemSeries) {
    if (platformKey && normalizePlatformKey(row.platformKey || row.platform) !== platformKey) continue;
    const date = isoDate(row.date || row.day || row.label);
    if (!date) continue;
    const current = byDate.get(date) || { date, label: date, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 };
    current.views += numberOrZero(row.views);
    current.clicks += numberOrZero(row.clicks);
    current.spend += numberOrZero(row.spend);
    current.orders += numberOrZero(row.orders);
    current.revenue += numberOrZero(row.revenue);
    byDate.set(date, current);
  }
  return [...byDate.values()]
    .filter((row) => row.views || row.clicks || row.spend || row.orders || row.revenue)
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row, index, arr) => ({
      dayOffset: arr.length - index - 1,
      label: row.date,
      date: row.date,
      views: Math.round(row.views),
      clicks: Math.round(row.clicks),
      spend: roundMoney(row.spend),
      orders: Math.round(row.orders),
      revenue: roundMoney(row.revenue)
    }));
}

function totalsFromSeries(series) {
  return series.reduce((acc, row) => {
    acc.views += numberOrZero(row.views);
    acc.clicks += numberOrZero(row.clicks);
    acc.spend += numberOrZero(row.spend);
    acc.orders += numberOrZero(row.orders);
    acc.revenue += numberOrZero(row.revenue);
    return acc;
  }, { views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 });
}

function buildAllSeries(platforms) {
  const byDate = new Map();
  for (const platform of platforms) {
    if (normalizePlatformKey(platform.key || platform.platformKey) === 'all') continue;
    for (const point of Array.isArray(platform.series) ? platform.series : []) {
      const date = isoDate(point.date || point.label);
      if (!date) continue;
      const current = byDate.get(date) || { date, label: date, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 };
      current.views += numberOrZero(point.views);
      current.clicks += numberOrZero(point.clicks);
      current.spend += numberOrZero(point.spend);
      current.orders += numberOrZero(point.orders);
      current.revenue += numberOrZero(point.revenue);
      byDate.set(date, current);
    }
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)).map((row) => ({
    ...row,
    spend: roundMoney(row.spend),
    revenue: roundMoney(row.revenue)
  }));
}

function latestDateFromPlatforms(platforms) {
  let latest = '';
  for (const platform of platforms) {
    for (const point of Array.isArray(platform.series) ? platform.series : []) {
      const date = isoDate(point.date || point.label);
      if (date > latest) latest = date;
    }
  }
  return latest;
}

function isExternalAdsRow(row) {
  const campaignId = String(row?.campaignId || '');
  const source = String(row?.source || '').toLowerCase();
  const channel = String(row?.channel || '').toLowerCase();
  return campaignId.startsWith('external-sheet')
    || source.includes('external')
    || channel.includes('external');
}

function applyFinancialRows(payload, financialRows, diagnostics, options) {
  const scopedDates = new Set(enumerateDates(options.from, options.to));
  const baseItemSeries = (Array.isArray(payload.itemSeries) ? payload.itemSeries : []).filter((row) => {
    if (row.source !== FINANCIAL_REFRESH_SOURCE) return true;
    const date = isoDate(row.date);
    return !scopedDates.has(date);
  });

  const currentSpendByDate = new Map();
  for (const row of baseItemSeries) {
    if (normalizePlatformKey(row.platformKey || row.platform) !== 'wb') continue;
    if (isExternalAdsRow(row)) continue;
    const date = isoDate(row.date || row.day || row.label);
    if (!date || !scopedDates.has(date)) continue;
    currentSpendByDate.set(date, (currentSpendByDate.get(date) || 0) + numberOrZero(row.spend));
  }

  const financialSpendByDate = new Map();
  for (const row of financialRows) {
    const date = isoDate(row.reportDate);
    if (!date) continue;
    financialSpendByDate.set(date, (financialSpendByDate.get(date) || 0) + numberOrZero(row.spend));
  }

  const adjustmentRows = [];
  for (const date of [...financialSpendByDate.keys()].sort()) {
    const currentSpend = currentSpendByDate.get(date) || 0;
    const financialSpend = financialSpendByDate.get(date) || 0;
    const gap = roundMoney(financialSpend - currentSpend);
    if (gap <= 1) continue;
    adjustmentRows.push({
      date,
      platformKey: 'wb',
      articleKey: `wb-financial-refresh-${date}`,
      article: `WB financial refresh ${date}`,
      name: `WB financial refresh ${date}`,
      owner: '',
      views: 0,
      clicks: 0,
      spend: gap,
      orders: 0,
      revenue: 0,
      campaignId: `upd-financial-refresh-${date}`,
      campaignName: `WB financial refresh ${date}`,
      channel: 'WB Promotion',
      nmId: '',
      source: FINANCIAL_REFRESH_SOURCE
    });
  }

  payload.itemSeries = [...baseItemSeries, ...adjustmentRows].sort((left, right) =>
    String(left.date || '').localeCompare(String(right.date || '')) || numberOrZero(right.spend) - numberOrZero(left.spend)
  );

  const platforms = Array.isArray(payload.platforms) ? payload.platforms : [];
  const platformMap = new Map(platforms.map((platform) => [normalizePlatformKey(platform.key || platform.platformKey), { ...platform }]));
  const wbSeries = summarizeItemSeries(payload.itemSeries, 'wb');
  const wbTotals = totalsFromSeries(wbSeries);
  const wbTemplate = platformMap.get('wb') || { key: 'wb', platformKey: 'wb', label: 'WB' };
  platformMap.set('wb', { ...wbTemplate, key: 'wb', platformKey: 'wb', label: wbTemplate.label || 'WB', ...wbTotals, series: wbSeries });

  const nonAllPlatforms = [...platformMap.entries()].filter(([key]) => key && key !== 'all').map(([, platform]) => platform);
  const allSeries = buildAllSeries(nonAllPlatforms);
  const allTotals = totalsFromSeries(allSeries);
  const allTemplate = platformMap.get('all') || { key: 'all', platformKey: 'all', label: 'All platforms' };
  platformMap.set('all', { ...allTemplate, key: 'all', platformKey: 'all', label: allTemplate.label || 'All platforms', ...allTotals, series: allSeries });

  payload.platforms = [...nonAllPlatforms, platformMap.get('all')];
  payload.asOfDate = latestDateFromPlatforms(payload.platforms) || payload.asOfDate || options.to;
  payload.generatedAt = new Date().toISOString();
  payload.sourceMode = payload.sourceMode || 'wb-api+external-sheet';
  payload.source = payload.source || 'wb-api+external-sheet';
  payload.diagnostics = {
    ...(payload.diagnostics || {}),
    sourceWindow: {
      from: payload.diagnostics?.sourceWindow?.from || options.from,
      to: [payload.diagnostics?.sourceWindow?.to, options.to].filter(Boolean).sort().pop()
    },
    financialRefresh: {
      generatedAt: payload.generatedAt,
      source: '/adv/v1/upd',
      stampedByReportDate: true,
      from: options.from,
      to: options.to,
      requests: diagnostics.requests,
      rows: diagnostics.rows,
      spend: diagnostics.spend,
      byDate: diagnostics.byDate,
      warnings: diagnostics.warnings,
      adjustmentRows: adjustmentRows.length,
      adjustmentSpend: roundMoney(adjustmentRows.reduce((sum, row) => sum + row.spend, 0))
    }
  };
  return { payload, adjustmentRows };
}

async function main() {
  const args = parseArgs(process.argv);
  const outputDir = args['output-dir'] || 'data';
  const inputFile = args.input || path.join(outputDir, 'ads_summary.json');
  const outputFile = args.output || inputFile;
  const options = {
    apiBaseUrl: String(args['api-base-url'] || process.env.ALTEA_WB_PROMOTION_API_BASE_URL || WB_API_BASE_URL).replace(/\/+$/, ''),
    token: args.token || process.env.ALTEA_WB_PROMOTION_TOKEN || process.env.ALTEA_WB_API_TOKEN || '',
    from: isoDate(args.from || args['date-from']),
    to: isoDate(args.to || args['date-to'] || args.from || args['date-from']),
    delayMs: Number.isFinite(Number(args['delay-ms'])) ? Number(args['delay-ms']) : 500,
    timeoutMs: Number.isFinite(Number(args['timeout-ms'])) ? Number(args['timeout-ms']) : 60000
  };
  if (!options.token) throw new Error('ALTEA_WB_PROMOTION_TOKEN is not set.');
  if (!options.from || !options.to) throw new Error('Pass --from YYYY-MM-DD and --to YYYY-MM-DD.');

  const payload = readJson(inputFile, null);
  if (!payload) throw new Error(`Cannot read ${inputFile}`);
  const { rows, diagnostics } = await fetchFinancialRows(options);
  const result = applyFinancialRows(payload, rows, diagnostics, options);
  writeJson(outputFile, result.payload);
  console.log(JSON.stringify({
    inputFile,
    outputFile,
    asOfDate: result.payload.asOfDate,
    fetchedSpend: diagnostics.spend,
    adjustmentRows: result.adjustmentRows.length,
    adjustmentSpend: roundMoney(result.adjustmentRows.reduce((sum, row) => sum + row.spend, 0))
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
