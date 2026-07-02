(function () {
  'use strict';

  if (window.__ALTEA_ROUTE_LAYER_LOCK_20260702_TASK_STABLE__) return;
  window.__ALTEA_ROUTE_LAYER_LOCK_20260702_TASK_STABLE__ = true;

  const VERSION = '20260702-route-layer-task-stable-loader-v1';

  function loadTaskStabilityHotfix() {
    if (document.querySelector('script[data-altea-task-stability-hotfix]')) return;
    const script = document.createElement('script');
    script.src = 'portal-task-stability-hotfix.js?v=20260702taskstable1';
    script.defer = true;
    script.dataset.alteaTaskStabilityHotfix = VERSION;
    (document.body || document.head || document.documentElement).appendChild(script);
  }

  function normalizeView(view) {
    const key = String(view || '').replace(/^#/, '').trim();
    if (key === 'tasks' || key === 'task') return 'control';
    if (key === 'calendar') return 'data-health';
    if (key === 'launch-control') return 'launches';
    return key || 'dashboard';
  }

  function stateRef() {
    return window.__alteaAppState || window.__ALTEA_STATE__ || window.state || {};
  }

  function currentView() {
    const hash = normalizeView(window.location.hash || '');
    if (hash && hash !== 'dashboard') return hash;
    const active = document.querySelector('.view.active[id^="view-"]');
    if (active?.id) return normalizeView(active.id.replace(/^view-/, ''));
    return normalizeView(stateRef().activeView || hash || 'dashboard');
  }

  function enforceActiveView() {
    const view = currentView();
    const root = document.getElementById(`view-${view}`);
    if (!root) return;
    try { stateRef().activeView = view; } catch (_) {}
    document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section === root));
    document.querySelectorAll('.nav-btn').forEach((button) => button.classList.toggle('active', normalizeView(button.dataset.view || '') === view));
    document.body.dataset.portalView = view;
    if (view === 'control') {
      document.body.classList.add('altea-task-stable-route');
      loadTaskStabilityHotfix();
      window.setTimeout(() => window.__ALTEA_TASK_STABILITY_API__?.render?.(true), 80);
    } else {
      document.body.classList.remove('altea-task-stable-route');
    }
  }

  function schedule() {
    window.setTimeout(enforceActiveView, 0);
    window.setTimeout(enforceActiveView, 220);
    window.setTimeout(enforceActiveView, 900);
  }

  window.__ALTEA_ROUTE_LAYER_LOCK_READY__ = VERSION;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();

  ['hashchange', 'altea:viewchange', 'altea:app-ready', 'altea:data-ready', 'altea:portal-storage-updated', 'altea:marketplacechange'].forEach((eventName) => {
    window.addEventListener(eventName, schedule);
  });

  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-view="control"],[href$="#control"],[href*="#control"]')) {
      document.body.classList.add('altea-task-stable-route');
      loadTaskStabilityHotfix();
      schedule();
    }
  }, true);
})();
