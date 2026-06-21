#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPortalLayerPassports } = require('./portal-layer-passport');
const { buildMetricPassports } = require('./build-portal-metric-passports');
const { run: runFreshnessGuard } = require('./portal-freshness-guard');

function write(dir, file, payload) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function fixture(dir, sourceDate) {
  const generatedAt = `${sourceDate}T09:00:00.000Z`;
  write(dir, 'dashboard.json', {
    generatedAt,
    dataFreshness: { asOfDate: sourceDate },
    latestMarketplaceDate: sourceDate,
    cards: [{ id: 'fact', label: 'Fact', value: 100 }],
    brandSummary: [{ company_fact_revenue_to_date: 100, latestMarketplaceDate: sourceDate }]
  });
  write(dir, 'company_plan.json', {
    generatedAt,
    activeMonthKey: '2026-06',
    months: { '2026-06': { revenue: 100, channels: { wb: { revenue: 60 }, ozon: { revenue: 30 }, ya: { revenue: 10 } } } }
  });
  write(dir, 'platform_trends.json', {
    generatedAt,
    latestMarketplaceDate: sourceDate,
    platforms: {
      wb: { series: [{ date: sourceDate, revenue: 60 }] },
      ozon: { series: [{ date: sourceDate, revenue: 30 }] },
      ya: { series: [{ date: sourceDate, revenue: 10 }] },
      all: { series: [{ date: sourceDate, revenue: 100 }] }
    }
  });
  write(dir, 'prices.json', { generatedAt, asOfDate: sourceDate, platforms: { wb: { rows: [{ articleKey: 'A', currentPrice: 100 }] } } });
  write(dir, 'smart_price_overlay.json', { generatedAt, asOfDate: sourceDate, platforms: { wb: { rows: [{ articleKey: 'A' }] } } });
  write(dir, 'smart_price_workbench.json', { generatedAt, sourceAsOf: sourceDate, platforms: { wb: { rows: [{ articleKey: 'A' }] } } });
  write(dir, 'price_workbench_support.json', { generatedAt, sourceAsOf: sourceDate, platforms: { wb: { rows: [{ articleKey: 'A' }] } } });
  write(dir, 'order_procurement.json', { generatedAt, window: { to: sourceDate }, rows: [{ articleKey: 'A', inStock: 1, inTransit: 0, inRequest: 0 }] });
  write(dir, 'order_procurement_wb.json', { generatedAt, window: { to: sourceDate }, rows: [{ articleKey: 'A' }] });
  write(dir, 'order_procurement_ozon.json', { generatedAt, window: { to: sourceDate }, rows: [{ articleKey: 'A' }] });
  write(dir, 'order_procurement_ym.json', { generatedAt, window: { to: sourceDate }, rows: [{ articleKey: 'A' }] });
  write(dir, 'warehouse_stock_overlay.json', { generatedAt, rows: [{ articleKey: 'A', stock: 1 }], matchedRowCount: 1, sheetRowCount: 1 });
  write(dir, 'sku_matrix.json', { generatedAt, sourceAsOf: sourceDate, items: [{ articleKey: 'A' }], summary: { skuCount: 1, aliasCount: 1 } });
  write(dir, 'sku_aliases.json', { schema: 'aliases', sourceAsOf: sourceDate, aliases: [{ target_sku: 'A', api_sku: 'A' }] });
  write(dir, 'wb_owner_distribution_audit.json', { generatedAt, sourceAsOf: sourceDate, matched: [{ articleKey: 'A' }] });
  write(dir, 'portal_data_quality.json', {
    generatedAt,
    status: 'ok',
    summary: { maxDate: sourceDate, criticalCount: 0 },
    freshness: [
      { dataset: 'warehouse_stock_overlay', asOfDate: sourceDate, rows: 1, status: 'ok' },
      { dataset: 'sku_matrix', asOfDate: sourceDate, rows: 1, status: 'ok' },
      { dataset: 'wb_owner_distribution_audit', asOfDate: sourceDate, rows: 1, status: 'ok' }
    ]
  });
  write(dir, 'min_max_registry.json', {
    schema: 'portal-min-max-registry-v1',
    generatedAt,
    sourceAsOf: sourceDate,
    batchId: 'minmax-batch',
    rows: [{ platform: 'wb', articleKey: 'A', effectiveFrom: sourceDate, minPrice: 80, maxPrice: 120, status: 'verified' }]
  });
  write(dir, 'cost_registry.json', {
    schema: 'portal-cost-registry-v1',
    generatedAt,
    sourceAsOf: sourceDate,
    batchId: 'cost-batch',
    rows: [{ legalEntity: 'IP A', articleKey: 'A', effectiveFrom: sourceDate, cost: 30, currency: 'RUB', unit: 'piece', status: 'verified' }]
  });
  write(dir, 'repricer.json', {
    generatedAt,
    sourceFreshness: { merged: sourceDate },
    summary: { skuCount: 1, wbChangeCount: 1 },
    rows: [{
      articleKey: 'A',
      cost: 30,
      wb: {
        currentPrice: 100,
        currentPriceDate: sourceDate,
        minPrice: 80,
        recPrice: 110,
        stockGateBlocksAutoprice: false,
        safeToExport: false
      }
    }]
  });
}

function buildReports(dir, referenceDate) {
  buildPortalLayerPassports({
    inputDir: dir,
    outputDir: dir,
    slaPath: path.join(__dirname, 'portal-layer-sla.json'),
    referenceDate,
    runDate: referenceDate,
    noWrite: false
  });
  buildMetricPassports({ inputDir: dir, passportDir: dir, outputDir: dir, noWrite: false });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-freshness-guard-'));
try {
  const fresh = path.join(root, 'fresh');
  fs.mkdirSync(fresh, { recursive: true });
  fixture(fresh, '2026-06-19');
  buildReports(fresh, '2026-06-19');
  const clean = runFreshnessGuard({ inputDir: fresh, baseDataDir: fresh, outputDir: fresh, expectedDate: '2026-06-19', noWrite: true, noFail: true });
  assert.strictEqual(clean.publish.allowed, true, JSON.stringify(clean.publish.blockingReasons, null, 2));

  const stale = path.join(root, 'stale');
  fs.mkdirSync(stale, { recursive: true });
  fixture(stale, '2026-06-18');
  buildReports(stale, '2026-06-20');
  const staleReport = runFreshnessGuard({ inputDir: stale, baseDataDir: stale, outputDir: stale, expectedDate: '2026-06-20', noWrite: true, noFail: true });
  assert.strictEqual(staleReport.publish.allowed, false);
  assert.ok(staleReport.publish.blockingReasons.some((reason) => reason.includes('passport status stale')));

  const mismatch = path.join(root, 'mismatch');
  fs.mkdirSync(mismatch, { recursive: true });
  fixture(mismatch, '2026-06-19');
  const platform = JSON.parse(fs.readFileSync(path.join(mismatch, 'platform_trends.json'), 'utf8'));
  platform.latestMarketplaceDate = '2026-06-18';
  Object.values(platform.platforms).forEach((bucket) => bucket.series.forEach((point) => { point.date = '2026-06-18'; }));
  write(mismatch, 'platform_trends.json', platform);
  buildReports(mismatch, '2026-06-19');
  const mismatchReport = runFreshnessGuard({ inputDir: mismatch, baseDataDir: mismatch, outputDir: mismatch, expectedDate: '2026-06-19', noWrite: true, noFail: true });
  assert.strictEqual(mismatchReport.publish.allowed, false);
  assert.ok(mismatchReport.publish.blockingReasons.some((reason) => reason.includes('dashboard chart cutoff mismatch')));

  const unsafe = path.join(root, 'unsafe');
  fs.mkdirSync(unsafe, { recursive: true });
  fixture(unsafe, '2026-06-19');
  buildReports(unsafe, '2026-06-19');
  const repricerRecon = JSON.parse(fs.readFileSync(path.join(unsafe, 'portal_repricer_dependency_reconciliation.json'), 'utf8'));
  repricerRecon.status = 'blocked';
  repricerRecon.summary.unsafeExecutableCount = 1;
  write(unsafe, 'portal_repricer_dependency_reconciliation.json', repricerRecon);
  const unsafeReport = runFreshnessGuard({ inputDir: unsafe, baseDataDir: unsafe, outputDir: unsafe, expectedDate: '2026-06-19', noWrite: true, noFail: true });
  assert.strictEqual(unsafeReport.publish.allowed, false);
  assert.ok(unsafeReport.publish.blockingReasons.some((reason) => reason.includes('executable recommendations without verified dependencies')));

  console.log('[portal-freshness-guard.selftest] OK');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
