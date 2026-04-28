(function () {
  if (window.__ALTEA_PRICE_REPRICER_COLUMN_HOTFIX_20260425A__) return;
  window.__ALTEA_PRICE_REPRICER_COLUMN_HOTFIX_20260425A__ = true;

  var STORAGE_KEY = "brand-portal-local-v1";
  var HEADER_TEXT = "\u0426\u0435\u043d\u0430 \u0440\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440\u0430";
  var LABEL_FORCE = "force";
  var LABEL_PROMO = "promo";

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function normalizeKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function parseStorage() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function readOverrides() {
    var parsed = parseStorage();
    return Array.isArray(parsed.repricerOverrides) ? parsed.repricerOverrides : [];
  }

  function asNumber(value) {
    var next = Number(value);
    return Number.isFinite(next) ? next : null;
  }

  function formatMoney(value) {
    var amount = asNumber(value);
    if (amount == null) return "\u2014";
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0
    }).format(amount);
  }

  function resolveRepricerDisplay(articleKey, market) {
    var targetKey = normalizeKey(articleKey);
    var targetMarket = normalizeKey(market);
    if (!targetKey) return null;

    var match = readOverrides().find(function (item) {
      var itemKey = normalizeKey(item && (item.articleKey || item.article));
      var itemMarket = normalizeKey(item && item.platform);
      if (itemKey !== targetKey) return false;
      return !itemMarket || itemMarket === "all" || itemMarket === targetMarket;
    });

    if (!match) return null;

    var forcePrice = asNumber(match.forcePrice);
    if (forcePrice != null) {
      return {
        text: formatMoney(forcePrice),
        label: LABEL_FORCE
      };
    }

    var promoActive = match.promoActive === true || match.promoActive === "true" || match.promoActive === 1 || match.promoActive === "1";
    var promoPrice = asNumber(match.promoPrice);
    if (promoActive && promoPrice != null) {
      return {
        text: formatMoney(promoPrice),
        label: LABEL_PROMO
      };
    }

    return null;
  }

  function ensureStyles() {
    if (document.getElementById("alteaPriceRepricerColumnHotfixStyles")) return;
    var style = document.createElement("style");
    style.id = "alteaPriceRepricerColumnHotfixStyles";
    style.textContent = [
      "#view-prices .pw-repricer-cell-hotfix{display:grid;gap:2px;line-height:1.2;}",
      "#view-prices .pw-repricer-cell-hotfix strong{font-size:13px;color:#fff2d2;}",
      "#view-prices .pw-repricer-cell-hotfix small{font-size:11px;color:rgba(255,235,196,.68);text-transform:uppercase;letter-spacing:.04em;}"
    ].join("");
    document.head.appendChild(style);
  }

  function buildCell(display) {
    var cell = document.createElement("td");
    cell.setAttribute("data-repricer-column-cell", "true");
    if (!display) {
      cell.textContent = "\u2014";
      return cell;
    }
    cell.innerHTML = '<div class="pw-repricer-cell-hotfix"><strong>' + esc(display.text) + '</strong><small>' + esc(display.label) + "</small></div>";
    return cell;
  }

  function syncTable() {
    ensureStyles();

    var table = document.querySelector("#view-prices .pw-table");
    if (!table) return;

    var headerRow = table.querySelector("thead tr");
    if (!headerRow) return;

    var headers = Array.prototype.slice.call(headerRow.querySelectorAll("th"));
    var mpIndex = headers.findIndex(function (th) {
      return String(th.textContent || "").trim() === "\u0426\u0435\u043d\u0430 MP";
    });
    if (mpIndex === -1) return;

    var repricerIndex = headers.findIndex(function (th) {
      return String(th.textContent || "").trim() === HEADER_TEXT;
    });

    if (repricerIndex === -1) {
      var repricerHeader = document.createElement("th");
      repricerHeader.textContent = HEADER_TEXT;
      var mpHeader = headers[mpIndex];
      mpHeader.insertAdjacentElement("afterend", repricerHeader);
      repricerIndex = mpIndex + 1;
    }

    Array.prototype.slice.call(table.querySelectorAll("tbody tr[data-open-price]")).forEach(function (row) {
      var articleKey = row.getAttribute("data-open-price") || "";
      var market = row.getAttribute("data-price-market") || "";
      var existing = row.querySelector("[data-repricer-column-cell]");
      var display = resolveRepricerDisplay(articleKey, market);
      var nextCell = buildCell(display);

      if (existing) {
        existing.replaceWith(nextCell);
        return;
      }

      var cells = row.querySelectorAll("td");
      var anchor = cells[mpIndex];
      if (!anchor) return;
      anchor.insertAdjacentElement("afterend", nextCell);
    });
  }

  function run() {
    syncTable();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  window.addEventListener("altea:viewchange", run);

  var observer = new MutationObserver(function () {
    syncTable();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
