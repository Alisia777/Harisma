(function () {
  if (window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260421C__) return;
  window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260421C__ = true;

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
  }

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.setTimeout(primeDashboard, 60);
      window.setTimeout(primeDashboard, 320);
      window.setTimeout(primeDashboard, 900);
    });
  } else {
    window.setTimeout(primeDashboard, 120);
    window.setTimeout(primeDashboard, 360);
    window.setTimeout(primeDashboard, 960);
  }
})();
