(function () {
  'use strict';

  const VERSION = '20260622-iudrr-position-funnel-v7-stats-heatmap';
  const UI_KEY = 'altea.iuDrr.ui.v3';
  const VIEW_KEY = 'altea.iuDrr.view.v3';
  const SELECTED_KEY = 'altea.iuDrr.position.v3';
  const SEARCH_KEY = 'altea.iuDrr.search.v3';
  const TABLE_FILTER_KEY = 'altea.iuDrr.tableFilters.v4';
  const VIEW_KEYS = ['iu', 'position', 'daily', 'stats'];

  const PLATFORM = {
    wb: { label: 'WB', full: 'Wildberries', tone: '#b84cff', varName: '--wb' },
    ozon: { label: 'Ozon', full: 'Ozon', tone: '#59a9ff', varName: '--ozon' },
    ya: { label: 'Я.Маркет', full: 'Яндекс Маркет', tone: '#ffd45f', varName: '--ym' }
  };

  const SOURCE_FILES = {
    iu: 'data/iu_drr_summary.json',
    leaderboard: 'data/product_leaderboard.json',
    skuMatrix: 'data/sku_matrix.json',
    skus: 'data/skus.json',
    wbFunnel: 'data/wb_sales_funnel_report.json',
    wbProcurement: 'data/order_procurement_wb.json',
    ozonProcurement: 'data/order_procurement_ozon.json',
    ymProcurement: 'data/order_procurement_ym.json'
  };

  function appState() {
    window.state = window.state || {};
    return window.state;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function numberOrZero(value) {
    return numberOrNull(value) ?? 0;
  }

  function positiveOrNull(value) {
    const num = numberOrNull(value);
    return num !== null && num > 0 ? num : null;
  }

  function pickPositiveMetric(candidates, emptyNote = 'нет источника') {
    for (const candidate of candidates) {
      const value = positiveOrNull(candidate?.value);
      if (value !== null) return { value, note: candidate.note || emptyNote };
    }
    return { value: null, note: emptyNote };
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + numberOrZero(row?.[key]), 0);
  }

  function firstDefined(row, keys) {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }

  const ruNumber = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const ruMoney = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const ruDecimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

  function fmtInt(value) {
    const num = numberOrNull(value);
    return num === null ? '—' : ruNumber.format(Math.round(num));
  }

  function fmtMoney(value) {
    const num = numberOrNull(value);
    return num === null ? '—' : `${ruMoney.format(Math.round(num))} ₽`;
  }

  function fmtPct(value) {
    const num = numberOrNull(value);
    if (num === null) return '—';
    return `${ruDecimal.format(num * 100)}%`;
  }

  function fmtMetric(value, type) {
    if (value === null || value === undefined || value === '') return '—';
    if (type === 'money') return fmtMoney(value);
    if (type === 'pct') return fmtPct(value);
    if (type === 'decimal') {
      const num = numberOrNull(value);
      return num === null ? '—' : ruDecimal.format(num);
    }
    return fmtInt(value);
  }

  function pctValue(numerator, denominator) {
    const num = numberOrNull(numerator);
    const den = numberOrNull(denominator);
    if (num === null || den === null || den === 0) return null;
    return num / den;
  }

  function safeRatio(numerator, denominator) {
    const num = numberOrNull(numerator);
    const den = numberOrNull(denominator);
    if (num === null || den === null || den === 0) return null;
    return num / den;
  }

  function compactDate(date) {
    const text = String(date || '');
    return text.length >= 10 ? `${text.slice(8, 10)}.${text.slice(5, 7)}` : text;
  }

  function normalizePlatform(value) {
    const raw = String(value || '').toLowerCase().trim();
    if (raw === 'all' || raw === 'all_marketplaces' || raw === 'all-platforms') return 'all';
    if (raw === 'ym' || raw === 'ya' || raw === 'yandex' || raw === 'yandex_market') return 'ya';
    if (raw === 'wb' || raw === 'wildberries') return 'wb';
    if (raw === 'ozon' || raw === 'oz') return 'ozon';
    return '';
  }

  function getGlobalMarketplaceFocus() {
    const docFocus = normalizePlatform(document.documentElement?.dataset?.marketplace)
      || normalizePlatform(document.body?.dataset?.marketplace);
    if (docFocus) return docFocus;
    try {
      const stored = normalizePlatform(localStorage.getItem('altea.portal.marketplace'));
      if (stored) return stored;
    } catch (_) {
      // localStorage may be blocked in private contexts.
    }
    const stateFocus = normalizePlatform(appState().portalMarketplace || appState().marketplaceFilter);
    if (stateFocus) return stateFocus;
    return 'all';
  }

  function platformsForFocus(focus, { includeYandex = true } = {}) {
    if (focus === 'all') return includeYandex ? ['wb', 'ozon', 'ya'] : ['wb', 'ozon'];
    if (focus === 'ya' && !includeYandex) return [];
    return PLATFORM[focus] ? [focus] : (includeYandex ? ['wb', 'ozon', 'ya'] : ['wb', 'ozon']);
  }

  function readJsonSetting(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJsonSetting(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // Non-critical persistence.
    }
  }

  function getUiState() {
    const state = readJsonSetting(UI_KEY, {});
    return state && typeof state === 'object' ? state : {};
  }

  function setSectionOpen(sectionKey, open) {
    const state = getUiState();
    state[sectionKey] = Boolean(open);
    writeJsonSetting(UI_KEY, state);
  }

  function isSectionOpen(sectionKey, defaultOpen = true) {
    const state = getUiState();
    return state[sectionKey] === undefined ? defaultOpen : Boolean(state[sectionKey]);
  }

  function currentView() {
    const state = appState();
    const fromState = state.iuDrrV3View || state.iuDrrFilters?.designSubview;
    const fromStorage = (() => {
      try { return localStorage.getItem(VIEW_KEY); } catch (_) { return ''; }
    })();
    const view = String(fromState || fromStorage || 'iu');
    return VIEW_KEYS.includes(view) ? view : 'iu';
  }

  function setCurrentView(view) {
    const next = VIEW_KEYS.includes(view) ? view : 'iu';
    const state = appState();
    state.iuDrrV3View = next;
    state.iuDrrFilters = state.iuDrrFilters || {};
    state.iuDrrFilters.designSubview = next;
    try { localStorage.setItem(VIEW_KEY, next); } catch (_) {}
  }

  function currentSearch() {
    const state = appState();
    if (typeof state.iuDrrV3Search === 'string') return state.iuDrrV3Search;
    try { return localStorage.getItem(SEARCH_KEY) || ''; } catch (_) { return ''; }
  }

  function setCurrentSearch(value) {
    const search = String(value || '');
    appState().iuDrrV3Search = search;
    try { localStorage.setItem(SEARCH_KEY, search); } catch (_) {}
  }

  function normalizeText(value) {
    return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function getTableFilters() {
    const filters = readJsonSetting(TABLE_FILTER_KEY, {});
    return filters && typeof filters === 'object' ? filters : {};
  }

  function tableFilterState(tableKey) {
    const state = getTableFilters()[tableKey] || {};
    return {
      search: String(state.search || ''),
      source: String(state.source || 'all'),
      status: String(state.status || 'all'),
      dateFrom: String(state.dateFrom || ''),
      dateTo: String(state.dateTo || '')
    };
  }

  function writeTableFilter(tableKey, name, value) {
    const filters = getTableFilters();
    filters[tableKey] = tableFilterState(tableKey);
    filters[tableKey][name] = String(value || '');
    writeJsonSetting(TABLE_FILTER_KEY, filters);
  }

  function clearTableFilter(tableKey) {
    const filters = getTableFilters();
    delete filters[tableKey];
    writeJsonSetting(TABLE_FILTER_KEY, filters);
  }

  function sourceBucket(source) {
    const text = normalizeText(source);
    if (!text || text.includes('нет') || text.includes('no source') || text.includes('missing')) return 'missing';
    if (text.includes('finance') || text.includes('balance')) return 'finance';
    if (text.includes('procurement') || text.includes('rolling stock') || text.includes('rolling sales')) return 'procurement';
    if (text.includes('funnel') || text.includes('sku/day') || text.includes('sales_funnel')) return 'funnel';
    if (text.includes('api') || text.includes('raw') || text.includes('витрина')) return 'api';
    if (text.includes('ads') || text.includes('media') || text.includes('promotion') || text.includes('drr')) return 'ads';
    return 'other';
  }

  function rowSearch(parts) {
    return normalizeText(parts.filter((part) => part !== null && part !== undefined).join(' '));
  }

  function safeTableKey(...parts) {
    return parts.map((part) => encodeURIComponent(String(part || 'item'))).join('__').slice(0, 180);
  }

  function isFilterActive(filters) {
    return Boolean(filters.search || filters.dateFrom || filters.dateTo || filters.source !== 'all' || filters.status !== 'all');
  }

  function filterSelectOptions(options, selected) {
    return options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  }

  function tableFilterMarkup(tableKey, totalRows) {
    const filters = tableFilterState(tableKey);
    return `
      <div class="iu-drr-v3-table-filter" data-iu-v3-filter-bar="${escapeHtml(tableKey)}">
        <label class="iu-drr-v3-filter-field">
          <span>Поиск</span>
          <input type="search" value="${escapeHtml(filters.search)}" data-iu-v3-filter="search" placeholder="Дата, SKU, источник...">
        </label>
        <label class="iu-drr-v3-filter-field">
          <span>Источник</span>
          <select data-iu-v3-filter="source">
            ${filterSelectOptions([
              ['all', 'Все строки'],
              ['with-source', 'Есть источник'],
              ['missing', 'Нет источника'],
              ['api', 'API'],
              ['finance', 'Finance'],
              ['funnel', 'Funnel / SKU-day'],
              ['procurement', 'Procurement'],
              ['ads', 'Ads / DRR'],
              ['other', 'Другой']
            ], filters.source)}
          </select>
        </label>
        <label class="iu-drr-v3-filter-field">
          <span>Статус</span>
          <select data-iu-v3-filter="status">
            ${filterSelectOptions([
              ['all', 'Все статусы'],
              ['ok', 'В норме'],
              ['warn', 'Зона внимания'],
              ['bad', 'Провал'],
              ['missing', 'Нет данных']
            ], filters.status)}
          </select>
        </label>
        <label class="iu-drr-v3-filter-field">
          <span>С даты</span>
          <input type="date" value="${escapeHtml(filters.dateFrom)}" data-iu-v3-filter="dateFrom">
        </label>
        <label class="iu-drr-v3-filter-field">
          <span>По дату</span>
          <input type="date" value="${escapeHtml(filters.dateTo)}" data-iu-v3-filter="dateTo">
        </label>
        <button class="iu-drr-v3-filter-reset" type="button" data-iu-v3-filter-reset>Сбросить</button>
        <span class="iu-drr-v3-filter-count" data-iu-v3-filter-count>${escapeHtml(fmtInt(totalRows))} строк</span>
      </div>
    `;
  }

  function tableRowAttrs({ search, source, status, date }) {
    return `data-iu-v3-row data-iu-v3-search="${escapeHtml(search)}" data-iu-v3-source="${escapeHtml(source)}" data-iu-v3-status="${escapeHtml(status)}" data-iu-v3-date="${escapeHtml(date || '')}"`;
  }

  function currentSelectedPosition() {
    const state = appState();
    if (state.iuDrrV3SelectedPosition) return state.iuDrrV3SelectedPosition;
    try { return localStorage.getItem(SELECTED_KEY) || ''; } catch (_) { return ''; }
  }

  function setCurrentSelectedPosition(value) {
    appState().iuDrrV3SelectedPosition = value;
    try { localStorage.setItem(SELECTED_KEY, value); } catch (_) {}
  }

  function getSources() {
    const state = appState();
    return state.iuDrrV3Sources || {};
  }

  function sourceArray(name, key = 'items') {
    const source = getSources()[name];
    if (Array.isArray(source)) return source;
    if (Array.isArray(source?.[key])) return source[key];
    if (Array.isArray(source?.rows)) return source.rows;
    return [];
  }

  function getPayload() {
    return appState().iuDrrSummary || getSources().iu || {};
  }

  function monthOptions(payload) {
    const monthSet = new Set();
    (payload.months || []).forEach((month) => month?.key && monthSet.add(month.key));
    (payload.daily || []).forEach((row) => row?.monthKey && monthSet.add(row.monthKey));
    const options = Array.from(monthSet).sort();
    return options.length ? options : ['latest'];
  }

  function selectedMonth(payload) {
    const state = appState();
    const filters = state.iuDrrFilters || {};
    const options = monthOptions(payload);
    const wanted = filters.month && filters.month !== 'latest' ? filters.month : options[options.length - 1];
    return options.includes(wanted) ? wanted : options[options.length - 1];
  }

  function rowsForMonth(payload, monthKey) {
    const rows = Array.isArray(payload.daily) ? payload.daily : [];
    if (!rows.length) return [];
    if (!monthKey || monthKey === 'latest') return rows;
    return rows.filter((row) => row.monthKey === monthKey);
  }

  function monthLabel(key) {
    if (!key || key === 'latest') return 'последний срез';
    const [year, month] = String(key).split('-');
    const names = {
      '01': 'январь', '02': 'февраль', '03': 'март', '04': 'апрель',
      '05': 'май', '06': 'июнь', '07': 'июль', '08': 'август',
      '09': 'сентябрь', '10': 'октябрь', '11': 'ноябрь', '12': 'декабрь'
    };
    return `${names[month] || month} ${year || ''} г.`;
  }

  function platformMonthSummary(platform, rows) {
    if (platform === 'wb') {
      const revenuePlan = sum(rows, 'targetRevenueWb');
      const revenueFact = sum(rows, 'revenueWb');
      const adsPlan = sum(rows, 'planSpendWb');
      const adsFact = sum(rows, 'spendFactDrr') || sum(rows, 'spendFact');
      const adsIu = sum(rows, 'spendFactIu');
      const units = sum(rows, 'unitsWb');
      const drrBase = sum(rows, 'adsPctBaseWb') || revenueFact;
      return {
        platform,
        revenuePlan,
        revenueFact,
        revenueRaw: sum(rows, 'wbRawApiRevenue'),
        revenueCompletion: pctValue(revenueFact, revenuePlan),
        adsPlan,
        adsFact,
        adsIu,
        drrPlan: pctValue(adsPlan, drrBase || revenuePlan),
        drrFact: pctValue(adsFact, drrBase),
        units,
        views: sum(rows, 'adsViews'),
        clicks: sum(rows, 'adsClicks'),
        orders: sum(rows, 'adsOrders'),
        adRevenue: sum(rows, 'adsRevenue'),
        sourceRows: sum(rows, 'sourceRows')
      };
    }
    if (platform === 'ozon') {
      const revenuePlan = sum(rows, 'targetRevenueOzon');
      const revenueFact = sum(rows, 'revenueOzon') || sum(rows, 'ozonGmv');
      const adsPlan = sum(rows, 'planSpendOzon');
      const adsFact = sum(rows, 'spendFactOzon');
      return {
        platform,
        revenuePlan,
        revenueFact,
        revenueRaw: sum(rows, 'revenueOzonApiRaw'),
        revenueCompletion: pctValue(revenueFact, revenuePlan),
        adsPlan,
        adsFact,
        adsGross: sum(rows, 'ozonDrrSpendGross'),
        exclusions: sum(rows, 'ozonDrrExcludedTotal'),
        drrPlan: pctValue(adsPlan, revenuePlan),
        drrFact: pctValue(adsFact, revenueFact),
        units: sum(rows, 'unitsOzon') || sum(rows, 'ordersUnitsOzon'),
        views: sum(rows, 'ozonAdsViews'),
        clicks: sum(rows, 'ozonAdsClicks'),
        orders: sum(rows, 'ozonAdsOrders'),
        adRevenue: sum(rows, 'ozonAdsRevenue'),
        returns: sum(rows, 'ozonReturns'),
        sourceRows: sum(rows, 'ozonAdsSourceRows') || sum(rows, 'ozonFinanceSourceRows')
      };
    }
    const revenuePlan = sum(rows, 'targetRevenueYandex');
    const revenueFact = sum(rows, 'revenueYandex');
    return {
      platform,
      revenuePlan,
      revenueFact,
      revenueCompletion: pctValue(revenueFact, revenuePlan),
      adsPlan: sum(rows, 'planSpendYandex'),
      adsFact: sum(rows, 'spendFactYandex'),
      drrPlan: null,
      drrFact: null,
      units: sum(rows, 'unitsYandex') || sum(rows, 'ordersUnitsYandex'),
      views: sum(rows, 'yandexShows'),
      clicks: sum(rows, 'yandexClicks'),
      carts: sum(rows, 'yandexToCart'),
      orders: sum(rows, 'ordersUnitsYandex'),
      buyouts: sum(rows, 'deliveredUnitsYandex'),
      returns: sum(rows, 'yandexReturnsUnits'),
      cancellations: sum(rows, 'yandexCancellationsUnits'),
      sourceRows: sum(rows, 'yandexSourceRows')
    };
  }

  function loadSupplementalData(rootId) {
    const state = appState();
    if (state.iuDrrV3SourcesPromise) return state.iuDrrV3SourcesPromise;
    const fetchJson = (url) => fetch(`${url}?v=${encodeURIComponent(VERSION)}`, { cache: 'no-cache' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    state.iuDrrV3SourcesPromise = Promise.all(Object.entries(SOURCE_FILES).map(([key, url]) => fetchJson(url).then((data) => [key, data])))
      .then((entries) => {
        const sources = Object.fromEntries(entries.filter(([, data]) => data));
        state.iuDrrV3Sources = { ...(state.iuDrrV3Sources || {}), ...sources };
        if (!state.iuDrrSummary && sources.iu) state.iuDrrSummary = sources.iu;
        const root = document.getElementById(rootId);
        if (root && root.dataset.alteaIuDrrV3 === 'loading') renderIuDrrV3(rootId);
        return sources;
      });
    return state.iuDrrV3SourcesPromise;
  }

  function ensureStyle() {
    if (document.getElementById('altea-iu-drr-position-funnel-v3-style')) return;
    const style = document.createElement('style');
    style.id = 'altea-iu-drr-position-funnel-v3-style';
    style.textContent = `
      .iu-drr-v3-shell{--line:rgba(224,183,96,.18);--line2:rgba(255,255,255,.12);--surface:rgba(16,14,12,.76);--surface2:rgba(255,255,255,.035);--champ:#e5c16f;--muted:rgba(255,246,226,.70);--faint:rgba(255,246,226,.48);--bad:#ff746f;--ok:#72e6a0;--info:#69b9ff;--warn:#ffd45f;position:relative;display:block;color:#fff6e2;animation:iuDrrV3Enter 260ms cubic-bezier(.2,.8,.2,1) both}
      .iu-drr-v3-shell *{box-sizing:border-box}
      .iu-drr-v3-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:16px}
      .iu-drr-v3-eyebrow{margin:0 0 7px;color:var(--champ);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
      .iu-drr-v3-title{margin:0;font:500 clamp(26px,3vw,42px)/1.05 Georgia,serif;letter-spacing:0}
      .iu-drr-v3-lead{max-width:940px;margin:8px 0 0;color:var(--muted);font-size:13px;line-height:1.45}
      .iu-drr-v3-badges{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
      .iu-drr-v3-badge{display:inline-flex;align-items:center;gap:7px;min-height:28px;padding:0 11px;border:1px solid var(--line);border-radius:999px;background:rgba(13,11,9,.82);color:var(--muted);font-size:11px;font-weight:800;white-space:nowrap}
      .iu-drr-v3-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--champ);box-shadow:0 0 12px rgba(229,193,111,.48)}
      .iu-drr-v3-toolbar{position:sticky;top:0;z-index:12;display:grid;grid-template-columns:minmax(180px,.7fr) minmax(360px,1.3fr) minmax(260px,.9fr) auto;gap:10px;align-items:center;margin:0 0 14px;padding:12px;border:1px solid var(--line);border-radius:16px;background:rgba(10,8,7,.9);backdrop-filter:blur(18px);box-shadow:0 16px 40px rgba(0,0,0,.20)}
      .iu-drr-v3-control,.iu-drr-v3-search{height:38px;width:100%;border:1px solid var(--line);border-radius:11px;background:#0b0a08;color:#fff6e2;padding:0 12px;font-size:12px;outline:none}
      .iu-drr-v3-tabs{display:flex;gap:5px;padding:4px;border:1px solid var(--line);border-radius:999px;background:#0b0a08;overflow:auto;scrollbar-width:none}
      .iu-drr-v3-tab{height:30px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--muted);padding:0 12px;font-size:11px;font-weight:850;white-space:nowrap;cursor:pointer;transition:transform 180ms ease,background 180ms ease,color 180ms ease}
      .iu-drr-v3-tab:hover{transform:translateY(-1px)}
      .iu-drr-v3-tab[aria-selected="true"]{background:linear-gradient(180deg,#f6dc9f,#bb8f42);color:#15100a}
      .iu-drr-v3-lock{color:var(--faint);font-size:10px;line-height:1.3;text-align:right}
      .iu-drr-v3-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .iu-drr-v3-card,.iu-drr-v3-section,.iu-drr-v3-panel-card{position:relative;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.014));box-shadow:inset 0 1px rgba(255,255,255,.03),0 18px 42px rgba(0,0,0,.16);overflow:hidden}
      .iu-drr-v3-card{min-height:108px;padding:15px}
      .iu-drr-v3-card small,.iu-drr-v3-metric small,.iu-drr-v3-stage small{display:block;color:var(--faint);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}
      .iu-drr-v3-card strong{display:block;margin-top:10px;font-size:24px;line-height:1.05}
      .iu-drr-v3-card span{display:block;margin-top:8px;color:var(--muted);font-size:11px;line-height:1.35}
      .iu-drr-v3-progress{height:5px;margin-top:13px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden}
      .iu-drr-v3-progress i{display:block;height:100%;width:calc(var(--value,0)*1%);max-width:100%;border-radius:inherit;background:var(--tone,var(--champ));box-shadow:0 0 16px color-mix(in srgb,var(--tone,var(--champ)) 35%,transparent);animation:iuDrrV3Grow 620ms cubic-bezier(.2,.8,.2,1) both}
      .iu-drr-v3-panel[hidden]{display:none!important}
      .iu-drr-v3-panel{animation:iuDrrV3Enter 240ms cubic-bezier(.2,.8,.2,1) both}
      .iu-drr-v3-section{margin-top:12px}
      .iu-drr-v3-section-head{display:flex;align-items:center;gap:12px;padding:14px 15px;border-bottom:1px solid var(--line)}
      .iu-drr-v3-platform-title{display:flex;align-items:center;gap:9px;min-width:0}
      .iu-drr-v3-dot{width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:var(--platform,#e5c16f);box-shadow:0 0 14px color-mix(in srgb,var(--platform,#e5c16f) 42%,transparent)}
      .iu-drr-v3-section h3{margin:0;font:500 18px Georgia,serif;letter-spacing:0}
      .iu-drr-v3-section p{margin:5px 0 0;color:var(--faint);font-size:11px;line-height:1.35}
      .iu-drr-v3-spacer{flex:1}
      .iu-drr-v3-collapse,.iu-drr-v3-plain-btn{height:30px;border:1px solid var(--line);border-radius:999px;background:#11100d;color:var(--muted);padding:0 11px;font-size:10px;font-weight:850;cursor:pointer}
      .iu-drr-v3-collapse .chev{display:inline-block;margin-left:6px;transition:transform 240ms cubic-bezier(.2,.8,.2,1)}
      .iu-drr-v3-collapse[aria-expanded="false"] .chev{transform:rotate(-90deg)}
      .iu-drr-v3-collapsible{display:grid;grid-template-rows:1fr;transition:grid-template-rows 250ms cubic-bezier(.2,.8,.2,1),opacity 250ms cubic-bezier(.2,.8,.2,1);opacity:1}
      .iu-drr-v3-collapsible>div{min-height:0;overflow:hidden}
      .iu-drr-v3-section.is-collapsed .iu-drr-v3-collapsible{grid-template-rows:0fr;opacity:.28}
      .iu-drr-v3-matrix-wrap{overflow:auto;max-height:590px;scrollbar-width:thin}
      .iu-drr-v3-table{width:100%;border-collapse:collapse;min-width:1180px;font-size:11px}
      .iu-drr-v3-table th,.iu-drr-v3-table td{padding:10px 11px;border-bottom:1px solid var(--line);white-space:nowrap;text-align:right;vertical-align:top}
      .iu-drr-v3-table th{position:sticky;top:0;z-index:2;background:#15120f;color:var(--faint);font-size:9px;letter-spacing:.06em;text-transform:uppercase}
      .iu-drr-v3-table th:first-child,.iu-drr-v3-table td:first-child{position:sticky;left:0;z-index:3;text-align:left;background:#15120f}
      .iu-drr-v3-table td:first-child strong{display:block;font-size:11px}
      .iu-drr-v3-note{color:var(--faint);font-size:10px;line-height:1.35}
      .iu-drr-v3-source{display:block;margin-top:4px;color:var(--faint);font-size:9px}
      .iu-drr-v3-total-row td{background:rgba(229,193,111,.07);font-weight:850}
      .iu-drr-v3-table-host{display:block}
      .iu-drr-v3-table-filter{display:grid;grid-template-columns:minmax(180px,1.3fr) repeat(4,minmax(126px,.75fr)) auto auto;gap:8px;align-items:end;padding:11px 12px;border-bottom:1px solid var(--line);background:rgba(10,8,7,.54)}
      .iu-drr-v3-filter-field{display:grid;gap:5px;min-width:0;color:var(--faint);font-size:9px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}
      .iu-drr-v3-filter-field input,.iu-drr-v3-filter-field select{height:32px;width:100%;min-width:0;border:1px solid var(--line);border-radius:9px;background:#0b0a08;color:#fff6e2;padding:0 10px;font-size:11px;letter-spacing:0;text-transform:none;outline:none}
      .iu-drr-v3-filter-field input:focus,.iu-drr-v3-filter-field select:focus{border-color:color-mix(in srgb,var(--platform,#e5c16f) 60%,var(--line));box-shadow:0 0 0 2px color-mix(in srgb,var(--platform,#e5c16f) 14%,transparent)}
      .iu-drr-v3-filter-reset{height:32px;border:1px solid var(--line);border-radius:999px;background:#11100d;color:var(--muted);padding:0 12px;font-size:10px;font-weight:850;cursor:pointer}
      .iu-drr-v3-filter-count{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 11px;border:1px solid var(--line);border-radius:999px;background:rgba(229,193,111,.08);color:var(--champ);font-size:10px;font-weight:850;white-space:nowrap}
      .iu-drr-v3-table tr[data-iu-v3-row]{transition:background 160ms ease}
      .iu-drr-v3-table tr[data-iu-v3-status="ok"] td:first-child{box-shadow:inset 3px 0 var(--ok)}
      .iu-drr-v3-table tr[data-iu-v3-status="warn"] td:first-child{box-shadow:inset 3px 0 var(--warn)}
      .iu-drr-v3-table tr[data-iu-v3-status="bad"] td:first-child{box-shadow:inset 3px 0 var(--bad)}
      .iu-drr-v3-table tr[data-iu-v3-status="missing"] td:first-child{box-shadow:inset 3px 0 rgba(255,255,255,.22)}
      .iu-drr-v3-table tr[hidden]{display:none!important}
      .iu-drr-v3-empty-row td{padding:18px!important;text-align:left!important;color:var(--muted);background:#11100d!important}
      .iu-drr-v3-heatmap{min-width:1680px}
      .iu-drr-v3-heatmap th,.iu-drr-v3-heatmap td{text-align:center}
      .iu-drr-v3-heatmap th:first-child,.iu-drr-v3-heatmap td:first-child{text-align:left}
      .iu-drr-v3-heatmap .iu-drr-v3-calc{text-align:left;color:var(--faint);font-size:9px;line-height:1.25;white-space:normal;min-width:130px}
      .iu-drr-v3-heat-cell{font-weight:850;border-left:1px solid rgba(255,255,255,.035)}
      .iu-drr-v3-heat-cell .iu-drr-v3-source{display:block;margin-top:3px;font-weight:700}
      .iu-drr-v3-stat-pack{display:grid;gap:12px;padding:12px}
      .iu-drr-v3-stat-caption{display:flex;flex-wrap:wrap;gap:7px;margin:0;color:var(--faint);font-size:10px;line-height:1.35}
      .iu-drr-v3-stat-caption b{color:var(--muted)}
      .iu-drr-v3-position-layout{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:12px}
      .iu-drr-v3-position-list{padding:12px;max-height:740px;overflow:auto}
      .iu-drr-v3-position-list h3{margin:0 0 10px;font:500 18px Georgia,serif}
      .iu-drr-v3-sku-btn{--platform:#e5c16f;display:block;width:100%;margin-top:8px;padding:11px;border:1px solid var(--line);border-radius:12px;background:#11100d;color:#fff6e2;text-align:left;cursor:pointer;transition:transform 170ms ease,border 170ms ease,background 170ms ease}
      .iu-drr-v3-sku-btn:hover{transform:translateX(2px)}
      .iu-drr-v3-sku-btn.active{border-color:color-mix(in srgb,var(--platform) 62%,var(--line));background:linear-gradient(90deg,color-mix(in srgb,var(--platform) 12%,transparent),#11100d)}
      .iu-drr-v3-sku-btn b{display:block;font-size:12px;line-height:1.25}
      .iu-drr-v3-sku-btn span{display:block;margin-top:5px;color:var(--faint);font-size:10px;line-height:1.25}
      .iu-drr-v3-sku-btn em{float:right;color:var(--platform);font-style:normal;font-size:10px;font-weight:850}
      .iu-drr-v3-position-detail{padding:16px;min-width:0}
      .iu-drr-v3-detail-head{display:flex;align-items:flex-start;gap:12px}
      .iu-drr-v3-detail-head h2{margin:0;font:500 24px Georgia,serif;letter-spacing:0}
      .iu-drr-v3-detail-head p{margin:6px 0 0;color:var(--faint);font-size:11px}
      .iu-drr-v3-funnel{display:grid;grid-template-columns:repeat(7,minmax(96px,1fr));gap:8px;margin-top:14px}
      .iu-drr-v3-stage{--fill:0;position:relative;min-height:102px;padding:12px;border:1px solid var(--line);border-radius:12px;background:#11100d;overflow:hidden;animation:iuDrrV3Stage 430ms cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0)*50ms)}
      .iu-drr-v3-stage::after{content:"";position:absolute;left:0;bottom:0;height:3px;width:calc(var(--fill)*1%);background:var(--platform,#e5c16f);box-shadow:0 0 14px color-mix(in srgb,var(--platform,#e5c16f) 45%,transparent)}
      .iu-drr-v3-stage strong{display:block;margin-top:11px;font-size:18px;line-height:1.1}
      .iu-drr-v3-stage span{display:block;margin-top:8px;color:var(--muted);font-size:10px;line-height:1.25}
      .iu-drr-v3-metric-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:10px}
      .iu-drr-v3-metric{padding:11px;border:1px solid var(--line);border-radius:12px;background:#11100d;min-height:82px}
      .iu-drr-v3-metric strong{display:block;margin-top:8px;font-size:15px}
      .iu-drr-v3-metric span{display:block;margin-top:6px;color:var(--muted);font-size:10px;line-height:1.25}
      .iu-drr-v3-chart-table{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:10px;margin-top:12px}
      .iu-drr-v3-chart,.iu-drr-v3-mini{padding:13px;overflow:hidden}
      .iu-drr-v3-chart h3,.iu-drr-v3-mini h3{margin:0;font:500 17px Georgia,serif}
      .iu-drr-v3-svg{width:100%;height:245px;margin-top:9px;overflow:visible}
      .iu-drr-v3-svg .bar{fill:var(--platform,#e5c16f);opacity:.28;transform-origin:bottom;animation:iuDrrV3Bar 480ms cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0)*35ms)}
      .iu-drr-v3-svg .line{fill:none;stroke:var(--platform,#e5c16f);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1100;animation:iuDrrV3Line 780ms cubic-bezier(.2,.8,.2,1) both}
      .iu-drr-v3-no-source{margin-top:10px;padding:15px;border:1px dashed var(--line2);border-radius:12px;background:#11100d;color:var(--muted);font-size:11px;line-height:1.45}
      .iu-drr-v3-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:11px}
      .iu-drr-v3-empty{padding:20px;border:1px dashed var(--line2);border-radius:15px;color:var(--muted);background:rgba(255,255,255,.02);font-size:12px;line-height:1.5}
      @keyframes iuDrrV3Enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @keyframes iuDrrV3Grow{from{width:0}to{width:calc(var(--value,0)*1%)}}
      @keyframes iuDrrV3Stage{from{opacity:0;transform:translateY(7px) scaleX(.96)}to{opacity:1;transform:none}}
      @keyframes iuDrrV3Bar{from{transform:scaleY(0)}}
      @keyframes iuDrrV3Line{from{stroke-dashoffset:1100}to{stroke-dashoffset:0}}
      @media(max-width:1400px){.iu-drr-v3-toolbar{grid-template-columns:1fr 1.5fr}.iu-drr-v3-lock{text-align:left}.iu-drr-v3-kpis{grid-template-columns:repeat(3,1fr)}.iu-drr-v3-table-filter{grid-template-columns:repeat(3,minmax(0,1fr))}.iu-drr-v3-funnel{grid-template-columns:repeat(4,1fr)}.iu-drr-v3-metric-grid{grid-template-columns:repeat(3,1fr)}.iu-drr-v3-chart-table{grid-template-columns:1fr}}
      @media(max-width:920px){.iu-drr-v3-head{flex-direction:column;align-items:flex-start}.iu-drr-v3-toolbar{position:static;grid-template-columns:1fr}.iu-drr-v3-kpis{grid-template-columns:1fr}.iu-drr-v3-table-filter{grid-template-columns:1fr 1fr}.iu-drr-v3-position-layout{grid-template-columns:1fr}.iu-drr-v3-position-list{max-height:340px}.iu-drr-v3-funnel{grid-template-columns:repeat(2,1fr)}.iu-drr-v3-metric-grid{grid-template-columns:repeat(2,1fr)}}
      @media(prefers-reduced-motion:reduce){.iu-drr-v3-shell *,.iu-drr-v3-shell *::before,.iu-drr-v3-shell *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    `;
    document.head.appendChild(style);
  }

  function section(sectionKey, title, subtitle, content, options = {}) {
    const open = isSectionOpen(sectionKey, options.defaultOpen !== false);
    const platform = options.platform || 'wb';
    return `
      <article class="iu-drr-v3-section ${open ? '' : 'is-collapsed'}" data-iu-v3-section="${escapeHtml(sectionKey)}" style="--platform:${PLATFORM[platform]?.tone || '#e5c16f'}">
        <div class="iu-drr-v3-section-head">
          <div class="iu-drr-v3-platform-title">
            <i class="iu-drr-v3-dot" aria-hidden="true"></i>
            <div>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(subtitle || '')}</p>
            </div>
          </div>
          <div class="iu-drr-v3-spacer"></div>
          ${options.extra || ''}
          <button class="iu-drr-v3-collapse" type="button" data-iu-v3-collapse="${escapeHtml(sectionKey)}" aria-expanded="${open ? 'true' : 'false'}">
            ${open ? 'Скрыть' : 'Открыть'} <span class="chev">⌄</span>
          </button>
        </div>
        <div class="iu-drr-v3-collapsible" ${open ? '' : 'hidden'}>
          <div>${content}</div>
        </div>
      </article>
    `;
  }

  function syncPanels(root, activeView) {
    root.querySelectorAll('[data-iu-v3-panel]').forEach((panel) => {
      const isActive = panel.getAttribute('data-iu-v3-panel') === activeView;
      panel.hidden = !isActive;
      panel.toggleAttribute('inert', !isActive);
      panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      if ('inert' in panel) panel.inert = !isActive;
    });
    root.querySelectorAll('[data-iu-v3-view]').forEach((button) => {
      const isActive = button.getAttribute('data-iu-v3-view') === activeView;
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  function filterValuesFromHost(host) {
    const valueOf = (name, fallback = '') => host.querySelector(`[data-iu-v3-filter="${name}"]`)?.value || fallback;
    return {
      search: normalizeText(valueOf('search')),
      source: valueOf('source', 'all'),
      status: valueOf('status', 'all'),
      dateFrom: valueOf('dateFrom'),
      dateTo: valueOf('dateTo')
    };
  }

  function ensureFilterEmptyRow(host) {
    let empty = host.querySelector('[data-iu-v3-empty-row]');
    if (empty) return empty;
    const table = host.querySelector('table');
    const tbody = table?.tBodies?.[0];
    if (!tbody) return null;
    const colSpan = table.tHead?.rows?.[0]?.cells?.length || 1;
    empty = document.createElement('tr');
    empty.className = 'iu-drr-v3-empty-row';
    empty.setAttribute('data-iu-v3-empty-row', '');
    empty.hidden = true;
    empty.innerHTML = `<td colspan="${colSpan}">Нет строк под выбранный фильтр</td>`;
    tbody.appendChild(empty);
    return empty;
  }

  function applyTableFilter(host) {
    const filters = filterValuesFromHost(host);
    const active = isFilterActive(filters);
    const rows = Array.from(host.querySelectorAll('tr[data-iu-v3-row]'));
    let visible = 0;
    rows.forEach((row) => {
      const rowText = row.getAttribute('data-iu-v3-search') || '';
      const source = row.getAttribute('data-iu-v3-source') || 'other';
      const status = row.getAttribute('data-iu-v3-status') || 'ok';
      const date = row.getAttribute('data-iu-v3-date') || '';
      const sourceMatches = filters.source === 'all'
        || (filters.source === 'with-source' && source !== 'missing')
        || source === filters.source;
      const matches = (!filters.search || rowText.includes(filters.search))
        && sourceMatches
        && (filters.status === 'all' || status === filters.status)
        && (!filters.dateFrom || (date && date >= filters.dateFrom))
        && (!filters.dateTo || (date && date <= filters.dateTo));
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    host.querySelectorAll('[data-iu-v3-total-row]').forEach((row) => { row.hidden = active; });
    const empty = ensureFilterEmptyRow(host);
    if (empty) empty.hidden = visible > 0;
    const count = host.querySelector('[data-iu-v3-filter-count]');
    if (count) count.textContent = `${fmtInt(visible)} / ${fmtInt(rows.length)} строк`;
  }

  function bindTableFilters(root) {
    if (!root.dataset.iuDrrV3TableFiltersBound) {
      const handleControl = (event) => {
        const control = event.target?.closest?.('[data-iu-v3-filter]');
        if (!control || !root.contains(control)) return;
        const host = control.closest('[data-iu-v3-table-host]');
        const tableKey = host?.getAttribute('data-iu-v3-table-host');
        const name = control.getAttribute('data-iu-v3-filter');
        if (!host || !tableKey || !name) return;
        writeTableFilter(tableKey, name, control.value);
        applyTableFilter(host);
      };
      root.addEventListener('input', handleControl);
      root.addEventListener('change', handleControl);
      root.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-iu-v3-filter-reset]');
        if (!button || !root.contains(button)) return;
        const host = button.closest('[data-iu-v3-table-host]');
        const tableKey = host?.getAttribute('data-iu-v3-table-host');
        if (!host || !tableKey) return;
        clearTableFilter(tableKey);
        host.querySelectorAll('[data-iu-v3-filter]').forEach((control) => {
          const name = control.getAttribute('data-iu-v3-filter');
          control.value = name === 'source' || name === 'status' ? 'all' : '';
        });
        applyTableFilter(host);
      });
      root.dataset.iuDrrV3TableFiltersBound = '1';
    }
    root.querySelectorAll('[data-iu-v3-table-host]').forEach((host) => applyTableFilter(host));
  }

  function metricCell(value, type, note) {
    const text = fmtMetric(value, type);
    return `${text}${note ? `<span class="iu-drr-v3-source">${escapeHtml(note)}</span>` : ''}`;
  }

  function toneForCompletion(value, inverse = false) {
    const num = numberOrNull(value);
    if (num === null) return '#e5c16f';
    if (inverse) return num <= 1 ? '#72e6a0' : num <= 1.08 ? '#ffd45f' : '#ff746f';
    return num >= 1 ? '#72e6a0' : num >= 0.9 ? '#ffd45f' : '#ff746f';
  }

  function iuRowStatus(platform, model) {
    if (sourceBucket(model.source) === 'missing') return 'missing';
    const completionIndex = platform === 'wb' ? 2 : 3;
    const factIndex = 1;
    const completion = numberOrNull(model.values[completionIndex]?.[1]);
    const fact = numberOrNull(model.values[factIndex]?.[1]);
    if (completion === null || fact === null) return 'missing';
    if (completion < 0.9) return 'bad';
    if (completion < 1) return 'warn';
    return 'ok';
  }

  function positionDailyStatus(row) {
    if (sourceBucket(row.source) === 'missing') return 'missing';
    if (numberOrNull(row.ordersRevenue) !== null || numberOrNull(row.ordersUnits) !== null) return 'ok';
    return 'warn';
  }

  function dailyStatus(metrics) {
    if (sourceBucket(metrics.source) === 'missing') return 'missing';
    const hasPrimaryValue = [
      metrics.views,
      metrics.clicks,
      metrics.carts,
      metrics.ordersUnits,
      metrics.ordersRevenue,
      metrics.buyoutsUnits,
      metrics.margin
    ].some((value) => numberOrNull(value) !== null);
    return hasPrimaryValue ? 'ok' : 'warn';
  }

  function kpiCard(label, value, detail, progress, tone) {
    const pct = numberOrNull(progress) === null ? 0 : Math.max(0, Math.min(100, progress * 100));
    return `
      <article class="iu-drr-v3-card" style="--tone:${tone || toneForCompletion(progress)}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(detail || '')}</span>
        <div class="iu-drr-v3-progress" aria-hidden="true"><i style="--value:${pct.toFixed(2)}"></i></div>
      </article>
    `;
  }

  function buildHeroKpis(rows, focus, positions) {
    const wb = platformMonthSummary('wb', rows);
    const ozon = platformMonthSummary('ozon', rows);
    const ya = platformMonthSummary('ya', rows);
    const iuPlan = wb.revenuePlan + ozon.revenuePlan;
    const iuFact = wb.revenueFact + ozon.revenueFact;
    const adsPlan = wb.adsPlan + ozon.adsPlan;
    const adsFact = wb.adsFact + ozon.adsFact;
    const cards = [
      kpiCard('ИУ факт на дату', fmtMoney(iuFact), `WB + Ozon · план ${fmtMoney(iuPlan)}`, pctValue(iuFact, iuPlan), toneForCompletion(pctValue(iuFact, iuPlan))),
      kpiCard('Реклама факт', fmtMoney(adsFact), `план ${fmtMoney(adsPlan)} · ДРР ${fmtPct(pctValue(adsFact, iuFact))}`, pctValue(adsFact, adsPlan), toneForCompletion(pctValue(adsFact, adsPlan), true)),
      kpiCard('WB выполнение', fmtPct(wb.revenueCompletion), `${fmtMoney(wb.revenueFact)} / ${fmtMoney(wb.revenuePlan)}`, wb.revenueCompletion, toneForCompletion(wb.revenueCompletion)),
      kpiCard('Ozon GMV', fmtPct(ozon.revenueCompletion), `${fmtMoney(ozon.revenueFact)} / ${fmtMoney(ozon.revenuePlan)} · ДРР ${fmtPct(ozon.drrFact)}`, ozon.revenueCompletion, toneForCompletion(ozon.revenueCompletion)),
      kpiCard('Позиционный источник', fmtInt(positions.length), `${focus === 'all' ? 'все площадки' : PLATFORM[focus]?.label} · Yandex без ИУ`, Math.min(1, positions.length / 50), '#e5c16f')
    ];
    if (focus === 'ya') {
      cards[3] = kpiCard('Я.Маркет воронка', fmtMoney(ya.revenueFact), `заказы ${fmtInt(ya.orders)} · выкупы ${fmtInt(ya.buyouts)}`, ya.revenueCompletion, '#ffd45f');
    }
    return `<div class="iu-drr-v3-kpis">${cards.join('')}</div>`;
  }

  function buildIuRows(platform, rows) {
    if (platform === 'wb') {
      return rows.map((row) => ({
        date: row.date,
        source: row.wbIuFactSource || row.revenueWbSource || row.wbIuFactMode,
        values: [
          ['План оборота', row.targetRevenueWb, 'money'],
          ['Факт оборота', row.revenueWb, 'money'],
          ['Выполнение', row.revenueWbCompletionPct, 'pct'],
          ['План рекламы', row.planSpendWb, 'money'],
          ['Факт ДРР', firstDefined(row, ['spendFactDrr', 'spendFact']), 'money'],
          ['Факт ИУ', row.spendFactIu, 'money'],
          ['ДРР факт', row.factPct, 'pct'],
          ['ДРР ИУ', row.factPctIu, 'pct'],
          ['WB promotion', row.wbPromotion, 'money'],
          ['WB media', row.wbMedia, 'money'],
          ['Отзывы/баллы', row.reviewPoints, 'money'],
          ['Внешняя реклама', row.externalAds, 'money']
        ]
      }));
    }
    return rows.map((row) => ({
      date: row.date,
      source: row.ozonAdsFactMode || 'ozon_finance_balance_gmv_drr',
      values: [
        ['План GMV', row.targetRevenueOzon, 'money'],
        ['Факт GMV', row.revenueOzon, 'money'],
        ['API-витрина audit', row.revenueOzonApiRaw, 'money'],
        ['Выполнение GMV', row.revenueOzonCompletionPct, 'pct'],
        ['План рекламы', row.planSpendOzon, 'money'],
        ['Факт рекламы', row.spendFactOzon, 'money'],
        ['Gross расход', row.ozonDrrSpendGross, 'money'],
        ['Исключено', row.ozonDrrExcludedTotal, 'money'],
        ['ДРР цель', row.planPctOzon, 'pct'],
        ['ДРР факт', row.factPctOzon, 'pct'],
        ['Возвраты GMV', row.ozonReturns, 'money'],
        ['Finance rows', row.ozonFinanceSourceRows, 'int']
      ]
    }));
  }

  function buildIuTable(platform, rows) {
    const rowModels = buildIuRows(platform, rows);
    const headers = rowModels[0]?.values.map(([label]) => label) || [];
    const total = platformMonthSummary(platform, rows);
    const tableKey = safeTableKey('iu', platform);
    const totalValues = platform === 'wb'
      ? [
        total.revenuePlan, total.revenueFact, total.revenueCompletion, total.adsPlan,
        total.adsFact, total.adsIu, total.drrFact, pctValue(total.adsIu, total.revenueFact),
        sum(rows, 'wbPromotion'), sum(rows, 'wbMedia'), sum(rows, 'reviewPoints'), sum(rows, 'externalAds')
      ]
      : [
        total.revenuePlan, total.revenueFact, total.revenueRaw, total.revenueCompletion,
        total.adsPlan, total.adsFact, total.adsGross, total.exclusions,
        total.drrPlan, total.drrFact, total.returns, total.sourceRows
      ];
    const totalTypes = rowModels[0]?.values.map(([, , type]) => type) || [];
    const rowHtml = rowModels.map((model) => {
      const source = model.source || 'источник не указан';
      const status = iuRowStatus(platform, model);
      const search = rowSearch([
        PLATFORM[platform]?.label,
        model.date,
        compactDate(model.date),
        source,
        ...model.values.flatMap(([label, value, type]) => [label, fmtMetric(value, type), value])
      ]);
      return `
              <tr ${tableRowAttrs({ search, source: sourceBucket(source), status, date: model.date })}>
                <td><strong>${escapeHtml(compactDate(model.date))}</strong><span class="iu-drr-v3-source">${escapeHtml(source)}</span></td>
                ${model.values.map(([, value, type]) => `<td>${metricCell(value, type)}</td>`).join('')}
              </tr>
      `;
    }).join('');
    return `
      <div class="iu-drr-v3-table-host" data-iu-v3-table-host="${escapeHtml(tableKey)}">
        ${tableFilterMarkup(tableKey, rowModels.length)}
        <div class="iu-drr-v3-matrix-wrap">
        <table class="iu-drr-v3-table">
          <thead>
            <tr>
              <th>Дата / источник</th>
              ${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowHtml}
            ${[].map((model) => `
              <tr>
                <td><strong>${escapeHtml(compactDate(model.date))}</strong><span class="iu-drr-v3-source">${escapeHtml(model.source || 'источник не указан')}</span></td>
                ${model.values.map(([, value, type]) => `<td>${metricCell(value, type)}</td>`).join('')}
              </tr>
            `).join('')}
            <tr class="iu-drr-v3-total-row" data-iu-v3-total-row>
              <td><strong>Итого</strong><span class="iu-drr-v3-source">${escapeHtml(PLATFORM[platform].label)} · текущий месяц</span></td>
              ${totalValues.map((value, index) => `<td>${metricCell(value, totalTypes[index])}</td>`).join('')}
            </tr>
            <tr class="iu-drr-v3-empty-row" data-iu-v3-empty-row hidden><td colspan="${headers.length + 1}">Нет строк под выбранный фильтр</td></tr>
          </tbody>
        </table>
        </div>
      </div>
    `;
  }

  function buildIuPanel(rows, focus) {
    const platforms = platformsForFocus(focus, { includeYandex: false });
    const parts = platforms.map((platform) => section(
      `iu-${platform}`,
      `${PLATFORM[platform].label} · ИУ по дням`,
      platform === 'wb'
        ? 'Все текущие строки WB: план, факт, реклама, каналы и контрольные API-дельты.'
        : 'Ozon: GMV sales-minus-returns, Finance balance, ДРР и исключения Premium Plus / Бейдж Оригинал.',
      buildIuTable(platform, rows),
      { platform }
    ));
    if (!platforms.length || focus === 'ya') {
      parts.push(section(
        'iu-no-selected-platform',
        'Выбранная площадка · без ИУ',
        'Для текущего глобального фокуса таблица ИУ не строится. Доступная аналитика находится во вкладках «Позиции» и «Дневная матрица».',
        `<div class="iu-drr-v3-empty">Таблица ИУ намеренно не строится для выбранной площадки: это правило расчета, а не потеря данных.</div>`,
        { platform: 'ya', defaultOpen: true }
      ));
    }
    return parts.join('');
  }

  function procurementIndex(platform) {
    const name = platform === 'wb' ? 'wbProcurement' : platform === 'ozon' ? 'ozonProcurement' : 'ymProcurement';
    const rows = sourceArray(name, 'rows');
    const map = new Map();
    rows.forEach((row) => {
      const key = String(row.articleKey || row.article || '').toLowerCase();
      if (!key) return;
      const current = map.get(key) || { rows: [], available: 0, sales30: 0, sales14: 0, avgDaily: 0 };
      current.rows.push(row);
      current.available += numberOrZero(row.available ?? row.inStock);
      current.sales30 += numberOrZero(row.sales30);
      current.sales14 += numberOrZero(row.sales14);
      current.avgDaily += numberOrZero(row.avgDaily);
      current.turnoverDays = current.turnoverDays == null ? numberOrNull(row.turnoverDays) : Math.min(current.turnoverDays, numberOrNull(row.turnoverDays) ?? current.turnoverDays);
      current.name = current.name || row.name;
      current.owner = current.owner || row.owner;
      map.set(key, current);
    });
    return map;
  }

  function buildPositions(focus) {
    const map = new Map();
    const ensure = (key, seed = {}) => {
      const articleKey = String(key || '').toLowerCase();
      if (!articleKey) return null;
      const existing = map.get(articleKey) || { articleKey, platforms: new Set(), sources: new Set() };
      Object.assign(existing, Object.fromEntries(Object.entries(seed).filter(([, value]) => value !== undefined && value !== null && value !== '')));
      map.set(articleKey, existing);
      return existing;
    };

    sourceArray('skuMatrix').forEach((item) => {
      const pos = ensure(item.articleKey || item.article, {
        article: item.article,
        name: item.name,
        owner: item.productOwner || item.owner,
        platformOwners: item.platformOwners,
        status: item.status || item.registryStatus,
        category: item.category
      });
      if (pos) {
        ['wb', 'ozon', 'ya'].forEach((platform) => item.platformOwners?.[platform] && pos.platforms.add(platform));
        pos.sources.add('sku_matrix');
      }
    });

    sourceArray('skus').forEach((item) => {
      const pos = ensure(item.articleKey || item.article, {
        article: item.article,
        name: item.name,
        owner: item.owner?.name || item.owner,
        platformOwners: item.owner?.byPlatform || item.ownersByPlatform,
        status: item.status || item.registryStatus,
        category: item.category,
        skuRaw: item
      });
      if (pos) {
        ['wb', 'ozon', 'ya'].forEach((platform) => (item[platform] || item.owner?.byPlatform?.[platform]) && pos.platforms.add(platform));
        pos.sources.add('skus');
      }
    });

    sourceArray('leaderboard').forEach((item) => {
      const pos = ensure(item.articleKey || item.article, {
        article: item.article,
        name: item.name,
        owner: item.owner,
        category: item.category,
        leaderboard: item
      });
      if (pos) {
        pos.platforms.add('wb');
        pos.platforms.add('ozon');
        pos.sources.add('product_leaderboard');
      }
    });

    sourceArray('wbFunnel').forEach((item) => {
      const pos = ensure(item.articleKey || item.article, {
        article: item.article,
        name: item.name,
        owner: item.owner,
        category: item.subject,
        wbFunnel: item
      });
      if (pos) {
        pos.platforms.add('wb');
        pos.sources.add('wb_sales_funnel_report');
      }
    });

    ['wb', 'ozon', 'ya'].forEach((platform) => {
      procurementIndex(platform).forEach((data, key) => {
        const pos = ensure(key, { name: data.name, owner: data.owner });
        if (pos) {
          pos.procurement = pos.procurement || {};
          pos.procurement[platform] = data;
          pos.platforms.add(platform);
          pos.sources.add(`${platform}_procurement`);
        }
      });
    });

    const search = currentSearch().trim().toLowerCase();
    const allowed = new Set(platformsForFocus(focus));
    const positions = Array.from(map.values())
      .filter((pos) => focus === 'all' || Array.from(pos.platforms).some((platform) => allowed.has(platform)))
      .filter((pos) => {
        if (!search) return true;
        return [pos.articleKey, pos.article, pos.name, pos.owner, pos.category].some((value) => String(value || '').toLowerCase().includes(search));
      })
      .map((pos) => {
        const lb = pos.leaderboard || {};
        const wb = pos.wbFunnel || {};
        const score = numberOrZero(wb.ordersRevenue) || numberOrZero(lb.revenue) || numberOrZero(lb.orders) || numberOrZero(pos.procurement?.wb?.sales30) || numberOrZero(pos.procurement?.ozon?.sales30);
        return { ...pos, score, platforms: Array.from(pos.platforms), sources: Array.from(pos.sources) };
      })
      .sort((a, b) => b.score - a.score || String(a.name || a.articleKey).localeCompare(String(b.name || b.articleKey), 'ru'));
    return positions;
  }

  function positionPlatform(pos, focus) {
    if (focus !== 'all' && PLATFORM[focus] && pos.platforms.includes(focus)) return focus;
    if (pos.wbFunnel) return 'wb';
    if (pos.procurement?.ozon) return 'ozon';
    if (pos.procurement?.ya) return 'ya';
    return pos.platforms[0] || 'wb';
  }

  function buildPositionFunnel(pos, platform) {
    const lb = pos.leaderboard || {};
    const wb = pos.wbFunnel || {};
    const procurement = pos.procurement?.[platform] || {};
    const isWb = platform === 'wb';
    const views = pickPositiveMetric([
      { value: isWb ? wb.views : null, note: 'WB funnel' },
      { value: lb.reach, note: 'КЗ weekly fallback' }
    ], 'нет показов');
    const clicks = pickPositiveMetric([
      { value: isWb ? wb.clicks : null, note: 'WB funnel' },
      { value: lb.clicks, note: 'КЗ weekly fallback' }
    ], 'нет кликов');
    const carts = pickPositiveMetric([
      { value: isWb ? wb.carts : null, note: 'WB funnel' },
      { value: lb.carts, note: 'КЗ weekly fallback' }
    ], 'нет корзин');
    const orders = pickPositiveMetric([
      { value: isWb ? wb.ordersUnits : null, note: 'WB SKU/day' },
      { value: procurement.sales30, note: 'rolling stock/sales' },
      { value: lb.orders, note: 'КЗ weekly fallback' }
    ], 'нет заказов');
    const delivered = pickPositiveMetric([
      { value: procurement.sales30, note: platform === 'ya' ? 'rolling sales' : 'procurement rolling sales' }
    ], 'нет SKU/day источника');
    const buyouts = pickPositiveMetric([
      { value: isWb ? wb.buyoutsUnits : null, note: 'WB funnel' },
      { value: lb.buys, note: 'КЗ weekly fallback' }
    ], 'нет выкупов');
    const cancellations = pickPositiveMetric([
      { value: isWb ? wb.cancellationsUnits : null, note: 'WB funnel' }
    ], 'нет SKU/day источника');
    const stages = [
      { label: 'Показы', value: views.value, type: 'int', note: views.note },
      { label: 'Клики / PDP', value: clicks.value, type: 'int', note: clicks.note },
      { label: 'Корзины', value: carts.value, type: 'int', note: carts.note },
      { label: 'Заказы', value: orders.value, type: 'int', note: orders.note },
      { label: 'Доставлено', value: delivered.value, type: 'int', note: delivered.note },
      { label: 'Выкупы', value: buyouts.value, type: 'int', note: buyouts.note },
      { label: 'Отмены / возвраты', value: cancellations.value, type: 'int', note: cancellations.note }
    ];
    const max = Math.max(...stages.map((stage) => numberOrZero(stage.value)), 1);
    return stages.map((stage) => ({ ...stage, fill: Math.max(0, Math.min(100, (numberOrZero(stage.value) / max) * 100)) }));
  }

  function buildPositionMetrics(pos, platform) {
    const lb = pos.leaderboard || {};
    const wb = pos.wbFunnel || {};
    const procurement = pos.procurement?.[platform] || {};
    const ordersRevenue = platform === 'wb' ? numberOrNull(wb.ordersRevenue) : null;
    const ordersUnits = platform === 'wb' ? numberOrNull(wb.ordersUnits) : numberOrNull(procurement.sales30);
    const adSpend = numberOrNull(lb.contentCost);
    const adRevenue = numberOrNull(lb.revenue);
    const adClicks = numberOrNull(lb.clicks);
    const adOrders = numberOrNull(lb.orders);
    const impressions = numberOrNull(lb.reach);
    const wbBuyoutPct = positiveOrNull(wb.buyoutPct);
    const lbBuyoutPct = positiveOrNull(lb.buyoutPct);
    const buyoutPct = platform === 'wb' ? (wbBuyoutPct ?? lbBuyoutPct) : lbBuyoutPct;
    const buyoutNote = platform === 'wb' && wbBuyoutPct !== null
      ? 'WB funnel'
      : (lbBuyoutPct !== null ? 'КЗ weekly fallback' : 'нет источника');
    const metrics = [
      ['CPC', safeRatio(adSpend, adClicks), 'money', adClicks ? 'КЗ weekly' : 'нет кликов'],
      ['CPM', impressions ? adSpend / impressions * 1000 : null, 'money', impressions ? 'КЗ weekly' : 'нет показов'],
      ['CPS / CPO', safeRatio(adSpend, adOrders), 'money', adOrders ? 'КЗ weekly' : 'нет orders'],
      ['Ad DRR', safeRatio(adSpend, adRevenue), 'pct', adRevenue ? 'КЗ weekly' : 'нет выручки рекламы'],
      ['Бизнес ДРР', safeRatio(adSpend, ordersRevenue || adRevenue), 'pct', ordersRevenue ? 'WB orders revenue' : (adRevenue ? 'КЗ weekly' : 'нет источника')],
      ['ROMI', numberOrNull(lb.romiPct), 'pct', lb.romiPct != null ? 'product_leaderboard' : 'нет источника'],
      ['Средний чек', safeRatio(ordersRevenue, ordersUnits), 'money', ordersRevenue && ordersUnits ? 'WB SKU/day' : 'нет SKU/day выручки'],
      ['Маржа', ordersRevenue ? safeRatio(wb.estimatedMargin, ordersRevenue) : numberOrNull(lb.income) && numberOrNull(lb.revenue) ? lb.income / lb.revenue : null, 'pct', ordersRevenue ? 'WB estimated margin' : (lb.income != null ? 'КЗ weekly' : 'нет источника')],
      ['Остаток', procurement.available, 'int', procurement.available != null ? 'procurement' : 'нет источника'],
      ['Оборачиваемость', procurement.turnoverDays, 'decimal', procurement.turnoverDays != null ? 'procurement' : 'нет источника'],
      ['Продажи 30д', procurement.sales30, 'int', procurement.sales30 != null ? 'procurement' : 'нет источника'],
      ['Buyout', buyoutPct, 'pct', buyoutNote]
    ];
    return metrics;
  }

  function chartSvg(rows, platform) {
    const values = rows.map((row) => numberOrZero(row.ordersRevenue ?? row.ordersUnits ?? row.sales30));
    if (!values.length || Math.max(...values) <= 0) {
      return `<div class="iu-drr-v3-no-source">Нет дневного SKU-источника для выбранной позиции. Значения не заменяются нулями.</div>`;
    }
    const width = 720;
    const height = 230;
    const pad = 22;
    const max = Math.max(...values, 1);
    const min = Math.min(...values);
    const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : width - pad * 2;
    const points = values.map((value, index) => {
      const x = pad + index * step;
      const y = height - pad - ((value - min) / Math.max(1, max - min)) * (height - pad * 2);
      return [x, Number.isFinite(y) ? y : height - pad];
    });
    const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const bars = values.map((value, index) => {
      const barHeight = Math.max(4, (value / max) * (height - pad * 2));
      const x = pad + index * step - 5;
      const y = height - pad - barHeight;
      return `<rect class="bar" style="--i:${index}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="10" height="${barHeight.toFixed(1)}" rx="4"></rect>`;
    }).join('');
    return `
      <svg class="iu-drr-v3-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Дневная динамика SKU">
        <g opacity=".18">${[0, 1, 2, 3].map((i) => `<line x1="${pad}" y1="${pad + i * 50}" x2="${width - pad}" y2="${pad + i * 50}" stroke="currentColor"></line>`).join('')}</g>
        ${bars}
        <polyline class="line" points="${line}"></polyline>
        ${points.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${PLATFORM[platform]?.tone || '#e5c16f'}"></circle>`).join('')}
      </svg>
    `;
  }

  function selectedPositionRows(pos, platform, rows) {
    if (platform === 'wb' && Array.isArray(pos.wbFunnel?.daily)) {
      return pos.wbFunnel.daily.map((row) => ({
        date: row.date,
        stableKey: `${platform}|${pos.articleKey}|${row.date}`,
        ordersUnits: row.ordersUnits,
        ordersRevenue: row.ordersRevenue,
        estimatedMargin: row.estimatedMargin,
        avgPrice: row.avgPrice,
        source: 'wb_sales_funnel_report'
      }));
    }
    return rows.map((row) => ({
      date: row.date,
      stableKey: `${platform}|${pos.articleKey}|${row.date}`,
      ordersUnits: null,
      ordersRevenue: null,
      estimatedMargin: null,
      avgPrice: null,
      source: 'нет SKU/day источника'
    }));
  }

  function buildPositionDailyTable(pos, platform, rows) {
    const daily = selectedPositionRows(pos, platform, rows);
    const tableKey = safeTableKey('position', platform, pos.articleKey);
    const dailyRows = daily.map((row) => {
      const source = row.source || 'источник не указан';
      const status = positionDailyStatus(row);
      const search = rowSearch([
        row.date,
        compactDate(row.date),
        row.stableKey,
        source,
        row.ordersUnits,
        row.ordersRevenue,
        row.estimatedMargin,
        row.avgPrice
      ]);
      return `
              <tr ${tableRowAttrs({ search, source: sourceBucket(source), status, date: row.date })}>
                <td><strong>${escapeHtml(compactDate(row.date))}</strong><span class="iu-drr-v3-source">${escapeHtml(row.date)}</span></td>
                <td>${metricCell(row.ordersUnits, 'int')}</td>
                <td>${metricCell(row.ordersRevenue, 'money')}</td>
                <td>${metricCell(row.estimatedMargin, 'money')}</td>
                <td>${metricCell(row.avgPrice, 'money')}</td>
                <td><span class="iu-drr-v3-note">${escapeHtml(source)}</span></td>
              </tr>
      `;
    }).join('');
    return `
      <div class="iu-drr-v3-table-host" data-iu-v3-table-host="${escapeHtml(tableKey)}">
        ${tableFilterMarkup(tableKey, daily.length)}
        <div class="iu-drr-v3-matrix-wrap" style="max-height:300px">
        <table class="iu-drr-v3-table" style="min-width:850px">
          <thead><tr><th>Дата</th><th>Заказы, шт.</th><th>Оборот</th><th>Маржа</th><th>Средний чек</th><th>Источник</th></tr></thead>
          <tbody>
            ${dailyRows}
            ${[].map((row) => `
              <tr>
                <td><strong>${escapeHtml(compactDate(row.date))}</strong><span class="iu-drr-v3-source">${escapeHtml(row.date)}</span></td>
                <td>${metricCell(row.ordersUnits, 'int')}</td>
                <td>${metricCell(row.ordersRevenue, 'money')}</td>
                <td>${metricCell(row.estimatedMargin, 'money')}</td>
                <td>${metricCell(row.avgPrice, 'money')}</td>
                <td><span class="iu-drr-v3-note">${escapeHtml(row.source)}</span></td>
              </tr>
            `).join('')}
            <tr class="iu-drr-v3-empty-row" data-iu-v3-empty-row hidden><td colspan="6">Нет строк под выбранный фильтр</td></tr>
          </tbody>
        </table>
        </div>
      </div>
    `;
  }

  function buildPositionPanel(rows, focus, positions) {
    if (!positions.length) {
      return `<div class="iu-drr-v3-empty">Позиционный источник не найден для текущего поиска. Данные не подменяются демонстрационными значениями.</div>`;
    }
    const selectedKey = currentSelectedPosition();
    const selected = positions.find((pos) => pos.articleKey === selectedKey) || positions[0];
    setCurrentSelectedPosition(selected.articleKey);
    const platform = positionPlatform(selected, focus);
    const stages = buildPositionFunnel(selected, platform);
    const metrics = buildPositionMetrics(selected, platform);
    const platformTone = PLATFORM[platform]?.tone || '#e5c16f';
    const list = positions.slice(0, 80).map((pos) => {
      const posPlatform = positionPlatform(pos, focus);
      const active = pos.articleKey === selected.articleKey;
      const owner = pos.platformOwners?.[posPlatform] || pos.owner || 'owner не указан';
      const sourceText = pos.sources.slice(0, 3).join(' · ') || 'источник не указан';
      return `
        <button class="iu-drr-v3-sku-btn ${active ? 'active' : ''}" type="button" data-iu-v3-position="${escapeHtml(pos.articleKey)}" style="--platform:${PLATFORM[posPlatform]?.tone || '#e5c16f'}" aria-pressed="${active ? 'true' : 'false'}">
          <em>${escapeHtml(PLATFORM[posPlatform]?.label || posPlatform)}</em>
          <b>${escapeHtml(pos.name || pos.articleKey)}</b>
          <span>${escapeHtml(owner)} · ${escapeHtml(sourceText)}</span>
        </button>
      `;
    }).join('');
    return `
      <div class="iu-drr-v3-position-layout">
        <aside class="iu-drr-v3-panel-card iu-drr-v3-position-list">
          <h3>Позиции</h3>
          <p class="iu-drr-v3-note">Список ограничен первыми 80 SKU для скорости. Поиск выше фильтрует весь источник.</p>
          ${list}
        </aside>
        <article class="iu-drr-v3-panel-card iu-drr-v3-position-detail" style="--platform:${platformTone}">
          <div class="iu-drr-v3-detail-head">
            <div>
              <p class="iu-drr-v3-eyebrow">${escapeHtml(PLATFORM[platform]?.label || platform)} · POSITION FUNNEL</p>
              <h2>${escapeHtml(selected.name || selected.articleKey)}</h2>
              <p>${escapeHtml(selected.article || selected.articleKey)} · owner ${escapeHtml(selected.platformOwners?.[platform] || selected.owner || 'не указан')} · ${escapeHtml(selected.sources.join(' / ') || 'нет источника')}</p>
            </div>
            <div class="iu-drr-v3-spacer"></div>
            <span class="iu-drr-v3-badge">${escapeHtml(`${platform}|${selected.articleKey}`)}</span>
          </div>
          <div class="iu-drr-v3-funnel">
            ${stages.map((stage, index) => `
              <div class="iu-drr-v3-stage" style="--i:${index};--fill:${stage.fill.toFixed(2)}">
                <small>${escapeHtml(stage.label)}</small>
                <strong>${escapeHtml(fmtMetric(stage.value, stage.type))}</strong>
                <span>${escapeHtml(stage.note)}</span>
              </div>
            `).join('')}
          </div>
          <div class="iu-drr-v3-metric-grid">
            ${metrics.map(([label, value, type, note]) => `
              <div class="iu-drr-v3-metric">
                <small>${escapeHtml(label)}</small>
                <strong>${escapeHtml(fmtMetric(value, type))}</strong>
                <span>${escapeHtml(note)}</span>
              </div>
            `).join('')}
          </div>
          <div class="iu-drr-v3-chart-table">
            <div class="iu-drr-v3-panel-card iu-drr-v3-chart">
              <h3>Дневная динамика позиции</h3>
              <p class="iu-drr-v3-note">Если нет SKU/day источника, график не подставляет агрегат площадки.</p>
              ${chartSvg(selectedPositionRows(selected, platform, rows), platform)}
            </div>
            <div class="iu-drr-v3-panel-card iu-drr-v3-mini">
              <h3>Дневные строки</h3>
              <p class="iu-drr-v3-note">Дневные строки SKU/day. Дата, источник и артикул показаны отдельно.</p>
              ${buildPositionDailyTable(selected, platform, rows)}
            </div>
          </div>
          <div class="iu-drr-v3-no-source">
            Источники не смешиваются молча: WB SKU/day берется из <b>wb_sales_funnel_report</b>, контентная воронка из <b>product_leaderboard</b>, остатки и rolling sales из procurement. Где источника нет, стоит «—», а не 0.
          </div>
        </article>
      </div>
    `;
  }

  function dailyMetricsForPosition(pos, platform, date, rowsByDate) {
    const wbDaily = platform === 'wb' && Array.isArray(pos.wbFunnel?.daily)
      ? pos.wbFunnel.daily.find((row) => row.date === date)
      : null;
    const platformRow = rowsByDate.get(date) || {};
    if (platform === 'wb') {
      return {
        source: wbDaily ? 'WB SKU/day' : 'нет SKU/day источника',
        views: wbDaily ? positiveOrNull(pos.wbFunnel.views) : null,
        clicks: wbDaily ? positiveOrNull(pos.wbFunnel.clicks) : null,
        carts: wbDaily ? positiveOrNull(pos.wbFunnel.carts) : null,
        ordersUnits: wbDaily?.ordersUnits ?? null,
        ordersRevenue: wbDaily?.ordersRevenue ?? null,
        buyoutsUnits: wbDaily ? positiveOrNull(pos.wbFunnel.buyoutsUnits) : null,
        cancellationsUnits: wbDaily ? positiveOrNull(pos.wbFunnel.cancellationsUnits) : null,
        adsSpend: null,
        adsRevenue: null,
        cpc: null,
        cpo: null,
        drr: null,
        margin: wbDaily?.estimatedMargin ?? null,
        platformContext: platformRow.revenueWb
      };
    }
    if (platform === 'ozon') {
      return {
        source: 'нет SKU/day источника',
        views: null,
        clicks: null,
        carts: null,
        ordersUnits: null,
        ordersRevenue: null,
        buyoutsUnits: null,
        cancellationsUnits: null,
        adsSpend: null,
        adsRevenue: null,
        cpc: null,
        cpo: null,
        drr: null,
        margin: null,
        platformContext: platformRow.revenueOzon
      };
    }
    return {
      source: 'Я.Маркет funnel-only · нет SKU/day источника',
      views: null,
      clicks: null,
      carts: null,
      ordersUnits: null,
      ordersRevenue: null,
      buyoutsUnits: null,
      cancellationsUnits: null,
      adsSpend: null,
      adsRevenue: null,
      cpc: null,
      cpo: null,
      drr: null,
      margin: null,
      platformContext: platformRow.revenueYandex
    };
  }

  function buildDailyPanel(rows, focus, positions) {
    const platforms = platformsForFocus(focus, { includeYandex: true });
    const rowsByDate = new Map(rows.map((row) => [row.date, row]));
    const dates = rows.map((row) => row.date);
    const chosenPositions = positions.slice(0, 24);
    const sections = platforms.map((platform) => {
      const platformPositions = chosenPositions.filter((pos) => focus === 'all' ? pos.platforms.includes(platform) || platform === 'wb' : true).slice(0, 14);
      const body = [];
      platformPositions.forEach((pos) => {
        dates.forEach((date) => {
          const metrics = dailyMetricsForPosition(pos, platform, date, rowsByDate);
          const source = metrics.source || 'источник не указан';
          const status = dailyStatus(metrics);
          const stableKey = `${platform}|${pos.articleKey}|${date}`;
          const search = rowSearch([
            stableKey,
            date,
            compactDate(date),
            pos.name,
            pos.article,
            pos.articleKey,
            source,
            metrics.views,
            metrics.clicks,
            metrics.carts,
            metrics.ordersUnits,
            metrics.ordersRevenue,
            metrics.platformContext
          ]);
          body.push(`
            <tr ${tableRowAttrs({ search, source: sourceBucket(source), status, date })}>
              <td>
                <strong>${escapeHtml(compactDate(date))}</strong>
                <span class="iu-drr-v3-source">${escapeHtml(date)}</span>
              </td>
              <td>${escapeHtml(pos.name || pos.articleKey)}<span class="iu-drr-v3-source">${escapeHtml(pos.article || pos.articleKey)}</span></td>
              <td>${metricCell(metrics.views, 'int')}</td>
              <td>${metricCell(metrics.clicks, 'int')}</td>
              <td>${metricCell(metrics.carts, 'int')}</td>
              <td>${metricCell(metrics.ordersUnits, 'int')}</td>
              <td>${metricCell(metrics.ordersRevenue, 'money')}</td>
              <td>${metricCell(metrics.buyoutsUnits, 'int')}</td>
              <td>${metricCell(metrics.cancellationsUnits, 'int')}</td>
              ${platform === 'ya' ? '' : `
                <td>${metricCell(metrics.adsSpend, 'money')}</td>
                <td>${metricCell(metrics.adsRevenue, 'money')}</td>
                <td>${metricCell(metrics.cpc, 'money')}</td>
                <td>${metricCell(metrics.cpo, 'money')}</td>
                <td>${metricCell(metrics.drr, 'pct')}</td>
              `}
              <td>${metricCell(metrics.margin, 'money')}</td>
              <td>${metricCell(metrics.platformContext, 'money')}<span class="iu-drr-v3-source">${escapeHtml(source)}</span></td>
            </tr>
          `);
        });
      });
      const headers = platform === 'ya'
        ? '<th>Дата</th><th>SKU</th><th>Показы</th><th>Клики</th><th>Корзины</th><th>Заказы</th><th>Оборот</th><th>Выкупы</th><th>Отмены</th><th>Маржа</th><th>Контекст площадки</th>'
        : '<th>Дата</th><th>SKU</th><th>Показы</th><th>Клики</th><th>Корзины</th><th>Заказы</th><th>Оборот</th><th>Выкупы</th><th>Отмены</th><th>Расход</th><th>Ad revenue</th><th>CPC</th><th>CPS/CPO</th><th>ДРР</th><th>Маржа</th><th>Контекст площадки</th>';
      const tableKey = safeTableKey('daily', platform);
      const colSpan = platform === 'ya' ? 11 : 16;
      return section(
        `daily-${platform}`,
        `${PLATFORM[platform].label} · platform × SKU × date`,
        platform === 'ya'
          ? 'Только доступная funnel-часть. ИУ, расход и ДРР намеренно отсутствуют.'
          : 'Матрица SKU/day с рекламой и экономикой только там, где есть источник.',
        `
          <div class="iu-drr-v3-table-host" data-iu-v3-table-host="${escapeHtml(tableKey)}">
            ${tableFilterMarkup(tableKey, body.length)}
            <div class="iu-drr-v3-matrix-wrap">
            <table class="iu-drr-v3-table" style="min-width:${platform === 'ya' ? '1280px' : '1660px'}">
              <thead><tr>${headers}</tr></thead>
              <tbody>${body.join('') || `<tr><td colspan="16">Нет строк для текущего фильтра</td></tr>`}</tbody>
            </table>
            </div>
          </div>
        `,
        { platform }
      );
    });
    return sections.join('');
  }

  function sumBy(rows, getter) {
    let total = 0;
    let found = false;
    rows.forEach((row) => {
      const value = numberOrNull(getter(row));
      if (value === null) return;
      total += value;
      found = true;
    });
    return found ? total : null;
  }

  function ratioBy(rows, numeratorGetter, denominatorGetter) {
    return pctValue(sumBy(rows, numeratorGetter), sumBy(rows, denominatorGetter));
  }

  function statMetric(label, type, calc, source, cell, total, options = {}) {
    return { label, type, calc, source, cell, total, ...options };
  }

  function platformStatsSource(row, platform) {
    if (platform === 'wb') return row.wbIuFactSource || row.revenueWbSource || row.wbIuFactMode || 'WB API / IU control';
    if (platform === 'ozon') return row.ozonAdsFactMode || row.ozonGmvMode || 'Ozon Finance / realization';
    return row.yandexAdsFactMode || 'Yandex Market funnel';
  }

  function platformStatsMetrics(platform) {
    if (platform === 'wb') {
      const wbSpend = (row) => firstDefined(row, ['spendFactDrr', 'spendFact']);
      return [
        statMetric('Расходы рекламы, ₽', 'money', 'WB promotion + media + ДРР-контроль', 'WB ads / DRR', wbSpend, (rows) => sumBy(rows, wbSpend), { tone: '#b84cff' }),
        statMetric('Расходы ИУ, ₽', 'money', 'Расходы для ИУ с учетом согласованных корректировок', 'WB IU control', (row) => row.spendFactIu, (rows) => sumBy(rows, (row) => row.spendFactIu), { tone: '#b84cff' }),
        statMetric('План рекламы, ₽', 'money', 'План рекламного бюджета WB на дату', 'corporate plan', (row) => row.planSpendWb, (rows) => sumBy(rows, (row) => row.planSpendWb), { tone: '#ffd45f' }),
        statMetric('Показы рекламы, шт', 'int', 'Показы из рекламной воронки WB', 'WB ads funnel', (row) => row.adsViews, (rows) => sumBy(rows, (row) => row.adsViews)),
        statMetric('Клики рекламы, шт', 'int', 'Клики из рекламной воронки WB', 'WB ads funnel', (row) => row.adsClicks, (rows) => sumBy(rows, (row) => row.adsClicks)),
        statMetric('CTR рекламы, %', 'pct', 'клики / показы', 'WB ads funnel', (row) => safeRatio(row.adsClicks, row.adsViews), (rows) => ratioBy(rows, (row) => row.adsClicks, (row) => row.adsViews)),
        statMetric('CPC, ₽', 'money', 'расходы рекламы / клики', 'WB ads funnel', (row) => safeRatio(wbSpend(row), row.adsClicks), (rows) => safeRatio(sumBy(rows, wbSpend), sumBy(rows, (row) => row.adsClicks))),
        statMetric('Заказы рекламы, шт', 'int', 'Заказы из рекламной воронки WB', 'WB ads funnel', (row) => row.adsOrders, (rows) => sumBy(rows, (row) => row.adsOrders)),
        statMetric('CPO, ₽', 'money', 'расходы рекламы / заказы рекламы', 'WB ads funnel', (row) => safeRatio(wbSpend(row), row.adsOrders), (rows) => safeRatio(sumBy(rows, wbSpend), sumBy(rows, (row) => row.adsOrders))),
        statMetric('CR в заказ, %', 'pct', 'заказы рекламы / клики', 'WB ads funnel', (row) => safeRatio(row.adsOrders, row.adsClicks), (rows) => ratioBy(rows, (row) => row.adsOrders, (row) => row.adsClicks)),
        statMetric('Оборот WB, ₽', 'money', 'факт оборота из согласованного источника ИУ', 'WB API / control', (row) => row.revenueWb, (rows) => sumBy(rows, (row) => row.revenueWb), { tone: '#72e6a0' }),
        statMetric('План оборота WB, ₽', 'money', 'план оборота WB', 'corporate plan', (row) => row.targetRevenueWb, (rows) => sumBy(rows, (row) => row.targetRevenueWb)),
        statMetric('Выполнение ИУ WB, %', 'pct', 'факт оборота / план оборота', 'WB IU control', (row) => row.revenueWbCompletionPct, (rows) => ratioBy(rows, (row) => row.revenueWb, (row) => row.targetRevenueWb), { goodHigh: true, tone: '#72e6a0' }),
        statMetric('ДРР факт, %', 'pct', 'расходы рекламы / база ДРР', 'WB DRR', (row) => row.factPct, (rows) => ratioBy(rows, wbSpend, (row) => row.adsPctBaseWb || row.revenueWb), { goodLow: true, tone: '#ff746f' }),
        statMetric('ДРР ИУ, %', 'pct', 'расходы ИУ / факт оборота', 'WB IU control', (row) => row.factPctIu, (rows) => ratioBy(rows, (row) => row.spendFactIu, (row) => row.revenueWb), { goodLow: true, tone: '#ff746f' }),
        statMetric('Рекламная выручка, ₽', 'money', 'выручка рекламной воронки', 'WB ads funnel', (row) => row.adsRevenue, (rows) => sumBy(rows, (row) => row.adsRevenue), { tone: '#72e6a0' }),
        statMetric('ROMI рекламы, %', 'pct', 'рекламная выручка / расходы рекламы', 'WB ads funnel', (row) => safeRatio(row.adsRevenue, wbSpend(row)), (rows) => ratioBy(rows, (row) => row.adsRevenue, wbSpend), { goodHigh: true }),
        statMetric('WB promotion, ₽', 'money', 'расходы promotion-канала WB', 'WB ads channel', (row) => row.wbPromotion, (rows) => sumBy(rows, (row) => row.wbPromotion)),
        statMetric('WB media, ₽', 'money', 'расходы media-канала WB', 'WB ads channel', (row) => row.wbMedia, (rows) => sumBy(rows, (row) => row.wbMedia)),
        statMetric('Отзывы / баллы, ₽', 'money', 'финансовые списания отзывов и баллов', 'WB finance deductions', (row) => row.reviewPoints, (rows) => sumBy(rows, (row) => row.reviewPoints)),
        statMetric('Внешняя реклама, ₽', 'money', 'внешняя реклама, если пришла в источник', 'external ads', (row) => row.externalAds, (rows) => sumBy(rows, (row) => row.externalAds)),
        statMetric('Сырая API-реклама, ₽', 'money', 'сырые API-расходы до контрольной логики', 'WB raw API audit', (row) => row.wbRawApiSpendFact, (rows) => sumBy(rows, (row) => row.wbRawApiSpendFact)),
        statMetric('Дельта API / контроль, ₽', 'money', 'контрольный расход минус сырой API-расход', 'WB API audit', (row) => firstDefined(row, ['wbIuAdsRawApiDelta', 'wbIuAdsApiDelta']), (rows) => sumBy(rows, (row) => firstDefined(row, ['wbIuAdsRawApiDelta', 'wbIuAdsApiDelta'])))
      ];
    }
    if (platform === 'ozon') {
      const ozonSpend = (row) => row.spendFactOzon;
      return [
        statMetric('GMV Ozon, ₽', 'money', 'выручка / продажи − возвраты', 'Ozon realization', (row) => row.revenueOzon || row.ozonGmv, (rows) => sumBy(rows, (row) => row.revenueOzon || row.ozonGmv), { tone: '#72e6a0' }),
        statMetric('GMV gross, ₽', 'money', 'GMV до вычета возвратов', 'Ozon realization', (row) => row.ozonGmvGross, (rows) => sumBy(rows, (row) => row.ozonGmvGross)),
        statMetric('Возвраты GMV, ₽', 'money', 'возвраты, вычитаемые из GMV', 'Ozon realization', (row) => row.ozonReturns, (rows) => sumBy(rows, (row) => row.ozonReturns), { tone: '#ff746f' }),
        statMetric('План GMV, ₽', 'money', 'план GMV Ozon на дату', 'corporate plan', (row) => row.targetRevenueOzon, (rows) => sumBy(rows, (row) => row.targetRevenueOzon)),
        statMetric('Выполнение GMV, %', 'pct', 'GMV / план GMV', 'Ozon realization', (row) => row.revenueOzonCompletionPct, (rows) => ratioBy(rows, (row) => row.revenueOzon || row.ozonGmv, (row) => row.targetRevenueOzon), { goodHigh: true, tone: '#72e6a0' }),
        statMetric('Расходы рекламы, ₽', 'money', 'Finance balance расход − исключения', 'Ozon Finance', ozonSpend, (rows) => sumBy(rows, ozonSpend), { tone: '#59a9ff' }),
        statMetric('Gross расход, ₽', 'money', 'полный расход до исключений', 'Ozon Finance', (row) => row.ozonDrrSpendGross, (rows) => sumBy(rows, (row) => row.ozonDrrSpendGross)),
        statMetric('Исключено из ДРР, ₽', 'money', 'Premium Plus + Бейдж Оригинал', 'Ozon Finance', (row) => row.ozonDrrExcludedTotal, (rows) => sumBy(rows, (row) => row.ozonDrrExcludedTotal), { tone: '#ff746f' }),
        statMetric('План рекламы, ₽', 'money', 'план рекламного бюджета Ozon', 'corporate plan', (row) => row.planSpendOzon, (rows) => sumBy(rows, (row) => row.planSpendOzon)),
        statMetric('ДРР Ozon, %', 'pct', 'расходы рекламы / GMV', 'Ozon Finance', (row) => row.factPctOzon, (rows) => ratioBy(rows, ozonSpend, (row) => row.revenueOzon || row.ozonGmv), { goodLow: true, tone: '#ff746f' }),
        statMetric('Целевой ДРР, %', 'pct', 'план рекламы / план GMV', 'corporate plan', (row) => row.planPctOzon, (rows) => ratioBy(rows, (row) => row.planSpendOzon, (row) => row.targetRevenueOzon)),
        statMetric('Показы рекламы, шт', 'int', 'показы Ozon Ads', 'Ozon Ads API', (row) => row.ozonAdsViews, (rows) => sumBy(rows, (row) => row.ozonAdsViews)),
        statMetric('Клики рекламы, шт', 'int', 'клики Ozon Ads', 'Ozon Ads API', (row) => row.ozonAdsClicks, (rows) => sumBy(rows, (row) => row.ozonAdsClicks)),
        statMetric('CTR рекламы, %', 'pct', 'клики / показы', 'Ozon Ads API', (row) => safeRatio(row.ozonAdsClicks, row.ozonAdsViews), (rows) => ratioBy(rows, (row) => row.ozonAdsClicks, (row) => row.ozonAdsViews)),
        statMetric('CPC, ₽', 'money', 'расходы рекламы / клики', 'Ozon Ads API', (row) => safeRatio(ozonSpend(row), row.ozonAdsClicks), (rows) => safeRatio(sumBy(rows, ozonSpend), sumBy(rows, (row) => row.ozonAdsClicks))),
        statMetric('Заказы рекламы, шт', 'int', 'заказы Ozon Ads', 'Ozon Ads API', (row) => row.ozonAdsOrders, (rows) => sumBy(rows, (row) => row.ozonAdsOrders)),
        statMetric('CPO, ₽', 'money', 'расходы рекламы / заказы рекламы', 'Ozon Ads API', (row) => safeRatio(ozonSpend(row), row.ozonAdsOrders), (rows) => safeRatio(sumBy(rows, ozonSpend), sumBy(rows, (row) => row.ozonAdsOrders))),
        statMetric('Выручка рекламы, ₽', 'money', 'revenue Ozon Ads', 'Ozon Ads API', (row) => row.ozonAdsRevenue, (rows) => sumBy(rows, (row) => row.ozonAdsRevenue), { tone: '#72e6a0' }),
        statMetric('ROMI рекламы, %', 'pct', 'выручка рекламы / расходы рекламы', 'Ozon Ads API', (row) => safeRatio(row.ozonAdsRevenue, ozonSpend(row)), (rows) => ratioBy(rows, (row) => row.ozonAdsRevenue, ozonSpend), { goodHigh: true }),
        statMetric('API-витрина audit, ₽', 'money', 'сырая витринная API-выручка для контроля', 'Ozon raw API audit', (row) => row.revenueOzonApiRaw, (rows) => sumBy(rows, (row) => row.revenueOzonApiRaw)),
        statMetric('Finance rows, шт', 'int', 'строки Finance balance, попавшие в расчет', 'Ozon Finance', (row) => row.ozonFinanceSourceRows, (rows) => sumBy(rows, (row) => row.ozonFinanceSourceRows))
      ];
    }
    return [
      statMetric('Оборот Я.Маркета, ₽', 'money', 'оборот из funnel-источника Я.Маркета', 'Yandex funnel', (row) => row.revenueYandex, (rows) => sumBy(rows, (row) => row.revenueYandex), { tone: '#72e6a0' }),
      statMetric('План оборота, ₽', 'money', 'план оборота Я.Маркета', 'corporate plan', (row) => row.targetRevenueYandex, (rows) => sumBy(rows, (row) => row.targetRevenueYandex)),
      statMetric('Выполнение, %', 'pct', 'оборот / план оборота', 'Yandex funnel', (row) => row.revenueYandexCompletionPct, (rows) => ratioBy(rows, (row) => row.revenueYandex, (row) => row.targetRevenueYandex), { goodHigh: true, tone: '#72e6a0' }),
      statMetric('Показы, шт', 'int', 'показы из funnel-источника', 'Yandex funnel', (row) => row.yandexShows, (rows) => sumBy(rows, (row) => row.yandexShows)),
      statMetric('Клики, шт', 'int', 'клики из funnel-источника', 'Yandex funnel', (row) => row.yandexClicks, (rows) => sumBy(rows, (row) => row.yandexClicks)),
      statMetric('CTR, %', 'pct', 'клики / показы', 'Yandex funnel', (row) => row.yandexCtr ?? safeRatio(row.yandexClicks, row.yandexShows), (rows) => ratioBy(rows, (row) => row.yandexClicks, (row) => row.yandexShows)),
      statMetric('Добавления в корзину, шт', 'int', 'to cart из funnel-источника', 'Yandex funnel', (row) => row.yandexToCart, (rows) => sumBy(rows, (row) => row.yandexToCart)),
      statMetric('CR в корзину, %', 'pct', 'корзины / клики', 'Yandex funnel', (row) => row.yandexCartRate ?? safeRatio(row.yandexToCart, row.yandexClicks), (rows) => ratioBy(rows, (row) => row.yandexToCart, (row) => row.yandexClicks)),
      statMetric('Заказы, шт', 'int', 'заказы из funnel-источника', 'Yandex funnel', (row) => row.ordersUnitsYandex, (rows) => sumBy(rows, (row) => row.ordersUnitsYandex)),
      statMetric('CR в заказ, %', 'pct', 'заказы / клики', 'Yandex funnel', (row) => row.yandexOrderRate ?? safeRatio(row.ordersUnitsYandex, row.yandexClicks), (rows) => ratioBy(rows, (row) => row.ordersUnitsYandex, (row) => row.yandexClicks)),
      statMetric('Выкупы, шт', 'int', 'доставленные единицы', 'Yandex funnel', (row) => row.deliveredUnitsYandex, (rows) => sumBy(rows, (row) => row.deliveredUnitsYandex)),
      statMetric('Процент выкупа, %', 'pct', 'выкупы / заказы', 'Yandex funnel', (row) => row.yandexBuyoutRate ?? safeRatio(row.deliveredUnitsYandex, row.ordersUnitsYandex), (rows) => ratioBy(rows, (row) => row.deliveredUnitsYandex, (row) => row.ordersUnitsYandex)),
      statMetric('Средний чек, ₽', 'money', 'оборот / заказы', 'Yandex funnel', (row) => safeRatio(row.revenueYandex, row.ordersUnitsYandex), (rows) => safeRatio(sumBy(rows, (row) => row.revenueYandex), sumBy(rows, (row) => row.ordersUnitsYandex))),
      statMetric('Возвраты, шт', 'int', 'возвраты из funnel-источника', 'Yandex funnel', (row) => row.yandexReturnsUnits, (rows) => sumBy(rows, (row) => row.yandexReturnsUnits), { tone: '#ff746f' }),
      statMetric('Отмены, шт', 'int', 'отмены из funnel-источника', 'Yandex funnel', (row) => row.yandexCancellationsUnits, (rows) => sumBy(rows, (row) => row.yandexCancellationsUnits), { tone: '#ff746f' }),
      statMetric('Source rows, шт', 'int', 'строки источника Я.Маркета', 'Yandex funnel', (row) => row.yandexSourceRows, (rows) => sumBy(rows, (row) => row.yandexSourceRows))
    ];
  }

  function statCellStatus(metric, value) {
    const num = numberOrNull(value);
    if (num === null) return 'missing';
    if (metric.goodHigh) return num >= 1 ? 'ok' : num >= 0.9 ? 'warn' : 'bad';
    if (metric.goodLow) return num <= 1 ? 'ok' : num <= 1.08 ? 'warn' : 'bad';
    return 'ok';
  }

  function heatCell(value, type, values, tone) {
    const num = numberOrNull(value);
    const max = values.reduce((highest, current) => {
      const parsed = Math.abs(numberOrZero(current));
      return parsed > highest ? parsed : highest;
    }, 0);
    const heat = num === null || !max ? 0 : Math.max(7, Math.min(48, 8 + (Math.abs(num) / max) * 40));
    const style = num === null
      ? ''
      : `style="--platform:${tone};background:linear-gradient(90deg,color-mix(in srgb,var(--platform) ${heat.toFixed(0)}%,transparent),rgba(255,255,255,.018))"`;
    return `<td class="iu-drr-v3-heat-cell" ${style}>${metricCell(value, type)}</td>`;
  }

  function buildStatsHeatmap(platform, rows) {
    const metrics = platformStatsMetrics(platform);
    const dates = rows.map((row) => row.date);
    const tableWidth = Math.max(1450, 450 + dates.length * 92);
    const body = metrics.map((metric) => {
      const values = rows.map((row) => metric.cell(row));
      const summary = metric.total(rows);
      const status = values.some((value) => numberOrNull(value) !== null) ? 'ok' : 'missing';
      const search = rowSearch([PLATFORM[platform]?.label, metric.label, metric.calc, metric.source, ...dates, ...values]);
      return `
        <tr ${tableRowAttrs({ search, source: sourceBucket(metric.source), status, date: '' })}>
          <td><strong>${escapeHtml(metric.label)}</strong><span class="iu-drr-v3-source">${escapeHtml(metric.source)}</span></td>
          <td class="iu-drr-v3-calc">${escapeHtml(metric.calc)}</td>
          <td>${metricCell(summary, metric.type)}</td>
          ${values.map((value) => heatCell(value, metric.type, values, metric.tone || PLATFORM[platform]?.tone || '#e5c16f')).join('')}
        </tr>
      `;
    }).join('');
    return `
      <div class="iu-drr-v3-matrix-wrap">
        <table class="iu-drr-v3-table iu-drr-v3-heatmap" style="min-width:${tableWidth}px">
          <thead>
            <tr>
              <th>Метрика</th>
              <th>Расчет</th>
              <th>Итого / среднее</th>
              ${dates.map((date) => `<th>${escapeHtml(compactDate(date))}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function buildStatsLongTable(platform, rows) {
    const metrics = platformStatsMetrics(platform);
    const tableKey = safeTableKey('stats-detail', platform);
    const body = [];
    rows.forEach((row) => {
      const baseSource = platformStatsSource(row, platform);
      metrics.forEach((metric) => {
        const value = metric.cell(row);
        const status = statCellStatus(metric, value);
        const source = `${baseSource} · ${metric.source}`;
        const search = rowSearch([
          PLATFORM[platform]?.label,
          row.date,
          compactDate(row.date),
          metric.label,
          metric.calc,
          source,
          fmtMetric(value, metric.type),
          value
        ]);
        body.push(`
          <tr ${tableRowAttrs({ search, source: sourceBucket(source), status, date: row.date })}>
            <td><strong>${escapeHtml(compactDate(row.date))}</strong><span class="iu-drr-v3-source">${escapeHtml(row.date)}</span></td>
            <td>${escapeHtml(metric.label)}<span class="iu-drr-v3-source">${escapeHtml(metric.source)}</span></td>
            <td><span class="iu-drr-v3-note">${escapeHtml(metric.calc)}</span></td>
            <td>${metricCell(value, metric.type)}</td>
            <td>${metricCell(metric.total(rows), metric.type)}</td>
            <td><span class="iu-drr-v3-note">${escapeHtml(source)}</span></td>
          </tr>
        `);
      });
    });
    return `
      <div class="iu-drr-v3-table-host" data-iu-v3-table-host="${escapeHtml(tableKey)}">
        ${tableFilterMarkup(tableKey, body.length)}
        <div class="iu-drr-v3-matrix-wrap" style="max-height:520px">
          <table class="iu-drr-v3-table" style="min-width:1180px">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Метрика</th>
                <th>Расчет</th>
                <th>Значение дня</th>
                <th>Итог / среднее</th>
                <th>Источник</th>
              </tr>
            </thead>
            <tbody>
              ${body.join('')}
              <tr class="iu-drr-v3-empty-row" data-iu-v3-empty-row hidden><td colspan="6">Нет строк под выбранный фильтр</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function buildStatsSummaryCards(platform, rows) {
    const total = platformMonthSummary(platform, rows);
    const ctr = safeRatio(total.clicks, total.views);
    const cpc = safeRatio(total.adsFact, total.clicks);
    const orderBase = total.orders || total.units;
    const cpo = safeRatio(total.adsFact, orderBase);
    const cards = [
      kpiCard(`${PLATFORM[platform]?.label} оборот`, fmtMoney(total.revenueFact), `план ${fmtMoney(total.revenuePlan)} · выполнение ${fmtPct(total.revenueCompletion)}`, total.revenueCompletion, toneForCompletion(total.revenueCompletion)),
      kpiCard('Расход рекламы', fmtMoney(total.adsFact), `план ${fmtMoney(total.adsPlan)} · ДРР ${fmtPct(total.drrFact)}`, pctValue(total.adsFact, total.adsPlan), toneForCompletion(pctValue(total.adsFact, total.adsPlan), true)),
      kpiCard('Показы / клики', `${fmtInt(total.views)} / ${fmtInt(total.clicks)}`, `CTR ${fmtPct(ctr)} · CPC ${fmtMoney(cpc)}`, ctr, PLATFORM[platform]?.tone),
      kpiCard('Заказы / CPO', `${fmtInt(orderBase)} / ${fmtMoney(cpo)}`, `ad revenue ${fmtMoney(total.adRevenue)}`, safeRatio(total.adRevenue, total.adsFact), '#72e6a0'),
      kpiCard('Строки источника', fmtInt(total.sourceRows), platform === 'ozon' ? `исключено ${fmtMoney(total.exclusions)}` : `единиц ${fmtInt(total.units)}`, Math.min(1, numberOrZero(total.sourceRows) / 1000), '#e5c16f')
    ];
    return `<div class="iu-drr-v3-kpis">${cards.join('')}</div>`;
  }

  function buildStatsPanel(rows, focus) {
    const platforms = platformsForFocus(focus, { includeYandex: true });
    if (!platforms.length) return `<div class="iu-drr-v3-empty">Нет площадок для текущего фильтра.</div>`;
    return platforms.map((platform) => section(
      `stats-${platform}`,
      `${PLATFORM[platform].label} · Статистика`,
      'Расходы, показы, клики, CTR, CPC, заказы, оборот, ДРР и контрольные источники по дням. Матрица собрана из тех же API/файлов, что расчет ИУ / ДРР.',
      `
        <div class="iu-drr-v3-stat-pack">
          ${buildStatsSummaryCards(platform, rows)}
          <p class="iu-drr-v3-stat-caption">
            <b>Матрица как в кабинете:</b> строка — метрика, столбец — день, цвет показывает относительную плотность значения внутри строки.
            <b>Ниже:</b> те же значения в фильтруемой таблице для сверки источника, даты и формулы.
            <b>Обновление:</b> новый день появляется автоматически после пересборки data/iu_drr_summary.json, без ручного списка дат в интерфейсе.
          </p>
          ${buildStatsHeatmap(platform, rows)}
          ${buildStatsLongTable(platform, rows)}
        </div>
      `,
      { platform }
    )).join('');
  }

  function monthSelectHtml(payload, monthKey) {
    const options = monthOptions(payload);
    return `
      <select id="iuDrrV3Month" class="iu-drr-v3-control" aria-label="Месяц ИУ / ДРР">
        ${options.map((key) => `<option value="${escapeHtml(key)}" ${key === monthKey ? 'selected' : ''}>${escapeHtml(monthLabel(key))}</option>`).join('')}
      </select>
    `;
  }

  function renderSkeleton(root) {
    root.dataset.alteaIuDrrV3 = 'loading';
    root.innerHTML = `
      <section class="iu-drr-v3-shell">
        <div class="iu-drr-v3-empty">Подключаю фактические источники ИУ / ДРР v3. Демонстрационные цифры из макета не используются.</div>
      </section>
    `;
  }

  function renderIuDrrV3(rootId = 'view-iu-drr') {
    const root = document.getElementById(rootId);
    if (!root) return;
    ensureStyle();
    const payload = getPayload();
    const hasPayload = Array.isArray(payload.daily) && payload.daily.length;
    const sources = getSources();
    const hasPositionSource = Boolean(sources.leaderboard || sources.skuMatrix || sources.wbFunnel);
    if (!hasPayload || !hasPositionSource) {
      renderSkeleton(root);
      loadSupplementalData(rootId);
      if (!hasPayload && typeof window.reloadIuDrrSummaryFromFile === 'function') {
        try { window.reloadIuDrrSummaryFromFile(rootId); } catch (_) {}
      }
      return;
    }

    root.dataset.alteaIuDrrV3 = 'ready';
    const focus = getGlobalMarketplaceFocus();
    const monthKey = selectedMonth(payload);
    const rows = rowsForMonth(payload, monthKey);
    const view = currentView();
    const positions = buildPositions(focus);
    const panelContent = {
      iu: buildIuPanel(rows, focus),
      position: buildPositionPanel(rows, focus, positions),
      daily: buildDailyPanel(rows, focus, positions),
      stats: buildStatsPanel(rows, focus)
    };
    const panels = VIEW_KEYS.map((key) => `
      <section class="iu-drr-v3-panel" id="iu-drr-v3-panel-${key}" data-iu-v3-panel="${key}" role="tabpanel" aria-labelledby="iu-drr-v3-tab-${key}" ${key === view ? '' : 'hidden inert aria-hidden="true"'}>
        ${key === view ? panelContent[key] : ''}
      </section>
    `).join('');
    root.innerHTML = `
      <section class="iu-drr-v3-shell iu-drr-v3-focus-${escapeHtml(focus)}" data-iu-drr-version="${escapeHtml(VERSION)}">
        <div class="iu-drr-v3-head">
          <div>
            <p class="iu-drr-v3-eyebrow">ALTEA · IU/DRR POSITION FUNNEL V3</p>
            <h2 class="iu-drr-v3-title">ИУ / ДРР и воронка по каждой позиции</h2>
            <p class="iu-drr-v3-lead">Визуальный слой заменен целиком: WB и Ozon остаются в ИУ, Я.Маркет — только воронка. Формулы сборки не меняются, источники и отсутствующие значения показаны явно.</p>
          </div>
          <div class="iu-drr-v3-badges">
            <span class="iu-drr-v3-badge">фокус ${escapeHtml(focus === 'all' ? 'все площадки' : PLATFORM[focus]?.label || focus)}</span>
            <span class="iu-drr-v3-badge">срез ${escapeHtml(payload.asOfDate || monthKey)}</span>
            <span class="iu-drr-v3-badge">${escapeHtml(fmtInt(positions.length))} SKU</span>
          </div>
        </div>
        <div class="iu-drr-v3-toolbar">
          ${monthSelectHtml(payload, monthKey)}
          <div class="iu-drr-v3-tabs" role="tablist" aria-label="Раздел ИУ / ДРР">
            ${[
              ['iu', 'ИУ по дням'],
              ['position', 'Позиционная воронка'],
              ['daily', 'Дневная матрица'],
              ['stats', 'Статистика']
            ].map(([key, label]) => `
              <button id="iu-drr-v3-tab-${key}" class="iu-drr-v3-tab" type="button" role="tab" data-iu-v3-view="${key}" aria-controls="iu-drr-v3-panel-${key}" aria-selected="${key === view ? 'true' : 'false'}">${escapeHtml(label)}</button>
            `).join('')}
          </div>
          <input id="iuDrrV3Search" class="iu-drr-v3-search" value="${escapeHtml(currentSearch())}" placeholder="Поиск SKU, owner, артикул..." aria-label="Поиск SKU">
          <div class="iu-drr-v3-lock">Площадка берется только из общего селектора портала. Локального marketplace-фильтра здесь нет.</div>
        </div>
        ${buildHeroKpis(rows, focus, positions)}
        ${panels}
      </section>
    `;
    syncPanels(root, view);
    bindEvents(root, rootId);
  }

  function bindEvents(root, rootId) {
    root.querySelector('#iuDrrV3Month')?.addEventListener('change', (event) => {
      const state = appState();
      state.iuDrrFilters = state.iuDrrFilters || {};
      state.iuDrrFilters.month = String(event.target.value || 'latest');
      renderIuDrrV3(rootId);
    });
    root.querySelector('#iuDrrV3Search')?.addEventListener('input', (event) => {
      setCurrentSearch(event.target.value);
      renderIuDrrV3(rootId);
    });
    root.querySelectorAll('[data-iu-v3-view]').forEach((button) => {
      button.addEventListener('click', () => {
        setCurrentView(button.getAttribute('data-iu-v3-view'));
        renderIuDrrV3(rootId);
      });
    });
    root.querySelectorAll('[data-iu-v3-position]').forEach((button) => {
      button.addEventListener('click', () => {
        setCurrentSelectedPosition(button.getAttribute('data-iu-v3-position'));
        renderIuDrrV3(rootId);
      });
    });
    root.querySelectorAll('[data-iu-v3-collapse]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-iu-v3-collapse');
        const sectionEl = root.querySelector(`[data-iu-v3-section="${CSS.escape(key)}"]`);
        const content = sectionEl?.querySelector('.iu-drr-v3-collapsible');
        const nextOpen = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        button.firstChild.nodeValue = nextOpen ? 'Скрыть ' : 'Открыть ';
        sectionEl?.classList.toggle('is-collapsed', !nextOpen);
        if (content) content.hidden = !nextOpen;
        setSectionOpen(key, nextOpen);
      });
    });
    bindTableFilters(root);
  }

  function rerenderIfActive() {
    const root = document.getElementById('view-iu-drr');
    const routeActive = (location.hash || '').includes('iu-drr') || root?.offsetParent !== null;
    if (root && routeActive) renderIuDrrV3('view-iu-drr');
  }

  window.renderIuDrr = renderIuDrrV3;
  try { globalThis.renderIuDrr = renderIuDrrV3; } catch (_) {}
  window.AlteaIuDrrPositionFunnelV3 = { render: renderIuDrrV3, version: VERSION };

  document.addEventListener('altea:marketplacechange', rerenderIfActive);
  window.addEventListener('hashchange', rerenderIfActive);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rerenderIfActive, { once: true });
  } else {
    rerenderIfActive();
  }
})();
