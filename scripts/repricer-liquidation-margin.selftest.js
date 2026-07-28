#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  chooseProposedPrice,
  liquidationMarginFloor,
  marginAtPrice,
  resolvePolicy
} = require('./build-canonical-repricer');

const economics = {
  complete: true,
  cost: 100,
  commission_pct: 0.3,
  internal_advertising_pct: 0.1,
  tax_pct: 0,
  platform_costs_per_unit: 20,
  internal_advertising_per_unit: 0
};
const economicsPolicy = {
  liquidation: {
    enabled: true,
    defaultMinimumMarginPct: 0,
    allowNegativeMargin: false,
    requireRopForLoss: true
  }
};

assert.strictEqual(liquidationMarginFloor(economics, 0), 200);
assert.strictEqual(liquidationMarginFloor(economics, 0.05), 219);
assert.strictEqual(liquidationMarginFloor(economics, -0.01), null);

const defaultExitPolicy = resolvePolicy(
  { minPrice: 100, maxPrice: 180 },
  {},
  {},
  null,
  economics,
  'exit',
  economicsPolicy
);
assert.strictEqual(defaultExitPolicy.margin_guard_required, false);
assert.strictEqual(defaultExitPolicy.liquidation_guard_required, true);
assert.strictEqual(defaultExitPolicy.liquidation_min_margin_pct, 0);
assert.strictEqual(defaultExitPolicy.liquidation_margin_floor, 200);
assert.strictEqual(defaultExitPolicy.floor, 200);
assert.strictEqual(defaultExitPolicy.cap, 200);
assert.strictEqual(defaultExitPolicy.cap_lifted_by_margin, true);

const defaultExitProposal = chooseProposedPrice(150, defaultExitPolicy);
assert.strictEqual(defaultExitProposal.price, 200);
assert.strictEqual(defaultExitProposal.guard, 'liquidation_margin_floor');
assert(marginAtPrice(defaultExitProposal.price, economics) >= 0);

const approvedExitPolicy = resolvePolicy(
  { minPrice: 100, maxPrice: 400 },
  {},
  {},
  {
    liquidationMinMarginPct: 5
  },
  economics,
  'exit',
  economicsPolicy
);
assert.strictEqual(approvedExitPolicy.liquidation_min_margin_pct, 0.05);
assert.strictEqual(approvedExitPolicy.floor, 219);
assert(marginAtPrice(approvedExitPolicy.floor, economics) >= 0.05);

const activePolicy = resolvePolicy(
  { minPrice: 100, maxPrice: 400, minMarginPct: 25, maxMarginPct: 40 },
  {},
  {},
  null,
  economics,
  'active',
  economicsPolicy
);
assert.strictEqual(activePolicy.margin_guard_required, true);
assert.strictEqual(activePolicy.liquidation_guard_required, false);
assert.strictEqual(activePolicy.target_margin_pct, 0.25);

console.log('[repricer-liquidation-margin-selftest] OK: exit SKU cannot cross its dedicated non-loss margin floor');
