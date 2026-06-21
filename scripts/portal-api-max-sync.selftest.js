#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const { commonBusinessCutoff } = require('./portal-api-max-sync');

const root = path.resolve(__dirname, '..');
const script = path.join('scripts', 'portal-api-max-sync.js');

const commonCutoff = commonBusinessCutoff({
  wb: { to: '2026-06-18' },
  ozon: { to: '2026-06-20' },
  ya: { to: '2026-06-20' },
  all: { to: '2026-06-20' }
});
if (commonCutoff !== '2026-06-18') {
  console.error(`Expected business cutoff to use the oldest required platform date, got ${commonCutoff}`);
  process.exit(1);
}

function runSync(extraArgs = []) {
  const result = spawnSync(process.execPath, [
    script,
    'sync',
    '--mode',
    'daily',
    '--recent-days',
    '1',
    '--platforms',
    'wb',
    '--to',
    '2026-06-20',
    '--skip-protected-scope',
    '--skip-health',
    '--skip-data-guard',
    '--dry-run',
    ...extraArgs
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ALTEA_PORTAL_API_IGNORE_USER_ENV: '1',
      ALTEA_WB_API_TOKEN: '',
      ALTEA_WB_PROMOTION_TOKEN: ''
    }
  });
  return {
    status: Number(result.status || 0),
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

const relaxed = runSync();
if (relaxed.status !== 0 || !relaxed.stdout.includes('"status": "skipped"')) {
  console.error('Expected relaxed missing-source run to keep skipped records without failing.');
  console.error(relaxed.stdout);
  console.error(relaxed.stderr);
  process.exit(1);
}

const strict = runSync(['--strict']);
if (strict.status === 0 || !`${strict.stdout}\n${strict.stderr}`.includes('[api-max] blocked WB API marketplace facts')) {
  console.error('Expected strict missing-source run to block.');
  console.error(strict.stdout);
  console.error(strict.stderr);
  process.exit(1);
}

console.log('portal-api-max-sync selftest ok');
