#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { execFileSync } = require('child_process');

const FINANCE_API_BASE_URL = 'https://finance-api.wildberries.ru';
const FINANCE_PATH = '/api/finance/v1/sales-reports/list';
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
  const to = isoDate(args.to || args['date-to'] || new Date().toISOString().slice(0, 10));
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

function platformMap(platformTrends) {
  const map = new Map();
  for (const platform of Array.isArray(platformTrends?.platforms) ? platformTrends.platforms : []) {
    map.set(String(platform?.key || '').trim(), platform);
  }
  return map;
}

function mergeAllSeries(platforms) {
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
    const total = { units: 0, revenue: 0, estimatedMargin: 0 };
    for (const key of ['wb', 'ozon', 'ya']) {
      const point = (platforms.get(key)?.series || []).find((item) => isoDate(item?.label || item?.date) === date);
      if (!point) continue;
      total.units += numberOrZero(point.units);
      total.revenue += numberOrZero(point.revenue);
      total.estimatedMargin += numberOrZero(point.estimatedMargin);
    }
    return {
      dayOffset: latestIndex - index,
      label: date,
      units: Number(total.units.toFixed(4)),
      revenue: Number(total.revenue.toFixed(4)),
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
    return {
      ...point,
      units: reference.units || point.units,
      revenue: reference.revenue,
      wbSellerSummary: reference.sellerSummary || point.wbSellerSummary || null,
      wbSellerSummaryReferenceRevenue: reference.revenue,
      wbSellerSummaryReferenceUnits: reference.units || null,
      wbSellerSummaryFinanceTurnover: reference.financeTurnover || point.wbSellerSummaryFinanceTurnover || null,
      wbSellerSummarySalesRevenue: reference.salesRevenue || point.wbSellerSummarySalesRevenue || null,
      wbSellerSummaryPayForGoods: reference.payForGoods || point.wbSellerSummaryPayForGoods || null,
      wbSellerSummaryTotalPay: reference.totalPay || point.wbSellerSummaryTotalPay || null,
      wbSellerSummaryTurnoverDays: reference.turnoverDays,
      financeTurnover: reference.financeTurnover || point.financeTurnover || null,
      financialResult: reference.payForGoods || point.financialResult || null
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

async function wbFinanceRequest(options, body) {
  const url = new URL(`${options.financeApiBaseUrl}${FINANCE_PATH}`);

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
        throw new Error(`WB finance API ${FINANCE_PATH} rate-limited after retries: HTTP 429 ${text.slice(0, 500)}`);
      }
      await sleep(waitMs);
      continue;
    }

    if (attempt === 6) {
      throw new Error(`WB finance API ${FINANCE_PATH} failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    }
    await sleep(attempt * 2000);
  }

  throw new Error(`WB finance API ${FINANCE_PATH} failed after retries`);
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
  const result = await wbFinanceRequest(options, {
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

function buildWbSeries(rows, skus, options) {
  const { byArticle, byNmId } = skuMaps(skus);
  let sourceRows = 0;
  let positiveRows = 0;
  let matchedRows = 0;
  const buckets = new Map();

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
    current.units += units > 0 ? units : 1;
    current.revenue += revenue;
    if (sku) current.estimatedMargin += revenue * marginForSku(sku);
    buckets.set(date, current);
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
    }
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
  const wbReferenceMap = wbSellerSummaryReferenceMap(existing, stagedExisting);
  const marginFallbackSeries = seriesHasPositiveMargin(existingWbPlatform?.series)
    ? existingWbPlatform.series
    : (stagedWbPlatform?.series || existingWbPlatform?.series || []);
  const hasFreshWbData = wb.diagnostics.positiveRows > 0;
  const wbSeries = hasFreshWbData && wb.series.length
    ? wb.series
    : Array.isArray(existingWbPlatform?.series) && existingWbPlatform.series.length
      ? existingWbPlatform.series
      : wb.series;
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
  const latestMarketplaceDate = [...wbSeriesFinal]
    .reverse()
    .find((item) => numberOrZero(item?.revenue) > 0 || numberOrZero(item?.units) > 0)?.label
    || existing.latestMarketplaceDate
    || '';
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
      financePageCount: 0,
      financeFetchedRows: 0,
      pageCount: wbReport.diagnostics.pageCount,
      fetchedRows: wbReport.diagnostics.fetchedRows,
      revenueField: 'ordersSumRub',
      revenueSource: 'seller-analytics-api:GROUPED_HISTORY_REPORT',
      ...wb.diagnostics
    },
    wbSellerSummaryReference: existing.wbSellerSummaryReference || stagedExisting.wbSellerSummaryReference || undefined
  };

  if (wbReferenceMap.size > 0) {
    payload.wbApiDirect.revenueField = 'ordersSumRub / seller-summary-reference';
    payload.wbApiDirect.revenueSource = 'seller-analytics-api:GROUPED_HISTORY_REPORT + wb seller summary reconciliation';
    payload.wbApiDirect.referenceDaysApplied = wbReferenceMap.size;
  }

  if (!hasFreshWbData && wbReport.diagnostics.fetchedRows === 0) {
    payload.wbApiDirect.warnings = [
      ...(payload.wbApiDirect.warnings || []),
      'WB analytics CSV API returned no rows for the requested date range; existing WB series was preserved.'
    ];
  }

  if (wbReport.diagnostics.warnings.length) {
    payload.wbApiDirect.warnings = [
      ...(payload.wbApiDirect.warnings || []),
      ...wbReport.diagnostics.warnings
    ];
  }

  writeJson(options.outputPath, payload);
  console.log(JSON.stringify({
    outputPath: options.outputPath,
    generatedAt: payload.generatedAt,
    latestMarketplaceDate,
    wbPoints: wb.series.length,
    ...payload.wbApiDirect
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
