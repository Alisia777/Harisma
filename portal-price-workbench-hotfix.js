(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_BOOTSTRAP_20260421A__) return;
  window.__ALTEA_PRICE_WORKBENCH_BOOTSTRAP_20260421A__ = true;
  if (window.__ALTEA_PRICE_WORKBENCH_HOTFIX_20260419D__) {
    if (typeof window.renderPriceWorkbench === "function") {
      try { window.renderPriceWorkbench(); } catch (error) { console.warn("[portal-price-workbench-bootstrap] render", error); }
    }
    return;
  }
  const id = "portalPriceWorkbenchLoaderScript";
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.src = "portal-price-workbench-loader-20260420m.js?v=20260421a";
  script.async = false;
  (document.head || document.body || document.documentElement).appendChild(script);
})();
