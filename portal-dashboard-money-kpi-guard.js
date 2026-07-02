(function () {
  'use strict';

  const EXPECTED_VERSION = '20260702-dashboard-no-buyout-proxy1';
  const SCRIPT_URL = `portal-dashboard-ceo-motion-v1.js?v=20260702dashboardnobuyoutproxy1-force&ts=${Date.now()}`;
  let loadPromise = null;
  let checks = 0;

  function activeView() {
    const stateView = window.__alteaAppState?.activeView || window.state?.activeView || window.__ALTEA_STATE__?.activeView || '';
    const hashView = String(window.location.hash || '').replace(/^#\/?/, '');
    const activeSection = document.querySelector('.view.active');
    const domView = activeSection ? String(activeSection.id || '').replace(/^view-/, '') : '';
    return stateView || hashView || domView || 'dashboard';
  }

  function dashboardActive() {
    return activeView() === 'dashboard' || document.getElementById('view-dashboard')?.classList.contains('active');
  }

  function api() {
    return window.__ALTEA_DASHBOARD_CEO_MOTION_V1__;
  }

  function root() {
    return document.getElementById('view-dashboard');
  }

  function renderFresh() {
    try {
      if (api()?.version === EXPECTED_VERSION && typeof api().render === 'function') {
        api().render();
        return true;
      }
    } catch (error) {
      console.warn('[dashboard-money-kpi-guard] render skipped', error);
    }
    return false;
  }

  function loadFreshScript() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = false;
      script.dataset.alteaDashboardMoneyGuard = '1';
      script.onload = () => {
        renderFresh();
        resolve(script);
      };
      script.onerror = () => reject(new Error(`Failed to load ${SCRIPT_URL}`));
      (document.head || document.body || document.documentElement).appendChild(script);
    }).catch((error) => {
      console.warn('[dashboard-money-kpi-guard]', error);
      loadPromise = null;
      return null;
    });
    return loadPromise;
  }

  function needsFreshDashboard() {
    const current = api();
    if (!current || current.version !== EXPECTED_VERSION) return true;
    const node = root();
    if (node && node.dataset.dashboardCeoMotion && node.dataset.dashboardCeoMotion !== EXPECTED_VERSION) return true;
    return false;
  }

  function check() {
    if (!dashboardActive()) return;
    checks += 1;
    if (needsFreshDashboard()) {
      loadFreshScript();
      return;
    }
    if (checks <= 4) renderFresh();
  }

  window.__ALTEA_DASHBOARD_MONEY_KPI_GUARD__ = {
    version: EXPECTED_VERSION,
    check,
    loadFreshScript
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check, { once: true });
  } else {
    check();
  }

  window.addEventListener('hashchange', () => window.setTimeout(check, 60), { passive: true });
  window.addEventListener('focus', () => window.setTimeout(check, 60), { passive: true });
  window.addEventListener('altea:marketplacechange', () => window.setTimeout(check, 80), { passive: true });
  document.addEventListener('altea:marketplacechange', () => window.setTimeout(check, 80), { passive: true });
  window.setTimeout(check, 250);
  window.setTimeout(check, 1200);
  window.setTimeout(check, 3000);
})();
