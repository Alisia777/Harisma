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
  ['мария', 'Мария'],
  ['олеся', 'Олеся'],
  ['светлана', 'Светлана']
]);

const OWNER_NAME_ALIASES = new Map([
  ['александр озон', 'Александр Озон'],
  ['анна пирогова', 'Анна'],
  ['екатерина доброжирова', 'Екатерина'],
  ['екатерина доможирова', 'Екатерина'],
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

function buildRow(sourceRow, sku, monthField) {
  const platform = normalizePlatform(sourceRow?.platform);
  if (!platform || platform === 'ym') return null;

  const article = normalizeText(sourceRow?.articleKey || sourceRow?.article || sourceRow?.sku);
  if (!article) return null;

  const avgDaily = numberOrZero(sourceRow?.avgDaily);
  const inStock = numberOrZero(sourceRow?.inStock);
  const planMonth = numberOrNull(sourceRow?.planMonth ?? sku?.planFact?.[monthField]);

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
    sales7: numberOrZero(sourceRow?.sales7 ?? projectedUnits(avgDaily, 7)),
    sales14: numberOrZero(sourceRow?.sales14 ?? projectedUnits(avgDaily, 14)),
    sales28: numberOrZero(sourceRow?.sales28 ?? projectedUnits(avgDaily, 28)),
    targetNeed7: numberOrZero(sourceRow?.targetNeed7 ?? projectedNeed(avgDaily, inStock, 7)),
    targetNeed14: numberOrZero(sourceRow?.targetNeed14 ?? projectedNeed(avgDaily, inStock, 14)),
    targetNeed28: numberOrZero(sourceRow?.targetNeed28 ?? projectedNeed(avgDaily, inStock, 28)),
    planMonth
  };
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const dataDir = path.join(rootDir, 'data');
  const logistics = readJson(path.join(dataDir, 'logistics.json'));
  const skus = readJson(path.join(dataDir, 'skus.json'));
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
    window: combinedPayload.window,
    platform: 'WB',
    rows: rows.filter((row) => normalizePlatform(row.platform) === 'wb')
  };

  const ozonPayload = {
    generatedAt: combinedPayload.generatedAt,
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
