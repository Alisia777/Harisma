(function () {
  'use strict';

  /*
   * Retired on 2026-06-23.
   *
   * The previous version mounted a common "general-to-detail" panel above many
   * routes and kept remounting it with delayed timers. That made the portal look
   * like two screens were alive at once and caused visible flicker on heavy tabs.
   *
   * Keep this file as a tiny cleanup shim because the HTML entries still load it
   * after auth. Route-specific owners now render their own screens.
   */
  if (window.__ALTEA_WORKSPACES_GTD_V1_RETIRED__) return;
  window.__ALTEA_WORKSPACES_GTD_V1_RETIRED__ = true;

  const HEAVY_VIEW_IDS = [
    'view-dashboard',
    'view-executive',
    'view-control',
    'view-data-health',
    'view-sku-plan-fact',
    'view-prices',
    'view-oos-control',
    'view-sku-contour',
    'view-launches',
    'view-iu-drr',
    'view-product-leaderboard',
    'view-repricer',
    'view-order',
    'view-wb-rating'
  ];

  function cleanup() {
    document.querySelectorAll('[data-workspaces-gtd-v1], .workspace-gtd-v1').forEach((node) => {
      node.remove();
    });
    document.querySelectorAll('[data-workspaces-gtd-focused]').forEach((node) => {
      node.removeAttribute('data-workspaces-gtd-focused');
    });
    cleanupInactiveHeavyViews();
  }

  function cleanupInactiveHeavyViews() {
    HEAVY_VIEW_IDS.forEach((id) => {
      const root = document.getElementById(id);
      if (!root || root.classList.contains('active')) return;
      if (!root.childElementCount) return;
      root.innerHTML = '';
      root.dataset.layerJanitorCleared = 'true';
    });
  }

  function runSoon(delay) {
    window.setTimeout(cleanup, delay);
  }

  function runCleanupCascade() {
    [0, 120, 480, 1200, 2600, 5200].forEach(runSoon);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runCleanupCascade, { once: true });
  } else {
    runCleanupCascade();
  }

  ['hashchange', 'altea:viewchange', 'altea:app-ready', 'altea:data-ready', 'altea:portal-storage-updated'].forEach((eventName) => {
    window.addEventListener(eventName, runCleanupCascade);
  });
})();
