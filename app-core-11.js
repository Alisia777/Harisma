const SKU_PLAN_FACT_PLATFORMS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'];
const SKU_PLAN_FACT_PAYROLL_PLATFORMS = ['wb', 'ozon', 'ya'];
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
const SKU_PLAN_FACT_AD_PLAN_PLATFORMS = new Set(['wb', 'ozon']);
const SKU_PLAN_FACT_MARGIN_PLAN_FIELDS = ['planMarginPct', 'plannedMarginPct', 'allowedMarginPct', 'avgMargin7dPct', 'marginTotalPct', 'marginPct'];
const SKU_PLAN_FACT_RECONCILE_OVERAGE_THRESHOLD = 1.15;
const SKU_PLAN_FACT_RECONCILE_MIN_REVENUE = 10000;
const SKU_PLAN_FACT_UNMAPPED_OWNER = 'Не в реестре';
const SKU_PLAN_FACT_UNMAPPED_STATUS = 'API SKU без пары';
const SKU_PLAN_FACT_UNALLOCATED_STATUS = 'Агрегат без SKU';
const SKU_PLAN_FACT_FILTER_VERSION = '20260530-iudrr-truth';
let skuPlanFactSearchTimer = 0;
let skuPlanFactExcelDownloadLockUntil = 0;
let skuPlanFactTruthWarmupPromise = null;

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
    const planToDate = metric?.planAdSpendToDate ?? metric?.planAdSpend;
    return `<div>${escapeHtml(label)} ${fmt.money(metric?.adSpend)} <span class="muted small">/ план к дате ${fmt.money(planToDate)}</span></div>`;
  }).join(' · ');
}

function skuPlanFactFilters() {
  state.skuPlanFactFilters = {
    search: '',
    owner: 'all',
    status: 'all',
    platform: 'all',
    month: 'latest',
    date: '',
    dateFrom: '',
    dateTo: '',
    dateMode: 'latest',
    sort: 'gap',
    sortDir: 'asc',
    ...(state.skuPlanFactFilters || {})
  };
  if (state.skuPlanFactFilters.__truthFilterVersion !== SKU_PLAN_FACT_FILTER_VERSION) {
    if (state.skuPlanFactFilters.status === 'active') state.skuPlanFactFilters.status = 'all';
    state.skuPlanFactFilters.__truthFilterVersion = SKU_PLAN_FACT_FILTER_VERSION;
  }
  if (!['asc', 'desc'].includes(state.skuPlanFactFilters.sortDir)) {
    state.skuPlanFactFilters.sortDir = skuPlanFactDefaultSortDir(state.skuPlanFactFilters.sort);
  }
  return state.skuPlanFactFilters;
}

function skuPlanFactDateKey(value = '') {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function skuPlanFactMonthStart(monthKey = '') {
  return monthKey ? `${monthKey}-01` : '';
}

function skuPlanFactMonthEnd(monthKey = '') {
  return monthKey ? `${monthKey}-${String(skuPlanFactMonthDays(monthKey)).padStart(2, '0')}` : '';
}

function skuPlanFactDateSerial(date = '') {
  const key = skuPlanFactDateKey(date);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function skuPlanFactInclusiveDays(dateFrom = '', dateTo = '') {
  const fromSerial = skuPlanFactDateSerial(dateFrom);
  const toSerial = skuPlanFactDateSerial(dateTo);
  if (fromSerial === null || toSerial === null) return 0;
  return Math.max(1, toSerial - fromSerial + 1);
}

function skuPlanFactClampDateToRange(date = '', minDate = '', maxDate = '') {
  let next = skuPlanFactDateKey(date);
  if (!next) return '';
  if (minDate && next < minDate) next = minDate;
  if (maxDate && next > maxDate) next = maxDate;
  return next;
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

function skuPlanFactHasIuDrrTruth() {
  return Array.isArray(state.iuDrrSummary?.daily) && state.iuDrrSummary.daily.length > 0;
}

function skuPlanFactWarmupTruth(rootId = 'view-sku-plan-fact') {
  if (skuPlanFactHasIuDrrTruth() || skuPlanFactTruthWarmupPromise) return;
  const loader = LAZY_DATA_LOADERS?.skuPlanFact;
  if (typeof loader !== 'function' && typeof ensureViewData !== 'function') return;
  skuPlanFactTruthWarmupPromise = Promise.resolve()
    .then(() => (typeof loader === 'function' ? loader() : ensureViewData('sku-plan-fact')))
    .catch((error) => console.warn('[sku-plan-fact-truth-warmup]', error))
    .finally(() => {
      skuPlanFactTruthWarmupPromise = null;
      if (skuPlanFactHasIuDrrTruth() && state.activeView === 'sku-plan-fact' && document.getElementById(rootId)) {
        renderSkuPlanFact(rootId);
      }
    });
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
  const text = String(value ?? '').trim();
  const lower = text.toLowerCase().replaceAll('ё', 'е');
  const detected = [];
  if (/\bwb\b|wildberries|вб|вайлдбер/i.test(lower)) detected.push('wb');
  if (/\boz\b|\bozon\b|озон/i.test(lower)) detected.push('ozon');
  if (/\bya\b|\bym\b|yandex|яндекс|я\.?маркет|ямаркет/i.test(lower)) detected.push('ya');
  if (/gold\s*apple|золотое\s*яблоко|\bзя\b/i.test(lower)) detected.push('goldapple');
  if (/letu|letual|летуаль/i.test(lower)) detected.push('letu');
  if (/magnit|магнит/i.test(lower)) detected.push('magnit');
  const uniqueDetected = [...new Set(detected)];
  if (uniqueDetected.length > 1) return 'all';
  if (uniqueDetected.length === 1) return uniqueDetected[0];
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

function skuPlanFactUnmappedSkus(indexes = {}, monthKey = '', maxFactDate = '', minFactDate = '') {
  const knownTokens = skuPlanFactKnownSkuTokens();
  const ignoredTokens = skuPlanFactIgnoredSet();
  const result = new Map();
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    skuPlanFactRowsFromIndexMap(indexes.extra?.[platform]).forEach((row) => {
      const token = skuPlanFactArticleToken(row);
      if (!token || knownTokens.has(token) || result.has(token)) return;
      if (skuPlanFactIsIgnored(platform, row.articleKey || row.article || token, ignoredTokens)) return;
      const fact = skuPlanFactFactFromRows([row], monthKey, maxFactDate, minFactDate);
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
  const dateMonth = skuPlanFactMonthFromDate(filters.dateTo || filters.date || filters.dateFrom);
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
  const selected = skuPlanFactDateKey(filters.dateTo || filters.date);
  const monthStart = skuPlanFactMonthStart(monthKey);
  if (selected && skuPlanFactMonthFromDate(selected) === monthKey) {
    if (monthStart && selected < monthStart) return monthStart;
    if (maxDate && selected > maxDate) return maxDate;
    return selected;
  }
  filters.date = maxDate;
  filters.dateTo = maxDate;
  return maxDate;
}

function skuPlanFactElapsedDays(monthKey, maxFactDate) {
  const days = skuPlanFactMonthDays(monthKey);
  const factMonth = skuPlanFactMonthFromDate(maxFactDate);
  if (factMonth === monthKey) return Math.min(days, Math.max(1, Number(String(maxFactDate).slice(8, 10)) || 1));
  return days;
}

function skuPlanFactSelectedPeriod(indexes, monthKey, maxFactDate = '') {
  const filters = skuPlanFactFilters();
  const monthStart = skuPlanFactMonthStart(monthKey);
  const maxDate = maxFactDate || skuPlanFactMaxFactDate(indexes, monthKey);
  let dateTo = skuPlanFactSelectedDate(indexes, monthKey, maxDate);
  let dateFrom = skuPlanFactDateKey(filters.dateFrom);
  if (!dateFrom || skuPlanFactMonthFromDate(dateFrom) !== monthKey) {
    dateFrom = monthStart;
  }
  dateFrom = skuPlanFactClampDateToRange(dateFrom, monthStart, dateTo || maxDate);
  dateTo = skuPlanFactClampDateToRange(dateTo, dateFrom || monthStart, maxDate);
  if (dateFrom && dateTo && dateFrom > dateTo) dateFrom = dateTo;
  filters.dateFrom = dateFrom;
  filters.dateTo = dateTo;
  filters.date = dateTo;
  filters.month = monthKey || (dateTo ? dateTo.slice(0, 7) : filters.month);
  return {
    start: dateFrom,
    end: dateTo,
    days: skuPlanFactInclusiveDays(dateFrom, dateTo) || skuPlanFactElapsedDays(monthKey, dateTo)
  };
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

function skuPlanFactDailyArrayFromMap(map = new Map()) {
  return [...map.entries()]
    .map(([date, value]) => ({
      date,
      revenue: numberOrZero(value?.revenue),
      units: numberOrZero(value?.units)
    }))
    .filter((item) => item.date && (item.revenue > 0 || item.units > 0))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function skuPlanFactFactFromRows(rows = [], monthKey = '', maxFactDate = '', minFactDate = '') {
  const result = { units: 0, revenue: 0, avgCheck: null, source: '', daily: [] };
  const seenDaily = new Set();
  const dailyMap = new Map();
  const monthStart = skuPlanFactMonthStart(monthKey);
  const monthEnd = skuPlanFactMonthEnd(monthKey);
  const allowMonthlyFallback = (!maxFactDate || maxFactDate >= monthEnd) && (!minFactDate || minFactDate <= monthStart);
  rows.forEach((row, rowIndex) => {
    const daily = [...(row.daily || []), ...(row.monthly || [])];
    daily.forEach((item, itemIndex) => {
      const date = String(item?.date || '').slice(0, 10);
      if (date.slice(0, 7) !== monthKey) return;
      if (minFactDate && date < minFactDate) return;
      if (maxFactDate && date > maxFactDate) return;
      const dedupeKey = `${row.articleKey || row.article || rowIndex}|${date}|${itemIndex}|${item.revenue}|${item.ordersUnits}`;
      if (seenDaily.has(dedupeKey)) return;
      seenDaily.add(dedupeKey);
      const units = numberOrZero(item.ordersUnits ?? item.deliveredUnits);
      const revenue = numberOrZero(item.revenue);
      result.units += units;
      result.revenue += revenue;
      const dailyRow = dailyMap.get(date) || { units: 0, revenue: 0 };
      dailyRow.units += units;
      dailyRow.revenue += revenue;
      dailyMap.set(date, dailyRow);
    });
    (row.actualMonths || []).forEach((item) => {
      if (String(item?.monthKey || '').slice(0, 7) !== monthKey) return;
      if (!allowMonthlyFallback) return;
      if (result.revenue > 0 || result.units > 0) return;
      const units = numberOrZero(item.units);
      const revenue = numberOrZero(item.revenue);
      result.units += units;
      result.revenue += revenue;
      const fallbackDate = maxFactDate || monthEnd;
      const dailyRow = dailyMap.get(fallbackDate) || { units: 0, revenue: 0 };
      dailyRow.units += units;
      dailyRow.revenue += revenue;
      dailyMap.set(fallbackDate, dailyRow);
      if (!result.source && item.source) result.source = item.source;
    });
    if (!result.source && row.sourceMode) result.source = row.sourceMode;
  });
  result.avgCheck = result.units > 0 ? result.revenue / result.units : null;
  result.daily = skuPlanFactDailyArrayFromMap(dailyMap);
  return result;
}

function skuPlanFactPlatformTrend(platform = '') {
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  return (state.platformTrends?.platforms || []).find((item) => {
    const key = String(item?.key || '').trim();
    return key === platform || key === supportKey;
  }) || null;
}

function skuPlanFactPlatformAggregateFact(platform = '', monthKey = '', maxFactDate = '', minFactDate = '') {
  const result = { units: 0, revenue: 0 };
  const platformTrend = skuPlanFactPlatformTrend(platform);
  (platformTrend?.series || []).forEach((item) => {
    const date = String(item?.date || item?.label || '').slice(0, 10);
    if (skuPlanFactMonthFromDate(date) !== monthKey) return;
    if (minFactDate && date < minFactDate) return;
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
  if (Array.isArray(metric.factDaily)) {
    metric.factDaily = metric.factDaily.map((item) => ({
      ...item,
      revenue: numberOrZero(item.revenue) * ratio,
      units: numberOrZero(item.units) * ratio
    }));
  }
  metric.reconciledFact = true;
  metric.reconciliationRatio = ratio;
  metric.reconciliation = reconciliation;
  if (!String(metric.source || '').includes('platform-reconciled')) {
    metric.source = [metric.source, 'platform-reconciled'].filter(Boolean).join('+');
  }
}

function skuPlanFactReconcilePlatformFacts(rows = [], monthKey = '', maxFactDate = '', minFactDate = '') {
  const reconciliations = [];
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const aggregate = skuPlanFactPlatformAggregateFact(platform, monthKey, maxFactDate, minFactDate);
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
    planAdSpend: null,
    planAdSpendToDate: null,
    planMonthAdSpend: null,
    planPeriodAdSpend: null,
    adForecastSpend: null,
    adCompletionToDate: null,
    adForecastCompletion: null,
    adGapToDate: null,
    adForecastGap: null,
    adElapsedDays: 0,
    adForecastDays: 0,
    planDrr: null,
    planMonthDrr: null,
    planAdSource: '',
    turnoverDays: null,
    stock: null,
    marginPct: null,
    marginRub: null,
    factMarginPct: null,
    planMarginPct: null,
    planMarginRub: null,
    marginIsPlanFallback: false,
    marginSource: '',
    planMarginSource: '',
    factDaily: [],
    scoreHistory: [],
    completionDelta: null,
    currentPrice: null,
    currentClientPrice: null,
    currentFillPrice: null,
    hasSource: false,
    planPriceProxy: 0,
    hasDirectPlan: false,
    source: ''
  };
}

function skuPlanFactAppendUnallocatedAggregateRows(rows = [], monthKey = '', maxFactDate = '', minFactDate = '') {
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const aggregate = skuPlanFactPlatformAggregateFact(platform, monthKey, maxFactDate, minFactDate);
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

function skuPlanFactRatioOrNull(value) {
  const ratio = skuPlanFactNormalizeRatio(value);
  return ratio === null || !Number.isFinite(Number(ratio)) ? null : ratio;
}

function skuPlanFactPositiveRatioOrNull(value) {
  const ratio = skuPlanFactRatioOrNull(value);
  return ratio !== null && ratio > 0 ? ratio : null;
}

function skuPlanFactFirstRatioFromRows(rows = [], fieldNames = SKU_PLAN_FACT_MARGIN_PLAN_FIELDS) {
  for (const row of rows || []) {
    for (const fieldName of fieldNames) {
      const ratio = skuPlanFactPositiveRatioOrNull(row?.[fieldName]);
      if (ratio !== null) return ratio;
    }
  }
  return null;
}

function skuPlanFactSkuMarginFallback(sku = {}, platform = '') {
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  const direct = skuPlanFactPositiveRatioOrNull(sku?.[platform]?.marginPct)
    ?? skuPlanFactPositiveRatioOrNull(sku?.[supportKey]?.marginPct);
  if (direct !== null) return { value: direct, source: 'sku-platform' };

  const sides = ['wb', 'ozon']
    .map((key) => skuPlanFactPositiveRatioOrNull(sku?.[key]?.marginPct))
    .filter((value) => value !== null && value > 0);
  if (sides.length) {
    return {
      value: sides.reduce((sum, value) => sum + value, 0) / sides.length,
      source: 'sku-marketplace-average'
    };
  }

  const planFactMargin = skuPlanFactPositiveRatioOrNull(sku?.planFact?.factFeb26MarginPct);
  if (planFactMargin !== null) return { value: planFactMargin, source: 'sku-plan-fact-history' };
  return { value: null, source: '' };
}

function skuPlanFactPlanMarginForSku(sku = {}, platform = '', rows = {}) {
  const rowMargin = skuPlanFactFirstRatioFromRows([
    ...(rows.sourceRows || []),
    ...(rows.supportRows || []),
    ...(rows.pricesRows || []),
    ...(rows.overlayRows || []),
    ...(rows.smartRows || [])
  ]);
  if (rowMargin !== null) return { value: rowMargin, source: 'price-economics' };
  return skuPlanFactSkuMarginFallback(sku, platform);
}

function skuPlanFactEffectiveMargin(platform = '', factMargin = null, planMargin = null) {
  const fact = skuPlanFactRatioOrNull(factMargin);
  const plan = skuPlanFactRatioOrNull(planMargin);
  if (fact !== null && (fact > 0 || platform === 'wb' || platform === 'ozon')) {
    return { value: fact, isPlanFallback: false };
  }
  if (plan !== null) return { value: plan, isPlanFallback: true };
  return { value: fact, isPlanFallback: false };
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

function skuPlanFactPayrollCompanyPlan() {
  const plan = state.dashboard?.companyPlan || null;
  if (!plan) return null;
  if (plan.payrollKpiPolicy?.isPayrollCritical) return plan;
  if (plan.planType === 'marketplace_salary_revenue') return plan;
  return null;
}

function skuPlanFactPayrollControlTotals(monthKey = '') {
  const plan = skuPlanFactPayrollCompanyPlan();
  if (!plan || !monthKey) return null;
  const explicit = plan.payrollKpiPolicy?.controlTotals?.[monthKey];
  if (explicit) return explicit;
  const month = plan.months?.[monthKey];
  if (!month) return null;
  return {
    revenue: numberOrZero(month.revenue),
    wb: numberOrZero(month.channels?.wb?.revenue),
    ozon: numberOrZero(month.channels?.ozon?.revenue),
    ya: numberOrZero(month.channels?.ya?.revenue)
  };
}

function skuPlanFactPayrollPlanRevenue(monthKey = '', platform = 'all') {
  const totals = skuPlanFactPayrollControlTotals(monthKey);
  if (!totals) return null;
  if (!platform || platform === 'all') return numberOrZero(totals.revenue);
  if (!SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(platform)) return 0;
  return numberOrZero(totals[platform]);
}

function skuPlanFactPayrollLatestFactDate(monthKey = '') {
  let maxDate = '';
  SKU_PLAN_FACT_PAYROLL_PLATFORMS.forEach((platformKey) => {
    const platform = skuPlanFactPlatformTrend(platformKey);
    (platform?.series || []).forEach((item) => {
      const date = String(item?.date || item?.label || '').slice(0, 10);
      if ((!monthKey || skuPlanFactMonthFromDate(date) === monthKey) && date > maxDate) maxDate = date;
    });
  });
  const activeMonth = skuPlanFactPayrollCompanyPlan()?.activeMonth;
  const activeDate = state.dashboard?.dataFreshness?.asOfDate || state.dashboard?.asOfDate || '';
  if (activeMonth?.monthKey === monthKey && skuPlanFactMonthFromDate(activeDate) === monthKey && activeDate > maxDate) {
    maxDate = activeDate;
  }
  return maxDate;
}

function skuPlanFactPayrollEffectiveEndDate(monthKey = '', periodEnd = '') {
  const selected = skuPlanFactDateKey(periodEnd);
  const latest = skuPlanFactPayrollLatestFactDate(monthKey);
  if (selected && latest) return selected < latest ? selected : latest;
  return selected || latest || skuPlanFactMonthEnd(monthKey);
}

function skuPlanFactPayrollRawFactRevenue(monthKey = '', platform = 'all', periodStart = '', periodEnd = '') {
  const platforms = platform === 'all' || !platform ? SKU_PLAN_FACT_PAYROLL_PLATFORMS : [platform];
  return platforms
    .filter((item) => SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(item))
    .reduce((sum, item) => sum + numberOrZero(skuPlanFactPlatformAggregateFact(item, monthKey, periodEnd, periodStart).revenue), 0);
}

function skuPlanFactPayrollFactControl(monthKey = '', periodStart = '', periodEnd = '') {
  const plan = skuPlanFactPayrollCompanyPlan();
  const activeMonth = plan?.activeMonth;
  if (!activeMonth || activeMonth.monthKey !== monthKey) return null;
  const monthStart = skuPlanFactMonthStart(monthKey);
  const activeDate = skuPlanFactDateKey(state.dashboard?.dataFreshness?.asOfDate || state.dashboard?.asOfDate || '');
  const endDate = skuPlanFactDateKey(periodEnd);
  const startDate = skuPlanFactDateKey(periodStart);
  if (startDate !== monthStart || !activeDate || endDate !== activeDate) return null;
  const fact = numberOrZero(activeMonth.factRevenueToDate);
  return fact > 0 ? fact : null;
}

function skuPlanFactPayrollFactScale(monthKey = '', periodStart = '', periodEnd = '') {
  const control = skuPlanFactPayrollFactControl(monthKey, periodStart, periodEnd);
  if (!control) return null;
  const raw = skuPlanFactPayrollRawFactRevenue(monthKey, 'all', periodStart, periodEnd);
  if (raw <= 0) return null;
  return control / raw;
}

function skuPlanFactPayrollFactRevenue(monthKey = '', platform = 'all', periodStart = '', periodEnd = '') {
  const control = skuPlanFactPayrollFactControl(monthKey, periodStart, periodEnd);
  if ((!platform || platform === 'all') && control) return control;
  const raw = skuPlanFactPayrollRawFactRevenue(monthKey, platform, periodStart, periodEnd);
  const scale = skuPlanFactPayrollFactScale(monthKey, periodStart, periodEnd);
  return scale ? raw * scale : raw;
}

function skuPlanFactPayrollKpiForModel(model = {}) {
  const monthKey = model.monthKey || '';
  const plan = skuPlanFactPayrollCompanyPlan();
  const totals = skuPlanFactPayrollControlTotals(monthKey);
  if (!plan || !totals) return null;
  const selectedPlatform = model.filters?.platform || 'all';
  const salaryIncluded = selectedPlatform === 'all' || SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(selectedPlatform);
  const periodEnd = skuPlanFactPayrollEffectiveEndDate(monthKey, model.periodEnd || model.selectedDate || '');
  const periodStart = skuPlanFactClampDateToRange(model.periodStart || skuPlanFactMonthStart(monthKey), skuPlanFactMonthStart(monthKey), periodEnd);
  const elapsedDays = skuPlanFactInclusiveDays(periodStart, periodEnd) || skuPlanFactElapsedDays(monthKey, periodEnd);
  const monthDays = Math.max(1, skuPlanFactMonthDays(monthKey));
  const platformItems = {};
  SKU_PLAN_FACT_PAYROLL_PLATFORMS.forEach((platform) => {
    const planRevenue = skuPlanFactPayrollPlanRevenue(monthKey, platform);
    const factRevenue = skuPlanFactPayrollFactRevenue(monthKey, platform, periodStart, periodEnd);
    const planToDateRevenue = planRevenue > 0 ? planRevenue * elapsedDays / monthDays : 0;
    platformItems[platform] = {
      platform,
      label: skuPlanFactPlatformLabel(platform),
      salaryIncluded: true,
      planRevenue,
      planToDateRevenue,
      factRevenue,
      completionToDate: planToDateRevenue > 0 ? factRevenue / planToDateRevenue : null,
      completionMonth: planRevenue > 0 ? factRevenue / planRevenue : null,
      gapToDate: factRevenue - planToDateRevenue
    };
  });
  const planRevenue = skuPlanFactPayrollPlanRevenue(monthKey, selectedPlatform);
  const factRevenue = salaryIncluded ? skuPlanFactPayrollFactRevenue(monthKey, selectedPlatform, periodStart, periodEnd) : 0;
  const planToDateRevenue = planRevenue > 0 ? planRevenue * elapsedDays / monthDays : 0;
  return {
    purpose: plan.payrollKpiPolicy?.purpose || 'kpi_salary_calculation',
    isPayrollCritical: true,
    monthKey,
    selectedPlatform,
    salaryIncluded,
    periodStart,
    periodEnd,
    elapsedDays,
    monthDays,
    planRevenue,
    planToDateRevenue,
    factRevenue,
    completionToDate: planToDateRevenue > 0 ? factRevenue / planToDateRevenue : null,
    completionMonth: planRevenue > 0 ? factRevenue / planRevenue : null,
    gapToDate: factRevenue - planToDateRevenue,
    platforms: platformItems,
    excludedPlatforms: SKU_PLAN_FACT_PLATFORMS.filter((platform) => !SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(platform)),
    warning: plan.payrollKpiPolicy?.warning || ''
  };
}

function skuPlanFactPayrollMetricTotals(model = {}, selectedPlatform = 'all') {
  const rows = Array.isArray(model.allRows) ? model.allRows : [];
  const totals = { factRevenue: 0, adSpend: 0, planAdSpend: 0, planMonthAdSpend: 0, planPeriodAdSpend: 0, adForecastSpend: 0, hasPlanAdSpend: false, hasPlanMonthAdSpend: false, hasPlanPeriodAdSpend: false, hasAdForecastSpend: false, marginValue: 0, marginWeight: 0, planMarginValue: 0, planMarginWeight: 0 };
  const platforms = selectedPlatform && selectedPlatform !== 'all'
    ? [selectedPlatform].filter((platform) => SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(platform))
    : SKU_PLAN_FACT_PAYROLL_PLATFORMS;
  rows.forEach((row) => {
    platforms.forEach((platform) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      if (!metric) return;
      totals.factRevenue += numberOrZero(metric.factRevenue);
      totals.adSpend += numberOrZero(metric.adSpend);
      if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
        totals.planAdSpend += numberOrZero(metric.planAdSpend);
        totals.hasPlanAdSpend = true;
      }
      if (metric.planMonthAdSpend !== null && metric.planMonthAdSpend !== undefined) {
        totals.planMonthAdSpend += numberOrZero(metric.planMonthAdSpend);
        totals.hasPlanMonthAdSpend = true;
      }
      if (metric.planPeriodAdSpend !== null && metric.planPeriodAdSpend !== undefined) {
        totals.planPeriodAdSpend += numberOrZero(metric.planPeriodAdSpend);
        totals.hasPlanPeriodAdSpend = true;
      }
      if (metric.adForecastSpend !== null && metric.adForecastSpend !== undefined) {
        totals.adForecastSpend += numberOrZero(metric.adForecastSpend);
        totals.hasAdForecastSpend = true;
      }
      const marginPct = skuPlanFactNormalizeRatio(metric.marginPct);
      const marginWeight = numberOrZero(metric.factRevenue)
        || numberOrZero(metric.planToDateRevenue)
        || numberOrZero(metric.planRevenue);
      if (marginPct !== null && marginWeight > 0) {
        totals.marginValue += marginPct * marginWeight;
        totals.marginWeight += marginWeight;
      }
      const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
      const planMarginWeight = numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue);
      if (planMarginPct !== null && planMarginWeight > 0) {
        totals.planMarginValue += planMarginPct * planMarginWeight;
        totals.planMarginWeight += planMarginWeight;
      }
    });
  });
  totals.marginPct = totals.marginWeight > 0 ? totals.marginValue / totals.marginWeight : null;
  totals.planAdSpend = totals.hasPlanAdSpend ? totals.planAdSpend : null;
  totals.planAdSpendToDate = totals.planAdSpend;
  totals.planMonthAdSpend = totals.hasPlanMonthAdSpend ? totals.planMonthAdSpend : null;
  totals.planPeriodAdSpend = totals.hasPlanPeriodAdSpend ? totals.planPeriodAdSpend : null;
  totals.adForecastSpend = totals.hasAdForecastSpend ? totals.adForecastSpend : null;
  skuPlanFactFinalizeAdPace(totals, model.monthKey || '', model.elapsedDays || model.periodDays || 0, model.periodStart || '');
  totals.planMarginPct = totals.planMarginWeight > 0 ? totals.planMarginValue / totals.planMarginWeight : null;
  return totals;
}

function skuPlanFactApplyPayrollKpiToModel(model = {}) {
  const payroll = skuPlanFactPayrollKpiForModel(model);
  if (!payroll) return model;
  model.payrollKpi = payroll;
  if (!payroll.salaryIncluded) return model;
  const iuDrrControlledSelection = payroll.selectedPlatform === 'all' || payroll.selectedPlatform === 'wb' || payroll.selectedPlatform === 'ozon';
  const hasIuDrrTruth = Boolean(
    model.iuDrrControl?.applied
    || skuPlanFactIuDrrControlTotals('wb', model.monthKey || payroll.monthKey || '', model.periodStart || payroll.periodStart || '', model.periodEnd || payroll.periodEnd || '', false)
    || skuPlanFactIuDrrControlTotals('ozon', model.monthKey || payroll.monthKey || '', model.periodStart || payroll.periodStart || '', model.periodEnd || payroll.periodEnd || '', false)
  );
  if (hasIuDrrTruth && iuDrrControlledSelection) {
    model.payrollKpi.supersededByIuDrr = true;
    model.payrollKpi.truthSource = 'iu_drr_summary';
    const payrollTruth = skuPlanFactPayrollDisplayModel(model);
    if (payrollTruth) {
      model.payrollKpi = payrollTruth;
      model.totals.payrollOriginal = {
        planRevenue: model.totals.planRevenue,
        planToDateRevenue: model.totals.planToDateRevenue,
        factRevenue: model.totals.factRevenue,
        completionToDate: model.totals.completionToDate,
        completionMonth: model.totals.completionMonth,
        gapToDate: model.totals.gapToDate
      };
      model.totals.planRevenue = payrollTruth.planRevenue;
      model.totals.planToDateRevenue = payrollTruth.planToDateRevenue;
      model.totals.factRevenue = payrollTruth.factRevenue;
      model.totals.completionToDate = payrollTruth.completionToDate;
      model.totals.completionMonth = payrollTruth.completionMonth;
      model.totals.gapToDate = payrollTruth.gapToDate;
      model.totals.drr = model.totals.factRevenue > 0 ? numberOrZero(model.totals.adSpend) / model.totals.factRevenue : null;
      skuPlanFactFinalizeAdPace(model.totals, model.monthKey || payroll.monthKey || '', model.elapsedDays || payroll.elapsedDays || 0, model.periodStart || payroll.periodStart || '');
      model.totals.planDrr = model.totals.planToDateRevenue > 0 && model.totals.planAdSpend !== null && model.totals.planAdSpend !== undefined
        ? numberOrZero(model.totals.planAdSpend) / model.totals.planToDateRevenue
        : null;
    }
    return model;
  }
  const rawFactRevenue = numberOrZero(model.totals.factRevenue);
  const rawMarginRub = numberOrZero(model.totals.marginRub);
  const factScale = rawFactRevenue > 0 && payroll.factRevenue > 0 ? payroll.factRevenue / rawFactRevenue : 1;
  const payrollMetricTotals = skuPlanFactPayrollMetricTotals(model, payroll.selectedPlatform || 'all');
  const adSourceTotals = skuPlanFactAdSourceTotals(
    model.monthKey || payroll.monthKey || '',
    payroll.periodEnd || model.periodEnd || model.selectedDate || '',
    payroll.periodStart || model.periodStart || '',
    payroll.selectedPlatform || 'all'
  );
  model.totals.payrollOriginal = {
    planRevenue: model.totals.planRevenue,
    planToDateRevenue: model.totals.planToDateRevenue,
    factRevenue: model.totals.factRevenue,
    adSpend: model.totals.adSpend,
    planAdSpend: model.totals.planAdSpend,
    planDrr: model.totals.planDrr,
    drr: model.totals.drr,
    marginPct: model.totals.marginPct,
    marginRub: model.totals.marginRub,
    planMarginPct: model.totals.planMarginPct,
    planMarginRub: model.totals.planMarginRub,
    completionToDate: model.totals.completionToDate,
    completionMonth: model.totals.completionMonth,
    gapToDate: model.totals.gapToDate
  };
  model.totals.planRevenue = payroll.planRevenue;
  model.totals.planToDateRevenue = payroll.planToDateRevenue;
  model.totals.factRevenue = payroll.factRevenue;
  model.totals.completionToDate = payroll.completionToDate;
  model.totals.completionMonth = payroll.completionMonth;
  model.totals.gapToDate = payroll.gapToDate;
  if (payroll.selectedPlatform && payroll.selectedPlatform !== 'all') {
    model.totals.adSpend = (adSourceTotals.rows > 0 || adSourceTotals.spend > 0)
      ? adSourceTotals.spend
      : payrollMetricTotals.adSpend;
    model.totals.planAdSpend = payrollMetricTotals.planAdSpend;
    model.totals.planMonthAdSpend = payrollMetricTotals.planMonthAdSpend;
    model.totals.planPeriodAdSpend = payrollMetricTotals.planPeriodAdSpend;
  } else if (adSourceTotals.rows > 0 || adSourceTotals.spend > 0) {
    model.totals.adSpend = adSourceTotals.spend;
    if (payrollMetricTotals.planAdSpend !== null) {
      model.totals.planAdSpend = payrollMetricTotals.planAdSpend;
      model.totals.planMonthAdSpend = payrollMetricTotals.planMonthAdSpend;
      model.totals.planPeriodAdSpend = payrollMetricTotals.planPeriodAdSpend;
    }
  }
  if (payrollMetricTotals.marginPct !== null) {
    model.totals.marginPct = payrollMetricTotals.marginPct;
    model.totals.marginRub = model.totals.factRevenue > 0 ? model.totals.factRevenue * payrollMetricTotals.marginPct : null;
  } else if (rawMarginRub > 0 && factScale > 0) {
    model.totals.marginRub = rawMarginRub * factScale;
    model.totals.marginPct = model.totals.factRevenue > 0 ? model.totals.marginRub / model.totals.factRevenue : model.totals.marginPct;
  }
  if (payrollMetricTotals.planMarginPct !== null) {
    model.totals.planMarginPct = payrollMetricTotals.planMarginPct;
    model.totals.planMarginRub = model.totals.planToDateRevenue > 0 ? model.totals.planToDateRevenue * payrollMetricTotals.planMarginPct : null;
  }
  model.totals.drr = model.totals.factRevenue > 0 ? numberOrZero(model.totals.adSpend) / model.totals.factRevenue : null;
  skuPlanFactFinalizeAdPace(model.totals, model.monthKey || payroll.monthKey || '', model.elapsedDays || payroll.elapsedDays || 0, model.periodStart || payroll.periodStart || '');
  model.totals.planDrr = model.totals.planToDateRevenue > 0 && model.totals.planAdSpend !== null && model.totals.planAdSpend !== undefined
    ? numberOrZero(model.totals.planAdSpend) / model.totals.planToDateRevenue
    : null;
  model.totals.payrollSourceTotals = {
    adSpend: adSourceTotals.spend,
    externalAdSpend: adSourceTotals.externalSpend,
    adRows: adSourceTotals.rows,
    planAdSpend: model.totals.planAdSpend,
    planAdSpendToDate: model.totals.planAdSpendToDate,
    planPeriodAdSpend: model.totals.planPeriodAdSpend,
    adForecastSpend: model.totals.adForecastSpend,
    adForecastCompletion: model.totals.adForecastCompletion,
    planDrr: model.totals.planDrr,
    marginPct: payrollMetricTotals.marginPct,
    planMarginPct: payrollMetricTotals.planMarginPct,
    marginWeight: payrollMetricTotals.marginWeight,
    factRevenue: payrollMetricTotals.factRevenue
  };
  return model;
}

function skuPlanFactAdItemIsExternal(item = {}) {
  const channel = String(item.channel || '').toLowerCase();
  const campaignId = String(item.campaignId || '').toLowerCase();
  const campaignName = String(item.campaignName || '').toLowerCase();
  const externalRu = '\u0432\u043d\u0435\u0448';
  return campaignId.startsWith('external-sheet:')
    || channel.includes(externalRu)
    || channel.includes('external')
    || campaignName.includes(externalRu)
    || campaignName.includes('external');
}

function skuPlanFactAdSourceTotals(monthKey = '', maxFactDate = '', minFactDate = '', platformFilter = 'all') {
  const totals = { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0, rows: 0, externalSpend: 0, externalRows: 0 };
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    const date = String(item?.date || '').slice(0, 10);
    if (skuPlanFactMonthFromDate(date) !== monthKey) return;
    if (minFactDate && date < minFactDate) return;
    if (maxFactDate && date > maxFactDate) return;
    const platform = String(item.platformKey || item.platform || 'wb').toLowerCase();
    const normalizedFilter = String(platformFilter || 'all').toLowerCase();
    const supportFilter = skuPlanFactPlatformSupportKey(normalizedFilter);
    if (normalizedFilter && normalizedFilter !== 'all' && platform !== normalizedFilter && platform !== supportFilter) return;
    const spend = numberOrZero(item.spend);
    if (skuPlanFactAdItemIsExternal(item)) {
      totals.externalSpend += spend;
      totals.externalRows += 1;
      return;
    }
    totals.rows += 1;
    totals.spend += spend;
    totals.views += numberOrZero(item.views);
    totals.clicks += numberOrZero(item.clicks);
    totals.orders += numberOrZero(item.orders);
    totals.revenue += numberOrZero(item.revenue);
  });
  return totals;
}

function skuPlanFactAdIndex(monthKey, maxFactDate = '', minFactDate = '') {
  const map = new Map();
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    if (skuPlanFactAdItemIsExternal(item)) return;
    const date = String(item?.date || '').slice(0, 10);
    if (skuPlanFactMonthFromDate(date) !== monthKey) return;
    if (minFactDate && date < minFactDate) return;
    if (maxFactDate && date > maxFactDate) return;
    const platform = String(item.platformKey || item.platform || 'wb').toLowerCase();
    const token = skuPlanFactArticleToken(item);
    if (!token) return;
    const key = `${platform}|${token}`;
    const row = map.get(key) || { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0, daily: new Map() };
    row.spend += numberOrZero(item.spend);
    row.views += numberOrZero(item.views);
    row.clicks += numberOrZero(item.clicks);
    row.orders += numberOrZero(item.orders);
    row.revenue += numberOrZero(item.revenue);
    const dailyRow = row.daily.get(date) || { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
    dailyRow.spend += numberOrZero(item.spend);
    dailyRow.views += numberOrZero(item.views);
    dailyRow.clicks += numberOrZero(item.clicks);
    dailyRow.orders += numberOrZero(item.orders);
    dailyRow.revenue += numberOrZero(item.revenue);
    row.daily.set(date, dailyRow);
    map.set(key, row);
  });
  return map;
}

function skuPlanFactAdForSku(adIndex, platform = '', sku = {}) {
  const result = { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0, daily: [] };
  const dailyMap = new Map();
  skuPlanFactSkuLookupTokens(sku, platform).forEach((token) => {
    const item = adIndex.get(`${platform}|${token}`);
    if (!item) return;
    result.spend += numberOrZero(item.spend);
    result.views += numberOrZero(item.views);
    result.clicks += numberOrZero(item.clicks);
    result.orders += numberOrZero(item.orders);
    result.revenue += numberOrZero(item.revenue);
    (item.daily instanceof Map ? [...item.daily.entries()] : []).forEach(([date, value]) => {
      const dailyRow = dailyMap.get(date) || { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
      dailyRow.spend += numberOrZero(value?.spend);
      dailyRow.views += numberOrZero(value?.views);
      dailyRow.clicks += numberOrZero(value?.clicks);
      dailyRow.orders += numberOrZero(value?.orders);
      dailyRow.revenue += numberOrZero(value?.revenue);
      dailyMap.set(date, dailyRow);
    });
  });
  result.daily = [...dailyMap.entries()]
    .map(([date, value]) => ({ date, ...value }))
    .sort((left, right) => left.date.localeCompare(right.date));
  return result;
}

function skuPlanFactDailyPlanAdValue(item = {}, platform = '') {
  if (platform === 'wb') {
    return numberOrZero(item.planSpendWb ?? item.iuPlanSpendWb ?? item.managementPlanSpendWb ?? item.contractMarketingPlanWb);
  }
  if (platform === 'ozon') {
    return numberOrZero(item.planSpendOzon ?? item.iuPlanSpendOzon ?? item.iuAdsOzonPlan);
  }
  return 0;
}

function skuPlanFactDailyPlanRevenueValue(item = {}, platform = '') {
  if (platform === 'wb') {
    return numberOrZero(item.targetRevenueWb ?? item.iuRevenueWbPlan ?? item.managementTargetRevenueWb ?? item.contractTargetRevenueWb);
  }
  if (platform === 'ozon') {
    return numberOrZero(item.targetRevenueOzon ?? item.iuRevenueOzonPlan);
  }
  return 0;
}

function skuPlanFactKpiPlanAdValue(kpis = {}, platform = '', period = false) {
  if (platform === 'wb') {
    return numberOrZero(period ? (kpis.planSpendWb ?? kpis.iuAdsPlanToDate) : (kpis.iuAdsPlan ?? kpis.planSpendWb));
  }
  if (platform === 'ozon') {
    return numberOrZero(period ? (kpis.planSpendOzon ?? kpis.iuAdsOzonPlanToDate) : (kpis.iuAdsOzonPlan ?? kpis.planSpendOzon));
  }
  return 0;
}

function skuPlanFactKpiPlanRevenueValue(kpis = {}, platform = '', period = false) {
  if (platform === 'wb') {
    return numberOrZero(period ? (kpis.targetRevenueWb ?? kpis.iuRevenueWbPlanToDate) : kpis.iuRevenueWbPlan);
  }
  if (platform === 'ozon') {
    return numberOrZero(period ? (kpis.targetRevenueOzon ?? kpis.iuRevenueOzonPlanToDate) : kpis.iuRevenueOzonPlan);
  }
  return 0;
}

function skuPlanFactPlatformPlanAdTotals(platform = '', monthKey = '', periodStart = '', periodEnd = '', fullMonth = false) {
  if (!SKU_PLAN_FACT_AD_PLAN_PLATFORMS.has(platform)) {
    return { spend: null, revenue: null, drr: null, source: '' };
  }
  const kpis = state.iuDrrSummary?.kpis || {};
  const kpiMonth = String(kpis.monthKey || '').slice(0, 7);
  if (fullMonth && (!kpiMonth || kpiMonth === monthKey)) {
    const kpiSpend = skuPlanFactKpiPlanAdValue(kpis, platform, false);
    const kpiRevenue = skuPlanFactKpiPlanRevenueValue(kpis, platform, false);
    if (kpiSpend > 0 || kpiRevenue > 0) {
      return {
        spend: kpiSpend > 0 ? kpiSpend : null,
        revenue: kpiRevenue > 0 ? kpiRevenue : null,
        drr: kpiSpend > 0 && kpiRevenue > 0 ? kpiSpend / kpiRevenue : null,
        source: 'iu_drr_summary.kpis'
      };
    }
  }
  const start = fullMonth ? skuPlanFactMonthStart(monthKey) : (skuPlanFactDateKey(periodStart) || skuPlanFactMonthStart(monthKey));
  const end = fullMonth ? skuPlanFactMonthEnd(monthKey) : (skuPlanFactDateKey(periodEnd) || skuPlanFactMonthEnd(monthKey));
  let spend = 0;
  let revenue = 0;
  let rows = 0;
  (state.iuDrrSummary?.daily || []).forEach((item) => {
    const date = skuPlanFactDateKey(item?.date);
    if (skuPlanFactMonthFromDate(date) !== monthKey) return;
    if (start && date < start) return;
    if (end && date > end) return;
    const dailySpend = skuPlanFactDailyPlanAdValue(item, platform);
    const dailyRevenue = skuPlanFactDailyPlanRevenueValue(item, platform);
    if (dailySpend > 0 || dailyRevenue > 0) rows += 1;
    spend += dailySpend;
    revenue += dailyRevenue;
  });
  if (spend > 0 || revenue > 0) {
    return {
      spend,
      revenue,
      drr: revenue > 0 ? spend / revenue : null,
      source: 'iu_drr_summary.daily'
    };
  }
  if (kpiMonth && kpiMonth !== monthKey) return { spend: null, revenue: null, drr: null, source: '' };
  const kpiSpend = skuPlanFactKpiPlanAdValue(kpis, platform, !fullMonth);
  const kpiRevenue = skuPlanFactKpiPlanRevenueValue(kpis, platform, !fullMonth);
  if (kpiSpend > 0 || kpiRevenue > 0) {
    return {
      spend: kpiSpend > 0 ? kpiSpend : null,
      revenue: kpiRevenue > 0 ? kpiRevenue : null,
      drr: kpiSpend > 0 && kpiRevenue > 0 ? kpiSpend / kpiRevenue : null,
      source: 'iu_drr_summary.kpis'
    };
  }
  return { spend: null, revenue: null, drr: null, source: '' };
}

function skuPlanFactIuDrrDailyValue(item = {}, platform = '', field = '') {
  if (platform === 'wb') {
    if (field === 'planRevenue') return numberOrZero(item.targetRevenueWb ?? item.iuTargetRevenueWb ?? item.iuRevenueWbPlan);
    if (field === 'factRevenue') return numberOrZero(item.iuRevenueWb ?? item.revenueWb);
    if (field === 'planAds') return numberOrZero(item.planSpendWb ?? item.iuPlanSpendWb ?? item.managementPlanSpendWb ?? item.contractMarketingPlanWb);
    if (field === 'factAds') return numberOrZero(item.spendFact ?? item.spendFactDrr);
  }
  if (platform === 'ozon') {
    if (field === 'planRevenue') return numberOrZero(item.targetRevenueOzon ?? item.iuRevenueOzonPlan);
    if (field === 'factRevenue') return numberOrZero(item.revenueOzon);
    if (field === 'planAds') return numberOrZero(item.planSpendOzon ?? item.iuAdsOzonPlan);
    if (field === 'factAds') return numberOrZero(item.spendFactOzon);
  }
  return 0;
}

function skuPlanFactIuDrrControlTotals(platform = '', monthKey = '', periodStart = '', periodEnd = '', fullMonth = false) {
  if (!SKU_PLAN_FACT_AD_PLAN_PLATFORMS.has(platform)) return null;
  const kpis = state.iuDrrSummary?.kpis || {};
  const kpiMonth = String(kpis.monthKey || '').slice(0, 7);
  if (fullMonth && (!kpiMonth || kpiMonth === monthKey)) {
    const planRevenue = skuPlanFactKpiPlanRevenueValue(kpis, platform, false);
    const planAdSpend = skuPlanFactKpiPlanAdValue(kpis, platform, false);
    const factRevenue = platform === 'wb'
      ? numberOrZero(kpis.iuRevenueWbFactToDate ?? kpis.revenueWb)
      : numberOrZero(kpis.iuRevenueOzonFactToDate ?? kpis.revenueOzon);
    const adSpend = platform === 'wb'
      ? numberOrZero(kpis.iuAdsFactWbToDate ?? kpis.spendFact)
      : numberOrZero(kpis.iuAdsFactOzonToDate ?? kpis.spendFactOzon);
    if (planRevenue > 0 || factRevenue > 0 || planAdSpend > 0 || adSpend > 0) {
      return {
        planRevenue,
        factRevenue,
        planAdSpend,
        adSpend,
        rows: 0,
        source: 'iu_drr_summary.kpis',
        planDrr: planRevenue > 0 ? planAdSpend / planRevenue : null,
        drr: factRevenue > 0 ? adSpend / factRevenue : null
      };
    }
  }
  const start = fullMonth ? skuPlanFactMonthStart(monthKey) : (skuPlanFactDateKey(periodStart) || skuPlanFactMonthStart(monthKey));
  const end = fullMonth ? skuPlanFactMonthEnd(monthKey) : (skuPlanFactDateKey(periodEnd) || skuPlanFactMonthEnd(monthKey));
  const dailyRows = (state.iuDrrSummary?.daily || []).filter((item) => {
    const date = skuPlanFactDateKey(item?.date);
    return skuPlanFactMonthFromDate(date) === monthKey
      && (!start || date >= start)
      && (!end || date <= end);
  });
  const totals = dailyRows.reduce((acc, item) => {
    acc.planRevenue += skuPlanFactIuDrrDailyValue(item, platform, 'planRevenue');
    acc.factRevenue += skuPlanFactIuDrrDailyValue(item, platform, 'factRevenue');
    acc.planAdSpend += skuPlanFactIuDrrDailyValue(item, platform, 'planAds');
    acc.adSpend += skuPlanFactIuDrrDailyValue(item, platform, 'factAds');
    return acc;
  }, { planRevenue: 0, factRevenue: 0, planAdSpend: 0, adSpend: 0 });
  if (dailyRows.length) {
    return {
      ...totals,
      rows: dailyRows.length,
      source: 'iu_drr_summary.daily',
      planDrr: totals.planRevenue > 0 ? totals.planAdSpend / totals.planRevenue : null,
      drr: totals.factRevenue > 0 ? totals.adSpend / totals.factRevenue : null
    };
  }
  if (kpiMonth && kpiMonth !== monthKey) return null;
  const planRevenue = skuPlanFactKpiPlanRevenueValue(kpis, platform, !fullMonth);
  const planAdSpend = skuPlanFactKpiPlanAdValue(kpis, platform, !fullMonth);
  const factRevenue = platform === 'wb'
    ? numberOrZero(kpis.iuRevenueWbFactToDate ?? kpis.revenueWb)
    : numberOrZero(kpis.iuRevenueOzonFactToDate ?? kpis.revenueOzon);
  const adSpend = platform === 'wb'
    ? numberOrZero(kpis.iuAdsFactWbToDate ?? kpis.spendFact)
    : numberOrZero(kpis.iuAdsFactOzonToDate ?? kpis.spendFactOzon);
  if (planRevenue > 0 || factRevenue > 0 || planAdSpend > 0 || adSpend > 0) {
    return {
      planRevenue,
      factRevenue,
      planAdSpend,
      adSpend,
      rows: 0,
      source: 'iu_drr_summary.kpis',
      planDrr: planRevenue > 0 ? planAdSpend / planRevenue : null,
      drr: factRevenue > 0 ? adSpend / factRevenue : null
    };
  }
  return null;
}

function skuPlanFactScaleControlledMetric(metric = null, scale = {}, source = '') {
  if (!metric || typeof metric !== 'object') return;
  const factRatio = Number.isFinite(scale.factRevenue) ? scale.factRevenue : 1;
  const planRatio = Number.isFinite(scale.planRevenue) ? scale.planRevenue : 1;
  const periodPlanRatio = Number.isFinite(scale.planToDateRevenue) ? scale.planToDateRevenue : planRatio;
  const adRatio = Number.isFinite(scale.adSpend) ? scale.adSpend : 1;
  const planAdRatio = Number.isFinite(scale.planAdSpend) ? scale.planAdSpend : 1;
  metric.factRevenue = numberOrZero(metric.factRevenue) * factRatio;
  metric.factUnits = numberOrZero(metric.factUnits) * factRatio;
  metric.planRevenue = numberOrZero(metric.planRevenue) * planRatio;
  metric.planUnits = numberOrZero(metric.planUnits) * planRatio;
  metric.iuControlPlanToDateRevenue = numberOrZero(metric.planToDateRevenue) * periodPlanRatio;
  metric.iuControlPlanToDateUnits = numberOrZero(metric.planToDateUnits) * periodPlanRatio;
  metric.adSpend = numberOrZero(metric.adSpend) * adRatio;
  metric.planAdSpend = metric.planAdSpend === null || metric.planAdSpend === undefined
    ? metric.planAdSpend
    : numberOrZero(metric.planAdSpend) * planAdRatio;
  metric.planMonthAdSpend = metric.planMonthAdSpend === null || metric.planMonthAdSpend === undefined
    ? metric.planMonthAdSpend
    : numberOrZero(metric.planMonthAdSpend) * planAdRatio;
  metric.planAdSpendToDate = null;
  metric.planPeriodAdSpend = null;
  metric.adForecastSpend = null;
  metric.adCompletionToDate = null;
  metric.adForecastCompletion = null;
  metric.adGapToDate = null;
  metric.adForecastGap = null;
  if (Array.isArray(metric.factDaily)) {
    metric.factDaily = metric.factDaily.map((item) => ({
      ...item,
      revenue: numberOrZero(item.revenue) * factRatio,
      units: numberOrZero(item.units) * factRatio
    }));
  }
  metric.factAvgCheck = metric.factUnits > 0 ? metric.factRevenue / metric.factUnits : metric.factAvgCheck;
  metric.iuDrrControlApplied = true;
  metric.iuDrrControlSource = source;
}

function skuPlanFactApplyIuDrrControl(rows = [], monthKey = '', periodStart = '', periodEnd = '') {
  const result = { applied: false, platforms: {} };
  SKU_PLAN_FACT_AD_PLAN_PLATFORMS.forEach((platform) => {
    const periodControl = skuPlanFactIuDrrControlTotals(platform, monthKey, periodStart, periodEnd, false);
    const monthControl = skuPlanFactIuDrrControlTotals(platform, monthKey, periodStart, periodEnd, true);
    if (!periodControl && !monthControl) return;
    const metrics = (rows || [])
      .map((row) => row.platforms?.[platform] || row[platform] || null)
      .filter((metric) => metric && skuPlanFactPlatformHasActivity(metric));
    if (!metrics.length) return;
    const raw = metrics.reduce((acc, metric) => {
      acc.planRevenue += numberOrZero(metric.planRevenue);
      acc.planToDateRevenue += numberOrZero(metric.planToDateRevenue);
      acc.factRevenue += numberOrZero(metric.factRevenue);
      acc.adSpend += numberOrZero(metric.adSpend);
      if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
        acc.planAdSpend += numberOrZero(metric.planAdSpend);
        acc.hasPlanAdSpend = true;
      }
      return acc;
    }, { planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, adSpend: 0, planAdSpend: 0, hasPlanAdSpend: false });
    const target = {
      planRevenue: numberOrZero(monthControl?.planRevenue) || numberOrZero(periodControl?.planRevenue),
      planToDateRevenue: numberOrZero(periodControl?.planRevenue),
      factRevenue: numberOrZero(periodControl?.factRevenue),
      adSpend: numberOrZero(periodControl?.adSpend),
      planAdSpend: numberOrZero(periodControl?.planAdSpend)
    };
    const scale = {
      planRevenue: raw.planRevenue > 0 && target.planRevenue > 0 ? target.planRevenue / raw.planRevenue : 1,
      planToDateRevenue: raw.planToDateRevenue > 0 && target.planToDateRevenue > 0 ? target.planToDateRevenue / raw.planToDateRevenue : 1,
      factRevenue: raw.factRevenue > 0 && target.factRevenue > 0 ? target.factRevenue / raw.factRevenue : 1,
      adSpend: raw.adSpend > 0 && target.adSpend > 0 ? target.adSpend / raw.adSpend : 1,
      planAdSpend: raw.planAdSpend > 0 && target.planAdSpend > 0 ? target.planAdSpend / raw.planAdSpend : 1
    };
    const applied = Object.values(scale).some((value) => Number.isFinite(value) && Math.abs(value - 1) > 0.0001);
    if (!applied) return;
    metrics.forEach((metric) => skuPlanFactScaleControlledMetric(metric, scale, periodControl?.source || monthControl?.source || 'iu_drr_summary'));
    result.applied = true;
    result.platforms[platform] = { raw, target, scale, source: periodControl?.source || monthControl?.source || 'iu_drr_summary' };
  });
  return result;
}

function skuPlanFactPlanAdTotalsByPlatform(monthKey = '', periodStart = '', periodEnd = '') {
  return SKU_PLAN_FACT_PLATFORMS.reduce((acc, platform) => {
    acc[platform] = skuPlanFactPlatformPlanAdTotals(platform, monthKey, periodStart, periodEnd, false);
    return acc;
  }, {});
}

function skuPlanFactApplyIuRevenueFloors(rows = [], monthKey = '', periodStart = '', periodEnd = '') {
  SKU_PLAN_FACT_AD_PLAN_PLATFORMS.forEach((platform) => {
    const periodPlan = skuPlanFactPlatformPlanAdTotals(platform, monthKey, periodStart, periodEnd, false);
    const monthPlan = skuPlanFactPlatformPlanAdTotals(platform, monthKey, periodStart, periodEnd, true);
    const kpis = state.iuDrrSummary?.kpis || {};
    const kpiMonth = String(kpis.monthKey || '').slice(0, 7);
    const periodFloor = Math.max(
      numberOrZero(periodPlan.revenue),
      kpiMonth === monthKey ? skuPlanFactKpiPlanRevenueValue(kpis, platform, true) : 0
    );
    const monthFloor = Math.max(
      numberOrZero(monthPlan.revenue),
      kpiMonth === monthKey ? skuPlanFactKpiPlanRevenueValue(kpis, platform, false) : 0
    );
    if (periodFloor <= 0 && monthFloor <= 0) return;
    const metrics = (rows || [])
      .map((row) => row.platforms?.[platform] || row[platform] || null)
      .filter((metric) => metric && skuPlanFactPlatformHasActivity(metric));
    if (!metrics.length) return;
    const currentPeriod = metrics.reduce((sum, metric) => sum + numberOrZero(metric.planToDateRevenue), 0);
    const currentMonth = metrics.reduce((sum, metric) => sum + numberOrZero(metric.planRevenue), 0);
    const periodScale = periodFloor > 0 && currentPeriod > 0 && currentPeriod + 1 < periodFloor
      ? periodFloor / currentPeriod
      : 1;
    const monthScale = monthFloor > 0 && currentMonth > 0 && currentMonth + 1 < monthFloor
      ? monthFloor / currentMonth
      : 1;
    const scale = Math.max(periodScale, monthScale);
    if (!Number.isFinite(scale) || scale <= 1) return;
    metrics.forEach((metric) => {
      metric.planRevenue = numberOrZero(metric.planRevenue) * scale;
      metric.planToDateRevenue = numberOrZero(metric.planToDateRevenue) * scale;
      metric.planUnits = numberOrZero(metric.planUnits) * scale;
      metric.planToDateUnits = numberOrZero(metric.planToDateUnits) * scale;
      metric.iuRevenueFloorApplied = true;
      metric.iuRevenueFloorSource = periodPlan.source || monthPlan.source || '';
      metric.completionToDate = metric.planToDateRevenue > 0 ? numberOrZero(metric.factRevenue) / metric.planToDateRevenue : null;
      metric.completionMonth = metric.planRevenue > 0 ? numberOrZero(metric.factRevenue) / metric.planRevenue : null;
      metric.gapToDate = numberOrZero(metric.factRevenue) - metric.planToDateRevenue;
      const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
      metric.planMarginRub = planMarginPct === null ? null : metric.planToDateRevenue * planMarginPct;
    });
  });
}

function skuPlanFactAdForecastDays(monthKey = '', elapsedDays = 0, periodStart = '') {
  const observedDays = Math.max(1, Math.round(numberOrZero(elapsedDays)) || 1);
  const monthDays = Math.max(1, skuPlanFactMonthDays(monthKey));
  const start = skuPlanFactDateKey(periodStart);
  if (start && start !== skuPlanFactMonthStart(monthKey)) return observedDays;
  return monthDays;
}

function skuPlanFactFinalizeAdPace(metric = {}, monthKey = '', elapsedDays = 0, periodStart = '') {
  if (!metric || typeof metric !== 'object') return metric;
  const observedDays = Math.max(1, Math.round(numberOrZero(elapsedDays)) || 1);
  const forecastDays = skuPlanFactAdForecastDays(monthKey, observedDays, periodStart);
  const hasPlanToDate = metric.planAdSpend !== null && metric.planAdSpend !== undefined;
  const hasMonthPlan = metric.planMonthAdSpend !== null && metric.planMonthAdSpend !== undefined;
  const hasPeriodPlan = metric.planPeriodAdSpend !== null && metric.planPeriodAdSpend !== undefined;
  const planToDate = hasPlanToDate ? numberOrZero(metric.planAdSpend) : null;
  const monthPlan = hasMonthPlan ? numberOrZero(metric.planMonthAdSpend) : null;
  const existingPeriodPlan = hasPeriodPlan ? numberOrZero(metric.planPeriodAdSpend) : null;
  const derivedPeriodPlan = planToDate !== null && observedDays > 0
    ? planToDate * forecastDays / observedDays
    : null;
  const planPeriod = existingPeriodPlan !== null
    ? existingPeriodPlan
    : (monthPlan !== null ? monthPlan : (forecastDays > observedDays ? derivedPeriodPlan : planToDate));
  const adSpend = numberOrZero(metric.adSpend);
  const hasAdContext = adSpend > 0 || planToDate !== null || planPeriod !== null;
  const forecastSpend = hasAdContext ? adSpend * forecastDays / observedDays : null;

  metric.planAdSpendToDate = planToDate;
  metric.planPeriodAdSpend = planPeriod;
  metric.adElapsedDays = hasAdContext ? observedDays : 0;
  metric.adForecastDays = hasAdContext ? forecastDays : 0;
  metric.adForecastSpend = forecastSpend;
  metric.adCompletionToDate = planToDate !== null && planToDate > 0 ? adSpend / planToDate : null;
  metric.adForecastCompletion = planPeriod !== null && planPeriod > 0 && forecastSpend !== null ? forecastSpend / planPeriod : null;
  metric.adGapToDate = planToDate !== null ? adSpend - planToDate : null;
  metric.adForecastGap = planPeriod !== null && forecastSpend !== null ? forecastSpend - planPeriod : null;
  return metric;
}

function skuPlanFactApplyPlannedAdSpend(rows = [], monthKey = '', periodStart = '', periodEnd = '') {
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const periodPlan = skuPlanFactPlatformPlanAdTotals(platform, monthKey, periodStart, periodEnd, false);
    const monthPlan = skuPlanFactPlatformPlanAdTotals(platform, monthKey, periodStart, periodEnd, true);
    const hasPeriodPlan = periodPlan.spend !== null || periodPlan.drr !== null;
    const hasMonthPlan = monthPlan.spend !== null || monthPlan.drr !== null;
    const metrics = (rows || [])
      .map((row) => row.platforms?.[platform] || row[platform] || null)
      .filter((metric) => metric && skuPlanFactPlatformHasActivity(metric));

    const periodWeightSum = metrics.reduce((sum, metric) => (
      sum + (numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue) || numberOrZero(metric.factRevenue))
    ), 0);
    const monthWeightSum = metrics.reduce((sum, metric) => (
      sum + (numberOrZero(metric.planRevenue) || numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.factRevenue))
    ), 0);

    metrics.forEach((metric) => {
      const periodWeight = numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue) || numberOrZero(metric.factRevenue);
      const monthWeight = numberOrZero(metric.planRevenue) || numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.factRevenue);
      metric.planAdSpend = hasPeriodPlan && periodPlan.spend !== null && periodWeightSum > 0
        ? periodPlan.spend * periodWeight / periodWeightSum
        : null;
      metric.planMonthAdSpend = hasMonthPlan && monthPlan.spend !== null && monthWeightSum > 0
        ? monthPlan.spend * monthWeight / monthWeightSum
        : null;
      metric.planDrr = periodPlan.drr !== null ? periodPlan.drr : null;
      metric.planMonthDrr = monthPlan.drr !== null ? monthPlan.drr : null;
      metric.planAdSource = periodPlan.source || monthPlan.source || '';
    });
  });
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

function skuPlanFactPeriodDayIndex(date = '', monthKey = '', periodStart = '') {
  const start = skuPlanFactDateKey(periodStart);
  const key = skuPlanFactDateKey(date);
  if (start && key && skuPlanFactMonthFromDate(start) === monthKey && skuPlanFactMonthFromDate(key) === monthKey) {
    return skuPlanFactInclusiveDays(start, key);
  }
  const monthDays = Math.max(1, skuPlanFactMonthDays(monthKey));
  return Math.min(monthDays, Math.max(1, Number(String(key || date || '').slice(8, 10)) || 1));
}

function skuPlanFactBuildScoreHistory(metric = {}, monthKey = '', periodStart = '', periodEnd = '') {
  const start = skuPlanFactDateKey(periodStart);
  const end = skuPlanFactDateKey(periodEnd);
  const daily = (Array.isArray(metric.factDaily) ? metric.factDaily : [])
    .filter((item) => {
      const date = skuPlanFactDateKey(item?.date);
      if (!date) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  if (!daily.length) {
    return metric.factRevenue > 0 || metric.planToDateRevenue > 0
      ? [{
        date: end || (monthKey ? `${monthKey}-${String(Math.max(1, Math.round(metric.planToDateRevenue > 0 && metric.planRevenue > 0 ? metric.planToDateRevenue / metric.planRevenue * skuPlanFactMonthDays(monthKey) : 1))).padStart(2, '0')}` : ''),
        revenue: numberOrZero(metric.factRevenue),
        units: numberOrZero(metric.factUnits),
        planToDateRevenue: numberOrZero(metric.planToDateRevenue),
        completionToDate: metric.completionToDate ?? null
      }]
      : [];
  }
  const monthDays = Math.max(1, skuPlanFactMonthDays(monthKey));
  let revenue = 0;
  let units = 0;
  return daily.map((item) => {
    revenue += numberOrZero(item.revenue);
    units += numberOrZero(item.units);
    const day = skuPlanFactPeriodDayIndex(item.date || '', monthKey, start);
    const planToDateRevenue = numberOrZero(metric.planRevenue) > 0 ? numberOrZero(metric.planRevenue) * day / monthDays : 0;
    return {
      date: item.date || '',
      revenue,
      units,
      planToDateRevenue,
      completionToDate: planToDateRevenue > 0 ? revenue / planToDateRevenue : null
    };
  });
}

function skuPlanFactCompletionDelta(history = []) {
  const points = (history || []).filter((item) => item.completionToDate !== null && item.completionToDate !== undefined);
  if (points.length < 2) return null;
  return points[points.length - 1].completionToDate - points[points.length - 2].completionToDate;
}

function skuPlanFactMergeDailyIntoMap(map = new Map(), daily = [], scale = 1) {
  (daily || []).forEach((item) => {
    const date = String(item?.date || '').slice(0, 10);
    if (!date) return;
    const row = map.get(date) || { units: 0, revenue: 0 };
    row.units += numberOrZero(item.units) * scale;
    row.revenue += numberOrZero(item.revenue) * scale;
    map.set(date, row);
  });
  return map;
}

function skuPlanFactFinalizePlatformMetric(metric = {}, monthKey = '', elapsedDays = 0, periodStart = '', periodEnd = '') {
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
  const controlledPlanToDateRevenue = Number(metric.iuControlPlanToDateRevenue);
  const controlledPlanToDateUnits = Number(metric.iuControlPlanToDateUnits);
  metric.planToDateUnits = Number.isFinite(controlledPlanToDateUnits)
    ? controlledPlanToDateUnits
    : (metric.planUnits > 0 ? metric.planUnits * elapsedDays / days : 0);
  metric.planToDateRevenue = Number.isFinite(controlledPlanToDateRevenue)
    ? controlledPlanToDateRevenue
    : (metric.planRevenue > 0 ? metric.planRevenue * elapsedDays / days : 0);
  metric.completionToDate = metric.planToDateRevenue > 0 ? metric.factRevenue / metric.planToDateRevenue : null;
  metric.completionMonth = metric.planRevenue > 0 ? metric.factRevenue / metric.planRevenue : null;
  metric.gapToDate = metric.factRevenue - metric.planToDateRevenue;
  metric.drr = metric.factRevenue > 0 ? metric.adSpend / metric.factRevenue : null;
  metric.adsDrr = metric.adRevenue > 0 ? metric.adSpend / metric.adRevenue : null;
  metric.marginPct = skuPlanFactNormalizeRatio(metric.marginPct);
  metric.marginRub = metric.marginPct === null ? null : metric.factRevenue * metric.marginPct;
  metric.factMarginPct = skuPlanFactNormalizeRatio(metric.factMarginPct);
  metric.planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
  metric.planMarginRub = metric.planMarginPct === null ? null : metric.planToDateRevenue * metric.planMarginPct;
  metric.planAdSpend = metric.planAdSpend === null || metric.planAdSpend === undefined ? null : numberOrZero(metric.planAdSpend);
  metric.planMonthAdSpend = metric.planMonthAdSpend === null || metric.planMonthAdSpend === undefined ? null : numberOrZero(metric.planMonthAdSpend);
  skuPlanFactFinalizeAdPace(metric, monthKey, elapsedDays, periodStart);
  metric.planDrr = skuPlanFactNormalizeRatio(metric.planDrr);
  metric.planMonthDrr = skuPlanFactNormalizeRatio(metric.planMonthDrr);
  metric.scoreHistory = skuPlanFactBuildScoreHistory(metric, monthKey, periodStart, periodEnd);
  metric.completionDelta = skuPlanFactCompletionDelta(metric.scoreHistory);
  return metric;
}

function skuPlanFactAllocatePlatformPlan(rows = [], monthKey = '', platform = '', elapsedDays = 0, periodStart = '', periodEnd = '') {
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
    skuPlanFactFinalizePlatformMetric(metric, monthKey, elapsedDays, periodStart, periodEnd);
  });
}

function skuPlanFactPlatformMetrics(sku, platform, monthKey, indexes, adIndex, elapsedDays, maxFactDate = '', minFactDate = '') {
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
  const fact = skuPlanFactFactFromRows(factRows, monthKey, maxFactDate, minFactDate);
  const ad = skuPlanFactAdForSku(adIndex, platform, sku);
  const planToDateRevenue = plan.revenue > 0 ? plan.revenue * elapsedDays / Math.max(1, plan.days) : 0;
  const planToDateUnits = plan.units > 0 ? plan.units * elapsedDays / Math.max(1, plan.days) : 0;
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  const fallbackSide = sku?.[platform] || sku?.[supportKey] || {};
  const turnoverDays = skuPlanFactLatestMetric(sourceRows, ['turnoverCurrentDays', 'turnoverDays'])
    ?? (Number.isFinite(Number(fallbackSide.turnoverDays)) ? Number(fallbackSide.turnoverDays) : null);
  const stock = skuPlanFactLatestMetric(sourceRows, ['stock', 'stockRepricer'])
    ?? (Number.isFinite(Number(fallbackSide.stock)) ? Number(fallbackSide.stock) : null);
  const factMarginPct = skuPlanFactLatestMetric(sourceRows, ['avgMargin7dPct', 'marginTotalPct', 'marginPct'])
    ?? (Number.isFinite(Number(fallbackSide.marginPct)) ? Number(fallbackSide.marginPct) : null);
  const planMargin = skuPlanFactPlanMarginForSku(sku, platform, { sourceRows, supportRows, pricesRows, overlayRows, smartRows });
  if (planMargin.value === null) {
    const siblingPriceRows = SKU_PLAN_FACT_PLATFORMS
      .filter((item) => item !== platform)
      .flatMap((item) => skuPlanFactRowsForSkuIndex(indexes.prices?.[item], sku, item));
    const siblingMargin = skuPlanFactFirstRatioFromRows(siblingPriceRows);
    if (siblingMargin !== null) {
      planMargin.value = siblingMargin;
      planMargin.source = 'cross-platform-price-economics';
    }
  }
  const effectiveMargin = skuPlanFactEffectiveMargin(platform, factMarginPct, planMargin.value);
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
    factDaily: fact.daily || [],
    completionToDate: planToDateRevenue > 0 ? fact.revenue / planToDateRevenue : null,
    completionMonth: plan.revenue > 0 ? fact.revenue / plan.revenue : null,
    gapToDate: fact.revenue - planToDateRevenue,
    adSpend: ad.spend,
    adViews: ad.views,
    adClicks: ad.clicks,
    adOrders: ad.orders,
    adRevenue: ad.revenue,
    adDaily: ad.daily || [],
    drr: fact.revenue > 0 ? ad.spend / fact.revenue : null,
    adsDrr: ad.revenue > 0 ? ad.spend / ad.revenue : null,
    turnoverDays,
    stock,
    factMarginPct: skuPlanFactRatioOrNull(factMarginPct),
    marginPct: effectiveMargin.value,
    planMarginPct: planMargin.value,
    planMarginRub: planMargin.value === null ? null : planToDateRevenue * planMargin.value,
    marginIsPlanFallback: effectiveMargin.isPlanFallback,
    marginSource: effectiveMargin.isPlanFallback ? (planMargin.source || 'plan-margin') : 'fact-margin',
    planMarginSource: planMargin.source || '',
    currentPrice,
    currentClientPrice,
    currentFillPrice: currentPrice,
    hasSource: Boolean(sourceRows.length || factRows.length || planRows.length || Number(currentPrice) > 0 || Number(currentClientPrice) > 0 || Number(stock) > 0 || Number(ad.spend) > 0),
    planPriceProxy: priceProxy,
    hasDirectPlan: Boolean(SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS.has(platform) && (plan.units > 0 || plan.revenue > 0)),
    source: fact.source || plan.source || ''
  };
}

function skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays, maxFactDate = '', minFactDate = '') {
  const platforms = {};
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    platforms[platform] = skuPlanFactFinalizePlatformMetric(
      skuPlanFactPlatformMetrics(sku, platform, monthKey, indexes, adIndex, elapsedDays, maxFactDate, minFactDate),
      monthKey,
      elapsedDays,
      minFactDate,
      maxFactDate
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
  return skuPlanFactFinalizeRow(row, monthKey, elapsedDays, minFactDate, maxFactDate);
}

function skuPlanFactFinalizeRow(row = {}, monthKey = '', elapsedDays = 0, periodStart = '', periodEnd = '') {
  const platforms = SKU_PLAN_FACT_PLATFORMS.map((platform) => row.platforms?.[platform] || row[platform]).filter(Boolean);
  platforms.forEach((metric) => skuPlanFactFinalizePlatformMetric(metric, monthKey, elapsedDays, periodStart, periodEnd));
  const totals = platforms.reduce((acc, metric) => {
    acc.planUnits += numberOrZero(metric.planUnits);
    acc.planRevenue += numberOrZero(metric.planRevenue);
    acc.planToDateRevenue += numberOrZero(metric.planToDateRevenue);
    acc.factUnits += numberOrZero(metric.factUnits);
    acc.factRevenue += numberOrZero(metric.factRevenue);
    acc.adSpend += numberOrZero(metric.adSpend);
    if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
      acc.planAdSpend += numberOrZero(metric.planAdSpend);
      acc.hasPlanAdSpend = true;
    }
    if (metric.planMonthAdSpend !== null && metric.planMonthAdSpend !== undefined) {
      acc.planMonthAdSpend += numberOrZero(metric.planMonthAdSpend);
      acc.hasPlanMonthAdSpend = true;
    }
    if (metric.planPeriodAdSpend !== null && metric.planPeriodAdSpend !== undefined) {
      acc.planPeriodAdSpend += numberOrZero(metric.planPeriodAdSpend);
      acc.hasPlanPeriodAdSpend = true;
    }
    if (metric.adForecastSpend !== null && metric.adForecastSpend !== undefined) {
      acc.adForecastSpend += numberOrZero(metric.adForecastSpend);
      acc.hasAdForecastSpend = true;
    }
    skuPlanFactMergeDailyIntoMap(acc.dailyMap, metric.factDaily);
    const marginPct = skuPlanFactNormalizeRatio(metric.marginPct);
    const marginWeight = numberOrZero(metric.factRevenue) || numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue);
    if (marginPct !== null && marginWeight > 0) {
      acc.marginValue += marginPct * marginWeight;
      acc.marginWeight += marginWeight;
    }
    const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
    const planMarginWeight = numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue);
    if (planMarginPct !== null && planMarginWeight > 0) {
      acc.planMarginValue += planMarginPct * planMarginWeight;
      acc.planMarginWeight += planMarginWeight;
    }
    if (skuPlanFactPlatformHasActivity(metric)) acc.activePlatforms += 1;
    acc.hasPlanOrFact = acc.hasPlanOrFact || Boolean(
      metric?.hasSource
      || numberOrZero(metric.planUnits) > 0
      || numberOrZero(metric.planRevenue) > 0
      || numberOrZero(metric.factUnits) > 0
      || numberOrZero(metric.factRevenue) > 0
      || numberOrZero(metric.adSpend) > 0
    );
    return acc;
  }, { planUnits: 0, planRevenue: 0, planToDateRevenue: 0, factUnits: 0, factRevenue: 0, adSpend: 0, planAdSpend: 0, planMonthAdSpend: 0, planPeriodAdSpend: 0, adForecastSpend: 0, hasPlanAdSpend: false, hasPlanMonthAdSpend: false, hasPlanPeriodAdSpend: false, hasAdForecastSpend: false, marginValue: 0, marginWeight: 0, planMarginValue: 0, planMarginWeight: 0, activePlatforms: 0, dailyMap: new Map(), hasPlanOrFact: false });
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
  row.planAdSpend = totals.hasPlanAdSpend ? totals.planAdSpend : null;
  row.planAdSpendToDate = row.planAdSpend;
  row.planMonthAdSpend = totals.hasPlanMonthAdSpend ? totals.planMonthAdSpend : null;
  row.planPeriodAdSpend = totals.hasPlanPeriodAdSpend ? totals.planPeriodAdSpend : null;
  row.adForecastSpend = totals.hasAdForecastSpend ? totals.adForecastSpend : null;
  skuPlanFactFinalizeAdPace(row, monthKey, elapsedDays, periodStart);
  row.planDrr = row.planToDateRevenue > 0 && row.planAdSpend !== null ? row.planAdSpend / row.planToDateRevenue : null;
  row.marginPct = totals.marginWeight > 0 ? totals.marginValue / totals.marginWeight : null;
  row.marginRub = row.marginPct === null ? null : row.factRevenue * row.marginPct;
  row.planMarginPct = totals.planMarginWeight > 0 ? totals.planMarginValue / totals.planMarginWeight : null;
  row.planMarginRub = row.planMarginPct === null ? null : row.planToDateRevenue * row.planMarginPct;
  row.activePlatformCount = totals.activePlatforms;
  row.factDaily = skuPlanFactDailyArrayFromMap(totals.dailyMap);
  row.scoreHistory = skuPlanFactBuildScoreHistory(row, monthKey, periodStart, periodEnd);
  row.completionDelta = skuPlanFactCompletionDelta(row.scoreHistory);
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
  const numericSorts = new Set(['fact', 'plan', 'drr', 'avgCheck', 'turnover', 'ad', 'margin', 'platform', 'action', ...SKU_PLAN_FACT_PLATFORMS]);
  return numericSorts.has(sort) ? 'desc' : 'asc';
}

function skuPlanFactSortValue(row, sort = '') {
  if (sort === 'article') return row.article || row.articleKey || '';
  if (sort === 'owner') return row.owner || '';
  if (sort === 'platform') return row.activePlatformCount || 0;
  if (sort === 'completion') return row.completionToDate;
  if (sort === 'fact') return row.factRevenue;
  if (sort === 'plan') return row.planRevenue;
  if (sort === 'margin') return row.marginPct;
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
  if (sort === 'action') return skuPlanFactAttentionScore(row);
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

function skuPlanFactRowMatchesFilters(row = {}, filters = {}, options = {}) {
  const checkPlatform = options.platform !== false;
  if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
  if (filters.status === 'active' && String(row.status || '').toLowerCase().includes('вывод')) return false;
  if (filters.status === 'with_plan' && row.planRevenue <= 0) return false;
  if (filters.status === 'under_plan' && !(row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue)) return false;
  if (filters.status === 'no_fact' && !(row.planRevenue > 0 && row.factRevenue <= 0)) return false;
  if (filters.status === 'unmapped' && !row.syntheticUnmapped) return false;
  if (filters.status === 'matrix_problem' && (row.matrixProblemState === 'ok' || !row.matrixProblemState)) return false;
  if (filters.status === 'missing_owner' && row.matrixProblemState !== 'missing_owner' && row.owner !== 'Без owner') return false;
  if (filters.status === 'duplicate_risk' && !row.duplicateRisk) return false;
  if (checkPlatform && filters.platform !== 'all' && !skuPlanFactPlatformHasActivity(row.platforms?.[filters.platform] || row[filters.platform])) return false;
  const search = String(filters.search || '').trim().toLowerCase();
  if (!search) return true;
  return [row.articleKey, row.article, row.name, row.owner, row.status, row.matrixProblemMeta?.label]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(search);
}

function skuPlanFactBuildModel() {
  const filters = skuPlanFactFilters();
  const indexes = skuPlanFactBuildIndexes();
  const months = skuPlanFactAvailableMonths(indexes);
  const dateBounds = skuPlanFactDateBounds(indexes, months);
  const monthKey = skuPlanFactSelectedMonth(months);
  const maxAvailableDate = skuPlanFactMaxFactDate(indexes, monthKey);
  const selectedPeriod = skuPlanFactSelectedPeriod(indexes, monthKey, maxAvailableDate);
  const periodStart = selectedPeriod.start;
  const selectedDate = selectedPeriod.end;
  const elapsedDays = selectedPeriod.days;
  const adIndex = skuPlanFactAdIndex(monthKey, selectedDate, periodStart);
  const modelSkus = [
    ...(state.skus || []),
    ...skuPlanFactUnmappedSkus(indexes, monthKey, selectedDate, periodStart)
  ];
  const rows = modelSkus.map((sku) => skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays, selectedDate, periodStart));
  skuPlanFactAppendUnallocatedAggregateRows(rows, monthKey, selectedDate, periodStart);
  const reconciliation = skuPlanFactReconcilePlatformFacts(rows, monthKey, selectedDate, periodStart);
  skuPlanFactMarkDuplicateRiskRows(rows);
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => skuPlanFactAllocatePlatformPlan(rows, monthKey, platform, elapsedDays, periodStart, selectedDate));
  skuPlanFactApplyIuRevenueFloors(rows, monthKey, periodStart, selectedDate);
  skuPlanFactApplyPlannedAdSpend(rows, monthKey, periodStart, selectedDate);
  const iuDrrControl = skuPlanFactApplyIuDrrControl(rows, monthKey, periodStart, selectedDate);
  rows.forEach((row) => skuPlanFactFinalizeRow(row, monthKey, elapsedDays, periodStart, selectedDate));
  const owners = [...new Set(rows.map((row) => row.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const platformBaseRows = rows.filter((row) => skuPlanFactRowMatchesFilters(row, filters, { platform: false }));
  const filteredRows = platformBaseRows.filter((row) => skuPlanFactRowMatchesFilters(row, filters));
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
    if (row.planAdSpend !== null && row.planAdSpend !== undefined) {
      acc.planAdSpend += numberOrZero(row.planAdSpend);
      acc.hasPlanAdSpend = true;
    }
    if (row.planMonthAdSpend !== null && row.planMonthAdSpend !== undefined) {
      acc.planMonthAdSpend += numberOrZero(row.planMonthAdSpend);
      acc.hasPlanMonthAdSpend = true;
    }
    if (row.planPeriodAdSpend !== null && row.planPeriodAdSpend !== undefined) {
      acc.planPeriodAdSpend += numberOrZero(row.planPeriodAdSpend);
      acc.hasPlanPeriodAdSpend = true;
    }
    if (row.adForecastSpend !== null && row.adForecastSpend !== undefined) {
      acc.adForecastSpend += numberOrZero(row.adForecastSpend);
      acc.hasAdForecastSpend = true;
    }
    const marginPct = skuPlanFactNormalizeRatio(row.marginPct);
    const marginWeight = numberOrZero(row.factRevenue) || numberOrZero(row.planToDateRevenue) || numberOrZero(row.planRevenue);
    if (marginPct !== null && marginWeight > 0) {
      acc.marginValue += marginPct * marginWeight;
      acc.marginWeight += marginWeight;
    }
    const planMarginPct = skuPlanFactNormalizeRatio(row.planMarginPct);
    const planMarginWeight = numberOrZero(row.planToDateRevenue) || numberOrZero(row.planRevenue);
    if (planMarginPct !== null && planMarginWeight > 0) {
      acc.planMarginValue += planMarginPct * planMarginWeight;
      acc.planMarginWeight += planMarginWeight;
    }
    if (row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue) acc.underPlan += 1;
    if (row.planRevenue > 0 && row.factRevenue <= 0) acc.noFact += 1;
    return acc;
  }, { planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, planUnits: 0, factUnits: 0, adSpend: 0, planAdSpend: 0, planMonthAdSpend: 0, planPeriodAdSpend: 0, adForecastSpend: 0, hasPlanAdSpend: false, hasPlanMonthAdSpend: false, hasPlanPeriodAdSpend: false, hasAdForecastSpend: false, marginValue: 0, marginWeight: 0, planMarginValue: 0, planMarginWeight: 0, underPlan: 0, noFact: 0 });
  totals.completionToDate = totals.planToDateRevenue > 0 ? totals.factRevenue / totals.planToDateRevenue : null;
  totals.completionMonth = totals.planRevenue > 0 ? totals.factRevenue / totals.planRevenue : null;
  totals.gapToDate = totals.factRevenue - totals.planToDateRevenue;
  totals.avgCheck = totals.factUnits > 0 ? totals.factRevenue / totals.factUnits : null;
  totals.drr = totals.factRevenue > 0 ? totals.adSpend / totals.factRevenue : null;
  totals.planAdSpend = totals.hasPlanAdSpend ? totals.planAdSpend : null;
  totals.planAdSpendToDate = totals.planAdSpend;
  totals.planMonthAdSpend = totals.hasPlanMonthAdSpend ? totals.planMonthAdSpend : null;
  totals.planPeriodAdSpend = totals.hasPlanPeriodAdSpend ? totals.planPeriodAdSpend : null;
  totals.adForecastSpend = totals.hasAdForecastSpend ? totals.adForecastSpend : null;
  skuPlanFactFinalizeAdPace(totals, monthKey, elapsedDays, periodStart);
  totals.planDrr = totals.planToDateRevenue > 0 && totals.planAdSpend !== null ? totals.planAdSpend / totals.planToDateRevenue : null;
  totals.marginPct = totals.marginWeight > 0 ? totals.marginValue / totals.marginWeight : null;
  totals.marginRub = totals.marginPct === null ? null : totals.factRevenue * totals.marginPct;
  totals.planMarginPct = totals.planMarginWeight > 0 ? totals.planMarginValue / totals.planMarginWeight : null;
  totals.planMarginRub = totals.planMarginPct === null ? null : totals.planToDateRevenue * totals.planMarginPct;
  const planAdTotalsByPlatform = skuPlanFactPlanAdTotalsByPlatform(monthKey, periodStart, selectedDate);
  const planDrrByPlatform = SKU_PLAN_FACT_PLATFORMS.reduce((acc, platform) => {
    acc[platform] = planAdTotalsByPlatform[platform]?.drr ?? null;
    return acc;
  }, {});
  const model = {
    filters,
    months,
    monthKey,
    monthLabel: skuPlanFactMonthLabel(monthKey),
    maxFactDate: selectedDate,
    selectedDate,
    periodStart,
    periodEnd: selectedDate,
    periodDays: elapsedDays,
    maxAvailableDate,
    dateMin: dateBounds.min,
    dateMax: dateBounds.max,
    elapsedDays,
    rows: sortedRows,
    allRows: rows,
    platformBaseRows,
    owners,
    platforms: SKU_PLAN_FACT_PLATFORMS,
    platformLabels: SKU_PLAN_FACT_PLATFORM_LABELS,
    reconciliation,
    unmappedCount: unmappedRows.length,
    unmappedRevenue,
    quality,
    iuDrrControl,
    planAdTotalsByPlatform,
    planDrrByPlatform,
    totals,
    planDrrWb: planDrrByPlatform.wb,
    planDrrOzon: planDrrByPlatform.ozon
  };
  return skuPlanFactApplyPayrollKpiToModel(model);
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
  const newSkuTaskResult = report.newSkuTaskResult || {};
  const details = errors.length ? errors.slice(0, 8)
    : warnings.length ? warnings.slice(0, 8)
      : duplicates.length ? duplicates.slice(0, 8)
        : skipped.length ? skipped.slice(0, 8)
          : newSkuRows.length ? newSkuRows.slice(0, 8)
            : needCheckRows.slice(0, 8);
  const canApply = !report.appliedAt && !errors.length && Boolean(
    ((report.aliases || []).length && report.aliasPayload)
    || ((report.ignores || []).length && report.ignorePayload)
    || (report.newSkuRows || []).length
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
  const outcomeRows = [
    {
      label: 'Исчезнет после sync',
      count: (report.aliases || []).length + (report.ignores || []).length,
      tone: 'ok',
      text: 'alias и ignore сохранятся в общий контур, матрица SKU пересоберётся, эти API SKU уйдут из нерешённой очереди.'
    },
    {
      label: 'Останется как new_sku',
      count: newSkuRows.length,
      tone: 'warn',
      text: 'при применении портал создаст задачу “Завести SKU”; после заведения нужно связать API SKU через alias.'
    },
    {
      label: 'Останется как need_check',
      count: needCheckRows.length,
      tone: 'warn',
      text: 'портал ничего не применяет, строка остаётся на ручную проверку.'
    },
    {
      label: 'Не применится из-за ошибки',
      count: errors.length,
      tone: 'danger',
      text: 'исправьте target_sku/API SKU/площадку и загрузите файл повторно.'
    }
  ].filter((row) => row.count > 0);
  const outcomeHtml = outcomeRows.map((row) => `
    <tr>
      <td>${badge(row.label, row.tone)}</td>
      <td><strong>${fmt.int(row.count)}</strong></td>
      <td>${escapeHtml(row.text)}</td>
    </tr>
  `).join('');
  return `
    <div class="notice ${errors.length || warnings.length ? 'warn' : 'ok'}" style="margin-top:10px">
      <div class="section-subhead">
        <div>
          <strong>Отчёт импорта${report.fileName ? `: ${escapeHtml(report.fileName)}` : ''}</strong>
          <div class="small muted">Строк: ${fmt.int(report.sourceRows || 0)} · alias: ${fmt.int(report.candidateAliases || 0)} · ignore: ${fmt.int(report.candidateIgnores || 0)} · new_sku: ${fmt.int(report.candidateNewSkus || 0)} · need_check: ${fmt.int(report.candidateNeedCheck || 0)} · дубли: ${fmt.int(duplicates.length)} · пропущено: ${fmt.int(skipped.length)} · ошибок: ${fmt.int(errors.length)}</div>
          ${report.appliedAt ? `<div class="small muted">Применено: ${escapeHtml(fmt.date(report.appliedAt))} · задач new_sku создано: ${fmt.int((newSkuTaskResult.created || []).length)} · дублей задач: ${fmt.int((newSkuTaskResult.duplicates || []).length)}</div>` : ''}
        </div>
        <div class="badge-stack">
          ${canApply ? '<button class="quick-chip" type="button" data-sku-plan-fact-apply-import>Применить в портал</button>' : ''}
          ${(report.aliases || []).length && report.aliasPayload ? '<button class="quick-chip" type="button" data-sku-plan-fact-download-aliases>Скачать sku_aliases.json</button>' : ''}
          ${(report.ignores || []).length && report.ignorePayload ? '<button class="quick-chip" type="button" data-sku-plan-fact-download-ignore>Скачать sku_alias_ignore.json</button>' : ''}
          <button class="quick-chip" type="button" data-sku-plan-fact-download-import-report>Скачать отчёт</button>
        </div>
      </div>
      ${outcomeHtml ? `
        <div class="table-scroll" style="margin-top:10px">
          <table class="data-table compact">
            <thead><tr><th>Что будет</th><th>Строк</th><th>Пояснение</th></tr></thead>
            <tbody>${outcomeHtml}</tbody>
          </table>
        </div>
      ` : ''}
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

function skuContourDecisionCardsHtml() {
  const cards = [
    {
      title: 'Это тот же товар',
      decision: 'alias',
      text: 'API SKU на площадке — это уже существующий товар из реестра.',
      fill: 'В Excel: decision = alias, target_sku = SKU из реестра.',
      tone: 'ok'
    },
    {
      title: 'Это новый товар',
      decision: 'new_sku',
      text: 'Товара ещё нет в реестре, но его нужно завести.',
      fill: 'В Excel: decision = new_sku. Портал создаст задачу.',
      tone: 'warn'
    },
    {
      title: 'Это не надо маппить',
      decision: 'ignore',
      text: 'Тестовая, служебная или осознанно исключённая строка.',
      fill: 'В Excel: decision = ignore, в note коротко причина.',
      tone: 'ok'
    },
    {
      title: 'Не уверены',
      decision: 'need_check',
      text: 'Нужна проверка категории, API, склада или источника.',
      fill: 'В Excel: decision = need_check, в note вопрос.',
      tone: 'info'
    }
  ];
  return `
    <div class="grid cards" style="margin-top:12px" data-sku-contour-decision-cards>
      ${cards.map((card) => `
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>${escapeHtml(card.title)}</h3>
              <p class="small muted">${escapeHtml(card.text)}</p>
            </div>
            ${badge(card.decision, card.tone)}
          </div>
          <div class="small" style="margin-top:8px">${escapeHtml(card.fill)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function skuPlanFactNormalizeRatio(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.abs(numeric) > 2 ? numeric / 100 : numeric;
}

function skuPlanFactMarginTone(value) {
  const ratio = skuPlanFactNormalizeRatio(value);
  if (ratio === null) return '';
  if (ratio < 0.15) return 'danger';
  if (ratio < 0.28) return 'warn';
  return 'ok';
}

function skuPlanFactAttentionScore(row = {}) {
  let score = 0;
  if (row.matrixProblemState && row.matrixProblemState !== 'ok') score += 10;
  if (row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue) score += 5;
  if (row.completionToDate !== null && row.completionToDate > 1.2) score += 3;
  if (skuPlanFactNormalizeRatio(row.marginPct) !== null && skuPlanFactNormalizeRatio(row.marginPct) < 0.15) score += 4;
  if (row.drr !== null && row.drr > 0.25) score += 2;
  return score;
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
      ${skuContourDecisionCardsHtml()}
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
  const contourStatus = String(health.skuContour?.status || '').toLowerCase();
  if (contourStatus === 'blocked') {
    return { label: 'контур SKU не применился', tone: 'danger', notice: 'warn' };
  }
  if (contourStatus === 'warning') {
    return { label: 'контур SKU требует проверки', tone: 'warn', notice: 'warn' };
  }
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
      else if (type.includes('wb_owner_distribution')) status = 'new';
      else if (issue.severity === 'warning' || issue.severity === 'warn') status = 'warning';
      return {
        key: `${issue.type || ''}|${issue.platform || ''}|${apiSku}|${Math.round(numberOrZero(issue.revenue))}`,
        keys,
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

function skuContourOnlyNew() {
  return state.skuContourOnlyNew === true;
}

function skuContourAuditIndex() {
  const map = new Map();
  const add = (key, event, kind, targetSku = '') => {
    if (!key || map.has(key)) return;
    map.set(key, {
      kind,
      targetSku,
      appliedAt: event.appliedAt || event.generatedAt || '',
      actor: event.actor || 'portal-user',
      fileName: event.fileName || '',
      eventId: event.id || ''
    });
  };
  skuPlanFactAuditEvents(state.skuAliasAudit || {}).forEach((event) => {
    (event.aliasKeys || []).forEach((rawKey) => {
      const parts = String(rawKey || '').split('|');
      if (parts.length >= 3) add(`${parts[1]}|${parts[2]}`, event, 'alias', parts[0] || '');
    });
    (event.ignoreKeys || []).forEach((rawKey) => add(String(rawKey || ''), event, 'ignore'));
  });
  return map;
}

function skuContourAuditForRow(row = {}, auditIndex = null) {
  const index = auditIndex || skuContourAuditIndex();
  for (const key of (row.keys || [])) {
    const event = index.get(key);
    if (event) return event;
  }
  return null;
}

function skuContourAuditJournalRows(limit = 24) {
  const rows = [];
  skuPlanFactAuditEvents(state.skuAliasAudit || {}).forEach((event) => {
    (event.aliasKeys || []).forEach((rawKey) => {
      const parts = String(rawKey || '').split('|');
      rows.push({
        appliedAt: event.appliedAt || event.generatedAt || '',
        actor: event.actor || 'portal-user',
        fileName: event.fileName || '',
        kind: 'alias',
        targetSku: parts[0] || '',
        platform: parts[1] || '',
        apiSku: parts[2] || ''
      });
    });
    (event.ignoreKeys || []).forEach((rawKey) => {
      const parts = String(rawKey || '').split('|');
      rows.push({
        appliedAt: event.appliedAt || event.generatedAt || '',
        actor: event.actor || 'portal-user',
        fileName: event.fileName || '',
        kind: 'ignore',
        targetSku: '',
        platform: parts[0] || '',
        apiSku: parts[1] || ''
      });
    });
  });
  return rows.slice(0, limit);
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

async function portalRefreshOperationalDataPayloads() {
  if (typeof loadJsonOrFallback !== 'function') return;
  const [skuMatrix, syncHealth, portalDataQuality, portalDataQuarantine, lastGoodManifest] = await Promise.all([
    loadJsonOrFallback(
      'data/sku_matrix.json',
      { schema: 'portal-sku-matrix-v1', summary: {}, items: [], apiUnmapped: [], ignoredApiSku: [], indexes: { byArticleKey: {}, aliasToArticleKey: {} } },
      'SKU matrix'
    ),
    loadJsonOrFallback(
      'data/portal_sync_health.json',
      { schema: 'portal-sync-health-v1', status: '', publish: { allowed: true, blockingReasons: [], warnings: [] }, sources: {}, quality: {} },
      'Состояние sync'
    ),
    loadJsonOrFallback(
      'data/portal_data_quality.json',
      { generatedAt: '', status: '', summary: {}, issues: [] },
      'Контроль данных'
    ),
    loadJsonOrFallback(
      'data/portal_data_quarantine.json',
      { schema: 'portal-data-quarantine-v1', summary: {}, rows: [] },
      'Карантин данных'
    ),
    loadJsonOrFallback(
      'data/last_good/manifest.json',
      { generatedAt: '', files: [] },
      'last good manifest'
    )
  ]);
  state.skuMatrix = skuMatrix && typeof skuMatrix === 'object'
    ? skuMatrix
    : { schema: 'portal-sku-matrix-v1', summary: {}, items: [], apiUnmapped: [], ignoredApiSku: [], indexes: { byArticleKey: {}, aliasToArticleKey: {} } };
  state.syncHealth = syncHealth && typeof syncHealth === 'object'
    ? syncHealth
    : { schema: 'portal-sync-health-v1', status: '', publish: { allowed: true, blockingReasons: [], warnings: [] }, sources: {}, quality: {} };
  state.portalDataQuality = portalDataQuality && typeof portalDataQuality === 'object'
    ? portalDataQuality
    : { generatedAt: '', status: '', summary: {}, issues: [] };
  state.portalDataQuarantine = portalDataQuarantine && typeof portalDataQuarantine === 'object'
    ? portalDataQuarantine
    : { schema: 'portal-data-quarantine-v1', summary: {}, rows: [] };
  state.portalLastGoodManifest = lastGoodManifest && typeof lastGoodManifest === 'object'
    ? lastGoodManifest
    : { generatedAt: '', files: [] };
}

function portalHealthSourceRows() {
  const seen = new Set();
  const rows = [];
  const add = (row = {}) => {
    const key = String(row.dataset || row.key || row.name || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    const lagDays = Number.isFinite(Number(row.lagDays)) ? Number(row.lagDays) : null;
    const exists = row.exists !== false;
    const rowsCount = Number(row.rows || 0);
    const status = String(row.status || '').toLowerCase();
    let tone = 'ok';
    if (!exists || status === 'critical' || status === 'blocked') tone = 'danger';
    else if (status === 'warning' || status === 'warn' || (lagDays !== null && lagDays > portalDataRuleNumber('staleSourceDays'))) tone = 'warn';
    else if (!rowsCount && key !== 'loyalty_system') tone = 'warn';
    rows.push({
      key,
      label: String(row.label || key).replaceAll('_', ' '),
      rows: rowsCount,
      generatedAt: row.generatedAt || '',
      asOfDate: row.asOfDate || '',
      lagDays,
      status: status || (tone === 'ok' ? 'ok' : 'warning'),
      tone,
      revenue: numberOrZero(row.revenue)
    });
  };
  (state.portalDataQuality?.freshness || []).forEach(add);
  Object.entries(state.syncHealth?.sources || {}).forEach(([key, value]) => add({ key, dataset: key, ...(value || {}) }));
  return rows.sort((left, right) => {
    const rank = { danger: 0, warn: 1, ok: 2 };
    return (rank[left.tone] ?? 9) - (rank[right.tone] ?? 9) || String(left.label).localeCompare(String(right.label));
  });
}

function portalHealthIssueTone(issue = {}) {
  const severity = String(issue.severity || issue.status || '').toLowerCase();
  if (['critical', 'danger', 'blocked', 'quarantine'].some((token) => severity.includes(token))) return 'danger';
  if (['warning', 'warn', 'new', 'need_check'].some((token) => severity.includes(token))) return 'warn';
  return issue.amount > 0 ? 'warn' : '';
}

const PORTAL_DATA_RULE_DEFAULTS = {
  stockRiskDays: 10,
  criticalRevenueRub: 1000000,
  staleSourceDays: 1,
  autoTaskLimit: 10
};

const PORTAL_DATA_RULE_LIMITS = {
  stockRiskDays: { min: 1, max: 180 },
  criticalRevenueRub: { min: 0 },
  staleSourceDays: { min: 0, max: 14 },
  autoTaskLimit: { min: 1, max: 50 }
};

function portalNormalizeDataRuleValue(key, value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return fallback;
  const limits = PORTAL_DATA_RULE_LIMITS[key] || {};
  const min = Number.isFinite(Number(limits.min)) ? Number(limits.min) : 0;
  const max = Number.isFinite(Number(limits.max)) ? Number(limits.max) : null;
  let next = Math.round(parsed);
  if (next < min) next = min;
  if (max !== null && next > max) next = max;
  return next;
}

function portalDataRules() {
  const raw = state.storage?.portalDataRules && typeof state.storage.portalDataRules === 'object'
    ? state.storage.portalDataRules
    : {};
  const next = { ...PORTAL_DATA_RULE_DEFAULTS };
  Object.keys(next).forEach((key) => {
    next[key] = portalNormalizeDataRuleValue(key, raw[key], next[key]);
  });
  return next;
}

function portalDataRuleNumber(key) {
  return Number(portalDataRules()[key] ?? PORTAL_DATA_RULE_DEFAULTS[key] ?? 0);
}

function portalSaveDataRules(raw = {}) {
  const current = portalDataRules();
  const next = { ...current };
  Object.keys(PORTAL_DATA_RULE_DEFAULTS).forEach((key) => {
    next[key] = portalNormalizeDataRuleValue(key, raw[key], current[key]);
  });
  state.storage = state.storage || {};
  state.storage.portalDataRules = next;
  state.storage.portalDataRulesUpdatedAt = new Date().toISOString();
  if (typeof saveLocalStorage === 'function') saveLocalStorage();
  return next;
}

function portalHealthIssueSnapshot(issues = []) {
  const rows = (issues || []).map((row) => ({
    key: row.key || [row.source, row.type, row.platform, row.apiSku || row.name].join('|'),
    title: [row.source, row.type, row.apiSku || row.name].filter(Boolean).join(' · '),
    tone: row.tone || '',
    amount: numberOrZero(row.amount)
  })).filter((row) => row.key);
  return {
    generatedAt: new Date().toISOString(),
    healthGeneratedAt: state.syncHealth?.generatedAt || state.portalDataQuality?.generatedAt || '',
    keys: rows.map((row) => row.key),
    rows
  };
}

function portalHealthSnapshotDiff(issues = []) {
  const current = portalHealthIssueSnapshot(issues);
  const previous = state.storage?.portalIssueSnapshot && typeof state.storage.portalIssueSnapshot === 'object'
    ? state.storage.portalIssueSnapshot
    : null;
  const previousKeys = new Set(Array.isArray(previous?.keys) ? previous.keys : []);
  const currentKeys = new Set(current.keys);
  const previousRows = Array.isArray(previous?.rows) ? previous.rows : [];
  const newRows = current.rows.filter((row) => !previousKeys.has(row.key));
  const closedRows = previousRows.filter((row) => !currentKeys.has(row.key));
  return {
    current,
    previous,
    newRows,
    closedRows,
    unchangedCount: current.rows.length - newRows.length
  };
}

function portalHealthCommitIssueSnapshot(issues = []) {
  state.storage = state.storage || {};
  state.storage.portalIssueSnapshot = portalHealthIssueSnapshot(issues);
  if (typeof saveLocalStorage === 'function') saveLocalStorage();
  return state.storage.portalIssueSnapshot;
}

function portalHealthSavedViews() {
  const rules = portalDataRules();
  return [
    {
      id: 'warehouse-risk',
      title: `Склад: закончится до ${fmt.int(rules.stockRiskDays)} дней`,
      text: 'Открывает Заказ товара с проблемными складами и нужным порогом дней.',
      view: 'order',
      tone: 'warn'
    },
    {
      id: 'api-unmapped',
      title: 'API без пары по выручке',
      text: 'Открывает Контур SKU, где можно выгрузить форму, загрузить решения и закрепить alias/ignore.',
      view: 'sku-contour',
      tone: 'danger'
    },
    {
      id: 'plan-fact-gaps',
      title: 'План-факт: нет плана или факта',
      text: 'Открывает план-факт SKU, чтобы проверить owner, план и потерянные API SKU.',
      view: 'sku-plan-fact',
      tone: 'warn'
    },
    {
      id: 'price-safety',
      title: 'Цены и репрайсер',
      text: 'Переход к ценовому контуру: MIN/MAX, safe export, ручные решения и аудит.',
      view: 'repricer',
      tone: 'info'
    }
  ];
}

function portalHealthApplySavedView(id = '') {
  const rules = portalDataRules();
  if (id === 'warehouse-risk') {
    state.orderProcurementUi = state.orderProcurementUi || {};
    state.orderProcurementUi.clusterFilter = 'low_stock';
    state.orderProcurementUi.clusterDays = rules.stockRiskDays;
    state.orderProcurementUi.mode = 'all';
    if (typeof setView === 'function') setView('order');
    return;
  }
  const target = portalHealthSavedViews().find((item) => item.id === id)?.view || 'data-health';
  if (typeof setView === 'function') setView(target);
}

function portalHealthIssueRows(limit = 240) {
  const rows = [];
  const seen = new Set();
  const add = (row = {}) => {
    const key = [
      row.source || '',
      row.type || '',
      row.platform || '',
      row.apiSku || row.articleKey || row.name || ''
    ].map((value) => String(value || '').toLowerCase()).join('|');
    if (!key.replace(/\|/g, '') || seen.has(key)) return;
    seen.add(key);
    const amount = numberOrZero(row.amount ?? row.revenue);
    const criticalRevenueRub = portalDataRuleNumber('criticalRevenueRub');
    const tone = row.tone || (criticalRevenueRub > 0 && amount >= criticalRevenueRub
      ? 'danger'
      : portalHealthIssueTone({ ...row, amount }));
    rows.push({
      key,
      source: row.source || 'Данные',
      type: row.type || 'Проверить',
      platform: row.platform || '',
      apiSku: row.apiSku || row.articleKey || '',
      name: row.name || '',
      status: row.status || row.severity || '',
      tone,
      amount,
      units: numberOrZero(row.units),
      action: row.action || row.message || '',
      view: row.view || 'data-health'
    });
  };

  const model = typeof skuPlanFactBuildModel === 'function' ? skuPlanFactBuildModel() : {};
  if (typeof skuContourIssueRows === 'function') {
    skuContourIssueRows(model)
      .filter((row) => !(typeof skuContourIssueIsResolved === 'function' && skuContourIssueIsResolved(row)))
      .forEach((row) => add({
        source: 'Контур SKU',
        type: row.type || 'API SKU без пары',
        platform: row.platform,
        apiSku: row.apiSku,
        name: row.name,
        status: row.status,
        amount: row.revenue,
        units: row.units,
        action: row.action || 'Разобрать через alias / ignore / new_sku / need_check',
        view: 'sku-contour'
      }));
  }

  (model.allRows || []).filter((row) => !row.syntheticUnmapped && row.factRevenue > 0 && row.planRevenue <= 0).slice(0, 40).forEach((row) => add({
    source: 'План-факт SKU',
    type: 'Есть факт, нет плана',
    platform: '',
    apiSku: row.articleKey || row.article,
    name: row.name,
    status: 'warning',
    amount: row.factRevenue,
    units: row.factUnits,
    action: 'Проверить, должен ли SKU быть в плане. Если да — добавить план/owner; если нет — подтвердить статус вывода.',
    view: 'sku-plan-fact'
  }));

  (model.allRows || []).filter((row) => row.planRevenue > 0 && row.factRevenue <= 0).slice(0, 40).forEach((row) => add({
    source: 'План-факт SKU',
    type: 'План есть, факта нет',
    platform: '',
    apiSku: row.articleKey || row.article,
    name: row.name,
    status: 'warning',
    amount: row.planToDateRevenue || row.planRevenue,
    units: row.planUnits,
    action: 'Проверить наличие, карточку, цену и маппинг факта. Это может быть реальная остановка продаж или потерянный API SKU.',
    view: 'sku-plan-fact'
  }));

  const stockRiskDays = Math.max(1, portalDataRuleNumber('stockRiskDays') || PORTAL_DATA_RULE_DEFAULTS.stockRiskDays);
  (model.allRows || [])
    .filter((row) => (row.platforms ? Object.values(row.platforms) : [])
      .some((metric) => metric && Number.isFinite(Number(metric.turnoverDays)) && Number(metric.turnoverDays) > 0 && Number(metric.turnoverDays) <= stockRiskDays))
    .slice(0, 40)
    .forEach((row) => add({
      source: 'Заказ товара',
      type: `Закончится до ${fmt.int(stockRiskDays)} дней`,
      platform: '',
      apiSku: row.articleKey || row.article,
      name: row.name,
      status: 'warning',
      amount: row.factRevenue,
      units: row.factUnits,
      action: `Открыть заказ товара, включить проблемные склады и проверить поставку по складам. Порог настраивается в правилах: ${fmt.int(stockRiskDays)} дней.`,
      view: 'order'
    }));

  (state.syncHealth?.publish?.blockingReasons || []).forEach((message, index) => add({
    source: 'Sync',
    type: 'Блокер публикации',
    status: 'blocked',
    name: `sync-blocker-${index + 1}`,
    action: message,
    view: 'data-health'
  }));
  (state.syncHealth?.publish?.warnings || []).forEach((message, index) => add({
    source: 'Sync',
    type: 'Предупреждение sync',
    status: 'warning',
    name: `sync-warning-${index + 1}`,
    action: message,
    view: 'data-health'
  }));

  (state.skuMatrix?.duplicateRisks || []).forEach((row) => add({
    source: 'Факты API',
    type: 'Риск дубля выручки',
    platform: row.platform,
    apiSku: row.api_sku || row.apiSku || row.articleKey,
    name: row.name,
    status: 'critical',
    amount: row.overage || row.revenue,
    units: row.units,
    action: row.action || 'Проверить ключ уникальности факта и карантин дублей',
    view: 'data-health'
  }));

  const missingOwner = (state.skuMatrix?.items || []).filter((item) => !item.owner || item.problemState === 'missing_owner').slice(0, 30);
  missingOwner.forEach((item) => add({
    source: 'Матрица SKU',
    type: 'SKU без owner',
    apiSku: item.articleKey || item.article,
    name: item.name,
    status: 'warning',
    action: 'Назначить owner в реестре SKU, чтобы планы и задачи не висели без ответственного',
    view: 'skus'
  }));

  (state.portalDataQuarantine?.rows || []).slice(0, 80).forEach((row) => add({
    source: 'Карантин данных',
    type: row.type || row.reason || 'Строка в карантине',
    platform: row.platform,
    apiSku: row.articleKey || row.api_sku || row.apiSku,
    name: row.name,
    status: 'quarantine',
    amount: row.revenue,
    units: row.units,
    action: row.action || row.message || 'Разобрать причину карантина до попадания в расчёты',
    view: 'sku-contour'
  }));

  return rows
    .sort((left, right) => {
      const rank = { danger: 0, warn: 1, ok: 2, '': 3 };
      return (rank[left.tone] ?? 9) - (rank[right.tone] ?? 9) || numberOrZero(right.amount) - numberOrZero(left.amount);
    })
    .slice(0, limit);
}

function portalHealthIssueTaskId(issue = {}) {
  const raw = `portal-data-issue|${issue.key || ''}|${issue.source || ''}|${issue.type || ''}|${issue.platform || ''}|${issue.apiSku || issue.name || ''}`;
  return typeof stableId === 'function' ? stableId('task', raw) : `task-${raw}`;
}

function portalHealthBuildIssueTask(issue = {}) {
  const titleKey = issue.apiSku || issue.name || issue.platform || 'контур';
  const taskPayload = {
    id: portalHealthIssueTaskId(issue),
    source: 'auto',
    autoCode: 'portal_data_issue',
    articleKey: issue.apiSku || '',
    entityLabel: titleKey,
    title: `${issue.type}: ${titleKey}`,
    nextAction: issue.action || 'Разобрать проблему данных и закрыть причину, чтобы она не возвращалась после sync.',
    reason: [
      issue.source ? `контур: ${issue.source}` : '',
      issue.platform ? `площадка: ${issue.platform}` : '',
      issue.amount ? `влияние: ${fmt.money(issue.amount)}` : ''
    ].filter(Boolean).join(' · '),
    owner: '',
    due: typeof plusDays === 'function' ? plusDays(issue.tone === 'danger' ? 1 : 2) : '',
    status: 'new',
    type: issue.type && /owner/i.test(issue.type) ? 'assignment' : 'general',
    priority: issue.tone === 'danger' ? 'critical' : 'high',
    platform: skuPlanFactNormalizePlatform(issue.platform || 'all') || 'all'
  };
  return typeof normalizeTask === 'function' ? normalizeTask(taskPayload, 'auto') : taskPayload;
}

function portalHealthTodayDigestRows({ issues = [], sources = [], summary = {}, dangerCount = 0, warnCount = 0 } = {}) {
  const rows = [];
  const add = (title, text, tone = '') => rows.push({ title, text, tone });
  const staleSources = sources.filter((row) => row.tone !== 'ok').slice(0, 3);
  const topIssue = issues[0] || null;
  const todayKey = todayIso();
  const todayAuditEvents = skuPlanFactAuditEvents(state.skuAliasAudit || {})
    .filter((event) => String(event.appliedAt || event.generatedAt || '').slice(0, 10) === todayKey);
  const appliedToday = todayAuditEvents.reduce((acc, event) => {
    acc.alias += numberOrZero(event.aliasesAdded);
    acc.ignore += numberOrZero(event.ignoresAdded);
    acc.rollback += event.type === 'sku_alias_import_rollback' ? 1 : 0;
    return acc;
  }, { alias: 0, ignore: 0, rollback: 0 });

  add(
    dangerCount ? 'Сначала критичное' : 'Критичных блокеров нет',
    dangerCount
      ? `${fmt.int(dangerCount)} строк нужно разобрать первыми. Самая крупная: ${topIssue ? `${topIssue.type} · ${fmt.money(topIssue.amount)}` : 'см. очередь ниже'}.`
      : 'Можно работать по обычной очереди: сначала предупреждения, потом хвосты без owner и плана.',
    dangerCount ? 'danger' : 'ok'
  );
  add(
    staleSources.length ? 'Проверить источники' : 'Источники свежие',
    staleSources.length
      ? staleSources.map((row) => `${row.label}: ${row.asOfDate || 'нет даты'}`).join(' · ')
      : `Данные актуальны до ${state.syncHealth?.freshness?.maxDate || summary.maxDate || 'текущего среза'}.`,
    staleSources.length ? 'warn' : 'ok'
  );
  add(
    'Что закрепили сегодня',
    appliedToday.alias || appliedToday.ignore || appliedToday.rollback
      ? `${fmt.int(appliedToday.alias)} alias · ${fmt.int(appliedToday.ignore)} ignore · ${fmt.int(appliedToday.rollback)} откатов.`
      : 'Сегодня ещё не применяли alias/ignore через портал.',
    appliedToday.rollback ? 'warn' : 'info'
  );
  add(
    summary.apiUnmappedRevenue ? 'API без пары влияет на деньги' : 'API без пары под контролем',
    summary.apiUnmappedRevenue
      ? `${fmt.money(summary.apiUnmappedRevenue)} пока не привязано к матрице. Разбирать лучше сверху вниз по сумме.`
      : 'Нет значимого оборота без пары по текущему health-срезу.',
    summary.apiUnmappedRevenue ? 'warn' : 'ok'
  );
  return rows;
}

function portalHealthLastGoodHtml() {
  const manifest = state.portalLastGoodManifest || {};
  const publish = state.syncHealth?.publish || {};
  const allowed = publish.allowed !== false;
  const generatedAt = manifest.generatedAt || manifest.createdAt || manifest.updatedAt || '';
  const files = Array.isArray(manifest.files) ? manifest.files.length : numberOrZero(manifest.fileCount);
  const tone = allowed ? 'ok' : 'danger';
  const title = allowed ? 'Текущий срез разрешён' : 'Публикация заблокирована';
  const text = allowed
    ? 'Портал показывает свежий опубликованный срез. Если sync завтра приедет криво, здесь будет видно, что надо смотреть последний хороший.'
    : `Портал должен показывать последний хороший срез${generatedAt ? ` от ${fmt.date(generatedAt)}` : ''}, пока блокеры sync не закрыты.`;
  return `
    <div class="notice ${allowed ? 'ok' : 'warn'}" data-health-last-good>
      <div class="section-subhead">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <div class="small muted">${escapeHtml(text)}</div>
        </div>
        <div class="badge-stack">
          ${badge(allowed ? 'можно доверять' : 'последний хороший', tone)}
          ${generatedAt ? badge(`last good ${fmt.date(generatedAt)}`, 'info') : ''}
          ${files ? badge(`${fmt.int(files)} файлов`, 'info') : ''}
        </div>
      </div>
    </div>
  `;
}

function portalHealthChangesHtml(diff = {}) {
  const previousAt = diff.previous?.generatedAt || '';
  const newPreview = (diff.newRows || []).slice(0, 5).map((row) => `
    <div class="alert-row">
      <div><strong>${escapeHtml(row.title || row.key)}</strong><div class="muted small">${fmt.money(row.amount)}</div></div>
      ${badge('новая', row.tone || 'warn')}
    </div>
  `).join('');
  const closedPreview = (diff.closedRows || []).slice(0, 5).map((row) => `
    <div class="alert-row">
      <div><strong>${escapeHtml(row.title || row.key)}</strong><div class="muted small">${fmt.money(row.amount)}</div></div>
      ${badge('закрыта', 'ok')}
    </div>
  `).join('');
  return `
    <div class="card sku-plan-fact-card" data-health-change-digest>
      <div class="section-subhead">
        <div>
          <h3>Что изменилось с прошлого контроля</h3>
          <p class="small muted">${previousAt ? `Сравнение с отметкой ${escapeHtml(fmt.date(previousAt))}.` : 'Пока нет сохранённой отметки: нажмите “зафиксировать срез”, и дальше портал будет показывать только изменения.'}</p>
        </div>
        <div class="badge-stack">
          ${badge(`новых ${fmt.int((diff.newRows || []).length)}`, (diff.newRows || []).length ? 'warn' : 'ok')}
          ${badge(`закрыто ${fmt.int((diff.closedRows || []).length)}`, (diff.closedRows || []).length ? 'ok' : 'info')}
          ${badge(`без изменений ${fmt.int(diff.unchangedCount || 0)}`, 'info')}
          <button class="quick-chip" type="button" data-health-save-snapshot>Зафиксировать текущий срез</button>
        </div>
      </div>
      <div class="two-col" style="margin-top:12px">
        <div>
          <div class="muted small" style="margin-bottom:6px">Новые проблемы</div>
          <div class="alert-stack">${newPreview || '<div class="empty">Новых проблем нет</div>'}</div>
        </div>
        <div>
          <div class="muted small" style="margin-bottom:6px">Закрылись после прошлого контроля</div>
          <div class="alert-stack">${closedPreview || '<div class="empty">Пока ничего не закрылось</div>'}</div>
        </div>
      </div>
    </div>
  `;
}

function portalHealthRulesHtml(rules = portalDataRules()) {
  return `
    <details class="card sku-plan-fact-card" data-health-rules open>
      <summary style="cursor:pointer;font-weight:800">Правила тревог и автозадач</summary>
      <form class="data-health-rules-form" data-health-rules-form novalidate>
        <label class="mini-kpi data-health-rule-field">
          <span>Товар закончится, дней</span>
          <input name="stockRiskDays" type="text" inputmode="numeric" pattern="[0-9\\s,.]*" autocomplete="off" value="${escapeHtml(rules.stockRiskDays)}">
          <span>для “Заказа товара” и общей очереди</span>
        </label>
        <label class="mini-kpi data-health-rule-field">
          <span>Критичная сумма, ₽</span>
          <input name="criticalRevenueRub" type="text" inputmode="numeric" pattern="[0-9\\s,.]*" autocomplete="off" value="${escapeHtml(rules.criticalRevenueRub)}">
          <span>выше этой суммы проблема становится критичной</span>
        </label>
        <label class="mini-kpi data-health-rule-field">
          <span>Просрочка источника, дней</span>
          <input name="staleSourceDays" type="text" inputmode="numeric" pattern="[0-9\\s,.]*" autocomplete="off" value="${escapeHtml(rules.staleSourceDays)}">
          <span>порог для утренней проверки свежести</span>
        </label>
        <label class="mini-kpi data-health-rule-field">
          <span>Автозадач за раз</span>
          <input name="autoTaskLimit" type="text" inputmode="numeric" pattern="[0-9\\s,.]*" autocomplete="off" value="${escapeHtml(rules.autoTaskLimit)}">
          <span>чтобы не плодить лишнее</span>
        </label>
        <div class="quick-actions data-health-rules-actions">
          <button class="quick-chip" type="submit">Сохранить правила</button>
        </div>
      </form>
    </details>
  `;
}

function portalHealthSourceExplanationHtml(summary = {}) {
  const cards = [
    {
      key: 'revenue',
      title: 'Выручка и факт',
      text: 'Берём fact/API продажи по площадкам, затем проверяем дубли, карантин и связь API SKU с матрицей.',
      value: fmt.money(summary.totalRevenue || summary.revenue || 0)
    },
    {
      key: 'api-unmapped',
      title: 'API без пары',
      text: 'Это продажи, где площадка отдала API SKU, но он ещё не связан с реестром SKU через alias и не занесён в ignore.',
      value: fmt.money(summary.apiUnmappedRevenue || 0)
    },
    {
      key: 'freshness',
      title: 'Свежесть источников',
      text: 'Смотрим дату данных, дату сборки, количество строк и лаг относительно максимальной даты текущего sync.',
      value: state.syncHealth?.freshness?.maxDate || summary.maxDate || '—'
    },
    {
      key: 'quarantine',
      title: 'Карантин',
      text: 'Строки, которые не должны тихо попадать в расчёты: дубли, блокеры sync, подозрительные агрегаты и ошибки источников.',
      value: fmt.int(state.portalDataQuarantine?.summary?.rows || state.portalDataQuarantine?.rows?.length || 0)
    }
  ];
  return `
    <div class="card sku-plan-fact-card" data-health-source-explain>
      <div class="section-subhead">
        <div>
          <h3>Откуда берутся цифры</h3>
          <p class="small muted">Короткая расшифровка, чтобы у каждой ключевой цифры был понятный источник и смысл.</p>
        </div>
        ${badge('прозрачность расчёта', 'info')}
      </div>
      <div class="grid cards" style="margin-top:12px">
        ${cards.map((card) => `
          <div class="mini-kpi">
            <span>${escapeHtml(card.title)}</span>
            <strong>${escapeHtml(card.value)}</strong>
            <span>${escapeHtml(card.text)}</span>
            <button class="quick-chip" type="button" data-health-explain="${escapeHtml(card.key)}">Подробнее</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function portalHealthWorkModesHtml() {
  const roles = [
    ['warehouse-risk', 'Склад', 'Заканчивается, к заказу, в пути, проблемные склады.', 'warn'],
    ['api-unmapped', 'Категория / SKU', 'API без пары, owner, новые SKU, alias и ignore.', 'danger'],
    ['price-safety', 'Коммерция', 'Цены, репрайсер, маржа, safe export и стоп-листы.', 'info'],
    ['plan-fact-gaps', 'Руководитель', 'План-факт, крупные отклонения, открытые проблемы.', 'ok']
  ];
  const saved = portalHealthSavedViews();
  return `
    <div class="card sku-plan-fact-card" data-health-work-modes>
      <div class="section-subhead">
        <div>
          <h3>Рабочие режимы без лишнего</h3>
          <p class="small muted">Не заставляем людей собирать фильтры заново: каждый открывает свой готовый срез.</p>
        </div>
        ${badge(`${fmt.int(saved.length)} представления`, 'info')}
      </div>
      <div class="grid cards" style="margin-top:12px">
        ${roles.map(([id, title, text, tone]) => `
          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>${escapeHtml(title)}</h3>
                <p class="small muted">${escapeHtml(text)}</p>
              </div>
              ${badge('открыть', tone)}
            </div>
            <button class="quick-chip" type="button" data-health-saved-view="${escapeHtml(id)}">Перейти в режим</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function portalHealthUploadWizardHtml() {
  return `
    <div class="card sku-plan-fact-card" data-health-upload-wizard>
      <div class="section-subhead">
        <div>
          <h3>Загрузка файлов без страха</h3>
          <p class="small muted">Правило простое: сначала выгрузить форму, заполнить только рабочие колонки, загрузить обратно, посмотреть отчёт, потом применить.</p>
        </div>
        ${badge('есть откат', 'ok')}
      </div>
      <div class="kpi-strip" style="margin-top:12px">
        <div class="mini-kpi"><span>1</span><strong>Выгрузить форму</strong><span>из Контура SKU или План-факта</span></div>
        <div class="mini-kpi"><span>2</span><strong>Заполнить решение</strong><span>alias / ignore / new_sku / need_check</span></div>
        <div class="mini-kpi"><span>3</span><strong>Проверить отчёт</strong><span>сколько применится и что пропущено</span></div>
        <div class="mini-kpi"><span>4</span><strong>Применить или откатить</strong><span>журнал сохранит кто, когда и что поменял</span></div>
      </div>
      <div class="quick-actions" style="margin-top:12px">
        <button class="quick-chip" type="button" data-health-open="sku-contour">Открыть Контур SKU</button>
        <button class="quick-chip" type="button" data-health-open="sku-plan-fact">Открыть План-факт</button>
      </div>
    </div>
  `;
}

function portalHealthHistoryHtml() {
  const auditRows = skuContourAuditJournalRows(8);
  const taskRows = (state.storage?.tasks || []).slice(0, 8).map((task) => ({
    date: task.updatedAt || task.createdAt || '',
    title: task.title || task.name || task.articleKey || '',
    status: task.status || ''
  }));
  const auditHtml = auditRows.map((row) => `
    <div class="alert-row">
      <div><strong>${escapeHtml(row.kind)} · ${escapeHtml(row.apiSku || row.targetSku || '')}</strong><div class="muted small">${escapeHtml(row.platform || '')} · ${escapeHtml(row.actor || '')}</div></div>
      ${badge(fmt.date(row.appliedAt), 'info')}
    </div>
  `).join('');
  const taskHtml = taskRows.map((row) => `
    <div class="alert-row">
      <div><strong>${escapeHtml(row.title)}</strong><div class="muted small">${escapeHtml(row.status || '')}</div></div>
      ${badge(row.date ? fmt.date(row.date) : 'без даты', 'info')}
    </div>
  `).join('');
  return `
    <div class="card sku-plan-fact-card" data-health-history>
      <div class="section-subhead">
        <div>
          <h3>История изменений</h3>
          <p class="small muted">Видно, что уже применяли в справочниках и какие задачи появились. Это снижает страх “куда делась ошибка”.</p>
        </div>
        ${badge('журнал', 'info')}
      </div>
      <div class="two-col" style="margin-top:12px">
        <div><div class="muted small" style="margin-bottom:6px">Alias / ignore / откаты</div>${auditHtml || '<div class="empty">Пока нет применений через портал</div>'}</div>
        <div><div class="muted small" style="margin-bottom:6px">Последние задачи</div>${taskHtml || '<div class="empty">Задач пока нет</div>'}</div>
      </div>
    </div>
  `;
}

function portalHealthSkuPassportHtml() {
  const sku = (state.skus || []).find((item) => item?.articleKey) || null;
  return `
    <div class="card sku-plan-fact-card" data-health-sku-passport>
      <div class="section-subhead">
        <div>
          <h3>Единая карточка SKU</h3>
          <p class="small muted">Из любого раздела SKU открывается как паспорт товара: owner, задачи, решения, комментарии и рабочие сигналы. Следующий шаг — постепенно добавить туда цены, alias/API и репрайсерные причины.</p>
        </div>
        ${badge('единая точка', 'ok')}
      </div>
      <div class="quick-actions" style="margin-top:12px">
        ${sku ? `<button class="quick-chip" type="button" data-open-sku="${escapeHtml(sku.articleKey)}">Открыть пример SKU</button>` : ''}
        <button class="quick-chip" type="button" data-health-open="skus">Открыть Реестр SKU</button>
      </div>
    </div>
  `;
}

async function portalHealthCreateIssueTasks(options = {}) {
  const sourceRows = Array.isArray(options.rows) ? options.rows : portalHealthIssueRows(120);
  const rows = sourceRows.filter((row) => row.tone === 'danger' || row.tone === 'warn').slice(0, options.limit || 10);
  const result = { created: [], duplicates: [] };
  state.storage = state.storage || {};
  state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
  const existingIds = new Set(state.storage.tasks.map((task) => task.id).filter(Boolean));
  rows.forEach((row) => {
    const task = portalHealthBuildIssueTask(row);
    if (!task.id || existingIds.has(task.id)) {
      result.duplicates.push({ issue: row.key, taskId: task.id || '' });
      return;
    }
    existingIds.add(task.id);
    result.created.push(task);
  });
  if (options.persist === false || !result.created.length) return result;
  state.storage.tasks.unshift(...result.created);
  if (typeof saveLocalStorage === 'function') saveLocalStorage();
  for (const task of result.created) {
    try {
      if (typeof persistTask === 'function') await persistTask(task);
      if (typeof createTaskHistoryEntry === 'function') {
        await createTaskHistoryEntry(task.id, 'created', 'Задача создана из Центра здоровья данных.');
      }
    } catch (error) {
      console.error('[portal-health-issue-task]', error);
    }
  }
  return result;
}

function renderPortalDataHealth(rootId = 'view-data-health') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const health = state.syncHealth || {};
  const quality = state.portalDataQuality || {};
  const summary = quality.summary || {};
  const matrixSummary = state.skuMatrix?.summary || {};
  const sources = portalHealthSourceRows();
  const issues = portalHealthIssueRows();
  const rules = portalDataRules();
  const issueDiff = portalHealthSnapshotDiff(issues);
  const meta = typeof syncHealthStatusMeta === 'function'
    ? syncHealthStatusMeta(health)
    : { label: health.status || 'sync', tone: health.status === 'warning' ? 'warn' : 'ok', notice: health.status === 'warning' ? 'warn' : 'ok' };
  const dangerCount = issues.filter((row) => row.tone === 'danger').length;
  const warnCount = issues.filter((row) => row.tone === 'warn').length;
  const digestRows = portalHealthTodayDigestRows({ issues, sources, summary, dangerCount, warnCount });
  const changeHtml = portalHealthChangesHtml(issueDiff);
  const rulesHtml = portalHealthRulesHtml(rules);
  const sourceExplainHtml = portalHealthSourceExplanationHtml(summary);
  const workModesHtml = portalHealthWorkModesHtml();
  const uploadWizardHtml = portalHealthUploadWizardHtml();
  const historyHtml = portalHealthHistoryHtml();
  const skuPassportHtml = portalHealthSkuPassportHtml();
  const sourceRows = sources.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.label)}</strong></td>
      <td>${badge(row.status || 'ok', row.tone)}</td>
      <td>${escapeHtml(row.asOfDate || '—')}</td>
      <td>${escapeHtml(fmt.date(row.generatedAt || ''))}</td>
      <td>${fmt.int(row.rows)}</td>
      <td>${row.lagDays === null ? '—' : `${fmt.int(row.lagDays)} дн.`}</td>
    </tr>
  `).join('');
  const issueRows = issues.slice(0, 120).map((row) => `
    <tr>
      <td>${badge(row.tone === 'danger' ? 'критично' : row.tone === 'warn' ? 'внимание' : 'ok', row.tone)}</td>
      <td><strong>${escapeHtml(row.source)}</strong><div class="muted small">${escapeHtml(row.status || '')}</div></td>
      <td><strong>${escapeHtml(row.type)}</strong><div class="muted small">${escapeHtml(row.action || '')}</div></td>
      <td>${escapeHtml(row.platform || 'Все')}</td>
      <td><strong>${escapeHtml(row.apiSku || row.name || '—')}</strong><div class="muted small">${escapeHtml(row.name || '')}</div></td>
      <td><strong>${fmt.money(row.amount)}</strong><div class="muted small">${fmt.int(row.units)} шт.</div></td>
      <td><button class="quick-chip" type="button" data-health-open="${escapeHtml(row.view || 'data-health')}">Открыть</button></td>
    </tr>
  `).join('');
  const digestHtml = digestRows.map((row) => `
    <div class="mini-kpi ${row.tone || ''}">
      <span>${escapeHtml(row.title)}</span>
      <strong style="font-size:16px;line-height:1.25">${escapeHtml(row.text)}</strong>
      <span>утренний рабочий срез</span>
    </div>
  `).join('');

  root.innerHTML = `
    <div class="section-title sku-data-title">
      <div>
        <h2>Здоровье данных</h2>
        <p>Короткий контроль утреннего sync, качества данных и проблем, которые уже влияют на расчёты.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" type="button" data-health-refresh>Обновить</button>
        <button class="quick-chip" type="button" data-health-create-tasks>Создать задачи по топ-проблемам</button>
        <button class="quick-chip" type="button" data-health-open="sku-contour">Контур SKU</button>
        <button class="quick-chip" type="button" data-health-open="control">Задачи</button>
      </div>
    </div>

    <div class="notice ${meta.notice || (meta.tone === 'danger' ? 'warn' : 'ok')}">
      <div class="section-subhead">
        <div>
          <strong>${escapeHtml(meta.label || 'Sync')}</strong>
          <div class="small muted">Проверено: ${escapeHtml(fmt.date(health.generatedAt || health.publish?.checkedAt || quality.generatedAt || ''))} · данные до ${escapeHtml(health.freshness?.maxDate || summary.maxDate || '—')}</div>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(sources.length)} источников`, sources.some((row) => row.tone !== 'ok') ? 'warn' : 'ok')}
          ${badge(`${fmt.int(dangerCount)} критично`, dangerCount ? 'danger' : 'ok')}
          ${badge(`${fmt.int(warnCount)} внимание`, warnCount ? 'warn' : 'ok')}
          ${badge(fmt.money(summary.apiUnmappedRevenue || 0), summary.apiUnmappedRevenue ? 'warn' : 'ok')}
        </div>
      </div>
    </div>

    ${portalHealthLastGoodHtml()}

    <div class="kpi-strip" style="margin-top:14px">
      <div class="mini-kpi ${dangerCount ? 'danger' : ''}"><span>Проблемы</span><strong>${fmt.int(issues.length)}</strong><span>в единой очереди</span></div>
      <div class="mini-kpi warn"><span>API без пары</span><strong>${fmt.int(summary.apiUnmappedUniqueSku || matrixSummary.apiUnmappedCount || 0)}</strong><span>${fmt.money(summary.apiUnmappedRevenue || 0)}</span></div>
      <div class="mini-kpi"><span>Карантин</span><strong>${fmt.int(state.portalDataQuarantine?.summary?.rows || state.portalDataQuarantine?.rows?.length || 0)}</strong><span>не в расчётах</span></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(summary.skuMissingOwner || matrixSummary.missingOwnerCount || 0)}</strong><span>нужны ответственные</span></div>
      <div class="mini-kpi"><span>Alias</span><strong>${fmt.int(matrixSummary.aliasCount || skuPlanFactAliasRows(state.skuAliases || {}).length)}</strong><span>общий контур</span></div>
      <div class="mini-kpi"><span>Ignore</span><strong>${fmt.int(matrixSummary.ignoredApiSkuCount || skuPlanFactIgnorePayloadRows(state.skuAliasIgnore || {}).length)}</strong><span>закреплено</span></div>
    </div>

    <div class="dashboard-grid-3" style="margin-top:14px">
      ${changeHtml}
      ${rulesHtml}
    </div>

    <div class="card sku-plan-fact-card" style="margin-top:14px" data-health-morning-digest>
      <div class="section-subhead">
        <div>
          <h3>Утро: что проверить первым</h3>
          <p class="small muted">Короткая выжимка без лишней аналитики: свежесть, крупные проблемы, что уже закрепили и где деньги могут быть не в матрице.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(digestRows.length)} пункта`, 'info')}</div>
      </div>
      <div class="kpi-strip">${digestHtml}</div>
    </div>

    <div class="two-col" style="margin-top:14px">
      ${sourceExplainHtml}
      ${workModesHtml}
    </div>

    <div class="two-col" style="margin-top:14px">
      ${uploadWizardHtml}
      ${skuPassportHtml}
    </div>

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Что требует внимания</h3>
          <p class="small muted">Сюда сведены SKU-контур, карантин, предупреждения sync, риски дублей и строки без owner. Это не заменяет вкладки, а даёт один утренний список.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(issues.length)} строк`, issues.length ? 'warn' : 'ok')}</div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Уровень</th><th>Контур</th><th>Проблема</th><th>Площадка</th><th>SKU/API</th><th>Влияние</th><th></th></tr></thead>
          <tbody>${issueRows || '<tr><td colspan="7"><div class="empty">Критичных проблем по текущему срезу нет</div></td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:14px">
      ${historyHtml}
    </div>

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Свежесть источников</h3>
          <p class="small muted">Проверка, что утренний API/sync реально подгрузил данные, а не оставил старый или пустой источник.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(sources.filter((row) => row.tone !== 'ok').length)} не в норме`, sources.some((row) => row.tone !== 'ok') ? 'warn' : 'ok')}</div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Источник</th><th>Статус</th><th>Дата данных</th><th>Собрано</th><th>Строк</th><th>Лаг</th></tr></thead>
          <tbody>${sourceRows || '<tr><td colspan="6"><div class="empty">Нет данных по источникам</div></td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  root.querySelector('[data-health-refresh]')?.addEventListener('click', (event) => refreshSkuPlanFactData(event.currentTarget, rootId));
  root.querySelector('[data-health-create-tasks]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    try {
      button.disabled = true;
      button.textContent = 'Создаём...';
      const result = await portalHealthCreateIssueTasks({ limit: rules.autoTaskLimit || 10 });
      renderPortalDataHealth(rootId);
      if (typeof setAppError === 'function') setAppError(`Создано задач: ${fmt.int(result.created.length)} · уже были: ${fmt.int(result.duplicates.length)}.`);
    } finally {
      button.disabled = false;
      button.textContent = originalText || 'Создать задачи по топ-проблемам';
    }
  });
  root.querySelectorAll('[data-health-open]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof setView === 'function') setView(button.dataset.healthOpen || 'data-health');
    });
  });
  root.querySelector('[data-health-save-snapshot]')?.addEventListener('click', () => {
    portalHealthCommitIssueSnapshot(issues);
    renderPortalDataHealth(rootId);
    if (typeof setAppError === 'function') setAppError('Текущий срез проблем зафиксирован. Завтра портал покажет только новые и закрытые изменения.');
  });
  root.querySelector('[data-health-rules-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    portalSaveDataRules({
      stockRiskDays: form.get('stockRiskDays'),
      criticalRevenueRub: form.get('criticalRevenueRub'),
      staleSourceDays: form.get('staleSourceDays'),
      autoTaskLimit: form.get('autoTaskLimit')
    });
    renderPortalDataHealth(rootId);
    if (typeof setAppError === 'function') setAppError('Правила сохранены. Очередь проблем и складской порог пересчитаны.');
  });
  root.querySelectorAll('[data-health-saved-view]').forEach((button) => {
    button.addEventListener('click', () => portalHealthApplySavedView(button.dataset.healthSavedView || ''));
  });
  root.querySelectorAll('[data-health-explain]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = String(button.dataset.healthExplain || '');
      const text = {
        revenue: 'Выручка собирается из fact/API строк площадок. До попадания в портал строки проверяются на дубли, карантин и связь с матрицей SKU.',
        'api-unmapped': 'API без пары означает: площадка прислала SKU/offer_id, но портал не знает, к какому SKU реестра его отнести. Решение закрепляется через alias или ignore.',
        freshness: 'Свежесть считается по asOfDate/generatedAt каждого источника. Если лаг больше правила в настройках, источник подсвечивается.',
        quarantine: 'Карантин нужен, чтобы подозрительные строки не смешивались с нормальным расчётом. Их надо разбирать отдельно, а не молча считать.'
      }[key] || 'Для этой цифры пока нет отдельной расшифровки.';
      window.alert(text);
    });
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
  const skuHealth = health.skuContour || {};
  const skuHealthProblems = (skuHealth.checks || []).filter((check) => check.status && check.status !== 'ok');
  const quality = state.portalDataQuality?.summary || model.quality || {};
  const quarantine = state.portalDataQuarantine?.summary || {};
  const wbMissingInDistribution = numberOrZero(quality.wbOwnerMissingInDistribution || state.portalDataQuality?.wbOwnerDistributionSummary?.missingInDistributionCount || 0);
  const wbMissingInPortal = numberOrZero(quality.wbOwnerMissingInPortal || state.portalDataQuality?.wbOwnerDistributionSummary?.missingInPortalCount || 0);
  const auditEvents = skuPlanFactAuditEvents(state.skuAliasAudit || {}).slice(0, 8);
  const latestRollbackEvent = skuContourLatestRollbackableEvent();
  const allIssueRows = skuContourIssueRows(model);
  const activeMarket = skuDataActiveMarket();
  const scopedIssueRows = activeMarket === 'all'
    ? allIssueRows
    : allIssueRows.filter((row) => skuDataIssueMatchesPlatform(row, activeMarket));
  const showResolved = skuContourShowResolved();
  const onlyNew = skuContourOnlyNew();
  const resolvedIssueCount = scopedIssueRows.filter(skuContourIssueIsResolved).length;
  const newIssueCount = scopedIssueRows.filter((row) => row.status === 'new').length;
  let issueRows = showResolved ? scopedIssueRows : scopedIssueRows.filter((row) => !skuContourIssueIsResolved(row));
  if (onlyNew) issueRows = issueRows.filter((row) => row.status === 'new');
  const hiddenResolvedCount = resolvedIssueCount;
  const hiddenByCurrentFilterCount = scopedIssueRows.length - issueRows.length;
  const auditIndex = skuContourAuditIndex();
  const issueHtml = issueRows.slice(0, 120).map((row) => {
    const meta = skuContourStatusMeta(row.status);
    const history = skuContourAuditForRow(row, auditIndex);
    return `
      <tr>
        <td>${badge(meta.label, meta.tone)}</td>
        <td><strong>${escapeHtml(row.type || '—')}</strong><div class="muted small">${escapeHtml(row.action || '')}</div></td>
        <td>${escapeHtml(row.platform || 'Все')}</td>
        <td><strong>${escapeHtml(row.apiSku || '—')}</strong><div class="muted small">${escapeHtml(row.name || '')}</div></td>
        <td><strong>${fmt.money(row.revenue)}</strong><div class="muted small">${fmt.int(row.units)} шт.</div></td>
        <td>${history ? `<strong>${escapeHtml(history.kind)}</strong><div class="muted small">${escapeHtml(fmt.date(history.appliedAt))} · ${escapeHtml(history.actor)}</div>` : '<span class="muted">—</span>'}</td>
      </tr>
    `;
  }).join('');
  const journalHtml = skuContourAuditJournalRows().map((row) => `
    <tr>
      <td>${escapeHtml(fmt.date(row.appliedAt))}</td>
      <td>${badge(row.kind, row.kind === 'ignore' ? 'ok' : 'info')}</td>
      <td>${escapeHtml(row.platform || 'all')}</td>
      <td><strong>${escapeHtml(row.apiSku || '—')}</strong></td>
      <td>${escapeHtml(row.targetSku || '—')}</td>
      <td>${escapeHtml(row.actor || 'portal-user')}<div class="muted small">${escapeHtml(row.fileName || '')}</div></td>
    </tr>
  `).join('');
  const auditHtml = auditEvents.map((event) => `
    <tr>
      <td>${escapeHtml(fmt.date(event.appliedAt || event.generatedAt || ''))}</td>
      <td>${escapeHtml(event.actor || 'portal-user')}</td>
      <td>${escapeHtml(event.fileName || '—')}</td>
      <td>${fmt.int(event.aliasesAdded || 0)} alias / ${fmt.int(event.ignoresAdded || 0)} ignore</td>
      <td>${fmt.int(event.validationWarnings || 0)} warn</td>
      <td>${event.type === 'sku_alias_import_rollback' ? badge('откат', 'info') : event.rollback ? badge('версия', 'warn') : '<span class="muted">—</span>'}</td>
    </tr>
  `).join('');
  const contourPlatformBoardHtml = skuDataPlatformBoardHtml(model, { activeMarket, issueRows: allIssueRows });
  const contourGameCardsHtml = skuDataGameCardsHtml(skuDataSharedCards(
    model,
    activeMarket,
    (state.skus || []).filter((sku) => skuDataSkuBelongsToPlatform(sku, activeMarket)),
    scopedIssueRows
  ));

  root.innerHTML = `
    <div class="section-title sku-data-title">
      <div>
        <h2>Контур SKU</h2>
        <p>Единое место для API SKU без пары, alias/ignore, аудита и статуса утреннего sync.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" type="button" data-sku-contour-refresh>Обновить</button>
        <button class="quick-chip ${onlyNew ? 'active' : ''}" type="button" data-sku-contour-toggle-new>${onlyNew ? 'Все нерешённые' : `Только новые${newIssueCount ? ` (${fmt.int(newIssueCount)})` : ''}`}</button>
        <button class="quick-chip" type="button" data-sku-contour-toggle-resolved>${showResolved ? 'Скрыть решённые' : `Показать решённые${hiddenResolvedCount ? ` (${fmt.int(hiddenResolvedCount)})` : ''}`}</button>
        <button class="quick-chip" type="button" data-sku-contour-open-planfact>План-факт</button>
      </div>
    </div>

    ${contourPlatformBoardHtml}
    ${contourGameCardsHtml}

    <div class="notice ${healthMeta.notice} sku-data-muted-noise">
      <div class="section-subhead">
        <div>
          <strong>Sync: ${escapeHtml(healthMeta.label)}</strong>
          <div class="small muted">Проверено: ${escapeHtml(fmt.date(health.generatedAt || health.publish?.checkedAt || ''))} · данные до ${escapeHtml(health.freshness?.maxDate || quality.maxDate || '—')}</div>
          ${(health.publish?.blockingReasons || health.publish?.warnings || []).slice(0, 3).map((item) => `<div class="small muted">${escapeHtml(item)}</div>`).join('')}
          ${skuHealthProblems.slice(0, 3).map((item) => `<div class="small muted">${escapeHtml(item.message || item.name || '')}</div>`).join('')}
        </div>
        <div class="badge-stack">
          ${badge(healthMeta.label, healthMeta.tone)}
          ${skuHealth.status ? badge(`SKU contour: ${skuHealth.status}`, skuHealth.status === 'ok' ? 'ok' : skuHealth.status === 'blocked' ? 'danger' : 'warn') : ''}
          ${badge(`${fmt.int(quality.apiUnmappedUniqueSku || matrixSummary.apiUnmappedCount || 0)} API без пары`, (quality.apiUnmappedUniqueSku || matrixSummary.apiUnmappedCount) ? 'warn' : 'ok')}
          ${badge(`${fmt.int(wbMissingInDistribution)} WB вне распределения`, wbMissingInDistribution ? 'warn' : 'ok')}
          ${badge(`${fmt.int(quarantine.rows || 0)} в карантине`, quarantine.rows ? 'danger' : 'ok')}
          ${badge(fmt.money(quality.apiUnmappedRevenue || 0), quality.apiUnmappedRevenue ? 'warn' : 'ok')}
        </div>
      </div>
    </div>

    <div class="kpi-strip sku-data-muted-noise" style="margin-top:14px">
      <div class="mini-kpi"><span>SKU</span><strong>${fmt.int(matrixSummary.skuCount || (state.skus || []).length)}</strong><span>в матрице</span></div>
      <div class="mini-kpi warn"><span>Alias</span><strong>${fmt.int(matrixSummary.aliasCount || skuPlanFactAliasRows(state.skuAliases || {}).length)}</strong><span>общий справочник</span></div>
      <div class="mini-kpi"><span>Ignore</span><strong>${fmt.int(matrixSummary.ignoredApiSkuCount || skuPlanFactIgnorePayloadRows(state.skuAliasIgnore || {}).length)}</strong><span>осознанно не маппим</span></div>
      <div class="mini-kpi danger"><span>API без пары</span><strong>${fmt.int(matrixSummary.apiUnmappedCount || quality.apiUnmappedPlatformRows || 0)}</strong><span>из API источников</span></div>
      <div class="mini-kpi warn"><span>WB контур</span><strong>${fmt.int(wbMissingInDistribution)}</strong><span>есть в портале, нет в распределении</span></div>
      <div class="mini-kpi warn"><span>WB распределение</span><strong>${fmt.int(wbMissingInPortal)}</strong><span>есть в файле, нет в реестре</span></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(matrixSummary.missingOwnerCount || quality.skuMissingOwner || 0)}</strong><span>реестр / матрица</span></div>
      <div class="mini-kpi"><span>Аудит</span><strong>${fmt.int(auditEvents.length)}</strong><span>последние применения</span></div>
    </div>

    <details class="card sku-plan-fact-card sku-data-technical" style="margin-top:14px">
      <summary class="sku-data-technical-summary">Разбор API SKU</summary>
      <div class="sku-data-technical-body">
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
    </details>

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Рабочая очередь SKU</h3>
          <p class="small muted sku-data-muted-noise">По умолчанию показаны только нерешённые строки. Alias и ignore сохраняются в общий контур и скрываются из рабочей очереди после применения.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(issueRows.length)} в работе`, issueRows.length ? 'warn' : 'ok')}
          ${onlyNew ? badge('только новые', 'info') : ''}
          ${resolvedIssueCount ? badge(`${fmt.int(resolvedIssueCount)} решено`, 'ok') : ''}
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Статус</th><th>Проблема</th><th>Площадка</th><th>API / SKU</th><th>Сумма</th><th>Журнал</th></tr></thead>
          <tbody>${issueHtml || `<tr><td colspan="6"><div class="empty">${hiddenByCurrentFilterCount ? 'По текущему фильтру строк нет. Решённые или не новые строки скрыты кнопками сверху.' : 'Очередь ошибок пуста'}</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <details class="card sku-plan-fact-card sku-data-technical" style="margin-top:14px">
      <summary class="sku-data-technical-summary">Журнал API SKU</summary>
      <div class="sku-data-technical-body">
      <div class="section-subhead">
        <div>
          <h3>Журнал по API SKU</h3>
          <p class="small muted">Последние решения по конкретным API SKU: что связали alias, что отправили в ignore, кто и каким файлом применил.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(skuContourAuditJournalRows().length)} записей`, journalHtml ? 'info' : '')}</div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Дата</th><th>Решение</th><th>Площадка</th><th>API SKU</th><th>target_sku</th><th>Кто / файл</th></tr></thead>
          <tbody>${journalHtml || '<tr><td colspan="6"><div class="empty">Журнал пока пуст: alias/ignore ещё не применяли через портал</div></td></tr>'}</tbody>
        </table>
      </div>
      </div>
    </details>

    <details class="card sku-plan-fact-card sku-data-technical" style="margin-top:14px">
      <summary class="sku-data-technical-summary">Аудит применений</summary>
      <div class="sku-data-technical-body">
      <div class="section-subhead">
        <div>
          <h3>Аудит применений</h3>
          <p class="small muted">Кто и каким файлом менял alias/ignore. Хранится в общем snapshot sku_alias_audit.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(skuPlanFactAuditEvents(state.skuAliasAudit || {}).length)} событий`, auditEvents.length ? 'info' : '')}
          ${latestRollbackEvent ? '<button class="quick-chip" type="button" data-sku-contour-rollback-latest>Откатить последнее</button>' : ''}
          <button class="quick-chip" type="button" data-sku-contour-download-audit>Скачать аудит</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Дата</th><th>Пользователь</th><th>Файл</th><th>Применено</th><th>Warnings</th><th>Версия</th></tr></thead>
          <tbody>${auditHtml || '<tr><td colspan="6"><div class="empty">Применений пока не было</div></td></tr>'}</tbody>
        </table>
      </div>
      </div>
    </details>
  `;

  root.querySelector('[data-sku-contour-refresh]')?.addEventListener('click', (event) => refreshSkuPlanFactData(event.currentTarget, rootId));
  root.querySelectorAll('[data-market-filter]').forEach((button) => button.addEventListener('click', (event) => {
    state.filters.market = event.currentTarget.dataset.marketFilter || 'all';
    state.filters.owner = 'all';
    renderSkuContour(rootId);
  }));
  root.querySelector('[data-sku-contour-toggle-new]')?.addEventListener('click', () => {
    state.skuContourOnlyNew = !skuContourOnlyNew();
    renderSkuContour(rootId);
  });
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
  root.querySelector('[data-sku-contour-rollback-latest]')?.addEventListener('click', async (event) => {
    const latest = skuContourLatestRollbackableEvent();
    if (!latest) return;
    if (!window.confirm('Откатить последнее применение alias/ignore? Это вернёт общий контур к состоянию до этой загрузки.')) return;
    await skuContourRollbackAliasImport(latest.id, event.currentTarget, rootId);
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
  const planLimit = metric.planDrr ?? planDrr;
  const drrTone = metric.drr !== null && planLimit !== null && planLimit !== undefined && metric.drr > planLimit ? 'danger-text' : '';
  return `
    <div><strong>${fmt.money(metric.factRevenue)}</strong> <span class="muted small">/ ${fmt.money(metric.planToDateRevenue)}</span></div>
    <div class="muted small">${fmt.int(metric.factUnits)} шт. / план ${fmt.int(metric.planToDateUnits)} шт.</div>
    <div class="badge-stack" style="margin-top:6px">
      ${badge(fmt.pct(metric.completionToDate), skuPlanFactTone(metric.completionToDate))}
      ${metric.drr !== null ? `<span class="chip ${drrTone ? 'danger' : ''}">ДРР ${fmt.pct(metric.drr)}</span>` : ''}
      ${metric.planDrr !== null && metric.planDrr !== undefined ? `<span class="chip info">план ${fmt.pct(metric.planDrr)}</span>` : ''}
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

function skuPlanFactCompletionLevel(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 0;
  const ratio = Number(value);
  if (ratio >= 1.2) return 5;
  if (ratio >= 1) return 4;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.5) return 2;
  return ratio > 0 ? 1 : 0;
}

function skuPlanFactPlatformHue(platform = '') {
  return {
    wb: 275,
    ozon: 212,
    ya: 42,
    goldapple: 146,
    letu: 330,
    magnit: 4
  }[platform] ?? 205;
}

function skuPlanFactCardStyle(platform = '', completion = null) {
  const level = skuPlanFactCompletionLevel(completion);
  const ratio = completion === null || completion === undefined || !Number.isFinite(Number(completion))
    ? 0.12
    : Math.min(1.35, Math.max(0.05, Number(completion)));
  const fill = 0.08 + Math.min(0.34, ratio * 0.24);
  const rowFill = Math.min(0.12, fill * 0.32);
  const border = 0.18 + Math.min(0.5, ratio * 0.3);
  const glow = 0.04 + Math.min(0.18, ratio * 0.12);
  const progress = Math.min(100, Math.max(0, ratio * 100));
  return `--pf-hue:${skuPlanFactPlatformHue(platform)};--pf-fill:${fill.toFixed(3)};--pf-row-fill:${rowFill.toFixed(3)};--pf-border:${border.toFixed(3)};--pf-glow:${glow.toFixed(3)};--pf-progress:${progress.toFixed(1)}%;--pf-level:${level}`;
}

function skuPlanFactPlatformSummary(model = {}, platform = '', options = {}) {
  const rows = options.scope === 'allRows'
    ? (model.allRows || [])
    : (model.platformBaseRows || model.allRows || []);
  const summary = rows.reduce((acc, row) => {
    const metric = row.platforms?.[platform] || row[platform] || null;
    if (!skuPlanFactPlatformHasActivity(metric)) return acc;
    acc.planRevenue += numberOrZero(metric.planRevenue);
    acc.planToDateRevenue += numberOrZero(metric.planToDateRevenue);
    acc.factRevenue += numberOrZero(metric.factRevenue);
    acc.planUnits += numberOrZero(metric.planUnits);
    acc.factUnits += numberOrZero(metric.factUnits);
    acc.adSpend += numberOrZero(metric.adSpend);
    if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
      acc.planAdSpend += numberOrZero(metric.planAdSpend);
      acc.hasPlanAdSpend = true;
    }
    if (metric.planMonthAdSpend !== null && metric.planMonthAdSpend !== undefined) {
      acc.planMonthAdSpend += numberOrZero(metric.planMonthAdSpend);
      acc.hasPlanMonthAdSpend = true;
    }
    if (metric.planPeriodAdSpend !== null && metric.planPeriodAdSpend !== undefined) {
      acc.planPeriodAdSpend += numberOrZero(metric.planPeriodAdSpend);
      acc.hasPlanPeriodAdSpend = true;
    }
    if (metric.adForecastSpend !== null && metric.adForecastSpend !== undefined) {
      acc.adForecastSpend += numberOrZero(metric.adForecastSpend);
      acc.hasAdForecastSpend = true;
    }
    acc.rows += 1;
    if (numberOrZero(metric.planToDateRevenue) > 0 && numberOrZero(metric.factRevenue) < numberOrZero(metric.planToDateRevenue)) acc.underPlan += 1;
    skuPlanFactMergeDailyIntoMap(acc.dailyMap, metric.factDaily);
    const marginPct = skuPlanFactNormalizeRatio(metric.marginPct);
    const marginWeight = numberOrZero(metric.factRevenue) || numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue);
    if (marginPct !== null && marginWeight > 0) {
      acc.marginValue += marginPct * marginWeight;
      acc.marginWeight += marginWeight;
    }
    const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
    const planMarginWeight = numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue);
    if (planMarginPct !== null && planMarginWeight > 0) {
      acc.planMarginValue += planMarginPct * planMarginWeight;
      acc.planMarginWeight += planMarginWeight;
    }
    return acc;
  }, { platform, rows: 0, underPlan: 0, planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, planUnits: 0, factUnits: 0, adSpend: 0, planAdSpend: 0, planMonthAdSpend: 0, planPeriodAdSpend: 0, adForecastSpend: 0, hasPlanAdSpend: false, hasPlanMonthAdSpend: false, hasPlanPeriodAdSpend: false, hasAdForecastSpend: false, marginValue: 0, marginWeight: 0, planMarginValue: 0, planMarginWeight: 0, dailyMap: new Map() });
  summary.label = skuPlanFactPlatformLabel(platform);
  summary.completionToDate = summary.planToDateRevenue > 0 ? summary.factRevenue / summary.planToDateRevenue : null;
  summary.completionMonth = summary.planRevenue > 0 ? summary.factRevenue / summary.planRevenue : null;
  summary.gapToDate = summary.factRevenue - summary.planToDateRevenue;
  summary.drr = summary.factRevenue > 0 ? summary.adSpend / summary.factRevenue : null;
  summary.planAdSpend = summary.hasPlanAdSpend ? summary.planAdSpend : null;
  summary.planAdSpendToDate = summary.planAdSpend;
  summary.planMonthAdSpend = summary.hasPlanMonthAdSpend ? summary.planMonthAdSpend : null;
  summary.planPeriodAdSpend = summary.hasPlanPeriodAdSpend ? summary.planPeriodAdSpend : null;
  summary.adForecastSpend = summary.hasAdForecastSpend ? summary.adForecastSpend : null;
  skuPlanFactFinalizeAdPace(summary, model.monthKey || '', model.elapsedDays || model.periodDays || 0, model.periodStart || '');
  summary.planDrr = summary.planToDateRevenue > 0 && summary.planAdSpend !== null ? summary.planAdSpend / summary.planToDateRevenue : null;
  summary.marginPct = summary.marginWeight > 0 ? summary.marginValue / summary.marginWeight : null;
  summary.marginRub = summary.marginPct === null ? null : summary.factRevenue * summary.marginPct;
  summary.planMarginPct = summary.planMarginWeight > 0 ? summary.planMarginValue / summary.planMarginWeight : null;
  summary.planMarginRub = summary.planMarginPct === null ? null : summary.planToDateRevenue * summary.planMarginPct;
  summary.factDaily = skuPlanFactDailyArrayFromMap(summary.dailyMap);
  summary.scoreHistory = skuPlanFactBuildScoreHistory(summary, model.monthKey || '', model.periodStart || '', model.periodEnd || model.selectedDate || '');
  summary.completionDelta = skuPlanFactCompletionDelta(summary.scoreHistory);
  const payrollSupersededByIuDrr = Boolean(model.payrollKpi?.supersededByIuDrr)
    && (platform === 'all' || platform === 'wb' || platform === 'ozon');
  if (payrollSupersededByIuDrr) {
    summary.truthSource = 'iu_drr_summary';
  }
  const payrollMetric = payrollSupersededByIuDrr
    ? null
    : (platform === 'all' ? model.payrollKpi : model.payrollKpi?.platforms?.[platform]);
  if (payrollMetric) {
    summary.payrollKpi = true;
    summary.salaryIncluded = true;
    if (platform === 'all') {
      summary.rows = model.allRows?.length || summary.rows;
      summary.underPlan = numberOrZero(model.totals?.underPlan);
      summary.planUnits = numberOrZero(model.totals?.planUnits);
      summary.factUnits = numberOrZero(model.totals?.factUnits);
      summary.adSpend = numberOrZero(model.totals?.adSpend);
      summary.planAdSpend = model.totals?.planAdSpend ?? summary.planAdSpend;
      summary.planAdSpendToDate = model.totals?.planAdSpendToDate ?? summary.planAdSpendToDate;
      summary.planMonthAdSpend = model.totals?.planMonthAdSpend ?? summary.planMonthAdSpend;
      summary.planPeriodAdSpend = model.totals?.planPeriodAdSpend ?? summary.planPeriodAdSpend;
      summary.adForecastSpend = model.totals?.adForecastSpend ?? summary.adForecastSpend;
      summary.adCompletionToDate = model.totals?.adCompletionToDate ?? summary.adCompletionToDate;
      summary.adForecastCompletion = model.totals?.adForecastCompletion ?? summary.adForecastCompletion;
      summary.adGapToDate = model.totals?.adGapToDate ?? summary.adGapToDate;
      summary.adForecastGap = model.totals?.adForecastGap ?? summary.adForecastGap;
      summary.planDrr = model.totals?.planDrr ?? summary.planDrr;
      summary.marginPct = model.totals?.marginPct ?? summary.marginPct;
      summary.marginRub = model.totals?.marginRub ?? summary.marginRub;
      summary.planMarginPct = model.totals?.planMarginPct ?? summary.planMarginPct;
      summary.planMarginRub = model.totals?.planMarginRub ?? summary.planMarginRub;
      summary.drr = model.totals?.drr ?? summary.drr;
    }
    summary.planRevenue = payrollMetric.planRevenue;
    summary.planToDateRevenue = payrollMetric.planToDateRevenue;
    summary.factRevenue = payrollMetric.factRevenue;
    summary.completionToDate = payrollMetric.completionToDate;
    summary.completionMonth = payrollMetric.completionMonth;
    summary.gapToDate = payrollMetric.gapToDate;
    if (payrollMetric.adSpend !== undefined) summary.adSpend = numberOrZero(payrollMetric.adSpend);
    if (payrollMetric.planAdSpend !== undefined) summary.planAdSpend = payrollMetric.planAdSpend;
    if (payrollMetric.planAdSpendToDate !== undefined) summary.planAdSpendToDate = payrollMetric.planAdSpendToDate;
    if (payrollMetric.planPeriodAdSpend !== undefined) summary.planPeriodAdSpend = payrollMetric.planPeriodAdSpend;
    if (payrollMetric.adForecastSpend !== undefined) summary.adForecastSpend = payrollMetric.adForecastSpend;
    if (payrollMetric.adCompletionToDate !== undefined) summary.adCompletionToDate = payrollMetric.adCompletionToDate;
    if (payrollMetric.adForecastCompletion !== undefined) summary.adForecastCompletion = payrollMetric.adForecastCompletion;
    if (payrollMetric.adGapToDate !== undefined) summary.adGapToDate = payrollMetric.adGapToDate;
    if (payrollMetric.adForecastGap !== undefined) summary.adForecastGap = payrollMetric.adForecastGap;
    summary.scoreHistory = skuPlanFactBuildScoreHistory(summary, model.monthKey || '', model.payrollKpi?.periodStart || model.periodStart || '', model.payrollKpi?.periodEnd || model.periodEnd || '');
    summary.completionDelta = skuPlanFactCompletionDelta(summary.scoreHistory);
  } else if (model.payrollKpi?.excludedPlatforms?.includes(platform)) {
    summary.payrollKpi = true;
    summary.salaryIncluded = false;
    summary.planRevenue = 0;
    summary.planToDateRevenue = 0;
    summary.completionToDate = null;
    summary.completionMonth = null;
    summary.gapToDate = summary.factRevenue;
  }
  return summary;
}

function skuPlanFactHistoryTapeHtml(history = [], platform = '', options = {}) {
  const points = (history || [])
    .filter((item) => item.completionToDate !== null && item.completionToDate !== undefined)
    .slice(options.compact ? -4 : -5);
  if (!points.length) return '';
  return `
    <span class="sku-score-tape ${options.compact ? 'compact' : ''}" style="${skuPlanFactCardStyle(platform, points[points.length - 1]?.completionToDate)}">
      ${points.map((item) => {
        const day = String(item.date || '').slice(8, 10) || '•';
        return `<span title="${escapeHtml(item.date || '')}"><b>${escapeHtml(day)}</b><em>${fmt.pct(item.completionToDate)}</em></span>`;
      }).join('')}
    </span>
  `;
}

function skuPlanFactDeltaHtml(delta = null) {
  if (delta === null || delta === undefined || !Number.isFinite(Number(delta))) return '';
  const value = Number(delta);
  const sign = value > 0 ? '+' : '';
  const tone = value > 0 ? 'ok-text' : (value < 0 ? 'danger-text' : 'muted');
  return `<em class="${tone}">Δ ${sign}${(value * 100).toFixed(1)} п.п.</em>`;
}

function skuPlanFactDominantPlatform(row = {}) {
  const item = SKU_PLAN_FACT_PLATFORMS
    .map((platform) => ({ platform, metric: row.platforms?.[platform] || row[platform] || null }))
    .filter((entry) => skuPlanFactPlatformHasActivity(entry.metric))
    .sort((left, right) => numberOrZero(right.metric?.factRevenue) - numberOrZero(left.metric?.factRevenue))[0];
  return item?.platform || 'all';
}

function skuPlanFactHealthBarHtml(config = {}) {
  const platform = config.platform || 'all';
  const rawValue = Number(config.valueRatio);
  const ratio = Number.isFinite(rawValue) ? rawValue : 0;
  const width = Math.min(100, Math.max(0, ratio * 100));
  const tone = config.tone || '';
  return `
    <div class="sku-health ${tone}" style="${skuPlanFactCardStyle(platform, ratio)}">
      <div class="sku-health__head">
        <span>${escapeHtml(config.label || '')}</span>
        <strong>${config.valueHtml || escapeHtml(config.valueText || '')}</strong>
      </div>
      <span class="sku-health__bar"><i style="width:${width.toFixed(1)}%"></i><em>${escapeHtml(config.barText || config.valueText || '')}</em></span>
      ${config.historyHtml || ''}
      ${(config.metaHtml || config.subText) ? `<div class="sku-health__meta">${config.metaHtml || `<em>${escapeHtml(config.subText || '')}</em>`}</div>` : ''}
    </div>
  `;
}

function skuPlanFactPlatformBoardHtml(model = {}) {
  const activePlatform = model.filters?.platform || 'all';
  return `
    <div class="sku-plan-platform-board">
      ${(model.platforms || SKU_PLAN_FACT_PLATFORMS).map((platform) => {
        const summary = skuPlanFactPlatformSummary(model, platform, { scope: 'allRows' });
        const level = skuPlanFactCompletionLevel(summary.completionToDate);
        const active = activePlatform === platform;
        return `
          <button class="sku-plan-platform-card level-${level} ${active ? 'active' : ''}" type="button" data-sku-plan-fact-platform-card="${escapeHtml(platform)}" aria-pressed="${active ? 'true' : 'false'}" style="${skuPlanFactCardStyle(platform, summary.completionToDate)}">
            <span class="sku-plan-platform-card__top">
              <strong>${escapeHtml(summary.label)}</strong>
              <em>${fmt.int(summary.rows)} SKU</em>
            </span>
            <span class="sku-plan-platform-card__value">${fmt.pct(summary.completionToDate)}</span>
            <span class="sku-plan-platform-card__meta">${fmt.money(summary.factRevenue)} / ${fmt.money(summary.planToDateRevenue)}</span>
            <span class="sku-plan-platform-card__bar"><i></i></span>
            ${skuPlanFactHistoryTapeHtml(summary.scoreHistory, platform, { compact: true })}
            <span class="sku-plan-platform-card__foot">
              <b class="${skuPlanFactDeltaClass(summary.gapToDate)}">${fmt.money(summary.gapToDate)}</b>
              <span>${skuPlanFactDeltaHtml(summary.completionDelta) || `<em>${fmt.int(summary.underPlan)} ниже плана</em>`}</span>
            </span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function skuDataActiveMarket() {
  state.filters = state.filters || {};
  if (!state.filters.market) state.filters.market = 'all';
  const market = String(state.filters.market || 'all').toLowerCase();
  return market === 'ym' ? 'ya' : market;
}

function skuDataPlatformLabel(platform = 'all') {
  return platform === 'all' ? 'Все площадки' : skuPlanFactPlatformLabel(platform);
}

function skuDataSkuBelongsToPlatform(sku = {}, platform = 'all') {
  const key = String(platform || 'all').toLowerCase();
  if (key === 'all') return true;
  if (key === 'wb') return Boolean(sku?.flags?.hasWB || registryOwnerByMarket(sku, key));
  if (key === 'ozon') return Boolean(sku?.flags?.hasOzon || registryOwnerByMarket(sku, key));
  return Boolean(registryOwnerByMarket(sku, key));
}

function skuDataIssueMatchesPlatform(row = {}, platform = 'all') {
  const key = String(platform || 'all').toLowerCase();
  if (key === 'all') return true;
  const keys = skuContourPlatformKeys(row.platform || 'all');
  return keys.includes(key) || keys.includes('all');
}

function skuDataWorkFlag(sku = {}, platform = 'all') {
  const key = String(platform || 'all').toLowerCase();
  if (key === 'wb') return Boolean(sku?.flags?.toWorkWB || sku?.flags?.toWork);
  if (key === 'ozon') return Boolean(sku?.flags?.toWorkOzon || sku?.flags?.toWork);
  if (key === 'all') return Boolean(sku?.flags?.toWork || sku?.flags?.toWorkWB || sku?.flags?.toWorkOzon);
  return Boolean(registryOwnerByMarket(sku, key) || sku?.flags?.toWork);
}

function skuDataPlatformStats(model = {}, platform = 'all', issueRows = []) {
  const key = String(platform || 'all').toLowerCase();
  const skus = (state.skus || []).filter((sku) => skuDataSkuBelongsToPlatform(sku, key));
  const ownerCount = skus.filter((sku) => registryOwnersForFilter(sku, key).length > 0).length;
  const workCount = skus.filter((sku) => skuDataWorkFlag(sku, key)).length;
  const issues = (issueRows || []).filter((row) => skuDataIssueMatchesPlatform(row, key));
  const summary = key === 'all'
    ? {
        platform: 'all',
        label: skuDataPlatformLabel('all'),
        rows: model.allRows?.length || skus.length,
        completionToDate: model.totals?.completionToDate ?? null,
        factRevenue: numberOrZero(model.totals?.factRevenue),
        planToDateRevenue: numberOrZero(model.totals?.planToDateRevenue),
        gapToDate: numberOrZero(model.totals?.gapToDate)
      }
    : skuPlanFactPlatformSummary(model, key, { scope: 'allRows' });
  const ownerCoverage = skus.length ? ownerCount / skus.length : null;
  const issueLoad = skus.length ? Math.min(1, issues.length / Math.max(1, skus.length)) : (issues.length ? 1 : 0);
  const contourHealth = issues.length ? Math.max(0, 1 - issueLoad) : 1;
  return {
    platform: key,
    label: skuDataPlatformLabel(key),
    skuCount: skus.length,
    ownerCount,
    workCount,
    issueCount: issues.length,
    ownerCoverage,
    contourHealth,
    summary
  };
}

function skuDataPlatformBoardHtml(model = {}, options = {}) {
  const activeMarket = options.activeMarket || skuDataActiveMarket();
  const issueRows = options.issueRows || [];
  const platforms = ['all', ...SKU_PLAN_FACT_PLATFORMS];
  return `
    <div class="sku-data-platform-board">
      ${platforms.map((platform) => {
        const stats = skuDataPlatformStats(model, platform, issueRows);
        const summary = stats.summary || {};
        const completion = summary.completionToDate ?? stats.ownerCoverage;
        const active = activeMarket === platform;
        const level = skuPlanFactCompletionLevel(completion);
        const value = summary.completionToDate !== null && summary.completionToDate !== undefined
          ? fmt.pct(summary.completionToDate)
          : `${fmt.int(stats.skuCount)} SKU`;
        const meta = summary.planToDateRevenue > 0
          ? `${fmt.money(summary.factRevenue)} / ${fmt.money(summary.planToDateRevenue)}`
          : `${fmt.int(stats.ownerCount)} / ${fmt.int(stats.skuCount)} owner`;
        return `
          <button class="sku-plan-platform-card sku-data-platform-card level-${level} ${active ? 'active' : ''}" type="button" data-market-filter="${escapeHtml(platform)}" aria-pressed="${active ? 'true' : 'false'}" style="${skuPlanFactCardStyle(platform, completion)}">
            <span class="sku-plan-platform-card__top">
              <strong>${escapeHtml(stats.label)}</strong>
              <em>${fmt.int(stats.skuCount)} SKU</em>
            </span>
            <span class="sku-plan-platform-card__value">${value}</span>
            <span class="sku-plan-platform-card__meta">${meta}</span>
            <span class="sku-plan-platform-card__bar"><i></i></span>
            <span class="sku-plan-platform-card__foot">
              <b class="${stats.issueCount ? 'danger-text' : 'ok-text'}">${stats.issueCount ? `${fmt.int(stats.issueCount)} сигналов` : 'чисто'}</b>
              <span><em>${fmt.int(stats.workCount)} в работе</em></span>
            </span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function skuDataToneForRatio(ratio = null, reverse = false) {
  if (ratio === null || ratio === undefined || !Number.isFinite(Number(ratio))) return '';
  const value = Number(ratio);
  if (reverse) {
    if (value <= 0.05) return 'ok';
    if (value <= 0.18) return 'warn';
    return 'danger';
  }
  if (value >= 0.9) return 'ok';
  if (value >= 0.75) return 'warn';
  return 'danger';
}

function skuDataGameCardsHtml(cards = []) {
  if (!cards.length) return '';
  return `
    <div class="sku-data-game-cards">
      ${cards.map((card) => skuPlanFactHealthBarHtml(card)).join('')}
    </div>
  `;
}

function skuDataSharedCards(model = {}, activeMarket = 'all', items = [], issueRows = []) {
  const stats = skuDataPlatformStats(model, activeMarket, issueRows);
  const ownerCoverage = items.length ? items.filter((sku) => registryOwnersForFilter(sku, activeMarket).length > 0).length / items.length : stats.ownerCoverage;
  const workRatio = items.length ? items.filter((sku) => skuDataWorkFlag(sku, activeMarket)).length / items.length : null;
  const externalRatio = items.length ? items.filter((sku) => sku?.flags?.hasExternalTraffic).length / items.length : null;
  const issueRatio = items.length ? Math.min(1, stats.issueCount / Math.max(1, items.length)) : (stats.issueCount ? 1 : 0);
  const summary = stats.summary || {};
  return [
    {
      label: 'План-факт',
      valueRatio: summary.completionToDate ?? null,
      valueText: summary.completionToDate == null ? '—' : fmt.pct(summary.completionToDate),
      barText: summary.completionToDate == null ? 'нет плана' : fmt.pct(summary.completionToDate),
      subText: `${fmt.money(summary.factRevenue || 0)} / ${fmt.money(summary.planToDateRevenue || 0)}`,
      platform: activeMarket,
      tone: skuDataToneForRatio(summary.completionToDate)
    },
    {
      label: 'Owner',
      valueRatio: ownerCoverage,
      valueText: ownerCoverage == null ? '—' : fmt.pct(ownerCoverage),
      barText: ownerCoverage == null ? '—' : fmt.pct(ownerCoverage),
      subText: `${fmt.int(stats.ownerCount)} / ${fmt.int(stats.skuCount)} SKU`,
      platform: activeMarket,
      tone: skuDataToneForRatio(ownerCoverage)
    },
    {
      label: 'Контур данных',
      valueRatio: 1 - issueRatio,
      valueText: stats.issueCount ? `${fmt.int(stats.issueCount)} сигналов` : 'чисто',
      barText: stats.issueCount ? `${fmt.int(Math.max(0, Math.round((1 - issueRatio) * 100)))}%` : '100%',
      subText: 'alias / API / owner',
      platform: activeMarket,
      tone: skuDataToneForRatio(issueRatio, true)
    },
    {
      label: 'В работе',
      valueRatio: workRatio,
      valueText: `${fmt.int(stats.workCount)} SKU`,
      barText: workRatio == null ? '—' : fmt.pct(workRatio),
      subText: 'фокус по выбранной площадке',
      platform: activeMarket,
      tone: stats.workCount ? 'warn' : 'ok'
    },
    {
      label: 'Внешний трафик',
      valueRatio: externalRatio,
      valueText: externalRatio == null ? '—' : fmt.pct(externalRatio),
      barText: externalRatio == null ? '—' : fmt.pct(externalRatio),
      subText: `${fmt.int(items.filter((sku) => sku?.flags?.hasKZ).length)} КЗ / ${fmt.int(items.filter((sku) => sku?.flags?.hasVK).length)} VK`,
      platform: activeMarket,
      tone: externalRatio ? 'warn' : 'ok'
    }
  ];
}

function skuPlanFactIuDrrPayrollMetric(model = {}, platform = '', fallback = {}) {
  const periodControl = skuPlanFactIuDrrControlTotals(platform, model.monthKey || '', model.periodStart || '', model.periodEnd || model.selectedDate || '', false);
  if (!periodControl) return fallback || {};
  const monthControl = skuPlanFactIuDrrControlTotals(platform, model.monthKey || '', model.periodStart || '', model.periodEnd || model.selectedDate || '', true);
  const planRevenue = numberOrZero(monthControl?.planRevenue) || numberOrZero(fallback?.planRevenue) || numberOrZero(periodControl.planRevenue);
  const planToDateRevenue = numberOrZero(periodControl.planRevenue);
  const factRevenue = numberOrZero(periodControl.factRevenue);
  const metric = {
    ...(fallback || {}),
    platform,
    label: skuPlanFactPlatformLabel(platform),
    salaryIncluded: true,
    planRevenue,
    planToDateRevenue,
    factRevenue,
    completionToDate: planToDateRevenue > 0 ? factRevenue / planToDateRevenue : null,
    completionMonth: planRevenue > 0 ? factRevenue / planRevenue : null,
    gapToDate: factRevenue - planToDateRevenue,
    adSpend: numberOrZero(periodControl.adSpend),
    planAdSpend: numberOrZero(periodControl.planAdSpend),
    planMonthAdSpend: monthControl?.planAdSpend !== null && monthControl?.planAdSpend !== undefined ? numberOrZero(monthControl.planAdSpend) : null,
    truthSource: periodControl.source || 'iu_drr_summary'
  };
  return skuPlanFactFinalizeAdPace(metric, model.monthKey || '', model.elapsedDays || model.periodDays || 0, model.periodStart || '');
}

function skuPlanFactPayrollDisplayModel(model = {}) {
  const payroll = model.payrollKpi;
  if (!payroll) return null;
  if (!payroll.supersededByIuDrr) return payroll;
  const platforms = { ...(payroll.platforms || {}) };
  ['wb', 'ozon'].forEach((platform) => {
    platforms[platform] = skuPlanFactIuDrrPayrollMetric(model, platform, platforms[platform]);
  });
  const selectedPlatform = payroll.selectedPlatform || 'all';
  const includedPlatforms = selectedPlatform === 'all'
    ? SKU_PLAN_FACT_PAYROLL_PLATFORMS
    : [selectedPlatform].filter((platform) => SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(platform));
  const total = includedPlatforms.reduce((acc, platform) => {
    const metric = platforms[platform] || {};
    acc.planRevenue += numberOrZero(metric.planRevenue);
    acc.planToDateRevenue += numberOrZero(metric.planToDateRevenue);
    acc.factRevenue += numberOrZero(metric.factRevenue);
    acc.adSpend += numberOrZero(metric.adSpend);
    if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
      acc.planAdSpend += numberOrZero(metric.planAdSpend);
      acc.hasPlanAdSpend = true;
    }
    if (metric.planMonthAdSpend !== null && metric.planMonthAdSpend !== undefined) {
      acc.planMonthAdSpend += numberOrZero(metric.planMonthAdSpend);
      acc.hasPlanMonthAdSpend = true;
    }
    if (metric.planPeriodAdSpend !== null && metric.planPeriodAdSpend !== undefined) {
      acc.planPeriodAdSpend += numberOrZero(metric.planPeriodAdSpend);
      acc.hasPlanPeriodAdSpend = true;
    }
    if (metric.adForecastSpend !== null && metric.adForecastSpend !== undefined) {
      acc.adForecastSpend += numberOrZero(metric.adForecastSpend);
      acc.hasAdForecastSpend = true;
    }
    return acc;
  }, { planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, adSpend: 0, planAdSpend: 0, planMonthAdSpend: 0, planPeriodAdSpend: 0, adForecastSpend: 0, hasPlanAdSpend: false, hasPlanMonthAdSpend: false, hasPlanPeriodAdSpend: false, hasAdForecastSpend: false });
  total.planAdSpend = total.hasPlanAdSpend ? total.planAdSpend : null;
  total.planMonthAdSpend = total.hasPlanMonthAdSpend ? total.planMonthAdSpend : null;
  total.planPeriodAdSpend = total.hasPlanPeriodAdSpend ? total.planPeriodAdSpend : null;
  total.adForecastSpend = total.hasAdForecastSpend ? total.adForecastSpend : null;
  skuPlanFactFinalizeAdPace(total, payroll.monthKey || '', payroll.elapsedDays || 0, payroll.periodStart || '');
  return {
    ...payroll,
    platforms,
    planRevenue: total.planRevenue,
    planToDateRevenue: total.planToDateRevenue,
    factRevenue: total.factRevenue,
    completionToDate: total.planToDateRevenue > 0 ? total.factRevenue / total.planToDateRevenue : null,
    completionMonth: total.planRevenue > 0 ? total.factRevenue / total.planRevenue : null,
    gapToDate: total.factRevenue - total.planToDateRevenue,
    adSpend: total.adSpend,
    planAdSpend: total.planAdSpend,
    planAdSpendToDate: total.planAdSpendToDate,
    planMonthAdSpend: total.planMonthAdSpend,
    planPeriodAdSpend: total.planPeriodAdSpend,
    adForecastSpend: total.adForecastSpend,
    adCompletionToDate: total.adCompletionToDate,
    adForecastCompletion: total.adForecastCompletion,
    adGapToDate: total.adGapToDate,
    adForecastGap: total.adForecastGap,
    truthSource: 'iu_drr_summary',
    displayTitle: 'Общее выполнение',
    displayNote: 'WB/Ozon из ИУ / ДРР, Яндекс из зарплатного прогноза.'
  };
}

function skuPlanFactPayrollXpLevel(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 0;
  const ratio = Number(value);
  if (ratio >= 1.05) return 4;
  if (ratio >= 1) return 3;
  if (ratio >= 0.9) return 2;
  return 1;
}

function skuPlanFactPayrollXpHue(value) {
  const level = skuPlanFactPayrollXpLevel(value);
  if (level >= 3) return 145;
  if (level === 2) return 42;
  if (level === 1) return 5;
  return 212;
}

function skuPlanFactPayrollForecast(payroll = {}) {
  const elapsedDays = numberOrZero(payroll.elapsedDays);
  const monthDays = numberOrZero(payroll.monthDays) || skuPlanFactMonthDays(payroll.monthKey || '');
  const factRevenue = numberOrZero(payroll.factRevenue);
  const planRevenue = numberOrZero(payroll.planRevenue);
  if (elapsedDays <= 0 || monthDays <= 0 || factRevenue <= 0 || planRevenue <= 0) {
    return { revenue: null, ratio: null, gap: null };
  }
  const revenue = factRevenue / elapsedDays * monthDays;
  return {
    revenue,
    ratio: revenue / planRevenue,
    gap: revenue - planRevenue
  };
}

function skuPlanFactPayrollKpiHtml(model = {}) {
  const payroll = skuPlanFactPayrollDisplayModel(model);
  if (!payroll) return '';
  const ratio = Number(payroll.completionToDate);
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, ratio) : 0;
  const progress = Math.min(100, safeRatio * 100);
  const forecast = skuPlanFactPayrollForecast(payroll);
  const forecastRatio = Number(forecast.ratio);
  const forecastProgress = Number.isFinite(forecastRatio) ? Math.min(100, Math.max(0, forecastRatio * 100)) : progress;
  const hue = skuPlanFactPayrollXpHue(payroll.completionToDate);
  const brightness = (0.3 + Math.min(0.7, safeRatio * 0.5)).toFixed(3);
  const level = skuPlanFactPayrollXpLevel(payroll.completionToDate);
  const gapText = payroll.gapToDate >= 0 ? `перевыполнение ${fmt.money(payroll.gapToDate)}` : `разрыв ${fmt.money(Math.abs(payroll.gapToDate))}`;
  const statusText = level >= 3 ? 'в плане на дату' : (level === 2 ? 'почти в плане' : 'нужно догнать');
  const title = [
    `Факт: ${fmt.money(payroll.factRevenue)}`,
    `План к дате: ${fmt.money(payroll.planToDateRevenue)}`,
    `Разница к дате: ${fmt.money(payroll.gapToDate)}`,
    `Месячный план: ${fmt.money(payroll.planRevenue)}`,
    forecast.revenue !== null ? `Прогноз месяца: ${fmt.money(forecast.revenue)} (${fmt.pct(forecast.ratio)})` : ''
  ].filter(Boolean).join('');
  return `
    <div class="card sku-plan-fact-card salary-plan-kpi-card level-${level}" style="margin-top:14px;--xp-hue:${hue};--xp-progress:${progress.toFixed(1)}%;--xp-forecast:${forecastProgress.toFixed(1)}%;--xp-bright:${brightness}" title="${escapeHtml(title)}">
      <div class="sku-salary-xp-head">
        <div>
          <h3>${escapeHtml(payroll.displayTitle || 'Общее выполнение')}</h3>
          <p class="small muted">${escapeHtml(payroll.displayNote || 'WB/Ozon из ИУ / ДРР, Яндекс из зарплатного прогноза.')}</p>
        </div>
        <div class="badge-stack">
          ${badge(payroll.truthSource === 'iu_drr_summary' ? 'ИУ / ДРР' : 'KPI', payroll.truthSource === 'iu_drr_summary' ? 'ok' : 'info')}
        </div>
      </div>
      <div class="sku-salary-xp-main">
        <div class="sku-salary-xp-score">
          <span>уровень выполнения</span>
          <strong>${fmt.pct(payroll.completionToDate)}</strong>
          <em>${escapeHtml(statusText)}</em>
        </div>
        <div class="sku-salary-xp-track" aria-label="Общее выполнение" title="${escapeHtml(title)}">
          <i></i>
          <span class="sku-salary-xp-forecast-mark" style="left:var(--xp-forecast)" title="Прогноз месяца"></span>
        </div>
        <div class="sku-salary-xp-delta ${payroll.gapToDate >= 0 ? 'ok' : 'danger'}">
          <span>разница к плану на дату</span>
          <strong>${escapeHtml(gapText)}</strong>
        </div>
      </div>
      <div class="sku-salary-xp-stats">
        <span><em>факт</em><b>${fmt.money(payroll.factRevenue)}</b></span>
        <span><em>план к дате</em><b>${fmt.money(payroll.planToDateRevenue)}</b></span>
        <span><em>месячный план</em><b>${fmt.money(payroll.planRevenue)}</b></span>
        <span><em>прогноз месяца</em><b>${forecast.revenue === null ? '—' : fmt.money(forecast.revenue)}</b></span>
      </div>
    </div>
  `;
}

function skuPlanFactDisplayMetric(row = {}, model = {}) {
  const platform = model.filters?.platform || 'all';
  if (platform !== 'all') {
    const metric = row.platforms?.[platform] || row[platform] || {};
    return {
      platform,
      label: skuPlanFactPlatformLabel(platform),
      planRevenue: numberOrZero(metric.planRevenue),
      planToDateRevenue: numberOrZero(metric.planToDateRevenue),
      factRevenue: numberOrZero(metric.factRevenue),
      planUnits: numberOrZero(metric.planUnits),
      planToDateUnits: numberOrZero(metric.planToDateUnits),
      factUnits: numberOrZero(metric.factUnits),
      completionToDate: metric.completionToDate ?? null,
      gapToDate: numberOrZero(metric.gapToDate),
      adSpend: numberOrZero(metric.adSpend),
      drr: metric.drr ?? null,
      planAdSpend: metric.planAdSpend ?? null,
      planAdSpendToDate: metric.planAdSpendToDate ?? metric.planAdSpend ?? null,
      planMonthAdSpend: metric.planMonthAdSpend ?? null,
      planPeriodAdSpend: metric.planPeriodAdSpend ?? metric.planMonthAdSpend ?? metric.planAdSpend ?? null,
      adForecastSpend: metric.adForecastSpend ?? null,
      adCompletionToDate: metric.adCompletionToDate ?? null,
      adForecastCompletion: metric.adForecastCompletion ?? null,
      adGapToDate: metric.adGapToDate ?? null,
      adForecastGap: metric.adForecastGap ?? null,
      adElapsedDays: metric.adElapsedDays || model.elapsedDays || model.periodDays || 0,
      adForecastDays: metric.adForecastDays || skuPlanFactAdForecastDays(model.monthKey || '', model.elapsedDays || model.periodDays || 0, model.periodStart || ''),
      planDrr: metric.planDrr ?? null,
      planAdSource: metric.planAdSource || '',
      marginPct: skuPlanFactNormalizeRatio(metric.marginPct),
      marginRub: metric.marginRub ?? (skuPlanFactNormalizeRatio(metric.marginPct) === null ? null : numberOrZero(metric.factRevenue) * skuPlanFactNormalizeRatio(metric.marginPct)),
      factMarginPct: skuPlanFactNormalizeRatio(metric.factMarginPct),
      planMarginPct: skuPlanFactNormalizeRatio(metric.planMarginPct),
      planMarginRub: metric.planMarginRub ?? (skuPlanFactNormalizeRatio(metric.planMarginPct) === null ? null : numberOrZero(metric.planToDateRevenue) * skuPlanFactNormalizeRatio(metric.planMarginPct)),
      marginIsPlanFallback: Boolean(metric.marginIsPlanFallback),
      marginSource: metric.marginSource || '',
      planMarginSource: metric.planMarginSource || '',
      scoreHistory: metric.scoreHistory || [],
      completionDelta: metric.completionDelta ?? null,
      stock: metric.stock ?? null,
      turnoverDays: metric.turnoverDays ?? null,
      tonePlatform: platform
    };
  }
  const dominantPlatform = skuPlanFactDominantPlatform(row);
  return {
    platform: 'all',
    label: 'Итого',
    planRevenue: row.planRevenue,
    planToDateRevenue: row.planToDateRevenue,
    factRevenue: row.factRevenue,
    planUnits: row.planUnits,
    planToDateUnits: row.planUnits > 0 && row.planRevenue > 0 ? row.planUnits * row.planToDateRevenue / row.planRevenue : 0,
    factUnits: row.factUnits,
    completionToDate: row.completionToDate,
    gapToDate: row.gapToDate,
    adSpend: row.adSpend,
    drr: row.drr,
    planAdSpend: row.planAdSpend ?? null,
    planAdSpendToDate: row.planAdSpendToDate ?? row.planAdSpend ?? null,
    planMonthAdSpend: row.planMonthAdSpend ?? null,
    planPeriodAdSpend: row.planPeriodAdSpend ?? row.planMonthAdSpend ?? row.planAdSpend ?? null,
    adForecastSpend: row.adForecastSpend ?? null,
    adCompletionToDate: row.adCompletionToDate ?? null,
    adForecastCompletion: row.adForecastCompletion ?? null,
    adGapToDate: row.adGapToDate ?? null,
    adForecastGap: row.adForecastGap ?? null,
    adElapsedDays: row.adElapsedDays || model.elapsedDays || model.periodDays || 0,
    adForecastDays: row.adForecastDays || skuPlanFactAdForecastDays(model.monthKey || '', model.elapsedDays || model.periodDays || 0, model.periodStart || ''),
    planDrr: row.planDrr ?? null,
    planAdSource: '',
    marginPct: skuPlanFactNormalizeRatio(row.marginPct),
    marginRub: row.marginRub,
    factMarginPct: null,
    planMarginPct: skuPlanFactNormalizeRatio(row.planMarginPct),
    planMarginRub: row.planMarginRub,
    marginIsPlanFallback: false,
    marginSource: '',
    planMarginSource: '',
    scoreHistory: row.scoreHistory || [],
    completionDelta: row.completionDelta ?? null,
    stock: null,
    turnoverDays: null,
    tonePlatform: dominantPlatform
  };
}

function skuPlanFactProgressHtml(value) {
  const ratio = value === null || value === undefined || !Number.isFinite(Number(value)) ? 0 : Number(value);
  const width = Math.min(100, Math.max(0, ratio * 100));
  return `<span class="sku-plan-fact-progress"><i style="width:${width.toFixed(1)}%"></i></span>`;
}

function skuPlanFactCompletionHtml(metric = {}) {
  const platform = metric.tonePlatform || metric.platform || 'all';
  return skuPlanFactHealthBarHtml({
    platform,
    label: 'Выполнение',
    valueRatio: metric.completionToDate,
    valueText: fmt.pct(metric.completionToDate),
    barText: fmt.pct(metric.completionToDate),
    tone: skuPlanFactTone(metric.completionToDate),
    historyHtml: skuPlanFactHistoryTapeHtml(metric.scoreHistory, platform, { compact: true }),
    metaHtml: `
      <b class="${skuPlanFactDeltaClass(metric.gapToDate)}">${fmt.money(metric.gapToDate)}</b>
      ${skuPlanFactDeltaHtml(metric.completionDelta)}
    `
  });
}

function skuPlanFactPlatformScopeHtml(row = {}, model = {}) {
  const activePlatform = model.filters?.platform || 'all';
  if (activePlatform !== 'all') {
    const metric = row.platforms?.[activePlatform] || row[activePlatform] || {};
    return `
      <div class="sku-plan-platform-scope">
        <span class="chip info">${escapeHtml(skuPlanFactPlatformLabel(activePlatform))}</span>
        <div class="muted small">${fmt.int(metric.factUnits)} шт. факт · остаток ${fmt.int(metric.stock)}</div>
        <div class="muted small">оборач. ${fmt.num(metric.turnoverDays, 1)} дн.</div>
      </div>
    `;
  }
  const chips = SKU_PLAN_FACT_PLATFORMS
    .map((platform) => ({ platform, metric: row.platforms?.[platform] || row[platform] || null }))
    .filter((item) => skuPlanFactPlatformHasActivity(item.metric))
    .sort((left, right) => numberOrZero(right.metric?.factRevenue) - numberOrZero(left.metric?.factRevenue))
    .slice(0, 4);
  return `
    <div class="sku-plan-platform-minis">
      ${chips.length ? chips.map(({ platform, metric }) => `
        <span class="sku-plan-platform-mini level-${skuPlanFactCompletionLevel(metric.completionToDate)}" style="${skuPlanFactCardStyle(platform, metric.completionToDate)}">
          <b>${escapeHtml(skuPlanFactPlatformLabel(platform))}</b>
          <em>${fmt.pct(metric.completionToDate)}</em>
        </span>
      `).join('') : '<span class="muted small">нет активности</span>'}
    </div>
  `;
}

function skuPlanFactFactPlanHtml(metric = {}) {
  const platform = metric.tonePlatform || metric.platform || 'all';
  return skuPlanFactHealthBarHtml({
    platform,
    label: 'Факт / план',
    valueRatio: metric.completionToDate,
    valueText: fmt.pct(metric.completionToDate),
    barText: fmt.pct(metric.completionToDate),
    tone: skuPlanFactTone(metric.completionToDate),
    metaHtml: `
      <b>${fmt.money(metric.factRevenue)}</b>
      <em>план ${fmt.money(metric.planToDateRevenue)}</em>
      <em>${fmt.int(metric.factUnits)} / ${fmt.int(metric.planToDateUnits)} шт.</em>
    `
  });
}

function skuPlanFactMarginHtml(metric = {}) {
  const marginPct = skuPlanFactNormalizeRatio(metric.marginPct);
  const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
  const tone = skuPlanFactMarginTone(marginPct);
  const target = planMarginPct ?? 0.3;
  const metaHtml = [
    `<b>${fmt.money(metric.marginRub)}</b>`,
    planMarginPct !== null ? `<em>план ${fmt.pct(planMarginPct)} · ${fmt.money(metric.planMarginRub)}</em>` : '<em>план —</em>',
    metric.marginIsPlanFallback ? '<em>факт маржи не пришёл, показана экономика SKU</em>' : ''
  ].filter(Boolean).join(' · ');
  return skuPlanFactHealthBarHtml({
    platform: metric.tonePlatform || metric.platform || 'all',
    label: 'Маржа',
    valueRatio: marginPct === null ? 0 : marginPct / target,
    valueText: fmt.pct(marginPct),
    barText: fmt.pct(marginPct),
    tone,
    metaHtml
  });
}

function skuPlanFactAdHtml(metric = {}, model = {}) {
  const platform = metric.platform || 'all';
  const tonePlatform = metric.tonePlatform || platform || 'all';
  const limit = metric.planDrr ?? (platform !== 'all' ? model.planDrrByPlatform?.[platform] : model.totals?.planDrr) ?? null;
  const drrDanger = metric.drr !== null && metric.drr !== undefined && limit !== null && limit !== undefined && metric.drr > limit;
  const drrTone = metric.drr === null || metric.drr === undefined
    ? ''
    : (drrDanger ? 'danger-text' : (metric.drr > 0.2 ? 'warn-text' : 'ok-text'));
  const planToDate = metric.planAdSpendToDate ?? metric.planAdSpend ?? (platform === 'all' ? model.totals?.planAdSpendToDate ?? model.totals?.planAdSpend : null);
  const planPeriod = metric.planPeriodAdSpend ?? metric.planMonthAdSpend ?? planToDate;
  const forecastSpend = metric.adForecastSpend ?? null;
  const completion = metric.adForecastCompletion ?? metric.adCompletionToDate ?? null;
  const tone = drrDanger ? 'danger' : skuPlanFactTone(completion);
  const valueRatio = completion === null || completion === undefined || !Number.isFinite(Number(completion))
    ? 0
    : Math.max(0, Number(completion));
  const forecastLabel = metric.adForecastDays && metric.adElapsedDays && metric.adForecastDays > metric.adElapsedDays
    ? 'прогноз месяца'
    : 'прогноз периода';
  const planMetaRows = [
    planToDate !== null && planToDate !== undefined ? `план к дате ${fmt.money(planToDate)}` : 'план к дате —',
    forecastSpend !== null && forecastSpend !== undefined && planPeriod !== null && planPeriod !== undefined
      ? `${forecastLabel} ${fmt.money(forecastSpend)} / ${fmt.money(planPeriod)}`
      : '',
    metric.drr !== null && metric.drr !== undefined
      ? `ДРР ${fmt.pct(metric.drr)}${limit !== null && limit !== undefined ? ` · план ${fmt.pct(limit)}` : ''}`
      : ''
  ].filter(Boolean);
  return skuPlanFactHealthBarHtml({
    platform: tonePlatform,
    label: 'Реклама',
    valueRatio,
    valueText: completion === null || completion === undefined ? '—' : fmt.pct(completion),
    barText: completion === null || completion === undefined ? '—' : fmt.pct(completion),
    tone,
    metaHtml: `<b>${fmt.money(metric.adSpend)}</b>${planMetaRows.map((item) => `<em>${item}</em>`).join('')}${drrTone ? `<em class="${drrTone}">${drrDanger ? 'ДРР выше плана' : 'ДРР под контролем'}</em>` : ''}`
  });
}

function skuPlanFactRowHtml(row, model) {
  const metric = skuPlanFactDisplayMetric(row, model);
  const totalTone = skuPlanFactTone(metric.completionToDate);
  const articleTitle = row.article || row.articleKey;
  const problemMeta = row.matrixProblemMeta || (typeof skuMatrixProblemMeta === 'function' ? skuMatrixProblemMeta(row.matrixProblemState || 'ok') : null);
  const problemBadge = problemMeta && row.matrixProblemState && row.matrixProblemState !== 'ok'
    ? badge(problemMeta.label, problemMeta.tone || 'warn')
    : '';
  const articleHtml = row.syntheticUnmapped
    ? `<strong>${escapeHtml(articleTitle)}</strong><div class="badge-stack" style="margin-top:6px">${badge(row.status || SKU_PLAN_FACT_UNMAPPED_STATUS, 'warn')}</div>`
    : linkToSku(row.articleKey, articleTitle);
  const openAttr = row.syntheticUnmapped ? '' : ` data-open-sku="${escapeHtml(row.articleKey)}"`;
  const attention = skuPlanFactAttentionScore(row) > 0 || (metric.completionToDate !== null && (metric.completionToDate < 0.9 || metric.completionToDate > 1.2));
  return `
    <tr class="sku-plan-fact-row ${row.syntheticUnmapped ? 'is-unmapped' : ''} ${attention ? 'is-attention' : ''}" style="${skuPlanFactCardStyle(metric.tonePlatform || metric.platform, metric.completionToDate)}"${openAttr}>
      <td>${articleHtml}<div class="muted small">${escapeHtml(row.name)}</div></td>
      <td><strong>${escapeHtml(row.owner)}</strong><div class="muted small">${escapeHtml(row.status)}</div>${problemBadge ? `<div class="badge-stack" style="margin-top:6px">${problemBadge}</div>` : ''}</td>
      <td>${skuPlanFactPlatformScopeHtml(row, model)}</td>
      <td>${skuPlanFactCompletionHtml(metric)}</td>
      <td>${skuPlanFactFactPlanHtml(metric)}</td>
      <td>${skuPlanFactMarginHtml(metric)}</td>
      <td>${skuPlanFactAdHtml(metric, model)}</td>
      <td>
        ${row.syntheticUnmapped
          ? '<span class="muted small">нет карточки</span>'
          : `<button class="sku-plan-open-card ${attention ? 'danger' : ''}" type="button" data-open-sku="${escapeHtml(row.articleKey)}" title="Открыть карточку SKU" aria-label="Открыть карточку SKU"></button>`}
      </td>
    </tr>
  `;
}

function skuPlanFactExportColumns() {
  const columns = [
    ['period_from', 'Период с'],
    ['period_to', 'Период по'],
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
      [`plan_${suffix}_to_date_revenue`, `План ${label} за период, ₽`],
      [`fact_${suffix}_revenue`, `Факт ${label}, ₽`],
      [`plan_${suffix}_units`, `План ${label}, шт`],
      [`fact_${suffix}_units`, `Факт ${label}, шт`],
      [`completion_${suffix}_to_date_pct`, `Выполнение ${label} за период, %`],
      [`avg_check_${suffix}_fact`, `Средний чек ${label} факт`],
      [`avg_check_${suffix}_plan`, `Средний чек ${label} план`],
      [`margin_${suffix}_pct`, `Маржа ${label}, %`],
      [`margin_${suffix}_rub`, `Маржа ${label}, ₽`],
      [`plan_margin_${suffix}_pct`, `План маржи ${label}, %`],
      [`plan_margin_${suffix}_rub`, `План маржи ${label}, ₽`],
      [`drr_${suffix}`, `ДРР ${label}`],
      [`ad_spend_${suffix}`, `Реклама ${label}, ₽`],
      [`plan_drr_${suffix}`, `План ДРР ${label}`],
      [`plan_ad_spend_${suffix}`, `План рекламы ${label} за период, ₽`],
      [`plan_ad_spend_${suffix}_to_date`, `План рекламы ${label} к дате, ₽`],
      [`ad_forecast_${suffix}`, `Прогноз рекламы ${label}, ₽`],
      [`ad_completion_${suffix}_to_date_pct`, `Выполнение рекламы ${label} к дате, %`],
      [`ad_completion_${suffix}_forecast_pct`, `Прогноз выполнения рекламы ${label}, %`],
      [`turnover_${suffix}_days`, `Оборачиваемость ${label}, дн`],
      [`stock_${suffix}`, `Остаток ${label}`]
    );
  });
  columns.push(
    ['plan_total_revenue', 'План всего, ₽'],
    ['plan_total_to_date_revenue', 'План всего за период, ₽'],
    ['fact_total_revenue', 'Факт всего, ₽'],
    ['completion_total_to_date_pct', 'Выполнение всего за период, %'],
    ['gap_total_to_date', 'Отклонение за период, ₽'],
    ['margin_total_pct', 'Маржа всего, %'],
    ['margin_total_rub', 'Маржа всего, ₽'],
    ['plan_margin_total_pct', 'План маржи всего, %'],
    ['plan_margin_total_rub', 'План маржи всего, ₽'],
    ['drr_total', 'ДРР total'],
    ['plan_drr_total', 'План ДРР total'],
    ['ad_spend_total', 'Реклама total, ₽'],
    ['plan_ad_spend_total', 'План рекламы total за период, ₽'],
    ['plan_ad_spend_total_to_date', 'План рекламы total к дате, ₽'],
    ['ad_forecast_total', 'Прогноз рекламы total, ₽'],
    ['ad_completion_total_to_date_pct', 'Выполнение рекламы total к дате, %'],
    ['ad_completion_total_forecast_pct', 'Прогноз выполнения рекламы total, %']
  );
  return columns;
}

function skuPlanFactExportRows(rows, model) {
  return rows.map((row) => {
    const payload = {
      period_from: model.periodStart || model.dateMin || '',
      period_to: model.periodEnd || model.maxFactDate || '',
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
      payload[`margin_${suffix}_pct`] = skuPlanFactNormalizeRatio(metric.marginPct) === null ? '' : skuPlanFactNormalizeRatio(metric.marginPct);
      payload[`margin_${suffix}_rub`] = metric.marginRub === null || metric.marginRub === undefined ? '' : Math.round(metric.marginRub);
      payload[`plan_margin_${suffix}_pct`] = skuPlanFactNormalizeRatio(metric.planMarginPct) === null ? '' : skuPlanFactNormalizeRatio(metric.planMarginPct);
      payload[`plan_margin_${suffix}_rub`] = metric.planMarginRub === null || metric.planMarginRub === undefined ? '' : Math.round(metric.planMarginRub);
      payload[`drr_${suffix}`] = metric.drr === null ? '' : metric.drr;
      payload[`ad_spend_${suffix}`] = Math.round(metric.adSpend || 0);
      payload[`plan_drr_${suffix}`] = metric.planDrr === null || metric.planDrr === undefined ? '' : metric.planDrr;
      payload[`plan_ad_spend_${suffix}`] = metric.planAdSpend === null || metric.planAdSpend === undefined ? '' : Math.round(metric.planAdSpend);
      payload[`plan_ad_spend_${suffix}_to_date`] = metric.planAdSpendToDate === null || metric.planAdSpendToDate === undefined ? '' : Math.round(metric.planAdSpendToDate);
      payload[`ad_forecast_${suffix}`] = metric.adForecastSpend === null || metric.adForecastSpend === undefined ? '' : Math.round(metric.adForecastSpend);
      payload[`ad_completion_${suffix}_to_date_pct`] = metric.adCompletionToDate === null || metric.adCompletionToDate === undefined ? '' : metric.adCompletionToDate;
      payload[`ad_completion_${suffix}_forecast_pct`] = metric.adForecastCompletion === null || metric.adForecastCompletion === undefined ? '' : metric.adForecastCompletion;
      payload[`turnover_${suffix}_days`] = metric.turnoverDays === null ? '' : metric.turnoverDays;
      payload[`stock_${suffix}`] = metric.stock === null ? '' : Math.round(metric.stock);
    });
    payload.plan_total_revenue = Math.round(row.planRevenue || 0);
    payload.plan_total_to_date_revenue = Math.round(row.planToDateRevenue || 0);
    payload.fact_total_revenue = Math.round(row.factRevenue || 0);
    payload.completion_total_to_date_pct = row.completionToDate === null ? '' : row.completionToDate;
    payload.gap_total_to_date = Math.round(row.gapToDate || 0);
    payload.margin_total_pct = row.marginPct === null ? '' : row.marginPct;
    payload.margin_total_rub = row.marginRub === null ? '' : Math.round(row.marginRub || 0);
    payload.plan_margin_total_pct = row.planMarginPct === null || row.planMarginPct === undefined ? '' : row.planMarginPct;
    payload.plan_margin_total_rub = row.planMarginRub === null || row.planMarginRub === undefined ? '' : Math.round(row.planMarginRub || 0);
    payload.drr_total = row.drr === null ? '' : row.drr;
    payload.plan_drr_total = row.planDrr === null || row.planDrr === undefined ? '' : row.planDrr;
    payload.ad_spend_total = Math.round(row.adSpend || 0);
    payload.plan_ad_spend_total = row.planAdSpend === null || row.planAdSpend === undefined ? '' : Math.round(row.planAdSpend || 0);
    payload.plan_ad_spend_total_to_date = row.planAdSpendToDate === null || row.planAdSpendToDate === undefined ? '' : Math.round(row.planAdSpendToDate || 0);
    payload.ad_forecast_total = row.adForecastSpend === null || row.adForecastSpend === undefined ? '' : Math.round(row.adForecastSpend || 0);
    payload.ad_completion_total_to_date_pct = row.adCompletionToDate === null || row.adCompletionToDate === undefined ? '' : row.adCompletionToDate;
    payload.ad_completion_total_forecast_pct = row.adForecastCompletion === null || row.adForecastCompletion === undefined ? '' : row.adForecastCompletion;
    return payload;
  });
}

function downloadSkuPlanFactExcel(model) {
  const now = Date.now();
  if (skuPlanFactExcelDownloadLockUntil && now < skuPlanFactExcelDownloadLockUntil) return;
  skuPlanFactExcelDownloadLockUntil = now + 1500;
  if (!model.rows.length) {
    window.alert('По текущим фильтрам нет строк для выгрузки.');
    skuPlanFactExcelDownloadLockUntil = 0;
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

const OOS_CONTROL_STATUS_META = {
  oos: { label: 'OOS', tone: 'danger', priority: 'critical' },
  critical: { label: 'Критично', tone: 'danger', priority: 'critical' },
  risk: { label: 'OOS скоро <10 д', tone: 'warn', priority: 'high' },
  watch: { label: 'Наблюдать', tone: 'info', priority: 'medium' }
};

const OOS_CONTROL_TASK_STATUSES = ['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision', 'done'];

function oosControlPayload() {
  return state.oosControl && typeof state.oosControl === 'object'
    ? state.oosControl
    : { schema: 'portal-oos-control-v1', generatedAt: '', summary: {}, rows: [], history: { days: [] } };
}

function oosControlRows() {
  const payload = oosControlPayload();
  return Array.isArray(payload.rows) ? payload.rows : [];
}

function oosControlFilters() {
  state.oosControlFilters = state.oosControlFilters && typeof state.oosControlFilters === 'object'
    ? state.oosControlFilters
    : {};
  return {
    search: String(state.oosControlFilters.search || '').trim(),
    platform: String(state.oosControlFilters.platform || 'all'),
    owner: String(state.oosControlFilters.owner || 'all'),
    department: String(state.oosControlFilters.department || 'all'),
    status: String(state.oosControlFilters.status || 'active')
  };
}

function oosControlTaskFor(row = {}) {
  const tasks = Array.isArray(state.storage?.tasks) ? state.storage.tasks : [];
  const taskId = String(row.taskId || '').trim();
  if (taskId) {
    const byId = tasks.find((task) => task.id === taskId);
    if (byId) return byId;
  }
  const issueKey = String(row.issueKey || '').trim();
  if (!issueKey) return null;
  const marker = `[oos:${issueKey}]`;
  return tasks
    .filter((task) => task?.autoCode === 'oos_control' && String(task.reason || '').includes(marker))
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || '') || 0;
      const rightTime = Date.parse(right.updatedAt || right.createdAt || '') || 0;
      return rightTime - leftTime;
    })[0] || null;
}

function oosControlTaskStatusLabel(task) {
  if (!task) return 'Нет задачи';
  const meta = TASK_STATUS_META[task.status] || TASK_STATUS_META.new;
  return meta.label || task.status || 'Задача';
}

function oosControlStatusTone(status = '') {
  return OOS_CONTROL_STATUS_META[status]?.tone || '';
}

function oosControlPriority(row = {}) {
  return OOS_CONTROL_STATUS_META[row.status]?.priority || (row.severity === 'critical' ? 'critical' : 'high');
}

function oosControlDue(row = {}) {
  if (row.status === 'oos' || row.status === 'critical') return plusDays(1);
  if (row.status === 'risk') return plusDays(2);
  return plusDays(5);
}

function oosControlUnique(rows, key) {
  return [...new Set(rows.map((row) => String(row?.[key] || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ru'));
}

function oosControlOptions(values, selected, allLabel) {
  return [
    `<option value="all" ${selected === 'all' ? 'selected' : ''}>${escapeHtml(allLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(value)}</option>`)
  ].join('');
}

function oosControlTaskStatusOptions(selected) {
  return OOS_CONTROL_TASK_STATUSES
    .map((status) => {
      const meta = TASK_STATUS_META[status] || { label: status };
      return `<option value="${escapeHtml(status)}" ${selected === status ? 'selected' : ''}>${escapeHtml(meta.label || status)}</option>`;
    })
    .join('');
}

function oosControlHasRemoteStore() {
  if (typeof hasRemoteStore === 'function') return hasRemoteStore();
  return Boolean(state.team?.ready && (state.team.accessToken || state.team.client));
}

function oosControlCanUseRemote() {
  try {
    const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
    return Boolean(cfg?.teamMode === 'supabase' && cfg?.supabase?.url && cfg?.supabase?.anonKey);
  } catch {
    return false;
  }
}

async function oosControlEnsureRemoteReady() {
  if (oosControlHasRemoteStore()) return true;
  if (!oosControlCanUseRemote() || typeof initTeamStore !== 'function') return false;
  await initTeamStore();
  return oosControlHasRemoteStore();
}

function oosControlTeamNotice() {
  const remoteReady = oosControlHasRemoteStore();
  const canUseRemote = oosControlCanUseRemote();
  const note = String(state.team?.note || '').trim();
  if (remoteReady) {
    return `
      <div class="notice ok">
        <strong>Командная база подключена.</strong>
        <div class="muted small" style="margin-top:4px">${escapeHtml(note || 'OOS-задачи и контрмеры сохраняются для всей команды.')}</div>
      </div>
    `;
  }
  return `
    <div class="notice danger">
      <strong>Командная база задач не подключена.</strong>
      <div class="muted small" style="margin-top:4px">${escapeHtml(canUseRemote ? (note || 'Портал попробует переподключиться перед сохранением OOS-задачи.') : 'Сейчас сохранение останется только в этом браузере.')}</div>
      ${canUseRemote ? '<div class="actions" style="margin-top:8px;justify-content:flex-start"><button class="quick-chip" type="button" data-oos-reconnect-team>Подключить командную базу</button></div>' : ''}
    </div>
  `;
}

function oosControlFilteredRows() {
  const rows = oosControlRows();
  const filters = oosControlFilters();
  const search = filters.search.toLowerCase();
  return rows.filter((row) => {
    const task = oosControlTaskFor(row);
    if (filters.platform !== 'all' && row.platform !== filters.platform) return false;
    if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
    if (filters.department !== 'all' && row.department !== filters.department) return false;
    if (filters.status === 'has_task' && !task) return false;
    if (filters.status === 'no_task' && task) return false;
    if (!['active', 'all', 'has_task', 'no_task'].includes(filters.status) && row.status !== filters.status) return false;
    if (search) {
      const haystack = [
        row.article,
        row.name,
        row.platformLabel,
        row.place,
        row.owner,
        row.department,
        row.statusLabel,
        task?.title,
        task?.reason,
        task?.nextAction
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function oosControlFreshnessNotice(payload) {
  const freshness = payload.dataFreshness || {};
  const status = freshness.status || payload.summary?.dataStatus || 'unknown';
  const tone = status === 'ok' ? 'ok' : status === 'stale' ? 'danger' : 'warn';
  const text = freshness.message || (status === 'ok' ? 'Данные свежие.' : 'Свежесть данных нужно проверить.');
  const details = [
    freshness.dataDate ? `факт до ${freshness.dataDate}` : '',
    freshness.expectedFactDate ? `ожидается ${freshness.expectedFactDate}` : '',
    payload.generatedAt ? `сборка ${fmt.date(payload.generatedAt)}` : ''
  ].filter(Boolean).join(' · ');
  return `
    <div class="notice ${tone}">
      <strong>${escapeHtml(text)}</strong>
      <div class="muted small" style="margin-top:4px">${escapeHtml(details || 'Дата факта не определена')}</div>
    </div>
  `;
}

function renderOosControlKpis(summary = {}) {
  return `
    <div class="dashboard-grid-4" style="margin-top:14px">
      <div class="mini-kpi danger"><span>OOS сейчас</span><strong>${fmt.int(summary.oosCount || 0)}</strong><span>нулевой остаток</span></div>
      <div class="mini-kpi warn"><span>OOS скоро &lt;10 д</span><strong>${fmt.int(summary.oosSoonCount || summary.riskCount || 0)}</strong><span>активные / новинки</span></div>
      <div class="mini-kpi"><span>SKU в очереди</span><strong>${fmt.int(summary.skuCount || 0)}</strong><span>только активные статусы</span></div>
      <div class="mini-kpi"><span>Выручка под риском / день</span><strong>${fmt.money(summary.revenueAtRiskDay || 0)}</strong><span>по текущему темпу</span></div>
    </div>
  `;
}

function renderOosControlFilters(rows, filters) {
  const platformOptions = [
    `<option value="all" ${filters.platform === 'all' ? 'selected' : ''}>Все площадки</option>`,
    ...summarizeOosControlPlatforms(rows).map((item) => (
      `<option value="${escapeHtml(item.key)}" ${filters.platform === item.key ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
    ))
  ].join('');
  const ownerOptions = oosControlOptions(oosControlUnique(rows, 'owner'), filters.owner, 'Все owner');
  const departmentOptions = oosControlOptions(oosControlUnique(rows, 'department'), filters.department, 'Все отделы');
  return `
    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="grid sku-plan-fact-filters" style="grid-template-columns:1.4fr repeat(4,minmax(0,180px));gap:10px">
        <label><span class="label">Поиск</span><input data-oos-filter="search" value="${escapeHtml(filters.search)}" placeholder="SKU, склад, owner, мера"></label>
        <label><span class="label">Сигнал</span>
          <select data-oos-filter="status">
            <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Все активные</option>
            <option value="oos" ${filters.status === 'oos' ? 'selected' : ''}>Только OOS</option>
            <option value="critical" ${filters.status === 'critical' ? 'selected' : ''}>Критично</option>
            <option value="risk" ${filters.status === 'risk' ? 'selected' : ''}>OOS скоро &lt;10 д</option>
            <option value="watch" ${filters.status === 'watch' ? 'selected' : ''}>Наблюдать</option>
            <option value="has_task" ${filters.status === 'has_task' ? 'selected' : ''}>С задачей</option>
            <option value="no_task" ${filters.status === 'no_task' ? 'selected' : ''}>Без задачи</option>
          </select>
        </label>
        <label><span class="label">Площадка</span><select data-oos-filter="platform">${platformOptions}</select></label>
        <label><span class="label">Owner</span><select data-oos-filter="owner">${ownerOptions}</select></label>
        <label><span class="label">Отдел</span><select data-oos-filter="department">${departmentOptions}</select></label>
      </div>
    </div>
  `;
}

function summarizeOosControlPlatforms(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row.platform) return;
    if (!map.has(row.platform)) map.set(row.platform, { key: row.platform, label: row.platformLabel || row.platform });
  });
  return [...map.values()].sort((left, right) => left.label.localeCompare(right.label, 'ru'));
}

function renderOosControlGroupSummary(payload = {}) {
  const byPlatform = Array.isArray(payload.byPlatform) ? payload.byPlatform.slice(0, 6) : [];
  const byOwner = Array.isArray(payload.byOwner) ? payload.byOwner.slice(0, 6) : [];
  const byDepartment = Array.isArray(payload.byDepartment) ? payload.byDepartment.slice(0, 6) : [];
  const renderLine = (item) => `
    <div class="alert-row">
      <div>
        <strong>${escapeHtml(item.label || item.key || '—')}</strong>
        <div class="muted small">${fmt.int(item.total || 0)} строк · риск ${fmt.money(item.revenueAtRiskDay || 0)}</div>
      </div>
      <div class="badge-stack">${item.oos ? badge(`${fmt.int(item.oos)} OOS`, 'danger') : ''}${item.risk ? badge(`${fmt.int(item.risk)} скоро`, 'warn') : ''}</div>
    </div>
  `;
  return `
    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead"><h3>По площадкам</h3>${badge(`${fmt.int(byPlatform.length)} контуров`)}</div>
        <div class="alert-stack">${byPlatform.map(renderLine).join('') || '<div class="empty">Нет сигналов</div>'}</div>
      </div>
      <div class="card">
        <div class="section-subhead"><h3>По owner</h3>${badge(`${fmt.int(byOwner.length)} owner`)}</div>
        <div class="alert-stack">${byOwner.map(renderLine).join('') || '<div class="empty">Нет сигналов</div>'}</div>
      </div>
    </div>
  `;
}

function renderOosControlGroupSummary(payload = {}) {
  const byPlatform = Array.isArray(payload.byPlatform) ? payload.byPlatform.slice(0, 6) : [];
  const byDepartment = Array.isArray(payload.byDepartment) ? payload.byDepartment.slice(0, 6) : [];
  const byOwner = Array.isArray(payload.byOwner) ? payload.byOwner.slice(0, 6) : [];
  const renderLine = (item) => `
    <div class="alert-row">
      <div>
        <strong>${escapeHtml(item.label || item.key || '-')}</strong>
        <div class="muted small">${fmt.int(item.total || 0)} строк · риск ${fmt.money(item.revenueAtRiskDay || 0)}</div>
      </div>
      <div class="badge-stack">${item.oos ? badge(`${fmt.int(item.oos)} OOS`, 'danger') : ''}${item.risk ? badge(`${fmt.int(item.risk)} скоро`, 'warn') : ''}</div>
    </div>
  `;
  const renderCard = (title, items, chip) => `
    <div class="card">
      <div class="section-subhead"><h3>${escapeHtml(title)}</h3>${badge(chip)}</div>
      <div class="alert-stack">${items.map(renderLine).join('') || '<div class="empty">Нет сигналов</div>'}</div>
    </div>
  `;
  return `
    <div class="dashboard-grid-3" style="margin-top:14px">
      ${renderCard('По площадкам', byPlatform, `${fmt.int(byPlatform.length)} контуров`)}
      ${renderCard('По отделам', byDepartment, `${fmt.int(byDepartment.length)} отделов`)}
      ${renderCard('По owner', byOwner, `${fmt.int(byOwner.length)} owner`)}
    </div>
  `;
}

function renderOosControlMonthlyHistory(payload = {}) {
  const summary = payload.summary || {};
  const monthKey = String(summary.monthKey || '').trim();
  const days = (Array.isArray(payload.history?.days) ? payload.history.days : [])
    .filter((item) => !monthKey || String(item?.date || '').startsWith(monthKey))
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))
    .slice(0, 14);
  const taskRows = oosControlRows().map((row) => ({ row, task: oosControlTaskFor(row) }));
  const taskCount = taskRows.filter((item) => item.task).length;
  const noTaskCount = Math.max(0, taskRows.length - taskCount);
  const noReasonCount = taskRows.filter((item) => item.task && !/Причина:|РџСЂРёС‡РёРЅР°:/i.test(String(item.task.reason || ''))).length;
  const noActionCount = taskRows.filter((item) => item.task && !String(item.task.nextAction || '').trim()).length;
  return `
    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <h3>Месяц OOS</h3>
          <div class="badge-stack">${badge(monthKey || 'месяц')}${badge(`${fmt.int(days.length)} дн.`)}</div>
        </div>
        <div class="dashboard-grid-3" style="margin-top:10px">
          <div class="mini-kpi danger"><span>Потеря OOS за месяц</span><strong>${fmt.money(summary.lostRevenueMonth || 0)}</strong><span>фактический аут</span></div>
          <div class="mini-kpi warn"><span>Риск выручки за месяц</span><strong>${fmt.money(summary.revenueAtRiskMonth || 0)}</strong><span>аут + скоро аут</span></div>
          <div class="mini-kpi"><span>Новых сигналов</span><strong>${fmt.int(summary.newIssues || 0)}</strong><span>за сегодня</span></div>
        </div>
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead><tr><th>Дата</th><th>OOS</th><th>Риск</th><th>Потеря / день</th><th>Риск / день</th></tr></thead>
            <tbody>
              ${days.map((day) => `
                <tr>
                  <td><strong>${escapeHtml(day.date || '')}</strong></td>
                  <td>${fmt.int(day.oosCount || 0)}</td>
                  <td>${fmt.int(day.oosSoonCount || day.riskCount || 0)}</td>
                  <td>${fmt.money(day.lostRevenueDay || 0)}</td>
                  <td>${fmt.money(day.revenueAtRiskDay || 0)}</td>
                </tr>
              `).join('') || '<tr><td colspan="5"><div class="empty">История начнет накапливаться после ежедневных синхронизаций</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="section-subhead"><h3>Дисциплина контура</h3>${badge(`${fmt.int(taskCount)} с задачей`)}</div>
        <div class="alert-stack">
          <div class="alert-row"><div><strong>Без задачи</strong><div class="muted small">Нужно назначить отдел и контрмеру</div></div>${badge(fmt.int(noTaskCount), noTaskCount ? 'warn' : 'ok')}</div>
          <div class="alert-row"><div><strong>Без причины</strong><div class="muted small">Закрывать нельзя без комментария отдела</div></div>${badge(fmt.int(noReasonCount), noReasonCount ? 'warn' : 'ok')}</div>
          <div class="alert-row"><div><strong>Без контрмеры</strong><div class="muted small">Должен быть следующий шаг</div></div>${badge(fmt.int(noActionCount), noActionCount ? 'warn' : 'ok')}</div>
        </div>
      </div>
    </div>
  `;
}

function renderOosControlRow(row) {
  const task = oosControlTaskFor(row);
  const taskStatus = task?.status || 'new';
  const reasonValue = task?.reason || '';
  const actionValue = task?.nextAction || row.recommendation || '';
  const dueValue = task?.due || oosControlDue(row);
  const taskBadge = task
    ? badge(oosControlTaskStatusLabel(task), TASK_STATUS_META[task.status]?.kind || '')
    : badge('нет задачи', 'warn');
  return `
    <tr>
      <td>
        <div><strong>${linkToSku(row.articleKey || row.article, row.article || row.articleKey)}</strong></div>
        <div class="muted small">${escapeHtml(row.name || '')}</div>
        <div class="badge-stack" style="margin-top:6px">${badge(row.platformLabel || row.platform)}${badge(row.place || 'склад')}</div>
      </td>
      <td>
        <div class="badge-stack">${badge(row.statusLabel || row.status, oosControlStatusTone(row.status))}${row.lifecycleLabel ? badge(row.lifecycleLabel, row.lifecycleStatus === 'new' ? 'info' : 'ok') : ''}${taskBadge}</div>
        <div class="muted small" style="margin-top:6px">с ${escapeHtml(row.firstSeenDate || 'сегодня')} · ${fmt.int(row.daysOpen || 1)} дн.</div>
      </td>
      <td>
        <strong>${fmt.int(row.inStock)}</strong>
        <div class="muted small">транзит ${fmt.int(row.inTransit)} · заявка ${fmt.int(row.inRequest)}</div>
      </td>
      <td>
        <strong>${row.turnoverDays === null || row.turnoverDays === undefined ? '—' : fmt.num(row.turnoverDays, 1)}</strong>
        <div class="muted small">шт/день ${fmt.num(row.avgDaily || 0, 1)}</div>
      </td>
      <td>
        <strong>${fmt.money(row.revenueAtRiskDay || 0)}</strong>
        <div class="muted small">потеря OOS ${fmt.money(row.lostRevenueDay || 0)}</div>
      </td>
      <td>
        <strong>${escapeHtml(row.owner || 'Без owner')}</strong>
        <div class="muted small">${escapeHtml(row.department || 'Команда')}</div>
      </td>
      <td style="min-width:420px">
        <div class="grid" style="grid-template-columns:minmax(0,140px) minmax(0,1fr);gap:8px" data-oos-task-form="${escapeHtml(row.issueKey)}">
          <select data-oos-department>
            ${['Закуп', 'Логистика', 'Производство', 'Команда MP', 'Маркетплейс / логистика', 'Реклама', 'Цены'].map((item) => (
              `<option value="${escapeHtml(item)}" ${item === row.department ? 'selected' : ''}>${escapeHtml(item)}</option>`
            )).join('')}
          </select>
          <input data-oos-reason value="${escapeHtml(reasonValue)}" placeholder="Причина / комментарий">
          <select data-oos-status>${oosControlTaskStatusOptions(taskStatus)}</select>
          <input data-oos-action value="${escapeHtml(actionValue)}" placeholder="Контрмера / следующий шаг">
          <input type="date" data-oos-due value="${escapeHtml(dueValue)}">
          <div class="actions" style="justify-content:flex-start">
            <button class="quick-chip" type="button" data-oos-save="${escapeHtml(row.issueKey)}">Сохранить</button>
            ${task ? `<button class="quick-chip" type="button" data-open-task="${escapeHtml(task.id)}">Открыть</button>` : ''}
          </div>
        </div>
      </td>
    </tr>
  `;
}

function oosControlExportColumns() {
  return [
    ['data_date', 'Дата среза'],
    ['generated_at', 'Сборка данных'],
    ['issue_key', 'OOS key'],
    ['article', 'Артикул'],
    ['article_key', 'SKU'],
    ['name', 'Название'],
    ['platform', 'Площадка'],
    ['warehouse', 'Склад'],
    ['signal', 'Сигнал'],
    ['lifecycle', 'Состояние'],
    ['in_stock', 'Остаток'],
    ['in_transit', 'Транзит'],
    ['in_request', 'Заявка'],
    ['turnover_days', 'Покрытие, дней'],
    ['avg_daily', 'Средние продажи/день'],
    ['revenue_at_risk_day', 'Риск выручки/день'],
    ['lost_revenue_day', 'Потеря OOS/день'],
    ['owner', 'Owner'],
    ['department', 'Отдел'],
    ['task_status', 'Статус задачи'],
    ['task_priority', 'Приоритет задачи'],
    ['comment_reason', 'Комментарий / причина'],
    ['next_action', 'Контрмера / следующий шаг'],
    ['due', 'Срок'],
    ['task_id', 'ID задачи'],
    ['task_created_at', 'Создано/обновлено'],
    ['recommendation', 'Рекомендация из OOS']
  ];
}

function oosControlExportRows(rows = oosControlFilteredRows()) {
  const payload = oosControlPayload();
  const summary = payload.summary || {};
  const dataDate = summary.dataDate || payload.dataFreshness?.dataDate || '';
  return (rows || []).map((row) => {
    const task = oosControlTaskFor(row);
    return {
      data_date: dataDate,
      generated_at: payload.generatedAt || '',
      issue_key: row.issueKey || '',
      article: row.article || row.articleKey || '',
      article_key: row.articleKey || '',
      name: row.name || '',
      platform: row.platformLabel || row.platform || '',
      warehouse: row.place || '',
      signal: row.statusLabel || row.status || '',
      lifecycle: row.lifecycleLabel || '',
      in_stock: row.inStock ?? '',
      in_transit: row.inTransit ?? '',
      in_request: row.inRequest ?? '',
      turnover_days: row.turnoverDays ?? '',
      avg_daily: row.avgDaily ?? '',
      revenue_at_risk_day: Math.round(Number(row.revenueAtRiskDay || 0)),
      lost_revenue_day: Math.round(Number(row.lostRevenueDay || 0)),
      owner: row.owner || '',
      department: row.department || '',
      task_status: task ? oosControlTaskStatusLabel(task) : '',
      task_priority: task ? (PRIORITY_META[task.priority]?.label || task.priority || '') : '',
      comment_reason: task?.reason || '',
      next_action: task?.nextAction || '',
      due: task?.due || '',
      task_id: task?.id || row.taskId || '',
      task_created_at: task?.updatedAt || task?.createdAt || '',
      recommendation: row.recommendation || ''
    };
  });
}

function downloadOosControlExcel(rows = oosControlFilteredRows()) {
  const exportRows = oosControlExportRows(rows);
  if (!exportRows.length) {
    window.alert('По текущим фильтрам нет строк OOS для выгрузки.');
    return;
  }
  const dateKey = todayIso();
  if (typeof downloadLaunchesHtmlTable === 'function') {
    downloadLaunchesHtmlTable(oosControlExportColumns(), exportRows, `oos-control-comments-${dateKey}.xls`);
    return;
  }
  skuPlanFactDownloadJson(`oos-control-comments-${dateKey}.json`, exportRows);
}

async function oosControlSaveTask(issueKey, rootId) {
  const row = oosControlRows().find((item) => item.issueKey === issueKey);
  if (!row) return null;
  const form = document.querySelector(`[data-oos-task-form="${CSS.escape(issueKey)}"]`);
  const department = String(form?.querySelector('[data-oos-department]')?.value || row.department || 'Закуп').trim();
  const reasonInput = String(form?.querySelector('[data-oos-reason]')?.value || '').trim();
  const actionInput = String(form?.querySelector('[data-oos-action]')?.value || row.recommendation || '').trim();
  const statusInput = String(form?.querySelector('[data-oos-status]')?.value || 'new').trim();
  const dueInput = String(form?.querySelector('[data-oos-due]')?.value || oosControlDue(row)).trim();
  if (statusInput === 'done' && (!reasonInput || !actionInput)) {
    window.alert('Чтобы закрыть OOS, заполни причину отдела и контрмеру.');
    return null;
  }
  const existing = oosControlTaskFor(row);
  const now = new Date().toISOString();
  const reason = [
    `OOS сигнал: ${row.statusLabel || row.status}`,
    `Отдел: ${department}`,
    reasonInput ? `Причина: ${reasonInput}` : '',
    `SKU/склад: ${row.platformLabel || row.platform} / ${row.place}`,
    `Остаток ${fmt.int(row.inStock)}, покрытие ${row.turnoverDays === null || row.turnoverDays === undefined ? '—' : fmt.num(row.turnoverDays, 1)} дн., риск ${fmt.money(row.revenueAtRiskDay || 0)}/день`,
    `[oos:${row.issueKey}]`
  ].filter(Boolean).join('. ');
  const task = normalizeTask({
    id: row.taskId || existing?.id || uid('task-oos'),
    source: 'manual',
    autoCode: 'oos_control',
    articleKey: row.articleKey || row.article || '',
    entityLabel: `${row.platformLabel || row.platform} / ${row.place} / ${row.name || row.article}`,
    title: `${row.status === 'oos' ? 'OOS' : 'Риск OOS'}: ${row.platformLabel || row.platform} · ${row.article || row.articleKey}`,
    type: 'supply',
    priority: oosControlPriority(row),
    platform: row.platform || 'cross',
    owner: row.owner === 'Без owner' ? '' : row.owner,
    due: dueInput,
    status: statusInput,
    nextAction: actionInput,
    reason,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }, 'manual');
  state.storage = state.storage || {};
  state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
  const index = state.storage.tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) state.storage.tasks.splice(index, 1, task);
  else state.storage.tasks.unshift(task);
  if (typeof saveLocalStorage === 'function') saveLocalStorage();
  let remoteReady = false;
  try {
    remoteReady = await oosControlEnsureRemoteReady();
  } catch (error) {
    console.error(error);
    remoteReady = false;
  }
  try {
    if (remoteReady && typeof persistTask === 'function') await persistTask(task);
    if (typeof createTaskHistoryEntry === 'function') {
      await createTaskHistoryEntry(task.id, existing ? 'updated' : 'created', existing ? 'OOS-контрмера обновлена.' : 'Задача создана из OOS контроля.');
    }
    if (!remoteReady && typeof setAppError === 'function') {
      setAppError('OOS-задача сохранена локально. Командная база не подключилась, поэтому коллеги увидят ее после синхронизации JSON или восстановления Supabase.');
    }
  } catch (error) {
    console.error(error);
    if (typeof setAppError === 'function') setAppError(`OOS задача сохранена локально, но Supabase не ответил: ${error.message}`);
  }
  renderOosControl(rootId);
  if (!remoteReady) return task;
  if (typeof setAppError === 'function') setAppError(`OOS задача сохранена: ${task.title}`);
  return task;
}

function bindOosControl(root, rootId) {
  root.querySelectorAll('[data-oos-filter]').forEach((control) => {
    const eventName = control.tagName === 'INPUT' ? 'input' : 'change';
    control.addEventListener(eventName, () => {
      state.oosControlFilters = state.oosControlFilters || {};
      state.oosControlFilters[control.dataset.oosFilter] = control.value;
      renderOosControl(rootId);
    });
  });
  root.querySelectorAll('[data-oos-save]').forEach((button) => {
    button.addEventListener('click', async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Сохраняем...';
      try {
        await oosControlSaveTask(button.dataset.oosSave, rootId);
      } finally {
        button.disabled = false;
        button.textContent = original || 'Сохранить';
      }
    });
  });
  root.querySelector('[data-oos-reload]')?.addEventListener('click', async () => {
    state.boot.lazyReady.oosControl = false;
    await ensureViewData('oos-control');
    renderOosControl(rootId);
  });
  root.querySelector('[data-oos-export]')?.addEventListener('click', () => {
    downloadOosControlExcel(oosControlFilteredRows());
  });
  root.querySelector('[data-oos-reconnect-team]')?.addEventListener('click', async () => {
    try {
      if (typeof setAppError === 'function') setAppError('Подключаем командную базу для OOS...');
      await oosControlEnsureRemoteReady();
      if (typeof pullRemoteState === 'function' && oosControlHasRemoteStore()) await pullRemoteState(false);
    } catch (error) {
      console.error(error);
      if (typeof setAppError === 'function') setAppError(`Командная база не подключилась: ${error.message || error}`);
    }
    renderOosControl(rootId);
  });
}

function renderOosControl(rootId = 'view-oos-control') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const payload = oosControlPayload();
  const rows = oosControlRows();
  const filters = oosControlFilters();
  const filteredRows = oosControlFilteredRows();
  const summary = payload.summary || {};
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>OOS контроль</h1>
        <p>Ежедневная очередь рисков аута: SKU, площадка, склад, owner, причина, контрмера и командная задача.</p>
      </div>
      <div class="actions">
        ${badge(`факт до ${escapeHtml(summary.dataDate || payload.dataFreshness?.dataDate || '—')}`, summary.dataStatus === 'ok' ? 'ok' : 'warn')}
        ${badge(`${fmt.int(filteredRows.length)} из ${fmt.int(rows.length)} строк`)}
        <button class="quick-chip" type="button" data-oos-export>Выгрузить OOS + комментарии</button>
        <button class="quick-chip" type="button" data-oos-reload>Обновить экран</button>
      </div>
    </div>
    ${oosControlFreshnessNotice(payload)}
    ${oosControlTeamNotice()}
    ${renderOosControlKpis(summary)}
    ${renderOosControlGroupSummary(payload)}
    ${renderOosControlMonthlyHistory(payload)}
    ${renderOosControlFilters(rows, filters)}
    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Очередь OOS / риск аута</h3>
          <p class="small muted">Сохраняй причину и контрмеру прямо в строке: портал создаст или обновит задачу в командной базе.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(summary.newIssues || 0)} новых`, (summary.newIssues || 0) ? 'warn' : '')}
          ${badge(`${fmt.int(summary.resolvedToday || 0)} закрылись`, (summary.resolvedToday || 0) ? 'ok' : '')}
        </div>
      </div>
      <div class="table-wrap sku-plan-fact-table" style="margin-top:12px">
        <table>
          <thead>
            <tr>
              <th>SKU / склад</th>
              <th>Сигнал</th>
              <th>Остаток</th>
              <th>Покрытие</th>
              <th>Риск выручки</th>
              <th>Owner / отдел</th>
              <th>Причина и контрмера</th>
            </tr>
          </thead>
          <tbody>
            ${filteredRows.map(renderOosControlRow).join('') || '<tr><td colspan="7"><div class="empty">Нет строк под текущие фильтры</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
  bindOosControl(root, rootId);
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
  if (['action', 'decision'].includes(token) || token.startsWith('решение') || (token.includes('alias') && token.includes('ignore'))) return 'action';
  if (['targetsku', 'target', 'portalsku', 'mainsku'].includes(token) || token.includes('реестре') || (token.startsWith('sku') && token.includes('alias'))) return 'target_sku';
  if (['platform', 'marketplace', 'sourceplatform'].includes(token) || token.includes('площадка')) return 'platform';
  if (['apisku', 'apiarticle', 'api', 'sourcesku', 'marketplacesku'].includes(token)) return 'api_sku';
  if (['articlekey', 'article', 'skuapi'].includes(token)) return 'article_key';
  if (['status', 'active'].includes(token) || token.includes('статус') || token.includes('active')) return 'status';
  if (['note', 'comment', 'decisioncomment'].includes(token) || token.includes('комментар')) return 'note';
  return token;
}

function skuPlanFactLooksLikeReviewForm(matrix = [], headers = []) {
  const rawHeaders = matrix[0] || [];
  const headerTokens = rawHeaders.map((value) => skuPlanFactToken(value));
  const hasReviewHeaderHints = headerTokens.some((token) => token.includes('alias') && token.includes('ignore'))
    || headerTokens.includes('skuapi')
    || headerTokens.some((token) => token.includes('apisku'));
  const hasReviewBodyHints = matrix.slice(1, 20).some((row) => {
    const action = skuPlanFactNormalizeReviewAction(row?.[0] || '', row?.[2] || '');
    return ['alias', 'ignore', 'new_sku', 'need_check'].includes(action);
  });
  const recognized = new Set(headers.filter(Boolean));
  const missingCore = !recognized.has('action')
    || !recognized.has('target_sku')
    || !recognized.has('platform')
    || (!recognized.has('api_sku') && !recognized.has('article_key'));
  return missingCore && rawHeaders.length >= 5 && (hasReviewHeaderHints || hasReviewBodyHints);
}

function skuPlanFactReviewFallbackHeaders(headers = []) {
  const fallback = [
    'action',
    'decision_hint',
    'target_sku',
    'platform',
    'api_sku',
    'status',
    'note',
    'month',
    'fact_to',
    'severity',
    'type',
    'article_key',
    'name',
    'revenue',
    'units',
    'recommended_action'
  ];
  return headers.map((header, index) => fallback[index] || header);
}

function skuPlanFactRowsFromMatrix(matrix = []) {
  let headers = (matrix[0] || []).map((value) => skuPlanFactImportHeaderKey(value));
  if (skuPlanFactLooksLikeReviewForm(matrix, headers)) {
    headers = skuPlanFactReviewFallbackHeaders(headers);
  }
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

function skuPlanFactClonePayload(payload, fallback = {}) {
  try {
    if (typeof cloneJsonValue === 'function') return cloneJsonValue(payload ?? fallback);
  } catch {}
  try {
    return JSON.parse(JSON.stringify(payload ?? fallback));
  } catch {
    return fallback;
  }
}

function skuContourRollbackEventIds() {
  return new Set(
    skuPlanFactAuditEvents(state.skuAliasAudit || {})
      .filter((event) => event.type === 'sku_alias_import_rollback')
      .map((event) => event.rolledBackEventId || event.rollbackOf || '')
      .filter(Boolean)
  );
}

function skuContourRollbackableEvents() {
  const rolledBack = skuContourRollbackEventIds();
  return skuPlanFactAuditEvents(state.skuAliasAudit || {}).filter((event) => (
    event?.id
    && event.type === 'sku_alias_import_apply'
    && event.rollback?.beforeAliasPayload
    && event.rollback?.beforeIgnorePayload
    && !rolledBack.has(event.id)
  ));
}

function skuContourLatestRollbackableEvent() {
  return skuContourRollbackableEvents()[0] || null;
}

async function skuContourRollbackAliasImport(eventId = '', button = null, rootId = 'view-sku-contour') {
  const event = skuPlanFactAuditEvents(state.skuAliasAudit || {}).find((item) => item.id === eventId);
  if (!event?.rollback?.beforeAliasPayload || !event?.rollback?.beforeIgnorePayload) {
    if (typeof setAppError === 'function') setAppError('Для этого изменения нет сохранённой версии для отката.');
    return;
  }
  if (skuContourRollbackEventIds().has(event.id)) {
    if (typeof setAppError === 'function') setAppError('Это изменение уже откатывали.');
    return;
  }
  const originalText = button?.textContent || '';
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Откатываем...';
    }
    const aliasPayload = skuPlanFactClonePayload(event.rollback.beforeAliasPayload, { schema: 'sku-api-aliases-v1', aliases: [] });
    const ignorePayload = skuPlanFactClonePayload(event.rollback.beforeIgnorePayload, { schema: 'sku-api-ignore-v1', ignored: [] });
    state.skuAliases = aliasPayload;
    state.skuAliasIgnore = ignorePayload;
    const matrixPayload = skuPlanFactBuildRuntimeSkuMatrix(aliasPayload, ignorePayload);
    state.skuMatrix = matrixPayload;
    const appliedAt = new Date().toISOString();
    const actor = state.team?.member?.name || state.team?.userId || 'portal-user';
    const rollbackEvent = {
      id: `sku-alias-rollback-${Date.now()}`,
      type: 'sku_alias_import_rollback',
      appliedAt,
      actor,
      fileName: event.fileName || '',
      rolledBackEventId: event.id,
      aliasesRestored: skuPlanFactAliasRows(aliasPayload).length,
      ignoresRestored: skuPlanFactIgnorePayloadRows(ignorePayload).length,
      reason: 'Откат последнего применения alias/ignore из портала'
    };
    const auditPayload = skuPlanFactBuildAuditPayload(rollbackEvent);
    state.skuAliasAudit = auditPayload;
    await skuPlanFactUpsertSnapshot('sku_aliases', aliasPayload);
    await skuPlanFactUpsertSnapshot('sku_alias_ignore', ignorePayload);
    await skuPlanFactUpsertSnapshot('sku_matrix', matrixPayload);
    await skuPlanFactUpsertSnapshot('sku_alias_audit', auditPayload);
    if (typeof window.__alteaResetPortalSnapshotState === 'function') window.__alteaResetPortalSnapshotState();
    skuPlanFactRenderImportTarget(rootId);
    if (typeof setAppError === 'function') setAppError(`Откат применён: alias ${fmt.int(rollbackEvent.aliasesRestored)}, ignore ${fmt.int(rollbackEvent.ignoresRestored)}.`);
  } catch (error) {
    console.error('[sku-contour-rollback]', error);
    if (typeof setAppError === 'function') setAppError(`Не удалось откатить изменение: ${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || 'Откатить последнее';
    }
  }
}

function skuPlanFactRenderImportTarget(rootId = 'view-sku-plan-fact') {
  if (rootId === 'view-data-health' && typeof renderPortalDataHealth === 'function') {
    renderPortalDataHealth(rootId);
    return;
  }
  if (rootId === 'view-sku-contour' && typeof renderSkuContour === 'function') {
    renderSkuContour(rootId);
    return;
  }
  renderSkuPlanFact(rootId);
}

function skuPlanFactNewSkuTaskKey(row = {}) {
  const apiSku = row.apiSku || row.api_sku || '';
  const platform = skuPlanFactNormalizePlatform(row.platform || 'all') || 'all';
  return `sku-new-sku|${platform}|${skuPlanFactToken(apiSku)}`;
}

function skuPlanFactNewSkuTaskId(row = {}) {
  const raw = skuPlanFactNewSkuTaskKey(row);
  return typeof stableId === 'function' ? stableId('task', raw) : `task-${raw}`;
}

function skuPlanFactBuildNewSkuTask(row = {}, report = {}) {
  const apiSku = String(row.apiSku || row.api_sku || '').trim();
  const platform = skuPlanFactNormalizePlatform(row.platform || 'all') || 'all';
  const platformLabel = skuPlanFactPlatformLabel(platform);
  const titleSku = apiSku || row.targetSku || row.target_sku || 'API SKU';
  const taskPayload = {
    id: skuPlanFactNewSkuTaskId(row),
    source: 'manual',
    autoCode: 'sku_new_sku',
    articleKey: '',
    entityLabel: titleSku,
    title: `Завести SKU в реестре: ${titleSku}`,
    nextAction: 'Завести SKU в реестре, назначить owner, затем повторно загрузить строку как alias с target_sku.',
    reason: [
      'decision=new_sku',
      apiSku ? `API SKU: ${apiSku}` : '',
      platformLabel ? `площадка: ${platformLabel}` : '',
      row.note ? `комментарий: ${row.note}` : '',
      report.fileName ? `файл: ${report.fileName}` : ''
    ].filter(Boolean).join(' · '),
    owner: '',
    due: typeof plusDays === 'function' ? plusDays(2) : '',
    status: 'new',
    type: 'assignment',
    priority: 'high',
    platform
  };
  return typeof normalizeTask === 'function' ? normalizeTask(taskPayload, 'manual') : taskPayload;
}

async function skuPlanFactCreateNewSkuTasks(report = {}, options = {}) {
  const rows = report.newSkuRows || [];
  const result = { created: [], duplicates: [] };
  if (!rows.length) return result;
  state.storage = state.storage || {};
  state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
  const existingIds = new Set((state.storage.tasks || []).map((task) => task.id).filter(Boolean));
  const tasksToCreate = [];
  rows.forEach((row) => {
    const task = skuPlanFactBuildNewSkuTask(row, report);
    if (!task.id || existingIds.has(task.id)) {
      result.duplicates.push({ rowNumber: row.rowNumber, apiSku: row.apiSku || row.api_sku || '', platform: row.platform || 'all', taskId: task.id || '' });
      return;
    }
    existingIds.add(task.id);
    tasksToCreate.push(task);
  });
  result.created = tasksToCreate;
  if (options.persist === false || !tasksToCreate.length) return result;
  state.storage.tasks.unshift(...tasksToCreate);
  if (typeof saveLocalStorage === 'function') saveLocalStorage();
  for (const task of tasksToCreate) {
    try {
      if (typeof persistTask === 'function') await persistTask(task);
      if (typeof createTaskHistoryEntry === 'function') {
        await createTaskHistoryEntry(task.id, 'created', 'Задача создана из decision=new_sku в Контуре SKU.');
      }
    } catch (error) {
      console.error('[sku-plan-fact-new-sku-task]', error);
    }
  }
  return result;
}

async function handleSkuPlanFactApplyAliasImport(button = null, rootId = 'view-sku-plan-fact') {
  const report = state.skuPlanFactAliasImportReport || {};
  if ((report.errorRows || []).length) {
    if (typeof setAppError === 'function') setAppError('В импорте есть ошибки, применение остановлено.');
    return;
  }
  if (!report.aliasPayload && !report.ignorePayload && !(report.newSkuRows || []).length) return;
  const originalText = button?.textContent || '';
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Применяем...';
    }
    const beforeAliasPayload = skuPlanFactClonePayload(state.skuAliases || { schema: 'sku-api-aliases-v1', aliases: [] });
    const beforeIgnorePayload = skuPlanFactClonePayload(state.skuAliasIgnore || { schema: 'sku-api-ignore-v1', ignored: [] });
    const aliasPayload = report.aliasPayload || state.skuAliases || { schema: 'sku-api-aliases-v1', aliases: [] };
    const ignorePayload = report.ignorePayload || state.skuAliasIgnore || { schema: 'sku-api-ignore-v1', ignored: [] };
    state.skuAliases = aliasPayload;
    state.skuAliasIgnore = ignorePayload;
    const appliedAliases = skuPlanFactApplyAliasesToStateSkus(report.aliases || []);
    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    const newSkuTaskResult = await skuPlanFactCreateNewSkuTasks(report);
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
      newSkuTasksCreated: newSkuTaskResult.created.length,
      newSkuTaskDuplicates: newSkuTaskResult.duplicates.length,
      duplicateRows: (report.duplicateRows || []).length,
      skippedRows: (report.skippedRows || []).length,
      errorRows: (report.errorRows || []).length,
      validationWarnings: (report.validationWarnings || []).length,
      aliasKeys: (report.aliases || []).slice(0, 50).map((row) => skuPlanFactAliasKey(row)),
      ignoreKeys: (report.ignores || []).slice(0, 50).map((row) => skuPlanFactIgnoreKey(row.platform || 'all', row.api_sku || row.apiSku || '')),
      rollback: {
        beforeAliasPayload,
        beforeIgnorePayload,
        beforeAliasCount: skuPlanFactAliasRows(beforeAliasPayload).length,
        beforeIgnoreCount: skuPlanFactIgnorePayloadRows(beforeIgnorePayload).length
      }
    };
    const auditPayload = skuPlanFactBuildAuditPayload(auditEvent);
    state.skuAliasAudit = auditPayload;
    await skuPlanFactUpsertSnapshot('sku_aliases', aliasPayload);
    await skuPlanFactUpsertSnapshot('sku_alias_ignore', ignorePayload);
    await skuPlanFactUpsertSnapshot('sku_matrix', matrixPayload);
    await skuPlanFactUpsertSnapshot('sku_alias_audit', auditPayload);
    if (typeof window.__alteaResetPortalSnapshotState === 'function') window.__alteaResetPortalSnapshotState();
    state.skuPlanFactAliasImportReport = { ...report, appliedAt, appliedAliases, newSkuTaskResult, auditEventId: auditEvent.id };
    skuPlanFactRenderImportTarget(rootId);
    if (typeof setAppError === 'function') {
      setAppError(`Импорт применён: ${fmt.int(report.aliases?.length || 0)} alias, ${fmt.int(report.ignores?.length || 0)} ignore, ${fmt.int(newSkuTaskResult.created.length)} задач new_sku. Матрица обновлена.`);
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
  if (key === 'date' || key === 'dateTo') {
    nextValue = skuPlanFactDateKey(value);
    filters.month = nextValue ? nextValue.slice(0, 7) : 'latest';
    filters.date = nextValue;
    filters.dateTo = nextValue;
    filters.dateMode = nextValue ? 'manual' : 'latest';
    if (filters.dateFrom && nextValue && skuPlanFactMonthFromDate(filters.dateFrom) !== skuPlanFactMonthFromDate(nextValue)) {
      filters.dateFrom = `${nextValue.slice(0, 7)}-01`;
    }
    if (filters.dateFrom && nextValue && filters.dateFrom > nextValue) {
      filters.dateFrom = nextValue;
    }
    key = 'dateTo';
  }
  if (key === 'dateFrom') {
    nextValue = skuPlanFactDateKey(value);
    filters.month = nextValue ? nextValue.slice(0, 7) : filters.month;
    filters.dateMode = nextValue ? 'manual' : 'latest';
    if (filters.dateTo && nextValue && skuPlanFactMonthFromDate(filters.dateTo) !== skuPlanFactMonthFromDate(nextValue)) {
      filters.dateTo = '';
      filters.date = '';
    }
    if (filters.dateTo && nextValue && filters.dateTo < nextValue) {
      filters.dateTo = nextValue;
      filters.date = nextValue;
    }
  }
  if (key === 'sort') {
    filters.sortDir = skuPlanFactDefaultSortDir(nextValue);
  }
  if (filters[key] === nextValue && !options.force && key !== 'dateTo' && key !== 'dateFrom') return;
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
    await Promise.all([
      typeof ensureViewData === 'function'
        ? ensureViewData('sku-plan-fact')
        : (LAZY_DATA_LOADERS?.skuPlanFact ? LAZY_DATA_LOADERS.skuPlanFact() : Promise.resolve()),
      portalRefreshOperationalDataPayloads()
    ]);
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

let portalOperationalAutoRefreshStarted = false;
let portalOperationalAutoRefreshRunning = false;
let portalOperationalAutoRefreshLastAttemptAt = 0;
const PORTAL_OPERATIONAL_AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

function portalOperationalLatestDate() {
  return String(
    state.syncHealth?.freshness?.maxDate
    || state.portalDataQuality?.summary?.maxDate
    || state.portalDataQuality?.generatedAt
    || state.syncHealth?.generatedAt
    || ''
  ).slice(0, 10);
}

function portalOperationalRootIdForActiveView() {
  const view = String(state.activeView || '').trim();
  if (['data-health', 'sku-contour', 'sku-plan-fact'].includes(view)) return `view-${view}`;
  return 'view-data-health';
}

function portalOperationalNeedsDailyRefresh(force = false) {
  if (!state.boot?.dataReady) return false;
  if (force) return true;
  const latestDate = portalOperationalLatestDate();
  const today = todayIso();
  if (latestDate === today) return false;
  const now = Date.now();
  return now - portalOperationalAutoRefreshLastAttemptAt >= PORTAL_OPERATIONAL_AUTO_REFRESH_INTERVAL_MS;
}

async function portalMaybeAutoRefreshOperationalData(reason = 'auto', options = {}) {
  if (portalOperationalAutoRefreshRunning) return false;
  if (!portalOperationalNeedsDailyRefresh(options.force === true)) return false;
  portalOperationalAutoRefreshRunning = true;
  portalOperationalAutoRefreshLastAttemptAt = Date.now();
  try {
    await refreshSkuPlanFactData(null, portalOperationalRootIdForActiveView());
    return true;
  } catch (error) {
    console.warn('[portal-operational-auto-refresh]', reason, error);
    return false;
  } finally {
    portalOperationalAutoRefreshRunning = false;
  }
}

function portalStartOperationalAutoRefresh() {
  if (portalOperationalAutoRefreshStarted) return;
  portalOperationalAutoRefreshStarted = true;
}

function renderSkuPlanFact(rootId = 'view-sku-plan-fact', options = {}) {
  const root = document.getElementById(rootId);
  if (!root) return;
  skuPlanFactWarmupTruth(rootId);
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
  const dateAttrs = [
    model.dateMin ? `min="${escapeHtml(model.dateMin)}"` : '',
    model.dateMax ? `max="${escapeHtml(model.dateMax)}"` : ''
  ].filter(Boolean).join(' ');
  const tableColspan = 8;
  const rowsHtml = model.rows.length
    ? model.rows.map((row) => skuPlanFactRowHtml(row, model)).join('')
    : `<tr><td colspan="${tableColspan}"><div class="empty">По текущим фильтрам нет SKU.</div></td></tr>`;
  const matrixSummary = typeof skuMatrixSummary === 'function' ? skuMatrixSummary() : {};
  const matrixGeneratedAt = state.skuMatrix?.generatedAt || state.skuMatrix?.updatedAt || '';
  const activePlatform = filters.platform !== 'all' ? filters.platform : '';
  const shellStyle = activePlatform ? skuPlanFactCardStyle(activePlatform, totals.completionToDate) : '';

  root.innerHTML = `
    <div class="sku-plan-fact-shell ${activePlatform ? 'is-platform-drill' : ''}" data-sku-plan-active-platform="${escapeHtml(activePlatform || 'all')}" style="${shellStyle}">
    <div class="section-title">
      <div>
        <h2>План-факт SKU</h2>
        <p>Рабочий срез по площадкам и артикулам: выполнение, маржа, реклама и карточка SKU в одном месте.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(model.rows.length)} SKU`, 'info')}
        ${badge(`${fmt.int(model.unmappedCount || 0)} API без пары`, model.unmappedCount ? 'warn' : 'ok')}
        ${badge(`маржа ${fmt.pct(totals.marginPct)}`, skuPlanFactMarginTone(totals.marginPct))}
        ${matrixSummary.duplicateRiskCount ? badge(`${fmt.int(matrixSummary.duplicateRiskCount)} риск дубля`, 'danger') : ''}
        ${badge(`матрица ${matrixGeneratedAt ? fmt.date(matrixGeneratedAt) : '—'}`, matrixGeneratedAt ? 'ok' : 'warn')}
        ${badge(`период ${model.periodStart || '—'} - ${model.periodEnd || model.maxFactDate || '—'}`, 'ok')}
      </div>
    </div>

    <div class="sku-plan-fact-toolbar">
      <div class="control-filters sku-plan-fact-filters">
        <input id="skuPlanFactSearch" placeholder="Поиск по SKU, названию, owner…" value="${escapeHtml(filters.search)}">
        <input id="skuPlanFactDateFrom" type="date" title="Период с" aria-label="Период с" value="${escapeHtml(model.periodStart || '')}" ${dateAttrs}>
        <input id="skuPlanFactDateTo" type="date" title="Период по" aria-label="Период по" value="${escapeHtml(model.periodEnd || model.selectedDate || '')}" ${dateAttrs}>
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
          <option value="margin" ${filters.sort === 'margin' ? 'selected' : ''}>Сортировка: маржа</option>
          <option value="fact" ${filters.sort === 'fact' ? 'selected' : ''}>Сортировка: факт оборота</option>
          <option value="plan" ${filters.sort === 'plan' ? 'selected' : ''}>Сортировка: план</option>
          <option value="drr" ${filters.sort === 'drr' ? 'selected' : ''}>Сортировка: ДРР</option>
          <option value="ad" ${filters.sort === 'ad' ? 'selected' : ''}>Сортировка: реклама</option>
          <option value="article" ${filters.sort === 'article' ? 'selected' : ''}>Сортировка: артикул</option>
          <option value="owner" ${filters.sort === 'owner' ? 'selected' : ''}>Сортировка: owner</option>
        </select>
      </div>
      <div class="badge-stack sku-plan-fact-actions">
        <button class="quick-chip" type="button" data-sku-plan-fact-refresh>Обновить данные</button>
        <button class="quick-chip" type="button" data-sku-plan-fact-export>Выгрузить в Excel</button>
      </div>
    </div>

    ${skuPlanFactPayrollKpiHtml(model)}

    ${skuPlanFactPlatformBoardHtml(model)}

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Таблица по позициям</h3>
        </div>
        <div class="badge-stack">
          ${badge(`факт ${fmt.money(totals.factRevenue)}`, 'info')}
        </div>
      </div>
      <div class="table-wrap sku-plan-fact-table">
        <table>
          <thead>
            <tr>
              ${skuPlanFactSortHeader('article', 'SKU')}
              ${skuPlanFactSortHeader('owner', 'Owner')}
              ${skuPlanFactSortHeader('platform', 'Площадка')}
              ${skuPlanFactSortHeader('completion', 'Выполнение')}
              ${skuPlanFactSortHeader('gap', 'Факт / план')}
              ${skuPlanFactSortHeader('margin', 'Маржа')}
              ${skuPlanFactSortHeader('ad', 'Реклама / план')}
              ${skuPlanFactSortHeader('action', 'Карточка')}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="footer-note">Клик по строке открывает карточку SKU для смены owner и рабочих комментариев.</div>
    </div>
    </div>
  `;

  root.querySelector('#skuPlanFactSearch')?.addEventListener('input', (event) => {
    skuPlanFactSetFilter(rootId, 'search', event.target.value, { debounce: 140, focusState: skuPlanFactFocusState(event.target) });
  });
  root.querySelector('#skuPlanFactDateFrom')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'dateFrom', event.target.value); });
  root.querySelector('#skuPlanFactDateTo')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'dateTo', event.target.value); });
  root.querySelector('#skuPlanFactOwner')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'owner', event.target.value); });
  root.querySelector('#skuPlanFactStatus')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'status', event.target.value); });
  root.querySelector('#skuPlanFactPlatform')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'platform', event.target.value); });
  root.querySelector('#skuPlanFactSort')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'sort', event.target.value); });
  root.querySelectorAll('[data-sku-plan-fact-sort]').forEach((button) => {
    button.addEventListener('click', () => skuPlanFactToggleSort(rootId, button.dataset.skuPlanFactSort));
  });
  root.querySelectorAll('[data-sku-plan-fact-platform-card]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const platform = button.dataset.skuPlanFactPlatformCard || 'all';
      const next = skuPlanFactFilters().platform === platform ? 'all' : platform;
      skuPlanFactSetFilter(rootId, 'platform', next);
    });
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
window.renderPortalDataHealth = renderPortalDataHealth;
window.renderOosControl = renderOosControl;
window.skuContourIssueRows = skuContourIssueRows;
window.skuContourIssueIsResolved = skuContourIssueIsResolved;
window.portalHealthIssueRows = portalHealthIssueRows;
window.portalHealthCreateIssueTasks = portalHealthCreateIssueTasks;
window.portalRefreshOperationalDataPayloads = portalRefreshOperationalDataPayloads;
window.portalMaybeAutoRefreshOperationalData = portalMaybeAutoRefreshOperationalData;
window.portalStartOperationalAutoRefresh = portalStartOperationalAutoRefresh;
window.skuContourRollbackableEvents = skuContourRollbackableEvents;
window.skuPlanFactCreateNewSkuTasks = skuPlanFactCreateNewSkuTasks;
window.skuPlanFactBuildNewSkuTask = skuPlanFactBuildNewSkuTask;
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
