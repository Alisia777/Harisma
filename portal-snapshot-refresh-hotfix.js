(function () {
  if (window.__ALTEA_SNAPSHOT_REFRESH_HOTFIX_20260516AUTOSYNC1__) return;
  window.__ALTEA_SNAPSHOT_REFRESH_HOTFIX_20260516AUTOSYNC1__ = true;
  window.__ALTEA_SNAPSHOT_REFRESH_HOTFIX_20260503A__ = true;
  window.__ALTEA_SNAPSHOT_REFRESH_HOTFIX_20260425C__ = true;

  var SNAPSHOT_TABLE = "portal_data_snapshots";
  var SNAPSHOT_REQUEST_TIMEOUT_MS = 3500;
  var PATH_MAP = {
    "data/dashboard.json": "dashboard",
    "data/skus.json": "skus",
    "data/platform_trends.json": "platform_trends",
    "data/iu_plan.json": "iu_plan",
    "data/logistics.json": "logistics",
    "data/ads_summary.json": "ads_summary",
    "data/iu_drr_summary.json": "iu_drr_summary",
    "data/wb_feedbacks_summary.json": "wb_feedbacks_summary",
    "data/product_leaderboard.json": "product_leaderboard",
    "data/product_leaderboard_history.json": "product_leaderboard_history",
    "data/platform_plan.json": "platform_plan",
    "data/prices.json": "prices",
    "data/smart_price_workbench.json": "smart_price_workbench",
    "data/smart_price_overlay.json": "smart_price_overlay",
    "data/price_workbench_support.json": "price_workbench_support",
    "data/repricer.json": "repricer",
  "data/order_procurement.json": "order_procurement",
  "data/order_procurement_wb.json": "order_procurement_wb",
  "data/order_procurement_ozon.json": "order_procurement_ozon",
  "data/order_procurement_ym.json": "order_procurement_ym",
  "data/oos_control.json": "oos_control",
    "data/warehouse_stock_overlay.json": "warehouse_stock_overlay",
    "data/portal_data_quality.json": "portal_data_quality",
    "data/portal_data_quarantine.json": "portal_data_quarantine",
    "data/sku_aliases.json": "sku_aliases",
    "data/sku_alias_ignore.json": "sku_alias_ignore",
    "data/sku_alias_audit.json": "sku_alias_audit",
    "data/sku_matrix.json": "sku_matrix",
    "data/portal_sync_health.json": "portal_sync_health"
  };
  var SKU_ALIASES_FALLBACK = {
    schema: "sku-api-aliases-v1",
    aliases: []
  };
  var SKU_ALIAS_IGNORE_FALLBACK = {
    schema: "sku-api-ignore-v1",
    ignored: []
  };
  var SKU_ALIAS_AUDIT_FALLBACK = {
    schema: "sku-alias-audit-v1",
    events: []
  };
  var SKU_MATRIX_FALLBACK = {
    schema: "portal-sku-matrix-v1",
    summary: {},
    items: [],
    apiUnmapped: [],
    ignoredApiSku: [],
    indexes: { byArticleKey: {}, aliasToArticleKey: {} }
  };
  var SYNC_HEALTH_FALLBACK = {
    schema: "portal-sync-health-v1",
    status: "",
    publish: { allowed: true, blockingReasons: [], warnings: [] },
    sources: {},
    quality: {}
  };
  var DATA_QUARANTINE_FALLBACK = {
    schema: "portal-data-quarantine-v1",
    summary: {},
    rows: []
  };
  var DATA_QUALITY_FALLBACK = {
    schema: "portal-data-quality-v1",
    generatedAt: "",
    summary: {},
    issues: [],
    freshness: []
  };
  var OOS_CONTROL_FALLBACK = {
    schema: "portal-oos-control-v1",
    generatedAt: "",
    summary: {},
    rows: [],
    history: { days: [] }
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
    if (snapshotKey === "oos_control") {
      return Math.max(score, parseFreshStamp(payload.dataFreshness && payload.dataFreshness.dataDate), parseFreshStamp(payload.summary && payload.summary.dataDate), parseFreshStamp(payload.generatedAt));
    }
    return score;
  }

  function payloadLooksUsable(snapshotKey, payload) {
    if (!payload) return false;
    if (snapshotKey === "skus") return Array.isArray(payload) && payload.length > 0;
    if (snapshotKey === "sku_matrix") {
      return payload
        && typeof payload === "object"
        && !Array.isArray(payload)
        && Array.isArray(payload.items)
        && payload.items.length > 0;
    }
    if (snapshotKey === "sku_aliases") {
      return payload
        && typeof payload === "object"
        && !Array.isArray(payload)
        && Array.isArray(payload.aliases);
    }
    if (snapshotKey === "sku_alias_ignore") {
      return payload
        && typeof payload === "object"
        && !Array.isArray(payload)
        && (Array.isArray(payload.ignored) || Array.isArray(payload.ignores) || Array.isArray(payload.rows));
    }
    if (snapshotKey === "sku_alias_audit") {
      return payload
        && typeof payload === "object"
        && !Array.isArray(payload)
        && Array.isArray(payload.events);
    }
    if (snapshotKey === "portal_sync_health") {
      return payload
        && typeof payload === "object"
        && !Array.isArray(payload)
        && typeof payload.publish === "object";
    }
    if (snapshotKey === "portal_data_quarantine") {
      return payload
        && typeof payload === "object"
        && !Array.isArray(payload)
        && Array.isArray(payload.rows);
    }
    if (snapshotKey === "portal_data_quality") {
      return payload && typeof payload === "object" && typeof payload.summary === "object";
    }
    if (snapshotKey === "platform_trends" || snapshotKey === "ads_summary") {
      return Array.isArray(payload && payload.platforms) && payload.platforms.length > 0;
    }
    if (snapshotKey === "iu_drr_summary") {
      return Array.isArray(payload && payload.daily) && payload.daily.length > 0;
    }
    if (snapshotKey === "wb_feedbacks_summary") {
      return Array.isArray(payload && payload.cards) && payload.cards.length > 0;
    }
    if (snapshotKey === "product_leaderboard") {
      return Array.isArray(payload && payload.items);
    }
    if (snapshotKey === "product_leaderboard_history") {
      return Array.isArray(payload);
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
    if (snapshotKey === "repricer") {
      return Array.isArray(payload && payload.rows) || payload && typeof payload.summary === "object";
    }
  if (snapshotKey === "order_procurement" || snapshotKey === "order_procurement_wb" || snapshotKey === "order_procurement_ozon" || snapshotKey === "order_procurement_ym" || snapshotKey === "warehouse_stock_overlay") {
      return Array.isArray(payload && payload.rows);
    }
    if (snapshotKey === "oos_control") {
      return payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray(payload.rows);
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
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, SNAPSHOT_REQUEST_TIMEOUT_MS);
    var response = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller ? controller.signal : undefined,
      headers: {
        apikey: cfg.supabase.anonKey,
        Authorization: "Bearer " + cfg.supabase.anonKey,
        Accept: "application/json"
      }
    }).finally(function () {
      window.clearTimeout(timer);
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

  var LIGHT_REFRESH_KEYS = [
    "dashboard",
    "skus",
    "platform_trends",
    "platform_plan",
    "iu_plan",
    "ads_summary",
    "iu_drr_summary",
    "wb_feedbacks_summary",
    "portal_sync_health",
    "portal_data_quarantine",
    "portal_data_quality",
    "sku_aliases",
    "sku_alias_ignore",
    "sku_alias_audit",
    "sku_matrix",
    "product_leaderboard",
    "product_leaderboard_history",
    "prices",
    "smart_price_workbench",
    "smart_price_overlay",
    "price_workbench_support",
    "repricer",
    "logistics",
    "order_procurement",
    "order_procurement_wb",
    "order_procurement_ozon",
    "order_procurement_ym",
    "oos_control",
    "warehouse_stock_overlay"
  ];
  var VIEW_REFRESH_KEYS = {
    prices: ["prices", "smart_price_workbench", "smart_price_overlay", "price_workbench_support"],
    repricer: ["repricer", "prices", "smart_price_workbench", "smart_price_overlay", "price_workbench_support"],
    order: ["logistics", "order_procurement", "order_procurement_wb", "order_procurement_ozon", "order_procurement_ym", "warehouse_stock_overlay"],
    "ads-funnel": ["ads_summary", "smart_price_overlay", "iu_drr_summary"],
    "oos-control": ["oos_control", "order_procurement", "portal_sync_health", "portal_data_quality", "smart_price_overlay"],
    "sku-plan-fact": ["smart_price_workbench", "smart_price_overlay", "price_workbench_support", "ads_summary", "iu_drr_summary", "portal_data_quality", "sku_aliases", "sku_alias_ignore", "sku_alias_audit", "sku_matrix"],
    "iu-drr": ["iu_drr_summary", "ads_summary", "wb_feedbacks_summary"],
    "wb-rating": ["wb_feedbacks_summary", "iu_drr_summary"],
    "product-leaderboard": ["product_leaderboard", "product_leaderboard_history"]
  };

  function activeRefreshView() {
    if (typeof state === "object" && state && state.activeView) return String(state.activeView);
    var active = document.querySelector(".view.active[id^='view-']");
    return active ? String(active.id || "").replace(/^view-/, "") : "";
  }

  function pushUniqueKey(target, key) {
    var clean = String(key || "").trim();
    if (clean && target.indexOf(clean) === -1) target.push(clean);
  }

  function refreshKeysForOptions(options) {
    if (options && (options.forceFull || options.forceAll || options.full)) return null;
    if (typeof location !== "undefined" && new URLSearchParams(location.search || "").has("portal-refresh")) return null;
    var keys = LIGHT_REFRESH_KEYS.slice();
    var view = String(options && options.view || activeRefreshView() || "").trim();
    (VIEW_REFRESH_KEYS[view] || []).forEach(function (key) { pushUniqueKey(keys, key); });
    (options && Array.isArray(options.keys) ? options.keys : []).forEach(function (key) { pushUniqueKey(keys, key); });
    return keys;
  }

  window.__alteaRefreshSnapshotBackedState = async function refreshSnapshotBackedState(options) {
    options = options || {};
    var rerender = !options || options.rerender !== false;
    var refreshKeys = refreshKeysForOptions(options);
    var shouldLoadSnapshotKey = function (key) {
      return refreshKeys === null || refreshKeys.indexOf(key) !== -1;
    };
    var optionalLoader = typeof optionalLoadJson === "function"
      ? optionalLoadJson
      : function () { return Promise.resolve(null); };
    var maybeLoadSnapshotJson = function (key, path, fallback) {
      return shouldLoadSnapshotKey(key) ? loadSnapshotAwareJson(path, fallback, true) : Promise.resolve(undefined);
    };
    var maybeLoadOptional = function (key, path) {
      return shouldLoadSnapshotKey(key) ? optionalLoader(path) : Promise.resolve(undefined);
    };
    var results = await Promise.all([
      maybeLoadSnapshotJson("dashboard", "data/dashboard.json", { cards: [], generatedAt: "" }),
      maybeLoadSnapshotJson("platform_trends", "data/platform_trends.json", { generatedAt: "", platforms: [] }),
      maybeLoadSnapshotJson("platform_plan", "data/platform_plan.json", { generatedAt: "", months: {} }),
      maybeLoadSnapshotJson("iu_plan", "data/iu_plan.json", { generatedAt: "", months: {} }),
      maybeLoadSnapshotJson("logistics", "data/logistics.json", { generatedAt: "", allRows: [], ozonClusters: [], wbWarehouses: [] }),
      maybeLoadSnapshotJson("skus", "data/skus.json", []),
      maybeLoadSnapshotJson("ads_summary", "data/ads_summary.json", { generatedAt: "", asOfDate: "", note: "", platforms: [], itemSeries: [] }),
      maybeLoadSnapshotJson("iu_drr_summary", "data/iu_drr_summary.json", { generatedAt: "", asOfDate: "", months: [], daily: [], channels: [], diagnostics: {} }),
      maybeLoadSnapshotJson("wb_feedbacks_summary", "data/wb_feedbacks_summary.json", { generatedAt: "", window: {}, summary: {}, cards: [], daily: [], history: [] }),
      maybeLoadSnapshotJson("product_leaderboard", "data/product_leaderboard.json", { generatedAt: "", items: [], summary: {} }),
      maybeLoadSnapshotJson("product_leaderboard_history", "data/product_leaderboard_history.json", []),
      maybeLoadSnapshotJson("prices", "data/prices.json", { generatedAt: "", platforms: {} }),
      maybeLoadSnapshotJson("smart_price_workbench", "data/smart_price_workbench.json", { generatedAt: "", platforms: {} }),
      maybeLoadOptional("smart_price_workbench", "tmp-smart_price_workbench-live.json"),
      maybeLoadSnapshotJson("smart_price_overlay", "data/smart_price_overlay.json", { generatedAt: "", platforms: {} }),
      maybeLoadOptional("repricer", "tmp-live-repricer.json"),
      maybeLoadSnapshotJson("repricer", "data/repricer.json", { generatedAt: "", summary: {}, rows: [] }),
      maybeLoadSnapshotJson("price_workbench_support", "data/price_workbench_support.json", { generatedAt: "", platforms: {} }),
      maybeLoadSnapshotJson("portal_sync_health", "data/portal_sync_health.json", SYNC_HEALTH_FALLBACK),
      maybeLoadSnapshotJson("portal_data_quarantine", "data/portal_data_quarantine.json", DATA_QUARANTINE_FALLBACK),
      maybeLoadSnapshotJson("portal_data_quality", "data/portal_data_quality.json", DATA_QUALITY_FALLBACK),
      maybeLoadSnapshotJson("sku_aliases", "data/sku_aliases.json", SKU_ALIASES_FALLBACK),
      maybeLoadSnapshotJson("sku_alias_ignore", "data/sku_alias_ignore.json", SKU_ALIAS_IGNORE_FALLBACK),
      maybeLoadSnapshotJson("sku_alias_audit", "data/sku_alias_audit.json", SKU_ALIAS_AUDIT_FALLBACK),
      maybeLoadSnapshotJson("sku_matrix", "data/sku_matrix.json", SKU_MATRIX_FALLBACK),
      maybeLoadSnapshotJson("order_procurement", "data/order_procurement.json", { generatedAt: "", rows: [] }),
      maybeLoadSnapshotJson("order_procurement_wb", "data/order_procurement_wb.json", { generatedAt: "", rows: [] }),
      maybeLoadSnapshotJson("order_procurement_ozon", "data/order_procurement_ozon.json", { generatedAt: "", rows: [] }),
      maybeLoadSnapshotJson("order_procurement_ym", "data/order_procurement_ym.json", { generatedAt: "", rows: [] }),
      maybeLoadSnapshotJson("oos_control", "data/oos_control.json", OOS_CONTROL_FALLBACK),
      maybeLoadSnapshotJson("warehouse_stock_overlay", "data/warehouse_stock_overlay.json", { generatedAt: "", rows: [] })
    ]);
    var dashboard = results[0];
    var platformTrends = results[1];
    var platformPlan = results[2];
    var iuPlan = results[3];
    var logistics = results[4];
    var skus = results[5];
    var adsSummary = results[6];
    var iuDrrSummary = results[7];
    var wbFeedbacks = results[8];
    var productLeaderboard = results[9];
    var productLeaderboardHistory = results[10];
    var prices = results[11];
    var smartPriceWorkbench = results[12];
    var smartPriceWorkbenchLive = results[13];
    var smartPriceOverlay = results[14];
    var repricerLive = results[15];
    var repricer = results[16];
    var priceWorkbenchSupport = results[17];
    var syncHealth = results[18];
    var portalDataQuarantine = results[19];
    var portalDataQuality = results[20];
    var skuAliases = results[21];
    var skuAliasIgnore = results[22];
    var skuAliasAudit = results[23];
    var skuMatrix = results[24];
    var orderProcurement = results[25];
    var orderProcurementWb = results[26];
    var orderProcurementOzon = results[27];
    var orderProcurementYm = results[28];
    var oosControl = results[29];
    var warehouseStockOverlay = results[30];
    var changed = false;

    if (typeof state === "object" && state) {
      var nextDashboard = dashboard || state.dashboard || { cards: [], generatedAt: "" };
      var nextPlatformTrends = platformTrends && typeof platformTrends === "object"
        ? platformTrends
        : (state.platformTrends || { generatedAt: "", platforms: [] });
      var nextPlatformPlan = platformPlan && typeof platformPlan === "object"
        ? platformPlan
        : (state.platformPlan || { generatedAt: "", months: {} });
      var nextIuPlan = iuPlan && typeof iuPlan === "object"
        ? iuPlan
        : (state.iuPlan || { generatedAt: "", months: {} });
      var nextLogistics = logistics && typeof logistics === "object"
        ? logistics
        : (state.logistics || { generatedAt: "", allRows: [], ozonClusters: [], wbWarehouses: [] });
      var nextSkus = Array.isArray(skus) && skus.length
        ? skus
        : (Array.isArray(state.skus) ? state.skus : []);
      var nextAdsSummary = adsSummary && typeof adsSummary === "object"
        ? adsSummary
        : (state.adsSummary || { generatedAt: "", asOfDate: "", note: "", platforms: [], itemSeries: [] });
      var nextIuDrrSummary = iuDrrSummary && typeof iuDrrSummary === "object"
        ? iuDrrSummary
        : (state.iuDrrSummary || { generatedAt: "", asOfDate: "", months: [], daily: [], channels: [], diagnostics: {} });
      var nextWbFeedbacks = wbFeedbacks && typeof wbFeedbacks === "object"
        ? wbFeedbacks
        : (state.wbFeedbacks || { generatedAt: "", window: {}, summary: {}, cards: [], daily: [], history: [] });
      var nextProductLeaderboard = typeof normalizeProductLeaderboardPayload === "function"
        ? normalizeProductLeaderboardPayload(productLeaderboard || state.productLeaderboard || { generatedAt: "", items: [], summary: {} })
        : (productLeaderboard || state.productLeaderboard || { generatedAt: "", items: [], summary: {} });
      var nextProductLeaderboardHistory = Array.isArray(productLeaderboardHistory)
        ? productLeaderboardHistory
        : (Array.isArray(state.productLeaderboardHistory) ? state.productLeaderboardHistory : []);
      var nextPrices = prices && typeof prices === "object" ? prices : (state.prices || { generatedAt: "", platforms: {} });
      var nextSmartPriceWorkbenchLive = smartPriceWorkbenchLive && typeof smartPriceWorkbenchLive === "object"
        ? smartPriceWorkbenchLive
        : (state.smartPriceWorkbenchLive || { generatedAt: "", platforms: {} });
      var nextSmartPriceOverlay = smartPriceOverlay && typeof smartPriceOverlay === "object"
        ? smartPriceOverlay
        : (state.smartPriceOverlay || { generatedAt: "", platforms: {} });
      var nextRepricerLive = repricerLive && typeof repricerLive === "object"
        ? repricerLive
        : (state.repricerLive || { generatedAt: "", rows: [] });
      var nextRepricer = repricer && typeof repricer === "object"
        ? repricer
        : (state.repricer || { generatedAt: "", summary: {}, rows: [] });
      var nextPriceWorkbenchSupport = priceWorkbenchSupport && typeof priceWorkbenchSupport === "object"
        ? priceWorkbenchSupport
        : (state.priceWorkbenchSupport || { generatedAt: "", platforms: {} });
      var nextSyncHealth = syncHealth && typeof syncHealth === "object"
        ? syncHealth
        : (state.syncHealth || SYNC_HEALTH_FALLBACK);
      var nextPortalDataQuarantine = portalDataQuarantine && typeof portalDataQuarantine === "object"
        ? portalDataQuarantine
        : (state.portalDataQuarantine || DATA_QUARANTINE_FALLBACK);
      var nextPortalDataQuality = portalDataQuality && typeof portalDataQuality === "object"
        ? portalDataQuality
        : (state.portalDataQuality || DATA_QUALITY_FALLBACK);
      var nextSkuAliases = skuAliases && typeof skuAliases === "object"
        ? skuAliases
        : (state.skuAliases || SKU_ALIASES_FALLBACK);
      var nextSkuAliasIgnore = skuAliasIgnore && typeof skuAliasIgnore === "object"
        ? skuAliasIgnore
        : (state.skuAliasIgnore || SKU_ALIAS_IGNORE_FALLBACK);
      var nextSkuAliasAudit = skuAliasAudit && typeof skuAliasAudit === "object"
        ? skuAliasAudit
        : (state.skuAliasAudit || SKU_ALIAS_AUDIT_FALLBACK);
      var nextSkuMatrix = skuMatrix && typeof skuMatrix === "object"
        ? skuMatrix
        : (state.skuMatrix || SKU_MATRIX_FALLBACK);
      var nextSmartPriceWorkbenchBase = typeof mergeSmartWorkbenchPayload === "function"
        ? mergeSmartWorkbenchPayload(smartPriceWorkbench || state.smartPriceWorkbenchBase || { generatedAt: "", platforms: {} }, nextSmartPriceWorkbenchLive)
        : (smartPriceWorkbench || state.smartPriceWorkbenchBase || { generatedAt: "", platforms: {} });
      var nextSmartPriceWorkbench = typeof mergeSmartWorkbenchPriceOverlay === "function"
        ? mergeSmartWorkbenchPriceOverlay(nextSmartPriceWorkbenchBase, nextSmartPriceOverlay)
        : nextSmartPriceWorkbenchBase;
      var nextOrderProcurement = orderProcurement && typeof orderProcurement === "object"
        ? orderProcurement
        : (state.orderProcurementData || state.orderProcurementSnapshot || { generatedAt: "", rows: [] });
      var nextOrderProcurementWb = orderProcurementWb && typeof orderProcurementWb === "object"
        ? orderProcurementWb
        : (state.orderProcurementWb || { generatedAt: "", rows: [] });
      var nextOrderProcurementOzon = orderProcurementOzon && typeof orderProcurementOzon === "object"
        ? orderProcurementOzon
        : (state.orderProcurementOzon || { generatedAt: "", rows: [] });
      var nextOrderProcurementYm = orderProcurementYm && typeof orderProcurementYm === "object"
        ? orderProcurementYm
        : (state.orderProcurementYm || { generatedAt: "", rows: [] });
      var nextOosControl = oosControl && typeof oosControl === "object"
        ? oosControl
        : (state.oosControl || OOS_CONTROL_FALLBACK);
      var nextWarehouseStockOverlay = warehouseStockOverlay && typeof warehouseStockOverlay === "object"
        ? warehouseStockOverlay
        : (state.warehouseStockOverlay || { generatedAt: "", rows: [] });

      if (payloadChanged("dashboard", state.dashboard, nextDashboard)) {
        state.dashboard = nextDashboard;
        changed = true;
      }
      if (payloadChanged("platform_trends", state.platformTrends, nextPlatformTrends)) {
        state.platformTrends = nextPlatformTrends;
        changed = true;
      }
      if (payloadChanged("platform_plan", state.platformPlan, nextPlatformPlan)) {
        state.platformPlan = nextPlatformPlan;
        changed = true;
      }
      if (payloadChanged("iu_plan", state.iuPlan, nextIuPlan)) {
        state.iuPlan = nextIuPlan;
        changed = true;
      }
      if (payloadChanged("logistics", state.logistics, nextLogistics)) {
        state.logistics = nextLogistics;
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
      if (payloadChanged("portal_sync_health", state.syncHealth, nextSyncHealth)) {
        state.syncHealth = nextSyncHealth;
        changed = true;
      }
      if (payloadChanged("portal_data_quarantine", state.portalDataQuarantine, nextPortalDataQuarantine)) {
        state.portalDataQuarantine = nextPortalDataQuarantine;
        changed = true;
      }
      if (payloadChanged("portal_data_quality", state.portalDataQuality, nextPortalDataQuality)) {
        state.portalDataQuality = nextPortalDataQuality;
        changed = true;
      }
      if (payloadChanged("sku_aliases", state.skuAliases, nextSkuAliases)) {
        state.skuAliases = nextSkuAliases;
        changed = true;
      }
      if (payloadChanged("sku_alias_ignore", state.skuAliasIgnore, nextSkuAliasIgnore)) {
        state.skuAliasIgnore = nextSkuAliasIgnore;
        changed = true;
      }
      if (payloadChanged("sku_alias_audit", state.skuAliasAudit, nextSkuAliasAudit)) {
        state.skuAliasAudit = nextSkuAliasAudit;
        changed = true;
      }
      if (payloadChanged("sku_matrix", state.skuMatrix, nextSkuMatrix)) {
        state.skuMatrix = nextSkuMatrix;
        changed = true;
      }
      if (payloadChanged("order_procurement", state.orderProcurementData || state.orderProcurementSnapshot, nextOrderProcurement)) {
        state.orderProcurementData = nextOrderProcurement;
        state.orderProcurementSnapshot = nextOrderProcurement;
        state.orderProcurement = nextOrderProcurement;
        changed = true;
      }
      if (payloadChanged("order_procurement_wb", state.orderProcurementWb, nextOrderProcurementWb)) {
        state.orderProcurementWb = nextOrderProcurementWb;
        changed = true;
      }
      if (payloadChanged("order_procurement_ozon", state.orderProcurementOzon, nextOrderProcurementOzon)) {
        state.orderProcurementOzon = nextOrderProcurementOzon;
        changed = true;
      }
      if (payloadChanged("order_procurement_ym", state.orderProcurementYm, nextOrderProcurementYm)) {
        state.orderProcurementYm = nextOrderProcurementYm;
        changed = true;
      }
      if (payloadChanged("oos_control", state.oosControl, nextOosControl)) {
        state.oosControl = nextOosControl;
        changed = true;
      }
      if (payloadChanged("warehouse_stock_overlay", state.warehouseStockOverlay, nextWarehouseStockOverlay)) {
        state.warehouseStockOverlay = nextWarehouseStockOverlay;
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
    if (changed) {
      try {
        window.dispatchEvent(new CustomEvent("altea:datarefresh", {
          detail: { source: "snapshot-refresh", changed: true, at: new Date().toISOString() }
        }));
      } catch (error) {
        console.warn("[portal-snapshot-refresh-hotfix] datarefresh event", error);
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
