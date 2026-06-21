#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const scriptPath = path.join(__dirname, 'portal-daily-close-preflight.js');
const { REPORT_NAME, REQUIRED_CONFIG, REQUIRED_SECRETS, OPTIONAL_SECRETS, buildReport } = require(scriptPath);

const blockedReport = buildReport({
  env: {},
  cutoffDate: '2026-06-20',
  revisionFrom: '2026-05-22',
  generatedAt: '2026-06-21T00:00:00Z'
});
assert.strictEqual(blockedReport.status, 'blocked');
assert.strictEqual(blockedReport.publish.allowed, false);
assert.deepStrictEqual(blockedReport.missingSecrets, REQUIRED_SECRETS);
assert.deepStrictEqual(blockedReport.missingConfig, []);
assert.deepStrictEqual(blockedReport.optionalMissingSecrets, OPTIONAL_SECRETS);
assert.strictEqual(blockedReport.presentSecretCount, 0);
assert.strictEqual(blockedReport.presentConfigCount, REQUIRED_CONFIG.length);
assert.strictEqual(blockedReport.resolvedSources.config.SUPABASE_URL, 'default');
assert.strictEqual(blockedReport.cutoffDate, '2026-06-20');
assert.strictEqual(blockedReport.revisionFrom, '2026-05-22');
assert(!JSON.stringify(blockedReport).includes('secret-value'));

const okEnv = Object.fromEntries(REQUIRED_SECRETS.map((name) => [name, `${name}-secret-value`]));
const okReport = buildReport({ env: okEnv, generatedAt: '2026-06-21T00:00:00Z' });
assert.strictEqual(okReport.status, 'ok');
assert.strictEqual(okReport.publish.allowed, true);
assert.deepStrictEqual(okReport.missingSecrets, []);
assert.deepStrictEqual(okReport.missingConfig, []);
assert.strictEqual(okReport.presentSecretCount, REQUIRED_SECRETS.length);
assert.strictEqual(okReport.presentConfigCount, REQUIRED_CONFIG.length);
assert.deepStrictEqual(okReport.optionalMissingSecrets, OPTIONAL_SECRETS);

const aliasReport = buildReport({
  env: {
    ...Object.fromEntries(REQUIRED_SECRETS.filter((name) => name !== 'SUPABASE_SERVICE_ROLE_KEY').map((name) => [name, `${name}-secret-value`])),
    ALTEA_SUPABASE_SERVICE_ROLE_KEY: 'supabase-alias-secret-value',
    ALTEA_SUPABASE_URL: 'https://example.supabase.co'
  },
  generatedAt: '2026-06-21T00:00:00Z'
});
assert.strictEqual(aliasReport.status, 'ok');
assert.strictEqual(aliasReport.resolvedSources.secrets.SUPABASE_SERVICE_ROLE_KEY, 'ALTEA_SUPABASE_SERVICE_ROLE_KEY');
assert.strictEqual(aliasReport.resolvedSources.config.SUPABASE_URL, 'ALTEA_SUPABASE_URL');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-daily-close-preflight-'));
try {
  const missingRun = spawnSync(
    process.execPath,
    [scriptPath, '--output-dir', tmp, '--cutoff-date', '2026-06-20', '--revision-from', '2026-05-22'],
    { encoding: 'utf8', env: {} }
  );
  assert.strictEqual(missingRun.status, 1);
  assert(missingRun.stderr.includes('Missing required daily close secrets:'));
  assert(missingRun.stderr.includes('ALTEA_WB_API_TOKEN'));
  assert(!missingRun.stderr.includes('ALTEA_YM_CAMPAIGN_ID'));
  const missingDiskReport = JSON.parse(fs.readFileSync(path.join(tmp, REPORT_NAME), 'utf8'));
  assert.strictEqual(missingDiskReport.status, 'blocked');
  assert.deepStrictEqual(missingDiskReport.missingSecrets, REQUIRED_SECRETS);
  assert.deepStrictEqual(missingDiskReport.optionalMissingSecrets, OPTIONAL_SECRETS);

  const okTmp = path.join(tmp, 'ok');
  const successRun = spawnSync(process.execPath, [scriptPath, '--output-dir', okTmp], {
    encoding: 'utf8',
    env: okEnv
  });
  assert.strictEqual(successRun.status, 0);
  assert(successRun.stdout.includes('Daily close secret preflight passed.'));
  const okDiskReport = JSON.parse(fs.readFileSync(path.join(okTmp, REPORT_NAME), 'utf8'));
  assert.strictEqual(okDiskReport.status, 'ok');
  assert.deepStrictEqual(okDiskReport.missingSecrets, []);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('portal-daily-close-preflight selftest ok');
