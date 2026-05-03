(function () {
  if (window.__ALTEA_UX_UNIFY_20260503E__) return;
  window.__ALTEA_UX_UNIFY_20260503E__ = true;
  window.__ALTEA_UX_UNIFY_20260503D__ = true;
  window.__ALTEA_UX_UNIFY_20260503C__ = true;
  window.__ALTEA_UX_UNIFY_20260503B__ = true;
  window.__ALTEA_UX_UNIFY_20260503A__ = true;
  window.__ALTEA_UX_UNIFY_20260502A__ = true;

  var BUTTON_SELECTOR = [
    "button",
    "label.file-input",
    "a.link-btn",
    ".quick-chip",
    ".btn",
    ".market-tab",
    ".pw-chip",
    ".portal-exec-filter-chip",
    ".portal-exec-date-trigger",
    ".pw-kz-badge",
    ".chip",
    ".sku-pill",
    ".sync-status"
  ].join(",");

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

  var FILTER_EXACT = [
    "all",
    "wb",
    "ozon",
    "все",
    "сегодня",
    "вчера",
    "активные",
    "просроченные",
    "критичные",
    "ручные",
    "промо",
    "показать всё"
  ];

  var FILTER_PARTS = [
    "дн",
    "срез",
    "недел",
    "ниже min",
    "требует решения",
    "ям",
    "сет"
  ];

  var DOWNLOAD_PARTS = ["excel", "audit", "скач", "выгруз", "экспорт"];
  var UPLOAD_PARTS = ["import", "импорт", "загруз"];
  var ADD_PARTS = ["new", "добав", "создат", "поставить"];
  var CALENDAR_PARTS = ["calendar", "календар", "срок"];
  var OPEN_PARTS = ["open", "откр", "перейт", "подробн"];

  var VIEW_META = {
    dashboard: {
      eyebrow: "Рабочий порядок",
      title: "Сначала общий результат, затем площадки и точки риска.",
      text: "Этот экран нужен для ежедневного понимания, где рост, где просадка и что уже требует решения команды.",
      chips: ["Общий результат", "Площадки", "Точки риска"]
    },
    control: {
      eyebrow: "Контур задач",
      title: "Постановка, согласование и контроль в одном месте.",
      text: "Команда видит новую задачу, статус согласования, историю апдейтов и следующий шаг без переходов между разными экранами.",
      chips: ["Новая задача", "Согласование", "История"]
    },
    executive: {
      eyebrow: "Решения руководителя",
      title: "Сначала общий риск, затем очередь директора, затем owner и новинки.",
      text: "Экран собран сверху вниз, чтобы руководитель сначала видел общий контур, а потом уже конкретные узкие места и запуски.",
      chips: ["Общий риск", "Очередь РОП", "Owner и новинки"]
    },
    launches: {
      eyebrow: "Календарь Ксюши",
      title: "Фильтр по новинкам, связка с SKU, gantt и задачи в одном рабочем слое.",
      text: "Здесь удобно вести файл новинок прямо в портале: смотреть покрытие данных, запуск, блокеры и выгружать текущий срез в Excel.",
      chips: ["Фильтры", "Gantt", "Задачи"]
    },
    "launch-control": {
      eyebrow: "Операционный запуск",
      title: "Видно, какая фаза держит запуск и какой шаг нужен следующим.",
      text: "Экран собирает ближайшие новинки, этапы запуска и блокеры так, чтобы команда быстро возвращала товар в движение.",
      chips: ["Скоро к запуску", "Фазы", "Блокеры"]
    },
    "product-leaderboard": {
      eyebrow: "Продуктовая воронка",
      title: "Воронка недели и SKU-сигналы читаются сверху вниз.",
      text: "Сначала верх воронки и история выгрузок, ниже владельцы, категории, риски и отфильтрованный Excel по текущему срезу.",
      chips: ["Охваты", "Клики", "Корзины"]
    },
    prices: {
      eyebrow: "Работа с ценами",
      title: "Цена MP, рабочий MIN/MAX и связь с репрайсером собраны в одной таблице.",
      text: "Вкладка показывает, чем мы торгуем сейчас, где рабочий коридор, что пришло из репрайсера и что можно сразу выгрузить в Excel.",
      chips: ["Цена MP", "MIN / MAX", "Excel"]
    },
    repricer: {
      eyebrow: "Ценовые решения",
      title: "Модель, рабочие пороги и ручные решения по площадкам видны рядом.",
      text: "Экран помогает быстро понять, где цена расходится с моделью, где включено ручное решение и какой шаблон можно уже отправлять.",
      chips: ["Модель", "Ручное решение", "Шаблон Excel"]
    }
  };

  var LABEL_RULES = [
    { selector: "[data-view-control]", text: "Перейти в задачи", title: "Открыть командный контур задач" },
    { selector: "[data-launch-export='product']", text: "Выгрузить в Excel", title: "Скачать текущий продуктовый срез в Excel" },
    { selector: "[data-launch-export='launch-control']", text: "Выгрузить запуск в Excel", title: "Скачать операционный запуск новинок в Excel" },
    { selector: "[data-launch-download-form]", text: "Скачать форму Excel", title: "Скачать шаблон для загрузки новинок" },
    { selector: "[data-launch-import]", text: "Загрузить файл новинок", title: "Загрузить файл новинок в портал" },
    { selector: "[data-product-leaderboard-export]", text: "Выгрузить в Excel", title: "Скачать текущий лидерборд в Excel" },
    { selector: "[data-price-export='summary']", text: "Свод в Excel", title: "Скачать сводный отчет по ценам" },
    { selector: "[data-price-export='daily']", text: "Динамика по дням", title: "Скачать ценовую динамику по дням" },
    { selector: "[data-price-minmax-template]", text: "Скачать MIN/MAX (TSV)", title: "Скачать TSV-шаблон для ручной загрузки MIN/MAX" },
    { selector: "[data-price-minmax-import]", text: "Загрузить MIN/MAX", title: "Загрузить TSV/CSV-файл с ручными MIN/MAX" },
    { selector: "[data-repricer-export='all']", text: "Аудит в Excel", title: "Скачать полный аудит репрайсера в Excel" },
    { selector: "[data-repricer-export='template:wb']", text: "Шаблон WB", title: "Скачать шаблон WB по текущему срезу" },
    { selector: "[data-repricer-export='template:ozon']", text: "Шаблон Ozon", title: "Скачать шаблон Ozon по текущему срезу" },
    { selector: "[data-repricer-export='promo:wb']", text: "WB промо", title: "Скачать промо-выгрузку WB" },
    { selector: "[data-repricer-export='promo:ozon']", text: "Ozon промо", title: "Скачать промо-выгрузку Ozon" },
    { selector: "[data-repricer-quick-mode='changes']", text: "Требуют решения", title: "Показать SKU, где нужно решение по цене" },
    { selector: "[data-repricer-quick-mode='manual']", text: "Ручные решения", title: "Показать SKU с ручными решениями" },
    { selector: "[data-repricer-list-size='focus']", text: "40 SKU", title: "Показать первые 40 SKU" },
    { selector: "[data-repricer-list-size='expanded']", text: "80 SKU", title: "Показать первые 80 SKU" },
    { selector: "[data-repricer-list-size='all']", text: "Все SKU", title: "Показать все SKU на экране" },
    { selector: "#exportStorageBtn", text: "Скачать backup", title: "Скачать локальный backup портала" }
  ];

  function textOf(node) {
    return String((node && node.textContent) || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function containsAny(text, parts) {
    return parts.some(function (part) {
      return text.indexOf(part) >= 0;
    });
  }

  function resetRoles(node) {
    ROLE_CLASSES.forEach(function (className) {
      node.classList.remove(className);
    });
  }

  function classifyNode(node) {
    if (!(node instanceof HTMLElement)) return;
    if (!node.matches(BUTTON_SELECTOR)) return;

    if (node.tagName === "BUTTON" && !node.getAttribute("type")) {
      node.setAttribute("type", "button");
    }

    resetRoles(node);

    if (node.closest("#view-prices .pw-table-head .pw-chip-row")) {
      return;
    }

    var text = textOf(node);
    var isFilter =
      node.matches(".pw-chip, .market-tab, .portal-exec-filter-chip, [data-v86-market], [data-v86-preset]") ||
      node.hasAttribute("data-control-preset") ||
      node.hasAttribute("data-launch-preset") ||
      node.hasAttribute("data-repricer-quick-mode") ||
      node.hasAttribute("data-repricer-list-size") ||
      FILTER_EXACT.indexOf(text) >= 0 ||
      containsAny(text, FILTER_PARTS);
    var isDownload =
      node.hasAttribute("data-product-leaderboard-export") ||
      node.hasAttribute("data-launch-export") ||
      node.hasAttribute("data-launch-download-form") ||
      node.hasAttribute("data-price-export") ||
      node.hasAttribute("data-price-minmax-template") ||
      node.hasAttribute("data-repricer-export") ||
      node.id === "exportStorageBtn" ||
      containsAny(text, DOWNLOAD_PARTS);
    var isUpload =
      node.hasAttribute("data-launch-import") ||
      node.hasAttribute("data-price-minmax-import") ||
      node.matches("label.file-input") ||
      containsAny(text, UPLOAD_PARTS);
    var isAdd =
      node.hasAttribute("data-launch-add") ||
      containsAny(text, ADD_PARTS);
    var isCalendar =
      node.matches(".portal-exec-date-trigger") ||
      node.hasAttribute("data-portal-exec-open-date") ||
      containsAny(text, CALENDAR_PARTS);
    var isOpen =
      node.matches(".sku-pill, .pw-kz-badge") ||
      node.hasAttribute("data-open-task") ||
      node.hasAttribute("data-open-sku") ||
      node.hasAttribute("data-launch-edit") ||
      containsAny(text, OPEN_PARTS);
    var isSecondaryAction =
      node.hasAttribute("data-launch-reset") ||
      node.hasAttribute("data-repricer-settings-reset") ||
      node.hasAttribute("data-repricer-sku-reset") ||
      node.hasAttribute("data-repricer-corridor-reset") ||
      node.hasAttribute("data-repricer-reset");
    var isPill = node.matches(".pw-kz-badge, .chip, .sku-pill, .sync-status");
    var isPrimary = node.matches(".btn.primary") || isDownload || isAdd;
    var isSecondary =
      node.matches(".btn.ghost, .btn.small-btn, .altea-order-procurement__platform-btn") ||
      node.hasAttribute("data-take-task") ||
      isUpload ||
      isCalendar ||
      isOpen ||
      isSecondaryAction;

    if (isPrimary) node.classList.add("portal-action-primary");
    if (isSecondary) node.classList.add("portal-action-secondary");
    if (isFilter) node.classList.add("portal-action-filter");
    if (isDownload) node.classList.add("portal-action-download");
    if (isUpload) node.classList.add("portal-action-upload");
    if (isAdd) node.classList.add("portal-action-add");
    if (isCalendar) node.classList.add("portal-action-calendar");
    if (isOpen) node.classList.add("portal-action-open");
    if (isPill) node.classList.add("portal-pill");
    if (node.matches("button.card.kpi")) node.classList.add("portal-card-button");
  }

  function applyRoles(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(BUTTON_SELECTOR).forEach(classifyNode);
  }

  function activeViewRoot() {
    return document.querySelector(".view.active");
  }

  function viewKeyFromRoot(root) {
    if (!(root instanceof HTMLElement)) return "";
    return String(root.id || "").replace(/^view-/, "");
  }

  function setText(root, selector, value) {
    var node = root && root.querySelector ? root.querySelector(selector) : null;
    if (!node || node.textContent === value) return;
    node.textContent = value;
  }

  function markNodes(root, selector, className) {
    if (!(root instanceof HTMLElement)) return;
    root.querySelectorAll(selector).forEach(function (node) {
      node.classList.add(className);
    });
  }

  function applyLabelRules(root) {
    if (!(root instanceof HTMLElement)) return;
    LABEL_RULES.forEach(function (rule) {
      root.querySelectorAll(rule.selector).forEach(function (node) {
        if (!(node instanceof HTMLElement)) return;
        if (textOf(node) !== textOf({ textContent: rule.text })) {
          node.textContent = rule.text;
        }
        if (rule.title) {
          node.title = rule.title;
          node.setAttribute("aria-label", rule.title);
        } else {
          node.setAttribute("aria-label", rule.text);
        }
      });
    });
  }

  function rewriteViewCopy(root, viewKey) {
    if (viewKey === "dashboard") {
      setText(root, ".portal-exec-head p", "Сначала общий результат по площадкам, затем узкие места и сигналы, которые нужно разобрать команде сегодня.");
      return;
    }
    if (viewKey === "control") {
      setText(root, ".section-title p", "Единый контур задач для команды: постановка, согласование у РОПов и финальное решение без потери истории.");
      return;
    }
    if (viewKey === "executive") {
      setText(root, ".section-title p", "Сначала общий уровень риска, затем очередь руководителя, затем owner и новинки — чтобы решения принимались сверху вниз.");
      return;
    }
    if (viewKey === "launches") {
      setText(root, ".section-title p", "Главный экран Ксюши: здесь видно календарь новинок, связку с SKU, gantt, задачи и все блокеры по запуску.");
      return;
    }
    if (viewKey === "launch-control") {
      setText(root, ".section-title p", "Операционный экран запуска: что держит новинку сейчас, какие позиции скоро стартуют и какой шаг нужен следующим.");
      return;
    }
    if (viewKey === "product-leaderboard") {
      setText(root, ".section-title p", "Еженедельный слой по продукту: сверху воронка и история, ниже SKU с охватами, кликами, корзинами, экономикой и сигналами.");
      return;
    }
    if (viewKey === "prices") {
      setText(root, ".pw-sub", "Здесь команда работает с текущей ценой, рабочим MIN/MAX, маржой и связкой с репрайсером. Свежесть среза и источник данных портал показывает отдельно выше таблицы.");
      return;
    }
    if (viewKey === "repricer") {
      setText(root, ".section-title p", "Здесь в одном месте сходятся текущая цена, рабочий MIN/MAX из «Цен», модель репрайсера и ручные решения по каждой площадке.");
    }
  }

  function buildGuide(meta, viewKey) {
    var node = document.createElement("div");
    node.className = "portal-view-guide";
    node.setAttribute("data-portal-view-guide", viewKey);
    node.innerHTML = [
      '<div class="portal-view-guide-copy">',
      '<div class="portal-view-eyebrow">', meta.eyebrow, "</div>",
      "<strong>", meta.title, "</strong>",
      "<p>", meta.text, "</p>",
      "</div>",
      '<div class="portal-view-guide-chips">',
      meta.chips.map(function (chip) {
        return '<span class="portal-view-guide-chip">' + chip + "</span>";
      }).join(""),
      "</div>"
    ].join("");
    return node;
  }

  function guideAnchor(root, viewKey) {
    if (viewKey === "prices") return root.querySelector(".pw-card");
    if (viewKey === "dashboard") return root.querySelector(".portal-exec-surface, .portal-exec-section");
    return root.querySelector(".section-title");
  }

  function ensureGuide(root, viewKey) {
    if (!(root instanceof HTMLElement)) return;
    if (root.querySelector("[data-portal-view-guide='" + viewKey + "']")) return;
    var meta = VIEW_META[viewKey];
    if (!meta) return;
    var anchor = guideAnchor(root, viewKey);
    if (!anchor) return;
    var guide = buildGuide(meta, viewKey);

    if (viewKey === "prices") {
      var sub = anchor.querySelector(".pw-sub");
      if (sub) {
        sub.insertAdjacentElement("afterend", guide);
        return;
      }
      anchor.appendChild(guide);
      return;
    }

    if (viewKey === "dashboard") {
      var head = anchor.querySelector(".portal-exec-head");
      if (head) {
        head.insertAdjacentElement("afterend", guide);
        return;
      }
    }

    anchor.insertAdjacentElement("afterend", guide);
  }

  function decorateView(root) {
    if (!(root instanceof HTMLElement)) return;
    var viewKey = viewKeyFromRoot(root);
    if (!viewKey) return;

    document.body.dataset.portalView = viewKey;
    root.classList.add("portal-view-shell");
    root.classList.add("portal-view-" + viewKey.replace(/[^a-z0-9-]/gi, "-"));

    markNodes(root, ".quick-actions, .pw-chip-row, .portal-exec-actions, .portal-exec-presets, .portal-exec-dates", "portal-toolbar");
    markNodes(root, ".control-filters, .filters, .launch-filter-grid, .pw-grid2, .repricer-filters", "portal-filter-grid");
    markNodes(root, ".empty, .pw-empty", "portal-empty");
    markNodes(
      root,
      ".card, .list-item, .pw-card, .repricer-side, .repricer-guide-card, .repricer-settings-card, .portal-exec-surface, .portal-exec-section, .portal-exec-card, .portal-exec-period-panel, .portal-exec-issue-row, .ui-group, .comment-item, .owner-row, .alert-row",
      "portal-surface"
    );

    applyLabelRules(root);
    rewriteViewCopy(root, viewKey);
    ensureGuide(root, viewKey);
  }

  function decorateFloatingPanels() {
    var taskBody = document.getElementById("taskModalBody");
    if (taskBody) {
      applyLabelRules(taskBody);
      markNodes(taskBody, ".card, .ui-group, .comment-item, .owner-row, .alert-row", "portal-surface");
      markNodes(taskBody, ".quick-actions, .ui-actions", "portal-toolbar");
      markNodes(taskBody, ".empty", "portal-empty");
    }

    var priceModalHost = document.getElementById("priceSimpleModalHost");
    if (priceModalHost) {
      applyLabelRules(priceModalHost);
      markNodes(priceModalHost, ".pw-card, .pw-modal-box", "portal-surface");
      markNodes(priceModalHost, ".pw-chip-row", "portal-toolbar");
    }
  }

  var queued = false;

  function mutationTouchesDecoratedSurface(node) {
    if (!node || node.nodeType !== 1) return false;
    if (typeof node.closest !== "function") return false;
    return Boolean(node.closest(".view.active, #taskModalBody, #priceSimpleModalHost, #skuModal, #launchEditorModal, #taskModal"));
  }

  function mutationIsRelevant(mutation) {
    var target = mutation && mutation.target;
    if (target && target.nodeType === 1 && typeof target.closest === "function" && target.closest(".sidebar .nav")) {
      return false;
    }

    if (mutationTouchesDecoratedSurface(target)) return true;

    var addedNodes = Array.prototype.slice.call((mutation && mutation.addedNodes) || []);
    var removedNodes = Array.prototype.slice.call((mutation && mutation.removedNodes) || []);
    return addedNodes.concat(removedNodes).some(mutationTouchesDecoratedSurface);
  }

  function scheduleApply() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      if (document.body) document.body.classList.add("theme-sand-dark");
      applyRoles(document);
      decorateView(activeViewRoot());
      decorateFloatingPanels();
    });
  }

  function boot() {
    if (document.body) document.body.classList.add("theme-sand-dark");
    applyRoles(document);
    decorateView(activeViewRoot());
    decorateFloatingPanels();

    var observer = new MutationObserver(function (mutations) {
      if (!Array.isArray(mutations) || !mutations.some(mutationIsRelevant)) return;
      scheduleApply();
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    window.addEventListener("altea:viewchange", scheduleApply);
    window.addEventListener("altea:portal-storage-updated", scheduleApply);
    window.addEventListener("load", scheduleApply, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
