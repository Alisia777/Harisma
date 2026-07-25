#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('./portal-unified-daily-intake');

const REAL_ROOT = path.resolve(__dirname, '..');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-unified-intake-'));
  const dataDir = path.join(root, 'data');
  const manifestPath = path.join(root, 'scripts', 'portal-truth-manifest.json');
  const inventoryPath = path.join(dataDir, 'runtime_snapshot_inventory.json');
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<section id="view-dashboard"></section><section id="view-documents"></section>');
  fs.writeFileSync(path.join(root, 'live-index.html'), '<section id="view-dashboard"></section>');
  fs.writeFileSync(path.join(root, 'docs', 'index.html'), '<section id="view-documents"></section>');
  writeJson(manifestPath, {
    schema: 'portal-truth-manifest-v1',
    sources: [
      {
        key: 'dashboard_fact',
        file: 'dashboard.json',
        kind: 'fact-master',
        required: true,
        freshness: 'daily',
        datePaths: ['asOfDate', 'generatedAt'],
        repairStep: 'dashboard-sync'
      },
      {
        key: 'documents',
        file: 'documents.json',
        kind: 'operational-master',
        required: false,
        freshness: 'none',
        datePaths: ['updatedAt'],
        repairStep: 'portal-operational-storage'
      },
      {
        key: 'price_master',
        file: 'prices.json',
        kind: 'fact-master',
        required: true,
        freshness: 'daily-build',
        datePaths: ['asOfDate', 'generatedAt'],
        repairStep: 'price-sync'
      }
    ],
    views: {
      dashboard: { sources: ['dashboard_fact'], critical: true, updateMode: 'daily-batch' },
      documents: { sources: ['documents'], critical: false, updateMode: 'operational' },
      prices: { sources: ['price_master'], critical: true, updateMode: 'daily-batch' }
    }
  });
  writeJson(inventoryPath, {
    schema: 'portal-runtime-snapshot-inventory-v1',
    paths: [
      'data/dashboard.json',
      'data/documents.json',
      'data/prices.json',
      'data/portal_daily_intake.json'
    ]
  });
  writeJson(path.join(dataDir, 'dashboard.json'), {
    generatedAt: '2026-07-24T08:00:00.000Z',
    asOfDate: '2026-07-23',
    rows: [{ id: 1 }]
  });
  writeJson(path.join(dataDir, 'documents.json'), { groups: [] });
  writeJson(path.join(dataDir, 'prices.json'), {
    generatedAt: '2026-07-23T21:55:56.585Z',
    asOfDate: '2026-07-23',
    rows: [{ id: 1 }]
  });
  return { root, dataDir, manifestPath, inventoryPath };
}

function options(base) {
  return {
    ...base,
    outputDir: base.dataDir,
    expectedDate: '2026-07-23',
    runDate: '2026-07-24',
    contractOnly: false,
    noFail: true,
    noWrite: true,
    now: new Date('2026-07-24T12:00:00.000Z')
  };
}

const base = fixture();
try {
  const realContract = run({
    root: REAL_ROOT,
    dataDir: path.join(REAL_ROOT, 'data'),
    baseDataDir: path.join(REAL_ROOT, 'data'),
    outputDir: path.join(REAL_ROOT, 'data'),
    manifestPath: path.join(REAL_ROOT, 'scripts', 'portal-truth-manifest.json'),
    inventoryPath: path.join(REAL_ROOT, 'data', 'runtime_snapshot_inventory.json'),
    expectedDate: '2026-07-23',
    runDate: '2026-07-24',
    contractOnly: true,
    noFail: true,
    noWrite: true,
    now: new Date('2026-07-24T12:00:00.000Z')
  });
  assert.strictEqual(realContract.publish.allowed, true, realContract.publish.blockingReasons.join('\n'));
  assert.strictEqual(realContract.summary.registeredViews, 19);
  assert.strictEqual(realContract.summary.discoveredViews, 19);
  assert.strictEqual(fs.existsSync(path.join(REAL_ROOT, 'scripts', 'portal-layer-manifest.json')), false);
  [
    'portal-layer-audit.js',
    'portal-google-sheet-sync.ps1',
    'portal-google-sheet-retry-failed.ps1',
    'portal-static-data-publish.ps1'
  ].forEach((relativePath) => {
    const source = fs.readFileSync(path.join(REAL_ROOT, 'scripts', relativePath), 'utf8');
    assert.ok(!source.includes('portal-layer-manifest.json'), `${relativePath} still uses the legacy layer manifest`);
    assert.ok(source.includes('portal-truth-manifest.json'), `${relativePath} does not use the unified truth manifest`);
  });
  [
    'portal-google-sheet-sync.ps1',
    'portal-google-sheet-retry-failed.ps1'
  ].forEach((relativePath) => {
    const source = fs.readFileSync(path.join(REAL_ROOT, 'scripts', relativePath), 'utf8');
    assert.ok(source.includes('portal-unified-daily-intake.js'), `${relativePath} skips the unified daily intake`);
  });

  const clean = run(options(base));
  assert.strictEqual(clean.publish.allowed, true, clean.publish.blockingReasons.join('\n'));
  assert.strictEqual(clean.summary.registeredViews, 3);
  assert.strictEqual(clean.summary.discoveredViews, 2);
  assert.strictEqual(clean.views.find((view) => view.key === 'documents').status, 'operational');

  writeJson(path.join(base.dataDir, 'prices.json'), {
    generatedAt: '2026-07-23T20:55:56.585Z',
    asOfDate: '2026-07-23',
    rows: [{ id: 1 }]
  });
  const stalePriceBuild = run(options(base));
  assert.strictEqual(stalePriceBuild.publish.allowed, false);
  assert.ok(stalePriceBuild.publish.blockingReasons.some((reason) => reason.includes('build date 2026-07-23')));

  writeJson(path.join(base.dataDir, 'prices.json'), {
    generatedAt: '2026-07-06T06:17:17.001Z',
    asOfDate: '2026-07-23',
    priceGeneration: {
      id: 'prices-selftest',
      builtAt: '2026-07-24T11:36:16.718Z',
      asOfDate: '2026-07-23',
      artifact: 'prices'
    },
    rows: [{ id: 1 }]
  });
  const currentPriceGeneration = run(options(base));
  assert.strictEqual(
    currentPriceGeneration.publish.allowed,
    true,
    currentPriceGeneration.publish.blockingReasons.join('\n')
  );
  assert.strictEqual(
    currentPriceGeneration.sources.find((source) => source.key === 'price_master').buildDate,
    '2026-07-24'
  );

  writeJson(path.join(base.dataDir, 'prices.json'), {
    generatedAt: '2026-07-23T21:55:56.585Z',
    asOfDate: '2026-07-23',
    rows: [{ id: 1 }]
  });

  writeJson(path.join(base.dataDir, 'dashboard.json'), {
    generatedAt: '2026-07-24T08:00:00.000Z',
    asOfDate: '2026-07-22',
    rows: [{ id: 1 }]
  });
  const stale = run(options(base));
  assert.strictEqual(stale.publish.allowed, false);
  assert.ok(stale.publish.blockingReasons.some((reason) => reason.includes('older than expected')));
  assert.strictEqual(stale.views.find((view) => view.key === 'dashboard').status, 'blocked');

  const manifest = JSON.parse(fs.readFileSync(base.manifestPath, 'utf8'));
  delete manifest.views.dashboard;
  writeJson(base.manifestPath, manifest);
  const missingView = run({ ...options(base), contractOnly: true });
  assert.strictEqual(missingView.publish.allowed, false);
  assert.ok(missingView.publish.blockingReasons.some((reason) => reason.includes('view dashboard is not registered')));

  writeJson(base.manifestPath, {
    ...manifest,
    views: {
      dashboard: { sources: ['dashboard_fact'], critical: true, updateMode: 'daily-batch' },
      documents: { sources: ['documents'], critical: false, updateMode: 'operational' }
    }
  });
  writeJson(base.inventoryPath, { paths: ['data/documents.json', 'data/prices.json', 'data/portal_daily_intake.json'] });
  const missingInventory = run({ ...options(base), contractOnly: true });
  assert.strictEqual(missingInventory.publish.allowed, false);
  assert.ok(missingInventory.publish.blockingReasons.some((reason) => reason.includes('dashboard.json')));

  console.log('portal unified daily intake selftest: ok');
} finally {
  fs.rmSync(base.root, { recursive: true, force: true });
}
