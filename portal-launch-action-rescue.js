(function () {
  'use strict';

  if (window.__ALTEA_LAUNCH_ACTION_RESCUE_V1__) return;
  window.__ALTEA_LAUNCH_ACTION_RESCUE_V1__ = true;

  const VERSION = '20260701-launch-action-rescue-modal-v1';
  const STORAGE_KEY = 'brand-portal-local-v1';
  const ACTION_SELECTOR = '[data-launch-ops-create-selected],[data-launch-ops-create-bulk],[data-launch-ops-open-tasks],[data-launch-ops-create-one],[data-launch-ops-open-task]';
  let lastAction = { key: '', at: 0 };
  let openingControl = false;

  function appState() {
    let stateRef = window.__alteaAppState || window.__ALTEA_STATE__ || null;
    try {
      stateRef = stateRef || (typeof state === 'object' && state ? state : null);
    } catch (_) {}
    stateRef = stateRef || window.state || {};
    stateRef.storage = stateRef.storage && typeof stateRef.storage === 'object' ? stateRef.storage : {};
    stateRef.storage.tasks = Array.isArray(stateRef.storage.tasks) ? stateRef.storage.tasks : [];
    stateRef.storage.comments = Array.isArray(stateRef.storage.comments) ? stateRef.storage.comments : [];
    window.__alteaAppState = stateRef;
    window.__ALTEA_STATE__ = stateRef;
    return stateRef;
  }

  function buttonFromEvent(event) {
    const target = event?.target?.nodeType === 1 ? event.target : event?.target?.parentElement;
    const button = target?.closest?.(ACTION_SELECTOR);
    if (button) return button;
    const fallback = target?.closest?.('button');
    if (fallback?.closest?.('[data-launch-ops-panel],[data-launch-ops-detail]')) {
      const text = String(fallback.textContent || '').trim().toLowerCase();
      if (/создать пакет|создать по выбранной|создать недостающие|открыть задачи/.test(text)) return fallback;
    }
    if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY) && typeof document.elementsFromPoint === 'function') {
      const stack = document.elementsFromPoint(event.clientX, event.clientY);
      for (const node of stack) {
        const stackedButton = node?.closest?.(ACTION_SELECTOR);
        if (stackedButton) return stackedButton;
        const stackedFallback = node?.closest?.('button');
        if (!stackedFallback?.closest?.('[data-launch-ops-panel],[data-launch-ops-detail]')) continue;
        const stackedText = String(stackedFallback.textContent || '').trim().toLowerCase();
        if (/создать пакет|создать по выбранной|создать недостающие|открыть задачи/.test(stackedText)) return stackedFallback;
      }
    }
    return null;
  }

  function actionKey(button) {
    if (!button) return '';
    const text = String(button.textContent || '').trim().toLowerCase();
    if (button.matches?.('[data-launch-ops-create-bulk]') || /создать пакет/.test(text)) return 'bulk';
    if (button.matches?.('[data-launch-ops-create-selected]') || /создать по выбранной|создать недостающие/.test(text)) return 'selected';
    if (button.matches?.('[data-launch-ops-open-tasks]') || /открыть задачи/.test(text)) return 'open';
    if (button.matches?.('[data-launch-ops-create-one]')) return `one:${button.dataset.launchOpsLaunch || ''}:${button.dataset.launchOpsCreateOne || ''}`;
    if (button.matches?.('[data-launch-ops-open-task]')) return `open-task:${button.dataset.launchOpsOpenTask || ''}`;
    return button.dataset.launchOpsAction || '';
  }

  function consume(event, key) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    if (event?.stopImmediatePropagation) event.stopImmediatePropagation();
    lastAction = { key, at: Date.now() };
  }

  function isDuplicate(key) {
    return key && lastAction.key === key && Date.now() - lastAction.at < 800;
  }

  function record(stage, key, detail = {}) {
    window.__ALTEA_LAUNCH_ACTION_RESCUE_LAST__ = {
      stage,
      key,
      detail,
      version: VERSION,
      at: new Date().toISOString()
    };
  }

  function setLaunchFilters() {
    const stateRef = appState();
    stateRef.controlFilters = stateRef.controlFilters && typeof stateRef.controlFilters === 'object'
      ? stateRef.controlFilters
      : {};
    Object.assign(stateRef.controlFilters, {
      search: '',
      owner: 'all',
      status: 'active',
      type: 'launch',
      priority: 'all',
      platform: 'all',
      horizon: 'all',
      source: 'auto'
    });
    return stateRef;
  }

  function ensureControlRoot() {
    let root = document.getElementById('view-control');
    if (root) return root;
    root = document.createElement('section');
    root.id = 'view-control';
    root.className = 'view';
    const main = document.querySelector('main,.main,.content,.app-main,[data-premium-content],.altea-premium-shell-content') || document.body;
    main.appendChild(root);
    return root;
  }

  function activateControlDom() {
    const stateRef = setLaunchFilters();
    stateRef.activeView = 'control';
    const root = ensureControlRoot();
    document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section === root || section.id === 'view-control'));
    document.querySelectorAll('.nav-btn').forEach((button) => button.classList.toggle('active', button.dataset.view === 'control'));
    document.body.dataset.portalView = 'control';
    if (window.location.hash !== '#control') {
      try { history.replaceState(null, '', `${window.location.pathname}${window.location.search}#control`); } catch (_) {}
    }
    return root;
  }

  function taskDate(task = {}) {
    return String(task.due || task.startDate || task.date || '').slice(0, 10);
  }

  function knownTasks() {
    const stateTasks = appState().storage.tasks || [];
    let remote = [];
    try {
      if (typeof window.getAllTasks === 'function') remote = window.getAllTasks() || [];
    } catch (_) {
      remote = [];
    }
    const map = new Map();
    [...stateTasks, ...remote].filter(Boolean).forEach((task) => {
      const id = String(task.id || task.autoCode || JSON.stringify(task)).trim();
      if (!map.has(id)) map.set(id, task);
    });
    return [...map.values()];
  }

  function renderFallbackControl(root) {
    if (!root) return;
    const tasks = knownTasks()
      .filter((task) => String(task.autoCode || '').startsWith('launch_ops:') || task.type === 'launch')
      .filter((task) => !['done', 'closed', 'deleted', 'removed'].includes(String(task.status || '').toLowerCase()))
      .slice(0, 120);
    root.innerHTML = `
      <section class="task-design-shell" data-task-calendar-design-v1 data-task-kanban-v1 data-launch-action-rescue="${VERSION}">
        <div class="task-design-hero">
          <span>Пул задач запуска</span>
          <h1>Задачи по новинкам</h1>
          <p>Аварийный слой открыл задачи, пока основной канбан догружается.</p>
        </div>
        <div class="task-design-board">
          ${tasks.length ? tasks.map((task) => `
            <article class="task-design-card" data-task-id="${escapeHtml(task.id || '')}">
              <strong>${escapeHtml(task.title || task.entityLabel || 'Задача запуска')}</strong>
              <span>${escapeHtml(task.entityLabel || '')}</span>
              <small>${escapeHtml(taskDate(task) || 'без даты')} · ${escapeHtml(task.owner || 'без owner')}</small>
            </article>
          `).join('') : '<p class="muted">Задачи запуска пока не найдены.</p>'}
        </div>
      </section>
    `;
  }

  function renderControlNow() {
    const root = activateControlDom();
    try {
      if (window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__?.renderControl) {
        window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__.renderControl();
      } else if (typeof window.renderControlCenter === 'function') {
        window.renderControlCenter('view-control');
      }
    } catch (error) {
      console.warn('[launch-action-rescue] render control', error);
    }
    window.setTimeout(() => {
      const controlRoot = activateControlDom();
      const hasDesign = !!controlRoot.querySelector('[data-task-calendar-design-v1]');
      const hasText = String(controlRoot.textContent || '').trim().length > 30;
      if (!hasDesign || !hasText) renderFallbackControl(controlRoot);
    }, 900);
    return root;
  }

  function openControl() {
    if (openingControl) return;
    openingControl = true;
    setLaunchFilters();
    try {
      if (typeof window.invalidateControlTaskCache === 'function') window.invalidateControlTaskCache();
    } catch (_) {}
    try {
      const stateActive = appState().activeView === 'control';
      const hashActive = String(window.location.hash || '').replace('#', '') === 'control';
      const rootActive = document.getElementById('view-control')?.classList.contains('active');
      if (!stateActive && !hashActive && !rootActive && typeof window.setView === 'function') {
        window.setView('control', { persist: true, syncHash: true });
      }
    } catch (_) {}
    [0, 80, 220, 650, 1400, 3000].forEach((delay) => {
      window.setTimeout(() => {
        renderControlNow();
        try { window.dispatchEvent(new CustomEvent('altea:viewchange', { detail: { view: 'control', source: VERSION } })); } catch (_) {}
      }, delay);
    });
    record('opened-control', 'open');
    window.setTimeout(() => { openingControl = false; }, 1800);
  }

  function taskIdentity(task = {}) {
    return String(task.id || task.autoCode || task.launchAutoKey || '').trim();
  }

  function hasTask(task) {
    const id = taskIdentity(task);
    const code = String(task.autoCode || task.launchAutoKey || '').trim();
    return (appState().storage.tasks || []).some((item) => {
      if (!item) return false;
      return (id && taskIdentity(item) === id)
        || (code && String(item.autoCode || item.launchAutoKey || '').trim() === code);
    });
  }

  function ensureHistory(task) {
    const stateRef = appState();
    if (!task?.id) return;
    const marker = `[[task:${task.id}]]`;
    if (stateRef.storage.comments.some((comment) => String(comment?.text || '').includes(marker) && String(comment?.text || '').includes('[[kind:created]]'))) return;
    stateRef.storage.comments.unshift({
      id: `comment-launch-rescue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      articleKey: task.articleKey || '',
      author: stateRef?.team?.member?.name || task.owner || 'Команда',
      team: stateRef?.team?.member?.name || 'Команда',
      type: 'task_log',
      text: `${marker} [[kind:created]] Автозадача создана из календаря новинок.`,
      createdAt: new Date().toISOString()
    });
  }

  function mergeCreatedTasks(created) {
    const list = Array.isArray(created) ? created.filter(Boolean) : [];
    if (!list.length) return 0;
    const stateRef = appState();
    let added = 0;
    list.forEach((task) => {
      if (hasTask(task)) return;
      stateRef.storage.tasks.unshift({
        ...task,
        source: 'auto',
        status: task.status || 'new',
        updatedAt: new Date().toISOString()
      });
      ensureHistory(task);
      added += 1;
    });
    return added;
  }

  function saveStorage(reason) {
    try {
      if (typeof window.saveLocalStorage === 'function') {
        window.saveLocalStorage({ reason });
        return;
      }
    } catch (error) {
      console.warn('[launch-action-rescue] saveLocalStorage', error);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState().storage));
    } catch (error) {
      console.warn('[launch-action-rescue] localStorage', error);
    }
  }

  function runCreate(mode, button) {
    const api = window.__ALTEA_LAUNCH_OPS_API__;
    let created = [];
    try {
      if (mode === 'bulk' && api?.createBulk) created = api.createBulk() || [];
      else if (mode === 'selected' && api?.createSelected) created = api.createSelected() || [];
      else if (mode === 'bulk' && typeof window.createLaunchOpsAutotasksBulk === 'function') created = window.createLaunchOpsAutotasksBulk() || [];
      else if (mode === 'selected' && typeof window.createLaunchOpsAutotasksForSelected === 'function') created = window.createLaunchOpsAutotasksForSelected() || [];
    } catch (error) {
      console.warn('[launch-action-rescue] create', mode, error);
    }
    const rescued = mergeCreatedTasks(created);
    if (created.length || rescued) saveStorage(`launch-action-rescue-${mode}`);
    try { api?.refresh?.(); } catch (_) {}
    try { if (typeof window.renderLaunches === 'function') window.setTimeout(() => window.renderLaunches('view-launches'), 80); } catch (_) {}
    record(`created-${mode}`, mode, { count: created.length, rescued, disabled: !!button?.disabled });
    return created.length || rescued;
  }

  function handleAction(event) {
    const button = buttonFromEvent(event);
    if (!button) return;
    const key = actionKey(button);
    if (!key || isDuplicate(key)) {
      if (key) consume(event, key);
      return;
    }
    if (button.disabled && key !== 'open') return;
    consume(event, key);
    if (key.startsWith('open-task:')) {
      const taskId = key.slice('open-task:'.length);
      const api = window.__ALTEA_LAUNCH_OPS_API__;
      try {
        if (taskId && api?.openTask) {
          api.openTask(taskId);
          record('opened-task-modal', key, { taskId });
          return;
        }
        if (taskId && typeof window.openTaskModal === 'function') {
          window.openTaskModal(taskId);
          record('opened-task-modal-native', key, { taskId });
          return;
        }
      } catch (error) {
        console.warn('[launch-action-rescue] open task', error);
      }
      openControl();
      return;
    }
    if (key === 'open') {
      openControl();
      return;
    }
    if (key === 'bulk' || key === 'selected') {
      runCreate(key, button);
      return;
    }
    if (key.startsWith('one:')) {
      const [, launchKey, defId] = key.split(':');
      const api = window.__ALTEA_LAUNCH_OPS_API__;
      try {
        if (api?.createOne) {
          const created = api.createOne(launchKey || '', defId || '') || [];
          record('created-one', key, { count: created.length });
          return;
        }
      } catch (error) {
        console.warn('[launch-action-rescue] create one', error);
      }
      record('one-delegated', key);
    }
  }

  function hardwireButtons() {
    document.querySelectorAll(ACTION_SELECTOR).forEach((button) => {
      if (button.__launchActionRescueBound) return;
      button.__launchActionRescueBound = true;
      button.addEventListener('click', handleAction, true);
      button.addEventListener('pointerdown', handleAction, true);
    });
  }

  function routeRescue() {
    if (openingControl) {
      hardwireButtons();
      return;
    }
    const hash = String(window.location.hash || '').replace('#', '');
    const active = appState().activeView;
    const controlRoot = document.getElementById('view-control');
    const routeWantsControl = hash === 'control' || active === 'control';
    const controlBroken = routeWantsControl && (!controlRoot?.classList.contains('active') || String(controlRoot.textContent || '').trim().length < 30);
    if (controlBroken) openControl();
    hardwireButtons();
  }

  window.addEventListener('click', handleAction, true);
  window.addEventListener('pointerdown', handleAction, true);
  window.addEventListener('hashchange', routeRescue);
  window.addEventListener('altea:viewchange', routeRescue);
  window.addEventListener('altea:app-ready', routeRescue);
  window.addEventListener('altea:data-ready', routeRescue);
  window.addEventListener('altea:portal-storage-updated', routeRescue);

  [0, 250, 900, 2200, 5000, 10000].forEach((delay) => window.setTimeout(routeRescue, delay));
  window.__ALTEA_LAUNCH_ACTION_RESCUE_API__ = { version: VERSION, openControl, runCreate, routeRescue };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }
})();
