#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeDailyHistory, normalizeKey } = require('./repricer-market-intelligence');

function parseArgs(argv = process.argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
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

function isoTimestamp(...values) {
  for (const value of values) {
    const stamp = Date.parse(String(value || ''));
    if (Number.isFinite(stamp)) return new Date(stamp).toISOString();
  }
  return '';
}

function payloadRows(payload = {}, platform = '') {
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
    const normalizedObservations = normalizeDailyHistory({}, row);
    const rawByDate = new Map((row.observations || []).map((observation) => [observation.date, observation]));
    map.set(`${platform}|${normalized}|${articleKey.toLowerCase()}`, {
      platform,
      article_key: articleKey,
      normalized_article_key: normalized,
      observations: normalizedObservations.map((observation) => {
        const raw = rawByDate.get(observation.date) || {};
        const metrics = {
          margin_pct: raw.margin_pct ?? raw.marginPct ?? null,
          margin_rub: raw.margin_rub ?? raw.marginRub ?? null,
          drr_pct: raw.drr_pct ?? raw.drrPct ?? null,
          stock: raw.stock ?? raw.stock_units ?? raw.stockUnits ?? null
        };
        return {
          date: observation.date,
          units: observation.units,
          seller_price: observation.price,
          client_price: observation.clientPrice,
          ...Object.fromEntries(Object.entries(metrics).filter(([, value]) => value !== null)),
          source: observation.source || raw.source || ''
        };
      })
    });
  });
  return map;
}

function appendPayload(map, payload = {}, source = '') {
  Object.keys(payload?.platforms || {}).forEach((platformRaw) => {
    const platform = String(platformRaw || '').trim().toLowerCase();
    payloadRows(payload, platformRaw).forEach((row) => {
      const articleKey = String(row?.articleKey || row?.article || row?.sku || row?.offerId || '').trim();
      const normalized = normalizeKey(articleKey);
      if (!platform || !normalized) return;
      const key = `${platform}|${normalized}|${articleKey.toLowerCase()}`;
      const history = map.get(key) || {
        platform,
        article_key: articleKey,
        normalized_article_key: normalized,
        observations: []
      };
      const incoming = normalizeDailyHistory(row);
      const byDate = new Map(history.observations.map((observation) => [observation.date, observation]));
      incoming.forEach((observation) => {
        const current = byDate.get(observation.date) || {};
        const metrics = {
          margin_pct: current.margin_pct ?? current.marginPct ?? null,
          margin_rub: current.margin_rub ?? current.marginRub ?? null,
          drr_pct: current.drr_pct ?? current.drrPct ?? null,
          stock: current.stock ?? current.stock_units ?? current.stockUnits ?? null
        };
        byDate.set(observation.date, {
          date: observation.date,
          units: observation.units !== null ? observation.units : (current.units ?? null),
          seller_price: observation.price ?? current.seller_price ?? current.price ?? null,
          client_price: observation.clientPrice ?? current.client_price ?? current.clientPrice
            ?? observation.price ?? current.seller_price ?? current.price ?? null,
          ...Object.fromEntries(Object.entries(metrics).filter(([, value]) => value !== null)),
          source: observation.source || source || current.source || ''
        });
      });
      history.observations = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
      map.set(key, history);
    });
  });
}

function appendCanonicalSnapshot(map, canonical = {}, asOf = '') {
  const date = String(
    asOf
    || canonical?.freshness_reference_date
    || canonical?.asOfDate
    || canonical?.generatedAt
    || ''
  ).slice(0, 10);
  if (!date) return;
  (canonical?.rows || []).forEach((row) => {
    const platform = String(row?.platform || '').trim().toLowerCase();
    const articleKey = String(row?.article_key || row?.articleKey || '').trim();
    const normalized = normalizeKey(articleKey);
    if (!['wb', 'ozon'].includes(platform) || !normalized) return;
    const key = `${platform}|${normalized}|${articleKey.toLowerCase()}`;
    const history = map.get(key) || {
      platform,
      article_key: articleKey,
      normalized_article_key: normalized,
      observations: []
    };
    const facts = row.facts || {};
    const economics = row.economics || {};
    const currentMarginPct = row?.recommendation?.current_margin_pct ?? null;
    const currentSellerPrice = facts.seller_price ?? null;
    const currentMarginRub = currentMarginPct !== null && currentSellerPrice !== null
      ? Math.round(Number(currentMarginPct) * Number(currentSellerPrice) * 100) / 100
      : null;
    const byDate = new Map(history.observations.map((observation) => [observation.date, observation]));
    const current = byDate.get(date) || {};
    byDate.set(date, {
      ...current,
      date,
      units: current.units ?? null,
      seller_price: facts.seller_price ?? current.seller_price ?? current.price ?? null,
      client_price: facts.client_price ?? current.client_price ?? current.clientPrice ?? null,
      margin_pct: currentMarginPct ?? current.margin_pct ?? null,
      margin_rub: currentMarginRub ?? current.margin_rub ?? null,
      drr_pct: economics.internal_advertising_pct ?? current.drr_pct ?? null,
      stock: facts.stock ?? current.stock ?? null,
      source: 'canonical_daily_economics_snapshot'
    });
    history.observations = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
    map.set(key, history);
  });
}

function pruneObservations(observations = [], asOf = '', retentionDays = 400) {
  const reference = Date.parse(String(asOf || ''));
  if (!Number.isFinite(reference)) return observations.slice(-retentionDays);
  const cutoff = new Date(reference - Math.max(56, retentionDays) * 86400000).toISOString().slice(0, 10);
  return observations.filter((row) => row.date >= cutoff).slice(-retentionDays);
}

function buildMarketHistory({
  history = {},
  workbench = {},
  overlay = {},
  live = {},
  canonical = {},
  asOf = '',
  retentionDays = 400
} = {}) {
  const map = historyMap(history);
  appendPayload(map, workbench, 'smart_price_workbench');
  appendPayload(map, overlay, 'smart_price_overlay');
  appendPayload(map, live, 'repricer_live_prices');
  appendCanonicalSnapshot(map, canonical, asOf);
  const generatedAt = isoTimestamp(live?.generatedAt, overlay?.generatedAt, asOf, new Date().toISOString());
  const rows = [...map.values()]
    .map((row) => ({
      ...row,
      observations: pruneObservations(row.observations, generatedAt, retentionDays)
    }))
    .filter((row) => row.observations.length)
    .sort((left, right) => (
      `${left.platform}|${left.normalized_article_key}|${left.article_key}`
        .localeCompare(`${right.platform}|${right.normalized_article_key}|${right.article_key}`)
    ));
  return {
    schema: 'repricer-market-observation-history-v1',
    generatedAt,
    retention_days: retentionDays,
    summary: {
      rows: rows.length,
      observations: rows.reduce((sum, row) => sum + row.observations.length, 0),
      demand_observations: rows.reduce(
        (sum, row) => sum + row.observations.filter((item) => item.units !== null).length,
        0
      ),
      price_observations: rows.reduce(
        (sum, row) => sum + row.observations.filter((item) => item.seller_price !== null).length,
        0
      ),
      economics_observations: rows.reduce(
        (sum, row) => sum + row.observations.filter((item) => (
          item.margin_pct != null || item.drr_pct != null || item.stock != null
        )).length,
        0
      )
    },
    rows
  };
}

function main() {
  const args = parseArgs();
  const inputDir = path.resolve(args['input-dir'] || 'data');
  const outputPath = path.resolve(args.output || path.join(inputDir, 'repricer_market_observation_history.json'));
  const payload = buildMarketHistory({
    history: readJson(path.resolve(args.history || outputPath), {}),
    workbench: readJson(path.resolve(args.workbench || path.join(inputDir, 'smart_price_workbench.json')), {}),
    overlay: readJson(path.resolve(args.overlay || path.join(inputDir, 'smart_price_overlay.json')), {}),
    live: readJson(path.resolve(args.live || path.join(inputDir, 'repricer_live_prices.json')), {}),
    canonical: args.canonical ? readJson(path.resolve(args.canonical), {}) : {},
    asOf: args['as-of-date'] || '',
    retentionDays: Math.max(56, Number(args['retention-days']) || 400)
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: outputPath, summary: payload.summary }, null, 2));
}

if (require.main === module) main();

module.exports = {
  appendCanonicalSnapshot,
  appendPayload,
  buildMarketHistory,
  historyMap,
  parseArgs,
  pruneObservations
};
