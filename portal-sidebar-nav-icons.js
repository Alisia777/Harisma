(function () {
  if (window.__ALTEA_SIDEBAR_NAV_ICONS_20260603A__) return;
  window.__ALTEA_SIDEBAR_NAV_ICONS_20260603A__ = true;

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
    "launches",
    "iu-drr",
    "wb-rating",
    "product-leaderboard"
  ];

  var HIDDEN_VIEWS = {
    skus: true,
    "launch-control": true,
    meetings: true,
    documents: true
  };

  var GROUPS = [
    { key: "daily", label: "01 \u0413\u043b\u0430\u0432\u043d\u043e\u0435", views: ["dashboard", "executive", "control", "data-health"] },
    { key: "commerce", label: "02 \u0414\u0435\u043d\u044c\u0433\u0438 \u0438 \u0442\u043e\u0432\u0430\u0440", views: ["sku-plan-fact", "repricer", "prices", "order", "oos-control", "ads-funnel"] },
    { key: "product", label: "03 \u041f\u0440\u043e\u0434\u0443\u043a\u0442", views: ["sku-contour", "launches"] },
    { key: "analytics", label: "04 \u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430", views: ["iu-drr", "wb-rating", "product-leaderboard"] }
  ];

  var VIEW_GROUP = {};
  var GROUP_BY_KEY = {};
  GROUPS.forEach(function (group) {
    GROUP_BY_KEY[group.key] = group;
    group.views.forEach(function (view) {
      VIEW_GROUP[view] = group.key;
    });
  });

  var META = {
    dashboard: { title: "\u0414\u0430\u0448\u0431\u043e\u0440\u0434", subtitle: "\u041f\u0443\u043b\u044c\u0441 \u00b7 \u043b\u0438\u0434\u0435\u0440\u044b \u00b7 \u0441\u0438\u0433\u043d\u0430\u043b\u044b", icon: "dashboard" },
    executive: { title: "\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e", subtitle: "\u0420\u0438\u0441\u043a\u0438 \u00b7 \u0440\u0435\u0448\u0435\u043d\u0438\u044f \u00b7 \u0438\u0442\u043e\u0433", icon: "executive" },
    control: { title: "\u0417\u0430\u0434\u0430\u0447\u0438", subtitle: "\u0417\u0430\u0434\u0430\u0447\u0438 \u00b7 \u0420\u041e\u041f \u00b7 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c", icon: "tasks" },
    "data-health": { title: "\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c", subtitle: "\u0410\u043a\u0446\u0438\u0438 \u00b7 \u0441\u043e\u0431\u044b\u0442\u0438\u044f \u00b7 SKU", icon: "calendar" },
    "sku-plan-fact": { title: "\u041f\u043b\u0430\u043d-\u0444\u0430\u043a\u0442 SKU", subtitle: "\u041f\u043b\u0430\u043d \u00b7 \u0444\u0430\u043a\u0442 \u00b7 \u0447\u0435\u043a \u00b7 \u0414\u0420\u0420", icon: "planfact" },
    repricer: { title: "\u0420\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440", subtitle: "\u0426\u0435\u043d\u0430 \u00b7 \u0440\u0438\u0441\u043a\u0438 \u00b7 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438", icon: "repricer" },
    prices: { title: "\u0426\u0435\u043d\u044b", subtitle: "\u041c\u0430\u0440\u0436\u0430 \u00b7 \u043e\u0431\u043e\u0440\u043e\u0442 \u00b7 \u0421\u041f\u041f", icon: "prices" },
    order: { title: "\u0417\u0430\u043a\u0430\u0437 \u0442\u043e\u0432\u0430\u0440\u0430", subtitle: "\u041a\u043b\u0430\u0441\u0442\u0435\u0440\u044b \u00b7 \u0441\u043a\u043b\u0430\u0434\u044b \u00b7 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438", icon: "order" },
    "oos-control": { title: "OOS \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c", subtitle: "\u041f\u0443\u0441\u0442\u044b\u0435 \u043f\u043e\u043b\u043a\u0438 \u00b7 \u043f\u043e\u0442\u0435\u0440\u0438 \u00b7 \u043c\u0435\u0440\u044b", icon: "oos" },
    "ads-funnel": { title: "\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u044c \u0420\u041a", subtitle: "WB \u00b7 Ozon \u00b7 \u0434\u043d\u0438 \u00b7 \u0441\u043e\u0431\u044b\u0442\u0438\u044f", icon: "ads" },
    "sku-contour": { title: "SKU workspace", subtitle: "\u0420\u0435\u0435\u0441\u0442\u0440 \u00b7 API-\u043a\u043e\u043d\u0442\u0443\u0440 \u00b7 \u043f\u043b\u0430\u043d-\u0444\u0430\u043a\u0442", icon: "sku-workspace" },
    launches: { title: "\u041d\u043e\u0432\u0438\u043d\u043a\u0438", subtitle: "\u0422\u043e\u0432\u0430\u0440 \u00b7 \u043d\u043e\u0432\u0438\u043d\u043a\u0438 \u00b7 \u044d\u043a\u043e\u043d\u043e\u043c\u0438\u043a\u0430", icon: "launches" },
    "iu-drr": { title: "\u0418\u0423 / \u0414\u0420\u0420", subtitle: "\u0418\u0423 \u00b7 WB+Ozon \u00b7 \u0440\u0430\u0441\u0445\u043e\u0434\u044b WB", icon: "analytics" },
    "wb-rating": { title: "\u0420\u0435\u0439\u0442\u0438\u043d\u0433 \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a", subtitle: "WB \u00b7 \u043e\u0442\u0437\u044b\u0432\u044b \u00b7 \u0434\u0438\u043d\u0430\u043c\u0438\u043a\u0430", icon: "rating" },
    "product-leaderboard": { title: "\u041b\u0438\u0434\u0435\u0440\u0431\u043e\u0440\u0434", subtitle: "\u041a\u0417 \u00b7 \u0432\u043e\u0440\u043e\u043d\u043a\u0430 \u00b7 ROMI", icon: "leaderboard" }
  };

  var ROLE_CLASSES = [
    "portal-action-primary",
    "portal-action-secondary",
    "portal-action-filter",
    "portal-action-download",
    "portal-action-upload",
    "portal-action-add",
    "portal-action-calendar",
    "portal-action-open",
    "portal-pill",
    "portal-card-button"
  ];

  var ICONS = {
    dashboard: '<path d="M4 5h7v7H4z"/><path d="M13 5h7v4h-7z"/><path d="M13 11h7v9h-7z"/><path d="M4 14h7v6H4z"/>',
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
    launches: '<path d="M12 3c4 2 6 6 5 11l-5 5-5-5C6 9 8 5 12 3z"/><path d="M12 8h.01"/><path d="M8 16l-3 3"/><path d="M16 16l3 3"/>',
    analytics: '<path d="M12 3v9h9"/><path d="M20 16A9 9 0 1 1 12 3"/><path d="M14 3a9 9 0 0 1 7 7"/>',
    rating: '<path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9 6.6 19.8l1-6.1-4.4-4.3 6.1-.9z"/>',
    leaderboard: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 7H4c0 3 1.5 5 4 5"/><path d="M17 7h3c0 3-1.5 5-4 5"/>',
    fallback: '<path d="M12 5v14"/><path d="M5 12h14"/>'
  };

  var syncing = false;
  var queued = false;

  function setText(el, value) {
    if (el && value && el.textContent !== value) el.textContent = value;
  }

  function iconMarkup(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || ICONS.fallback) + "</svg>";
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
    var subtitle = btn.querySelector(".nav-subtitle") || btn.querySelector("small") || document.createElement("small");
    subtitle.classList.add("nav-subtitle");

    if (title.parentNode !== copy) copy.appendChild(title);
    if (subtitle.parentNode !== copy) copy.appendChild(subtitle);
    if (copy.parentNode !== btn) btn.appendChild(copy);
    if (icon.nextSibling !== copy) btn.insertBefore(copy, icon.nextSibling);

    return { icon: icon, title: title, subtitle: subtitle };
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

  function syncButton(btn, view) {
    ROLE_CLASSES.forEach(function (className) {
      btn.classList.remove(className);
    });
    if (HIDDEN_VIEWS[view]) {
      btn.hidden = true;
      btn.style.display = "none";
      btn.dataset.navHidden = "true";
      btn.setAttribute("aria-hidden", "true");
      btn.tabIndex = -1;
      btn.classList.add("nav-btn-legacy-hidden");
    } else {
      btn.hidden = false;
      btn.style.display = "";
      delete btn.dataset.navHidden;
      btn.removeAttribute("aria-hidden");
      if (btn.tabIndex < 0) btn.removeAttribute("tabindex");
      btn.classList.remove("nav-btn-legacy-hidden");
    }
    var meta = META[view] || {};
    var shell = ensureButtonShell(btn);
    var title = meta.title || shell.title.textContent || view;
    var subtitle = meta.subtitle || shell.subtitle.textContent || "";
    setText(shell.title, title);
    setText(shell.subtitle, subtitle);
    shell.icon.innerHTML = iconMarkup(meta.icon || "fallback");
    btn.dataset.navGroup = VIEW_GROUP[view] || "";
    btn.setAttribute("aria-label", title);
    btn.title = subtitle ? title + " - " + subtitle : title;
  }

  function isHidden(btn) {
    return btn.hidden || btn.classList.contains("nav-btn-legacy-hidden") || btn.getAttribute("aria-hidden") === "true";
  }

  function syncSidebar() {
    if (syncing) return;
    var nav = document.querySelector(".sidebar .nav");
    if (!nav) return;
    syncing = true;
    try {
      removeGroupLabels(nav);
      var buttons = Array.prototype.slice.call(nav.querySelectorAll(".nav-btn[data-view]"));
      var byView = {};
      buttons.forEach(function (btn) {
        var view = String(btn.dataset.view || "").trim();
        if (view) byView[view] = btn;
      });

      Object.keys(HIDDEN_VIEWS).forEach(function (view) {
        if (byView[view]) syncButton(byView[view], view);
      });

      var orderedButtons = [];
      ORDER.forEach(function (view) {
        if (!byView[view]) return;
        syncButton(byView[view], view);
        orderedButtons.push(byView[view]);
      });

      Object.keys(byView).forEach(function (view) {
        if (ORDER.indexOf(view) !== -1 || HIDDEN_VIEWS[view]) return;
        syncButton(byView[view], view);
        orderedButtons.push(byView[view]);
      });

      var lastGroup = "";
      orderedButtons.forEach(function (btn) {
        var group = btn.dataset.navGroup || "";
        if (!isHidden(btn) && group && group !== lastGroup) {
          var label = makeGroupLabel(group);
          if (label) nav.appendChild(label);
          lastGroup = group;
        }
        nav.appendChild(btn);
      });

      Object.keys(HIDDEN_VIEWS).forEach(function (view) {
        if (!byView[view]) return;
        syncButton(byView[view], view);
        if (byView[view].parentNode !== nav) nav.appendChild(byView[view]);
      });
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    if (queued) return;
    queued = true;
    window.setTimeout(function () {
      queued = false;
      syncSidebar();
    }, 40);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncSidebar, { once: true });
  } else {
    syncSidebar();
  }

  window.addEventListener("load", syncSidebar);
  window.addEventListener("altea:viewchange", syncSidebar);
  window.setTimeout(syncSidebar, 360);
  window.setTimeout(syncSidebar, 1320);
  window.setTimeout(syncSidebar, 2600);

  var nav = document.querySelector(".sidebar .nav");
  if (nav && window.MutationObserver) {
    new MutationObserver(function () {
      if (!syncing) scheduleSync();
    }).observe(nav, { childList: true, subtree: true, characterData: true });
  }
})();
