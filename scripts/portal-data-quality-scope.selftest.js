#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  buildApiSkuQuality,
  isOutOfScopeBrandRow
} = require('./build-portal-data-quality-report');

const daily = (revenue, units = 1) => [{
  date: '2026-07-25',
  revenue,
  units
}];

const platformTrends = {
  platforms: [{
    key: 'letu',
    series: [{ date: '2026-07-25', revenue: 180000, units: 18 }]
  }],
  extraMarketplace: {
    platforms: {
      letu: {
        articles: [
          {
            articleKey: 'known_altea_sku',
            name: 'Алтея',
            daily: daily(10000, 2)
          },
          {
            articleKey: 'qeep_external_sku',
            name: 'QEEP внешний бренд',
            daily: daily(50000, 5)
          },
          {
            articleKey: 'external_brand_by_name',
            name: 'HARLY внешний бренд',
            daily: daily(20000, 2)
          },
          {
            articleKey: 'real_unmapped_altea_sku',
            name: 'Алтея без пары',
            daily: daily(100000, 9)
          }
        ]
      }
    }
  }
};

const quality = buildApiSkuQuality(
  platformTrends,
  [{ article: 'known_altea_sku' }],
  '2026-07',
  '2026-07-25',
  {},
  {},
  new Set()
);

assert.strictEqual(isOutOfScopeBrandRow({ articleKey: 'qeep_external_sku' }), true);
assert.strictEqual(isOutOfScopeBrandRow({ articleKey: 'neutral', name: 'HARLY внешний бренд' }), true);
assert.deepStrictEqual(
  quality.issues.map((issue) => issue.articleKey),
  ['real_unmapped_altea_sku'],
  'External brands must not return as false API→SKU remediation warnings'
);
assert.strictEqual(quality.issues[0].severity, 'critical');
assert.strictEqual(quality.platformSummary.letu.directRevenue, 110000);
assert.strictEqual(quality.platformSummary.letu.outOfScopeCount, 2);
assert.strictEqual(quality.platformSummary.letu.outOfScopeRevenue, 70000);
assert.strictEqual(quality.platformSummary.letu.unmappedRevenue, 100000);

console.log('[portal-data-quality-scope.selftest] OK');
