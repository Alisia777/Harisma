(function () {
  if (window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260422B__) return;
  window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260422B__ = true;

  function installPriceWorkbenchSupportRedirect() {
    if (window.__ALTEA_PRICE_SUPPORT_REDIRECT_20260422B__) return;
    window.__ALTEA_PRICE_SUPPORT_REDIRECT_20260422B__ = true;
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
        'portal-dashboard-support-lite.gz.part01.txt?v=20260422b',
        'portal-dashboard-support-lite.gz.part02.txt?v=20260422b',
        'portal-dashboard-support-lite.gz.part03.txt?v=20260422b',
        'portal-dashboard-support-lite.gz.part04.txt?v=20260422b'
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

  function interactiveBundleReady() {
    return !!window.renderDashboard?.__dashboardInteractiveWrapped
      || !!window.rerenderCurrentView?.__dashboardInteractiveWrapped
      || !!document.getElementById('portalDashboardExecutiveRoot');
  }

  function rearmInteractiveBundle() {
    if (window.__ALTEA_DASHBOARD_INTERACTIVE_REARMED_20260422B__) return;
    window.__ALTEA_DASHBOARD_INTERACTIVE_REARMED_20260422B__ = true;
    try {
      delete window.__ALTEA_DASHBOARD_INTERACTIVE_20260420M__;
    } catch {
      window.__ALTEA_DASHBOARD_INTERACTIVE_20260420M__ = false;
    }
    const script = document.createElement('script');
    script.src = 'portal-dashboard-interactive-hotfix.js?v=20260420n&rearm=20260422b';
    script.async = false;
    script.onload = () => {
      window.setTimeout(() => {
        wakeDashboardBundle();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
      }, 120);
    };
    (document.head || document.body || document.documentElement).appendChild(script);
  }

  function wakeDashboardBundle() {
    try {
      window.dispatchEvent(new CustomEvent('altea:viewchange', {
        detail: { view: 'dashboard', source: 'dashboard-prime-hotfix' }
      }));
    } catch {}

    const button = document.querySelector('.nav-btn[data-view="dashboard"]');
    if (!button) return;
    try {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    } catch {}
  }

  function primeDashboard() {
    installPriceWorkbenchSupportRedirect();
    const onDashboard = (typeof state === 'object' && state && state.activeView === 'dashboard')
      || document.getElementById('view-dashboard')?.classList.contains('active');
    if (!onDashboard) return;
    if (typeof window.rerenderCurrentView === 'function') {
      window.rerenderCurrentView();
    }
    if (!document.getElementById('portalDashboardExecutiveRoot') && typeof window.renderDashboard === 'function') {
      window.renderDashboard();
    }
    wakeDashboardBundle();
    if (!interactiveBundleReady()) rearmInteractiveBundle();
  }

  function startPrimeLoop() {
    if (window.__ALTEA_DASHBOARD_PRIME_LOOP_20260422B__) return;
    window.__ALTEA_DASHBOARD_PRIME_LOOP_20260422B__ = true;
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      primeDashboard();
      if (document.getElementById('portalDashboardExecutiveRoot')) return;
      if (attempts >= 24) return;
      window.setTimeout(tick, 1200);
    };
    window.setTimeout(tick, 1400);
  }

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.setTimeout(primeDashboard, 60);
      window.setTimeout(primeDashboard, 320);
      window.setTimeout(primeDashboard, 900);
      window.setTimeout(primeDashboard, 2200);
      window.setTimeout(primeDashboard, 5200);
      window.setTimeout(primeDashboard, 12000);
      window.setTimeout(primeDashboard, 18000);
      startPrimeLoop();
    });
  } else {
    window.setTimeout(primeDashboard, 120);
    window.setTimeout(primeDashboard, 360);
    window.setTimeout(primeDashboard, 960);
    window.setTimeout(primeDashboard, 2400);
    window.setTimeout(primeDashboard, 5400);
    window.setTimeout(primeDashboard, 12200);
    window.setTimeout(primeDashboard, 18200);
    startPrimeLoop();
  }
})();
