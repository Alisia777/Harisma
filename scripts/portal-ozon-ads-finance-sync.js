#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OZON_API_BASE_URL = 'https://api-seller.ozon.ru';
const OZON_AD_OPERATION_TYPES = new Set([
  'OperationMarketplaceCostPerClick',
  'OperationPromotionWithCostPerOrder',
  'OperationMarketplaceInternetSiteAdvertising'
]);

function parseArgs(argv) {
  const args = { command: 'sync' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--') && index === 2) {
      args.command = token;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function isoDate(value) {
  const raw = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(from, to) {
  const result = [];
  for (let cursor = from; cursor && to && cursor <= to; cursor = addDays(cursor, 1)) {
    result.push(cursor);
  }
  return result;
}

function latestSeriesDate(platforms) {
  const dates = [];
  for (const platform of Array.isArray(platforms) ? platforms : []) {
    for (const point of Array.isArray(platform?.series) ? platform.series : []) {
      const date = isoDate(point?.date || point?.label);
      if (date) dates.push(date);
    }
  }
  return dates.sort().pop() || '';
}

function mergeSourceMode(existing, addition) {
  const parts = String(existing || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (addition && !parts.includes(addition)) parts.push(addition);
  return parts.join('+') || addition || '';
}

function operationTypesFromEnv() {
  const raw = String(process.env.ALTEA_OZON_AD_OPERATION_TYPES || '').trim();
  if (!raw) return OZON_AD_OPERATION_TYPES;
  return new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
}

function resolveOptions(args, payload) {
  const root = process.cwd();
  const inputPath = path.resolve(args.input || args['input-file'] || path.join(root, 'data', 'ads_summary.json'));
  const outputPath = path.resolve(args.output || args['output-file'] || inputPath);
  const mirrorPath = args['mirror-file'] ? path.resolve(args['mirror-file']) : '';
  const fallbackTo = isoDate(payload?.window?.to || payload?.asOfDate) || new Date().toISOString().slice(0, 10);
  const from = isoDate(args.from || args['date-from'] || payload?.window?.from || `${fallbackTo.slice(0, 7)}-01`);
  const to = isoDate(args.to || args['date-to'] || fallbackTo);
  return {
    command: args.command || 'sync',
    dryRun: Boolean(args.dryRun),
    inputPath,
    outputPath,
    mirrorPath,
    from,
    to,
    clientId: String(args['client-id'] || process.env.ALTEA_OZON_CLIENT_ID || '').trim(),
    apiKey: String(args['api-key'] || process.env.ALTEA_OZON_API_KEY || '').trim(),
    apiBaseUrl: String(args['api-base-url'] || process.env.ALTEA_OZON_API_BASE_URL || OZON_API_BASE_URL).replace(/\/+$/, ''),
    operationTypes: operationTypesFromEnv()
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ozonRequest(options, body, attempt = 0) {
  const response = await fetch(`${options.apiBaseUrl}/v3/finance/transaction/list`, {
    method: 'POST',
    headers: {
      'Client-Id': options.clientId,
      'Api-Key': options.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await sleep((attempt + 1) * 2500);
      return ozonRequest(options, body, attempt + 1);
    }
    throw new Error(`Ozon finance API failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function fetchFinanceDay(options, dateKey) {
  const nextDate = addDays(dateKey, 1);
  const baseFilter = {
    date: {
      from: `${dateKey}T00:00:00.000Z`,
      to: `${nextDate}T00:00:00.000Z`
    },
    operation_type: [],
    transaction_type: 'all'
  };
  const pageSize = 1000;
  const operations = [];
  let pageCount = 1;

  for (let page = 1; page <= pageCount; page += 1) {
    const payload = await ozonRequest(options, {
      filter: baseFilter,
      page,
      page_size: pageSize
    });
    const result = payload?.result || {};
    pageCount = Math.max(1, Number(result.page_count) || 1);
    operations.push(...(Array.isArray(result.operations) ? result.operations : []));
  }

  const byType = {};
  let spend = 0;
  let rows = 0;
  for (const operation of operations) {
    const type = String(operation?.operation_type || '').trim();
    if (!options.operationTypes.has(type)) continue;
    const amount = Math.abs(numberOrZero(operation.amount));
    spend += amount;
    rows += 1;
    byType[type] = roundMoney(numberOrZero(byType[type]) + amount);
  }

  return {
    date: dateKey,
    spend: roundMoney(spend),
    sourceRows: rows,
    sourceOperations: operations.length,
    breakdown: byType
  };
}

function dateInWindow(date, from, to) {
  const dateKey = isoDate(date);
  if (!dateKey) return false;
  return (!from || dateKey >= from) && (!to || dateKey <= to);
}

function buildOzonFinanceRows(daily) {
  return daily.map((day) => ({
    date: day.date,
    platformKey: 'ozon',
    articleKey: 'ozon-finance-ads-total',
    article: 'Ozon ads finance total',
    name: 'Ozon Seller Finance API advertising operations',
    views: 0,
    clicks: 0,
    spend: day.spend,
    orders: 0,
    revenue: 0,
    campaignId: 'ozon-seller-finance-api',
    campaignName: 'Ozon Seller Finance API advertising operations',
    channel: 'ozon_ads_finance',
    source: 'Ozon Seller API /v3/finance/transaction/list',
    sourceMode: 'ozon_seller_finance_api',
    sourceRows: day.sourceRows,
    sourceOperations: day.sourceOperations,
    operationBreakdown: day.breakdown
  }));
}

function splitPendingTrailingDays(daily) {
  const effectiveDaily = Array.isArray(daily) ? daily.slice() : [];
  const pendingDaily = [];
  while (effectiveDaily.length) {
    const last = effectiveDaily[effectiveDaily.length - 1];
    if (numberOrZero(last?.spend) !== 0 || numberOrZero(last?.sourceRows) !== 0) break;
    pendingDaily.unshift(effectiveDaily.pop());
  }
  return { effectiveDaily, pendingDaily };
}

function platformTotals(series) {
  return series.reduce((acc, row) => {
    acc.views += numberOrZero(row.views);
    acc.clicks += numberOrZero(row.clicks);
    acc.spend += numberOrZero(row.spend);
    acc.orders += numberOrZero(row.orders);
    acc.revenue += numberOrZero(row.revenue);
    return acc;
  }, { views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 });
}

function roundTotals(totals) {
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, roundMoney(value)]));
}

function buildOzonPlatform(daily, existingPlatform = null) {
  const existingByDate = new Map();
  for (const point of Array.isArray(existingPlatform?.series) ? existingPlatform.series : []) {
    const date = isoDate(point?.date || point?.label);
    if (date) existingByDate.set(date, point);
  }
  const series = daily.map((day, index) => ({
    ...(existingByDate.get(day.date) || {}),
    dayOffset: daily.length - index - 1,
    label: day.date,
    date: day.date,
    views: Math.round(numberOrZero(existingByDate.get(day.date)?.views)),
    clicks: Math.round(numberOrZero(existingByDate.get(day.date)?.clicks)),
    spend: day.spend,
    orders: Math.round(numberOrZero(existingByDate.get(day.date)?.orders)),
    revenue: roundMoney(numberOrZero(existingByDate.get(day.date)?.revenue)),
    sourceMode: mergeSourceMode(existingByDate.get(day.date)?.sourceMode || existingByDate.get(day.date)?.source, 'ozon_seller_finance_api'),
    sourceRows: day.sourceRows
  }));
  return {
    key: 'ozon',
    platformKey: 'ozon',
    label: 'Ozon',
    ...roundTotals(platformTotals(series)),
    series
  };
}

function buildAllPlatform(platforms) {
  const byDate = new Map();
  for (const platform of platforms) {
    const key = String(platform?.key || platform?.platformKey || '').trim();
    if (!key || key === 'all') continue;
    for (const point of Array.isArray(platform?.series) ? platform.series : []) {
      const date = isoDate(point?.date || point?.label);
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
  const series = [...byDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row, index, rows) => ({
      dayOffset: rows.length - index - 1,
      label: row.date,
      date: row.date,
      views: Math.round(row.views),
      clicks: Math.round(row.clicks),
      spend: roundMoney(row.spend),
      orders: Math.round(row.orders),
      revenue: roundMoney(row.revenue)
    }));
  return {
    key: 'all',
    platformKey: 'all',
    label: 'Все площадки',
    ...roundTotals(platformTotals(series)),
    series
  };
}

function patchPayload(payload, options, daily, pendingDaily = []) {
  const financeRows = buildOzonFinanceRows(daily);
  const itemSeries = Array.isArray(payload.itemSeries) ? payload.itemSeries : [];
  const preservedItemSeries = [];
  const ozonWindowRows = [];
  for (const row of itemSeries) {
    const platformKey = String(row?.platformKey || row?.platform || row?.marketplace || '').trim().toLowerCase();
    const date = isoDate(row?.date || row?.day || row?.label);
    const articleKey = String(row?.articleKey || row?.article || '').trim();
    const isFinanceTotal = articleKey === 'ozon-finance-ads-total';
    if (platformKey === 'ozon' && dateInWindow(date, options.from, options.to)) {
      if (!isFinanceTotal) ozonWindowRows.push({ ...row, spend: 0, spendReplacedByFinanceApi: true });
    } else {
      preservedItemSeries.push(row);
    }
  }
  const platformMap = new Map();
  for (const platform of Array.isArray(payload.platforms) ? payload.platforms : []) {
    const key = String(platform?.key || platform?.platformKey || '').trim().toLowerCase();
    if (!key || key === 'all') continue;
    platformMap.set(key, platform);
  }
  const ozonPlatform = buildOzonPlatform(daily, platformMap.get('ozon'));
  platformMap.set('ozon', ozonPlatform);
  const orderedKeys = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'];
  const platforms = [];
  for (const key of orderedKeys) {
    if (platformMap.has(key)) {
      platforms.push(platformMap.get(key));
      platformMap.delete(key);
    }
  }
  platforms.push(...platformMap.values());
  platforms.push(buildAllPlatform(platforms));

  const spend = roundMoney(daily.reduce((sum, day) => sum + day.spend, 0));
  const sourceRows = daily.reduce((sum, day) => sum + day.sourceRows, 0);
  const sourceOperations = daily.reduce((sum, day) => sum + day.sourceOperations, 0);
  return {
    ...payload,
    generatedAt: new Date().toISOString(),
    asOfDate: latestSeriesDate(platforms) || payload.asOfDate || options.to,
    sourceMode: mergeSourceMode(payload.sourceMode || payload.source, 'ozon-seller-finance-api'),
    note: [
      payload.note,
      'Ozon ad spend replaced by daily Seller Finance API advertising operations.'
    ].filter(Boolean).join(' ').trim(),
    diagnostics: {
      ...(payload.diagnostics || {}),
      ozonAdsFinance: {
        source: 'Ozon Seller API /v3/finance/transaction/list',
        from: options.from,
        to: daily[daily.length - 1]?.date || '',
        requestedTo: options.to,
        effectiveTo: daily[daily.length - 1]?.date || '',
        pendingDates: pendingDaily.map((day) => day.date).filter(Boolean),
        pendingDaily,
        operationTypes: [...options.operationTypes],
        days: daily.length,
        sourceRows,
        sourceOperations,
        spend,
        daily
      }
    },
    platforms,
    itemSeries: [...preservedItemSeries, ...ozonWindowRows, ...financeRows]
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input || args['input-file'] || path.join(process.cwd(), 'data', 'ads_summary.json'));
  const payload = readJson(inputPath, null);
  if (!payload || typeof payload !== 'object') throw new Error(`ads_summary not found or invalid: ${inputPath}`);
  const options = resolveOptions(args, payload);
  if (options.command !== 'sync') throw new Error(`Unsupported command: ${options.command}`);
  if (!options.clientId || !options.apiKey) {
    console.warn('Ozon API credentials are not set. Preserve ads_summary.json and skip Ozon ads finance refresh.');
    return;
  }
  const dates = enumerateDates(options.from, options.to);
  const daily = [];
  const warnings = [];
  for (const dateKey of dates) {
    try {
      daily.push(await fetchFinanceDay(options, dateKey));
    } catch (error) {
      warnings.push(`${dateKey}: ${error.message}`);
      daily.push({ date: dateKey, spend: 0, sourceRows: 0, sourceOperations: 0, breakdown: {} });
    }
  }
  const { effectiveDaily, pendingDaily } = splitPendingTrailingDays(daily);
  const patched = patchPayload(payload, options, effectiveDaily, pendingDaily);
  if (warnings.length) patched.diagnostics.ozonAdsFinance.warnings = warnings;
  if (!options.dryRun) {
    writeJson(options.outputPath, patched);
    if (options.mirrorPath && path.resolve(options.mirrorPath) !== path.resolve(options.outputPath)) {
      writeJson(options.mirrorPath, patched);
    }
  }
  console.log(JSON.stringify({
    dryRun: options.dryRun,
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    mirrorPath: options.mirrorPath,
    from: options.from,
    to: options.to,
    effectiveTo: patched.diagnostics.ozonAdsFinance.effectiveTo,
    days: effectiveDaily.length,
    pendingDates: pendingDaily.map((day) => day.date).filter(Boolean),
    sourceRows: patched.diagnostics.ozonAdsFinance.sourceRows,
    spend: patched.diagnostics.ozonAdsFinance.spend,
    warnings
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
