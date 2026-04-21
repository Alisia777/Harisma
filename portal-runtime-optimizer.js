(function () {
  if (window.__ALTEA_RUNTIME_OPTIMIZER_20260421J__) return;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260421J__ = true;

  const BUNDLE_MAP = {
    dashboard: [
      'portal-dashboard-interactive-hotfix.js?v=20260420n',
      'portal-dashboard-rop-task-hotfix.js?v=20260420d'
    ],
    order: ['portal-order-logistics-hotfix.js?v=20260421g'],
    launches: ['portal-launch-control-hotfix.js?v=20260421e'],
    prices: [
      'portal-price-workbench-simple-live.js?v=20260420p',
      'portal-team-reconnect-hotfix.js?v=20260420a'
    ]
  };
  const VIEW_TO_BUNDLE = {
    dashboard: 'dashboard',
    order: 'order',
    launches: 'launches',
    'launch-control': 'launches',
    prices: 'prices'
  };
  const scriptPromises = new Map();
  const bundlePromises = new Map();
  const readyBundles = new Set();
  let hasUserNavigation = false;

  function getActiveView() {
    if (typeof state === 'object' && state && state.activeView) return state.activeView;
    const activeSection = document.querySelector('.view.active');
    return activeSection ? String(activeSection.id || '').replace(/^view-/, '') : 'dashboard';
  }

  function bundleKeyForView(view) {
    return VIEW_TO_BUNDLE[view] || '';
  }

  function loadScript(src) {
    if (!src) return Promise.resolve();
    if (scriptPromises.has(src)) return scriptPromises.get(src);

    const baseSrc = src.split('?')[0];
    const existing = Array.from(document.scripts || []).find((script) => String(script.src || '').includes(baseSrc));
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

  function safeRerender() {
    try {
      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    } catch (error) {
      console.warn('[portal-runtime-optimizer] rerender', error);
    }
  }

  function markBundleReady(bundleKey) {
    readyBundles.add(bundleKey);
    if (bundleKey === 'launches') readyBundles.add('launch-control');
  }

  function loadBundleForView(view) {
    const bundleKey = bundleKeyForView(view);
    if (!bundleKey || readyBundles.has(bundleKey)) return Promise.resolve();
    if (bundlePromises.has(bundleKey)) return bundlePromises.get(bundleKey);

    let chain = Promise.resolve();
    (BUNDLE_MAP[bundleKey] || []).forEach((src) => {
      chain = chain.then(() => loadScript(src));
    });

    const promise = chain.then(() => {
      markBundleReady(bundleKey);
      if (bundleKeyForView(getActiveView()) === bundleKey) safeRerender();
    }).catch((error) => {
      console.warn('[portal-runtime-optimizer] bundle', bundleKey, error);
    });

    bundlePromises.set(bundleKey, promise);
    return promise;
  }

  function scheduleIdleBundle(view, timeoutMs) {
    const run = () => loadBundleForView(view);
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: timeoutMs || 1500 });
      return;
    }
    window.setTimeout(run, timeoutMs || 1200);
  }

  function bindNavigation() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.nav-btn[data-view]');
      if (!button) return;
      hasUserNavigation = true;
      loadBundleForView(button.dataset.view);
    }, true);

    document.querySelectorAll('.nav-btn[data-view]').forEach((button) => {
      if (button.dataset.portalRuntimeOptimizerBound === '1') return;
      button.dataset.portalRuntimeOptimizerBound = '1';
      button.addEventListener('mouseenter', () => {
        const bundleKey = bundleKeyForView(button.dataset.view);
        if (!bundleKey || readyBundles.has(bundleKey)) return;
        scheduleIdleBundle(button.dataset.view, 1000);
      });
    });

    window.addEventListener('altea:viewchange', (event) => {
      const view = event.detail?.view;
      if (!view) return;
      if (view === 'dashboard' && !hasUserNavigation) return;
      loadBundleForView(view);
    });
  }

  function bindRemoteButtons() {
    ['pullRemoteBtn', 'pushRemoteBtn'].forEach((id) => {
      const button = document.getElementById(id);
      if (!button || button.dataset.portalRuntimeRemoteBound === '1') return;
      button.dataset.portalRuntimeRemoteBound = '1';
      button.addEventListener('click', () => scheduleIdleBundle('prices', 400));
    });
  }

  bindNavigation();
  bindRemoteButtons();
})();
