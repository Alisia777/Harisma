#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv = process.argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, '');
}

function positiveNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function isoTimestamp(...values) {
  for (const value of values) {
    const stamp = Date.parse(String(value || ''));
    if (Number.isFinite(stamp)) return new Date(stamp).toISOString();
  }
  return '';
}

function platformRows(payload = {}, platform = '') {
  const bucket = payload?.platforms?.[platform];
  if (Array.isArray(bucket)) return bucket;
  return Array.isArray(bucket?.rows) ? bucket.rows : [];
}

function historyMap(payload = {}) {
  const map = new Map();
  (Array.isArray(payload?.rows) ? payload.rows : []).forEach((row) => {
    const platform = String(row?.platform || '').trim().toLowerCase();
    const articleKey = String(row?.article_key || row?.articleKey || row?.article || '').trim();
    const normalized = normalizeKey(articleKey);
    if (!platform || !normalized) return;
    const observations = (Array.isArray(row?.observations) ? row.observations : [])
      .map((observation) => ({
        seller_price: positiveNumber(observation?.seller_price, observation?.sellerPrice),
        client_price: positiveNumber(observation?.client_price, observation?.clientPrice),
        first_seen_at: isoTimestamp(observation?.first_seen_at, observation?.firstSeenAt),
        last_seen_at: isoTimestamp(observation?.last_seen_at, observation?.lastSeenAt, observation?.first_seen_at),
        source: String(observation?.source || '').trim()
      }))
      .filter((observation) => observation.seller_price !== null && observation.first_seen_at)
      .sort((left, right) => Date.parse(left.first_seen_at) - Date.parse(right.first_seen_at));
    map.set(`${platform}|${normalized}|${articleKey.toLowerCase()}`, {
      platform,
      article_key: articleKey,
      normalized_article_key: normalized,
      observations
    });
  });
  return map;
}

function appendSnapshot(map, payload = {}, source = '') {
  const observedAt = isoTimestamp(payload?.generatedAt, payload?.asOfDate);
  if (!observedAt) return;
  Object.keys(payload?.platforms || {}).forEach((platformRaw) => {
    const platform = String(platformRaw || '').trim().toLowerCase();
    platformRows(payload, platformRaw).forEach((row) => {
      const articleKey = String(row?.articleKey || row?.article || row?.sku || row?.offerId || '').trim();
      const normalized = normalizeKey(articleKey);
      const sellerPrice = positiveNumber(row?.currentFillPrice, row?.currentPrice, row?.sellerPrice);
      if (!platform || !normalized || sellerPrice === null) return;
      const clientPrice = positiveNumber(row?.currentClientPrice, row?.clientPrice);
      const key = `${platform}|${normalized}|${articleKey.toLowerCase()}`;
      const history = map.get(key) || {
        platform,
        article_key: articleKey,
        normalized_article_key: normalized,
        observations: []
      };
      const observations = history.observations;
      const last = observations[observations.length - 1] || null;
      if (last && Math.abs(last.seller_price - sellerPrice) < 0.005) {
        if (Date.parse(observedAt) >= Date.parse(last.last_seen_at || last.first_seen_at)) {
          last.last_seen_at = observedAt;
          if (clientPrice !== null) last.client_price = clientPrice;
          if (source) last.source = source;
        }
      } else if (!last || Date.parse(observedAt) >= Date.parse(last.first_seen_at)) {
        observations.push({
          seller_price: Number(sellerPrice.toFixed(2)),
          client_price: clientPrice === null ? null : Number(clientPrice.toFixed(2)),
          first_seen_at: observedAt,
          last_seen_at: observedAt,
          source
        });
      }
      map.set(key, history);
    });
  });
}

function pruneObservations(observations = [], asOf = '', retentionDays = 90) {
  const reference = Date.parse(asOf);
  if (!Number.isFinite(reference)) return observations.slice(-24);
  const cutoff = reference - Math.max(1, retentionDays) * 86400000;
  const recent = observations.filter((item) => Date.parse(item.last_seen_at || item.first_seen_at) >= cutoff);
  const prior = observations.filter((item) => Date.parse(item.last_seen_at || item.first_seen_at) < cutoff).slice(-1);
  return [...prior, ...recent].slice(-24);
}

function buildHistory({
  history = {},
  previous = {},
  current = {},
  retentionDays = 90,
  asOf = ''
} = {}) {
  const map = historyMap(history);
  appendSnapshot(map, previous, 'previous_live_prices');
  appendSnapshot(map, current, 'current_live_prices');
  const generatedAt = isoTimestamp(current?.generatedAt, asOf, new Date().toISOString());
  const rows = [...map.values()]
    .map((row) => ({
      ...row,
      observations: pruneObservations(row.observations, generatedAt, retentionDays)
    }))
    .filter((row) => row.observations.length)
    .sort((left, right) => `${left.platform}|${left.normalized_article_key}`.localeCompare(`${right.platform}|${right.normalized_article_key}`));
  const observationCount = rows.reduce((sum, row) => sum + row.observations.length, 0);
  const changedRows = rows.filter((row) => row.observations.length > 1).length;
  return {
    schema: 'repricer-price-observation-history-v1',
    generatedAt,
    retention_days: retentionDays,
    summary: {
      rows: rows.length,
      observations: observationCount,
      price_changed_rows: changedRows
    },
    rows
  };
}

function main() {
  const args = parseArgs();
  const outputPath = path.resolve(args.output || 'data/repricer_price_observation_history.json');
  const payload = buildHistory({
    history: readJson(args.history ? path.resolve(args.history) : '', {}),
    previous: readJson(args.previous ? path.resolve(args.previous) : '', {}),
    current: readJson(args.current ? path.resolve(args.current) : '', {}),
    retentionDays: Math.max(1, Number(args['retention-days']) || 90),
    asOf: args['as-of-date'] || ''
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: outputPath, summary: payload.summary }, null, 2));
}

if (require.main === module) main();

module.exports = {
  appendSnapshot,
  buildHistory,
  historyMap,
  normalizeKey,
  parseArgs,
  pruneObservations
};
