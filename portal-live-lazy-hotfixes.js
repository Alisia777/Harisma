(function () {
  if (window.__ALTEA_LIVE_LAZY_HOTFIXES_20260521__) return;
  window.__ALTEA_LIVE_LAZY_HOTFIXES_20260521__ = true;

  const RENDER_BUDGET_SRC = 'portal-live-render-budget.js?v=20260521budget1';
  const LAUNCH_BUDGET_SRC = 'portal-live-launch-budget.js?v=20260521launchbudget2';
  const TABLE_BUDGET_SRC = 'portal-live-table-budget.js?v=20260531notice2';
  const VIEW_BUDGET_SCRIPTS = {
    'sku-plan-fact': [TABLE_BUDGET_SRC],
    prices: [TABLE_BUDGET_SRC],
    'sku-contour': [TABLE_BUDGET_SRC],
    skus: [TABLE_BUDGET_SRC],
    'launch-control': [TABLE_BUDGET_SRC],
    'ads-funnel': [TABLE_BUDGET_SRC],
    order: [RENDER_BUDGET_SRC],
    repricer: [RENDER_BUDGET_SRC, LAUNCH_BUDGET_SRC],
    launches: [LAUNCH_BUDGET_SRC]
  };
  const BUNDLES = {
    dashboard: [
      'portal-dashboard-calendar-stability-hotfix.js?v=20260521prod1',
      'portal-dashboard-prime-hotfix-20260422e.js?v=20260521prod1',
      'portal-dashboard-interactive-hotfix.js?v=20260603dashboardmtd1'
    ],
    control: [
      'portal-control-center-v2-hotfix.js?v=20260529taskzya1',
      'portal-control-marketplace-scope-hotfix.js?v=20260529taskzya1',
      'portal-form-visual-refine.js?v=20260529taskfilters1'
    ],
    executive: [
      'portal-executive-lite-guard.js?v=20260530executiveowner1',
      'portal-control-marketplace-scope-hotfix.js?v=20260529taskzya1',
      'portal-form-visual-refine.js?v=20260529taskfilters1'
    ],
    workflow: [
      'portal-loyalty-system-hotfix.js?v=20260521prod1'
    ],
    repricer: [
      'portal-repricer-export-hotfix.js?v=20260521prod1'
    ],
    planFact: [
      'portal-smart-price-overlay-hotfix.js?v=20260521prod1',
      'portal-plan-alignment-hotfix.js?v=20260521prod1',
      'portal-sku-plan-fact-stability-hotfix.js?v=20260529planfactplanmetrics1'
    ],
    skus: [
      'portal-sku-registry-live-note-hotfix.js?v=20260521prod1',
      'portal-premium-polish-hotfix.js?v=20260521prod1'
    ],
    polish: [
      'portal-premium-polish-hotfix.js?v=20260521prod1'
    ]
  };

  const VIEW_BUNDLES = {
    dashboard: ['dashboard'],
    control: ['control', 'polish'],
    executive: ['executive'],
    launches: [],
    'launch-control': [],
    'ads-funnel': [],
    'iu-drr': ['polish'],
    'wb-rating': ['polish'],
    'product-leaderboard': [],
    repricer: ['repricer'],
    'sku-plan-fact': ['planFact'],
    'sku-contour': ['planFact'],
    'oos-control': [],
    skus: ['skus']
  };

  const SIDEBAR_LABELS = {
    'iu-drr': {
      title: 'Показатели площадок',
      subtitle: 'WB · Ozon · план-факт'
    },
    'oos-control': {
      title: 'OOS контроль',
      subtitle: 'Ауты · потери · меры'
    }
  };

  const scriptPromises = new Map();
  let renderBudgetRerenderScheduled = false;
  let repricerHydrationPromise = null;

  function taskKanbanOwnsControl() {
    return window.__ALTEA_TASK_KANBAN_PRIMARY__ !== false;
  }

  function renderTaskGuardShell(source = 'live-lazy-hotfixes') {
    const root = document.getElementById('view-control');
    if (typeof window.__ALTEA_TASK_KANBAN_RENDER__ === 'function') {
      window.__ALTEA_TASK_KANBAN_RENDER__();
      return;
    }
    if (typeof window.__ALTEA_RENDER_TASK_BOOT_SHELL__ === 'function') {
      window.__ALTEA_RENDER_TASK_BOOT_SHELL__(root, source);
    }
  }

  function existingScript(src) {
    const base = String(src || '').split('?')[0];
    return Array.from(document.scripts || []).find((script) => String(script.src || '').includes(base));
  }

  function setText(node, value) {
    if (node && value) node.textContent = value;
  }

  function syncSidebarLabels() {
    Object.keys(SIDEBAR_LABELS).forEach((view) => {
      const button = document.querySelector(`.nav-btn[data-view="${view}"]`);
      const label = SIDEBAR_LABELS[view];
      if (!button || !label) return;
      setText(button.querySelector('.nav-title') || button.querySelector('span:not(.nav-icon):not(.nav-copy)'), label.title);
      setText(button.querySelector('.nav-subtitle') || button.querySelector('small'), label.subtitle);
    });
  }

  function loadScript(src) {
    if (!src) return Promise.resolve();
    if (scriptPromises.has(src)) return scriptPromises.get(src);
    const existing = existingScript(src);
    if (existing) {
      const ready = Promise.resolve(existing);
      scriptPromises.set(src, ready);
      return ready;
    }
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
      (document.head || document.body || document.documentElement).appendChild(script);
    });
    scriptPromises.set(src, promise);
    return promise;
  }

  function rerenderAfterBudgetLoad() {
    if (renderBudgetRerenderScheduled) return;
    renderBudgetRerenderScheduled = true;
    const rerender = () => {
      syncSidebarLabels();
      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    };
    window.setTimeout(rerender, 80);
    window.setTimeout(rerender, 1200);
  }

  function loadRenderBudget(view) {
    syncSidebarLabels();
    const scripts = VIEW_BUDGET_SCRIPTS[String(view || '')] || [];
    if (!scripts.length) return Promise.resolve();
    let chain = Promise.resolve();
    scripts.forEach((src) => {
      chain = chain.then(() => loadScript(src));
    });
    return chain
      .then(rerenderAfterBudgetLoad)
      .catch((error) => console.warn('[portal-live-render-budget]', error));
  }

  function loadBundle(bundleKey) {
    const scripts = BUNDLES[bundleKey] || [];
    let chain = Promise.resolve();
    scripts.forEach((src) => {
      chain = chain.then(() => loadScript(src));
    });
    return chain;
  }

  function installIuDrrOzonFallback() {
    if (window.__ALTEA_IU_DRR_OZON_DAILY_FALLBACK_20260604__) return;
    const original = window.ozonPlanFactDailyRows;
    if (typeof original !== 'function') return;
    window.__ALTEA_IU_DRR_OZON_DAILY_FALLBACK_20260604__ = true;
    const num = (value) => {
      const parsed = Number(String(value ?? '').replace(/\s+/g, '').replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const daysInMonth = (monthKey) => {
      const [year, month] = String(monthKey || '').split('-').map((part) => Number(part));
      return year && month ? new Date(year, month, 0).getDate() : 0;
    };
    window.ozonPlanFactDailyRows = function patchedOzonPlanFactDailyRows(model, context = {}) {
      const rows = original(model, context);
      if (Array.isArray(rows) && rows.length) return rows;
      const selectedMonth = model?.selectedMonth || '';
      const dailyRows = (model?.payload?.daily || [])
        .filter((row) => row?.monthKey === selectedMonth)
        .filter((row) => (
          num(row.revenueOzon)
          || num(row.iuRevenueOzon)
          || num(row.iuRevenueOzonFactToDate)
          || num(row.ordersRevenueOzon)
          || num(row.spendFactOzon)
          || num(row.iuAdsFactOzonToDate)
        ))
        .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
      if (!dailyRows.length) return rows;
      const targetDrr = num(context.targetDrr || 0.25);
      const smartShare = num(context.smartShare || 0.4);
      const monthTargetGmv = num(context.monthTargetGmv);
      const dailyTargetGmv = daysInMonth(selectedMonth) > 0 ? monthTargetGmv / daysInMonth(selectedMonth) : 0;
      const dailyTargetAds = dailyTargetGmv * targetDrr;
      let cumulativeTargetGmv = 0;
      let cumulativeFactGmv = 0;
      let cumulativeTargetAds = 0;
      let cumulativeFactAds = 0;
      return dailyRows.map((row) => {
        const factGmv = num(row.revenueOzon || row.iuRevenueOzon || row.iuRevenueOzonFactToDate || row.ordersRevenueOzon);
        const factAds = num(row.spendFactOzon || row.iuAdsFactOzonToDate);
        cumulativeTargetGmv += dailyTargetGmv;
        cumulativeFactGmv += factGmv;
        cumulativeTargetAds += dailyTargetAds;
        cumulativeFactAds += factAds;
        return {
          date: row.date,
          period: `${String(row.date || '').slice(8, 10)}.${String(row.date || '').slice(5, 7)}`,
          dailyTargetGmv,
          factGmv,
          factRevenue: factGmv,
          noSppBuyouts: factGmv,
          noSppBuyoutsFact: 0,
          planDeltaGmv: factGmv - dailyTargetGmv,
          completion: dailyTargetGmv > 0 ? factGmv / dailyTargetGmv : null,
          cumulativeTargetGmv,
          cumulativeFactGmv,
          cumulativeNoSppBuyouts: cumulativeFactGmv,
          cumulativeNoSppBuyoutsFact: 0,
          cumulativeGmvDelta: cumulativeFactGmv - cumulativeTargetGmv,
          cumulativeGmvCompletion: cumulativeTargetGmv > 0 ? cumulativeFactGmv / cumulativeTargetGmv : null,
          dailyTargetAds,
          adsBoth: factAds,
          noSppAds: factAds,
          adsDeltaDaily: factAds - dailyTargetAds,
          cumulativeTargetAds,
          cumulativeFactAds,
          cumulativeNoSppAds: cumulativeFactAds,
          noSppDrr: factGmv > 0 ? factAds / factGmv : null,
          cumulativeNoSppDrr: cumulativeFactGmv > 0 ? cumulativeFactAds / cumulativeFactGmv : null,
          cumulativeAdsDelta: cumulativeFactAds - cumulativeTargetAds,
          cumulativeAdsCompletion: cumulativeTargetAds > 0 ? cumulativeFactAds / cumulativeTargetAds : null,
          targetAdsByFact: factGmv * targetDrr,
          adsReserve: factGmv * targetDrr - factAds,
          drr: factGmv > 0 ? factAds / factGmv : null,
          smartShareAds: factAds * smartShare,
          smartShareGmv: factGmv * smartShare,
          ordersUnitsOzon: Math.round(num(row.ordersUnitsOzon || row.unitsOzon)),
          deliveredUnitsOzon: Math.round(num(row.deliveredUnitsOzon)),
          financeAds: 0,
          source: 'iu_drr_daily',
          sourceLabel: 'IU/DRR daily',
          isPartial: true
        };
      });
    };
  }

  function loadViewHotfixes(view, options = {}) {
    syncSidebarLabels();
    if (taskKanbanOwnsControl() && view === 'control') {
      renderTaskGuardShell();
      return Promise.resolve();
    }
    if (view === 'iu-drr') installIuDrrOzonFallback();
    const bundleKeys = VIEW_BUNDLES[view] || [];
    const budgetScripts = VIEW_BUDGET_SCRIPTS[String(view || '')] || [];
    let chain = loadRenderBudget(view);
    bundleKeys.forEach((bundleKey) => {
      chain = chain.then(() => loadBundle(bundleKey));
    });
    return chain.then(() => {
      syncSidebarLabels();
      if (view === 'repricer') ensureRepricerDataAndRender('hotfix-load');
      if (options.rerender !== false && (bundleKeys.length || budgetScripts.length) && typeof rerenderCurrentView === 'function') {
        rerenderCurrentView();
      }
    }).catch((error) => console.warn('[portal-live-lazy-hotfixes]', view, error));
  }

  function repricerRowsReady() {
    const rows = window.__alteaAppState?.repricer?.rows || window.state?.repricer?.rows;
    if (Array.isArray(rows) && rows.length > 0) return true;
    const workbench = window.__alteaAppState?.smartPriceWorkbench || window.state?.smartPriceWorkbench || {};
    const wbRows = workbench?.platforms?.wb?.rows;
    const ozonRows = workbench?.platforms?.ozon?.rows;
    return (Array.isArray(wbRows) && wbRows.length > 0) || (Array.isArray(ozonRows) && ozonRows.length > 0);
  }

  function ensureRepricerDataAndRender(reason = 'repricer') {
    if (activeView() !== 'repricer') return;
    const render = () => {
      if (activeView() === 'repricer' && typeof window.renderRepricer === 'function') {
        window.renderRepricer();
      }
    };
    if (repricerRowsReady()) {
      render();
      return;
    }
    if (typeof window.ensureViewData !== 'function') {
      window.setTimeout(() => ensureRepricerDataAndRender(`${reason}-wait`), 500);
      return;
    }
    if (!repricerHydrationPromise) {
      repricerHydrationPromise = Promise.resolve(window.ensureViewData('repricer'))
        .catch((error) => console.warn('[portal-live-lazy-hotfixes:repricer-data]', reason, error))
        .finally(() => {
          repricerHydrationPromise = null;
        });
    }
    repricerHydrationPromise.then(render);
  }

  function activeView() {
    if (typeof state === 'object' && state && state.activeView) return String(state.activeView || '');
    const active = document.querySelector('.view.active[id^="view-"]');
    return active ? String(active.id || '').replace(/^view-/, '') : '';
  }

  function requestedView() {
    return String(window.location.hash || '').replace(/^#/, '').trim();
  }

  function scheduleForView(view) {
    syncSidebarLabels();
    if (!view) return;
    if (view === 'dashboard') {
      const run = () => {
        if (activeView() === 'dashboard') loadViewHotfixes('dashboard');
      };
      window.setTimeout(run, 0);
      return;
    }
    loadViewHotfixes(view);
  }

  window.__alteaLoadLiveHotfixes = loadViewHotfixes;

  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('.nav-btn[data-view]');
    if (button && button.dataset.view !== 'dashboard') {
      loadViewHotfixes(button.dataset.view, { rerender: false });
      if (button.dataset.view === 'repricer') {
        window.setTimeout(() => ensureRepricerDataAndRender('nav-click'), 120);
        window.setTimeout(() => ensureRepricerDataAndRender('nav-click-late'), 1600);
      }
    }
  }, true);

  window.addEventListener('altea:viewchange', (event) => {
    syncSidebarLabels();
    const view = event.detail && event.detail.view;
    scheduleForView(view);
    if (view === 'repricer') {
      window.setTimeout(() => ensureRepricerDataAndRender('viewchange'), 120);
      window.setTimeout(() => ensureRepricerDataAndRender('viewchange-late'), 1600);
    }
  });

  syncSidebarLabels();
  window.setTimeout(syncSidebarLabels, 300);
  window.setTimeout(syncSidebarLabels, 1200);

  if (requestedView()) scheduleForView(requestedView());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleForView(requestedView() || activeView()), { once: true });
  } else {
    scheduleForView(requestedView() || activeView());
  }
})();
