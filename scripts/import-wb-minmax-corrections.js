#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { normalizeKey } = require('./smart-price-contour');

const ROOT = process.cwd();
const DEFAULT_SOURCE_DIR = path.join(process.env.USERPROFILE || '', 'Downloads', 'Telegram Desktop');
const DEFAULT_REPORT_PATH = path.join(ROOT, '.codex-temp-wb-minmax-import-report.json');

const TARGETS = [
  { file: path.join(ROOT, 'data', 'smart_price_workbench.json'), platform: 'wb', shape: 'platformRows' },
  { file: path.join(ROOT, 'data', 'smart_price_overlay.json'), platform: 'wb', shape: 'platformRows', materializeMissing: true },
  { file: path.join(ROOT, 'data', 'prices.json'), platform: 'wb', shape: 'platformRows', materializeMissing: true },
  { file: path.join(ROOT, 'data', 'price_workbench_support.json'), platform: 'wb', shape: 'platformRows' },
  { file: path.join(ROOT, 'data', 'price_workbench_support.compact.json'), platform: 'wb', shape: 'objectRows', format: 'compact' },
  { file: path.join(ROOT, 'data', 'price_workbench_support.dashboard-compact.json'), platform: 'wb', shape: 'objectRows', format: 'compact' },
  { file: path.join(ROOT, 'data', 'price_workbench_support.minified.full.json'), platform: 'wb', shape: 'objectRows', format: 'compact' }
];

const SOURCE_FILES = [
  path.join(ROOT, 'data', 'prices.json'),
  path.join(ROOT, 'data', 'smart_price_overlay.json'),
  path.join(ROOT, 'data', 'smart_price_workbench.json'),
  path.join(ROOT, 'data', 'price_workbench_support.json'),
  path.join(ROOT, 'data', 'price_workbench_support.compact.json'),
  path.join(ROOT, 'data', 'price_workbench_support.minified.full.json')
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const value = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = value;
  }
  return args;
}

function findDefaultWorkbook() {
  if (!fs.existsSync(DEFAULT_SOURCE_DIR)) {
    throw new Error(`Default source directory not found: ${DEFAULT_SOURCE_DIR}`);
  }
  const candidates = fs.readdirSync(DEFAULT_SOURCE_DIR)
    .filter((name) => /\.xlsx$/i.test(name) && /27,05/i.test(name))
    .map((name) => path.join(DEFAULT_SOURCE_DIR, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  if (!candidates.length) {
    throw new Error(`No *27,05*.xlsx workbook found in ${DEFAULT_SOURCE_DIR}`);
  }
  return candidates[0];
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = String(value || '').replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function headerIndex(headers, fallbackIndex, patterns) {
  const index = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
  return index >= 0 ? index : fallbackIndex;
}

function readCorrections(workbookPath) {
  const workbook = xlsx.readFile(workbookPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headers = (rows[0] || []).map((value) => String(value || '').trim());
  const vendorIndex = headerIndex(headers, 0, [/^vendor\s*code$/i, /^vendorcode$/i, /article/i]);
  const minIndex = headerIndex(headers, 1, [/min/i, /\u043c\u0438\u043d/i]);
  const maxIndex = headerIndex(headers, 2, [/max/i, /\u043c\u0430\u043a\u0441/i]);
  const parsedRows = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const vendorCode = String(row[vendorIndex] || '').trim();
    if (!vendorCode) continue;
    const minPrice = parseNumber(row[minIndex]);
    const maxPrice = parseNumber(row[maxIndex]);
    if (minPrice === null || maxPrice === null) continue;
    parsedRows.push({
      rowNumber: index + 1,
      vendorCode,
      exactKey: vendorCode.toLowerCase(),
      normalizedKey: normalizeKey(vendorCode),
      minPrice,
      maxPrice
    });
  }

  const exact = new Map();
  const normalized = new Map();
  const duplicateExact = [];
  const duplicateNormalized = [];

  parsedRows.forEach((row) => {
    if (exact.has(row.exactKey)) duplicateExact.push([exact.get(row.exactKey), row]);
    exact.set(row.exactKey, row);
    const list = normalized.get(row.normalizedKey) || [];
    list.push(row);
    normalized.set(row.normalizedKey, list);
  });

  normalized.forEach((list) => {
    if (list.length > 1) duplicateNormalized.push(list);
  });

  return { parsedRows, exact, normalized, duplicateExact, duplicateNormalized };
}

function candidateKeys(row, objectKey) {
  return [
    objectKey,
    row?.articleKey,
    row?.article,
    row?.vendorCode,
    row?.sku,
    row?.id,
    row?.key
  ].filter((value) => value !== undefined && value !== null && String(value).trim());
}

function resolveCorrection(row, objectKey, corrections) {
  const candidates = candidateKeys(row, objectKey);
  for (const candidate of candidates) {
    const hit = corrections.exact.get(String(candidate).trim().toLowerCase());
    if (hit) return { hit, matchType: 'exact', matchedBy: String(candidate) };
  }
  for (const candidate of candidates) {
    const normalized = normalizeKey(candidate);
    const list = corrections.normalized.get(normalized) || [];
    if (list.length === 1) {
      return { hit: list[0], matchType: 'normalized', matchedBy: String(candidate) };
    }
  }
  return null;
}

function assignPrice(row, correction, sourceName, importedAt) {
  const previous = {
    minPrice: row.minPrice ?? null,
    maxPrice: row.maxPrice ?? null,
    workingZoneFrom: row.workingZoneFrom ?? null,
    workingZoneTo: row.workingZoneTo ?? null,
    manualMinPrice: row.manualMinPrice ?? null,
    manualMaxPrice: row.manualMaxPrice ?? null,
    minMaxSource: row.minMaxSource ?? null,
    minMaxImportedAt: row.minMaxImportedAt ?? null
  };
  const changed = previous.minPrice !== correction.minPrice
    || previous.maxPrice !== correction.maxPrice
    || previous.workingZoneFrom !== correction.minPrice
    || previous.workingZoneTo !== correction.maxPrice
    || previous.manualMinPrice !== correction.minPrice
    || previous.manualMaxPrice !== correction.maxPrice
    || previous.minMaxSource !== sourceName;

  if (!changed) return false;

  row.minMaxPrevious = previous;
  row.minPrice = correction.minPrice;
  row.maxPrice = correction.maxPrice;
  row.workingZoneFrom = correction.minPrice;
  row.workingZoneTo = correction.maxPrice;
  row.manualMinPrice = correction.minPrice;
  row.manualMaxPrice = correction.maxPrice;
  row.minMaxSource = sourceName;
  row.minMaxImportedAt = importedAt;
  return true;
}

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function rowsForTarget(payload, target) {
  const bucket = payload?.platforms?.[target.platform];
  const rows = bucket?.rows;
  if (!rows) return [];
  if (Array.isArray(rows)) {
    return rows.map((row, index) => ({ row, objectKey: '', index }));
  }
  if (typeof rows === 'object') {
    return Object.entries(rows).map(([objectKey, row], index) => ({ row, objectKey, index }));
  }
  return [];
}

function platformRowEntries(payload = {}, platform = 'wb') {
  const rows = payload?.platforms?.[platform]?.rows;
  if (!rows) return [];
  if (Array.isArray(rows)) return rows.map((row) => ({ row, objectKey: '' }));
  if (typeof rows === 'object') {
    return Object.entries(rows).map(([objectKey, row]) => ({ row, objectKey }));
  }
  return [];
}

function addSource(index, row, objectKey, platform, sourceFile) {
  const keys = candidateKeys(row, objectKey);
  keys.forEach((key) => {
    const exactKey = String(key).trim().toLowerCase();
    const normalizedKey = normalizeKey(key);
    if (!exactKey) return;
    const source = { row, objectKey, platform, sourceFile };
    const exactList = index.exact.get(exactKey) || [];
    exactList.push(source);
    index.exact.set(exactKey, exactList);
    if (normalizedKey) {
      const normalizedList = index.normalized.get(normalizedKey) || [];
      normalizedList.push(source);
      index.normalized.set(normalizedKey, normalizedList);
    }
  });
}

function buildSourceIndex() {
  const index = { exact: new Map(), normalized: new Map() };
  SOURCE_FILES.forEach((filePath) => {
    const payload = readJsonIfExists(filePath);
    if (!payload?.platforms) return;
    Object.keys(payload.platforms).forEach((platform) => {
      platformRowEntries(payload, platform).forEach(({ row, objectKey }) => {
        addSource(index, row, objectKey, platform, path.relative(ROOT, filePath));
      });
    });
  });
  return index;
}

function sourceScore(source, platform) {
  if (!source) return 0;
  let score = source.platform === platform ? 100 : 10;
  const name = path.basename(source.sourceFile || '');
  if (source.platform === platform && name === 'prices.json') score += 20;
  if (source.platform === platform && name === 'smart_price_overlay.json') score += 15;
  if (source.platform === platform && name === 'smart_price_workbench.json') score += 12;
  if (source.row?.name) score += 3;
  if (source.row?.owner) score += 2;
  if (Number(source.row?.currentPrice) > 0 || Number(source.row?.currentFillPrice) > 0) score += 1;
  return score;
}

function chooseBestSource(sources = [], platform = 'wb') {
  return sources
    .filter(Boolean)
    .sort((left, right) => sourceScore(right, platform) - sourceScore(left, platform))[0] || null;
}

function sourceForCorrection(correction, sourceIndex, platform) {
  const exactSources = sourceIndex.exact.get(correction.exactKey) || [];
  const exact = chooseBestSource(exactSources, platform);
  if (exact) return { ...exact, matchType: 'materialized-exact', matchedBy: correction.vendorCode };

  const normalizedSources = sourceIndex.normalized.get(correction.normalizedKey) || [];
  if (normalizedSources.length === 1) {
    return { ...normalizedSources[0], matchType: 'materialized-normalized', matchedBy: correction.vendorCode };
  }

  if (/^wb[a-zа-я0-9]/i.test(correction.vendorCode)) {
    const withoutPrefix = correction.vendorCode.replace(/^wb/i, '');
    const prefixedSource = chooseBestSource(sourceIndex.exact.get(withoutPrefix.toLowerCase()) || [], platform);
    if (prefixedSource) {
      return { ...prefixedSource, matchType: 'materialized-wb-prefix', matchedBy: withoutPrefix };
    }
  }

  return null;
}

function positiveNumber(...values) {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function buildMaterializedRow(correction, source, target, sourceName, importedAt) {
  const row = source?.row || {};
  const samePlatform = source?.platform === target.platform;
  const currentPrice = samePlatform
    ? positiveNumber(row.currentFillPrice, row.currentPrice, row.price)
    : null;
  const currentClientPrice = samePlatform
    ? positiveNumber(row.currentClientPrice, row.buyerPrice, row.clientPrice, currentPrice)
    : null;
  const generatedDate = dateOnly(importedAt);
  const result = {
    articleKey: correction.vendorCode,
    article: correction.vendorCode,
    name: row.name || '',
    owner: row.owner || '',
    platform: target.platform,
    marketplace: target.platform,
    status: row.status || row.productStatus || '',
    sourceMode: samePlatform ? (row.sourceMode || `${target.platform}-minmax-import`) : `${target.platform}-minmax-import`,
    sourceSheet: sourceName,
    valueDate: samePlatform ? (row.valueDate || row.currentPriceDate || row.historyFreshnessDate || generatedDate) : generatedDate,
    currentPriceDate: samePlatform ? (row.currentPriceDate || row.valueDate || row.historyFreshnessDate || generatedDate) : generatedDate,
    historyFreshnessDate: samePlatform ? (row.historyFreshnessDate || row.currentPriceDate || row.valueDate || generatedDate) : generatedDate,
    currentFillPrice: currentPrice,
    currentPrice,
    currentClientPrice,
    currentSppPct: samePlatform ? (row.currentSppPct ?? null) : null,
    currentTurnoverDays: samePlatform ? (row.currentTurnoverDays ?? null) : null,
    minPrice: correction.minPrice,
    maxPrice: correction.maxPrice,
    hardMinPrice: samePlatform ? (row.hardMinPrice ?? null) : null,
    workingZoneFrom: correction.minPrice,
    workingZoneTo: correction.maxPrice,
    basePrice: samePlatform ? (row.basePrice ?? null) : null,
    daily: samePlatform && Array.isArray(row.daily) ? row.daily : [],
    manualMinPrice: correction.minPrice,
    manualMaxPrice: correction.maxPrice,
    minMaxSource: sourceName,
    minMaxImportedAt: importedAt,
    minMaxMaterialized: true,
    minMaxMaterializedFrom: source?.sourceFile || '',
    minMaxMaterializedMatchType: source?.matchType || 'materialized-empty'
  };

  return result;
}

function rowContainer(payload, target) {
  const bucket = payload?.platforms?.[target.platform];
  const rows = bucket?.rows;
  if (Array.isArray(rows)) return rows;
  return null;
}

function writeJson(filePath, value, format = 'pretty') {
  const text = format === 'compact'
    ? JSON.stringify(value)
    : `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, text, 'utf8');
}

function updateTarget(target, corrections, sourceName, importedAt, sourceIndex) {
  if (!fs.existsSync(target.file)) {
    if (target.optional) {
      return { file: target.file, skipped: true, reason: 'missing optional file' };
    }
    throw new Error(`Target file not found: ${target.file}`);
  }

  const payload = JSON.parse(fs.readFileSync(target.file, 'utf8'));
  const entries = rowsForTarget(payload, target);
  const matchedVendorCodes = new Set();
  const matchedRows = [];
  let changedRows = 0;
  let materializedRows = 0;

  entries.forEach(({ row, objectKey }) => {
    const resolved = resolveCorrection(row, objectKey, corrections);
    if (!resolved) return;
    matchedVendorCodes.add(resolved.hit.vendorCode);
    const changed = assignPrice(row, resolved.hit, sourceName, importedAt);
    if (changed) changedRows += 1;
    matchedRows.push({
      articleKey: row.articleKey || row.article || objectKey || '',
      vendorCode: resolved.hit.vendorCode,
      matchType: resolved.matchType,
      matchedBy: resolved.matchedBy,
      minPrice: resolved.hit.minPrice,
      maxPrice: resolved.hit.maxPrice,
      changed
    });
  });

  const rows = rowContainer(payload, target);
  if (target.materializeMissing && rows) {
    corrections.parsedRows.forEach((correction) => {
      if (matchedVendorCodes.has(correction.vendorCode)) return;
      const source = sourceForCorrection(correction, sourceIndex, target.platform);
      const newRow = buildMaterializedRow(correction, source, target, sourceName, importedAt);
      rows.push(newRow);
      matchedVendorCodes.add(correction.vendorCode);
      materializedRows += 1;
      matchedRows.push({
        articleKey: newRow.articleKey,
        vendorCode: correction.vendorCode,
        matchType: source?.matchType || 'materialized-empty',
        matchedBy: source?.matchedBy || '',
        minPrice: correction.minPrice,
        maxPrice: correction.maxPrice,
        changed: true,
        materialized: true
      });
    });
  }

  if (changedRows > 0 || materializedRows > 0) {
    payload.minMaxImportAppliedAt = importedAt;
    payload.minMaxImportSource = sourceName;
    if (/smart_price_workbench|smart_price_overlay|prices/i.test(path.basename(target.file))) {
      payload.generatedAt = importedAt;
    }
    writeJson(target.file, payload, target.format);
  }

  const missingVendorCodes = corrections.parsedRows
    .map((row) => row.vendorCode)
    .filter((vendorCode) => !matchedVendorCodes.has(vendorCode));

  return {
    file: path.relative(ROOT, target.file),
    rowsSeen: entries.length,
    matchedRows: matchedRows.length,
    changedRows,
    materializedRows,
    missingVendorCodes,
    matchedSample: matchedRows.slice(0, 10)
  };
}

function main() {
  const args = parseArgs(process.argv);
  const workbookPath = path.resolve(args['input-file'] || findDefaultWorkbook());
  const reportPath = path.resolve(args['report-file'] || DEFAULT_REPORT_PATH);
  const sourceName = path.basename(workbookPath);
  const importedAt = new Date().toISOString();
  const corrections = readCorrections(workbookPath);
  const sourceIndex = buildSourceIndex();
  const reports = TARGETS.map((target) => updateTarget(target, corrections, sourceName, importedAt, sourceIndex));
  const report = {
    workbookPath,
    sourceName,
    importedAt,
    correctionRows: corrections.parsedRows.length,
    uniqueNormalizedRows: corrections.normalized.size,
    duplicateExact: corrections.duplicateExact.map((pair) => pair.map((row) => row.vendorCode)),
    duplicateNormalized: corrections.duplicateNormalized.map((list) => list.map((row) => row.vendorCode)),
    targets: reports
  };

  writeJson(reportPath, report);
  console.log(JSON.stringify({
    workbookPath,
    correctionRows: report.correctionRows,
    uniqueNormalizedRows: report.uniqueNormalizedRows,
    duplicateNormalized: report.duplicateNormalized,
    targets: reports.map((item) => ({
      file: item.file,
      skipped: item.skipped || false,
      rowsSeen: item.rowsSeen,
      matchedRows: item.matchedRows,
      changedRows: item.changedRows,
      materializedRows: item.materializedRows,
      missingCount: item.missingVendorCodes ? item.missingVendorCodes.length : undefined
    })),
    reportPath
  }, null, 2));
}

if (require.main === module) {
  main();
}
