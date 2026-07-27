#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { buildCanonicalRepricer, stableStringify } = require('./build-canonical-repricer');
const { normalizeKey } = require('./smart-price-contour');

const REGISTRY_FILE = 'repricer_minmax_registry.json';
const GAPS_FILE = 'repricer_margin_minmax_gaps.json';

function parseArgs(argv = process.argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
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

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileChecksum(filePath) {
  try {
    return sha256(fs.readFileSync(filePath));
  } catch {
    return '';
  }
}

function registryRows(payload = {}) {
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload)) return payload;
  return [];
}

function recordKey(row = {}) {
  const article = normalizeKey(row.articleKey || row.article_key || row.article || '');
  const platform = String(row.platform || '').trim().toLowerCase();
  return article && platform ? `${article}|${platform}` : '';
}

function migrateRegistry(options = {}) {
  const inputDir = path.resolve(options.inputDir || path.join(process.cwd(), 'data'));
  const outputDir = path.resolve(options.outputDir || inputDir);
  const author = String(options.author || 'system-migration').trim();
  const role = String(options.role || 'data_migration').trim();
  const canonical = buildCanonicalRepricer({
    inputDir,
    outputDir,
    noWrite: true,
    noFail: true
  }).payload;
  const generatedAt = String(canonical.generatedAt || new Date().toISOString());
  const effectiveFrom = generatedAt.slice(0, 10);
  const sourceFiles = ['smart_price_workbench.json', 'price_workbench_support.json', 'skus.json'];
  const sourceChecksum = sha256(stableStringify(
    Object.fromEntries(sourceFiles.map((name) => [name, fileChecksum(path.join(inputDir, name))]))
  ));
  const batchId = `margin_minmax_migration_${sourceChecksum.slice(0, 16)}`;
  const existingPayload = readJson(path.join(inputDir, REGISTRY_FILE), { schema: 'repricer-minmax-registry-v1', rows: [] });
  const existingRows = registryRows(existingPayload);
  const existingKeys = new Set(existingRows.map(recordKey).filter(Boolean));
  const requiredRows = (canonical.rows || [])
    .filter((row) => ['wb', 'ozon'].includes(String(row.platform || '').toLowerCase()))
    .filter((row) => row?.policy?.margin_guard_required);
  const migrated = [];
  const gaps = [];

  requiredRows.forEach((row) => {
    const policy = row.policy || {};
    const articleKey = String(row.article_key || '').trim();
    const platform = String(row.platform || '').trim().toLowerCase();
    const missing = [];
    if (!(Number(policy.target_margin_pct) > 0 && Number(policy.target_margin_pct) < 1)) missing.push('min_margin');
    if (!(Number(policy.max_margin_pct) > Number(policy.target_margin_pct) && Number(policy.max_margin_pct) < 1)) missing.push('max_margin');
    if (!(Number(policy.min_max_floor) > 0)) missing.push('min');
    if (!(Number(policy.min_max_cap) > 0)) missing.push('max');
    if (missing.length) {
      gaps.push({
        articleKey,
        platform,
        lifecycle: policy.lifecycle_key || '',
        targetMarginPct: policy.target_margin_pct,
        minMarginPct: policy.target_margin_pct,
        maxMarginPct: policy.max_margin_pct,
        minPrice: policy.min_max_floor,
        maxPrice: policy.min_max_cap,
        missing,
        status: 'blocked_missing_required_policy',
        action: `Заполнить ${missing.join(', ')} и загрузить утверждённый файл маржи/MIN/MAX`
      });
      return;
    }
    const key = recordKey({ articleKey, platform });
    if (existingKeys.has(key)) return;
    const businessValues = {
      articleKey,
      platform,
      targetMarginPct: Number(policy.target_margin_pct),
      minMarginPct: Number(policy.target_margin_pct),
      maxMarginPct: Number(policy.max_margin_pct),
      minPrice: Number(policy.min_max_floor),
      maxPrice: Number(policy.min_max_cap),
      effectiveFrom
    };
    migrated.push({
      id: `minmax_${sha256(stableStringify(businessValues)).slice(0, 16)}`,
      batchId,
      ...businessValues,
      author,
      role,
      reason: 'Migration of existing explicit per-SKU margin, MIN and MAX into the canonical server registry',
      createdAt: generatedAt,
      approvalStatus: 'approved',
      approvedBy: author,
      approvedAt: generatedAt,
      sourceStore: 'server_upload',
      sourceFile: sourceFiles.join('+'),
      sourceChecksum
    });
    existingKeys.add(key);
  });

  const nextRows = [...existingRows, ...migrated]
    .sort((left, right) => stableStringify([
      left.articleKey,
      left.platform,
      left.effectiveFrom,
      left.id
    ]).localeCompare(stableStringify([
      right.articleKey,
      right.platform,
      right.effectiveFrom,
      right.id
    ])));
  const registry = {
    schema: 'repricer-minmax-registry-v1',
    generatedAt,
    rows: nextRows
  };
  const gapReport = {
    schema: 'repricer-margin-minmax-gaps-v1',
    generatedAt,
    sourceSnapshotId: canonical.snapshot_id || '',
    summary: {
      requiredRows: requiredRows.length,
      completeRows: requiredRows.length - gaps.length,
      existingRegistryRows: existingRows.length,
      migratedRows: migrated.length,
      blockedRows: gaps.length,
      missingMarginRows: gaps.filter((row) => row.missing.includes('margin')).length,
      missingMinRows: gaps.filter((row) => row.missing.includes('min')).length,
      missingMaxRows: gaps.filter((row) => row.missing.includes('max')).length
    },
    publish_allowed: gaps.length === 0,
    rows: gaps
  };

  if (!options.noWrite) {
    writeJson(path.join(outputDir, REGISTRY_FILE), registry);
    writeJson(path.join(outputDir, GAPS_FILE), gapReport);
  }
  return { registry, gapReport, migrated };
}

function main() {
  const args = parseArgs();
  const result = migrateRegistry({
    inputDir: args['input-dir'],
    outputDir: args['output-dir'],
    author: args.author,
    role: args.role,
    noWrite: Boolean(args['no-write'])
  });
  console.log(JSON.stringify({
    status: result.gapReport.summary.blockedRows ? 'needs_input' : 'ok',
    ...result.gapReport.summary
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  migrateRegistry,
  parseArgs,
  recordKey
};
