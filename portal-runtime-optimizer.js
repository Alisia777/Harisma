(function () {
  if (window.__ALTEA_RUNTIME_OPTIMIZER_20260425A__) return;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260425A__ = true;

  const BUNDLE_MAP = {
    dashboard: [
      'portal-dashboard-interactive-hotfix.js?v=20260422e',
      'portal-dashboard-prime-hotfix-20260422e.js?v=20260422e'
    ],
    order: ['portal-order-logistics-hotfix.js?v=20260421g'],
    launches: [
      'portal-launch-month-filter-hotfix.js?v=20260422c',
      'portal-launch-manager-hotfix.js?v=20260422c'
    ],
    prices: [
      'portal-price-workbench-simple-live.js?v=20260425a',
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
  const VIEW_TITLES = {
    dashboard: '\u0414\u0430\u0448\u0431\u043e\u0440\u0434',
    documents: '\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b',
    repricer: '\u0420\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440',
    prices: '\u0426\u0435\u043d\u044b',
    order: '\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a\u0430 \u0438 \u0437\u0430\u043a\u0430\u0437',
    control: '\u0417\u0430\u0434\u0430\u0447\u0438',
    skus: '\u0420\u0435\u0435\u0441\u0442\u0440 SKU',
    launches: '\u041f\u0440\u043e\u0434\u0443\u043a\u0442 / \u041a\u0441\u0435\u043d\u0438\u044f',
    'launch-control': '\u0417\u0430\u043f\u0443\u0441\u043a \u043d\u043e\u0432\u0438\u043d\u043e\u043a',
    meetings: '\u0420\u0438\u0442\u043c \u0440\u0430\u0431\u043e\u0442\u044b',
    executive: '\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e'
  };
  const VIEW_TO_DATA_KEY = {
    launches: 'launches',
    'launch-control': 'launches',
    meetings: 'meetings',
    documents: 'documents',
    repricer: 'repricer'
  };
  const DEFERRED_DATA = {
    launches: {
      path: 'data/launches.json',
      fallback: [],
      label: '\u041f\u0440\u043e\u0434\u0443\u043a\u0442 / \u041a\u0441\u0435\u043d\u0438\u044f',
      assign(value) {
        state.launches = Array.isArray(value) ? value : [];
      }
    },
    meetings: {
      path: 'data/meetings.json',
      fallback: [],
      label: '\u0420\u0438\u0442\u043c \u0440\u0430\u0431\u043e\u0442\u044b',
      assign(value) {
        state.meetings = Array.isArray(value) ? value : [];
      }
    },
    documents: {
      path: 'data/documents.json',
      fallback: { groups: [] },
      label: '\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b',
      assign(value) {
        state.documents = value || { groups: [] };
      }
    },
    repricer: {
      path: 'data/repricer.json',
      fallback: { generatedAt: '', summary: {}, rows: [] },
      label: '\u0420\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440',
      assign(value) {
        state.repricer = value || { generatedAt: '', summary: {}, rows: [] };
      }
    }
  };

  const deferredPathMap = Object.fromEntries(
    Object.entries(DEFERRED_DATA).map(([key, config]) => [config.path, { key, fallback: config.fallback }])
  );
  const deferredReady = Object.fromEntries(Object.keys(DEFERRED_DATA).map((key) => [key, false]));
  const deferredLoads = new Map();
  const scriptPromises = new Map();
  const bundlePromises = new Map();
  const readyBundles = new Set();
  const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  let hasUserNavigation = false;

  function getActiveView() {
    if (typeof state === 'object' && state && state.activeView) return state.activeView;
    const activeSection = document.querySelector('.view.active');
    return activeSection ? String(activeSection.id || '').replace(/^view-/, '') : 'dashboard';
  }

  function bundleKeyForView(view) {
    return VIEW_TO_BUNDLE[view] || '';
  }

  function normalizeFetchPath(input) {
    try {
      const target = typeof input === 'string' ? input : input?.url || '';
      const url = new URL(target, window.location.href);
      return url.pathname.replace(/^\//, '');
    } catch {
      return '';
    }
  }

  function buildJsonResponse(payload) {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function installDeferredFetch() {
    if (!originalFetch || window.__ALTEA_DEFERRED_FETCH_INSTALLED__) return;
    window.__ALTEA_DEFERRED_FETCH_INSTALLED__ = true;
    window.fetch = function optimizedFetch(input, init) {
      const path = normalizeFetchPath(input);
      const deferred = deferredPathMap[path];
      if (deferred && !window.__ALTEA_ALLOW_REAL_DEFERRED_FETCH__) {
        return Promise.resolve(buildJsonResponse(deferred.fallback));
      }
      return originalFetch(input, init);
    };
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
      script.onerror = () => reject(new Error(`\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c ${src}`));
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

  function renderDeferredLoading(view) {
    const root = document.getElementById(`view-${view}`);
    if (!root) return;
    const title = VIEW_TITLES[view] || '\u042d\u043a\u0440\u0430\u043d';
    const statusChip = typeof badge === 'function' ? badge('\u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0430', 'info') : '';
    root.innerHTML = `
      <div class="card">
        <div class="head">
          <div>
            <h3>${title}</h3>
            <div class="muted small">\u041f\u043e\u0434\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0434\u0430\u043d\u043d\u044b\u0435 \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0430, \u0447\u0442\u043e\u0431\u044b \u0441\u0442\u0430\u0440\u0442 \u043f\u043e\u0440\u0442\u0430\u043b\u0430 \u043d\u0435 \u0432\u0438\u0441\u0435\u043b.</div>
          </div>
          ${statusChip}
        </div>
      </div>
    `;
  }

  async function loadDeferredData(key, requestedView) {
    if (!key || deferredReady[key]) return;
    if (deferredLoads.has(key)) return deferredLoads.get(key);
    const config = DEFERRED_DATA[key];
    if (!config || typeof loadJsonOrFallback !== 'function') return;

    const promise = Promise.resolve()
      .then(async () => {
        window.__ALTEA_ALLOW_REAL_DEFERRED_FETCH__ = true;
        try {
          const payload = await loadJsonOrFallback(config.path, config.fallback, config.label);
          config.assign(payload);
          deferredReady[key] = true;
        } finally {
          window.__ALTEA_ALLOW_REAL_DEFERRED_FETCH__ = false;
        }
      })
      .then(() => {
        if (getActiveView() === requestedView) safeRerender();
      })
      .catch((error) => {
        console.warn('[portal-runtime-optimizer] deferred-data', key, error);
        if (typeof renderViewFailure === 'function' && getActiveView() === requestedView) {
          renderViewFailure(`view-${requestedView}`, VIEW_TITLES[requestedView] || config.label, error);
        }
        if (typeof setAppError === 'function') {
          setAppError(`\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u0433\u0440\u0443\u0437\u0438\u0442\u044c ${config.label}: ${error.message}`);
        }
      })
      .finally(() => {
        deferredLoads.delete(key);
      });

    deferredLoads.set(key, promise);
    return promise;
  }

  function handleDeferredView(view) {
    const key = VIEW_TO_DATA_KEY[view];
    if (!key || deferredReady[key]) return;
    renderDeferredLoading(view);
    void loadDeferredData(key, view);
  }

  function bindNavigation() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.nav-btn[data-view]');
      if (!button) return;
      hasUserNavigation = true;
      loadBundleForView(button.dataset.view);
    }, true);

    window.addEventListener('altea:viewchange', (event) => {
      const view = event.detail?.view;
      if (!view) return;
      if (view === 'dashboard' && !hasUserNavigation) return;
      loadBundleForView(view);
      handleDeferredView(view);
    });
  }

  function warmInitialDashboard() {
    const start = () => {
      if (getActiveView() !== 'dashboard') return;
      loadBundleForView('dashboard');
    };
    const delayedStart = () => window.setTimeout(start, 120);
    if (document.readyState === 'complete') {
      delayedStart();
      return;
    }
    window.addEventListener('load', delayedStart, { once: true });
    window.setTimeout(start, 2200);
  }

  installDeferredFetch();
  bindNavigation();
  warmInitialDashboard();
})();
