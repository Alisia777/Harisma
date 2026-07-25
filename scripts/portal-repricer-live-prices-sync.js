#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeKey } = require('./smart-price-contour');

const WB_PRICES_URL = 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter';
const OZON_API_BASE_URL = 'https://api-seller.ozon.ru';
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_UNMAPPED_RATIO = 0.1;

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token || token === 'sync') continue;
    if (!token.startsWith('--')) continue;
    const equal = token.indexOf('=');
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

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstPositive(...values) {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function round(value, digits = 2) {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function normalizedIdentifier(value) {
  return normalizeKey(String(value ?? '').trim().replace(/\.0$/, ''));
}

function addIndexValue(index, value, articleKey, source) {
  const key = normalizedIdentifier(value);
  const target = String(articleKey || '').trim();
  if (!key || !target) return;
  if (!index.has(key)) index.set(key, new Map());
  const targets = index.get(key);
  if (!targets.has(target)) targets.set(target, new Set());
  targets.get(target).add(source);
}

function activeAlias(alias) {
  const status = String(alias?.status || 'active').trim().toLowerCase();
  return !['disabled', 'inactive', 'ignored', 'deleted', 'remove'].includes(status);
}

function buildSkuIndexes(skus = [], aliasesPayload = {}, skuMatrix = {}) {
  const indexes = {
    wb: new Map(),
    ozon: new Map()
  };
  for (const sku of Array.isArray(skus) ? skus : []) {
    const articleKey = String(sku?.articleKey || sku?.article || sku?.sku || '').trim();
    if (!articleKey) continue;
    for (const platform of ['wb', 'ozon']) {
      addIndexValue(indexes[platform], articleKey, articleKey, 'sku.articleKey');
      addIndexValue(indexes[platform], sku?.article, articleKey, 'sku.article');
      addIndexValue(indexes[platform], sku?.sku, articleKey, 'sku.sku');
      for (const alias of Array.isArray(sku?.platformAliases?.[platform]) ? sku.platformAliases[platform] : []) {
        addIndexValue(indexes[platform], alias, articleKey, `sku.platformAliases.${platform}`);
      }
      for (const alias of Array.isArray(sku?.aliases) ? sku.aliases : []) {
        const aliasPlatform = String(alias?.platform || '').trim().toLowerCase();
        if (aliasPlatform && aliasPlatform !== platform) continue;
        addIndexValue(indexes[platform], alias?.value ?? alias?.api_sku, articleKey, 'sku.aliases');
      }
    }
    addIndexValue(indexes.wb, sku?.nmId, articleKey, 'sku.nmId');
    addIndexValue(indexes.wb, sku?.wb?.nmId ?? sku?.wbNmId, articleKey, 'sku.wb.nmId');
    addIndexValue(indexes.ozon, sku?.ozon?.productId ?? sku?.ozonProductId, articleKey, 'sku.ozon.productId');
    addIndexValue(indexes.ozon, sku?.ozon?.offerId ?? sku?.ozonOfferId, articleKey, 'sku.ozon.offerId');
  }

  for (const alias of Array.isArray(aliasesPayload?.aliases) ? aliasesPayload.aliases : []) {
    if (!activeAlias(alias)) continue;
    const platform = String(alias?.platform || '').trim().toLowerCase();
    if (!indexes[platform]) continue;
    addIndexValue(
      indexes[platform],
      alias?.api_sku ?? alias?.apiSku ?? alias?.value,
      alias?.target_sku ?? alias?.targetSku ?? alias?.articleKey,
      'sku_aliases.json'
    );
  }

  const matrixAliases = skuMatrix?.indexes?.aliasToArticleKey;
  if (matrixAliases && typeof matrixAliases === 'object') {
    for (const [alias, target] of Object.entries(matrixAliases)) {
      if (target && typeof target === 'object' && !Array.isArray(target)) {
        for (const platform of ['wb', 'ozon']) {
          addIndexValue(indexes[platform], alias, target[platform] ?? target.articleKey ?? target.target_sku, 'sku_matrix.json');
        }
      } else {
        for (const platform of ['wb', 'ozon']) addIndexValue(indexes[platform], alias, target, 'sku_matrix.json');
      }
    }
  }
  return indexes;
}

function resolveArticle(index, identifiers = []) {
  const matches = new Map();
  for (const identifier of identifiers) {
    const key = normalizedIdentifier(identifier?.value);
    if (!key) continue;
    const targets = index.get(key);
    if (!targets) continue;
    for (const [articleKey, sources] of targets.entries()) {
      if (!matches.has(articleKey)) matches.set(articleKey, []);
      matches.get(articleKey).push({
        identifier: String(identifier.value),
        identifierType: String(identifier.type || ''),
        indexSources: [...sources]
      });
    }
  }
  if (matches.size === 1) {
    const [articleKey, evidence] = [...matches.entries()][0];
    return {
      status: 'mapped',
      articleKey,
      confidence: evidence.some((item) => /article|vendor|offer/i.test(item.identifierType)) ? 'exact' : 'alias',
      evidence
    };
  }
  if (matches.size > 1) {
    return {
      status: 'ambiguous',
      articleKey: '',
      confidence: 'blocked',
      candidates: [...matches.keys()].sort(),
      evidence: [...matches.entries()].flatMap(([articleKey, rows]) => rows.map((row) => ({ articleKey, ...row })))
    };
  }
  return { status: 'unmapped', articleKey: '', confidence: 'blocked', evidence: [] };
}

async function requestJson(url, init, label, fetchImpl = fetch) {
  const response = await fetchImpl(url, init);
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

async function fetchWbPricePages(options, fetchImpl = fetch) {
  const items = [];
  const limit = options.pageSize || DEFAULT_PAGE_SIZE;
  for (let offset = 0, page = 0; page < 1000; page += 1, offset += limit) {
    const url = new URL(options.wbPricesUrl || WB_PRICES_URL);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    const payload = await requestJson(url.toString(), {
      headers: {
        Authorization: options.wbToken,
        Accept: 'application/json'
      }
    }, 'WB prices API', fetchImpl);
    const batch = Array.isArray(payload?.data?.listGoods)
      ? payload.data.listGoods
      : (Array.isArray(payload?.listGoods) ? payload.listGoods : []);
    items.push(...batch);
    if (!batch.length || batch.length < limit) break;
  }
  return items;
}

function wbSizePrices(item = {}) {
  const sizes = Array.isArray(item?.sizes) && item.sizes.length ? item.sizes : [item];
  return sizes.map((size) => ({
    sizeId: String(size?.sizeID ?? size?.sizeId ?? ''),
    techSizeName: String(size?.techSizeName ?? ''),
    listPrice: firstPositive(size?.price, item?.price),
    sellerPrice: firstPositive(size?.discountedPrice, item?.discountedPrice),
    clientPrice: firstPositive(
      size?.clubDiscountedPrice,
      item?.clubDiscountedPrice,
      size?.discountedPrice,
      item?.discountedPrice
    )
  })).filter((row) => row.sellerPrice !== null);
}

function normalizeWbPrices(items, index, asOfDate) {
  const rows = [];
  const unresolved = [];
  for (const item of Array.isArray(items) ? items : []) {
    const nmId = String(item?.nmID ?? item?.nmId ?? '').trim().replace(/\.0$/, '');
    const vendorCode = String(item?.vendorCode ?? item?.vendor_code ?? '').trim();
    const mapping = resolveArticle(index, [
      { type: 'vendorCode', value: vendorCode },
      { type: 'nmID', value: nmId }
    ]);
    const sizes = wbSizePrices(item);
    const sellerPrices = [...new Set(sizes.map((row) => Math.round(row.sellerPrice * 100)))];
    const common = {
      platform: 'wb',
      marketplace: 'wb',
      nmId: numberOrNull(nmId),
      vendorCode,
      currency: String(item?.currencyIsoCode4217 || 'RUB'),
      discountPct: numberOrNull(item?.discount),
      clubDiscountPct: numberOrNull(item?.clubDiscount),
      asOfDate,
      retrievedAt: `${asOfDate}T00:00:00.000Z`,
      sourceStatus: 'direct_api',
      source: 'WB Prices API /api/v2/list/goods/filter',
      mapping
    };
    if (mapping.status !== 'mapped') {
      unresolved.push({ ...common, reason: mapping.status, sizes });
      continue;
    }
    if (!sizes.length) {
      unresolved.push({ ...common, articleKey: mapping.articleKey, reason: 'missing_seller_price', sizes: [] });
      continue;
    }
    if (sellerPrices.length !== 1) {
      unresolved.push({ ...common, articleKey: mapping.articleKey, reason: 'different_size_prices', sizes });
      continue;
    }
    const price = sizes[0];
    rows.push({
      id: `wb|${normalizeKey(mapping.articleKey)}`,
      articleKey: mapping.articleKey,
      normalizedArticleKey: normalizeKey(mapping.articleKey),
      article: vendorCode || mapping.articleKey,
      currentFillPrice: round(price.sellerPrice),
      currentPrice: round(price.sellerPrice),
      currentSellerPrice: round(price.sellerPrice),
      currentClientPrice: round(price.clientPrice),
      currentListPrice: round(price.listPrice),
      currentPriceDate: asOfDate,
      valueDate: asOfDate,
      historyFreshnessDate: asOfDate,
      currentSellerPriceSource: 'wb-prices-api',
      currentPriceSource: 'wb-prices-api',
      currentSellerPriceFile: 'repricer_live_prices.json',
      daily: [{
        date: asOfDate,
        price: round(price.sellerPrice),
        clientPrice: round(price.clientPrice),
        sppPct: null
      }],
      ...common
    });
  }
  return { rows, unresolved };
}

function ozonItems(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.result?.items)) return payload.result.items;
  return [];
}

function ozonCursor(payload) {
  return String(payload?.cursor || payload?.result?.cursor || payload?.result?.last_id || payload?.last_id || '').trim();
}

async function fetchOzonPricePages(options, fetchImpl = fetch) {
  const items = [];
  const limit = options.pageSize || DEFAULT_PAGE_SIZE;
  let cursor = '';
  const seen = new Set();
  for (let page = 0; page < 1000; page += 1) {
    const payload = await requestJson(`${options.ozonApiBaseUrl || OZON_API_BASE_URL}/v5/product/info/prices`, {
      method: 'POST',
      headers: {
        'Client-Id': options.ozonClientId,
        'Api-Key': options.ozonApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        cursor,
        filter: { visibility: 'ALL' },
        limit
      })
    }, 'Ozon prices API', fetchImpl);
    const batch = ozonItems(payload);
    items.push(...batch);
    const nextCursor = ozonCursor(payload);
    if (!batch.length || !nextCursor || nextCursor === cursor || seen.has(nextCursor) || batch.length < limit) break;
    seen.add(nextCursor);
    cursor = nextCursor;
  }
  return items;
}

function normalizeOzonPrices(items, index, asOfDate) {
  const rows = [];
  const unresolved = [];
  for (const item of Array.isArray(items) ? items : []) {
    const price = item?.price && typeof item.price === 'object' ? item.price : {};
    const offerId = String(item?.offer_id ?? item?.offerId ?? '').trim();
    const productId = String(item?.product_id ?? item?.productId ?? '').trim().replace(/\.0$/, '');
    const mapping = resolveArticle(index, [
      { type: 'offer_id', value: offerId },
      { type: 'product_id', value: productId }
    ]);
    const sellerPrice = firstPositive(
      price?.marketing_seller_price,
      item?.marketing_seller_price,
      price?.current_price,
      item?.current_price,
      price?.retail_price,
      typeof item?.price === 'string' || typeof item?.price === 'number' ? item.price : null
    );
    const clientPrice = firstPositive(
      price?.marketing_price,
      item?.marketing_price,
      price?.marketing_seller_price,
      item?.marketing_seller_price,
      sellerPrice
    );
    const common = {
      platform: 'ozon',
      marketplace: 'ozon',
      offerId,
      productId: numberOrNull(productId),
      currency: String(price?.currency_code || item?.currency_code || 'RUB'),
      asOfDate,
      retrievedAt: `${asOfDate}T00:00:00.000Z`,
      sourceStatus: 'direct_api',
      source: 'Ozon Seller API /v5/product/info/prices',
      mapping
    };
    if (mapping.status !== 'mapped') {
      unresolved.push({ ...common, reason: mapping.status, rawPrice: price });
      continue;
    }
    if (sellerPrice === null) {
      unresolved.push({ ...common, articleKey: mapping.articleKey, reason: 'missing_seller_price', rawPrice: price });
      continue;
    }
    rows.push({
      id: `ozon|${normalizeKey(mapping.articleKey)}`,
      articleKey: mapping.articleKey,
      normalizedArticleKey: normalizeKey(mapping.articleKey),
      article: offerId || mapping.articleKey,
      currentFillPrice: round(sellerPrice),
      currentPrice: round(sellerPrice),
      currentSellerPrice: round(sellerPrice),
      currentClientPrice: round(clientPrice),
      currentListPrice: round(firstPositive(price?.old_price, item?.old_price, price?.retail_price)),
      currentPriceDate: asOfDate,
      valueDate: asOfDate,
      historyFreshnessDate: asOfDate,
      currentSellerPriceSource: 'ozon-prices-api-v5',
      currentPriceSource: 'ozon-prices-api-v5',
      currentSellerPriceFile: 'repricer_live_prices.json',
      daily: [{
        date: asOfDate,
        price: round(sellerPrice),
        clientPrice: round(clientPrice),
        sppPct: null
      }],
      ...common
    });
  }
  return { rows, unresolved };
}

function duplicateRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.platform}|${row.normalizedArticleKey}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  return [...byKey.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([key, matches]) => ({
      key,
      rows: matches.map((row) => ({
        articleKey: row.articleKey,
        currentSellerPrice: row.currentSellerPrice,
        nmId: row.nmId ?? null,
        offerId: row.offerId ?? ''
      }))
    }));
}

function primaryRowScore(row = {}) {
  const articleKey = normalizedIdentifier(row.articleKey);
  const vendorOrOffer = normalizedIdentifier(row.article || row.vendorCode || row.offerId);
  const evidence = Array.isArray(row.mapping?.evidence) ? row.mapping.evidence : [];
  let score = vendorOrOffer && vendorOrOffer === articleKey ? 1000 : 0;
  if (evidence.some((item) => (item.indexSources || []).some((source) => /sku\.(articleKey|article)$/.test(source)))) score += 500;
  if (evidence.some((item) => (item.indexSources || []).some((source) => /sku\.nmId|sku\.ozon\.(productId|offerId)/.test(source)))) score += 300;
  if (evidence.some((item) => (item.indexSources || []).some((source) => /platformAliases|sku\.aliases|sku_aliases/.test(source)))) score += 100;
  if (firstPositive(row.currentSellerPrice, row.currentPrice) !== null) score += 10;
  return score;
}

function selectPrimaryNormalizedRows(normalized = {}) {
  const grouped = new Map();
  for (const row of Array.isArray(normalized.rows) ? normalized.rows : []) {
    const key = `${String(row.platform || '').trim().toLowerCase()}|${normalizedIdentifier(row.articleKey)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const rows = [];
  const dropped = [];
  for (const matches of grouped.values()) {
    const ordered = [...matches].sort((left, right) => (
      primaryRowScore(right) - primaryRowScore(left)
      || Number(left.nmId ?? left.productId ?? Number.MAX_SAFE_INTEGER) - Number(right.nmId ?? right.productId ?? Number.MAX_SAFE_INTEGER)
      || String(left.article || '').localeCompare(String(right.article || ''), 'ru')
    ));
    rows.push(ordered[0]);
    ordered.slice(1).forEach((row) => dropped.push({
      ...row,
      reason: 'duplicate_non_primary',
      selectedArticleKey: ordered[0].articleKey,
      selectedMarketplaceId: ordered[0].nmId ?? ordered[0].productId ?? null,
      selectedSellerPrice: ordered[0].currentSellerPrice
    }));
  }
  return {
    rows,
    unresolved: [...(Array.isArray(normalized.unresolved) ? normalized.unresolved : []), ...dropped]
  };
}

function protectedKeysByPlatform(inputDir) {
  const result = { wb: new Set(), ozon: new Set() };
  const canonical = readJson(path.join(inputDir, 'canonical_repricer.json'), { rows: [] });
  for (const row of Array.isArray(canonical?.rows) ? canonical.rows : []) {
    const platform = String(row?.platform || '').trim().toLowerCase();
    if (!result[platform] || row?.policy?.margin_guard_required !== true) continue;
    const key = normalizedIdentifier(row?.article_key || row?.articleKey);
    if (key) result[platform].add(key);
  }
  return result;
}

function platformSummary(sourceRows, normalized, protectedKeys = new Set()) {
  const total = sourceRows.length;
  const mapped = normalized.rows.length;
  const unresolved = normalized.unresolved.length;
  const mappedKeys = new Set(normalized.rows.map((row) => normalizedIdentifier(row.articleKey)).filter(Boolean));
  const protectedMissingKeys = [...protectedKeys].filter((key) => !mappedKeys.has(key)).sort();
  const protectedExpectedRows = protectedKeys.size;
  const protectedMappedRows = protectedExpectedRows - protectedMissingKeys.length;
  return {
    sourceRows: total,
    mappedRows: mapped,
    unresolvedRows: unresolved,
    mappedRatio: total > 0 ? round(mapped / total, 6) : 0,
    unresolvedRatio: total > 0 ? round(unresolved / total, 6) : 0,
    missingSellerPriceRows: normalized.unresolved.filter((row) => row.reason === 'missing_seller_price').length,
    ambiguousRows: normalized.unresolved.filter((row) => row.reason === 'ambiguous').length,
    unmappedRows: normalized.unresolved.filter((row) => row.reason === 'unmapped').length,
    duplicateNonPrimaryRows: normalized.unresolved.filter((row) => row.reason === 'duplicate_non_primary').length,
    protectedExpectedRows,
    protectedMappedRows,
    protectedMissingRows: protectedMissingKeys.length,
    protectedCoverage: protectedExpectedRows > 0 ? round(protectedMappedRows / protectedExpectedRows, 6) : null,
    protectedMissingRatio: protectedExpectedRows > 0 ? round(protectedMissingKeys.length / protectedExpectedRows, 6) : null,
    protectedMissingKeys
  };
}

function resolveOptions(args = {}) {
  const root = process.cwd();
  const inputDir = path.resolve(args['input-dir'] || path.join(root, 'data'));
  return {
    inputDir,
    outputPath: path.resolve(args.output || path.join(inputDir, 'repricer_live_prices.json')),
    asOfDate: isoDate(args['as-of-date'] || new Date().toISOString()),
    generatedAt: String(args['generated-at'] || new Date().toISOString()),
    dryRun: Boolean(args['dry-run']),
    strict: Boolean(args.strict),
    pageSize: Math.max(1, Math.min(DEFAULT_PAGE_SIZE, Math.trunc(numberOrNull(args['page-size']) || DEFAULT_PAGE_SIZE))),
    maxUnmappedRatio: Math.max(0, Math.min(1, numberOrNull(args['max-unmapped-ratio']) ?? DEFAULT_MAX_UNMAPPED_RATIO)),
    wbToken: String(args['wb-token'] || process.env.ALTEA_WB_API_TOKEN || process.env.ALTEA_WB_PROMOTION_TOKEN || '').trim(),
    wbPricesUrl: String(args['wb-prices-url'] || process.env.ALTEA_WB_PRICES_URL || WB_PRICES_URL).trim(),
    ozonClientId: String(args['ozon-client-id'] || process.env.ALTEA_OZON_CLIENT_ID || '').trim(),
    ozonApiKey: String(args['ozon-api-key'] || process.env.ALTEA_OZON_API_KEY || '').trim(),
    ozonApiBaseUrl: String(args['ozon-api-base-url'] || process.env.ALTEA_OZON_API_BASE_URL || OZON_API_BASE_URL).replace(/\/+$/, '')
  };
}

async function buildLivePrices(options, dependencies = {}) {
  if (!options.wbToken) throw new Error('ALTEA_WB_API_TOKEN is not set');
  if (!options.ozonClientId || !options.ozonApiKey) {
    throw new Error('ALTEA_OZON_CLIENT_ID / ALTEA_OZON_API_KEY are not set');
  }
  const skus = readJson(path.join(options.inputDir, 'skus.json'), []);
  const aliases = readJson(path.join(options.inputDir, 'sku_aliases.json'), { aliases: [] });
  const skuMatrix = readJson(path.join(options.inputDir, 'sku_matrix.json'), {});
  const indexes = buildSkuIndexes(skus, aliases, skuMatrix);
  const protectedKeys = protectedKeysByPlatform(options.inputDir);
  const fetchImpl = dependencies.fetchImpl || fetch;
  const [wbResult, ozonResult] = await Promise.allSettled([
    fetchWbPricePages(options, fetchImpl),
    fetchOzonPricePages(options, fetchImpl)
  ]);
  const wbItems = wbResult.status === 'fulfilled' ? wbResult.value : [];
  const ozonPriceItems = ozonResult.status === 'fulfilled' ? ozonResult.value : [];
  const sourceErrors = {};
  if (wbResult.status === 'rejected') sourceErrors.wb = String(wbResult.reason?.message || wbResult.reason || 'WB request failed').slice(0, 1000);
  if (ozonResult.status === 'rejected') sourceErrors.ozon = String(ozonResult.reason?.message || ozonResult.reason || 'Ozon request failed').slice(0, 1000);
  const wb = selectPrimaryNormalizedRows(normalizeWbPrices(wbItems, indexes.wb, options.asOfDate));
  const ozon = selectPrimaryNormalizedRows(normalizeOzonPrices(ozonPriceItems, indexes.ozon, options.asOfDate));
  const rows = [...wb.rows, ...ozon.rows];
  const duplicates = duplicateRows(rows);
  const summary = {
    sourceRows: wbItems.length + ozonPriceItems.length,
    mappedRows: rows.length,
    unresolvedRows: wb.unresolved.length + ozon.unresolved.length,
    duplicatePlatformArticleKeys: duplicates.length,
    platforms: {
      wb: platformSummary(wbItems, wb, protectedKeys.wb),
      ozon: platformSummary(ozonPriceItems, ozon, protectedKeys.ozon)
    }
  };
  const blockingReasons = [];
  for (const platform of ['wb', 'ozon']) {
    const stats = summary.platforms[platform];
    if (sourceErrors[platform]) blockingReasons.push(`${platform}: API request failed`);
    if (!stats.sourceRows) blockingReasons.push(`${platform}: API returned no price rows`);
    if (!stats.mappedRows) blockingReasons.push(`${platform}: no mapped price rows`);
    const unresolvedGateRatio = stats.protectedExpectedRows > 0
      ? stats.protectedMissingRatio
      : stats.unresolvedRatio;
    if (unresolvedGateRatio > options.maxUnmappedRatio) {
      blockingReasons.push(`${platform}: unresolved ratio ${stats.unresolvedRatio} exceeds ${options.maxUnmappedRatio}`);
    }
  }
  if (duplicates.length) blockingReasons.push(`duplicate platform/article keys: ${duplicates.length}`);
  const payload = {
    schema: 'repricer-live-prices-v1',
    generatedAt: options.generatedAt,
    asOfDate: options.asOfDate,
    brand: 'Алтея',
    source: 'WB Prices API + Ozon Seller API',
    note: 'Server-side current seller-price snapshot. Browser credentials are never used.',
    summary,
    status: blockingReasons.length ? 'blocked' : 'ok',
    blockingReasons,
    sourceErrors,
    platforms: {
      wb: {
        label: 'WB',
        source: 'GET /api/v2/list/goods/filter',
        asOfDate: options.asOfDate,
        rows: wb.rows
      },
      ozon: {
        label: 'Ozon',
        source: 'POST /v5/product/info/prices',
        asOfDate: options.asOfDate,
        rows: ozon.rows
      }
    },
    unresolved: [...wb.unresolved, ...ozon.unresolved],
    duplicates
  };
  if (options.strict && blockingReasons.length) {
    const error = new Error(`Live price snapshot blocked: ${blockingReasons.join('; ')}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  try {
    const payload = await buildLivePrices(options);
    if (!options.dryRun) writeJson(options.outputPath, payload);
    const prefix = payload.status === 'ok' ? '[repricer-live-prices] OK' : '[repricer-live-prices] BLOCKED';
    console.log(`${prefix}: ${payload.summary.mappedRows}/${payload.summary.sourceRows} mapped, ${payload.summary.unresolvedRows} unresolved`);
    if (payload.status !== 'ok' && options.strict) process.exitCode = 1;
  } catch (error) {
    if (error?.payload && !options.dryRun) writeJson(options.outputPath, error.payload);
    console.error(`[repricer-live-prices] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildLivePrices,
  buildSkuIndexes,
  fetchOzonPricePages,
  fetchWbPricePages,
  normalizeOzonPrices,
  normalizeWbPrices,
  parseArgs,
  resolveArticle,
  resolveOptions,
  selectPrimaryNormalizedRows
};
