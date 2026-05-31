(function () {
  if (window.__ALTEA_REPRICER_UI_SAFE_20260515A__) return;
  window.__ALTEA_REPRICER_UI_SAFE_20260515A__ = true;
  if (window.__ALTEA_REPRICER_UI_SAFE_20260503A__) return;
  window.__ALTEA_REPRICER_UI_SAFE_20260503A__ = true;
  window.__ALTEA_REPRICER_UI_SAFE_20260502E__ = true;

  const VIEW_ID = "view-repricer";
  let observer = null;
  let enhanceTimer = 0;

  const TOP_ACTION_LABELS = {
    all: "Аудит в Excel",
    "template:wb": "Шаблон WB",
    "template:ozon": "Шаблон Ozon",
    "promo:wb": "WB промо",
    "promo:ozon": "Ozon промо"
  };

  const TOP_ACTION_TITLES = {
    all: "Выгружает полный аудит по всем SKU и площадкам для проверки.",
    "template:wb": "Готовит безопасный файл цен Wildberries: только зелёные строки.",
    "template:ozon": "Готовит безопасный файл цен Ozon: только зелёные строки.",
    "promo:wb": "Готовит безопасный файл акционных цен Wildberries: только зелёные строки.",
    "promo:ozon": "Готовит безопасный файл акционных цен Ozon: только зелёные строки."
  };

  function normalizedText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function replaceOptionTexts(select, replacements) {
    if (!(select instanceof HTMLSelectElement)) return;
    Array.from(select.options).forEach(function (option) {
      const original = normalizedText(option.textContent);
      if (!original) return;
      replacements.forEach(function (pair) {
        if (pair[0].test(original)) option.textContent = pair[1];
      });
    });
  }

  function relabelTopActions(root) {
    Object.keys(TOP_ACTION_LABELS).forEach(function (key) {
      const button = root.querySelector('[data-repricer-export="' + key + '"]');
      if (!button) return;
      button.textContent = TOP_ACTION_LABELS[key];
      button.title = TOP_ACTION_TITLES[key];
      button.setAttribute("aria-label", TOP_ACTION_TITLES[key]);
    });
  }

  function simplifyTopActions(root) {
    const actionBar = root.querySelector(".section-title .quick-actions, [data-repricer-operator-actions] > .quick-actions");
    if (!actionBar) return;
    const existingMore = actionBar.querySelector(".repricer-more-actions");
    if (existingMore && existingMore.querySelector(".repricer-more-action-buttons")) return;
    if (existingMore) existingMore.remove();
    const auditButton = actionBar.querySelector('[data-repricer-export="all"]');
    const wbButton = actionBar.querySelector('[data-repricer-export="template:wb"]');
    const ozonButton = actionBar.querySelector('[data-repricer-export="template:ozon"]');
    const wbPromoButton = actionBar.querySelector('[data-repricer-export="promo:wb"]');
    const ozonPromoButton = actionBar.querySelector('[data-repricer-export="promo:ozon"]');
    const extraButtons = Array.from(actionBar.querySelectorAll("button")).filter(function (button) {
      return !button.hasAttribute("data-repricer-export") && !button.hasAttribute("data-repricer-more-actions-toggle");
    });
    if (!wbButton || !ozonButton) return;

    const more = document.createElement("span");
    more.className = "repricer-more-actions";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "quick-chip";
    toggle.setAttribute("data-repricer-more-actions-toggle", "1");
    toggle.textContent = "Ещё";
    more.appendChild(toggle);

    const moreBody = document.createElement("div");
    moreBody.className = "quick-actions repricer-more-action-buttons hidden";
    [auditButton, wbPromoButton, ozonPromoButton].forEach(function (button) {
      if (button) moreBody.appendChild(button);
    });
    more.appendChild(moreBody);

    actionBar.replaceChildren(wbButton, ozonButton);
    if (moreBody.children.length) actionBar.appendChild(more);
    extraButtons.forEach(function (button) {
      actionBar.appendChild(button);
    });
  }

  document.addEventListener("click", function (event) {
    const toggle = event.target && event.target.closest
      ? event.target.closest("[data-repricer-more-actions-toggle]")
      : null;
    if (toggle) {
      const menu = toggle.closest(".repricer-more-actions")?.querySelector(".repricer-more-action-buttons");
      if (menu) menu.classList.toggle("hidden");
      event.preventDefault();
      return;
    }
    if (event.target && event.target.closest && event.target.closest(".repricer-more-actions")) return;
    document.querySelectorAll(".repricer-more-action-buttons:not(.hidden)").forEach(function (menu) {
      menu.classList.add("hidden");
    });
  });

  function refineIntro(root) {
    const intro = root.querySelector(".section-title p");
    if (!intro) return;
    intro.textContent = "Здесь решаем три вещи: рабочие границы цены по SKU, текущую рекомендацию модели и точки, где уже включено ручное решение вместо автоматики.";
  }

  function refineSummaries(root) {
    root.querySelectorAll("details > summary").forEach(function (summary) {
      const text = normalizedText(summary.textContent);
      if (text === "Управлять SKU") summary.textContent = "Карточка SKU";
      if (text === "Управлять площадкой") summary.textContent = "Управление площадкой";
    });
  }

  function refineFilters(root) {
    const blankSelects = Array.from(root.querySelectorAll("select")).filter(function (select) {
      return !String(select.name || "").trim();
    });
    if (blankSelects[0]) {
      blankSelects[0].title = "Фильтр по площадке.";
    }
    if (blankSelects[1]) {
      replaceOptionTexts(blankSelects[1], [
        [/^Только с изменением цены$/i, "Требует решения"],
        [/^Только с override$/i, "Ручные решения"],
        [/^Только promo$/i, "Промо"],
        [/^Freeze \/ Hold \/ Force$/i, "Заморозка / фиксация"],
        [/^Ниже floor$/i, "Ниже MIN"],
        [/^Все SKU$/i, "Показать всё"]
      ]);
      blankSelects[1].title = "Главный фильтр экрана: где нужно решение, где уже стоит ручной режим и где есть промо.";
    }
    if (blankSelects[2]) {
      replaceOptionTexts(blankSelects[2], [
        [/^Только fee-ready$/i, "Готовая экономика"],
        [/^Только fee stack$/i, "Есть fee stack"],
        [/^Только mixed guard$/i, "Есть mixed guard"],
        [/^Только fallback$/i, "Через fallback"]
      ]);
      blankSelects[2].title = "Показывает, насколько уверенно собрана экономика по SKU.";
    }
  }

  function refineForms(root) {
    root.querySelectorAll(".repricer-override-form").forEach(function (form) {
      const floor = form.querySelector('[name="floorPrice"]');
      const cap = form.querySelector('[name="capPrice"]');
      const force = form.querySelector('[name="forcePrice"]');
      const promo = form.querySelector('[name="promoPrice"]');
      const note = form.querySelector('[name="note"]');
      if (floor) floor.title = "Ручной MIN. Синхронизируется с вкладкой «Цены».";
      if (cap) cap.title = "Ручной MAX. Синхронизируется с вкладкой «Цены».";
      if (force) force.title = "Фиксированная цена для конкретной SKU и площадки.";
      if (promo) promo.title = "Промо-цена внутри промо-окна.";
      if (note) note.placeholder = "Почему ставим ручное решение";
    });

    root.querySelectorAll(".repricer-corridor-form").forEach(function (form) {
      const hardFloor = form.querySelector('[name="hardFloor"]');
      const basePrice = form.querySelector('[name="basePrice"]');
      const stretchCap = form.querySelector('[name="stretchCap"]');
      const promoFloor = form.querySelector('[name="promoFloor"]');
      if (hardFloor) hardFloor.title = "Жесткий MIN внутри репрайсера.";
      if (basePrice) basePrice.title = "База, от которой модель двигает цену.";
      if (stretchCap) stretchCap.title = "MAX внутри репрайсера для этой площадки.";
      if (promoFloor) promoFloor.title = "Минимум для промо-цены.";
    });
  }

  function parseMoneyLike(value) {
    if (value === null || value === undefined) return NaN;
    const normalized = String(value).replace(/\s+/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : NaN;
  }

  function backfillCapLiftBadge(root) {
    root.querySelectorAll(".repricer-side").forEach(function (side) {
      if (!side || side.querySelector(".altea-cap-lift-badge")) return;
      const chips = Array.from(side.querySelectorAll(".badge-stack .chip"));
      const minChip = chips.find(function (chip) {
        return /^MIN\s/i.test(normalizedText(chip.textContent));
      });
      const maxChip = chips.find(function (chip) {
        return /^MAX\s/i.test(normalizedText(chip.textContent));
      });
      const capInput = side.querySelector('.repricer-override-form [name="capPrice"]');
      if (!minChip || !maxChip || !capInput) return;

      const manualCap = parseMoneyLike(capInput.value);
      const minValue = parseMoneyLike(minChip.textContent);
      const maxValue = parseMoneyLike(maxChip.textContent);
      if (!(manualCap > 0 && minValue > 0 && maxValue > 0 && manualCap + 0.001 < minValue)) return;

      const suffix = normalizedText(maxChip.textContent).replace(/^MAX\s*/i, "").trim();
      const badge = document.createElement("span");
      badge.className = "chip warn portal-pill altea-cap-lift-badge";
      badge.textContent = suffix ? "MAX поднят до MIN " + suffix : "MAX поднят до MIN";
      maxChip.insertAdjacentElement("afterend", badge);
    });
  }

  function enhanceNow() {
    const root = document.getElementById(VIEW_ID);
    if (!root || !root.children.length) return;
    if (root.dataset.repricerNativeSimple === "1") return;
    relabelTopActions(root);
    simplifyTopActions(root);
    refineIntro(root);
    refineSummaries(root);
    refineFilters(root);
    refineForms(root);
    backfillCapLiftBadge(root);
  }

  function enhance() {
    window.clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(enhanceNow, 80);
  }

  function installObserver() {
    const root = document.getElementById(VIEW_ID);
    if (!root || observer) return;
    observer = new MutationObserver(function () {
      enhance();
    });
    observer.observe(root, { childList: true });
  }

  function wrapFunction(name) {
    const current = window[name];
    if (typeof current !== "function" || current.__alteaRepricerUiSafeWrapped) return;
    const wrapped = function () {
      const result = current.apply(this, arguments);
      enhanceNow();
      return result;
    };
    wrapped.__alteaRepricerUiSafeWrapped = true;
    window[name] = wrapped;
  }

  function installWrappers() {
    wrapFunction("renderRepricer");
    wrapFunction("rerenderCurrentView");
  }

  function runEnhancePasses() {
    installObserver();
    installWrappers();
    enhanceNow();
    [120, 400, 1200, 2500, 5000].forEach(function (delay) {
      window.setTimeout(function () {
        installObserver();
        installWrappers();
        enhanceNow();
      }, delay);
    });
  }

  document.addEventListener("click", function (event) {
    const target = event.target && event.target.closest ? event.target.closest('[data-view="repricer"]') : null;
    if (!target) return;
    window.setTimeout(function () {
      runEnhancePasses();
    }, 120);
  });

  document.addEventListener("DOMContentLoaded", function () {
    runEnhancePasses();
  }, { once: true });

  window.addEventListener("load", function () {
    runEnhancePasses();
  }, { once: true });

  runEnhancePasses();
})();
