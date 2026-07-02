(function () {
  'use strict';

  if (window.__ALTEA_TASK_STABILITY_HOTFIX_20260702__) return;
  window.__ALTEA_TASK_STABILITY_HOTFIX_20260702__ = true;

  const VERSION = '20260702-task-stability-hotfix-v1';
  const STARTED_AT = Date.now();
  const TOUCHED_KEY = '__ALTEA_TASK_FILTERS_TOUCHED_THIS_SESSION__';
  const LEGACY_SELECTOR = '.section-title.control-simple-title,.control-simple-title,.control-simple-panel,[data-task-lazy-panel],.control-simple-platform-board,.control-simple-workstream-lane,.control-simple-workspace,.control-simple-create,.control-simple-filters,.control-simple-filterbar,.control-simple-queue,.control-simple-task,.task-center-queues,.task-center-hotfix,[data-control-simple-root]';
  const DESIGN_SELECTOR = '[data-task-calendar-design-v1][data-task-kanban-v1],[data-task-calendar-design-v1]';

  let renderTimer = 0;
  let lastRenderAt = 0;
  let observer = null;

  function stateRef() {
    return window.__alteaAppState || window.__ALTEA_STATE__ || window.state || {};
  }

  function controlRoot() {
    return document.getElementById('view-control');
  }

  function isControlActive() {
    const root = controlRoot();
    const activeView = String(stateRef().activeView || '').toLowerCase();
    const hash = String(window.location.hash || '').toLowerCase();
    return Boolean(root?.classList.contains('active') || activeView === 'control' || hash.includes('control') || hash.includes('tasks'));
  }

  function ensureStyle() {
    if (document.getElementById('altea-task-stability-hotfix-style')) return;
    const style = document.createElement('style');
    style.id = 'altea-task-stability-hotfix-style';
    style.textContent = `
      body.altea-task-stable-route .altea-motion-stage[data-scene="transition"],
      body.altea-task-stable-route .portal-loader,
      body.altea-task-stable-route .route-loader{opacity:0!important;visibility:hidden!important;display:none!important;pointer-events:none!important;}
      #view-control.active{contain:layout paint style;isolation:isolate;}
      #view-control.active > ${DESIGN_SELECTOR}{position:relative;z-index:1;}
    `;
    document.head.appendChild(style);
  }

  function markTouched(event) {
    if (event?.target?.closest?.('[data-task-filter]')) window[TOUCHED_KEY] = true;
  }

  function resetStaleFilters() {
    if (window[TOUCHED_KEY]) return;
    const state = stateRef();
    state.controlFilters = state.controlFilters && typeof state.controlFilters === 'object' ? state.controlFilters : {};
    Object.assign(state.controlFilters, {
      search: '',
      owner: 'all',
      status: 'active',
      type: 'all',
      priority: 'all',
      horizon: 'all',
      source: 'all',
      platform: 'all'
    });
  }

  function knownTasksCount() {
    let count = 0;
    try {
      const remote = typeof window.getAllTasks === 'function' ? window.getAllTasks() : [];
      if (Array.isArray(remote)) count = Math.max(count, remote.length);
    } catch (_) {}
    try {
      const local = stateRef()?.storage?.tasks;
      if (Array.isArray(local)) count = Math.max(count, local.length);
    } catch (_) {}
    return count;
  }

  function rescueTeamMode() {
    const state = stateRef();
    state.team = state.team && typeof state.team === 'object' ? state.team : {};
    const mode = String(state.team.mode || '').toLowerCase();
    if (!['pending', 'loading', 'connecting'].includes(mode)) return;
    const tasksCount = knownTasksCount();
    if (tasksCount > 0) {
      state.team.mode = 'ready';
      state.team.taskStabilityRescue = VERSION;
      return;
    }
    if (Date.now() - STARTED_AT > 3200) {
      state.team.mode = 'local';
      state.team.taskStabilityRescue = VERSION;
      const badge = document.getElementById('syncStatusBadge');
      if (badge?.classList?.contains('pending')) {
        badge.className = 'sync-status ready';
        badge.textContent = 'Командная база не ответила — открыт локальный режим';
      }
    }
  }

  function hideTaskTransition() {
    if (!isControlActive()) return;
    document.body.classList.add('altea-task-stable-route');
    try { window.AlteaMotion?.hide?.(); } catch (_) {}
    const stage = document.querySelector('.altea-motion-stage');
    if (stage && stage.getAttribute('data-scene') === 'transition') {
      stage.classList.remove('is-visible');
      stage.hidden = true;
      stage.style.setProperty('pointer-events', 'none', 'important');
    }
  }

  function cleanupLayers() {
    const root = controlRoot();
    const design = root?.querySelector(DESIGN_SELECTOR);
    if (!root || !design) return;
    Array.from(root.children).forEach((child) => {
      if (child === design || child.contains(design)) return;
      child.remove();
    });
    root.querySelectorAll(LEGACY_SELECTOR).forEach((node) => {
      if (!node.closest(DESIGN_SELECTOR)) node.remove();
    });
  }

  function renderTasks(force) {
    if (!isControlActive()) return;
    rescueTeamMode();
    resetStaleFilters();
    const root = controlRoot();
    const hasDesign = !!root?.querySelector(DESIGN_SELECTOR);
    const hasLegacy = !!root?.querySelector(LEGACY_SELECTOR);
    const crowded = root ? root.children.length > 1 : false;
    const now = Date.now();
    if (!force && hasDesign && !hasLegacy && !crowded && now - lastRenderAt < 900) {
      hideTaskTransition();
      return;
    }
    lastRenderAt = now;
    try {
      if (window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__?.renderControl) {
        window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__.renderControl({ skipReady: false });
      } else if (typeof window.renderControlCenter === 'function') {
        window.renderControlCenter();
      }
    } catch (error) {
      console.warn('[task-stability-hotfix] render', error);
    }
    cleanupLayers();
    hideTaskTransition();
  }

  function schedule(force) {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => renderTasks(Boolean(force)), 40);
  }

  function watchControlRoot() {
    const root = controlRoot();
    if (!window.MutationObserver || observer || !root) return;
    observer = new MutationObserver(() => {
      if (!isControlActive()) return;
      const hasDesign = !!root.querySelector(DESIGN_SELECTOR);
      const hasLegacy = !!root.querySelector(LEGACY_SELECTOR);
      if (!hasDesign || hasLegacy || root.children.length > 1) schedule(true);
    });
    observer.observe(root, { childList: true, subtree: false });
  }

  function boot() {
    ensureStyle();
    document.addEventListener('input', markTouched, true);
    document.addEventListener('change', markTouched, true);
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-view="control"],[href$="#control"],[href*="#control"]')) {
        document.body.classList.add('altea-task-stable-route');
        [0, 80, 180, 420, 900].forEach((delay) => window.setTimeout(() => schedule(true), delay));
      }
    }, true);
    ['hashchange', 'altea:viewchange', 'altea:app-ready', 'altea:data-ready', 'altea:portal-storage-updated', 'altea:marketplacechange'].forEach((eventName) => {
      window.addEventListener(eventName, () => schedule(eventName !== 'altea:portal-storage-updated'));
    });
    watchControlRoot();
    [0, 250, 900, 2200, 3600].forEach((delay) => window.setTimeout(() => schedule(delay > 0), delay));
  }

  window.__ALTEA_TASK_STABILITY_API__ = { version: VERSION, render: renderTasks, cleanup: cleanupLayers, rescueTeamMode, resetStaleFilters };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
