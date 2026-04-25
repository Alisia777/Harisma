(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260425D__) return;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260425D__ = true;

  const VERSION = '20260425d';
  const SCRIPT_ID = 'portalPriceWorkbenchRuntime20260425d';
  const PART_SOURCES = [
    'portal-price-workbench.runtime.gz.part01.txt?v=20260425d',
    'portal-price-workbench.runtime.gz.part02.txt?v=20260425d',
    'portal-price-workbench.runtime.gz.part03.txt?v=20260425d',
    'portal-price-workbench.runtime.gz.part04.txt?v=20260425d'
  ];
  const LOCAL_FALLBACK_SRC = 'portal-price-workbench-simple-live.js?v=20260425g';

  let bootPromise = null;
  let fallbackPromise = null;

  function rerender() {
    if (typeof window.renderPriceWorkbench !== 'function') return false;
    try {
      window.renderPriceWorkbench();
    } catch (error) {
      console.warn('[price-runtime-loader] rerender', error);
    }
    return true;
  }

  function decodeBase64ToBytes(base64) {
    const normalized = String(base64 || '').replace(/\s+/g, '');
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function inflateBase64Gzip(base64) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('DecompressionStream is not available in this browser');
    }
    const bytes = decodeBase64ToBytes(base64);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }

  async function fetchBundleParts() {
    const parts = await Promise.all(PART_SOURCES.map(async (src) => {
      const response = await fetch(src, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load ' + src);
      return await response.text();
    }));
    return parts.join('');
  }

  function injectRuntime(code) {
    if (window.__ALTEA_PRICE_WORKBENCH_HOTFIX_20260419D__) return true;
    if (document.getElementById(SCRIPT_ID)) return true;
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.textContent = code + '\n//# sourceURL=portal-price-workbench-runtime.' + VERSION + '.js';
    (document.head || document.body || document.documentElement).appendChild(script);
    return true;
  }

  function loadLocalFallback() {
    if (fallbackPromise) return fallbackPromise;
    if (window.__ALTEA_PRICE_SIMPLE_RENDERER_20260425G__) {
      fallbackPromise = Promise.resolve(true);
      return fallbackPromise;
    }
    fallbackPromise = new Promise((resolve) => {
      const existing = document.querySelector('script[data-price-local-fallback="true"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(true), { once: true });
        existing.addEventListener('error', () => resolve(false), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.defer = true;
      script.src = LOCAL_FALLBACK_SRC;
      script.dataset.priceLocalFallback = 'true';
      script.onload = () => {
        rerender();
        resolve(true);
      };
      script.onerror = () => resolve(false);
      (document.head || document.body || document.documentElement).appendChild(script);
    });
    return fallbackPromise;
  }

  async function boot() {
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      if (window.__ALTEA_PRICE_WORKBENCH_HOTFIX_20260419D__) return rerender();
      const sourceB64 = await fetchBundleParts();
      const sourceText = await inflateBase64Gzip(sourceB64);
      injectRuntime(sourceText);
      return rerender();
    })().catch(async (error) => {
      console.warn('[price-runtime-loader]', error);
      bootPromise = null;
      return loadLocalFallback();
    });
    return bootPromise;
  }

  function start() {
    boot().catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(start, 120), { once: true });
  } else {
    window.setTimeout(start, 120);
  }
  window.addEventListener('load', () => window.setTimeout(start, 120), { once: true });
  window.setTimeout(start, 1200);
})();
