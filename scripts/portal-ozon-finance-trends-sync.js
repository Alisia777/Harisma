#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'https://api-seller.ozon.ru';

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

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/giu, '');
}

function isoDate(value) {
  const raw = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(from, to) {
  const result = [];
  for (let cursor = from; cursor && to && cursor <= to; cursor = addDays(cursor, 1)) {
    result.push(cursor);
  }
  return result;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function resolveOptions(args) {
  const root = process.cwd();
  const to = isoDate(args.to || args['date-to'] || new Date().toISOString().slice(0, 10));
  const from = isoDate(args.from || args['date-from'] || `${to.slice(0, 7)}-01`);
  return {
    clientId: String(args['client-id'] || process.env.ALTEA_OZON_CLIENT_ID || '').trim(),
    apiKey: String(args['api-key'] || process.env.ALTEA_OZON_API_KEY || '').trim(),
    apiBaseUrl: String(args['api-base-url'] || API_BASE_URL).replace(/\/+$/, ''),
    skusPath: path.resolve(args['skus-file'] || path.join(root, 'data', 'skus.json')),
    inputPath: path.resolve(args['input-file'] || path.join(root, 'data', 'platform_trends.json')),
    outputPath: path.resolve(args['output-file'] || path.join(root, 'data', 'platform_trends.json')),
    from,
    to
  };
}

function skuMaps(skus) {
  const byOfferId = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    for (const value of [
      sku?.articleKey,
      sku?.article,
      sku?.ozon?.offerId,
      sku?.ozon?.offer_id,
      sku?.ozon?.sku
    ]) {
      const key = normalizeKey(value);
      if (key && !byOfferId.has(key)) byOfferId.set(key, sku);
    }
  }
  return { byOfferId };
}

function marginForSku(sku) {
  return numberOrZero(sku?.ozon?.marginPct);
}

async function ozonRequest(options, body) {
  const response = await fetch(`${options.apiBaseUrl}/v1/finance/realization/by-day`, {
    method: 'POST',
    headers: {
      'Client-Id': options.clientId,
      'Api-Key': options.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(`Ozon finance API failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return payload;
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function extractQuantity(row) {
  return (
    numberOrZero(row?.delivery_commission?.quantity)
    || numberOrZero(row?.return_commission?.quantity)
    || numberOrZero(row?.quantity)
    || 1
  );
}

function extractRevenue(row, quantity) {
  const sellerPrice = numberOrZero(row?.seller_price_per_instance);
  if (sellerPrice > 0) return sellerPrice * Math.max(1, quantity);
  const deliveryTotal = numberOrZero(row?.delivery_commission?.total);
  if (deliveryTotal > 0) return deliveryTotal;
  const returnTotal = numberOrZero(row?.return_commission?.total);
  if (returnTotal > 0) return returnTotal;
  return 0;
}

function clonePoint(point = {}) {
  return {
    dayOffset: numberOrZero(point.dayOffset),
    label: isoDate(point.label || point.date),
    units: numberOrZero(point.units),
    revenue: numberOrZero(point.revenue),
    estimatedMargin: numberOrZero(point.estimatedMargin)
  };
}

function platformMap(platformTrends) {
  const map = new Map();
  for (const platform of Array.isArray(platformTrends?.platforms) ? platformTrends.platforms : []) {
    map.set(String(platform?.key || '').trim(), platform);
  }
  return map;
}

function mergeAllSeries(platforms) {
  const dateSet = new Set();
  for (const key of ['wb', 'ozon', 'ya']) {
    for (const point of platforms.get(key)?.series || []) {
      const date = isoDate(point?.label || point?.date);
      if (date) dateSet.add(date);
    }
  }
  const dates = Array.from(dateSet).sort();
  const latestIndex = dates.length - 1;
  return dates.map((date, index) => {
    const total = { units: 0, revenue: 0, estimatedMargin: 0 };
    for (const key of ['wb', 'ozon', 'ya']) {
      const point = (platforms.get(key)?.series || []).find((item) => isoDate(item?.label || item?.date) === date);
      if (!point) continue;
      total.units += numberOrZero(point.units);
      total.revenue += numberOrZero(point.revenue);
      total.estimatedMargin += numberOrZero(point.estimatedMargin);
    }
    return {
      dayOffset: latestIndex - index,
      label: date,
      units: Number(total.units.toFixed(4)),
      revenue: Number(total.revenue.toFixed(4)),
      estimatedMargin: Number(total.estimatedMargin.toFixed(4))
    };
  });
}

function buildDayBuckets(rows, skus, dateKey, apiOk = true) {
  const { byOfferId } = skuMaps(skus);
  const all = { units: 0, revenue: 0, estimatedMargin: 0, sourceRows: 0, matchedRows: 0 };
  const matched = { units: 0, revenue: 0, estimatedMargin: 0, sourceRows: 0, matchedRows: 0 };

  for (const row of Array.isArray(rows) ? rows : []) {
    const offerId = normalizeKey(row?.item?.offer_id || row?.item?.offerId || row?.offer_id || row?.offerId || row?.item?.sku || row?.sku);
    const sku = byOfferId.get(offerId);
    const quantity = extractQuantity(row);
    const revenue = extractRevenue(row, quantity);

    all.sourceRows += 1;
    all.units += quantity;
    all.revenue += revenue;
    if (sku) {
      all.matchedRows += 1;
      all.estimatedMargin += revenue * marginForSku(sku);
    }

    if (sku) {
      matched.sourceRows += 1;
      matched.matchedRows += 1;
      matched.units += quantity;
      matched.revenue += revenue;
      matched.estimatedMargin += revenue * marginForSku(sku);
    }
  }

  return {
    date: dateKey,
    apiOk,
    all,
    matched
  };
}

function materializePoint(dateKey, bucket, mode, fallbackPoint = null, dayOffset = 0) {
  const selected = mode === 'matched' ? bucket.matched : bucket.all;
  if (selected.sourceRows === 0 && fallbackPoint) {
    return {
      dayOffset,
      label: dateKey,
      units: Number(numberOrZero(fallbackPoint.units).toFixed(4)),
      revenue: Number(numberOrZero(fallbackPoint.revenue).toFixed(4)),
      estimatedMargin: Number(numberOrZero(fallbackPoint.estimatedMargin).toFixed(4))
    };
  }
  return {
    dayOffset,
    label: dateKey,
    units: Number(numberOrZero(selected.units).toFixed(4)),
    revenue: Number(numberOrZero(selected.revenue).toFixed(4)),
    estimatedMargin: Number(numberOrZero(selected.estimatedMargin).toFixed(4))
  };
}

async function fetchExistingPoints(options) {
  const existing = readJson(options.inputPath, { platforms: [] });
  const platform = (Array.isArray(existing?.platforms) ? existing.platforms : []).find((item) => String(item?.key || '').trim() === 'ozon');
  const map = new Map();
  for (const point of Array.isArray(platform?.series) ? platform.series : []) {
    const date = isoDate(point?.label || point?.date);
    if (!date) continue;
    map.set(date, clonePoint(point));
  }
  const warningDates = new Set(
    (Array.isArray(existing?.ozonApiDirect?.warnings) ? existing.ozonApiDirect.warnings : [])
      .map((warning) => isoDate(String(warning || '').slice(0, 10)))
      .filter(Boolean)
  );
  return { existing, map, warningDates };
}

async function fetchDayReport(options, dateKey) {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const body = { day, month, year };
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const payload = await ozonRequest(options, body);
      return { ok: true, rows: extractRows(payload), warnings: [] };
    } catch (error) {
      const status = Number(error?.status || 0);
      const soft = status === 404 || status === 409 || status === 403;
      if (attempt < attempts && (status === 429 || !soft)) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }
      if (soft) {
        return {
          ok: false,
          rows: [],
          warnings: [`${dateKey}: Ozon API returned HTTP ${status}`]
        };
      }
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }
      return {
        ok: false,
        rows: [],
        warnings: [`${dateKey}: ${String(error?.message || error)}`]
      };
    }
  }
  return { ok: false, rows: [], warnings: [`${dateKey}: Ozon API failed without payload`] };
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (!options.clientId || !options.apiKey) {
    console.warn('Ozon API credentials are not set. Preserve existing platform_trends.json and skip Ozon refresh.');
    process.exitCode = 0;
    return;
  }

  const skus = readJson(options.skusPath, []);
  const { existing, map: existingOzonSeries, warningDates: existingWarningDates } = await fetchExistingPoints(options);
  const existingPlatforms = platformMap(existing);
  const dates = enumerateDates(options.from, options.to);
  const buckets = new Map();
  const warnings = [];
  let sourceRows = 0;
  let matchedRows = 0;

  for (const dateKey of dates) {
    const result = await fetchDayReport(options, dateKey);
    warnings.push(...(result.warnings || []));
    const bucket = buildDayBuckets(result.rows, skus, dateKey, result.ok);
    buckets.set(dateKey, bucket);
    sourceRows += bucket.all.sourceRows;
    matchedRows += bucket.all.matchedRows;
  }

  const useMatched = matchedRows > 0 && matchedRows / Math.max(1, sourceRows) >= 0.5;
  const selectedMode = useMatched ? 'matched' : 'all';
  const rawSeries = dates.map((dateKey) => {
    const bucket = buckets.get(dateKey) || {
      date: dateKey,
      apiOk: false,
      all: { units: 0, revenue: 0, estimatedMargin: 0, sourceRows: 0, matchedRows: 0 },
      matched: { units: 0, revenue: 0, estimatedMargin: 0, sourceRows: 0, matchedRows: 0 }
    };
    const fallbackPoint = existingWarningDates.has(dateKey) ? null : existingOzonSeries.get(dateKey) || null;
    const selected = selectedMode === 'matched' ? bucket.matched : bucket.all;
    if (!bucket.apiOk && selected.sourceRows === 0 && !fallbackPoint) return null;
    const point = materializePoint(dateKey, bucket, selectedMode, fallbackPoint, 0);
    return { dateKey, point };
  }).filter(Boolean);
  const series = rawSeries.map(({ dateKey, point }, index) => {
    const dayOffset = rawSeries.length - 1 - index;
    return {
      dayOffset,
      label: point.label || dateKey,
      units: Number(point.units.toFixed(4)),
      revenue: Number(point.revenue.toFixed(4)),
      estimatedMargin: Number(point.estimatedMargin.toFixed(4))
    };
  });

  const latestMarketplaceDate = series.map((item) => item.label).filter(Boolean).sort().pop() || existing.latestMarketplaceDate || '';
  const platforms = ['wb', 'ozon', 'ya', 'all']
    .map((key) => existingPlatforms.get(key) || { key, label: key, series: [] });
  const ozonIndex = platforms.findIndex((platform) => String(platform?.key || '').trim() === 'ozon');
  const ozonSeries = series;
  if (ozonIndex >= 0) {
    platforms[ozonIndex] = {
      key: 'ozon',
      label: 'Ozon',
      series: ozonSeries
    };
  } else {
    platforms.splice(1, 0, {
      key: 'ozon',
      label: 'Ozon',
      series: ozonSeries
    });
  }

  const platformMapNext = new Map(platforms.map((platform) => [String(platform?.key || '').trim(), platform]));
  platformMapNext.set('all', {
    key: 'all',
    label: 'Все площадки',
    series: mergeAllSeries(platformMapNext)
  });

  const ordered = ['wb', 'ozon', 'ya', 'all']
    .map((key) => platformMapNext.get(key) || { key, label: key, series: [] });

  const payload = {
    ...existing,
    generatedAt: new Date().toISOString(),
    latestMarketplaceDate,
    note: 'Marketplace facts refreshed from API-backed platform_trends.json.',
    platforms: ordered,
    ozonApiDirect: {
      source: 'finance-api:/v1/finance/realization/by-day',
      from: options.from,
      to: options.to,
      sourceRows,
      matchedRows,
      matchRate: sourceRows > 0 ? Number((matchedRows / sourceRows).toFixed(4)) : 0,
      sourceMode: selectedMode,
      revenueField: 'seller_price_per_instance',
      unitsField: 'delivery_commission.quantity'
    }
  };

  if (warnings.length) {
    payload.ozonApiDirect.warnings = Array.from(new Set(warnings));
  }

  writeJson(options.outputPath, payload);
  console.log(JSON.stringify({
    outputPath: options.outputPath,
    generatedAt: payload.generatedAt,
    latestMarketplaceDate,
    sourceRows,
    matchedRows,
    sourceMode: selectedMode,
    warnings: payload.ozonApiDirect.warnings || []
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
