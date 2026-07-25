#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  fetchRemoteControls,
  materializeApprovedDecisions,
  run
} = require('./materialize-repricer-approved-decisions');
const {
  approvedRecord,
  lifecycleApprovalFor,
  lifecycleApprovalMap
} = require('./build-canonical-repricer');

function approvedMetadata(overrides = {}) {
  return {
    author: 'Менеджер',
    role: 'Категорийный менеджер',
    reason: 'Проверено по цифрам',
    createdAt: '2026-07-24T08:00:00.000Z',
    approvedBy: 'РОП',
    approvedAt: '2026-07-24T09:00:00.000Z',
    updatedAt: '2026-07-24T09:00:00.000Z',
    ...overrides
  };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repricer-approved-decisions-'));
  const priceOutputPath = path.join(root, 'repricer_approved_overrides.json');
  const lifecycleOutputPath = path.join(root, 'product_lifecycle_approved.json');
  const controlsPath = path.join(root, 'repricer_controls.json');
  const controls = {
    overrides: [
      approvedMetadata({
        id: 'price-approved',
        articleKey: 'sku-price',
        platform: 'wb',
        mode: 'force',
        forcePrice: 1234,
        approvalStatus: 'approved',
        sourceStore: 'portal_task_approval'
      }),
      approvedMetadata({
        id: 'price-pending',
        articleKey: 'sku-pending',
        platform: 'ozon',
        forcePrice: 999,
        approvalStatus: 'waiting_rop',
        sourceStore: 'portal_task_approval'
      }),
      {
        id: 'price-local-draft',
        articleKey: 'sku-draft',
        platform: 'wb',
        forcePrice: 888,
        approvalStatus: 'approved',
        sourceStore: 'local_storage_draft_only'
      }
    ],
    productLifecycleOverrides: [
      {
        articleKey: 'sku-status',
        key: 'exit',
        status: 'Вывод',
        note: 'Согласовано',
        updatedAt: '2026-07-24T09:00:00.000Z'
      },
      {
        articleKey: 'sku-status-pending',
        key: 'new',
        status: 'Новый',
        updatedAt: '2026-07-24T09:00:00.000Z'
      }
    ],
    productLifecycleOverrideDeletes: [],
    skuDecisionApprovals: [
      approvedMetadata({
        id: 'status-approved',
        taskId: 'task-status-approved',
        type: 'PRODUCT_STATUS_CHANGE',
        articleKey: 'sku-status',
        status: 'applied',
        requestedBy: 'Менеджер',
        requestedRole: 'Категорийный менеджер',
        payload: {
          proposedStatusKey: 'exit',
          proposedStatusLabel: 'Вывод'
        }
      }),
      approvedMetadata({
        id: 'status-pending',
        taskId: 'task-status-pending',
        type: 'PRODUCT_STATUS_CHANGE',
        articleKey: 'sku-status-pending',
        status: 'waiting_rop',
        requestedBy: 'Менеджер',
        requestedRole: 'Категорийный менеджер',
        payload: {
          proposedStatusKey: 'new',
          proposedStatusLabel: 'Новый'
        }
      })
    ]
  };
  fs.writeFileSync(controlsPath, JSON.stringify(controls), 'utf8');

  const preview = materializeApprovedDecisions(controls, {
    now: Date.parse('2026-07-24T10:00:00.000Z'),
    priceOutputPath,
    lifecycleOutputPath,
    preserveExisting: false
  });
  assert.deepStrictEqual(preview.prices.records.map((record) => record.articleKey), ['sku-price']);
  assert.strictEqual(preview.prices.records[0].price, 1234);
  assert.strictEqual(preview.prices.records[0].approvalStatus, 'approved');
  assert.deepStrictEqual(preview.lifecycle.records.map((record) => record.articleKey), ['sku-status']);
  assert.strictEqual(preview.lifecycle.records[0].lifecycleKey, 'exit');
  assert.strictEqual(preview.lifecycle.records[0].platform, 'all');

  const written = await run({
    controlsPath,
    priceOutputPath,
    lifecycleOutputPath,
    strict: true,
    remote: false,
    noWrite: false,
    preserveExisting: false
  });
  assert.strictEqual(written.approvedPriceOverrides, 1);
  assert.strictEqual(written.approvedLifecycleOverrides, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(priceOutputPath, 'utf8')).records.length, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(lifecycleOutputPath, 'utf8')).records.length, 1);
  const writtenPrice = JSON.parse(fs.readFileSync(priceOutputPath, 'utf8')).records[0];
  assert.strictEqual(approvedRecord(writtenPrice), true, 'canonical builder must accept the materialized price approval');
  const lifecycleMap = lifecycleApprovalMap(root);
  assert.strictEqual(
    lifecycleApprovalFor(lifecycleMap, 'sku-status', 'wb')?.lifecycleKey,
    'exit',
    'canonical builder must accept the materialized lifecycle approval'
  );

  const retrySleeps = [];
  let retryCalls = 0;
  const remotePayload = { overrides: [], skuDecisionApprovals: [] };
  const remoteResult = await fetchRemoteControls({
    brand: 'Алтея',
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'service-role-test',
    remoteMaxAttempts: 3,
    remoteRetryDelayMs: 1,
    remoteRetryMaxDelayMs: 1,
    sleep: async (delayMs) => retrySleeps.push(delayMs),
    fetchImpl: async () => {
      retryCalls += 1;
      if (retryCalls === 1) {
        return {
          ok: false,
          status: 521,
          headers: { get: () => null },
          text: async () => JSON.stringify({ retryable: true })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [{ payload: remotePayload }]
      };
    }
  });
  assert.deepStrictEqual(remoteResult, remotePayload, 'retry must return the recovered Supabase payload');
  assert.strictEqual(retryCalls, 2, 'retryable Supabase 5xx must be retried');
  assert.deepStrictEqual(retrySleeps, [1], 'retry delay must be bounded by configuration');

  let nonRetryCalls = 0;
  await assert.rejects(
    () => fetchRemoteControls({
      brand: 'Алтея',
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-test',
      remoteMaxAttempts: 3,
      remoteRetryDelayMs: 1,
      remoteRetryMaxDelayMs: 1,
      sleep: async () => {},
      fetchImpl: async () => {
        nonRetryCalls += 1;
        return {
          ok: false,
          status: 400,
          headers: { get: () => null },
          text: async () => '{"error":"invalid request"}'
        };
      }
    }),
    /HTTP 400/,
    'non-retryable 4xx must fail immediately'
  );
  assert.strictEqual(nonRetryCalls, 1, 'logical 4xx must not be retried');

  let explicitNoRetryCalls = 0;
  await assert.rejects(
    () => fetchRemoteControls({
      brand: 'Алтея',
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-test',
      remoteMaxAttempts: 3,
      remoteRetryDelayMs: 1,
      remoteRetryMaxDelayMs: 1,
      sleep: async () => {},
      fetchImpl: async () => {
        explicitNoRetryCalls += 1;
        return {
          ok: false,
          status: 525,
          headers: { get: () => null },
          text: async () => '{"retryable":false,"error_name":"ssl_handshake_failed"}'
        };
      }
    }),
    /HTTP 525/,
    'an upstream response explicitly marked non-retryable must fail immediately'
  );
  assert.strictEqual(explicitNoRetryCalls, 1, 'explicit non-retryable 5xx must not be retried');

  console.log('[materialize-repricer-approved-decisions-selftest] OK: only fully approved price and lifecycle decisions reach canonical inputs');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
