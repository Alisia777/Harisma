#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { forwardedArgs, parseArgs } = require('./import-price-history-report');

const parsed = parseArgs([
  'node',
  'script',
  '--input',
  '/tmp/report.xlsx',
  '--expected-date=2026-07-23',
  '--dry-run'
]);
assert.strictEqual(parsed.input, '/tmp/report.xlsx');
assert.strictEqual(parsed['expected-date'], '2026-07-23');
assert.strictEqual(parsed['dry-run'], true);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'price-import-wrapper-'));
try {
  const inputPath = path.join(tempDir, 'report.xlsx');
  fs.writeFileSync(inputPath, '');
  const forwarded = forwardedArgs({
    input: inputPath,
    'expected-date': '2026-07-23',
    'dry-run': true
  });
  assert.ok(forwarded.includes('--input-xlsx'));
  assert.ok(forwarded.includes(inputPath));
  assert.ok(forwarded.includes('--expected-date'));
  assert.ok(forwarded.includes('2026-07-23'));
  assert.ok(forwarded.includes('--dry-run'));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('import-price-history-report selftest: ok');
