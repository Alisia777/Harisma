#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  SOURCE_NOTE,
  buildPlanBackfillMap,
  compactKey,
  isDisabledStatus,
  readSourceMatrix,
  groupSourceRows,
  buildArticleGroups,
  rowEntries,
  rowKeyValues,
  rowsFromBucket
} = require('./import-ksenia-minmax-matrix');

const ROOT = process.cwd();
const TODAY = new Date().toISOString().slice(0, 10);
const DEFAULT_INPUT = path.join(
  process.env.USERPROFILE || '',
  'Downloads',
  'portal_merged_statuses_from_ksenia_minmax.xlsx'
);

const MATRIX_FILES = [
  'smart_price_workbench.json',
  'smart_price_overlay.json',
  'price_workbench_support.json',
  'price_workbench_support.compact.json',
  'price_workbench_support.dashboard-compact.json',
  'price_workbench_support.minified.full.json'
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const hasValue = inlineValue !== undefined || (argv[index + 1] && !String(argv[index + 1]).startsWith('--'));
    if (!hasValue) {
      args[key] = true;
      continue;
    }
    args[key] = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return args;
}

function resolveOptions(args = {}) {
  return {
    inputPath: path.resolve(args.input || args['input-file'] || DEFAULT_INPUT),
    dataDir: path.resolve(args['data-dir'] || path.join(ROOT, 'data')),
    exportDir: path.resolve(args['export-dir'] || path.join(ROOT, 'exports')),
    noWrite: Boolean(args['no-write'])
  };
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function sameNumber(left, right) {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 0.0001;
}

function roundMetric(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function positiveNumber(...values) {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed > 0) return parsed;
  }
  return null;
}

function marginPctFromPrice(price, cost) {
  const actualPrice = positiveNumber(price);
  const actualCost = positiveNumber(cost);
  if (!(actualPrice > 0) || !(actualCost > 0)) return null;
  return roundMetric((actualPrice - actualCost) / actualPrice);
}

function marginValue(row = {}) {
  return numberOrNull(
    row.costAwareMarginPct
      ?? row.grossMarginPct
      ?? row.marginPct
      ?? row.avgMargin7dPct
      ?? row.marginTotalPct
      ?? row.marginNoAdsCurrentPct
  );
}

function statusValue(row = {}) {
  return row.status || row.productStatus || row.repricerStatus || row.registryStatus || row.owner?.registryStatus || '';
}

function ownerValue(row = {}) {
  if (typeof row.owner === 'string') return row.owner.trim();
  return String(row.owner?.name || row.ownerName || '').trim();
}

function ownerPlatformValue(sku = {}, platform = '') {
  const byPlatform = sku.owner?.byPlatform && typeof sku.owner.byPlatform === 'object' ? sku.owner.byPlatform : {};
  const directByPlatform = sku.ownerByPlatform && typeof sku.ownerByPlatform === 'object' ? sku.ownerByPlatform : {};
  const flat = sku.ownersByPlatform && typeof sku.ownersByPlatform === 'object' ? sku.ownersByPlatform : {};
  const keys = platform === 'ym' ? ['ym', 'ya'] : [platform];
  for (const key of keys) {
    const value = String(byPlatform[key] || directByPlatform[key] || flat[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function hasAssignedPlan(planFact = {}) {
  return [
    planFact.planFeb26Units,
    planFact.planMar26Units,
    planFact.planApr26Units,
    planFact.planMay26Units,
    planFact.planJun26Units,
    planFact.planJul26Units,
    planFact.planUnits,
    planFact.planMonthUnits
  ].some((value) => (numberOrNull(value) || 0) > 0);
}

function planInfo(sku = {}) {
  const planFact = sku.planFact && typeof sku.planFact === 'object' ? sku.planFact : {};
  const active = !isDisabledStatus(statusValue(sku));
  const assigned = Boolean(planFact.planAssigned || sku.planAssigned || hasAssignedPlan(planFact));
  const needsAssignment = active && Boolean(planFact.planNeedsAssignment || sku.planNeedsAssignment || !assigned);
  return {
    planFact,
    active,
    assigned,
    needsAssignment,
    status: planFact.planStatus || sku.planStatus || ''
  };
}

function buildBucketMap(bucket = {}) {
  const map = new Map();
  rowEntries(bucket).forEach(({ row, keyHint }) => {
    rowKeyValues(row, keyHint).forEach((key) => {
      if (!key) return;
      const current = map.get(key);
      const currentScore = rowPreferenceScore(current);
      const nextScore = rowPreferenceScore(row);
      if (!current || nextScore > currentScore) map.set(key, row);
    });
  });
  return map;
}

function rowPreferenceScore(row = {}) {
  if (!row) return -1;
  let score = 0;
  if (row.matrixSource === SOURCE_NOTE) score += 10;
  if (isDisabledStatus(statusValue(row))) score -= 5;
  if (row.matrixDisabledReason) score -= 5;
  if (row.matrixActive) score += 2;
  return score;
}

function sourceKeySet(sourceRows = []) {
  return new Set(sourceRows.map((row) => row.key));
}

function rowMatchesSource(row = {}, keyHint = '', sourceKeys = new Set()) {
  return rowKeyValues(row, keyHint).some((key) => sourceKeys.has(key));
}

function pushIssue(issues, severity, type, payload) {
  issues.push({ severity, type, ...payload });
}

function verifyMatrixPayload(fileName, payload, sourceByPlatformRows, issues) {
  const summary = {};
  Object.entries(sourceByPlatformRows).forEach(([platform, sourceRows]) => {
    const bucket = payload?.platforms?.[platform] || {};
    const map = buildBucketMap(bucket);
    const keys = sourceKeySet(sourceRows);
    const platformSummary = {
      sourceRows: sourceRows.length,
      present: 0,
      missing: 0,
      minMaxChecked: 0,
      costChecked: 0,
      marginChecked: 0,
      ownerChecked: 0,
      oldActive: 0,
      minGtMax: 0
    };

    sourceRows.forEach((sourceRow) => {
      const row = map.get(sourceRow.key);
      if (!row) {
        platformSummary.missing += 1;
        pushIssue(issues, 'critical', 'matrix_row_missing', { fileName, platform, articleKey: sourceRow.articleKey });
        return;
      }
      platformSummary.present += 1;
      if (sourceRow.owner) {
        platformSummary.ownerChecked += 1;
        if (ownerValue(row) !== sourceRow.owner) {
          pushIssue(issues, 'critical', 'matrix_owner_mismatch', {
            fileName,
            platform,
            articleKey: sourceRow.articleKey,
            expectedOwner: sourceRow.owner,
            actualOwner: ownerValue(row)
          });
        }
      }
      if (sourceRow.usableMinMax) {
        platformSummary.minMaxChecked += 1;
        if (!sameNumber(row.minPrice, sourceRow.minPrice) || !sameNumber(row.maxPrice, sourceRow.maxPrice)) {
          pushIssue(issues, 'critical', 'matrix_minmax_mismatch', {
            fileName,
            platform,
            articleKey: sourceRow.articleKey,
            expectedMinPrice: sourceRow.minPrice,
            actualMinPrice: row.minPrice,
            expectedMaxPrice: sourceRow.maxPrice,
            actualMaxPrice: row.maxPrice
          });
        }
      }
      if (sourceRow.usableCost) {
        platformSummary.costChecked += 1;
        if (!sameNumber(row.cost, sourceRow.cost) && !sameNumber(row.costRub, sourceRow.cost) && !sameNumber(row.costPrice, sourceRow.cost)) {
          pushIssue(issues, 'critical', 'matrix_cost_mismatch', {
            fileName,
            platform,
            articleKey: sourceRow.articleKey,
            expectedCost: sourceRow.cost,
            actualCost: row.cost ?? row.costRub ?? row.costPrice
          });
        }
        const expectedMargin = marginPctFromPrice(
          positiveNumber(row.currentClientPrice, row.currentFillPrice, row.currentPrice, row.seedTargetClientPrice, row.basePrice),
          sourceRow.cost
        );
        if (expectedMargin !== null) {
          platformSummary.marginChecked += 1;
          const actualMargin = marginValue(row);
          if (actualMargin === null || !sameNumber(actualMargin, expectedMargin)) {
            pushIssue(issues, 'critical', 'matrix_margin_mismatch', {
              fileName,
              platform,
              articleKey: sourceRow.articleKey,
              expectedMarginPct: expectedMargin,
              actualMarginPct: actualMargin
            });
          }
        }
      }
      const rowMin = numberOrNull(row.minPrice);
      const rowMax = numberOrNull(row.maxPrice);
      if (rowMin !== null && rowMax !== null && rowMin > rowMax) {
        platformSummary.minGtMax += 1;
        pushIssue(issues, 'critical', 'matrix_min_gt_max', { fileName, platform, articleKey: sourceRow.articleKey, minPrice: rowMin, maxPrice: rowMax });
      }
    });

    rowEntries(bucket).forEach(({ row, keyHint }) => {
      if (rowMatchesSource(row, keyHint, keys)) return;
      if (!isDisabledStatus(statusValue(row))) {
        platformSummary.oldActive += 1;
        if (platformSummary.oldActive <= 20) {
          pushIssue(issues, 'critical', 'matrix_old_active_row', {
            fileName,
            platform,
            articleKey: row.articleKey || row.article || keyHint,
            status: statusValue(row)
          });
        }
      }
    });
    summary[platform] = platformSummary;
  });
  return summary;
}

function verifyPrices(prices, sourceByPlatformRows, issues) {
  const summary = {};
  ['wb', 'ozon', 'ym'].forEach((platform) => {
    const sourceRows = sourceByPlatformRows[platform] || [];
    const bucket = prices?.platforms?.[platform] || {};
    const map = buildBucketMap(bucket);
    const keys = sourceKeySet(sourceRows);
    const platformSummary = {
      sourceRows: sourceRows.length,
      present: 0,
      missing: 0,
      minMaxChecked: 0,
      costChecked: 0,
      marginChecked: 0,
      ownerChecked: 0,
      oldActive: 0,
      minGtMax: 0
    };
    sourceRows.forEach((sourceRow) => {
      const row = map.get(sourceRow.key);
      if (!row) {
        platformSummary.missing += 1;
        pushIssue(issues, 'critical', 'prices_row_missing', { platform, articleKey: sourceRow.articleKey });
        return;
      }
      platformSummary.present += 1;
      if (sourceRow.owner) {
        platformSummary.ownerChecked += 1;
        if (ownerValue(row) !== sourceRow.owner) {
          pushIssue(issues, 'critical', 'prices_owner_mismatch', {
            platform,
            articleKey: sourceRow.articleKey,
            expectedOwner: sourceRow.owner,
            actualOwner: ownerValue(row)
          });
        }
      }
      if (sourceRow.usableMinMax) {
        platformSummary.minMaxChecked += 1;
        if (!sameNumber(row.minPrice, sourceRow.minPrice) || !sameNumber(row.maxPrice, sourceRow.maxPrice)) {
          pushIssue(issues, 'critical', 'prices_minmax_mismatch', {
            platform,
            articleKey: sourceRow.articleKey,
            expectedMinPrice: sourceRow.minPrice,
            actualMinPrice: row.minPrice,
            expectedMaxPrice: sourceRow.maxPrice,
            actualMaxPrice: row.maxPrice
          });
        }
      }
      if (sourceRow.usableCost) {
        platformSummary.costChecked += 1;
        if (!sameNumber(row.cost, sourceRow.cost) && !sameNumber(row.costRub, sourceRow.cost) && !sameNumber(row.costPrice, sourceRow.cost)) {
          pushIssue(issues, 'critical', 'prices_cost_mismatch', {
            platform,
            articleKey: sourceRow.articleKey,
            expectedCost: sourceRow.cost,
            actualCost: row.cost ?? row.costRub ?? row.costPrice
          });
        }
        const expectedMargin = marginPctFromPrice(positiveNumber(row.currentClientPrice, row.currentPrice, row.basePrice), sourceRow.cost);
        if (expectedMargin !== null) {
          platformSummary.marginChecked += 1;
          const actualMargin = marginValue(row);
          if (actualMargin === null || !sameNumber(actualMargin, expectedMargin)) {
            pushIssue(issues, 'critical', 'prices_margin_mismatch', {
              platform,
              articleKey: sourceRow.articleKey,
              expectedMarginPct: expectedMargin,
              actualMarginPct: actualMargin
            });
          }
        }
      }
      const rowMin = numberOrNull(row.minPrice);
      const rowMax = numberOrNull(row.maxPrice);
      if (rowMin !== null && rowMax !== null && rowMin > rowMax) {
        platformSummary.minGtMax += 1;
        pushIssue(issues, 'critical', 'prices_min_gt_max', { platform, articleKey: sourceRow.articleKey, minPrice: rowMin, maxPrice: rowMax });
      }
    });
    rowEntries(bucket).forEach(({ row, keyHint }) => {
      if (rowMatchesSource(row, keyHint, keys)) return;
      if (!isDisabledStatus(statusValue(row))) {
        platformSummary.oldActive += 1;
        if (platformSummary.oldActive <= 20) {
          pushIssue(issues, 'critical', 'prices_old_active_row', {
            platform,
            articleKey: row.articleKey || row.article || keyHint,
            status: statusValue(row)
          });
        }
      }
    });
    summary[platform] = platformSummary;
  });
  return summary;
}

function buildRepricerMap(repricer = {}) {
  const map = new Map();
  (repricer.rows || []).forEach((row) => {
    rowKeyValues(row).forEach((key) => {
      if (key && !map.has(key)) map.set(key, row);
    });
  });
  return map;
}

function verifyRepricer(repricer, sourceByPlatformRows, issues) {
  const map = buildRepricerMap(repricer);
  const summary = {
    rows: Array.isArray(repricer?.rows) ? repricer.rows.length : 0,
    wb: {},
    ozon: {},
    minGtMax: 0,
    oldActive: 0,
    costChecked: 0,
    marginChecked: 0
  };
  ['wb', 'ozon'].forEach((platform) => {
    const sourceRows = sourceByPlatformRows[platform] || [];
    const keys = sourceKeySet(sourceRows);
    const platformSummary = {
      sourceRows: sourceRows.length,
      present: 0,
      missing: 0,
      minMaxChecked: 0,
      ownerChecked: 0,
      marginChecked: 0,
      newMarginChecked: 0
    };
    sourceRows.forEach((sourceRow) => {
      const row = map.get(sourceRow.key);
      const side = row?.[platform];
      if (!row || !side) {
        platformSummary.missing += 1;
        pushIssue(issues, 'critical', 'repricer_side_missing', { platform, articleKey: sourceRow.articleKey });
        return;
      }
      platformSummary.present += 1;
      if (sourceRow.owner) {
        platformSummary.ownerChecked += 1;
        const actualOwner = ownerPlatformValue(row, platform) || ownerValue(row);
        if (actualOwner !== sourceRow.owner) {
          pushIssue(issues, 'critical', 'repricer_owner_mismatch', {
            platform,
            articleKey: sourceRow.articleKey,
            expectedOwner: sourceRow.owner,
            actualOwner
          });
        }
      }
      if (sourceRow.usableMinMax) {
        platformSummary.minMaxChecked += 1;
        if (!sameNumber(side.minPrice, sourceRow.minPrice) || !sameNumber(side.workingZoneTo, sourceRow.maxPrice)) {
          pushIssue(issues, 'critical', 'repricer_minmax_mismatch', {
            platform,
            articleKey: sourceRow.articleKey,
            expectedMinPrice: sourceRow.minPrice,
            actualMinPrice: side.minPrice,
            expectedMaxPrice: sourceRow.maxPrice,
            actualMaxPrice: side.workingZoneTo
          });
        }
      }
      if (sourceRow.usableCost) {
        summary.costChecked += 1;
        const actualCost = side.cost ?? row.cost;
        if (!sameNumber(actualCost, sourceRow.cost)) {
          pushIssue(issues, 'critical', 'repricer_cost_mismatch', {
            platform,
            articleKey: sourceRow.articleKey,
            expectedCost: sourceRow.cost,
            actualCost
          });
        }
        const expectedMargin = marginPctFromPrice(positiveNumber(side.buyerPrice, side.currentPrice), sourceRow.cost);
        if (expectedMargin !== null) {
          summary.marginChecked += 1;
          platformSummary.marginChecked += 1;
          const actualMargin = marginValue(side);
          if (actualMargin === null || !sameNumber(actualMargin, expectedMargin)) {
            pushIssue(issues, 'critical', 'repricer_margin_mismatch', {
              platform,
              articleKey: sourceRow.articleKey,
              expectedMarginPct: expectedMargin,
              actualMarginPct: actualMargin
            });
          }
        }
        const expectedNewMargin = marginPctFromPrice(positiveNumber(side.newBuyerPrice, side.recPrice), sourceRow.cost);
        if (expectedNewMargin !== null) {
          platformSummary.newMarginChecked += 1;
          const actualNewMargin = numberOrNull(side.newCostAwareMarginPct ?? side.newMarginPct ?? side.marginNoAdsNewPct);
          if (actualNewMargin === null || !sameNumber(actualNewMargin, expectedNewMargin)) {
            pushIssue(issues, 'critical', 'repricer_new_margin_mismatch', {
              platform,
              articleKey: sourceRow.articleKey,
              expectedMarginPct: expectedNewMargin,
              actualMarginPct: actualNewMargin
            });
          }
        }
      }
      const min = numberOrNull(side.minPrice);
      const max = numberOrNull(side.workingZoneTo || side.upperCap);
      if (min !== null && max !== null && min > max) {
        summary.minGtMax += 1;
        pushIssue(issues, 'critical', 'repricer_min_gt_max', { platform, articleKey: sourceRow.articleKey, minPrice: min, maxPrice: max });
      }
    });

    (repricer.rows || []).forEach((row) => {
      if (!row?.[platform]) return;
      if (rowKeyValues(row).some((key) => keys.has(key))) return;
      const sideStatus = statusValue(row[platform]) || statusValue(row);
      if (!isDisabledStatus(sideStatus)) {
        summary.oldActive += 1;
        if (summary.oldActive <= 20) {
          pushIssue(issues, 'critical', 'repricer_old_active_row', {
            platform,
            articleKey: row.articleKey || row.article,
            status: sideStatus
          });
        }
      }
    });
    summary[platform] = platformSummary;
  });
  return summary;
}

function buildSkuMap(skus = []) {
  const map = new Map();
  skus.forEach((sku) => {
    skuCanonicalKeys(sku).forEach((key) => {
      if (key && !map.has(key)) map.set(key, sku);
    });
  });
  return map;
}

function skuCanonicalKeys(sku = {}) {
  return [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle
  ].map(compactKey).filter(Boolean);
}

function verifySkus(skus, articleGroups, issues, planBackfillMap = new Map()) {
  const map = buildSkuMap(Array.isArray(skus) ? skus : []);
  const sourceKeys = new Set(articleGroups.keys());
  const summary = {
    sourceArticles: articleGroups.size,
    present: 0,
    missing: 0,
    oldActive: 0,
    costChecked: 0,
    ownerChecked: 0,
    planAssigned: 0,
    planNeedsAssignment: 0,
    planBackfillAvailable: 0,
    planBackfilled: 0,
    activeSourceArticles: 0
  };
  articleGroups.forEach((group) => {
    const sku = map.get(group.key);
    if (!sku) {
      summary.missing += 1;
      pushIssue(issues, 'critical', 'sku_missing', { articleKey: group.articleKey });
      return;
    }
    summary.present += 1;
    if (!isDisabledStatus(group.status)) summary.activeSourceArticles += 1;
    if (group.cost > 0) {
      summary.costChecked += 1;
      if (!sameNumber(sku.costPrice, group.cost) && !sameNumber(sku.cost, group.cost) && !sameNumber(sku.costRub, group.cost)) {
        pushIssue(issues, 'critical', 'sku_cost_mismatch', {
          articleKey: group.articleKey,
          expectedCost: group.cost,
          actualCost: sku.costPrice ?? sku.cost ?? sku.costRub
        });
      }
    }
    Object.entries(group.platforms || {}).forEach(([platform, platformRow]) => {
      if (!platformRow.owner) return;
      summary.ownerChecked += 1;
      const actualOwner = ownerPlatformValue(sku, platform) || ownerValue(sku);
      if (actualOwner !== platformRow.owner) {
        pushIssue(issues, 'critical', 'sku_platform_owner_mismatch', {
          platform,
          articleKey: group.articleKey,
          expectedOwner: platformRow.owner,
          actualOwner
        });
      }
    });
    const plan = planInfo(sku);
    const planBackfillAvailable = planBackfillMap.get(group.key)?.months?.size > 0;
    if (planBackfillAvailable) summary.planBackfillAvailable += 1;
    if (plan.planFact?.planBackfillSource === 'price_workbench_support.planMonths') summary.planBackfilled += 1;
    if (planBackfillAvailable && !plan.assigned) {
      pushIssue(issues, 'critical', 'sku_plan_backfill_not_assigned', {
        articleKey: group.articleKey,
        status: group.status,
        owner: ownerValue(sku),
        planStatus: plan.status || null
      });
    }
    if (plan.assigned) summary.planAssigned += 1;
    if (plan.needsAssignment) {
      summary.planNeedsAssignment += 1;
      pushIssue(issues, 'warning', 'sku_plan_needs_assignment', {
        articleKey: group.articleKey,
        status: group.status,
        owner: ownerValue(sku),
        planStatus: plan.status || null
      });
      if (plan.status !== 'needs_plan_assignment' || sku.planNeedsAssignment !== true) {
        pushIssue(issues, 'critical', 'sku_missing_plan_not_marked', {
          articleKey: group.articleKey,
          status: group.status,
          planStatus: plan.status || null,
          planNeedsAssignment: sku.planNeedsAssignment
        });
      }
    }
  });
  (Array.isArray(skus) ? skus : []).forEach((sku) => {
    if (skuCanonicalKeys(sku).some((key) => sourceKeys.has(key))) return;
    if (!isDisabledStatus(statusValue(sku))) {
      summary.oldActive += 1;
      if (summary.oldActive <= 20) {
        pushIssue(issues, 'critical', 'sku_old_active_row', {
          articleKey: sku.articleKey || sku.article,
          status: statusValue(sku),
          owner: ownerValue(sku)
        });
      }
    }
  });
  return summary;
}

function countRowsByPlatform(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload.platforms || {}).map(([platform, bucket]) => [platform, rowsFromBucket(bucket).length])
  );
}

function runVerification(options) {
  const source = readSourceMatrix(options.inputPath);
  const grouped = groupSourceRows(source.rows);
  const articleGroups = buildArticleGroups(grouped.groupedRows);
  const planBackfillMap = buildPlanBackfillMap(readJson(path.join(options.dataDir, 'price_workbench_support.json'), { platforms: {} }));
  const issues = [];
  const summary = {
    source: {
      rows: source.rows.length,
      uniquePlatformArticles: grouped.groupedRows.length,
      uniqueArticles: articleGroups.size,
      numericIssueRows: grouped.numericIssueRows.length,
      normalizedMinMaxRows: grouped.normalizedMinMaxRows.length,
      conflicts: grouped.conflicts.length
    },
    matrixFiles: {},
    prices: {},
    repricer: {},
    skus: {}
  };

  MATRIX_FILES.forEach((fileName) => {
    const payload = readJson(path.join(options.dataDir, fileName), null);
    if (!payload) {
      pushIssue(issues, 'critical', 'file_missing', { fileName });
      return;
    }
    summary.matrixFiles[fileName] = {
      rowsByPlatform: countRowsByPlatform(payload),
      checks: verifyMatrixPayload(fileName, payload, grouped.byPlatformRows, issues)
    };
  });

  const prices = readJson(path.join(options.dataDir, 'prices.json'), null);
  if (!prices) pushIssue(issues, 'critical', 'file_missing', { fileName: 'prices.json' });
  else summary.prices = {
    rowsByPlatform: countRowsByPlatform(prices),
    checks: verifyPrices(prices, grouped.byPlatformRows, issues)
  };

  const repricer = readJson(path.join(options.dataDir, 'repricer.json'), null);
  if (!repricer) pushIssue(issues, 'critical', 'file_missing', { fileName: 'repricer.json' });
  else summary.repricer = verifyRepricer(repricer, grouped.byPlatformRows, issues);

  const skus = readJson(path.join(options.dataDir, 'skus.json'), null);
  if (!skus) pushIssue(issues, 'critical', 'file_missing', { fileName: 'skus.json' });
  else summary.skus = verifySkus(skus, articleGroups, issues, planBackfillMap);

  const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
  const report = {
    generatedAt: new Date().toISOString(),
    dataDir: options.dataDir,
    sourceInput: options.inputPath,
    ok: criticalCount === 0,
    criticalCount,
    issueCount: issues.length,
    summary,
    sourceKnownIssues: {
      numericIssueRows: grouped.numericIssueRows,
      normalizedMinMaxRows: grouped.normalizedMinMaxRows,
      conflicts: grouped.conflicts
    },
    issues
  };
  return report;
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const report = runVerification(options);
  const reportPath = path.join(options.exportDir, `ksenia_minmax_verify_${TODAY}.json`);
  if (!options.noWrite) writeJson(reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    report: options.noWrite ? null : path.relative(ROOT, reportPath),
    criticalCount: report.criticalCount,
    issueCount: report.issueCount,
    source: report.summary.source,
    skus: report.summary.skus,
    repricer: report.summary.repricer,
    issues: report.issues.slice(0, 20)
  }, null, 2));
  if (!report.ok) process.exit(1);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exit(1);
  }
}

module.exports = {
  runVerification
};
