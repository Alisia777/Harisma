(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260425E__) return;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260425E__ = true;

  const SCRIPT_ID = 'portalPriceWorkbenchSimpleLive20260425e';
  const SRC = 'portal-price-workbench-simple-live.js?v=20260425h';

  function rerender() {
    if (typeof window.renderPriceWorkbench !== 'function') return;
    try {
      window.renderPriceWorkbench();
    } catch (error) {
      console.warn('[price-runtime-loader] rerender', error);
    }
  }

  function ensureLoaded() {
    if (window.__ALTEA_PRICE_SIMPLE_RENDERER_20260425H__) {
      rerender();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.defer = true;
    script.src = SRC;
    script.onload = rerender;
    script.onerror = (error) => console.warn('[price-runtime-loader] load', error);
    (document.head || document.body || document.documentElement).appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(ensureLoaded, 120), { once: true });
  } else {
    window.setTimeout(ensureLoaded, 120);
  }
  window.addEventListener('load', () => window.setTimeout(ensureLoaded, 120), { once: true });
  window.setTimeout(ensureLoaded, 1200);
})();
