#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA = 'portal-unified-daily-intake-v1';
const DEFAULT_MANIFEST = path.join(__dirname, 'portal-truth-manifest.json');
const DEFAULT_INVENTORY = path.join(__dirname, '..', 'data', 'runtime_snapshot_inventory.json');
const VIEW_FILES = ['index.html', 'live-index.html', path.join('docs', 'index.html')];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const equalIndex = token.indexOf('=');
    const key = token.slice(2, equalIndex >= 0 ? equalIndex : undefined);
    if (equalIndex >= 0) {
      args[key] = token.slice(equalIndex + 1);
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

function dateKey(value) {
  const match = String(value ?? '').match(/\d{4}-\d{2}(?:-\d{2})?/);
  if (!match) return '';
  return match[0].length === 7 ? `${match[0]}-01` : match[0];
}

function timezoneDate(offsetDays = 0, now = new Date(), timeZone = 'Europe/Moscow') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const utc = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  utc.setUTCDate(utc.getUTCDate() + offsetDays);
  return utc.toISOString().slice(0, 10);
}

function buildTimestampDate(value, timeZone = 'Europe/Moscow') {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/[T ]\d{2}:\d{2}/.test(raw)) return dateKey(raw);
  const stamp = Date.parse(raw);
  if (!Number.isFinite(stamp)) return dateKey(raw);
  return timezoneDate(0, new Date(stamp), timeZone);
}

function dayDistance(left, right) {
  const a = Date.parse(`${dateKey(left)}T00:00:00Z`);
  const b = Date.parse(`${dateKey(right)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((a - b) / 86400000);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readJsonIfExists(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return readJson(filePath);
  } catch {
    return fallback;
  }
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveOptions(args = {}) {
  const root = path.resolve(args.root || process.cwd());
  const runDate = dateKey(args['run-date']) || timezoneDate(0);
  const expectedDate = dateKey(args['expected-date']) || timezoneDate(-1);
  const dataDir = path.resolve(args['data-dir'] || path.join(root, 'data'));
  return {
    root,
    dataDir,
    baseDataDir: path.resolve(args['base-data-dir'] || dataDir),
    outputDir: path.resolve(args['output-dir'] || path.join(root, 'data')),
    manifestPath: path.resolve(args.manifest || path.join(root, 'scripts', 'portal-truth-manifest.json')),
    inventoryPath: path.resolve(args.inventory || path.join(root, 'data', 'runtime_snapshot_inventory.json')),
    expectedDate,
    runDate,
    contractOnly: Boolean(args['contract-only']),
    noFail: Boolean(args['no-fail']),
    noWrite: Boolean(args['no-write']),
    now: args.now ? new Date(args.now) : new Date()
  };
}

function collectDates(value, output = []) {
  if (value === null || value === undefined) return output;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = dateKey(value);
    if (parsed) output.push(parsed);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectDates(item, output));
    return output;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      const parsedKey = dateKey(key);
      if (parsedKey) output.push(parsedKey);
    });
  }
  return output;
}

function valuesAtPath(value, dottedPath) {
  const parts = String(dottedPath || '').split('.').filter(Boolean);
  function visit(current, index) {
    if (index >= parts.length) return [current];
    if (Array.isArray(current)) return current.flatMap((item) => visit(item, index));
    if (!current || typeof current !== 'object') return [];
    const key = parts[index];
    if (!Object.prototype.hasOwnProperty.call(current, key)) return [];
    return visit(current[key], index + 1);
  }
  return visit(value, 0);
}

function pickFreshness(payload, paths = []) {
  for (const dottedPath of paths) {
    const dates = valuesAtPath(payload, dottedPath)
      .flatMap((value) => collectDates(value))
      .filter(Boolean)
      .sort();
    if (dates.length) {
      return { date: dates[dates.length - 1], path: dottedPath };
    }
  }
  return { date: '', path: '' };
}

function countRows(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== 'object') return payload === null || payload === undefined ? 0 : 1;
  const candidates = [
    payload.rows,
    payload.items,
    payload.cards,
    payload.daily,
    payload.skus,
    payload.aliases,
    payload.ignored,
    payload.events,
    payload.groups,
    payload.articles,
    payload.platforms
  ];
  const sizes = candidates.map((value) => {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return 0;
  });
  return Math.max(1, ...sizes);
}

function discoverViews(root) {
  const locations = {};
  for (const relative of VIEW_FILES) {
    const filePath = path.join(root, relative);
    if (!fs.existsSync(filePath)) continue;
    const source = fs.readFileSync(filePath, 'utf8');
    for (const match of source.matchAll(/\bid=["']view-([^"']+)["']/g)) {
      const view = String(match[1] || '').trim();
      if (!view) continue;
      if (!locations[view]) locations[view] = [];
      locations[view].push(relative.replace(/\\/g, '/'));
    }
  }
  return Object.fromEntries(
    Object.entries(locations)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([view, files]) => [view, [...new Set(files)]])
  );
}

function inspectContract(options, manifest, inventory) {
  const blockingReasons = [];
  const warnings = [];
  const sources = Array.isArray(manifest.sources) ? manifest.sources : [];
  const views = manifest.views && typeof manifest.views === 'object' ? manifest.views : {};
  const sourceByKey = new Map();
  const sourceFiles = new Map();
  const inventoryPaths = new Set(Array.isArray(inventory?.paths) ? inventory.paths : []);

  for (const source of sources) {
    const key = String(source?.key || '').trim();
    const file = String(source?.file || '').trim();
    if (!key) {
      blockingReasons.push('Source registry contains an entry without key.');
      continue;
    }
    if (sourceByKey.has(key)) blockingReasons.push(`Source key is duplicated: ${key}.`);
    sourceByKey.set(key, source);
    if (!file) {
      blockingReasons.push(`Source ${key} has no file.`);
      continue;
    }
    if (sourceFiles.has(file)) warnings.push(`Source file ${file} is registered by both ${sourceFiles.get(file)} and ${key}.`);
    sourceFiles.set(file, key);
    if (!String(source.repairStep || '').trim()) {
      blockingReasons.push(`Source ${key} has no repairStep/update owner.`);
    }
    if (source.snapshot !== false && !inventoryPaths.has(`data/${file}`)) {
      blockingReasons.push(`Source ${key} (${file}) is absent from runtime_snapshot_inventory.json.`);
    }
  }

  const discovered = discoverViews(options.root);
  for (const view of Object.keys(discovered)) {
    if (!views[view]) blockingReasons.push(`Portal view ${view} is not registered in portal-truth-manifest.json.`);
  }
  for (const [view, contract] of Object.entries(views)) {
    if (!discovered[view]) warnings.push(`Registered view ${view} is not present in index/live/docs HTML.`);
    const updateMode = String(contract?.updateMode || '').trim();
    if (!['daily-batch', 'hybrid', 'operational'].includes(updateMode)) {
      blockingReasons.push(`View ${view} has invalid or missing updateMode.`);
    }
    const dependencies = Array.isArray(contract?.sources) ? contract.sources : [];
    if (updateMode !== 'operational' && !dependencies.length) {
      blockingReasons.push(`Batch view ${view} has no registered sources.`);
    }
    dependencies.forEach((sourceKey) => {
      if (!sourceByKey.has(sourceKey)) {
        blockingReasons.push(`View ${view} references unknown source ${sourceKey}.`);
      }
    });
  }

  if (!inventoryPaths.has('data/portal_daily_intake.json')) {
    blockingReasons.push('Unified daily intake receipt is absent from runtime_snapshot_inventory.json.');
  }

  return {
    ok: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    discoveredViews: discovered,
    registeredViewCount: Object.keys(views).length,
    registeredSourceCount: sources.length,
    inventoryPathCount: inventoryPaths.size
  };
}

function sourceBuildDate(source, payload, options, sourceDir) {
  if (source.key === 'sku_registry') {
    const meta = readJsonIfExists(path.join(sourceDir || options.dataDir, 'sku_registry_meta.json'), {});
    return buildTimestampDate(meta?.generatedAt);
  }
  return buildTimestampDate(payload?.generatedAt || payload?.meta?.generatedAt || payload?.updatedAt);
}

function inspectSource(source, options) {
  const primaryPath = path.join(options.dataDir, source.file);
  const fallbackPath = path.join(options.baseDataDir || options.dataDir, source.file);
  const filePath = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;
  const result = {
    key: source.key,
    file: source.file,
    kind: source.kind || '',
    required: Boolean(source.required),
    freshnessPolicy: source.freshness || 'none',
    repairStep: source.repairStep || '',
    status: 'ok',
    exists: fs.existsSync(filePath),
    origin: fs.existsSync(primaryPath) ? 'daily-input' : (fs.existsSync(fallbackPath) ? 'base-fallback' : 'missing'),
    rows: 0,
    bytes: 0,
    sha256: '',
    freshnessDate: '',
    freshnessPath: '',
    buildDate: '',
    blockingReasons: [],
    warnings: []
  };
  if (!result.exists) {
    const message = `${source.key}: missing ${source.file}; run ${source.repairStep || 'the registered repair step'}.`;
    if (source.required) result.blockingReasons.push(message);
    else result.warnings.push(message);
    result.status = source.required ? 'blocked' : 'warning';
    return result;
  }

  try {
    const stats = fs.statSync(filePath);
    const payload = readJson(filePath);
    const freshness = pickFreshness(payload, source.datePaths || []);
    result.bytes = stats.size;
    result.sha256 = sha256(filePath);
    result.rows = countRows(payload);
    result.freshnessDate = freshness.date;
    result.freshnessPath = freshness.path;
    result.buildDate = sourceBuildDate(source, payload, options, path.dirname(filePath));

    if (source.required && result.rows <= 0) {
      result.blockingReasons.push(`${source.key}: required payload is empty.`);
    }

    const policy = String(source.freshness || 'none');
    const stagedRun = path.resolve(options.dataDir) !== path.resolve(options.baseDataDir || options.dataDir);
    if (
      stagedRun
      && result.origin === 'base-fallback'
      && source.required
      && ['daily', 'daily-build'].includes(policy)
    ) {
      result.blockingReasons.push(`${source.key}: daily staging output is missing; only the previous base snapshot is available.`);
    }
    if (policy === 'daily') {
      if (!result.freshnessDate || result.freshnessDate < options.expectedDate) {
        const message = `${source.key}: data date ${result.freshnessDate || 'unknown'} is older than expected ${options.expectedDate}.`;
        if (source.required) result.blockingReasons.push(message);
        else result.warnings.push(message);
      }
    } else if (policy === 'daily-build') {
      if (!result.buildDate || result.buildDate < options.runDate) {
        const message = `${source.key}: build date ${result.buildDate || 'unknown'} is older than run date ${options.runDate}.`;
        if (source.required) result.blockingReasons.push(message);
        else result.warnings.push(message);
      }
    } else if (policy === 'monthly') {
      const expectedMonth = options.expectedDate.slice(0, 7);
      const actualMonth = result.freshnessDate.slice(0, 7);
      if (!actualMonth || actualMonth < expectedMonth) {
        const message = `${source.key}: plan month ${actualMonth || 'unknown'} is older than ${expectedMonth}.`;
        if (source.required) result.blockingReasons.push(message);
        else result.warnings.push(message);
      }
    } else {
      const maxAge = policy.match(/^max-age-(\d+)d$/);
      if (maxAge) {
        const ageDays = result.freshnessDate ? dayDistance(options.runDate, result.freshnessDate) : null;
        result.ageDays = ageDays;
        if (ageDays === null || ageDays > Number(maxAge[1])) {
          const message = `${source.key}: snapshot age ${ageDays === null ? 'unknown' : ageDays} exceeds ${maxAge[1]} days.`;
          if (source.required) result.blockingReasons.push(message);
          else result.warnings.push(message);
        }
      }
    }
  } catch (error) {
    const message = `${source.key}: cannot read ${source.file}: ${error.message}`;
    if (source.required) result.blockingReasons.push(message);
    else result.warnings.push(message);
  }
  result.status = result.blockingReasons.length ? 'blocked' : (result.warnings.length ? 'warning' : 'ok');
  return result;
}

function buildViewStatuses(manifest, sourceResults) {
  const byKey = new Map(sourceResults.map((source) => [source.key, source]));
  return Object.entries(manifest.views || {}).map(([key, contract]) => {
    const sourceKeys = Array.isArray(contract.sources) ? contract.sources : [];
    const dependencies = sourceKeys.map((sourceKey) => byKey.get(sourceKey)).filter(Boolean);
    const blockingSources = dependencies.filter((source) => source.status === 'blocked');
    const warningSources = dependencies.filter((source) => source.status === 'warning');
    const critical = Boolean(contract.critical);
    const updateMode = contract.updateMode || 'daily-batch';
    const status = blockingSources.length && critical
      ? 'blocked'
      : (blockingSources.length || warningSources.length ? 'warning' : (updateMode === 'operational' ? 'operational' : 'ok'));
    return {
      key,
      critical,
      updateMode,
      status,
      sourceCount: sourceKeys.length,
      blockingSources: blockingSources.map((source) => source.key),
      warningSources: warningSources.map((source) => source.key)
    };
  }).sort((left, right) => left.key.localeCompare(right.key));
}

function buildReceipt(options) {
  const manifest = readJson(options.manifestPath);
  const inventory = readJson(options.inventoryPath);
  const contract = inspectContract(options, manifest, inventory);
  const sources = options.contractOnly
    ? []
    : (manifest.sources || []).map((source) => inspectSource(source, options));
  const views = options.contractOnly ? [] : buildViewStatuses(manifest, sources);
  const blockingReasons = [
    ...contract.blockingReasons,
    ...sources.flatMap((source) => source.blockingReasons),
    ...views
      .filter((view) => view.status === 'blocked')
      .map((view) => `View ${view.key} is blocked by: ${view.blockingSources.join(', ')}.`)
  ];
  const warnings = [
    ...contract.warnings,
    ...sources.flatMap((source) => source.warnings),
    ...views
      .filter((view) => view.status === 'warning')
      .map((view) => `View ${view.key} has warnings in: ${[...view.blockingSources, ...view.warningSources].join(', ')}.`)
  ];
  const uniqueBlocking = [...new Set(blockingReasons)];
  const uniqueWarnings = [...new Set(warnings)];
  const allowed = uniqueBlocking.length === 0;
  const status = allowed ? (uniqueWarnings.length ? 'warning' : 'ok') : 'blocked';
  return {
    schema: SCHEMA,
    generatedAt: options.now.toISOString(),
    expectedDate: options.expectedDate,
    runDate: options.runDate,
    status,
    publish: {
      allowed,
      blockingReasons: uniqueBlocking,
      warnings: uniqueWarnings
    },
    summary: {
      registeredViews: contract.registeredViewCount,
      discoveredViews: Object.keys(contract.discoveredViews).length,
      registeredSources: contract.registeredSourceCount,
      checkedSources: sources.length,
      blockedSources: sources.filter((source) => source.status === 'blocked').length,
      warningSources: sources.filter((source) => source.status === 'warning').length,
      blockedViews: views.filter((view) => view.status === 'blocked').length,
      warningViews: views.filter((view) => view.status === 'warning').length,
      operationalViews: views.filter((view) => view.updateMode === 'operational').length
    },
    contract: {
      ok: contract.ok,
      discoveredViews: contract.discoveredViews,
      registeredViewCount: contract.registeredViewCount,
      registeredSourceCount: contract.registeredSourceCount,
      inventoryPathCount: contract.inventoryPathCount,
      blockingReasons: contract.blockingReasons,
      warnings: contract.warnings
    },
    sources,
    views
  };
}

function run(options) {
  const receipt = buildReceipt(options);
  if (!options.noWrite) {
    const outputPath = path.join(options.outputDir, 'portal_daily_intake.json');
    atomicWriteJson(outputPath, receipt);
    if (path.resolve(options.outputDir) !== path.resolve(options.dataDir)) {
      atomicWriteJson(path.join(options.dataDir, 'portal_daily_intake.json'), receipt);
    }
  }
  return receipt;
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  try {
    const receipt = run(options);
    console.log(JSON.stringify({
      status: receipt.status,
      publishAllowed: receipt.publish.allowed,
      expectedDate: receipt.expectedDate,
      runDate: receipt.runDate,
      summary: receipt.summary,
      blockingReasons: receipt.publish.blockingReasons,
      warnings: receipt.publish.warnings
    }, null, 2));
    if (!receipt.publish.allowed && !options.noFail) process.exitCode = 1;
  } catch (error) {
    console.error(`[unified-daily-intake] fatal: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildReceipt,
  buildViewStatuses,
  discoverViews,
  inspectContract,
  inspectSource,
  resolveOptions,
  run
};
