(function () {
  if (window.__ALTEA_PRICE_SIMPLE_RENDERER_20260428A__) return;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260428A__ = true;

  var DATA_URL = "data/smart_price_workbench.json";
  var OVERLAY_URL = "data/smart_price_overlay.json";
  var ORDER_PROCUREMENT_URL = "data/order_procurement.json";
  var ORDER_PROCUREMENT_WB_URL = "data/order_procurement_wb.json";
  var ORDER_PROCUREMENT_OZON_URL = "data/order_procurement_ozon.json";
  var VIEW_ID = "view-prices";
  var STYLE_ID = "altea-price-simple-style";
  var SNAPSHOT_WAIT_MS = 1800;
  var SNAPSHOT_HARD_WAIT_MS = 4500;
  var STORAGE_KEYS = [
    "brand-portal-price-workbench-v20260419-entries",
    "portal_price_workbench_entries"
  ];

  var state = {
    loading: false,
    loaded: false,
    error: "",
    rows: [],
    overlayGeneratedAt: "",
    orderProcurementGeneratedAt: "",
    orderProcurementFallbackCount: 0,
    sourceNote: "",
    market: "wb",
    search: "",
    selectedKey: "",
    dateFrom: "",
    dateTo: "",
    latestFactDate: "",
    latestTimelineDate: "",
    earliestTimelineDate: "",
    dataLagDays: 0
  };

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

  function pct(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return (sanitizeDiscountPct(Number(value)) * 100).toFixed(1) + "%";
  }

  function money(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value)) + " \u20bd";
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
    return [
      date.getFullYear(),
      pad2(date.getMonth() + 1),
      pad2(date.getDate())
    ].join("-");
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

  function todayKey() {
    return localDateKey(new Date());
  }

  function cloneSeries(series) {
    return Array.isArray(series) ? series.map(function (item) { return Object.assign({}, item || {}); }) : [];
  }

  function normalizeRows(rows) {
    if (Array.isArray(rows)) return rows;
    if (rows && typeof rows === "object") return Object.values(rows);
    return [];
  }

  function buildOverlayMaps(payload) {
    var maps = { wb: Object.create(null), ozon: Object.create(null), ym: Object.create(null), all: Object.create(null) };
    Object.keys((payload && payload.platforms) || {}).forEach(function (platform) {
      var target = platform === "ya" ? "ym" : platform;
      var rows = normalizeRows(((((payload || {}).platforms || {})[platform] || {}).rows));
      rows.forEach(function (row) {
        var key = norm(row && (row.articleKey || row.article || row.sku));
        if (!key || maps[target][key]) return;
        maps[target][key] = row;
      });
    });
    return maps;
  }

  function readJsonSafe(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return clone(fallback);
      var parsed = JSON.parse(raw);
      return parsed == null ? clone(fallback) : parsed;
    } catch (error) {
      console.warn("[price-simple] local-json", key, error);
      return clone(fallback);
    }
  }

  function rootState() {
    try {
      if (window.state && window.state !== state) return window.state;
    } catch {}
    return null;
  }

  function moneyRound(value) {
    var parsed = num(value);
    return parsed == null ? null : Math.round(parsed * 100) / 100;
  }

  function repricerMarket(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (raw === "ya") return "ym";
    if (raw === "wb" || raw === "ozon" || raw === "ym" || raw === "all") return raw;
    return "";
  }

  function normalizeRepricerOverride(entry) {
    return {
      articleKey: String(entry && (entry.articleKey || entry.article) || "").trim(),
      platform: repricerMarket(entry && entry.platform) || "all",
      mode: String(entry && entry.mode || "auto").trim().toLowerCase() || "auto",
      forcePrice: moneyRound(entry && entry.forcePrice),
      promoActive: entry ? (entry.promoActive === true || entry.promoActive === "true" || entry.promoActive === 1 || entry.promoActive === "1") : false,
      promoPrice: moneyRound(entry && entry.promoPrice),
      promoLabel: String(entry && entry.promoLabel || "").trim(),
      promoFrom: isoDate(entry && entry.promoFrom),
      promoTo: isoDate(entry && entry.promoTo),
      note: String(entry && entry.note || "").trim(),
      updatedAt: String(entry && entry.updatedAt || "").trim()
    };
  }

  function promoWindowActive(override) {
    var today = todayKey();
    var from = isoDate(override && override.promoFrom);
    var to = isoDate(override && override.promoTo);
    if (from && today < from) return false;
    if (to && today > to) return false;
    if (from && to && from > to) return false;
    return true;
  }

  function repricerExplicitTarget(override) {
    var normalized = normalizeRepricerOverride(override);
    var promoPrice = moneyRound(normalized.promoPrice);
    if (normalized.promoActive && promoPrice != null && promoPrice > 0 && promoWindowActive(normalized)) {
      return {
        price: promoPrice,
        label: normalized.promoLabel || "Промо",
        hint: normalized.note || "",
        updatedAt: normalized.updatedAt || ""
      };
    }
    var forcePrice = moneyRound(normalized.forcePrice);
    if (normalized.mode === "force" && forcePrice != null && forcePrice > 0) {
      return {
        price: forcePrice,
        label: "Фикс",
        hint: normalized.note || "",
        updatedAt: normalized.updatedAt || ""
      };
    }
    return null;
  }

  function chooseRepricerRows() {
    var root = rootState() || {};
    var baseRows = Array.isArray(root.repricer && root.repricer.rows) ? root.repricer.rows : [];
    var liveRows = Array.isArray(root.repricerLive && root.repricerLive.rows) ? root.repricerLive.rows : [];
    var baseStamp = parseFreshStamp(root.repricer && root.repricer.generatedAt);
    var liveStamp = parseFreshStamp(root.repricerLive && root.repricerLive.generatedAt);
    if (liveRows.length && liveStamp >= baseStamp) return liveRows;
    return baseRows.length ? baseRows : liveRows;
  }

  function findRepricerRow(articleKey) {
    var wanted = norm(articleKey);
    if (!wanted) return null;
    return chooseRepricerRows().find(function (row) {
      return wanted === norm(row && (row.articleKey || row.article || row.sku));
    }) || null;
  }

  function buildRepricerDisplay(market, articleKey) {
    var targetMarket = repricerMarket(market);
    if (targetMarket !== "wb" && targetMarket !== "ozon") return null;
    var wanted = norm(articleKey);
    if (!wanted) return null;

    var portal = readJsonSafe("brand-portal-local-v1", {});
    var overrides = Array.isArray(portal && portal.repricerOverrides) ? portal.repricerOverrides : [];
    var explicit = null;
    overrides.forEach(function (entry) {
      var normalized = normalizeRepricerOverride(entry);
      if (norm(normalized.articleKey) !== wanted) return;
      if (normalized.platform !== "all" && normalized.platform !== targetMarket) return;
      var display = repricerExplicitTarget(normalized);
      if (!display) return;
      if (!explicit || parseFreshStamp(display.updatedAt) >= parseFreshStamp(explicit.updatedAt)) {
        explicit = display;
      }
    });
    if (explicit) return explicit;

    var row = findRepricerRow(articleKey);
    if (!row) return null;
    var side = targetMarket === "wb" ? row.wb : row.ozon;
    var recPrice = moneyRound(side && side.recPrice);
    if (recPrice == null || recPrice <= 0) return null;
    return {
      price: recPrice,
      label: String(side && side.strategy || "Рекомендация").trim() || "Рекомендация",
      hint: String(side && side.reason || "").trim()
    };
  }

  function overlayFlagEnabled(value) {
    return value === true || value === "true" || value === 1 || value === "1";
  }

  function clearOverlayPoint(point, overlayRow) {
    if (!point || !overlayRow) return;
    if (overlayFlagEnabled(overlayRow.clearCurrentFillPrice) || overlayFlagEnabled(overlayRow.clearCurrentPrice)) {
      point.price = null;
    }
    if (overlayFlagEnabled(overlayRow.clearCurrentClientPrice)) {
      point.clientPrice = null;
    }
    if (overlayFlagEnabled(overlayRow.clearCurrentSppPct)) {
      point.sppPct = null;
    }
    if (overlayFlagEnabled(overlayRow.clearCurrentTurnoverDays)) {
      point.turnoverDays = null;
    }
  }

  function applyPointMetrics(point, source) {
    if (!point || !source) return;
    if (source.currentFillPrice != null) point.price = source.currentFillPrice;
    else if (source.currentPrice != null) point.price = source.currentPrice;
    else if (source.price != null) point.price = source.price;
    if (source.currentClientPrice != null) point.clientPrice = source.currentClientPrice;
    else if (source.clientPrice != null) point.clientPrice = source.clientPrice;
    if (source.currentSppPct != null) point.sppPct = source.currentSppPct;
    else if (source.sppPct != null) point.sppPct = source.sppPct;
    if (source.currentTurnoverDays != null) point.turnoverDays = source.currentTurnoverDays;
    else if (source.turnoverDays != null) point.turnoverDays = source.turnoverDays;
    if (source.ordersUnits != null) point.ordersUnits = source.ordersUnits;
    if (source.deliveredUnits != null) point.deliveredUnits = source.deliveredUnits;
    if (source.revenue != null) point.revenue = source.revenue;
  }

  function overlayTimelineSeries(overlayRow, cutoff) {
    var series = [];
    if (Array.isArray(overlayRow && overlayRow.daily)) series = overlayRow.daily;
    else if (Array.isArray(overlayRow && overlayRow.monthly)) series = overlayRow.monthly;
    else if (Array.isArray(overlayRow && overlayRow.timeline)) series = overlayRow.timeline;
    return cloneSeries(series)
      .filter(function (item) {
        var date = isoDate(item && item.date);
        if (!date) return false;
        return !cutoff || date <= cutoff;
      })
      .sort(function (left, right) {
        return String((left && left.date) || "").localeCompare(String((right && right.date) || ""));
      });
  }

  function mergeTimelineWithOverlay(timeline, overlayRow, maxDate) {
    var cutoff = isoDate((overlayRow && (overlayRow.valueDate || overlayRow.historyFreshnessDate)) || maxDate);
    var next = cloneSeries(timeline);
    if (cutoff) {
      next = next.filter(function (item) {
        var date = isoDate(item && item.date);
        return !date || date <= cutoff;
      });
      var pointsByDate = Object.create(null);
      next.forEach(function (item) {
        var date = isoDate(item && item.date);
        if (!date) return;
        pointsByDate[date] = item;
      });
      overlayTimelineSeries(overlayRow, cutoff).forEach(function (item) {
        var date = isoDate(item && item.date);
        if (!date) return;
        var point = pointsByDate[date];
        if (!point) {
          point = { date: date };
          next.push(point);
          pointsByDate[date] = point;
        }
        applyPointMetrics(point, item);
      });
      var point = next.find(function (item) { return isoDate(item && item.date) === cutoff; });
      if (!point) {
        point = { date: cutoff };
        next.push(point);
      }
      if (overlayRow) {
        clearOverlayPoint(point, overlayRow);
        applyPointMetrics(point, overlayRow);
      }
      next.sort(function (left, right) {
        return String((left && left.date) || "").localeCompare(String((right && right.date) || ""));
      });
    }
    return next;
  }

  function latestDate(rows) {
    var dates = [];
    rows.forEach(function (row) {
      (row.timeline || []).forEach(function (item) {
        if (item && item.date) dates.push(item.date);
      });
    });
    dates.sort();
    return dates[dates.length - 1] || "";
  }

  function earliestDate(rows) {
    var dates = [];
    rows.forEach(function (row) {
      (row.timeline || []).forEach(function (item) {
        if (item && item.date) dates.push(item.date);
      });
    });
    dates.sort();
    return dates[0] || "";
  }

  function shiftDate(value, daysDelta) {
    if (!value) return "";
    var date = parseDateValue(value);
    if (!date) return "";
    date.setDate(date.getDate() + daysDelta);
    return localDateKey(date);
  }

  function diffDays(fromValue, toValue) {
    var from = parseDateValue(fromValue);
    var to = parseDateValue(toValue);
    if (!from || !to) return 0;
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  function dataFreshnessLabel() {
    if (!state.latestFactDate) return "\u0414\u0430\u0442\u0430 \u0441\u0440\u0435\u0437\u0430 \u043d\u0435 \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u0430.";
    if (state.dataLagDays <= 0) return "\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0441\u0440\u0435\u0437 \u043d\u0430 \u0441\u0435\u0433\u043e\u0434\u043d\u044f.";
    if (state.dataLagDays === 1) return "\u0421\u0440\u0435\u0437 \u043e\u0442\u0441\u0442\u0430\u0435\u0442 \u043e\u0442 \u0441\u0435\u0433\u043e\u0434\u043d\u044f \u043d\u0430 1 \u0434\u0435\u043d\u044c.";
    return "\u0421\u0440\u0435\u0437 \u043e\u0442\u0441\u0442\u0430\u0435\u0442 \u043e\u0442 \u0441\u0435\u0433\u043e\u0434\u043d\u044f \u043d\u0430 " + state.dataLagDays + " \u0434\u043d.";
  }

  function stampLabel(value) {
    var parsed = value ? new Date(value) : null;
    if (!parsed || !Number.isFinite(parsed.getTime())) return isoDate(value);
    var year = parsed.getFullYear();
    var month = String(parsed.getMonth() + 1).padStart(2, "0");
    var day = String(parsed.getDate()).padStart(2, "0");
    var hours = String(parsed.getHours()).padStart(2, "0");
    var minutes = String(parsed.getMinutes()).padStart(2, "0");
    return year + "-" + month + "-" + day + " " + hours + ":" + minutes;
  }

  function overlayFreshnessLabel() {
    if (!state.overlayGeneratedAt) return "";
    var generated = stampLabel(state.overlayGeneratedAt);
    var generatedDate = isoDate(state.overlayGeneratedAt);
    if (state.latestFactDate && generatedDate && generatedDate !== state.latestFactDate) {
      return "\u0421\u043b\u043e\u0439 \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d " + generated + ", \u043d\u043e \u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0441\u0440\u0435\u0437 \u0446\u0435\u043d \u0432\u043d\u0443\u0442\u0440\u0438 \u043d\u0435\u0433\u043e \u0434\u043e " + state.latestFactDate + ".";
    }
    return "\u0421\u043b\u043e\u0439 \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d " + generated + ".";
  }

  function parseFreshStamp(value) {
    if (!value) return 0;
    var raw = String(value || "").trim();
    if (!raw) return 0;
    var normalized = /^\d{4}-\d{2}$/.test(raw)
      ? raw + "-01T00:00:00Z"
      : /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? raw + "T00:00:00Z"
        : raw;
    var stamp = Date.parse(normalized);
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function freshnessOfPayload(payload) {
    if (!payload || typeof payload !== "object") return 0;
    return Math.max(
      parseFreshStamp(payload.generatedAt),
      parseFreshStamp(payload.updatedAt),
      parseFreshStamp(payload.updated_at),
      parseFreshStamp(payload.asOfDate)
    );
  }

  function chooseFreshestPayload(snapshotPayload, localPayload) {
    if (snapshotPayload && localPayload) {
      return freshnessOfPayload(snapshotPayload) >= freshnessOfPayload(localPayload)
        ? { payload: snapshotPayload, source: "snapshot" }
        : { payload: localPayload, source: "local" };
    }
    if (snapshotPayload) return { payload: snapshotPayload, source: "snapshot" };
    if (localPayload) return { payload: localPayload, source: "local" };
    return null;
  }

  function resetStateForReload() {
    state.loading = false;
    state.loaded = false;
    state.error = "";
    state.rows = [];
    state.overlayGeneratedAt = "";
    state.orderProcurementGeneratedAt = "";
    state.orderProcurementFallbackCount = 0;
    state.sourceNote = "";
    state.latestFactDate = "";
    state.latestTimelineDate = "";
    state.earliestTimelineDate = "";
    state.dataLagDays = 0;
    state.selectedKey = "";
  }

  function normalizeDateRange() {
    var today = todayKey();
    var earliest = state.earliestTimelineDate || "";
    var fallbackTo = state.latestTimelineDate || state.latestFactDate || today;
    var toValue = isoDate(state.dateTo) || fallbackTo;
    var fromValue = isoDate(state.dateFrom) || shiftDate(toValue, -6);

    if (toValue > today) toValue = today;
    if (earliest && toValue < earliest) toValue = earliest;
    if (earliest && fromValue < earliest) fromValue = earliest;
    if (fromValue && toValue && fromValue > toValue) {
      fromValue = shiftDate(toValue, -6);
      if (earliest && fromValue < earliest) fromValue = earliest;
    }

    state.dateTo = toValue;
    state.dateFrom = fromValue;
  }

  async function fetchJsonNoStore(url) {
    var response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load " + url);
    var payload = await response.json();
    var source = "local";
    try {
      source = String(response.headers.get("X-Altea-Source") || response.headers.get("x-altea-source") || "local").trim() || "local";
    } catch {}
    return { payload: payload, source: source };
  }

  async function tryFetchJsonNoStore(url) {
    try {
      return await fetchJsonNoStore(url);
    } catch (error) {
      console.warn("[price-simple]", url, error);
      return null;
    }
  }

  async function tryLoadSnapshotAwareJson(url) {
    try {
      return await loadSnapshotAwareJson(url);
    } catch (error) {
      console.warn("[price-simple] snapshot-aware", url, error);
      return null;
    }
  }

  function waitResult(ms, value) {
    return new Promise(function (resolve) {
      window.setTimeout(function () { resolve(value); }, ms);
    });
  }

  async function loadSnapshotAwareJson(url) {
    var localPayload = null;
    var localError = null;
    var localSource = "local";
    var snapshotTask = null;

    if (typeof window.__alteaLoadPortalSnapshot === "function") {
      snapshotTask = Promise.resolve()
        .then(function () { return window.__alteaLoadPortalSnapshot(url); })
        .catch(function (error) {
          console.warn("[price-simple] snapshot", url, error);
          return null;
        });
    }

    try {
      var localResult = await fetchJsonNoStore(url);
      localPayload = localResult && localResult.payload;
      localSource = localResult && localResult.source || "local";
    } catch (error) {
      localError = error;
    }

    var snapshotPayload = null;
    if (snapshotTask) {
      snapshotPayload = await Promise.race([
        snapshotTask,
        waitResult(localPayload != null ? SNAPSHOT_WAIT_MS : SNAPSHOT_HARD_WAIT_MS, null)
      ]);
    }

    var chosen = chooseFreshestPayload(snapshotPayload, localPayload);
    if (chosen && chosen.source === "local" && localSource !== "local") {
      chosen = { payload: chosen.payload, source: localSource };
    }
    if (chosen) return chosen;
    if (localError) throw localError;
    throw new Error("Failed to load " + url);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#view-prices{padding:24px 28px 36px;min-height:520px;}",
      ".pw-shell{display:grid;gap:16px;}",
      ".pw-card,.pw-modal-box{background:rgba(21,17,12,.80);border:1px solid rgba(214,175,85,.16);border-radius:22px;box-shadow:0 18px 50px rgba(0,0,0,.24);}",
      ".pw-card{padding:18px 20px;}",
      ".pw-title{font-size:32px;line-height:1.05;font-weight:800;color:#f4ead6;}",
      ".pw-sub{font-size:14px;line-height:1.55;color:#d8c6a3;max-width:980px;margin-top:8px;}",
      ".pw-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:14px;}",
      ".pw-label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#bda57a;}",
      ".pw-chip-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}",
      ".pw-chip{border:1px solid rgba(214,175,85,.24);background:rgba(214,175,85,.06);color:#f3e3bf;border-radius:999px;padding:8px 12px;font-size:13px;cursor:pointer;}",
      ".pw-chip.active{background:linear-gradient(135deg,#c49a37,#f2d48d);color:#23180b;border-color:transparent;}",
      ".pw-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px;}",
      ".pw-grid2 input,.pw-search{width:100%;box-sizing:border-box;border-radius:14px;border:1px solid rgba(214,175,85,.18);background:rgba(9,7,5,.78);color:#f7ead1;padding:12px 14px;}",
      ".pw-help{display:grid;gap:10px;margin-top:12px;padding:14px 16px;border-radius:18px;border:1px solid rgba(214,175,85,.14);background:rgba(214,175,85,.05);}",
      ".pw-help details{border-top:1px solid rgba(214,175,85,.12);padding-top:10px;}",
      ".pw-help details:first-child{border-top:0;padding-top:0;}",
      ".pw-help summary{cursor:pointer;color:#f5e6c2;font-weight:700;}",
      ".pw-help ul{margin:8px 0 0;padding-left:18px;color:#d7c39f;display:grid;gap:6px;}",
      ".pw-alert{margin-top:14px;padding:14px 16px;border-radius:18px;border:1px solid rgba(214,175,85,.18);background:rgba(214,175,85,.07);color:#f4ead6;}",
      ".pw-alert.warn{border-color:rgba(255,171,92,.28);background:rgba(115,63,17,.22);}",
      ".pw-alert strong{display:block;margin-bottom:6px;color:#fff0cf;}",
      ".pw-detail{margin-top:10px;}",
      ".pw-detail summary{cursor:pointer;color:#f5e6c2;font-weight:700;}",
      ".pw-detail-note{margin-top:8px;color:#cdb892;line-height:1.45;}",
      ".pw-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;}",
      ".pw-stat strong{display:block;margin-top:8px;font-size:28px;color:#fff0cf;}",
      ".pw-stat small{display:block;margin-top:6px;color:#cdb892;line-height:1.45;}",
      ".pw-table-wrap{overflow:auto;}",
      ".pw-table{width:100%;border-collapse:collapse;min-width:1180px;}",
      ".pw-table th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#bda57a;text-align:left;padding:0 14px 10px;}",
      ".pw-table td{padding:14px;border-top:1px solid rgba(214,175,85,.1);vertical-align:top;color:#f4ead6;}",
      ".pw-row{cursor:pointer;transition:background .18s ease;}",
      ".pw-row:hover{background:rgba(214,175,85,.05);}",
      ".pw-sku{font-weight:700;color:#fff0cf;}",
      ".pw-note{margin-top:4px;color:#bda57a;font-size:12px;line-height:1.35;max-width:460px;}",
      ".pw-badge{display:inline-flex;padding:4px 8px;border-radius:999px;border:1px solid rgba(214,175,85,.26);background:rgba(214,175,85,.08);color:#f3dfb6;font-size:12px;line-height:1.2;}",
      ".pw-repricer-cell{display:grid;gap:4px;min-width:110px;}",
      ".pw-repricer-cell strong{color:#fff0cf;font-weight:700;}",
      ".pw-repricer-cell small{color:#cdb892;line-height:1.3;}",
      ".pw-danger{color:#ffb7b7;}",
      ".pw-empty{padding:32px 10px;color:#cdb892;text-align:center;}",
      ".pw-error{padding:22px;color:#ffb7b7;background:rgba(120,28,28,.18);border:1px solid rgba(255,120,120,.22);border-radius:18px;}",
      ".pw-modal{position:fixed;inset:0;background:rgba(7,5,4,.78);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:24px;z-index:1000;}",
      ".pw-modal.open{display:flex;}",
      ".pw-modal-box{width:min(1180px,96vw);max-height:92vh;overflow:auto;padding:22px;display:grid;gap:18px;}",
      ".pw-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;}",
      ".pw-modal-head h3{margin:0;font-size:30px;line-height:1.08;color:#fff0cf;}",
      ".pw-close{border:1px solid rgba(214,175,85,.25);background:rgba(214,175,85,.06);color:#f4e4bf;border-radius:999px;padding:10px 14px;cursor:pointer;}",
      ".pw-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;}",
      ".pw-mini{background:rgba(9,7,5,.74);border:1px solid rgba(214,175,85,.12);border-radius:18px;padding:14px 16px;}",
      ".pw-mini strong{display:block;margin-top:8px;font-size:24px;color:#fff0cf;}",
      ".pw-mini small{display:block;margin-top:6px;color:#cdb892;line-height:1.4;}",
      ".pw-history-wrap{overflow:auto;}",
      ".pw-history{width:100%;border-collapse:collapse;min-width:760px;}",
      ".pw-history th,.pw-history td{padding:10px 12px;border-top:1px solid rgba(214,175,85,.1);text-align:left;}",
      ".pw-history th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#bda57a;}",
      "@media (max-width:1080px){.pw-grid,.pw-stats,.pw-kpis{grid-template-columns:1fr 1fr;}}",
      "@media (max-width:720px){#view-prices{padding:18px 14px 28px;}.pw-grid,.pw-stats,.pw-kpis,.pw-grid2{grid-template-columns:1fr;}.pw-title{font-size:28px;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function readManualMap() {
    var map = Object.create(null);
    STORAGE_KEYS.forEach(function (key) {
      try {
        var raw = JSON.parse(localStorage.getItem(key) || "null");
        if (!raw) return;
        var list = Array.isArray(raw) ? raw : Object.values(raw);
        list.forEach(function (item) {
          var id = norm(item && (item.articleKey || item.article || item.sku || item.key));
          if (!id) return;
          map[id] = Object.assign(map[id] || {}, item);
        });
      } catch (error) {
        console.warn("[price-simple] localStorage", key, error);
      }
    });
    return map;
  }

  function buildSkuMetaMap() {
    var map = Object.create(null);
    var skuRows = Array.isArray(window.state && window.state.skus) ? window.state.skus : [];
    skuRows.forEach(function (row) {
      var key = norm(row && (row.articleKey || row.article || row.sku));
      if (!key || map[key]) return;
      map[key] = {
        owner: row && row.owner && typeof row.owner === "object" ? row.owner.name : (row && row.owner),
        status: row && (row.statusSku || row.status),
        role: row && (row.roleSku || row.role),
        launchReady: row && row.launchReady
      };
    });
    var profiles = Array.isArray(window.state && window.state.storage && window.state.storage.repricerSkuProfiles)
      ? window.state.storage.repricerSkuProfiles
      : [];
    profiles.forEach(function (row) {
      var key = norm(row && (row.articleKey || row.article || row.sku));
      if (!key) return;
      map[key] = Object.assign({}, map[key] || {}, {
        owner: (map[key] && map[key].owner) || "",
        status: row && row.status ? row.status : (map[key] && map[key].status),
        role: row && row.role ? row.role : (map[key] && map[key].role),
        launchReady: row && row.launchReady ? row.launchReady : (map[key] && map[key].launchReady)
      });
    });
    return map;
  }

  function procurementPlatform(value) {
    var normalized = norm(value);
    if (normalized === "wb" || normalized === "wildberries") return "wb";
    if (normalized === "ozon") return "ozon";
    return "";
  }

  function buildOrderProcurementLookup(combinedPayload, wbPayload, ozonPayload) {
    var maps = { wb: Object.create(null), ozon: Object.create(null) };
    var generatedAt = "";

    function ingestPayload(payload, fallbackPlatform) {
      if (!payload || !Array.isArray(payload.rows)) return;
      generatedAt = parseFreshStamp(payload.generatedAt) > parseFreshStamp(generatedAt) ? payload.generatedAt : generatedAt;
      var payloadPlatform = procurementPlatform((payload && payload.platform) || fallbackPlatform);
      payload.rows.forEach(function (row) {
        var key = norm(row && (row.articleKey || row.article || row.sku));
        var platform = procurementPlatform(row && row.platform) || payloadPlatform;
        if (!key || !platform || !maps[platform]) return;
        var item = maps[platform][key] || {
          articleKey: row && (row.articleKey || row.article || row.sku) || "",
          stock: 0,
          inTransit: 0,
          inRequest: 0,
          avgDaily: 0,
          rowCount: 0,
          turnoverDays: null
        };
        item.stock += num(row && row.inStock) || 0;
        item.inTransit += num(row && row.inTransit) || 0;
        item.inRequest += num(row && row.inRequest) || 0;
        item.avgDaily += num(row && row.avgDaily) || 0;
        item.rowCount += 1;
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

  async function loadOrderProcurementLookup() {
    var combinedResult = await tryLoadSnapshotAwareJson(ORDER_PROCUREMENT_URL);
    var combinedPayload = combinedResult ? combinedResult.payload : null;
    var wbPayload = null;
    var ozonPayload = null;
    if (!combinedPayload || !Array.isArray(combinedPayload.rows) || !combinedPayload.rows.length) {
      var wbResult = await tryLoadSnapshotAwareJson(ORDER_PROCUREMENT_WB_URL);
      var ozonResult = await tryLoadSnapshotAwareJson(ORDER_PROCUREMENT_OZON_URL);
      wbPayload = wbResult ? wbResult.payload : null;
      ozonPayload = ozonResult ? ozonResult.payload : null;
    }
    return buildOrderProcurementLookup(combinedPayload, wbPayload, ozonPayload);
  }

  function buildRow(source, market, manualMap, overlayRow, maxDate, skuMeta, orderProcurementRow) {
    var timeline = Array.isArray(source.monthly) ? source.monthly : Array.isArray(source.daily) ? source.daily : [];
    timeline = mergeTimelineWithOverlay(timeline, overlayRow, maxDate);
    var overlayClearsFill = overlayFlagEnabled(overlayRow && (overlayRow.clearCurrentFillPrice || overlayRow.clearCurrentPrice));
    var overlayClearsClient = overlayFlagEnabled(overlayRow && overlayRow.clearCurrentClientPrice);
    var overlayClearsSpp = overlayFlagEnabled(overlayRow && overlayRow.clearCurrentSppPct);
    var overlayClearsTurnover = overlayFlagEnabled(overlayRow && overlayRow.clearCurrentTurnoverDays);
    var overlayFillPrice = num(overlayRow && (overlayRow.currentFillPrice != null ? overlayRow.currentFillPrice : overlayRow.currentPrice));
    var overlayClientPrice = num(overlayRow && overlayRow.currentClientPrice);
    var overlaySppPct = num(overlayRow && overlayRow.currentSppPct);
    var overlayTurnoverDays = num(overlayRow && overlayRow.currentTurnoverDays);
    var overlayStatus = overlayRow && overlayRow.status;
    var overlayOwner = overlayRow && overlayRow.owner;
    var overlayValueDate = isoDate(overlayRow && (overlayRow.valueDate || overlayRow.historyFreshnessDate));
    var sourceValueDate = isoDate(source && source.historyFreshnessDate) || isoDate(maxDate);
    var useOverlayFacts = Boolean(overlayRow) && (!overlayValueDate || !sourceValueDate || overlayValueDate >= sourceValueDate);
    var sourceFillPrice = num(source.currentFillPrice != null ? source.currentFillPrice : source.currentPrice);
    var sourceClientPrice = num(source.currentClientPrice);
    var sourceSppPct = num(source.currentSppPct);
    var sourceTurnoverDays = num(source.turnoverCurrentDays != null ? source.turnoverCurrentDays : source.currentTurnoverDays);
    var procurementTurnoverDays = num(orderProcurementRow && orderProcurementRow.turnoverDays);
    var turnoverDays = null;
    var turnoverSource = "";
    if (overlayTurnoverDays != null && (useOverlayFacts || sourceTurnoverDays == null)) {
      turnoverDays = overlayTurnoverDays;
      turnoverSource = "overlay";
    } else if (!overlayClearsTurnover && sourceTurnoverDays != null) {
      turnoverDays = sourceTurnoverDays;
      turnoverSource = "workbench";
    } else if (procurementTurnoverDays != null) {
      turnoverDays = procurementTurnoverDays;
      turnoverSource = "order_procurement";
    }
    var sourceKey = norm(source && (source.articleKey || source.article || source.sku));
    var skuRow = (skuMeta && skuMeta[sourceKey]) || null;
    var row = {
      market: market,
      articleKey: source.articleKey || source.article || source.sku || "",
      name: source.name || source.title || source.articleKey || "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f",
      owner: overlayOwner || source.owner || (skuRow && skuRow.owner) || "\u2014",
      status: overlayStatus || source.status || (skuRow && skuRow.status) || "\u2014",
      role: source.role || (skuRow && skuRow.role) || "\u2014",
      launchReady: source.launchReady || (skuRow && skuRow.launchReady) || "\u2014",
      allowedMarginPct: num(source.allowedMarginPct),
      marginTotalPct: num(source.marginTotalPct != null ? source.marginTotalPct : source.avgMargin7dPct),
      turnoverDays: turnoverDays,
      turnoverSource: turnoverSource,
      currentFillPrice: overlayClearsFill
        ? null
        : ((overlayFillPrice != null && (useOverlayFacts || sourceFillPrice == null)) ? overlayFillPrice : sourceFillPrice),
      currentClientPrice: overlayClearsClient
        ? null
        : ((overlayClientPrice != null && (useOverlayFacts || sourceClientPrice == null)) ? overlayClientPrice : sourceClientPrice),
      currentSppPct: overlayClearsSpp
        ? null
        : sanitizeDiscountPct((overlaySppPct != null && (useOverlayFacts || sourceSppPct == null)) ? overlaySppPct : sourceSppPct),
      requiredPriceForMargin: num(source.requiredPriceForMargin),
      historyNote: source.historyNote || "",
      valueDate: (useOverlayFacts && overlayValueDate) ? overlayValueDate : (sourceValueDate || isoDate(maxDate)),
      timeline: timeline
    };
    var manual = manualMap[norm(row.articleKey)];
    if (manual) {
      if (manual.owner) row.owner = manual.owner;
      if (manual.comment) row.comment = manual.comment;
      if (manual.reason) row.reason = manual.reason;
      if (manual.allowedMarginManualPct != null) {
        var override = num(manual.allowedMarginManualPct);
        row.allowedMarginPct = override != null ? (override > 1 ? override / 100 : override) : row.allowedMarginPct;
      }
    }
    return row;
  }

  async function loadData(forceRefresh) {
    if (forceRefresh && typeof window.__alteaResetPortalSnapshotState === "function") {
      window.__alteaResetPortalSnapshotState();
    }
    if (state.loading) return;
    if (state.loaded && !forceRefresh) return;
    if (forceRefresh) resetStateForReload();
    state.loading = true;
    renderPriceWorkbench();
    try {
      var dataResult = await loadSnapshotAwareJson(DATA_URL);
      var payload = dataResult.payload || {};
      var overlayPayload = null;
      var overlaySource = "none";
      var orderProcurementLookup = { generatedAt: "", maps: { wb: Object.create(null), ozon: Object.create(null) } };
      try {
        var overlayResult = await loadSnapshotAwareJson(OVERLAY_URL);
        overlayPayload = overlayResult.payload || null;
        overlaySource = overlayResult.source || "local";
      } catch (error) {
        console.warn("[price-simple] overlay", error);
      }
      try {
        orderProcurementLookup = await loadOrderProcurementLookup();
      } catch (error) {
        console.warn("[price-simple] order procurement", error);
      }
      var manualMap = readManualMap();
      var skuMetaMap = buildSkuMetaMap();
      var overlayMaps = buildOverlayMaps(overlayPayload || {});
      var maxDate = isoDate((overlayPayload && (overlayPayload.asOfDate || overlayPayload.generatedAt)) || payload.generatedAt);
      var rows = [];
      Object.keys(payload.platforms || {}).forEach(function (market) {
        normalizeRows((payload.platforms[market] || {}).rows).forEach(function (item) {
          var overlayRow = overlayMaps[market] && overlayMaps[market][norm(item.articleKey || item.article || item.sku)];
          var orderProcurementRow = orderProcurementLookup.maps[market] && orderProcurementLookup.maps[market][norm(item.articleKey || item.article || item.sku)];
          rows.push(buildRow(item, market, manualMap, overlayRow || null, maxDate, skuMetaMap, orderProcurementRow || null));
        });
      });
      state.rows = rows;
      state.overlayGeneratedAt = overlayPayload && overlayPayload.generatedAt ? overlayPayload.generatedAt : "";
      state.orderProcurementGeneratedAt = orderProcurementLookup.generatedAt || "";
      state.orderProcurementFallbackCount = rows.filter(function (row) { return row.turnoverSource === "order_procurement"; }).length;
      state.sourceNote = overlayPayload && overlayPayload.generatedAt
        ? DATA_URL + " (" + dataResult.source + ") + " + OVERLAY_URL + " (" + overlaySource + ") \u00b7 \u0446\u0435\u043d\u044b \u0434\u043e " + isoDate(overlayPayload.asOfDate || overlayPayload.generatedAt)
        : DATA_URL + " (" + dataResult.source + ") \u00b7 \u0431\u0435\u0437 \u0441\u0432\u0435\u0436\u0435\u0433\u043e overlay";
      if (state.orderProcurementFallbackCount > 0) {
        state.sourceNote += " \u00b7 \u043e\u0431\u043e\u0440\u043e\u0442 fallback: order_procurement";
        if (state.orderProcurementGeneratedAt) {
          state.sourceNote += " \u0434\u043e " + isoDate(state.orderProcurementGeneratedAt);
        }
        state.sourceNote += " (" + state.orderProcurementFallbackCount + " SKU)";
      }
      state.loaded = true;
      var last = latestDate(rows);
      state.latestTimelineDate = last;
      state.earliestTimelineDate = earliestDate(rows);
      state.latestFactDate = isoDate((overlayPayload && (overlayPayload.asOfDate || overlayPayload.generatedAt)) || payload.generatedAt || last);
      state.dataLagDays = state.latestFactDate ? Math.max(0, diffDays(state.latestFactDate, todayKey())) : 0;
      if (last) {
        state.dateTo = last;
        state.dateFrom = shiftDate(last, -6);
      }
      normalizeDateRange();
    } catch (error) {
      state.error = error && error.message ? error.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0432\u043a\u043b\u0430\u0434\u043a\u0443 \u0426\u0435\u043d\u044b.";
    } finally {
      state.loading = false;
      renderPriceWorkbench();
    }
  }

  function rangeSlice(row) {
    return (row.timeline || []).filter(function (item) {
      if (!item || !item.date) return false;
      if (state.dateFrom && item.date < state.dateFrom) return false;
      if (state.dateTo && item.date > state.dateTo) return false;
      return true;
    });
  }

  function latestRangePoint(row) {
    var items = rangeSlice(row);
    return items.length ? items[items.length - 1] : null;
  }

  function latestNonNullRangeMetric(row, key) {
    var items = rangeSlice(row);
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

  function metricHelp(baseText, factDate, sliceDate) {
    if (factDate && sliceDate && factDate !== sliceDate) {
      return baseText + " Последний непустой факт в диапазоне: " + factDate + ".";
    }
    return baseText;
  }

  function buildDisplayRow(row) {
    if (!row) return null;
    var next = Object.assign({}, row);
    var point = latestRangePoint(row);
    next.rangeHasPoint = Boolean(point);
    next.repricerDisplay = buildRepricerDisplay(next.market, next.articleKey);
    if (!point) return next;

    var priceMetric = latestNonNullRangeMetric(row, "price");
    var clientMetric = latestNonNullRangeMetric(row, "clientPrice");
    var sppMetric = latestNonNullRangeMetric(row, "sppPct");
    var turnoverMetric = latestNonNullRangeMetric(row, "turnoverDays");

    next.currentFillPrice = priceMetric.value != null ? priceMetric.value : row.currentFillPrice;
    next.currentClientPrice = clientMetric.value != null ? clientMetric.value : row.currentClientPrice;
    next.currentSppPct = sanitizeDiscountPct(sppMetric.value != null ? sppMetric.value : row.currentSppPct);
    next.turnoverDays = turnoverMetric.value != null ? turnoverMetric.value : row.turnoverDays;
    next.valueDate = isoDate(point.date) || row.valueDate;
    next.priceFactDate = priceMetric.value != null ? priceMetric.date : isoDate(row.valueDate);
    next.clientPriceFactDate = clientMetric.value != null ? clientMetric.date : isoDate(row.valueDate);
    next.sppFactDate = sppMetric.value != null ? sppMetric.date : isoDate(row.valueDate);
    next.turnoverFactDate = turnoverMetric.value != null ? turnoverMetric.date : isoDate(row.valueDate);
    return next;
  }

  function visibleRows() {
    var search = String(state.search || "").trim().toLowerCase();
    var next = [];
    state.rows.forEach(function (row) {
      if (state.market !== "all" && row.market !== state.market) return;
      if (search) {
        var hay = [row.articleKey, row.name, row.owner, row.status, row.comment, row.reason].join(" ").toLowerCase();
        if (hay.indexOf(search) === -1) return;
      }
      var displayRow = buildDisplayRow(row);
      if ((state.dateFrom || state.dateTo) && !displayRow.rangeHasPoint) return;
      next.push(displayRow);
    });
    return next;
  }

  function stats(rows) {
    function mean(list) {
      return list.length ? list.reduce(function (acc, value) { return acc + value; }, 0) / list.length : null;
    }
    var price = [];
    var margin = [];
    var turnover = [];
    var below = 0;
    rows.forEach(function (row) {
      if (row.currentFillPrice != null) price.push(row.currentFillPrice);
      if (row.marginTotalPct != null) margin.push(row.marginTotalPct);
      if (row.turnoverDays != null) turnover.push(row.turnoverDays);
      if (row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct) below += 1;
    });
    return {
      count: rows.length,
      avgPrice: mean(price),
      avgMargin: mean(margin),
      avgTurnover: mean(turnover),
      belowAllowed: below
    };
  }

  function findRow(key) {
    var wanted = norm(key);
    return state.rows.find(function (row) { return norm(row.articleKey) === wanted; }) || null;
  }

  function renderRepricerCell(display) {
    if (!display || moneyRound(display.price) == null) return "\u2014";
    return [
      '<div class="pw-repricer-cell"',
      display.hint ? ' title="' + esc(display.hint) + '"' : "",
      '><strong>', money(display.price), '</strong><small>', esc(display.label || "Репрайсер"), '</small></div>'
    ].join("");
  }

  function renderTable(rows) {
    if (!rows.length) return '<div class="pw-empty">\u041f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u043c \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0441\u0442\u0440\u043e\u043a.</div>';
    var sorted = rows.slice().sort(function (a, b) {
      var dangerA = a.allowedMarginPct != null && a.marginTotalPct != null && a.marginTotalPct < a.allowedMarginPct ? 1 : 0;
      var dangerB = b.allowedMarginPct != null && b.marginTotalPct != null && b.marginTotalPct < b.allowedMarginPct ? 1 : 0;
      if (dangerA !== dangerB) return dangerB - dangerA;
      return (b.currentFillPrice || 0) - (a.currentFillPrice || 0);
    });
    return [
      '<div class="pw-table-wrap"><table class="pw-table"><thead><tr>',
      '<th>\u0410\u0440\u0442\u0438\u043a\u0443\u043b</th><th>Owner</th><th>\u0421\u0442\u0430\u0442\u0443\u0441</th><th>\u0426\u0435\u043d\u0430 MP</th><th>\u0426\u0435\u043d\u0430 \u0440\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440\u0430</th><th>\u0426\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430</th><th>\u0421\u041f\u041f</th><th>\u0414\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u0430\u044f 3\u043c</th><th>\u041c\u0430\u0440\u0436\u0430</th><th>\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c</th>',
      '</tr></thead><tbody>',
      sorted.map(function (row) {
        var danger = row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct;
        return [
          '<tr class="pw-row" data-open-price="', esc(row.articleKey), '" data-price-market="', esc(row.market), '">',
          '<td><div class="pw-sku">', esc(row.articleKey), '</div><div class="pw-note">', esc(row.name), '</div></td>',
          '<td>', esc(row.owner || "\u2014"), '</td>',
          '<td><span class="pw-badge">', esc(row.status || "\u2014"), '</span></td>',
          '<td>', money(row.currentFillPrice), '</td>',
          '<td>', renderRepricerCell(row.repricerDisplay), '</td>',
          '<td>', money(row.currentClientPrice), '</td>',
          '<td>', pct(row.currentSppPct), '</td>',
          '<td>', pct(row.allowedMarginPct), '</td>',
          '<td class="', danger ? 'pw-danger' : '', '">', pct(row.marginTotalPct), '</td>',
          '<td>', days(row.turnoverDays), '</td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table></div>'
    ].join("");
  }

  function renderHistory(row) {
    var items = rangeSlice(row).slice(-14);
    if (!items.length) {
      return '<div class="pw-empty">\u0412\u043d\u0443\u0442\u0440\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u043f\u0435\u0440\u0438\u043e\u0434\u0430 \u043d\u0435\u0442 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0434\u043d\u0435\u0432\u043d\u044b\u0445 \u0442\u043e\u0447\u0435\u043a.</div>';
    }
    var hasSalesHistory = items.some(function (item) {
      return num(item && item.ordersUnits) != null || num(item && item.revenue) != null;
    });
    var note = '\u0417\u0434\u0435\u0441\u044c \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0435 \u0442\u043e\u0447\u043a\u0438 \u0432\u043d\u0443\u0442\u0440\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u043f\u0435\u0440\u0438\u043e\u0434\u0430. \u0415\u0441\u043b\u0438 \u0441\u0435\u0433\u043e\u0434\u043d\u044f\u0448\u043d\u0435\u0439 \u0442\u043e\u0447\u043a\u0438 \u0435\u0449\u0451 \u043d\u0435\u0442, \u0438\u0441\u0442\u043e\u0440\u0438\u044f \u0437\u0430\u043a\u0430\u043d\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044f \u043d\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u043c \u0441\u0440\u0435\u0437\u0435.';
    if (!hasSalesHistory) {
      note += ' \u0414\u043d\u0435\u0432\u043d\u044b\u0435 \u0437\u0430\u043a\u0430\u0437\u044b \u0438 \u0432\u044b\u0440\u0443\u0447\u043a\u0430 \u0432 \u0442\u0435\u043a\u0443\u0449\u0435\u043c smart_price_workbench \u043f\u043e\u043a\u0430 \u043d\u0435 \u043f\u0440\u0438\u0435\u0445\u0430\u043b\u0438, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u0442\u043e\u043b\u044c\u043a\u043e \u0446\u0435\u043d\u0443, SPP \u0438 \u043e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c.';
    }
    if (row.market === "wb") {
      note += ' \u041f\u043e WB \u0438\u0441\u0442\u043e\u0440\u0438\u044f \u043f\u043e \u0434\u043d\u044f\u043c \u0441\u0442\u0440\u043e\u0438\u0442\u0441\u044f \u0438\u0437 daily market-facts. \u042d\u0442\u043e \u043d\u0435 \u0436\u0443\u0440\u043d\u0430\u043b \u0440\u0443\u0447\u043d\u044b\u0445 \u0441\u043c\u0435\u043d \u0446\u0435\u043d\u044b, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043f\u043e\u0440\u0442\u0430\u043b \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u043f\u0435\u0440\u0432\u044b\u0439 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0439 \u0434\u043d\u0435\u0432\u043d\u043e\u0439 \u0444\u0430\u043a\u0442 \u043f\u043e\u0441\u043b\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f.';
    }
    return [
      '<details class="pw-detail"><summary>\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0439 \u043f\u043e \u0434\u043d\u044f\u043c</summary>',
      '<div class="pw-detail-note">', esc(note), '</div>',
      '<div class="pw-history-wrap"><table class="pw-history"><thead><tr>',
      '<th>\u0414\u0430\u0442\u0430</th><th>\u0426\u0435\u043d\u0430 MP</th><th>\u0421\u041f\u041f</th><th>\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c</th>',
      hasSalesHistory ? '<th>\u0417\u0430\u043a\u0430\u0437\u044b</th><th>\u0412\u044b\u0440\u0443\u0447\u043a\u0430</th>' : '',
      '</tr></thead><tbody>',
      items.map(function (item) {
        return [
          '<tr><td>', esc(item.date || ""), '</td>',
          '<td>', money(num(item.price)), '</td>',
          '<td>', pct(num(item.sppPct)), '</td>',
          '<td>', days(num(item.turnoverDays)), '</td>',
          hasSalesHistory ? '<td>' + intf(num(item.ordersUnits)) + '</td><td>' + money(num(item.revenue)) + '</td>' : '',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table></div></details>'
    ].join("");
  }

  function renderModal(row) {
    if (!row) return "";
    var turnoverHelp = row.turnoverSource === "order_procurement"
      ? "\u0424\u043e\u043b\u0431\u044d\u043a \u0438\u0437 \u0417\u0430\u043a\u0430\u0437\u0430: inStock / avgDaily \u043f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435."
      : "\u0422\u0435\u043a\u0443\u0449\u0435\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043f\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u0438.";
    return [
      '<div class="pw-modal ', state.selectedKey ? 'open' : '', '" id="priceSimpleModal">',
      '<div class="pw-modal-box">',
      '<div class="pw-modal-head">',
      '<div><h3>', esc(row.articleKey), '</h3><div class="pw-sub">', esc(row.name), '</div></div>',
      '<button class="pw-close" type="button" data-close-price-modal>\u0417\u0430\u043a\u0440\u044b\u0442\u044c</button>',
      '</div>',
      '<div class="pw-kpis">',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 MP</span><strong>', money(row.currentFillPrice), '</strong><small>', esc(metricHelp("\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0439 \u0444\u0430\u043a\u0442 \u0446\u0435\u043d\u044b \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430.", row.priceFactDate, row.valueDate)), '</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430</span><strong>', money(row.currentClientPrice), '</strong><small>', esc(metricHelp("\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0439 \u043a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440.", row.clientPriceFactDate, row.valueDate)), '</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0414\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u0430\u044f \u043c\u0430\u0440\u0436\u0430 3\u043c</span><strong>', pct(row.allowedMarginPct), '</strong><small>\u0411\u0435\u0440\u0435\u043c \u0438\u0437 smart/workbench \u0441\u043b\u043e\u044f \u0431\u0435\u0437 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438 \u043a \u043d\u043e\u043c\u0435\u0440\u0443 \u0441\u0442\u0440\u043e\u043a\u0438.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u043c\u0430\u0440\u0436\u0430</span><strong>', pct(row.marginTotalPct), '</strong><small>\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u043f\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u0438.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c</span><strong>', days(row.turnoverDays), '</strong><small>', esc(metricHelp(turnoverHelp, row.turnoverFactDate, row.valueDate)), '</small></div>',
      '<div class="pw-mini"><span class="pw-label">Owner</span><strong>', esc(row.owner || "\u2014"), '</strong><small>\u0420\u0443\u0447\u043d\u043e\u0435 \u043f\u043e\u043b\u0435 \u043d\u0435 \u043f\u0435\u0440\u0435\u0442\u0438\u0440\u0430\u0435\u043c.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0421\u0442\u0430\u0442\u0443\u0441 \u0442\u043e\u0432\u0430\u0440\u0430</span><strong>', esc(row.status || "\u2014"), '</strong><small>\u0421\u0442\u0430\u0442\u0443\u0441 \u0441\u0442\u0440\u043e\u043a\u0438 \u043f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u043c\u0443 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0443.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 \u043f\u043e \u043c\u0430\u0440\u0436\u0435</span><strong>', money(row.requiredPriceForMargin), '</strong><small>\u0415\u0441\u043b\u0438 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043f\u0440\u0438\u0435\u0445\u0430\u043b\u043e \u0432 smart-\u0441\u043b\u043e\u0435.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0421\u0440\u0435\u0437 \u0446\u0435\u043d</span><strong>', esc(row.valueDate || state.latestFactDate || "\u2014"), '</strong><small>\u042d\u0442\u043e \u0434\u0430\u0442\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0439 \u0442\u043e\u0447\u043a\u0438 \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0435.</small></div>',
      '</div>',
      '<div class="pw-card">',
      '<div class="pw-label">\u041a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u043f\u043e\u0437\u0438\u0446\u0438\u0438</div>',
      '<div class="pw-note">', esc(row.historyNote || "\u0412 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c, \u043e\u0442\u043a\u0443\u0434\u0430 \u0432\u0437\u044f\u043b\u0438 \u0442\u0435\u043a\u0443\u0449\u0443\u044e \u0446\u0435\u043d\u0443, \u043c\u0430\u0440\u0436\u0443 \u0438 \u043e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c."), '</div>',
      renderHistory(row),
      '</div>',
      '</div></div>'
    ].join("");
  }

  function renderControlGuide() {
    return [
      '<div class="pw-help">',
      '<details><summary>\u0427\u0442\u043e \u0434\u0435\u043b\u0430\u044e\u0442 \u043a\u043d\u043e\u043f\u043a\u0438 \u0438 \u0444\u0438\u043b\u044c\u0442\u0440\u044b</summary>',
      '<ul>',
      '<li><strong>\u0412\u0441\u0435 / WB / Ozon / \u042f.\u041c\u0430\u0440\u043a\u0435\u0442</strong> \u2014 \u043f\u0440\u043e\u0441\u0442\u043e \u0441\u0443\u0436\u0430\u044e\u0442 \u0442\u0430\u0431\u043b\u0438\u0446\u0443 \u043f\u043e \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435. \u041d\u043e\u0432\u044b\u0439 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u043e\u043d\u0438 \u043d\u0435 \u043f\u043e\u0434\u0433\u0440\u0443\u0436\u0430\u044e\u0442.</li>',
      '<li><strong>7 / 14 / 30 \u0434\u043d\u0435\u0439</strong> \u2014 \u0431\u044b\u0441\u0442\u0440\u043e \u043f\u0435\u0440\u0435\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u044e\u0442 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d \u043e\u0442 \u043f\u043e\u043b\u044f "\u043f\u043e".</li>',
      '<li><strong>\u0421\u0435\u0433\u043e\u0434\u043d\u044f</strong> \u2014 \u0441\u0442\u0430\u0432\u0438\u0442 \u043f\u0440\u0430\u0432\u0443\u044e \u0433\u0440\u0430\u043d\u0438\u0446\u0443 \u043d\u0430 \u0442\u0435\u043a\u0443\u0449\u0443\u044e \u0434\u0430\u0442\u0443. \u0415\u0441\u043b\u0438 \u0441\u0435\u0433\u043e\u0434\u043d\u044f \u0435\u0449\u0451 \u043d\u0435\u0442 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0442\u043e\u0447\u0435\u043a, \u0442\u0430\u0431\u043b\u0438\u0446\u0430 \u043f\u043e\u043a\u0430\u0436\u0435\u0442 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0439 \u0441\u0440\u0435\u0437 \u0432\u043d\u0443\u0442\u0440\u0438 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0430.</li>',
      '<li><strong>\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0441\u0440\u0435\u0437</strong> \u2014 \u0431\u044b\u0441\u0442\u0440\u043e \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d \u043a \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u043c\u0443 \u0434\u043d\u044e, \u043a\u043e\u0442\u043e\u0440\u044b\u0439 \u0435\u0441\u0442\u044c \u0432 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0435.</li>',
      '<li><strong>\u041a\u043b\u0438\u043a \u043f\u043e \u0441\u0442\u0440\u043e\u043a\u0435</strong> \u2014 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0443 SKU \u0441 \u0442\u0435\u043a\u0443\u0449\u0438\u043c\u0438 KPI \u0438 \u0438\u0441\u0442\u043e\u0440\u0438\u0435\u0439.</li>',
      '</ul>',
      '</details>',
      '<details><summary>\u041a\u0430\u043a \u0447\u0438\u0442\u0430\u0442\u044c \u0442\u0435\u043a\u0443\u0449\u0438\u0435 \u0446\u0435\u043d\u044b</summary>',
      '<ul>',
      '<li><strong>\u0426\u0435\u043d\u0430 MP</strong> \u2014 \u0442\u0435\u043a\u0443\u0449\u0430\u044f \u0446\u0435\u043d\u0430 \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430 \u0438\u0437 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0433\u043e \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0433\u043e \u0441\u0440\u0435\u0437\u0430.</li>',
      '<li><strong>\u0426\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430</strong> \u2014 \u0432\u0438\u0442\u0440\u0438\u043d\u043d\u0430\u044f \u0446\u0435\u043d\u0430 \u043f\u043e\u0441\u043b\u0435 \u0441\u043a\u0438\u0434\u043e\u043a/\u0421\u041f\u041f, \u0435\u0441\u043b\u0438 \u043e\u043d\u0430 \u043f\u0440\u0438\u0435\u0445\u0430\u043b\u0430 \u0432 \u0441\u043b\u043e\u0439.</li>',
      '<li><strong>\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c</strong> \u2014 \u0431\u0435\u0440\u0451\u043c \u0438\u0437 smart/overlay, \u0430 \u0435\u0441\u043b\u0438 \u0442\u0430\u043c \u043d\u0435\u0442 \u0442\u0435\u043a\u0443\u0449\u0435\u0433\u043e \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f, \u043c\u043e\u0436\u0435\u043c \u0443\u043f\u0430\u0441\u0442\u044c \u0432 `order_procurement` fallback.</li>',
      '<li><strong>\u0421\u0440\u0435\u0437 \u0446\u0435\u043d</strong> \u2014 \u043a\u043b\u044e\u0447\u0435\u0432\u0430\u044f \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0430: \u0438\u043c\u0435\u043d\u043d\u043e \u043d\u0430 \u044d\u0442\u0443 \u0434\u0430\u0442\u0443 \u0431\u044b\u043b\u0438 \u0437\u0430\u0444\u0438\u043a\u0441\u0438\u0440\u043e\u0432\u0430\u043d\u044b \u0442\u0435\u043a\u0443\u0449\u0438\u0435 \u0446\u0438\u0444\u0440\u044b \u0432 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435.</li>',
      '</ul>',
      '</details>',
      '</div>'
    ].join("");
  }

  function renderRoot() {
    var root = document.getElementById(VIEW_ID);
    if (!root) return;
    if (state.loaded) normalizeDateRange();
    ensureStyles();
    var rows = visibleRows();
    var summary = stats(rows);
    var selected = state.selectedKey ? buildDisplayRow(findRow(state.selectedKey)) : null;
    root.innerHTML = [
      '<div class="pw-shell">',
      '<section class="pw-card">',
      '<div class="pw-title">\u0426\u0435\u043d\u044b</div>',
      '<div class="pw-sub">\u0412\u043a\u043b\u0430\u0434\u043a\u0430 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0439 \u0441\u043b\u043e\u0439 `smart_price_workbench` + `smart_price_overlay`, \u0430 \u0434\u043b\u044f \u043e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u0438 \u043f\u0440\u0438 \u043d\u0443\u0436\u0434\u0435 \u0434\u043e\u0431\u0438\u0440\u0430\u0435\u0442 `order_procurement`. \u0415\u0441\u043b\u0438 \u0441\u0440\u0435\u0437 \u043d\u0435 \u043d\u0430 \u0441\u0435\u0433\u043e\u0434\u043d\u044f, \u044d\u0442\u043e \u044f\u0432\u043d\u043e \u043f\u043e\u043a\u0430\u0436\u0435\u043c \u0432\u044b\u0448\u0435.</div>',
      state.error ? '<div class="pw-error">' + esc(state.error) + '</div>' : '',
      state.loaded ? '<div class="pw-alert ' + (state.dataLagDays > 1 ? 'warn' : '') + '"><strong>\u0414\u0430\u0442\u0430 \u0441\u0440\u0435\u0437\u0430: ' + esc(state.latestFactDate || "\u2014") + '</strong><div>' + esc(dataFreshnessLabel()) + '</div>' + (state.overlayGeneratedAt ? '<div style="margin-top:6px">' + esc(overlayFreshnessLabel()) + '</div>' : '') + '<div style="margin-top:6px">\u0412 \u0442\u0430\u0431\u043b\u0438\u0446\u0435 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u044e\u044e \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u0443\u044e \u0442\u043e\u0447\u043a\u0443 \u0432\u043d\u0443\u0442\u0440\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0430, \u0430 \u043d\u0435 \u043f\u0440\u043e\u0441\u0442\u043e \u0437\u0430\u0441\u0442\u044b\u0432\u0448\u0438\u0439 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 row.</div></div>' : '',
      '<div class="pw-grid" style="margin-top:14px;">',
      '<div class="pw-card">',
      '<div class="pw-label">\u041f\u043b\u043e\u0449\u0430\u0434\u043a\u0430 \u0438 \u043f\u0435\u0440\u0438\u043e\u0434</div>',
      '<div class="pw-chip-row">',
      ['all','wb','ozon','ym'].map(function (market) {
        var labels = { all: '\u0412\u0441\u0435', wb: 'WB', ozon: 'Ozon', ym: '\u042f.\u041c\u0430\u0440\u043a\u0435\u0442' };
        return '<button type="button" class="pw-chip ' + (state.market === market ? 'active' : '') + '" data-price-market="' + market + '">' + labels[market] + '</button>';
      }).join(""),
      '</div>',
      '<div class="pw-chip-row">',
      '<button type="button" class="pw-chip" data-price-preset="7">7 \u0434\u043d\u0435\u0439</button>',
      '<button type="button" class="pw-chip" data-price-preset="14">14 \u0434\u043d\u0435\u0439</button>',
      '<button type="button" class="pw-chip" data-price-preset="30">30 \u0434\u043d\u0435\u0439</button>',
      '<button type="button" class="pw-chip" data-price-anchor="today">\u0421\u0435\u0433\u043e\u0434\u043d\u044f</button>',
      '<button type="button" class="pw-chip" data-price-anchor="latest">\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0441\u0440\u0435\u0437</button>',
      '</div>',
      '<div class="pw-note">\u0411\u044b\u0441\u0442\u0440\u044b\u0435 \u043a\u043d\u043e\u043f\u043a\u0438 \u043c\u0435\u043d\u044f\u044e\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d. \u0421\u0430\u043c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u0434\u0430\u043d\u043d\u044b\u0445 \u043e\u043d\u0438 \u043d\u0435 \u043f\u0435\u0440\u0435\u0447\u0438\u0442\u044b\u0432\u0430\u044e\u0442.</div>',
      '<div class="pw-grid2">',
      '<input type="date" id="pwFrom" value="', esc(state.dateFrom), '" min="', esc(state.earliestTimelineDate || ""), '" max="', esc(todayKey()), '">',
      '<input type="date" id="pwTo" value="', esc(state.dateTo), '" min="', esc(state.earliestTimelineDate || ""), '" max="', esc(todayKey()), '">',
      '</div></div>',
      '<div class="pw-card">',
      '<div class="pw-label">\u041f\u043e\u0438\u0441\u043a</div>',
      '<input class="pw-search" id="pwSearch" placeholder="\u0410\u0440\u0442\u0438\u043a\u0443\u043b, owner, \u0441\u0442\u0430\u0442\u0443\u0441" value="', esc(state.search), '">',
      '<div class="pw-note">\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: ', esc(state.sourceNote || DATA_URL), '</div>',
      '<div class="pw-note">\u0415\u0441\u043b\u0438 \u043d\u0430 \u043f\u0440\u043e\u0434\u0435 \u043d\u0435\u0442 fresh overlay \u0438\u043b\u0438 order-procurement \u0444\u0430\u0439\u043b\u043e\u0432, \u0432\u043a\u043b\u0430\u0434\u043a\u0430 \u0447\u0435\u0441\u0442\u043d\u043e \u043f\u0430\u0434\u0430\u0435\u0442 \u043d\u0430 \u043f\u043e\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0438\u0439 \u0441\u0440\u0435\u0437.</div>',
      '</div></div>',
      renderControlGuide(),
      '</section>',
      '<section class="pw-stats">',
      '<div class="pw-card pw-stat"><span class="pw-label">SKU \u0432 \u0440\u0430\u0431\u043e\u0442\u0435</span><strong>', intf(summary.count), '</strong><small>\u041f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435 \u0438 \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c.</small></div>',
      '<div class="pw-card pw-stat"><span class="pw-label">\u0421\u0440\u0435\u0434\u043d\u044f\u044f \u0446\u0435\u043d\u0430 MP</span><strong>', money(summary.avgPrice), '</strong><small>\u041f\u043e \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0439 \u0442\u043e\u0447\u043a\u0435 \u0432\u043d\u0443\u0442\u0440\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u043f\u0435\u0440\u0438\u043e\u0434\u0430.</small></div>',
      '<div class="pw-card pw-stat"><span class="pw-label">\u0421\u0440\u0435\u0434\u043d\u044f\u044f \u043c\u0430\u0440\u0436\u0430</span><strong>', pct(summary.avgMargin), '</strong><small>\u041f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u0432\u044b\u0431\u043e\u0440\u043a\u0435 SKU.</small></div>',
      '<div class="pw-card pw-stat"><span class="pw-label">\u041d\u0438\u0436\u0435 \u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u043e\u0439</span><strong>', intf(summary.belowAllowed), '</strong><small>\u0421\u0440\u0430\u0432\u043d\u0438\u0432\u0430\u0435\u043c \u043c\u0430\u0440\u0436\u0443 \u0441\u0440\u0435\u0437\u0430 \u0441 \u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u043e\u0439 3\u043c.</small></div>',
      '</section>',
      '<section class="pw-card">',
      '<div class="pw-label">\u0422\u0430\u0431\u043b\u0438\u0446\u0430</div>',
      state.loading && !state.loaded ? '<div class="pw-empty">\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u044e \u0434\u0430\u043d\u043d\u044b\u0435 \u0432\u043a\u043b\u0430\u0434\u043a\u0438 \u0426\u0435\u043d\u044b...</div>' : renderTable(rows),
      '</section>',
      renderModal(selected),
      '</div>'
    ].join("");

    root.querySelectorAll("[data-price-market]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.market = button.getAttribute("data-price-market");
        renderPriceWorkbench();
      });
    });
    root.querySelectorAll("[data-price-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        var daysCount = Number(button.getAttribute("data-price-preset"));
        if (!state.dateTo) return;
        state.dateFrom = shiftDate(state.dateTo, -(daysCount - 1));
        normalizeDateRange();
        renderPriceWorkbench();
      });
    });
    root.querySelectorAll("[data-price-anchor]").forEach(function (button) {
      button.addEventListener("click", function () {
        var mode = button.getAttribute("data-price-anchor");
        var target = mode === "today" ? todayKey() : (state.latestTimelineDate || state.latestFactDate || todayKey());
        state.dateTo = target;
        state.dateFrom = shiftDate(target, -6);
        normalizeDateRange();
        renderPriceWorkbench();
      });
    });
    var fromInput = document.getElementById("pwFrom");
    var toInput = document.getElementById("pwTo");
    var searchInput = document.getElementById("pwSearch");
    function attachDateHandlers(input, apply) {
      if (!input) return;
      input.addEventListener("change", apply);
      input.addEventListener("input", apply);
      input.addEventListener("click", function () {
        try {
          if (typeof input.showPicker === "function") input.showPicker();
        } catch {}
      });
    }
    attachDateHandlers(fromInput, function () {
      state.dateFrom = fromInput.value;
      normalizeDateRange();
      renderPriceWorkbench();
    });
    attachDateHandlers(toInput, function () {
      state.dateTo = toInput.value;
      normalizeDateRange();
      renderPriceWorkbench();
    });
    if (searchInput) searchInput.addEventListener("input", function () { state.search = searchInput.value; renderPriceWorkbench(); });
    root.querySelectorAll("[data-open-price]").forEach(function (rowNode) {
      rowNode.addEventListener("click", function () {
        state.selectedKey = rowNode.getAttribute("data-open-price");
        renderPriceWorkbench();
      });
    });
    var modal = document.getElementById("priceSimpleModal");
    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal || event.target.closest("[data-close-price-modal]")) {
          state.selectedKey = "";
          renderPriceWorkbench();
        }
      });
    }
  }

  function renderPriceWorkbench() {
    renderRoot();
  }

  window.renderPriceWorkbench = renderPriceWorkbench;
  window.__alteaRefreshPriceWorkbench = function refreshPriceWorkbench(forceRefresh) {
    return loadData(forceRefresh !== false);
  };

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.selectedKey) {
      state.selectedKey = "";
      renderPriceWorkbench();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      renderPriceWorkbench();
      loadData();
    }, { once: true });
  } else {
    renderPriceWorkbench();
    loadData();
  }

  document.getElementById("pullRemoteBtn")?.addEventListener("click", function () {
    window.setTimeout(function () {
      loadData(true);
    }, 180);
  });
})();
