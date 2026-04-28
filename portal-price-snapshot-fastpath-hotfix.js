(function () {
  if (window.__ALTEA_PRICE_SIMPLE_RUNTIME_MODE__) return;
  if (window.__ALTEA_PRICE_SNAPSHOT_FASTPATH_20260425D__) return;
  window.__ALTEA_PRICE_SNAPSHOT_FASTPATH_20260425D__ = true;

  var SNAPSHOT_TABLE = "portal_data_snapshots";
  var DIRECT_FETCH_TIMEOUT_MS = 15000;
  var PATH_TO_SNAPSHOT = {
    "data/smart_price_overlay.json": "smart_price_overlay",
    "data/order_procurement.json": "order_procurement",
    "data/order_procurement_wb.json": "order_procurement_wb",
    "data/order_procurement_ozon.json": "order_procurement_ozon"
  };
  var SKIP_SNAPSHOT_PATHS = {
    "data/smart_price_workbench.json": true
  };
  var PRICE_SUPPORT_URL_RE = /(smart_price_overlay|order_procurement(?:_wb|_ozon)?)\.json/i;
  var PRICE_SUPPORT_FETCH_TIMEOUT_MS = 1800;
  var cache = Object.create(null);

  function normalizePath(path) {
    return String(path || "")
      .replace(/\\/g, "/")
      .split("?")[0]
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\//, "");
  }

  function snapshotKeyFromPath(path) {
    return PATH_TO_SNAPSHOT[normalizePath(path)] || null;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function cfg() {
    var fallback = {
      brand: "103b42354f",
      supabase: {
        url: "https://iyckwryrucqrxwlowxow.supabase.co",
        anonKey: "sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw"
      }
    };
    try {
      if (typeof window.currentConfig === "function") {
        var current = window.currentConfig();
        if (current && current.supabase && current.supabase.url && current.supabase.anonKey) {
          return {
            brand: String(current.brand || fallback.brand),
            supabase: {
              url: String(current.supabase.url || fallback.supabase.url),
              anonKey: String(current.supabase.anonKey || fallback.supabase.anonKey)
            }
          };
        }
      }
    } catch {}
    if (window.APP_CONFIG && window.APP_CONFIG.supabase && window.APP_CONFIG.supabase.url && window.APP_CONFIG.supabase.anonKey) {
      return {
        brand: String(window.APP_CONFIG.brand || fallback.brand),
        supabase: {
          url: String(window.APP_CONFIG.supabase.url || fallback.supabase.url),
          anonKey: String(window.APP_CONFIG.supabase.anonKey || fallback.supabase.anonKey)
        }
      };
    }
    return fallback;
  }

  function jsonResponse(payload, meta) {
    var responseHeaders = {
      "Content-Type": "application/json; charset=utf-8",
      "X-Altea-Source": String(meta && meta.source || "snapshot-fastpath")
    };
    if (meta && meta.snapshotKey) {
      responseHeaders["X-Altea-Snapshot-Key"] = String(meta.snapshotKey);
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: responseHeaders
    });
  }

  function headers() {
    var active = cfg();
    return {
      apikey: active.supabase.anonKey,
      Authorization: "Bearer " + active.supabase.anonKey,
      Accept: "application/json"
    };
  }

  function buildSnapshotUrl(selectValue, filterValue, limitValue) {
    var active = cfg();
    var baseUrl = String(active.supabase.url || "").replace(/\/+$/, "");
    var url = new URL(baseUrl + "/rest/v1/" + SNAPSHOT_TABLE);
    url.searchParams.set("select", selectValue);
    url.searchParams.set("brand", "eq." + String(active.brand || "103b42354f"));
    url.searchParams.set("snapshot_key", filterValue);
    url.searchParams.set("order", "snapshot_key.asc");
    if (limitValue != null) url.searchParams.set("limit", String(limitValue));
    return url.toString();
  }

  async function fetchJsonWithTimeout(url) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, DIRECT_FETCH_TIMEOUT_MS) : 0;
    try {
      var response = await window.fetch(url, {
        cache: "no-store",
        headers: headers(),
        signal: controller ? controller.signal : undefined
      });
      if (!response || !response.ok) throw new Error("Supabase snapshot " + (response && response.status || "request failed"));
      return await response.json();
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function payloadText(payload) {
    if (typeof payload === "string") return payload;
    if (payload && typeof payload.data === "string") return payload.data;
    return "";
  }

  function applyMeta(payload, row, manifestPayload) {
    if (!payload || typeof payload !== "object") return payload;
    var next = clone(payload) || {};
    var manifest = manifestPayload && typeof manifestPayload === "object" ? manifestPayload : null;
    if (manifest && manifest.generatedAt && !next.generatedAt) next.generatedAt = manifest.generatedAt;
    if (row && row.generated_at && !next.generatedAt) next.generatedAt = row.generated_at;
    if (row && row.updated_at && !next.updatedAt) next.updatedAt = row.updated_at;
    return next;
  }

  function partKeyList(snapshotKey, count) {
    var keys = [];
    for (var index = 1; index <= count; index += 1) {
      keys.push(snapshotKey + "__part__" + String(index).padStart(4, "0"));
    }
    return keys;
  }

  async function fetchBaseRow(snapshotKey) {
    var rows = await fetchJsonWithTimeout(
      buildSnapshotUrl("snapshot_key,payload,generated_at,updated_at", "eq." + snapshotKey, 1)
    );
    return Array.isArray(rows) ? (rows[0] || null) : null;
  }

  async function fetchPartData(snapshotKey) {
    var rows = await fetchJsonWithTimeout(
      buildSnapshotUrl("snapshot_key,payload,generated_at,updated_at", "eq." + snapshotKey, 1)
    );
    return Array.isArray(rows) ? (rows[0] || null) : null;
  }

  async function fetchChunkedSnapshot(snapshotKey, baseRow) {
    var manifest = baseRow && baseRow.payload && typeof baseRow.payload === "object" ? baseRow.payload : null;
    var expected = Number(
      manifest && (manifest.chunk_count != null ? manifest.chunk_count : manifest.chunkCount)
        || 0
    );
    if (!expected) return null;
    var rows = await Promise.all(partKeyList(snapshotKey, expected).map(fetchPartData));
    rows = rows.filter(Boolean).sort(function (left, right) {
      return String(left && left.snapshot_key || "").localeCompare(String(right && right.snapshot_key || ""));
    });
    if (!rows.length || rows.length !== expected) return null;
    var text = rows.map(function (row) { return payloadText(row && row.payload); }).join("");
    if (!text) return null;
    var parsed = JSON.parse(text);
    return applyMeta(parsed, rows[rows.length - 1], manifest);
  }

  async function fetchSnapshotPayload(snapshotKey) {
    if (!snapshotKey) return null;
    if (cache[snapshotKey]) return cache[snapshotKey];

    cache[snapshotKey] = Promise.resolve().then(async function () {
      var baseRow = await fetchBaseRow(snapshotKey).catch(function () { return null; });
      if (baseRow && baseRow.payload && !(baseRow.payload && baseRow.payload.chunked === true)) {
        return applyMeta(baseRow.payload, baseRow, baseRow.payload);
      }

      var chunked = await fetchChunkedSnapshot(snapshotKey, baseRow || null).catch(function (error) {
        console.warn("[price-snapshot-fastpath]", snapshotKey, error);
        return null;
      });
      if (chunked) return chunked;

      if (baseRow && baseRow.payload) {
        return applyMeta(baseRow.payload, baseRow, baseRow.payload);
      }
      return null;
    }).catch(function (error) {
      console.warn("[price-snapshot-fastpath]", snapshotKey, error);
      cache[snapshotKey] = null;
      return null;
    });

    return cache[snapshotKey];
  }

  function installFetchPatch() {
    if (typeof window.fetch !== "function") return false;
    if (window.fetch.__ALTEA_PRICE_SNAPSHOT_DIRECT_PATCHED__) return true;

    var originalFetch = window.fetch.bind(window);
    window.fetch = function patchedPriceSnapshotFetch(input, init) {
      var raw = "";
      try {
        raw = typeof input === "string" ? input : (input && input.url) || "";
      } catch {}

      var snapshotKey = snapshotKeyFromPath(raw);
      if (snapshotKey) {
        return fetchSnapshotPayload(snapshotKey).then(function (payload) {
          if (payload) {
            return jsonResponse(clone(payload), {
              source: "snapshot-fastpath",
              snapshotKey: snapshotKey
            });
          }
          return originalFetch(input, init);
        });
      }

      if (!PRICE_SUPPORT_URL_RE.test(String(raw || ""))) {
        return originalFetch(input, init);
      }

      return Promise.race([
        originalFetch(input, init),
        new Promise(function (resolve) {
          window.setTimeout(function () {
            resolve(new Response("", { status: 404, statusText: "Timed out price support fetch" }));
          }, PRICE_SUPPORT_FETCH_TIMEOUT_MS);
        })
      ]);
    };
    window.fetch.__ALTEA_PRICE_SNAPSHOT_DIRECT_PATCHED__ = true;
    return true;
  }

  function installSnapshotLoaderPatch() {
    if (typeof window.__alteaLoadPortalSnapshot !== "function") return false;
    if (window.__ALTEA_PRICE_SNAPSHOT_FASTPATH_PATCHED_D__) return true;

    var original = window.__alteaLoadPortalSnapshot.bind(window);
    window.__ALTEA_PRICE_SNAPSHOT_FASTPATH_PATCHED_D__ = true;
    window.__alteaLoadPortalSnapshot = function patchedAlteaLoadPortalSnapshot(path) {
      var normalizedPath = normalizePath(path);
      if (SKIP_SNAPSHOT_PATHS[normalizedPath]) return Promise.resolve(null);
      var snapshotKey = snapshotKeyFromPath(path);
      if (!snapshotKey) return original(path);
      return fetchSnapshotPayload(snapshotKey).then(function (payload) {
        return payload ? clone(payload) : original(path);
      });
    };
    return true;
  }

  function install() {
    installFetchPatch();
    return installSnapshotLoaderPatch();
  }

  if (install()) return;

  var attempts = 0;
  var timer = window.setInterval(function () {
    attempts += 1;
    if (install() || attempts >= 24) {
      window.clearInterval(timer);
    }
  }, 250);
})();
