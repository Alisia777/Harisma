#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  mergeLivePricePayloads,
  normalizeAdditionalPlatform
} = require('./portal-repricer-live-prices-merge');

const base = {
  schema: 'repricer-live-prices-v1',
  generatedAt: '2026-07-25T12:00:00.000Z',
  asOfDate: '2026-07-25',
  source: 'WB Prices API + Ozon Seller API',
  status: 'ok',
  blockingReasons: [],
  sourceErrors: {},
  summary: {
    sourceRows: 8,
    mappedRows: 7,
    unresolvedRows: 1,
    duplicatePlatformArticleKeys: 0,
    platforms: {
      wb: { sourceRows: 4, mappedRows: 3, unresolvedRows: 1 },
      ozon: { sourceRows: 4, mappedRows: 4, unresolvedRows: 0 }
    }
  },
  platforms: {
    wb: {
      label: 'WB',
      asOfDate: '2026-07-25',
      rows: [{ platform: 'wb', articleKey: 'wb-one', normalizedArticleKey: 'wbone', currentSellerPrice: 700 }]
    },
    ozon: {
      label: 'Ozon',
      asOfDate: '2026-07-25',
      rows: [{ platform: 'ozon', articleKey: 'oz-one', normalizedArticleKey: 'ozone', currentSellerPrice: 800 }]
    }
  },
  unresolved: [{ platform: 'wb', offerId: 'other-brand', reason: 'unmapped' }],
  duplicates: []
};

const yandex = {
  schema: 'portal-yandex-market-prices-v1',
  generatedAt: '2026-07-25T12:01:00.000Z',
  asOfDate: '2026-07-25',
  source: 'yandex-market-prices-api',
  sourceFile: '/v2/campaigns/{campaignId}/offer-prices',
  priceApiSnapshot: {
    apiPricedOfferCount: 3,
    mappedRowCount: 2,
    unmatchedOfferCount: 1,
    unmatchedOfferIds: ['YM-OTHER-BRAND'],
    duplicateMappedOfferCount: 0,
    duplicateMappedOffers: []
  },
  platforms: {
    ym: {
      label: 'Я.Маркет',
      rows: [
        {
          articleKey: 'ym-one',
          offerId: 'YM-ONE',
          currentPrice: 900,
          discountBase: 1200,
          currentPriceDate: '2026-07-25',
          currentPriceSource: 'yandex-market-prices-api'
        },
        {
          articleKey: 'ym-two',
          offerId: 'YM-TWO',
          currentFillPrice: 1000,
          currentClientPrice: 990,
          valueDate: '2026-07-25',
          currentPriceSource: 'yandex-market-prices-api'
        }
      ]
    }
  }
};

const normalized = normalizeAdditionalPlatform(yandex, 'ym', '2026-07-25');
assert.deepStrictEqual(normalized.blockingReasons, []);
assert.strictEqual(normalized.rows.length, 2);
assert.strictEqual(normalized.rows[0].currentSellerPrice, 900);
assert.strictEqual(normalized.rows[0].currentClientPrice, 900);
assert.strictEqual(normalized.rows[0].currentListPrice, 1200);
assert.strictEqual(normalized.rows[0].currentSellerPriceFile, 'repricer_live_prices.json');
assert.strictEqual(normalized.summary.sourceRows, 3);
assert.strictEqual(normalized.summary.mappedRows, 2);
assert.strictEqual(normalized.summary.unresolvedRows, 1);

const merged = mergeLivePricePayloads(base, [{
  sourceFile: 'yandex-market-prices.json',
  payload: yandex
}], {
  expectedDate: '2026-07-25',
  requiredPlatforms: ['ym']
});
assert.strictEqual(merged.status, 'ok');
assert.strictEqual(merged.platforms.ym.rows.length, 2);
assert.strictEqual(merged.summary.sourceRows, 11);
assert.strictEqual(merged.summary.mappedRows, 9);
assert.strictEqual(merged.summary.unresolvedRows, 2);
assert.strictEqual(merged.summary.platforms.ym.mappedRatio, 0.666667);
assert.strictEqual(merged.unresolved.at(-1).offerId, 'YM-OTHER-BRAND');
assert.strictEqual(merged.additionalSources[0].platform, 'ym');
assert.match(merged.source, /yandex-market-prices-api/);
assert.deepStrictEqual(merged.duplicates, []);

const stale = mergeLivePricePayloads(base, [{
  sourceFile: 'stale-yandex.json',
  payload: { ...yandex, asOfDate: '2026-07-24' }
}], {
  expectedDate: '2026-07-25',
  requiredPlatforms: ['ym']
});
assert.strictEqual(stale.status, 'blocked');
assert(stale.blockingReasons.some((reason) => reason.includes('snapshot date 2026-07-24')));
assert(stale.blockingReasons.includes('ym: required additional platform is missing'));

const duplicate = mergeLivePricePayloads(base, [{
  sourceFile: 'duplicate-yandex.json',
  payload: {
    ...yandex,
    platforms: {
      ym: {
        ...yandex.platforms.ym,
        rows: [yandex.platforms.ym.rows[0], { ...yandex.platforms.ym.rows[0] }]
      }
    }
  }
}], {
  expectedDate: '2026-07-25',
  requiredPlatforms: ['ym']
});
assert.strictEqual(duplicate.status, 'blocked');
assert(duplicate.blockingReasons.some((reason) => reason.includes('duplicate article ym-one')));

const overwrite = mergeLivePricePayloads(base, [{
  sourceFile: 'overwrite-wb.json',
  payload: {
    ...yandex,
    platforms: {
      wb: {
        rows: [{
          articleKey: 'wb-one',
          currentPrice: 1,
          currentPriceDate: '2026-07-25'
        }]
      }
    }
  }
}], {
  expectedDate: '2026-07-25',
  requiredPlatforms: ['ym']
});
assert.strictEqual(overwrite.status, 'blocked');
assert(overwrite.blockingReasons.includes('wb: additional snapshot would overwrite an existing platform'));
assert(overwrite.blockingReasons.includes('ym: required additional platform is missing'));

console.log('portal-repricer-live-prices-merge selftest ok');
