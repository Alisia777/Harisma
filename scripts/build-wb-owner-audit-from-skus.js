#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = 'wb_owner_distribution_audit.json';

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
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, 'data')),
    outputFile: args['output-file'] ? path.resolve(args['output-file']) : '',
    runDate: dateKey(args['run-date'] || args.runDate || ''),
    generatedAt: String(args['generated-at'] || args.generatedAt || '').trim()
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

function readJson(filePath, fallback = null) {
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

function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.skus)) return payload.skus;
  return [];
}

function text(value) {
  return String(value || '').trim();
}

function normalizeOwner(value = '') {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[._-]+/g, ' ')
    .trim();
}

function sameOwner(left = '', right = '') {
  const a = normalizeOwner(left);
  const b = normalizeOwner(right);
  return Boolean(a && b && a === b);
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalWbOwner(sku = {}) {
  return text(
    sku.ownersByPlatform?.wb
    || sku.owner?.byPlatform?.wb
    || sku.ownerWb
    || ''
  );
}

function productOwner(sku = {}) {
  if (typeof sku.owner === 'string') return text(sku.owner);
  return text(sku.owner?.name || sku.productOwner || '');
}

function distributionOwner(sku = {}) {
  return text(sku.wbOwnerDistribution?.owner || sku.wbOwnerDistribution?.ownerWb || '');
}

function hasWbSku(sku = {}) {
  return Boolean(
    sku.flags?.hasWB
    || sku.hasWB
    || sku.wb
    || canonicalWbOwner(sku)
    || distributionOwner(sku)
  );
}

function increment(map, key) {
  const owner = text(key);
  if (!owner) return;
  map[owner] = (map[owner] || 0) + 1;
}

function auditRowFromSku(sku = {}, generatedAt = '') {
  const articleKey = text(sku.articleKey || sku.article || sku.sku);
  const ownerWb = distributionOwner(sku);
  const canonicalOwner = canonicalWbOwner(sku);
  return {
    articleKey,
    article: text(sku.article || articleKey),
    name: text(sku.name || sku.title || articleKey),
    previousOwnerWb: canonicalOwner,
    ownerWb,
    canonicalOwnerWb: canonicalOwner,
    productOwner: productOwner(sku),
    changed: Boolean(ownerWb && canonicalOwner && !sameOwner(ownerWb, canonicalOwner)),
    sourceRow: sku.wbOwnerDistribution?.sourceRow || null,
    revenue: numberOrZero(sku.planFact?.factTotalRevenue || sku.planFact?.factRevenueToDate),
    units: numberOrZero(sku.planFact?.factTotalUnits || sku.planFact?.factUnitsToDate),
    appliedAt: sku.wbOwnerDistribution?.appliedAt || generatedAt,
    sourceFile: sku.wbOwnerDistribution?.sourceFile || ''
  };
}

function buildAudit(options = resolveOptions({})) {
  const skus = rowsOf(readJson(path.join(options.inputDir, 'skus.json'), readJson(path.join(options.baseDataDir, 'skus.json'), [])));
  if (!skus.length) throw new Error('skus.json is empty or unavailable.');
  const previousAudit = readJson(path.join(options.baseDataDir, OUTPUT_FILE), readJson(path.join(options.inputDir, OUTPUT_FILE), {}));
  const generatedAt = generatedAtFor(options);
  const wbSkus = skus.filter(hasWbSku);
  const matched = [];
  const missingInDistribution = [];
  const ownerConflicts = [];
  const ownerCounts = {};
  const platformOwnerCounts = {};

  wbSkus.forEach((sku) => {
    const row = auditRowFromSku(sku, generatedAt);
    const ownerWb = row.ownerWb;
    const canonicalOwner = row.canonicalOwnerWb;
    if (ownerWb) {
      matched.push(row);
      increment(ownerCounts, ownerWb);
    } else {
      missingInDistribution.push({
        articleKey: row.articleKey,
        article: row.article,
        name: row.name,
        ownerWb: canonicalOwner,
        productOwner: row.productOwner
      });
    }
    increment(platformOwnerCounts, canonicalOwner);
    if (ownerWb && canonicalOwner && !sameOwner(ownerWb, canonicalOwner)) {
      ownerConflicts.push({
        articleKey: row.articleKey,
        article: row.article,
        canonicalOwner,
        distributionOwner: ownerWb,
        sourceFile: row.sourceFile,
        sourceRow: row.sourceRow
      });
    }
  });

  const previousMissingInPortal = Array.isArray(previousAudit?.missingInPortal)
    ? previousAudit.missingInPortal
    : [];
  const duplicates = Array.isArray(previousAudit?.duplicates) ? previousAudit.duplicates : [];

  return {
    schema: 'portal-wb-owner-distribution-audit-v1',
    generatedAt,
    source: {
      kind: 'canonical-sku-registry',
      file: 'skus.json',
      previousSourceFile: previousAudit?.source?.file || '',
      sourceRowCount: wbSkus.length,
      mappedRowCount: matched.length,
      duplicateCount: duplicates.length,
      note: 'Rebuilt from canonical skus.json fields so daily close is reproducible on CI.'
    },
    summary: {
      portalSkuCount: skus.length,
      wbSkuCount: wbSkus.length,
      matchedSkuCount: matched.length,
      updatedOwnerCount: ownerConflicts.length,
      unchangedOwnerCount: Math.max(0, matched.length - ownerConflicts.length),
      missingInPortalCount: previousMissingInPortal.length,
      missingInDistributionCount: missingInDistribution.length,
      ownerConflictCount: ownerConflicts.length,
      ownerCounts,
      platformOwnerCounts: { wb: platformOwnerCounts }
    },
    matched: matched.sort((left, right) => left.articleKey.localeCompare(right.articleKey)),
    missingInPortal: previousMissingInPortal,
    missingInDistribution: missingInDistribution.sort((left, right) => left.articleKey.localeCompare(right.articleKey)),
    ownerConflicts: ownerConflicts.sort((left, right) => left.articleKey.localeCompare(right.articleKey)),
    duplicates
  };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const payload = buildAudit(options);
  const outputPath = options.outputFile || path.join(options.outputDir, OUTPUT_FILE);
  writeJson(outputPath, payload);
  console.log(JSON.stringify({
    outputPath,
    generatedAt: payload.generatedAt,
    summary: payload.summary
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildAudit,
  resolveOptions,
  parseArgs
};
