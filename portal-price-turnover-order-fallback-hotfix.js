(function () {
  if (window.__ALTEA_PRICE_TURNOVER_ORDER_FALLBACK_20260425A__) return;
  window.__ALTEA_PRICE_TURNOVER_ORDER_FALLBACK_20260425A__ = true;

  var VIEW_ID = "view-prices";
  var ORDER_PROCUREMENT_URL = "data/order_procurement.json";
  var ORDER_PROCUREMENT_WB_URL = "data/order_procurement_wb.json";
  var ORDER_PROCUREMENT_OZON_URL = "data/order_procurement_ozon.json";
  var cache = {
    lookup: null,
    loading: null,
    generatedAt: ""
  };

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z\u0430-\u044f0-9_-]+/gi, "");
  }

  function num(value) {
    if (value === null || value === undefined || value === "") return null;
    var parsed = Number(String(value).replace(/\s+/g, "").replace(",", ".").replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isoDate(value) {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    var parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().slice(0, 10);
  }

  function formatDays(value) {
    if (!Number.isFinite(Number(value))) return "\u2014";
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(Number(value)) + " \u0434\u043d.";
  }

  function procurementPlatform(value) {
    var normalized = norm(value);
    if (normalized === "wb" || normalized === "wildberries") return "wb";
    if (normalized === "ozon") return "ozon";
    return "";
  }

  async function fetchJsonNoStore(url) {
    var response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load " + url);
    return await response.json();
  }

  async function tryFetchJsonNoStore(url) {
    try {
      return await fetchJsonNoStore(url);
    } catch (error) {
      console.warn("[price-turnover-hotfix]", url, error);
      return null;
    }
  }

  function buildLookup(combinedPayload, wbPayload, ozonPayload) {
    var maps = { wb: Object.create(null), ozon: Object.create(null) };
    var generatedAt = "";

    function ingestPayload(payload, fallbackPlatform) {
      if (!payload || !Array.isArray(payload.rows)) return;
      if (payload.generatedAt && (!generatedAt || Date.parse(String(payload.generatedAt)) > Date.parse(String(generatedAt)))) {
        generatedAt = payload.generatedAt;
      }
      var payloadPlatform = procurementPlatform((payload && payload.platform) || fallbackPlatform);
      payload.rows.forEach(function (row) {
        var key = norm(row && (row.articleKey || row.article || row.sku));
        var platform = procurementPlatform(row && row.platform) || payloadPlatform;
        if (!key || !platform || !maps[platform]) return;
        var item = maps[platform][key] || {
          stock: 0,
          avgDaily: 0,
          turnoverDays: null
        };
        item.stock += num(row && row.inStock) || 0;
        item.avgDaily += num(row && row.avgDaily) || 0;
        maps[platform][key] = item;
      });
    }

    ingestPayload(combinedPayload, "");
    ingestPayload(wbPayload, "wb");
    ingestPayload(ozonPayload, "ozon");

    ["wb", "ozon"].forEach(function (platform) {
      Object.keys(maps[platform]).forEach(function (key) {
        var item = maps[platform][key];
        item.turnoverDays = item.avgDaily > 0 ? item.stock / item.avgDaily : null;
      });
    });

    return {
      generatedAt: generatedAt,
      maps: maps
    };
  }

  async function ensureLookup() {
    if (cache.lookup) return cache.lookup;
    if (cache.loading) return cache.loading;
    cache.loading = Promise.resolve()
      .then(async function () {
        var combinedPayload = await tryFetchJsonNoStore(ORDER_PROCUREMENT_URL);
        var wbPayload = null;
        var ozonPayload = null;
        if (!combinedPayload || !Array.isArray(combinedPayload.rows) || !combinedPayload.rows.length) {
          wbPayload = await tryFetchJsonNoStore(ORDER_PROCUREMENT_WB_URL);
          ozonPayload = await tryFetchJsonNoStore(ORDER_PROCUREMENT_OZON_URL);
        }
        var result = buildLookup(combinedPayload, wbPayload, ozonPayload);
        cache.lookup = result.maps;
        cache.generatedAt = result.generatedAt || "";
        return cache.lookup;
      })
      .finally(function () {
        cache.loading = null;
      });
    return cache.loading;
  }

  function activeMarket(root) {
    var active = root && root.querySelector("[data-price-market].active");
    return active ? String(active.getAttribute("data-price-market") || "wb") : "wb";
  }

  function resolvePlatform(articleKey, market) {
    if (market === "wb" || market === "ozon") return market;
    if (market !== "all" || !cache.lookup) return "";
    var key = norm(articleKey);
    var hasWb = Boolean(cache.lookup.wb && cache.lookup.wb[key]);
    var hasOzon = Boolean(cache.lookup.ozon && cache.lookup.ozon[key]);
    if (hasWb && !hasOzon) return "wb";
    if (hasOzon && !hasWb) return "ozon";
    return "";
  }

  function lookupTurnover(articleKey, platform) {
    var key = norm(articleKey);
    if (!key || !platform || !cache.lookup || !cache.lookup[platform]) return null;
    var item = cache.lookup[platform][key];
    return item && Number.isFinite(Number(item.turnoverDays)) ? Number(item.turnoverDays) : null;
  }

  function patchTable(root) {
    var market = activeMarket(root);
    var patchedCount = 0;
    root.querySelectorAll("tr.pw-row[data-open-price]").forEach(function (rowNode) {
      var articleKey = rowNode.getAttribute("data-open-price");
      var platform = resolvePlatform(articleKey, market);
      var turnoverDays = lookupTurnover(articleKey, platform);
      if (turnoverDays == null) return;
      var cells = rowNode.querySelectorAll("td");
      var turnoverCell = cells[cells.length - 1];
      if (!turnoverCell) return;
      var current = String(turnoverCell.textContent || "").trim();
      if (current && current !== "\u2014" && current !== "-") return;
      turnoverCell.textContent = formatDays(turnoverDays);
      rowNode.dataset.turnoverSource = "order_procurement";
      patchedCount += 1;
    });
    return patchedCount;
  }

  function patchModal(root) {
    var modal = document.getElementById("priceSimpleModal");
    if (!modal || !modal.classList.contains("open")) return false;
    var title = modal.querySelector(".pw-modal-head h3");
    if (!title) return false;
    var articleKey = String(title.textContent || "").trim();
    var platform = resolvePlatform(articleKey, activeMarket(root));
    var turnoverDays = lookupTurnover(articleKey, platform);
    if (turnoverDays == null) return false;
    var card = Array.from(modal.querySelectorAll(".pw-mini")).find(function (node) {
      var label = node.querySelector(".pw-label");
      return label && norm(label.textContent) === norm("\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c");
    });
    if (!card) return false;
    var strong = card.querySelector("strong");
    if (strong) {
      var current = String(strong.textContent || "").trim();
      if (!current || current === "\u2014" || current === "-") {
        strong.textContent = formatDays(turnoverDays);
      }
    }
    var small = card.querySelector("small");
    if (small) {
      small.textContent = "\u0424\u043e\u043b\u0431\u044d\u043a \u0438\u0437 \u0417\u0430\u043a\u0430\u0437\u0430: inStock / avgDaily \u043f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435.";
    }
    return true;
  }

  function patchSourceNote(root, patchedCount) {
    if (!patchedCount) return;
    var sourceNote = Array.from(root.querySelectorAll(".pw-note")).find(function (node) {
      return String(node.textContent || "").indexOf("\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a:") === 0;
    });
    if (!sourceNote) return;
    if (String(sourceNote.textContent || "").indexOf("order_procurement") !== -1) return;
    var note = " \u00b7 \u043e\u0431\u043e\u0440\u043e\u0442 fallback: order_procurement";
    var generatedAt = isoDate(cache.generatedAt);
    if (generatedAt) note += " \u0434\u043e " + generatedAt;
    note += " (" + patchedCount + " SKU)";
    sourceNote.textContent += note;
  }

  function applyFallback() {
    var root = document.getElementById(VIEW_ID);
    if (!root) return;
    ensureLookup().then(function () {
      var patchedCount = patchTable(root);
      patchModal(root);
      patchSourceNote(root, patchedCount);
    }).catch(function (error) {
      console.warn("[price-turnover-hotfix] apply", error);
    });
  }

  function queueApply() {
    window.requestAnimationFrame(function () {
      window.setTimeout(applyFallback, 0);
    });
  }

  function hookRender() {
    if (typeof window.renderPriceWorkbench !== "function" || window.renderPriceWorkbench.__orderTurnoverPatched) return;
    var original = window.renderPriceWorkbench;
    var patched = function () {
      var result = original.apply(this, arguments);
      queueApply();
      return result;
    };
    patched.__orderTurnoverPatched = true;
    window.renderPriceWorkbench = patched;
  }

  function boot() {
    hookRender();
    queueApply();
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest("#view-prices [data-open-price], #view-prices [data-price-market], #view-prices [data-price-preset], #view-prices [data-close-price-modal]")) {
      queueApply();
    }
  }, true);

  document.addEventListener("input", function (event) {
    if (event.target && event.target.id === "pwSearch") queueApply();
  }, true);

  document.addEventListener("change", function (event) {
    if (event.target && (event.target.id === "pwFrom" || event.target.id === "pwTo")) queueApply();
  }, true);

  window.addEventListener("altea:viewchange", queueApply);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
