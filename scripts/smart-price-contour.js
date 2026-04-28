const fs = require('fs');

function safeReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizeKey(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '');
}

function parseFreshStamp(value) {
  if (!value) return 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = /^\d{4}-\d{2}$/.test(raw)
    ? `${raw}-01T00:00:00Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00Z`
      : raw;
  const stamp = Date.parse(normalized);
  return Number.isFinite(stamp) ? stamp : 0;
}

function asIsoDate(value) {
  if (!value) return '';
  const raw = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function numOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueMissing(value) {
  return value === null || value === undefined || value === ''
    || (Array.isArray(value) && value.length === 0);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function latestSeriesDate(row = {}) {
  let best = '';
  ['daily', 'monthly', 'timeline'].forEach((key) => {
    (Array.isArray(row?.[key]) ? row[key] : []).forEach((point) => {
      const date = asIsoDate(point?.date);
      if (date && date > best) best = date;
    });
  });
  const valueDate = asIsoDate(row?.valueDate || row?.historyFreshnessDate);
  if (valueDate && valueDate > best) best = valueDate;
  return best;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = numOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstPositive(...values) {
  for (const value of values) {
    const parsed = numOrNull(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function workbenchPayloadFreshness(payload = {}) {
  let score = parseFreshStamp(payload?.generatedAt || payload?.updatedAt || payload?.updated_at || '');
  Object.values(payload?.platforms || {}).forEach((bucket) => {
    const rows = Array.isArray(bucket?.rows) ? bucket.rows : Object.values(bucket?.rows || {});
    rows.forEach((row) => {
      ['daily', 'monthly', 'timeline'].forEach((key) => {
        (Array.isArray(row?.[key]) ? row[key] : []).forEach((point) => {
          score = Math.max(score, parseFreshStamp(point?.date));
        });
      });
      score = Math.max(score, parseFreshStamp(row?.valueDate || row?.historyFreshnessDate || ''));
    });
  });
  return score;
}

function workbenchPayloadGeneratedStamp(payload = {}) {
  return parseFreshStamp(payload?.generatedAt || payload?.updatedAt || payload?.updated_at || '');
}

function shouldUseLiveWorkbench(primaryPayload = {}, livePayload = {}) {
  if (!livePayload?.platforms || typeof livePayload.platforms !== 'object') return false;
  const primaryGeneratedStamp = workbenchPayloadGeneratedStamp(primaryPayload);
  const liveGeneratedStamp = workbenchPayloadGeneratedStamp(livePayload);
  if (primaryGeneratedStamp && liveGeneratedStamp) return liveGeneratedStamp >= primaryGeneratedStamp;
  if (primaryGeneratedStamp) return false;
  if (liveGeneratedStamp) return true;
  const primaryFreshness = workbenchPayloadFreshness(primaryPayload);
  const liveFreshness = workbenchPayloadFreshness(livePayload);
  if (!primaryFreshness) return liveFreshness > 0;
  return liveFreshness >= primaryFreshness;
}

function mergeWorkbenchField(target, key, value, force = false) {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value) && value.length === 0) return;
  if (!force && !valueMissing(target[key])) return;
  target[key] = clone(value);
}

function mergeWorkbenchRow(primaryRow = {}, liveRow = {}, platform = '') {
  const next = clone(primaryRow) || {};
  const live = liveRow && typeof liveRow === 'object' ? liveRow : null;
  if (!live) return next;

  [
    'articleKey',
    'article',
    'name',
    'owner',
    'marketplace',
    'currentFillPrice',
    'currentPrice',
    'currentClientPrice',
    'currentSppPct',
    'currentTurnoverDays',
    'monthly',
    'daily',
    'timeline'
  ].forEach((key) => mergeWorkbenchField(next, key, live[key]));

  [
    'productStatus',
    'stockWarehouse',
    'stockWb',
    'stockOzon',
    'stockTotal',
    'turnoverWbDays',
    'turnoverOzonDays',
    'turnoverTotalDays',
    'turnoverCurrentDays'
  ].forEach((key) => mergeWorkbenchField(next, key, live[key], true));

  if (valueMissing(next.marketplace) && platform) next.marketplace = platform;
  return next;
}

function mergeWorkbenchPayload(primaryPayload = {}, livePayload = {}) {
  const primary = primaryPayload && typeof primaryPayload === 'object'
    ? clone(primaryPayload)
    : { generatedAt: '', platforms: {} };
  const liveCandidate = livePayload && typeof livePayload === 'object' ? clone(livePayload) : null;
  const live = shouldUseLiveWorkbench(primary, liveCandidate) ? liveCandidate : null;
  const merged = primary && typeof primary === 'object' ? primary : { generatedAt: '', platforms: {} };
  merged.platforms = merged.platforms && typeof merged.platforms === 'object' ? merged.platforms : {};

  const platformKeys = new Set([
    ...Object.keys(primary?.platforms || {}),
    ...Object.keys(live?.platforms || {})
  ]);

  platformKeys.forEach((platform) => {
    const primaryBucket = primary?.platforms?.[platform] || {};
    const liveBucket = live?.platforms?.[platform] || {};
    const primaryRows = Array.isArray(primaryBucket.rows) ? primaryBucket.rows : [];
    const liveRows = Array.isArray(liveBucket.rows) ? liveBucket.rows : [];
    const liveMap = new Map();

    liveRows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      if (!key || liveMap.has(key)) return;
      liveMap.set(key, row);
    });

    const mergedRows = [];
    const used = new Set();

    primaryRows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      const liveRow = key ? liveMap.get(key) : null;
      if (liveRow && key) used.add(key);
      mergedRows.push(mergeWorkbenchRow(row, liveRow, platform));
    });

    liveRows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      if (!key || used.has(key)) return;
      mergedRows.push(mergeWorkbenchRow({}, row, platform));
    });

    merged.platforms[platform] = {
      ...(clone(primaryBucket) || {}),
      rows: mergedRows
    };
  });

  if (!merged.generatedAt || parseFreshStamp(live?.generatedAt) > parseFreshStamp(merged.generatedAt)) {
    merged.generatedAt = live?.generatedAt || merged.generatedAt || '';
  }
  merged.liveEnrichmentAt = live?.generatedAt || '';
  return merged;
}

function overlayRows(rows) {
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === 'object') return Object.values(rows);
  return [];
}

function overlayFlagEnabled(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function clearOverlayPoint(point = {}, overlayRow = {}) {
  if (overlayFlagEnabled(overlayRow?.clearCurrentFillPrice) || overlayFlagEnabled(overlayRow?.clearCurrentPrice)) point.price = null;
  if (overlayFlagEnabled(overlayRow?.clearCurrentClientPrice)) point.clientPrice = null;
  if (overlayFlagEnabled(overlayRow?.clearCurrentSppPct)) point.sppPct = null;
  if (overlayFlagEnabled(overlayRow?.clearCurrentTurnoverDays)) point.turnoverDays = null;
}

function clearOverlayRowFields(row = {}, overlayRow = {}) {
  if (overlayFlagEnabled(overlayRow?.clearCurrentFillPrice) || overlayFlagEnabled(overlayRow?.clearCurrentPrice)) {
    row.currentFillPrice = null;
    row.currentPrice = null;
  }
  if (overlayFlagEnabled(overlayRow?.clearCurrentClientPrice)) row.currentClientPrice = null;
  if (overlayFlagEnabled(overlayRow?.clearCurrentSppPct)) row.currentSppPct = null;
  if (overlayFlagEnabled(overlayRow?.clearCurrentTurnoverDays)) {
    row.currentTurnoverDays = null;
    row.turnoverCurrentDays = null;
  }
}

function cloneSeries(series) {
  return Array.isArray(series) ? series.map((item) => clone(item) || {}) : [];
}

function overlayTimelineSeries(overlayRow = {}, cutoff = '') {
  const sourceSeries = Array.isArray(overlayRow?.daily)
    ? overlayRow.daily
    : Array.isArray(overlayRow?.monthly)
      ? overlayRow.monthly
      : Array.isArray(overlayRow?.timeline)
        ? overlayRow.timeline
        : [];
  return cloneSeries(sourceSeries)
    .filter((item) => {
      const date = asIsoDate(item?.date);
      if (!date) return false;
      return !cutoff || date <= cutoff;
    })
    .sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')));
}

function applyOverlayPointMetrics(point = {}, source = {}) {
  if (!valueMissing(source?.currentFillPrice)) point.price = source.currentFillPrice;
  else if (!valueMissing(source?.currentPrice)) point.price = source.currentPrice;
  else if (!valueMissing(source?.price)) point.price = source.price;
  if (!valueMissing(source?.currentClientPrice)) point.clientPrice = source.currentClientPrice;
  else if (!valueMissing(source?.clientPrice)) point.clientPrice = source.clientPrice;
  if (!valueMissing(source?.currentSppPct)) point.sppPct = source.currentSppPct;
  else if (!valueMissing(source?.sppPct)) point.sppPct = source.sppPct;
  if (!valueMissing(source?.currentTurnoverDays)) point.turnoverDays = source.currentTurnoverDays;
  else if (!valueMissing(source?.turnoverDays)) point.turnoverDays = source.turnoverDays;
  if (!valueMissing(source?.ordersUnits)) point.ordersUnits = source.ordersUnits;
  if (!valueMissing(source?.deliveredUnits)) point.deliveredUnits = source.deliveredUnits;
  if (!valueMissing(source?.revenue)) point.revenue = source.revenue;
}

function mergeTimelineWithOverlay(series, overlayRow = {}) {
  const nextSeries = cloneSeries(series);
  const valueDate = asIsoDate(overlayRow?.valueDate || overlayRow?.historyFreshnessDate || '');
  if (!valueDate) return nextSeries;

  for (let index = nextSeries.length - 1; index >= 0; index -= 1) {
    const currentDate = asIsoDate(nextSeries[index]?.date);
    if (currentDate && currentDate > valueDate) nextSeries.splice(index, 1);
  }

  const pointsByDate = new Map();
  nextSeries.forEach((item) => {
    const date = asIsoDate(item?.date);
    if (!date || pointsByDate.has(date)) return;
    pointsByDate.set(date, item);
  });

  overlayTimelineSeries(overlayRow, valueDate).forEach((item) => {
    const date = asIsoDate(item?.date);
    if (!date) return;
    let point = pointsByDate.get(date);
    if (!point) {
      point = { date };
      nextSeries.push(point);
      pointsByDate.set(date, point);
    }
    applyOverlayPointMetrics(point, item);
  });

  let point = pointsByDate.get(valueDate);
  if (!point) {
    point = { date: valueDate };
    nextSeries.push(point);
  }
  clearOverlayPoint(point, overlayRow);
  applyOverlayPointMetrics(point, overlayRow);

  nextSeries.sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')));
  return nextSeries;
}

function mergeWorkbenchOverlayRow(primaryRow = {}, overlayRow = {}, platform = '') {
  const next = clone(primaryRow) || {};
  const overlay = overlayRow && typeof overlayRow === 'object' ? overlayRow : null;
  if (!overlay) return next;

  clearOverlayRowFields(next, overlay);
  [
    'articleKey',
    'article',
    'name',
    'brand',
    'owner',
    'status',
    'valueDate',
    'historyFreshnessDate',
    'sourceSheet',
    'sourceMode'
  ].forEach((key) => mergeWorkbenchField(next, key, overlay[key], true));

  [
    'currentFillPrice',
    'currentPrice',
    'currentClientPrice',
    'currentSppPct',
    'currentTurnoverDays',
    'stock',
    'stockWb',
    'stockOzon',
    'stockTotal'
  ].forEach((key) => mergeWorkbenchField(next, key, overlay[key], true));

  if (platform && valueMissing(next.marketplace)) next.marketplace = platform;
  if (!valueMissing(overlay?.status)) next.productStatus = overlay.status;
  next.monthly = mergeTimelineWithOverlay(next.monthly, overlay);
  next.daily = mergeTimelineWithOverlay(next.daily, overlay);
  return next;
}

function mergeWorkbenchOverlay(primaryPayload = {}, overlayPayload = {}) {
  const primary = primaryPayload && typeof primaryPayload === 'object'
    ? clone(primaryPayload)
    : { generatedAt: '', platforms: {} };
  const overlay = overlayPayload && typeof overlayPayload === 'object' ? clone(overlayPayload) : null;
  if (!overlay?.platforms) return primary;

  const merged = primary && typeof primary === 'object' ? primary : { generatedAt: '', platforms: {} };
  merged.platforms = merged.platforms && typeof merged.platforms === 'object' ? merged.platforms : {};

  const platformKeys = new Set([
    ...Object.keys(primary?.platforms || {}),
    ...Object.keys(overlay?.platforms || {})
  ]);

  platformKeys.forEach((platform) => {
    const primaryBucket = primary?.platforms?.[platform] || {};
    const overlayBucket = overlay?.platforms?.[platform] || {};
    const primaryRows = Array.isArray(primaryBucket.rows) ? primaryBucket.rows : [];
    const rows = overlayRows(overlayBucket.rows);
    const overlayMap = new Map();

    rows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      if (!key || overlayMap.has(key)) return;
      overlayMap.set(key, row);
    });

    const mergedRows = [];
    const used = new Set();

    primaryRows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      const overlayRow = key ? overlayMap.get(key) : null;
      if (overlayRow && key) used.add(key);
      mergedRows.push(mergeWorkbenchOverlayRow(row, overlayRow, platform));
    });

    rows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      if (!key || used.has(key)) return;
      mergedRows.push(mergeWorkbenchOverlayRow({}, row, platform));
    });

    merged.platforms[platform] = {
      ...(clone(primaryBucket) || {}),
      rows: mergedRows
    };
  });

  if (!merged.generatedAt || parseFreshStamp(overlay?.generatedAt) > parseFreshStamp(merged.generatedAt)) {
    merged.generatedAt = overlay?.generatedAt || merged.generatedAt || '';
  }
  merged.priceOverlayAt = overlay?.generatedAt || '';
  return merged;
}

function mergeSmartPriceContour(workbenchPayload = {}, overlayPayload = {}, livePayload = {}) {
  const baseWorkbench = mergeWorkbenchPayload(workbenchPayload || {}, livePayload || null);
  return mergeWorkbenchOverlay(baseWorkbench, overlayPayload || null);
}

function rowIndex(payload = {}) {
  const index = {};
  Object.entries(payload?.platforms || {}).forEach(([platform, bucket]) => {
    const rows = Array.isArray(bucket?.rows) ? bucket.rows : [];
    index[platform] = new Map();
    rows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      if (!key || index[platform].has(key)) return;
      index[platform].set(key, row);
    });
  });
  return index;
}

module.exports = {
  asIsoDate,
  clone,
  firstNumber,
  firstPositive,
  latestSeriesDate,
  mergeSmartPriceContour,
  mergeWorkbenchOverlay,
  mergeWorkbenchPayload,
  normalizeKey,
  numOrNull,
  parseFreshStamp,
  rowIndex,
  safeReadJson,
  shouldUseLiveWorkbench,
  valueMissing
};
