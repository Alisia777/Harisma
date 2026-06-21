#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseArgs,
  readJson,
  writeJson,
  dateKey,
  deterministicIso,
  sha256Text,
  stableStringify,
  passportMap,
  passportsArray,
  worstStatus,
  numberOrNull
} = require('./portal-freshness-core');

function resolveOptions(args = parseArgs(process.argv)) {
  const root = process.cwd();
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, 'data')),
    passportDir: path.resolve(args['passport-dir'] || args['output-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, 'data')),
    noWrite: Boolean(args['no-write'])
  };
}

function readJsonFromDirs(fileName, dirs, fallback = {}) {
  for (const dir of dirs) {
    const filePath = path.join(dir, fileName);
    if (fs.existsSync(filePath)) return readJson(filePath, fallback);
  }
  return fallback;
}

function metricStatusForLayer(layer, layers) {
  const passport = layers.get(layer);
  if (!passport) return { status: 'unknown', sourceAsOf: null, batchId: null, warnings: [`${layer}: missing layer passport`] };
  const status = passport.status === 'verified' ? 'verified' : passport.status;
  const warnings = [...(passport.warnings || []), ...(passport.blockingReasons || [])];
  return { status, sourceAsOf: passport.sourceAsOf, batchId: passport.batchId, warnings };
}

function pushMetric(metrics, layers, metricId, value, sourceLayer, periodFrom, periodTo, formulaVersion, consumers = []) {
  const source = metricStatusForLayer(sourceLayer, layers);
  metrics.push({
    metricId,
    value,
    status: source.status,
    sourceLayer,
    sourceAsOf: source.sourceAsOf,
    periodFrom: periodFrom || source.sourceAsOf,
    periodTo: periodTo || source.sourceAsOf,
    formulaVersion,
    batchId: source.batchId,
    consumers,
    warnings: source.warnings
  });
}

function activeCompanyMonth(companyPlan) {
  const active = companyPlan?.activeMonthKey;
  if (active && companyPlan?.months?.[active]) return { key: active, month: companyPlan.months[active] };
  const entries = Object.entries(companyPlan?.months || {}).sort();
  const last = entries[entries.length - 1];
  return last ? { key: last[0], month: last[1] } : { key: '', month: null };
}

function buildMetricPassports(options = resolveOptions()) {
  const layerReport = readJsonFromDirs('portal_layer_passports.json', [options.passportDir, options.outputDir, options.inputDir], { passports: [] });
  const layers = passportMap(layerReport);
  const dashboard = readJson(path.join(options.inputDir, 'dashboard.json'), {});
  const companyPlan = readJson(path.join(options.inputDir, 'company_plan.json'), {});
  const repricer = readJson(path.join(options.inputDir, 'repricer.json'), {});
  const metrics = [];
  const dashboardDate = dateKey(dashboard?.dataFreshness?.asOfDate || dashboard?.latestMarketplaceDate || dashboard?.asOfDate);

  (Array.isArray(dashboard?.cards) ? dashboard.cards : []).forEach((card) => {
    pushMetric(
      metrics,
      layers,
      `dashboard.card.${card.id || sha256Text(String(card.label || '')).slice(0, 8)}`,
      card.value ?? null,
      'dashboard',
      dashboardDate,
      dashboardDate,
      'dashboard-card-v1',
      ['dashboard.cards', 'dashboard.export', 'dashboard.table']
    );
  });

  const brandSummary = Array.isArray(dashboard?.brandSummary) ? dashboard.brandSummary[0] : null;
  Object.entries(brandSummary || {}).forEach(([key, value]) => {
    if (typeof value === 'number') {
      pushMetric(metrics, layers, `dashboard.brandSummary.${key}`, value, 'dashboard', dashboardDate, dashboardDate, 'dashboard-brand-summary-v1', ['dashboard.table', 'dashboard.export']);
    }
  });

  const active = activeCompanyMonth(companyPlan);
  if (active.month) {
    pushMetric(metrics, layers, `plan.company.${active.key}.revenue`, active.month.revenue ?? null, 'company_plan', `${active.key}-01`, `${active.key}-31`, 'company-plan-v1', ['dashboard.cards', 'plan.table', 'plan.export']);
    Object.entries(active.month.channels || {}).forEach(([channel, payload]) => {
      pushMetric(metrics, layers, `plan.company.${active.key}.${channel}.revenue`, payload?.revenue ?? null, 'company_plan', `${active.key}-01`, `${active.key}-31`, 'company-plan-channel-v1', ['dashboard.cards', 'plan.table', 'plan.export']);
    });
  }

  Object.entries(repricer?.summary || {}).forEach(([key, value]) => {
    if (typeof value === 'number') pushMetric(metrics, layers, `repricer.summary.${key}`, value, 'repricer', null, null, 'repricer-summary-v1', ['repricer.cards', 'repricer.export']);
  });

  const generatedAt = deterministicIso(dashboardDate || layerReport.referenceDate || dateKey(layerReport.generatedAt)) || '1970-01-01T00:00:00.000Z';
  const report = {
    schema: 'portal-metric-passports-v1',
    generatedAt,
    sourceLayerPassportFingerprint: layerReport.fingerprint || '',
    metricCount: metrics.length,
    metrics: metrics.sort((left, right) => left.metricId.localeCompare(right.metricId)),
    fingerprint: sha256Text(stableStringify(metrics.map((metric) => ({
      metricId: metric.metricId,
      value: metric.value,
      status: metric.status,
      sourceAsOf: metric.sourceAsOf,
      batchId: metric.batchId
    }))))
  };

  const dashboardRecon = buildDashboardMetricReconciliation(report, layers, dashboard);
  const repricerRecon = buildRepricerDependencyReconciliation({ inputDir: options.inputDir, layers });
  const baselineReports = buildBaselineUploadReports(options, layers);

  if (!options.noWrite) {
    writeJson(path.join(options.outputDir, 'portal_metric_passports.json'), report);
    writeJson(path.join(options.outputDir, 'portal_dashboard_metric_reconciliation.json'), dashboardRecon);
    writeJson(path.join(options.outputDir, 'portal_repricer_dependency_reconciliation.json'), repricerRecon);
    Object.entries(baselineReports).forEach(([file, payload]) => writeJson(path.join(options.outputDir, file), payload));
  }
  return { metricPassports: report, dashboardRecon, repricerRecon, baselineReports };
}

function minDate(values) {
  const dates = values.map(dateKey).filter(Boolean).sort();
  return dates[0] || '';
}

function buildDashboardMetricReconciliation(metricReport, layers, dashboard) {
  const dashboardPassport = layers.get('dashboard');
  const platformPassport = layers.get('platform_trends');
  const requiredDates = [dashboardPassport?.sourceAsOf, platformPassport?.sourceAsOf].filter(Boolean);
  const effectiveTo = minDate(requiredDates);
  const dashboardCutoff = dateKey(dashboard?.dataFreshness?.asOfDate || dashboard?.latestMarketplaceDate || dashboard?.asOfDate);
  const blockingReasons = [];
  if (!metricReport.metrics.length) blockingReasons.push('dashboard metrics: no metric passports were built');
  if (effectiveTo && dashboardCutoff && dashboardCutoff !== effectiveTo) {
    blockingReasons.push(`dashboard chart cutoff mismatch: dashboard=${dashboardCutoff}, common=${effectiveTo}`);
  }
  const missingPassportMetrics = metricReport.metrics.filter((metric) => !metric.batchId || !metric.sourceAsOf).length;
  if (missingPassportMetrics) blockingReasons.push(`dashboard metrics: ${missingPassportMetrics} metrics have no source passport`);
  return {
    schema: 'portal-dashboard-metric-reconciliation-v1',
    generatedAt: metricReport.generatedAt,
    status: blockingReasons.length ? 'blocked' : 'ok',
    metricPassportFile: 'portal_metric_passports.json',
    metricPassportFingerprint: metricReport.fingerprint,
    summary: {
      metricCount: metricReport.metricCount,
      missingPassportMetrics,
      blockingChecks: blockingReasons.length
    },
    chartCutoff: {
      effectiveTo,
      sourceDates: {
        dashboard: dashboardPassport?.sourceAsOf || null,
        platform_trends: platformPassport?.sourceAsOf || null
      },
      watermark: effectiveTo ? `sourceAsOf ${effectiveTo}` : 'sourceAsOf unknown'
    },
    blockingReasons,
    metrics: metricReport.metrics.map((metric) => ({
      metricId: metric.metricId,
      sourceLayer: metric.sourceLayer,
      sourceAsOf: metric.sourceAsOf,
      consumers: metric.consumers
    }))
  };
}

function dependencyStatusForLayer(layers, layer) {
  const passport = layers.get(layer);
  if (!passport) return { status: 'unknown', batchId: null, sourceAsOf: null };
  return { status: passport.status, batchId: passport.batchId, sourceAsOf: passport.sourceAsOf };
}

function sideDependencyDecision(row, platform, side, layers) {
  const deps = {
    prices: dependencyStatusForLayer(layers, 'prices'),
    min_max_registry: dependencyStatusForLayer(layers, 'min_max_registry'),
    cost_registry: dependencyStatusForLayer(layers, 'cost_registry'),
    sku_matrix: dependencyStatusForLayer(layers, 'sku_matrix'),
    warehouse_stock_overlay: dependencyStatusForLayer(layers, 'warehouse_stock_overlay'),
    repricer: dependencyStatusForLayer(layers, 'repricer')
  };
  const reasons = [];
  if (!(numberOrNull(side?.currentPrice) > 0)) reasons.push('missing_current_seller_price');
  if (!(numberOrNull(side?.minPrice) > 0 || numberOrNull(side?.workingZoneFrom) > 0)) reasons.push('missing_min_max_floor');
  if (!(numberOrNull(row?.cost) > 0 || numberOrNull(side?.requiredPriceForProfitability) > 0 || numberOrNull(side?.requiredPriceForMargin) > 0)) reasons.push('missing_cost_or_economic_floor');
  if (!row?.articleKey) reasons.push('missing_sku_mapping');
  if (side?.stockGateBlocksAutoprice) reasons.push('stock_gate_blocks_autoprice');
  ['prices', 'min_max_registry', 'cost_registry', 'sku_matrix', 'warehouse_stock_overlay'].forEach((layer) => {
    if (deps[layer].status !== 'verified') reasons.push(`${layer}_${deps[layer].status || 'unknown'}`);
  });
  const status = reasons.length
    ? (reasons.some((reason) => reason.includes('stale')) ? 'stale' : (reasons.some((reason) => reason.includes('unknown') || reason.includes('missing')) ? 'unknown' : 'blocked'))
    : 'verified';
  const sourceAsOf = minDate(Object.values(deps).map((dep) => dep.sourceAsOf));
  return {
    platform,
    articleKey: row?.articleKey || row?.article || '',
    decisionStatus: status,
    blockingReasons: reasons,
    dependencyBatchIds: Object.fromEntries(Object.entries(deps).map(([key, dep]) => [key, dep.batchId])),
    sourceAsOf: sourceAsOf || null,
    formulaVersion: 'repricer-dependency-gate-v1',
    executable: status === 'verified'
  };
}

function buildRepricerDependencyReconciliation({ inputDir, layers }) {
  const repricer = readJson(path.join(inputDir, 'repricer.json'), { rows: [] });
  const sides = [];
  (Array.isArray(repricer.rows) ? repricer.rows : []).forEach((row) => {
    ['wb', 'ozon'].forEach((platform) => {
      if (!row?.[platform]) return;
      const decision = sideDependencyDecision(row, platform, row[platform], layers);
      const legacyExecutable = row[platform].exportable === true || row[platform].safeToExport === true || row[platform].promoSafeToExport === true;
      sides.push({ ...decision, legacyExecutable });
    });
  });
  const unsafeExecutable = sides.filter((side) => side.legacyExecutable && side.decisionStatus !== 'verified');
  const status = unsafeExecutable.length ? 'blocked' : (sides.some((side) => side.decisionStatus !== 'verified') ? 'warning' : 'ok');
  return {
    schema: 'portal-repricer-dependency-reconciliation-v1',
    generatedAt: deterministicIso(minDate(sides.map((side) => side.sourceAsOf)) || dateKey(repricer.generatedAt)) || '1970-01-01T00:00:00.000Z',
    status,
    summary: {
      sideCount: sides.length,
      verified: sides.filter((side) => side.decisionStatus === 'verified').length,
      manualReview: sides.filter((side) => side.decisionStatus === 'manual_review').length,
      blocked: sides.filter((side) => side.decisionStatus === 'blocked').length,
      stale: sides.filter((side) => side.decisionStatus === 'stale').length,
      unknown: sides.filter((side) => side.decisionStatus === 'unknown').length,
      executableCount: sides.filter((side) => side.executable).length,
      unsafeExecutableCount: unsafeExecutable.length
    },
    blockingReasons: unsafeExecutable.map((side) => `${side.articleKey}/${side.platform}: executable repricer recommendation without verified dependencies`),
    sides: sides.slice(0, 500)
  };
}

function buildBaselineUploadReports(options, layers) {
  const minMax = layers.get('min_max_registry');
  const cost = layers.get('cost_registry');
  const issues = readJson(path.join(options.inputDir, 'portal_upload_issues.json'), {
    schema: 'portal-upload-issues-v1',
    generatedAt: deterministicIso(minDate([minMax?.sourceAsOf, cost?.sourceAsOf]) || '1970-01-01'),
    currentBatchId: null,
    issues: []
  });
  return {
    'portal_upload_health.json': {
      schema: 'portal-upload-health-v1',
      status: 'ok',
      currentBatchId: null,
      message: 'No current upload batch in this build.',
      unresolvedBlockingIssues: (issues.issues || []).filter((issue) => issue.status === 'open' && issue.severity !== 'warning').length,
      productionWritesBeforePromote: false
    },
    'portal_upload_issues.json': issues,
    'portal_min_max_reconciliation.json': {
      schema: 'portal-min-max-reconciliation-v1',
      status: minMax?.status === 'blocked' && minMax?.blockingMode !== 'manual_review' ? 'blocked' : 'ok',
      batchId: minMax?.batchId || null,
      sourceAsOf: minMax?.sourceAsOf || null,
      acceptedRows: minMax?.acceptedRows || 0,
      rejectedRows: minMax?.rejectedRows || 0,
      blockingIssues: minMax?.status === 'blocked' && minMax?.blockingMode !== 'manual_review' ? 1 : 0
    },
    'portal_cost_reconciliation.json': {
      schema: 'portal-cost-reconciliation-v1',
      status: cost?.status === 'blocked' && cost?.blockingMode !== 'manual_review' ? 'blocked' : 'ok',
      batchId: cost?.batchId || null,
      sourceAsOf: cost?.sourceAsOf || null,
      acceptedRows: cost?.acceptedRows || 0,
      rejectedRows: cost?.rejectedRows || 0,
      blockingIssues: cost?.status === 'blocked' && cost?.blockingMode !== 'manual_review' ? 1 : 0
    }
  };
}

function main() {
  try {
    const result = buildMetricPassports(resolveOptions());
    console.log(`[portal-metric-passports] ${result.metricPassports.metricCount} metrics, dashboard ${result.dashboardRecon.status}, repricer ${result.repricerRecon.status}`);
  } catch (error) {
    console.error(`[portal-metric-passports] fatal: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  resolveOptions,
  buildMetricPassports,
  buildDashboardMetricReconciliation,
  buildRepricerDependencyReconciliation
};
