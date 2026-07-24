#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildSharedProductCostMap } = require('./build-canonical-repricer');
const { normalizeKey } = require('./smart-price-contour');

function run() {
  const payload = {
    platforms: {
      wb: {
        rows: [
          { articleKey: 'same_sku', costRub: null },
          { articleKey: 'conflict_sku', costRub: 100 }
        ]
      },
      ozon: {
        rows: [
          { articleKey: 'same_sku', costRub: 150 },
          { articleKey: 'conflict_sku', costRub: 110 }
        ]
      }
    }
  };

  const shared = buildSharedProductCostMap(payload, ['wb', 'ozon']);
  assert.strictEqual(shared.get(normalizeKey('same_sku')).cost, 150);
  assert.strictEqual(shared.get(normalizeKey('same_sku')).sourceStore, 'smart_price_workbench_cross_platform');
  assert.strictEqual(shared.has(normalizeKey('conflict_sku')), false);
  console.log('[repricer-shared-product-cost] OK: exact SKU cost is shared across platforms; conflicting costs remain blocked');
}

run();
