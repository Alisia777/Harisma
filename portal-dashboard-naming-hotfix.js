(function () {
  if (window.__ALTEA_DASHBOARD_SHELL_CLEANUP_20260418J__) return;
  window.__ALTEA_DASHBOARD_SHELL_CLEANUP_20260418J__ = true;

  function syncChrome() {
    document.title = 'Дом бренда Алтея · v8.7.1 Imperial';
    const brandTitle = document.querySelector('.sidebar .brand-title');
    if (brandTitle) brandTitle.textContent = 'Дом бренда Алтея';
    const brandSub = document.querySelector('.sidebar .brand-sub');
    if (brandSub) brandSub.textContent = 'Рабочий контур бренда и решений.';
    const heading = document.querySelector('.topbar h1');
    if (heading) heading.textContent = 'Дом бренда Алтея';
    const compactFooter = document.querySelector('.sidebar-foot.compact-sidebar-foot');
    if (compactFooter) compactFooter.style.display = 'none';
  }

  function trimDashboard() {
    const dashboard = document.getElementById('view-dashboard');
    if (!dashboard) return;
    const executiveRoot = dashboard.querySelector('[data-portal-dashboard-executive-root]');
    if (!executiveRoot) return;
    Array.from(dashboard.children).forEach((child) => {
      if (child === executiveRoot) return;
      child.style.display = 'none';
    });
  }

  function apply() {
    syncChrome();
    trimDashboard();
  }

  apply();
  [120, 900, 2400, 6000, 12000, 20000].forEach((delay) => window.setTimeout(apply, delay));

  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => apply());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
