(function () {
  if (window.__ALTEA_LIVE_LAZY_HOTFIXES_20260521__) return;
  window.__ALTEA_LIVE_LAZY_HOTFIXES_20260521__ = true;

  const RENDER_BUDGET_SRC = 'portal-live-render-budget.js?v=20260521budget1';
  const LAUNCH_BUDGET_SRC = 'portal-live-launch-budget.js?v=20260521launchbudget1';
  const BUNDLES = {
    dashboard: [
      'portal-dashboard-calendar-stability-hotfix.js?v=20260521prod1',
      'portal-dashboard-prime-hotfix-20260422e.js?v=20260521prod1',
      'portal-dashboard-interactive-hotfix.js?v=20260521prod1'
    ],
    control: [
      'portal-control-center-v2-hotfix.js?v=20260521prod1',
      'portal-form-visual-refine.js?v=20260521prod1'
    ],
    executive: [
      'portal-executive-lite-guard.js?v=20260521prod1',
      'portal-form-visual-refine.js?v=20260521prod1'
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
      'portal-sku-plan-fact-stability-hotfix.js?v=20260521prod1'
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
    launches: ['workflow'],
    'launch-control': ['workflow'],
    'ads-funnel': ['workflow'],
    'iu-drr': ['workflow', 'polish'],
    'wb-rating': ['workflow', 'polish'],
    'product-leaderboard': ['workflow'],
    repricer: ['repricer'],
    'sku-plan-fact': ['planFact'],
    'sku-contour': ['planFact'],
    'oos-control': ['planFact'],
    skus: ['skus']
  };

  const scriptPromises = new Map();
  let renderBudgetRerenderScheduled = false;

  function existingScript(src) {
    const base = String(src || '').split('?')[0];
    return Array.from(document.scripts || []).find((script) => String(script.src || '').includes(base));
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
      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    };
    window.setTimeout(rerender, 80);
    window.setTimeout(rerender, 1200);
  }

  function loadRenderBudget() {
    return loadScript(RENDER_BUDGET_SRC)
      .then(() => loadScript(LAUNCH_BUDGET_SRC))
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

  function loadViewHotfixes(view, options = {}) {
    const bundleKeys = VIEW_BUNDLES[view] || [];
    let chain = loadRenderBudget();
    bundleKeys.forEach((bundleKey) => {
      chain = chain.then(() => loadBundle(bundleKey));
    });
    return chain.then(() => {
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

  function scheduleForView(view) {
    loadRenderBudget();
    if (!view) return;
    if (view === 'dashboard') {
      const run = () => {
        if (activeView() === 'dashboard') loadViewHotfixes('dashboard');
      };
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1800 });
      else window.setTimeout(run, 1200);
      return;
    }
    loadViewHotfixes(view);
  }

  window.__alteaLoadLiveHotfixes = loadViewHotfixes;

  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('.nav-btn[data-view]');
    if (button && button.dataset.view !== 'dashboard') loadViewHotfixes(button.dataset.view, { rerender: false });
  }, true);

  window.addEventListener('altea:viewchange', (event) => {
    scheduleForView(event.detail && event.detail.view);
  });

  loadRenderBudget();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleForView(activeView()), { once: true });
  } else {
    scheduleForView(activeView());
  }
})();