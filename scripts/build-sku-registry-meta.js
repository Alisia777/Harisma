#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUTPUT_FILE = 'sku_registry_meta.json';

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
  const root = process.cwd();
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, 'data')),
    runDate: dateKey(args['run-date'] || ''),
    generatedAt: String(args['generated-at'] || '').trim()
  };
}

function dateKey(value) {
  const text = String(value || '');
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function generatedAtFor(options) {
  if (options.generatedAt) return options.generatedAt;
  if (options.runDate) return `${options.runDate}T00:00:00+03:00`;
  return new Date().toISOString();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function ownerNames(sku = {}) {
  const values = [];
  const add = (value) => {
    const text = typeof value === 'object' ? value?.name : value;
    const name = String(text || '').trim();
    if (name) values.push(name);
  };
  add(sku.owner);
  Object.values(sku.owner?.byPlatform || {}).forEach(add);
  Object.values(sku.ownersByPlatform || {}).forEach(add);
  return [...new Set(values)];
}

function buildMeta(options = resolveOptions({})) {
  const skusPath = path.join(options.inputDir, 'skus.json');
  const skus = readJson(skusPath);
  if (!Array.isArray(skus) || !skus.length) {
    throw new Error('skus.json must be a non-empty array.');
  }
  const activeRows = skus.filter((sku) => !/archived|inactive|deleted/i.test(String(sku.status || sku.lifecycleStatus || ''))).length;
  const ownerAssignedRows = skus.filter((sku) => ownerNames(sku).length > 0).length;
  return {
    schema: 'portal-sku-registry-meta-v1',
    generatedAt: generatedAtFor(options),
    sourceFile: 'skus.json',
    sourceSha256: sha256(skusPath),
    summary: {
      rows: skus.length,
      activeRows,
      ownerAssignedRows
    }
  };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const payload = buildMeta(options);
  const outputPath = path.join(options.outputDir, OUTPUT_FILE);
  writeJson(outputPath, payload);
  console.log(JSON.stringify({
    outputPath,
    generatedAt: payload.generatedAt,
    summary: payload.summary
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildMeta,
  resolveOptions,
  parseArgs
};
