(function () {
  'use strict';

  if (window.__ALTEA_TASKS_CALENDAR_DESIGN_V1__) return;
  window.__ALTEA_TASKS_CALENDAR_DESIGN_V1__ = true;

  const VERSION = '20260623-tasks-calendar-design-v1';
  const ROOT_ID = 'view-control';
  const UI_KEY = 'altea.tasks.design.v1';
  const WAITING_STATUSES = new Set(['waiting', 'waiting_team', 'waiting_rop', 'waiting_decision', 'approval']);
  const DONE_STATUSES = new Set(['done', 'closed', 'complete', 'completed', 'cancelled', 'archive', 'archived', 'deleted', 'removed']);
  const LANES = [
    { key: 'new', label: 'Новые', hint: 'что взять в работу' },
    { key: 'in_progress', label: 'В работе', hint: 'движется сейчас' },
    { key: 'waiting', label: 'Ожидают', hint: 'команда / РОП / решение' },
    { key: 'done', label: 'Готово', hint: 'закрыто и зафиксировано' },
    { key: 'no_date', label: 'Без даты', hint: 'нужно назначить срок' }
  ];
  const PLATFORM_ALIASES = {
    all: 'all',
    retail: 'all',
    cross: 'cross',
    wb: 'wb',
    wildberries: 'wb',
    ozon: 'ozon',
    oz: 'ozon',
    ya: 'ya',
    ym: 'ya',
    yandex: 'ya',
    yandexmarket: 'ya',
    goldapple: 'goldapple',
    goldenapple: 'goldapple',
    ga: 'goldapple',
    letu: 'letu',
    letual: 'letu',
    letoile: 'letu',
    magnit: 'magnit',
    magnitmarket: 'magnit',
    product: 'product'
  };
  const PLATFORM_LABELS = {
    all: 'Все площадки',
    cross: 'Микс',
    wb: 'WB',
    ozon: 'Ozon',
    ya: 'Я.Маркет',
    goldapple: 'ЗЯ',
    letu: 'Л’Этуаль',
    magnit: 'Магнит',
    product: 'Продукт'
  };
  const TYPE_OPTIONS = [
    ['all', 'Все типы'],
    ['general', 'Общие'],
    ['price_margin', 'Цена / маржа'],
    ['stock_oos', 'OOS / склад'],
    ['content', 'Контент'],
    ['launch', 'Новинки'],
    ['promo', 'Промо'],
    ['api', 'API / данные']
  ];
  const PRIORITY_OPTIONS = [
    ['all', 'Все приоритеты'],
    ['critical', 'Критичный'],
    ['high', 'Высокий'],
    ['medium', 'Средний'],
    ['low', 'Низкий']
  ];
  const STATUS_OPTIONS = [
    ['active', 'Активные'],
    ['all', 'Все статусы'],
    ['new', 'Новые'],
    ['in_progress', 'В работе'],
    ['waiting', 'Ожидают'],
    ['done', 'Готово']
  ];
  const HORIZON_OPTIONS = [
    ['all', 'Весь горизонт'],
    ['overdue', 'Просрочено'],
    ['today', 'Сегодня'],
    ['week', '7 дней'],
    ['no_owner', 'Без owner'],
    ['no_date', 'Без даты']
  ];
  const SOURCE_OPTIONS = [
    ['all', 'Все источники'],
    ['manual', 'Ручные'],
    ['auto', 'Автосигналы']
  ];

  let wrappedRender = null;
  let enhanceQueued = false;
  let controlObserver = null;
  let controlObserverTimer = 0;
  let renderToken = 0;

  const TASK_UI = window.__ALTEA_TASK_DESIGN_UI__ || loadUi();
  window.__ALTEA_TASK_DESIGN_UI__ = TASK_UI;

  function loadUi() {
    try {
      const parsed = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      return {
        view: parsed.view === 'list' ? 'list' : 'board',
        createOpen: Boolean(parsed.createOpen)
      };
    } catch (_) {
      return { view: 'board', createOpen: false };
    }
  }

  function saveUi() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ view: TASK_UI.view, createOpen: TASK_UI.createOpen }));
    } catch (_) {}
  }

  function appState() {
    try {
      if (typeof state === 'object' && state) return state;
    } catch (_) {}
    return window.state || window.__alteaAppState || {};
  }

  function root() {
    return document.getElementById(ROOT_ID);
  }

  function escapeHtml(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
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
    const rawValue = value || task?.platform || task?.marketplace || task?.marketplaceKey || task?.workstream || '';
    const raw = normalizeText(rawValue);
    const compact = raw.replace(/[\s._'`"-]+/g, '');
    if (PLATFORM_ALIASES[compact]) return PLATFORM_ALIASES[compact];
    const haystack = [
      raw,
      task?.title,
      task?.entityLabel,
      task?.reason,
      task?.nextAction,
      task?.articleKey,
      task?.queue
    ].map(normalizeText).join(' ');
    if (/wildberries|(^|\W)wb($|\W)|\bвб\b/.test(haystack)) return 'wb';
    if (/ozon|озон/.test(haystack)) return 'ozon';
    if (/yandex|яндекс|я\.?\s?маркет|\bym\b|\bya\b/.test(haystack)) return 'ya';
    if (/gold\s?apple|goldapple|золот.*яблок|з\s?я/.test(haystack)) return 'goldapple';
    if (/letu|letoile|л[еэ]туал/.test(haystack)) return 'letu';
    if (/magnit|магнит/.test(haystack)) return 'magnit';
    if (/новин|product|launch|запуск/.test(haystack)) return 'product';
    return 'cross';
  }

  function globalPlatform() {
    const candidates = [
      document.documentElement?.dataset?.marketplace,
      document.body?.dataset?.marketplace,
      document.documentElement?.dataset?.platform,
      document.body?.dataset?.platform,
      appState()?.filters?.platform,
      appState()?.filters?.market
    ];
    try {
      candidates.push(localStorage.getItem('altea.portal.marketplace'));
    } catch (_) {}
    for (const value of candidates) {
      if (value === null || value === undefined || String(value).trim() === '') continue;
      const normalized = normalizePlatform(value);
      if (normalized && normalized !== 'all') return normalized;
      if (normalized === 'all') return 'all';
    }
    return 'all';
  }

  function platformLabel(value) {
    return PLATFORM_LABELS[normalizePlatform(value)] || PLATFORM_LABELS.cross;
  }

  function taskList() {
    try {
      if (typeof window.getAllTasks === 'function') return window.getAllTasks() || [];
    } catch (_) {}
    const storageTasks = appState()?.storage?.tasks;
    return Array.isArray(storageTasks) ? storageTasks : [];
  }

  function ensureFilters() {
    const state = appState();
    state.controlFilters = state.controlFilters && typeof state.controlFilters === 'object' ? state.controlFilters : {};
    const filters = state.controlFilters;
    filters.search = filters.search || '';
    filters.owner = filters.owner || 'all';
    filters.status = filters.status || 'active';
    filters.type = filters.type || 'all';
    filters.priority = filters.priority || 'all';
    filters.horizon = filters.horizon || 'all';
    filters.source = filters.source || 'all';
    filters.platform = filters.platform || 'all';
    return filters;
  }

  function taskDate(task) {
    const candidates = [
      task?.due,
      task?.deadline,
      task?.dueDate,
      task?.due_date,
      task?.endDate,
      task?.end_date,
      task?.dateTo,
      task?.date_to,
      task?.date
    ];
    for (const value of candidates) {
      const key = String(value || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
    }
    return '';
  }

  function laneFor(task) {
    const status = normalizeText(task?.status || 'new');
    if (DONE_STATUSES.has(status)) return 'done';
    if (WAITING_STATUSES.has(status)) return 'waiting';
    if (status === 'active' || status === 'work' || status === 'doing' || status === 'in_progress') return 'in_progress';
    if (!taskDate(task)) return 'no_date';
    return 'new';
  }

  function isDone(task) {
    return DONE_STATUSES.has(normalizeText(task?.status));
  }

  function isActive(task) {
    return !isDone(task);
  }

  function todayKey() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return date.toISOString().slice(0, 10);
  }

  function plusDays(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function formatDate(value) {
    const key = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return 'без даты';
    return `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(2, 4)}`;
  }

  function isOverdue(task) {
    const due = taskDate(task);
    return Boolean(due && due < todayKey() && isActive(task));
  }

  function isToday(task) {
    return taskDate(task) === todayKey();
  }

  function isWeek(task) {
    const due = taskDate(task);
    return Boolean(due && due >= todayKey() && due <= plusDays(7));
  }

  function taskOwner(task) {
    return String(task?.owner || task?.coOwner || '').trim();
  }

  function taskType(task) {
    return normalizeText(task?.type || 'general') || 'general';
  }

  function taskSource(task) {
    const source = normalizeText(task?.source || '');
    const id = normalizeText(task?.id || '');
    return source === 'auto' || task?.autoCode || id.startsWith('auto-') ? 'auto' : 'manual';
  }

  function priorityLabel(priority) {
    const key = normalizeText(priority || 'medium');
    if (key === 'critical') return 'критично';
    if (key === 'high') return 'высокий';
    if (key === 'low') return 'низкий';
    return 'средний';
  }

  function typeLabel(type) {
    const key = normalizeText(type || 'general');
    return TYPE_OPTIONS.find(([value]) => value === key)?.[1] || key || 'Общие';
  }

  function statusLabel(task) {
    const lane = laneFor(task);
    if (lane === 'waiting') return 'Ожидает';
    if (lane === 'in_progress') return 'В работе';
    if (lane === 'done') return 'Готово';
    if (lane === 'no_date') return 'Без даты';
    return 'Новая';
  }

  function ownerOptions(tasks) {
    const owners = new Set();
    tasks.forEach((task) => {
      const owner = taskOwner(task);
      if (owner) owners.add(owner);
    });
    return [...owners].sort((a, b) => a.localeCompare(b, 'ru'));
  }

  function matchesFilters(task, filters, platform) {
    const lane = laneFor(task);
    const status = normalizeText(filters.status || 'active');
    if (status === 'active' && !isActive(task)) return false;
    if (status && status !== 'active' && status !== 'all') {
      if (status === 'waiting') {
        if (lane !== 'waiting') return false;
      } else if (status !== lane && normalizeText(task?.status) !== status) {
        return false;
      }
    }

    const platformFilter = normalizePlatform(platform || filters.platform || 'all');
    if (platformFilter && platformFilter !== 'all') {
      const taskPlatform = normalizePlatform('', task);
      if (taskPlatform !== platformFilter && taskPlatform !== 'cross') return false;
    }

    const owner = normalizeText(filters.owner || 'all');
    if (owner && owner !== 'all' && normalizeText(taskOwner(task) || 'Без owner') !== owner) return false;

    const priority = normalizeText(filters.priority || 'all');
    if (priority && priority !== 'all' && normalizeText(task?.priority || 'medium') !== priority) return false;

    const type = normalizeText(filters.type || 'all');
    if (type && type !== 'all' && taskType(task) !== type) return false;

    const source = normalizeText(filters.source || 'all');
    if (source && source !== 'all' && taskSource(task) !== source) return false;

    const horizon = normalizeText(filters.horizon || 'all');
    if (horizon === 'overdue' && !isOverdue(task)) return false;
    if (horizon === 'today' && !isToday(task)) return false;
    if (horizon === 'week' && !isWeek(task)) return false;
    if (horizon === 'no_owner' && taskOwner(task)) return false;
    if (horizon === 'no_date' && taskDate(task)) return false;

    const search = normalizeText(filters.search || '');
    if (search) {
      const haystack = [
        task?.title,
        task?.entityLabel,
        task?.owner,
        task?.nextAction,
        task?.reason,
        task?.articleKey,
        task?.platform,
        task?.marketplace,
        task?.type
      ].map(normalizeText).join(' ');
      if (!haystack.includes(search)) return false;
    }

    return true;
  }

  function taskScore(task) {
    let score = 0;
    if (isOverdue(task)) score += 70;
    if (task?.priority === 'critical') score += 40;
    if (task?.priority === 'high') score += 22;
    if (laneFor(task) === 'waiting') score += 15;
    if (!taskOwner(task)) score += 10;
    if (!taskDate(task)) score += 8;
    return score;
  }

  function filteredTasks() {
    const filters = ensureFilters();
    const platform = globalPlatform();
    return taskList()
      .filter(Boolean)
      .filter((task) => matchesFilters(task, filters, platform))
      .sort((a, b) => taskScore(b) - taskScore(a) || String(taskDate(a)).localeCompare(String(taskDate(b))) || String(a?.title || '').localeCompare(String(b?.title || ''), 'ru'));
  }

  function countBy(tasks, predicate) {
    return tasks.reduce((sum, task) => sum + (predicate(task) ? 1 : 0), 0);
  }

  function selectHtml(name, label, value, options, extraAttrs = '') {
    return `
      <label class="task-design-filter">
        <span>${escapeHtml(label)}</span>
        <select data-task-filter="${escapeHtml(name)}" ${extraAttrs}>
          ${options.map(([key, text]) => `<option value="${escapeHtml(key)}" ${String(value) === String(key) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}
        </select>
      </label>
    `;
  }

  function renderFilters(tasks, filtered, filters, platform) {
    const owners = [['all', 'Все ответственные'], ...ownerOptions(tasks).map((owner) => [owner, owner])];
    const activeCount = countBy(tasks, isActive);
    const overdueCount = countBy(tasks, isOverdue);
    const noOwnerCount = countBy(tasks, (task) => isActive(task) && !taskOwner(task));
    const noDateCount = countBy(tasks, (task) => isActive(task) && !taskDate(task));
    return `
      <section class="task-design-toolbar" data-task-design-toolbar>
        <div class="task-design-toolbar-top">
          <div>
            <span class="task-design-kicker">ALTEA · TASKS V1</span>
            <h2>Задачи команды</h2>
            <p>Канбан, владельцы, сроки и автосигналы в одном рабочем слое. Площадка берется из верхнего селектора портала.</p>
          </div>
          <div class="task-design-mode" aria-label="Режим задач">
            <button type="button" data-task-view="board" class="${TASK_UI.view === 'board' ? 'active' : ''}">Канбан</button>
            <button type="button" data-task-view="list" class="${TASK_UI.view === 'list' ? 'active' : ''}">Список</button>
            <button type="button" data-task-create-toggle data-task-action="open-create" class="primary">${TASK_UI.createOpen ? 'Закрыть' : 'Поставить задачу'}</button>
          </div>
        </div>
        <div class="task-design-snapshot">
          <button type="button" data-task-preset="all"><strong>${tasks.length}</strong><span>все</span></button>
          <button type="button" data-task-preset="active"><strong>${activeCount}</strong><span>активные</span></button>
          <button type="button" data-task-preset="overdue"><strong>${overdueCount}</strong><span>просрочено</span></button>
          <button type="button" data-task-preset="no_owner"><strong>${noOwnerCount}</strong><span>без owner</span></button>
          <button type="button" data-task-preset="no_date"><strong>${noDateCount}</strong><span>без даты</span></button>
          <div class="task-design-platform-badge"><i></i><span>${escapeHtml(platformLabel(platform))}</span></div>
        </div>
        <div class="task-design-filters">
          <label class="task-design-filter task-design-search">
            <span>Поиск</span>
            <input type="search" data-task-filter="search" value="${escapeHtml(filters.search || '')}" placeholder="SKU, задача, owner, следующий шаг...">
          </label>
          ${selectHtml('owner', 'Owner', filters.owner || 'all', owners)}
          ${selectHtml('status', 'Статус', filters.status || 'active', STATUS_OPTIONS)}
          ${selectHtml('type', 'Тип', filters.type || 'all', TYPE_OPTIONS)}
          ${selectHtml('priority', 'Приоритет', filters.priority || 'all', PRIORITY_OPTIONS)}
          ${selectHtml('horizon', 'Горизонт', filters.horizon || 'all', HORIZON_OPTIONS)}
          ${selectHtml('source', 'Источник', filters.source || 'all', SOURCE_OPTIONS)}
          <button type="button" class="task-design-reset" data-task-reset>Сбросить</button>
        </div>
        <div class="task-design-result-line">Показано ${filtered.length} из ${tasks.length}. Старый слой control-simple на этом маршруте выключен.</div>
      </section>
    `;
  }

  function renderCreateDrawer(platform) {
    if (!TASK_UI.createOpen) return '';
    return `
      <section class="task-design-create" data-task-create-drawer>
        <form data-task-create-form>
          <div>
            <span class="task-design-kicker">Быстрое создание</span>
            <h3>Новая задача</h3>
          </div>
          <label>
            <span>Что сделать</span>
            <input name="title" required placeholder="Например: проверить карточку SKU">
          </label>
          <label>
            <span>Первый шаг / ожидаемый результат</span>
            <textarea name="nextAction" rows="3" placeholder="Что должно измениться после выполнения"></textarea>
          </label>
          <div class="task-design-create-grid">
            <label><span>Owner</span><input name="owner" placeholder="Имя ответственного"></label>
            <label><span>Срок</span><input name="due" type="date" value="${escapeHtml(plusDays(3))}"></label>
            <label><span>Тип</span><select name="type">${TYPE_OPTIONS.filter(([key]) => key !== 'all').map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join('')}</select></label>
            <label><span>Приоритет</span><select name="priority">${PRIORITY_OPTIONS.filter(([key]) => key !== 'all').map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join('')}</select></label>
          </div>
          <input type="hidden" name="platform" value="${escapeHtml(platform === 'all' ? 'cross' : platform)}">
          <div class="task-design-create-actions">
            <span>Площадка: ${escapeHtml(platformLabel(platform))}</span>
            <button type="button" data-task-create-toggle>Отмена</button>
            <button type="submit">Создать</button>
          </div>
        </form>
      </section>
    `;
  }

  function taskCard(task) {
    const platform = normalizePlatform('', task);
    const title = task?.title || task?.entityLabel || 'Задача';
    const entity = task?.entityLabel || task?.articleKey || 'без привязки';
    const next = task?.nextAction || task?.reason || 'Нужен следующий шаг.';
    const owner = taskOwner(task) || 'Без owner';
    const due = taskDate(task);
    const source = taskSource(task);
    const overdue = isOverdue(task);
    return `
      <article class="task-design-card platform-${escapeHtml(platform)} ${overdue ? 'is-overdue' : ''}" draggable="true" data-kanban-task="${escapeHtml(task?.id || '')}" tabindex="0">
        <div class="task-design-card-top">
          <span class="task-design-pill source-${escapeHtml(source)}">${source === 'auto' ? 'авто-сигнал' : 'ручная'}</span>
          <span class="task-design-platform">${escapeHtml(platformLabel(platform))}</span>
        </div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(next)}</p>
        <div class="task-design-card-meta">
          <span>${escapeHtml(owner)}</span>
          <span class="${overdue ? 'danger' : ''}">${escapeHtml(formatDate(due))}</span>
        </div>
        <div class="task-design-card-footer">
          <span>${escapeHtml(typeLabel(taskType(task)))}</span>
          <span>${escapeHtml(priorityLabel(task?.priority))}</span>
        </div>
        <small>${escapeHtml(entity)}</small>
      </article>
    `;
  }

  function renderBoard(tasks) {
    return `
      <section class="task-design-board" data-task-design-board>
        ${LANES.map((lane) => {
          const laneTasks = tasks.filter((task) => laneFor(task) === lane.key);
          const visible = laneTasks.slice(0, 70);
          return `
            <section class="task-design-lane lane-${escapeHtml(lane.key)}" data-kanban-lane="${escapeHtml(lane.key === 'waiting' ? 'waiting_rop' : lane.key === 'no_date' ? 'new' : lane.key)}" data-lane-key="${escapeHtml(lane.key)}">
              <header>
                <div>
                  <h3>${escapeHtml(lane.label)}</h3>
                  <p>${escapeHtml(lane.hint)}</p>
                </div>
                <b>${laneTasks.length}</b>
              </header>
              <div class="task-design-dropzone">
                ${visible.length ? visible.map(taskCard).join('') : '<div class="task-design-empty">Нет задач в этой колонке</div>'}
                ${laneTasks.length > visible.length ? `<div class="task-design-more">+${laneTasks.length - visible.length} скрыто фильтром</div>` : ''}
              </div>
            </section>
          `;
        }).join('')}
      </section>
    `;
  }

  function renderList(tasks) {
    if (!tasks.length) return '<section class="task-design-list"><div class="task-design-empty">По текущим фильтрам задач нет.</div></section>';
    return `
      <section class="task-design-list" data-task-design-list>
        <table>
          <thead>
            <tr>
              <th>Задача</th>
              <th>Owner</th>
              <th>Срок</th>
              <th>Статус</th>
              <th>Тип</th>
              <th>Площадка</th>
              <th>Источник</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.slice(0, 220).map((task) => `
              <tr data-kanban-task="${escapeHtml(task?.id || '')}" tabindex="0">
                <td><strong>${escapeHtml(task?.title || task?.entityLabel || 'Задача')}</strong><span>${escapeHtml(task?.nextAction || task?.reason || task?.articleKey || '')}</span></td>
                <td>${escapeHtml(taskOwner(task) || 'Без owner')}</td>
                <td class="${isOverdue(task) ? 'danger' : ''}">${escapeHtml(formatDate(taskDate(task)))}</td>
                <td>${escapeHtml(statusLabel(task))}</td>
                <td>${escapeHtml(typeLabel(taskType(task)))}</td>
                <td>${escapeHtml(platformLabel(normalizePlatform('', task)))}</td>
                <td>${taskSource(task) === 'auto' ? 'Авто' : 'Ручная'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${tasks.length > 220 ? `<div class="task-design-more">Показано 220 из ${tasks.length}. Уточните фильтры.</div>` : ''}
      </section>
    `;
  }

  function stableHash(value) {
    const text = String(value || '');
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function renderSignature(tasks, filtered, filters, platform) {
    return stableHash(JSON.stringify({
      version: VERSION,
      view: TASK_UI.view,
      createOpen: TASK_UI.createOpen,
      platform,
      filters: {
        search: filters.search || '',
        owner: filters.owner || '',
        status: filters.status || '',
        priority: filters.priority || '',
        type: filters.type || '',
        source: filters.source || '',
        horizon: filters.horizon || ''
      },
      counts: [tasks.length, filtered.length],
      tasks: filtered.slice(0, 260).map((task) => [
        task?.id,
        task?.status,
        task?.owner,
        task?.priority,
        taskDate(task),
        task?.updatedAt || task?.updated_at || ''
      ])
    }));
  }

  function renderShell() {
    const filters = ensureFilters();
    const tasks = taskList().filter(Boolean);
    const platform = globalPlatform();
    const filtered = filteredTasks();
    const signature = renderSignature(tasks, filtered, filters, platform);
    return {
      signature,
      markup: `
        <section class="task-design-v1 platform-${escapeHtml(platform)}" data-task-calendar-design-v1 data-task-kanban-v1 data-version="${escapeHtml(VERSION)}">
          ${renderFilters(tasks, filtered, filters, platform)}
          ${renderCreateDrawer(platform)}
          ${TASK_UI.view === 'list' ? renderList(filtered) : renderBoard(filtered)}
        </section>
      `
    };
  }

  function ensureStyle() {
    if (document.getElementById('altea-task-design-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'altea-task-design-v1-style';
    style.textContent = `
      .task-design-v1,.task-design-v1 *{box-sizing:border-box;min-width:0}
      .task-design-v1{--task-bg:#070706;--task-panel:#12100d;--task-panel2:#17130f;--task-line:#302a22;--task-line2:#4a3f31;--task-text:#f7f1e7;--task-muted:#9f9688;--task-gold:#dbc7a3;--task-danger:#ff756b;--task-good:#72e09a;display:grid;gap:14px;color:var(--task-text);animation:taskDesignIn .28s cubic-bezier(.2,.7,.2,1) both}
      .task-design-v1 button,.task-design-v1 input,.task-design-v1 select,.task-design-v1 textarea{font:inherit}
      .task-design-toolbar,.task-design-create,.task-design-lane,.task-design-list{border:1px solid var(--task-line);border-radius:8px;background:linear-gradient(135deg,rgba(219,199,163,.08),rgba(255,255,255,.018) 42%,rgba(0,0,0,.2)),var(--task-panel);box-shadow:0 18px 54px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.045)}
      .task-design-toolbar{position:sticky;top:76px;z-index:7;padding:14px;backdrop-filter:blur(16px)}
      .task-design-toolbar-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:12px}
      .task-design-kicker{display:block;color:var(--task-gold);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}
      .task-design-toolbar h2,.task-design-create h3{margin:4px 0 0;font:500 30px/1.05 Georgia,serif}
      .task-design-toolbar p{max-width:820px;margin:6px 0 0;color:var(--task-muted);font-size:12px;line-height:1.45}
      .task-design-mode{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
      .task-design-mode button,.task-design-reset,.task-design-create-actions button,.task-design-snapshot button{min-height:34px;border:1px solid var(--task-line2);border-radius:999px;background:#0b0907;color:var(--task-text);padding:8px 13px;cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease}
      .task-design-mode button:hover,.task-design-reset:hover,.task-design-create-actions button:hover,.task-design-snapshot button:hover{border-color:rgba(219,199,163,.62);transform:translateY(-1px)}
      .task-design-mode button.active,.task-design-mode button.primary,.task-design-create-actions button[type=submit]{border-color:rgba(219,199,163,.78);background:linear-gradient(180deg,#ead8b7,#a98448);color:#130f0a;font-weight:900;box-shadow:0 12px 26px rgba(219,199,163,.22)}
      .task-design-snapshot{display:grid;grid-template-columns:repeat(5,minmax(100px,1fr)) minmax(150px,.9fr);gap:8px;margin-bottom:12px}
      .task-design-snapshot button,.task-design-platform-badge{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(219,199,163,.16);border-radius:8px;background:#0b0907;padding:10px 12px;color:var(--task-text)}
      .task-design-snapshot strong{font-size:22px;line-height:1}
      .task-design-snapshot span,.task-design-platform-badge span{color:var(--task-muted);font-size:10px;font-weight:900;text-transform:uppercase}
      .task-design-platform-badge i{width:9px;height:9px;border-radius:50%;background:var(--platform,#dbc7a3);box-shadow:0 0 0 4px color-mix(in srgb,var(--platform,#dbc7a3) 18%,transparent),0 0 18px color-mix(in srgb,var(--platform,#dbc7a3) 48%,transparent)}
      .task-design-filters{display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(6,minmax(128px,1fr)) auto;gap:8px;align-items:end}
      .task-design-filter{display:grid;gap:6px}
      .task-design-filter span{color:var(--task-muted);font-size:10px;font-weight:900;text-transform:uppercase}
      .task-design-filter input,.task-design-filter select,.task-design-create input,.task-design-create select,.task-design-create textarea{width:100%;min-height:38px;border:1px solid var(--task-line);border-radius:8px;background:#050403;color:var(--task-text);padding:9px 10px;outline:none}
      .task-design-filter input:focus,.task-design-filter select:focus,.task-design-create input:focus,.task-design-create textarea:focus{border-color:rgba(219,199,163,.62);box-shadow:0 0 0 3px rgba(219,199,163,.1)}
      .task-design-result-line{margin-top:10px;color:rgba(247,241,231,.54);font-size:11px}
      .task-design-create{padding:14px;animation:taskDesignIn .2s ease both}
      .task-design-create form{display:grid;grid-template-columns:minmax(180px,.55fr) minmax(260px,1fr) minmax(260px,1fr);gap:12px;align-items:start}
      .task-design-create label{display:grid;gap:6px}
      .task-design-create label span,.task-design-create-actions span{color:var(--task-muted);font-size:10px;font-weight:900;text-transform:uppercase}
      .task-design-create textarea{resize:vertical}
      .task-design-create-grid{display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:8px}
      .task-design-create-actions{grid-column:1/-1;display:flex;align-items:center;justify-content:flex-end;gap:8px}
      .task-design-board{display:grid;grid-template-columns:repeat(5,minmax(224px,1fr));gap:10px;overflow-x:auto;padding-bottom:2px}
      .task-design-lane{min-height:420px;display:grid;grid-template-rows:auto 1fr}
      .task-design-lane.is-over{border-color:rgba(219,199,163,.82);background:linear-gradient(135deg,rgba(219,199,163,.12),rgba(255,255,255,.02)),var(--task-panel2)}
      .task-design-lane header{display:flex;justify-content:space-between;gap:8px;padding:12px;border-bottom:1px solid rgba(219,199,163,.12)}
      .task-design-lane h3{margin:0;font-size:15px}
      .task-design-lane p{margin:4px 0 0;color:var(--task-muted);font-size:10px}
      .task-design-lane b{display:grid;place-items:center;min-width:34px;height:28px;border:1px solid rgba(219,199,163,.18);border-radius:999px;background:rgba(219,199,163,.08)}
      .task-design-dropzone{display:flex;flex-direction:column;gap:9px;padding:10px;min-height:330px}
      .task-design-card{position:relative;overflow:hidden;border:1px solid rgba(219,199,163,.16);border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.012)),#0d0b09;padding:11px 11px 10px 14px;cursor:grab;box-shadow:0 12px 28px rgba(0,0,0,.25);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
      .task-design-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--card-color,#dbc7a3);box-shadow:0 0 22px var(--card-color,#dbc7a3)}
      .task-design-card:hover,.task-design-card:focus{outline:0;transform:translateY(-2px);border-color:rgba(219,199,163,.54);box-shadow:0 18px 34px rgba(0,0,0,.3)}
      .task-design-card.is-dragging{opacity:.55;cursor:grabbing}
      .task-design-card.is-overdue{border-color:rgba(255,117,107,.44);background:linear-gradient(180deg,rgba(125,29,24,.26),rgba(255,255,255,.012)),#100807}
      .task-design-card-top,.task-design-card-meta,.task-design-card-footer{display:flex;justify-content:space-between;gap:8px;align-items:center}
      .task-design-card strong{display:block;margin-top:9px;font-size:13px;line-height:1.25}
      .task-design-card p{margin:7px 0 10px;color:rgba(247,241,231,.64);font-size:11px;line-height:1.38}
      .task-design-card small{display:block;margin-top:7px;color:rgba(247,241,231,.42);font-size:10px;line-height:1.3}
      .task-design-card-meta,.task-design-card-footer{color:rgba(247,241,231,.58);font-size:10px;font-weight:800}
      .task-design-pill,.task-design-platform{display:inline-flex;align-items:center;min-height:21px;border:1px solid rgba(219,199,163,.18);border-radius:999px;padding:3px 8px;background:rgba(0,0,0,.28);color:rgba(247,241,231,.72);font-size:9px;font-weight:900;text-transform:uppercase}
      .task-design-pill.source-auto{border-color:rgba(100,184,255,.38);color:#8fc8ff}
      .task-design-pill.source-manual{border-color:rgba(219,199,163,.34);color:#ead8b7}
      .task-design-card .danger,.task-design-list .danger{color:var(--task-danger)}
      .platform-wb{--card-color:#a855f7;--platform:#a855f7}
      .platform-ozon{--card-color:#4f86ff;--platform:#4f86ff}
      .platform-ya{--card-color:#f2c84b;--platform:#f2c84b}
      .platform-goldapple{--card-color:#72c86a;--platform:#72c86a}
      .platform-letu{--card-color:#d96aa9;--platform:#d96aa9}
      .platform-magnit{--card-color:#e85b55;--platform:#e85b55}
      .platform-product{--card-color:#61d8c7;--platform:#61d8c7}
      .platform-cross,.platform-all{--card-color:#dbc7a3;--platform:#dbc7a3}
      .task-design-empty,.task-design-more{display:grid;place-items:center;min-height:74px;border:1px dashed rgba(219,199,163,.18);border-radius:8px;color:rgba(247,241,231,.42);font-size:12px;text-align:center}
      .task-design-more{min-height:38px}
      .task-design-list{overflow:auto}
      .task-design-list table{width:100%;border-collapse:collapse;min-width:1020px}
      .task-design-list th,.task-design-list td{border-bottom:1px solid rgba(219,199,163,.1);padding:12px;text-align:left;vertical-align:top}
      .task-design-list th{position:sticky;top:0;background:#0b0907;color:var(--task-muted);font-size:10px;text-transform:uppercase;z-index:1}
      .task-design-list tr{cursor:pointer;transition:background .14s ease}
      .task-design-list tr:hover{background:rgba(219,199,163,.06)}
      .task-design-list td strong{display:block;font-size:13px}
      .task-design-list td span{display:block;margin-top:4px;color:rgba(247,241,231,.5);font-size:11px}
      @keyframes taskDesignIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      @media(max-width:1520px){.task-design-filters{grid-template-columns:minmax(220px,1.4fr) repeat(3,minmax(132px,1fr));}.task-design-reset{min-height:38px}.task-design-board{grid-template-columns:repeat(5,242px)}.task-design-toolbar{top:62px}}
      @media(max-width:900px){.task-design-toolbar-top,.task-design-create form{display:block}.task-design-mode,.task-design-create-actions{justify-content:flex-start;margin-top:10px}.task-design-snapshot{grid-template-columns:repeat(2,1fr)}.task-design-filters{grid-template-columns:1fr}.task-design-board{grid-template-columns:repeat(5,238px)}}
      @media(prefers-reduced-motion:reduce){.task-design-v1,.task-design-v1 *{animation:none!important;transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function openTask(taskId) {
    if (!taskId) return;
    if (typeof window.openTaskModal === 'function') window.openTaskModal(taskId);
    else if (typeof window.renderTaskModal === 'function') window.renderTaskModal(taskId);
  }

  async function moveTask(taskId, laneStatus) {
    if (!taskId || !laneStatus) return;
    const status = laneStatus === 'waiting' ? 'waiting_rop' : laneStatus === 'no_date' ? 'new' : laneStatus;
    const task = taskList().find((item) => String(item?.id || '') === String(taskId));
    if (task && laneFor(task) === laneFor({ ...task, status })) return;
    if (typeof window.updateTaskStatus === 'function') {
      await window.updateTaskStatus(taskId, status);
    } else if (task) {
      task.status = status;
      if (typeof window.saveLocalStorage === 'function') window.saveLocalStorage({ reason: 'task-design-status' });
    }
    queueEnhance();
  }

  async function createTaskFromForm(form) {
    const data = new FormData(form);
    const payload = {
      title: String(data.get('title') || '').trim(),
      nextAction: String(data.get('nextAction') || '').trim(),
      owner: String(data.get('owner') || '').trim(),
      due: String(data.get('due') || '').trim(),
      type: String(data.get('type') || 'general'),
      priority: String(data.get('priority') || 'medium'),
      platform: String(data.get('platform') || globalPlatform() || 'cross'),
      reason: String(data.get('nextAction') || '').trim()
    };
    let task = null;
    if (typeof window.createManualTask === 'function') {
      task = await window.createManualTask(payload);
    } else {
      const state = appState();
      state.storage = state.storage || {};
      state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
      task = {
        id: `task-${Date.now().toString(36)}`,
        source: 'manual',
        status: 'new',
        createdAt: new Date().toISOString(),
        ...payload
      };
      state.storage.tasks.unshift(task);
      if (typeof window.saveLocalStorage === 'function') window.saveLocalStorage({ reason: 'task-design-create' });
    }
    TASK_UI.createOpen = false;
    saveUi();
    queueEnhance();
    if (task?.id) window.setTimeout(() => openTask(task.id), 120);
  }

  function setFilter(name, value) {
    const filters = ensureFilters();
    filters[name] = value;
    if (name === 'search') {
      window.clearTimeout(setFilter.searchTimer);
      setFilter.searchTimer = window.setTimeout(queueEnhance, 80);
    } else {
      queueEnhance();
    }
  }

  function resetFilters() {
    const filters = ensureFilters();
    Object.assign(filters, {
      search: '',
      owner: 'all',
      status: 'active',
      type: 'all',
      priority: 'all',
      horizon: 'all',
      source: 'all'
    });
    queueEnhance();
  }

  function applyPreset(preset) {
    const filters = ensureFilters();
    if (preset === 'all') {
      filters.status = 'all';
      filters.horizon = 'all';
    } else {
      filters.status = 'active';
      filters.horizon = preset === 'active' ? 'all' : preset;
    }
    queueEnhance();
  }

  function bindShell(shell) {
    let draggingId = '';
    shell.addEventListener('input', (event) => {
      const control = event.target.closest('[data-task-filter]');
      if (!control || !shell.contains(control)) return;
      setFilter(control.dataset.taskFilter, control.value || '');
    });
    shell.addEventListener('change', (event) => {
      const control = event.target.closest('[data-task-filter]');
      if (!control || !shell.contains(control)) return;
      setFilter(control.dataset.taskFilter, control.value || '');
    });
    shell.addEventListener('click', async (event) => {
      const viewButton = event.target.closest('[data-task-view]');
      if (viewButton) {
        TASK_UI.view = viewButton.dataset.taskView === 'list' ? 'list' : 'board';
        saveUi();
        queueEnhance();
        return;
      }
      if (event.target.closest('[data-task-create-toggle]')) {
        TASK_UI.createOpen = !TASK_UI.createOpen;
        saveUi();
        queueEnhance();
        return;
      }
      const preset = event.target.closest('[data-task-preset]');
      if (preset) {
        applyPreset(preset.dataset.taskPreset || 'active');
        return;
      }
      if (event.target.closest('[data-task-reset]')) {
        resetFilters();
        return;
      }
      const taskNode = event.target.closest('[data-kanban-task]');
      if (taskNode && !event.target.closest('button,input,select,textarea')) {
        openTask(taskNode.getAttribute('data-kanban-task'));
      }
    });
    shell.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-task-create-form]');
      if (!form) return;
      event.preventDefault();
      await createTaskFromForm(form);
    });
    shell.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const taskNode = event.target.closest('[data-kanban-task]');
      if (!taskNode) return;
      event.preventDefault();
      openTask(taskNode.getAttribute('data-kanban-task'));
    });
    shell.addEventListener('dragstart', (event) => {
      const card = event.target.closest('.task-design-card[data-kanban-task]');
      if (!card) return;
      draggingId = card.getAttribute('data-kanban-task') || '';
      card.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggingId);
    });
    shell.addEventListener('dragend', (event) => {
      draggingId = '';
      event.target.closest('.task-design-card')?.classList.remove('is-dragging');
      shell.querySelectorAll('.is-over').forEach((node) => node.classList.remove('is-over'));
    });
    shell.addEventListener('dragover', (event) => {
      const lane = event.target.closest('[data-kanban-lane]');
      if (!lane) return;
      event.preventDefault();
      lane.classList.add('is-over');
      event.dataTransfer.dropEffect = 'move';
    });
    shell.addEventListener('dragleave', (event) => {
      const lane = event.target.closest('[data-kanban-lane]');
      if (!lane || lane.contains(event.relatedTarget)) return;
      lane.classList.remove('is-over');
    });
    shell.addEventListener('drop', async (event) => {
      const lane = event.target.closest('[data-kanban-lane]');
      if (!lane) return;
      event.preventDefault();
      lane.classList.remove('is-over');
      const taskId = event.dataTransfer.getData('text/plain') || draggingId;
      await moveTask(taskId, lane.getAttribute('data-kanban-lane') || lane.dataset.laneKey || 'new');
    });
  }

  function enhanceControl(force = false) {
    const viewRoot = root();
    if (!viewRoot || !viewRoot.classList.contains('active')) return;
    startControlObserver();
    ensureStyle();
    const { signature, markup } = renderShell();
    const current = viewRoot.querySelector('[data-task-calendar-design-v1]');
    if (!force && current && current.dataset.renderSignature === signature && viewRoot.children.length === 1) {
      cleanupLegacyControl(viewRoot);
      return;
    }
    const token = ++renderToken;
    viewRoot.innerHTML = markup;
    const shell = viewRoot.querySelector('[data-task-calendar-design-v1]');
    if (shell) {
      shell.dataset.renderSignature = signature;
      shell.dataset.renderToken = String(token);
      bindShell(shell);
    }
    cleanupLegacyControl(viewRoot);
  }

  function cleanupLegacyControl(viewRoot) {
    if (!viewRoot?.querySelector('[data-task-calendar-design-v1]')) return;
    viewRoot.querySelectorAll('.section-title.control-simple-title,.control-simple-title,.control-simple-panel,[data-task-lazy-panel],.control-simple-platform-board,.control-simple-workstream-lane,.control-simple-workspace,.control-simple-create,.control-simple-filters,.control-simple-filterbar,.control-simple-queue,.control-simple-task,.task-center-queues,.task-center-hotfix,[data-control-simple-root]').forEach((node) => {
      if (!node.closest('[data-task-calendar-design-v1]')) node.remove();
    });
  }

  function queueEnhance(force = false) {
    if (enhanceQueued) return;
    enhanceQueued = true;
    const run = () => {
      enhanceQueued = false;
      enhanceControl(force);
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
    const viewRoot = root();
    if (!viewRoot || !viewRoot.classList.contains('active')) {
      stopControlObserver();
      return;
    }
    if (controlObserver) return;
    controlObserver = new MutationObserver(() => {
      if (!viewRoot.classList.contains('active')) {
        stopControlObserver();
        return;
      }
      const hasDesign = !!viewRoot.querySelector('[data-task-calendar-design-v1]');
      const hasLegacy = !!viewRoot.querySelector('.control-simple-panel,[data-task-lazy-panel],.control-simple-platform-board,.control-simple-workstream-lane,.section-title.control-simple-title,.control-simple-workspace,.control-simple-create,.control-simple-filters,.task-center-queues,.task-center-hotfix');
      if (!hasDesign || hasLegacy || viewRoot.children.length > 1) queueEnhance(true);
    });
    controlObserver.observe(viewRoot, { childList: true, subtree: false });
    controlObserverTimer = window.setTimeout(stopControlObserver, 18000);
  }

  function isControlRouteActive() {
    const viewRoot = root();
    const activeView = normalizeText(appState().activeView || '');
    const hash = normalizeText(window.location.hash || '');
    return Boolean(viewRoot?.classList.contains('active') || activeView === 'control' || hash.includes('control'));
  }

  function installWrapper() {
    const current = window.renderControlCenter;
    if (typeof current !== 'function') {
      queueEnhance(true);
      return false;
    }
    if (current.__taskDesignV1Wrapped) {
      queueEnhance(true);
      return true;
    }
    wrappedRender = function taskDesignRenderControlCenter(...args) {
      if (isControlRouteActive()) {
        enhanceControl(true);
        return root();
      }
      const result = current.apply(this, args);
      queueEnhance();
      return result;
    };
    wrappedRender.__taskDesignV1Wrapped = true;
    wrappedRender.__taskDesignBase = current;
    window.renderControlCenter = wrappedRender;
    try { renderControlCenter = wrappedRender; } catch (_) {}
    queueEnhance(true);
    return true;
  }

  function boot() {
    ensureStyle();
    const installed = installWrapper();
    if (!installed) window.setTimeout(installWrapper, 450);
    [0, 220, 700, 1600, 3600, 7200].forEach((delay) => window.setTimeout(() => queueEnhance(true), delay));
    const onRouteChange = () => {
      installWrapper();
      if (isControlRouteActive()) {
        startControlObserver();
        queueEnhance(true);
      }
    };
    window.addEventListener('altea:viewchange', onRouteChange);
    window.addEventListener('altea:data-ready', onRouteChange);
    window.addEventListener('altea:app-ready', onRouteChange);
    window.addEventListener('altea:portal-storage-updated', onRouteChange);
    window.addEventListener('altea:marketplacechange', onRouteChange);
    window.addEventListener('hashchange', onRouteChange);
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-view="control"],[href$="#control"],[href*="#control"]')) {
        window.setTimeout(onRouteChange, 0);
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
