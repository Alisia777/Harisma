#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { canonicalOwnerName } = require('./owner-normalization');

const CANONICAL_ORDER_DAYS = 30;
const LEGACY_COMPAT_DAYS = 28;
const NEED_HORIZONS = [7, 14, LEGACY_COMPAT_DAYS, CANONICAL_ORDER_DAYS];
const BLOCKED_LIFECYCLE_RE = /вывод|на вывод|вывед|снят|снимаем|spa|архив|archive|paused|pause|freeze|hold|под вопрос|question/i;

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

function projectedNeedRaw(avgDaily, available, days, safetyStock = 0) {
  if (!(avgDaily > 0) || !(days > 0)) return 0;
  return Math.ceil((avgDaily * days) + numberOrZero(safetyStock) - numberOrZero(available));
}

function targetNeedFromRaw(rawNeed, blocked = false) {
  if (blocked) return 0;
  return Math.max(0, numberOrZero(rawNeed));
}

function turnoverDays(inStock, avgDaily) {
  return avgDaily > 0 ? Number((numberOrZero(inStock) / avgDaily).toFixed(2)) : null;
}

function lifecycleStatus(sku = {}) {
  const candidates = [
    sku?.status,
    sku?.lifecycleStatus,
    sku?.lifecycle,
    sku?.productLifecycle,
    sku?.registryStatus,
    sku?.owner?.registryStatus
  ].map(normalizeText).filter(Boolean);
  const label = candidates[0] || '';
  return {
    label,
    blocked: candidates.some((item) => BLOCKED_LIFECYCLE_RE.test(item))
  };
}

function buildRow(sourceRow, sku, monthField) {
  const platform = normalizePlatform(sourceRow?.platform);
  if (!platform) return null;

  const article = normalizeText(sourceRow?.articleKey || sourceRow?.article || sourceRow?.sku);
  if (!article) return null;

  const avgDaily = numberOrZero(sourceRow?.avgDaily);
  const inStock = numberOrZero(sourceRow?.inStock);
  const inTransit = numberOrZero(sourceRow?.inTransit);
  const inRequest = numberOrZero(sourceRow?.inRequest);
  const available = inStock + inTransit + inRequest;
  const safetyStock = numberOrZero(sourceRow?.safetyStock);
  const planMonth = numberOrNull(sourceRow?.planMonth ?? sku?.planFact?.[monthField]);
  const lifecycle = lifecycleStatus(sku || {});
  const needs = Object.fromEntries(NEED_HORIZONS.map((days) => {
    const raw = projectedNeedRaw(avgDaily, available, days, safetyStock);
    return [days, { raw, target: targetNeedFromRaw(raw, lifecycle.blocked) }];
  }));

  return {
    platform: platformLabel(platform),
    platformKey: platform,
    place: normalizeText(sourceRow?.place) || 'Без кластера',
    article,
    articleKey: normalizeKey(article),
    name: normalizeText(sourceRow?.name || sku?.name || article) || article,
    owner: skuOwnerForPlatform(sku, platform),
    inStock,
    inTransit,
    inRequest,
    available,
    safetyStock,
    avgDaily,
    turnoverDays: turnoverDays(inStock, avgDaily),
    sales7: projectedUnits(avgDaily, 7),
    sales14: projectedUnits(avgDaily, 14),
    sales28: projectedUnits(avgDaily, LEGACY_COMPAT_DAYS),
    sales30: projectedUnits(avgDaily, CANONICAL_ORDER_DAYS),
    rawNeed7: needs[7].raw,
    rawNeed14: needs[14].raw,
    rawNeed28: needs[LEGACY_COMPAT_DAYS].raw,
    rawNeed30: needs[CANONICAL_ORDER_DAYS].raw,
    targetNeed7: needs[7].target,
    targetNeed14: needs[14].target,
    targetNeed28: needs[LEGACY_COMPAT_DAYS].target,
    targetNeed30: needs[CANONICAL_ORDER_DAYS].target,
    targetHorizonDays: CANONICAL_ORDER_DAYS,
    needFormula: 'max(0, ceil(avgDaily * 30 + safetyStock - (inStock + inTransit + inRequest)))',
    lifecycleStatus: lifecycle.label,
    needSuppressedByLifecycle: lifecycle.blocked,
    planMonth
  };
}

function normalizeExistingYandexRows(payload, skuMap = new Map()) {
  return (Array.isArray(payload?.rows) ? payload.rows : [])
    .map((row) => {
      const articleKey = normalizeKey(row?.articleKey || row?.article || row?.sku);
      const sku = skuMap.get(articleKey) || null;
      const avgDaily = numberOrZero(row?.avgDaily);
      const inStock = numberOrZero(row?.inStock);
      const inTransit = numberOrZero(row?.inTransit);
      const inRequest = numberOrZero(row?.inRequest);
      const available = inStock + inTransit + inRequest;
      const safetyStock = numberOrZero(row?.safetyStock);
      const rawNeed28 = projectedNeedRaw(avgDaily, available, LEGACY_COMPAT_DAYS, safetyStock);
      const rawNeed30 = projectedNeedRaw(avgDaily, available, CANONICAL_ORDER_DAYS, safetyStock);
      return {
        ...row,
        platform: platformLabel('ym'),
        platformKey: 'ym',
        articleKey,
        owner: skuOwnerForPlatform(sku, 'ym') || canonicalOwnerName(row?.owner || ''),
        inStock,
        inTransit,
        inRequest,
        available,
        safetyStock,
        turnoverDays: turnoverDays(inStock, avgDaily),
        sales28: projectedUnits(avgDaily, LEGACY_COMPAT_DAYS),
        sales30: projectedUnits(avgDaily, CANONICAL_ORDER_DAYS),
        rawNeed28,
        rawNeed30,
        targetNeed28: targetNeedFromRaw(rawNeed28),
        targetNeed30: targetNeedFromRaw(rawNeed30),
        targetHorizonDays: CANONICAL_ORDER_DAYS,
        needFormula: 'max(0, ceil(avgDaily * 30 + safetyStock - (inStock + inTransit + inRequest)))'
      };
    });
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
  const yandexPayload = (() => {
    try {
      return readJson(path.join(dataDir, 'order_procurement_ym.json'));
    } catch {
      return null;
    }
  })();
  const yandexRows = normalizeExistingYandexRows(yandexPayload, skuMap);
  const combinedRows = rows.concat(yandexRows);

  const combinedPayload = {
    generatedAt: logistics?.generatedAt || new Date().toISOString(),
    schema: 'portal-order-procurement-combined-v2',
    formulaPassport: {
      targetHorizonDays: CANONICAL_ORDER_DAYS,
      legacyCompatHorizonDays: LEGACY_COMPAT_DAYS,
      available: 'inStock + inTransit + inRequest',
      rawNeedD: 'ceil(avgDaily * D + safetyStock - available)',
      targetNeedD: 'max(0, rawNeedD), or 0 when lifecycle is exit/paused/question/archived'
    },
    sourceFreshness: {
      logistics: logistics?.generatedAt || '',
      logisticsFileMtime: logisticsMeta.mtime,
      logisticsFileSize: logisticsMeta.size,
      logisticsRows: Array.isArray(logistics?.allRows) ? logistics.allRows.length : 0,
      yandexOrderProcurement: yandexPayload?.generatedAt || '',
      yandexRows: yandexRows.length,
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
    rows: combinedRows
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

  const ymPayload = {
    generatedAt: yandexPayload?.generatedAt || combinedPayload.generatedAt,
    schema: 'portal-order-procurement-ym-v2',
    formulaPassport: combinedPayload.formulaPassport,
    sourceFreshness: combinedPayload.sourceFreshness,
    window: yandexPayload?.window && typeof yandexPayload.window === 'object'
      ? yandexPayload.window
      : combinedPayload.window,
    platform: platformLabel('ym'),
    rows: yandexRows
  };

  writeJson(path.join(dataDir, 'order_procurement.json'), combinedPayload);
  writeJson(path.join(dataDir, 'order_procurement_wb.json'), wbPayload);
  writeJson(path.join(dataDir, 'order_procurement_ozon.json'), ozonPayload);
  writeJson(path.join(dataDir, 'order_procurement_ym.json'), ymPayload);
  writeGzip(path.join(dataDir, 'order_procurement_wb.json.gz'), wbPayload);
  writeGzip(path.join(dataDir, 'order_procurement_ozon.json.gz'), ozonPayload);

  console.log(JSON.stringify({
    generatedAt: combinedPayload.generatedAt,
    rows: combinedPayload.rows.length,
    wbRows: wbPayload.rows.length,
    ozonRows: ozonPayload.rows.length,
    yandexRows: yandexRows.length,
    targetHorizonDays: CANONICAL_ORDER_DAYS
  }, null, 2));
}

main();
