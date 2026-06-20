#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATUS_RANK = {
  verified: 0,
  warning: 1,
  manual_review: 1,
  stale: 2,
  partial: 2,
  unknown: 2,
  quarantined: 3,
  blocked: 4,
  last_good: 2
};

function parseArgs(argv = process.argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const equalIndex = token.indexOf('=');
    const key = token.slice(2, equalIndex >= 0 ? equalIndex : undefined);
    if (equalIndex >= 0) {
      args[key] = token.slice(equalIndex + 1);
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

function readJson(filePath, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function dateKey(value) {
  if (!value) return '';
  const raw = String(value);
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function localDateKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function deterministicIso(value) {
  const key = dateKey(value);
  return key ? `${key}T00:00:00.000Z` : '';
}

function addDays(value, days) {
  const key = dateKey(value);
  if (!key) return '';
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function daysBetween(left, right) {
  const a = dateKey(left);
  const b = dateKey(right);
  if (!a || !b) return null;
  return Math.floor((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

function hoursBetween(leftIso, rightIso) {
  if (!leftIso || !rightIso) return null;
  const left = new Date(leftIso);
  const right = new Date(rightIso);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return null;
  return (right - left) / 3600000;
}

function getPathValue(object, dottedPath) {
  if (!object || !dottedPath) return undefined;
  return String(dottedPath).split('.').filter(Boolean).reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return Object.prototype.hasOwnProperty.call(Object(current), key) ? current[key] : undefined;
  }, object);
}

function maxDateFromArrayPath(payload, arrayPath) {
  const marker = String(arrayPath || '').indexOf('[]');
  if (marker < 0) return '';
  const listPath = arrayPath.slice(0, marker);
  const childPath = arrayPath.slice(marker + 2).replace(/^\./, '');
  const list = getPathValue(payload, listPath);
  if (!Array.isArray(list)) return '';
  return list.map((item) => dateKey(childPath ? getPathValue(item, childPath) : item)).filter(Boolean).sort().pop() || '';
}

function firstDateFromPaths(payload, paths = []) {
  for (const dottedPath of paths || []) {
    const arrayDate = maxDateFromArrayPath(payload, dottedPath);
    if (arrayDate) return { sourceAsOf: arrayDate, path: dottedPath, raw: arrayDate };
    const value = getPathValue(payload, dottedPath);
    const parsed = dateKey(value);
    if (parsed) return { sourceAsOf: parsed, path: dottedPath, raw: value };
  }
  return { sourceAsOf: '', path: '', raw: '' };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function arrayRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['rows', 'items', 'cards', 'skus', 'aliases', 'issues', 'metricPassports', 'passports']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function countRows(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== 'object') return 0;
  const directRows = arrayRows(payload);
  if (directRows.length) return directRows.length;
  if (payload.platforms && typeof payload.platforms === 'object') {
    return Object.values(payload.platforms).reduce((sum, platform) => {
      const rows = Array.isArray(platform?.rows) ? platform.rows.length : 0;
      const series = Array.isArray(platform?.series) ? platform.series.length : 0;
      return sum + rows + series;
    }, 0);
  }
  if (Array.isArray(payload.freshness)) return payload.freshness.length;
  return Object.keys(payload).length ? 1 : 0;
}

function worstStatus(statuses = []) {
  return statuses.reduce((worst, status) => {
    const current = String(status || 'unknown');
    return (STATUS_RANK[current] ?? 3) > (STATUS_RANK[worst] ?? 3) ? current : worst;
  }, 'verified');
}

function loadSla(slaPath) {
  const payload = readJson(slaPath);
  const layers = payload.layers || {};
  return { ...payload, layers };
}

function layerPolicy(sla, layer) {
  return sla?.layers?.[layer] || null;
}

function passportsArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.passports)) return payload.passports;
  if (payload?.layers && typeof payload.layers === 'object') return Object.values(payload.layers);
  return [];
}

function passportMap(payload) {
  return new Map(passportsArray(payload).map((passport) => [passport.layer || passport.metricId, passport]));
}

function dataQualityFreshnessMap(dataQuality) {
  const map = new Map();
  (Array.isArray(dataQuality?.freshness) ? dataQuality.freshness : []).forEach((item) => {
    const dataset = item?.dataset || item?.layer;
    if (!dataset) return;
    map.set(String(dataset), item);
  });
  return map;
}

function sourceDateFromPayload(layer, payload, policy = {}, context = {}) {
  const paths = policy.businessDatePath || policy.businessDatePaths || [];
  const normalizedPaths = Array.isArray(paths) ? paths : [paths];
  const businessPaths = normalizedPaths.filter((item) => item && !String(item).toLowerCase().includes('generatedat'));
  const direct = firstDateFromPaths(payload, businessPaths);
  if (direct.sourceAsOf) return { ...direct, confidence: 'business_date' };

  const freshnessEntry = context.dataQualityFreshness?.get(policy.freshnessDataset || layer);
  const freshnessDate = dateKey(freshnessEntry?.asOfDate || freshnessEntry?.sourceAsOf || freshnessEntry?.date);
  if (freshnessDate) {
    return {
      sourceAsOf: freshnessDate,
      path: `portal_data_quality.freshness[${policy.freshnessDataset || layer}].asOfDate`,
      raw: freshnessEntry?.asOfDate || freshnessEntry?.sourceAsOf || freshnessEntry?.date,
      confidence: 'data_quality_freshness'
    };
  }

  const generated = firstDateFromPaths(payload, normalizedPaths.filter((item) => String(item).toLowerCase().includes('generatedat')));
  if (generated.sourceAsOf) return { ...generated, confidence: 'generated_at_only' };
  return { sourceAsOf: '', path: '', raw: '', confidence: 'missing' };
}

function inferCoverage(payload, rowCount) {
  const matched = numberOrNull(payload?.matchedRowCount ?? payload?.matchedRows ?? payload?.matchedSkuCount ?? payload?.acceptedRows);
  const total = numberOrNull(payload?.sheetRowCount ?? payload?.sourceRowCount ?? payload?.rowCount ?? payload?.totalRows);
  if (matched !== null && total !== null && total > 0) return Math.max(0, Math.min(1, matched / total));
  return rowCount > 0 ? 1 : 0;
}

function buildLayerPassport(layer, filePath, policy = {}, context = {}) {
  const exists = Boolean(filePath && fs.existsSync(filePath));
  const payload = exists ? readJson(filePath, {}) : null;
  const stats = exists ? fs.statSync(filePath) : null;
  const checksum = exists ? sha256File(filePath) : null;
  const rowCount = exists ? countRows(payload) : 0;
  const sourceDate = exists ? sourceDateFromPayload(layer, payload, policy, context) : { sourceAsOf: '', path: '', confidence: 'missing' };
  const generatedAt = payload?.generatedAt || payload?.meta?.generatedAt || '';
  const sourceAsOf = sourceDate.sourceAsOf;
  const referenceDate = dateKey(context.referenceDate || sourceAsOf || localDateKey(0));
  const lagDays = sourceAsOf && referenceDate ? daysBetween(sourceAsOf, referenceDate) : null;
  const maxLagDays = Number(policy.maxLagDays ?? 0);
  const maxBuildAgeHours = Number(policy.maxBuildAgeHours ?? 0);
  const coverage = exists ? inferCoverage(payload, rowCount) : 0;
  const requiredCoverage = Number(policy.requiredCoverage ?? 0);
  const builtAt = generatedAt || deterministicIso(sourceAsOf);
  const runIso = deterministicIso(context.runDate || referenceDate);
  const buildAgeHours = builtAt && runIso ? hoursBetween(builtAt, runIso) : null;
  const rejectedRows = exists
    ? Number(payload?.rejectedRows ?? payload?.summary?.rejectedRows ?? 0) || 0
    : 0;
  const acceptedRows = exists
    ? Number(payload?.acceptedRows ?? payload?.summary?.acceptedRows ?? Math.max(0, rowCount - rejectedRows)) || 0
    : 0;

  let status = 'verified';
  const warnings = [];
  const blockingReasons = [];
  if (!exists) {
    status = policy.required === false ? 'unknown' : 'blocked';
    blockingReasons.push(`${layer}: source file is missing`);
  } else if (!sourceAsOf) {
    status = 'unknown';
    blockingReasons.push(`${layer}: sourceAsOf is missing`);
  } else if (sourceDate.confidence === 'generated_at_only' && !policy.allowGeneratedAtSourceAsOf) {
    status = 'unknown';
    warnings.push(`${layer}: sourceAsOf is inferred from generatedAt only`);
  } else if (sourceDate.confidence === 'generated_at_only') {
    warnings.push(`${layer}: sourceAsOf uses explicit generatedAt policy allowance`);
  } else if (maxLagDays >= 0 && lagDays !== null && lagDays > maxLagDays) {
    status = 'stale';
    blockingReasons.push(`${layer}: sourceAsOf ${sourceAsOf} is ${lagDays} days behind ${referenceDate}; max ${maxLagDays}`);
  }
  if (exists && requiredCoverage > 0 && coverage + 1e-9 < requiredCoverage) {
    status = worstStatus([status, 'partial']);
    blockingReasons.push(`${layer}: coverage ${(coverage * 100).toFixed(1)}% is below required ${(requiredCoverage * 100).toFixed(1)}%`);
  }
  if (exists && maxBuildAgeHours > 0 && buildAgeHours !== null && buildAgeHours > maxBuildAgeHours) {
    status = worstStatus([status, 'stale']);
    blockingReasons.push(`${layer}: build age ${buildAgeHours.toFixed(1)}h exceeds ${maxBuildAgeHours}h`);
  }

  return {
    layer,
    schemaVersion: 'portal-layer-passport-v1',
    batchId: exists ? sha256Text(`${layer}|${checksum}|${sourceAsOf || 'unknown'}`).slice(0, 24) : null,
    sourceKind: policy.sourceKind || (exists ? 'canonical_json' : 'missing'),
    sourceFile: policy.sourceFile || `${layer}.json`,
    sourceChecksum: checksum,
    sourceAsOf: sourceAsOf || null,
    sourceAsOfPath: sourceDate.path || '',
    sourceAsOfConfidence: sourceDate.confidence || 'missing',
    acceptedAt: deterministicIso(sourceAsOf || dateKey(generatedAt)) || null,
    builtAt: builtAt || null,
    publishedAt: builtAt || null,
    expiresAt: sourceAsOf && Number.isFinite(maxLagDays) ? `${addDays(sourceAsOf, maxLagDays)}T23:59:59.000Z` : null,
    rowCount,
    acceptedRows,
    rejectedRows,
    coverage,
    requiredCoverage,
    status,
    blockingMode: policy.blockingMode || 'last_good',
    lastGoodBatchId: status === 'verified' ? sha256Text(`${layer}|${checksum}|${sourceAsOf}`).slice(0, 24) : (policy.lastGoodBatchId || null),
    dependencies: policy.requiredDependencies || [],
    warnings,
    blockingReasons,
    mtime: stats ? stats.mtime.toISOString() : null
  };
}

module.exports = {
  STATUS_RANK,
  parseArgs,
  readJson,
  writeJson,
  stableStringify,
  sha256Text,
  sha256File,
  dateKey,
  localDateKey,
  deterministicIso,
  addDays,
  daysBetween,
  hoursBetween,
  getPathValue,
  maxDateFromArrayPath,
  firstDateFromPaths,
  numberOrNull,
  normalizeKey,
  countRows,
  worstStatus,
  loadSla,
  layerPolicy,
  passportsArray,
  passportMap,
  dataQualityFreshnessMap,
  sourceDateFromPayload,
  buildLayerPassport
};
