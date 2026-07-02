#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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

function auditSkus(skus, matrix, issues) {
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

function main() {
  const args = parseArgs(process.argv);
  const dataDir = path.resolve(args.dataDir || 'data');
  const issues = [];
  const required = [
    'skus.json',
    'sku_matrix.json',
    'prices.json',
    'repricer.json',
    'portal_data_quality.json',
    'portal_sync_health.json',
    'iu_drr_summary.json',
    'oos_control.json',
    'order_procurement.json'
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
  const quality = payloads['portal_data_quality.json'];
  const syncHealth = payloads['portal_sync_health.json'];
  const iuDrr = payloads['iu_drr_summary.json'];
  const oos = payloads['oos_control.json'];
  const order = payloads['order_procurement.json'];

  const skuAudit = auditSkus(Array.isArray(skus) ? skus : [], matrix, issues);
  const priceAudit = auditPriceRows(prices, issues);
  const repricerAudit = auditRepricer(repricer, issues);

  const qualitySummary = quality.summary || {};
  if (toNumber(qualitySummary.criticalCount) > 0) pushIssue(issues, 'critical', 'portal_data_quality_critical', { count: qualitySummary.criticalCount });
  if (toNumber(qualitySummary.skuMissingOwner) > 0) pushIssue(issues, 'critical', 'portal_data_quality_sku_missing_owner', { count: qualitySummary.skuMissingOwner });
  if (toNumber(qualitySummary.skuMissingPlan) > 0) pushIssue(issues, 'warning', 'portal_data_quality_sku_missing_plan', { count: qualitySummary.skuMissingPlan });

  const syncStatus = String(syncHealth.status || syncHealth.publish?.status || '').toLowerCase();
  if (/blocked|critical|error/.test(syncStatus)) pushIssue(issues, 'critical', 'sync_health_blocked', { status: syncStatus });

  const iuKpis = iuDrr.kpis || {};
  if (!iuDrr.generatedAt || !Object.keys(iuKpis).length) pushIssue(issues, 'critical', 'iu_drr_summary_empty', { generatedAt: iuDrr.generatedAt || '' });

  const oosRows = Array.isArray(oos.rows) ? oos.rows.length : 0;
  if (!oosRows) pushIssue(issues, 'warning', 'oos_control_empty');
  if (oos.summary?.dataStatus && oos.summary.dataStatus !== 'ok') pushIssue(issues, 'warning', 'oos_control_data_status', { dataStatus: oos.summary.dataStatus, dataDate: oos.summary.dataDate || '' });

  const orderRows = Array.isArray(order.rows) ? order.rows.length : 0;
  if (!orderRows) pushIssue(issues, 'critical', 'order_procurement_empty');

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
      iuDrr: {
        generatedAt: iuDrr.generatedAt || '',
        kpis: Object.keys(iuKpis).length
      },
      oosControl: {
        generatedAt: oos.generatedAt || '',
        rows: oosRows,
        dataStatus: oos.summary?.dataStatus || '',
        dataDate: oos.summary?.dataDate || ''
      },
      orderProcurement: {
        generatedAt: order.generatedAt || '',
        rows: orderRows
      }
    },
    issues
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main();
