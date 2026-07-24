#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  buildPayload,
  buildSkuLookup,
  campaignIdsFromPayload,
  normalizeKey: normalizePriceKey,
  parseArgs,
  resolveOptions
} = require('./portal-yandex-market-price-sync');
const {
  normalizeKey: normalizeTrendsKey,
  skuMaps: buildTrendsSkuMaps
} = require('./portal-yandex-market-trends-sync');
const {
  buildSkuLookup: buildStockSkuLookup,
  normalizeKey: normalizeStockKey
} = require('./portal-yandex-market-stock-sync');

const skus = [
  {
    articleKey: 'sku-one',
    article: 'sku-one',
    name: 'SKU One',
    status: 'Актуальный',
    owner: { byPlatform: { ym: 'Анна' } },
    platformAliases: { ym: ['YM-OFFER-1'] }
  },
  {
    articleKey: 'sku-two',
    article: 'sku-two',
    name: 'SKU Two',
    status: 'Новинка'
  }
];
const aliases = {
  aliases: [
    {
      target_sku: 'sku-two',
      platform: 'ya',
      api_sku: 'YM-OFFER-2',
      status: 'active'
    }
  ]
};

const lookup = buildSkuLookup(skus, aliases);
assert.strictEqual(lookup.get('ym-offer-1').articleKey, 'sku-one');
assert.strictEqual(lookup.get('ym-offer-2').articleKey, 'sku-two');

const repositorySkus = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'skus.json'), 'utf8'));
const repositoryAliases = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sku_aliases.json'), 'utf8'));
const productionFbsMappings = {
  fbs_arterol: 'arterol',
  fbs_okospas: 'okospas',
  fbs_trezax: 'trezax',
  fbs_yagodniy_spas: 'yagodniy_spas'
};
const priceLookup = buildSkuLookup(repositorySkus, repositoryAliases);
const trendsLookup = buildTrendsSkuMaps(repositorySkus, repositoryAliases, 'ym').byArticle;
const stockLookup = buildStockSkuLookup(repositorySkus, repositoryAliases);
for (const [offerId, articleKey] of Object.entries(productionFbsMappings)) {
  assert.strictEqual(priceLookup.get(normalizePriceKey(offerId))?.articleKey, articleKey, `price alias mismatch for ${offerId}`);
  assert.strictEqual(trendsLookup.get(normalizeTrendsKey(offerId))?.articleKey, articleKey, `trends alias mismatch for ${offerId}`);
  assert.strictEqual(stockLookup.get(normalizeStockKey(offerId))?.articleKey, articleKey, `stock alias mismatch for ${offerId}`);
}

const args = parseArgs([
  'node',
  'portal-yandex-market-price-sync.js',
  '--campaign-id',
  '123',
  '--as-of-date=2026-07-23',
  '--min-mapped-rows',
  '2'
]);
const options = resolveOptions(args, { ALTEA_YM_API_KEY: 'test-key' });
assert.deepStrictEqual(options.campaignIds, ['123']);
assert.strictEqual(options.asOfDate, '2026-07-23');
assert.strictEqual(options.minMappedRows, 2);

assert.deepStrictEqual(campaignIdsFromPayload({
  result: {
    campaigns: [
      { id: 101 },
      { campaignId: '202' },
      { id: 101 }
    ]
  }
}), ['101', '202']);
assert.deepStrictEqual(campaignIdsFromPayload({
  campaigns: [{ id: '303' }]
}), ['303']);

const payload = buildPayload(options, [
  {
    id: 'YM-OFFER-1',
    marketSku: 1001,
    price: { value: 799, currencyId: 'RUR', discountBase: 999 },
    updatedAt: '2026-07-20T10:00:00Z',
    campaignId: '123'
  },
  {
    id: 'YM-OFFER-2',
    marketSku: 1002,
    price: { value: 550, currencyId: 'RUR' },
    updatedAt: '2026-06-01T10:00:00Z',
    campaignId: '123'
  },
  {
    id: 'UNMAPPED',
    price: { value: 100 },
    updatedAt: '2026-07-23T10:00:00Z',
    campaignId: '123'
  }
], skus, aliases);

assert.strictEqual(payload.asOfDate, '2026-07-23');
assert.strictEqual(payload.platforms.ym.rows.length, 2);
assert.strictEqual(payload.platforms.ym.rows[0].currentPriceDate, '2026-07-23');
assert.strictEqual(payload.platforms.ym.rows[0].sourceUpdatedAt, '2026-07-20T10:00:00Z');
assert.strictEqual(payload.platforms.ym.rows[0].daily[0].date, '2026-07-23');
assert.strictEqual(payload.priceApiSnapshot.apiPricedOfferCount, 3);
assert.strictEqual(payload.priceApiSnapshot.mappedRowCount, 2);
assert.strictEqual(payload.priceApiSnapshot.unmatchedOfferCount, 1);

assert.throws(
  () => buildPayload({ ...options, minMappedRows: 3 }, [
    { id: 'YM-OFFER-1', price: { value: 799 }, campaignId: '123' }
  ], skus, aliases),
  /mapped only 1 rows/
);

console.log('portal-yandex-market-price-sync selftest ok');
