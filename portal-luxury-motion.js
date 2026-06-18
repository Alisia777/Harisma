(function () {
  if (window.__ALTEA_LUXURY_MOTION__) return;
  window.__ALTEA_LUXURY_MOTION__ = true;

  var VIEW_SURFACE_SELECTOR = [
    ".section-title",
    ".portal-view-guide",
    ".portal-surface",
    ".card",
    ".table-wrap",
    ".mini-kpi",
    ".task-card",
    ".task-mini",
    ".leader-row",
    ".alert-row",
    ".pw-card",
    ".repricer-card",
    ".repricer-side",
    ".launch-task-column"
  ].join(",");

  var transitionTimer = 0;
  var busyTimer = 0;
  var mutationQueued = false;
  var lastView = "";

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function ensureMotionNodes() {
    if (!document.body) return;
    if (!document.querySelector(".portal-motion-progress")) {
      var progress = document.createElement("div");
      progress.className = "portal-motion-progress";
      progress.setAttribute("aria-hidden", "true");
      document.body.appendChild(progress);
    }
    if (!document.querySelector(".portal-route-veil")) {
      var veil = document.createElement("div");
      veil.className = "portal-route-veil";
      veil.setAttribute("aria-hidden", "true");
      document.body.appendChild(veil);
    }
  }

  function activeViewRoot() {
    return document.querySelector(".view.active");
  }

  function activeViewKey() {
    var root = activeViewRoot();
    return root ? String(root.id || "").replace(/^view-/, "") : "";
  }

  function syncPending() {
    var status = document.getElementById("syncStatusBadge");
    return !!(status && status.classList && status.classList.contains("pending"));
  }

  function syncReady() {
    var status = document.getElementById("syncStatusBadge");
    return !!(status && status.classList && status.classList.contains("ready"));
  }

  function portalStillBooting() {
    if (syncReady()) return false;
    if (syncPending()) return true;
    var root = activeViewRoot();
    if (!root) return false;
    if (looksLikeLoader(root)) return true;
    return root.id === "view-dashboard" && root.children.length <= 1 && String(root.textContent || "").trim().length < 1600;
  }

  function viewRoot(view) {
    return view ? document.getElementById("view-" + view) : activeViewRoot();
  }

  function showBusy(minMs) {
    if (!document.body || reducedMotion()) return;
    window.clearTimeout(busyTimer);
    document.body.classList.remove("portal-motion-complete");
    document.body.classList.add("portal-motion-busy");
    if (minMs) {
      busyTimer = window.setTimeout(hideBusy, minMs);
    }
  }

  function hideBusy() {
    if (!document.body || reducedMotion()) return;
    window.clearTimeout(busyTimer);
    if (syncPending()) return;
    if (!document.body.classList.contains("portal-motion-busy")) return;
    document.body.classList.remove("portal-motion-busy");
    document.body.classList.add("portal-motion-complete");
    window.setTimeout(function () {
      if (document.body) document.body.classList.remove("portal-motion-complete");
    }, 460);
  }

  function startTransition(view) {
    if (!document.body || reducedMotion()) return;
    ensureMotionNodes();
    window.clearTimeout(transitionTimer);
    document.body.classList.add("portal-motion-switching");
    showBusy(0);
    transitionTimer = window.setTimeout(function () {
      endTransition();
    }, 1100);
  }

  function endTransition(delay) {
    if (!document.body || reducedMotion()) return;
    window.clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(function () {
      if (!document.body) return;
      document.body.classList.remove("portal-motion-switching");
      if (!activeViewRoot() || !activeViewRoot().classList.contains("portal-motion-loading")) {
        hideBusy();
      }
    }, typeof delay === "number" ? delay : 260);
  }

  function markStagger(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.slice.call(root.querySelectorAll(VIEW_SURFACE_SELECTOR), 0, 34).forEach(function (node, index) {
      if (!(node instanceof HTMLElement)) return;
      node.style.setProperty("--portal-motion-order", String(Math.min(index, 10)));
    });
  }

  function looksLikeLoader(root) {
    if (!root || !root.classList || !root.classList.contains("active")) return false;
    var text = String(root.textContent || "").trim();
    if (!text || text.length > 1400) return false;
    if (root.querySelector(".pw-card, .portal-exec-surface, .sku-plan-fact-table, .sku-plan-fact-card, .repricer-card, .portal-view-guide, .board-columns, .dashboard-grid-3")) {
      return false;
    }
    return !!root.querySelector(":scope > .card .head, :scope > .card h3");
  }

  function updateLoadingState(root) {
    root = root || activeViewRoot();
    if (!root || !root.classList) return;
    var loading = looksLikeLoader(root);
    root.classList.toggle("portal-motion-loading", loading);
    if (loading) showBusy(0);
    else hideBusy();
  }

  function animateView(view) {
    if (reducedMotion()) return;
    var root = viewRoot(view);
    if (!root || !root.classList) return;
    markStagger(root);
    root.classList.remove("portal-motion-view-enter");
    root.getBoundingClientRect();
    root.classList.add("portal-motion-view-enter");
    window.setTimeout(function () {
      if (root) root.classList.remove("portal-motion-view-enter");
    }, 1250);
    updateLoadingState(root);
  }

  function flashActiveData() {
    var root = activeViewRoot();
    if (!root || !root.classList || reducedMotion()) return;
    root.classList.add("portal-motion-data-flash");
    window.setTimeout(function () {
      if (root) root.classList.remove("portal-motion-data-flash");
    }, 900);
  }

  function bindNavigationPrelude() {
    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") return;
      var button = target.closest(".nav-btn[data-view]");
      if (!button || button.disabled) return;
      var view = button.getAttribute("data-view");
      if (!view || view === activeViewKey()) return;
      if (portalStillBooting()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showBusy(0);
        return;
      }
      startTransition(view);
    }, true);
  }

  function bindViewChanges() {
    window.addEventListener("altea:viewchange", function (event) {
      var view = event && event.detail ? event.detail.view : activeViewKey();
      lastView = view || lastView;
      window.requestAnimationFrame(function () {
        animateView(view);
        endTransition(360);
      });
    });
  }

  function bindSyncStatus() {
    var status = document.getElementById("syncStatusBadge");
    if (!status || typeof MutationObserver !== "function") return;

    function refresh() {
      var pending = status.classList.contains("pending") || /pending/i.test(status.className);
      var ready = status.classList.contains("ready");
      if (pending) {
        showBusy(0);
      } else if (ready) {
        status.classList.add("portal-motion-flash");
        hideBusy();
        window.setTimeout(function () {
          status.classList.remove("portal-motion-flash");
        }, 1500);
      }
    }

    refresh();
    new MutationObserver(refresh).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function bindContentObserver() {
    if (typeof MutationObserver !== "function") return;
    var scope = document.querySelector(".main") || document.body || document.documentElement;
    if (!scope) return;
    var observer = new MutationObserver(function () {
      if (mutationQueued) return;
      mutationQueued = true;
      window.setTimeout(function () {
        mutationQueued = false;
        var root = activeViewRoot();
        if (!root) return;
        markStagger(root);
        updateLoadingState(root);
      }, 80);
    });
    observer.observe(scope, {
      childList: true,
      subtree: true
    });
  }

  function bindPortalEvents() {
    window.addEventListener("altea:portal-storage-updated", flashActiveData);
    window.addEventListener("focus", function () {
      window.setTimeout(function () {
        updateLoadingState(activeViewRoot());
      }, 80);
    });
  }

  function boot() {
    if (!document.body) return;
    ensureMotionNodes();
    document.body.classList.add("portal-motion-ready");
    lastView = activeViewKey();
    markStagger(activeViewRoot());
    updateLoadingState(activeViewRoot());
    bindNavigationPrelude();
    bindViewChanges();
    bindSyncStatus();
    bindContentObserver();
    bindPortalEvents();
    window.setTimeout(function () {
      animateView(activeViewKey());
    }, 120);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
