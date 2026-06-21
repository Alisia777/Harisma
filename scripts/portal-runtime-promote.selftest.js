#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promoteRuntimeArtifacts, stableStringify } = require('./portal-runtime-promote');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function seedInput(root) {
  const inputDir = path.join(root, 'truth');
  const dataDir = path.join(root, 'data');
  const outputDir = path.join(root, 'out');
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  writeJson(path.join(inputDir, 'canonical_repricer.json'), {
    schema: 'canonical-repricer-v1',
    generatedAt: '2026-06-20T00:00:00.000Z',
    snapshot_id: 'repricer:selftest',
    feature_status: 'blocked',
    summary: { rows: 1, eligible_rows: 1, publishable_rows: 0, blocked_rows: 1, feature_status: 'blocked' },
    rows: [{ article_key: 'sku-1', platform: 'wb', recommendation: { status: 'blocked' } }]
  });
  writeJson(path.join(inputDir, 'portal_repricing_reconciliation.json'), {
    schema: 'portal-repricing-reconciliation-v1',
    generatedAt: '2026-06-20T00:00:00.000Z',
    status: 'warning',
    publish_allowed: true,
    feature_status: 'blocked',
    feature_publish_allowed: false,
    summary: { eligible_rows: 1, publishable_rows: 0, blocked_rows: 1, publishable_coverage: 0, feature_status: 'blocked' },
    warnings: ['repricer feature blocked: 0/1 publishable recommendations']
  });
  writeJson(path.join(inputDir, 'portal_dashboard_metrics.json'), {
    schema: 'portal-dashboard-metrics-v1',
    generatedAt: '2026-06-20T00:00:00.000Z',
    snapshot_id: 'dashboard:selftest',
    metrics: [{ metric_id: 'sales.raw_revenue', raw_value: 1 }]
  });
  writeJson(path.join(inputDir, 'portal_dashboard_reconciliation.json'), {
    schema: 'portal-dashboard-reconciliation-v1',
    generatedAt: '2026-06-20T00:00:00.000Z',
    status: 'ok',
    publish_allowed: true,
    metricCount: 1
  });
  writeJson(path.join(inputDir, 'portal_upload_apply_e2e.json'), { schema: 'portal-upload-apply-e2e-v1', status: 'ok', publish_allowed: true });
  writeJson(path.join(inputDir, 'portal_minmax_upload_reconciliation.json'), { schema: 'portal-minmax-upload-reconciliation-v1', status: 'ok', publish_allowed: true });
  writeJson(path.join(inputDir, 'portal_cost_upload_reconciliation.json'), { schema: 'portal-cost-upload-reconciliation-v1', status: 'ok', publish_allowed: true });
  return { inputDir, dataDir, outputDir, lastGoodDir: path.join(dataDir, 'last_good') };
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-runtime-promote-selftest-'));
  const dirs = seedInput(root);
  const first = promoteRuntimeArtifacts(dirs);
  assert.strictEqual(first.runtimeReport.publish_allowed, true);
  assert.strictEqual(first.runtimeReport.artifacts.find((artifact) => artifact.id === 'canonical_repricer').promoted, false);
  assert.strictEqual(first.runtimeReport.artifacts.find((artifact) => artifact.id === 'canonical_repricer').diagnosticOnly, true);
  assert.strictEqual(first.featureReport.features.repricer.status, 'blocked');
  assert.strictEqual(first.featureReport.features.repricer.activation_allowed, false);
  assert.strictEqual(fs.existsSync(path.join(dirs.dataDir, 'canonical_repricer.json')), false);
  assert.strictEqual(fs.existsSync(path.join(dirs.lastGoodDir, 'canonical_repricer.json')), false);
  assert.strictEqual(fs.existsSync(path.join(dirs.dataDir, 'portal_dashboard_metrics.json')), true);
  const runtimeDashboard = readJson(path.join(dirs.dataDir, 'portal_dashboard_metrics.json'));
  const lastGoodDashboard = readJson(path.join(dirs.lastGoodDir, 'portal_dashboard_metrics.json'));
  assert.strictEqual(stableStringify(runtimeDashboard), stableStringify(lastGoodDashboard));

  writeJson(path.join(dirs.inputDir, 'canonical_repricer.json'), {
    schema: 'canonical-repricer-v1',
    generatedAt: '2026-06-20T00:00:01.000Z',
    snapshot_id: 'repricer:bad',
    rows: []
  });
  writeJson(path.join(dirs.inputDir, 'portal_repricing_reconciliation.json'), {
    schema: 'portal-repricing-reconciliation-v1',
    status: 'blocked',
    publish_allowed: false,
    feature_status: 'blocked',
    summary: { eligible_rows: 0, publishable_rows: 0, blocked_rows: 0 }
  });
  const second = promoteRuntimeArtifacts(dirs);
  assert.strictEqual(second.runtimeReport.publish_allowed, true);
  assert.strictEqual(second.runtimeReport.artifacts.find((artifact) => artifact.id === 'canonical_repricer').promoted, false);
  assert.strictEqual(second.runtimeReport.artifacts.find((artifact) => artifact.id === 'canonical_repricer').diagnosticOnly, true);
  assert.strictEqual(fs.existsSync(path.join(dirs.dataDir, 'canonical_repricer.json')), false);

  console.log('[runtime-promote-selftest] OK: feature-gated runtime promotion and readiness passed');
}

if (require.main === module) main();
