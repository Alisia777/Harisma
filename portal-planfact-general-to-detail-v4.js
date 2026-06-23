(function () {
  'use strict';

  if (window.__ALTEA_PLANFACT_GENERAL_TO_DETAIL_V4__) return;
  window.__ALTEA_PLANFACT_GENERAL_TO_DETAIL_V4__ = true;

  const ROOT_ID = 'view-sku-plan-fact';
  const STORE_KEY = 'altea.planFact.generalToDetail.v4';
  const VERSION = '20260623-planfact-gtd-v4-charts';
  const MODES = [
    ['general', 'Общее'],
    ['lfl', 'Like-for-like'],
    ['team', 'Кто'],
    ['sku', 'Артикулы'],
    ['history', 'Динамика']
  ];
  const MARKET_COLORS = {
    all: '#dbc7a3',
    wb: '#a855f7',
    ozon: '#5aa7ff',
    ym: '#f2c84b',
    ya: '#f2c84b',
    goldapple: '#72c86a',
    ga: '#72c86a',
    letu: '#d96aa9',
    magnit: '#e85b55'
  };
  const statusLabels = {
    no_plan: 'нет плана',
    under_plan: 'ниже плана',
    watch: 'зона внимания',
    ok: 'в плане',
    over_plan: 'выше плана'
  };

  let baseRenderSkuPlanFact = null;
  let wrappedRenderSkuPlanFact = null;
  let suppressEnhance = false;
  let lastShellSignature = '';
  let enhanceTimer = 0;
  let priceHistoryCacheSource = null;
  let priceHistoryCache = null;
  let fallbackModelData = null;
  let fallbackModelPromise = null;

  const moneyFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const pctFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const intFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

  function appState() {
    try {
      if (typeof state === 'object' && state) return state;
    } catch (_) {}
    return window.state || window.__alteaAppState || null;
  }

  function root() {
    return document.getElementById(ROOT_ID);
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function numberOrZero(value) {
    const parsed = numberOrNull(value);
    return parsed === null ? 0 : parsed;
  }

  function ratio(num, den) {
    const n = numberOrNull(num);
    const d = numberOrNull(den);
    return n === null || d === null || d === 0 ? null : n / d;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function fmtMoney(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return '—';
    return `${moneyFmt.format(Math.round(parsed))} ₽`;
  }

  function fmtSignedMoney(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return '—';
    return `${parsed > 0 ? '+' : ''}${fmtMoney(parsed)}`;
  }

  function fmtInt(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return '—';
    return intFmt.format(Math.round(parsed));
  }

  function fmtPct(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return '—';
    const normalized = Math.abs(parsed) <= 3 ? parsed * 100 : parsed;
    return `${pctFmt.format(normalized)}%`;
  }

  function pctValue(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return 0;
    return Math.abs(parsed) <= 3 ? parsed * 100 : parsed;
  }

  function shortDate(value) {
    const text = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return value || '—';
    return `${text.slice(8, 10)}.${text.slice(5, 7)}`;
  }

  function platformLabel(platform = 'all') {
    const key = String(platform || 'all').toLowerCase();
    if (window.SKU_PLAN_FACT_PLATFORM_LABELS?.[key]) return window.SKU_PLAN_FACT_PLATFORM_LABELS[key];
    if (key === 'all') return 'Все площадки';
    if (key === 'wb' || key === 'wildberries') return 'WB';
    if (key === 'ozon') return 'Ozon';
    if (key === 'ym' || key === 'ya') return 'Я.Маркет';
    if (key === 'goldapple' || key === 'ga') return 'ЗЯ';
    if (key === 'letu') return "Л'Этуаль";
    if (key === 'magnit') return 'Магнит';
    return platform || 'Площадка';
  }

  function platformColor(platform = 'all') {
    const key = String(platform || 'all').toLowerCase();
    return MARKET_COLORS[key] || MARKET_COLORS.all;
  }

  function normalizedPlatform(platform = 'all') {
    const key = String(platform || 'all').trim().toLowerCase();
    if (!key || key === 'all') return 'all';
    if (key === 'wildberries') return 'wb';
    if (key === 'yandex' || key === 'yamarket' || key === 'я.маркет') return 'ym';
    if (key === 'золотое яблоко') return 'goldapple';
    return key;
  }

  function modeState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      if (parsed && MODES.some(([key]) => key === parsed.mode)) return parsed;
    } catch (_) {}
    return { mode: 'general', selectedDate: '', marginMetric: 'pct', marginGroup: 'market', hiddenSeries: {} };
  }

  function planFactUi() {
    const current = modeState();
    return {
      mode: current.mode || 'general',
      selectedDate: current.selectedDate || '',
      marginMetric: current.marginMetric === 'rub' ? 'rub' : 'pct',
      marginGroup: current.marginGroup || 'market',
      hiddenSeries: current.hiddenSeries || {}
    };
  }

  function updatePlanFactUi(patch) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...modeState(), ...(patch || {}) }));
    } catch (_) {}
  }

  function setMode(mode) {
    const next = MODES.some(([key]) => key === mode) ? mode : 'general';
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...modeState(), mode: next })); } catch (_) {}
  }

  function activeMode() {
    return modeState().mode || 'general';
  }

  function ensureFallbackModelData() {
    if (fallbackModelData) return Promise.resolve(fallbackModelData);
    if (fallbackModelPromise) return fallbackModelPromise;
    if (typeof fetch !== 'function') return Promise.resolve(null);
    fallbackModelPromise = Promise.all([
      fetch('data/skus.json').then((response) => response.ok ? response.json() : Promise.reject(new Error(`skus ${response.status}`))),
      fetch('data/prices.json').then((response) => response.ok ? response.json() : Promise.reject(new Error(`prices ${response.status}`)))
    ]).then(([skus, prices]) => {
      fallbackModelData = { skus: Array.isArray(skus) ? skus : [], prices: prices || {} };
      priceHistoryCacheSource = null;
      priceHistoryCache = null;
      return fallbackModelData;
    }).catch((error) => {
      console.warn('[planfact-v4:fallback-model]', error);
      return null;
    });
    return fallbackModelPromise;
  }

  function fallbackDomValue(selector, fallback = '') {
    const node = root()?.querySelector(selector);
    return String(node?.value || node?.getAttribute?.('value') || fallback || '').trim();
  }

  function fallbackFiltersFromDom() {
    const host = root();
    const activePlatform = host?.querySelector('[data-sku-plan-active-platform]')?.getAttribute('data-sku-plan-active-platform') || '';
    return {
      search: fallbackDomValue('#skuPlanFactSearch', ''),
      owner: fallbackDomValue('#skuPlanFactOwner', 'all') || 'all',
      platform: normalizedPlatform(fallbackDomValue('#skuPlanFactPlatform', activePlatform || document.documentElement.dataset.marketplace || 'all')),
      status: fallbackDomValue('#skuPlanFactStatus', 'actual') || 'actual',
      sort: fallbackDomValue('#skuPlanFactSort', 'gap') || 'gap',
      dateFrom: fallbackDomValue('#skuPlanFactDateFrom', ''),
      dateTo: fallbackDomValue('#skuPlanFactDateTo', fallbackDomValue('#skuPlanFactDate', ''))
    };
  }

  function fallbackOwner(sku, platform) {
    const owner = sku?.owner;
    if (platform && platform !== 'all') {
      const platformOwner = owner?.byPlatform?.[platform] || sku?.ownersByPlatform?.[platform];
      if (platformOwner) return String(platformOwner).trim();
    }
    if (typeof owner === 'string') return owner.trim();
    return String(owner?.name || sku?.ownerBase || 'Без owner').trim();
  }

  function fallbackPriceRowForSku(sku, platform) {
    const index = priceHistoryIndex();
    const platforms = platform && platform !== 'all' ? [platform] : ['wb', 'ozon', 'ym', 'goldapple', 'letu', 'magnit'];
    const keys = candidateRowKeys(sku);
    for (const platformKey of platforms) {
      for (const key of keys) {
        const found = index.byExact.get(`${platformKey}|${key}`);
        if (found) return found;
      }
    }
    for (const key of keys) {
      const found = index.byKey.get(key);
      if (found) return found;
    }
    return null;
  }

  function fallbackDailyTotals(priceRow, start, end) {
    return (Array.isArray(priceRow?.daily) ? priceRow.daily : []).reduce((acc, item) => {
      const date = String(item?.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return acc;
      if (start && date < start) return acc;
      if (end && date > end) return acc;
      acc.revenue += dailyRevenue(item) || 0;
      acc.units += dailyUnits(item) || 0;
      return acc;
    }, { revenue: 0, units: 0 });
  }

  function fallbackBuildRow(sku, filters, periodStart, periodEnd) {
    const platform = filters.platform && filters.platform !== 'all' ? filters.platform : normalizedPlatform(root()?.querySelector('[data-sku-plan-active-platform]')?.getAttribute('data-sku-plan-active-platform') || 'all');
    const priceRow = fallbackPriceRowForSku(sku, platform);
    const totals = fallbackDailyTotals(priceRow, periodStart, periodEnd);
    const platformData = platform && platform !== 'all' ? (sku?.[platform] || {}) : {};
    const factRevenue = totals.revenue || numberOrZero(sku?.planFact?.factTotalRevenue || sku?.planFact?.factFeb26Revenue);
    const factUnits = totals.units || numberOrZero(sku?.planFact?.factFeb26Units);
    const planRevenue = numberOrZero(sku?.planFact?.planRevenue || sku?.planFact?.planMonthRevenue || sku?.planFact?.factTotalRevenue);
    const planToDateRevenue = numberOrZero(sku?.planFact?.planToDateRevenue) || planRevenue || factRevenue;
    const marginPct = asPctFraction(firstFinite(platformData.marginPct, priceRow?.avgMargin7dPct, sku?.planFact?.factFeb26MarginPct));
    return {
      ...sku,
      key: rowKey(sku),
      articleKey: sku.articleKey || sku.article,
      article: sku.article || sku.articleKey,
      title: rowTitle(sku),
      owner: fallbackOwner(sku, platform),
      platform,
      primaryPlatform: platform,
      factRevenue,
      planRevenue,
      planToDateRevenue,
      gapToDate: factRevenue - planToDateRevenue,
      marginPct,
      planMarginPct: asPctFraction(firstFinite(priceRow?.allowedMarginPct, sku?.planMarginPct)),
      factUnits,
      planUnits: numberOrZero(sku?.planFact?.planFeb26Units || sku?.planFact?.planApr26Units),
      adSpend: numberOrZero(sku?.adSpend || sku?.factAdSpend),
      drr: null,
      currentPrice: fallbackPrice({ row: sku, metric: {}, platform }, priceRow),
      currentClientPrice: fallbackClientPrice({ row: sku, metric: {}, platform }, priceRow)
    };
  }

  function fallbackBuildModel() {
    if (!fallbackModelData?.skus?.length) return null;
    priceHistoryPayload();
    const filters = fallbackFiltersFromDom();
    const priceDates = priceHistoryIndex().dates;
    const periodStart = filters.dateFrom || priceDates[0] || `${new Date().toISOString().slice(0, 7)}-01`;
    const periodEnd = filters.dateTo || priceDates[priceDates.length - 1] || new Date().toISOString().slice(0, 10);
    const allRows = fallbackModelData.skus.map((sku) => fallbackBuildRow(sku, filters, periodStart, periodEnd)).filter((row) => row.articleKey || row.article);
    const search = textKey(filters.search);
    const rows = allRows.filter((row) => {
      if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
      if (search && !`${row.articleKey} ${row.article} ${row.name} ${row.owner}`.toLowerCase().includes(search)) return false;
      return true;
    }).sort((a, b) => (a.gapToDate || 0) - (b.gapToDate || 0));
    return {
      filters,
      rows,
      allRows,
      periodStart,
      periodEnd,
      selectedDate: periodEnd,
      maxFactDate: periodEnd,
      monthStart: periodStart,
      platforms: ['wb', 'ozon', 'ym'],
      owners: Array.from(new Set(allRows.map((row) => row.owner).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')),
      totals: aggregate(rows.map((row) => rowMetricView(row, { rows, allRows, filters })))
    };
  }

  function buildModel() {
    const builder = window.skuPlanFactBuildModel || (typeof skuPlanFactBuildModel === 'function' ? skuPlanFactBuildModel : null);
    if (typeof builder !== 'function') return fallbackBuildModel();
    try { return builder(); } catch (error) {
      console.warn('[planfact-v4:model]', error);
      return fallbackBuildModel();
    }
  }

  function displayMetric(row, model, platform = '') {
    const getter = window.skuPlanFactDisplayMetric || (typeof skuPlanFactDisplayMetric === 'function' ? skuPlanFactDisplayMetric : null);
    const scopedModel = platform && platform !== 'all'
      ? { ...model, filters: { ...(model?.filters || {}), platform } }
      : model;
    if (typeof getter === 'function') {
      try { return getter(row, scopedModel) || {}; } catch (_) {}
    }
    return row || {};
  }

  function metricValue(metric, row, names) {
    for (const name of names) {
      const direct = numberOrNull(metric?.[name]);
      if (direct !== null) return direct;
      const fromRow = numberOrNull(row?.[name]);
      if (fromRow !== null) return fromRow;
    }
    return null;
  }

  function rowKey(row = {}) {
    return String(row.articleKey || row.article || row.sku || row.vendorCode || '').trim();
  }

  function rowTitle(row = {}) {
    return String(row.name || row.title || row.article || row.articleKey || 'SKU').trim();
  }

  function rowOwner(row = {}) {
    return String(row.owner || row.ownerBase || 'Без owner').trim();
  }

  function rowMetricView(row, model, platform = '') {
    const metric = displayMetric(row, model, platform);
    const factRevenue = metricValue(metric, row, ['factRevenue', 'revenue', 'turnover']) || 0;
    const planToDateRevenue = metricValue(metric, row, ['planToDateRevenue', 'planToDate', 'planToDateFact']) || 0;
    const planRevenue = metricValue(metric, row, ['planRevenue', 'monthPlanRevenue', 'monthPlan']) || 0;
    const completionToDate = numberOrNull(metric.completionToDate) ?? ratio(factRevenue, planToDateRevenue);
    const gapToDate = numberOrNull(metric.gapToDate) ?? (factRevenue - planToDateRevenue);
    const marginPct = numberOrNull(metric.marginPct ?? row.marginPct);
    const planMarginPct = numberOrNull(metric.planMarginPct ?? row.planMarginPct);
    const marginRub = numberOrNull(metric.marginRub) ?? (marginPct === null ? null : factRevenue * marginPct);
    const adSpend = metricValue(metric, row, ['adSpend', 'factAdSpend', 'adFact']) || 0;
    const planAdSpend = metricValue(metric, row, ['planAdSpendToDate', 'planAdSpend', 'adPlan']) || 0;
    const drr = numberOrNull(metric.drr) ?? ratio(adSpend, factRevenue);
    const planDrr = numberOrNull(metric.planDrr) ?? ratio(planAdSpend, planToDateRevenue);
    const platformKey = normalizedPlatform(metric.tonePlatform || metric.platform || platform || row.platform || row.primaryPlatform || 'all');
    return {
      key: rowKey(row),
      row,
      metric,
      platform: platformKey,
      owner: rowOwner(row),
      title: rowTitle(row),
      factRevenue,
      planToDateRevenue,
      planRevenue,
      completionToDate,
      gapToDate,
      marginPct,
      planMarginPct,
      marginRub,
      adSpend,
      planAdSpend,
      drr,
      planDrr,
      factUnits: metricValue(metric, row, ['factUnits', 'units', 'orders']) || 0,
      planUnits: metricValue(metric, row, ['planToDateUnits', 'planUnits']) || 0,
      status: planToDateRevenue <= 0 ? 'no_plan' : completionToDate === null ? 'watch' : completionToDate < 0.9 ? 'under_plan' : completionToDate < 1 ? 'watch' : completionToDate > 1.2 ? 'over_plan' : 'ok'
    };
  }

  function visibleRows(model) {
    return Array.isArray(model?.rows) ? model.rows : [];
  }

  function allRows(model) {
    return Array.isArray(model?.allRows) && model.allRows.length ? model.allRows : visibleRows(model);
  }

  function aggregate(views) {
    const result = views.reduce((acc, view) => {
      acc.factRevenue += view.factRevenue || 0;
      acc.planToDateRevenue += view.planToDateRevenue || 0;
      acc.planRevenue += view.planRevenue || 0;
      acc.gapToDate += view.gapToDate || 0;
      acc.adSpend += view.adSpend || 0;
      acc.planAdSpend += view.planAdSpend || 0;
      acc.factUnits += view.factUnits || 0;
      acc.planUnits += view.planUnits || 0;
      const weight = view.factRevenue || view.planToDateRevenue || view.planRevenue || 0;
      if (view.marginPct !== null && weight > 0) {
        acc.marginWeighted += view.marginPct * weight;
        acc.marginWeight += weight;
      }
      if (view.planMarginPct !== null && weight > 0) {
        acc.planMarginWeighted += view.planMarginPct * weight;
        acc.planMarginWeight += weight;
      }
      if (view.planToDateRevenue > 0 && view.factRevenue < view.planToDateRevenue) acc.underPlan += 1;
      return acc;
    }, {
      factRevenue: 0,
      planToDateRevenue: 0,
      planRevenue: 0,
      gapToDate: 0,
      adSpend: 0,
      planAdSpend: 0,
      factUnits: 0,
      planUnits: 0,
      marginWeighted: 0,
      marginWeight: 0,
      planMarginWeighted: 0,
      planMarginWeight: 0,
      underPlan: 0
    });
    result.completionToDate = ratio(result.factRevenue, result.planToDateRevenue);
    result.completionMonth = ratio(result.factRevenue, result.planRevenue);
    result.marginPct = result.marginWeight ? result.marginWeighted / result.marginWeight : null;
    result.planMarginPct = result.planMarginWeight ? result.planMarginWeighted / result.planMarginWeight : null;
    result.marginRub = result.marginPct === null ? null : result.factRevenue * result.marginPct;
    result.drr = ratio(result.adSpend, result.factRevenue);
    result.planDrr = ratio(result.planAdSpend, result.planToDateRevenue);
    result.rows = views.length;
    return result;
  }

  function rowDailySource(view) {
    const row = view.row || {};
    const metric = view.metric || {};
    const platform = view.platform || 'all';
    if (Array.isArray(metric.daily) && metric.daily.length) return metric.daily;
    if (Array.isArray(row.daily) && row.daily.length) return row.daily;
    if (Array.isArray(row.monthly) && row.monthly.length) return row.monthly;
    const platformMetric = row.platforms?.[platform] || row[platform];
    if (Array.isArray(platformMetric?.daily) && platformMetric.daily.length) return platformMetric.daily;
    return [];
  }

  function textKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function candidateRowKeys(row = {}) {
    return [
      row.articleKey,
      row.article,
      row.sku,
      row.vendorCode,
      row.nmId,
      row.offerId
    ].map(textKey).filter(Boolean);
  }

  function firstFinite(...values) {
    for (const value of values) {
      const parsed = numberOrNull(value);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function asPctFraction(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return null;
    return Math.abs(parsed) > 3 ? parsed / 100 : parsed;
  }

  function priceHistoryPayload() {
    const app = appState();
    return app?.prices || app?.v79?.prices || window.state?.prices || window.state?.v79?.prices || fallbackModelData?.prices || null;
  }

  function priceRowsFromBlock(block) {
    if (!block) return [];
    if (Array.isArray(block.rows)) return block.rows;
    if (Array.isArray(block.items)) return block.items;
    if (Array.isArray(block.skus)) return block.skus;
    return [];
  }

  function priceHistoryIndex() {
    const payload = priceHistoryPayload();
    if (!payload) return { byExact: new Map(), byKey: new Map(), dates: [] };
    if (priceHistoryCacheSource === payload && priceHistoryCache) return priceHistoryCache;
    const byExact = new Map();
    const byKey = new Map();
    const dates = Array.isArray(payload.dates)
      ? payload.dates.map((item) => String(item?.date || item?.label || '').slice(0, 10)).filter(Boolean)
      : [];
    Object.entries(payload.platforms || {}).forEach(([platformName, block]) => {
      const platform = normalizedPlatform(platformName);
      priceRowsFromBlock(block).forEach((row) => {
        candidateRowKeys(row).forEach((key) => {
          if (!byExact.has(`${platform}|${key}`)) byExact.set(`${platform}|${key}`, row);
          if (!byKey.has(key)) byKey.set(key, row);
        });
      });
    });
    priceHistoryCacheSource = payload;
    priceHistoryCache = { byExact, byKey, dates };
    return priceHistoryCache;
  }

  function priceHistoryForView(view, model) {
    const index = priceHistoryIndex();
    const row = view.row || {};
    const platformHints = [
      model?.filters?.platform,
      view.platform,
      view.metric?.platform,
      row.platform,
      row.primaryPlatform
    ].map(normalizedPlatform).filter((key) => key && key !== 'all');
    const keys = [...new Set([view.key, ...candidateRowKeys(row)].map(textKey).filter(Boolean))];
    for (const platform of platformHints) {
      for (const key of keys) {
        const found = index.byExact.get(`${platform}|${key}`);
        if (found) return found;
      }
    }
    for (const key of keys) {
      const found = index.byKey.get(key);
      if (found) return found;
    }
    return null;
  }

  function dailyNumber(item, keys) {
    for (const key of keys) {
      const parsed = numberOrNull(item?.[key]);
      if (parsed !== null) return parsed;
    }
    return 0;
  }

  function dailyNumberOrNull(item, keys) {
    for (const key of keys) {
      const parsed = numberOrNull(item?.[key]);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function dailyRevenue(item) {
    return dailyNumberOrNull(item, ['factRevenue', 'revenue', 'sales', 'turnover', 'amount', 'fact', 'value']);
  }

  function dailyUnits(item) {
    return dailyNumberOrNull(item, ['factUnits', 'units', 'ordersUnits', 'orders', 'ordered', 'buyouts', 'deliveredUnits']);
  }

  function dailyPrice(item) {
    const revenue = dailyRevenue(item);
    const units = dailyUnits(item);
    return firstFinite(
      item?.price,
      item?.currentPrice,
      item?.currentFillPrice,
      item?.sellerPrice,
      item?.avgPrice,
      revenue !== null && units ? revenue / units : null
    );
  }

  function dailyClientPrice(item) {
    const price = dailyPrice(item);
    const spp = asPctFraction(firstFinite(item?.sppPct, item?.discountPct, item?.clientDiscountPct));
    return firstFinite(
      item?.clientPrice,
      item?.currentClientPrice,
      item?.priceWithSpp,
      item?.finalPrice,
      price !== null && spp !== null ? price * (1 - spp) : null
    );
  }

  function dailyMarginPct(item) {
    return asPctFraction(firstFinite(
      item?.marginPct,
      item?.avgMargin7dPct,
      item?.marginTotalPct,
      item?.estimatedMarginPct,
      item?.profitMarginPct,
      item?.margin
    ));
  }

  function rowHistorySource(view, model) {
    const map = new Map();
    rowDailySource(view).forEach((item) => {
      const date = String(item?.date || item?.day || item?.label || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) map.set(date, { ...item, date });
    });
    const priceRow = priceHistoryForView(view, model);
    if (Array.isArray(priceRow?.daily)) {
      priceRow.daily.forEach((item) => {
        const date = String(item?.date || item?.day || item?.label || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        map.set(date, { ...(map.get(date) || {}), ...item, date });
      });
    }
    return Array.from(map.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function fallbackMarginPct(view, priceRow) {
    return asPctFraction(firstFinite(
      view.marginPct,
      priceRow?.avgMargin7dPct,
      priceRow?.marginPct,
      view.row?.avgMargin7dPct,
      view.row?.marginPct
    ));
  }

  function fallbackPrice(view, priceRow) {
    return firstFinite(
      priceRow?.currentPrice,
      view.metric?.currentPrice,
      view.row?.currentPrice,
      view.row?.price,
      view.row?.avgPrice
    );
  }

  function fallbackClientPrice(view, priceRow) {
    return firstFinite(
      priceRow?.currentClientPrice,
      view.metric?.currentClientPrice,
      view.row?.currentClientPrice,
      view.row?.clientPrice
    );
  }

  function buildDaily(views, model) {
    const map = new Map();
    const periodStart = String(model?.periodStart || model?.monthStart || '').slice(0, 10);
    const periodEnd = String(model?.periodEnd || model?.selectedDate || model?.maxFactDate || '').slice(0, 10);
    views.forEach((view) => {
      const daily = rowHistorySource(view, model);
      if (!daily.length) return;
      daily.forEach((item) => {
        const date = String(item?.date || item?.day || item?.label || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        if (periodStart && date < periodStart) return;
        if (periodEnd && date > periodEnd) return;
        const current = map.get(date) || {
          date,
          fact: 0,
          plan: 0,
          reach: 0,
          clicks: 0,
          carts: 0,
          orders: 0,
          buys: 0,
          kzRevenue: 0,
          kzCost: 0,
          priceWeighted: 0,
          priceWeight: 0,
          clientPriceWeighted: 0,
          clientPriceWeight: 0,
          marginWeighted: 0,
          marginWeight: 0,
          marginRub: 0,
          marginRubFound: false,
          activeSkuCount: 0,
          sourceQuality: 'missing'
        };
        const fact = dailyNumber(item, ['factRevenue', 'revenue', 'sales', 'turnover', 'amount', 'fact', 'value']);
        const units = dailyNumber(item, ['factUnits', 'units', 'ordersUnits', 'orders', 'ordered', 'buyouts', 'deliveredUnits']);
        const price = dailyPrice(item);
        const clientPrice = dailyClientPrice(item);
        const marginPct = dailyMarginPct(item);
        const valueWeight = fact || units || 1;
        if (fact || units || price !== null || clientPrice !== null || marginPct !== null) current.activeSkuCount += 1;
        current.fact += fact;
        current.plan += dailyNumber(item, ['planRevenue', 'plan', 'planToDateRevenue']);
        current.reach += dailyNumber(item, ['reach', 'views', 'impressions']);
        current.clicks += dailyNumber(item, ['clicks']);
        current.carts += dailyNumber(item, ['carts', 'toCart', 'cartAdds']);
        current.orders += dailyNumber(item, ['orders', 'ordered', 'ordersUnits']);
        current.buys += dailyNumber(item, ['buys', 'purchases', 'buyouts']);
        current.kzRevenue += dailyNumber(item, ['kzRevenue', 'attributedRevenue', 'contentRevenue']);
        current.kzCost += dailyNumber(item, ['kzCost', 'contentCost', 'cost']);
        if (price !== null) {
          current.priceWeighted += price * valueWeight;
          current.priceWeight += valueWeight;
        }
        if (clientPrice !== null) {
          current.clientPriceWeighted += clientPrice * valueWeight;
          current.clientPriceWeight += valueWeight;
        }
        if (marginPct !== null) {
          current.marginWeighted += marginPct * valueWeight;
          current.marginWeight += valueWeight;
          if (fact) {
            current.marginRub += fact * marginPct;
            current.marginRubFound = true;
            current.sourceQuality = 'derived';
          } else {
            current.sourceQuality = current.sourceQuality === 'missing' ? 'daily' : current.sourceQuality;
          }
        }
        map.set(date, current);
      });
    });
    const days = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    days.forEach((day) => {
      day.price = day.priceWeight ? day.priceWeighted / day.priceWeight : null;
      day.clientPrice = day.clientPriceWeight ? day.clientPriceWeighted / day.clientPriceWeight : null;
      day.marginPct = day.marginWeight ? day.marginWeighted / day.marginWeight : null;
      day.marginRub = day.marginRubFound ? day.marginRub : null;
      day.factRevenue = day.fact;
      day.planRevenue = day.plan;
      day.previousRevenue = null;
      day.planMarginPct = null;
      day.adSpend = day.kzCost || 0;
      day.drr = ratio(day.adSpend, day.factRevenue);
      day.sourceQuality = day.marginWeight ? day.sourceQuality : 'missing';
    });
    if (days.some((day) => day.plan > 0)) return days;
    if (!days.length) return days;
    const totalPlan = views.reduce((total, view) => total + (view.planToDateRevenue || 0), 0);
    const perDayPlan = totalPlan / Math.max(days.length, 1);
    days.forEach((day) => { day.plan = perDayPlan; });
    return days;
  }

  function renderKpi(label, value, hint, color, progress = null, attrs = '') {
    const width = progress === null ? 0 : clamp(pctValue(progress), 0, 100);
    return `
      <button class="pf-v4-kpi" type="button" style="--pf-v4-color:${escapeHtml(color || MARKET_COLORS.all)};--pf-v4-width:${width.toFixed(2)}%" ${attrs}>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <em>${escapeHtml(hint || '')}</em>
        <i aria-hidden="true"></i>
      </button>
    `;
  }

  function pfCompactMoney(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return '—';
    const abs = Math.abs(parsed);
    if (abs >= 1000000) return `${(parsed / 1000000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽`;
    if (abs >= 1000) return `${(parsed / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} тыс. ₽`;
    return fmtMoney(parsed);
  }

  function pfSvgDomain(values, pad = 0.12, floorZero = false) {
    const clean = values.map((value) => numberOrNull(value)).filter((value) => value !== null);
    if (!clean.length) return { min: 0, max: 1 };
    const rawMin = Math.min(...clean);
    const min = floorZero && rawMin >= 0 ? 0 : Math.min(0, rawMin);
    const max = Math.max(...clean);
    const spread = Math.max(1, max - min);
    return { min: floorZero && min === 0 ? 0 : min - spread * pad, max: max + spread * pad };
  }

  function pfScaleY(value, domain, top, height) {
    const parsed = numberOrNull(value);
    if (parsed === null) return top + height;
    const span = Math.max(1, domain.max - domain.min);
    return top + height - ((parsed - domain.min) / span) * height;
  }

  function pfLinePath(points) {
    return points
      .filter((point) => point && numberOrNull(point.y) !== null)
      .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(' ');
  }

  function pfAreaPath(points, baseY) {
    const clean = points.filter((point) => point && numberOrNull(point.y) !== null);
    if (!clean.length) return '';
    return `${pfLinePath(clean)} L${clean[clean.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L${clean[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
  }

  function pfDailyPointForView(view, date, model) {
    const item = rowHistorySource(view, model).find((entry) => String(entry?.date || entry?.day || entry?.label || '').slice(0, 10) === date);
    if (!item) return null;
    const fact = dailyNumber(item, ['factRevenue', 'revenue', 'sales', 'turnover', 'amount', 'fact', 'value']);
    const plan = dailyNumber(item, ['planRevenue', 'plan', 'planToDateRevenue']);
    const units = dailyNumber(item, ['factUnits', 'units', 'ordersUnits', 'orders', 'ordered', 'buyouts', 'deliveredUnits']);
    const marginPct = dailyMarginPct(item);
    const marginRub = fact && marginPct !== null ? fact * marginPct : null;
    return { view, date, fact, plan, units, gap: fact - plan, marginPct, marginRub };
  }

  function buildPlanFactOverviewModel(model, views) {
    const aggregateTotals = aggregate(views);
    const totals = model?.totals?.factRevenue !== undefined ? { ...aggregateTotals, ...model.totals } : aggregateTotals;
    const days = buildDaily(views, model);
    const ui = planFactUi();
    const selectedDate = days.some((day) => day.date === ui.selectedDate)
      ? ui.selectedDate
      : (days[days.length - 1]?.date || '');
    const selectedDay = days.find((day) => day.date === selectedDate) || days[days.length - 1] || null;
    const dayViews = selectedDate ? views.map((view) => pfDailyPointForView(view, selectedDate, model)).filter(Boolean) : [];
    const dayDrivers = dayViews
      .filter((point) => point.fact || point.plan)
      .sort((a, b) => Math.abs(b.gap || 0) - Math.abs(a.gap || 0));
    const positive = dayDrivers.filter((point) => point.gap > 0).slice(0, 5);
    const negative = dayDrivers.filter((point) => point.gap < 0).slice(0, 5);
    const platformGaps = new Map();
    views.forEach((view) => {
      const key = normalizedPlatform(view.platform || 'all');
      const current = platformGaps.get(key) || { platform: key, gap: 0, count: 0 };
      current.gap += view.gapToDate || 0;
      current.count += 1;
      platformGaps.set(key, current);
    });
    const platformRows = Array.from(platformGaps.values());
    const bestPlatform = [...platformRows].sort((a, b) => b.gap - a.gap)[0] || null;
    const worstPlatform = [...platformRows].sort((a, b) => a.gap - b.gap)[0] || null;
    const marginRisks = views
      .filter((view) => view.marginPct !== null && view.planMarginPct !== null && view.marginPct < view.planMarginPct - 0.03)
      .sort((a, b) => (a.marginPct - a.planMarginPct) - (b.marginPct - b.planMarginPct));
    return { model, views, totals, days, ui, selectedDate, selectedDay, dayDrivers, positive, negative, bestPlatform, worstPlatform, marginRisks };
  }

  function renderPlanFactTooltip(day) {
    const fact = day.factRevenue ?? day.fact;
    const plan = day.planRevenue ?? day.plan;
    const completion = ratio(fact, plan);
    const gap = (fact || 0) - (plan || 0);
    return [
      shortDate(day.date),
      `Факт: ${fmtMoney(fact)}`,
      `План: ${fmtMoney(plan)}`,
      `Выполнение: ${fmtPct(completion)}`,
      `Gap: ${fmtSignedMoney(gap)}`,
      `Активных SKU: ${fmtInt(day.activeSkuCount || 0)}`,
      `Источник: ${day.sourceQuality || 'daily'}`
    ].join('\n');
  }

  function renderPlanFactRevenueChart(days) {
    if (!days.length) return '<div class="pf-v4-empty">Нет дневной истории по текущему срезу. Таблица ниже остается рабочей и показывает план/факт по SKU.</div>';
    const ui = planFactUi();
    const selectedDate = days.some((day) => day.date === ui.selectedDate) ? ui.selectedDate : days[days.length - 1].date;
    const w = 980, h = 360, left = 66, right = 24, top = 28, bottom = 46;
    const plotW = w - left - right;
    const plotH = h - top - bottom;
    const step = days.length > 1 ? plotW / (days.length - 1) : plotW;
    const barGap = 6;
    const barW = Math.max(10, Math.min(30, plotW / Math.max(days.length, 1) - barGap));
    const domain = pfSvgDomain(days.flatMap((day) => [day.factRevenue ?? day.fact, day.planRevenue ?? day.plan, day.previousRevenue]), 0.12, true);
    const planPoints = days
      .map((day, index) => ({ x: left + index * step, y: pfScaleY(day.planRevenue ?? day.plan, domain, top, plotH), value: day.planRevenue ?? day.plan }))
      .filter((point) => numberOrNull(point.value) !== null && point.value > 0);
    const previousPoints = days
      .map((day, index) => ({ x: left + index * step, y: pfScaleY(day.previousRevenue, domain, top, plotH), value: day.previousRevenue }))
      .filter((point) => numberOrNull(point.value) !== null);
    const selectedIndex = Math.max(0, days.findIndex((day) => day.date === selectedDate));
    const yTicks = Array.from({ length: 5 }, (_, index) => domain.min + (domain.max - domain.min) * (index / 4));
    const xStep = Math.max(1, Math.ceil(days.length / 8));
    return `
      <div class="pf-v4-svg-shell" data-pf-v4-chart="revenue">
        <svg class="pf-v4-svg-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="План-факт выручки по дням">
          <defs><linearGradient id="pf-v4-revenue-bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#80e5a2"/><stop offset="1" stop-color="#d9b75d"/></linearGradient></defs>
          <g class="pf-v4-svg-grid">
            ${yTicks.map((tick) => {
              const y = pfScaleY(tick, domain, top, plotH);
              return `<line x1="${left}" x2="${w - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="pf-v4-svg-y" x="${left - 12}" y="${(y + 4).toFixed(1)}">${escapeHtml(pfCompactMoney(tick))}</text>`;
            }).join('')}
          </g>
          ${previousPoints.length > 1 ? `<path class="pf-v4-previous-line" d="${pfLinePath(previousPoints)}"></path>` : ''}
          ${planPoints.length > 1 ? `<path class="pf-v4-plan-line" d="${pfLinePath(planPoints)}"></path>` : ''}
          ${days.map((day, index) => {
            const value = day.factRevenue ?? day.fact;
            const parsed = numberOrNull(value);
            if (parsed === null) return '';
            const x = left + index * step - barW / 2;
            const y = pfScaleY(parsed, domain, top, plotH);
            const barH = Math.max(0, top + plotH - y);
            const active = day.date === selectedDate ? ' is-active' : '';
            return `
              <g class="pf-v4-day-hit${active}" data-pf-v4-day="${escapeHtml(day.date)}" tabindex="0" role="button" aria-label="${escapeHtml(shortDate(day.date))}">
                <title>${escapeHtml(renderPlanFactTooltip(day))}</title>
                <rect class="pf-v4-svg-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="7"></rect>
                <rect class="pf-v4-hit-rect" x="${(left + index * step - Math.max(16, step / 2)).toFixed(1)}" y="${top}" width="${Math.max(32, step).toFixed(1)}" height="${plotH}"></rect>
              </g>`;
          }).join('')}
          ${selectedIndex >= 0 ? `<line class="pf-v4-crosshair" x1="${(left + selectedIndex * step).toFixed(1)}" x2="${(left + selectedIndex * step).toFixed(1)}" y1="${top}" y2="${top + plotH}"></line>` : ''}
          ${days.map((day, index) => index % xStep === 0 || index === days.length - 1 ? `<text class="pf-v4-svg-x" x="${(left + index * step).toFixed(1)}" y="${h - 16}">${escapeHtml(shortDate(day.date))}</text>` : '').join('')}
        </svg>
        <div class="pf-v4-legend">
          <span><i class="fact"></i>факт</span>
          <span><i class="plan"></i>план</span>
          ${previousPoints.length > 1 ? '<span><i class="previous"></i>предыдущий период</span>' : ''}
        </div>
      </div>`;
  }

  function renderPlanFactMarginChart(overview) {
    const days = overview.days || [];
    const ui = planFactUi();
    const metric = ui.marginMetric === 'rub' ? 'rub' : 'pct';
    const selectedDate = overview.selectedDate || days[days.length - 1]?.date || '';
    const pointsSource = days
      .map((day) => ({ ...day, value: metric === 'rub' ? day.marginRub : day.marginPct }))
      .filter((day) => numberOrNull(day.value) !== null && day.sourceQuality !== 'snapshot');
    const marginValuesPct = days.map((day) => day.marginPct).filter((value) => numberOrNull(value) !== null);
    const marginRange = marginValuesPct.length ? `${fmtPct(Math.min(...marginValuesPct))} — ${fmtPct(Math.max(...marginValuesPct))}` : '—';
    const side = `
      <aside class="pf-v4-margin-side">
        <span>Сводка</span>
        <strong>${escapeHtml(metric === 'rub' ? fmtMoney(overview.totals.marginRub) : fmtPct(overview.totals.marginPct))}</strong>
        <em>выполнение ${escapeHtml(fmtPct(overview.totals.completionToDate))}</em>
        <em>ДРР ${escapeHtml(fmtPct(overview.totals.drr))}</em>
        <em>диапазон ${escapeHtml(marginRange)}</em>
        <em>${escapeHtml(fmtInt(pointsSource.length))} дней с дневной маржой</em>
      </aside>`;
    if (!pointsSource.length) {
      return `<div class="pf-v4-margin-layout" id="pf-v4-margin-chart"><div class="pf-v4-empty">Нет дневной истории маржи. Snapshot оставлен в KPI, но линия по дням не рисуется.</div>${side}</div>`;
    }
    const w = 760, h = 320, left = 58, right = 18, top = 26, bottom = 44;
    const plotW = w - left - right;
    const plotH = h - top - bottom;
    const domain = pfSvgDomain(pointsSource.map((point) => point.value), 0.18);
    const byDate = new Map(pointsSource.map((point) => [point.date, point]));
    const step = days.length > 1 ? plotW / (days.length - 1) : plotW;
    const linePoints = days.map((day, index) => {
      const point = byDate.get(day.date);
      return point ? { x: left + index * step, y: pfScaleY(point.value, domain, top, plotH), day: point } : null;
    }).filter(Boolean);
    const planPoints = metric === 'pct'
      ? days.map((day, index) => ({ x: left + index * step, y: pfScaleY(day.planMarginPct, domain, top, plotH), value: day.planMarginPct })).filter((point) => numberOrNull(point.value) !== null)
      : [];
    const selectedIndex = Math.max(0, days.findIndex((day) => day.date === selectedDate));
    const yTicks = Array.from({ length: 4 }, (_, index) => domain.min + (domain.max - domain.min) * (index / 3));
    const xStep = Math.max(1, Math.ceil(days.length / 7));
    return `
      <div class="pf-v4-margin-layout" id="pf-v4-margin-chart">
        <div class="pf-v4-svg-shell" data-pf-v4-chart="margin">
          <div class="pf-v4-chart-tabs">
            <button type="button" data-pf-v4-margin-metric="pct" aria-pressed="${metric === 'pct' ? 'true' : 'false'}">Маржа %</button>
            <button type="button" data-pf-v4-margin-metric="rub" aria-pressed="${metric === 'rub' ? 'true' : 'false'}">Маржа ₽</button>
            <button type="button" data-pf-v4-margin-focus="market">По площадкам</button>
            <button type="button" data-pf-v4-margin-focus="sku">По SKU</button>
          </div>
          <svg class="pf-v4-svg-chart pf-v4-margin-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Маржа и выполнение по дням">
            <defs><linearGradient id="pf-v4-margin-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#78dea0" stop-opacity=".32"/><stop offset="1" stop-color="#78dea0" stop-opacity="0"/></linearGradient></defs>
            <g class="pf-v4-svg-grid">
              ${yTicks.map((tick) => {
                const y = pfScaleY(tick, domain, top, plotH);
                const label = metric === 'rub' ? pfCompactMoney(tick) : fmtPct(tick);
                return `<line x1="${left}" x2="${w - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="pf-v4-svg-y" x="${left - 12}" y="${(y + 4).toFixed(1)}">${escapeHtml(label)}</text>`;
              }).join('')}
            </g>
            ${linePoints.length > 1 ? `<path class="pf-v4-margin-area" d="${pfAreaPath(linePoints, top + plotH)}"></path><path class="pf-v4-margin-line" d="${pfLinePath(linePoints)}"></path>` : ''}
            ${planPoints.length > 1 ? `<path class="pf-v4-plan-line thin" d="${pfLinePath(planPoints)}"></path>` : ''}
            ${linePoints.map((point) => `
              <g class="pf-v4-day-hit${point.day.date === selectedDate ? ' is-active' : ''}" data-pf-v4-day="${escapeHtml(point.day.date)}" tabindex="0" role="button">
                <title>${escapeHtml(renderPlanFactTooltip(point.day))}</title>
                <circle class="pf-v4-margin-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${point.day.date === selectedDate ? 5 : 3.5}"></circle>
              </g>`).join('')}
            ${selectedIndex >= 0 ? `<line class="pf-v4-crosshair" x1="${(left + selectedIndex * step).toFixed(1)}" x2="${(left + selectedIndex * step).toFixed(1)}" y1="${top}" y2="${top + plotH}"></line>` : ''}
            ${days.map((day, index) => index % xStep === 0 || index === days.length - 1 ? `<text class="pf-v4-svg-x" x="${(left + index * step).toFixed(1)}" y="${h - 16}">${escapeHtml(shortDate(day.date))}</text>` : '').join('')}
          </svg>
        </div>
        ${side}
      </div>`;
  }

  function renderPlanFactDayDrivers(overview) {
    const rows = [...overview.negative, ...overview.positive].slice(0, 10);
    if (!rows.length) return renderDrivers(overview.views);
    return rows.map((point, index) => `
      <button class="pf-v4-driver" type="button" data-pf-v4-sku="${escapeHtml(point.view.key)}">
        <i>${index + 1}</i>
        <span><b>${escapeHtml(point.view.title)}</b><em>${escapeHtml(shortDate(point.date))} · ${escapeHtml(point.view.owner)}</em></span>
        <strong class="${point.gap >= 0 ? 'positive' : 'negative'}">${escapeHtml(fmtSignedMoney(point.gap))}</strong>
      </button>`).join('');
  }

  function renderPlanFactInsights(overview) {
    const best = overview.bestPlatform;
    const worst = overview.worstPlatform;
    const margin = overview.marginRisks[0];
    const underCount = aggregate(overview.views).underPlan;
    return `
      <div class="pf-v4-insights">
        <button type="button" data-pf-v4-platform="${escapeHtml(best?.platform || 'all')}"><span>Где перевыполнение</span><strong>${escapeHtml(best ? `${platformLabel(best.platform)} · ${fmtSignedMoney(best.gap)}` : '—')}</strong><em>${escapeHtml(best ? `${fmtInt(best.count)} SKU в текущем фильтре` : 'Нет положительного вклада')}</em></button>
        <button type="button" data-pf-v4-platform="${escapeHtml(worst?.platform || 'all')}"><span>Где недобор</span><strong class="negative">${escapeHtml(worst ? `${platformLabel(worst.platform)} · ${fmtSignedMoney(worst.gap)}` : '—')}</strong><em>Переход к площадке и строкам SKU</em></button>
        <button type="button" data-pf-v4-margin-focus="sku"><span>Где теряем маржу</span><strong class="negative">${escapeHtml(margin ? margin.title : 'Нет критичного провала')}</strong><em>${escapeHtml(margin ? `${fmtPct(margin.marginPct)} против плана ${fmtPct(margin.planMarginPct)}` : 'Плановая маржа не нарушена')}</em></button>
        <button type="button" data-pf-v4-scroll-table><span>Задачи на сегодня</span><strong>${escapeHtml(fmtInt(underCount))} SKU ниже плана</strong><em>Открыть полную таблицу с текущими фильтрами</em></button>
      </div>`;
  }

  function renderPlanFactGeneralV4(model, views) {
    const overview = buildPlanFactOverviewModel(model, views);
    const totals = overview.totals;
    const underPlan = aggregate(views).underPlan;
    return `
      <div class="pf-v4-kpis">
        ${renderKpi('Выполнение к дате', fmtPct(totals.completionToDate), `факт ${fmtMoney(totals.factRevenue)}`, totals.completionToDate >= 1 ? '#74c99a' : '#e0b760', totals.completionToDate, 'data-pf-v4-scroll-table')}
        ${renderKpi('Факт выручки', fmtMoney(totals.factRevenue), `план ${fmtMoney(totals.planToDateRevenue)}`, MARKET_COLORS.all, totals.completionToDate, 'data-pf-v4-scroll-table')}
        ${renderKpi('Разрыв к дате', fmtSignedMoney(totals.gapToDate), `${fmtInt(underPlan)} SKU ниже плана`, totals.gapToDate >= 0 ? '#74c99a' : '#e7786b', null, 'data-pf-v4-scroll-table')}
        ${renderKpi('Маржа', fmtPct(totals.marginPct), `план ${fmtPct(totals.planMarginPct)}`, '#74c99a', totals.marginPct, 'data-pf-v4-margin-focus="chart"')}
        ${renderKpi('Реклама / ДРР', fmtMoney(totals.adSpend), `ДРР ${fmtPct(totals.drr)} · план ${fmtPct(totals.planDrr)}`, '#e0b760', totals.drr)}
        ${renderKpi('SKU ниже плана', fmtInt(underPlan), 'клик ведет к детализации', '#ff8b78', ratio(underPlan, views.length || 1), 'data-pf-v4-scroll-table')}
      </div>
      <div class="pf-v4-chart-grid">
        <article class="pf-v4-panel pf-v4-chart-panel">
          <div class="pf-v4-panel-head"><div><span>Дневная выручка</span><h3>Факт против плана</h3></div><em>${escapeHtml(model?.periodStart || '—')} — ${escapeHtml(model?.periodEnd || model?.selectedDate || '—')}</em></div>
          ${renderPlanFactRevenueChart(overview.days)}
        </article>
        <article class="pf-v4-panel pf-v4-chart-panel">
          <div class="pf-v4-panel-head"><div><span>Маржа и выполнение</span><h3>Динамика без snapshot-линии</h3></div><em>${escapeHtml(overview.selectedDate ? `выбран день ${shortDate(overview.selectedDate)}` : 'день не выбран')}</em></div>
          ${renderPlanFactMarginChart(overview)}
        </article>
      </div>
      ${renderPlanFactInsights(overview)}
      <div class="pf-v4-split">
        <article class="pf-v4-panel">
          <div class="pf-v4-panel-head"><div><span>Drill-down</span><h3>Что объясняет разрыв ${escapeHtml(overview.selectedDate ? shortDate(overview.selectedDate) : '')}</h3></div><button type="button" data-pf-v4-scroll-table>Открыть SKU</button></div>
          <div class="pf-v4-drivers">${renderPlanFactDayDrivers(overview)}</div>
        </article>
        <article class="pf-v4-panel">
          <div class="pf-v4-panel-head"><div><span>Площадки</span><h3>Клик пересчитывает срез</h3></div></div>
          <div class="pf-v4-platform-grid">${renderPlatformCards(model, views)}</div>
        </article>
      </div>`;
  }

  function renderDailyChart(days) {
    return renderPlanFactRevenueChart(days);
    if (!days.length) {
      return '<div class="pf-v4-empty">Дневная история по текущему срезу не найдена. Таблица ниже остается рабочей и показывает план/факт по SKU.</div>';
    }
    const max = Math.max(1, ...days.flatMap((day) => [day.fact, day.plan]));
    return `
      <div class="pf-v4-daily-chart" role="img" aria-label="План и факт по дням">
        ${days.map((day, index) => {
          const fact = clamp(day.fact / max * 100, 1, 100);
          const plan = clamp(day.plan / max * 100, 1, 100);
          return `
            <button type="button" class="pf-v4-day" style="--i:${index};--fact:${fact.toFixed(2)}%;--plan:${plan.toFixed(2)}%" title="${escapeHtml(shortDate(day.date))}: факт ${fmtMoney(day.fact)}, план ${fmtMoney(day.plan)}">
              <span class="pf-v4-day-bars"><i></i><b></b></span>
              <em>${escapeHtml(shortDate(day.date))}</em>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderPlatformCards(model, views) {
    const platforms = Array.isArray(window.SKU_PLAN_FACT_PLATFORMS) && window.SKU_PLAN_FACT_PLATFORMS.length
      ? window.SKU_PLAN_FACT_PLATFORMS
      : ['wb', 'ozon', 'ym', 'goldapple', 'letu', 'magnit'];
    return platforms.map((platform) => {
      const scoped = views.map((view) => rowMetricView(view.row, model, platform));
      const active = scoped.filter((view) => view.factRevenue > 0 || view.planToDateRevenue > 0 || view.planRevenue > 0);
      const summary = aggregate(active);
      return renderKpi(
        platformLabel(platform),
        fmtPct(summary.completionToDate),
        `${fmtMoney(summary.factRevenue)} · ${fmtInt(active.length)} SKU`,
        platformColor(platform),
        summary.completionToDate,
        `data-pf-v4-platform="${escapeHtml(platform)}"`
      );
    }).join('');
  }

  function renderDrivers(views) {
    const rows = [...views]
      .filter((view) => view.key)
      .sort((a, b) => Math.abs(b.gapToDate || 0) - Math.abs(a.gapToDate || 0))
      .slice(0, 8);
    if (!rows.length) return '<div class="pf-v4-empty">Нет SKU для объяснения разрыва в текущем срезе.</div>';
    return rows.map((view, index) => `
      <button class="pf-v4-driver" type="button" data-pf-v4-sku="${escapeHtml(view.key)}">
        <i>${index + 1}</i>
        <span><b>${escapeHtml(view.title)}</b><em>${escapeHtml(view.owner)} · ${escapeHtml(view.key)}</em></span>
        <strong class="${view.gapToDate >= 0 ? 'positive' : 'negative'}">${escapeHtml(fmtSignedMoney(view.gapToDate))}</strong>
      </button>
    `).join('');
  }

  function renderGeneral(model, views) {
    return renderPlanFactGeneralV4(model, views);
    const totals = model?.totals?.factRevenue !== undefined
      ? {
        ...aggregate(views),
        ...model.totals
      }
      : aggregate(views);
    const daily = buildDaily(views, model);
    return `
      <div class="pf-v4-kpis">
        ${renderKpi('Факт к дате', fmtMoney(totals.factRevenue), `план ${fmtMoney(totals.planToDateRevenue)}`, MARKET_COLORS.all, totals.completionToDate)}
        ${renderKpi('Выполнение', fmtPct(totals.completionToDate), `месяц ${fmtPct(totals.completionMonth)}`, totals.completionToDate >= 1 ? '#74c99a' : '#e0b760', totals.completionToDate)}
        ${renderKpi('Gap', fmtSignedMoney(totals.gapToDate), `${fmtInt(aggregate(views).underPlan)} SKU ниже плана`, totals.gapToDate >= 0 ? '#74c99a' : '#e7786b')}
        ${renderKpi('Маржа', fmtPct(totals.marginPct), `план ${fmtPct(totals.planMarginPct)}`, '#74c99a', totals.marginPct)}
        ${renderKpi('Реклама / ДРР', fmtMoney(totals.adSpend), `ДРР ${fmtPct(totals.drr)} · план ${fmtPct(totals.planDrr)}`, '#e0b760', totals.drr)}
      </div>
      <div class="pf-v4-split">
        <article class="pf-v4-panel pf-v4-panel-wide">
          <div class="pf-v4-panel-head">
            <div><span>Дневной план-факт</span><h3>Как собирается результат</h3></div>
            <em>${escapeHtml(model?.periodStart || '—')} — ${escapeHtml(model?.periodEnd || model?.selectedDate || '—')}</em>
          </div>
          ${renderDailyChart(daily)}
        </article>
        <article class="pf-v4-panel">
          <div class="pf-v4-panel-head"><div><span>Drill-down</span><h3>Что объясняет разрыв</h3></div></div>
          <div class="pf-v4-drivers">${renderDrivers(views)}</div>
        </article>
      </div>
      <article class="pf-v4-panel">
        <div class="pf-v4-panel-head"><div><span>Площадки</span><h3>Клик переводит срез, таблица ниже остается полной</h3></div></div>
        <div class="pf-v4-platform-grid">${renderPlatformCards(model, views)}</div>
      </article>
    `;
  }

  function classifyLfl(view) {
    if (view.planToDateRevenue <= 0 && view.factRevenue > 0) return 'new';
    if (view.planToDateRevenue > 0 && view.factRevenue <= 0) return 'lost';
    return 'comparable';
  }

  function renderLfl(model, views) {
    const groups = {
      comparable: views.filter((view) => classifyLfl(view) === 'comparable'),
      new: views.filter((view) => classifyLfl(view) === 'new'),
      lost: views.filter((view) => classifyLfl(view) === 'lost')
    };
    const comparable = aggregate(groups.comparable);
    const created = aggregate(groups.new);
    const lost = aggregate(groups.lost);
    const bridge = [
      ['Сопоставимые SKU', comparable.gapToDate, '#74c99a', 'comparable'],
      ['Новые SKU', created.factRevenue, '#76a9ea', 'new'],
      ['Без факта / выбыли', -Math.abs(lost.planToDateRevenue), '#e7786b', 'lost']
    ];
    const max = Math.max(1, ...bridge.map((item) => Math.abs(item[1])));
    return `
      <div class="pf-v4-lfl-tiles">
        ${renderKpi('Сопоставимые SKU', fmtSignedMoney(comparable.gapToDate), `${fmtInt(groups.comparable.length)} SKU`, '#74c99a', ratio(Math.abs(comparable.gapToDate), max), 'data-pf-v4-lfl="comparable"')}
        ${renderKpi('Новые SKU', fmtMoney(created.factRevenue), `${fmtInt(groups.new.length)} SKU`, '#76a9ea', ratio(created.factRevenue, max), 'data-pf-v4-lfl="new"')}
        ${renderKpi('Выбывшие / без факта', fmtMoney(lost.planToDateRevenue), `${fmtInt(groups.lost.length)} SKU`, '#e7786b', ratio(lost.planToDateRevenue, max), 'data-pf-v4-lfl="lost"')}
      </div>
      <article class="pf-v4-panel">
        <div class="pf-v4-panel-head"><div><span>Мост результата</span><h3>Общее изменение = сопоставимые + новые − выбывшие</h3></div></div>
        <div class="pf-v4-waterfall">
          ${bridge.map(([label, value, color, key], index) => {
            const height = clamp(Math.abs(value) / max * 100, 5, 100);
            return `
              <button class="pf-v4-waterfall-item ${value >= 0 ? 'positive' : 'negative'}" type="button" data-pf-v4-lfl="${escapeHtml(key)}" style="--pf-v4-color:${color};--h:${height.toFixed(2)}%;--i:${index}">
                <b>${escapeHtml(fmtSignedMoney(value))}</b>
                <i></i>
                <span>${escapeHtml(label)}</span>
              </button>
            `;
          }).join('')}
        </div>
      </article>
      <article class="pf-v4-panel">
        <div class="pf-v4-panel-head"><div><span>Рабочая детализация</span><h3>Нажмите группу, чтобы сразу перейти к артикулам ниже</h3></div></div>
        <p class="pf-v4-note">Если в источнике появится неизменяемая недельная история, этот блок автоматически начнет показывать честное week-to-week сравнение; текущий расчет не подменяет таблицу и план-факт по SKU.</p>
      </article>
    `;
  }

  function renderTeam(model, views) {
    const ownerMap = new Map();
    views.forEach((view) => {
      const owner = view.owner || 'Без owner';
      const current = ownerMap.get(owner) || [];
      current.push(view);
      ownerMap.set(owner, current);
    });
    const owners = Array.from(ownerMap.entries())
      .map(([owner, list]) => ({ owner, list, summary: aggregate(list) }))
      .sort((a, b) => (a.summary.completionToDate || 0) - (b.summary.completionToDate || 0));
    return `
      <div class="pf-v4-owner-grid">
        ${owners.map(({ owner, list, summary }) => renderKpi(
          owner,
          fmtPct(summary.completionToDate),
          `${fmtMoney(summary.factRevenue)} · ${fmtInt(list.length)} SKU · gap ${fmtSignedMoney(summary.gapToDate)}`,
          summary.completionToDate >= 1 ? '#74c99a' : '#e0b760',
          summary.completionToDate,
          `data-pf-v4-owner="${escapeHtml(owner)}"`
        )).join('')}
      </div>
      <article class="pf-v4-panel">
        <div class="pf-v4-panel-head"><div><span>Сотрудники</span><h3>Клик по owner применяет фильтр таблицы</h3></div></div>
        <div class="pf-v4-team-table">
          ${owners.map(({ owner, list, summary }) => `
            <button type="button" data-pf-v4-owner="${escapeHtml(owner)}">
              <span>${escapeHtml(owner)}</span>
              <b>${escapeHtml(fmtPct(summary.completionToDate))}</b>
              <em>${escapeHtml(fmtMoney(summary.factRevenue))}</em>
              <strong class="${summary.gapToDate >= 0 ? 'positive' : 'negative'}">${escapeHtml(fmtSignedMoney(summary.gapToDate))}</strong>
              <small>${fmtInt(list.length)} SKU</small>
            </button>
          `).join('')}
        </div>
      </article>
    `;
  }

  function renderSkuMode(model, views) {
    const summary = aggregate(views);
    return `
      <div class="pf-v4-kpis">
        ${renderKpi('Строк в таблице', fmtInt(views.length), `из ${fmtInt(allRows(model).length)} SKU`, '#76a9ea', views.length ? 1 : 0, 'data-pf-v4-scroll-table')}
        ${renderKpi('Факт', fmtMoney(summary.factRevenue), `план ${fmtMoney(summary.planToDateRevenue)}`, MARKET_COLORS.all, summary.completionToDate)}
        ${renderKpi('Ниже плана', fmtInt(summary.underPlan), 'кликните строку для drawer', '#e0b760', ratio(summary.underPlan, Math.max(views.length, 1)), 'data-pf-v4-scroll-table')}
        ${renderKpi('Реклама', fmtMoney(summary.adSpend), `ДРР ${fmtPct(summary.drr)}`, '#d96aa9', summary.drr)}
      </div>
      <article class="pf-v4-panel">
        <div class="pf-v4-panel-head"><div><span>Максимальная детализация</span><h3>Полная таблица по артикулам ниже</h3></div><button type="button" data-pf-v4-scroll-table>Перейти к таблице</button></div>
        <p class="pf-v4-note">Таблица остается нативной: сортировка, фильтры, Excel и клики по строкам сохранены. Новый drawer показывает план, факт, маржу, рекламу, ДРР и дневной срез.</p>
      </article>
    `;
  }

  function historyPeriod(model) {
    return {
      start: String(model?.periodStart || model?.monthStart || '').slice(0, 10),
      end: String(model?.periodEnd || model?.selectedDate || model?.maxFactDate || '').slice(0, 10)
    };
  }

  function historyPointFromItem(item, view, priceRow) {
    const price = dailyPrice(item);
    const clientPrice = dailyClientPrice(item);
    const dailyMargin = dailyMarginPct(item);
    const marginFallback = fallbackMarginPct(view, priceRow);
    return {
      date: String(item?.date || item?.day || item?.label || '').slice(0, 10),
      revenue: dailyRevenue(item) || 0,
      units: dailyUnits(item) || 0,
      price: price ?? fallbackPrice(view, priceRow),
      clientPrice: clientPrice ?? fallbackClientPrice(view, priceRow),
      marginPct: dailyMargin ?? marginFallback,
      marginSource: dailyMargin === null ? 'snapshot' : 'daily'
    };
  }

  function buildHistoryRows(views, model) {
    const { start, end } = historyPeriod(model);
    return views.map((view) => {
      const priceRow = priceHistoryForView(view, model);
      const points = new Map();
      rowHistorySource(view, model).forEach((item) => {
        const date = String(item?.date || item?.day || item?.label || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        if (start && date < start) return;
        if (end && date > end) return;
        const point = historyPointFromItem(item, view, priceRow);
        if (point.price === null && point.clientPrice === null && point.marginPct === null && !point.revenue && !point.units) return;
        points.set(date, point);
      });
      if (!points.size) {
        const date = end || start || String(priceRow?.currentPriceDate || priceRow?.historyFreshnessDate || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const point = {
            date,
            revenue: view.factRevenue || 0,
            units: view.factUnits || 0,
            price: fallbackPrice(view, priceRow),
            clientPrice: fallbackClientPrice(view, priceRow),
            marginPct: fallbackMarginPct(view, priceRow),
            marginSource: 'snapshot'
          };
          if (point.price !== null || point.clientPrice !== null || point.marginPct !== null || point.revenue || point.units) points.set(date, point);
        }
      }
      const pointList = Array.from(points.values()).sort((a, b) => a.date.localeCompare(b.date));
      const marginAcc = pointList.reduce((acc, point) => {
        const weight = point.revenue || point.units || 1;
        if (point.marginPct !== null) {
          acc.value += point.marginPct * weight;
          acc.weight += weight;
        }
        if (point.price !== null) {
          acc.price += point.price * weight;
          acc.priceWeight += weight;
        }
        if (point.clientPrice !== null) {
          acc.clientPrice += point.clientPrice * weight;
          acc.clientWeight += weight;
        }
        if (point.marginSource === 'daily') acc.dailyMarginCells += 1;
        return acc;
      }, { value: 0, weight: 0, price: 0, priceWeight: 0, clientPrice: 0, clientWeight: 0, dailyMarginCells: 0 });
      const allowedMarginPct = asPctFraction(firstFinite(priceRow?.allowedMarginPct, view.row?.allowedMarginPct, view.planMarginPct));
      return {
        view,
        priceRow,
        points,
        pointList,
        allowedMarginPct,
        avgMarginPct: marginAcc.weight ? marginAcc.value / marginAcc.weight : fallbackMarginPct(view, priceRow),
        avgPrice: marginAcc.priceWeight ? marginAcc.price / marginAcc.priceWeight : fallbackPrice(view, priceRow),
        avgClientPrice: marginAcc.clientWeight ? marginAcc.clientPrice / marginAcc.clientWeight : fallbackClientPrice(view, priceRow),
        hasDailyMargin: marginAcc.dailyMarginCells > 0
      };
    }).filter((row) => row.points.size || row.avgMarginPct !== null || row.avgPrice !== null);
  }

  function historyDates(rows, model) {
    const { start, end } = historyPeriod(model);
    const set = new Set();
    priceHistoryIndex().dates.forEach((date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if (start && date < start) return;
      if (end && date > end) return;
      set.add(date);
    });
    rows.forEach((row) => row.points.forEach((_, date) => set.add(date)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function weightedHistoryAverage(rows, selector) {
    const acc = rows.reduce((total, row) => {
      row.pointList.forEach((point) => {
        const value = selector(point, row);
        const weight = point.revenue || point.units || 1;
        if (value !== null && value !== undefined) {
          total.value += value * weight;
          total.weight += weight;
        }
      });
      return total;
    }, { value: 0, weight: 0 });
    return acc.weight ? acc.value / acc.weight : null;
  }

  function renderMarginHistoryChart(rows, dates) {
    const trend = dates.map((date) => {
      let value = 0;
      let weight = 0;
      rows.forEach((row) => {
        const point = row.points.get(date);
        if (!point || point.marginPct === null) return;
        const pointWeight = point.revenue || point.units || 1;
        value += point.marginPct * pointWeight;
        weight += pointWeight;
      });
      return { date, value: weight ? value / weight : null };
    });
    const values = trend.map((item) => item.value).filter((value) => value !== null);
    if (!values.length) return '<div class="pf-v4-empty">Нет сохраненной маржи для графика. Матрица ниже покажет цену по дням и текущую маржу SKU.</div>';
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0.65);
    const width = Math.max(760, dates.length * 42);
    const height = 220;
    const pad = 28;
    const span = Math.max(max - min, 0.01);
    const xFor = (index) => dates.length <= 1 ? pad : pad + (index * (width - pad * 2)) / (dates.length - 1);
    const yFor = (value) => height - pad - ((value - min) / span) * (height - pad * 2);
    const points = trend
      .map((item, index) => item.value === null ? null : `${xFor(index).toFixed(1)},${yFor(item.value).toFixed(1)}`)
      .filter(Boolean)
      .join(' ');
    const labelEvery = Math.max(1, Math.ceil(dates.length / 8));
    const grid = [0, .25, .5, .75, 1].map((ratioValue) => {
      const value = min + span * ratioValue;
      const y = yFor(value);
      return `<g><line x1="${pad}" y1="${y.toFixed(1)}" x2="${width - pad}" y2="${y.toFixed(1)}"/><text x="4" y="${(y + 4).toFixed(1)}">${escapeHtml(fmtPct(value))}</text></g>`;
    }).join('');
    const labels = dates.map((date, index) => index % labelEvery ? '' : `<text x="${xFor(index).toFixed(1)}" y="${height - 5}" text-anchor="middle">${escapeHtml(shortDate(date))}</text>`).join('');
    return `
      <div class="pf-v4-margin-chart" style="--pf-v4-chart-width:${width}px">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="График маржи по дням">
          <g class="pf-v4-chart-grid">${grid}</g>
          <polyline points="${points}" fill="none" stroke="#75d99a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          ${trend.map((item, index) => item.value === null ? '' : `<circle cx="${xFor(index).toFixed(1)}" cy="${yFor(item.value).toFixed(1)}" r="3.4"/>`).join('')}
          <g class="pf-v4-chart-labels">${labels}</g>
        </svg>
      </div>
    `;
  }

  function historyHeatClass(point, row) {
    if (!point) return 'is-empty';
    if (point.marginPct === null) return 'is-neutral';
    if (row.allowedMarginPct !== null && point.marginPct < row.allowedMarginPct) return 'is-bad';
    if (point.marginPct < 0.25) return 'is-warn';
    if (point.marginPct >= 0.45) return 'is-good';
    return 'is-ok';
  }

  function renderHistoryCell(point, row) {
    if (!point) return '<td class="pf-v4-history-cell is-empty"><span>—</span></td>';
    const sourceLabel = point.marginSource === 'daily' ? 'день' : 'срез';
    return `
      <td class="pf-v4-history-cell ${historyHeatClass(point, row)}">
        <strong>${escapeHtml(fmtPct(point.marginPct))}</strong>
        <em>${escapeHtml(fmtMoney(point.price))}</em>
        <small>${point.clientPrice !== null ? `клиент ${escapeHtml(fmtMoney(point.clientPrice))}` : sourceLabel}</small>
      </td>
    `;
  }

  function renderHistoryMode(model, views) {
    const rows = buildHistoryRows(views, model)
      .sort((a, b) => {
        const riskA = a.allowedMarginPct !== null && a.avgMarginPct !== null && a.avgMarginPct < a.allowedMarginPct ? 1 : 0;
        const riskB = b.allowedMarginPct !== null && b.avgMarginPct !== null && b.avgMarginPct < b.allowedMarginPct ? 1 : 0;
        if (riskA !== riskB) return riskB - riskA;
        return String(a.view.title).localeCompare(String(b.view.title), 'ru');
      });
    const dates = historyDates(rows, model);
    const avgMargin = weightedHistoryAverage(rows, (point) => point.marginPct);
    const avgPrice = weightedHistoryAverage(rows, (point) => point.price);
    const belowMargin = rows.filter((row) => row.allowedMarginPct !== null && row.avgMarginPct !== null && row.avgMarginPct < row.allowedMarginPct).length;
    const rowsWithDailyMargin = rows.filter((row) => row.hasDailyMargin).length;
    const head = dates.map((date) => `<th><span>${escapeHtml(shortDate(date))}</span><small>маржа / цена</small></th>`).join('');
    const body = rows.map((row) => `
      <tr>
        <th class="pf-v4-history-article">
          <button type="button" data-pf-v4-sku="${escapeHtml(row.view.key)}">
            <strong>${escapeHtml(row.view.title)}</strong>
            <span>${escapeHtml(row.view.owner)} · ${escapeHtml(platformLabel(row.view.platform))}</span>
            <em>сред. маржа ${escapeHtml(fmtPct(row.avgMarginPct))} · цена ${escapeHtml(fmtMoney(row.avgPrice))}</em>
          </button>
        </th>
        ${dates.map((date) => renderHistoryCell(row.points.get(date), row)).join('')}
      </tr>
    `).join('');
    return `
      <div class="pf-v4-kpis">
        ${renderKpi('SKU в динамике', fmtInt(rows.length), `из ${fmtInt(views.length)} в текущем фильтре`, '#76a9ea', rows.length ? rows.length / Math.max(views.length, 1) : 0)}
        ${renderKpi('Дней истории', fmtInt(dates.length), 'цены берутся из сохраненной price matrix', '#dbc7a3', dates.length ? 1 : 0)}
        ${renderKpi('Средняя маржа', fmtPct(avgMargin), rowsWithDailyMargin ? `${fmtInt(rowsWithDailyMargin)} SKU с дневной маржей` : 'маржа из последнего SKU-среза', '#75d99a', avgMargin)}
        ${renderKpi('Средняя цена', fmtMoney(avgPrice), 'взвешено по дневным продажам/заказам', '#e0b760', avgPrice ? 1 : 0)}
        ${renderKpi('Ниже порога', fmtInt(belowMargin), 'средняя маржа ниже допустимой', '#ff8b78', ratio(belowMargin, Math.max(rows.length, 1)))}
      </div>
      <article class="pf-v4-panel">
        <div class="pf-v4-panel-head">
          <div><span>Маржа по дням</span><h3>График маржи и динамика цены</h3><em>Вкладка уважает текущие фильтры План-факт SKU: площадка, owner, поиск и период.</em></div>
          <button type="button" data-pf-v4-scroll-history>К матрице</button>
        </div>
        ${renderMarginHistoryChart(rows, dates)}
      </article>
      <article class="pf-v4-panel">
        <div class="pf-v4-panel-head">
          <div><span>Артикулы × дни</span><h3>Маржа и цена по сохраненной истории</h3><em>Слева артикул, сверху дни. Клик по артикулу открывает drawer с полной расшифровкой.</em></div>
        </div>
        ${rows.length && dates.length ? `
          <div class="pf-v4-history-wrap">
            <table class="pf-v4-history-table">
              <thead><tr><th class="pf-v4-history-article">Артикул</th>${head}</tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        ` : '<div class="pf-v4-empty">История по текущему фильтру не найдена. Проверь период или площадку.</div>'}
      </article>
    `;
  }

  function renderBody(model) {
    const views = visibleRows(model).map((row) => rowMetricView(row, model));
    const mode = activeMode();
    if (mode === 'lfl') return renderLfl(model, views);
    if (mode === 'team') return renderTeam(model, views);
    if (mode === 'sku') return renderSkuMode(model, views);
    if (mode === 'history') return renderHistoryMode(model, views);
    return renderGeneral(model, views);
  }

  function renderShell(model) {
    const mode = activeMode();
    const tabs = MODES.map(([key, label]) => `
      <button type="button" data-pf-v4-mode="${key}" aria-selected="${key === mode ? 'true' : 'false'}">${escapeHtml(label)}</button>
    `).join('');
    return `
      <section class="pf-v4" data-planfact-v4="${VERSION}" data-pf-v4-mode="${escapeHtml(mode)}">
        <div class="pf-v4-head">
          <div>
            <span>Общее → LFL → Кто → Артикул → Динамика</span>
            <h2>План-факт SKU: от результата к строке</h2>
            <p>Источник правды — текущая модель портала. Верхний блок объясняет результат, полная таблица по артикулам остается ниже.</p>
          </div>
          <div class="pf-v4-tabs" role="tablist">${tabs}</div>
        </div>
        <div class="pf-v4-body">${renderBody(model)}</div>
      </section>
    `;
  }

  function shellSignature(model) {
    const filters = model?.filters || {};
    const totals = model?.totals || {};
    const rows = visibleRows(model);
    const ui = planFactUi();
    return JSON.stringify({
      mode: activeMode(),
      selectedDate: ui.selectedDate || '',
      marginMetric: ui.marginMetric || 'pct',
      marginGroup: ui.marginGroup || 'market',
      platform: normalizedPlatform(filters.platform || 'all'),
      owner: filters.owner || 'all',
      status: filters.status || '',
      search: filters.search || '',
      sort: filters.sort || '',
      from: filters.dateFrom || filters.periodStart || model?.periodStart || '',
      to: filters.dateTo || filters.periodEnd || model?.periodEnd || model?.selectedDate || '',
      rows: rows.length,
      allRows: allRows(model).length,
      factRevenue: Math.round(numberOrZero(totals.factRevenue || totals.revenue)),
      planToDateRevenue: Math.round(numberOrZero(totals.planToDateRevenue)),
      planRevenue: Math.round(numberOrZero(totals.planRevenue)),
      adSpend: Math.round(numberOrZero(totals.adSpend)),
      margin: Math.round(numberOrZero(totals.marginPct) * 10000)
    });
  }

  function ensureStyle() {
    if (document.getElementById('altea-planfact-v4-style')) return;
    const style = document.createElement('style');
    style.id = 'altea-planfact-v4-style';
    style.textContent = `
      #${ROOT_ID} .pf-v4{--pf-v4-line:rgba(219,199,163,.17);--pf-v4-card:rgba(18,16,13,.78);--pf-v4-muted:rgba(245,235,214,.66);--pf-v4-faint:rgba(245,235,214,.46);margin:12px 0 14px;color:#f7edda;animation:pfV4In 260ms cubic-bezier(.22,.82,.22,1) both}
      #${ROOT_ID} .pf-v4 *{box-sizing:border-box}
      #${ROOT_ID} .pf-v4-head{display:flex;justify-content:space-between;align-items:end;gap:14px;margin-bottom:10px}
      #${ROOT_ID} .pf-v4-head span,#${ROOT_ID} .pf-v4-panel-head span{display:block;color:#dbc7a3;font-size:10px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}
      #${ROOT_ID} .pf-v4-head h2{margin:5px 0 0;font:500 28px/1.05 Georgia,serif;letter-spacing:0}
      #${ROOT_ID} .pf-v4-head p,#${ROOT_ID} .pf-v4-note{margin:6px 0 0;color:var(--pf-v4-muted);font-size:12px;line-height:1.45}
      #${ROOT_ID} .pf-v4-tabs{display:flex;gap:4px;padding:4px;border:1px solid var(--pf-v4-line);border-radius:999px;background:rgba(7,6,5,.82)}
      #${ROOT_ID} .pf-v4-tabs button{height:31px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--pf-v4-muted);padding:0 12px;font-size:11px;font-weight:850;white-space:nowrap;transition:transform 160ms ease,border-color 160ms ease,background 160ms ease}
      #${ROOT_ID} .pf-v4-tabs button:hover{transform:translateY(-1px)}
      #${ROOT_ID} .pf-v4-tabs button[aria-selected="true"]{background:linear-gradient(180deg,#f0dfbf,#b89455);color:#17110a}
      #${ROOT_ID} .pf-v4-kpis,#${ROOT_ID} .pf-v4-platform-grid,#${ROOT_ID} .pf-v4-owner-grid,#${ROOT_ID} .pf-v4-lfl-tiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
      #${ROOT_ID} .pf-v4-owner-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      #${ROOT_ID} .pf-v4-kpi{--pf-v4-color:#dbc7a3;position:relative;min-height:104px;display:grid;align-content:start;gap:8px;padding:13px 14px;border:1px solid var(--pf-v4-line);border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.012));color:inherit;text-align:left;overflow:hidden;box-shadow:inset 0 1px rgba(255,255,255,.03)}
      #${ROOT_ID} .pf-v4-kpi::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--pf-v4-color);opacity:.75}
      #${ROOT_ID} .pf-v4-kpi span{color:var(--pf-v4-faint);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}
      #${ROOT_ID} .pf-v4-kpi strong{font-size:20px;line-height:1.08}
      #${ROOT_ID} .pf-v4-kpi em{color:var(--pf-v4-muted);font-size:11px;font-style:normal;line-height:1.35}
      #${ROOT_ID} .pf-v4-kpi i{height:4px;margin-top:auto;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden}
      #${ROOT_ID} .pf-v4-kpi i::after{content:"";display:block;width:var(--pf-v4-width);height:100%;border-radius:inherit;background:var(--pf-v4-color);animation:pfV4Bar 520ms cubic-bezier(.22,1,.36,1) both}
      #${ROOT_ID} .pf-v4-split{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr);gap:9px;margin-top:9px}
      #${ROOT_ID} .pf-v4-panel{margin-top:9px;padding:14px;border:1px solid var(--pf-v4-line);border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.028),rgba(255,255,255,.01));box-shadow:inset 0 1px rgba(255,255,255,.02)}
      #${ROOT_ID} .pf-v4-split .pf-v4-panel{margin-top:0}
      #${ROOT_ID} .pf-v4-panel-head{display:flex;justify-content:space-between;gap:14px;align-items:start;margin-bottom:12px}
      #${ROOT_ID} .pf-v4-panel-head h3{margin:4px 0 0;font:500 21px/1.1 Georgia,serif}
      #${ROOT_ID} .pf-v4-panel-head em{color:var(--pf-v4-muted);font-size:11px;font-style:normal}
      #${ROOT_ID} .pf-v4-panel-head button{height:30px;border:1px solid var(--pf-v4-line);border-radius:999px;background:#12100d;color:#eadcbd;padding:0 12px;font-size:11px;font-weight:800}
      #${ROOT_ID} .pf-v4-daily-chart{display:grid;grid-template-columns:repeat(auto-fit,minmax(34px,1fr));gap:6px;min-height:260px;align-items:end;padding:8px 4px 0}
      #${ROOT_ID} .pf-v4-day{display:grid;grid-template-rows:1fr auto;gap:7px;min-height:250px;border:0;background:transparent;color:var(--pf-v4-faint);padding:0;text-align:center}
      #${ROOT_ID} .pf-v4-day-bars{position:relative;display:flex;align-items:end;justify-content:center;gap:4px;min-height:218px;border-bottom:1px solid rgba(255,255,255,.08)}
      #${ROOT_ID} .pf-v4-day-bars i,#${ROOT_ID} .pf-v4-day-bars b{display:block;width:10px;border-radius:999px 999px 3px 3px;transform-origin:bottom;animation:pfV4Column 620ms cubic-bezier(.22,1,.36,1) both;animation-delay:calc(var(--i) * 22ms)}
      #${ROOT_ID} .pf-v4-day-bars i{height:var(--plan);background:rgba(219,199,163,.28)}
      #${ROOT_ID} .pf-v4-day-bars b{height:var(--fact);background:linear-gradient(180deg,#f1d78b,#d5a34c)}
      #${ROOT_ID} .pf-v4-day em{font-style:normal;font-size:10px}
      #${ROOT_ID} .pf-v4-chart-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:9px;margin-top:9px;align-items:stretch}
      #${ROOT_ID} .pf-v4-chart-panel{min-width:0;overflow:hidden}
      #${ROOT_ID} .pf-v4-svg-shell{position:relative;overflow:auto;padding:4px 0 2px;border:1px solid rgba(219,199,163,.12);border-radius:13px;background:radial-gradient(circle at 18% 12%,rgba(224,183,96,.12),transparent 34%),linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012))}
      #${ROOT_ID} .pf-v4-svg-chart{display:block;width:100%;min-width:700px;height:auto;color:#f4ead6}
      #${ROOT_ID} .pf-v4-svg-grid line{stroke:rgba(245,235,214,.10);stroke-width:1}
      #${ROOT_ID} .pf-v4-svg-y{fill:rgba(245,235,214,.58);font-size:10px;font-weight:800;text-anchor:end}
      #${ROOT_ID} .pf-v4-svg-x{fill:rgba(245,235,214,.56);font-size:10px;font-weight:800;text-anchor:middle}
      #${ROOT_ID} .pf-v4-svg-bar{fill:url(#pf-v4-revenue-bar);filter:drop-shadow(0 0 10px rgba(117,217,154,.22));transform-origin:center bottom;animation:pfV4Column 640ms cubic-bezier(.22,1,.36,1) both}
      #${ROOT_ID} .pf-v4-hit-rect{fill:transparent;cursor:pointer}
      #${ROOT_ID} .pf-v4-day-hit:focus{outline:none}
      #${ROOT_ID} .pf-v4-day-hit:focus .pf-v4-svg-bar,#${ROOT_ID} .pf-v4-day-hit:hover .pf-v4-svg-bar,#${ROOT_ID} .pf-v4-day-hit.is-active .pf-v4-svg-bar{stroke:#f6df9f;stroke-width:2}
      #${ROOT_ID} .pf-v4-plan-line{fill:none;stroke:#f1d78b;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 8px rgba(241,215,139,.22))}
      #${ROOT_ID} .pf-v4-plan-line.thin{stroke-width:2;stroke-dasharray:4 5}
      #${ROOT_ID} .pf-v4-previous-line{fill:none;stroke:rgba(245,235,214,.42);stroke-width:2;stroke-dasharray:6 6;stroke-linecap:round}
      #${ROOT_ID} .pf-v4-crosshair{stroke:rgba(246,223,159,.62);stroke-width:1;stroke-dasharray:3 5;pointer-events:none}
      #${ROOT_ID} .pf-v4-legend{display:flex;flex-wrap:wrap;gap:10px;padding:0 10px 10px;color:var(--pf-v4-faint);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}
      #${ROOT_ID} .pf-v4-legend span{display:inline-flex;align-items:center;gap:6px}
      #${ROOT_ID} .pf-v4-legend i{display:inline-block;width:18px;height:3px;border-radius:999px;background:#80e5a2}
      #${ROOT_ID} .pf-v4-legend i.plan{background:#f1d78b}
      #${ROOT_ID} .pf-v4-legend i.previous{background:rgba(245,235,214,.42)}
      #${ROOT_ID} .pf-v4-margin-layout{display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:10px;align-items:stretch}
      #${ROOT_ID} .pf-v4-margin-layout .pf-v4-empty{min-height:270px}
      #${ROOT_ID} .pf-v4-chart-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:9px 10px 0}
      #${ROOT_ID} .pf-v4-chart-tabs button{height:28px;border:1px solid rgba(219,199,163,.2);border-radius:999px;background:rgba(7,6,5,.62);color:#eadcbd;padding:0 10px;font-size:10px;font-weight:850}
      #${ROOT_ID} .pf-v4-chart-tabs button[aria-pressed="true"]{background:linear-gradient(180deg,#f0dfbf,#b89455);color:#18110a}
      #${ROOT_ID} .pf-v4-margin-area{fill:url(#pf-v4-margin-fill)}
      #${ROOT_ID} .pf-v4-margin-line{fill:none;stroke:#78dea0;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 10px rgba(120,222,160,.24))}
      #${ROOT_ID} .pf-v4-margin-dot{fill:#0b0a08;stroke:#78dea0;stroke-width:2;cursor:pointer}
      #${ROOT_ID} .pf-v4-day-hit:hover .pf-v4-margin-dot,#${ROOT_ID} .pf-v4-day-hit.is-active .pf-v4-margin-dot{fill:#f1d78b;stroke:#f1d78b}
      #${ROOT_ID} .pf-v4-margin-side{display:grid;align-content:start;gap:8px;padding:12px;border:1px solid rgba(219,199,163,.14);border-radius:12px;background:rgba(7,6,5,.45)}
      #${ROOT_ID} .pf-v4-margin-side span{color:#dbc7a3;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.12em}
      #${ROOT_ID} .pf-v4-margin-side strong{font-size:21px;line-height:1.05}
      #${ROOT_ID} .pf-v4-margin-side em{color:var(--pf-v4-muted);font-size:11px;font-style:normal;line-height:1.35}
      #${ROOT_ID} .pf-v4-insights{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:9px}
      #${ROOT_ID} .pf-v4-insights button{min-height:92px;border:1px solid rgba(219,199,163,.14);border-radius:13px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01));color:inherit;text-align:left;padding:12px}
      #${ROOT_ID} .pf-v4-insights span{display:block;color:var(--pf-v4-faint);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}
      #${ROOT_ID} .pf-v4-insights strong{display:block;margin-top:10px;font-size:16px}
      #${ROOT_ID} .pf-v4-insights em{display:block;margin-top:7px;color:var(--pf-v4-muted);font-size:11px;font-style:normal;line-height:1.35}
      #${ROOT_ID} .pf-v4-margin-chart{width:100%;overflow:auto;padding:6px 0 2px;border:1px solid rgba(219,199,163,.1);border-radius:12px;background:linear-gradient(180deg,rgba(117,217,154,.055),rgba(255,255,255,.01))}
      #${ROOT_ID} .pf-v4-margin-chart svg{display:block;width:var(--pf-v4-chart-width);max-width:none;height:230px}
      #${ROOT_ID} .pf-v4-margin-chart line{stroke:rgba(255,255,255,.085);stroke-width:1}
      #${ROOT_ID} .pf-v4-margin-chart text{fill:rgba(245,235,214,.56);font-size:10px;font-weight:750}
      #${ROOT_ID} .pf-v4-margin-chart circle{fill:#0d0b09;stroke:#75d99a;stroke-width:2}
      #${ROOT_ID} .pf-v4-history-wrap{max-height:620px;overflow:auto;border:1px solid var(--pf-v4-line);border-radius:14px;background:#090806}
      #${ROOT_ID} .pf-v4-history-table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0}
      #${ROOT_ID} .pf-v4-history-table th,#${ROOT_ID} .pf-v4-history-table td{border-right:1px solid rgba(219,199,163,.1);border-bottom:1px solid rgba(219,199,163,.1)}
      #${ROOT_ID} .pf-v4-history-table thead th{position:sticky;top:0;z-index:2;min-width:122px;padding:10px 9px;background:#15120f;color:#f4ead6;text-align:center;box-shadow:0 1px 0 rgba(219,199,163,.16)}
      #${ROOT_ID} .pf-v4-history-table thead th span{display:block;font-size:12px;font-weight:900}
      #${ROOT_ID} .pf-v4-history-table thead th small{display:block;margin-top:3px;color:var(--pf-v4-faint);font-size:9px;text-transform:uppercase}
      #${ROOT_ID} .pf-v4-history-table .pf-v4-history-article{position:sticky;left:0;z-index:3;width:300px;min-width:300px;max-width:300px;background:#100e0c;text-align:left}
      #${ROOT_ID} .pf-v4-history-table tbody .pf-v4-history-article{z-index:1}
      #${ROOT_ID} .pf-v4-history-article button{display:block;width:100%;border:0;background:transparent;color:#f7edda;text-align:left;padding:12px 12px}
      #${ROOT_ID} .pf-v4-history-article strong{display:block;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
      #${ROOT_ID} .pf-v4-history-article span,#${ROOT_ID} .pf-v4-history-article em{display:block;margin-top:4px;color:var(--pf-v4-faint);font-size:10px;font-style:normal;line-height:1.25}
      #${ROOT_ID} .pf-v4-history-cell{min-width:122px;height:74px;padding:9px 10px;text-align:right;background:rgba(255,255,255,.018);vertical-align:top}
      #${ROOT_ID} .pf-v4-history-cell strong{display:block;color:#f8efdc;font-size:14px;line-height:1.1}
      #${ROOT_ID} .pf-v4-history-cell em{display:block;margin-top:5px;color:#e7d7b6;font-style:normal;font-size:12px}
      #${ROOT_ID} .pf-v4-history-cell small,#${ROOT_ID} .pf-v4-history-cell span{display:block;margin-top:5px;color:var(--pf-v4-faint);font-size:9px;line-height:1.15}
      #${ROOT_ID} .pf-v4-history-cell.is-good{background:linear-gradient(180deg,rgba(93,210,139,.22),rgba(93,210,139,.045))}
      #${ROOT_ID} .pf-v4-history-cell.is-ok{background:linear-gradient(180deg,rgba(219,199,163,.16),rgba(219,199,163,.035))}
      #${ROOT_ID} .pf-v4-history-cell.is-warn{background:linear-gradient(180deg,rgba(224,183,96,.22),rgba(224,183,96,.045))}
      #${ROOT_ID} .pf-v4-history-cell.is-bad{background:linear-gradient(180deg,rgba(255,91,91,.22),rgba(255,91,91,.045))}
      #${ROOT_ID} .pf-v4-history-cell.is-empty{color:var(--pf-v4-faint);background:rgba(255,255,255,.012);text-align:center;vertical-align:middle}
      #${ROOT_ID} .pf-v4-drivers{display:grid;gap:6px}
      #${ROOT_ID} .pf-v4-driver{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px;border:1px solid rgba(219,199,163,.12);border-radius:10px;background:rgba(5,4,3,.32);color:inherit;text-align:left}
      #${ROOT_ID} .pf-v4-driver i{display:grid;place-items:center;width:25px;height:25px;border:1px solid var(--pf-v4-line);border-radius:8px;color:#dbc7a3;font-style:normal}
      #${ROOT_ID} .pf-v4-driver b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ROOT_ID} .pf-v4-driver em{display:block;margin-top:3px;color:var(--pf-v4-faint);font-style:normal;font-size:11px}
      #${ROOT_ID} .pf-v4-driver strong,#${ROOT_ID} .pf-v4-team-table strong{font-size:12px}
      #${ROOT_ID} .positive{color:#76d49b!important}#${ROOT_ID} .negative{color:#ff8b78!important}
      #${ROOT_ID} .pf-v4-waterfall{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end;height:260px;padding:14px 6px 0}
      #${ROOT_ID} .pf-v4-waterfall-item{display:grid;grid-template-rows:auto 1fr auto;gap:8px;min-height:230px;border:1px solid var(--pf-v4-line);border-radius:12px;background:#100e0c;color:inherit;padding:10px;text-align:center}
      #${ROOT_ID} .pf-v4-waterfall-item i{align-self:end;justify-self:center;width:min(80%,130px);height:var(--h);border-radius:10px 10px 3px 3px;background:var(--pf-v4-color);opacity:.78;animation:pfV4Column 620ms cubic-bezier(.22,1,.36,1) both;animation-delay:calc(var(--i) * 70ms)}
      #${ROOT_ID} .pf-v4-team-table{display:grid;gap:6px}
      #${ROOT_ID} .pf-v4-team-table button{display:grid;grid-template-columns:minmax(170px,1fr) 100px 140px 140px 80px;gap:10px;align-items:center;min-height:42px;border:1px solid rgba(219,199,163,.12);border-radius:10px;background:#100e0c;color:inherit;padding:9px 10px;text-align:left}
      #${ROOT_ID} .pf-v4-team-table b,#${ROOT_ID} .pf-v4-team-table em,#${ROOT_ID} .pf-v4-team-table small{text-align:right;font-style:normal}
      #${ROOT_ID} .pf-v4-empty{display:grid;place-items:center;min-height:160px;border:1px dashed rgba(219,199,163,.18);border-radius:12px;color:var(--pf-v4-muted);padding:18px;text-align:center}
      #${ROOT_ID} .pf-v4-drawer-back{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.58);opacity:0;pointer-events:none;transition:opacity 240ms cubic-bezier(.22,.82,.22,1)}
      #${ROOT_ID} .pf-v4-drawer-back.is-open{opacity:1;pointer-events:auto}
      #${ROOT_ID} .pf-v4-drawer{position:absolute;right:0;top:0;width:min(860px,96vw);height:100%;padding:22px;background:#0e0d0b;border-left:1px solid var(--pf-v4-line);transform:translateX(100%);transition:transform 260ms cubic-bezier(.22,1,.36,1);overflow:auto}
      #${ROOT_ID} .pf-v4-drawer-back.is-open .pf-v4-drawer{transform:none}
      #${ROOT_ID} .pf-v4-drawer-close{position:absolute;right:16px;top:16px;width:34px;height:34px;border:1px solid var(--pf-v4-line);border-radius:999px;background:#15120f;color:#f4ead6}
      #${ROOT_ID} .pf-v4-drawer h3{margin:0 44px 4px 0;font:500 30px/1.08 Georgia,serif}
      #${ROOT_ID} .pf-v4-drawer p{color:var(--pf-v4-muted);font-size:12px;line-height:1.45}
      #${ROOT_ID} .pf-v4-drawer-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}
      #${ROOT_ID} .pf-v4-drawer-metric{padding:11px;border:1px solid var(--pf-v4-line);border-radius:10px;background:#12100d}
      #${ROOT_ID} .pf-v4-drawer-metric span{display:block;color:var(--pf-v4-faint);font-size:10px;font-weight:850;text-transform:uppercase}.pf-v4-drawer-metric strong{display:block;margin-top:8px}
      #${ROOT_ID} .pf-v4-funnel{display:grid;grid-template-columns:repeat(6,minmax(100px,1fr));gap:8px;margin-top:14px}
      #${ROOT_ID} .pf-v4-funnel .pf-v4-drawer-metric{min-height:84px}
      #${ROOT_ID} .pf-v4-daily-table{margin-top:14px;max-height:340px;overflow:auto;border:1px solid var(--pf-v4-line);border-radius:12px}
      #${ROOT_ID} .pf-v4-daily-table table{width:100%;min-width:1120px;border-collapse:collapse}
      #${ROOT_ID} .pf-v4-daily-table th,#${ROOT_ID} .pf-v4-daily-table td{padding:9px 10px;border-bottom:1px solid rgba(219,199,163,.1);text-align:right;font-size:12px}
      #${ROOT_ID} .pf-v4-daily-table th{position:sticky;top:0;background:#15120f;color:var(--pf-v4-faint);font-size:10px;text-transform:uppercase}.pf-v4-daily-table td:first-child,.pf-v4-daily-table th:first-child{text-align:left}
      #${ROOT_ID} .pf-v4-row-active{outline:1px solid rgba(240,210,145,.5);outline-offset:-1px}
      @keyframes pfV4In{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @keyframes pfV4Bar{from{width:0}}
      @keyframes pfV4Column{from{transform:scaleY(.04);opacity:.18}}
      @media(max-width:1350px){#${ROOT_ID} .pf-v4-kpis,#${ROOT_ID} .pf-v4-platform-grid,#${ROOT_ID} .pf-v4-owner-grid,#${ROOT_ID} .pf-v4-lfl-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}#${ROOT_ID} .pf-v4-split,#${ROOT_ID} .pf-v4-chart-grid{grid-template-columns:1fr}#${ROOT_ID} .pf-v4-insights{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:760px){#${ROOT_ID} .pf-v4-head{display:grid}#${ROOT_ID} .pf-v4-tabs{overflow:auto}#${ROOT_ID} .pf-v4-kpis,#${ROOT_ID} .pf-v4-platform-grid,#${ROOT_ID} .pf-v4-owner-grid,#${ROOT_ID} .pf-v4-lfl-tiles,#${ROOT_ID} .pf-v4-drawer-grid,#${ROOT_ID} .pf-v4-funnel,#${ROOT_ID} .pf-v4-insights,#${ROOT_ID} .pf-v4-margin-layout{grid-template-columns:1fr}#${ROOT_ID} .pf-v4-team-table button{grid-template-columns:1fr}#${ROOT_ID} .pf-v4-team-table b,#${ROOT_ID} .pf-v4-team-table em,#${ROOT_ID} .pf-v4-team-table small{text-align:left}#${ROOT_ID} .pf-v4-svg-chart{min-width:620px}}
      @media(prefers-reduced-motion:reduce){#${ROOT_ID} .pf-v4 *{animation:none!important;transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function metricCard(label, value) {
    return `<div class="pf-v4-drawer-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function drawerDailyRows(view, model) {
    const priceRow = priceHistoryForView(view, model);
    const { start, end } = historyPeriod(model);
    const historyMap = new Map();
    rowHistorySource(view, model).forEach((item) => {
      const date = String(item?.date || item?.day || item?.label || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if (start && date < start) return;
      if (end && date > end) return;
      historyMap.set(date, historyPointFromItem(item, view, priceRow));
    });
    const daily = buildDaily([view], model).map((day) => {
      const history = historyMap.get(day.date);
      return {
        ...day,
        price: day.price ?? history?.price ?? null,
        clientPrice: day.clientPrice ?? history?.clientPrice ?? null,
        marginPct: day.marginPct ?? history?.marginPct ?? fallbackMarginPct(view, priceRow)
      };
    });
    if (daily.length) return daily;
    if (historyMap.size) {
      return Array.from(historyMap.values()).sort((a, b) => a.date.localeCompare(b.date)).map((point) => ({
        date: point.date,
        plan: 0,
        fact: point.revenue || 0,
        reach: 0,
        clicks: 0,
        carts: 0,
        orders: point.units || 0,
        buys: 0,
        kzRevenue: 0,
        kzCost: 0,
        price: point.price,
        clientPrice: point.clientPrice,
        marginPct: point.marginPct
      }));
    }
    return [{
      date: model?.periodEnd || model?.selectedDate || '',
      plan: view.planToDateRevenue,
      fact: view.factRevenue,
      reach: 0,
      clicks: 0,
      carts: 0,
      orders: view.factUnits,
      buys: 0,
      kzRevenue: 0,
      kzCost: 0,
      price: fallbackPrice(view, priceRow),
      clientPrice: fallbackClientPrice(view, priceRow),
      marginPct: fallbackMarginPct(view, priceRow)
    }];
  }

  function openDrawer(articleKey) {
    const model = buildModel();
    if (!model || !articleKey) return;
    const row = allRows(model).find((item) => rowKey(item) === articleKey || String(item.article || '') === articleKey);
    if (!row) return;
    const view = rowMetricView(row, model);
    const days = drawerDailyRows(view, model);
    let back = root()?.querySelector('[data-pf-v4-drawer-back]');
    if (!back) {
      back = document.createElement('div');
      back.className = 'pf-v4-drawer-back';
      back.dataset.pfV4DrawerBack = '1';
      back.innerHTML = '<aside class="pf-v4-drawer"><button class="pf-v4-drawer-close" type="button" data-pf-v4-drawer-close aria-label="Закрыть">×</button><div data-pf-v4-drawer-content></div></aside>';
      root()?.appendChild(back);
    }
    const content = back.querySelector('[data-pf-v4-drawer-content]');
    const funnel = [
      ['План к дате', fmtMoney(view.planToDateRevenue)],
      ['Факт', fmtMoney(view.factRevenue)],
      ['Выполнение', fmtPct(view.completionToDate)],
      ['Gap', fmtSignedMoney(view.gapToDate)],
      ['Маржа', fmtPct(view.marginPct)],
      ['Реклама', fmtMoney(view.adSpend)],
      ['ДРР', fmtPct(view.drr)],
      ['Статус', statusLabels[view.status] || view.status]
    ];
    const kzTotals = days.reduce((acc, day) => {
      acc.reach += day.reach || 0;
      acc.clicks += day.clicks || 0;
      acc.carts += day.carts || 0;
      acc.orders += day.orders || 0;
      acc.buys += day.buys || 0;
      acc.kzRevenue += day.kzRevenue || 0;
      acc.kzCost += day.kzCost || 0;
      return acc;
    }, { reach: 0, clicks: 0, carts: 0, orders: 0, buys: 0, kzRevenue: 0, kzCost: 0 });
    content.innerHTML = `
      <h3>${escapeHtml(view.title)}</h3>
      <p>${escapeHtml(view.key)} · ${escapeHtml(view.owner)} · ${escapeHtml(platformLabel(view.platform))} · ${escapeHtml(model.periodStart || '—')} — ${escapeHtml(model.periodEnd || model.selectedDate || '—')}</p>
      <div class="pf-v4-drawer-grid">${funnel.map(([label, value]) => metricCard(label, value)).join('')}</div>
      <h4>КЗ / контент-воронка</h4>
      <div class="pf-v4-funnel">
        ${metricCard('Охват', fmtInt(kzTotals.reach))}
        ${metricCard('Клики', fmtInt(kzTotals.clicks))}
        ${metricCard('Корзины', fmtInt(kzTotals.carts))}
        ${metricCard('Заказы', fmtInt(kzTotals.orders))}
        ${metricCard('Выкупы', fmtInt(kzTotals.buys))}
        ${metricCard('ROMI', kzTotals.kzCost ? fmtPct((kzTotals.kzRevenue - kzTotals.kzCost) / kzTotals.kzCost) : '—')}
      </div>
      <div class="pf-v4-daily-table">
        <table>
          <thead><tr><th>Дата</th><th>План</th><th>Факт</th><th>Маржа</th><th>Цена</th><th>Цена клиент</th><th>Охват</th><th>Клики</th><th>Корзины</th><th>Заказы</th><th>Выкупы</th><th>КЗ выручка</th><th>КЗ расход</th></tr></thead>
          <tbody>
            ${days.map((day) => `
              <tr>
                <td>${escapeHtml(shortDate(day.date))}</td>
                <td>${escapeHtml(fmtMoney(day.plan))}</td>
                <td>${escapeHtml(fmtMoney(day.fact))}</td>
                <td>${escapeHtml(fmtPct(day.marginPct))}</td>
                <td>${escapeHtml(fmtMoney(day.price))}</td>
                <td>${escapeHtml(fmtMoney(day.clientPrice))}</td>
                <td>${escapeHtml(fmtInt(day.reach))}</td>
                <td>${escapeHtml(fmtInt(day.clicks))}</td>
                <td>${escapeHtml(fmtInt(day.carts))}</td>
                <td>${escapeHtml(fmtInt(day.orders))}</td>
                <td>${escapeHtml(fmtInt(day.buys))}</td>
                <td>${escapeHtml(fmtMoney(day.kzRevenue))}</td>
                <td>${escapeHtml(fmtMoney(day.kzCost))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p><button type="button" class="quick-chip primary" data-pf-v4-native-sku="${escapeHtml(view.key)}">Открыть native карточку SKU</button></p>
    `;
    root()?.querySelectorAll('.pf-v4-row-active').forEach((rowNode) => rowNode.classList.remove('pf-v4-row-active'));
    root()?.querySelectorAll(`[data-sku-plan-article="${CSS.escape(articleKey)}"]`).forEach((rowNode) => rowNode.classList.add('pf-v4-row-active'));
    back.classList.add('is-open');
  }

  function closeDrawer() {
    root()?.querySelector('[data-pf-v4-drawer-back]')?.classList.remove('is-open');
    root()?.querySelectorAll('.pf-v4-row-active').forEach((rowNode) => rowNode.classList.remove('pf-v4-row-active'));
  }

  function bindRenderedControls(host) {
    host.querySelectorAll('[data-pf-v4-mode]').forEach((button) => {
      if (button.dataset.pfV4DirectBound === '1') return;
      button.dataset.pfV4DirectBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setMode(button.dataset.pfV4Mode || 'general');
        enhance();
      });
    });
    host.querySelectorAll('[data-pf-v4-sku]').forEach((button) => {
      if (button.dataset.pfV4DirectBound === '1') return;
      button.dataset.pfV4DirectBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openDrawer(button.dataset.pfV4Sku || '');
      });
    });
    host.querySelectorAll('[data-pf-v4-scroll-history]').forEach((button) => {
      if (button.dataset.pfV4DirectBound === '1') return;
      button.dataset.pfV4DirectBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        host.querySelector('.pf-v4-history-wrap')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
    host.querySelectorAll('[data-pf-v4-scroll-table]').forEach((button) => {
      if (button.dataset.pfV4DirectBound === '1') return;
      button.dataset.pfV4DirectBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        host.querySelector('.pf-v1-table-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
    host.querySelectorAll('[data-pf-v4-day]').forEach((button) => {
      if (button.dataset.pfV4DirectBound === '1') return;
      button.dataset.pfV4DirectBound = '1';
      const selectDay = () => {
        const date = button.getAttribute('data-pf-v4-day') || '';
        const current = planFactUi().selectedDate;
        updatePlanFactUi({ selectedDate: current === date ? '' : date });
        enhance();
      };
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectDay();
      });
      button.addEventListener('keydown', (event) => {
        const allDays = Array.from(host.querySelectorAll('[data-pf-v4-day]'));
        const currentIndex = allDays.indexOf(button);
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectDay();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          updatePlanFactUi({ selectedDate: '' });
          enhance();
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          const nextIndex = clamp(currentIndex + (event.key === 'ArrowRight' ? 1 : -1), 0, allDays.length - 1);
          const next = allDays[nextIndex];
          if (next) {
            updatePlanFactUi({ selectedDate: next.getAttribute('data-pf-v4-day') || '' });
            enhance();
          }
        }
      });
    });
    host.querySelectorAll('[data-pf-v4-margin-metric]').forEach((button) => {
      if (button.dataset.pfV4DirectBound === '1') return;
      button.dataset.pfV4DirectBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        updatePlanFactUi({ marginMetric: button.getAttribute('data-pf-v4-margin-metric') === 'rub' ? 'rub' : 'pct' });
        enhance();
      });
    });
    host.querySelectorAll('[data-pf-v4-margin-focus]').forEach((button) => {
      if (button.dataset.pfV4DirectBound === '1') return;
      button.dataset.pfV4DirectBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const focus = button.getAttribute('data-pf-v4-margin-focus') || 'chart';
        updatePlanFactUi({ marginGroup: focus });
        if (focus === 'sku') setMode('sku');
        else host.querySelector('#pf-v4-margin-chart')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        enhance();
      });
    });
  }

  function setGlobalPlatform(platform) {
    const normalized = normalizedPlatform(platform);
    try { localStorage.setItem('altea.portal.marketplace', normalized); } catch (_) {}
    document.documentElement.dataset.marketplace = normalized;
    document.body.dataset.marketplace = normalized;
    window.dispatchEvent(new CustomEvent('altea:marketplacechange', { detail: { platform: normalized } }));
    const app = appState();
    if (app?.skuPlanFactFilters) app.skuPlanFactFilters.platform = normalized;
    renderBase();
  }

  function setOwnerFilter(owner) {
    const app = appState();
    if (app?.skuPlanFactFilters) app.skuPlanFactFilters.owner = owner || 'all';
    const ownerSelect = root()?.querySelector('#skuPlanFactOwner');
    if (ownerSelect) {
      ownerSelect.value = owner || 'all';
      ownerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      renderBase();
    }
  }

  function renderBase() {
    if (typeof baseRenderSkuPlanFact !== 'function') {
      enhance();
      return;
    }
    suppressEnhance = true;
    try {
      baseRenderSkuPlanFact(ROOT_ID, { force: true });
    } finally {
      suppressEnhance = false;
    }
    enhance();
  }

  function bind(rootNode) {
    if (!rootNode || rootNode.dataset.pfV4GtdBound === '1') return;
    rootNode.dataset.pfV4GtdBound = '1';
    rootNode.addEventListener('click', (event) => {
      const modeButton = event.target.closest('[data-pf-v4-mode]');
      if (modeButton) {
        setMode(modeButton.dataset.pfV4Mode || 'general');
        enhance();
        return;
      }
      const platformButton = event.target.closest('[data-pf-v4-platform]');
      if (platformButton) {
        setGlobalPlatform(platformButton.dataset.pfV4Platform || 'all');
        return;
      }
      const ownerButton = event.target.closest('[data-pf-v4-owner]');
      if (ownerButton) {
        setOwnerFilter(ownerButton.dataset.pfV4Owner || 'all');
        setMode('sku');
        return;
      }
      const lflButton = event.target.closest('[data-pf-v4-lfl]');
      if (lflButton) {
        setMode('sku');
        rootNode.querySelector('.pf-v1-table-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      const scrollButton = event.target.closest('[data-pf-v4-scroll-table]');
      if (scrollButton) {
        rootNode.querySelector('.pf-v1-table-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      const historyScrollButton = event.target.closest('[data-pf-v4-scroll-history]');
      if (historyScrollButton) {
        rootNode.querySelector('.pf-v4-history-wrap')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      const nativeSku = event.target.closest('[data-pf-v4-native-sku]');
      if (nativeSku) {
        event.preventDefault();
        event.stopPropagation();
        const key = nativeSku.dataset.pfV4NativeSku || '';
        if (typeof window.openSkuModal === 'function') window.openSkuModal(key);
        else if (typeof openSkuModal === 'function') openSkuModal(key);
        return;
      }
      const close = event.target.closest('[data-pf-v4-drawer-close]');
      if (close || event.target.matches('[data-pf-v4-drawer-back]')) {
        closeDrawer();
        return;
      }
      const skuButton = event.target.closest('[data-pf-v4-sku]');
      const rowNode = event.target.closest('.sku-plan-fact-row[data-sku-plan-article], .sku-plan-fact-row [data-sku-plan-article]');
      const articleKey = skuButton?.dataset.pfV4Sku || rowNode?.dataset?.skuPlanArticle || rowNode?.getAttribute?.('data-sku-plan-article') || '';
      if (articleKey) {
        event.preventDefault();
        event.stopPropagation();
        openDrawer(articleKey);
      }
    }, true);
    rootNode.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const rowNode = event.target.closest('.sku-plan-fact-row[data-sku-plan-article]');
      const articleKey = rowNode?.dataset?.skuPlanArticle || '';
      if (articleKey) {
        event.preventDefault();
        openDrawer(articleKey);
      }
    });
  }

  function decorateRows(rootNode) {
    rootNode.querySelectorAll('.sku-plan-fact-row[data-sku-plan-article]').forEach((rowNode) => {
      if (rowNode.dataset.pfV4RowDecorated === '1') return;
      rowNode.dataset.pfV4RowDecorated = '1';
      rowNode.setAttribute('tabindex', '0');
      rowNode.setAttribute('role', 'button');
      rowNode.title = 'Открыть детализацию план-факта по SKU';
    });
  }

  function enhance() {
    if (suppressEnhance) return;
    const host = root();
    if (!host || !host.querySelector('[data-plan-fact-design="v1"]')) return;
    ensureStyle();
    bind(host);
    const model = buildModel();
    if (!model) {
      ensureFallbackModelData().then((data) => { if (data) enhance(); });
      return;
    }
    host.querySelector('.pf-v1-kpis')?.remove();
    host.querySelector('.pf-v1-platform-board')?.remove();

    const nextSignature = shellSignature(model);
    let mount = host.querySelector('[data-planfact-v4]');
    const anchor = host.querySelector('.pf-v1-filter-dock')
      || host.querySelector('.pf-v1-head')
      || host.firstElementChild;
    const isPlacedAfterAnchor = Boolean(anchor && mount && mount.previousElementSibling === anchor);
    if (mount && mount.dataset.pfV4Signature === nextSignature) {
      if (anchor && !isPlacedAfterAnchor) anchor.insertAdjacentElement('afterend', mount);
      decorateRows(host);
      bindRenderedControls(host);
      return;
    }

    const nextHtml = renderShell(model);
    if (mount && isPlacedAfterAnchor) {
      mount.outerHTML = nextHtml;
    } else {
      if (mount) mount.remove();
      if (anchor) anchor.insertAdjacentHTML('afterend', nextHtml);
      else host.insertAdjacentHTML('afterbegin', nextHtml);
    }
    mount = host.querySelector('[data-planfact-v4]');
    if (mount) mount.dataset.pfV4Signature = nextSignature;
    lastShellSignature = nextSignature;
    decorateRows(host);
    bindRenderedControls(host);
  }

  function queueEnhance(delay = 0) {
    if (enhanceTimer) window.clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(() => {
      enhanceTimer = 0;
      enhance();
    }, delay);
  }

  function wrapRenderer() {
    const candidate = window.renderSkuPlanFact || (typeof renderSkuPlanFact === 'function' ? renderSkuPlanFact : null);
    if (typeof candidate !== 'function' || candidate.__planFactV4Wrapped) return;
    if (!baseRenderSkuPlanFact) {
      baseRenderSkuPlanFact = candidate.__planFactV4Base || candidate;
    }
    if (candidate === wrappedRenderSkuPlanFact) return;
    const wrapped = function renderSkuPlanFactWithV4(rootId, options) {
      const result = baseRenderSkuPlanFact.call(this, rootId || ROOT_ID, options || {});
      queueEnhance(0);
      return result;
    };
    wrapped.__planFactV4Wrapped = true;
    wrapped.__planFactV4Base = baseRenderSkuPlanFact;
    wrappedRenderSkuPlanFact = wrapped;
    window.renderSkuPlanFact = wrapped;
    try { renderSkuPlanFact = wrapped; } catch (_) {}
  }

  function boot() {
    wrapRenderer();
    enhance();
    [700, 1800, 3600].forEach((delay) => window.setTimeout(enhance, delay));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener('altea:viewchange', () => queueEnhance(0));
  window.addEventListener('hashchange', () => queueEnhance(0));
  window.addEventListener('altea:marketplacechange', () => {
    lastShellSignature = '';
    queueEnhance(0);
  });
})();
