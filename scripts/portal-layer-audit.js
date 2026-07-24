#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const next = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined && next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function dateKey(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function getPathValue(object, dottedPath) {
  if (!object || !dottedPath) return undefined;
  return String(dottedPath)
    .split('.')
    .reduce((current, key) => (current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined), object);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stableSize(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function countRows(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const candidates = [
    payload.rows,
    payload.items,
    payload.cards,
    payload.daily,
    payload.points,
    payload.skus,
    payload.data,
    payload.layers,
    payload.platforms && Object.values(payload.platforms).flatMap((value) => (Array.isArray(value) ? value : []))
  ];
  return Math.max(0, ...candidates.map(stableSize));
}

function resolveOptions(args) {
  const root = process.cwd();
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    deployDir: args['deploy-dir'] ? path.resolve(args['deploy-dir']) : '',
    manifestPath: path.resolve(args.manifest || path.join(root, 'scripts', 'portal-truth-manifest.json')),
    expectedDate: dateKey(args['expected-date']) || dateDaysAgo(1),
    mirrorLocalFallback: Boolean(args['mirror-local-fallback'])
  };
}

function normalizeLayers(manifest) {
  if (Array.isArray(manifest?.layers)) return manifest.layers;
  return (Array.isArray(manifest?.sources) ? manifest.sources : []).map((source) => {
    const maxAge = String(source.freshness || '').match(/^max-age-(\d+)d$/);
    return {
      name: source.key,
      file: source.file,
      publish: source.snapshot !== false,
      required: Boolean(source.required),
      freshnessPolicy: source.freshness === 'daily' || source.freshness === 'daily-build'
        ? 'daily'
        : (maxAge ? 'maxAge' : 'none'),
      maxAgeDays: maxAge ? Number(maxAge[1]) : undefined,
      sourceFreshness: source.freshness || 'none',
      freshnessPaths: source.datePaths || []
    };
  });
}

function pickFreshness(payload, layer, stats) {
  const paths = Array.isArray(layer.freshnessPaths) ? layer.freshnessPaths : [];
  for (const freshnessPath of paths) {
    const value = getPathValue(payload, freshnessPath);
    const key = dateKey(value);
    if (key) {
      return { date: key, source: freshnessPath, value };
    }
  }
  if (stats?.mtime) {
    return { date: dateKey(stats.mtime.toISOString()), source: 'fileMtime', value: stats.mtime.toISOString() };
  }
  return { date: '', source: '', value: '' };
}

function inspectLayer(layer, options) {
  const sourceFile = layer.sourceFile || layer.file || `${layer.name}.json`;
  const deployFile = layer.file || sourceFile;
  const inputSourcePath = path.join(options.inputDir, sourceFile);
  const baseSourcePath = path.join(options.baseDataDir, sourceFile);
  const sourcePath = fs.existsSync(inputSourcePath) ? inputSourcePath : baseSourcePath;
  const deployPath = options.deployDir ? path.join(options.deployDir, 'data', deployFile) : '';
  const result = {
    name: layer.name,
    sourceFile,
    deployFile,
    required: Boolean(layer.required),
    publish: Boolean(layer.publish),
    freshnessPolicy: layer.freshnessPolicy || 'none',
    sourceOrigin: fs.existsSync(inputSourcePath) ? 'input' : (fs.existsSync(baseSourcePath) ? 'base-fallback' : 'missing'),
    ok: true,
    warnings: [],
    blockingReasons: []
  };

  if (!fs.existsSync(sourcePath)) {
    result.ok = !layer.required;
    result.missing = true;
    result.blockingReasons.push(`Missing source file ${sourceFile}`);
    return result;
  }

  if (
    path.resolve(options.inputDir) !== path.resolve(options.baseDataDir)
    && result.sourceOrigin === 'base-fallback'
    && layer.required
    && ['daily', 'daily-build'].includes(layer.sourceFreshness || '')
  ) {
    result.ok = false;
    result.blockingReasons.push(`Daily staging output is missing for ${sourceFile}; only the previous base snapshot is available`);
  }

  const stats = fs.statSync(sourcePath);
  result.sourceBytes = stats.size;
  result.sourceMtime = stats.mtime.toISOString();

  let payload;
  try {
    payload = readJson(sourcePath);
  } catch (error) {
    result.ok = false;
    result.blockingReasons.push(`Invalid JSON in ${sourceFile}: ${error.message}`);
    return result;
  }

  result.rowCount = countRows(payload);
  result.generatedAt = payload?.generatedAt || payload?.meta?.generatedAt || '';
  result.freshness = pickFreshness(payload, layer, stats);

  if (stats.size <= 2 && layer.required) {
    result.ok = false;
    result.blockingReasons.push(`Required layer ${layer.name} is empty`);
  }

  if (layer.required && layer.freshnessPolicy === 'daily' && result.freshness.date && result.freshness.date < options.expectedDate) {
    result.ok = false;
    result.blockingReasons.push(`Layer ${layer.name} freshness ${result.freshness.date} is older than expected ${options.expectedDate}`);
  }

  if (layer.freshnessPolicy === 'maxAge') {
    const maxAgeDays = Number(layer.maxAgeDays || 2);
    const mtimeMs = stats.mtime.getTime();
    const ageDays = (Date.now() - mtimeMs) / 86400000;
    result.ageDays = Math.round(ageDays * 100) / 100;
    result.maxAgeDays = maxAgeDays;
    if (layer.required && ageDays > maxAgeDays) {
      result.ok = false;
      result.blockingReasons.push(`Layer ${layer.name} file age ${result.ageDays}d exceeds ${maxAgeDays}d`);
    }
  }

  if (deployPath && fs.existsSync(deployPath)) {
    const deployStats = fs.statSync(deployPath);
    result.deployBytes = deployStats.size;
    result.deployMtime = deployStats.mtime.toISOString();
    result.deployMatchesSource = deployStats.size === stats.size && fs.readFileSync(deployPath).equals(fs.readFileSync(sourcePath));
  } else if (deployPath) {
    result.deployMissing = true;
  }

  result.ok = result.ok && result.blockingReasons.length === 0;
  return result;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const manifest = readJson(options.manifestPath);
  const layers = normalizeLayers(manifest).filter((layer) => layer.publish !== false);
  const inspected = layers.map((layer) => inspectLayer(layer, options));
  const blockingReasons = inspected.flatMap((layer) => layer.required ? layer.blockingReasons.map((reason) => `${layer.name}: ${reason}`) : []);
  const warnings = inspected.flatMap((layer) => layer.warnings.map((warning) => `${layer.name}: ${warning}`));
  const output = {
    generatedAt: new Date().toISOString(),
    expectedDate: options.expectedDate,
    publish: {
      allowed: blockingReasons.length === 0,
      blockingReasons
    },
    summary: {
      layerCount: inspected.length,
      requiredCount: inspected.filter((layer) => layer.required).length,
      okCount: inspected.filter((layer) => layer.ok).length,
      warningCount: warnings.length
    },
    warnings,
    layers: inspected
  };

  const outputPath = path.join(options.outputDir, 'portal_layer_freshness.json');
  writeJson(outputPath, output);
  if (options.mirrorLocalFallback) {
    writeJson(path.join(options.baseDataDir, 'portal_layer_freshness.json'), output);
  }
  console.log(JSON.stringify({
    outputPath,
    publishAllowed: output.publish.allowed,
    blockingReasons,
    warnings,
    layerCount: inspected.length
  }, null, 2));
}

main();
