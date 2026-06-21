#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const { auditPayloads } = require('./audit-repricer-dashboard-plan');
const { auditSourceWorkbooks } = require('./audit-source-workbooks');
const { marginAtPrice, stableStringify } = require('./build-canonical-repricer');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function countBlocking(reports) {
  return Object.values(reports).reduce((sum, report) => sum + (report.summary?.blockingChecks || 0), 0);
}

function baselinePayloads() {
  const economics = {
    cost: 50,
    commission_pct: 0.1,
    logistics_per_unit: 5,
    tax_pct: 0.05,
    complete: true
  };
  const currentPrice = 100;
  const proposedPrice = 120;
  const row = {
    snapshot_id: 'test:snapshot',
    article_key: 'test_sku',
    normalized_article_key: 'testsku',
    platform: 'wb',
    facts: {
      seller_price: currentPrice,
      client_price: 100,
      spp_pct: null,
      stock: 10,
      inbound: 0,
      stock_status: 'trusted',
      as_of: '2026-06-18',
      sources: { seller_price: { source_id: 'marketplace_current_price' } }
    },
    economics,
    policy: {
      floor: 80,
      cap: 150,
      target_margin_pct: 0.2,
      target_turnover_days: 30,
      version: 'test'
    },
    recommendation: {
      price: proposedPrice,
      margin_pct: marginAtPrice(proposedPrice, economics),
      current_margin_pct: marginAtPrice(currentPrice, economics),
      change_pct: 0.2,
      status: 'ready',
      reason_codes: [],
      source: 'canonical_test'
    },
    approval: null,
    data_status: 'trusted',
    audit: {
      ozon_export_current_price_used: false,
      local_storage_override_used: false
    }
  };
  const completionIndicator = {
    data_status: 'trusted',
    business_status: 'green',
    label: 'green',
    reason_codes: [],
    policy_id: 'completion_default',
    policy_version: 'test'
  };
  const drrMissing = {
    data_status: 'incomplete',
    business_status: 'neutral',
    label: 'No data',
    reason_codes: ['missing_drr'],
    policy_id: 'drr_default',
    policy_version: 'test'
  };
  return {
    canonicalRepricer: {
      schema: 'canonical-repricer-v1',
      generatedAt: '2026-06-18',
      snapshot_id: 'test:snapshot',
      rows: [row]
    },
    dashboardMetrics: {
      schema: 'portal-dashboard-metrics-v1',
      generatedAt: '2026-06-18',
      snapshot_id: 'dashboard:test',
      cutoffDate: '2026-06-18',
      metrics: [
        {
          metric_id: 'sales.raw_revenue',
          unit: 'RUB',
          plan_id: null,
          scope: { platform: 'wb' },
          period_from: '2026-06-01',
          period_to: '2026-06-18',
          raw_value: 100,
          displayed_value: 100,
          transforms: ['sum_daily_marketplace_sales_fact'],
          source_dates: { platform_trends: '2026-06-18' },
          data_status: 'trusted',
          reconciliation_status: 'ok',
          business_status: 'neutral'
        },
        {
          metric_id: 'sales.raw_revenue',
          unit: 'RUB',
          plan_id: null,
          scope: { platform: 'ozon' },
          period_from: '2026-06-01',
          period_to: '2026-06-18',
          raw_value: 50,
          displayed_value: 50,
          transforms: ['sum_daily_marketplace_sales_fact'],
          source_dates: { platform_trends: '2026-06-18' },
          data_status: 'trusted',
          reconciliation_status: 'ok',
          business_status: 'neutral'
        },
        {
          metric_id: 'sales.raw_revenue',
          unit: 'RUB',
          plan_id: null,
          scope: { platform: 'ya' },
          period_from: '2026-06-01',
          period_to: '2026-06-18',
          raw_value: 10,
          displayed_value: 10,
          transforms: ['sum_daily_marketplace_sales_fact'],
          source_dates: { platform_trends: '2026-06-18' },
          data_status: 'trusted',
          reconciliation_status: 'ok',
          business_status: 'neutral'
        },
        {
          metric_id: 'plan.completion_revenue',
          unit: 'ratio',
          plan_id: 'corporate_revenue_monthly',
          scope: { platform: 'all' },
          raw_value: 1,
          displayed_value: 100,
          transforms: ['sales.raw_revenue / plan_to_date'],
          source_dates: { platform_trends: '2026-06-18', company_plan: '2026-06-01' },
          data_status: 'trusted',
          reconciliation_status: 'ok',
          business_status: 'green'
        },
        {
          metric_id: 'plan.forecast_revenue',
          unit: 'RUB',
          plan_id: 'corporate_revenue_monthly',
          scope: { platform: 'all' },
          raw_value: 300,
          displayed_value: 300,
          transforms: ['forecast_only:not_fact'],
          data_status: 'estimated',
          reconciliation_status: 'ok',
          business_status: 'neutral'
        }
      ]
    },
    indicatorAudit: {
      schema: 'portal-indicator-audit-v1',
      generatedAt: '2026-06-18',
      snapshot_id: 'indicator:test',
      rows: [
        { metric_id: 'plan.completion_revenue', surface: 'dashboard', expected: completionIndicator, actual: completionIndicator, status: 'ok' },
        { metric_id: 'ads.drr', surface: 'dashboard:wb', expected: drrMissing, actual: drrMissing, status: 'ok' }
      ]
    }
  };
}

function runBrokenWorkbookTest(tmpDir) {
  const workbookPath = path.join(tmpDir, 'bad.xlsx');
  const workbook = XLSX.utils.book_new();
  const sheet = {
    A1: { t: 'n', f: 'B1+#REF!', v: 0 },
    B1: { t: 'e', v: 23, w: '#REF!' },
    '!ref': 'A1:B1'
  };
  XLSX.utils.book_append_sheet(workbook, sheet, 'Repricer');
  XLSX.writeFile(workbook, workbookPath);
  const manifestPath = path.join(tmpDir, 'manifest.json');
  writeJson(manifestPath, {
    schema: 'portal-source-registry-v1',
    version: 'selftest',
    sources: [
      {
        source_id: 'bad_repricer_workbook',
        kind: 'workbook',
        file: 'bad.xlsx',
        authoritative: true,
        used_for: ['price', 'economics', 'policy'],
        authoritative_for: ['repricer.current_seller_price']
      }
    ]
  });
  const report = auditSourceWorkbooks({
    manifest: manifestPath,
    baseDir: tmpDir,
    outputDir: tmpDir,
    noWrite: true,
    noFail: true
  });
  return report.summary.blockingChecks > 0;
}

function runPayloadSabotage(name, mutate) {
  const payloads = baselinePayloads();
  mutate(payloads);
  const reports = auditPayloads(payloads, path.join(process.cwd(), 'data'));
  const blocked = countBlocking(reports) > 0;
  return { name, blocked, reports };
}

function runZeroPublishableFeatureTest() {
  const payloads = baselinePayloads();
  payloads.canonicalRepricer.rows.forEach((row) => {
    row.recommendation.price = null;
    row.recommendation.margin_pct = null;
    row.recommendation.status = 'blocked';
    row.recommendation.reason_codes = ['economics_incomplete'];
    row.data_status = 'blocked';
  });
  const reports = auditPayloads(payloads, path.join(process.cwd(), 'data'));
  const blocked = reports.repricing?.feature_status === 'blocked' && reports.repricing?.status !== 'ok';
  return { name: 'zero publishable repricer feature', blocked, reports };
}

function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-phase3-selftest-'));
  const cases = [
    { name: 'broken #REF workbook formula', run: () => runBrokenWorkbookTest(tmpDir) },
    { name: 'zero publishable repricer feature', run: runZeroPublishableFeatureTest },
    { name: 'missing cost', mutate: (p) => { p.canonicalRepricer.rows[0].economics.cost = null; p.canonicalRepricer.rows[0].economics.complete = false; } },
    { name: 'missing commission', mutate: (p) => { p.canonicalRepricer.rows[0].economics.commission_pct = null; p.canonicalRepricer.rows[0].economics.complete = false; } },
    { name: 'price below floor', mutate: (p) => { p.canonicalRepricer.rows[0].recommendation.price = 70; } },
    { name: 'cap below floor', mutate: (p) => { p.canonicalRepricer.rows[0].policy.cap = 70; } },
    { name: 'stale current price', mutate: (p) => { p.canonicalRepricer.rows[0].facts.as_of = '2026-05-01'; } },
    { name: 'duplicate normalized SKU', mutate: (p) => { const dup = clone(p.canonicalRepricer.rows[0]); dup.facts.seller_price = 101; p.canonicalRepricer.rows.push(dup); } },
    { name: 'stock absent vs trusted zero', mutate: (p) => { p.canonicalRepricer.rows[0].facts.stock = null; p.canonicalRepricer.rows[0].facts.stock_status = 'trusted_zero_oos'; } },
    { name: 'copied current margin after price change', mutate: (p) => { const row = p.canonicalRepricer.rows[0]; row.recommendation.price = 130; row.recommendation.margin_pct = row.recommendation.current_margin_pct; } },
    { name: 'localStorage force price', mutate: (p) => { p.canonicalRepricer.rows[0].audit.local_storage_override_used = true; } },
    { name: 'mixed platform dates', mutate: (p) => { p.dashboardMetrics.metrics[1].source_dates.platform_trends = '2026-06-17'; p.dashboardMetrics.metrics[1].reconciliation_status = 'blocked'; } },
    { name: 'missing DRR rendered green', mutate: (p) => { p.indicatorAudit.rows[1].actual = { ...p.indicatorAudit.rows[1].actual, business_status: 'green' }; } },
    { name: 'missing fact rendered as 0%', mutate: (p) => { const row = p.dashboardMetrics.metrics[3]; row.raw_value = null; row.displayed_value = 0; row.data_status = 'trusted'; } },
    { name: 'monthly actual prorated to partial range', mutate: (p) => { p.dashboardMetrics.metrics[0].transforms.push('prorate_monthly_actual'); } },
    { name: 'raw fact scaling to control total', mutate: (p) => { p.dashboardMetrics.metrics[0].transforms.push('scale_to_control_total'); } },
    { name: 'corporate/IU plan substitution', mutate: (p) => { p.dashboardMetrics.metrics[3].plan_id = 'iu'; } },
    { name: 'plan/fact unit mismatch', mutate: (p) => { p.dashboardMetrics.metrics[3].unit = 'units'; } },
    { name: 'indicator disagreement between tabs', mutate: (p) => { p.indicatorAudit.rows[0].actual = { ...p.indicatorAudit.rows[0].actual, business_status: 'red' }; } }
  ];
  const failures = [];
  const results = cases.map((testCase) => {
    const blocked = testCase.run ? testCase.run() : runPayloadSabotage(testCase.name, testCase.mutate).blocked;
    if (!blocked) failures.push(testCase.name);
    return { name: testCase.name, blocked };
  });
  if (failures.length) {
    console.error(`[phase3-selftest] failed sabotage cases: ${failures.join(', ')}`);
    console.error(JSON.stringify(results, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(`[phase3-selftest] OK: ${results.length} sabotage cases blocked`);
}

if (require.main === module) main();

module.exports = {
  baselinePayloads,
  runPayloadSabotage
};
