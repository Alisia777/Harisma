#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HISTORY_FIELDS = ['daily', 'timeline', 'monthly'];
const CORE_PRICE_PLATFORMS = ['wb', 'ozon', 'ym'];

function isoDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function normalizePlatform(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'ya' || raw === 'yandex' || raw === 'yandex market') return 'ym';
  return raw;
}

function normalizeArticleKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_');
}

function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function nonEmpty(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function rowKey(row = {}) {
  return normalizeArticleKey(
    row.articleKey || row.article || row.sku || row.item_code || row.vendorCode || row.offerId || ''
  );
}

function platformRows(payload = {}, platform = '') {
  const target = normalizePlatform(platform);
  return Object.entries(payload?.platforms || {})
    .filter(([key]) => normalizePlatform(key) === target)
    .flatMap(([, bucket]) => {
      if (Array.isArray(bucket)) return bucket;
      if (Array.isArray(bucket?.rows)) return bucket.rows;
      if (bucket?.rows && typeof bucket.rows === 'object') return Object.values(bucket.rows);
      return [];
    });
}

function pointHasPrice(point = {}) {
  return positive(point.price)
    || positive(point.currentPrice)
    || positive(point.currentFillPrice)
    || positive(point.listPrice)
    || positive(point.firstPrice);
}

function rowHasCurrentPrice(row = {}) {
  return positive(row.currentFillPrice)
    || positive(row.currentPrice)
    || positive(row.listPrice)
    || positive(row.firstPrice);
}

function pointHasClientPrice(point = {}) {
  return positive(point.clientPrice) || positive(point.currentClientPrice);
}

function rowHasCurrentClientPrice(row = {}) {
  return positive(row.currentClientPrice) || positive(row.clientPrice);
}

function rowFactDates(row = {}) {
  const dates = [];
  if (rowHasCurrentPrice(row)) {
    const currentDate = isoDate(
      row.currentPriceDate
      || row.currentFillPriceDate
      || row.valueDate
      || row.historyFreshnessDate
    );
    if (currentDate) dates.push(currentDate);
  }
  HISTORY_FIELDS.forEach((field) => {
    (Array.isArray(row?.[field]) ? row[field] : []).forEach((point) => {
      if (!pointHasPrice(point)) return;
      const date = isoDate(point.date || point.label);
      if (date) dates.push(date);
    });
  });
  return dates;
}

function rowLatestFactDate(row = {}) {
  return rowFactDates(row).sort().pop() || '';
}

function rowClientFactDates(row = {}) {
  const dates = [];
  if (rowHasCurrentClientPrice(row)) {
    const currentDate = isoDate(
      row.currentClientPriceDate
      || row.currentPriceDate
      || row.valueDate
      || row.historyFreshnessDate
    );
    if (currentDate) dates.push(currentDate);
  }
  HISTORY_FIELDS.forEach((field) => {
    (Array.isArray(row?.[field]) ? row[field] : []).forEach((point) => {
      if (!pointHasClientPrice(point)) return;
      const date = isoDate(point.date || point.label);
      if (date) dates.push(date);
    });
  });
  return dates;
}

function dateLagDays(later, earlier) {
  const laterDate = isoDate(later);
  const earlierDate = isoDate(earlier);
  if (!laterDate || !earlierDate) return null;
  const laterMs = Date.parse(`${laterDate}T00:00:00Z`);
  const earlierMs = Date.parse(`${earlierDate}T00:00:00Z`);
  return Math.round((laterMs - earlierMs) / 86400000);
}

function median(values = []) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function priceFactMetrics(payload = {}) {
  const platformKeys = new Set(
    Object.keys(payload?.platforms || {}).map(normalizePlatform).filter(Boolean)
  );
  const byPlatform = {};

  platformKeys.forEach((platform) => {
    const rows = platformRows(payload, platform);
    const pricedKeys = new Set();
    const clientPricedKeys = new Set();
    const dateSkuSets = new Map();
    const clientDateSkuSets = new Map();

    rows.forEach((row, index) => {
      const key = rowKey(row) || `row-${index}`;
      const dates = rowFactDates(row);
      const clientDates = rowClientFactDates(row);
      if (dates.length) pricedKeys.add(key);
      if (clientDates.length) clientPricedKeys.add(key);
      dates.forEach((date) => {
        if (!dateSkuSets.has(date)) dateSkuSets.set(date, new Set());
        dateSkuSets.get(date).add(key);
      });
      clientDates.forEach((date) => {
        if (!clientDateSkuSets.has(date)) clientDateSkuSets.set(date, new Set());
        clientDateSkuSets.get(date).add(key);
      });
    });

    const orderedDates = [...dateSkuSets.keys()].sort();
    const orderedClientDates = [...clientDateSkuSets.keys()].sort();
    const latestFactDate = orderedDates.slice(-1)[0] || '';
    const latestFactSkuCount = latestFactDate ? dateSkuSets.get(latestFactDate).size : 0;
    const baselineCounts = orderedDates
      .slice(0, -1)
      .slice(-7)
      .map((date) => dateSkuSets.get(date).size);
    const baselineMedianSkuCount = median(baselineCounts);

    byPlatform[platform] = {
      rowCount: rows.length,
      pricedRowCount: pricedKeys.size,
      clientPricedRowCount: clientPricedKeys.size,
      latestFactDate,
      latestClientFactDate: orderedClientDates.slice(-1)[0] || '',
      latestFactSkuCount,
      baselineMedianSkuCount,
      latestCoverageRatio: baselineMedianSkuCount > 0
        ? Number((latestFactSkuCount / baselineMedianSkuCount).toFixed(4))
        : null
    };
  });

  const latestFactDate = Object.values(byPlatform)
    .map((item) => item.latestFactDate)
    .filter(Boolean)
    .sort()
    .pop() || '';

  return { latestFactDate, byPlatform };
}

function mergeHistory(previous = [], candidate = [], candidateWins = true) {
  const byDate = new Map();
  const put = (point) => {
    const date = isoDate(point?.date || point?.label);
    if (!date) return;
    byDate.set(date, { ...(byDate.get(date) || {}), ...point, date });
  };
  const first = candidateWins ? previous : candidate;
  const second = candidateWins ? candidate : previous;
  (Array.isArray(first) ? first : []).forEach(put);
  (Array.isArray(second) ? second : []).forEach(put);
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function mergeNonEmpty(secondary = {}, primary = {}) {
  const merged = { ...secondary };
  Object.entries(primary || {}).forEach(([key, value]) => {
    if (nonEmpty(value) || !Object.prototype.hasOwnProperty.call(merged, key)) merged[key] = value;
  });
  return merged;
}

function mergePriceRow(previous = {}, candidate = {}) {
  const previousDate = rowLatestFactDate(previous);
  const candidateDate = rowLatestFactDate(candidate);
  const candidateWins = !previousDate || !candidateDate || candidateDate >= previousDate;
  const primary = candidateWins ? candidate : previous;
  const secondary = candidateWins ? previous : candidate;
  const merged = mergeNonEmpty(secondary, primary);

  HISTORY_FIELDS.forEach((field) => {
    const history = mergeHistory(previous?.[field], candidate?.[field], candidateWins);
    if (history.length) merged[field] = history;
    else delete merged[field];
  });

  const latestFactDate = rowLatestFactDate(merged);
  if (latestFactDate) {
    merged.historyFreshnessDate = latestFactDate;
    if (rowHasCurrentPrice(merged)) {
      const currentDate = isoDate(
        primary.currentPriceDate
        || primary.currentFillPriceDate
        || primary.valueDate
        || latestFactDate
      );
      merged.valueDate = currentDate || latestFactDate;
      merged.currentPriceDate = currentDate || latestFactDate;
    }
  }
  return merged;
}

function mergePlatformBuckets(previousBucket = {}, candidateBucket = {}) {
  const previousRows = Array.isArray(previousBucket)
    ? previousBucket
    : (Array.isArray(previousBucket?.rows) ? previousBucket.rows : []);
  const candidateRows = Array.isArray(candidateBucket)
    ? candidateBucket
    : (Array.isArray(candidateBucket?.rows) ? candidateBucket.rows : []);
  const rowsByKey = new Map();

  previousRows.forEach((row) => {
    const key = rowKey(row);
    if (key) rowsByKey.set(key, row);
  });
  candidateRows.forEach((row) => {
    const key = rowKey(row);
    if (!key) return;
    rowsByKey.set(key, mergePriceRow(rowsByKey.get(key), row));
  });

  return {
    ...(Array.isArray(previousBucket) ? {} : previousBucket),
    ...(Array.isArray(candidateBucket) ? {} : candidateBucket),
    rows: [...rowsByKey.values()]
      .sort((left, right) => rowKey(left).localeCompare(rowKey(right), 'ru'))
  };
}

function mergeOverlayWithPrevious(candidate = {}, previous = {}) {
  const previousBuckets = {};
  const candidateBuckets = {};
  Object.entries(previous?.platforms || {}).forEach(([key, bucket]) => {
    previousBuckets[normalizePlatform(key)] = bucket;
  });
  Object.entries(candidate?.platforms || {}).forEach(([key, bucket]) => {
    candidateBuckets[normalizePlatform(key)] = bucket;
  });

  const platforms = {};
  const platformKeys = new Set([
    ...Object.keys(previousBuckets),
    ...Object.keys(candidateBuckets)
  ]);
  platformKeys.forEach((platform) => {
    platforms[platform] = mergePlatformBuckets(
      previousBuckets[platform] || {},
      candidateBuckets[platform] || {}
    );
  });

  const merged = {
    ...previous,
    ...candidate,
    platforms
  };
  if (!candidate?.extraMarketplace && previous?.extraMarketplace) {
    merged.extraMarketplace = previous.extraMarketplace;
  }
  if (!candidate?.priceHistoryImport && previous?.priceHistoryImport) {
    merged.priceHistoryImport = previous.priceHistoryImport;
  }
  if (!candidate?.priceCurrentSnapshot && previous?.priceCurrentSnapshot) {
    merged.priceCurrentSnapshot = previous.priceCurrentSnapshot;
  }
  const metrics = priceFactMetrics(merged);
  if (metrics.latestFactDate) merged.asOfDate = metrics.latestFactDate;
  return merged;
}

function pushUnique(target, message) {
  if (message && !target.includes(message)) target.push(message);
}

function validatePriceGeneration(options = {}) {
  const previousOverlay = options.previousOverlay || {};
  const rawOverlay = options.rawOverlay || {};
  const overlay = options.overlay || {};
  const prices = options.prices || {};
  const repricer = options.repricer || {};
  const previousRepricer = options.previousRepricer || {};
  const requiredPlatforms = options.requiredPlatforms || CORE_PRICE_PLATFORMS;
  const maxPlatformGapDays = Number.isFinite(Number(options.maxPlatformGapDays))
    ? Number(options.maxPlatformGapDays)
    : 3;
  const maxSourceLagDays = Number.isFinite(Number(options.maxSourceLagDays))
    ? Number(options.maxSourceLagDays)
    : 3;
  const minLatestCoverageRatio = Number.isFinite(Number(options.minLatestCoverageRatio))
    ? Number(options.minLatestCoverageRatio)
    : 0.55;
  const expectedDate = isoDate(options.expectedDate);
  const previousMetrics = priceFactMetrics(previousOverlay);
  const rawMetrics = priceFactMetrics(rawOverlay);
  const overlayMetrics = priceFactMetrics(overlay);
  const pricesMetrics = priceFactMetrics(prices);
  const blockingReasons = [];
  const warnings = [];

  requiredPlatforms.forEach((platform) => {
    const key = normalizePlatform(platform);
    const previous = previousMetrics.byPlatform[key] || {};
    const raw = rawMetrics.byPlatform[key] || {};
    const current = overlayMetrics.byPlatform[key] || {};
    const derived = pricesMetrics.byPlatform[key] || {};

    if (!current.pricedRowCount || !current.latestFactDate) {
      pushUnique(blockingReasons, `Цены ${key}: после обновления нет фактических цен.`);
      return;
    }
    if (previous.latestFactDate && current.latestFactDate < previous.latestFactDate) {
      pushUnique(
        blockingReasons,
        `Цены ${key}: дата факта откатилась ${previous.latestFactDate} → ${current.latestFactDate}.`
      );
    }
    if (previous.pricedRowCount && current.pricedRowCount < previous.pricedRowCount) {
      pushUnique(
        blockingReasons,
        `Цены ${key}: пул SKU с ценой сократился ${previous.pricedRowCount} → ${current.pricedRowCount}.`
      );
    }
    if (!derived.pricedRowCount || derived.latestFactDate < current.latestFactDate) {
      pushUnique(
        blockingReasons,
        `Цены ${key}: производный prices.json не доходит до факта overlay ${current.latestFactDate}.`
      );
    }
    if (
      current.baselineMedianSkuCount >= 3
      && current.latestCoverageRatio !== null
      && current.latestCoverageRatio < minLatestCoverageRatio
    ) {
      pushUnique(
        blockingReasons,
        `Цены ${key}: последний срез неполный (${current.latestFactSkuCount} SKU при медиане ${current.baselineMedianSkuCount}, порог ${minLatestCoverageRatio}).`
      );
    }
    if (!raw.pricedRowCount) {
      pushUnique(warnings, `Источник цен ${key} не дал строк; сохранён последний корректный срез.`);
    } else if (previous.latestFactDate && raw.latestFactDate < previous.latestFactDate) {
      pushUnique(
        warnings,
        `Источник цен ${key} старее активного среза (${raw.latestFactDate} < ${previous.latestFactDate}); старые значения не применены.`
      );
    }
    const platformGap = dateLagDays(overlayMetrics.latestFactDate, current.latestFactDate);
    if (platformGap !== null && platformGap > maxPlatformGapDays) {
      pushUnique(
        blockingReasons,
        `Цены ${key}: площадка отстаёт от общего ценового среза на ${platformGap} дн. (максимум ${maxPlatformGapDays}).`
      );
    } else if (platformGap !== null && platformGap > 1) {
      pushUnique(
        warnings,
        `Цены ${key}: площадка отстаёт от общего ценового среза на ${platformGap} дн.`
      );
    }
  });

  if (expectedDate && overlayMetrics.latestFactDate) {
    const sourceLag = dateLagDays(expectedDate, overlayMetrics.latestFactDate);
    if (sourceLag !== null && sourceLag > maxSourceLagDays) {
      pushUnique(
        blockingReasons,
        `Цены: общий факт ${overlayMetrics.latestFactDate} отстаёт от контрольной даты ${expectedDate} на ${sourceLag} дн.`
      );
    }
    if (sourceLag !== null && sourceLag < -1) {
      pushUnique(
        blockingReasons,
        `Цены: источник содержит дату из будущего ${overlayMetrics.latestFactDate} при контрольной дате ${expectedDate}.`
      );
    }
  }

  const repricerRows = Array.isArray(repricer?.rows) ? repricer.rows : [];
  const previousRepricerRows = Array.isArray(previousRepricer?.rows) ? previousRepricer.rows : [];
  if (!repricerRows.length) {
    pushUnique(blockingReasons, 'Цены: repricer.json собран без SKU.');
  } else if (
    previousRepricerRows.length
    && repricerRows.length < Math.floor(previousRepricerRows.length * 0.95)
  ) {
    pushUnique(
      blockingReasons,
      `Цены: пул repricer сократился ${previousRepricerRows.length} → ${repricerRows.length}.`
    );
  }

  return {
    schema: 'portal-price-update-audit-v1',
    generatedAt: new Date().toISOString(),
    status: blockingReasons.length ? 'blocked' : 'ok',
    publishAllowed: blockingReasons.length === 0,
    expectedDate,
    thresholds: {
      maxSourceLagDays,
      maxPlatformGapDays,
      minLatestCoverageRatio
    },
    blockingReasons,
    warnings,
    previous: previousMetrics,
    sourceCandidate: rawMetrics,
    activatedCandidate: overlayMetrics,
    derivedPrices: pricesMetrics,
    repricer: {
      previousRowCount: previousRepricerRows.length,
      candidateRowCount: repricerRows.length
    }
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function generationFingerprint(payload = {}) {
  const copy = { ...payload };
  delete copy.priceGeneration;
  return crypto.createHash('sha256').update(stableStringify(copy)).digest('hex');
}

function stampPriceGeneration(payloads = {}, context = {}) {
  const builtAt = new Date().toISOString();
  const artifactFingerprints = Object.fromEntries(
    Object.entries(payloads).map(([name, payload]) => [name, generationFingerprint(payload)])
  );
  const id = `prices-${crypto.createHash('sha256')
    .update(stableStringify(artifactFingerprints))
    .digest('hex')
    .slice(0, 20)}`;
  const common = {
    id,
    builtAt,
    asOfDate: isoDate(context.asOfDate),
    sourceKind: String(context.sourceKind || ''),
    sourceMtime: String(context.sourceMtime || ''),
    artifactFingerprints
  };

  const stamped = {};
  Object.entries(payloads).forEach(([name, payload]) => {
    stamped[name] = {
      ...payload,
      priceGeneration: {
        ...common,
        artifact: name
      }
    };
  });
  return { id, builtAt, artifactFingerprints, payloads: stamped };
}

function atomicWriteBuffer(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`
  );
  let fileDescriptor = null;
  try {
    fileDescriptor = fs.openSync(tempPath, 'w');
    fs.writeFileSync(fileDescriptor, buffer);
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = null;
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fileDescriptor !== null) fs.closeSync(fileDescriptor);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

function atomicWriteJson(filePath, payload) {
  atomicWriteBuffer(filePath, Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8'));
}

function promoteJsonGeneration(targets = []) {
  const backups = targets.map((target) => ({
    path: path.resolve(target.path),
    existed: fs.existsSync(target.path),
    buffer: fs.existsSync(target.path) ? fs.readFileSync(target.path) : null
  }));
  let promotedCount = 0;
  try {
    targets.forEach((target) => {
      atomicWriteJson(path.resolve(target.path), target.payload);
      promotedCount += 1;
    });
  } catch (error) {
    backups.slice(0, promotedCount).reverse().forEach((backup) => {
      if (backup.existed) atomicWriteBuffer(backup.path, backup.buffer);
      else if (fs.existsSync(backup.path)) fs.unlinkSync(backup.path);
    });
    throw error;
  }
}

module.exports = {
  CORE_PRICE_PLATFORMS,
  atomicWriteJson,
  dateLagDays,
  isoDate,
  mergeOverlayWithPrevious,
  mergePriceRow,
  normalizePlatform,
  platformRows,
  priceFactMetrics,
  promoteJsonGeneration,
  rowLatestFactDate,
  stampPriceGeneration,
  validatePriceGeneration
};
