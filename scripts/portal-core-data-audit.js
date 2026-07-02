#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { buildPlanBackfillMap, compactKey } = require('./import-ksenia-minmax-matrix');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pctClose(actual, expected, tolerance = 0.006) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return true;
  return Math.abs(actual - expected) <= tolerance;
}

function moneyClose(actual, expected, tolerance = 0.05) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return true;
  return Math.abs(actual - expected) <= tolerance;
}

function marginFrom(price, cost) {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost <= 0) return null;
  return (price - cost) / price;
}

function statusIsOld(status = '') {
  const value = String(status || '').toLowerCase();
  return /вывод|архив|archive|paused|exit|stop|стоп/.test(value);
}

function pushIssue(issues, severity, type, detail = {}) {
  issues.push({ severity, type, ...detail });
}

function platformRows(pricesPayload = {}) {
  const rows = [];
  for (const [platform, payload] of Object.entries(pricesPayload.platforms || {})) {
    const list = Array.isArray(payload?.rows) ? payload.rows : [];
    list.forEach((row) => rows.push({ platform, row }));
  }
  return rows;
}

function auditPriceRows(prices, issues) {
  let checkedMargins = 0;
  let checkedMinMax = 0;
  for (const { platform, row } of platformRows(prices)) {
    const articleKey = row.articleKey || row.article || '';
    const minPrice = toNumber(row.minPrice ?? row.workingZoneFrom);
    const maxPrice = toNumber(row.maxPrice ?? row.workingZoneTo);
    if (minPrice !== null && minPrice > 0 && maxPrice !== null && maxPrice > 0) {
      checkedMinMax += 1;
      if (minPrice > maxPrice) pushIssue(issues, 'critical', 'prices_min_gt_max', { platform, articleKey, minPrice, maxPrice });
    }
    const cost = toNumber(row.cost ?? row.costRub ?? row.costPrice);
    const currentClientPrice = toNumber(row.currentClientPrice ?? row.currentPrice);
    const margin = toNumber(row.costAwareMarginPct ?? row.marginPct ?? row.marginTotalPct);
    const expected = marginFrom(currentClientPrice, cost);
    if (expected !== null && margin !== null) {
      checkedMargins += 1;
      if (!pctClose(margin, expected)) {
        pushIssue(issues, 'critical', 'prices_margin_mismatch', {
          platform,
          articleKey,
          currentClientPrice,
          cost,
          margin,
          expected: Number(expected.toFixed(6))
        });
      }
    }
  }
  return { checkedMargins, checkedMinMax };
}

function auditRepricer(repricer, issues) {
  let checkedSides = 0;
  let checkedMargins = 0;
  let checkedNewMargins = 0;
  let checkedMinMaxMargins = 0;
  const rows = Array.isArray(repricer.rows) ? repricer.rows : [];
  for (const row of rows) {
    const articleKey = row.articleKey || row.article || '';
    for (const platform of ['wb', 'ozon']) {
      const side = row[platform];
      if (!side) continue;
      checkedSides += 1;
      const minPrice = toNumber(side.minPrice ?? side.workingZoneFrom);
      const maxPrice = toNumber(side.maxPrice ?? side.workingZoneTo ?? side.manualMaxPrice);
      if (minPrice !== null && minPrice > 0 && maxPrice !== null && maxPrice > 0 && minPrice > maxPrice) {
        pushIssue(issues, 'critical', 'repricer_min_gt_max', { platform, articleKey, minPrice, maxPrice });
      }
      const cost = toNumber(side.cost ?? side.costRub ?? side.costPrice);
      const currentClientPrice = toNumber(side.buyerPrice ?? side.currentClientPrice ?? side.currentPrice);
      const margin = toNumber(side.costAwareMarginPct ?? side.marginPct);
      const expected = marginFrom(currentClientPrice, cost);
      if (expected !== null && margin !== null) {
        checkedMargins += 1;
        if (!pctClose(margin, expected)) {
          pushIssue(issues, 'critical', 'repricer_margin_mismatch', {
            platform,
            articleKey,
            currentClientPrice,
            cost,
            margin,
            expected: Number(expected.toFixed(6))
          });
        }
      }
      const newBuyerPrice = toNumber(side.newBuyerPrice ?? side.recPrice);
      const newMargin = toNumber(side.newCostAwareMarginPct ?? side.newMarginPct);
      const expectedNew = marginFrom(newBuyerPrice, cost);
      if (expectedNew !== null && newMargin !== null) {
        checkedNewMargins += 1;
        if (!pctClose(newMargin, expectedNew)) {
          pushIssue(issues, 'critical', 'repricer_new_margin_mismatch', {
            platform,
            articleKey,
            newBuyerPrice,
            cost,
            newMargin,
            expected: Number(expectedNew.toFixed(6))
          });
        }
      }
      for (const [field, price] of [['minPriceMarginPct', minPrice], ['maxPriceMarginPct', maxPrice]]) {
        const actual = toNumber(side[field]);
        const expectedLimit = marginFrom(price, cost);
        if (expectedLimit !== null && actual !== null) {
          checkedMinMaxMargins += 1;
          if (!pctClose(actual, expectedLimit, 0.008)) {
            pushIssue(issues, 'critical', 'repricer_minmax_margin_mismatch', {
              platform,
              articleKey,
              field,
              price,
              cost,
              actual,
              expected: Number(expectedLimit.toFixed(6))
            });
          }
        }
      }
    }
  }
  return { rows: rows.length, checkedSides, checkedMargins, checkedNewMargins, checkedMinMaxMargins };
}

function hasAssignedPlan(planFact = {}, sku = {}) {
  return Boolean(planFact.planAssigned || sku.planAssigned || [
    planFact.planFeb26Units,
    planFact.planMar26Units,
    planFact.planApr26Units,
    planFact.planMay26Units,
    planFact.planJun26Units,
    planFact.planJul26Units,
    planFact.planUnits,
    planFact.planMonthUnits
  ].some((value) => (toNumber(value) || 0) > 0));
}

function skuKeys(sku = {}) {
  return [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle
  ].map(compactKey).filter(Boolean);
}

function auditPlanFactCost(sku = {}, issues) {
  const planFact = sku.planFact && typeof sku.planFact === 'object' ? sku.planFact : {};
  const articleKey = sku.articleKey || sku.article || '';
  const cost = toNumber(sku.cost ?? sku.costRub ?? sku.costPrice);
  const revenue = toNumber(planFact.factFeb26Revenue);
  const units = toNumber(planFact.factFeb26Units);
  if (!(cost > 0) || !(revenue > 0) || !(units > 0)) return { checkedCost: 0, checkedMargin: 0 };
  const expectedCostRub = Number((units * cost).toFixed(2));
  const actualCostRub = toNumber(planFact.factFeb26CostRub);
  let checkedCost = 0;
  let checkedMargin = 0;
  if (actualCostRub !== null) {
    checkedCost += 1;
    if (!moneyClose(actualCostRub, expectedCostRub)) {
      pushIssue(issues, 'critical', 'plan_fact_cost_mismatch', {
        articleKey,
        units,
        cost,
        actualCostRub,
        expectedCostRub
      });
    }
  }
  const expectedMargin = (revenue - expectedCostRub) / revenue;
  const actualMargin = toNumber(planFact.factFeb26MarginPct);
  if (actualMargin !== null) {
    checkedMargin += 1;
    if (!pctClose(actualMargin, expectedMargin)) {
      pushIssue(issues, 'critical', 'plan_fact_margin_mismatch', {
        articleKey,
        revenue,
        units,
        cost,
        actualMargin,
        expected: Number(expectedMargin.toFixed(6))
      });
    }
  }
  return { checkedCost, checkedMargin };
}

function auditSkus(skus, matrix, issues, planBackfillMap = new Map()) {
  const activeSkus = skus.filter((sku) => !statusIsOld(sku.status || sku.registryStatus));
  const missingCost = activeSkus.filter((sku) => {
    const cost = toNumber(sku.cost ?? sku.costRub ?? sku.costPrice);
    return cost === null || cost <= 0;
  });
  const missingOwner = activeSkus.filter((sku) => {
    const owner = typeof sku.owner === 'string' ? sku.owner : (sku.owner?.name || '');
    return !String(owner || '').trim();
  });
  const oldActive = skus.filter((sku) => statusIsOld(sku.status || sku.registryStatus) && sku.matrixActive === true);
  if (missingOwner.length) pushIssue(issues, 'critical', 'sku_missing_owner', { count: missingOwner.length, examples: missingOwner.slice(0, 10).map((sku) => sku.articleKey || sku.article) });
  if (oldActive.length) pushIssue(issues, 'critical', 'old_sku_still_active', { count: oldActive.length, examples: oldActive.slice(0, 10).map((sku) => sku.articleKey || sku.article) });
  if (missingCost.length) pushIssue(issues, 'warning', 'active_sku_missing_cost', { count: missingCost.length, examples: missingCost.slice(0, 10).map((sku) => sku.articleKey || sku.article) });

  let planBackfillAvailable = 0;
  let planBackfillAssigned = 0;
  let checkedPlanFactCost = 0;
  let checkedPlanFactMargins = 0;
  activeSkus.forEach((sku) => {
    const planFact = sku.planFact && typeof sku.planFact === 'object' ? sku.planFact : {};
    const hasBackfill = skuKeys(sku).some((key) => planBackfillMap.get(key)?.months?.size);
    if (hasBackfill) {
      planBackfillAvailable += 1;
      if (hasAssignedPlan(planFact, sku)) {
        planBackfillAssigned += 1;
      } else {
        pushIssue(issues, 'critical', 'plan_backfill_not_assigned', {
          articleKey: sku.articleKey || sku.article,
          planStatus: planFact.planStatus || sku.planStatus || ''
        });
      }
    }
    const planCost = auditPlanFactCost(sku, issues);
    checkedPlanFactCost += planCost.checkedCost;
    checkedPlanFactMargins += planCost.checkedMargin;
  });

  const summary = matrix.summary || {};
  if (toNumber(summary.missingOwnerCount) > 0) pushIssue(issues, 'critical', 'matrix_missing_owner', { count: summary.missingOwnerCount });
  if (toNumber(summary.apiUnmappedCount) > 0) pushIssue(issues, 'critical', 'matrix_api_unmapped', { count: summary.apiUnmappedCount });
  if (toNumber(summary.duplicateRiskCount) > 0) pushIssue(issues, 'critical', 'matrix_duplicate_risk', { count: summary.duplicateRiskCount });
  if (toNumber(summary.planNeedsAssignmentCount) > 0) pushIssue(issues, 'warning', 'matrix_plan_needs_assignment', { count: summary.planNeedsAssignmentCount });

  return {
    skuCount: skus.length,
    activeSkuCount: activeSkus.length,
    activeMissingCost: missingCost.length,
    activeMissingOwner: missingOwner.length,
    oldActive: oldActive.length,
    planBackfillAvailable,
    planBackfillAssigned,
    checkedPlanFactCost,
    checkedPlanFactMargins,
    matrixSummary: {
      skuCount: summary.skuCount,
      activeSkuCount: summary.activeSkuCount,
      missingOwnerCount: summary.missingOwnerCount,
      planNeedsAssignmentCount: summary.planNeedsAssignmentCount,
      apiUnmappedCount: summary.apiUnmappedCount,
      duplicateRiskCount: summary.duplicateRiskCount
    }
  };
}

function auditOrderProcurement(order = {}, issues) {
  const rows = Array.isArray(order.rows) ? order.rows : [];
  let disabledRows = 0;
  let disabledNeedRows = 0;
  let missingOwnerNeedRows = 0;
  let unmatchedNeedRows = 0;
  let negativeMetricRows = 0;
  let targetNeed30 = 0;
  rows.forEach((row) => {
    const need30 = toNumber(row.targetNeed30) || 0;
    targetNeed30 += need30;
    if (statusIsOld(row.lifecycleStatus || row.lifecycleLabel || row.status)) {
      disabledRows += 1;
      if (need30 > 0 || row.needSuppressedByLifecycle === false) disabledNeedRows += 1;
    }
    if (need30 > 0 && !String(row.owner || '').trim()) missingOwnerNeedRows += 1;
    if (need30 > 0 && String(row.matchState || '').toLowerCase() === 'unmatched') unmatchedNeedRows += 1;
    ['inStock', 'inTransit', 'inRequest', 'available', 'avgDaily', 'targetNeed7', 'targetNeed14', 'targetNeed28', 'targetNeed30'].forEach((field) => {
      const value = toNumber(row[field]);
      if (value !== null && value < 0) negativeMetricRows += 1;
    });
  });
  if (!rows.length) pushIssue(issues, 'critical', 'order_procurement_empty');
  if (disabledNeedRows) pushIssue(issues, 'critical', 'order_disabled_sku_has_need', { count: disabledNeedRows });
  if (missingOwnerNeedRows) pushIssue(issues, 'critical', 'order_need_missing_owner', { count: missingOwnerNeedRows });
  if (unmatchedNeedRows) pushIssue(issues, 'critical', 'order_need_unmatched_sku', { count: unmatchedNeedRows });
  if (negativeMetricRows) pushIssue(issues, 'critical', 'order_negative_metric', { count: negativeMetricRows });
  return { rows: rows.length, disabledRows, disabledNeedRows, missingOwnerNeedRows, unmatchedNeedRows, negativeMetricRows, targetNeed30: Number(targetNeed30.toFixed(2)) };
}

function auditOosControl(oos = {}, issues) {
  const rows = Array.isArray(oos.rows) ? oos.rows : [];
  let missingOwnerRows = 0;
  let missingArticleRows = 0;
  let disabledRows = 0;
  let negativeMetricRows = 0;
  rows.forEach((row) => {
    if (!String(row.articleKey || row.article || '').trim()) missingArticleRows += 1;
    if (!String(row.owner || '').trim() || String(row.owner || '').toLowerCase() === 'без owner') missingOwnerRows += 1;
    if (statusIsOld(row.lifecycleStatus || row.lifecycleLabel || row.status)) disabledRows += 1;
    ['inStock', 'inTransit', 'inRequest', 'available', 'avgDaily', 'targetNeed30', 'revenueAtRiskDay', 'lostRevenueDay'].forEach((field) => {
      const value = toNumber(row[field]);
      if (value !== null && value < 0) negativeMetricRows += 1;
    });
  });
  if (!rows.length) pushIssue(issues, 'warning', 'oos_control_empty');
  if (oos.summary?.dataStatus && oos.summary.dataStatus !== 'ok') pushIssue(issues, 'warning', 'oos_control_data_status', { dataStatus: oos.summary.dataStatus, dataDate: oos.summary.dataDate || '' });
  if (missingArticleRows) pushIssue(issues, 'critical', 'oos_missing_article', { count: missingArticleRows });
  if (missingOwnerRows) pushIssue(issues, 'critical', 'oos_missing_owner', { count: missingOwnerRows });
  if (disabledRows) pushIssue(issues, 'critical', 'oos_disabled_sku_actionable', { count: disabledRows });
  if (negativeMetricRows) pushIssue(issues, 'critical', 'oos_negative_metric', { count: negativeMetricRows });
  return { rows: rows.length, dataStatus: oos.summary?.dataStatus || '', dataDate: oos.summary?.dataDate || '', missingOwnerRows, missingArticleRows, disabledRows, negativeMetricRows };
}

function auditTaskLayers(ropTasks = {}, autoTasks = {}, issues) {
  const tasks = Array.isArray(ropTasks.tasks) ? ropTasks.tasks : [];
  const signals = Array.isArray(autoTasks.signals) ? autoTasks.signals : [];
  const missingTaskFields = tasks.filter((task) => !String(task.id || '').trim() || !String(task.owner || task.rop || '').trim() || !String(task.title || '').trim());
  const missingSignalFields = signals.filter((signal) => !String(signal.id || '').trim() || !String(signal.title || '').trim() || !String(signal.nextAction || '').trim());
  if (!tasks.length) pushIssue(issues, 'critical', 'rop_tasks_empty');
  if (missingTaskFields.length) pushIssue(issues, 'critical', 'rop_task_required_field_missing', { count: missingTaskFields.length });
  if (missingSignalFields.length) pushIssue(issues, 'critical', 'auto_task_signal_required_field_missing', { count: missingSignalFields.length });
  const expectedSignals = toNumber(autoTasks.summary?.autoTaskSignals);
  if (expectedSignals !== null && expectedSignals !== signals.length) pushIssue(issues, 'critical', 'auto_task_signal_count_mismatch', { expected: expectedSignals, actual: signals.length });
  return { ropTasks: tasks.length, autoSignals: signals.length, missingTaskFields: missingTaskFields.length, missingSignalFields: missingSignalFields.length };
}

function auditIuDrr(iuDrr = {}, issues) {
  const kpis = iuDrr.kpis || {};
  const dailyRows = Array.isArray(iuDrr.daily) ? iuDrr.daily.length : 0;
  const monthRows = Array.isArray(iuDrr.months) ? iuDrr.months.length : 0;
  const channelRows = Array.isArray(iuDrr.channels) ? iuDrr.channels.length : 0;
  const requiredNumbers = ['iuRevenuePlanToDate', 'iuRevenueFactToDate', 'iuRevenueCompletionToDate'];
  const missingNumbers = requiredNumbers.filter((field) => toNumber(kpis[field]) === null);
  const logicErrors = Array.isArray(iuDrr.diagnostics?.logicGuard?.errors) ? iuDrr.diagnostics.logicGuard.errors : [];
  if (!iuDrr.generatedAt || !Object.keys(kpis).length) pushIssue(issues, 'critical', 'iu_drr_summary_empty', { generatedAt: iuDrr.generatedAt || '' });
  if (!dailyRows || !monthRows || !channelRows) pushIssue(issues, 'critical', 'iu_drr_required_rows_missing', { dailyRows, monthRows, channelRows });
  if (missingNumbers.length) pushIssue(issues, 'critical', 'iu_drr_kpi_missing', { fields: missingNumbers });
  if (logicErrors.length) pushIssue(issues, 'critical', 'iu_drr_logic_errors', { count: logicErrors.length });
  return { generatedAt: iuDrr.generatedAt || '', kpis: Object.keys(kpis).length, dailyRows, monthRows, channelRows, logicErrors: logicErrors.length };
}

function main() {
  const args = parseArgs(process.argv);
  const dataDir = path.resolve(args.dataDir || 'data');
  const issues = [];
  const required = [
    'skus.json',
    'sku_matrix.json',
    'prices.json',
    'repricer.json',
    'price_workbench_support.json',
    'portal_data_quality.json',
    'portal_sync_health.json',
    'iu_drr_summary.json',
    'oos_control.json',
    'order_procurement.json',
    'rop_strategic_tasks.json',
    'auto_task_signals.json'
  ];
  const payloads = {};
  for (const file of required) {
    const fullPath = path.join(dataDir, file);
    if (!fs.existsSync(fullPath)) {
      pushIssue(issues, 'critical', 'missing_file', { file });
      continue;
    }
    try {
      payloads[file] = readJson(fullPath);
    } catch (error) {
      pushIssue(issues, 'critical', 'json_parse_failed', { file, message: error.message });
    }
  }
  if (issues.some((issue) => issue.type === 'missing_file' || issue.type === 'json_parse_failed')) {
    console.log(JSON.stringify({ ok: false, criticalCount: issues.length, warningCount: 0, issues }, null, 2));
    process.exitCode = 1;
    return;
  }

  const skus = payloads['skus.json'];
  const matrix = payloads['sku_matrix.json'];
  const prices = payloads['prices.json'];
  const repricer = payloads['repricer.json'];
  const priceSupport = payloads['price_workbench_support.json'];
  const quality = payloads['portal_data_quality.json'];
  const syncHealth = payloads['portal_sync_health.json'];
  const iuDrr = payloads['iu_drr_summary.json'];
  const oos = payloads['oos_control.json'];
  const order = payloads['order_procurement.json'];
  const ropTasks = payloads['rop_strategic_tasks.json'];
  const autoTasks = payloads['auto_task_signals.json'];

  const planBackfillMap = buildPlanBackfillMap(priceSupport);
  const skuAudit = auditSkus(Array.isArray(skus) ? skus : [], matrix, issues, planBackfillMap);
  const priceAudit = auditPriceRows(prices, issues);
  const repricerAudit = auditRepricer(repricer, issues);
  const iuDrrAudit = auditIuDrr(iuDrr, issues);
  const oosAudit = auditOosControl(oos, issues);
  const orderAudit = auditOrderProcurement(order, issues);
  const taskAudit = auditTaskLayers(ropTasks, autoTasks, issues);

  const qualitySummary = quality.summary || {};
  if (toNumber(qualitySummary.criticalCount) > 0) pushIssue(issues, 'critical', 'portal_data_quality_critical', { count: qualitySummary.criticalCount });
  if (toNumber(qualitySummary.skuMissingOwner) > 0) pushIssue(issues, 'critical', 'portal_data_quality_sku_missing_owner', { count: qualitySummary.skuMissingOwner });
  if (toNumber(qualitySummary.skuMissingPlan) > 0) pushIssue(issues, 'warning', 'portal_data_quality_sku_missing_plan', { count: qualitySummary.skuMissingPlan });

  const syncStatus = String(syncHealth.status || syncHealth.publish?.status || '').toLowerCase();
  if (/blocked|critical|error/.test(syncStatus)) pushIssue(issues, 'critical', 'sync_health_blocked', { status: syncStatus });

  const critical = issues.filter((issue) => issue.severity === 'critical');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const report = {
    ok: critical.length === 0,
    generatedAt: new Date().toISOString(),
    dataDir,
    criticalCount: critical.length,
    warningCount: warnings.length,
    summary: {
      skuAudit,
      priceAudit,
      repricerAudit,
      portalDataQuality: {
        status: quality.status || '',
        criticalCount: qualitySummary.criticalCount || 0,
        warningCount: qualitySummary.warningCount || 0,
        skuMissingPlan: qualitySummary.skuMissingPlan || 0,
        warehouseUnmatchedRows: qualitySummary.warehouseUnmatchedRows || 0
      },
      syncHealth: {
        generatedAt: syncHealth.generatedAt || '',
        status: syncHealth.status || syncHealth.publish?.status || ''
      },
      iuDrr: iuDrrAudit,
      oosControl: oosAudit,
      orderProcurement: { generatedAt: order.generatedAt || '', ...orderAudit },
      tasks: taskAudit
    },
    issues
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main();
