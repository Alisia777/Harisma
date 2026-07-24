#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildHealth, resolveOptions } = require('./portal-sync-health');

const ROOT = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-price-health-'));

try {
  const options = resolveOptions({
    'input-dir': tempDir,
    'base-data-dir': path.join(ROOT, 'data'),
    'output-dir': tempDir,
    'expected-date': '2026-07-22',
    now: '2026-07-24T12:00:00.000Z'
  });
  const positive = buildHealth(options).health;
  assert.ok(
    !positive.publish.blockingReasons.some((message) => message.includes('Price update audit')),
    positive.publish.blockingReasons.join('\n')
  );

  const audit = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'price_update_audit.json'), 'utf8'));
  fs.writeFileSync(path.join(tempDir, 'price_update_audit.json'), JSON.stringify({
    ...audit,
    generationId: 'prices-mismatched-selftest'
  }));
  const negative = buildHealth(options).health;
  assert.ok(
    negative.publish.blockingReasons.some((message) => message.includes('another price generation')),
    negative.publish.blockingReasons.join('\n')
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('portal-sync-health price generation selftest: ok');
