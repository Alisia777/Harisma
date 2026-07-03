#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  firstNumber,
  firstPositive,
  mergeSmartPriceContour,
  normalizeKey,
  parseFreshStamp,
  safeReadJson
} = require('./smart-price-contour');

const ROOT = process.cwd();
const PLATFORM_KEYS = ['wb', 'ozon'];
const DEFAULT_ALLOWED_MARGIN_PCT = 0.25;

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

function resolveOptions(args = {}) {
  return {
    workbenchPath: path.resolve(args['workbench-file'] || path.join(ROOT, 'data', 'smart_price_workbench.json')),
    overlayPath: path.resolve(args['overlay-file'] || path.join(ROOT, 'data', 'smart_price_overlay.json')),
    liveWorkbenchPath: path.resolve(args['live-file'] || path.join(ROOT, 'tmp-smart_price_workbench-live.json')),
    liveRepricerPath: path.resolve(args['live-repricer-file'] || path.join(ROOT, 'tmp-live-repricer.json')),
    liveRepricerMaxAgeDays: numberOption(args['live-repricer-max-age-days'] || process.env.ALTEA_LIVE_REPRICER_MAX_AGE_DAYS, 7),
    supportPath: path.resolve(args['support-file'] || path.join(ROOT, 'data', 'price_workbench_support.json')),
    pricesPath: path.resolve(args['prices-file'] || path.join(ROOT, 'data', 'prices.json')),
    procurementWbPath: path.resolve(args['procurement-wb-file'] || path.join(ROOT, 'data', 'order_procurement_wb.json')),
    procurementOzonPath: path.resolve(args['procurement-ozon-file'] || path.join(ROOT, 'data', 'order_procurement_ozon.json')),
    outputPath: path.resolve(args['output-file'] || path.join(ROOT, 'data', 'repricer.json'))
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function sanitizeLooseJson(text) {
  if (!text || typeof text !== 'string') return text;
  const replacements = [
    ['-Infinity', 'null'],
    ['Infinity', 'null'],
    ['NaN', 'null'],
    ['undefined', 'null']
  ];
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    let replaced = false;
    for (const [token, replacement] of replacements) {
      if (text.startsWith(token, index)) {
        const prev = index === 0 ? '' : text[index - 1];
        const next = text[index + token.length] || '';
        if ((prev === '' || /[\s,[\]{}:]/.test(prev)) && (next === '' || /[\s,[\]{}:]/.test(next))) {
          result += replacement;
          index += token.length - 1;
          replaced = true;
          break;
        }
      }
    }
    if (!replaced) result += char;
  }

  return result;
}

function safeReadLooseJson(filePath, fallback = null) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(sanitizeLooseJson(text));
  } catch {
    return fallback;
  }
}

function numberOption(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function fileMtimeIso(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return '';
  }
}

function liveSourceStatus(sourceGeneratedAt, anchorGeneratedAt, maxAgeDays) {
  const sourceStamp = parseFreshStamp(sourceGeneratedAt || '');
  const anchorStamp = parseFreshStamp(anchorGeneratedAt || '');
  if (!sourceStamp) {
    return {
      usable: false,
      status: 'missing-generatedAt',
      ageDays: null
    };
  }
  if (!anchorStamp) {
    return {
      usable: true,
      status: 'usable-no-anchor',
      ageDays: null
    };
  }
  const ageDays = Number(((anchorStamp - sourceStamp) / 86400000).toFixed(2));
  const usable = ageDays <= maxAgeDays;
  return {
    usable,
    status: usable ? 'usable' : 'stale-ignored',
    ageDays
  };
}

function platformRows(payload = {}, platform = '') {
  return Array.isArray(payload?.platforms?.[platform]?.rows) ? payload.platforms[platform].rows : [];
}

function supportRows(payload = {}, platform = '') {
  const rows = payload?.platforms?.[platform]?.rows;
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === 'object') return Object.values(rows);
  return [];
}

function buildMap(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = normalizeKey(row?.articleKey || row?.article || row?.sku);
    if (!key || map.has(key)) return;
    map.set(key, row);
  });
  return map;
}

function payloadRows(payload = {}) {
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.articles)) return payload.articles;
  if (payload?.rows && typeof payload.rows === 'object') return Object.values(payload.rows);
  return [];
}

function buildProcurementMap(payload = {}) {
  const rows = payloadRows(payload);
  const map = new Map();
  rows.forEach((row) => {
    const key = normalizeKey(row?.articleKey || row?.article || row?.sku || row?.offerId);
    if (!key) return;
    const current = map.get(key) || {
      snapshotAvailable: rows.length > 0,
      present: true,
      inStock: 0,
      inTransit: 0,
      inRequest: 0
    };
    current.inStock += numberValue(row?.inStock, row?.stock, row?.stockUnits, 0) || 0;
    current.inTransit += numberValue(row?.inTransit, row?.stockInTransit, 0) || 0;
    current.inRequest += numberValue(row?.inRequest, row?.stockInSupplyRequest, 0) || 0;
    map.set(key, current);
  });
  return {
    snapshotAvailable: rows.length > 0,
    map
  };
}

function textValue(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function numberValue(...values) {
  return firstNumber(...values);
}

function positiveValue(...values) {
  return firstPositive(...values);
}

function normalizeStatus(value) {
  return textValue(value).replace(/\s+/g, ' ').trim();
}

function normalizeTag(hasWb, hasOzon) {
  if (hasWb && hasOzon) return 'WB + OZ';
  if (hasWb) return 'WB';
  if (hasOzon) return 'OZ';
  return '';
}

function defaultTargetTurnoverDays(status = '', platform = '') {
  const raw = String(status || '').toLowerCase();
  if (raw.includes('нов')) return 45;
  if (raw.includes('вывод')) return 999;
  if (platform === 'ozon') return 60;
  return 95;
}

function inferStrategy(currentPrice, recPrice, stock, minPrice) {
  if ((stock || 0) <= 0) return 'OOS';
  if (currentPrice > 0 && minPrice > 0 && currentPrice + 0.001 < minPrice) return 'FLOOR';
  if (recPrice > currentPrice + 1) return 'UP';
  if (recPrice > 0 && currentPrice > recPrice + 1) return 'DOWN';
  if (recPrice > 0) return 'KEEP';
  return 'BLOCK';
}

function inferReason({
  sourceRow,
  supportRow,
  priceRow,
  currentPrice,
  recPrice,
  minPrice,
  strategy,
  stock,
  liveSide
}) {
  const seedReason = textValue(sourceRow?.seedReason);
  if (seedReason) return seedReason;
  const liveReason = textValue(liveSide?.reason);
  if (liveReason && parseFreshStamp(liveSide?.generatedAt || '') >= parseFreshStamp(sourceRow?.historyFreshnessDate || '')) {
    return liveReason;
  }
  if ((stock || 0) <= 0) return 'stock_total <= 0';
  if (currentPrice > 0 && minPrice > 0 && currentPrice + 0.001 < minPrice) return 'текущая цена ниже рабочего floor';
  if (strategy === 'UP') return 'seed target выше текущей цены';
  if (strategy === 'DOWN') return 'seed target ниже текущей цены';
  if (textValue(sourceRow?.historyNote)) return textValue(sourceRow.historyNote);
  if (textValue(priceRow?.historyFreshnessDate)) return `факт цены до ${priceRow.historyFreshnessDate}`;
  if (textValue(supportRow?.summary?.interpretation)) return textValue(supportRow.summary.interpretation);
  return 'без изменения';
}

function estimateNewBuyerPrice(currentBuyerPrice, currentPrice, recPrice, seedTargetClientPrice, liveNewBuyerPrice) {
  const explicit = positiveValue(seedTargetClientPrice, liveNewBuyerPrice);
  if (explicit !== null) return explicit;
  if (currentBuyerPrice > 0 && currentPrice > 0 && recPrice > 0) {
    return Number(((currentBuyerPrice * recPrice) / currentPrice).toFixed(2));
  }
  return positiveValue(currentBuyerPrice, recPrice);
}

function formatRub(value) {
  const amount = numberValue(value);
  if (amount === null) return '';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(amount)} ₽`;
}

function roundMetric(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function marginPctFromPrice(price, cost) {
  const actualPrice = positiveValue(price);
  const actualCost = positiveValue(cost);
  if (!(actualPrice > 0) || !(actualCost > 0)) return null;
  return roundMetric((actualPrice - actualCost) / actualPrice);
}

function resolveUpperCap(sourceRow, supportRow) {
  return positiveValue(
    sourceRow?.workingZoneTo,
    supportRow?.workingZoneTo,
    supportRow?.maxPrice,
    supportRow?.historicalMaxPrice
  ) || 0;
}

function capRecommendation(recPrice, minPrice, upperCap) {
  let guardedRecPrice = recPrice;
  let floorApplied = false;
  if (guardedRecPrice > 0 && minPrice > 0 && guardedRecPrice + 0.001 < minPrice) {
    guardedRecPrice = minPrice;
    floorApplied = true;
  }
  if (!(guardedRecPrice > 0) || !(upperCap > 0)) {
    return {
      recPrice: guardedRecPrice,
      floorApplied,
      capApplied: false,
      capBlockedByFloor: false
    };
  }
  if (minPrice > 0 && upperCap + 0.001 < minPrice) {
    return {
      recPrice: guardedRecPrice,
      floorApplied,
      capApplied: false,
      capBlockedByFloor: true
    };
  }
  if (guardedRecPrice > upperCap + 0.001) {
    return {
      recPrice: upperCap,
      floorApplied,
      capApplied: true,
      capBlockedByFloor: false
    };
  }
  return {
    recPrice: guardedRecPrice,
    floorApplied,
    capApplied: false,
    capBlockedByFloor: false
  };
}

function buildSide(sourceRow, platform, supportRow, priceRow, liveSide, liveRootGeneratedAt, procurementFact = null) {
  if (!sourceRow && !priceRow && !liveSide) return null;

  const supportExportCurrentPrice = platform === 'ozon'
    ? positiveValue(
      supportRow?.currentExportPrice,
      supportRow?.buyerCurrentExportMinPrice,
      supportRow?.buyerCurrentExportMaxPrice
    )
    : null;
  const currentPrice = positiveValue(
    supportExportCurrentPrice,
    sourceRow?.currentFillPrice,
    sourceRow?.currentPrice,
    priceRow?.currentPrice,
    liveSide?.currentPrice
  ) || 0;
  const currentBuyerPrice = positiveValue(
    supportExportCurrentPrice,
    sourceRow?.currentClientPrice,
    priceRow?.currentClientPrice,
    liveSide?.buyerPrice,
    liveSide?.newBuyerPrice,
    currentPrice
  ) || 0;
  const minPrice = positiveValue(
    sourceRow?.minPrice,
    supportRow?.minPrice,
    supportRow?.hardMinPrice,
    supportRow?.workingZoneFrom,
    priceRow?.minPrice,
    liveSide?.minPrice
  ) || 0;
  const cost = positiveValue(
    sourceRow?.cost,
    sourceRow?.costRub,
    sourceRow?.costPrice,
    supportRow?.cost,
    supportRow?.costRub,
    supportRow?.costPrice,
    priceRow?.cost,
    priceRow?.costRub,
    priceRow?.costPrice,
    liveSide?.cost
  );
  const basePrice = positiveValue(
    sourceRow?.basePrice,
    supportRow?.historicalMinProfitablePrice,
    priceRow?.basePrice,
    liveSide?.basePrice,
    minPrice,
    currentPrice
  ) || 0;
  const seedRecPrice = positiveValue(
    sourceRow?.seedTargetFillPrice,
    liveSide?.recPrice,
    currentPrice
  ) || 0;
  const upperCap = resolveUpperCap(sourceRow, supportRow);
  const procurementSnapshotAvailable = Boolean(procurementFact?.snapshotAvailable);
  const procurementPresent = Boolean(procurementFact?.present);
  const procurementStock = numberValue(procurementFact?.inStock, 0) || 0;
  const procurementInbound = (numberValue(procurementFact?.inTransit, 0) || 0) + (numberValue(procurementFact?.inRequest, 0) || 0);
  const fallbackInbound = (numberValue(sourceRow?.stockInTransit, 0) || 0) + (numberValue(sourceRow?.stockInSupplyRequest, 0) || 0);
  const inboundUnits = procurementSnapshotAvailable ? procurementInbound : fallbackInbound;
  const stock = numberValue(
    procurementSnapshotAvailable ? procurementStock : null,
    platform === 'ozon' ? sourceRow?.stockProducts : null,
    sourceRow?.stock,
    sourceRow?.stockRepricer,
    liveSide?.stock,
    0
  ) || 0;
  const stockSource = procurementSnapshotAvailable
    ? (procurementPresent ? 'procurement_snapshot' : 'procurement_snapshot_absent')
    : (platform === 'ozon' && sourceRow?.stockProducts !== undefined && sourceRow?.stockProducts !== null ? 'ozon_stock_products' : 'repricer_stock');
  const marketplaceStatusText = [
    sourceRow?.productStatus,
    sourceRow?.statusDescription,
    supportRow?.productStatus,
    supportRow?.statusDescription,
    priceRow?.productStatus,
    priceRow?.statusDescription,
    liveSide?.productStatus,
    liveSide?.statusDescription
  ].filter(Boolean).join(' ').toLowerCase();
  const marketplaceUnavailable = /не\s*прода|убран|нет\s+на\s+складе|архив|снят\s+с\s+продаж/.test(marketplaceStatusText);
  const noCurrentPlatformSupply = procurementSnapshotAvailable && stock <= 0 && inboundUnits <= 0;
  const stockGateBlocksAutoprice = noCurrentPlatformSupply || marketplaceUnavailable;
  const recGuard = capRecommendation(seedRecPrice, minPrice, upperCap);
  let recPrice = recGuard.recPrice || 0;
  if (stockGateBlocksAutoprice) recPrice = currentPrice || 0;
  const turnoverDays = numberValue(
    sourceRow?.currentTurnoverDays,
    sourceRow?.turnoverCurrentDays,
    priceRow?.currentTurnoverDays,
    liveSide?.turnoverDays
  );
  const targetTurnoverDays = numberValue(
    liveSide?.targetTurnoverDays
  ) || defaultTargetTurnoverDays(sourceRow?.status || priceRow?.status || supportRow?.productStatus || '', platform);
  const legacyMarginPct = numberValue(
    sourceRow?.costAwareMarginPct,
    sourceRow?.grossMarginPct,
    sourceRow?.avgMargin7dPct,
    sourceRow?.marginTotalPct,
    priceRow?.costAwareMarginPct,
    priceRow?.grossMarginPct,
    priceRow?.marginPct,
    liveSide?.costAwareMarginPct,
    liveSide?.marginPct
  );
  const currentCostAwareMarginPct = marginPctFromPrice(positiveValue(currentBuyerPrice, currentPrice), cost);
  const marginPct = currentCostAwareMarginPct ?? legacyMarginPct;
  const thresholdMarginPct = numberValue(
    sourceRow?.allowedMarginPct,
    supportRow?.allowedMarginPct,
    liveSide?.marginNoAdsMinPct,
    DEFAULT_ALLOWED_MARGIN_PCT
  );
  const strategy = inferStrategy(currentPrice, recPrice, stock, minPrice);
  const inferredReason = inferReason({
    sourceRow,
    supportRow,
    priceRow,
    currentPrice,
    recPrice,
    minPrice,
    strategy,
    stock,
    liveSide: liveSide ? { ...liveSide, generatedAt: liveRootGeneratedAt } : null
  });
  let reason = inferredReason;
  if (stockGateBlocksAutoprice) {
    reason = marketplaceUnavailable
      ? 'Товар не продается или отсутствует на складе площадки: автопрайс удерживает текущую цену.'
      : 'Нет актуального остатка и поставок по procurement snapshot: автопрайс удерживает текущую цену.';
  } else if (recGuard.capApplied) {
    const capSourceLabel = sourceRow?.workingZoneTo
      ? 'верхней границей рабочего коридора'
      : (supportRow?.workingZoneTo
        ? 'верхней границей support-коридора'
        : (supportRow?.maxPrice ? 'support max price' : 'historical max price'));
    reason = `Рекомендация ограничена ${capSourceLabel} ${formatRub(upperCap)}. Исходный target ${formatRub(seedRecPrice)} был выше допустимого диапазона.`;
  } else if (recGuard.capBlockedByFloor && upperCap > 0 && minPrice > 0) {
    reason = `Верхний cap ${formatRub(upperCap)} игнорирован, потому что он ниже floor ${formatRub(minPrice)}. ${inferredReason}`;
  } else if (recGuard.floorApplied && minPrice > 0) {
    reason = `Рекомендация поднята до рабочего floor ${formatRub(minPrice)}. ${inferredReason}`;
  }
  const newBuyerPrice = estimateNewBuyerPrice(
    currentBuyerPrice,
    currentPrice,
    recPrice,
    recGuard.capApplied ? null : sourceRow?.seedTargetClientPrice,
    recGuard.capApplied ? null : liveSide?.newBuyerPrice
  ) || 0;
  const newCostAwareMarginPct = marginPctFromPrice(positiveValue(newBuyerPrice, recPrice), cost);
  const newMarginPct = newCostAwareMarginPct ?? marginPct;
  const minPriceMarginPct = marginPctFromPrice(minPrice, cost);
  const maxPriceMarginPct = marginPctFromPrice(upperCap || positiveValue(sourceRow?.workingZoneTo, supportRow?.workingZoneTo, supportRow?.maxPrice), cost);
  const changePct = currentPrice > 0 && recPrice > 0
    ? Number((((recPrice - currentPrice) / currentPrice)).toFixed(6))
    : 0;

  return {
    status: normalizeStatus(sourceRow?.status || sourceRow?.productStatus || supportRow?.repricerStatus || supportRow?.productStatus || priceRow?.status || liveSide?.status),
    productStatus: normalizeStatus(sourceRow?.productStatus || sourceRow?.status || supportRow?.productStatus || priceRow?.productStatus || liveSide?.productStatus),
    repricerStatus: normalizeStatus(sourceRow?.repricerStatus || sourceRow?.status || supportRow?.repricerStatus || priceRow?.repricerStatus || liveSide?.repricerStatus),
    basePrice,
    cost,
    minPrice,
    currentPrice,
    buyerPrice: currentBuyerPrice,
    stock,
    stockSource,
    inboundUnits,
    procurementSnapshotAvailable,
    procurementPresent,
    noCurrentPlatformSupply,
    marketplaceUnavailable,
    stockGateBlocksAutoprice,
    turnoverDays: turnoverDays === null ? null : turnoverDays,
    targetTurnoverDays,
    marginPct: marginPct === null ? null : marginPct,
    grossMarginPct: marginPct === null ? null : marginPct,
    costAwareMarginPct: currentCostAwareMarginPct ?? marginPct,
    recPrice,
    changePct,
    newBuyerPrice,
    newMarginPct: newMarginPct === null ? null : newMarginPct,
    newCostAwareMarginPct: newCostAwareMarginPct ?? newMarginPct,
    strategy,
    reason,
    marginNoAdsMinPct: thresholdMarginPct === null ? null : thresholdMarginPct,
    marginNoAdsBasePct: marginPct === null ? null : marginPct,
    marginNoAdsCurrentPct: marginPct === null ? null : marginPct,
    marginNoAdsNewPct: newMarginPct === null ? null : newMarginPct,
    minPriceMarginPct,
    maxPriceMarginPct,
    currentPriceDate: textValue(sourceRow?.valueDate, priceRow?.currentPriceDate, sourceRow?.historyFreshnessDate, priceRow?.historyFreshnessDate),
    historyFreshnessDate: textValue(sourceRow?.historyFreshnessDate, priceRow?.historyFreshnessDate),
    sourceMode: textValue(sourceRow?.sourceMode, priceRow?.sourceMode),
    workingZoneFrom: positiveValue(sourceRow?.workingZoneFrom, supportRow?.workingZoneFrom),
    workingZoneTo: positiveValue(sourceRow?.workingZoneTo, supportRow?.workingZoneTo, supportRow?.maxPrice, supportRow?.historicalMaxPrice),
    requiredPriceForProfitability: positiveValue(sourceRow?.requiredPriceForProfitability, supportRow?.requiredPriceForProfitability),
    requiredPriceForMargin: positiveValue(sourceRow?.requiredPriceForMargin),
    allowedMarginPct: thresholdMarginPct === null ? null : thresholdMarginPct,
    minMaxSource: textValue(sourceRow?.minMaxSource, supportRow?.minMaxSource, priceRow?.minMaxSource),
    minMaxImportedAt: textValue(sourceRow?.minMaxImportedAt, supportRow?.minMaxImportedAt, priceRow?.minMaxImportedAt),
    manualMinPrice: positiveValue(sourceRow?.manualMinPrice, supportRow?.manualMinPrice, priceRow?.manualMinPrice),
    manualMaxPrice: positiveValue(sourceRow?.manualMaxPrice, supportRow?.manualMaxPrice, priceRow?.manualMaxPrice),
    manualClientMinPrice: positiveValue(sourceRow?.manualClientMinPrice, supportRow?.manualClientMinPrice, priceRow?.manualClientMinPrice),
    manualClientMaxPrice: positiveValue(sourceRow?.manualClientMaxPrice, supportRow?.manualClientMaxPrice, priceRow?.manualClientMaxPrice),
    liveRecPrice: positiveValue(liveSide?.recPrice),
    liveStrategy: textValue(liveSide?.strategy),
    liveReason: textValue(liveSide?.reason),
    seedRecPrice: seedRecPrice || 0,
    upperCap: upperCap || 0,
    floorApplied: Boolean(recGuard.floorApplied),
    upperCapApplied: recGuard.capApplied
  };
}

function buildSummary(rows = []) {
  const summary = {
    skuCount: rows.length,
    wbChangeCount: 0,
    ozonChangeCount: 0,
    wbBelowMinCount: 0,
    ozonBelowMinCount: 0,
    wbMarginRiskCount: 0,
    ozonMarginRiskCount: 0,
    wbEqualizeCount: 0,
    ozonEqualizeCount: 0,
    wbTurnoverCount: 0,
    ozonTurnoverCount: 0
  };

  rows.forEach((row) => {
    PLATFORM_KEYS.forEach((platform) => {
      const side = row?.[platform];
      if (!side) return;
      const prefix = platform === 'wb' ? 'wb' : 'ozon';
      if (Math.abs((Number(side.recPrice) || 0) - (Number(side.currentPrice) || 0)) >= 1) {
        summary[`${prefix}ChangeCount`] += 1;
      }
      if ((Number(side.currentPrice) || 0) > 0 && (Number(side.minPrice) || 0) > 0 && Number(side.currentPrice) + 0.001 < Number(side.minPrice)) {
        summary[`${prefix}BelowMinCount`] += 1;
      }
      const currentMargin = firstNumber(side.marginNoAdsCurrentPct, side.marginPct);
      const thresholdMargin = firstNumber(side.marginNoAdsMinPct, side.allowedMarginPct);
      if (currentMargin !== null && thresholdMargin !== null && currentMargin + 1e-9 < thresholdMargin) {
        summary[`${prefix}MarginRiskCount`] += 1;
      }
      if ((Number(side.turnoverDays) || 0) > 0) {
        summary[`${prefix}TurnoverCount`] += 1;
      }
      const strategy = String(side.strategy || '').toUpperCase();
      const reason = String(side.reason || '').toLowerCase();
      if (strategy.includes('ALIGN') || reason.includes('equalize') || reason.includes('align') || reason.includes('вырав')) {
        summary[`${prefix}EqualizeCount`] += 1;
      }
    });
  });

  return summary;
}

function buildLegacyRepricerLayer(options = {}) {
  const workbench = safeReadJson(options.workbenchPath, { generatedAt: '', platforms: {} });
  const overlay = safeReadJson(options.overlayPath, { generatedAt: '', platforms: {} });
  const liveWorkbench = safeReadJson(options.liveWorkbenchPath, { generatedAt: '', platforms: {} });
  const support = safeReadJson(options.supportPath, { generatedAt: '', platforms: {} });
  const prices = safeReadJson(options.pricesPath, { generatedAt: '', platforms: {} });
  const procurementWb = safeReadJson(options.procurementWbPath, { generatedAt: '', rows: [] });
  const procurementOzon = safeReadJson(options.procurementOzonPath, { generatedAt: '', rows: [] });
  const liveRepricer = safeReadLooseJson(options.liveRepricerPath, { generatedAt: '', rows: [] });

  const merged = mergeSmartPriceContour(workbench || {}, overlay || {}, liveWorkbench || {});
  const liveRepricerFreshness = liveSourceStatus(
    liveRepricer?.generatedAt || '',
    merged?.generatedAt || prices?.generatedAt || overlay?.generatedAt || '',
    numberOption(options.liveRepricerMaxAgeDays, 7)
  );
  const liveRepricerRows = liveRepricerFreshness.usable && Array.isArray(liveRepricer?.rows) ? liveRepricer.rows : [];
  const liveRepricerMap = buildMap(liveRepricerRows);
  const supportMaps = Object.fromEntries(PLATFORM_KEYS.map((platform) => [platform, buildMap(supportRows(support, platform))]));
  const pricesMaps = Object.fromEntries(PLATFORM_KEYS.map((platform) => [platform, buildMap(platformRows(prices, platform))]));
  const procurementMaps = {
    wb: buildProcurementMap(procurementWb),
    ozon: buildProcurementMap(procurementOzon)
  };
  const byArticle = new Map();

  PLATFORM_KEYS.forEach((platform) => {
    platformRows(merged, platform).forEach((sourceRow) => {
      const articleKey = textValue(sourceRow?.articleKey, sourceRow?.article);
      if (!articleKey) return;
      const key = normalizeKey(articleKey);
      const liveRow = liveRepricerMap.get(key) || null;
      const supportRow = supportMaps[platform].get(key) || null;
      const priceRow = pricesMaps[platform].get(key) || null;
      const procurementBucket = procurementMaps[platform] || { snapshotAvailable: false, map: new Map() };
      const procurementFact = procurementBucket.map.get(key) || {
        snapshotAvailable: Boolean(procurementBucket.snapshotAvailable),
        present: false,
        inStock: 0,
        inTransit: 0,
        inRequest: 0
      };
      if (!byArticle.has(key)) {
        const owner = textValue(sourceRow?.owner, priceRow?.owner, supportRow?.owner, liveRow?.owner);
        byArticle.set(key, {
          articleKey,
          article: textValue(sourceRow?.article, articleKey),
          name: textValue(sourceRow?.name, priceRow?.name, supportRow?.name, liveRow?.name),
          brand: textValue(sourceRow?.brand, liveRow?.brand),
          legalEntity: textValue(owner, liveRow?.legalEntity),
          owner,
          ownerByPlatform: {},
          status: normalizeStatus(sourceRow?.status || sourceRow?.productStatus || priceRow?.status || supportRow?.repricerStatus || supportRow?.productStatus || liveRow?.status),
          tag: '',
          cost: positiveValue(sourceRow?.cost, sourceRow?.costRub, sourceRow?.costPrice, supportRow?.cost, supportRow?.costRub, supportRow?.costPrice, priceRow?.cost, priceRow?.costRub, priceRow?.costPrice, liveRow?.cost),
          wb: null,
          ozon: null
        });
      }
      const target = byArticle.get(key);
      target.article = textValue(target.article, sourceRow?.article, articleKey);
      target.name = textValue(target.name, sourceRow?.name, priceRow?.name, supportRow?.name, liveRow?.name);
      target.brand = textValue(target.brand, sourceRow?.brand, liveRow?.brand);
      const owner = textValue(sourceRow?.owner, priceRow?.owner, supportRow?.owner);
      if (owner) target.ownerByPlatform[platform] = owner;
      target.legalEntity = textValue(target.legalEntity, owner, liveRow?.legalEntity);
      target.owner = textValue(target.owner, owner);
      target.status = normalizeStatus(target.status || sourceRow?.status || sourceRow?.productStatus || priceRow?.status || supportRow?.repricerStatus || supportRow?.productStatus || liveRow?.status);
      target.cost = positiveValue(target.cost, sourceRow?.cost, sourceRow?.costRub, sourceRow?.costPrice, supportRow?.cost, supportRow?.costRub, supportRow?.costPrice, priceRow?.cost, priceRow?.costRub, priceRow?.costPrice, liveRow?.cost);
      target[platform] = buildSide(sourceRow, platform, supportRow, priceRow, liveRow?.[platform] || null, liveRepricer?.generatedAt || '', procurementFact);
    });
  });

  const rows = Array.from(byArticle.values())
    .map((row) => {
      row.tag = normalizeTag(Boolean(row.wb), Boolean(row.ozon));
      return row;
    })
    .sort((left, right) => {
      const leftChange = Math.max(
        Math.abs((Number(left?.wb?.recPrice) || 0) - (Number(left?.wb?.currentPrice) || 0)),
        Math.abs((Number(left?.ozon?.recPrice) || 0) - (Number(left?.ozon?.currentPrice) || 0))
      );
      const rightChange = Math.max(
        Math.abs((Number(right?.wb?.recPrice) || 0) - (Number(right?.wb?.currentPrice) || 0)),
        Math.abs((Number(right?.ozon?.recPrice) || 0) - (Number(right?.ozon?.currentPrice) || 0))
      );
      return rightChange - leftChange || String(left.article || left.articleKey).localeCompare(String(right.article || right.articleKey), 'ru');
    });

  const payload = {
    generatedAt: merged?.generatedAt || new Date().toISOString(),
    note: 'Legacy repricer fallback rebuilt from merged smart-price contour, support rows and local live repricer hints. Used for coldstart, price bridge and compatibility until managed repricer finishes hydration.',
    sourceFreshness: {
      workbench: workbench?.generatedAt || '',
      overlay: overlay?.generatedAt || '',
      liveWorkbench: liveWorkbench?.generatedAt || '',
      liveRepricer: liveRepricer?.generatedAt || '',
      liveRepricerFileMtime: fileMtimeIso(options.liveRepricerPath),
      liveRepricerStatus: liveRepricerFreshness.status,
      liveRepricerAgeDays: liveRepricerFreshness.ageDays,
      liveRepricerMaxAgeDays: numberOption(options.liveRepricerMaxAgeDays, 7),
      liveRepricerRowsUsed: liveRepricerRows.length,
      support: support?.generatedAt || '',
      prices: prices?.generatedAt || '',
      merged: merged?.generatedAt || ''
    },
    summary: buildSummary(rows),
    rows
  };

  writeJson(options.outputPath, payload);

  return {
    payload,
    summary: {
      output: options.outputPath,
      generatedAt: payload.generatedAt,
      skuCount: rows.length,
      wbRows: rows.filter((row) => row.wb).length,
      ozonRows: rows.filter((row) => row.ozon).length
    }
  };
}

if (require.main === module) {
  const result = buildLegacyRepricerLayer(resolveOptions(parseArgs(process.argv)));
  console.log(JSON.stringify(result.summary, null, 2));
}

module.exports = {
  buildLegacyRepricerLayer,
  resolveOptions
};
