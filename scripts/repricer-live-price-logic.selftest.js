#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  marginAtPrice,
  targetMarginFloor
} = require('./build-canonical-repricer');
const { normalizeKey } = require('./smart-price-contour');

const ROOT = path.resolve(__dirname, '..');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8').replace(/^\uFEFF/, ''));
}

function closeEnough(left, right, tolerance = 1e-6) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function compactRow(row) {
  return {
    platform: row.platform,
    articleKey: row.article_key,
    lifecycle: row.facts?.lifecycle_key || '',
    currentPrice: row.facts?.seller_price ?? null,
    clientPrice: row.facts?.client_price ?? null,
    currentMarginPct: row.recommendation?.current_margin_pct ?? null,
    targetMarginPct: row.policy?.target_margin_pct ?? null,
    marginFloor: row.policy?.margin_floor ?? null,
    min: row.policy?.min_max_floor ?? null,
    max: row.policy?.min_max_cap ?? null,
    proposedPrice: row.recommendation?.price ?? null,
    proposedMarginPct: row.recommendation?.margin_pct ?? null,
    changePct: row.recommendation?.change_pct ?? null,
    stockStatus: row.facts?.stock_status || '',
    oosRiskStatus: row.facts?.oos_risk_status || '',
    recommendationStatus: row.recommendation?.status || '',
    reasons: row.recommendation?.reason_codes || []
  };
}

const canonical = readJson('canonical_repricer.json');
const livePrices = readJson('repricer_live_prices.json');
const liveSignals = readJson('repricer_live_signals.json');
const teamPolicy = readJson('repricer_team_policy_proposals.json');
const shadow = readJson('repricer_shadow_report.json');
const rows = Array.isArray(canonical.rows) ? canonical.rows : [];
const protectedLifecycles = new Set(['active', 'new', 'relaunch']);

assert.strictEqual(livePrices.status, 'ok', JSON.stringify(livePrices.blockingReasons || []));
assert.deepStrictEqual(livePrices.blockingReasons || [], []);
assert(rows.length > 0, 'canonical repricer is empty');

const metrics = {
  canonicalRows: rows.length,
  canonicalApiPriceMatches: 0,
  formulaMarginsChecked: 0,
  marginFloorsChecked: 0,
  readyRows: 0,
  readyProtectedRows: 0,
  waitingRopRows: 0,
  blockedRows: 0,
  extremePriceChanges: 0,
  infeasibleTargetMargins: 0,
  oosDecreaseBlocks: 0,
  protectedApiPriceGaps: 0
};

const livePriceMaps = Object.fromEntries(['wb', 'ozon'].map((platform) => [
  platform,
  new Map((livePrices.platforms?.[platform]?.rows || []).map((row) => [
    normalizeKey(row.articleKey || row.article),
    row
  ]))
]));

for (const row of rows) {
  const facts = row.facts || {};
  const economics = row.economics || {};
  const policy = row.policy || {};
  const recommendation = row.recommendation || {};
  const lifecycleProtected = protectedLifecycles.has(String(facts.lifecycle_key || ''));
  const directApiRow = livePriceMaps[row.platform]?.get(normalizeKey(row.article_key));
  if (directApiRow) {
    assert(
      closeEnough(facts.seller_price, directApiRow.currentSellerPrice, 1e-9),
      `${row.platform}/${row.article_key}: canonical current price differs from the live API price`
    );
    assert.strictEqual(
      facts.sources?.seller_price?.file,
      'repricer_live_prices.json',
      `${row.platform}/${row.article_key}: matched API price did not win source priority`
    );
    metrics.canonicalApiPriceMatches += 1;
  }
  assert.strictEqual(
    Boolean(policy.margin_guard_required),
    lifecycleProtected,
    `${row.platform}/${row.article_key}: lifecycle and margin guard disagree`
  );

  if (economics.complete && Number(facts.seller_price) > 0) {
    const expected = marginAtPrice(facts.seller_price, economics);
    assert(closeEnough(expected, recommendation.current_margin_pct), `${row.platform}/${row.article_key}: current margin mismatch`);
    metrics.formulaMarginsChecked += 1;
  }

  if (policy.margin_guard_required && policy.target_margin_pct !== null && policy.margin_floor !== null) {
    const expectedFloor = targetMarginFloor(economics, policy.target_margin_pct);
    assert.strictEqual(policy.margin_floor, expectedFloor, `${row.platform}/${row.article_key}: margin floor mismatch`);
    assert(policy.floor + 1e-9 >= policy.margin_floor, `${row.platform}/${row.article_key}: MIN undercuts margin floor`);
    if (policy.cap_lifted_by_margin) {
      assert(policy.min_max_cap + 1e-9 < policy.margin_floor, `${row.platform}/${row.article_key}: cap lift is not justified`);
      assert.strictEqual(policy.cap, policy.margin_floor, `${row.platform}/${row.article_key}: lifted MAX must equal margin floor`);
    }
    metrics.marginFloorsChecked += 1;
  }
  if (policy.margin_guard_required && policy.target_margin_pct !== null && policy.target_margin_feasible === false) {
    assert.strictEqual(policy.margin_floor, null, `${row.platform}/${row.article_key}: infeasible target must not create a floor`);
    assert((recommendation.reason_codes || []).includes('target_margin_not_economically_feasible'));
    assert.strictEqual(recommendation.status, 'blocked');
    metrics.infeasibleTargetMargins += 1;
  }

  if (recommendation.price !== null) {
    assert(recommendation.price + 1e-9 >= policy.floor, `${row.platform}/${row.article_key}: proposal below effective MIN`);
    assert(recommendation.price <= policy.cap + 1e-9, `${row.platform}/${row.article_key}: proposal above effective MAX`);
    const expectedMargin = marginAtPrice(recommendation.price, economics);
    assert(closeEnough(expectedMargin, recommendation.margin_pct), `${row.platform}/${row.article_key}: proposed margin mismatch`);
  }

  if (recommendation.status === 'ready') {
    metrics.readyRows += 1;
    assert.strictEqual(facts.price_freshness, 'fresh', `${row.platform}/${row.article_key}: ready price is stale`);
    assert.strictEqual(
      facts.sources?.seller_price?.file,
      'repricer_live_prices.json',
      `${row.platform}/${row.article_key}: ready price is not from the direct marketplace price snapshot`
    );
    assert.strictEqual(facts.stock_status, 'trusted', `${row.platform}/${row.article_key}: ready row has untrusted/OOS stock`);
    assert(Math.abs(Number(recommendation.change_pct || 0)) + 1e-9 < Number(row.approval_gate?.threshold_pct || 0.10));
    if (policy.margin_guard_required) {
      assert.strictEqual(
        facts.stock_source_status,
        'trusted_direct',
        `${row.platform}/${row.article_key}: protected ready row is not backed by direct per-SKU stock`
      );
      assert(
        recommendation.margin_pct + 1e-9 >= policy.target_margin_pct,
        `${row.platform}/${row.article_key}: ready protected price violates target margin`
      );
      metrics.readyProtectedRows += 1;
    }
    const guardedOos = facts.partial_oos || ['risk', 'watch'].includes(String(facts.oos_risk_status || '').toLowerCase());
    assert(
      !(policy.margin_guard_required && guardedOos && recommendation.price + 1e-9 < facts.seller_price),
      `${row.platform}/${row.article_key}: ready protected row lowers price during OOS risk`
    );
  } else if (recommendation.status === 'waiting_rop') {
    metrics.waitingRopRows += 1;
    assert(Math.abs(Number(recommendation.change_pct || 0)) + 1e-9 >= Number(row.approval_gate?.threshold_pct || 0.10));
    assert.strictEqual(row.approval_gate?.type, 'SHARP_PRICE_CHANGE');
    assert((recommendation.reason_codes || []).includes('sharp_price_requires_rop'));
  } else {
    metrics.blockedRows += 1;
  }

  if (recommendation.price !== null && Math.abs(Number(recommendation.change_pct || 0)) >= 1) {
    metrics.extremePriceChanges += 1;
    assert.notStrictEqual(recommendation.status, 'ready', `${row.platform}/${row.article_key}: >=100% change cannot be ready`);
    assert.strictEqual(row.approval_gate?.type, 'MARGIN_POLICY_REVIEW');
    assert.strictEqual(row.approval_gate?.status, 'blocked_policy_review');
    assert((recommendation.reason_codes || []).includes('extreme_price_requires_margin_policy_review'));
  }
  if ((recommendation.reason_codes || []).includes('oos_risk_price_decrease_blocked')) {
    metrics.oosDecreaseBlocks += 1;
    assert.notStrictEqual(recommendation.status, 'ready');
  }
}

const missingByPlatform = Object.fromEntries(['wb', 'ozon'].map((platform) => [
  platform,
  livePrices.summary?.platforms?.[platform]?.protectedMissingKeys || []
]));
for (const [platform, missingKeys] of Object.entries(missingByPlatform)) {
  for (const missingKey of missingKeys) {
    const row = rows.find((item) => item.platform === platform && normalizeKey(item.article_key) === missingKey);
    assert(row, `${platform}/${missingKey}: protected API gap is absent from canonical diagnostics`);
    if (!row.policy?.margin_guard_required) continue;
    assert.strictEqual(row.recommendation?.status, 'blocked', `${platform}/${missingKey}: protected API gap must not publish`);
    assert.notStrictEqual(row.facts?.sources?.seller_price?.file, 'repricer_live_prices.json');
    metrics.protectedApiPriceGaps += 1;
  }
}

assert.strictEqual(metrics.readyRows, canonical.summary?.publishable_recommendations);
assert.strictEqual(metrics.waitingRopRows + metrics.blockedRows, canonical.summary?.blocked_recommendations);
assert(metrics.canonicalApiPriceMatches >= 300, 'too few canonical rows are tied to the direct API price snapshot');
assert.strictEqual(metrics.protectedApiPriceGaps, 0);
assert.strictEqual(teamPolicy.summary?.autoApplyEligibleRows, 0);
assert.strictEqual(teamPolicy.summary?.pendingRopRows, teamPolicy.summary?.protectedRows);
assert.strictEqual(shadow.cutover_allowed, false, 'shadow cutover must stay blocked until policy cleanup');

const sampleKeys = [
  ['wb', 'maska-batter_250ml'],
  ['ozon', 'pink_pepper_50ml'],
  ['wb', 'kremshelk_100ml'],
  ['ozon', 'silk_hair_300ml'],
  ['wb', 'sustalit'],
  ['ozon', 'papiderm']
];
const samples = sampleKeys.map(([platform, articleKey]) => {
  const row = rows.find((item) => item.platform === platform && item.article_key === articleKey);
  assert(row, `${platform}/${articleKey}: audit sample is missing`);
  return compactRow(row);
});
const papiderm = rows.find((row) => row.platform === 'ozon' && row.article_key === 'papiderm');
assert.strictEqual(papiderm?.facts?.lifecycle_key, 'exit', 'registry status must win over the stale sheet status');
assert.strictEqual(papiderm?.policy?.margin_guard_required, false);
const wbSerumV2 = rows.find((row) => row.platform === 'wb' && row.article_key === 'syvorotka_dlya_lica_30ml_v2');
assert.strictEqual(wbSerumV2?.facts?.lifecycle_key, 'not_listed', 'SKU without WB status, identifier or current card must not be treated as active on WB');
assert.strictEqual(wbSerumV2?.policy?.margin_guard_required, false);
assert((wbSerumV2?.recommendation?.reason_codes || []).includes('platform_not_listed'));
const extremeSamples = rows
  .filter((row) => row.recommendation?.price !== null && Math.abs(Number(row.recommendation?.change_pct || 0)) >= 1)
  .sort((left, right) => Math.abs(right.recommendation.change_pct) - Math.abs(left.recommendation.change_pct))
  .slice(0, 8)
  .map(compactRow);

const directStockPlatforms = liveSignals.summary?.directPlatforms || [];
const readinessBlockers = [
  ...(directStockPlatforms.length === 2 ? [] : [`direct_stock_missing:${['wb', 'ozon'].filter((platform) => !directStockPlatforms.includes(platform)).join(',')}`]),
  ...(metrics.protectedApiPriceGaps ? [`protected_api_price_gaps:${metrics.protectedApiPriceGaps}`] : []),
  ...(teamPolicy.summary?.pendingRopRows ? [`policy_proposals_waiting_rop:${teamPolicy.summary.pendingRopRows}`] : []),
  ...(shadow.blocking_reasons || [])
];

console.log(JSON.stringify({
  status: 'logic_verified_but_not_ready_for_automatic_cutover',
  generatedAt: canonical.generated_at || canonical.generatedAt || '',
  livePriceSnapshot: {
    generatedAt: livePrices.generatedAt,
    asOfDate: livePrices.asOfDate,
    sourceRows: livePrices.summary?.sourceRows,
    mappedRows: livePrices.summary?.mappedRows,
    wbProtectedCoverage: livePrices.summary?.platforms?.wb?.protectedCoverage,
    ozonProtectedCoverage: livePrices.summary?.platforms?.ozon?.protectedCoverage
  },
  liveSignals: {
    directStockPlatforms,
    advertisingPlatforms: liveSignals.summary?.trustedAdvertisingPlatforms || [],
    oosRiskRows: liveSignals.summary?.oosRiskRows || 0
  },
  metrics,
  teamPreparation: teamPolicy.summary,
  readinessBlockers: [...new Set(readinessBlockers)],
  samples,
  extremeSamples
}, null, 2));
console.log('[repricer-live-price-logic] PASS: formulas and safety gates are consistent; automatic cutover remains blocked for operational review');
