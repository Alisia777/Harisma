(function () {
  if (window.__ALTEA_COMPANY_PLAN_LIVEFIX_20260507A__) return;
  window.__ALTEA_COMPANY_PLAN_LIVEFIX_20260507A__ = true;

  const PLAN = Object.freeze({
    monthKey: '2026-05',
    monthLabel: 'май 2026',
    asOfDate: '2026-05-06',
    asOfLabel: '06.05',
    days: 31,
    revenue: 291518549,
    factRevenueToDate: 41103033,
    planRevenueToDate: 56422944.97,
    completionToDate: 0.7285,
    completionFullMonth: 0.1410,
    forecastRevenue: 212365670.5,
    forecastPct: 0.7285,
    channels: {
      all: { label: 'Все площадки', revenue: 291518549 },
      wb: { label: 'WB', revenue: 179525953 },
      ozon: { label: 'Ozon', revenue: 103407638 },
      ya: { label: 'Я.Маркет', revenue: 8584958 }
    }
  });

  const PLATFORM_KEYS = ['all', 'wb', 'ozon', 'ya', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit'];
  const LIVEFIX_VIEWS = new Set(['dashboard', 'executive']);
  let applyTimer = 0;
  let applying = false;

  function stateRef() {
    return window.__alteaAppState || window.state || null;
  }

  function hasProtectedSalaryPlan(state) {
    const plan = state?.dashboard?.companyPlan;
    return plan?.planType === 'marketplace_salary_revenue'
      || Boolean(state?.dashboard?.dataFreshness?.salaryPlanLoadedAt && plan?.months?.['2026-06']);
  }

  function activePortalView() {
    const state = stateRef();
    if (state?.activeView) return String(state.activeView);
    const active = document.querySelector('.view.active');
    return active ? String(active.id || '').replace(/^view-/, '') : '';
  }

  function livefixIsRelevant(event) {
    const view = activePortalView();
    if (LIVEFIX_VIEWS.has(view)) return true;
    const target = event?.target;
    return Boolean(target?.closest?.('#view-dashboard,#view-executive'));
  }

  function num(value) {
    const parsed = typeof value === 'string'
      ? Number(value.replace(/\s+/g, '').replace(',', '.'))
      : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return cleanDate(value);
    const text = String(value).trim();
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    const ruMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (ruMatch) return new Date(Number(ruMatch[3]), Number(ruMatch[2]) - 1, Number(ruMatch[1]));
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : cleanDate(parsed);
  }

  function cleanDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, days) {
    const next = cleanDate(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function iso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function enumerateDates(start, end) {
    const rows = [];
    for (let cursor = cleanDate(start); cursor <= end; cursor = addDays(cursor, 1)) rows.push(cursor);
    return rows;
  }

  function anchorDate(state) {
    return parseDate(state?.platformTrends?.asOfDate)
      || parseDate(state?.dashboard?.dataFreshness?.asOfDate)
      || parseDate(PLAN.asOfDate)
      || cleanDate(new Date());
  }

  function resolveSeriesDate(point, anchor) {
    const direct = parseDate(point?.date) || parseDate(point?.label);
    if (direct) return direct;
    const offset = Number(point?.dayOffset);
    if (!Number.isFinite(offset)) return null;
    return addDays(anchor, -offset);
  }

  function seriesFor(platformKey, state) {
    const record = (state?.platformTrends?.platforms || []).find((item) => item?.key === platformKey);
    const anchor = anchorDate(state);
    return (record?.series || [])
      .map((point) => ({
        date: resolveSeriesDate(point, anchor),
        units: num(point?.units),
        revenue: num(point?.revenue)
      }))
      .filter((point) => point.date instanceof Date && !Number.isNaN(point.date.getTime()))
      .sort((left, right) => left.date - right.date);
  }

  function selectedRange(state) {
    const startInput = document.querySelector('[data-portal-exec-start]');
    const endInput = document.querySelector('[data-portal-exec-end]');
    const stored = state?.uiHotfix?.dashboardRange || {};
    const start = parseDate(startInput?.value) || parseDate(stored.start) || addDays(anchorDate(state), -6);
    const end = parseDate(endInput?.value) || parseDate(stored.end) || anchorDate(state);
    if (start <= end) return { start, end };
    return { start: end, end: start };
  }

  function plannedDates(range) {
    return enumerateDates(range.start, range.end).filter((date) => monthKey(date) === PLAN.monthKey);
  }

  function factsFor(platformKey, state, range) {
    const channel = PLAN.channels[platformKey];
    if (!channel) return { allUnits: 0, planRevenueFact: 0, planRevenue: 0, completion: 0, plannedDayCount: 1 };
    const byDate = new Map(seriesFor(platformKey, state).map((point) => [iso(point.date), point]));
    const allDates = enumerateDates(range.start, range.end);
    const planDates = plannedDates(range);
    const allUnits = allDates.reduce((sum, date) => sum + num(byDate.get(iso(date))?.units), 0);
    const planRevenueFact = planDates.reduce((sum, date) => sum + num(byDate.get(iso(date))?.revenue), 0);
    const planRevenue = channel.revenue / PLAN.days * Math.max(1, planDates.length);
    const completion = planRevenue > 0 ? planRevenueFact / planRevenue : 0;
    return { allUnits, planRevenueFact, planRevenue, completion, plannedDayCount: Math.max(1, planDates.length) };
  }

  function existingPlanUnitsForDate(platformKey, state, date) {
    const month = state?.platformPlan?.months?.[monthKey(date)];
    const days = num(month?.days) || new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const units = num(month?.platforms?.[platformKey]?.units);
    return days > 0 ? units / days : 0;
  }

  function ensureCompanyPlan(state) {
    if (!state?.dashboard) return;
    if (hasProtectedSalaryPlan(state)) return;
    const activeMonth = {
      monthKey: PLAN.monthKey,
      label: PLAN.monthLabel,
      days: PLAN.days,
      revenue: PLAN.revenue,
      dailyRevenue: PLAN.revenue / PLAN.days,
      channels: {
        wb: { label: 'WB', revenue: PLAN.channels.wb.revenue, dailyRevenue: PLAN.channels.wb.revenue / PLAN.days },
        ozon: { label: 'Ozon', revenue: PLAN.channels.ozon.revenue, dailyRevenue: PLAN.channels.ozon.revenue / PLAN.days },
        ya: { label: 'Я.Маркет', revenue: PLAN.channels.ya.revenue, dailyRevenue: PLAN.channels.ya.revenue / PLAN.days }
      }
    };
    state.dashboard.companyPlan = {
      generatedAt: '2026-05-07T16:45:00+03:00',
      sourceWorkbook: 'План А.xlsx',
      sourceSheet: '00_Источник_плана',
      planType: 'company_revenue',
      note: 'Company revenue plan. IU WB/Ozon remains separate.',
      activeMonth,
      months: { [PLAN.monthKey]: activeMonth }
    };
    Object.assign(state.dashboard, {
      asOfDate: PLAN.asOfDate,
      company_plan_month_key: PLAN.monthKey,
      company_plan_month_label: PLAN.monthLabel,
      company_plan_revenue: PLAN.revenue,
      company_fact_revenue_to_date: PLAN.factRevenueToDate,
      company_plan_to_date_revenue: PLAN.planRevenueToDate,
      company_plan_completion_to_date_pct: PLAN.completionToDate,
      company_plan_completion_month_pct: PLAN.completionFullMonth,
      company_forecast_revenue: PLAN.forecastRevenue,
      company_forecast_pct: PLAN.forecastPct,
      company_plan_source: 'План А.xlsx :: 00_Источник_плана | общий план компании'
    });
  }

  function patchPlatformPlan(state) {
    if (!state?.platformPlan?.months) return false;
    if (hasProtectedSalaryPlan(state)) return false;
    const range = selectedRange(state);
    const mayDates = plannedDates(range);
    if (!mayDates.length) return false;
    const may = state.platformPlan.months[PLAN.monthKey] || { label: PLAN.monthLabel, days: PLAN.days, platforms: {} };
    may.days = PLAN.days;
    may.platforms = may.platforms || {};
    PLATFORM_KEYS.forEach((key) => {
      const channel = PLAN.channels[key];
      const facts = factsFor(key, state, range);
      if (!channel || facts.completion <= 0 || facts.allUnits <= 0) return;
      const planUnitsForRange = facts.allUnits / facts.completion;
      const extraPlanUnits = enumerateDates(range.start, range.end)
        .filter((date) => monthKey(date) !== PLAN.monthKey)
        .reduce((sum, date) => sum + existingPlanUnitsForDate(key, state, date), 0);
      const monthUnits = Math.max(0, (planUnitsForRange - extraPlanUnits) / facts.plannedDayCount * PLAN.days);
      may.platforms[key] = {
        ...(may.platforms[key] || {}),
        label: channel.label,
        units: monthUnits,
        dailyUnits: monthUnits / PLAN.days,
        source: 'План А.xlsx · revenue-normalized livefix'
      };
    });
    state.platformPlan.months[PLAN.monthKey] = may;
    return true;
  }

  function applyLivefix(scheduleRender) {
    if (applying) return;
    if (!livefixIsRelevant()) return;
    const state = stateRef();
    if (!state) return;
    if (hasProtectedSalaryPlan(state)) return;
    applying = true;
    try {
      ensureCompanyPlan(state);
      const patched = patchPlatformPlan(state);
      if (scheduleRender && patched && window.__ALTEA_DASHBOARD_INTERACTIVE_API__?.applyNow) {
        window.__ALTEA_DASHBOARD_INTERACTIVE_API__.applyNow(false).catch(() => {});
      }
    } finally {
      applying = false;
    }
  }

  function schedule(scheduleRender) {
    window.clearTimeout(applyTimer);
    applyTimer = window.setTimeout(() => applyLivefix(scheduleRender), 80);
  }

  function boot() {
    if (livefixIsRelevant()) applyLivefix(true);
    document.addEventListener('click', (event) => { if (livefixIsRelevant(event)) schedule(true); }, true);
    document.addEventListener('change', (event) => { if (livefixIsRelevant(event)) schedule(true); }, true);
    window.addEventListener('altea:viewchange', (event) => {
      const view = String(event?.detail?.view || activePortalView());
      if (LIVEFIX_VIEWS.has(view)) schedule(true);
    });
    window.setInterval(() => { if (livefixIsRelevant()) applyLivefix(false); }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
