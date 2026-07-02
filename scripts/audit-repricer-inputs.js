const fs = require('fs');
const path = require('path');
const {
  mergeSmartPriceContour,
  safeReadJson
} = require('./smart-price-contour');

const ROOT = process.cwd();
const TODAY = new Date().toISOString().slice(0, 10);
const EXPORT_DIR = path.join(ROOT, 'exports');

const FILES = {
  workbench: path.join(ROOT, 'data', 'smart_price_workbench.json'),
  overlay: path.join(ROOT, 'data', 'smart_price_overlay.json'),
  liveWorkbench: path.join(ROOT, 'tmp-smart_price_workbench-live.json'),
  prices: path.join(ROOT, 'data', 'prices.json'),
  support: path.join(ROOT, 'data', 'price_workbench_support.json'),
  repricer: path.join(ROOT, 'data', 'repricer.json'),
  skus: path.join(ROOT, 'data', 'skus.json')
};

function rows(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-zа-я0-9]+/gi, '');
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function numberOrZero(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstPositive(...values) {
  for (const value of values) {
    const numeric = numberOrZero(value);
    if (numeric > 0) return numeric;
  }
  return 0;
}

function mapRows(sourceRows) {
  const map = new Map();
  rows(sourceRows).forEach((row) => {
    [
      row?.articleKey,
      row?.article,
      row?.sku,
      row?.offerId,
      row?.marketArticleId
    ].map(normalizeKey).forEach((key) => {
      if (key && !map.has(key)) map.set(key, row);
    });
  });
  return map;
}

function platformMap(payload, platform) {
  const bucket = payload?.platforms?.[platform] || {};
  return mapRows(bucket.rows || bucket.items || bucket.byArticle || bucket.articles);
}

function skuMap(skus) {
  const map = new Map();
  rows(skus).forEach((row) => {
    [row?.articleKey, row?.article, row?.sku].map(normalizeKey).forEach((key) => {
      if (key && !map.has(key)) map.set(key, row);
    });
  });
  return map;
}

function legacyMap(payload) {
  return mapRows(payload?.rows || []);
}

function currentInputs(sourceRow, priceRow, supportRow, skuSide, legacySide, liveSide, includeSnapshot, includeLegacy) {
  return [
    sourceRow?.currentFillPrice,
    sourceRow?.currentPrice,
    includeSnapshot ? priceRow?.currentPrice : null,
    supportRow?.currentExportPrice,
    skuSide?.currentPrice,
    includeLegacy ? legacySide?.currentPrice : null,
    liveSide?.currentPrice
  ];
}

function floorInputs(sourceRow, priceRow, supportRow, skuSide, legacySide, liveSide, includeSnapshot, includeLegacy) {
  return [
    sourceRow?.hardMinPrice,
    sourceRow?.requiredPriceForProfitability,
    sourceRow?.minPrice,
    sourceRow?.workingZoneFrom,
    supportRow?.hardMinPrice,
    supportRow?.requiredPriceForProfitability,
    supportRow?.historicalMinProfitablePrice,
    supportRow?.minPrice,
    supportRow?.workingZoneFrom,
    skuSide?.minPrice,
    includeSnapshot ? priceRow?.minPrice : null,
    includeLegacy ? legacySide?.minPrice : null,
    includeLegacy ? legacySide?.workingZoneFrom : null,
    includeLegacy ? legacySide?.requiredPriceForProfitability : null,
    liveSide?.minPrice
  ];
}

function floorValue(values) {
  return Math.max(...values.map(numberOrZero), 0);
}

function sourceFlags(sourceRow, priceRow, supportRow, legacySide) {
  return {
    has_source_price: [sourceRow?.currentFillPrice, sourceRow?.currentPrice].some(hasValue),
    has_source_floor: [sourceRow?.hardMinPrice, sourceRow?.requiredPriceForProfitability, sourceRow?.minPrice, sourceRow?.workingZoneFrom].some(hasValue),
    has_prices_row: Boolean(priceRow),
    has_prices_price: hasValue(priceRow?.currentPrice),
    has_prices_floor: hasValue(priceRow?.minPrice),
    has_support_row: Boolean(supportRow),
    has_support_floor: [supportRow?.hardMinPrice, supportRow?.requiredPriceForProfitability, supportRow?.historicalMinProfitablePrice, supportRow?.minPrice, supportRow?.workingZoneFrom].some(hasValue),
    has_legacy_price: hasValue(legacySide?.currentPrice),
    has_legacy_floor: [legacySide?.minPrice, legacySide?.workingZoneFrom, legacySide?.requiredPriceForProfitability].some(hasValue)
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(filePath, dataRows) {
  const columns = [
    'platform',
    'article_key',
    'article',
    'name',
    'status',
    'problem',
    'current_price',
    'floor',
    'fixed_by_prices',
    'fixed_by_legacy',
    'has_source_price',
    'has_source_floor',
    'has_prices_price',
    'has_prices_floor',
    'has_support_floor',
    'has_legacy_price',
    'has_legacy_floor',
    'source_mode'
  ];
  const lines = [
    columns.join(','),
    ...dataRows.map((row) => columns.map((column) => csvCell(row[column])).join(','))
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function buildAudit() {
  const workbench = safeReadJson(FILES.workbench, { generatedAt: '', platforms: {} });
  const overlay = safeReadJson(FILES.overlay, { generatedAt: '', platforms: {} });
  const liveWorkbench = safeReadJson(FILES.liveWorkbench, { generatedAt: '', platforms: {} });
  const prices = safeReadJson(FILES.prices, { generatedAt: '', platforms: {} });
  const support = safeReadJson(FILES.support, { generatedAt: '', platforms: {} });
  const repricer = safeReadJson(FILES.repricer, { generatedAt: '', rows: [] });
  const skus = safeReadJson(FILES.skus, []);
  const merged = mergeSmartPriceContour(workbench || {}, overlay || {}, liveWorkbench || {});

  const skuFacts = skuMap(skus);
  const legacy = legacyMap(repricer);
  const details = [];
  const summary = {};

  ['wb', 'ozon'].forEach((platform) => {
    const priceRows = platformMap(prices, platform);
    const supportRows = platformMap(support, platform);
    const platformRows = rows(merged?.platforms?.[platform]?.rows);
    summary[platform] = {
      rows: platformRows.length,
      gate_without_snapshot: 0,
      gate_after_prices: 0,
      gate_after_legacy: 0,
      fixed_by_prices: 0,
      fixed_by_legacy: 0,
      below_min_after_fallback: 0
    };

    platformRows.forEach((sourceRow) => {
      const key = normalizeKey(sourceRow?.articleKey || sourceRow?.article);
      const priceRow = priceRows.get(key) || null;
      const supportRow = supportRows.get(key) || null;
      const skuFact = skuFacts.get(key) || null;
      const skuSide = skuFact?.[platform] || null;
      const legacyRow = legacy.get(key) || null;
      const legacySide = legacyRow?.[platform] || null;
      const liveSide = null;

      const currentBase = currentInputs(sourceRow, priceRow, supportRow, skuSide, legacySide, liveSide, false, false);
      const floorBase = floorInputs(sourceRow, priceRow, supportRow, skuSide, legacySide, liveSide, false, false);
      const currentPrices = currentInputs(sourceRow, priceRow, supportRow, skuSide, legacySide, liveSide, true, false);
      const floorPrices = floorInputs(sourceRow, priceRow, supportRow, skuSide, legacySide, liveSide, true, false);
      const currentLegacy = currentInputs(sourceRow, priceRow, supportRow, skuSide, legacySide, liveSide, true, true);
      const floorLegacy = floorInputs(sourceRow, priceRow, supportRow, skuSide, legacySide, liveSide, true, true);

      const gateBase = !currentBase.some(hasValue) || !floorBase.some(hasValue);
      const gatePrices = !currentPrices.some(hasValue) || !floorPrices.some(hasValue);
      const gateLegacy = !currentLegacy.some(hasValue) || !floorLegacy.some(hasValue);
      const fixedByPrices = gateBase && !gatePrices;
      const fixedByLegacy = gatePrices && !gateLegacy;
      const currentPrice = firstPositive(...currentLegacy);
      const floor = floorValue(floorLegacy);
      const belowMin = currentPrice > 0 && floor > 0 && currentPrice + 0.001 < floor;

      if (gateBase) summary[platform].gate_without_snapshot += 1;
      if (gatePrices) summary[platform].gate_after_prices += 1;
      if (gateLegacy) summary[platform].gate_after_legacy += 1;
      if (fixedByPrices) summary[platform].fixed_by_prices += 1;
      if (fixedByLegacy) summary[platform].fixed_by_legacy += 1;
      if (belowMin) summary[platform].below_min_after_fallback += 1;

      if (!gateLegacy && !belowMin && !gateBase) return;

      const problem = [
        gateBase ? 'gate_without_snapshot' : '',
        gatePrices ? 'gate_after_prices' : '',
        gateLegacy ? 'gate_after_legacy' : '',
        belowMin ? 'below_min_after_fallback' : ''
      ].filter(Boolean).join('; ');
      details.push({
        platform,
        article_key: sourceRow?.articleKey || sourceRow?.article || key,
        article: sourceRow?.article || sourceRow?.articleKey || '',
        name: sourceRow?.name || priceRow?.name || supportRow?.name || legacyRow?.name || '',
        status: sourceRow?.status || supportRow?.repricerStatus || supportRow?.productStatus || legacyRow?.status || '',
        problem,
        current_price: currentPrice || '',
        floor: floor || '',
        fixed_by_prices: fixedByPrices ? 'yes' : 'no',
        fixed_by_legacy: fixedByLegacy ? 'yes' : 'no',
        ...sourceFlags(sourceRow, priceRow, supportRow, legacySide),
        source_mode: sourceRow?.sourceMode || priceRow?.sourceMode || legacySide?.sourceMode || ''
      });
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    files: Object.fromEntries(Object.entries(FILES).map(([key, filePath]) => [key, path.relative(ROOT, filePath)])),
    summary,
    details
  };
}

function main() {
  const audit = buildAudit();
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const csvPath = path.join(EXPORT_DIR, `repricer_input_audit_${TODAY}.csv`);
  const jsonPath = path.join(EXPORT_DIR, `repricer_input_audit_${TODAY}.summary.json`);
  writeCsv(csvPath, audit.details);
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: audit.generatedAt,
    files: audit.files,
    summary: audit.summary,
    detailRows: audit.details.length
  }, null, 2), 'utf8');
  process.stdout.write(JSON.stringify({
    csv: path.relative(ROOT, csvPath),
    summary: path.relative(ROOT, jsonPath),
    metrics: audit.summary,
    detailRows: audit.details.length
  }, null, 2));
}

main();
