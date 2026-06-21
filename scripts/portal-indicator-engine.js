#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY_PATH = path.join(__dirname, '..', 'data', 'portal_indicator_policy.json');

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDataStatus(value, fallback = 'trusted') {
  const raw = String(value || '').trim().toLowerCase();
  if (['trusted', 'warning', 'estimated', 'stale', 'incomplete', 'blocked'].includes(raw)) return raw;
  return fallback;
}

function firstPolicy(policyPayload, policyId) {
  const policies = policyPayload?.policies || {};
  return policies[policyId] || null;
}

function visualFor(policyPayload, dataStatus) {
  const status = normalizeDataStatus(dataStatus);
  return policyPayload?.visual_rules?.[status] || {
    color: status === 'trusted' ? 'by_business_status' : 'gray',
    business_status: status === 'trusted' ? null : 'neutral',
    label: status
  };
}

function bandMatches(value, band = {}) {
  const numeric = numberOrNull(value);
  if (numeric === null) return false;
  if (band.lt !== undefined && !(numeric < Number(band.lt))) return false;
  if (band.lte !== undefined && !(numeric <= Number(band.lte))) return false;
  if (band.gt !== undefined && !(numeric > Number(band.gt))) return false;
  if (band.gte !== undefined && !(numeric >= Number(band.gte))) return false;
  return true;
}

function statusFromBands(value, bands = []) {
  const hit = bands.find((band) => bandMatches(value, band));
  return hit?.business_status || 'neutral';
}

function result(policyPayload, policyId, dataStatus, businessStatus, label, reasonCodes = [], extras = {}) {
  return {
    data_status: normalizeDataStatus(dataStatus),
    business_status: businessStatus || 'neutral',
    label: label || visualFor(policyPayload, dataStatus).label || normalizeDataStatus(dataStatus),
    reason_codes: [...new Set(reasonCodes.filter(Boolean))],
    policy_id: policyId,
    policy_version: policyPayload?.version || '',
    color: extras.color || visualFor(policyPayload, dataStatus).color || '',
    ...extras
  };
}

function nonTrustedResult(policyPayload, policyId, dataStatus, reasonCodes = []) {
  const visual = visualFor(policyPayload, dataStatus);
  return result(
    policyPayload,
    policyId,
    dataStatus,
    visual.business_status || 'neutral',
    visual.label,
    reasonCodes,
    { color: visual.color }
  );
}

function evaluateCompletion(policyPayload, policyId, value, context = {}) {
  const policy = firstPolicy(policyPayload, policyId) || {};
  const reasonCodes = [];
  if (context.fact_status && context.fact_status !== 'trusted') reasonCodes.push(`fact_${context.fact_status}`);
  if (context.plan_status && context.plan_status !== 'trusted') reasonCodes.push(`plan_${context.plan_status}`);
  if (context.same_scope === false) reasonCodes.push('scope_mismatch');
  if (context.same_unit === false) reasonCodes.push('unit_mismatch');
  if (context.same_period === false) reasonCodes.push('period_mismatch');
  const numeric = numberOrNull(value);
  if (numeric === null) return nonTrustedResult(policyPayload, policyId, 'incomplete', ['missing_completion']);
  const business = statusFromBands(numeric, policy.bands || []);
  return result(policyPayload, policyId, 'trusted', business, business, reasonCodes);
}

function evaluateDrr(policyPayload, policyId, value, context = {}) {
  const target = numberOrNull(context.target);
  const numeric = numberOrNull(value);
  if (numeric === null) return nonTrustedResult(policyPayload, policyId, 'incomplete', ['missing_drr']);
  if (target === null) return nonTrustedResult(policyPayload, policyId, 'incomplete', ['missing_drr_target']);
  const tolerance = numberOrNull(context.tolerance) ?? 0.05;
  let business = 'green';
  if (numeric > target * (1 + tolerance)) business = 'red';
  else if (numeric > target) business = 'amber';
  return result(policyPayload, policyId, 'trusted', business, business, ['drr_target_compare']);
}

function evaluateMargin(policyPayload, policyId, value, context = {}) {
  const target = numberOrNull(context.target_margin_pct);
  const numeric = numberOrNull(value);
  if (numeric === null) return nonTrustedResult(policyPayload, policyId, 'incomplete', ['missing_margin']);
  if (context.complete_economics === false) return nonTrustedResult(policyPayload, policyId, 'blocked', ['economics_incomplete']);
  if (target === null) return nonTrustedResult(policyPayload, policyId, 'incomplete', ['missing_margin_target']);
  const business = numeric + 1e-9 >= target ? 'green' : (numeric + 0.03 >= target ? 'amber' : 'red');
  return result(policyPayload, policyId, 'trusted', business, business, ['margin_target_compare']);
}

function evaluateTurnover(policyPayload, policyId, value) {
  const policy = firstPolicy(policyPayload, policyId) || {};
  const numeric = numberOrNull(value);
  if (numeric === null) return nonTrustedResult(policyPayload, policyId, 'incomplete', ['missing_turnover']);
  const bands = [...(policy.shortage_bands || []), ...(policy.overstock_bands || [])];
  const business = statusFromBands(numeric, bands);
  return result(policyPayload, policyId, 'trusted', business, business, [`target_days_${policy.target_days || 30}`]);
}

function evaluatePrice(policyPayload, policyId, value, context = {}) {
  const numeric = numberOrNull(value);
  const reasonCodes = [];
  if (numeric === null) reasonCodes.push('missing_price');
  if (context.trusted_current_price === false) reasonCodes.push('untrusted_current_price');
  if (context.complete_economics === false) reasonCodes.push('economics_incomplete');
  if (context.approved_corridor === false) reasonCodes.push('corridor_not_approved');
  if (context.inside_corridor === false) reasonCodes.push('price_outside_corridor');
  if (context.recommendation_blocked) reasonCodes.push('recommendation_blocked');
  if (reasonCodes.length) return nonTrustedResult(policyPayload, policyId, 'blocked', reasonCodes);
  return result(policyPayload, policyId, 'trusted', 'green', 'green', ['price_ready']);
}

function evaluateIndicator(input = {}, policyPayload = readJson(DEFAULT_POLICY_PATH, {})) {
  const policyId = input.policy_id || input.policyId || input.indicator_policy_id || 'completion_default';
  const dataStatus = normalizeDataStatus(input.data_status || input.dataStatus, 'trusted');
  const reasonCodes = Array.isArray(input.reason_codes) ? input.reason_codes.slice() : [];
  if (dataStatus !== 'trusted') return nonTrustedResult(policyPayload, policyId, dataStatus, reasonCodes);
  const value = input.value;
  const context = input.context || {};
  if (policyId === 'completion_default') return evaluateCompletion(policyPayload, policyId, value, context);
  if (policyId === 'drr_default') return evaluateDrr(policyPayload, policyId, value, context);
  if (policyId === 'margin_default') return evaluateMargin(policyPayload, policyId, value, context);
  if (policyId === 'turnover_default') return evaluateTurnover(policyPayload, policyId, value, context);
  if (policyId === 'price_default') return evaluatePrice(policyPayload, policyId, value, context);
  const numeric = numberOrNull(value);
  if (numeric === null) return nonTrustedResult(policyPayload, policyId, 'incomplete', ['missing_value']);
  return result(policyPayload, policyId, 'trusted', 'neutral', 'trusted', reasonCodes);
}

module.exports = {
  evaluateIndicator,
  normalizeDataStatus,
  numberOrNull,
  readJson
};

if (require.main === module) {
  const input = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  process.stdout.write(`${JSON.stringify(evaluateIndicator(input), null, 2)}\n`);
}
