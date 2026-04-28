(function () {
  if (window.__ALTEA_PRICE_LOCAL_FETCH_BYPASS_20260428A__) return;
  window.__ALTEA_PRICE_LOCAL_FETCH_BYPASS_20260428A__ = true;
  if (!window.__ALTEA_PRICE_SIMPLE_RUNTIME_MODE__) return;
  if (typeof window.fetch !== "function") return;

  var PRICE_PATHS = {
    "data/smart_price_workbench.json": true,
    "data/smart_price_overlay.json": true,
    "data/order_procurement.json": true,
    "data/order_procurement_wb.json": true,
    "data/order_procurement_ozon.json": true
  };
  var baseFetch = typeof window.__ALTEA_BASE_FETCH__ === "function"
    ? window.__ALTEA_BASE_FETCH__
    : null;
  if (!baseFetch) return;

  function normalizePath(input) {
    try {
      var raw = typeof input === "string" ? input : (input && input.url) || "";
      var url = new URL(raw, window.location.href);
      return url.pathname.replace(/^\//, "");
    } catch {
      return "";
    }
  }

  var currentFetch = window.fetch.bind(window);
  window.fetch = function patchedPriceLocalFetch(input, init) {
    var path = normalizePath(input);
    if (PRICE_PATHS[path]) {
      return baseFetch(input, init);
    }
    return currentFetch(input, init);
  };
})();
