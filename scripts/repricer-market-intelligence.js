#!/usr/bin/env node
'use strict';

const {
  calendarDateFactors,
  calendarRegressionFeatures
} = require('./repricer-calendar-intelligence');

function finiteNumber(...values) {
  for (const value of values) {
    if (value === '' || value === null || value === undefined || typeof value === 'boolean') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function positiveNumber(...values) {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, '');
}

function isoDate(value) {
  const stamp = Date.parse(String(value || ''));
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function dateAgeDays(value, reference) {
  const date = isoDate(value);
  const asOf = isoDate(reference);
  if (!date || !asOf) return null;
  return (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values = [], quantile = 0.5) {
  const sorted = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (!sorted.length) return null;
  const position = clamp(quantile, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function marketIntelligencePolicy(economicsPolicy = {}, platform = '') {
  const root = economicsPolicy?.marketIntelligence && typeof economicsPolicy.marketIntelligence === 'object'
    ? economicsPolicy.marketIntelligence
    : {};
  const platformRule = root?.platforms?.[String(platform || '').trim().toLowerCase()] || {};
  const seasonality = { ...(root.seasonality || {}), ...(platformRule.seasonality || {}) };
  const elasticity = { ...(root.elasticity || {}), ...(platformRule.elasticity || {}) };
  const competitors = { ...(root.competitors || {}), ...(platformRule.competitors || {}) };
  const crossPlatform = { ...(root.crossPlatform || {}), ...(platformRule.crossPlatform || {}) };
  return {
    enabled: root.enabled === true,
    reviewRequired: root.reviewRequired !== false,
    maxCombinedInfluencePct: clamp(
      positiveNumber(platformRule.maxCombinedInfluencePct, root.maxCombinedInfluencePct) ?? 0.03,
      0,
      0.05
    ),
    seasonality: {
      enabled: seasonality.enabled !== false,
      minimumDays: Math.max(28, finiteNumber(seasonality.minimumDays) ?? 56),
      highConfidenceDays: Math.max(84, finiteNumber(seasonality.highConfidenceDays) ?? 330),
      lookbackDays: Math.max(56, finiteNumber(seasonality.lookbackDays) ?? 400),
      maxAgeDays: Math.max(0, finiteNumber(seasonality.maxAgeDays) ?? 7),
      minimumCalendarCoverage: clamp(finiteNumber(seasonality.minimumCalendarCoverage) ?? 0.75, 0.5, 1),
      minIndex: clamp(finiteNumber(seasonality.minIndex) ?? 0.8, 0.5, 1),
      maxIndex: clamp(finiteNumber(seasonality.maxIndex) ?? 1.2, 1, 1.5),
      peakDecreaseBlockIndex: clamp(
        finiteNumber(seasonality.peakDecreaseBlockIndex) ?? 1.12,
        1.02,
        1.5
      )
    },
    elasticity: {
      enabled: elasticity.enabled !== false,
      minimumDays: Math.max(28, finiteNumber(elasticity.minimumDays) ?? 42),
      maxAgeDays: Math.max(0, finiteNumber(elasticity.maxAgeDays) ?? 30),
      minimumCalendarCoverage: clamp(finiteNumber(elasticity.minimumCalendarCoverage) ?? 0.75, 0.5, 1),
      minimumPriceChanges: Math.max(2, finiteNumber(elasticity.minimumPriceChanges) ?? 3),
      minimumDistinctPriceLevels: Math.max(3, finiteNumber(elasticity.minimumDistinctPriceLevels) ?? 3),
      minimumR2: clamp(finiteNumber(elasticity.minimumR2) ?? 0.12, 0, 0.9),
      minValue: clamp(finiteNumber(elasticity.minValue) ?? -2.5, -6, -0.2),
      maxValue: clamp(finiteNumber(elasticity.maxValue) ?? -0.2, -1, -0.01),
      fallbackValue: clamp(finiteNumber(elasticity.fallbackValue) ?? -0.9, -2.5, -0.2),
      maxStepMultiplier: clamp(finiteNumber(elasticity.maxStepMultiplier) ?? 1.25, 1, 1.5),
      minStepMultiplier: clamp(finiteNumber(elasticity.minStepMultiplier) ?? 0.65, 0.4, 1)
    },
    competitors: {
      enabled: competitors.enabled !== false,
      maxAgeDays: Math.max(0, finiteNumber(competitors.maxAgeDays) ?? 1),
      minimumOffers: Math.max(2, finiteNumber(competitors.minimumOffers) ?? 3),
      minimumMatchScore: clamp(finiteNumber(competitors.minimumMatchScore) ?? 0.85, 0.5, 1),
      triggerGapPct: clamp(positiveNumber(competitors.triggerGapPct) ?? 0.10, 0.03, 0.5),
      maxInfluencePct: clamp(positiveNumber(competitors.maxInfluencePct) ?? 0.02, 0, 0.04),
      historyMinimumTrustedDays: Math.max(
        7,
        finiteNumber(competitors.historyMinimumTrustedDays) ?? 7
      ),
      historyMinimumSpanDays: Math.max(
        14,
        finiteNumber(competitors.historyMinimumSpanDays) ?? 14
      ),
      historyMaxAgeDays: Math.max(
        1,
        finiteNumber(competitors.historyMaxAgeDays) ?? 3
      ),
      historyMaxInfluencePct: clamp(
        positiveNumber(competitors.historyMaxInfluencePct) ?? 0.005,
        0,
        0.01
      ),
      outlierRatioLow: clamp(positiveNumber(competitors.outlierRatioLow) ?? 0.5, 0.1, 1),
      outlierRatioHigh: clamp(positiveNumber(competitors.outlierRatioHigh) ?? 2, 1, 5)
    },
    crossPlatform: {
      enabled: crossPlatform.enabled !== false,
      maxAgeDays: Math.max(0, finiteNumber(crossPlatform.maxAgeDays) ?? 2),
      triggerGapPct: clamp(positiveNumber(crossPlatform.triggerGapPct) ?? 0.10, 0.03, 0.5),
      maxInfluencePct: clamp(positiveNumber(crossPlatform.maxInfluencePct) ?? 0.01, 0, 0.03)
    },
    calendarEvents: {
      enabled: root?.calendarEvents?.enabled !== false,
      holidayDemandPct: clamp(finiteNumber(root?.calendarEvents?.holidayDemandPct) ?? 0.08, -0.3, 0.3),
      salaryWindowDemandPct: clamp(finiteNumber(root?.calendarEvents?.salaryWindowDemandPct) ?? 0.05, -0.3, 0.3),
      salaryDayRanges: Array.isArray(root?.calendarEvents?.salaryDayRanges)
        ? root.calendarEvents.salaryDayRanges
        : [[5, 10], [20, 25]],
      holidays: Array.isArray(root?.calendarEvents?.holidays) ? root.calendarEvents.holidays : []
    }
  };
}

function normalizeDailyHistory(sourceRow = {}, additionalHistory = null) {
  const rows = [];
  const append = (item) => {
    if (Array.isArray(item)) {
      const date = isoDate(item[0]);
      const units = finiteNumber(item[2], item[1]);
      const price = positiveNumber(item[5]);
      if (date) rows.push({
        date,
        units,
        price,
        clientPrice: price,
        source: 'compact_daily_history',
        calendar: calendarDateFactors(date)
      });
      return;
    }
    const date = isoDate(item?.date || item?.valueDate || item?.observed_at || item?.observedAt);
    const units = finiteNumber(
      item?.deliveredUnits,
      item?.ordersUnits,
      item?.units,
      item?.demand_units,
      item?.demandUnits
    );
    const sellerPrice = positiveNumber(
      item?.seller_price,
      item?.sellerPrice,
      item?.price,
      item?.currentFillPrice,
      item?.currentPrice
    );
    const clientPrice = positiveNumber(item?.client_price, item?.clientPrice, sellerPrice);
    if (!date) return;
    const calendar = calendarDateFactors(date, item);
    rows.push({
      date,
      units: units !== null && units >= 0 ? units : null,
      price: sellerPrice,
      clientPrice,
      source: String(item?.source || '').trim(),
      promoActive: calendar.promotion,
      promotionStart: calendar.promotionStart,
      promotionEnd: calendar.promotionEnd,
      advertisingChange: calendar.advertisingChange,
      advertisingStart: calendar.advertisingStart,
      advertisingEnd: calendar.advertisingEnd,
      calendar
    });
  };
  const direct = Array.isArray(sourceRow?.daily)
    ? sourceRow.daily
    : (Array.isArray(sourceRow?.monthly) ? sourceRow.monthly : []);
  direct.forEach(append);
  const historical = Array.isArray(additionalHistory?.observations)
    ? additionalHistory.observations
    : (Array.isArray(additionalHistory?.daily) ? additionalHistory.daily : []);
  historical.forEach(append);
  const byDate = new Map();
  rows
    .sort((left, right) => left.date.localeCompare(right.date))
    .forEach((row) => {
      const current = byDate.get(row.date) || {};
      byDate.set(row.date, {
        date: row.date,
        units: row.units !== null ? row.units : (current.units ?? null),
        price: row.price ?? current.price ?? null,
        clientPrice: row.clientPrice ?? current.clientPrice ?? row.price ?? current.price ?? null,
        source: row.source || current.source || '',
        promoActive: row.promoActive ?? current.promoActive ?? false,
        promotionStart: row.promotionStart ?? current.promotionStart ?? false,
        promotionEnd: row.promotionEnd ?? current.promotionEnd ?? false,
        advertisingChange: row.advertisingChange ?? current.advertisingChange ?? false,
        advertisingStart: row.advertisingStart ?? current.advertisingStart ?? false,
        advertisingEnd: row.advertisingEnd ?? current.advertisingEnd ?? false,
        calendar: row.calendar || current.calendar || calendarDateFactors(row.date, row)
      });
    });
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function seasonalitySignal(sourceRow = {}, snapshotAsOf = '', policy = {}, additionalHistory = null) {
  const config = policy.seasonality || {};
  const calendarPolicy = policy.calendarEvents || {};
  const daily = normalizeDailyHistory(sourceRow, additionalHistory)
    .filter((row) => row.units !== null && row.units >= 0);
  const latestDate = daily[daily.length - 1]?.date || '';
  const ageDays = dateAgeDays(latestDate, snapshotAsOf);
  const cutoff = latestDate
    ? new Date(
      Date.parse(`${latestDate}T00:00:00Z`) - (Math.max(56, config.lookbackDays || 400) - 1) * 86400000
    ).toISOString().slice(0, 10)
    : '';
  const observed = cutoff ? daily.filter((row) => row.date >= cutoff && row.date <= latestDate) : daily;
  const positiveDays = observed.filter((row) => row.units > 0).length;
  const calendarSpanDays = observed.length
    ? Math.round(
      (Date.parse(`${observed[observed.length - 1].date}T00:00:00Z`)
        - Date.parse(`${observed[0].date}T00:00:00Z`)) / 86400000
    ) + 1
    : 0;
  const calendarCoverage = calendarSpanDays > 0 ? observed.length / calendarSpanDays : 0;
  const minimumDays = config.minimumDays || 56;
  const usable = Boolean(
    policy.enabled
    && config.enabled
    && latestDate
    && ageDays !== null
    && ageDays >= 0
    && ageDays <= (config.maxAgeDays ?? 7)
    && observed.length >= minimumDays
    && calendarCoverage >= (config.minimumCalendarCoverage ?? 0.75)
    && positiveDays >= Math.max(14, Math.floor(minimumDays * 0.25))
  );
  const base = {
    usable,
    model: 'calendar_weekday_rolling_v1',
    confidence: usable
      ? (observed.length >= (config.highConfidenceDays || 330) ? 'high' : 'medium')
      : 'insufficient',
    index: 1,
    history_as_of: latestDate,
    history_age_days: ageDays,
    observed_days: observed.length,
    calendar_span_days: calendarSpanDays,
    calendar_coverage: rounded(calendarCoverage, 4),
    positive_sales_days: positiveDays,
    next_7d_daily_units_factor: 1,
    reason: ''
  };
  if (!usable) {
    base.reason = !policy.enabled || !config.enabled
      ? 'seasonality_disabled'
      : (!latestDate
        ? 'seasonality_history_missing'
        : (ageDays > (config.maxAgeDays ?? 7)
          ? 'seasonality_history_stale'
          : (calendarCoverage < (config.minimumCalendarCoverage ?? 0.75)
            ? 'seasonality_calendar_coverage_low'
            : 'seasonality_history_insufficient')));
    return base;
  }

  const training = observed.slice(0, Math.max(0, observed.length - 7));
  const globalMean = training.reduce((sum, row) => sum + row.units, 0) / Math.max(1, training.length);
  const weekdayBuckets = Array.from({ length: 7 }, () => []);
  training.forEach((row) => {
    const weekday = new Date(`${row.date}T00:00:00Z`).getUTCDay();
    weekdayBuckets[weekday].push(row.units);
  });
  const weekdayFactors = weekdayBuckets.map((bucket) => {
    if (!bucket.length || globalMean <= 0) return 1;
    const raw = (bucket.reduce((sum, value) => sum + value, 0) / bucket.length) / globalMean;
    const shrinkage = bucket.length / (bucket.length + 14);
    return 1 + (raw - 1) * shrinkage;
  });
  const latestStamp = Date.parse(`${latestDate}T00:00:00Z`);
  const forwardWeights = [7, 6, 5, 4, 3, 2, 1];
  const forwardCalendar = forwardWeights.map((weight, index) => {
    const next = new Date(latestStamp + (index + 1) * 86400000);
    return {
      weight,
      factors: calendarDateFactors(next.toISOString().slice(0, 10), {}, calendarPolicy)
    };
  });
  const weightedWeekdayFactor = forwardWeights.reduce((sum, weight, index) => {
    const next = new Date(latestStamp + (index + 1) * 86400000);
    return sum + weekdayFactors[next.getUTCDay()] * weight;
  }, 0) / forwardWeights.reduce((sum, weight) => sum + weight, 0);
  const weightedCalendarFactor = forwardCalendar.reduce(
    (sum, item) => sum + item.factors.demandFactor * item.weight,
    0
  ) / forwardWeights.reduce((sum, weight) => sum + weight, 0);

  let annualFactor = 1;
  let annualEvidenceDays = 0;
  if (observed.length >= (config.highConfidenceDays || 330)) {
    const targetStart = new Date(latestStamp - 378 * 86400000).toISOString().slice(0, 10);
    const targetEnd = new Date(latestStamp - 350 * 86400000).toISOString().slice(0, 10);
    const priorYearWindow = observed.filter((row) => row.date >= targetStart && row.date <= targetEnd);
    const annualBaseline = observed.slice(0, -28);
    const annualBaselineMean = annualBaseline.reduce((sum, row) => sum + row.units, 0)
      / Math.max(1, annualBaseline.length);
    if (priorYearWindow.length >= 14 && annualBaselineMean > 0) {
      annualEvidenceDays = priorYearWindow.length;
      const priorYearMean = priorYearWindow.reduce((sum, row) => sum + row.units, 0) / priorYearWindow.length;
      annualFactor = 1 + clamp(priorYearMean / annualBaselineMean - 1, -0.3, 0.3) * 0.5;
    }
  }
  const index = clamp(
    weightedWeekdayFactor * annualFactor * weightedCalendarFactor,
    config.minIndex ?? 0.8,
    config.maxIndex ?? 1.2
  );
  return {
    ...base,
    index: rounded(index, 4),
    next_7d_daily_units_factor: rounded(index, 4),
    weekday_factor: rounded(weightedWeekdayFactor, 4),
    calendar_factor: rounded(weightedCalendarFactor, 4),
    calendar_events: forwardCalendar
      .filter((item) => item.factors.reasons.length)
      .map((item) => ({ date: item.factors.date, reasons: item.factors.reasons })),
    annual_factor: rounded(annualFactor, 4),
    annual_evidence_days: annualEvidenceDays,
    reason: index >= (config.peakDecreaseBlockIndex || 1.12)
      ? 'seasonality_peak_ahead'
      : (index <= 0.9 ? 'seasonality_soft_period_ahead' : 'seasonality_neutral')
  };
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function ordinaryLeastSquares(features = [], target = []) {
  if (!features.length || features.length !== target.length) return null;
  const width = features[0].length;
  const xtx = Array.from({ length: width }, () => Array(width).fill(0));
  const xty = Array(width).fill(0);
  features.forEach((row, observationIndex) => {
    for (let left = 0; left < width; left += 1) {
      xty[left] += row[left] * target[observationIndex];
      for (let right = 0; right < width; right += 1) xtx[left][right] += row[left] * row[right];
    }
  });
  for (let index = 0; index < width; index += 1) xtx[index][index] += 1e-8;
  const coefficients = solveLinearSystem(xtx, xty);
  if (!coefficients) return null;
  const predictions = features.map((row) => (
    row.reduce((sum, value, index) => sum + value * coefficients[index], 0)
  ));
  const mean = target.reduce((sum, value) => sum + value, 0) / target.length;
  const residualSum = target.reduce((sum, value, index) => sum + (value - predictions[index]) ** 2, 0);
  const totalSum = target.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return {
    coefficients,
    r2: totalSum > 0 ? 1 - residualSum / totalSum : 0
  };
}

function estimateOwnPriceElasticity(
  sourceRow = {},
  policy = {},
  additionalHistory = null,
  fallbackElasticity = null,
  snapshotAsOf = ''
) {
  const config = policy.elasticity || {};
  const calendarPolicy = policy.calendarEvents || {};
  const fallback = clamp(
    finiteNumber(fallbackElasticity, config.fallbackValue) ?? -0.9,
    config.minValue ?? -2.5,
    config.maxValue ?? -0.2
  );
  const normalizedDaily = normalizeDailyHistory(sourceRow, additionalHistory)
    .filter((row) => row.units !== null && row.units >= 0 && positiveNumber(row.clientPrice, row.price) !== null);
  const excludedExceptionalDays = normalizedDaily.filter((row) => (
    calendarDateFactors(row.date, row, calendarPolicy).exceptional
  )).length;
  const daily = normalizedDaily.filter((row) => (
    !calendarDateFactors(row.date, row, calendarPolicy).exceptional
  ));
  const historyAsOf = daily[daily.length - 1]?.date || '';
  const historyAgeDays = snapshotAsOf ? dateAgeDays(historyAsOf, snapshotAsOf) : null;
  const calendarSpanDays = daily.length
    ? Math.round(
      (Date.parse(`${daily[daily.length - 1].date}T00:00:00Z`)
        - Date.parse(`${daily[0].date}T00:00:00Z`)) / 86400000
    ) + 1
    : 0;
  const calendarCoverage = calendarSpanDays > 0 ? daily.length / calendarSpanDays : 0;
  const minimumDays = config.minimumDays || 42;
  const prices = daily.map((row) => positiveNumber(row.clientPrice, row.price));
  const priceChangeCount = prices.reduce((count, price, index) => {
    if (!index || !prices[index - 1]) return count;
    return count + (Math.abs(price / prices[index - 1] - 1) >= 0.01 ? 1 : 0);
  }, 0);
  const distinctLevels = new Set(prices.map((price) => Math.round(Math.log(price) / Math.log(1.01)))).size;
  const result = {
    usable: false,
    value: rounded(fallback, 4),
    learned_value: null,
    fallback_value: rounded(fallback, 4),
    source: 'policy_or_role_fallback',
    confidence: 'fallback',
    model: 'log_log_price_time_weekday_calendar_v2',
    observations: daily.length,
    raw_observations: normalizedDaily.length,
    exceptional_days_excluded: excludedExceptionalDays,
    calendar_controls: ['weekday', 'ru_holiday', 'salary_window', 'promotion', 'advertising_change'],
    history_as_of: historyAsOf,
    history_age_days: historyAgeDays,
    calendar_span_days: calendarSpanDays,
    calendar_coverage: rounded(calendarCoverage, 4),
    price_change_count: priceChangeCount,
    distinct_price_levels: distinctLevels,
    r2: null,
    reason: ''
  };
  if (!policy.enabled || !config.enabled) {
    result.reason = 'elasticity_disabled';
    return result;
  }
  if (
    snapshotAsOf
    && (historyAgeDays === null || historyAgeDays < 0 || historyAgeDays > (config.maxAgeDays ?? 30))
  ) {
    result.reason = 'elasticity_history_stale';
    return result;
  }
  if (
    daily.length < minimumDays
    || priceChangeCount < (config.minimumPriceChanges || 3)
    || distinctLevels < (config.minimumDistinctPriceLevels || 3)
  ) {
    result.reason = 'elasticity_history_insufficient';
    return result;
  }
  if (calendarCoverage < (config.minimumCalendarCoverage ?? 0.75)) {
    result.reason = 'elasticity_calendar_coverage_low';
    return result;
  }
  const unitValues = daily.map((row) => row.units);
  const lowerUnits = percentile(unitValues, 0.05) ?? 0;
  const upperUnits = percentile(unitValues, 0.95) ?? Math.max(...unitValues);
  const features = daily.map((row, index) => {
    const price = positiveNumber(row.clientPrice, row.price);
    const weekday = new Date(`${row.date}T00:00:00Z`).getUTCDay();
    const normalizedTime = daily.length > 1 ? index / (daily.length - 1) - 0.5 : 0;
    return [
      1,
      Math.log(price),
      normalizedTime,
      ...Array.from({ length: 6 }, (_, weekdayIndex) => (weekday === weekdayIndex ? 1 : 0)),
      ...calendarRegressionFeatures(calendarDateFactors(row.date, row, calendarPolicy))
    ];
  });
  const target = daily.map((row) => Math.log(clamp(row.units, lowerUnits, upperUnits) + 0.25));
  const regression = ordinaryLeastSquares(features, target);
  const learned = regression?.coefficients?.[1];
  const r2 = regression?.r2;
  result.learned_value = Number.isFinite(learned) ? rounded(learned, 4) : null;
  result.r2 = Number.isFinite(r2) ? rounded(r2, 4) : null;
  if (
    !Number.isFinite(learned)
    || learned >= (config.maxValue ?? -0.2)
    || learned < (config.minValue ?? -2.5)
    || !Number.isFinite(r2)
    || r2 < (config.minimumR2 ?? 0.12)
  ) {
    result.reason = Number.isFinite(learned) && learned >= 0
      ? 'elasticity_non_economic_rejected'
      : 'elasticity_model_low_confidence';
    return result;
  }
  result.usable = true;
  result.value = rounded(clamp(learned, config.minValue ?? -2.5, config.maxValue ?? -0.2), 4);
  result.source = 'learned_own_price_history';
  result.confidence = r2 >= 0.35 && daily.length >= 84 ? 'high' : 'medium';
  result.reason = 'elasticity_learned';
  return result;
}

function buildCompetitorPriceMap(payload = {}) {
  const map = new Map();
  const rows = Array.isArray(payload?.rows)
    ? payload.rows
    : (Array.isArray(payload?.items) ? payload.items : []);
  rows.forEach((row) => {
    const platform = String(row?.platform || '').trim().toLowerCase();
    const articleKey = String(row?.article_key || row?.articleKey || row?.article || row?.sku || '').trim();
    const normalized = normalizeKey(articleKey);
    if (!platform || !normalized) return;
    const exactKey = `${platform}|${normalized}|${articleKey.toLowerCase()}`;
    const value = {
      ...row,
      platform,
      article_key: articleKey,
      normalized_article_key: normalized,
      observed_at: row?.observed_at || row?.observedAt || row?.asOfDate || payload?.generatedAt || '',
      offers: Array.isArray(row?.offers)
        ? row.offers
        : (Array.isArray(row?.competitors) ? row.competitors : [])
    };
    map.set(exactKey, value);
    const normalizedKey = `${platform}|${normalized}`;
    if (!map.has(normalizedKey)) map.set(normalizedKey, value);
  });
  return map;
}

function buildCompetitorHistoryMap(payload = {}) {
  const map = new Map();
  const seriesRows = Array.isArray(payload?.series) ? payload.series : [];
  seriesRows.forEach((row) => {
    const platform = String(row?.platform || '').trim().toLowerCase();
    const articleKey = String(row?.article_key || row?.articleKey || row?.article || '').trim();
    const normalized = normalizeKey(row?.normalized_article_key || articleKey);
    if (!platform || !normalized) return;
    const value = {
      ...row,
      platform,
      article_key: articleKey,
      normalized_article_key: normalized,
      observations: Array.isArray(row?.observations) ? row.observations : []
    };
    map.set(`${platform}|${normalized}|${articleKey.toLowerCase()}`, value);
    if (!map.has(`${platform}|${normalized}`)) map.set(`${platform}|${normalized}`, value);
  });
  if (seriesRows.length) return map;
  const grouped = new Map();
  (Array.isArray(payload?.observations) ? payload.observations : []).forEach((row) => {
    const platform = String(row?.platform || '').trim().toLowerCase();
    const articleKey = String(row?.article_key || row?.articleKey || row?.article || '').trim();
    const normalized = normalizeKey(row?.normalized_article_key || articleKey);
    if (!platform || !normalized) return;
    const key = `${platform}|${normalized}`;
    const current = grouped.get(key) || {
      platform,
      article_key: articleKey,
      normalized_article_key: normalized,
      observations: []
    };
    current.observations.push(row);
    grouped.set(key, current);
  });
  grouped.forEach((row, key) => {
    row.observations.sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
    map.set(key, row);
    map.set(`${key}|${String(row.article_key || '').toLowerCase()}`, row);
  });
  return map;
}

function competitorHistorySignal(
  record = null,
  snapshotAsOf = '',
  policy = {},
  currentCompetitor = {}
) {
  const config = policy.competitors || {};
  const observations = (Array.isArray(record?.observations) ? record.observations : [])
    .map((row) => ({
      date: isoDate(row?.date || row?.observed_at || row?.observedAt),
      trusted: row?.trusted === true || row?.status === 'trusted',
      benchmark: positiveNumber(
        row?.benchmark_client_price,
        row?.benchmarkClientPrice,
        row?.median_client_price,
        row?.medianClientPrice
      ),
      offerCount: finiteNumber(row?.offer_count, row?.offerCount)
    }))
    .filter((row) => row.date && row.trusted && row.benchmark !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
  const byDate = new Map();
  observations.forEach((row) => byDate.set(row.date, row));
  const trusted = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  const first = trusted[0] || null;
  const latest = trusted[trusted.length - 1] || null;
  const spanDays = first && latest
    ? Math.round((Date.parse(`${latest.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) / 86400000)
    : 0;
  const ageDays = latest ? dateAgeDays(latest.date, snapshotAsOf) : null;
  const minimumDays = config.historyMinimumTrustedDays ?? 7;
  const minimumSpan = config.historyMinimumSpanDays ?? 14;
  const maxAge = config.historyMaxAgeDays ?? 3;
  const structurallyUsable = Boolean(
    policy.enabled
    && config.enabled
    && trusted.length >= minimumDays
    && spanDays >= minimumSpan
    && ageDays !== null
    && ageDays >= 0
    && ageDays <= maxAge
  );
  const usable = Boolean(structurallyUsable && currentCompetitor?.usable);
  const comparisonWindow = Math.max(1, Math.min(14, Math.floor(trusted.length / 2)));
  const recent = trusted.slice(-comparisonWindow);
  const baseline = trusted.slice(0, comparisonWindow);
  const recentMedian = median(recent.map((row) => row.benchmark));
  const baselineMedian = median(baseline.map((row) => row.benchmark));
  const trendPct = recentMedian !== null && baselineMedian !== null && baselineMedian > 0
    ? recentMedian / baselineMedian - 1
    : null;
  const benchmarkMedian = median(trusted.map((row) => row.benchmark));
  const deviations = benchmarkMedian === null
    ? []
    : trusted.map((row) => Math.abs(row.benchmark / benchmarkMedian - 1));
  const volatilityPct = median(deviations);
  const maxInfluence = config.historyMaxInfluencePct ?? 0.005;
  const influence = usable && trendPct !== null && Math.abs(trendPct) >= 0.03
    ? Math.sign(trendPct) * Math.min(maxInfluence, Math.max(0, Math.abs(trendPct) - 0.03) * 0.10)
    : 0;
  return {
    usable,
    structurally_usable: structurallyUsable,
    confidence: usable
      ? (trusted.length >= 21 && spanDays >= 45 ? 'high' : 'medium')
      : 'insufficient',
    trusted_days: trusted.length,
    calendar_span_days: spanDays,
    first_date: first?.date || '',
    last_date: latest?.date || '',
    history_age_days: ageDays,
    baseline_benchmark_client_price: baselineMedian === null ? null : rounded(baselineMedian, 2),
    recent_benchmark_client_price: recentMedian === null ? null : rounded(recentMedian, 2),
    trend_pct: trendPct === null ? null : rounded(trendPct, 6),
    median_volatility_pct: volatilityPct === null ? null : rounded(volatilityPct, 6),
    suggested_influence_pct: rounded(influence, 6),
    current_snapshot_required: true,
    reason: !structurallyUsable
      ? (!latest
        ? 'competitor_history_missing'
        : (ageDays > maxAge
          ? 'competitor_history_stale'
          : (trusted.length < minimumDays
            ? 'competitor_history_days_insufficient'
            : 'competitor_history_span_insufficient')))
      : (!currentCompetitor?.usable
        ? 'competitor_current_snapshot_required'
        : (Math.abs(trendPct || 0) < 0.03
          ? 'competitor_history_trend_inside_tolerance'
          : 'competitor_history_trend_actionable'))
  };
}

function competitorPriceSignal(record = null, ownClientPrice = null, snapshotAsOf = '', policy = {}) {
  const config = policy.competitors || {};
  const ownPrice = positiveNumber(ownClientPrice);
  const offers = Array.isArray(record?.offers)
    ? record.offers
    : (Array.isArray(record?.competitors) ? record.competitors : []);
  const rejected = {
    stale: 0,
    match: 0,
    stock: 0,
    currency: 0,
    unit: 0,
    price: 0,
    outlier: 0
  };
  const candidates = offers.map((offer) => {
    const observedAt = offer?.observed_at || offer?.observedAt || record?.observed_at || record?.observedAt;
    const ageDays = dateAgeDays(observedAt, snapshotAsOf);
    const matchScore = finiteNumber(offer?.match_score, offer?.matchScore, record?.match_score, record?.matchScore);
    const currency = String(offer?.currency || record?.currency || 'RUB').trim().toUpperCase();
    const comparablePrice = positiveNumber(offer?.comparable_unit_price, offer?.comparableUnitPrice);
    const packUnits = positiveNumber(offer?.pack_units, offer?.packUnits, 1) || 1;
    const rawPrice = positiveNumber(
      offer?.client_price,
      offer?.clientPrice,
      offer?.price,
      offer?.seller_price,
      offer?.sellerPrice
    );
    let rejection = '';
    if (ageDays === null || ageDays < 0 || ageDays > (config.maxAgeDays ?? 1)) rejection = 'stale';
    else if (matchScore === null || matchScore < (config.minimumMatchScore ?? 0.85)) rejection = 'match';
    else if (offer?.in_stock === false || offer?.inStock === false) rejection = 'stock';
    else if (currency !== 'RUB') rejection = 'currency';
    else if (packUnits !== 1 && comparablePrice === null) rejection = 'unit';
    else if (comparablePrice === null && rawPrice === null) rejection = 'price';
    if (rejection) rejected[rejection] += 1;
    return {
      accepted: !rejection,
      price: comparablePrice ?? rawPrice,
      matchScore,
      observedAt: isoDate(observedAt)
    };
  }).filter((offer) => offer.accepted);
  const initialMedian = median(candidates.map((offer) => offer.price));
  const filtered = initialMedian === null
    ? []
    : candidates.filter((offer) => {
      const ratio = offer.price / initialMedian;
      const accepted = ratio >= (config.outlierRatioLow ?? 0.5)
        && ratio <= (config.outlierRatioHigh ?? 2);
      if (!accepted) rejected.outlier += 1;
      return accepted;
    });
  const prices = filtered.map((offer) => offer.price);
  const benchmark = median(prices);
  const minimumOffers = config.minimumOffers || 3;
  const usable = Boolean(
    policy.enabled
    && config.enabled
    && ownPrice !== null
    && benchmark !== null
    && filtered.length >= minimumOffers
  );
  const gap = ownPrice !== null && benchmark !== null ? ownPrice / benchmark - 1 : null;
  const trigger = config.triggerGapPct ?? 0.10;
  const maxInfluence = config.maxInfluencePct ?? 0.02;
  const rawInfluence = gap === null || Math.abs(gap) < trigger
    ? 0
    : -Math.sign(gap) * Math.min(maxInfluence, Math.max(0, Math.abs(gap) - trigger) * 0.25);
  return {
    usable,
    confidence: usable ? (filtered.length >= minimumOffers + 2 ? 'high' : 'medium') : 'insufficient',
    benchmark_client_price: benchmark === null ? null : rounded(benchmark, 2),
    lower_quartile_client_price: percentile(prices, 0.25) === null ? null : rounded(percentile(prices, 0.25), 2),
    upper_quartile_client_price: percentile(prices, 0.75) === null ? null : rounded(percentile(prices, 0.75), 2),
    own_client_price: ownPrice,
    own_price_gap_pct: gap === null ? null : rounded(gap, 6),
    trusted_offers: filtered.length,
    total_offers: offers.length,
    rejected,
    suggested_influence_pct: usable ? rounded(rawInfluence, 6) : 0,
    source: String(record?.source || '').trim(),
    observed_at: isoDate(record?.observed_at || record?.observedAt),
    reason: !policy.enabled || !config.enabled
      ? 'competitor_signal_disabled'
      : (filtered.length < minimumOffers
        ? 'competitor_coverage_insufficient'
        : (Math.abs(gap || 0) < trigger ? 'competitor_gap_inside_tolerance' : 'competitor_gap_actionable'))
  };
}

function buildCrossPlatformPriceMap(payload = {}, platforms = []) {
  const map = new Map();
  (platforms.length ? platforms : Object.keys(payload?.platforms || {})).forEach((platformRaw) => {
    const platform = String(platformRaw || '').trim().toLowerCase();
    const bucket = payload?.platforms?.[platformRaw] || payload?.platforms?.[platform] || {};
    const rows = Array.isArray(bucket) ? bucket : (Array.isArray(bucket?.rows) ? bucket.rows : []);
    rows.forEach((row) => {
      const articleKey = String(row?.articleKey || row?.article || row?.sku || '').trim();
      const normalized = normalizeKey(articleKey);
      const clientPrice = positiveNumber(row?.currentClientPrice, row?.clientPrice, row?.currentFillPrice, row?.currentPrice);
      if (!normalized || clientPrice === null) return;
      const values = map.get(normalized) || [];
      values.push({
        platform,
        article_key: articleKey,
        client_price: clientPrice,
        seller_price: positiveNumber(row?.currentFillPrice, row?.currentPrice),
        as_of: isoDate(row?.currentClientPriceDate || row?.currentPriceDate || row?.valueDate || row?.historyFreshnessDate)
      });
      map.set(normalized, values);
    });
  });
  return map;
}

function crossPlatformPriceSignal(
  platform = '',
  ownClientPrice = null,
  siblingPrices = [],
  snapshotAsOf = '',
  policy = {}
) {
  const config = policy.crossPlatform || {};
  const ownPrice = positiveNumber(ownClientPrice);
  const comparable = (Array.isArray(siblingPrices) ? siblingPrices : [])
    .filter((row) => String(row?.platform || '').trim().toLowerCase() !== String(platform || '').trim().toLowerCase())
    .filter((row) => {
      const age = dateAgeDays(row?.as_of, snapshotAsOf);
      return positiveNumber(row?.client_price) !== null
        && age !== null
        && age >= 0
        && age <= (config.maxAgeDays ?? 2);
    });
  const siblingMedian = median(comparable.map((row) => positiveNumber(row.client_price)));
  const gap = ownPrice !== null && siblingMedian !== null ? ownPrice / siblingMedian - 1 : null;
  const trigger = config.triggerGapPct ?? 0.10;
  const maxInfluence = config.maxInfluencePct ?? 0.01;
  const rawInfluence = gap === null || Math.abs(gap) < trigger
    ? 0
    : -Math.sign(gap) * Math.min(maxInfluence, Math.max(0, Math.abs(gap) - trigger) * 0.15);
  const usable = Boolean(policy.enabled && config.enabled && ownPrice !== null && comparable.length && siblingMedian !== null);
  return {
    usable,
    confidence: usable ? (comparable.length >= 2 ? 'high' : 'medium') : 'insufficient',
    own_client_price: ownPrice,
    sibling_client_price: siblingMedian === null ? null : rounded(siblingMedian, 2),
    own_price_gap_pct: gap === null ? null : rounded(gap, 6),
    comparable_platforms: comparable.map((row) => row.platform),
    suggested_influence_pct: usable ? rounded(rawInfluence, 6) : 0,
    reason: !usable
      ? 'cross_platform_signal_insufficient'
      : (Math.abs(gap || 0) < trigger ? 'cross_platform_gap_inside_tolerance' : 'cross_platform_gap_actionable')
  };
}

function elasticityStepMultiplier(elasticity = {}, policy = {}) {
  const config = policy.elasticity || {};
  if (!elasticity?.usable) return 1;
  const absolute = Math.abs(finiteNumber(elasticity.value) || 1);
  return rounded(clamp(
    1 / Math.max(0.25, absolute),
    config.minStepMultiplier ?? 0.65,
    config.maxStepMultiplier ?? 1.25
  ), 4);
}

function marketStepAdjustment({
  action = 'keep',
  baseStepPct = 0,
  competitor = {},
  crossPlatform = {},
  elasticity = {},
  policy = {}
} = {}) {
  const direction = action === 'increase' ? 1 : (action === 'decrease' ? -1 : 0);
  const maximum = policy.maxCombinedInfluencePct ?? 0.03;
  const marketInfluence = clamp(
    finiteNumber(competitor?.suggested_influence_pct, 0)
      + finiteNumber(crossPlatform?.suggested_influence_pct, 0),
    -maximum,
    maximum
  );
  if (!direction) {
    return {
      step_pct: 0,
      base_step_pct: baseStepPct,
      market_influence_pct: rounded(marketInfluence, 6),
      elasticity_multiplier: 1,
      influence_applied_pct: 0
    };
  }
  const multiplier = elasticityStepMultiplier(elasticity, policy);
  const signedBase = direction * Math.max(0, baseStepPct) * multiplier;
  const sameDirectionInfluence = Math.sign(marketInfluence) === direction ? marketInfluence : 0;
  const opposingInfluence = Math.sign(marketInfluence) === -direction
    ? marketInfluence
    : 0;
  const signedAdjusted = direction * Math.max(
    0,
    Math.abs(signedBase) + direction * sameDirectionInfluence + direction * opposingInfluence
  );
  return {
    step_pct: rounded(Math.abs(signedAdjusted), 6),
    base_step_pct: baseStepPct,
    market_influence_pct: rounded(marketInfluence, 6),
    elasticity_multiplier: multiplier,
    influence_applied_pct: rounded(signedAdjusted - direction * baseStepPct, 6)
  };
}

module.exports = {
  buildCompetitorHistoryMap,
  buildCompetitorPriceMap,
  buildCrossPlatformPriceMap,
  competitorHistorySignal,
  competitorPriceSignal,
  crossPlatformPriceSignal,
  dateAgeDays,
  estimateOwnPriceElasticity,
  elasticityStepMultiplier,
  finiteNumber,
  marketIntelligencePolicy,
  marketStepAdjustment,
  median,
  normalizeDailyHistory,
  normalizeKey,
  ordinaryLeastSquares,
  percentile,
  seasonalitySignal
};
