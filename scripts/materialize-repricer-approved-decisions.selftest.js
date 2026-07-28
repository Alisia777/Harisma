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
  lifecycleApprovalMap,
  serverApprovedRegistryRecord
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
  const marginOutputPath = path.join(root, 'repricer_minmax_registry.json');
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
      }),
      approvedMetadata({
        id: 'margin-approved',
        taskId: 'task-margin-approved',
        type: 'MARGIN_POLICY_CHANGE',
        articleKey: 'sku-margin',
        platform: 'wb',
        status: 'applied',
        requestedBy: 'Менеджер',
        requestedRole: 'Категорийный менеджер',
        payload: {
          lifecycleKey: 'active',
          minMarginPct: 0.25,
          maxMarginPct: 0.4,
          minPrice: 900,
          maxPrice: 1300
        }
      }),
      approvedMetadata({
        id: 'margin-exit-approved',
        taskId: 'task-margin-exit-approved',
        type: 'MARGIN_POLICY_CHANGE',
        articleKey: 'sku-exit',
        platform: 'ozon',
        status: 'applied',
        requestedBy: 'Менеджер',
        requestedRole: 'Категорийный менеджер',
        payload: {
          lifecycleKey: 'exit',
          liquidationMinMarginPct: 0,
          minPrice: 500,
          maxPrice: 800
        }
      })
    ]
  };
  fs.writeFileSync(controlsPath, JSON.stringify(controls), 'utf8');

  const preview = materializeApprovedDecisions(controls, {
    now: Date.parse('2026-07-24T10:00:00.000Z'),
    priceOutputPath,
    lifecycleOutputPath,
    marginOutputPath,
    preserveExisting: false
  });
  assert.deepStrictEqual(preview.prices.records.map((record) => record.articleKey), ['sku-price']);
  assert.strictEqual(preview.prices.records[0].price, 1234);
  assert.strictEqual(preview.prices.records[0].approvalStatus, 'approved');
  assert.deepStrictEqual(preview.lifecycle.records.map((record) => record.articleKey), ['sku-status']);
  assert.strictEqual(preview.lifecycle.records[0].lifecycleKey, 'exit');
  assert.strictEqual(preview.lifecycle.records[0].platform, 'all');
  assert.deepStrictEqual(
    preview.margins.rows.map((record) => `${record.platform}:${record.articleKey}`),
    ['ozon:sku-exit', 'wb:sku-margin']
  );
  assert.strictEqual(preview.margins.rows.find((record) => record.articleKey === 'sku-margin').minMarginPct, 0.25);
  assert.strictEqual(preview.margins.rows.find((record) => record.articleKey === 'sku-margin').maxMarginPct, 0.4);
  assert.strictEqual(preview.margins.rows.find((record) => record.articleKey === 'sku-exit').liquidationMinMarginPct, 0);

  const written = await run({
    controlsPath,
    priceOutputPath,
    lifecycleOutputPath,
    marginOutputPath,
    strict: true,
    remote: false,
    noWrite: false,
    preserveExisting: false
  });
  assert.strictEqual(written.approvedPriceOverrides, 1);
  assert.strictEqual(written.approvedLifecycleOverrides, 1);
  assert.strictEqual(written.approvedMarginPolicies, 2);
  assert.strictEqual(JSON.parse(fs.readFileSync(priceOutputPath, 'utf8')).records.length, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(lifecycleOutputPath, 'utf8')).records.length, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(marginOutputPath, 'utf8')).rows.length, 2);
  const writtenPrice = JSON.parse(fs.readFileSync(priceOutputPath, 'utf8')).records[0];
  assert.strictEqual(approvedRecord(writtenPrice), true, 'canonical builder must accept the materialized price approval');
  const lifecycleMap = lifecycleApprovalMap(root);
  assert.strictEqual(
    lifecycleApprovalFor(lifecycleMap, 'sku-status', 'wb')?.lifecycleKey,
    'exit',
    'canonical builder must accept the materialized lifecycle approval'
  );
  JSON.parse(fs.readFileSync(marginOutputPath, 'utf8')).rows.forEach((record) => {
    assert.strictEqual(
      serverApprovedRegistryRecord(record),
      true,
      'canonical builder must accept every materialized margin/MIN/MAX policy'
    );
  });

  const retrySleeps = [];
  let retryCalls = 0;
  let retryUrl = null;
  let retryRequestOptions = null;
  const remotePayload = { overrides: [], skuDecisionApprovals: [] };
  const remoteResult = await fetchRemoteControls({
    brand: 'Алтея',
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'service-role-test',
    remoteMaxAttempts: 3,
    remoteRetryDelayMs: 1,
    remoteRetryMaxDelayMs: 1,
    sleep: async (delayMs) => retrySleeps.push(delayMs),
    fetchImpl: async (url, requestOptions) => {
      retryCalls += 1;
      retryUrl = new URL(url);
      retryRequestOptions = requestOptions;
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
  assert.strictEqual(retryUrl.searchParams.get('select'), 'payload');
  assert.strictEqual(retryUrl.searchParams.get('brand'), 'eq.Алтея');
  assert.strictEqual(retryUrl.searchParams.get('snapshot_key'), 'eq.repricer_controls');
  assert.strictEqual(retryUrl.searchParams.has('order'), false, 'primary-key lookup must not sort the table');
  assert.ok(retryRequestOptions.signal, 'remote reads must have an abort signal');

  let timeoutCalls = 0;
  await assert.rejects(
    () => fetchRemoteControls({
      brand: 'Алтея',
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'service-role-test',
      remoteMaxAttempts: 2,
      remoteRequestTimeoutMs: 5,
      remoteRetryDelayMs: 1,
      remoteRetryMaxDelayMs: 1,
      sleep: async () => {},
      fetchImpl: async (_url, requestOptions) => {
        timeoutCalls += 1;
        return new Promise((_resolve, reject) => {
          requestOptions.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        });
      }
    }),
    /request timed out after 5ms/,
    'hung Supabase reads must be bounded and retried'
  );
  assert.strictEqual(timeoutCalls, 2, 'timed-out Supabase reads must exhaust configured attempts');

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

  console.log('[materialize-repricer-approved-decisions-selftest] OK: only fully approved price, lifecycle and margin/MIN/MAX decisions reach canonical inputs');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
