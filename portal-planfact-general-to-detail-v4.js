(function () {
  'use strict';

  if (window.__ALTEA_PLANFACT_GENERAL_TO_DETAIL_V4__) return;
  window.__ALTEA_PLANFACT_GENERAL_TO_DETAIL_V4__ = true;

  const ROOT_ID = 'view-sku-plan-fact';
  const STORE_KEY = 'altea.planFact.generalToDetail.v4';
  const VERSION = '20260622-planfact-gtd-v4';
  const MODES = [
    ['general', 'Общее'],
    ['lfl', 'Like-for-like'],
    ['team', 'Кто'],
    ['sku', 'Артикулы']
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
  let suppressEnhance = false;

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
    return { mode: 'general' };
  }

  function setMode(mode) {
    const next = MODES.some(([key]) => key === mode) ? mode : 'general';
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...modeState(), mode: next })); } catch (_) {}
  }

  function activeMode() {
    return modeState().mode || 'general';
  }

  function buildModel() {
    const builder = window.skuPlanFactBuildModel || (typeof skuPlanFactBuildModel === 'function' ? skuPlanFactBuildModel : null);
    if (typeof builder !== 'function') return null;
    try { return builder(); } catch (error) {
      console.warn('[planfact-v4:model]', error);
      return null;
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

  function dailyNumber(item, keys) {
    for (const key of keys) {
      const parsed = numberOrNull(item?.[key]);
      if (parsed !== null) return parsed;
    }
    return 0;
  }

  function buildDaily(views, model) {
    const map = new Map();
    const periodStart = String(model?.periodStart || model?.monthStart || '').slice(0, 10);
    const periodEnd = String(model?.periodEnd || model?.selectedDate || model?.maxFactDate || '').slice(0, 10);
    views.forEach((view) => {
      const daily = rowDailySource(view);
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
          kzCost: 0
        };
        current.fact += dailyNumber(item, ['factRevenue', 'revenue', 'sales', 'turnover', 'amount', 'fact', 'value']);
        current.plan += dailyNumber(item, ['planRevenue', 'plan', 'planToDateRevenue']);
        current.reach += dailyNumber(item, ['reach', 'views', 'impressions']);
        current.clicks += dailyNumber(item, ['clicks']);
        current.carts += dailyNumber(item, ['carts', 'toCart', 'cartAdds']);
        current.orders += dailyNumber(item, ['orders', 'ordered']);
        current.buys += dailyNumber(item, ['buys', 'purchases', 'buyouts']);
        current.kzRevenue += dailyNumber(item, ['kzRevenue', 'attributedRevenue', 'contentRevenue']);
        current.kzCost += dailyNumber(item, ['kzCost', 'contentCost', 'cost']);
        map.set(date, current);
      });
    });
    const days = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
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

  function renderDailyChart(days) {
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

  function renderBody(model) {
    const views = visibleRows(model).map((row) => rowMetricView(row, model));
    const mode = activeMode();
    if (mode === 'lfl') return renderLfl(model, views);
    if (mode === 'team') return renderTeam(model, views);
    if (mode === 'sku') return renderSkuMode(model, views);
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
            <span>Общее → LFL → Кто → Артикул</span>
            <h2>План-факт SKU: от результата к строке</h2>
            <p>Источник правды — текущая модель портала. Верхний блок объясняет результат, полная таблица по артикулам остается ниже.</p>
          </div>
          <div class="pf-v4-tabs" role="tablist">${tabs}</div>
        </div>
        <div class="pf-v4-body">${renderBody(model)}</div>
      </section>
    `;
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
      #${ROOT_ID} .pf-v4-daily-table table{width:100%;min-width:900px;border-collapse:collapse}
      #${ROOT_ID} .pf-v4-daily-table th,#${ROOT_ID} .pf-v4-daily-table td{padding:9px 10px;border-bottom:1px solid rgba(219,199,163,.1);text-align:right;font-size:12px}
      #${ROOT_ID} .pf-v4-daily-table th{position:sticky;top:0;background:#15120f;color:var(--pf-v4-faint);font-size:10px;text-transform:uppercase}.pf-v4-daily-table td:first-child,.pf-v4-daily-table th:first-child{text-align:left}
      #${ROOT_ID} .pf-v4-row-active{outline:1px solid rgba(240,210,145,.5);outline-offset:-1px}
      @keyframes pfV4In{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @keyframes pfV4Bar{from{width:0}}
      @keyframes pfV4Column{from{transform:scaleY(.04);opacity:.18}}
      @media(max-width:1350px){#${ROOT_ID} .pf-v4-kpis,#${ROOT_ID} .pf-v4-platform-grid,#${ROOT_ID} .pf-v4-owner-grid,#${ROOT_ID} .pf-v4-lfl-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}#${ROOT_ID} .pf-v4-split{grid-template-columns:1fr}}
      @media(max-width:760px){#${ROOT_ID} .pf-v4-head{display:grid}#${ROOT_ID} .pf-v4-tabs{overflow:auto}#${ROOT_ID} .pf-v4-kpis,#${ROOT_ID} .pf-v4-platform-grid,#${ROOT_ID} .pf-v4-owner-grid,#${ROOT_ID} .pf-v4-lfl-tiles,#${ROOT_ID} .pf-v4-drawer-grid,#${ROOT_ID} .pf-v4-funnel{grid-template-columns:1fr}#${ROOT_ID} .pf-v4-team-table button{grid-template-columns:1fr}#${ROOT_ID} .pf-v4-team-table b,#${ROOT_ID} .pf-v4-team-table em,#${ROOT_ID} .pf-v4-team-table small{text-align:left}}
      @media(prefers-reduced-motion:reduce){#${ROOT_ID} .pf-v4 *{animation:none!important;transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function metricCard(label, value) {
    return `<div class="pf-v4-drawer-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function drawerDailyRows(view, model) {
    const daily = buildDaily([view], model);
    if (daily.length) return daily;
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
      kzCost: 0
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
          <thead><tr><th>Дата</th><th>План</th><th>Факт</th><th>Охват</th><th>Клики</th><th>Корзины</th><th>Заказы</th><th>Выкупы</th><th>КЗ выручка</th><th>КЗ расход</th></tr></thead>
          <tbody>
            ${days.map((day) => `
              <tr>
                <td>${escapeHtml(shortDate(day.date))}</td>
                <td>${escapeHtml(fmtMoney(day.plan))}</td>
                <td>${escapeHtml(fmtMoney(day.fact))}</td>
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
    if (typeof baseRenderSkuPlanFact !== 'function') return;
    suppressEnhance = true;
    try {
      baseRenderSkuPlanFact(ROOT_ID, { force: true });
    } finally {
      suppressEnhance = false;
    }
    enhance();
  }

  function bind(rootNode) {
    if (!rootNode || rootNode.dataset.pfV4Bound === '1') return;
    rootNode.dataset.pfV4Bound = '1';
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
    if (!model) return;
    host.querySelector('.pf-v1-kpis')?.remove();
    host.querySelector('.pf-v1-platform-board')?.remove();
    let mount = host.querySelector('[data-planfact-v4]');
    if (!mount) {
      const anchor = host.querySelector('.pf-v1-filter-dock') || host.querySelector('.pf-v1-head') || host.firstElementChild;
      if (anchor) anchor.insertAdjacentHTML('afterend', renderShell(model));
      else host.insertAdjacentHTML('afterbegin', renderShell(model));
    } else {
      mount.outerHTML = renderShell(model);
    }
    decorateRows(host);
  }

  function wrapRenderer() {
    const candidate = window.renderSkuPlanFact || (typeof renderSkuPlanFact === 'function' ? renderSkuPlanFact : null);
    if (typeof candidate !== 'function' || candidate.__planFactV4Wrapped) return;
    baseRenderSkuPlanFact = candidate;
    const wrapped = function renderSkuPlanFactWithV4(rootId, options) {
      const result = baseRenderSkuPlanFact.call(this, rootId || ROOT_ID, options || {});
      window.setTimeout(enhance, 0);
      return result;
    };
    wrapped.__planFactV4Wrapped = true;
    window.renderSkuPlanFact = wrapped;
    try { renderSkuPlanFact = wrapped; } catch (_) {}
  }

  function boot() {
    wrapRenderer();
    enhance();
    [700, 1800, 4200, 8000].forEach((delay) => window.setTimeout(enhance, delay));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener('altea:viewchange', () => window.setTimeout(boot, 0));
  window.addEventListener('hashchange', () => window.setTimeout(boot, 0));
  window.addEventListener('altea:marketplacechange', () => window.setTimeout(enhance, 0));
})();
