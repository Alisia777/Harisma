(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_LOADER_20260419C__) return;
  window.__ALTEA_PRICE_WORKBENCH_LOADER_20260419C__ = true;

  const SCRIPT_ID = 'portalPriceWorkbenchHotfixRuntime';
  const PARTS = [
    'portal-price-workbench.exec.part01.js?v=20260419c',
    'portal-price-workbench.exec.part02.js?v=20260419c',
    'portal-price-workbench.exec.part03.js?v=20260419c',
    'portal-price-workbench.exec.part04.js?v=20260419c',
    'portal-price-workbench.exec.part05.js?v=20260419c',
    'portal-price-workbench.exec.part06.js?v=20260419c',
    'portal-price-workbench.exec.part07.js?v=20260419c',
    'portal-price-workbench.exec.part08.js?v=20260419c'
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

  function injectBundle() {
    if (window.__ALTEA_PRICE_WORKBENCH_HOTFIX_20260419B__) {
      kick();
      return true;
    }
    if (document.getElementById(SCRIPT_ID)) {
      kick();
      return true;
    }
    const encoded = window.__ALTEA_PRICE_WORKBENCH_B64_20260419C__ || '';
    if (!encoded) return false;
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const source = new TextDecoder('utf-8').decode(bytes);
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.textContent = source;
    (document.body || document.documentElement).appendChild(script);
    kick();
    return true;
  }

  async function loadParts() {
    for (const src of PARTS) {
      if (document.querySelector('script[data-price-workbench-part="' + src + '"]')) continue;
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.dataset.priceWorkbenchPart = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load ' + src));
        document.body.appendChild(script);
      });
    }
    injectBundle();
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
    if (window.__ALTEA_PRICE_WORKBENCH_B64_20260419C__) {
      injectBundle();
      return;
    }
    if (!loadingPromise) {
      loadingPromise = loadParts()
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
