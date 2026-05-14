#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_PLAN_PCT = 0.08;
const DEFAULT_OZON_PLAN_PCT = 0.25;
const CHANNEL_KEYS = [
  ['wbPromotion', 'ВБ Продвижение'],
  ['wbMedia', 'ВБ Медиа'],
  ['wbInfluencer', 'ВБ Инфлюенс'],
  ['pvzAds', 'Реклама в ПВЗ'],
  ['brandZone', 'Брендзона'],
  ['overviews', 'Обзоры'],
  ['reviewPoints', 'Отзывы за баллы'],
  ['externalAds', 'Внешка']
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--mirror-local-fallback') {
      args.mirrorLocalFallback = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function roundRate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000000) / 1000000 : null;
}

function isoDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(from, to) {
  const dates = [];
  let cursor = from;
  while (cursor && to && cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function monthKey(dateKey) {
  return String(dateKey || '').slice(0, 7);
}

function periodLabel(dateKey) {
  return String(dateKey || '').slice(8, 10) + '.' + String(dateKey || '').slice(5, 7);
}

function resolveOptions(args) {
  const inputDir = path.resolve(args['input-dir'] || path.join(process.cwd(), 'data'));
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(process.cwd(), 'data'));
  const outputDir = args['output-dir'] ? path.resolve(args['output-dir']) : '';
  const mirrorDataDir = path.resolve(args['mirror-data-dir'] || process.env.ALTEA_PORTAL_FALLBACK_DIR || baseDataDir);
  return {
    dryRun: Boolean(args.dryRun),
    inputDir,
    baseDataDir,
    outputDir,
    mirrorDataDir,
    mirrorLocalFallback: Boolean(args.mirrorLocalFallback),
    from: isoDate(args.from || args['date-from']),
    to: isoDate(args.to || args['date-to'])
  };
}

function readLayer(options, fileName, fallback) {
  return readJson(path.join(options.inputDir, fileName), readJson(path.join(options.baseDataDir, fileName), fallback));
}

function normalizePlatformKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'wildberries' || raw === 'вб') return 'wb';
  if (raw === 'ym' || raw === 'yandex') return 'ya';
  return raw || 'all';
}

function buildPlatformDateMap(platformTrends, platformKey) {
  const record = (platformTrends?.platforms || []).find((platform) => normalizePlatformKey(platform?.key || platform?.label) === platformKey);
  const map = new Map();
  for (const point of record?.series || []) {
    const date = isoDate(point?.date || point?.label);
    if (!date) continue;
    const sellerSummary = point?.wbSellerSummary && typeof point.wbSellerSummary === 'object'
      ? point.wbSellerSummary
      : {};
    const wbFinanceTurnover = platformKey === 'wb'
      ? numberOrZero(
        point?.wbSellerSummaryFinanceTurnover
        || point?.financeTurnover
        || sellerSummary.financeTurnover
        || sellerSummary.salesRevenue
      )
      : 0;
    const wbFinancialResult = platformKey === 'wb'
      ? numberOrZero(
        point?.wbSellerSummaryPayForGoods
        || point?.financialResult
        || sellerSummary.financialResult
        || sellerSummary.payForGoods
      )
      : 0;
    map.set(date, {
      units: numberOrZero(point.units),
      ordersRevenue: numberOrZero(point.revenue),
      revenue: wbFinanceTurnover > 0 ? wbFinanceTurnover : numberOrZero(point.revenue),
      margin: wbFinancialResult > 0 ? wbFinancialResult : numberOrZero(point.estimatedMargin || point.margin),
      source: wbFinanceTurnover > 0 ? 'wb-seller-summary-finance-turnover' : 'platform-trends-orders'
    });
  }
  return map;
}

function channelKey(channel) {
  const raw = String(channel || '').trim().toLowerCase();
  if (/медиа|media/.test(raw)) return 'wbMedia';
  if (/инфлю|influ/.test(raw)) return 'wbInfluencer';
  if (/пвз|pvz/.test(raw)) return 'pvzAds';
  if (/брендзон|brand/.test(raw)) return 'brandZone';
  if (/обзор/.test(raw)) return 'overviews';
  if (/отзыв/.test(raw)) return 'reviewPoints';
  if (/внеш|external/.test(raw)) return 'externalAds';
  return 'wbPromotion';
}

function emptyAdsBucket() {
  return { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0, rows: 0 };
}

function addAdsBucket(map, date, row) {
  const current = map.get(date) || emptyAdsBucket();
  current.spend += numberOrZero(row.spend);
  current.views += numberOrZero(row.views);
  current.clicks += numberOrZero(row.clicks);
  current.orders += numberOrZero(row.orders);
  current.revenue += numberOrZero(row.revenue);
  current.rows += 1;
  map.set(date, current);
  return current;
}

function mergePlatformAdsSeries(adsSummary, platformKey, targetMap, onSpendGap) {
  const platform = (adsSummary?.platforms || []).find((item) =>
    normalizePlatformKey(item?.key || item?.platformKey || item?.label) === platformKey
  );
  for (const point of platform?.series || []) {
    const date = isoDate(point.date || point.label);
    if (!date) continue;
    const platformSpend = numberOrZero(point.spend);
    const current = targetMap.get(date) || emptyAdsBucket();
    if (platformSpend > current.spend + 1) {
      const gap = platformSpend - current.spend;
      current.spend += gap;
      if (typeof onSpendGap === 'function') onSpendGap(date, gap);
    }
    current.views = Math.max(current.views, numberOrZero(point.views));
    current.clicks = Math.max(current.clicks, numberOrZero(point.clicks));
    current.orders = Math.max(current.orders, numberOrZero(point.orders));
    current.revenue = Math.max(current.revenue, numberOrZero(point.revenue));
    targetMap.set(date, current);
  }
}

function buildAdsDailyMaps(adsSummary) {
  const byDate = new Map();
  const byDateChannel = new Map();
  const ozonByDate = new Map();
  for (const row of adsSummary?.itemSeries || []) {
    const platformKey = normalizePlatformKey(row?.platformKey || row?.platform || row?.marketplace || row?.data_source);
    if (!['wb', 'ozon'].includes(platformKey)) continue;
    const date = isoDate(row.date || row.day || row.label);
    if (!date) continue;
    const targetMap = platformKey === 'ozon' ? ozonByDate : byDate;
    addAdsBucket(targetMap, date, row);

    if (platformKey !== 'wb') continue;
    const key = `${date}|${channelKey(row.channel)}`;
    const channelCurrent = byDateChannel.get(key) || 0;
    byDateChannel.set(key, channelCurrent + numberOrZero(row.spend));
  }

  mergePlatformAdsSeries(adsSummary, 'wb', byDate, (date, gap) => {
    const key = `${date}|wbPromotion`;
    byDateChannel.set(key, (byDateChannel.get(key) || 0) + gap);
  });
  mergePlatformAdsSeries(adsSummary, 'ozon', ozonByDate);

  return { byDate, byDateChannel, ozonByDate };
}

function buildReviewPointsMap(wbFeedbacksSummary) {
  const map = new Map();
  for (const row of wbFeedbacksSummary?.reviewsForPoints?.daily || []) {
    const date = isoDate(row.date);
    if (!date) continue;
    const current = map.get(date) || { spend: 0, feedbacks: 0 };
    current.spend += numberOrZero(row.spend ?? row.points);
    current.feedbacks += numberOrZero(row.feedbacks);
    map.set(date, current);
  }
  return map;
}

function planPctForMonth(iuPlan, month) {
  const source = iuPlan?.months?.[month] || {};
  const pct = numberOrZero(source.iuAdsWb) > 0 && numberOrZero(source.iuRevenueWb) > 0
    ? numberOrZero(source.iuAdsWb) / numberOrZero(source.iuRevenueWb)
    : DEFAULT_PLAN_PCT;
  return Number.isFinite(pct) && pct > 0 ? pct : DEFAULT_PLAN_PCT;
}

function ozonPlanPctForMonth(iuPlan, month) {
  const source = iuPlan?.months?.[month] || {};
  const pct = numberOrZero(source.iuAdsOzon) > 0 && numberOrZero(source.iuRevenueOzon) > 0
    ? numberOrZero(source.iuAdsOzon) / numberOrZero(source.iuRevenueOzon)
    : numberOrZero(iuPlan?.assumptions?.ozonIuAdsRate) || DEFAULT_OZON_PLAN_PCT;
  return Number.isFinite(pct) && pct > 0 ? pct : DEFAULT_OZON_PLAN_PCT;
}

function monthPlan(iuPlan, month) {
  const source = iuPlan?.months?.[month] || {};
  const days = numberOrZero(source.days) || new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const iuRevenueWb = numberOrZero(source.iuRevenueWb);
  const iuRevenueOzon = numberOrZero(source.iuRevenueOzon);
  const iuAdsWb = numberOrZero(source.iuAdsWb);
  const iuAdsOzon = numberOrZero(source.iuAdsOzon);
  const dailyIuRevenueWb = numberOrZero(source.dailyIuRevenueWb) || (days > 0 ? iuRevenueWb / days : 0);
  const dailyIuRevenueOzon = numberOrZero(source.dailyIuRevenueOzon) || (days > 0 ? iuRevenueOzon / days : 0);
  const dailyIuAdsWb = numberOrZero(source.dailyIuAdsWb) || (days > 0 ? iuAdsWb / days : 0);
  const dailyIuAdsOzon = numberOrZero(source.dailyIuAdsOzon) || (days > 0 ? iuAdsOzon / days : 0);
  return {
    label: source.label || month,
    days,
    iuRevenueWb,
    iuRevenueOzon,
    iuRevenueTotal: numberOrZero(source.iuRevenueTotal),
    iuAdsWb,
    iuAdsOzon,
    iuAdsTotal: numberOrZero(source.iuAdsTotal),
    dailyIuRevenueWb,
    dailyIuRevenueOzon,
    dailyIuRevenueTotal: numberOrZero(source.dailyIuRevenueTotal) || dailyIuRevenueWb + dailyIuRevenueOzon,
    dailyIuAdsWb,
    dailyIuAdsOzon,
    dailyIuAdsTotal: numberOrZero(source.dailyIuAdsTotal) || dailyIuAdsWb + dailyIuAdsOzon
  };
}

function dateRange(platformTrends, adsSummary, explicitFrom, explicitTo) {
  const dates = [];
  for (const platform of platformTrends?.platforms || []) {
    for (const point of platform?.series || []) {
      const date = isoDate(point.date || point.label);
      if (date) dates.push(date);
    }
  }
  for (const row of adsSummary?.itemSeries || []) {
    const date = isoDate(row.date || row.day || row.label);
    if (date) dates.push(date);
  }
  const platformLatestDate = (key) => (
    (platformTrends?.platforms || [])
      .find((platform) => String(platform?.key || '').trim().toLowerCase() === key)
      ?.series
      ?.map((point) => isoDate(point.date || point.label))
      ?.filter(Boolean) || []
  ).sort().pop() || '';
  const wbLatestDate = platformLatestDate('wb');
  const ozonLatestDate = platformLatestDate('ozon');
  const latestCompleteMarketplaceDate = wbLatestDate && ozonLatestDate
    ? (wbLatestDate < ozonLatestDate ? wbLatestDate : ozonLatestDate)
    : '';
  const sorted = dates.sort();
  const to = explicitTo || latestCompleteMarketplaceDate || sorted[sorted.length - 1] || isoDate(platformTrends?.latestMarketplaceDate) || isoDate(adsSummary?.asOfDate) || new Date().toISOString().slice(0, 10);
  const from = explicitFrom || `${to.slice(0, 7)}-01`;
  return { from, to };
}

function buildDailyRows(platformTrends, iuPlan, adsSummary, wbFeedbacksSummary, options) {
  const wbMap = buildPlatformDateMap(platformTrends, 'wb');
  const ozonMap = buildPlatformDateMap(platformTrends, 'ozon');
  const adsMaps = buildAdsDailyMaps(adsSummary);
  const reviewPointsMap = buildReviewPointsMap(wbFeedbacksSummary);
  const range = dateRange(platformTrends, adsSummary, options.from, options.to);
  return enumerateDates(range.from, range.to).map((date) => {
    const month = monthKey(date);
    const plan = monthPlan(iuPlan, month);
    const planPct = planPctForMonth(iuPlan, month);
    const planPctOzon = ozonPlanPctForMonth(iuPlan, month);
    const wb = wbMap.get(date) || {};
    const ozon = ozonMap.get(date) || {};
    const ads = adsMaps.byDate.get(date) || {};
    const ozonAds = adsMaps.ozonByDate.get(date) || {};
    const hasOzonAdsFact = adsMaps.ozonByDate.has(date);
    const revenueWb = numberOrZero(wb.revenue);
    const revenueOzon = numberOrZero(ozon.revenue);
    const targetRevenueWb = numberOrZero(plan.dailyIuRevenueWb);
    const targetRevenueOzon = numberOrZero(plan.dailyIuRevenueOzon);
    const revenueWbDelta = revenueWb - targetRevenueWb;
    const revenueOzonDelta = revenueOzon - targetRevenueOzon;
    const planSpendWb = numberOrZero(plan.dailyIuAdsWb) || (targetRevenueWb * planPct);
    const planSpendOzon = numberOrZero(plan.dailyIuAdsOzon) || (targetRevenueOzon * planPctOzon);
    const spendFactOzon = hasOzonAdsFact ? numberOrZero(ozonAds.spend) : revenueOzon * planPctOzon;
    const ozonAdsFactMode = hasOzonAdsFact
      ? 'google_sheets_fact_ads_daily_sku'
      : 'modeled_from_revenue_25pct_no_ozon_ads_fact';
    const channels = Object.fromEntries(CHANNEL_KEYS.map(([key]) => [key, 0]));
    for (const [key] of CHANNEL_KEYS) channels[key] = roundMoney(adsMaps.byDateChannel.get(`${date}|${key}`) || 0);
    const feedbackReviewPoints = reviewPointsMap.get(date) || { spend: 0, feedbacks: 0 };
    const reviewPointsFromFeedbacks = roundMoney(feedbackReviewPoints.spend);
    let reviewPointsAddedToSpend = 0;
    if (reviewPointsFromFeedbacks > 0 && numberOrZero(channels.reviewPoints) <= 0) {
      channels.reviewPoints = reviewPointsFromFeedbacks;
      reviewPointsAddedToSpend = reviewPointsFromFeedbacks;
    }
    const externalSpend = numberOrZero(channels.externalAds);
    const spendFactTotal = numberOrZero(ads.spend) + reviewPointsAddedToSpend;
    const spendFact = Math.max(0, spendFactTotal - externalSpend);
    const spendFactIu = spendFact + spendFactOzon;
    const spendDelta = spendFact - planSpendWb;
    const spendDeltaOzon = spendFactOzon - planSpendOzon;
    const spendDeltaIu = spendFactIu - planSpendWb - planSpendOzon;
    return {
      date,
      period: periodLabel(date),
      monthKey: month,
      targetRevenueWb: roundMoney(targetRevenueWb),
      revenueWb: roundMoney(revenueWb),
      revenueWbDelta: roundMoney(revenueWbDelta),
      revenueWbDeltaPct: targetRevenueWb > 0 ? roundRate(revenueWbDelta / targetRevenueWb) : null,
      revenueWbCompletionPct: targetRevenueWb > 0 ? roundRate(revenueWb / targetRevenueWb) : null,
      targetRevenueOzon: roundMoney(targetRevenueOzon),
      revenueOzon: roundMoney(revenueOzon),
      revenueOzonDelta: roundMoney(revenueOzonDelta),
      revenueOzonDeltaPct: targetRevenueOzon > 0 ? roundRate(revenueOzonDelta / targetRevenueOzon) : null,
      revenueOzonCompletionPct: targetRevenueOzon > 0 ? roundRate(revenueOzon / targetRevenueOzon) : null,
      planPctOzon: roundRate(planPctOzon),
      planSpendOzon: roundMoney(planSpendOzon),
      spendFactOzon: roundMoney(spendFactOzon),
      factPctOzon: revenueOzon > 0 ? roundRate(spendFactOzon / revenueOzon) : null,
      spendDeltaOzon: roundMoney(spendDeltaOzon),
      spendDeltaOzonPct: planSpendOzon > 0 ? roundRate(spendDeltaOzon / planSpendOzon) : null,
      ozonAdsFactMode,
      revenueTotalIu: roundMoney(numberOrZero(wb.revenue) + revenueOzon),
      revenueWbSource: wb.source || '',
      unitsWb: Math.round(numberOrZero(wb.units)),
      unitsOzon: Math.round(numberOrZero(ozon.units)),
      planPct: roundRate(planPct),
      planSpendWb: roundMoney(planSpendWb),
      spendFact: roundMoney(spendFact),
      spendFactDrr: roundMoney(spendFact),
      spendFactTotal: roundMoney(spendFactTotal),
      spendFactIu: roundMoney(spendFactIu),
      spendFactTotalIu: roundMoney(spendFactTotal + spendFactOzon),
      factPct: revenueWb > 0 ? roundRate(spendFact / revenueWb) : null,
      factPctIu: revenueWb + revenueOzon > 0 ? roundRate(spendFactIu / (revenueWb + revenueOzon)) : null,
      ...channels,
      reviewPointsSource: reviewPointsFromFeedbacks > 0 ? 'wb_feedbacks_api_supplierFeedbackValuation' : '',
      reviewPointsFeedbacks: Math.round(numberOrZero(feedbackReviewPoints.feedbacks)),
      spendDelta: roundMoney(spendDelta),
      spendDeltaPct: planSpendWb > 0 ? roundRate(spendDelta / planSpendWb) : null,
      spendDeltaIu: roundMoney(spendDeltaIu),
      spendDeltaIuPct: planSpendWb + planSpendOzon > 0 ? roundRate(spendDeltaIu / (planSpendWb + planSpendOzon)) : null,
      externalAdsExcludedFromDrr: true,
      adsViews: Math.round(numberOrZero(ads.views)),
      adsClicks: Math.round(numberOrZero(ads.clicks)),
      adsOrders: Math.round(numberOrZero(ads.orders)),
      adsRevenue: roundMoney(numberOrZero(ads.revenue)),
      sourceRows: Math.round(numberOrZero(ads.rows)),
      ozonAdsViews: Math.round(numberOrZero(ozonAds.views)),
      ozonAdsClicks: Math.round(numberOrZero(ozonAds.clicks)),
      ozonAdsOrders: Math.round(numberOrZero(ozonAds.orders)),
      ozonAdsRevenue: roundMoney(numberOrZero(ozonAds.revenue)),
      ozonAdsSourceRows: Math.round(numberOrZero(ozonAds.rows))
    };
  });
}

function sumRows(rows, field) {
  return rows.reduce((sum, row) => sum + numberOrZero(row[field]), 0);
}

function buildMonthRows(dailyRows, iuPlan) {
  const groups = new Map();
  for (const row of dailyRows) {
    const current = groups.get(row.monthKey) || [];
    current.push(row);
    groups.set(row.monthKey, current);
  }
  return [...groups.entries()].map(([month, rows]) => {
    const plan = monthPlan(iuPlan, month);
    const revenueWb = sumRows(rows, 'revenueWb');
    const revenueOzon = sumRows(rows, 'revenueOzon');
    const revenueTotalIu = sumRows(rows, 'revenueTotalIu');
    const spendFact = sumRows(rows, 'spendFact');
    const spendFactOzon = sumRows(rows, 'spendFactOzon');
    const spendFactIu = sumRows(rows, 'spendFactIu');
    const spendFactTotal = sumRows(rows, 'spendFactTotal');
    const spendFactTotalIu = sumRows(rows, 'spendFactTotalIu');
    const externalAds = sumRows(rows, 'externalAds');
    const planSpendWb = sumRows(rows, 'planSpendWb');
    const planSpendOzon = sumRows(rows, 'planSpendOzon');
    const targetRevenueWb = sumRows(rows, 'targetRevenueWb');
    const targetRevenueOzon = sumRows(rows, 'targetRevenueOzon');
    const revenueWbDelta = sumRows(rows, 'revenueWbDelta');
    const revenueOzonDelta = sumRows(rows, 'revenueOzonDelta');
    const spendDeltaOzon = sumRows(rows, 'spendDeltaOzon');
    const spendDeltaIu = sumRows(rows, 'spendDeltaIu');
    const ozonAdsFactModes = Array.from(new Set(rows.map((row) => row.ozonAdsFactMode).filter(Boolean)));
    const plannedRevenueToDate = numberOrZero(plan.dailyIuRevenueTotal) * rows.length;
    const plannedRevenueWbToDate = numberOrZero(plan.dailyIuRevenueWb) * rows.length;
    const plannedRevenueOzonToDate = numberOrZero(plan.dailyIuRevenueOzon) * rows.length;
    const plannedAdsWbToDate = numberOrZero(plan.dailyIuAdsWb) * rows.length;
    const plannedAdsOzonToDate = numberOrZero(plan.dailyIuAdsOzon) * rows.length;
    const plannedAdsToDate = numberOrZero(plan.dailyIuAdsTotal) * rows.length;
    return {
      monthKey: month,
      label: plan.label,
      daysInPlan: plan.days,
      daysInSummary: rows.length,
      iuRevenuePlan: roundMoney(plan.iuRevenueTotal),
      iuRevenuePlanToDate: roundMoney(plannedRevenueToDate),
      iuRevenueFactToDate: roundMoney(revenueTotalIu),
      iuRevenueCompletionToDate: plannedRevenueToDate > 0 ? roundRate(revenueTotalIu / plannedRevenueToDate) : null,
      iuRevenueWbPlan: roundMoney(plan.iuRevenueWb),
      iuRevenueWbPlanToDate: roundMoney(plannedRevenueWbToDate),
      iuRevenueWbFactToDate: roundMoney(revenueWb),
      iuRevenueWbCompletionToDate: plannedRevenueWbToDate > 0 ? roundRate(revenueWb / plannedRevenueWbToDate) : null,
      iuRevenueOzonPlan: roundMoney(plan.iuRevenueOzon),
      iuRevenueOzonPlanToDate: roundMoney(plannedRevenueOzonToDate),
      iuRevenueOzonFactToDate: roundMoney(revenueOzon),
      iuRevenueOzonCompletionToDate: plannedRevenueOzonToDate > 0 ? roundRate(revenueOzon / plannedRevenueOzonToDate) : null,
      iuAdsPlan: roundMoney(plan.iuAdsWb),
      iuAdsPlanToDate: roundMoney(plannedAdsWbToDate),
      iuAdsOzonPlan: roundMoney(plan.iuAdsOzon),
      iuAdsOzonPlanToDate: roundMoney(plannedAdsOzonToDate),
      iuAdsTotalPlan: roundMoney(plan.iuAdsTotal),
      iuAdsTotalPlanToDate: roundMoney(plannedAdsToDate),
      iuAdsFactWbToDate: roundMoney(spendFact),
      iuAdsFactWbTotalToDate: roundMoney(spendFactTotal),
      iuAdsFactOzonToDate: roundMoney(spendFactOzon),
      iuAdsFactTotalToDate: roundMoney(spendFactIu),
      iuAdsFactTotalWithExternalToDate: roundMoney(spendFactTotalIu),
      iuAdsCompletionToDate: plannedAdsWbToDate > 0 ? roundRate(spendFact / plannedAdsWbToDate) : null,
      iuAdsCompletionOzonToDate: plannedAdsOzonToDate > 0 ? roundRate(spendFactOzon / plannedAdsOzonToDate) : null,
      iuAdsCompletionTotalToDate: plannedAdsToDate > 0 ? roundRate(spendFactIu / plannedAdsToDate) : null,
      targetRevenueWb: roundMoney(targetRevenueWb),
      revenueWbDelta: roundMoney(revenueWbDelta),
      revenueWbDeltaPct: targetRevenueWb > 0 ? roundRate(revenueWbDelta / targetRevenueWb) : null,
      revenueWbCompletionPct: targetRevenueWb > 0 ? roundRate(revenueWb / targetRevenueWb) : null,
      targetRevenueOzon: roundMoney(targetRevenueOzon),
      revenueOzonDelta: roundMoney(revenueOzonDelta),
      revenueOzonDeltaPct: targetRevenueOzon > 0 ? roundRate(revenueOzonDelta / targetRevenueOzon) : null,
      revenueOzonCompletionPct: targetRevenueOzon > 0 ? roundRate(revenueOzon / targetRevenueOzon) : null,
      planPctOzon: roundRate(ozonPlanPctForMonth(iuPlan, month)),
      planSpendOzon: roundMoney(planSpendOzon),
      revenueWb: roundMoney(revenueWb),
      revenueOzon: roundMoney(revenueOzon),
      spendFact: roundMoney(spendFact),
      spendFactDrr: roundMoney(spendFact),
      spendFactTotal: roundMoney(spendFactTotal),
      spendFactOzon: roundMoney(spendFactOzon),
      spendFactIu: roundMoney(spendFactIu),
      spendFactTotalIu: roundMoney(spendFactTotalIu),
      externalAds: roundMoney(externalAds),
      planSpendWb: roundMoney(planSpendWb),
      drrWb: revenueWb > 0 ? roundRate(spendFact / revenueWb) : null,
      drrOzon: revenueOzon > 0 ? roundRate(spendFactOzon / revenueOzon) : null,
      drrIu: revenueTotalIu > 0 ? roundRate(spendFactIu / revenueTotalIu) : null,
      spendDelta: roundMoney(spendFact - planSpendWb),
      spendDeltaPct: planSpendWb > 0 ? roundRate((spendFact - planSpendWb) / planSpendWb) : null,
      spendDeltaOzon: roundMoney(spendDeltaOzon),
      spendDeltaOzonPct: planSpendOzon > 0 ? roundRate(spendDeltaOzon / planSpendOzon) : null,
      spendDeltaIu: roundMoney(spendDeltaIu),
      spendDeltaIuPct: planSpendWb + planSpendOzon > 0 ? roundRate(spendDeltaIu / (planSpendWb + planSpendOzon)) : null,
      ozonAdsFactMode: ozonAdsFactModes.length === 1 ? ozonAdsFactModes[0] : ozonAdsFactModes.join('+'),
      planPct: roundRate(planPctForMonth(iuPlan, month)),
      externalAdsExcludedFromDrr: true,
      ozonAdsViews: sumRows(rows, 'ozonAdsViews'),
      ozonAdsClicks: sumRows(rows, 'ozonAdsClicks'),
      ozonAdsOrders: sumRows(rows, 'ozonAdsOrders'),
      ozonAdsRevenue: roundMoney(sumRows(rows, 'ozonAdsRevenue')),
      ozonAdsSourceRows: sumRows(rows, 'ozonAdsSourceRows'),
      channels: Object.fromEntries(CHANNEL_KEYS.map(([key, label]) => [key, {
        key,
        label,
        spend: roundMoney(sumRows(rows, key))
      }])),
      reviewPointsFeedbacks: sumRows(rows, 'reviewPointsFeedbacks')
    };
  }).sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function buildChannelRows(dailyRows, adsSummary = {}, wbFeedbacksSummary = {}) {
  const adsSourceMode = String(adsSummary.sourceMode || adsSummary.source || '');
  const wbAdsSource = adsSourceMode.includes('google-sheets-fact-ads')
    ? 'Google Sheets fact_ads_daily_sku'
    : 'WB Promotion API';
  const reviewPointsSource = numberOrZero(wbFeedbacksSummary?.reviewsForPoints?.spend) > 0
    ? 'WB Feedbacks API'
    : '';
  return CHANNEL_KEYS.map(([key, label]) => ({
    key,
    label,
    spend: roundMoney(sumRows(dailyRows, key)),
    source: key === 'wbPromotion' || key === 'wbMedia'
      ? wbAdsSource
      : key === 'reviewPoints' && (reviewPointsSource || sumRows(dailyRows, key) > 0)
        ? (reviewPointsSource || 'WB ads source')
      : key === 'externalAds' && (adsSourceMode.includes('external-sheet') || sumRows(dailyRows, key) > 0)
        ? 'Google Sheets внешка'
        : 'нет источника в v1'
  })).sort((left, right) => right.spend - left.spend || left.label.localeCompare(right.label, 'ru'));
}

function buildPayload(options) {
  const platformTrends = readLayer(options, 'platform_trends.json', { platforms: [] });
  const iuPlan = readLayer(options, 'iu_plan.json', { months: {} });
  const adsSummary = readLayer(options, 'ads_summary.json', { platforms: [], itemSeries: [] });
  const wbFeedbacksSummary = readLayer(options, 'wb_feedbacks_summary.json', { reviewsForPoints: {}, daily: [], cards: [] });
  const dailyRows = buildDailyRows(platformTrends, iuPlan, adsSummary, wbFeedbacksSummary, options);
  const months = buildMonthRows(dailyRows, iuPlan);
  const currentMonth = months[months.length - 1] || null;
  const channels = buildChannelRows(dailyRows, adsSummary, wbFeedbacksSummary);
  const asOfDate = dailyRows.map((row) => row.date).filter(Boolean).sort().pop() || isoDate(platformTrends?.latestMarketplaceDate) || isoDate(adsSummary?.asOfDate) || '';
  const noSourceChannels = channels
    .filter((channel) => channel.source !== 'Google Sheets fact_ads_daily_sku')
    .filter((channel) => !['WB Promotion API', 'WB Feedbacks API', 'Google Sheets внешка'].includes(channel.source))
    .map((channel) => channel.label);
  return {
    generatedAt: new Date().toISOString(),
    asOfDate,
    source: {
      iuPlanGeneratedAt: iuPlan.generatedAt || '',
      platformTrendsGeneratedAt: platformTrends.generatedAt || '',
      adsSummaryGeneratedAt: adsSummary.generatedAt || '',
      wbFeedbacksGeneratedAt: wbFeedbacksSummary.generatedAt || '',
      adsSourceMode: adsSummary.sourceMode || adsSummary.source || ''
    },
    window: {
      from: dailyRows[0]?.date || '',
      to: dailyRows[dailyRows.length - 1]?.date || '',
      days: dailyRows.length
    },
    planPctDefault: DEFAULT_PLAN_PCT,
    ozonPlanPctDefault: DEFAULT_OZON_PLAN_PCT,
    kpis: currentMonth,
    months,
    channels,
    daily: dailyRows,
    diagnostics: {
      adsSourceMode: adsSummary.sourceMode || adsSummary.source || '',
      adsDiagnostics: adsSummary.diagnostics || {},
      wbFeedbacksDiagnostics: wbFeedbacksSummary.diagnostics || {},
      reviewPointsSource: wbFeedbacksSummary?.reviewsForPoints?.sourceStatus || '',
      noSourceChannels,
      unmatchedNmIds: adsSummary.diagnostics?.unmatchedNmIds || [],
      notes: [
        'Ozon ad spend comes from Google Sheets fact_ads_daily_sku when present; planPctOzon remains the plan benchmark.',
        'Review points are filled from WB Feedbacks API supplierFeedbackValuation when present.',
        'ИУ по обороту в workbook сверяется по WB; Ozon ведётся отдельным контуром.',
        'ДРР и каналы рекламы считаются по WB.',
        'Каналы без источника показываются нулем до подключения отдельного источника.'
      ]
    }
  };
}

function writeOutputs(payload, options) {
  const files = [];
  if (options.outputDir) {
    const outputPath = path.join(options.outputDir, 'iu_drr_summary.json');
    writeJson(outputPath, payload);
    files.push(outputPath);
  }
  if (options.mirrorLocalFallback && options.mirrorDataDir) {
    const mirrorPath = path.join(options.mirrorDataDir, 'iu_drr_summary.json');
    const outputPath = options.outputDir ? path.resolve(options.outputDir, 'iu_drr_summary.json') : '';
    if (path.resolve(mirrorPath) !== outputPath) {
      writeJson(mirrorPath, payload);
      files.push(mirrorPath);
    }
  }
  return files;
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const payload = buildPayload(options);
  const writtenFiles = options.dryRun ? [] : writeOutputs(payload, options);
  console.log(JSON.stringify({
    dryRun: options.dryRun,
    asOfDate: payload.asOfDate,
    window: payload.window,
    currentMonth: payload.kpis?.monthKey || '',
    revenueFact: payload.kpis?.iuRevenueFactToDate || 0,
    spendFact: payload.kpis?.spendFact || 0,
    drrWb: payload.kpis?.drrWb ?? null,
    dailyRows: payload.daily.length,
    writtenFiles
  }, null, 2));
}

main();
