#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

function resolveOptions(args) {
  const root = process.cwd();
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(root, 'data'));
  return {
    lastGoodDir: path.resolve(args['last-good-dir'] || path.join(baseDataDir, 'last_good')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    baseDataDir,
    mirrorLocalFallback: Boolean(args['mirror-local-fallback']),
    upload: Boolean(args.upload),
    snapshots: args.snapshot ? String(args.snapshot).split(',').map((item) => item.trim()).filter(Boolean) : []
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function snapshotNameFromFile(fileName) {
  return String(fileName || '').replace(/\.json$/i, '');
}

function copyLastGood(options) {
  const manifestPath = path.join(options.lastGoodDir, 'manifest.json');
  const manifest = readJsonIfExists(manifestPath);
  if (!manifest) throw new Error(`Last-good manifest not found: ${manifestPath}`);
  const files = (Array.isArray(manifest.copied) && manifest.copied.length
    ? manifest.copied
    : fs.readdirSync(options.lastGoodDir).filter((name) => name.endsWith('.json') && name !== 'manifest.json'))
    .filter((name) => name.endsWith('.json'));
  if (!files.length) throw new Error(`No last-good JSON snapshots in ${options.lastGoodDir}`);

  fs.mkdirSync(options.outputDir, { recursive: true });
  if (options.mirrorLocalFallback) fs.mkdirSync(options.baseDataDir, { recursive: true });

  const copied = [];
  files.forEach((fileName) => {
    const source = path.join(options.lastGoodDir, fileName);
    if (!fs.existsSync(source)) return;
    const outputTarget = path.join(options.outputDir, fileName);
    fs.copyFileSync(source, outputTarget);
    const snapshot = snapshotNameFromFile(fileName);
    copied.push(snapshot);
    if (options.mirrorLocalFallback) {
      fs.copyFileSync(source, path.join(options.baseDataDir, fileName));
    }
  });

  return { manifest, copied };
}

function uploadSnapshots(options, snapshots) {
  const selected = options.snapshots.length ? options.snapshots : snapshots;
  if (!selected.length) throw new Error('No snapshots selected for upload.');
  const scriptPath = path.join(process.cwd(), 'scripts', 'portal-google-sheet-upload.js');
  const result = spawnSync(process.execPath, [
    scriptPath,
    '--input-dir',
    options.outputDir,
    '--snapshot',
    selected.join(',')
  ], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Upload failed with exit code ${result.status}`);
  }
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const { manifest, copied } = copyLastGood(options);
  if (options.upload) uploadSnapshots(options, copied);
  console.log(JSON.stringify({
    restored: copied,
    generatedAt: manifest.generatedAt || '',
    outputDir: options.outputDir,
    mirrored: options.mirrorLocalFallback,
    uploaded: options.upload
  }, null, 2));
}

main();
