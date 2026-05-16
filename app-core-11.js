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
const SKU_PLAN_FACT_RECONCILE_OVERAGE_THRESHOLD = 1.15;
const SKU_PLAN_FACT_RECONCILE_MIN_REVENUE = 10000;
const SKU_PLAN_FACT_UNMAPPED_OWNER = 'Не в реестре';
const SKU_PLAN_FACT_UNMAPPED_STATUS = 'API SKU без пары';
const SKU_PLAN_FACT_UNALLOCATED_STATUS = 'Агрегат без SKU';
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

function skuPlanFactNormalizePlatform(value = '') {
  const raw = skuPlanFactToken(value);
  if (!raw || raw === 'all' || raw === 'все') return 'all';
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['oz', 'ozon'].includes(raw)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'yandexmarket', 'ямаркет'].includes(raw)) return 'ya';
  if (['ga', 'goldapple', 'зя', 'золотоеяблоко'].includes(raw)) return 'goldapple';
  if (['letu', 'letual', 'летуаль'].includes(raw)) return 'letu';
  if (['mm', 'magnit', 'magnitmarket', 'магнитмаркет'].includes(raw)) return 'magnit';
  return raw;
}

function skuPlanFactIgnoreRows() {
  const payload = state.skuAliasIgnore || {};
  return skuPlanFactIgnorePayloadRows(payload);
}

function skuPlanFactIgnorePayloadRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.ignored)) return payload.ignored;
  if (Array.isArray(payload.ignores)) return payload.ignores;
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function skuPlanFactIgnoreKey(platform = '', apiSku = '') {
  return `${skuPlanFactNormalizePlatform(platform) || 'all'}|${skuPlanFactToken(apiSku)}`;
}

function skuPlanFactIgnoredSet() {
  const set = new Set();
  skuPlanFactIgnoreRows().forEach((row) => {
    const status = skuPlanFactToken(row?.status ?? row?.active ?? 'active');
    if (['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove'].includes(status)) return;
    const apiSku = row?.api_sku ?? row?.apiSku ?? row?.api ?? row?.articleKey ?? row?.article ?? row?.source_sku ?? row?.marketplace_sku ?? '';
    const token = skuPlanFactToken(apiSku);
    if (!token) return;
    const platform = skuPlanFactNormalizePlatform(row?.platform ?? row?.marketplace ?? row?.source_platform ?? 'all') || 'all';
    set.add(skuPlanFactIgnoreKey(platform, token));
  });
  return set;
}

function skuPlanFactIsIgnored(platform = '', apiSku = '', ignored = null) {
  const token = skuPlanFactToken(apiSku);
  if (!token) return false;
  const set = ignored || skuPlanFactIgnoredSet();
  const normalizedPlatform = skuPlanFactNormalizePlatform(platform) || 'all';
  return set.has(skuPlanFactIgnoreKey(normalizedPlatform, token))
    || set.has(skuPlanFactIgnoreKey('all', token));
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

function skuPlanFactSkuLookupTokens(sku = {}, platform = '') {
  const values = typeof skuLookupValues === 'function'
    ? skuLookupValues(sku)
    : [sku?.articleKey, sku?.article, sku?.sku, sku?.vendorCode, sku?.barcode, sku?.nmId];
  const platformAliases = sku?.platformAliases || {};
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  [platform, supportKey, platform === 'ya' ? 'ym' : '', platform === 'ym' ? 'ya' : '']
    .filter(Boolean)
    .forEach((key) => {
      const aliases = platformAliases[key];
      if (Array.isArray(aliases)) values.push(...aliases);
      else if (aliases) values.push(aliases);
    });
  const tokens = [];
  const seen = new Set();
  values.forEach((value) => {
    const token = skuPlanFactToken(value);
    if (!token || seen.has(token)) return;
    seen.add(token);
    tokens.push(token);
  });
  return tokens;
}

function skuPlanFactRowsForSkuIndex(map = null, sku = {}, platform = '') {
  if (!map) return [];
  const rows = [];
  const seen = new Set();
  skuPlanFactSkuLookupTokens(sku, platform).forEach((token) => {
    (map.get(token) || []).forEach((row, index) => {
      const key = `${token}|${index}|${row?.articleKey || row?.article || ''}|${row?.sourceMode || row?.source || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(row);
    });
  });
  return rows;
}

function skuPlanFactRowsForSkuArray(rows = [], sku = {}, platform = '') {
  const tokens = new Set(skuPlanFactSkuLookupTokens(sku, platform));
  if (!tokens.size) return [];
  return rows.filter((row) => tokens.has(skuPlanFactArticleToken(row)));
}

function skuPlanFactKnownSkuTokens() {
  const tokens = new Set();
  (state.skus || []).forEach((sku) => {
    const values = typeof skuLookupValues === 'function'
      ? skuLookupValues(sku)
      : [sku?.articleKey, sku?.article, sku?.sku, sku?.vendorCode, sku?.barcode, sku?.nmId];
    values.forEach((value) => {
      const token = skuPlanFactToken(value);
      if (token) tokens.add(token);
    });
  });
  return tokens;
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

function skuPlanFactUnmappedSkuFromRow(row = {}, token = '') {
  const articleKey = String(row.articleKey || row.article || row.sku || row.offerId || row.offer_id || row.vendorCode || token || '').trim();
  const name = String(row.name || row.offerName || row.productName || row.title || articleKey || token || '').trim();
  return {
    articleKey,
    article: String(row.article || row.articleKey || articleKey).trim(),
    name,
    owner: {
      name: SKU_PLAN_FACT_UNMAPPED_OWNER,
      registryStatus: SKU_PLAN_FACT_UNMAPPED_STATUS,
      source: row.sourceMode || row.source || 'platform_trends.extraMarketplace'
    },
    ownersByPlatform: {},
    status: SKU_PLAN_FACT_UNMAPPED_STATUS,
    flags: { assigned: true },
    __skuPlanFactUnmapped: true
  };
}

function skuPlanFactUnmappedSkus(indexes = {}, monthKey = '', maxFactDate = '') {
  const knownTokens = skuPlanFactKnownSkuTokens();
  const ignoredTokens = skuPlanFactIgnoredSet();
  const result = new Map();
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    skuPlanFactRowsFromIndexMap(indexes.extra?.[platform]).forEach((row) => {
      const token = skuPlanFactArticleToken(row);
      if (!token || knownTokens.has(token) || result.has(token)) return;
      if (skuPlanFactIsIgnored(platform, row.articleKey || row.article || token, ignoredTokens)) return;
      const fact = skuPlanFactFactFromRows([row], monthKey, maxFactDate);
      if (!(numberOrZero(fact.revenue) > 0 || numberOrZero(fact.units) > 0)) return;
      result.set(token, skuPlanFactUnmappedSkuFromRow(row, token));
    });
  });
  return [...result.values()].sort((left, right) => String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru'));
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

function skuPlanFactPlatformTrend(platform = '') {
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  return (state.platformTrends?.platforms || []).find((item) => {
    const key = String(item?.key || '').trim();
    return key === platform || key === supportKey;
  }) || null;
}

function skuPlanFactPlatformAggregateFact(platform = '', monthKey = '', maxFactDate = '') {
  const result = { units: 0, revenue: 0 };
  const platformTrend = skuPlanFactPlatformTrend(platform);
  (platformTrend?.series || []).forEach((item) => {
    const date = String(item?.date || item?.label || '').slice(0, 10);
    if (skuPlanFactMonthFromDate(date) !== monthKey) return;
    if (maxFactDate && date > maxFactDate) return;
    result.units += numberOrZero(item.ordersUnits ?? item.units);
    result.revenue += numberOrZero(item.ordersRevenue ?? item.revenue ?? item.financeTurnover);
  });
  return result;
}

function skuPlanFactScaleMetricFact(metric = null, ratio = 1, reconciliation = null) {
  if (!metric || !Number.isFinite(Number(ratio)) || ratio >= 1 || ratio <= 0) return;
  const rawFactRevenue = numberOrZero(metric.factRevenue);
  const rawFactUnits = numberOrZero(metric.factUnits);
  metric.rawFactRevenue = rawFactRevenue;
  metric.rawFactUnits = rawFactUnits;
  metric.factRevenue = rawFactRevenue * ratio;
  metric.factUnits = rawFactUnits * ratio;
  metric.factAvgCheck = metric.factUnits > 0 ? metric.factRevenue / metric.factUnits : null;
  metric.reconciledFact = true;
  metric.reconciliationRatio = ratio;
  metric.reconciliation = reconciliation;
  if (!String(metric.source || '').includes('platform-reconciled')) {
    metric.source = [metric.source, 'platform-reconciled'].filter(Boolean).join('+');
  }
}

function skuPlanFactReconcilePlatformFacts(rows = [], monthKey = '', maxFactDate = '') {
  const reconciliations = [];
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const aggregate = skuPlanFactPlatformAggregateFact(platform, monthKey, maxFactDate);
    const raw = rows.reduce((acc, row) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      acc.units += numberOrZero(metric?.factUnits);
      acc.revenue += numberOrZero(metric?.factRevenue);
      return acc;
    }, { units: 0, revenue: 0 });
    if (!(aggregate.revenue >= SKU_PLAN_FACT_RECONCILE_MIN_REVENUE && raw.revenue > aggregate.revenue * SKU_PLAN_FACT_RECONCILE_OVERAGE_THRESHOLD)) {
      return;
    }
    const ratio = aggregate.revenue / raw.revenue;
    const reconciliation = {
      platform,
      label: skuPlanFactPlatformLabel(platform),
      rawRevenue: raw.revenue,
      aggregateRevenue: aggregate.revenue,
      rawUnits: raw.units,
      aggregateUnits: aggregate.units,
      ratio
    };
    rows.forEach((row) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      skuPlanFactScaleMetricFact(metric, ratio, reconciliation);
    });
    reconciliations.push(reconciliation);
  });
  return reconciliations;
}

function skuPlanFactBlankMetric(platform = '') {
  return {
    platform,
    label: skuPlanFactPlatformLabel(platform),
    planUnits: 0,
    planRevenue: 0,
    planAvgCheck: null,
    planToDateUnits: 0,
    planToDateRevenue: 0,
    factUnits: 0,
    factRevenue: 0,
    factAvgCheck: null,
    completionToDate: null,
    completionMonth: null,
    gapToDate: 0,
    adSpend: 0,
    adViews: 0,
    adClicks: 0,
    adOrders: 0,
    adRevenue: 0,
    drr: null,
    adsDrr: null,
    turnoverDays: null,
    stock: null,
    marginPct: null,
    currentPrice: null,
    currentClientPrice: null,
    currentFillPrice: null,
    hasSource: false,
    planPriceProxy: 0,
    hasDirectPlan: false,
    source: ''
  };
}

function skuPlanFactAppendUnallocatedAggregateRows(rows = [], monthKey = '', maxFactDate = '') {
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const aggregate = skuPlanFactPlatformAggregateFact(platform, monthKey, maxFactDate);
    const raw = rows.reduce((acc, row) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      acc.units += numberOrZero(metric?.factUnits);
      acc.revenue += numberOrZero(metric?.factRevenue);
      return acc;
    }, { units: 0, revenue: 0 });
    const revenueDelta = aggregate.revenue - raw.revenue;
    if (!(aggregate.revenue >= SKU_PLAN_FACT_RECONCILE_MIN_REVENUE && revenueDelta > SKU_PLAN_FACT_RECONCILE_MIN_REVENUE && raw.revenue < aggregate.revenue * 0.98)) {
      return;
    }
    const unitsDelta = Math.max(0, aggregate.units - raw.units);
    const articleKey = `__unallocated_${platform}_${monthKey}`;
    const platforms = {};
    SKU_PLAN_FACT_PLATFORMS.forEach((key) => {
      platforms[key] = skuPlanFactBlankMetric(key);
    });
    const metric = platforms[platform];
    metric.factUnits = unitsDelta;
    metric.factRevenue = revenueDelta;
    metric.factAvgCheck = unitsDelta > 0 ? revenueDelta / unitsDelta : null;
    metric.hasSource = true;
    metric.source = 'platform-aggregate-unallocated';
    metric.gapToDate = revenueDelta;
    const row = {
      sku: {
        articleKey,
        article: `Неразнесено ${skuPlanFactPlatformLabel(platform)}`,
        name: 'Разница между агрегатом площадки и строками SKU',
        owner: {
          name: SKU_PLAN_FACT_UNMAPPED_OWNER,
          registryStatus: SKU_PLAN_FACT_UNALLOCATED_STATUS
        },
        flags: { assigned: true },
        __skuPlanFactUnmapped: true,
        __skuPlanFactUnallocated: true
      },
      articleKey,
      article: `Неразнесено ${skuPlanFactPlatformLabel(platform)}`,
      name: 'Разница между агрегатом площадки и строками SKU',
      owner: SKU_PLAN_FACT_UNMAPPED_OWNER,
      status: SKU_PLAN_FACT_UNALLOCATED_STATUS,
      syntheticUnmapped: true,
      syntheticUnallocated: true,
      platforms
    };
    SKU_PLAN_FACT_PLATFORMS.forEach((key) => {
      row[key] = platforms[key];
    });
    rows.push(row);
  });
  return rows;
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

function skuPlanFactPlatformHasDirectApiFact(indexes = {}, platform = '') {
  if (platform !== 'ozon' && platform !== 'wb' && platform !== 'ya') return false;
  return skuPlanFactRowsFromIndexMap(indexes.extra?.[platform])
    .some((row) => String(row?.sourceMode || row?.source || '').includes('api-direct-sku'));
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

function skuPlanFactAdForSku(adIndex, platform = '', sku = {}) {
  const result = { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
  skuPlanFactSkuLookupTokens(sku, platform).forEach((token) => {
    const item = adIndex.get(`${platform}|${token}`);
    if (!item) return;
    result.spend += numberOrZero(item.spend);
    result.views += numberOrZero(item.views);
    result.clicks += numberOrZero(item.clicks);
    result.orders += numberOrZero(item.orders);
    result.revenue += numberOrZero(item.revenue);
  });
  return result;
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
  const smartRows = skuPlanFactRowsForSkuIndex(indexes.smart?.[platform], sku, platform);
  const overlayRows = skuPlanFactRowsForSkuIndex(indexes.overlay?.[platform], sku, platform);
  const supportRows = skuPlanFactRowsForSkuIndex(indexes.support?.[platform], sku, platform);
  const pricesRows = skuPlanFactRowsForSkuIndex(indexes.prices?.[platform], sku, platform);
  const extraRows = skuPlanFactRowsForSkuIndex(indexes.extra?.[platform], sku, platform);
  const sourceRows = skuPlanFactRowsForSkuArray(skuPlanFactPlatformSourceRows(indexes, platform), sku, platform);
  const planRows = skuPlanFactRowsForSkuArray(skuPlanFactPlatformPlanRows(indexes, platform, monthKey), sku, platform);
  const hasDirectApiFact = skuPlanFactPlatformHasDirectApiFact(indexes, platform);
  const apiFactRows = hasDirectApiFact ? extraRows : [];
  const factRows = hasDirectApiFact ? apiFactRows : (sourceRows.length ? sourceRows : (overlayRows.length ? overlayRows : (smartRows.length ? smartRows : (pricesRows.length ? pricesRows : extraRows))));
  const plan = SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS.has(platform)
    ? skuPlanFactPlanFromRows(planRows, monthKey)
    : { units: 0, revenue: 0, avgCheck: null, days: skuPlanFactMonthDays(monthKey), source: '' };
  const fact = skuPlanFactFactFromRows(factRows, monthKey, maxFactDate);
  const ad = skuPlanFactAdForSku(adIndex, platform, sku);
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
  const matrixEntry = typeof skuMatrixEntryForSku === 'function' ? skuMatrixEntryForSku(sku) : null;
  const matrixProblemState = typeof skuMatrixProblemState === 'function' ? skuMatrixProblemState(sku) : (sku?.__skuPlanFactUnmapped ? 'api_unmapped' : 'ok');
  const matrixProblemMeta = typeof skuMatrixProblemMeta === 'function'
    ? skuMatrixProblemMeta(matrixProblemState)
    : { label: matrixProblemState, tone: '' };
  const statusMeta = skuOperationalStatusMeta(sku);
  const matrixStatus = typeof skuMatrixStatusLabel === 'function' ? skuMatrixStatusLabel(sku, '') : '';
  const row = {
    sku,
    articleKey: skuPrimaryKey(sku),
    article: sku.article || sku.articleKey || '',
    name: sku.name || '',
    owner: ownerName(sku) || 'Без owner',
    status: statusMeta.label || matrixStatus || '',
    matrixEntry,
    matrixProblemState,
    matrixProblemMeta,
    matrixStatus,
    syntheticUnmapped: Boolean(sku.__skuPlanFactUnmapped),
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

function skuPlanFactMarkDuplicateRiskRows(rows = []) {
  rows.forEach((row) => {
    row.duplicateRisk = SKU_PLAN_FACT_PLATFORMS.some((platform) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      return Boolean(metric?.reconciledFact);
    });
    if (row.duplicateRisk) {
      row.matrixProblemState = 'duplicate_risk';
      row.matrixProblemMeta = typeof skuMatrixProblemMeta === 'function'
        ? skuMatrixProblemMeta('duplicate_risk')
        : { label: 'Риск дубля выручки', tone: 'danger' };
    }
  });
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
  const modelSkus = [
    ...(state.skus || []),
    ...skuPlanFactUnmappedSkus(indexes, monthKey, selectedDate)
  ];
  const rows = modelSkus.map((sku) => skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays, selectedDate));
  skuPlanFactAppendUnallocatedAggregateRows(rows, monthKey, selectedDate);
  const reconciliation = skuPlanFactReconcilePlatformFacts(rows, monthKey, selectedDate);
  skuPlanFactMarkDuplicateRiskRows(rows);
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
    if (filters.status === 'unmapped' && !row.syntheticUnmapped) return false;
    if (filters.status === 'matrix_problem' && (row.matrixProblemState === 'ok' || !row.matrixProblemState)) return false;
    if (filters.status === 'missing_owner' && row.matrixProblemState !== 'missing_owner' && row.owner !== 'Без owner') return false;
    if (filters.status === 'duplicate_risk' && !row.duplicateRisk) return false;
    if (filters.platform !== 'all' && !skuPlanFactPlatformHasActivity(row.platforms?.[filters.platform] || row[filters.platform])) return false;
    if (!search) return true;
    return [row.articleKey, row.article, row.name, row.owner, row.status, row.matrixProblemMeta?.label]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search);
  });
  const sortedRows = skuPlanFactSortRows(filteredRows, filters.sort, filters.sortDir);
  const unmappedRows = rows.filter((row) => row.syntheticUnmapped);
  const unmappedRevenue = unmappedRows.reduce((sum, row) => sum + numberOrZero(row.factRevenue), 0);
  const quality = skuPlanFactBuildDataQuality(rows, reconciliation, monthKey, selectedDate);
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
    reconciliation,
    unmappedCount: unmappedRows.length,
    unmappedRevenue,
    quality,
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

function skuPlanFactBuildDataQuality(rows = [], reconciliation = [], monthKey = '', maxFactDate = '') {
  const issues = [];
  const addIssue = (issue) => {
    const revenue = numberOrZero(issue.revenue);
    issues.push({
      severity: issue.severity || (revenue >= 100000 ? 'danger' : 'warn'),
      type: issue.type || '',
      platform: issue.platform || '',
      articleKey: issue.articleKey || '',
      name: issue.name || '',
      revenue,
      units: numberOrZero(issue.units),
      action: issue.action || '',
      monthKey,
      factTo: maxFactDate
    });
  };

  rows.filter((row) => row.syntheticUnallocated).forEach((row) => {
    const platform = SKU_PLAN_FACT_PLATFORMS.find((key) => numberOrZero(row.platforms?.[key]?.factRevenue) > 0) || '';
    addIssue({
      severity: 'danger',
      type: 'Агрегат без SKU',
      platform: skuPlanFactPlatformLabel(platform),
      articleKey: row.articleKey,
      name: row.name,
      revenue: row.factRevenue,
      units: row.factUnits,
      action: 'Проверить API-детализацию и добавить недостающие SKU/алиасы'
    });
  });

  rows.filter((row) => row.syntheticUnmapped && !row.syntheticUnallocated).forEach((row) => {
    const platformList = SKU_PLAN_FACT_PLATFORMS
      .filter((key) => numberOrZero(row.platforms?.[key]?.factRevenue) > 0 || numberOrZero(row.platforms?.[key]?.factUnits) > 0)
      .map((key) => skuPlanFactPlatformLabel(key))
      .join(', ');
    addIssue({
      type: 'API SKU без пары',
      platform: platformList,
      articleKey: row.articleKey,
      name: row.name,
      revenue: row.factRevenue,
      units: row.factUnits,
      action: 'Добавить строку в dim_sku_aliases или завести SKU в реестре'
    });
  });

  (reconciliation || []).forEach((item) => {
    addIssue({
      severity: 'warn',
      type: 'SKU выше агрегата',
      platform: item.label || '',
      articleKey: '',
      name: 'Сверка суммы SKU с итогом площадки',
      revenue: Math.max(0, numberOrZero(item.rawRevenue) - numberOrZero(item.aggregateRevenue)),
      units: Math.max(0, numberOrZero(item.rawUnits) - numberOrZero(item.aggregateUnits)),
      action: 'Проверить дубли в источнике SKU-факта'
    });
  });

  const noOwnerRows = rows.filter((row) => !row.syntheticUnmapped && (!row.owner || row.owner === 'Без owner'));
  noOwnerRows.slice(0, 20).forEach((row) => {
    addIssue({
      severity: numberOrZero(row.factRevenue) > 0 ? 'warn' : 'info',
      type: 'Нет owner',
      platform: '',
      articleKey: row.articleKey,
      name: row.name,
      revenue: row.factRevenue,
      units: row.factUnits,
      action: 'Заполнить owner в dim_sku'
    });
  });

  const sorted = issues.sort((left, right) => {
    const severityWeight = { danger: 3, warn: 2, info: 1 };
    return (severityWeight[right.severity] || 0) - (severityWeight[left.severity] || 0)
      || numberOrZero(right.revenue) - numberOrZero(left.revenue);
  });
  return {
    issues: sorted,
    topIssues: sorted.slice(0, 10),
    issueCount: sorted.length,
    dangerCount: sorted.filter((item) => item.severity === 'danger').length,
    warnCount: sorted.filter((item) => item.severity === 'warn').length,
    unmappedCount: rows.filter((row) => row.syntheticUnmapped && !row.syntheticUnallocated).length,
    unallocatedCount: rows.filter((row) => row.syntheticUnallocated).length,
    noOwnerCount: noOwnerRows.length,
    unresolvedRevenue: sorted.reduce((sum, item) => sum + numberOrZero(item.revenue), 0)
  };
}

function skuPlanFactAliasImportReportHtml(report = null) {
  if (!report) return '';
  const errors = report.errorRows || [];
  const warnings = report.validationWarnings || [];
  const duplicates = report.duplicateRows || [];
  const skipped = report.skippedRows || [];
  const newSkuRows = report.newSkuRows || [];
  const needCheckRows = report.needCheckRows || [];
  const details = errors.length ? errors.slice(0, 8)
    : warnings.length ? warnings.slice(0, 8)
      : duplicates.length ? duplicates.slice(0, 8)
        : skipped.length ? skipped.slice(0, 8)
          : newSkuRows.length ? newSkuRows.slice(0, 8)
            : needCheckRows.slice(0, 8);
  const canApply = !report.appliedAt && !errors.length && Boolean(
    ((report.aliases || []).length && report.aliasPayload)
    || ((report.ignores || []).length && report.ignorePayload)
  );
  const detailRows = details.map((row) => `
    <tr>
      <td>${escapeHtml(row.rowNumber || '—')}</td>
      <td>${escapeHtml(row.apiSku || row.api_sku || '—')}</td>
      <td>${escapeHtml(row.platform || '—')}</td>
      <td>${escapeHtml(row.targetSku || row.target_sku || '—')}</td>
      <td>${escapeHtml(row.reason || row.action || '—')}</td>
    </tr>
  `).join('');
  return `
    <div class="notice ${errors.length || warnings.length ? 'warn' : 'ok'}" style="margin-top:10px">
      <div class="section-subhead">
        <div>
          <strong>Отчёт импорта${report.fileName ? `: ${escapeHtml(report.fileName)}` : ''}</strong>
          <div class="small muted">Строк: ${fmt.int(report.sourceRows || 0)} · alias: ${fmt.int(report.candidateAliases || 0)} · ignore: ${fmt.int(report.candidateIgnores || 0)} · new_sku: ${fmt.int(report.candidateNewSkus || 0)} · need_check: ${fmt.int(report.candidateNeedCheck || 0)} · дубли: ${fmt.int(duplicates.length)} · пропущено: ${fmt.int(skipped.length)} · ошибок: ${fmt.int(errors.length)}</div>
        </div>
        <div class="badge-stack">
          ${canApply ? '<button class="quick-chip" type="button" data-sku-plan-fact-apply-import>Применить в портал</button>' : ''}
          ${(report.aliases || []).length && report.aliasPayload ? '<button class="quick-chip" type="button" data-sku-plan-fact-download-aliases>Скачать sku_aliases.json</button>' : ''}
          ${(report.ignores || []).length && report.ignorePayload ? '<button class="quick-chip" type="button" data-sku-plan-fact-download-ignore>Скачать sku_alias_ignore.json</button>' : ''}
          <button class="quick-chip" type="button" data-sku-plan-fact-download-import-report>Скачать отчёт</button>
        </div>
      </div>
      ${detailRows ? `
        <div class="table-scroll" style="margin-top:10px">
          <table class="data-table compact">
            <thead><tr><th>Строка</th><th>API SKU</th><th>Площадка</th><th>target_sku</th><th>Статус</th></tr></thead>
            <tbody>${detailRows}</tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `;
}

function skuPlanFactQualityToolsHtml() {
  return `
    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Разбор API SKU</h3>
          <p class="small muted">Загрузите заполненный файл проблем: decision=alias связывает API SKU с SKU реестра, decision=ignore скрывает осознанное исключение, decision=new_sku/need_check остаётся в разборе без применения.</p>
        </div>
        <div class="badge-stack">
          <button class="quick-chip" type="button" data-sku-plan-fact-quality-import>Загрузить заполненный файл</button>
          <input type="file" accept=".csv,.xls,.html,.txt" data-sku-plan-fact-quality-file hidden>
        </div>
      </div>
      ${skuPlanFactAliasImportReportHtml(state.skuPlanFactAliasImportReport || null)}
      <div class="footer-note">Кнопка применения обновляет общий справочник алиасов/ignore и матрицу SKU в снапшотах портала; следующий sync подтянет эти изменения в локальные JSON.</div>
    </div>
  `;
}

function skuPlanFactDataQualityHtml(model) {
  const quality = model.quality || {};
  const issues = quality.topIssues || [];
  if (!quality.issueCount) {
    return `
      <div class="notice ok" style="margin-top:14px">
        <strong>Контроль данных:</strong> критичных расхождений по текущему месяцу не найдено.
      </div>
      ${skuPlanFactQualityToolsHtml()}
    `;
  }
  const rowsHtml = issues.map((issue) => `
    <tr>
      <td>${badge(issue.severity === 'danger' ? 'Критично' : issue.severity === 'warn' ? 'Проверить' : 'Инфо', issue.severity === 'danger' ? 'danger' : issue.severity === 'warn' ? 'warn' : 'info')}</td>
      <td><strong>${escapeHtml(issue.type)}</strong><div class="muted small">${escapeHtml(issue.action)}</div></td>
      <td>${escapeHtml(issue.platform || 'Все')}</td>
      <td>${escapeHtml(issue.articleKey || '—')}<div class="muted small">${escapeHtml(issue.name || '')}</div></td>
      <td><strong>${fmt.money(issue.revenue)}</strong><div class="muted small">${fmt.int(issue.units)} шт.</div></td>
    </tr>
  `).join('');
  return `
    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Контроль данных</h3>
          <p class="small muted">Очередь расхождений, которые мешают план-факту полностью разложиться по SKU и owner.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(quality.unmappedCount || 0)} API SKU`, quality.unmappedCount ? 'warn' : 'ok')}
          ${badge(`${fmt.int(quality.unallocatedCount || 0)} агрегат`, quality.unallocatedCount ? 'danger' : 'ok')}
          ${badge(fmt.money(quality.unresolvedRevenue || 0), quality.dangerCount ? 'danger' : 'warn')}
          <button class="quick-chip" type="button" data-sku-plan-fact-quality-export>Выгрузить проблемы</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead>
            <tr>
              <th>Уровень</th>
              <th>Проблема</th>
              <th>Площадка</th>
              <th>SKU/API</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
    ${skuPlanFactQualityToolsHtml()}
  `;
}

function skuContourGuideHtml() {
  const decisionRows = [
    {
      decision: 'alias',
      use: 'API SKU оказался тем же товаром, который уже есть в реестре.',
      fill: 'В decision пишем alias, в target_sku пишем точный SKU/артикул из реестра. platform и api_sku не меняем.',
      result: 'После загрузки и применения выручка и штуки этого API SKU начнут попадать в один общий SKU во всех контурах.'
    },
    {
      decision: 'ignore',
      use: 'Это не товар для матрицы: тест, дубль мусорного источника, сервисная строка или строка, которую сознательно не надо маппить.',
      fill: 'В decision пишем ignore, target_sku оставляем пустым, в note коротко пишем причину.',
      result: 'Строка уйдет в справочник исключений и перестанет висеть как нерешенная ошибка, но останется в аудите.'
    },
    {
      decision: 'new_sku',
      use: 'Это реальный новый товар, которого еще нет в реестре SKU.',
      fill: 'В decision пишем new_sku, в note пишем что завести. target_sku можно оставить пустым или указать будущий код.',
      result: 'Портал не создает SKU автоматически. Строка попадет в отчет импорта как задача на заведение SKU, затем ее надо связать через alias.'
    },
    {
      decision: 'need_check',
      use: 'Непонятно, что это: нужна проверка у категории, API, склада или источника.',
      fill: 'Оставляем decision=need_check и пишем вопрос/наблюдение в note.',
      result: 'Ничего не применится. Строка останется в очереди, чтобы ее не спрятать случайно.'
    }
  ].map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.decision)}</strong></td>
      <td>${escapeHtml(row.use)}</td>
      <td>${escapeHtml(row.fill)}</td>
      <td>${escapeHtml(row.result)}</td>
    </tr>
  `).join('');

  const statusRows = [
    ['Блокер sync', 'Синхронизация увидела риск в данных. Сначала проверяем источник/API или дубли, потом применяем alias/ignore.'],
    ['Карантин', 'Строка уже изолирована защитой данных. Ее можно разобрать через форму, но в расчетах она не должна тихо смешиваться с нормальными SKU.'],
    ['Новая', 'По этой строке еще нет решения в общем alias/ignore. Это главный рабочий список.'],
    ['Проверить', 'Предупреждение: не всегда блокирует работу, но требует ручной проверки.'],
    ['Применено', 'Для API SKU уже есть alias, строка должна уйти из проблем после обновления данных.'],
    ['Ignore', 'Строка сознательно исключена, она не должна требовать маппинга.']
  ].map(([status, description]) => `
    <tr><td><strong>${escapeHtml(status)}</strong></td><td>${escapeHtml(description)}</td></tr>
  `).join('');

  return `
    <details class="card sku-plan-fact-card" style="margin-top:14px" open data-sku-contour-guide>
      <summary style="cursor:pointer;font-weight:800">Как работать с ошибками SKU и колонкой decision в Excel</summary>
      <div class="notice info" style="margin-top:12px">
        <strong>Коротко: таблица в портале справочная, строки в ней не редактируются.</strong>
        <div class="small muted">Ошибки приходят из утреннего API/sync: портал сравнивает факт продаж площадок, реестр SKU, alias/ignore, карантин и health-снимок. Исправление делается через “Выгрузить форму” → заполнить Excel/CSV → “Загрузить заполненный файл” → “Применить в портал”.</div>
      </div>
      <div class="notice ok" style="margin-top:12px">
        <strong>Что сохранится и не должно возвращаться каждый день</strong>
        <div class="small muted">decision=alias сохраняется в общий sku_aliases, decision=ignore сохраняется в sku_alias_ignore. Утренний sync подтягивает эти справочники и пересобирает матрицу, поэтому тот же API SKU с той же площадки больше не должен попадать в нерешённую очередь.</div>
        <div class="small muted">decision=new_sku и decision=need_check ничего не скрывают: это честный сигнал “завести SKU” или “проверить вручную”. Они останутся в рабочем списке, пока не появится реальный alias или ignore.</div>
      </div>
      <div class="table-scroll" style="margin-top:12px">
        <table class="data-table compact">
          <thead><tr><th>decision</th><th>Когда ставить</th><th>Что заполнить</th><th>Что произойдет</th></tr></thead>
          <tbody>${decisionRows}</tbody>
        </table>
      </div>
      <div class="table-scroll" style="margin-top:12px">
        <table class="data-table compact">
          <thead><tr><th>Статус в портале</th><th>Что значит</th></tr></thead>
          <tbody>${statusRows}</tbody>
        </table>
      </div>
      <div class="footer-note">В Excel обычно трогаем только decision, target_sku и note. Колонки platform/api_sku/status нужны порталу, их лучше не менять без причины.</div>
    </details>
  `;
}

function skuContourStatusMeta(status = '') {
  const key = String(status || '').trim();
  const map = {
    applied: { label: 'Применено', tone: 'ok' },
    ignored: { label: 'Ignore', tone: 'ok' },
    quarantine: { label: 'Карантин', tone: 'danger' },
    blocked: { label: 'Блокер sync', tone: 'danger' },
    warning: { label: 'Проверить', tone: 'warn' },
    new: { label: 'Новая', tone: 'warn' }
  };
  return map[key] || map.new;
}

function skuContourHealthMeta(health = {}) {
  const status = String(health.status || '').toLowerCase();
  if (health?.publish?.allowed === false || status === 'blocked' || status === 'critical') {
    return { label: 'публикация остановлена', tone: 'danger', notice: 'warn' };
  }
  if (status === 'warning' || (health?.publish?.warnings || []).length) {
    return { label: 'есть предупреждения', tone: 'warn', notice: 'warn' };
  }
  return { label: 'в норме', tone: 'ok', notice: 'ok' };
}

function skuContourIssueKey(platform = '', apiSku = '') {
  return skuPlanFactIgnoreKey(platform || 'all', apiSku || '');
}

function skuContourPlatformKeys(rawPlatform = '') {
  const raw = String(rawPlatform || '').split(',').map((part) => part.trim()).filter(Boolean);
  const keys = raw.map((item) => skuPlanFactNormalizePlatform(item)).filter(Boolean);
  return keys.length ? keys : ['all'];
}

function skuContourKnownKeysFromIssue(issue = {}) {
  const apiSku = issue.articleKey || issue.api_sku || issue.apiSku || '';
  return skuContourPlatformKeys(issue.platform).map((platform) => skuContourIssueKey(platform, apiSku));
}

function skuContourIssueRows(model = {}) {
  const aliasKeys = new Set(
    skuPlanFactAliasRows(state.skuAliases || {})
      .filter(skuPlanFactAliasIsActive)
      .map((row) => skuContourIssueKey(row.platform || 'all', row.api_sku || row.apiSku || row.alias || row.value || ''))
  );
  const ignoredKeys = new Set(
    skuPlanFactActiveIgnoreRowsFromPayload(state.skuAliasIgnore || {})
      .map((row) => skuContourIssueKey(row.platform || 'all', row.api_sku || row.apiSku || row.alias || row.value || ''))
  );
  const quarantineKeys = new Set((state.portalDataQuarantine?.rows || []).map((row) => skuContourIssueKey(row.platform || 'all', row.articleKey || row.api_sku || row.apiSku || '')));
  const combined = [
    ...(state.portalDataQuality?.issues || []),
    ...(model.quality?.issues || [])
  ];
  const seen = new Set();
  return combined
    .map((issue) => {
      const apiSku = issue.articleKey || issue.api_sku || issue.apiSku || '';
      const keys = skuContourKnownKeysFromIssue(issue);
      const type = String(issue.type || '').toLowerCase();
      let status = 'new';
      if (keys.some((key) => ignoredKeys.has(key))) status = 'ignored';
      else if (keys.some((key) => aliasKeys.has(key))) status = 'applied';
      else if (keys.some((key) => quarantineKeys.has(key))) status = 'quarantine';
      else if (type.includes('aggregate') || type.includes('агрегат') || type.includes('выше')) status = 'blocked';
      else if (issue.severity === 'warning' || issue.severity === 'warn') status = 'warning';
      return {
        key: `${issue.type || ''}|${issue.platform || ''}|${apiSku}|${Math.round(numberOrZero(issue.revenue))}`,
        status,
        type: issue.type || '',
        platform: issue.platform || '',
        apiSku,
        name: issue.name || '',
        revenue: numberOrZero(issue.revenue),
        units: numberOrZero(issue.units),
        action: issue.action || issue.message || ''
      };
    })
    .filter((row) => {
      if (!row.apiSku && !row.type) return false;
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    })
    .sort((left, right) => {
      const rank = { blocked: 0, quarantine: 1, new: 2, warning: 3, applied: 4, ignored: 5 };
      return (rank[left.status] ?? 9) - (rank[right.status] ?? 9) || numberOrZero(right.revenue) - numberOrZero(left.revenue);
    });
}

function skuContourIssueIsResolved(row = {}) {
  return row.status === 'applied' || row.status === 'ignored';
}

function skuContourShowResolved() {
  return state.skuContourShowResolved === true;
}

function skuContourDownloadPayload() {
  skuPlanFactDownloadJson(`sku-contour-${todayIso()}.json`, {
    generatedAt: new Date().toISOString(),
    skuAliases: state.skuAliases || { aliases: [] },
    skuAliasIgnore: state.skuAliasIgnore || { ignored: [] },
    skuAliasAudit: state.skuAliasAudit || { events: [] },
    skuMatrix: state.skuMatrix || {},
    syncHealth: state.syncHealth || {},
    portalDataQuality: state.portalDataQuality || {},
    portalDataQuarantine: state.portalDataQuarantine || {}
  });
}

function renderSkuContour(rootId = 'view-sku-contour') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const model = skuPlanFactBuildModel();
  const health = state.syncHealth || {};
  const matrix = state.skuMatrix || {};
  const matrixSummary = matrix.summary || {};
  const healthMeta = skuContourHealthMeta(health);
  const quality = state.portalDataQuality?.summary || model.quality || {};
  const quarantine = state.portalDataQuarantine?.summary || {};
  const auditEvents = skuPlanFactAuditEvents(state.skuAliasAudit || {}).slice(0, 8);
  const allIssueRows = skuContourIssueRows(model);
  const showResolved = skuContourShowResolved();
  const resolvedIssueCount = allIssueRows.filter(skuContourIssueIsResolved).length;
  const issueRows = showResolved ? allIssueRows : allIssueRows.filter((row) => !skuContourIssueIsResolved(row));
  const hiddenResolvedCount = allIssueRows.length - issueRows.length;
  const issueHtml = issueRows.slice(0, 120).map((row) => {
    const meta = skuContourStatusMeta(row.status);
    return `
      <tr>
        <td>${badge(meta.label, meta.tone)}</td>
        <td><strong>${escapeHtml(row.type || '—')}</strong><div class="muted small">${escapeHtml(row.action || '')}</div></td>
        <td>${escapeHtml(row.platform || 'Все')}</td>
        <td><strong>${escapeHtml(row.apiSku || '—')}</strong><div class="muted small">${escapeHtml(row.name || '')}</div></td>
        <td><strong>${fmt.money(row.revenue)}</strong><div class="muted small">${fmt.int(row.units)} шт.</div></td>
      </tr>
    `;
  }).join('');
  const auditHtml = auditEvents.map((event) => `
    <tr>
      <td>${escapeHtml(fmt.date(event.appliedAt || event.generatedAt || ''))}</td>
      <td>${escapeHtml(event.actor || 'portal-user')}</td>
      <td>${escapeHtml(event.fileName || '—')}</td>
      <td>${fmt.int(event.aliasesAdded || 0)} alias / ${fmt.int(event.ignoresAdded || 0)} ignore</td>
      <td>${fmt.int(event.validationWarnings || 0)} warn</td>
    </tr>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Контур SKU</h2>
        <p>Единое место для API SKU без пары, alias/ignore, аудита и статуса утреннего sync.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" type="button" data-sku-contour-refresh>Обновить</button>
        <button class="quick-chip" type="button" data-sku-contour-toggle-resolved>${showResolved ? 'Скрыть решённые' : `Показать решённые${hiddenResolvedCount ? ` (${fmt.int(hiddenResolvedCount)})` : ''}`}</button>
        <button class="quick-chip" type="button" data-sku-contour-open-planfact>План-факт</button>
      </div>
    </div>

    ${skuContourGuideHtml()}

    <div class="notice ${healthMeta.notice}">
      <div class="section-subhead">
        <div>
          <strong>Sync: ${escapeHtml(healthMeta.label)}</strong>
          <div class="small muted">Проверено: ${escapeHtml(fmt.date(health.generatedAt || health.publish?.checkedAt || ''))} · данные до ${escapeHtml(health.freshness?.maxDate || quality.maxDate || '—')}</div>
          ${(health.publish?.blockingReasons || health.publish?.warnings || []).slice(0, 3).map((item) => `<div class="small muted">${escapeHtml(item)}</div>`).join('')}
        </div>
        <div class="badge-stack">
          ${badge(healthMeta.label, healthMeta.tone)}
          ${badge(`${fmt.int(quality.apiUnmappedUniqueSku || matrixSummary.apiUnmappedCount || 0)} API без пары`, (quality.apiUnmappedUniqueSku || matrixSummary.apiUnmappedCount) ? 'warn' : 'ok')}
          ${badge(`${fmt.int(quarantine.rows || 0)} в карантине`, quarantine.rows ? 'danger' : 'ok')}
          ${badge(fmt.money(quality.apiUnmappedRevenue || 0), quality.apiUnmappedRevenue ? 'warn' : 'ok')}
        </div>
      </div>
    </div>

    <div class="kpi-strip" style="margin-top:14px">
      <div class="mini-kpi"><span>SKU</span><strong>${fmt.int(matrixSummary.skuCount || (state.skus || []).length)}</strong><span>в матрице</span></div>
      <div class="mini-kpi warn"><span>Alias</span><strong>${fmt.int(matrixSummary.aliasCount || skuPlanFactAliasRows(state.skuAliases || {}).length)}</strong><span>общий справочник</span></div>
      <div class="mini-kpi"><span>Ignore</span><strong>${fmt.int(matrixSummary.ignoredApiSkuCount || skuPlanFactIgnorePayloadRows(state.skuAliasIgnore || {}).length)}</strong><span>осознанно не маппим</span></div>
      <div class="mini-kpi danger"><span>API без пары</span><strong>${fmt.int(matrixSummary.apiUnmappedCount || quality.apiUnmappedPlatformRows || 0)}</strong><span>из API источников</span></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(matrixSummary.missingOwnerCount || quality.skuMissingOwner || 0)}</strong><span>реестр / матрица</span></div>
      <div class="mini-kpi"><span>Аудит</span><strong>${fmt.int(auditEvents.length)}</strong><span>последние применения</span></div>
    </div>

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Форма разбора API SKU</h3>
          <p class="small muted">Выгрузите форму, заполните decision: alias, ignore, new_sku или need_check, затем загрузите обратно. Те же кнопки остаются и в План-факте.</p>
        </div>
        <div class="badge-stack">
          <button class="quick-chip" type="button" data-sku-contour-quality-export>Выгрузить форму</button>
          <button class="quick-chip" type="button" data-sku-contour-quality-import>Загрузить заполненный файл</button>
          <button class="quick-chip" type="button" data-sku-contour-download-json>Скачать контур JSON</button>
          <input type="file" accept=".csv,.xls,.html,.txt" data-sku-contour-quality-file hidden>
        </div>
      </div>
      ${skuPlanFactAliasImportReportHtml(state.skuPlanFactAliasImportReport || null)}
    </div>

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Очередь ошибок и статусов</h3>
          <p class="small muted">По умолчанию показаны только нерешённые строки. Alias и ignore сохраняются в общий контур и скрываются из рабочей очереди после применения.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(issueRows.length)} в работе`, issueRows.length ? 'warn' : 'ok')}
          ${resolvedIssueCount ? badge(`${fmt.int(resolvedIssueCount)} решено`, 'ok') : ''}
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Статус</th><th>Проблема</th><th>Площадка</th><th>API / SKU</th><th>Сумма</th></tr></thead>
          <tbody>${issueHtml || `<tr><td colspan="5"><div class="empty">${hiddenResolvedCount ? 'Нерешённых ошибок нет. Решённые строки скрыты, их можно показать кнопкой сверху.' : 'Очередь ошибок пуста'}</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Аудит применений</h3>
          <p class="small muted">Кто и каким файлом менял alias/ignore. Хранится в общем snapshot sku_alias_audit.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(skuPlanFactAuditEvents(state.skuAliasAudit || {}).length)} событий`, auditEvents.length ? 'info' : '')}
          <button class="quick-chip" type="button" data-sku-contour-download-audit>Скачать аудит</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Дата</th><th>Пользователь</th><th>Файл</th><th>Применено</th><th>Warnings</th></tr></thead>
          <tbody>${auditHtml || '<tr><td colspan="5"><div class="empty">Применений пока не было</div></td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  root.querySelector('[data-sku-contour-refresh]')?.addEventListener('click', (event) => refreshSkuPlanFactData(event.currentTarget, rootId));
  root.querySelector('[data-sku-contour-toggle-resolved]')?.addEventListener('click', () => {
    state.skuContourShowResolved = !skuContourShowResolved();
    renderSkuContour(rootId);
  });
  root.querySelector('[data-sku-contour-open-planfact]')?.addEventListener('click', () => {
    if (typeof setView === 'function') setView('sku-plan-fact');
    else document.querySelector('.nav-btn[data-view="sku-plan-fact"]')?.click();
  });
  root.querySelector('[data-sku-contour-quality-export]')?.addEventListener('click', () => downloadSkuPlanFactQualityExcel(model));
  root.querySelector('[data-sku-contour-quality-import]')?.addEventListener('click', () => root.querySelector('[data-sku-contour-quality-file]')?.click());
  root.querySelector('[data-sku-contour-quality-file]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    await handleSkuPlanFactAliasImport(file, rootId);
  });
  root.querySelector('[data-sku-contour-download-json]')?.addEventListener('click', skuContourDownloadPayload);
  root.querySelector('[data-sku-contour-download-audit]')?.addEventListener('click', () => skuPlanFactDownloadJson(`sku-alias-audit-${todayIso()}.json`, state.skuAliasAudit || { events: [] }));
  root.querySelector('[data-sku-plan-fact-apply-import]')?.addEventListener('click', async (event) => {
    await handleSkuPlanFactApplyAliasImport(event.currentTarget, rootId);
  });
  root.querySelector('[data-sku-plan-fact-download-aliases]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    if (report.aliasPayload) skuPlanFactDownloadJson('sku_aliases.updated.json', report.aliasPayload);
  });
  root.querySelector('[data-sku-plan-fact-download-ignore]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    if (report.ignorePayload) skuPlanFactDownloadJson('sku_alias_ignore.updated.json', report.ignorePayload);
  });
  root.querySelector('[data-sku-plan-fact-download-import-report]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    const { aliasPayload, ignorePayload, ...publicReport } = report;
    skuPlanFactDownloadJson(`sku-alias-import-report-${todayIso()}.json`, publicReport);
  });
}

function skuPlanFactReconciliationHtml(items = []) {
  if (!items.length) return '';
  const text = items.map((item) => (
    `${item.label}: SKU ${fmt.money(item.rawRevenue)} -> итог площадки ${fmt.money(item.aggregateRevenue)}`
  )).join(' · ');
  return `
    <div class="notice warn" style="margin-top:14px">
      <strong>Сверка источников:</strong> ${escapeHtml(text)}. Факт по SKU скорректирован до агрегата площадки.
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
  const articleTitle = row.article || row.articleKey;
  const problemMeta = row.matrixProblemMeta || (typeof skuMatrixProblemMeta === 'function' ? skuMatrixProblemMeta(row.matrixProblemState || 'ok') : null);
  const problemBadge = problemMeta && row.matrixProblemState && row.matrixProblemState !== 'ok'
    ? badge(problemMeta.label, problemMeta.tone || 'warn')
    : '';
  const articleHtml = row.syntheticUnmapped
    ? `<strong>${escapeHtml(articleTitle)}</strong><div class="badge-stack" style="margin-top:6px">${badge(row.status || SKU_PLAN_FACT_UNMAPPED_STATUS, 'warn')}</div>`
    : linkToSku(row.articleKey, articleTitle);
  const openAttr = row.syntheticUnmapped ? '' : ` data-open-sku="${escapeHtml(row.articleKey)}"`;
  return `
    <tr class="sku-plan-fact-row ${row.syntheticUnmapped ? 'is-unmapped' : ''}"${openAttr}>
      <td>${articleHtml}<div class="muted small">${escapeHtml(row.name)}</div></td>
      <td><strong>${escapeHtml(row.owner)}</strong><div class="muted small">${escapeHtml(row.status)}</div>${problemBadge ? `<div class="badge-stack" style="margin-top:6px">${problemBadge}</div>` : ''}</td>
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
    ['status', 'Статус'],
    ['matrix_problem', 'Проблема матрицы']
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
      status: row.status,
      matrix_problem: row.matrixProblemMeta?.label || row.matrixProblemState || ''
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

function skuPlanFactQualityExportColumns() {
  return [
    ['decision', 'Решение: alias / new_sku / ignore / need_check'],
    ['decision_hint', 'Подсказка по решению'],
    ['target_sku', 'SKU в реестре (заполнять для alias)'],
    ['platform', 'Площадка'],
    ['api_sku', 'API SKU'],
    ['status', 'Статус записи (обычно active)'],
    ['note', 'Комментарий'],
    ['month', 'Месяц'],
    ['fact_to', 'Факт до'],
    ['severity', 'Уровень'],
    ['type', 'Проблема'],
    ['article_key', 'SKU/API'],
    ['name', 'Название'],
    ['revenue', 'Сумма'],
    ['units', 'Шт'],
    ['recommended_action', 'Что сделать']
  ];
}

function skuPlanFactDecisionHint(issue = {}) {
  const type = String(issue.type || '').toLowerCase();
  const action = String(issue.action || '').toLowerCase();
  if (type.includes('owner') || action.includes('owner')) {
    return 'Поставьте need_check и заполните owner в реестре SKU; alias тут обычно не нужен.';
  }
  if (type.includes('агрегат') || action.includes('детал')) {
    return 'Сначала проверьте API-детализацию. Если нашли товар в реестре - alias; если это новый товар - new_sku; если мусор источника - ignore.';
  }
  if (type.includes('api sku') || action.includes('alias') || action.includes('dim_sku_aliases')) {
    return 'Если это существующий товар - alias + target_sku. Если товара нет в реестре - new_sku. Если маппить не нужно - ignore.';
  }
  return 'Если уверены в паре - alias + target_sku; если не уверены - need_check; если строку не надо маппить - ignore.';
}

function skuPlanFactQualityExportRows(model) {
  return (model.quality?.issues || []).map((issue) => ({
    decision: 'need_check',
    decision_hint: skuPlanFactDecisionHint(issue),
    target_sku: '',
    platform: issue.platform,
    api_sku: issue.articleKey,
    status: 'active',
    note: issue.action || '',
    month: model.monthKey,
    fact_to: model.maxFactDate,
    severity: issue.severity,
    type: issue.type,
    article_key: issue.articleKey,
    name: issue.name,
    revenue: Math.round(issue.revenue || 0),
    units: Math.round(issue.units || 0),
    recommended_action: issue.action
  }));
}

function downloadSkuPlanFactQualityExcel(model) {
  const rows = skuPlanFactQualityExportRows(model);
  if (!rows.length) {
    window.alert('Проблем качества данных по текущему срезу нет.');
    return;
  }
  downloadLaunchesHtmlTable(skuPlanFactQualityExportColumns(), rows, `sku-plan-fact-data-quality-${model.monthKey}.xls`);
}

function skuPlanFactDownloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function skuPlanFactParseDelimited(text = '', delimiter = ';') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => String(value || '').trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => String(value || '').trim())) rows.push(row);
  return rows;
}

function skuPlanFactDetectDelimiter(text = '') {
  const firstLine = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim()) || '';
  const candidates = [';', '\t', ','];
  return candidates
    .map((delimiter) => ({ delimiter, count: (firstLine.match(new RegExp(delimiter === '\t' ? '\\t' : `\\${delimiter}`, 'g')) || []).length }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter || ';';
}

function skuPlanFactImportHeaderKey(header = '') {
  const token = skuPlanFactToken(header);
  if (!token) return '';
  if (['action', 'decision'].includes(token) || token.startsWith('решение')) return 'action';
  if (['targetsku', 'target', 'portalsku', 'mainsku'].includes(token) || token.includes('реестре')) return 'target_sku';
  if (['platform', 'marketplace', 'sourceplatform'].includes(token) || token.includes('площадка')) return 'platform';
  if (['apisku', 'apiarticle', 'api', 'sourcesku', 'marketplacesku'].includes(token)) return 'api_sku';
  if (['articlekey', 'article', 'skuapi'].includes(token)) return 'article_key';
  if (['status', 'active'].includes(token) || token.includes('статус')) return 'status';
  if (['note', 'comment', 'decisioncomment'].includes(token) || token.includes('комментар')) return 'note';
  return token;
}

function skuPlanFactRowsFromMatrix(matrix = []) {
  const headers = (matrix[0] || []).map((value) => skuPlanFactImportHeaderKey(value));
  return matrix.slice(1).map((values) => {
    const row = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = String(values[index] ?? '').trim();
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => String(value || '').trim()));
}

function skuPlanFactRowsFromHtml(text = '') {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  const matrix = [...table.querySelectorAll('tr')].map((tr) => (
    [...tr.querySelectorAll('th,td')].map((cell) => cell.textContent || '')
  ));
  return skuPlanFactRowsFromMatrix(matrix);
}

async function skuPlanFactRowsFromReviewFile(file) {
  const text = await file.text();
  if (/^\s*PK/.test(text) || /\.xlsx$/i.test(file.name || '')) {
    throw new Error('XLSX напрямую браузер не читает. Загрузите CSV или XLS, который портал выгружает из кнопки "Выгрузить проблемы".');
  }
  if (/<table[\s>]/i.test(text) || /<html[\s>]/i.test(text)) return skuPlanFactRowsFromHtml(text);
  return skuPlanFactRowsFromMatrix(skuPlanFactParseDelimited(text, skuPlanFactDetectDelimiter(text)));
}

async function skuPlanFactLoadJsonFile(path, fallback, label) {
  if (typeof loadJsonOrFallback === 'function') return loadJsonOrFallback(path, fallback, label || path);
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) return fallback;
  return response.json();
}

function skuPlanFactAliasRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.aliases) ? payload.aliases : [];
}

function skuPlanFactAliasKey(alias = {}) {
  return [
    skuPlanFactToken(alias.target_sku || alias.targetSku || alias.target || ''),
    skuPlanFactNormalizePlatform(alias.platform || 'all'),
    skuPlanFactToken(alias.api_sku || alias.apiSku || alias.alias || alias.value || '')
  ].join('|');
}

function skuPlanFactAliasApiKey(platform = 'all', apiSku = '') {
  return skuPlanFactIgnoreKey(platform || 'all', apiSku || '');
}

function skuPlanFactOwnerTextForSku(sku = {}) {
  if (typeof ownerName === 'function') return ownerName(sku) || '';
  if (typeof sku?.owner === 'string') return sku.owner.trim();
  return String(sku?.owner?.name || '').trim();
}

function skuPlanFactRegistryStatusText(sku = {}) {
  return String(
    sku?.owner?.registryStatus
    || sku?.registryStatus
    || sku?.status
    || ''
  ).trim();
}

function skuPlanFactAuditEvents(payload = {}) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.events) ? payload.events : [];
}

function skuPlanFactBuildAuditPayload(event = {}) {
  const previous = state.skuAliasAudit && typeof state.skuAliasAudit === 'object'
    ? state.skuAliasAudit
    : { schema: 'sku-alias-audit-v1', events: [] };
  const previousEvents = skuPlanFactAuditEvents(previous);
  return {
    ...previous,
    schema: previous.schema || 'sku-alias-audit-v1',
    generatedAt: event.appliedAt || new Date().toISOString(),
    events: [event, ...previousEvents].slice(0, 500)
  };
}

function skuPlanFactBuildSkuLookup() {
  const lookup = new Map();
  (state.skus || []).forEach((sku) => {
    skuPlanFactSkuLookupTokens(sku).forEach((token) => {
      if (token && !lookup.has(token)) lookup.set(token, sku);
    });
  });
  return lookup;
}

function skuPlanFactReviewValue(row = {}, aliases = []) {
  for (const alias of aliases) {
    const key = skuPlanFactImportHeaderKey(alias);
    if (row[key] !== undefined) return String(row[key] ?? '').trim();
  }
  return '';
}

function skuPlanFactNormalizeReviewAction(action = '', targetSku = '') {
  const token = skuPlanFactToken(action);
  if (['alias', 'map', 'mapping', 'apply', 'active', 'алиас', 'связать'].includes(token)) return 'alias';
  if (['ignore', 'ignored', 'skip', 'hide', 'mute', 'exclude', 'игнор', 'игнорировать', 'скрыть'].includes(token)) return 'ignore';
  if (['newsku', 'new', 'createsku', 'create', 'sku', 'newproduct'].includes(token)) return 'new_sku';
  if (['needcheck', 'check', 'review', 'manual', 'question', 'later', 'todo'].includes(token)) return 'need_check';
  if (!token && targetSku) return 'alias';
  if (!token) return 'empty';
  return token;
}

function skuPlanFactPrepareAliasImport(rows = [], currentAliases = {}, currentIgnore = {}) {
  const skuLookup = skuPlanFactBuildSkuLookup();
  const aliasPayload = Array.isArray(currentAliases)
    ? { schema: 'sku-api-aliases-v1', aliases: currentAliases }
    : { schema: 'sku-api-aliases-v1', columns: ['target_sku', 'platform', 'api_sku', 'status', 'note'], aliases: skuPlanFactAliasRows(currentAliases) };
  const ignorePayload = Array.isArray(currentIgnore)
    ? { schema: 'sku-api-ignore-v1', columns: ['platform', 'api_sku', 'status', 'note'], ignored: currentIgnore }
    : { schema: 'sku-api-ignore-v1', columns: ['platform', 'api_sku', 'status', 'note'], ignored: skuPlanFactIgnorePayloadRows(currentIgnore) };
  ignorePayload.ignored = skuPlanFactIgnorePayloadRows(currentIgnore).slice();
  const existingAliases = new Set(skuPlanFactAliasRows(aliasPayload).map(skuPlanFactAliasKey));
  const existingIgnores = new Set(ignorePayload.ignored.map((row) => skuPlanFactIgnoreKey(row.platform || 'all', row.api_sku || row.apiSku || row.alias || row.value || '')));
  const existingApiTargets = new Map();
  const existingTargetAliasCounts = new Map();
  skuPlanFactAliasRows(aliasPayload).filter(skuPlanFactAliasIsActive).forEach((alias) => {
    const platform = skuPlanFactNormalizePlatform(alias.platform || 'all') || 'all';
    const apiSku = alias.api_sku || alias.apiSku || alias.alias || alias.value || '';
    const targetToken = skuPlanFactToken(alias.target_sku || alias.targetSku || alias.target || '');
    if (!apiSku || !targetToken) return;
    const target = skuLookup.get(targetToken);
    const targetSku = target?.articleKey || target?.article || alias.target_sku || alias.targetSku || alias.target || '';
    const canonicalTargetToken = skuPlanFactToken(targetSku);
    if (!canonicalTargetToken) return;
    existingApiTargets.set(skuPlanFactAliasApiKey(platform, apiSku), { targetToken: canonicalTargetToken, targetSku });
    existingTargetAliasCounts.set(canonicalTargetToken, (existingTargetAliasCounts.get(canonicalTargetToken) || 0) + 1);
  });
  const uploadApiTargets = new Map();
  const aliases = [];
  const ignores = [];
  const newSkuRows = [];
  const needCheckRows = [];
  const skippedRows = [];
  const errorRows = [];
  const duplicateRows = [];
  const validationWarnings = [];
  const findExistingApiConflict = (platform, apiSku, targetToken) => {
    const apiToken = skuPlanFactToken(apiSku);
    const candidates = [
      existingApiTargets.get(skuPlanFactAliasApiKey(platform, apiSku)),
      existingApiTargets.get(skuPlanFactAliasApiKey('all', apiSku))
    ].filter(Boolean);
    if (platform === 'all') {
      existingApiTargets.forEach((value, key) => {
        if (String(key || '').endsWith(`|${apiToken}`)) candidates.push(value);
      });
    }
    return candidates.find((item) => item.targetToken && item.targetToken !== targetToken) || null;
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const targetSku = skuPlanFactReviewValue(row, ['target_sku', 'target', 'portal_sku', 'main_sku']);
    const apiSku = skuPlanFactReviewValue(row, ['api_sku', 'api_article', 'api', 'article_key', 'article']);
    const platformRaw = skuPlanFactReviewValue(row, ['platform', 'marketplace', 'source_platform']);
    const platform = skuPlanFactNormalizePlatform(platformRaw || 'all');
    const status = skuPlanFactReviewValue(row, ['status']) || 'active';
    const note = skuPlanFactReviewValue(row, ['note', 'comment', 'decision_comment']) || 'Imported from portal review';
    const action = skuPlanFactNormalizeReviewAction(skuPlanFactReviewValue(row, ['action', 'decision', 'решение']), targetSku);

    if (!apiSku) {
      skippedRows.push({ rowNumber, reason: 'empty api_sku' });
      return;
    }
    if (!platformRaw) {
      validationWarnings.push({ rowNumber, apiSku, platform, targetSku, reason: 'platform is empty, import will use all platforms' });
    }
    if (action === 'ignore') {
      const ignore = { platform, api_sku: apiSku, status: 'ignored', note, updatedAt: new Date().toISOString() };
      const key = skuPlanFactIgnoreKey(platform, apiSku);
      if (existingIgnores.has(key)) duplicateRows.push({ rowNumber, apiSku, platform, reason: 'ignore duplicate' });
      else {
        existingIgnores.add(key);
        ignores.push(ignore);
      }
      return;
    }
    if (action === 'new_sku') {
      const item = {
        rowNumber,
        apiSku,
        platform,
        targetSku,
        note,
        action,
        reason: 'new_sku: сначала заведите SKU в реестре, затем загрузите эту строку как alias'
      };
      newSkuRows.push(item);
      skippedRows.push(item);
      return;
    }
    if (action === 'need_check') {
      const item = {
        rowNumber,
        apiSku,
        platform,
        targetSku,
        note,
        action,
        reason: 'need_check: строка оставлена на ручную проверку, портал ничего не применяет'
      };
      needCheckRows.push(item);
      skippedRows.push(item);
      return;
    }
    if (action !== 'alias') {
      skippedRows.push({ rowNumber, apiSku, action, reason: 'not an alias action' });
      return;
    }
    if (!targetSku) {
      errorRows.push({ rowNumber, apiSku, platform, reason: 'target_sku is required for alias' });
      return;
    }
    const target = skuLookup.get(skuPlanFactToken(targetSku));
    if (!target) {
      errorRows.push({ rowNumber, apiSku, platform, targetSku, reason: 'target_sku not found in skus.json' });
      return;
    }
    const canonicalTargetSku = target.articleKey || target.article || targetSku;
    const canonicalTargetToken = skuPlanFactToken(canonicalTargetSku);
    const uploadApiKey = skuPlanFactAliasApiKey(platform, apiSku);
    const uploadConflict = uploadApiTargets.get(uploadApiKey);
    if (uploadConflict && uploadConflict.targetToken !== canonicalTargetToken) {
      errorRows.push({ rowNumber, apiSku, platform, targetSku: canonicalTargetSku, reason: `same upload maps API SKU to ${uploadConflict.targetSku}` });
      return;
    }
    const existingConflict = findExistingApiConflict(platform, apiSku, canonicalTargetToken);
    if (existingConflict) {
      errorRows.push({ rowNumber, apiSku, platform, targetSku: canonicalTargetSku, reason: `existing alias already maps API SKU to ${existingConflict.targetSku}` });
      return;
    }
    uploadApiTargets.set(uploadApiKey, { targetToken: canonicalTargetToken, targetSku: canonicalTargetSku });

    const owner = skuPlanFactOwnerTextForSku(target);
    const registryStatus = skuPlanFactRegistryStatusText(target);
    if (!owner || /^без owner$/i.test(owner) || /не\s*в\s*реестре/i.test(registryStatus)) {
      validationWarnings.push({ rowNumber, apiSku, platform, targetSku: canonicalTargetSku, reason: 'target_sku has no owner or is not in registry' });
    }
    const nextAliasCount = (existingTargetAliasCounts.get(canonicalTargetToken) || 0) + 1;
    if (nextAliasCount > 50 && (nextAliasCount === 51 || nextAliasCount % 25 === 0)) {
      validationWarnings.push({ rowNumber, apiSku, platform, targetSku: canonicalTargetSku, reason: `target_sku has ${nextAliasCount} active aliases` });
    }

    const alias = { target_sku: canonicalTargetSku, platform, api_sku: apiSku, status, note };
    const key = skuPlanFactAliasKey(alias);
    if (existingAliases.has(key)) duplicateRows.push({ rowNumber, apiSku, platform, targetSku: alias.target_sku, reason: 'alias duplicate' });
    else {
      existingAliases.add(key);
      existingTargetAliasCounts.set(canonicalTargetToken, nextAliasCount);
      aliases.push(alias);
    }
  });

  const nextAliasPayload = { ...aliasPayload, aliases: [...skuPlanFactAliasRows(aliasPayload), ...aliases], updatedAt: new Date().toISOString() };
  const nextIgnorePayload = { ...ignorePayload, ignored: [...ignorePayload.ignored, ...ignores], updatedAt: new Date().toISOString() };
  return {
    generatedAt: new Date().toISOString(),
    sourceRows: rows.length,
    candidateAliases: aliases.length,
    candidateIgnores: ignores.length,
    candidateNewSkus: newSkuRows.length,
    candidateNeedCheck: needCheckRows.length,
    validationWarnings,
    duplicateRows,
    skippedRows,
    errorRows,
    newSkuRows,
    needCheckRows,
    aliases,
    ignores,
    aliasPayload: nextAliasPayload,
    ignorePayload: nextIgnorePayload
  };
}

function skuPlanFactAliasIsActive(row = {}) {
  const status = skuPlanFactToken(row?.status ?? row?.active ?? 'active');
  return !['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove'].includes(status);
}

function skuPlanFactApplyAliasesToStateSkus(aliasRows = []) {
  const lookup = skuPlanFactBuildSkuLookup();
  let applied = 0;
  (aliasRows || []).filter(skuPlanFactAliasIsActive).forEach((alias) => {
    const targetToken = skuPlanFactToken(alias.target_sku || alias.targetSku || alias.target || '');
    const apiSku = String(alias.api_sku || alias.apiSku || alias.alias || alias.value || '').trim();
    if (!targetToken || !apiSku) return;
    const sku = lookup.get(targetToken);
    if (!sku) return;
    const platform = skuPlanFactNormalizePlatform(alias.platform || 'all') || 'all';
    sku.platformAliases = sku.platformAliases && typeof sku.platformAliases === 'object' ? sku.platformAliases : {};
    if (!Array.isArray(sku.platformAliases[platform])) sku.platformAliases[platform] = sku.platformAliases[platform] ? [sku.platformAliases[platform]] : [];
    const platformTokens = new Set(sku.platformAliases[platform].map((value) => skuPlanFactToken(value)));
    if (!platformTokens.has(skuPlanFactToken(apiSku))) sku.platformAliases[platform].push(apiSku);
    sku.aliases = Array.isArray(sku.aliases) ? sku.aliases : [];
    const aliasTokens = new Set(sku.aliases.map((value) => skuPlanFactToken(typeof value === 'string' ? value : (value?.value || value?.alias || value?.api_sku || ''))));
    if (!aliasTokens.has(skuPlanFactToken(apiSku))) {
      sku.aliases.push({ value: apiSku, platform, source: 'portal-import' });
    }
    applied += 1;
  });
  return applied;
}

function skuPlanFactActiveIgnoreRowsFromPayload(payload = {}) {
  return skuPlanFactIgnorePayloadRows(payload).filter((row) => {
    const status = skuPlanFactToken(row?.status ?? row?.active ?? 'active');
    return !['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove'].includes(status);
  });
}

function skuPlanFactBuildRuntimeSkuMatrix(aliasPayload = {}, ignorePayload = {}) {
  const aliases = skuPlanFactAliasRows(aliasPayload).filter(skuPlanFactAliasIsActive);
  const ignored = skuPlanFactActiveIgnoreRowsFromPayload(ignorePayload);
  const lookup = skuPlanFactBuildSkuLookup();
  const aliasesByTarget = new Map();
  const aliasToArticleKey = {};
  aliases.forEach((alias) => {
    const targetToken = skuPlanFactToken(alias.target_sku || alias.targetSku || alias.target || '');
    const apiSku = String(alias.api_sku || alias.apiSku || alias.alias || alias.value || '').trim();
    if (!targetToken || !apiSku) return;
    const target = lookup.get(targetToken);
    const articleKey = target?.articleKey || target?.article || alias.target_sku || '';
    if (!articleKey) return;
    if (!aliasesByTarget.has(articleKey)) aliasesByTarget.set(articleKey, []);
    const platform = skuPlanFactNormalizePlatform(alias.platform || 'all') || 'all';
    aliasesByTarget.get(articleKey).push({
      platform,
      api_sku: apiSku,
      status: alias.status || 'active',
      note: alias.note || '',
      source: alias.source || 'portal-import'
    });
    aliasToArticleKey[skuPlanFactIgnoreKey(platform, apiSku)] = articleKey;
  });

  const previous = state.skuMatrix || {};
  const previousByToken = new Map((previous.items || []).map((item) => [skuPlanFactToken(item.articleKey || item.article || ''), item]));
  const items = (state.skus || []).map((sku, index) => {
    const articleKey = sku.articleKey || sku.article || '';
    const previousItem = previousByToken.get(skuPlanFactToken(articleKey)) || {};
    const owner = ownerName(sku) || previousItem.owner || '';
    let problemStates = Array.isArray(previousItem.problemStates) && previousItem.problemStates.length
      ? previousItem.problemStates.filter((stateKey) => stateKey !== 'missing_owner')
      : ['ok'];
    if (!owner) problemStates = ['missing_owner', ...problemStates.filter((stateKey) => stateKey !== 'ok')];
    if (!problemStates.length) problemStates = ['ok'];
    return {
      ...previousItem,
      articleKey,
      article: sku.article || articleKey,
      name: sku.name || previousItem.name || '',
      owner,
      status: sku.status || previousItem.status || '',
      registryStatus: sku.owner?.registryStatus || previousItem.registryStatus || sku.status || '',
      brand: sku.brand || previousItem.brand || '',
      category: sku.category || previousItem.category || '',
      aliases: aliasesByTarget.get(articleKey) || [],
      problemStates,
      problemState: problemStates[0] || 'ok',
      problemLabel: typeof skuMatrixProblemMeta === 'function' ? skuMatrixProblemMeta(problemStates[0] || 'ok').label : '',
      problemTone: typeof skuMatrixProblemMeta === 'function' ? skuMatrixProblemMeta(problemStates[0] || 'ok').tone : '',
      _index: index
    };
  }).map(({ _index, ...item }) => item);

  const ignoredKeys = new Set(ignored.map((row) => skuPlanFactIgnoreKey(row.platform || 'all', row.api_sku || row.apiSku || row.alias || row.value || '')));
  const activeAliasKeys = new Set(Object.keys(aliasToArticleKey));
  const apiUnmapped = (previous.apiUnmapped || []).filter((row) => {
    const platform = row.platform || 'all';
    const apiSku = row.api_sku || row.apiSku || row.articleKey || '';
    return !ignoredKeys.has(skuPlanFactIgnoreKey(platform, apiSku))
      && !ignoredKeys.has(skuPlanFactIgnoreKey('all', apiSku))
      && !activeAliasKeys.has(skuPlanFactIgnoreKey(platform, apiSku))
      && !activeAliasKeys.has(skuPlanFactIgnoreKey('all', apiSku));
  });
  const byArticleKey = {};
  items.forEach((item, index) => { if (item.articleKey) byArticleKey[item.articleKey] = index; });
  const problemStateCounts = items.reduce((acc, item) => {
    (item.problemStates || ['ok']).forEach((stateKey) => {
      acc[stateKey] = (acc[stateKey] || 0) + 1;
    });
    return acc;
  }, {});
  if (apiUnmapped.length) problemStateCounts.api_unmapped = apiUnmapped.length;
  if ((previous.duplicateRisks || []).length) problemStateCounts.duplicate_risk = previous.duplicateRisks.length;

  return {
    schema: 'portal-sku-matrix-v1',
    generatedAt: new Date().toISOString(),
    source: {
      ...(previous.source || {}),
      skus: items.length,
      aliases: aliases.length,
      ignored: ignored.length,
      runtimeApplied: true
    },
    summary: {
      ...(previous.summary || {}),
      skuCount: items.length,
      aliasCount: aliases.length,
      ignoredApiSkuCount: ignored.length,
      apiUnmappedCount: apiUnmapped.length,
      missingOwnerCount: items.filter((item) => !item.owner || item.owner === 'Без owner').length,
      problemStateCounts
    },
    problemStates: previous.problemStates || (state.skuMatrix?.problemStates || {}),
    items,
    apiUnmapped,
    duplicateRisks: previous.duplicateRisks || [],
    ignoredApiSku: ignored.map((row) => ({
      platform: skuPlanFactNormalizePlatform(row.platform || 'all') || 'all',
      api_sku: row.api_sku || row.apiSku || row.alias || row.value || '',
      status: row.status || 'ignored',
      note: row.note || ''
    })),
    indexes: {
      byArticleKey,
      aliasToArticleKey
    }
  };
}

async function skuPlanFactSnapshotHash(text = '') {
  if (window.crypto?.subtle && window.TextEncoder) {
    const buffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `fallback-${Math.abs(hash)}`;
}

async function skuPlanFactPostSnapshotRow(row, cfg, brand) {
  const url = `${String(cfg.supabase.url || '').replace(/\/+$/, '')}/rest/v1/portal_data_snapshots?on_conflict=brand,snapshot_key`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: cfg.supabase.anonKey,
      Authorization: `Bearer ${cfg.supabase.anonKey}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify([{ ...row, brand }])
  });
  if (!response.ok) throw new Error(`Supabase ${row.snapshot_key}: HTTP ${response.status} ${await response.text()}`);
}

async function skuPlanFactUpsertSnapshot(snapshotKey, payload) {
  const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
  if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey) throw new Error('Supabase config is not available');
  const brand = typeof currentBrand === 'function' ? currentBrand() : (cfg.brand || 'Алтея');
  const generatedAt = payload?.generatedAt || payload?.updatedAt || new Date().toISOString();
  const payloadText = JSON.stringify(payload);
  const payloadHash = await skuPlanFactSnapshotHash(payloadText);
  const baseRow = {
    snapshot_key: snapshotKey,
    payload,
    payload_hash: payloadHash,
    source: 'portal-ui-sku-alias-import',
    generated_at: generatedAt
  };
  if (JSON.stringify([{ ...baseRow, brand }]).length <= 18000) {
    await skuPlanFactPostSnapshotRow(baseRow, cfg, brand);
    return payloadHash;
  }
  const chunkSize = 12000;
  const chunks = [];
  for (let index = 0; index < payloadText.length; index += chunkSize) chunks.push(payloadText.slice(index, index + chunkSize));
  await skuPlanFactPostSnapshotRow({
    snapshot_key: snapshotKey,
    payload: { chunked: true, encoding: 'utf8-json', chunk_count: chunks.length, generatedAt, payload_hash: payloadHash },
    payload_hash: payloadHash,
    source: 'portal-ui-sku-alias-import',
    generated_at: generatedAt
  }, cfg, brand);
  for (let index = 0; index < chunks.length; index += 1) {
    await skuPlanFactPostSnapshotRow({
      snapshot_key: `${snapshotKey}__part__${String(index + 1).padStart(4, '0')}`,
      payload: chunks[index],
      payload_hash: await skuPlanFactSnapshotHash(`${payloadHash}:${index + 1}:${chunks[index]}`),
      source: 'portal-ui-sku-alias-import',
      generated_at: generatedAt
    }, cfg, brand);
  }
  return payloadHash;
}

function skuPlanFactRenderImportTarget(rootId = 'view-sku-plan-fact') {
  if (rootId === 'view-sku-contour' && typeof renderSkuContour === 'function') {
    renderSkuContour(rootId);
    return;
  }
  renderSkuPlanFact(rootId);
}

async function handleSkuPlanFactApplyAliasImport(button = null, rootId = 'view-sku-plan-fact') {
  const report = state.skuPlanFactAliasImportReport || {};
  if ((report.errorRows || []).length) {
    if (typeof setAppError === 'function') setAppError('В импорте есть ошибки, применение остановлено.');
    return;
  }
  if (!report.aliasPayload && !report.ignorePayload) return;
  const originalText = button?.textContent || '';
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Применяем...';
    }
    const aliasPayload = report.aliasPayload || state.skuAliases || { schema: 'sku-api-aliases-v1', aliases: [] };
    const ignorePayload = report.ignorePayload || state.skuAliasIgnore || { schema: 'sku-api-ignore-v1', ignored: [] };
    state.skuAliases = aliasPayload;
    state.skuAliasIgnore = ignorePayload;
    const appliedAliases = skuPlanFactApplyAliasesToStateSkus(report.aliases || []);
    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    const matrixPayload = skuPlanFactBuildRuntimeSkuMatrix(aliasPayload, ignorePayload);
    state.skuMatrix = matrixPayload;
    const appliedAt = new Date().toISOString();
    const actor = state.team?.member?.name || state.team?.userId || 'portal-user';
    const auditEvent = {
      id: `sku-alias-import-${Date.now()}`,
      type: 'sku_alias_import_apply',
      appliedAt,
      actor,
      fileName: report.fileName || '',
      sourceRows: report.sourceRows || 0,
      aliasesAdded: (report.aliases || []).length,
      ignoresAdded: (report.ignores || []).length,
      duplicateRows: (report.duplicateRows || []).length,
      skippedRows: (report.skippedRows || []).length,
      errorRows: (report.errorRows || []).length,
      validationWarnings: (report.validationWarnings || []).length,
      aliasKeys: (report.aliases || []).slice(0, 50).map((row) => skuPlanFactAliasKey(row)),
      ignoreKeys: (report.ignores || []).slice(0, 50).map((row) => skuPlanFactIgnoreKey(row.platform || 'all', row.api_sku || row.apiSku || ''))
    };
    const auditPayload = skuPlanFactBuildAuditPayload(auditEvent);
    state.skuAliasAudit = auditPayload;
    await skuPlanFactUpsertSnapshot('sku_aliases', aliasPayload);
    await skuPlanFactUpsertSnapshot('sku_alias_ignore', ignorePayload);
    await skuPlanFactUpsertSnapshot('sku_matrix', matrixPayload);
    await skuPlanFactUpsertSnapshot('sku_alias_audit', auditPayload);
    if (typeof window.__alteaResetPortalSnapshotState === 'function') window.__alteaResetPortalSnapshotState();
    state.skuPlanFactAliasImportReport = { ...report, appliedAt, appliedAliases, auditEventId: auditEvent.id };
    skuPlanFactRenderImportTarget(rootId);
    if (typeof setAppError === 'function') {
      setAppError(`Импорт применён: ${fmt.int(report.aliases?.length || 0)} alias, ${fmt.int(report.ignores?.length || 0)} ignore. Матрица обновлена.`);
    }
  } catch (error) {
    console.error('[sku-plan-fact-apply-alias-import]', error);
    if (typeof setAppError === 'function') setAppError(`Не удалось применить импорт: ${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || 'Применить в портал';
    }
  }
}

async function handleSkuPlanFactAliasImport(file, rootId = 'view-sku-plan-fact') {
  if (!file) return;
  try {
    const rows = await skuPlanFactRowsFromReviewFile(file);
    const [currentAliases, currentIgnore] = await Promise.all([
      skuPlanFactLoadJsonFile('data/sku_aliases.json', { schema: 'sku-api-aliases-v1', aliases: [] }, 'SKU aliases'),
      skuPlanFactLoadJsonFile('data/sku_alias_ignore.json', { schema: 'sku-api-ignore-v1', ignored: [] }, 'SKU alias ignore')
    ]);
    const report = skuPlanFactPrepareAliasImport(rows, currentAliases, currentIgnore);
    report.fileName = file.name || '';
    state.skuPlanFactAliasImportReport = report;
    skuPlanFactRenderImportTarget(rootId);
    if (typeof setAppError === 'function') {
      setAppError(report.errorRows.length ? `Импорт проверен: ${report.errorRows.length} ошибок.` : 'Импорт проверен, можно применить в портал или скачать JSON.');
    }
  } catch (error) {
    console.error('[sku-plan-fact-alias-import]', error);
    state.skuPlanFactAliasImportReport = {
      generatedAt: new Date().toISOString(),
      fileName: file.name || '',
      sourceRows: 0,
      candidateAliases: 0,
      candidateIgnores: 0,
      candidateNewSkus: 0,
      candidateNeedCheck: 0,
      validationWarnings: [],
      duplicateRows: [],
      skippedRows: [],
      errorRows: [{ rowNumber: 0, reason: error.message || 'import failed' }],
      newSkuRows: [],
      needCheckRows: [],
      aliases: [],
      ignores: []
    };
    skuPlanFactRenderImportTarget(rootId);
    if (typeof setAppError === 'function') setAppError(`Не удалось разобрать файл: ${error.message}`);
  }
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
    skuPlanFactRenderImportTarget(rootId);
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
  const matrixSummary = typeof skuMatrixSummary === 'function' ? skuMatrixSummary() : {};
  const matrixGeneratedAt = state.skuMatrix?.generatedAt || state.skuMatrix?.updatedAt || '';

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>План-факт SKU</h2>
        <p>Все позиции в одном разрезе: план, факт, средний чек по площадкам, оборачиваемость, реклама и ДРР.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(model.rows.length)} SKU`, 'info')}
        ${badge(`${fmt.int(model.unmappedCount || 0)} API без пары`, model.unmappedCount ? 'warn' : 'ok')}
        ${badge(`${fmt.int(matrixSummary.aliasCount || 0)} alias`, matrixSummary.aliasCount ? 'ok' : '')}
        ${matrixSummary.duplicateRiskCount ? badge(`${fmt.int(matrixSummary.duplicateRiskCount)} риск дубля`, 'danger') : ''}
        ${badge(`матрица ${matrixGeneratedAt ? fmt.date(matrixGeneratedAt) : '—'}`, matrixGeneratedAt ? 'ok' : 'warn')}
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
    ${skuPlanFactReconciliationHtml(model.reconciliation || [])}
    ${skuPlanFactDataQualityHtml(model)}

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
          <option value="unmapped" ${filters.status === 'unmapped' ? 'selected' : ''}>API без пары в реестре</option>
          <option value="matrix_problem" ${filters.status === 'matrix_problem' ? 'selected' : ''}>Проблемы матрицы</option>
          <option value="missing_owner" ${filters.status === 'missing_owner' ? 'selected' : ''}>Матрица: без owner</option>
          <option value="duplicate_risk" ${filters.status === 'duplicate_risk' ? 'selected' : ''}>Риск дубля выручки</option>
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
  root.querySelector('[data-sku-plan-fact-quality-export]')?.addEventListener('click', () => downloadSkuPlanFactQualityExcel(model));
  root.querySelector('[data-sku-plan-fact-quality-import]')?.addEventListener('click', () => {
    root.querySelector('[data-sku-plan-fact-quality-file]')?.click();
  });
  root.querySelector('[data-sku-plan-fact-quality-file]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    await handleSkuPlanFactAliasImport(file, rootId);
  });
  root.querySelector('[data-sku-plan-fact-apply-import]')?.addEventListener('click', async (event) => {
    await handleSkuPlanFactApplyAliasImport(event.currentTarget, rootId);
  });
  root.querySelector('[data-sku-plan-fact-download-aliases]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    if (report.aliasPayload) skuPlanFactDownloadJson('sku_aliases.updated.json', report.aliasPayload);
  });
  root.querySelector('[data-sku-plan-fact-download-ignore]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    if (report.ignorePayload) skuPlanFactDownloadJson('sku_alias_ignore.updated.json', report.ignorePayload);
  });
  root.querySelector('[data-sku-plan-fact-download-import-report]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    const { aliasPayload, ignorePayload, ...publicReport } = report;
    skuPlanFactDownloadJson(`sku-alias-import-report-${todayIso()}.json`, publicReport);
  });
  skuPlanFactRestoreFocus(options.focusState);
}

window.renderSkuPlanFact = renderSkuPlanFact;
window.renderSkuContour = renderSkuContour;
window.skuPlanFactBuildModel = skuPlanFactBuildModel;
window.skuPlanFactExportRows = skuPlanFactExportRows;
window.skuPlanFactExportColumns = skuPlanFactExportColumns;
window.skuPlanFactQualityExportRows = skuPlanFactQualityExportRows;
window.skuPlanFactQualityExportColumns = skuPlanFactQualityExportColumns;
window.skuPlanFactRowsFromReviewFile = skuPlanFactRowsFromReviewFile;
window.skuPlanFactPrepareAliasImport = skuPlanFactPrepareAliasImport;
window.SKU_PLAN_FACT_PLATFORMS = SKU_PLAN_FACT_PLATFORMS;
window.SKU_PLAN_FACT_PLATFORM_LABELS = SKU_PLAN_FACT_PLATFORM_LABELS;
window.SKU_PLAN_FACT_PLATFORM_SUPPORT_KEYS = SKU_PLAN_FACT_PLATFORM_SUPPORT_KEYS;
