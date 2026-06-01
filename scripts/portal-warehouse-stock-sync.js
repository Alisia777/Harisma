#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const XLSX = require('xlsx');

const DEFAULT_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1Hk5iqYmKjoeXXuSjxOFXBEJ6z0M52OZvHMaCORUPzkM/export?format=csv&gid=0';
const DEFAULT_SOURCE_WORKBOOK = 'Склад Балашиха';
const DEFAULT_SOURCE_SHEET = 'Склад Балашиха';
const DEFAULT_MATCH_FIELD = 'Наименование как в ЛК -> article/articleKey';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || token === 'sync') continue;
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function cwdJoin(...parts) {
  return path.join(process.cwd(), ...parts);
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function numberOrZero(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.+-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readOptionalJson(filePath) {
  try {
    return fs.existsSync(filePath) ? readJson(filePath) : null;
  } catch (_error) {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function writeGzip(filePath, payload) {
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, zlib.gzipSync(buffer));
}

function normalizeSheetRow(row) {
  const normalized = new Map();
  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = normalizeKey(key);
    if (normalizedKey) normalized.set(normalizedKey, value);
  }
  return normalized;
}

function firstValue(rowMap, aliases) {
  for (const alias of aliases) {
    const value = rowMap.get(normalizeKey(alias));
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function registerAlias(map, alias, canonical) {
  const normalizedAlias = normalizeKey(alias);
  const normalizedCanonical = normalizeKey(canonical);
  if (!normalizedAlias || !normalizedCanonical) return;
  if (!map.has(normalizedAlias)) {
    map.set(normalizedAlias, normalizedCanonical);
  }
}

function stripBadVariant(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return '';
  const badIndex = normalized.indexOf('_bad_');
  if (badIndex > 0) return normalized.slice(0, badIndex);
  const hyphenIndex = normalized.indexOf('-bad-');
  if (hyphenIndex > 0) return normalized.slice(0, hyphenIndex);
  return normalized;
}

function buildSkuAliasIndex(skus) {
  const index = new Map();
  for (const item of Array.isArray(skus) ? skus : []) {
    const canonical = normalizeKey(item?.articleKey || item?.article);
    if (!canonical) continue;
    registerAlias(index, canonical, canonical);
    registerAlias(index, item?.article, canonical);
    registerAlias(index, item?.articleKey, canonical);
    const stripped = stripBadVariant(canonical);
    if (stripped && stripped !== canonical) {
      registerAlias(index, stripped, canonical);
    }
  }
  return index;
}

function resolveSkuKey(rawKey, aliasIndex) {
  const normalized = normalizeKey(rawKey);
  if (!normalized) return '';
  if (aliasIndex.has(normalized)) return aliasIndex.get(normalized);
  const stripped = stripBadVariant(normalized);
  if (stripped && aliasIndex.has(stripped)) return aliasIndex.get(stripped);
  return aliasIndex.get(normalized) || '';
}

function writeOverlayArtifacts(targetDir, payload) {
  if (!targetDir) return [];
  const resolvedDir = path.resolve(targetDir);
  const jsonPath = path.join(resolvedDir, 'warehouse_stock_overlay.json');
  const gzPath = path.join(resolvedDir, 'warehouse_stock_overlay.json.gz');
  writeJson(jsonPath, payload);
  writeGzip(gzPath, payload);
  return [jsonPath, gzPath];
}

async function fetchCsvText(sourceUrl) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 30000) : null;
  try {
    const response = await fetch(sourceUrl, {
      cache: 'no-store',
      signal: controller?.signal,
      headers: {
        Accept: 'text/csv,application/vnd.ms-excel,text/plain,*/*'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${await response.text()}`);
    }
    const text = await response.text();
    return text.replace(/^\uFEFF/, '');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildOverlayPayload(csvText, options, skus, existingPayload) {
  const workbook = XLSX.read(csvText, { type: 'string' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const aliasIndex = buildSkuAliasIndex(skus);
  const grouped = new Map();
  let matchedRowCount = 0;
  const unmatchedSourceKeys = [];
  const unmatchedSeen = new Set();

  for (const row of sheetRows) {
    const rowMap = normalizeSheetRow(row);
    const rawKey = String(
      firstValue(rowMap, [
        'Наименование как в ЛК',
        'Наименование',
        'SKU',
        'Артикул',
        'sku',
        'article',
        'article_key'
      ])
    ).trim();
    if (!rawKey) continue;

    const resolvedKey = resolveSkuKey(rawKey, aliasIndex);
    if (!resolvedKey) {
      if (!unmatchedSeen.has(rawKey)) {
        unmatchedSeen.add(rawKey);
        if (unmatchedSourceKeys.length < 25) {
          unmatchedSourceKeys.push(rawKey);
        }
      }
      continue;
    }

    matchedRowCount += 1;
    const bucket = grouped.get(resolvedKey) || {
      articleKey: resolvedKey,
      stockWarehouse: 0,
      accepted: 0,
      shippedOzon: 0,
      shippedWB: 0,
      sourceKeys: new Set(),
      sourceRowCount: 0
    };

    bucket.stockWarehouse += numberOrZero(firstValue(rowMap, ['Остатки', 'остатки']));
    bucket.accepted += numberOrZero(firstValue(rowMap, ['Принято', 'принято']));
    bucket.shippedOzon += numberOrZero(firstValue(rowMap, ['Отгружено Озон', 'Отгружено Ozon', 'отгружено_ozon', 'отгружено_озон']));
    bucket.shippedWB += numberOrZero(firstValue(rowMap, ['Отгружено ВБ', 'Отгружено WB', 'отгружено_wb', 'отгружено_вб']));
    bucket.sourceRowCount += 1;
    bucket.sourceKeys.add(rawKey);

    grouped.set(resolvedKey, bucket);
  }

  const rows = Array.from(grouped.values())
    .map((item) => ({
      articleKey: item.articleKey,
      stockWarehouse: Number(item.stockWarehouse.toFixed(2)),
      accepted: Number(item.accepted.toFixed(2)),
      shippedOzon: Number(item.shippedOzon.toFixed(2)),
      shippedWB: Number(item.shippedWB.toFixed(2)),
      sourceKeys: Array.from(item.sourceKeys).sort((left, right) => left.localeCompare(right, 'ru')),
      sourceRowCount: item.sourceRowCount
    }))
    .sort((left, right) => left.articleKey.localeCompare(right.articleKey, 'ru'));

  const summary = rows.reduce((acc, row) => {
    acc.stockWarehouse += row.stockWarehouse;
    acc.accepted += row.accepted;
    acc.shippedOzon += row.shippedOzon;
    acc.shippedWB += row.shippedWB;
    return acc;
  }, {
    stockWarehouse: 0,
    accepted: 0,
    shippedOzon: 0,
    shippedWB: 0
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceUrl: options.sourceUrl,
    sourceWorkbook: options.sourceWorkbook,
    sourceSheet: options.sourceSheet,
    sourceFormat: 'google-csv-export',
    sheetName: sheetName || options.sourceSheet,
    matchField: DEFAULT_MATCH_FIELD,
    sheetRowCount: Array.isArray(sheetRows) ? sheetRows.length : 0,
    matchedRowCount,
    matchedSkuCount: rows.length,
    unmatchedSourceKeys,
    summary: {
      stockWarehouse: Number(summary.stockWarehouse.toFixed(2)),
      accepted: Number(summary.accepted.toFixed(2)),
      shippedOzon: Number(summary.shippedOzon.toFixed(2)),
      shippedWB: Number(summary.shippedWB.toFixed(2))
    },
    rows
  };
}

function resolveOptions(argv) {
  return {
    sourceUrl: argv['source-url'] || process.env.ALTEA_WAREHOUSE_STOCK_SHEET_URL || DEFAULT_SOURCE_URL,
    sourceWorkbook: argv['source-workbook'] || process.env.ALTEA_WAREHOUSE_STOCK_WORKBOOK || DEFAULT_SOURCE_WORKBOOK,
    sourceSheet: argv['source-sheet'] || process.env.ALTEA_WAREHOUSE_STOCK_SHEET || DEFAULT_SOURCE_SHEET,
    baseDataDir: path.resolve(argv['base-data-dir'] || cwdJoin('data')),
    outputDir: argv['output-dir'] ? path.resolve(argv['output-dir']) : ''
  };
}

async function main() {
  const argv = parseArgs(process.argv);
  const options = resolveOptions(argv);
  const inputPath = path.join(options.baseDataDir, 'warehouse_stock_overlay.json');
  const existingPayload = readOptionalJson(inputPath);
  const skus = readOptionalJson(path.join(options.baseDataDir, 'skus.json')) || [];

  let payload;
  try {
    const csvText = await fetchCsvText(options.sourceUrl);
    payload = buildOverlayPayload(csvText, options, skus, existingPayload);
  } catch (error) {
    if (existingPayload && Array.isArray(existingPayload.rows) && existingPayload.rows.length) {
      console.warn(`[warehouse-stock] ${error.message}`);
      console.warn('[warehouse-stock] keeping existing warehouse_stock_overlay.json');
      console.log(JSON.stringify({
        reusedExisting: true,
        generatedAt: existingPayload.generatedAt || '',
        matchedSkuCount: Array.isArray(existingPayload.rows) ? existingPayload.rows.length : 0
      }, null, 2));
      return;
    }
    throw error;
  }

  if (!Array.isArray(payload.rows) || !payload.rows.length) {
    if (existingPayload && Array.isArray(existingPayload.rows) && existingPayload.rows.length) {
      console.warn('[warehouse-stock] fresh sheet produced zero matched rows; keeping existing overlay');
      console.log(JSON.stringify({
        reusedExisting: true,
        generatedAt: existingPayload.generatedAt || '',
        matchedSkuCount: Array.isArray(existingPayload.rows) ? existingPayload.rows.length : 0
      }, null, 2));
      return;
    }
    throw new Error('warehouse stock sheet returned zero matched rows and no existing overlay was available');
  }

  const written = [];
  written.push(...writeOverlayArtifacts(options.baseDataDir, payload));
  if (options.outputDir && path.resolve(options.outputDir) !== path.resolve(options.baseDataDir)) {
    written.push(...writeOverlayArtifacts(options.outputDir, payload));
  }

  console.log(JSON.stringify({
    generatedAt: payload.generatedAt,
    matchedSkuCount: payload.matchedSkuCount,
    matchedRowCount: payload.matchedRowCount,
    sheetRowCount: payload.sheetRowCount,
    summary: payload.summary,
    written
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
