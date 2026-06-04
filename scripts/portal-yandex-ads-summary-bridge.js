#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PLATFORM_LABELS = {
  ya: '\u042f.\u041c\u0430\u0440\u043a\u0435\u0442',
  all: '\u0412\u0441\u0435 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0438'
};

function parseArgs(argv) {
  const args = { command: 'sync' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--') && index === 2) {
      args.command = token;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const hasSeparateValue = inlineValue === undefined && argv[index + 1] && !String(argv[index + 1]).startsWith('--');
    const nextValue = inlineValue !== undefined ? inlineValue : hasSeparateValue ? argv[index + 1] : true;
    if (hasSeparateValue) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function resolveOptions(args) {
  const root = process.cwd();
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(root, 'data'));
  return {
    command: args.command || 'sync',
    baseDataDir,
    platformTrendsPath: path.resolve(args['platform-trends'] || args['platform-trends-file'] || path.join(baseDataDir, 'platform_trends.json')),
    adsSummaryPath: path.resolve(args['ads-summary'] || args['ads-summary-file'] || path.join(baseDataDir, 'ads_summary.json')),
    outputPath: path.resolve(args['output-file'] || args.output || args['ads-summary'] || args['ads-summary-file'] || path.join(baseDataDir, 'ads_summary.json')),
    from: isoDate(args.from || args['date-from'] || ''),
    to: isoDate(args.to || args['date-to'] || '')
  };
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

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/giu, '');
}

function numberOrZero(value) {
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  }
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function inWindow(dateKey, from, to) {
  if (!dateKey) return false;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

function latestSeriesDate(platforms = []) {
  const dates = [];
  for (const platform of Array.isArray(platforms) ? platforms : []) {
    for (const point of Array.isArray(platform?.series) ? platform.series : []) {
      const date = isoDate(point?.date || point?.label);
      if (date) dates.push(date);
    }
  }
  return dates.sort().pop() || '';
}

function platformTotals(series = []) {
  return series.reduce((acc, point) => {
    acc.views += numberOrZero(point.views);
    acc.clicks += numberOrZero(point.clicks);
    acc.spend += numberOrZero(point.spend);
    acc.orders += numberOrZero(point.orders);
    acc.revenue += numberOrZero(point.revenue);
    acc.addToCart += numberOrZero(point.addToCart);
    acc.sourceRows += numberOrZero(point.sourceRows);
    return acc;
  }, { views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0, addToCart: 0, sourceRows: 0 });
}

function roundPoint(point) {
  return {
    ...point,
    views: Number(numberOrZero(point.views).toFixed(4)),
    clicks: Number(numberOrZero(point.clicks).toFixed(4)),
    spend: Number(numberOrZero(point.spend).toFixed(2)),
    orders: Number(numberOrZero(point.orders).toFixed(4)),
    revenue: Number(numberOrZero(point.revenue).toFixed(2)),
    addToCart: Number(numberOrZero(point.addToCart).toFixed(4)),
    sourceRows: Number(numberOrZero(point.sourceRows).toFixed(4))
  };
}

function yandexPointFromTrend(point = {}) {
  const date = isoDate(point.date || point.label);
  return roundPoint({
    date,
    label: date,
    views: numberOrZero(point.views ?? point.adsImpressions ?? point.shows),
    clicks: numberOrZero(point.clicks ?? point.adsClicks),
    spend: numberOrZero(point.spend ?? point.adsSpend),
    orders: numberOrZero(point.orders ?? point.ordersUnits),
    revenue: numberOrZero(point.revenue ?? point.deliveredRevenue ?? point.ordersRevenue),
    addToCart: numberOrZero(point.addToCart ?? point.toCart),
    sourceRows: numberOrZero(point.sourceRows),
    sourceMode: 'yandex-market-sales-funnel-no-ad-spend'
  });
}

function buildYandexPlatform(platformTrends, from, to) {
  const platform = (Array.isArray(platformTrends?.platforms) ? platformTrends.platforms : [])
    .find((item) => normalizeKey(item?.key || item?.platformKey) === 'ya');
  const series = (Array.isArray(platform?.series) ? platform.series : [])
    .map(yandexPointFromTrend)
    .filter((point) => inWindow(point.date, from, to))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const totals = platformTotals(series);
  return {
    key: 'ya',
    label: PLATFORM_LABELS.ya,
    views: Number(totals.views.toFixed(4)),
    clicks: Number(totals.clicks.toFixed(4)),
    spend: Number(totals.spend.toFixed(2)),
    orders: Number(totals.orders.toFixed(4)),
    revenue: Number(totals.revenue.toFixed(2)),
    addToCart: Number(totals.addToCart.toFixed(4)),
    sourceRows: Number(totals.sourceRows.toFixed(4)),
    sourceMode: 'yandex-market-sales-funnel-no-ad-spend',
    series
  };
}

function buildYandexItemSeries(platformTrends, from, to) {
  const articles = Array.isArray(platformTrends?.extraMarketplace?.platforms?.ya?.articles)
    ? platformTrends.extraMarketplace.platforms.ya.articles
    : [];
  const rows = [];
  for (const article of articles) {
    for (const point of Array.isArray(article?.daily) ? article.daily : []) {
      const date = isoDate(point.date || point.label);
      if (!inWindow(date, from, to)) continue;
      const row = roundPoint({
        date,
        platformKey: 'ya',
        articleKey: normalizeText(article.articleKey || article.article),
        article: normalizeText(article.article || article.articleKey),
        name: normalizeText(article.name || article.article || article.articleKey),
        owner: normalizeText(article.owner),
        views: numberOrZero(point.adsImpressions ?? point.views ?? point.shows),
        clicks: numberOrZero(point.adsClicks ?? point.clicks),
        spend: numberOrZero(point.spend ?? point.adsSpend),
        orders: numberOrZero(point.ordersUnits ?? point.orders),
        revenue: numberOrZero(point.revenue ?? point.deliveredRevenue ?? point.ordersRevenue),
        addToCart: numberOrZero(point.addToCart ?? point.toCart),
        sourceRows: numberOrZero(point.sourceRows || article.sourceRows),
        sourceMode: 'yandex-market-sales-funnel-no-ad-spend'
      });
      if (row.views || row.clicks || row.orders || row.revenue || row.addToCart) rows.push(row);
    }
  }
  return rows.sort((left, right) => (
    String(left.date).localeCompare(String(right.date))
    || String(left.articleKey).localeCompare(String(right.articleKey), 'ru')
  ));
}

function buildAllPlatform(platforms) {
  const byDate = new Map();
  for (const platform of platforms) {
    const key = normalizeKey(platform?.key || platform?.platformKey);
    if (!key || key === 'all') continue;
    for (const point of Array.isArray(platform?.series) ? platform.series : []) {
      const date = isoDate(point.date || point.label);
      if (!date) continue;
      const current = byDate.get(date) || { date, label: date, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0, addToCart: 0 };
      current.views += numberOrZero(point.views);
      current.clicks += numberOrZero(point.clicks);
      current.spend += numberOrZero(point.spend);
      current.orders += numberOrZero(point.orders);
      current.revenue += numberOrZero(point.revenue);
      current.addToCart += numberOrZero(point.addToCart);
      byDate.set(date, current);
    }
  }
  const series = Array.from(byDate.values())
    .map(roundPoint)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const totals = platformTotals(series);
  return {
    key: 'all',
    label: PLATFORM_LABELS.all,
    views: Number(totals.views.toFixed(4)),
    clicks: Number(totals.clicks.toFixed(4)),
    spend: Number(totals.spend.toFixed(2)),
    orders: Number(totals.orders.toFixed(4)),
    revenue: Number(totals.revenue.toFixed(2)),
    addToCart: Number(totals.addToCart.toFixed(4)),
    series
  };
}

function orderedPlatforms(platformMap) {
  const preferred = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'all'];
  const ordered = [];
  for (const key of preferred) {
    if (platformMap.has(key)) ordered.push(platformMap.get(key));
  }
  for (const [key, platform] of platformMap.entries()) {
    if (!preferred.includes(key)) ordered.push(platform);
  }
  return ordered;
}

function patchAdsSummary(platformTrends, adsSummary, options) {
  const sourceInfo = platformTrends?.yandexMarketApiDirect || {};
  const from = options.from || isoDate(sourceInfo.from || sourceInfo.rowDateFrom || '');
  const to = options.to || isoDate(sourceInfo.to || sourceInfo.rowDateTo || platformTrends?.latestMarketplaceDate || '');
  const yandexPlatform = buildYandexPlatform(platformTrends, from, to);
  const yandexItems = buildYandexItemSeries(platformTrends, from, to);
  if (!yandexPlatform.series.length) {
    throw new Error(`No Yandex Market platform_trends rows found for ${from || '?'}..${to || '?'}`);
  }

  const platformMap = new Map(
    (Array.isArray(adsSummary?.platforms) ? adsSummary.platforms : [])
      .map((platform) => [normalizeKey(platform?.key || platform?.platformKey), platform])
      .filter(([key]) => key && key !== 'all')
  );
  platformMap.set('ya', yandexPlatform);
  platformMap.set('all', buildAllPlatform(Array.from(platformMap.values())));

  const preservedItems = (Array.isArray(adsSummary?.itemSeries) ? adsSummary.itemSeries : [])
    .filter((row) => normalizeKey(row?.platformKey || row?.platform) !== 'ya');
  const platforms = orderedPlatforms(platformMap);
  const latestDate = latestSeriesDate(platforms) || to || adsSummary?.asOfDate || '';
  return {
    ...(adsSummary || {}),
    generatedAt: new Date().toISOString(),
    asOfDate: latestDate,
    note: [
      'Yandex Market sales funnel bridged from platform_trends.json; ad spend remains 0 because the source has no advertising expenses.',
      adsSummary?.note || ''
    ].filter(Boolean).join(' '),
    diagnostics: {
      ...(adsSummary?.diagnostics || {}),
      yandexMarketAdsBridge: {
        generatedAt: new Date().toISOString(),
        source: 'platform_trends.yandexMarketApiDirect',
        from,
        to,
        platformRows: yandexPlatform.series.length,
        itemRows: yandexItems.length,
        views: yandexPlatform.views,
        clicks: yandexPlatform.clicks,
        orders: yandexPlatform.orders,
        revenue: yandexPlatform.revenue,
        spend: yandexPlatform.spend,
        sourceRows: yandexPlatform.sourceRows,
        matchRate: sourceInfo.matchRate ?? null,
        spendFactMode: 'no_ad_spend_in_yandex_shows_sales_api'
      }
    },
    platforms,
    itemSeries: [...preservedItems, ...yandexItems]
  };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (options.command !== 'sync') throw new Error(`Unsupported command: ${options.command}`);
  const platformTrends = readJson(options.platformTrendsPath, null);
  const adsSummary = readJson(options.adsSummaryPath, null);
  if (!platformTrends) throw new Error(`platform_trends not found: ${options.platformTrendsPath}`);
  if (!adsSummary) throw new Error(`ads_summary not found: ${options.adsSummaryPath}`);
  const patched = patchAdsSummary(platformTrends, adsSummary, options);
  writeJson(options.outputPath, patched);
  const bridge = patched.diagnostics?.yandexMarketAdsBridge || {};
  console.log(JSON.stringify({
    output: options.outputPath,
    from: bridge.from,
    to: bridge.to,
    platformRows: bridge.platformRows,
    itemRows: bridge.itemRows,
    views: bridge.views,
    clicks: bridge.clicks,
    orders: bridge.orders,
    revenue: bridge.revenue,
    spend: bridge.spend
  }, null, 2));
}

if (require.main === module) {
  main();
}
