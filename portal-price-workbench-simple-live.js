(function () {
  if (window.__ALTEA_PRICE_SIMPLE_RENDERER_20260503C__) return;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260503C__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260503B__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260503A__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260502A__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260429A__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260428C__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260428B__ = true;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260428A__ = true;

  var DATA_URL = "data/smart_price_workbench.json";
  var OVERLAY_URL = "data/smart_price_overlay.json";
  var PRICES_URL = "data/prices.json";
  var LIVE_DATA_URL = "tmp-smart_price_workbench-live.json";
  var REPRICER_URL = "data/repricer.json";
  var REPRICER_LIVE_URL = "tmp-live-repricer.json";
  var ORDER_PROCUREMENT_URL = "data/order_procurement.json";
  var ORDER_PROCUREMENT_WB_URL = "data/order_procurement_wb.json";
  var ORDER_PROCUREMENT_OZON_URL = "data/order_procurement_ozon.json";
  var VIEW_ID = "view-prices";
  var STYLE_ID = "altea-price-simple-style";
  var SNAPSHOT_WAIT_MS = 1800;
  var SNAPSHOT_HARD_WAIT_MS = 4500;
  var LOCAL_FETCH_TIMEOUT_MS = 3200;
  var LOAD_GUARD_MS = 12000;
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
    liveGeneratedAt: "",
    repricer: { generatedAt: "", rows: [] },
    repricerLive: { generatedAt: "", rows: [] },
    market: "wb",
    search: "",
    ownerFilter: "all",
    statusFilter: "all",
    sortBy: "risk",
    sortDir: "desc",
    selectedKey: "",
    dateFrom: "",
    dateTo: "",
    latestFactDate: "",
    latestTimelineDate: "",
    earliestTimelineDate: "",
    dataLagDays: 0,
    loadNonce: 0
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

  function upsertMinMaxOverride(articleKey, platform, values) {
    var targetArticle = String(articleKey || "").trim();
    var targetPlatform = repricerMarket(platform);
    if (!targetArticle || (targetPlatform !== "wb" && targetPlatform !== "ozon")) return;

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

    portal.repricerOverrides = overrides;
    writePortalStorageState(portal);
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
    return 0;
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
    var syncedManualMin = moneyRound(syncedOverride && syncedOverride.floorPrice);
    var syncedManualMax = moneyRound(syncedOverride && syncedOverride.capPrice);
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
      minSource: syncedManualMin != null && syncedManualMin > 0 ? "ручной" : (syncedCorridorMin != null ? "коридор" : "расчет"),
      maxSource: syncedManualMax != null && syncedManualMax > 0 ? "ручной" : (syncedCorridorMax != null ? "коридор" : "расчет")
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
      ".pw-stat strong{display:block;margin-top:8px;font-size:28px;color:#fff0cf;}",
      ".pw-stat small{display:block;margin-top:6px;color:#cdb892;line-height:1.45;}",
      ".pw-table-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;}",
      ".pw-table-wrap{overflow:auto;max-height:72vh;border-radius:14px;}",
      ".pw-table{width:100%;border-collapse:collapse;min-width:1180px;}",
      ".pw-table th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#bda57a;text-align:left;padding:0 14px 10px;position:sticky;top:0;z-index:2;background:rgba(10,8,6,.96);backdrop-filter:blur(4px);}",
      ".pw-th-btn{border:0;background:transparent;color:inherit;text-transform:inherit;letter-spacing:inherit;font:inherit;cursor:pointer;padding:0;line-height:1.2;}",
      ".pw-th-btn:hover{color:#f4e6c6;}",
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
    var root = rootState() || {};
    var skuRows = Array.isArray(root.skus) ? root.skus : [];
    skuRows.forEach(function (row) {
      var key = norm(row && (row.articleKey || row.article || row.sku));
      if (!key || map[key]) return;
      var rawPlatformOwners = row && row.ownersByPlatform && typeof row.ownersByPlatform === "object"
        ? row.ownersByPlatform
        : (row && row.owner && typeof row.owner === "object" && row.owner.byPlatform && typeof row.owner.byPlatform === "object"
          ? row.owner.byPlatform
          : {});
      map[key] = {
        owner: normalizeOwnerValue(row && row.owner && typeof row.owner === "object" ? row.owner.name : (row && row.owner)),
        ownersByPlatform: {
          wb: normalizeOwnerValue(rawPlatformOwners && rawPlatformOwners.wb),
          ozon: normalizeOwnerValue(rawPlatformOwners && rawPlatformOwners.ozon),
          ym: normalizeOwnerValue(rawPlatformOwners && (rawPlatformOwners.ym || rawPlatformOwners.ya)),
          ya: normalizeOwnerValue(rawPlatformOwners && (rawPlatformOwners.ya || rawPlatformOwners.ym))
        },
        status: row && (row.statusSku || row.status),
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

  function buildRow(source, market, manualMap, overlayRow, priceRow, liveRow, liveGeneratedAt, maxDate, skuMeta, orderProcurementRow) {
    var timeline = pickPrimaryTimeline(source, overlayRow);
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
    var priceFillPrice = num(priceRow && (priceRow.currentPrice != null ? priceRow.currentPrice : priceRow.currentFillPrice));
    var priceClientPrice = num(priceRow && priceRow.currentClientPrice);
    var priceSppPct = num(priceRow && priceRow.currentSppPct);
    var priceTurnoverDays = num(priceRow && priceRow.currentTurnoverDays);
    var priceCurrentDate = isoDate(priceRow && (priceRow.currentPriceDate || priceRow.historyFreshnessDate));
    var sourceListPrice = firstPositive(source && source.firstPrice, source && source.currentFirstPrice, source && source.sellerPrice, source && source.currentSellerPriceBeforeDiscount);
    var overlayListPrice = firstPositive(overlayRow && overlayRow.firstPrice, overlayRow && overlayRow.currentFirstPrice, overlayRow && overlayRow.sellerPrice, overlayRow && overlayRow.currentSellerPriceBeforeDiscount);
    var priceListPrice = firstPositive(priceRow && priceRow.firstPrice, priceRow && priceRow.currentFirstPrice, priceRow && priceRow.sellerPrice, priceRow && priceRow.currentSellerPriceBeforeDiscount);
    var liveFillPrice = num(liveRow && (liveRow.currentFillPrice != null ? liveRow.currentFillPrice : liveRow.currentPrice));
    var liveClientPrice = num(liveRow && liveRow.currentClientPrice);
    var liveListPrice = firstPositive(liveRow && liveRow.firstPrice, liveRow && liveRow.currentFirstPrice, liveRow && liveRow.sellerPrice, liveRow && liveRow.currentSellerPriceBeforeDiscount);
    var livePriceDate = isoDate(liveRow && (liveRow.valueDate || liveRow.historyFreshnessDate || liveGeneratedAt));
    var sourceValueDate = isoDate(source && source.historyFreshnessDate) || isoDate(maxDate);
    var useOverlayFacts = Boolean(overlayRow) && (!overlayValueDate || !sourceValueDate || overlayValueDate >= sourceValueDate);
    var sourceFillPrice = num(source.currentFillPrice != null ? source.currentFillPrice : source.currentPrice);
    var sourceClientPrice = num(source.currentClientPrice);
    var sourceSppPct = num(source.currentSppPct);
    var sourceTurnoverDays = num(source.turnoverCurrentDays != null ? source.turnoverCurrentDays : source.currentTurnoverDays);
    var procurementTurnoverDays = num(orderProcurementRow && orderProcurementRow.turnoverDays);
    var sourcePriceMode = String(source && source.sourceMode || "");
    var overlayPriceMode = String(overlayRow && overlayRow.sourceMode || "");
    var pricePriceMode = String(priceRow && priceRow.sourceMode || "");
    var livePriceMode = String(liveRow && liveRow.sourceMode || "");
    var currentFillPrice = overlayClearsFill
      ? null
      : (priceFillPrice != null
        ? priceFillPrice
        : (liveFillPrice != null
        ? liveFillPrice
        : ((overlayFillPrice != null && (useOverlayFacts || sourceFillPrice == null)) ? overlayFillPrice : sourceFillPrice)));
    var currentFillPriceSource = priceFillPrice != null
      ? "prices"
      : (liveFillPrice != null
      ? "live"
      : ((overlayFillPrice != null && (useOverlayFacts || sourceFillPrice == null)) ? "overlay" : "workbench"));
    var currentFillPriceMode = priceFillPrice != null
      ? pricePriceMode
      : (liveFillPrice != null
      ? livePriceMode
      : ((overlayFillPrice != null && (useOverlayFacts || sourceFillPrice == null)) ? overlayPriceMode : sourcePriceMode));
    var listPrice = priceListPrice != null
      ? priceListPrice
      : ((overlayListPrice != null && (useOverlayFacts || sourceListPrice == null))
        ? overlayListPrice
        : (sourceListPrice != null ? sourceListPrice : liveListPrice));
    var listPriceSource = priceListPrice != null
      ? "prices"
      : ((overlayListPrice != null && (useOverlayFacts || sourceListPrice == null))
        ? "overlay"
        : (sourceListPrice != null ? "workbench" : (liveListPrice != null ? "live" : "")));
    var listPriceMode = priceListPrice != null
      ? pricePriceMode
      : ((overlayListPrice != null && (useOverlayFacts || sourceListPrice == null))
        ? overlayPriceMode
        : (sourceListPrice != null ? sourcePriceMode : livePriceMode));
    var listPriceDate = listPriceSource === "prices"
      ? (priceCurrentDate || livePriceDate || overlayValueDate || sourceValueDate || isoDate(maxDate))
      : (listPriceSource === "overlay"
        ? (overlayValueDate || priceCurrentDate || sourceValueDate || livePriceDate || isoDate(maxDate))
        : (listPriceSource === "workbench"
          ? (sourceValueDate || overlayValueDate || priceCurrentDate || livePriceDate || isoDate(maxDate))
          : (livePriceDate || isoDate(liveGeneratedAt) || sourceValueDate || overlayValueDate || priceCurrentDate || isoDate(maxDate))));
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
    var skuPlatformOwner = skuMetaPlatformOwner(skuRow, market);
    var resolvedOwner = normalizeOwnerValue(overlayOwner || skuPlatformOwner || source.owner || (skuRow && skuRow.owner) || "");
    var row = {
      market: market,
      articleKey: source.articleKey || source.article || source.sku || "",
      name: source.name || source.title || source.articleKey || "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f",
      owner: resolvedOwner || "\u2014",
      status: overlayStatus || source.status || (skuRow && skuRow.status) || "\u2014",
      role: source.role || (skuRow && skuRow.role) || "\u2014",
      launchReady: source.launchReady || (skuRow && skuRow.launchReady) || "\u2014",
      allowedMarginPct: num(source.allowedMarginPct),
      marginTotalPct: num(source.marginTotalPct != null ? source.marginTotalPct : source.avgMargin7dPct),
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
        : (priceClientPrice != null
          ? priceClientPrice
          : ((overlayClientPrice != null && (useOverlayFacts || sourceClientPrice == null))
          ? overlayClientPrice
          : ((liveClientPrice != null && sourceClientPrice == null) ? liveClientPrice : sourceClientPrice))),
      currentSppPct: overlayClearsSpp
        ? null
        : sanitizeDiscountPct(priceSppPct != null
          ? priceSppPct
          : ((overlaySppPct != null && (useOverlayFacts || sourceSppPct == null)) ? overlaySppPct : sourceSppPct)),
      requiredPriceForMargin: num(source.requiredPriceForMargin),
      historyNote: source.historyNote || "",
      currentPriceDate: priceFillPrice != null
        ? (priceCurrentDate || livePriceDate || overlayValueDate || sourceValueDate || isoDate(maxDate))
        : (liveFillPrice != null
        ? (livePriceDate || overlayValueDate || sourceValueDate || isoDate(maxDate))
        : ((useOverlayFacts && overlayValueDate) ? overlayValueDate : (sourceValueDate || isoDate(maxDate)))),
      valueDate: (useOverlayFacts && overlayValueDate) ? overlayValueDate : (sourceValueDate || isoDate(maxDate)),
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
      var liveResult = await tryLoadSnapshotAwareJson(LIVE_DATA_URL);
      if (liveResult) {
        livePayload = liveResult.payload || null;
        liveSource = liveResult.source || "local";
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
      var rows = [];
      Object.keys(payload.platforms || {}).forEach(function (market) {
        normalizeRows((payload.platforms[market] || {}).rows).forEach(function (item) {
          var overlayRow = overlayMaps[market] && overlayMaps[market][norm(item.articleKey || item.article || item.sku)];
          var priceRow = pricesMaps[market] && pricesMaps[market][norm(item.articleKey || item.article || item.sku)];
          var liveRow = liveMaps[market] && liveMaps[market][norm(item.articleKey || item.article || item.sku)];
          var orderProcurementRow = orderProcurementLookup.maps[market] && orderProcurementLookup.maps[market][norm(item.articleKey || item.article || item.sku)];
          rows.push(buildRow(item, market, manualMap, overlayRow || null, priceRow || null, liveRow || null, livePayload && livePayload.generatedAt, maxDate, skuMetaMap, orderProcurementRow || null));
        });
      });
      state.rows = rows;
      state.liveGeneratedAt = livePayload && livePayload.generatedAt ? livePayload.generatedAt : "";
      state.overlayGeneratedAt = overlayPayload && overlayPayload.generatedAt ? overlayPayload.generatedAt : "";
      state.orderProcurementGeneratedAt = orderProcurementLookup.generatedAt || "";
      state.orderProcurementFallbackCount = rows.filter(function (row) { return row.turnoverSource === "order_procurement"; }).length;
      state.sourceNote = overlayPayload && overlayPayload.generatedAt
        ? DATA_URL + " (" + dataResult.source + ")"
          + (pricesPayload && pricesPayload.generatedAt ? " + " + PRICES_URL + " (" + pricesSource + ")" : "")
          + (state.liveGeneratedAt ? " + " + LIVE_DATA_URL + " (" + liveSource + ")" : "")
          + " + " + OVERLAY_URL + " (" + overlaySource + ") \u00b7 \u0446\u0435\u043d\u044b \u0434\u043e " + isoDate(overlayPayload.asOfDate || overlayPayload.generatedAt)
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
      window.clearTimeout(loadGuard);
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
    next.productLeaderboard = findProductLeaderboardEntry(next.articleKey);
    var point = latestRangePoint(row);
    next.rangeHasPoint = Boolean(point);
    next.repricerDisplay = buildRepricerDisplay(next.market, next.articleKey);
    next.repricerBounds = buildRepricerBounds(next.market, next.articleKey);
    if (!point) return next;

    var priceMetric = latestNonNullRangeMetric(row, "price");
    var clientMetric = latestNonNullRangeMetric(row, "clientPrice");
    var sppMetric = latestNonNullRangeMetric(row, "sppPct");
    var turnoverMetric = latestNonNullRangeMetric(row, "turnoverDays");
    var currentSnapshotPrice = /^(live|prices)$/i.test(String(row.currentFillPriceSource || "")) ? num(row.currentFillPrice) : null;
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
    next.listPrice = num(row.listPrice) != null ? num(row.listPrice) : num(next.currentFillPrice);
    next.listPriceFactDate = isoDate(row.listPriceDate) || next.priceFactDate || next.valueDate;
    next.listPriceSource = String(row.listPriceSource || row.currentFillPriceSource || "").trim();
    if (next.listPrice != null && next.currentFillPrice != null && next.listPrice > 0 && next.listPrice >= next.currentFillPrice) {
      next.sellerDiscountPct = sanitizeDiscountPct(1 - (next.currentFillPrice / next.listPrice));
    } else {
      next.sellerDiscountPct = null;
    }
    return next;
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
      if (ownerFilter !== "all" && norm(row.owner) !== ownerFilter) return;
      if (statusFilter !== "all" && norm(row.status) !== statusFilter) return;
      if (search) {
        var hay = [row.articleKey, row.name, row.owner, row.status, row.comment, row.reason].join(" ").toLowerCase();
        var hayNorm = norm(hay);
        if (hay.indexOf(search) === -1 && (!searchNorm || hayNorm.indexOf(searchNorm) === -1)) return;
      }
      var displayRow = buildDisplayRow(row);
      if ((state.dateFrom || state.dateTo) && !displayRow.rangeHasPoint) return;
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
    rows.forEach(function (row) {
      if (row.listPrice != null) price.push(row.listPrice);
      else if (row.currentFillPrice != null) price.push(row.currentFillPrice);
      if (row.marginTotalPct != null) margin.push(row.marginTotalPct);
      if (row.turnoverDays != null) turnover.push(row.turnoverDays);
      if (row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct) below += 1;
    });
    var summary = {
      count: rows.length,
      avgPrice: mean(price),
      avgMargin: mean(margin),
      avgTurnover: mean(turnover),
      belowAllowed: below
    };
    derived.stats.rowsRef = rows;
    derived.stats.value = summary;
    return summary;
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
      return {
        marketplace: row.market === "ym" ? "Я.Маркет" : String(row.market || "").toUpperCase(),
        article_key: row.articleKey || "",
        name: row.name || "",
        owner: row.owner || "",
        status: row.status || "",
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
      return historyItemsForRow(row).map(function (item) {
        return {
          marketplace: row.market === "ym" ? "Я.Маркет" : String(row.market || "").toUpperCase(),
          article_key: row.articleKey || "",
          name: row.name || "",
          owner: row.owner || "",
          status: row.status || "",
          date: item && item.date || "",
          price_mp: moneyRound(num(item && item.price)),
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
      sortableHead("price_mp", "\u0426\u0435\u043d\u0430 MP (\u0434\u043e \u0441\u043a\u0438\u0434\u043a\u0438)"),
      sortableHead("discount_price", "\u0426\u0435\u043d\u0430 MP (\u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439 / \u0444\u0430\u043a\u0442)"),
      sortableHead("seller_discount", "\u0421\u043a\u0438\u0434\u043a\u0430 \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430"),
      sortableHead("repricer_price", "\u0426\u0435\u043d\u0430 \u0440\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440\u0430"),
      sortableHead("min", "MIN"),
      sortableHead("max", "MAX"),
      sortableHead("client_price", "\u0426\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430"),
      sortableHead("spp", "\u0421\u041f\u041f"),
      sortableHead("allowed_margin", "\u0414\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u0430\u044f 3\u043c"),
      sortableHead("margin", "\u041c\u0430\u0440\u0436\u0430"),
      sortableHead("turnover", "\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c"),
      '</tr></thead><tbody>',
      sorted.map(function (row) {
        var danger = row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct;
        return [
          '<tr class="pw-row" data-open-price="', esc(row.articleKey), '" data-price-market="', esc(row.market), '">',
          '<td><div class="pw-sku">', esc(row.articleKey), '</div><div class="pw-note">', esc(row.name), '</div>',
          row.productLeaderboard ? '<div class="pw-kz-stack">' + renderProductLeaderboardBadge(row.productLeaderboard, row.articleKey) + renderProductLeaderboardAlerts(row.productLeaderboard, 1) + '</div>' : '',
          '</td>',
          '<td>', esc(row.owner || "\u2014"), '</td>',
          '<td><span class="pw-badge">', esc(row.status || "\u2014"), '</span></td>',
          '<td>', renderPriceCell(row.listPrice != null ? row.listPrice : row.currentFillPrice, row.listPriceSource, row.listPriceMode, row.listPriceFactDate || row.valueDate), '</td>',
          '<td>', renderPriceCell(row.currentFillPrice, row.currentFillPriceSource, row.currentFillPriceMode, row.priceFactDate || row.valueDate), '</td>',
          '<td>', pct(row.sellerDiscountPct), '</td>',
          '<td>', renderRepricerCell(row.repricerDisplay), '</td>',
          '<td>', renderBoundCell(row.repricerBounds && row.repricerBounds.effectiveMin, row.repricerBounds && row.repricerBounds.minSource), '</td>',
          '<td>', renderBoundCell(row.repricerBounds && row.repricerBounds.effectiveMax, row.repricerBounds && row.repricerBounds.maxSource), '</td>',
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
    derived.table.rowsRef = rows;
    derived.table.value = html;
    return html;
  }

  function historyItemsForRow(row) {
    var items = rangeSlice(row).slice();
    var snapshotDate = isoDate(row && (row.priceFactDate || row.currentPriceDate));
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
    var items = historyItemsForRow(row).slice(-14);
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
    var leaderboardEntry = row.productLeaderboard || findProductLeaderboardEntry(row.articleKey);
    var bounds = row.repricerBounds || buildRepricerBounds(row.market, row.articleKey);
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
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 MP \u0434\u043e \u0441\u043a\u0438\u0434\u043a\u0438</span><strong>', money(row.listPrice != null ? row.listPrice : row.currentFillPrice), '</strong><small>', esc(metricHelp(modalListPriceHelp(row), row.listPriceFactDate || row.priceFactDate, row.valueDate)), '</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 MP \u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439</span><strong>', money(row.currentFillPrice), '</strong><small>', esc(metricHelp(modalDiscountedPriceHelp(row), row.priceFactDate, row.valueDate)), '</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0421\u043a\u0438\u0434\u043a\u0430 \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430</span><strong>', pct(row.sellerDiscountPct), '</strong><small>\u0421\u0447\u0438\u0442\u0430\u0435\u043c \u043a\u0430\u043a \u0440\u0430\u0437\u043d\u0438\u0446\u0443 \u043c\u0435\u0436\u0434\u0443 \u0446\u0435\u043d\u043e\u0439 \u0434\u043e \u0441\u043a\u0438\u0434\u043a\u0438 \u0438 \u0446\u0435\u043d\u043e\u0439 \u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439.</small></div>',
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
    return state.selectedKey ? buildDisplayRow(findRow(state.selectedKey)) : null;
  }

  function lockModalBackgroundScroll() {
    if (document.body.getAttribute("data-pw-scroll-lock") === "1") return;
    var top = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = "fixed";
    document.body.style.top = "-" + top + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.setAttribute("data-pw-scroll-lock", "1");
  }

  function unlockModalBackgroundScroll() {
    if (document.body.getAttribute("data-pw-scroll-lock") !== "1") return;
    var rawTop = String(document.body.style.top || "0").replace("px", "");
    var top = Number(rawTop);
    if (!Number.isFinite(top)) top = 0;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.removeAttribute("data-pw-scroll-lock");
    window.scrollTo(0, Math.abs(top));
  }

  function attachModalHandlers() {
    var modal = document.getElementById("priceSimpleModal");
    if (!modal) return;
    modal.addEventListener("click", function (event) {
      var leaderboardButton = event.target.closest("[data-open-product-leaderboard]");
      if (leaderboardButton) {
        event.preventDefault();
        event.stopPropagation();
        openProductLeaderboard(leaderboardButton.getAttribute("data-open-product-leaderboard"));
        return;
      }
      if (event.target === modal || event.target.closest("[data-close-price-modal]")) {
        state.selectedKey = "";
        renderSelectedModal();
        unlockModalBackgroundScroll();
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
    host.innerHTML = renderModal(selectedDisplayRow());
    attachModalHandlers();
    if (state.selectedKey) lockModalBackgroundScroll();
    else unlockModalBackgroundScroll();
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
        return {
          article_key: row.articleKey || "",
          article: row.article || "",
          name: row.name || "",
          marketplace: String((row.market || "")).toUpperCase(),
          min_price: row.repricerBounds && row.repricerBounds.manualMin != null ? row.repricerBounds.manualMin : "",
          max_price: row.repricerBounds && row.repricerBounds.manualMax != null ? row.repricerBounds.manualMax : "",
          current_price_mp: moneyRound(row.currentFillPrice),
          repricer_price: moneyRound(row.repricerDisplay && row.repricerDisplay.price),
          note: row.repricerBounds && row.repricerBounds.override && row.repricerBounds.override.note || ""
        };
      });
  }

  function downloadPriceMinMaxTemplate(rows) {
    var templateRows = priceMinMaxTemplateRows(rows);
    if (!templateRows.length) {
      window.alert("По текущим фильтрам нет строк WB/Ozon для шаблона MIN/MAX.");
      return;
    }
    downloadPriceHtmlTable([
      ["article_key", "article_key"],
      ["article", "Артикул"],
      ["name", "Название"],
      ["marketplace", "Площадка"],
      ["min_price", "min_price"],
      ["max_price", "max_price"],
      ["current_price_mp", "current_price_mp"],
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
        parsedRows.forEach(function (row) {
          if (row.minPrice == null && row.maxPrice == null && !row.note) return;
          upsertMinMaxOverride(row.articleKey, row.platform, {
            floorPrice: row.minPrice,
            capPrice: row.maxPrice,
            note: row.note
          });
          applied += 1;
        });
        renderPriceWorkbench();
        if (state.selectedKey) renderSelectedModal();
        window.alert("MIN/MAX загружены: " + applied + " строк.");
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
    state.rows.forEach(function (row) {
      if (state.market !== "all" && row.market !== state.market) return;
      var ownerLabel = String(row.owner || "").trim();
      var ownerKey = norm(ownerLabel);
      if (ownerLabel && ownerKey && !owners[ownerKey]) owners[ownerKey] = ownerLabel;
      var statusLabel = String(row.status || "").trim();
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

  function renderRoot() {
    var root = document.getElementById(VIEW_ID);
    if (!root) return;
    if (state.loaded) normalizeDateRange();
    ensureStyles();
    var rows = visibleRows();
    var summary = stats(rows);
    var selected = state.selectedKey ? buildDisplayRow(findRow(state.selectedKey)) : null;
    var filters = buildFilterOptions();
    root.innerHTML = [
      '<div class="pw-shell">',
      '<section class="pw-card">',
      '<div class="pw-title">\u0426\u0435\u043d\u044b</div>',
      '<div class="pw-sub">\u0417\u0434\u0435\u0441\u044c \u043a\u043e\u043c\u0430\u043d\u0434\u0430 \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 \u0441 \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u0446\u0435\u043d\u043e\u0439, \u0440\u0430\u0431\u043e\u0447\u0438\u043c MIN/MAX, \u043c\u0430\u0440\u0436\u043e\u0439 \u0438 \u0441\u0432\u044f\u0437\u043a\u043e\u0439 \u0441 \u0440\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440\u043e\u043c. \u0415\u0441\u043b\u0438 \u0441\u0440\u0435\u0437 \u043d\u0435 \u0437\u0430 \u0441\u0435\u0433\u043e\u0434\u043d\u044f, \u043f\u043e\u0440\u0442\u0430\u043b \u043f\u043e\u043a\u0430\u0436\u0435\u0442 \u044d\u0442\u043e \u0432\u044b\u0448\u0435 \u0442\u0430\u0431\u043b\u0438\u0446\u044b.</div>',
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
      '<div class="pw-table-head"><div class="pw-label">\u0422\u0430\u0431\u043b\u0438\u0446\u0430</div><div class="pw-chip-row"><button type="button" class="pw-chip" data-price-export="summary">\u0421\u0432\u043e\u0434 \u0432 Excel</button><button type="button" class="pw-chip" data-price-export="daily">\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430 \u043f\u043e \u0434\u043d\u044f\u043c</button><button type="button" class="pw-chip" data-price-minmax-template>\u0421\u043a\u0430\u0447\u0430\u0442\u044c MIN/MAX (TSV)</button><button type="button" class="pw-chip" data-price-minmax-import>\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c MIN/MAX</button></div></div>',
      '<div class="pw-note" style="margin-top:10px">\u0428\u0430\u0431\u043b\u043e\u043d MIN/MAX \u0442\u0435\u043f\u0435\u0440\u044c \u0432\u044b\u0433\u0440\u0443\u0436\u0430\u0435\u0442\u0441\u044f \u0432 TSV, \u0447\u0442\u043e\u0431\u044b Excel / Google Sheets \u0434\u0430\u0432\u0430\u043b\u0438 \u0447\u0435\u0441\u0442\u043d\u044b\u0439 round-trip \u0431\u0435\u0437 fake .xls.</div>',
      '<div class="pw-note" style="margin-top:6px">Нажмите на заголовок столбца для сортировки (как в Excel). Под суммой цены показан источник: если видите “факт продаж (средняя)”, это не кабинетная полка, а средняя цена по факту продаж за срез.</div>',
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
    root.querySelectorAll("[data-price-sort]").forEach(function (headerButton) {
      headerButton.addEventListener("click", function (event) {
        event.preventDefault();
        var key = headerButton.getAttribute("data-price-sort") || "risk";
        state.sortDir = sortToggleDirection(key);
        state.sortBy = key;
        derived.table.rowsRef = null;
        renderPriceWorkbench();
      });
    });
    root.querySelectorAll("[data-open-price]").forEach(function (rowNode) {
      rowNode.addEventListener("click", function () {
        state.selectedKey = rowNode.getAttribute("data-open-price");
        renderSelectedModal();
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
    renderRoot();
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

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.selectedKey) {
      state.selectedKey = "";
      renderSelectedModal();
      unlockModalBackgroundScroll();
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
