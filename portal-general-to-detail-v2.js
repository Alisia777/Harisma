(function () {
  'use strict';

  const VERSION = '20260622-general-to-detail-v2-retired';
  const LEGACY_SELECTOR = '#view-repricer [data-gtd-v2], #view-oos-control [data-gtd-v2]';
  let cleanupQueued = false;

  function cleanupLegacyGtdV2() {
    cleanupQueued = false;
    document.querySelectorAll(LEGACY_SELECTOR).forEach((node) => node.remove());
  }

  function queueCleanup() {
    if (cleanupQueued) return;
    cleanupQueued = true;
    window.setTimeout(cleanupLegacyGtdV2, 0);
  }

  window.__ALTEA_GENERAL_TO_DETAIL_V2_RETIRED__ = VERSION;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', queueCleanup, { once: true });
  } else {
    queueCleanup();
  }

  ['hashchange', 'altea:viewchange', 'altea:data-ready', 'altea:app-ready'].forEach((eventName) => {
    window.addEventListener(eventName, queueCleanup);
  });
})();
