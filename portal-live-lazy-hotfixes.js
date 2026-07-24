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
    launches: []
  };
  const BUNDLES = {
    dashboard: [],
    control: [
      'portal-form-visual-refine.js?v=20260622layer-owner1',
      'portal-control-center-v2-hotfix.js?v=20260619task-noise3',
      'portal-control-marketplace-scope-hotfix.js?v=20260619task-noise3'
    ],
    taskKanbanV1: [
      'portal-task-kanban-v1.js?v=20260716datasignature1'
    ],
    executive: [
      'portal-executive-lite-guard.js?v=20260623executivefallback1',
      'portal-control-marketplace-scope-hotfix.js?v=20260619task-noise3',
      'portal-form-visual-refine.js?v=20260622layer-owner1'
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
      'portal-sku-plan-fact-stability-hotfix.js?v=20260724planfactcorrectness2'
    ],
    planFactV4: [
      'portal-planfact-general-to-detail-v4.js?v=20260724planfactcorrectness4'
    ],
    skus: [
      'portal-sku-registry-live-note-hotfix.js?v=20260521prod1',
      'portal-premium-polish-hotfix.js?v=20260521prod1'
    ],
    skuLaunchV1: [
      'portal-sku-launch-v1.js?v=20260709launchperf3'
    ],
    launchV1: [
      'portal-sku-launch-v1.js?v=20260709launchperf3',
      'portal-launch-autotasks-v1.js?v=20260709launchperf3'
    ],
    iuDrrV3: [
      'portal-iu-drr-position-funnel-v3.js?v=20260702iudrrlatestmonth1'
    ],
    leaderboardMotion: [
      'portal-leaderboard-motion-v2.js?v=20260627leaderboarddrawer1'
    ],
    polish: [
      'portal-premium-polish-hotfix.js?v=20260521prod1'
    ]
  };

  const VIEW_BUNDLES = {
    dashboard: ['dashboard'],
    control: ['control', 'polish', 'taskKanbanV1'],
    executive: ['executive'],
    launches: ['launchV1'],
    'launch-control': ['launchV1'],
    'ads-funnel': [],
    'iu-drr': ['iuDrrV3', 'polish'],
    'wb-rating': ['polish'],
    'product-leaderboard': ['leaderboardMotion'],
    repricer: ['repricer'],
    'sku-plan-fact': ['planFact', 'planFactV4'],
    'sku-contour': ['planFact', 'skuLaunchV1'],
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
  const viewAssetPromises = new Map();
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
      const ready = existing.dataset.alteaLazyLoading === '1'
        ? new Promise((resolve, reject) => {
          existing.addEventListener('load', () => resolve(existing), { once: true });
          existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        })
        : Promise.resolve(existing);
      scriptPromises.set(src, ready);
      return ready;
    }
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.alteaLazyLoading = '1';
      script.onload = () => {
        script.dataset.alteaLazyLoading = '0';
        script.dataset.alteaLazyLoaded = '1';
        resolve(script);
      };
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

  function loadViewAssets(view) {
    const key = String(view || '');
    if (viewAssetPromises.has(key)) return viewAssetPromises.get(key);
    if (key === 'dashboard') {
      const dashboardChain = loadRenderBudget(view);
      viewAssetPromises.set(key, dashboardChain);
      return dashboardChain;
    }
    const bundleKeys = VIEW_BUNDLES[view] || [];
    let chain = loadRenderBudget(view);
    bundleKeys.forEach((bundleKey) => {
      chain = chain.then(() => loadBundle(bundleKey));
    });
    viewAssetPromises.set(key, chain);
    return chain;
  }

  function primeDashboardHotfix() {
    if (activeView() !== 'dashboard') return;
    if (window.__ALTEA_DASHBOARD_CEO_MOTION_V1__?.render) {
      window.__ALTEA_DASHBOARD_CEO_MOTION_V1__.render();
      return;
    }
    const api = window.__ALTEA_DASHBOARD_INTERACTIVE_API__;
    if (!api) return;
    if (typeof api.hasRoot === 'function' && !api.hasRoot() && typeof api.applyNow === 'function') {
      Promise.resolve(api.applyNow(false)).catch((error) => console.warn('[portal-live-lazy-hotfixes]', 'dashboard', error));
      return;
    }
    if (typeof api.prime === 'function') api.prime(false);
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
    return loadViewAssets(view).then(() => {
      syncSidebarLabels();
      if (view === 'dashboard') {
        primeDashboardHotfix();
        return;
      }
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
        if (activeView() !== 'dashboard') return;
        if (window.__ALTEA_DASHBOARD_CEO_MOTION_V1__?.render) {
          window.__ALTEA_DASHBOARD_CEO_MOTION_V1__.render();
          return;
        }
        loadViewHotfixes('dashboard', { rerender: false });
      };
      window.setTimeout(run, 0);
      return;
    }
    if (!portalRenderApiReady()) {
      const waits = scheduleForView._coreWaits || (scheduleForView._coreWaits = {});
      const waitCount = Number(waits[view] || 0);
      if (waitCount < 24) {
        waits[view] = waitCount + 1;
        window.setTimeout(() => scheduleForView(view), 250);
      }
      return;
    }
    if (scheduleForView._coreWaits) scheduleForView._coreWaits[view] = 0;
    loadViewHotfixes(view);
  }

  function portalRenderApiReady() {
    return typeof window.rerenderCurrentView === 'function' || typeof rerenderCurrentView === 'function';
  }

  function warmPriorityViews() {
    window.__ALTEA_LIVE_LAZY_WARM_PRIORITY_VIEWS__ = true;
  }

  window.__alteaLoadLiveHotfixes = loadViewHotfixes;

  window.addEventListener('altea:viewchange', (event) => {
    syncSidebarLabels();
    scheduleForView(event.detail && event.detail.view);
  });

  syncSidebarLabels();
  window.setTimeout(syncSidebarLabels, 300);
  window.setTimeout(syncSidebarLabels, 1200);
  warmPriorityViews();

  if (requestedView()) scheduleForView(requestedView());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleForView(requestedView() || activeView()), { once: true });
  } else {
    scheduleForView(requestedView() || activeView());
  }
})();
