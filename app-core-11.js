const SKU_PLAN_FACT_PLATFORMS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'];
const SKU_PLAN_FACT_PLATFORM_LABELS = {
  wb: 'WB',
  ozon: 'Ozon',
  ya: 'Я.Маркет',
  goldapple: 'ЗЯ',
  letu: 'Лэтуаль',
  magnit: 'Магнит Маркет'
};
const SKU_PLAN_FACT_PLATFORM_SUPPORT_KEYS = {
  wb: 'wb',
  ozon: 'ozon',
  ya: 'ym',
  goldapple: 'ga',
  letu: 'letu',
  magnit: 'mm'
};
const SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS = new Set(['wb', 'ozon']);
let skuPlanFactSearchTimer = 0;

function skuPlanFactPlatformLabel(platform = '') {
  return SKU_PLAN_FACT_PLATFORM_LABELS[platform] || String(platform || '').toUpperCase();
}

function skuPlanFactPlatformSupportKey(platform = '') {
  return SKU_PLAN_FACT_PLATFORM_SUPPORT_KEYS[platform] || platform;
}

function skuPlanFactPlatformNameLines(row = {}, model = null) {
  return SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const metric = row?.platforms?.[platform] || row?.[platform] || null;
    const label = skuPlanFactPlatformLabel(platform);
    const factAvgCheck = metric?.factAvgCheck;
    const planAvgCheck = metric?.planAvgCheck;
    return `
      <div>${escapeHtml(label)}: <strong>${fmt.money(factAvgCheck)}</strong> <span class="muted small">план ${fmt.money(planAvgCheck)}</span></div>
    `;
  }).join('');
}

function skuPlanFactPlatformTurnoverLines(row = {}) {
  return SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const metric = row?.platforms?.[platform] || row?.[platform] || null;
    const label = skuPlanFactPlatformLabel(platform);
    return `
      <div>${escapeHtml(label)}: <strong>${fmt.num(metric?.turnoverDays, 1)}</strong> дн. <span class="muted small">${fmt.int(metric?.stock)} шт.</span></div>
    `;
  }).join('');
}

function skuPlanFactPlatformAdLines(row = {}) {
  return SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const metric = row?.platforms?.[platform] || row?.[platform] || null;
    const label = skuPlanFactPlatformLabel(platform);
    return `<div>${escapeHtml(label)} ${fmt.money(metric?.adSpend)}</div>`;
  }).join(' · ');
}

function skuPlanFactFilters() {
  state.skuPlanFactFilters = {
    search: '',
    owner: 'all',
    status: 'active',
    platform: 'all',
    month: 'latest',
    date: '',
    sort: 'gap',
    sortDir: 'asc',
    ...(state.skuPlanFactFilters || {})
  };
  if (!['asc', 'desc'].includes(state.skuPlanFactFilters.sortDir)) {
    state.skuPlanFactFilters.sortDir = skuPlanFactDefaultSortDir(state.skuPlanFactFilters.sort);
  }
  return state.skuPlanFactFilters;
}

function skuPlanFactDateKey(value = '') {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function skuPlanFactMonthLabel(monthKey = '') {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return '—';
  return new Date(year, month - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function skuPlanFactMonthDays(monthKey = '') {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return 30;
  return new Date(year, month, 0).getDate();
}

function skuPlanFactMonthFromDate(value = '') {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}/.test(raw) ? raw.slice(0, 7) : '';
}

function skuPlanFactRowsForPlatform(payload = {}, platform = '') {
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  const platformBuckets = payload?.platforms || {};
  const bucketKeys = [...new Set([platform, supportKey])];
  for (const key of bucketKeys) {
    const bucket = platformBuckets?.[key];
    const rawRows = bucket?.rows ?? bucket?.articles;
    if (Array.isArray(rawRows)) return rawRows;
    if (rawRows && typeof rawRows === 'object') {
      return Object.entries(rawRows).map(([rowKey, row]) => ({
        articleKey: row?.articleKey || row?.article || rowKey,
        article: row?.article || row?.articleKey || rowKey,
        ...(row || {})
      }));
    }
  }
  const extraRows = payload?.extraMarketplace?.platforms?.[platform]?.articles;
  if (Array.isArray(extraRows)) return extraRows;
  return [];
}

function skuPlanFactToken(value = '') {
  if (typeof skuLookupToken === 'function') return skuLookupToken(value);
  return String(value ?? '').trim().toLowerCase().replaceAll('ё', 'е').replace(/[^a-zа-я0-9]+/gi, '');
}

function skuPlanFactArticleToken(item = {}) {
  return skuPlanFactToken(item.articleKey || item.article || item.sku || item.vendorCode || '');
}

function skuPlanFactIndexRows(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const token = skuPlanFactArticleToken(row);
    if (!token) return;
    if (!map.has(token)) map.set(token, []);
    map.get(token).push(row);
  });
  return map;
}

function skuPlanFactRowsFromIndexMap(map = null) {
  return map ? [...map.values()].flat() : [];
}

function skuPlanFactBuildIndexes() {
  const smart = {};
  const overlay = {};
  const support = {};
  const prices = {};
  const extra = {};
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    smart[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.smartPriceWorkbench || {}, platform));
    overlay[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.smartPriceOverlay || {}, platform));
    support[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.priceWorkbenchSupport || {}, platform));
    prices[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.prices || {}, platform));
    extra[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.platformTrends || {}, platform));
  });
  return { smart, overlay, support, prices, extra };
}

function skuPlanFactAvailableMonths(indexes) {
  const months = new Set();
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    [indexes.smart?.[platform], indexes.overlay?.[platform], indexes.support?.[platform], indexes.prices?.[platform], indexes.extra?.[platform]].forEach((map) => {
      skuPlanFactRowsFromIndexMap(map).forEach((row) => {
        if (row.planMonthKey) months.add(String(row.planMonthKey).slice(0, 7));
        (row.planMonths || []).forEach((item) => item?.monthKey && months.add(String(item.monthKey).slice(0, 7)));
        (row.actualMonths || []).forEach((item) => item?.monthKey && months.add(String(item.monthKey).slice(0, 7)));
        (row.monthly || row.daily || []).forEach((item) => {
          const monthKey = skuPlanFactMonthFromDate(item?.date);
          if (monthKey) months.add(monthKey);
        });
      });
    });
  });
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    const monthKey = skuPlanFactMonthFromDate(item?.date);
    if (monthKey) months.add(monthKey);
  });
  Object.keys(state.platformPlan?.months || {}).forEach((monthKey) => {
    if (monthKey) months.add(String(monthKey).slice(0, 7));
  });
  (state.iuDrrSummary?.daily || []).forEach((item) => {
    const monthKey = skuPlanFactMonthFromDate(item?.date);
    if (monthKey) months.add(monthKey);
  });
  return [...months].filter(Boolean).sort().reverse();
}

function skuPlanFactLatestMonth(months = []) {
  const sourceMonth = skuPlanFactMonthFromDate(
    state.platformTrends?.asOfDate
    || state.smartPriceOverlay?.asOfDate
    || state.adsSummary?.asOfDate
    || state.iuDrrSummary?.asOfDate
    || todayIso()
  );
  return months.includes(sourceMonth) ? sourceMonth : (months[0] || sourceMonth || todayIso().slice(0, 7));
}

function skuPlanFactSelectedMonth(months = []) {
  const filters = skuPlanFactFilters();
  const dateMonth = skuPlanFactMonthFromDate(filters.date);
  if (dateMonth && (!months.length || months.includes(dateMonth))) return dateMonth;
  if (filters.month && filters.month !== 'latest' && months.includes(filters.month)) return filters.month;
  return skuPlanFactLatestMonth(months);
}

function skuPlanFactLatestActualDate(indexes, monthKey = '') {
  let maxDate = '';
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    [indexes.overlay?.[platform], indexes.smart?.[platform], indexes.support?.[platform], indexes.prices?.[platform], indexes.extra?.[platform]].forEach((map) => {
      skuPlanFactRowsFromIndexMap(map).forEach((row) => {
        (row.daily || row.monthly || []).forEach((item) => {
          const date = String(item?.date || '').slice(0, 10);
          if ((!monthKey || date.slice(0, 7) === monthKey) && date > maxDate) maxDate = date;
        });
      });
    });
  });
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    const date = String(item?.date || '').slice(0, 10);
    if ((!monthKey || date.slice(0, 7) === monthKey) && date > maxDate) maxDate = date;
  });
  (state.platformTrends?.platforms || []).forEach((platform) => {
    (platform?.series || []).forEach((item) => {
      const date = String(item?.date || item?.label || '').slice(0, 10);
      if ((!monthKey || date.slice(0, 7) === monthKey) && date > maxDate) maxDate = date;
    });
  });
  return maxDate;
}

function skuPlanFactMaxFactDate(indexes, monthKey) {
  const maxDate = skuPlanFactLatestActualDate(indexes, monthKey);
  return maxDate || `${monthKey}-${String(skuPlanFactMonthDays(monthKey)).padStart(2, '0')}`;
}

function skuPlanFactDateBounds(indexes, months = []) {
  const safeMonths = months.length ? months : [todayIso().slice(0, 7)];
  const minMonth = safeMonths[safeMonths.length - 1];
  const maxDate = skuPlanFactLatestActualDate(indexes) || skuPlanFactMaxFactDate(indexes, safeMonths[0]);
  return {
    min: minMonth ? `${minMonth}-01` : '',
    max: maxDate
  };
}

function skuPlanFactSelectedDate(indexes, monthKey, maxFactDate = '') {
  const filters = skuPlanFactFilters();
  const maxDate = maxFactDate || skuPlanFactMaxFactDate(indexes, monthKey);
  const selected = skuPlanFactDateKey(filters.date);
  const monthStart = monthKey ? `${monthKey}-01` : '';
  if (selected && skuPlanFactMonthFromDate(selected) === monthKey) {
    if (monthStart && selected < monthStart) return monthStart;
    if (maxDate && selected > maxDate) return maxDate;
    return selected;
  }
  filters.date = maxDate;
  return maxDate;
}

function skuPlanFactElapsedDays(monthKey, maxFactDate) {
  const days = skuPlanFactMonthDays(monthKey);
  const factMonth = skuPlanFactMonthFromDate(maxFactDate);
  if (factMonth === monthKey) return Math.min(days, Math.max(1, Number(String(maxFactDate).slice(8, 10)) || 1));
  return days;
}

function skuPlanFactPlanFromRows(rows = [], monthKey = '') {
  const result = { units: 0, revenue: 0, avgCheck: null, days: skuPlanFactMonthDays(monthKey), source: '' };
  rows.forEach((row) => {
    let month = (row.planMonths || []).find((item) => String(item?.monthKey || '').slice(0, 7) === monthKey);
    if (!month && String(row.planMonthKey || '').slice(0, 7) === monthKey) {
      month = {
        units: row.planMonthUnits,
        revenue: row.planMonthRevenue,
        avgPrice: row.planMonthCheck,
        days: row.planMonthDays,
        source: row.planMonthLabel || 'smart_price_workbench'
      };
    }
    if (!month) return;
    const units = numberOrZero(month.units);
    const avgPrice = Number.isFinite(Number(month.avgPrice)) ? Number(month.avgPrice) : null;
    const revenue = numberOrZero(month.revenue || (avgPrice !== null ? units * avgPrice : 0));
    result.units += units;
    result.revenue += revenue;
    result.days = Number.isFinite(Number(month.days)) ? Number(month.days) : result.days;
    if (!result.source && month.source) result.source = month.source;
  });
  result.avgCheck = result.units > 0 ? result.revenue / result.units : null;
  return result;
}

function skuPlanFactFactFromRows(rows = [], monthKey = '', maxFactDate = '') {
  const result = { units: 0, revenue: 0, avgCheck: null, source: '' };
  const seenDaily = new Set();
  const monthEnd = `${monthKey}-${String(skuPlanFactMonthDays(monthKey)).padStart(2, '0')}`;
  const allowMonthlyFallback = !maxFactDate || maxFactDate >= monthEnd;
  rows.forEach((row, rowIndex) => {
    const daily = [...(row.daily || []), ...(row.monthly || [])];
    daily.forEach((item, itemIndex) => {
      const date = String(item?.date || '').slice(0, 10);
      if (date.slice(0, 7) !== monthKey) return;
      if (maxFactDate && date > maxFactDate) return;
      const dedupeKey = `${row.articleKey || row.article || rowIndex}|${date}|${itemIndex}|${item.revenue}|${item.ordersUnits}`;
      if (seenDaily.has(dedupeKey)) return;
      seenDaily.add(dedupeKey);
      const units = numberOrZero(item.ordersUnits ?? item.deliveredUnits);
      const revenue = numberOrZero(item.revenue);
      result.units += units;
      result.revenue += revenue;
    });
    (row.actualMonths || []).forEach((item) => {
      if (String(item?.monthKey || '').slice(0, 7) !== monthKey) return;
      if (!allowMonthlyFallback) return;
      if (result.revenue > 0 || result.units > 0) return;
      result.units += numberOrZero(item.units);
      result.revenue += numberOrZero(item.revenue);
      if (!result.source && item.source) result.source = item.source;
    });
    if (!result.source && row.sourceMode) result.source = row.sourceMode;
  });
  result.avgCheck = result.units > 0 ? result.revenue / result.units : null;
  return result;
}

function skuPlanFactRowsHavePlan(rows = [], monthKey = '') {
  return rows.some((row) => {
    if (String(row.planMonthKey || '').slice(0, 7) === monthKey) return true;
    return (row.planMonths || []).some((item) => String(item?.monthKey || '').slice(0, 7) === monthKey);
  });
}

function skuPlanFactRowsHaveFact(rows = [], monthKey = '') {
  return rows.some((row) => {
    if ((row.actualMonths || []).some((item) => String(item?.monthKey || '').slice(0, 7) === monthKey)) return true;
    return (row.daily || row.monthly || []).some((item) => skuPlanFactMonthFromDate(item?.date) === monthKey);
  });
}

function skuPlanFactLatestMetric(rows = [], fieldNames = []) {
  for (const row of rows) {
    for (const fieldName of fieldNames) {
      const value = row?.[fieldName];
      if (Number.isFinite(Number(value))) return Number(value);
    }
  }
  return null;
}

function skuPlanFactPlatformSourceRows(indexes = {}, platform = '') {
  if (platform === 'wb' || platform === 'ozon') {
    const overlayRows = skuPlanFactRowsFromIndexMap(indexes.overlay?.[platform]);
    if (overlayRows.length) return overlayRows;
    const smartRows = skuPlanFactRowsFromIndexMap(indexes.smart?.[platform]);
    if (smartRows.length) return smartRows;
    return skuPlanFactRowsFromIndexMap(indexes.support?.[platform]);
  }
  if (platform === 'ya') {
    const priceRows = skuPlanFactRowsFromIndexMap(indexes.prices?.[platform]);
    if (priceRows.length) return priceRows;
    return skuPlanFactRowsFromIndexMap(indexes.extra?.[platform]);
  }
  const extraRows = skuPlanFactRowsFromIndexMap(indexes.extra?.[platform]);
  if (extraRows.length) return extraRows;
  return skuPlanFactRowsFromIndexMap(indexes.prices?.[platform]);
}

function skuPlanFactPlatformPlanRows(indexes = {}, platform = '', monthKey = '') {
  if (!SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS.has(platform)) return [];
  const smartRows = skuPlanFactRowsFromIndexMap(indexes.smart?.[platform]);
  const supportRows = skuPlanFactRowsFromIndexMap(indexes.support?.[platform]);
  return skuPlanFactRowsHavePlan(supportRows, monthKey) ? supportRows : smartRows;
}

function skuPlanFactPlatformPlanUnits(monthKey = '', platform = '') {
  return numberOrZero(
    state.platformPlan?.months?.[monthKey]?.platforms?.[platform]?.units
    || state.platformPlan?.months?.[monthKey]?.platforms?.[skuPlanFactPlatformSupportKey(platform)]?.units
  );
}

function skuPlanFactAdIndex(monthKey, maxFactDate = '') {
  const map = new Map();
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    const date = String(item?.date || '').slice(0, 10);
    if (skuPlanFactMonthFromDate(date) !== monthKey) return;
    if (maxFactDate && date > maxFactDate) return;
    const platform = String(item.platformKey || item.platform || 'wb').toLowerCase();
    const token = skuPlanFactArticleToken(item);
    if (!token) return;
    const key = `${platform}|${token}`;
    const row = map.get(key) || { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
    row.spend += numberOrZero(item.spend);
    row.views += numberOrZero(item.views);
    row.clicks += numberOrZero(item.clicks);
    row.orders += numberOrZero(item.orders);
    row.revenue += numberOrZero(item.revenue);
    map.set(key, row);
  });
  return map;
}

function skuPlanFactPlatformPriceProxy(metric = {}) {
  const values = [
    metric.planAvgCheck,
    metric.factAvgCheck,
    metric.currentClientPrice,
    metric.currentPrice,
    metric.currentFillPrice,
    metric.price
  ];
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function skuPlanFactPlatformHasActivity(metric = {}) {
  return Boolean(
    metric?.hasSource
    || Number(metric?.factRevenue) > 0
    || Number(metric?.factUnits) > 0
    || Number(metric?.adSpend) > 0
    || Number(metric?.planRevenue) > 0
    || Number(metric?.planUnits) > 0
    || Number(metric?.currentPrice) > 0
    || Number(metric?.currentClientPrice) > 0
    || Number(metric?.stock) > 0
  );
}

function skuPlanFactPlatformAllocationWeight(metric = {}, platformPriceProxy = 0) {
  if (!skuPlanFactPlatformHasActivity(metric)) return 0;
  const priceProxy = skuPlanFactPlatformPriceProxy(metric) || platformPriceProxy || 0;
  const factRevenue = numberOrZero(metric.factRevenue);
  if (factRevenue > 0) return factRevenue;
  const factUnits = numberOrZero(metric.factUnits);
  if (factUnits > 0 && priceProxy > 0) return factUnits * priceProxy;
  if (priceProxy > 0) return priceProxy;
  return 1;
}

function skuPlanFactFinalizePlatformMetric(metric = {}, monthKey = '', elapsedDays = 0) {
  if (!metric || typeof metric !== 'object') return metric;
  const days = Math.max(1, skuPlanFactMonthDays(monthKey));
  const planAvgCheck = Number(metric.planAvgCheck);
  if (!Number.isFinite(planAvgCheck) || planAvgCheck <= 0) {
    const proxy = skuPlanFactPlatformPriceProxy(metric) || numberOrZero(metric.factAvgCheck);
    metric.planAvgCheck = proxy > 0 ? proxy : null;
  } else {
    metric.planAvgCheck = planAvgCheck;
  }
  metric.planUnits = numberOrZero(metric.planUnits);
  metric.planRevenue = numberOrZero(metric.planRevenue);
  if (metric.planUnits > 0 && metric.planRevenue <= 0 && Number.isFinite(Number(metric.planAvgCheck)) && Number(metric.planAvgCheck) > 0) {
    metric.planRevenue = metric.planUnits * Number(metric.planAvgCheck);
  }
  metric.planToDateUnits = metric.planUnits > 0 ? metric.planUnits * elapsedDays / days : 0;
  metric.planToDateRevenue = metric.planRevenue > 0 ? metric.planRevenue * elapsedDays / days : 0;
  metric.completionToDate = metric.planToDateRevenue > 0 ? metric.factRevenue / metric.planToDateRevenue : null;
  metric.completionMonth = metric.planRevenue > 0 ? metric.factRevenue / metric.planRevenue : null;
  metric.gapToDate = metric.factRevenue - metric.planToDateRevenue;
  metric.drr = metric.factRevenue > 0 ? metric.adSpend / metric.factRevenue : null;
  metric.adsDrr = metric.adRevenue > 0 ? metric.adSpend / metric.adRevenue : null;
  return metric;
}

function skuPlanFactAllocatePlatformPlan(rows = [], monthKey = '', platform = '', elapsedDays = 0) {
  if (SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS.has(platform)) return;
  const totalUnits = skuPlanFactPlatformPlanUnits(monthKey, platform);
  if (!Number.isFinite(totalUnits) || totalUnits <= 0) return;

  const candidates = (rows || [])
    .map((row) => row?.platforms?.[platform] || row?.[platform] || null)
    .filter((metric) => skuPlanFactPlatformHasActivity(metric));
  if (!candidates.length) return;

  const priceProxies = candidates
    .map((metric) => skuPlanFactPlatformPriceProxy(metric))
    .filter((value) => Number.isFinite(value) && value > 0);
  const platformPriceProxy = priceProxies.length
    ? priceProxies.reduce((sum, value) => sum + value, 0) / priceProxies.length
    : 0;
  const roundedTotalUnits = Math.max(0, Math.round(totalUnits));
  const items = candidates.map((metric) => {
    const priceProxy = skuPlanFactPlatformPriceProxy(metric) || platformPriceProxy || 0;
    const weight = skuPlanFactPlatformAllocationWeight(metric, platformPriceProxy);
    return { metric, priceProxy, weight };
  });
  const weightSum = items.reduce((sum, item) => sum + (Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 0), 0);
  const fallbackWeight = weightSum > 0 ? 0 : 1;
  const distributable = items.map((item, index) => {
    const weight = fallbackWeight ? 1 : item.weight;
    const rawUnits = weightSum > 0
      ? roundedTotalUnits * (weight > 0 ? weight : 0) / weightSum
      : roundedTotalUnits / Math.max(1, items.length);
    const floorUnits = Math.floor(rawUnits);
    return {
      ...item,
      index,
      rawUnits,
      floorUnits,
      fraction: rawUnits - floorUnits,
      units: floorUnits
    };
  });
  let assignedUnits = distributable.reduce((sum, item) => sum + item.units, 0);
  let remainder = Math.max(0, roundedTotalUnits - assignedUnits);
  distributable
    .sort((left, right) => right.fraction - left.fraction || right.weight - left.weight || left.index - right.index)
    .slice(0, remainder)
    .forEach((item) => { item.units += 1; });

  distributable.forEach((item) => {
    const metric = item.metric;
    const fallbackPrice = platformPriceProxy || numberOrZero(metric.factAvgCheck) || 0;
    const priceProxy = item.priceProxy || fallbackPrice;
    metric.planUnits = item.units;
    metric.planAvgCheck = priceProxy > 0 ? priceProxy : null;
    metric.planRevenue = metric.planUnits > 0 && priceProxy > 0 ? metric.planUnits * priceProxy : 0;
    metric.hasDirectPlan = false;
    skuPlanFactFinalizePlatformMetric(metric, monthKey, elapsedDays);
  });
}

function skuPlanFactPlatformMetrics(sku, platform, monthKey, indexes, adIndex, elapsedDays, maxFactDate = '') {
  const token = skuPlanFactArticleToken(sku);
  const smartRows = skuPlanFactRowsFromIndexMap(indexes.smart?.[platform]).filter((row) => skuPlanFactArticleToken(row) === token);
  const overlayRows = skuPlanFactRowsFromIndexMap(indexes.overlay?.[platform]).filter((row) => skuPlanFactArticleToken(row) === token);
  const supportRows = skuPlanFactRowsFromIndexMap(indexes.support?.[platform]).filter((row) => skuPlanFactArticleToken(row) === token);
  const pricesRows = skuPlanFactRowsFromIndexMap(indexes.prices?.[platform]).filter((row) => skuPlanFactArticleToken(row) === token);
  const extraRows = skuPlanFactRowsFromIndexMap(indexes.extra?.[platform]).filter((row) => skuPlanFactArticleToken(row) === token);
  const sourceRows = skuPlanFactPlatformSourceRows(indexes, platform).filter((row) => skuPlanFactArticleToken(row) === token);
  const planRows = skuPlanFactPlatformPlanRows(indexes, platform, monthKey).filter((row) => skuPlanFactArticleToken(row) === token);
  const factRows = sourceRows.length ? sourceRows : (overlayRows.length ? overlayRows : (smartRows.length ? smartRows : (pricesRows.length ? pricesRows : extraRows)));
  const plan = SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS.has(platform)
    ? skuPlanFactPlanFromRows(planRows, monthKey)
    : { units: 0, revenue: 0, avgCheck: null, days: skuPlanFactMonthDays(monthKey), source: '' };
  const fact = skuPlanFactFactFromRows(factRows, monthKey, maxFactDate);
  const ad = adIndex.get(`${platform}|${token}`) || { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
  const planToDateRevenue = plan.revenue > 0 ? plan.revenue * elapsedDays / Math.max(1, plan.days) : 0;
  const planToDateUnits = plan.units > 0 ? plan.units * elapsedDays / Math.max(1, plan.days) : 0;
  const fallbackSide = sku?.[platform] || {};
  const turnoverDays = skuPlanFactLatestMetric(sourceRows, ['turnoverCurrentDays', 'turnoverDays'])
    ?? (Number.isFinite(Number(fallbackSide.turnoverDays)) ? Number(fallbackSide.turnoverDays) : null);
  const stock = skuPlanFactLatestMetric(sourceRows, ['stock', 'stockRepricer'])
    ?? (Number.isFinite(Number(fallbackSide.stock)) ? Number(fallbackSide.stock) : null);
  const marginPct = skuPlanFactLatestMetric(sourceRows, ['avgMargin7dPct', 'marginTotalPct', 'marginPct'])
    ?? (Number.isFinite(Number(fallbackSide.marginPct)) ? Number(fallbackSide.marginPct) : null);
  const currentPrice = skuPlanFactLatestMetric(sourceRows, ['currentFillPrice', 'currentPrice', 'currentClientPrice', 'price'])
    ?? (Number.isFinite(Number(fallbackSide.currentPrice)) ? Number(fallbackSide.currentPrice) : null);
  const currentClientPrice = skuPlanFactLatestMetric(sourceRows, ['currentClientPrice', 'currentPrice', 'price'])
    ?? (Number.isFinite(Number(fallbackSide.currentClientPrice)) ? Number(fallbackSide.currentClientPrice) : currentPrice);
  const priceProxy = plan.avgCheck
    || currentClientPrice
    || currentPrice
    || (fact.avgCheck > 0 ? fact.avgCheck : null);

  return {
    platform,
    label: skuPlanFactPlatformLabel(platform),
    planUnits: plan.units,
    planRevenue: plan.revenue,
    planAvgCheck: plan.avgCheck || priceProxy || null,
    planToDateUnits,
    planToDateRevenue,
    factUnits: fact.units,
    factRevenue: fact.revenue,
    factAvgCheck: fact.avgCheck,
    completionToDate: planToDateRevenue > 0 ? fact.revenue / planToDateRevenue : null,
    completionMonth: plan.revenue > 0 ? fact.revenue / plan.revenue : null,
    gapToDate: fact.revenue - planToDateRevenue,
    adSpend: ad.spend,
    adViews: ad.views,
    adClicks: ad.clicks,
    adOrders: ad.orders,
    adRevenue: ad.revenue,
    drr: fact.revenue > 0 ? ad.spend / fact.revenue : null,
    adsDrr: ad.revenue > 0 ? ad.spend / ad.revenue : null,
    turnoverDays,
    stock,
    marginPct,
    currentPrice,
    currentClientPrice,
    currentFillPrice: currentPrice,
    hasSource: Boolean(sourceRows.length || factRows.length || planRows.length || Number(currentPrice) > 0 || Number(currentClientPrice) > 0 || Number(stock) > 0 || Number(ad.spend) > 0),
    planPriceProxy: priceProxy,
    hasDirectPlan: Boolean(SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS.has(platform) && (plan.units > 0 || plan.revenue > 0)),
    source: fact.source || plan.source || ''
  };
}

function skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays, maxFactDate = '') {
  const platforms = {};
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    platforms[platform] = skuPlanFactFinalizePlatformMetric(
      skuPlanFactPlatformMetrics(sku, platform, monthKey, indexes, adIndex, elapsedDays, maxFactDate),
      monthKey,
      elapsedDays
    );
  });
  const row = {
    sku,
    articleKey: skuPrimaryKey(sku),
    article: sku.article || sku.articleKey || '',
    name: sku.name || '',
    owner: ownerName(sku) || 'Без owner',
    status: skuOperationalStatusMeta(sku).label,
    platforms
  };
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    row[platform] = platforms[platform];
  });
  return skuPlanFactFinalizeRow(row, monthKey, elapsedDays);
}

function skuPlanFactFinalizeRow(row = {}, monthKey = '', elapsedDays = 0) {
  const platforms = SKU_PLAN_FACT_PLATFORMS.map((platform) => row.platforms?.[platform] || row[platform]).filter(Boolean);
  platforms.forEach((metric) => skuPlanFactFinalizePlatformMetric(metric, monthKey, elapsedDays));
  const totals = platforms.reduce((acc, metric) => {
    acc.planUnits += numberOrZero(metric.planUnits);
    acc.planRevenue += numberOrZero(metric.planRevenue);
    acc.planToDateRevenue += numberOrZero(metric.planToDateRevenue);
    acc.factUnits += numberOrZero(metric.factUnits);
    acc.factRevenue += numberOrZero(metric.factRevenue);
    acc.adSpend += numberOrZero(metric.adSpend);
    acc.hasPlanOrFact = acc.hasPlanOrFact || Boolean(
      metric?.hasSource
      || numberOrZero(metric.planUnits) > 0
      || numberOrZero(metric.planRevenue) > 0
      || numberOrZero(metric.factUnits) > 0
      || numberOrZero(metric.factRevenue) > 0
      || numberOrZero(metric.adSpend) > 0
    );
    return acc;
  }, { planUnits: 0, planRevenue: 0, planToDateRevenue: 0, factUnits: 0, factRevenue: 0, adSpend: 0, hasPlanOrFact: false });
  row.planUnits = totals.planUnits;
  row.planRevenue = totals.planRevenue;
  row.planToDateRevenue = totals.planToDateRevenue;
  row.factUnits = totals.factUnits;
  row.factRevenue = totals.factRevenue;
  row.avgCheck = row.factUnits > 0 ? row.factRevenue / row.factUnits : null;
  row.completionToDate = row.planToDateRevenue > 0 ? row.factRevenue / row.planToDateRevenue : null;
  row.completionMonth = row.planRevenue > 0 ? row.factRevenue / row.planRevenue : null;
  row.gapToDate = row.factRevenue - row.planToDateRevenue;
  row.adSpend = totals.adSpend;
  row.drr = row.factRevenue > 0 ? row.adSpend / row.factRevenue : null;
  row.hasPlanOrFact = totals.hasPlanOrFact;
  return row;
}

function skuPlanFactDefaultSortDir(sort = '') {
  const numericSorts = new Set(['fact', 'plan', 'drr', 'avgCheck', 'turnover', 'ad', ...SKU_PLAN_FACT_PLATFORMS]);
  return numericSorts.has(sort) ? 'desc' : 'asc';
}

function skuPlanFactSortValue(row, sort = '') {
  if (sort === 'article') return row.article || row.articleKey || '';
  if (sort === 'owner') return row.owner || '';
  if (sort === 'completion') return row.completionToDate;
  if (sort === 'fact') return row.factRevenue;
  if (sort === 'plan') return row.planRevenue;
  if (sort === 'drr') return row.drr;
  if (SKU_PLAN_FACT_PLATFORMS.includes(sort)) return row.platforms?.[sort]?.factRevenue ?? row[sort]?.factRevenue;
  if (sort === 'avgCheck') return row.factUnits > 0 ? row.factRevenue / row.factUnits : null;
  if (sort === 'turnover') {
    const values = SKU_PLAN_FACT_PLATFORMS
      .map((platform) => row.platforms?.[platform]?.turnoverDays ?? row[platform]?.turnoverDays)
      .filter((value) => Number.isFinite(Number(value)));
    return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
  }
  if (sort === 'ad') return row.adSpend;
  return row.gapToDate;
}

function skuPlanFactCompareValues(leftValue, rightValue) {
  const leftEmpty = leftValue === null || leftValue === undefined || leftValue === '';
  const rightEmpty = rightValue === null || rightValue === undefined || rightValue === '';
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;

  return String(leftValue).localeCompare(String(rightValue), 'ru', { numeric: true, sensitivity: 'base' });
}

function skuPlanFactSortRows(rows, sort, sortDir) {
  const key = sort || 'gap';
  const direction = sortDir || skuPlanFactDefaultSortDir(key);
  return [...rows].sort((left, right) => {
    const result = skuPlanFactCompareValues(skuPlanFactSortValue(left, key), skuPlanFactSortValue(right, key));
    return direction === 'desc' ? -result : result;
  });
}

function skuPlanFactBuildModel() {
  const filters = skuPlanFactFilters();
  const indexes = skuPlanFactBuildIndexes();
  const months = skuPlanFactAvailableMonths(indexes);
  const dateBounds = skuPlanFactDateBounds(indexes, months);
  const monthKey = skuPlanFactSelectedMonth(months);
  const maxAvailableDate = skuPlanFactMaxFactDate(indexes, monthKey);
  const selectedDate = skuPlanFactSelectedDate(indexes, monthKey, maxAvailableDate);
  const elapsedDays = skuPlanFactElapsedDays(monthKey, selectedDate);
  const adIndex = skuPlanFactAdIndex(monthKey, selectedDate);
  const rows = (state.skus || []).map((sku) => skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays, selectedDate));
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => skuPlanFactAllocatePlatformPlan(rows, monthKey, platform, elapsedDays));
  rows.forEach((row) => skuPlanFactFinalizeRow(row, monthKey, elapsedDays));
  const owners = [...new Set(rows.map((row) => row.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const search = String(filters.search || '').trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
    if (filters.status === 'active' && String(row.status || '').toLowerCase().includes('вывод')) return false;
    if (filters.status === 'with_plan' && row.planRevenue <= 0) return false;
    if (filters.status === 'under_plan' && !(row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue)) return false;
    if (filters.status === 'no_fact' && !(row.planRevenue > 0 && row.factRevenue <= 0)) return false;
    if (filters.platform !== 'all' && !skuPlanFactPlatformHasActivity(row.platforms?.[filters.platform] || row[filters.platform])) return false;
    if (!search) return true;
    return [row.articleKey, row.article, row.name, row.owner, row.status]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search);
  });
  const sortedRows = skuPlanFactSortRows(filteredRows, filters.sort, filters.sortDir);
  const totals = sortedRows.reduce((acc, row) => {
    acc.planRevenue += row.planRevenue;
    acc.planToDateRevenue += row.planToDateRevenue;
    acc.factRevenue += row.factRevenue;
    acc.planUnits += row.planUnits;
    acc.factUnits += row.factUnits;
    acc.adSpend += row.adSpend;
    if (row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue) acc.underPlan += 1;
    if (row.planRevenue > 0 && row.factRevenue <= 0) acc.noFact += 1;
    return acc;
  }, { planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, planUnits: 0, factUnits: 0, adSpend: 0, underPlan: 0, noFact: 0 });
  totals.completionToDate = totals.planToDateRevenue > 0 ? totals.factRevenue / totals.planToDateRevenue : null;
  totals.completionMonth = totals.planRevenue > 0 ? totals.factRevenue / totals.planRevenue : null;
  totals.gapToDate = totals.factRevenue - totals.planToDateRevenue;
  totals.avgCheck = totals.factUnits > 0 ? totals.factRevenue / totals.factUnits : null;
  totals.drr = totals.factRevenue > 0 ? totals.adSpend / totals.factRevenue : null;
  return {
    filters,
    months,
    monthKey,
    monthLabel: skuPlanFactMonthLabel(monthKey),
    maxFactDate: selectedDate,
    selectedDate,
    maxAvailableDate,
    dateMin: dateBounds.min,
    dateMax: dateBounds.max,
    elapsedDays,
    rows: sortedRows,
    allRows: rows,
    owners,
    platforms: SKU_PLAN_FACT_PLATFORMS,
    platformLabels: SKU_PLAN_FACT_PLATFORM_LABELS,
    planDrrByPlatform: {
      wb: Number.isFinite(Number(state.iuDrrSummary?.planPctDefault)) ? Number(state.iuDrrSummary.planPctDefault) : 0.08,
      ozon: Number.isFinite(Number(state.iuDrrSummary?.ozonPlanPctDefault)) ? Number(state.iuDrrSummary.ozonPlanPctDefault) : 0.25,
      ya: null,
      goldapple: null,
      letu: null,
      magnit: null
    },
    totals,
    planDrrWb: Number.isFinite(Number(state.iuDrrSummary?.planPctDefault)) ? Number(state.iuDrrSummary.planPctDefault) : 0.08,
    planDrrOzon: Number.isFinite(Number(state.iuDrrSummary?.ozonPlanPctDefault)) ? Number(state.iuDrrSummary.ozonPlanPctDefault) : 0.25
  };
}

function skuPlanFactTone(value) {
  if (value === null || value === undefined) return '';
  if (value >= 1) return 'ok';
  if (value >= 0.9) return 'warn';
  return 'danger';
}

function skuPlanFactDeltaClass(value) {
  if (value > 0) return 'ok-text';
  if (value < 0) return 'danger-text';
  return '';
}

function skuPlanFactMetricHtml(label, value, hint = '', tone = '') {
  return `
    <div class="card kpi">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value ${tone}">${value}</div>
      <div class="hint">${escapeHtml(hint)}</div>
    </div>
  `;
}

function skuPlanFactPlatformCell(metric, planDrr = null) {
  if (!metric) return '<div class="muted small">—</div>';
  const drrTone = metric.drr !== null && planDrr !== null && metric.drr > planDrr ? 'danger-text' : '';
  return `
    <div><strong>${fmt.money(metric.factRevenue)}</strong> <span class="muted small">/ ${fmt.money(metric.planToDateRevenue)}</span></div>
    <div class="muted small">${fmt.int(metric.factUnits)} шт. / план ${fmt.int(metric.planToDateUnits)} шт.</div>
    <div class="badge-stack" style="margin-top:6px">
      ${badge(fmt.pct(metric.completionToDate), skuPlanFactTone(metric.completionToDate))}
      ${metric.drr !== null ? `<span class="chip ${drrTone ? 'danger' : ''}">ДРР ${fmt.pct(metric.drr)}</span>` : ''}
    </div>
  `;
}

function skuPlanFactPlatformAvgCheckLines(row = {}) {
  return SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const metric = row?.platforms?.[platform] || row?.[platform] || null;
    const label = skuPlanFactPlatformLabel(platform);
    return `
      <div>${escapeHtml(label)}: <strong>${fmt.money(metric?.factAvgCheck)}</strong> <span class="muted small">план ${fmt.money(metric?.planAvgCheck)}</span></div>
    `;
  }).join('');
}

function skuPlanFactRowHtml(row, model) {
  const totalTone = skuPlanFactTone(row.completionToDate);
  const planDrrByPlatform = model.planDrrByPlatform || {};
  return `
    <tr class="sku-plan-fact-row" data-open-sku="${escapeHtml(row.articleKey)}">
      <td>${linkToSku(row.articleKey, row.article || row.articleKey)}<div class="muted small">${escapeHtml(row.name)}</div></td>
      <td><strong>${escapeHtml(row.owner)}</strong><div class="muted small">${escapeHtml(row.status)}</div></td>
      ${SKU_PLAN_FACT_PLATFORMS.map((platform) => `<td>${skuPlanFactPlatformCell(row.platforms?.[platform] || row[platform], planDrrByPlatform[platform] ?? null)}</td>`).join('')}
      <td>
        <strong>${fmt.money(row.factRevenue)}</strong>
        <div class="muted small">план к дате ${fmt.money(row.planToDateRevenue)}</div>
        <div class="badge-stack" style="margin-top:6px">${badge(fmt.pct(row.completionToDate), totalTone)}<span class="chip ${row.gapToDate < 0 ? 'danger' : 'ok'}">${fmt.money(row.gapToDate)}</span></div>
      </td>
      <td>${skuPlanFactPlatformAvgCheckLines(row)}</td>
      <td>
        ${SKU_PLAN_FACT_PLATFORMS.map((platform) => {
          const metric = row.platforms?.[platform] || row[platform] || null;
          const label = skuPlanFactPlatformLabel(platform);
          return `<div>${escapeHtml(label)}: <strong>${fmt.num(metric?.turnoverDays, 1)}</strong> дн. <span class="muted small">${fmt.int(metric?.stock)} шт.</span></div>`;
        }).join('')}
      </td>
      <td>
        <strong>${fmt.money(row.adSpend)}</strong>
        <div class="muted small">${SKU_PLAN_FACT_PLATFORMS.map((platform) => {
          const metric = row.platforms?.[platform] || row[platform] || null;
          return `${escapeHtml(skuPlanFactPlatformLabel(platform))} ${fmt.money(metric?.adSpend)}`;
        }).join(' · ')}</div>
        <div class="${row.drr !== null && row.drr > model.planDrrWb ? 'danger-text' : ''}">ДРР total ${fmt.pct(row.drr)}</div>
      </td>
    </tr>
  `;
}

function skuPlanFactExportColumns() {
  const columns = [
    ['month', 'Месяц'],
    ['fact_to', 'Факт по дату'],
    ['article_key', 'Article key'],
    ['article', 'Артикул'],
    ['name', 'Товар'],
    ['owner', 'Owner'],
    ['status', 'Статус']
  ];
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const label = skuPlanFactPlatformLabel(platform);
    const suffix = platform;
    columns.push(
      [`plan_${suffix}_revenue`, `План ${label}, ₽`],
      [`plan_${suffix}_to_date_revenue`, `План ${label} к дате, ₽`],
      [`fact_${suffix}_revenue`, `Факт ${label}, ₽`],
      [`plan_${suffix}_units`, `План ${label}, шт`],
      [`fact_${suffix}_units`, `Факт ${label}, шт`],
      [`completion_${suffix}_to_date_pct`, `Выполнение ${label} к дате, %`],
      [`avg_check_${suffix}_fact`, `Средний чек ${label} факт`],
      [`avg_check_${suffix}_plan`, `Средний чек ${label} план`],
      [`drr_${suffix}`, `ДРР ${label}`],
      [`ad_spend_${suffix}`, `Реклама ${label}, ₽`],
      [`turnover_${suffix}_days`, `Оборачиваемость ${label}, дн`],
      [`stock_${suffix}`, `Остаток ${label}`]
    );
  });
  columns.push(
    ['plan_total_revenue', 'План всего, ₽'],
    ['plan_total_to_date_revenue', 'План всего к дате, ₽'],
    ['fact_total_revenue', 'Факт всего, ₽'],
    ['completion_total_to_date_pct', 'Выполнение всего к дате, %'],
    ['gap_total_to_date', 'Отклонение к дате, ₽'],
    ['drr_total', 'ДРР total']
  );
  return columns;
}

function skuPlanFactExportRows(rows, model) {
  return rows.map((row) => {
    const payload = {
      month: model.monthKey,
      fact_to: model.maxFactDate,
      article_key: row.articleKey,
      article: row.article,
      name: row.name,
      owner: row.owner,
      status: row.status
    };
    SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
      const metric = row.platforms?.[platform] || row[platform] || {};
      const suffix = platform;
      payload[`plan_${suffix}_revenue`] = Math.round(metric.planRevenue || 0);
      payload[`plan_${suffix}_to_date_revenue`] = Math.round(metric.planToDateRevenue || 0);
      payload[`fact_${suffix}_revenue`] = Math.round(metric.factRevenue || 0);
      payload[`plan_${suffix}_units`] = Math.round(metric.planUnits || 0);
      payload[`fact_${suffix}_units`] = Math.round(metric.factUnits || 0);
      payload[`completion_${suffix}_to_date_pct`] = metric.completionToDate === null ? '' : metric.completionToDate;
      payload[`avg_check_${suffix}_fact`] = metric.factAvgCheck === null ? '' : Math.round(metric.factAvgCheck);
      payload[`avg_check_${suffix}_plan`] = metric.planAvgCheck === null ? '' : Math.round(metric.planAvgCheck);
      payload[`drr_${suffix}`] = metric.drr === null ? '' : metric.drr;
      payload[`ad_spend_${suffix}`] = Math.round(metric.adSpend || 0);
      payload[`turnover_${suffix}_days`] = metric.turnoverDays === null ? '' : metric.turnoverDays;
      payload[`stock_${suffix}`] = metric.stock === null ? '' : Math.round(metric.stock);
    });
    payload.plan_total_revenue = Math.round(row.planRevenue || 0);
    payload.plan_total_to_date_revenue = Math.round(row.planToDateRevenue || 0);
    payload.fact_total_revenue = Math.round(row.factRevenue || 0);
    payload.completion_total_to_date_pct = row.completionToDate === null ? '' : row.completionToDate;
    payload.gap_total_to_date = Math.round(row.gapToDate || 0);
    payload.drr_total = row.drr === null ? '' : row.drr;
    return payload;
  });
}

function downloadSkuPlanFactExcel(model) {
  if (!model.rows.length) {
    window.alert('По текущим фильтрам нет строк для выгрузки.');
    return;
  }
  downloadLaunchesHtmlTable(skuPlanFactExportColumns(), skuPlanFactExportRows(model.rows, model), `sku-plan-fact-${model.monthKey}.xls`);
}

function skuPlanFactFocusState(target) {
  if (!target?.id) return null;
  const focusState = { id: target.id };
  if (typeof target.selectionStart === 'number') {
    focusState.start = target.selectionStart;
    focusState.end = target.selectionEnd;
  }
  return focusState;
}

function skuPlanFactRestoreFocus(focusState) {
  if (!focusState?.id) return;
  window.requestAnimationFrame(() => {
    const input = document.getElementById(focusState.id);
    if (!input) return;
    input.focus({ preventScroll: true });
    if (typeof focusState.start === 'number' && typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(focusState.start, focusState.end ?? focusState.start);
    }
  });
}

function skuPlanFactSetFilter(rootId, key, value, options = {}) {
  const filters = skuPlanFactFilters();
  let nextValue = value;
  if (key === 'date') {
    nextValue = skuPlanFactDateKey(value);
    filters.month = nextValue ? nextValue.slice(0, 7) : 'latest';
  }
  if (key === 'sort') {
    filters.sortDir = skuPlanFactDefaultSortDir(nextValue);
  }
  if (filters[key] === nextValue && !options.force) return;
  filters[key] = nextValue;

  const render = () => renderSkuPlanFact(rootId, { focusState: options.focusState || null });
  window.clearTimeout(skuPlanFactSearchTimer);
  if (options.debounce) {
    skuPlanFactSearchTimer = window.setTimeout(render, options.debounce);
  } else {
    render();
  }
}

function skuPlanFactToggleSort(rootId, sortKey) {
  const filters = skuPlanFactFilters();
  if (filters.sort === sortKey) {
    filters.sortDir = filters.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    filters.sort = sortKey;
    filters.sortDir = skuPlanFactDefaultSortDir(sortKey);
  }
  renderSkuPlanFact(rootId);
}

function skuPlanFactSortHeader(key, label) {
  const filters = skuPlanFactFilters();
  const active = filters.sort === key;
  const mark = active ? (filters.sortDir === 'asc' ? '↑' : '↓') : '';
  const ariaSort = active ? (filters.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return `
    <th class="${active ? 'is-sorted' : ''}" aria-sort="${ariaSort}">
      <button class="table-sort-btn" type="button" data-sku-plan-fact-sort="${escapeHtml(key)}">
        <span>${escapeHtml(label)}</span><span class="sort-mark">${mark}</span>
      </button>
    </th>
  `;
}

async function refreshSkuPlanFactData(button = null, rootId = 'view-sku-plan-fact') {
  const originalText = button?.textContent || '';
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Обновляем...';
    }
    if (typeof window.__alteaResetPortalSnapshotState === 'function') window.__alteaResetPortalSnapshotState();
    if (state.boot?.lazyReady) state.boot.lazyReady.skuPlanFact = false;
    if (state.boot?.lazyLoads) delete state.boot.lazyLoads.skuPlanFact;
    if (typeof ensureViewData === 'function') await ensureViewData('sku-plan-fact');
    else if (LAZY_DATA_LOADERS?.skuPlanFact) await LAZY_DATA_LOADERS.skuPlanFact();
    renderSkuPlanFact(rootId);
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  } catch (error) {
    console.warn('[sku-plan-fact-refresh]', error);
    if (typeof setAppError === 'function') setAppError(`План-факт SKU не смог обновить данные: ${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || 'Обновить данные';
    }
  }
}

function renderSkuPlanFact(rootId = 'view-sku-plan-fact', options = {}) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const model = skuPlanFactBuildModel();
  const filters = model.filters;
  const totals = model.totals;
  const ownerOptions = model.owners.map((owner) => `<option value="${escapeHtml(owner)}" ${filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('');
  const platformOptions = SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const label = skuPlanFactPlatformLabel(platform);
    const valueLabel = platform === 'wb' ? 'Только WB'
      : platform === 'ozon' ? 'Только Ozon'
      : `Только ${label}`;
    return `<option value="${escapeHtml(platform)}" ${filters.platform === platform ? 'selected' : ''}>${escapeHtml(valueLabel)}</option>`;
  }).join('');
  const sortOptions = SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const label = skuPlanFactPlatformLabel(platform);
    return `<option value="${escapeHtml(platform)}" ${filters.sort === platform ? 'selected' : ''}>Сортировка: ${escapeHtml(label)} факт</option>`;
  }).join('');
  const dateAttrs = [
    model.dateMin ? `min="${escapeHtml(model.dateMin)}"` : '',
    model.dateMax ? `max="${escapeHtml(model.dateMax)}"` : ''
  ].filter(Boolean).join(' ');
  const tableColspan = 2 + SKU_PLAN_FACT_PLATFORMS.length + 4;
  const rowsHtml = model.rows.length
    ? model.rows.map((row) => skuPlanFactRowHtml(row, model)).join('')
    : `<tr><td colspan="${tableColspan}"><div class="empty">По текущим фильтрам нет SKU.</div></td></tr>`;

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>План-факт SKU</h2>
        <p>Все позиции в одном разрезе: план, факт, средний чек по площадкам, оборачиваемость, реклама и ДРР.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(model.rows.length)} SKU`, 'info')}
        ${badge(`факт до ${model.maxFactDate || '—'}`, 'ok')}
        ${badge(`план ДРР WB/Ozon ${fmt.pct(model.planDrrWb)}`)}
      </div>
    </div>

    <div class="grid cards">
      ${skuPlanFactMetricHtml('Факт оборота', fmt.money(totals.factRevenue), `план к дате ${fmt.money(totals.planToDateRevenue)}`)}
      ${skuPlanFactMetricHtml('Выполнение к дате', fmt.pct(totals.completionToDate), `месячный план: ${fmt.pct(totals.completionMonth)}`, skuPlanFactDeltaClass(totals.completionToDate - 1))}
      ${skuPlanFactMetricHtml('Отклонение к дате', fmt.money(totals.gapToDate), `${fmt.int(totals.underPlan)} SKU ниже плана`, skuPlanFactDeltaClass(totals.gapToDate))}
      ${skuPlanFactMetricHtml('Средний чек', fmt.money(totals.avgCheck), `${fmt.int(totals.factUnits)} шт. факт`)}
      ${skuPlanFactMetricHtml('Реклама / ДРР', `${fmt.money(totals.adSpend)} · ${fmt.pct(totals.drr)}`, 'по SKU из ads_summary')}
    </div>

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Таблица по позициям</h3>
          <p class="small muted">План берём из ценового и площадочного API-слоёв, факт и рекламу - из доступных API площадок.</p>
        </div>
        <div class="badge-stack">
          <button class="quick-chip" type="button" data-sku-plan-fact-refresh>Обновить данные</button>
          <button class="quick-chip" type="button" data-sku-plan-fact-export>Выгрузить в Excel</button>
        </div>
      </div>
      <div class="control-filters sku-plan-fact-filters">
        <input id="skuPlanFactSearch" placeholder="Поиск по SKU, названию, owner…" value="${escapeHtml(filters.search)}">
        <input id="skuPlanFactDate" type="date" title="Дата план-факта" aria-label="Дата план-факта" value="${escapeHtml(model.selectedDate || '')}" ${dateAttrs}>
        <select id="skuPlanFactOwner">
          <option value="all" ${filters.owner === 'all' ? 'selected' : ''}>Все owner</option>
          ${ownerOptions}
        </select>
        <select id="skuPlanFactStatus">
          <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Без вывода</option>
          <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Все SKU</option>
          <option value="with_plan" ${filters.status === 'with_plan' ? 'selected' : ''}>Есть план</option>
          <option value="under_plan" ${filters.status === 'under_plan' ? 'selected' : ''}>Ниже плана</option>
          <option value="no_fact" ${filters.status === 'no_fact' ? 'selected' : ''}>План есть, факта нет</option>
        </select>
        <select id="skuPlanFactPlatform">
          <option value="all" ${filters.platform === 'all' ? 'selected' : ''}>Все площадки</option>
          ${platformOptions}
        </select>
        <select id="skuPlanFactSort">
          <option value="gap" ${filters.sort === 'gap' ? 'selected' : ''}>Сортировка: провал к плану</option>
          <option value="completion" ${filters.sort === 'completion' ? 'selected' : ''}>Сортировка: выполнение</option>
          <option value="fact" ${filters.sort === 'fact' ? 'selected' : ''}>Сортировка: факт оборота</option>
          <option value="plan" ${filters.sort === 'plan' ? 'selected' : ''}>Сортировка: план</option>
          <option value="drr" ${filters.sort === 'drr' ? 'selected' : ''}>Сортировка: ДРР</option>
          ${sortOptions}
          <option value="avgCheck" ${filters.sort === 'avgCheck' ? 'selected' : ''}>Сортировка: средний чек</option>
          <option value="turnover" ${filters.sort === 'turnover' ? 'selected' : ''}>Сортировка: оборачиваемость</option>
          <option value="ad" ${filters.sort === 'ad' ? 'selected' : ''}>Сортировка: реклама</option>
          <option value="article" ${filters.sort === 'article' ? 'selected' : ''}>Сортировка: артикул</option>
          <option value="owner" ${filters.sort === 'owner' ? 'selected' : ''}>Сортировка: owner</option>
        </select>
      </div>
      <div class="table-wrap sku-plan-fact-table">
        <table>
          <thead>
            <tr>
              ${skuPlanFactSortHeader('article', 'SKU')}
              ${skuPlanFactSortHeader('owner', 'Owner')}
              ${SKU_PLAN_FACT_PLATFORMS.map((platform) => skuPlanFactSortHeader(platform, `${skuPlanFactPlatformLabel(platform)} факт / план`)).join('')}
              ${skuPlanFactSortHeader('gap', 'Итого')}
              ${skuPlanFactSortHeader('avgCheck', 'Средний чек')}
              ${skuPlanFactSortHeader('turnover', 'Оборачиваемость')}
              ${skuPlanFactSortHeader('ad', 'Реклама / ДРР')}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="footer-note">Клик по строке открывает карточку SKU для смены owner и рабочих комментариев.</div>
    </div>
  `;

  root.querySelector('#skuPlanFactSearch')?.addEventListener('input', (event) => {
    skuPlanFactSetFilter(rootId, 'search', event.target.value, { debounce: 140, focusState: skuPlanFactFocusState(event.target) });
  });
  root.querySelector('#skuPlanFactDate')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'date', event.target.value); });
  root.querySelector('#skuPlanFactOwner')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'owner', event.target.value); });
  root.querySelector('#skuPlanFactStatus')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'status', event.target.value); });
  root.querySelector('#skuPlanFactPlatform')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'platform', event.target.value); });
  root.querySelector('#skuPlanFactSort')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'sort', event.target.value); });
  root.querySelectorAll('[data-sku-plan-fact-sort]').forEach((button) => {
    button.addEventListener('click', () => skuPlanFactToggleSort(rootId, button.dataset.skuPlanFactSort));
  });
  root.querySelector('[data-sku-plan-fact-refresh]')?.addEventListener('click', (event) => { refreshSkuPlanFactData(event.currentTarget, rootId); });
  root.querySelector('[data-sku-plan-fact-export]')?.addEventListener('click', () => downloadSkuPlanFactExcel(model));
  skuPlanFactRestoreFocus(options.focusState);
}

window.renderSkuPlanFact = renderSkuPlanFact;
window.skuPlanFactBuildModel = skuPlanFactBuildModel;
window.skuPlanFactExportRows = skuPlanFactExportRows;
window.skuPlanFactExportColumns = skuPlanFactExportColumns;
window.SKU_PLAN_FACT_PLATFORMS = SKU_PLAN_FACT_PLATFORMS;
window.SKU_PLAN_FACT_PLATFORM_LABELS = SKU_PLAN_FACT_PLATFORM_LABELS;
window.SKU_PLAN_FACT_PLATFORM_SUPPORT_KEYS = SKU_PLAN_FACT_PLATFORM_SUPPORT_KEYS;
