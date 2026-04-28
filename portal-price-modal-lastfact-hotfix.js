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

(function () {
  if (window.__ALTEA_PRICE_CLICK_STABILITY_HOTFIX_20260428A__) return;
  window.__ALTEA_PRICE_CLICK_STABILITY_HOTFIX_20260428A__ = true;

  var HOST_ID = "priceSimpleModalHotfixHost";
  var MODAL_ID = "priceSimpleModalHotfix";
  var STYLE_ID = "priceSimpleModalHotfixStyle";
  var selectedKey = "";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function num(value) {
    if (value === null || value === undefined || value === "") return null;
    var parsed = Number(String(value).replace(/\s+/g, "").replace(",", ".").replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function money(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value)) + " \u20bd";
  }

  function pct(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return (sanitizeDiscountPct(Number(value)) * 100).toFixed(1) + "%";
  }

  function days(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return Number(value).toFixed(1) + " \u0434\u043d.";
  }

  function intf(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function sanitizeDiscountPct(value) {
    if (!Number.isFinite(Number(value))) return null;
    return Math.min(1, Math.max(0, Number(value)));
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z\u0430-\u044f0-9_-]+/gi, "");
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function localDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
  }

  function parseDateValue(value) {
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

  function isoDate(value) {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    var parsed = parseDateValue(value);
    return parsed ? localDateKey(parsed) : "";
  }

  function metricHelp(baseText, factDate, sliceDate) {
    if (factDate && sliceDate && factDate !== sliceDate) {
      return baseText + " \u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u043d\u0435\u043f\u0443\u0441\u0442\u043e\u0439 \u0444\u0430\u043a\u0442 \u0432 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0435: " + factDate + ".";
    }
    return baseText;
  }

  function getState() {
    return window.__alteaPriceWorkbenchState || null;
  }

  function rangeSlice(state, row) {
    return (row.timeline || []).filter(function (item) {
      if (!item || !item.date) return false;
      if (state && state.dateFrom && item.date < state.dateFrom) return false;
      if (state && state.dateTo && item.date > state.dateTo) return false;
      return true;
    });
  }

  function latestRangePoint(state, row) {
    var items = rangeSlice(state, row);
    return items.length ? items[items.length - 1] : null;
  }

  function latestNonNullRangeMetric(state, row, key) {
    var items = rangeSlice(state, row);
    for (var index = items.length - 1; index >= 0; index -= 1) {
      var item = items[index];
      var value = num(item && item[key]);
      if (value != null) {
        return {
          value: value,
          date: isoDate(item && item.date)
        };
      }
    }
    return { value: null, date: "" };
  }

  function buildDisplayRow(rawRow) {
    var state = getState() || {};
    var row = Object.assign({}, rawRow || {});
    var point = latestRangePoint(state, row);
    if (!point) return row;

    var priceMetric = latestNonNullRangeMetric(state, row, "price");
    var clientMetric = latestNonNullRangeMetric(state, row, "clientPrice");
    var sppMetric = latestNonNullRangeMetric(state, row, "sppPct");
    var turnoverMetric = latestNonNullRangeMetric(state, row, "turnoverDays");

    row.currentFillPrice = priceMetric.value != null ? priceMetric.value : row.currentFillPrice;
    row.currentClientPrice = clientMetric.value != null ? clientMetric.value : row.currentClientPrice;
    row.currentSppPct = sanitizeDiscountPct(sppMetric.value != null ? sppMetric.value : row.currentSppPct);
    row.turnoverDays = turnoverMetric.value != null ? turnoverMetric.value : row.turnoverDays;
    row.valueDate = isoDate(point.date) || row.valueDate;
    row.priceFactDate = priceMetric.value != null ? priceMetric.date : isoDate(row.valueDate);
    row.clientPriceFactDate = clientMetric.value != null ? clientMetric.date : isoDate(row.valueDate);
    row.sppFactDate = sppMetric.value != null ? sppMetric.date : isoDate(row.valueDate);
    row.turnoverFactDate = turnoverMetric.value != null ? turnoverMetric.date : isoDate(row.valueDate);
    return row;
  }

  function findRow(key) {
    var state = getState();
    var wanted = norm(key);
    if (!state || !Array.isArray(state.rows) || !wanted) return null;
    return state.rows.find(function (row) {
      return norm(row && row.articleKey) === wanted;
    }) || null;
  }

  function historyHtml(row) {
    var state = getState() || {};
    var items = rangeSlice(state, row).slice(-14);
    if (!items.length) {
      return '<div class="pw-empty">\u0412\u043d\u0443\u0442\u0440\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u043f\u0435\u0440\u0438\u043e\u0434\u0430 \u043d\u0435\u0442 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0434\u043d\u0435\u0432\u043d\u044b\u0445 \u0442\u043e\u0447\u0435\u043a.</div>';
    }
    var hasSalesHistory = items.some(function (item) {
      return num(item && item.ordersUnits) != null || num(item && item.revenue) != null;
    });
    return [
      '<details class="pw-detail" open><summary>\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0439 \u043f\u043e \u0434\u043d\u044f\u043c</summary>',
      '<div class="pw-history-wrap"><table class="pw-history"><thead><tr>',
      '<th>\u0414\u0430\u0442\u0430</th><th>\u0426\u0435\u043d\u0430 MP</th><th>\u0421\u041f\u041f</th><th>\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c</th>',
      hasSalesHistory ? '<th>\u0417\u0430\u043a\u0430\u0437\u044b</th><th>\u0412\u044b\u0440\u0443\u0447\u043a\u0430</th>' : "",
      '</tr></thead><tbody>',
      items.map(function (item) {
        return [
          "<tr>",
          "<td>", esc(item.date || ""), "</td>",
          "<td>", money(num(item.price)), "</td>",
          "<td>", pct(num(item.sppPct)), "</td>",
          "<td>", days(num(item.turnoverDays)), "</td>",
          hasSalesHistory ? "<td>" + intf(num(item.ordersUnits)) + "</td><td>" + money(num(item.revenue)) + "</td>" : "",
          "</tr>"
        ].join("");
      }).join(""),
      "</tbody></table></div></details>"
    ].join("");
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".pw-hotfix-modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(12,18,28,.48);z-index:9999;}",
      ".pw-hotfix-modal .pw-modal-box{max-height:min(86vh,980px);overflow:auto;}",
      "@media (max-width:720px){.pw-hotfix-modal{padding:12px;}}"
    ].join("");
    (document.head || document.body || document.documentElement).appendChild(style);
  }

  function ensureHost() {
    var host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = HOST_ID;
    (document.body || document.documentElement).appendChild(host);
    return host;
  }

  function renderModal(row) {
    var state = getState() || {};
    var turnoverHelp = row.turnoverSource === "order_procurement"
      ? "\u0424\u043e\u043b\u0431\u044d\u043a \u0438\u0437 \u0417\u0430\u043a\u0430\u0437\u0430: inStock / avgDaily \u043f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435."
      : "\u0422\u0435\u043a\u0443\u0449\u0435\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043f\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u0438.";
    return [
      '<div class="pw-modal pw-hotfix-modal open" id="', MODAL_ID, '">',
      '<div class="pw-modal-box">',
      '<div class="pw-modal-head">',
      '<div><h3>', esc(row.articleKey || ""), '</h3><div class="pw-sub">', esc(row.name || ""), '</div></div>',
      '<button class="pw-close" type="button" data-close-price-hotfix>\u0417\u0430\u043a\u0440\u044b\u0442\u044c</button>',
      "</div>",
      '<div class="pw-kpis">',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 MP</span><strong>', money(row.currentFillPrice), '</strong><small>', esc(metricHelp("\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0439 \u0444\u0430\u043a\u0442 \u0446\u0435\u043d\u044b \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430.", row.priceFactDate, row.valueDate)), "</small></div>",
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430</span><strong>', money(row.currentClientPrice), '</strong><small>', esc(metricHelp("\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0439 \u043a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440.", row.clientPriceFactDate, row.valueDate)), "</small></div>",
      '<div class="pw-mini"><span class="pw-label">\u0414\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u0430\u044f \u043c\u0430\u0440\u0436\u0430 3\u043c</span><strong>', pct(row.allowedMarginPct), '</strong><small>\u0411\u0435\u0440\u0435\u043c \u0438\u0437 smart/workbench \u0441\u043b\u043e\u044f.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u043c\u0430\u0440\u0436\u0430</span><strong>', pct(row.marginTotalPct), '</strong><small>\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u043f\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u0438.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c</span><strong>', days(row.turnoverDays), '</strong><small>', esc(metricHelp(turnoverHelp, row.turnoverFactDate, row.valueDate)), "</small></div>",
      '<div class="pw-mini"><span class="pw-label">Owner</span><strong>', esc(row.owner || "\u2014"), '</strong><small>\u0422\u0435\u043a\u0443\u0449\u0435\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u0432 \u0440\u0430\u0431\u043e\u0447\u0435\u043c \u043a\u043e\u043d\u0442\u0443\u0440\u0435.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0421\u0442\u0430\u0442\u0443\u0441 \u0442\u043e\u0432\u0430\u0440\u0430</span><strong>', esc(row.status || "\u2014"), '</strong><small>\u0421\u0442\u0430\u0442\u0443\u0441 \u0441\u0442\u0440\u043e\u043a\u0438 \u043f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u043c\u0443 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0443.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0421\u0440\u0435\u0437 \u0446\u0435\u043d</span><strong>', esc(row.valueDate || state.latestFactDate || "\u2014"), '</strong><small>\u0414\u0430\u0442\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0439 \u0442\u043e\u0447\u043a\u0438 \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0435.</small></div>',
      "</div>",
      '<div class="pw-card">',
      '<div class="pw-label">\u041a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u043f\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u0438</div>',
      '<div class="pw-note">', esc(row.historyNote || "\u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u0430 \u0447\u0435\u0440\u0435\u0437 lightweight hotfix, \u0431\u0435\u0437 \u043f\u043e\u043b\u043d\u043e\u0433\u043e \u0440\u0435\u0440\u0435\u043d\u0434\u0435\u0440\u0430 \u0432\u043a\u043b\u0430\u0434\u043a\u0438."), "</div>",
      historyHtml(row),
      "</div>",
      "</div></div>"
    ].join("");
  }

  function closeModal() {
    selectedKey = "";
    var host = document.getElementById(HOST_ID);
    if (host) host.innerHTML = "";
  }

  function openModal(key) {
    var rawRow = findRow(key);
    if (!rawRow) return;
    selectedKey = String(key || "");
    ensureStyles();
    var host = ensureHost();
    host.innerHTML = renderModal(buildDisplayRow(rawRow));
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.addEventListener("click", function (event) {
      if (event.target === modal || event.target.closest("[data-close-price-hotfix]")) {
        closeModal();
      }
    });
  }

  function closestRowTarget(node) {
    if (!node) return null;
    if (typeof node.closest === "function") return node.closest("[data-open-price]");
    var current = node;
    while (current && current !== document) {
      if (current.nodeType === 1 && current.hasAttribute && current.hasAttribute("data-open-price")) return current;
      current = current.parentNode;
    }
    return null;
  }

  document.addEventListener("click", function (event) {
    var rowNode = closestRowTarget(event.target);
    if (!rowNode) return;
    var pricesView = document.getElementById("view-prices");
    if (!pricesView || !pricesView.contains(rowNode)) return;
    var key = rowNode.getAttribute("data-open-price");
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    openModal(key);
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && selectedKey) closeModal();
  });

  window.addEventListener("altea:viewchange", function () {
    if (selectedKey) closeModal();
  });

  window.addEventListener("load", function () {
    closeModal();
  }, { once: true });
})();
