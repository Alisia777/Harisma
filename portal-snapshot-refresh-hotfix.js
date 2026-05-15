(function () {
  if (window.__ALTEA_SNAPSHOT_REFRESH_HOTFIX_20260503A__) return;
  window.__ALTEA_SNAPSHOT_REFRESH_HOTFIX_20260503A__ = true;
  window.__ALTEA_SNAPSHOT_REFRESH_HOTFIX_20260425C__ = true;

  var SNAPSHOT_TABLE = "portal_data_snapshots";
  var PATH_MAP = {
    "data/dashboard.json": "dashboard",
    "data/skus.json": "skus",
    "data/platform_trends.json": "platform_trends",
    "data/iu_plan.json": "iu_plan",
    "data/logistics.json": "logistics",
    "data/ads_summary.json": "ads_summary",
    "data/iu_drr_summary.json": "iu_drr_summary",
    "data/wb_feedbacks_summary.json": "wb_feedbacks_summary",
    "data/platform_plan.json": "platform_plan",
    "data/prices.json": "prices",
    "data/smart_price_workbench.json": "smart_price_workbench",
    "data/smart_price_overlay.json": "smart_price_overlay",
    "data/price_workbench_support.json": "price_workbench_support",
    "data/order_procurement.json": "order_procurement",
    "data/order_procurement_wb.json": "order_procurement_wb",
    "data/order_procurement_ozon.json": "order_procurement_ozon",
    "data/warehouse_stock_overlay.json": "warehouse_stock_overlay"
  };
  var ALLOWED_SNAPSHOT_KEYS = Object.keys(PATH_MAP).reduce(function (acc, path) {
    var key = PATH_MAP[path];
    if (key && acc.indexOf(key) === -1) acc.push(key);
    return acc;
  }, []);
  var cache = {
    promise: null,
    rows: {},
    brand: ""
  };

  var originalLoadSnapshot = typeof window.__alteaLoadPortalSnapshot === "function"
    ? window.__alteaLoadPortalSnapshot.bind(window)
    : null;
  var originalResetSnapshot = typeof window.__alteaResetPortalSnapshotState === "function"
    ? window.__alteaResetPortalSnapshotState.bind(window)
    : null;

  function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").split("?")[0];
  }

  function snapshotKeyFromPath(path) {
    return PATH_MAP[normalizePath(path)] || null;
  }

  function isAllowedSnapshotKey(snapshotKey) {
    return ALLOWED_SNAPSHOT_KEYS.indexOf(String(snapshotKey || "").trim()) >= 0;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
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
      parseFreshStamp(payload.__snapshotUpdatedAt),
      parseFreshStamp(payload.asOfDate),
      parseFreshStamp(payload.dataFreshness && payload.dataFreshness.asOfDate)
    );
  }

  function dataFreshnessOfPayload(snapshotKey, payload) {
    if (!payload || typeof payload !== "object") return 0;
    var score = Math.max(
      parseFreshStamp(payload.asOfDate),
      parseFreshStamp(payload.dataFreshness && payload.dataFreshness.asOfDate)
    );
    if (snapshotKey === "platform_trends" || snapshotKey === "ads_summary") {
      (payload.platforms || []).forEach(function (platform) {
        (platform && platform.series || []).forEach(function (item) {
          score = Math.max(score, parseFreshStamp(item && (item.date || item.label)));
        });
      });
      return score;
    }
    if (snapshotKey === "iu_drr_summary") {
      (payload.daily || []).forEach(function (item) {
        score = Math.max(score, parseFreshStamp(item && item.date));
      });
      return score;
    }
    if (snapshotKey === "wb_feedbacks_summary") {
      score = Math.max(score, parseFreshStamp(payload.window && payload.window.to));
      (payload.daily || []).forEach(function (item) {
        score = Math.max(score, parseFreshStamp(item && item.date));
      });
      return score;
    }
    if (snapshotKey === "platform_plan" || snapshotKey === "iu_plan") {
      Object.keys(payload.months || {}).forEach(function (monthKey) {
        score = Math.max(score, parseFreshStamp(monthKey + "-01"));
      });
      return score;
    }
    if (snapshotKey === "prices") {
      score = Math.max(score, parseFreshStamp(payload.month && payload.month.key ? payload.month.key + "-01" : ""));
      (payload.dates || []).forEach(function (item) {
        score = Math.max(score, parseFreshStamp(item && (item.date || item.label)));
      });
      return score;
    }
    return score;
  }

  function payloadLooksUsable(snapshotKey, payload) {
    if (!payload) return false;
    if (snapshotKey === "skus") return Array.isArray(payload) && payload.length > 0;
    if (snapshotKey === "platform_trends" || snapshotKey === "ads_summary") {
      return Array.isArray(payload && payload.platforms) && payload.platforms.length > 0;
    }
    if (snapshotKey === "iu_drr_summary") {
      return Array.isArray(payload && payload.daily) && payload.daily.length > 0;
    }
    if (snapshotKey === "wb_feedbacks_summary") {
      return Array.isArray(payload && payload.cards) && payload.cards.length > 0;
    }
    if (snapshotKey === "platform_plan" || snapshotKey === "iu_plan") {
      return payload && typeof payload.months === "object" && Object.keys(payload.months || {}).length > 0;
    }
    if (snapshotKey === "prices") {
      return Array.isArray(payload && payload.dates)
        && payload.dates.length > 0
        && payload && typeof payload.platforms === "object"
        && Object.keys(payload.platforms || {}).length > 0;
    }
    if (snapshotKey === "smart_price_workbench" || snapshotKey === "smart_price_overlay" || snapshotKey === "price_workbench_support") {
      return payload && typeof payload.platforms === "object" && Object.keys(payload.platforms || {}).length > 0;
    }
    if (snapshotKey === "order_procurement" || snapshotKey === "order_procurement_wb" || snapshotKey === "order_procurement_ozon" || snapshotKey === "warehouse_stock_overlay") {
      return Array.isArray(payload && payload.rows) && payload.rows.length > 0;
    }
    if (snapshotKey === "logistics") {
      return Array.isArray(payload && payload.allRows) && payload.allRows.length > 0
        || Array.isArray(payload && payload.ozonClusters) && payload.ozonClusters.length > 0
        || Array.isArray(payload && payload.wbWarehouses) && payload.wbWarehouses.length > 0;
    }
    if (snapshotKey === "dashboard") {
      return Array.isArray(payload && payload.cards) && payload.cards.length > 0
        || Array.isArray(payload && payload.brandSummary) && payload.brandSummary.length > 0;
    }
    return typeof payload === "object" && Object.keys(payload || {}).length > 0;
  }

  function currentCfg() {
    if (typeof currentConfig === "function") return currentConfig();
    return window.APP_CONFIG || {};
  }

  function currentPortalBrand() {
    if (typeof currentBrand === "function") return currentBrand();
    return currentCfg().brand || "\u0410\u043b\u0442\u0435\u044f";
  }

  function parseChunkedSnapshotKey(snapshotKey) {
    var match = String(snapshotKey || "").match(/^(.*)__part__(\d{4})$/);
    if (!match) return null;
    return {
      baseKey: match[1],
      index: Number(match[2])
    };
  }

  function withRowMeta(row, payload) {
    if (payload == null) return payload;
    if (typeof payload !== "object" || Array.isArray(payload)) return payload;
    var next = clone(payload) || {};
    if (row && row.generated_at && !next.generatedAt) next.generatedAt = row.generated_at;
    if (row && row.updated_at) {
      if (!next.updatedAt) next.updatedAt = row.updated_at;
      next.__snapshotUpdatedAt = row.updated_at;
    }
    if (row && row.payload_hash && !next.payloadHash) next.payloadHash = row.payload_hash;
    return next;
  }

  function decodeChunkedRows(rows) {
    var payloadByKey = {};
    var metaByKey = {};
    var chunkGroups = {};
    var freshnessByKey = {};

    function rowFreshness(row) {
      return Math.max(
        parseFreshStamp(row && row.updated_at),
        parseFreshStamp(row && row.generated_at),
        parseFreshStamp(row && row.updatedAt),
        parseFreshStamp(row && row.payload && row.payload.generatedAt),
        parseFreshStamp(row && row.payload && row.payload.updatedAt),
        parseFreshStamp(row && row.payload && row.payload.updated_at),
        parseFreshStamp(row && row.payload && row.payload.asOfDate),
        parseFreshStamp(row && row.payload && row.payload.dataFreshness && row.payload.dataFreshness.asOfDate)
      );
    }

    function rememberRow(snapshotKey, row) {
      var freshness = rowFreshness(row);
      if (freshnessByKey[snapshotKey] !== undefined && freshnessByKey[snapshotKey] > freshness) return;
      freshnessByKey[snapshotKey] = freshness;
      metaByKey[snapshotKey] = row;
      payloadByKey[snapshotKey] = withRowMeta(row, row && row.payload);
    }

    (rows || []).forEach(function (row) {
      var snapshotKey = String(row && row.snapshot_key || "").trim();
      if (!snapshotKey) return;
      var chunkMeta = parseChunkedSnapshotKey(snapshotKey);
      if (!chunkMeta && !isAllowedSnapshotKey(snapshotKey)) return;
      if (chunkMeta && !isAllowedSnapshotKey(chunkMeta.baseKey)) return;
      rememberRow(snapshotKey, row);
      if (!chunkMeta) {
        return;
      }
      if (!chunkGroups[chunkMeta.baseKey]) chunkGroups[chunkMeta.baseKey] = [];
      chunkGroups[chunkMeta.baseKey].push({
        index: chunkMeta.index,
        payload: row && row.payload,
        snapshotKey: snapshotKey
      });
    });

    Object.keys(chunkGroups).forEach(function (baseKey) {
      var metaPayload = payloadByKey[baseKey];
      var metaRow = metaByKey[baseKey];
      var expected = Number(
        metaPayload && (metaPayload.chunk_count != null ? metaPayload.chunk_count : metaPayload.chunkCount)
          || metaRow && metaRow.payload && (metaRow.payload.chunk_count != null ? metaRow.payload.chunk_count : metaRow.payload.chunkCount)
          || 0
      );
      var partsByIndex = {};
      chunkGroups[baseKey]
        .filter(function (part) {
          return part.index >= 1 && (!expected || part.index <= expected);
        })
        .forEach(function (part) {
          var prev = partsByIndex[part.index];
          var freshness = freshnessByKey[part.snapshotKey] || 0;
          if (prev && prev.freshness > freshness) return;
          partsByIndex[part.index] = {
            freshness: freshness,
            payload: part.payload
          };
        });
      var orderedIndexes = Object.keys(partsByIndex)
        .map(function (index) { return Number(index); })
        .sort(function (left, right) {
          return left - right;
        });
      var chunkCount = expected > 0 ? expected : orderedIndexes.length;
      if (!orderedIndexes.length || orderedIndexes.length !== chunkCount) return;
      var text = orderedIndexes.map(function (index) {
        var part = partsByIndex[index];
        if (!part) return "";
        if (typeof part.payload === "string") return part.payload;
        if (typeof (part.payload && part.payload.data) === "string") return part.payload.data;
        return "";
      }).join("");
      if (!text) return;
      try {
        payloadByKey[baseKey] = withRowMeta(metaRow, JSON.parse(text));
      } catch (error) {
        console.warn("[portal-snapshot-refresh-hotfix] failed to decode chunked snapshot", baseKey, error);
      }
    });

    return payloadByKey;
  }

  function resetLocalCache() {
    cache.promise = null;
    cache.rows = {};
    cache.brand = "";
  }

  function buildSnapshotUrl(baseUrl, brand) {
    var url = new URL(baseUrl + "/rest/v1/" + SNAPSHOT_TABLE);
    url.searchParams.set("select", "snapshot_key,payload,generated_at,updated_at,payload_hash");
    url.searchParams.set("brand", "eq." + brand);
    return url;
  }

  function rowIsChunkMeta(row) {
    return Boolean(row && row.payload && typeof row.payload === "object" && row.payload.chunked);
  }

  async function requestSnapshotRows(url, cfg) {
    var response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        apikey: cfg.supabase.anonKey,
        Authorization: "Bearer " + cfg.supabase.anonKey,
        Accept: "application/json"
      }
    });
    if (!response || !response.ok) {
      throw new Error("Supabase snapshots " + (response && response.status || "request failed"));
    }
    return response.json();
  }

  async function requestRowsForExactKeys(cfg, baseUrl, brand, keys) {
    var result = [];
    var cleanKeys = (Array.isArray(keys) ? keys : [])
      .map(function (key) { return String(key || "").trim(); })
      .filter(Boolean);
    for (var index = 0; index < cleanKeys.length; index += 40) {
      var batch = cleanKeys.slice(index, index + 40);
      var url = buildSnapshotUrl(baseUrl, brand);
      url.searchParams.set("snapshot_key", batch.length === 1 ? "eq." + batch[0] : "in.(" + batch.join(",") + ")");
      result = result.concat(await requestSnapshotRows(url, cfg));
    }
    return result;
  }

  function snapshotPartKeys(snapshotKey, count) {
    var total = Math.max(0, Math.trunc(Number(count) || 0));
    var keys = [];
    for (var index = 1; index <= total; index += 1) {
      keys.push(snapshotKey + "__part__" + String(index).padStart(4, "0"));
    }
    return keys;
  }

  async function fetchRowsForKey(cfg, baseUrl, brand, snapshotKey) {
    if (!isAllowedSnapshotKey(snapshotKey)) return [];
    var rows = await requestRowsForExactKeys(cfg, baseUrl, brand, [snapshotKey]);
    var metaRow = rows.find(rowIsChunkMeta);
    if (!metaRow) return rows;
    var count = Number(metaRow.payload && (metaRow.payload.chunk_count || metaRow.payload.chunkCount) || 0);
    var parts = await requestRowsForExactKeys(cfg, baseUrl, brand, snapshotPartKeys(snapshotKey, count));
    return rows.concat(parts);
  }

  async function fetchRowsForAllowedKeys(cfg, baseUrl, brand) {
    var rows = await requestRowsForExactKeys(cfg, baseUrl, brand, ALLOWED_SNAPSHOT_KEYS);
    var chunkedKeys = rows
      .filter(rowIsChunkMeta)
      .map(function (row) {
        return {
          key: String(row && row.snapshot_key || "").trim(),
          count: Number(row && row.payload && (row.payload.chunk_count || row.payload.chunkCount) || 0)
        };
      })
      .filter(function (item) { return isAllowedSnapshotKey(item.key) && item.count > 0; });
    if (!chunkedKeys.length) return rows;
    var partGroups = await Promise.all(chunkedKeys.map(function (item) {
      return requestRowsForExactKeys(cfg, baseUrl, brand, snapshotPartKeys(item.key, item.count));
    }));
    return rows.concat.apply(rows, partGroups);
  }

  async function fetchSnapshotRows(force, requestedKey) {
    if (force) {
      resetLocalCache();
      if (originalResetSnapshot) {
        try { originalResetSnapshot(); } catch {}
      }
    }

    var cfg = currentCfg();
    if (!cfg || !cfg.supabase || !cfg.supabase.url || !cfg.supabase.anonKey || typeof fetch !== "function") {
      return {};
    }

    var brand = currentPortalBrand();
    var cacheKey = brand + "|" + String(requestedKey || "all");
    if (cache.promise && cache.brand === cacheKey) return cache.promise;

    var baseUrl = String(cfg.supabase.url || "").replace(/\/+$/, "");

    cache.brand = cacheKey;
    cache.promise = Promise.resolve()
      .then(function () {
        return requestedKey
          ? fetchRowsForKey(cfg, baseUrl, brand, requestedKey)
          : fetchRowsForAllowedKeys(cfg, baseUrl, brand);
      })
      .then(function (rows) {
        cache.rows = decodeChunkedRows(rows);
        return cache.rows;
      })
      .catch(function (error) {
        console.warn("[portal-snapshot-refresh-hotfix]", error);
        cache.rows = {};
        cache.promise = null;
        return {};
      });

    return cache.promise;
  }

  async function fetchLocalJson(path) {
    var response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load " + path);
    var text = await response.text();
    if (typeof sanitizeLooseJson === "function") {
      return JSON.parse(sanitizeLooseJson(text));
    }
    return JSON.parse(text);
  }

  function chooseFreshestPayload(snapshotKey, snapshotPayload, localPayload) {
    if (snapshotPayload && localPayload) {
      var snapshotDataFreshness = dataFreshnessOfPayload(snapshotKey, snapshotPayload);
      var localDataFreshness = dataFreshnessOfPayload(snapshotKey, localPayload);
      if (snapshotDataFreshness !== localDataFreshness) {
        return snapshotDataFreshness > localDataFreshness ? snapshotPayload : localPayload;
      }
      return freshnessOfPayload(snapshotPayload) >= freshnessOfPayload(localPayload)
        ? snapshotPayload
        : localPayload;
    }
    return snapshotPayload || localPayload || null;
  }

  function stableSerialize(value) {
    try {
      return JSON.stringify(value == null ? null : value);
    } catch (error) {
      console.warn("[portal-snapshot-refresh-hotfix] serialize", error);
      return "";
    }
  }

  function normalizeSkuForCompare(sku) {
    if (!sku || typeof sku !== "object") return sku;
    var next = clone(sku) || {};
    if (next.__baseOwner && typeof next.__baseOwner === "object") {
      next.owner = clone(next.__baseOwner) || {};
    }
    delete next.__baseOwner;
    if (next.flags && typeof next.flags === "object") {
      next.flags = Object.assign({}, next.flags);
      delete next.flags.assigned;
      if (!Object.keys(next.flags).length) delete next.flags;
    }
    return next;
  }

  function comparablePayload(snapshotKey, payload) {
    if (snapshotKey === "skus") {
      return Array.isArray(payload)
        ? payload.map(normalizeSkuForCompare)
        : [];
    }
    return payload == null ? null : payload;
  }

  function payloadChanged(snapshotKey, currentPayload, nextPayload) {
    return stableSerialize(comparablePayload(snapshotKey, currentPayload))
      !== stableSerialize(comparablePayload(snapshotKey, nextPayload));
  }

  async function loadSnapshotAwareJson(path, fallback, force) {
    var snapshotKey = snapshotKeyFromPath(path);
    var snapshotPayload = null;
    if (snapshotKey) {
      var rows = await fetchSnapshotRows(force, snapshotKey);
      var payload = rows[snapshotKey];
      if (payloadLooksUsable(snapshotKey, payload)) snapshotPayload = clone(payload);
    } else if (originalLoadSnapshot) {
      snapshotPayload = await originalLoadSnapshot(path);
    }

    var localPayload = null;
    try {
      localPayload = await fetchLocalJson(path);
    } catch (error) {
      if (!snapshotPayload) throw error;
      console.warn("[portal-snapshot-refresh-hotfix] local", path, error);
    }

    return chooseFreshestPayload(snapshotKey, snapshotPayload, localPayload) || clone(fallback);
  }

  window.__alteaResetPortalSnapshotState = function resetSnapshotState() {
    resetLocalCache();
    if (originalResetSnapshot) {
      try { originalResetSnapshot(); } catch {}
    }
  };

  window.__alteaLoadPortalSnapshot = async function loadPortalSnapshotPatched(path, options) {
    var snapshotKey = snapshotKeyFromPath(path);
    if (!snapshotKey) {
      return originalLoadSnapshot ? originalLoadSnapshot(path) : null;
    }
    var rows = await fetchSnapshotRows(Boolean(options && options.force), snapshotKey);
    var payload = rows[snapshotKey];
    return payloadLooksUsable(snapshotKey, payload) ? clone(payload) : null;
  };

  window.__alteaRefreshSnapshotBackedState = async function refreshSnapshotBackedState(options) {
    var rerender = !options || options.rerender !== false;
    var optionalLoader = typeof optionalLoadJson === "function"
      ? optionalLoadJson
      : function () { return Promise.resolve(null); };
    var results = await Promise.all([
      loadSnapshotAwareJson("data/dashboard.json", { cards: [], generatedAt: "" }, true),
      loadSnapshotAwareJson("data/skus.json", [], true),
      loadSnapshotAwareJson("data/ads_summary.json", { generatedAt: "", asOfDate: "", note: "", platforms: [], itemSeries: [] }, true),
      loadSnapshotAwareJson("data/iu_drr_summary.json", { generatedAt: "", asOfDate: "", months: [], daily: [], channels: [], diagnostics: {} }, true),
      loadSnapshotAwareJson("data/wb_feedbacks_summary.json", { generatedAt: "", window: {}, summary: {}, cards: [], daily: [], history: [] }, true),
      loadSnapshotAwareJson("data/product_leaderboard.json", { generatedAt: "", items: [], summary: {} }, true),
      loadSnapshotAwareJson("data/product_leaderboard_history.json", [], true),
      loadSnapshotAwareJson("data/prices.json", { generatedAt: "", platforms: {} }, true),
      loadSnapshotAwareJson("data/smart_price_workbench.json", { generatedAt: "", platforms: {} }, true),
      optionalLoader("tmp-smart_price_workbench-live.json"),
      loadSnapshotAwareJson("data/smart_price_overlay.json", { generatedAt: "", platforms: {} }, true),
      optionalLoader("tmp-live-repricer.json"),
      loadSnapshotAwareJson("data/repricer.json", { generatedAt: "", summary: {}, rows: [] }, true),
      loadSnapshotAwareJson("data/price_workbench_support.json", { generatedAt: "", platforms: {} }, true)
    ]);
    var dashboard = results[0];
    var skus = results[1];
    var adsSummary = results[2];
    var iuDrrSummary = results[3];
    var wbFeedbacks = results[4];
    var productLeaderboard = results[5];
    var productLeaderboardHistory = results[6];
    var prices = results[7];
    var smartPriceWorkbench = results[8];
    var smartPriceWorkbenchLive = results[9];
    var smartPriceOverlay = results[10];
    var repricerLive = results[11];
    var repricer = results[12];
    var priceWorkbenchSupport = results[13];
    var changed = false;

    if (typeof state === "object" && state) {
      var nextDashboard = dashboard || { cards: [], generatedAt: "" };
      var nextSkus = Array.isArray(skus) ? skus : [];
      var nextAdsSummary = adsSummary && typeof adsSummary === "object"
        ? adsSummary
        : { generatedAt: "", asOfDate: "", note: "", platforms: [], itemSeries: [] };
      var nextIuDrrSummary = iuDrrSummary && typeof iuDrrSummary === "object"
        ? iuDrrSummary
        : { generatedAt: "", asOfDate: "", months: [], daily: [], channels: [], diagnostics: {} };
      var nextWbFeedbacks = wbFeedbacks && typeof wbFeedbacks === "object"
        ? wbFeedbacks
        : { generatedAt: "", window: {}, summary: {}, cards: [], daily: [], history: [] };
      var nextProductLeaderboard = typeof normalizeProductLeaderboardPayload === "function"
        ? normalizeProductLeaderboardPayload(productLeaderboard || { generatedAt: "", items: [], summary: {} })
        : (productLeaderboard || { generatedAt: "", items: [], summary: {} });
      var nextProductLeaderboardHistory = Array.isArray(productLeaderboardHistory) ? productLeaderboardHistory : [];
      var nextPrices = prices && typeof prices === "object" ? prices : { generatedAt: "", platforms: {} };
      var nextSmartPriceWorkbenchLive = smartPriceWorkbenchLive && typeof smartPriceWorkbenchLive === "object"
        ? smartPriceWorkbenchLive
        : { generatedAt: "", platforms: {} };
      var nextSmartPriceOverlay = smartPriceOverlay && typeof smartPriceOverlay === "object"
        ? smartPriceOverlay
        : { generatedAt: "", platforms: {} };
      var nextRepricerLive = repricerLive && typeof repricerLive === "object"
        ? repricerLive
        : { generatedAt: "", rows: [] };
      var nextRepricer = repricer && typeof repricer === "object"
        ? repricer
        : { generatedAt: "", summary: {}, rows: [] };
      var nextPriceWorkbenchSupport = priceWorkbenchSupport && typeof priceWorkbenchSupport === "object"
        ? priceWorkbenchSupport
        : { generatedAt: "", platforms: {} };
      var nextSmartPriceWorkbenchBase = typeof mergeSmartWorkbenchPayload === "function"
        ? mergeSmartWorkbenchPayload(smartPriceWorkbench || { generatedAt: "", platforms: {} }, nextSmartPriceWorkbenchLive)
        : (smartPriceWorkbench || { generatedAt: "", platforms: {} });
      var nextSmartPriceWorkbench = typeof mergeSmartWorkbenchPriceOverlay === "function"
        ? mergeSmartWorkbenchPriceOverlay(nextSmartPriceWorkbenchBase, nextSmartPriceOverlay)
        : nextSmartPriceWorkbenchBase;

      if (payloadChanged("dashboard", state.dashboard, nextDashboard)) {
        state.dashboard = nextDashboard;
        changed = true;
      }
      if (payloadChanged("skus", state.skus, nextSkus)) {
        state.skus = nextSkus;
        changed = true;
      }
      if (payloadChanged("adsSummary", state.adsSummary, nextAdsSummary)) {
        state.adsSummary = nextAdsSummary;
        changed = true;
      }
      if (payloadChanged("iuDrrSummary", state.iuDrrSummary, nextIuDrrSummary)) {
        state.iuDrrSummary = nextIuDrrSummary;
        changed = true;
      }
      if (payloadChanged("wbFeedbacks", state.wbFeedbacks, nextWbFeedbacks)) {
        state.wbFeedbacks = nextWbFeedbacks;
        changed = true;
      }
      if (payloadChanged("productLeaderboard", state.productLeaderboard, nextProductLeaderboard)) {
        state.productLeaderboard = nextProductLeaderboard;
        changed = true;
      }
      if (payloadChanged("productLeaderboardHistory", state.productLeaderboardHistory, nextProductLeaderboardHistory)) {
        state.productLeaderboardHistory = nextProductLeaderboardHistory;
        changed = true;
      }
      if (payloadChanged("prices", state.prices, nextPrices)) {
        state.prices = nextPrices;
        changed = true;
      }
      if (payloadChanged("smartPriceWorkbenchBase", state.smartPriceWorkbenchBase, nextSmartPriceWorkbenchBase)) {
        state.smartPriceWorkbenchBase = nextSmartPriceWorkbenchBase;
        changed = true;
      }
      if (payloadChanged("smartPriceWorkbench", state.smartPriceWorkbench, nextSmartPriceWorkbench)) {
        state.smartPriceWorkbench = nextSmartPriceWorkbench;
        changed = true;
      }
      if (payloadChanged("smartPriceWorkbenchLive", state.smartPriceWorkbenchLive, nextSmartPriceWorkbenchLive)) {
        state.smartPriceWorkbenchLive = nextSmartPriceWorkbenchLive;
        changed = true;
      }
      if (payloadChanged("smartPriceOverlay", state.smartPriceOverlay, nextSmartPriceOverlay)) {
        state.smartPriceOverlay = nextSmartPriceOverlay;
        changed = true;
      }
      if (payloadChanged("repricerLive", state.repricerLive, nextRepricerLive)) {
        state.repricerLive = nextRepricerLive;
        changed = true;
      }
      if (payloadChanged("repricer", state.repricer, nextRepricer)) {
        state.repricer = nextRepricer;
        changed = true;
      }
      if (payloadChanged("priceWorkbenchSupport", state.priceWorkbenchSupport, nextPriceWorkbenchSupport)) {
        state.priceWorkbenchSupport = nextPriceWorkbenchSupport;
        changed = true;
      }
      if (changed && typeof applyOwnerOverridesToSkus === "function") applyOwnerOverridesToSkus();
    }

    if (changed && rerender && typeof rerenderCurrentView === "function") {
      try {
        rerenderCurrentView();
        if (state && state.activeSku && typeof renderSkuModal === "function") {
          renderSkuModal(state.activeSku);
        }
      } catch (error) {
        console.warn("[portal-snapshot-refresh-hotfix] rerender", error);
      }
    }

    return changed;
  };

  function wrapPullRemoteState() {
    var base = typeof window.pullRemoteState === "function"
      ? window.pullRemoteState
      : (typeof pullRemoteState === "function" ? pullRemoteState : null);

    if (!base || base.__alteaSnapshotRefreshWrapped) return Boolean(base);

    var wrapped = async function wrappedPullRemoteState() {
      var result = await base.apply(this, arguments);
      var snapshotChanged = false;
      try {
        snapshotChanged = await window.__alteaRefreshSnapshotBackedState({ rerender: false });
      } catch (error) {
        console.warn("[portal-snapshot-refresh-hotfix] refresh after pull", error);
      }
      if (snapshotChanged && arguments[0] !== false && typeof rerenderCurrentView === "function") {
        try {
          rerenderCurrentView();
          if (state && state.activeSku && typeof renderSkuModal === "function") {
            renderSkuModal(state.activeSku);
          }
        } catch (error) {
          console.warn("[portal-snapshot-refresh-hotfix] rerender after pull", error);
        }
      }
      return result;
    };

    wrapped.__alteaSnapshotRefreshWrapped = true;
    window.pullRemoteState = wrapped;
    try { pullRemoteState = wrapped; } catch {}
    return true;
  }

  [0, 250, 1200, 3000].forEach(function (delay) {
    window.setTimeout(wrapPullRemoteState, delay);
  });
})();
