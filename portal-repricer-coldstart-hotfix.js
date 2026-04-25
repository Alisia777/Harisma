(function () {
  if (window.__ALTEA_REPRICER_COLDSTART_HOTFIX_20260425A__) return;
  window.__ALTEA_REPRICER_COLDSTART_HOTFIX_20260425A__ = true;

  let hydratePromise = null;
  let repricerIntentUntil = 0;
  let repricerIntentTimer = null;
  let renderEnforcerUntil = 0;
  let renderEnforcerTimer = null;

  function readBinding(name) {
    try {
      return window.eval(name);
    } catch (error) {
      return undefined;
    }
  }

  function assignBinding(name, value) {
    const slot = `__ALTEA_BINDING_PATCH_${Math.random().toString(36).slice(2, 10)}__`;
    window[slot] = value;
    try {
      window.eval(`${name} = window.${slot}`);
    } finally {
      delete window[slot];
    }
  }

  function getState() {
    return readBinding('state');
  }

  function getLazyLoaders() {
    return readBinding('LAZY_DATA_LOADERS');
  }

  function getEnsureViewData() {
    return readBinding('ensureViewData');
  }

  function getLoadJsonOrFallback() {
    return readBinding('loadJsonOrFallback');
  }

  function getLoadJson() {
    return readBinding('loadJson');
  }

  function getOptionalLoadJson() {
    return readBinding('optionalLoadJson');
  }

  function getMergeWorkbenchPayload() {
    return readBinding('mergeSmartWorkbenchPayload');
  }

  function getMergeWorkbenchOverlay() {
    return readBinding('mergeSmartWorkbenchPriceOverlay');
  }

  function getRegisterFreshnessWarning() {
    return readBinding('registerPriceFreshnessWarning');
  }

  function getRenderRepricer() {
    return readBinding('renderRepricer');
  }

  function getRerenderCurrentView() {
    return readBinding('rerenderCurrentView');
  }

  function getSetView() {
    return readBinding('setView');
  }

  function getBuildRepricerRows() {
    return readBinding('buildRepricerRows');
  }

  function hasCoreBindings() {
    return Boolean(
      getState()
      && getLazyLoaders()
      && typeof getEnsureViewData() === 'function'
      && typeof getLoadJsonOrFallback() === 'function'
    );
  }

  function appCoreReadyForRepricer() {
    const state = getState();
    return Boolean(window.__ALTEA_PRIMARY_INIT_FINISHED__ && state?.boot?.dataReady);
  }

  function cloneJson(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function normalizeArticleKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-zР°-СЏ0-9]+/gi, '');
  }

  function mergeWorkbenchPayloadCompat(primaryPayload, livePayload) {
    const mergeSmartWorkbenchPayload = getMergeWorkbenchPayload();
    if (typeof mergeSmartWorkbenchPayload === 'function') {
      return mergeSmartWorkbenchPayload(primaryPayload, livePayload);
    }

    const merged = cloneJson(primaryPayload) || { generatedAt: '', platforms: {} };
    merged.platforms = merged.platforms && typeof merged.platforms === 'object' ? merged.platforms : {};
    if (!livePayload?.platforms || typeof livePayload.platforms !== 'object') return merged;

    Object.entries(livePayload.platforms).forEach(([platform, bucket]) => {
      const nextBucket = cloneJson(merged.platforms[platform]) || {};
      Object.entries(bucket || {}).forEach(([key, value]) => {
        nextBucket[key] = cloneJson(value);
      });
      merged.platforms[platform] = nextBucket;
    });

    if (livePayload.generatedAt) {
      merged.liveEnrichmentAt = livePayload.generatedAt;
      merged.liveEnrichmentUsed = true;
    }
    return merged;
  }

  function mergeWorkbenchOverlayCompat(primaryPayload, overlayPayload) {
    const mergeSmartWorkbenchOverlay = getMergeWorkbenchOverlay();
    if (typeof mergeSmartWorkbenchOverlay === 'function') {
      return mergeSmartWorkbenchOverlay(primaryPayload, overlayPayload);
    }

    const merged = cloneJson(primaryPayload) || { generatedAt: '', platforms: {} };
    merged.platforms = merged.platforms && typeof merged.platforms === 'object' ? merged.platforms : {};
    if (!overlayPayload?.platforms || typeof overlayPayload.platforms !== 'object') return merged;

    Object.entries(overlayPayload.platforms).forEach(([platform, overlayBucket]) => {
      const baseBucket = cloneJson(merged.platforms[platform]) || {};
      const baseRows = Array.isArray(baseBucket.rows) ? baseBucket.rows : [];
      const overlayRows = Array.isArray(overlayBucket?.rows) ? overlayBucket.rows : [];
      const overlayMap = new Map();
      overlayRows.forEach((row) => {
        const key = normalizeArticleKey(row?.articleKey || row?.article);
        if (key) overlayMap.set(key, row);
      });

      const used = new Set();
      const nextRows = baseRows.map((row) => {
        const key = normalizeArticleKey(row?.articleKey || row?.article);
        const overlayRow = key ? overlayMap.get(key) : null;
        if (overlayRow) used.add(key);
        return overlayRow ? { ...row, ...cloneJson(overlayRow) } : row;
      });

      overlayRows.forEach((row) => {
        const key = normalizeArticleKey(row?.articleKey || row?.article);
        if (key && used.has(key)) return;
        nextRows.push(cloneJson(row));
      });

      Object.entries(overlayBucket || {}).forEach(([key, value]) => {
        if (key === 'rows') return;
        baseBucket[key] = cloneJson(value);
      });
      baseBucket.rows = nextRows;
      merged.platforms[platform] = baseBucket;
    });

    if (overlayPayload.generatedAt) merged.generatedAt = overlayPayload.generatedAt;
    return merged;
  }

  function optionalJson(path) {
    const optionalLoadJson = getOptionalLoadJson();
    if (typeof optionalLoadJson === 'function') return optionalLoadJson(path);
    const loadJson = getLoadJson();
    if (typeof loadJson === 'function') return loadJson(path).catch(() => null);
    return Promise.resolve(null);
  }

  function hasPlatformRows(payload) {
    const platforms = payload?.platforms;
    if (!platforms || typeof platforms !== 'object') return false;
    return Object.values(platforms).some((bucket) => {
      if (Array.isArray(bucket?.rows)) return bucket.rows.length > 0;
      if (bucket?.rows && typeof bucket.rows === 'object') {
        return Object.keys(bucket.rows).length > 0;
      }
      return false;
    });
  }

  function hasPlatformBuckets(payload) {
    const platforms = payload?.platforms;
    return Boolean(platforms && typeof platforms === 'object' && Object.keys(platforms).length);
  }

  function buildRowsCount() {
    const buildRepricerRows = getBuildRepricerRows();
    if (typeof buildRepricerRows !== 'function') return 0;
    try {
      return Number(buildRepricerRows().length || 0);
    } catch (error) {
      return 0;
    }
  }

  function repricerRowsReady() {
    const state = getState();
    return Array.isArray(state?.repricer?.rows) && state.repricer.rows.length > 0;
  }

  function markRepricerLazyReady() {
    const state = getState();
    if (!state?.boot) return;
    state.boot.lazyReady = state.boot.lazyReady || {};
    state.boot.lazyLoads = state.boot.lazyLoads || {};
    state.boot.lazyReady.repricer = true;
    delete state.boot.lazyLoads.repricer;
  }

  function repairWorkbenchState(markReady) {
    const state = getState();
    if (!state) return false;

    const basePayload = state.smartPriceWorkbenchBase;
    if (!hasPlatformRows(basePayload)) return false;

    const overlayPayload = state.smartPriceOverlay;
    const finalPayload = state.smartPriceWorkbench;
    const finalReady = hasPlatformRows(finalPayload);
    const finalBroken = !finalReady || !hasPlatformBuckets(finalPayload);
    if (finalBroken) {
      state.smartPriceWorkbench = hasPlatformBuckets(overlayPayload)
        ? mergeWorkbenchOverlayCompat(basePayload, overlayPayload)
        : cloneJson(basePayload);
    }

    const repaired = hasPlatformRows(state.smartPriceWorkbench);
    if (repaired && markReady && repricerRowsReady()) {
      markRepricerLazyReady();
    }
    return repaired;
  }

  function repricerHydrated() {
    const state = getState();
    return repricerRowsReady() && (
      hasPlatformRows(state?.smartPriceWorkbench)
      || repairWorkbenchState(true)
    );
  }

  function getActiveView() {
    const state = getState();
    if (state?.activeView) return state.activeView;
    const activeSection = document.querySelector('.view.active');
    return activeSection ? String(activeSection.id || '').replace(/^view-/, '') : 'dashboard';
  }

  function repricerRoot() {
    return document.getElementById('view-repricer');
  }

  function repricerUiReady() {
    const root = repricerRoot();
    if (!root) return false;
    return Boolean(root.querySelector('[data-repricer-export], #repricerSettingsForm, .repricer-card'));
  }

  function repricerRootNeedsHydration() {
    const root = repricerRoot();
    if (!root) return false;
    if (repricerUiReady()) return false;
    if (!root.children.length) return true;
    if (buildRowsCount() > 0) return true;
    return String(root.textContent || '').toLowerCase().includes('smart price workbench');
  }

  async function loadFullRepricerData() {
    const state = getState();
    const loadJsonOrFallback = getLoadJsonOrFallback();
    const loadJson = getLoadJson();
    const registerPriceFreshnessWarning = getRegisterFreshnessWarning();
    if (!state || (typeof loadJsonOrFallback !== 'function' && typeof loadJson !== 'function')) return;

    const loadPrimary = typeof loadJson === 'function'
      ? (path, fallback) => loadJson(path).catch(() => cloneJson(fallback))
      : (path, fallback, label) => loadJsonOrFallback(path, fallback, label);

    const previousDeferredFlag = window.__ALTEA_ALLOW_REAL_DEFERRED_FETCH__;
    window.__ALTEA_ALLOW_REAL_DEFERRED_FETCH__ = true;
    try {
      const [
        repricer,
        smartPriceWorkbench,
        smartPriceWorkbenchLive,
        smartPriceOverlay,
        repricerLive,
        prices,
        priceWorkbenchSupport
      ] = await Promise.all([
        loadPrimary('data/repricer.json', { generatedAt: '', summary: {}, rows: [] }, 'Repricer'),
        loadPrimary('data/smart_price_workbench.json', { generatedAt: '', platforms: {} }, 'Smart price workbench'),
        optionalJson('tmp-smart_price_workbench-live.json'),
        loadPrimary('data/smart_price_overlay.json', { generatedAt: '', platforms: {} }, 'Smart price overlay'),
        optionalJson('tmp-live-repricer.json'),
        loadPrimary('data/prices.json', { generatedAt: '', platforms: {} }, 'Prices'),
        loadPrimary('data/price_workbench_support.json', { generatedAt: '', platforms: {} }, 'Price workbench support')
      ]);

      state.repricer = repricer || { generatedAt: '', summary: {}, rows: [] };
      state.repricerLive = repricerLive || { generatedAt: '', rows: [] };
      state.prices = prices || { generatedAt: '', platforms: {} };
      state.priceWorkbenchSupport = priceWorkbenchSupport || { generatedAt: '', platforms: {} };
      state.smartPriceWorkbenchLive = smartPriceWorkbenchLive || { generatedAt: '', platforms: {} };
      state.smartPriceOverlay = smartPriceOverlay || { generatedAt: '', platforms: {} };
      state.smartPriceWorkbenchBase = mergeWorkbenchPayloadCompat(
        smartPriceWorkbench || { generatedAt: '', platforms: {} },
        smartPriceWorkbenchLive || null
      );
      state.smartPriceWorkbench = mergeWorkbenchOverlayCompat(
        state.smartPriceWorkbenchBase,
        smartPriceOverlay || null
      );
      repairWorkbenchState(false);

      if (typeof registerPriceFreshnessWarning === 'function') {
        registerPriceFreshnessWarning({
          smartPriceWorkbench: state.smartPriceWorkbench,
          smartPriceOverlay: state.smartPriceOverlay,
          smartPriceWorkbenchLive: state.smartPriceWorkbenchLive,
          repricerLive: state.repricerLive,
          prices: state.prices,
          priceWorkbenchSupport: state.priceWorkbenchSupport
        });
      }
    } finally {
      window.__ALTEA_ALLOW_REAL_DEFERRED_FETCH__ = previousDeferredFlag;
    }
  }

  function installLoaderPatch() {
    const lazyLoaders = getLazyLoaders();
    if (!lazyLoaders) return false;
    if (lazyLoaders.repricer?.__ALTEA_REPRICER_COLDSTART_PATCHED__) return true;

    const patchedLoader = async function patchedRepricerLoader() {
      await loadFullRepricerData();
    };
    patchedLoader.__ALTEA_REPRICER_COLDSTART_PATCHED__ = true;
    lazyLoaders.repricer = patchedLoader;
    return true;
  }

  function forceRenderRepricer() {
    if (getActiveView() !== 'repricer') return;
    repairWorkbenchState(true);
    const renderRepricer = getRenderRepricer();
    const rerenderCurrentView = getRerenderCurrentView();
    try {
      if (typeof renderRepricer === 'function') {
        renderRepricer();
        return;
      }
      if (typeof rerenderCurrentView === 'function') {
        rerenderCurrentView();
      }
    } catch (error) {
      console.warn('[repricer-coldstart-hotfix] render failed', error);
    }
  }

  function clearRepricerIntent() {
    repricerIntentUntil = 0;
    if (repricerIntentTimer) {
      window.clearTimeout(repricerIntentTimer);
      repricerIntentTimer = null;
    }
  }

  function maintainRepricerIntent(reason) {
    if (!repricerIntentUntil || Date.now() > repricerIntentUntil) {
      clearRepricerIntent();
      return;
    }

    if (getActiveView() !== 'repricer' && window.__ALTEA_PRIMARY_INIT_FINISHED__) {
      const setView = getSetView();
      if (typeof setView === 'function') {
        try {
          setView('repricer');
        } catch (error) {
          console.warn('[repricer-coldstart-hotfix] restore view failed', error);
        }
      }
    }

    if (getActiveView() === 'repricer') {
      repairWorkbenchState(true);
      if (!hydratePromise && !repricerHydrated()) {
        void hydrateRepricer(`${reason || 'intent'}-tick`);
      }
      if (repricerHydrated() || buildRowsCount() > 0) {
        forceRenderRepricer();
      }
      if (repricerUiReady()) {
        clearRepricerIntent();
        return;
      }
    }

    repricerIntentTimer = window.setTimeout(() => maintainRepricerIntent(reason), 1000);
  }

  function primeRepricerIntent(reason) {
    repricerIntentUntil = Date.now() + 30000;
    if (repricerIntentTimer) window.clearTimeout(repricerIntentTimer);
    repricerIntentTimer = window.setTimeout(() => maintainRepricerIntent(reason), 0);
  }

  function clearRenderEnforcer() {
    renderEnforcerUntil = 0;
    if (renderEnforcerTimer) {
      window.clearTimeout(renderEnforcerTimer);
      renderEnforcerTimer = null;
    }
  }

  function maintainRenderEnforcer(reason) {
    if (!renderEnforcerUntil || Date.now() > renderEnforcerUntil) {
      clearRenderEnforcer();
      return;
    }

    repairWorkbenchState(true);
    if (getActiveView() === 'repricer' && (repricerHydrated() || buildRowsCount() > 0)) {
      forceRenderRepricer();
    }

    if (repricerUiReady()) {
      clearRenderEnforcer();
      return;
    }

    renderEnforcerTimer = window.setTimeout(() => maintainRenderEnforcer(reason), 1000);
  }

  function primeRenderEnforcer(reason) {
    renderEnforcerUntil = Date.now() + 30000;
    if (renderEnforcerTimer) window.clearTimeout(renderEnforcerTimer);
    renderEnforcerTimer = window.setTimeout(() => maintainRenderEnforcer(reason), 0);
  }

  function resetIncompleteLazyState() {
    const state = getState();
    if (!state?.boot) return;
    state.boot.lazyReady = state.boot.lazyReady || {};
    state.boot.lazyLoads = state.boot.lazyLoads || {};
    if (!repricerHydrated()) {
      state.boot.lazyReady.repricer = false;
      delete state.boot.lazyLoads.repricer;
    }
  }

  function hydrateRepricer(reason) {
    if (!hasCoreBindings()) {
      scheduleHydrate(`${reason || 'repricer'}-wait-core`, 500);
      scheduleHydrate(`${reason || 'repricer'}-wait-core-late`, 2000);
      return Promise.resolve(false);
    }
    if (!appCoreReadyForRepricer()) {
      primeRepricerIntent(reason || 'wait-init');
      primeRenderEnforcer(reason || 'wait-init');
      scheduleHydrate(`${reason || 'repricer'}-wait-init`, 600);
      scheduleHydrate(`${reason || 'repricer'}-wait-init-late`, 2200);
      return Promise.resolve(false);
    }
    installLoaderPatch();
    if (repricerHydrated()) {
      primeRenderEnforcer(reason || 'ready');
      forceRenderRepricer();
      return Promise.resolve(true);
    }
    if (hydratePromise) return hydratePromise;

    resetIncompleteLazyState();
    hydratePromise = Promise.resolve()
      .then(() => loadFullRepricerData())
      .then(() => {
        repairWorkbenchState(true);
        markRepricerLazyReady();
      })
      .then(() => {
        primeRepricerIntent(reason || 'hydrate');
        primeRenderEnforcer(reason || 'hydrate');
        forceRenderRepricer();
        return repricerHydrated() || buildRowsCount() > 0;
      })
      .catch((error) => {
        console.warn('[repricer-coldstart-hotfix] hydrate failed', reason || '', error);
        return false;
      })
      .finally(() => {
        hydratePromise = null;
      });

    return hydratePromise;
  }

  function scheduleHydrate(reason, delay) {
    window.setTimeout(() => {
      void hydrateRepricer(reason);
    }, delay);
  }

  function bindNavigationHydration() {
    if (document.documentElement.dataset.repricerColdstartBound === 'true') return;
    document.documentElement.dataset.repricerColdstartBound = 'true';

    document.addEventListener('click', (event) => {
      const anyNavButton = event.target.closest('.nav-btn[data-view]');
      if (anyNavButton && anyNavButton.dataset.view !== 'repricer') {
        clearRepricerIntent();
        clearRenderEnforcer();
      }

      const repricerButton = event.target.closest('.nav-btn[data-view="repricer"]');
      if (!repricerButton) return;
      primeRepricerIntent('nav-click');
      primeRenderEnforcer('nav-click');
      scheduleHydrate('nav-click', 0);
      scheduleHydrate('nav-click-retry', 400);
      scheduleHydrate('nav-click-late', 1500);
      scheduleHydrate('nav-click-slow', 4000);
      scheduleHydrate('nav-click-final', 9000);
    }, true);

    window.addEventListener('altea:viewchange', (event) => {
      if (event.detail?.view !== 'repricer') return;
      primeRepricerIntent('viewchange');
      primeRenderEnforcer('viewchange');
      scheduleHydrate('viewchange', 0);
      scheduleHydrate('viewchange-retry', 500);
      scheduleHydrate('viewchange-slow', 2500);
      scheduleHydrate('viewchange-final', 7000);
    });
  }

  function start() {
    if (!hasCoreBindings()) {
      window.setTimeout(start, 120);
      return;
    }

    installLoaderPatch();
    bindNavigationHydration();

    if (getActiveView() === 'repricer' || repricerRootNeedsHydration()) {
      primeRepricerIntent('startup');
      primeRenderEnforcer('startup');
      scheduleHydrate('startup', 80);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(start, 80), { once: true });
  } else {
    window.setTimeout(start, 80);
  }
})();
