(function () {
  if (window.__ALTEA_PRICE_MODAL_LASTFACT_HOTFIX_20260425A__) return;
  window.__ALTEA_PRICE_MODAL_LASTFACT_HOTFIX_20260425A__ = true;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isBlankMetric(value) {
    var normalized = clean(value).replace(/\u00a0/g, " ");
    return !normalized || normalized === "\u2014" || normalized === "0" || normalized === "0 \u20bd" || normalized === "0%";
  }

  function modal() {
    return document.getElementById("priceSimpleModal");
  }

  function modalKey() {
    var root = modal();
    if (!root) return "";
    var title = root.querySelector(".pw-modal-head h3");
    return clean(title && title.textContent);
  }

  function tableRow(articleKey) {
    if (!articleKey) return null;
    return document.querySelector('[data-open-price="' + articleKey.replace(/"/g, '\\"') + '"]');
  }

  function cellText(row, index) {
    if (!row) return "";
    var cell = row.querySelector("td:nth-child(" + index + ")");
    return clean(cell && cell.textContent);
  }

  function lastHistoryValue(index) {
    var root = modal();
    if (!root) return "";
    var rows = Array.prototype.slice.call(root.querySelectorAll(".pw-history tbody tr"));
    for (var i = rows.length - 1; i >= 0; i -= 1) {
      var cell = rows[i].querySelector("td:nth-child(" + index + ")");
      var value = clean(cell && cell.textContent);
      if (!isBlankMetric(value)) return value;
    }
    return "";
  }

  function updateMetric(labelText, nextValue, nextHelp) {
    if (!nextValue) return;
    var root = modal();
    if (!root) return;
    var cards = Array.prototype.slice.call(root.querySelectorAll(".pw-mini"));
    cards.forEach(function (card) {
      var label = card.querySelector(".pw-label");
      if (clean(label && label.textContent) !== labelText) return;
      var strong = card.querySelector("strong");
      if (strong && isBlankMetric(strong.textContent)) strong.textContent = nextValue;
      var help = card.querySelector("small");
      if (help && nextHelp) help.textContent = nextHelp;
    });
  }

  function patchModal() {
    var root = modal();
    if (!root || !root.classList.contains("open")) return;

    var key = modalKey();
    var row = tableRow(key);
    var priceValue = lastHistoryValue(2) || cellText(row, 4);
    var sppValue = lastHistoryValue(3) || cellText(row, 7);
    var turnoverValue = lastHistoryValue(4) || cellText(row, 10);
    var clientValue = cellText(row, 6);

    updateMetric(
      "\u0426\u0435\u043d\u0430 MP",
      priceValue,
      "\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u043d\u0435\u043f\u0443\u0441\u0442\u043e\u0439 \u0444\u0430\u043a\u0442 \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0435."
    );
    updateMetric(
      "\u0426\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430",
      clientValue,
      "\u0411\u0435\u0440\u0451\u043c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0439 \u043a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440."
    );
    updateMetric(
      "\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c",
      turnoverValue,
      "\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u043d\u0435\u043f\u0443\u0441\u0442\u043e\u0439 \u0444\u0430\u043a\u0442 \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0435."
    );
    updateMetric(
      "\u0421\u041f\u041f",
      sppValue,
      "\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u043d\u0435\u043f\u0443\u0441\u0442\u043e\u0439 SPP \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0435."
    );
  }

  function watch() {
    patchModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watch, { once: true });
  } else {
    watch();
  }

  window.addEventListener("altea:viewchange", watch);

  var observer = new MutationObserver(function () {
    patchModal();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });
})();