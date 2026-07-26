#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { canonicalOwnerName, canonicalOwnerForPlatform } = require('./owner-normalization');
const { resolvePlanScopePlatforms } = require('./build-portal-dashboard-metrics');

const OUTPUT_FILE = 'dashboard.json';
const PLATFORMS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit'];

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
    outputDir: path.resolve(args['output-dir'] || path.join(root, 'data')),
    outputFile: args['output-file'] ? path.resolve(args['output-file']) : ''
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

function dayOfMonth(value) {
  return Number(String(value || '').slice(8, 10)) || 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function round(value, digits = 2) {
  const numeric = numberOrNull(value);
  if (numeric === null) return null;
  const scale = 10 ** digits;
  return Math.round(numeric * scale) / scale;
}

function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.skus)) return payload.skus;
  return [];
}

function metricRow(metricsPayload, metricId, platform = 'all') {
  return (Array.isArray(metricsPayload?.metrics) ? metricsPayload.metrics : []).find((row) => (
    row?.metric_id === metricId
    && String(row?.scope?.platform || 'all').toLowerCase() === platform
  )) || null;
}

function metricValue(metricsPayload, metricId, platform = 'all') {
  return numberOrNull(metricRow(metricsPayload, metricId, platform)?.raw_value);
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
  const sum = points.reduce((total, point) => {
    const value = numberOrNull(point?.[field]);
    if (value === null) return total;
    seen = true;
    return total + value;
  }, 0);
  return seen ? sum : null;
}

function platformFact(trends, platform, monthKey, cutoffDate) {
  const points = pointsInMonth(platformMap(trends).get(platform), monthKey, cutoffDate);
  return {
    dateFrom: points[0]?.date || '',
    dateTo: points[points.length - 1]?.date || '',
    revenue: round(sumField(points, 'revenue'), 2),
    units: round(sumField(points, 'units'), 4)
  };
}

function ownerNames(sku = {}) {
  const names = [];
  const add = (value) => {
    const text = typeof value === 'object' ? value?.name : value;
    const name = canonicalOwnerName(text);
    if (name) names.push(name);
  };
  add(sku.owner);
  Object.values(sku.owner?.byPlatform || {}).forEach(add);
  Object.values(sku.ownersByPlatform || {}).forEach(add);
  return [...new Set(names)];
}

function platformOwner(sku = {}, platform = '') {
  const aliases = platform === 'ya' ? ['ya', 'ym', 'yandex'] : [platform];
  const fallbackOwner = ownerNames(sku)[0] || '';
  for (const key of aliases) {
    const direct = String(sku.ownersByPlatform?.[key] || sku.owner?.byPlatform?.[key] || '').trim();
    if (direct) return canonicalOwnerForPlatform(direct, key, fallbackOwner);
  }
  return fallbackOwner;
}

function marketplaceStock(sku = {}) {
  return ['wb', 'ozon', 'ya', 'ym', 'ga', 'goldapple', 'letu', 'megamarket', 'samokat', 'mm', 'magnit'].reduce((sum, platform) => (
    sum + numberOrZero(sku?.[platform]?.stock || sku?.[platform]?.stockProducts || sku?.[platform]?.inStock)
  ), 0);
}

function companyPlanControlTotals(companyPlan = {}) {
  return Object.fromEntries(Object.entries(companyPlan.months || {}).map(([monthKey, month]) => [
    monthKey,
    {
      revenue: numberOrZero(month?.revenue),
      wb: numberOrZero(month?.channels?.wb?.revenue),
      ozon: numberOrZero(month?.channels?.ozon?.revenue),
      ya: numberOrZero(month?.channels?.ya?.revenue),
      goldapple: numberOrZero(month?.channels?.goldapple?.revenue),
      letu: numberOrZero(month?.channels?.letu?.revenue),
      megamarket: numberOrZero(month?.channels?.megamarket?.revenue),
      samokat: numberOrZero(month?.channels?.samokat?.revenue),
      magnit: numberOrZero(month?.channels?.magnit?.revenue)
    }
  ]));
}

function buildCompanyPlanSlice(companyPlan = {}, monthKey = '', cutoffDate = '', factRevenue = 0) {
  const month = companyPlan.months?.[monthKey] || {};
  const planDays = Number(month.days || daysInMonth(monthKey));
  const elapsedDays = Math.min(dayOfMonth(cutoffDate), planDays || dayOfMonth(cutoffDate));
  const planRevenueMonth = numberOrZero(month.revenue);
  const planRevenueToDate = planRevenueMonth && planDays ? (planRevenueMonth / planDays) * elapsedDays : 0;
  const completionMonthPct = planRevenueMonth ? factRevenue / planRevenueMonth : 0;
  const completionToDatePct = planRevenueToDate ? factRevenue / planRevenueToDate : 0;
  const forecastRevenue = elapsedDays ? (factRevenue / elapsedDays) * planDays : 0;
  const forecastPct = planRevenueMonth ? forecastRevenue / planRevenueMonth : 0;
  return {
    ...month,
    monthKey,
    label: month.label || monthKey,
    days: planDays,
    revenue: planRevenueMonth,
    channels: month.channels || {},
    planRevenueMonth: round(planRevenueMonth, 2),
    planRevenueToDate: round(planRevenueToDate, 2),
    factRevenueToDate: round(factRevenue, 2),
    completionMonthPct: round(completionMonthPct, 6),
    completionToDatePct: round(completionToDatePct, 6),
    forecastRevenue: round(forecastRevenue, 2),
    forecastPct: round(forecastPct, 6)
  };
}

function buildFocusTop(skus = []) {
  return rowsOf(skus)
    .map((sku) => ({
      article: sku.article || sku.articleKey || '',
      articleKey: sku.articleKey || sku.article || '',
      brand: sku.brand || '',
      product_name_final: sku.name || sku.article || sku.articleKey || '',
      focus_score: numberOrZero(sku.focusScore),
      focus_reasons: sku.focusReasons || '',
      total_mp_stock: marketplaceStock(sku),
      owner_name: ownerNames(sku)[0] || '',
      owner_wb: platformOwner(sku, 'wb'),
      owner_ozon: platformOwner(sku, 'ozon'),
      owner_ya: platformOwner(sku, 'ya'),
      fact_revenue_to_date: numberOrZero(sku.planFact?.factTotalRevenue || sku.planFact?.factRevenueToDate)
    }))
    .filter((row) => row.articleKey)
    .sort((left, right) => (
      right.focus_score - left.focus_score
      || right.fact_revenue_to_date - left.fact_revenue_to_date
      || left.articleKey.localeCompare(right.articleKey)
    ))
    .slice(0, 24);
}

function buildCards({
  metrics,
  skus,
  warehouse,
  cutoffDate,
  monthKey,
  planSlice,
  planScopePlatforms,
  planScopeFactRevenue,
  allChannelFactRevenue
}) {
  const cards = [];
  const seen = new Set();
  const add = (card) => {
    const id = String(card.id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    cards.push({ ...card, id, metricId: card.metricId || id });
  };
  const skuRows = rowsOf(skus);
  const assignedSku = skuRows.filter((sku) => ownerNames(sku).length > 0).length;
  const totalMarketplaceStock = skuRows.reduce((sum, sku) => sum + marketplaceStock(sku), 0);
  const warehouseStock = numberOrNull(warehouse?.summary?.stockWarehouse) ?? rowsOf(warehouse).reduce((sum, row) => sum + numberOrZero(row.stockWarehouse), 0);
  const forecastRevenue = metricValue(metrics, 'plan.forecast_revenue', 'all');

  add({ id: 'dashboard-cutoff', label: 'Data cutoff', value: cutoffDate, format: 'text', period: cutoffDate, hint: 'Common marketplace fact date.' });
  add({ id: 'sku-registry-total', label: 'SKU registry', value: skuRows.length, period: cutoffDate, hint: 'Rows from canonical skus.json.' });
  add({ id: 'owner-assigned', label: 'SKU with owner', value: assignedSku, period: cutoffDate, hint: 'Owner comes from canonical SKU owner fields.' });
  add({ id: 'marketplace-stock-total', label: 'Marketplace stock', value: Math.round(totalMarketplaceStock), period: cutoffDate, hint: 'Marketplace stock visible in SKU registry.' });
  add({ id: 'warehouse-stock-total', label: 'Warehouse stock', value: Math.round(warehouseStock), period: cutoffDate, hint: 'Warehouse stock overlay remains visible.' });
  PLATFORMS.forEach((platform) => {
    const metric = metricRow(metrics, 'sales.raw_revenue', platform);
    const value = numberOrNull(metric?.raw_value);
    add({
      id: `sales-revenue-${platform}`,
      label: `Revenue ${platform.toUpperCase()}`,
      value,
      format: 'money',
      period: metric?.source_dates?.platform_trends || '',
      hint: value === null ? 'Нет данных в platform_trends.json.' : 'Fact from platform_trends.json.',
      metricId: `sales.raw_revenue:${platform}`
    });
  });
  add({
    id: 'sales-revenue-unallocated',
    label: 'Revenue unallocated',
    value: metricValue(metrics, 'sales.raw_revenue.unallocated', 'unallocated') || 0,
    format: 'money',
    period: cutoffDate,
    hint: 'Control total remainder stays visible.',
    metricId: 'sales.raw_revenue.unallocated'
  });
  add({
    id: 'company-plan-revenue',
    label: 'Company plan',
    value: metricValue(metrics, 'plan.revenue', 'all') || planSlice.planRevenueMonth || 0,
    format: 'money',
    period: monthKey,
    hint: 'Plan is read only from company_plan.json.',
    metricId: 'plan.revenue'
  });
  add({
    id: 'company-fact-revenue',
    label: 'Company fact',
    value: round(planScopeFactRevenue, 2),
    format: 'money',
    period: cutoffDate,
    hint: `Fact for the plan scope: ${planScopePlatforms.join(', ')}.`,
    metricId: 'sales.raw_revenue'
  });
  add({
    id: 'all-channel-fact-revenue',
    label: 'All-channel fact',
    value: round(allChannelFactRevenue, 2),
    format: 'money',
    period: cutoffDate,
    hint: 'All visible marketplace and retail channels; kept separate from plan completion.',
    metricId: 'sales.raw_revenue:all-channels'
  });
  add({
    id: 'company-plan-completion',
    label: 'Plan completion to date',
    value: metricValue(metrics, 'plan.completion_revenue', 'all') || planSlice.completionToDatePct || 0,
    valuePct: metricValue(metrics, 'plan.completion_revenue', 'all') || planSlice.completionToDatePct || 0,
    format: 'pct',
    period: cutoffDate,
    hint: 'Fact divided by linear company plan to date.',
    metricId: 'plan.completion_revenue'
  });
  add({
    id: 'company-forecast-revenue',
    label: 'Company forecast',
    value: forecastRevenue || planSlice.forecastRevenue || 0,
    format: 'money',
    period: monthKey,
    hint: 'Baseline forecast: month-to-date average times month days.',
    metricId: 'plan.forecast_revenue'
  });
  ['wb', 'ozon'].forEach((platform) => {
    add({
      id: `ads-drr-${platform}`,
      label: `DRR ${platform.toUpperCase()}`,
      value: metricValue(metrics, 'ads.drr', platform) || 0,
      valuePct: metricValue(metrics, 'ads.drr', platform) || 0,
      format: 'pct',
      period: cutoffDate,
      hint: 'Ad spend divided by attributed revenue.',
      metricId: `ads.drr:${platform}`
    });
  });
  return cards;
}

function buildPortalDashboard(options = resolveOptions({})) {
  const metrics = readJson(path.join(options.inputDir, 'portal_dashboard_metrics.json'), {});
  const trends = readJson(path.join(options.inputDir, 'platform_trends.json'), {});
  const companyPlan = readJson(path.join(options.inputDir, 'company_plan.json'), { months: {} });
  const skus = readJson(path.join(options.inputDir, 'skus.json'), []);
  const warehouse = readJson(path.join(options.inputDir, 'warehouse_stock_overlay.json'), {});
  const cutoffDate = dateKey(metrics.cutoffDate || trends.latestMarketplaceDate || trends.asOfDate || '');
  const monthKey = metrics.monthKey || monthKeyFromDate(cutoffDate || companyPlan.activeMonthKey || Object.keys(companyPlan.months || {}).sort().pop());
  if (!cutoffDate) throw new Error('Cannot build dashboard without a marketplace cutoff date.');
  if (!companyPlan.months?.[monthKey]) throw new Error(`company_plan.json has no active month ${monthKey}.`);

  const platformFacts = Object.fromEntries(PLATFORMS.map((platform) => [
    platform,
    platformFact(trends, platform, monthKey, cutoffDate)
  ]));
  const planScopePlatforms = resolvePlanScopePlatforms(companyPlan, companyPlan.months?.[monthKey] || {});
  const allChannelFactRevenue = PLATFORMS.reduce((sum, platform) => sum + numberOrZero(metricValue(metrics, 'sales.raw_revenue', platform)), 0);
  const calculatedPlanScopeFactRevenue = planScopePlatforms
    .reduce((sum, platform) => sum + numberOrZero(metricValue(metrics, 'sales.raw_revenue', platform)), 0);
  const planScopeFactRevenue = numberOrNull(metrics.summary?.salaryFactRevenue)
    ?? numberOrNull(metrics.summary?.factRevenue)
    ?? calculatedPlanScopeFactRevenue;
  const factUnits = PLATFORMS.reduce((sum, platform) => sum + numberOrZero(platformFacts[platform].units), 0);
  const planSlice = buildCompanyPlanSlice(companyPlan, monthKey, cutoffDate, planScopeFactRevenue);
  const skuRows = rowsOf(skus);
  const assignedSku = skuRows.filter((sku) => ownerNames(sku).length > 0).length;
  const totalMarketplaceStock = skuRows.reduce((sum, sku) => sum + marketplaceStock(sku), 0);
  const warehouseStock = numberOrNull(warehouse?.summary?.stockWarehouse) ?? rowsOf(warehouse).reduce((sum, row) => sum + numberOrZero(row.stockWarehouse), 0);
  const generatedAt = metrics.generatedAt || trends.generatedAt || `${cutoffDate}T00:00:00+03:00`;

  const payload = {
    schema: 'portal-dashboard-v2',
    generatedAt,
    snapshot_id: metrics.snapshot_id || '',
    asOfDate: cutoffDate,
    latestMarketplaceDate: cutoffDate,
    monthKey,
    dataFreshness: {
      asOfDate: cutoffDate,
      dataDate: cutoffDate,
      expectedFactDate: cutoffDate,
      googleSheetsMonth: monthKey,
      marketplaceFactSource: 'platform_trends.json',
      companyPlanSource: `${companyPlan.sourceWorkbook || 'company_plan.json'} :: ${companyPlan.sourceSheet || 'company_plan'}`,
      salaryPlanLoadedAt: companyPlan.generatedAt || '',
      salaryPlanControlTotals: companyPlanControlTotals(companyPlan)
    },
    sourceLineage: {
      plan: 'company_plan.json',
      fact: 'platform_trends.json',
      metrics: 'portal_dashboard_metrics.json',
      skuRegistry: 'skus.json',
      warehouse: 'warehouse_stock_overlay.json'
    },
    summary: {
      ...(metrics.summary || {}),
      cutoffDate,
      monthKey,
      factUnits: round(factUnits, 4),
      warehouseStock: round(warehouseStock, 4),
      marketplaceStock: round(totalMarketplaceStock, 4)
    },
    cards: buildCards({
      metrics,
      skus,
      warehouse,
      cutoffDate,
      monthKey,
      planSlice,
      planScopePlatforms,
      planScopeFactRevenue,
      allChannelFactRevenue
    }),
    brandSummary: [
      {
        brand: 'Altea',
        asOfDate: cutoffDate,
        latestMarketplaceDate: cutoffDate,
        sku_count: skuRows.length,
        assigned_sku: assignedSku,
        total_stock: round(totalMarketplaceStock, 4),
        warehouse_stock: round(warehouseStock, 4),
        plan_units: 0,
        fact_units_to_date: round(factUnits, 4),
        fact_revenue_to_date: round(allChannelFactRevenue, 2),
        all_channel_fact_revenue_to_date: round(allChannelFactRevenue, 2),
        plan_completion_to_date_pct: planSlice.completionToDatePct,
        company_plan_month_key: monthKey,
        company_plan_month_label: planSlice.label,
        company_plan_revenue: planSlice.planRevenueMonth,
        company_fact_revenue_to_date: planSlice.factRevenueToDate,
        company_plan_to_date_revenue: planSlice.planRevenueToDate,
        company_plan_completion_month_pct: planSlice.completionMonthPct,
        company_plan_completion_to_date_pct: planSlice.completionToDatePct,
        company_forecast_revenue: planSlice.forecastRevenue,
        company_forecast_pct: planSlice.forecastPct,
        company_plan_source: `${companyPlan.sourceWorkbook || 'company_plan.json'} :: ${companyPlan.sourceSheet || 'company_plan'}`,
        platformFacts
      }
    ],
    focusTop: buildFocusTop(skus),
    companyPlan: {
      generatedAt: companyPlan.generatedAt || '',
      sourceWorkbook: companyPlan.sourceWorkbook || '',
      sourceSheet: companyPlan.sourceSheet || '',
      sourcePath: companyPlan.sourcePath || '',
      planType: companyPlan.planType || 'company_revenue',
      payrollKpiPolicy: companyPlan.payrollKpiPolicy || {},
      activeMonthKey: monthKey,
      activeMonth: planSlice,
      months: companyPlan.months || {}
    }
  };
  return payload;
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const payload = buildPortalDashboard(options);
  const outputPath = options.outputFile || path.join(options.outputDir, OUTPUT_FILE);
  writeJson(outputPath, payload);
  console.log(JSON.stringify({
    outputPath,
    generatedAt: payload.generatedAt,
    cutoffDate: payload.latestMarketplaceDate,
    cards: payload.cards.length,
    focusTop: payload.focusTop.length
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildPortalDashboard,
  resolveOptions,
  parseArgs
};
