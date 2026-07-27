#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { compareRepricerSnapshots } = require('./build-repricer-shadow-report');

function canonicalRow(articleKey, platform, price) {
  return {
    article_key: articleKey,
    platform,
    recommendation: {
      status: 'ready',
      price,
      reason_codes: ['test']
    }
  };
}

function run() {
  const canonical = {
    schema: 'canonical-repricer-v1',
    snapshot_id: 'test:shadow',
    feature_status: 'ok',
    summary: {
      feature_status: 'ok',
      publishable_coverage: 1
    },
    rows: [
      canonicalRow('sku-1', 'wb', 100),
      canonicalRow('sku-2', 'ozon', 200),
      {
        article_key: 'sku-demand',
        platform: 'wb',
        facts: { seller_price: 100 },
        policy: { floor: 80, cap: 140 },
        demand_intelligence: {
          action: 'decrease',
          current_turnover_days: 120,
          target_turnover_days: 30,
          step_pct: 0.03,
          confidence: 'high'
        },
        recommendation: {
          status: 'waiting_rop',
          price: 97,
          margin_pct: 0.3,
          reason_codes: ['demand_overstock_price_decrease', 'demand_price_requires_rop']
        },
        approval_gate: {
          type: 'DEMAND_PRICE_REVIEW',
          required: true
        }
      }
    ]
  };
  const legacy = {
    rows: [
      { articleKey: 'sku-1', wb: { recPrice: 100.5, action: 'KEEP' } },
      { articleKey: 'sku-2', ozon: { recPrice: 202, action: 'UP' } }
    ]
  };
  const closedGaps = {
    schema: 'repricer-margin-minmax-gaps-v1',
    summary: { blockedRows: 0 }
  };

  const allowed = compareRepricerSnapshots({
    canonical,
    legacy,
    gaps: closedGaps,
    priceToleranceRub: 1,
    minCanonicalCoverage: 0.95,
    minPriceAgreement: 0.5,
    generatedAt: '2026-07-24T00:00:00.000Z'
  });
  assert.strictEqual(allowed.cutover_allowed, true);
  assert.strictEqual(allowed.mode, 'canonical_active');
  assert.strictEqual(allowed.summary.matching_price_rows, 1);
  assert.strictEqual(allowed.summary.price_mismatch_rows, 1);
  assert.strictEqual(allowed.summary.price_agreement, 0.5);
  assert.strictEqual(allowed.summary.demand_price_review_rows, 1);
  assert.strictEqual(allowed.summary.demand_price_decrease_rows, 1);
  assert.strictEqual(allowed.demand_price_reviews[0].proposedPrice, 97);

  const openGaps = compareRepricerSnapshots({
    canonical,
    legacy,
    gaps: {
      schema: 'repricer-margin-minmax-gaps-v1',
      summary: { blockedRows: 1 }
    },
    minPriceAgreement: 0.5
  });
  assert.strictEqual(openGaps.cutover_allowed, false);
  assert(openGaps.blocking_reasons.includes('required_margin_minmax_gaps_open'));

  const missingGaps = compareRepricerSnapshots({
    canonical,
    legacy,
    gaps: null,
    minPriceAgreement: 0.5
  });
  assert.strictEqual(missingGaps.cutover_allowed, false);
  assert(missingGaps.blocking_reasons.includes('margin_minmax_gaps_report_missing'));

  console.log('[build-repricer-shadow-report.selftest] PASS');
}

run();
