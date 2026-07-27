#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildCanonicalRepricer,
  buildDemandIntelligence,
  chooseProposedPrice
} = require('./build-canonical-repricer');

const economicsPolicy = {
  demandPricing: {
    enabled: true,
    reviewRequired: true,
    autoApply: false,
    approvalTtlHours: 72,
    maxAgeDays: 2,
    minAvgDailyUnits: 0.1,
    minSales28Units: 3,
    targetTurnoverDays: 30,
    lowStockRatio: 0.6,
    overstockRatios: [1.5, 2, 3],
    platforms: {
      wb: {
        increaseStepPct: 2,
        decreaseStepsPct: [1, 2, 3]
      },
      ozon: {
        increaseStepPct: 5,
        decreaseStepsPct: [5, 5, 5]
      }
    }
  }
};

const policy = {
  floor: 800,
  cap: 1400,
  margin_floor: 800,
  min_max_floor: 700,
  cap_lowered_by_max_margin: false,
  target_turnover_days: 30
};

function demand(overrides = {}) {
  return buildDemandIntelligence({
    economicsPolicy,
    platform: 'wb',
    procurement: {
      present: true,
      avgDaily: 1,
      sales7: 7,
      sales14: 14,
      sales28: 28,
      sales30: 30,
      date: '2026-07-27'
    },
    stock: 120,
    inbound: 0,
    selectedStock: {
      partialOos: false,
      oosRiskStatus: ''
    },
    selectedStockDirect: true,
    currentPrice: 1000,
    currentPriceStale: false,
    lifecycleKey: 'active',
    policy,
    snapshotAsOf: '2026-07-27',
    approval: null,
    ...overrides
  });
}

function runUnitScenarios() {
  const overstock = demand();
  assert.strictEqual(overstock.eligible, true);
  assert.strictEqual(overstock.action, 'decrease');
  assert.strictEqual(overstock.current_turnover_days, 120);
  assert.strictEqual(overstock.step_pct, 0.03);
  assert.strictEqual(overstock.requested_price, 970);
  assert.strictEqual(overstock.review_required, true);
  assert.strictEqual(overstock.auto_apply, false);
  assert.strictEqual(overstock.policy.approval_ttl_hours, 72);
  assert(overstock.reasons.includes('demand_overstock_price_decrease'));

  const overstockProposal = chooseProposedPrice(1000, policy, null, overstock);
  assert.deepStrictEqual(
    { price: overstockProposal.price, source: overstockProposal.source, guard: overstockProposal.guard },
    { price: 970, source: 'demand_turnover_guarded', guard: '' }
  );

  const shortage = demand({ stock: 10 });
  assert.strictEqual(shortage.action, 'increase');
  assert.strictEqual(shortage.requested_price, 1020);
  assert(shortage.reasons.includes('demand_low_stock_price_increase'));

  const marginPriority = demand({ currentPrice: 700 });
  assert.strictEqual(marginPriority.eligible, false);
  assert(marginPriority.reasons.includes('safety_corridor_correction_has_priority'));
  const marginPriorityProposal = chooseProposedPrice(700, policy, null, marginPriority);
  assert.strictEqual(marginPriorityProposal.price, 800);
  assert.strictEqual(marginPriorityProposal.guard, 'margin_floor');
  assert.strictEqual(marginPriorityProposal.source, 'canonical_keep_inside_corridor');

  const floorClampedDemand = demand({
    currentPrice: 810,
    stock: 120
  });
  const floorClampedProposal = chooseProposedPrice(810, policy, null, floorClampedDemand);
  assert.strictEqual(floorClampedDemand.action, 'decrease');
  assert.strictEqual(floorClampedProposal.price, 800);
  assert.strictEqual(floorClampedProposal.guard, 'margin_floor');

  const partialOos = demand({
    selectedStock: {
      partialOos: true,
      oosRiskStatus: 'risk'
    }
  });
  assert.strictEqual(partialOos.eligible, true);
  assert.strictEqual(partialOos.action, 'keep');
  assert(partialOos.reasons.includes('demand_decrease_blocked_by_oos_risk'));

  const staleDemand = demand({
    procurement: {
      present: true,
      avgDaily: 1,
      sales28: 28,
      date: '2026-07-20'
    }
  });
  assert.strictEqual(staleDemand.eligible, false);
  assert(staleDemand.reasons.includes('demand_snapshot_stale'));

  const exitSku = demand({ lifecycleKey: 'exit' });
  assert.strictEqual(exitSku.eligible, false);
  assert(exitSku.reasons.includes('demand_lifecycle_not_eligible'));

  const approvedOverride = {
    price: 1100,
    approvalStatus: 'approved'
  };
  const demandWithApproval = demand({ approval: approvedOverride });
  const approvedProposal = chooseProposedPrice(1000, policy, approvedOverride, demandWithApproval);
  assert.strictEqual(demandWithApproval.eligible, false);
  assert.strictEqual(approvedProposal.price, 1100);
  assert.strictEqual(approvedProposal.source, 'approved_override_guarded');

  const ozonDemand = demand({
    platform: 'ozon',
    stock: 60
  });
  assert.strictEqual(ozonDemand.action, 'decrease');
  assert.strictEqual(ozonDemand.step_pct, 0.05);
  assert.strictEqual(ozonDemand.requested_price, 950);
}

function runLiveSnapshotAudit() {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repricer-demand-audit-'));
  try {
    const { payload } = buildCanonicalRepricer({
      inputDir: path.resolve(__dirname, '..', 'data'),
      outputDir,
      liveWorkbenchPath: path.resolve(__dirname, '..', 'data', 'repricer_live_prices.json'),
      legacyLiveWorkbenchPath: path.resolve(__dirname, '..', 'tmp-smart_price_workbench-live.json'),
      asOfDate: '2026-07-27',
      policyPath: path.resolve(__dirname, '..', 'data', 'portal_indicator_policy.json'),
      metricRegistryPath: path.resolve(__dirname, '..', 'data', 'portal_metric_registry.json'),
      featurePolicyPath: path.resolve(__dirname, '..', 'data', 'portal_feature_policy.json'),
      economicsPolicyPath: path.resolve(__dirname, '..', 'data', 'repricer_economics_policy.json'),
      noFail: true,
      noWrite: true
    });
    assert(payload.rows.length > 0, 'live audit must contain canonical rows');
    payload.rows.forEach((row) => {
      const demandLayer = row.demand_intelligence;
      assert(demandLayer && typeof demandLayer === 'object', `${row.platform}/${row.article_key}: missing demand diagnostics`);
      if (row.approval_gate?.type !== 'DEMAND_PRICE_REVIEW') return;
      assert.strictEqual(row.recommendation.status, 'waiting_rop');
      assert.strictEqual(row.approval_gate.required, true);
      assert.strictEqual(demandLayer.review_required, true);
      assert.strictEqual(demandLayer.auto_apply, false);
      assert(row.recommendation.price >= row.policy.floor - 1e-9);
      if (row.policy.cap !== null) assert(row.recommendation.price <= row.policy.cap + 1e-9);
      if (row.recommendation.price < row.facts.seller_price) {
        assert.strictEqual(Boolean(row.facts.partial_oos), false);
        assert(!['risk', 'watch'].includes(String(row.facts.oos_risk_status || '').toLowerCase()));
      }
    });
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

runUnitScenarios();
runLiveSnapshotAudit();
console.log('[repricer-demand-intelligence-selftest] OK: margin-first corridor, demand tiers, OOS/stale/lifecycle guards, ROP-only review and live snapshot audit');
