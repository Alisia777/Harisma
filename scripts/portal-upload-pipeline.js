#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const {
  parseArgs,
  readJson,
  writeJson,
  sha256File,
  sha256Text,
  stableStringify,
  dateKey,
  deterministicIso,
  normalizeKey
} = require('./portal-freshness-core');
const { normalizeHeader, aliasMap } = require('./upload-adapters/common');

const CONTRACT_FILE = path.join(__dirname, 'portal-upload-contract.json');
const ADAPTERS = {
  min_max: () => require('./upload-adapters/min-max'),
  cost_price: () => require('./upload-adapters/cost-price'),
  price_discount: () => require('./upload-adapters/price-discount'),
  warehouse_stock: () => require('./upload-adapters/warehouse-stock'),
  sku_registry: () => require('./upload-adapters/sku-registry')
};

function resolveOptions(args = parseArgs(process.argv)) {
  const root = process.cwd();
  return {
    dataset: args.dataset || '',
    inputFile: args.file ? path.resolve(args.file) : '',
    sourceAsOf: dateKey(args['source-as-of'] || args['as-of']) || '',
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output')),
    stagingRoot: path.resolve(args['staging-root'] || path.join(root, '.portal-upload-staging')),
    historyRoot: path.resolve(args['history-root'] || path.join(root, '.portal-upload-history')),
    autoApprove: Boolean(args.approve || args['auto-approve']),
    noPromote: Boolean(args['no-promote']),
    noWrite: Boolean(args['no-write'])
  };
}

function loadAdapter(dataset) {
  const factory = ADAPTERS[dataset];
  if (!factory) throw new Error(`Unknown upload dataset ${dataset || '(auto)'}`);
  return factory();
}

function adapterChoices() {
  return Object.values(ADAPTERS).map((factory) => factory());
}

function decodeCellAddress(rowIndex, colIndex) {
  return XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
}

function cellDisplayValue(cell) {
  if (!cell) return null;
  if (cell.v === undefined || cell.v === null) return null;
  return cell.v;
}

function isFormulaError(value, contract) {
  const raw = String(value ?? '').trim().toUpperCase();
  return (contract.formulaErrors || []).includes(raw);
}

function parseWorkbook(inputFile, contract) {
  const workbook = XLSX.readFile(inputFile, { cellFormula: true, cellNF: false, cellDates: true });
  const sheets = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const matrix = [];
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const address = decodeCellAddress(r, c);
        const cell = ws[address] || null;
        row.push({ address, cell, value: cellDisplayValue(cell) });
      }
      matrix.push(row);
    }
    sheets.push({ name: sheetName, matrix, contract });
  }
  return sheets;
}

function parseCsv(inputFile, contract) {
  const text = fs.readFileSync(inputFile, 'utf8').replace(/^\uFEFF/, '');
  const delimiter = text.includes('\t') ? '\t' : ';';
  const rows = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => line.split(delimiter));
  const matrix = rows.map((row, r) => row.map((value, c) => ({ address: decodeCellAddress(r, c), cell: { v: value }, value })));
  return [{ name: path.basename(inputFile), matrix, contract }];
}

function parseJsonRows(inputFile, contract) {
  const payload = readJson(inputFile);
  const rows = Array.isArray(payload) ? payload : (payload.rows || payload.items || payload.data || []);
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row || {}).forEach((key) => set.add(key));
    return set;
  }, new Set()));
  const matrix = [headers.map((header, c) => ({ address: decodeCellAddress(0, c), cell: { v: header }, value: header }))];
  rows.forEach((row, index) => {
    matrix.push(headers.map((header, c) => ({ address: decodeCellAddress(index + 1, c), cell: { v: row?.[header] }, value: row?.[header] })));
  });
  return [{ name: path.basename(inputFile), matrix, contract }];
}

function parseInput(inputFile, contract) {
  const ext = path.extname(inputFile).toLowerCase();
  if (['.xlsx', '.xlsm', '.xls', '.xlsb'].includes(ext)) return parseWorkbook(inputFile, contract);
  if (['.csv', '.tsv', '.txt'].includes(ext)) return parseCsv(inputFile, contract);
  if (ext === '.json') return parseJsonRows(inputFile, contract);
  throw new Error(`Unsupported upload file type ${ext}`);
}

function findHeader(sheet, adapters) {
  let best = null;
  const maxRows = Math.min(sheet.matrix.length, 25);
  for (let r = 0; r < maxRows; r += 1) {
    const rawHeaders = sheet.matrix[r].map((entry) => normalizeHeader(entry.value));
    for (const adapter of adapters) {
      const fieldMap = aliasMap(adapter.headerAliases);
      const fields = rawHeaders.map((header) => fieldMap.get(header)).filter(Boolean);
      const uniqueFields = Array.from(new Set(fields));
      const score = adapter.score ? adapter.score(uniqueFields) : uniqueFields.length;
      if (!best || score > best.score) {
        best = { sheet, rowIndex: r, adapter, fields, rawHeaders, score };
      }
    }
  }
  return best;
}

function rowsFromHeader(match, adapter, context, contract) {
  const fieldMap = aliasMap(adapter.headerAliases);
  const headers = match.sheet.matrix[match.rowIndex].map((entry) => fieldMap.get(normalizeHeader(entry.value)) || null);
  const rows = [];
  for (let r = match.rowIndex + 1; r < match.sheet.matrix.length; r += 1) {
    const source = match.sheet.matrix[r];
    if (!source.some((entry) => entry.value !== null && entry.value !== undefined && String(entry.value).trim() !== '')) continue;
    const row = { __sheet: match.sheet.name, __rowNumber: r + 1, __cells: {}, __rawByField: {} };
    headers.forEach((field, c) => {
      if (!field) return;
      const entry = source[c] || {};
      row[field] = entry.value === undefined ? null : entry.value;
      row.__rawByField[field] = row[field];
      row.__cells[field] = {
        address: entry.address,
        formula: entry.cell?.f || '',
        type: entry.cell?.t || '',
        rawValue: entry.cell?.v ?? null,
        displayValue: entry.value ?? null,
        formulaError: entry.cell?.t === 'e' || isFormulaError(entry.cell?.w || entry.cell?.v, contract),
        missingFormulaResult: Boolean(entry.cell?.f) && (entry.cell.v === undefined || entry.cell.v === null || entry.cell.v === '')
      };
    });
    rows.push(row);
  }
  return rows.map((row) => adapter.normalizeRow(row, context));
}

function formulaIssues(records, adapter, contract) {
  const issues = [];
  const required = new Set(adapter.requiredFields || []);
  records.forEach((record) => {
    for (const field of required) {
      const cell = record.cells?.[field];
      if (!cell) continue;
      if (cell.formulaError) {
        issues.push({
          issueId: sha256Text(`${adapter.dataset}|formula_error|${record.canonicalKey}|${field}`).slice(0, 24),
          dataset: adapter.dataset,
          file: record.sourceFile,
          sheet: record.sheet,
          row: record.rowNumber,
          column: cell.address,
          rawValue: cell.rawValue,
          rule: 'formula_error',
          severity: 'blocking',
          canonicalKey: record.canonicalKey,
          field,
          message: `Formula error in required field ${field}.`,
          suggestion: `Fix spreadsheet errors (${(contract.formulaErrors || []).join(', ')} are rejected).`,
          status: 'open',
          createdAt: record.createdAt,
          resolvedAt: null,
          resolvedByBatchId: null
        });
      }
      if (cell.missingFormulaResult) {
        issues.push({
          issueId: sha256Text(`${adapter.dataset}|formula_missing_cached_result|${record.canonicalKey}|${field}`).slice(0, 24),
          dataset: adapter.dataset,
          file: record.sourceFile,
          sheet: record.sheet,
          row: record.rowNumber,
          column: cell.address,
          rawValue: null,
          rule: 'formula_missing_cached_result',
          severity: 'blocking',
          canonicalKey: record.canonicalKey,
          field,
          message: `Formula in ${field} has no cached result.`,
          suggestion: 'Open/recalculate the workbook and upload a file with cached business values.',
          status: 'open',
          createdAt: record.createdAt,
          resolvedAt: null,
          resolvedByBatchId: null
        });
      }
    }
  });
  return issues;
}

function resolveIssues(existingIssues, currentIssues, context) {
  const currentIds = new Set(currentIssues.map((issue) => issue.issueId));
  const next = [];
  for (const old of existingIssues || []) {
    if (old.dataset !== context.dataset || old.status !== 'open') {
      next.push(old);
      continue;
    }
    if (!currentIds.has(old.issueId)) {
      next.push({ ...old, status: 'resolved', resolvedAt: context.createdAt, resolvedByBatchId: context.batchId });
    } else {
      next.push({ ...old, status: 'superseded', resolvedAt: context.createdAt, resolvedByBatchId: context.batchId });
    }
  }
  return [...next, ...currentIssues.map((issue) => ({ ...issue, batchId: context.batchId, createdAt: context.createdAt }))];
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function promoteFiles(files, options, context) {
  const promoted = [];
  for (const [relativeFile, payload] of Object.entries(files || {})) {
    const target = path.join(options.baseDataDir, relativeFile);
    atomicWriteJson(target, payload);
    const historyFile = path.join(options.historyRoot, context.dataset, context.batchId, relativeFile);
    atomicWriteJson(historyFile, payload);
    promoted.push(relativeFile);
  }
  return promoted;
}

function loadExisting(adapter, options) {
  if (adapter.dataset === 'min_max') return readJson(path.join(options.baseDataDir, 'min_max_registry.json'), { rows: [] });
  if (adapter.dataset === 'cost_price') return readJson(path.join(options.baseDataDir, 'cost_registry.json'), { rows: [] });
  return { rows: [] };
}

function runUploadPipeline(options = resolveOptions()) {
  const contract = readJson(CONTRACT_FILE);
  if (!options.inputFile || !fs.existsSync(options.inputFile)) throw new Error(`Upload file is missing: ${options.inputFile || '(not set)'}`);
  const checksum = sha256File(options.inputFile);
  const sourceAsOf = options.sourceAsOf || dateKey(fs.statSync(options.inputFile).mtime.toISOString());
  const requestedAdapter = options.dataset ? loadAdapter(options.dataset) : null;
  const sheets = parseInput(options.inputFile, contract);
  const choices = requestedAdapter ? [requestedAdapter] : adapterChoices();
  const match = findHeader(sheets[0] ? sheets.find(Boolean) && { matrix: [] } : { matrix: [] }, choices);
  const sheetMatches = sheets.map((sheet) => findHeader(sheet, choices)).filter(Boolean).sort((a, b) => b.score - a.score);
  const best = sheetMatches[0];
  if (!best || best.score <= 0) {
    const report = {
      schema: 'portal-upload-health-v1',
      status: 'blocked',
      sourceFile: path.basename(options.inputFile),
      sourceChecksum: checksum,
      message: 'No supported upload template detected by headers.',
      stages: ['upload', 'detect'],
      suggestions: choices.map((adapter) => ({ dataset: adapter.dataset, requiredFields: adapter.requiredFields }))
    };
    if (!options.noWrite) writeJson(path.join(options.outputDir, 'portal_upload_health.json'), report);
    return { report, issues: [], promotedFiles: [] };
  }
  const adapter = requestedAdapter || best.adapter;
  const batchId = sha256Text(`${adapter.dataset}|${checksum}|${sourceAsOf}`).slice(0, 24);
  const context = {
    dataset: adapter.dataset,
    sourceFile: path.basename(options.inputFile),
    sourceChecksum: checksum,
    sourceAsOf,
    batchId,
    createdAt: deterministicIso(sourceAsOf),
    existing: loadExisting(adapter, options)
  };
  const stagingDir = path.join(options.stagingRoot, batchId);
  if (!options.noWrite) fs.mkdirSync(stagingDir, { recursive: true });

  const records = rowsFromHeader(best, adapter, context, contract);
  const issues = [
    ...formulaIssues(records, adapter, contract),
    ...(adapter.validate ? adapter.validate(records, context) : [])
  ];
  let blockingIssues = issues.filter((item) => item.severity !== 'warning');
  let canPromote = blockingIssues.length === 0 && options.autoApprove && !options.noPromote;
  let lockHandle = null;
  let lockPath = '';
  if (canPromote && !options.noWrite) {
    lockPath = path.join(options.stagingRoot, `${adapter.dataset}.promote.lock`);
    fs.mkdirSync(options.stagingRoot, { recursive: true });
    try {
      lockHandle = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(lockHandle, batchId, 'utf8');
    } catch (error) {
      issues.push({
        issueId: sha256Text(`${adapter.dataset}|concurrent_promote|${batchId}|batch`).slice(0, 24),
        dataset: adapter.dataset,
        file: path.basename(options.inputFile),
        sheet: '',
        row: null,
        column: '',
        rawValue: null,
        rule: 'concurrent_promote',
        severity: 'blocking',
        canonicalKey: batchId,
        field: 'batch',
        message: 'Another approved upload is promoting this dataset.',
        suggestion: 'Wait for the active batch to finish, then retry this upload.',
        status: 'open',
        createdAt: context.createdAt,
        resolvedAt: null,
        resolvedByBatchId: null
      });
      canPromote = false;
    }
    blockingIssues = issues.filter((item) => item.severity !== 'warning');
  }
  const production = canPromote && adapter.buildProduction ? adapter.buildProduction(records, context) : { files: {}, reports: {} };
  const promotedFiles = canPromote && !options.noWrite ? promoteFiles(production.files, options, context) : [];
  if (lockHandle !== null) {
    fs.closeSync(lockHandle);
    fs.rmSync(lockPath, { force: true });
  }

  const existingIssues = readJson(path.join(options.baseDataDir, 'portal_upload_issues.json'), { schema: 'portal-upload-issues-v1', issues: [] }).issues || [];
  const nextIssues = resolveIssues(existingIssues, issues, context).sort((left, right) => String(left.issueId).localeCompare(String(right.issueId)));
  const issuePayload = {
    schema: 'portal-upload-issues-v1',
    generatedAt: context.createdAt,
    currentBatchId: batchId,
    issues: nextIssues
  };

  const health = {
    schema: 'portal-upload-health-v1',
    status: blockingIssues.length ? 'blocked' : (canPromote ? 'promoted' : 'preview'),
    dataset: adapter.dataset,
    batchId,
    sourceFile: path.basename(options.inputFile),
    sourceChecksum: checksum,
    sourceAsOf,
    stages: ['upload', 'detect', 'parse', 'normalize', 'validate', 'preview', 'reconcile'].concat(canPromote ? ['approve', 'promote', 'rebuild', 'guard', 'publish', 'resolve'] : []),
    rowCount: records.length,
    acceptedRows: blockingIssues.length ? 0 : records.length,
    rejectedRows: blockingIssues.length ? records.length : 0,
    issueCount: issues.length,
    blockingIssues: blockingIssues.length,
    promotedFiles,
    productionWritesBeforePromote: false,
    fingerprint: sha256Text(stableStringify({ dataset: adapter.dataset, batchId, records, promotedFiles }))
  };
  if (!options.noWrite) {
    writeJson(path.join(options.outputDir, 'portal_upload_health.json'), health);
    writeJson(path.join(options.outputDir, 'portal_upload_issues.json'), issuePayload);
    writeJson(path.join(options.baseDataDir, 'portal_upload_issues.json'), issuePayload);
    for (const [file, payload] of Object.entries(production.reports || {})) writeJson(path.join(options.outputDir, file), payload);
    if (adapter.dataset === 'min_max' && !production.reports?.['portal_min_max_reconciliation.json']) {
      writeJson(path.join(options.outputDir, 'portal_min_max_reconciliation.json'), {
        schema: 'portal-min-max-reconciliation-v1',
        status: blockingIssues.length ? 'blocked' : 'preview',
        batchId,
        sourceAsOf,
        acceptedRows: blockingIssues.length ? 0 : records.length,
        rejectedRows: blockingIssues.length ? records.length : 0,
        blockingIssues: blockingIssues.length
      });
    }
    if (adapter.dataset === 'cost_price' && !production.reports?.['portal_cost_reconciliation.json']) {
      writeJson(path.join(options.outputDir, 'portal_cost_reconciliation.json'), {
        schema: 'portal-cost-reconciliation-v1',
        status: blockingIssues.length ? 'blocked' : 'preview',
        batchId,
        sourceAsOf,
        acceptedRows: blockingIssues.length ? 0 : records.length,
        rejectedRows: blockingIssues.length ? records.length : 0,
        blockingIssues: blockingIssues.length
      });
    }
  }
  return { report: health, issues, promotedFiles, records };
}

function main() {
  try {
    const result = runUploadPipeline(resolveOptions());
    console.log(`[portal-upload-pipeline] ${result.report.status}: ${result.report.dataset || 'unknown'} batch ${result.report.batchId || 'none'}, issues ${result.report.blockingIssues || 0}`);
    if (result.report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(`[portal-upload-pipeline] fatal: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  resolveOptions,
  runUploadPipeline,
  parseInput,
  loadAdapter
};
