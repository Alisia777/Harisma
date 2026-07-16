#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { canonicalOwnerForPlatform } = require('./owner-normalization');

const MARIA = '\u041c\u0430\u0440\u0438\u044f \u0412\u0430\u0441\u0438\u043b\u044c\u0435\u0432\u0430';
const MAXIM = '\u041c\u0430\u043a\u0441\u0438\u043c \u041b\u0430\u043f\u044b\u0433\u0438\u043d';
const ACTIVE_STATUSES = new Set([
  '\u0430\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439',
  '\u043d\u043e\u0432\u0438\u043d\u043a\u0430',
  '\u043f\u0435\u0440\u0435\u0437\u0430\u043f\u0443\u0441\u043a'
]);
const DISABLED_STATUS_PARTS = [
  '\u0432\u044b\u0432\u043e\u0434',
  '\u0430\u0440\u0445\u0438\u0432',
  'archive',
  'disabled',
  'inactive',
  'stop'
];
const PLATFORM_LAYER_FILES = [
  'smart_price_workbench.json',
  'smart_price_overlay.json',
  'price_workbench_support.json',
  'price_workbench_support.compact.json',
  'price_workbench_support.dashboard-compact.json',
  'price_workbench_support.minified.full.json',
  'prices.json'
];

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

function dateKey(value = '') {
  const match = String(value || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function resolveOptions(args = {}) {
  const root = process.cwd();
  const runDate = dateKey(args['run-date'] || args.runDate) || new Date().toISOString().slice(0, 10);
  const input = String(args.input || args['input-file'] || args.workbook || args['input-xlsx'] || '').trim();
  return {
    inputPath: input ? path.resolve(input) : '',
    dataDir: path.resolve(args['data-dir'] || path.join(root, 'data')),
    reportPath: path.resolve(args.report || path.join(root, 'exports', `wb_owner_status_import_${runDate}.json`)),
    runDate,
    generatedAt: String(args['generated-at'] || args.generatedAt || `${runDate}T00:00:00+03:00`).trim(),
    dryRun: Boolean(args['dry-run']),
    allowMissing: Boolean(args['allow-missing'])
  };
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, payload, compact = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = compact
    ? JSON.stringify(payload)
    : `${JSON.stringify(payload, null, 2).replace(/\n/g, '\r\n')}\r\n`;
  fs.writeFileSync(filePath, body, 'utf8');
}

function normalizeText(value = '') {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStatus(value = '') {
  return normalizeText(value).toLowerCase().replace(/\u0451/g, '\u0435');
}

function normalizeArticle(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_');
}

function compactArticle(value = '') {
  return normalizeArticle(value).replace(/[_-]+/g, '');
}

function isMatrixActive(status = '') {
  const normalized = normalizeStatus(status);
  return !DISABLED_STATUS_PARTS.some((part) => normalized.includes(part));
}

function isActiveStatus(status = '') {
  return ACTIVE_STATUSES.has(normalizeStatus(status));
}

function canonicalWbOwner(value = '') {
  const owner = canonicalOwnerForPlatform(value, 'wb');
  if (!owner) return '';
  if (![MARIA, MAXIM].includes(owner)) {
    throw new Error(`Unsupported WB owner: ${owner}`);
  }
  return owner;
}

function workbookRows(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Workbook not found: ${inputPath || '(empty path)'}`);
  }
  const workbook = XLSX.readFile(inputPath, { cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => {
    const preview = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', range: 0, blankrows: false })[0] || [];
    const cells = preview.map(normalizeStatus);
    return cells.includes('\u0430\u0440\u0442\u0438\u043a\u0443\u043b') && cells.includes('\u0441\u0442\u0430\u0442\u0443\u0441');
  });
  if (!sheetName) throw new Error('WB owner/status sheet was not found.');

  const values = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    blankrows: false
  });
  const header = values[0] || [];
  const normalizedHeader = header.map(normalizeStatus);
  const articleIndex = normalizedHeader.indexOf('\u0430\u0440\u0442\u0438\u043a\u0443\u043b');
  const wbArticleIndex = normalizedHeader.indexOf('\u0430\u0440\u0442\u0438\u043a\u0443\u043b \u0432\u0431');
  const barcodeIndex = normalizedHeader.indexOf('\u0448\u043a');
  const statusIndex = normalizedHeader.indexOf('\u0441\u0442\u0430\u0442\u0443\u0441');
  const ownerIndex = statusIndex - 1;
  if (articleIndex < 0 || statusIndex < 1 || ownerIndex < 0) {
    throw new Error('WB workbook columns do not match the expected layout.');
  }

  const rows = values.slice(1).map((row, index) => {
    const article = normalizeText(row[articleIndex]);
    if (!article) return null;
    return {
      sourceRow: index + 2,
      article,
      wbArticle: normalizeText(row[wbArticleIndex]),
      barcode: normalizeText(row[barcodeIndex]),
      owner: canonicalWbOwner(row[ownerIndex]),
      status: normalizeText(row[statusIndex])
    };
  }).filter(Boolean);

  const byArticle = new Map();
  rows.forEach((row) => {
    const key = normalizeArticle(row.article);
    const current = byArticle.get(key);
    if (current && (current.owner !== row.owner || current.status !== row.status)) {
      throw new Error(`Conflicting workbook rows for ${row.article}.`);
    }
    if (!current) byArticle.set(key, row);
  });
  return {
    sheetName,
    rows: Array.from(byArticle.values())
  };
}

function skuLookupValues(sku = {}) {
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.wb?.articleKey,
    sku.wb?.article
  ];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => values.push(alias?.value || alias));
  }
  if (Array.isArray(sku.platformAliases?.wb)) values.push(...sku.platformAliases.wb);
  return values;
}

function buildSkuLookup(skus = []) {
  const exact = new Map();
  const compact = new Map();
  skus.forEach((sku) => {
    skuLookupValues(sku).forEach((value) => {
      const exactKey = normalizeArticle(value);
      const compactKey = compactArticle(value);
      if (exactKey && !exact.has(exactKey)) exact.set(exactKey, sku);
      if (!compactKey) return;
      if (!compact.has(compactKey)) compact.set(compactKey, []);
      const candidates = compact.get(compactKey);
      if (!candidates.includes(sku)) candidates.push(sku);
    });
  });
  return { exact, compact };
}

function findSku(lookup, article = '') {
  const exactKey = normalizeArticle(article);
  const direct = lookup.exact.get(exactKey);
  if (direct) return direct;
  const candidates = lookup.compact.get(compactArticle(article)) || [];
  return candidates.length === 1 ? candidates[0] : null;
}

function buildSourceLookup(rows = []) {
  const exact = new Map();
  const compact = new Map();
  rows.forEach((row) => {
    const exactKey = normalizeArticle(row.article);
    const compactKey = compactArticle(row.article);
    if (exactKey) exact.set(exactKey, row);
    if (!compactKey) return;
    if (!compact.has(compactKey)) compact.set(compactKey, []);
    const candidates = compact.get(compactKey);
    if (!candidates.includes(row)) candidates.push(row);
  });
  return { exact, compact };
}

function wbOwnerFromSku(sku = {}) {
  return normalizeText(
    sku.ownersByPlatform?.wb
    || sku.owner?.byPlatform?.wb
    || sku.wb?.owner
    || ''
  );
}

function wbStatusFromSku(sku = {}) {
  return normalizeText(
    sku.platformMatrix?.wb?.status
    || sku.wb?.status
    || sku.status
    || sku.registryStatus
    || ''
  );
}

function setStatusIfPresent(row, field, status) {
  if (Object.prototype.hasOwnProperty.call(row, field)) row[field] = status;
}

function applySkuRow(sku, sourceRow, sourceNote, generatedAt, sourceFile) {
  const previousOwner = wbOwnerFromSku(sku);
  const previousWbStatus = wbStatusFromSku(sku);
  const previousGlobalStatus = normalizeText(sku.status || sku.registryStatus || '');

  sku.owner = sku.owner && typeof sku.owner === 'object' ? sku.owner : { name: normalizeText(sku.owner) };
  sku.owner.byPlatform = sku.owner.byPlatform && typeof sku.owner.byPlatform === 'object' ? sku.owner.byPlatform : {};
  sku.ownersByPlatform = sku.ownersByPlatform && typeof sku.ownersByPlatform === 'object' ? sku.ownersByPlatform : {};
  sku.owner.byPlatform.wb = sourceRow.owner;
  sku.ownersByPlatform.wb = sourceRow.owner;
  sku.owner.name = sourceRow.owner;
  sku.owner.source = sourceNote;
  sku.owner.registryStatus = sourceRow.status || sku.owner.registryStatus || '';

  if (!previousGlobalStatus || normalizeStatus(previousGlobalStatus) === normalizeStatus(previousWbStatus)) {
    sku.status = sourceRow.status || previousGlobalStatus;
    sku.registryStatus = sourceRow.status || sku.registryStatus || sku.status;
    sku.sheetStatus = sourceRow.status || sku.sheetStatus || sku.status;
    sku.matrixActive = isMatrixActive(sourceRow.status);
  }

  sku.wb = sku.wb && typeof sku.wb === 'object' ? sku.wb : {};
  sku.wb.owner = sourceRow.owner;
  sku.wb.status = sourceRow.status || sku.wb.status || '';
  sku.wb.matrixSource = sourceNote;
  sku.wb.matrixImportedAt = generatedAt;

  sku.platformMatrix = sku.platformMatrix && typeof sku.platformMatrix === 'object' ? sku.platformMatrix : {};
  sku.platformMatrix.wb = {
    ...(sku.platformMatrix.wb || {}),
    platform: 'wb',
    label: 'WB',
    status: sourceRow.status,
    owner: sourceRow.owner,
    sourceRows: [sourceRow.sourceRow],
    matrixActive: isMatrixActive(sourceRow.status),
    matrixSource: sourceNote,
    matrixImportedAt: generatedAt
  };
  sku.wbOwnerDistribution = {
    owner: sourceRow.owner,
    ownerWb: sourceRow.owner,
    previousOwnerWb: previousOwner,
    sourceRow: sourceRow.sourceRow,
    sourceFile,
    appliedAt: generatedAt
  };

  return {
    articleKey: normalizeText(sku.articleKey || sku.article || sourceRow.article),
    previousOwner,
    owner: sourceRow.owner,
    previousStatus: previousWbStatus,
    status: sourceRow.status,
    active: isActiveStatus(sourceRow.status),
    ownerChanged: previousOwner !== sourceRow.owner,
    statusChanged: previousWbStatus !== sourceRow.status
  };
}

function sourceRowForArticle(sourceLookup, value = '') {
  const exact = sourceLookup.exact.get(normalizeArticle(value));
  if (exact) return exact;
  const candidates = sourceLookup.compact.get(compactArticle(value)) || [];
  return candidates.length === 1 ? candidates[0] : null;
}

function updateLayerRow(row, sourceRow, sourceNote, includeStatus = true) {
  if (!row || typeof row !== 'object' || !sourceRow) return false;
  row.owner = sourceRow.owner;
  row.ownerSource = sourceNote;
  if (row.ownerByPlatform && typeof row.ownerByPlatform === 'object') row.ownerByPlatform.wb = sourceRow.owner;
  if (row.ownersByPlatform && typeof row.ownersByPlatform === 'object') row.ownersByPlatform.wb = sourceRow.owner;
  if (includeStatus) {
    setStatusIfPresent(row, 'status', sourceRow.status);
    setStatusIfPresent(row, 'productStatus', sourceRow.status);
    setStatusIfPresent(row, 'repricerStatus', sourceRow.status);
  }
  return true;
}

function rowsFromBucket(bucketRows) {
  if (Array.isArray(bucketRows)) return bucketRows;
  if (bucketRows && typeof bucketRows === 'object') return Object.values(bucketRows);
  return [];
}

function patchWbPlatformLayer(payload, sourceLookup, sourceNote) {
  const rows = rowsFromBucket(payload?.platforms?.wb?.rows);
  let updated = 0;
  rows.forEach((row) => {
    const sourceRow = sourceRowForArticle(sourceLookup, row?.articleKey || row?.article || row?.sku);
    if (sourceRow && updateLayerRow(row, sourceRow, sourceNote)) updated += 1;
  });
  return updated;
}

function patchRepricer(payload, sourceLookup, sourceNote) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  let updated = 0;
  rows.forEach((row) => {
    const sourceRow = sourceRowForArticle(sourceLookup, row?.articleKey || row?.article || row?.sku);
    if (!sourceRow) return;
    updateLayerRow(row, sourceRow, sourceNote);
    row.ownerByPlatform = row.ownerByPlatform && typeof row.ownerByPlatform === 'object' ? row.ownerByPlatform : {};
    row.ownerByPlatform.wb = sourceRow.owner;
    if (row.wb && typeof row.wb === 'object') {
      row.wb.owner = sourceRow.owner;
      setStatusIfPresent(row.wb, 'status', sourceRow.status);
      setStatusIfPresent(row.wb, 'productStatus', sourceRow.status);
    }
    updated += 1;
  });
  return updated;
}

function patchProcurement(payload, sourceLookup, sourceNote) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  let updated = 0;
  rows.forEach((row) => {
    const sourceRow = sourceRowForArticle(sourceLookup, row?.articleKey || row?.article || row?.sku);
    if (!sourceRow) return;
    row.owner = sourceRow.owner;
    row.ownerSource = sourceNote;
    if (Object.prototype.hasOwnProperty.call(row, 'lifecycleStatus')) row.lifecycleStatus = sourceRow.status;
    updated += 1;
  });
  return updated;
}

function patchOos(payload, sourceLookup, sourceNote) {
  const collections = [
    Array.isArray(payload?.rows) ? payload.rows : [],
    Array.isArray(payload?.history?.issueStates) ? payload.history.issueStates : []
  ];
  let updated = 0;
  collections.forEach((rows) => rows.forEach((row) => {
    const platform = normalizeStatus(row?.platform || row?.platformKey);
    if (!['wb', 'wildberries'].includes(platform)) return;
    const sourceRow = sourceRowForArticle(sourceLookup, row?.articleKey || row?.article || row?.sku);
    if (!sourceRow) return;
    row.owner = sourceRow.owner;
    row.ownerSource = sourceNote;
    updated += 1;
  }));
  return updated;
}

function patchSkuMatrix(payload, sourceLookup, sourceNote) {
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  let updated = 0;
  rows.forEach((row) => {
    const sourceRow = sourceRowForArticle(sourceLookup, row?.articleKey || row?.article || row?.sku);
    if (!sourceRow) return;
    row.owner = sourceRow.owner;
    row.ownerSource = sourceNote;
    row.status = sourceRow.status || row.status;
    row.registryStatus = sourceRow.status || row.registryStatus || row.status;
    updated += 1;
  });
  return updated;
}

function patchFile(filePath, patcher, sourceLookup, sourceNote, dryRun) {
  const payload = readJson(filePath, null);
  if (!payload) return { file: path.basename(filePath), present: false, updated: 0 };
  const updated = patcher(payload, sourceLookup, sourceNote);
  if (!dryRun && updated > 0) {
    const compact = /compact|minified/.test(path.basename(filePath));
    writeJson(filePath, payload, compact);
  }
  return { file: path.basename(filePath), present: true, updated };
}

function ownerCounts(rows = []) {
  return rows.reduce((counts, row) => {
    counts[row.owner] = (counts[row.owner] || 0) + 1;
    return counts;
  }, {});
}

function runImport(options) {
  const source = workbookRows(options.inputPath);
  const sourceFile = path.basename(options.inputPath);
  const sourceNote = `wb-owner-status-workbook-${options.runDate}`;
  const sourceLookup = buildSourceLookup(source.rows);

  const skusPath = path.join(options.dataDir, 'skus.json');
  const skus = readJson(skusPath, []);
  if (!Array.isArray(skus) || !skus.length) throw new Error('data/skus.json is empty or unavailable.');
  const lookup = buildSkuLookup(skus);
  const missing = [];
  const applied = [];
  source.rows.forEach((row) => {
    const sku = findSku(lookup, row.article);
    if (!sku) {
      missing.push({ sourceRow: row.sourceRow, article: row.article, owner: row.owner, status: row.status });
      return;
    }
    applied.push(applySkuRow(sku, row, sourceNote, options.generatedAt, sourceFile));
  });
  if (missing.length && !options.allowMissing) {
    throw new Error(`Workbook rows missing in skus.json: ${missing.map((row) => row.article).join(', ')}`);
  }

  const targetStats = PLATFORM_LAYER_FILES.map((fileName) => (
    patchFile(path.join(options.dataDir, fileName), patchWbPlatformLayer, sourceLookup, sourceNote, options.dryRun)
  ));
  targetStats.push(
    patchFile(path.join(options.dataDir, 'repricer.json'), patchRepricer, sourceLookup, sourceNote, options.dryRun),
    patchFile(path.join(options.dataDir, 'order_procurement_wb.json'), patchProcurement, sourceLookup, sourceNote, options.dryRun),
    patchFile(path.join(options.dataDir, 'oos_control.json'), patchOos, sourceLookup, sourceNote, options.dryRun),
    patchFile(path.join(options.dataDir, 'sku_matrix.json'), patchSkuMatrix, sourceLookup, sourceNote, options.dryRun)
  );

  const activeRows = source.rows.filter((row) => isActiveStatus(row.status));
  const report = {
    schema: 'portal-wb-owner-status-import-v1',
    generatedAt: options.generatedAt,
    source: {
      file: sourceFile,
      sheet: source.sheetName,
      rows: source.rows.length
    },
    summary: {
      matchedRows: applied.length,
      missingRows: missing.length,
      ownerChanges: applied.filter((row) => row.ownerChanged).length,
      statusChanges: applied.filter((row) => row.statusChanged).length,
      activeRows: activeRows.length,
      ownerCounts: ownerCounts(source.rows),
      activeOwnerCounts: ownerCounts(activeRows)
    },
    ownerChanges: applied.filter((row) => row.ownerChanged),
    statusChanges: applied.filter((row) => row.statusChanged),
    missing,
    targets: targetStats
  };

  if (!options.dryRun) {
    writeJson(skusPath, skus);
    writeJson(options.reportPath, report);
  }
  return report;
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const report = runImport(options);
  console.log(JSON.stringify({
    ok: true,
    dryRun: options.dryRun,
    report: options.reportPath,
    summary: report.summary
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildSkuLookup,
  findSku,
  normalizeArticle,
  resolveOptions,
  runImport,
  workbookRows
};
