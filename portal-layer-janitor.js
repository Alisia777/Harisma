(function () {
  'use strict';

  if (window.__ALTEA_LAYER_JANITOR_20260623__) return;
  window.__ALTEA_LAYER_JANITOR_20260623__ = true;

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

  const LEGACY_SELECTORS = [
    '[data-workspaces-gtd-v1]',
    '.workspace-gtd-v1',
    '[data-gtd-v2]',
    '[data-portal-data-guard-panel]',
    '.control-simple-panel',
    '[data-task-lazy-panel]',
    '.control-simple-platform-board',
    '.control-simple-workstream-lane',
    '.section-title.control-simple-title'
  ].join(',');

  function cleanupLegacyNodes() {
    document.querySelectorAll(LEGACY_SELECTORS).forEach((node) => {
      if (!node.closest('.view.active')) node.remove();
    });
  }

  function cleanupInactiveViews() {
    HEAVY_VIEW_IDS.forEach((id) => {
      const root = document.getElementById(id);
      if (!root || root.classList.contains('active')) return;
      if (!root.children.length) return;
      root.innerHTML = '';
      root.dataset.layerJanitorCleared = 'true';
    });
  }

  function cleanup() {
    cleanupLegacyNodes();
    cleanupInactiveViews();
  }

  function cascade() {
    [0, 80, 240, 600, 1400, 3000, 6200].forEach((delay) => {
      window.setTimeout(cleanup, delay);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cascade, { once: true });
  } else {
    cascade();
  }

  ['hashchange', 'altea:viewchange', 'altea:app-ready', 'altea:data-ready', 'altea:portal-storage-updated', 'altea:marketplacechange'].forEach((eventName) => {
    window.addEventListener(eventName, cascade);
  });
})();
