#!/usr/bin/env node

const assert = require('assert');

const { buildQuarantine, resolveOptions } = require('./portal-sync-health');

const quarantine = buildQuarantine({
  issues: [
    { type: 'api_sum_above_aggregate', severity: 'critical', platform: 'wb', revenue: 150000, overage: 25000 },
    { type: 'api_sku_unmapped', severity: 'warning', platform: 'ozon', revenue: 125000 },
    { type: 'api_sku_unmapped', severity: 'info', platform: 'ym', revenue: 99999 },
    { type: 'order_no_stock_need', severity: 'critical', platform: 'wb', revenue: 500000 }
  ]
});

assert.strictEqual(quarantine.schema, 'portal-data-quarantine-v1');
assert.match(quarantine.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
assert.strictEqual(quarantine.summary.rows, 2);
assert.strictEqual(quarantine.summary.apiSumAboveAggregateCount, 1);
assert.strictEqual(quarantine.summary.apiUnmappedHighRevenueCount, 1);
assert.strictEqual(quarantine.summary.overage, 25000);

const options = resolveOptions({ 'quarantine-only': true });
assert.strictEqual(options.quarantineOnly, true);

console.log('portal-sync-health quarantine selftest ok');
