(function () {
  if (window.__ALTEA_LIVE_LAZY_HOTFIXES_20260521__) return;
  window.__ALTEA_LIVE_LAZY_HOTFIXES_20260521__ = true;

  const RENDER_BUDGET_SRC = 'portal-live-render-budget.js?v=20260521budget1';
  const LAUNCH_BUDGET_SRC = 'portal-live-launch-budget.js?v=20260521launchbudget2';
  const TABLE_BUDGET_SRC = 'portal-live-table-budget.js?v=20260521tablebudget3';
  const BUDGET_VIEWS = new Set([
    'sku-plan-fact',
    'prices',
    'sku-contour',
    'skus',
    'launch-control',
    'ads-funnel',
    'order',
    'repricer',
    'launches'
  ]);
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
    launches: [],
    'launch-control': [],
    'ads-funnel': [],
    'iu-drr': ['workflow', 'polish'],
    'wb-rating': ['polish'],
    'product-leaderboard': [],
    repricer: ['repricer'],
    'sku-plan-fact': ['planFact'],
    'sku-contour': ['planFact'],
    'oos-control': [],
    skus: ['skus']
  };

  const SIDEBAR_LABELS = {
    'oos-control': {
      title: 'OOS \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c',
      subtitle: '\u0410\u0443\u0442\u044b \u00b7 \u043f\u043e\u0442\u0435\u0440\u0438 \u00b7 \u043c\u0435\u0440\u044b'
    }
  };

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
      setText(button.querySelector('span'), label.title);
      setText(button.querySelector('small'), label.subtitle);
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
      script.onerror = () => reject(new Error(`\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c ${src}`));
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
    if (!BUDGET_VIEWS.has(String(view || ''))) return Promise.resolve();
    return loadScript(RENDER_BUDGET_SRC)
      .then(() => loadScript(LAUNCH_BUDGET_SRC))
      .then(() => loadScript(TABLE_BUDGET_SRC))
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
    syncSidebarLabels();
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
