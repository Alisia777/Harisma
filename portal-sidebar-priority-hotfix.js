(function () {
  if (window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260604NAV2__) return;
  window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260604NAV2__ = true;
  window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260603NAV1__ = true;
  window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260516MORNING1__ = true;
  window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260503A__ = true;
  window.__ALTEA_SIDEBAR_PRIORITY_HOTFIX_20260425A__ = true;

  var ORDER = [
    "dashboard",
    "executive",
    "control",
    "data-health",
    "sku-plan-fact",
    "repricer",
    "prices",
    "order",
    "oos-control",
    "ads-funnel",
    "sku-contour",
    "skus",
    "launches",
    "launch-control",
    "iu-drr",
    "wb-rating",
    "product-leaderboard"
  ];

  var GROUPS = [
    {
      key: "daily",
      label: "01 \u0413\u043b\u0430\u0432\u043d\u043e\u0435",
      views: ["dashboard", "executive", "control", "data-health"]
    },
    {
      key: "commerce",
      label: "02 \u0414\u0435\u043d\u044c\u0433\u0438 \u0438 \u0442\u043e\u0432\u0430\u0440",
      views: ["sku-plan-fact", "repricer", "prices", "order", "oos-control", "ads-funnel"]
    },
    {
      key: "product",
      label: "03 \u041f\u0440\u043e\u0434\u0443\u043a\u0442",
      views: ["sku-contour", "skus", "launches", "launch-control"]
    },
    {
      key: "analytics",
      label: "04 \u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430",
      views: ["iu-drr", "wb-rating", "product-leaderboard"]
    }
  ];

  var VIEW_GROUP = {};
  GROUPS.forEach(function (group) {
    group.views.forEach(function (view) {
      VIEW_GROUP[view] = group.key;
    });
  });

  var GROUP_BY_KEY = {};
  GROUPS.forEach(function (group) {
    GROUP_BY_KEY[group.key] = group;
  });

  var META = {
    dashboard: {
      title: "\u0414\u0430\u0448\u0431\u043e\u0440\u0434",
      subtitle: "\u041f\u0443\u043b\u044c\u0441 \u00b7 \u043b\u0438\u0434\u0435\u0440\u044b \u00b7 \u0441\u0438\u0433\u043d\u0430\u043b\u044b",
      icon: "dashboard"
    },
    documents: {
      title: "\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b",
      subtitle: "\u0413\u0430\u0439\u0434\u044b \u00b7 \u0448\u0430\u0431\u043b\u043e\u043d\u044b \u00b7 \u0441\u0441\u044b\u043b\u043a\u0438",
      icon: "documents"
    },
    "data-health": {
      title: "\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c",
      subtitle: "\u0410\u043a\u0446\u0438\u0438 \u00b7 \u0441\u043e\u0431\u044b\u0442\u0438\u044f \u00b7 SKU",
      icon: "calendar"
    },
    repricer: {
      title: "\u0420\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440",
      subtitle: "\u0426\u0435\u043d\u0430 \u00b7 \u0440\u0438\u0441\u043a\u0438 \u00b7 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438",
      icon: "repricer"
    },
    prices: {
      title: "\u0426\u0435\u043d\u044b",
      subtitle: "\u041c\u0430\u0440\u0436\u0430 \u00b7 \u043e\u0431\u043e\u0440\u043e\u0442 \u00b7 \u0421\u041f\u041f",
      icon: "prices"
    },
    order: {
      title: "\u0417\u0430\u043a\u0430\u0437 \u0442\u043e\u0432\u0430\u0440\u0430",
      subtitle: "\u041a\u043b\u0430\u0441\u0442\u0435\u0440\u044b \u00b7 \u0441\u043a\u043b\u0430\u0434\u044b \u00b7 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438",
      icon: "order"
    },
    "oos-control": {
      title: "OOS \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c",
      subtitle: "\u041f\u0443\u0441\u0442\u044b\u0435 \u043f\u043e\u043b\u043a\u0438 \u00b7 \u043f\u043e\u0442\u0435\u0440\u0438 \u00b7 \u043c\u0435\u0440\u044b",
      icon: "oos"
    },
    control: {
      title: "\u0417\u0430\u0434\u0430\u0447\u0438",
      subtitle: "\u0417\u0430\u0434\u0430\u0447\u0438 \u00b7 \u0420\u041e\u041f \u00b7 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c",
      icon: "tasks"
    },
    executive: {
      title: "\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e",
      subtitle: "\u0420\u0438\u0441\u043a\u0438 \u00b7 \u0440\u0435\u0448\u0435\u043d\u0438\u044f \u00b7 \u0438\u0442\u043e\u0433",
      icon: "executive"
    },
    launches: {
      title: "\u041d\u043e\u0432\u0438\u043d\u043a\u0438",
      subtitle: "\u0422\u043e\u0432\u0430\u0440 \u00b7 \u043d\u043e\u0432\u0438\u043d\u043a\u0438 \u00b7 \u044d\u043a\u043e\u043d\u043e\u043c\u0438\u043a\u0430",
      icon: "launches"
    },
    "ads-funnel": {
      title: "\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u044c \u0420\u041a",
      subtitle: "WB \u00b7 Ozon \u00b7 \u0434\u043d\u0438 \u00b7 \u0441\u043e\u0431\u044b\u0442\u0438\u044f",
      icon: "ads"
    },
    "iu-drr": {
      title: "\u0418\u0423 / \u0414\u0420\u0420",
      subtitle: "\u0418\u0423 \u00b7 WB+Ozon \u00b7 \u0440\u0430\u0441\u0445\u043e\u0434\u044b WB",
      icon: "analytics"
    },
    "wb-rating": {
      title: "\u0420\u0435\u0439\u0442\u0438\u043d\u0433 \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a",
      subtitle: "WB \u00b7 \u043e\u0442\u0437\u044b\u0432\u044b \u00b7 \u0434\u0438\u043d\u0430\u043c\u0438\u043a\u0430",
      icon: "rating"
    },
    "product-leaderboard": {
      title: "\u041b\u0438\u0434\u0435\u0440\u0431\u043e\u0440\u0434",
      subtitle: "\u041a\u0417 \u00b7 \u0432\u043e\u0440\u043e\u043d\u043a\u0430 \u00b7 ROMI",
      icon: "leaderboard"
    },
    "launch-control": {
      title: "\u0417\u0430\u043f\u0443\u0441\u043a \u043d\u043e\u0432\u0438\u043d\u043e\u043a",
      subtitle: "\u0427\u0435\u043a-\u043b\u0438\u0441\u0442\u044b \u00b7 \u0444\u0430\u0437\u044b \u00b7 \u043f\u0440\u043e\u0441\u0440\u043e\u0447\u043a\u0438",
      icon: "launch-control"
    },
    skus: {
      title: "\u0420\u0435\u0435\u0441\u0442\u0440 \u0421\u041a\u042e",
      subtitle: "\u0421\u041a\u042e \u00b7 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438 \u00b7 owner",
      icon: "skus"
    },
    "sku-contour": {
      title: "SKU workspace",
      subtitle: "\u0420\u0435\u0435\u0441\u0442\u0440 \u00b7 API-\u043a\u043e\u043d\u0442\u0443\u0440 \u00b7 \u043f\u043b\u0430\u043d-\u0444\u0430\u043a\u0442",
      icon: "sku-workspace"
    },
    "sku-plan-fact": {
      title: "\u041f\u043b\u0430\u043d-\u0444\u0430\u043a\u0442 SKU",
      subtitle: "\u041f\u043b\u0430\u043d \u00b7 \u0444\u0430\u043a\u0442 \u00b7 \u0447\u0435\u043a \u00b7 \u0414\u0420\u0420",
      icon: "planfact"
    }
  };

  var ICONS = {
    dashboard: '<path d="M4 5h7v7H4z"/><path d="M13 5h7v4h-7z"/><path d="M13 11h7v9h-7z"/><path d="M4 14h7v6H4z"/>',
    documents: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6"/><path d="M10 17h6"/>',
    calendar: '<path d="M7 3v4"/><path d="M17 3v4"/><path d="M4 8h20"/><path d="M5 5h18v18H5z"/><path d="M9 13h3"/><path d="M15 13h3"/><path d="M9 17h3"/>',
    executive: '<path d="M3 7l5 5 4-8 4 8 5-5-2 14H5z"/><path d="M7 17h10"/>',
    tasks: '<path d="M5 5h14v16H5z"/><path d="M9 9l1.5 1.5L14 7"/><path d="M9 15h7"/><path d="M9 18h7"/>',
    planfact: '<path d="M5 19V5"/><path d="M5 19h16"/><path d="M9 16v-5"/><path d="M13 16V8"/><path d="M17 16v-3"/>',
    repricer: '<path d="M7 7h10l2 5-7 8-7-8z"/><path d="M9 7l3 13"/><path d="M15 7l-3 13"/><path d="M7 12h12"/>',
    prices: '<path d="M20 13l-8 8-8-8V5h8z"/><path d="M8 9h.01"/><path d="M12 5l8 8"/>',
    order: '<path d="M4 8l8-4 8 4-8 4z"/><path d="M4 8v8l8 4 8-4V8"/><path d="M12 12v8"/>',
    oos: '<path d="M12 4l10 18H2z"/><path d="M12 10v5"/><path d="M12 18h.01"/>',
    ads: '<path d="M4 13h4l10-6v14L8 15H4z"/><path d="M8 15l2 6"/><path d="M20 10c1 1 1 4 0 5"/>',
    "sku-workspace": '<path d="M4 5h7v7H4z"/><path d="M13 5h7v7h-7z"/><path d="M4 14h7v7H4z"/><path d="M13 14h7v7h-7z"/>',
    skus: '<path d="M5 6c0-2 14-2 14 0v12c0 2-14 2-14 0z"/><path d="M5 6c0 2 14 2 14 0"/><path d="M5 12c0 2 14 2 14 0"/>',
    launches: '<path d="M12 3c4 2 6 6 5 11l-5 5-5-5C6 9 8 5 12 3z"/><path d="M12 8h.01"/><path d="M8 16l-3 3"/><path d="M16 16l3 3"/>',
    "launch-control": '<path d="M6 21V4"/><path d="M7 4h11l-2 5 2 5H7"/><path d="M6 14h11"/>',
    analytics: '<path d="M12 3v9h9"/><path d="M20 16A9 9 0 1 1 12 3"/><path d="M14 3a9 9 0 0 1 7 7"/>',
    rating: '<path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9 6.6 19.8l1-6.1-4.4-4.3 6.1-.9z"/>',
    leaderboard: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 7H4c0 3 1.5 5 4 5"/><path d="M17 7h3c0 3-1.5 5-4 5"/>',
    fallback: '<path d="M12 5v14"/><path d="M5 12h14"/>'
  };

  var REDIRECTS = {
    meetings: "dashboard",
    documents: "dashboard"
  };
  var LAST_VIEW_STORAGE_KEY = "altea:last-view";
  var viewRestored = false;
  var observerStarted = false;
  var runQueued = false;

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

  function iconMarkup(name) {
    var paths = ICONS[name] || ICONS.fallback;
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + paths + "</svg>";
  }

  function getTitleSpan(btn) {
    var existing = btn.querySelector(".nav-title");
    if (existing) return existing;
    var spans = Array.prototype.slice.call(btn.querySelectorAll("span"));
    for (var index = 0; index < spans.length; index += 1) {
      if (!spans[index].classList.contains("nav-icon") && !spans[index].classList.contains("nav-copy")) {
        spans[index].classList.add("nav-title");
        return spans[index];
      }
    }
    var title = document.createElement("span");
    title.className = "nav-title";
    return title;
  }

  function ensureButtonShell(btn) {
    var icon = btn.querySelector(".nav-icon");
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "nav-icon";
      icon.setAttribute("aria-hidden", "true");
    }
    if (btn.firstChild !== icon) btn.insertBefore(icon, btn.firstChild);

    var copy = btn.querySelector(".nav-copy");
    if (!copy) {
      copy = document.createElement("span");
      copy.className = "nav-copy";
    }

    var title = getTitleSpan(btn);
    var subtitle = btn.querySelector(".nav-subtitle") || btn.querySelector("small");
    if (!subtitle) {
      subtitle = document.createElement("small");
    }
    subtitle.classList.add("nav-subtitle");

    if (title.parentNode !== copy) copy.appendChild(title);
    if (subtitle.parentNode !== copy) copy.appendChild(subtitle);
    if (copy.parentNode !== btn) btn.appendChild(copy);
    if (icon.nextSibling !== copy) btn.insertBefore(copy, icon.nextSibling);

    return {
      icon: icon,
      title: title,
      subtitle: subtitle
    };
  }

  function getGroupForView(view) {
    return VIEW_GROUP[view] || "";
  }

  function isButtonHidden(btn) {
    return btn.hidden || btn.classList.contains("nav-btn-legacy-hidden") || btn.getAttribute("aria-hidden") === "true";
  }

  function syncButtonMeta(btn, view) {
    var meta = META[view] || {};
    var shell = ensureButtonShell(btn);
    var title = meta.title || shell.title.textContent || view;
    var subtitle = meta.subtitle || shell.subtitle.textContent || "";
    setText(shell.title, title);
    setText(shell.subtitle, subtitle);
    shell.icon.innerHTML = iconMarkup(meta.icon || "fallback");
    btn.dataset.navGroup = getGroupForView(view);
    btn.setAttribute("aria-label", title);
    btn.title = subtitle ? title + " - " + subtitle : title;
  }

  function needsSidebarSync() {
    var toggle = document.querySelector("[data-sidebar-toggle]");
    var glyph = toggle && (toggle.querySelector("[aria-hidden='true']") || toggle.querySelector("span"));
    if (glyph && glyph.textContent !== "\u2039") return true;

    var nav = document.querySelector(".sidebar .nav");
    if (!nav) return false;
    if (!nav.querySelector(".nav-group-label")) return true;

    return Array.prototype.slice.call(nav.querySelectorAll(".nav-btn[data-view]")).some(function (btn) {
      if (isButtonHidden(btn)) return false;
      var view = String(btn.dataset.view || "").trim();
      var meta = META[view] || {};
      var title = btn.querySelector(".nav-title");
      var subtitle = btn.querySelector(".nav-subtitle");
      return !btn.querySelector(".nav-icon svg")
        || !btn.querySelector(".nav-copy")
        || !title
        || !subtitle
        || (meta.title && title.textContent !== meta.title)
        || (meta.subtitle && subtitle.textContent !== meta.subtitle);
    });
  }

  function removeGroupLabels(nav) {
    Array.prototype.slice.call(nav.querySelectorAll(".nav-group-label")).forEach(function (label) {
      if (label.parentNode) label.parentNode.removeChild(label);
    });
  }

  function makeGroupLabel(groupKey) {
    var group = GROUP_BY_KEY[groupKey];
    if (!group) return null;
    var label = document.createElement("div");
    label.className = "nav-group-label";
    label.textContent = group.label;
    label.setAttribute("aria-hidden", "true");
    return label;
  }

  function setFileInputLabel(label, value) {
    if (!label || !value) return;
    var input = label.querySelector("input");
    label.textContent = value;
    if (input) label.appendChild(input);
  }

  function syncSidebarToggleCopy() {
    var toggle = document.querySelector("[data-sidebar-toggle]");
    if (!toggle) return;
    var shell = document.querySelector(".app-shell");
    var collapsed = shell && shell.classList.contains("sidebar-collapsed");
    var label = collapsed ? "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043c\u0435\u043d\u044e" : "\u0421\u043a\u0440\u044b\u0442\u044c \u043c\u0435\u043d\u044e";
    var glyph = toggle.querySelector("[aria-hidden='true']") || toggle.querySelector("span") || toggle;
    if (glyph) glyph.textContent = "\u2039";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  }

  function syncStaticCopy() {
    syncSidebarToggleCopy();
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

    removeGroupLabels(nav);

    var buttons = Array.prototype.slice.call(nav.querySelectorAll(".nav-btn[data-view]"));
    if (!buttons.length) return false;

    var byView = {};
    buttons.forEach(function (btn) {
      byView[String(btn.dataset.view || "").trim()] = btn;
    });

    ["meetings", "documents"].forEach(function (view) {
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
      syncButtonMeta(btn, view);
      orderedButtons.push(btn);
    });

    Object.keys(byView).forEach(function (view) {
      if (ORDER.indexOf(view) === -1) {
        syncButtonMeta(byView[view], view);
        orderedButtons.push(byView[view]);
      }
    });

    var lastGroup = "";
    orderedButtons.forEach(function (btn) {
      var group = btn.dataset.navGroup || "";
      if (!isButtonHidden(btn) && group && group !== lastGroup) {
        var label = makeGroupLabel(group);
        if (label) nav.appendChild(label);
        lastGroup = group;
      }
      nav.appendChild(btn);
    });

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
    observeSidebar();
  }

  function scheduleRun() {
    if (runQueued) return;
    runQueued = true;
    window.setTimeout(function () {
      runQueued = false;
      run();
    }, 40);
  }

  function observeSidebar() {
    if (observerStarted || typeof MutationObserver !== "function") return;
    var nav = document.querySelector(".sidebar .nav");
    var shell = document.querySelector(".app-shell");
    if (!nav && !shell) return;
    observerStarted = true;
    var observer = new MutationObserver(function (mutations) {
      var shouldRun = mutations.some(function (mutation) {
        var target = mutation.target;
        return target
          && target.nodeType === 1
          && (
            (typeof target.closest === "function" && target.closest(".sidebar .nav"))
            || target === shell
          );
      });
      if (shouldRun && needsSidebarSync()) scheduleRun();
    });
    if (nav) observer.observe(nav, { childList: true, subtree: true, characterData: true });
    if (shell) observer.observe(shell, { attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  window.addEventListener("load", run);
  window.setTimeout(run, 360);
  window.setTimeout(run, 1320);
  window.addEventListener("altea:viewchange", function (event) {
    var view = event && event.detail ? event.detail.view : (state && state.activeView);
    if (view) saveLastView(view);
    run();
  });
})();
