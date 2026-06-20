#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  finalizeAtomicSnapshots,
  sanitizeString,
  stageAndActivateSnapshot
} = require('./portal-atomic-snapshot-finalize');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function makeFixture(root) {
  const dataDir = path.join(root, 'data');
  const outputDir = path.join(root, 'out');
  fs.mkdirSync(dataDir, { recursive: true });
  writeJson(path.join(dataDir, 'dashboard.json'), {
    generatedAt: '2026-06-20T01:00:00.000Z',
    cards: [
      { id: 'sales', label: 'Sales', value: 10 },
      { id: 'sales', label: 'Duplicate sales', value: 11 }
    ]
  });
  writeJson(path.join(dataDir, 'repricer.json'), {
    generatedAt: '2026-06-20T01:00:00.000Z',
    rows: [{ articleKey: 'sku-1', wb: { currentPrice: 100, recPrice: 80 } }]
  });
  writeJson(path.join(dataDir, 'runtime_snapshot_inventory.json'), {
    schema: 'portal-runtime-snapshot-inventory-v1',
    paths: ['data/dashboard.json', 'data/repricer.json']
  });
  return { dataDir, outputDir, inventoryPath: path.join(dataDir, 'runtime_snapshot_inventory.json') };
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-finalize-selftest-'));
  const options = makeFixture(root);
  const dashboardBefore = fs.readFileSync(path.join(options.dataDir, 'dashboard.json'), 'utf8');
  const repricerBefore = fs.readFileSync(path.join(options.dataDir, 'repricer.json'), 'utf8');

  const first = finalizeAtomicSnapshots({ root, ...options });
  const second = finalizeAtomicSnapshots({ root, ...options });
  assert.strictEqual(second.runId, first.runId, 'same inputs must keep the same runId');
  assert.strictEqual(second.fingerprint, first.fingerprint, 'same inputs must keep the same manifest fingerprint');

  assert.strictEqual(fs.readFileSync(path.join(options.dataDir, 'dashboard.json'), 'utf8'), dashboardBefore);
  assert.strictEqual(fs.readFileSync(path.join(options.dataDir, 'repricer.json'), 'utf8'), repricerBefore);

  const active = readJson(path.join(options.dataDir, 'active_snapshot.json'));
  assert.strictEqual(active.runId, first.runId);
  assert.strictEqual(active.artifacts.length, 2);
  assert.strictEqual(active.artifacts.find((item) => item.path === 'data/dashboard.json').sha256, sha256(path.join(options.dataDir, 'dashboard.json')));
  assert.strictEqual(active.artifacts.find((item) => item.path === 'data/repricer.json').sha256, sha256(path.join(options.dataDir, 'repricer.json')));

  const stagedDashboard = fs.readFileSync(path.join(options.dataDir, 'snapshots', first.runId, 'data', 'dashboard.json'), 'utf8');
  assert.strictEqual(stagedDashboard, dashboardBefore);

  assert.strictEqual(
    sanitizeString('https://docs.google.com/spreadsheets/d/x/edit?gid=1', { root }),
    'https://docs.google.com/spreadsheets/d/x/edit?gid=1'
  );
  assert.ok(!/^[A-Z]:[\\/]/i.test(sanitizeString('C:\\Users\\user\\Downloads\\plan.xlsx', { root })));

  writeJson(path.join(options.dataDir, 'active_snapshot.json'), { runId: 'previous' });
  for (let failAfterWrite = 0; failAfterWrite < 6; failAfterWrite += 1) {
    writeJson(path.join(options.dataDir, 'active_snapshot.json'), { runId: 'previous' });
    try {
      stageAndActivateSnapshot({ root, dataDir: options.dataDir, inventoryPath: options.inventoryPath, failAfterWrite });
    } catch (_error) {
      // Expected injected failure.
    }
    assert.strictEqual(readJson(path.join(options.dataDir, 'active_snapshot.json')).runId, 'previous');
  }

  console.log('OK: portal atomic snapshot finalizer selftest passed');
}

if (require.main === module) main();
