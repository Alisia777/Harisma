#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  economicsFixedCostsPerUnit,
  marginAtPrice,
  resolveEconomics,
  targetMarginFloor
} = require('./build-canonical-repricer');

const repoRoot = path.resolve(__dirname, '..');
const economicsPolicy = JSON.parse(fs.readFileSync(
  path.join(repoRoot, 'data', 'repricer_economics_policy.json'),
  'utf8'
));

const wbResolved = resolveEconomics({}, {}, null, economicsPolicy, 'wb');
assert.strictEqual(wbResolved.platform_costs_per_unit, 90, 'WB platform costs must exclude internal advertising');
assert.strictEqual(wbResolved.internal_advertising_per_unit, 0, 'WB percentage advertising must not be duplicated as rubles per unit');
assert.strictEqual(wbResolved.internal_advertising_pct, 0.0877, 'WB actual IU marketing rate must be explicit');
assert(Math.abs(wbResolved.commission_pct - 0.3203) < 1e-12, 'WB IU fixed rate must replace the generic category fallback');
assert.strictEqual(wbResolved.fixed_costs_per_unit, 90, 'WB fixed costs must exclude percentage advertising');
assert.strictEqual(wbResolved.commission_model, 'iu_fixed_rate');

const wbEconomics = { ...wbResolved, cost: 100, complete: true };
assert.strictEqual(economicsFixedCostsPerUnit(wbEconomics), 90);
assert(Math.abs(marginAtPrice(1000, wbEconomics) - 0.402) < 1e-12);
assert.strictEqual(targetMarginFloor(wbEconomics, 0.40), 990);

const ozonResolved = resolveEconomics({}, {}, null, economicsPolicy, 'ozon');
assert.strictEqual(ozonResolved.platform_costs_per_unit, 83, 'Ozon platform costs must exclude internal advertising');
assert.strictEqual(ozonResolved.internal_advertising_per_unit, 0, 'Ozon AdRev must not be duplicated as rubles per unit');
assert.strictEqual(ozonResolved.internal_advertising_pct, 0.24878, 'Ozon IU AdRev KPI must be explicit');
assert(Math.abs(ozonResolved.commission_pct - 0.313499) < 1e-12, 'Ozon IU commission must replace the transaction-only fallback');
assert.strictEqual(ozonResolved.fixed_costs_per_unit, 83, 'Ozon fixed costs must exclude percentage advertising');
assert(Math.abs((ozonResolved.commission_pct + ozonResolved.internal_advertising_pct) - 0.562279) < 1e-12);

const wbAdvertisingOverride = resolveEconomics({ adRub: 50 }, {}, null, economicsPolicy, 'wb');
assert.strictEqual(wbAdvertisingOverride.platform_costs_per_unit, 90, 'Ad override must not change other platform costs');
assert.strictEqual(wbAdvertisingOverride.internal_advertising_per_unit, 50);
assert.strictEqual(wbAdvertisingOverride.internal_advertising_pct, 0.0877);
assert.strictEqual(wbAdvertisingOverride.fixed_costs_per_unit, 140, 'Rubles per unit and the verified percentage are distinct advertising costs');

const legacyEconomics = {
  cost: 100,
  commission_pct: 0.19,
  internal_advertising_pct: 0,
  logistics_per_unit: 125,
  tax_pct: 0,
  complete: true
};
assert.strictEqual(economicsFixedCostsPerUnit(legacyEconomics), 125, 'Legacy total must remain compatible');
assert(Math.abs(marginAtPrice(1000, legacyEconomics) - 0.585) < 1e-12, 'Legacy total must not double-count advertising');
assert.strictEqual(targetMarginFloor(legacyEconomics, 0.40), 549);

console.log('[repricer-margin-cost-components] OK: cost + platform costs + internal advertising are counted exactly once');
