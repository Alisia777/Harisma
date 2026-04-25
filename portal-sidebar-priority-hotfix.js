(function () {
  if (window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260425A__) return;
  window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260425A__ = true;

  var ORDER = [
    "dashboard",
    "repricer",
    "prices",
    "order",
    "control",
    "executive",
    "launches",
    "launch-control",
    "skus"
  ];

  var META = {
    dashboard: {
      title: "\u0414\u0430\u0448\u0431\u043e\u0440\u0434",
      subtitle: "\u041f\u0443\u043b\u044c\u0441 \u00b7 \u043b\u0438\u0434\u0435\u0440\u044b \u00b7 \u0441\u0438\u0433\u043d\u0430\u043b\u044b"
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
      title: "\u041f\u0440\u043e\u0434\u0443\u043a\u0442 / \u041a\u0441\u0435\u043d\u0438\u044f",
      subtitle: "\u0422\u043e\u0432\u0430\u0440 \u00b7 \u043d\u043e\u0432\u0438\u043d\u043a\u0438 \u00b7 \u044d\u043a\u043e\u043d\u043e\u043c\u0438\u043a\u0430"
    },
    "launch-control": {
      title: "\u0417\u0430\u043f\u0443\u0441\u043a \u043d\u043e\u0432\u0438\u043d\u043e\u043a",
      subtitle: "\u0427\u0435\u043a-\u043b\u0438\u0441\u0442\u044b \u00b7 \u0444\u0430\u0437\u044b \u00b7 \u043f\u0440\u043e\u0441\u0440\u043e\u0447\u043a\u0438"
    },
    skus: {
      title: "\u0420\u0435\u0435\u0441\u0442\u0440 \u0421\u041a\u042e",
      subtitle: "\u0421\u041a\u042e \u00b7 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438 \u00b7 owner"
    }
  };

  var REDIRECTS = {
    documents: "dashboard",
    meetings: "dashboard"
  };

  function normalizeView(view) {
    var raw = String(view || "dashboard").trim() || "dashboard";
    return REDIRECTS[raw] || raw;
  }

  function setText(el, value) {
    if (!el || !value) return;
    el.textContent = value;
  }

  function patchViewFunctions() {
    if (typeof window.setView === "function" && !window.setView.__alteaSidebarPatched) {
      var originalSetView = window.setView;
      var wrappedSetView = function (view) {
        return originalSetView.call(this, normalizeView(view));
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

    ["documents", "meetings"].forEach(function (view) {
      if (byView[view] && byView[view].parentNode) byView[view].parentNode.removeChild(byView[view]);
      delete byView[view];
    });

    ORDER.forEach(function (view) {
      var btn = byView[view];
      if (!btn) return;
      var meta = META[view] || {};
      setText(btn.querySelector("span"), meta.title);
      setText(btn.querySelector("small"), meta.subtitle);
      nav.appendChild(btn);
    });

    Object.keys(byView).forEach(function (view) {
      if (ORDER.indexOf(view) === -1) nav.appendChild(byView[view]);
    });

    return true;
  }

  function enforceActiveView() {
    if (!window.state || !window.state.activeView) return;
    var normalized = normalizeView(window.state.activeView);
    if (normalized === window.state.activeView) return;
    if (typeof window.setView === "function") window.setView(normalized);
  }

  function run() {
    patchViewFunctions();
    syncSidebar();
    enforceActiveView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  window.addEventListener("load", run);
  window.addEventListener("altea:viewchange", run);
  window.setInterval(run, 1500);
})();