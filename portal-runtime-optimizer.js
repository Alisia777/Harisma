(function () {
if (window.__ALTEA_RUNTIME_OPTIMIZER_20260505A__) return;
window.__ALTEA_RUNTIME_OPTIMIZER_20260505A__ = true;
window.__ALTEA_RUNTIME_OPTIMIZER_20260503D__ = true;
window.__ALTEA_RUNTIME_OPTIMIZER_20260503C__ = true;
window.__ALTEA_RUNTIME_OPTIMIZER_20260503B__ = true;
window.__ALTEA_RUNTIME_OPTIMIZER_20260503A__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260502A__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260429E__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260429D__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260429C__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260429A__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260428J__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260428I__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260428H__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260428G__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260428F__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260428E__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260428D__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260428C__ = true;
  window.__ALTEA_RUNTIME_OPTIMIZER_20260428B__ = true;
  window.__ALTEA_PRICE_SIMPLE_RUNTIME_MODE__ = true;

  const BUNDLE_MAP = {
    order: [],
    prices: [
      'portal-price-local-fetch-bypass-hotfix.js?v=20260428a',
      'portal-price-workbench-runtime-loader.js?v=20260518minmaxqueue1',
      'portal-team-reconnect-hotfix.js?v=20260515a'
    ]
  };

  const VIEW_TO_BUNDLE = {
    order: 'order',
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
    launches: 'Продукт / новинки',
    'product-leaderboard': 'Продуктовый лидерборд',
    'launch-control': 'Запуск новинок',
    meetings: 'Ритм работы',
    executive: 'Руководителю'
  };

  const VIEW_TO_DATA_KEY = {
    control: 'launches',
    executive: 'launches',
    launches: 'launches',
    'launch-control': 'launches',
    meetings: 'meetings',
    documents: 'documents'
  };

  const RESUME_REFRESH_MIN_INTERVAL_MS = 60000;
  const HEAVY_VIEW_RESUME_SKIP = new Set(['repricer', 'executive', 'control']);

  const DEFERRED_DATA = {
    launches: {
      path: 'data/launches.json',
      fallback: [],
      label: 'Продукт / новинки',
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
    }
  };

  const deferredPathMap = Object.fromEntries(
    Object.entries(DEFERRED_DATA).map(([key, config]) => [config.path, { key, fallback: config.fallback }])
  );
  const JSON_REQUEST_VERSION = String(window.__ALTEA_JSON_VERSION__ || '20260505a').trim() || '20260505a';
  window.__ALTEA_JSON_VERSION__ = JSON_REQUEST_VERSION;
  const deferredReady = Object.fromEntries(Object.keys(DEFERRED_DATA).map((key) => [key, false]));
  const deferredLoads = new Map();
  const scriptPromises = new Map();
  const bundlePromises = new Map();
  const readyBundles = new Set();
  const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

  if (originalFetch && typeof window.__ALTEA_BASE_FETCH__ !== 'function') {
    window.__ALTEA_BASE_FETCH__ = originalFetch;
  }

  let hasUserNavigation = false;
  let hasBooted = false;
  let deferredRefreshGeneration = 0;
  let lastResumeRefreshAt = 0;
  let resumeRefreshPromise = null;
  let resumeRefreshTimer = null;

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

  function shouldRewritePortalJson(path) {
    return /^data\/.+\.json$/i.test(path) || /^tmp-[^/]+\.json$/i.test(path);
  }

  function rewriteStaticJsonVersion(input, path) {
    if (!JSON_REQUEST_VERSION || !shouldRewritePortalJson(path)) return input;
    try {
      const raw = typeof input === 'string' ? input : input?.url || '';
      const url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin) return input;
      url.searchParams.set('v', JSON_REQUEST_VERSION);
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

  function invalidateDeferredData() {
    deferredRefreshGeneration += 1;
    Object.keys(deferredReady).forEach((key) => {
      deferredReady[key] = false;
    });
    deferredLoads.clear();
  }

  window.__alteaInvalidateDeferredData = invalidateDeferredData;

  function refreshSnapshotBackedStateOnResume(reason = 'resume') {
    if (document.hidden) return Promise.resolve(false);
    if (resumeRefreshPromise) return resumeRefreshPromise;
    const now = Date.now();
    if (now - lastResumeRefreshAt < RESUME_REFRESH_MIN_INTERVAL_MS) return Promise.resolve(false);
    lastResumeRefreshAt = now;

    const activeView = getActiveView();
    if (HEAVY_VIEW_RESUME_SKIP.has(activeView) && !window.__ALTEA_FORCE_HEAVY_RESUME_REFRESH__) {
      return Promise.resolve(false);
    }
    const deferredKey = VIEW_TO_DATA_KEY[activeView] || '';
    invalidateDeferredData();

    if (typeof window.__alteaResetPortalSnapshotState === 'function') {
      try {
        window.__alteaResetPortalSnapshotState();
      } catch (error) {
        console.warn('[portal-runtime-optimizer] reset snapshot cache', error);
      }
    }

    const refreshFn = typeof window.__alteaRefreshSnapshotBackedState === 'function'
      ? window.__alteaRefreshSnapshotBackedState
      : null;

    resumeRefreshPromise = Promise.resolve()
      .then(() => (refreshFn ? refreshFn({ rerender: false }) : false))
      .then((changed) => {
        if (deferredKey) {
          handleDeferredView(activeView);
        } else {
          safeRerender();
        }
        return changed;
      })
      .catch((error) => {
        console.warn('[portal-runtime-optimizer] resume refresh', reason, error);
        return false;
      })
      .finally(() => {
        resumeRefreshPromise = null;
      });

    return resumeRefreshPromise;
  }

  function scheduleResumeRefresh(reason = 'resume') {
    if (!hasBooted || document.hidden) return;
    if (resumeRefreshTimer) window.clearTimeout(resumeRefreshTimer);
    resumeRefreshTimer = window.setTimeout(() => {
      resumeRefreshTimer = null;
      void refreshSnapshotBackedStateOnResume(reason);
    }, 80);
  }

  function forceActivateView(view) {
    if (!view) return;
    if (typeof setView === 'function') {
      setView(view);
      return;
    }
    if (typeof state === 'object' && state) state.activeView = view;
    document.querySelectorAll('.nav-btn').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
    document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
    window.dispatchEvent(new CustomEvent('altea:viewchange', { detail: { view } }));
    safeRerender();
  }

  function markBundleReady(bundleKey) {
    if (bundleKey) readyBundles.add(bundleKey);
  }

  function loadBundleForView(view) {
    const bundleKey = bundleKeyForView(view);
    if (!bundleKey || readyBundles.has(bundleKey)) return Promise.resolve();
    if (bundlePromises.has(bundleKey)) return bundlePromises.get(bundleKey);

    let chain = Promise.resolve();
    (BUNDLE_MAP[bundleKey] || []).forEach((src) => {
      chain = chain.then(() => loadScript(src));
    });

    const promise = chain
      .then(() => {
        markBundleReady(bundleKey);
        if (bundleKeyForView(getActiveView()) === bundleKey) safeRerender();
      })
      .catch((error) => {
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
    const generation = deferredRefreshGeneration;

    const promise = Promise.resolve()
      .then(async () => {
        window.__ALTEA_ALLOW_REAL_DEFERRED_FETCH__ = true;
        try {
          const payload = await loadJsonOrFallback(config.path, config.fallback, config.label);
          if (generation !== deferredRefreshGeneration) return;
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
        if (deferredLoads.get(key) === promise) deferredLoads.delete(key);
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

  function warmCurrentView() {
    const boot = () => {
      const activeView = getActiveView();
      loadBundleForView(activeView);
      handleDeferredView(activeView);
      hasBooted = true;
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      boot();
      return;
    }

    document.addEventListener('DOMContentLoaded', boot, { once: true });
    window.addEventListener('load', boot, { once: true });
  }

  installDeferredFetch();
  bindNavigation();
  warmCurrentView();
  window.addEventListener('focus', () => scheduleResumeRefresh('focus'));
  window.addEventListener('pageshow', (event) => {
    if (event?.persisted) scheduleResumeRefresh('pageshow');
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleResumeRefresh('visibilitychange');
  });
})();
