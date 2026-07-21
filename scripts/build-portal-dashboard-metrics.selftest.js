#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPortalDashboardMetrics } = require('./build-portal-dashboard-metrics');

function writeJson(dir, name, value) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-dashboard-metrics-'));
try {
  const point = (date, revenue, units) => ({ date, label: date, revenue, units });
  writeJson(dir, 'platform_trends.json', {
    generatedAt: '2026-07-16T00:00:00.000Z',
    latestMarketplaceDate: '2026-07-15',
    platforms: [
      { key: 'wb', series: [point('2026-07-15', 100, 10)] },
      { key: 'ozon', series: [point('2026-07-15', 50, 5)] },
      { key: 'ya', series: [point('2026-07-15', 25, 2)] },
      { key: 'megamarket', series: [point('2026-07-15', 5, 1)] },
      { key: 'magnit', series: [point('2026-07-15', 7, 1)] },
      { key: 'all', series: [point('2026-07-15', 175, 17)] }
    ]
  });
  writeJson(dir, 'company_plan.json', {
    generatedAt: '2026-07-01T00:00:00.000Z',
    activeMonthKey: '2026-07',
    months: {
      '2026-07': {
        days: 31,
        revenue: 3100,
        channels: {}
      }
    }
  });
  writeJson(dir, 'ads_summary.json', { platforms: [] });

  const { payload, dashboardReconciliation } = buildPortalDashboardMetrics({
    inputDir: dir,
    outputDir: dir,
    policyPath: path.join(__dirname, '..', 'data', 'portal_indicator_policy.json'),
    metricRegistryPath: path.join(__dirname, '..', 'data', 'portal_metric_registry.json'),
    noWrite: true,
    noFail: false
  });

  assert.strictEqual(payload.summary.unallocatedRevenue, 0);
  assert.strictEqual(payload.summary.factRevenue, 187);
  const unallocated = payload.metrics.find((row) => row.metric_id === 'sales.raw_revenue.unallocated');
  assert.strictEqual(unallocated.raw_value, 0);
  assert.strictEqual(unallocated.drilldown[0].core_revenue, 175);
  assert.strictEqual(unallocated.drilldown[0].included_revenue, 187);
  const missingSamokat = payload.metrics.find((row) => row.metric_id === 'sales.raw_revenue' && row.scope.platform === 'samokat');
  assert.strictEqual(missingSamokat.raw_value, null);
  assert.strictEqual(missingSamokat.data_status, 'incomplete');
  assert.ok(dashboardReconciliation.warnings.some((warning) => warning.includes('extra marketplace facts are missing:')));
  console.log('build-portal-dashboard-metrics selftest ok');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
