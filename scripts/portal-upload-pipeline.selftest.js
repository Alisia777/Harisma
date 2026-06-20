#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const { runUploadPipeline } = require('./portal-upload-pipeline');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function workbook(filePath, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Not named as template');
  XLSX.writeFile(wb, filePath);
}

function workbookWithFormulaError(filePath) {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Platform', 'Article', 'Effective From', 'MIN', 'MAX'],
    ['WB', 'A-1', '2026-06-20', 100, 200]
  ]);
  ws.D2 = { t: 'e', v: 0, w: '#REF!' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Any sheet');
  XLSX.writeFile(wb, filePath);
}

function run(base, output, file, dataset, extra = {}) {
  return runUploadPipeline({
    dataset,
    inputFile: file,
    sourceAsOf: '2026-06-20',
    baseDataDir: base,
    outputDir: output,
    stagingRoot: path.join(output, '.portal-upload-staging'),
    historyRoot: path.join(output, '.portal-upload-history'),
    autoApprove: true,
    noPromote: false,
    noWrite: false,
    ...extra
  });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-upload-pipeline-'));
try {
  const base = path.join(root, 'data');
  const output = path.join(root, 'out');
  fs.mkdirSync(base, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  writeJson(path.join(base, 'min_max_registry.json'), {
    schema: 'portal-min-max-registry-v1',
    sourceAsOf: '2026-06-19',
    batchId: 'seed',
    rows: [{ platform: 'wb', articleKey: 'A-1', effectiveFrom: '2026-06-20', minPrice: 100, maxPrice: 200, status: 'verified' }]
  });
  writeJson(path.join(base, 'cost_registry.json'), {
    schema: 'portal-cost-registry-v1',
    sourceAsOf: '2026-06-19',
    batchId: 'seed',
    rows: [{ legalEntity: 'IP A', articleKey: 'A-1', effectiveFrom: '2026-06-20', cost: 50, currency: 'RUB', unit: 'piece', status: 'verified' }]
  });

  const goodMinMax = path.join(root, 'not-a-template-name.xlsx');
  workbook(goodMinMax, [
    ['Platform', 'Article', 'Effective From', 'MIN', 'MAX', 'Client MIN', 'Client MAX', 'Approved'],
    ['WB', 'A-1', '2026-06-20', 110, 220, '', '', 'yes']
  ]);
  const good1 = run(base, output, goodMinMax, 'min_max');
  assert.strictEqual(good1.report.status, 'promoted');
  const registryAfterGood = fs.readFileSync(path.join(base, 'min_max_registry.json'), 'utf8');
  const good2 = run(base, output, goodMinMax, 'min_max');
  assert.strictEqual(good2.report.status, 'promoted');
  assert.strictEqual(fs.readFileSync(path.join(base, 'min_max_registry.json'), 'utf8'), registryAfterGood);
  assert.strictEqual(good1.report.fingerprint, good2.report.fingerprint);

  const badMinMax = path.join(root, 'bad-minmax.xlsx');
  workbook(badMinMax, [
    ['Platform', 'Article', 'Effective From', 'MIN', 'MAX'],
    ['WB', 'A-1', '2026-06-20', 300, 200]
  ]);
  const beforeBad = fs.readFileSync(path.join(base, 'min_max_registry.json'), 'utf8');
  const bad = run(base, output, badMinMax, 'min_max');
  assert.strictEqual(bad.report.status, 'blocked');
  assert.ok(bad.issues.some((item) => item.rule === 'max_not_below_min'));
  assert.strictEqual(fs.readFileSync(path.join(base, 'min_max_registry.json'), 'utf8'), beforeBad);

  const resolved = run(base, output, goodMinMax, 'min_max');
  const issueStore = JSON.parse(fs.readFileSync(path.join(base, 'portal_upload_issues.json'), 'utf8'));
  assert.ok(issueStore.issues.some((item) => item.rule === 'max_not_below_min' && item.status === 'resolved'));
  assert.strictEqual(resolved.report.status, 'promoted');

  const formulaFile = path.join(root, 'formula-error.xlsx');
  workbookWithFormulaError(formulaFile);
  const formula = run(base, output, formulaFile, 'min_max');
  assert.strictEqual(formula.report.status, 'blocked');
  assert.ok(formula.issues.some((item) => item.rule === 'formula_error'));

  const costZero = path.join(root, 'cost-zero.xlsx');
  workbook(costZero, [
    ['Legal Entity', 'Article', 'Effective From', 'Cost', 'Currency', 'Unit'],
    ['IP A', 'A-1', '2026-06-20', 0, 'RUB', 'piece']
  ]);
  const badCost = run(base, output, costZero, 'cost_price');
  assert.strictEqual(badCost.report.status, 'blocked');
  assert.ok(badCost.issues.some((item) => item.rule === 'zero_cannot_overwrite_cost'));

  const warehouse = path.join(root, 'stock.xlsx');
  workbook(warehouse, [
    ['Article', 'Source As Of', 'Stock', 'In Transit', 'In Request'],
    ['A-1', '2026-06-20', 5, '', '']
  ]);
  const stock = run(base, output, warehouse, 'warehouse_stock', { noPromote: true });
  assert.strictEqual(stock.records[0].inTransit, null);
  assert.strictEqual(stock.records[0].inRequest, null);

  const lockPath = path.join(output, '.portal-upload-staging', 'min_max.promote.lock');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, 'active-batch', 'utf8');
  const beforeLocked = fs.readFileSync(path.join(base, 'min_max_registry.json'), 'utf8');
  const locked = run(base, output, goodMinMax, 'min_max');
  assert.strictEqual(locked.report.status, 'blocked');
  assert.ok(locked.issues.some((item) => item.rule === 'concurrent_promote'));
  assert.strictEqual(fs.readFileSync(path.join(base, 'min_max_registry.json'), 'utf8'), beforeLocked);
  fs.rmSync(lockPath, { force: true });

  console.log('[portal-upload-pipeline.selftest] OK');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
