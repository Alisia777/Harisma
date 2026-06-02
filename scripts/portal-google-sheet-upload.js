#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_BRAND = '\u0410\u043b\u0442\u0435\u044f';
const DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw';
const SNAPSHOT_TABLE = 'portal_data_snapshots';
const SNAPSHOT_SOURCE = 'google-sheets-bridge';
const SNAPSHOT_KEYS = [
  'dashboard',
  'skus',
  'platform_trends',
  'iu_plan',
  'logistics',
  'smart_price_overlay',
  'product_leaderboard',
  'product_leaderboard_history',
  'ads_summary',
  'iu_drr_summary',
  'loyalty_system',
  'wb_feedbacks_summary',
  'wb_substitution_traffic',
  'wb_substitution_traffic_history',
  'order_procurement',
  'order_procurement_wb',
  'order_procurement_ozon',
  'order_procurement_ym',
  'oos_control',
  'warehouse_stock_overlay',
  'portal_data_quality',
  'portal_data_quarantine',
  'sku_aliases',
  'sku_alias_ignore',
  'sku_alias_audit',
  'sku_matrix',
  'wb_owner_distribution_audit',
  'portal_layer_freshness',
  'portal_sync_health'
];
const OPTIONAL_SNAPSHOT_KEYS = new Set([
  'product_leaderboard_history',
  'wb_substitution_traffic',
  'wb_substitution_traffic_history'
]);
const INLINE_BODY_LIMIT = 18000;
const DEFAULT_CHUNK_SIZE = 500000;
const LARGE_LOGISTICS_CHUNK_SIZE = 500000;

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function resolveOptions(args) {
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(process.cwd(), '.altea-google-sheet-sync-output')),
    brand: args.brand || process.env.ALTEA_PORTAL_BRAND || DEFAULT_BRAND,
    supabaseUrl: args['supabase-url'] || process.env.ALTEA_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    supabaseKey: args['supabase-key'] || process.env.ALTEA_SUPABASE_KEY || DEFAULT_SUPABASE_KEY,
    snapshots: args.snapshot
      ? String(args.snapshot).split(',').map((value) => value.trim()).filter(Boolean)
      : SNAPSHOT_KEYS,
    explicitSnapshots: Boolean(args.snapshot)
  };
}

function hashPayload(payload) {
  return crypto.createHash('sha256').update(typeof payload === 'string' ? payload : JSON.stringify(payload)).digest('hex');
}

function snapshotFilePath(inputDir, snapshotKey) {
  return path.join(inputDir, `${snapshotKey}.json`);
}

function readSnapshot(inputDir, snapshotKey) {
  const filePath = snapshotFilePath(inputDir, snapshotKey);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Snapshot file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function postRow(row, options) {
  const url = `${String(options.supabaseUrl).replace(/\/+$/, '')}/rest/v1/${SNAPSHOT_TABLE}?on_conflict=brand,snapshot_key`;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: options.supabaseKey,
          Authorization: `Bearer ${options.supabaseKey}`,
          Prefer: 'resolution=merge-duplicates,return=minimal',
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify([row]),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`Supabase upload failed for ${row.snapshot_key}: HTTP ${response.status} ${await response.text()}`);
      }
      return;
    } catch (error) {
      clearTimeout(timer);
      if (attempt >= 8) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

async function uploadSnapshot(snapshotKey, payload, options) {
  const generatedAt = payload?.generatedAt
    || payload?.dataFreshness?.asOfDate
    || payload?.window?.to
    || new Date().toISOString();
  const payloadHash = hashPayload(payload);
  const inlineRow = {
    brand: options.brand,
    snapshot_key: snapshotKey,
    payload,
    payload_hash: payloadHash,
    source: SNAPSHOT_SOURCE,
    generated_at: generatedAt
  };

  if (JSON.stringify([inlineRow]).length <= INLINE_BODY_LIMIT) {
    await postRow(inlineRow, options);
    console.log(`[upload] ${snapshotKey}: inline`);
    return payloadHash;
  }

  const payloadText = JSON.stringify(payload);
  const chunkSize = snapshotKey === 'logistics' ? LARGE_LOGISTICS_CHUNK_SIZE : DEFAULT_CHUNK_SIZE;
  const chunks = [];
  for (let index = 0; index < payloadText.length; index += chunkSize) {
    chunks.push(payloadText.slice(index, index + chunkSize));
  }

  await postRow({
    brand: options.brand,
    snapshot_key: snapshotKey,
    payload: {
      chunked: true,
      encoding: 'utf8-json',
      chunk_count: chunks.length,
      generatedAt,
      payload_hash: payloadHash
    },
    payload_hash: payloadHash,
    source: SNAPSHOT_SOURCE,
    generated_at: generatedAt
  }, options);

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    await postRow({
      brand: options.brand,
      snapshot_key: `${snapshotKey}__part__${String(index + 1).padStart(4, '0')}`,
      payload: { data: chunk },
      payload_hash: hashPayload(chunk),
      source: SNAPSHOT_SOURCE,
      generated_at: generatedAt
    }, options);
    if ((index + 1) % 10 === 0 || index + 1 === chunks.length) {
      console.log(`[upload] ${snapshotKey}: ${index + 1}/${chunks.length}`);
    }
  }
  return payloadHash;
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const uploaded = {};
  const skipped = [];
  for (const snapshotKey of options.snapshots) {
    const filePath = snapshotFilePath(options.inputDir, snapshotKey);
    if (!fs.existsSync(filePath) && !options.explicitSnapshots && OPTIONAL_SNAPSHOT_KEYS.has(snapshotKey)) {
      skipped.push(snapshotKey);
      console.warn(`[upload] ${snapshotKey}: skipped missing optional file ${filePath}`);
      continue;
    }
    const payload = readSnapshot(options.inputDir, snapshotKey);
    uploaded[snapshotKey] = await uploadSnapshot(snapshotKey, payload, options);
  }
  console.log(JSON.stringify({ uploaded, skipped }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
