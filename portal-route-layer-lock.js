(function () {
  'use strict';

  if (window.__ALTEA_ROUTE_LAYER_LOCK_20260623__) return;
  window.__ALTEA_ROUTE_LAYER_LOCK_20260623__ = true;

  const VERSION = '20260623-route-layer-lock';
  let cascadeTimers = [];
  let running = false;

  const ROUTES = {
    prices: {
      rootId: 'view-prices',
      selector: '.prices-v1-shell[data-prices-design="v1"],.prices-v1-shell',
      render() {
        if (typeof window.renderPriceWorkbench === 'function') window.renderPriceWorkbench();
      }
    },
    'sku-plan-fact': {
      rootId: 'view-sku-plan-fact',
      selector: '.sku-plan-fact-v1[data-plan-fact-design="v1"],.sku-plan-fact-v1',
      render() {
        if (typeof window.renderSkuPlanFact === 'function') window.renderSkuPlanFact('view-sku-plan-fact');
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
      render() {
        if (typeof window.renderControlCenter === 'function') window.renderControlCenter();
      }
    },
    executive: {
      rootId: 'view-executive',
      selector: '[data-executive-v5]',
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

  function cleanSiblings(root, selector) {
    const owned = root.querySelector(selector);
    if (!owned) return;
    Array.from(root.children).forEach((child) => {
      if (child === owned || child.contains(owned)) return;
      if (child.matches?.('.promo-modal-backdrop,.modal,.toast,.portal-loader,.route-loader')) return;
      child.remove();
    });
  }

  function activeHasOnlyExpected(route, root, selector) {
    const owned = root.querySelector(selector);
    if (!owned) return false;
    if (route === 'executive' && root.querySelector('[data-executive-lite-panel],.executive-lite-surface,.executive-lite-workbench')) return false;
    if (route === 'control' && root.querySelector('.control-simple-panel,[data-task-lazy-panel],.task-center-queues')) return false;
    if (route === 'data-health' && root.querySelector('.data-health-shell,[data-health-change-digest],.data-health-hero')) return false;
    if (route === 'sku-plan-fact' && root.querySelector('.sku-plan-fact-shell:not(.sku-plan-fact-v1),.card > .head')) return false;
    return true;
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
    try { history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${route}`); } catch {}
  }

  function enforceActiveRoute() {
    if (running) return;
    const route = currentView();
    const item = ROUTES[route];
    if (!item) return;
    const root = rootFor(route);
    if (!root) return;
    if (!root.classList.contains('active')) activateAliasRoute(route, root);
    if (!root.classList.contains('active')) return;
    running = true;
    try {
      if (!activeHasOnlyExpected(route, root, item.selector)) {
        item.render();
      }
      cleanSiblings(root, item.selector);
      root.dataset.routeLayerLock = VERSION;
    } catch (error) {
      console.warn('[portal-route-layer-lock]', route, error);
    } finally {
      running = false;
    }
  }

  function cascade() {
    cascadeTimers.forEach((timer) => window.clearTimeout(timer));
    cascadeTimers = [0, 80, 260, 700, 1600, 3600, 7600, 14000, 24000].map((delay) => {
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
