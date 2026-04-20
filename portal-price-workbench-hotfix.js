(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_LOADER_20260420P__) return;
  window.__ALTEA_PRICE_WORKBENCH_LOADER_20260420P__ = true;
  if (window.__ALTEA_PRICE_SIMPLE_RENDERER_20260420B__) {
    if (typeof window.renderPriceWorkbench === "function") {
      try { window.renderPriceWorkbench(); } catch (error) { console.warn("[portal-price-workbench-loader] render", error); }
    }
    return;
  }
  document.write('<script src="portal-price-workbench-simple-live.js?v=20260420p"><\\/script>');
})();
