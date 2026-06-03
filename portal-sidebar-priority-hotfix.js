(function () {
  if (window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260516MORNING1__) return;
  window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260516MORNING1__ = true;
  window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260503A__ = true;
  window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260425A__ = true;

  var ORDER = [
    "dashboard",
    "data-health",
    "control",
    "executive",
    "sku-plan-fact",
    "repricer",
    "prices",
    "order",
    "sku-contour",
    "skus",
    "launches",
    "ads-funnel",
    "iu-drr",
    "wb-rating",
    "product-leaderboard"
  ];

  var META = {
    dashboard: {
      title: "\u0414\u0430\u0448\u0431\u043e\u0440\u0434",
      subtitle: "\u041f\u0443\u043b\u044c\u0441 \u00b7 \u043b\u0438\u0434\u0435\u0440\u044b \u00b7 \u0441\u0438\u0433\u043d\u0430\u043b\u044b"
    },
    documents: {
      title: "\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b",
      subtitle: "\u0413\u0430\u0439\u0434\u044b \u00b7 \u0448\u0430\u0431\u043b\u043e\u043d\u044b \u00b7 \u0441\u0441\u044b\u043b\u043a\u0438"
    },
    "data-health": {
      title: "\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c",
      subtitle: "\u0430\u043a\u0446\u0438\u0438 \u00b7 \u0441\u043e\u0431\u044b\u0442\u0438\u044f \u00b7 SKU"
    },
    repricer: {
      title: "\u0420\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440",
      subtitle: "\u0426\u0435\u043d\u0430 \u00b7 \u0440\u0438\u0441\u043a\u0438 \u00b7 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438"
    },
    prices: {
      title: "\u0426\u0435\u043d\u044b",
      subtitle: "\u041c\u0430\u0440\u0436\u0430 \u00b7 \u043e\u0431\u043e\u0440\u043e\u0442 \u00b7 \u0421\u041f\u041f"
    },
    order: {
      title: "\u0417\u0430\u043a\u0430\u0437 \u0442\u043e\u0432\u0430\u0440\u0430",
      subtitle: "\u041a\u043b\u0430\u0441\u0442\u0435\u0440\u044b \u00b7 \u0441\u043a\u043b\u0430\u0434\u044b \u00b7 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438"
    },
    control: {
      title: "\u0417\u0430\u0434\u0430\u0447\u0438",
      subtitle: "\u0417\u0430\u0434\u0430\u0447\u0438 \u00b7 \u0420\u041e\u041f \u00b7 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c"
    },
    executive: {
      title: "\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e",
      subtitle: "\u0420\u0438\u0441\u043a\u0438 \u00b7 \u0440\u0435\u0448\u0435\u043d\u0438\u044f \u00b7 \u0438\u0442\u043e\u0433"
    },
    launches: {
      title: "\u041d\u043e\u0432\u0438\u043d\u043a\u0438",
      subtitle: "\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u00b7 \u043f\u0440\u043e\u0435\u043a\u0442\u044b \u00b7 \u0437\u0430\u0434\u0430\u0447\u0438"
    },
    "ads-funnel": {
      title: "\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u044c \u0420\u041a",
      subtitle: "WB \u00b7 Ozon \u00b7 \u0434\u043d\u0438 \u00b7 \u0441\u043e\u0431\u044b\u0442\u0438\u044f"
    },
    "iu-drr": {
      title: "\u0418\u0423 / \u0414\u0420\u0420",
      subtitle: "\u0418\u0423 \u00b7 WB+Ozon \u00b7 \u0440\u0430\u0441\u0445\u043e\u0434\u044b WB"
    },
    "wb-rating": {
      title: "\u0420\u0435\u0439\u0442\u0438\u043d\u0433 \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a",
      subtitle: "WB \u00b7 \u043e\u0442\u0437\u044b\u0432\u044b \u00b7 \u0434\u0438\u043d\u0430\u043c\u0438\u043a\u0430"
    },
    "product-leaderboard": {
      title: "\u041f\u0440\u043e\u0434\u0443\u043a\u0442\u043e\u0432\u044b\u0439 \u043b\u0438\u0434\u0435\u0440\u0431\u043e\u0440\u0434",
      subtitle: "\u041a\u0417 \u00b7 \u0432\u043e\u0440\u043e\u043d\u043a\u0430 \u00b7 ROMI"
    },
    "launch-control": {
      title: "\u0417\u0430\u043f\u0443\u0441\u043a \u043d\u043e\u0432\u0438\u043d\u043e\u043a",
      subtitle: "\u0427\u0435\u043a-\u043b\u0438\u0441\u0442\u044b \u00b7 \u0444\u0430\u0437\u044b \u00b7 \u043f\u0440\u043e\u0441\u0440\u043e\u0447\u043a\u0438"
    },
    skus: {
      title: "\u0420\u0435\u0435\u0441\u0442\u0440 \u0421\u041a\u042e",
      subtitle: "\u0421\u041a\u042e \u00b7 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438 \u00b7 owner"
    },
    "sku-contour": {
      title: "SKU workspace",
      subtitle: "\u0420\u0435\u0435\u0441\u0442\u0440 \u00b7 API-\u043a\u043e\u043d\u0442\u0443\u0440 \u00b7 \u043f\u043b\u0430\u043d-\u0444\u0430\u043a\u0442"
    },
    "sku-plan-fact": {
      title: "\u041f\u043b\u0430\u043d-\u0444\u0430\u043a\u0442 SKU",
      subtitle: "\u041f\u043b\u0430\u043d \u00b7 \u0444\u0430\u043a\u0442 \u00b7 \u0447\u0435\u043a \u00b7 \u0414\u0420\u0420"
    }
  };

  var REDIRECTS = {
    meetings: "dashboard",
    documents: "dashboard",
    "launch-control": "launches"
  };
  var LAST_VIEW_STORAGE_KEY = "altea:last-view";
  var viewRestored = false;

  function normalizeView(view) {
    var raw = String(view || "dashboard").trim() || "dashboard";
    return REDIRECTS[raw] || raw;
  }

  function readUrlView() {
    try {
      var url = new URL(window.location.href);
      var raw = String(url.searchParams.get("view") || "").trim();
      return raw ? normalizeView(raw) : "";
    } catch (error) {
      console.warn("[sidebar-hotfix] readUrlView", error);
      return "";
    }
  }

  function readHashView() {
    try {
      var raw = String(window.location.hash || "").replace(/^#/, "").trim();
      return raw ? normalizeView(raw) : "";
    } catch (error) {
      console.warn("[sidebar-hotfix] readHashView", error);
      return "";
    }
  }

  function saveLastView(view) {
    var normalized = normalizeView(view);
    if (!normalized) return;
    try {
      window.localStorage.setItem(LAST_VIEW_STORAGE_KEY, normalized);
    } catch (error) {
      console.warn("[sidebar-hotfix] saveLastView", error);
    }
  }

  function readLastView() {
    try {
      var raw = String(window.localStorage.getItem(LAST_VIEW_STORAGE_KEY) || "").trim();
      return raw ? normalizeView(raw) : "";
    } catch (error) {
      console.warn("[sidebar-hotfix] readLastView", error);
      return "";
    }
  }

  function restoreLastView() {
    if (viewRestored) return;
    if (typeof window.setView !== "function") return;
    var preferred = readHashView() || readUrlView() || readLastView();
    if (!preferred) return;
    var current = normalizeView(state && state.activeView ? state.activeView : "dashboard");
    if (current === preferred) {
      viewRestored = true;
      return;
    }
    viewRestored = true;
    try {
      window.setView(preferred);
    } catch (error) {
      console.warn("[sidebar-hotfix] restoreLastView", error);
      viewRestored = false;
    }
  }

  function setText(el, value) {
    if (!el || !value) return;
    el.textContent = value;
  }

  function setFileInputLabel(label, value) {
    if (!label || !value) return;
    var input = label.querySelector("input");
    label.textContent = value;
    if (input) label.appendChild(input);
  }

  function syncStaticCopy() {
    setText(document.querySelector(".brand-title"), "\u0414\u043e\u043c \u0431\u0440\u0435\u043d\u0434\u0430 \u0410\u043b\u0442\u0435\u044f");
    setText(document.querySelector(".brand-sub"), "\u0420\u0430\u0431\u043e\u0447\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440 \u0431\u0440\u0435\u043d\u0434\u0430 \u0438 \u0440\u0435\u0448\u0435\u043d\u0438\u0439.");
    setText(document.querySelector(".topbar h1"), "\u0414\u043e\u043c \u0431\u0440\u0435\u043d\u0434\u0430 \u0410\u043b\u0442\u0435\u044f");
    setText(
      document.querySelector(".topbar p"),
      "\u0417\u0434\u0435\u0441\u044c \u0437\u0430\u0434\u0430\u0447\u0438 \u0441\u0442\u0430\u043d\u043e\u0432\u044f\u0442\u0441\u044f \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f\u043c\u0438, \u0430 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u2014 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u043e\u043c."
    );
    setText(document.getElementById("pullRemoteBtn"), "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435");
    setText(document.getElementById("pushRemoteBtn"), "\u0421\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f");
    setText(document.getElementById("toggleAdminBarBtn"), "\u0410\u0434\u043c\u0438\u043d");
    setText(document.getElementById("exportStorageBtn"), "\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u0440\u0430\u0431\u043e\u0447\u0435\u0433\u043e JSON");
    setFileInputLabel(document.querySelector(".file-input"), "\u0418\u043c\u043f\u043e\u0440\u0442 JSON");
  }

  function patchViewFunctions() {
    if (typeof window.setView === "function" && !window.setView.__alteaSidebarPatched) {
      var originalSetView = window.setView;
      var wrappedSetView = function (view, options) {
        var normalized = normalizeView(view);
        saveLastView(normalized);
        return originalSetView.call(this, normalized, options);
      };
      wrappedSetView.__alteaSidebarPatched = true;
      window.setView = wrappedSetView;
    }

    if (typeof window.prepareView === "function" && !window.prepareView.__alteaSidebarPatched) {
      var originalPrepareView = window.prepareView;
      var wrappedPrepareView = function (view) {
        return originalPrepareView.call(this, normalizeView(view));
      };
      wrappedPrepareView.__alteaSidebarPatched = true;
      window.prepareView = wrappedPrepareView;
    }
  }

  function syncSidebar() {
    var nav = document.querySelector(".sidebar .nav");
    if (!nav) return false;

    var buttons = Array.prototype.slice.call(nav.querySelectorAll(".nav-btn[data-view]"));
    if (!buttons.length) return false;

    var byView = {};
    buttons.forEach(function (btn) {
      byView[String(btn.dataset.view || "").trim()] = btn;
    });

    ["meetings", "documents", "launch-control"].forEach(function (view) {
      if (byView[view] && byView[view].parentNode) byView[view].parentNode.removeChild(byView[view]);
      delete byView[view];
    });

    if (byView.skus) {
      byView.skus.hidden = true;
      byView.skus.setAttribute("aria-hidden", "true");
      byView.skus.tabIndex = -1;
      byView.skus.classList.add("nav-btn-legacy-hidden");
    }

    var orderedButtons = [];
    ORDER.forEach(function (view) {
      var btn = byView[view];
      if (!btn) return;
      var meta = META[view] || {};
      setText(btn.querySelector("span"), meta.title);
      setText(btn.querySelector("small"), meta.subtitle);
      orderedButtons.push(btn);
    });

    Object.keys(byView).forEach(function (view) {
      if (ORDER.indexOf(view) === -1) orderedButtons.push(byView[view]);
    });

    var needsReorder = orderedButtons.length !== buttons.length;
    if (!needsReorder) {
      for (var index = 0; index < orderedButtons.length; index += 1) {
        if (nav.children[index] !== orderedButtons[index]) {
          needsReorder = true;
          break;
        }
      }
    }

    if (needsReorder) {
      orderedButtons.forEach(function (btn) {
        nav.appendChild(btn);
      });
    }

    return true;
  }

  function enforceActiveView() {
    if (typeof state !== "object" || !state || !state.activeView) return;
    var normalized = normalizeView(state.activeView);
    if (normalized === state.activeView) return;
    if (typeof window.setView === "function") window.setView(normalized);
  }

  function run() {
    patchViewFunctions();
    syncStaticCopy();
    syncSidebar();
    enforceActiveView();
    restoreLastView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  window.addEventListener("load", run);
  window.addEventListener("altea:viewchange", function (event) {
    var view = event && event.detail ? event.detail.view : (state && state.activeView);
    if (view) saveLastView(view);
    run();
  });
})();
