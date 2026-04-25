(function () {
  if (window.__ALTEA_SMART_PRICE_OVERLAY_FASTPATH_20260425A__) return;
  window.__ALTEA_SMART_PRICE_OVERLAY_FASTPATH_20260425A__ = true;

  var SNAPSHOT_TABLE = "portal_data_snapshots";
  var SNAPSHOT_KEY = "smart_price_overlay";
  var OVERLAY_PATH = "data/smart_price_overlay.json";
  var FETCH_TIMEOUT_MS = 2600;
  var stateApplyTimer = 0;
  var overlayPromise = null;

  function cfg() {
    var raw = window.APP_CONFIG || {};
    return {
      brand: raw.brand || "\u0410\u043b\u0442\u0435\u044f",
      supabase: {
        url: (raw.supabase && raw.supabase.url) || "https://iyckwryrucqrxwlowxow.supabase.co",
        anonKey: (raw.supabase && raw.supabase.anonKey) || "sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw"
      }
    };
  }

  function brand() {
    if (typeof currentBrand === "function") return currentBrand();
    return cfg().brand;
  }

  function normalizePath(path) {
    return String(path || "").replaceAll("\\", "/").split("?")[0].replace(/^\//, "");
  }

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function jsonResponse(payload) {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  function partKeys(count) {
    var keys = [];
    for (var index = 1; index <= count; index += 1) {
      keys.push(SNAPSHOT_KEY + "__part__" + String(index).padStart(4, "0"));
    }
    return keys;
  }

  async function fetchJsonWithTimeout(url, headers) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS) : 0;
    try {
      var response = await fetch(url, {
        cache: "no-store",
        headers: headers,
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error("Supabase overlay " + response.status);
      return await response.json();
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function buildQueryUrl(selectValue, filterValue) {
    var active = cfg();
    var baseUrl = String(active.supabase.url || "").replace(/\/+$/, "");
    var url = new URL(baseUrl + "/rest/v1/" + SNAPSHOT_TABLE);
    url.searchParams.set("select", selectValue);
    url.searchParams.set("brand", "eq." + brand());
    url.searchParams.set("snapshot_key", filterValue);
    url.searchParams.set("order", "snapshot_key.asc");
    return url.toString();
  }

  async function fetchOverlayFast() {
    if (overlayPromise) return overlayPromise;

    overlayPromise = (async function () {
      var active = cfg();
      if (!active.supabase.url || !active.supabase.anonKey) return null;
      var headers = {
        apikey: active.supabase.anonKey,
        Authorization: "Bearer " + active.supabase.anonKey,
        Accept: "application/json"
      };

      var mainRows = await fetchJsonWithTimeout(
        buildQueryUrl("snapshot_key,payload,updated_at", "eq." + SNAPSHOT_KEY),
        headers
      );
      var main = Array.isArray(mainRows) ? mainRows[0] : null;
      if (!main || !main.payload) return null;
      if (!main.payload.chunked) return clone(main.payload);

      var expected = Number(main.payload.chunk_count || main.payload.chunkCount || 0);
      if (!expected) return null;

      var keys = partKeys(expected);
      var partsRows = await fetchJsonWithTimeout(
        buildQueryUrl("snapshot_key,payload", "in.(" + keys.join(",") + ")"),
        headers
      );

      var partsMap = new Map();
      (Array.isArray(partsRows) ? partsRows : []).forEach(function (row) {
        partsMap.set(String(row && row.snapshot_key || ""), String(row && row.payload && row.payload.data || ""));
      });

      var payloadJson = keys.map(function (key) {
        return partsMap.get(key) || "";
      }).join("");
      if (!payloadJson) return null;

      var payload = JSON.parse(payloadJson);
      if (main.payload.generatedAt && !payload.generatedAt) payload.generatedAt = main.payload.generatedAt;
      window.__ALTEA_SMART_PRICE_OVERLAY_FAST_CACHE__ = clone(payload);
      return payload;
    })().catch(function (error) {
      console.warn("[portal-smart-price-overlay-fastpath]", error);
      overlayPromise = null;
      return null;
    });

    return overlayPromise;
  }

  function requestStateRefresh() {
    if (stateApplyTimer) window.clearTimeout(stateApplyTimer);
    stateApplyTimer = window.setTimeout(function () {
      fetchOverlayFast().then(function (payload) {
        if (!payload) return;
        if (typeof state !== "object" || !state) return;
        state.smartPriceOverlay = clone(payload);
        if (typeof rerenderCurrentView === "function" && /^(prices|repricer)$/.test(String(state.activeView || ""))) {
          rerenderCurrentView();
        }
      }).catch(function (error) {
        console.warn("[portal-smart-price-overlay-fastpath]", error);
      });
    }, 120);
  }

  var originalSnapshotLoader = typeof window.__alteaLoadPortalSnapshot === "function"
    ? window.__alteaLoadPortalSnapshot.bind(window)
    : null;
  window.__alteaLoadPortalSnapshot = async function patchedOverlaySnapshotLoader(path) {
    if (normalizePath(path) === OVERLAY_PATH) {
      return clone(await fetchOverlayFast());
    }
    if (originalSnapshotLoader) return originalSnapshotLoader(path);
    return null;
  };

  if (typeof window.fetch === "function") {
    var originalFetch = window.fetch.bind(window);
    window.fetch = async function patchedOverlayFetch(input, init) {
      var path = normalizePath(typeof input === "string" ? input : input && input.url || "");
      if (path === OVERLAY_PATH) {
        var payload = await fetchOverlayFast();
        if (payload) return jsonResponse(payload);
      }
      return originalFetch(input, init);
    };
  }

  [120, 900, 2400, 5200].forEach(function (delay) {
    window.setTimeout(requestStateRefresh, delay);
  });
  window.addEventListener("altea:viewchange", function (event) {
    var view = event && event.detail && event.detail.view;
    if (!/^(prices|repricer)$/.test(String(view || ""))) return;
    requestStateRefresh();
  });
})();
