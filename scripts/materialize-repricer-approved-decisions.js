#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_BRAND = 'Алтея';
const DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';
const SNAPSHOT_TABLE = 'portal_data_snapshots';
const CONTROLS_SNAPSHOT_KEY = 'repricer_controls';
const PRICE_OUTPUT_FILE = 'repricer_approved_overrides.json';
const LIFECYCLE_OUTPUT_FILE = 'product_lifecycle_approved.json';
const DEFAULT_REMOTE_MAX_ATTEMPTS = 4;
const DEFAULT_REMOTE_RETRY_DELAY_MS = 5000;
const DEFAULT_REMOTE_RETRY_MAX_DELAY_MS = 120000;

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

function resolveOptions(args = {}) {
  const inputDir = path.resolve(args['input-dir'] || path.join(process.cwd(), 'data'));
  const outputDir = path.resolve(args['output-dir'] || inputDir);
  const remoteMaxAttempts = Math.max(
    1,
    Math.trunc(Number(args['remote-attempts'] || process.env.ALTEA_REPRICER_REMOTE_ATTEMPTS))
      || DEFAULT_REMOTE_MAX_ATTEMPTS
  );
  const remoteRetryDelayMs = Math.max(
    0,
    Math.trunc(Number(args['remote-retry-delay-ms'] || process.env.ALTEA_REPRICER_REMOTE_RETRY_DELAY_MS))
      || DEFAULT_REMOTE_RETRY_DELAY_MS
  );
  const remoteRetryMaxDelayMs = Math.max(
    remoteRetryDelayMs,
    Math.trunc(Number(args['remote-retry-max-delay-ms'] || process.env.ALTEA_REPRICER_REMOTE_RETRY_MAX_DELAY_MS))
      || DEFAULT_REMOTE_RETRY_MAX_DELAY_MS
  );
  return {
    inputDir,
    outputDir,
    controlsPath: path.resolve(args.controls || path.join(inputDir, 'repricer_controls.json')),
    priceOutputPath: path.resolve(args['price-output'] || path.join(outputDir, PRICE_OUTPUT_FILE)),
    lifecycleOutputPath: path.resolve(args['lifecycle-output'] || path.join(outputDir, LIFECYCLE_OUTPUT_FILE)),
    remote: Boolean(args.remote),
    strict: Boolean(args.strict),
    noWrite: Boolean(args['no-write']),
    brand: String(args.brand || process.env.ALTEA_PORTAL_BRAND || DEFAULT_BRAND).trim() || DEFAULT_BRAND,
    supabaseUrl: String(
      args['supabase-url']
      || process.env.ALTEA_SUPABASE_URL
      || process.env.SUPABASE_URL
      || DEFAULT_SUPABASE_URL
    ).replace(/\/+$/, ''),
    supabaseKey: String(
      args['supabase-key']
      || process.env.ALTEA_SUPABASE_KEY
      || process.env.ALTEA_SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || ''
    ).trim(),
    remoteMaxAttempts,
    remoteRetryDelayMs,
    remoteRetryMaxDelayMs
  };
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function text(...values) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function positive(...values) {
  for (const value of values) {
    if (value === '' || value === null || value === undefined) continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function stamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordStamp(record = {}) {
  return Math.max(
    stamp(record.updatedAt || record.updated_at),
    stamp(record.appliedAt || record.applied_at),
    stamp(record.approvedAt || record.approved_at),
    stamp(record.createdAt || record.created_at)
  );
}

function platformKey(value) {
  const normalized = String(value || 'all').trim().toLowerCase();
  return ['wb', 'ozon', 'ym', 'all'].includes(normalized) ? normalized : 'all';
}

function articleKey(record = {}) {
  return text(record.articleKey, record.article, record.sku, record.offerId);
}

function metadata(record = {}) {
  return {
    author: text(record.author, record.requestedBy, record.createdBy, record.created_by),
    role: text(record.role, record.requestedRole, record.authorRole, record.author_role),
    reason: text(record.reason, record.note),
    createdAt: text(record.createdAt, record.created_at, record.requestedAt),
    approvedBy: text(record.approvedBy, record.approved_by),
    approvedAt: text(record.approvedAt, record.approved_at, record.appliedAt, record.applied_at)
  };
}

function metadataComplete(record = {}) {
  const values = metadata(record);
  return Object.values(values).every(Boolean);
}

function notExpired(record = {}, now = Date.now()) {
  const expiresAt = text(record.expiresAt, record.expires_at);
  return !expiresAt || !stamp(expiresAt) || stamp(expiresAt) >= now;
}

function approvedOverride(record = {}, now = Date.now()) {
  const status = text(record.approvalStatus, record.approval_status, record.status).toLowerCase();
  const sourceStore = text(record.sourceStore, record.source_store, record.source).toLowerCase();
  const price = positive(
    record.promoActive ? record.promoPrice : null,
    record.forcePrice,
    record.price,
    record.approvedPrice
  );
  return Boolean(
    articleKey(record)
    && price !== null
    && ['approved', 'active', 'verified'].includes(status)
    && sourceStore
    && sourceStore !== 'local_storage_draft_only'
    && metadataComplete(record)
    && notExpired(record, now)
  );
}

function normalizedApprovedOverride(record = {}) {
  const meta = metadata(record);
  const price = positive(
    record.promoActive ? record.promoPrice : null,
    record.forcePrice,
    record.price,
    record.approvedPrice
  );
  return {
    id: text(record.id, record.batchId, `${articleKey(record)}|${platformKey(record.platform)}|${meta.approvedAt}`),
    articleKey: articleKey(record),
    platform: platformKey(record.platform),
    mode: 'force',
    price,
    forcePrice: price,
    approvalStatus: 'approved',
    sourceStore: text(record.sourceStore, record.source_store, 'portal_task_approval'),
    ...meta,
    updatedAt: text(record.updatedAt, record.updated_at, meta.approvedAt),
    expiresAt: text(record.expiresAt, record.expires_at),
    batchId: text(record.batchId, record.batch_id),
    sourceFile: text(record.sourceFile, record.source_file),
    sourceChecksum: text(record.sourceChecksum, record.source_checksum),
    note: text(record.note, record.reason)
  };
}

const LIFECYCLE_ALIASES = new Map([
  ['active', 'active'],
  ['активный', 'active'],
  ['актуальный', 'active'],
  ['new', 'new'],
  ['новый', 'new'],
  ['relaunch', 'relaunch'],
  ['перезапуск', 'relaunch'],
  ['question', 'question'],
  ['под вопросом', 'question'],
  ['exit', 'exit'],
  ['вывод', 'exit'],
  ['выводим', 'exit']
]);

function lifecycleKey(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/ё/g, 'е');
  return LIFECYCLE_ALIASES.get(normalized) || '';
}

function latestBy(records, keyFn) {
  const map = new Map();
  records.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = map.get(key);
    if (!current || recordStamp(record) >= recordStamp(current)) map.set(key, record);
  });
  return map;
}

function portalMaterialized(record = {}) {
  return /^portal(_task_approval|_managed)?$/i.test(text(record.sourceStore, record.source_store))
    || /^portal-task:/i.test(text(record.sourceFile, record.source_file));
}

function preserveExternalRecords(filePath) {
  const payload = readJson(filePath, { records: [] });
  const records = Array.isArray(payload) ? payload : list(payload?.records);
  return records.filter((record) => !portalMaterialized(record));
}

function mergeLatest(records, keyFn) {
  return [...latestBy(records, keyFn).values()]
    .sort((left, right) => keyFn(left).localeCompare(keyFn(right), 'ru'));
}

function lifecycleRecordsFromControls(controls = {}, now = Date.now()) {
  const currentOverrides = latestBy(
    list(controls.productLifecycleOverrides),
    (record) => articleKey(record)
  );
  const deleteMarkers = latestBy(
    list(controls.productLifecycleOverrideDeletes),
    (record) => articleKey(record)
  );
  const decisions = list(controls.skuDecisionApprovals)
    .filter((decision) => (
      text(decision.type, decision.decisionType).toUpperCase() === 'PRODUCT_STATUS_CHANGE'
      && ['applied', 'approved'].includes(text(decision.status, decision.approvalStatus).toLowerCase())
      && metadataComplete(decision)
      && notExpired(decision, now)
    ));
  const latestDecisions = latestBy(decisions, (decision) => articleKey(decision));
  const records = [];
  latestDecisions.forEach((decision, key) => {
    const payload = decision.payload && typeof decision.payload === 'object' ? decision.payload : {};
    const current = currentOverrides.get(key);
    const deleted = deleteMarkers.get(key);
    const proposedKey = lifecycleKey(
      payload.proposedStatusKey
      || payload.proposedStatusLabel
      || decision.proposedValue
    );
    if (payload.clearOverride || !proposedKey || !current) return;
    if (lifecycleKey(current.key || current.status) !== proposedKey) return;
    if (deleted && recordStamp(deleted) >= recordStamp(current)) return;
    const meta = metadata(decision);
    records.push({
      id: text(decision.id, `${key}|lifecycle|${meta.approvedAt}`),
      articleKey: key,
      platform: 'all',
      lifecycleKey: proposedKey,
      productLifecycleStatus: proposedKey,
      productStatus: text(current.status, payload.proposedStatusLabel, decision.proposedValue, proposedKey),
      approvalStatus: 'approved',
      sourceStore: 'portal_task_approval',
      ...meta,
      updatedAt: text(current.updatedAt, decision.updatedAt, meta.approvedAt),
      batchId: text(decision.id),
      sourceFile: `portal-task:${text(decision.taskId, decision.id)}`,
      note: text(current.note, decision.reason)
    });
  });
  return records;
}

function materializeApprovedDecisions(controls = {}, options = {}) {
  const now = options.now || Date.now();
  const priceRecords = list(controls.overrides || controls.repricerOverrides)
    .filter((record) => approvedOverride(record, now))
    .map(normalizedApprovedOverride);
  const lifecycleRecords = lifecycleRecordsFromControls(controls, now);
  const existingPriceRecords = options.preserveExisting === false
    ? []
    : preserveExternalRecords(options.priceOutputPath);
  const existingLifecycleRecords = options.preserveExisting === false
    ? []
    : preserveExternalRecords(options.lifecycleOutputPath);
  const mergedPriceRecords = mergeLatest(
    [...existingPriceRecords, ...priceRecords],
    (record) => `${platformKey(record.platform)}|${articleKey(record)}`
  );
  const mergedLifecycleRecords = mergeLatest(
    [...existingLifecycleRecords, ...lifecycleRecords],
    (record) => `all|${articleKey(record)}`
  );
  const generatedAt = new Date(now).toISOString();
  return {
    prices: {
      schema: 'repricer-approved-overrides-v1',
      generatedAt,
      source: CONTROLS_SNAPSHOT_KEY,
      records: mergedPriceRecords
    },
    lifecycle: {
      schema: 'product-lifecycle-approved-v1',
      generatedAt,
      source: CONTROLS_SNAPSHOT_KEY,
      records: mergedLifecycleRecords
    },
    summary: {
      controlsOverrides: list(controls.overrides || controls.repricerOverrides).length,
      approvedPriceOverrides: priceRecords.length,
      lifecycleDecisions: list(controls.skuDecisionApprovals)
        .filter((record) => text(record.type, record.decisionType).toUpperCase() === 'PRODUCT_STATUS_CHANGE').length,
      approvedLifecycleOverrides: lifecycleRecords.length
    }
  };
}

function retryableRemoteStatus(status, body = '') {
  try {
    if (JSON.parse(body || '{}')?.retryable === false) return false;
  } catch {
    // Non-JSON proxy responses are classified by HTTP status below.
  }
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function remoteRetryDelayMs(response, body, attempt, options) {
  const header = String(response?.headers?.get?.('retry-after') || '').trim();
  const headerSeconds = Number(header);
  const headerDate = Date.parse(header);
  let bodySeconds = 0;
  try {
    bodySeconds = Number(JSON.parse(body || '{}')?.retry_after) || 0;
  } catch {
    bodySeconds = 0;
  }
  const requestedDelay = Number.isFinite(headerSeconds) && headerSeconds > 0
    ? headerSeconds * 1000
    : Number.isFinite(headerDate)
      ? Math.max(0, headerDate - Date.now())
      : bodySeconds > 0
        ? bodySeconds * 1000
        : 0;
  const baseDelay = Math.max(0, Number(options.remoteRetryDelayMs) || DEFAULT_REMOTE_RETRY_DELAY_MS);
  const maxDelay = Math.max(
    baseDelay,
    Number(options.remoteRetryMaxDelayMs) || DEFAULT_REMOTE_RETRY_MAX_DELAY_MS
  );
  const exponentialDelay = baseDelay * (2 ** Math.max(0, attempt - 1));
  return Math.min(maxDelay, Math.max(requestedDelay, exponentialDelay));
}

async function fetchRemoteControls(options) {
  if (!options.supabaseKey) {
    throw new Error('Supabase service key is required for --remote materialization.');
  }
  const url = new URL(`${options.supabaseUrl}/${'rest/v1'}/${SNAPSHOT_TABLE}`);
  url.searchParams.set('select', 'payload,generated_at,updated_at');
  url.searchParams.set('brand', `eq.${options.brand}`);
  url.searchParams.set('snapshot_key', `eq.${CONTROLS_SNAPSHOT_KEY}`);
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', '1');
  const request = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch;
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
  const maxAttempts = Math.max(
    1,
    Math.trunc(Number(options.remoteMaxAttempts)) || DEFAULT_REMOTE_MAX_ATTEMPTS
  );
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await request(url, {
        cache: 'no-store',
        headers: {
          apikey: options.supabaseKey,
          Authorization: `Bearer ${options.supabaseKey}`,
          Accept: 'application/json'
        }
      });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      const delayMs = remoteRetryDelayMs(null, '', attempt, options);
      console.warn(
        `[repricer-controls] network error, retry ${attempt + 1}/${maxAttempts} in ${delayMs}ms`
      );
      await sleep(delayMs);
      continue;
    }
    if (response.ok) {
      const rows = await response.json();
      return rows?.[0]?.payload || null;
    }
    const body = await response.text();
    lastError = new Error(
      `Cannot load ${CONTROLS_SNAPSHOT_KEY}: HTTP ${response.status} ${body}`
    );
    if (!retryableRemoteStatus(response.status, body) || attempt >= maxAttempts) break;
    const delayMs = remoteRetryDelayMs(response, body, attempt, options);
    console.warn(
      `[repricer-controls] HTTP ${response.status}, retry ${attempt + 1}/${maxAttempts} in ${delayMs}ms`
    );
    await sleep(delayMs);
  }
  throw lastError || new Error(`Cannot load ${CONTROLS_SNAPSHOT_KEY}: remote request failed`);
}

async function run(options) {
  const controls = options.remote
    ? await fetchRemoteControls(options)
    : readJson(options.controlsPath, null);
  if (!controls || typeof controls !== 'object') {
    if (options.strict) {
      throw new Error(`Required ${CONTROLS_SNAPSHOT_KEY} payload is missing.`);
    }
    return { skipped: true, reason: 'repricer_controls_missing' };
  }
  const result = materializeApprovedDecisions(controls, options);
  if (!options.noWrite) {
    writeJson(options.priceOutputPath, result.prices);
    writeJson(options.lifecycleOutputPath, result.lifecycle);
  }
  return {
    ...result.summary,
    priceOutputPath: options.priceOutputPath,
    lifecycleOutputPath: options.lifecycleOutputPath,
    noWrite: options.noWrite
  };
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const result = await run(options);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  approvedOverride,
  fetchRemoteControls,
  lifecycleKey,
  materializeApprovedDecisions,
  remoteRetryDelayMs,
  retryableRemoteStatus,
  resolveOptions,
  run
};
