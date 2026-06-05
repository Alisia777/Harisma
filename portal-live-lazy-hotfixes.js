(function () {
  if (window.__ALTEA_LIVE_LAZY_HOTFIXES_20260521__) return;
  window.__ALTEA_LIVE_LAZY_HOTFIXES_20260521__ = true;

  const RENDER_BUDGET_SRC = 'portal-live-render-budget.js?v=20260603novelties-noise1';
  const LAUNCH_BUDGET_SRC = 'portal-live-launch-budget.js?v=20260603novelties-noise1';
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
      'portal-dashboard-interactive-hotfix.js?v=20260603exportaudit2'
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

  const SIDEBAR_LABELS = {};
  /*
  const SIDEBAR_LABELS_OLD = {
    'iu-drr': {
      title: 'РџРѕРєР°Р·Р°С‚РµР»Рё РїР»РѕС‰Р°РґРѕРє',
      subtitle: 'WB В· Ozon В· РїР»Р°РЅ-С„Р°РєС‚'
    },
    'oos-control': {
      title: 'OOS РєРѕРЅС‚СЂРѕР»СЊ',
      subtitle: 'РђСѓС‚С‹ В· РїРѕС‚РµСЂРё В· РјРµСЂС‹'
    }
  };

  */

  const scriptPromises = new Map();
  let renderBudgetRerenderScheduled = false;

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
      script.onerror = () => reject(new Error(`РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ ${src}`));
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
    if (view === 'iu-drr') installIuDrrOzonFallback();
    const bundleKeys = VIEW_BUNDLES[view] || [];
    let chain = loadRenderBudget(view);
    bundleKeys.forEach((bundleKey) => {
      chain = chain.then(() => loadBundle(bundleKey));
    });
    return chain.then(() => {
      syncSidebarLabels();
      if (options.rerender !== false && typeof rerenderCurrentView === 'function') {
        rerenderCurrentView();
      }
    }).catch((error) => console.warn('[portal-live-lazy-hotfixes]', view, error));
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

  window.addEventListener('altea:viewchange', (event) => {
    syncSidebarLabels();
    scheduleForView(event.detail && event.detail.view);
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
