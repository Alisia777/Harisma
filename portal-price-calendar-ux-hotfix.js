(function () {
  if (window.__ALTEA_PRICE_CALENDAR_UX_HOTFIX_20260425A__) return;
  window.__ALTEA_PRICE_CALENDAR_UX_HOTFIX_20260425A__ = true;

  var VIEW_ID = "view-prices";
  var STYLE_ID = "altea-price-calendar-ux-style";
  var observer = null;
  var enhanceTimer = 0;

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function todayKey() {
    var now = new Date();
    return [now.getFullYear(), pad2(now.getMonth() + 1), pad2(now.getDate())].join("-");
  }

  function parseDateKey(value) {
    if (!value) return null;
    var raw = String(value).trim();
    if (!raw) return null;
    var direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (direct) {
      return new Date(Number(direct[1]), Number(direct[2]) - 1, Number(direct[3]), 12, 0, 0, 0);
    }
    var parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0);
  }

  function shiftDate(value, daysDelta) {
    var parsed = parseDateKey(value);
    if (!parsed) return "";
    parsed.setDate(parsed.getDate() + daysDelta);
    return [parsed.getFullYear(), pad2(parsed.getMonth() + 1), pad2(parsed.getDate())].join("-");
  }

  function diffDays(fromValue, toValue) {
    var from = parseDateKey(fromValue);
    var to = parseDateKey(toValue);
    if (!from || !to) return 0;
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  function extractSnapshotDate(text) {
    var matches = String(text || "").match(/\d{4}-\d{2}-\d{2}/g);
    return matches && matches.length ? matches[matches.length - 1] : "";
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#view-prices .pw-ux-help{margin-top:12px;padding:14px 16px;border-radius:18px;border:1px solid rgba(214,175,85,.14);background:rgba(214,175,85,.05);display:grid;gap:10px;}",
      "#view-prices .pw-ux-help summary{cursor:pointer;font-weight:700;color:#f4ead6;}",
      "#view-prices .pw-ux-help ul{margin:8px 0 0;padding-left:18px;color:#d7c39f;display:grid;gap:6px;}",
      "#view-prices .pw-ux-banner{margin-top:14px;padding:14px 16px;border-radius:18px;border:1px solid rgba(214,175,85,.18);background:rgba(214,175,85,.07);color:#f4ead6;}",
      "#view-prices .pw-ux-banner.warn{border-color:rgba(255,171,92,.28);background:rgba(115,63,17,.22);}",
      "#view-prices .pw-ux-banner strong{display:block;margin-bottom:6px;color:#fff0cf;}",
      "#view-prices .pw-ux-history{margin-top:10px;}",
      "#view-prices .pw-ux-history summary{cursor:pointer;color:#f5e6c2;font-weight:700;}",
      "#view-prices .pw-ux-history-note{margin-top:8px;color:#cdb892;line-height:1.45;}"
    ].join("");
    document.head.appendChild(style);
  }

  function dispatchChange(input) {
    if (!input) return;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyRange(toValue, daysCount) {
    var root = document.getElementById(VIEW_ID);
    if (!root || !toValue) return;
    var toInput = root.querySelector("#pwTo");
    if (toInput) {
      toInput.value = toValue;
      dispatchChange(toInput);
    }
    window.setTimeout(function () {
      var freshRoot = document.getElementById(VIEW_ID);
      if (!freshRoot) return;
      var fromInput = freshRoot.querySelector("#pwFrom");
      var latestTo = freshRoot.querySelector("#pwTo");
      var fromValue = shiftDate(toValue, -(Math.max(1, Number(daysCount) || 7) - 1));
      if (latestTo && latestTo.value !== toValue) {
        latestTo.value = toValue;
        dispatchChange(latestTo);
      }
      if (fromInput) {
        fromInput.value = fromValue;
        dispatchChange(fromInput);
      }
    }, 0);
  }

  function ensureQuickButtons(root) {
    var presetButton = root.querySelector("[data-price-preset]");
    if (!presetButton) return;
    var presetRow = presetButton.parentElement;
    if (!presetRow || presetRow.querySelector("[data-price-ux-anchor]")) return;

    var todayButton = document.createElement("button");
    todayButton.type = "button";
    todayButton.className = "pw-chip";
    todayButton.dataset.priceUxAnchor = "today";
    todayButton.textContent = "Сегодня";
    todayButton.title = "Ставит правую границу диапазона на текущую календарную дату.";

    var latestButton = document.createElement("button");
    latestButton.type = "button";
    latestButton.className = "pw-chip";
    latestButton.dataset.priceUxAnchor = "latest";
    latestButton.textContent = "Последний срез";
    latestButton.title = "Возвращает диапазон к последнему дню, который реально есть в текущем источнике данных.";

    todayButton.addEventListener("click", function () {
      applyRange(todayKey(), 7);
    });
    latestButton.addEventListener("click", function () {
      var sourceText = (root.querySelector("[data-price-ux-source]") || {}).textContent || "";
      var snapshotDate = extractSnapshotDate(sourceText);
      var fallbackDate = (root.querySelector("#pwTo") || {}).value || todayKey();
      applyRange(snapshotDate || fallbackDate, 7);
    });

    presetRow.appendChild(todayButton);
    presetRow.appendChild(latestButton);
  }

  function ensureInputHints(root) {
    var inputs = root.querySelectorAll("#pwFrom, #pwTo");
    inputs.forEach(function (input) {
      input.max = todayKey();
      input.title = "Можно выбирать и сегодняшнюю дату. Если за сегодня ещё нет опубликованного среза, таблица покажет последний доступный день внутри диапазона.";
    });
  }

  function updateFreshnessBanner(root) {
    var subtitle = root.querySelector(".pw-sub");
    if (!subtitle) return;

    var sourceNode = Array.from(root.querySelectorAll(".pw-note")).find(function (node) {
      return /Источник:/i.test(String(node.textContent || ""));
    });
    if (sourceNode) sourceNode.dataset.priceUxSource = "true";

    var snapshotDate = extractSnapshotDate(sourceNode && sourceNode.textContent);
    var lagDays = snapshotDate ? Math.max(0, diffDays(snapshotDate, todayKey())) : 0;
    var overlayMissing = /без свежего overlay/i.test(String(sourceNode && sourceNode.textContent || ""));

    var banner = root.querySelector("[data-price-ux-banner]");
    if (!banner) {
      banner = document.createElement("div");
      banner.dataset.priceUxBanner = "true";
      subtitle.insertAdjacentElement("afterend", banner);
    }

    banner.className = "pw-ux-banner" + ((overlayMissing || lagDays > 1) ? " warn" : "");

    var lines = [];
    if (snapshotDate) {
      lines.push("Дата последнего ценового среза: " + snapshotDate + ".");
      if (lagDays <= 0) {
        lines.push("Слой цен выглядит как текущий на сегодня.");
      } else if (lagDays === 1) {
        lines.push("Слой цен отстаёт от текущей даты на 1 день.");
      } else {
        lines.push("Слой цен отстаёт от текущей даты на " + lagDays + " дн.");
      }
    } else {
      lines.push("Дата ценового среза не распознана из текущего источника.");
    }
    lines.push("Кнопка «Сегодня» теперь ставит текущую календарную дату явно. Если за сегодня ещё нет опубликованной точки, таблица всё равно покажет последний доступный факт внутри диапазона.");
    if (overlayMissing) {
      lines.push("Прод не видит свежий overlay как статический файл, поэтому текущая цена может браться из более старого слоя. Для фактического обновления это нужно закрыть публикацией файла или snapshot-слоя.");
    }

    banner.innerHTML = "<strong>Свежесть ценового слоя</strong><div>" + lines.join(" ") + "</div>";
  }

  function ensureHelp(root) {
    if (root.querySelector("[data-price-ux-help]")) return;
    var firstSection = root.querySelector(".pw-card");
    if (!firstSection) return;
    var help = document.createElement("details");
    help.className = "pw-ux-help";
    help.dataset.priceUxHelp = "true";
    help.innerHTML = [
      "<summary>Что делают кнопки и как читать эту вкладку</summary>",
      "<ul>",
      "<li><strong>Все / WB / Ozon / Я.Маркет</strong> — фильтр по площадке. Он не перезагружает новый источник данных.</li>",
      "<li><strong>7 / 14 / 30 дней</strong> — быстрый диапазон от поля «по».</li>",
      "<li><strong>Сегодня</strong> — ставит правую границу диапазона на текущую дату, чтобы не искать её в календаре вручную.</li>",
      "<li><strong>Последний срез</strong> — возвращает диапазон к последнему дню, который реально приехал в источник цен.</li>",
      "<li><strong>Цена MP</strong> — текущая цена продавца из последнего доступного ценового слоя.</li>",
      "<li><strong>Цена клиента</strong> — клиентский контур после скидки/СПП, если он приехал в source.</li>",
      "<li><strong>Клик по строке</strong> — открывает карточку SKU, где можно посмотреть текущие значения и историю по дням.</li>",
      "</ul>"
    ].join("");
    firstSection.appendChild(help);
  }

  function collapseModalHistory(root) {
    root.querySelectorAll(".pw-history-wrap").forEach(function (wrap) {
      if (wrap.closest("[data-price-ux-history]")) return;
      var details = document.createElement("details");
      details.className = "pw-ux-history";
      details.dataset.priceUxHistory = "true";
      details.innerHTML = [
        "<summary>История значений по дням</summary>",
        "<div class=\"pw-ux-history-note\">Это опубликованные точки внутри выбранного диапазона. Если за сегодня точки ещё нет, история заканчивается на последнем доступном срезе.</div>"
      ].join("");
      wrap.parentNode.insertBefore(details, wrap);
      details.appendChild(wrap);
    });
  }

  function enhance() {
    window.clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(function () {
      var root = document.getElementById(VIEW_ID);
      if (!root || !root.querySelector(".pw-shell")) return;
      ensureStyles();
      ensureQuickButtons(root);
      ensureInputHints(root);
      updateFreshnessBanner(root);
      ensureHelp(root);
      collapseModalHistory(root);
    }, 60);
  }

  function install() {
    var root = document.getElementById(VIEW_ID);
    if (!root || observer) return;
    observer = new MutationObserver(function () { enhance(); });
    observer.observe(root, { childList: true, subtree: true });
    enhance();
  }

  var originalRender = window.renderPriceWorkbench;
  if (typeof originalRender === "function") {
    window.renderPriceWorkbench = function patchedRenderPriceWorkbench() {
      var result = originalRender.apply(this, arguments);
      enhance();
      return result;
    };
  }

  document.addEventListener("DOMContentLoaded", install, { once: true });
  window.addEventListener("load", install, { once: true });
  install();
  enhance();
})();
