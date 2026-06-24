(function () {
  'use strict';

  if (window.__ALTEA_LAYER_JANITOR_20260623__) return;
  window.__ALTEA_LAYER_JANITOR_20260623__ = true;
  const VERSION = '20260624-layer-janitor-oos-localization-v1';
  let cascadeTimers = [];
  let cleanupQueued = false;
  const TRANSIENT_SELECTOR = '.promo-modal-backdrop,.modal,.toast,.portal-loader,.route-loader,.pf-v4-drawer-back,.plb-v2-drawer-back,.launch-v1-editor-backdrop,[data-pf-v4-drawer-back],[data-plb-v2-drawer-back],[data-launch-v1-editor-backdrop]';

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
    '.control-simple-workspace',
    '.control-simple-create',
    '.control-simple-filters',
    '.control-simple-filterbar',
    '.control-simple-queue',
    '.control-simple-task',
    '.task-center-queues',
    '.task-center-hotfix',
    '[data-control-simple-root]',
    '.section-title.control-simple-title',
    '#portalDashboardExecutiveRoot',
    '.dashboard-interactive-root',
    '.dashboard-lux-loader',
    '[data-dashboard-layout-root]',
    '.price-workbench-root',
    '.price-workbench-shell',
    '.price-live-shell',
    '.price-calendar-shell',
    '.price-overlay-shell',
    '.sku-plan-fact-shell',
    '.sku-plan-fact-v1',
    '.pf-v1-kpis',
    '.pf-v1-platform-board',
    '.repricer-stack',
    '.repricer-card',
    '.order-calc-shell',
    '.order-logistics-legacy',
    '.logistics-workbench',
    '.oos-control-legacy',
    '.oos-simple-board',
    '.oos-old-table',
    '.sku-contour-legacy',
    '.sku-workspace-legacy',
    '.iu-drr-legacy',
    '.iu-drr-old-shell',
    '[data-iu-drr-legacy]',
    '.wb-rating-old',
    '.rating-old-shell',
    '[data-wb-rating-legacy]',
    '.product-leaderboard-legacy',
    '.leaderboard-old-shell',
    '[data-product-leaderboard-legacy]',
    '.launches-legacy',
    '.launch-old-shell',
    '[data-launches-legacy]',
    '[data-executive-lite-panel]',
    '.executive-lite-surface',
    '.executive-lite-workbench'
  ].join(',');

  const ACTIVE_ROUTE_RULES = {
    dashboard: {
      rootId: 'view-dashboard',
      owned: '.ceo-motion-v1[data-dashboard-ceo-motion-version],.ceo-motion-v1',
      legacy: '#portalDashboardExecutiveRoot,.dashboard-interactive-root,.dashboard-lux-loader,[data-dashboard-layout-root]'
    },
    prices: {
      rootId: 'view-prices',
      owned: '.prices-v1-shell[data-prices-design="v1"],.prices-v1-shell',
      legacy: '.price-workbench-root,.price-workbench-shell,.price-live-shell,.price-calendar-shell,.price-overlay-shell'
    },
    'sku-plan-fact': {
      rootId: 'view-sku-plan-fact',
      owned: '.pf-v4[data-planfact-v4],.pf-v4',
      legacy: '.sku-plan-fact-shell,.pf-v1-kpis,.pf-v1-platform-board'
    },
    repricer: {
      rootId: 'view-repricer',
      owned: '[data-repricer-native-panel="1"],.repricer-native-simple .repricer-game-panel,.repricer-operator-panel[data-repricer-native-panel]',
      legacy: '.repricer-stack,.repricer-card,[data-gtd-v2="repricer"],.workspace-gtd-v1[data-route="repricer"]'
    },
    order: {
      rootId: 'view-order',
      owned: '[data-altea-order-procurement],.altea-order-procurement,.portal-ui-hotfix-procurement',
      legacy: '.order-calc-shell,.order-logistics-legacy,.logistics-workbench'
    },
    'oos-control': {
      rootId: 'view-oos-control',
      owned: '[data-oos-focus],.oos-focus,.oos-localization-card,.oos-risk-queue,.oos-signal-tools,.oos-v4-filters,.oos-signal,.oos-formula',
      legacy: '.oos-control-legacy,.oos-simple-board,.oos-old-table,[data-gtd-v2="oos"]'
    },
    'sku-contour': {
      rootId: 'view-sku-contour',
      owned: '.sku-contour-focus-board,.sku-data-focus-board,[data-sku-contour-guide],[data-sku-contour-decision-cards]',
      legacy: '[data-workspaces-gtd-v1],.workspace-gtd-v1,.sku-contour-legacy,.sku-workspace-legacy'
    },
    'iu-drr': {
      rootId: 'view-iu-drr',
      owned: '.iu-drr-v4-shell[data-iu-drr-design="v4"],.iu-drr-v4-shell,.iu-drr-v3-shell',
      legacy: '.iu-drr-legacy,.iu-drr-old-shell,[data-iu-drr-legacy]'
    },
    'wb-rating': {
      rootId: 'view-wb-rating',
      owned: '.wb-rating-platforms,.wb-rating-report-table,.rating-planfact-card,.wb-rating-report-table-wrap',
      legacy: '.wb-rating-old,.rating-old-shell,[data-wb-rating-legacy]'
    },
    'product-leaderboard': {
      rootId: 'view-product-leaderboard',
      owned: '.plb-motion-v2[data-leaderboard-motion-version],.plb-motion-v2,.plb-v2-stage',
      legacy: '.product-leaderboard-legacy,.leaderboard-old-shell,[data-product-leaderboard-legacy]'
    },
    launches: {
      rootId: 'view-launches',
      owned: '.sku-launch-v1-shell,.launch-v1-shell,.launch-v1-workspace,.launch-v1-detail,.launch-v1-full-kanban,.launch-calendar-shell,.launch-task-board,[data-launch-stage-board],.launch-calendar-game',
      legacy: '.launches-legacy,.launch-old-shell,[data-launches-legacy]'
    },
    'data-health': {
      rootId: 'view-data-health',
      owned: '.promo-calendar-shell',
      legacy: '.data-health-shell,[data-health-change-digest],[data-health-rules-form],.data-health-digest,.data-health-hero,.data-health-queue,.data-health-tech'
    },
    control: {
      rootId: 'view-control',
      owned: '[data-task-calendar-design-v1][data-task-kanban-v1],[data-task-calendar-design-v1]',
      legacy: '.control-simple-panel,[data-task-lazy-panel],.control-simple-platform-board,.control-simple-workstream-lane,.control-simple-workspace,.control-simple-create,.control-simple-filters,.control-simple-filterbar,.control-simple-queue,.control-simple-task,.task-center-queues,.task-center-hotfix,[data-control-simple-root],.section-title.control-simple-title'
    },
    executive: {
      rootId: 'view-executive',
      owned: '[data-executive-v5]',
      legacy: '[data-executive-lite-panel],.executive-lite-surface,.executive-lite-workbench'
    }
  };

  function appState() {
    return window.__alteaAppState || window.state || {};
  }

  function normalizeView(view) {
    if (view === 'calendar') return 'data-health';
    if (view === 'tasks' || view === 'task') return 'control';
    if (view === 'sku-workspace' || view === 'sku-workbench') return 'sku-contour';
    if (view === 'rating') return 'wb-rating';
    if (view === 'leaderboard') return 'product-leaderboard';
    return view;
  }

  function currentView() {
    const hash = String(window.location.hash.replace('#', '') || '');
    const active = String(appState().activeView || 'dashboard');
    return normalizeView(hash || active);
  }

  function isInsideOwned(node, selector) {
    try {
      return Boolean(node.closest(selector));
    } catch {
      return false;
    }
  }

  function cleanupLegacyNodes() {
    document.querySelectorAll(LEGACY_SELECTORS).forEach((node) => {
      if (node.matches?.(TRANSIENT_SELECTOR)) return;
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
    const rule = ACTIVE_ROUTE_RULES[currentView()];
    if (!rule) return;
    const root = document.getElementById(rule.rootId);
    if (!root?.classList.contains('active')) return;
    const owned = root.querySelector(rule.owned);
    if (!owned) return;
    root.querySelectorAll(rule.legacy).forEach((node) => {
      if (node.matches?.(TRANSIENT_SELECTOR)) return;
      if (!isInsideOwned(node, rule.owned)) node.remove();
    });
    root.dataset.layerJanitorOwner = VERSION;
  }

  function cleanup() {
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

  function cascade() {
    cascadeTimers.forEach((timer) => window.clearTimeout(timer));
    cascadeTimers = [0, 160, 1000, 5000, 12000, 24000].map((delay) => {
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
