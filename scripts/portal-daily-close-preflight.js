#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPORT_NAME = 'portal_daily_close_preflight.json';
const REQUIRED_SECRETS = [
  'ALTEA_WB_API_TOKEN',
  'ALTEA_WB_PROMOTION_TOKEN',
  'ALTEA_OZON_CLIENT_ID',
  'ALTEA_OZON_API_KEY',
  'ALTEA_YM_API_KEY',
  'ALTEA_YM_CAMPAIGN_ID',
  'ALTEA_YM_BUSINESS_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function utcNowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function secretPresent(env, name) {
  return String(env[name] || '').trim().length > 0;
}

function buildReport({ env = process.env, cutoffDate = '', revisionFrom = '', generatedAt = utcNowIso() } = {}) {
  const missingSecrets = REQUIRED_SECRETS.filter((name) => !secretPresent(env, name));
  const status = missingSecrets.length ? 'blocked' : 'ok';
  const blockingReasons = missingSecrets.length
    ? [`Missing required daily close secrets: ${missingSecrets.join(', ')}`]
    : [];
  return {
    schema: 'portal-daily-close-preflight-v1',
    generatedAt,
    status,
    publish: {
      allowed: missingSecrets.length === 0,
      blockingReasons
    },
    cutoffDate,
    revisionFrom,
    requiredSecrets: REQUIRED_SECRETS,
    presentSecretCount: REQUIRED_SECRETS.length - missingSecrets.length,
    missingSecrets
  };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const outputDir = path.resolve(String(args['output-dir'] || '.portal-truth-output'));
  const report = buildReport({
    env,
    cutoffDate: String(args['cutoff-date'] || ''),
    revisionFrom: String(args['revision-from'] || '')
  });
  const reportPath = path.join(outputDir, REPORT_NAME);
  writeJson(reportPath, report);

  if (report.missingSecrets.length) {
    console.error('Missing required daily close secrets:');
    report.missingSecrets.forEach((name) => console.error(`- ${name}`));
    console.error(`Preflight report: ${reportPath}`);
    return 1;
  }

  console.log(`Daily close secret preflight passed. Report: ${reportPath}`);
  return 0;
}

module.exports = {
  REPORT_NAME,
  REQUIRED_SECRETS,
  buildReport,
  main,
  parseArgs
};

if (require.main === module) {
  process.exitCode = main();
}
