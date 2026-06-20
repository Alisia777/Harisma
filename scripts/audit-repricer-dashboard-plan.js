#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { featureReadiness, marginAtPrice, stableStringify } = require('./build-canonical-repricer');

const REPORTS = {
  repricing: 'portal_repricing_reconciliation.json',
  dashboard: 'portal_dashboard_reconciliation.json',
  plan: 'portal_plan_reconciliation.json',
  indicator: 'portal_indicator_audit.json'
};

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const equal = token.indexOf('=');
    const key = token.slice(2, equal >= 0 ? equal : undefined);
    if (equal >= 0) {
      args[key] = token.slice(equal + 1);
      continue;
    }
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
    inputDir: path.resolve(args['input-dir'] || path.join(root, '.portal-truth-output')),
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output')),
    noWrite: Boolean(args['no-write']),
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

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateMs(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateDiffDays(left, right) {
  const l = dateMs(left);
  const r = dateMs(right);
  if (!l || !r) return null;
  return Math.floor((r - l) / 86400000);
}

function deepEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function addCheck(checks, check) {
  check.blockingReasons = check.blockingReasons || [];
  check.warnings = check.warnings || [];
  check.status = check.blockingReasons.length ? 'blocked' : (check.warnings.length ? 'warning' : 'ok');
  checks.push(check);
  return check;
}

function reportBase(schema, generatedAt, snapshotId, checks, extra = {}) {
  const blockingReasons = checks.flatMap((check) => check.blockingReasons || []);
  const warnings = checks.flatMap((check) => check.warnings || []);
  const { summary: extraSummary = {}, ...rest } = extra;
  return {
    schema,
    generatedAt,
    snapshot_id: snapshotId,
    status: blockingReasons.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    publish_allowed: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    summary: {
      checks: checks.length,
      blockingChecks: checks.filter((check) => check.status === 'blocked').length,
      warningChecks: checks.filter((check) => check.status === 'warning').length,
      ...extraSummary
    },
    checks,
    ...rest
  };
}

function auditRepricer(canonical = {}, baseDataDir = process.cwd(), cutoffDate = '') {
  const rows = Array.isArray(canonical.rows) ? canonical.rows : [];
  const checks = [];
  const seen = new Map();
  const duplicateKeys = [];
  rows.forEach((row) => {
    const key = `${row.platform}|${row.normalized_article_key || row.article_key}`;
    if (seen.has(key)) duplicateKeys.push(key);
    seen.set(key, row);
  });
  addCheck(checks, {
    id: 'repricer:no-duplicate-normalized-platform-key',
    blockingReasons: duplicateKeys.length ? [`duplicate normalized SKU/platform keys: ${[...new Set(duplicateKeys)].length}`] : [],
    duplicateKeys: [...new Set(duplicateKeys)].slice(0, 50)
  });

  const proposedViolations = [];
  const marginViolations = [];
  const corridorViolations = [];
  const staleViolations = [];
  const stockViolations = [];
  const localOverrideViolations = [];
  rows.forEach((row) => {
    const proposedPrice = numberOrNull(row?.recommendation?.price);
    const currentPrice = numberOrNull(row?.facts?.seller_price);
    if (row?.audit?.local_storage_override_used) {
      localOverrideViolations.push({ platform: row.platform, article_key: row.article_key });
    }
    if (row?.facts?.stock === null && row?.facts?.stock_status === 'trusted_zero_oos') {
      stockViolations.push({ platform: row.platform, article_key: row.article_key, reason: 'stock_absent_marked_oos' });
    }
    if (row?.facts?.stock === 0 && row?.facts?.stock_status && !['trusted_zero_oos', 'trusted'].includes(row.facts.stock_status)) {
      stockViolations.push({ platform: row.platform, article_key: row.article_key, reason: 'trusted_zero_stock_not_explicit' });
    }
    if (proposedPrice === null) return;
    if (currentPrice === null || !row?.facts?.as_of || !row?.economics?.complete || row?.policy?.floor == null) {
      proposedViolations.push({ platform: row.platform, article_key: row.article_key, reason: 'published_recommendation_missing_required_inputs' });
    }
    const floor = numberOrNull(row?.policy?.floor);
    const cap = numberOrNull(row?.policy?.cap);
    if (floor !== null && cap !== null && cap + 1e-9 < floor) {
      corridorViolations.push({ platform: row.platform, article_key: row.article_key, reason: 'cap_below_floor' });
    }
    if (!row?.approval && ((floor !== null && proposedPrice + 1e-9 < floor) || (cap !== null && proposedPrice > cap + 1e-9))) {
      corridorViolations.push({ platform: row.platform, article_key: row.article_key, reason: 'price_outside_corridor' });
    }
    const recalculated = marginAtPrice(proposedPrice, row.economics || {});
    const reported = numberOrNull(row?.recommendation?.margin_pct);
    if (recalculated !== null && reported !== null && Math.abs(recalculated - reported) > 0.0005) {
      marginViolations.push({ platform: row.platform, article_key: row.article_key, recalculated, reported });
    }
    const currentMargin = numberOrNull(row?.recommendation?.current_margin_pct);
    if (currentPrice !== null && proposedPrice !== currentPrice && reported !== null && currentMargin !== null && Math.abs(reported - currentMargin) <= 0.000001) {
      marginViolations.push({ platform: row.platform, article_key: row.article_key, reason: 'proposed_margin_copied_from_current' });
    }
    const ageDays = dateDiffDays(row?.facts?.as_of, cutoffDate);
    if (ageDays !== null && ageDays > 7) staleViolations.push({ platform: row.platform, article_key: row.article_key, as_of: row.facts.as_of, cutoffDate, ageDays });
  });
  addCheck(checks, {
    id: 'repricer:published-recommendations-have-complete-inputs',
    blockingReasons: proposedViolations.length ? [`${proposedViolations.length} proposed prices lack complete facts/economics/policy`] : [],
    samples: proposedViolations.slice(0, 25)
  });
  addCheck(checks, {
    id: 'repricer:margin-recalculation',
    blockingReasons: marginViolations.length ? [`${marginViolations.length} proposed margins do not match independent recalculation`] : [],
    samples: marginViolations.slice(0, 25)
  });
  addCheck(checks, {
    id: 'repricer:floor-cap-corridor',
    blockingReasons: corridorViolations.length ? [`${corridorViolations.length} price corridor violations`] : [],
    samples: corridorViolations.slice(0, 25)
  });
  addCheck(checks, {
    id: 'repricer:current-price-freshness',
    blockingReasons: staleViolations.length ? [`${staleViolations.length} proposed prices use stale current seller price`] : [],
    samples: staleViolations.slice(0, 25)
  });
  addCheck(checks, {
    id: 'repricer:stock-unknown-not-oos',
    blockingReasons: stockViolations.length ? [`${stockViolations.length} stock absent/trusted-zero states are conflated`] : [],
    samples: stockViolations.slice(0, 25)
  });
  addCheck(checks, {
    id: 'repricer:local-storage-not-final-truth',
    blockingReasons: localOverrideViolations.length ? [`${localOverrideViolations.length} rows used localStorage override as final truth`] : [],
    samples: localOverrideViolations.slice(0, 25)
  });
  const readiness = featureReadiness(rows, canonical.feature_policy || {});
  addCheck(checks, {
    id: 'repricer:feature-readiness',
    warnings: readiness.warnings,
    details: {
      eligible_rows: readiness.eligible_rows,
      publishable_rows: readiness.publishable_rows,
      blocked_rows: readiness.blocked_rows,
      publishable_coverage: readiness.publishable_coverage,
      required_publishable_coverage: readiness.required_publishable_coverage,
      feature_status: readiness.feature_status
    }
  });
  const guardFile = path.join(baseDataDir, '..', 'portal-repricer-price-guard-hotfix.js');
  const appCore08 = path.join(baseDataDir, '..', 'app-core-08.js');
  const guardText = fs.existsSync(guardFile) ? fs.readFileSync(guardFile, 'utf8') : '';
  const appText = fs.existsSync(appCore08) ? fs.readFileSync(appCore08, 'utf8') : '';
  addCheck(checks, {
    id: 'repricer:browser-guard-does-not-rewrite-truth',
    blockingReasons: /function\s+recalcSide|side\.(recommendedPrice|finalPrice|economicFloor|effectiveFloor)\s*=/.test(guardText)
      ? ['browser repricer guard still rewrites calculated price/floor fields']
      : [],
    details: 'Guard may flag/quarantine only; canonical truth is preserved.'
  });
  addCheck(checks, {
    id: 'repricer:local-overrides-require-approval',
    blockingReasons: !appText.includes('repricerOverrideIsApprovedBusinessRecord') || !appText.includes('local_storage_draft_only')
      ? ['repricer local overrides are not explicitly gated by approved server-side metadata']
      : [],
    details: 'UI drafts may be stored locally; only approved records may affect final price.'
  });
  return reportBase('portal-repricing-reconciliation-v1', canonical.generatedAt || '', canonical.snapshot_id || '', checks, {
    business_fingerprint: crypto.createHash('sha256').update(stableStringify(rows)).digest('hex'),
    rowCount: rows.length,
    feature_status: readiness.feature_status,
    feature_publish_allowed: readiness.feature_publish_allowed,
    summary: {
      rowCount: rows.length,
      eligible_rows: readiness.eligible_rows,
      publishable_rows: readiness.publishable_rows,
      blocked_rows: readiness.blocked_rows,
      publishable_coverage: readiness.publishable_coverage,
      required_publishable_coverage: readiness.required_publishable_coverage,
      feature_status: readiness.feature_status
    }
  });
}

function metricRows(payload = {}) {
  return Array.isArray(payload.metrics) ? payload.metrics : [];
}

function auditDashboard(payload = {}) {
  const metrics = metricRows(payload);
  const checks = [];
  const nullAsZero = metrics.filter((row) => row.raw_value === null && (row.displayed_value === 0 || row.displayed_value === '0' || row.data_status === 'trusted'));
  const estimatedGreen = metrics.filter((row) => ['estimated', 'incomplete', 'stale'].includes(row.data_status) && row.business_status === 'green');
  const scaledFacts = metrics.filter((row) => (row.transforms || []).some((item) => /scale|scaled|control_total/i.test(String(item))));
  const proratedActuals = metrics.filter((row) => (row.transforms || []).some((item) => /prorat|monthly_actual/i.test(String(item))));
  const iuLeaks = metrics.filter((row) => /(^|[^a-z])iu([^a-z]|$)|iu_plan|iu_drr/i.test(stableStringify(row)));
  const mixedDates = metrics.filter((row) => row.metric_id === 'sales.raw_revenue' && row.reconciliation_status === 'blocked');
  addCheck(checks, {
    id: 'dashboard:null-is-incomplete-not-zero',
    blockingReasons: nullAsZero.length ? [`${nullAsZero.length} null metrics are rendered/trusted as zero`] : [],
    samples: nullAsZero.slice(0, 25)
  });
  addCheck(checks, {
    id: 'dashboard:estimated-and-incomplete-never-green',
    blockingReasons: estimatedGreen.length ? [`${estimatedGreen.length} estimated/incomplete/stale metrics have green business status`] : [],
    samples: estimatedGreen.slice(0, 25)
  });
  addCheck(checks, {
    id: 'dashboard:raw-fact-not-scaled',
    blockingReasons: scaledFacts.length ? [`${scaledFacts.length} dashboard facts use scale-to-control transforms`] : [],
    samples: scaledFacts.slice(0, 25)
  });
  addCheck(checks, {
    id: 'dashboard:no-monthly-actual-proration',
    blockingReasons: proratedActuals.length ? [`${proratedActuals.length} metrics prorate monthly actual into a partial range`] : [],
    samples: proratedActuals.slice(0, 25)
  });
  addCheck(checks, {
    id: 'dashboard:no-iu-source-in-non-iu-metrics',
    blockingReasons: iuLeaks.length ? [`${iuLeaks.length} non-IU dashboard metrics reference IU sources/scope`] : [],
    samples: iuLeaks.slice(0, 10)
  });
  addCheck(checks, {
    id: 'dashboard:no-mixed-platform-dates',
    blockingReasons: mixedDates.length ? [`${mixedDates.length} platform raw fact metrics have mixed source dates`] : [],
    samples: mixedDates.slice(0, 25)
  });
  return reportBase('portal-dashboard-reconciliation-v1', payload.generatedAt || '', payload.snapshot_id || '', checks, {
    business_fingerprint: crypto.createHash('sha256').update(stableStringify(metrics)).digest('hex'),
    metricCount: metrics.length
  });
}

function auditPlan(payload = {}) {
  const metrics = metricRows(payload);
  const checks = [];
  const planMetricsWithoutPlanId = metrics.filter((row) => String(row.metric_id || '').startsWith('plan.') && !row.plan_id);
  const completionUnitMismatch = metrics.filter((row) => row.metric_id === 'plan.completion_revenue' && row.unit !== 'ratio');
  const iuSubstitution = metrics.filter((row) => row.plan_id === 'iu' && !String(row.metric_id || '').startsWith('iu.'));
  addCheck(checks, {
    id: 'plan:explicit-plan-ids',
    blockingReasons: planMetricsWithoutPlanId.length ? [`${planMetricsWithoutPlanId.length} plan metrics have no plan_id`] : [],
    samples: planMetricsWithoutPlanId.slice(0, 25)
  });
  addCheck(checks, {
    id: 'plan:completion-unit-ratio',
    blockingReasons: completionUnitMismatch.length ? [`${completionUnitMismatch.length} completion metrics use non-ratio unit`] : [],
    samples: completionUnitMismatch.slice(0, 25)
  });
  addCheck(checks, {
    id: 'plan:no-corporate-iu-substitution',
    blockingReasons: iuSubstitution.length ? [`${iuSubstitution.length} non-IU metrics use IU plan`] : [],
    samples: iuSubstitution.slice(0, 25)
  });
  return reportBase('portal-plan-reconciliation-v1', payload.generatedAt || '', payload.snapshot_id || '', checks, {
    plan_namespaces: ['corporate_revenue_monthly', 'sku_platform_operational', 'salary_kpi_marketplaces', 'wb_contract_turnover', 'iu']
  });
}

function auditIndicators(indicatorAudit = {}, dashboardPayload = {}) {
  const rows = Array.isArray(indicatorAudit.rows) ? indicatorAudit.rows : [];
  const checks = [];
  const disagreements = rows.filter((row) => !deepEqual(row.expected, row.actual));
  const badMissingDrr = rows.filter((row) => row.metric_id === 'ads.drr' && row.actual?.data_status === 'incomplete' && row.actual?.business_status === 'green');
  const badMissingCompletion = rows.filter((row) => row.metric_id === 'plan.completion_revenue' && row.actual?.data_status === 'incomplete' && row.actual?.business_status !== 'neutral');
  const badEstimatedGreen = metricRows(dashboardPayload).filter((row) => row.data_status === 'estimated' && row.business_status === 'green');
  addCheck(checks, {
    id: 'indicator:policy-engine-agreement',
    blockingReasons: disagreements.length ? [`${disagreements.length} indicator rows disagree with policy engine`] : [],
    samples: disagreements.slice(0, 25)
  });
  addCheck(checks, {
    id: 'indicator:missing-drr-neutral',
    blockingReasons: badMissingDrr.length ? [`${badMissingDrr.length} missing DRR rows are green`] : [],
    samples: badMissingDrr.slice(0, 25)
  });
  addCheck(checks, {
    id: 'indicator:missing-completion-neutral',
    blockingReasons: badMissingCompletion.length ? [`${badMissingCompletion.length} missing completion rows are not neutral`] : [],
    samples: badMissingCompletion.slice(0, 25)
  });
  addCheck(checks, {
    id: 'indicator:estimated-never-green',
    blockingReasons: badEstimatedGreen.length ? [`${badEstimatedGreen.length} estimated metrics are green`] : [],
    samples: badEstimatedGreen.slice(0, 25)
  });
  return reportBase('portal-indicator-audit-v1', dashboardPayload.generatedAt || indicatorAudit.generatedAt || '', dashboardPayload.snapshot_id || indicatorAudit.snapshot_id || '', checks, {
    policy_version: indicatorAudit.policy_version || ''
  });
}

function auditPayloads(payloads, baseDataDir = process.cwd()) {
  const dashboardPayload = payloads.dashboardMetrics || {};
  const cutoffDate = dashboardPayload.cutoffDate || '';
  return {
    repricing: auditRepricer(payloads.canonicalRepricer || {}, baseDataDir, cutoffDate),
    dashboard: auditDashboard(dashboardPayload),
    plan: auditPlan(dashboardPayload),
    indicator: auditIndicators(payloads.indicatorAudit || {}, dashboardPayload)
  };
}

function auditRepricerDashboardPlan(options = resolveOptions({})) {
  const payloads = {
    canonicalRepricer: readJson(path.join(options.inputDir, 'canonical_repricer.json'), { rows: [] }),
    dashboardMetrics: readJson(path.join(options.inputDir, 'portal_dashboard_metrics.json'), { metrics: [] }),
    indicatorAudit: readJson(path.join(options.inputDir, REPORTS.indicator), { rows: [] })
  };
  const reports = auditPayloads(payloads, options.baseDataDir);
  if (!options.noWrite) {
    writeJson(path.join(options.outputDir, REPORTS.repricing), reports.repricing);
    writeJson(path.join(options.outputDir, REPORTS.dashboard), reports.dashboard);
    writeJson(path.join(options.outputDir, REPORTS.plan), reports.plan);
    writeJson(path.join(options.outputDir, REPORTS.indicator), reports.indicator);
  }
  return reports;
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  try {
    const reports = auditRepricerDashboardPlan(options);
    const blocking = Object.values(reports).reduce((sum, report) => sum + (report.summary?.blockingChecks || 0), 0);
    const warnings = Object.values(reports).reduce((sum, report) => sum + (report.summary?.warningChecks || 0), 0);
    console.log(`[phase3-audit] ${blocking ? 'BLOCKED' : 'OK'}: ${blocking} blocking, ${warnings} warning checks`);
    if (blocking && !options.noFail) process.exitCode = 1;
  } catch (error) {
    console.error(`[phase3-audit] fatal: ${error.stack || error.message}`);
    if (!options.noFail) process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  auditRepricerDashboardPlan,
  auditPayloads,
  auditRepricer,
  auditDashboard,
  auditPlan,
  auditIndicators,
  resolveOptions,
  parseArgs,
  addCheck
};
