(function () {
  'use strict';

  if (window.__ALTEA_PORTAL_SNAPSHOT_TRANSPORT_V1__) return;

  var MAX_CONCURRENT_REQUESTS = 2;
  var MAX_ATTEMPTS = 5;
  var REQUEST_TIMEOUT_MS = 45000;
  var RETRY_BASE_DELAY_MS = 1200;
  var CACHE_TTL_MS = 20000;
  var activeRequests = 0;
  var maxObservedConcurrency = 0;
  var queue = [];
  var inflight = Object.create(null);
  var cache = Object.create(null);
  var stats = {
    networkRequests: 0,
    retries: 0
  };

  function wait(milliseconds) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, milliseconds);
    });
  }

  function canonicalRequestKey(rawUrl) {
    try {
      var url = new URL(String(rawUrl || ''));
      url.searchParams.delete('order');
      if (typeof url.searchParams.sort === 'function') url.searchParams.sort();
      return url.toString();
    } catch (_) {
      return String(rawUrl || '');
    }
  }

  function retryableStatus(status) {
    var code = Number(status || 0);
    return code === 0 || code === 408 || code === 425 || code === 429 || code >= 500;
  }

  function schedule(task, priority) {
    return new Promise(function (resolve, reject) {
      var item = { task: task, resolve: resolve, reject: reject };
      if (priority === 'high') queue.unshift(item);
      else queue.push(item);
      pump();
    });
  }

  function pump() {
    while (activeRequests < MAX_CONCURRENT_REQUESTS && queue.length) {
      var item = queue.shift();
      activeRequests += 1;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, activeRequests);
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(function () {
          activeRequests -= 1;
          pump();
        });
    }
  }

  async function fetchJsonWithRetry(rawUrl, requestOptions) {
    var fetchOptions = requestOptions.fetchOptions || {};
    var label = String(requestOptions.label || 'Supabase snapshots');
    var lastError = null;

    for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = controller
        ? window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS)
        : 0;
      try {
        stats.networkRequests += 1;
        var response = await fetch(String(rawUrl || ''), Object.assign({}, fetchOptions, {
          signal: controller ? controller.signal : fetchOptions.signal
        }));
        if (!response || !response.ok) {
          var status = Number(response && response.status || 0);
          var errorBody = '';
          try {
            errorBody = String(await response.text() || '').slice(0, 400);
          } catch (_) {}
          var responseError = new Error(label + ' ' + (status || 'request failed') + (errorBody ? ': ' + errorBody : ''));
          responseError.status = status;
          throw responseError;
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        var statusCode = Number(error && error.status || 0);
        var canRetry = retryableStatus(statusCode)
          && !/Supabase snapshots 4\d\d/.test(String(error && error.message || ''));
        if (!canRetry || attempt >= MAX_ATTEMPTS) throw error;
        stats.retries += 1;
      } finally {
        if (timer) window.clearTimeout(timer);
      }
      await wait(Math.min(RETRY_BASE_DELAY_MS * attempt, 6000));
    }

    throw lastError || new Error(String(requestOptions.label || 'Supabase snapshots') + ' request failed');
  }

  function requestJson(rawUrl, options) {
    var requestOptions = options || {};
    var key = canonicalRequestKey(rawUrl);
    var now = Date.now();
    var cached = cache[key];

    if (inflight[key]) return inflight[key];
    if (!requestOptions.force && cached && now - cached.savedAt <= CACHE_TTL_MS) {
      return Promise.resolve(cached.value);
    }

    var promise = schedule(function () {
      return fetchJsonWithRetry(rawUrl, requestOptions);
    }, requestOptions.priority)
      .then(function (value) {
        cache[key] = { savedAt: Date.now(), value: value };
        return value;
      })
      .finally(function () {
        delete inflight[key];
      });
    inflight[key] = promise;
    return promise;
  }

  function invalidate() {
    cache = Object.create(null);
  }

  function diagnostics() {
    return {
      active: activeRequests,
      queued: queue.length,
      inflight: Object.keys(inflight).length,
      cached: Object.keys(cache).length,
      maxObservedConcurrency: maxObservedConcurrency,
      networkRequests: stats.networkRequests,
      retries: stats.retries
    };
  }

  window.__ALTEA_PORTAL_SNAPSHOT_TRANSPORT_V1__ = {
    requestJson: requestJson,
    invalidate: invalidate,
    diagnostics: diagnostics
  };
})();
