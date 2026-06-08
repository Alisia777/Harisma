#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'https://api-seller.ozon.ru';
const ANALYTICS_METRICS = ['revenue', 'ordered_units', 'delivered_units'];
const ANALYTICS_DIMENSION = ['sku', 'day'];
const PRODUCT_INFO_CHUNK_SIZE = 100;

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
    .replace(/[^a-zа-яё0-9]+/giu, '');
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

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function hasMetric(row, index) {
  return Array.isArray(row?.metrics) && row.metrics.length > index;
}

function resolveOptions(args) {
  const root = process.cwd();
  const settlementHour = Math.max(0, Math.min(23, Math.trunc(numberOrZero(args['settlement-hour'] || process.env.ALTEA_OZON_SETTLEMENT_HOUR || 10))));
  const explicitTo = isoDate(args.to || args['date-to']);
  const autoLagDays = new Date().getHours() < settlementHour ? 2 : 1;
  const to = explicitTo || localDateKey(-autoLagDays);
  const from = isoDate(args.from || args['date-from'] || `${to.slice(0, 7)}-01`);
  return {
    clientId: String(args['client-id'] || process.env.ALTEA_OZON_CLIENT_ID || '').trim(),
    apiKey: String(args['api-key'] || process.env.ALTEA_OZON_API_KEY || '').trim(),
    apiBaseUrl: String(args['api-base-url'] || API_BASE_URL).replace(/\/+$/, ''),
    skusPath: path.resolve(args['skus-file'] || path.join(root, 'data', 'skus.json')),
    inputPath: path.resolve(args['input-file'] || path.join(root, 'data', 'platform_trends.json')),
    outputPath: path.resolve(args['output-file'] || path.join(root, 'data', 'platform_trends.json')),
    sourceMode: ['all', 'matched'].includes(String(args['source-mode'] || '').trim())
      ? String(args['source-mode']).trim()
      : 'all',
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
  const byOfferId = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    for (const value of [
      sku?.articleKey,
      sku?.article,
      sku?.name,
      sku?.title,
      sku?.ozon?.offerId,
      sku?.ozon?.offer_id,
      sku?.ozon?.sku
    ]) {
      const key = normalizeKey(value);
      if (key && !byOfferId.has(key)) byOfferId.set(key, sku);
    }
  }
  return { byOfferId };
}

function marginForSku(sku) {
  return numberOrZero(sku?.ozon?.marginPct);
}

function articleKeyForSku(sku, fallback = '') {
  return String(
    sku?.articleKey
    || sku?.article
    || sku?.sku
    || sku?.vendorCode
    || fallback
    || ''
  ).trim();
}

function articleNameForSku(sku, fallback = '') {
  return String(sku?.name || sku?.title || fallback || '').trim();
}

function ownerForSku(sku) {
  return String(
    sku?.owner?.byPlatform?.ozon
    || sku?.owner?.name
    || sku?.owner
    || ''
  ).trim();
}

function addArticlePoint(map, sku, fallbackKey, dateKey, quantity, deliveredUnits, revenue, estimatedMargin) {
  const articleKey = articleKeyForSku(sku, fallbackKey);
  if (!articleKey) return;
  let item = map.get(articleKey);
  if (!item) {
    item = {
      platformKey: 'ozon',
      platformLabel: 'Ozon',
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
    deliveredUnits: 0,
    revenue: 0,
    ordersRevenue: 0,
    estimatedMargin: 0
  };
  point.units += quantity;
  point.ordersUnits += quantity;
  point.deliveredUnits += deliveredUnits;
  point.revenue += revenue;
  point.ordersRevenue += revenue;
  point.estimatedMargin += estimatedMargin;
  if (quantity > 0 && revenue > 0) point.price = revenue / quantity;
  item.dailyByDate.set(dateKey, point);
}

async function analyticsRequest(options, body) {
  const response = await fetch(`${options.apiBaseUrl}/v1/analytics/data`, {
    method: 'POST',
    headers: {
      'Client-Id': options.clientId,
      'Api-Key': options.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(`Ozon analytics API failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return payload;
}

async function productInfoRequest(options, skuIds) {
  const response = await fetch(`${options.apiBaseUrl}/v3/product/info/list`, {
    method: 'POST',
    headers: {
      'Client-Id': options.clientId,
      'Api-Key': options.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sku: skuIds.map((item) => String(item)) })
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(`Ozon product info API failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return Array.isArray(payload?.items) ? payload.items : [];
}

function analyticsSkuId(row = {}) {
  const dimensions = Array.isArray(row?.dimensions) ? row.dimensions : [];
  const skuDimension = dimensions.find((dimension) => {
    const id = String(dimension?.id || '').trim();
    return id && !isoDate(id);
  });
  const id = String(skuDimension?.id || row?.sku || row?.item?.sku || '').trim();
  return /^\d+$/.test(id) ? id : '';
}

async function fetchProductInfoMap(options, skuIds) {
  const ids = Array.from(new Set(Array.from(skuIds || []).map((item) => String(item || '').trim()).filter(Boolean)));
  const map = new Map();
  const warnings = [];
  for (let index = 0; index < ids.length; index += PRODUCT_INFO_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + PRODUCT_INFO_CHUNK_SIZE);
    try {
      const items = await productInfoRequest(options, chunk);
      for (const item of items) {
        const keys = [
          item?.sku,
          ...(Array.isArray(item?.sources) ? item.sources.map((source) => source?.sku) : []),
          ...(Array.isArray(item?.stocks?.stocks) ? item.stocks.stocks.map((stock) => stock?.sku) : [])
        ].map((value) => String(value || '').trim()).filter(Boolean);
        for (const key of keys) {
          if (!map.has(key)) map.set(key, item);
        }
      }
    } catch (error) {
      warnings.push(error?.message || String(error));
    }
  }
  return { map, requested: ids.length, matched: map.size, warnings };
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.result?.data)) return payload.result.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function extractQuantity(row) {
  if (hasMetric(row, 1)) return numberOrZero(row.metrics[1]);
  return (
    numberOrZero(row?.delivery_commission?.quantity)
    || numberOrZero(row?.return_commission?.quantity)
    || numberOrZero(row?.quantity)
    || 1
  );
}

function extractDeliveredUnits(row) {
  if (hasMetric(row, 2)) return numberOrZero(row.metrics[2]);
  return 0;
}

function extractRevenue(row, quantity) {
  if (hasMetric(row, 0)) return numberOrZero(row.metrics[0]);
  const sellerPrice = numberOrZero(row?.seller_price_per_instance);
  if (sellerPrice > 0) return sellerPrice * Math.max(1, quantity);
  const deliveryTotal = numberOrZero(row?.delivery_commission?.total);
  if (deliveryTotal > 0) return deliveryTotal;
  const returnTotal = numberOrZero(row?.return_commission?.total);
  if (returnTotal > 0) return returnTotal;
  return 0;
}

function clonePoint(point = {}) {
  return {
    dayOffset: numberOrZero(point.dayOffset),
    label: isoDate(point.label || point.date),
    units: numberOrZero(point.units),
    ordersUnits: numberOrZero(point.ordersUnits ?? point.units),
    deliveredUnits: numberOrZero(point.deliveredUnits),
    revenue: numberOrZero(point.revenue),
    ordersRevenue: numberOrZero(point.ordersRevenue ?? point.revenue),
    estimatedMargin: numberOrZero(point.estimatedMargin)
  };
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
    const total = { units: 0, ordersUnits: 0, deliveredUnits: 0, revenue: 0, ordersRevenue: 0, estimatedMargin: 0 };
    for (const key of ['wb', 'ozon', 'ya']) {
      const point = (platforms.get(key)?.series || []).find((item) => isoDate(item?.label || item?.date) === date);
      if (!point) continue;
      const ordersUnits = numberOrZero(point.ordersUnits ?? point.units);
      const revenue = numberOrZero(point.ordersRevenue ?? point.revenue);
      total.units += numberOrZero(point.units);
      total.ordersUnits += ordersUnits;
      total.deliveredUnits += numberOrZero(point.deliveredUnits);
      total.revenue += numberOrZero(point.revenue);
      total.ordersRevenue += revenue;
      total.estimatedMargin += numberOrZero(point.estimatedMargin);
    }
    return {
      dayOffset: latestIndex - index,
      label: date,
      units: Number(total.units.toFixed(4)),
      ordersUnits: Number(total.ordersUnits.toFixed(4)),
      deliveredUnits: Number(total.deliveredUnits.toFixed(4)),
      revenue: Number(total.revenue.toFixed(4)),
      ordersRevenue: Number(total.ordersRevenue.toFixed(4)),
      estimatedMargin: Number(total.estimatedMargin.toFixed(4))
    };
  });
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

function buildDayBuckets(rows, skus, dateKey, apiOk = true, productInfoBySku = new Map()) {
  const { byOfferId } = skuMaps(skus);
  const all = { units: 0, ordersUnits: 0, deliveredUnits: 0, revenue: 0, ordersRevenue: 0, estimatedMargin: 0, sourceRows: 0, matchedRows: 0 };
  const matched = { units: 0, ordersUnits: 0, deliveredUnits: 0, revenue: 0, ordersRevenue: 0, estimatedMargin: 0, sourceRows: 0, matchedRows: 0 };
  const allArticles = new Map();
  const matchedArticles = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const skuId = analyticsSkuId(row);
    const productInfo = productInfoBySku.get(skuId) || null;
    const offerCandidates = [
      productInfo?.offer_id,
      productInfo?.sku,
      productInfo?.name,
      row?.dimensions?.[0]?.id,
      row?.dimensions?.[0]?.name,
      row?.item?.offer_id,
      row?.item?.offerId,
      row?.offer_id,
      row?.offerId,
      row?.item?.sku,
      row?.sku
    ].map(normalizeKey).filter(Boolean);
    const offerId = offerCandidates.find((candidate) => byOfferId.has(candidate)) || offerCandidates[0] || '';
    const sku = byOfferId.get(offerId);
    const quantity = extractQuantity(row);
    const deliveredUnits = extractDeliveredUnits(row);
    const revenue = extractRevenue(row, quantity);
    const estimatedMargin = sku ? revenue * marginForSku(sku) : 0;
    const fallbackArticleKey = productInfo?.offer_id || offerId;

    all.sourceRows += 1;
    all.units += quantity;
    all.ordersUnits += quantity;
    all.deliveredUnits += deliveredUnits;
    all.revenue += revenue;
    all.ordersRevenue += revenue;
    if (sku) {
      all.matchedRows += 1;
      all.estimatedMargin += estimatedMargin;
    }
    addArticlePoint(allArticles, sku, fallbackArticleKey, dateKey, quantity, deliveredUnits, revenue, estimatedMargin);

    if (sku) {
      matched.sourceRows += 1;
      matched.matchedRows += 1;
      matched.units += quantity;
      matched.ordersUnits += quantity;
      matched.deliveredUnits += deliveredUnits;
      matched.revenue += revenue;
      matched.ordersRevenue += revenue;
      matched.estimatedMargin += estimatedMargin;
      addArticlePoint(matchedArticles, sku, fallbackArticleKey, dateKey, quantity, deliveredUnits, revenue, estimatedMargin);
    }
  }

  return {
    date: dateKey,
    apiOk,
    all,
    matched,
    allArticles,
    matchedArticles
  };
}

function mergeArticleMaps(target, source) {
  for (const [articleKey, sourceItem] of source || []) {
    let item = target.get(articleKey);
    if (!item) {
      item = {
        platformKey: 'ozon',
        platformLabel: 'Ozon',
        articleKey,
        article: sourceItem.article || articleKey,
        name: sourceItem.name || '',
        owner: sourceItem.owner || '',
        dailyByDate: new Map(),
        sourceRows: 0,
        matchedRows: 0
      };
      target.set(articleKey, item);
    }
    if (!item.name) item.name = sourceItem.name || '';
    if (!item.owner) item.owner = sourceItem.owner || '';
    item.sourceRows += numberOrZero(sourceItem.sourceRows);
    item.matchedRows += numberOrZero(sourceItem.matchedRows);
    for (const [dateKey, sourcePoint] of sourceItem.dailyByDate || []) {
      const point = item.dailyByDate.get(dateKey) || {
        date: dateKey,
        units: 0,
        ordersUnits: 0,
        deliveredUnits: 0,
        revenue: 0,
        ordersRevenue: 0,
        estimatedMargin: 0
      };
      point.units += numberOrZero(sourcePoint.units);
      point.ordersUnits += numberOrZero(sourcePoint.ordersUnits ?? sourcePoint.units);
      point.deliveredUnits += numberOrZero(sourcePoint.deliveredUnits);
      point.revenue += numberOrZero(sourcePoint.revenue);
      point.ordersRevenue += numberOrZero(sourcePoint.ordersRevenue ?? sourcePoint.revenue);
      point.estimatedMargin += numberOrZero(sourcePoint.estimatedMargin);
      if (point.ordersUnits > 0 && point.revenue > 0) point.price = point.revenue / point.ordersUnits;
      item.dailyByDate.set(dateKey, point);
    }
  }
}

function roundPoint(point, latestIndex, index) {
  const ordersUnits = numberOrZero(point.ordersUnits ?? point.units);
  const revenue = numberOrZero(point.revenue);
  return {
    date: point.date,
    dayOffset: latestIndex - index,
    units: Number(numberOrZero(point.units).toFixed(4)),
    ordersUnits: Number(ordersUnits.toFixed(4)),
    deliveredUnits: Number(numberOrZero(point.deliveredUnits).toFixed(4)),
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
      const roundedDaily = daily.map((point, index) => roundPoint(point, latestIndex, index));
      const latestPoint = roundedDaily[roundedDaily.length - 1] || {};
      const currentPrice = numberOrZero(latestPoint.price);
      return {
        platformKey: 'ozon',
        platformLabel: 'Ozon',
        articleKey: item.articleKey,
        article: item.article || item.articleKey,
        name: item.name || item.article || item.articleKey,
        owner: item.owner || '',
        currentPrice,
        currentClientPrice: currentPrice,
        currentFillPrice: currentPrice,
        sourceRows: item.sourceRows,
        matchedRows: item.matchedRows,
        sourceMode: 'ozon-api-direct-sku',
        daily: roundedDaily
      };
    })
    .filter((item) => item.daily.length)
    .sort((left, right) => String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru'));
}

function materializePoint(dateKey, bucket, mode, fallbackPoint = null, dayOffset = 0) {
  const selected = mode === 'matched' ? bucket.matched : bucket.all;
  if (selected.sourceRows === 0 && fallbackPoint) {
    return {
      dayOffset,
      label: dateKey,
      units: Number(numberOrZero(fallbackPoint.units).toFixed(4)),
      ordersUnits: Number(numberOrZero(fallbackPoint.ordersUnits ?? fallbackPoint.units).toFixed(4)),
      deliveredUnits: Number(numberOrZero(fallbackPoint.deliveredUnits).toFixed(4)),
      revenue: Number(numberOrZero(fallbackPoint.revenue).toFixed(4)),
      ordersRevenue: Number(numberOrZero(fallbackPoint.ordersRevenue ?? fallbackPoint.revenue).toFixed(4)),
      estimatedMargin: Number(numberOrZero(fallbackPoint.estimatedMargin).toFixed(4))
    };
  }
  return {
    dayOffset,
    label: dateKey,
    units: Number(numberOrZero(selected.units).toFixed(4)),
    ordersUnits: Number(numberOrZero(selected.ordersUnits ?? selected.units).toFixed(4)),
    deliveredUnits: Number(numberOrZero(selected.deliveredUnits).toFixed(4)),
    revenue: Number(numberOrZero(selected.revenue).toFixed(4)),
    ordersRevenue: Number(numberOrZero(selected.ordersRevenue ?? selected.revenue).toFixed(4)),
    estimatedMargin: Number(numberOrZero(selected.estimatedMargin).toFixed(4))
  };
}

function shouldPreserveFallbackPoint(dateKey, selected, fallbackPoint, options) {
  if (!fallbackPoint || !dateKey || !options) return false;
  const daysFromWindowEnd = Math.round((new Date(`${options.to}T00:00:00Z`) - new Date(`${dateKey}T00:00:00Z`)) / 86400000);
  if (daysFromWindowEnd < 0 || daysFromWindowEnd > options.partialRefreshRecentDays) return false;
  const freshRevenue = numberOrZero(selected?.revenue);
  const existingRevenue = numberOrZero(fallbackPoint?.revenue);
  if (!(existingRevenue > 0)) return false;
  if (freshRevenue <= 0) return true;
  return freshRevenue < existingRevenue * options.partialRefreshMinRatio;
}

async function fetchExistingPoints(options) {
  const existing = readJson(options.inputPath, { platforms: [] });
  const platform = (Array.isArray(existing?.platforms) ? existing.platforms : []).find((item) => String(item?.key || '').trim() === 'ozon');
  const map = new Map();
  for (const point of Array.isArray(platform?.series) ? platform.series : []) {
    const date = isoDate(point?.label || point?.date);
    if (!date) continue;
    map.set(date, clonePoint(point));
  }
  const warningDates = new Set(
    (Array.isArray(existing?.ozonApiDirect?.warnings) ? existing.ozonApiDirect.warnings : [])
      .map((warning) => isoDate(String(warning || '').slice(0, 10)))
      .filter(Boolean)
  );
  return { existing, map, warningDates };
}

async function fetchDayReport(options, dateKey) {
  const limit = 1000;
  const attempts = 5;
  const rows = [];

  for (let offset = 0; ; offset += limit) {
    const body = {
      date_from: dateKey,
      date_to: dateKey,
      metrics: ANALYTICS_METRICS,
      dimension: ANALYTICS_DIMENSION,
      filters: [],
      sort: [{ key: 'revenue', order: 'DESC' }],
      limit,
      offset
    };

    let payload = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        payload = await analyticsRequest(options, body);
        break;
      } catch (error) {
        const status = Number(error?.status || 0);
        if (attempt < attempts && (status === 429 || status >= 500 || status === 0)) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          continue;
        }
        if (status === 404 || status === 409 || status === 403) {
          return {
            ok: false,
            rows: [],
            warnings: [`${dateKey}: Ozon analytics API returned HTTP ${status}`]
          };
        }
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          continue;
        }
        return {
          ok: false,
          rows: [],
          warnings: [`${dateKey}: ${String(error?.message || error)}`]
        };
      }
    }

    if (!payload) {
      return {
        ok: false,
        rows: [],
        warnings: [`${dateKey}: Ozon analytics API failed without payload`]
      };
    }

    const batch = extractRows(payload);
    rows.push(...batch);
    if (batch.length < limit) break;
  }

  return { ok: true, rows, warnings: [] };
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (!options.clientId || !options.apiKey) {
    console.warn('Ozon API credentials are not set. Preserve existing platform_trends.json and skip Ozon refresh.');
    process.exitCode = 0;
    return;
  }

  const skus = readJson(options.skusPath, []);
  const { existing, map: existingOzonSeries, warningDates: existingWarningDates } = await fetchExistingPoints(options);
  const existingPlatforms = platformMap(existing);
  const dates = enumerateDates(options.from, options.to);
  const buckets = new Map();
  const warnings = [];
  let sourceRows = 0;
  let matchedRows = 0;
  const selectedArticleMap = new Map();
  const dayReports = [];
  const apiSkuIds = new Set();

  for (const dateKey of dates) {
    const result = await fetchDayReport(options, dateKey);
    warnings.push(...(result.warnings || []));
    dayReports.push({ dateKey, result });
    for (const row of result.rows || []) {
      const skuId = analyticsSkuId(row);
      if (skuId) apiSkuIds.add(skuId);
    }
  }

  const productInfo = await fetchProductInfoMap(options, apiSkuIds);
  warnings.push(...productInfo.warnings.map((warning) => `product-info: ${warning}`));

  for (const { dateKey, result } of dayReports) {
    const bucket = buildDayBuckets(result.rows, skus, dateKey, result.ok, productInfo.map);
    buckets.set(dateKey, bucket);
    sourceRows += bucket.all.sourceRows;
    matchedRows += bucket.all.matchedRows;
    mergeArticleMaps(
      selectedArticleMap,
      options.sourceMode === 'matched' ? bucket.matchedArticles : bucket.allArticles
    );
  }

  const selectedMode = options.sourceMode;
  const rawSeries = dates.map((dateKey) => {
    const bucket = buckets.get(dateKey) || {
      date: dateKey,
      apiOk: false,
      all: { units: 0, revenue: 0, estimatedMargin: 0, sourceRows: 0, matchedRows: 0 },
      matched: { units: 0, revenue: 0, estimatedMargin: 0, sourceRows: 0, matchedRows: 0 }
    };
    const fallbackPoint = existingWarningDates.has(dateKey) ? null : existingOzonSeries.get(dateKey) || null;
    const selected = selectedMode === 'matched' ? bucket.matched : bucket.all;
    if (!bucket.apiOk && selected.sourceRows === 0 && !fallbackPoint) return null;
    const preserveFallback = shouldPreserveFallbackPoint(dateKey, selected, fallbackPoint, options);
    if (preserveFallback) {
      warnings.push(`${dateKey}: preserved existing Ozon point because fresh API revenue ${roundMoney(selected.revenue)} is below ${Math.round(options.partialRefreshMinRatio * 100)}% of existing ${roundMoney(fallbackPoint.revenue)}`);
    }
    const point = preserveFallback
      ? { ...clonePoint(fallbackPoint), label: dateKey }
      : materializePoint(dateKey, bucket, selectedMode, fallbackPoint, 0);
    return { dateKey, point };
  }).filter(Boolean);
  if (!sourceRows && !rawSeries.length) {
    console.warn('Ozon marketplace refresh returned no effective rows. Preserve existing platform_trends.json.');
    console.log(JSON.stringify({
      outputPath: options.outputPath,
      skipped: true,
      reason: 'no-effective-ozon-marketplace-rows',
      from: options.from,
      to: options.to,
      sourceRows,
      matchedRows,
      articleRows: 0,
      productInfoRequested: productInfo.requested,
      productInfoMatchedKeys: productInfo.matched,
      sourceMode: selectedMode,
      warnings: Array.from(new Set(warnings))
    }, null, 2));
    return;
  }
  const series = rawSeries.map(({ dateKey, point }, index) => {
    const dayOffset = rawSeries.length - 1 - index;
    return {
      dayOffset,
      label: point.label || dateKey,
      units: Number(point.units.toFixed(4)),
      ordersUnits: Number(numberOrZero(point.ordersUnits ?? point.units).toFixed(4)),
      deliveredUnits: Number(numberOrZero(point.deliveredUnits).toFixed(4)),
      revenue: Number(point.revenue.toFixed(4)),
      ordersRevenue: Number(numberOrZero(point.ordersRevenue ?? point.revenue).toFixed(4)),
      estimatedMargin: Number(point.estimatedMargin.toFixed(4))
    };
  });

  const ozonLatestMarketplaceDate = series.map((item) => item.label).filter(Boolean).sort().pop() || '';
  const platforms = ['wb', 'ozon', 'ya', 'all']
    .map((key) => existingPlatforms.get(key) || { key, label: key, series: [] });
  const ozonIndex = platforms.findIndex((platform) => String(platform?.key || '').trim() === 'ozon');
  const ozonSeries = series;
  if (ozonIndex >= 0) {
    platforms[ozonIndex] = {
      key: 'ozon',
      label: 'Ozon',
      series: ozonSeries
    };
  } else {
    platforms.splice(1, 0, {
      key: 'ozon',
      label: 'Ozon',
      series: ozonSeries
    });
  }

  const platformMapNext = new Map(platforms.map((platform) => [String(platform?.key || '').trim(), platform]));
  platformMapNext.set('all', {
    key: 'all',
    label: 'Все площадки',
    series: mergeAllSeries(platformMapNext)
  });
  const latestMarketplaceDate = latestDateFromPlatforms(platformMapNext) || ozonLatestMarketplaceDate || existing.latestMarketplaceDate || '';

  const ordered = ['wb', 'ozon', 'ya', 'all']
    .map((key) => platformMapNext.get(key) || { key, label: key, series: [] });
  const ozonArticles = materializeArticles(selectedArticleMap);
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
    note: 'Marketplace facts refreshed from Ozon analytics API-backed platform_trends.json.',
    platforms: ordered,
    ozonApiDirect: {
      source: 'analytics-api:/v1/analytics/data',
      from: options.from,
      to: options.to,
      sourceRows,
      matchedRows,
      matchRate: sourceRows > 0 ? Number((matchedRows / sourceRows).toFixed(4)) : 0,
      productInfoRequested: productInfo.requested,
      productInfoMatchedKeys: productInfo.matched,
      sourceMode: selectedMode,
      dimension: ANALYTICS_DIMENSION.join(','),
      revenueField: 'orders_revenue',
      unitsField: 'ordered_units',
      deliveredUnitsField: 'delivered_units',
      settlementHour: options.settlementHour,
      autoLagDays: options.explicitTo ? 0 : options.autoLagDays,
      explicitTo: options.explicitTo,
      partialRefreshGuard: {
        recentDays: options.partialRefreshRecentDays,
        minRatio: options.partialRefreshMinRatio
      }
    },
    extraMarketplace: {
      ...existingExtraMarketplace,
      generatedAt: new Date().toISOString(),
      asOfDate: latestMarketplaceDate,
      platforms: {
        ...existingExtraPlatforms,
        ozon: {
          key: 'ozon',
          label: 'Ozon',
          supportKey: 'ozon',
          source: 'analytics-api:/v1/analytics/data',
          sourceMode: selectedMode,
          from: options.from,
          to: options.to,
          articles: ozonArticles
        }
      }
    }
  };

  if (warnings.length) {
    payload.ozonApiDirect.warnings = Array.from(new Set(warnings));
  }

  writeJson(options.outputPath, payload);
  console.log(JSON.stringify({
    outputPath: options.outputPath,
    generatedAt: payload.generatedAt,
    latestMarketplaceDate,
    sourceRows,
    matchedRows,
    articleRows: ozonArticles.length,
    productInfoRequested: productInfo.requested,
    productInfoMatchedKeys: productInfo.matched,
    sourceMode: selectedMode,
    warnings: payload.ozonApiDirect.warnings || []
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
