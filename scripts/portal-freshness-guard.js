#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseArgs,
  readJson,
  writeJson,
  dateKey,
  passportsArray,
  STATUS_RANK
} = require('./portal-freshness-core');

const REQUIRED_REPORTS = [
  'portal_layer_passports.json',
  'portal_upload_health.json',
  'portal_min_max_reconciliation.json',
  'portal_cost_reconciliation.json',
  'portal_repricer_dependency_reconciliation.json',
  'portal_dashboard_metric_reconciliation.json',
  'portal_upload_issues.json'
];

function resolveOptions(args = parseArgs(process.argv)) {
  const root = process.cwd();
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, '.portal-truth-output')),
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output')),
    expectedDate: dateKey(args['expected-date']) || '',
    noFail: Boolean(args['no-fail']),
    noWrite: Boolean(args['no-write'])
  };
}

function readReport(fileName, dirs) {
  for (const dir of dirs) {
    const filePath = path.join(dir, fileName);
    if (fs.existsSync(filePath)) return { filePath, payload: readJson(filePath) };
  }
  return { filePath: path.join(dirs[0], fileName), payload: null };
}

function isBlockingPassport(passport) {
  const status = String(passport.status || 'unknown');
  if (passport.blockingMode === 'manual_review') return false;
  return (STATUS_RANK[status] ?? 3) >= STATUS_RANK.stale;
}

function inspectFreshnessReports(options, expectedDate, checks) {
  const dirs = [options.inputDir, options.outputDir, options.baseDataDir].filter(Boolean);
  const check = { id: 'contract:freshness-uploaders-phase4', scope: 'freshness', source: 'phase4-reports', warnings: [], blockingReasons: [] };
  const reports = {};
  REQUIRED_REPORTS.forEach((file) => {
    const found = readReport(file, dirs);
    reports[file] = found.payload;
    if (!found.payload) check.blockingReasons.push(`phase4: missing ${file}`);
  });

  const layerPassports = passportsArray(reports['portal_layer_passports.json']);
  layerPassports.forEach((passport) => {
    if (isBlockingPassport(passport)) {
      check.blockingReasons.push(`${passport.layer}: passport status ${passport.status}${passport.sourceAsOf ? ` at ${passport.sourceAsOf}` : ''}`);
    } else if (passport.status !== 'verified') {
      check.warnings.push(`${passport.layer}: passport status ${passport.status}`);
    }
    if (passport.sourceAsOfConfidence === 'generated_at_only' && !passport.warnings?.some((item) => item.includes('explicit'))) {
      check.blockingReasons.push(`${passport.layer}: sourceAsOf is generatedAt-only without explicit policy allowance`);
    }
  });

  const uploadHealth = reports['portal_upload_health.json'] || {};
  if (uploadHealth.status === 'blocked' || Number(uploadHealth.blockingIssues || 0) > 0) {
    check.blockingReasons.push(`upload: current batch ${uploadHealth.batchId || uploadHealth.currentBatchId || 'unknown'} is blocked`);
  }
  if (Number(uploadHealth.unresolvedBlockingIssues || 0) > 0) {
    check.blockingReasons.push(`upload: ${uploadHealth.unresolvedBlockingIssues} unresolved blocking issues`);
  }

  for (const [file, label] of [
    ['portal_min_max_reconciliation.json', 'min/max'],
    ['portal_cost_reconciliation.json', 'cost']
  ]) {
    const report = reports[file] || {};
    if (report.status === 'blocked' || Number(report.blockingIssues || 0) > 0) {
      check.blockingReasons.push(`${label}: reconciliation blocked`);
    } else if (report.status && report.status !== 'ok') {
      check.warnings.push(`${label}: reconciliation status ${report.status}`);
    }
  }

  const repricer = reports['portal_repricer_dependency_reconciliation.json'] || {};
  if (repricer.status === 'blocked' || Number(repricer.summary?.unsafeExecutableCount || 0) > 0) {
    check.blockingReasons.push(`repricer: ${repricer.summary?.unsafeExecutableCount || 0} executable recommendations without verified dependencies`);
  } else if (repricer.status && repricer.status !== 'ok') {
    check.warnings.push(`repricer: dependency status ${repricer.status}; executableCount=${repricer.summary?.executableCount || 0}`);
  }

  const dashboard = reports['portal_dashboard_metric_reconciliation.json'] || {};
  if (dashboard.status === 'blocked') {
    (dashboard.blockingReasons || ['dashboard metric reconciliation blocked']).forEach((reason) => check.blockingReasons.push(reason));
  }

  const issueReport = reports['portal_upload_issues.json'] || {};
  const currentBatchId = uploadHealth.batchId || uploadHealth.currentBatchId || issueReport.currentBatchId;
  const currentBlocking = (issueReport.issues || []).filter((issue) => {
    if (issue.status !== 'open') return false;
    if (issue.severity === 'warning') return false;
    return !currentBatchId || issue.batchId === currentBatchId;
  });
  if (currentBlocking.length) check.blockingReasons.push(`upload: ${currentBlocking.length} current blocking row-level issues`);

  check.status = check.blockingReasons.length ? 'blocked' : (check.warnings.length ? 'warning' : 'ok');
  checks.push(check);
  return check;
}

function run(options = resolveOptions()) {
  const checks = [];
  inspectFreshnessReports(options, options.expectedDate, checks);
  const blockingReasons = checks.flatMap((check) => check.blockingReasons || []);
  const warningReasons = checks.flatMap((check) => check.warnings || []);
  const report = {
    schema: 'portal-freshness-guard-v1',
    generatedAt: options.expectedDate ? `${options.expectedDate}T00:00:00.000Z` : new Date().toISOString(),
    status: blockingReasons.length ? 'blocked' : (warningReasons.length ? 'warning' : 'ok'),
    publish: {
      allowed: blockingReasons.length === 0,
      blockingReasons,
      warningReasons
    },
    checks
  };
  if (!options.noWrite) writeJson(path.join(options.outputDir, 'portal_freshness_guard.json'), report);
  return report;
}

function main() {
  const options = resolveOptions();
  try {
    const report = run(options);
    console.log(`[portal-freshness-guard] ${report.status}: ${report.publish.blockingReasons.length} blocking, ${report.publish.warningReasons.length} warnings`);
    if (!report.publish.allowed && !options.noFail) process.exitCode = 1;
  } catch (error) {
    console.error(`[portal-freshness-guard] fatal: ${error.stack || error.message}`);
    if (!options.noFail) process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  REQUIRED_REPORTS,
  resolveOptions,
  inspectFreshnessReports,
  run
};
