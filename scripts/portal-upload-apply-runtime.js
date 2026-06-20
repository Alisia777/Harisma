#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { buildCanonicalRepricer } = require('./build-canonical-repricer');
const { normalizeKey } = require('./smart-price-contour');

const REPORTS = {
  e2e: 'portal_upload_apply_e2e.json',
  minmax: 'portal_minmax_upload_reconciliation.json',
  cost: 'portal_cost_upload_reconciliation.json'
};

const SHEETS = {
  fill: '\u0417\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435',
  instruction: '\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f',
  dictionary: '\u0421\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a',
  previousErrors: '\u041e\u0448\u0438\u0431\u043a\u0438_\u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0435\u0439_\u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438'
};

const DATASETS = new Set(['min_max', 'cost_price']);
const PLATFORMS = new Set(['wb', 'ozon', 'ym', 'yandex', 'all']);
const CURRENCIES = new Set(['RUB', 'RUR']);
const UNITS = new Set(['piece', 'pcs', 'unit', 'шт', 'штука']);

const COLUMN_ALIASES = {
  articleKey: ['articlekey', 'article_key', 'article', 'sku', 'sku_code', 'артикул', 'номенклатура'],
  platform: ['platform', 'marketplace', 'площадка', 'маркетплейс'],
  minPrice: ['minprice', 'min_price', 'min', 'minrub', 'min_rub', 'importminrub', 'новыйmin', 'minцена'],
  maxPrice: ['maxprice', 'max_price', 'max', 'maxrub', 'max_rub', 'importmaxrub', 'новыйmax', 'maxцена'],
  legalEntity: ['legalentity', 'legal_entity', 'юрлицо', 'юрлицо', 'юридическоелицо', 'юрлице'],
  cost: ['cost', 'costrub', 'cost_rub', 'себестоимость', 'новаясебестоимость', 'ценаcost'],
  currency: ['currency', 'валюта'],
  unit: ['unit', 'единица', 'едизм', 'единицаизмерения'],
  effectiveFrom: ['effectivefrom', 'effective_from', 'действуетс', 'дата', 'date'],
  author: ['author', 'createdby', 'кто', 'автор'],
  role: ['role', 'роль'],
  reason: ['reason', 'note', 'comment', 'причина', 'комментарий']
};

function parseArgs(argv) {
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

function resolveOptions(args = {}) {
  const root = process.cwd();
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output')),
    templateDir: path.resolve(args['template-dir'] || path.join(root, 'data', 'templates')),
    file: args.file ? path.resolve(args.file) : '',
    dataset: String(args.dataset || '').trim(),
    author: String(args.author || 'server-upload').trim(),
    role: String(args.role || '').trim(),
    reason: String(args.reason || '').trim(),
    canApprove: Boolean(args.approve || args['can-approve']),
    noWrite: Boolean(args['no-write']),
    noFail: Boolean(args['no-fail']),
    generateTemplates: Boolean(args['generate-templates'])
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableId(prefix, parts) {
  return `${prefix}_${crypto.createHash('sha256').update(stableStringify(parts)).digest('hex').slice(0, 16)}`;
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[\s"'`.,;:!?()[\]{}<>/_\\|+\-=№#@$%^&*~]+/g, '');
}

function canonicalColumn(header) {
  const normalized = normalizeHeader(header);
  return Object.entries(COLUMN_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0] || '';
}

function numberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = String(value || '').trim();
  if (!text) return '';
  const direct = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return direct[0];
  const ru = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, '0')}-${ru[1].padStart(2, '0')}`;
  return '';
}

function workbookErrors(workbook) {
  const errors = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    Object.keys(sheet || {}).forEach((address) => {
      if (address.startsWith('!')) return;
      const cell = sheet[address] || {};
      const text = `${cell.f || ''} ${cell.w || ''} ${cell.v || ''}`;
      if (cell.t === 'e' || /#REF!|#VALUE!|#DIV\/0!|#N\/A/i.test(text)) {
        errors.push({ sheet: sheetName, address, value: cell.w || cell.v || '', formula: cell.f || '' });
      }
    });
  });
  return errors;
}

function readUploadRows(filePath, dataset) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.xlsx', '.xls', '.csv', '.tsv'].includes(ext)) {
    return { rows: [], errors: [{ code: 'unsupported_format', message: `Unsupported upload format: ${ext}` }], workbookErrors: [] };
  }
  const workbook = XLSX.readFile(filePath, { cellDates: true, cellFormula: true, raw: false });
  const formulaErrors = workbookErrors(workbook);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
  const needed = dataset === 'cost_price'
    ? ['articleKey', 'legalEntity', 'cost', 'currency', 'unit', 'effectiveFrom', 'reason']
    : ['articleKey', 'platform', 'minPrice', 'maxPrice', 'effectiveFrom'];
  let headerIndex = -1;
  let columnMap = {};
  for (let index = 0; index < Math.min(matrix.length, 20); index += 1) {
    const candidate = {};
    matrix[index].forEach((header, colIndex) => {
      const canonical = canonicalColumn(header);
      if (canonical && candidate[canonical] === undefined) candidate[canonical] = colIndex;
    });
    const score = needed.filter((column) => candidate[column] !== undefined).length;
    if (score >= Math.min(needed.length, 4)) {
      headerIndex = index;
      columnMap = candidate;
      break;
    }
  }
  if (headerIndex < 0) {
    return { rows: [], errors: [{ code: 'missing_header', message: 'Could not detect required upload headers' }], workbookErrors: formulaErrors };
  }
  const missing = needed.filter((column) => columnMap[column] === undefined);
  if (missing.length) {
    return { rows: [], errors: [{ code: 'missing_columns', message: `Missing required columns: ${missing.join(', ')}`, missing }], workbookErrors: formulaErrors };
  }
  const rows = [];
  matrix.slice(headerIndex + 1).forEach((line, offset) => {
    const raw = {};
    Object.entries(columnMap).forEach(([column, colIndex]) => {
      raw[column] = line[colIndex];
    });
    if (Object.values(raw).every((value) => String(value ?? '').trim() === '')) return;
    rows.push({ rowNumber: headerIndex + offset + 2, raw });
  });
  return { rows, errors: [], workbookErrors: formulaErrors };
}

function skuRows(inputDir) {
  const payload = readJson(path.join(inputDir, 'skus.json'), []);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.skus)) return payload.skus;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function skuAliases(row = {}) {
  const values = [row.articleKey, row.article, row.sku, row.skuCode, row.offerId];
  if (Array.isArray(row.aliases)) row.aliases.forEach((alias) => values.push(alias?.value || alias?.alias || alias));
  if (row.aliases && typeof row.aliases === 'object' && !Array.isArray(row.aliases)) Object.values(row.aliases).forEach((alias) => values.push(alias));
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function buildSkuIndex(inputDir) {
  const index = new Map();
  const collisions = new Map();
  skuRows(inputDir).forEach((row) => {
    const articleKey = String(row.articleKey || row.article || row.sku || '').trim();
    if (!articleKey) return;
    skuAliases(row).forEach((alias) => {
      const key = normalizeKey(alias);
      if (!key) return;
      if (index.has(key) && index.get(key).articleKey !== articleKey) {
        collisions.set(key, [...(collisions.get(key) || [index.get(key).articleKey]), articleKey]);
        return;
      }
      index.set(key, { articleKey, row });
    });
  });
  return { index, collisions };
}

function normalizePlatform(value) {
  const platform = String(value || '').trim().toLowerCase();
  if (platform === 'yandex') return 'ym';
  return platform;
}

function validateMinMaxRow(row, context) {
  const raw = row.raw || {};
  const errors = [];
  const articleInput = String(raw.articleKey || '').trim();
  const sku = context.skuIndex.get(normalizeKey(articleInput));
  if (!articleInput) errors.push('missing_article_key');
  if (articleInput && !sku) errors.push('unknown_sku');
  if (context.skuCollisions.has(normalizeKey(articleInput))) errors.push('alias_collision');
  const platform = normalizePlatform(raw.platform);
  if (!PLATFORMS.has(platform)) errors.push('invalid_platform');
  const minPrice = numberOrNull(raw.minPrice);
  const maxPrice = numberOrNull(raw.maxPrice);
  if (minPrice === null || minPrice <= 0) errors.push('invalid_min_price');
  if (maxPrice === null || maxPrice <= 0) errors.push('invalid_max_price');
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) errors.push('min_gt_max');
  const effectiveFrom = isoDate(raw.effectiveFrom) || context.today;
  const author = String(raw.author || context.author).trim();
  const role = String(raw.role || context.role).trim();
  const reason = String(raw.reason || context.reason).trim();
  if (!author) errors.push('missing_author');
  if (!role) errors.push('missing_role');
  if (!reason) errors.push('missing_reason');
  return {
    valid: errors.length === 0,
    errors,
    record: {
      articleKey: sku?.articleKey || articleInput,
      platform,
      minPrice,
      maxPrice,
      effectiveFrom,
      author,
      role,
      reason
    }
  };
}

function validateCostRow(row, context) {
  const raw = row.raw || {};
  const errors = [];
  const articleInput = String(raw.articleKey || '').trim();
  const sku = context.skuIndex.get(normalizeKey(articleInput));
  if (!articleInput) errors.push('missing_article_key');
  if (articleInput && !sku) errors.push('unknown_sku');
  if (context.skuCollisions.has(normalizeKey(articleInput))) errors.push('alias_collision');
  const legalEntity = String(raw.legalEntity || '').trim();
  const skuLegalEntity = String(sku?.row?.legalEntity || '').trim();
  if (!legalEntity) errors.push('missing_legal_entity');
  if (legalEntity && skuLegalEntity && normalizeKey(legalEntity) !== normalizeKey(skuLegalEntity)) errors.push('legal_entity_mismatch');
  if (legalEntity && !skuLegalEntity) errors.push('unresolved_legal_entity');
  const cost = numberOrNull(raw.cost);
  if (cost === null || cost <= 0) errors.push('invalid_cost');
  const currency = String(raw.currency || '').trim().toUpperCase();
  if (!CURRENCIES.has(currency)) errors.push('invalid_currency');
  const unit = String(raw.unit || '').trim().toLowerCase();
  if (!UNITS.has(unit)) errors.push('invalid_unit');
  const effectiveFrom = isoDate(raw.effectiveFrom) || context.today;
  const reason = String(raw.reason || context.reason).trim();
  const author = String(raw.author || context.author).trim();
  const role = String(raw.role || context.role).trim();
  if (!reason) errors.push('missing_reason');
  if (!author) errors.push('missing_author');
  if (!role) errors.push('missing_role');
  return {
    valid: errors.length === 0,
    errors,
    record: {
      articleKey: sku?.articleKey || articleInput,
      legalEntity,
      cost,
      currency,
      unit,
      effectiveFrom,
      reason,
      author,
      role
    }
  };
}

function validateRows(dataset, rows, options, source) {
  const sku = buildSkuIndex(options.inputDir);
  const today = source.createdAt.slice(0, 10);
  const context = {
    skuIndex: sku.index,
    skuCollisions: sku.collisions,
    today,
    author: options.author,
    role: options.role,
    reason: options.reason
  };
  const seen = new Map();
  const accepted = [];
  const rejected = [];
  rows.forEach((row) => {
    const result = dataset === 'cost_price' ? validateCostRow(row, context) : validateMinMaxRow(row, context);
    const key = dataset === 'cost_price'
      ? `${normalizeKey(result.record.articleKey)}|${normalizeKey(result.record.legalEntity)}`
      : `${normalizeKey(result.record.articleKey)}|${result.record.platform}`;
    const comparable = dataset === 'cost_price'
      ? stableStringify({ cost: result.record.cost, currency: result.record.currency, unit: result.record.unit, effectiveFrom: result.record.effectiveFrom })
      : stableStringify({ minPrice: result.record.minPrice, maxPrice: result.record.maxPrice, effectiveFrom: result.record.effectiveFrom });
    if (result.valid && seen.has(key) && seen.get(key) !== comparable) {
      result.valid = false;
      result.errors.push('conflicting_duplicate_row');
    }
    if (result.valid) seen.set(key, comparable);
    const rowReport = { rowNumber: row.rowNumber, articleKey: result.record.articleKey, errors: result.errors };
    if (!result.valid) {
      rejected.push(rowReport);
      return;
    }
    accepted.push(result.record);
  });
  return { accepted, rejected };
}

function registryFile(inputDir, dataset) {
  return path.join(inputDir, dataset === 'cost_price' ? 'repricer_cost_registry.json' : 'repricer_minmax_registry.json');
}

function readRegistry(inputDir, dataset) {
  const payload = readJson(registryFile(inputDir, dataset), { rows: [] });
  return Array.isArray(payload.rows) ? payload.rows : (Array.isArray(payload) ? payload : []);
}

function registryPayload(dataset, rows) {
  const key = dataset === 'cost_price' ? 'repricer-cost-registry-v1' : 'repricer-minmax-registry-v1';
  return {
    schema: key,
    rows: rows.slice().sort((left, right) => stableStringify([
      left.articleKey,
      left.platform || left.legalEntity || '',
      left.effectiveFrom || '',
      left.batchId || '',
      left.id || ''
    ]).localeCompare(stableStringify([
      right.articleKey,
      right.platform || right.legalEntity || '',
      right.effectiveFrom || '',
      right.batchId || '',
      right.id || ''
    ])))
  };
}

function approvedRecords(dataset, accepted, options, source) {
  const approvalStatus = options.canApprove ? 'approved' : 'pending_review';
  return accepted.map((row) => {
    const basis = [dataset, row.articleKey, row.platform || row.legalEntity, row.effectiveFrom, source.checksum];
    return {
      id: stableId(dataset === 'cost_price' ? 'cost' : 'minmax', basis),
      batchId: source.batchId,
      ...row,
      createdAt: source.createdAt,
      approvalStatus,
      approvedBy: options.canApprove ? options.author : '',
      approvedAt: options.canApprove ? source.createdAt : '',
      sourceStore: 'server_upload',
      sourceFile: source.fileName,
      sourceChecksum: source.checksum
    };
  });
}

function applyRecords(dataset, records, options) {
  const existing = readRegistry(options.inputDir, dataset);
  const nextById = new Map(existing.map((row) => [row.id, row]));
  records.forEach((row) => nextById.set(row.id, row));
  const nextRows = [...nextById.values()];
  if (!options.noWrite) writeJson(registryFile(options.inputDir, dataset), registryPayload(dataset, nextRows));
  return nextRows;
}

function report(dataset, source, validation, records, status, extra = {}) {
  return {
    schema: dataset === 'cost_price' ? 'portal-cost-upload-reconciliation-v1' : 'portal-minmax-upload-reconciliation-v1',
    generatedAt: source.createdAt,
    dataset,
    status,
    publish_allowed: status !== 'blocked',
    sourceFile: source.fileName,
    sourceChecksum: source.checksum,
    batchId: source.batchId,
    summary: {
      rows: validation.rows,
      accepted: validation.accepted,
      rejected: validation.rejected,
      persisted: records.length,
      approvalStatus: source.approvalStatus
    },
    errors: validation.errors,
    rejectedRows: validation.rejectedRows,
    records: records.slice(0, 50),
    ...extra
  };
}

function emptyReport(dataset, generatedAt = '1970-01-01T00:00:00.000Z') {
  return report(dataset, {
    createdAt: generatedAt,
    fileName: '',
    checksum: '',
    batchId: '',
    approvalStatus: 'none'
  }, {
    rows: 0,
    accepted: 0,
    rejected: 0,
    errors: [],
    rejectedRows: []
  }, [], 'ok', { note: 'No upload file was provided; registry state was left unchanged.' });
}

function writeAllReports(options, reports) {
  if (options.noWrite) return;
  fs.mkdirSync(options.outputDir, { recursive: true });
  writeJson(path.join(options.outputDir, REPORTS.e2e), reports.e2e);
  writeJson(path.join(options.outputDir, REPORTS.minmax), reports.minmax || emptyReport('min_max', reports.e2e.generatedAt));
  writeJson(path.join(options.outputDir, REPORTS.cost), reports.cost || emptyReport('cost_price', reports.e2e.generatedAt));
}

function generateTemplates(templateDir) {
  fs.mkdirSync(templateDir, { recursive: true });
  const minMaxRows = [
    { articleKey: '', platform: 'wb', minPrice: '', maxPrice: '', effectiveFrom: '', author: '', role: '', reason: '' }
  ];
  const costRows = [
    { articleKey: '', legalEntity: '', cost: '', currency: 'RUB', unit: 'piece', effectiveFrom: '', author: '', role: '', reason: '' }
  ];
  const build = (rows, instructions, dictionaryRows, fileName) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), SHEETS.fill);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(instructions.map((line) => [line])), SHEETS.instruction);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dictionaryRows), SHEETS.dictionary);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ rowNumber: '', articleKey: '', error: '' }]), SHEETS.previousErrors);
    XLSX.writeFile(workbook, path.join(templateDir, fileName), { bookType: 'xlsx' });
  };
  build(minMaxRows, [
    'Required: articleKey, platform, minPrice, maxPrice, effectiveFrom.',
    'Allowed platforms: wb, ozon, ym, all.',
    'Rows are applied only after server validation, approval, canonical rebuild, reconciliation, and runtime refetch.'
  ], [...PLATFORMS].sort().map((platform) => ({ type: 'platform', value: platform })), 'portal-min-max-template.xlsx');
  build(costRows, [
    'Required: articleKey, legalEntity, cost, currency, unit, effectiveFrom, author, role, reason.',
    'Cost must be positive. Blank or zero cost never overwrites verified cost.',
    'Rows are applied only after server validation, approval, canonical rebuild, reconciliation, and runtime refetch.'
  ], [
    { type: 'currency', value: 'RUB' },
    { type: 'unit', value: 'piece' }
  ], 'portal-cost-template.xlsx');
}

function applyUpload(options = resolveOptions({})) {
  const callerHadTemplateDir = Object.prototype.hasOwnProperty.call(options, 'templateDir');
  const defaults = resolveOptions({});
  options = { ...defaults, ...options };
  if (!callerHadTemplateDir && options.inputDir !== defaults.inputDir) options.templateDir = path.join(options.inputDir, 'templates');
  if (!options.templateDir) options.templateDir = path.join(options.inputDir, 'templates');
  if (options.generateTemplates && !options.noWrite) generateTemplates(options.templateDir);
  if (!options.file) {
    const generatedAt = '1970-01-01T00:00:00.000Z';
    const reports = {
      e2e: {
        schema: 'portal-upload-apply-e2e-v1',
        generatedAt,
        status: 'ok',
        publish_allowed: true,
        summary: { uploads: 0, accepted: 0, rejected: 0, persisted: 0 },
        steps: [
          { id: 'templates:generated', status: options.generateTemplates ? 'ok' : 'skipped' },
          { id: 'upload:file-provided', status: 'skipped' }
        ]
      },
      minmax: emptyReport('min_max', generatedAt),
      cost: emptyReport('cost_price', generatedAt)
    };
    writeAllReports(options, reports);
    return reports;
  }

  if (!DATASETS.has(options.dataset)) throw new Error(`Unknown upload dataset: ${options.dataset}`);
  const checksum = sha256File(options.file);
  const stat = fs.statSync(options.file);
  const source = {
    fileName: path.basename(options.file),
    checksum,
    batchId: stableId('upload_batch', [options.dataset, checksum]),
    createdAt: stat.mtime.toISOString(),
    approvalStatus: options.canApprove ? 'approved' : 'pending_review'
  };
  const parsed = readUploadRows(options.file, options.dataset);
  const validationRows = validateRows(options.dataset, parsed.rows, options, source);
  const parseErrors = [...parsed.errors, ...parsed.workbookErrors.map((error) => ({ code: 'workbook_formula_error', ...error }))];
  const validation = {
    rows: parsed.rows.length,
    accepted: validationRows.accepted.length,
    rejected: validationRows.rejected.length + parseErrors.length,
    errors: parseErrors,
    rejectedRows: validationRows.rejected
  };
  const hasErrors = validation.rejected > 0 || parseErrors.length > 0;
  const records = hasErrors ? [] : approvedRecords(options.dataset, validationRows.accepted, options, source);
  const persisted = hasErrors ? [] : applyRecords(options.dataset, records, options);
  let canonical = null;
  if (!hasErrors && options.canApprove) {
    canonical = buildCanonicalRepricer({
      inputDir: options.inputDir,
      outputDir: options.outputDir,
      noWrite: options.noWrite,
      noFail: true
    });
  }
  const status = hasErrors ? 'blocked' : (options.canApprove ? 'ok' : 'pending_review');
  const datasetReport = report(options.dataset, source, validation, records, status, {
    registryRows: persisted.length,
    canonicalSnapshotId: canonical?.payload?.snapshot_id || '',
    canonicalBusinessFingerprint: canonical?.reconciliation?.business_fingerprint || ''
  });
  const reports = {
    e2e: {
      schema: 'portal-upload-apply-e2e-v1',
      generatedAt: source.createdAt,
      status,
      publish_allowed: status !== 'blocked',
      dataset: options.dataset,
      batchId: source.batchId,
      sourceFile: source.fileName,
      sourceChecksum: source.checksum,
      summary: {
        uploads: 1,
        accepted: validation.accepted,
        rejected: validation.rejected,
        persisted: records.length,
        approvalStatus: source.approvalStatus
      },
      steps: [
        { id: 'upload:parsed', status: parsed.errors.length ? 'blocked' : 'ok' },
        { id: 'upload:validated', status: hasErrors ? 'blocked' : 'ok' },
        { id: 'upload:server-persisted', status: hasErrors ? 'skipped' : 'ok' },
        { id: 'upload:approved', status: options.canApprove ? 'ok' : 'pending_review' },
        { id: 'canonical:rebuilt', status: canonical ? 'ok' : (options.canApprove ? 'skipped' : 'pending_review') },
        { id: 'runtime:refetch-required', status: canonical ? 'ok' : 'pending_review' }
      ]
    },
    minmax: options.dataset === 'min_max' ? datasetReport : emptyReport('min_max', source.createdAt),
    cost: options.dataset === 'cost_price' ? datasetReport : emptyReport('cost_price', source.createdAt)
  };
  writeAllReports(options, reports);
  return reports;
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  try {
    const reports = applyUpload(options);
    const status = reports.e2e.status === 'ok' ? 'OK' : reports.e2e.status.toUpperCase();
    console.log(`[upload-apply] ${status}: accepted ${reports.e2e.summary.accepted}, rejected ${reports.e2e.summary.rejected}, persisted ${reports.e2e.summary.persisted}`);
    if (reports.e2e.status === 'blocked' && !options.noFail) process.exitCode = 1;
  } catch (error) {
    console.error(`[upload-apply] fatal: ${error.stack || error.message}`);
    if (!options.noFail) process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  applyUpload,
  buildSkuIndex,
  parseArgs,
  readUploadRows,
  resolveOptions,
  validateRows
};
