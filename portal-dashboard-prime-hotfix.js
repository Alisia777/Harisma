(function () {
  if (window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260421D__) return;
  window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260421D__ = true;

  function interactiveBundleReady() {
    return !!window.renderDashboard?.__dashboardInteractiveWrapped
      || !!window.rerenderCurrentView?.__dashboardInteractiveWrapped
      || !!document.getElementById('portalDashboardExecutiveRoot');
  }

  function rearmInteractiveBundle() {
    if (window.__ALTEA_DASHBOARD_INTERACTIVE_REARMED_20260421D__) return;
    window.__ALTEA_DASHBOARD_INTERACTIVE_REARMED_20260421D__ = true;
    try {
      delete window.__ALTEA_DASHBOARD_INTERACTIVE_20260420M__;
    } catch {
      window.__ALTEA_DASHBOARD_INTERACTIVE_20260420M__ = false;
    }
    const script = document.createElement('script');
    script.src = 'portal-dashboard-interactive-hotfix.js?v=20260420n&rearm=20260421d';
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

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.setTimeout(primeDashboard, 60);
      window.setTimeout(primeDashboard, 320);
      window.setTimeout(primeDashboard, 900);
      window.setTimeout(primeDashboard, 2200);
      window.setTimeout(primeDashboard, 5200);
    });
  } else {
    window.setTimeout(primeDashboard, 120);
    window.setTimeout(primeDashboard, 360);
    window.setTimeout(primeDashboard, 960);
    window.setTimeout(primeDashboard, 2400);
    window.setTimeout(primeDashboard, 5400);
  }
})();
