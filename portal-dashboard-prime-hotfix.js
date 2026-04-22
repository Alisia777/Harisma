(function () {
  if (window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260422C__) return;
  window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260422C__ = true;

  function installPriceWorkbenchSupportRedirect() {
    if (window.__ALTEA_PRICE_SUPPORT_REDIRECT_20260422C__) return;
    window.__ALTEA_PRICE_SUPPORT_REDIRECT_20260422C__ = true;

    const nativeFetch = window.fetch?.bind(window);
    if (typeof nativeFetch !== 'function') return;

    const fallbackPayload = JSON.stringify({
      generatedAt: new Date().toISOString(),
      platforms: {
        wb: { rows: {} },
        ozon: { rows: {} },
        ym: { rows: {} }
      }
    });

    function jsonResponse(text) {
      return new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    async function inflateBase64Gzip(base64) {
      const normalized = String(base64 || '').replace(/\s+/g, '');
      if (!normalized || typeof DecompressionStream !== 'function') return '';
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).text();
    }

    async function loadSupportLiteParts() {
      const partUrls = [
        'portal-dashboard-support-lite.gz.part01.txt?v=20260422i',
        'portal-dashboard-support-lite.gz.part02.txt?v=20260422i',
        'portal-dashboard-support-lite.gz.part03.txt?v=20260422i',
        'portal-dashboard-support-lite.gz.part04.txt?v=20260422i'
      ];
      try {
        const parts = await Promise.all(partUrls.map(async (url) => {
          const response = await nativeFetch(url, { cache: 'no-store' });
          if (!response || !response.ok) throw new Error(url);
          return response.text();
        }));
        const text = await inflateBase64Gzip(parts.join(''));
        if (text && text.trim()) return jsonResponse(text);
      } catch {}
      return null;
    }

    async function loadSupportPayload() {
      const candidates = [
        'data/price_workbench_support.compact.json',
        'data/price_workbench_support.dashboard-compact.json'
      ];
      for (const candidate of candidates) {
        try {
          const response = await nativeFetch(candidate, { cache: 'no-store' });
          if (response && response.ok) {
            const text = await response.text();
            if (text && text.trim()) return jsonResponse(text);
          }
        } catch {}
      }
      const liteResponse = await loadSupportLiteParts();
      if (liteResponse) return liteResponse;
      return jsonResponse(fallbackPayload);
    }

    window.fetch = function redirectedFetch(input, init) {
      try {
        const rawUrl = typeof input === 'string'
          ? input
          : (input && typeof input.url === 'string' ? input.url : '');
        if (rawUrl && rawUrl.includes('data/price_workbench_support.json')) {
          return loadSupportPayload();
        }
      } catch {}
      return nativeFetch(input, init);
    };
  }

  function isDashboardActive() {
    return (typeof state === 'object' && state && state.activeView === 'dashboard')
      || !!document.getElementById('view-dashboard')?.classList.contains('active');
  }

  let softPrimeTimer = 0;

  function safePrimeDashboard() {
    installPriceWorkbenchSupportRedirect();
    if (!isDashboardActive()) return;
    if (document.getElementById('portalDashboardExecutiveRoot')) return;

    try {
      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
        return;
      }
      if (typeof window.rerenderCurrentView === 'function') {
        window.rerenderCurrentView();
      }
    } catch (error) {
      console.warn('[portal-dashboard-prime-hotfix] soft prime', error);
    }
  }

  function scheduleSoftPrime(delay = 120) {
    window.clearTimeout(softPrimeTimer);
    softPrimeTimer = window.setTimeout(safePrimeDashboard, delay);
  }

  installPriceWorkbenchSupportRedirect();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleSoftPrime(120), { once: true });
  } else {
    scheduleSoftPrime(120);
  }

  window.addEventListener('load', () => scheduleSoftPrime(240), { once: true });
  window.addEventListener('altea:viewchange', (event) => {
    if (event?.detail?.view === 'dashboard') scheduleSoftPrime(120);
  });
})();
