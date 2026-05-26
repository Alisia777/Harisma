#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OWNER_CANONICAL_NAMES = new Map([
  ['алексей', 'Алексей'],
  ['александр', 'Александр Озон'],
  ['анна', 'Анна'],
  ['артем', 'Александр Озон'],
  ['артём', 'Александр Озон'],
  ['дарья', 'Даша'],
  ['даша', 'Даша'],
  ['екатерина', 'Екатерина'],
  ['кирилл', 'Кирилл'],
  ['ксения', 'Ксения'],
  ['максим', 'Максим'],
  ['мария', 'Мария'],
  ['олеся', 'Олеся'],
  ['светлана', 'Светлана']
]);

const OWNER_NAME_ALIASES = new Map([
  ['александр озон', 'Александр Озон'],
  ['анна пирогова', 'Анна'],
  ['екатерина доброжирова', 'Екатерина'],
  ['екатерина доможирова', 'Екатерина'],
  ['васильева мария', 'Мария'],
  ['лапыгин максим', 'Максим'],
  ['максим лапыгин', 'Максим'],
  ['мария васильева', 'Мария'],
  ['мария васильевна', 'Мария'],
  ['олеся савинова', 'Олеся']
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function writeGzip(filePath, payload) {
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
  fs.writeFileSync(filePath, zlib.gzipSync(buffer));
}

function fileMeta(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      filePath,
      mtime: stat.mtime.toISOString(),
      size: stat.size
    };
  } catch {
    return {
      filePath,
      mtime: '',
      size: 0
    };
  }
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function numberOrZero(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOwnerToken(value = '') {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalOwnerName(value = '') {
  const normalized = normalizeOwnerToken(value);
  if (!normalized) return '';
  const lowered = normalized.toLowerCase();
  if (OWNER_NAME_ALIASES.has(lowered)) return OWNER_NAME_ALIASES.get(lowered);
  if (OWNER_CANONICAL_NAMES.has(lowered)) return OWNER_CANONICAL_NAMES.get(lowered);
  const [firstToken = ''] = normalized.split(' ');
  const firstTokenLowered = firstToken.toLowerCase();
  if (OWNER_CANONICAL_NAMES.has(firstTokenLowered)) return OWNER_CANONICAL_NAMES.get(firstTokenLowered);
  return normalized;
}

function normalizePlatform(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'wildberries' || normalized === 'wb') return 'wb';
  if (normalized === 'ozon' || normalized === 'oz') return 'ozon';
  if (normalized === 'ym' || normalized === 'ya' || normalized === 'yandex' || normalized === 'я.маркет') return 'ym';
  return '';
}

function platformLabel(platform) {
  if (platform === 'wb') return 'WB';
  if (platform === 'ozon') return 'Ozon';
  if (platform === 'ym') return 'Я.Маркет';
  return platform;
}

function skuOwnerForPlatform(sku, platform = '') {
  const byPlatform = sku?.ownersByPlatform || sku?.owner?.byPlatform || {};
  const platformOwner = platform === 'ym'
    ? (byPlatform.ym || byPlatform.ya || '')
    : (byPlatform[platform] || '');
  return canonicalOwnerName(platformOwner || sku?.owner?.name || '');
}

function planMonthField(anchorDate) {
  const raw = String(anchorDate || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(raw)) return '';
  return `plan${raw.replace('-', '')}Units`;
}

function projectedUnits(avgDaily, days) {
  if (!(avgDaily > 0) || !(days > 0)) return 0;
  return Number((avgDaily * days).toFixed(2));
}

function projectedNeed(avgDaily, stock, days) {
  if (!(avgDaily > 0) || !(days > 0)) return 0;
  return Math.max(0, Math.ceil((avgDaily * days) - numberOrZero(stock)));
}

function hasOwnMetric(row, key) {
  if (!row || !Object.prototype.hasOwnProperty.call(row, key)) return false;
  const value = row[key];
  return value !== null && value !== undefined && value !== '';
}

function isSkuTurnoverFallback(row) {
  const source = String(row?.demandSource || row?.sourceValue || '').trim().toLowerCase();
  return row?.demandReliable === false || source === 'sku-turnover';
}

function buildRow(sourceRow, sku, monthField) {
  const platform = normalizePlatform(sourceRow?.platform);
  if (!platform || platform === 'ym') return null;

  const article = normalizeText(sourceRow?.articleKey || sourceRow?.article || sourceRow?.sku);
  if (!article) return null;

  const avgDaily = numberOrZero(sourceRow?.avgDaily);
  const inStock = numberOrZero(sourceRow?.inStock);
  const planMonth = numberOrNull(sourceRow?.planMonth ?? sku?.planFact?.[monthField]);
  const skuTurnoverFallback = isSkuTurnoverFallback(sourceRow);
  const metricOrProjected = (key, days, projector) => {
    if (hasOwnMetric(sourceRow, key)) return numberOrZero(sourceRow[key]);
    return skuTurnoverFallback ? null : projector(avgDaily, days);
  };

  return {
    platform: platformLabel(platform),
    place: normalizeText(sourceRow?.place) || 'Без кластера',
    article,
    name: normalizeText(sourceRow?.name || sku?.name || article) || article,
    owner: skuOwnerForPlatform(sku, platform),
    inStock,
    inTransit: numberOrZero(sourceRow?.inTransit),
    inRequest: numberOrZero(sourceRow?.inRequest),
    avgDaily,
    turnoverDays: numberOrNull(sourceRow?.turnoverDays),
    sourceValue: normalizeText(sourceRow?.sourceValue),
    demandSource: normalizeText(sourceRow?.demandSource || sourceRow?.sourceValue),
    demandReliable: !skuTurnoverFallback,
    sales7: metricOrProjected('sales7', 7, projectedUnits),
    sales14: metricOrProjected('sales14', 14, projectedUnits),
    sales28: metricOrProjected('sales28', 28, projectedUnits),
    targetNeed7: metricOrProjected('targetNeed7', 7, (daily, days) => projectedNeed(daily, inStock, days)),
    targetNeed14: metricOrProjected('targetNeed14', 14, (daily, days) => projectedNeed(daily, inStock, days)),
    targetNeed28: metricOrProjected('targetNeed28', 28, (daily, days) => projectedNeed(daily, inStock, days)),
    planMonth
  };
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const dataDir = path.join(rootDir, 'data');
  const logisticsPath = path.join(dataDir, 'logistics.json');
  const skusPath = path.join(dataDir, 'skus.json');
  const logistics = readJson(logisticsPath);
  const skus = readJson(skusPath);
  const logisticsMeta = fileMeta(logisticsPath);
  const skusMeta = fileMeta(skusPath);
  const skuMap = new Map(
    (Array.isArray(skus) ? skus : [])
      .map((item) => [normalizeKey(item?.articleKey || item?.article), item])
      .filter(([key]) => key)
  );

  const monthField = planMonthField(logistics?.window?.to || logistics?.generatedAt || '');
  const rows = (Array.isArray(logistics?.allRows) ? logistics.allRows : [])
    .map((row) => {
      const sku = skuMap.get(normalizeKey(row?.articleKey || row?.article || row?.sku)) || null;
      return buildRow(row, sku, monthField);
    })
    .filter(Boolean);

  const combinedPayload = {
    generatedAt: logistics?.generatedAt || new Date().toISOString(),
    sourceFreshness: {
      logistics: logistics?.generatedAt || '',
      logisticsFileMtime: logisticsMeta.mtime,
      logisticsFileSize: logisticsMeta.size,
      logisticsRows: Array.isArray(logistics?.allRows) ? logistics.allRows.length : 0,
      skusFileMtime: skusMeta.mtime,
      skusFileSize: skusMeta.size,
      skuRows: Array.isArray(skus) ? skus.length : 0
    },
    window: logistics?.window && typeof logistics.window === 'object'
      ? {
          from: normalizeText(logistics.window.from),
          to: normalizeText(logistics.window.to)
        }
      : {},
    rows
  };

  const wbPayload = {
    generatedAt: combinedPayload.generatedAt,
    sourceFreshness: combinedPayload.sourceFreshness,
    window: combinedPayload.window,
    platform: 'WB',
    rows: rows.filter((row) => normalizePlatform(row.platform) === 'wb')
  };

  const ozonPayload = {
    generatedAt: combinedPayload.generatedAt,
    sourceFreshness: combinedPayload.sourceFreshness,
    window: combinedPayload.window,
    platform: 'Ozon',
    rows: rows.filter((row) => normalizePlatform(row.platform) === 'ozon')
  };

  writeJson(path.join(dataDir, 'order_procurement.json'), combinedPayload);
  writeJson(path.join(dataDir, 'order_procurement_wb.json'), wbPayload);
  writeJson(path.join(dataDir, 'order_procurement_ozon.json'), ozonPayload);
  writeGzip(path.join(dataDir, 'order_procurement_wb.json.gz'), wbPayload);
  writeGzip(path.join(dataDir, 'order_procurement_ozon.json.gz'), ozonPayload);

  console.log(JSON.stringify({
    generatedAt: combinedPayload.generatedAt,
    rows: combinedPayload.rows.length,
    wbRows: wbPayload.rows.length,
    ozonRows: ozonPayload.rows.length
  }, null, 2));
}

main();
