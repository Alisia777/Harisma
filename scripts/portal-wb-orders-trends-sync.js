#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { execFileSync } = require('child_process');

const FINANCE_API_BASE_URL = 'https://finance-api.wildberries.ru';
const FINANCE_LIST_PATH = '/api/finance/v1/sales-reports/list';
const FINANCE_DETAILED_PATH = '/api/finance/v1/sales-reports/detailed';
const SALES_API_BASE_URL = 'https://statistics-api.wildberries.ru';
const ORDERS_PATH = '/api/v1/supplier/orders';
const WB_ANALYTICS_API_BASE_URL = 'https://seller-analytics-api.wildberries.ru';
const WB_ANALYTICS_BRAND = 'Алтея';
const PLATFORM_LABELS = {
  wb: 'WB',
  ozon: 'Ozon',
  ya: '\u042f.\u041c\u0430\u0440\u043a\u0435\u0442',
  all: '\u0412\u0441\u0435 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0438'
};
function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
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

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z\u0430-\u044f\u04510-9]+/giu, '');
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{2})/);
  if (match) return `20${match[3]}-${match[2]}-${match[1]}`;
  return '';
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
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

function enumerateDates(from, to) {
  const result = [];
  for (let cursor = from; cursor && to && cursor <= to; cursor = addDays(cursor, 1)) {
    result.push(cursor);
  }
  return result;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const parsed = numberOrZero(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((line) => line.trim());
  const firstDataLine = lines.find((line) => ((line.match(/;/g) || []).length + (line.match(/,/g) || []).length) > 1) || lines[0] || '';
  const delimiter = (firstDataLine.match(/;/g) || []).length > (firstDataLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  const filtered = rows
    .map((item) => item.map((cell) => String(cell ?? '').trim()))
    .filter((item) => item.some((cell) => cell !== ''));
  const headerIndex = filtered.findIndex((item) => item.filter(Boolean).length >= 2);
  if (headerIndex < 0) return [];
  const [header = [], ...body] = filtered.slice(headerIndex);
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ''])));
}

function collectFiles(dir, pattern, result) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) collectFiles(fullPath, pattern, result);
    else if (pattern.test(item.name)) result.push(fullPath);
  }
}

function findFirstFile(dir, pattern) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      const nested = findFirstFile(fullPath, pattern);
      if (nested) return nested;
    } else if (pattern.test(item.name)) {
      return fullPath;
    }
  }
  return '';
}

function unzipWithPowerShell(zipPath, destination) {
  fs.mkdirSync(destination, { recursive: true });
  execFileSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(destination)} -Force`
  ], { stdio: 'pipe' });
}

async function wbAnalyticsRequest(options, apiPath, requestOptions = {}) {
  const url = new URL(`${WB_ANALYTICS_API_BASE_URL}${apiPath}`);
  Object.entries(requestOptions.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    method: requestOptions.method || 'GET',
    headers: {
      Authorization: options.token,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body)
  });
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/zip')) {
    if (!response.ok) throw new Error(`WB analytics ${apiPath}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`WB analytics ${apiPath}: HTTP ${response.status} ${text.slice(0, 700)}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function createAndDownloadWbFunnelReport(options, startDate, endDate) {
  const id = randomUUID();
  await wbAnalyticsRequest(options, '/api/v2/nm-report/downloads', {
    method: 'POST',
    body: {
      id,
      reportType: 'GROUPED_HISTORY_REPORT',
      userReportName: `Altea WB grouped ${startDate} ${endDate}`,
      params: {
        nmIDs: [],
        subjectIds: [],
        brandNames: [],
        tagIds: [],
        startDate,
        endDate,
        timezone: 'Europe/Moscow',
        aggregationLevel: 'day',
        skipDeletedNm: false
      }
    }
  });

  let status = '';
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    await sleep(attempt === 1 ? 5000 : 15000);
    const list = await wbAnalyticsRequest(options, '/api/v2/nm-report/downloads', {
      query: { 'filter[downloadIds]': id }
    });
    const item = Array.isArray(list?.data) ? list.data.find((entry) => entry.id === id) : null;
    status = String(item?.status || '').trim();
    if (status === 'SUCCESS') break;
    if (status === 'FAILED') throw new Error(`WB report ${id} failed`);
  }
  if (status !== 'SUCCESS') throw new Error(`WB report ${id} was not ready in time; last status=${status || 'unknown'}`);

  const zip = await wbAnalyticsRequest(options, `/api/v2/nm-report/downloads/file/${id}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altea-wb-funnel-'));
  const zipPath = path.join(tmpDir, `${id}.zip`);
  fs.writeFileSync(zipPath, zip);
  const extractDir = path.join(tmpDir, 'out');
  unzipWithPowerShell(zipPath, extractDir);
  const csvPath = findFirstFile(extractDir, /\.csv$/i);
  if (!csvPath) throw new Error(`WB report ${id} zip did not contain CSV`);
  return parseCsv(fs.readFileSync(csvPath, 'utf8'));
}

function resolveOptions(args) {
  const root = process.cwd();
  const settlementHour = Math.max(0, Math.min(23, Math.trunc(numberOrZero(args['settlement-hour'] || process.env.ALTEA_WB_SETTLEMENT_HOUR || 10))));
  const explicitTo = isoDate(args.to || args['date-to']);
  const autoLagDays = new Date().getHours() < settlementHour ? 2 : 1;
  const to = explicitTo || localDateKey(-autoLagDays);
  const from = isoDate(args.from || args['date-from'] || `${to.slice(0, 7)}-01`);
  return {
    token:
      args['finance-token']
      || process.env.ALTEA_WB_FINANCE_TOKEN
      || args.token
      || process.env.ALTEA_WB_API_TOKEN
      || process.env.ALTEA_WB_PROMOTION_TOKEN
      || '',
    financeApiBaseUrl: String(args['finance-api-base-url'] || FINANCE_API_BASE_URL).replace(/\/+$/, ''),
    apiBaseUrl: String(args['api-base-url'] || SALES_API_BASE_URL).replace(/\/+$/, ''),
    skusPath: path.resolve(args['skus-file'] || path.join(root, 'data', 'skus.json')),
    inputPath: path.resolve(args['input-file'] || path.join(root, 'data', 'platform_trends.json')),
    outputPath: path.resolve(args['output-file'] || path.join(root, 'data', 'platform_trends.json')),
    settlementHour,
    autoLagDays,
    explicitTo: Boolean(explicitTo),
    partialRefreshRecentDays: Math.max(0, Math.trunc(numberOrZero(args['partial-refresh-recent-days'] || 2))),
    partialRefreshMinRatio: Math.max(0.1, Math.min(1, numberOrZero(args['partial-refresh-min-ratio'] || 0.75))),
    from,
    to
  };
}

function skuMaps(skus) {
  const byArticle = new Map();
  const byNmId = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    for (const value of [sku?.articleKey, sku?.article, sku?.supplierArticle]) {
      const key = normalizeKey(value);
      if (key && !byArticle.has(key)) byArticle.set(key, sku);
    }
    const nmId = String(Math.trunc(numberOrZero(sku?.nmId || sku?.wb?.nmId || sku?.wbNmId)));
    if (nmId && nmId !== '0' && !byNmId.has(nmId)) byNmId.set(nmId, sku);
  }
  return { byArticle, byNmId };
}

function marginForSku(sku) {
  return numberOrZero(sku?.wb?.marginPct);
}

function articleKeyForSku(sku, fallback = '') {
  return String(
    sku?.articleKey
    || sku?.article
    || sku?.supplierArticle
    || sku?.sku
    || fallback
    || ''
  ).trim();
}

function articleNameForSku(sku, fallback = '') {
  return String(sku?.name || sku?.title || fallback || '').trim();
}

function ownerForSku(sku) {
  return String(
    sku?.owner?.byPlatform?.wb
    || sku?.owner?.name
    || sku?.owner
    || ''
  ).trim();
}

function addArticlePoint(map, sku, fallbackKey, dateKey, units, revenue, estimatedMargin) {
  const articleKey = articleKeyForSku(sku, fallbackKey);
  if (!articleKey) return;
  let item = map.get(articleKey);
  if (!item) {
    item = {
      platformKey: 'wb',
      platformLabel: PLATFORM_LABELS.wb,
      articleKey,
      article: articleKey,
      name: articleNameForSku(sku, articleKey),
      owner: ownerForSku(sku),
      dailyByDate: new Map(),
      sourceRows: 0,
      matchedRows: 0
    };
    map.set(articleKey, item);
  }
  if (!item.name) item.name = articleNameForSku(sku, articleKey);
  if (!item.owner) item.owner = ownerForSku(sku);
  item.sourceRows += 1;
  if (sku) item.matchedRows += 1;

  const point = item.dailyByDate.get(dateKey) || {
    date: dateKey,
    units: 0,
    ordersUnits: 0,
    revenue: 0,
    ordersRevenue: 0,
    estimatedMargin: 0
  };
  point.units += units;
  point.ordersUnits += units;
  point.revenue += revenue;
  point.ordersRevenue += revenue;
  point.estimatedMargin += estimatedMargin;
  if (units > 0 && revenue > 0) point.price = revenue / units;
  item.dailyByDate.set(dateKey, point);
}

function roundArticlePoint(point, latestIndex, index) {
  const ordersUnits = numberOrZero(point.ordersUnits ?? point.units);
  const revenue = numberOrZero(point.revenue);
  return {
    date: point.date,
    dayOffset: latestIndex - index,
    units: Number(numberOrZero(point.units).toFixed(4)),
    ordersUnits: Number(ordersUnits.toFixed(4)),
    revenue: Number(revenue.toFixed(4)),
    ordersRevenue: Number(numberOrZero(point.ordersRevenue ?? point.revenue).toFixed(4)),
    estimatedMargin: Number(numberOrZero(point.estimatedMargin).toFixed(4)),
    price: ordersUnits > 0 ? Number((revenue / ordersUnits).toFixed(4)) : 0
  };
}

function materializeArticles(articleMap) {
  return Array.from(articleMap.values())
    .map((item) => {
      const daily = Array.from(item.dailyByDate.values())
        .sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')));
      const latestIndex = Math.max(0, daily.length - 1);
      const roundedDaily = daily.map((point, index) => roundArticlePoint(point, latestIndex, index));
      const latestPoint = roundedDaily[roundedDaily.length - 1] || {};
      const currentPrice = numberOrZero(latestPoint.price);
      return {
        platformKey: 'wb',
        platformLabel: PLATFORM_LABELS.wb,
        articleKey: item.articleKey,
        article: item.article || item.articleKey,
        name: item.name || item.article || item.articleKey,
        owner: item.owner || '',
        currentPrice,
        currentClientPrice: currentPrice,
        currentFillPrice: currentPrice,
        sourceRows: item.sourceRows,
        matchedRows: item.matchedRows,
        sourceMode: 'wb-api-direct-sku',
        daily: roundedDaily
      };
    })
    .filter((item) => item.daily.length)
    .sort((left, right) => String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru'));
}

function scaleArticlesToSeries(articles, sourceSeries, targetSeries) {
  const sourceByDate = new Map((Array.isArray(sourceSeries) ? sourceSeries : []).map((point) => [isoDate(point?.label || point?.date), point]));
  const targetByDate = new Map((Array.isArray(targetSeries) ? targetSeries : []).map((point) => [isoDate(point?.label || point?.date), point]));
  return (Array.isArray(articles) ? articles : []).map((article) => ({
    ...article,
    daily: (article.daily || []).map((point) => {
      const date = isoDate(point.date || point.label);
      const sourceRevenue = numberOrZero(sourceByDate.get(date)?.revenue);
      const targetRevenue = numberOrZero(targetByDate.get(date)?.revenue);
      const ratio = sourceRevenue > 0 && targetRevenue > 0 ? targetRevenue / sourceRevenue : 1;
      const revenue = numberOrZero(point.revenue) * ratio;
      const ordersRevenue = numberOrZero(point.ordersRevenue ?? point.revenue) * ratio;
      const estimatedMargin = numberOrZero(point.estimatedMargin) * ratio;
      const ordersUnits = numberOrZero(point.ordersUnits ?? point.units);
      return {
        ...point,
        revenue: Number(revenue.toFixed(4)),
        ordersRevenue: Number(ordersRevenue.toFixed(4)),
        estimatedMargin: Number(estimatedMargin.toFixed(4)),
        price: ordersUnits > 0 ? Number((revenue / ordersUnits).toFixed(4)) : numberOrZero(point.price)
      };
    })
  }));
}

function platformMap(platformTrends) {
  const map = new Map();
  for (const platform of Array.isArray(platformTrends?.platforms) ? platformTrends.platforms : []) {
    map.set(String(platform?.key || '').trim(), platform);
  }
  return map;
}

function latestDateFromPlatforms(platforms) {
  let latest = '';
  for (const platform of platforms.values()) {
    for (const point of Array.isArray(platform?.series) ? platform.series : []) {
      const date = isoDate(point?.label || point?.date);
      if (date && date > latest) latest = date;
    }
  }
  return latest;
}

function mergeAllSeries(platforms) {
  const officialFinanceTurnoverForPoint = (key, point) => {
    const sellerSummary = point?.wbSellerSummary && typeof point.wbSellerSummary === 'object'
      ? point.wbSellerSummary
      : {};
    if (key === 'wb') {
      return firstNumber(
        point?.wbSellerSummaryFinanceTurnover,
        point?.financeTurnover,
        sellerSummary.financeTurnover,
        sellerSummary.salesRevenue,
        point?.revenue
      );
    }
    return firstNumber(point?.financeTurnover, point?.revenue);
  };
  const officialMarginForPoint = (key, point) => {
    const sellerSummary = point?.wbSellerSummary && typeof point.wbSellerSummary === 'object'
      ? point.wbSellerSummary
      : {};
    if (key === 'wb') {
      return firstNumber(
        point?.wbSellerSummaryPayForGoods,
        point?.financialResult,
        sellerSummary.financialResult,
        sellerSummary.payForGoods,
        point?.estimatedMargin
      );
    }
    return firstNumber(point?.financialResult, point?.estimatedMargin);
  };
  const dateSet = new Set();
  for (const key of ['wb', 'ozon', 'ya']) {
    for (const point of platforms.get(key)?.series || []) {
      const date = isoDate(point?.label || point?.date);
      if (date) dateSet.add(date);
    }
  }
  const dates = Array.from(dateSet).sort();
  const latestIndex = dates.length - 1;
  return dates.map((date, index) => {
    const total = { units: 0, revenue: 0, financeTurnover: 0, financialResult: 0, estimatedMargin: 0 };
    for (const key of ['wb', 'ozon', 'ya']) {
      const point = (platforms.get(key)?.series || []).find((item) => isoDate(item?.label || item?.date) === date);
      if (!point) continue;
      total.units += numberOrZero(point.units);
      total.revenue += numberOrZero(point.revenue);
      const financeTurnover = officialFinanceTurnoverForPoint(key, point);
      const financialResult = officialMarginForPoint(key, point);
      total.financeTurnover += financeTurnover;
      total.financialResult += financialResult;
      total.estimatedMargin += financialResult;
    }
    return {
      dayOffset: latestIndex - index,
      label: date,
      units: Number(total.units.toFixed(4)),
      revenue: Number(total.revenue.toFixed(4)),
      financeTurnover: Number(total.financeTurnover.toFixed(4)),
      financialResult: Number(total.financialResult.toFixed(4)),
      estimatedMargin: Number(total.estimatedMargin.toFixed(4))
    };
  });
}

function mergeEstimatedMarginFallback(series, fallbackSeries) {
  const fallbackMap = new Map();
  for (const point of Array.isArray(fallbackSeries) ? fallbackSeries : []) {
    const date = isoDate(point?.label || point?.date);
    if (date && !fallbackMap.has(date)) fallbackMap.set(date, point);
  }
  return (Array.isArray(series) ? series : []).map((point) => {
    if (numberOrZero(point?.estimatedMargin) > 0) return point;
    const fallback = fallbackMap.get(isoDate(point?.label || point?.date));
    if (!fallback || numberOrZero(fallback?.estimatedMargin) <= 0) return point;
    return {
      ...point,
      estimatedMargin: Number(numberOrZero(fallback.estimatedMargin).toFixed(4))
    };
  });
}

function seriesHasPositiveMargin(series) {
  return Array.isArray(series) && series.some((point) => numberOrZero(point?.estimatedMargin) > 0);
}

function shouldPreserveFallbackPoint(dateKey, freshPoint, fallbackPoint, options) {
  if (!fallbackPoint || !dateKey || !options) return false;
  const daysFromWindowEnd = Math.round((new Date(`${options.to}T00:00:00Z`) - new Date(`${dateKey}T00:00:00Z`)) / 86400000);
  if (daysFromWindowEnd < 0 || daysFromWindowEnd > options.partialRefreshRecentDays) return false;
  const freshRevenue = numberOrZero(freshPoint?.revenue);
  const existingRevenue = numberOrZero(fallbackPoint?.revenue);
  if (!(existingRevenue > 0)) return false;
  if (freshRevenue <= 0) return true;
  return freshRevenue < existingRevenue * options.partialRefreshMinRatio;
}

function wbPlatformFromSnapshot(snapshot) {
  return platformMap(snapshot || {}).get('wb') || null;
}

function wbSellerSummaryReferenceMap(...snapshots) {
  const map = new Map();
  for (const snapshot of snapshots) {
    const referenceMeta = snapshot?.wbSellerSummaryReference || null;
    const referenceDates = new Set(Array.isArray(referenceMeta?.dates) ? referenceMeta.dates.map(isoDate).filter(Boolean) : []);
    const platform = wbPlatformFromSnapshot(snapshot);
    for (const point of platform?.series || []) {
      const date = isoDate(point?.label || point?.date);
      if (!date) continue;
      const referenceRevenue = firstNumber(point?.wbSellerSummaryReferenceRevenue, referenceDates.has(date) ? point?.revenue : undefined);
      if (!(referenceRevenue > 0)) continue;
      const sellerSummary = point?.wbSellerSummary && typeof point.wbSellerSummary === 'object'
        ? point.wbSellerSummary
        : {};
      map.set(date, {
        revenue: referenceRevenue,
        units: firstNumber(point?.wbSellerSummaryReferenceUnits, point?.units),
        sellerSummary,
        financeTurnover: firstNumber(
          point?.wbSellerSummaryFinanceTurnover,
          point?.financeTurnover,
          sellerSummary.financeTurnover,
          sellerSummary.salesRevenue
        ),
        salesRevenue: firstNumber(point?.wbSellerSummarySalesRevenue, sellerSummary.salesRevenue),
        payForGoods: firstNumber(point?.wbSellerSummaryPayForGoods, point?.financialResult, sellerSummary.payForGoods),
        totalPay: firstNumber(point?.wbSellerSummaryTotalPay, sellerSummary.totalPay),
        turnoverDays: firstNumber(point?.wbSellerSummaryTurnoverDays, sellerSummary.turnoverDays),
        source: referenceMeta?.source || 'wb-seller-summary-reference',
        revenueField: referenceMeta?.revenueField || 'seller summary orders revenue'
      });
    }
  }
  return map;
}

function applyWbSellerSummaryReference(series, referenceMap) {
  if (!referenceMap?.size) return series;
  return (Array.isArray(series) ? series : []).map((point) => {
    const date = isoDate(point?.label || point?.date);
    const reference = referenceMap.get(date);
    if (!reference) return point;
    const officialRevenue = firstNumber(reference.revenue, point?.revenue);
    const officialUnits = firstNumber(reference.units, point?.units);
    const officialMargin = reference.payForGoods > 0
      ? reference.payForGoods
      : firstNumber(point?.financialResult, point?.estimatedMargin);
    return {
      ...point,
      units: officialUnits || point.units,
      revenue: officialRevenue,
      legacyEstimatedMargin: point.legacyEstimatedMargin || point.estimatedMargin || null,
      estimatedMargin: officialMargin,
      wbSellerSummary: reference.sellerSummary || point.wbSellerSummary || null,
      wbSellerSummaryReferenceRevenue: reference.revenue || point.wbSellerSummaryReferenceRevenue || null,
      wbSellerSummaryReferenceUnits: reference.units || point.wbSellerSummaryReferenceUnits || null,
      wbSellerSummaryFinanceTurnover: reference.financeTurnover || point.wbSellerSummaryFinanceTurnover || null,
      wbSellerSummarySalesRevenue: reference.salesRevenue || point.wbSellerSummarySalesRevenue || null,
      wbSellerSummaryPayForGoods: reference.payForGoods || point.wbSellerSummaryPayForGoods || null,
      wbSellerSummaryTotalPay: reference.totalPay || point.wbSellerSummaryTotalPay || null,
      wbSellerSummaryTurnoverDays: reference.turnoverDays,
      deduction: reference.deduction || reference.sellerSummary?.deduction || point.deduction || null,
      reviewDeduction: reference.reviewDeduction || reference.sellerSummary?.reviewDeduction || point.reviewDeduction || null,
      wbMediaDeduction: reference.wbMediaDeduction || reference.sellerSummary?.wbMediaDeduction || point.wbMediaDeduction || null,
      cashbackAmount: reference.sellerSummary?.cashbackAmount || point.cashbackAmount || null,
      cashbackDiscount: reference.sellerSummary?.cashbackDiscount || point.cashbackDiscount || null,
      cashbackCommissionChange: reference.sellerSummary?.cashbackCommissionChange || point.cashbackCommissionChange || null,
      financeTurnover: reference.financeTurnover || point.financeTurnover || null,
      financialResult: officialMargin || point.financialResult || null
    };
  });
}

async function wbRequest(options, query) {
  const url = new URL(`${options.apiBaseUrl}${ORDERS_PATH}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: options.token,
          Accept: 'application/json'
        }
      });
    } catch (error) {
      if (attempt === 6) throw error;
      await sleep(Math.min(30000, attempt * 5000));
      continue;
    }

    if (response.status === 204) {
      return { rows: [], status: 204 };
    }

    const text = await response.text();

    if (response.ok) {
      let payload = [];
      try {
        payload = text ? JSON.parse(text) : [];
      } catch (error) {
        throw new Error(`WB orders response parse failed: ${error.message || error}`);
      }
      if (!Array.isArray(payload)) {
        throw new Error(`WB orders response must be an array, got ${typeof payload}`);
      }
      return { rows: payload, status: response.status };
    }

    if (response.status === 429) {
      const waitSeconds = Number(response.headers.get('x-ratelimit-retry') || response.headers.get('x-ratelimit-reset') || 60);
      const waitMs = Number.isFinite(waitSeconds) && waitSeconds > 0
        ? (waitSeconds + 1) * 1000
        : attempt * 60000;
      if (attempt === 6) {
        throw new Error(`WB orders API ${ORDERS_PATH} rate-limited after retries: HTTP 429 ${text.slice(0, 500)}`);
      }
      await sleep(waitMs);
      continue;
    }

    if (attempt === 6) {
      throw new Error(`WB orders API ${ORDERS_PATH} failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    }
    await sleep(attempt * 2000);
  }

  throw new Error(`WB orders API ${ORDERS_PATH} failed after retries`);
}

async function wbFinanceRequest(options, endpoint, body) {
  const url = new URL(`${options.financeApiBaseUrl}${endpoint}`);

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: options.token,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(body || {})
      });
    } catch (error) {
      if (attempt === 6) throw error;
      await sleep(Math.min(30000, attempt * 5000));
      continue;
    }

    if (response.status === 204) {
      return { rows: [], status: 204 };
    }

    const text = await response.text();

    if (response.ok) {
      let payload = [];
      try {
        payload = text ? JSON.parse(text) : [];
      } catch (error) {
        throw new Error(`WB finance response parse failed: ${error.message || error}`);
      }
      if (!Array.isArray(payload)) {
        throw new Error(`WB finance response must be an array, got ${typeof payload}`);
      }
      return { rows: payload, status: response.status };
    }

    if (response.status === 429) {
      const waitSeconds = Number(response.headers.get('retry-after') || response.headers.get('x-ratelimit-retry') || response.headers.get('x-ratelimit-reset') || 60);
      const waitMs = Number.isFinite(waitSeconds) && waitSeconds > 0
        ? (waitSeconds + 1) * 1000
        : attempt * 60000;
      if (attempt === 6) {
        throw new Error(`WB finance API ${endpoint} rate-limited after retries: HTTP 429 ${text.slice(0, 500)}`);
      }
      await sleep(waitMs);
      continue;
    }

    if (attempt === 6) {
      throw new Error(`WB finance API ${endpoint} failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    }
    await sleep(attempt * 2000);
  }

  throw new Error(`WB finance API ${endpoint} failed after retries`);
}

async function fetchWbAnalyticsRows(options) {
  const rows = [];
  const warnings = [];
  let pageCount = 0;
  try {
    const page = await createAndDownloadWbFunnelReport(options, options.from, options.to);
    if (Array.isArray(page) && page.length) {
      pageCount = 1;
      rows.push(...page);
    }
  } catch (error) {
    warnings.push(error?.message || String(error));
  }
  return {
    rows,
    diagnostics: {
      pageCount,
      fetchedRows: rows.length,
      warnings
    }
  };
}

async function fetchWbRows(options) {
  const rows = [];
  const warnings = [];
  const seenCursors = new Set();
  let pageCount = 0;
  let dateFrom = options.from;

  for (;;) {
    const result = await wbRequest(options, {
      dateFrom,
      dateTo: options.to,
      flag: 0
    });
    const page = Array.isArray(result.rows) ? result.rows : [];
    if (!page.length) break;

    pageCount += 1;
    rows.push(...page);

    const lastRow = page[page.length - 1] || {};
    const nextCursor = String(lastRow.lastChangeDate || lastRow.date || '').trim();
    if (!nextCursor) {
      warnings.push('WB orders API page missing lastChangeDate/date, stopping pagination early');
      break;
    }
    if (seenCursors.has(nextCursor)) {
      warnings.push(`WB orders API repeated cursor ${nextCursor}, stopping pagination`);
      break;
    }
    seenCursors.add(nextCursor);
    dateFrom = nextCursor;
  }

  return {
    rows,
    diagnostics: {
      pageCount,
      fetchedRows: rows.length,
      warnings
    }
  };
}

async function fetchWbFinanceRows(options) {
  const result = await wbFinanceRequest(options, FINANCE_LIST_PATH, {
    dateFrom: options.from,
    dateTo: options.to,
    period: 'daily',
    limit: 1000,
    offset: 0
  });
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return {
    rows,
    diagnostics: {
      pageCount: rows.length > 0 ? 1 : 0,
      fetchedRows: rows.length,
      warnings: []
    }
  };
}

async function fetchWbFinanceDetailedRows(options) {
  const rows = [];
  const warnings = [];
  let rrdId = 0;
  let pageCount = 0;
  const limit = 100000;

  for (;;) {
    const result = await wbFinanceRequest(options, FINANCE_DETAILED_PATH, {
      dateFrom: options.from,
      dateTo: options.to,
      period: 'daily',
      limit,
      rrdId,
      fields: [
        'rrdId',
        'dateFrom',
        'dateTo',
        'nmId',
        'vendorCode',
        'title',
        'brandName',
        'subjectName',
        'sku',
        'docTypeName',
        'sellerOperName',
        'bonusTypeName',
        'quantity',
        'retailPriceWithDisc',
        'forPay',
        'deliveryService',
        'paidStorage',
        'penalty',
        'additionalPayment',
        'paidAcceptance',
        'deduction',
        'cashbackAmount',
        'cashbackDiscount',
        'cashbackCommissionChange',
        'rrDate'
      ]
    });
    const page = Array.isArray(result.rows) ? result.rows : [];
    if (!page.length) break;
    pageCount += 1;
    rows.push(...page);

    const nextRrdId = page.reduce((max, row) => Math.max(max, Math.trunc(numberOrZero(row?.rrdId))), rrdId);
    if (!(nextRrdId > rrdId)) {
      warnings.push(`WB finance detailed API repeated rrdId ${rrdId}, stopping pagination`);
      break;
    }
    rrdId = nextRrdId;
    if (page.length < limit) break;
  }

  return {
    rows,
    diagnostics: {
      pageCount,
      fetchedRows: rows.length,
      warnings
    }
  };
}

function buildFinanceRevenueMap(rows) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = isoDate(row?.dateFrom || row?.dateTo || row?.createDate);
    if (!date) continue;
    const revenue = firstNumber(row?.retailAmountSum, row?.forPaySum, row?.bankPaymentSum);
    if (!(revenue || revenue === 0)) continue;
    byDate.set(date, numberOrZero(byDate.get(date)) + revenue);
  }
  return byDate;
}

function operationSign(row) {
  const raw = normalizeKey(`${row?.docTypeName || ''} ${row?.sellerOperName || ''}`);
  if (raw.includes('возврат') || raw.includes('return')) return -1;
  return 1;
}

function buildFinanceTurnoverMap(rows) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = isoDate(row?.rrDate || row?.dateFrom || row?.dateTo);
    if (!date) continue;
    const retailPriceWithDisc = numberOrZero(row?.retailPriceWithDisc);
    if (!(retailPriceWithDisc > 0)) continue;
    byDate.set(date, numberOrZero(byDate.get(date)) + (retailPriceWithDisc * operationSign(row)));
  }
  return byDate;
}

function financeDeductionKind(row) {
  const text = normalizeKey([
    row?.sellerOperName,
    row?.operationName,
    row?.bonusTypeName,
    row?.docTypeName
  ].filter(Boolean).join(' '));
  if (/\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0435\u0437\u0430\u043e\u0442\u0437\u044b\u0432|review/.test(text)) return 'review';
  if (/\u0432\u0431\u043c\u0435\u0434\u0438\u0430|wbmedia|media/.test(text)) return 'wbMedia';
  return 'other';
}

function buildFinanceDeductionMap(rows) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = isoDate(row?.rrDate || row?.dateFrom || row?.dateTo);
    if (!date) continue;
    const deduction = firstNumber(row?.deduction, row?.deductionSum);
    if (!deduction) continue;
    const current = byDate.get(date) || {
      deduction: 0,
      reviewDeduction: 0,
      wbMediaDeduction: 0,
      otherDeduction: 0,
      deductionRows: 0,
      reviewDeductionRows: 0,
      wbMediaDeductionRows: 0
    };
    current.deduction += deduction;
    current.deductionRows += 1;
    const kind = financeDeductionKind(row);
    if (kind === 'review') {
      current.reviewDeduction += deduction;
      current.reviewDeductionRows += 1;
    } else if (kind === 'wbMedia') {
      current.wbMediaDeduction += deduction;
      current.wbMediaDeductionRows += 1;
    } else {
      current.otherDeduction += deduction;
    }
    byDate.set(date, current);
  }
  return byDate;
}

function buildFinanceArticles(rows, skus) {
  const { byArticle, byNmId } = skuMaps(skus);
  const articleMap = new Map();
  let sourceRows = 0;
  let positiveRows = 0;
  let matchedRows = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const date = isoDate(row?.rrDate || row?.dateFrom || row?.dateTo);
    if (!date) continue;
    const retailPriceWithDisc = numberOrZero(row?.retailPriceWithDisc);
    if (!(retailPriceWithDisc > 0)) continue;
    const fallbackArticle = String(row?.vendorCode || row?.supplierArticle || row?.saName || row?.nmId || row?.nmID || '').trim();
    if (!fallbackArticle) continue;

    sourceRows += 1;
    const sign = operationSign(row);
    const revenue = retailPriceWithDisc * sign;
    const quantity = Math.max(1, Math.abs(numberOrZero(row?.quantity) || 1)) * sign;
    if (revenue > 0) positiveRows += 1;
    const sku = byArticle.get(normalizeKey(fallbackArticle))
      || byNmId.get(String(Math.trunc(numberOrZero(row?.nmId || row?.nmID))));
    if (sku) matchedRows += 1;
    const estimatedMargin = sku ? revenue * marginForSku(sku) : 0;
    addArticlePoint(articleMap, sku, fallbackArticle, date, quantity, revenue, estimatedMargin);
    const item = articleMap.get(articleKeyForSku(sku, fallbackArticle));
    if (item) {
      if (!item.name) item.name = String(row?.title || row?.subjectName || fallbackArticle).trim();
      item.brand = item.brand || String(row?.brandName || '').trim();
    }
  }

  return {
    articles: materializeArticles(articleMap),
    diagnostics: {
      sourceRows,
      positiveRows,
      matchedRows,
      matchRate: sourceRows > 0 ? Number((matchedRows / sourceRows).toFixed(4)) : 0
    }
  };
}

function buildFinanceSellerSummaryReferenceMap(summaryRows, detailedRows) {
  const turnoverByDate = buildFinanceTurnoverMap(detailedRows);
  const deductionsByDate = buildFinanceDeductionMap(detailedRows);
  const byDate = new Map();
  for (const row of Array.isArray(summaryRows) ? summaryRows : []) {
    const date = isoDate(row?.dateFrom || row?.dateTo || row?.createDate);
    if (!date) continue;
    const current = byDate.get(date) || {
      payForGoods: 0,
      logistics: 0,
      storage: 0,
      fines: 0,
      additionalPayments: 0,
      acceptanceOperations: 0,
      deduction: 0,
      cashbackAmount: 0,
      cashbackDiscount: 0,
      cashbackCommissionChange: 0
    };
    current.payForGoods += numberOrZero(row?.forPaySum);
    current.logistics += numberOrZero(row?.deliveryServiceSum);
    current.storage += numberOrZero(row?.paidStorageSum);
    current.fines += numberOrZero(row?.penaltySum);
    current.additionalPayments += numberOrZero(row?.additionalPaymentSum);
    current.acceptanceOperations += numberOrZero(row?.paidAcceptanceSum);
    current.deduction += numberOrZero(row?.deductionSum ?? row?.deduction);
    current.cashbackAmount += numberOrZero(row?.cashbackAmountSum);
    current.cashbackDiscount += numberOrZero(row?.cashbackDiscountSum);
    current.cashbackCommissionChange += numberOrZero(row?.cashbackCommissionChangeSum);
    byDate.set(date, current);
  }

  const result = new Map();
  const dates = new Set([...byDate.keys(), ...turnoverByDate.keys(), ...deductionsByDate.keys()]);
  for (const date of dates) {
    const summary = byDate.get(date) || {};
    const deductionDetails = deductionsByDate.get(date) || {};
    const salesRevenue = Math.round(numberOrZero(turnoverByDate.get(date)));
    const payForGoods = Math.round(numberOrZero(summary.payForGoods));
    if (!(salesRevenue > 0 || payForGoods > 0 || numberOrZero(deductionDetails.deduction) > 0)) continue;
    const logistics = Math.round(numberOrZero(summary.logistics));
    const storage = Math.round(numberOrZero(summary.storage));
    const fines = Math.round(numberOrZero(summary.fines));
    const additionalPayments = Math.round(numberOrZero(summary.additionalPayments));
    const acceptanceOperations = Math.round(numberOrZero(summary.acceptanceOperations));
    const deduction = Math.round((numberOrZero(deductionDetails.deduction) || numberOrZero(summary.deduction)) * 100) / 100;
    const reviewDeduction = Math.round(numberOrZero(deductionDetails.reviewDeduction) * 100) / 100;
    const wbMediaDeduction = Math.round(numberOrZero(deductionDetails.wbMediaDeduction) * 100) / 100;
    const otherDeduction = Math.round(numberOrZero(deductionDetails.otherDeduction) * 100) / 100;
    const cashbackAmount = Math.round(numberOrZero(summary.cashbackAmount) * 100) / 100;
    const cashbackDiscount = Math.round(numberOrZero(summary.cashbackDiscount) * 100) / 100;
    const cashbackCommissionChange = Math.round(numberOrZero(summary.cashbackCommissionChange) * 100) / 100;
    const totalPay = payForGoods
      ? payForGoods - logistics - storage - fines - acceptanceOperations + additionalPayments
      : 0;
    const sellerSummary = {
      source: 'wb-finance-api',
      salesRevenue,
      financeTurnover: salesRevenue,
      payForGoods,
      financialResult: payForGoods,
      logistics,
      storage,
      fines,
      additionalPayments,
      acceptanceOperations,
      deduction,
      reviewDeduction,
      wbMediaDeduction,
      otherDeduction,
      deductionRows: Math.round(numberOrZero(deductionDetails.deductionRows)),
      reviewDeductionRows: Math.round(numberOrZero(deductionDetails.reviewDeductionRows)),
      wbMediaDeductionRows: Math.round(numberOrZero(deductionDetails.wbMediaDeductionRows)),
      cashbackAmount,
      cashbackDiscount,
      cashbackCommissionChange,
      totalPay
    };
    result.set(date, {
      sellerSummary,
      financeTurnover: salesRevenue,
      salesRevenue,
      payForGoods,
      deduction,
      reviewDeduction,
      wbMediaDeduction,
      totalPay,
      source: 'wb-finance-api',
      revenueField: 'finance sales-reports/detailed + sales-reports/list'
    });
  }
  return result;
}

async function fetchWbFinanceReferenceMap(options, skus = []) {
  const warnings = [];
  let summaryRows = [];
  let detailedRows = [];
  let summaryDiagnostics = { pageCount: 0, fetchedRows: 0, warnings: [] };
  let detailedDiagnostics = { pageCount: 0, fetchedRows: 0, warnings: [] };

  try {
    const result = await fetchWbFinanceRows(options);
    summaryRows = result.rows;
    summaryDiagnostics = result.diagnostics;
  } catch (error) {
    warnings.push(error?.message || String(error));
  }

  try {
    const result = await fetchWbFinanceDetailedRows(options);
    detailedRows = result.rows;
    detailedDiagnostics = result.diagnostics;
  } catch (error) {
    warnings.push(error?.message || String(error));
  }

  return {
    referenceMap: buildFinanceSellerSummaryReferenceMap(summaryRows, detailedRows),
    articleLayer: buildFinanceArticles(detailedRows, skus),
    diagnostics: {
      listPageCount: summaryDiagnostics.pageCount,
      listFetchedRows: summaryDiagnostics.fetchedRows,
      detailedPageCount: detailedDiagnostics.pageCount,
      detailedFetchedRows: detailedDiagnostics.fetchedRows,
      warnings: [
        ...warnings,
        ...(summaryDiagnostics.warnings || []),
        ...(detailedDiagnostics.warnings || [])
      ]
    }
  };
}

function buildWbSeries(rows, skus, options) {
  const { byArticle, byNmId } = skuMaps(skus);
  let sourceRows = 0;
  let positiveRows = 0;
  let matchedRows = 0;
  const buckets = new Map();
  const articleMap = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    sourceRows += 1;
    const date = isoDate(row?.dt || row?.date || row?.day || row?.label);
    if (!date || date < options.from || date > options.to) continue;

    const revenue = firstPositiveNumber(row?.ordersSumRub, row?.ordersSum, row?.revenue);
    if (!(revenue > 0)) continue;

    positiveRows += 1;
    const sku = byArticle.get(normalizeKey(row?.supplierArticle || row?.sku || row?.barcode))
      || byNmId.get(String(Math.trunc(numberOrZero(row?.nmID || row?.nmId))));
    if (sku) matchedRows += 1;

    const current = buckets.get(date) || { units: 0, revenue: 0, estimatedMargin: 0 };
    const units = numberOrZero(row?.ordersCount || row?.ordersCnt || row?.quantity);
    const safeUnits = units > 0 ? units : 1;
    current.units += safeUnits;
    current.revenue += revenue;
    if (sku) current.estimatedMargin += revenue * marginForSku(sku);
    buckets.set(date, current);
    addArticlePoint(
      articleMap,
      sku,
      row?.supplierArticle || row?.sku || row?.barcode || row?.nmID || row?.nmId,
      date,
      safeUnits,
      revenue,
      sku ? revenue * marginForSku(sku) : 0
    );
  }

  const dates = enumerateDates(options.from, options.to);
  const latestIndex = dates.length - 1;
  return {
    series: dates.map((date, index) => {
      const item = buckets.get(date) || { units: 0, revenue: 0, estimatedMargin: 0 };
      return {
        dayOffset: latestIndex - index,
        label: date,
        units: Number(item.units.toFixed(4)),
        revenue: Number(item.revenue.toFixed(4)),
        estimatedMargin: Number(item.estimatedMargin.toFixed(4))
      };
    }),
    diagnostics: {
      sourceEndpoint: 'seller-analytics-api:GROUPED_HISTORY_REPORT',
      dateField: 'dt',
      revenueField: 'ordersSumRub',
      revenueSource: 'seller-analytics-api:GROUPED_HISTORY_REPORT',
      sourceRows,
      positiveRows,
      matchedRows,
      matchRate: positiveRows > 0 ? Number((matchedRows / positiveRows).toFixed(4)) : 0
    },
    articles: materializeArticles(articleMap)
  };
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (!options.token) throw new Error('ALTEA_WB_API_TOKEN / ALTEA_WB_PROMOTION_TOKEN is not set');

  const skus = readJson(options.skusPath, []);
  const existing = readJson(options.inputPath, { platforms: [] });
  const stagedExisting = readJson(path.join(process.cwd(), '.altea-google-sheet-sync-output', 'platform_trends.json'), { platforms: [] });
  const wbReport = await fetchWbAnalyticsRows(options);
  const wb = buildWbSeries(wbReport.rows, skus, options);
  const platforms = platformMap(existing);
  const existingWbPlatform = platforms.get('wb') || null;
  const stagedWbPlatform = platformMap(stagedExisting).get('wb') || null;
  const financeReference = await fetchWbFinanceReferenceMap(options, skus);
  const wbReferenceMap = new Map([
    ...wbSellerSummaryReferenceMap(existing, stagedExisting),
    ...financeReference.referenceMap
  ]);
  const marginFallbackSeries = seriesHasPositiveMargin(existingWbPlatform?.series)
    ? existingWbPlatform.series
    : (stagedWbPlatform?.series || existingWbPlatform?.series || []);
  const hasFreshWbData = wb.diagnostics.positiveRows > 0;
  const freshWbSeries = hasFreshWbData && wb.series.length
    ? wb.series
    : Array.isArray(existingWbPlatform?.series) && existingWbPlatform.series.length
      ? existingWbPlatform.series
      : wb.series;
  const fallbackByDate = new Map((Array.isArray(existingWbPlatform?.series) ? existingWbPlatform.series : [])
    .map((point) => [isoDate(point?.label || point?.date), point])
    .filter(([date]) => date));
  const partialWarnings = [];
  const wbSeries = (Array.isArray(freshWbSeries) ? freshWbSeries : []).map((point) => {
    const date = isoDate(point?.label || point?.date);
    const fallback = fallbackByDate.get(date) || null;
    if (!shouldPreserveFallbackPoint(date, point, fallback, options)) return point;
    partialWarnings.push(`${date}: preserved existing WB point because fresh revenue ${Math.round(numberOrZero(point.revenue))} is below ${Math.round(options.partialRefreshMinRatio * 100)}% of existing ${Math.round(numberOrZero(fallback.revenue))}`);
    return {
      ...fallback,
      label: date,
      date: fallback.date || date
    };
  });
  const wbSeriesWithMargin = wb.diagnostics.matchedRows === 0 && marginFallbackSeries.length
    ? mergeEstimatedMarginFallback(wbSeries, marginFallbackSeries)
    : wbSeries;
  const wbSeriesFinal = applyWbSellerSummaryReference(wbSeriesWithMargin, wbReferenceMap);

  platforms.set('wb', {
    key: 'wb',
    label: PLATFORM_LABELS.wb,
    series: wbSeriesFinal
  });
  platforms.set('all', {
    key: 'all',
    label: PLATFORM_LABELS.all,
    series: mergeAllSeries(platforms)
  });

  const ordered = ['wb', 'ozon', 'ya', 'all']
    .map((key) => platforms.get(key) || { key, label: PLATFORM_LABELS[key] || key, series: [] });
  const wbLatestMarketplaceDate = [...wbSeriesFinal]
    .reverse()
    .find((item) => numberOrZero(item?.revenue) > 0 || numberOrZero(item?.units) > 0)?.label
    || '';
  const latestMarketplaceDate = latestDateFromPlatforms(platforms) || wbLatestMarketplaceDate || existing.latestMarketplaceDate || '';
  const hasFinanceSkuLayer = Boolean(financeReference.articleLayer?.articles?.length);
  const wbSourceArticles = hasFinanceSkuLayer ? financeReference.articleLayer.articles : wb.articles;
  const wbSourceSeries = hasFinanceSkuLayer
    ? Array.from(financeReference.referenceMap.entries()).map(([date, item]) => ({
      label: date,
      revenue: numberOrZero(item?.salesRevenue ?? item?.financeTurnover),
      units: 0
    }))
    : wb.series;
  const wbArticles = scaleArticlesToSeries(wbSourceArticles, wbSourceSeries, wbSeriesFinal);
  const existingExtraMarketplace = existing?.extraMarketplace && typeof existing.extraMarketplace === 'object'
    ? existing.extraMarketplace
    : {};
  const existingExtraPlatforms = existingExtraMarketplace?.platforms && typeof existingExtraMarketplace.platforms === 'object'
    ? existingExtraMarketplace.platforms
    : {};
  const payload = {
    ...existing,
    generatedAt: new Date().toISOString(),
    latestMarketplaceDate,
    platforms: ordered,
    wbApiDirect: {
      source: 'seller-analytics-api:GROUPED_HISTORY_REPORT',
      reportType: 'GROUPED_HISTORY_REPORT',
      from: options.from,
      to: options.to,
      financePageCount: financeReference.diagnostics.listPageCount,
      financeFetchedRows: financeReference.diagnostics.listFetchedRows,
      financeDetailedPageCount: financeReference.diagnostics.detailedPageCount,
      financeDetailedFetchedRows: financeReference.diagnostics.detailedFetchedRows,
      financeArticleRows: financeReference.articleLayer?.articles?.length || 0,
      financeArticleSourceRows: financeReference.articleLayer?.diagnostics?.sourceRows || 0,
      financeArticleMatchedRows: financeReference.articleLayer?.diagnostics?.matchedRows || 0,
      settlementHour: options.settlementHour,
      autoLagDays: options.explicitTo ? 0 : options.autoLagDays,
      explicitTo: options.explicitTo,
      partialRefreshGuard: {
        recentDays: options.partialRefreshRecentDays,
        minRatio: options.partialRefreshMinRatio
      },
      pageCount: wbReport.diagnostics.pageCount,
      fetchedRows: wbReport.diagnostics.fetchedRows,
      revenueField: 'ordersSumRub',
      revenueSource: 'seller-analytics-api:GROUPED_HISTORY_REPORT',
      ...wb.diagnostics
    },
    wbSellerSummaryReference: existing.wbSellerSummaryReference || stagedExisting.wbSellerSummaryReference || undefined,
    extraMarketplace: {
      ...existingExtraMarketplace,
      generatedAt: new Date().toISOString(),
      asOfDate: latestMarketplaceDate,
      platforms: {
        ...existingExtraPlatforms,
        wb: {
          key: 'wb',
          label: PLATFORM_LABELS.wb,
          supportKey: 'wb',
          source: hasFinanceSkuLayer ? 'wb-finance-api:sales-reports/detailed' : 'seller-analytics-api:GROUPED_HISTORY_REPORT',
          sourceMode: hasFinanceSkuLayer ? 'wb-finance-api-direct-sku' : 'all',
          from: options.from,
          to: options.to,
          articles: wbArticles
        }
      }
    }
  };

  if (wbReferenceMap.size > 0) {
    payload.wbApiDirect.revenueField = 'ordersSumRub / seller-summary-reference';
    payload.wbApiDirect.revenueSource = 'seller-analytics-api:GROUPED_HISTORY_REPORT + wb seller summary reconciliation';
    payload.wbApiDirect.referenceDaysApplied = wbReferenceMap.size;
    payload.wbApiDirect.financeReferenceDaysApplied = financeReference.referenceMap.size;
  }

  if (!hasFreshWbData && wbReport.diagnostics.fetchedRows === 0) {
    payload.wbApiDirect.warnings = [
      ...(payload.wbApiDirect.warnings || []),
      'WB analytics CSV API returned no rows for the requested date range; existing WB series was preserved.'
    ];
  }

  if (partialWarnings.length) {
    payload.wbApiDirect.warnings = [
      ...(payload.wbApiDirect.warnings || []),
      ...partialWarnings
    ];
  }

  if (wbReport.diagnostics.warnings.length) {
    payload.wbApiDirect.warnings = [
      ...(payload.wbApiDirect.warnings || []),
      ...wbReport.diagnostics.warnings
    ];
  }

  if (financeReference.diagnostics.warnings.length) {
    payload.wbApiDirect.warnings = [
      ...(payload.wbApiDirect.warnings || []),
      ...financeReference.diagnostics.warnings
    ];
  }

  writeJson(options.outputPath, payload);
  console.log(JSON.stringify({
    outputPath: options.outputPath,
    generatedAt: payload.generatedAt,
    latestMarketplaceDate,
    wbPoints: wb.series.length,
    wbArticleRows: wbArticles.length,
    wbArticleSource: hasFinanceSkuLayer ? 'wb-finance-api-direct-sku' : 'seller-analytics-api:GROUPED_HISTORY_REPORT',
    ...payload.wbApiDirect
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
