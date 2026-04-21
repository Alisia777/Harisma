(function () {
  if (window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260421B__) return;
  window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260421B__ = true;

  function primeDashboard() {
    const onDashboard = (typeof state === 'object' && state && state.activeView === 'dashboard')
      || document.getElementById('view-dashboard')?.classList.contains('active');
    if (!onDashboard) return;
    if (typeof window.rerenderCurrentView === 'function') {
      window.rerenderCurrentView();
      return;
    }
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
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
