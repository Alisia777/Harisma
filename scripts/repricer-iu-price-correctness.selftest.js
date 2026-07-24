#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  marginAtPrice,
  targetMarginFloor
} = require('./build-canonical-repricer');

const root = path.resolve(__dirname, '..');
const canonical = JSON.parse(fs.readFileSync(path.join(root, 'data', 'canonical_repricer.json'), 'utf8'));
const terms = JSON.parse(fs.readFileSync(path.join(root, 'data', 'repricer_iu_contract_terms.json'), 'utf8'));
const rows = Array.isArray(canonical.rows) ? canonical.rows : [];

assert.strictEqual(terms.platforms.wb.fixedCommissionPct, 32.03);
assert.strictEqual(terms.platforms.wb.marketingFactPct, 8.77);
assert.strictEqual(terms.platforms.ozon.commissionPct, 31.3499);
assert.strictEqual(terms.platforms.ozon.adRevPct, 24.878);
assert(Math.abs(
  terms.platforms.ozon.commissionPct
  + terms.platforms.ozon.adRevPct
  - terms.platforms.ozon.grossVariableRatePct
) < 1e-9);

const checked = {
  economics: 0,
  currentMargins: 0,
  marginFloors: 0,
  infeasibleTargets: 0,
  readyProtected: 0
};

for (const row of rows) {
  const economics = row.economics || {};
  const policy = row.policy || {};
  const recommendation = row.recommendation || {};
  if (!economics.complete) continue;
  checked.economics += 1;

  if (row.platform === 'wb') {
    assert(Math.abs(economics.commission_pct - 0.3203) < 1e-12);
    assert(Math.abs(economics.internal_advertising_pct - 0.0877) < 1e-12);
  }
  if (row.platform === 'ozon') {
    assert(Math.abs(economics.commission_pct - 0.313499) < 1e-12);
    assert(Math.abs(economics.internal_advertising_pct - 0.24878) < 1e-12);
  }

  const currentPrice = row.facts?.seller_price;
  if (currentPrice > 0 && recommendation.current_margin_pct !== null) {
    const expectedMargin = marginAtPrice(currentPrice, economics);
    assert(Math.abs(expectedMargin - recommendation.current_margin_pct) < 1e-9, `${row.platform}/${row.article_key}: current margin mismatch`);
    checked.currentMargins += 1;
  }

  if (policy.margin_guard_required && policy.target_margin_pct > 0 && policy.margin_floor !== null) {
    const expectedFloor = targetMarginFloor(economics, policy.target_margin_pct);
    assert.strictEqual(policy.margin_floor, expectedFloor, `${row.platform}/${row.article_key}: margin floor mismatch`);
    const floorMargin = marginAtPrice(policy.margin_floor, economics);
    assert(floorMargin + 1e-6 >= policy.target_margin_pct, `${row.platform}/${row.article_key}: floor falls below target margin`);
    checked.marginFloors += 1;
  }
  if (policy.margin_guard_required && policy.target_margin_pct > 0 && policy.target_margin_feasible === false) {
    assert.strictEqual(policy.margin_floor, null, `${row.platform}/${row.article_key}: infeasible target produced a floor`);
    assert(row.recommendation.reason_codes.includes('target_margin_not_economically_feasible'));
    assert.strictEqual(row.recommendation.status, 'blocked');
    checked.infeasibleTargets += 1;
  }

  if (policy.margin_guard_required && recommendation.status === 'ready') {
    assert.strictEqual(row.facts?.stock_source_status, 'trusted_direct', `${row.platform}/${row.article_key}: ready protected price does not have direct SKU stock`);
    assert.strictEqual(row.facts?.price_freshness, 'fresh', `${row.platform}/${row.article_key}: ready protected price is not fresh`);
    assert.strictEqual(
      row.facts?.sources?.seller_price?.file,
      'repricer_live_prices.json',
      `${row.platform}/${row.article_key}: ready protected price does not come from the direct API snapshot`
    );
    assert(recommendation.margin_pct + 1e-9 >= policy.target_margin_pct, `${row.platform}/${row.article_key}: ready price violates margin`);
    checked.readyProtected += 1;
  }
}

const sampleKeys = new Set(['wb|maska-batter_250ml', 'ozon|pink_pepper_50ml']);
const samples = rows
  .filter((row) => sampleKeys.has(`${row.platform}|${row.article_key}`))
  .map((row) => ({
    platform: row.platform,
    article: row.article_key,
    currentPrice: row.facts?.seller_price,
    currentMarginPct: row.recommendation?.current_margin_pct,
    targetMarginPct: row.policy?.target_margin_pct,
    calculatedFloor: row.policy?.margin_floor,
    oldMax: row.policy?.min_max_cap,
    blockedReasons: row.recommendation?.reason_codes
  }));

assert.strictEqual(samples.length, sampleKeys.size);
assert(
  checked.economics >= Math.floor(rows.length * 0.95),
  `complete economics coverage is too low: ${checked.economics}/${rows.length}`
);
assert(checked.marginFloors >= 50, `too few protected margin floors were checked: ${checked.marginFloors}`);
assert(checked.infeasibleTargets > 0, 'infeasible historical targets must remain explicitly blocked');
assert.strictEqual(checked.readyProtected, 0, 'fallback OOS snapshot must block every protected active/new recommendation');

console.log(JSON.stringify({
  status: 'ok',
  checked,
  rates: {
    wb: {
      commissionPct: 32.03,
      internalAdvertisingPct: 8.77,
      variableRatePct: 40.8
    },
    ozon: {
      commissionPct: 31.3499,
      internalAdvertisingPct: 24.878,
      variableRatePct: 56.2279
    }
  },
  samples
}, null, 2));
console.log('[repricer-iu-price-correctness] OK: all current margins and protected floors match the IU formula');
