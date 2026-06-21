#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { stageAndActivateSnapshot } = require('./portal-atomic-snapshot-finalize');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-snapshot-'));
const activePath = path.join(root, 'data', 'active_snapshot.json');
fs.mkdirSync(path.dirname(activePath), { recursive: true });
fs.writeFileSync(activePath, `${JSON.stringify({ runId: 'previous' })}\n`);

for (let failAfterWrite = 0; failAfterWrite < 12; failAfterWrite += 1) {
  fs.writeFileSync(activePath, `${JSON.stringify({ runId: 'previous' })}\n`);
  try {
    stageAndActivateSnapshot({ root, runId: `candidate-${failAfterWrite}`, failAfterWrite });
  } catch (_error) {
    // Expected injected failure.
  }
  const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
  assert.strictEqual(active.runId, 'previous', `active pointer changed after injected failure ${failAfterWrite}`);
}

console.log('OK: atomic publish failure injection');
