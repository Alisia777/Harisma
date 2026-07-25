#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { buildLegacyPricesLayer } = require('./build-legacy-prices-layer');
const { buildLegacyRepricerLayer } = require('./build-legacy-repricer-layer');

const ROOT = process.cwd();
const TODAY = new Date().toISOString().slice(0, 10);

const DATA_FILES = [
  'smart_price_workbench.json',
  'price_workbench_support.json',
  'prices.json',
  'smart_price_overlay.json'
];

const INPUTS = [
  {
    fileName: 'Мин макс ВБ.xlsx',
    filePatterns: [/^Мин\s+макс\s+ВБ.*\.xlsx$/i],
    platform: 'wb',
    articleColumn: 0,
    minColumn: 1,
    maxColumn: 2,
    marginColumn: 3,
    articleHeaders: ['vendorcode', 'артикул', 'sku'],
    minHeaders: ['цена мин', 'мин', 'min'],
    maxHeaders: ['цена макс', 'макс', 'max'],
    marginHeaders: ['маржа', 'маржа, %', 'маржа %', 'целевая маржа', 'target margin', 'target margin %'],
    sellerMinColumn: 1,
    sellerMaxColumn: 2
  },
  {
    fileName: 'Озон мин_макс.xlsx',
    filePatterns: [/^Озон\s+мин_макс.*\.xlsx$/i, /^ответственные\s+Озон.*min[_\s-]*max.*\.xlsx$/i],
    platform: 'ozon',
    articleColumn: 0,
    clientMinColumn: 1,
    minColumn: 2,
    clientMaxColumn: 3,
    maxColumn: 4,
    marginColumn: 5,
    articleHeaders: ['артикул', 'vendorcode', 'sku'],
    clientMinHeaders: ['min c спп', 'min с спп', 'min спп'],
    minHeaders: ['min лк', 'min', 'мин'],
    clientMaxHeaders: ['max c спп', 'max с спп', 'max спп'],
    maxHeaders: ['max лк', 'max', 'макс'],
    marginHeaders: ['маржа', 'маржа, %', 'маржа %', 'целевая маржа', 'target margin', 'target margin %'],
    sellerMinColumn: 2,
    sellerMaxColumn: 4
  },
  {
    fileName: 'Мин максы.xlsx',
    filePatterns: [/^Мин\s+максы.*\.xlsx$/i],
    platform: 'ym',
    overlayPlatform: 'ya',
    articleColumn: 0,
    minColumn: 1,
    maxColumn: 2,
    marginColumn: 3,
    articleHeaders: ['артикул', 'vendorcode', 'sku'],
    minHeaders: ['мин', 'min', 'цена мин'],
    maxHeaders: ['макс', 'max', 'цена макс'],
    marginHeaders: ['маржа', 'маржа, %', 'маржа %', 'целевая маржа', 'target margin', 'target margin %'],
    sellerMinColumn: 1,
    sellerMaxColumn: 2
  }
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function normalizeArticleKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function compactKey(value = '') {
  return normalizeArticleKey(value).replace(/[_-]+/g, '');
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMarginPct(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const parsed = parseNumber(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const ratio = text.includes('%') || parsed > 1 ? parsed / 100 : parsed;
  return ratio > 0 && ratio < 1 ? Number(ratio.toFixed(6)) : null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function defaultInputDir() {
  return path.join(path.dirname(ROOT), 'Мин Макс');
}

function candidateInputDirs(inputDir) {
  const downloadsDir = path.join(process.env.USERPROFILE || '', 'Downloads');
  const dirs = [
    inputDir,
    path.join(downloadsDir, 'Данные от команды'),
    path.join(downloadsDir, 'Telegram Desktop'),
    downloadsDir
  ].filter(Boolean);
  const seen = new Set();
  return dirs.filter((dir) => {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    return fs.existsSync(resolved);
  });
}

function sourceFileMatches(fileName, source) {
  if (fileName === source.fileName) return true;
  return (source.filePatterns || []).some((pattern) => pattern.test(fileName));
}

function resolveInputFile(inputDir, source) {
  const candidates = [];
  candidateInputDirs(inputDir).forEach((dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isFile() || !/\.xlsx?$/i.test(entry.name)) return;
      if (!sourceFileMatches(entry.name, source)) return;
      const filePath = path.join(dir, entry.name);
      const stat = fs.statSync(filePath);
      candidates.push({ filePath, mtimeMs: stat.mtimeMs });
    });
  });
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.filePath || path.join(inputDir, source.fileName);
}

function normalizeHeader(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ');
}

function findHeaderIndex(headers, expected = [], fallback) {
  const normalized = headers.map(normalizeHeader);
  for (const header of expected) {
    const index = normalized.indexOf(normalizeHeader(header));
    if (index >= 0) return index;
  }
  return fallback;
}

function resolveColumns(headers, source) {
  return {
    articleColumn: findHeaderIndex(headers, source.articleHeaders, source.articleColumn),
    minColumn: findHeaderIndex(headers, source.minHeaders, source.minColumn),
    maxColumn: findHeaderIndex(headers, source.maxHeaders, source.maxColumn),
    marginColumn: findHeaderIndex(headers, source.marginHeaders, source.marginColumn),
    sellerMinColumn: findHeaderIndex(headers, source.sellerMinHeaders || source.minHeaders, source.sellerMinColumn),
    sellerMaxColumn: findHeaderIndex(headers, source.sellerMaxHeaders || source.maxHeaders, source.sellerMaxColumn),
    clientMinColumn: findHeaderIndex(headers, source.clientMinHeaders, source.clientMinColumn),
    clientMaxColumn: findHeaderIndex(headers, source.clientMaxHeaders, source.clientMaxColumn)
  };
}

function readInputRows(inputDir, source) {
  const filePath = resolveInputFile(inputDir, source);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }
  const sourceFileName = path.basename(filePath);
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: ''
  });
  const columns = resolveColumns(matrix[0] || [], source);
  const rows = [];
  const duplicates = [];
  const invalidMargins = [];
  const seen = new Set();
  matrix.slice(1).forEach((row, index) => {
    const article = String(row[columns.articleColumn] || '').trim();
    const articleKey = normalizeArticleKey(article);
    const key = compactKey(article);
    const minPrice = parseNumber(row[columns.minColumn]);
    const maxPrice = parseNumber(row[columns.maxColumn]);
    if (!articleKey || minPrice === null || maxPrice === null) return;
    const targetMarginPct = parseMarginPct(row[columns.marginColumn]);
    if (targetMarginPct === null) {
      invalidMargins.push({ articleKey, sourceRow: index + 2, value: row[columns.marginColumn] });
      return;
    }
    if (seen.has(key)) duplicates.push(articleKey);
    seen.add(key);
    rows.push({
      sourceFile: sourceFileName,
      sourceRow: index + 2,
      platform: source.platform,
      overlayPlatform: source.overlayPlatform || source.platform,
      article,
      articleKey,
      key,
      minPrice,
      maxPrice,
      targetMarginPct,
      sellerMinPrice: parseNumber(row[columns.sellerMinColumn]),
      sellerMaxPrice: parseNumber(row[columns.sellerMaxColumn]),
      clientMinPrice: parseNumber(row[columns.clientMinColumn]),
      clientMaxPrice: parseNumber(row[columns.clientMaxColumn])
    });
  });
  if (invalidMargins.length) {
    const examples = invalidMargins.slice(0, 10).map((item) => `${item.articleKey} (строка ${item.sourceRow})`).join(', ');
    throw new Error(`Маржа обязательна для каждого SKU в ${sourceFileName}. Исправьте ${invalidMargins.length} строк: ${examples}`);
  }
  return {
    filePath,
    sourceFileName,
    columns,
    rows,
    duplicates,
    invalidMargins
  };
}

function rowsFromBucket(bucket) {
  if (!bucket) return [];
  if (Array.isArray(bucket.rows)) return bucket.rows;
  if (bucket.rows && typeof bucket.rows === 'object') return Object.values(bucket.rows);
  if (Array.isArray(bucket.items)) return bucket.items;
  if (Array.isArray(bucket.articles)) return bucket.articles;
  return [];
}

function buildRowMap(rows) {
  const map = new Map();
  rows.forEach((row) => {
    [
      row.articleKey,
      row.article,
      row.sku,
      row.vendorCode,
      row.offerId,
      row.marketArticleId
    ].forEach((value) => {
      const key = compactKey(value);
      if (key && !map.has(key)) map.set(key, row);
    });
  });
  return map;
}

function updateRow(row, minMaxRow, fileName) {
  const previous = {
    minPrice: row.minPrice ?? null,
    maxPrice: row.maxPrice ?? null,
    workingZoneFrom: row.workingZoneFrom ?? null,
    workingZoneTo: row.workingZoneTo ?? null,
    targetMarginPct: row.targetMarginPct ?? row.manualMarginPct ?? row.allowedMarginPct ?? null
  };
  row.articleKey = row.articleKey || minMaxRow.articleKey;
  row.article = row.article || minMaxRow.articleKey;
  row.minPrice = minMaxRow.minPrice;
  row.maxPrice = minMaxRow.maxPrice;
  row.workingZoneFrom = minMaxRow.minPrice;
  row.workingZoneTo = minMaxRow.maxPrice;
  row.manualMinPrice = minMaxRow.minPrice;
  row.manualMaxPrice = minMaxRow.maxPrice;
  row.targetMarginPct = minMaxRow.targetMarginPct;
  row.manualMarginPct = minMaxRow.targetMarginPct;
  row.allowedMarginPct = minMaxRow.targetMarginPct;
  if (minMaxRow.clientMinPrice !== null) row.manualClientMinPrice = minMaxRow.clientMinPrice;
  if (minMaxRow.clientMaxPrice !== null) row.manualClientMaxPrice = minMaxRow.clientMaxPrice;
  row.minMaxSource = minMaxRow.sourceFile;
  row.marginSource = minMaxRow.sourceFile;
  row.minMaxImportedAt = new Date().toISOString();
  row.minMaxPrevious = previous;

  if (fileName === 'prices.json') {
    row.currentPriceDate = row.currentPriceDate || TODAY;
  }
}

function platformForFile(source, fileName) {
  if (fileName === 'smart_price_overlay.json') return source.overlayPlatform || source.platform;
  return source.platform;
}

function ensurePlatform(payload, platform) {
  payload.platforms = payload.platforms && typeof payload.platforms === 'object' ? payload.platforms : {};
  if (!payload.platforms[platform]) payload.platforms[platform] = { rows: [] };
  if (!Array.isArray(payload.platforms[platform].rows)) {
    payload.platforms[platform].rows = rowsFromBucket(payload.platforms[platform]);
  }
  return payload.platforms[platform];
}

function importIntoPayload(payload, fileName, source, rows) {
  const platform = platformForFile(source, fileName);
  const bucket = ensurePlatform(payload, platform);
  const targetRows = rowsFromBucket(bucket);
  const map = buildRowMap(targetRows);
  const matched = [];
  const missing = [];

  rows.forEach((minMaxRow) => {
    const target = map.get(minMaxRow.key);
    if (!target) {
      missing.push(minMaxRow.articleKey);
      return;
    }
    updateRow(target, minMaxRow, fileName);
    matched.push(minMaxRow.articleKey);
  });

  payload.minMaxImportAppliedAt = new Date().toISOString();
  payload.minMaxImportSources = INPUTS.map((item) => item.fileName);
  return {
    fileName,
    platform,
    sourceFile: source.fileName,
    sourceRows: rows.length,
    matched: matched.length,
    missing: missing.length,
    missingArticles: missing.slice(0, 80)
  };
}

function main() {
  const args = parseArgs(process.argv);
  const inputDir = path.resolve(args['input-dir'] || defaultInputDir());
  const dataDir = path.resolve(args['data-dir'] || path.join(ROOT, 'data'));
  const exportDir = path.resolve(args['export-dir'] || path.join(ROOT, 'exports'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(dataDir, `minmax-backup-${stamp}`);
  ensureDir(backupDir);
  ensureDir(exportDir);

  const sourceResults = INPUTS.map((source) => {
    const result = readInputRows(inputDir, source);
    return {
      source: {
        ...source,
        configuredFileName: source.fileName,
        fileName: result.sourceFileName
      },
      ...result
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    inputDir,
    backupDir,
    inputs: sourceResults.map((item) => ({
      file: item.source.fileName,
      configuredFile: item.source.configuredFileName,
      platform: item.source.platform,
      path: item.filePath,
      columns: item.columns,
      rows: item.rows.length,
      duplicates: item.duplicates
    })),
    targets: []
  };

  DATA_FILES.forEach((fileName) => {
    const filePath = path.join(dataDir, fileName);
    const backupPath = path.join(backupDir, fileName);
    fs.copyFileSync(filePath, backupPath);
    const payload = readJson(filePath);
    sourceResults.forEach((item) => {
      report.targets.push(importIntoPayload(payload, fileName, item.source, item.rows));
    });
    writeJson(filePath, payload);
  });

  const pricesResult = buildLegacyPricesLayer({
    workbenchPath: path.join(dataDir, 'smart_price_workbench.json'),
    overlayPath: path.join(dataDir, 'smart_price_overlay.json'),
    livePath: path.join(ROOT, 'tmp-smart_price_workbench-live.json'),
    outputPath: path.join(dataDir, 'prices.json')
  });
  const repricerResult = buildLegacyRepricerLayer({
    workbenchPath: path.join(dataDir, 'smart_price_workbench.json'),
    overlayPath: path.join(dataDir, 'smart_price_overlay.json'),
    liveWorkbenchPath: path.join(ROOT, 'tmp-smart_price_workbench-live.json'),
    liveRepricerPath: path.join(ROOT, 'tmp-live-repricer.json'),
    supportPath: path.join(dataDir, 'price_workbench_support.json'),
    pricesPath: path.join(dataDir, 'prices.json'),
    outputPath: path.join(dataDir, 'repricer.json')
  });
  report.derived = {
    prices: pricesResult.summary,
    repricer: repricerResult.summary
  };

  const reportPath = path.join(exportDir, `repricer_minmax_import_${TODAY}.json`);
  writeJson(reportPath, report);

  console.log(JSON.stringify({
    report: path.relative(ROOT, reportPath),
    backupDir: path.relative(ROOT, backupDir),
    inputs: report.inputs.map((item) => ({
      file: item.file,
      platform: item.platform,
      rows: item.rows,
      duplicateRows: item.duplicates.length
    })),
    targets: report.targets.map((item) => ({
      file: item.fileName,
      platform: item.platform,
      sourceFile: item.sourceFile,
      matched: item.matched,
      missing: item.missing
    })),
    derived: report.derived
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  INPUTS,
  parseNumber,
  parseMarginPct,
  resolveColumns,
  readInputRows,
  updateRow
};
