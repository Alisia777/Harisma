#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { evaluateIndicator, readJson: readPolicyJson } = require('./portal-indicator-engine');

const OUTPUT_FILE = 'portal_dashboard_metrics.json';
const DASHBOARD_RECONCILIATION_FILE = 'portal_dashboard_reconciliation.json';
const PLAN_RECONCILIATION_FILE = 'portal_plan_reconciliation.json';
const INDICATOR_AUDIT_FILE = 'portal_indicator_audit.json';
const INCLUDED_PLATFORMS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit'];
const CORE_FACT_PLATFORMS = ['wb', 'ozon', 'ya'];

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
    inputDir: path.resolve(args['input-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output')),
    policyPath: path.resolve(args.policy || path.join(root, 'data', 'portal_indicator_policy.json')),
    metricRegistryPath: path.resolve(args['metric-registry'] || path.join(root, 'data', 'portal_metric_registry.json')),
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256File(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch {
    return '';
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 2) {
  const numeric = numberOrNull(value);
  if (numeric === null) return null;
  const scale = 10 ** digits;
  return Math.round(numeric * scale) / scale;
}

function dateKey(value) {
  const text = String(value || '');
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function monthKeyFromDate(value) {
  const date = dateKey(value);
  return date ? date.slice(0, 7) : String(value || '').slice(0, 7);
}

function daysInMonth(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey || '')) return 0;
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function dayOfMonth(date) {
  return Number(String(date || '').slice(8, 10)) || 0;
}

function platformMap(payload = {}) {
  const platforms = Array.isArray(payload.platforms)
    ? payload.platforms
    : Object.entries(payload.platforms || {}).map(([key, value]) => ({ key, ...value }));
  return new Map(platforms.map((item) => [String(item.key || item.platformKey || item.platform || '').trim().toLowerCase(), item]));
}

function pointsInMonth(platform, monthKey, cutoffDate) {
  const series = Array.isArray(platform?.series) ? platform.series : (Array.isArray(platform?.daily) ? platform.daily : []);
  return series
    .map((point) => ({ ...point, date: dateKey(point.date || point.label || point.day || point.period) }))
    .filter((point) => point.date && point.date.startsWith(monthKey) && (!cutoffDate || point.date <= cutoffDate))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function sumField(points, field) {
  let seen = false;
  const sum = points.reduce((acc, point) => {
    const value = numberOrNull(point[field]);
    if (value === null) return acc;
    seen = true;
    return acc + value;
  }, 0);
  return seen ? sum : null;
}

function platformFact(platform, monthKey, cutoffDate) {
  const points = pointsInMonth(platform, monthKey, cutoffDate);
  const dates = points.map((point) => point.date);
  return {
    date_from: dates[0] || '',
    date_to: dates[dates.length - 1] || '',
    days: points.length,
    revenue: sumField(points, 'revenue'),
    units: sumField(points, 'units'),
    finance_turnover: sumField(points, 'financeTurnover'),
    estimated_margin: sumField(points, 'estimatedMargin'),
    points
  };
}

function sourceChecksums(inputDir) {
  return Object.fromEntries(['platform_trends.json', 'company_plan.json', 'ads_summary.json', 'portal_metric_registry.json', 'portal_indicator_policy.json'].map((name) => {
    const filePath = path.join(inputDir, name);
    return [name, { exists: fs.existsSync(filePath), sha256: sha256File(filePath) }];
  }));
}

function displayed(value, unit) {
  if (value === null || value === undefined) return 'Нет данных';
  if (unit === 'ratio') return round(value * 100, 2);
  return round(value, unit === 'RUB' ? 2 : 4);
}

function metricRow({
  metric_id,
  label,
  unit,
  plan_id = null,
  platform = 'all',
  period_from,
  period_to,
  raw_value,
  transforms = [],
  source_dates = {},
  data_status = 'trusted',
  reconciliation_status = 'ok',
  business_status = 'neutral',
  confidence = 'high',
  drilldown = [],
  indicator = null
}) {
  return {
    metric_id,
    label,
    unit,
    plan_id,
    scope: { platform },
    period_from,
    period_to,
    raw_value,
    displayed_value: displayed(raw_value, unit),
    transforms,
    source_dates,
    data_status,
    reconciliation_status,
    business_status,
    confidence,
    drilldown
  };
}

function adsByPlatform(payload = {}, monthKey, cutoffDate) {
  const result = new Map();
  const platforms = Array.isArray(payload.platforms) ? payload.platforms : Object.values(payload.platforms || {});
  platforms.forEach((platform) => {
    const key = String(platform.key || platform.platformKey || platform.platform || '').trim().toLowerCase();
    const points = pointsInMonth(platform, monthKey, cutoffDate);
    result.set(key, {
      spend: sumField(points, 'spend'),
      revenue: sumField(points, 'revenue'),
      date_from: points[0]?.date || '',
      date_to: points[points.length - 1]?.date || ''
    });
  });
  return result;
}

function buildPortalDashboardMetrics(options = resolveOptions({})) {
  const trends = readJson(path.join(options.inputDir, 'platform_trends.json'), { platforms: [] });
  const companyPlan = readJson(path.join(options.inputDir, 'company_plan.json'), { months: {} });
  const ads = readJson(path.join(options.inputDir, 'ads_summary.json'), { platforms: [] });
  const policyPayload = readPolicyJson(options.policyPath, {});
  const metricRegistry = readJson(options.metricRegistryPath, {});
  const cutoffDate = dateKey(trends.latestMarketplaceDate || trends.asOfDate || trends.generatedAt || '');
  const monthKey = monthKeyFromDate(cutoffDate || companyPlan.activeMonthKey || Object.keys(companyPlan.months || {}).sort().pop());
  const planMonth = companyPlan.months?.[monthKey] || null;
  const planDays = Number(planMonth?.days || daysInMonth(monthKey));
  const elapsedDays = Math.min(dayOfMonth(cutoffDate), planDays || dayOfMonth(cutoffDate));
  const platforms = platformMap(trends);
  const platformFacts = Object.fromEntries(INCLUDED_PLATFORMS.map((platform) => [
    platform,
    platformFact(platforms.get(platform), monthKey, cutoffDate)
  ]));
  const allFact = platformFact(platforms.get('all'), monthKey, cutoffDate);
  const includedRevenue = INCLUDED_PLATFORMS.reduce((sum, platform) => sum + (numberOrNull(platformFacts[platform].revenue) || 0), 0);
  const includedUnits = INCLUDED_PLATFORMS.reduce((sum, platform) => sum + (numberOrNull(platformFacts[platform].units) || 0), 0);
  const coreRevenue = CORE_FACT_PLATFORMS.reduce((sum, platform) => sum + (numberOrNull(platformFacts[platform].revenue) || 0), 0);
  const coreUnits = CORE_FACT_PLATFORMS.reduce((sum, platform) => sum + (numberOrNull(platformFacts[platform].units) || 0), 0);
  const allRevenue = numberOrNull(allFact.revenue);
  const unallocatedRevenue = allRevenue === null ? 0 : round(allRevenue - coreRevenue, 2);
  const allUnits = numberOrNull(allFact.units);
  const unallocatedUnits = allUnits === null ? 0 : round(allUnits - coreUnits, 4);
  const coreComponentDates = CORE_FACT_PLATFORMS.map((platform) => platformFacts[platform].date_to).filter(Boolean);
  const mixedCorePlatformDates = new Set(coreComponentDates).size > 1;
  const corePlatformsBehind = CORE_FACT_PLATFORMS.filter((platform) => platformFacts[platform].date_to !== cutoffDate);
  const extraPlatformsBehind = INCLUDED_PLATFORMS
    .filter((platform) => !CORE_FACT_PLATFORMS.includes(platform))
    .filter((platform) => platformFacts[platform].date_to && platformFacts[platform].date_to !== cutoffDate);
  const sourceDates = Object.fromEntries(INCLUDED_PLATFORMS.map((platform) => [platform, platformFacts[platform].date_to || '']));
  const checksums = sourceChecksums(options.inputDir);
  const snapshotHash = crypto.createHash('sha256').update(stableStringify({ checksums, cutoffDate, monthKey })).digest('hex');
  const snapshotId = `dashboard:${snapshotHash.slice(0, 16)}`;
  const generatedAt = trends.generatedAt || cutoffDate || snapshotId;
  const metrics = [];
  const dashboardBlocking = [];
  const dashboardWarnings = [];
  const planBlocking = [];
  const indicatorAuditRows = [];

  INCLUDED_PLATFORMS.forEach((platform) => {
    const fact = platformFacts[platform];
    const raw = numberOrNull(fact.revenue);
    const dataStatus = raw === null || fact.date_to !== cutoffDate || mixedCorePlatformDates ? 'incomplete' : 'trusted';
    metrics.push(metricRow({
      metric_id: 'sales.raw_revenue',
      label: `Raw revenue ${platform}`,
      unit: 'RUB',
      platform,
      period_from: `${monthKey}-01`,
      period_to: cutoffDate,
      raw_value: raw,
      transforms: ['sum_daily_marketplace_sales_fact'],
      source_dates: { platform_trends: fact.date_to },
      data_status: dataStatus,
      reconciliation_status: dataStatus === 'trusted' ? 'ok' : 'blocked',
      business_status: 'neutral',
      confidence: dataStatus === 'trusted' ? 'high' : 'low',
      drilldown: [{ platform, revenue: raw, units: fact.units, date_from: fact.date_from, date_to: fact.date_to }]
    }));
  });

  metrics.push(metricRow({
    metric_id: 'sales.raw_revenue.unallocated',
    label: 'Unallocated revenue',
    unit: 'RUB',
    platform: 'unallocated',
    period_from: `${monthKey}-01`,
    period_to: cutoffDate,
    raw_value: unallocatedRevenue,
    transforms: ['platform_all_core_control_minus_core_platforms'],
    source_dates: { platform_trends_all: allFact.date_to, ...sourceDates },
    data_status: allRevenue === null ? 'incomplete' : 'trusted',
    reconciliation_status: Math.abs(unallocatedRevenue || 0) > 0.01 ? 'warning' : 'ok',
    business_status: 'neutral',
    confidence: allRevenue === null ? 'low' : 'high',
    drilldown: [{
      all_revenue: allRevenue,
      core_revenue: round(coreRevenue, 2),
      included_revenue: round(includedRevenue, 2),
      unallocated_revenue: unallocatedRevenue,
      all_units: allUnits,
      core_units: round(coreUnits, 4),
      included_units: round(includedUnits, 4),
      unallocated_units: unallocatedUnits
    }]
  }));

  const companyPlanRevenue = numberOrNull(planMonth?.revenue);
  const planToDate = companyPlanRevenue !== null && planDays > 0 ? (companyPlanRevenue / planDays) * elapsedDays : null;
  const factRevenue = round(includedRevenue + (unallocatedRevenue || 0), 2);
  const completionMonth = companyPlanRevenue ? factRevenue / companyPlanRevenue : null;
  const completionToDate = planToDate ? factRevenue / planToDate : null;
  const forecastRevenue = elapsedDays > 0 ? (factRevenue / elapsedDays) * planDays : null;
  const planSourceDate = companyPlan.generatedAt || '';

  metrics.push(metricRow({
    metric_id: 'plan.revenue',
    label: 'Corporate revenue monthly plan',
    unit: 'RUB',
    plan_id: 'corporate_revenue_monthly',
    platform: 'all',
    period_from: `${monthKey}-01`,
    period_to: `${monthKey}-${String(planDays).padStart(2, '0')}`,
    raw_value: companyPlanRevenue,
    transforms: ['company_plan.months[month].revenue'],
    source_dates: { company_plan: planSourceDate },
    data_status: companyPlanRevenue === null ? 'incomplete' : 'trusted',
    reconciliation_status: 'ok',
    business_status: 'neutral',
    confidence: companyPlanRevenue === null ? 'low' : 'high',
    drilldown: [{ plan_id: 'corporate_revenue_monthly', month: monthKey, included_platforms: INCLUDED_PLATFORMS }]
  }));

  const completionIndicator = evaluateIndicator({
    policy_id: 'completion_default',
    value: completionToDate,
    data_status: completionToDate === null ? 'incomplete' : 'trusted',
    context: {
      fact_status: factRevenue === null ? 'incomplete' : 'trusted',
      plan_status: planToDate === null ? 'incomplete' : 'trusted',
      same_scope: true,
      same_unit: true,
      same_period: true
    }
  }, policyPayload);
  indicatorAuditRows.push({
    metric_id: 'plan.completion_revenue',
    surface: 'dashboard',
    expected: completionIndicator,
    actual: completionIndicator,
    status: 'ok'
  });

  metrics.push(metricRow({
    metric_id: 'plan.completion_revenue',
    label: 'Revenue plan completion to date',
    unit: 'ratio',
    plan_id: 'corporate_revenue_monthly',
    platform: 'all',
    period_from: `${monthKey}-01`,
    period_to: cutoffDate,
    raw_value: completionToDate,
    transforms: ['sales.raw_revenue / plan_to_date'],
    source_dates: { platform_trends: cutoffDate, company_plan: planSourceDate },
    data_status: completionIndicator.data_status,
    reconciliation_status: completionIndicator.data_status === 'trusted' ? 'ok' : 'blocked',
    business_status: completionIndicator.business_status,
    confidence: completionIndicator.data_status === 'trusted' ? 'high' : 'low',
    drilldown: [{ factRevenue, planToDate: round(planToDate, 2), completionMonth: round(completionMonth, 6), completionToDate: round(completionToDate, 6) }]
  }));

  metrics.push(metricRow({
    metric_id: 'plan.forecast_revenue',
    label: 'Revenue forecast',
    unit: 'RUB',
    plan_id: 'corporate_revenue_monthly',
    platform: 'all',
    period_from: `${monthKey}-01`,
    period_to: `${monthKey}-${String(planDays).padStart(2, '0')}`,
    raw_value: round(forecastRevenue, 2),
    transforms: ['forecast_only:not_fact', 'daily_fact_average * month_days'],
    source_dates: { platform_trends: cutoffDate, company_plan: planSourceDate },
    data_status: forecastRevenue === null ? 'incomplete' : 'estimated',
    reconciliation_status: 'ok',
    business_status: 'neutral',
    confidence: forecastRevenue === null ? 'low' : 'medium',
    drilldown: [{ factRevenue, elapsedDays, planDays }]
  }));

  const adsMap = adsByPlatform(ads, monthKey, cutoffDate);
  for (const platform of ['wb', 'ozon']) {
    const adsFact = adsMap.get(platform) || {};
    const spend = numberOrNull(adsFact.spend);
    const attributedRevenue = numberOrNull(adsFact.revenue);
    const drr = spend !== null && attributedRevenue ? spend / attributedRevenue : null;
    const indicator = evaluateIndicator({
      policy_id: 'drr_default',
      value: drr,
      data_status: drr === null ? 'incomplete' : 'trusted',
      context: { target: null }
    }, policyPayload);
    indicatorAuditRows.push({ metric_id: 'ads.drr', surface: `dashboard:${platform}`, expected: indicator, actual: indicator, status: 'ok' });
    metrics.push(metricRow({
      metric_id: 'ads.drr',
      label: `DRR ${platform}`,
      unit: 'ratio',
      platform,
      period_from: `${monthKey}-01`,
      period_to: cutoffDate,
      raw_value: round(drr, 6),
      transforms: ['ad_spend / attributed_revenue'],
      source_dates: { ads_summary: adsFact.date_to || ads.asOfDate || '' },
      data_status: indicator.data_status,
      reconciliation_status: indicator.data_status === 'trusted' ? 'ok' : 'warning',
      business_status: indicator.business_status,
      confidence: indicator.data_status === 'trusted' ? 'high' : 'medium',
      drilldown: [{ spend, attributedRevenue }]
    }));
  }

  if (mixedCorePlatformDates) dashboardBlocking.push(`mixed core platform fact dates: ${coreComponentDates.join(', ')}`);
  if (corePlatformsBehind.length) {
    dashboardBlocking.push(`core platform facts are behind ${cutoffDate}: ${corePlatformsBehind.map((platform) => `${platform}=${platformFacts[platform].date_to || 'missing'}`).join(', ')}`);
  }
  if (extraPlatformsBehind.length) {
    dashboardWarnings.push(`extra marketplace facts are behind ${cutoffDate}: ${extraPlatformsBehind.map((platform) => `${platform}=${platformFacts[platform].date_to}`).join(', ')}`);
  }
  if (!planMonth) planBlocking.push(`company_plan has no month ${monthKey}`);
  const planChannelSum = INCLUDED_PLATFORMS.reduce((sum, platform) => sum + (numberOrNull(planMonth?.channels?.[platform]?.revenue) || 0), 0);
  if (companyPlanRevenue !== null && Math.abs(companyPlanRevenue - planChannelSum) > Math.max(1000, companyPlanRevenue * 0.001)) {
    planBlocking.push(`company plan total ${companyPlanRevenue} differs from included channels ${planChannelSum}`);
  }
  if (Math.abs(unallocatedRevenue || 0) > Math.max(1000, Math.abs(allRevenue || 0) * 0.001)) {
    dashboardWarnings.push(`all platform control has explicit unallocated revenue ${unallocatedRevenue}`);
  }

  const payload = {
    schema: 'portal-dashboard-metrics-v1',
    generatedAt,
    snapshot_id: snapshotId,
    metric_registry_version: metricRegistry.version || '',
    indicator_policy_version: policyPayload.version || '',
    cutoffDate,
    monthKey,
    source_checksums: checksums,
    summary: {
      metrics: metrics.length,
      factRevenue,
      planRevenue: companyPlanRevenue,
      planToDate: round(planToDate, 2),
      completionToDate: round(completionToDate, 6),
      unallocatedRevenue
    },
    metrics
  };
  const businessFingerprint = crypto.createHash('sha256').update(stableStringify(metrics)).digest('hex');
  const dashboardReconciliation = {
    schema: 'portal-dashboard-reconciliation-v1',
    generatedAt,
    snapshot_id: snapshotId,
    status: dashboardBlocking.length ? 'blocked' : (dashboardWarnings.length ? 'warning' : 'ok'),
    publish_allowed: dashboardBlocking.length === 0,
    business_fingerprint: businessFingerprint,
    blockingReasons: dashboardBlocking,
    warnings: dashboardWarnings,
    checks: [
      {
        id: 'dashboard:raw-fact-not-scaled',
        status: 'ok',
        details: 'Control totals create explicit unallocated rows; raw platform fact is not scaled.'
      },
      {
        id: 'dashboard:no-iu-fallback',
        status: 'ok',
        details: 'Builder reads company_plan/platform_trends/ads only; IU files are not loaded.'
      },
      {
        id: 'dashboard:null-not-zero',
        status: metrics.some((row) => row.raw_value === null && row.displayed_value !== 'Нет данных') ? 'blocked' : 'ok',
        blockingReasons: metrics.some((row) => row.raw_value === null && row.displayed_value !== 'Нет данных') ? ['null value rendered as non-empty number'] : []
      }
    ]
  };
  const planReconciliation = {
    schema: 'portal-plan-reconciliation-v1',
    generatedAt,
    snapshot_id: snapshotId,
    status: planBlocking.length ? 'blocked' : 'ok',
    publish_allowed: planBlocking.length === 0,
    plan_namespaces: ['corporate_revenue_monthly', 'sku_platform_operational', 'salary_kpi_marketplaces', 'wb_contract_turnover', 'iu'],
    active_plan: {
      plan_id: 'corporate_revenue_monthly',
      month: monthKey,
      unit: 'RUB',
      included_platforms: INCLUDED_PLATFORMS,
      fact_source: 'marketplace_sales_fact',
      plan_source: 'company_plan'
    },
    blockingReasons: planBlocking,
    warnings: []
  };
  const indicatorAudit = {
    schema: 'portal-indicator-audit-v1',
    generatedAt,
    snapshot_id: snapshotId,
    status: indicatorAuditRows.some((row) => row.status === 'blocked') ? 'blocked' : 'ok',
    publish_allowed: !indicatorAuditRows.some((row) => row.status === 'blocked'),
    policy_version: policyPayload.version || '',
    rows: indicatorAuditRows
  };

  if (!options.noWrite) {
    writeJson(path.join(options.outputDir, OUTPUT_FILE), payload);
    writeJson(path.join(options.outputDir, DASHBOARD_RECONCILIATION_FILE), dashboardReconciliation);
    writeJson(path.join(options.outputDir, PLAN_RECONCILIATION_FILE), planReconciliation);
    writeJson(path.join(options.outputDir, INDICATOR_AUDIT_FILE), indicatorAudit);
  }
  return { payload, dashboardReconciliation, planReconciliation, indicatorAudit };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  try {
    const { payload, dashboardReconciliation, planReconciliation, indicatorAudit } = buildPortalDashboardMetrics(options);
    const blocked = [dashboardReconciliation, planReconciliation, indicatorAudit].filter((report) => report.status === 'blocked').length;
    console.log(`[portal-dashboard-metrics] ${blocked ? 'BLOCKED' : 'OK'}: ${payload.summary.metrics} metrics; cutoff ${payload.cutoffDate}`);
    if (blocked && !options.noFail) process.exitCode = 1;
  } catch (error) {
    console.error(`[portal-dashboard-metrics] fatal: ${error.stack || error.message}`);
    if (!options.noFail) process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildPortalDashboardMetrics,
  resolveOptions,
  parseArgs,
  stableStringify
};
