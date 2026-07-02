(function () {
  'use strict';

  if (window.__ALTEA_ROUTE_LAYER_LOCK_20260702_TASK_DIRECT__) return;
  window.__ALTEA_ROUTE_LAYER_LOCK_20260702_TASK_DIRECT__ = true;

  const VERSION = '20260702-route-layer-task-direct-v2';
  let cascadeTimers = [];
  let running = false;

  const ROUTE_ROOTS = {
    dashboard: 'view-dashboard',
    'data-health': 'view-data-health',
    control: 'view-control',
    documents: 'view-documents',
    executive: 'view-executive',
    'sku-plan-fact': 'view-sku-plan-fact',
    repricer: 'view-repricer',
    prices: 'view-prices',
    order: 'view-order',
    'oos-control': 'view-oos-control',
    'sku-contour': 'view-sku-contour',
    skus: 'view-skus',
    launches: 'view-launches',
    'iu-drr': 'view-iu-drr',
    'wb-rating': 'view-wb-rating',
    'product-leaderboard': 'view-product-leaderboard',
    meetings: 'view-meetings'
  };

  function appState() {
    return window.__alteaAppState || window.__ALTEA_STATE__ || window.state || {};
  }

  function normalizeView(view) {
    const key = String(view || '').replace(/^#/, '').trim();
    if (key === 'calendar') return 'data-health';
    if (key === 'tasks' || key === 'task') return 'control';
    if (key === 'launch-control') return 'launches';
    if (key === 'sku-workspace' || key === 'sku-workbench') return 'sku-contour';
    if (key === 'rating') return 'wb-rating';
    if (key === 'leaderboard') return 'product-leaderboard';
    return key || 'dashboard';
  }

  function currentView() {
    const hash = normalizeView(window.location.hash || '');
    if (hash && hash !== 'dashboard') return hash;
    const active = document.querySelector('.view.active[id^="view-"]');
    if (active?.id) return normalizeView(active.id.replace(/^view-/, ''));
    return normalizeView(appState().activeView || hash || 'dashboard');
  }

  function rootFor(view) {
    return document.getElementById(ROUTE_ROOTS[view] || `view-${view}`);
  }

  function activateRoute(view, root) {
    if (!root) return;
    try { appState().activeView = view; } catch (_) {}
    document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section === root));
    document.querySelectorAll('.nav-btn').forEach((button) => button.classList.toggle('active', normalizeView(button.dataset?.view || '') === view));
    document.body.dataset.portalView = view;
    if (view === 'control') document.body.classList.add('altea-task-route-gate');
    else document.body.classList.remove('altea-task-route-gate');
  }

  function renderRoute(view) {
    if (view === 'control') {
      if (window.__ALTEA_TASK_ROUTE_GATE__?.render) {
        window.__ALTEA_TASK_ROUTE_GATE__.render();
        return;
      }
      if (window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__?.renderControl) {
        window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__.renderControl({ skipReady: false });
        return;
      }
      if (typeof window.renderControlCenter === 'function') window.renderControlCenter();
      return;
    }
    if (view === 'dashboard' && window.__ALTEA_DASHBOARD_CEO_MOTION_V1__?.render) { window.__ALTEA_DASHBOARD_CEO_MOTION_V1__.render(); return; }
    if (view === 'dashboard' && typeof window.renderDashboard === 'function') { window.renderDashboard(); return; }
    if (view === 'data-health' && typeof window.renderPortalDataHealth === 'function') { window.renderPortalDataHealth('view-data-health'); return; }
    if (view === 'executive' && typeof window.renderExecutiveV5Route === 'function') { window.renderExecutiveV5Route(); return; }
    if (view === 'executive' && typeof window.renderExecutive === 'function') { window.renderExecutive(); return; }
    if (view === 'sku-plan-fact' && typeof window.renderSkuPlanFact === 'function') { window.renderSkuPlanFact('view-sku-plan-fact'); return; }
    if (view === 'repricer' && typeof window.setRepricerOperatorLayer === 'function') { window.setRepricerOperatorLayer('simple'); return; }
    if (view === 'repricer' && typeof window.renderRepricer === 'function') { window.renderRepricer(); return; }
    if (view === 'prices' && typeof window.renderPriceWorkbench === 'function') { window.renderPriceWorkbench(); return; }
    if (view === 'order' && typeof window.renderOrderCalculator === 'function') { window.renderOrderCalculator(); return; }
    if (view === 'oos-control' && typeof window.renderOosControl === 'function') { window.renderOosControl('view-oos-control'); return; }
    if (view === 'sku-contour' && typeof window.renderSkuContour === 'function') { window.renderSkuContour('view-sku-contour'); return; }
    if (view === 'launches' && typeof window.renderLaunches === 'function') { window.renderLaunches(); return; }
    if (view === 'iu-drr' && typeof window.renderIuDrr === 'function') { window.renderIuDrr('view-iu-drr'); return; }
    if (view === 'wb-rating' && typeof window.renderWbCardRating === 'function') { window.renderWbCardRating('view-wb-rating'); return; }
    if (view === 'product-leaderboard' && typeof window.renderProductLeaderboard === 'function') { window.renderProductLeaderboard(); }
  }

  function cleanupControlRoot(root) {
    if (!root) return;
    const design = root.querySelector('[data-task-calendar-design-v1]');
    if (!design) return;
    Array.from(root.children).forEach((child) => {
      if (child === design || child.contains(design)) return;
      child.remove();
    });
    root.querySelectorAll('.control-simple-panel,[data-task-lazy-panel],.task-center-queues,.task-center-hotfix,[data-control-simple-root],.section-title.control-simple-title,.control-simple-title').forEach((node) => {
      if (!node.closest('[data-task-calendar-design-v1]')) node.remove();
    });
  }

  function needsRender(view, root) {
    if (!root) return false;
    if (view === 'control') return !root.querySelector('[data-task-calendar-design-v1][data-task-kanban-v1]');
    const text = String(root.textContent || '').replace(/\s+/g, '').trim();
    return root.children.length === 0 || text.length < 8;
  }

  function enforceActiveRoute() {
    if (running) return;
    const view = currentView();
    const root = rootFor(view);
    if (!root) return;
    running = true;
    try {
      activateRoute(view, root);
      if (needsRender(view, root)) renderRoute(view);
      if (view === 'control') {
        cleanupControlRoot(root);
        try { window.__ALTEA_TASK_ROUTE_GATE__?.hideMotion?.(); } catch (_) {}
      }
      root.dataset.routeLayerLock = VERSION;
    } catch (error) {
      console.warn('[portal-route-layer-lock]', view, error);
    } finally {
      running = false;
    }
  }

  function cascade() {
    cascadeTimers.forEach((timer) => window.clearTimeout(timer));
    const view = currentView();
    const delays = view === 'control' ? [0, 80, 220, 700, 1600] : [0, 120, 700, 2200, 6000, 14000];
    cascadeTimers = delays.map((delay) => window.setTimeout(enforceActiveRoute, delay));
  }

  window.__ALTEA_ROUTE_LAYER_LOCK_READY__ = VERSION;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cascade, { once: true });
  else cascade();

  ['hashchange', 'altea:viewchange', 'altea:app-ready', 'altea:data-ready', 'altea:portal-storage-updated', 'altea:marketplacechange'].forEach((eventName) => {
    window.addEventListener(eventName, cascade);
  });
})();
