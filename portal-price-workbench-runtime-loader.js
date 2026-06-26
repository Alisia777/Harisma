(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260621_PRICESV1__) return;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260621_PRICESV1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260607_PRICEBADGES2__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260607_PRICEBADGES1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260607_PRICEIMPACT1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260518_MINMAXQUEUE1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260518_STATUS_EDIT1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260518_ZEROFIX1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260518_PRICEFIELDS1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260516_PLATFORMCOLORS2__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260514_MARKETPLACES1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260508_PRICECACHE1__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260505A__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260503C__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260503B__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260503A__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260502A__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260429B__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260429A__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260428C__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260428B__ = true;
  window.__ALTEA_PRICE_WORKBENCH_RUNTIME_LOADER_20260428A__ = true;

  const SCRIPT_ID = 'portalPriceWorkbenchSimpleLive20260621pricesv1';
  const SRC = 'portal-price-workbench-simple-live.js?v=20260626pricesmodalscroll1';
  const STYLE_ID = 'portalPriceWorkbenchRuntimeLoaderStyle';

  function ensureLoadingShell() {
    const root = document.getElementById('view-prices');
    if (!root || !isPricesViewActive()) return;
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = [
        '#view-prices{min-height:520px;padding:24px 28px 36px;}',
        '#view-prices .pw-loader-card{display:grid;gap:10px;padding:18px 20px;border-radius:18px;border:1px solid rgba(214,175,85,.16);background:rgba(21,17,12,.80);box-shadow:0 18px 50px rgba(0,0,0,.20);}',
        '#view-prices .pw-loader-card strong{color:#f4ead6;font-size:24px;line-height:1.15;}',
        '#view-prices .pw-loader-card span{color:rgba(245,232,207,.72);font-size:13px;line-height:1.45;}'
      ].join('');
      document.head.appendChild(style);
    }
    if (root.children.length || (root.textContent || '').trim()) return;
    root.innerHTML = [
      '<div class="pw-loader-card">',
      '<strong>Цены</strong>',
      '<span>Загружаем рабочий контур цен, MIN/MAX и связку с репрайсером...</span>',
      '</div>'
    ].join('');
  }

  function isPricesViewActive() {
    if (window.state && window.state.activeView) return window.state.activeView === 'prices';
    return Boolean(document.querySelector('#view-prices.view.active'));
  }

  function rerender() {
    if (typeof window.renderPriceWorkbench !== 'function') return;
    try {
      window.renderPriceWorkbench();
    } catch (error) {
      console.warn('[price-runtime-loader] rerender', error);
    }
  }

  function ensureLoaded() {
    ensureLoadingShell();
    if (window.__ALTEA_PRICE_SIMPLE_RENDERER_20260621_PRICESV1__) {
      const root = document.getElementById('view-prices');
      if (isPricesViewActive() && root && !root.querySelector('.prices-v1-shell')) rerender();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.defer = true;
    script.src = SRC;
    script.onload = () => {
      if (isPricesViewActive()) rerender();
    };
    script.onerror = (error) => console.warn('[price-runtime-loader] load', error);
    (document.head || document.body || document.documentElement).appendChild(script);
  }

  function maybeLoadForView(view) {
    if (view && view !== 'prices') return;
    if (!view && !isPricesViewActive()) return;
    ensureLoaded();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => maybeLoadForView(), { once: true });
  } else {
    maybeLoadForView();
  }

  window.addEventListener('load', () => maybeLoadForView(), { once: true });
  window.addEventListener('altea:viewchange', (event) => {
    maybeLoadForView(event?.detail?.view);
  });
})();
