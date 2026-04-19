(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_LOADER_20260419D__) return;
  window.__ALTEA_PRICE_WORKBENCH_LOADER_20260419D__ = true;

  const SCRIPT_ID = 'portalPriceWorkbenchHotfixRuntime';
  const PARTS = [
    'portal-price-workbench.exec.part01.txt?v=20260419d',
    'portal-price-workbench.exec.part02.txt?v=20260419d',
    'portal-price-workbench.exec.part03.txt?v=20260419d',
    'portal-price-workbench.exec.part04.txt?v=20260419d',
    'portal-price-workbench.exec.part05.txt?v=20260419d',
    'portal-price-workbench.exec.part06.txt?v=20260419d',
    'portal-price-workbench.exec.part07.txt?v=20260419d',
    'portal-price-workbench.exec.part08.txt?v=20260419d',
    'portal-price-workbench.exec.part09.txt?v=20260419d',
    'portal-price-workbench.exec.part10.txt?v=20260419d',
    'portal-price-workbench.exec.part11.txt?v=20260419d',
    'portal-price-workbench.exec.part12.txt?v=20260419d'
  ];
  let loadingPromise = null;

  function kick() {
    if (typeof window.renderPriceWorkbench === 'function') {
      try {
        window.renderPriceWorkbench();
      } catch (error) {
        console.warn('[portal-price-workbench-loader] render', error);
      }
    }
  }

  async function injectBundle() {
    if (window.__ALTEA_PRICE_WORKBENCH_HOTFIX_20260419B__) {
      kick();
      return true;
    }
    if (document.getElementById(SCRIPT_ID)) {
      kick();
      return true;
    }
    const source = (await Promise.all(
      PARTS.map(async (src) => {
        const response = await fetch(src, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to load ' + src);
        return response.text();
      })
    )).join('');
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.textContent = source;
    (document.body || document.documentElement).appendChild(script);
    kick();
    return true;
  }

  function start() {
    if (window.__ALTEA_PRICE_WORKBENCH_HOTFIX_20260419B__ || document.getElementById(SCRIPT_ID)) {
      kick();
      return;
    }
    if (!document.body) {
      window.setTimeout(start, 180);
      return;
    }
    if (!loadingPromise) {
      loadingPromise = injectBundle()
        .catch((error) => console.warn('[portal-price-workbench-loader]', error))
        .finally(() => {
          loadingPromise = null;
          if (!window.__ALTEA_PRICE_WORKBENCH_HOTFIX_20260419B__) {
            window.setTimeout(start, 1000);
          }
        });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  window.addEventListener('load', start, { once: true });
  window.setTimeout(start, 0);
  window.setTimeout(start, 1200);
  window.setTimeout(start, 4200);
})();
