#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_BRAND = '\u0410\u043b\u0442\u0435\u044f';
const DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw';
const SNAPSHOT_TABLE = 'portal_data_snapshots';
const DEFAULT_SNAPSHOTS = ['sku_aliases', 'sku_alias_ignore', 'sku_alias_audit'];
const REQUEST_BATCH_SIZE = 8;
const PART_BATCH_SIZE = 8;

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const hasValue = inlineValue !== undefined || (argv[index + 1] && !String(argv[index + 1]).startsWith('--'));
    if (!hasValue) {
      args[key] = true;
      continue;
    }
    args[key] = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return args;
}

function snapshotKeyFromPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (!normalized.startsWith('data/') || !normalized.endsWith('.json')) return '';
  return normalized.slice(5, -5).replace(/\//g, '__');
}

function snapshotsFromInventory(inventoryPath) {
  const payload = JSON.parse(fs.readFileSync(inventoryPath, 'utf8').replace(/^\uFEFF/, ''));
  return [...new Set((Array.isArray(payload?.paths) ? payload.paths : [])
    .map(snapshotKeyFromPath)
    .filter(Boolean))];
}

function resolveOptions(args) {
  const inventoryPath = args.inventory ? path.resolve(args.inventory) : '';
  return {
    outputDir: path.resolve(args['output-dir'] || path.join(process.cwd(), 'data')),
    brand: args.brand || process.env.ALTEA_PORTAL_BRAND || DEFAULT_BRAND,
    supabaseUrl: args['supabase-url'] || process.env.ALTEA_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    supabaseKey: args['supabase-key'] || process.env.ALTEA_SUPABASE_KEY || DEFAULT_SUPABASE_KEY,
    snapshots: args.snapshot
      ? String(args.snapshot).split(',').map((value) => value.trim()).filter(Boolean)
      : (inventoryPath ? snapshotsFromInventory(inventoryPath) : DEFAULT_SNAPSHOTS),
    inventoryPath,
    requestBatchSize: Math.max(1, Math.min(REQUEST_BATCH_SIZE, Math.trunc(Number(args['batch-size']) || REQUEST_BATCH_SIZE))),
    partBatchSize: Math.max(1, Math.min(PART_BATCH_SIZE, Math.trunc(Number(args['part-batch-size']) || PART_BATCH_SIZE))),
    requestTimeoutMs: Math.max(5000, Math.trunc(Number(args['request-timeout-ms']) || 45000)),
    strict: Boolean(args.strict)
  };
}

function snapshotPartKeys(snapshotKey, count) {
  const total = Math.max(0, Math.trunc(Number(count) || 0));
  const keys = [];
  for (let index = 1; index <= total; index += 1) {
    keys.push(`${snapshotKey}__part__${String(index).padStart(4, '0')}`);
  }
  return keys;
}

function buildSnapshotUrl(options, keys = []) {
  const baseUrl = String(options.supabaseUrl || '').replace(/\/+$/, '');
  const url = new URL(`${baseUrl}/rest/v1/${SNAPSHOT_TABLE}`);
  url.searchParams.set('select', 'snapshot_key,payload,generated_at,updated_at,payload_hash');
  url.searchParams.set('brand', `eq.${options.brand}`);
  if (keys.length) {
    url.searchParams.set('snapshot_key', keys.length === 1 ? `eq.${keys[0]}` : `in.(${keys.join(',')})`);
    url.searchParams.set('limit', String(keys.length));
  }
  return url;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestBatch(options, batch) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(buildSnapshotUrl(options, batch), {
        cache: 'no-store',
        signal: AbortSignal.timeout(options.requestTimeoutMs),
        headers: {
          apikey: options.supabaseKey,
          Authorization: `Bearer ${options.supabaseKey}`,
          Accept: 'application/json'
        }
      });
      if (response.ok) return response.json();
      const body = await response.text();
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt === maxAttempts) {
        throw new Error(`Supabase snapshot pull failed: HTTP ${response.status} ${body}`);
      }
      console.warn(`[snapshot-pull] retry ${attempt}/${maxAttempts} after HTTP ${response.status}: ${batch.join(',')}`);
    } catch (error) {
      if (attempt === maxAttempts || /HTTP 4\d\d/.test(String(error?.message || ''))) throw error;
      console.warn(`[snapshot-pull] retry ${attempt}/${maxAttempts} after ${error?.code || error?.cause?.code || error?.message || error}: ${batch.join(',')}`);
    }
    await wait(Math.min(2000 * attempt, 8000));
  }
  return [];
}

async function requestRows(options, keys = [], batchSize = options.requestBatchSize) {
  const rows = [];
  for (let index = 0; index < keys.length; index += batchSize) {
    const batch = keys.slice(index, index + batchSize);
    rows.push(...await requestBatch(options, batch));
    const completed = Math.min(index + batchSize, keys.length);
    if (completed === keys.length || completed % 10 === 0) {
      console.log(`[snapshot-pull] fetched ${completed}/${keys.length} keys`);
    }
  }
  return rows;
}

function rowFreshness(row = {}) {
  const values = [
    row.updated_at,
    row.generated_at,
    row.payload?.updatedAt,
    row.payload?.generatedAt,
    row.payload?.updated_at
  ];
  return Math.max(...values.map((value) => {
    const stamp = Date.parse(String(value || ''));
    return Number.isFinite(stamp) ? stamp : 0;
  }));
}

function chooseLatestRows(rows = []) {
  const byKey = new Map();
  rows.forEach((row) => {
    const key = String(row?.snapshot_key || '').trim();
    if (!key) return;
    const current = byKey.get(key);
    if (!current || rowFreshness(row) >= rowFreshness(current)) byKey.set(key, row);
  });
  return byKey;
}

function chunkedPayloadText(snapshotKey, rowsByKey) {
  const row = rowsByKey.get(snapshotKey);
  const payload = row?.payload;
  if (!payload || typeof payload !== 'object' || !payload.chunked) return null;
  const count = Number(payload.chunk_count || payload.chunkCount || 0);
  if (!count) return null;
  let text = '';
  for (let index = 1; index <= count; index += 1) {
    const partKey = `${snapshotKey}__part__${String(index).padStart(4, '0')}`;
    const part = rowsByKey.get(partKey);
    const chunk = part?.payload;
    if (typeof chunk === 'string') text += chunk;
    else if (typeof chunk?.data === 'string') text += chunk.data;
    else return null;
  }
  return text;
}

function decodePayload(snapshotKey, rowsByKey) {
  const row = rowsByKey.get(snapshotKey);
  if (!row) return null;
  const rawText = chunkedPayloadText(snapshotKey, rowsByKey);
  if (rawText !== null) return JSON.parse(rawText);
  return row.payload ?? null;
}

async function pullSnapshots(options) {
  const baseRows = await requestRows(options, options.snapshots);
  const chunkKeys = baseRows.flatMap((row) => {
    const payload = row?.payload;
    if (!payload || typeof payload !== 'object' || !payload.chunked) return [];
    return snapshotPartKeys(row.snapshot_key, payload.chunk_count || payload.chunkCount);
  });
  const partRows = chunkKeys.length ? await requestRows(options, chunkKeys, options.partBatchSize) : [];
  const rowsByKey = chooseLatestRows([...baseRows, ...partRows]);

  fs.mkdirSync(options.outputDir, { recursive: true });
  const written = [];
  const missing = [];
  options.snapshots.forEach((snapshotKey) => {
    const payload = decodePayload(snapshotKey, rowsByKey);
    if (payload == null) {
      console.warn(`[snapshot-pull] ${snapshotKey}: not found`);
      missing.push(snapshotKey);
      return;
    }
    const outputPath = path.join(options.outputDir, `${snapshotKey}.json`);
    const rawText = chunkedPayloadText(snapshotKey, rowsByKey);
    fs.writeFileSync(outputPath, rawText !== null ? JSON.stringify(payload, null, 2) : `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    written.push(outputPath);
    console.log(`[snapshot-pull] ${snapshotKey}: ${outputPath}`);
  });
  if (options.strict && missing.length) {
    throw new Error(`Supabase snapshot pull is missing required keys: ${missing.join(', ')}`);
  }
  return written;
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const written = await pullSnapshots(options);
  console.log(JSON.stringify({ ok: true, written }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  resolveOptions,
  snapshotKeyFromPath,
  snapshotsFromInventory
};
