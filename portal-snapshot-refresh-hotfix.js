(function () {
  if (window.__ALTEA_SNAPSHOT_REFRESH_HOTFIX_20260425B__) return;
  window.__ALTEA_SNAPSHOT_REFRESH_HOTFIX_20260425B__ = true;

  var SNAPSHOT_TABLE = "portal_data_snapshots";
  var PATH_MAP = {
    "data/dashboard.json": "dashboard",
    "data/skus.json": "skus",
    "data/platform_trends.json": "platform_trends",
    "data/logistics.json": "logistics",
    "data/ads_summary.json": "ads_summary",
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

  function payloadLooksUsable(snapshotKey, payload) {
    if (!payload) return false;
    if (snapshotKey === "skus") return Array.isArray(payload) && payload.length > 0;
    if (snapshotKey === "platform_trends" || snapshotKey === "ads_summary") {
      return Array.isArray(payload && payload.platforms) && payload.platforms.length > 0;
    }
    if (snapshotKey === "platform_plan") {
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

    (rows || []).forEach(function (row) {
      var snapshotKey = String(row && row.snapshot_key || "").trim();
      if (!snapshotKey) return;
      metaByKey[snapshotKey] = row;
      var chunkMeta = parseChunkedSnapshotKey(snapshotKey);
      if (!chunkMeta) {
        payloadByKey[snapshotKey] = withRowMeta(row, row && row.payload);
        return;
      }
      if (!chunkGroups[chunkMeta.baseKey]) chunkGroups[chunkMeta.baseKey] = [];
      chunkGroups[chunkMeta.baseKey].push({
        index: chunkMeta.index,
        payload: row && row.payload
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
      var parts = chunkGroups[baseKey]
        .filter(function (part) {
          return part.index >= 1 && (!expected || part.index <= expected);
        })
        .sort(function (left, right) {
          return left.index - right.index;
        });
      var chunkCount = expected > 0 ? expected : parts.length;
      if (!parts.length || parts.length !== chunkCount) return;
      var text = parts.map(function (part) {
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

  async function fetchSnapshotRows(force) {
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
    if (cache.promise && cache.brand === brand) return cache.promise;

    var baseUrl = String(cfg.supabase.url || "").replace(/\/+$/, "");
    var url = new URL(baseUrl + "/rest/v1/" + SNAPSHOT_TABLE);
    url.searchParams.set("select", "snapshot_key,payload,generated_at,updated_at,payload_hash");
    url.searchParams.set("brand", "eq." + brand);

    cache.brand = brand;
    cache.promise = fetch(url.toString(), {
      headers: {
        apikey: cfg.supabase.anonKey,
        Authorization: "Bearer " + cfg.supabase.anonKey,
        Accept: "application/json"
      }
    })
      .then(function (response) {
        if (!response || !response.ok) {
          throw new Error("Supabase snapshots " + (response && response.status || "request failed"));
        }
        return response.json();
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

  function chooseFreshestPayload(snapshotPayload, localPayload) {
    if (snapshotPayload && localPayload) {
      return freshnessOfPayload(snapshotPayload) >= freshnessOfPayload(localPayload)
        ? snapshotPayload
        : localPayload;
    }
    return snapshotPayload || localPayload || null;
  }

  async function loadSnapshotAwareJson(path, fallback, force) {
    var snapshotKey = snapshotKeyFromPath(path);
    var snapshotPayload = null;
    if (snapshotKey) {
      var rows = await fetchSnapshotRows(force);
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

    return chooseFreshestPayload(snapshotPayload, localPayload) || clone(fallback);
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
    var rows = await fetchSnapshotRows(Boolean(options && options.force));
    var payload = rows[snapshotKey];
    return payloadLooksUsable(snapshotKey, payload) ? clone(payload) : null;
  };

  window.__alteaRefreshSnapshotBackedState = async function refreshSnapshotBackedState(options) {
    var rerender = !options || options.rerender !== false;
    var results = await Promise.all([
      loadSnapshotAwareJson("data/dashboard.json", { cards: [], generatedAt: "" }, true),
      loadSnapshotAwareJson("data/skus.json", [], false)
    ]);
    var dashboard = results[0];
    var skus = results[1];

    if (typeof state === "object" && state) {
      state.dashboard = dashboard || { cards: [], generatedAt: "" };
      state.skus = Array.isArray(skus) ? skus : [];
      if (typeof applyOwnerOverridesToSkus === "function") applyOwnerOverridesToSkus();
    }

    if (rerender && typeof rerenderCurrentView === "function") {
      try {
        rerenderCurrentView();
        if (state && state.activeSku && typeof renderSkuModal === "function") {
          renderSkuModal(state.activeSku);
        }
      } catch (error) {
        console.warn("[portal-snapshot-refresh-hotfix] rerender", error);
      }
    }

    return true;
  };

  function wrapPullRemoteState() {
    var base = typeof window.pullRemoteState === "function"
      ? window.pullRemoteState
      : (typeof pullRemoteState === "function" ? pullRemoteState : null);

    if (!base || base.__alteaSnapshotRefreshWrapped) return Boolean(base);

    var wrapped = async function wrappedPullRemoteState() {
      var result = await base.apply(this, arguments);
      try {
        await window.__alteaRefreshSnapshotBackedState({ rerender: false });
      } catch (error) {
        console.warn("[portal-snapshot-refresh-hotfix] refresh after pull", error);
      }
      if (arguments[0] !== false && typeof rerenderCurrentView === "function") {
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
