(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_LIVEFIX_20260420A__) return;
  window.__ALTEA_PRICE_WORKBENCH_LIVEFIX_20260420A__ = true;

  var STYLE_ID = "altea-price-workbench-livefix-style";
  var RENDER_WRAP_ID = "__ALTEA_PRICE_WORKBENCH_RENDER_WRAP_20260420A__";
  var forcedRenderDone = false;

  function getState() {
    return window.state || window.__STATE__ || null;
  }

  function parseNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    var normalized = String(value).replace(/\s+/g, "").replace(",", ".").replace("%", "");
    var parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parsePercent(value) {
    var parsed = parseNumber(value);
    if (parsed === null) return null;
    return parsed > 1 ? parsed / 100 : parsed;
  }

  function pctShort(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return (Number(value) * 100).toFixed(1) + "%";
  }

  function normalizeKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-zа-я0-9_-]+/gi, "");
  }

  function firstText() {
    for (var index = 0; index < arguments.length; index += 1) {
      var value = arguments[index];
      if (value === null || value === undefined) continue;
      var text = String(value).trim();
      if (text) return text;
    }
    return "";
  }

  function firstPercent() {
    for (var index = 0; index < arguments.length; index += 1) {
      var value = parsePercent(arguments[index]);
      if (value !== null) return value;
    }
    return null;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".price-livefix-meta{margin-top:4px;font-size:12px;line-height:1.35;color:#cbb88c;}",
      ".price-livefix-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}",
      ".price-livefix-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;border:1px solid rgba(214,175,85,.32);background:rgba(214,175,85,.08);color:#f3deb0;font-size:12px;line-height:1.2;}",
      ".price-livefix-badge.danger{border-color:rgba(255,107,107,.45);color:#ffb3b3;background:rgba(255,107,107,.08);}",
      ".price-livefix-badge.ok{border-color:rgba(122,209,142,.45);color:#bff1c9;background:rgba(122,209,142,.08);}",
      ".price-livefix-form-note{margin-top:8px;font-size:12px;line-height:1.45;color:#cbb88c;}"
    ].join("");
    document.head.appendChild(style);
  }

  function collectSupportRows(pb) {
    var raw = pb && (pb.support || pb.supportRows || pb.workbookSupport || pb.supportMap || null);
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.rows)) return raw.rows;
    if (typeof raw === "object") return Object.values(raw);
    return [];
  }

  function keyCandidates(item) {
    if (!item || typeof item !== "object") return [];
    return [
      item.articleKey,
      item.article,
      item.article_name,
      item.sku,
      item.skuKey,
      item.offerId,
      item.offer_id,
      item.vendorCode,
      item.vendor_code,
      item.nmId,
      item.nm_id,
      item.barcode,
      item.externalId,
      item.external_id
    ]
      .map(normalizeKey)
      .filter(Boolean);
  }

  function supportStatusText(row) {
    var parts = [];
    var status = firstText(row && row.productStatus, row && row.supportRow && row.supportRow.productStatus);
    var repricer = firstText(row && row.repricerStatus, row && row.supportRow && row.supportRow.repricerStatus);
    if (status) parts.push(status);
    if (repricer) parts.push("Repricer: " + repricer);
    return parts.join(" · ");
  }

  function supportStatusKind(text) {
    var source = String(text || "").toLowerCase();
    if (!source) return "";
    if (source.indexOf("ошиб") >= 0 || source.indexOf("stop") >= 0 || source.indexOf("нет") >= 0 || source.indexOf("минус") >= 0) return "danger";
    if (source.indexOf("ok") >= 0 || source.indexOf("active") >= 0 || source.indexOf("норма") >= 0 || source.indexOf("в работе") >= 0) return "ok";
    return "";
  }

  function buildSupportMap(pb) {
    var map = Object.create(null);
    collectSupportRows(pb).forEach(function (item) {
      keyCandidates(item).forEach(function (key) {
        if (!map[key]) map[key] = item;
      });
    });
    return map;
  }

  function enrichRow(row, support) {
    if (!row || !support) return row;
    row.supportRow = row.supportRow || support;

    var allowed = firstPercent(
      support.allowedMarginPct,
      support.allowed_margin_pct,
      support.summary && support.summary.allowedMarginPct,
      support.sellerSummary && support.sellerSummary.allowedMarginPct
    );
    if (row.allowedMarginManualPct === null || row.allowedMarginManualPct === undefined || row.allowedMarginManualPct === "") {
      if (allowed !== null) {
        row.allowedMarginPct = allowed;
        row.allowedMarginBaselinePct = allowed;
        row.effectiveAllowedMarginPct = allowed;
        row.allowedMarginSourceBaseline = row.allowedMarginSourceBaseline || "support_workbook";
        row.allowedMarginNote = row.allowedMarginNote || "Допустимая маржа взята из рабочего файла за 3 месяца.";
      }
    }

    var productStatus = firstText(
      support.productStatus,
      support.product_status,
      support.status,
      support.statusLabel
    );
    if (productStatus) row.productStatus = productStatus;

    var repricerStatus = firstText(
      support.repricerStatus,
      support.repricer_status,
      support.repricerState
    );
    if (repricerStatus) row.repricerStatus = repricerStatus;

    var historyQuality = firstText(
      support.historyQuality,
      support.history_quality,
      support.historyStatus
    );
    if (!row.historyNoteDisplay && historyQuality) row.historyNoteDisplay = historyQuality;

    return row;
  }

  function enrichPriceState() {
    var state = getState();
    var pb = state && state.priceWorkbench;
    if (!pb) return false;

    var supportMap = buildSupportMap(pb);
    if (!Object.keys(supportMap).length) return false;

    ["rows", "filteredRows", "baseRows", "allRows", "sourceRows", "seedRows"].forEach(function (field) {
      var list = pb[field];
      if (!Array.isArray(list)) return;
      list.forEach(function (row) {
        var key = keyCandidates(row)[0];
        if (!key) return;
        enrichRow(row, supportMap[key]);
      });
    });

    return true;
  }

  function currentRowByKey(key) {
    var state = getState();
    var pb = state && state.priceWorkbench;
    if (!pb || !key) return null;
    var wanted = normalizeKey(key);
    var buckets = [pb.rows, pb.filteredRows, pb.baseRows, pb.allRows, pb.sourceRows, pb.seedRows];
    for (var bucketIndex = 0; bucketIndex < buckets.length; bucketIndex += 1) {
      var list = buckets[bucketIndex];
      if (!Array.isArray(list)) continue;
      for (var rowIndex = 0; rowIndex < list.length; rowIndex += 1) {
        var row = list[rowIndex];
        var rowKey = keyCandidates(row)[0];
        if (rowKey && rowKey === wanted) return row;
      }
    }
    return null;
  }

  function upsertStatusMeta(host, row) {
    if (!host || !row) return;
    var statusText = supportStatusText(row);
    if (!statusText) return;

    var node = host.querySelector(".price-livefix-meta");
    if (!node) {
      node = document.createElement("div");
      node.className = "price-livefix-meta";
      host.appendChild(node);
    }
    node.textContent = "Статус товара: " + statusText;
  }

  function decorateTable(root) {
    if (!root) return;
    root.querySelectorAll("[data-price-open]").forEach(function (rowNode) {
      var key = rowNode.getAttribute("data-price-open");
      var row = currentRowByKey(key);
      if (!row) return;
      var host = rowNode.querySelector(".price-sku-note") ? rowNode.querySelector(".price-sku-note").parentElement : rowNode.querySelector("td");
      upsertStatusMeta(host, row);
    });
  }

  function upsertBadgeRow(host, row) {
    if (!host || !row) return;
    var text = supportStatusText(row);
    if (!text) return;

    var wrap = host.querySelector(".price-livefix-badges");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "price-livefix-badges";
      host.appendChild(wrap);
    }
    wrap.innerHTML = "";

    text.split(" · ").forEach(function (part) {
      var badge = document.createElement("span");
      badge.className = "price-livefix-badge " + supportStatusKind(part);
      badge.textContent = part;
      wrap.appendChild(badge);
    });
  }

  function decorateAllowedMargin(scope, row) {
    if (!scope || !row) return;
    scope.querySelectorAll(".price-modal-kpi, .price-kpi, .price-summary-card, .card").forEach(function (card) {
      var label = card.querySelector(".label");
      if (!label) return;
      var text = String(label.textContent || "").toLowerCase();
      if (text.indexOf("допустим") === -1 || text.indexOf("маржа") === -1) return;
      label.textContent = "Допустимая маржа 3м";
      var strong = card.querySelector("strong");
      if (strong && row.effectiveAllowedMarginPct !== null && row.effectiveAllowedMarginPct !== undefined) {
        strong.textContent = pctShort(row.effectiveAllowedMarginPct);
      }
      var small = card.querySelector("small");
      if (small) {
        small.textContent = row.allowedMarginNote || "Средняя допустимая маржа за последние 3 месяца.";
      }
    });
  }

  function decorateModal() {
    var modal = document.getElementById("skuModal");
    if (!modal) return;
    var state = getState();
    var key = state && state.priceWorkbench && state.priceWorkbench.selectedKey;
    var row = currentRowByKey(key);
    if (!row) return;

    var body = document.getElementById("skuModalBody") || modal;
    var head = body.querySelector(".price-modal-head") || body;
    upsertBadgeRow(head, row);
    decorateAllowedMargin(body, row);
  }

  function closeSkuModal() {
    var modal = document.getElementById("skuModal");
    if (!modal) return;
    modal.classList.remove("open", "active", "show", "is-open");
    modal.style.display = "none";
    modal.setAttribute("hidden", "hidden");
    modal.setAttribute("aria-hidden", "true");
    var state = getState();
    if (state && state.priceWorkbench) state.priceWorkbench.selectedKey = null;
  }

  function installModalRescue() {
    document.addEventListener("click", function (event) {
      var closeButton = event.target && event.target.closest ? event.target.closest("[data-close-modal]") : null;
      if (closeButton) {
        event.preventDefault();
        event.stopPropagation();
        closeSkuModal();
        return;
      }
      var modal = document.getElementById("skuModal");
      if (modal && event.target === modal) {
        closeSkuModal();
      }
    }, true);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeSkuModal();
    }, true);
  }

  function wrapRender() {
    if (window[RENDER_WRAP_ID]) return;
    if (typeof window.renderPriceWorkbench !== "function") return;
    var original = window.renderPriceWorkbench;
    window.renderPriceWorkbench = function () {
      ensureStyles();
      enrichPriceState();
      var result = original.apply(this, arguments);
      window.setTimeout(function () {
        var root = document.getElementById("view-prices");
        enrichPriceState();
        decorateTable(root);
        decorateAllowedMargin(root, currentRowByKey((getState() && getState().priceWorkbench && getState().priceWorkbench.selectedKey) || ""));
        decorateModal();
      }, 0);
      return result;
    };
    window[RENDER_WRAP_ID] = true;
  }

  function prime(forceRender) {
    ensureStyles();
    wrapRender();
    enrichPriceState();
    var root = document.getElementById("view-prices");
    decorateTable(root);
    decorateAllowedMargin(root, currentRowByKey((getState() && getState().priceWorkbench && getState().priceWorkbench.selectedKey) || ""));
    decorateModal();

    if (forceRender && !forcedRenderDone && typeof window.renderPriceWorkbench === "function") {
      forcedRenderDone = true;
      try {
        window.renderPriceWorkbench();
      } catch (error) {
        console.warn("[portal-price-workbench-livefix] render", error);
      }
    }
  }

  installModalRescue();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { prime(true); }, { once: true });
  } else {
    prime(true);
  }
  window.addEventListener("load", function () { prime(true); }, { once: true });
  window.setTimeout(function () { prime(true); }, 120);
  window.setTimeout(function () { prime(false); }, 1200);
  window.setInterval(function () { prime(false); }, 1800);
})();
