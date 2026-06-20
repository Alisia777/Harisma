#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { finalizeAtomicSnapshots } = require('./portal-atomic-snapshot-finalize');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function makeFixture(dir) {
  const dataDir = path.join(dir, 'data');
  const lastGoodDir = path.join(dataDir, 'last_good');
  fs.mkdirSync(lastGoodDir, { recursive: true });

  writeJson(path.join(dataDir, 'dashboard.json'), {
    generatedAt: '2026-06-20T01:00:00.000Z',
    cards: [
      { id: 'sales', label: 'Sales', value: 10 },
      { id: 'sales', label: 'Duplicate sales', value: 11 }
    ]
  });
  writeJson(path.join(dataDir, 'portal_sync_health.json'), { generatedAt: '2026-06-20T01:00:00.000Z', status: 'ok' });
  writeJson(path.join(dataDir, 'sku_aliases.json'), { schema: 'sku-api-aliases-v1', aliases: [] });
  writeJson(path.join(lastGoodDir, 'sku_aliases.json'), {
    schema: 'sku-api-aliases-v1',
    aliases: [{ target_sku: 'a', platform: 'wb', api_sku: 'A-1', status: 'active' }]
  });
  writeJson(path.join(dataDir, 'oos_control.json'), {
    summary: { oosCount: 1, criticalCount: 0, riskCount: 0, watchCount: 0, date: '2026-06-20' },
    byPlatform: [{ key: 'wb', label: 'WB', oos: 1, critical: 0, risk: 0, watch: 0 }],
    rows: [{ platform: 'wb', owner: 'Ann', department: 'Ops', status: 'oos', severity: 'critical' }],
    history: {
      latest: { date: '2026-06-20', oosCount: 1, criticalCount: 0, riskCount: 0, watchCount: 0 },
      days: [{ date: '2026-06-20', oosCount: 1, criticalCount: 0, riskCount: 0, watchCount: 0 }]
    }
  });
  writeJson(path.join(dataDir, 'product_leaderboard.json'), {
    sourceFile: 'C:\\Users\\artiu\\Downloads\\leaderboard.xlsx',
    totals: { sourceRows: 2, brandRows: 1, matchedRows: 1, unmatchedRows: 1 },
    summary: { skuCount: 2 },
    items: [
      { id: 'm1', articleKey: 'matched', inPortal: true, revenue: 100, income: 50, contentCost: 10, clicks: 5, reach: 10, orders: 2, buys: 1, carts: 3 },
      { id: 'u1', articleKey: 'unmatched', inPortal: false, revenue: 20, income: 5 }
    ],
    unmatchedItems: [{ id: 'u1', articleKey: 'unmatched', inPortal: false, revenue: 20, income: 5 }]
  });
  writeJson(path.join(dataDir, 'repricer.json'), {
    summary: {},
    rows: [{
      articleKey: 'a',
      cost: null,
      wb: { currentPrice: 100, recPrice: 80, procurementSnapshotAvailable: false },
      ozon: { currentPrice: 120, recPrice: 130, procurementSnapshotAvailable: true }
    }]
  });
  writeJson(path.join(dataDir, 'platform_trends.json'), { generatedAt: '2026-06-20T01:00:00.000Z', platforms: [] });
  writeJson(path.join(dataDir, 'company_plan.json'), { sourcePath: 'C:\\Users\\artiu\\Downloads\\plan.xlsx' });
  writeJson(path.join(dataDir, 'iu_plan.json'), { sourcePath: 'C:\\Users\\artiu\\Downloads\\iu.xlsx' });

  return { dataDir, lastGoodDir, outputDir: path.join(dir, 'out') };
}

function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-finalize-selftest-'));
  const options = makeFixture(dir);
  const protectedBefore = fs.readFileSync(path.join(options.dataDir, 'iu_plan.json'), 'utf8');

  const first = finalizeAtomicSnapshots(options);
  const second = finalizeAtomicSnapshots(options);
  assert.strictEqual(second.runId, first.runId);

  const dashboard = readJson(path.join(options.dataDir, 'dashboard.json'));
  assert.strictEqual(dashboard.cards.length, 2);
  assert.strictEqual(dashboard.cards[0].metricId, 'sales');
  assert.strictEqual(first.dashboardDuplicateCards, 1);

  const aliases = readJson(path.join(options.dataDir, 'sku_aliases.json'));
  assert.strictEqual(aliases.aliases.length, 1);
  assert.strictEqual(aliases.restoredFromLastGood, true);

  const oos = readJson(path.join(options.dataDir, 'oos_control.json'));
  assert.strictEqual(oos.summary.criticalCount, 1);
  assert.strictEqual(oos.history.latest.criticalCount, 1);

  const leaderboard = readJson(path.join(options.dataDir, 'product_leaderboard.json'));
  assert.strictEqual(leaderboard.items.length, 1);
  assert.strictEqual(leaderboard.unmatchedItems.length, 1);
  assert.strictEqual(leaderboard.totals.brandRows, 2);
  assert.ok(leaderboard.items[0].provenance.revenue);
  assert.strictEqual(leaderboard.sourceFile, 'leaderboard.xlsx');

  const repricer = readJson(path.join(options.dataDir, 'repricer.json'));
  assert.strictEqual(repricer.rows[0].wb.strategy, 'BLOCK_DATA');
  assert.strictEqual(repricer.rows[0].wb.recPrice, 100);
  assert.strictEqual(repricer.rows[0].ozon.strategy, 'BLOCK_DATA');
  assert.strictEqual(repricer.rows[0].ozon.recPrice, 120);

  const companyPlan = readJson(path.join(options.dataDir, 'company_plan.json'));
  assert.strictEqual(companyPlan.sourcePath, 'plan.xlsx');
  assert.strictEqual(fs.readFileSync(path.join(options.dataDir, 'iu_plan.json'), 'utf8'), protectedBefore);

  const runIds = ['dashboard', 'portal_sync_health', 'sku_aliases', 'oos_control', 'product_leaderboard', 'repricer', 'platform_trends']
    .map((name) => readJson(path.join(options.dataDir, `${name}.json`)).runId);
  assert.strictEqual(new Set(runIds).size, 1);
  assert.ok(runIds[0]);
}

run();
console.log('OK: portal atomic snapshot finalizer selftest passed');
