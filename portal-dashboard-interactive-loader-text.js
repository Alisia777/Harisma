(function () {
  if (window.__ALTEA_DASHBOARD_INTERACTIVE_BOOTSTRAP_20260418W__) return;
  window.__ALTEA_DASHBOARD_INTERACTIVE_BOOTSTRAP_20260418W__ = true;

  const VERSION = '20260418w';
  const PARTS = ["portal-dashboard-interactive.chunk1.js?v=20260418w","portal-dashboard-interactive.chunk2.js?v=20260418w","portal-dashboard-interactive.chunk3.js?v=20260418w","portal-dashboard-interactive.chunk4.js?v=20260418w"];

  const injectBundle = () => {
    if (window.__ALTEA_DASHBOARD_INTERACTIVE_20260418A__) return;
    if (document.getElementById('portalDashboardInteractiveBootstrap')) return;
    const source = window.__ALTEA_EXEC_BUNDLE_20260418W__ || '';
    if (!source) return;
    const script = document.createElement('script');
    script.id = 'portalDashboardInteractiveBootstrap';
    script.textContent = source;
    document.body.appendChild(script);
  };

  const loadParts = async () => {
    for (const src of PARTS) {
      if (document.querySelector('script[data-portal-exec-part="' + src + '"]')) continue;
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.dataset.portalExecPart = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load ' + src));
        document.body.appendChild(script);
      });
    }
    injectBundle();
  };

  const start = () => {
    window.setTimeout(() => { loadParts().catch((error) => console.warn('[portal-dashboard-interactive-loader]', error)); }, 4200);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
