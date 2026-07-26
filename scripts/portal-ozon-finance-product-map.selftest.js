#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  addProductInfoItems,
  buildDayBuckets,
  fetchProductInfoMap,
  productInfoLookupKeys,
  skuMaps
} = require('./portal-ozon-finance-trends-sync');

const sellerSku = '4795799242';
const productInfo = {
  id: 4795799242,
  offer_id: 'canonical_offer',
  name: 'Canonical Ozon product',
  sources: []
};

assert(productInfoLookupKeys(productInfo).includes(sellerSku), 'Ozon product id must be usable as an analytics lookup key');

const productInfoBySku = new Map();
addProductInfoItems(productInfoBySku, [productInfo]);
assert.strictEqual(productInfoBySku.get(sellerSku), productInfo);

const skus = [{
  articleKey: 'canonical_offer',
  article: 'canonical_offer',
  name: 'Canonical product',
  platformAliases: { ozon: ['legacy_ozon_offer'] },
  aliases: [{ platform: 'ozon', value: 'another_legacy_offer' }],
  ozon: { marginPct: 0.2 }
}];
const maps = skuMaps(skus);
assert.strictEqual(maps.byOfferId.get('legacyozonoffer'), skus[0]);
assert.strictEqual(maps.byOfferId.get('anotherlegacyoffer'), skus[0]);

const bucket = buildDayBuckets([{
  dimensions: [{ id: sellerSku }, { id: '2026-07-08' }],
  metrics: [597, 1, 0]
}], skus, '2026-07-08', true, productInfoBySku);

assert.strictEqual(bucket.all.sourceRows, 1);
assert.strictEqual(bucket.all.matchedRows, 1);
assert.strictEqual(bucket.all.revenue, 597);
assert.strictEqual(bucket.allArticles.has('canonical_offer'), true);
assert.strictEqual(bucket.allArticles.get('canonical_offer').dailyByDate.get('2026-07-08').price, 597);

const originalFetch = global.fetch;
const requestBodies = [];
global.fetch = async (_url, request = {}) => {
  const body = JSON.parse(request.body || '{}');
  requestBodies.push(body);
  const items = body.product_id ? [productInfo] : [];
  return {
    ok: true,
    text: async () => JSON.stringify({ items })
  };
};

fetchProductInfoMap({ apiBaseUrl: 'https://api-seller.ozon.test', clientId: 'test', apiKey: 'test' }, new Set([sellerSku]))
  .then((result) => {
    assert.deepStrictEqual(requestBodies, [
      { sku: [sellerSku] },
      { product_id: [Number(sellerSku)] }
    ]);
    assert.strictEqual(result.resolvedRequested, 1);
    assert.deepStrictEqual(result.unresolved, []);
    assert.strictEqual(result.map.get(sellerSku).offer_id, 'canonical_offer');
    console.log('[portal-ozon-finance-product-map.selftest] OK');
  })
  .catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
