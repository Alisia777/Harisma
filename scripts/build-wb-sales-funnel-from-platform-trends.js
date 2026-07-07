#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function numberOrZero(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value) {
  const numeric = numberOrZero(value);
  return numeric || numeric === 0 && (value === 0 || value === '0') ? numeric : null;
}

function isoDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function addDays(iso, delta) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(from, to) {
  const dates = [];
  if (!from || !to) return dates;
  for (let current = from; current <= to; current = addDays(current, 1)) {
    dates.push(current);
  }
  return dates;
}

function shortDate(iso) {
  const [year, month, day] = String(iso || '').split('-');
  return year && month && day ? `${day}.${month}.${year}` : '';
}

function periodLabel(period) {
  return period?.from && period?.to ? `${shortDate(period.from)} - ${shortDate(period.to)}` : '';
}

function buildSkuMaps(skus) {
  const byArticle = new Map();
  const byNmId = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    const articleKeys = [
      sku?.articleKey,
      sku?.article,
      sku?.sku,
      sku?.sellerArticle,
      sku?.supplierArticle
    ].map(normalizeKey).filter(Boolean);
    for (const key of articleKeys) {
      if (!byArticle.has(key)) byArticle.set(key, sku);
    }
    const nmId = String(Math.trunc(numberOrZero(sku?.wb?.nmId || sku?.nmId || sku?.wbNmId)));
    if (nmId && nmId !== '0' && !byNmId.has(nmId)) byNmId.set(nmId, sku);
  }
  return { byArticle, byNmId };
}

function buildFeedbackMaps(wbFeedbacks) {
  const byArticle = new Map();
  const byNmId = new Map();
  for (const card of Array.isArray(wbFeedbacks?.cards) ? wbFeedbacks.cards : []) {
    const key = normalizeKey(card?.articleKey || card?.supplierArticle || card?.article);
    if (key && !byArticle.has(key)) byArticle.set(key, card);
    const nmId = String(Math.trunc(numberOrZero(card?.nmId)));
    if (nmId && nmId !== '0' && !byNmId.has(nmId)) byNmId.set(nmId, card);
  }
  return { byArticle, byNmId };
}

function buildWbArticlesFromAdsSummary(adsSummary) {
  const buckets = new Map();
  for (const row of Array.isArray(adsSummary?.itemSeries) ? adsSummary.itemSeries : []) {
    const platformKey = normalizeKey(row?.platformKey || row?.platform || row?.key || '');
    if (platformKey !== 'wb' && platformKey !== 'wildberries') continue;
    const date = rowDate(row);
    if (!date) continue;
    const nmId = String(Math.trunc(numberOrZero(row?.nmId || row?.wbNmId || row?.wb?.nmId)));
    const articleKey = normalizeKey(row?.articleKey || row?.article || row?.sku || (nmId && nmId !== '0' ? `wb-nm-${nmId}` : ''));
    const key = articleKey || nmId;
    if (!key) continue;
    const bucket = buckets.get(key) || {
      articleKey,
      article: row?.article || articleKey,
      nmId: nmId && nmId !== '0' ? nmId : '',
      name: row?.name || '',
      owner: row?.owner || '',
      dailyMap: new Map()
    };
    if (!bucket.name && row?.name) bucket.name = row.name;
    if (!bucket.owner && row?.owner) bucket.owner = row.owner;
    if (!bucket.article && row?.article) bucket.article = row.article;
    if (!bucket.nmId && nmId && nmId !== '0') bucket.nmId = nmId;
    const current = bucket.dailyMap.get(date) || {
      date,
      label: date,
      ordersRevenue: 0,
      revenue: 0,
      ordersUnits: 0,
      units: 0,
      estimatedMargin: 0,
      price: 0,
      priceNumerator: 0,
      priceUnits: 0
    };
    const revenue = numberOrZero(row?.ordersRevenue ?? row?.revenue);
    const units = numberOrZero(row?.orders ?? row?.ordersUnits ?? row?.units);
    current.ordersRevenue += revenue;
    current.revenue += revenue;
    current.ordersUnits += units;
    current.units += units;
    current.estimatedMargin += numberOrZero(row?.estimatedMargin);
    if (units > 0) {
      current.priceNumerator += numberOrZero(row?.price || (revenue / units)) * units;
      current.priceUnits += units;
      current.price = current.priceNumerator / current.priceUnits;
    }
    bucket.dailyMap.set(date, current);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map((bucket) => ({
    articleKey: bucket.articleKey,
    article: bucket.article,
    nmId: bucket.nmId,
    name: bucket.name,
    owner: bucket.owner,
    daily: [...bucket.dailyMap.values()]
      .sort((left, right) => rowDate(left).localeCompare(rowDate(right)))
      .map((row) => ({
        date: row.date,
        label: row.label,
        ordersRevenue: Math.round(row.ordersRevenue * 100) / 100,
        revenue: Math.round(row.revenue * 100) / 100,
        ordersUnits: Math.round(row.ordersUnits * 10000) / 10000,
        units: Math.round(row.units * 10000) / 10000,
        estimatedMargin: Math.round(row.estimatedMargin * 100) / 100,
        price: Math.round(row.price * 100) / 100
      }))
  }));
}

function findWbArticles(platformTrends, adsSummary = {}) {
  const direct = platformTrends?.extraMarketplace?.platforms?.wb?.articles;
  if (Array.isArray(direct) && direct.length) {
    return {
      articles: direct,
      sourceMode: platformTrends?.extraMarketplace?.platforms?.wb?.sourceMode || 'wb-api-direct-sku',
      note: 'Built from platform_trends.extraMarketplace.platforms.wb.articles so the WB rating workbench uses the same fresh API window as the rest of the portal.'
    };
  }
  const platforms = platformTrends?.extraMarketplace?.platforms || {};
  for (const value of Object.values(platforms)) {
    const key = normalizeKey(value?.key || value?.supportKey || value?.label);
    if ((key === 'wb' || key === 'wildberries') && Array.isArray(value?.articles)) {
      return {
        articles: value.articles,
        sourceMode: value?.sourceMode || 'wb-api-direct-sku',
        note: 'Built from WB articles found in platform_trends.extraMarketplace.'
      };
    }
  }
  const fallback = buildWbArticlesFromAdsSummary(adsSummary);
  if (fallback.length) {
    return {
      articles: fallback,
      sourceMode: 'wb-ads-summary-item-series',
      note: 'Built from ads_summary.itemSeries because platform_trends no longer carries WB article detail after marketplace-extra refresh.'
    };
  }
  return {
    articles: [],
    sourceMode: '',
    note: ''
  };
}

function rowDate(row) {
  return isoDate(row?.date || row?.label || row?.day);
}

function sumDaily(article, from, to) {
  const result = {
    revenue: 0,
    units: 0,
    margin: 0,
    rows: 0,
    avgPriceNumerator: 0,
    avgPriceUnits: 0
  };
  for (const row of Array.isArray(article?.daily) ? article.daily : []) {
    const date = rowDate(row);
    if (!date || date < from || date > to) continue;
    const revenue = numberOrZero(row?.ordersRevenue ?? row?.revenue);
    const units = numberOrZero(row?.ordersUnits ?? row?.units);
    result.revenue += revenue;
    result.units += units;
    result.margin += numberOrZero(row?.estimatedMargin);
    result.rows += 1;
    if (units > 0) {
      result.avgPriceNumerator += numberOrZero(row?.price || (revenue / units)) * units;
      result.avgPriceUnits += units;
    }
  }
  result.avgPrice = result.avgPriceUnits > 0 ? result.avgPriceNumerator / result.avgPriceUnits : 0;
  return result;
}

function latestDateFromArticles(articles, fallback = '') {
  let latest = fallback;
  for (const article of articles) {
    for (const row of Array.isArray(article?.daily) ? article.daily : []) {
      const date = rowDate(row);
      if (date && (!latest || date > latest)) latest = date;
    }
  }
  return latest;
}

function buildPayload(options) {
  const platformTrends = readJson(options.platformTrendsPath, {});
  const adsSummary = readJson(options.adsSummaryPath, {});
  const skus = readJson(options.skusPath, []);
  const wbFeedbacks = readJson(options.wbFeedbacksPath, {});
  const articleSource = findWbArticles(platformTrends, adsSummary);
  const articles = articleSource.articles;
  if (!articles.length) {
    throw new Error(`No WB articles found in ${options.platformTrendsPath} or ${options.adsSummaryPath}`);
  }

  const to = options.to || latestDateFromArticles(articles, platformTrends?.extraMarketplace?.platforms?.wb?.to || platformTrends.latestMarketplaceDate || '');
  if (!to) throw new Error('Cannot resolve latest WB funnel date.');
  const from = options.from || addDays(to, -6);
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -6);
  const periodDates = new Set(enumerateDates(from, to));
  const skuMaps = buildSkuMaps(skus);
  const feedbackMaps = buildFeedbackMaps(wbFeedbacks);

  const items = articles
    .map((article) => {
      const key = normalizeKey(article?.articleKey || article?.article || article?.sku || article?.nmId);
      const nmId = String(Math.trunc(numberOrZero(article?.nmId || article?.wbNmId || article?.wb?.nmId)));
      const sku = skuMaps.byArticle.get(key) || skuMaps.byNmId.get(nmId) || {};
      const feedback = feedbackMaps.byArticle.get(key) || feedbackMaps.byNmId.get(nmId) || {};
      const current = sumDaily(article, from, to);
      const previous = sumDaily(article, previousFrom, previousTo);
      if (current.revenue <= 0 && current.units <= 0 && previous.revenue <= 0 && previous.units <= 0) return null;
      const daily = (Array.isArray(article?.daily) ? article.daily : [])
        .filter((row) => periodDates.has(rowDate(row)))
        .map((row) => ({
          date: rowDate(row),
          ordersRevenue: numberOrZero(row?.ordersRevenue ?? row?.revenue),
          ordersUnits: numberOrZero(row?.ordersUnits ?? row?.units),
          estimatedMargin: numberOrZero(row?.estimatedMargin),
          avgPrice: numberOrZero(row?.price)
        }));
      return {
        articleKey: key,
        article: article?.article || sku?.article || sku?.sku || key,
        nmId: nmId && nmId !== '0' ? nmId : String(feedback?.nmId || sku?.wb?.nmId || ''),
        brand: sku?.brand || article?.brand || feedback?.brandName || 'Алтея',
        subject: sku?.category || article?.category || '',
        name: article?.name || sku?.name || feedback?.productName || '',
        owner: article?.owner || sku?.owner?.name || sku?.owner || '',
        cardRating: numberOrNull(sku?.rating),
        reviewRating: numberOrNull(feedback?.avgRating ?? feedback?.portalRating ?? sku?.rating),
        views: 0,
        clicks: 0,
        carts: 0,
        ordersUnits: Math.round(current.units * 10000) / 10000,
        buyoutsUnits: 0,
        cancellationsUnits: 0,
        buyoutPct: null,
        previousBuyoutPct: null,
        ordersRevenue: Math.round(current.revenue * 100) / 100,
        previousOrdersRevenue: Math.round(previous.revenue * 100) / 100,
        ordersRevenueDelta: Math.round((current.revenue - previous.revenue) * 100) / 100,
        buyoutRevenue: 0,
        previousBuyoutRevenue: 0,
        cancelRevenue: 0,
        avgPrice: Math.round(current.avgPrice * 100) / 100,
        avgOrdersPerDay: Math.round((current.units / 7) * 10) / 10,
        estimatedMargin: Math.round(current.margin * 100) / 100,
        wbStock: numberOrZero(sku?.wb?.stock || article?.stock || article?.inStock),
        ownStock: numberOrZero(sku?.stockWarehouse || sku?.warehouseStock || 0),
        daily
      };
    })
    .filter(Boolean)
    .sort((left, right) => numberOrZero(right.ordersRevenue) - numberOrZero(left.ordersRevenue));

  const totals = items.reduce((acc, item) => {
    acc.items += 1;
    acc.ordersRevenue += numberOrZero(item.ordersRevenue);
    acc.previousOrdersRevenue += numberOrZero(item.previousOrdersRevenue);
    acc.ordersRevenueDelta += numberOrZero(item.ordersRevenueDelta);
    acc.ordersUnits += numberOrZero(item.ordersUnits);
    acc.buyoutRevenue += numberOrZero(item.buyoutRevenue);
    acc.buyoutsUnits += numberOrZero(item.buyoutsUnits);
    acc.cancellationsUnits += numberOrZero(item.cancellationsUnits);
    acc.estimatedMargin += numberOrZero(item.estimatedMargin);
    acc.wbStock += numberOrZero(item.wbStock);
    acc.ownStock += numberOrZero(item.ownStock);
    return acc;
  }, {
    items: 0,
    ordersRevenue: 0,
    previousOrdersRevenue: 0,
    ordersRevenueDelta: 0,
    ordersUnits: 0,
    buyoutRevenue: 0,
    buyoutsUnits: 0,
    cancellationsUnits: 0,
    estimatedMargin: 0,
    wbStock: 0,
    ownStock: 0
  });

  return {
    generatedAt: new Date().toISOString(),
    source: 'wb-platform-trends-api',
    sourceFile: path.basename(options.platformTrendsPath),
    sourceMode: articleSource.sourceMode || 'wb-api-direct-sku',
    period: {
      from,
      to,
      days: 7,
      label: periodLabel({ from, to })
    },
    previousPeriod: {
      from: previousFrom,
      to: previousTo,
      days: 7,
      label: periodLabel({ from: previousFrom, to: previousTo })
    },
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [
      key,
      typeof value === 'number' ? Math.round(value * 100) / 100 : value
    ])),
    diagnostics: {
      sourceArticles: articles.length,
      outputItems: items.length,
      platformTrendsGeneratedAt: platformTrends.generatedAt || '',
      platformTrendsLatestMarketplaceDate: platformTrends.latestMarketplaceDate || '',
      wbExtraMarketplaceTo: platformTrends?.extraMarketplace?.platforms?.wb?.to || '',
      adsSummaryGeneratedAt: adsSummary.generatedAt || '',
      adsSummaryAsOfDate: adsSummary.asOfDate || '',
      wbFeedbacksGeneratedAt: wbFeedbacks.generatedAt || '',
      note: articleSource.note
    },
    items
  };
}

function main() {
  const outputDir = argValue('--output-dir', '.altea-google-sheet-sync-output');
  const baseDataDir = argValue('--base-data-dir', 'data');
  const platformTrendsPath = argValue('--platform-trends', path.join(outputDir, 'platform_trends.json'));
  const adsSummaryPath = argValue('--ads-summary', path.join(path.dirname(platformTrendsPath), 'ads_summary.json'));
  const skusPath = argValue('--skus', path.join(outputDir, 'skus.json'));
  const wbFeedbacksPath = argValue('--wb-feedbacks', path.join(outputDir, 'wb_feedbacks_summary.json'));
  const outputFile = argValue('--output-file', path.join(outputDir, 'wb_sales_funnel_report.json'));
  const payload = buildPayload({
    platformTrendsPath,
    adsSummaryPath,
    skusPath,
    wbFeedbacksPath,
    from: argValue('--from', ''),
    to: argValue('--to', '')
  });
  writeJson(outputFile, payload);
  if (hasFlag('--mirror-local-fallback')) {
    writeJson(path.join(baseDataDir, 'wb_sales_funnel_report.json'), payload);
  }
  console.log(JSON.stringify({
    outputFile,
    mirrored: hasFlag('--mirror-local-fallback'),
    generatedAt: payload.generatedAt,
    period: payload.period,
    previousPeriod: payload.previousPeriod,
    items: payload.items.length,
    ordersRevenue: payload.totals.ordersRevenue,
    diagnostics: payload.diagnostics
  }, null, 2));
}

main();
