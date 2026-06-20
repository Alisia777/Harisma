#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARTIFACTS = [
  {
    id: 'canonical_repricer',
    file: 'canonical_repricer.json',
    schema: 'canonical-repricer-v1',
    reconciliation: 'portal_repricing_reconciliation.json',
    rowKey: 'rows'
  },
  {
    id: 'portal_dashboard_metrics',
    file: 'portal_dashboard_metrics.json',
    schema: 'portal-dashboard-metrics-v1',
    reconciliation: 'portal_dashboard_reconciliation.json',
    rowKey: 'metrics'
  }
];

const REPORTS = {
  runtime: 'portal_runtime_wiring_reconciliation.json',
  feature: 'portal_feature_readiness.json',
  uploadE2e: 'portal_upload_apply_e2e.json',
  minmax: 'portal_minmax_upload_reconciliation.json',
  cost: 'portal_cost_upload_reconciliation.json'
};

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function resolveOptions(args = {}) {
  const root = process.cwd();
  return {
    root,
    inputDir: path.resolve(args['input-dir'] || path.join(root, '.portal-truth-output')),
    dataDir: path.resolve(args['data-dir'] || path.join(root, 'data')),
    lastGoodDir: path.resolve(args['last-good-dir'] || path.join(root, 'data', 'last_good')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output')),
    noWrite: Boolean(args['no-write']),
    noDataWrite: Boolean(args['no-data-write'] || args['report-only']),
    noFail: Boolean(args['no-fail'])
  };
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksumPayload(payload) {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function copyJsonPayload(payload, filePath, options) {
  if (options.noWrite || options.noDataWrite) return;
  writeJson(filePath, payload);
}

function relativePath(filePath, options) {
  const relative = path.relative(options.root || process.cwd(), filePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.replace(/\\/g, '/')
    : path.basename(filePath);
}

function validateArtifact(definition, payload, reconciliation) {
  const errors = [];
  const warnings = [];
  if (!payload || typeof payload !== 'object') errors.push(`${definition.file} missing or unreadable`);
  if (payload && payload.schema !== definition.schema) errors.push(`${definition.file} schema mismatch`);
  if (payload && !Array.isArray(payload[definition.rowKey])) errors.push(`${definition.file} has no ${definition.rowKey} array`);
  if (!reconciliation || typeof reconciliation !== 'object') warnings.push(`${definition.reconciliation} missing or unreadable`);
  if (reconciliation && reconciliation.publish_allowed === false) errors.push(`${definition.reconciliation} blocks promotion`);
  if (reconciliation && reconciliation.status && !['ok', 'warning'].includes(String(reconciliation.status))) errors.push(`${definition.reconciliation} status is ${reconciliation.status}`);
  return { errors, warnings };
}

function promoteArtifact(definition, options) {
  const sourcePath = path.join(options.inputDir, definition.file);
  const runtimePath = path.join(options.dataDir, definition.file);
  const lastGoodPath = path.join(options.lastGoodDir, definition.file);
  const reconciliationPath = path.join(options.inputDir, definition.reconciliation);
  const sourcePayload = readJson(sourcePath, null);
  const reconciliation = readJson(reconciliationPath, null);
  const validation = validateArtifact(definition, sourcePayload, reconciliation);
  const diagnosticOnly = definition.id === 'canonical_repricer' && reconciliation?.feature_publish_allowed !== true;
  let payload = sourcePayload;
  let source = 'current';
  let promoted = false;
  let fallback = false;
  let activationAllowed = !diagnosticOnly;
  if (diagnosticOnly && sourcePayload) {
    source = 'diagnostic_only';
    validation.warnings.push('canonical repricer retained as diagnostic snapshot; feature activation is blocked');
  } else if (validation.errors.length) {
    const lastGood = readJson(lastGoodPath, null);
    if (lastGood) {
      payload = lastGood;
      source = 'last_good';
      fallback = true;
      validation.warnings.push(`${definition.id} restored from last_good`);
    }
  } else {
    promoted = true;
  }
  const checksum = payload ? checksumPayload(payload) : '';
  if (payload && !diagnosticOnly) {
    copyJsonPayload(payload, runtimePath, options);
    if (promoted) copyJsonPayload(payload, lastGoodPath, options);
  }
  return {
    id: definition.id,
    status: payload ? (diagnosticOnly ? 'warning' : (validation.errors.length && !fallback ? 'blocked' : (fallback ? 'warning' : 'ok'))) : 'blocked',
    promoted,
    fallback,
    diagnosticOnly,
    activationAllowed,
    source,
    sourcePath: relativePath(sourcePath, options),
    runtimePath: relativePath(runtimePath, options),
    lastGoodPath: relativePath(lastGoodPath, options),
    checksum,
    rowCount: Array.isArray(payload?.[definition.rowKey]) ? payload[definition.rowKey].length : 0,
    reconciliationStatus: reconciliation?.status || '',
    reconciliationPublishAllowed: reconciliation?.publish_allowed !== false,
    featurePublishAllowed: definition.id === 'canonical_repricer' ? reconciliation?.feature_publish_allowed === true : undefined,
    writeMode: options.noDataWrite ? 'report_only' : 'runtime',
    errors: validation.errors,
    warnings: validation.warnings
  };
}

function featureReadiness(options, artifacts) {
  const repricing = readJson(path.join(options.inputDir, 'portal_repricing_reconciliation.json'), {});
  const dashboard = readJson(path.join(options.inputDir, 'portal_dashboard_reconciliation.json'), {});
  const uploadE2e = readJson(path.join(options.inputDir, REPORTS.uploadE2e), {});
  const minmax = readJson(path.join(options.inputDir, REPORTS.minmax), {});
  const cost = readJson(path.join(options.inputDir, REPORTS.cost), {});
  const repricerArtifact = artifacts.find((artifact) => artifact.id === 'canonical_repricer') || {};
  const dashboardArtifact = artifacts.find((artifact) => artifact.id === 'portal_dashboard_metrics') || {};
  const repricerStatus = repricing.feature_status || repricing.summary?.feature_status || 'unknown';
  const dashboardStatus = dashboard.status || 'unknown';
  const features = {
    repricer: {
      status: repricerStatus,
      publish_allowed: repricing.feature_publish_allowed === true,
      activation_allowed: repricing.feature_publish_allowed === true,
      diagnostic_available: Boolean(repricerArtifact.checksum),
      report_status: repricing.status || '',
      runtime_path: 'data/canonical_repricer.json',
      checksum: repricerArtifact.checksum || '',
      eligible_rows: repricing.summary?.eligible_rows ?? repricing.summary?.rowCount ?? repricerArtifact.rowCount ?? 0,
      publishable_rows: repricing.summary?.publishable_rows ?? 0,
      blocked_rows: repricing.summary?.blocked_rows ?? 0,
      publishable_coverage: repricing.summary?.publishable_coverage ?? 0,
      warnings: repricing.warnings || []
    },
    dashboard: {
      status: dashboardStatus,
      publish_allowed: dashboard.publish_allowed !== false,
      activation_allowed: dashboard.publish_allowed !== false,
      runtime_path: 'data/portal_dashboard_metrics.json',
      checksum: dashboardArtifact.checksum || '',
      metricCount: dashboard.metricCount ?? dashboard.summary?.metricCount ?? dashboardArtifact.rowCount ?? 0,
      warnings: dashboard.warnings || []
    },
    uploads: {
      status: uploadE2e.status || 'ok',
      publish_allowed: uploadE2e.publish_allowed !== false,
      activation_allowed: uploadE2e.publish_allowed !== false,
      minmax_status: minmax.status || 'ok',
      cost_status: cost.status || 'ok',
      warnings: [
        ...(uploadE2e.warnings || []),
        ...(minmax.warnings || []),
        ...(cost.warnings || [])
      ]
    }
  };
  const technicalAllowed = artifacts.every((artifact) => artifact.status !== 'blocked');
  const featureActivationAllowed = Object.values(features).every((feature) => feature.activation_allowed !== false);
  return {
    schema: 'portal-feature-readiness-v1',
    generatedAt: new Date().toISOString(),
    status: technicalAllowed ? (Object.values(features).some((feature) => feature.status === 'blocked') ? 'warning' : 'ok') : 'blocked',
    technical_publish_allowed: technicalAllowed,
    feature_activation_allowed: featureActivationAllowed,
    diagnostic_publish_allowed: technicalAllowed,
    features
  };
}

function promoteRuntimeArtifacts(options = resolveOptions({})) {
  const callerHadLastGoodDir = Object.prototype.hasOwnProperty.call(options, 'lastGoodDir');
  const defaults = resolveOptions({});
  options = { ...defaults, ...options };
  if (!options.outputDir) options.outputDir = options.inputDir;
  if (!callerHadLastGoodDir && options.dataDir !== defaults.dataDir) options.lastGoodDir = path.join(options.dataDir, 'last_good');
  const artifacts = ARTIFACTS.map((definition) => promoteArtifact(definition, options));
  const blocking = artifacts.flatMap((artifact) => artifact.status === 'blocked' ? artifact.errors : []);
  const warnings = artifacts.flatMap((artifact) => artifact.warnings || []);
  const runtimeReport = {
    schema: 'portal-runtime-wiring-reconciliation-v1',
    generatedAt: new Date().toISOString(),
    status: blocking.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    publish_allowed: blocking.length === 0,
    writeMode: options.noDataWrite ? 'report_only' : 'runtime',
    business_fingerprint: checksumPayload(artifacts.map((artifact) => ({
      id: artifact.id,
      checksum: artifact.checksum,
      source: artifact.source,
      rowCount: artifact.rowCount
    }))),
    artifacts,
    blockingReasons: blocking,
    warnings,
    runtime_sources: {
      canonical_repricer: 'data/canonical_repricer.json',
      portal_dashboard_metrics: 'data/portal_dashboard_metrics.json',
      last_good_dir: 'data/last_good'
    }
  };
  const featureReport = featureReadiness(options, artifacts);
  if (!options.noWrite) {
    writeJson(path.join(options.outputDir, REPORTS.runtime), runtimeReport);
    writeJson(path.join(options.outputDir, REPORTS.feature), featureReport);
    writeJson(path.join(options.dataDir, REPORTS.runtime), runtimeReport);
    writeJson(path.join(options.dataDir, REPORTS.feature), featureReport);
  }
  return { runtimeReport, featureReport };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  try {
    const { runtimeReport, featureReport } = promoteRuntimeArtifacts(options);
    const status = runtimeReport.status === 'ok' ? 'OK' : runtimeReport.status.toUpperCase();
    console.log(`[runtime-promote] ${status}: ${runtimeReport.artifacts.length} artifacts, repricer feature ${featureReport.features.repricer.status}`);
    if (!runtimeReport.publish_allowed && !options.noFail) process.exitCode = 1;
  } catch (error) {
    console.error(`[runtime-promote] fatal: ${error.stack || error.message}`);
    if (!options.noFail) process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  promoteRuntimeArtifacts,
  resolveOptions,
  stableStringify
};
