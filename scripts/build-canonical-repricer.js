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
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output')),
    policyPath: path.resolve(args['policy'] || path.join(root, 'data', 'portal_indicator_policy.json')),
    metricRegistryPath: path.resolve(args['metric-registry'] || path.join(root, 'data', 'portal_metric_registry.json')),
    featurePolicyPath: path.resolve(args['feature-policy'] || path.join(root, 'data', 'portal_feature_policy.json')),
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

function priceDate(row = {}) {
  return asIsoDate(row.currentPriceDate || row.currentFillPriceDate || row.valueDate || row.historyFreshnessDate || '');
}

function resolveCurrentPrice(row = {}) {
  const price = firstPositive(row.currentFillPrice, row.currentPrice);
  return {
    value: price,
    asOf: priceDate(row),
    source: row.currentSellerPriceSource || row.currentPriceSource || row.sourceMode || 'smart_price_contour'
  };
}

function resolveEconomics(sourceRow = {}, supportRow = {}, costRecord = null) {
  sourceRow = sourceRow || {};
  supportRow = supportRow || {};
  const cost = firstPositive(costRecord?.cost, sourceRow.costRub, sourceRow.cost, sourceRow.costPrice);
  const commissionPct = normalizePct(sourceRow.commissionPct ?? sourceRow.commission_pct ?? supportRow.commissionPct);
  const logisticsPerUnit = firstNumber(sourceRow.logisticsPerUnit, sourceRow.logisticsRub, supportRow.logisticsPerUnit);
  const taxPct = normalizePct(sourceRow.taxPct ?? sourceRow.tax_pct ?? supportRow.taxPct);
  const complete = cost !== null && commissionPct !== null && logisticsPerUnit !== null && taxPct !== null;
  return {
    cost,
    commission_pct: commissionPct,
    logistics_per_unit: logisticsPerUnit,
    tax_pct: taxPct,
    complete,
    sources: {
      cost: costRecord ? {
        sourceStore: costRecord.sourceStore || 'server_upload',
        sourceFile: costRecord.sourceFile || '',
        sourceChecksum: costRecord.sourceChecksum || '',
        batchId: costRecord.batchId || '',
        id: costRecord.id || ''
      } : (sourceRow.costSource || (cost !== null ? 'smart_price_workbench' : '')),
      commission: commissionPct !== null ? 'smart_price_workbench' : '',
      logistics: logisticsPerUnit !== null ? 'smart_price_workbench' : '',
      tax: taxPct !== null ? 'smart_price_workbench' : ''
    }
  };
}

function resolvePolicy(sourceRow = {}, supportRow = {}, policyPayload = {}, minMaxRecord = null) {
  sourceRow = sourceRow || {};
  supportRow = supportRow || {};
  const turnoverPolicy = policyPayload?.policies?.turnover_default || {};
  const floor = firstPositive(
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
  const cap = firstPositive(
    minMaxRecord?.maxPrice,
    sourceRow.manualMaxPrice,
    supportRow.manualMaxPrice,
    sourceRow.workingZoneTo,
    sourceRow.maxPrice,
    supportRow.workingZoneTo,
    supportRow.maxPrice,
    supportRow.historicalMaxPrice
  );
  const targetMargin = normalizePolicyPct(sourceRow.allowedMarginPct ?? supportRow.allowedMarginPct);
  return {
    floor,
    cap,
    target_margin_pct: targetMargin,
    target_turnover_days: Number(turnoverPolicy.target_days || 30),
    version: policyPayload?.version || '',
    sources: {
      floor: minMaxRecord ? {
        sourceStore: minMaxRecord.sourceStore || 'server_upload',
        sourceFile: minMaxRecord.sourceFile || '',
        sourceChecksum: minMaxRecord.sourceChecksum || '',
        batchId: minMaxRecord.batchId || '',
        id: minMaxRecord.id || ''
      } : (firstPositive(sourceRow.manualMinPrice, supportRow.manualMinPrice) !== null ? 'approved_min_max_import' : 'price_policy_json'),
      cap: minMaxRecord ? {
        sourceStore: minMaxRecord.sourceStore || 'server_upload',
        sourceFile: minMaxRecord.sourceFile || '',
        sourceChecksum: minMaxRecord.sourceChecksum || '',
        batchId: minMaxRecord.batchId || '',
        id: minMaxRecord.id || ''
      } : (firstPositive(sourceRow.manualMaxPrice, supportRow.manualMaxPrice) !== null ? 'approved_min_max_import' : 'price_policy_json'),
      margin: targetMargin !== null ? 'price_policy_json' : ''
    }
  };
}

function marginAtPrice(price, economics = {}) {
  const value = firstPositive(price);
  if (value === null || !economics.complete) return null;
  const net = value
    - value * (economics.commission_pct || 0)
    - value * (economics.tax_pct || 0)
    - (economics.logistics_per_unit || 0)
    - (economics.cost || 0);
  return Number((net / value).toFixed(6));
}

function chooseProposedPrice(currentPrice, policy = {}, approval = null) {
  const approvedPrice = firstPositive(approval?.price, approval?.forcePrice, approval?.approvedPrice);
  if (approvedPrice !== null) return { price: approvedPrice, source: 'approved_override' };
  if (currentPrice === null) return { price: null, source: '' };
  const floor = firstPositive(policy.floor);
  const cap = firstPositive(policy.cap);
  let price = currentPrice;
  if (floor !== null && price < floor) price = floor;
  if (cap !== null && cap >= (floor || 0) && price > cap) price = cap;
  return { price: Math.round(price), source: 'canonical_keep_inside_corridor' };
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

function buildCanonicalSide({
  sourceRow,
  supportRow,
  procurementBucket,
  platform,
  snapshotId,
  policyPayload,
  metricRegistry,
  approval,
  minMaxRecord,
  costRecord
}) {
  const articleKey = String(sourceRow?.articleKey || sourceRow?.article || '').trim();
  const normalizedArticle = normalizeKey(articleKey);
  const current = resolveCurrentPrice(sourceRow);
  const procurement = procurementBucket?.map?.get(normalizedArticle) || null;
  const stockSnapshotAvailable = Boolean(procurementBucket?.snapshotAvailable);
  const stockTrusted = Boolean(stockSnapshotAvailable && procurement);
  const stock = stockTrusted ? firstNumber(procurement.inStock, 0) : null;
  const inbound = stockTrusted ? (firstNumber(procurement.inTransit, 0) || 0) + (firstNumber(procurement.inRequest, 0) || 0) : null;
  const economics = resolveEconomics(sourceRow, supportRow, costRecord);
  const policy = resolvePolicy(sourceRow, supportRow, policyPayload, minMaxRecord);
  const reasonCodes = [];
  const price = current.value;
  if (price === null) reasonCodes.push('missing_current_seller_price');
  if (!current.asOf) reasonCodes.push('missing_current_price_date');
  if (!economics.complete) reasonCodes.push('economics_incomplete');
  if (policy.floor === null) reasonCodes.push('missing_floor');
  if (policy.cap !== null && policy.floor !== null && policy.cap + 1e-9 < policy.floor) reasonCodes.push('cap_below_floor');
  if (!stockSnapshotAvailable) reasonCodes.push('stock_snapshot_missing');
  else if (!procurement) reasonCodes.push('stock_unknown');
  else if ((stock || 0) <= 0 && (inbound || 0) <= 0) reasonCodes.push('trusted_oos');

  const corridorValid = !(policy.cap !== null && policy.floor !== null && policy.cap + 1e-9 < policy.floor);
  const canRecommend = price !== null
    && current.asOf
    && economics.complete
    && policy.floor !== null
    && corridorValid
    && !reasonCodes.includes('stock_snapshot_missing')
    && !reasonCodes.includes('stock_unknown');
  const proposed = canRecommend ? chooseProposedPrice(price, policy, approval) : { price: null, source: '' };
  const proposedMargin = proposed.price !== null ? marginAtPrice(proposed.price, economics) : null;
  const currentMargin = price !== null ? marginAtPrice(price, economics) : null;
  const insideCorridor = proposed.price === null
    ? false
    : (policy.floor === null || proposed.price + 1e-9 >= policy.floor)
      && (policy.cap === null || proposed.price <= policy.cap + 1e-9);
  if (proposed.price !== null && !insideCorridor && !approval) reasonCodes.push('price_outside_corridor');

  const dataStatus = canRecommend && proposed.price !== null && insideCorridor ? 'trusted' : 'blocked';
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
      stock,
      inbound,
      stock_status: !stockSnapshotAvailable ? 'stock_snapshot_missing' : (stockTrusted ? ((stock || 0) <= 0 && (inbound || 0) <= 0 ? 'trusted_zero_oos' : 'trusted') : 'stock_unknown'),
      as_of: current.asOf,
      sources: {
        seller_price: {
          source_id: 'marketplace_current_price',
          file: 'smart_price_workbench.json+smart_price_overlay.json',
          field: 'currentFillPrice/currentPrice',
          source_mode: current.source
        },
        stock: {
          source_id: 'order_procurement_stock',
          file: `order_procurement_${platform}.json`,
          as_of: procurement?.date || procurementBucket?.asOfDate || ''
        }
      }
    },
    economics,
    policy,
    recommendation: {
      price: proposed.price,
      margin_pct: proposedMargin,
      current_margin_pct: currentMargin,
      change_pct: price !== null && proposed.price !== null ? Number(((proposed.price - price) / price).toFixed(6)) : null,
      status: proposed.price !== null && dataStatus === 'trusted' ? 'ready' : 'blocked',
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
    data_status: dataStatus,
    indicator,
    passports: {
      metric_ids: ['repricer.current_seller_price', 'repricer.proposed_margin_pct', 'stock.turnover_days'],
      metric_registry_version: metricRegistry?.version || '',
      source_ids: ['marketplace_current_price', 'repricer_policy_json', 'order_procurement_stock']
    },
    audit: {
      preserves_original_current_price: price,
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
    'skus.json',
    'portal_metric_registry.json',
    'portal_indicator_policy.json',
    'portal_feature_policy.json',
    'repricer_minmax_registry.json',
    'repricer_cost_registry.json'
  ];
  const workbench = safeReadJson(file(options.inputDir, 'smart_price_workbench.json'), { generatedAt: '', platforms: {} });
  const overlay = safeReadJson(file(options.inputDir, 'smart_price_overlay.json'), { generatedAt: '', platforms: {} });
  const live = safeReadJson(file(options.inputDir, 'tmp-smart_price_workbench-live.json'), { generatedAt: '', platforms: {} });
  const support = safeReadJson(file(options.inputDir, 'price_workbench_support.json'), { generatedAt: '', platforms: {} });
  const procurement = {
    wb: buildProcurementMap(safeReadJson(file(options.inputDir, 'order_procurement_wb.json'), { generatedAt: '', rows: [] })),
    ozon: buildProcurementMap(safeReadJson(file(options.inputDir, 'order_procurement_ozon.json'), { generatedAt: '', rows: [] })),
    ym: buildProcurementMap(safeReadJson(file(options.inputDir, 'order_procurement_ym.json'), { generatedAt: '', rows: [] }))
  };
  const policyPayload = readPolicyJson(options.policyPath, {});
  const metricRegistry = readJsonFile(options.metricRegistryPath, {});
  const featurePolicy = readJsonFile(options.featurePolicyPath, {});
  const minMaxRows = minMaxRegistry(options.inputDir);
  const costRows = costRegistry(options.inputDir);
  const approvals = approvalMap(options.inputDir);
  const merged = mergeSmartPriceContour(workbench || {}, overlay || {}, live || {});
  const supportMaps = Object.fromEntries(PLATFORM_KEYS.map((platform) => [platform, buildMap(platformRows(support, platform))]));
  const sources = sourceMeta(options.inputDir, sourceFiles);
  const snapshotHash = crypto.createHash('sha256')
    .update(stableStringify(sources))
    .digest('hex');
  const snapshotId = `repricer:${snapshotHash.slice(0, 16)}`;
  const generatedAt = merged?.generatedAt || overlay?.generatedAt || workbench?.generatedAt || snapshotId;
  const rows = [];
  const duplicateKeys = new Map();
  const dedupedExactDuplicates = [];
  const collisionKeys = new Map();

  PLATFORM_KEYS.forEach((platform) => {
    const seen = new Map();
    platformRows(merged, platform).forEach((sourceRow) => {
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
      const minMaxRecord = latestEffectiveRecord(minMaxRows, articleKey, platform);
      const costRecord = latestEffectiveRecord(costRows, articleKey, '');
      rows.push(buildCanonicalSide({
        sourceRow,
        supportRow,
        procurementBucket: procurement[platform],
        platform,
        snapshotId,
        policyPayload,
        metricRegistry,
        approval: approvalFor(approvals, articleKey, platform),
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
    snapshot_id: snapshotId,
    source_checksums: sources,
    policy_version: policyPayload?.version || '',
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
  marginAtPrice,
  featureReadiness
};
