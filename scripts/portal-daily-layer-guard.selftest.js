#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('./portal-daily-layer-guard');
const { buildPortalLayerPassports } = require('./portal-layer-passport');
const { buildMetricPassports } = require('./build-portal-metric-passports');

const manifestPath = path.join(__dirname, 'portal-truth-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const date = '2026-06-19';
const generatedAt = '2026-06-20T08:00:00+03:00';

function write(dir, name, payload) {
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function minimalPayload(source) {
  return { generatedAt, asOfDate: date, rows: [{ id: 1 }] };
}

function buildFixture(dir) {
  for (const source of manifest.sources) {
    if ((manifest.policy.excludedScopes || []).some((scope) => source.key.includes(scope))) continue;
    write(dir, source.file, minimalPayload(source));
  }
  const companyPlan = {
    generatedAt,
    activeMonthKey: '2026-06',
    months: {
      '2026-06': {
        revenue: 600,
        channels: {
          wb: { revenue: 300 },
          ozon: { revenue: 200 },
          ya: { revenue: 100 }
        }
      }
    }
  };
  write(dir, 'company_plan.json', companyPlan);
  write(dir, 'dashboard.json', {
    generatedAt,
    latestMarketplaceDate: date,
    companyPlan,
    cards: [
      { id: 'fact', label: 'Факт', value: 600, format: 'money' },
      { id: 'plan', label: 'План', value: 600, format: 'money' }
    ]
  });
  write(dir, 'platform_trends.json', {
    generatedAt,
    latestMarketplaceDate: date,
    platforms: {
      wb: { series: [{ date, revenue: 300 }] },
      ozon: { series: [{ date, revenue: 200 }] },
      ya: { series: [{ date, revenue: 100 }] },
      all: { series: [{ date, revenue: 600 }] }
    }
  });
  write(dir, 'skus.json', {
    generatedAt,
    skus: [
      {
        articleKey: 'A',
        status: 'active',
        owner: { name: 'Anna', byPlatform: { wb: 'Anna', ozon: 'Anna', ym: 'Anna' } },
        aliases: [{ value: 'A-WB-ALIAS', platform: 'wb', source: 'fixture' }],
        platformAliases: { wb: ['A-WB-ALIAS'] }
      },
      {
        articleKey: 'B',
        status: 'active',
        owner: { name: 'Ksenia', byPlatform: { wb: 'Ksenia', ozon: 'Ksenia', ym: 'Ksenia' } }
      }
    ]
  });
  write(dir, 'ads_summary.json', { generatedAt, asOfDate: date, window: { to: date }, itemSeries: [{ date, spend: 1 }], platforms: { wb: {}, ozon: {} } });
  write(dir, 'warehouse_stock_overlay.json', { generatedAt, sourceAsOf: date, asOfDate: date, rows: [{ articleKey: 'A', stock: 1 }], matchedSkuCount: 1, matchedRowCount: 1, sheetRowCount: 1 });
  write(dir, 'portal_data_quality.json', {
    generatedAt,
    maxDate: date,
    status: 'ok',
    summary: { totalApiRevenue: 600, apiUnmappedRevenue: 0, criticalIssues: 0, maxDate: date },
    freshness: [
      { dataset: 'warehouse_stock_overlay', asOfDate: date, rows: 1, status: 'ok' },
      { dataset: 'sku_matrix', asOfDate: date, rows: 2, status: 'ok' },
      { dataset: 'wb_owner_distribution_audit', asOfDate: date, rows: 1, status: 'ok' }
    ]
  });
  write(dir, 'portal_data_quarantine.json', { generatedAt, rows: [] });
  const orderRows = [
    { platform: 'WB', platformKey: 'wb', article: 'A', articleKey: 'A', inStock: 5, inTransit: 3, inRequest: 2, available: 10, safetyStock: 0, avgDaily: 1, rawNeed30: 20, targetNeed30: 20, targetHorizonDays: 30 },
    { platform: 'Ozon', platformKey: 'ozon', article: 'A', articleKey: 'A', inStock: 2, inTransit: 0, inRequest: 0, available: 2, safetyStock: 0, avgDaily: 1, rawNeed30: 28, targetNeed30: 28, targetHorizonDays: 30 },
    { platform: 'Yandex', platformKey: 'ym', article: 'B', articleKey: 'B', inStock: 1, inTransit: 1, inRequest: 0, available: 2, safetyStock: 0, avgDaily: 1, rawNeed30: 28, targetNeed30: 28, targetHorizonDays: 30 }
  ];
  write(dir, 'order_procurement.json', { generatedAt, window: { to: date }, rows: orderRows });
  write(dir, 'order_procurement_wb.json', { generatedAt, window: { to: date }, rows: orderRows.filter((row) => row.platformKey === 'wb') });
  write(dir, 'order_procurement_ozon.json', { generatedAt, window: { to: date }, rows: orderRows.filter((row) => row.platformKey === 'ozon') });
  write(dir, 'order_procurement_ym.json', { generatedAt, window: { to: date }, rows: orderRows.filter((row) => row.platformKey === 'ym') });
  write(dir, 'oos_control.json', {
    generatedAt,
    rules: { soonDays: 10, watchDays: 30 },
    rows: orderRows.map((row) => ({ ...row, status: 'watch', targetNeed28: row.targetNeed30 - 2, sales30: 30 }))
  });
  write(dir, 'sku_matrix.json', {
    generatedAt,
    sourceAsOf: date,
    schema: 'portal-sku-matrix-v2',
    summary: { skuCount: 2, aliasCount: 1, aliasConflictCount: 0, skuTokenConflictCount: 0, ownerConflictCount: 0 },
    items: [
      { articleKey: 'A', owner: 'wb: Anna; ozon: Anna; ya: Anna', platformOwners: { wb: 'Anna', ozon: 'Anna', ym: 'Anna' }, aliases: [{ platform: 'wb', api_sku: 'A-WB-ALIAS' }], problemStates: ['ok'] },
      { articleKey: 'B', owner: 'wb: Ksenia; ozon: Ksenia; ya: Ksenia', platformOwners: { wb: 'Ksenia', ozon: 'Ksenia', ym: 'Ksenia' }, aliases: [], problemStates: ['ok'] }
    ],
    aliasConflicts: [],
    skuTokenConflicts: []
  });
  write(dir, 'sku_aliases.json', { generatedAt, sourceAsOf: date, aliases: [{ target_sku: 'A', platform: 'wb', api_sku: 'A-WB-ALIAS' }] });
  write(dir, 'wb_owner_distribution_audit.json', { generatedAt, sourceAsOf: date, matched: [{ articleKey: 'A' }] });
  write(dir, 'prices.json', { generatedAt, asOfDate: date, platforms: { wb: { rows: [{ articleKey: 'A', currentPrice: 100 }] } } });
  write(dir, 'repricer.json', { generatedAt, sourceFreshness: { merged: date }, summary: { skuCount: 1 }, rows: [{ articleKey: 'A', cost: 10, wb: { currentPrice: 100, minPrice: 80, requiredPriceForProfitability: 50, recPrice: 110, stockGateBlocksAutoprice: false } }] });
  write(dir, 'smart_price_overlay.json', { generatedAt, asOfDate: date, platforms: { wb: { rows: [{ articleKey: 'A' }] } } });
  write(dir, 'smart_price_workbench.json', { generatedAt, sourceAsOf: date, platforms: { wb: { rows: [{ articleKey: 'A' }] } } });
  write(dir, 'price_workbench_support.json', { generatedAt, sourceAsOf: date, platforms: { wb: { rows: [{ articleKey: 'A' }] } } });
  write(dir, 'min_max_registry.json', { generatedAt, sourceAsOf: date, batchId: 'minmax-fixture', rows: [{ platform: 'wb', articleKey: 'A', effectiveFrom: date, minPrice: 80, maxPrice: 120, status: 'verified' }] });
  write(dir, 'cost_registry.json', { generatedAt, sourceAsOf: date, batchId: 'cost-fixture', rows: [{ legalEntity: 'IP A', articleKey: 'A', effectiveFrom: date, cost: 10, currency: 'RUB', unit: 'piece', status: 'verified' }] });
}

function buildPhase4Reports(dir) {
  buildPortalLayerPassports({
    inputDir: dir,
    outputDir: dir,
    slaPath: path.join(__dirname, 'portal-layer-sla.json'),
    referenceDate: date,
    runDate: date,
    noWrite: false
  });
  buildMetricPassports({
    inputDir: dir,
    passportDir: dir,
    outputDir: dir,
    noWrite: false
  });
}

function options(dir) {
  return {
    inputDir: dir,
    baseDataDir: dir,
    outputDir: dir,
    manifestPath,
    syncIssuesPath: path.join(dir, 'portal_sync_issues.json'),
    expectedDate: date,
    expectedRunDate: '',
    explicitExpectedDate: true,
    noFail: true,
    noWrite: true,
    mirrorLocalFallback: false
  };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-truth-'));
try {
  buildFixture(dir);
  buildPhase4Reports(dir);
  const clean = run(options(dir));
  assert.strictEqual(clean.report.publish.allowed, true, JSON.stringify(clean.report.publish.blockingReasons, null, 2));

  const brokenDashboard = JSON.parse(fs.readFileSync(path.join(dir, 'dashboard.json'), 'utf8'));
  brokenDashboard.cards = Array.from({ length: 200 }, () => ({ label: 'РџР»Р°РЅ', value: 600, format: 'money' }));
  write(dir, 'dashboard.json', brokenDashboard);
  const broken = run(options(dir));
  assert.strictEqual(broken.report.publish.allowed, false);
  assert.ok(broken.report.publish.blockingReasons.some((reason) => reason.includes('duplicate card ratio')));
  assert.ok(broken.report.publish.blockingReasons.some((reason) => reason.includes('mojibake')));

  buildFixture(dir);
  buildPhase4Reports(dir);
  const ownerConflict = JSON.parse(fs.readFileSync(path.join(dir, 'skus.json'), 'utf8'));
  ownerConflict.skus[0].ownersByPlatform = { wb: 'Анна' };
  ownerConflict.skus[0].owner = { name: 'Анна', byPlatform: { wb: 'Ксения' } };
  write(dir, 'skus.json', ownerConflict);
  const ownerBroken = run(options(dir));
  assert.strictEqual(ownerBroken.report.publish.allowed, false);
  assert.ok(ownerBroken.report.publish.blockingReasons.some((reason) => reason.includes('conflicting canonical owners')));

  buildFixture(dir);
  buildPhase4Reports(dir);
  const mixedDates = JSON.parse(fs.readFileSync(path.join(dir, 'platform_trends.json'), 'utf8'));
  mixedDates.platforms.ozon.series[0].date = '2026-06-18';
  mixedDates.platforms.ozon.series[0].label = '2026-06-18';
  write(dir, 'platform_trends.json', mixedDates);
  const dateBroken = run(options(dir));
  assert.strictEqual(dateBroken.report.publish.allowed, false);
  assert.ok(dateBroken.report.publish.blockingReasons.some((reason) => reason.includes('do not share one cutoff date')));

  buildFixture(dir);
  buildPhase4Reports(dir);
  const badOrder = JSON.parse(fs.readFileSync(path.join(dir, 'order_procurement.json'), 'utf8'));
  badOrder.rows[0].available = badOrder.rows[0].inStock;
  badOrder.rows[0].rawNeed30 = 25;
  badOrder.rows[0].targetNeed30 = 25;
  write(dir, 'order_procurement.json', badOrder);
  const orderBroken = run(options(dir));
  assert.strictEqual(orderBroken.report.publish.allowed, false);
  assert.ok(orderBroken.report.publish.blockingReasons.some((reason) => reason.includes('available=inStock+inTransit+inRequest')));

  buildFixture(dir);
  buildPhase4Reports(dir);
  const aliasCollision = JSON.parse(fs.readFileSync(path.join(dir, 'sku_matrix.json'), 'utf8'));
  aliasCollision.summary.aliasConflictCount = 1;
  aliasCollision.aliasConflicts = [{ platform: 'wb', api_sku: 'A-WB-ALIAS', articles: ['A', 'B'] }];
  write(dir, 'sku_matrix.json', aliasCollision);
  const aliasBroken = run(options(dir));
  assert.strictEqual(aliasBroken.report.publish.allowed, false);
  assert.ok(aliasBroken.report.publish.blockingReasons.some((reason) => reason.includes('alias collisions')));

  console.log('[portal-daily-layer-guard.selftest] OK');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
