(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260528_MINMAXIMPORT1__) return;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260528_MINMAXIMPORT1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260518_MINMAXQUEUE1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260518_STATUS_EDIT1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260518_ZEROFIX1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260518_PRICEFIELDS1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260516_PLATFORMCOLORS2__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260514_MARKETPLACES1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260508_PRICECACHE1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260505A__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260503C__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260503B__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260503A__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260502A__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260429B__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260429A__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260428C__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260428B__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260428A__ = true;

  const SCRIPT_ID = 'portalPriceWorkbenchSimpleLive20260528minmaximport1';
  const SRC = 'portal-price-workbench-simple-live.js?v=20260528minmaximport1';

  function isPricesViewActive() {
    if (window.state && window.state.activeView) return window.state.activeView === 'prices';
    return Boolean(document.querySelector('#view-prices.view.active'));
  }

  function rerender() {
    if (typeof window.renderPriceWorkbench !== 'function') return;
    try {
      window.renderPriceWorkbench();
    } catch (error) {
      console.warn('[price-runtime-loader] rerender', error);
    }
  }

  function ensureLoaded() {
    if (window.__ALTEA_PRICE_SIMPLE_RENDERER_20260528_MINMAXIMPORT1__) {
      if (isPricesViewActive()) rerender();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.defer = true;
    script.src = SRC;
    script.onload = () => {
      if (isPricesViewActive()) rerender();
    };
    script.onerror = (error) => console.warn('[price-runtime-loader] load', error);
    (document.head || document.body || document.documentElement).appendChild(script);
  }

  function maybeLoadForView(view) {
    if (view && view !== 'prices') return;
    if (!view && !isPricesViewActive()) return;
    ensureLoaded();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => maybeLoadForView(), { once: true });
  } else {
    maybeLoadForView();
  }

  window.addEventListener('load', () => maybeLoadForView(), { once: true });
  window.addEventListener('altea:viewchange', (event) => {
    maybeLoadForView(event?.detail?.view);
  });
})();
