const SKU_PLAN_FACT_PLATFORMS = ['wb', 'ozon', 'ya', 'magnit', 'letu', 'goldapple'];
const SKU_PLAN_FACT_PLATFORM_LABELS = {
  wb: 'WB',
  ozon: 'Ozon',
  ya: 'ЯМ',
  magnit: 'Магнит',
  letu: 'Летуаль',
  goldapple: 'ЗЯ'
};
const SKU_PLAN_FACT_PLATFORM_ALIASES = {
  ya: ['ya', 'ym'],
  magnit: ['magnit', 'mm'],
  letu: ['letu'],
  goldapple: ['goldapple', 'ga']
};
window.SKU_PLAN_FACT_PLATFORMS = SKU_PLAN_FACT_PLATFORMS;
window.SKU_PLAN_FACT_PLATFORM_LABELS = SKU_PLAN_FACT_PLATFORM_LABELS;
let skuPlanFactSearchTimer = 0;

function skuPlanFactCanonicalPlatform(platform = '') {
  const raw = String(platform || '').trim().toLowerCase();
  if (raw === 'ym' || raw === 'yam' || raw === 'yandex' || raw === 'yandex_market') return 'ya';
  if (raw === 'mm' || raw === 'magnit_market' || raw === 'magnitmarket') return 'magnit';
  if (raw === 'ga' || raw === 'zya' || raw === 'goldapple' || raw === 'goldenapple') return 'goldapple';
  if (raw === 'letual') return 'letu';
  return raw;
}

function skuPlanFactPlatformAliases(platform = '') {
  const key = skuPlanFactCanonicalPlatform(platform);
  return SKU_PLAN_FACT_PLATFORM_ALIASES[key] || [key];
}

function skuPlanFactOwnerKey(platform = '') {
  const key = skuPlanFactCanonicalPlatform(platform);
  return ({ ya: 'ym', magnit: 'mm', goldapple: 'ga' })[key] || key;
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
  const result = [];
  const seen = new Set();
  skuPlanFactPlatformAliases(platform).forEach((platformKey) => {
    const rawRows = payload?.platforms?.[platformKey]?.rows;
    const rows = Array.isArray(rawRows)
      ? rawRows
      : rawRows && typeof rawRows === 'object'
        ? Object.entries(rawRows).map(([key, row]) => ({
          articleKey: row?.articleKey || key,
          article: row?.article || key,
          ...(row || {})
        }))
        : [];
    rows.forEach((row) => {
      const token = `${skuPlanFactCanonicalPlatform(platform)}|${skuPlanFactArticleToken(row) || row.articleKey || row.article}`;
      if (seen.has(token)) return;
      seen.add(token);
      result.push({
        ...row,
        platformKey: skuPlanFactCanonicalPlatform(platform),
        platformLabel: SKU_PLAN_FACT_PLATFORM_LABELS[skuPlanFactCanonicalPlatform(platform)] || platform
      });
    });
  });
  return result;
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

function skuPlanFactBuildIndexes() {
  const smart = {};
  const overlay = {};
  const support = {};
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    smart[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.smartPriceWorkbench || {}, platform));
    overlay[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.smartPriceOverlay || {}, platform));
    support[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.priceWorkbenchSupport || {}, platform));
  });
  return { smart, overlay, support };
}

function skuPlanFactAvailableMonths(indexes) {
  const months = new Set();
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    [indexes.smart?.[platform], indexes.overlay?.[platform], indexes.support?.[platform]].forEach((map) => {
      (map ? [...map.values()].flat() : []).forEach((row) => {
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
  (state.iuDrrSummary?.daily || []).forEach((item) => {
    const monthKey = skuPlanFactMonthFromDate(item?.date);
    if (monthKey) months.add(monthKey);
  });
  return [...months].filter(Boolean).sort().reverse();
}

function skuPlanFactLatestMonth(months = []) {
  const sourceMonth = skuPlanFactMonthFromDate(
    state.smartPriceOverlay?.asOfDate
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
    [indexes.overlay?.[platform], indexes.smart?.[platform]].forEach((map) => {
      (map ? [...map.values()].flat() : []).forEach((row) => {
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

function skuPlanFactPlatformMetrics(sku, platform, monthKey, indexes, adIndex, elapsedDays, maxFactDate = '') {
  const token = skuPlanFactArticleToken(sku);
  const smartRows = indexes.smart?.[platform]?.get(token) || [];
  const overlayRows = indexes.overlay?.[platform]?.get(token) || [];
  const supportRows = indexes.support?.[platform]?.get(token) || [];
  const sourceRows = overlayRows.length ? overlayRows : smartRows;
  const planRows = skuPlanFactRowsHavePlan(supportRows, monthKey) ? supportRows : smartRows;
  const factRows = skuPlanFactRowsHaveFact(overlayRows, monthKey)
    ? overlayRows
    : (skuPlanFactRowsHaveFact(smartRows, monthKey) ? smartRows : supportRows);
  const plan = skuPlanFactPlanFromRows(planRows, monthKey);
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

  return {
    platform,
    planUnits: plan.units,
    planRevenue: plan.revenue,
    planAvgCheck: plan.avgCheck,
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
    source: fact.source || plan.source || ''
  };
}

function skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays, maxFactDate = '') {
  const platforms = {};
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    platforms[platform] = skuPlanFactPlatformMetrics(sku, platform, monthKey, indexes, adIndex, elapsedDays, maxFactDate);
  });
  const platformMetrics = Object.values(platforms);
  const wb = platforms.wb || skuPlanFactPlatformMetrics(sku, 'wb', monthKey, indexes, adIndex, elapsedDays, maxFactDate);
  const ozon = platforms.ozon || skuPlanFactPlatformMetrics(sku, 'ozon', monthKey, indexes, adIndex, elapsedDays, maxFactDate);
  const planRevenue = platformMetrics.reduce((sum, item) => sum + item.planRevenue, 0);
  const planUnits = platformMetrics.reduce((sum, item) => sum + item.planUnits, 0);
  const planToDateRevenue = platformMetrics.reduce((sum, item) => sum + item.planToDateRevenue, 0);
  const factRevenue = platformMetrics.reduce((sum, item) => sum + item.factRevenue, 0);
  const factUnits = platformMetrics.reduce((sum, item) => sum + item.factUnits, 0);
  const adSpend = platformMetrics.reduce((sum, item) => sum + item.adSpend, 0);
  return {
    sku,
    articleKey: skuPrimaryKey(sku),
    article: sku.article || sku.articleKey || '',
    name: sku.name || '',
    owner: ownerName(sku) || 'Без owner',
    status: skuOperationalStatusMeta(sku).label,
    platforms,
    wb,
    ozon,
    planUnits,
    planRevenue,
    planToDateRevenue,
    factUnits,
    factRevenue,
    avgCheck: factUnits > 0 ? factRevenue / factUnits : null,
    completionToDate: planToDateRevenue > 0 ? factRevenue / planToDateRevenue : null,
    completionMonth: planRevenue > 0 ? factRevenue / planRevenue : null,
    gapToDate: factRevenue - planToDateRevenue,
    adSpend,
    drr: factRevenue > 0 ? adSpend / factRevenue : null,
    hasPlanOrFact: planRevenue > 0 || factRevenue > 0 || platformMetrics.some((item) => item.adSpend > 0)
  };
}

function skuPlanFactSyntheticSkus(indexes) {
  const existing = new Set((state.skus || []).map((sku) => skuPlanFactArticleToken(sku)).filter(Boolean));
  const synthetic = [];
  const seen = new Set(existing);
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    [indexes.overlay?.[platform], indexes.smart?.[platform], indexes.support?.[platform]].forEach((map) => {
      (map ? [...map.values()].flat() : []).forEach((row) => {
        const token = skuPlanFactArticleToken(row);
        if (!token || token === '0' || seen.has(token)) return;
        seen.add(token);
        const article = row.articleKey || row.article || row.sku || token;
        const owner = row.owner || row.ownerName || row.responsible || '';
        const ownerKey = skuPlanFactOwnerKey(platform);
        synthetic.push({
          articleKey: article,
          article,
          name: row.name || row.productName || row.offerName || article,
          owner: { name: owner },
          ownersByPlatform: owner ? { [ownerKey]: owner } : {},
          flags: {},
          syntheticMarketplaceSku: true
        });
      });
    });
  });
  return synthetic;
}

function skuPlanFactDefaultSortDir(sort = '') {
  return ['fact', 'plan', 'drr', 'avgCheck', 'ad', ...SKU_PLAN_FACT_PLATFORMS].includes(sort) ? 'desc' : 'asc';
}

function skuPlanFactSortValue(row, sort = '') {
  if (sort === 'article') return row.article || row.articleKey || '';
  if (sort === 'owner') return row.owner || '';
  if (sort === 'completion') return row.completionToDate;
  if (sort === 'fact') return row.factRevenue;
  if (sort === 'plan') return row.planRevenue;
  if (sort === 'drr') return row.drr;
  if (SKU_PLAN_FACT_PLATFORMS.includes(sort)) return row.platforms?.[sort]?.factRevenue ?? row?.[sort]?.factRevenue;
  if (sort === 'avgCheck') return row.factUnits > 0 ? row.factRevenue / row.factUnits : null;
  if (sort === 'turnover') {
    const values = SKU_PLAN_FACT_PLATFORMS.map((platform) => row.platforms?.[platform]?.turnoverDays).filter((value) => Number.isFinite(Number(value)));
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
  const skuRows = [...(state.skus || []), ...skuPlanFactSyntheticSkus(indexes)];
  const rows = skuRows.map((sku) => skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays, selectedDate));
  const owners = [...new Set(rows.map((row) => row.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const search = String(filters.search || '').trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
    if (filters.status === 'active' && String(row.status || '').toLowerCase().includes('вывод')) return false;
    if (filters.status === 'with_plan' && row.planRevenue <= 0) return false;
    if (filters.status === 'under_plan' && !(row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue)) return false;
    if (filters.status === 'no_fact' && !(row.planRevenue > 0 && row.factRevenue <= 0)) return false;
    if (filters.platform !== 'all') {
      const metric = row.platforms?.[skuPlanFactCanonicalPlatform(filters.platform)];
      if (!(metric?.planRevenue > 0 || metric?.factRevenue > 0 || metric?.adSpend > 0)) return false;
    }
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
    totals,
    planDrrWb: Number.isFinite(Number(state.iuDrrSummary?.planPctDefault)) ? Number(state.iuDrrSummary.planPctDefault) : 0.08,
    planDrrOzon: Number.isFinite(Number(state.iuDrrSummary?.ozonPlanPctDefault)) ? Number(state.iuDrrSummary.ozonPlanPctDefault) : 0.25,
    planDrrByPlatform: {
      wb: Number.isFinite(Number(state.iuDrrSummary?.planPctDefault)) ? Number(state.iuDrrSummary.planPctDefault) : 0.08,
      ozon: Number.isFinite(Number(state.iuDrrSummary?.ozonPlanPctDefault)) ? Number(state.iuDrrSummary.ozonPlanPctDefault) : 0.25
    }
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
  metric = metric || {};
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

function skuPlanFactRowHtml(row, model) {
  const totalTone = skuPlanFactTone(row.completionToDate);
  const platformCells = SKU_PLAN_FACT_PLATFORMS
    .map((platform) => skuPlanFactPlatformCell(row.platforms?.[platform] || row?.[platform] || {}, model.planDrrByPlatform?.[platform] ?? null))
    .map((cell) => `<td>${cell}</td>`)
    .join('');
  return `
    <tr class="sku-plan-fact-row" data-open-sku="${escapeHtml(row.articleKey)}">
      <td>${linkToSku(row.articleKey, row.article || row.articleKey)}<div class="muted small">${escapeHtml(row.name)}</div></td>
      <td><strong>${escapeHtml(row.owner)}</strong><div class="muted small">${escapeHtml(row.status)}</div></td>
      ${platformCells}
      <td>
        <strong>${fmt.money(row.factRevenue)}</strong>
        <div class="muted small">план к дате ${fmt.money(row.planToDateRevenue)}</div>
        <div class="badge-stack" style="margin-top:6px">${badge(fmt.pct(row.completionToDate), totalTone)}<span class="chip ${row.gapToDate < 0 ? 'danger' : 'ok'}">${fmt.money(row.gapToDate)}</span></div>
      </td>
      <td>
        ${SKU_PLAN_FACT_PLATFORMS.map((platform) => {
          const metric = row.platforms?.[platform] || {};
          return `<div>${escapeHtml(SKU_PLAN_FACT_PLATFORM_LABELS[platform] || platform)}: <strong>${fmt.money(metric.factAvgCheck)}</strong> <span class="muted small">план ${fmt.money(metric.planAvgCheck)}</span></div>`;
        }).join('')}
      </td>
      <td>
        ${SKU_PLAN_FACT_PLATFORMS.map((platform) => {
          const metric = row.platforms?.[platform] || {};
          return `<div>${escapeHtml(SKU_PLAN_FACT_PLATFORM_LABELS[platform] || platform)}: <strong>${fmt.num(metric.turnoverDays, 1)}</strong> дн. <span class="muted small">${fmt.int(metric.stock)} шт.</span></div>`;
        }).join('')}
      </td>
      <td>
        <strong>${fmt.money(row.adSpend)}</strong>
        <div class="muted small">${SKU_PLAN_FACT_PLATFORMS.map((platform) => `${escapeHtml(SKU_PLAN_FACT_PLATFORM_LABELS[platform] || platform)} ${fmt.money(row.platforms?.[platform]?.adSpend || 0)}`).join(' · ')}</div>
        <div class="${row.drr !== null && row.drr > model.planDrrWb ? 'danger-text' : ''}">ДРР total ${fmt.pct(row.drr)}</div>
      </td>
    </tr>
  `;
}

function skuPlanFactExportRows(rows, model) {
  return rows.map((row) => {
    const exportRow = {
      month: model.monthKey,
      fact_to: model.maxFactDate,
      article_key: row.articleKey,
      article: row.article,
      name: row.name,
      owner: row.owner,
      status: row.status
    };
    SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
      const metric = row.platforms?.[platform] || row?.[platform] || {};
      exportRow[`plan_${platform}_revenue`] = Math.round(metric.planRevenue || 0);
      exportRow[`plan_${platform}_to_date_revenue`] = Math.round(metric.planToDateRevenue || 0);
      exportRow[`fact_${platform}_revenue`] = Math.round(metric.factRevenue || 0);
      exportRow[`plan_${platform}_units`] = Math.round(metric.planUnits || 0);
      exportRow[`fact_${platform}_units`] = Math.round(metric.factUnits || 0);
      exportRow[`completion_${platform}_to_date_pct`] = metric.completionToDate === null || metric.completionToDate === undefined ? '' : metric.completionToDate;
      exportRow[`avg_check_${platform}_fact`] = metric.factAvgCheck === null || metric.factAvgCheck === undefined ? '' : Math.round(metric.factAvgCheck);
      exportRow[`avg_check_${platform}_plan`] = metric.planAvgCheck === null || metric.planAvgCheck === undefined ? '' : Math.round(metric.planAvgCheck);
      exportRow[`drr_${platform}`] = metric.drr === null || metric.drr === undefined ? '' : metric.drr;
      exportRow[`ad_spend_${platform}`] = Math.round(metric.adSpend || 0);
      exportRow[`turnover_${platform}_days`] = metric.turnoverDays === null || metric.turnoverDays === undefined ? '' : metric.turnoverDays;
      exportRow[`stock_${platform}`] = metric.stock === null || metric.stock === undefined ? '' : Math.round(metric.stock || 0);
    });
    return {
      ...exportRow,
      plan_total_revenue: Math.round(row.planRevenue),
      plan_total_to_date_revenue: Math.round(row.planToDateRevenue),
      fact_total_revenue: Math.round(row.factRevenue),
      completion_total_to_date_pct: row.completionToDate === null ? '' : row.completionToDate,
      gap_total_to_date: Math.round(row.gapToDate),
      drr_total: row.drr === null ? '' : row.drr
    };
  });
}

function downloadSkuPlanFactExcel(model) {
  if (!model.rows.length) {
    window.alert('По текущим фильтрам нет строк для выгрузки.');
    return;
  }
  const platformColumns = SKU_PLAN_FACT_PLATFORMS.flatMap((platform) => {
    const label = SKU_PLAN_FACT_PLATFORM_LABELS[platform] || platform;
    return [
      [`plan_${platform}_revenue`, `План ${label}, ₽`],
      [`plan_${platform}_to_date_revenue`, `План ${label} к дате, ₽`],
      [`fact_${platform}_revenue`, `Факт ${label}, ₽`],
      [`plan_${platform}_units`, `План ${label}, шт`],
      [`fact_${platform}_units`, `Факт ${label}, шт`],
      [`completion_${platform}_to_date_pct`, `Выполнение ${label} к дате, %`],
      [`avg_check_${platform}_fact`, `Средний чек ${label} факт`],
      [`avg_check_${platform}_plan`, `Средний чек ${label} план`],
      [`drr_${platform}`, `ДРР ${label}`],
      [`ad_spend_${platform}`, `Реклама ${label}, ₽`],
      [`turnover_${platform}_days`, `Оборачиваемость ${label}, дн`],
      [`stock_${platform}`, `Остаток ${label}`]
    ];
  });
  downloadLaunchesHtmlTable([
    ['month', 'Месяц'],
    ['fact_to', 'Факт по дату'],
    ['article_key', 'Article key'],
    ['article', 'Артикул'],
    ['name', 'Товар'],
    ['owner', 'Owner'],
    ['status', 'Статус'],
    ...platformColumns,
    ['plan_total_revenue', 'План всего, ₽'],
    ['plan_total_to_date_revenue', 'План всего к дате, ₽'],
    ['fact_total_revenue', 'Факт всего, ₽'],
    ['completion_total_to_date_pct', 'Выполнение всего к дате, %'],
    ['gap_total_to_date', 'Отклонение к дате, ₽'],
    ['drr_total', 'ДРР total']
  ], skuPlanFactExportRows(model.rows, model), `sku-plan-fact-${model.monthKey}.xls`);
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
  const dateAttrs = [
    model.dateMin ? `min="${escapeHtml(model.dateMin)}"` : '',
    model.dateMax ? `max="${escapeHtml(model.dateMax)}"` : ''
  ].filter(Boolean).join(' ');
  const platformColumnCount = SKU_PLAN_FACT_PLATFORMS.length + 6;
  const platformOptionsHtml = [
    `<option value="all" ${filters.platform === 'all' ? 'selected' : ''}>Все площадки</option>`,
    ...SKU_PLAN_FACT_PLATFORMS.map((platform) => `<option value="${platform}" ${filters.platform === platform ? 'selected' : ''}>${escapeHtml(SKU_PLAN_FACT_PLATFORM_LABELS[platform] || platform)}</option>`)
  ].join('');
  const platformSortOptionsHtml = SKU_PLAN_FACT_PLATFORMS
    .map((platform) => `<option value="${platform}" ${filters.sort === platform ? 'selected' : ''}>Сортировка: ${escapeHtml(SKU_PLAN_FACT_PLATFORM_LABELS[platform] || platform)} факт</option>`)
    .join('');
  const platformHeadersHtml = SKU_PLAN_FACT_PLATFORMS
    .map((platform) => skuPlanFactSortHeader(platform, `${SKU_PLAN_FACT_PLATFORM_LABELS[platform] || platform} факт / план`))
    .join('');
  const rowsHtml = model.rows.length
    ? model.rows.map((row) => skuPlanFactRowHtml(row, model)).join('')
    : `<tr><td colspan="${platformColumnCount}"><div class="empty">По текущим фильтрам нет SKU.</div></td></tr>`;

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>План-факт SKU</h2>
        <p>Все позиции в одном разрезе: план, факт, средний чек по подключенным площадкам, оборачиваемость, реклама и ДРР.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(model.rows.length)} SKU`, 'info')}
        ${badge(`факт до ${model.maxFactDate || '—'}`, 'ok')}
        ${badge(`план ДРР WB ${fmt.pct(model.planDrrWb)}`)}
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
          <p class="small muted">План берём из ценового планового слоя, факт из ежедневного marketplace-среза, рекламу из API/таблицы рекламы.</p>
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
          ${platformOptionsHtml}
        </select>
        <select id="skuPlanFactSort">
          <option value="gap" ${filters.sort === 'gap' ? 'selected' : ''}>Сортировка: провал к плану</option>
          <option value="completion" ${filters.sort === 'completion' ? 'selected' : ''}>Сортировка: выполнение</option>
          <option value="fact" ${filters.sort === 'fact' ? 'selected' : ''}>Сортировка: факт оборота</option>
          <option value="plan" ${filters.sort === 'plan' ? 'selected' : ''}>Сортировка: план</option>
          <option value="drr" ${filters.sort === 'drr' ? 'selected' : ''}>Сортировка: ДРР</option>
          ${platformSortOptionsHtml}
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
              ${platformHeadersHtml}
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
