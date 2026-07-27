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
      date: asIsoDate(row?.asOfDate || row?.date || payload?.asOfDate || payload?.generatedAt || '')
    };
    current.inStock += firstNumber(row?.inStock, row?.stock, row?.stockUnits, 0) || 0;
    current.inTransit += firstNumber(row?.inTransit, row?.stockInTransit, 0) || 0;
    current.inRequest += firstNumber(row?.inRequest, row?.stockInSupplyRequest, 0) || 0;
    map.set(key, current);
  });
  return {
    snapshotAvailable: rows.length > 0,
    generatedAt: payload?.generatedAt || '',
    asOfDate: asIsoDate(payload?.asOfDate || payload?.generatedAt || ''),
    map
  };
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
    .filter((row) => !platformKey || !row?.platform || String(row.platform).trim().toLowerCase() === platformKey)
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
  const denominator = 1
    - (economics.commission_pct || 0)
    - (economics.internal_advertising_pct || 0)
    - (economics.tax_pct || 0)
    - target;
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
  const unboundedFloor = Math.max(minMaxFloor || 0, marginFloor || 0) || null;
  const floorLoweredByMaximumMargin = Boolean(
    maximumMarginCap !== null
    && unboundedFloor !== null
    && unboundedFloor > maximumMarginCap
  );
  const floor = floorLoweredByMaximumMargin ? maximumMarginCap : unboundedFloor;
  const capLiftedByMargin = Boolean(
    guardRequired
    && marginFloor !== null
    && minMaxCap !== null
    && minMaxCap + 1e-9 < marginFloor
  );
  const minMaxCapAfterFloor = capLiftedByMargin ? marginFloor : minMaxCap;
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
    margin_priority_applied: Boolean(marginFloor !== null && marginFloor >= (minMaxFloor || 0)),
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

function chooseProposedPrice(currentPrice, policy = {}, approval = null) {
  const approvedPrice = firstPositive(approval?.price, approval?.forcePrice, approval?.approvedPrice);
  if (approvedPrice === null && currentPrice === null) return { price: null, source: '' };
  const floor = firstPositive(policy.floor);
  const cap = firstPositive(policy.cap);
  const startingPrice = approvedPrice ?? currentPrice;
  let price = startingPrice;
  let guard = '';
  if (floor !== null && price < floor) {
    price = floor;
    guard = policy.margin_floor !== null && policy.margin_floor >= (policy.min_max_floor || 0)
      ? 'margin_floor'
      : 'min_floor';
  }
  if (cap !== null && cap >= (floor || 0) && price > cap) {
    price = cap;
    guard = policy.cap_lowered_by_max_margin ? 'max_margin_cap' : 'max_cap';
  }
  const roundedPrice = guard === 'margin_floor' || guard === 'min_floor'
    ? Math.ceil(price)
    : (guard === 'max_cap' || guard === 'max_margin_cap' ? Math.floor(price) : Math.round(price));
  return {
    price: roundedPrice,
    source: approvedPrice !== null ? 'approved_override_guarded' : 'canonical_keep_inside_corridor',
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
  costRecord
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
  const selectedStockSourceMode = String(selectedStock?.sourceMode || '').trim().toLowerCase();
  const selectedStockDirect = selectedStockSourceMode === 'wb_stock_api'
    || selectedStockSourceMode.startsWith('ozon_stock_api_');
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
  const proposed = canRecommend ? chooseProposedPrice(price, policy, approval) : { price: null, source: '' };
  if (proposed.guard === 'margin_floor') reasonCodes.push('margin_floor_applied');
  if (proposed.guard === 'min_floor') reasonCodes.push('min_floor_applied');
  if (proposed.guard === 'max_cap') reasonCodes.push('max_cap_applied');
  if (proposed.guard === 'max_margin_cap') reasonCodes.push('max_margin_cap_applied');
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
  if (extremePricePolicyReviewRequired) reasonCodes.push('extreme_price_requires_margin_policy_review');
  if (sharpPriceApprovalRequired) reasonCodes.push('sharp_price_requires_rop');
  const marginSafe = !policy.margin_guard_required
    || (
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
      client_price: firstPositive(sourceRow.currentClientPrice),
      spp_pct: normalizePct(sourceRow.currentSppPct),
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
      stock_turnover_days: firstNumber(selectedStock?.turnoverDays),
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
        stock: {
          source_id: preferLiveStock ? 'repricer_live_stock' : 'order_procurement_stock',
          file: preferLiveStock ? 'repricer_live_signals.json' : `order_procurement_${platform}.json`,
          as_of: selectedStock?.date || (preferLiveStock ? liveSignalBucket?.asOfDate : procurementBucket?.asOfDate) || '',
          source_mode: selectedStock?.sourceMode || ''
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
      margin_pct: proposedMargin,
      current_margin_pct: currentMargin,
      change_pct: changePct,
      status: extremePricePolicyReviewRequired
        ? 'blocked'
        : sharpPriceApprovalRequired
        ? 'waiting_rop'
        : (proposed.price !== null && dataStatus === 'trusted' ? 'ready' : 'blocked'),
      reason_codes: [...new Set(reasonCodes)],
      source: proposed.source
    },
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
      required: sharpPriceApprovalRequired || extremePricePolicyReviewRequired,
      type: extremePricePolicyReviewRequired
        ? 'MARGIN_POLICY_REVIEW'
        : (sharpPriceApprovalRequired ? 'SHARP_PRICE_CHANGE' : ''),
      threshold_pct: sharpThresholdPct,
      extreme_threshold_pct: extremeThresholdPct,
      status: extremePricePolicyReviewRequired
        ? 'blocked_policy_review'
        : (sharpPriceApprovalRequired ? 'waiting_rop' : (approval ? 'approved' : 'not_required'))
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
      margin_guard_has_priority: policy.margin_guard_required,
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
        costRecord
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
  resolveOptions,
  parseArgs,
  stableStringify,
  approvedRecord,
  lifecycleApprovalMap,
  lifecycleApprovalFor,
  economicsFixedCostsPerUnit,
  marginAtPrice,
  marginGuardRequired,
  normalizeLifecycleKey,
  resolveEconomics,
  targetMarginFloor,
  targetMarginCap,
  featureReadiness,
  buildSharedProductCostMap
};
