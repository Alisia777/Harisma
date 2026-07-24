#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const API_BASE_URL = 'https://api.partner.market.yandex.ru';
const BLOCKED_LIFECYCLE_RE = /вывод|на вывод|вывед|снят|снимаем|spa|архив|archive|paused|pause|freeze|hold|под вопрос|question/i;
const UNMAPPED_CLUSTER = '\u0411\u0435\u0437 \u043a\u043b\u0430\u0441\u0442\u0435\u0440\u0430 \u042f\u041c';
const FBY_UNMAPPED_CLUSTER = 'FBY \u0431\u0435\u0437 \u043a\u043b\u0430\u0441\u0442\u0435\u0440\u0430';

function parseArgs(argv) {
  const args = { command: 'sync' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args.command = token;
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeNameKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLooseNameKey(value) {
  return normalizeNameKey(value)
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberOrZero(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeGzip(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')));
}

function resolveOptions(args) {
  const root = path.resolve(__dirname, '..');
  const outputPath = path.resolve(args.output || path.join(root, 'data', 'order_procurement_ym.json'));
  return {
    command: args.command || 'sync',
    root,
    apiBaseUrl: normalizeText(args['api-base-url'] || process.env.ALTEA_YM_API_BASE_URL || API_BASE_URL),
    apiKey: normalizeText(args['api-key'] || process.env.ALTEA_YM_API_KEY || ''),
    campaignId: normalizeText(args['campaign-id'] || process.env.ALTEA_YM_CAMPAIGN_ID || ''),
    businessId: normalizeText(args['business-id'] || process.env.ALTEA_YM_BUSINESS_ID || ''),
    includeArchived: asBool(args.archived || process.env.ALTEA_YM_STOCK_ARCHIVED, false),
    withTurnover: asBool(args['with-turnover'] || process.env.ALTEA_YM_STOCK_WITH_TURNOVER, true),
    outputPath,
    gzipPath: path.resolve(args.gzip || `${outputPath}.gz`),
    skusPath: path.resolve(args['skus-file'] || path.join(root, 'data', 'skus.json')),
    skuAliasPath: path.resolve(args['sku-alias-file'] || path.join(root, 'data', 'sku_aliases.json')),
    platformTrendsPath: path.resolve(args['platform-trends-file'] || path.join(root, 'data', 'platform_trends.json')),
    clusterMapPath: path.resolve(args['cluster-map'] || path.join(root, 'data', 'yandex_market_cluster_map.json')),
    limit: Math.max(1, Math.min(200, Math.trunc(numberOrZero(args.limit || process.env.ALTEA_YM_STOCK_PAGE_LIMIT || 200))))
  };
}

async function yandexRequest(options, apiPath, requestOptions = {}) {
  const url = new URL(`${options.apiBaseUrl}${apiPath}`);
  Object.entries(requestOptions.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    method: requestOptions.method || 'GET',
    headers: {
      'Api-Key': options.apiKey,
      'Content-Type': 'application/json'
    },
    body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(`Yandex Market API ${apiPath}: HTTP ${response.status} ${text.slice(0, 900)}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function campaignIdentitiesFromPayload(payload) {
  const campaigns = Array.isArray(payload?.result?.campaigns)
    ? payload.result.campaigns
    : Array.isArray(payload?.campaigns)
      ? payload.campaigns
      : [];
  return campaigns
    .map((campaign) => ({
      campaignId: normalizeText(campaign.id || campaign.campaignId),
      businessId: normalizeText(campaign.business?.id || campaign.businessId || campaign.business_id),
      domain: normalizeText(campaign.domain || campaign.name),
      placementType: normalizeText(campaign.placementType || campaign.placement_type).toUpperCase()
    }))
    .filter((identity) => identity.campaignId);
}

async function discoverIdentities(options) {
  let discovered = [];
  try {
    const payload = await yandexRequest(options, '/v2/campaigns');
    discovered = campaignIdentitiesFromPayload(payload);
  } catch (error) {
    if (!options.campaignId) throw error;
  }

  if (options.campaignId) {
    const byId = new Map(discovered.map((identity) => [identity.campaignId, identity]));
    return options.campaignId
      .split(',')
      .map((campaignId) => {
        const clean = normalizeText(campaignId);
        return { campaignId: clean, ...(byId.get(clean) || {}) };
      })
      .filter((identity) => identity.campaignId);
  }

  if (!options.businessId) return discovered;
  return discovered.filter((identity) => !identity.businessId || identity.businessId === options.businessId);
}

function collectWarehouseObjects(value, target = []) {
  if (!value || typeof value !== 'object') return target;
  if (Array.isArray(value)) {
    value.forEach((item) => collectWarehouseObjects(item, target));
    return target;
  }

  const id = value.id ?? value.warehouseId ?? value.warehouse_id;
  const name = value.name ?? value.warehouseName ?? value.warehouse_name;
  if (id !== undefined && id !== null && normalizeText(name)) {
    target.push({
      warehouseId: String(id),
      name: normalizeText(name),
      address: normalizeText(value.address?.fullAddress || value.address || value.fullAddress || ''),
      raw: value
    });
  }

  Object.keys(value).forEach((key) => {
    if (['raw'].includes(key)) return;
    collectWarehouseObjects(value[key], target);
  });
  return target;
}

function uniqueWarehouses(items) {
  const byId = new Map();
  for (const item of items || []) {
    const id = normalizeText(item?.warehouseId);
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      warehouseId: id,
      name: normalizeText(item.name),
      address: normalizeText(item.address)
    });
  }
  return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name, 'ru'));
}

async function fetchWarehouseCatalog(options, businessIds = []) {
  const rows = [];
  const warnings = [];

  try {
    const payload = await yandexRequest(options, '/v2/warehouses');
    rows.push(...collectWarehouseObjects(payload));
  } catch (error) {
    warnings.push(`GET /v2/warehouses failed: ${error.message}`);
  }

  const requestedBusinessIds = Array.from(new Set([
    normalizeText(options.businessId),
    ...(Array.isArray(businessIds) ? businessIds.map(normalizeText) : [])
  ].filter(Boolean)));

  for (const businessId of requestedBusinessIds) {
    try {
      let pageToken = '';
      do {
        const payload = await yandexRequest(options, `/v2/businesses/${encodeURIComponent(businessId)}/warehouses`, {
          method: 'POST',
          query: {
            limit: Math.min(30, options.limit),
            ...(pageToken ? { pageToken } : {})
          },
          body: {}
        });
        rows.push(...collectWarehouseObjects(payload));
        pageToken = normalizeText(payload?.result?.paging?.nextPageToken || payload?.paging?.nextPageToken);
      } while (pageToken);
    } catch (error) {
      warnings.push(`POST /v2/businesses/${businessId}/warehouses failed: ${error.message}`);
    }
  }

  return {
    rows: uniqueWarehouses(rows),
    warnings
  };
}

function aliasPlatformMatches(value, platform = 'ym') {
  const raw = normalizeKey(value);
  if (!raw) return true;
  if (platform === 'ym') return ['ym', 'ya', 'yandex', 'yandex_market', 'yandexmarket', 'market'].includes(raw);
  return raw === platform;
}

function activeSkuAliasRows(skuAliases = {}) {
  const rows = Array.isArray(skuAliases)
    ? skuAliases
    : (Array.isArray(skuAliases.aliases) ? skuAliases.aliases : []);
  return rows.filter((row) => !['0', 'false', 'no', 'off', 'disabled', 'ignore'].includes(
    normalizeText(row?.active ?? row?.enabled ?? row?.status ?? 'active').toLowerCase()
  ));
}

function firstTextValue(row, keys) {
  for (const key of keys) {
    const value = normalizeText(row?.[key]);
    if (value) return value;
  }
  return '';
}

function skuLookupTokens(sku, platform = 'ym') {
  const values = [
    sku?.articleKey,
    sku?.article,
    sku?.sku,
    sku?.vendorCode,
    sku?.barcode,
    sku?.ym?.offerId,
    sku?.ym?.offer_id,
    sku?.ya?.offerId,
    sku?.ya?.offer_id,
    sku?.yandex?.offerId,
    sku?.yandex?.offer_id
  ];

  if (Array.isArray(sku?.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') {
        values.push(alias);
        return;
      }
      if (!aliasPlatformMatches(alias?.platform || alias?.marketplace || alias?.sourcePlatform, platform)) return;
      values.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.offer_id, alias?.vendorCode);
    });
  }

  Object.entries(sku?.platformAliases || {}).forEach(([aliasPlatform, aliases]) => {
    if (!aliasPlatformMatches(aliasPlatform, platform)) return;
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });

  return values;
}

function buildSkuLookup(skus, skuAliases) {
  const byToken = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    for (const value of skuLookupTokens(sku, 'ym')) {
      const key = normalizeKey(value);
      if (key && !byToken.has(key)) byToken.set(key, sku);
    }
  }

  for (const row of activeSkuAliasRows(skuAliases)) {
    const rowPlatform = firstTextValue(row, ['platform', 'marketplace', 'source_platform', 'sourcePlatform']);
    if (!aliasPlatformMatches(rowPlatform, 'ym')) continue;
    const targetToken = normalizeKey(firstTextValue(row, ['target_sku', 'targetSku', 'target', 'portal_sku', 'article_key', 'articleKey', 'sku']));
    const aliasValue = firstTextValue(row, ['api_sku', 'apiSku', 'api_article', 'alias', 'value', 'source_sku', 'marketplace_sku', 'external_sku', 'offer_id', 'offerId', 'vendor_code', 'vendorCode']);
    const aliasToken = normalizeKey(aliasValue);
    const targetSku = byToken.get(targetToken);
    if (targetSku && aliasToken && !byToken.has(aliasToken)) byToken.set(aliasToken, targetSku);
  }

  return byToken;
}

function articleKeyForSku(sku, fallback = '') {
  return normalizeText(sku?.articleKey || sku?.article || sku?.sku || sku?.vendorCode || fallback);
}

function articleNameForSku(sku, fallback = '') {
  return normalizeText(sku?.name || sku?.title || fallback);
}

function ownerForSku(sku) {
  return normalizeText(sku?.owner?.byPlatform?.ym || sku?.ownersByPlatform?.ym || sku?.owner?.name || sku?.owner || '');
}

function lifecycleStatus(sku = {}) {
  const candidates = [
    sku?.status,
    sku?.lifecycleStatus,
    sku?.lifecycle,
    sku?.productLifecycle,
    sku?.registryStatus,
    sku?.owner?.registryStatus
  ].map(normalizeText).filter(Boolean);
  return {
    label: candidates[0] || '',
    blocked: candidates.some((item) => BLOCKED_LIFECYCLE_RE.test(item))
  };
}

function trendsByArticle(platformTrends) {
  const articles = platformTrends?.extraMarketplace?.platforms?.ya?.articles
    || platformTrends?.extraMarketplace?.platforms?.ym?.articles
    || [];
  const result = new Map();
  for (const item of Array.isArray(articles) ? articles : []) {
    const key = normalizeKey(item?.articleKey || item?.article);
    if (!key) continue;
    const daily = Array.isArray(item.daily) ? item.daily : [];
    const sorted = [...daily].sort((left, right) => String(left.date || left.label || '').localeCompare(String(right.date || right.label || '')));
    const sumDays = (days) => sorted.slice(-days).reduce((acc, point) => (
      acc + numberOrZero(point.ordersUnits ?? point.units ?? point.deliveredUnits)
    ), 0);
    const sales7 = sumDays(7);
    const sales14 = sumDays(14);
    const sales28 = sumDays(28);
    const span = Math.min(28, sorted.length) || 1;
    result.set(key, {
      articleKey: item.articleKey || item.article,
      name: item.name || '',
      owner: item.owner || '',
      sales7,
      sales14,
      sales28,
      avgDaily: sales28 > 0 ? sales28 / span : (sales14 > 0 ? sales14 / Math.min(14, sorted.length || 14) : sales7 / Math.min(7, sorted.length || 7)),
      from: sorted[0]?.date || sorted[0]?.label || '',
      to: sorted[sorted.length - 1]?.date || sorted[sorted.length - 1]?.label || ''
    });
  }
  return result;
}

function flattenClusterAliases(clusterMap) {
  const aliases = [];
  if (Array.isArray(clusterMap?.warehouseAliases)) aliases.push(...clusterMap.warehouseAliases);
  for (const cluster of Array.isArray(clusterMap?.clusters) ? clusterMap.clusters : []) {
    for (const warehouse of Array.isArray(cluster?.warehouses) ? cluster.warehouses : []) {
      aliases.push({
        cluster: cluster.cluster,
        warehouseId: warehouse.warehouseId,
        name: warehouse.name,
        normalizedName: warehouse.normalizedName
      });
    }
  }
  const seen = new Set();
  return aliases
    .map((alias) => ({
      cluster: normalizeText(alias.cluster),
      warehouseId: normalizeText(alias.warehouseId),
      name: normalizeText(alias.name),
      normalizedName: normalizeNameKey(alias.normalizedName || alias.name)
    }))
    .filter((alias) => {
      const key = `${alias.cluster}|${alias.warehouseId}|${alias.normalizedName}`;
      if (!alias.cluster || (!alias.warehouseId && !alias.normalizedName) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function fallbackClusterForWarehouse(warehouseMeta = {}) {
  const placementType = normalizeText(warehouseMeta.placementType).toUpperCase();
  const warehouseName = normalizeText(warehouseMeta.warehouseName);
  const campaignDomain = normalizeText(warehouseMeta.campaignDomain);
  const warehouseId = normalizeText(warehouseMeta.warehouseId);
  const displayName = warehouseName || campaignDomain || (warehouseId ? `warehouse ${warehouseId}` : 'unknown');
  const fallbackName = displayName.replace(/^warehouse\s+/i, 'warehouse ');

  if (placementType === 'FBY') {
    return `${FBY_UNMAPPED_CLUSTER}: ${warehouseName || (warehouseId ? `warehouse ${warehouseId}` : campaignDomain || 'unknown')}`;
  }
  if (placementType === 'FBS') {
    if (/express|экспресс/i.test(`${campaignDomain} ${warehouseName}`)) return `Express: ${fallbackName}`;
    return `FBS: ${fallbackName}`;
  }
  if (placementType) return `${placementType}: ${fallbackName}`;
  return `${FBY_UNMAPPED_CLUSTER}: ${fallbackName}`;
}

function buildWarehouseResolver(clusterMap, warehouseCatalog) {
  const aliases = flattenClusterAliases(clusterMap);
  const catalogById = new Map((warehouseCatalog || []).map((warehouse) => [normalizeText(warehouse.warehouseId), warehouse]));
  const clusterById = new Map();
  const aliasesByName = [];
  const ignoredTokens = new Set(['мо', 'ло', 'кгт', 'кроме', 'яндекс', 'маркет', 'market', 'yandex']);

  aliases.forEach((alias) => {
    if (alias.warehouseId) clusterById.set(alias.warehouseId, alias.cluster);
    if (alias.normalizedName) {
      aliasesByName.push({
        ...alias,
        looseName: normalizeLooseNameKey(alias.normalizedName),
        tokens: normalizeNameKey(alias.normalizedName)
          .split(' ')
          .filter((token) => token.length >= 5 && !ignoredTokens.has(token))
      });
    }
  });

  return function resolveWarehouse(warehouseIdRaw, warehouseMeta = {}) {
    const warehouseId = normalizeText(warehouseIdRaw);
    const catalog = catalogById.get(warehouseId) || null;
    const catalogName = normalizeText(catalog?.name || warehouseMeta.warehouseName);
    const catalogNameKey = normalizeNameKey(catalogName);
    const catalogLooseNameKey = normalizeLooseNameKey(catalogName);
    const catalogTokens = new Set(catalogNameKey.split(' ').filter((token) => token.length >= 5 && !ignoredTokens.has(token)));

    let cluster = clusterById.get(warehouseId) || '';
    let matchedBy = cluster ? 'warehouseId' : '';
    let aliasName = '';

    if (!cluster && catalogNameKey) {
      const exact = aliasesByName.find((alias) => alias.normalizedName === catalogNameKey);
      const loose = exact || aliasesByName.find((alias) => alias.looseName && alias.looseName === catalogLooseNameKey);
      const fuzzy = loose || aliasesByName.find((alias) => (
        alias.normalizedName
        && (catalogNameKey.includes(alias.normalizedName) || alias.normalizedName.includes(catalogNameKey))
      )) || aliasesByName.find((alias) => alias.tokens.some((token) => catalogTokens.has(token)));
      if (fuzzy) {
        cluster = fuzzy.cluster;
        aliasName = fuzzy.name;
        matchedBy = exact ? 'name' : (loose ? 'name-loose' : 'name-fuzzy');
      }
    }

    return {
      warehouseId,
      warehouseName: catalogName || (warehouseId ? `warehouse ${warehouseId}` : ''),
      cluster: cluster || fallbackClusterForWarehouse({
        ...warehouseMeta,
        warehouseId,
        warehouseName: catalogName || warehouseMeta.warehouseName
      }),
      matchedBy: matchedBy || 'unmapped',
      aliasName
    };
  };
}

async function fetchStocksPage(options, campaignId, pageToken, withTurnover) {
  return await yandexRequest(options, `/v2/campaigns/${encodeURIComponent(campaignId)}/offers/stocks`, {
    method: 'POST',
    query: {
      limit: options.limit,
      ...(pageToken ? { pageToken } : {})
    },
    body: {
      archived: options.includeArchived,
      withTurnover
    }
  });
}

async function fetchCampaignStocks(options, identity) {
  const campaignId = identity.campaignId;
  const rows = [];
  const warnings = [];
  let pageToken = '';
  let withTurnover = options.withTurnover;
  let retriedWithoutTurnover = false;

  do {
    let payload;
    try {
      payload = await fetchStocksPage(options, campaignId, pageToken, withTurnover);
    } catch (error) {
      if (withTurnover && !retriedWithoutTurnover && Number(error.status) === 400) {
        warnings.push(`campaign ${campaignId}: retry stocks without withTurnover after HTTP 400`);
        withTurnover = false;
        retriedWithoutTurnover = true;
        pageToken = '';
        rows.length = 0;
        continue;
      }
      throw error;
    }

    const warehouses = Array.isArray(payload?.result?.warehouses)
      ? payload.result.warehouses
      : [];
    for (const warehouse of warehouses) {
      for (const offer of Array.isArray(warehouse?.offers) ? warehouse.offers : []) {
        if (!offer) continue;
        rows.push({
          campaignId: String(campaignId),
          campaignDomain: identity.domain || '',
          placementType: identity.placementType || '',
          warehouseId: normalizeText(warehouse.warehouseId),
          offer
        });
      }
    }
    pageToken = normalizeText(payload?.result?.paging?.nextPageToken);
  } while (pageToken);

  return {
    rows,
    warnings,
    withTurnover
  };
}

function stockCountsByType(stocks) {
  const counts = {};
  for (const stock of Array.isArray(stocks) ? stocks : []) {
    const type = normalizeText(stock?.type).toUpperCase();
    if (!type) continue;
    counts[type] = (counts[type] || 0) + numberOrZero(stock?.count);
  }
  const hasAvailable = Object.prototype.hasOwnProperty.call(counts, 'AVAILABLE');
  const saleable = hasAvailable ? numberOrZero(counts.AVAILABLE) : numberOrZero(counts.FIT);
  return {
    counts,
    saleable,
    available: numberOrZero(counts.AVAILABLE),
    fit: numberOrZero(counts.FIT),
    freeze: numberOrZero(counts.FREEZE),
    quarantine: numberOrZero(counts.QUARANTINE),
    defect: numberOrZero(counts.DEFECT),
    expired: numberOrZero(counts.EXPIRED)
  };
}

function projectedUnits(avgDaily, days) {
  if (!(avgDaily > 0) || !(days > 0)) return 0;
  return Number((avgDaily * days).toFixed(2));
}

function projectedNeed(avgDaily, stock, days) {
  if (!(avgDaily > 0) || !(days > 0)) return 0;
  return Math.max(0, Math.ceil((avgDaily * days) - numberOrZero(stock)));
}

function projectedNeedRaw(avgDaily, available, days, safetyStock = 0) {
  if (!(avgDaily > 0) || !(days > 0)) return 0;
  return Math.ceil((avgDaily * days) + numberOrZero(safetyStock) - numberOrZero(available));
}

function targetNeedFromRaw(rawNeed, blocked = false) {
  if (blocked) return 0;
  return Math.max(0, numberOrZero(rawNeed));
}

function shouldUseFallbackTrend(row, articleRows, trendAvgDaily) {
  if (!(trendAvgDaily > 0)) return false;
  const placementType = normalizeText(row?.placementType).toUpperCase();
  if (placementType === 'FBS') return true;
  if (numberOrZero(row?.inStock) > 0) return true;
  return articleRows.every((item) => numberOrZero(item?.inStock) <= 0);
}

function makeEmptyPayload(reason = '') {
  return {
    schema: 'portal-order-procurement-ym-v1',
    generatedAt: new Date().toISOString(),
    platform: 'YM',
    platformKey: 'ym',
    source: {
      mode: 'empty',
      reason
    },
    sourceFreshness: {},
    window: {},
    rows: [],
    diagnostics: {
      stockRows: 0,
      outputRows: 0,
      matchedRows: 0,
      unmatchedRows: 0,
      unmappedWarehouses: 0,
      notes: reason ? [reason] : []
    }
  };
}

function buildPayload(options, sourceRows, context) {
  const { skus, skuAliases, platformTrends, clusterMap, warehouseCatalog, identities, warnings, stockWithTurnover } = context;
  const skuLookup = buildSkuLookup(skus, skuAliases);
  const trends = trendsByArticle(platformTrends);
  const resolveWarehouse = buildWarehouseResolver(clusterMap, warehouseCatalog);
  const aggregate = new Map();
  const diagnostics = {
    stockRows: sourceRows.length,
    outputRows: 0,
    matchedRows: 0,
    unmatchedRows: 0,
    unmappedWarehouses: 0,
    unmappedWarehouseSamples: [],
    unmatchedOfferSamples: [],
    warnings: warnings.slice()
  };

  for (const item of sourceRows) {
    const offerId = normalizeText(item.offer?.offerId || item.offer?.shopSku || item.offer?.sku);
    if (!offerId) continue;

    const stock = stockCountsByType(item.offer?.stocks);
    const resolvedWarehouse = resolveWarehouse(item.warehouseId, {
      placementType: item.placementType,
      campaignDomain: item.campaignDomain
    });
    if (resolvedWarehouse.matchedBy === 'unmapped') {
      diagnostics.unmappedWarehouses += 1;
      if (diagnostics.unmappedWarehouseSamples.length < 10) {
        diagnostics.unmappedWarehouseSamples.push({
          warehouseId: resolvedWarehouse.warehouseId,
          warehouseName: resolvedWarehouse.warehouseName,
          campaignDomain: item.campaignDomain || '',
          placementType: item.placementType || ''
        });
      }
    }

    const sku = skuLookup.get(normalizeKey(offerId)) || null;
    if (sku) diagnostics.matchedRows += 1;
    else {
      diagnostics.unmatchedRows += 1;
      if (diagnostics.unmatchedOfferSamples.length < 20) diagnostics.unmatchedOfferSamples.push(offerId);
    }

    const articleKey = articleKeyForSku(sku, offerId);
    const article = normalizeText(sku?.article || articleKey);
    const trend = trends.get(normalizeKey(articleKey)) || trends.get(normalizeKey(article)) || null;
    const lifecycle = lifecycleStatus(sku || {});
    const key = `${normalizeKey(articleKey)}|${resolvedWarehouse.cluster}`;
    const current = aggregate.get(key) || {
      platform: 'YM',
      platformKey: 'ym',
      place: resolvedWarehouse.cluster,
      article,
      articleKey,
      name: articleNameForSku(sku, trend?.name || offerId),
      owner: ownerForSku(sku) || trend?.owner || '',
      offerIds: new Set(),
      campaignIds: new Set(),
      warehouseIds: new Set(),
      warehouseNames: new Set(),
      stockAvailable: 0,
      stockFit: 0,
      stockFreeze: 0,
      stockQuarantine: 0,
      stockDefect: 0,
      stockExpired: 0,
      inStock: 0,
      turnoverNumerator: 0,
      turnoverDenominator: 0,
      turnoverSamples: [],
      updatedAt: '',
      matchState: sku ? 'matched' : 'unmatched',
      placementType: item.placementType || '',
      campaignDomain: item.campaignDomain || '',
      warehouseMatchState: resolvedWarehouse.matchedBy,
      trend,
      lifecycle
    };

    const turnoverDays = numberOrZero(item.offer?.turnoverSummary?.turnoverDays);
    current.offerIds.add(offerId);
    current.campaignIds.add(item.campaignId);
    if (resolvedWarehouse.warehouseId) current.warehouseIds.add(resolvedWarehouse.warehouseId);
    if (resolvedWarehouse.warehouseName) current.warehouseNames.add(resolvedWarehouse.warehouseName);
    current.stockAvailable += stock.available;
    current.stockFit += stock.fit;
    current.stockFreeze += stock.freeze;
    current.stockQuarantine += stock.quarantine;
    current.stockDefect += stock.defect;
    current.stockExpired += stock.expired;
    current.inStock += stock.saleable;
    if (turnoverDays > 0) {
      current.turnoverSamples.push(turnoverDays);
      const weight = stock.saleable > 0 ? stock.saleable : 1;
      current.turnoverNumerator += turnoverDays * weight;
      current.turnoverDenominator += weight;
    }
    const updatedAt = normalizeText(item.offer?.updatedAt);
    if (updatedAt && (!current.updatedAt || updatedAt > current.updatedAt)) current.updatedAt = updatedAt;
    aggregate.set(key, current);
  }

  const byArticle = new Map();
  for (const row of aggregate.values()) {
    const key = normalizeKey(row.articleKey || row.article);
    if (!byArticle.has(key)) byArticle.set(key, []);
    byArticle.get(key).push(row);
  }

  const rows = [];
  for (const articleRows of byArticle.values()) {
    const totalStock = articleRows.reduce((acc, row) => acc + numberOrZero(row.inStock), 0);
    const trend = articleRows.find((row) => row.trend)?.trend || null;
    const trendAvgDaily = numberOrZero(trend?.avgDaily);

    for (const row of articleRows) {
      const turnoverDays = row.turnoverDenominator > 0
        ? row.turnoverNumerator / row.turnoverDenominator
        : (row.turnoverSamples.length
          ? row.turnoverSamples.reduce((acc, value) => acc + value, 0) / row.turnoverSamples.length
          : null);
      let avgDaily = turnoverDays && row.inStock > 0
        ? row.inStock / turnoverDays
        : 0;
      let salesSource = turnoverDays ? 'yandex-stock-turnover' : 'stock-only';

      if (!(avgDaily > 0) && shouldUseFallbackTrend(row, articleRows, trendAvgDaily)) {
        if (totalStock > 0 && row.inStock > 0) avgDaily = trendAvgDaily * (row.inStock / totalStock);
        else avgDaily = trendAvgDaily / Math.max(1, articleRows.length);
        if (avgDaily > 0) salesSource = 'yandex-platform-trends-prorated';
      }

      const safeTurnover = turnoverDays || (avgDaily > 0 ? row.inStock / avgDaily : null);
      const inTransit = 0;
      const inRequest = 0;
      const available = row.inStock + inTransit + inRequest;
      const safetyStock = 0;
      const rawNeed28 = projectedNeedRaw(avgDaily, available, 28, safetyStock);
      const rawNeed30 = projectedNeedRaw(avgDaily, available, 30, safetyStock);
      const lifecycle = row.lifecycle || { label: '', blocked: false };
      rows.push({
        platform: 'YM',
        platformKey: 'ym',
        place: row.place,
        article: row.article,
        articleKey: row.articleKey,
        name: row.name,
        owner: row.owner,
        inStock: Math.round(row.inStock),
        inTransit,
        inRequest,
        available,
        safetyStock,
        avgDaily: Number(avgDaily.toFixed(4)),
        turnoverDays: safeTurnover === null ? null : Number(safeTurnover.toFixed(2)),
        sales7: projectedUnits(avgDaily, 7),
        sales14: projectedUnits(avgDaily, 14),
        sales28: projectedUnits(avgDaily, 28),
        sales30: projectedUnits(avgDaily, 30),
        rawNeed7: projectedNeedRaw(avgDaily, available, 7, safetyStock),
        rawNeed14: projectedNeedRaw(avgDaily, available, 14, safetyStock),
        rawNeed28,
        rawNeed30,
        targetNeed7: targetNeedFromRaw(projectedNeedRaw(avgDaily, available, 7, safetyStock), lifecycle.blocked),
        targetNeed14: targetNeedFromRaw(projectedNeedRaw(avgDaily, available, 14, safetyStock), lifecycle.blocked),
        targetNeed28: targetNeedFromRaw(rawNeed28, lifecycle.blocked),
        targetNeed30: targetNeedFromRaw(rawNeed30, lifecycle.blocked),
        targetHorizonDays: 30,
        needFormula: 'max(0, ceil(avgDaily * 30 + safetyStock - (inStock + inTransit + inRequest)))',
        lifecycleStatus: lifecycle.label,
        needSuppressedByLifecycle: lifecycle.blocked,
        stockAvailable: Math.round(row.stockAvailable),
        stockFit: Math.round(row.stockFit),
        stockFreeze: Math.round(row.stockFreeze),
        stockQuarantine: Math.round(row.stockQuarantine),
        stockDefect: Math.round(row.stockDefect),
        stockExpired: Math.round(row.stockExpired),
        warehouseIds: Array.from(row.warehouseIds),
        warehouseNames: Array.from(row.warehouseNames),
        offerIds: Array.from(row.offerIds),
        campaignIds: Array.from(row.campaignIds),
        updatedAt: row.updatedAt,
        matchState: row.matchState,
        placementType: row.placementType,
        campaignDomain: row.campaignDomain,
        warehouseMatchState: row.warehouseMatchState,
        salesSource
      });
    }
  }

  rows.sort((left, right) => (
    String(left.place || '').localeCompare(String(right.place || ''), 'ru')
    || String(left.article || left.articleKey || '').localeCompare(String(right.article || right.articleKey || ''), 'ru')
  ));

  diagnostics.outputRows = rows.length;

  const trendDates = Array.from(trends.values()).reduce((acc, item) => {
    if (item.from && (!acc.from || item.from < acc.from)) acc.from = item.from;
    if (item.to && (!acc.to || item.to > acc.to)) acc.to = item.to;
    return acc;
  }, { from: '', to: '' });

  const generatedAt = new Date().toISOString();
  const stockDate = generatedAt.slice(0, 10);

  return {
    schema: 'portal-order-procurement-ym-v1',
    generatedAt,
    platform: 'YM',
    platformKey: 'ym',
    source: {
      mode: 'partner-api:/v2/campaigns/{campaignId}/offers/stocks',
      clusterMap: path.relative(options.root, options.clusterMapPath).replaceAll('\\', '/'),
      stockWithTurnover,
      campaigns: identities.map((identity) => ({
        campaignId: identity.campaignId,
        domain: identity.domain || '',
        placementType: identity.placementType || ''
      }))
    },
    sourceFreshness: {
      yandexMarketStocks: generatedAt,
      yandexMarketTrends: platformTrends?.extraMarketplace?.generatedAt || platformTrends?.generatedAt || '',
      clusterMapGeneratedAt: clusterMap?.generatedAt || '',
      warehouseCatalogRows: warehouseCatalog.length,
      skusRows: Array.isArray(skus) ? skus.length : 0
    },
    window: {
      from: stockDate,
      to: stockDate,
      salesFrom: trendDates.from || '',
      salesTo: trendDates.to || ''
    },
    rows,
    diagnostics
  };
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (options.command !== 'sync') throw new Error(`Unsupported command: ${options.command}`);

  if (!options.apiKey) {
    const existing = readJson(options.outputPath, null);
    if (existing && Array.isArray(existing.rows)) {
      console.warn('Yandex Market API key is not set. Keep existing order_procurement_ym.json.');
      return;
    }
    const empty = makeEmptyPayload('ALTEA_YM_API_KEY is not set.');
    writeJson(options.outputPath, empty);
    writeGzip(options.gzipPath, empty);
    console.warn('Yandex Market API key is not set. Wrote empty order_procurement_ym.json.');
    return;
  }

  const skus = readJson(options.skusPath, []);
  const skuAliases = readJson(options.skuAliasPath, { aliases: [] });
  const platformTrends = readJson(options.platformTrendsPath, {});
  const clusterMap = readJson(options.clusterMapPath, { clusters: [], warehouseAliases: [] });
  const identities = await discoverIdentities(options);
  if (!identities.length) {
    const empty = makeEmptyPayload('No Yandex Market campaignId was discovered.');
    writeJson(options.outputPath, empty);
    writeGzip(options.gzipPath, empty);
    console.warn('Yandex Market campaignId was not found. Wrote empty order_procurement_ym.json.');
    return;
  }

  const businessIds = identities.map((identity) => identity.businessId).filter(Boolean);
  const warehouseCatalogResult = await fetchWarehouseCatalog(options, businessIds);
  const stockRows = [];
  const warnings = warehouseCatalogResult.warnings.slice();
  const stockTurnoverModes = new Set();

  for (const batch of chunk(identities, 1)) {
    for (const identity of batch) {
      const result = await fetchCampaignStocks(options, identity);
      stockRows.push(...result.rows);
      result.warnings.forEach((warning) => warnings.push(warning));
      stockTurnoverModes.add(result.withTurnover ? 'withTurnover' : 'stocksOnly');
    }
  }

  const payload = buildPayload(options, stockRows, {
    skus,
    skuAliases,
    platformTrends,
    clusterMap,
    warehouseCatalog: warehouseCatalogResult.rows,
    identities,
    warnings,
    stockWithTurnover: Array.from(stockTurnoverModes).join('+') || String(options.withTurnover)
  });

  writeJson(options.outputPath, payload);
  writeGzip(options.gzipPath, payload);
  console.log(JSON.stringify({
    outputPath: options.outputPath,
    rows: payload.rows.length,
    stockRows: payload.diagnostics.stockRows,
    matchedRows: payload.diagnostics.matchedRows,
    unmatchedRows: payload.diagnostics.unmatchedRows,
    unmappedWarehouses: payload.diagnostics.unmappedWarehouses,
    campaigns: identities.length,
    warehouseCatalogRows: warehouseCatalogResult.rows.length
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  buildSkuLookup,
  normalizeKey
};
