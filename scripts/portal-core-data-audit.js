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

const OWNER_CANONICAL_NAMES = new Map([
  ['алексей', 'Алексей'],
  ['александр', 'Питайкин Артём'],
  ['анна', 'Пирогова Анна'],
  ['артем', 'Питайкин Артём'],
  ['артём', 'Питайкин Артём'],
  ['дария', 'Молодякова Дария'],
  ['дарья', 'Молодякова Дария'],
  ['даша', 'Молодякова Дария'],
  ['екатерина', 'Доможирова Екатерина'],
  ['кирилл', 'Кирилл'],
  ['ксения', 'Ксения'],
  ['максим', 'Лапыгин Максим'],
  ['мария', 'Васильева Мария'],
  ['олеся', 'Олеся'],
  ['светлана', 'Светлана']
]);

const OWNER_NAME_ALIASES = new Map([
  ['александр озон', 'Питайкин Артём'],
  ['питайкин артем', 'Питайкин Артём'],
  ['питайкин артём', 'Питайкин Артём'],
  ['артем питайкин', 'Питайкин Артём'],
  ['артём питайкин', 'Питайкин Артём'],
  ['молодякова дария', 'Молодякова Дария'],
  ['молодякова дарья', 'Молодякова Дария'],
  ['дария молодякова', 'Молодякова Дария'],
  ['дарья молодякова', 'Молодякова Дария'],
  ['анна пирогова', 'Пирогова Анна'],
  ['пирогова анна', 'Пирогова Анна'],
  ['екатерина доброжирова', 'Доможирова Екатерина'],
  ['екатерина доможирова', 'Доможирова Екатерина'],
  ['доможирова екатерина', 'Доможирова Екатерина'],
  ['доброжирова екатерина', 'Доможирова Екатерина'],
  ['мария васильева', 'Васильева Мария'],
  ['мария васильевна', 'Васильева Мария'],
  ['васильева мария', 'Васильева Мария'],
  ['лапыгин максим', 'Лапыгин Максим'],
  ['максим лапыгин', 'Лапыгин Максим'],
  ['олеся савинова', 'Олеся']
]);

function canonicalOwnerName(value = '') {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const lowered = normalized.toLowerCase().replaceAll('ё', 'е');
  if (OWNER_NAME_ALIASES.has(lowered)) return OWNER_NAME_ALIASES.get(lowered);
  if (OWNER_CANONICAL_NAMES.has(lowered)) return OWNER_CANONICAL_NAMES.get(lowered);
  const [firstToken = ''] = lowered.split(' ');
  if (OWNER_CANONICAL_NAMES.has(firstToken)) return OWNER_CANONICAL_NAMES.get(firstToken);
  return normalized;
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

function normalizePlatformKey(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['ozon', 'oz'].includes(raw)) return 'ozon';
  if (['ga', 'goldapple', 'gold_apple', 'gold-apple'].includes(raw)) return 'goldapple';
  if (['letu', 'letual'].includes(raw)) return 'letu';
  if (['mm', 'magnit', 'magnit_market', 'magnit-market'].includes(raw)) return 'magnit';
  if (['megamarket', 'mega_market', 'mega-market'].includes(raw)) return 'megamarket';
  if (['samokat'].includes(raw)) return 'samokat';
  if (['ym', 'ya', 'yandex', 'yandex market', 'яндекс', 'я.маркет', 'я маркет'].includes(raw)) return 'ym';
  return raw;
}

function buildSkuLookup(skus = []) {
  const lookup = new Map();
  (Array.isArray(skus) ? skus : []).forEach((sku) => {
    skuKeys(sku).forEach((key) => {
      if (!lookup.has(key)) lookup.set(key, sku);
    });
  });
  return lookup;
}

function expectedOwnerForPlatform(sku = {}, platform = '') {
  const key = normalizePlatformKey(platform);
  const byPlatform = {
    ...(sku?.ownerByPlatform || {}),
    ...(sku?.owner?.byPlatform || {}),
    ...(sku?.ownersByPlatform || {})
  };
  const ownerKeys = {
    ym: ['ym', 'ya'],
    goldapple: ['goldapple', 'ga'],
    magnit: ['magnit', 'mm'],
    megamarket: ['megamarket'],
    letu: ['letu'],
    samokat: ['samokat']
  }[key] || [key];
  let platformOwner = '';
  for (const ownerKey of ownerKeys) {
    platformOwner = byPlatform[ownerKey] || '';
    if (platformOwner) break;
  }
  return String(platformOwner || sku?.owner?.name || '').trim();
}

function explicitOwnerForPlatform(sku = {}, platform = '') {
  const key = normalizePlatformKey(platform);
  const byPlatform = {
    ...(sku?.ownerByPlatform || {}),
    ...(sku?.owner?.byPlatform || {}),
    ...(sku?.ownersByPlatform || {})
  };
  const ownerKeys = {
    ym: ['ym', 'ya'],
    goldapple: ['goldapple', 'ga'],
    magnit: ['magnit', 'mm'],
    megamarket: ['megamarket'],
    letu: ['letu'],
    samokat: ['samokat']
  }[key] || [key];
  for (const ownerKey of ownerKeys) {
    const owner = String(byPlatform[ownerKey] || '').trim();
    if (owner) return owner;
  }
  return '';
}

function ownerMismatch(row = {}, skuLookup = new Map()) {
  const rowKey = compactKey(row.articleKey || row.article || row.sku || '');
  const sku = skuLookup.get(rowKey);
  if (!sku) return null;
  const expected = expectedOwnerForPlatform(sku, row.platformKey || row.platform || '');
  const actual = String(row.owner || '').trim();
  if (!expected || !actual || canonicalOwnerName(expected) === canonicalOwnerName(actual)) return null;
  return {
    articleKey: row.articleKey || row.article || '',
    platform: row.platformKey || row.platform || '',
    owner: actual,
    expected
  };
}

function ownerValue(row = {}) {
  if (typeof row.owner === 'object' && row.owner) return String(row.owner.name || '').trim();
  return String(row.owner || row.ownerName || row.manager || '').trim();
}

function lifecycleText(row = {}) {
  return [
    row.status,
    row.productStatus,
    row.repricerStatus,
    row.lifecycleStatus,
    row.lifecycleLabel,
    row.registryStatus
  ].map((value) => String(value || '')).join(' ').toLowerCase();
}

function isDisabledLifecycle(row = {}) {
  const text = lifecycleText(row);
  return text.includes('\u0432\u044b\u0432\u043e\u0434')
    || text.includes('\u0430\u0440\u0445')
    || text.includes('archive')
    || text.includes('disabled')
    || text.includes('paused')
    || text.includes('stop');
}

function rowIsOwnerAuditable(row = {}) {
  const articleKey = compactKey(row.articleKey || row.article || row.sku || '');
  if (!articleKey || articleKey === '0' || /^total|итого$/i.test(String(row.articleKey || row.article || row.sku || ''))) return false;
  if (row.matrixActive === false || row.disabled === true || row.hidden === true) return false;
  if (isDisabledLifecycle(row)) return false;
  return true;
}

function platformRowsFromPayload(payload = {}, source = '') {
  const rows = [];
  for (const [platform, platformPayload] of Object.entries(payload.platforms || {})) {
    const rawRows = platformPayload?.rows;
    const list = Array.isArray(rawRows) ? rawRows : Object.values(rawRows || {});
    list.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      rows.push({
        source,
        platform: normalizePlatformKey(row.platformKey || row.platform || row.marketplace || platform),
        row: {
          ...row,
          platformKey: normalizePlatformKey(row.platformKey || row.platform || row.marketplace || platform)
        }
      });
    });
  }
  return rows;
}

function rowHasPlanOrFact(row = {}) {
  const planMonths = Array.isArray(row.planMonths) ? row.planMonths : [];
  const actualMonths = Array.isArray(row.actualMonths) ? row.actualMonths : [];
  const hasPlanMonths = planMonths.some((month) => (toNumber(month.units) || 0) > 0 || (toNumber(month.revenue) || 0) > 0);
  const hasActualMonths = actualMonths.some((month) => (toNumber(month.units) || 0) > 0 || (toNumber(month.revenue) || 0) > 0);
  return hasPlanMonths
    || hasActualMonths
    || (toNumber(row.planMonthUnits) || 0) > 0
    || (toNumber(row.planMonthRevenue) || 0) > 0
    || (toNumber(row.currentPrice) || 0) > 0
    || (toNumber(row.currentClientPrice) || 0) > 0;
}

function auditOwnerDataset(label, rows, skuLookup, issues, options = {}) {
  let checkedRows = 0;
  let plannedRows = 0;
  let missingOwnerRows = 0;
  let ownerMismatchRows = 0;
  let unmatchedRows = 0;
  const mismatchExamples = [];
  const missingExamples = [];
  const unmatchedExamples = [];
  rows.forEach(({ platform, row }) => {
    if (!rowIsOwnerAuditable(row)) return;
    const rowKey = compactKey(row.articleKey || row.article || row.sku || '');
    const sku = skuLookup.get(rowKey);
    if (!sku) {
      unmatchedRows += 1;
      if (unmatchedExamples.length < 10) unmatchedExamples.push({ articleKey: row.articleKey || row.article || '', platform });
      return;
    }
    checkedRows += 1;
    if (rowHasPlanOrFact(row)) plannedRows += 1;
    const actualOwner = ownerValue(row);
    if (!actualOwner) {
      missingOwnerRows += 1;
      if (missingExamples.length < 10) missingExamples.push({ articleKey: row.articleKey || row.article || '', platform });
      return;
    }
    const mismatch = ownerMismatch(row, skuLookup);
    if (mismatch) {
      ownerMismatchRows += 1;
      if (mismatchExamples.length < 10) mismatchExamples.push(mismatch);
    }
  });
  if (missingOwnerRows) pushIssue(issues, options.missingSeverity || 'critical', `${label}_owner_missing`, { count: missingOwnerRows, examples: missingExamples });
  if (ownerMismatchRows) pushIssue(issues, options.mismatchSeverity || 'critical', `${label}_owner_mismatch`, { count: ownerMismatchRows, examples: mismatchExamples });
  if (unmatchedRows && options.unmatchedSeverity) pushIssue(issues, options.unmatchedSeverity, `${label}_owner_unmatched_sku`, { count: unmatchedRows, examples: unmatchedExamples });
  return { checkedRows, plannedRows, missingOwnerRows, ownerMismatchRows, unmatchedRows };
}

function auditExecutiveOwnerBindings(skus = [], issues) {
  const executivePlatforms = ['wb', 'ozon', 'ym', 'goldapple', 'letu', 'magnit', 'megamarket', 'samokat'];
  const activeSkus = (Array.isArray(skus) ? skus : []).filter((sku) => rowIsOwnerAuditable(sku));
  let ownerCardSkuRows = 0;
  let platformOwnerRows = 0;
  let missingOwnerRows = 0;
  const ownerBuckets = new Map();
  const platformOwnerBuckets = new Map();
  const ownersByPlatform = {};
  const missingExamples = [];
  activeSkus.forEach((sku) => {
    const planFact = sku.planFact && typeof sku.planFact === 'object' ? sku.planFact : {};
    const participates = hasAssignedPlan(planFact, sku)
      || (toNumber(planFact.factTotalRevenue) || 0) > 0
      || (toNumber(planFact.factFeb26Revenue) || 0) > 0
      || (toNumber(planFact.factFeb26Units) || 0) > 0;
    if (!participates) return;
    ownerCardSkuRows += 1;
    const owner = ownerValue(sku);
    if (!owner) {
      missingOwnerRows += 1;
      if (missingExamples.length < 10) missingExamples.push(sku.articleKey || sku.article || '');
      return;
    }
    const canonical = canonicalOwnerName(owner);
    ownerBuckets.set(canonical, (ownerBuckets.get(canonical) || 0) + 1);
    executivePlatforms.forEach((platform) => {
      const platformOwner = explicitOwnerForPlatform(sku, platform);
      if (!platformOwner) return;
      const platformCanonical = canonicalOwnerName(platformOwner);
      if (!platformCanonical) return;
      platformOwnerRows += 1;
      platformOwnerBuckets.set(platformCanonical, (platformOwnerBuckets.get(platformCanonical) || 0) + 1);
      ownersByPlatform[platform] = ownersByPlatform[platform] || {};
      ownersByPlatform[platform][platformCanonical] = (ownersByPlatform[platform][platformCanonical] || 0) + 1;
    });
  });
  if (missingOwnerRows) pushIssue(issues, 'critical', 'executive_owner_card_missing_binding', { count: missingOwnerRows, examples: missingExamples });
  const networkOwnerCount = ['goldapple', 'letu', 'magnit', 'megamarket', 'samokat']
    .reduce((sum, platform) => sum + Object.keys(ownersByPlatform[platform] || {}).length, 0);
  if (platformOwnerRows > 0 && networkOwnerCount <= 0) {
    pushIssue(issues, 'critical', 'executive_network_owner_bindings_missing', {
      count: platformOwnerRows,
      platforms: ['goldapple', 'letu', 'magnit', 'megamarket', 'samokat']
    });
  }
  return {
    ownerCardSkuRows,
    platformOwnerRows,
    missingOwnerRows,
    ownerCards: ownerBuckets.size,
    platformOwnerCards: platformOwnerBuckets.size,
    topOwners: [...ownerBuckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([owner, count]) => ({ owner, count })),
    topPlatformOwners: [...platformOwnerBuckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([owner, count]) => ({ owner, count })),
    ownersByPlatform
  };
}

function auditOwnerPropagation(layers = {}, issues) {
  const skus = Array.isArray(layers.skus) ? layers.skus : [];
  const skuLookup = buildSkuLookup(skus);
  const pricesAudit = auditOwnerDataset(
    'prices',
    platformRowsFromPayload(layers.prices, 'prices'),
    skuLookup,
    issues,
    { unmatchedSeverity: 'warning' }
  );
  const smartAudit = auditOwnerDataset(
    'smart_price_workbench',
    platformRowsFromPayload(layers.smartPriceWorkbench, 'smart_price_workbench'),
    skuLookup,
    issues,
    { unmatchedSeverity: 'warning' }
  );
  const planFactAudit = auditOwnerDataset(
    'plan_fact',
    platformRowsFromPayload(layers.priceSupport, 'price_workbench_support').filter(({ row }) => rowHasPlanOrFact(row)),
    skuLookup,
    issues,
    { unmatchedSeverity: 'warning' }
  );
  const executiveAudit = auditExecutiveOwnerBindings(skus, issues);
  return {
    executive: executiveAudit,
    prices: pricesAudit,
    smartPriceWorkbench: smartAudit,
    planFact: planFactAudit
  };
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

function auditOrderProcurement(order = {}, issues, skus = []) {
  const rows = Array.isArray(order.rows) ? order.rows : [];
  const skuLookup = buildSkuLookup(skus);
  let disabledRows = 0;
  let disabledNeedRows = 0;
  let missingOwnerNeedRows = 0;
  let unmatchedNeedRows = 0;
  let negativeMetricRows = 0;
  let targetNeed30 = 0;
  const ownerMismatches = [];
  rows.forEach((row) => {
    const need30 = toNumber(row.targetNeed30) || 0;
    targetNeed30 += need30;
    if (statusIsOld(row.lifecycleStatus || row.lifecycleLabel || row.status)) {
      disabledRows += 1;
      if (need30 > 0 || row.needSuppressedByLifecycle === false) disabledNeedRows += 1;
    }
    if (need30 > 0 && !String(row.owner || '').trim()) missingOwnerNeedRows += 1;
    if (need30 > 0 && String(row.matchState || '').toLowerCase() === 'unmatched') unmatchedNeedRows += 1;
    const mismatch = ownerMismatch(row, skuLookup);
    if (mismatch) ownerMismatches.push(mismatch);
    ['inStock', 'inTransit', 'inRequest', 'available', 'avgDaily', 'targetNeed7', 'targetNeed14', 'targetNeed28', 'targetNeed30'].forEach((field) => {
      const value = toNumber(row[field]);
      if (value !== null && value < 0) negativeMetricRows += 1;
    });
  });
  if (!rows.length) pushIssue(issues, 'critical', 'order_procurement_empty');
  if (disabledNeedRows) pushIssue(issues, 'critical', 'order_disabled_sku_has_need', { count: disabledNeedRows });
  if (missingOwnerNeedRows) pushIssue(issues, 'critical', 'order_need_missing_owner', { count: missingOwnerNeedRows });
  if (unmatchedNeedRows) pushIssue(issues, 'critical', 'order_need_unmatched_sku', { count: unmatchedNeedRows });
  if (ownerMismatches.length) pushIssue(issues, 'critical', 'order_owner_mismatch', { count: ownerMismatches.length, examples: ownerMismatches.slice(0, 10) });
  if (negativeMetricRows) pushIssue(issues, 'critical', 'order_negative_metric', { count: negativeMetricRows });
  return { rows: rows.length, disabledRows, disabledNeedRows, missingOwnerNeedRows, unmatchedNeedRows, ownerMismatchRows: ownerMismatches.length, negativeMetricRows, targetNeed30: Number(targetNeed30.toFixed(2)) };
}

function auditOosControl(oos = {}, issues, skus = []) {
  const rows = Array.isArray(oos.rows) ? oos.rows : [];
  const skuLookup = buildSkuLookup(skus);
  let missingOwnerRows = 0;
  let missingArticleRows = 0;
  let disabledRows = 0;
  let negativeMetricRows = 0;
  const ownerMismatches = [];
  rows.forEach((row) => {
    if (!String(row.articleKey || row.article || '').trim()) missingArticleRows += 1;
    if (!String(row.owner || '').trim() || String(row.owner || '').toLowerCase() === 'без owner') missingOwnerRows += 1;
    if (statusIsOld(row.lifecycleStatus || row.lifecycleLabel || row.status)) disabledRows += 1;
    const mismatch = ownerMismatch(row, skuLookup);
    if (mismatch) ownerMismatches.push(mismatch);
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
  if (ownerMismatches.length) pushIssue(issues, 'critical', 'oos_owner_mismatch', { count: ownerMismatches.length, examples: ownerMismatches.slice(0, 10) });
  if (negativeMetricRows) pushIssue(issues, 'critical', 'oos_negative_metric', { count: negativeMetricRows });
  return { rows: rows.length, dataStatus: oos.summary?.dataStatus || '', dataDate: oos.summary?.dataDate || '', missingOwnerRows, missingArticleRows, disabledRows, ownerMismatchRows: ownerMismatches.length, negativeMetricRows };
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

function auditOutOfScopeBrands(layers = {}, issues) {
  const pattern = /qeep|zarli|harly|harley/i;
  const matches = [];
  Object.entries(layers || {}).forEach(([label, payload]) => {
    const text = JSON.stringify(payload || {});
    const count = (text.match(new RegExp(pattern, 'gi')) || []).length;
    if (count > 0) matches.push({ layer: label, count });
  });
  if (matches.length) {
    pushIssue(issues, 'critical', 'out_of_scope_brand_in_core_layers', { matches });
  }
  return { matches };
}

function auditUserVisibleQualityOutOfScope(dataQuality = {}, issues) {
  const pattern = /qeep|zarli|harly|harley/i;
  const qualityIssues = Array.isArray(dataQuality.issues) ? dataQuality.issues : [];
  const matches = qualityIssues
    .filter((issue) => pattern.test(JSON.stringify(issue || {})))
    .slice(0, 20)
    .map((issue) => ({
      type: issue.type || '',
      dataset: issue.dataset || '',
      articleKey: issue.articleKey || issue.name || ''
    }));
  if (matches.length) {
    pushIssue(issues, 'critical', 'out_of_scope_brand_in_user_quality_journal', {
      count: matches.length,
      examples: matches
    });
  }
  return { matches };
}

function main() {
  const args = parseArgs(process.argv);
  const dataDir = path.resolve(args.dataDir || 'data');
  const issues = [];
  const required = [
    'skus.json',
    'sku_matrix.json',
    'prices.json',
    'smart_price_workbench.json',
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
  const smartPriceWorkbench = payloads['smart_price_workbench.json'];
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
  const ownerPropagationAudit = auditOwnerPropagation({
    skus: Array.isArray(skus) ? skus : [],
    prices,
    smartPriceWorkbench,
    priceSupport
  }, issues);
  const repricerAudit = auditRepricer(repricer, issues);
  const outOfScopeAudit = auditOutOfScopeBrands({
    skus,
    skuMatrix: matrix,
    prices,
    smartPriceWorkbench,
    priceSupport,
    repricer
  }, issues);
  const userQualityOutOfScopeAudit = auditUserVisibleQualityOutOfScope(quality, issues);
  const iuDrrAudit = auditIuDrr(iuDrr, issues);
  const oosAudit = auditOosControl(oos, issues, Array.isArray(skus) ? skus : []);
  const orderAudit = auditOrderProcurement(order, issues, Array.isArray(skus) ? skus : []);
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
      ownerPropagation: ownerPropagationAudit,
      outOfScopeBrands: outOfScopeAudit,
      userQualityOutOfScopeBrands: userQualityOutOfScopeAudit,
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
