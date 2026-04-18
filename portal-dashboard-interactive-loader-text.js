(function () {
  if (window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260418ZA__) return;
  window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260418ZA__ = true;

  const SCRIPT_ID = 'portalDashboardInteractiveHotfixRuntime';
  const SCRIPT_SRC = 'portal-dashboard-interactive-hotfix.js?v=20260418z';

  function kick() {
    if (typeof window.__ALTEA_PRICE_INTEL_BOOT__ === 'function') {
      window.__ALTEA_PRICE_INTEL_BOOT__(true);
    }
  }

  function ensureScript() {
    if (typeof window.__ALTEA_PRICE_INTEL_BOOT__ === 'function') {
      kick();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', kick, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = kick;
    script.onerror = () => console.warn('[portal-dashboard-interactive-loader]', 'Failed to load ' + SCRIPT_SRC);
    document.body.appendChild(script);
  }

  function start() {
    ensureScript();
    [600, 1800, 4200, 7600].forEach((delay) => {
      window.setTimeout(() => {
        ensureScript();
        kick();
      }, delay);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
