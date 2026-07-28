#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  asIsoDate,
  firstNumber,
  firstPositive,
  mergeSmartPriceContour,
  normalizeKey,
  safeReadJson
} = require('./smart-price-contour');
const { evaluateIndicator, readJson: readPolicyJson } = require('./portal-indicator-engine');

const PLATFORM_KEYS = ['wb', 'ozon', 'ym', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit'];
const OUTPUT_FILE = 'canonical_repricer.json';
const RECONCILIATION_FILE = 'portal_repricing_reconciliation.json';

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
  const inputDir = path.resolve(args['input-dir'] || path.join(root, 'data'));
  return {
    inputDir,
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output')),
    liveWorkbenchPath: path.resolve(args['live-file'] || path.join(inputDir, 'repricer_live_prices.json')),
    legacyLiveWorkbenchPath: path.resolve(args['legacy-live-file'] || path.join(root, 'tmp-smart_price_workbench-live.json')),
    asOfDate: asIsoDate(args['as-of-date'] || args['reference-date'] || new Date().toISOString()),
    policyPath: path.resolve(args['policy'] || path.join(root, 'data', 'portal_indicator_policy.json')),
    metricRegistryPath: path.resolve(args['metric-registry'] || path.join(root, 'data', 'portal_metric_registry.json')),
    featurePolicyPath: path.resolve(args['feature-policy'] || path.join(root, 'data', 'portal_feature_policy.json')),
    economicsPolicyPath: path.resolve(args['economics-policy'] || path.join(inputDir, 'repricer_economics_policy.json')),
    priceObservationHistoryPath: path.resolve(args['price-history'] || path.join(inputDir, 'repricer_price_observation_history.json')),
    noFail: Boolean(args['no-fail']),
    noWrite: Boolean(args['no-write'])
  };
}

function readJsonFile(filePath, fallback = null) {
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

function file(inputDir, name) {
  return path.join(inputDir, name);
}

function sourceMeta(inputDir, names) {
  return Object.fromEntries(names.map((name) => {
    const filePath = file(inputDir, name);
    return [name, {
      file: name,
      exists: fs.existsSync(filePath),
      sha256: sha256File(filePath)
    }];
  }));
}

function sourcePathMeta(filePath, label = path.basename(filePath || '')) {
  return {
    file: label,
    exists: Boolean(filePath && fs.existsSync(filePath)),
    sha256: filePath ? sha256File(filePath) : ''
  };
}

function payloadRows(payload = {}) {
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (payload?.rows && typeof payload.rows === 'object') return Object.values(payload.rows);
  return [];
}

function platformRows(payload = {}, platform = '') {
  const rows = payload?.platforms?.[platform]?.rows;
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === 'object') return Object.values(rows);
  return [];
}

function buildMap(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = normalizeKey(row?.articleKey || row?.article || row?.sku || row?.offerId);
    if (!key || map.has(key)) return;
    map.set(key, row);
  });
  return map;
}

function buildSharedProductCostMap(payload = {}, platforms = []) {
  const candidates = new Map();
  platforms.forEach((platform) => {
    platformRows(payload, platform).forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article || row?.sku || row?.offerId);
      const cost = firstPositive(row?.costRub, row?.cost, row?.costPrice);
      if (!key || cost === null) return;
      const bucket = candidates.get(key) || [];
      bucket.push({
        cost,
        platform: String(platform || '').trim().toLowerCase()
      });
      candidates.set(key, bucket);
    });
  });

  const shared = new Map();
  candidates.forEach((rows, key) => {
    const uniqueCosts = [...new Set(rows.map((row) => Math.round(row.cost * 100)))];
    if (uniqueCosts.length !== 1) return;
    shared.set(key, {
      cost: uniqueCosts[0] / 100,
      sourceStore: 'smart_price_workbench_cross_platform',
      sourceFile: 'smart_price_workbench.json+smart_price_overlay.json',
      sourceChecksum: '',
      batchId: '',
      id: `shared-cost:${key}`
    });
  });
  return shared;
}

function buildProcurementMap(payload = {}) {
  const rows = payloadRows(payload);
  const map = new Map();
  rows.forEach((row) => {
    const key = normalizeKey(row?.articleKey || row?.article || row?.sku || row?.offerId);
    if (!key) return;
    const current = map.get(key) || {
      present: true,
      inStock: 0,
      inTransit: 0,
      inRequest: 0,
      avgDaily: 0,
      sales7: 0,
      sales14: 0,
      sales28: 0,
      sales30: 0,
      demandRows: 0,
      date: asIsoDate(row?.asOfDate || row?.date || payload?.asOfDate || payload?.generatedAt || '')
    };
    current.inStock += firstNumber(row?.inStock, row?.stock, row?.stockUnits, 0) || 0;
    current.inTransit += firstNumber(row?.inTransit, row?.stockInTransit, 0) || 0;
    current.inRequest += firstNumber(row?.inRequest, row?.stockInSupplyRequest, 0) || 0;
    current.avgDaily += firstNumber(row?.avgDaily, row?.averageDailySales, 0) || 0;
    current.sales7 += firstNumber(row?.sales7, row?.sales_7d, 0) || 0;
    current.sales14 += firstNumber(row?.sales14, row?.sales_14d, 0) || 0;
    current.sales28 += firstNumber(row?.sales28, row?.sales_28d, 0) || 0;
    current.sales30 += firstNumber(row?.sales30, row?.sales_30d, 0) || 0;
    if (firstNumber(row?.avgDaily, row?.averageDailySales) !== null) current.demandRows += 1;
    map.set(key, current);
  });
  return {
    snapshotAvailable: rows.length > 0,
    generatedAt: payload?.generatedAt || '',
    asOfDate: asIsoDate(payload?.asOfDate || payload?.generatedAt || ''),
    map
  };
}

function buildPriceObservationMap(payload = {}) {
  const map = new Map();
  const normalizedBuckets = new Map();
  payloadRows(payload).forEach((row) => {
    const platform = String(row?.platform || '').trim().toLowerCase();
    const articleKey = normalizeKey(row?.article_key || row?.articleKey || row?.article || '');
    if (!platform || !articleKey) return;
    const observations = (Array.isArray(row?.observations) ? row.observations : [])
      .map((observation) => ({
        sellerPrice: firstPositive(observation?.seller_price, observation?.sellerPrice),
        clientPrice: firstPositive(observation?.client_price, observation?.clientPrice),
        firstSeenAt: String(observation?.first_seen_at || observation?.firstSeenAt || '').trim(),
        lastSeenAt: String(observation?.last_seen_at || observation?.lastSeenAt || observation?.first_seen_at || '').trim(),
        source: String(observation?.source || '').trim()
      }))
      .filter((observation) => observation.sellerPrice !== null && asIsoDate(observation.firstSeenAt))
      .sort((left, right) => Date.parse(left.firstSeenAt) - Date.parse(right.firstSeenAt));
    const history = {
      present: observations.length > 0,
      observations
    };
    const exactArticleKey = String(row?.article_key || row?.articleKey || row?.article || '').trim().toLowerCase();
    map.set(`${platform}|${articleKey}|${exactArticleKey}`, history);
    const normalizedKey = `${platform}|${articleKey}`;
    const bucket = normalizedBuckets.get(normalizedKey) || [];
    bucket.push(history);
    normalizedBuckets.set(normalizedKey, bucket);
  });
  normalizedBuckets.forEach((histories, key) => {
    if (histories.length === 1) map.set(key, histories[0]);
  });
  return map;
}

function buildLiveSignalBucket(payload = {}, platform = '') {
  const platformSignal = payload?.platforms?.[platform] || {};
  const stockPayload = platformSignal?.stock || {};
  const rows = Array.isArray(stockPayload?.rows)
    ? stockPayload.rows
    : (Array.isArray(payload?.rows)
      ? payload.rows.filter((row) => String(row?.platform || '').trim().toLowerCase() === platform)
      : []);
  const status = String(stockPayload?.status || '').trim().toLowerCase();
  const snapshotAvailable = ['trusted_direct', 'trusted_fallback'].includes(status) && rows.length > 0;
  const map = new Map();
  rows.forEach((row) => {
    const key = normalizeKey(row?.articleKey || row?.article || row?.sku || '');
    if (!key) return;
    map.set(key, {
      present: true,
      inStock: firstNumber(row?.available, row?.stock, row?.inStock, 0) || 0,
      inTransit: firstNumber(row?.inbound, row?.inTransit, 0) || 0,
      inRequest: firstNumber(row?.inRequest, 0) || 0,
      date: asIsoDate(row?.asOfDate || stockPayload?.asOfDate || payload?.asOfDate || payload?.generatedAt || ''),
      source: row?.source || stockPayload?.source || 'repricer_live_signals.json',
      sourceMode: row?.sourceMode || stockPayload?.sourceMode || '',
      partialOos: Boolean(row?.partialOos),
      oosRiskStatus: String(row?.oosRiskStatus || ''),
      oosRiskRule: String(row?.oosRiskRule || ''),
      turnoverDays: row?.turnoverDays === null || row?.turnoverDays === undefined
        ? null
        : firstNumber(row?.turnoverDays),
      oosTaskId: String(row?.oosTaskId || '')
    });
  });
  return {
    snapshotAvailable,
    generatedAt: payload?.generatedAt || '',
    asOfDate: asIsoDate(stockPayload?.asOfDate || payload?.asOfDate || payload?.generatedAt || ''),
    status,
    source: stockPayload?.source || '',
    map,
    platformSignal
  };
}

function approvedRecord(record = {}) {
  const status = String(record.approvalStatus || record.status || '').trim().toLowerCase();
  const approvedAt = String(record.approvedAt || record.approved_at || '').trim();
  const approvedBy = String(record.approvedBy || record.approved_by || '').trim();
  const hasMetadata = String(record.author || record.createdBy || record.created_by || '').trim()
    && String(record.role || record.authorRole || record.author_role || '').trim()
    && String(record.reason || record.note || '').trim()
    && String(record.createdAt || record.created_at || '').trim()
    && approvedBy
    && approvedAt;
  if (!hasMetadata) return false;
  if (status && !['approved', 'active'].includes(status)) return false;
  const expiresAt = String(record.expiresAt || record.expires_at || '').trim();
  if (expiresAt && Date.parse(expiresAt) && Date.parse(expiresAt) < Date.now()) return false;
  return true;
}

function approvalMap(inputDir) {
  const payload = readJsonFile(file(inputDir, 'repricer_approved_overrides.json'), { records: [] });
  const records = Array.isArray(payload?.records) ? payload.records : (Array.isArray(payload) ? payload : []);
  const map = new Map();
  records.filter(approvedRecord).forEach((record) => {
    const platform = String(record.platform || 'all').trim().toLowerCase() || 'all';
    const key = normalizeKey(record.articleKey || record.article || record.sku || '');
    if (!key) return;
    map.set(`${platform}|${key}`, record);
  });
  return map;
}

function approvalFor(map, articleKey, platform) {
  const key = normalizeKey(articleKey || '');
  return map.get(`${platform}|${key}`) || map.get(`all|${key}`) || null;
}

function lifecycleApprovalMap(inputDir) {
  const payload = readJsonFile(file(inputDir, 'product_lifecycle_approved.json'), { records: [] });
  const records = Array.isArray(payload?.records) ? payload.records : (Array.isArray(payload) ? payload : []);
  const map = new Map();
  records.filter(approvedRecord).forEach((record) => {
    const articleKey = normalizeKey(record.articleKey || record.article || record.sku || '');
    const platform = String(record.platform || 'all').trim().toLowerCase() || 'all';
    const lifecycleKey = normalizeLifecycleKey({
      productLifecycleStatus: record.lifecycleKey || record.productLifecycleStatus || record.productStatus || record.proposedStatus
    });
    if (!articleKey || !lifecycleKey) return;
    map.set(`${platform}|${articleKey}`, { ...record, lifecycleKey });
  });
  return map;
}

function lifecycleApprovalFor(map, articleKey, platform) {
  const key = normalizeKey(articleKey || '');
  return map.get(`${platform}|${key}`) || map.get(`all|${key}`) || null;
}

function registryRows(payload = {}) {
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload)) return payload;
  return [];
}

function serverApprovedRegistryRecord(row = {}) {
  const status = String(row.approvalStatus || row.status || '').trim().toLowerCase();
  const sourceStore = String(row.sourceStore || row.source_store || row.source || '').trim().toLowerCase();
  const metadataComplete = Boolean(
    sourceStore
    && sourceStore !== 'local_storage_draft_only'
    && String(row.id || '').trim()
    && String(row.batchId || row.batch_id || '').trim()
    && String(row.author || row.createdBy || row.created_by || '').trim()
    && String(row.role || row.authorRole || row.author_role || '').trim()
    && String(row.reason || row.note || '').trim()
    && String(row.createdAt || row.created_at || '').trim()
    && String(row.approvedBy || row.approved_by || '').trim()
    && String(row.approvedAt || row.approved_at || '').trim()
    && String(row.sourceFile || row.source_file || '').trim()
    && String(row.sourceChecksum || row.source_checksum || '').trim()
  );
  return metadataComplete && ['approved', 'active', 'verified'].includes(status);
}

function latestEffectiveRecord(rows = [], articleKey = '', platform = '') {
  const normalized = normalizeKey(articleKey || '');
  const platformKey = String(platform || '').trim().toLowerCase();
  return rows
    .filter((row) => normalizeKey(row?.articleKey || row?.article || row?.sku || '') === normalized)
    .filter((row) => {
      const rowPlatform = String(row?.platform || '').trim().toLowerCase();
      return !platformKey || !rowPlatform || rowPlatform === 'all' || rowPlatform === platformKey;
    })
    .filter(serverApprovedRegistryRecord)
    .sort((left, right) => String(right.effectiveFrom || right.createdAt || '').localeCompare(String(left.effectiveFrom || left.createdAt || '')))
    [0] || null;
}

function minMaxRegistry(inputDir) {
  return registryRows(readJsonFile(file(inputDir, 'repricer_minmax_registry.json'), { rows: [] }));
}

function costRegistry(inputDir) {
  return registryRows(readJsonFile(file(inputDir, 'repricer_cost_registry.json'), { rows: [] }));
}

function featureReadiness(rows = [], featurePolicy = {}) {
  const eligibleRows = rows.length;
  const publishableRows = rows.filter((row) => row?.recommendation?.status === 'ready').length;
  const blockedRows = Math.max(eligibleRows - publishableRows, 0);
  const policy = featurePolicy?.features?.repricer || {};
  const requiredCoverage = Number.isFinite(Number(policy.required_publishable_coverage))
    ? Number(policy.required_publishable_coverage)
    : 0.01;
  const publishableCoverage = eligibleRows ? Number((publishableRows / eligibleRows).toFixed(6)) : 0;
  const maintenance = policy.maintenance_mode === true && Boolean(String(policy.maintenance_reason || '').trim());
  let featureStatus = 'ok';
  const warnings = [];
  if (maintenance) {
    featureStatus = 'maintenance';
    warnings.push(`repricer maintenance mode: ${policy.maintenance_reason}`);
  } else if (eligibleRows > 0 && publishableRows === 0) {
    featureStatus = 'blocked';
    warnings.push(`repricer feature blocked: 0/${eligibleRows} publishable recommendations`);
  } else if (eligibleRows > 0 && publishableCoverage + 1e-9 < requiredCoverage) {
    featureStatus = 'degraded';
    warnings.push(`repricer feature degraded: ${publishableRows}/${eligibleRows} publishable recommendations below required coverage ${requiredCoverage}`);
  }
  return {
    feature_status: featureStatus,
    eligible_rows: eligibleRows,
    publishable_rows: publishableRows,
    blocked_rows: blockedRows,
    publishable_coverage: publishableCoverage,
    required_publishable_coverage: requiredCoverage,
    feature_publish_allowed: featureStatus === 'ok',
    maintenance_mode: maintenance,
    warnings
  };
}

function normalizePct(value) {
  const parsed = firstNumber(value);
  if (parsed === null) return null;
  if (parsed > 1 && parsed <= 100) return parsed / 100;
  return parsed;
}

function clientPriceProjection(sellerBefore, clientBefore, sppPct, sellerAfter) {
  const seller = firstPositive(sellerBefore);
  const client = firstPositive(clientBefore);
  const explicitDiscount = normalizePct(sppPct);
  let factor = null;
  let source = '';
  if (seller !== null && client !== null && client <= seller + 0.01) {
    factor = Math.max(0.05, Math.min(1, client / seller));
    source = 'current_client_price_ratio';
  } else if (explicitDiscount !== null && explicitDiscount >= 0 && explicitDiscount <= 0.95) {
    factor = 1 - explicitDiscount;
    source = 'current_spp_pct';
  }
  const after = firstPositive(sellerAfter);
  const buyerDiscountPct = factor === null ? null : Number((1 - factor).toFixed(6));
  return {
    client_price_before: client,
    buyer_discount_factor: factor === null ? null : Number(factor.toFixed(6)),
    effective_buyer_discount_pct: buyerDiscountPct,
    expected_client_price_after: factor === null || after === null
      ? null
      : Number((after * factor).toFixed(2)),
    source
  };
}

function normalizePolicyPct(value) {
  const parsed = normalizePct(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function firstConfiguredNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || String(value).trim() === '') continue;
    const parsed = Number(String(value).replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstConfiguredPct(...values) {
  const parsed = firstConfiguredNumber(...values);
  if (parsed === null) return null;
  return parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
}

function normalizeLifecycleKey(...records) {
  const raw = records
    .filter((record) => record && typeof record === 'object')
    .flatMap((record) => [
      record.productLifecycleStatus,
      record.lifecycleStatus,
      record.productStatus,
      record.registryStatus,
      record.repricerStatus,
      record.status
    ])
    .find((value) => String(value || '').trim());
  const text = String(raw || '').trim().toLowerCase().replace(/ё/g, 'е');
  if (!text) return '';
  if (/перезапуск|relaunch|restart/.test(text)) return 'relaunch';
  if (/новин|новый|\bnew\b|\blaunch\b|запуск/.test(text)) return 'new';
  if (/актуал|active|в работе|работает/.test(text)) return 'active';
  if (/вывод|вывед|архив|exit|archiv|removed/.test(text)) return 'exit';
  if (/нет на площадке|не представлен|not.?listed|absent/.test(text)) return 'not_listed';
  if (/пауза|замороз|freeze|hold|стоп/.test(text)) return 'paused';
  if (/вопрос|перераб|review/.test(text)) return 'question';
  return 'other';
}

function marginGuardRequired(lifecycleKey = '') {
  return ['active', 'new', 'relaunch'].includes(String(lifecycleKey || '').trim().toLowerCase());
}

function targetMarginFloor(economics = {}, targetMarginPct = null) {
  const target = normalizePolicyPct(targetMarginPct);
  if (!economics.complete || target === null || target <= 0 || target >= 1) return null;
  return marginFloorForRatio(economics, target);
}

function liquidationMarginFloor(economics = {}, minimumMarginPct = null) {
  const minimum = normalizePolicyPct(minimumMarginPct);
  if (!economics.complete || minimum === null || minimum < 0 || minimum >= 1) return null;
  return marginFloorForRatio(economics, minimum);
}

function marginFloorForRatio(economics = {}, marginRatio = null) {
  const denominator = 1
    - (economics.commission_pct || 0)
    - (economics.internal_advertising_pct || 0)
    - (economics.tax_pct || 0)
    - marginRatio;
  if (denominator <= 0) return null;
  return Math.ceil(((economics.cost || 0) + economicsFixedCostsPerUnit(economics)) / denominator);
}

function targetMarginCap(economics = {}, maximumMarginPct = null) {
  const maximum = normalizePolicyPct(maximumMarginPct);
  if (!economics.complete || maximum === null || maximum <= 0 || maximum >= 1) return null;
  const denominator = 1
    - (economics.commission_pct || 0)
    - (economics.internal_advertising_pct || 0)
    - (economics.tax_pct || 0)
    - maximum;
  if (denominator <= 0) return null;
  return Math.floor(((economics.cost || 0) + economicsFixedCostsPerUnit(economics)) / denominator);
}

function economicsFixedCostsPerUnit(economics = {}) {
  const platformCosts = firstConfiguredNumber(economics.platform_costs_per_unit);
  const internalAdvertising = firstConfiguredNumber(economics.internal_advertising_per_unit);
  if (platformCosts !== null && internalAdvertising !== null) {
    return platformCosts + internalAdvertising;
  }
  return firstConfiguredNumber(
    economics.fixed_costs_per_unit,
    economics.logistics_per_unit
  ) || 0;
}

function priceDate(row = {}) {
  return asIsoDate(row.currentPriceDate || row.currentFillPriceDate || row.valueDate || row.historyFreshnessDate || '');
}

function dateAgeDays(value = '', referenceValue = '') {
  const date = asIsoDate(value);
  const referenceDate = asIsoDate(referenceValue);
  if (!date || !referenceDate) return null;
  const stamp = Date.parse(`${date}T00:00:00Z`);
  const referenceStamp = Date.parse(`${referenceDate}T00:00:00Z`);
  if (!Number.isFinite(stamp) || !Number.isFinite(referenceStamp)) return null;
  return Math.max(0, (referenceStamp - stamp) / 86400000);
}

function currentPriceMaxAgeDays(economicsPolicy = {}) {
  const configured = firstConfiguredNumber(
    economicsPolicy?.priceFreshness?.maxAgeDays,
    economicsPolicy?.currentPriceMaxAgeDays,
    economicsPolicy?.current_price_max_age_days
  );
  return configured !== null && configured >= 0 ? configured : 2;
}

function sharpPriceApprovalPct(economicsPolicy = {}) {
  const configured = firstConfiguredPct(
    economicsPolicy?.approval?.sharpPriceChangePct,
    economicsPolicy?.sharpPriceApprovalPct,
    economicsPolicy?.sharp_price_approval_pct
  );
  return configured !== null && configured > 0 && configured < 1 ? configured : 0.10;
}

function extremePriceChangePct(economicsPolicy = {}) {
  const configured = firstConfiguredPct(
    economicsPolicy?.approval?.extremePriceChangePct,
    economicsPolicy?.extremePriceChangePct,
    economicsPolicy?.extreme_price_change_pct
  );
  return configured !== null && configured >= 1 ? configured : 1;
}

function demandPricingPolicy(economicsPolicy = {}, platform = '', targetTurnoverDays = 30) {
  const root = economicsPolicy?.demandPricing && typeof economicsPolicy.demandPricing === 'object'
    ? economicsPolicy.demandPricing
    : {};
  const platformKey = String(platform || '').trim().toLowerCase();
  const platformRule = root?.platforms?.[platformKey] && typeof root.platforms[platformKey] === 'object'
    ? root.platforms[platformKey]
    : {};
  const configuredTarget = firstConfiguredNumber(
    platformRule.targetTurnoverDays,
    root.targetTurnoverDays,
    targetTurnoverDays
  );
  const tierValues = Array.isArray(platformRule.overstockRatios)
    ? platformRule.overstockRatios
    : (Array.isArray(root.overstockRatios) ? root.overstockRatios : [1.5, 2, 3]);
  const overstockRatios = tierValues
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 1)
    .sort((left, right) => left - right);
  const normalizedRatios = overstockRatios.length >= 3
    ? overstockRatios.slice(0, 3)
    : [1.5, 2, 3];
  const configuredDecreaseSteps = Array.isArray(platformRule.decreaseStepsPct)
    ? platformRule.decreaseStepsPct
    : (Array.isArray(root.decreaseStepsPct) ? root.decreaseStepsPct : []);
  const fallbackDecreaseSteps = platformKey === 'ozon' ? [0.05, 0.05, 0.05] : [0.01, 0.02, 0.03];
  const decreaseStepsPct = normalizedRatios.map((_, index) => {
    const configured = firstConfiguredPct(configuredDecreaseSteps[index]);
    return configured !== null && configured > 0 && configured <= 0.10
      ? configured
      : fallbackDecreaseSteps[index];
  });
  const configuredIncrease = firstConfiguredPct(
    platformRule.increaseStepPct,
    root.increaseStepPct
  );
  const configuredWeights = platformRule.forecastWeights || root.forecastWeights || {};
  const rawForecastWeights = {
    recent7: Math.max(0, firstConfiguredNumber(configuredWeights.recent7) ?? 0.55),
    prior7: Math.max(0, firstConfiguredNumber(configuredWeights.prior7) ?? 0.30),
    prior14: Math.max(0, firstConfiguredNumber(configuredWeights.prior14) ?? 0.15)
  };
  const forecastWeightTotal = Object.values(rawForecastWeights).reduce((sum, value) => sum + value, 0) || 1;
  const forecastWeights = Object.fromEntries(
    Object.entries(rawForecastWeights).map(([key, value]) => [key, value / forecastWeightTotal])
  );
  return {
    enabled: root.enabled === true,
    reviewRequired: root.reviewRequired !== false,
    autoApply: root.autoApply === true,
    approvalTtlHours: Math.max(
      1,
      firstConfiguredNumber(platformRule.approvalTtlHours, root.approvalTtlHours) ?? 72
    ),
    maxAgeDays: Math.max(0, firstConfiguredNumber(platformRule.maxAgeDays, root.maxAgeDays) ?? 2),
    minAvgDailyUnits: Math.max(0, firstConfiguredNumber(platformRule.minAvgDailyUnits, root.minAvgDailyUnits) ?? 0.1),
    minSales28Units: Math.max(0, firstConfiguredNumber(platformRule.minSales28Units, root.minSales28Units) ?? 3),
    targetTurnoverDays: configuredTarget !== null && configuredTarget > 0 ? configuredTarget : 30,
    lowStockRatio: Math.max(0.05, Math.min(1, firstConfiguredNumber(
      platformRule.lowStockRatio,
      root.lowStockRatio
    ) ?? 0.6)),
    overstockRatios: normalizedRatios,
    increaseStepPct: configuredIncrease !== null && configuredIncrease > 0 && configuredIncrease <= 0.10
      ? configuredIncrease
      : (platformKey === 'ozon' ? 0.05 : 0.02),
    decreaseStepsPct,
    forecastWeights,
    minForecastMultiplier: Math.max(0.1, Math.min(1, firstConfiguredNumber(
      platformRule.minForecastMultiplier,
      root.minForecastMultiplier
    ) ?? 0.5)),
    maxForecastMultiplier: Math.max(1, Math.min(3, firstConfiguredNumber(
      platformRule.maxForecastMultiplier,
      root.maxForecastMultiplier
    ) ?? 1.75)),
    accelerationThreshold: Math.max(1.05, firstConfiguredNumber(
      platformRule.accelerationThreshold,
      root.accelerationThreshold
    ) ?? 1.25),
    decelerationThreshold: Math.max(0.1, Math.min(0.95, firstConfiguredNumber(
      platformRule.decelerationThreshold,
      root.decelerationThreshold
    ) ?? 0.75)),
    minDataQualityScore: Math.max(0, Math.min(100, firstConfiguredNumber(
      platformRule.minDataQualityScore,
      root.minDataQualityScore
    ) ?? 65)),
    decreaseMinDataQualityScore: Math.max(0, Math.min(100, firstConfiguredNumber(
      platformRule.decreaseMinDataQualityScore,
      root.decreaseMinDataQualityScore
    ) ?? 85)),
    highConfidenceMinSales28Units: Math.max(1, firstConfiguredNumber(
      platformRule.highConfidenceMinSales28Units,
      root.highConfidenceMinSales28Units
    ) ?? 28),
    cooldownDays: Math.max(0, firstConfiguredNumber(
      platformRule.cooldownDays,
      root.cooldownDays
    ) ?? 3),
    dailyHistoryMaxAgeDays: Math.max(0, firstConfiguredNumber(
      platformRule.dailyHistoryMaxAgeDays,
      root.dailyHistoryMaxAgeDays
    ) ?? 7),
    minObservedDailyHistoryDays: Math.max(1, firstConfiguredNumber(
      platformRule.minObservedDailyHistoryDays,
      root.minObservedDailyHistoryDays
    ) ?? 14)
  };
}

function demandTier(ratio, thresholds = []) {
  if (!Number.isFinite(ratio) || thresholds.length < 3) return -1;
  if (ratio >= thresholds[2]) return 2;
  if (ratio >= thresholds[1]) return 1;
  if (ratio >= thresholds[0]) return 0;
  return -1;
}

function demandForecast({
  avgDaily = null,
  sales7 = null,
  sales14 = null,
  sales28 = null,
  config = {}
} = {}) {
  const baselineDaily = firstNumber(avgDaily);
  const valuesPresent = [sales7, sales14, sales28].every((value) => firstNumber(value) !== null);
  const normalizedSales7 = Math.max(0, firstNumber(sales7, 0) || 0);
  const normalizedSales14 = Math.max(0, firstNumber(sales14, 0) || 0);
  const normalizedSales28 = Math.max(0, firstNumber(sales28, 0) || 0);
  const windowsConsistent = Boolean(
    valuesPresent
    && normalizedSales14 + 1e-9 >= normalizedSales7
    && normalizedSales28 + 1e-9 >= normalizedSales14
  );
  if (!windowsConsistent) {
    return {
      model: 'baseline_avg_daily_fallback',
      windows_consistent: false,
      baseline_daily_units: baselineDaily,
      forecast_daily_units: baselineDaily,
      recent_7d_daily_units: valuesPresent ? Number((normalizedSales7 / 7).toFixed(6)) : null,
      prior_7d_daily_units: null,
      prior_14d_daily_units: null,
      momentum_ratio: null,
      trend: 'unknown',
      raw_forecast_daily_units: baselineDaily
    };
  }

  const recent7Daily = normalizedSales7 / 7;
  const prior7Daily = Math.max(0, normalizedSales14 - normalizedSales7) / 7;
  const prior14Daily = Math.max(0, normalizedSales28 - normalizedSales14) / 14;
  const weights = config.forecastWeights || { recent7: 0.55, prior7: 0.30, prior14: 0.15 };
  const rawForecast = recent7Daily * weights.recent7
    + prior7Daily * weights.prior7
    + prior14Daily * weights.prior14;
  const fallbackBaseline = normalizedSales28 > 0 ? normalizedSales28 / 28 : baselineDaily;
  const comparisonBaseline = baselineDaily !== null && baselineDaily > 0 ? baselineDaily : fallbackBaseline;
  const minForecast = comparisonBaseline !== null
    ? comparisonBaseline * (config.minForecastMultiplier ?? 0.5)
    : 0;
  const maxForecast = comparisonBaseline !== null
    ? comparisonBaseline * (config.maxForecastMultiplier ?? 1.75)
    : rawForecast;
  const forecastDaily = Math.max(minForecast, Math.min(maxForecast, rawForecast));
  const older21Daily = Math.max(0, normalizedSales28 - normalizedSales7) / 21;
  const momentumRatio = older21Daily > 0
    ? recent7Daily / older21Daily
    : (recent7Daily > 0 ? config.maxForecastMultiplier || 1.75 : 1);
  const trend = momentumRatio >= (config.accelerationThreshold ?? 1.25)
    ? 'accelerating'
    : (momentumRatio <= (config.decelerationThreshold ?? 0.75) ? 'decelerating' : 'stable');
  return {
    model: 'weighted_7_14_28_v2',
    windows_consistent: true,
    baseline_daily_units: baselineDaily,
    forecast_daily_units: Number(forecastDaily.toFixed(6)),
    recent_7d_daily_units: Number(recent7Daily.toFixed(6)),
    prior_7d_daily_units: Number(prior7Daily.toFixed(6)),
    prior_14d_daily_units: Number(prior14Daily.toFixed(6)),
    momentum_ratio: Number(momentumRatio.toFixed(4)),
    trend,
    raw_forecast_daily_units: Number(rawForecast.toFixed(6))
  };
}

function dailyDemandWindow(sourceRow = {}, snapshotAsOf = '', config = {}) {
  const daily = Array.isArray(sourceRow?.daily)
    ? sourceRow.daily
    : (Array.isArray(sourceRow?.monthly) ? sourceRow.monthly : []);
  const byDate = new Map();
  daily.forEach((item) => {
    const date = asIsoDate(item?.date || item?.valueDate || '');
    const delivered = firstNumber(item?.deliveredUnits);
    const ordered = firstNumber(item?.ordersUnits);
    const units = delivered !== null ? delivered : ordered;
    if (!date || units === null || units < 0) return;
    byDate.set(date, Math.max(byDate.get(date) || 0, units));
  });
  const dates = [...byDate.keys()].sort();
  const historyAsOf = dates[dates.length - 1] || '';
  const historyAgeDays = dateAgeDays(historyAsOf, snapshotAsOf);
  const maxAgeDays = config.dailyHistoryMaxAgeDays ?? 7;
  const minimumObservedDays = config.minObservedDailyHistoryDays ?? 14;
  if (!historyAsOf || historyAgeDays === null) {
    return {
      usable: false,
      as_of: '',
      age_days: null,
      observed_days_28d: 0,
      reason: 'daily_history_missing'
    };
  }
  const endStamp = Date.parse(`${historyAsOf}T00:00:00Z`);
  const fromDate = (daysBack) => new Date(endStamp - daysBack * 86400000).toISOString().slice(0, 10);
  const sumFrom = (daysBack) => {
    const start = fromDate(daysBack - 1);
    return [...byDate.entries()]
      .filter(([date]) => date >= start && date <= historyAsOf)
      .reduce((sum, [, units]) => sum + units, 0);
  };
  const observedDays28 = dates.filter((date) => date >= fromDate(27) && date <= historyAsOf).length;
  const usable = historyAgeDays <= maxAgeDays && observedDays28 >= minimumObservedDays;
  return {
    usable,
    as_of: historyAsOf,
    age_days: historyAgeDays,
    observed_days_28d: observedDays28,
    sales7: Number(sumFrom(7).toFixed(6)),
    sales14: Number(sumFrom(14).toFixed(6)),
    sales28: Number(sumFrom(28).toFixed(6)),
    reason: historyAgeDays > maxAgeDays
      ? 'daily_history_stale'
      : (observedDays28 < minimumObservedDays ? 'daily_history_sparse' : '')
  };
}

function priceChangeSignal(priceHistory = null, currentPrice = null, snapshotAsOf = '', cooldownDays = 3) {
  const observations = (Array.isArray(priceHistory?.observations) ? priceHistory.observations : [])
    .map((observation) => ({
      sellerPrice: firstPositive(observation?.sellerPrice, observation?.seller_price),
      firstSeenAt: String(observation?.firstSeenAt || observation?.first_seen_at || '').trim(),
      lastSeenAt: String(observation?.lastSeenAt || observation?.last_seen_at || '').trim()
    }))
    .filter((observation) => observation.sellerPrice !== null && asIsoDate(observation.firstSeenAt))
    .sort((left, right) => Date.parse(left.firstSeenAt) - Date.parse(right.firstSeenAt));
  const current = firstPositive(currentPrice);
  const latest = observations[observations.length - 1] || null;
  let lastPriceChangeAt = observations.length > 1 ? observations[observations.length - 1].firstSeenAt : '';
  if (latest && current !== null && Math.abs(latest.sellerPrice - current) >= 0.005) {
    lastPriceChangeAt = snapshotAsOf;
  }
  const ageDays = lastPriceChangeAt ? dateAgeDays(lastPriceChangeAt, snapshotAsOf) : null;
  return {
    history_available: observations.length > 0,
    observations: observations.length,
    last_price_change_at: asIsoDate(lastPriceChangeAt),
    price_change_age_days: ageDays,
    cooldown_days: cooldownDays,
    cooldown_active: Boolean(ageDays !== null && ageDays >= 0 && ageDays < cooldownDays)
  };
}

function buildDemandIntelligence({
  economicsPolicy = {},
  platform = '',
  procurement = null,
  stock = null,
  inbound = null,
  selectedStock = null,
  selectedStockDirect = false,
  currentPrice = null,
  currentPriceStale = false,
  lifecycleKey = '',
  policy = {},
  snapshotAsOf = '',
  approval = null,
  priceHistory = null,
  sourceRow = null
} = {}) {
  const config = demandPricingPolicy(economicsPolicy, platform, policy.target_turnover_days);
  const reasons = [];
  const demandAsOf = asIsoDate(procurement?.date || '');
  const demandAgeDays = dateAgeDays(demandAsOf, snapshotAsOf);
  const avgDaily = firstNumber(procurement?.avgDaily);
  const procurementSales7 = firstNumber(procurement?.sales7);
  const procurementSales14 = firstNumber(procurement?.sales14);
  const procurementSales28 = firstNumber(procurement?.sales28);
  const sales30 = firstNumber(procurement?.sales30);
  const observedDailyHistory = dailyDemandWindow(sourceRow || {}, snapshotAsOf, config);
  const sales7 = observedDailyHistory.usable ? observedDailyHistory.sales7 : procurementSales7;
  const sales14 = observedDailyHistory.usable ? observedDailyHistory.sales14 : procurementSales14;
  const sales28 = observedDailyHistory.usable ? observedDailyHistory.sales28 : procurementSales28;
  const forecast = demandForecast({
    avgDaily,
    sales7,
    sales14,
    sales28,
    config
  });
  const forecastDaily = firstNumber(forecast.forecast_daily_units);
  const priceSignal = priceChangeSignal(priceHistory, currentPrice, snapshotAsOf, config.cooldownDays);
  const availableStock = firstNumber(stock);
  const inboundUnits = firstNumber(inbound, 0) || 0;
  const coverageUnits = availableStock === null ? null : Math.max(0, availableStock + inboundUnits);
  const turnoverDays = coverageUnits !== null && forecastDaily !== null && forecastDaily > 0
    ? Number((coverageUnits / forecastDaily).toFixed(2))
    : null;
  const turnoverRatio = turnoverDays !== null && config.targetTurnoverDays > 0
    ? Number((turnoverDays / config.targetTurnoverDays).toFixed(4))
    : null;
  const oosRiskStatus = String(selectedStock?.oosRiskStatus || '').trim().toLowerCase();
  const oosDecreaseGuard = Boolean(
    selectedStock?.partialOos
    || ['risk', 'watch'].includes(oosRiskStatus)
  );

  if (!config.enabled) reasons.push('demand_pricing_disabled');
  if (!['active', 'new', 'relaunch'].includes(String(lifecycleKey || '').trim().toLowerCase())) {
    reasons.push('demand_lifecycle_not_eligible');
  }
  if (approval) reasons.push('approved_override_priority');
  if (currentPrice === null || currentPrice <= 0) reasons.push('demand_current_price_missing');
  if (currentPriceStale) reasons.push('demand_current_price_stale');
  if (!selectedStockDirect) reasons.push('demand_direct_stock_required');
  if (!procurement?.present) reasons.push('demand_sales_velocity_missing');
  if (!demandAsOf) reasons.push('demand_snapshot_date_missing');
  if (demandAgeDays !== null && demandAgeDays > config.maxAgeDays) reasons.push('demand_snapshot_stale');
  if (avgDaily === null || avgDaily < config.minAvgDailyUnits) reasons.push('demand_velocity_too_low');
  if (sales28 === null || sales28 < config.minSales28Units) reasons.push('demand_sales_history_insufficient');
  if (!forecast.windows_consistent) reasons.push('demand_windows_inconsistent');
  if (coverageUnits === null) reasons.push('demand_stock_missing');
  if (coverageUnits !== null && coverageUnits <= 0) reasons.push('demand_oos');
  if (policy.floor === null) reasons.push('demand_floor_missing');
  if (
    currentPrice !== null
    && (
      (policy.floor !== null && currentPrice + 1e-9 < policy.floor)
      || (policy.cap !== null && currentPrice > policy.cap + 1e-9)
    )
  ) {
    reasons.push('safety_corridor_correction_has_priority');
  }

  const dataQualityScore = Math.min(100,
    (currentPrice !== null && currentPrice > 0 && !currentPriceStale ? 20 : 0)
    + (selectedStockDirect ? 25 : 0)
    + (demandAsOf && demandAgeDays !== null && demandAgeDays <= config.maxAgeDays ? 20 : 0)
    + (forecast.windows_consistent ? 15 : 0)
    + (sales28 !== null && sales28 >= config.highConfidenceMinSales28Units
      ? 20
      : (sales28 !== null && sales28 >= config.minSales28Units ? 10 : 0))
  );
  if (dataQualityScore < config.minDataQualityScore) reasons.push('demand_data_quality_low');

  const eligible = reasons.length === 0;
  const confidence = !eligible
    ? 'insufficient'
    : (dataQualityScore >= config.decreaseMinDataQualityScore
      && sales28 !== null
      && sales28 >= config.highConfidenceMinSales28Units
      ? 'high'
      : 'medium');
  let action = 'keep';
  let stepPct = 0;
  let requestedPrice = currentPrice;
  if (eligible) {
    reasons.push(observedDailyHistory.usable ? 'demand_daily_history_used' : 'demand_procurement_windows_used');
    reasons.push(
      forecast.trend === 'accelerating'
        ? 'demand_trend_accelerating'
        : (forecast.trend === 'decelerating' ? 'demand_trend_decelerating' : 'demand_trend_stable')
    );
  }
  if (eligible && turnoverRatio !== null && turnoverRatio <= config.lowStockRatio) {
    action = 'increase';
    stepPct = config.increaseStepPct;
    requestedPrice = Math.ceil(currentPrice * (1 + stepPct));
    reasons.push('demand_low_stock_price_increase');
  } else if (eligible && turnoverRatio !== null) {
    const tier = demandTier(turnoverRatio, config.overstockRatios);
    if (tier >= 0 && oosDecreaseGuard) {
      reasons.push('demand_decrease_blocked_by_oos_risk');
    } else if (tier >= 0 && forecast.trend === 'accelerating') {
      reasons.push('demand_decrease_blocked_by_acceleration');
    } else if (tier >= 0 && dataQualityScore < config.decreaseMinDataQualityScore) {
      reasons.push('demand_decrease_needs_high_confidence');
    } else if (tier >= 0) {
      action = 'decrease';
      stepPct = config.decreaseStepsPct[tier];
      requestedPrice = Math.floor(currentPrice * (1 - stepPct));
      reasons.push('demand_overstock_price_decrease');
    } else {
      reasons.push('demand_turnover_in_target_band');
    }
  }
  if (action !== 'keep' && priceSignal.cooldown_active) {
    action = 'keep';
    stepPct = 0;
    requestedPrice = currentPrice;
    reasons.push('demand_price_cooldown_active');
  }

  let guardedPrice = requestedPrice;
  const guards = [];
  if (eligible && action !== 'keep') {
    if (policy.floor !== null && guardedPrice < policy.floor) {
      guardedPrice = Math.ceil(policy.floor);
      guards.push(policy.margin_floor !== null && policy.margin_floor >= (policy.min_max_floor || 0)
        ? 'margin_floor'
        : 'min_floor');
    }
    if (policy.cap !== null && guardedPrice > policy.cap) {
      guardedPrice = Math.floor(policy.cap);
      guards.push(policy.cap_lowered_by_max_margin ? 'max_margin_cap' : 'max_cap');
    }
    if (Math.abs(guardedPrice - currentPrice) < 1) {
      action = 'keep';
      stepPct = 0;
      guardedPrice = currentPrice;
      reasons.push('demand_move_absorbed_by_safety_corridor');
    }
  }

  const ratioSeverity = turnoverRatio === null
    ? 0
    : Math.min(1, Math.abs(Math.log(Math.max(0.05, turnoverRatio))));
  const decisionScore = Math.round(Math.min(100,
    dataQualityScore * 0.65
    + ratioSeverity * 30
    + (forecast.trend === 'stable' ? 5 : 0)
  ));
  const nextReviewAt = priceSignal.cooldown_active && priceSignal.last_price_change_at
    ? new Date(
      Date.parse(`${priceSignal.last_price_change_at}T00:00:00Z`)
      + config.cooldownDays * 86400000
    ).toISOString().slice(0, 10)
    : '';
  return {
    enabled: config.enabled,
    eligible,
    status: !config.enabled
      ? 'disabled'
      : (!eligible ? 'insufficient_or_guarded' : (action === 'keep' ? 'keep' : 'review_required')),
    action,
    confidence,
    data_quality_score: dataQualityScore,
    decision_score: decisionScore,
    review_required: Boolean(eligible && action !== 'keep' && config.reviewRequired),
    auto_apply: Boolean(eligible && action !== 'keep' && config.autoApply && !config.reviewRequired),
    current_turnover_days: turnoverDays,
    target_turnover_days: config.targetTurnoverDays,
    turnover_ratio: turnoverRatio,
    available_stock: availableStock,
    inbound_units: inboundUnits,
    coverage_units: coverageUnits,
    avg_daily_units: avgDaily,
    forecast_daily_units: forecastDaily,
    baseline_daily_units: forecast.baseline_daily_units,
    recent_7d_daily_units: forecast.recent_7d_daily_units,
    prior_7d_daily_units: forecast.prior_7d_daily_units,
    prior_14d_daily_units: forecast.prior_14d_daily_units,
    demand_momentum_ratio: forecast.momentum_ratio,
    demand_trend: forecast.trend,
    forecast_model: forecast.model,
    demand_windows_consistent: forecast.windows_consistent,
    sales_7d_units: sales7,
    sales_14d_units: sales14,
    sales_28d_units: sales28,
    sales_30d_units: sales30,
    demand_as_of: demandAsOf,
    demand_age_days: demandAgeDays,
    demand_history_source: observedDailyHistory.usable ? 'daily_orders_history' : 'procurement_windows',
    demand_history_as_of: observedDailyHistory.as_of,
    demand_history_age_days: observedDailyHistory.age_days,
    demand_history_observed_days_28d: observedDailyHistory.observed_days_28d,
    demand_history_fallback_reason: observedDailyHistory.usable ? '' : observedDailyHistory.reason,
    procurement_sales_7d_units: procurementSales7,
    procurement_sales_14d_units: procurementSales14,
    procurement_sales_28d_units: procurementSales28,
    step_pct: stepPct,
    current_price: currentPrice,
    requested_price: action === 'keep' ? currentPrice : requestedPrice,
    guarded_price: action === 'keep' ? currentPrice : guardedPrice,
    guards,
    oos_decrease_guard: oosDecreaseGuard,
    price_history_available: priceSignal.history_available,
    price_history_observations: priceSignal.observations,
    last_price_change_at: priceSignal.last_price_change_at,
    price_change_age_days: priceSignal.price_change_age_days,
    price_cooldown_days: priceSignal.cooldown_days,
    price_cooldown_active: priceSignal.cooldown_active,
    next_review_at: nextReviewAt,
    reasons: [...new Set(reasons)],
    source: 'order_procurement_sales_velocity+repricer_live_signals_stock+repricer_price_observation_history',
    policy: {
      max_age_days: config.maxAgeDays,
      approval_ttl_hours: config.approvalTtlHours,
      min_avg_daily_units: config.minAvgDailyUnits,
      min_sales_28d_units: config.minSales28Units,
      low_stock_ratio: config.lowStockRatio,
      overstock_ratios: config.overstockRatios,
      increase_step_pct: config.increaseStepPct,
      decrease_steps_pct: config.decreaseStepsPct,
      forecast_weights: config.forecastWeights,
      min_forecast_multiplier: config.minForecastMultiplier,
      max_forecast_multiplier: config.maxForecastMultiplier,
      acceleration_threshold: config.accelerationThreshold,
      deceleration_threshold: config.decelerationThreshold,
      min_data_quality_score: config.minDataQualityScore,
      decrease_min_data_quality_score: config.decreaseMinDataQualityScore,
      high_confidence_min_sales_28d_units: config.highConfidenceMinSales28Units,
      cooldown_days: config.cooldownDays,
      daily_history_max_age_days: config.dailyHistoryMaxAgeDays,
      min_observed_daily_history_days: config.minObservedDailyHistoryDays
    }
  };
}

function minimumResidualContributionPct(economicsPolicy = {}) {
  const configured = firstConfiguredPct(
    economicsPolicy?.safety?.minimumResidualContributionPct,
    economicsPolicy?.minimumResidualContributionPct,
    economicsPolicy?.minimum_residual_contribution_pct
  );
  return configured !== null && configured >= 0 && configured < 1 ? configured : 0.05;
}

function targetMarginResidualPct(economics = {}, targetMarginPct = null) {
  const target = normalizePolicyPct(targetMarginPct);
  if (!economics.complete || target === null) return null;
  return 1
    - (economics.commission_pct || 0)
    - (economics.internal_advertising_pct || 0)
    - (economics.tax_pct || 0)
    - target;
}

function resolveCurrentPrice(row = {}) {
  const price = firstPositive(row.currentFillPrice, row.currentPrice);
  return {
    value: price,
    asOf: priceDate(row),
    source: row.currentSellerPriceSource || row.currentPriceSource || row.sourceMode || 'smart_price_contour',
    file: row.currentSellerPriceFile || ''
  };
}

function economicsPolicyForPlatform(payload = {}, platform = '') {
  const key = String(platform || '').trim().toLowerCase();
  const rule = payload?.platforms?.[key];
  return rule && typeof rule === 'object' ? rule : {};
}

function economicsPolicyPlatforms(payload = {}) {
  const configured = Array.isArray(payload?.enabledPlatforms)
    ? payload.enabledPlatforms
    : (Array.isArray(payload?.enabled_platforms) ? payload.enabled_platforms : []);
  const normalized = configured
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => PLATFORM_KEYS.includes(value));
  return normalized.length ? [...new Set(normalized)] : PLATFORM_KEYS;
}

function resolveEconomics(sourceRow = {}, supportRow = {}, costRecord = null, economicsPolicy = {}, platform = '', livePlatformSignal = null) {
  sourceRow = sourceRow || {};
  supportRow = supportRow || {};
  const platformPolicy = economicsPolicyForPlatform(economicsPolicy, platform);
  const cost = firstPositive(costRecord?.cost, sourceRow.costRub, sourceRow.cost, sourceRow.costPrice);
  const sourceCommission = firstConfiguredPct(sourceRow.commissionPct, sourceRow.commission_pct, supportRow.commissionPct);
  const sourceLegacyFixedCosts = firstConfiguredNumber(
    sourceRow.logisticsPerUnit,
    supportRow.logisticsPerUnit
  );
  const sourceLogistics = firstConfiguredNumber(sourceRow.logisticsRub, supportRow.logisticsRub);
  const sourceStorage = firstConfiguredNumber(sourceRow.storageRub, supportRow.storageRub);
  const sourceReturns = firstConfiguredNumber(sourceRow.returnsRub, supportRow.returnsRub);
  const sourceOther = firstConfiguredNumber(sourceRow.otherRub, supportRow.otherRub);
  const sourcePlatformCosts = firstConfiguredNumber(
    sourceRow.platformCostsPerUnit,
    sourceRow.platform_costs_per_unit,
    supportRow.platformCostsPerUnit,
    supportRow.platform_costs_per_unit
  );
  const sourceInternalAdvertising = firstConfiguredNumber(
    sourceRow.internalAdvertisingPerUnit,
    sourceRow.internal_advertising_per_unit,
    sourceRow.internalAdRub,
    sourceRow.adRub,
    supportRow.internalAdvertisingPerUnit,
    supportRow.internal_advertising_per_unit,
    supportRow.internalAdRub,
    supportRow.adRub
  );
  const sourceInternalAdvertisingPct = firstConfiguredPct(
    sourceRow.internalAdvertisingPct,
    sourceRow.internal_advertising_pct,
    sourceRow.adPct,
    sourceRow.ad_pct,
    supportRow.internalAdvertisingPct,
    supportRow.internal_advertising_pct,
    supportRow.adPct,
    supportRow.ad_pct
  );
  const sourceTax = firstConfiguredPct(sourceRow.taxPct, sourceRow.tax_pct, supportRow.taxPct);
  const commissionPct = sourceCommission !== null
    ? sourceCommission
    : firstConfiguredPct(platformPolicy.commissionPct, platformPolicy.commission_pct);
  const policyBreakdown = platformPolicy.breakdown && typeof platformPolicy.breakdown === 'object'
    ? platformPolicy.breakdown
    : {};
  const policyPlatformCosts = firstConfiguredNumber(
    platformPolicy.platformCostsPerUnit,
    platformPolicy.platform_costs_per_unit
  );
  const policyInternalAdvertising = firstConfiguredNumber(
    platformPolicy.internalAdvertisingPerUnit,
    platformPolicy.internal_advertising_per_unit,
    policyBreakdown.internalAdvertisingRub,
    policyBreakdown.internal_advertising_rub,
    policyBreakdown.adRub
  );
  const policyInternalAdvertisingPct = firstConfiguredPct(
    platformPolicy.internalAdvertisingPct,
    platformPolicy.internal_advertising_pct,
    policyBreakdown.internalAdvertisingPct,
    policyBreakdown.internal_advertising_pct,
    policyBreakdown.adPct,
    policyBreakdown.ad_pct
  );
  const liveAdvertising = livePlatformSignal?.advertising && typeof livePlatformSignal.advertising === 'object'
    ? livePlatformSignal.advertising
    : {};
  const liveInternalAdvertisingPct = ['trusted', 'fallback_contract'].includes(String(liveAdvertising.status || '').trim().toLowerCase())
    ? firstConfiguredPct(liveAdvertising.appliedPct)
    : null;
  const liveObservedAdvertisingPct = firstConfiguredPct(liveAdvertising.observedPct);
  const policyLogistics = firstConfiguredNumber(policyBreakdown.logisticsRub) || 0;
  const policyStorage = firstConfiguredNumber(policyBreakdown.storageRub) || 0;
  const policyReturns = firstConfiguredNumber(policyBreakdown.returnsRub) || 0;
  const policyOther = firstConfiguredNumber(policyBreakdown.otherRub) || 0;
  const sourcePlatformComponentsPresent = [sourceLogistics, sourceStorage, sourceReturns, sourceOther]
    .some((value) => value !== null);
  const legacyFixedCosts = sourceLegacyFixedCosts !== null
    ? sourceLegacyFixedCosts
    : firstConfiguredNumber(
      platformPolicy.fixedCostsPerUnit,
      platformPolicy.fixed_costs_per_unit,
      platformPolicy.logisticsPerUnit,
      platformPolicy.logistics_per_unit
    );
  let platformCostsPerUnit = sourcePlatformCosts;
  const internalAdvertisingPerUnit = sourceInternalAdvertising
    ?? policyInternalAdvertising
    ?? 0;
  const internalAdvertisingPctCandidates = [
    sourceInternalAdvertisingPct,
    policyInternalAdvertisingPct,
    liveInternalAdvertisingPct
  ].filter((value) => value !== null);
  const internalAdvertisingPct = internalAdvertisingPctCandidates.length
    ? Math.max(...internalAdvertisingPctCandidates)
    : 0;
  let platformCostsSource = sourcePlatformCosts !== null ? 'smart_price_workbench' : '';
  if (platformCostsPerUnit === null && sourcePlatformComponentsPresent) {
    platformCostsPerUnit = (sourceLogistics ?? policyLogistics)
      + (sourceStorage ?? policyStorage)
      + (sourceReturns ?? policyReturns)
      + (sourceOther ?? policyOther);
    platformCostsSource = 'smart_price_workbench';
  }
  if (platformCostsPerUnit === null && policyPlatformCosts !== null) {
    platformCostsPerUnit = policyPlatformCosts;
    platformCostsSource = 'repricer_economics_policy';
  }
  if (platformCostsPerUnit === null && legacyFixedCosts !== null) {
    const advertisingAlreadyInsideLegacyTotal = sourceLegacyFixedCosts !== null
      ? (sourceInternalAdvertising || 0)
      : (policyInternalAdvertising || 0);
    platformCostsPerUnit = Math.max(0, legacyFixedCosts - advertisingAlreadyInsideLegacyTotal);
    platformCostsSource = sourceLegacyFixedCosts !== null
      ? 'smart_price_workbench'
      : 'repricer_economics_policy';
  }
  const fixedCostsPerUnit = platformCostsPerUnit !== null && internalAdvertisingPerUnit !== null
    ? platformCostsPerUnit + internalAdvertisingPerUnit
    : null;
  const advertisingSource = liveInternalAdvertisingPct !== null && internalAdvertisingPct === liveInternalAdvertisingPct
    ? 'repricer_live_signals'
    : (sourceInternalAdvertising !== null
      ? 'smart_price_workbench'
      : (sourceInternalAdvertisingPct !== null
        ? 'smart_price_workbench'
        : ((policyInternalAdvertising !== null || policyInternalAdvertisingPct !== null)
          ? 'repricer_economics_policy'
          : '')));
  const taxPct = sourceTax !== null
    ? sourceTax
    : firstConfiguredPct(platformPolicy.taxPct, platformPolicy.tax_pct);
  const complete = cost !== null
    && commissionPct !== null
    && platformCostsPerUnit !== null
    && internalAdvertisingPerUnit !== null
    && internalAdvertisingPct !== null
    && taxPct !== null;
  return {
    cost,
    commission_pct: commissionPct,
    platform_costs_per_unit: platformCostsPerUnit,
    internal_advertising_per_unit: internalAdvertisingPerUnit,
    internal_advertising_pct: internalAdvertisingPct,
    internal_advertising_observed_pct: liveObservedAdvertisingPct,
    internal_advertising_contract_pct: policyInternalAdvertisingPct,
    internal_advertising_status: String(liveAdvertising.status || ''),
    internal_advertising_as_of: asIsoDate(liveAdvertising.to || ''),
    fixed_costs_per_unit: fixedCostsPerUnit,
    logistics_per_unit: fixedCostsPerUnit,
    tax_pct: taxPct,
    complete,
    components: {
      logistics_rub: sourceLogistics ?? policyLogistics,
      storage_rub: sourceStorage ?? policyStorage,
      returns_rub: sourceReturns ?? policyReturns,
      other_rub: sourceOther ?? policyOther,
      internal_advertising_rub: internalAdvertisingPerUnit || 0,
      internal_advertising_pct: internalAdvertisingPct || 0,
      internal_advertising_observed_pct: liveObservedAdvertisingPct || 0
    },
    commission_model: platformPolicy.commissionModel || platformPolicy.commission_model || '',
    commission_contract: platformPolicy.commissionContract || platformPolicy.commission_contract || null,
    sources: {
      cost: costRecord ? {
        sourceStore: costRecord.sourceStore || 'server_upload',
        sourceFile: costRecord.sourceFile || '',
        sourceChecksum: costRecord.sourceChecksum || '',
        batchId: costRecord.batchId || '',
        id: costRecord.id || ''
      } : (sourceRow.costSource || (cost !== null ? 'smart_price_workbench' : '')),
      commission: commissionPct !== null
        ? (sourceCommission !== null ? 'smart_price_workbench' : 'repricer_economics_policy')
        : '',
      platform_costs: platformCostsPerUnit !== null ? platformCostsSource : '',
      internal_advertising: internalAdvertisingPerUnit !== null ? advertisingSource : '',
      logistics: fixedCostsPerUnit !== null
        ? [platformCostsSource, advertisingSource].filter(Boolean).join('+')
        : '',
      tax: taxPct !== null
        ? (sourceTax !== null ? 'smart_price_workbench' : 'repricer_economics_policy')
        : ''
    }
  };
}

function resolvePolicy(
  sourceRow = {},
  supportRow = {},
  policyPayload = {},
  minMaxRecord = null,
  economics = {},
  lifecycleKey = '',
  economicsPolicy = {}
) {
  sourceRow = sourceRow || {};
  supportRow = supportRow || {};
  const turnoverPolicy = policyPayload?.policies?.turnover_default || {};
  const minMaxFloor = firstPositive(
    minMaxRecord?.minPrice,
    sourceRow.manualMinPrice,
    supportRow.manualMinPrice,
    sourceRow.minPrice,
    sourceRow.hardMinPrice,
    sourceRow.workingZoneFrom,
    supportRow.minPrice,
    supportRow.hardMinPrice,
    supportRow.workingZoneFrom
  );
  const minMaxCap = firstPositive(
    minMaxRecord?.maxPrice,
    sourceRow.manualMaxPrice,
    supportRow.manualMaxPrice,
    sourceRow.workingZoneTo,
    sourceRow.maxPrice,
    supportRow.workingZoneTo,
    supportRow.maxPrice,
    supportRow.historicalMaxPrice
  );
  const registryTargetMargin = normalizePolicyPct(
    minMaxRecord?.minMarginPct
      ?? minMaxRecord?.min_margin_pct
      ?? minMaxRecord?.targetMarginPct
      ?? minMaxRecord?.marginPct
      ?? minMaxRecord?.allowedMarginPct
  );
  const registryMaximumMargin = normalizePolicyPct(
    minMaxRecord?.maxMarginPct
      ?? minMaxRecord?.max_margin_pct
      ?? minMaxRecord?.allowedMaxMarginPct
  );
  const sourceTargetMargin = normalizePolicyPct(
    sourceRow.manualMinMarginPct
      ?? sourceRow.minMarginPct
      ?? sourceRow.manualMarginPct
      ?? sourceRow.targetMarginPct
      ?? sourceRow.allowedMarginPct
      ?? supportRow.manualMinMarginPct
      ?? supportRow.minMarginPct
      ?? supportRow.manualMarginPct
      ?? supportRow.targetMarginPct
      ?? supportRow.allowedMarginPct
  );
  const targetMargin = registryTargetMargin ?? sourceTargetMargin;
  const sourceMaximumMargin = normalizePolicyPct(
    sourceRow.manualMaxMarginPct
      ?? sourceRow.maxMarginPct
      ?? sourceRow.allowedMaxMarginPct
      ?? supportRow.manualMaxMarginPct
      ?? supportRow.maxMarginPct
      ?? supportRow.allowedMaxMarginPct
  );
  const maximumMargin = registryMaximumMargin ?? sourceMaximumMargin;
  const marginBandInvalid = maximumMargin !== null
    && targetMargin !== null
    && maximumMargin <= targetMargin;
  const guardRequired = marginGuardRequired(lifecycleKey);
  const liquidationPolicy = economicsPolicy?.liquidation || {};
  const liquidationGuardRequired = String(lifecycleKey || '').trim().toLowerCase() === 'exit'
    && liquidationPolicy.enabled !== false;
  const registryLiquidationMargin = normalizePolicyPct(
    minMaxRecord?.liquidationMinMarginPct
      ?? minMaxRecord?.liquidation_min_margin_pct
      ?? minMaxRecord?.exitMinMarginPct
      ?? minMaxRecord?.exit_min_margin_pct
  );
  const sourceLiquidationMargin = normalizePolicyPct(
    sourceRow.manualLiquidationMinMarginPct
      ?? sourceRow.liquidationMinMarginPct
      ?? sourceRow.exitMinMarginPct
      ?? supportRow.manualLiquidationMinMarginPct
      ?? supportRow.liquidationMinMarginPct
      ?? supportRow.exitMinMarginPct
  );
  const defaultLiquidationMargin = normalizePolicyPct(
    liquidationPolicy.defaultMinimumMarginPct ?? 0
  );
  const liquidationMinimumMargin = registryLiquidationMargin
    ?? sourceLiquidationMargin
    ?? defaultLiquidationMargin;
  const marginResidualPct = targetMarginResidualPct(economics, targetMargin);
  const minimumResidualPct = minimumResidualContributionPct(economicsPolicy);
  const targetMarginFeasible = !guardRequired
    || targetMargin === null
    || (marginResidualPct !== null && marginResidualPct + 1e-9 >= minimumResidualPct);
  const marginFloor = guardRequired && targetMarginFeasible
    ? targetMarginFloor(economics, targetMargin)
    : null;
  const maximumMarginCap = guardRequired && !marginBandInvalid
    ? targetMarginCap(economics, maximumMargin)
    : null;
  const liquidationFloor = liquidationGuardRequired
    ? liquidationMarginFloor(economics, liquidationMinimumMargin)
    : null;
  const effectiveMarginFloor = Math.max(marginFloor || 0, liquidationFloor || 0) || null;
  const unboundedFloor = Math.max(minMaxFloor || 0, effectiveMarginFloor || 0) || null;
  const floorLoweredByMaximumMargin = Boolean(
    maximumMarginCap !== null
    && unboundedFloor !== null
    && unboundedFloor > maximumMarginCap
  );
  const floor = floorLoweredByMaximumMargin ? maximumMarginCap : unboundedFloor;
  const capLiftedByMargin = Boolean(
    (guardRequired || liquidationGuardRequired)
    && effectiveMarginFloor !== null
    && minMaxCap !== null
    && minMaxCap + 1e-9 < effectiveMarginFloor
  );
  const minMaxCapAfterFloor = capLiftedByMargin ? effectiveMarginFloor : minMaxCap;
  const capLoweredByMaximumMargin = Boolean(
    maximumMarginCap !== null
    && minMaxCapAfterFloor !== null
    && minMaxCapAfterFloor > maximumMarginCap
  );
  const capBeforeFloorGuard = maximumMarginCap !== null
    ? (minMaxCapAfterFloor !== null ? Math.min(minMaxCapAfterFloor, maximumMarginCap) : maximumMarginCap)
    : minMaxCapAfterFloor;
  const cap = capBeforeFloorGuard !== null && floor !== null
    ? Math.max(capBeforeFloorGuard, floor)
    : capBeforeFloorGuard;
  const registrySource = (record) => ({
    sourceStore: record.sourceStore || 'server_upload',
    sourceFile: record.sourceFile || '',
    sourceChecksum: record.sourceChecksum || '',
    batchId: record.batchId || '',
    id: record.id || ''
  });
  return {
    floor,
    cap,
    min_max_floor: minMaxFloor,
    min_max_cap: minMaxCap,
    margin_floor: marginFloor,
    margin_cap: maximumMarginCap,
    margin_guard_required: guardRequired,
    liquidation_guard_required: liquidationGuardRequired,
    liquidation_min_margin_pct: liquidationMinimumMargin,
    liquidation_margin_floor: liquidationFloor,
    liquidation_margin_source: registryLiquidationMargin !== null
      ? 'approved_minmax_registry'
      : (sourceLiquidationMargin !== null ? 'price_policy_json' : 'repricer_economics_policy'),
    margin_priority_applied: Boolean(effectiveMarginFloor !== null && effectiveMarginFloor >= (minMaxFloor || 0)),
    cap_lifted_by_margin: capLiftedByMargin,
    floor_lowered_by_max_margin: floorLoweredByMaximumMargin,
    cap_lowered_by_max_margin: capLoweredByMaximumMargin,
    lifecycle_key: lifecycleKey,
    target_margin_pct: targetMargin,
    min_margin_pct: targetMargin,
    max_margin_pct: maximumMargin,
    margin_band_invalid: marginBandInvalid,
    target_margin_feasible: targetMarginFeasible,
    margin_residual_pct: marginResidualPct,
    minimum_margin_residual_pct: minimumResidualPct,
    target_turnover_days: Number(turnoverPolicy.target_days || 30),
    version: policyPayload?.version || '',
    sources: {
      floor: minMaxRecord ? registrySource(minMaxRecord) : (firstPositive(sourceRow.manualMinPrice, supportRow.manualMinPrice) !== null ? 'approved_min_max_import' : 'price_policy_json'),
      cap: minMaxRecord ? registrySource(minMaxRecord) : (firstPositive(sourceRow.manualMaxPrice, supportRow.manualMaxPrice) !== null ? 'approved_min_max_import' : 'price_policy_json'),
      margin: registryTargetMargin !== null
        ? registrySource(minMaxRecord)
        : (sourceTargetMargin !== null ? 'price_policy_json' : ''),
      max_margin: registryMaximumMargin !== null
        ? registrySource(minMaxRecord)
        : (sourceMaximumMargin !== null ? 'price_policy_json' : '')
    }
  };
}

function marginAtPrice(price, economics = {}) {
  const value = firstPositive(price);
  if (value === null || !economics.complete) return null;
  const net = value
    - value * (economics.commission_pct || 0)
    - value * (economics.internal_advertising_pct || 0)
    - value * (economics.tax_pct || 0)
    - economicsFixedCostsPerUnit(economics)
    - (economics.cost || 0);
  return Number((net / value).toFixed(6));
}

function chooseProposedPrice(currentPrice, policy = {}, approval = null, demandIntelligence = null) {
  const approvedPrice = firstPositive(approval?.price, approval?.forcePrice, approval?.approvedPrice);
  const demandPrice = approvedPrice === null
    && demandIntelligence?.eligible
    && ['increase', 'decrease'].includes(demandIntelligence?.action)
    ? firstPositive(demandIntelligence.requested_price)
    : null;
  if (approvedPrice === null && demandPrice === null && currentPrice === null) return { price: null, source: '' };
  const floor = firstPositive(policy.floor);
  const cap = firstPositive(policy.cap);
  const startingPrice = approvedPrice ?? demandPrice ?? currentPrice;
  let price = startingPrice;
  let guard = '';
  if (floor !== null && price < floor) {
    price = floor;
    guard = policy.liquidation_guard_required
      && policy.liquidation_margin_floor !== null
      && policy.liquidation_margin_floor >= (policy.min_max_floor || 0)
      ? 'liquidation_margin_floor'
      : (
        policy.margin_floor !== null && policy.margin_floor >= (policy.min_max_floor || 0)
          ? 'margin_floor'
          : 'min_floor'
      );
  }
  if (cap !== null && cap >= (floor || 0) && price > cap) {
    price = cap;
    guard = policy.cap_lowered_by_max_margin ? 'max_margin_cap' : 'max_cap';
  }
  const roundedPrice = guard === 'margin_floor' || guard === 'liquidation_margin_floor' || guard === 'min_floor'
    ? Math.ceil(price)
    : (guard === 'max_cap' || guard === 'max_margin_cap' ? Math.floor(price) : Math.round(price));
  return {
    price: roundedPrice,
    source: approvedPrice !== null
      ? 'approved_override_guarded'
      : (demandPrice !== null ? 'demand_turnover_guarded' : 'canonical_keep_inside_corridor'),
    guard,
    requested_price: startingPrice
  };
}

function duplicateSignature(row = {}) {
  return stableStringify({
    articleKey: row.articleKey || row.article || '',
    currentFillPrice: firstNumber(row.currentFillPrice, row.currentPrice),
    currentClientPrice: firstNumber(row.currentClientPrice),
    valueDate: row.valueDate || row.historyFreshnessDate || row.currentPriceDate || '',
    minPrice: firstNumber(row.minPrice, row.hardMinPrice, row.workingZoneFrom),
    maxPrice: firstNumber(row.maxPrice, row.workingZoneTo),
    cost: firstNumber(row.costRub, row.cost, row.costPrice)
  });
}

function duplicateBusinessSignature(row = {}) {
  return stableStringify({
    articleKey: row.articleKey || row.article || '',
    currentFillPrice: firstNumber(row.currentFillPrice, row.currentPrice),
    valueDate: row.valueDate || row.historyFreshnessDate || row.currentPriceDate || '',
    minPrice: firstNumber(row.manualMinPrice, row.minPrice, row.hardMinPrice, row.workingZoneFrom),
    maxPrice: firstNumber(row.manualMaxPrice, row.workingZoneTo, row.maxPrice)
  });
}

function duplicateSourcePreference(row = {}) {
  const freshness = priceDate(row) || '';
  const completeness = [
    firstNumber(row.currentFillPrice, row.currentPrice),
    firstNumber(row.currentClientPrice),
    firstNumber(row.manualMinPrice, row.minPrice, row.hardMinPrice, row.workingZoneFrom),
    firstNumber(row.manualMaxPrice, row.workingZoneTo, row.maxPrice),
    firstNumber(row.costRub, row.cost, row.costPrice)
  ].filter((value) => value !== null).length;
  return { freshness, completeness, signature: duplicateSignature(row) };
}

function preferDuplicateSourceRow(left = {}, right = {}) {
  const leftPreference = duplicateSourcePreference(left);
  const rightPreference = duplicateSourcePreference(right);
  if (leftPreference.freshness !== rightPreference.freshness) {
    return leftPreference.freshness > rightPreference.freshness ? left : right;
  }
  if (leftPreference.completeness !== rightPreference.completeness) {
    return leftPreference.completeness > rightPreference.completeness ? left : right;
  }
  return leftPreference.signature <= rightPreference.signature ? left : right;
}

function dedupeExactArticleRows(rows = []) {
  const selected = [];
  const selectedIndex = new Map();
  const duplicates = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const articleKey = String(row?.articleKey || row?.article || '').trim();
    const normalizedArticle = normalizeKey(articleKey);
    if (!normalizedArticle) {
      selected.push(row);
      continue;
    }
    const key = `${normalizedArticle}|${articleKey}`;
    if (!selectedIndex.has(key)) {
      selectedIndex.set(key, selected.length);
      selected.push(row);
      continue;
    }
    const index = selectedIndex.get(key);
    selected[index] = preferDuplicateSourceRow(selected[index], row);
    duplicates.push({ normalizedArticle, articleKey });
  }
  return { rows: selected, duplicates };
}

function buildCanonicalSide({
  sourceRow,
  supportRow,
  skuRow,
  procurementBucket,
  liveSignalBucket,
  livePlatformSignal,
  platform,
  snapshotId,
  policyPayload,
  metricRegistry,
  economicsPolicy,
  snapshotAsOf,
  approval,
  lifecycleApproval,
  minMaxRecord,
  costRecord,
  priceHistory
}) {
  const articleKey = String(sourceRow?.articleKey || sourceRow?.article || '').trim();
  const normalizedArticle = normalizeKey(articleKey);
  const current = resolveCurrentPrice(sourceRow);
  const liveStock = liveSignalBucket?.map?.get(normalizedArticle) || null;
  const procurement = procurementBucket?.map?.get(normalizedArticle) || null;
  const preferLiveStock = Boolean(liveSignalBucket?.snapshotAvailable);
  const stockSnapshotAvailable = preferLiveStock
    ? Boolean(liveSignalBucket?.snapshotAvailable)
    : Boolean(procurementBucket?.snapshotAvailable);
  const selectedStock = preferLiveStock ? liveStock : procurement;
  const stockTrusted = Boolean(stockSnapshotAvailable && selectedStock);
  const stock = stockTrusted ? firstNumber(selectedStock.inStock, 0) : null;
  const inbound = stockTrusted ? (firstNumber(selectedStock.inTransit, 0) || 0) + (firstNumber(selectedStock.inRequest, 0) || 0) : null;
  const selectedStockSourceMode = String(selectedStock?.sourceMode || '').trim().toLowerCase();
  const selectedStockDirect = selectedStockSourceMode === 'wb_stock_api'
    || selectedStockSourceMode.startsWith('ozon_stock_api_');
  const economics = resolveEconomics(sourceRow, supportRow, costRecord, economicsPolicy, platform, livePlatformSignal);
  const skuPlatformStatus = skuRow?.platformMatrix?.[platform]?.status
    || skuRow?.[platform]?.status
    || '';
  const platformAliases = Array.isArray(skuRow?.platformAliases?.[platform])
    ? skuRow.platformAliases[platform].filter((value) => String(value || '').trim())
    : [];
  const platformListingId = platform === 'wb'
    ? (skuRow?.nmId || skuRow?.wbNmId || skuRow?.wb?.nmId)
    : (skuRow?.ozon?.offerId || skuRow?.ozonOfferId);
  const platformListingEvidence = Boolean(
    skuPlatformStatus
    || skuRow?.platformMatrix?.[platform]
    || platformAliases.length
    || String(platformListingId || '').trim()
    || current.value !== null
  );
  const skuLifecycleStatus = skuRow
    ? (
      skuPlatformStatus
      || (!platformListingEvidence
        ? 'Нет на площадке'
        : (skuRow.productStatus || skuRow.registryStatus || skuRow.status || skuRow.sheetStatus))
    )
    : '';
  const skuLifecycleRow = skuRow
    ? {
      ...skuRow,
      productStatus: skuLifecycleStatus,
      status: skuLifecycleStatus
    }
    : null;
  const lifecycleKey = normalizeLifecycleKey(lifecycleApproval, skuLifecycleRow, minMaxRecord, sourceRow, supportRow);
  const policy = resolvePolicy(sourceRow, supportRow, policyPayload, minMaxRecord, economics, lifecycleKey, economicsPolicy);
  const reasonCodes = [];
  const price = current.value;
  const maxPriceAgeDays = currentPriceMaxAgeDays(economicsPolicy);
  const priceAgeDays = dateAgeDays(current.asOf, snapshotAsOf);
  const currentPriceStale = priceAgeDays !== null && priceAgeDays > maxPriceAgeDays;
  if (price === null) reasonCodes.push('missing_current_seller_price');
  if (!current.asOf) reasonCodes.push('missing_current_price_date');
  if (currentPriceStale) reasonCodes.push('stale_current_seller_price');
  if (!economics.complete) reasonCodes.push('economics_incomplete');
  if (policy.floor === null) reasonCodes.push('missing_floor');
  if (policy.margin_guard_required && policy.target_margin_pct === null) reasonCodes.push('missing_target_margin');
  if (policy.margin_guard_required && policy.max_margin_pct === null) reasonCodes.push('missing_max_margin');
  if (policy.margin_guard_required && policy.target_margin_pct !== null && policy.target_margin_feasible === false) {
    reasonCodes.push('target_margin_not_economically_feasible');
  }
  if (policy.margin_guard_required && policy.target_margin_pct !== null && policy.margin_floor === null) reasonCodes.push('invalid_target_margin_policy');
  if (policy.liquidation_guard_required && policy.liquidation_min_margin_pct === null) reasonCodes.push('missing_liquidation_margin');
  if (policy.liquidation_guard_required && policy.liquidation_margin_floor === null) reasonCodes.push('invalid_liquidation_margin_policy');
  if (policy.margin_band_invalid) reasonCodes.push('invalid_margin_band');
  if (lifecycleKey === 'not_listed') reasonCodes.push('platform_not_listed');
  if (policy.cap_lifted_by_margin) reasonCodes.push('cap_lifted_by_margin_floor');
  if (policy.cap !== null && policy.floor !== null && policy.cap + 1e-9 < policy.floor) reasonCodes.push('cap_below_floor');
  if (!stockSnapshotAvailable) reasonCodes.push('stock_snapshot_missing');
  else if (!selectedStock) reasonCodes.push('stock_unknown');
  else if ((stock || 0) <= 0 && (inbound || 0) <= 0) reasonCodes.push('trusted_oos');
  const requiredLivePlatforms = Array.isArray(economicsPolicy?.liveSignals?.requiredPlatforms)
    ? economicsPolicy.liveSignals.requiredPlatforms.map((value) => String(value || '').trim().toLowerCase())
    : [];
  const liveSignalsRequired = requiredLivePlatforms.includes(platform);
  const advertisingSignalStatus = String(livePlatformSignal?.advertising?.status || '').trim().toLowerCase();
  const advertisingSignalTrusted = advertisingSignalStatus === 'trusted';
  if (liveSignalsRequired && !livePlatformSignal?.advertising) reasonCodes.push('advertising_snapshot_missing');
  else if (liveSignalsRequired && !advertisingSignalTrusted) reasonCodes.push('advertising_snapshot_stale');
  if (liveSignalsRequired && !liveSignalBucket?.snapshotAvailable) reasonCodes.push('live_stock_snapshot_missing');
  if (liveSignalsRequired && policy.margin_guard_required && !selectedStockDirect) reasonCodes.push('direct_stock_required');

  const corridorValid = !policy.margin_band_invalid
    && !(policy.cap !== null && policy.floor !== null && policy.cap + 1e-9 < policy.floor);
  const canRecommend = price !== null
    && current.asOf
    && !currentPriceStale
    && economics.complete
    && policy.floor !== null
    && (!policy.margin_guard_required || policy.margin_floor !== null)
    && (!policy.liquidation_guard_required || policy.liquidation_margin_floor !== null)
    && (
      !policy.margin_guard_required
      || (
        policy.max_margin_pct !== null
        && policy.target_margin_pct !== null
        && policy.max_margin_pct > policy.target_margin_pct
      )
    )
    && corridorValid
    && !reasonCodes.includes('stock_snapshot_missing')
    && !reasonCodes.includes('stock_unknown')
    && !reasonCodes.includes('trusted_oos')
    && !reasonCodes.includes('advertising_snapshot_missing')
    && !reasonCodes.includes('advertising_snapshot_stale')
    && !reasonCodes.includes('live_stock_snapshot_missing')
    && !reasonCodes.includes('direct_stock_required');
  const demandIntelligence = buildDemandIntelligence({
    economicsPolicy,
    platform,
    procurement,
    stock,
    inbound,
    selectedStock,
    selectedStockDirect,
    currentPrice: price,
    currentPriceStale,
    lifecycleKey,
    policy,
    snapshotAsOf,
    approval,
    priceHistory,
    sourceRow
  });
  const proposed = canRecommend
    ? chooseProposedPrice(price, policy, approval, demandIntelligence)
    : { price: null, source: '' };
  if (proposed.guard === 'margin_floor') reasonCodes.push('margin_floor_applied');
  if (proposed.guard === 'liquidation_margin_floor') reasonCodes.push('liquidation_margin_floor_applied');
  if (proposed.guard === 'min_floor') reasonCodes.push('min_floor_applied');
  if (proposed.guard === 'max_cap') reasonCodes.push('max_cap_applied');
  if (proposed.guard === 'max_margin_cap') reasonCodes.push('max_margin_cap_applied');
  const demandPriceSuggested = proposed.source === 'demand_turnover_guarded'
    && proposed.price !== null
    && price !== null
    && Math.abs(proposed.price - price) >= 1;
  if (demandPriceSuggested) {
    demandIntelligence.reasons
      .filter((reason) => reason.startsWith('demand_'))
      .forEach((reason) => reasonCodes.push(reason));
  }
  const oosRiskStatus = String(selectedStock?.oosRiskStatus || '').trim().toLowerCase();
  const oosDemandGuardActive = policy.margin_guard_required
    && (Boolean(selectedStock?.partialOos) || ['risk', 'watch'].includes(oosRiskStatus));
  const oosRiskPriceDecreaseBlocked = Boolean(
    oosDemandGuardActive
    && price !== null
    && proposed.price !== null
    && proposed.price + 1e-9 < price
  );
  if (oosRiskPriceDecreaseBlocked) reasonCodes.push('oos_risk_price_decrease_blocked');
  const proposedMargin = proposed.price !== null ? marginAtPrice(proposed.price, economics) : null;
  const currentMargin = price !== null ? marginAtPrice(price, economics) : null;
  const clientProjection = clientPriceProjection(
    price,
    sourceRow.currentClientPrice,
    sourceRow.currentBuyerDiscountPct ?? sourceRow.currentSppPct,
    proposed.price
  );
  const changePct = price !== null && proposed.price !== null
    ? Number(((proposed.price - price) / price).toFixed(6))
    : null;
  const sharpThresholdPct = sharpPriceApprovalPct(economicsPolicy);
  const extremeThresholdPct = extremePriceChangePct(economicsPolicy);
  const extremePricePolicyReviewRequired = changePct !== null
    && Math.abs(changePct) + 1e-9 >= extremeThresholdPct
    && !approval;
  const sharpPriceApprovalRequired = changePct !== null
    && Math.abs(changePct) + 1e-9 >= sharpThresholdPct
    && !extremePricePolicyReviewRequired
    && !approval;
  const demandPriceReviewRequired = demandPriceSuggested
    && demandIntelligence.review_required
    && !extremePricePolicyReviewRequired
    && !sharpPriceApprovalRequired
    && !approval;
  if (extremePricePolicyReviewRequired) reasonCodes.push('extreme_price_requires_margin_policy_review');
  if (sharpPriceApprovalRequired) reasonCodes.push('sharp_price_requires_rop');
  if (demandPriceReviewRequired) reasonCodes.push('demand_price_requires_rop');
  const marginSafe = !policy.margin_guard_required
    ? (
      !policy.liquidation_guard_required
      || (
        policy.liquidation_min_margin_pct !== null
        && proposedMargin !== null
        && proposedMargin + 1e-9 >= policy.liquidation_min_margin_pct
      )
    )
    : (
        policy.target_margin_pct !== null
        && proposedMargin !== null
        && proposedMargin + 1e-9 >= policy.target_margin_pct
        && (
          policy.max_margin_pct === null
          || proposedMargin <= policy.max_margin_pct + 1e-9
        )
      );
  if (policy.margin_guard_required && currentMargin !== null && policy.target_margin_pct !== null && currentMargin + 1e-9 < policy.target_margin_pct) {
    reasonCodes.push('current_margin_below_target');
  }
  if (policy.margin_guard_required && currentMargin !== null && policy.max_margin_pct !== null && currentMargin > policy.max_margin_pct + 1e-9) {
    reasonCodes.push('current_margin_above_maximum');
  }
  if (
    policy.liquidation_guard_required
    && currentMargin !== null
    && policy.liquidation_min_margin_pct !== null
    && currentMargin + 1e-9 < policy.liquidation_min_margin_pct
  ) {
    reasonCodes.push('current_margin_below_liquidation_minimum');
  }
  if (proposed.price !== null && !marginSafe) reasonCodes.push('margin_guard_violation');
  const insideCorridor = proposed.price === null
    ? false
    : (policy.floor === null || proposed.price + 1e-9 >= policy.floor)
      && (policy.cap === null || proposed.price <= policy.cap + 1e-9);
  if (proposed.price !== null && !insideCorridor && !approval) reasonCodes.push('price_outside_corridor');

  const dataStatus = canRecommend
    && proposed.price !== null
    && insideCorridor
    && marginSafe
    && !oosRiskPriceDecreaseBlocked
    && !extremePricePolicyReviewRequired
    && !sharpPriceApprovalRequired
    && !demandPriceReviewRequired
      ? 'trusted'
      : 'blocked';
  const indicator = evaluateIndicator({
    policy_id: 'price_default',
    value: proposed.price,
    data_status: dataStatus,
    reason_codes: reasonCodes,
    context: {
      trusted_current_price: price !== null && Boolean(current.asOf),
      complete_economics: economics.complete,
      approved_corridor: corridorValid,
      inside_corridor: insideCorridor,
      recommendation_blocked: proposed.price === null
    }
  }, policyPayload);

  return {
    snapshot_id: snapshotId,
    article_key: articleKey,
    normalized_article_key: normalizedArticle,
    platform,
    facts: {
      seller_price: price,
      client_price: clientProjection.client_price_before,
      client_price_before: clientProjection.client_price_before,
      spp_pct: clientProjection.effective_buyer_discount_pct,
      effective_buyer_discount_pct: clientProjection.effective_buyer_discount_pct,
      buyer_discount_factor: clientProjection.buyer_discount_factor,
      buyer_discount_source: clientProjection.source,
      lifecycle_key: lifecycleKey,
      product_status: String(
        lifecycleApproval?.productLifecycleStatus
          || lifecycleApproval?.productStatus
          || lifecycleApproval?.proposedStatus
          || lifecycleApproval?.lifecycleKey
          || skuLifecycleStatus
          || skuRow?.productStatus
          || skuRow?.registryStatus
          || skuRow?.status
          || skuRow?.sheetStatus
          || sourceRow.productStatus
          || sourceRow.status
          || supportRow?.productStatus
          || supportRow?.status
          || ''
      ).trim(),
      stock,
      inbound,
      stock_status: !stockSnapshotAvailable ? 'stock_snapshot_missing' : (stockTrusted ? ((stock || 0) <= 0 && (inbound || 0) <= 0 ? 'trusted_zero_oos' : 'trusted') : 'stock_unknown'),
      stock_source_status: preferLiveStock
        ? (selectedStockDirect ? 'trusted_direct' : 'trusted_fallback')
        : 'procurement_fallback',
      partial_oos: Boolean(selectedStock?.partialOos),
      oos_risk_status: String(selectedStock?.oosRiskStatus || ''),
      oos_risk_rule: String(selectedStock?.oosRiskRule || ''),
      stock_turnover_days: demandIntelligence.current_turnover_days,
      oos_task_id: String(selectedStock?.oosTaskId || ''),
      as_of: current.asOf,
      price_age_days: priceAgeDays,
      price_freshness: currentPriceStale ? 'stale' : (current.asOf ? 'fresh' : 'unknown'),
      sources: {
        seller_price: {
          source_id: 'marketplace_current_price',
          file: current.file || (
            current.source === 'live'
              ? 'tmp-smart_price_workbench-live.json'
              : 'smart_price_workbench.json+smart_price_overlay.json'
          ),
          field: 'currentFillPrice/currentPrice',
          source_mode: current.source
        },
        client_price: {
          source_id: String(sourceRow.currentClientPriceSource || `${platform}-prices-api`),
          file: current.file || 'repricer_live_prices.json',
          field: 'currentClientPrice',
          projection_mode: clientProjection.source
        },
        stock: {
          source_id: preferLiveStock ? 'repricer_live_stock' : 'order_procurement_stock',
          file: preferLiveStock ? 'repricer_live_signals.json' : `order_procurement_${platform}.json`,
          as_of: selectedStock?.date || (preferLiveStock ? liveSignalBucket?.asOfDate : procurementBucket?.asOfDate) || '',
          source_mode: selectedStock?.sourceMode || ''
        },
        demand: {
          source_id: 'order_procurement_sales_velocity',
          file: `order_procurement_${platform}.json`,
          as_of: demandIntelligence.demand_as_of,
          stock_join: preferLiveStock ? 'repricer_live_signals.json' : `order_procurement_${platform}.json`
        },
        price_history: {
          source_id: 'repricer_price_observation_history',
          file: 'repricer_price_observation_history.json',
          observations: demandIntelligence.price_history_observations,
          last_price_change_at: demandIntelligence.last_price_change_at
        },
        internal_advertising: {
          source_id: economics.sources?.internal_advertising || '',
          file: economics.sources?.internal_advertising === 'repricer_live_signals'
            ? 'repricer_live_signals.json'
            : 'repricer_economics_policy.json',
          as_of: economics.internal_advertising_as_of || ''
        }
      }
    },
    economics,
    policy,
    recommendation: {
      price: proposed.price,
      seller_price_to_upload: proposed.price,
      client_price_before: clientProjection.client_price_before,
      expected_client_price_after: clientProjection.expected_client_price_after,
      client_price_change_rub: clientProjection.client_price_before !== null && clientProjection.expected_client_price_after !== null
        ? Number((clientProjection.expected_client_price_after - clientProjection.client_price_before).toFixed(2))
        : null,
      client_price_change_pct: clientProjection.client_price_before !== null
        && clientProjection.client_price_before > 0
        && clientProjection.expected_client_price_after !== null
        ? Number(((clientProjection.expected_client_price_after - clientProjection.client_price_before) / clientProjection.client_price_before).toFixed(6))
        : null,
      client_price_projection_source: clientProjection.source,
      margin_pct: proposedMargin,
      current_margin_pct: currentMargin,
      change_pct: changePct,
      status: extremePricePolicyReviewRequired
        ? 'blocked'
        : sharpPriceApprovalRequired
        ? 'waiting_rop'
        : demandPriceReviewRequired
        ? 'waiting_rop'
        : (proposed.price !== null && dataStatus === 'trusted' ? 'ready' : 'blocked'),
      reason_codes: [...new Set(reasonCodes)],
      source: proposed.source
    },
    demand_intelligence: demandIntelligence,
    approval: approval ? {
      id: approval.id || approval.override_id || '',
      author: approval.author || approval.createdBy || approval.created_by || '',
      role: approval.role || approval.authorRole || approval.author_role || '',
      reason: approval.reason || approval.note || '',
      createdAt: approval.createdAt || approval.created_at || '',
      approvedBy: approval.approvedBy || approval.approved_by || '',
      approvedAt: approval.approvedAt || approval.approved_at || '',
      expiresAt: approval.expiresAt || approval.expires_at || '',
      supersedes_id: approval.supersedes_id || approval.supersedesId || null
    } : null,
    approval_gate: {
      required: sharpPriceApprovalRequired || extremePricePolicyReviewRequired || demandPriceReviewRequired,
      type: extremePricePolicyReviewRequired
        ? 'MARGIN_POLICY_REVIEW'
        : (
          sharpPriceApprovalRequired
            ? 'SHARP_PRICE_CHANGE'
            : (demandPriceReviewRequired ? 'DEMAND_PRICE_REVIEW' : '')
        ),
      threshold_pct: sharpThresholdPct,
      extreme_threshold_pct: extremeThresholdPct,
      status: extremePricePolicyReviewRequired
        ? 'blocked_policy_review'
        : (
          sharpPriceApprovalRequired || demandPriceReviewRequired
            ? 'waiting_rop'
            : (approval ? 'approved' : 'not_required')
        )
    },
    data_status: dataStatus,
    indicator,
    passports: {
      metric_ids: ['repricer.current_seller_price', 'repricer.proposed_margin_pct', 'stock.turnover_days'],
      metric_registry_version: metricRegistry?.version || '',
      source_ids: [
        'marketplace_current_price',
        'repricer_policy_json',
        preferLiveStock ? 'repricer_live_stock' : 'order_procurement_stock',
        'repricer_internal_advertising'
      ]
    },
    audit: {
      preserves_original_current_price: price,
      requested_price_before_guards: proposed.requested_price ?? price,
      calculated_price_before_policy_review: extremePricePolicyReviewRequired ? proposed.price : null,
      margin_guard_has_priority: policy.margin_guard_required || policy.liquidation_guard_required,
      demand_price_review_required: demandPriceReviewRequired,
      demand_auto_apply_allowed: demandIntelligence.auto_apply,
      demand_forecast_model: demandIntelligence.forecast_model,
      demand_data_quality_score: demandIntelligence.data_quality_score,
      demand_price_cooldown_active: demandIntelligence.price_cooldown_active,
      ozon_export_current_price_used: false,
      local_storage_override_used: false,
      target_turnover_source: 'portal_indicator_policy.turnover_default.target_days'
    }
  };
}

function buildCanonicalRepricer(options = resolveOptions({})) {
  const sourceFiles = [
    'smart_price_workbench.json',
    'smart_price_overlay.json',
    'price_workbench_support.json',
    'order_procurement_wb.json',
    'order_procurement_ozon.json',
    'order_procurement_ym.json',
    'repricer_live_signals.json',
    'repricer_live_prices.json',
    'repricer_price_observation_history.json',
    'skus.json',
    'portal_metric_registry.json',
    'portal_indicator_policy.json',
    'portal_feature_policy.json',
      'repricer_economics_policy.json',
      'repricer_minmax_registry.json',
      'repricer_cost_registry.json',
      'product_lifecycle_approved.json'
  ];
  const workbench = safeReadJson(file(options.inputDir, 'smart_price_workbench.json'), { generatedAt: '', platforms: {} });
  const overlay = safeReadJson(file(options.inputDir, 'smart_price_overlay.json'), { generatedAt: '', platforms: {} });
  const configuredLivePath = options.liveWorkbenchPath
    || path.resolve(options.inputDir, 'repricer_live_prices.json');
  const legacyLivePath = options.legacyLiveWorkbenchPath
    || path.resolve(process.cwd(), 'tmp-smart_price_workbench-live.json');
  const configuredLive = safeReadJson(configuredLivePath, { generatedAt: '', platforms: {} });
  const configuredLiveHasRows = Object.values(configuredLive?.platforms || {}).some((bucket) => (
    Array.isArray(bucket?.rows) && bucket.rows.length > 0
  ));
  const liveWorkbenchPath = configuredLiveHasRows ? configuredLivePath : legacyLivePath;
  const live = configuredLiveHasRows
    ? configuredLive
    : safeReadJson(liveWorkbenchPath, { generatedAt: '', platforms: {} });
  const support = safeReadJson(file(options.inputDir, 'price_workbench_support.json'), { generatedAt: '', platforms: {} });
  const skus = safeReadJson(file(options.inputDir, 'skus.json'), []);
  const procurement = {
    wb: buildProcurementMap(safeReadJson(file(options.inputDir, 'order_procurement_wb.json'), { generatedAt: '', rows: [] })),
    ozon: buildProcurementMap(safeReadJson(file(options.inputDir, 'order_procurement_ozon.json'), { generatedAt: '', rows: [] })),
    ym: buildProcurementMap(safeReadJson(file(options.inputDir, 'order_procurement_ym.json'), { generatedAt: '', rows: [] }))
  };
  const liveSignalsPayload = safeReadJson(
    file(options.inputDir, 'repricer_live_signals.json'),
    { generatedAt: '', platforms: {}, rows: [] }
  );
  const liveSignals = {
    wb: buildLiveSignalBucket(liveSignalsPayload, 'wb'),
    ozon: buildLiveSignalBucket(liveSignalsPayload, 'ozon'),
    ym: buildLiveSignalBucket(liveSignalsPayload, 'ym')
  };
  const priceObservationHistory = buildPriceObservationMap(safeReadJson(
    options.priceObservationHistoryPath || file(options.inputDir, 'repricer_price_observation_history.json'),
    { generatedAt: '', rows: [] }
  ));
  const policyPayload = readPolicyJson(options.policyPath, {});
  const metricRegistry = readJsonFile(options.metricRegistryPath, {});
  const featurePolicy = readJsonFile(options.featurePolicyPath, {});
  const economicsPolicy = readJsonFile(
    options.economicsPolicyPath || file(options.inputDir, 'repricer_economics_policy.json'),
    {}
  );
  const enabledPlatforms = economicsPolicyPlatforms(economicsPolicy);
  const minMaxRows = minMaxRegistry(options.inputDir);
  const costRows = costRegistry(options.inputDir);
  const approvals = approvalMap(options.inputDir);
  const lifecycleApprovals = lifecycleApprovalMap(options.inputDir);
  const merged = mergeSmartPriceContour(workbench || {}, overlay || {}, live || {}, {
    includeLiveOnlyRows: false
  });
  const sharedProductCosts = buildSharedProductCostMap(merged, enabledPlatforms);
  const supportMaps = Object.fromEntries(enabledPlatforms.map((platform) => [platform, buildMap(platformRows(support, platform))]));
  const skuMap = buildMap(registryRows(skus));
  const sources = {
    ...sourceMeta(options.inputDir, sourceFiles),
    [path.basename(liveWorkbenchPath)]: sourcePathMeta(
      liveWorkbenchPath,
      path.basename(liveWorkbenchPath)
    )
  };
  const snapshotHash = crypto.createHash('sha256')
    .update(stableStringify(sources))
    .digest('hex');
  const snapshotId = `repricer:${snapshotHash.slice(0, 16)}`;
  const generatedAt = merged?.generatedAt || overlay?.generatedAt || workbench?.generatedAt || snapshotId;
  const freshnessReferenceDate = asIsoDate(
    options.asOfDate
      || options.referenceDate
      || new Date().toISOString()
  );
  const rows = [];
  const duplicateKeys = new Map();
  const dedupedExactDuplicates = [];
  const collisionKeys = new Map();

  enabledPlatforms.forEach((platform) => {
    const seen = new Map();
    const dedupedSource = dedupeExactArticleRows(platformRows(merged, platform));
    dedupedSource.duplicates.forEach(({ normalizedArticle, articleKey }) => {
      dedupedExactDuplicates.push({ key: `${platform}|${normalizedArticle}`, articleKey });
    });
    dedupedSource.rows.forEach((sourceRow) => {
      const articleKey = String(sourceRow?.articleKey || sourceRow?.article || '').trim();
      const normalizedArticle = normalizeKey(articleKey);
      if (!normalizedArticle) return;
      const skuKey = `${platform}|${normalizedArticle}`;
      if (seen.has(normalizedArticle)) {
        const previous = seen.get(normalizedArticle);
        if (previous.articleKey === articleKey && (
          previous.signature === duplicateSignature(sourceRow)
          || previous.businessSignature === duplicateBusinessSignature(sourceRow)
        )) {
          dedupedExactDuplicates.push({ key: skuKey, articleKey });
          return;
        }
        duplicateKeys.set(skuKey, [...(duplicateKeys.get(skuKey) || []), previous.articleKey, articleKey]);
      }
      seen.set(normalizedArticle, { articleKey, signature: duplicateSignature(sourceRow), businessSignature: duplicateBusinessSignature(sourceRow) });
      if (!collisionKeys.has(normalizedArticle)) collisionKeys.set(normalizedArticle, new Set());
      collisionKeys.get(normalizedArticle).add(articleKey);
      const supportRow = supportMaps[platform]?.get(normalizedArticle) || null;
      const skuRow = skuMap.get(normalizedArticle) || null;
      const minMaxRecord = latestEffectiveRecord(minMaxRows, articleKey, platform);
      const costRecord = latestEffectiveRecord(costRows, articleKey, '')
        || sharedProductCosts.get(normalizedArticle)
        || null;
      rows.push(buildCanonicalSide({
        sourceRow,
        supportRow,
        skuRow,
        procurementBucket: procurement[platform],
        liveSignalBucket: liveSignals[platform],
        livePlatformSignal: liveSignals[platform]?.platformSignal || null,
        platform,
        snapshotId,
        policyPayload,
        metricRegistry,
        economicsPolicy,
        snapshotAsOf: freshnessReferenceDate,
        approval: approvalFor(approvals, articleKey, platform),
        lifecycleApproval: lifecycleApprovalFor(lifecycleApprovals, articleKey, platform),
        minMaxRecord,
        costRecord,
        priceHistory: priceObservationHistory.get(`${skuKey}|${articleKey.toLowerCase()}`)
          || priceObservationHistory.get(skuKey)
          || null
      }));
    });
  });

  rows.sort((left, right) => `${left.platform}|${left.normalized_article_key}`.localeCompare(`${right.platform}|${right.normalized_article_key}`));
  const normalizedCollisions = [...collisionKeys.entries()]
    .filter(([, articles]) => articles.size > 1)
    .map(([normalized_article_key, articles]) => ({ normalized_article_key, articles: [...articles].sort() }));
  const duplicatePlatformKeys = [...duplicateKeys.entries()]
    .map(([key, articles]) => ({ key, articles: [...new Set(articles)].sort() }));
  const blockingReasons = [];
  if (duplicatePlatformKeys.length) blockingReasons.push(`duplicate normalized SKU/platform keys: ${duplicatePlatformKeys.length}`);
  const collisionWarnings = normalizedCollisions.length ? [`normalized article collisions deduped for review: ${normalizedCollisions.length}`] : [];
  const publishableRows = rows.filter((row) => row.recommendation.status === 'ready');
  const blockedRows = rows.length - publishableRows.length;
  const readiness = featureReadiness(rows, featurePolicy);
  const summary = {
    rows: rows.length,
    eligible_rows: readiness.eligible_rows,
    publishable_rows: readiness.publishable_rows,
    blocked_rows: readiness.blocked_rows,
    publishable_coverage: readiness.publishable_coverage,
    required_publishable_coverage: readiness.required_publishable_coverage,
    feature_status: readiness.feature_status,
    publishable_recommendations: publishableRows.length,
    blocked_recommendations: blockedRows,
    duplicate_platform_keys: duplicatePlatformKeys.length,
    normalized_article_collisions: normalizedCollisions.length,
    deduped_exact_duplicates: dedupedExactDuplicates.length
  };
  const payload = {
    schema: 'canonical-repricer-v1',
    generatedAt,
    freshness_reference_date: freshnessReferenceDate,
    snapshot_id: snapshotId,
    source_checksums: sources,
    policy_version: policyPayload?.version || '',
    economics_policy_version: economicsPolicy?.version || '',
    enabled_platforms: enabledPlatforms,
    metric_registry_version: metricRegistry?.version || '',
    feature_policy: featurePolicy,
    feature_status: readiness.feature_status,
    summary,
    rows
  };
  const businessFingerprint = crypto.createHash('sha256').update(stableStringify(rows)).digest('hex');
  const reportStatus = blockingReasons.length ? 'blocked' : (readiness.feature_status === 'ok' ? 'ok' : 'warning');
  const reconciliation = {
    schema: 'portal-repricing-reconciliation-v1',
    generatedAt,
    freshness_reference_date: freshnessReferenceDate,
    snapshot_id: snapshotId,
    status: reportStatus,
    publish_allowed: blockingReasons.length === 0,
    feature_publish_allowed: readiness.feature_publish_allowed,
    feature_status: readiness.feature_status,
    business_fingerprint: businessFingerprint,
    summary,
    blockingReasons,
    warnings: [
      ...collisionWarnings,
      ...readiness.warnings,
      ...(blockedRows ? [`${blockedRows} repricer rows are present but not publishable because required facts/economics/policy are incomplete`] : []),
      ...(dedupedExactDuplicates.length ? [`${dedupedExactDuplicates.length} exact duplicate source rows were deterministically deduped`] : [])
    ],
    duplicatePlatformKeys,
    normalizedArticleCollisions: normalizedCollisions,
    dedupedExactDuplicates: dedupedExactDuplicates.slice(0, 50),
    checks: [
      {
        id: 'repricer:no-duplicate-normalized-sku-platform',
        status: duplicatePlatformKeys.length ? 'blocked' : 'ok',
        blockingReasons: duplicatePlatformKeys.length ? ['duplicate normalized SKU/platform keys'] : []
      },
      {
        id: 'repricer:no-normalized-article-collisions',
        status: normalizedCollisions.length ? 'warning' : 'ok',
        blockingReasons: [],
        warnings: collisionWarnings
      },
      {
        id: 'repricer:feature-readiness',
        status: readiness.feature_status === 'ok' ? 'ok' : 'warning',
        blockingReasons: [],
        warnings: readiness.warnings,
        details: {
          eligible_rows: readiness.eligible_rows,
          publishable_rows: readiness.publishable_rows,
          blocked_rows: readiness.blocked_rows,
          publishable_coverage: readiness.publishable_coverage,
          required_publishable_coverage: readiness.required_publishable_coverage,
          feature_status: readiness.feature_status
        }
      },
      {
        id: 'repricer:local-storage-not-business-truth',
        status: 'ok',
        blockingReasons: [],
        details: 'Canonical builder reads only data/*.json and approved server-side override records; browser localStorage is never loaded.'
      }
    ]
  };

  if (!options.noWrite) {
    writeJson(path.join(options.outputDir, OUTPUT_FILE), payload);
    writeJson(path.join(options.outputDir, RECONCILIATION_FILE), reconciliation);
  }
  return { payload, reconciliation };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  try {
    const { payload, reconciliation } = buildCanonicalRepricer(options);
    const prefix = reconciliation.status === 'ok'
      ? '[canonical-repricer] OK'
      : (reconciliation.publish_allowed ? '[canonical-repricer] WARNING' : '[canonical-repricer] BLOCKED');
    console.log(`${prefix}: ${payload.summary.rows} rows, ${payload.summary.publishable_recommendations} publishable, ${payload.summary.blocked_recommendations} blocked recommendations`);
    if (!reconciliation.publish_allowed && !options.noFail) process.exitCode = 1;
  } catch (error) {
    console.error(`[canonical-repricer] fatal: ${error.stack || error.message}`);
    if (!options.noFail) process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildCanonicalRepricer,
  clientPriceProjection,
  resolveOptions,
  parseArgs,
  stableStringify,
  approvedRecord,
  lifecycleApprovalMap,
  lifecycleApprovalFor,
  economicsFixedCostsPerUnit,
  liquidationMarginFloor,
  marginAtPrice,
  marginGuardRequired,
  normalizeLifecycleKey,
  resolvePolicy,
  serverApprovedRegistryRecord,
  resolveEconomics,
  targetMarginFloor,
  targetMarginCap,
  featureReadiness,
  buildSharedProductCostMap,
  buildPriceObservationMap,
  buildDemandIntelligence,
  dailyDemandWindow,
  demandForecast,
  demandPricingPolicy,
  priceChangeSignal,
  chooseProposedPrice
};
