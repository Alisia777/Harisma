#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  buildCompetitorPriceMap,
  buildCrossPlatformPriceMap,
  competitorPriceSignal,
  crossPlatformPriceSignal,
  estimateOwnPriceElasticity,
  marketIntelligencePolicy,
  marketStepAdjustment,
  seasonalitySignal
} = require('./repricer-market-intelligence');
const { buildDemandIntelligence } = require('./build-canonical-repricer');

const policy = marketIntelligencePolicy({
  marketIntelligence: {
    enabled: true,
    reviewRequired: true,
    maxCombinedInfluencePct: 0.03,
    seasonality: {
      minimumDays: 56,
      highConfidenceDays: 330,
      maxAgeDays: 7,
      minIndex: 0.8,
      maxIndex: 1.2,
      peakDecreaseBlockIndex: 1.12
    },
    elasticity: {
      minimumDays: 42,
      minimumPriceChanges: 3,
      minimumDistinctPriceLevels: 3,
      minimumR2: 0.12
    },
    competitors: {
      maxAgeDays: 1,
      minimumOffers: 3,
      minimumMatchScore: 0.85,
      triggerGapPct: 0.10,
      maxInfluencePct: 0.02
    },
    crossPlatform: {
      maxAgeDays: 2,
      triggerGapPct: 0.10,
      maxInfluencePct: 0.01
    }
  }
}, 'wb');

function learningHistory() {
  const start = Date.parse('2026-04-01T00:00:00Z');
  return Array.from({ length: 118 }, (_, index) => {
    const date = new Date(start + index * 86400000);
    const price = [900, 1000, 1100, 950, 1050][Math.floor(index / 14) % 5];
    const weekdayFactor = [0.8, 0.9, 1, 1, 1.05, 1.3, 1.4][date.getUTCDay()];
    const units = 200000 * (price ** -1.2) * weekdayFactor * Math.exp(index / 1000);
    return {
      date: date.toISOString().slice(0, 10),
      price,
      clientPrice: price,
      ordersUnits: units
    };
  });
}

const learned = estimateOwnPriceElasticity({ daily: learningHistory() }, policy);
assert.strictEqual(learned.usable, true);
assert.strictEqual(learned.source, 'learned_own_price_history');
assert(learned.value < -0.8 && learned.value > -1.5);
assert(learned.r2 > 0.9);
assert.strictEqual(learned.confidence, 'high');

const rejectedElasticity = estimateOwnPriceElasticity({
  daily: learningHistory().map((row, index) => ({
    ...row,
    price: 1000,
    clientPrice: 1000,
    ordersUnits: 10 + (index % 3)
  }))
}, policy);
assert.strictEqual(rejectedElasticity.usable, false);
assert.strictEqual(rejectedElasticity.source, 'policy_or_role_fallback');
assert.strictEqual(rejectedElasticity.reason, 'elasticity_history_insufficient');

const seasonality = seasonalitySignal({ daily: learningHistory() }, '2026-07-27', policy);
assert.strictEqual(seasonality.usable, true);
assert.strictEqual(seasonality.confidence, 'medium');
assert(seasonality.index >= 0.8 && seasonality.index <= 1.2);
assert.strictEqual(seasonality.observed_days, 118);

const staleSeasonality = seasonalitySignal({ daily: learningHistory() }, '2026-08-20', policy);
assert.strictEqual(staleSeasonality.usable, false);
assert.strictEqual(staleSeasonality.reason, 'seasonality_history_stale');

const competitorPayload = {
  generatedAt: '2026-07-27T08:00:00Z',
  rows: [{
    platform: 'wb',
    article_key: 'sku_1',
    observed_at: '2026-07-27T08:00:00Z',
    source: 'approved-provider',
    offers: [
      { competitor_id: 'a', client_price: 900, currency: 'RUB', in_stock: true, match_score: 0.99 },
      { competitor_id: 'b', client_price: 920, currency: 'RUB', in_stock: true, match_score: 0.97 },
      { competitor_id: 'c', client_price: 940, currency: 'RUB', in_stock: true, match_score: 0.96 },
      { competitor_id: 'outlier', client_price: 10000, currency: 'RUB', in_stock: true, match_score: 0.99 },
      { competitor_id: 'wrong-pack', client_price: 500, pack_units: 2, currency: 'RUB', in_stock: true, match_score: 0.99 },
      { competitor_id: 'weak-match', client_price: 850, currency: 'RUB', in_stock: true, match_score: 0.4 }
    ]
  }]
};
const competitorMap = buildCompetitorPriceMap(competitorPayload);
const competitor = competitorPriceSignal(
  competitorMap.get('wb|sku1'),
  1100,
  '2026-07-27',
  policy
);
assert.strictEqual(competitor.usable, true);
assert.strictEqual(competitor.trusted_offers, 3);
assert.strictEqual(competitor.benchmark_client_price, 920);
assert.strictEqual(competitor.rejected.outlier, 1);
assert.strictEqual(competitor.rejected.unit, 1);
assert.strictEqual(competitor.rejected.match, 1);
assert(competitor.suggested_influence_pct < 0);

const weakCompetitor = competitorPriceSignal({
  observed_at: '2026-07-27',
  offers: competitorPayload.rows[0].offers.slice(0, 2)
}, 1100, '2026-07-27', policy);
assert.strictEqual(weakCompetitor.usable, false);
assert.strictEqual(weakCompetitor.suggested_influence_pct, 0);

const staleCompetitor = competitorPriceSignal(
  competitorPayload.rows[0],
  1100,
  '2026-07-30',
  policy
);
assert.strictEqual(staleCompetitor.usable, false);
assert.strictEqual(staleCompetitor.rejected.stale, 6);

const crossMap = buildCrossPlatformPriceMap({
  platforms: {
    wb: { rows: [{ articleKey: 'sku_1', currentClientPrice: 1100, currentPriceDate: '2026-07-27' }] },
    ozon: { rows: [{ articleKey: 'sku_1', currentClientPrice: 900, currentPriceDate: '2026-07-27' }] }
  }
}, ['wb', 'ozon']);
const cross = crossPlatformPriceSignal('wb', 1100, crossMap.get('sku1'), '2026-07-27', policy);
assert.strictEqual(cross.usable, true);
assert.strictEqual(cross.sibling_client_price, 900);
assert(cross.suggested_influence_pct < 0);

const combined = marketStepAdjustment({
  action: 'decrease',
  baseStepPct: 0.03,
  competitor: { suggested_influence_pct: -0.02 },
  crossPlatform: { suggested_influence_pct: -0.01 },
  elasticity: learned,
  policy
});
assert(combined.step_pct > 0.03);
assert(combined.market_influence_pct >= -0.03);
assert(combined.market_influence_pct <= 0.03);

const weakCombined = marketStepAdjustment({
  action: 'decrease',
  baseStepPct: 0.03,
  competitor: weakCompetitor,
  crossPlatform: {},
  elasticity: rejectedElasticity,
  policy
});
assert.strictEqual(weakCombined.step_pct, 0.03);

const integratedEconomicsPolicy = {
  demandPricing: {
    enabled: true,
    reviewRequired: true,
    autoApply: false,
    maxAgeDays: 2,
    minAvgDailyUnits: 0.1,
    minSales28Units: 3,
    highConfidenceMinSales28Units: 28,
    targetTurnoverDays: 30,
    lowStockRatio: 0.6,
    overstockRatios: [1.5, 2, 3],
    platforms: { wb: { increaseStepPct: 0.02, decreaseStepsPct: [0.01, 0.02, 0.03] } }
  },
  marketIntelligence: {
    enabled: true,
    reviewRequired: true,
    maxCombinedInfluencePct: 0.03,
    seasonality: { minimumDays: 56, maxAgeDays: 7, peakDecreaseBlockIndex: 1.12 },
    elasticity: {
      minimumDays: 42,
      maxAgeDays: 30,
      minimumPriceChanges: 3,
      minimumDistinctPriceLevels: 3,
      minimumR2: 0.12
    },
    competitors: {
      maxAgeDays: 1,
      minimumOffers: 3,
      minimumMatchScore: 0.85,
      triggerGapPct: 0.10,
      maxInfluencePct: 0.02
    }
  }
};
const integrationHistory = learningHistory();
const recentMean = integrationHistory.slice(-28)
  .reduce((sum, row) => sum + row.ordersUnits, 0) / 28;
const integrated = buildDemandIntelligence({
  economicsPolicy: integratedEconomicsPolicy,
  platform: 'wb',
  procurement: {
    present: true,
    avgDaily: recentMean,
    sales7: recentMean * 7,
    sales14: recentMean * 14,
    sales28: recentMean * 28,
    sales30: recentMean * 30,
    date: '2026-07-27'
  },
  stock: recentMean * 30,
  inbound: 0,
  selectedStock: { partialOos: false, oosRiskStatus: '' },
  selectedStockDirect: true,
  currentPrice: 1100,
  currentPriceStale: false,
  lifecycleKey: 'active',
  policy: {
    floor: 800,
    cap: 1400,
    margin_floor: 800,
    min_max_floor: 700,
    target_turnover_days: 30
  },
  snapshotAsOf: '2026-07-27',
  sourceRow: {
    currentClientPrice: 1100,
    daily: integrationHistory
  },
  competitorRecord: competitorPayload.rows[0]
});
assert.strictEqual(integrated.eligible, true);
assert.strictEqual(integrated.action, 'decrease');
assert.strictEqual(integrated.market_only_decision, true);
assert(integrated.step_pct > 0 && integrated.step_pct <= 0.02);
assert.strictEqual(integrated.review_required, true);
assert.strictEqual(integrated.auto_apply, false);
assert(integrated.reasons.includes('demand_competitor_gap_price_review'));

const integratedWeak = buildDemandIntelligence({
  economicsPolicy: integratedEconomicsPolicy,
  platform: 'wb',
  procurement: {
    present: true,
    avgDaily: recentMean,
    sales7: recentMean * 7,
    sales14: recentMean * 14,
    sales28: recentMean * 28,
    date: '2026-07-27'
  },
  stock: recentMean * 30,
  inbound: 0,
  selectedStock: { partialOos: false, oosRiskStatus: '' },
  selectedStockDirect: true,
  currentPrice: 1100,
  lifecycleKey: 'active',
  policy: { floor: 800, cap: 1400, margin_floor: 800, min_max_floor: 700, target_turnover_days: 30 },
  snapshotAsOf: '2026-07-27',
  sourceRow: { currentClientPrice: 1100, daily: integrationHistory },
  competitorRecord: { observed_at: '2026-07-27', offers: competitorPayload.rows[0].offers.slice(0, 2) }
});
assert.strictEqual(integratedWeak.action, 'keep');
assert.strictEqual(integratedWeak.market_only_decision, false);

console.log('[repricer-market-intelligence-selftest] OK: seasonality, learned elasticity, robust competitor median and cross-platform influence are confidence-gated, capped and ROP-only');
