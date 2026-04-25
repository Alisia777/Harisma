(function () {
  if (window.__ALTEA_PRICE_SNAPSHOT_FASTPATH_20260425A__) return;
  window.__ALTEA_PRICE_SNAPSHOT_FASTPATH_20260425A__ = true;

  var PRICE_SNAPSHOT_TIMEOUT_MS = 9000;
  var PRICE_URL_RE = /smart_price_(workbench|overlay)\.json/i;
  var PRICE_SUPPORT_URL_RE = /(smart_price_overlay|order_procurement(?:_wb|_ozon)?)\.json/i;
  var PRICE_SUPPORT_FETCH_TIMEOUT_MS = 1800;

  function withTimeout(task, timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(null);
      }, timeoutMs);

      Promise.resolve(task).then(function (value) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value == null ? null : value);
      }).catch(function () {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(null);
      });
    });
  }

  function installFetchGuard() {
    if (typeof window.fetch !== "function") return false;
    if (window.fetch && window.fetch.__ALTEA_PRICE_FETCH_GUARD__) return true;

    var originalFetch = window.fetch.bind(window);
    window.fetch = function patchedPriceSupportFetch(input, init) {
      var raw = "";
      try {
        raw = typeof input === "string" ? input : (input && input.url) || "";
      } catch (error) {
        raw = "";
      }

      if (!PRICE_SUPPORT_URL_RE.test(String(raw || ""))) {
        return originalFetch(input, init);
      }

      if (/smart_price_overlay\.json/i.test(String(raw || ""))) {
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
    window.fetch.__ALTEA_PRICE_FETCH_GUARD__ = true;
    return true;
  }

  function install() {
    if (typeof window.__alteaLoadPortalSnapshot !== "function") return false;
    if (window.__ALTEA_PRICE_SNAPSHOT_FASTPATH_PATCHED__) return true;

    var original = window.__alteaLoadPortalSnapshot.bind(window);
    window.__ALTEA_PRICE_SNAPSHOT_FASTPATH_PATCHED__ = true;
    window.__alteaLoadPortalSnapshot = function patchedAlteaLoadPortalSnapshot(url) {
      if (!PRICE_URL_RE.test(String(url || ""))) {
        return original(url);
      }
      return withTimeout(original(url), PRICE_SNAPSHOT_TIMEOUT_MS);
    };
    return true;
  }

  installFetchGuard();
  if (install()) return;

  var attempts = 0;
  var timer = window.setInterval(function () {
    attempts += 1;
    installFetchGuard();
    if (install() || attempts >= 20) {
      window.clearInterval(timer);
    }
  }, 250);
})();
