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
    supportPath: path.resolve(args['support-file'] || path.join(ROOT, 'data', 'price_workbench_support.json')),
    pricesPath: path.resolve(args['prices-file'] || path.join(ROOT, 'data', 'prices.json')),
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

function buildSide(sourceRow, platform, supportRow, priceRow, liveSide, liveRootGeneratedAt) {
  if (!sourceRow && !priceRow && !liveSide) return null;

  const currentPrice = positiveValue(
    sourceRow?.currentFillPrice,
    sourceRow?.currentPrice,
    priceRow?.currentPrice,
    liveSide?.currentPrice
  ) || 0;
  const currentBuyerPrice = positiveValue(
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
  const basePrice = positiveValue(
    sourceRow?.basePrice,
    supportRow?.historicalMinProfitablePrice,
    priceRow?.basePrice,
    liveSide?.basePrice,
    minPrice,
    currentPrice
  ) || 0;
  const recPrice = positiveValue(
    sourceRow?.seedTargetFillPrice,
    liveSide?.recPrice,
    currentPrice
  ) || 0;
  const stock = numberValue(
    sourceRow?.stockRepricer,
    sourceRow?.stock,
    liveSide?.stock,
    0
  ) || 0;
  const turnoverDays = numberValue(
    sourceRow?.currentTurnoverDays,
    sourceRow?.turnoverCurrentDays,
    priceRow?.currentTurnoverDays,
    liveSide?.turnoverDays
  );
  const targetTurnoverDays = numberValue(
    liveSide?.targetTurnoverDays
  ) || defaultTargetTurnoverDays(sourceRow?.status || priceRow?.status || supportRow?.productStatus || '', platform);
  const marginPct = numberValue(
    sourceRow?.avgMargin7dPct,
    sourceRow?.marginTotalPct,
    liveSide?.marginPct
  );
  const thresholdMarginPct = numberValue(
    sourceRow?.allowedMarginPct,
    supportRow?.allowedMarginPct,
    liveSide?.marginNoAdsMinPct,
    0.15
  );
  const strategy = inferStrategy(currentPrice, recPrice, stock, minPrice);
  const reason = inferReason({
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
  const newBuyerPrice = estimateNewBuyerPrice(
    currentBuyerPrice,
    currentPrice,
    recPrice,
    sourceRow?.seedTargetClientPrice,
    liveSide?.newBuyerPrice
  ) || 0;
  const changePct = currentPrice > 0 && recPrice > 0
    ? Number((((recPrice - currentPrice) / currentPrice)).toFixed(6))
    : 0;

  return {
    basePrice,
    minPrice,
    currentPrice,
    buyerPrice: currentBuyerPrice,
    stock,
    turnoverDays: turnoverDays === null ? null : turnoverDays,
    targetTurnoverDays,
    marginPct: marginPct === null ? null : marginPct,
    recPrice,
    changePct,
    newBuyerPrice,
    newMarginPct: marginPct === null ? null : marginPct,
    strategy,
    reason,
    marginNoAdsMinPct: thresholdMarginPct === null ? null : thresholdMarginPct,
    marginNoAdsBasePct: marginPct === null ? null : marginPct,
    marginNoAdsCurrentPct: marginPct === null ? null : marginPct,
    marginNoAdsNewPct: marginPct === null ? null : marginPct,
    currentPriceDate: textValue(sourceRow?.valueDate, priceRow?.currentPriceDate, sourceRow?.historyFreshnessDate, priceRow?.historyFreshnessDate),
    historyFreshnessDate: textValue(sourceRow?.historyFreshnessDate, priceRow?.historyFreshnessDate),
    sourceMode: textValue(sourceRow?.sourceMode, priceRow?.sourceMode),
    workingZoneFrom: positiveValue(sourceRow?.workingZoneFrom, supportRow?.workingZoneFrom),
    workingZoneTo: positiveValue(sourceRow?.workingZoneTo, supportRow?.workingZoneTo),
    requiredPriceForProfitability: positiveValue(sourceRow?.requiredPriceForProfitability, supportRow?.requiredPriceForProfitability),
    requiredPriceForMargin: positiveValue(sourceRow?.requiredPriceForMargin),
    allowedMarginPct: thresholdMarginPct === null ? null : thresholdMarginPct,
    liveRecPrice: positiveValue(liveSide?.recPrice),
    liveStrategy: textValue(liveSide?.strategy),
    liveReason: textValue(liveSide?.reason)
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
  const liveRepricer = safeReadLooseJson(options.liveRepricerPath, { generatedAt: '', rows: [] });

  const merged = mergeSmartPriceContour(workbench || {}, overlay || {}, liveWorkbench || {});
  const liveRepricerRows = Array.isArray(liveRepricer?.rows) ? liveRepricer.rows : [];
  const liveRepricerMap = buildMap(liveRepricerRows);
  const supportMaps = Object.fromEntries(PLATFORM_KEYS.map((platform) => [platform, buildMap(supportRows(support, platform))]));
  const pricesMaps = Object.fromEntries(PLATFORM_KEYS.map((platform) => [platform, buildMap(platformRows(prices, platform))]));
  const byArticle = new Map();

  PLATFORM_KEYS.forEach((platform) => {
    platformRows(merged, platform).forEach((sourceRow) => {
      const articleKey = textValue(sourceRow?.articleKey, sourceRow?.article);
      if (!articleKey) return;
      const key = normalizeKey(articleKey);
      const liveRow = liveRepricerMap.get(key) || null;
      const supportRow = supportMaps[platform].get(key) || null;
      const priceRow = pricesMaps[platform].get(key) || null;
      if (!byArticle.has(key)) {
        byArticle.set(key, {
          articleKey,
          article: textValue(sourceRow?.article, articleKey),
          name: textValue(sourceRow?.name, priceRow?.name, supportRow?.name, liveRow?.name),
          brand: textValue(sourceRow?.brand, liveRow?.brand),
          legalEntity: textValue(sourceRow?.owner, priceRow?.owner, supportRow?.owner, liveRow?.legalEntity),
          owner: textValue(sourceRow?.owner, priceRow?.owner, supportRow?.owner),
          status: normalizeStatus(sourceRow?.status || sourceRow?.productStatus || priceRow?.status || supportRow?.repricerStatus || supportRow?.productStatus || liveRow?.status),
          tag: '',
          cost: positiveValue(liveRow?.cost),
          wb: null,
          ozon: null
        });
      }
      const target = byArticle.get(key);
      target.article = textValue(target.article, sourceRow?.article, articleKey);
      target.name = textValue(target.name, sourceRow?.name, priceRow?.name, supportRow?.name, liveRow?.name);
      target.brand = textValue(target.brand, sourceRow?.brand, liveRow?.brand);
      target.legalEntity = textValue(target.legalEntity, sourceRow?.owner, priceRow?.owner, supportRow?.owner, liveRow?.legalEntity);
      target.owner = textValue(target.owner, sourceRow?.owner, priceRow?.owner, supportRow?.owner);
      target.status = normalizeStatus(target.status || sourceRow?.status || sourceRow?.productStatus || priceRow?.status || supportRow?.repricerStatus || supportRow?.productStatus || liveRow?.status);
      target.cost = positiveValue(target.cost, liveRow?.cost);
      target[platform] = buildSide(sourceRow, platform, supportRow, priceRow, liveRow?.[platform] || null, liveRepricer?.generatedAt || '');
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
