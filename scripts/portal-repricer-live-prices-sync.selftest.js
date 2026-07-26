#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildLivePrices,
  buildSkuIndexes,
  normalizeOzonPrices,
  normalizeWbPrices,
  resolveArticle
} = require('./portal-repricer-live-prices-sync');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

async function main() {
  const indexes = buildSkuIndexes([
    {
      articleKey: 'serum_30ml',
      article: 'SERUM-30',
      nmId: 101,
      platformAliases: { wb: ['WB-SERUM'], ozon: ['OZ-SERUM'] }
    },
    {
      articleKey: 'cream_50ml',
      article: 'CREAM-50',
      platformAliases: { wb: ['102'], ozon: ['OZ-CREAM', '202'] }
    }
  ], {
    aliases: [
      { platform: 'ozon', api_sku: 'OZ-CREAM-ALIAS', target_sku: 'cream_50ml', status: 'active' }
    ]
  }, {}, {
    rows: [
      { platform: 'ozon', article_key: 'new_ozon_launch' }
    ]
  });

  assert.strictEqual(resolveArticle(indexes.wb, [{ type: 'nmID', value: 101 }]).articleKey, 'serum_30ml');
  assert.strictEqual(resolveArticle(indexes.ozon, [{ type: 'offer_id', value: 'oz-cream-alias' }]).articleKey, 'cream_50ml');
  assert.strictEqual(
    resolveArticle(indexes.ozon, [{ type: 'offer_id', value: 'new_ozon_launch' }]).articleKey,
    'new_ozon_launch',
    'canonical repricer must cover exact new-product offer IDs before the registry catches up'
  );
  const conflictingIndexes = buildSkuIndexes([
    { articleKey: 'existing_sku', platformAliases: { ozon: ['new_ozon_launch'] } }
  ], {}, {}, {
    rows: [{ platform: 'ozon', article_key: 'new_ozon_launch' }]
  });
  assert.strictEqual(
    resolveArticle(conflictingIndexes.ozon, [{ type: 'offer_id', value: 'new_ozon_launch' }]).status,
    'ambiguous',
    'canonical fallback must stay blocked when an existing registry alias points elsewhere'
  );

  const wbNormalized = normalizeWbPrices([
    {
      nmID: 101,
      vendorCode: 'WB-SERUM',
      discount: 30,
      clubDiscount: 5,
      currencyIsoCode4217: 'RUB',
      sizes: [{ sizeID: 1, price: 1000, discountedPrice: 700, clubDiscountedPrice: 665 }]
    },
    {
      nmID: 102,
      vendorCode: 'CREAM-50',
      sizes: [
        { sizeID: 2, price: 1000, discountedPrice: 700 },
        { sizeID: 3, price: 1200, discountedPrice: 800 }
      ]
    }
  ], indexes.wb, '2026-07-24');
  assert.strictEqual(wbNormalized.rows.length, 1);
  assert.strictEqual(wbNormalized.rows[0].currentSellerPrice, 700);
  assert.strictEqual(wbNormalized.rows[0].currentClientPrice, 665);
  assert.strictEqual(wbNormalized.rows[0].currentListPrice, 1000);
  assert.strictEqual(wbNormalized.unresolved[0].reason, 'different_size_prices');

  const ozonNormalized = normalizeOzonPrices([
    {
      offer_id: 'OZ-SERUM',
      product_id: 201,
      price: {
        marketing_seller_price: '910.50',
        marketing_price: '880.10',
        old_price: '1200',
        currency_code: 'RUB'
      }
    }
  ], indexes.ozon, '2026-07-24');
  assert.strictEqual(ozonNormalized.rows.length, 1);
  assert.strictEqual(ozonNormalized.rows[0].currentSellerPrice, 910.5);
  assert.strictEqual(ozonNormalized.rows[0].currentClientPrice, 880.1);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repricer-live-price-test-'));
  fs.writeFileSync(path.join(tempDir, 'skus.json'), JSON.stringify([
    { articleKey: 'serum_30ml', article: 'SERUM-30', nmId: 101, platformAliases: { wb: ['SERUM-30-FBS'], ozon: ['OZ-SERUM'] } },
    { articleKey: 'cream_50ml', article: 'CREAM-50', nmId: 102, platformAliases: { ozon: ['OZ-CREAM'] } },
    { articleKey: 'gel_75ml', article: 'GEL-75', nmId: 103, platformAliases: { ozon: ['OZ-GEL'] } }
  ]));
  fs.writeFileSync(path.join(tempDir, 'sku_aliases.json'), JSON.stringify({ aliases: [] }));
  fs.writeFileSync(path.join(tempDir, 'sku_matrix.json'), JSON.stringify({ indexes: {} }));
  fs.writeFileSync(path.join(tempDir, 'canonical_repricer.json'), JSON.stringify({
    rows: [
      { platform: 'wb', article_key: 'serum_30ml', policy: { margin_guard_required: true } },
      { platform: 'wb', article_key: 'cream_50ml', policy: { margin_guard_required: true } },
      { platform: 'wb', article_key: 'gel_75ml', policy: { margin_guard_required: true } },
      { platform: 'ozon', article_key: 'serum_30ml', policy: { margin_guard_required: true } },
      { platform: 'ozon', article_key: 'cream_50ml', policy: { margin_guard_required: true } },
      { platform: 'ozon', article_key: 'gel_75ml', policy: { margin_guard_required: true } },
      { platform: 'ozon', article_key: 'new_ozon_launch', policy: { margin_guard_required: true } }
    ]
  }));

  const calls = [];
  const mockFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).includes('wildberries.test')) {
      const offset = Number(new URL(url).searchParams.get('offset'));
      const batch = offset === 0
        ? [
          { nmID: 101, vendorCode: 'SERUM-30', sizes: [{ price: 1000, discountedPrice: 700 }] },
          { nmID: 102, vendorCode: 'CREAM-50', sizes: [{ price: 1100, discountedPrice: 800 }] },
          { nmID: 999, vendorCode: 'SERUM-30-FBS', sizes: [{ price: 300, discountedPrice: 300 }] }
        ]
        : [{ nmID: 103, vendorCode: 'GEL-75', sizes: [{ price: 1200, discountedPrice: 900 }] }];
      return jsonResponse({ data: { listGoods: batch } });
    }
    const body = JSON.parse(init.body);
    if (!body.cursor) {
      return jsonResponse({
        items: [
          { offer_id: 'OZ-SERUM', product_id: 201, price: { marketing_seller_price: '710', marketing_price: '690' } },
          { offer_id: 'OZ-CREAM', product_id: 202, price: { marketing_seller_price: '810', marketing_price: '790' } },
          { offer_id: 'new_ozon_launch', product_id: 204, price: { marketing_seller_price: '1010', marketing_price: '990' } }
        ],
        cursor: 'next'
      });
    }
    return jsonResponse({
      items: [{ offer_id: 'OZ-GEL', product_id: 203, price: { marketing_seller_price: '910', marketing_price: '890' } }],
      cursor: ''
    });
  };

  const payload = await buildLivePrices({
    inputDir: tempDir,
    outputPath: path.join(tempDir, 'repricer_live_prices.json'),
    asOfDate: '2026-07-24',
    generatedAt: '2026-07-24T12:00:00.000Z',
    strict: true,
    dryRun: true,
    pageSize: 2,
    maxUnmappedRatio: 0,
    wbToken: 'SECRET_WB_TOKEN',
    wbPricesUrl: 'https://wildberries.test/api/v2/list/goods/filter',
    ozonClientId: 'SECRET_CLIENT',
    ozonApiKey: 'SECRET_OZON_KEY',
    ozonApiBaseUrl: 'https://ozon.test'
  }, { fetchImpl: mockFetch });

  assert.strictEqual(payload.status, 'ok');
  assert.strictEqual(payload.summary.sourceRows, 8);
  assert.strictEqual(payload.summary.mappedRows, 7);
  assert.strictEqual(payload.summary.unresolvedRows, 1);
  assert.strictEqual(payload.summary.platforms.wb.duplicateNonPrimaryRows, 1);
  assert.strictEqual(payload.summary.platforms.wb.protectedCoverage, 1);
  assert.strictEqual(payload.platforms.wb.rows.length, 3);
  assert.strictEqual(payload.platforms.wb.rows.find((row) => row.articleKey === 'serum_30ml').currentSellerPrice, 700);
  assert.strictEqual(payload.platforms.ozon.rows.length, 4);
  assert.strictEqual(payload.platforms.ozon.rows.find((row) => row.articleKey === 'new_ozon_launch').currentSellerPrice, 1010);
  assert.strictEqual(calls.filter((call) => call.url.includes('wildberries.test')).length, 2);
  assert.strictEqual(calls.filter((call) => call.url.includes('ozon.test')).length, 2);
  assert(!JSON.stringify(payload).includes('SECRET_'), 'secrets must never be persisted');

  const partialCalls = [];
  const partialFetch = async (url, init = {}) => {
    partialCalls.push({ url, init });
    if (String(url).includes('wildberries.test')) {
      return jsonResponse({ title: 'unauthorized', detail: 'token scope not allowed' }, 401);
    }
    return jsonResponse({
      items: [
        { offer_id: 'OZ-SERUM', product_id: 201, price: { marketing_seller_price: '710', marketing_price: '690' } },
        { offer_id: 'OZ-CREAM', product_id: 202, price: { marketing_seller_price: '810', marketing_price: '790' } },
        { offer_id: 'OZ-GEL', product_id: 203, price: { marketing_seller_price: '910', marketing_price: '890' } }
      ],
      cursor: ''
    });
  };
  const partial = await buildLivePrices({
    inputDir: tempDir,
    outputPath: path.join(tempDir, 'repricer_live_prices.partial.json'),
    asOfDate: '2026-07-24',
    generatedAt: '2026-07-24T12:05:00.000Z',
    strict: false,
    dryRun: true,
    pageSize: 1000,
    maxUnmappedRatio: 0,
    wbToken: 'SECRET_WB_TOKEN',
    wbPricesUrl: 'https://wildberries.test/api/v2/list/goods/filter',
    ozonClientId: 'SECRET_CLIENT',
    ozonApiKey: 'SECRET_OZON_KEY',
    ozonApiBaseUrl: 'https://ozon.test'
  }, { fetchImpl: partialFetch });
  assert.strictEqual(partial.status, 'blocked');
  assert.strictEqual(partial.platforms.wb.rows.length, 0);
  assert.strictEqual(partial.platforms.ozon.rows.length, 3);
  assert.match(partial.sourceErrors.wb, /token scope not allowed/);
  assert(partial.blockingReasons.includes('wb: API request failed'));
  assert(!JSON.stringify(partial).includes('SECRET_'), 'partial snapshots must never persist secrets');

  console.log('[repricer-live-prices] PASS: pagination, mapping, seller-price semantics and safe partial snapshots are correct');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
