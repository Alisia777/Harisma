#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveOptions, snapshotKeyFromPath, snapshotsFromInventory } = require('./portal-snapshot-pull');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-snapshot-pull-'));
const inventoryPath = path.join(root, 'inventory.json');
fs.writeFileSync(inventoryPath, JSON.stringify({
  paths: ['data/dashboard.json', 'data/iu_drr_summary.json', 'notes/readme.txt', 'data/dashboard.json']
}));

assert.strictEqual(snapshotKeyFromPath('data/iu_drr_summary.json'), 'iu_drr_summary');
assert.strictEqual(snapshotKeyFromPath('notes/readme.txt'), '');
assert.deepStrictEqual(snapshotsFromInventory(inventoryPath), ['dashboard', 'iu_drr_summary']);
const options = resolveOptions({ inventory: inventoryPath, strict: true, 'output-dir': root });
assert.deepStrictEqual(options.snapshots, ['dashboard', 'iu_drr_summary']);
assert.strictEqual(options.strict, true);
const explicit = resolveOptions({ inventory: inventoryPath, snapshot: 'dashboard', 'output-dir': root });
assert.deepStrictEqual(explicit.snapshots, ['dashboard']);

console.log('portal-snapshot-pull selftest ok');
