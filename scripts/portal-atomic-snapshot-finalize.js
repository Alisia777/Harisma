#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_INVENTORY_PATHS = [
  'data/dashboard.json',
  'data/skus.json',
  'data/sku_registry_meta.json',
  'data/platform_trends.json',
  'data/logistics.json',
  'data/ads_summary.json',
  'data/iu_drr_summary.json',
  'data/control_auto_task_sources.json',
  'data/wb_feedbacks_summary.json',
  'data/wb_sales_funnel_report.json',
  'data/wb_substitution_traffic.json',
  'data/wb_substitution_traffic_history.json',
  'data/platform_plan.json',
  'data/prices.json',
  'data/smart_price_workbench.json',
  'data/smart_price_overlay.json',
  'data/repricer.json',
  'data/canonical_repricer.json',
  'data/portal_dashboard_metrics.json',
  'data/metric_contracts_non_iu.json',
  'data/portal_daily_source_policy.json',
  'data/source_inventory.json',
  'data/portal_runtime_wiring_reconciliation.json',
  'data/portal_feature_readiness.json',
  'data/price_workbench_support.json',
  'data/product_leaderboard.json',
  'data/product_leaderboard_history.json',
  'data/order_procurement.json',
  'data/order_procurement_wb.json',
  'data/order_procurement_ozon.json',
  'data/order_procurement_ym.json',
  'data/oos_control.json',
  'data/warehouse_stock_overlay.json',
  'data/portal_data_quality.json',
  'data/portal_data_quarantine.json',
  'data/sku_aliases.json',
  'data/sku_alias_ignore.json',
  'data/sku_alias_audit.json',
  'data/sku_matrix.json',
  'data/wb_owner_distribution_audit.json',
  'data/portal_sync_health.json'
];

const HASH_SKIP_KEYS = new Set(['activatedAt', 'checkedAt', 'generatedAt', 'runId']);

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
  const root = path.resolve(args.root || process.cwd());
  const dataDir = path.resolve(args['data-dir'] || args['base-data-dir'] || path.join(root, 'data'));
  return {
    root,
    dataDir,
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output')),
    inventoryPath: path.resolve(args.inventory || path.join(dataDir, 'runtime_snapshot_inventory.json')),
    runId: String(args['run-id'] || args.runId || '').trim(),
    noWrite: Boolean(args['no-write'])
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJsonIfExists(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function stableForHash(value) {
  if (Array.isArray(value)) return value.map(stableForHash);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !HASH_SKIP_KEYS.has(key))
      .sort()
      .map((key) => [key, stableForHash(value[key])])
  );
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function logicalPath(filePath, root) {
  const relative = path.relative(root, filePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.replace(/\\/g, '/')
    : path.basename(filePath);
}

function publicPathLabel(rawPath, root) {
  const normalized = String(rawPath || '').replace(/\//g, '\\');
  const rootWin = path.win32.resolve(String(root || process.cwd()).replace(/\//g, '\\'));
  const absolute = path.win32.resolve(normalized);
  const relative = path.win32.relative(rootWin, absolute);
  if (relative && !relative.startsWith('..') && !path.win32.isAbsolute(relative)) {
    return relative.replace(/\\/g, '/');
  }
  return path.win32.basename(normalized) || 'local_path';
}

function sanitizeString(value, options = {}) {
  const text = String(value);
  const trimmed = text.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[A-Z]:[\\/]/i.test(trimmed)) {
    return value;
  }
  if (/^[A-Z]:[\\/]/i.test(trimmed)) {
    return publicPathLabel(trimmed, options.root);
  }
  return text.replace(/(^|[\s"'([{,;=])([A-Z]:[\\/][^"'\r\n\t,;)\]}]*)/gi, (match, prefix, localPath) => (
    `${prefix}${publicPathLabel(localPath, options.root)}`
  ));
}

function sanitizePayload(value, options = {}) {
  if (typeof value === 'string') return sanitizeString(value, options);
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item, options));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitizePayload(item, options)])
  );
}

function fsyncDirectory(dirPath) {
  try {
    const fd = fs.openSync(dirPath, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync is best-effort on Windows and some CI filesystems.
  }
}

function atomicWriteBuffer(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`
  );
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeFileSync(fd, buffer);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, filePath);
    fsyncDirectory(path.dirname(filePath));
  } finally {
    if (fd !== null) fs.closeSync(fd);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // Nothing useful to do; a later cleanup can remove abandoned temp files.
    }
  }
}

function atomicWriteJson(filePath, payload) {
  atomicWriteBuffer(filePath, Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8'));
}

function safeRemoveInside(targetPath, parentPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedParent = path.resolve(parentPath);
  if (resolvedTarget === resolvedParent || !resolvedTarget.startsWith(`${resolvedParent}${path.sep}`)) {
    throw new Error(`refusing to remove path outside snapshot staging area: ${targetPath}`);
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

function inventoryPaths(root, inventoryPath) {
  const inventory = readJsonIfExists(inventoryPath, null);
  const paths = Array.isArray(inventory?.paths) ? inventory.paths : DEFAULT_INVENTORY_PATHS;
  return [...new Set(paths)]
    .map((item) => String(item || '').replace(/\\/g, '/').replace(/^\/+/, ''))
    .filter(Boolean)
    .filter((item) => item.startsWith('data/') && !item.includes('/snapshots/'));
}

function computeRunId(root, paths) {
  const entries = paths
    .filter((rel) => fs.existsSync(path.join(root, rel)))
    .map((rel) => {
      const buffer = fs.readFileSync(path.join(root, rel));
      let hashBasis = buffer;
      if (rel.endsWith('.json')) {
        const payload = readJsonIfExists(path.join(root, rel), null);
        if (payload !== null) hashBasis = Buffer.from(stableStringify(stableForHash(payload)), 'utf8');
      }
      return [rel, sha256Bytes(hashBasis)];
    });
  return `portal-${sha256Text(stableStringify(entries)).slice(0, 20)}`;
}

function buildManifest({ root, dataDir, runId, paths, artifacts, missing }) {
  const generatedAt = new Date().toISOString();
  const snapshotDir = `data/snapshots/${runId}`;
  const manifest = {
    schema: 'portal-active-snapshot-manifest-v1',
    generatedAt,
    runId,
    snapshotDir,
    manifestPath: `${snapshotDir}/manifest.json`,
    inventoryPath: logicalPath(path.join(dataDir, 'runtime_snapshot_inventory.json'), root),
    artifactCount: artifacts.length,
    missing,
    artifacts
  };
  manifest.fingerprint = sha256Text(stableStringify({
    runId,
    artifacts: artifacts.map((item) => [item.path, item.sha256, item.bytes])
  }));
  manifest.inventoryFingerprint = sha256Text(stableStringify(paths));
  return manifest;
}

function stageAndActivateSnapshot(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const dataDir = path.resolve(options.dataDir || options['data-dir'] || path.join(root, 'data'));
  const outputDir = path.resolve(options.outputDir || options['output-dir'] || path.join(root, '.portal-truth-output'));
  const inventoryPath = path.resolve(options.inventoryPath || options.inventory || path.join(dataDir, 'runtime_snapshot_inventory.json'));
  const paths = Array.isArray(options.paths) ? options.paths : inventoryPaths(root, inventoryPath);
  const runId = String(options.runId || options['run-id'] || '').trim() || computeRunId(root, paths);
  const failAfterWrite = Number.isInteger(options.failAfterWrite) ? options.failAfterWrite : null;
  const snapshotsRoot = path.join(dataDir, 'snapshots');
  const finalSnapshotDir = path.join(snapshotsRoot, runId);
  const stagingDir = path.join(snapshotsRoot, `.staging-${runId}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  const activePath = path.join(dataDir, 'active_snapshot.json');
  let durableWrites = 0;

  function beforeDurableWrite() {
    if (failAfterWrite !== null && durableWrites >= failAfterWrite) {
      throw new Error(`injected failure before durable write ${durableWrites + 1}`);
    }
  }

  function writeJsonStep(filePath, payload) {
    beforeDurableWrite();
    atomicWriteJson(filePath, payload);
    durableWrites += 1;
  }

  function writeBufferStep(filePath, buffer) {
    beforeDurableWrite();
    atomicWriteBuffer(filePath, buffer);
    durableWrites += 1;
  }

  fs.mkdirSync(snapshotsRoot, { recursive: true });
  safeRemoveInside(stagingDir, snapshotsRoot);
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    if (failAfterWrite !== null) {
      for (let index = 0; index < 12; index += 1) {
        writeJsonStep(path.join(stagingDir, `_failure_probe_${String(index).padStart(2, '0')}.json`), {
          runId,
          index
        });
      }
    }

    const artifacts = [];
    const missing = [];
    paths.forEach((rel) => {
      const sourcePath = path.join(root, rel);
      if (!fs.existsSync(sourcePath)) {
        missing.push(rel);
        return;
      }
      const buffer = fs.readFileSync(sourcePath);
      const stat = fs.statSync(sourcePath);
      writeBufferStep(path.join(stagingDir, rel), buffer);
      artifacts.push({
        path: rel,
        sha256: sha256Bytes(buffer),
        bytes: stat.size,
        runId
      });
    });

    const manifest = buildManifest({ root, dataDir, runId, paths, artifacts, missing });
    writeJsonStep(path.join(stagingDir, 'manifest.json'), manifest);

    safeRemoveInside(finalSnapshotDir, snapshotsRoot);
    beforeDurableWrite();
    fs.renameSync(stagingDir, finalSnapshotDir);
    durableWrites += 1;
    fsyncDirectory(snapshotsRoot);

    const activeManifest = {
      ...manifest,
      activatedAt: new Date().toISOString(),
      manifestPath: `data/snapshots/${runId}/manifest.json`
    };
    writeJsonStep(activePath, activeManifest);

    if (!options.noReport) {
      fs.mkdirSync(outputDir, { recursive: true });
      writeJsonStep(path.join(outputDir, 'portal_atomic_snapshot_finalization.json'), {
        schema: 'portal-atomic-snapshot-finalization-v2',
        generatedAt: activeManifest.activatedAt,
        status: missing.length ? 'blocked' : 'ok',
        publish_allowed: missing.length === 0,
        runId,
        artifactCount: artifacts.length,
        missing,
        fingerprint: activeManifest.fingerprint,
        inventoryFingerprint: activeManifest.inventoryFingerprint,
        activeManifestPath: 'data/active_snapshot.json',
        snapshotManifestPath: activeManifest.manifestPath,
        responsibility: 'packaging-only'
      });
      writeJsonStep(path.join(outputDir, 'portal_atomic_snapshot_manifest.json'), activeManifest);
    }

    return activeManifest;
  } catch (error) {
    try {
      if (fs.existsSync(stagingDir)) safeRemoveInside(stagingDir, snapshotsRoot);
    } catch {
      // Preserve the original failure; cleanup is best-effort.
    }
    throw error;
  }
}

function finalizeAtomicSnapshots(options = resolveOptions({})) {
  const resolved = { ...resolveOptions({}), ...options };
  if (resolved.noWrite) {
    const paths = inventoryPaths(resolved.root, resolved.inventoryPath);
    const runId = resolved.runId || computeRunId(resolved.root, paths);
    return buildManifest({
      root: resolved.root,
      dataDir: resolved.dataDir,
      runId,
      paths,
      artifacts: [],
      missing: []
    });
  }
  return stageAndActivateSnapshot(resolved);
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  try {
    const manifest = finalizeAtomicSnapshots(options);
    console.log(JSON.stringify({
      runId: manifest.runId,
      artifactCount: manifest.artifactCount,
      fingerprint: manifest.fingerprint,
      manifestPath: manifest.manifestPath
    }, null, 2));
  } catch (error) {
    console.error(`[atomic-finalize] fatal: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  finalizeAtomicSnapshots,
  resolveOptions,
  sanitizeString,
  sanitizePayload,
  stageAndActivateSnapshot,
  stableStringify
};
