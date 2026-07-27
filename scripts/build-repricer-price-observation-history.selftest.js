#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildHistory } = require('./build-repricer-price-observation-history');

function snapshot(generatedAt, price, clientPrice = price) {
  return {
    generatedAt,
    platforms: {
      wb: {
        rows: [{
          articleKey: 'sku_1',
          currentFillPrice: price,
          currentClientPrice: clientPrice
        }]
      }
    }
  };
}

const first = buildHistory({
  previous: snapshot('2026-07-27T10:00:00Z', 1000, 950),
  current: snapshot('2026-07-27T10:20:00Z', 1000, 940),
  asOf: '2026-07-27T10:20:00Z'
});
assert.strictEqual(first.summary.rows, 1);
assert.strictEqual(first.summary.observations, 1);
assert.strictEqual(first.rows[0].observations[0].first_seen_at, '2026-07-27T10:00:00.000Z');
assert.strictEqual(first.rows[0].observations[0].last_seen_at, '2026-07-27T10:20:00.000Z');
assert.strictEqual(first.rows[0].observations[0].client_price, 940);

const second = buildHistory({
  history: first,
  previous: snapshot('2026-07-27T10:20:00Z', 1000, 940),
  current: snapshot('2026-07-27T10:40:00Z', 970, 921.5),
  asOf: '2026-07-27T10:40:00Z'
});
assert.strictEqual(second.summary.observations, 2);
assert.strictEqual(second.summary.price_changed_rows, 1);
assert.strictEqual(second.rows[0].observations[1].seller_price, 970);
assert.strictEqual(second.rows[0].observations[1].first_seen_at, '2026-07-27T10:40:00.000Z');

const third = buildHistory({
  history: second,
  current: snapshot('2026-07-27T11:00:00Z', 970, 921.5),
  asOf: '2026-07-27T11:00:00Z'
});
assert.strictEqual(third.summary.observations, 2);
assert.strictEqual(third.rows[0].observations[1].last_seen_at, '2026-07-27T11:00:00.000Z');

console.log('[repricer-price-observation-history-selftest] OK: unchanged observations compacted and real price changes preserved');
