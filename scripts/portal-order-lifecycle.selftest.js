#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  normalizeExistingYandexRows
} = require('./build-order-procurement-layer');
const {
  buildOrderQuality
} = require('./build-portal-data-quality-report');

const skuMap = new Map([
  ['active-sku', {
    articleKey: 'active-sku',
    status: 'Актуальный',
    owner: { byPlatform: { ym: 'Анна' } }
  }],
  ['exit-sku', {
    articleKey: 'exit-sku',
    status: 'Вывод',
    owner: { byPlatform: { ym: 'Анна' } }
  }]
]);

const normalized = normalizeExistingYandexRows({
  rows: [
    {
      articleKey: 'active-sku',
      platform: 'YM',
      place: 'FBS',
      inStock: 0,
      avgDaily: 1
    },
    {
      articleKey: 'exit-sku',
      platform: 'YM',
      place: 'FBS',
      inStock: 0,
      avgDaily: 2,
      targetNeed7: 99,
      targetNeed14: 99,
      targetNeed28: 99,
      targetNeed30: 99
    }
  ]
}, skuMap);

const active = normalized.find((row) => row.articleKey === 'active-sku');
const exiting = normalized.find((row) => row.articleKey === 'exit-sku');
assert.strictEqual(active.needSuppressedByLifecycle, false);
assert.strictEqual(active.targetNeed7, 7);
assert.strictEqual(active.targetNeed30, 30);
assert.strictEqual(exiting.needSuppressedByLifecycle, true);
assert.strictEqual(exiting.lifecycleStatus, 'Вывод');
assert.strictEqual(exiting.rawNeed30, 60);
assert.strictEqual(exiting.targetNeed7, 0);
assert.strictEqual(exiting.targetNeed14, 0);
assert.strictEqual(exiting.targetNeed28, 0);
assert.strictEqual(exiting.targetNeed30, 0);

const quality = buildOrderQuality({ rows: normalized });
assert.strictEqual(quality.summary.noStockNeedRows, 1);
assert.strictEqual(quality.summary.lifecycleSuppressedRows, 1);
assert.strictEqual(quality.issues.length, 1);
assert.strictEqual(quality.issues[0].articleKey, 'active-sku');

console.log('portal-order-lifecycle selftest ok');
