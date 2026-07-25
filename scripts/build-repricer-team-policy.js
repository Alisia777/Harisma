#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { targetMarginFloor } = require('./build-canonical-repricer');

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

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value) {
  return numberOrNull(value) || 0;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(numberOrZero(value) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function proposalConfig(economicsPolicy = {}) {
  const configured = economicsPolicy?.teamPreparation || {};
  const configuredExtremeChangePct = numberOrNull(configured.extremeChangePct);
  const approvalExtremeChangePct = numberOrNull(economicsPolicy?.approval?.extremePriceChangePct);
  return {
    baselineMarginPct: numberOrNull(configured.baselineMarginPct) ?? 0.25,
    minimumMarginPct: numberOrNull(configured.minimumMarginPct) ?? 0.25,
    maximumMarginPct: {
      wb: numberOrNull(configured?.maximumMarginPct?.wb) ?? 0.40,
      ozon: numberOrNull(configured?.maximumMarginPct?.ozon) ?? 0.35
    },
    maxCorridorMultiplier: numberOrNull(configured.maxCorridorMultiplier) ?? 1.10,
    sharpChangePct: numberOrNull(configured.sharpChangePct) ?? 0.10,
    extremeChangePct: configuredExtremeChangePct
      ?? (approvalExtremeChangePct === null
        ? 1
        : (approvalExtremeChangePct > 1 ? approvalExtremeChangePct / 100 : approvalExtremeChangePct))
  };
}

function recommendedMargin(row, config) {
  const existing = numberOrNull(row?.policy?.target_margin_pct);
  const candidate = existing === null ? config.baselineMarginPct : existing;
  const maximum = config.maximumMarginPct[row.platform] ?? 0.35;
  return round(clamp(candidate, config.minimumMarginPct, maximum));
}

function changed(left, right, tolerance = 1e-9) {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  if (a === null || b === null) return a !== b;
  return Math.abs(a - b) > tolerance;
}

function actionForProposal(row) {
  const actions = [];
  if (row.fullOos) actions.push('HOLD_OOS');
  else if (['risk', 'watch'].includes(row.oosRiskStatus)) actions.push('SUPPLY_REVIEW');
  if (row.currentPriceFreshness !== 'fresh') actions.push('REFRESH_CURRENT_PRICE');
  if (row.previousMarginPct === null) actions.push('SET_MARGIN');
  else if (row.marginChanged) actions.push('ROP_MARGIN_REVIEW');
  if (row.corridorChanged) actions.push('ROP_CORRIDOR_REVIEW');
  if (row.extremePriceChange) actions.push('REWORK_MARGIN_POLICY');
  else if (row.sharpPriceChange) actions.push('ROP_PRICE_APPROVAL');
  return actions.length ? actions.join(' + ') : 'READY_FOR_REVIEW';
}

function buildProposalRow(row, config) {
  const marginPct = recommendedMargin(row, config);
  const economics = row.economics || {};
  const previousMin = numberOrNull(row?.policy?.min_max_floor);
  const previousMax = numberOrNull(row?.policy?.min_max_cap);
  const safeMarginFloor = targetMarginFloor(economics, marginPct);
  const recommendedMin = Math.max(previousMin || 0, safeMarginFloor || 0) || null;
  const recommendedMax = recommendedMin === null
    ? previousMax
    : Math.max(previousMax || 0, Math.ceil(recommendedMin * config.maxCorridorMultiplier));
  const currentPrice = numberOrNull(row?.facts?.seller_price);
  const priceChangePct = currentPrice !== null && recommendedMin !== null
    ? round((recommendedMin - currentPrice) / currentPrice)
    : null;
  const previousMarginPct = numberOrNull(row?.policy?.target_margin_pct);
  const marginChanged = changed(previousMarginPct, marginPct, 0.00001);
  const corridorChanged = changed(previousMin, recommendedMin, 0.5) || changed(previousMax, recommendedMax, 0.5);
  const fullOos = row?.facts?.stock_status === 'trusted_zero_oos';
  const proposed = {
    articleKey: row.article_key,
    platform: row.platform,
    lifecycle: row?.facts?.lifecycle_key || '',
    productStatus: row?.facts?.product_status || '',
    marginPct,
    previousMarginPct,
    marginChanged,
    previousMin,
    previousMax,
    safeMarginFloor,
    recommendedMin,
    recommendedMax,
    corridorChanged,
    currentPrice,
    currentMarginPct: numberOrNull(row?.recommendation?.current_margin_pct),
    priceChangePct,
    sharpPriceChange: priceChangePct !== null && Math.abs(priceChangePct) >= config.sharpChangePct,
    extremePriceChange: priceChangePct !== null && Math.abs(priceChangePct) >= config.extremeChangePct,
    commissionPct: numberOrNull(economics.commission_pct),
    internalAdvertisingObservedPct: numberOrNull(economics.internal_advertising_observed_pct),
    internalAdvertisingAppliedPct: numberOrNull(economics.internal_advertising_pct),
    platformCostsRub: numberOrNull(economics.platform_costs_per_unit),
    costRub: numberOrNull(economics.cost),
    stock: numberOrNull(row?.facts?.stock),
    inbound: numberOrNull(row?.facts?.inbound),
    fullOos,
    partialOos: Boolean(row?.facts?.partial_oos),
    oosRiskStatus: String(row?.facts?.oos_risk_status || ''),
    oosRiskRule: String(row?.facts?.oos_risk_rule || ''),
    stockTurnoverDays: numberOrNull(row?.facts?.stock_turnover_days),
    stockAsOf: String(row?.facts?.sources?.stock?.as_of || ''),
    stockSource: String(row?.facts?.sources?.stock?.source_mode || row?.facts?.stock_source_status || ''),
    currentPriceAsOf: String(row?.facts?.as_of || ''),
    currentPriceFreshness: String(row?.facts?.price_freshness || ''),
    canonicalStatus: String(row?.recommendation?.status || ''),
    canonicalReasons: Array.isArray(row?.recommendation?.reason_codes) ? row.recommendation.reason_codes : [],
    approvalStatus: 'PENDING_ROP',
    autoApplyEligible: false
  };
  proposed.action = actionForProposal(proposed);
  return proposed;
}

function buildTeamPolicy(canonical, economicsPolicy) {
  const config = proposalConfig(economicsPolicy);
  const canonicalRows = Array.isArray(canonical?.rows) ? canonical.rows : [];
  const protectedRows = canonicalRows.filter((row) => Boolean(row?.policy?.margin_guard_required));
  const rows = protectedRows
    .map((row) => buildProposalRow(row, config))
    .sort((left, right) => `${left.platform}|${left.articleKey}`.localeCompare(`${right.platform}|${right.articleKey}`, 'ru'));
  const changedRows = rows.filter((row) => row.marginChanged || row.corridorChanged);
  const summary = {
    protectedRows: rows.length,
    marginAdjustedRows: rows.filter((row) => row.marginChanged).length,
    missingMarginFilledRows: rows.filter((row) => row.previousMarginPct === null).length,
    corridorAdjustedRows: rows.filter((row) => row.corridorChanged).length,
    marginFloorAboveOldMaxRows: rows.filter((row) => (
      row.safeMarginFloor !== null
      && row.previousMax !== null
      && row.safeMarginFloor > row.previousMax
    )).length,
    fullOosRows: rows.filter((row) => row.fullOos).length,
    oosRiskRows: rows.filter((row) => ['risk', 'watch'].includes(row.oosRiskStatus)).length,
    stalePriceRows: rows.filter((row) => row.currentPriceFreshness !== 'fresh').length,
    extremePriceRows: rows.filter((row) => row.extremePriceChange).length,
    pendingRopRows: changedRows.length,
    autoApplyEligibleRows: rows.filter((row) => row.autoApplyEligible).length
  };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  return {
    schema: 'repricer-team-policy-proposals-v1',
    generatedAt: new Date().toISOString(),
    sourceSnapshotId: canonical?.snapshot_id || '',
    sourceFreshnessReferenceDate: canonical?.freshness_reference_date || '',
    economicsPolicyVersion: economicsPolicy?.version || '',
    status: 'PENDING_ROP',
    policy: {
      ...config,
      priority: ['margin', 'min', 'max', 'other_constraints'],
      note: 'Proposals are operator-ready but never auto-approved. Current prices, lifecycle changes and sharp price moves must pass the ROP workflow.'
    },
    summary,
    fingerprint,
    rows
  };
}

function main() {
  const args = parseArgs(process.argv);
  const inputDir = path.resolve(args['input-dir'] || path.join(process.cwd(), 'data'));
  const outputPath = path.resolve(args.output || args['output-file'] || path.join(inputDir, 'repricer_team_policy_proposals.json'));
  const canonical = readJson(path.join(inputDir, 'canonical_repricer.json'), { rows: [] });
  const economicsPolicy = readJson(path.join(inputDir, 'repricer_economics_policy.json'), {});
  const payload = buildTeamPolicy(canonical, economicsPolicy);
  writeJson(outputPath, payload);
  console.log(JSON.stringify({ outputPath, status: payload.status, summary: payload.summary }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildProposalRow,
  buildTeamPolicy,
  proposalConfig,
  recommendedMargin
};
