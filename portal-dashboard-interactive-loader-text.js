(function () {
  if (window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260418Z1__) return;
  window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260418Z1__ = true;

  const SRC = 'portal-dashboard-interactive-hotfix.js?v=20260418zb';

  const triggerBoot = (force) => {
    if (typeof window.__ALTEA_PRICE_INTEL_BOOT__ === 'function') {
      window.__ALTEA_PRICE_INTEL_BOOT__(!!force);
    }
  };

  const scheduleBootRetries = () => {
    [300, 1600, 4200].forEach((delay) => {
      window.setTimeout(() => triggerBoot(false), delay);
    });
  };

  const inject = () => {
    if (window.__ALTEA_PRICE_INTEL_20260418Z__) {
      triggerBoot(false);
      scheduleBootRetries();
      return;
    }
    if (document.querySelector('script[data-portal-price-intel-loader="' + SRC + '"]')) {
      triggerBoot(false);
      scheduleBootRetries();
      return;
    }
    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.dataset.portalPriceIntelLoader = SRC;
    script.onload = () => {
      triggerBoot(false);
      scheduleBootRetries();
    };
    script.onerror = () => console.warn('[portal-dashboard-interactive-loader]', 'Failed to load ' + SRC);
    document.body.appendChild(script);
  };

  const start = () => {
    window.setTimeout(inject, 1800);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
