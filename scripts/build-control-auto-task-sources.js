#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = 'control_auto_task_sources.json';
const SMART_PLATFORMS = new Set(['wb', 'ozon']);
const ADS_PLATFORMS = new Set(['wb', 'ozon', 'ya']);

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const equal = token.indexOf('=');
    const key = token.slice(2, equal >= 0 ? equal : undefined);
    if (equal >= 0) {
      args[key] = token.slice(equal + 1);
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

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveOptions(args = {}) {
  const root = process.cwd();
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, 'data')),
    outputFile: String(args['output-file'] || OUTPUT_FILE),
    smartHistoryDays: positiveInteger(args['smart-history-days'], 14),
    adsHistoryDays: positiveInteger(args['ads-history-days'], 28),
    generatedAt: String(args['generated-at'] || '').trim()
  };
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function text(value) {
  return String(value || '').trim();
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateKey(value) {
  const match = text(value).match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function normalizePlatform(value) {
  const key = text(value).toLowerCase().replace(/[\s_.-]+/g, '');
  if (['wb', 'wildberries', 'wildberriesru'].includes(key)) return 'wb';
  if (['ozon', 'ozonru'].includes(key)) return 'ozon';
  if (['ya', 'ym', 'yamarket', 'yandex', 'yandexmarket'].includes(key)) return 'ya';
  return key;
}

function platformRows(payload = {}) {
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (payload?.rows && typeof payload.rows === 'object') return Object.values(payload.rows);
  return [];
}

function smartDailyPoint(point = {}) {
  const date = dateKey(point.date || point.day || point.label);
  if (!date) return null;
  return {
    date,
    ordersUnits: numberOrZero(point.ordersUnits ?? point.units),
    revenue: numberOrZero(point.revenue ?? point.ordersRevenue),
    price: numberOrZero(point.price)
  };
}

function compactSmartPrice(source = {}, historyDays = 14) {
  const platforms = {};
  Object.entries(source?.platforms || {}).forEach(([sourceKey, payload]) => {
    const platform = normalizePlatform(sourceKey || payload?.platformKey);
    if (!SMART_PLATFORMS.has(platform)) return;
    if (!platforms[platform]) {
      platforms[platform] = {
        generatedAt: text(payload?.generatedAt || source?.generatedAt),
        rows: []
      };
    }
    platformRows(payload).forEach((row) => {
      const articleKey = text(row?.articleKey || row?.article);
      if (!articleKey) return;
      const daily = (Array.isArray(row?.daily) ? row.daily : [])
        .map(smartDailyPoint)
        .filter(Boolean)
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-historyDays);
      platforms[platform].rows.push({
        platformKey: platform,
        platformLabel: text(row?.platformLabel || payload?.platformLabel),
        articleKey,
        article: text(row?.article || articleKey),
        name: text(row?.name || articleKey),
        owner: text(row?.owner),
        currentPrice: numberOrNull(row?.currentPrice),
        currentFillPrice: numberOrNull(row?.currentFillPrice),
        daily
      });
    });
    platforms[platform].rows.sort((left, right) => left.articleKey.localeCompare(right.articleKey));
  });
  return {
    schema: 'portal-control-smart-price-v1',
    generatedAt: text(source?.generatedAt),
    platforms
  };
}

function adsArticleKey(row = {}) {
  return text(row.articleKey || row.offer_id || row.offerId || row.article || row.sku);
}

function aggregateArticle(articleKey) {
  const key = text(articleKey).toLowerCase();
  return !key
    || key === 'all'
    || key === 'total'
    || key.includes('finance')
    || key.includes('summary')
    || key.includes('ads-total')
    || key.endsWith('-total')
    || key.endsWith('_total');
}

function compactAds(source = {}, historyDays = 28) {
  const buckets = new Map();
  const sourceRows = Array.isArray(source?.itemSeries) ? source.itemSeries : [];
  sourceRows.forEach((row) => {
    const platform = normalizePlatform(row?.platformKey || row?.platform || row?.market || row?.channel);
    if (!ADS_PLATFORMS.has(platform)) return;
    const articleKey = adsArticleKey(row);
    const date = dateKey(row?.dateKey || row?.date || row?.day || row?.label);
    if (aggregateArticle(articleKey) || !date) return;
    const bucketKey = `${platform}|${articleKey.toLowerCase()}`;
    const bucket = buckets.get(bucketKey) || {
      platform,
      articleKey,
      article: text(row?.article || articleKey),
      name: text(row?.name || articleKey),
      owner: text(row?.owner),
      daily: new Map()
    };
    const point = bucket.daily.get(date) || {
      date,
      views: 0,
      clicks: 0,
      spend: 0,
      orders: 0,
      revenue: 0,
      campaigns: new Set()
    };
    point.views += numberOrZero(row?.views ?? row?.adsImpressions ?? row?.shows);
    point.clicks += numberOrZero(row?.clicks ?? row?.adsClicks);
    point.spend += numberOrZero(row?.spend ?? row?.adsSpend);
    point.orders += numberOrZero(row?.orders ?? row?.ordersUnits);
    point.revenue += numberOrZero(row?.revenue ?? row?.deliveredRevenue ?? row?.ordersRevenue);
    const campaign = text(row?.campaignName || row?.campaignId || row?.channel);
    if (campaign) point.campaigns.add(campaign);
    bucket.daily.set(date, point);
    buckets.set(bucketKey, bucket);
  });

  const itemSeries = [];
  [...buckets.values()]
    .sort((left, right) => (
      left.platform.localeCompare(right.platform)
      || left.articleKey.localeCompare(right.articleKey)
    ))
    .forEach((bucket) => {
      [...bucket.daily.values()]
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-historyDays)
        .filter((point) => point.views || point.clicks || point.spend || point.orders || point.revenue)
        .forEach((point) => {
          itemSeries.push({
            date: point.date,
            platformKey: bucket.platform,
            articleKey: bucket.articleKey,
            article: bucket.article,
            name: bucket.name,
            owner: bucket.owner,
            views: point.views,
            clicks: point.clicks,
            spend: point.spend,
            orders: point.orders,
            revenue: point.revenue,
            campaignName: [...point.campaigns].slice(0, 4).join(', ')
          });
        });
    });

  const dates = itemSeries.map((row) => row.date).filter(Boolean).sort();
  return {
    schema: 'portal-control-ads-summary-v1',
    generatedAt: text(source?.generatedAt),
    asOfDate: dateKey(source?.asOfDate) || dates[dates.length - 1] || '',
    itemSeries
  };
}

function latestGeneratedAt(values = []) {
  return values.map(text).filter(Boolean).sort().pop() || new Date().toISOString();
}

function buildPayload({
  smartPriceOverlay = {},
  adsSummary = {},
  smartHistoryDays = 14,
  adsHistoryDays = 28,
  generatedAt = ''
} = {}) {
  const compactSmart = compactSmartPrice(smartPriceOverlay, smartHistoryDays);
  const compactAdRows = compactAds(adsSummary, adsHistoryDays);
  return {
    schema: 'portal-control-auto-task-sources-v1',
    generatedAt: generatedAt || latestGeneratedAt([
      compactSmart.generatedAt,
      compactAdRows.generatedAt
    ]),
    history: {
      smartPriceDays: smartHistoryDays,
      adsDays: adsHistoryDays
    },
    smartPriceOverlay: compactSmart,
    adsSummary: compactAdRows,
    summary: {
      smartPriceRows: Object.values(compactSmart.platforms)
        .reduce((sum, platform) => sum + platform.rows.length, 0),
      adsRows: compactAdRows.itemSeries.length
    }
  };
}

function run(argv = process.argv) {
  const options = resolveOptions(parseArgs(argv));
  const smartPriceOverlay = readJson(path.join(options.inputDir, 'smart_price_overlay.json'), {});
  const adsSummary = readJson(path.join(options.inputDir, 'ads_summary.json'), {});
  const payload = buildPayload({
    smartPriceOverlay,
    adsSummary,
    smartHistoryDays: options.smartHistoryDays,
    adsHistoryDays: options.adsHistoryDays,
    generatedAt: options.generatedAt
  });
  const outputPath = path.isAbsolute(options.outputFile)
    ? options.outputFile
    : path.join(options.outputDir, options.outputFile);
  writeJson(outputPath, payload);
  console.log(JSON.stringify({
    output: outputPath,
    generatedAt: payload.generatedAt,
    smartPriceRows: payload.summary.smartPriceRows,
    adsRows: payload.summary.adsRows
  }));
  return payload;
}

if (require.main === module) {
  run();
}

module.exports = {
  aggregateArticle,
  buildPayload,
  compactAds,
  compactSmartPrice,
  normalizePlatform,
  parseArgs,
  resolveOptions,
  run
};
