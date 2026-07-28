#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  buildApplyPlan,
  buildRollbackPlan,
  submitApplyPlan,
  verifyReceipt
} = require('./portal-repricer-price-apply');
const {
  clientPriceProjection: canonicalClientPriceProjection
} = require('./build-canonical-repricer');

function fixture() {
  const generatedAt = new Date().toISOString();
  const rows = [
    {
      article_key: 'wb-safe',
      platform: 'wb',
      facts: {
        seller_price: 1000,
        price_freshness: 'fresh',
        lifecycle_key: 'active',
        stock_source_status: 'trusted_direct',
        sources: { seller_price: { file: 'repricer_live_prices.json' } }
      },
      policy: { floor: 1200, cap: 1200, margin_guard_required: true, target_margin_pct: 0.2 },
      recommendation: { status: 'ready', price: 1200, margin_pct: 0.2 },
      approval_gate: { type: '', required: false }
    },
    {
      article_key: 'oz-safe',
      platform: 'ozon',
      facts: {
        seller_price: 1000,
        price_freshness: 'fresh',
        lifecycle_key: 'active',
        stock_source_status: 'trusted_direct',
        sources: { seller_price: { file: 'repricer_live_prices.json' } }
      },
      policy: { floor: 1100, cap: 1500, margin_guard_required: true, target_margin_pct: 0.2 },
      recommendation: { status: 'ready', price: 1100, margin_pct: 0.21 },
      approval_gate: { type: '', required: false }
    }
  ];
  return {
    canonical: {
      snapshot_id: 'canonical-test',
      feature_status: 'ok',
      rows
    },
    livePrices: {
      status: 'ok',
      generatedAt,
      asOfDate: '2026-07-24',
      platforms: {
        wb: {
          rows: [{
            articleKey: 'wb-safe',
            nmId: 101,
            discountPct: 20,
            currentSellerPrice: 1000,
            currentClientPrice: 950,
            currentBuyerDiscountPct: 0.05,
            currentListPrice: 1250
          }]
        },
        ozon: {
          rows: [{
            articleKey: 'oz-safe',
            offerId: 'oz-safe',
            productId: 202,
            currency: 'RUB',
            currentSellerPrice: 1000,
            currentClientPrice: 920,
            currentBuyerDiscountPct: 0.08,
            currentListPrice: 1500,
            currentMinPrice: 900
          }]
        }
      }
    },
    liveSignals: {
      generatedAt,
      asOfDate: '2026-07-24',
      summary: { directPlatforms: ['wb', 'ozon'] },
      rows: [
        { platform: 'wb', articleKey: 'wb-safe', available: 10, oos: false, sourceMode: 'wb_stock_api' },
        { platform: 'ozon', articleKey: 'oz-safe', available: 20, oos: false, sourceMode: 'ozon_stock_api_v4' }
      ]
    },
    decisionCenter: {
      rows: [
        {
          platform: 'wb',
          articleKey: 'wb-safe',
          dataQuality: { usable: true, blockers: [] },
          automation: { tier: 'double_confirmation', autoApplyEligible: false },
          approval: {
            status: 'APPROVED',
            confirmationsRequired: 2,
            confirmationStages: ['ROP_TASK', 'API_APPLY_PREVIEW']
          }
        },
        {
          platform: 'ozon',
          articleKey: 'oz-safe',
          dataQuality: { usable: true, blockers: [] },
          automation: { tier: 'rop_approval', autoApplyEligible: false },
          approval: {
            status: 'APPROVED',
            confirmationsRequired: 1,
            confirmationStages: ['ROP_TASK']
          }
        }
      ]
    },
    shadow: { cutover_allowed: true }
  };
}

async function run() {
  const source = fixture();
  const plan = buildApplyPlan({
    ...source,
    now: new Date(source.livePrices.generatedAt),
    requestedBy: 'operator@example.com'
  });
  assert.strictEqual(plan.status, 'ready');
  assert.strictEqual(plan.applyAllowed, true);
  assert.strictEqual(plan.requestedBy, 'operator@example.com');
  assert.strictEqual(plan.actions.length, 2);
  assert.strictEqual(plan.actions[0].apiPayload.nmID, 101);
  assert.strictEqual(plan.actions[0].apiPayload.price, 1500);
  assert.strictEqual(plan.actions[0].apiPayload.discount, 20);
  assert.strictEqual(plan.actions[0].expectedSellerPrice, 1200);
  assert.strictEqual(plan.actions[0].currentClientPrice, 950);
  assert.strictEqual(plan.actions[0].expectedClientPriceAfter, 1140);
  assert.strictEqual(plan.actions[0].currentBuyerDiscountPct, 0.05);
  assert.strictEqual(plan.actions[1].expectedClientPriceAfter, 1012);
  assert.strictEqual(plan.actions[0].rollbackEligible, true);
  assert.deepStrictEqual(plan.actions[0].rollbackApiPayload, {
    nmID: 101,
    price: 1250,
    discount: 20
  });
  assert.strictEqual(plan.actions[1].rollbackEligible, true);
  assert.strictEqual(plan.actions[0].automationTier, 'double_confirmation');
  assert.strictEqual(plan.actions[0].confirmationsRequired, 2);
  assert.strictEqual(plan.actions[0].confirmationsRecordedAtPlan, 1);
  assert.strictEqual(plan.actions[1].automationTier, 'rop_approval');
  assert.deepStrictEqual(
    canonicalClientPriceProjection(1000, 950, null, 1200),
    {
      client_price_before: 950,
      buyer_discount_factor: 0.95,
      effective_buyer_discount_pct: 0.05,
      expected_client_price_after: 1140,
      source: 'current_client_price_ratio'
    }
  );
  const repeatedPlan = buildApplyPlan({
    ...source,
    livePrices: { ...source.livePrices, generatedAt: new Date(Date.parse(source.livePrices.generatedAt) + 60000).toISOString() },
    liveSignals: { ...source.liveSignals, generatedAt: new Date(Date.parse(source.liveSignals.generatedAt) + 60000).toISOString() },
    now: new Date(Date.parse(source.livePrices.generatedAt) + 60000)
  });
  assert.strictEqual(repeatedPlan.confirmationHash, plan.confirmationHash, 'unchanged business plan must keep its confirmation hash across refresh runs');
  assert.deepStrictEqual(plan.actions[1].apiPayload, {
    offer_id: 'oz-safe',
    price: '1100',
    old_price: '1500',
    min_price: '1100',
    currency_code: 'RUB',
    auto_action_enabled: 'UNKNOWN'
  });

  const batchedPlan = buildApplyPlan({
    ...source,
    now: new Date(source.livePrices.generatedAt),
    maxRows: 1
  });
  assert.strictEqual(batchedPlan.status, 'ready');
  assert.strictEqual(batchedPlan.applyAllowed, true);
  assert.strictEqual(batchedPlan.summary.candidateActions, 2);
  assert.strictEqual(batchedPlan.summary.actions, 1);
  assert.strictEqual(batchedPlan.summary.deferred, 1);
  assert.strictEqual(batchedPlan.actions[0].articleKey, 'wb-safe', 'active batches must be deterministic');
  assert(batchedPlan.ignored.some((row) => row.articleKey === 'oz-safe' && row.reason === 'deferred_batch_limit'));
  assert(batchedPlan.warnings.includes('actions_deferred_to_next_batch:1'));
  assert(!batchedPlan.globalBlockers.some((reason) => reason.startsWith('batch_limit_exceeded:')));

  const calls = [];
  const submissions = await submitApplyPlan(plan, {
    wbToken: 'wb-test',
    ozonClientId: 'ozon-client',
    ozonApiKey: 'ozon-key'
  }, async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url.includes('wildberries')) return { data: { id: 777 }, error: false };
    return {
      result: [{ offer_id: 'oz-safe', product_id: 202, updated: true, errors: [] }]
    };
  });
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(submissions.wb.uploadId, 777);
  assert.strictEqual(submissions.ozon.accepted, 1);

  const receipt = {
    actions: plan.actions,
    requestedBy: plan.requestedBy,
    confirmationHash: plan.confirmationHash
  };
  const verified = verifyReceipt(receipt, {
    platforms: {
      wb: { rows: [{ articleKey: 'wb-safe', currentSellerPrice: 1200, currentClientPrice: 1134 }] },
      ozon: { rows: [{ articleKey: 'oz-safe', currentSellerPrice: 1100, currentClientPrice: 1012 }] }
    }
  });
  assert.strictEqual(verified.status, 'verified');
  assert.strictEqual(verified.summary.matched, 2);
  assert.strictEqual(verified.requestedBy, 'operator@example.com');
  assert.strictEqual(verified.confirmationHash, plan.confirmationHash);
  assert.strictEqual(verified.summary.clientPricesObserved, 2);
  assert.strictEqual(verified.rows[0].previousClientPrice, 950);
  assert.strictEqual(verified.rows[0].expectedClientPrice, 1140);
  assert.strictEqual(verified.rows[0].actualClientPrice, 1134);
  assert.strictEqual(verified.rows[0].sellerMatched, true);
  assert.strictEqual(verified.rows[0].clientPriceMatchedProjection, false);
  assert.strictEqual(verified.rows[1].clientPriceMatchedProjection, true);
  assert.strictEqual(verified.remediation.status, 'not_required');

  const mismatch = verifyReceipt(receipt, {
    platforms: {
      wb: { rows: [{ articleKey: 'wb-safe', currentSellerPrice: 1190, currentClientPrice: 1130 }] },
      ozon: { rows: [{ articleKey: 'oz-safe', currentSellerPrice: 1080, currentClientPrice: 995 }] }
    }
  });
  assert.strictEqual(mismatch.status, 'mismatch_action_required');
  assert.strictEqual(mismatch.summary.remediationTasks, 2);
  assert.strictEqual(mismatch.remediation.automaticRollbackAllowed, true);
  assert(mismatch.remediation.tasks.every((task) => task.status === 'OPEN'));
  const rollback = buildRollbackPlan(receipt, mismatch);
  assert.strictEqual(rollback.status, 'ready');
  assert.strictEqual(rollback.actions.length, 2);
  assert.strictEqual(rollback.actions[0].expectedSellerPrice, 1000);
  assert.strictEqual(rollback.actions[1].apiPayload.min_price, '900');

  const fallback = fixture();
  fallback.liveSignals.summary.directPlatforms = [];
  fallback.liveSignals.rows[0].sourceMode = 'fallback_procurement';
  fallback.canonical.rows[0].facts.stock_source_status = 'trusted_fallback';
  const blocked = buildApplyPlan({ ...fallback, now: new Date(fallback.livePrices.generatedAt) });
  assert.strictEqual(blocked.status, 'blocked');
  assert(blocked.globalBlockers.includes('direct_stock_platform_missing:wb'));
  assert(blocked.globalBlockers.includes('direct_stock_platform_missing:ozon'));
  assert(blocked.rejected.some((row) => row.reasons.includes('direct_sku_stock_missing')));
  await assert.rejects(
    () => submitApplyPlan(blocked, { wbToken: 'x', ozonClientId: 'y', ozonApiKey: 'z' }),
    /price apply plan is blocked/
  );

  const excessive = fixture();
  excessive.canonical.rows[0].recommendation.price = 1600;
  excessive.canonical.rows[0].recommendation.margin_pct = 0.4;
  excessive.canonical.rows[0].policy.floor = 1600;
  excessive.canonical.rows[0].policy.cap = 1600;
  const excessivePlan = buildApplyPlan({ ...excessive, now: new Date(excessive.livePrices.generatedAt) });
  assert(excessivePlan.rejected.some((row) => row.reasons.includes('apply_change_limit_exceeded')));
  assert(excessivePlan.warnings.includes('ready_rows_rejected:1'));
  assert.strictEqual(excessivePlan.status, 'ready', 'one rejected row must not block independent safe actions');

  const missingApproval = fixture();
  missingApproval.decisionCenter.rows[0].approval.status = 'PENDING_ROP';
  const missingApprovalPlan = buildApplyPlan({
    ...missingApproval,
    now: new Date(missingApproval.livePrices.generatedAt)
  });
  assert(missingApprovalPlan.rejected.some((row) => (
    row.articleKey === 'wb-safe'
    && row.reasons.includes('first_confirmation_rop_task_required')
  )));

  const automatic = fixture();
  automatic.canonical.rows[0].recommendation.price = 1020;
  automatic.canonical.rows[0].recommendation.margin_pct = 0.21;
  automatic.canonical.rows[0].policy.floor = 1020;
  automatic.canonical.rows[0].policy.cap = 1020;
  automatic.decisionCenter.rows[0].automation = { tier: 'automatic', autoApplyEligible: true };
  automatic.decisionCenter.rows[0].approval = {
    status: 'NOT_REQUIRED',
    confirmationsRequired: 0,
    confirmationStages: []
  };
  const automaticPlan = buildApplyPlan({
    ...automatic,
    now: new Date(automatic.livePrices.generatedAt)
  });
  const automaticAction = automaticPlan.actions.find((row) => row.articleKey === 'wb-safe');
  assert.strictEqual(automaticAction.autoApplyEligible, true);
  assert.strictEqual(automaticAction.automationTier, 'automatic');
  assert.strictEqual(automaticPlan.summary.automaticEligible, 1);

  const applyWorkflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'portal-repricer-price-apply.yml'),
    'utf8'
  );
  const refreshWorkflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'portal-repricer-prices.yml'),
    'utf8'
  );
  assert.match(applyWorkflow, /run:\s+npm ci/);
  assert.match(refreshWorkflow, /run:\s+npm ci/);
  assert.match(applyWorkflow, /SUPABASE_SERVICE_ROLE_KEY:/);
  assert.match(applyWorkflow, /--confirmation "\$CONFIRMATION_HASH"/);
  assert.doesNotMatch(applyWorkflow, /--confirmation '\$\{\{\s*inputs\.confirmation_hash/);
  assert.match(
    applyWorkflow,
    /repricer_team_policy_proposals,repricer_shadow_report,repricer_price_apply_plan/
  );
  assert.match(applyWorkflow, /--requested-by "\$REQUESTED_BY"/);

  console.log('[repricer-price-apply] PASS: plan hash, audit identity, direct-stock gate, safe inputs, submission, readback and exact rollback/task remediation');
}

run().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
