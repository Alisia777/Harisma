#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  backtestRow,
  buildDecisionCenter,
  buildLearningReport,
  buildOutcomeRows,
  buildStatusTasks,
  dataQualityForRow
} = require('./build-repricer-intelligence-control');

const economicsPolicy = {
  dataFreshness: {
    priceMaxAgeDays: 2,
    commissionMaxAgeDays: 31,
    advertisingMaxAgeDays: 3,
    costMaxAgeDays: 90,
    stockMaxAgeDays: 2
  },
  marketIntelligence: {
    calendarEvents: {
      salaryDayRanges: [[5, 10], [20, 25]]
    }
  }
};

function canonicalRow(overrides = {}) {
  return {
    platform: 'wb',
    article_key: 'sku1',
    facts: {
      seller_price: 1000,
      client_price: 950,
      effective_buyer_discount_pct: 0.05,
      lifecycle_key: 'active',
      product_status: 'Активный',
      stock: 20,
      inbound: 0,
      as_of: '2026-07-28',
      price_freshness: 'fresh',
      stock_source_status: 'trusted_direct',
      sources: { stock: { as_of: '2026-07-28' } }
    },
    economics: {
      cost: 200,
      commission_pct: 0.2,
      platform_costs_per_unit: 80,
      internal_advertising_pct: 0.1,
      internal_advertising_per_unit: 0,
      internal_advertising_status: 'trusted',
      internal_advertising_as_of: '2026-07-27',
      tax_pct: 0,
      commission_contract: {
        validFrom: '2026-07-01',
        validTo: '2026-12-31'
      }
    },
    policy: {
      min_margin_pct: 0.2,
      max_margin_pct: 0.4,
      margin_priority_applied: true
    },
    recommendation: {
      price: 1050,
      seller_price_to_upload: 1050,
      expected_client_price_after: 997.5,
      current_margin_pct: 0.32,
      margin_pct: 0.33,
      change_pct: 0.05,
      status: 'waiting_rop',
      reason_codes: ['demand_overstock_price_review']
    },
    demand_intelligence: {
      sales_28d_units: 15,
      market_intelligence: {
        elasticity: { usable: true, value: -1, source: 'learned_own_price_history' },
        seasonality: { usable: true, index: 1.05 },
        competitors: { usable: true, trusted_offers: 3 }
      }
    },
    approval_gate: { required: true, type: 'DEMAND_PRICE_REVIEW' },
    ...overrides
  };
}

const context = {
  referenceDate: '2026-07-28',
  economicsPolicy,
  canonical: { freshness_reference_date: '2026-07-28' },
  workbench: { costImportAppliedAt: '2026-05-18T12:00:00Z' },
  skuMatrix: { generatedAt: '2026-07-28T00:00:00Z' }
};

const fresh = dataQualityForRow(canonicalRow(), context);
assert.strictEqual(fresh.usable, true);
const staleAdsRow = canonicalRow();
staleAdsRow.economics.internal_advertising_as_of = '2026-07-20';
const stale = dataQualityForRow(staleAdsRow, context);
assert.strictEqual(stale.usable, false);
assert(stale.blockers.includes('advertising_stale'));

const observations = Array.from({ length: 60 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 4, 30 + index)).toISOString().slice(0, 10),
  units: 10,
  seller_price: index < 30 ? 950 : 1000,
  client_price: index < 30 ? 900 : 950
}));
const backtest = backtestRow(canonicalRow(), { observations }, {
  asOf: '2026-07-28',
  days: 60
});
assert(/^modelled/.test(backtest.status));
assert.strictEqual(backtest.observedDays, 60);
assert(Number.isFinite(backtest.delta.turnoverRub));

const receipt = {
  generatedAt: '2026-07-20T12:00:00Z',
  actions: [{ platform: 'wb', articleKey: 'sku1' }]
};
const outcomeHistory = {
  rows: [{
    platform: 'wb',
    article_key: 'sku1',
    observations: Array.from({ length: 12 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 6, 16 + index)).toISOString().slice(0, 10),
      units: index < 6 ? 5 : 7,
      client_price: 950
    }))
  }]
};
const outcomes = buildOutcomeRows(receipt, outcomeHistory);
assert.strictEqual(outcomes[0].status, 'evaluated');
assert.strictEqual(outcomes[0].delta.drrPctPoints, null);

const exitTasks = buildStatusTasks({
  rows: [
    canonicalRow({
      facts: {
        ...canonicalRow().facts,
        lifecycle_key: 'exit',
        product_status: 'Вывод',
        stock: 0
      }
    })
  ]
}, { items: [{ articleKey: 'sku1', name: 'SKU 1', status: 'Вывод' }] });
assert.strictEqual(exitTasks[0].proposedStatus, 'Стоп');
assert.strictEqual(exitTasks[0].approval.status, 'PENDING_ROP');

const learning = buildLearningReport({
  canonical: { freshness_reference_date: '2026-07-28', rows: [canonicalRow()] },
  history: { rows: [{ platform: 'wb', article_key: 'sku1', observations }] },
  receipt: {},
  economicsPolicy,
  asOf: '2026-07-28'
});
const center = buildDecisionCenter({
  canonical: { freshness_reference_date: '2026-07-28', rows: [canonicalRow()] },
  proposals: { rows: [{ platform: 'wb', articleKey: 'sku1', approvalStatus: 'PENDING_ROP', action: 'ROP_PRICE_REVIEW' }] },
  competitorPrices: {
    rows: [{
      platform: 'wb',
      article_key: 'sku1',
      observed_at: '2026-07-28T12:00:00Z',
      source: 'fixture',
      offers: [{}, {}, {}]
    }]
  },
  learningReport: learning,
  economicsPolicy,
  skuMatrix: { generatedAt: '2026-07-28T00:00:00Z', items: [{ articleKey: 'sku1', name: 'SKU 1' }] },
  workbench: { costImportAppliedAt: '2026-05-18T12:00:00Z' }
});
assert.strictEqual(center.summary.pendingRop, 1);
assert.strictEqual(center.rows[0].price.clientBefore, 950);
assert.strictEqual(center.rows[0].price.clientAfter, 997.5);
assert.strictEqual(center.rows[0].margin.marginPriorityApplied, true);
assert.deepStrictEqual(center.rows[0].approval.actions, ['APPROVE', 'REJECT']);
console.log('[repricer-intelligence-control-selftest] OK: freshness gates, ROP decision row, 60d backtest, outcome window and smart status tasks are deterministic');
