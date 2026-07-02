#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { buildLegacyPricesLayer } = require('./build-legacy-prices-layer');
const { buildLegacyRepricerLayer } = require('./build-legacy-repricer-layer');

const ROOT = process.cwd();
const TODAY = new Date().toISOString().slice(0, 10);
const IMPORT_STAMP = new Date().toISOString();
const SOURCE_NOTE = 'ksenia-merged-statuses-minmax-2026-07-02';
const DISABLED_STATUS = 'Вывод';
const DEFAULT_INPUT = path.join(
  process.env.USERPROFILE || '',
  'Downloads',
  'portal_merged_statuses_from_ksenia_minmax.xlsx'
);

const PRICE_TARGET_FILES = [
  { fileName: 'smart_price_workbench.json' },
  { fileName: 'smart_price_overlay.json', overlay: true },
  { fileName: 'price_workbench_support.json' },
  { fileName: 'price_workbench_support.compact.json', compact: true },
  { fileName: 'price_workbench_support.dashboard-compact.json', compact: true, objectRows: true },
  { fileName: 'price_workbench_support.minified.full.json', compact: true }
];

const PLATFORM_LABELS = {
  wb: 'WB',
  ozon: 'Ozon',
  ym: 'Я.Маркет',
  goldapple: 'ЗЯ',
  letu: 'Лэтуаль',
  magnit: 'Магнит Маркет',
  megamarket: 'Мегамаркет',
  samokat: 'Самокат'
};

const STATUS_PRIORITY = new Map([
  ['новинка', 50],
  ['актуальный', 40],
  ['перерабатываем', 30],
  ['под вопросом', 20],
  ['вывод', 10]
]);

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const hasValue = inlineValue !== undefined || (argv[index + 1] && !String(argv[index + 1]).startsWith('--'));
    if (!hasValue) {
      args[key] = true;
      continue;
    }
    args[key] = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return args;
}

function resolveOptions(args = {}) {
  return {
    inputPath: path.resolve(args.input || args['input-file'] || DEFAULT_INPUT),
    dataDir: path.resolve(args['data-dir'] || path.join(ROOT, 'data')),
    exportDir: path.resolve(args['export-dir'] || path.join(ROOT, 'exports')),
    dryRun: Boolean(args['dry-run']),
    skipBackup: Boolean(args['no-backup']),
    skipRebuild: Boolean(args['skip-rebuild'])
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, value, compact = false) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, compact ? JSON.stringify(value) : `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeText(value = '') {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArticleKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function compactKey(value = '') {
  return normalizeArticleKey(value).replace(/[_-]+/g, '');
}

function normalizeToken(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let raw = normalizeText(value).replace(/\s+/g, '');
  if (!raw) return null;
  raw = raw.replace(/[^\d,.\-]/g, '');
  if (!raw) return null;
  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;
  if (commaCount && dotCount) {
    raw = raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (commaCount) {
    const parts = raw.split(',');
    raw = parts.length > 1 && /^\d{3}$/.test(parts[parts.length - 1] || '')
      ? parts.join('')
      : raw.replace(',', '.');
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(...values) {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function roundMetric(value, digits = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(digits));
}

function roundMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(2));
}

function marginPctFromPrice(price, cost) {
  const actualPrice = positiveNumber(price);
  const actualCost = positiveNumber(cost);
  if (!(actualPrice > 0) || !(actualCost > 0)) return null;
  return roundMetric((actualPrice - actualCost) / actualPrice);
}

function marginRubFromRevenueUnits(revenue, units, cost) {
  const actualRevenue = positiveNumber(revenue);
  const actualUnits = parseNumber(units);
  const actualCost = positiveNumber(cost);
  if (!(actualRevenue > 0) || !(actualUnits > 0) || !(actualCost > 0)) return null;
  return roundMoney(actualRevenue - (actualUnits * actualCost));
}

function marginPctFromRevenueUnits(revenue, units, cost) {
  const marginRub = marginRubFromRevenueUnits(revenue, units, cost);
  const actualRevenue = positiveNumber(revenue);
  if (marginRub === null || !(actualRevenue > 0)) return null;
  return roundMetric(marginRub / actualRevenue);
}

function sameNumber(left, right) {
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  return Math.abs(Number(left) - Number(right)) < 0.0001;
}

function normalizePlatform(value = '') {
  const raw = normalizeText(value);
  const token = normalizeToken(raw);
  if (!token) return '';
  if (token === 'wb' || token.includes('wildberries') || token.includes('вб')) return 'wb';
  if (token.includes('ozon') || token.includes('озон')) return 'ozon';
  if (token === 'зя' || token.includes('золотоеяблоко') || token.includes('золот')) return 'goldapple';
  if (token.includes('лету') || token.includes('лэту')) return 'letu';
  if (token.includes('магнит')) return 'magnit';
  if (token.includes('самокат')) return 'samokat';
  if (token.includes('мега')) return 'megamarket';
  if (token.includes('янд') || token.includes('ямаркет') || token.includes('я маркет') || token.includes('я.маркет') || token === 'ям') return 'ym';
  if (token.includes('маркет')) return 'ym';
  return token;
}

function platformLabel(platform) {
  return PLATFORM_LABELS[platform] || platform;
}

function ownerPlatformKeys(platform) {
  if (platform === 'goldapple') return ['ga', 'goldapple'];
  if (platform === 'magnit') return ['mm', 'magnit'];
  if (platform === 'ym') return ['ym', 'ya'];
  return [platform];
}

function isDisabledStatus(value = '') {
  const token = normalizeToken(value);
  return token.includes('вывод') || token.includes('архив') || token.includes('inactive') || token.includes('disabled');
}

function isMatrixActive(status = '') {
  return !isDisabledStatus(status);
}

function statusRank(status = '') {
  const token = normalizeToken(status);
  for (const [part, rank] of STATUS_PRIORITY.entries()) {
    if (token.includes(part)) return rank;
  }
  return 0;
}

function chooseStatus(statuses = []) {
  const clean = statuses.map(normalizeText).filter(Boolean);
  if (!clean.length) return '';
  return clean.sort((left, right) => statusRank(right) - statusRank(left) || left.localeCompare(right, 'ru'))[0];
}

function chooseOwner(values = []) {
  return values.map(normalizeText).filter(Boolean)[0] || '';
}

function rowsFromBucket(bucket = {}) {
  if (!bucket) return [];
  if (Array.isArray(bucket.rows)) return bucket.rows;
  if (bucket.rows && typeof bucket.rows === 'object') return Object.values(bucket.rows);
  if (Array.isArray(bucket.items)) return bucket.items;
  if (Array.isArray(bucket.articles)) return bucket.articles;
  return [];
}

function rowEntries(bucket = {}) {
  if (!bucket) return [];
  if (Array.isArray(bucket.rows)) {
    return bucket.rows.map((row, index) => ({ row, keyHint: '', index }));
  }
  if (bucket.rows && typeof bucket.rows === 'object') {
    return Object.entries(bucket.rows).map(([keyHint, row]) => ({ row, keyHint, index: null }));
  }
  if (Array.isArray(bucket.items)) {
    return bucket.items.map((row, index) => ({ row, keyHint: '', index }));
  }
  if (Array.isArray(bucket.articles)) {
    return bucket.articles.map((row, index) => ({ row, keyHint: '', index }));
  }
  return [];
}

function isObjectRowsBucket(bucket = {}) {
  return Boolean(bucket?.rows && typeof bucket.rows === 'object' && !Array.isArray(bucket.rows));
}

function rowKeyValues(row = {}, keyHint = '') {
  const values = [
    keyHint,
    row.articleKey,
    row.article,
    row.sku,
    row.vendorCode,
    row.supplierArticle,
    row.offerId,
    row.offer_id,
    row.marketArticleId,
    row.sourceArticleKey
  ];
  if (Array.isArray(row.sourceArticleKeys)) values.push(...row.sourceArticleKeys);
  if (Array.isArray(row.aliases)) {
    row.aliases.forEach((alias) => {
      if (typeof alias === 'string') values.push(alias);
      else values.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.vendorCode);
    });
  }
  Object.values(row.platformAliases || {}).forEach((aliases) => {
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });
  return values.map(compactKey).filter(Boolean);
}

function buildRowMap(bucket = {}) {
  const map = new Map();
  rowEntries(bucket).forEach(({ row, keyHint }) => {
    rowKeyValues(row, keyHint).forEach((key) => {
      if (!key) return;
      const current = map.get(key);
      const currentPreferred = current?.matrixSource === SOURCE_NOTE || current?.matrixImportedAt === IMPORT_STAMP;
      const nextPreferred = row?.matrixSource === SOURCE_NOTE || row?.matrixImportedAt === IMPORT_STAMP;
      if (!current || (nextPreferred && !currentPreferred)) map.set(key, row);
    });
  });
  return map;
}

function rowExactMatchScore(row = {}, keyHint = '', sourceRow = {}) {
  const candidates = [
    row.articleKey,
    row.article,
    row.sku,
    row.vendorCode,
    row.supplierArticle,
    row.offerId,
    row.offer_id,
    row.marketArticleId,
    row.sourceArticleKey,
    keyHint
  ];
  if (Array.isArray(row.sourceArticleKeys)) candidates.push(...row.sourceArticleKeys);
  const exactArticleKey = candidates.some((value) => normalizeArticleKey(value) === sourceRow.articleKey);
  const exactArticle = candidates.some((value) => normalizeText(value).toLowerCase() === normalizeText(sourceRow.article).toLowerCase());
  if (row?.matrixSource === SOURCE_NOTE) return 500;
  if (exactArticle) return 400;
  if (exactArticleKey) return 300;
  if (!isDisabledStatus(row?.status || row?.productStatus || row?.repricerStatus || '')) return 200;
  return 100;
}

function findTargetRow(bucket = {}, sourceRow = {}) {
  const matches = rowEntries(bucket).filter(({ row, keyHint }) => rowKeyValues(row, keyHint).includes(sourceRow.key));
  if (!matches.length) return null;
  matches.sort((left, right) => rowExactMatchScore(right.row, right.keyHint, sourceRow) - rowExactMatchScore(left.row, left.keyHint, sourceRow));
  return matches[0].row;
}

function rowMatchesSourceKey(row = {}, keyHint = '', sourceKeys = new Set()) {
  return rowKeyValues(row, keyHint).some((key) => sourceKeys.has(key));
}

function ensurePlatform(payload, platform, objectRows = false) {
  payload.platforms = payload.platforms && typeof payload.platforms === 'object' ? payload.platforms : {};
  if (!payload.platforms[platform]) {
    payload.platforms[platform] = { label: platformLabel(platform), rows: objectRows ? {} : [] };
  }
  const bucket = payload.platforms[platform];
  if (!('label' in bucket) && !('platformLabel' in bucket)) bucket.label = platformLabel(platform);
  if (!bucket.rows || typeof bucket.rows !== 'object') bucket.rows = objectRows ? {} : [];
  return bucket;
}

function insertRow(bucket, sourceRow, row) {
  if (isObjectRowsBucket(bucket)) {
    bucket.rows[sourceRow.articleKey] = row;
    return;
  }
  if (!Array.isArray(bucket.rows)) bucket.rows = rowsFromBucket(bucket);
  bucket.rows.push(row);
}

function sortBucketRows(bucket = {}) {
  if (Array.isArray(bucket.rows)) {
    bucket.rows.sort((left, right) => String(left.articleKey || left.article || '').localeCompare(String(right.articleKey || right.article || ''), 'ru'));
    return;
  }
  if (bucket.rows && typeof bucket.rows === 'object') {
    bucket.rows = Object.fromEntries(
      Object.entries(bucket.rows)
        .sort(([leftKey, leftRow], [rightKey, rightRow]) => {
          const left = leftRow?.articleKey || leftRow?.article || leftKey;
          const right = rightRow?.articleKey || rightRow?.article || rightKey;
          return String(left).localeCompare(String(right), 'ru');
        })
    );
  }
}

function backupFiles(dataDir, backupDir, fileNames = []) {
  ensureDir(backupDir);
  fileNames.forEach((fileName) => {
    const sourcePath = path.join(dataDir, fileName);
    if (!fs.existsSync(sourcePath)) return;
    fs.copyFileSync(sourcePath, path.join(backupDir, fileName));
  });
}

function sourceRowNumericIssues(row) {
  const issues = [];
  if (!(row.cost > 0)) issues.push('missing_cost');
  if (!(row.rawMinPrice > 0)) issues.push('missing_min_price');
  if (!(row.rawMaxPrice > 0)) issues.push('missing_max_price');
  if (row.rawMinPrice > 0 && row.rawMaxPrice > 0 && row.rawMinPrice > row.rawMaxPrice) issues.push('min_gt_max');
  return issues;
}

function readSourceMatrix(inputPath) {
  if (!fs.existsSync(inputPath)) throw new Error(`Input workbook not found: ${inputPath}`);
  const workbook = XLSX.readFile(inputPath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`No sheets found in workbook: ${inputPath}`);
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: ''
  });
  const rows = [];
  const skipped = [];
  matrix.slice(1).forEach((values, index) => {
    const sourceRow = index + 2;
    const platform = normalizePlatform(values[0]);
    const article = normalizeText(values[1]);
    const articleKey = normalizeArticleKey(article);
    if (!platform || !articleKey) {
      skipped.push({ sourceRow, platform: normalizeText(values[0]), article, reason: 'missing_platform_or_article' });
      return;
    }
    const rawCost = parseNumber(values[5]);
    const rawMinPrice = parseNumber(values[6]);
    const rawMaxPrice = parseNumber(values[7]);
    const usableMinMax = rawMinPrice > 0 && rawMaxPrice > 0;
    const minPrice = usableMinMax ? Math.min(rawMinPrice, rawMaxPrice) : null;
    const maxPrice = usableMinMax ? Math.max(rawMinPrice, rawMaxPrice) : null;
    const row = {
      sourceRow,
      sourceSheet: sheetName,
      marketplace: normalizeText(values[0]),
      platform,
      article,
      articleKey,
      key: compactKey(articleKey),
      status: normalizeText(values[2]),
      barcode: normalizeText(values[3]),
      owner: normalizeText(values[4]),
      rawCost,
      cost: rawCost > 0 ? rawCost : null,
      rawMinPrice,
      rawMaxPrice,
      minPrice,
      maxPrice,
      usableCost: rawCost > 0,
      usableMinMax,
      minMaxNormalized: usableMinMax && rawMinPrice > rawMaxPrice,
      numericIssues: []
    };
    row.numericIssues = sourceRowNumericIssues(row);
    rows.push(row);
  });
  return { inputPath, sheetName, rows, skipped };
}

function bumpCounter(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function summarizeSourceRows(rows = []) {
  const byPlatformRows = {};
  const byStatusRows = {};
  rows.forEach((row) => {
    bumpCounter(byPlatformRows, row.platform);
    bumpCounter(byStatusRows, row.status || '(blank)');
  });
  return { byPlatformRows, byStatusRows };
}

function groupSourceRows(rows = []) {
  const byPlatform = new Map();
  const conflicts = [];
  const numericIssueRows = [];
  const normalizedMinMaxRows = [];
  rows.forEach((row) => {
    if (row.numericIssues.length) {
      numericIssueRows.push({
        sourceRow: row.sourceRow,
        platform: row.platform,
        articleKey: row.articleKey,
        status: row.status,
        issues: row.numericIssues,
        cost: row.rawCost,
        minPrice: row.rawMinPrice,
        maxPrice: row.rawMaxPrice
      });
    }
    if (row.minMaxNormalized) {
      normalizedMinMaxRows.push({
        sourceRow: row.sourceRow,
        platform: row.platform,
        articleKey: row.articleKey,
        originalMinPrice: row.rawMinPrice,
        originalMaxPrice: row.rawMaxPrice,
        minPrice: row.minPrice,
        maxPrice: row.maxPrice
      });
    }
    if (!byPlatform.has(row.platform)) byPlatform.set(row.platform, new Map());
    const platformMap = byPlatform.get(row.platform);
    const current = platformMap.get(row.key);
    if (!current) {
      platformMap.set(row.key, {
        platform: row.platform,
        article: row.article,
        articleKey: row.articleKey,
        key: row.key,
        status: row.status,
        owner: row.owner,
        cost: row.cost,
        rawCost: row.rawCost,
        minPrice: row.minPrice,
        maxPrice: row.maxPrice,
        rawMinPrice: row.rawMinPrice,
        rawMaxPrice: row.rawMaxPrice,
        usableCost: row.usableCost,
        usableMinMax: row.usableMinMax,
        minMaxNormalized: row.minMaxNormalized,
        sourceRows: [row.sourceRow],
        sourceSheet: row.sourceSheet,
        barcodes: row.barcode ? [row.barcode] : [],
        numericIssues: [...row.numericIssues],
        sourceRecords: [row]
      });
      return;
    }
    if (row.article && current.article !== row.article) conflicts.push({ platform: row.platform, key: row.key, field: 'article', left: current.article, right: row.article, sourceRow: row.sourceRow });
    if (row.status && current.status && row.status !== current.status) conflicts.push({ platform: row.platform, key: row.key, field: 'status', left: current.status, right: row.status, sourceRow: row.sourceRow });
    if (row.owner && current.owner && row.owner !== current.owner) conflicts.push({ platform: row.platform, key: row.key, field: 'owner', left: current.owner, right: row.owner, sourceRow: row.sourceRow });
    if (row.usableCost && current.cost !== null && !sameNumber(row.cost, current.cost)) conflicts.push({ platform: row.platform, key: row.key, field: 'cost', left: current.cost, right: row.cost, sourceRow: row.sourceRow });
    if (row.usableMinMax && current.minPrice !== null && !sameNumber(row.minPrice, current.minPrice)) conflicts.push({ platform: row.platform, key: row.key, field: 'minPrice', left: current.minPrice, right: row.minPrice, sourceRow: row.sourceRow });
    if (row.usableMinMax && current.maxPrice !== null && !sameNumber(row.maxPrice, current.maxPrice)) conflicts.push({ platform: row.platform, key: row.key, field: 'maxPrice', left: current.maxPrice, right: row.maxPrice, sourceRow: row.sourceRow });
    current.status = current.status || row.status;
    current.owner = current.owner || row.owner;
    if (current.cost === null && row.usableCost) current.cost = row.cost;
    if (current.minPrice === null && row.usableMinMax) current.minPrice = row.minPrice;
    if (current.maxPrice === null && row.usableMinMax) current.maxPrice = row.maxPrice;
    current.usableCost = current.usableCost || row.usableCost;
    current.usableMinMax = current.usableMinMax || row.usableMinMax;
    current.minMaxNormalized = current.minMaxNormalized || row.minMaxNormalized;
    current.sourceRows.push(row.sourceRow);
    if (row.barcode && !current.barcodes.includes(row.barcode)) current.barcodes.push(row.barcode);
    current.numericIssues.push(...row.numericIssues);
    current.sourceRecords.push(row);
  });

  const groupedRows = [];
  const byPlatformRows = {};
  byPlatform.forEach((platformMap, platform) => {
    const values = Array.from(platformMap.values()).sort((left, right) => left.articleKey.localeCompare(right.articleKey, 'ru'));
    byPlatformRows[platform] = values;
    groupedRows.push(...values);
  });
  return { byPlatform, byPlatformRows, groupedRows, conflicts, numericIssueRows, normalizedMinMaxRows };
}

function buildKnownInfo(dataDir) {
  const info = new Map();
  function remember(article, values = {}) {
    const key = compactKey(article);
    if (!key) return;
    const current = info.get(key) || {};
    info.set(key, {
      articleKey: current.articleKey || values.articleKey || values.article || article,
      article: current.article || values.article || values.articleKey || article,
      name: current.name || values.name || '',
      brand: current.brand || values.brand || '',
      legalEntity: current.legalEntity || values.legalEntity || ''
    });
  }
  const skus = readJson(path.join(dataDir, 'skus.json'), []);
  if (Array.isArray(skus)) {
    skus.forEach((sku) => {
      remember(sku.articleKey || sku.article || sku.sku, sku);
      remember(sku.article, sku);
      remember(sku.sku, sku);
      remember(sku.vendorCode, sku);
    });
  }
  ['smart_price_workbench.json', 'smart_price_overlay.json', 'price_workbench_support.json', 'prices.json'].forEach((fileName) => {
    const payload = readJson(path.join(dataDir, fileName), null);
    Object.values(payload?.platforms || {}).forEach((bucket) => {
      rowsFromBucket(bucket).forEach((row) => remember(row.articleKey || row.article || row.sku, row));
    });
  });
  return info;
}

function enrichSourceGroups(groupedRows = [], info = new Map()) {
  groupedRows.forEach((row) => {
    const known = info.get(row.key) || {};
    row.name = known.name || row.article;
    row.brand = known.brand || '';
    row.legalEntity = known.legalEntity || '';
  });
}

function priceFieldsChanged(row, sourceRow) {
  return !sameNumber(parseNumber(row.minPrice), sourceRow.minPrice)
    || !sameNumber(parseNumber(row.maxPrice), sourceRow.maxPrice)
    || !sameNumber(parseNumber(row.workingZoneFrom), sourceRow.minPrice)
    || !sameNumber(parseNumber(row.workingZoneTo), sourceRow.maxPrice);
}

function costFieldsChanged(row, sourceRow) {
  return !sameNumber(parseNumber(row.cost), sourceRow.cost)
    || !sameNumber(parseNumber(row.costRub), sourceRow.cost)
    || !sameNumber(parseNumber(row.costPrice), sourceRow.cost);
}

function applyCostAwareMargins(row, cost, options = {}) {
  const actualCost = positiveNumber(cost);
  if (!(actualCost > 0)) return false;
  const currentPrice = positiveNumber(
    row.currentClientPrice,
    row.currentFillPrice,
    row.currentPrice,
    row.seedTargetClientPrice,
    row.seedTargetFillPrice,
    row.basePrice,
    options.currentPrice
  );
  const currentMarginPct = marginPctFromPrice(currentPrice, actualCost);
  const minMarginPct = marginPctFromPrice(options.minPrice ?? row.minPrice ?? row.workingZoneFrom, actualCost);
  const maxMarginPct = marginPctFromPrice(options.maxPrice ?? row.maxPrice ?? row.workingZoneTo, actualCost);
  let changed = false;
  if (currentMarginPct !== null) {
    row.marginPrevious = row.marginPrevious || {
      marginPct: row.marginPct ?? null,
      marginTotalPct: row.marginTotalPct ?? null,
      avgMargin7dPct: row.avgMargin7dPct ?? null,
      estimatedMarginPct: row.estimatedMarginPct ?? null
    };
    row.marginPct = currentMarginPct;
    row.marginTotalPct = currentMarginPct;
    row.avgMargin7dPct = currentMarginPct;
    row.estimatedMarginPct = currentMarginPct;
    row.grossMarginPct = currentMarginPct;
    row.costAwareMarginPct = currentMarginPct;
    row.marginSource = SOURCE_NOTE;
    row.marginImportedAt = IMPORT_STAMP;
    changed = true;
  }
  if (minMarginPct !== null) row.minPriceMarginPct = minMarginPct;
  if (maxMarginPct !== null) row.maxPriceMarginPct = maxMarginPct;
  return changed || minMarginPct !== null || maxMarginPct !== null;
}

function applyMatrixRow(row, sourceRow, platform) {
  row.articleKey = row.articleKey || sourceRow.articleKey;
  row.article = row.article || sourceRow.article || sourceRow.articleKey;
  row.name = row.name || sourceRow.name || sourceRow.article;
  if (sourceRow.brand && !row.brand) row.brand = sourceRow.brand;
  if (sourceRow.legalEntity && !row.legalEntity) row.legalEntity = sourceRow.legalEntity;
  row.marketplace = row.marketplace || platform;
  row.platformKey = row.platformKey || platform;
  row.platformLabel = row.platformLabel || platformLabel(platform);
  row.owner = sourceRow.owner || row.owner || '';
  row.ownerSource = SOURCE_NOTE;
  row.status = sourceRow.status || row.status || '';
  row.productStatus = sourceRow.status || row.productStatus || row.status || '';
  row.repricerStatus = sourceRow.status || row.repricerStatus || row.productStatus || '';
  row.matrixPresent = true;
  row.matrixActive = isMatrixActive(sourceRow.status);
  row.matrixSource = SOURCE_NOTE;
  row.matrixImportedAt = IMPORT_STAMP;
  row.matrixSourceRows = sourceRow.sourceRows;
  row.matrixBarcodes = sourceRow.barcodes;
  row.barcode = row.barcode || sourceRow.barcodes[0] || '';
  row.barcodes = Array.from(new Set([...(Array.isArray(row.barcodes) ? row.barcodes : []), ...sourceRow.barcodes].filter(Boolean)));
  row.sourceArticleKey = row.sourceArticleKey || sourceRow.articleKey;
  row.sourceMode = row.sourceMode || 'ksenia-minmax-matrix';

  if (sourceRow.usableMinMax) {
    if (priceFieldsChanged(row, sourceRow)) {
      row.minMaxPrevious = {
        minPrice: row.minPrice ?? null,
        maxPrice: row.maxPrice ?? null,
        workingZoneFrom: row.workingZoneFrom ?? null,
        workingZoneTo: row.workingZoneTo ?? null
      };
    }
    row.minPrice = sourceRow.minPrice;
    row.maxPrice = sourceRow.maxPrice;
    row.workingZoneFrom = sourceRow.minPrice;
    row.workingZoneTo = sourceRow.maxPrice;
    row.manualMinPrice = sourceRow.minPrice;
    row.manualMaxPrice = sourceRow.maxPrice;
    row.minMaxSource = SOURCE_NOTE;
    row.minMaxImportedAt = IMPORT_STAMP;
    if (sourceRow.minMaxNormalized) {
      row.matrixMinMaxNormalized = true;
      row.matrixOriginalMinPrice = sourceRow.rawMinPrice;
      row.matrixOriginalMaxPrice = sourceRow.rawMaxPrice;
    }
  } else {
    row.matrixMinMaxSkipped = true;
    row.matrixMinMaxSkipReason = sourceRow.numericIssues.filter((issue) => issue.includes('price')).join(',') || 'missing_minmax';
  }

  if (sourceRow.usableCost) {
    if (costFieldsChanged(row, sourceRow)) {
      row.costPrevious = {
        cost: row.cost ?? null,
        costRub: row.costRub ?? null,
        costPrice: row.costPrice ?? null
      };
    }
    row.cost = sourceRow.cost;
    row.costRub = sourceRow.cost;
    row.costPrice = sourceRow.cost;
    row.costSource = SOURCE_NOTE;
    row.costImportedAt = IMPORT_STAMP;
    applyCostAwareMargins(row, sourceRow.cost, {
      minPrice: sourceRow.minPrice,
      maxPrice: sourceRow.maxPrice
    });
  } else {
    row.matrixCostSkipped = true;
    row.matrixCostSkipReason = 'missing_cost';
  }
}

function makeMatrixRow(sourceRow, platform) {
  const row = {
    articleKey: sourceRow.articleKey,
    article: sourceRow.article || sourceRow.articleKey,
    name: sourceRow.name || sourceRow.article || sourceRow.articleKey,
    brand: sourceRow.brand || '',
    legalEntity: sourceRow.legalEntity || '',
    marketplace: platform,
    platformKey: platform,
    platformLabel: platformLabel(platform),
    owner: sourceRow.owner || '',
    ownerSource: SOURCE_NOTE,
    status: sourceRow.status || '',
    productStatus: sourceRow.status || '',
    repricerStatus: sourceRow.status || '',
    matrixOnly: true,
    matrixPresent: true,
    matrixActive: isMatrixActive(sourceRow.status),
    matrixSource: SOURCE_NOTE,
    matrixImportedAt: IMPORT_STAMP,
    matrixSourceRows: sourceRow.sourceRows,
    matrixBarcodes: sourceRow.barcodes,
    barcode: sourceRow.barcodes[0] || '',
    barcodes: sourceRow.barcodes,
    sourceArticleKey: sourceRow.articleKey,
    sourceMode: 'ksenia-minmax-matrix'
  };
  applyMatrixRow(row, sourceRow, platform);
  return row;
}

function disableOldRow(row, platform) {
  const wasActive = !isDisabledStatus(row.status || row.productStatus || row.repricerStatus || '');
  row.status = DISABLED_STATUS;
  row.productStatus = DISABLED_STATUS;
  row.repricerStatus = DISABLED_STATUS;
  row.matrixPresent = false;
  row.matrixActive = false;
  row.matrixDisabledAt = IMPORT_STAMP;
  row.matrixDisabledReason = `not_in_${SOURCE_NOTE}`;
  row.matrixSource = row.matrixSource || SOURCE_NOTE;
  row.marketplace = row.marketplace || platform;
  row.platformKey = row.platformKey || platform;
  row.platformLabel = row.platformLabel || platformLabel(platform);
  return wasActive;
}

function updateExtraMarketplace(payload = {}) {
  if (!payload || typeof payload !== 'object') return;
  payload.extraMarketplace = payload.extraMarketplace && typeof payload.extraMarketplace === 'object'
    ? payload.extraMarketplace
    : {};
  payload.extraMarketplace.generatedAt = IMPORT_STAMP;
  payload.extraMarketplace.source = SOURCE_NOTE;
  payload.extraMarketplace.platforms = payload.extraMarketplace.platforms && typeof payload.extraMarketplace.platforms === 'object'
    ? payload.extraMarketplace.platforms
    : {};
  Object.entries(payload.platforms || {}).forEach(([platform, bucket]) => {
    payload.extraMarketplace.platforms[platform] = {
      key: platform,
      label: platformLabel(platform),
      articleCount: rowsFromBucket(bucket).length
    };
  });
}

function updatePricePayload(payload, fileName, sourceByPlatformRows, targetOptions = {}) {
  payload.generatedAt = IMPORT_STAMP;
  payload.matrixImportAppliedAt = IMPORT_STAMP;
  payload.matrixImportSource = SOURCE_NOTE;
  const stats = {
    fileName,
    platforms: {},
    updated: 0,
    added: 0,
    disabledDuplicates: 0,
    disabled: 0,
    confirmedDisabled: 0,
    skippedMinMax: 0,
    skippedCost: 0
  };

  Object.entries(sourceByPlatformRows).forEach(([platform, sourceRows]) => {
    const bucket = ensurePlatform(payload, platform, Boolean(targetOptions.objectRows));
    const sourceKeys = new Set(sourceRows.map((row) => row.key));
    const selectedRows = new Set();
    const platformStats = {
      sourceRows: sourceRows.length,
      updated: 0,
      added: 0,
      disabledDuplicates: 0,
      disabled: 0,
      confirmedDisabled: 0,
      skippedMinMax: 0,
      skippedCost: 0
    };

    sourceRows.forEach((sourceRow) => {
      let target = findTargetRow(bucket, sourceRow);
      if (target) {
        applyMatrixRow(target, sourceRow, platform);
        selectedRows.add(target);
        platformStats.updated += 1;
        stats.updated += 1;
      } else {
        target = makeMatrixRow(sourceRow, platform);
        insertRow(bucket, sourceRow, target);
        selectedRows.add(target);
        platformStats.added += 1;
        stats.added += 1;
      }
      if (!sourceRow.usableMinMax) {
        platformStats.skippedMinMax += 1;
        stats.skippedMinMax += 1;
      }
      if (!sourceRow.usableCost) {
        platformStats.skippedCost += 1;
        stats.skippedCost += 1;
      }
    });

    rowEntries(bucket).forEach(({ row, keyHint }) => {
      const keys = rowKeyValues(row, keyHint);
      if (!keys.length) return;
      if (keys.some((key) => sourceKeys.has(key))) {
        if (!selectedRows.has(row)) {
          const wasActive = disableOldRow(row, platform);
          row.matrixDisabledReason = `duplicate_not_selected_in_${SOURCE_NOTE}`;
          platformStats.disabledDuplicates += 1;
          stats.disabledDuplicates += 1;
          if (wasActive) stats.disabled += 1;
          else stats.confirmedDisabled += 1;
        }
        return;
      }
      const wasActive = disableOldRow(row, platform);
      if (wasActive) {
        platformStats.disabled += 1;
        stats.disabled += 1;
      } else {
        platformStats.confirmedDisabled += 1;
        stats.confirmedDisabled += 1;
      }
    });
    sortBucketRows(bucket);
    stats.platforms[platform] = platformStats;
  });

  if (targetOptions.overlay) updateExtraMarketplace(payload);
  return stats;
}

function buildArticleGroups(groupedRows = []) {
  const byArticle = new Map();
  groupedRows.forEach((row) => {
    const current = byArticle.get(row.key) || {
      key: row.key,
      articleKey: row.articleKey,
      article: row.article,
      name: row.name || row.article,
      brand: row.brand || '',
      legalEntity: row.legalEntity || '',
      statuses: [],
      owners: [],
      costs: [],
      platforms: {},
      sourceRows: [],
      barcodes: []
    };
    current.statuses.push(row.status);
    current.owners.push(row.owner);
    if (row.usableCost) current.costs.push(row.cost);
    current.platforms[row.platform] = row;
    current.sourceRows.push(...row.sourceRows);
    current.barcodes.push(...row.barcodes);
    byArticle.set(row.key, current);
  });
  byArticle.forEach((group) => {
    group.status = chooseStatus(group.statuses);
    group.owner = chooseOwner(group.owners);
    group.cost = group.costs.find((value) => value > 0) ?? null;
    group.barcodes = Array.from(new Set(group.barcodes.filter(Boolean)));
    group.sourceRows = Array.from(new Set(group.sourceRows)).sort((left, right) => left - right);
  });
  return byArticle;
}

function ensureOwnerObject(sku) {
  if (!sku.owner || typeof sku.owner !== 'object' || Array.isArray(sku.owner)) {
    sku.owner = { name: normalizeText(sku.owner), source: '', byPlatform: {} };
  }
  sku.owner.byPlatform = sku.owner.byPlatform && typeof sku.owner.byPlatform === 'object' ? sku.owner.byPlatform : {};
  sku.ownersByPlatform = sku.ownersByPlatform && typeof sku.ownersByPlatform === 'object' ? sku.ownersByPlatform : {};
}

function skuTokens(sku = {}) {
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.nmId,
    sku.nmID,
    sku.barcode
  ];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') values.push(alias);
      else values.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.vendorCode, alias?.nmId);
    });
  }
  Object.values(sku.platformAliases || {}).forEach((aliases) => {
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });
  return values.map(compactKey).filter(Boolean);
}

function skuCanonicalTokens(sku = {}) {
  return [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle
  ].map(compactKey).filter(Boolean);
}

function buildSkuMap(skus = [], tokenSelector = skuTokens) {
  const map = new Map();
  skus.forEach((sku) => {
    tokenSelector(sku).forEach((key) => {
      if (key && !map.has(key)) map.set(key, sku);
    });
  });
  return map;
}

function createSkuFromGroup(group) {
  return {
    article: group.article || group.articleKey,
    articleKey: group.articleKey,
    brand: group.brand || '',
    legalEntity: group.legalEntity || '',
    name: group.name || group.article || group.articleKey,
    category: '',
    type: '',
    segment: null,
    abc: null,
    leadTimeDays: null,
    status: group.status || '',
    registryStatus: group.status || '',
    costPrice: group.cost ?? 0,
    owner: {
      name: group.owner || '',
      source: SOURCE_NOTE,
      registryStatus: group.status || '',
      byPlatform: {}
    },
    ownersByPlatform: {},
    planFact: {
      planFeb26Units: 0,
      planMar26Units: 0,
      planApr26Units: 0,
      planAssigned: false,
      planStatus: isMatrixActive(group.status) ? 'needs_plan_assignment' : 'not_required_for_disabled_sku',
      planSource: SOURCE_NOTE,
      planCheckedAt: IMPORT_STAMP
    },
    traffic: { kz: false, vk: false, channels: [] },
    flags: {
      assigned: Boolean(group.owner),
      toWork: false,
      toWorkWB: false,
      toWorkOzon: false
    },
    matrixOnly: true,
    matrixPresent: true,
    matrixActive: isMatrixActive(group.status),
    matrixSource: SOURCE_NOTE,
    matrixImportedAt: IMPORT_STAMP,
    matrixSourceRows: group.sourceRows,
    matrixBarcodes: group.barcodes
  };
}

function hasAssignedPlan(planFact = {}) {
  return [
    planFact.planFeb26Units,
    planFact.planMar26Units,
    planFact.planApr26Units,
    planFact.planMay26Units,
    planFact.planJun26Units,
    planFact.planJul26Units,
    planFact.planUnits,
    planFact.planMonthUnits
  ].some((value) => (parseNumber(value) || 0) > 0);
}

function ensurePlanFact(sku, group) {
  sku.planFact = sku.planFact && typeof sku.planFact === 'object' ? sku.planFact : {};
  ['planFeb26Units', 'planMar26Units', 'planApr26Units'].forEach((field) => {
    if (sku.planFact[field] === null || sku.planFact[field] === undefined || sku.planFact[field] === '') sku.planFact[field] = 0;
  });
  const assigned = hasAssignedPlan(sku.planFact);
  const active = isMatrixActive(group.status || sku.status || sku.registryStatus || '');
  sku.planFact.planAssigned = assigned;
  sku.planFact.planStatus = assigned
    ? 'assigned'
    : (active ? 'needs_plan_assignment' : 'not_required_for_disabled_sku');
  sku.planFact.planNeedsAssignment = active && !assigned;
  sku.planFact.planSource = assigned ? (sku.planFact.planSource || 'existing_portal_plan') : SOURCE_NOTE;
  sku.planFact.planCheckedAt = IMPORT_STAMP;
  sku.planAssigned = assigned;
  sku.planStatus = sku.planFact.planStatus;
  sku.planNeedsAssignment = sku.planFact.planNeedsAssignment;
}

function applyPlanFactCost(sku, cost) {
  const actualCost = positiveNumber(cost);
  if (!(actualCost > 0) || !sku.planFact || typeof sku.planFact !== 'object') return false;
  const factFebCostRub = roundMoney((parseNumber(sku.planFact.factFeb26Units) || 0) * actualCost);
  const factFebMarginRub = marginRubFromRevenueUnits(
    sku.planFact.factFeb26Revenue,
    sku.planFact.factFeb26Units,
    actualCost
  );
  const factFebMarginPct = marginPctFromRevenueUnits(
    sku.planFact.factFeb26Revenue,
    sku.planFact.factFeb26Units,
    actualCost
  );
  if (factFebCostRub !== null) sku.planFact.factFeb26CostRub = factFebCostRub;
  if (factFebMarginRub !== null) sku.planFact.factFeb26GrossMarginRub = factFebMarginRub;
  if (factFebMarginPct !== null) {
    sku.planFact.factFeb26MarginPreviousPct = sku.planFact.factFeb26MarginPreviousPct ?? sku.planFact.factFeb26MarginPct ?? null;
    sku.planFact.factFeb26MarginPct = factFebMarginPct;
    sku.planFact.marginSource = SOURCE_NOTE;
    sku.planFact.marginImportedAt = IMPORT_STAMP;
  }
  return factFebMarginPct !== null;
}

function applySkuSideMargin(side = {}, cost) {
  const actualCost = positiveNumber(cost);
  if (!(actualCost > 0) || !side || typeof side !== 'object') return false;
  side.costPrice = actualCost;
  side.cost = actualCost;
  side.costRub = actualCost;
  const price = positiveNumber(side.currentClientPrice, side.currentPrice, side.recPrice, side.basePrice);
  const currentMarginPct = marginPctFromPrice(price, actualCost);
  if (currentMarginPct !== null) {
    side.marginPreviousPct = side.marginPreviousPct ?? side.marginPct ?? null;
    side.marginPct = currentMarginPct;
    side.marginTotalPct = currentMarginPct;
    side.grossMarginPct = currentMarginPct;
    side.costAwareMarginPct = currentMarginPct;
    side.marginSource = SOURCE_NOTE;
    side.marginImportedAt = IMPORT_STAMP;
  }
  const minMarginPct = marginPctFromPrice(side.minPrice || side.workingZoneFrom, actualCost);
  const maxMarginPct = marginPctFromPrice(side.maxPrice || side.workingZoneTo, actualCost);
  if (minMarginPct !== null) side.minPriceMarginPct = minMarginPct;
  if (maxMarginPct !== null) side.maxPriceMarginPct = maxMarginPct;
  return currentMarginPct !== null || minMarginPct !== null || maxMarginPct !== null;
}

function applySkuGroup(sku, group) {
  sku.articleKey = sku.articleKey || group.articleKey;
  sku.article = sku.article || group.article || group.articleKey;
  sku.name = sku.name || group.name || group.article || group.articleKey;
  if (group.brand && !sku.brand) sku.brand = group.brand;
  if (group.legalEntity && !sku.legalEntity) sku.legalEntity = group.legalEntity;
  sku.status = group.status || sku.status || '';
  sku.registryStatus = group.status || sku.registryStatus || sku.status || '';
  sku.matrixPresent = true;
  sku.matrixActive = isMatrixActive(group.status);
  sku.matrixSource = SOURCE_NOTE;
  sku.matrixImportedAt = IMPORT_STAMP;
  sku.matrixSourceRows = group.sourceRows;
  sku.matrixBarcodes = group.barcodes;
  ensurePlanFact(sku, group);
  if (group.cost > 0) {
    sku.costPrice = group.cost;
    sku.cost = group.cost;
    sku.costRub = group.cost;
    sku.costSource = SOURCE_NOTE;
    sku.costImportedAt = IMPORT_STAMP;
    applyPlanFactCost(sku, group.cost);
  }

  ensureOwnerObject(sku);
  sku.owner.name = group.owner || sku.owner.name || '';
  sku.owner.source = SOURCE_NOTE;
  sku.owner.registryStatus = group.status || sku.owner.registryStatus || '';

  sku.platformMatrix = sku.platformMatrix && typeof sku.platformMatrix === 'object' ? sku.platformMatrix : {};
  const sideCostApplied = new Set();
  Object.entries(group.platforms).forEach(([platform, platformRow]) => {
    ownerPlatformKeys(platform).forEach((ownerKey) => {
      if (platformRow.owner) {
        sku.owner.byPlatform[ownerKey] = platformRow.owner;
        sku.ownersByPlatform[ownerKey] = platformRow.owner;
      }
    });
    const platformMatrixRow = {
      platform,
      label: platformLabel(platform),
      status: platformRow.status,
      owner: platformRow.owner,
      minPrice: platformRow.minPrice,
      maxPrice: platformRow.maxPrice,
      costPrice: platformRow.cost,
      barcodes: platformRow.barcodes,
      sourceRows: platformRow.sourceRows,
      matrixActive: isMatrixActive(platformRow.status),
      matrixSource: SOURCE_NOTE,
      matrixImportedAt: IMPORT_STAMP
    };
    sku.platformMatrix[platform] = platformMatrixRow;
    if (['wb', 'ozon', 'ym'].includes(platform)) {
      sku[platform] = sku[platform] && typeof sku[platform] === 'object' ? sku[platform] : {};
      sku[platform].status = platformRow.status || sku[platform].status || '';
      sku[platform].owner = platformRow.owner || sku[platform].owner || '';
      if (platformRow.usableMinMax) {
        sku[platform].minPrice = platformRow.minPrice;
        sku[platform].maxPrice = platformRow.maxPrice;
        sku[platform].workingZoneFrom = platformRow.minPrice;
        sku[platform].workingZoneTo = platformRow.maxPrice;
      }
      if (platformRow.usableCost) sku[platform].costPrice = platformRow.cost;
      if (platformRow.usableCost) {
        applySkuSideMargin(sku[platform], platformRow.cost);
        sideCostApplied.add(platform);
      }
      sku[platform].matrixSource = SOURCE_NOTE;
      sku[platform].matrixImportedAt = IMPORT_STAMP;
    }
  });
  if (sku.wb && group.cost > 0 && !sideCostApplied.has('wb')) applySkuSideMargin(sku.wb, group.cost);
  if (sku.ozon && group.cost > 0 && !sideCostApplied.has('ozon')) applySkuSideMargin(sku.ozon, group.cost);
  if (sku.ym && group.cost > 0 && !sideCostApplied.has('ym')) applySkuSideMargin(sku.ym, group.cost);
}

function disableOldSku(sku) {
  const wasActive = !isDisabledStatus(sku.status || sku.registryStatus || sku.owner?.registryStatus || '');
  sku.status = DISABLED_STATUS;
  sku.registryStatus = DISABLED_STATUS;
  sku.matrixPresent = false;
  sku.matrixActive = false;
  sku.matrixDisabledAt = IMPORT_STAMP;
  sku.matrixDisabledReason = `not_in_${SOURCE_NOTE}`;
  ensureOwnerObject(sku);
  sku.owner.registryStatus = DISABLED_STATUS;
  if (sku.planFact && typeof sku.planFact === 'object') {
    sku.planFact.planStatus = 'not_required_for_disabled_sku';
    sku.planFact.planNeedsAssignment = false;
    sku.planFact.planCheckedAt = IMPORT_STAMP;
  }
  sku.planStatus = 'not_required_for_disabled_sku';
  sku.planNeedsAssignment = false;
  return wasActive;
}

function updateSkus(skus, articleGroups) {
  const target = Array.isArray(skus) ? skus : [];
  const skuMap = buildSkuMap(target, skuCanonicalTokens);
  const stats = {
    updated: 0,
    added: 0,
    disabled: 0,
    confirmedDisabled: 0,
    sourceArticles: articleGroups.size,
    planAssigned: 0,
    planNeedsAssignment: 0,
    activeMatrixSku: 0
  };
  articleGroups.forEach((group) => {
    let sku = skuMap.get(group.key);
    if (!sku) {
      sku = createSkuFromGroup(group);
      target.push(sku);
      stats.added += 1;
    } else {
      stats.updated += 1;
    }
    applySkuGroup(sku, group);
    skuCanonicalTokens(sku).forEach((key) => {
      if (key && !skuMap.has(key)) skuMap.set(key, sku);
    });
  });
  target.forEach((sku) => {
    const keys = skuCanonicalTokens(sku);
    if (!keys.length || keys.some((key) => articleGroups.has(key))) return;
    const wasActive = disableOldSku(sku);
    if (wasActive) stats.disabled += 1;
    else stats.confirmedDisabled += 1;
  });
  target.forEach((sku) => {
    if (sku.matrixActive) stats.activeMatrixSku += 1;
    if (sku.planFact?.planAssigned || sku.planAssigned) stats.planAssigned += 1;
    if (sku.planFact?.planNeedsAssignment || sku.planNeedsAssignment) stats.planNeedsAssignment += 1;
  });
  target.sort((left, right) => String(left.articleKey || left.article || '').localeCompare(String(right.articleKey || right.article || ''), 'ru'));
  return { skus: target, stats };
}

function objectFromCounts(rows = [], keySelector) {
  const counts = {};
  rows.forEach((row) => bumpCounter(counts, keySelector(row)));
  return counts;
}

function buildReportSkeleton(options, source, grouped) {
  const sourceSummary = summarizeSourceRows(source.rows);
  return {
    generatedAt: IMPORT_STAMP,
    source: {
      inputPath: options.inputPath,
      sheetName: source.sheetName,
      rowCount: source.rows.length,
      skippedRows: source.skipped,
      uniquePlatformArticleCount: grouped.groupedRows.length,
      uniqueArticleCount: buildArticleGroups(grouped.groupedRows).size,
      byPlatformRows: sourceSummary.byPlatformRows,
      byPlatformUnique: objectFromCounts(grouped.groupedRows, (row) => row.platform),
      byStatusRows: sourceSummary.byStatusRows,
      byStatusUnique: objectFromCounts(grouped.groupedRows, (row) => row.status || '(blank)'),
      numericIssueRows: grouped.numericIssueRows,
      normalizedMinMaxRows: grouped.normalizedMinMaxRows,
      conflicts: grouped.conflicts
    },
    targets: [],
    skus: {},
    derived: {},
    backupDir: '',
    dryRun: options.dryRun
  };
}

function runImport(options) {
  ensureDir(options.exportDir);
  const source = readSourceMatrix(options.inputPath);
  const grouped = groupSourceRows(source.rows);
  const knownInfo = buildKnownInfo(options.dataDir);
  enrichSourceGroups(grouped.groupedRows, knownInfo);
  Object.values(grouped.byPlatformRows).forEach((rows) => enrichSourceGroups(rows, knownInfo));
  const articleGroups = buildArticleGroups(grouped.groupedRows);
  const report = buildReportSkeleton(options, source, grouped);
  const stampSafe = IMPORT_STAMP.replace(/[:.]/g, '-');
  const backupDir = path.join(options.dataDir, `ksenia-minmax-backup-${stampSafe}`);
  report.backupDir = backupDir;

  const targetFileNames = [
    ...PRICE_TARGET_FILES.map((item) => item.fileName),
    'skus.json',
    'prices.json',
    'repricer.json'
  ];
  if (!options.dryRun && !options.skipBackup) backupFiles(options.dataDir, backupDir, targetFileNames);

  PRICE_TARGET_FILES.forEach((target) => {
    const filePath = path.join(options.dataDir, target.fileName);
    const payload = readJson(filePath, { generatedAt: '', platforms: {} });
    const stats = updatePricePayload(payload, target.fileName, grouped.byPlatformRows, target);
    report.targets.push(stats);
    if (!options.dryRun) writeJson(filePath, payload, Boolean(target.compact));
  });

  const skusPath = path.join(options.dataDir, 'skus.json');
  const { skus, stats: skuStats } = updateSkus(readJson(skusPath, []), articleGroups);
  report.skus = skuStats;
  if (!options.dryRun) writeJson(skusPath, skus, false);

  if (!options.dryRun && !options.skipRebuild) {
    const pricesResult = buildLegacyPricesLayer({
      workbenchPath: path.join(options.dataDir, 'smart_price_workbench.json'),
      overlayPath: path.join(options.dataDir, 'smart_price_overlay.json'),
      livePath: path.join(ROOT, 'tmp-smart_price_workbench-live.json'),
      outputPath: path.join(options.dataDir, 'prices.json')
    });
    const repricerResult = buildLegacyRepricerLayer({
      workbenchPath: path.join(options.dataDir, 'smart_price_workbench.json'),
      overlayPath: path.join(options.dataDir, 'smart_price_overlay.json'),
      liveWorkbenchPath: path.join(ROOT, 'tmp-smart_price_workbench-live.json'),
      liveRepricerPath: path.join(ROOT, 'tmp-live-repricer.json'),
      supportPath: path.join(options.dataDir, 'price_workbench_support.json'),
      pricesPath: path.join(options.dataDir, 'prices.json'),
      procurementWbPath: path.join(options.dataDir, 'order_procurement_wb.json'),
      procurementOzonPath: path.join(options.dataDir, 'order_procurement_ozon.json'),
      outputPath: path.join(options.dataDir, 'repricer.json')
    });
    report.derived = {
      prices: pricesResult.summary,
      repricer: repricerResult.summary
    };
  }

  const reportPath = path.join(options.exportDir, `ksenia_minmax_import_${TODAY}.json`);
  if (!options.dryRun) writeJson(reportPath, report, false);
  return { report, reportPath };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const { report, reportPath } = runImport(options);
  console.log(JSON.stringify({
    ok: true,
    dryRun: options.dryRun,
    report: options.dryRun ? null : path.relative(ROOT, reportPath),
    backupDir: options.skipBackup || options.dryRun ? null : path.relative(ROOT, report.backupDir),
    source: {
      rows: report.source.rowCount,
      uniquePlatformArticles: report.source.uniquePlatformArticleCount,
      uniqueArticles: report.source.uniqueArticleCount,
      numericIssueRows: report.source.numericIssueRows.length,
      normalizedMinMaxRows: report.source.normalizedMinMaxRows.length,
      conflicts: report.source.conflicts.length
    },
    skus: report.skus,
    targets: report.targets.map((target) => ({
      fileName: target.fileName,
      updated: target.updated,
      added: target.added,
      disabled: target.disabled,
      skippedMinMax: target.skippedMinMax,
      skippedCost: target.skippedCost
    })),
    derived: report.derived
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exit(1);
  }
}

module.exports = {
  SOURCE_NOTE,
  DISABLED_STATUS,
  compactKey,
  isDisabledStatus,
  normalizeArticleKey,
  normalizePlatform,
  parseArgs,
  readSourceMatrix,
  resolveOptions,
  groupSourceRows,
  buildArticleGroups,
  rowsFromBucket,
  rowEntries,
  rowKeyValues,
  runImport
};
