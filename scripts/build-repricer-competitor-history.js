#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  dateAgeDays,
  median,
  normalizeKey,
  percentile
} = require('./repricer-market-intelligence');

function parseArgs(argv = process.argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    const key = token.slice(2, separator >= 0 ? separator : undefined);
    if (separator >= 0) {
      args[key] = token.slice(separator + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value) {
  const stamp = Date.parse(String(value || ''));
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function rounded(value, digits = 2) {
  const number = finite(value);
  return number === null ? null : Number(number.toFixed(digits));
}

function compactOffer(offer = {}) {
  const price = finite(
    offer.comparable_unit_price
    ?? offer.comparableUnitPrice
    ?? offer.client_price
    ?? offer.clientPrice
    ?? offer.price
  );
  return {
    competitor_id: String(offer.competitor_id || offer.competitorId || offer.id || '').trim(),
    seller: String(offer.seller || '').trim(),
    client_price: rounded(offer.client_price ?? offer.clientPrice ?? offer.price),
    comparable_unit_price: rounded(price),
    match_score: rounded(offer.match_score ?? offer.matchScore, 4),
    package_dimension: String(offer.package_dimension || offer.packageDimension || '').trim(),
    package_amount: rounded(offer.package_amount ?? offer.packageAmount, 3),
    in_stock: offer.in_stock !== false && offer.inStock !== false,
    source: String(offer.source || '').trim(),
    observed_at: String(offer.observed_at || offer.observedAt || '').trim(),
    url: String(offer.url || '').trim()
  };
}

function rowObservation(row = {}, snapshot = {}, options = {}) {
  const minimumOffers = Math.max(
    2,
    Number(options.minimumOffers || snapshot?.policy?.minimumOffers || 3)
  );
  const offers = (Array.isArray(row?.offers) ? row.offers : [])
    .map(compactOffer)
    .filter((offer) => offer.comparable_unit_price !== null && offer.comparable_unit_price > 0);
  const prices = offers.map((offer) => offer.comparable_unit_price);
  const observedAt = String(row.observed_at || row.observedAt || snapshot.generatedAt || options.asOfDate || '').trim();
  const observationDate = isoDate(observedAt || options.asOfDate);
  const retainedPrevious = Boolean(
    row?.retained_previous
    || row?.diagnostics?.retained_previous
    || (observationDate && isoDate(snapshot.generatedAt) && observationDate !== isoDate(snapshot.generatedAt))
  );
  const trusted = Boolean(
    observationDate
    && offers.length >= minimumOffers
    && !retainedPrevious
  );
  return {
    date: observationDate,
    observed_at: observedAt,
    platform: String(row.platform || '').trim().toLowerCase(),
    article_key: String(row.article_key || row.articleKey || row.article || '').trim(),
    normalized_article_key: normalizeKey(row.article_key || row.articleKey || row.article),
    source: String(row.source || '').trim(),
    status: trusted ? 'trusted' : (retainedPrevious ? 'retained_previous' : 'insufficient'),
    trusted,
    minimum_offers: minimumOffers,
    offer_count: offers.length,
    benchmark_client_price: rounded(median(prices)),
    lower_quartile_client_price: rounded(percentile(prices, 0.25)),
    upper_quartile_client_price: rounded(percentile(prices, 0.75)),
    minimum_client_price: prices.length ? rounded(Math.min(...prices)) : null,
    maximum_client_price: prices.length ? rounded(Math.max(...prices)) : null,
    offers
  };
}

function observationKey(row = {}) {
  return `${row.date}|${row.platform}|${row.normalized_article_key}|${String(row.article_key || '').toLowerCase()}`;
}

function buildSeries(observations = []) {
  const map = new Map();
  observations.forEach((row) => {
    const key = `${row.platform}|${row.normalized_article_key}`;
    const current = map.get(key) || {
      key,
      platform: row.platform,
      article_key: row.article_key,
      normalized_article_key: row.normalized_article_key,
      first_date: row.date,
      last_date: row.date,
      observed_days: 0,
      trusted_days: 0,
      latest_status: row.status,
      latest_benchmark_client_price: row.benchmark_client_price,
      observations: []
    };
    current.article_key = row.article_key || current.article_key;
    current.first_date = current.first_date && current.first_date < row.date ? current.first_date : row.date;
    current.last_date = current.last_date && current.last_date > row.date ? current.last_date : row.date;
    current.latest_status = row.date >= current.last_date ? row.status : current.latest_status;
    current.latest_benchmark_client_price = row.date >= current.last_date
      ? row.benchmark_client_price
      : current.latest_benchmark_client_price;
    current.observations.push({
      date: row.date,
      status: row.status,
      trusted: row.trusted,
      offer_count: row.offer_count,
      benchmark_client_price: row.benchmark_client_price,
      lower_quartile_client_price: row.lower_quartile_client_price,
      upper_quartile_client_price: row.upper_quartile_client_price,
      source: row.source
    });
    map.set(key, current);
  });
  return [...map.values()]
    .map((series) => {
      series.observations.sort((left, right) => left.date.localeCompare(right.date));
      series.observed_days = new Set(series.observations.map((row) => row.date)).size;
      series.trusted_days = new Set(
        series.observations.filter((row) => row.trusted).map((row) => row.date)
      ).size;
      const latest = series.observations[series.observations.length - 1] || {};
      series.last_date = latest.date || series.last_date;
      series.latest_status = latest.status || series.latest_status;
      series.latest_benchmark_client_price = latest.benchmark_client_price ?? null;
      return series;
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

function buildCompetitorHistory({
  previous = {},
  current = {},
  asOfDate = new Date().toISOString().slice(0, 10),
  retentionDays = 180,
  minimumOffers = null
} = {}) {
  const referenceDate = isoDate(asOfDate) || new Date().toISOString().slice(0, 10);
  const retention = Math.max(180, Number(retentionDays || 180));
  const cutoffStamp = Date.parse(`${referenceDate}T00:00:00Z`) - (retention - 1) * 86400000;
  const cutoffDate = new Date(cutoffStamp).toISOString().slice(0, 10);
  const previousObservations = Array.isArray(previous?.observations)
    ? previous.observations
    : [];
  const currentObservations = (Array.isArray(current?.rows) ? current.rows : [])
    .map((row) => rowObservation(row, current, { asOfDate: referenceDate, minimumOffers }))
    .filter((row) => row.date && row.platform && row.normalized_article_key);
  const byKey = new Map();
  [...previousObservations, ...currentObservations]
    .filter((row) => row?.date >= cutoffDate && row?.date <= referenceDate)
    .forEach((row) => {
      const normalized = {
        ...row,
        platform: String(row.platform || '').trim().toLowerCase(),
        article_key: String(row.article_key || row.articleKey || '').trim(),
        normalized_article_key: normalizeKey(row.normalized_article_key || row.article_key || row.articleKey),
        trusted: row.trusted === true,
        offers: Array.isArray(row.offers) ? row.offers : []
      };
      if (!normalized.platform || !normalized.normalized_article_key) return;
      const key = observationKey(normalized);
      const existing = byKey.get(key);
      if (existing?.trusted === true && normalized.trusted !== true) return;
      byKey.set(key, normalized);
    });
  const observations = [...byKey.values()].sort((left, right) => (
    left.date.localeCompare(right.date)
    || `${left.platform}|${left.normalized_article_key}`.localeCompare(`${right.platform}|${right.normalized_article_key}`)
  ));
  const series = buildSeries(observations);
  const distinctDates = [...new Set(observations.map((row) => row.date))].sort();
  return {
    schema: 'repricer-competitor-history-v1',
    generatedAt: new Date().toISOString(),
    asOfDate: referenceDate,
    retentionDays: retention,
    cutoffDate,
    status: observations.length ? 'ok' : 'empty',
    policy: {
      minimumOffers: Math.max(2, Number(minimumOffers || current?.policy?.minimumOffers || 3)),
      historyMinimumTrustedDays: 7,
      historyMinimumSpanDays: 14,
      currentSnapshotRequiredForPriceInfluence: true,
      insufficientHistoryNeverControlsPrice: true,
      retainedPreviousSnapshotNeverCountsAsFresh: true
    },
    summary: {
      calendar_days: distinctDates.length,
      observations: observations.length,
      trusted_observations: observations.filter((row) => row.trusted).length,
      series: series.length,
      trusted_series_7d: series.filter((row) => row.trusted_days >= 7).length,
      first_date: distinctDates[0] || '',
      last_date: distinctDates[distinctDates.length - 1] || '',
      latest_snapshot_age_days: distinctDates.length
        ? dateAgeDays(distinctDates[distinctDates.length - 1], referenceDate)
        : null
    },
    observations,
    series
  };
}

function main() {
  const args = parseArgs();
  const inputDir = path.resolve(args['input-dir'] || 'data');
  const currentPath = path.resolve(args.current || path.join(inputDir, 'repricer_competitor_prices.json'));
  const outputPath = path.resolve(args.output || path.join(inputDir, 'repricer_competitor_history.json'));
  const historyPath = path.resolve(args.history || args.previous || outputPath);
  const payload = buildCompetitorHistory({
    previous: readJson(historyPath, {}),
    current: readJson(currentPath, {}),
    asOfDate: args['as-of-date'] || new Date().toISOString().slice(0, 10),
    retentionDays: args['retention-days'] || 180,
    minimumOffers: args['minimum-offers']
  });
  writeJson(outputPath, payload);
  process.stdout.write(`${JSON.stringify({
    status: payload.status,
    output: outputPath,
    summary: payload.summary,
    policy: payload.policy
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  buildCompetitorHistory,
  buildSeries,
  compactOffer,
  observationKey,
  rowObservation
};
