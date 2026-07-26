#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPortalDashboardMetrics } = require('./build-portal-dashboard-metrics');
const { buildPortalDashboard } = require('./build-portal-dashboard');

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
      { key: 'all', series: [point('2026-07-15', 187, 19)] }
    ]
  });
  writeJson(dir, 'company_plan.json', {
    generatedAt: '2026-07-01T00:00:00.000Z',
    planType: 'marketplace_salary_revenue',
    payrollKpiPolicy: {
      isPayrollCritical: true,
      includedChannels: ['wb', 'ozon', 'ya']
    },
    activeMonthKey: '2026-07',
    months: {
      '2026-07': {
        days: 31,
        revenue: 3100,
        channels: {
          wb: { revenue: 1000, salaryIncluded: true },
          ozon: { revenue: 1000, salaryIncluded: true },
          ya: { revenue: 1100, salaryIncluded: true },
          megamarket: { revenue: 0, salaryIncluded: false },
          magnit: { revenue: 0, salaryIncluded: false }
        }
      }
    }
  });
  writeJson(dir, 'ads_summary.json', { platforms: [] });
  writeJson(dir, 'skus.json', []);
  writeJson(dir, 'warehouse_stock_overlay.json', { summary: { stockWarehouse: 0 }, rows: [] });

  const { payload, dashboardReconciliation, planReconciliation } = buildPortalDashboardMetrics({
    inputDir: dir,
    outputDir: dir,
    policyPath: path.join(__dirname, '..', 'data', 'portal_indicator_policy.json'),
    metricRegistryPath: path.join(__dirname, '..', 'data', 'portal_metric_registry.json'),
    noWrite: false,
    noFail: false
  });

  assert.strictEqual(payload.summary.unallocatedRevenue, 0);
  assert.strictEqual(payload.summary.factRevenue, 175);
  assert.strictEqual(payload.summary.salaryFactRevenue, 175);
  assert.strictEqual(payload.summary.allChannelFactRevenue, 187);
  assert.strictEqual(payload.summary.outsidePlanScopeFactRevenue, 12);
  assert.deepStrictEqual(payload.summary.planScopePlatforms, ['wb', 'ozon', 'ya']);
  assert.deepStrictEqual(planReconciliation.active_plan.included_platforms, ['wb', 'ozon', 'ya']);
  const completion = payload.metrics.find((row) => row.metric_id === 'plan.completion_revenue');
  assert.strictEqual(completion.drilldown[0].factRevenue, 175);
  assert.strictEqual(completion.drilldown[0].allChannelFactRevenue, 187);
  assert.ok(Math.abs(completion.raw_value - (175 / 1500)) < 1e-9);
  const unallocated = payload.metrics.find((row) => row.metric_id === 'sales.raw_revenue.unallocated');
  assert.strictEqual(unallocated.raw_value, 0);
  assert.strictEqual(unallocated.drilldown[0].core_revenue, 175);
  assert.strictEqual(unallocated.drilldown[0].included_revenue, 187);
  const missingSamokat = payload.metrics.find((row) => row.metric_id === 'sales.raw_revenue' && row.scope.platform === 'samokat');
  assert.strictEqual(missingSamokat.raw_value, null);
  assert.strictEqual(missingSamokat.data_status, 'incomplete');
  assert.ok(dashboardReconciliation.warnings.some((warning) => warning.includes('extra marketplace facts are missing:')));

  const dashboard = buildPortalDashboard({ inputDir: dir, outputDir: dir });
  assert.strictEqual(dashboard.summary.factRevenue, 175);
  assert.strictEqual(dashboard.summary.allChannelFactRevenue, 187);
  assert.strictEqual(dashboard.brandSummary[0].company_fact_revenue_to_date, 175);
  assert.strictEqual(dashboard.brandSummary[0].all_channel_fact_revenue_to_date, 187);
  assert.deepStrictEqual(dashboard.companyPlan.payrollKpiPolicy.includedChannels, ['wb', 'ozon', 'ya']);
  assert.strictEqual(dashboard.cards.find((card) => card.id === 'company-fact-revenue').value, 175);
  assert.strictEqual(dashboard.cards.find((card) => card.id === 'all-channel-fact-revenue').value, 187);
  console.log('build-portal-dashboard-metrics selftest ok');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
