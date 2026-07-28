#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildMarketHistory } = require('./build-repricer-market-observation-history');

const first = buildMarketHistory({
  overlay: {
    generatedAt: '2026-07-26T10:00:00Z',
    platforms: {
      wb: {
        rows: [{
          articleKey: 'sku_1',
          daily: [
            { date: '2026-07-25', ordersUnits: 5, price: 1000, clientPrice: 950 },
            { date: '2026-07-26', ordersUnits: 6, price: 1000, clientPrice: 950 }
          ]
        }]
      }
    }
  },
  asOf: '2026-07-26'
});
assert.strictEqual(first.summary.rows, 1);
assert.strictEqual(first.summary.observations, 2);
assert.strictEqual(first.summary.demand_observations, 2);
assert.strictEqual(first.rows[0].observations[0].seller_price, 1000);
assert.strictEqual(first.rows[0].observations[0].client_price, 950);

const second = buildMarketHistory({
  history: first,
  overlay: {
    generatedAt: '2026-07-27T10:00:00Z',
    platforms: {
      wb: {
        rows: [{
          articleKey: 'sku_1',
          daily: [
            { date: '2026-07-26', ordersUnits: 7, price: 990, clientPrice: 940.5 },
            { date: '2026-07-27', ordersUnits: 8, price: 970, clientPrice: 921.5 }
          ]
        }]
      }
    }
  },
  live: {
    generatedAt: '2026-07-27T10:05:00Z',
    platforms: {
      wb: {
        rows: [{
          articleKey: 'sku_1',
          daily: [{ date: '2026-07-27', price: 970, clientPrice: 921.5 }]
        }]
      }
    }
  },
  canonical: {
    freshness_reference_date: '2026-07-27',
    rows: [{
      platform: 'wb',
      article_key: 'sku_1',
      facts: {
        seller_price: 970,
        client_price: 921.5,
        stock: 31
      },
      economics: {
        internal_advertising_pct: 0.08
      },
      recommendation: {
        current_margin_pct: 0.27
      }
    }]
  },
  asOf: '2026-07-27'
});
assert.strictEqual(second.summary.observations, 3);
assert.strictEqual(second.rows[0].observations[1].units, 7);
assert.strictEqual(second.rows[0].observations[1].seller_price, 990);
assert.strictEqual(second.rows[0].observations[2].units, 8);
assert.strictEqual(second.rows[0].observations[2].seller_price, 970);
assert.strictEqual(second.rows[0].observations[2].drr_pct, 0.08);
assert.strictEqual(second.rows[0].observations[2].margin_pct, 0.27);
assert.strictEqual(second.rows[0].observations[2].margin_rub, 261.9);
assert.strictEqual(second.rows[0].observations[2].stock, 31);
assert.strictEqual(second.summary.economics_observations, 1);

console.log('[repricer-market-observation-history-selftest] OK: daily demand, seller/client prices, margin, DRR and stock accumulate without losing existing observations');
