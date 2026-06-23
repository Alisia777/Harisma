(function () {
  'use strict';

  if (window.__ALTEA_LAYER_JANITOR_20260623__) return;
  window.__ALTEA_LAYER_JANITOR_20260623__ = true;
  let cascadeTimers = [];
  let cleanupQueued = false;
  let viewObserver = null;

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

  const ACTIVE_CONTROL_LEGACY = '.control-simple-panel,[data-task-lazy-panel],.control-simple-platform-board,.control-simple-workstream-lane,.section-title.control-simple-title';
  const ACTIVE_CALENDAR_LEGACY = '.data-health-shell,[data-health-change-digest],[data-health-rules-form],.data-health-digest,.data-health-hero,.data-health-queue,.data-health-tech';

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

  function cleanupActiveOwnedViews() {
    const controlRoot = document.getElementById('view-control');
    if (controlRoot?.classList.contains('active')) {
      const hasKanban = Boolean(controlRoot.querySelector('[data-task-kanban-v1]'));
      if (hasKanban) {
        controlRoot.querySelectorAll(ACTIVE_CONTROL_LEGACY).forEach((node) => {
          if (!node.closest('[data-task-kanban-v1]')) node.remove();
        });
      } else if (typeof window.renderControlCenter === 'function') {
        window.setTimeout(() => window.renderControlCenter(), 0);
      }
    }

    const calendarRoot = document.getElementById('view-data-health');
    if (calendarRoot?.classList.contains('active')) {
      const hasCalendar = Boolean(calendarRoot.querySelector('.promo-calendar-shell'));
      if (hasCalendar) {
        calendarRoot.querySelectorAll(ACTIVE_CALENDAR_LEGACY).forEach((node) => {
          if (!node.closest('.promo-calendar-shell')) node.remove();
        });
      } else if (typeof window.renderPortalDataHealth === 'function') {
        window.setTimeout(() => window.renderPortalDataHealth('view-data-health'), 0);
      }
    }
  }

  function cleanup() {
    observeViewRoots();
    cleanupLegacyNodes();
    cleanupInactiveViews();
    cleanupActiveOwnedViews();
  }

  function queueCleanup(delay = 60) {
    if (cleanupQueued) return;
    cleanupQueued = true;
    window.setTimeout(() => {
      cleanupQueued = false;
      cleanup();
    }, delay);
  }

  function observeViewRoots() {
    if (typeof MutationObserver !== 'function') return;
    if (!viewObserver) {
      viewObserver = new MutationObserver(() => queueCleanup(70));
    }
    HEAVY_VIEW_IDS.forEach((id) => {
      const root = document.getElementById(id);
      if (!root || root.dataset.layerJanitorObserved === 'true') return;
      root.dataset.layerJanitorObserved = 'true';
      viewObserver.observe(root, { childList: true });
    });
  }

  function cascade() {
    cascadeTimers.forEach((timer) => window.clearTimeout(timer));
    cascadeTimers = [0, 120, 420, 1200, 2800, 6200].map((delay) => {
      return window.setTimeout(cleanup, delay);
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
