#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  asIsoDate,
  firstNumber,
  firstPositive,
  latestSeriesDate,
  mergeSmartPriceContour,
  safeReadJson
} = require('./smart-price-contour');

const ROOT = process.cwd();
const MONTH_LABELS_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь'
];
const PLATFORM_TARGETS = [
  ['wb', 'wb'],
  ['ozon', 'ozon'],
  ['ya', 'ym'],
  ['ym', 'ym']
];
const PLATFORM_LABELS = {
  wb: 'WB',
  ozon: 'Ozon',
  ym: 'Я.Маркет'
};

function sanitizeDiscountPct(...values) {
  const parsed = firstNumber(...values);
  if (parsed === null) return null;
  return Math.min(1, Math.max(0, parsed));
}

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
    livePath: path.resolve(args['live-file'] || path.join(ROOT, 'tmp-smart_price_workbench-live.json')),
    outputPath: path.resolve(args['output-file'] || path.join(ROOT, 'data', 'prices.json'))
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function monthLabelFromKey(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey || '')) return '';
  const [year, month] = monthKey.split('-').map((value) => Number(value));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return '';
  return `${MONTH_LABELS_RU[month - 1]} ${year}`;
}

function pointFromSource(point = {}, platform = '') {
  const date = asIsoDate(point?.date);
  if (!date) return null;
  const orderedUnits = firstNumber(point?.ordersUnits);
  const deliveredUnits = firstNumber(point?.deliveredUnits);
  const isOzon = platform === 'ozon';
  return {
    date,
    turnoverDays: firstNumber(point?.turnoverDays),
    price: firstPositive(point?.price, point?.currentFillPrice, point?.currentPrice),
    clientPrice: firstPositive(point?.clientPrice, point?.currentClientPrice),
    sppPct: sanitizeDiscountPct(point?.sppPct, point?.currentSppPct),
    ordersUnits: isOzon ? null : orderedUnits,
    deliveredUnits: deliveredUnits !== null ? deliveredUnits : (isOzon ? orderedUnits : null),
    revenue: firstNumber(point?.revenue)
  };
}

function selectSeries(row = {}) {
  if (Array.isArray(row?.daily) && row.daily.length) return row.daily;
  if (Array.isArray(row?.monthly) && row.monthly.length) return row.monthly;
  if (Array.isArray(row?.timeline) && row.timeline.length) return row.timeline;
  return [];
}

function normalizeSeries(row = {}, platform = '') {
  const byDate = new Map();
  selectSeries(row).forEach((point) => {
    const normalized = pointFromSource(point, platform);
    if (!normalized) return;
    byDate.set(normalized.date, normalized);
  });
  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function lastSeriesValue(series, key) {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = firstNumber(series[index]?.[key]);
    if (value !== null) return { value, date: series[index]?.date || '' };
  }
  return { value: null, date: '' };
}

function lastSeriesPrice(series) {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = firstPositive(series[index]?.price);
    if (value !== null) return { value, date: series[index]?.date || '' };
  }
  return { value: null, date: '' };
}

function lastSeriesClientPrice(series) {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = firstPositive(series[index]?.clientPrice);
    if (value !== null) return { value, date: series[index]?.date || '' };
  }
  return { value: null, date: '' };
}

function lastSeriesSpp(series) {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = firstNumber(series[index]?.sppPct);
    if (value !== null) return { value, date: series[index]?.date || '' };
  }
  return { value: null, date: '' };
}

function buildLegacyRow(row = {}, platform = '') {
  const series = normalizeSeries(row, platform);
  const lastPrice = lastSeriesPrice(series);
  const lastClientPrice = lastSeriesClientPrice(series);
  const lastTurnover = lastSeriesValue(series, 'turnoverDays');
  const lastSpp = lastSeriesSpp(series);
  const latestFactDate = asIsoDate(row?.valueDate || row?.historyFreshnessDate || latestSeriesDate(row) || '');
  const currentPrice = firstPositive(row?.currentFillPrice, row?.currentPrice, lastPrice.value);
  const currentClientPrice = firstPositive(row?.currentClientPrice, lastClientPrice.value);
  const currentTurnoverDays = firstNumber(row?.currentTurnoverDays, row?.turnoverCurrentDays, lastTurnover.value);
  const currentSppPct = sanitizeDiscountPct(row?.currentSppPct, lastSpp.value);
  const currentPriceDate = lastPrice.date || latestFactDate;
  const basePrice = firstPositive(row?.basePrice, lastPrice.value, currentPrice);
  const minPrice = firstPositive(row?.minPrice, row?.workingZoneFrom, row?.hardMinPrice);

  return {
    articleKey: row?.articleKey || row?.article || '',
    article: row?.article || row?.articleKey || '',
    name: row?.name || '',
    owner: row?.owner || '',
    platform,
    marketplace: row?.marketplace || platform,
    status: row?.status || row?.productStatus || '',
    sourceMode: row?.sourceMode || '',
    allowedMarginPct: firstNumber(row?.allowedMarginPct),
    avgMargin7dPct: firstNumber(row?.avgMargin7dPct, row?.marginTotalPct),
    currentTurnoverDays,
    currentPrice,
    currentClientPrice,
    currentSppPct,
    currentPriceDate,
    historyFreshnessDate: latestFactDate,
    minPrice,
    basePrice,
    daily: series
  };
}

function buildDates(platformBuckets, monthKey) {
  const dates = new Set();
  Object.values(platformBuckets || {}).forEach((bucket) => {
    (bucket?.rows || []).forEach((row) => {
      (row?.daily || []).forEach((point) => {
        const date = asIsoDate(point?.date);
        if (date && (!monthKey || date.startsWith(monthKey))) dates.add(date);
      });
    });
  });
  return Array.from(dates)
    .sort()
    .map((date) => ({
      date,
      label: `${date.slice(8, 10)}.${date.slice(5, 7)}`
    }));
}

function buildLegacyPricesLayer(options = {}) {
  const workbench = safeReadJson(options.workbenchPath, { generatedAt: '', platforms: {} });
  const overlay = safeReadJson(options.overlayPath, { generatedAt: '', platforms: {} });
  const live = safeReadJson(options.livePath, { generatedAt: '', platforms: {} });
  const merged = mergeSmartPriceContour(workbench || {}, overlay || {}, live || {});

  const platformBuckets = {};
  let latestDate = '';

  PLATFORM_TARGETS.forEach(([sourceKey, targetKey]) => {
    const sourceRows = Array.isArray(merged?.platforms?.[sourceKey]?.rows)
      ? merged.platforms[sourceKey].rows
      : [];
    if (!platformBuckets[targetKey]) {
      platformBuckets[targetKey] = { label: PLATFORM_LABELS[targetKey], rows: [] };
    }
    sourceRows.forEach((row) => {
      const legacyRow = buildLegacyRow(row, targetKey);
      platformBuckets[targetKey].rows.push(legacyRow);
      (legacyRow.daily || []).forEach((point) => {
        if (point?.date && point.date > latestDate) latestDate = point.date;
      });
      const freshnessDate = asIsoDate(legacyRow.historyFreshnessDate || legacyRow.currentPriceDate || '');
      if (freshnessDate && freshnessDate > latestDate) latestDate = freshnessDate;
    });
  });

  Object.values(platformBuckets).forEach((bucket) => {
    bucket.rows.sort((left, right) => String(left.articleKey || '').localeCompare(String(right.articleKey || '')));
  });

  const monthKey = /^\d{4}-\d{2}-\d{2}$/.test(latestDate) ? latestDate.slice(0, 7) : '';
  const dates = buildDates(platformBuckets, monthKey);
  const payload = {
    generatedAt: merged?.generatedAt || new Date().toISOString(),
    month: {
      key: monthKey,
      label: monthLabelFromKey(monthKey)
    },
    note: 'Legacy compatibility layer rebuilt from merged smart-price contour (smart_price_workbench + smart_price_overlay + свежий live при наличии). Текущая цена и дневная история теперь не должны залипать на старом мартовском prices.json.',
    sourceFreshness: {
      workbench: workbench?.generatedAt || '',
      overlay: overlay?.generatedAt || '',
      live: live?.generatedAt || '',
      merged: merged?.generatedAt || ''
    },
    dates,
    platforms: platformBuckets
  };

  writeJson(options.outputPath, payload);

  return {
    payload,
    summary: {
      output: options.outputPath,
      generatedAt: payload.generatedAt,
      monthKey,
      dateCount: dates.length,
      platforms: Object.fromEntries(
        Object.entries(platformBuckets).map(([key, bucket]) => [key, bucket.rows.length])
      )
    }
  };
}

if (require.main === module) {
  const options = resolveOptions(parseArgs(process.argv));
  const result = buildLegacyPricesLayer(options);
  console.log(JSON.stringify(result.summary, null, 2));
}

module.exports = {
  buildLegacyPricesLayer,
  resolveOptions
};
