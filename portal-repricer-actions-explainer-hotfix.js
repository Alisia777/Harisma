(function () {
  if (window.__ALTEA_REPRICER_ACTIONS_EXPLAINER_20260425A__) return;
  window.__ALTEA_REPRICER_ACTIONS_EXPLAINER_20260425A__ = true;

  var VIEW_ID = "view-repricer";
  var STYLE_ID = "altea-repricer-actions-explainer-style";
  var enhanceTimer = 0;
  var observer = null;

  var TOP_ACTIONS = {
    "Audit Excel": "Выгружает полный аудит по всем SKU и площадкам для проверки. Ничего не меняет в портале и не отправляет цены в маркетплейс автоматически.",
    "WB загрузка": "Готовит шаблон обычных цен для ручной загрузки в WB по финальным рекомендациям репрайсера.",
    "Ozon загрузка": "Готовит шаблон обычных цен для ручной загрузки в Ozon по финальным рекомендациям репрайсера.",
    "WB promo загрузка": "Готовит отдельный WB-шаблон только для акционных строк и промо-окон.",
    "Ozon promo загрузка": "Готовит отдельный Ozon-шаблон только для акционных строк и промо-окон."
  };

  var SETTINGS_ACTIONS = {
    "Сохранить сейчас": "Принудительно сохраняет общие настройки контура немедленно. Это ручной дубль автосохранения.",
    "Сбросить к базовым": "Удаляет ручные настройки контура и возвращает базовые значения. Влияет на весь контур, а не на одну SKU."
  };

  var CORRIDOR_ACTIONS = {
    "Сохранить коридор": "Запоминает ручные границы цены для одной SKU на одной площадке: floor, base, cap и promo floor.",
    "Сбросить коридор": "Удаляет ручной коридор для этой SKU/площадки и возвращает строку к источникам модели."
  };

  var OVERRIDE_ACTIONS = {
    "Сохранить override": "Сохраняет ручной режим и ручные цены для одной SKU на одной площадке. Override остаётся активным, пока вы его не снимете.",
    "Сбросить override": "Полностью снимает ручной override и возвращает строку в автоматический режим модели.",
    "Принять предложение акции": "Копирует предложение акции из фактов в обычный ручной override, чтобы его можно было сохранить и дальше редактировать как решение."
  };

  function normalizedText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#view-repricer .repricer-ux-guide{margin-top:12px;padding:14px 16px;border-radius:18px;border:1px solid rgba(214,175,85,.14);background:rgba(214,175,85,.05);display:grid;gap:10px;}",
      "#view-repricer .repricer-ux-guide summary{cursor:pointer;font-weight:700;color:#f4ead6;}",
      "#view-repricer .repricer-ux-guide-list{display:grid;gap:8px;margin-top:10px;}",
      "#view-repricer .repricer-ux-guide-item{padding:10px 12px;border-radius:14px;border:1px solid rgba(214,175,85,.12);background:rgba(9,7,5,.42);}",
      "#view-repricer .repricer-ux-note{margin-top:8px;padding:10px 12px;border-radius:14px;border:1px solid rgba(214,175,85,.12);background:rgba(214,175,85,.04);}",
      "#view-repricer .repricer-ux-note strong{display:block;margin-bottom:4px;color:#f4ead6;}"
    ].join("");
    document.head.appendChild(style);
  }

  function setButtonTitle(button, text) {
    if (!button || !text) return;
    button.title = text;
    button.setAttribute("aria-label", text);
  }

  function findButton(root, label) {
    var normalized = normalizedText(label);
    return Array.from(root.querySelectorAll("button")).find(function (button) {
      return normalizedText(button.textContent) === normalized;
    }) || null;
  }

  function buildGuide(title, intro, items) {
    var details = document.createElement("details");
    details.className = "repricer-ux-guide";
    details.innerHTML = "<summary>" + escapeHtml(title) + "</summary>";

    var body = document.createElement("div");
    body.className = "repricer-ux-guide-list";
    if (intro) {
      var introNode = document.createElement("div");
      introNode.className = "muted small";
      introNode.textContent = intro;
      body.appendChild(introNode);
    }

    Object.keys(items).forEach(function (label) {
      var card = document.createElement("div");
      card.className = "repricer-ux-guide-item";
      card.innerHTML = "<strong>" + escapeHtml(label) + "</strong><div class=\"muted small\" style=\"margin-top:4px\">" + escapeHtml(items[label]) + "</div>";
      body.appendChild(card);
    });

    details.appendChild(body);
    return details;
  }

  function ensureTopGuide(root) {
    if (root.querySelector("[data-repricer-ux-top-guide]")) return;
    var sectionTitle = root.querySelector(".section-title");
    if (!sectionTitle) return;
    var guide = buildGuide(
      "Что делает каждая кнопка в репрайсере",
      "Важно: эти кнопки не отправляют цены в WB/Ozon автоматически. Они либо сохраняют настройки внутри портала, либо выгружают файл, который потом загружается вручную.",
      TOP_ACTIONS
    );
    guide.dataset.repricerUxTopGuide = "true";
    sectionTitle.insertAdjacentElement("afterend", guide);
  }

  function ensureSettingsGuide(root) {
    var form = root.querySelector("#repricerSettingsForm");
    if (!form || form.querySelector("[data-repricer-ux-settings-guide]")) return;
    var guide = buildGuide(
      "Что делают кнопки в настройках контура",
      "Верхний блок меняет общие правила расчёта для всего контура. Это не настройка одной SKU.",
      SETTINGS_ACTIONS
    );
    guide.dataset.repricerUxSettingsGuide = "true";
    form.appendChild(guide);
  }

  function ensureContextBlocks(root) {
    root.querySelectorAll(".repricer-side").forEach(function (side) {
      if (side.querySelector("[data-repricer-ux-context]")) return;
      var directInfo = Array.from(side.children).filter(function (node) {
        return node.matches && node.matches(".muted.small") && !node.closest("details");
      });
      if (!directInfo.length) return;

      var details = document.createElement("details");
      details.dataset.repricerUxContext = "true";
      details.style.marginTop = "8px";
      details.innerHTML = "<summary class=\"small muted\" style=\"cursor:pointer\">Почему такая цена сейчас</summary>";

      var body = document.createElement("div");
      body.className = "stack";
      body.style.marginTop = "10px";
      body.style.gap = "6px";

      var note = document.createElement("div");
      note.className = "muted small";
      note.textContent = "Этот блок только объясняет текущее решение репрайсера: стратегию, причину и контекст расчёта. Он ничего не сохраняет и не меняет.";
      body.appendChild(note);

      directInfo.forEach(function (node, index) {
        if (index === 0) node.style.fontWeight = "600";
        body.appendChild(node);
      });

      details.appendChild(body);
      var firstDetails = side.querySelector("details");
      if (firstDetails) side.insertBefore(details, firstDetails);
      else side.appendChild(details);
    });
  }

  function enhanceHistorySummaries(root) {
    root.querySelectorAll("details[data-repricer-history]").forEach(function (details) {
      var summary = details.querySelector("summary");
      if (summary) summary.textContent = "История расчёта и источники";
      var stack = details.querySelector(".stack");
      if (stack && !stack.querySelector("[data-repricer-ux-history-note]")) {
        var note = document.createElement("div");
        note.className = "muted small";
        note.dataset.repricerUxHistoryNote = "true";
        note.textContent = "Здесь видны источники floor/base/cap, промо, alignment, guard-ограничения и дата свежести истории. Это объяснение расчёта, а не ручная настройка.";
        stack.insertBefore(note, stack.firstChild);
      }
    });
  }

  function enhanceForms(root) {
    root.querySelectorAll(".repricer-corridor-form").forEach(function (form) {
      if (!form.querySelector("[data-repricer-ux-corridor-note]")) {
        var note = document.createElement("div");
        note.className = "repricer-ux-note";
        note.dataset.repricerUxCorridorNote = "true";
        note.innerHTML = "<strong>Коридор цены</strong><div class=\"muted small\">Коридор задаёт ручные границы модели для этой SKU на этой площадке: нижнюю защиту, базу, верхнюю крышу и promo floor. Пока коридор сохранён, модель опирается на него.</div>";
        form.insertBefore(note, form.firstChild);
      }
      Object.keys(CORRIDOR_ACTIONS).forEach(function (label) {
        setButtonTitle(findButton(form, label), CORRIDOR_ACTIONS[label]);
      });
    });

    root.querySelectorAll(".repricer-override-form").forEach(function (form) {
      if (!form.querySelector("[data-repricer-ux-override-note]")) {
        var note = document.createElement("div");
        note.className = "repricer-ux-note";
        note.dataset.repricerUxOverrideNote = "true";
        note.innerHTML = "<strong>Ручной override</strong><div class=\"muted small\">Override действует только на одну SKU и одну площадку. Здесь можно зафиксировать режим, ручной floor/cap/force и окно акции. Пока override сохранён, он имеет приоритет над автоматическим решением модели.</div>";
        form.insertBefore(note, form.firstChild);
      }
      if (!form.querySelector("[data-repricer-ux-mode-help]")) {
        var help = document.createElement("div");
        help.className = "muted small";
        help.dataset.repricerUxModeHelp = "true";
        help.style.marginTop = "8px";
        help.textContent = "Auto — вернуть модель; Hold — удерживать текущий контур; Freeze — не двигать автоматически; Force — принудительно держать цену force price.";
        var firstFilters = form.querySelector(".filters");
        if (firstFilters) firstFilters.insertAdjacentElement("afterend", help);
      }
      form.querySelectorAll("input[type='date']").forEach(function (input) {
        input.title = "Поле хранит обычную календарную дату без привязки к часу. Здесь можно выбирать и сегодняшнюю дату.";
      });
      Object.keys(OVERRIDE_ACTIONS).forEach(function (label) {
        setButtonTitle(findButton(form, label), OVERRIDE_ACTIONS[label]);
      });
    });
  }

  function enhanceButtonTitles(root) {
    Object.keys(TOP_ACTIONS).forEach(function (label) {
      setButtonTitle(findButton(root, label), TOP_ACTIONS[label]);
    });
    Object.keys(SETTINGS_ACTIONS).forEach(function (label) {
      setButtonTitle(findButton(root, label), SETTINGS_ACTIONS[label]);
    });
  }

  function enhance() {
    window.clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(function () {
      var root = document.getElementById(VIEW_ID);
      if (!root || !root.children.length) return;
      ensureStyles();
      ensureTopGuide(root);
      ensureSettingsGuide(root);
      ensureContextBlocks(root);
      enhanceHistorySummaries(root);
      enhanceForms(root);
      enhanceButtonTitles(root);
    }, 60);
  }

  function install() {
    var root = document.getElementById(VIEW_ID);
    if (!root || observer) return;
    observer = new MutationObserver(function () { enhance(); });
    observer.observe(root, { childList: true, subtree: true });
    enhance();
  }

  var originalRenderRepricer = window.renderRepricer;
  if (typeof originalRenderRepricer === "function") {
    window.renderRepricer = function patchedRenderRepricer() {
      var result = originalRenderRepricer.apply(this, arguments);
      enhance();
      return result;
    };
  }

  var originalRerenderCurrentView = window.rerenderCurrentView;
  if (typeof originalRerenderCurrentView === "function") {
    window.rerenderCurrentView = function patchedRerenderCurrentView() {
      var result = originalRerenderCurrentView.apply(this, arguments);
      enhance();
      return result;
    };
  }

  document.addEventListener("DOMContentLoaded", install, { once: true });
  window.addEventListener("load", install, { once: true });
  install();
  enhance();
})();
