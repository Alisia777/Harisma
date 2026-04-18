(function () {
  if (window.__ALTEA_DASHBOARD_INTERACTIVE_BOOTSTRAP_20260418X__) return;
  window.__ALTEA_DASHBOARD_INTERACTIVE_BOOTSTRAP_20260418X__ = true;

  const PARTS = ["portal-dashboard-interactive.b64chunk1.js?v=20260418x","portal-dashboard-interactive.b64chunk2.js?v=20260418x","portal-dashboard-interactive.b64chunk3.js?v=20260418x","portal-dashboard-interactive.b64chunk4.js?v=20260418x","portal-dashboard-interactive.b64chunk5.js?v=20260418x"];
  let loadingPromise = null;

  const injectBundle = () => {
    if (window.__ALTEA_DASHBOARD_INTERACTIVE_20260418A__) return;
    if (document.getElementById('portalDashboardInteractiveBootstrap')) return;
    const encoded = window.__ALTEA_EXEC_B64_20260418X__ || '';
    if (!encoded) return false;
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const source = new TextDecoder('utf-8').decode(bytes);
    const script = document.createElement('script');
    script.id = 'portalDashboardInteractiveBootstrap';
    script.textContent = source;
    (document.body || document.documentElement).appendChild(script);
    return true;
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
    if (window.__ALTEA_DASHBOARD_INTERACTIVE_20260418A__ || document.getElementById('portalDashboardInteractiveBootstrap')) return;
    if (!document.body) {
      window.setTimeout(start, 180);
      return;
    }
    if (window.__ALTEA_EXEC_B64_20260418X__) {
      injectBundle();
      return;
    }
    if (!loadingPromise) {
      loadingPromise = loadParts()
        .catch((error) => console.warn('[portal-dashboard-interactive-loader]', error))
        .finally(() => {
          loadingPromise = null;
          if (!window.__ALTEA_DASHBOARD_INTERACTIVE_20260418A__) {
            window.setTimeout(start, 1000);
          }
        });
    }
  };

  document.addEventListener('DOMContentLoaded', start, { once: true });
  window.addEventListener('load', start, { once: true });
  window.setTimeout(start, 0);
  window.setTimeout(start, 1200);
  window.setTimeout(start, 4200);
})();
