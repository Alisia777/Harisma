(function () {
  if (window.__ALTEA_SKU_REGISTRY_NOTE_CLEANUP_20260515__) return;
  window.__ALTEA_SKU_REGISTRY_NOTE_CLEANUP_20260515__ = true;

  function run() {
    document.querySelectorAll("[data-sku-live-note]").forEach(function (node) {
      node.remove();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  window.addEventListener("altea:viewchange", run);
  window.setInterval(run, 1500);
})();
