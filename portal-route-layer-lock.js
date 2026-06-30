(function () {
  'use strict';

  if (window.__ALTEA_ROUTE_LAYER_LOCK_20260623__) return;
  window.__ALTEA_ROUTE_LAYER_LOCK_20260623__ = true;

  const VERSION = '20260630-route-layer-control-rescue-v1';
  let cascadeTimers = [];
  let running = false;
  const TRANSIENT_SELECTOR = '.promo-modal-backdrop,.modal,.toast,.portal-loader,.route-loader,.pf-v4-drawer-back,.plb-v2-drawer-back,.launch-v1-editor-backdrop,[data-pf-v4-drawer-back],[data-plb-v2-drawer-back],[data-launch-v1-editor-backdrop]';

  const ROUTES = {
    dashboard: {
      rootId: 'view-dashboard',
      selector: '.ceo-motion-v1[data-dashboard-ceo-motion-version],.ceo-motion-v1',
      legacySelector: '#portalDashboardExecutiveRoot,.dashboard-interactive-root,.dashboard-lux-loader,[data-dashboard-layout-root]',
      render() {
        if (window.__ALTEA_DASHBOARD_CEO_MOTION_V1__?.render) {
          window.__ALTEA_DASHBOARD_CEO_MOTION_V1__.render();
          return;
        }
        if (typeof window.renderDashboard === 'function' && window.renderDashboard.__dashboardCeoMotionV1) window.renderDashboard();
      }
    },
    prices: {
      rootId: 'view-prices',
      selector: '.prices-v1-shell[data-prices-design="v1"],.prices-v1-shell',
      legacySelector: '.price-workbench-root,.price-workbench-shell,.price-live-shell,.price-calendar-shell,.price-overlay-shell',
      render() {
        if (typeof window.renderPriceWorkbench === 'function') window.renderPriceWorkbench();
      }
    },
    'sku-plan-fact': {
      rootId: 'view-sku-plan-fact',
      selector: '.pf-v4[data-planfact-v4],.pf-v4',
      keepSelector: '.pf-v4[data-planfact-v4],.pf-v4,[data-plan-fact-design="v1"],.sku-plan-fact-v1,.pf-v1-filter-dock,.pf-v1-table-card',
      legacySelector: '.sku-plan-fact-shell,.pf-v1-kpis,.pf-v1-platform-board',
      render() {
        if (typeof window.renderSkuPlanFact === 'function') window.renderSkuPlanFact('view-sku-plan-fact');
      }
    },
    repricer: {
      rootId: 'view-repricer',
      selector: '[data-repricer-native-panel="1"],.repricer-native-simple .repricer-game-panel,.repricer-operator-panel[data-repricer-native-panel]',
      legacySelector: '.repricer-stack,.repricer-card,[data-gtd-v2="repricer"],.workspace-gtd-v1[data-route="repricer"]',
      render() {
        window.__ALTEA_REPRICER_ADVANCED_SESSION__ = false;
        try {
          const ui = appState().ui || (appState().ui = {});
          const repricer = ui.repricer || (ui.repricer = {});
          repricer.operatorLayer = 'simple';
        } catch {}
        if (typeof window.setRepricerOperatorLayer === 'function') {
          window.setRepricerOperatorLayer('simple');
          return;
        }
        if (typeof window.renderRepricer === 'function') window.renderRepricer();
      }
    },
    order: {
      rootId: 'view-order',
      selector: '[data-altea-order-procurement],.altea-order-procurement,.portal-ui-hotfix-procurement',
      legacySelector: '.order-calc-shell,.order-logistics-legacy,.logistics-workbench',
      render() {
        if (typeof window.renderOrderCalculator === 'function') window.renderOrderCalculator();
      }
    },
    'oos-control': {
      rootId: 'view-oos-control',
      selector: '[data-oos-focus],.oos-focus,.oos-localization-card,.oos-localization-clusters,.oos-cluster-pill,.oos-risk-queue,.oos-signal-tools,.oos-v4-filters,.oos-signal,.oos-formula',
      legacySelector: '.oos-control-legacy,.oos-simple-board,.oos-old-table,[data-gtd-v2="oos"]',
      render() {
        if (typeof window.renderOosControl === 'function') window.renderOosControl('view-oos-control');
      }
    },
    'sku-contour': {
      rootId: 'view-sku-contour',
      selector: '.sku-launch-v1-shell,.sku-v1-shell,.sku-contour-focus-board,.sku-data-focus-board,[data-sku-contour-guide],[data-sku-contour-decision-cards]',
      keepSelector: '.sku-launch-v1-shell,.sku-v1-shell,.sku-contour-focus-board,.sku-data-focus-board,[data-sku-contour-guide],[data-sku-contour-decision-cards]',
      legacySelector: '[data-workspaces-gtd-v1],.workspace-gtd-v1,.sku-contour-legacy,.sku-workspace-legacy',
      render() {
        if (typeof window.renderSkuContour === 'function') window.renderSkuContour('view-sku-contour');
      }
    },
    'iu-drr': {
      rootId: 'view-iu-drr',
      selector: '.iu-drr-v4-shell[data-iu-drr-design="v4"],.iu-drr-v4-shell,.iu-drr-v3-shell',
      legacySelector: '.iu-drr-legacy,.iu-drr-old-shell,[data-iu-drr-legacy]',
      render() {
        if (typeof window.renderIuDrr === 'function') window.renderIuDrr('view-iu-drr');
      }
    },
    'wb-rating': {
      rootId: 'view-wb-rating',
      selector: '.wb-rating-platforms,.wb-rating-report-table,.rating-planfact-card,.wb-rating-report-table-wrap',
      legacySelector: '.wb-rating-old,.rating-old-shell,[data-wb-rating-legacy]',
      render() {
        if (typeof window.renderWbCardRating === 'function') window.renderWbCardRating('view-wb-rating');
      }
    },
    'product-leaderboard': {
      rootId: 'view-product-leaderboard',
      selector: '.plb-motion-v2[data-leaderboard-motion-version],.plb-motion-v2,.plb-v2-stage',
      legacySelector: '.product-leaderboard-legacy,.leaderboard-old-shell,[data-product-leaderboard-legacy]',
      render() {
        if (typeof window.renderProductLeaderboard === 'function') window.renderProductLeaderboard();
      }
    },
    launches: {
      rootId: 'view-launches',
      selector: '.sku-launch-v1-shell,.launch-v1-shell,.launch-v1-workspace,.launch-v1-detail,.launch-v1-full-kanban,.launch-calendar-shell,.launch-task-board,[data-launch-stage-board],.launch-calendar-game',
      legacySelector: '.launches-legacy,.launch-old-shell,[data-launches-legacy]',
      render() {
        if (typeof window.renderLaunches === 'function') window.renderLaunches();
      }
    },
    'data-health': {
      rootId: 'view-data-health',
      selector: '.promo-calendar-shell',
      render() {
        if (typeof window.renderPortalDataHealth === 'function') window.renderPortalDataHealth('view-data-health');
      }
    },
    control: {
      rootId: 'view-control',
      selector: '[data-task-calendar-design-v1][data-task-kanban-v1],[data-task-calendar-design-v1]',
      legacySelector: '.control-simple-panel,[data-task-lazy-panel],.task-center-queues,.task-center-hotfix,[data-control-simple-root]',
      render() {
        if (typeof window.renderControlCenter === 'function') window.renderControlCenter();
      }
    },
    executive: {
      rootId: 'view-executive',
      selector: '[data-executive-v5]',
      legacySelector: '[data-executive-lite-panel],.executive-lite-surface,.executive-lite-workbench',
      render() {
        if (typeof window.renderExecutiveV5Route === 'function') {
          window.renderExecutiveV5Route();
          return;
        }
        if (typeof window.renderExecutive === 'function') window.renderExecutive();
      }
    }
  };

  function appState() {
    return window.__alteaAppState || window.state || {};
  }

  function normalizeView(view) {
    if (view === 'calendar') return 'data-health';
    if (view === 'tasks' || view === 'task') return 'control';
    if (view === 'launch-control') return 'launches';
    if (view === 'sku-workspace' || view === 'sku-workbench') return 'sku-contour';
    if (view === 'rating') return 'wb-rating';
    if (view === 'leaderboard') return 'product-leaderboard';
    return view;
  }

  function currentView() {
    const raw = String(appState().activeView || window.location.hash.replace('#', '') || 'dashboard');
    const hash = String(window.location.hash.replace('#', '') || '');
    return normalizeView(hash || raw);
  }

  function rootFor(route) {
    const item = ROUTES[route];
    return item ? document.getElementById(item.rootId) : null;
  }

  function cleanSiblings(root, item) {
    const selector = item.selector;
    const keepSelector = item.keepSelector || selector;
    const owned = root.querySelector(selector);
    if (!owned) return;
    Array.from(root.children).forEach((child) => {
      if (child === owned || child.contains(owned)) return;
      if (child.matches?.(keepSelector) || child.querySelector?.(keepSelector)) return;
      if (child.matches?.(TRANSIENT_SELECTOR)) return;
      child.remove();
    });
  }

  function isInsideOwned(node, selector) {
    try {
      return Boolean(node.closest(selector));
    } catch {
      return false;
    }
  }

  function removeLegacyNodes(root, item) {
    if (!item.legacySelector) return;
    root.querySelectorAll(item.legacySelector).forEach((node) => {
      if (node.matches?.(TRANSIENT_SELECTOR)) return;
      if (isInsideOwned(node, item.selector)) return;
      node.remove();
    });
  }

  function activeHasOnlyExpected(route, root, item) {
    const owned = root.querySelector(item.selector);
    if (!owned) return false;
    if (item.legacySelector) {
      const legacy = Array.from(root.querySelectorAll(item.legacySelector));
      if (legacy.some((node) => !isInsideOwned(node, item.selector))) return false;
    }
    if (route === 'repricer' && root.dataset.repricerLayer === 'advanced') return false;
    return true;
  }

  function activateRoute(route, root) {
    const hash = String(window.location.hash.replace('#', '') || '');
    if (hash && normalizeView(hash) !== route) return;
    if (typeof window.setView === 'function') {
      try {
        window.setView(route, { persist: true, syncHash: hash !== route });
        if (root.classList.contains('active')) return;
      } catch {}
    }
    try { appState().activeView = route; } catch {}
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view === root));
    document.querySelectorAll('.nav-btn').forEach((button) => button.classList.toggle('active', button.dataset.view === route));
    document.body.dataset.portalView = route;
    if (!hash || hash !== route) {
      try { history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${route}`); } catch {}
    }
  }

  function activateAliasRoute(route, root) {
    const hash = String(window.location.hash.replace('#', '') || '');
    if (!hash || normalizeView(hash) !== route || hash === route) return;
    if (typeof window.setView === 'function') {
      try {
        window.setView(route, { persist: true, syncHash: true });
        return;
      } catch {}
    }
    try { appState().activeView = route; } catch {}
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view === root));
    document.querySelectorAll('.nav-btn').forEach((button) => button.classList.toggle('active', button.dataset.view === route));
    document.body.dataset.portalView = route;
    try { history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${route}`); } catch {}
  }

  function enforceActiveRoute() {
    if (running) return;
    const route = currentView();
    const item = ROUTES[route];
    if (!item) return;
    const root = rootFor(route);
    if (!root) return;
    if (!root.classList.contains('active')) activateRoute(route, root);
    if (!root.classList.contains('active')) return;
    running = true;
    try {
      if (!activeHasOnlyExpected(route, root, item)) {
        item.render();
      }
      const owned = root.querySelector(item.selector);
      if (!owned) {
        delete root.dataset.routeLayerLock;
        return;
      }
      cleanSiblings(root, item);
      removeLegacyNodes(root, item);
      root.dataset.routeLayerLock = VERSION;
    } catch (error) {
      console.warn('[portal-route-layer-lock]', route, error);
    } finally {
      running = false;
    }
  }

  function cascade() {
    cascadeTimers.forEach((timer) => window.clearTimeout(timer));
    cascadeTimers = [0, 120, 700, 2200, 6000, 14000, 24000].map((delay) => {
      return window.setTimeout(enforceActiveRoute, delay);
    });
  }

  window.__ALTEA_ROUTE_LAYER_LOCK_READY__ = VERSION;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cascade, { once: true });
  } else {
    cascade();
  }

  ['hashchange', 'altea:viewchange', 'altea:app-ready', 'altea:data-ready', 'altea:portal-storage-updated', 'altea:marketplacechange'].forEach((eventName) => {
    window.addEventListener(eventName, cascade);
  });
})();
