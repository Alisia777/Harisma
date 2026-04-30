(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260429D__) return;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260429D__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260429C__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260429B__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260429A__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260428C__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260428B__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260428A__ = true;

  const SCRIPT_ID = 'portalPriceWorkbenchSimpleLive20260429d';
  const SRC = 'portal-price-workbench-simple-live.js?v=20260429d';

  function rerender() {
    if (typeof window.renderPriceWorkbench !== 'function') return;
    try {
      window.renderPriceWorkbench();
    } catch (error) {
      console.warn('[price-runtime-loader] rerender', error);
    }
  }

  function ensureLoaded() {
    if (window.__ALTEA_PRICE_SIMPLE_RENDERER_20260429D__ || window.__ALTEA_PRICE_SIMPLE_RENDERER_20260429C__ || window.__ALTEA_PRICE_SIMPLE_RENDERER_20260429B__ || window.__ALTEA_PRICE_SIMPLE_RENDERER_20260429A__ || window.__ALTEA_PRICE_SIMPLE_RENDERER_20260428C__) {
      rerender();
      return Promise.resolve();
    }
    if (window.__alteaPriceWorkbenchReadyPromise) return window.__alteaPriceWorkbenchReadyPromise;
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      return window.__alteaPriceWorkbenchReadyPromise || Promise.resolve(existing);
    }
    window.__alteaPriceWorkbenchReadyPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.defer = true;
      script.src = SRC;
      script.onload = () => {
        rerender();
        resolve(script);
      };
      script.onerror = (error) => {
        console.warn('[price-runtime-loader] load', error);
        reject(error);
      };
      (document.head || document.body || document.documentElement).appendChild(script);
    });
    return window.__alteaPriceWorkbenchReadyPromise;
  }

  window.__alteaEnsurePriceWorkbenchLoaded = ensureLoaded;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(ensureLoaded, 120), { once: true });
  } else {
    window.setTimeout(ensureLoaded, 120);
  }
  window.addEventListener('load', () => window.setTimeout(ensureLoaded, 120), { once: true });
  window.setTimeout(ensureLoaded, 1200);
})();
