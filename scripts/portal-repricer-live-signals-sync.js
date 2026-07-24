#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeKey } = require('./smart-price-contour');

const WB_STOCK_API_URL = 'https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses';
const OZON_API_BASE_URL = 'https://api-seller.ozon.ru';
const DEFAULT_AD_WINDOW_DAYS = 7;
const DEFAULT_AD_MAX_AGE_DAYS = 3;
const DEFAULT_STOCK_MAX_AGE_DAYS = 2;
const WB_STOCK_PAGE_LIMIT = 250000;
const MARKETPLACE_FILTER_LIMIT = 1000;

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token || token === 'sync') continue;
    if (token === '--dry-run' || token === '--strict' || token === '--skip-stock-api') {
      args[token.slice(2)] = true;
      continue;
    }
    const equal = token.indexOf('=');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2, equal >= 0 ? equal : undefined);
    if (equal >= 0) {
      args[key] = token.slice(equal + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function isoDate(value) {
  const raw = String(value || '').trim();
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function dateAgeDays(value, referenceValue) {
  const date = isoDate(value);
  const reference = isoDate(referenceValue);
  if (!date || !reference) return null;
  return Math.max(0, (Date.parse(`${reference}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ratio(value) {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(numberOrZero(value) * factor) / factor;
}

function platformSeries(payload, platform) {
  const item = (Array.isArray(payload?.platforms) ? payload.platforms : [])
    .find((row) => String(row?.key || row?.platformKey || '').trim().toLowerCase() === platform);
  return Array.isArray(item?.series) ? item.series : [];
}

function seriesMap(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = isoDate(row?.date || row?.label);
    if (date) map.set(date, row);
  }
  return map;
}

function advertisingSnapshot({
  platform,
  adsSummary,
  platformTrends,
  economicsPolicy,
  asOfDate,
  windowDays = DEFAULT_AD_WINDOW_DAYS,
  maxAgeDays = DEFAULT_AD_MAX_AGE_DAYS
}) {
  const adsByDate = seriesMap(platformSeries(adsSummary, platform));
  const salesByDate = seriesMap(platformSeries(platformTrends, platform));
  const dates = [...adsByDate.keys()]
    .filter((date) => date <= asOfDate && salesByDate.has(date) && numberOrZero(salesByDate.get(date)?.revenue) > 0)
    .sort()
    .slice(-windowDays);
  let spend = 0;
  let revenue = 0;
  for (const date of dates) {
    spend += numberOrZero(adsByDate.get(date)?.spend);
    revenue += numberOrZero(salesByDate.get(date)?.revenue);
  }
  const observedPct = revenue > 0 ? spend / revenue : null;
  const platformPolicy = economicsPolicy?.platforms?.[platform] || {};
  const contractPct = ratio(
    platformPolicy?.advertisingContract?.factPct
      ?? platformPolicy?.advertisingContract?.planPct
      ?? platformPolicy?.internalAdvertisingPct
      ?? platformPolicy?.internal_advertising_pct
  );
  const latestDate = dates[dates.length - 1] || '';
  const ageDays = dateAgeDays(latestDate, asOfDate);
  const enoughData = dates.length >= Math.min(3, windowDays) && revenue > 0;
  const fresh = ageDays !== null && ageDays <= maxAgeDays;
  const trusted = enoughData && fresh && observedPct !== null && observedPct >= 0 && observedPct < 1;
  const appliedPct = trusted
    ? Math.max(contractPct || 0, observedPct || 0)
    : contractPct;
  return {
    status: trusted ? 'trusted' : (contractPct !== null ? 'fallback_contract' : 'blocked'),
    calculation: 'max(iu_contract_pct, rolling_observed_spend/revenue)',
    windowDays,
    from: dates[0] || '',
    to: latestDate,
    dates,
    spendRub: round(spend, 2),
    revenueRub: round(revenue, 2),
    observedPct: observedPct === null ? null : round(observedPct),
    contractPct: contractPct === null ? null : round(contractPct),
    appliedPct: appliedPct === null ? null : round(appliedPct),
    ageDays,
    maxAgeDays,
    source: 'ads_summary.json + platform_trends.json'
  };
}

function skuIndexes(skus, livePrices = {}) {
  const byArticle = new Map();
  const byWbNmId = new Map();
  const byOzonOfferId = new Map();
  const addArticleAlias = (value, articleKey) => {
    const key = normalizeKey(value);
    if (key && articleKey && !byArticle.has(key)) byArticle.set(key, articleKey);
  };
  const addWbNmId = (value, articleKey) => {
    const nmId = String(value || '').trim().replace(/^wb-nm-/i, '').replace(/\.0$/, '');
    if (/^\d+$/.test(nmId) && articleKey && !byWbNmId.has(nmId)) byWbNmId.set(nmId, articleKey);
  };
  const addOzonOfferId = (value, articleKey) => {
    const offerId = String(value || '').trim();
    if (!offerId || !articleKey) return;
    addArticleAlias(offerId, articleKey);
    if (!byOzonOfferId.has(offerId)) byOzonOfferId.set(offerId, articleKey);
  };
  for (const sku of Array.isArray(skus) ? skus : []) {
    const articleKey = String(sku?.articleKey || sku?.article || sku?.sku || '').trim();
    addArticleAlias(articleKey, articleKey);
    addOzonOfferId(articleKey, articleKey);
    addWbNmId(sku?.nmId || sku?.wb?.nmId || sku?.wbNmId, articleKey);
    for (const alias of Array.isArray(sku?.platformAliases?.ozon) ? sku.platformAliases.ozon : []) {
      addOzonOfferId(alias, articleKey);
    }
    for (const alias of Array.isArray(sku?.platformAliases?.wb) ? sku.platformAliases.wb : []) {
      addWbNmId(alias, articleKey);
    }
    for (const alias of Array.isArray(sku?.aliases) ? sku.aliases : []) {
      const platform = String(alias?.platform || '').trim().toLowerCase();
      if (platform === 'ozon') addOzonOfferId(alias?.value, articleKey);
      if (platform === 'wb') addWbNmId(alias?.value, articleKey);
    }
  }
  for (const row of Array.isArray(livePrices?.platforms?.wb?.rows) ? livePrices.platforms.wb.rows : []) {
    const articleKey = String(row?.articleKey || row?.mapping?.articleKey || '').trim();
    addWbNmId(row?.nmId, articleKey);
  }
  for (const row of Array.isArray(livePrices?.platforms?.ozon?.rows) ? livePrices.platforms.ozon.rows : []) {
    const articleKey = String(row?.articleKey || row?.mapping?.articleKey || '').trim();
    addOzonOfferId(row?.offerId || row?.offer_id, articleKey);
  }
  return { byArticle, byWbNmId, byOzonOfferId };
}

function stockRow(articleKey, platform, values = {}) {
  const present = Math.max(0, numberOrZero(values.present));
  const reserved = Math.max(0, numberOrZero(values.reserved));
  const available = values.available === null || values.available === undefined
    ? Math.max(0, present - reserved)
    : Math.max(0, numberOrZero(values.available));
  const inbound = Math.max(0, numberOrZero(values.inbound));
  return {
    articleKey,
    normalizedArticleKey: normalizeKey(articleKey),
    platform,
    present: round(present, 2),
    reserved: round(reserved, 2),
    available: round(available, 2),
    inbound: round(inbound, 2),
    oos: available <= 0 && inbound <= 0,
    partialOos: numberOrZero(values.zeroStockPlaceCount) > 0 && available > 0,
    placeCount: Math.max(0, Math.trunc(numberOrZero(values.placeCount))),
    zeroStockPlaceCount: Math.max(0, Math.trunc(numberOrZero(values.zeroStockPlaceCount))),
    source: String(values.source || ''),
    sourceMode: String(values.sourceMode || ''),
    asOfDate: isoDate(values.asOfDate)
  };
}

function fallbackStocks(payload, platform, asOfDate, maxAgeDays = DEFAULT_STOCK_MAX_AGE_DAYS) {
  const grouped = new Map();
  for (const row of Array.isArray(payload?.rows) ? payload.rows : []) {
    const articleKey = String(row?.articleKey || row?.article || row?.sku || '').trim();
    const normalizedArticle = normalizeKey(articleKey);
    if (!normalizedArticle) continue;
    const item = grouped.get(normalizedArticle) || {
      articleKey,
      present: 0,
      reserved: 0,
      available: 0,
      inbound: 0,
      placeCount: 0,
      zeroStockPlaceCount: 0
    };
    const inStock = Math.max(0, numberOrZero(row?.inStock ?? row?.stock ?? row?.stockUnits));
    item.present += inStock;
    item.available += inStock;
    item.inbound += Math.max(0, numberOrZero(row?.inTransit)) + Math.max(0, numberOrZero(row?.inRequest));
    item.placeCount += 1;
    if (inStock <= 0) item.zeroStockPlaceCount += 1;
    grouped.set(normalizedArticle, item);
  }
  const snapshotDate = isoDate(payload?.window?.to || payload?.asOfDate || payload?.generatedAt);
  const ageDays = dateAgeDays(snapshotDate, asOfDate);
  const rows = [...grouped.values()]
    .map((item) => stockRow(item.articleKey, platform, {
      ...item,
      source: `order_procurement_${platform}.json`,
      sourceMode: 'fallback_procurement',
      asOfDate: snapshotDate
    }))
    .sort((left, right) => left.normalizedArticleKey.localeCompare(right.normalizedArticleKey));
  return {
    status: rows.length && ageDays !== null && ageDays <= maxAgeDays ? 'trusted_fallback' : 'stale_fallback',
    source: `order_procurement_${platform}.json`,
    sourceMode: 'fallback_procurement',
    asOfDate: snapshotDate,
    ageDays,
    maxAgeDays,
    rows
  };
}

async function requestJson(url, options, label) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(`${label}: HTTP ${response.status} ${text.slice(0, 500)}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function fetchWbStocks(token, indexes, asOfDate) {
  const requested = [...(indexes?.byWbNmId || new Map()).entries()]
    .filter(([nmId, articleKey]) => /^\d+$/.test(String(nmId || '')) && String(articleKey || '').trim());
  const items = [];
  for (let chunkIndex = 0; chunkIndex < requested.length; chunkIndex += MARKETPLACE_FILTER_LIMIT) {
    const chunk = requested.slice(chunkIndex, chunkIndex + MARKETPLACE_FILTER_LIMIT);
    let offset = 0;
    for (let page = 0; page < 100; page += 1) {
      const payload = await requestJson(WB_STOCK_API_URL, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nmIds: chunk.map(([nmId]) => Number(nmId)),
          chrtIds: [],
          limit: WB_STOCK_PAGE_LIMIT,
          offset
        })
      }, 'WB stocks API');
      const batch = Array.isArray(payload?.data?.items)
        ? payload.data.items
        : (Array.isArray(payload?.items) ? payload.items : []);
      items.push(...batch);
      if (batch.length < WB_STOCK_PAGE_LIMIT) break;
      offset += batch.length;
    }
  }
  const grouped = new Map();
  let unmatched = 0;
  for (const item of items) {
    const nmId = String(item?.nmId || item?.nmID || '').trim().replace(/\.0$/, '');
    const articleKey = indexes.byWbNmId.get(nmId);
    if (!articleKey) {
      unmatched += 1;
      continue;
    }
    const normalizedArticle = normalizeKey(articleKey);
    const row = grouped.get(normalizedArticle) || {
      articleKey,
      present: 0,
      reserved: 0,
      available: 0,
      inbound: 0,
      placeCount: 0,
      zeroStockPlaceCount: 0
    };
    const quantity = Math.max(0, numberOrZero(item?.quantity));
    row.present += quantity;
    row.available += quantity;
    row.reserved += Math.max(0, numberOrZero(item?.inWayToClient));
    row.inbound += Math.max(0, numberOrZero(item?.inWayFromClient));
    row.placeCount += 1;
    if (quantity <= 0) row.zeroStockPlaceCount += 1;
    grouped.set(normalizedArticle, row);
  }
  for (const [, articleKey] of requested) {
    const normalizedArticle = normalizeKey(articleKey);
    if (!normalizedArticle || grouped.has(normalizedArticle)) continue;
    grouped.set(normalizedArticle, {
      articleKey,
      present: 0,
      reserved: 0,
      available: 0,
      inbound: 0,
      placeCount: 0,
      zeroStockPlaceCount: 0
    });
  }
  return {
    status: 'trusted_direct',
    source: 'WB Seller Analytics API /api/analytics/v1/stocks-report/wb-warehouses',
    sourceMode: 'wb_stock_api',
    asOfDate,
    ageDays: 0,
    maxAgeDays: DEFAULT_STOCK_MAX_AGE_DAYS,
    sourceRows: items.length,
    requestedRows: requested.length,
    unmatchedRows: unmatched,
    rows: [...grouped.values()].map((row) => stockRow(row.articleKey, 'wb', {
      ...row,
      source: 'WB stocks API',
      sourceMode: 'wb_stock_api',
      asOfDate
    }))
  };
}

async function fetchWbStocksWithTokens(candidates, indexes, asOfDate) {
  const unique = [];
  const seen = new Set();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const token = String(candidate?.token || candidate || '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    unique.push({
      token,
      source: String(candidate?.source || `candidate_${unique.length + 1}`)
    });
  }
  const failures = [];
  for (const candidate of unique) {
    try {
      const result = await fetchWbStocks(candidate.token, indexes, asOfDate);
      result.tokenSource = candidate.source;
      if (failures.length) {
        result.warnings = failures.map((failure) => `${failure.source}: ${failure.message}`);
      }
      return result;
    } catch (error) {
      const status = Number(error?.status || 0);
      failures.push({
        source: candidate.source,
        status,
        message: error?.message || String(error)
      });
      if (![401, 403].includes(status)) throw error;
    }
  }
  const detail = failures.length
    ? failures.map((failure) => `${failure.source} HTTP ${failure.status || 'unknown'}`).join(', ')
    : 'no configured token candidates';
  const error = new Error(`WB Analytics token is unavailable (${detail})`);
  error.status = failures[failures.length - 1]?.status || 0;
  throw error;
}

function ozonItems(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.result?.items)) return payload.result.items;
  return [];
}

function ozonCursor(payload) {
  return String(payload?.cursor || payload?.result?.cursor || payload?.result?.last_id || payload?.last_id || '').trim();
}

async function fetchOzonStockPages(baseUrl, clientId, apiKey, version = 'v4', offerIds = []) {
  const items = [];
  const filters = offerIds.length
    ? Array.from({ length: Math.ceil(offerIds.length / MARKETPLACE_FILTER_LIMIT) }, (_, index) => (
      offerIds.slice(index * MARKETPLACE_FILTER_LIMIT, (index + 1) * MARKETPLACE_FILTER_LIMIT)
    ))
    : [[]];
  for (const offerIdFilter of filters) {
    let cursor = '';
    const seenCursors = new Set();
    for (let page = 0; page < 100; page += 1) {
      const filter = {
        visibility: 'ALL',
        ...(offerIdFilter.length ? { offer_id: offerIdFilter } : {})
      };
      const body = version === 'v4'
        ? { cursor, filter, limit: MARKETPLACE_FILTER_LIMIT }
        : { filter, last_id: cursor, limit: MARKETPLACE_FILTER_LIMIT };
      const payload = await requestJson(`${baseUrl}/${version}/product/info/stocks`, {
        method: 'POST',
        headers: {
          'Client-Id': clientId,
          'Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }, `Ozon ${version} stocks API`);
      const batch = ozonItems(payload);
      items.push(...batch);
      const nextCursor = ozonCursor(payload);
      if (!batch.length || !nextCursor || nextCursor === cursor || seenCursors.has(nextCursor) || batch.length < MARKETPLACE_FILTER_LIMIT) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
  }
  return items;
}

function ozonStockBuckets(item = {}) {
  if (Array.isArray(item?.stocks)) return item.stocks;
  if (!item?.stocks || typeof item.stocks !== 'object') return [];
  return Object.entries(item.stocks).flatMap(([type, value]) => {
    if (Array.isArray(value)) return value.map((row) => ({ ...row, type: row?.type || type }));
    if (value && typeof value === 'object') return [{ ...value, type: value.type || type }];
    return [];
  });
}

function normalizeOzonStocks(items, indexes, asOfDate, version, expectedOffers = new Map()) {
  const grouped = new Map();
  let unmatched = 0;
  for (const item of items) {
    const offerId = String(item?.offer_id || item?.offerId || item?.sku || '').trim();
    const normalizedOffer = normalizeKey(offerId);
    const articleKey = indexes.byArticle.get(normalizedOffer) || offerId;
    if (!articleKey) {
      unmatched += 1;
      continue;
    }
    const normalizedArticle = normalizeKey(articleKey);
    const row = grouped.get(normalizedArticle) || {
      articleKey,
      present: 0,
      reserved: 0,
      available: 0,
      inbound: 0,
      placeCount: 0,
      zeroStockPlaceCount: 0
    };
    const stocks = ozonStockBuckets(item);
    if (!stocks.length) {
      const present = Math.max(0, numberOrZero(item?.present ?? item?.stock ?? item?.quantity));
      const reserved = Math.max(0, numberOrZero(item?.reserved));
      row.present += present;
      row.reserved += reserved;
      row.available += Math.max(0, present - reserved);
      row.placeCount += 1;
      if (present - reserved <= 0) row.zeroStockPlaceCount += 1;
    } else {
      for (const stock of stocks) {
        const present = Math.max(0, numberOrZero(stock?.present ?? stock?.stock ?? stock?.quantity));
        const reserved = Math.max(0, numberOrZero(stock?.reserved));
        row.present += present;
        row.reserved += reserved;
        row.available += Math.max(0, present - reserved);
        row.inbound += Math.max(0, numberOrZero(stock?.inbound ?? stock?.in_way_to_warehouse));
        row.placeCount += 1;
        if (present - reserved <= 0) row.zeroStockPlaceCount += 1;
      }
    }
    grouped.set(normalizedArticle, row);
  }
  for (const [offerId, expectedArticleKey] of expectedOffers.entries()) {
    const articleKey = String(expectedArticleKey || indexes.byArticle.get(normalizeKey(offerId)) || offerId).trim();
    const normalizedArticle = normalizeKey(articleKey);
    if (!normalizedArticle || grouped.has(normalizedArticle)) continue;
    grouped.set(normalizedArticle, {
      articleKey,
      present: 0,
      reserved: 0,
      available: 0,
      inbound: 0,
      placeCount: 0,
      zeroStockPlaceCount: 0
    });
  }
  return {
    status: 'trusted_direct',
    source: `Ozon Seller API /${version}/product/info/stocks`,
    sourceMode: `ozon_stock_api_${version}`,
    asOfDate,
    ageDays: 0,
    maxAgeDays: DEFAULT_STOCK_MAX_AGE_DAYS,
    sourceRows: items.length,
    requestedRows: expectedOffers.size,
    unmatchedRows: unmatched,
    rows: [...grouped.values()].map((row) => stockRow(row.articleKey, 'ozon', {
      ...row,
      source: `Ozon ${version} stocks API`,
      sourceMode: `ozon_stock_api_${version}`,
      asOfDate
    }))
  };
}

async function fetchOzonStocks(options, indexes, asOfDate) {
  const expectedOffers = indexes?.byOzonOfferId instanceof Map ? indexes.byOzonOfferId : new Map();
  const offerIds = [...expectedOffers.keys()];
  try {
    const items = await fetchOzonStockPages(options.ozonApiBaseUrl, options.ozonClientId, options.ozonApiKey, 'v4', offerIds);
    return normalizeOzonStocks(items, indexes, asOfDate, 'v4', expectedOffers);
  } catch (error) {
    if (![400, 404, 405, 409].includes(Number(error?.status || 0))) throw error;
    const items = await fetchOzonStockPages(options.ozonApiBaseUrl, options.ozonClientId, options.ozonApiKey, 'v3', offerIds);
    const result = normalizeOzonStocks(items, indexes, asOfDate, 'v3', expectedOffers);
    result.warnings = [`v4 unavailable: ${error.message}`];
    return result;
  }
}

function mergeDirectWithFallback(direct, fallback) {
  if (!direct || !Array.isArray(direct.rows) || !direct.rows.length) return fallback;
  const map = new Map((fallback?.rows || []).map((row) => [row.normalizedArticleKey, row]));
  const directKeys = new Set();
  for (const row of direct.rows) {
    directKeys.add(row.normalizedArticleKey);
    map.set(row.normalizedArticleKey, row);
  }
  const fallbackRows = [...map.values()].filter((row) => !directKeys.has(row.normalizedArticleKey)).length;
  return {
    ...direct,
    directRows: directKeys.size,
    fallbackRows,
    directCoverage: map.size ? round(directKeys.size / map.size) : 0,
    rows: [...map.values()].sort((left, right) => left.normalizedArticleKey.localeCompare(right.normalizedArticleKey))
  };
}

function directSnapshotUsable(direct) {
  return Boolean(
    direct
    && direct.status === 'trusted_direct'
    && (numberOrZero(direct.sourceRows) > 0 || numberOrZero(direct.requestedRows) > 0)
    && Array.isArray(direct.rows)
    && direct.rows.length > 0
  );
}

function attachOosRisk(rows, oosControl, platform) {
  const riskMap = new Map();
  for (const issue of Array.isArray(oosControl?.rows) ? oosControl.rows : []) {
    const issuePlatform = String(issue?.platformKey || issue?.platform || '').trim().toLowerCase();
    const normalizedArticle = normalizeKey(issue?.articleKey || issue?.article || '');
    if (issuePlatform !== platform || !normalizedArticle) continue;
    riskMap.set(normalizedArticle, issue);
  }
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const issue = riskMap.get(row.normalizedArticleKey);
    if (!issue) return {
      ...row,
      oosRiskStatus: row.oos ? 'oos' : 'ok',
      oosRiskRule: row.oos ? 'live_zero_available' : '',
      turnoverDays: null,
      oosTaskId: ''
    };
    return {
      ...row,
      oosRiskStatus: String(issue.status || (row.oos ? 'oos' : 'watch')),
      oosRiskRule: String(issue.signalRule || ''),
      turnoverDays: numberOrNull(issue.turnoverDays),
      riskClusterCount: Math.max(0, Math.trunc(numberOrZero(issue.clusterCount))),
      oosTaskId: String(issue.taskId || '')
    };
  });
}

function resolveOptions(args) {
  const root = process.cwd();
  const inputDir = path.resolve(args['input-dir'] || path.join(root, 'data'));
  const wbTokens = [
    { source: 'argument', token: args['wb-token'] },
    { source: 'primary', token: process.env.ALTEA_WB_API_TOKEN },
    { source: 'promotion', token: process.env.ALTEA_WB_PROMOTION_TOKEN }
  ].filter((candidate) => String(candidate.token || '').trim());
  return {
    inputDir,
    outputPath: path.resolve(args.output || args['output-file'] || path.join(inputDir, 'repricer_live_signals.json')),
    asOfDate: isoDate(args['as-of-date'] || new Date().toISOString()),
    dryRun: Boolean(args['dry-run']),
    strict: Boolean(args.strict),
    skipStockApi: Boolean(args['skip-stock-api']),
    adWindowDays: Math.max(3, Math.trunc(numberOrZero(args['ad-window-days'] || DEFAULT_AD_WINDOW_DAYS))),
    adMaxAgeDays: Math.max(0, Math.trunc(numberOrZero(args['ad-max-age-days'] || DEFAULT_AD_MAX_AGE_DAYS))),
    stockMaxAgeDays: Math.max(0, Math.trunc(numberOrZero(args['stock-max-age-days'] || DEFAULT_STOCK_MAX_AGE_DAYS))),
    wbToken: String(wbTokens[0]?.token || '').trim(),
    wbTokens,
    ozonClientId: String(args['ozon-client-id'] || process.env.ALTEA_OZON_CLIENT_ID || '').trim(),
    ozonApiKey: String(args['ozon-api-key'] || process.env.ALTEA_OZON_API_KEY || '').trim(),
    ozonApiBaseUrl: String(args['ozon-api-base-url'] || process.env.ALTEA_OZON_API_BASE_URL || OZON_API_BASE_URL).replace(/\/+$/, '')
  };
}

async function buildLiveSignals(options) {
  const adsSummary = readJson(path.join(options.inputDir, 'ads_summary.json'), { platforms: [] });
  const platformTrends = readJson(path.join(options.inputDir, 'platform_trends.json'), { platforms: [] });
  const economicsPolicy = readJson(path.join(options.inputDir, 'repricer_economics_policy.json'), { platforms: {} });
  const skus = readJson(path.join(options.inputDir, 'skus.json'), []);
  const livePrices = readJson(path.join(options.inputDir, 'repricer_live_prices.json'), { platforms: {} });
  const oosControl = readJson(path.join(options.inputDir, 'oos_control.json'), { rows: [] });
  const indexes = skuIndexes(skus, livePrices);
  const warnings = [];
  const platforms = {};

  for (const platform of ['wb', 'ozon']) {
    const fallback = fallbackStocks(
      readJson(path.join(options.inputDir, `order_procurement_${platform}.json`), { rows: [] }),
      platform,
      options.asOfDate,
      options.stockMaxAgeDays
    );
    let direct = null;
    if (!options.skipStockApi) {
      try {
        if (platform === 'wb' && (options.wbTokens?.length || options.wbToken)) {
          direct = await fetchWbStocksWithTokens(
            options.wbTokens?.length ? options.wbTokens : [{ source: 'legacy', token: options.wbToken }],
            indexes,
            options.asOfDate
          );
        }
        if (platform === 'ozon' && options.ozonClientId && options.ozonApiKey) direct = await fetchOzonStocks(options, indexes, options.asOfDate);
      } catch (error) {
        warnings.push(`${platform} stocks: ${error.message}`);
      }
    }
    if (direct && !directSnapshotUsable(direct)) {
      warnings.push(`${platform} stocks: direct snapshot returned no mapped stock rows`);
      direct = null;
    }
    if (options.strict && !options.skipStockApi && !directSnapshotUsable(direct)) {
      const detail = warnings.filter((warning) => warning.startsWith(`${platform} stocks:`)).slice(-1)[0] || '';
      throw new Error(`${platform} direct stock snapshot is unavailable${detail ? `: ${detail}` : ''}`);
    }
    const stock = mergeDirectWithFallback(direct, fallback);
    stock.rows = attachOosRisk(stock.rows, oosControl, platform);
    platforms[platform] = {
      advertising: advertisingSnapshot({
        platform,
        adsSummary,
        platformTrends,
        economicsPolicy,
        asOfDate: options.asOfDate,
        windowDays: options.adWindowDays,
        maxAgeDays: options.adMaxAgeDays
      }),
      stock
    };
  }

  const rows = Object.values(platforms)
    .flatMap((platform) => platform.stock?.rows || [])
    .sort((left, right) => `${left.platform}|${left.normalizedArticleKey}`.localeCompare(`${right.platform}|${right.normalizedArticleKey}`));
  const summary = {
    rows: rows.length,
    oosRows: rows.filter((row) => row.oos).length,
    partialOosRows: rows.filter((row) => row.partialOos).length,
    oosRiskRows: rows.filter((row) => ['oos', 'risk', 'watch'].includes(row.oosRiskStatus)).length,
    directPlatforms: Object.entries(platforms)
      .filter(([, value]) => value.stock?.status === 'trusted_direct')
      .map(([platform]) => platform),
    directCoverage: Object.fromEntries(Object.entries(platforms).map(([platform, value]) => [platform, {
      directRows: numberOrZero(value.stock?.directRows),
      fallbackRows: numberOrZero(value.stock?.fallbackRows),
      coverage: round(value.stock?.directCoverage)
    }])),
    trustedAdvertisingPlatforms: Object.entries(platforms)
      .filter(([, value]) => value.advertising?.status === 'trusted')
      .map(([platform]) => platform)
  };
  return {
    schema: 'repricer-live-signals-v1',
    generatedAt: new Date().toISOString(),
    asOfDate: options.asOfDate,
    policy: {
      advertising: 'Applied rate is the greater of the IU contract rate and observed seven-day internal-advertising DRR.',
      stock: 'Overall OOS requires zero available stock and zero inbound. Partial warehouse OOS is a supply signal and does not lower price.'
    },
    summary,
    platforms,
    rows,
    warnings
  };
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const payload = await buildLiveSignals(options);
  if (!options.dryRun) writeJson(options.outputPath, payload);
  console.log(JSON.stringify({
    outputPath: options.outputPath,
    dryRun: options.dryRun,
    asOfDate: payload.asOfDate,
    summary: payload.summary,
    advertising: Object.fromEntries(Object.entries(payload.platforms).map(([platform, value]) => [platform, value.advertising])),
    stock: Object.fromEntries(Object.entries(payload.platforms).map(([platform, value]) => [platform, {
      status: value.stock?.status,
      source: value.stock?.source,
      asOfDate: value.stock?.asOfDate,
      rows: value.stock?.rows?.length || 0
    }])),
    warnings: payload.warnings
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  advertisingSnapshot,
  attachOosRisk,
  buildLiveSignals,
  directSnapshotUsable,
  fallbackStocks,
  fetchWbStocks,
  fetchWbStocksWithTokens,
  mergeDirectWithFallback,
  normalizeOzonStocks,
  ozonStockBuckets,
  resolveOptions,
  skuIndexes,
  stockRow
};
