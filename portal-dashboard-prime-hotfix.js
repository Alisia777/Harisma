(function () {
  if (window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260421A__) return;
  window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260421A__ = true;

  function primeDashboard() {
    const onDashboard = (typeof state === 'object' && state && state.activeView === 'dashboard')
      || document.getElementById('view-dashboard')?.classList.contains('active');
    if (!onDashboard) return;
    if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
  }

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.setTimeout(primeDashboard, 60));
  } else {
    window.setTimeout(primeDashboard, 120);
  }
})();
