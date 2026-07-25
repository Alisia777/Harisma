#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildTeamPolicy } = require('./build-repricer-team-policy');

const baseEconomics = {
  cost: 100,
  commission_pct: 0.30,
  internal_advertising_pct: 0.10,
  internal_advertising_observed_pct: 0.08,
  platform_costs_per_unit: 50,
  fixed_costs_per_unit: 50,
  tax_pct: 0,
  complete: true
};

function row(article, patch = {}) {
  return {
    article_key: article,
    platform: 'wb',
    facts: {
      lifecycle_key: 'active',
      product_status: 'Актуальный',
      seller_price: 700,
      price_freshness: 'fresh',
      stock_status: 'trusted',
      stock: 10,
      inbound: 0,
      sources: { stock: { as_of: '2026-07-24', source_mode: 'wb_stock_api' } },
      ...(patch.facts || {})
    },
    economics: { ...baseEconomics, ...(patch.economics || {}) },
    policy: {
      margin_guard_required: true,
      target_margin_pct: 0.20,
      min_max_floor: 500,
      min_max_cap: 650,
      ...(patch.policy || {})
    },
    recommendation: {
      current_margin_pct: 0.20,
      status: 'ready',
      reason_codes: [],
      ...(patch.recommendation || {})
    }
  };
}

const payload = buildTeamPolicy({
  snapshot_id: 'test',
  freshness_reference_date: '2026-07-24',
  rows: [
    row('low-margin'),
    row('missing-margin', { policy: { target_margin_pct: null } }),
    row('impossible-margin', { platform: 'ozon', policy: { target_margin_pct: 0.50 } }),
    row('extreme', { facts: { seller_price: 100 } }),
    row('exit', { policy: { margin_guard_required: false }, facts: { lifecycle_key: 'exit' } })
  ].map((item, index) => index === 2 ? { ...item, platform: 'ozon' } : item)
}, {
  version: 'test',
  teamPreparation: {
    baselineMarginPct: 0.25,
    minimumMarginPct: 0.25,
    maximumMarginPct: { wb: 0.40, ozon: 0.35 },
    maxCorridorMultiplier: 1.10,
    sharpChangePct: 0.10
  }
});

assert.strictEqual(payload.rows.length, 4);
assert.strictEqual(payload.rows.find((item) => item.articleKey === 'low-margin').marginPct, 0.25);
assert.strictEqual(payload.rows.find((item) => item.articleKey === 'missing-margin').marginPct, 0.25);
assert.strictEqual(payload.rows.find((item) => item.articleKey === 'impossible-margin').marginPct, 0.35);
assert(payload.rows.every((item) => item.approvalStatus === 'PENDING_ROP'));
assert(payload.rows.every((item) => item.autoApplyEligible === false));
assert(payload.summary.marginAdjustedRows >= 3);
assert(payload.summary.missingMarginFilledRows === 1);
assert.strictEqual(payload.summary.extremePriceRows, 1);
assert(payload.rows.find((item) => item.articleKey === 'extreme').action.includes('REWORK_MARGIN_POLICY'));
assert(!payload.rows.find((item) => item.articleKey === 'extreme').action.includes('ROP_PRICE_APPROVAL'));
assert(payload.rows.every((item) => item.recommendedMax >= item.recommendedMin));

console.log('[build-repricer-team-policy] PASS: margins and corridors are prepared per SKU without bypassing ROP');
