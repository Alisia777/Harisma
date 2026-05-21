(function () {
  if (window.__ALTEA_LIVE_PRODUCT_GUARD_20260521__) return;
  window.__ALTEA_LIVE_PRODUCT_GUARD_20260521__ = true;
  window.__ALTEA_ENABLE_STAGED_FALLBACK__ = false;

  if (typeof window.repricerFirstFilledNumber !== 'function') {
    window.repricerFirstFilledNumber = function repricerFirstFilledNumber(...values) {
      for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return 0;
    };
  }

  if (typeof window.fetch === 'function' && !window.__ALTEA_STAGED_FETCH_BYPASS_20260521__) {
    window.__ALTEA_STAGED_FETCH_BYPASS_20260521__ = true;
    const baseFetch = window.fetch.bind(window);
    window.fetch = function alteaLiveFetch(input, init) {
      try {
        const raw = typeof input === 'string' ? input : (input && input.url) || '';
        const url = new URL(raw, window.location.href);
        if (url.pathname.includes('/.altea-google-sheet-sync-output/')) {
          return Promise.resolve(new Response('null', {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          }));
        }
        if (
          window.__ALTEA_BLOCK_SUPABASE_SNAPSHOT_PARTS__ === true &&
          url.hostname.endsWith('.supabase.co') &&
          url.pathname.includes('/portal_data_snapshots') &&
          String(url.searchParams.get('snapshot_key') || '').includes('__part__')
        ) {
          return Promise.resolve(new Response('[]', {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          }));
        }
      } catch {
        // Fall through to the real request.
      }
      return baseFetch(input, init);
    };
  }

  function activeView() {
    if (typeof state === 'object' && state && state.activeView) return String(state.activeView || '');
    const active = document.querySelector('.view.active[id^="view-"]');
    return active ? String(active.id || '').replace(/^view-/, '') : '';
  }

  function installEnsureViewDataGuard() {
    if (typeof ensureViewData !== 'function' || ensureViewData.__alteaLiveGuarded) return;
    const original = ensureViewData;
    const wrapped = function guardedEnsureViewData(view) {
      const requested = String(view || '');
      const isHeavyIdleCandidate = requested === 'sku-plan-fact' || requested === 'oos-control';
      const appReady = typeof state === 'object' && state && state.boot && state.boot.dataReady;
      if (
        isHeavyIdleCandidate &&
        appReady &&
        activeView() !== requested &&
        window.__ALTEA_ALLOW_BACKGROUND_PREFETCH__ !== true
      ) {
        return Promise.resolve();
      }
      return original.apply(this, arguments);
    };
    wrapped.__alteaLiveGuarded = true;
    ensureViewData = wrapped;
    window.ensureViewData = wrapped;
  }

  installEnsureViewDataGuard();
  window.setTimeout(installEnsureViewDataGuard, 0);
})();
