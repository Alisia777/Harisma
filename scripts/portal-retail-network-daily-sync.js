#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_SOURCE_ID = '1Zy0ec9-snLwh-J88KoFXyHxtYg3DXC8oWnC17iHNNS4';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const TARGET_PLATFORMS = ['goldapple', 'letu', 'megamarket'];
const PLATFORM_META = {
  goldapple: { label: 'ЗЯ', supportKey: 'ga' },
  letu: { label: 'Лэтуаль', supportKey: 'letu' },
  megamarket: { label: 'Мегамаркет', supportKey: 'mega' },
  samokat: { label: 'Самокат', supportKey: 'samokat' }
};

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      if (!args.command) args.command = token;
      continue;
    }
    if (['--dry-run', '--strict', '--optional-source'].includes(token)) {
      args[token.slice(2)] = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.slice(2);
    const value = inlineValue === undefined ? argv[index + 1] : inlineValue;
    if (inlineValue === undefined) index += 1;
    args[key] = value;
  }
  return args;
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[ё]/g, 'е').replace(/[^a-zа-я0-9]+/gi, '');
}

function numberOrZero(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let raw = normalizeText(value);
  if (!raw || raw === '-' || raw === '—') return 0;
  const negative = /^\(.*\)$/.test(raw);
  raw = raw.replace(/[()]/g, '').replace(/\s+/g, '').replace(/,/g, '.').replace(/[^0-9.+-]/g, '');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

function round(value, digits = 4) {
  const power = 10 ** digits;
  return Math.round((numberOrZero(value) + Number.EPSILON) * power) / power;
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' || /^\d{5}(?:\.\d+)?$/.test(normalizeText(value))) {
    const decoded = XLSX.SSF.parse_date_code(Number(value));
    if (decoded?.y && decoded?.m && decoded?.d) {
      return `${String(decoded.y).padStart(4, '0')}-${String(decoded.m).padStart(2, '0')}-${String(decoded.d).padStart(2, '0')}`;
    }
  }
  const raw = normalizeText(value);
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return '';
}

function letualBusinessDate(declaredDate, periodValue) {
  const periodDates = normalizeText(periodValue)
    .match(/\d{4}-\d{1,2}-\d{1,2}/g)
    ?.map((value) => isoDate(value))
    .filter(Boolean) || [];
  if (!periodDates.length) return isoDate(declaredDate);
  if (periodDates.every((value) => value === periodDates[0])) return periodDates[0];
  return '';
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function lagDays(latestDate, cutoffDate) {
  const latest = isoDate(latestDate);
  const cutoff = isoDate(cutoffDate);
  if (!latest || !cutoff) return null;
  const latestTime = Date.parse(`${latest}T00:00:00Z`);
  const cutoffTime = Date.parse(`${cutoff}T00:00:00Z`);
  if (!Number.isFinite(latestTime) || !Number.isFinite(cutoffTime)) return null;
  return Math.max(0, Math.round((cutoffTime - latestTime) / 86400000));
}

function exceedsAllowedLag(latestDate, cutoffDate, maxLagDays = 0) {
  const lag = lagDays(latestDate, cutoffDate);
  return lag === null || lag > Math.max(0, Number(maxLagDays) || 0);
}

function moscowDateKey(offsetDays = 0, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).reduce((acc, item) => {
    if (item.type !== 'literal') acc[item.type] = item.value;
    return acc;
  }, {});
  return addDays(`${parts.year}-${parts.month}-${parts.day}`, offsetDays);
}

function resolveOptions(args) {
  const root = process.cwd();
  return {
    command: args.command || 'sync',
    workbookPath: args.workbook ? path.resolve(args.workbook) : '',
    sourceId: normalizeText(args['source-id'] || process.env.ALTEA_RETAIL_NETWORK_GOOGLE_SHEET_ID || DEFAULT_SOURCE_ID),
    inputFile: path.resolve(args['input-file'] || path.join(root, 'data', 'platform_trends.json')),
    outputFile: path.resolve(args['output-file'] || args['input-file'] || path.join(root, 'data', 'platform_trends.json')),
    statusFile: path.resolve(args['status-file'] || path.join(root, 'data', 'retail_network_source_status.json')),
    from: isoDate(args.from),
    to: isoDate(args.to) || moscowDateKey(-1),
    dryRun: Boolean(args['dry-run']),
    strict: Boolean(args.strict),
    optionalSource: Boolean(args['optional-source']),
    maxLagDays: Math.max(0, Math.trunc(numberOrZero(args['max-lag-days'])))
  };
}

function findSheetName(workbook, needle) {
  const target = normalizeKey(needle);
  return workbook.SheetNames.find((name) => normalizeKey(name).includes(target)) || '';
}

function sheetRows(workbook, needle) {
  const sheetName = findSheetName(workbook, needle);
  if (!sheetName) throw new Error(`Workbook sheet not found: ${needle}`);
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
}

function withinWindow(date, options) {
  return Boolean(date && (!options.from || date >= options.from) && (!options.to || date <= options.to));
}

function metricName(label) {
  const key = normalizeKey(label);
  if (key === 'заказано') return 'ordersUnits';
  if (key === 'заказанор') return 'ordersRevenue';
  if (key === 'транзит' || key === 'впути') return 'transitUnits';
  if (key === 'транзитр' || key === 'впутир') return 'transitRevenue';
  if (key === 'доставлено') return 'deliveredUnits';
  if (key === 'доставленор') return 'deliveredRevenue';
  if (key === 'остатоквпродаже') return 'stock';
  return '';
}

function parseLetualRows(rows, options) {
  const records = [];
  let headers = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const hasHeader = row.some((cell) => normalizeKey(cell) === 'датавыгрузки')
      && row.some((cell) => normalizeKey(cell) === 'всегозаказано');
    if (hasHeader) {
      headers = row.map((cell, index) => index === 0 ? 'Юр лицо' : index === 1 ? 'Дата' : normalizeText(cell));
      continue;
    }
    if (!headers.length) continue;
    const headerIndex = new Map(headers.map((header, index) => [normalizeKey(header), index]));
    const value = (name) => row[headerIndex.get(normalizeKey(name))];
    const date = letualBusinessDate(row[1], value('Период выгрузки'));
    if (!withinWindow(date, options)) continue;
    const articleKey = normalizeText(value('Артикул'));
    if (!articleKey || normalizeKey(articleKey) === 'артикул') continue;
    const warehouseBreakdown = {};
    for (let column = 0; column < headers.length; column += 1) {
      const header = normalizeText(headers[column]);
      const separator = header.lastIndexOf('.');
      if (separator <= 0) continue;
      const warehouse = normalizeText(header.slice(0, separator));
      const metric = metricName(header.slice(separator + 1));
      if (!metric) continue;
      warehouseBreakdown[warehouse] ||= {};
      warehouseBreakdown[warehouse][metric] = numberOrZero(row[column]);
    }
    const total = warehouseBreakdown['Всего'] || {};
    const activeWarehouses = Object.fromEntries(Object.entries(warehouseBreakdown)
      .filter(([warehouse, metrics]) => warehouse !== 'Всего' && Object.values(metrics).some((item) => numberOrZero(item) !== 0)));
    records.push({
      platformKey: 'letu',
      date,
      exportDate: isoDate(value('Дата выгрузки')),
      legalEntity: normalizeText(row[0]),
      articleKey,
      externalId: normalizeText(value('Артикул Алькор')),
      barcode: normalizeText(value('Штрихкод')).replace(/\s+/g, ''),
      name: normalizeText(value('Название товара')) || articleKey,
      ordersUnits: numberOrZero(total.ordersUnits),
      ordersRevenue: numberOrZero(total.ordersRevenue),
      transitUnits: numberOrZero(total.transitUnits),
      transitRevenue: numberOrZero(total.transitRevenue),
      deliveredUnits: numberOrZero(total.deliveredUnits),
      deliveredRevenue: numberOrZero(total.deliveredRevenue),
      stock: numberOrZero(total.stock),
      warehouseBreakdown: activeWarehouses,
      source: 'google-sheets-retail-daily/letu',
      sourceRow: rowIndex + 1
    });
  }
  return dedupeLatest(records);
}

function parseZyaRows(rows, options) {
  const records = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    if (normalizeKey(row[0]) === 'наименование') continue;
    const date = isoDate(row[14]);
    if (!withinWindow(date, options)) continue;
    const articleKey = normalizeText(row[2]);
    if (!articleKey) continue;
    records.push({
      platformKey: 'goldapple',
      date,
      exportDate: '',
      legalEntity: normalizeText(row[13]),
      articleKey,
      externalId: normalizeText(row[1]),
      barcode: normalizeText(row[3]).replace(/[\s,.]+/g, ''),
      name: normalizeText(row[0]) || articleKey,
      ordersRevenue: numberOrZero(row[4]),
      deliveredRevenue: numberOrZero(row[5]),
      transitRevenue: numberOrZero(row[6]),
      cancelRevenue: numberOrZero(row[7]),
      ordersUnits: numberOrZero(row[8]),
      deliveredUnits: numberOrZero(row[9]),
      transitUnits: numberOrZero(row[10]),
      cancellationsUnits: numberOrZero(row[11]),
      returnsUnits: numberOrZero(row[12]),
      source: 'google-sheets-retail-daily/zya',
      sourceRow: rowIndex + 1
    });
  }
  return dedupeLatest(records);
}

function parseMegamarketRows(rows, options) {
  const records = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    if (normalizeKey(row[0]) === 'sku') continue;
    const date = isoDate(row[10]);
    if (!withinWindow(date, options)) continue;
    const articleKey = normalizeText(row[8]) || normalizeText(row[0]);
    if (!articleKey) continue;
    const units = numberOrZero(row[2]);
    const revenue = numberOrZero(row[4]);
    const cogs = numberOrZero(row[5]);
    const netPayout = numberOrZero(row[6]);
    records.push({
      platformKey: 'megamarket',
      date,
      exportDate: '',
      legalEntity: normalizeText(row[9]),
      articleKey,
      externalId: normalizeText(row[0]),
      barcode: '',
      name: normalizeText(row[1]) || articleKey,
      ordersUnits: units,
      ordersRevenue: revenue,
      deliveredUnits: units,
      deliveredRevenue: revenue,
      returnsUnits: numberOrZero(row[3]),
      cogs,
      netPayout,
      commission: numberOrZero(row[7]),
      financialResult: netPayout - cogs,
      source: 'google-sheets-retail-daily/megamarket',
      sourceRow: rowIndex + 1
    });
  }
  return dedupeLatest(records);
}

function dedupeLatest(records) {
  const byKey = new Map();
  let duplicateRows = 0;
  for (const record of records) {
    const key = [record.platformKey, record.date, record.legalEntity, record.articleKey].join('|');
    const existing = byKey.get(key);
    if (existing) duplicateRows += 1;
    if (!existing || (record.exportDate || '') > (existing.exportDate || '')
      || ((record.exportDate || '') === (existing.exportDate || '') && record.sourceRow > existing.sourceRow)) {
      byKey.set(key, record);
    }
  }
  const result = [...byKey.values()];
  Object.defineProperty(result, 'duplicateRows', { value: duplicateRows, enumerable: false });
  return result;
}

function parseRetailWorkbook(workbook, options = {}) {
  const parseOptions = { from: isoDate(options.from), to: isoDate(options.to) };
  const platforms = {
    goldapple: parseZyaRows(sheetRows(workbook, 'зя'), parseOptions),
    letu: parseLetualRows(sheetRows(workbook, 'лету'), parseOptions),
    megamarket: parseMegamarketRows(sheetRows(workbook, 'мм'), parseOptions)
  };
  return platforms;
}

function emptyTotals() {
  return {
    units: 0, revenue: 0, ordersUnits: 0, ordersRevenue: 0,
    deliveredUnits: 0, deliveredRevenue: 0, buyoutUnits: 0, buyoutRevenue: 0,
    transitUnits: 0, transitRevenue: 0, cancellationsUnits: 0, cancelRevenue: 0,
    returnsUnits: 0, stock: 0, cogs: 0, commission: 0, netPayout: 0,
    financeTurnover: 0, financialResult: 0, estimatedMargin: 0
  };
}

function addRecord(totals, record) {
  totals.ordersUnits += numberOrZero(record.ordersUnits);
  totals.ordersRevenue += numberOrZero(record.ordersRevenue);
  totals.deliveredUnits += numberOrZero(record.deliveredUnits);
  totals.deliveredRevenue += numberOrZero(record.deliveredRevenue);
  totals.buyoutUnits += numberOrZero(record.deliveredUnits);
  totals.buyoutRevenue += numberOrZero(record.deliveredRevenue);
  totals.transitUnits += numberOrZero(record.transitUnits);
  totals.transitRevenue += numberOrZero(record.transitRevenue);
  totals.cancellationsUnits += numberOrZero(record.cancellationsUnits);
  totals.cancelRevenue += numberOrZero(record.cancelRevenue);
  totals.returnsUnits += numberOrZero(record.returnsUnits);
  totals.stock += numberOrZero(record.stock);
  totals.cogs += numberOrZero(record.cogs);
  totals.commission += numberOrZero(record.commission);
  totals.netPayout += numberOrZero(record.netPayout);
  totals.financialResult += numberOrZero(record.financialResult);
  totals.estimatedMargin += numberOrZero(record.financialResult);
  totals.units += numberOrZero(record.ordersUnits);
  totals.revenue += numberOrZero(record.ordersRevenue);
  totals.financeTurnover += record.platformKey === 'megamarket'
    ? numberOrZero(record.netPayout)
    : numberOrZero(record.ordersRevenue);
  return totals;
}

function finalizePoint(date, totals, source) {
  const point = { date, label: date };
  for (const [key, value] of Object.entries(totals)) point[key] = round(value);
  point.price = point.ordersUnits > 0 ? round(point.ordersRevenue / point.ordersUnits) : 0;
  point.source = source;
  return point;
}

function refreshOffsets(series) {
  const sorted = [...series].sort((left, right) => left.date.localeCompare(right.date));
  const latestIndex = sorted.length - 1;
  return sorted.map((point, index) => ({ ...point, label: point.date, dayOffset: latestIndex - index }));
}

function monthlyFromDaily(daily) {
  const byMonth = new Map();
  for (const point of daily) {
    const monthKey = point.date.slice(0, 7);
    const current = byMonth.get(monthKey) || { ...emptyTotals(), monthKey, date: `${monthKey}-01`, stock: 0, latestDate: '' };
    for (const key of Object.keys(emptyTotals())) {
      if (key === 'stock') continue;
      current[key] += numberOrZero(point[key]);
    }
    if (point.date >= current.latestDate) {
      current.latestDate = point.date;
      current.stock = numberOrZero(point.stock);
    }
    byMonth.set(monthKey, current);
  }
  return [...byMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey)).map((month) => {
    const { latestDate, ...clean } = month;
    for (const key of Object.keys(emptyTotals())) clean[key] = round(clean[key]);
    clean.price = clean.ordersUnits > 0 ? round(clean.ordersRevenue / clean.ordersUnits) : 0;
    clean.avgOrderValue = clean.price;
    clean.buyoutPct = clean.ordersUnits > 0 ? round(clean.deliveredUnits / clean.ordersUnits, 6) : null;
    return clean;
  });
}

function aggregatePlatform(records, existingPlatform = {}) {
  const meta = PLATFORM_META[records[0]?.platformKey] || {};
  const source = records[0]?.source || '';
  const dateTotals = new Map();
  const articleMap = new Map();
  const latestWarehouseTotals = new Map();
  for (const record of records) {
    addRecord(dateTotals.get(record.date) || dateTotals.set(record.date, emptyTotals()).get(record.date), record);
    const article = articleMap.get(record.articleKey) || {
      articleKey: record.articleKey,
      article: record.articleKey,
      sourceArticleKey: record.articleKey,
      sourceArticleKeys: [record.articleKey],
      name: record.name,
      barcode: record.barcode,
      externalId: record.externalId,
      dailyTotals: new Map()
    };
    addRecord(article.dailyTotals.get(record.date) || article.dailyTotals.set(record.date, emptyTotals()).get(record.date), record);
    articleMap.set(record.articleKey, article);
  }
  const series = refreshOffsets([...dateTotals.entries()].map(([date, totals]) => finalizePoint(date, totals, source)));
  const existingArticles = new Map((Array.isArray(existingPlatform.articles) ? existingPlatform.articles : [])
    .map((article) => [normalizeText(article.articleKey || article.article), article]));
  const articles = [...articleMap.values()].map((article) => {
    const preserved = existingArticles.get(article.articleKey) || {};
    const dailyFull = refreshOffsets([...article.dailyTotals.entries()].map(([date, totals]) => finalizePoint(date, totals, source)));
    const latest = dailyFull[dailyFull.length - 1] || {};
    const recentFrom = latest.date ? addDays(latest.date, -119) : '';
    const daily = refreshOffsets(dailyFull.filter((point) => !recentFrom || point.date >= recentFrom));
    const latestWithPrice = [...dailyFull].reverse().find((point) => numberOrZero(point.price) > 0) || {};
    const monthly = monthlyFromDaily(dailyFull);
    return {
      ...preserved,
      platformKey: records[0].platformKey,
      platformLabel: meta.label,
      articleKey: article.articleKey,
      article: article.article,
      sourceArticleKey: article.sourceArticleKey,
      sourceArticleKeys: article.sourceArticleKeys,
      skuMatched: preserved.skuMatched === true,
      name: article.name,
      barcode: article.barcode,
      externalId: article.externalId,
      currentPrice: numberOrZero(latestWithPrice.price) || numberOrZero(preserved.currentPrice),
      currentClientPrice: numberOrZero(latestWithPrice.price) || numberOrZero(preserved.currentClientPrice),
      currentFillPrice: numberOrZero(latestWithPrice.price) || numberOrZero(preserved.currentFillPrice),
      stock: numberOrZero(latest.stock),
      monthly,
      daily,
      source
    };
  }).sort((a, b) => a.articleKey.localeCompare(b.articleKey, 'ru'));
  const revenue = articles.reduce((sum, article) => sum + article.monthly.reduce((inner, month) => inner + numberOrZero(month.revenue), 0), 0);
  const matched = articles.filter((article) => article.skuMatched);
  const matchedRevenue = matched.reduce((sum, article) => sum + article.monthly.reduce((inner, month) => inner + numberOrZero(month.revenue), 0), 0);
  const latestDate = series[series.length - 1]?.date || '';
  const latestRecords = records.filter((record) => record.date === latestDate);
  for (const record of latestRecords) {
    for (const [warehouse, metrics] of Object.entries(record.warehouseBreakdown || {})) {
      const current = latestWarehouseTotals.get(warehouse) || {};
      for (const [key, value] of Object.entries(metrics)) current[key] = round(numberOrZero(current[key]) + numberOrZero(value));
      latestWarehouseTotals.set(warehouse, current);
    }
  }
  return {
    key: records[0]?.platformKey || '',
    label: meta.label,
    series,
    articles,
    diagnostics: {
      articleCount: articles.length,
      matchedArticleCount: matched.length,
      unmatchedArticleCount: articles.length - matched.length,
      revenue: round(revenue),
      matchedRevenue: round(matchedRevenue),
      unmatchedRevenue: round(revenue - matchedRevenue),
      matchRate: articles.length ? round(matched.length / articles.length, 4) : 0,
      revenueMatchRate: revenue ? round(matchedRevenue / revenue, 4) : 0,
      source,
      firstDate: series[0]?.date || '',
      latestDate,
      sourceRows: records.length,
      duplicateRowsRemoved: records.duplicateRows || 0,
      latestWarehouseTotals: Object.fromEntries(latestWarehouseTotals)
    }
  };
}

function mergeSeriesWindow(existingSeries, sourceSeries) {
  if (!sourceSeries.length) return refreshOffsets(existingSeries || []);
  const from = sourceSeries[0].date;
  const to = sourceSeries[sourceSeries.length - 1].date;
  const byDate = new Map();
  for (const point of Array.isArray(existingSeries) ? existingSeries : []) {
    const date = isoDate(point.date || point.label);
    if (date && (date < from || date > to)) byDate.set(date, { ...point, date, label: date });
  }
  for (const point of sourceSeries) byDate.set(point.date, point);
  return refreshOffsets([...byDate.values()]);
}

function buildAllSeries(platforms) {
  const byDate = new Map();
  for (const platform of platforms) {
    if (platform.key === 'all') continue;
    for (const point of Array.isArray(platform.series) ? platform.series : []) {
      const date = isoDate(point.date || point.label);
      if (!date) continue;
      const current = byDate.get(date) || emptyTotals();
      for (const key of Object.keys(emptyTotals())) current[key] += numberOrZero(point[key]);
      byDate.set(date, current);
    }
  }
  return refreshOffsets([...byDate.entries()].map(([date, totals]) => finalizePoint(date, totals, 'platform-series-sum')));
}

function updatePayload(basePayload, parsedPlatforms, options = {}) {
  const next = JSON.parse(JSON.stringify(basePayload || {}));
  const existing = new Map((Array.isArray(next.platforms) ? next.platforms : []).map((platform) => [platform.key, platform]));
  const statusPlatforms = {};
  for (const key of TARGET_PLATFORMS) {
    const records = parsedPlatforms[key] || [];
    if (!records.length) {
      statusPlatforms[key] = { key, label: PLATFORM_META[key].label, status: 'empty', latestDate: '' };
      continue;
    }
    const aggregate = aggregatePlatform(records, existing.get(key) || {});
    const previous = existing.get(key) || {};
    existing.set(key, {
      ...previous,
      ...aggregate,
      series: mergeSeriesWindow(previous.series, aggregate.series),
      source: aggregate.diagnostics.source
    });
    statusPlatforms[key] = {
      key,
      label: aggregate.label,
      status: aggregate.diagnostics.latestDate === options.to ? 'fresh' : 'lagging',
      firstDate: aggregate.diagnostics.firstDate,
      latestDate: aggregate.diagnostics.latestDate,
      lagDays: lagDays(aggregate.diagnostics.latestDate, options.to),
      sourceRows: aggregate.diagnostics.sourceRows,
      duplicateRowsRemoved: aggregate.diagnostics.duplicateRowsRemoved,
      articleCount: aggregate.diagnostics.articleCount,
      latestTotals: aggregate.series[aggregate.series.length - 1] || {},
      latestWarehouseTotals: aggregate.diagnostics.latestWarehouseTotals
    };
  }
  const order = ['goldapple', 'letu', 'megamarket', 'samokat', 'magnit', 'wb', 'ozon', 'ya'];
  const platforms = order.map((key) => existing.get(key)).filter(Boolean);
  const allExisting = existing.get('all') || {};
  platforms.push({ ...allExisting, key: 'all', label: allExisting.label || 'Все площадки', series: buildAllSeries(platforms) });
  next.platforms = platforms;
  next.generatedAt = new Date().toISOString();
  next.latestMarketplaceDate = platforms.find((platform) => platform.key === 'all')?.series?.at(-1)?.date || next.latestMarketplaceDate || '';
  next.note = 'Retail-network daily facts refreshed directly from Google Sheets raw tabs; monthly values are not distributed across days.';
  const previousExtra = next.extraMarketplace && typeof next.extraMarketplace === 'object' ? next.extraMarketplace : {};
  const previousExtraPlatforms = previousExtra.platforms && typeof previousExtra.platforms === 'object' ? previousExtra.platforms : {};
  const extraPlatforms = { ...previousExtraPlatforms };
  for (const key of TARGET_PLATFORMS) {
    const platform = existing.get(key);
    if (!platform) continue;
    extraPlatforms[key] = {
      ...(previousExtraPlatforms[key] || {}),
      key,
      label: PLATFORM_META[key].label,
      supportKey: PLATFORM_META[key].supportKey,
      diagnostics: platform.diagnostics,
      articles: platform.articles,
      source: platform.source
    };
  }
  next.extraMarketplace = {
    ...previousExtra,
    generatedAt: next.generatedAt,
    asOfDate: options.to,
    source: 'google-sheets-retail-daily',
    workbook: `google-sheet:${options.sourceId || DEFAULT_SOURCE_ID}`,
    platforms: extraPlatforms
  };
  return {
    payload: next,
    status: {
      schema: 'retail-network-source-status-v1',
      generatedAt: next.generatedAt,
      cutoffDate: options.to,
      source: `google-sheet:${options.sourceId || DEFAULT_SOURCE_ID}`,
      platforms: {
        ...statusPlatforms,
        samokat: {
          key: 'samokat',
          label: PLATFORM_META.samokat.label,
          status: existing.get('samokat')?.series?.length ? 'api-existing' : 'missing',
          latestDate: existing.get('samokat')?.series?.at(-1)?.date || '',
          note: 'Samokat requires a private API endpoint and response schema; token is configured separately.'
        }
      }
    }
  };
}

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function loadServiceAccount() {
  const inline = process.env.ALTEA_GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '';
  if (inline) return JSON.parse(inline);
  const filePath = process.env.ALTEA_GOOGLE_SERVICE_ACCOUNT_JSON_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
  if (filePath && fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return null;
}

async function serviceAccountAccessToken(serviceAccount) {
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) throw new Error('Google service account JSON must include client_email and private_key');
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: GOOGLE_DRIVE_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), serviceAccount.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!response.ok) throw new Error(`Google service account token request failed with HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('Google service account token response did not include access_token');
  return payload.access_token;
}

async function downloadWorkbook(sourceId) {
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) throw new Error('Google service account is not configured for the private retail-network workbook');
  const accessToken = await serviceAccountAccessToken(serviceAccount);
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sourceId)}/export?mimeType=${encodeURIComponent(mime)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google Drive workbook export failed with HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.slice(0, 2).toString('utf8') !== 'PK') throw new Error('Google Drive export did not return an XLSX workbook');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altea-retail-network-'));
  const workbookPath = path.join(tempDir, 'retail-network-daily.xlsx');
  fs.writeFileSync(workbookPath, bytes);
  return { workbookPath, cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }) };
}

function readJson(filePath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')); } catch { return fallback; }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function buildPreservedSourceStatus(base, options, error) {
  const platformMap = new Map((Array.isArray(base?.platforms) ? base.platforms : [])
    .map((platform) => [platform?.key, platform]));
  const platforms = {};
  for (const key of TARGET_PLATFORMS) {
    const series = Array.isArray(platformMap.get(key)?.series) ? platformMap.get(key).series : [];
    const latestDate = series.map((point) => isoDate(point?.date || point?.label)).filter(Boolean).sort().at(-1) || '';
    platforms[key] = {
      key,
      label: PLATFORM_META[key].label,
      status: latestDate === options.to ? 'preserved' : (latestDate ? 'stale' : 'missing'),
      latestDate,
      lagDays: lagDays(latestDate, options.to),
      note: 'Preserved from the committed finalized daily snapshot because the private Google Sheet could not be exported.'
    };
  }
  const samokatSeries = Array.isArray(platformMap.get('samokat')?.series) ? platformMap.get('samokat').series : [];
  const samokatLatest = samokatSeries.map((point) => isoDate(point?.date || point?.label)).filter(Boolean).sort().at(-1) || '';
  platforms.samokat = {
    key: 'samokat',
    label: PLATFORM_META.samokat.label,
    status: samokatLatest ? 'api-existing' : 'missing',
    latestDate: samokatLatest,
    note: 'Samokat requires a private API endpoint and response schema; token is configured separately.'
  };
  const stale = TARGET_PLATFORMS.filter((key) => platforms[key].latestDate !== options.to);
  const blocking = TARGET_PLATFORMS.filter((key) => exceedsAllowedLag(platforms[key].latestDate, options.to, options.maxLagDays));
  return {
    status: {
      schema: 'retail-network-source-status-v1',
      generatedAt: new Date().toISOString(),
      cutoffDate: options.to,
      source: `preserved-platform-trends:${options.inputFile}`,
      status: stale.length ? 'stale' : 'preserved',
      reason: error.message,
      platforms
    },
    stale,
    blocking
  };
}

async function main(argv = process.argv) {
  const options = resolveOptions(parseArgs(argv));
  if (options.command !== 'sync') throw new Error(`Unsupported command: ${options.command}`);
  let workbookSource = null;
  try {
    if (options.workbookPath) {
      if (!fs.existsSync(options.workbookPath)) throw new Error(`Workbook not found: ${options.workbookPath}`);
      workbookSource = { workbookPath: options.workbookPath, cleanup: () => {} };
    } else {
      workbookSource = await downloadWorkbook(options.sourceId);
    }
  } catch (error) {
    if (!options.optionalSource) throw error;
    const base = readJson(options.inputFile, { platforms: [] });
    const preserved = buildPreservedSourceStatus(base, options, error);
    const status = preserved.status;
    if (!options.dryRun) writeJson(options.statusFile, status);
    console.log(JSON.stringify(status, null, 2));
    if (options.strict && preserved.blocking.length) {
      throw new Error(`Private retail-network source is unavailable and the preserved facts exceed the allowed ${options.maxLagDays}-day lag for ${options.to}: ${preserved.blocking.map((key) => `${key}:${status.platforms[key].latestDate || 'empty'}`).join(', ')}`);
    }
    return;
  }
  try {
    const workbook = XLSX.readFile(workbookSource.workbookPath, { cellDates: false });
    const parsed = parseRetailWorkbook(workbook, options);
    const base = readJson(options.inputFile, { platforms: [] });
    const result = updatePayload(base, parsed, options);
    const stale = Object.values(result.status.platforms).filter((platform) => TARGET_PLATFORMS.includes(platform.key) && platform.status !== 'fresh');
    const blocking = stale.filter((platform) => exceedsAllowedLag(platform.latestDate, options.to, options.maxLagDays));
    if (options.strict && blocking.length) throw new Error(`Retail-network sources exceed the allowed ${options.maxLagDays}-day lag for ${options.to}: ${blocking.map((item) => `${item.key}:${item.latestDate || 'empty'}`).join(', ')}`);
    if (!options.dryRun) {
      writeJson(options.outputFile, result.payload);
      writeJson(options.statusFile, result.status);
    }
    console.log(JSON.stringify({
      dryRun: options.dryRun,
      cutoffDate: options.to,
      inputFile: options.inputFile,
      outputFile: options.outputFile,
      statusFile: options.statusFile,
      platforms: Object.fromEntries(Object.entries(result.status.platforms).map(([key, value]) => [key, {
        status: value.status,
        latestDate: value.latestDate,
        sourceRows: value.sourceRows || 0,
        duplicateRowsRemoved: value.duplicateRowsRemoved || 0,
        articleCount: value.articleCount || 0
      }]))
    }, null, 2));
  } finally {
    workbookSource.cleanup();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_SOURCE_ID,
  TARGET_PLATFORMS,
  aggregatePlatform,
  buildPreservedSourceStatus,
  dedupeLatest,
  exceedsAllowedLag,
  isoDate,
  lagDays,
  letualBusinessDate,
  moscowDateKey,
  numberOrZero,
  parseArgs,
  parseRetailWorkbook,
  resolveOptions,
  updatePayload
};
