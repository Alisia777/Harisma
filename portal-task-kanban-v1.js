(function () {
  'use strict';

  if (window.__ALTEA_TASK_KANBAN_V1__) return;
  window.__ALTEA_TASK_KANBAN_V1__ = true;

  const VERSION = '20260622-task-kanban-v1';
  const ROOT_ID = 'view-control';
  const LANES = [
    { key: 'new', label: 'Новые', hint: 'что взять в работу' },
    { key: 'in_progress', label: 'В работе', hint: 'двигаем сейчас' },
    { key: 'waiting_rop', label: 'К РОПу', hint: 'ждет согласования' },
    { key: 'waiting_decision', label: 'Решение', hint: 'нужен ответ' },
    { key: 'done', label: 'Сделано', hint: 'закрыто' }
  ];
  const DONE_STATUSES = new Set(['done', 'closed', 'cancelled', 'archive', 'archived']);
  const PLATFORM_ALIASES = {
    wildberries: 'wb',
    wb: 'wb',
    ozon: 'ozon',
    ya: 'ya',
    ym: 'ya',
    yandex: 'ya',
    goldapple: 'goldapple',
    ga: 'goldapple',
    letu: 'letu',
    magnit: 'magnit',
    product: 'product',
    cross: 'cross',
    all: 'all'
  };

  let wrappedRender = null;
  let enhanceQueued = false;
  let controlObserver = null;
  let controlObserverTimer = 0;

  function appState() {
    try {
      if (typeof state === 'object' && state) return state;
    } catch (_) {}
    return window.state || window.__alteaAppState || {};
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizePlatform(value, task) {
    const raw = normalizeText(value || task?.platform || task?.marketplace || task?.workstream || '');
    const compact = raw.replace(/[\s._'`"-]+/g, '');
    if (PLATFORM_ALIASES[compact]) return PLATFORM_ALIASES[compact];
    const haystack = `${raw} ${normalizeText(task?.title)} ${normalizeText(task?.entityLabel)} ${normalizeText(task?.reason)}`;
    if (/wildberries|(^|\W)wb($|\W)|\bвб\b/i.test(haystack)) return 'wb';
    if (/ozon|озон/i.test(haystack)) return 'ozon';
    if (/yandex|яндекс|я\.?\s?маркет|\bym\b|\bya\b/i.test(haystack)) return 'ya';
    if (/gold\s?apple|goldapple|золот.*яблок|з\s?я/i.test(haystack)) return 'goldapple';
    if (/letu|letoile|л[еэ]туал/i.test(haystack)) return 'letu';
    if (/magnit|магнит/i.test(haystack)) return 'magnit';
    if (/новин|product|launch/i.test(haystack)) return 'product';
    return 'cross';
  }

  function taskList() {
    try {
      if (typeof window.getAllTasks === 'function') return window.getAllTasks() || [];
    } catch (_) {}
    const storageTasks = appState()?.storage?.tasks;
    return Array.isArray(storageTasks) ? storageTasks : [];
  }

  function laneFor(task) {
    const status = normalizeText(task?.status || 'new');
    if (LANES.some((lane) => lane.key === status)) return status;
    if (status === 'active' || status === 'work') return 'in_progress';
    if (status === 'waiting' || status === 'approval') return 'waiting_rop';
    if (DONE_STATUSES.has(status)) return 'done';
    return 'new';
  }

  function isActive(task) {
    return !DONE_STATUSES.has(normalizeText(task?.status));
  }

  function isOverdue(task) {
    const due = String(task?.due || task?.deadline || '').slice(0, 10);
    if (!due) return false;
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return due < todayKey && isActive(task);
  }

  function matchesFilters(task) {
    const filters = appState()?.controlFilters || {};
    const statusFilter = normalizeText(filters.status || 'active');
    if (statusFilter === 'active' && !isActive(task)) return false;
    if (statusFilter && statusFilter !== 'all' && statusFilter !== 'active' && laneFor(task) !== statusFilter && normalizeText(task.status) !== statusFilter) return false;

    const owner = normalizeText(filters.owner || 'all');
    if (owner && owner !== 'all' && normalizeText(task.owner || 'Без owner') !== owner) return false;

    const priority = normalizeText(filters.priority || 'all');
    if (priority && priority !== 'all' && normalizeText(task.priority || 'medium') !== priority) return false;

    const type = normalizeText(filters.type || 'all');
    if (type && type !== 'all' && normalizeText(task.type || 'general') !== type) return false;

    const source = normalizeText(filters.source || 'all');
    if (source && source !== 'all' && normalizeText(task.source || 'manual') !== source) return false;

    const platform = normalizeText(filters.platform || 'all');
    if (platform && platform !== 'all' && platform !== 'retail') {
      const normalized = normalizePlatform(platform);
      const taskPlatform = normalizePlatform('', task);
      if (taskPlatform !== normalized) return false;
    }

    const search = normalizeText(filters.search || '');
    if (search) {
      const haystack = [
        task.title,
        task.entityLabel,
        task.owner,
        task.nextAction,
        task.reason,
        task.articleKey,
        task.platform
      ].map(normalizeText).join(' ');
      if (!haystack.includes(search)) return false;
    }

    return true;
  }

  function taskScore(task) {
    let score = 0;
    if (isOverdue(task)) score += 50;
    if (task?.priority === 'critical') score += 30;
    if (task?.priority === 'high') score += 18;
    if (laneFor(task) === 'waiting_rop' || laneFor(task) === 'waiting_decision') score += 12;
    if (!task?.owner) score += 8;
    return score;
  }

  function filteredTasks() {
    return taskList()
      .filter(Boolean)
      .filter(matchesFilters)
      .sort((a, b) => taskScore(b) - taskScore(a) || String(a.due || '').localeCompare(String(b.due || '')));
  }

  function priorityLabel(priority) {
    const key = normalizeText(priority || 'medium');
    if (key === 'critical') return 'критично';
    if (key === 'high') return 'высокий';
    if (key === 'low') return 'низкий';
    return 'средний';
  }

  function card(task) {
    const overdue = isOverdue(task);
    const title = task.title || task.entityLabel || 'Задача';
    const entity = task.entityLabel || task.articleKey || 'без привязки';
    const owner = task.owner || 'Без owner';
    const due = task.due || task.deadline || 'без срока';
    const platform = normalizePlatform('', task);
    const next = task.nextAction || task.reason || 'Нужен следующий шаг.';
    return `
      <article class="task-kanban-v1-card ${overdue ? 'is-overdue' : ''}" draggable="true" data-kanban-task="${escapeHtml(task.id)}" tabindex="0">
        <div class="task-kanban-v1-card-top">
          <span>${escapeHtml(priorityLabel(task.priority))}</span>
          <span>${escapeHtml(platform.toUpperCase())}</span>
        </div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(next)}</p>
        <div class="task-kanban-v1-meta">
          <span>${escapeHtml(owner)}</span>
          <span>${escapeHtml(due)}</span>
        </div>
        <small>${escapeHtml(entity)}</small>
      </article>
    `;
  }

  function renderBoard(tasks) {
    const total = tasks.length;
    const overdue = tasks.filter(isOverdue).length;
    const noOwner = tasks.filter((task) => !task.owner).length;
    const columns = LANES.map((lane) => {
      const laneTasks = tasks.filter((task) => laneFor(task) === lane.key);
      const visible = laneTasks.slice(0, 40);
      return `
        <section class="task-kanban-v1-col" data-kanban-lane="${escapeHtml(lane.key)}">
          <header>
            <div>
              <h4>${escapeHtml(lane.label)}</h4>
              <p>${escapeHtml(lane.hint)}</p>
            </div>
            <span>${visible.length}</span>
          </header>
          <div class="task-kanban-v1-dropzone">
            ${visible.length ? visible.map(card).join('') : '<div class="task-kanban-v1-empty">Пусто</div>'}
            ${laneTasks.length > visible.length ? `<div class="task-kanban-v1-more">+${laneTasks.length - visible.length} в фильтре</div>` : ''}
          </div>
        </section>
      `;
    }).join('');
    return `
      <section class="task-kanban-v1" data-task-kanban-v1 data-version="${escapeHtml(VERSION)}">
        <div class="task-kanban-v1-head">
          <div>
            <p>ЗАДАЧИ · КАНБАН</p>
            <h3>Рабочая доска</h3>
            <span>Перетаскивание меняет статус задачи. Карточка открывает ту же модалку задачи.</span>
          </div>
          <div class="task-kanban-v1-stats">
            <b>${total}</b><span>в текущем фильтре</span>
            <b>${overdue}</b><span>просрочено</span>
            <b>${noOwner}</b><span>без owner</span>
          </div>
        </div>
        <div class="task-kanban-v1-cols">${columns}</div>
      </section>
    `;
  }

  function ensureStyle() {
    if (document.getElementById('altea-task-kanban-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'altea-task-kanban-v1-style';
    style.textContent = `
      .task-kanban-v1{margin:12px 0 14px;padding:14px;border:1px solid rgba(219,199,163,.18);border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,.035),rgba(255,255,255,.012));box-shadow:0 20px 80px rgba(0,0,0,.18);color:#f4eee4;animation:taskKanbanIn 240ms cubic-bezier(.22,.82,.22,1) both}
      .task-kanban-v1 *{box-sizing:border-box}
      .task-kanban-v1-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:12px}
      .task-kanban-v1-head p{margin:0 0 4px;color:#d8bd80;font-size:10px;font-weight:900;letter-spacing:.13em}
      .task-kanban-v1-head h3{margin:0;font:500 24px/1.05 Georgia,serif}
      .task-kanban-v1-head span{display:block;margin-top:5px;color:rgba(244,238,228,.6);font-size:11px;line-height:1.35}
      .task-kanban-v1-stats{display:grid;grid-template-columns:auto auto;gap:2px 8px;align-items:baseline;min-width:210px;padding:10px 12px;border:1px solid rgba(219,199,163,.14);border-radius:14px;background:rgba(5,5,4,.42)}
      .task-kanban-v1-stats b{font-size:18px}
      .task-kanban-v1-stats span{margin:0;font-size:10px}
      .task-kanban-v1-cols{display:grid;grid-template-columns:repeat(5,minmax(190px,1fr));gap:10px;overflow-x:auto;padding-bottom:2px}
      .task-kanban-v1-col{min-height:250px;border:1px solid rgba(219,199,163,.14);border-radius:14px;background:rgba(4,4,3,.42);transition:border-color 160ms ease,background 160ms ease,transform 160ms ease}
      .task-kanban-v1-col.is-over{border-color:rgba(224,183,96,.72);background:rgba(224,183,96,.08);transform:translateY(-1px)}
      .task-kanban-v1-col header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px;border-bottom:1px solid rgba(219,199,163,.12)}
      .task-kanban-v1-col h4{margin:0;font-size:13px;line-height:1.15}
      .task-kanban-v1-col p{margin:3px 0 0;color:rgba(244,238,228,.5);font-size:10px}
      .task-kanban-v1-col header span{display:inline-grid;place-items:center;min-width:28px;height:24px;padding:0 8px;border:1px solid rgba(219,199,163,.18);border-radius:999px;background:rgba(219,199,163,.08);font-size:11px;font-weight:900}
      .task-kanban-v1-dropzone{min-height:196px;padding:9px;display:flex;flex-direction:column;gap:8px}
      .task-kanban-v1-card{border:1px solid rgba(219,199,163,.16);border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.014));padding:10px;color:inherit;cursor:grab;box-shadow:0 10px 26px rgba(0,0,0,.18);transition:transform 160ms ease,border-color 160ms ease,box-shadow 160ms ease}
      .task-kanban-v1-card:hover,.task-kanban-v1-card:focus{outline:0;transform:translateY(-2px);border-color:rgba(224,183,96,.56);box-shadow:0 14px 34px rgba(0,0,0,.24)}
      .task-kanban-v1-card.is-dragging{opacity:.55;cursor:grabbing}
      .task-kanban-v1-card.is-overdue{border-color:rgba(255,114,102,.42);background:linear-gradient(180deg,rgba(120,28,24,.24),rgba(255,255,255,.012))}
      .task-kanban-v1-card-top,.task-kanban-v1-meta{display:flex;justify-content:space-between;gap:8px;color:rgba(244,238,228,.58);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
      .task-kanban-v1-card strong{display:block;margin-top:8px;font-size:12px;line-height:1.25}
      .task-kanban-v1-card p{margin:6px 0 8px;color:rgba(244,238,228,.64);font-size:10px;line-height:1.35}
      .task-kanban-v1-card small{display:block;margin-top:7px;color:rgba(244,238,228,.42);font-size:9px;line-height:1.3}
      .task-kanban-v1-empty,.task-kanban-v1-more{display:grid;place-items:center;min-height:64px;border:1px dashed rgba(219,199,163,.15);border-radius:12px;color:rgba(244,238,228,.42);font-size:11px}
      .task-kanban-v1-more{min-height:36px}
      @keyframes taskKanbanIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @media(max-width:1300px){.task-kanban-v1-cols{grid-template-columns:repeat(5,220px)}}
      @media(max-width:760px){.task-kanban-v1-head{display:block}.task-kanban-v1-stats{margin-top:10px;min-width:0}.task-kanban-v1-cols{grid-template-columns:repeat(5,230px)}}
      @media(prefers-reduced-motion:reduce){.task-kanban-v1,.task-kanban-v1 *{animation:none!important;transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function openTask(taskId) {
    if (!taskId) return;
    if (typeof window.openTaskModal === 'function') window.openTaskModal(taskId);
    else if (typeof window.renderTaskModal === 'function') window.renderTaskModal(taskId);
  }

  async function moveTask(taskId, status) {
    if (!taskId || !status) return;
    const task = taskList().find((item) => String(item.id) === String(taskId));
    if (task && laneFor(task) === status) return;
    if (typeof window.updateTaskStatus === 'function') {
      await window.updateTaskStatus(taskId, status);
    } else if (task) {
      task.status = status;
      if (typeof window.saveLocalStorage === 'function') window.saveLocalStorage({ reason: 'task-kanban-status' });
    }
    if (typeof window.renderControlCenter === 'function') window.renderControlCenter();
  }

  function bindBoard(board) {
    let draggingId = '';

    board.addEventListener('dragstart', (event) => {
      const cardNode = event.target.closest('[data-kanban-task]');
      if (!cardNode) return;
      draggingId = cardNode.getAttribute('data-kanban-task') || '';
      cardNode.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggingId);
    });

    board.addEventListener('dragend', (event) => {
      draggingId = '';
      event.target.closest('[data-kanban-task]')?.classList.remove('is-dragging');
      board.querySelectorAll('.is-over').forEach((node) => node.classList.remove('is-over'));
    });

    board.addEventListener('dragover', (event) => {
      const lane = event.target.closest('[data-kanban-lane]');
      if (!lane) return;
      event.preventDefault();
      lane.classList.add('is-over');
      event.dataTransfer.dropEffect = 'move';
    });

    board.addEventListener('dragleave', (event) => {
      const lane = event.target.closest('[data-kanban-lane]');
      if (!lane || lane.contains(event.relatedTarget)) return;
      lane.classList.remove('is-over');
    });

    board.addEventListener('drop', async (event) => {
      const lane = event.target.closest('[data-kanban-lane]');
      if (!lane) return;
      event.preventDefault();
      lane.classList.remove('is-over');
      const taskId = event.dataTransfer.getData('text/plain') || draggingId;
      const status = lane.getAttribute('data-kanban-lane') || 'new';
      await moveTask(taskId, status);
    });

    board.addEventListener('click', (event) => {
      const cardNode = event.target.closest('[data-kanban-task]');
      if (!cardNode) return;
      openTask(cardNode.getAttribute('data-kanban-task'));
    });

    board.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const cardNode = event.target.closest('[data-kanban-task]');
      if (!cardNode) return;
      event.preventDefault();
      openTask(cardNode.getAttribute('data-kanban-task'));
    });
  }

  function enhanceControl() {
    const root = document.getElementById(ROOT_ID);
    if (!root || !root.classList.contains('active')) return;
    startControlObserver();
    ensureStyle();
    root.querySelector('[data-task-kanban-v1]')?.remove();
    const anchor = root.querySelector('[data-task-lazy-panel]') || root.querySelector('.section-title');
    if (!anchor) return;
    anchor.insertAdjacentHTML(anchor.matches('[data-task-lazy-panel]') ? 'afterend' : 'afterend', renderBoard(filteredTasks()));
    const board = root.querySelector('[data-task-kanban-v1]');
    if (board) bindBoard(board);
    cleanupLegacyControl(root);
  }

  function cleanupLegacyControl(root) {
    if (!root?.querySelector('[data-task-kanban-v1]')) return;
    root.querySelectorAll('.section-title.control-simple-title, .control-simple-panel, [data-task-lazy-panel]').forEach((node) => {
      if (!node.closest('[data-task-kanban-v1]')) node.remove();
    });
  }

  function queueEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    const run = () => {
      enhanceQueued = false;
      enhanceControl();
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else window.setTimeout(run, 0);
  }

  function stopControlObserver() {
    if (controlObserver) {
      controlObserver.disconnect();
      controlObserver = null;
    }
    if (controlObserverTimer) {
      window.clearTimeout(controlObserverTimer);
      controlObserverTimer = 0;
    }
  }

  function startControlObserver() {
    const root = document.getElementById(ROOT_ID);
    if (!root || !root.classList.contains('active')) {
      stopControlObserver();
      return;
    }
    if (controlObserver) return;
    controlObserver = new MutationObserver(() => {
      if (!root.classList.contains('active')) {
        stopControlObserver();
        return;
      }
      const hasBoard = !!root.querySelector('[data-task-kanban-v1]');
      const hasAnchor = !!(root.querySelector('[data-task-lazy-panel]') || root.querySelector('.section-title'));
      if (!hasBoard && hasAnchor) queueEnhance();
    });
    controlObserver.observe(root, { childList: true });
    controlObserverTimer = window.setTimeout(stopControlObserver, 9000);
  }

  function installWrapper() {
    const current = window.renderControlCenter;
    if (typeof current !== 'function') {
      queueEnhance();
      return false;
    }
    if (current.__taskKanbanV1Wrapped) {
      queueEnhance();
      return true;
    }
    wrappedRender = function taskKanbanRenderControlCenter(...args) {
      const result = current.apply(this, args);
      queueEnhance();
      return result;
    };
    wrappedRender.__taskKanbanV1Wrapped = true;
    wrappedRender.__taskKanbanBase = current;
    window.renderControlCenter = wrappedRender;
    try { renderControlCenter = wrappedRender; } catch (_) {}
    queueEnhance();
    return true;
  }

  function boot() {
    ensureStyle();
    const installed = installWrapper();
    if (!installed) window.setTimeout(installWrapper, 500);
    [0, 350, 900, 1800].forEach((delay) => {
      window.setTimeout(queueEnhance, delay);
    });
    const onRouteChange = () => {
      startControlObserver();
      queueEnhance();
    };
    const onRouteChangeCascade = () => {
      [0, 160, 520, 1100, 2400, 5200].forEach((delay) => window.setTimeout(onRouteChange, delay));
    };
    window.addEventListener('altea:viewchange', onRouteChangeCascade);
    window.addEventListener('altea:data-ready', queueEnhance);
    window.addEventListener('altea:app-ready', queueEnhance);
    window.addEventListener('altea:portal-storage-updated', queueEnhance);
    window.addEventListener('hashchange', onRouteChangeCascade);
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-view="control"],[href$="#control"],[href*="#control"]')) {
        window.setTimeout(onRouteChangeCascade, 0);
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
