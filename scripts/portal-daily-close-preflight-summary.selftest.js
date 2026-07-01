#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildReport } = require('./portal-daily-close-preflight');
const { renderReport } = require('./portal-daily-close-preflight-summary');

const blockedReport = buildReport({
  env: {},
  cutoffDate: '2026-07-01',
  revisionFrom: '2026-06-02',
  generatedAt: '2026-07-02T00:00:00Z'
});
const markdown = renderReport(blockedReport);
assert(markdown.includes('Portal Daily Close Preflight'));
assert(markdown.includes('publish.allowed: `false`'));
assert(markdown.includes('Missing required daily close secrets'));
assert(markdown.includes('ALTEA_WB_API_TOKEN'));
assert(markdown.includes('Smart Price Source'));
assert(markdown.includes('Extra Marketplace Sources'));
assert(markdown.includes('goldapple'));
assert(markdown.includes('magnit'));
assert(!markdown.includes('secret-value'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-preflight-summary-'));
try {
  const reportPath = path.join(tmp, 'report.json');
  const summaryPath = path.join(tmp, 'summary.md');
  fs.writeFileSync(reportPath, `${JSON.stringify(blockedReport, null, 2)}\n`, 'utf8');
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'portal-daily-close-preflight-summary.js'),
    '--report',
    reportPath
  ], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath }
  });
  assert.strictEqual(result.status, 0);
  assert(result.stdout.includes('Portal Daily Close Preflight'));
  const summary = fs.readFileSync(summaryPath, 'utf8');
  assert.strictEqual(summary, result.stdout);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('portal-daily-close-preflight-summary selftest ok');
