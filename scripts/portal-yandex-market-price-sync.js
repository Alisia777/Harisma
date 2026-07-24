#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'https://api.partner.market.yandex.ru';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const hasNextValue = argv[index + 1] && !String(argv[index + 1]).startsWith('--');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (hasNextValue) {
      args[key] = argv[index + 1];
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}_-]+/gu, '');
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isoDate(value) {
  const match = normalizeText(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function readJson(filePath, fallback) {
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

function resolveOptions(args, env = process.env) {
  const root = process.cwd();
  const asOfDate = isoDate(args['as-of-date'] || args.date || env.ALTEA_PRICE_EXPECTED_DATE) || currentDateKey();
  const campaignIds = normalizeText(args['campaign-id'] || env.ALTEA_YM_CAMPAIGN_ID)
    .split(',')
    .map(normalizeText)
    .filter(Boolean);
  return {
    apiKey: normalizeText(args['api-key'] || env.ALTEA_YM_API_KEY),
    campaignIds,
    apiBaseUrl: normalizeText(args['api-base-url'] || env.ALTEA_YM_API_BASE_URL || API_BASE_URL).replace(/\/+$/, ''),
    asOfDate,
    skusPath: path.resolve(args['skus-file'] || path.join(root, 'data', 'skus.json')),
    skuAliasPath: path.resolve(args['sku-alias-file'] || path.join(root, 'data', 'sku_aliases.json')),
    outputPath: path.resolve(args['output-file'] || path.join(root, '.portal-truth-output', 'price-sync', 'yandex-market-prices.json')),
    pageLimit: Math.max(1, Math.min(500, Math.trunc(Number(args.limit || 500) || 500))),
    minMappedRows: Math.max(1, Math.trunc(Number(args['min-mapped-rows'] || 10) || 10))
  };
}

function skuLookupValues(sku = {}) {
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.offerId,
    sku.offer_id,
    sku.ym?.offerId,
    sku.ym?.offer_id,
    sku.ya?.offerId,
    sku.ya?.offer_id,
    sku.yandex?.offerId,
    sku.yandex?.offer_id
  ];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') values.push(alias);
      else values.push(
        alias?.value,
        alias?.alias,
        alias?.sku,
        alias?.article,
        alias?.articleKey,
        alias?.offerId,
        alias?.vendorCode
      );
    });
  }
  ['ym', 'ya', 'yandex'].forEach((platform) => {
    const aliases = sku.platformAliases?.[platform];
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });
  return values.map(normalizeText).filter(Boolean);
}

function activeAliasRows(payload = {}) {
  const rows = Array.isArray(payload) ? payload : (Array.isArray(payload.aliases) ? payload.aliases : []);
  return rows.filter((row) => {
    const platform = normalizeKey(row?.platform || row?.marketplace || row?.source_platform || '');
    if (platform && !['ym', 'ya', 'yandex', 'yandexmarket', 'market', 'ямаркет'].includes(platform)) return false;
    const status = normalizeKey(row?.status ?? row?.active ?? 'active');
    return !['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove'].includes(status);
  });
}

function buildSkuLookup(skus = [], skuAliases = {}) {
  const lookup = new Map();
  (Array.isArray(skus) ? skus : []).forEach((sku) => {
    skuLookupValues(sku).forEach((value) => {
      const key = normalizeKey(value);
      if (key && !lookup.has(key)) lookup.set(key, sku);
    });
  });
  activeAliasRows(skuAliases).forEach((row) => {
    const targetKey = normalizeKey(
      row?.target_sku || row?.targetSku || row?.target || row?.article_key || row?.articleKey || ''
    );
    const aliasKey = normalizeKey(
      row?.api_sku || row?.apiSku || row?.alias || row?.value || row?.offer_id || row?.offerId || ''
    );
    const target = lookup.get(targetKey);
    if (target && aliasKey && !lookup.has(aliasKey)) lookup.set(aliasKey, target);
  });
  return lookup;
}

function ownerForSku(sku = {}) {
  return normalizeText(
    sku?.owner?.byPlatform?.ym
    || sku?.owner?.byPlatform?.ya
    || sku?.ownersByPlatform?.ym
    || sku?.ownersByPlatform?.ya
    || sku?.owner?.name
    || sku?.owner
  );
}

function offerMatchRank(sku = {}, offerId = '') {
  const offerKey = normalizeKey(offerId);
  const articleKey = normalizeKey(sku.articleKey || sku.article || sku.sku || '');
  if (offerKey && offerKey === articleKey) return 30;
  const directKeys = new Set(skuLookupValues(sku).map(normalizeKey).filter(Boolean));
  return directKeys.has(offerKey) ? 20 : 10;
}

function preferredMappedOffer(candidate, current) {
  if (!current) return true;
  if (candidate.matchRank !== current.matchRank) return candidate.matchRank > current.matchRank;
  const candidateStamp = Date.parse(candidate.offer?.updatedAt || '') || 0;
  const currentStamp = Date.parse(current.offer?.updatedAt || '') || 0;
  if (candidateStamp !== currentStamp) return candidateStamp > currentStamp;
  const candidateKey = `${normalizeKey(candidate.offer?.id)}|${normalizeKey(candidate.offer?.campaignId)}`;
  const currentKey = `${normalizeKey(current.offer?.id)}|${normalizeKey(current.offer?.campaignId)}`;
  return candidateKey.localeCompare(currentKey, 'ru') < 0;
}

async function yandexRequest(options, apiPath, query = {}) {
  const url = new URL(`${options.apiBaseUrl}${apiPath}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    headers: {
      'Api-Key': options.apiKey,
      Accept: 'application/json'
    }
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(`Yandex Market prices API ${apiPath}: HTTP ${response.status} ${text.slice(0, 700)}`);
  }
  return payload;
}

function campaignIdsFromPayload(payload) {
  const campaigns = Array.isArray(payload?.result?.campaigns)
    ? payload.result.campaigns
    : Array.isArray(payload?.campaigns)
      ? payload.campaigns
      : [];
  return [...new Set(
    campaigns
      .map((campaign) => normalizeText(campaign?.id || campaign?.campaignId))
      .filter(Boolean)
  )];
}

async function discoverCampaignIds(options) {
  if (options.campaignIds.length) return options.campaignIds;
  const payload = await yandexRequest(options, '/v2/campaigns');
  const campaignIds = campaignIdsFromPayload(payload);
  if (!campaignIds.length) {
    throw new Error(
      'Yandex Market price refresh could not discover campaigns through /v2/campaigns. '
      + 'Set ALTEA_YM_CAMPAIGN_ID only when automatic discovery is unavailable.'
    );
  }
  return campaignIds;
}

async function fetchCampaignPrices(options, campaignId) {
  const offers = [];
  const seenPageTokens = new Set();
  let pageToken = '';
  do {
    const payload = await yandexRequest(
      options,
      `/v2/campaigns/${encodeURIComponent(campaignId)}/offer-prices`,
      {
        archived: false,
        limit: options.pageLimit,
        pageToken
      }
    );
    const page = Array.isArray(payload?.result?.offers) ? payload.result.offers : [];
    offers.push(...page.map((offer) => ({ ...offer, campaignId: String(campaignId) })));
    const nextPageToken = normalizeText(payload?.result?.paging?.nextPageToken);
    if (!nextPageToken || seenPageTokens.has(nextPageToken)) break;
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  } while (pageToken);
  return offers;
}

function buildPayload(options, offers = [], skus = [], skuAliases = {}) {
  const lookup = buildSkuLookup(skus, skuAliases);
  const byOffer = new Map();
  offers.forEach((offer) => {
    const offerId = normalizeText(offer?.id || offer?.offerId || offer?.shopSku);
    const price = positiveNumber(offer?.price?.value);
    if (!offerId || price === null) return;
    const key = normalizeKey(offerId);
    const current = byOffer.get(key);
    const currentStamp = Date.parse(current?.updatedAt || '') || 0;
    const nextStamp = Date.parse(offer?.updatedAt || '') || 0;
    if (!current || nextStamp >= currentStamp) {
      byOffer.set(key, { ...offer, id: offerId, price: { ...(offer.price || {}), value: price } });
    }
  });

  const unmatchedOfferIds = [];
  let unmatchedOfferCount = 0;
  let mappedOfferCount = 0;
  const mappedByArticle = new Map();
  byOffer.forEach((offer) => {
    const sku = lookup.get(normalizeKey(offer.id));
    if (!sku) {
      unmatchedOfferCount += 1;
      if (unmatchedOfferIds.length < 50) unmatchedOfferIds.push(offer.id);
      return;
    }
    mappedOfferCount += 1;
    const articleKey = normalizeText(sku.articleKey || sku.article || offer.id);
    const articleToken = normalizeKey(articleKey);
    const candidate = {
      articleKey,
      matchRank: offerMatchRank(sku, offer.id),
      offer,
      sku
    };
    if (!mappedByArticle.has(articleToken)) mappedByArticle.set(articleToken, []);
    mappedByArticle.get(articleToken).push(candidate);
  });

  const selectedByArticle = new Map();
  const secondaryMappedOffers = [];
  mappedByArticle.forEach((candidates, articleToken) => {
    const selected = candidates.reduce(
      (current, candidate) => (preferredMappedOffer(candidate, current) ? candidate : current),
      null
    );
    selectedByArticle.set(articleToken, selected);
    candidates
      .filter((candidate) => candidate !== selected)
      .forEach((secondary) => secondaryMappedOffers.push({ selected, secondary }));
  });

  const rows = [];
  selectedByArticle.forEach(({ articleKey, offer, sku }) => {
    const price = positiveNumber(offer?.price?.value);
    const sourceUpdatedAt = normalizeText(offer.updatedAt);
    rows.push({
      id: `ym|${articleKey}`,
      marketplace: 'ym',
      platform: 'ym',
      articleKey,
      article: normalizeText(sku.article || articleKey),
      offerId: offer.id,
      marketSku: offer.marketSku || null,
      name: normalizeText(sku.name || offer.id),
      owner: ownerForSku(sku),
      productStatus: normalizeText(sku.status || sku.registryStatus),
      currentFillPrice: price,
      currentPrice: price,
      currentPriceDate: options.asOfDate,
      valueDate: options.asOfDate,
      historyFreshnessDate: options.asOfDate,
      currentSellerPriceSource: 'yandex-market-prices-api',
      currentPriceSource: 'yandex-market-prices-api',
      sourceUpdatedAt,
      currency: normalizeText(offer?.price?.currencyId || 'RUR'),
      discountBase: positiveNumber(offer?.price?.discountBase),
      campaignId: normalizeText(offer.campaignId),
      daily: [
        {
          date: options.asOfDate,
          price,
          source: 'yandex-market-prices-api'
        }
      ]
    });
  });
  rows.sort((left, right) => left.articleKey.localeCompare(right.articleKey, 'ru'));

  if (rows.length < options.minMappedRows) {
    throw new Error(
      `Yandex Market prices API mapped only ${rows.length} rows; minimum is ${options.minMappedRows}. `
      + `API priced offers: ${byOffer.size}, unmatched: ${unmatchedOfferIds.length}.`
    );
  }

  const generatedAt = new Date().toISOString();
  return {
    schema: 'portal-yandex-market-prices-v1',
    generatedAt,
    asOfDate: options.asOfDate,
    brand: 'Алтея',
    source: 'yandex-market-prices-api',
    sourceFile: '/v2/campaigns/{campaignId}/offer-prices',
    note: 'Current Yandex Market seller prices fetched from the official seller API.',
    priceApiSnapshot: {
      platform: 'ym',
      asOfDate: options.asOfDate,
      generatedAt,
      apiPricedOfferCount: byOffer.size,
      mappedOfferCount,
      mappedRowCount: rows.length,
      duplicateMappedOfferCount: mappedOfferCount - rows.length,
      duplicateMappedOffers: secondaryMappedOffers.slice(0, 50).map(({ selected, secondary }) => ({
        articleKey: selected.articleKey,
        selectedOfferId: normalizeText(selected.offer?.id),
        selectedPrice: positiveNumber(selected.offer?.price?.value),
        selectedMatchRank: selected.matchRank,
        secondaryOfferId: normalizeText(secondary.offer?.id),
        secondaryPrice: positiveNumber(secondary.offer?.price?.value),
        secondaryMatchRank: secondary.matchRank
      })),
      unmatchedOfferCount,
      unmatchedOfferIds,
      campaignIds: [...new Set(offers.map((offer) => normalizeText(offer.campaignId)).filter(Boolean))]
    },
    platforms: {
      ym: {
        label: 'Я.Маркет',
        rows
      }
    }
  };
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (!options.apiKey) throw new Error('ALTEA_YM_API_KEY is required for Yandex Market price refresh.');
  const campaignIds = await discoverCampaignIds(options);

  const offers = [];
  for (const campaignId of campaignIds) {
    offers.push(...await fetchCampaignPrices(options, campaignId));
  }
  const skus = readJson(options.skusPath, []);
  const skuAliases = readJson(options.skuAliasPath, { aliases: [] });
  const payload = buildPayload(options, offers, skus, skuAliases);
  writeJson(options.outputPath, payload);
  console.log(JSON.stringify({
    outputPath: options.outputPath,
    asOfDate: payload.asOfDate,
    summary: payload.priceApiSnapshot
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  activeAliasRows,
  buildPayload,
  buildSkuLookup,
  campaignIdsFromPayload,
  discoverCampaignIds,
  fetchCampaignPrices,
  normalizeKey,
  parseArgs,
  resolveOptions
};
