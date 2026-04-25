(function () {
  if (window.__ALTEA_RUNTIME_OPTIMIZER_20260425O__) return;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260425O__ = true;

  const BUNDLE_MAP = {
    dashboard: [
      'portal-dashboard-interactive-hotfix.js?v=20260423a',
      'portal-dashboard-prime-hotfix-20260422e.js?v=20260422e'
    ],
    order: ['portal-order-logistics-hotfix.js?v=20260425a'],
    launches: [
      'portal-launch-month-filter-hotfix.js?v=20260422c',
      'portal-launch-manager-hotfix.js?v=20260422c'
    ],
    prices: [
      'portal-price-snapshot-fastpath-hotfix.js?v=20260425c',
      'portal-price-workbench-runtime-loader.js?v=20260425e',
      'portal-price-overlay-bridge-hotfix.js?v=20260425f',
      'portal-price-turnover-order-fallback-hotfix.js?v=20260425a',
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
    dashboard: 'Дашборд',
    documents: 'Документы',
    repricer: 'Репрайсер',
    prices: 'Цены',
    order: 'Логистика и заказ',
    control: 'Задачи',
    skus: 'Реестр SKU',
    launches: 'Продукт / Ксения',
    'launch-control': 'Запуск новинок',
    meetings: 'Ритм работы',
    executive: 'Руководителю'
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
      label: 'Продукт / Ксения',
      assign(value) {
        state.launches = Array.isArray(value) ? value : [];
      }
    },
    meetings: {
      path: 'data/meetings.json',
      fallback: [],
      label: 'Ритм работы',
      assign(value) {
        state.meetings = Array.isArray(value) ? value : [];
      }
    },
    documents: {
      path: 'data/documents.json',
      fallback: { groups: [] },
      label: 'Документы',
      assign(value) {
        state.documents = value || { groups: [] };
      }
    },
    repricer: {
      path: 'data/repricer.json',
      fallback: { generatedAt: '', summary: {}, rows: [] },
      label: 'Репрайсер',
      assign(value) {
        state.repricer = value || { generatedAt: '', summary: {}, rows: [] };
      }
    }
  };

  const deferredPathMap = Object.fromEntries(
    Object.entries(DEFERRED_DATA).map(([key, config]) => [config.path, { key, fallback: config.fallback }])
  );
  const FORCED_JSON_VERSION = {
    'data/dashboard.json': '20260423a'
  };
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

  function rewriteStaticJsonVersion(input, path) {
    const forcedVersion = FORCED_JSON_VERSION[path];
    if (!forcedVersion) return input;
    try {
      const raw = typeof input === 'string' ? input : input?.url || '';
      const url = new URL(raw, window.location.href);
      url.searchParams.set('v', forcedVersion);
      return url.toString();
    } catch {
      return input;
    }
  }

  function installDeferredFetch() {
    if (!originalFetch || window.__ALTEA_DEFERRED_FETCH_INSTALLED__) return;
    window.__ALTEA_DEFERRED_FETCH_INSTALLED__ = true;
    window.fetch = function optimizedFetch(input, init) {
      const path = normalizeFetchPath(input);
      const rewrittenInput = rewriteStaticJsonVersion(input, path);
      const deferred = deferredPathMap[path];
      if (deferred && !window.__ALTEA_ALLOW_REAL_DEFERRED_FETCH__) {
        return Promise.resolve(buildJsonResponse(deferred.fallback));
      }
      return originalFetch(rewrittenInput, init);
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
      script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
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

  function forceActivateView(view) {
    if (!view) return;
    if (typeof setView === 'function') {
      setView(view);
      return;
    }
    if (typeof state === 'object' && state) state.activeView = view;
    document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
    document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
    window.dispatchEvent(new CustomEvent('altea:viewchange', { detail: { view } }));
    safeRerender();
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
    const title = VIEW_TITLES[view] || 'Экран';
    const statusChip = typeof badge === 'function' ? badge('загрузка', 'info') : '';
    root.innerHTML = `
      <div class="card">
        <div class="head">
          <div>
            <h3>${title}</h3>
            <div class="muted small">Подгружаем данные только для этого раздела, чтобы старт портала не висел.</div>
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
          setAppError(`Не удалось подгрузить ${config.label}: ${error.message}`);
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
      const requestedView = button.dataset.view;
      hasUserNavigation = true;
      loadBundleForView(requestedView);
      window.setTimeout(() => {
        const activeViewId = document.querySelector('.view.active')?.id || '';
        const activeNav = document.querySelector('.nav-btn.active')?.dataset?.view || '';
        if (activeViewId === `view-${requestedView}` && activeNav === requestedView) return;
        forceActivateView(requestedView);
      }, 60);
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
