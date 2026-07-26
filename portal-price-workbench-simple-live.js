(function () {
  if (window.__ALTEA_PRICE_SIMPLE_RENDERER_20260726_CABINETWAIT2__) return;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260726_CABINETWAIT2__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260623_CHARTS1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260621_PRICESV1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260607_PRICEBADGES2__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260607_PRICEBADGES1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260607_PRICEIMPACT1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260528_MINMAXIMPORT1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260518_MINMAXQUEUE1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260518_STATUS_EDIT1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260518_ZEROFIX1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260518_PRICEFIELDS1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260516_PLATFORMCOLORS2__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260516_PLATFORMCOLORS2__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260514_MARKETPLACES1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260508_PRICECACHE1__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260505A__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260503C__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260503B__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260503A__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260502A__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260429A__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260428C__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260428B__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260428A__ = true;
  window.__ALTEA_PRICES_DESIGN_V1__ = true;

  var DATA_URL = "data/smart_price_workbench.json";
  var OVERLAY_URL = "data/smart_price_overlay.json";
  var PRICES_URL = "data/prices.json";
  var CABINET_LIVE_DATA_URL = "data/repricer_live_prices.json";
  var LIVE_DATA_URL = "tmp-smart_price_workbench-live.json";
  var REPRICER_URL = "data/repricer.json";
  var REPRICER_LIVE_URL = "tmp-live-repricer.json";
  var ORDER_PROCUREMENT_URL = "data/order_procurement.json";
  var ORDER_PROCUREMENT_WB_URL = "data/order_procurement_wb.json";
  var ORDER_PROCUREMENT_OZON_URL = "data/order_procurement_ozon.json";
  var VIEW_ID = "view-prices";
  var STYLE_ID = "altea-price-simple-style";
  var STYLE_VERSION = "20260725-cabinet-live-v1";
  var SNAPSHOT_WAIT_MS = 1800;
  var SNAPSHOT_HARD_WAIT_MS = 4500;
  var CABINET_SNAPSHOT_WAIT_MS = 15000;
  var LOCAL_FETCH_TIMEOUT_MS = 3200;
  var LOAD_GUARD_MS = 45000;
  var STORAGE_KEYS = [
    "brand-portal-price-workbench-v20260419-entries",
    "portal_price_workbench_entries"
  ];
  var PRICE_MARKETS = ["all", "wb", "ozon", "ym", "goldapple", "letu", "megamarket", "samokat", "magnit"];
  var PRICE_MARKET_LABELS = {
    all: "Все",
    wb: "WB",
    ozon: "Ozon",
    ym: "Я.Маркет",
    ya: "Я.Маркет",
    goldapple: "Золотое яблоко",
    letu: "Л'Этуаль",
    megamarket: "Мегамаркет",
    samokat: "Самокат",
    magnit: "Магнит Маркет"
  };

  var state = {
    loading: false,
    loaded: false,
    error: "",
    rows: [],
    overlayGeneratedAt: "",
    orderProcurementGeneratedAt: "",
    orderProcurementFallbackCount: 0,
    sourceNote: "",
    liveGeneratedAt: "",
    repricer: { generatedAt: "", rows: [] },
    repricerLive: { generatedAt: "", rows: [] },
    market: "wb",
    search: "",
    ownerFilter: "all",
    statusFilter: "all",
    sortBy: "orders",
    sortDir: "desc",
    selectedKey: "",
    dateFrom: "",
    dateTo: "",
    chartUi: {
      selectedDate: "",
      marginMetric: "pct",
      skuChartFocus: "fact",
      hiddenSeries: {}
    },
    latestFactDate: "",
    latestTimelineDate: "",
    earliestTimelineDate: "",
    dataLagDays: 0,
    loadNonce: 0,
    availableMarkets: PRICE_MARKETS.slice()
  };
  window.__alteaPriceWorkbenchState = state;
  var derived = {
    portalStorageRaw: null,
    portalStorageParsed: null,
    explicitRepricerMapRaw: null,
    explicitRepricerMap: null,
    repricerModelKey: "",
    repricerModelSmartRef: null,
    repricerModelSupportRef: null,
    repricerModelPricesRef: null,
    repricerModelLiveRef: null,
    repricerModelSkusRef: null,
    repricerModelRows: null,
    repricerRowsRef: null,
    repricerRowLookup: null,
    visibleRows: { rowsRef: null, market: "", search: "", ownerFilter: "", statusFilter: "", dateFrom: "", dateTo: "", portalStorageRaw: "", leaderboardRef: null, value: null },
    stats: { rowsRef: null, value: null },
    table: { rowsRef: null, value: null },
    productLeaderboardRef: null,
    productLeaderboardLookup: null
  };
  var modalScrollState = {
    savedY: 0,
    savedOverflow: "",
    savedHtmlOverflow: "",
    pendingOpenY: null
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

  function positiveNum(value) {
    var parsed = num(value);
    return parsed != null && parsed > 0 ? parsed : null;
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
    if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) <= 0) return "\u2014";
    return Number(value).toFixed(1) + " \u0434\u043d.";
  }

  function intf(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function sanitizeDiscountPct(value) {
    if (value === null || value === undefined || value === "") return null;
    if (!Number.isFinite(Number(value))) return null;
    return Math.min(1, Math.max(0, Number(value)));
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z\u0430-\u044f0-9_-]+/gi, "");
  }

  function stableHash(value) {
    var text = String(value || "");
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return String(hash >>> 0);
  }

  function priceRowsSignature(rows) {
    var parts = [];
    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index] || {};
      parts.push([row.articleKey, row.status, row.turnoverDays, row.currentFillPrice, row.owner].join(":"));
    }
    return parts.join("~");
  }

  function canonicalPriceMarket(value) {
    var raw = String(value || "").trim().toLowerCase();
    var normalized = norm(raw);
    if (!normalized) return "";
    if (normalized === "all" || normalized === "wb" || normalized === "ozon") return normalized;
    if (normalized === "ym" || normalized === "ya" || normalized.indexOf("yandex") >= 0 || normalized.indexOf("яндекс") >= 0) return "ym";
    if (normalized === "goldapple" || normalized === "goldenapple" || normalized === "ga" || normalized === "zya" || normalized.indexOf("золот") >= 0 || normalized.indexOf("яблок") >= 0) return "goldapple";
    if (normalized === "letu" || normalized === "letual" || normalized === "letoile" || normalized.indexOf("лету") >= 0 || normalized.indexOf("лэту") >= 0) return "letu";
    if (normalized === "megamarket" || normalized === "sbermegamarket" || normalized.indexOf("мегамаркет") >= 0) return "megamarket";
    if (normalized === "samokat" || normalized.indexOf("самокат") >= 0) return "samokat";
    if (normalized === "magnit" || normalized === "magnitmarket" || normalized === "mm" || normalized.indexOf("магнит") >= 0) return "magnit";
    return raw;
  }

  function priceMarketLabel(market) {
    var key = canonicalPriceMarket(market);
    return PRICE_MARKET_LABELS[key] || String(market || "").toUpperCase();
  }

  function ensureMarketBucket(maps, market) {
    var key = canonicalPriceMarket(market);
    if (!key) return null;
    if (!maps[key]) maps[key] = Object.create(null);
    return maps[key];
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

  var BUSINESS_TIMEZONE = "Europe/Moscow";

  function todayKey() {
    try {
      var parts = new Intl.DateTimeFormat("en", {
        timeZone: BUSINESS_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());
      var values = Object.create(null);
      parts.forEach(function (part) {
        if (part.type !== "literal") values[part.type] = part.value;
      });
      if (values.year && values.month && values.day) {
        return [values.year, values.month, values.day].join("-");
      }
    } catch {}
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
    var maps = { all: Object.create(null) };
    PRICE_MARKETS.forEach(function (market) {
      if (market !== "all") maps[market] = Object.create(null);
    });
    Object.keys((payload && payload.platforms) || {}).forEach(function (platform) {
      var target = canonicalPriceMarket(platform);
      var bucket = ensureMarketBucket(maps, target);
      if (!bucket) return;
      var rows = normalizeRows(((((payload || {}).platforms || {})[platform] || {}).rows));
      rows.forEach(function (row) {
        var key = norm(row && (row.articleKey || row.article || row.sku));
        if (!key || bucket[key]) return;
        bucket[key] = row;
      });
    });
    return maps;
  }

  function buildSourceRowsByMarket() {
    var maps = Object.create(null);
    function ingest(payload, shouldReplace) {
      Object.keys((payload && payload.platforms) || {}).forEach(function (platform) {
        var market = canonicalPriceMarket(platform);
        if (!market || market === "all") return;
        var bucket = ensureMarketBucket(maps, market);
        if (!bucket) return;
        normalizeRows(((((payload || {}).platforms || {})[platform] || {}).rows)).forEach(function (row) {
          var key = norm(row && (row.articleKey || row.article || row.sku));
          if (!key) return;
          if (shouldReplace || !bucket[key]) bucket[key] = row;
        });
      });
    }
    for (var index = 0; index < arguments.length; index += 1) {
      ingest(arguments[index], index === 0);
    }
    return maps;
  }

  function availableMarketsForRows(rows) {
    var seen = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var market = canonicalPriceMarket(row && row.market);
      if (market) seen[market] = true;
    });
    return PRICE_MARKETS.slice();
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
      if (window.__alteaAppState && window.__alteaAppState !== state) return window.__alteaAppState;
    } catch {}
    try {
      if (window.state && window.state !== state) return window.state;
    } catch {}
    return null;
  }

  function repricerRows(payload) {
    return Array.isArray(payload && payload.rows) ? payload.rows : [];
  }

  function freshestRepricerPayload(primary, secondary) {
    var primaryRows = repricerRows(primary);
    var secondaryRows = repricerRows(secondary);
    if (!primaryRows.length) return secondary || primary || null;
    if (!secondaryRows.length) return primary || secondary || null;
    return parseFreshStamp(secondary && secondary.generatedAt) > parseFreshStamp(primary && primary.generatedAt)
      ? secondary
      : primary;
  }

  function syncLocalRepricerPayloads(basePayload, livePayload) {
    state.repricer = basePayload && typeof basePayload === "object"
      ? basePayload
      : { generatedAt: "", rows: [] };
    state.repricerLive = livePayload && typeof livePayload === "object"
      ? livePayload
      : { generatedAt: "", rows: [] };

    var root = rootState();
    if (!root || root === state) return;
    var rootBase = freshestRepricerPayload(root.repricer, state.repricer);
    var rootLive = freshestRepricerPayload(root.repricerLive, state.repricerLive);
    if (rootBase) root.repricer = rootBase;
    if (rootLive) root.repricerLive = rootLive;
  }

  function readPortalStorageState() {
    var raw = "";
    try {
      raw = localStorage.getItem("brand-portal-local-v1") || "";
    } catch (error) {
      console.warn("[price-simple] local-json", "brand-portal-local-v1", error);
      return {};
    }
    if (derived.portalStorageRaw === raw && derived.portalStorageParsed) return derived.portalStorageParsed;
    derived.portalStorageRaw = raw;
    try {
      var parsed = raw ? JSON.parse(raw) : {};
      derived.portalStorageParsed = parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.warn("[price-simple] local-json", "brand-portal-local-v1", error);
      derived.portalStorageParsed = {};
    }
    derived.explicitRepricerMapRaw = null;
    derived.explicitRepricerMap = null;
    return derived.portalStorageParsed;
  }

  function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function writePortalStorageState(next) {
    var safeNext = next && typeof next === "object" ? next : {};
    var raw = JSON.stringify(safeNext);
    localStorage.setItem("brand-portal-local-v1", raw);
    derived.portalStorageRaw = raw;
    derived.portalStorageParsed = safeNext;
    derived.explicitRepricerMapRaw = null;
    derived.explicitRepricerMap = null;

    var root = rootState();
    if (root && root.storage) {
      root.storage.repricerOverrides = Array.isArray(safeNext.repricerOverrides) ? safeNext.repricerOverrides.slice() : [];
      root.storage.repricerSkuProfiles = Array.isArray(safeNext.repricerSkuProfiles)
        ? safeNext.repricerSkuProfiles.slice()
        : (Array.isArray(root.storage.repricerSkuProfiles) ? root.storage.repricerSkuProfiles : []);
      root.storage.repricerCorridors = Array.isArray(safeNext.repricerCorridors)
        ? safeNext.repricerCorridors.slice()
        : (Array.isArray(root.storage.repricerCorridors) ? root.storage.repricerCorridors : []);
      root.storage.repricerOverrideDeletes = Array.isArray(safeNext.repricerOverrideDeletes)
        ? safeNext.repricerOverrideDeletes.slice()
        : (Array.isArray(root.storage.repricerOverrideDeletes) ? root.storage.repricerOverrideDeletes : []);
      root.storage.repricerSkuProfileDeletes = Array.isArray(safeNext.repricerSkuProfileDeletes)
        ? safeNext.repricerSkuProfileDeletes.slice()
        : (Array.isArray(root.storage.repricerSkuProfileDeletes) ? root.storage.repricerSkuProfileDeletes : []);
      root.storage.repricerCorridorDeletes = Array.isArray(safeNext.repricerCorridorDeletes)
        ? safeNext.repricerCorridorDeletes.slice()
        : (Array.isArray(root.storage.repricerCorridorDeletes) ? root.storage.repricerCorridorDeletes : []);
      root.storage.repricerSettings = safeNext.repricerSettings && typeof safeNext.repricerSettings === "object"
        ? cloneValue(safeNext.repricerSettings)
        : (root.storage.repricerSettings || {});
      root.storage.repricerSettingsUpdatedAt = String(
        safeNext.repricerSettingsUpdatedAt
        || root.storage.repricerSettingsUpdatedAt
        || ""
      ).trim();
    }
    if (typeof window.persistRepricerControls === "function") {
      Promise.resolve(window.persistRepricerControls()).catch(function (error) {
        console.error("[price-simple] persist repricer controls", error);
      });
    }
    window.dispatchEvent(new CustomEvent("altea:portal-storage-updated", {
      detail: {
        key: "brand-portal-local-v1",
        source: "prices"
      }
    }));
  }

  function overrideHasMeaning(override) {
    if (!override) return false;
    return override.floorPrice != null
      || override.capPrice != null
      || (override.forcePrice != null && override.forcePrice > 0)
      || override.promoActive
      || (override.promoPrice != null && override.promoPrice > 0)
      || Boolean(override.note)
      || (override.mode && override.mode !== "auto")
      || override.disableAlignment;
  }

  function pickFreshestOverride(current, candidate) {
    if (!candidate) return current || null;
    if (!current) return candidate;
    return parseFreshStamp(candidate.updatedAt) >= parseFreshStamp(current.updatedAt) ? candidate : current;
  }

  function findRepricerOverride(targetMarket, articleKey) {
    var wanted = norm(articleKey);
    if (!wanted) return null;
    var portal = readPortalStorageState();
    var overrides = Array.isArray(portal && portal.repricerOverrides) ? portal.repricerOverrides : [];
    var fromAll = null;
    var fromMarket = null;
    overrides.forEach(function (entry) {
      var normalized = normalizeRepricerOverride(entry);
      if (norm(normalized.articleKey) !== wanted) return;
      if (normalized.platform === "all") fromAll = pickFreshestOverride(fromAll, normalized);
      if (normalized.platform === targetMarket) fromMarket = pickFreshestOverride(fromMarket, normalized);
    });
    return pickFreshestOverride(fromAll, fromMarket);
  }

  function normalizeRepricerCorridor(entry) {
    return {
      articleKey: String(entry && (entry.articleKey || entry.article) || "").trim(),
      platform: repricerMarket(entry && entry.platform),
      hardFloor: moneyRound(entry && entry.hardFloor),
      b2bFloor: moneyRound(entry && entry.b2bFloor),
      basePrice: moneyRound(entry && entry.basePrice),
      stretchCap: moneyRound(entry && entry.stretchCap),
      promoFloor: moneyRound(entry && entry.promoFloor),
      elasticity: num(entry && entry.elasticity),
      updatedAt: String(entry && entry.updatedAt || "")
    };
  }

  function pickFreshestCorridor(current, candidate) {
    if (!candidate) return current || null;
    if (!current) return candidate;
    return parseFreshStamp(candidate.updatedAt) >= parseFreshStamp(current.updatedAt) ? candidate : current;
  }

  function findRepricerCorridor(targetMarket, articleKey) {
    var wanted = norm(articleKey);
    if (!wanted) return null;
    var portal = readPortalStorageState();
    var corridors = Array.isArray(portal && portal.repricerCorridors) ? portal.repricerCorridors : [];
    var fromAll = null;
    var fromMarket = null;
    corridors.forEach(function (entry) {
      var normalized = normalizeRepricerCorridor(entry);
      if (norm(normalized.articleKey) !== wanted) return;
      if (normalized.platform === "all") fromAll = pickFreshestCorridor(fromAll, normalized);
      if (normalized.platform === targetMarket) fromMarket = pickFreshestCorridor(fromMarket, normalized);
    });
    return pickFreshestCorridor(fromAll, fromMarket);
  }

  function queueMinMaxApiTask(articleKey, platform, values) {
    var minPrice = moneyRound(values && values.floorPrice);
    var maxPrice = moneyRound(values && values.capPrice);
    if (!(minPrice > 0) && !(maxPrice > 0)) return null;
    var note = String(values && values.note || "MIN/MAX из вкладки Цены").trim();
    var queued = null;
    if (typeof window.repricerQueueMinMaxTask === "function") {
      queued = window.repricerQueueMinMaxTask({
        articleKey: articleKey,
        platform: platform,
        min: minPrice,
        max: maxPrice,
        note: note,
        requestedAt: new Date().toISOString()
      });
    } else if (typeof window.repricerQueueApiTask === "function") {
      queued = window.repricerQueueApiTask({
        type: "UPDATE_MIN_MAX",
        action: "UPDATE_MIN_MAX",
        articleKey: articleKey,
        platform: platform,
        field: "min_max",
        value: [minPrice > 0 ? "MIN " + minPrice : "", maxPrice > 0 ? "MAX " + maxPrice : ""].filter(Boolean).join(" "),
        note: note,
        requestedAt: new Date().toISOString()
      });
    }
    return queued;
  }

  function upsertMinMaxOverride(articleKey, platform, values) {
    var targetArticle = String(articleKey || "").trim();
    var targetPlatform = repricerMarket(platform);
    if (!targetArticle || (targetPlatform !== "wb" && targetPlatform !== "ozon")) return null;

    var portal = cloneValue(readPortalStorageState()) || {};
    var overrides = Array.isArray(portal.repricerOverrides) ? portal.repricerOverrides.slice() : [];
    var nextOverride = null;

    overrides = overrides.map(function (entry) {
      var normalized = normalizeRepricerOverride(entry);
      if (norm(normalized.articleKey) !== norm(targetArticle) || normalized.platform !== targetPlatform) return normalized;
      nextOverride = Object.assign({}, normalized, values, {
        articleKey: targetArticle,
        platform: targetPlatform,
        updatedAt: new Date().toISOString(),
        updatedBy: (rootState() && rootState().team && rootState().team.member && rootState().team.member.name) || "Команда"
      });
      return nextOverride;
    });

    if (!nextOverride) {
      nextOverride = Object.assign({}, normalizeRepricerOverride({
        articleKey: targetArticle,
        platform: targetPlatform
      }), values, {
        articleKey: targetArticle,
        platform: targetPlatform,
        updatedAt: new Date().toISOString(),
        updatedBy: (rootState() && rootState().team && rootState().team.member && rootState().team.member.name) || "Команда"
      });
      overrides.push(nextOverride);
    }

    overrides = overrides.filter(function (entry) {
      return overrideHasMeaning(normalizeRepricerOverride(entry));
    });

    var queuedTask = queueMinMaxApiTask(targetArticle, targetPlatform, values);
    var root = rootState();
    if (queuedTask && root && root.storage && Array.isArray(root.storage.repricerPendingApiTasks)) {
      portal.repricerPendingApiTasks = root.storage.repricerPendingApiTasks.slice();
    }
    portal.repricerOverrides = overrides;
    writePortalStorageState(portal);
    return queuedTask;
  }

  function pickFreshestDisplay(current, candidate) {
    if (!candidate) return current || null;
    if (!current) return candidate;
    return parseFreshStamp(candidate.updatedAt) >= parseFreshStamp(current.updatedAt) ? candidate : current;
  }

  function moneyRound(value) {
    var parsed = num(value);
    return parsed == null ? null : Math.round(parsed * 100) / 100;
  }

  function priceExportScope() {
    var market = state.market === "all" ? "all" : state.market;
    var from = state.dateFrom || state.latestTimelineDate || todayKey();
    var to = state.dateTo || from;
    return market + "-" + from + "-to-" + to;
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
      floorPrice: moneyRound(entry && (entry.floorPrice != null ? entry.floorPrice : (entry.minPrice != null ? entry.minPrice : entry.floorOverride))),
      capPrice: moneyRound(entry && (entry.capPrice != null ? entry.capPrice : (entry.maxPrice != null ? entry.maxPrice : entry.capOverride))),
      forcePrice: moneyRound(entry && entry.forcePrice),
      promoActive: entry ? (entry.promoActive === true || entry.promoActive === "true" || entry.promoActive === 1 || entry.promoActive === "1") : false,
      promoPrice: moneyRound(entry && entry.promoPrice),
      promoLabel: String(entry && entry.promoLabel || "").trim(),
      promoFrom: isoDate(entry && entry.promoFrom),
      promoTo: isoDate(entry && entry.promoTo),
      disableAlignment: entry ? (entry.disableAlignment === true || entry.disableAlignment === "true" || entry.disableAlignment === 1 || entry.disableAlignment === "1") : false,
      note: String(entry && entry.note || "").trim(),
      updatedAt: String(entry && entry.updatedAt || "").trim(),
      updatedBy: String(entry && entry.updatedBy || "").trim()
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

  function repricerModelCacheKey(root) {
    var storage = root && root.storage && typeof root.storage === "object" ? root.storage : {};
    var pricesPayload = root && root.prices && typeof root.prices === "object" ? root.prices : {};
    var pricesStamp = pricesPayload.generatedAt
      || pricesPayload.asOfDate
      || (pricesPayload.month && pricesPayload.month.key ? pricesPayload.month.key + "-01" : "");
    return [
      parseFreshStamp(root && root.smartPriceWorkbench && root.smartPriceWorkbench.generatedAt),
      parseFreshStamp(root && root.priceWorkbenchSupport && root.priceWorkbenchSupport.generatedAt),
      parseFreshStamp(pricesStamp),
      parseFreshStamp(root && root.repricerLive && root.repricerLive.generatedAt),
      Array.isArray(root && root.skus) ? root.skus.length : 0,
      Array.isArray(storage.repricerOverrides) ? storage.repricerOverrides.length : 0,
      Array.isArray(storage.repricerCorridors) ? storage.repricerCorridors.length : 0,
      Array.isArray(storage.repricerSkuProfiles) ? storage.repricerSkuProfiles.length : 0,
      String(storage.repricerSettingsUpdatedAt || "").trim(),
      derived.portalStorageRaw || ""
    ].join("|");
  }

  function chooseRepricerRows() {
    var root = rootState() || {};
    if (typeof window.buildRepricerRows === "function") {
      readPortalStorageState();
      var unifiedKey = repricerModelCacheKey(root);
      if (
        derived.repricerModelRows &&
        derived.repricerModelKey === unifiedKey &&
        derived.repricerModelSmartRef === root.smartPriceWorkbench &&
        derived.repricerModelSupportRef === root.priceWorkbenchSupport &&
        derived.repricerModelPricesRef === root.prices &&
        derived.repricerModelLiveRef === root.repricerLive &&
        derived.repricerModelSkusRef === root.skus
      ) {
        return derived.repricerModelRows;
      }
      try {
        var unifiedRows = window.buildRepricerRows();
        if (Array.isArray(unifiedRows) && unifiedRows.length) {
          derived.repricerModelKey = unifiedKey;
          derived.repricerModelSmartRef = root.smartPriceWorkbench;
          derived.repricerModelSupportRef = root.priceWorkbenchSupport;
          derived.repricerModelPricesRef = root.prices;
          derived.repricerModelLiveRef = root.repricerLive;
          derived.repricerModelSkusRef = root.skus;
          derived.repricerModelRows = unifiedRows;
          return unifiedRows;
        }
      } catch (error) {
        console.warn("[price-simple] repricer unified model", error);
      }
    }
    var basePayload = freshestRepricerPayload(root.repricer, state.repricer);
    var livePayload = freshestRepricerPayload(root.repricerLive, state.repricerLive);
    var baseRows = repricerRows(basePayload);
    var liveRows = repricerRows(livePayload);
    var baseStamp = parseFreshStamp(basePayload && basePayload.generatedAt);
    var liveStamp = parseFreshStamp(livePayload && livePayload.generatedAt);
    if (liveRows.length && liveStamp >= baseStamp) return liveRows;
    return baseRows.length ? baseRows : liveRows;
  }

  function findRepricerRow(articleKey) {
    var wanted = norm(articleKey);
    if (!wanted) return null;
    var rows = chooseRepricerRows();
    if (derived.repricerRowsRef !== rows || !derived.repricerRowLookup) {
      var lookup = Object.create(null);
      rows.forEach(function (row) {
        var key = norm(row && (row.articleKey || row.article || row.sku));
        if (!key || lookup[key]) return;
        lookup[key] = row;
      });
      derived.repricerRowsRef = rows;
      derived.repricerRowLookup = lookup;
    }
    return derived.repricerRowLookup[wanted] || null;
  }

  function firstPositive() {
    for (var index = 0; index < arguments.length; index += 1) {
      var parsed = Number(arguments[index]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  function firstRatio() {
    for (var index = 0; index < arguments.length; index += 1) {
      var parsed = num(arguments[index]);
      if (parsed == null) continue;
      return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
    }
    return null;
  }

  function resolvedRepricerSidePrice(side) {
    var price = moneyRound(side && (side.finalPrice != null ? side.finalPrice : (side.recommendedPrice != null ? side.recommendedPrice : side.recPrice)));
    if (price == null || price <= 0) return null;
    var floor = Math.max(
      firstPositive(side && side.effectiveFloor),
      firstPositive(side && side.hardFloor),
      firstPositive(side && side.economicFloor),
      firstPositive(side && side.minPrice),
      firstPositive(side && side.finalGuardFloor)
    );
    var cap = firstPositive(side && side.finalGuardCap, side && side.capPrice, side && side.upperCap, side && side.workingZoneTo);
    if (cap > 0 && !(floor > 0 && cap + 0.001 < floor) && price > cap + 0.001) price = moneyRound(cap);
    if (floor > 0 && price + 0.001 < floor) price = moneyRound(floor);
    return price > 0 ? price : null;
  }

  function explicitRepricerMaps() {
    readPortalStorageState();
    if (derived.explicitRepricerMapRaw === derived.portalStorageRaw && derived.explicitRepricerMap) {
      return derived.explicitRepricerMap;
    }
    var portal = derived.portalStorageParsed || {};
    var overrides = Array.isArray(portal && portal.repricerOverrides) ? portal.repricerOverrides : [];
    var maps = {
      all: Object.create(null),
      wb: Object.create(null),
      ozon: Object.create(null),
      ym: Object.create(null)
    };
    overrides.forEach(function (entry) {
      var normalized = normalizeRepricerOverride(entry);
      var key = norm(normalized.articleKey);
      if (!key) return;
      var display = repricerExplicitTarget(normalized);
      if (!display) return;
      var platform = normalized.platform || "all";
      if (!maps[platform]) maps[platform] = Object.create(null);
      maps[platform][key] = pickFreshestDisplay(maps[platform][key], display);
    });
    derived.explicitRepricerMapRaw = derived.portalStorageRaw;
    derived.explicitRepricerMap = maps;
    return maps;
  }

  function findExplicitRepricerDisplay(targetMarket, articleKey) {
    var wanted = norm(articleKey);
    if (!wanted) return null;
    var maps = explicitRepricerMaps();
    var fromAll = maps.all && maps.all[wanted] ? maps.all[wanted] : null;
    var fromMarket = maps[targetMarket] && maps[targetMarket][wanted] ? maps[targetMarket][wanted] : null;
    return pickFreshestDisplay(fromAll, fromMarket);
  }

  function buildRepricerDisplay(market, articleKey) {
    var targetMarket = repricerMarket(market);
    if (targetMarket !== "wb" && targetMarket !== "ozon") return null;
    var explicit = findExplicitRepricerDisplay(targetMarket, articleKey);
    if (explicit) return explicit;

    var row = findRepricerRow(articleKey);
    if (!row) return null;
    var side = targetMarket === "wb" ? row.wb : row.ozon;
    var recPrice = resolvedRepricerSidePrice(side);
    if (recPrice == null || recPrice <= 0) return null;
    return {
      price: recPrice,
      label: String(side && side.strategy || "Рекомендация").trim() || "Рекомендация",
      hint: String(side && side.reason || "").trim()
    };
  }

  function buildRepricerBounds(market, articleKey) {
    var targetMarket = repricerMarket(market);
    if (targetMarket !== "wb" && targetMarket !== "ozon") return null;
    var syncedOverride = findRepricerOverride(targetMarket, articleKey);
    var syncedCorridor = findRepricerCorridor(targetMarket, articleKey);
    var syncedRow = findRepricerRow(articleKey);
    var syncedSide = syncedRow ? (targetMarket === "wb" ? syncedRow.wb : syncedRow.ozon) : null;
    var syncedOverrideMin = moneyRound(syncedOverride && syncedOverride.floorPrice);
    var syncedOverrideMax = moneyRound(syncedOverride && syncedOverride.capPrice);
    var syncedImportedMin = moneyRound(syncedSide && syncedSide.manualMinPrice);
    var syncedImportedMax = moneyRound(syncedSide && syncedSide.manualMaxPrice);
    var syncedManualMin = syncedOverrideMin != null && syncedOverrideMin > 0 ? syncedOverrideMin : syncedImportedMin;
    var syncedManualMax = syncedOverrideMax != null && syncedOverrideMax > 0 ? syncedOverrideMax : syncedImportedMax;
    var syncedCorridorMin = Math.max(
      firstPositive(syncedCorridor && syncedCorridor.hardFloor),
      firstPositive(syncedCorridor && syncedCorridor.b2bFloor)
    );
    syncedCorridorMin = syncedCorridorMin > 0 ? moneyRound(syncedCorridorMin) : null;
    var syncedCorridorMax = firstPositive(syncedCorridor && syncedCorridor.stretchCap);
    syncedCorridorMax = syncedCorridorMax > 0 ? moneyRound(syncedCorridorMax) : null;
    var syncedComputedMin = Math.max(
      firstPositive(syncedSide && syncedSide.effectiveFloor),
      firstPositive(syncedSide && syncedSide.hardFloor),
      firstPositive(syncedSide && syncedSide.economicFloor),
      firstPositive(syncedSide && syncedSide.minPrice),
      firstPositive(syncedSide && syncedSide.finalGuardFloor)
    );
    var syncedComputedMax = firstPositive(syncedSide && syncedSide.finalGuardCap, syncedSide && syncedSide.capPrice, syncedSide && syncedSide.upperCap, syncedSide && syncedSide.workingZoneTo, syncedSide && syncedSide.stretchCap);
    var syncedEffectiveMin = syncedManualMin != null && syncedManualMin > 0
      ? syncedManualMin
      : (syncedCorridorMin != null ? syncedCorridorMin : (syncedComputedMin > 0 ? moneyRound(syncedComputedMin) : null));
    var syncedEffectiveMax = syncedManualMax != null && syncedManualMax > 0
      ? syncedManualMax
      : (syncedCorridorMax != null ? syncedCorridorMax : (syncedComputedMax > 0 ? moneyRound(syncedComputedMax) : null));
    if (syncedEffectiveMin == null && syncedEffectiveMax == null && !syncedOverride && !syncedCorridor) return null;
    return {
      override: syncedOverride,
      corridor: syncedCorridor,
      manualMin: syncedManualMin,
      manualMax: syncedManualMax,
      corridorMin: syncedCorridorMin,
      corridorMax: syncedCorridorMax,
      effectiveMin: syncedEffectiveMin,
      effectiveMax: syncedEffectiveMax,
      minSource: syncedOverrideMin != null && syncedOverrideMin > 0 ? "ручной" : (syncedImportedMin != null && syncedImportedMin > 0 ? "импорт" : (syncedCorridorMin != null ? "коридор" : "расчет")),
      maxSource: syncedOverrideMax != null && syncedOverrideMax > 0 ? "ручной" : (syncedImportedMax != null && syncedImportedMax > 0 ? "импорт" : (syncedCorridorMax != null ? "коридор" : "расчет"))
    };
    var override = findRepricerOverride(targetMarket, articleKey);
    var row = findRepricerRow(articleKey);
    var side = row ? (targetMarket === "wb" ? row.wb : row.ozon) : null;
    var manualMin = moneyRound(override && override.floorPrice);
    var manualMax = moneyRound(override && override.capPrice);
    var computedMin = Math.max(
      firstPositive(side && side.effectiveFloor),
      firstPositive(side && side.hardFloor),
      firstPositive(side && side.economicFloor),
      firstPositive(side && side.minPrice),
      firstPositive(side && side.finalGuardFloor)
    );
    var computedMax = firstPositive(side && side.finalGuardCap, side && side.capPrice, side && side.upperCap, side && side.workingZoneTo, side && side.stretchCap);
    var effectiveMin = manualMin != null && manualMin > 0 ? manualMin : (computedMin > 0 ? moneyRound(computedMin) : null);
    var effectiveMax = manualMax != null && manualMax > 0 ? manualMax : (computedMax > 0 ? moneyRound(computedMax) : null);
    if (effectiveMin == null && effectiveMax == null && !override) return null;
    return {
      override: override,
      manualMin: manualMin,
      manualMax: manualMax,
      effectiveMin: effectiveMin,
      effectiveMax: effectiveMax,
      minSource: manualMin != null && manualMin > 0 ? "portal" : "расчет",
      maxSource: manualMax != null && manualMax > 0 ? "portal" : "расчет"
    };
  }

  function mergeRowPriceBounds(bounds, row) {
    var fallbackManualMin = firstPositive(row && row.manualMinPrice);
    var fallbackManualMax = firstPositive(row && row.manualMaxPrice);
    var fallbackMin = Math.max(
      firstPositive(row && row.minPrice),
      firstPositive(row && row.workingZoneFrom),
      firstPositive(row && row.hardMinPrice)
    );
    var fallbackMax = firstPositive(row && row.maxPrice, row && row.workingZoneTo);
    if (!(fallbackManualMin > 0) && !(fallbackManualMax > 0) && !(fallbackMin > 0) && !(fallbackMax > 0)) return bounds;
    var next = bounds ? Object.assign({}, bounds) : {};
    if ((next.effectiveMin == null || !(Number(next.effectiveMin) > 0)) && fallbackManualMin > 0) {
      next.effectiveMin = moneyRound(fallbackManualMin);
      next.manualMin = moneyRound(fallbackManualMin);
      next.minSource = row && row.minMaxSource ? "импорт" : "ручной";
    }
    if ((next.effectiveMax == null || !(Number(next.effectiveMax) > 0)) && fallbackManualMax > 0) {
      next.effectiveMax = moneyRound(fallbackManualMax);
      next.manualMax = moneyRound(fallbackManualMax);
      next.maxSource = row && row.minMaxSource ? "импорт" : "ручной";
    }
    if ((next.effectiveMin == null || !(Number(next.effectiveMin) > 0)) && fallbackMin > 0) {
      next.effectiveMin = moneyRound(fallbackMin);
      next.minSource = row && row.marginSource === "prices.json" ? "prices" : "snapshot";
    }
    if ((next.effectiveMax == null || !(Number(next.effectiveMax) > 0)) && fallbackMax > 0) {
      next.effectiveMax = moneyRound(fallbackMax);
      next.maxSource = row && row.marginSource === "prices.json" ? "prices" : "snapshot";
    }
    return Object.keys(next).length ? next : bounds;
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
        var date = isoDate(item && item.date);
        if (date && priceTimelinePointHasFact(item)) dates.push(date);
      });
    });
    dates.sort();
    return dates[dates.length - 1] || "";
  }

  function priceFactDateForRow(row) {
    var dates = [];
    if (positiveNum(row && row.currentFillPrice) != null) {
      [
        isoDate(row && row.priceFactDate),
        isoDate(row && row.currentPriceDate),
        isoDate(row && row.valueDate)
      ].filter(Boolean).forEach(function (date) { dates.push(date); });
    }
    if (positiveNum(row && row.listPrice) != null) {
      [
        isoDate(row && row.listPriceFactDate),
        isoDate(row && row.listPriceDate),
        isoDate(row && row.valueDate)
      ].filter(Boolean).forEach(function (date) { dates.push(date); });
    }
    (row && row.timeline || []).forEach(function (item) {
      var date = isoDate(item && item.date);
      var price = positiveNum(item && (item.price != null ? item.price : item.currentPrice));
      if (date && price != null) dates.push(date);
    });
    dates.sort();
    return dates[dates.length - 1] || "";
  }

  function latestPriceFactDate(rows) {
    var dates = (rows || []).map(priceFactDateForRow).filter(Boolean).sort();
    return dates[dates.length - 1] || "";
  }

  function priceHasDailyFact(row) {
    return rangeSlice(row).some(priceTimelinePointHasFact);
  }

  function priceTimelinePointHasFact(item) {
    return positiveNum(item && item.price) != null
      || positiveNum(item && item.clientPrice) != null
      || num(item && item.ordersUnits) != null
      || num(item && item.deliveredUnits) != null
      || num(item && item.revenue) != null;
  }

  function earliestDate(rows) {
    var dates = [];
    rows.forEach(function (row) {
      (row.timeline || []).forEach(function (item) {
        var date = isoDate(item && item.date);
        if (date && priceTimelinePointHasFact(item)) dates.push(date);
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

  function dataFreshnessLabelForDate(dateValue) {
    var factDate = isoDate(dateValue);
    var lagDays = factDate ? Math.max(0, diffDays(factDate, todayKey())) : null;
    if (!factDate) return "\u0414\u0430\u0442\u0430 \u0441\u0440\u0435\u0437\u0430 \u043d\u0435 \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u0430.";
    if (lagDays <= 0) return "\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0441\u0440\u0435\u0437 \u043d\u0430 \u0441\u0435\u0433\u043e\u0434\u043d\u044f.";
    if (lagDays === 1) return "\u0421\u0440\u0435\u0437 \u043e\u0442\u0441\u0442\u0430\u0435\u0442 \u043e\u0442 \u0441\u0435\u0433\u043e\u0434\u043d\u044f \u043d\u0430 1 \u0434\u0435\u043d\u044c.";
    return "\u0421\u0440\u0435\u0437 \u043e\u0442\u0441\u0442\u0430\u0435\u0442 \u043e\u0442 \u0441\u0435\u0433\u043e\u0434\u043d\u044f \u043d\u0430 " + lagDays + " \u0434\u043d.";
  }

  function dataFreshnessLabel() {
    return dataFreshnessLabelForDate(state.latestFactDate);
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

  function overlayFreshnessLabel(factDateValue) {
    if (!state.overlayGeneratedAt) return "";
    var generated = stampLabel(state.overlayGeneratedAt);
    var generatedDate = isoDate(state.overlayGeneratedAt);
    var factDate = isoDate(arguments.length ? factDateValue : state.latestFactDate);
    if (!factDate) {
      return "\u0421\u043b\u043e\u0439 \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d " + generated + ", \u043d\u043e \u0444\u0430\u043a\u0442 \u0446\u0435\u043d\u044b \u0434\u043b\u044f \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.";
    }
    if (factDate && generatedDate && generatedDate !== factDate) {
      return "\u0421\u043b\u043e\u0439 \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d " + generated + ", \u043d\u043e \u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0441\u0440\u0435\u0437 \u0446\u0435\u043d \u0432\u043d\u0443\u0442\u0440\u0438 \u043d\u0435\u0433\u043e \u0434\u043e " + factDate + ".";
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

  function priceFactFreshnessOfPayload(payload) {
    if (!payload || typeof payload !== "object") return 0;
    var latest = "";
    Object.keys(payload.platforms || {}).forEach(function (platform) {
      normalizeRows((((payload.platforms || {})[platform] || {}).rows)).forEach(function (row) {
        var hasRowPrice = [
          row && row.currentFillPrice,
          row && row.currentPrice,
          row && row.currentClientPrice,
          row && row.listPrice,
          row && row.firstPrice
        ].some(function (value) { return positiveNum(value) != null; });
        if (hasRowPrice) {
          [
            row && row.currentPriceDate,
            row && row.currentFillPriceDate,
            row && row.valueDate,
            row && row.historyFreshnessDate
          ].map(isoDate).filter(Boolean).forEach(function (date) {
            if (date > latest) latest = date;
          });
        }
        ["daily", "timeline", "monthly"].forEach(function (field) {
          (Array.isArray(row && row[field]) ? row[field] : []).forEach(function (point) {
            var hasPointPrice = positiveNum(point && (
              point.price != null ? point.price
                : (point.currentPrice != null ? point.currentPrice : point.clientPrice)
            )) != null || positiveNum(point && point.clientPrice) != null;
            var date = hasPointPrice ? isoDate(point && point.date) : "";
            if (date && date > latest) latest = date;
          });
        });
      });
    });
    return parseFreshStamp(latest);
  }

  function chooseFreshestPayload(snapshotPayload, localPayload) {
    if (snapshotPayload && localPayload) {
      var snapshotFactFreshness = priceFactFreshnessOfPayload(snapshotPayload);
      var localFactFreshness = priceFactFreshnessOfPayload(localPayload);
      if (snapshotFactFreshness !== localFactFreshness) {
        return snapshotFactFreshness > localFactFreshness
          ? { payload: snapshotPayload, source: "snapshot" }
          : { payload: localPayload, source: "local" };
      }
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

  async function fetchJsonNoStore(url, timeoutMs) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timerId = null;
    try {
      if (controller && Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timerId = window.setTimeout(function () {
          try {
            controller.abort(new Error("Timeout"));
          } catch {
            controller.abort();
          }
        }, timeoutMs);
      }
      var activeFetch = typeof window.__ALTEA_BASE_FETCH__ === "function"
        ? window.__ALTEA_BASE_FETCH__
        : fetch;
      var response = await activeFetch(url, {
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error("Failed to load " + url);
      var payload = await response.json();
      var source = "local";
      try {
        source = String(response.headers.get("X-Altea-Source") || response.headers.get("x-altea-source") || "local").trim() || "local";
      } catch {}
      return { payload: payload, source: source };
    } catch (error) {
      var isAbort = controller && controller.signal && controller.signal.aborted;
      if (isAbort) {
        throw new Error("Timeout while loading " + url);
      }
      throw error;
    } finally {
      if (timerId) window.clearTimeout(timerId);
    }
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
      var localResult = await fetchJsonNoStore(url, LOCAL_FETCH_TIMEOUT_MS);
      localPayload = localResult && localResult.payload;
      localSource = localResult && localResult.source || "local";
    } catch (error) {
      localError = error;
    }

    var snapshotPayload = null;
    if (snapshotTask) {
      var snapshotWaitMs = url === CABINET_LIVE_DATA_URL
        ? CABINET_SNAPSHOT_WAIT_MS
        : (localPayload != null ? SNAPSHOT_WAIT_MS : SNAPSHOT_HARD_WAIT_MS);
      snapshotPayload = await Promise.race([
        snapshotTask,
        waitResult(snapshotWaitMs, null)
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
    var existing = document.getElementById(STYLE_ID);
    if (existing && existing.dataset.priceStyleVersion === STYLE_VERSION) return;
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.dataset.priceStyleVersion = STYLE_VERSION;
    style.textContent = [
      "#view-prices{padding:24px 28px 36px;min-height:520px;}",
      ".pw-shell{display:grid;gap:16px;}",
      ".pw-card,.pw-modal-box{background:rgba(21,17,12,.80);border:1px solid rgba(214,175,85,.16);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.18);}",
      ".pw-card{padding:18px 20px;}",
      ".pw-title{font-size:32px;line-height:1.05;font-weight:800;color:#f4ead6;}",
      ".pw-sub{font-size:14px;line-height:1.55;color:#d8c6a3;max-width:980px;margin-top:8px;}",
      ".pw-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:14px;}",
      ".pw-label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#bda57a;}",
      ".pw-chip-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}",
      ".pw-chip{border:1px solid rgba(214,175,85,.24);background:rgba(214,175,85,.06);color:#f3e3bf;border-radius:999px;padding:8px 12px;font-size:13px;cursor:pointer;}",
      ".pw-chip.active{background:rgba(214,175,85,.20);color:#fff2d1;border-color:rgba(242,212,141,.46);}",
      ".pw-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px;}",
      ".pw-grid2 input,.pw-grid2 select,.pw-search{width:100%;box-sizing:border-box;border-radius:14px;border:1px solid rgba(214,175,85,.18);background:rgba(9,7,5,.78);color:#f7ead1;padding:12px 14px;}",
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
      ".pw-ledger-summary{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;}",
      ".pw-ledger-summary span{display:grid;gap:2px;min-width:118px;padding:10px 12px;border:1px solid rgba(214,175,85,.12);border-radius:8px;background:rgba(9,7,5,.42);}",
      ".pw-ledger-summary b{font-size:18px;line-height:1.15;color:#fff0cf;}",
      ".pw-ledger-summary small{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#bda57a;}",
      ".pw-game-panel{display:grid;gap:10px;margin-top:12px;}",
      ".pw-game-strip{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:12px;}",
      ".pw-game-card{position:relative;min-height:126px;border:1px solid hsl(var(--pw-hue,42) 78% 58% / .28);border-radius:8px;background:linear-gradient(180deg,hsl(var(--pw-hue,42) 72% 42% / .16),rgba(9,7,5,.72));box-shadow:0 16px 42px hsl(var(--pw-hue,42) 80% 42% / .10);padding:13px;display:grid;grid-template-rows:auto auto auto 1fr;gap:8px;overflow:hidden;}",
      ".pw-game-card:before{content:\"\";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.08),transparent 46%);pointer-events:none;}",
      ".pw-game-card>*{position:relative;}",
      ".pw-game-card.ok{--pw-hue:142;}.pw-game-card.info{--pw-hue:202;}.pw-game-card.warn{--pw-hue:42;}.pw-game-card.danger{--pw-hue:3;}.pw-game-card.violet{--pw-hue:268;}",
      ".pw-game-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;color:#d8c6a3;font-size:11px;text-transform:uppercase;letter-spacing:.06em;line-height:1.25;}",
      ".pw-game-top em{font-style:normal;color:#fff0cf;white-space:nowrap;}",
      "#view-prices .prices-v1-filter-dock{position:relative!important;top:auto!important;z-index:4!important;margin-top:0!important;background:linear-gradient(180deg,rgba(13,10,7,.97),rgba(13,10,7,.90))!important;backdrop-filter:blur(18px);box-shadow:0 18px 34px rgba(0,0,0,.24),0 1px 0 rgba(222,190,128,.16);}",
      ".pw-game-card strong{font-size:28px;line-height:1;color:#fff4d6;font-weight:900;overflow-wrap:anywhere;}",
      ".pw-game-card small{color:#d2bd98;line-height:1.35;font-size:12px;}",
      ".pw-game-foot{align-self:end;display:flex;justify-content:space-between;gap:8px;align-items:center;color:#f3dfb6;font-size:12px;line-height:1.25;}",
      ".pw-game-meter{display:block;height:8px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;}",
      ".pw-game-meter i{display:block;width:var(--pw-progress,0%);height:100%;border-radius:999px;background:hsl(var(--pw-hue,42) 90% 66% / .96);}",
      ".pw-game-missions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}",
      ".pw-game-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid hsl(var(--pw-hue,42) 78% 58% / .28);background:hsl(var(--pw-hue,42) 72% 42% / .12);color:#f5e4bf;padding:7px 10px;font-size:12px;line-height:1.2;}",
      ".pw-game-pill.ok{--pw-hue:142;}.pw-game-pill.info{--pw-hue:202;}.pw-game-pill.warn{--pw-hue:42;}.pw-game-pill.danger{--pw-hue:3;}.pw-game-pill.violet{--pw-hue:268;}",
      ".pw-stat strong{display:block;margin-top:8px;font-size:28px;color:#fff0cf;}",
      ".pw-stat small{display:block;margin-top:6px;color:#cdb892;line-height:1.45;}",
      ".pw-table-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;}",
      ".pw-table-wrap{overflow:auto;max-height:72vh;border-radius:14px;}",
      ".pw-table{width:100%;border-collapse:collapse;min-width:1360px;}",
      ".pw-table th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#bda57a;text-align:left;padding:0 14px 10px;position:sticky;top:0;z-index:2;background:rgba(10,8,6,.96);backdrop-filter:blur(4px);}",
      ".pw-th-btn{border:0;background:transparent;color:inherit;text-transform:inherit;letter-spacing:inherit;font:inherit;cursor:pointer;padding:0;line-height:1.2;}",
      ".pw-th-btn:hover{color:#f4e6c6;}",
      ".pw-table td{padding:14px;border-top:1px solid rgba(214,175,85,.1);vertical-align:top;color:#f4ead6;}",
      ".pw-row{cursor:pointer;transition:background .18s ease;}",
      ".pw-row:hover{background:rgba(214,175,85,.05);}",
      ".pw-sku{font-weight:700;color:#fff0cf;}",
      ".pw-note{margin-top:4px;color:#bda57a;font-size:12px;line-height:1.35;max-width:460px;}",
      ".pw-badge{display:inline-flex;padding:4px 8px;border-radius:999px;border:1px solid rgba(214,175,85,.26);background:rgba(214,175,85,.08);color:#f3dfb6;font-size:12px;line-height:1.2;}",
      ".pw-status-editor{display:grid;gap:7px;min-width:168px;max-width:260px;}",
      ".pw-status-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}",
      ".pw-status-row select{width:auto;min-width:140px;max-width:100%;border-radius:12px;border:1px solid rgba(214,175,85,.22);background:rgba(9,7,5,.78);color:#f7ead1;padding:7px 9px;font-size:12px;}",
      ".pw-status-row button{border:1px solid rgba(214,175,85,.24);background:rgba(214,175,85,.07);color:#f3e3bf;border-radius:999px;padding:7px 9px;font-size:12px;cursor:pointer;}",
      ".pw-status-row button:hover{background:rgba(214,175,85,.13);}",
      ".pw-status-editor textarea{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(214,175,85,.18);background:rgba(9,7,5,.78);color:#f7ead1;padding:9px 10px;resize:vertical;}",
      ".pw-repricer-cell{display:grid;gap:4px;min-width:110px;}",
      ".pw-repricer-cell strong{color:#fff0cf;font-weight:700;}",
      ".pw-repricer-cell small{color:#cdb892;line-height:1.3;}",
      ".pw-impact-cell,.pw-price-impact,.pw-range-cell{display:grid;gap:5px;min-width:120px;}",
      ".pw-impact-cell strong,.pw-price-impact strong,.pw-range-cell strong{color:#fff0cf;font-weight:700;}",
      ".pw-impact-cell small,.pw-price-impact small,.pw-range-cell small{color:#cdb892;line-height:1.3;}",
      ".pw-delta{display:inline-flex;width:max-content;align-items:center;border-radius:8px;border:1px solid rgba(214,175,85,.16);padding:3px 7px;font-size:12px;line-height:1.2;color:#f3dfb6;background:rgba(214,175,85,.06);}",
      ".pw-delta.up{border-color:rgba(115,205,144,.28);background:rgba(52,120,76,.18);color:#dff6dd;}",
      ".pw-delta.down{border-color:rgba(255,136,136,.28);background:rgba(132,43,43,.24);color:#ffd5d5;}",
      ".pw-delta.flat{border-color:rgba(114,176,231,.28);background:rgba(56,99,135,.18);color:#d7eaff;}",
      ".pw-mini-note{margin-top:6px;color:#cdb892;font-size:12px;line-height:1.35;}",
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
      ".pw-kz-stack{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center;}",
      ".pw-kz-summary{max-width:none;}",
      ".pw-kz-badge{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(214,175,85,.26);background:rgba(214,175,85,.08);color:#f3dfb6;border-radius:999px;padding:6px 10px;font-size:12px;line-height:1.2;cursor:pointer;}",
      ".pw-kz-badge.ok{background:rgba(52,120,76,.18);border-color:rgba(115,205,144,.28);color:#dff6dd;}",
      ".pw-kz-badge.info{background:rgba(56,99,135,.18);border-color:rgba(114,176,231,.28);color:#d7eaff;}",
      ".pw-kz-badge.warn{background:rgba(138,98,29,.22);border-color:rgba(240,188,82,.32);color:#ffe7b1;}",
      ".pw-kz-badge.danger{background:rgba(132,43,43,.24);border-color:rgba(255,136,136,.28);color:#ffd5d5;}",
      ".pw-badge.pw-badge-ok{background:rgba(52,120,76,.18);border-color:rgba(115,205,144,.28);color:#dff6dd;}",
      ".pw-badge.pw-badge-info{background:rgba(56,99,135,.18);border-color:rgba(114,176,231,.28);color:#d7eaff;}",
      ".pw-badge.pw-badge-warn{background:rgba(138,98,29,.22);border-color:rgba(240,188,82,.32);color:#ffe7b1;}",
      ".pw-badge.pw-badge-danger{background:rgba(132,43,43,.24);border-color:rgba(255,136,136,.28);color:#ffd5d5;}",
      ".pw-row-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;max-width:360px;}",
      ".pw-history-wrap{overflow:auto;}",
      ".pw-history{width:100%;border-collapse:collapse;min-width:980px;}",
      ".pw-history th,.pw-history td{padding:10px 12px;border-top:1px solid rgba(214,175,85,.1);text-align:left;}",
      ".pw-history th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#bda57a;}",
      ".pw-history-change td{background:rgba(214,175,85,.055);}",
      "#view-prices .prices-v1-kpis{grid-template-columns:repeat(5,minmax(0,1fr));}",
      "#view-prices .prices-v1-kpi-button{position:relative;min-height:110px;display:grid;align-content:space-between;gap:9px;text-align:left;border:1px solid rgba(222,190,128,.18);border-radius:8px;background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.014));color:#f8f1de;padding:15px;cursor:pointer;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}",
      "#view-prices .prices-v1-kpi-button:hover,#view-prices .prices-v1-kpi-button:focus-visible{border-color:rgba(222,190,128,.42);background:linear-gradient(145deg,rgba(222,190,128,.12),rgba(255,255,255,.018));outline:0;}",
      "#view-prices .prices-v1-kpi-button span{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:rgba(235,216,174,.62);font-weight:900;}",
      "#view-prices .prices-v1-kpi-button strong{font-size:clamp(20px,1.55vw,30px);line-height:1;font-weight:950;font-variant-numeric:tabular-nums;}",
      "#view-prices .prices-v1-kpi-button em{font-style:normal;color:rgba(248,241,222,.64);font-size:12px;padding-bottom:9px;}",
      "#view-prices .prices-v1-kpi-button em.up{color:#91e3aa;}#view-prices .prices-v1-kpi-button em.down{color:#ff9b8e;}",
      "#view-prices .prices-v1-kpi-button i{position:absolute;left:14px;right:14px;bottom:12px;height:4px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;}#view-prices .prices-v1-kpi-button i:after{content:\"\";display:block;width:var(--kpi-progress,0%);height:100%;border-radius:999px;background:linear-gradient(90deg,#d8b36c,#74d997);}",
      "#view-prices .prices-v1-overview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}",
      "#view-prices .prices-v1-chart-panel{min-width:0;border:1px solid rgba(222,190,128,.18);border-radius:8px;background:linear-gradient(150deg,rgba(255,255,255,.045),rgba(255,255,255,.014));padding:16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.045);}",
      "#view-prices .prices-v1-overview .prices-v1-section-head{align-items:flex-start;}#view-prices .prices-v1-overview .prices-v1-section-head button,#view-prices .prices-v1-mini-tabs button{border:1px solid rgba(222,190,128,.24);border-radius:999px;background:rgba(222,190,128,.08);color:#f8f1de;padding:8px 11px;cursor:pointer;}",
      "#view-prices .prices-v1-mini-tabs{display:flex;gap:6px;}#view-prices .prices-v1-mini-tabs button[aria-pressed='true']{background:linear-gradient(180deg,#f1d793,#b78332);color:#100d09;}",
      "#view-prices .prices-v1-chart-legend{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0 10px;color:rgba(248,241,222,.62);font-size:12px;}#view-prices .prices-v1-chart-legend span{display:inline-flex;align-items:center;gap:6px;}#view-prices .prices-v1-chart-legend span:before{content:\"\";width:10px;height:10px;border-radius:999px;background:#74d997;}#view-prices .prices-v1-chart-legend .previous:before{background:#77736b;}#view-prices .prices-v1-chart-legend .margin:before{background:#75d99a;}#view-prices .prices-v1-chart-legend em{margin-left:auto;font-style:normal;color:#dbc7a3;}",
      "#view-prices .prices-overview-svg,#view-prices .prices-v1-chart{display:block;width:100%;height:auto;min-height:240px;overflow:visible;}#view-prices .prices-v1-chart{min-height:320px;}",
      "#view-prices .prices-chart-grid line,#view-prices .prices-v1-grid line{stroke:rgba(245,235,214,.16);stroke-width:1;}#view-prices .prices-chart-y,#view-prices .prices-chart-x{fill:rgba(245,235,214,.58);font-size:11px;font-weight:700;}",
      "#view-prices .prices-chart-bar{rx:5;transition:opacity .18s ease,filter .18s ease;}#view-prices .prices-chart-bar.current{fill:#74d997;}#view-prices .prices-chart-bar.prev{fill:rgba(160,153,138,.52);}#view-prices .prices-chart-bar:hover,#view-prices .prices-v1-bar:hover{filter:drop-shadow(0 0 8px rgba(219,199,163,.36));}",
      "#view-prices .prices-margin-area{fill:rgba(116,217,151,.16);}#view-prices .prices-margin-line{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;}#view-prices .prices-margin-line.current{stroke:#74d997;}#view-prices .prices-margin-line.prev{stroke:rgba(180,174,162,.7);stroke-width:2;stroke-dasharray:6 7;}#view-prices .prices-margin-dot{fill:#74d997;stroke:#0a0806;stroke-width:2;}",
      "#view-prices .prices-v1-insights{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}#view-prices .prices-v1-insights button{min-height:108px;text-align:left;display:grid;grid-template-columns:1fr auto;gap:7px;border:1px solid rgba(222,190,128,.16);border-radius:8px;background:rgba(10,8,6,.54);color:#f8f1de;padding:14px;cursor:pointer;}#view-prices .prices-v1-insights button:hover{border-color:rgba(222,190,128,.38);}#view-prices .prices-v1-insights span{grid-column:1/-1;font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:rgba(235,216,174,.6);font-weight:900;}#view-prices .prices-v1-insights strong{font-size:15px;line-height:1.25;}#view-prices .prices-v1-insights em{font-style:normal;color:rgba(248,241,222,.6);}#view-prices .prices-v1-insights b{align-self:end;color:#dbc7a3;}",
      "#view-prices .prices-v1-legend{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end;}#view-prices .prices-v1-legend button{border:1px solid rgba(222,190,128,.22);border-radius:999px;background:rgba(222,190,128,.06);color:#f8f1de;padding:7px 10px;font-size:12px;cursor:pointer;}#view-prices .prices-v1-legend button[aria-pressed='false']{opacity:.42;text-decoration:line-through;}#view-prices .prices-v1-legend button:hover{border-color:rgba(222,190,128,.44);}",
      "#view-prices .prices-v1-corridor-band{fill:rgba(219,199,163,.08);stroke:rgba(219,199,163,.16);stroke-width:1;}#view-prices .prices-v1-repricer-line{stroke:#f1d793;stroke-width:2;stroke-dasharray:7 7;}#view-prices .prices-v1-clip-label{fill:#dbc7a3;font-size:11px;font-weight:800;}#view-prices .prices-v1-before-after{fill:rgba(245,235,214,.62);font-size:11px;font-weight:800;}#view-prices .prices-v1-bar.orders{fill:#5aa7ff;}#view-prices .prices-v1-bar.buyouts{fill:#74d997;}#view-prices .prices-v1-line{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;}#view-prices .prices-v1-line.mp{stroke:#d8b36c;}#view-prices .prices-v1-line.client{stroke:#b868ff;}#view-prices .prices-v1-minmax{stroke:#dbc7a3;stroke-width:2;stroke-dasharray:5 6;}#view-prices .prices-v1-change{stroke:#ff7b6e;stroke-width:1.5;stroke-dasharray:4 5;opacity:.72;}",
      "#view-prices .prices-v1-quick{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;padding:10px;border:1px solid rgba(222,190,128,.14);border-radius:8px;background:rgba(10,8,6,.46);}#view-prices .prices-v1-quick span{font-size:10px;text-transform:uppercase;letter-spacing:.13em;color:rgba(235,216,174,.62);font-weight:900;margin-right:2px;}#view-prices .prices-v1-quick button{border:1px solid rgba(222,190,128,.2);border-radius:999px;background:rgba(222,190,128,.055);color:#f8f1de;padding:8px 11px;font-size:12px;cursor:pointer;}#view-prices .prices-v1-quick button:hover,#view-prices .prices-v1-quick button.is-active{border-color:rgba(222,190,128,.48);background:linear-gradient(180deg,rgba(241,215,147,.24),rgba(183,131,50,.14));}#view-prices .prices-v1-quick button.is-reset{margin-left:auto;}",
      "#view-prices .prices-v1-top{border:1px solid rgba(222,190,128,.16);border-radius:8px;background:linear-gradient(150deg,rgba(255,255,255,.04),rgba(255,255,255,.012));padding:16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}#view-prices .prices-v1-top-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px;}#view-prices .prices-v1-top-card{min-height:112px;text-align:left;display:grid;gap:7px;border:1px solid rgba(222,190,128,.14);border-radius:8px;background:rgba(10,8,6,.56);color:#f8f1de;padding:13px;cursor:pointer;}#view-prices .prices-v1-top-card:hover,#view-prices .prices-v1-top-card:focus-visible{border-color:rgba(222,190,128,.42);background:rgba(222,190,128,.08);outline:0;}#view-prices .prices-v1-top-card span{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:rgba(235,216,174,.62);font-weight:900;}#view-prices .prices-v1-top-card strong{font-size:15px;line-height:1.25;color:#fff6de;overflow-wrap:anywhere;}#view-prices .prices-v1-top-card em{font-style:normal;color:#d8c6a3;font-size:12px;}#view-prices .prices-v1-top-card b{justify-self:start;color:#9be8b4;font-size:13px;}",
      "#view-prices .prices-v1-table-card{scroll-margin-top:168px;}#view-prices .prices-v1-table-wrap{overflow:auto;max-height:72vh;border-radius:8px;position:relative;}#view-prices .prices-v1-table{min-width:1700px;table-layout:auto;}#view-prices .prices-v1-table th{position:sticky;top:0;z-index:5;background:rgba(10,8,6,.98);backdrop-filter:blur(12px);}#view-prices .prices-v1-table th,#view-prices .prices-v1-table td{overflow:hidden;text-overflow:ellipsis;}#view-prices .prices-v1-table th:nth-child(1),#view-prices .prices-v1-table td:nth-child(1){min-width:300px;width:300px;}#view-prices .prices-v1-table th:nth-child(2),#view-prices .prices-v1-table td:nth-child(2){min-width:190px;width:190px;}#view-prices .prices-v1-table th:nth-child(3),#view-prices .prices-v1-table td:nth-child(3){min-width:170px;width:170px;}#view-prices .prices-v1-table th:nth-child(4),#view-prices .prices-v1-table td:nth-child(4){min-width:190px;width:190px;}#view-prices .prices-v1-table th:nth-child(5),#view-prices .prices-v1-table td:nth-child(5){min-width:180px;width:180px;}#view-prices .prices-v1-table th:nth-child(6),#view-prices .prices-v1-table td:nth-child(6){min-width:170px;width:170px;}#view-prices .prices-v1-table th:nth-child(7),#view-prices .prices-v1-table td:nth-child(7){min-width:190px;width:190px;}#view-prices .prices-v1-table th:nth-child(8),#view-prices .prices-v1-table td:nth-child(8){min-width:190px;width:190px;}#view-prices .prices-v1-table th:nth-child(9),#view-prices .prices-v1-table td:nth-child(9){min-width:230px;width:230px;}#view-prices .prices-v1-row.is-selected{background:rgba(222,190,128,.075);}#view-prices .prices-v1-row{cursor:pointer;}#view-prices .prices-v1-row:hover{background:rgba(222,190,128,.055);}#view-prices .prices-v1-table td small{display:block;white-space:normal;line-height:1.3;max-height:3.8em;overflow:hidden;}#view-prices .prices-v1-answer-cell{display:grid;gap:5px;min-width:0;}#view-prices .prices-v1-answer-cell strong{color:#fff6de;font-size:14px;}#view-prices .prices-v1-answer-cell span{color:#f8f1de;font-size:12px;}#view-prices .prices-v1-answer-cell small{color:#cdb892;font-size:11px;}#view-prices .prices-v1-answer-cell .ok{color:#9be8b4;}#view-prices .prices-v1-answer-cell .bad{color:#ff9b8e;}#view-prices .prices-v1-sku-link{border:0;background:transparent;color:#fff6de;font:inherit;font-weight:900;padding:0;cursor:pointer;text-align:left;}#view-prices .prices-v1-sku-link:hover{text-decoration:underline;text-underline-offset:3px;}",
      "@media (max-width:1180px){.pw-game-strip{grid-template-columns:repeat(3,minmax(0,1fr));}}",
      "@media (max-width:1280px){#view-prices .prices-v1-kpis{grid-template-columns:repeat(3,minmax(0,1fr));}#view-prices .prices-v1-overview{grid-template-columns:1fr;}#view-prices .prices-v1-insights,#view-prices .prices-v1-top-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}",
      "@media (max-width:1080px){.pw-grid,.pw-stats,.pw-kpis{grid-template-columns:1fr 1fr;}}",
      "@media (max-width:720px){#view-prices{padding:18px 14px 28px;}.pw-grid,.pw-stats,.pw-kpis,.pw-grid2,.pw-game-strip,#view-prices .prices-v1-kpis,#view-prices .prices-v1-insights,#view-prices .prices-v1-top-grid{grid-template-columns:1fr;}.pw-title{font-size:28px;}}",
      "@media (prefers-reduced-motion:reduce){#view-prices .prices-chart-bar,#view-prices .prices-v1-bar{transition:none;}}"
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

  function priceSkuMatrixEntry(articleKey) {
    if (typeof window.getSkuMatrixEntry === "function") {
      return window.getSkuMatrixEntry(articleKey) || null;
    }
    var root = rootState() || {};
    var matrix = root.skuMatrix || {};
    var items = Array.isArray(matrix.items) ? matrix.items : [];
    var rawKey = String(articleKey || "").trim();
    var directIndex = matrix.indexes && matrix.indexes.byArticleKey && matrix.indexes.byArticleKey[rawKey];
    if (Number.isInteger(directIndex) && items[directIndex]) return items[directIndex];
    var token = norm(rawKey);
    if (!token) return null;
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index] || {};
      if (norm(item.articleKey || item.article) === token) return item;
    }
    return null;
  }

  function priceSkuMatrixProblemMeta(entry) {
    var problemState = entry && (entry.problemState || (Array.isArray(entry.problemStates) ? entry.problemStates[0] : ""));
    if (!problemState || problemState === "ok") return null;
    if (typeof window.skuMatrixProblemMeta === "function") return window.skuMatrixProblemMeta(problemState);
    return {
      label: (entry && entry.problemLabel) || problemState,
      tone: (entry && entry.problemTone) || "warn"
    };
  }

  function priceProductLifecycleOverride(articleKey) {
    if (typeof window.productLifecycleOverrideForArticle === "function") {
      return window.productLifecycleOverrideForArticle(articleKey) || null;
    }
    var portal = readPortalStorageState();
    var wanted = String(articleKey || "").trim();
    if (!wanted) return null;
    var overrides = Array.isArray(portal && portal.productLifecycleOverrides)
      ? portal.productLifecycleOverrides
      : [];
    return overrides.find(function (item) {
      return String(item && item.articleKey || "").trim() === wanted;
    }) || null;
  }

  function priceSkuForLifecycle(row) {
    var root = rootState() || {};
    var wanted = norm(row && row.articleKey);
    var sku = null;
    if (wanted && Array.isArray(root.skus)) {
      sku = root.skus.find(function (item) {
        return norm(item && (item.articleKey || item.article || item.sku)) === wanted;
      }) || null;
    }
    var matrixEntry = priceSkuMatrixEntry(row && row.articleKey);
    return Object.assign({}, matrixEntry || {}, sku || {}, row || {}, {
      articleKey: row && row.articleKey || sku && (sku.articleKey || sku.article || sku.sku) || "",
      article: row && row.articleKey || sku && (sku.article || sku.articleKey || sku.sku) || "",
      productStatus: row && row.status || sku && (sku.productStatus || sku.status) || "",
      status: row && row.status || sku && sku.status || ""
    });
  }

  function priceProductLifecycleForRow(row) {
    var articleKey = String(row && row.articleKey || "").trim();
    if (!articleKey) return null;
    if (typeof window.productLifecycleForSku === "function") {
      try {
        return window.productLifecycleForSku(priceSkuForLifecycle(row), articleKey);
      } catch (error) {
        console.warn("[price-simple] product lifecycle", error);
      }
    }
    var override = priceProductLifecycleOverride(articleKey);
    if (override) {
      var normalizedKey = typeof window.normalizeProductLifecycleKey === "function"
        ? window.normalizeProductLifecycleKey(override.key || override.status)
        : String(override.key || override.status || "").trim();
      var meta = window.PRODUCT_LIFECYCLE_STATUS_META && window.PRODUCT_LIFECYCLE_STATUS_META[normalizedKey];
      return Object.assign({
        key: normalizedKey || "active",
        label: override.status || (meta && meta.label) || "\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439",
        tone: meta && meta.tone || "ok",
        note: override.note || "",
        source: "manual"
      }, meta || {});
    }
    return {
      key: "active",
      label: String(row && row.status || "").trim() || "\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439",
      tone: "ok",
      source: "fallback",
      note: ""
    };
  }

  function priceLifecycleOptionsHtml(current) {
    if (typeof window.productLifecycleOptionsHtml === "function") {
      return window.productLifecycleOptionsHtml(current || "active");
    }
    var meta = window.PRODUCT_LIFECYCLE_STATUS_META || {};
    var order = ["active", "new", "relaunch", "watch", "question", "paused", "exit", "archived"];
    var currentKey = typeof window.normalizeProductLifecycleKey === "function"
      ? (window.normalizeProductLifecycleKey(current) || "active")
      : String(current || "active").trim();
    return order.map(function (key) {
      var item = meta[key] || {};
      return '<option value="' + esc(key) + '"' + (key === currentKey ? " selected" : "") + '>' + esc(item.label || key) + '</option>';
    }).join("");
  }

  function priceLifecycleBadgeClass(lifecycle) {
    var tone = String(lifecycle && lifecycle.tone || "").trim();
    return tone ? " pw-badge-" + esc(tone) : "";
  }

  function renderPriceLifecycleEditor(row, compact) {
    var articleKey = String(row && row.articleKey || "").trim();
    if (!articleKey) return "";
    var lifecycle = row.productLifecycle || priceProductLifecycleForRow(row) || {};
    return [
      '<div class="pw-status-editor" data-price-lifecycle-readonly data-article-key="', esc(articleKey), '">',
      '<div class="pw-status-row">',
      '<strong>', esc(lifecycle.label || lifecycle.status || row.status || "\u2014"), '</strong>',
      '<button type="button" data-price-open-sku-workspace data-article-key="', esc(articleKey), '">\u041e\u0442\u043a\u0440\u044b\u0442\u044c SKU Workspace</button>',
      '</div>',
      compact ? '' : '<small>\u0421\u0442\u0430\u0442\u0443\u0441 \u043c\u0435\u043d\u044f\u0435\u0442\u0441\u044f \u043f\u043e \u0446\u0438\u0444\u0440\u0430\u043c \u0432 SKU Workspace \u0438 \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u0441\u043b\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f \u0420\u041e\u041f\u0430.</small>',
      '</div>'
    ].join("");
  }

  function invalidatePriceRenderCaches() {
    derived.visibleRows.rowsRef = null;
    derived.visibleRows.value = null;
    derived.stats.rowsRef = null;
    derived.stats.value = null;
    derived.table.rowsRef = null;
    derived.table.value = null;
    derived.portalStorageRaw = null;
    derived.portalStorageParsed = null;
  }

  async function savePriceLifecycleForm(form) {
    var articleKey = String(form && form.getAttribute("data-article-key") || "").trim();
    if (!articleKey || typeof window.upsertProductLifecycleStatus !== "function") return;
    var formData = new FormData(form);
    try {
      await window.upsertProductLifecycleStatus({
        articleKey: articleKey,
        status: formData.get("status"),
        note: formData.get("note")
      });
    } catch (error) {
      console.warn("[price-simple] lifecycle-save", error);
      window.alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u0442\u0430\u0442\u0443\u0441 \u0442\u043e\u0432\u0430\u0440\u0430.");
      return;
    }
    invalidatePriceRenderCaches();
    renderPriceWorkbench();
  }

  async function resetPriceLifecycle(articleKey) {
    if (!articleKey || typeof window.removeProductLifecycleStatus !== "function") return;
    try {
      await window.removeProductLifecycleStatus(articleKey);
    } catch (error) {
      console.warn("[price-simple] lifecycle-reset", error);
      return;
    }
    invalidatePriceRenderCaches();
    renderPriceWorkbench();
  }

  function attachPriceLifecycleForms(scope) {
    if (!scope) return;
    scope.querySelectorAll("[data-price-open-sku-workspace]").forEach(function (button) {
      if (button.dataset.priceLifecycleBound === "1") return;
      button.dataset.priceLifecycleBound = "1";
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var root = rootState();
        if (root) {
          root.filters = root.filters || {};
          root.filters.search = button.getAttribute("data-article-key") || "";
        }
        if (typeof window.setView === "function") window.setView("sku-contour");
      });
    });
  }

  function buildSkuMetaMap() {
    var map = Object.create(null);
    var root = rootState() || {};
    var skuRows = Array.isArray(root.skus) ? root.skus : [];
    skuRows.forEach(function (row) {
      var key = norm(row && (row.articleKey || row.article || row.sku));
      if (!key || map[key]) return;
      var matrixEntry = priceSkuMatrixEntry(row && (row.articleKey || row.article || row.sku));
      var rawPlatformOwners = row && row.ownersByPlatform && typeof row.ownersByPlatform === "object"
        ? row.ownersByPlatform
        : (row && row.owner && typeof row.owner === "object" && row.owner.byPlatform && typeof row.owner.byPlatform === "object"
          ? row.owner.byPlatform
          : {});
      map[key] = {
        owner: normalizeOwnerValue((row && row.owner && typeof row.owner === "object" ? row.owner.name : (row && row.owner)) || (matrixEntry && matrixEntry.owner)),
        ownersByPlatform: {
          wb: normalizeOwnerValue(rawPlatformOwners && rawPlatformOwners.wb),
          ozon: normalizeOwnerValue(rawPlatformOwners && rawPlatformOwners.ozon),
          ym: normalizeOwnerValue(rawPlatformOwners && (rawPlatformOwners.ym || rawPlatformOwners.ya)),
          ya: normalizeOwnerValue(rawPlatformOwners && (rawPlatformOwners.ya || rawPlatformOwners.ym))
        },
        status: row && (row.statusSku || row.status) || (matrixEntry && (matrixEntry.registryStatus || matrixEntry.status)),
        matrixProblemState: matrixEntry && (matrixEntry.problemState || (Array.isArray(matrixEntry.problemStates) ? matrixEntry.problemStates[0] : "")),
        matrixProblemLabel: matrixEntry && matrixEntry.problemLabel,
        matrixProblemTone: matrixEntry && matrixEntry.problemTone,
        role: row && (row.roleSku || row.role),
        launchReady: row && row.launchReady
      };
    });
    var portal = readPortalStorageState();
    var profiles = Array.isArray(root.storage && root.storage.repricerSkuProfiles) && root.storage.repricerSkuProfiles.length
      ? root.storage.repricerSkuProfiles
      : (Array.isArray(portal && portal.repricerSkuProfiles) ? portal.repricerSkuProfiles : []);
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

  function normalizeOwnerValue(value) {
    if (typeof canonicalOwnerName === "function") return canonicalOwnerName(value || "");
    return String(value || "").trim();
  }

  function skuMetaPlatformOwner(meta, market) {
    if (!meta) return "";
    var platform = procurementPlatform(market);
    if (!platform && norm(market) === "ym") platform = "ym";
    var ownersByPlatform = meta.ownersByPlatform || {};
    if (platform === "ym") return normalizeOwnerValue(ownersByPlatform.ym || ownersByPlatform.ya || "");
    if (platform === "wb" || platform === "ozon") return normalizeOwnerValue(ownersByPlatform[platform] || "");
    return "";
  }

  function leaderboardSignalMeta(signal) {
    var map = {
      leader: { label: "KZ работает", tone: "ok" },
      steady: { label: "KZ: наблюдать", tone: "info" },
      risk: { label: "KZ в риске", tone: "warn" },
      no_owner: { label: "KZ без owner", tone: "danger" },
      no_sales: { label: "KZ без выкупов", tone: "danger" }
    };
    return map[signal] || map.steady;
  }

  function leaderboardAlertTone(severity) {
    if (severity === "critical") return "danger";
    if (severity === "high") return "warn";
    if (severity === "medium") return "info";
    return "";
  }

  function buildProductLeaderboardLookup() {
    var root = rootState() || {};
    var payload = root.productLeaderboard || {};
    if (derived.productLeaderboardRef === payload && derived.productLeaderboardLookup) return derived.productLeaderboardLookup;
    var map = Object.create(null);
    var items = Array.isArray(payload && payload.items) ? payload.items : [];
    items.forEach(function (item) {
      var key = norm(item && item.articleKey);
      if (!key || map[key]) return;
      map[key] = item;
    });
    derived.productLeaderboardRef = payload;
    derived.productLeaderboardLookup = map;
    return map;
  }

  function findProductLeaderboardEntry(articleKey) {
    var key = norm(articleKey);
    if (!key) return null;
    return buildProductLeaderboardLookup()[key] || null;
  }

  function renderLeaderboardSummary(entry) {
    return String(entry && entry.diagnostics && entry.diagnostics.summary || "").trim() || "Weekly KZ-срез без критичных отклонений.";
  }

  function renderProductLeaderboardBadge(entry, articleKey) {
    if (!entry) return "";
    var meta = leaderboardSignalMeta(entry.signal);
    return [
      '<button type="button" class="pw-kz-badge ', esc(meta.tone), '" data-open-product-leaderboard="', esc(articleKey || entry.articleKey || ""), '" title="', esc(renderLeaderboardSummary(entry)), '">',
      esc(meta.label),
      '</button>'
    ].join("");
  }

  function renderProductLeaderboardAlerts(entry, limit) {
    var alerts = Array.isArray(entry && entry.diagnostics && entry.diagnostics.alerts) ? entry.diagnostics.alerts.slice(0, limit || 3) : [];
    if (!alerts.length) return "";
    return alerts.map(function (alert) {
      var tone = leaderboardAlertTone(alert && alert.severity);
      return '<span class="pw-badge pw-badge-' + esc(tone) + '" title="' + esc(alert && alert.hint || alert && alert.title || "") + '">' + esc(alert && (alert.label || alert.title) || "Сигнал") + '</span>';
    }).join("");
  }

  function renderProductLeaderboardContext(entry, articleKey) {
    if (!entry) return "";
    return [
      '<div class="pw-card">',
      '<div class="pw-label">КЗ / продуктовый лидерборд</div>',
      '<div class="pw-kz-stack" style="margin-top:10px;">',
      renderProductLeaderboardBadge(entry, articleKey),
      entry.weekLabel ? '<span class="pw-badge">' + esc(entry.weekLabel) + '</span>' : "",
      entry.owner ? '<span class="pw-badge">' + esc(entry.owner) + '</span>' : "",
      renderProductLeaderboardAlerts(entry),
      '</div>',
      '<div class="pw-note pw-kz-summary">', esc(renderLeaderboardSummary(entry)), '</div>',
      '<div class="pw-kz-stack">',
      '<span class="pw-badge">Выкупы ' + esc(intf(entry.buys)) + '</span>',
      '<span class="pw-badge">ROMI ' + esc(pct(entry.romiPct)) + '</span>',
      '<span class="pw-badge">ДРР ' + esc(pct(entry.drrPct)) + '</span>',
      '<span class="pw-badge">CTR ' + esc(pct(entry.ctrPct)) + '</span>',
      '</div>',
      '</div>'
    ].join("");
  }

  function openProductLeaderboard(articleKey) {
    var key = String(articleKey || "").trim();
    if (!key) return;
    state.selectedKey = "";
    unlockModalBackgroundScroll();
    try {
      if (typeof window.openProductLeaderboardForSku === "function") {
        window.openProductLeaderboardForSku(key);
        return;
      }
    } catch (error) {
      console.warn("[price-simple] leaderboard-open", error);
    }
    var root = rootState();
    if (root) {
      root.productLeaderboardFilters = root.productLeaderboardFilters || {};
      root.productLeaderboardFilters.search = key;
      root.productLeaderboardFilters.owner = "all";
      root.productLeaderboardFilters.signal = "all";
      if (!root.productLeaderboardFilters.sort) root.productLeaderboardFilters.sort = "buys";
    }
    var nav = document.querySelector('.nav-btn[data-view="product-leaderboard"]');
    if (nav && typeof nav.click === "function") {
      nav.click();
      return;
    }
    try {
      if (typeof window.setView === "function") window.setView("product-leaderboard");
    } catch (error) {
      console.warn("[price-simple] leaderboard-fallback", error);
    }
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
    var combinedResult = await tryFetchJsonNoStore(ORDER_PROCUREMENT_URL);
    var combinedPayload = combinedResult ? combinedResult.payload : null;
    var wbPayload = null;
    var ozonPayload = null;
    if (!combinedPayload || !Array.isArray(combinedPayload.rows) || !combinedPayload.rows.length) {
      var wbResult = await tryFetchJsonNoStore(ORDER_PROCUREMENT_WB_URL);
      var ozonResult = await tryFetchJsonNoStore(ORDER_PROCUREMENT_OZON_URL);
      wbPayload = wbResult ? wbResult.payload : null;
      ozonPayload = ozonResult ? ozonResult.payload : null;
    }
    return buildOrderProcurementLookup(combinedPayload, wbPayload, ozonPayload);
  }

  function pickPrimaryTimeline(source, overlayRow) {
    if (Array.isArray(source && source.daily) && source.daily.length) return source.daily;
    if (Array.isArray(overlayRow && overlayRow.daily) && overlayRow.daily.length) return overlayRow.daily;
    if (Array.isArray(source && source.timeline) && source.timeline.length) return source.timeline;
    if (Array.isArray(source && source.monthly) && source.monthly.length) return source.monthly;
    if (Array.isArray(overlayRow && overlayRow.timeline) && overlayRow.timeline.length) return overlayRow.timeline;
    if (Array.isArray(overlayRow && overlayRow.monthly) && overlayRow.monthly.length) return overlayRow.monthly;
    return [];
  }

  function shouldPreferCabinetPrice(liveValue, liveDate, dailyValue, dailyDate) {
    if (positiveNum(liveValue) == null) return false;
    if (positiveNum(dailyValue) == null) return true;
    var normalizedLiveDate = isoDate(liveDate);
    var normalizedDailyDate = isoDate(dailyDate);
    if (!normalizedLiveDate) return false;
    if (!normalizedDailyDate) return true;
    return normalizedLiveDate >= normalizedDailyDate;
  }

  function buildRow(source, market, manualMap, overlayRow, priceRow, liveRow, liveGeneratedAt, maxDate, skuMeta, orderProcurementRow) {
    var timeline = pickPrimaryTimeline(source, overlayRow);
    timeline = mergeTimelineWithOverlay(timeline, overlayRow, maxDate);
    var timelineValueDate = timeline.filter(function (item) {
      return positiveNum(item && (item.price != null ? item.price : item.currentPrice)) != null;
    }).map(function (item) {
      return isoDate(item && item.date);
    }).filter(Boolean).sort().pop() || "";
    var overlayClearsFill = overlayFlagEnabled(overlayRow && (overlayRow.clearCurrentFillPrice || overlayRow.clearCurrentPrice));
    var overlayClearsClient = overlayFlagEnabled(overlayRow && overlayRow.clearCurrentClientPrice);
    var overlayClearsSpp = overlayFlagEnabled(overlayRow && overlayRow.clearCurrentSppPct);
    var overlayClearsTurnover = overlayFlagEnabled(overlayRow && overlayRow.clearCurrentTurnoverDays);
    var overlayFillPrice = positiveNum(overlayRow && (overlayRow.currentFillPrice != null ? overlayRow.currentFillPrice : overlayRow.currentPrice));
    var overlayClientPrice = positiveNum(overlayRow && overlayRow.currentClientPrice);
    var overlaySppPct = num(overlayRow && overlayRow.currentSppPct);
    var overlayTurnoverDays = positiveNum(overlayRow && overlayRow.currentTurnoverDays);
    var overlayStatus = overlayRow && overlayRow.status;
    var overlayOwner = overlayRow && overlayRow.owner;
    var overlayValueDate = isoDate(overlayRow && (overlayRow.valueDate || overlayRow.historyFreshnessDate));
    var priceFillPrice = positiveNum(priceRow && (priceRow.currentPrice != null ? priceRow.currentPrice : priceRow.currentFillPrice));
    var priceClientPrice = positiveNum(priceRow && priceRow.currentClientPrice);
    var priceSppPct = num(priceRow && priceRow.currentSppPct);
    var priceTurnoverDays = positiveNum(priceRow && priceRow.currentTurnoverDays);
    var priceCurrentDate = isoDate(priceRow && (priceRow.currentPriceDate || priceRow.historyFreshnessDate));
    var sourceListPrice = firstPositive(source && source.firstPrice, source && source.currentFirstPrice, source && source.sellerPrice, source && source.currentSellerPriceBeforeDiscount);
    var overlayListPrice = firstPositive(overlayRow && overlayRow.firstPrice, overlayRow && overlayRow.currentFirstPrice, overlayRow && overlayRow.sellerPrice, overlayRow && overlayRow.currentSellerPriceBeforeDiscount);
    var priceListPrice = firstPositive(priceRow && priceRow.firstPrice, priceRow && priceRow.currentFirstPrice, priceRow && priceRow.sellerPrice, priceRow && priceRow.currentSellerPriceBeforeDiscount);
    var liveFillPrice = positiveNum(liveRow && (liveRow.currentFillPrice != null ? liveRow.currentFillPrice : liveRow.currentPrice));
    var liveClientPrice = positiveNum(liveRow && liveRow.currentClientPrice);
    var liveListPrice = firstPositive(liveRow && liveRow.currentListPrice, liveRow && liveRow.firstPrice, liveRow && liveRow.currentFirstPrice, liveRow && liveRow.sellerPrice, liveRow && liveRow.currentSellerPriceBeforeDiscount);
    var livePriceDate = isoDate(liveRow && (liveRow.currentPriceDate || liveRow.valueDate || liveRow.historyFreshnessDate || liveGeneratedAt));
    var preferLiveFillPrice = shouldPreferCabinetPrice(liveFillPrice, livePriceDate, priceFillPrice, priceCurrentDate);
    var preferLiveClientPrice = shouldPreferCabinetPrice(liveClientPrice, livePriceDate, priceClientPrice, priceCurrentDate);
    var preferLiveListPrice = shouldPreferCabinetPrice(liveListPrice, livePriceDate, priceListPrice, priceCurrentDate);
    var sourceValueDate = isoDate(source && (source.currentPriceDate || source.historyFreshnessDate || source.valueDate)) || timelineValueDate;
    var useOverlayFacts = Boolean(overlayRow) && (!overlayValueDate || !sourceValueDate || overlayValueDate >= sourceValueDate);
    var sourceFillPrice = positiveNum(source.currentFillPrice != null ? source.currentFillPrice : source.currentPrice);
    var sourceClientPrice = positiveNum(source.currentClientPrice);
    var sourceSppPct = num(source.currentSppPct);
    var sourceTurnoverDays = positiveNum(source.turnoverCurrentDays != null ? source.turnoverCurrentDays : source.currentTurnoverDays);
    var procurementTurnoverDays = positiveNum(orderProcurementRow && orderProcurementRow.turnoverDays);
    var sourcePriceMode = String(source && source.sourceMode || "");
    var overlayPriceMode = String(overlayRow && overlayRow.sourceMode || "");
    var pricePriceMode = String(priceRow && priceRow.sourceMode || "");
    var livePriceMode = String(liveRow && liveRow.sourceMode || "");
    var allowedMarginPct = firstRatio(
      priceRow && priceRow.allowedMarginPct,
      overlayRow && overlayRow.allowedMarginPct,
      source && source.allowedMarginPct,
      liveRow && liveRow.allowedMarginPct
    );
    var marginTotalPct = firstRatio(
      priceRow && (priceRow.marginTotalPct != null ? priceRow.marginTotalPct : (priceRow.marginPct != null ? priceRow.marginPct : priceRow.avgMargin7dPct)),
      overlayRow && (overlayRow.marginTotalPct != null ? overlayRow.marginTotalPct : (overlayRow.marginPct != null ? overlayRow.marginPct : overlayRow.avgMargin7dPct)),
      source && (source.marginTotalPct != null ? source.marginTotalPct : (source.marginPct != null ? source.marginPct : source.avgMargin7dPct)),
      liveRow && (liveRow.marginTotalPct != null ? liveRow.marginTotalPct : (liveRow.marginPct != null ? liveRow.marginPct : liveRow.avgMargin7dPct))
    );
    var currentFillPrice = overlayClearsFill
      ? null
      : (preferLiveFillPrice
        ? liveFillPrice
        : (priceFillPrice != null
        ? priceFillPrice
        : (liveFillPrice != null
        ? liveFillPrice
        : ((overlayFillPrice != null && (useOverlayFacts || sourceFillPrice == null)) ? overlayFillPrice : sourceFillPrice))));
    var currentFillPriceSource = preferLiveFillPrice
      ? "live"
      : (priceFillPrice != null
      ? "prices"
      : (liveFillPrice != null
      ? "live"
      : ((overlayFillPrice != null && (useOverlayFacts || sourceFillPrice == null)) ? "overlay" : "workbench")));
    var currentFillPriceMode = preferLiveFillPrice
      ? livePriceMode
      : (priceFillPrice != null
      ? pricePriceMode
      : (liveFillPrice != null
      ? livePriceMode
      : ((overlayFillPrice != null && (useOverlayFacts || sourceFillPrice == null)) ? overlayPriceMode : sourcePriceMode)));
    var listPrice = preferLiveListPrice
      ? liveListPrice
      : (priceListPrice != null
      ? priceListPrice
      : ((overlayListPrice != null && (useOverlayFacts || sourceListPrice == null))
        ? overlayListPrice
        : (sourceListPrice != null ? sourceListPrice : liveListPrice)));
    var listPriceSource = preferLiveListPrice
      ? "live"
      : (priceListPrice != null
      ? "prices"
      : ((overlayListPrice != null && (useOverlayFacts || sourceListPrice == null))
        ? "overlay"
        : (sourceListPrice != null ? "workbench" : (liveListPrice != null ? "live" : ""))));
    var listPriceMode = preferLiveListPrice
      ? livePriceMode
      : (priceListPrice != null
      ? pricePriceMode
      : ((overlayListPrice != null && (useOverlayFacts || sourceListPrice == null))
        ? overlayPriceMode
        : (sourceListPrice != null ? sourcePriceMode : livePriceMode)));
    var listPriceDate = listPriceSource === "prices"
      ? (priceCurrentDate || livePriceDate || overlayValueDate || sourceValueDate)
      : (listPriceSource === "overlay"
        ? (overlayValueDate || priceCurrentDate || sourceValueDate || livePriceDate)
        : (listPriceSource === "workbench"
          ? (sourceValueDate || overlayValueDate || priceCurrentDate || livePriceDate)
          : (livePriceDate || isoDate(liveGeneratedAt) || sourceValueDate || overlayValueDate || priceCurrentDate)));
    var turnoverDays = null;
    var turnoverSource = "";
    if (priceTurnoverDays != null) {
      turnoverDays = priceTurnoverDays;
      turnoverSource = "prices";
    } else if (overlayTurnoverDays != null && (useOverlayFacts || sourceTurnoverDays == null)) {
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
    var matrixEntry = priceSkuMatrixEntry(source && (source.articleKey || source.article || source.sku));
    var matrixProblemMeta = priceSkuMatrixProblemMeta(matrixEntry || skuRow);
    var skuPlatformOwner = skuMetaPlatformOwner(skuRow, market);
    var resolvedOwner = normalizeOwnerValue(overlayOwner || skuPlatformOwner || source.owner || (skuRow && skuRow.owner) || (matrixEntry && matrixEntry.owner) || "");
    var row = {
      market: market,
      articleKey: source.articleKey || source.article || source.sku || "",
      name: source.name || source.title || source.articleKey || "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f",
      owner: resolvedOwner || "\u2014",
      status: (matrixEntry && (matrixEntry.registryStatus || matrixEntry.status))
        || (skuRow && skuRow.status)
        || overlayStatus
        || source.status
        || "\u2014",
      matrixProblemLabel: matrixProblemMeta && matrixProblemMeta.label,
      matrixProblemTone: matrixProblemMeta && matrixProblemMeta.tone,
      role: source.role || (skuRow && skuRow.role) || "\u2014",
      launchReady: source.launchReady || (skuRow && skuRow.launchReady) || "\u2014",
      allowedMarginPct: allowedMarginPct,
      marginTotalPct: marginTotalPct,
      minPrice: firstPositive(priceRow && priceRow.minPrice, overlayRow && overlayRow.minPrice, source && source.minPrice, liveRow && liveRow.minPrice) || null,
      hardMinPrice: firstPositive(priceRow && priceRow.hardMinPrice, overlayRow && overlayRow.hardMinPrice, source && source.hardMinPrice, liveRow && liveRow.hardMinPrice) || null,
      maxPrice: firstPositive(priceRow && priceRow.maxPrice, overlayRow && overlayRow.maxPrice, source && source.maxPrice, liveRow && liveRow.maxPrice) || null,
      manualMinPrice: firstPositive(priceRow && priceRow.manualMinPrice, overlayRow && overlayRow.manualMinPrice, source && source.manualMinPrice, liveRow && liveRow.manualMinPrice) || null,
      manualMaxPrice: firstPositive(priceRow && priceRow.manualMaxPrice, overlayRow && overlayRow.manualMaxPrice, source && source.manualMaxPrice, liveRow && liveRow.manualMaxPrice) || null,
      minMaxSource: (priceRow && priceRow.minMaxSource) || (overlayRow && overlayRow.minMaxSource) || (source && source.minMaxSource) || (liveRow && liveRow.minMaxSource) || "",
      workingZoneFrom: firstPositive(priceRow && priceRow.workingZoneFrom, overlayRow && overlayRow.workingZoneFrom, source && source.workingZoneFrom, liveRow && liveRow.workingZoneFrom) || null,
      workingZoneTo: firstPositive(priceRow && priceRow.workingZoneTo, overlayRow && overlayRow.workingZoneTo, source && source.workingZoneTo, liveRow && liveRow.workingZoneTo) || null,
      marginSource: priceRow ? "prices.json" : (overlayRow && overlayRow.marginSource || source.marginSource || ""),
      turnoverDays: turnoverDays,
      turnoverSource: turnoverSource,
      currentFillPrice: currentFillPrice,
      currentFillPriceSource: currentFillPriceSource,
      currentFillPriceMode: currentFillPriceMode,
      listPrice: listPrice,
      listPriceSource: listPriceSource,
      listPriceMode: listPriceMode,
      listPriceDate: listPriceDate,
      currentClientPrice: overlayClearsClient
        ? null
        : (preferLiveClientPrice
          ? liveClientPrice
          : (priceClientPrice != null
          ? priceClientPrice
          : ((overlayClientPrice != null && (useOverlayFacts || sourceClientPrice == null))
          ? overlayClientPrice
          : ((liveClientPrice != null && sourceClientPrice == null) ? liveClientPrice : sourceClientPrice)))),
      currentSppPct: overlayClearsSpp
        ? null
        : sanitizeDiscountPct(priceSppPct != null
          ? priceSppPct
          : ((overlaySppPct != null && (useOverlayFacts || sourceSppPct == null)) ? overlaySppPct : sourceSppPct)),
      requiredPriceForMargin: num(source.requiredPriceForMargin),
      historyNote: source.historyNote || "",
      currentPriceDate: preferLiveFillPrice
        ? (livePriceDate || priceCurrentDate || overlayValueDate || sourceValueDate)
        : (priceFillPrice != null
        ? (priceCurrentDate || livePriceDate || overlayValueDate || sourceValueDate)
        : (liveFillPrice != null
        ? (livePriceDate || overlayValueDate || sourceValueDate)
        : ((useOverlayFacts && overlayValueDate) ? overlayValueDate : sourceValueDate))),
      valueDate: (useOverlayFacts && overlayValueDate) ? overlayValueDate : sourceValueDate,
      timeline: timeline
    };
    var manual = manualMap[norm(row.articleKey)];
    if (manual) {
      if (manual.owner) row.owner = normalizeOwnerValue(manual.owner);
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
    state.error = "";
    state.loadNonce += 1;
    var loadNonce = state.loadNonce;
    var loadGuard = window.setTimeout(function () {
      if (!state.loading || state.loadNonce !== loadNonce) return;
      state.loading = false;
      state.error = "Загрузка вкладки Цены заняла слишком много времени. Остановили вечный спиннер и ждём повторного чтения данных.";
      renderPriceWorkbench();
    }, LOAD_GUARD_MS);
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
      var livePayload = null;
      var liveSource = "none";
      var liveUrl = "";
      var cabinetLiveResult = await tryLoadSnapshotAwareJson(CABINET_LIVE_DATA_URL);
      var legacyLiveResult = await tryLoadSnapshotAwareJson(LIVE_DATA_URL);
      var chosenLive = chooseFreshestPayload(
        cabinetLiveResult && cabinetLiveResult.payload,
        legacyLiveResult && legacyLiveResult.payload
      );
      if (chosenLive) {
        livePayload = chosenLive.payload || null;
        if (cabinetLiveResult && chosenLive.payload === cabinetLiveResult.payload) {
          liveSource = cabinetLiveResult.source || "local";
          liveUrl = CABINET_LIVE_DATA_URL;
        } else {
          liveSource = legacyLiveResult && legacyLiveResult.source || "local";
          liveUrl = LIVE_DATA_URL;
        }
      }
      var pricesPayload = null;
      var pricesSource = "none";
      var pricesResult = await tryLoadSnapshotAwareJson(PRICES_URL);
      if (pricesResult) {
        pricesPayload = pricesResult.payload || null;
        pricesSource = pricesResult.source || "local";
      }
      var repricerResult = await tryLoadSnapshotAwareJson(REPRICER_URL);
      var repricerLiveResult = await tryLoadSnapshotAwareJson(REPRICER_LIVE_URL);
      syncLocalRepricerPayloads(
        repricerResult && repricerResult.payload ? repricerResult.payload : { generatedAt: "", rows: [] },
        repricerLiveResult && repricerLiveResult.payload ? repricerLiveResult.payload : { generatedAt: "", rows: [] }
      );
      var manualMap = readManualMap();
      var skuMetaMap = buildSkuMetaMap();
      var overlayMaps = buildOverlayMaps(overlayPayload || {});
      var pricesMaps = buildOverlayMaps(pricesPayload || {});
      var liveMaps = buildOverlayMaps(livePayload || {});
      var maxDate = isoDate((overlayPayload && (overlayPayload.asOfDate || overlayPayload.generatedAt)) || payload.generatedAt);
      var sourceRowsByMarket = buildSourceRowsByMarket(payload, overlayPayload || {}, pricesPayload || {}, livePayload || {});
      var rows = [];
      Object.keys(sourceRowsByMarket).sort(function (left, right) {
        var leftIndex = PRICE_MARKETS.indexOf(left);
        var rightIndex = PRICE_MARKETS.indexOf(right);
        return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) || left.localeCompare(right);
      }).forEach(function (market) {
        var marketKey = canonicalPriceMarket(market);
        Object.keys(sourceRowsByMarket[market] || {}).forEach(function (sourceKey) {
          var item = sourceRowsByMarket[market][sourceKey];
          var rowKey = norm(item && (item.articleKey || item.article || item.sku));
          var overlayRow = overlayMaps[marketKey] && overlayMaps[marketKey][rowKey];
          var priceRow = pricesMaps[marketKey] && pricesMaps[marketKey][rowKey];
          var liveRow = liveMaps[marketKey] && liveMaps[marketKey][rowKey];
          var orderProcurementRow = orderProcurementLookup.maps[marketKey] && orderProcurementLookup.maps[marketKey][rowKey];
          rows.push(buildRow(item, marketKey, manualMap, overlayRow || null, priceRow || null, liveRow || null, livePayload && livePayload.generatedAt, maxDate, skuMetaMap, orderProcurementRow || null));
        });
      });
      state.rows = rows;
      state.availableMarkets = availableMarketsForRows(rows);
      if (state.availableMarkets.indexOf(state.market) < 0) state.market = "all";
      state.liveGeneratedAt = livePayload && livePayload.generatedAt ? livePayload.generatedAt : "";
      state.overlayGeneratedAt = overlayPayload && overlayPayload.generatedAt ? overlayPayload.generatedAt : "";
      state.orderProcurementGeneratedAt = orderProcurementLookup.generatedAt || "";
      state.orderProcurementFallbackCount = rows.filter(function (row) { return row.turnoverSource === "order_procurement"; }).length;
      state.sourceNote = overlayPayload && overlayPayload.generatedAt
        ? DATA_URL + " (" + dataResult.source + ")"
          + (pricesPayload && pricesPayload.generatedAt ? " + " + PRICES_URL + " (" + pricesSource + ")" : "")
          + (state.liveGeneratedAt && liveUrl ? " + " + liveUrl + " (" + liveSource + ")" : "")
          + " + " + OVERLAY_URL + " (" + overlaySource + ") \u00b7 overlay \u0434\u043e " + isoDate(overlayPayload.asOfDate || overlayPayload.generatedAt)
        : DATA_URL + " (" + dataResult.source + ") \u00b7 \u0431\u0435\u0437 \u0441\u0432\u0435\u0436\u0435\u0433\u043e overlay";
      if (state.orderProcurementFallbackCount > 0) {
        state.sourceNote += " \u00b7 \u043e\u0431\u043e\u0440\u043e\u0442 fallback: order_procurement";
        if (state.orderProcurementGeneratedAt) {
          state.sourceNote += " \u0434\u043e " + isoDate(state.orderProcurementGeneratedAt);
        }
        state.sourceNote += " (" + state.orderProcurementFallbackCount + " SKU)";
      }
      state.loaded = true;
      state.error = "";
      var last = latestDate(rows);
      state.latestTimelineDate = last;
      state.earliestTimelineDate = earliestDate(rows);
      state.latestFactDate = latestPriceFactDate(rows) || last;
      state.dataLagDays = state.latestFactDate ? Math.max(0, diffDays(state.latestFactDate, todayKey())) : 0;
      state.sourceNote += state.latestFactDate
        ? " \u00b7 \u0444\u0430\u043a\u0442 \u0446\u0435\u043d \u0434\u043e " + state.latestFactDate
        : " \u00b7 \u0434\u0430\u0442\u0430 \u0444\u0430\u043a\u0442\u0430 \u0446\u0435\u043d \u043d\u0435 \u043e\u043f\u0440\u0435\u0434\u0435\u043d\u0430";
      var selectedMarketRows = rows.filter(function (row) {
        return state.market === "all" || row.market === state.market;
      });
      var dateAnchor = latestPriceFactDate(selectedMarketRows) || latestDate(selectedMarketRows) || state.latestFactDate || last;
      if (dateAnchor) {
        state.dateTo = dateAnchor;
        state.dateFrom = shiftDate(dateAnchor, -6);
      }
      normalizeDateRange();
    } catch (error) {
      state.error = error && error.message ? error.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0432\u043a\u043b\u0430\u0434\u043a\u0443 \u0426\u0435\u043d\u044b.";
    } finally {
      window.clearTimeout(loadGuard);
      state.loading = false;
      renderPriceWorkbench();
    }
  }

  function rangeSlice(row) {
    return (row.timeline || []).filter(function (item) {
      var date = isoDate(item && item.date);
      if (!date) return false;
      if (state.dateFrom && date < state.dateFrom) return false;
      if (state.dateTo && date > state.dateTo) return false;
      return true;
    });
  }

  function latestRangePoint(row) {
    var items = rangeSlice(row).filter(priceTimelinePointHasFact);
    if (items.length) return items[items.length - 1];
    var snapshots = [];
    var fillPrice = positiveNum(row && row.currentFillPrice);
    var fillDate = isoDate(row && (row.currentPriceDate || row.valueDate));
    if (fillPrice != null && fillDate) snapshots.push({ date: fillDate, price: fillPrice, snapshotOnly: true });
    var listPrice = positiveNum(row && row.listPrice);
    var listDate = isoDate(row && (row.listPriceDate || row.valueDate));
    if (listPrice != null && listDate) snapshots.push({ date: listDate, price: listPrice, snapshotOnly: true, listPriceOnly: true });
    return snapshots
      .filter(function (item) {
        if (state.dateFrom && item.date < state.dateFrom) return false;
        if (state.dateTo && item.date > state.dateTo) return false;
        return true;
      })
      .sort(function (left, right) { return left.date.localeCompare(right.date); })
      .pop() || null;
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

  function latestPositiveRangeMetric(row, key) {
    var items = rangeSlice(row);
    for (var index = items.length - 1; index >= 0; index -= 1) {
      var item = items[index];
      var value = positiveNum(item && item[key]);
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

  function sumHistoryMetric(items, key) {
    var total = 0;
    var found = false;
    (items || []).forEach(function (item) {
      var value = num(item && item[key]);
      if (value == null) return;
      total += value;
      found = true;
    });
    return found ? total : null;
  }

  function countHistoryMetric(items, key) {
    return (items || []).reduce(function (count, item) {
      return num(item && item[key]) == null ? count : count + 1;
    }, 0);
  }

  function roundedHistoryPrice(item) {
    var price = num(item && item.price);
    return price == null ? null : moneyRound(price);
  }

  function rowPriceImpact(row) {
    var items = historyItemsForRow(row)
      .filter(function (item) { return item && isoDate(item.date); })
      .slice()
      .sort(function (left, right) { return String(left.date || "").localeCompare(String(right.date || "")); });
    var ordersUnits = sumHistoryMetric(items, "ordersUnits");
    var deliveredUnits = sumHistoryMetric(items, "deliveredUnits");
    var revenue = sumHistoryMetric(items, "revenue");
    var lastPrice = null;
    var lastPriceDate = "";
    var change = null;
    var changesCount = 0;
    items.forEach(function (item, index) {
      var price = roundedHistoryPrice(item);
      var date = isoDate(item && item.date);
      if (price == null) return;
      if (lastPrice != null && price !== lastPrice) {
        changesCount += 1;
        change = {
          date: date,
          index: index,
          beforePrice: lastPrice,
          beforeDate: lastPriceDate,
          afterPrice: price,
          deltaRub: price - lastPrice,
          deltaPct: lastPrice > 0 ? (price - lastPrice) / lastPrice : null
        };
      }
      lastPrice = price;
      lastPriceDate = date;
    });
    var result = {
      itemsCount: items.length,
      ordersUnits: ordersUnits,
      deliveredUnits: deliveredUnits,
      revenue: revenue,
      avgOrdersPerDay: ordersUnits != null && items.length ? ordersUnits / items.length : null,
      priceChanges: changesCount,
      change: change,
      afterOrders: null,
      beforeOrders: null,
      afterRevenue: null,
      beforeRevenue: null,
      afterDays: 0,
      beforeDays: 0,
      orderDelta: null,
      revenueDelta: null
    };
    if (!change) return result;
    var afterItems = items.slice(change.index);
    var beforeItems = items.slice(Math.max(0, change.index - afterItems.length), change.index);
    result.afterOrders = sumHistoryMetric(afterItems, "ordersUnits");
    result.beforeOrders = sumHistoryMetric(beforeItems, "ordersUnits");
    result.afterRevenue = sumHistoryMetric(afterItems, "revenue");
    result.beforeRevenue = sumHistoryMetric(beforeItems, "revenue");
    result.afterDays = countHistoryMetric(afterItems, "ordersUnits");
    result.beforeDays = countHistoryMetric(beforeItems, "ordersUnits");
    result.afterRevenueDays = countHistoryMetric(afterItems, "revenue");
    result.beforeRevenueDays = countHistoryMetric(beforeItems, "revenue");
    result.afterOrdersPerDay = result.afterOrders != null && result.afterDays > 0 ? result.afterOrders / result.afterDays : null;
    result.beforeOrdersPerDay = result.beforeOrders != null && result.beforeDays > 0 ? result.beforeOrders / result.beforeDays : null;
    result.afterRevenuePerDay = result.afterRevenue != null && result.afterRevenueDays > 0 ? result.afterRevenue / result.afterRevenueDays : null;
    result.beforeRevenuePerDay = result.beforeRevenue != null && result.beforeRevenueDays > 0 ? result.beforeRevenue / result.beforeRevenueDays : null;
    if (result.afterOrdersPerDay != null && result.beforeOrdersPerDay != null) {
      result.orderDelta = result.afterOrdersPerDay - result.beforeOrdersPerDay;
    }
    if (result.afterRevenuePerDay != null && result.beforeRevenuePerDay != null) {
      result.revenueDelta = result.afterRevenuePerDay - result.beforeRevenuePerDay;
    }
    return result;
  }

  function buildDisplayRow(row) {
    if (!row) return null;
    var next = Object.assign({}, row);
    next.productLeaderboard = findProductLeaderboardEntry(next.articleKey);
    next.productLifecycle = priceProductLifecycleForRow(next);
    if (next.productLifecycle && (next.productLifecycle.label || next.productLifecycle.status)) {
      next.status = next.productLifecycle.label || next.productLifecycle.status || next.status;
    }
    var point = latestRangePoint(row);
    next.rangeHasPoint = Boolean(point);
    next.repricerDisplay = buildRepricerDisplay(next.market, next.articleKey);
    next.repricerBounds = mergeRowPriceBounds(buildRepricerBounds(next.market, next.articleKey), next);
    if (!point) {
      next.priceImpact = rowPriceImpact(next);
      return next;
    }

    var priceMetric = latestPositiveRangeMetric(row, "price");
    var clientMetric = latestPositiveRangeMetric(row, "clientPrice");
    var sppMetric = latestNonNullRangeMetric(row, "sppPct");
    var turnoverMetric = latestPositiveRangeMetric(row, "turnoverDays");
    var currentSnapshotPrice = /^(live|prices)$/i.test(String(row.currentFillPriceSource || "")) ? positiveNum(row.currentFillPrice) : null;
    var currentSnapshotPriceDate = isoDate(row.currentPriceDate);
    var preferSnapshotPrice = currentSnapshotPrice != null
      && (priceMetric.value == null || !priceMetric.date || (currentSnapshotPriceDate && currentSnapshotPriceDate >= priceMetric.date));

    next.currentFillPrice = preferSnapshotPrice ? currentSnapshotPrice : (priceMetric.value != null ? priceMetric.value : row.currentFillPrice);
    next.currentClientPrice = clientMetric.value != null ? clientMetric.value : row.currentClientPrice;
    next.currentSppPct = sanitizeDiscountPct(sppMetric.value != null ? sppMetric.value : row.currentSppPct);
    next.turnoverDays = turnoverMetric.value != null ? turnoverMetric.value : row.turnoverDays;
    next.valueDate = preferSnapshotPrice
      ? (isoDate(row.currentPriceDate) || isoDate(point.date) || row.valueDate)
      : (isoDate(point.date) || row.valueDate);
    next.priceFactDate = preferSnapshotPrice
      ? (isoDate(row.currentPriceDate) || priceMetric.date || isoDate(row.valueDate))
      : (priceMetric.value != null ? priceMetric.date : (isoDate(row.currentPriceDate) || isoDate(row.valueDate)));
    next.clientPriceFactDate = clientMetric.value != null ? clientMetric.date : isoDate(row.valueDate);
    next.sppFactDate = sppMetric.value != null ? sppMetric.date : isoDate(row.valueDate);
    next.turnoverFactDate = turnoverMetric.value != null ? turnoverMetric.date : isoDate(row.valueDate);
    next.listPrice = num(row.listPrice);
    next.listPriceFactDate = isoDate(row.listPriceDate) || next.priceFactDate || next.valueDate;
    next.listPriceSource = String(row.listPriceSource || "").trim();
    if (next.listPrice != null && next.currentFillPrice != null && next.listPrice > 0 && next.listPrice > next.currentFillPrice) {
      next.sellerDiscountPct = sanitizeDiscountPct(1 - (next.currentFillPrice / next.listPrice));
    } else {
      next.sellerDiscountPct = null;
    }
    next.priceImpact = rowPriceImpact(next);
    return next;
  }

  function shouldIncludePriceRowForRange(displayRow, hasSearch) {
    if (!(state.dateFrom || state.dateTo)) return true;
    if (displayRow && displayRow.rangeHasPoint) return true;
    return Boolean(hasSearch);
  }

  function visibleRows() {
    var search = String(state.search || "").trim().toLowerCase();
    var searchNorm = norm(search);
    var ownerFilter = String(state.ownerFilter || "all").trim();
    var statusFilter = String(state.statusFilter || "all").trim();
    var leaderboardRef = (rootState() || {}).productLeaderboard || null;
    readPortalStorageState();
    var portalStorageRaw = derived.portalStorageRaw || "";
    if (
      derived.visibleRows.rowsRef === state.rows &&
      derived.visibleRows.market === state.market &&
      derived.visibleRows.search === search &&
      derived.visibleRows.ownerFilter === ownerFilter &&
      derived.visibleRows.statusFilter === statusFilter &&
      derived.visibleRows.dateFrom === state.dateFrom &&
      derived.visibleRows.dateTo === state.dateTo &&
      derived.visibleRows.portalStorageRaw === portalStorageRaw &&
      derived.visibleRows.leaderboardRef === leaderboardRef &&
      derived.visibleRows.value
    ) {
      return derived.visibleRows.value;
    }
    var next = [];
    state.rows.forEach(function (row) {
      if (state.market !== "all" && row.market !== state.market) return;
      var displayRow = buildDisplayRow(row);
      if (ownerFilter !== "all" && norm(displayRow.owner) !== ownerFilter) return;
      if (statusFilter !== "all" && norm(displayRow.status) !== statusFilter) return;
      if (search) {
        var hay = [displayRow.articleKey, displayRow.name, displayRow.owner, displayRow.status, displayRow.productLifecycle && displayRow.productLifecycle.note, displayRow.matrixProblemLabel, displayRow.comment, displayRow.reason].join(" ").toLowerCase();
        var hayNorm = norm(hay);
        if (hay.indexOf(search) === -1 && (!searchNorm || hayNorm.indexOf(searchNorm) === -1)) return;
      }
      if (!shouldIncludePriceRowForRange(displayRow, search)) return;
      displayRow.rangeFallback = Boolean((state.dateFrom || state.dateTo) && !displayRow.rangeHasPoint && search);
      next.push(displayRow);
    });
    derived.visibleRows.rowsRef = state.rows;
    derived.visibleRows.market = state.market;
    derived.visibleRows.search = search;
    derived.visibleRows.ownerFilter = ownerFilter;
    derived.visibleRows.statusFilter = statusFilter;
    derived.visibleRows.dateFrom = state.dateFrom;
    derived.visibleRows.dateTo = state.dateTo;
    derived.visibleRows.portalStorageRaw = portalStorageRaw;
    derived.visibleRows.leaderboardRef = leaderboardRef;
    derived.visibleRows.value = next;
    return next;
  }

  function stats(rows) {
    if (derived.stats.rowsRef === rows && derived.stats.value) return derived.stats.value;
    function mean(list) {
      return list.length ? list.reduce(function (acc, value) { return acc + value; }, 0) / list.length : null;
    }
    var price = [];
    var margin = [];
    var turnover = [];
    var below = 0;
    var ordersUnits = 0;
    var ordersFound = false;
    var revenue = 0;
    var revenueFound = false;
    var priceChanges = 0;
    var changedRows = 0;
    var priceRaises = 0;
    var priceDrops = 0;
    var afterOrders = 0;
    var afterOrdersFound = false;
    var impactWins = 0;
    var impactDrops = 0;
    var impactFlat = 0;
    var orderDeltaTotal = 0;
    var orderDeltaFound = false;
    var minMaxRisk = 0;
    var minMaxDanger = 0;
    var bestWin = null;
    var worstDrop = null;
    rows.forEach(function (row) {
      var impact = row.priceImpact || rowPriceImpact(row);
      if (row.listPrice != null) price.push(row.listPrice);
      else if (row.currentFillPrice != null) price.push(row.currentFillPrice);
      if (row.marginTotalPct != null) margin.push(row.marginTotalPct);
      if (row.turnoverDays != null && row.turnoverDays > 0) turnover.push(row.turnoverDays);
      if (row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct) below += 1;
      if (impact.ordersUnits != null) {
        ordersUnits += impact.ordersUnits;
        ordersFound = true;
      }
      if (impact.revenue != null) {
        revenue += impact.revenue;
        revenueFound = true;
      }
      if (impact.priceChanges) priceChanges += impact.priceChanges;
      if (impact.change) {
        changedRows += 1;
        if (Number(impact.change.deltaRub) > 0) priceRaises += 1;
        else if (Number(impact.change.deltaRub) < 0) priceDrops += 1;
      }
      if (impact.afterOrders != null) {
        afterOrders += impact.afterOrders;
        afterOrdersFound = true;
      }
      if (impact.orderDelta != null && Number.isFinite(Number(impact.orderDelta))) {
        var delta = Number(impact.orderDelta);
        orderDeltaTotal += delta;
        orderDeltaFound = true;
        if (delta > 0) {
          impactWins += 1;
          if (!bestWin || delta > bestWin.delta) bestWin = { articleKey: row.articleKey || "", name: row.name || "", delta: delta };
        } else if (delta < 0) {
          impactDrops += 1;
          if (!worstDrop || delta < worstDrop.delta) worstDrop = { articleKey: row.articleKey || "", name: row.name || "", delta: delta };
        } else {
          impactFlat += 1;
        }
      }
      var boundary = priceBoundaryState(row);
      if (boundary) {
        minMaxRisk += 1;
        if (boundary.tone === "danger") minMaxDanger += 1;
      }
    });
    var periodDays = Math.max(1, diffDays(state.dateFrom || state.dateTo, state.dateTo || state.dateFrom) + 1);
    var summary = {
      count: rows.length,
      avgPrice: mean(price),
      avgMargin: mean(margin),
      avgTurnover: mean(turnover),
      belowAllowed: below,
      ordersUnits: ordersFound ? ordersUnits : null,
      avgOrdersPerDay: ordersFound ? ordersUnits / periodDays : null,
      revenue: revenueFound ? revenue : null,
      priceChanges: priceChanges,
      changedRows: changedRows,
      priceRaises: priceRaises,
      priceDrops: priceDrops,
      afterOrders: afterOrdersFound ? afterOrders : null,
      impactWins: impactWins,
      impactDrops: impactDrops,
      impactFlat: impactFlat,
      orderDeltaTotal: orderDeltaFound ? orderDeltaTotal : null,
      minMaxRisk: minMaxRisk,
      minMaxDanger: minMaxDanger,
      bestWin: bestWin,
      worstDrop: worstDrop
    };
    derived.stats.rowsRef = rows;
    derived.stats.value = summary;
    return summary;
  }

  function priceSelectionKey(row) {
    if (!row) return "";
    return [canonicalPriceMarket(row.market || "all"), row.articleKey || ""].join("::");
  }

  function priceSelectionParts(key) {
    var text = String(key || "").trim();
    if (text.indexOf("::") < 0) return { market: "", article: text };
    var parts = text.split("::");
    return {
      market: canonicalPriceMarket(parts.shift() || ""),
      article: parts.join("::")
    };
  }

  function priceRowMatchesSelection(row, key) {
    var parts = priceSelectionParts(key);
    if (parts.market) {
      return canonicalPriceMarket(row && row.market) === parts.market && norm(row && row.articleKey) === norm(parts.article);
    }
    return norm(row && row.articleKey) === norm(parts.article);
  }

  function findRow(key) {
    return state.rows.find(function (row) { return priceRowMatchesSelection(row, key); }) || null;
  }

  function priceProgress(part, total) {
    var numerator = Number(part);
    var denominator = Number(total);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
    return Math.max(0, Math.min(100, numerator / denominator * 100));
  }

  function formatOrdersPerDay(value) {
    if (value == null || !Number.isFinite(Number(value))) return "\u2014";
    return Number(value).toFixed(1).replace(".", ",") + " /\u0434\u043d.";
  }

  function orderLevelNote(impact) {
    if (!impact || impact.ordersUnits == null) return "\u0437\u0430\u043a\u0430\u0437\u044b \u043f\u043e \u0434\u043d\u044f\u043c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b";
    var note = intf(impact.ordersUnits) + " \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434";
    if (impact.change) {
      note += "; \u043f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b " + (impact.afterOrders == null ? "\u2014" : intf(impact.afterOrders));
      if (impact.orderDelta != null) note += ", \u0394 " + signedDailyLabel(impact.orderDelta);
    }
    return note;
  }

  function priceBoundaryState(row) {
    var stateValue = priceCorridorState(row);
    return stateValue && stateValue.risk ? stateValue : null;
  }

  function priceCorridorState(row) {
    var bounds = row && row.repricerBounds || {};
    var price = num(row && row.currentFillPrice);
    var min = num(bounds.effectiveMin);
    var max = num(bounds.effectiveMax);
    if (price == null || price <= 0) {
      return {
        tone: "unknown",
        label: "\u043d\u0435\u0442 \u0446\u0435\u043d\u044b",
        title: "\u041d\u0435\u0442 \u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0439 \u0446\u0435\u043d\u044b \u0434\u043b\u044f \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438 MIN/MAX.",
        quality: true,
        risk: false
      };
    }
    if (!(min > 0) && !(max > 0)) {
      return {
        tone: "unknown",
        label: "MIN/MAX \u043d\u0435 \u0437\u0430\u0434\u0430\u043d",
        title: "\u041a\u043e\u0440\u0438\u0434\u043e\u0440 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043d\u0435\u043b\u044c\u0437\u044f \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0442\u044c, \u0447\u0442\u043e \u0446\u0435\u043d\u0430 \u0432 \u043d\u043e\u0440\u043c\u0435.",
        quality: true,
        risk: false
      };
    }
    if (min > 0 && max > 0 && min > max) {
      return {
        tone: "danger",
        label: "MIN \u0432\u044b\u0448\u0435 MAX",
        title: "\u041a\u043e\u0440\u0438\u0434\u043e\u0440 \u043d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u0435\u043d: MIN " + money(min) + " \u0432\u044b\u0448\u0435 MAX " + money(max),
        quality: true,
        risk: true
      };
    }
    if (min != null && min > 0 && price < min) {
      return {
        tone: "danger",
        label: "\u043d\u0438\u0436\u0435 MIN",
        title: "\u0426\u0435\u043d\u0430 " + money(price) + " \u043d\u0438\u0436\u0435 MIN " + money(min),
        risk: true
      };
    }
    if (max != null && max > 0 && price > max) {
      return {
        tone: "warn",
        label: "\u0432\u044b\u0448\u0435 MAX",
        title: "\u0426\u0435\u043d\u0430 " + money(price) + " \u0432\u044b\u0448\u0435 MAX " + money(max),
        risk: true
      };
    }
    return {
      tone: "ok",
      label: "\u0432 \u043a\u043e\u0440\u0438\u0434\u043e\u0440\u0435",
      title: "\u0426\u0435\u043d\u0430 \u043d\u0430\u0445\u043e\u0434\u0438\u0442\u0441\u044f \u0432 \u0437\u0430\u0434\u0430\u043d\u043d\u043e\u043c MIN/MAX.",
      quality: false,
      risk: false
    };
  }

  function priceFactLagDays(row) {
    var date = priceFactDateForRow(row);
    return date ? Math.max(0, diffDays(date, todayKey())) : null;
  }

  function priceDataAudit(rows) {
    var result = {
      rows: 0,
      withPrice: 0,
      withPriceDate: 0,
      stalePrice: 0,
      withMargin: 0,
      withBounds: 0,
      invalidBounds: 0,
      withOwner: 0,
      withDaily: 0
    };
    (rows || []).forEach(function (row) {
      result.rows += 1;
      if (positiveNum(row && row.currentFillPrice) != null) result.withPrice += 1;
      if (priceFactDateForRow(row)) result.withPriceDate += 1;
      var lag = priceFactLagDays(row);
      if (lag != null && lag > 2) result.stalePrice += 1;
      if (num(row && row.marginTotalPct) != null) result.withMargin += 1;
      var bounds = row && row.repricerBounds || {};
      var min = positiveNum(bounds.effectiveMin);
      var max = positiveNum(bounds.effectiveMax);
      if (min != null || max != null) result.withBounds += 1;
      if (min != null && max != null && min > max) result.invalidBounds += 1;
      if (String(row && row.owner || "").trim() && row.owner !== "\u2014") result.withOwner += 1;
      if (priceHasDailyFact(row)) result.withDaily += 1;
    });
    return result;
  }

  function priceDataAuditText(audit) {
    if (!audit || !audit.rows) return "\u0412 \u0441\u0440\u0435\u0437\u0435 \u043d\u0435\u0442 SKU.";
    return [
      "\u0446\u0435\u043d\u0430 " + audit.withPrice + "/" + audit.rows,
      "\u0434\u0430\u0442\u0430 \u0446\u0435\u043d\u044b " + audit.withPriceDate + "/" + audit.rows,
      "\u043c\u0430\u0440\u0436\u0430 " + audit.withMargin + "/" + audit.rows,
      "MIN/MAX " + audit.withBounds + "/" + audit.rows,
      "owner " + audit.withOwner + "/" + audit.rows,
      "daily " + audit.withDaily + "/" + audit.rows,
      audit.stalePrice ? "\u0443\u0441\u0442\u0430\u0440\u0435\u043b\u043e >2 \u0434\u043d.: " + audit.stalePrice : "",
      audit.invalidBounds ? "MIN>MAX: " + audit.invalidBounds : ""
    ].filter(Boolean).join(" \u00b7 ");
  }

  function priceBadgeToneClass(tone) {
    var key = String(tone || "").toLowerCase();
    if (key === "ok" || key === "up") return "pw-badge-ok";
    if (key === "danger" || key === "down") return "pw-badge-danger";
    if (key === "warn") return "pw-badge-warn";
    return "pw-badge-info";
  }

  function renderPriceBadge(label, tone, title) {
    if (!label) return "";
    return '<span class="pw-badge ' + priceBadgeToneClass(tone) + '"' + (title ? ' title="' + esc(title) + '"' : "") + '>' + esc(label) + '</span>';
  }

  function renderPriceGamePill(label, tone, title) {
    if (!label) return "";
    return '<span class="pw-game-pill ' + esc(tone || "info") + '"' + (title ? ' title="' + esc(title) + '"' : "") + '>' + esc(label) + '</span>';
  }

  function renderPriceGameCard(config) {
    var progress = Number(config && config.progress);
    if (!Number.isFinite(progress)) progress = 0;
    progress = Math.max(0, Math.min(100, progress));
    return [
      '<article class="pw-game-card ', esc(config.tone || "info"), '" style="--pw-progress:', progress.toFixed(1), '%;"',
      config.title ? ' title="' + esc(config.title) + '"' : '',
      '>',
      '<span class="pw-game-top"><span>', esc(config.label || ""), '</span>', config.badge ? '<em>' + esc(config.badge) + '</em>' : '', '</span>',
      '<strong>', esc(config.value || "\u2014"), '</strong>',
      '<small>', esc(config.note || ""), '</small>',
      '<span class="pw-game-meter"><i></i></span>',
      '<span class="pw-game-foot"><span>', esc(config.foot || ""), '</span></span>',
      '</article>'
    ].join("");
  }

  function renderPriceGameStrip(rows, summary) {
    if (!summary || !summary.count) return "";
    var deltaRows = summary.impactWins + summary.impactDrops + summary.impactFlat;
    var winTone = summary.impactDrops > summary.impactWins ? "danger" : (summary.impactWins ? "ok" : "info");
    var riskTone = summary.minMaxDanger ? "danger" : (summary.minMaxRisk ? "warn" : "ok");
    var orderDeltaLabel = summary.orderDeltaTotal == null ? "\u2014" : signedDailyLabel(summary.orderDeltaTotal);
    var changeFoot = "+ " + intf(summary.priceRaises) + " / - " + intf(summary.priceDrops);
    var minMaxWarn = Math.max(0, summary.minMaxRisk - summary.minMaxDanger);
    var riskFoot = "\u043a\u043e\u0440\u0438\u0434\u043e\u0440 \u0440\u043e\u0432\u043d\u044b\u0439";
    if (summary.minMaxDanger && minMaxWarn) riskFoot = intf(summary.minMaxDanger) + " \u043d\u0438\u0436\u0435 MIN / " + intf(minMaxWarn) + " \u0432\u044b\u0448\u0435 MAX";
    else if (summary.minMaxDanger) riskFoot = intf(summary.minMaxDanger) + " \u043d\u0438\u0436\u0435 MIN";
    else if (minMaxWarn) riskFoot = intf(minMaxWarn) + " \u0432\u044b\u0448\u0435 MAX";
    var cards = [
      renderPriceGameCard({
        tone: winTone,
        label: "\u0426\u0435\u043d\u0430 \u0441\u0440\u0430\u0431\u043e\u0442\u0430\u043b\u0430",
        value: intf(summary.impactWins),
        note: "SKU \u0441 \u0440\u043e\u0441\u0442\u043e\u043c \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u043f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b",
        foot: intf(summary.impactDrops) + " \u043f\u0440\u043e\u0441\u0430\u0434\u043e\u043a",
        progress: priceProgress(summary.impactWins, deltaRows)
      }),
      renderPriceGameCard({
        tone: summary.orderDeltaTotal == null ? "info" : (summary.orderDeltaTotal >= 0 ? "ok" : "danger"),
        label: "\u0423\u0440\u043e\u0432\u0435\u043d\u044c \u0437\u0430\u043a\u0430\u0437\u043e\u0432",
        value: formatOrdersPerDay(summary.avgOrdersPerDay),
        note: "\u0421\u0440\u0435\u0434\u043d\u0438\u0439 \u0442\u0435\u043c\u043f \u0437\u0430 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434",
        foot: "\u043f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b " + (summary.afterOrders == null ? "\u2014" : intf(summary.afterOrders)) + " \u00b7 \u0394 " + orderDeltaLabel,
        progress: summary.avgOrdersPerDay == null ? 0 : 100
      }),
      renderPriceGameCard({
        tone: summary.priceChanges ? "violet" : "info",
        label: "\u0421\u043c\u0435\u043d\u044b \u0446\u0435\u043d",
        value: intf(summary.priceChanges),
        note: intf(summary.changedRows) + " SKU \u043c\u0435\u043d\u044f\u043b\u0438 \u0446\u0435\u043d\u0443 \u0432 \u043f\u0435\u0440\u0438\u043e\u0434\u0435",
        foot: changeFoot,
        progress: priceProgress(summary.changedRows, summary.count)
      }),
      renderPriceGameCard({
        tone: riskTone,
        label: "MIN/MAX \u0440\u0438\u0441\u043a",
        value: intf(summary.minMaxRisk),
        note: "\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u0446\u0435\u043d\u0430 \u0432\u044b\u0448\u0435 \u0438\u043b\u0438 \u043d\u0438\u0436\u0435 \u043a\u043e\u0440\u0438\u0434\u043e\u0440\u0430",
        foot: riskFoot,
        progress: priceProgress(summary.minMaxRisk, summary.count)
      }),
      renderPriceGameCard({
        tone: "warn",
        label: "\u0412\u044b\u0440\u0443\u0447\u043a\u0430",
        value: money(summary.revenue),
        note: "\u0412 \u0442\u0435 \u0436\u0435 \u0434\u043d\u0438, \u0433\u0434\u0435 \u0432\u0438\u0434\u0438\u043c \u0446\u0435\u043d\u0443 \u0438 \u0437\u0430\u043a\u0430\u0437\u044b",
        foot: summary.ordersUnits == null ? "\u0437\u0430\u043a\u0430\u0437\u044b \u043d\u0435\u0442" : intf(summary.ordersUnits) + " \u0437\u0430\u043a\u0430\u0437\u043e\u0432",
        progress: summary.revenue == null ? 0 : 100
      })
    ];
    var pills = [
      renderPriceGamePill("SKU: " + intf(summary.count), "info"),
      renderPriceGamePill("\u0440\u043e\u0441\u0442: " + intf(summary.impactWins) + " SKU", "ok"),
      renderPriceGamePill("\u043f\u0440\u043e\u0441\u0430\u0434\u043a\u0430: " + intf(summary.impactDrops) + " SKU", summary.impactDrops ? "danger" : "info"),
      renderPriceGamePill("\u0446\u0435\u043d\u0443 \u043c\u0435\u043d\u044f\u043b\u0438: " + intf(summary.changedRows) + " SKU", summary.changedRows ? "violet" : "info"),
      renderPriceGamePill("MIN/MAX: " + intf(summary.minMaxRisk) + " \u0440\u0438\u0441\u043a", riskTone),
      summary.bestWin ? renderPriceGamePill("\u043b\u0443\u0447\u0448\u0438\u0439 \u043e\u0442\u043a\u043b\u0438\u043a: " + (summary.bestWin.articleKey || "\u2014") + " " + signedIntLabel(summary.bestWin.delta), "ok", summary.bestWin.name || "") : "",
      summary.worstDrop ? renderPriceGamePill("\u043f\u0440\u043e\u0441\u0430\u0434\u043a\u0430: " + (summary.worstDrop.articleKey || "\u2014") + " " + signedDailyLabel(summary.worstDrop.delta), "danger", summary.worstDrop.name || "") : ""
    ].filter(Boolean);
    return [
      '<div class="pw-game-panel" aria-label="\u0426\u0435\u043d\u043e\u0432\u044b\u0435 \u0441\u0438\u0433\u043d\u0430\u043b\u044b">',
      '<div class="pw-game-strip">', cards.join(""), '</div>',
      '<div class="pw-game-missions">', pills.join(""), '</div>',
      '</div>'
    ].join("");
  }

  function renderPriceRowBadges(row, impact) {
    var badges = [];
    var change = impact && impact.change;
    if (change) {
      badges.push(renderPriceBadge("\u0446\u0435\u043d\u0430 " + signedMoneyLabel(change.deltaRub), deltaTone(change.deltaRub), "\u0421\u043c\u0435\u043d\u0430 \u0446\u0435\u043d\u044b " + (change.date || "")));
    }
    if (impact && impact.orderDelta != null && Number.isFinite(Number(impact.orderDelta))) {
      var delta = Number(impact.orderDelta);
      if (delta > 0) badges.push(renderPriceBadge("\u0437\u0430\u043a\u0430\u0437\u044b " + signedDailyLabel(delta), "ok", "\u041f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b \u0446\u0435\u043d\u044b"));
      else if (delta < 0) badges.push(renderPriceBadge("\u043f\u0440\u043e\u0441\u0430\u0434\u043a\u0430 " + signedDailyLabel(delta), "danger", "\u041f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b \u0446\u0435\u043d\u044b"));
      else badges.push(renderPriceBadge("\u0437\u0430\u043a\u0430\u0437\u044b \u0440\u043e\u0432\u043d\u043e", "info", "\u041f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b \u0446\u0435\u043d\u044b"));
    }
    var boundary = priceBoundaryState(row);
    if (boundary) badges.push(renderPriceBadge(boundary.label, boundary.tone, boundary.title));
    if (!badges.length && impact && impact.ordersUnits != null && impact.ordersUnits > 0) {
      badges.push(renderPriceBadge("\u0437\u0430\u043a\u0430\u0437\u044b " + intf(impact.ordersUnits), "info", "\u0417\u0430\u043a\u0430\u0437\u044b \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434"));
    }
    return badges.length ? '<div class="pw-row-badges">' + badges.slice(0, 4).join("") + '</div>' : "";
  }

  function renderRepricerCell(display) {
    if (!display || moneyRound(display.price) == null) return "\u2014";
    return [
      '<div class="pw-repricer-cell"',
      display.hint ? ' title="' + esc(display.hint) + '"' : "",
      '><strong>', money(display.price), '</strong><small>', esc(display.label || "Репрайсер"), '</small></div>'
    ].join("");
  }

  function renderBoundCell(value, source) {
    if (value == null || value <= 0) return "\u2014";
    return '<div class="pw-repricer-cell"><strong>' + money(value) + '</strong><small>' + esc(source || "") + '</small></div>';
  }

  function priceSourceLabel(source) {
    var key = String(source || "").trim().toLowerCase();
    if (key === "prices") return "prices-срез";
    if (key === "live") return "live-срез";
    if (key === "overlay") return "overlay-срез";
    if (key === "workbench") return "workbench";
    return key;
  }

  function priceModeLabel(mode) {
    var value = String(mode || "").trim().toLowerCase();
    if (!value) return "";
    if (value.indexOf("market-facts") >= 0) return "факт продаж (средняя)";
    if (value.indexOf("client-only") >= 0) return "только клиентский факт";
    return value;
  }

  function renderPriceCell(value, source, mode, date) {
    if (value == null || !Number.isFinite(Number(value))) return "\u2014";
    var noteParts = [];
    var modeLabel = priceModeLabel(mode);
    if (modeLabel) noteParts.push(modeLabel);
    else if (source) noteParts.push(priceSourceLabel(source));
    var dateLabel = isoDate(date);
    if (dateLabel) noteParts.push(dateLabel);
    if (!noteParts.length) return money(value);
    return '<div class="pw-repricer-cell"><strong>' + money(value) + '</strong><small>' + esc(noteParts.join(" · ")) + '</small></div>';
  }

  function deltaTone(value) {
    if (value > 0) return "up";
    if (value < 0) return "down";
    return "flat";
  }

  function signedMoneyLabel(value) {
    if (value == null || !Number.isFinite(Number(value))) return "\u2014";
    var number = Number(value);
    var sign = number > 0 ? "+" : (number < 0 ? "-" : "");
    return sign + money(Math.abs(number));
  }

  function signedIntLabel(value) {
    if (value == null || !Number.isFinite(Number(value))) return "\u2014";
    var number = Number(value);
    var sign = number > 0 ? "+" : (number < 0 ? "-" : "");
    return sign + intf(Math.abs(number));
  }

  function signedDailyLabel(value) {
    if (value == null || !Number.isFinite(Number(value))) return "\u2014";
    var number = Number(value);
    var sign = number > 0 ? "+" : (number < 0 ? "-" : "");
    return sign + Math.abs(number).toFixed(1).replace(".", ",") + " /\u0434\u043d.";
  }

  function signedPctLabel(value) {
    if (value == null || !Number.isFinite(Number(value))) return "";
    var number = Number(value);
    var sign = number > 0 ? "+" : (number < 0 ? "-" : "");
    return sign + (Math.abs(number) * 100).toFixed(1) + "%";
  }

  function renderPriceImpactCell(row) {
    var impact = row.priceImpact || rowPriceImpact(row);
    var change = impact.change;
    var html = ['<div class="pw-price-impact">', renderPriceCell(row.currentFillPrice, row.currentFillPriceSource, row.currentFillPriceMode, row.priceFactDate || row.valueDate)];
    if (change) {
      html.push(
        '<span class="pw-delta ', deltaTone(change.deltaRub), '">',
        esc(signedMoneyLabel(change.deltaRub)),
        change.deltaPct != null ? ' / ' + esc(signedPctLabel(change.deltaPct)) : '',
        '</span>',
        '<small>', esc(change.date || ""), ': ', esc(money(change.beforePrice)), ' -> ', esc(money(change.afterPrice)), '</small>'
      );
    } else {
      html.push('<small>\u0431\u0435\u0437 \u0441\u043c\u0435\u043d\u044b \u0446\u0435\u043d\u044b \u0432 \u043f\u0435\u0440\u0438\u043e\u0434\u0435</small>');
    }
    html.push('</div>');
    return html.join("");
  }

  function renderClientSppCell(row) {
    return [
      '<div class="pw-impact-cell"><strong>', money(row.currentClientPrice), '</strong>',
      '<small>\u0421\u041f\u041f: ', pct(row.currentSppPct), '</small>',
      '<small>\u0441\u043a\u0438\u0434\u043a\u0430: ', pct(row.sellerDiscountPct), '</small></div>'
    ].join("");
  }

  function renderBoundsCell(row) {
    var bounds = row.repricerBounds || {};
    var repricer = row.repricerDisplay && moneyRound(row.repricerDisplay.price) != null
      ? '<small>\u0440\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440: ' + esc(money(row.repricerDisplay.price)) + '</small>'
      : '';
    return [
      '<div class="pw-range-cell"><strong>MIN ', money(bounds.effectiveMin), '</strong>',
      '<small>MAX ', money(bounds.effectiveMax), '</small>',
      repricer,
      '</div>'
    ].join("");
  }

  function renderOrdersCell(impact) {
    return [
      '<div class="pw-impact-cell"><strong>', impact.ordersUnits == null ? "\u2014" : intf(impact.ordersUnits), '</strong>',
      '<small>\u0437\u0430\u043a\u0430\u0437\u044b \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434</small>',
      '<small>', esc(formatOrdersPerDay(impact.avgOrdersPerDay)), '</small></div>'
    ].join("");
  }

  function renderAfterChangeCell(impact) {
    if (!impact.change) {
      return '<div class="pw-impact-cell"><strong>\u2014</strong><small>\u0441\u043c\u0435\u043d\u044b \u0446\u0435\u043d\u044b \u0432 \u043f\u0435\u0440\u0438\u043e\u0434\u0435 \u043d\u0435\u0442</small></div>';
    }
    var delta = impact.orderDelta;
    return [
      '<div class="pw-impact-cell"><strong>', impact.afterOrders == null ? "\u2014" : intf(impact.afterOrders), '</strong>',
      '<small>\u043f\u043e\u0441\u043b\u0435 ', esc(impact.change.date || ""), ' \u00b7 ', intf(impact.afterDays), ' \u0434\u043d.</small>',
      '<small>\u0434\u043e: ', impact.beforeOrders == null ? "\u2014" : intf(impact.beforeOrders),
      delta != null ? ' \u00b7 <span class="pw-delta ' + deltaTone(delta) + '">&Delta; ' + esc(signedDailyLabel(delta)) + '</span>' : '',
      '</small></div>'
    ].join("");
  }

  function renderRevenueCell(impact) {
    return [
      '<div class="pw-impact-cell"><strong>', money(impact.revenue), '</strong>',
      '<small>\u0437\u0430 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434</small></div>'
    ].join("");
  }

  function turnoverHelpText(row) {
    if (row && row.turnoverSource === "order_procurement") {
      return "\u0424\u043e\u043b\u0431\u044d\u043a \u0438\u0437 \u0417\u0430\u043a\u0430\u0437\u0430: inStock / avgDaily \u043f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435.";
    }
    if (row && row.turnoverSource) {
      var label = String(row.turnoverSource || "");
      if (label === "prices") label = "prices-\u0441\u0440\u0435\u0437";
      else if (label === "overlay") label = "overlay-\u0441\u0440\u0435\u0437";
      else if (label === "workbench") label = "workbench";
      return "\u0422\u0435\u043a\u0443\u0449\u0435\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u0438\u0437 " + label + ".";
    }
    return "\u041d\u0435\u0442 \u043e\u0441\u0442\u0430\u0442\u043a\u0430/avgDaily \u0434\u043b\u044f \u0440\u0430\u0441\u0447\u0435\u0442\u0430 \u0434\u043d\u0435\u0439 \u043e\u0431\u043e\u0440\u043e\u0442\u0430.";
  }

  function turnoverDisplay(row, impact) {
    var value = num(row && row.turnoverDays);
    if (value != null && value > 0) {
      return {
        value: days(value),
        note: metricHelp(turnoverHelpText(row), row && row.turnoverFactDate, row && row.valueDate)
      };
    }
    return {
      value: "\u043d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445",
      note: turnoverHelpText(row) + " \u0423\u0440\u043e\u0432\u0435\u043d\u044c \u0437\u0430\u043a\u0430\u0437\u043e\u0432: " + formatOrdersPerDay(impact && impact.avgOrdersPerDay) + "; " + orderLevelNote(impact) + "."
    };
  }

  function renderTurnoverCell(row, impact) {
    var display = turnoverDisplay(row, impact);
    return [
      '<div class="pw-impact-cell"><strong>', esc(display.value), '</strong>',
      '<small>', esc(display.note), '</small></div>'
    ].join("");
  }

  function renderOrderLevelMini(impact) {
    return [
      '<div class="pw-mini"><span class="pw-label">\u0423\u0440\u043e\u0432\u0435\u043d\u044c \u0437\u0430\u043a\u0430\u0437\u043e\u0432</span><strong>',
      esc(formatOrdersPerDay(impact && impact.avgOrdersPerDay)),
      '</strong><small>', esc(orderLevelNote(impact)), '</small></div>'
    ].join("");
  }

  function modalListPriceHelp(row) {
    if (priceModeLabel(row && row.listPriceMode) === "факт продаж (средняя)") {
      return "По этому SKU в слое нет кабинетной полки; показываем факт продаж по срезу.";
    }
    return "Полка цены продавца до внутренних скидок.";
  }

  function modalDiscountedPriceHelp(row) {
    if (priceModeLabel(row && row.currentFillPriceMode) === "факт продаж (средняя)") {
      return "По этому SKU цена собрана из факта продаж (средняя по срезу), а не из кабинета WB/Ozon.";
    }
    return "Текущая цена после скидки продавца.";
  }

  function sortToggleDirection(sortKey) {
    if (state.sortBy === sortKey) return state.sortDir === "asc" ? "desc" : "asc";
    return sortKey === "article" || sortKey === "owner" || sortKey === "status" ? "asc" : "desc";
  }

  function sortIndicator(sortKey) {
    if (state.sortBy !== sortKey) return "";
    return state.sortDir === "asc" ? " ↑" : " ↓";
  }

  function rowSortNumber(row, sortKey) {
    if (sortKey === "price_mp") return num(row && row.listPrice);
    if (sortKey === "discount_price") return num(row && row.currentFillPrice);
    if (sortKey === "repricer_price") return num(row && row.repricerDisplay && row.repricerDisplay.price);
    if (sortKey === "min") return num(row && row.repricerBounds && row.repricerBounds.effectiveMin);
    if (sortKey === "max") return num(row && row.repricerBounds && row.repricerBounds.effectiveMax);
    if (sortKey === "client_price") return num(row && row.currentClientPrice);
    if (sortKey === "spp") return num(row && row.currentSppPct);
    if (sortKey === "allowed_margin") return num(row && row.allowedMarginPct);
    if (sortKey === "margin") return num(row && row.marginTotalPct);
    if (sortKey === "turnover") return num(row && row.turnoverDays);
    if (sortKey === "seller_discount") return num(row && row.sellerDiscountPct);
    if (sortKey === "orders") return num(row && row.priceImpact && row.priceImpact.ordersUnits);
    if (sortKey === "revenue") return num(row && row.priceImpact && row.priceImpact.revenue);
    if (sortKey === "after_orders") return num(row && row.priceImpact && row.priceImpact.afterOrders);
    if (sortKey === "price_change") return Math.abs(num(row && row.priceImpact && row.priceImpact.change && row.priceImpact.change.deltaRub) || 0);
    return null;
  }

  function rowSortText(row, sortKey) {
    if (sortKey === "article") return String(row && row.articleKey || "");
    if (sortKey === "owner") return String(row && row.owner || "");
    if (sortKey === "status") return String(row && row.status || "");
    return "";
  }

  function sortedVisiblePriceRows(rows) {
    var sortBy = String(state.sortBy || "risk");
    var sortDir = state.sortDir === "asc" ? "asc" : "desc";
    return rows.slice().sort(function (a, b) {
      if (sortBy === "risk") {
        var dangerA = a.allowedMarginPct != null && a.marginTotalPct != null && a.marginTotalPct < a.allowedMarginPct ? 1 : 0;
        var dangerB = b.allowedMarginPct != null && b.marginTotalPct != null && b.marginTotalPct < b.allowedMarginPct ? 1 : 0;
        if (dangerA !== dangerB) return dangerB - dangerA;
        return (b.listPrice || b.currentFillPrice || 0) - (a.listPrice || a.currentFillPrice || 0);
      }

      var numberA = rowSortNumber(a, sortBy);
      var numberB = rowSortNumber(b, sortBy);
      var comparison = 0;
      if (numberA != null || numberB != null) {
        var safeA = numberA == null ? Number.NEGATIVE_INFINITY : numberA;
        var safeB = numberB == null ? Number.NEGATIVE_INFINITY : numberB;
        comparison = safeA === safeB ? 0 : (safeA > safeB ? 1 : -1);
      } else {
        var textA = rowSortText(a, sortBy);
        var textB = rowSortText(b, sortBy);
        comparison = textA.localeCompare(textB, "ru", { sensitivity: "base" });
      }
      if (comparison !== 0) return sortDir === "asc" ? comparison : -comparison;
      return String(a.articleKey || "").localeCompare(String(b.articleKey || ""), "ru", { sensitivity: "base" });
    });
  }

  function downloadPriceHtmlTable(columns, rows, filename) {
    if (!rows.length) {
      window.alert("По текущим фильтрам нет строк для выгрузки.");
      return;
    }
    var head = "<tr>" + columns.map(function (column) {
      return "<th>" + esc(column[1]) + "</th>";
    }).join("") + "</tr>";
    var body = rows.map(function (row) {
      return "<tr>" + columns.map(function (column) {
        var value = row[column[0]];
        if (value === null || value === undefined) value = "";
        return "<td>" + esc(value) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    var html = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><table border=\"1\">" + head + body + "</table></body></html>";
    var blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadPriceDelimitedFile(columns, rows, filename, delimiter) {
    if (!rows.length) {
      window.alert("По текущим фильтрам нет строк для выгрузки.");
      return;
    }
    var normalizedDelimiter = delimiter || "\t";
    var serializeCell = function (value) {
      var text = String(value == null ? "" : value);
      if (normalizedDelimiter === "\t") return text.replace(/\r?\n/g, " ");
      if (/["\r\n,;]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
      return text;
    };
    var lines = [];
    lines.push(columns.map(function (column) { return serializeCell(column[0]); }).join(normalizedDelimiter));
    rows.forEach(function (row) {
      lines.push(columns.map(function (column) {
        return serializeCell(row[column[0]]);
      }).join(normalizedDelimiter));
    });
    var blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/tab-separated-values;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function priceSummaryExportRows(rows) {
    return sortedVisiblePriceRows(rows).map(function (row) {
      var impact = row.priceImpact || rowPriceImpact(row);
      var change = impact.change || {};
      return {
        marketplace: priceMarketLabel(row.market),
        article_key: row.articleKey || "",
        name: row.name || "",
        owner: row.owner || "",
        status: row.status || "",
        orders_units_range: impact.ordersUnits,
        revenue_range: moneyRound(impact.revenue),
        price_changes_range: impact.priceChanges,
        last_price_change_date: change.date || "",
        price_before_change: moneyRound(change.beforePrice),
        price_after_change: moneyRound(change.afterPrice),
        price_change_rub: moneyRound(change.deltaRub),
        price_change_pct: change.deltaPct != null ? Math.round(Number(change.deltaPct) * 10000) / 100 : "",
        orders_after_change: impact.afterOrders,
        orders_before_change_window: impact.beforeOrders,
        orders_delta_after_change: impact.afterOrders != null && impact.beforeOrders != null
          ? impact.afterOrders - impact.beforeOrders
          : null,
        orders_after_change_per_day: impact.afterOrdersPerDay,
        orders_before_change_per_day: impact.beforeOrdersPerDay,
        orders_delta_after_change_per_day: impact.orderDelta,
        current_price_mp_before_discount: moneyRound(row.listPrice),
        current_price_mp_before_discount_date: row.listPriceFactDate || row.priceFactDate || row.currentPriceDate || row.valueDate || "",
        current_price_mp_before_discount_source: row.listPriceSource || "",
        current_price_mp_before_discount_mode: row.listPriceMode || "",
        current_price_mp_discounted: moneyRound(row.currentFillPrice),
        current_price_mp_discounted_date: row.priceFactDate || row.currentPriceDate || row.valueDate || "",
        current_price_mp_discounted_source: row.currentFillPriceSource || "",
        current_price_mp_discounted_mode: row.currentFillPriceMode || "",
        seller_discount_pct: row.sellerDiscountPct != null ? Math.round(Number(row.sellerDiscountPct) * 10000) / 100 : "",
        repricer_price: moneyRound(row.repricerDisplay && row.repricerDisplay.price),
        repricer_label: row.repricerDisplay && row.repricerDisplay.label || "",
        min_price: moneyRound(row.repricerBounds && row.repricerBounds.effectiveMin),
        min_price_source: row.repricerBounds && row.repricerBounds.minSource || "",
        max_price: moneyRound(row.repricerBounds && row.repricerBounds.effectiveMax),
        max_price_source: row.repricerBounds && row.repricerBounds.maxSource || "",
        manual_min_price: moneyRound(row.repricerBounds && row.repricerBounds.manualMin),
        manual_max_price: moneyRound(row.repricerBounds && row.repricerBounds.manualMax),
        client_price: moneyRound(row.currentClientPrice),
        spp_pct: row.currentSppPct != null ? Math.round(Number(row.currentSppPct) * 10000) / 100 : "",
        allowed_margin_pct: row.allowedMarginPct != null ? Math.round(Number(row.allowedMarginPct) * 10000) / 100 : "",
        margin_pct: row.marginTotalPct != null ? Math.round(Number(row.marginTotalPct) * 10000) / 100 : "",
        turnover_days: moneyRound(row.turnoverDays),
        turnover_source: row.turnoverSource || "",
        range_date: row.valueDate || "",
        history_note: row.historyNote || "",
        comment: row.comment || "",
        reason: row.reason || ""
      };
    });
  }

  function priceDailyExportRows(rows) {
    return sortedVisiblePriceRows(rows).flatMap(function (row) {
      var previousPrice = null;
      return historyItemsForRow(row).map(function (item) {
        var price = roundedHistoryPrice(item);
        var delta = previousPrice != null && price != null ? price - previousPrice : null;
        if (price != null) previousPrice = price;
        return {
          marketplace: priceMarketLabel(row.market),
          article_key: row.articleKey || "",
          name: row.name || "",
          owner: row.owner || "",
          status: row.status || "",
          date: item && item.date || "",
          price_mp: price,
          price_change_rub: moneyRound(delta),
          client_price: moneyRound(num(item && item.clientPrice)),
          spp_pct: num(item && item.sppPct) != null ? Math.round(Number(num(item && item.sppPct)) * 10000) / 100 : "",
          turnover_days: moneyRound(num(item && item.turnoverDays)),
          orders_units: num(item && item.ordersUnits),
          delivered_units: num(item && item.deliveredUnits),
          revenue: moneyRound(num(item && item.revenue)),
          current_snapshot_price: moneyRound(row.currentFillPrice),
          current_snapshot_price_date: row.priceFactDate || row.currentPriceDate || row.valueDate || ""
        };
      });
    });
  }

function downloadPriceSummaryExcel(rows) {
  downloadPriceHtmlTable([
    ["marketplace", "Площадка"],
    ["article_key", "Артикул"],
    ["name", "Название"],
    ["owner", "Owner"],
    ["orders_units_range", "\u0417\u0430\u043a\u0430\u0437\u044b \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434"],
    ["revenue_range", "\u0412\u044b\u0440\u0443\u0447\u043a\u0430 \u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434"],
    ["price_changes_range", "\u0421\u043c\u0435\u043d\u044b \u0446\u0435\u043d \u0432 \u043f\u0435\u0440\u0438\u043e\u0434\u0435"],
    ["last_price_change_date", "\u0414\u0430\u0442\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0439 \u0441\u043c\u0435\u043d\u044b"],
    ["price_before_change", "\u0426\u0435\u043d\u0430 \u0434\u043e \u0441\u043c\u0435\u043d\u044b"],
    ["price_after_change", "\u0426\u0435\u043d\u0430 \u043f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b"],
    ["price_change_rub", "\u0418\u0437\u043c. \u0446\u0435\u043d\u044b, \u0440\u0443\u0431."],
    ["price_change_pct", "\u0418\u0437\u043c. \u0446\u0435\u043d\u044b, %"],
    ["orders_after_change", "\u0417\u0430\u043a\u0430\u0437\u044b \u043f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b"],
    ["orders_before_change_window", "\u0417\u0430\u043a\u0430\u0437\u044b \u0434\u043e \u0441\u043c\u0435\u043d\u044b"],
    ["orders_delta_after_change", "\u0414\u0435\u043b\u044c\u0442\u0430 \u0437\u0430\u043a\u0430\u0437\u043e\u0432"],
    ["orders_after_change_per_day", "\u0417\u0430\u043a\u0430\u0437\u044b \u043f\u043e\u0441\u043b\u0435, \u0432 \u0434\u0435\u043d\u044c"],
    ["orders_before_change_per_day", "\u0417\u0430\u043a\u0430\u0437\u044b \u0434\u043e, \u0432 \u0434\u0435\u043d\u044c"],
    ["orders_delta_after_change_per_day", "\u0414\u0435\u043b\u044c\u0442\u0430 \u0437\u0430\u043a\u0430\u0437\u043e\u0432, \u0432 \u0434\u0435\u043d\u044c"],
    ["status", "Статус"],
    ["current_price_mp_before_discount", "Цена MP до скидки"],
    ["current_price_mp_before_discount_date", "Дата цены MP до скидки"],
    ["current_price_mp_before_discount_source", "Источник цены MP до скидки"],
    ["current_price_mp_before_discount_mode", "Режим цены MP до скидки"],
    ["current_price_mp_discounted", "Цена MP со скидкой / факт"],
    ["current_price_mp_discounted_date", "Дата цены MP со скидкой / факт"],
    ["current_price_mp_discounted_source", "Источник цены MP со скидкой / факт"],
    ["current_price_mp_discounted_mode", "Режим цены MP со скидкой / факт"],
    ["seller_discount_pct", "Скидка продавца, %"],
    ["repricer_price", "Цена репрайсера"],
    ["repricer_label", "Контур репрайсера"],
    ["min_price", "MIN"],
    ["min_price_source", "MIN источник"],
    ["max_price", "MAX"],
    ["max_price_source", "MAX источник"],
    ["manual_min_price", "Ручной MIN"],
    ["manual_max_price", "Ручной MAX"],
    ["client_price", "Цена клиента"],
    ["spp_pct", "СПП, %"],
    ["allowed_margin_pct", "Допустимая 3м, %"],
    ["margin_pct", "Маржа, %"],
    ["turnover_days", "Оборачиваемость, дн"],
      ["turnover_source", "Источник оборачиваемости"],
      ["range_date", "Срез"],
      ["history_note", "Комментарий по истории"],
      ["comment", "Ручной комментарий"],
      ["reason", "Причина"]
    ], priceSummaryExportRows(rows), "prices-summary-" + priceExportScope() + ".xls");
  }

  function downloadPriceDailyExcel(rows) {
    downloadPriceDelimitedFile([
      ["marketplace", "Площадка"],
      ["article_key", "Артикул"],
      ["name", "Название"],
      ["owner", "Owner"],
      ["status", "Статус"],
      ["date", "Дата"],
      ["price_mp", "Цена MP"],
      ["price_change_rub", "\u0418\u0437\u043c. \u0446\u0435\u043d\u044b, \u0440\u0443\u0431."],
      ["client_price", "Цена клиента"],
      ["spp_pct", "СПП, %"],
      ["turnover_days", "Оборачиваемость, дн"],
      ["orders_units", "Заказы, шт"],
      ["delivered_units", "Доставлено, шт"],
      ["revenue", "Выручка"],
      ["current_snapshot_price", "Текущая цена MP сейчас"],
      ["current_snapshot_price_date", "Дата текущей цены"]
    ], priceDailyExportRows(rows), "prices-daily-" + priceExportScope() + ".xls");
  }

  function sortableHead(sortKey, label) {
    return '<th><button type="button" class="pw-th-btn" data-price-sort="' + esc(sortKey) + '" title="Сортировать">' + esc(label) + sortIndicator(sortKey) + '</button></th>';
  }

  function renderTable(rows) {
    if (derived.table.rowsRef === rows && typeof derived.table.value === "string") return derived.table.value;
    if (!rows.length) {
      var emptyHtml = '<div class="pw-empty">\u041f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u043c \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0441\u0442\u0440\u043e\u043a.</div>';
      derived.table.rowsRef = rows;
      derived.table.value = emptyHtml;
      return emptyHtml;
    }
    var sorted = sortedVisiblePriceRows(rows);
    var html = [
      '<div class="pw-table-wrap"><table class="pw-table"><thead><tr>',
      sortableHead("article", "\u0410\u0440\u0442\u0438\u043a\u0443\u043b"),
      sortableHead("owner", "Owner"),
      sortableHead("status", "\u0421\u0442\u0430\u0442\u0443\u0441"),
      sortableHead("price_change", "\u0426\u0435\u043d\u0430 / \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0435"),
      sortableHead("client_price", "\u041a\u043b\u0438\u0435\u043d\u0442 / \u0421\u041f\u041f"),
      sortableHead("min", "MIN / MAX"),
      sortableHead("orders", "\u0417\u0430\u043a\u0430\u0437\u044b"),
      sortableHead("after_orders", "\u041f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b"),
      sortableHead("revenue", "\u0412\u044b\u0440\u0443\u0447\u043a\u0430"),
      sortableHead("turnover", "\u041e\u0431\u043e\u0440\u0430\u0447."),
      '</tr></thead><tbody>',
      sorted.map(function (row) {
        var lifecycle = row.productLifecycle || priceProductLifecycleForRow(row) || {};
        var impact = row.priceImpact || rowPriceImpact(row);
        return [
          '<tr class="pw-row" data-open-price="', esc(row.articleKey), '" data-price-market="', esc(row.market), '">',
          '<td><div class="pw-sku">', esc(row.articleKey), '</div><div class="pw-note">', esc(row.name), '</div>',
          row.productLeaderboard ? '<div class="pw-kz-stack">' + renderProductLeaderboardBadge(row.productLeaderboard, row.articleKey) + renderProductLeaderboardAlerts(row.productLeaderboard, 1) + '</div>' : '',
          renderPriceRowBadges(row, impact),
          '</td>',
          '<td>', esc(row.owner || "\u2014"), '</td>',
          '<td><span class="pw-badge', priceLifecycleBadgeClass(lifecycle), '">', esc(row.status || "\u2014"), '</span>',
          row.matrixProblemLabel ? '<div class="pw-mini-note"><span class="pw-badge ' + esc(row.matrixProblemTone || "warn") + '">' + esc(row.matrixProblemLabel) + '</span></div>' : '',
          renderPriceLifecycleEditor(row, true),
          '</td>',
          '<td>', renderPriceImpactCell(row), '</td>',
          '<td>', renderClientSppCell(row), '</td>',
          '<td>', renderBoundsCell(row), '</td>',
          '<td>', renderOrdersCell(impact), '</td>',
          '<td>', renderAfterChangeCell(impact), '</td>',
          '<td>', renderRevenueCell(impact), '</td>',
          '<td>', renderTurnoverCell(row, impact), '</td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table></div>'
    ].join("");
    derived.table.rowsRef = rows;
    derived.table.value = html;
    return html;
  }

  function historyItemsForRow(row) {
    var items = rangeSlice(row).slice();
    var priceFactDate = isoDate(row && row.priceFactDate);
    var currentSnapshotDate = isoDate(row && row.currentPriceDate);
    var snapshotDate = priceFactDate;
    if (currentSnapshotDate && (!snapshotDate || currentSnapshotDate > snapshotDate)) {
      snapshotDate = currentSnapshotDate;
    }
    var snapshotPrice = num(row && row.currentFillPrice);
    if (!snapshotDate || snapshotPrice == null) return items;
    if (state.dateFrom && snapshotDate < state.dateFrom) return items;
    if (state.dateTo && snapshotDate > state.dateTo) return items;
    var lastDate = items.length ? isoDate(items[items.length - 1] && items[items.length - 1].date) : "";
    if (lastDate && snapshotDate <= lastDate) return items;
    items.push({
      date: snapshotDate,
      price: snapshotPrice,
      clientPrice: row.clientPriceFactDate === snapshotDate ? num(row.currentClientPrice) : null,
      sppPct: row.sppFactDate === snapshotDate ? num(row.currentSppPct) : null,
      turnoverDays: row.turnoverFactDate === snapshotDate ? num(row.turnoverDays) : null,
      ordersUnits: null,
      deliveredUnits: null,
      revenue: null
    });
    return items;
  }

  function renderHistory(row) {
    var items = historyItemsForRow(row);
    if (!items.length) {
      return '<div class="pw-empty">\u0412\u043d\u0443\u0442\u0440\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u043f\u0435\u0440\u0438\u043e\u0434\u0430 \u043d\u0435\u0442 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0434\u043d\u0435\u0432\u043d\u044b\u0445 \u0442\u043e\u0447\u0435\u043a.</div>';
    }
    var note = '\u0417\u0434\u0435\u0441\u044c \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0435 \u0442\u043e\u0447\u043a\u0438 \u0432\u043d\u0443\u0442\u0440\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u043f\u0435\u0440\u0438\u043e\u0434\u0430. \u0415\u0441\u043b\u0438 \u0441\u0435\u0433\u043e\u0434\u043d\u044f\u0448\u043d\u0435\u0439 \u0442\u043e\u0447\u043a\u0438 \u0435\u0449\u0451 \u043d\u0435\u0442, \u0438\u0441\u0442\u043e\u0440\u0438\u044f \u0437\u0430\u043a\u0430\u043d\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044f \u043d\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u043c \u0441\u0440\u0435\u0437\u0435.';
    if (row.market === "wb") {
      note += ' \u041f\u043e WB \u0438\u0441\u0442\u043e\u0440\u0438\u044f \u043f\u043e \u0434\u043d\u044f\u043c \u0441\u0442\u0440\u043e\u0438\u0442\u0441\u044f \u0438\u0437 daily market-facts. \u042d\u0442\u043e \u043d\u0435 \u0436\u0443\u0440\u043d\u0430\u043b \u0440\u0443\u0447\u043d\u044b\u0445 \u0441\u043c\u0435\u043d \u0446\u0435\u043d\u044b, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043f\u043e\u0440\u0442\u0430\u043b \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u043f\u0435\u0440\u0432\u044b\u0439 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0439 \u0434\u043d\u0435\u0432\u043d\u043e\u0439 \u0444\u0430\u043a\u0442 \u043f\u043e\u0441\u043b\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f.';
    }
    var previousPrice = null;
    return [
      '<details class="pw-detail" open><summary>\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430 \u0446\u0435\u043d\u044b \u0438 \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u043f\u043e \u0434\u043d\u044f\u043c</summary>',
      '<div class="pw-detail-note">', esc(note), '</div>',
      '<div class="pw-history-wrap"><table class="pw-history"><thead><tr>',
      '<th>\u0414\u0430\u0442\u0430</th><th>\u0426\u0435\u043d\u0430 MP</th><th>\u0418\u0437\u043c.</th><th>\u0426\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430</th><th>\u0421\u041f\u041f</th><th>\u0417\u0430\u043a\u0430\u0437\u044b</th><th>\u0412\u044b\u0440\u0443\u0447\u043a\u0430</th><th>\u041e\u0431\u043e\u0440\u0430\u0447.</th>',
      '</tr></thead><tbody>',
      items.map(function (item) {
        var price = roundedHistoryPrice(item);
        var delta = previousPrice != null && price != null ? price - previousPrice : null;
        var changed = delta != null && delta !== 0;
        if (price != null) previousPrice = price;
        return [
          '<tr class="', changed ? 'pw-history-change' : '', '"><td>', esc(item.date || ""), '</td>',
          '<td>', money(price), '</td>',
          '<td>', delta == null ? "\u2014" : '<span class="pw-delta ' + deltaTone(delta) + '">' + esc(signedMoneyLabel(delta)) + '</span>', '</td>',
          '<td>', money(num(item.clientPrice)), '</td>',
          '<td>', pct(num(item.sppPct)), '</td>',
          '<td>', intf(num(item.ordersUnits)), '</td>',
          '<td>', money(num(item.revenue)), '</td>',
          '<td>', days(num(item.turnoverDays)), '</td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table></div></details>'
    ].join("");
  }

  function renderModal(row) {
    if (!row) return "";
    var leaderboardEntry = row.productLeaderboard || findProductLeaderboardEntry(row.articleKey);
    var bounds = row.repricerBounds || buildRepricerBounds(row.market, row.articleKey);
    var lifecycle = row.productLifecycle || priceProductLifecycleForRow(row) || {};
    var impact = row.priceImpact || rowPriceImpact(row);
    var turnover = turnoverDisplay(row, impact);
    return [
      '<div class="pw-modal ', state.selectedKey ? 'open' : '', '" id="priceSimpleModal">',
      '<div class="pw-modal-box">',
      '<div class="pw-modal-head">',
      '<div><h3>', esc(row.articleKey), '</h3><div class="pw-sub">', esc(row.name), '</div>', renderPriceRowBadges(row, impact), '</div>',
      '<button class="pw-close" type="button" data-close-price-modal>\u0417\u0430\u043a\u0440\u044b\u0442\u044c</button>',
      '</div>',
      '<div class="pw-kpis">',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 MP \u0434\u043e \u0441\u043a\u0438\u0434\u043a\u0438</span><strong>', money(row.listPrice != null ? row.listPrice : row.currentFillPrice), '</strong><small>', esc(metricHelp(modalListPriceHelp(row), row.listPriceFactDate || row.priceFactDate, row.valueDate)), '</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 MP \u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439</span><strong>', money(row.currentFillPrice), '</strong><small>', esc(metricHelp(modalDiscountedPriceHelp(row), row.priceFactDate, row.valueDate)), '</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0417\u0430\u043a\u0430\u0437\u044b \u043f\u0435\u0440\u0438\u043e\u0434\u0430</span><strong>', impact.ordersUnits == null ? "\u2014" : intf(impact.ordersUnits), '</strong><small>\u0421\u0443\u043c\u043c\u0430 \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u0434\u0430\u0442\u0435/\u043f\u0435\u0440\u0438\u043e\u0434\u0435.</small></div>',
      renderOrderLevelMini(impact),
      '<div class="pw-mini"><span class="pw-label">\u0412\u044b\u0440\u0443\u0447\u043a\u0430 \u043f\u0435\u0440\u0438\u043e\u0434\u0430</span><strong>', money(impact.revenue), '</strong><small>\u0412\u044b\u0440\u0443\u0447\u043a\u0430 \u0432 \u0442\u0435 \u0436\u0435 \u0434\u043d\u0438, \u0433\u0434\u0435 \u0432\u0438\u0434\u0438\u043c \u0446\u0435\u043d\u0443.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u041f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b \u0446\u0435\u043d\u044b</span><strong>', impact.change ? (impact.afterOrders == null ? "\u2014" : intf(impact.afterOrders)) : "\u2014", '</strong><small>', impact.change ? ('\u0441 ' + esc(impact.change.date || "") + ', \u0434\u043e: ' + (impact.beforeOrders == null ? "\u2014" : intf(impact.beforeOrders)) + (impact.orderDelta != null ? ', \u0394 ' + esc(signedDailyLabel(impact.orderDelta)) : '')) : '\u0432 \u043f\u0435\u0440\u0438\u043e\u0434\u0435 \u0441\u043c\u0435\u043d\u044b \u0446\u0435\u043d\u044b \u043d\u0435\u0442', '</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0421\u043a\u0438\u0434\u043a\u0430 \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430</span><strong>', pct(row.sellerDiscountPct), '</strong><small>\u0421\u0447\u0438\u0442\u0430\u0435\u043c \u043a\u0430\u043a \u0440\u0430\u0437\u043d\u0438\u0446\u0443 \u043c\u0435\u0436\u0434\u0443 \u0446\u0435\u043d\u043e\u0439 \u0434\u043e \u0441\u043a\u0438\u0434\u043a\u0438 \u0438 \u0446\u0435\u043d\u043e\u0439 \u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430</span><strong>', money(row.currentClientPrice), '</strong><small>', esc(metricHelp("\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0439 \u043a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440.", row.clientPriceFactDate, row.valueDate)), '</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0414\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u0430\u044f \u043c\u0430\u0440\u0436\u0430 3\u043c</span><strong>', pct(row.allowedMarginPct), '</strong><small>\u0411\u0435\u0440\u0435\u043c \u0438\u0437 smart/workbench \u0441\u043b\u043e\u044f \u0431\u0435\u0437 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438 \u043a \u043d\u043e\u043c\u0435\u0440\u0443 \u0441\u0442\u0440\u043e\u043a\u0438.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u043c\u0430\u0440\u0436\u0430</span><strong>', pct(row.marginTotalPct), '</strong><small>\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u043f\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u0438.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c</span><strong>', esc(turnover.value), '</strong><small>', esc(turnover.note), '</small></div>',
      '<div class="pw-mini"><span class="pw-label">Owner</span><strong>', esc(row.owner || "\u2014"), '</strong><small>\u0420\u0443\u0447\u043d\u043e\u0435 \u043f\u043e\u043b\u0435 \u043d\u0435 \u043f\u0435\u0440\u0435\u0442\u0438\u0440\u0430\u0435\u043c.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0421\u0442\u0430\u0442\u0443\u0441 \u0442\u043e\u0432\u0430\u0440\u0430</span><strong>', esc(row.status || "\u2014"), '</strong><small>\u0421\u0442\u0430\u0442\u0443\u0441 \u0441\u0442\u0440\u043e\u043a\u0438 \u043f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u043c\u0443 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0443.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 \u043f\u043e \u043c\u0430\u0440\u0436\u0435</span><strong>', money(row.requiredPriceForMargin), '</strong><small>\u0415\u0441\u043b\u0438 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043f\u0440\u0438\u0435\u0445\u0430\u043b\u043e \u0432 smart-\u0441\u043b\u043e\u0435.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0421\u0440\u0435\u0437 \u0446\u0435\u043d</span><strong>', esc(row.valueDate || state.latestFactDate || "\u2014"), '</strong><small>\u042d\u0442\u043e \u0434\u0430\u0442\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0439 \u0442\u043e\u0447\u043a\u0438 \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0435.</small></div>',
      '</div>',
      '<div class="pw-card">',
      '<div class="pw-label">\u0421\u0442\u0430\u0442\u0443\u0441 \u0442\u043e\u0432\u0430\u0440\u0430</div>',
      '<div class="pw-chip-row"><span class="pw-badge', priceLifecycleBadgeClass(lifecycle), '">', esc(lifecycle.label || row.status || "\u2014"), '</span></div>',
      '<div class="pw-note">\u042d\u0442\u043e\u0442 lifecycle-\u0441\u0442\u0430\u0442\u0443\u0441 \u0441\u0440\u0430\u0437\u0443 \u0438\u0434\u0435\u0442 \u0432 \u0446\u0435\u043d\u044b, \u0440\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440, \u0437\u0430\u043a\u0430\u0437 \u0438 \u0440\u0435\u0435\u0441\u0442\u0440 SKU.</div>',
      renderPriceLifecycleEditor(row, false),
      '</div>',
      '<div class="pw-card">',
      '<div class="pw-label">MIN / MAX</div>',
      '<div class="pw-note">Здесь задаются ручные границы цены по позиции. Эти MIN/MAX сразу участвуют в расчёте репрайсера по этой площадке.</div>',
      '<div class="pw-note">На этой вкладке можно задать ручные границы цены по позиции. Формат такой же, как в шаблоне с вкладки "Цены".</div>',
      bounds && (bounds.corridorMin != null || bounds.corridorMax != null)
        ? '<div class="pw-note">Коридор из Репрайсера: MIN ' + esc(bounds.corridorMin != null ? money(bounds.corridorMin) : "—") + ' · MAX ' + esc(bounds.corridorMax != null ? money(bounds.corridorMax) : "—") + '. Это внутренняя рамка расчета по площадке.</div>'
        : '',
      '<form id="priceMinMaxForm" data-article-key="', esc(row.articleKey), '" data-platform="', esc(row.market), '" style="margin-top:12px">',
      '<div class="pw-grid2">',
      '<label style="display:grid;gap:6px"><span class="pw-label">MIN</span><input type="number" step="1" min="0" name="floorPrice" value="', esc(bounds && bounds.manualMin != null ? bounds.manualMin : ""), '" placeholder="Ручной MIN"></label>',
      '<label style="display:grid;gap:6px"><span class="pw-label">MAX</span><input type="number" step="1" min="0" name="capPrice" value="', esc(bounds && bounds.manualMax != null ? bounds.manualMax : ""), '" placeholder="Ручной MAX"></label>',
      '</div>',
      '<textarea name="note" rows="2" placeholder="Комментарий" style="margin-top:10px;width:100%">', esc(bounds && bounds.override && bounds.override.note || ""), '</textarea>',
      '<div class="pw-note" style="margin-top:8px">Расчетный коридор: MIN ', esc(bounds && bounds.effectiveMin != null ? money(bounds.effectiveMin) : "—"), ' · MAX ', esc(bounds && bounds.effectiveMax != null ? money(bounds.effectiveMax) : "—"), '.</div>',
      '<div class="pw-chip-row" style="margin-top:10px"><button class="pw-chip" type="submit">Сохранить MIN/MAX</button><button class="pw-chip" type="button" data-reset-minmax data-article-key="', esc(row.articleKey), '" data-platform="', esc(row.market), '">Сбросить MIN/MAX</button></div>',
      '</form>',
      '</div>',
      renderProductLeaderboardContext(leaderboardEntry, row.articleKey),
      '<div class="pw-card">',
      '<div class="pw-label">\u041a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u043f\u043e\u0437\u0438\u0446\u0438\u0438</div>',
      '<div class="pw-note">', esc(row.historyNote || "\u0412 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c, \u043e\u0442\u043a\u0443\u0434\u0430 \u0432\u0437\u044f\u043b\u0438 \u0442\u0435\u043a\u0443\u0449\u0443\u044e \u0446\u0435\u043d\u0443, \u043c\u0430\u0440\u0436\u0443 \u0438 \u043e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c."), '</div>',
      renderHistory(row),
      '</div>',
      '</div></div>'
    ].join("");
  }

  function selectedDisplayRow() {
    if (!state.selectedKey) return null;
    var visible = visibleRows().find(function (row) {
      return priceRowMatchesSelection(row, state.selectedKey);
    });
    return visible || buildDisplayRow(findRow(state.selectedKey));
  }

  function openPriceV1ModalByKey(key) {
    var nextKey = String(key || "").trim();
    if (!nextKey) return;
    modalScrollState.pendingOpenY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    state.selectedKey = nextKey;
    document.documentElement.dataset.priceV1LastOpenKey = nextKey;
    renderPriceWorkbench();
    window.requestAnimationFrame(renderSelectedModal);
  }

  function ensurePriceV1GlobalOpenHandler() {
    if (document.documentElement.dataset.priceV1OpenHandler === STYLE_VERSION) return;
    if (window.__priceV1OpenHandler) {
      document.removeEventListener("click", window.__priceV1OpenHandler, true);
    }
    window.__openPriceV1Modal = openPriceV1ModalByKey;
    window.__priceV1OpenHandler = function (event) {
      var target = event && event.target;
      var button = target && target.closest ? target.closest("[data-price-v1-open-detail]") : null;
      var root = document.getElementById(VIEW_ID);
      if (!button || !root || !root.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      openPriceV1ModalByKey(button.getAttribute("data-price-v1-open-detail") || "");
    };
    document.addEventListener("click", window.__priceV1OpenHandler, true);
    document.documentElement.dataset.priceV1OpenHandler = STYLE_VERSION;
  }

  function lockModalBackgroundScroll(preferredY) {
    if (document.body.getAttribute("data-pw-scroll-lock") === "1") return;
    var resolvedY = Number(preferredY);
    if (!Number.isFinite(resolvedY)) {
      resolvedY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    }
    modalScrollState.savedY = resolvedY;
    modalScrollState.savedOverflow = document.body.style.overflow || "";
    modalScrollState.savedHtmlOverflow = document.documentElement.style.overflow || "";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.setAttribute("data-pw-scroll-lock", "1");
  }

  function unlockModalBackgroundScroll() {
    if (document.body.getAttribute("data-pw-scroll-lock") !== "1") return;
    document.body.removeAttribute("data-pw-scroll-lock");
    document.body.style.overflow = modalScrollState.savedOverflow || "";
    document.documentElement.style.overflow = modalScrollState.savedHtmlOverflow || "";
    window.scrollTo({ top: Number(modalScrollState.savedY) || 0, left: 0, behavior: "auto" });
  }

  function centerPriceModal() {
    var modal = document.getElementById("priceSimpleModal");
    if (!modal || !state.selectedKey) return;
    var box = modal.querySelector(".pw-modal-box");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    if (box) {
      box.setAttribute("tabindex", "-1");
      box.scrollTop = 0;
    }
    window.requestAnimationFrame(function () {
      if (!document.body.contains(modal)) return;
      try {
        modal.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      } catch (error) {
        window.scrollTo({ top: Number(modalScrollState.savedY) || 0, left: 0, behavior: "auto" });
      }
      if (box) {
        try {
          box.focus({ preventScroll: true });
        } catch (error) {
          box.focus();
        }
      }
    });
  }

  function closePriceModal() {
    state.selectedKey = "";
    renderSelectedModal();
    unlockModalBackgroundScroll();
  }

  function attachModalHandlers() {
    var modal = document.getElementById("priceSimpleModal");
    if (!modal) return;
    attachPriceLifecycleForms(modal);
    modal.addEventListener("click", function (event) {
      var leaderboardButton = event.target.closest("[data-open-product-leaderboard]");
      if (leaderboardButton) {
        event.preventDefault();
        event.stopPropagation();
        openProductLeaderboard(leaderboardButton.getAttribute("data-open-product-leaderboard"));
        return;
      }
      if (event.target === modal || event.target.closest("[data-close-price-modal]")) {
        closePriceModal();
      }
    });
    var minMaxForm = modal.querySelector("#priceMinMaxForm");
    if (minMaxForm) {
      minMaxForm.addEventListener("submit", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var articleKey = minMaxForm.getAttribute("data-article-key") || "";
        var platform = minMaxForm.getAttribute("data-platform") || "";
        upsertMinMaxOverride(articleKey, platform, {
          floorPrice: moneyRound(num(minMaxForm.querySelector('[name=\"floorPrice\"]') && minMaxForm.querySelector('[name=\"floorPrice\"]').value)),
          capPrice: moneyRound(num(minMaxForm.querySelector('[name=\"capPrice\"]') && minMaxForm.querySelector('[name=\"capPrice\"]').value)),
          note: String(minMaxForm.querySelector('[name=\"note\"]') && minMaxForm.querySelector('[name=\"note\"]').value || "").trim()
        });
        renderPriceWorkbench();
        renderSelectedModal();
      });
    }
    modal.querySelectorAll("[data-reset-minmax]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        upsertMinMaxOverride(button.getAttribute("data-article-key") || "", button.getAttribute("data-platform") || "", {
          floorPrice: null,
          capPrice: null,
          note: ""
        });
        renderPriceWorkbench();
        renderSelectedModal();
      });
    });
  }

  function renderSelectedModal() {
    var host = document.getElementById("priceSimpleModalHost");
    if (!host) return;
    var pending = Number(modalScrollState.pendingOpenY);
    var scrollBeforeRender = Number.isFinite(pending)
      ? pending
      : (window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0);
    modalScrollState.pendingOpenY = null;
    host.innerHTML = renderModal(selectedDisplayRow());
    attachModalHandlers();
    if (state.selectedKey) {
      lockModalBackgroundScroll(scrollBeforeRender);
      centerPriceModal();
    } else {
      unlockModalBackgroundScroll();
    }
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

  function priceMinMaxTemplateRows(rows) {
    return sortedVisiblePriceRows(rows)
      .filter(function (row) {
        var market = repricerMarket(row && row.market);
        return market === "wb" || market === "ozon";
      })
      .map(function (row) {
        var displayRow = buildDisplayRow(row);
        var bounds = displayRow.repricerBounds || {};
        var minValue = bounds.manualMin != null ? bounds.manualMin : bounds.effectiveMin;
        var maxValue = bounds.manualMax != null ? bounds.manualMax : bounds.effectiveMax;
        return {
          article_key: displayRow.articleKey || "",
          article: displayRow.article || "",
          name: displayRow.name || "",
          marketplace: String((displayRow.market || "")).toUpperCase(),
          owner: displayRow.owner || "",
          status: displayRow.status || "",
          current_price_mp: moneyRound(displayRow.currentFillPrice),
          current_min_price: moneyRound(bounds.effectiveMin),
          current_max_price: moneyRound(bounds.effectiveMax),
          min_price: moneyRound(minValue),
          max_price: moneyRound(maxValue),
          repricer_price: moneyRound(displayRow.repricerDisplay && displayRow.repricerDisplay.price),
          note: bounds.override && bounds.override.note || ""
        };
      });
  }

  function downloadPriceMinMaxTemplate(rows) {
    var templateRows = priceMinMaxTemplateRows(rows);
    if (!templateRows.length) {
      window.alert("По текущим фильтрам нет строк WB/Ozon для шаблона MIN/MAX.");
      return;
    }
    downloadPriceDelimitedFile([
      ["article_key", "article_key"],
      ["article", "Артикул"],
      ["name", "Название"],
      ["marketplace", "Площадка"],
      ["owner", "owner"],
      ["status", "status"],
      ["current_price_mp", "current_price_mp"],
      ["current_min_price", "current_min_price"],
      ["current_max_price", "current_max_price"],
      ["min_price", "min_price"],
      ["max_price", "max_price"],
      ["repricer_price", "repricer_price"],
      ["note", "note"]
    ], templateRows, "prices-minmax-template-" + priceExportScope() + ".tsv", "\t");
  }

  function normalizeImportHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-zа-я0-9_]+/gi, "_");
  }

  function parseHtmlTableText(text) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, "text/html");
    return Array.prototype.map.call(doc.querySelectorAll("tr"), function (row) {
      return Array.prototype.map.call(row.querySelectorAll("th,td"), function (cell) {
        return String(cell.textContent || "").trim();
      });
    }).filter(function (row) { return row.some(function (value) { return value; }); });
  }

  function parseDelimitedText(text) {
    var lines = String(text || "").replace(/\r/g, "").split("\n").filter(function (line) { return String(line).trim(); });
    var delimiter = "\t";
    var first = lines[0] || "";
    if (first.indexOf("\t") === -1) delimiter = first.indexOf(";") >= 0 ? ";" : ",";
    return lines.map(function (line) {
      return line.split(delimiter).map(function (part) {
        return String(part || "").trim().replace(/^"(.*)"$/, "$1");
      });
    });
  }

  function parsePriceMinMaxRows(text) {
    var matrix = /<table[\s>]/i.test(text) ? parseHtmlTableText(text) : parseDelimitedText(text);
    if (!matrix.length) return [];
    var headers = matrix[0].map(normalizeImportHeader);
    var findColumn = function () {
      for (var index = 0; index < arguments.length; index += 1) {
        var wanted = arguments[index];
        var found = headers.indexOf(wanted);
        if (found >= 0) return found;
      }
      return -1;
    };
    var articleIndex = findColumn("article_key", "articlekey", "sku", "sku_code", "article");
    var marketIndex = findColumn("marketplace", "platform", "market");
    var minIndex = findColumn("min_price", "min", "floor_price");
    var maxIndex = findColumn("max_price", "max", "cap_price");
    var noteIndex = findColumn("note", "comment");
    if (articleIndex < 0 || marketIndex < 0 || (minIndex < 0 && maxIndex < 0)) return [];

    return matrix.slice(1).map(function (row) {
      var market = repricerMarket(row[marketIndex]);
      return {
        articleKey: String(row[articleIndex] || "").trim(),
        platform: market,
        minPrice: moneyRound(num(minIndex >= 0 ? row[minIndex] : null)),
        maxPrice: moneyRound(num(maxIndex >= 0 ? row[maxIndex] : null)),
        note: String(noteIndex >= 0 ? row[noteIndex] || "" : "").trim()
      };
    }).filter(function (row) {
      return row.articleKey && (row.platform === "wb" || row.platform === "ozon");
    });
  }

  function importPriceMinMaxFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsedRows = parsePriceMinMaxRows(String(reader.result || ""));
        if (!parsedRows.length) {
          window.alert("Не удалось распознать строки MIN/MAX. Используйте шаблон с этой вкладки.");
          return;
        }
        var applied = 0;
        var queued = 0;
        parsedRows.forEach(function (row) {
          if (row.minPrice == null && row.maxPrice == null && !row.note) return;
          var task = upsertMinMaxOverride(row.articleKey, row.platform, {
            floorPrice: row.minPrice,
            capPrice: row.maxPrice,
            note: row.note
          });
          applied += 1;
          if (task) queued += 1;
        });
        renderPriceWorkbench();
        if (state.selectedKey) renderSelectedModal();
        window.alert("MIN/MAX загружены: " + applied + " строк. API-задачи MIN/MAX: " + queued + ".");
      } catch (error) {
        console.error("[price-simple] min/max import", error);
        window.alert("Не удалось загрузить файл MIN/MAX.");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function buildFilterOptions() {
    var owners = Object.create(null);
    var statuses = Object.create(null);
    var activeMarket = canonicalPriceMarket(state.market || "all");
    state.rows.forEach(function (rawRow) {
      var row = buildDisplayRow(rawRow);
      var rowMarket = canonicalPriceMarket(row && row.market);
      if (activeMarket !== "all" && rowMarket !== activeMarket) return;
      var ownerLabel = String(row.owner || "").trim();
      var ownerKey = norm(ownerLabel);
      if (ownerLabel && ownerKey && !owners[ownerKey]) owners[ownerKey] = ownerLabel;
      var lifecycle = priceProductLifecycleForRow(row);
      var statusLabel = String(lifecycle && (lifecycle.label || lifecycle.status) || row.status || "").trim();
      var statusKey = norm(statusLabel);
      if (statusLabel && statusKey && !statuses[statusKey]) statuses[statusKey] = statusLabel;
    });
    return {
      owners: Object.keys(owners).sort(function (left, right) {
        return String(owners[left] || "").localeCompare(String(owners[right] || ""), "ru", { sensitivity: "base" });
      }).map(function (key) { return { value: key, label: owners[key] }; }),
      statuses: Object.keys(statuses).sort(function (left, right) {
        return String(statuses[left] || "").localeCompare(String(statuses[right] || ""), "ru", { sensitivity: "base" });
      }).map(function (key) { return { value: key, label: statuses[key] }; })
    };
  }

  var priceV1SearchTimer = null;

  function priceV1NormalizeMarket(value) {
    var key = canonicalPriceMarket(value);
    if (key === "ya") key = "ym";
    return PRICE_MARKETS.indexOf(key) >= 0 ? key : "all";
  }

  function priceV1ReadGlobalMarket(fallback) {
    var candidates = [
      document.documentElement && (document.documentElement.dataset.marketplace || document.documentElement.dataset.platform),
      document.body && (document.body.dataset.marketplace || document.body.dataset.platform)
    ];
    try {
      candidates.push(localStorage.getItem("altea.portal.marketplace"));
    } catch {}
    var root = rootState();
    if (root && root.filters) {
      candidates.push(root.filters.market);
      candidates.push(root.filters.platform);
    }
    candidates.push(fallback || "all");
    for (var index = 0; index < candidates.length; index += 1) {
      var raw = candidates[index];
      if (raw == null || String(raw).trim() === "") continue;
      var normalized = priceV1NormalizeMarket(raw);
      if (normalized !== "all" || String(raw).trim().toLowerCase() === "all") return normalized;
    }
    return "all";
  }

  function priceV1InvalidateRows() {
    derived.visibleRows.rowsRef = null;
    derived.visibleRows.value = null;
    derived.stats.rowsRef = null;
    derived.stats.value = null;
    derived.table.rowsRef = null;
    derived.table.value = null;
  }

  function priceV1SyncGlobalMarket(explicit) {
    var market = priceV1ReadGlobalMarket(explicit || state.market || "all");
    if (state.availableMarkets && state.availableMarkets.length && state.availableMarkets.indexOf(market) < 0) {
      market = "all";
    }
    if (state.market !== market) {
      state.market = market;
      if (state.loaded) {
        var scopedRows = state.rows.filter(function (row) {
          return market === "all" || row.market === market;
        });
        var marketAnchor = latestPriceFactDate(scopedRows) || latestDate(scopedRows);
        if (marketAnchor) {
          state.dateTo = marketAnchor;
          state.dateFrom = shiftDate(marketAnchor, -6);
        }
      }
      priceV1InvalidateRows();
    }
    return market;
  }

  function priceV1AdvancedFilters() {
    state.priceAdvancedFiltersV1 = state.priceAdvancedFiltersV1 || {};
    return state.priceAdvancedFiltersV1;
  }

  function priceV1AdvancedDefinitions() {
    return [
      { key: "priceChanged", label: "Цена менялась", group: "Эффект цены" },
      { key: "ordersDropped", label: "Заказы упали", group: "Эффект цены" },
      { key: "minMaxRisk", label: "MIN/MAX риск", group: "Коридор" },
      { key: "belowMargin", label: "Маржа ниже нормы", group: "Экономика" },
      { key: "stalePrice", label: "Цена устарела", group: "Качество данных" },
      { key: "missingPrice", label: "Нет цены", group: "Качество данных" },
      { key: "missingBounds", label: "Нет MIN/MAX", group: "Качество данных" },
      { key: "missingMargin", label: "Нет маржи", group: "Качество данных" },
      { key: "noDailyFact", label: "Нет daily-факта", group: "Качество данных" },
      { key: "noOwner", label: "Без owner", group: "Качество данных" }
    ];
  }

  function priceV1AdvancedCount() {
    var advanced = priceV1AdvancedFilters();
    return priceV1AdvancedDefinitions().filter(function (item) { return advanced[item.key]; }).length;
  }

  function priceV1Rows(baseRows) {
    var advanced = priceV1AdvancedFilters();
    if (!priceV1AdvancedCount()) return baseRows;
    return baseRows.filter(function (row) {
      var impact = row.priceImpact || rowPriceImpact(row);
      if (advanced.priceChanged && !(impact && impact.change)) return false;
      if (advanced.ordersDropped && !(impact && Number(impact.orderDelta) < 0)) return false;
      if (advanced.minMaxRisk && !priceBoundaryState(row)) return false;
      if (advanced.belowMargin && !(row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct)) return false;
      if (advanced.stalePrice && !(priceFactLagDays(row) != null && priceFactLagDays(row) > 2)) return false;
      if (advanced.missingPrice && positiveNum(row && row.currentFillPrice) != null) return false;
      if (advanced.missingBounds && priceCorridorState(row).label !== "MIN/MAX \u043d\u0435 \u0437\u0430\u0434\u0430\u043d") return false;
      if (advanced.missingMargin && num(row && row.marginTotalPct) != null) return false;
      if (advanced.noDailyFact && priceHasDailyFact(row)) return false;
      if (advanced.noOwner && String(row.owner || "").trim() && row.owner !== "\u2014") return false;
      return true;
    });
  }

  function priceV1RowMatchesQuick(row, key) {
    var impact = row.priceImpact || rowPriceImpact(row);
    if (key === "priceChanged") return Boolean(impact && impact.change);
    if (key === "ordersDropped") return Boolean(impact && Number(impact.orderDelta) < 0);
    if (key === "minMaxRisk") return Boolean(priceBoundaryState(row));
    if (key === "belowMargin") return Boolean(row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct);
    if (key === "stalePrice") return Boolean(priceFactLagDays(row) != null && priceFactLagDays(row) > 2);
    if (key === "missingPrice") return positiveNum(row && row.currentFillPrice) == null;
    if (key === "missingBounds") return priceCorridorState(row).label === "MIN/MAX \u043d\u0435 \u0437\u0430\u0434\u0430\u043d";
    if (key === "missingMargin") return num(row && row.marginTotalPct) == null;
    if (key === "noDailyFact") return !priceHasDailyFact(row);
    if (key === "noOwner") return !(String(row.owner || "").trim() && row.owner !== "\u2014");
    return false;
  }

  function priceV1QuickFilters(baseRows) {
    var advanced = priceV1AdvancedFilters();
    var items = [
      { key: "priceChanged", label: "Цена менялась" },
      { key: "ordersDropped", label: "Заказы просели" },
      { key: "belowMargin", label: "Маржа ниже нормы" },
      { key: "minMaxRisk", label: "MIN/MAX риск" },
      { key: "stalePrice", label: "Цена устарела" },
      { key: "missingPrice", label: "Нет цены" },
      { key: "noDailyFact", label: "Нет daily" }
    ];
    var buttons = items.map(function (item) {
      var count = baseRows.filter(function (row) { return priceV1RowMatchesQuick(row, item.key); }).length;
      return '<button type="button" class="' + (advanced[item.key] ? 'is-active' : '') + '" data-price-v1-saved="' + esc(item.key) + '">' + esc(item.label) + ' · ' + intf(count) + '</button>';
    }).join("");
    return [
      '<div class="prices-v1-quick">',
      '<span>Быстрые фильтры</span>',
      buttons,
      priceV1AdvancedCount() ? '<button type="button" class="is-reset" data-price-v1-clear="advanced">Сбросить быстрый фильтр</button>' : '',
      '</div>'
    ].join("");
  }

  function priceV1SortLabel(value) {
    var labels = {
      risk: "Риски первыми",
      orders: "Заказы",
      revenue: "Выручка",
      price_change: "Эффект цены",
      margin: "Маржа",
      turnover: "Оборачиваемость",
      article: "Артикул",
      owner: "Owner",
      status: "Статус товара"
    };
    return labels[value] || value || "Сортировка";
  }

  function priceV1StatusLabel(value) {
    if (!value || value === "all") return "Все статусы";
    return value;
  }

  function priceV1ActiveChips(summary) {
    var chips = [];
    chips.push({ key: "market", label: priceMarketLabel(state.market || "all") });
    if (state.dateFrom || state.dateTo) chips.push({ key: "period", label: (state.dateFrom || "\u2014") + " - " + (state.dateTo || "\u2014") });
    if (state.ownerFilter && state.ownerFilter !== "all") chips.push({ key: "owner", label: "Owner: " + state.ownerFilter });
    if (state.statusFilter && state.statusFilter !== "all") chips.push({ key: "status", label: priceV1StatusLabel(state.statusFilter) });
    if (state.sortBy && state.sortBy !== "orders") chips.push({ key: "sort", label: priceV1SortLabel(state.sortBy) });
    var advanced = priceV1AdvancedFilters();
    priceV1AdvancedDefinitions().forEach(function (item) {
      if (advanced[item.key]) chips.push({ key: "adv:" + item.key, label: item.label });
    });
    chips.push({ key: "summary", label: intf(summary && summary.count) + " SKU" });
    return '<div class="prices-v1-chips">' + chips.map(function (chip) {
      var removable = chip.key !== "market" && chip.key !== "summary";
      return '<button type="button" class="' + (removable ? "" : "is-static") + '" ' + (removable ? 'data-price-v1-clear="' + esc(chip.key) + '"' : 'tabindex="-1"') + '>' + esc(chip.label) + (removable ? ' <span>\u00d7</span>' : '') + '</button>';
    }).join("") + '</div>';
  }

  function priceV1OrdersPerDay(total, daysCount) {
    if (total == null || !Number.isFinite(Number(total)) || !daysCount) return "\u2014";
    return formatOrdersPerDay(Number(total) / Math.max(1, Number(daysCount)));
  }

  function priceV1EffectPct(impact) {
    if (!impact) return null;
    var before = num(impact.beforeOrdersPerDay);
    var after = num(impact.afterOrdersPerDay);
    if (before == null && impact.beforeOrders != null && impact.beforeDays > 0) before = Number(impact.beforeOrders) / Number(impact.beforeDays);
    if (after == null && impact.afterOrders != null && impact.afterDays > 0) after = Number(impact.afterOrders) / Number(impact.afterDays);
    if (before == null || after == null || before <= 0) return null;
    return (after / before) - 1;
  }

  function priceChartUi() {
    state.chartUi = Object.assign({
      selectedDate: "",
      marginMetric: "pct",
      skuChartFocus: "fact",
      hiddenSeries: {}
    }, state.chartUi || {});
    state.chartUi.hiddenSeries = Object.assign({}, state.chartUi.hiddenSeries || {});
    return state.chartUi;
  }

  function priceShortDate(value) {
    var key = isoDate(value);
    if (!key) return "";
    return key.slice(8, 10) + "." + key.slice(5, 7);
  }

  function priceRatio(value) {
    var parsed = num(value);
    if (parsed == null) return null;
    return Math.abs(parsed) > 3 ? parsed / 100 : parsed;
  }

  function priceFirstNum(source, keys) {
    for (var index = 0; index < keys.length; index += 1) {
      var value = num(source && source[keys[index]]);
      if (value != null) return value;
    }
    return null;
  }

  function priceRangeDays(from, to) {
    var start = isoDate(from);
    var end = isoDate(to);
    if (!start || !end) return [];
    var total = Math.max(0, diffDays(start, end));
    var daysList = [];
    for (var index = 0; index <= total; index += 1) {
      daysList.push(shiftDate(start, index));
    }
    return daysList;
  }

  function priceCurrentRange() {
    var end = isoDate(state.dateTo || state.latestTimelineDate || state.latestFactDate || todayKey());
    var start = isoDate(state.dateFrom || (end ? shiftDate(end, -6) : ""));
    if (!start || !end) return { start: "", end: "", days: [] };
    if (start > end) {
      var swap = start;
      start = end;
      end = swap;
    }
    return { start: start, end: end, days: priceRangeDays(start, end) };
  }

  function pricePreviousRange(current) {
    var daysCount = current && current.days ? current.days.length : 0;
    if (!daysCount || !current.start) return { start: "", end: "", days: [] };
    var end = shiftDate(current.start, -1);
    var start = shiftDate(end, -(daysCount - 1));
    return { start: start, end: end, days: priceRangeDays(start, end) };
  }

  function priceAllHistoryItems(row) {
    var items = (row && row.timeline || []).filter(function (item) {
      return item && isoDate(item.date);
    }).slice();
    var priceFactDate = isoDate(row && row.priceFactDate);
    var currentSnapshotDate = isoDate(row && row.currentPriceDate);
    var snapshotDate = priceFactDate;
    if (currentSnapshotDate && (!snapshotDate || currentSnapshotDate > snapshotDate)) snapshotDate = currentSnapshotDate;
    var snapshotPrice = num(row && row.currentFillPrice);
    if (snapshotDate && snapshotPrice != null) {
      var lastDate = items.length ? isoDate(items[items.length - 1] && items[items.length - 1].date) : "";
      if (!lastDate || snapshotDate > lastDate) {
        items.push({
          date: snapshotDate,
          price: snapshotPrice,
          clientPrice: row.clientPriceFactDate === snapshotDate ? num(row.currentClientPrice) : null,
          sppPct: row.sppFactDate === snapshotDate ? num(row.currentSppPct) : null,
          turnoverDays: row.turnoverFactDate === snapshotDate ? num(row.turnoverDays) : null,
          ordersUnits: null,
          deliveredUnits: null,
          revenue: null
        });
      }
    }
    return items.sort(function (left, right) {
      return String(left.date || "").localeCompare(String(right.date || ""));
    });
  }

  function priceItemByDate(row, date) {
    var wanted = isoDate(date);
    if (!wanted) return null;
    var items = priceAllHistoryItems(row);
    for (var index = 0; index < items.length; index += 1) {
      if (isoDate(items[index] && items[index].date) === wanted) return items[index];
    }
    return null;
  }

  function priceHasRangeFact(row, range) {
    var daysList = range && range.days || [];
    for (var index = 0; index < daysList.length; index += 1) {
      var item = priceItemByDate(row, daysList[index]);
      if (!item) continue;
      if (num(item.revenue) != null || num(item.ordersUnits) != null || num(item.deliveredUnits) != null || num(item.price) != null) return true;
    }
    return false;
  }

  function priceComparableRows(rows, current, previous) {
    return (rows || []).filter(function (row) {
      return row && row.market && row.articleKey && priceHasRangeFact(row, current) && priceHasRangeFact(row, previous);
    });
  }

  function priceAverageCheckContribution(item) {
    if (!item) return null;
    var revenue = num(item.revenue);
    var delivered = num(item.deliveredUnits);
    var orders = num(item.ordersUnits);
    var price = roundedHistoryPrice(item);
    if (revenue != null && delivered != null && delivered > 0) {
      return { value: revenue, weight: delivered, base: "\u043f\u043e \u0432\u044b\u043a\u0443\u043f\u0430\u043c" };
    }
    if (revenue != null && orders != null && orders > 0) {
      return { value: revenue, weight: orders, base: "\u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0430\u043c" };
    }
    if (price != null && delivered != null && delivered > 0) {
      return { value: price * delivered, weight: delivered, base: "\u0432\u0437\u0432\u0435\u0448\u0435\u043d\u043d\u0430\u044f \u0446\u0435\u043d\u0430" };
    }
    if (price != null && orders != null && orders > 0) {
      return { value: price * orders, weight: orders, base: "\u0432\u0437\u0432\u0435\u0448\u0435\u043d\u043d\u0430\u044f \u0446\u0435\u043d\u0430" };
    }
    return null;
  }

  function priceMarginContribution(item) {
    if (!item) return null;
    var revenue = priceFirstNum(item, ["marginRevenue", "revenue"]);
    var quantity = priceFirstNum(item, ["deliveredUnits", "ordersUnits", "quantity", "qty"]);
    var marginRub = priceFirstNum(item, ["marginRub", "grossMarginRub", "profitRub", "profit", "marginValue"]);
    var marginPct = priceRatio(priceFirstNum(item, ["marginPct", "grossMarginPct", "marginTotalPct", "profitabilityPct"]));
    if (marginRub != null && revenue != null && Math.abs(revenue) > 0) {
      return { rub: marginRub, revenue: revenue, pctWeight: Math.abs(revenue), pctValue: marginRub / revenue, quality: "daily" };
    }
    if (marginPct != null && revenue != null && Math.abs(revenue) > 0) {
      return { rub: revenue * marginPct, revenue: revenue, pctWeight: Math.abs(revenue), pctValue: marginPct, quality: "derived" };
    }
    if (marginPct != null && quantity != null && quantity > 0) {
      return { rub: null, revenue: null, pctWeight: quantity, pctValue: marginPct, quality: "daily" };
    }
    return null;
  }

  function priceAggregateAverage(rows, dates) {
    var points = (dates || []).map(function (date) {
      var acc = { date: date, value: 0, weight: 0, sku: 0, bases: Object.create(null) };
      (rows || []).forEach(function (row) {
        var contribution = priceAverageCheckContribution(priceItemByDate(row, date));
        if (!contribution) return;
        acc.value += contribution.value;
        acc.weight += contribution.weight;
        acc.sku += 1;
        acc.bases[contribution.base] = (acc.bases[contribution.base] || 0) + 1;
      });
      var base = Object.keys(acc.bases).sort(function (left, right) {
        return acc.bases[right] - acc.bases[left];
      })[0] || "";
      return {
        date: date,
        value: acc.weight > 0 ? acc.value / acc.weight : null,
        weight: acc.weight,
        sku: acc.sku,
        base: base
      };
    });
    return points;
  }

  function priceAggregateMargin(rows, dates) {
    return (dates || []).map(function (date) {
      var rub = 0;
      var rubFound = false;
      var revenue = 0;
      var pctValue = 0;
      var pctWeight = 0;
      var sku = 0;
      var quality = "";
      (rows || []).forEach(function (row) {
        var contribution = priceMarginContribution(priceItemByDate(row, date));
        if (!contribution) return;
        sku += 1;
        if (contribution.rub != null) {
          rub += contribution.rub;
          rubFound = true;
        }
        if (contribution.revenue != null) revenue += contribution.revenue;
        if (contribution.pctValue != null && contribution.pctWeight > 0) {
          pctValue += contribution.pctValue * contribution.pctWeight;
          pctWeight += contribution.pctWeight;
        }
        if (!quality || contribution.quality === "daily") quality = contribution.quality;
      });
      return {
        date: date,
        pct: pctWeight > 0 ? pctValue / pctWeight : null,
        rub: rubFound ? rub : null,
        revenue: revenue || null,
        sku: sku,
        quality: quality || "missing"
      };
    });
  }

  function priceWeightedMargin(rows) {
    var value = 0;
    var weight = 0;
    var rub = 0;
    var rubFound = false;
    (rows || []).forEach(function (row) {
      var impact = row.priceImpact || rowPriceImpact(row);
      var revenue = num(impact && impact.revenue);
      var marginPct = priceRatio(row && row.marginTotalPct);
      var qty = num(impact && (impact.deliveredUnits != null ? impact.deliveredUnits : impact.ordersUnits));
      var rowWeight = revenue != null && revenue > 0 ? revenue : (qty != null && qty > 0 ? qty : 0);
      if (marginPct != null && rowWeight > 0) {
        value += marginPct * rowWeight;
        weight += rowWeight;
      }
      if (marginPct != null && revenue != null && revenue > 0) {
        rub += revenue * marginPct;
        rubFound = true;
      }
    });
    return { pct: weight > 0 ? value / weight : null, rub: rubFound ? rub : null };
  }

  function priceSeriesAverage(points, key) {
    var total = 0;
    var count = 0;
    (points || []).forEach(function (point) {
      var value = num(point && point[key]);
      if (value == null) return;
      total += value;
      count += 1;
    });
    return count ? total / count : null;
  }

  function priceValueDelta(current, previous) {
    if (current == null || previous == null || !Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) {
      return { rub: null, pct: null };
    }
    var delta = Number(current) - Number(previous);
    return { rub: delta, pct: previous !== 0 ? delta / Math.abs(Number(previous)) : null };
  }

  function buildPriceOverviewModel(rows, summary) {
    var current = priceCurrentRange();
    var previous = pricePreviousRange(current);
    var comparable = priceComparableRows(rows, current, previous);
    var currentAverage = priceAggregateAverage(comparable, current.days);
    var previousAverage = priceAggregateAverage(comparable, previous.days).map(function (point, index) {
      return Object.assign({}, point, { compareDate: point.date, date: current.days[index] || point.date });
    });
    var currentMargin = priceAggregateMargin(rows, current.days);
    var previousMargin = priceAggregateMargin(rows, previous.days).map(function (point, index) {
      return Object.assign({}, point, { compareDate: point.date, date: current.days[index] || point.date });
    });
    var avgCurrent = priceSeriesAverage(currentAverage, "value");
    var avgPrevious = priceSeriesAverage(previousAverage, "value");
    var marginWeighted = priceWeightedMargin(rows);
    var risky = rows.filter(function (row) { return priceBoundaryState(row); });
    var belowMargin = rows.filter(function (row) {
      return row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct;
    });
    var bestPrice = rows.map(function (row) {
      var impact = row.priceImpact || rowPriceImpact(row);
      return { row: row, delta: impact && impact.orderDelta != null ? Number(impact.orderDelta) : null };
    }).filter(function (item) { return item.delta != null; }).sort(function (left, right) {
      return right.delta - left.delta;
    })[0] || null;
    return {
      rows: rows || [],
      summary: summary || {},
      currentRange: current,
      previousRange: previous,
      comparableRows: comparable,
      averageCurrent: currentAverage,
      averagePrevious: previousAverage,
      averageValue: avgCurrent,
      averagePreviousValue: avgPrevious,
      averageDelta: priceValueDelta(avgCurrent, avgPrevious),
      marginCurrent: currentMargin,
      marginPrevious: previousMargin,
      marginWeighted: marginWeighted,
      riskRows: risky,
      belowMarginRows: belowMargin,
      bestPriceRow: bestPrice
    };
  }

  function priceChartDomain(values, fallbackMin, fallbackMax) {
    var filtered = (values || []).filter(function (value) {
      return value != null && Number.isFinite(Number(value));
    }).map(Number);
    if (!filtered.length) return { min: fallbackMin || 0, max: fallbackMax || 1 };
    var minValue = Math.min.apply(null, filtered);
    var maxValue = Math.max.apply(null, filtered);
    if (minValue === maxValue) {
      var padSingle = Math.max(1, Math.abs(maxValue) * 0.08);
      return { min: minValue - padSingle, max: maxValue + padSingle };
    }
    var pad = (maxValue - minValue) * 0.12;
    return { min: minValue - pad, max: maxValue + pad };
  }

  function priceScaleY(value, domain, top, height) {
    var parsed = num(value);
    if (parsed == null || !domain || domain.max === domain.min) return null;
    return top + height - ((parsed - domain.min) / (domain.max - domain.min)) * height;
  }

  function priceLinePoints(points, key, xFn, yFn) {
    return (points || []).map(function (point, index) {
      var y = yFn(point && point[key]);
      if (y == null) return "";
      return xFn(index).toFixed(1) + "," + y.toFixed(1);
    }).filter(Boolean).join(" ");
  }

  function priceAreaPoints(points, key, xFn, yFn, baseY) {
    var line = (points || []).map(function (point, index) {
      var y = yFn(point && point[key]);
      if (y == null) return "";
      return xFn(index).toFixed(1) + "," + y.toFixed(1);
    }).filter(Boolean);
    if (line.length < 2) return "";
    return line[0].split(",")[0] + "," + baseY.toFixed(1) + " " + line.join(" ") + " " + line[line.length - 1].split(",")[0] + "," + baseY.toFixed(1);
  }

  function priceAxisLabels(domain, formatter) {
    var max = formatter(domain.max);
    var mid = formatter((domain.max + domain.min) / 2);
    var min = formatter(domain.min);
    return { max: max, mid: mid, min: min };
  }

  function priceRenderKpiButton(config) {
    return [
      '<button type="button" class="prices-v1-kpi-button" ', config.action || '', '>',
      '<span>', esc(config.label), '</span>',
      '<strong>', esc(config.value), '</strong>',
      '<em class="', config.deltaTone || '', '">', esc(config.delta || config.note || ""), '</em>',
      '<i style="--kpi-progress:', Math.max(0, Math.min(100, Number(config.progress) || 0)).toFixed(1), '%"></i>',
      '</button>'
    ].join("");
  }

  function renderPriceKpis(model) {
    var summary = model.summary || {};
    var marginPct = model.marginWeighted && model.marginWeighted.pct;
    var avgDelta = model.averageDelta || {};
    var cards = [
      {
        label: "\u0421\u0440\u0435\u0434\u043d\u0438\u0439 \u0447\u0435\u043a LFL",
        value: money(model.averageValue),
        delta: avgDelta.rub == null ? "\u043d\u0435\u0442 \u0441\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u044f" : signedMoneyLabel(avgDelta.rub),
        deltaTone: avgDelta.rub == null ? "" : deltaTone(avgDelta.rub),
        progress: model.comparableRows.length ? 78 : 12,
        action: 'data-price-v1-scroll="price-overview"'
      },
      {
        label: "\u041c\u0430\u0440\u0436\u0430",
        value: pct(marginPct),
        delta: model.marginWeighted && model.marginWeighted.rub != null ? money(model.marginWeighted.rub) : "\u0432\u0437\u0432\u0435\u0448\u0435\u043d\u043d\u0430\u044f",
        deltaTone: marginPct != null && marginPct < 0.25 ? "down" : "up",
        progress: marginPct == null ? 0 : marginPct * 100,
        action: 'data-price-v1-saved="belowMargin"'
      },
      {
        label: "\u0412\u044b\u0440\u0443\u0447\u043a\u0430",
        value: money(summary.revenue),
        delta: summary.ordersUnits == null ? "\u043d\u0435\u0442 \u0432\u0435\u0441\u0430" : intf(summary.ordersUnits) + " \u0437\u0430\u043a.",
        progress: 86,
        action: 'data-price-v1-scroll="price-table"'
      },
      {
        label: "SKU \u0432 \u0440\u0438\u0441\u043a\u0435",
        value: intf(model.belowMarginRows.length),
        delta: "\u043c\u0430\u0440\u0436\u0430 \u043d\u0438\u0436\u0435 \u043d\u043e\u0440\u043c\u044b",
        deltaTone: model.belowMarginRows.length ? "down" : "up",
        progress: summary.count ? model.belowMarginRows.length / summary.count * 100 : 0,
        action: 'data-price-v1-saved="belowMargin"'
      },
      {
        label: "\u0426\u0435\u043d\u0430 \u0432\u043d\u0435 \u043a\u043e\u0440\u0438\u0434\u043e\u0440\u0430",
        value: intf(model.riskRows.length),
        delta: summary.minMaxDanger ? intf(summary.minMaxDanger) + " \u043d\u0438\u0436\u0435 MIN" : "MIN/MAX",
        deltaTone: model.riskRows.length ? "down" : "up",
        progress: summary.count ? model.riskRows.length / summary.count * 100 : 0,
        action: 'data-price-v1-saved="minMaxRisk"'
      }
    ];
    return '<div class="prices-v1-kpis">' + cards.map(priceRenderKpiButton).join("") + '</div>';
  }

  function priceV1TopSkuPanel(model) {
    var rows = model.rows || [];
    if (!rows.length) return "";
    var used = Object.create(null);
    function impact(row) { return row.priceImpact || rowPriceImpact(row); }
    function topRow(filter, score, direction) {
      var selected = rows.filter(filter).sort(function (left, right) {
        var leftValue = score(left);
        var rightValue = score(right);
        return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
      })[0];
      return selected || null;
    }
    function add(cards, label, row, value, note) {
      if (!row) return;
      var key = priceSelectionKey(row);
      if (!key || used[key]) return;
      used[key] = true;
      cards.push({ label: label, row: row, value: value, note: note, key: key });
    }
    var cards = [];
    var ordersLeader = topRow(function (row) {
      return (impact(row).ordersUnits || 0) > 0;
    }, function (row) {
      return Number(impact(row).ordersUnits) || 0;
    });
    var revenueLeader = topRow(function (row) {
      return (impact(row).revenue || 0) > 0;
    }, function (row) {
      return Number(impact(row).revenue) || 0;
    });
    var orderDropLeader = topRow(function (row) {
      var rowImpact = impact(row);
      return rowImpact && rowImpact.orderDelta != null && Number(rowImpact.orderDelta) < 0;
    }, function (row) {
      return Number(impact(row).orderDelta) || 0;
    }, "asc");
    add(cards, "Топ SKU по заказам", ordersLeader, ordersLeader ? intf(impact(ordersLeader).ordersUnits) + " заказов" : "", "где сейчас основной объем");
    add(cards, "Топ SKU по выручке", revenueLeader, revenueLeader ? money(impact(revenueLeader).revenue) : "", "самая крупная строка в деньгах");
    add(cards, "Лучший эффект цены", model.bestPriceRow && model.bestPriceRow.row, model.bestPriceRow ? signedDailyLabel(model.bestPriceRow.delta) : "", "после изменения цены");
    add(cards, "Просадка после цены", orderDropLeader, orderDropLeader ? signedDailyLabel(impact(orderDropLeader).orderDelta) : "", "заказы упали после изменения");
    add(cards, "Маржа ниже нормы", model.belowMarginRows[0], model.belowMarginRows[0] ? pct(model.belowMarginRows[0].marginTotalPct) : "", "сравнить цену и допустимую маржу");
    add(cards, "Цена вне коридора", model.riskRows[0], model.riskRows[0] ? (priceBoundaryState(model.riskRows[0]) || {}).label : "", "проверить MIN/MAX");
    if (!cards.length) return "";
    return [
      '<section class="prices-v1-top" id="price-top-sku">',
      '<div class="prices-v1-section-head"><div><span>Top SKU</span><h3>Куда смотреть в первую очередь</h3><p>Клик по карточке выбирает SKU, обновляет график цены/заказов и подсвечивает строку в таблице.</p></div></div>',
      '<div class="prices-v1-top-grid">',
      cards.map(function (card) {
        var row = card.row || {};
        var cardImpact = impact(row);
        var value = card.value || (cardImpact.revenue != null ? money(cardImpact.revenue) : intf(cardImpact.ordersUnits));
        return [
          '<button type="button" class="prices-v1-top-card" data-price-v1-select="', esc(card.key), '" data-price-v1-show-selected="1">',
          '<span>', esc(card.label), '</span>',
          '<strong>', esc(row.articleKey || "—"), '</strong>',
          '<em>', esc(priceMarketLabel(row.market)), ' · ', esc(row.owner || "без owner"), '</em>',
          '<b>', esc(value || "—"), '</b>',
          '<em>', esc(card.note || ""), '</em>',
          '</button>'
        ].join("");
      }).join(""),
      '</div></section>'
    ].join("");
  }

  function renderAverageCheckChart(model) {
    var current = model.averageCurrent || [];
    var previous = model.averagePrevious || [];
    var values = current.map(function (point) { return point.value; }).concat(previous.map(function (point) { return point.value; }));
    if (!values.some(function (value) { return value != null; })) {
      return '<div class="prices-v1-empty">\u0414\u043b\u044f LFL \u043d\u0435\u0442 \u0432\u0435\u0441\u0430: \u043d\u0443\u0436\u043d\u044b \u0432\u044b\u0440\u0443\u0447\u043a\u0430 + \u0437\u0430\u043a\u0430\u0437\u044b/\u0432\u044b\u043a\u0443\u043f\u044b.</div>';
    }
    var domain = priceChartDomain(values, 0, 1);
    domain.min = Math.min(0, domain.min);
    var width = 720;
    var height = 285;
    var left = 58;
    var right = 22;
    var top = 34;
    var bottom = 42;
    var plotWidth = width - left - right;
    var plotHeight = height - top - bottom;
    var groupWidth = plotWidth / Math.max(1, current.length);
    var barWidth = Math.max(5, Math.min(16, groupWidth * 0.28));
    var axis = priceAxisLabels(domain, money);
    function y(value) { return priceScaleY(value, domain, top, plotHeight); }
    var bars = current.map(function (point, index) {
      var cx = left + index * groupWidth + groupWidth / 2;
      var currentY = y(point.value);
      var previousPoint = previous[index] || {};
      var previousY = y(previousPoint.value);
      var baseY = top + plotHeight;
      var tooltip = point.date + " / " + (previousPoint.compareDate || "\u2014") + " | \u0447\u0435\u043a " + money(point.value) + " vs " + money(previousPoint.value) + " | SKU " + intf(point.sku) + " | " + (point.base || "\u0431\u0435\u0437 \u0431\u0430\u0437\u044b");
      return [
        previousY == null ? '' : '<rect class="prices-chart-bar prev" x="' + (cx - barWidth - 2).toFixed(1) + '" y="' + previousY.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + Math.max(1, baseY - previousY).toFixed(1) + '"><title>' + esc(tooltip) + '</title></rect>',
        currentY == null ? '' : '<rect class="prices-chart-bar current" tabindex="0" data-price-v1-day="' + esc(point.date) + '" x="' + (cx + 2).toFixed(1) + '" y="' + currentY.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + Math.max(1, baseY - currentY).toFixed(1) + '"><title>' + esc(tooltip) + '</title></rect>',
        index % Math.ceil(Math.max(1, current.length / 6)) === 0 ? '<text class="prices-chart-x" x="' + cx.toFixed(1) + '" y="' + (height - 12) + '" text-anchor="middle">' + esc(priceShortDate(point.date)) + '</text>' : ''
      ].join("");
    }).join("");
    return [
      '<svg class="prices-overview-svg" viewBox="0 0 ', width, ' ', height, '" role="img" aria-label="\u0421\u0440\u0435\u0434\u043d\u0438\u0439 \u0447\u0435\u043a LFL \u043f\u043e \u0434\u043d\u044f\u043c">',
      '<g class="prices-chart-grid"><line x1="', left, '" x2="', width - right, '" y1="', top, '" y2="', top, '"></line><line x1="', left, '" x2="', width - right, '" y1="', top + plotHeight / 2, '" y2="', top + plotHeight / 2, '"></line><line x1="', left, '" x2="', width - right, '" y1="', top + plotHeight, '" y2="', top + plotHeight, '"></line></g>',
      '<text class="prices-chart-y" x="10" y="', top + 4, '">', esc(axis.max), '</text><text class="prices-chart-y" x="10" y="', top + plotHeight / 2 + 4, '">', esc(axis.mid), '</text><text class="prices-chart-y" x="10" y="', top + plotHeight + 4, '">', esc(axis.min), '</text>',
      bars,
      '</svg>'
    ].join("");
  }

  function renderMarginChart(model) {
    var ui = priceChartUi();
    var metric = ui.marginMetric === "rub" ? "rub" : "pct";
    var current = model.marginCurrent || [];
    var previous = model.marginPrevious || [];
    var values = current.map(function (point) { return point[metric]; }).concat(previous.map(function (point) { return point[metric]; }));
    if (!values.some(function (value) { return value != null; })) {
      return '<div class="prices-v1-empty">\u041d\u0435\u0442 \u0434\u043d\u0435\u0432\u043d\u043e\u0439 \u043c\u0430\u0440\u0436\u0438. Snapshot \u043d\u0435 \u0440\u0430\u0441\u0442\u044f\u0433\u0438\u0432\u0430\u044e \u0432 \u043b\u043e\u0436\u043d\u0443\u044e \u043b\u0438\u043d\u0438\u044e.</div>';
    }
    var domain = priceChartDomain(values, metric === "pct" ? 0 : 0, metric === "pct" ? 1 : 1);
    var width = 720;
    var height = 285;
    var left = 58;
    var right = 22;
    var top = 34;
    var bottom = 42;
    var plotWidth = width - left - right;
    var plotHeight = height - top - bottom;
    var step = current.length > 1 ? plotWidth / (current.length - 1) : plotWidth;
    function x(index) { return left + (current.length > 1 ? index * step : plotWidth / 2); }
    function y(value) { return priceScaleY(value, domain, top, plotHeight); }
    var line = priceLinePoints(current, metric, x, y);
    var prev = priceLinePoints(previous, metric, x, y);
    var area = priceAreaPoints(current, metric, x, y, top + plotHeight);
    var axis = priceAxisLabels(domain, metric === "pct" ? pct : money);
    var dots = current.map(function (point, index) {
      var cy = y(point[metric]);
      if (cy == null) return "";
      return '<circle class="prices-margin-dot" tabindex="0" data-price-v1-day="' + esc(point.date) + '" cx="' + x(index).toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="4"><title>' + esc(point.date + " | " + (metric === "pct" ? pct(point.pct) : money(point.rub)) + " | SKU " + intf(point.sku) + " | " + point.quality) + '</title></circle>';
    }).join("");
    return [
      '<svg class="prices-overview-svg" viewBox="0 0 ', width, ' ', height, '" role="img" aria-label="\u041c\u0430\u0440\u0436\u0430 \u043f\u043e \u0434\u043d\u044f\u043c">',
      '<g class="prices-chart-grid"><line x1="', left, '" x2="', width - right, '" y1="', top, '" y2="', top, '"></line><line x1="', left, '" x2="', width - right, '" y1="', top + plotHeight / 2, '" y2="', top + plotHeight / 2, '"></line><line x1="', left, '" x2="', width - right, '" y1="', top + plotHeight, '" y2="', top + plotHeight, '"></line></g>',
      '<text class="prices-chart-y" x="10" y="', top + 4, '">', esc(axis.max), '</text><text class="prices-chart-y" x="10" y="', top + plotHeight / 2 + 4, '">', esc(axis.mid), '</text><text class="prices-chart-y" x="10" y="', top + plotHeight + 4, '">', esc(axis.min), '</text>',
      area ? '<polygon class="prices-margin-area" points="' + esc(area) + '"></polygon>' : '',
      prev ? '<polyline class="prices-margin-line prev" points="' + esc(prev) + '"></polyline>' : '',
      line ? '<polyline class="prices-margin-line current" points="' + esc(line) + '"></polyline>' : '',
      dots,
      current.map(function (point, index) {
        return index % Math.ceil(Math.max(1, current.length / 6)) === 0 ? '<text class="prices-chart-x" x="' + x(index).toFixed(1) + '" y="' + (height - 12) + '" text-anchor="middle">' + esc(priceShortDate(point.date)) + '</text>' : '';
      }).join(""),
      '</svg>'
    ].join("");
  }

  function renderPriceInsights(model) {
    var best = model.bestPriceRow && model.bestPriceRow.row;
    var bestLabel = best ? priceMarketLabel(best.market) + " · " + best.articleKey + " · " + signedDailyLabel(model.bestPriceRow.delta) : "\u043d\u0435\u0442 \u044d\u0444\u0444\u0435\u043a\u0442\u0430";
    var below = model.belowMarginRows[0];
    var risk = model.riskRows[0];
    var cards = [
      { label: "\u0413\u0434\u0435 \u043f\u0440\u043e\u0441\u0435\u043b\u0430 \u043c\u0430\u0440\u0436\u0430", value: below ? priceMarketLabel(below.market) + " · " + below.articleKey : "\u041e\u041a", note: intf(model.belowMarginRows.length) + " SKU", action: 'data-price-v1-saved="belowMargin"' },
      { label: "\u0413\u0434\u0435 \u0432\u044b\u0440\u043e\u0441 \u0441\u0440\u0435\u0434\u043d\u0438\u0439 \u0447\u0435\u043a", value: money(model.averageValue), note: model.averageDelta && model.averageDelta.rub != null ? signedMoneyLabel(model.averageDelta.rub) : "\u0431\u0435\u0437 LFL", action: 'data-price-v1-scroll="price-overview"' },
      { label: "SKU \u0441 \u043b\u0443\u0447\u0448\u0435\u0439 \u0446\u0435\u043d\u043e\u0432\u043e\u0439 \u0434\u0438\u043d\u0430\u043c\u0438\u043a\u043e\u0439", value: bestLabel, note: "\u0441\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u043a\u0430 \u043f\u043e \u044d\u0444\u0444\u0435\u043a\u0442\u0443", action: 'data-price-v1-insight="price_change"' },
      { label: "SKU \u0432 \u0446\u0435\u043d\u043e\u0432\u043e\u043c \u0440\u0438\u0441\u043a\u0435", value: risk ? priceMarketLabel(risk.market) + " · " + risk.articleKey : "\u041e\u041a", note: intf(model.riskRows.length) + " \u0432\u043d\u0435 MIN/MAX", action: 'data-price-v1-saved="minMaxRisk"' }
    ];
    return '<div class="prices-v1-insights">' + cards.map(function (card) {
      return '<button type="button" ' + card.action + '><span>' + esc(card.label) + '</span><strong>' + esc(card.value) + '</strong><em>' + esc(card.note) + '</em><b>\u2192</b></button>';
    }).join("") + '</div>';
  }

  function renderPriceOverview(model) {
    var ui = priceChartUi();
    return [
      '<section class="prices-v1-overview" id="price-overview">',
      '<div class="prices-v1-chart-panel" data-price-chart="average-check-lfl">',
      '<div class="prices-v1-section-head"><div><span>LFL</span><h3>\u0421\u0440\u0435\u0434\u043d\u0438\u0439 \u0447\u0435\u043a \u043f\u043e \u0434\u043d\u044f\u043c</h3><p>\u0422\u043e\u043b\u044c\u043a\u043e \u0441\u043e\u043f\u043e\u0441\u0442\u0430\u0432\u0438\u043c\u044b\u0435 marketplace + SKU, \u0431\u0435\u0437 \u043d\u043e\u0432\u044b\u0445 \u0438 \u0432\u044b\u0431\u044b\u0432\u0448\u0438\u0445.</p></div><button type="button" data-price-v1-scroll="price-table">\u041e\u0442\u043a\u0440\u044b\u0442\u044c SKU</button></div>',
      '<div class="prices-v1-chart-legend"><span class="current">\u0442\u0435\u043a\u0443\u0449\u0438\u0439</span><span class="previous">\u043f\u0440\u0435\u0434.</span><em>', intf(model.comparableRows.length), ' LFL SKU</em></div>',
      renderAverageCheckChart(model),
      '</div>',
      '<div class="prices-v1-chart-panel" data-price-chart="margin-daily">',
      '<div class="prices-v1-section-head"><div><span>\u041c\u0430\u0440\u0436\u0430</span><h3>\u041c\u0430\u0440\u0436\u0430 \u043f\u043e \u0434\u043d\u044f\u043c</h3><p>\u0414\u043d\u0435\u0432\u043d\u0430\u044f \u043b\u0438\u043d\u0438\u044f \u0442\u043e\u043b\u044c\u043a\u043e \u0438\u0437 daily-\u0440\u044f\u0434\u043e\u0432, snapshot \u043d\u0435 \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u0435\u0442\u0441\u044f.</p></div><div class="prices-v1-mini-tabs"><button type="button" data-price-margin-metric="pct" aria-pressed="', ui.marginMetric !== "rub" ? "true" : "false", '">%</button><button type="button" data-price-margin-metric="rub" aria-pressed="', ui.marginMetric === "rub" ? "true" : "false", '">\u20bd</button></div></div>',
      '<div class="prices-v1-chart-legend"><span class="margin">\u0442\u0435\u043a\u0443\u0449\u0430\u044f</span><span class="previous">\u043f\u0440\u0435\u0434.</span><em>\u0438\u0442\u043e\u0433: ', esc(pct(model.marginWeighted && model.marginWeighted.pct)), '</em></div>',
      renderMarginChart(model),
      '</div>',
      renderPriceInsights(model),
      '</section>'
    ].join("");
  }

  function priceV1DataQuality(row) {
    var flags = [];
    if (!priceHasDailyFact(row)) flags.push("нет daily");
    if (positiveNum(row && row.currentFillPrice) == null) flags.push("нет цены");
    if (!priceFactDateForRow(row)) flags.push("нет даты цены");
    var lag = priceFactLagDays(row);
    if (lag != null && lag > 2) flags.push("цена устарела: " + lag + " дн.");
    if (num(row && row.marginTotalPct) == null) flags.push("нет маржи");
    var corridor = priceCorridorState(row);
    if (corridor && corridor.quality && corridor.label !== "нет цены") flags.push(corridor.label);
    if (!String(row.owner || "").trim() || row.owner === "\u2014") flags.push("без owner");
    if (row.matrixProblemLabel) flags.push(row.matrixProblemLabel);
    return flags.length ? flags.join(" · ") : "OK";
  }

  function priceV1DecisionStatus(row) {
    if (positiveNum(row && row.currentFillPrice) == null) return "нет цены";
    var boundary = priceBoundaryState(row);
    if (boundary) return "review";
    var corridor = priceCorridorState(row);
    if (corridor && corridor.label === "MIN/MAX не задан") return "задать MIN/MAX";
    if (priceFactLagDays(row) != null && priceFactLagDays(row) > 2) return "обновить цену";
    var impact = row.priceImpact || rowPriceImpact(row);
    if (impact && impact.change && Number(impact.orderDelta) < 0) return "стоп / проверить";
    if (row.repricerDisplay && moneyRound(row.repricerDisplay.price) != null) return "есть рекомендация";
    return "наблюдать";
  }

  function priceV1Kpis(summary) {
    var cards = [
      { label: "SKU в срезе", value: intf(summary.count), note: priceMarketLabel(state.market || "all") },
      { label: "Цена сработала", value: intf(summary.impactWins), note: intf(summary.impactDrops) + " просадок" },
      { label: "Уровень заказов", value: formatOrdersPerDay(summary.avgOrdersPerDay), note: summary.orderDeltaTotal == null ? "без эффекта" : "\u0394 " + signedDailyLabel(summary.orderDeltaTotal) },
      { label: "Смены цен", value: intf(summary.priceChanges), note: intf(summary.changedRows) + " SKU меняли цену" },
      { label: "MIN/MAX риск", value: intf(summary.minMaxRisk), note: summary.minMaxDanger ? intf(summary.minMaxDanger) + " ниже MIN" : "коридор под контролем" },
      { label: "Выручка", value: money(summary.revenue), note: summary.ordersUnits == null ? "нет заказов" : intf(summary.ordersUnits) + " заказов" }
    ];
    return '<div class="prices-v1-kpis">' + cards.map(function (card) {
      return '<article><span>' + esc(card.label) + '</span><strong>' + esc(card.value) + '</strong><em>' + esc(card.note || "") + '</em><i></i></article>';
    }).join("") + '</div>';
  }

  function renderSkuPriceEffectChart(row) {
    if (!row) return '<div class="prices-v1-empty">\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 SKU, \u0447\u0442\u043e\u0431\u044b \u0443\u0432\u0438\u0434\u0435\u0442\u044c \u0446\u0435\u043d\u0443 \u0438 \u0437\u0430\u043a\u0430\u0437\u044b \u043f\u043e \u0434\u043d\u044f\u043c.</div>';
    var items = historyItemsForRow(row).slice(-30);
    if (!items.length) return '<div class="prices-v1-empty">\u041f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c\u0443 SKU \u043d\u0435\u0442 \u0434\u043d\u0435\u0432\u043d\u043e\u0439 \u0438\u0441\u0442\u043e\u0440\u0438\u0438 \u0432 \u0442\u0435\u043a\u0443\u0449\u0435\u043c \u043f\u0435\u0440\u0438\u043e\u0434\u0435.</div>';
    var ui = priceChartUi();
    var hidden = ui.hiddenSeries || {};
    var bounds = row.repricerBounds || {};
    var repricer = row.repricerDisplay && num(row.repricerDisplay.price);
    var priceValues = [];
    items.forEach(function (item) {
      var price = num(item.price);
      var client = num(item.clientPrice);
      if (price != null) priceValues.push(price);
      if (client != null) priceValues.push(client);
    });
    if (repricer != null) priceValues.push(repricer);
    if (ui.skuChartFocus === "corridor") {
      [bounds.effectiveMin, bounds.effectiveMax].forEach(function (value) {
        var parsed = num(value);
        if (parsed != null) priceValues.push(parsed);
      });
    }
    var priceDomain = priceChartDomain(priceValues, 0, 1);
    var maxOrders = Math.max.apply(null, items.map(function (item) {
      return Math.max(num(item.ordersUnits) || 0, num(item.deliveredUnits) || 0);
    }).concat([1]));
    var width = 940;
    var left = 58;
    var right = 24;
    var moneyTop = 32;
    var moneyHeight = 170;
    var effectTop = 242;
    var effectHeight = 86;
    var plotWidth = width - left - right;
    var step = items.length > 1 ? plotWidth / (items.length - 1) : 0;
    function x(index) { return left + (items.length > 1 ? index * step : plotWidth / 2); }
    function yPrice(value) { return priceScaleY(value, priceDomain, moneyTop, moneyHeight); }
    function yOrders(value) {
      var parsed = num(value);
      if (parsed == null) return null;
      return effectTop + effectHeight - (parsed / maxOrders) * effectHeight;
    }
    function line(key) {
      var points = [];
      items.forEach(function (item, index) {
        var y = yPrice(item[key]);
        if (y != null) points.push(x(index).toFixed(1) + "," + y.toFixed(1));
      });
      return points.join(" ");
    }
    var changeMarkers = [];
    var previous = null;
    var bars = items.map(function (item, index) {
      var orders = num(item.ordersUnits) || 0;
      var delivered = num(item.deliveredUnits) || 0;
      var cx = x(index);
      var yOrder = yOrders(orders);
      var yDelivered = yOrders(delivered);
      var orderHeight = Math.max(1, effectTop + effectHeight - (yOrder == null ? effectTop + effectHeight : yOrder));
      var deliveredHeight = Math.max(1, effectTop + effectHeight - (yDelivered == null ? effectTop + effectHeight : yDelivered));
      var price = roundedHistoryPrice(item);
      if (previous != null && price != null && price !== previous) {
        changeMarkers.push('<line class="prices-v1-change" x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + moneyTop + '" y2="' + (effectTop + effectHeight) + '"><title>' + esc(item.date || "") + " \u00b7 " + esc(signedMoneyLabel(price - previous)) + '</title></line>');
      }
      if (price != null) previous = price;
      var tooltip = (item.date || "") + " \u00b7 " + intf(orders) + " \u0437\u0430\u043a. \u00b7 " + (delivered ? intf(delivered) + " \u0432\u044b\u043a. \u00b7 " : "") + money(item.price) + " MP \u00b7 " + money(item.clientPrice) + " \u043a\u043b\u0438\u0435\u043d\u0442";
      return [
        hidden.orders ? '' : '<rect class="prices-v1-bar orders" tabindex="0" x="' + (cx - 6).toFixed(1) + '" y="' + (effectTop + effectHeight - orderHeight).toFixed(1) + '" width="9" height="' + orderHeight.toFixed(1) + '"><title>' + esc(tooltip) + '</title></rect>',
        hidden.buyouts || !delivered ? '' : '<rect class="prices-v1-bar buyouts" tabindex="0" x="' + (cx + 4).toFixed(1) + '" y="' + (effectTop + effectHeight - deliveredHeight).toFixed(1) + '" width="7" height="' + deliveredHeight.toFixed(1) + '"><title>' + esc(tooltip) + '</title></rect>',
        index % Math.ceil(Math.max(1, items.length / 6)) === 0 ? '<text class="prices-chart-x" x="' + cx.toFixed(1) + '" y="368" text-anchor="middle">' + esc(priceShortDate(item.date)) + '</text>' : ''
      ].join("");
    }).join("");
    var minY = yPrice(bounds.effectiveMin);
    var maxY = yPrice(bounds.effectiveMax);
    var band = "";
    if (!hidden.corridor && minY != null && maxY != null && minY >= moneyTop && minY <= moneyTop + moneyHeight && maxY >= moneyTop && maxY <= moneyTop + moneyHeight) {
      band = '<rect class="prices-v1-corridor-band" x="' + left + '" y="' + Math.min(minY, maxY).toFixed(1) + '" width="' + plotWidth + '" height="' + Math.max(1, Math.abs(maxY - minY)).toFixed(1) + '"><title>MIN/MAX ' + esc(money(bounds.effectiveMin)) + " - " + esc(money(bounds.effectiveMax)) + '</title></rect>';
    }
    var clipped = [];
    if (!hidden.corridor) {
      if (num(bounds.effectiveMin) != null && (minY == null || minY > moneyTop + moneyHeight)) clipped.push('<text class="prices-v1-clip-label" x="' + (width - right) + '" y="' + (moneyTop + moneyHeight - 6) + '" text-anchor="end">MIN \u043d\u0438\u0436\u0435 \u0432\u0438\u0434\u0438\u043c\u043e\u0433\u043e</text>');
      if (num(bounds.effectiveMax) != null && (maxY == null || maxY < moneyTop)) clipped.push('<text class="prices-v1-clip-label" x="' + (width - right) + '" y="' + (moneyTop + 14) + '" text-anchor="end">MAX \u0432\u044b\u0448\u0435 \u0432\u0438\u0434\u0438\u043c\u043e\u0433\u043e</text>');
    }
    var moneyAxis = priceAxisLabels(priceDomain, money);
    var repricerY = yPrice(repricer);
    var impact = row.priceImpact || rowPriceImpact(row);
    var beforeAfter = "";
    if (impact && impact.change) {
      var changeX = x(Math.max(0, Math.min(items.length - 1, Number(impact.change.index) || 0)));
      beforeAfter = '<text class="prices-v1-before-after" x="' + Math.max(left, changeX - 42).toFixed(1) + '" y="' + (effectTop + effectHeight + 24) + '">\u0434\u043e</text><text class="prices-v1-before-after" x="' + Math.min(width - right, changeX + 28).toFixed(1) + '" y="' + (effectTop + effectHeight + 24) + '">\u043f\u043e\u0441\u043b\u0435 \u00b7 ' + esc(impact.orderDelta == null ? "\u2014" : signedDailyLabel(impact.orderDelta)) + '</text>';
    }
    return [
      '<svg class="prices-v1-chart" viewBox="0 0 940 382" role="img" aria-label="\u0426\u0435\u043d\u0430, \u0437\u0430\u043a\u0430\u0437\u044b \u0438 \u044d\u0444\u0444\u0435\u043a\u0442 \u043f\u043e \u0434\u043d\u044f\u043c">',
      '<g class="prices-v1-grid"><line x1="', left, '" x2="', width - right, '" y1="', moneyTop, '" y2="', moneyTop, '"></line><line x1="', left, '" x2="', width - right, '" y1="', moneyTop + moneyHeight / 2, '" y2="', moneyTop + moneyHeight / 2, '"></line><line x1="', left, '" x2="', width - right, '" y1="', moneyTop + moneyHeight, '" y2="', moneyTop + moneyHeight, '"></line><line x1="', left, '" x2="', width - right, '" y1="', effectTop + effectHeight, '" y2="', effectTop + effectHeight, '"></line></g>',
      '<text class="prices-chart-y" x="8" y="', moneyTop + 4, '">', esc(moneyAxis.max), '</text><text class="prices-chart-y" x="8" y="', moneyTop + moneyHeight / 2 + 4, '">', esc(moneyAxis.mid), '</text><text class="prices-chart-y" x="8" y="', moneyTop + moneyHeight + 4, '">', esc(moneyAxis.min), '</text><text class="prices-chart-y" x="8" y="', effectTop + 8, '">', esc(intf(maxOrders)), '</text><text class="prices-chart-y" x="8" y="', effectTop + effectHeight + 4, '">0</text>',
      band,
      bars,
      changeMarkers.join(""),
      !hidden.corridor && minY != null && minY >= moneyTop && minY <= moneyTop + moneyHeight ? '<line class="prices-v1-minmax min" x1="' + left + '" x2="' + (width - right) + '" y1="' + minY.toFixed(1) + '" y2="' + minY.toFixed(1) + '"><title>MIN ' + esc(money(bounds.effectiveMin)) + '</title></line>' : '',
      !hidden.corridor && maxY != null && maxY >= moneyTop && maxY <= moneyTop + moneyHeight ? '<line class="prices-v1-minmax max" x1="' + left + '" x2="' + (width - right) + '" y1="' + maxY.toFixed(1) + '" y2="' + maxY.toFixed(1) + '"><title>MAX ' + esc(money(bounds.effectiveMax)) + '</title></line>' : '',
      clipped.join(""),
      !hidden.repricer && repricerY != null ? '<line class="prices-v1-repricer-line" x1="' + left + '" x2="' + (width - right) + '" y1="' + repricerY.toFixed(1) + '" y2="' + repricerY.toFixed(1) + '"><title>\u0420\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440 ' + esc(money(repricer)) + '</title></line>' : '',
      hidden.mp ? '' : '<polyline class="prices-v1-line mp" points="' + esc(line("price")) + '"></polyline>',
      hidden.client ? '' : '<polyline class="prices-v1-line client" points="' + esc(line("clientPrice")) + '"></polyline>',
      beforeAfter,
      '</svg>'
    ].join("");
  }

  function priceV1Chart(row) {
    return renderSkuPriceEffectChart(row);
    if (!row) return '<div class="prices-v1-empty">Выберите SKU, чтобы увидеть цену и заказы по дням.</div>';
    var items = historyItemsForRow(row).slice(-30);
    if (!items.length) return '<div class="prices-v1-empty">По выбранному SKU нет дневной истории в текущем периоде.</div>';
    var bounds = row.repricerBounds || {};
    var priceValues = [];
    items.forEach(function (item) {
      var price = num(item.price);
      var client = num(item.clientPrice);
      if (price != null) priceValues.push(price);
      if (client != null) priceValues.push(client);
    });
    [bounds.effectiveMin, bounds.effectiveMax].forEach(function (value) {
      var parsed = num(value);
      if (parsed != null) priceValues.push(parsed);
    });
    var minPrice = Math.min.apply(null, priceValues.length ? priceValues : [0]);
    var maxPrice = Math.max.apply(null, priceValues.length ? priceValues : [1]);
    if (minPrice === maxPrice) {
      minPrice = Math.max(0, minPrice - 1);
      maxPrice += 1;
    }
    var maxOrders = Math.max.apply(null, items.map(function (item) { return num(item.ordersUnits) || 0; }).concat([1]));
    var width = 940;
    var left = 36;
    var top = 28;
    var chartHeight = 220;
    var step = items.length > 1 ? (width - left - 24) / (items.length - 1) : 0;
    function x(index) { return left + (items.length > 1 ? index * step : (width - left) / 2); }
    function yPrice(value) {
      var parsed = num(value);
      if (parsed == null) return null;
      return top + chartHeight - ((parsed - minPrice) / (maxPrice - minPrice)) * chartHeight;
    }
    function line(key) {
      var points = [];
      items.forEach(function (item, index) {
        var y = yPrice(item[key]);
        if (y != null) points.push(x(index).toFixed(1) + "," + y.toFixed(1));
      });
      return points.join(" ");
    }
    var previous = null;
    var bars = items.map(function (item, index) {
      var orders = num(item.ordersUnits) || 0;
      var h = Math.max(2, orders / maxOrders * 150);
      var cx = x(index);
      var change = "";
      var price = roundedHistoryPrice(item);
      if (previous != null && price != null && price !== previous) {
        change = '<line class="prices-v1-change" x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + top + '" y2="' + (top + chartHeight) + '"></line>';
      }
      if (price != null) previous = price;
      return change + '<rect class="prices-v1-bar" x="' + (cx - 5).toFixed(1) + '" y="' + (top + chartHeight - h).toFixed(1) + '" width="10" height="' + h.toFixed(1) + '"><title>' + esc(item.date || "") + " · " + intf(orders) + " заказов" + '</title></rect>';
    }).join("");
    var minY = yPrice(bounds.effectiveMin);
    var maxY = yPrice(bounds.effectiveMax);
    return [
      '<svg class="prices-v1-chart" viewBox="0 0 940 292" role="img" aria-label="Цена и заказы по дням">',
      '<g class="prices-v1-grid"><line x1="36" x2="916" y1="58" y2="58"></line><line x1="36" x2="916" y1="138" y2="138"></line><line x1="36" x2="916" y1="248" y2="248"></line></g>',
      bars,
      minY != null ? '<line class="prices-v1-minmax min" x1="36" x2="916" y1="' + minY.toFixed(1) + '" y2="' + minY.toFixed(1) + '"><title>MIN ' + esc(money(bounds.effectiveMin)) + '</title></line>' : '',
      maxY != null ? '<line class="prices-v1-minmax max" x1="36" x2="916" y1="' + maxY.toFixed(1) + '" y2="' + maxY.toFixed(1) + '"><title>MAX ' + esc(money(bounds.effectiveMax)) + '</title></line>' : '',
      '<polyline class="prices-v1-line mp" points="' + esc(line("price")) + '"></polyline>',
      '<polyline class="prices-v1-line client" points="' + esc(line("clientPrice")) + '"></polyline>',
      '<text x="36" y="282">' + esc(items[0].date || "") + '</text><text x="916" y="282" text-anchor="end">' + esc(items[items.length - 1].date || "") + '</text>',
      '</svg>'
    ].join("");
  }

  function priceV1SelectedPanel(row) {
    if (!row) return '<section class="prices-v1-selected"><div class="prices-v1-empty">Нет выбранного SKU в текущем фильтре.</div></section>';
    var impact = row.priceImpact || rowPriceImpact(row);
    var bounds = row.repricerBounds || {};
    var lifecycle = row.productLifecycle || priceProductLifecycleForRow(row) || {};
    var effectPct = priceV1EffectPct(impact);
    var currentPrice = row.listPrice != null ? row.listPrice : row.currentFillPrice;
    var ui = priceChartUi();
    var hidden = ui.hiddenSeries || {};
    var key = priceSelectionKey(row);
    function legendButton(key, label, className) {
      var pressed = !hidden[key];
      return '<button type="button" class="' + esc(className || key) + '" data-price-series="' + esc(key) + '" aria-pressed="' + (pressed ? "true" : "false") + '">' + esc(label) + '</button>';
    }
    return [
      '<section class="prices-v1-selected" id="price-selected">',
      '<div class="prices-v1-chart-card">',
      '<div class="prices-v1-section-head"><div><span>Цена · заказы · эффект по дням</span><h3>', esc(row.articleKey || "\u2014"), '</h3><p>', esc(row.name || ""), '</p></div>',
      '<div class="prices-v1-legend">', legendButton("orders", "Заказы", "orders"), legendButton("buyouts", "Выкупы", "buyouts"), legendButton("mp", "Цена MP", "mp"), legendButton("client", "Клиент", "client"), legendButton("corridor", "MIN/MAX", "corridor"), legendButton("repricer", "Репрайсер", "repricer"), '<button type="button" data-price-chart-focus="', ui.skuChartFocus === "corridor" ? "fact" : "corridor", '">', ui.skuChartFocus === "corridor" ? "Фокус на факте" : "Весь коридор", '</button></div></div>',
      priceV1Chart(row),
      '</div>',
      '<aside class="prices-v1-sku-card">',
      '<div class="prices-v1-sku-top"><span>Выбранный SKU</span><button type="button" data-price-v1-open-detail="' + esc(key) + '">Открыть историю SKU</button></div>',
      '<h3>', esc(row.articleKey || "\u2014"), '</h3><p>', esc(row.owner || "\u2014"), ' · ', esc(priceMarketLabel(row.market)), ' · ', esc(state.dateFrom || "\u2014"), ' - ', esc(state.dateTo || "\u2014"), '</p>',
      '<div class="prices-v1-mini-grid">',
      '<div><span>Цена MP</span><strong>', money(currentPrice), '</strong><em>', impact.change ? esc(signedMoneyLabel(impact.change.deltaRub)) : "без смены", '</em></div>',
      '<div><span>Клиент / СПП</span><strong>', money(row.currentClientPrice), '</strong><em>СПП ', pct(row.currentSppPct), '</em></div>',
      '<div><span>MIN / MAX</span><strong>', money(bounds.effectiveMin), ' / ', money(bounds.effectiveMax), '</strong><em>', esc(priceBoundaryState(row)?.label || "в коридоре"), '</em></div>',
      '<div><span>Репрайсер</span><strong>', money(row.repricerDisplay && row.repricerDisplay.price), '</strong><em>', esc(priceV1DecisionStatus(row)), '</em></div>',
      '</div>',
      '<div class="prices-v1-effect"><span>Эффект после последней смены</span><strong>', effectPct == null ? "\u2014" : signedPctLabel(effectPct), '</strong><em>до ', esc(priceV1OrdersPerDay(impact.beforeOrders, impact.beforeDays)), ' · после ', esc(priceV1OrdersPerDay(impact.afterOrders, impact.afterDays)), '</em></div>',
      '<div class="prices-v1-status-block"><span>Статус товара</span><strong>', esc(lifecycle.label || row.status || "\u2014"), '</strong>', renderPriceLifecycleEditor(row, true), '</div>',
      '</aside>',
      '</section>'
    ].join("");
  }

  function priceV1TableLegacy(rows) {
    if (!rows.length) return '<div class="prices-v1-empty">По текущим фильтрам пока нет строк.</div>';
    var sorted = sortedVisiblePriceRows(rows);
    return [
      '<div class="prices-v1-table-wrap"><table class="prices-v1-table pw-table"><thead>',
      '<tr class="prices-v1-groups"><th colspan="3">Идентификация</th><th colspan="7">Цена и коридор</th><th colspan="6">Эффект после смены</th><th colspan="4">Экономика</th><th colspan="3">Решение</th></tr>',
      '<tr>',
      sortableHead("article", "SKU"),
      sortableHead("owner", "Owner"),
      sortableHead("status", "Статус товара"),
      sortableHead("price_mp", "Цена MP"),
      sortableHead("price_change", "Изм."),
      sortableHead("client_price", "Клиент"),
      sortableHead("spp", "СПП"),
      sortableHead("min", "MIN"),
      sortableHead("max", "MAX"),
      sortableHead("repricer_price", "Репрайсер"),
      '<th>До / дн.</th><th>После / дн.</th><th>Эффект</th><th>Дней после</th>',
      sortableHead("orders", "Заказы"),
      '<th>Выкупы</th>',
      sortableHead("revenue", "Выручка"),
      sortableHead("margin", "Маржа"),
      sortableHead("allowed_margin", "Допуст."),
      sortableHead("turnover", "Оборот."),
      '<th>Статус решения</th><th>Качество</th><th></th>',
      '</tr></thead><tbody>',
      sorted.map(function (row) {
        var lifecycle = row.productLifecycle || priceProductLifecycleForRow(row) || {};
        var impact = row.priceImpact || rowPriceImpact(row);
        var change = impact && impact.change;
        var bounds = row.repricerBounds || {};
        var effectPct = priceV1EffectPct(impact);
        var currentPrice = row.listPrice != null ? row.listPrice : row.currentFillPrice;
        return [
          '<tr class="prices-v1-row" data-open-price="', esc(row.articleKey), '" data-price-market="', esc(row.market), '">',
          '<td><button type="button" class="prices-v1-sku-link" data-price-v1-select="', esc(row.articleKey), '">', esc(row.articleKey || "\u2014"), '</button><small>', esc(row.name || ""), '</small></td>',
          '<td>', esc(row.owner || "\u2014"), '</td>',
          '<td><span class="pw-badge', priceLifecycleBadgeClass(lifecycle), '">', esc(lifecycle.label || row.status || "\u2014"), '</span>', renderPriceLifecycleEditor(row, true), '</td>',
          '<td><strong>', money(currentPrice), '</strong><small>', esc(metricHelp(modalListPriceHelp(row), row.listPriceFactDate || row.priceFactDate, row.valueDate)), '</small></td>',
          '<td>', change ? '<span class="pw-delta ' + deltaTone(change.deltaRub) + '">' + esc(signedMoneyLabel(change.deltaRub)) + '</span><small>' + esc(change.date || "") + '</small>' : "\u2014", '</td>',
          '<td><strong>', money(row.currentClientPrice), '</strong></td>',
          '<td>', pct(row.currentSppPct), '</td>',
          '<td>', money(bounds.effectiveMin), '</td>',
          '<td>', money(bounds.effectiveMax), '</td>',
          '<td>', renderRepricerCell(row.repricerDisplay), '</td>',
          '<td>', esc(priceV1OrdersPerDay(impact.beforeOrders, impact.beforeDays)), '</td>',
          '<td>', esc(priceV1OrdersPerDay(impact.afterOrders, impact.afterDays)), '</td>',
          '<td>', effectPct == null ? "\u2014" : '<span class="pw-delta ' + deltaTone(effectPct) + '">' + esc(signedPctLabel(effectPct)) + '</span>', '</td>',
          '<td>', intf(impact.afterDays), '</td>',
          '<td>', impact.ordersUnits == null ? "\u2014" : intf(impact.ordersUnits), '</td>',
          '<td>', impact.deliveredUnits == null ? "\u2014" : intf(impact.deliveredUnits), '</td>',
          '<td>', money(impact.revenue), '</td>',
          '<td>', pct(row.marginTotalPct), '</td>',
          '<td>', pct(row.allowedMarginPct), '</td>',
          '<td>', days(row.turnoverDays), '</td>',
          '<td><span class="prices-v1-decision">', esc(priceV1DecisionStatus(row)), '</span></td>',
          '<td>', esc(priceV1DataQuality(row)), '</td>',
          '<td><button type="button" class="sku-plan-open-card" data-price-v1-open-detail="', esc(row.articleKey), '">\u2192</button></td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table></div>'
    ].join("");
  }

  function priceV1DecisionText(row) {
    if (positiveNum(row && row.currentFillPrice) == null) return "Нет цены / заполнить";
    var boundary = priceBoundaryState(row);
    if (boundary) return "Проверить коридор";
    var corridor = priceCorridorState(row);
    if (corridor && corridor.label === "MIN/MAX не задан") return "Задать MIN/MAX";
    if (priceFactLagDays(row) != null && priceFactLagDays(row) > 2) return "Обновить цену";
    var impact = row.priceImpact || rowPriceImpact(row);
    if (impact && impact.change && Number(impact.orderDelta) < 0) return "Стоп / проверить";
    if (row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct) return "Проверить маржу";
    if (row.repricerDisplay && moneyRound(row.repricerDisplay.price) != null) return "Есть рекомендация";
    return "Наблюдать";
  }

  function priceV1QualityText(row) {
    var value = priceV1DataQuality(row);
    return value === "OK" ? "данные есть" : value;
  }

  function priceV1MarginRub(row, impact) {
    var revenue = num(impact && impact.revenue);
    var margin = num(row && row.marginTotalPct);
    if (revenue == null || margin == null) return null;
    return revenue * margin;
  }

  function priceV1Table(rows) {
    if (!rows.length) return '<div class="prices-v1-empty">По текущим фильтрам пока нет строк.</div>';
    var sorted = sortedVisiblePriceRows(rows);
    return [
      '<div class="prices-v1-table-wrap"><table class="prices-v1-table pw-table"><thead><tr>',
      sortableHead("article", "SKU"),
      sortableHead("owner", "Площадка / owner"),
      sortableHead("price_mp", "Цена"),
      sortableHead("orders", "Продажи"),
      sortableHead("revenue", "Выручка"),
      sortableHead("margin", "Маржа"),
      sortableHead("price_change", "Эффект цены"),
      sortableHead("risk", "Коридор / риск"),
      '<th>Решение</th>',
      '</tr></thead><tbody>',
      sorted.map(function (row) {
        var lifecycle = row.productLifecycle || priceProductLifecycleForRow(row) || {};
        var impact = row.priceImpact || rowPriceImpact(row);
        var change = impact && impact.change;
        var bounds = row.repricerBounds || {};
        var boundary = priceBoundaryState(row);
        var corridor = priceCorridorState(row);
        var effectPct = priceV1EffectPct(impact);
        var currentPrice = row.listPrice != null ? row.listPrice : row.currentFillPrice;
        var key = priceSelectionKey(row);
        var selected = state.selectedKey && priceRowMatchesSelection(row, state.selectedKey);
        var marginRub = priceV1MarginRub(row, impact);
        var revenue = num(impact.revenue);
        var averageCheck = impact.ordersUnits && revenue != null ? revenue / Math.max(1, Number(impact.ordersUnits)) : null;
        var afterBefore = "до " + priceV1OrdersPerDay(impact.beforeOrders, impact.beforeDays) + " · после " + priceV1OrdersPerDay(impact.afterOrders, impact.afterDays);
        var priceNote = ["клиент " + money(row.currentClientPrice), "СПП " + pct(row.currentSppPct)].join(" · ");
        var corridorNote = ["MIN " + money(bounds.effectiveMin), "MAX " + money(bounds.effectiveMax)].join(" · ");
        var periodNote = row.rangeFallback
          ? "Нет daily-факта за период · снимок " + (isoDate(row.currentPriceDate || row.valueDate) || "\u2014")
          : (state.dateFrom || "\u2014") + " - " + (state.dateTo || "\u2014");
        return [
          '<tr class="prices-v1-row ', selected ? 'is-selected' : '', '" data-open-price="', esc(key), '" data-price-market="', esc(row.market), '">',
          '<td><button type="button" class="prices-v1-sku-link" data-price-v1-select="', esc(key), '">', esc(row.articleKey || "\u2014"), '</button><small>', esc(row.name || ""), '</small><small>', esc(lifecycle.label || row.status || "\u2014"), '</small></td>',
          '<td><div class="prices-v1-answer-cell"><strong>', esc(priceMarketLabel(row.market)), '</strong><span>', esc(row.owner || "\u2014"), '</span><small>', esc(periodNote), '</small></div></td>',
          '<td><div class="prices-v1-answer-cell"><strong>', money(currentPrice), '</strong><span>', esc(priceNote), '</span><small>', esc(metricHelp(modalListPriceHelp(row), row.listPriceFactDate || row.priceFactDate, row.valueDate)), '</small></div></td>',
          '<td><div class="prices-v1-answer-cell"><strong>', impact.ordersUnits == null ? "\u2014" : intf(impact.ordersUnits), ' заказов</strong><span>', impact.deliveredUnits == null ? "\u2014" : intf(impact.deliveredUnits), ' выкупов</span><small>', esc(afterBefore), '</small></div></td>',
          '<td><div class="prices-v1-answer-cell"><strong>', money(revenue), '</strong><span>средний чек ', money(averageCheck), '</span><small>по выбранному периоду</small></div></td>',
          '<td><div class="prices-v1-answer-cell"><strong>', pct(row.marginTotalPct), '</strong><span>', marginRub == null ? "\u2014" : money(marginRub), '</span><small>план/допуск ', pct(row.allowedMarginPct), '</small></div></td>',
          '<td><div class="prices-v1-answer-cell"><strong>', change ? esc(signedMoneyLabel(change.deltaRub)) : "без смены", '</strong><span>', effectPct == null ? "\u2014" : esc(signedPctLabel(effectPct)), '</span><small>', change ? esc(change.date || "") : "цена в периоде не менялась", '</small></div></td>',
          '<td><div class="prices-v1-answer-cell"><strong class="', boundary ? 'bad' : (corridor && corridor.tone === "ok" ? 'ok' : ''), '">', esc(corridor ? corridor.label : "статус не определен"), '</strong><span>', esc(corridorNote), '</span><small>', esc(priceV1QualityText(row)), '</small></div></td>',
          '<td><div class="prices-v1-answer-cell"><strong>', esc(priceV1DecisionText(row)), '</strong><div>', renderRepricerCell(row.repricerDisplay), '</div><small><button type="button" class="sku-plan-open-card" data-price-v1-open-detail="', esc(key), '">Открыть SKU</button></small></div></td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table></div>'
    ].join("");
  }

  function priceV1Drawer(rows) {
    var advanced = priceV1AdvancedFilters();
    var open = Boolean(state.priceDrawerOpenV1);
    return [
      '<aside class="prices-v1-drawer ', open ? 'is-open' : '', '" aria-hidden="', open ? 'false' : 'true', '">',
      '<div class="prices-v1-drawer-head"><div><h3>Расширенные фильтры</h3><p>Только отбор строк. Цены, эффект и формулы не пересчитываются.</p></div><button type="button" data-price-v1-drawer-close>\u00d7</button></div>',
      '<div class="prices-v1-saved"><button type="button" data-price-v1-saved="priceChanged">Цена и заказы</button><button type="button" data-price-v1-saved="minMaxRisk">MIN/MAX риски</button><button type="button" data-price-v1-saved="belowMargin">Маржа и оборачиваемость</button><button type="button" data-price-v1-saved="noDailyFact">Качество данных</button></div>',
      '<div class="prices-v1-filter-checks">',
      priceV1AdvancedDefinitions().map(function (item) {
        return '<label><input type="checkbox" data-price-v1-advanced="' + esc(item.key) + '"' + (advanced[item.key] ? ' checked' : '') + '><span><b>' + esc(item.label) + '</b><em>' + esc(item.group) + '</em></span></label>';
      }).join(""),
      '</div>',
      '<div class="prices-v1-drawer-actions"><button type="button" data-price-v1-advanced-reset>Сбросить всё</button><button type="button" data-price-v1-drawer-close>Применить · ', intf(rows.length), ' SKU</button></div>',
      '</aside>'
    ].join("");
  }

  function renderRootV1() {
    var root = document.getElementById(VIEW_ID);
    if (!root) return;
    if (state.loaded) normalizeDateRange();
    ensureStyles();
    ensurePriceV1GlobalOpenHandler();
    var activeMarket = priceV1SyncGlobalMarket();
    root.dataset.priceActiveMarket = activeMarket;
    root.dataset.platform = activeMarket === "ym" ? "ya" : activeMarket;
    root.dataset.pricesDesign = "v1";
    var baseRows = visibleRows();
    var rows = priceV1Rows(baseRows);
    var summary = stats(rows);
    var dataAudit = priceDataAudit(rows);
    var poolAuditRows = state.rows.filter(function (row) {
      return activeMarket === "all" || row.market === activeMarket;
    }).map(buildDisplayRow).filter(Boolean);
    var poolAudit = priceDataAudit(poolAuditRows);
    var marketLatestFactDate = latestPriceFactDate(poolAuditRows) || latestDate(poolAuditRows);
    var overview = buildPriceOverviewModel(rows, summary);
    var sortedRows = sortedVisiblePriceRows(rows);
    var selected = state.selectedKey ? buildDisplayRow(findRow(state.selectedKey)) : sortedRows[0];
    if (selected && rows.every(function (row) { return !priceRowMatchesSelection(row, priceSelectionKey(selected)); })) selected = sortedRows[0];
    var filters = buildFilterOptions();
    var renderKeyText = [
      "prices-v1",
      state.loaded ? "ready" : (state.loading ? "loading" : "idle"),
      state.error || "",
      activeMarket,
      state.search || "",
      state.ownerFilter || "",
      state.statusFilter || "",
      state.sortBy || "",
      state.sortDir || "",
      state.dateFrom || "",
      state.dateTo || "",
      state.priceDrawerOpenV1 ? "drawer-open" : "drawer-closed",
      JSON.stringify(priceV1AdvancedFilters()),
      JSON.stringify(priceChartUi()),
      rows.length,
      priceRowsSignature(rows),
      summary.ordersUnits == null ? "" : summary.ordersUnits,
      summary.revenue == null ? "" : Math.round(summary.revenue),
      state.selectedKey || "",
      selected ? [selected.articleKey, selected.status, selected.turnoverDays, selected.currentFillPrice].join(":") : ""
    ].join("|");
    var renderKey = stableHash(renderKeyText);
    if (root.dataset.priceRenderKey === renderKey && root.querySelector(".prices-v1-shell")) return;
    root.dataset.priceRenderKey = renderKey;
    root.innerHTML = [
      '<div class="prices-v1-shell" data-prices-design="v1">',
      '<section class="prices-v1-hero">',
      '<div><span>Цена · заказы · эффект по дням</span><h2>При какой цене сколько заказов</h2><p>Смена цены видна рядом с заказами, выручкой, MIN/MAX и статусом товара.</p></div>',
      '<div class="prices-v1-actions"><button type="button" data-price-v1-refresh>Обновить</button><button type="button" data-price-export="summary">Свод в Excel</button><button type="button" data-price-export="daily">Динамика по дням</button></div>',
      '</section>',
      state.error ? '<div class="pw-error">' + esc(state.error) + '</div>' : '',
      state.loaded ? '<div class="prices-v1-freshness"><strong>Факт цены до ' + esc(marketLatestFactDate || "\u2014") + '</strong><span>' + esc(dataFreshnessLabelForDate(marketLatestFactDate)) + '</span><span>' + esc(overlayFreshnessLabel(marketLatestFactDate)) + '</span><span data-prices-v1-quality>Срез: ' + esc(priceDataAuditText(dataAudit)) + '</span><span data-prices-v1-pool-quality>Пул ' + esc(priceMarketLabel(activeMarket)) + ': ' + esc(priceDataAuditText(poolAudit)) + '</span></div>' : '',
      '<section class="prices-v1-filter-dock">',
      '<div class="prices-v1-filter-grid">',
      '<label class="prices-v1-control prices-v1-search"><span>Поиск</span><input id="pwSearch" placeholder="SKU, название, owner..." value="', esc(state.search), '"></label>',
      '<div class="prices-v1-control"><span>Период</span><div class="prices-v1-segmented"><button type="button" data-price-preset="7">7 дн.</button><button type="button" data-price-preset="14">14 дн.</button><button type="button" data-price-preset="30">30 дн.</button></div></div>',
      '<label class="prices-v1-control"><span>Дата с</span><input type="date" id="pwFrom" value="', esc(state.dateFrom), '" min="', esc(state.earliestTimelineDate || ""), '" max="', esc(todayKey()), '"></label>',
      '<label class="prices-v1-control"><span>Дата по</span><input type="date" id="pwTo" value="', esc(state.dateTo), '" min="', esc(state.earliestTimelineDate || ""), '" max="', esc(todayKey()), '"></label>',
      '<label class="prices-v1-control"><span>Owner</span><select id="pwOwnerFilter"><option value="all">Все сотрудники</option>', filters.owners.map(function (option) { return '<option value="' + esc(option.value) + '"' + (state.ownerFilter === option.value ? ' selected' : '') + '>' + esc(option.label) + '</option>'; }).join(""), '</select></label>',
      '<label class="prices-v1-control"><span>Статус товара</span><select id="pwStatusFilter"><option value="all">Все статусы</option>', filters.statuses.map(function (option) { return '<option value="' + esc(option.value) + '"' + (state.statusFilter === option.value ? ' selected' : '') + '>' + esc(option.label) + '</option>'; }).join(""), '</select></label>',
      '<label class="prices-v1-control"><span>Сортировка</span><select id="pwSort"><option value="risk"', state.sortBy === "risk" ? " selected" : "", '>Риски первыми</option><option value="orders"', state.sortBy === "orders" ? " selected" : "", '>Заказы</option><option value="revenue"', state.sortBy === "revenue" ? " selected" : "", '>Выручка</option><option value="price_change"', state.sortBy === "price_change" ? " selected" : "", '>Эффект цены</option><option value="margin"', state.sortBy === "margin" ? " selected" : "", '>Маржа</option><option value="turnover"', state.sortBy === "turnover" ? " selected" : "", '>Оборачиваемость</option><option value="article"', state.sortBy === "article" ? " selected" : "", '>Артикул</option><option value="owner"', state.sortBy === "owner" ? " selected" : "", '>Owner</option></select></label>',
      '<div class="prices-v1-filter-actions"><button type="button" data-price-v1-drawer-open>Фильтры · ', intf(priceV1AdvancedCount()), '</button><button type="button" data-price-v1-reset>Сброс</button><button type="button" data-price-v1-columns>Колонки</button></div>',
      '</div>',
      priceV1ActiveChips(summary),
      priceV1QuickFilters(baseRows),
      '</section>',
      renderPriceKpis(overview),
      renderPriceOverview(overview),
      priceV1TopSkuPanel(overview),
      priceV1SelectedPanel(selected),
      '<section class="prices-v1-table-card" id="price-table"><div class="prices-v1-section-head"><div><span>Рабочая таблица цен</span><h3>Цена · эффект · экономика · решение</h3><p>Статус товара редактируется в строке, подробности открываются без потери позиции.</p></div><div class="prices-v1-table-actions"><button type="button" data-price-minmax-template>Скачать MIN/MAX</button><button type="button" data-price-minmax-import>Загрузить MIN/MAX</button><em>', intf(rows.length), ' SKU · ', intf(summary.minMaxRisk), ' риска</em></div></div>',
      state.loading && !state.loaded ? '<div class="pw-empty">Загружаю данные вкладки Цены...</div>' : priceV1Table(rows),
      '</section>',
      '<input type="file" id="pwMinMaxFile" accept=".tsv,.csv,.txt,.html" style="display:none">',
      '<div id="priceSimpleModalHost">', renderModal(state.selectedKey ? selectedDisplayRow() : null), '</div>',
      priceV1Drawer(rows),
      '</div>'
    ].join("");
    attachPriceV1Handlers(root);
  }

  function attachPriceV1Handlers(root) {
    if (!root) return;

    if (root.dataset.priceV1Delegated !== STYLE_VERSION) {
      root.dataset.priceV1Delegated = STYLE_VERSION;
      root.addEventListener("click", function (event) {
        var target = event.target;
        var sortButton = target && target.closest ? target.closest("[data-price-sort]") : null;
        if (sortButton && root.contains(sortButton)) {
          event.preventDefault();
          event.stopPropagation();
          var key = sortButton.getAttribute("data-price-sort") || "risk";
          state.sortDir = sortToggleDirection(key);
          state.sortBy = key;
          derived.table.rowsRef = null;
          renderPriceWorkbench();
          return;
        }
        var detailButton = target && target.closest ? target.closest("[data-price-v1-open-detail]") : null;
        if (detailButton && root.contains(detailButton)) {
          event.preventDefault();
          event.stopPropagation();
          openPriceV1ModalByKey(detailButton.getAttribute("data-price-v1-open-detail") || "");
          return;
        }
        var selectButton = target && target.closest ? target.closest("[data-price-v1-select]") : null;
        if (selectButton && root.contains(selectButton)) {
          event.preventDefault();
          event.stopPropagation();
          state.selectedKey = selectButton.getAttribute("data-price-v1-select") || "";
          var shouldShowSelected = selectButton.hasAttribute("data-price-v1-show-selected");
          renderPriceWorkbench();
          if (shouldShowSelected) {
            window.requestAnimationFrame(function () {
              var selectedTarget = root.querySelector("#price-selected");
              if (selectedTarget) selectedTarget.scrollIntoView({ block: "start", behavior: "smooth" });
            });
          }
          return;
        }
        var rowNode = target && target.closest ? target.closest("[data-open-price]") : null;
        var formClick = target && target.closest ? target.closest("button,input,select,textarea,a,label") : null;
        if (rowNode && root.contains(rowNode) && !formClick) {
          event.preventDefault();
          event.stopPropagation();
          openPriceV1ModalByKey(rowNode.getAttribute("data-open-price") || "");
        }
      }, true);
    }

    var refreshButton = root.querySelector("[data-price-v1-refresh]");
    if (refreshButton) {
      refreshButton.addEventListener("click", function () {
        loadData(true);
      });
    }

    root.querySelectorAll("[data-price-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        var daysCount = Number(button.getAttribute("data-price-preset"));
        var target = state.dateTo || state.latestTimelineDate || state.latestFactDate || todayKey();
        if (!Number.isFinite(daysCount) || daysCount <= 0 || !target) return;
        state.dateTo = target;
        state.dateFrom = shiftDate(target, -(daysCount - 1));
        normalizeDateRange();
        priceV1InvalidateRows();
        renderPriceWorkbench();
      });
    });

    root.querySelectorAll("[data-price-export]").forEach(function (button) {
      button.addEventListener("click", function () {
        var rowsForExport = priceV1Rows(visibleRows());
        if (button.getAttribute("data-price-export") === "daily") {
          downloadPriceDailyExcel(rowsForExport);
          return;
        }
        downloadPriceSummaryExcel(rowsForExport);
      });
    });

    var templateButton = root.querySelector("[data-price-minmax-template]");
    if (templateButton) {
      templateButton.addEventListener("click", function () {
        downloadPriceMinMaxTemplate(priceV1Rows(visibleRows()));
      });
    }

    var importButton = root.querySelector("[data-price-minmax-import]");
    if (importButton) {
      importButton.addEventListener("click", function () {
        var fileInput = root.querySelector("#pwMinMaxFile");
        if (fileInput) fileInput.click();
      });
    }

    var fileInput = root.querySelector("#pwMinMaxFile");
    if (fileInput) {
      fileInput.addEventListener("change", function (event) {
        var file = event && event.target && event.target.files ? event.target.files[0] : null;
        if (!file) return;
        importPriceMinMaxFile(file);
        event.target.value = "";
      });
    }

    var fromInput = root.querySelector("#pwFrom");
    var toInput = root.querySelector("#pwTo");
    function attachDateHandlers(input, apply) {
      if (!input) return;
      input.addEventListener("change", apply);
      input.addEventListener("input", apply);
      input.addEventListener("click", function () {
        try {
          if (typeof input.showPicker === "function") input.showPicker();
        } catch (error) {}
      });
    }
    attachDateHandlers(fromInput, function () {
      state.dateFrom = fromInput.value;
      normalizeDateRange();
      priceV1InvalidateRows();
      renderPriceWorkbench();
    });
    attachDateHandlers(toInput, function () {
      state.dateTo = toInput.value;
      normalizeDateRange();
      priceV1InvalidateRows();
      renderPriceWorkbench();
    });

    var searchInput = root.querySelector("#pwSearch");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        window.clearTimeout(state.priceV1SearchTimer);
        state.priceV1SearchTimer = window.setTimeout(function () {
          state.search = searchInput.value;
          priceV1InvalidateRows();
          renderPriceWorkbench();
        }, 90);
      });
    }

    var ownerFilterInput = root.querySelector("#pwOwnerFilter");
    if (ownerFilterInput) {
      ownerFilterInput.addEventListener("change", function () {
        state.ownerFilter = ownerFilterInput.value || "all";
        priceV1InvalidateRows();
        renderPriceWorkbench();
      });
    }

    var statusFilterInput = root.querySelector("#pwStatusFilter");
    if (statusFilterInput) {
      statusFilterInput.addEventListener("change", function () {
        state.statusFilter = statusFilterInput.value || "all";
        priceV1InvalidateRows();
        renderPriceWorkbench();
      });
    }

    var sortInput = root.querySelector("#pwSort");
    if (sortInput) {
      sortInput.addEventListener("change", function () {
        var nextSort = sortInput.value || "orders";
        if (state.sortBy !== nextSort) state.sortDir = sortToggleDirection(nextSort);
        state.sortBy = nextSort;
        derived.table.rowsRef = null;
        renderPriceWorkbench();
      });
    }

    var drawerOpen = root.querySelector("[data-price-v1-drawer-open]");
    if (drawerOpen) {
      drawerOpen.addEventListener("click", function () {
        state.priceDrawerOpenV1 = true;
        renderPriceWorkbench();
      });
    }

    root.querySelectorAll("[data-price-v1-drawer-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.priceDrawerOpenV1 = false;
        renderPriceWorkbench();
      });
    });

    root.querySelectorAll("[data-price-v1-advanced]").forEach(function (input) {
      input.addEventListener("change", function () {
        var key = input.getAttribute("data-price-v1-advanced");
        state.priceAdvancedFiltersV1 = Object.assign({}, priceV1AdvancedFilters());
        state.priceAdvancedFiltersV1[key] = input.checked;
        priceV1InvalidateRows();
        renderPriceWorkbench();
      });
    });

    root.querySelectorAll("[data-price-v1-saved]").forEach(function (button) {
      button.addEventListener("click", function () {
        var key = button.getAttribute("data-price-v1-saved");
        state.priceAdvancedFiltersV1 = Object.create(null);
        state.priceAdvancedFiltersV1[key] = true;
        priceV1InvalidateRows();
        renderPriceWorkbench();
        window.requestAnimationFrame(function () {
          var table = root.querySelector("#price-table");
          if (table) table.scrollIntoView({ block: "start", behavior: "smooth" });
        });
      });
    });

    var advancedReset = root.querySelector("[data-price-v1-advanced-reset]");
    if (advancedReset) {
      advancedReset.addEventListener("click", function () {
        state.priceAdvancedFiltersV1 = Object.create(null);
        priceV1InvalidateRows();
        renderPriceWorkbench();
      });
    }

    root.querySelectorAll("[data-price-v1-clear]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-price-v1-clear");
        if (target === "owner") state.ownerFilter = "all";
        if (target === "status") state.statusFilter = "all";
        if (target && target.indexOf("adv:") === 0) {
          var advancedKey = target.slice(4);
          state.priceAdvancedFiltersV1 = Object.assign({}, priceV1AdvancedFilters());
          delete state.priceAdvancedFiltersV1[advancedKey];
        }
        if (target === "sort") {
          state.sortBy = "orders";
          state.sortDir = "desc";
          derived.table.rowsRef = null;
        }
        if (target === "advanced") state.priceAdvancedFiltersV1 = Object.create(null);
        priceV1InvalidateRows();
        renderPriceWorkbench();
      });
    });

    var resetButton = root.querySelector("[data-price-v1-reset]");
    if (resetButton) {
      resetButton.addEventListener("click", function () {
        state.search = "";
        state.ownerFilter = "all";
        state.statusFilter = "all";
        state.sortBy = "orders";
        state.sortDir = "desc";
        state.priceAdvancedFiltersV1 = Object.create(null);
        state.priceDrawerOpenV1 = false;
        priceV1InvalidateRows();
        renderPriceWorkbench();
      });
    }

    var columnsButton = root.querySelector("[data-price-v1-columns]");
    if (columnsButton) {
      columnsButton.addEventListener("click", function () {
        var tableWrap = root.querySelector(".prices-v1-table-wrap");
        if (!tableWrap) return;
        var maxLeft = Math.max(0, tableWrap.scrollWidth - tableWrap.clientWidth);
        tableWrap.scrollTo({ left: tableWrap.scrollLeft > 16 ? 0 : maxLeft, behavior: "smooth" });
      });
    }

    root.querySelectorAll("[data-price-margin-metric]").forEach(function (button) {
      button.addEventListener("click", function () {
        priceChartUi().marginMetric = button.getAttribute("data-price-margin-metric") === "rub" ? "rub" : "pct";
        renderPriceWorkbench();
      });
    });

    root.querySelectorAll("[data-price-series]").forEach(function (button) {
      button.addEventListener("click", function () {
        var key = button.getAttribute("data-price-series");
        if (!key) return;
        var ui = priceChartUi();
        ui.hiddenSeries[key] = !ui.hiddenSeries[key];
        renderPriceWorkbench();
      });
    });

    root.querySelectorAll("[data-price-chart-focus]").forEach(function (button) {
      button.addEventListener("click", function () {
        priceChartUi().skuChartFocus = button.getAttribute("data-price-chart-focus") === "corridor" ? "corridor" : "fact";
        renderPriceWorkbench();
      });
    });

    root.querySelectorAll("[data-price-v1-day]").forEach(function (node) {
      node.addEventListener("click", function () {
        priceChartUi().selectedDate = node.getAttribute("data-price-v1-day") || "";
        renderPriceWorkbench();
      });
      node.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        priceChartUi().selectedDate = node.getAttribute("data-price-v1-day") || "";
        renderPriceWorkbench();
      });
    });

    root.querySelectorAll("[data-price-v1-scroll]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-price-v1-scroll");
        var target = id ? root.querySelector("#" + id) : null;
        if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    });

    root.querySelectorAll("[data-price-v1-insight]").forEach(function (button) {
      button.addEventListener("click", function () {
        var key = button.getAttribute("data-price-v1-insight");
        if (key) {
          state.sortBy = key;
          state.sortDir = sortToggleDirection(key);
          derived.table.rowsRef = null;
        }
        var table = root.querySelector("#price-table");
        if (table) table.scrollIntoView({ block: "start", behavior: "smooth" });
        renderPriceWorkbench();
      });
    });

    attachPriceLifecycleForms(root);
    attachModalHandlers();
  }

  function renderRoot() {
    var root = document.getElementById(VIEW_ID);
    if (!root) return;
    if (state.loaded) normalizeDateRange();
    ensureStyles();
    var activeMarket = state.market || "all";
    root.dataset.priceActiveMarket = activeMarket;
    root.dataset.platform = activeMarket === "ym" ? "ya" : activeMarket;
    var rows = visibleRows();
    var summary = stats(rows);
    var selected = state.selectedKey ? buildDisplayRow(findRow(state.selectedKey)) : null;
    var filters = buildFilterOptions();
    var renderKeyText = [
      state.loaded ? "ready" : (state.loading ? "loading" : "idle"),
      state.loaded ? "loaded" : "cold",
      state.error || "",
      activeMarket,
      state.search || "",
      state.ownerFilter || "",
      state.statusFilter || "",
      state.sortBy || "",
      state.sortDir || "",
      state.dateFrom || "",
      state.dateTo || "",
      state.latestFactDate || "",
      state.sourceNote || "",
      rows.length,
      priceRowsSignature(rows),
      summary.ordersUnits == null ? "" : summary.ordersUnits,
      summary.revenue == null ? "" : Math.round(summary.revenue),
      summary.priceChanges || 0,
      summary.impactWins || 0,
      summary.impactDrops || 0,
      summary.minMaxRisk || 0,
      state.selectedKey || "",
      selected ? [selected.articleKey, selected.status, selected.turnoverDays, selected.currentFillPrice].join(":") : ""
    ].join("|");
    var renderKey = stableHash(renderKeyText);
    if (root.dataset.priceRenderKey === renderKey && root.querySelector(".pw-shell")) return;
    root.dataset.priceRenderKey = renderKey;
    root.innerHTML = [
      '<div class="pw-shell">',
      '<section class="pw-card">',
      '<div class="pw-title">\u0426\u0435\u043d\u044b</div>',
      '<div class="pw-sub">\u0416\u0443\u0440\u043d\u0430\u043b \u043f\u043e SKU: \u0446\u0435\u043d\u0430 \u043f\u043e \u0434\u043d\u044f\u043c, \u0421\u041f\u041f, MIN/MAX, \u0437\u0430\u043a\u0430\u0437\u044b \u0438 \u044d\u0444\u0444\u0435\u043a\u0442 \u043f\u043e\u0441\u043b\u0435 \u0441\u043c\u0435\u043d\u044b \u0446\u0435\u043d\u044b.</div>',
      state.error ? '<div class="pw-error">' + esc(state.error) + '</div>' : '',
      state.loaded ? '<div class="pw-alert ' + (state.dataLagDays > 1 ? 'warn' : '') + '"><strong>\u0414\u0430\u0442\u0430 \u0441\u0440\u0435\u0437\u0430: ' + esc(state.latestFactDate || "\u2014") + '</strong><div>' + esc(dataFreshnessLabel()) + '</div>' + (state.overlayGeneratedAt ? '<div style="margin-top:6px">' + esc(overlayFreshnessLabel()) + '</div>' : '') + '<div style="margin-top:6px">\u0412 \u0442\u0430\u0431\u043b\u0438\u0446\u0435 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u044e\u044e \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u0443\u044e \u0442\u043e\u0447\u043a\u0443 \u0432\u043d\u0443\u0442\u0440\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0430, \u0430 \u043d\u0435 \u043f\u0440\u043e\u0441\u0442\u043e \u0437\u0430\u0441\u0442\u044b\u0432\u0448\u0438\u0439 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 row.</div></div>' : '',
      '<div class="pw-grid" style="margin-top:14px;">',
      '<div class="pw-card">',
      '<div class="pw-label">\u041f\u043b\u043e\u0449\u0430\u0434\u043a\u0430 \u0438 \u043f\u0435\u0440\u0438\u043e\u0434</div>',
      '<div class="pw-chip-row">',
      (state.availableMarkets && state.availableMarkets.length ? state.availableMarkets : PRICE_MARKETS).map(function (market) {
        return '<button type="button" class="pw-chip ' + (state.market === market ? 'active' : '') + '" data-price-market="' + esc(market) + '">' + esc(priceMarketLabel(market)) + '</button>';
      }).join(""),
      '</div>',
      '<div class="pw-chip-row">',
      '<button type="button" class="pw-chip" data-price-preset="7">7 \u0434\u043d\u0435\u0439</button>',
      '<button type="button" class="pw-chip" data-price-preset="14">14 \u0434\u043d\u0435\u0439</button>',
      '<button type="button" class="pw-chip" data-price-preset="30">30 \u0434\u043d\u0435\u0439</button>',
      '<button type="button" class="pw-chip" data-price-anchor="today">\u0421\u0435\u0433\u043e\u0434\u043d\u044f</button>',
      '<button type="button" class="pw-chip" data-price-anchor="latest">\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0441\u0440\u0435\u0437</button>',
      '</div>',
      '<div class="pw-grid2">',
      '<input type="date" id="pwFrom" value="', esc(state.dateFrom), '" min="', esc(state.earliestTimelineDate || ""), '" max="', esc(todayKey()), '">',
      '<input type="date" id="pwTo" value="', esc(state.dateTo), '" min="', esc(state.earliestTimelineDate || ""), '" max="', esc(todayKey()), '">',
      '</div></div>',
      '<div class="pw-card">',
      '<div class="pw-label">\u041f\u043e\u0438\u0441\u043a</div>',
      '<input class="pw-search" id="pwSearch" placeholder="\u0410\u0440\u0442\u0438\u043a\u0443\u043b / SKU, \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435, owner, \u0441\u0442\u0430\u0442\u0443\u0441" value="', esc(state.search), '">',
      '<div class="pw-grid2" style="margin-top:10px;">',
      '<select id="pwOwnerFilter"><option value="all">Все owner</option>',
      filters.owners.map(function (option) { return '<option value="' + esc(option.value) + '"' + (state.ownerFilter === option.value ? ' selected' : '') + '>' + esc(option.label) + '</option>'; }).join(""),
      '</select>',
      '<select id="pwStatusFilter"><option value="all">Все статусы</option>',
      filters.statuses.map(function (option) { return '<option value="' + esc(option.value) + '"' + (state.statusFilter === option.value ? ' selected' : '') + '>' + esc(option.label) + '</option>'; }).join(""),
      '</select>',
      '</div>',
      '<div class="pw-note">\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: ', esc(state.sourceNote || DATA_URL), '</div>',
      '</div></div>',
      '</section>',
      '<section class="pw-card">',
      '<div class="pw-table-head"><div class="pw-label">\u0422\u0430\u0431\u043b\u0438\u0446\u0430</div><div class="pw-chip-row"><button type="button" class="pw-chip" data-price-export="summary">\u0421\u0432\u043e\u0434 \u0432 Excel</button><button type="button" class="pw-chip" data-price-export="daily">\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430 \u043f\u043e \u0434\u043d\u044f\u043c</button><button type="button" class="pw-chip" data-price-minmax-template>\u0421\u043a\u0430\u0447\u0430\u0442\u044c MIN/MAX (TSV)</button><button type="button" class="pw-chip" data-price-minmax-import>\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c MIN/MAX</button></div></div>',
      renderPriceGameStrip(rows, summary),
      '<div class="pw-ledger-summary"><span><b>', intf(summary.count), '</b><small>SKU</small></span><span><b>', summary.ordersUnits == null ? "\u2014" : intf(summary.ordersUnits), '</b><small>\u0417\u0430\u043a\u0430\u0437\u044b</small></span><span><b>', money(summary.revenue), '</b><small>\u0412\u044b\u0440\u0443\u0447\u043a\u0430</small></span><span><b>', intf(summary.priceChanges), '</b><small>\u0421\u043c\u0435\u043d\u044b \u0446\u0435\u043d</small></span><span><b>', intf(summary.belowAllowed), '</b><small>\u041d\u0438\u0436\u0435 3\u043c</small></span></div>',
      '<div class="pw-note" style="margin-top:10px">\u041f\u0435\u0440\u0438\u043e\u0434: ', esc(state.dateFrom || "\u2014"), ' - ', esc(state.dateTo || "\u2014"), ' \u00b7 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a: ', esc(state.sourceNote || DATA_URL), '</div>',
      state.loading && !state.loaded ? '<div class="pw-empty">\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u044e \u0434\u0430\u043d\u043d\u044b\u0435 \u0432\u043a\u043b\u0430\u0434\u043a\u0438 \u0426\u0435\u043d\u044b...</div>' : renderTable(rows),
      '</section>',
      '<input type="file" id="pwMinMaxFile" accept=".tsv,.csv,.txt,.html" style="display:none">',
      '<div id="priceSimpleModalHost">', renderModal(selected), '</div>',
      '</div>'
    ].join("");

    root.querySelectorAll("[data-price-market]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.market = button.getAttribute("data-price-market");
        state.ownerFilter = "all";
        state.statusFilter = "all";
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
    root.querySelectorAll("[data-price-export]").forEach(function (button) {
      button.addEventListener("click", function () {
        var rowsForExport = visibleRows();
        if (button.getAttribute("data-price-export") === "daily") {
          downloadPriceDailyExcel(rowsForExport);
          return;
        }
        downloadPriceSummaryExcel(rowsForExport);
      });
    });
    root.querySelector("[data-price-minmax-template]")?.addEventListener("click", function () {
      downloadPriceMinMaxTemplate(visibleRows());
    });
    root.querySelector("[data-price-minmax-import]")?.addEventListener("click", function () {
      root.querySelector("#pwMinMaxFile")?.click();
    });
    root.querySelector("#pwMinMaxFile")?.addEventListener("change", function (event) {
      var file = event && event.target && event.target.files ? event.target.files[0] : null;
      if (!file) return;
      importPriceMinMaxFile(file);
      event.target.value = "";
    });
    var fromInput = document.getElementById("pwFrom");
    var toInput = document.getElementById("pwTo");
    var searchInput = document.getElementById("pwSearch");
    var ownerFilterInput = document.getElementById("pwOwnerFilter");
    var statusFilterInput = document.getElementById("pwStatusFilter");
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
    if (ownerFilterInput) ownerFilterInput.addEventListener("change", function () {
      state.ownerFilter = ownerFilterInput.value || "all";
      renderPriceWorkbench();
    });
    if (statusFilterInput) statusFilterInput.addEventListener("change", function () {
      state.statusFilter = statusFilterInput.value || "all";
      renderPriceWorkbench();
    });
    attachPriceLifecycleForms(root);
    root.querySelectorAll("[data-open-price]").forEach(function (rowNode) {
      var rememberScroll = function () {
        modalScrollState.pendingOpenY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      };
      rowNode.addEventListener("mousedown", rememberScroll);
      rowNode.addEventListener("touchstart", rememberScroll, { passive: true });
      rowNode.addEventListener("click", function (event) {
        event.preventDefault();
        openPriceV1ModalByKey(rowNode.getAttribute("data-open-price") || "");
      });
    });
    root.querySelectorAll("[data-open-product-leaderboard]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openProductLeaderboard(button.getAttribute("data-open-product-leaderboard"));
      });
    });
    attachModalHandlers();
  }

  function renderPriceWorkbench() {
    renderRootV1();
  }

  function renderPriceWorkbenchIfActive() {
    if (!document.querySelector("#view-prices.view.active")) return;
    renderPriceWorkbench();
    if (!state.loaded && !state.loading) loadData();
  }

  window.renderPriceWorkbench = renderPriceWorkbench;
  window.__alteaRefreshPriceWorkbench = function refreshPriceWorkbench(forceRefresh) {
    return loadData(forceRefresh !== false);
  };

  window.addEventListener("altea:portal-storage-updated", function (event) {
    if (!event || !event.detail || event.detail.key !== "brand-portal-local-v1") return;
    if (!state.loaded) return;
    if (document.querySelector("#view-prices.view.active")) {
      renderPriceWorkbench();
    } else {
      derived.portalStorageRaw = null;
      derived.portalStorageParsed = null;
      derived.explicitRepricerMapRaw = null;
      derived.explicitRepricerMap = null;
    }
  });

  window.addEventListener("altea:marketplacechange", function (event) {
    var detail = event && event.detail ? event.detail : {};
    priceV1SyncGlobalMarket(detail.internalPlatform || detail.marketplace || detail.platform || detail.market);
    if (document.querySelector("#view-prices.view.active")) {
      renderPriceWorkbench();
    }
  });

  window.addEventListener("altea:viewchange", function () {
    window.setTimeout(renderPriceWorkbenchIfActive, 0);
  });

  window.addEventListener("hashchange", function () {
    window.setTimeout(renderPriceWorkbenchIfActive, 0);
  });

  window.addEventListener("altea:data-ready", function () {
    window.setTimeout(renderPriceWorkbenchIfActive, 0);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.selectedKey) {
      state.selectedKey = "";
      renderSelectedModal();
      unlockModalBackgroundScroll();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderPriceWorkbenchIfActive, { once: true });
  } else {
    renderPriceWorkbenchIfActive();
  }

  document.getElementById("pullRemoteBtn")?.addEventListener("click", function () {
    window.setTimeout(function () {
      loadData(true);
    }, 180);
  });
})();
