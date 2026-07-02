(function () {
  'use strict';

  if (window.__ALTEA_TASKS_CALENDAR_DESIGN_V1__) return;
  window.__ALTEA_TASKS_CALENDAR_DESIGN_V1__ = true;
  window.__ALTEA_TASK_KANBAN_PRIMARY__ = true;

  const VERSION = '20260702-task-marketplace-sync-v1';
  const ROOT_ID = 'view-control';
  const UI_KEY = 'altea.tasks.design.v1';
  const MARKETPLACE_STORAGE_KEY = 'altea.portal.marketplace';
  const EXTRA_KEY = 'altea.tasks.design.extras.v1';
  const ATTACHMENTS_KEY = 'altea.tasks.design.attachments.v1';
  const OWNER_PINNED = ['РОП Маша', 'РОП Миша', 'РОП Саша'];
  const OWNER_BLOCKLIST = new Set(['codex', 'codex qa']);
  const OWNER_ALIASES = new Map([
    ['васильева мария', 'РОП Маша'],
    ['мария васильева', 'РОП Маша'],
    ['маша', 'РОП Маша'],
    ['роп маша', 'РОП Маша'],
    ['миша', 'РОП Миша'],
    ['михаил', 'РОП Миша'],
    ['павленко михаил', 'РОП Миша'],
    ['михаил павленко', 'РОП Миша'],
    ['роп миша', 'РОП Миша'],
    ['саша', 'РОП Саша'],
    ['александр', 'РОП Саша'],
    ['споров александр', 'РОП Саша'],
    ['александр споров', 'РОП Саша'],
    ['роп саша', 'РОП Саша']
  ]);
  const TASK_EMPLOYEE_ALIASES = new Map([
    ['\u0430\u043b\u0435\u043a\u0441\u0430\u043d\u0434\u0440', '\u041f\u0438\u0442\u0430\u0439\u043a\u0438\u043d \u0410\u0440\u0442\u0451\u043c'],
    ['\u0430\u043b\u0435\u043a\u0441\u0430\u043d\u0434\u0440 \u043e\u0437\u043e\u043d', '\u041f\u0438\u0442\u0430\u0439\u043a\u0438\u043d \u0410\u0440\u0442\u0451\u043c'],
    ['\u0430\u043d\u043d\u0430', '\u041f\u0438\u0440\u043e\u0433\u043e\u0432\u0430 \u0410\u043d\u043d\u0430'],
    ['\u0430\u043d\u043d\u0430 \u043f\u0438\u0440\u043e\u0433\u043e\u0432\u0430', '\u041f\u0438\u0440\u043e\u0433\u043e\u0432\u0430 \u0410\u043d\u043d\u0430'],
    ['\u0430\u0440\u0442\u0435\u043c', '\u041f\u0438\u0442\u0430\u0439\u043a\u0438\u043d \u0410\u0440\u0442\u0451\u043c'],
    ['\u0430\u0440\u0442\u0451\u043c', '\u041f\u0438\u0442\u0430\u0439\u043a\u0438\u043d \u0410\u0440\u0442\u0451\u043c'],
    ['\u0434\u0430\u0440\u0438\u044f', '\u041c\u043e\u043b\u043e\u0434\u044f\u043a\u043e\u0432\u0430 \u0414\u0430\u0440\u0438\u044f'],
    ['\u0434\u0430\u0440\u044c\u044f', '\u041c\u043e\u043b\u043e\u0434\u044f\u043a\u043e\u0432\u0430 \u0414\u0430\u0440\u0438\u044f'],
    ['\u0434\u0430\u0448\u0430', '\u041c\u043e\u043b\u043e\u0434\u044f\u043a\u043e\u0432\u0430 \u0414\u0430\u0440\u0438\u044f'],
    ['\u043a\u0438\u0440\u0438\u043b\u043b', '\u041a\u0438\u0440\u0438\u043b\u043b'],
    ['\u043b\u0430\u043f\u044b\u0433\u0438\u043d \u043c\u0430\u043a\u0441\u0438\u043c', '\u041b\u0430\u043f\u044b\u0433\u0438\u043d \u041c\u0430\u043a\u0441\u0438\u043c'],
    ['\u043c\u0430\u043a\u0441\u0438\u043c', '\u041b\u0430\u043f\u044b\u0433\u0438\u043d \u041c\u0430\u043a\u0441\u0438\u043c'],
    ['\u043c\u0430\u043a\u0441\u0438\u043c \u043b\u0430\u043f\u044b\u0433\u0438\u043d', '\u041b\u0430\u043f\u044b\u0433\u0438\u043d \u041c\u0430\u043a\u0441\u0438\u043c'],
    ['\u043c\u043e\u043b\u043e\u0434\u044f\u043a\u043e\u0432\u0430 \u0434\u0430\u0440\u0438\u044f', '\u041c\u043e\u043b\u043e\u0434\u044f\u043a\u043e\u0432\u0430 \u0414\u0430\u0440\u0438\u044f'],
    ['\u043c\u043e\u043b\u043e\u0434\u044f\u043a\u043e\u0432\u0430 \u0434\u0430\u0440\u044c\u044f', '\u041c\u043e\u043b\u043e\u0434\u044f\u043a\u043e\u0432\u0430 \u0414\u0430\u0440\u0438\u044f'],
    ['\u043f\u0438\u0440\u043e\u0433\u043e\u0432\u0430 \u0430\u043d\u043d\u0430', '\u041f\u0438\u0440\u043e\u0433\u043e\u0432\u0430 \u0410\u043d\u043d\u0430'],
    ['\u043f\u0438\u0442\u0430\u0439\u043a\u0438\u043d \u0430\u0440\u0442\u0435\u043c', '\u041f\u0438\u0442\u0430\u0439\u043a\u0438\u043d \u0410\u0440\u0442\u0451\u043c'],
    ['\u043f\u0438\u0442\u0430\u0439\u043a\u0438\u043d \u0430\u0440\u0442\u0451\u043c', '\u041f\u0438\u0442\u0430\u0439\u043a\u0438\u043d \u0410\u0440\u0442\u0451\u043c']
  ]);
  const TASK_OWNER_PLATFORM_KEYS = new Set(['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit']);
  const WAITING_STATUSES = new Set(['waiting', 'waiting_team', 'waiting_rop', 'waiting_decision', 'approval']);
  const DONE_STATUSES = new Set(['done', 'closed', 'complete', 'completed', 'cancelled', 'archive', 'archived', 'deleted', 'removed']);
  const LANES = [
    { key: 'new', label: 'Новые', hint: 'ещё не взяли' },
    { key: 'in_progress', label: 'В работе', hint: 'движется сейчас' },
    { key: 'waiting_team', label: 'Ждёт команду', hint: 'нужен вход команды' },
    { key: 'waiting_rop', label: 'Ожидает РОП', hint: 'нужно решение РОП' },
    { key: 'waiting_decision', label: 'На решение', hint: 'эскалация / решение' },
    { key: 'done', label: 'Готово', hint: 'закрыто и зафиксировано' }
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
  const PLATFORM_OPTIONS = Object.entries(PLATFORM_LABELS);
  const TASK_FILTER_DEFAULTS = {
    search: '',
    owner: 'all',
    status: 'active',
    type: 'all',
    priority: 'all',
    horizon: 'all',
    source: 'all',
    platform: 'all'
  };
  const TYPE_OPTIONS = [
    ['all', 'Все типы'],
    ['general', 'Общие'],
    ['price_margin', 'Цена / маржа'],
    ['supply', 'OOS / склад'],
    ['traffic', 'Трафик / воронка'],
    ['content', 'Контент'],
    ['returns', 'Возвраты / отзывы'],
    ['assignment', 'Закрепление'],
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
    ['waiting_team', 'Ждёт команду'],
    ['waiting_rop', 'Ожидает РОП'],
    ['waiting_decision', 'На решение'],
    ['cancelled', 'Отменено'],
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
  let enhanceQueuedForce = false;
  let controlObserver = null;
  let controlObserverTimer = 0;
  let renderToken = 0;
  let detailEventsBound = false;
  let createEventsBound = false;
  const TASK_LIST_CACHE_TTL_MS = 2500;
  let taskListCache = { signature: '', expiresAt: 0, tasks: [] };
  const TASK_CACHE = window.__ALTEA_TASK_DESIGN_CACHE__ instanceof Map ? window.__ALTEA_TASK_DESIGN_CACHE__ : new Map();
  window.__ALTEA_TASK_DESIGN_CACHE__ = TASK_CACHE;
  const TASK_FILTERS = window.__ALTEA_TASK_DESIGN_FILTERS__ && typeof window.__ALTEA_TASK_DESIGN_FILTERS__ === 'object'
    ? window.__ALTEA_TASK_DESIGN_FILTERS__
    : {};
  window.__ALTEA_TASK_DESIGN_FILTERS__ = TASK_FILTERS;
  let taskExtraCache = null;
  let taskAttachmentCache = null;
  let renderingControl = false;
  const TASK_BOOT_STARTED_AT = Date.now();
  const TASK_SPARSE_BOOT_HOLD_MS = 1200;
  let sparseBootWakeTimer = 0;
  let sparseDataRefreshTimer = 0;

  const TASK_UI = window.__ALTEA_TASK_DESIGN_UI__ || loadUi();
  window.__ALTEA_TASK_DESIGN_UI__ = TASK_UI;

  function loadUi() {
    try {
      const parsed = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      return {
        view: parsed.view === 'list' ? 'list' : 'board',
        createOpen: Boolean(parsed.createOpen),
        recentMovedId: String(parsed.recentMovedId || ''),
        recentMovedAt: Number(parsed.recentMovedAt || 0),
        draft: parsed.draft && typeof parsed.draft === 'object' ? parsed.draft : {}
      };
    } catch (_) {
      return { view: 'board', createOpen: false, recentMovedId: '', recentMovedAt: 0, draft: {} };
    }
  }

  function saveUi() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({
        view: TASK_UI.view,
        createOpen: TASK_UI.createOpen,
        recentMovedId: TASK_UI.recentMovedId || '',
        recentMovedAt: Number(TASK_UI.recentMovedAt || 0),
        draft: TASK_UI.draft || {}
      }));
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

  function ownerKey(value) {
    return normalizeText(value).replace(/\s+/g, ' ');
  }

  function normalizeOwnerName(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const key = ownerKey(raw);
    if (OWNER_BLOCKLIST.has(key)) return '';
    return OWNER_ALIASES.get(key) || raw;
  }

  function normalizeEmployeeOwnerName(value) {
    const original = String(value || '').trim();
    if (!original) return '';
    try {
      if (typeof window.canonicalOwnerName === 'function') {
        const canonical = window.canonicalOwnerName(original);
        if (canonical) return canonical;
      }
    } catch (_) {}
    const raw = normalizeOwnerName(original);
    if (!raw) return '';
    const key = ownerKey(raw);
    if (TASK_EMPLOYEE_ALIASES.has(key)) return TASK_EMPLOYEE_ALIASES.get(key);
    const firstToken = key.split(' ')[0] || '';
    return TASK_EMPLOYEE_ALIASES.get(firstToken) || raw;
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

  function readPortalPlatform() {
    const candidates = [];
    if (document.documentElement) {
      candidates.push(document.documentElement.getAttribute('data-marketplace'));
    }
    if (document.body) {
      candidates.push(document.body.getAttribute('data-marketplace'));
    }
    try {
      candidates.push(window.localStorage.getItem(MARKETPLACE_STORAGE_KEY));
    } catch (_) {}
    try {
      const app = appState();
      candidates.push(app?.filters?.platform, app?.filters?.market);
    } catch (_) {}
    if (document.documentElement) {
      candidates.push(document.documentElement.getAttribute('data-platform'));
    }
    if (document.body) {
      candidates.push(document.body.getAttribute('data-platform'));
    }
    for (const candidate of candidates) {
      const raw = String(candidate || '').trim();
      if (!raw) continue;
      const normalized = normalizePlatform(raw) || 'all';
      if (normalized && normalized !== 'cross') return normalized;
    }
    return 'all';
  }

  function platformFromMarketplaceEvent(event) {
    const detail = event?.detail || {};
    return normalizePlatform(
      detail.internalPlatform
      || detail.internal
      || detail.platform
      || detail.marketplace
      || detail.value
      || readPortalPlatform()
      || 'all'
    ) || 'all';
  }

  function syncPlatformFromPortal(value, options = {}) {
    const filters = ensureFilters();
    if (!options.force && filters.__platformManual === true) {
      filters.platform = normalizePlatform(filters.platform || 'all') || 'all';
      return filters.platform;
    }
    const next = normalizePlatform(value || readPortalPlatform() || 'all') || 'all';
    filters.platform = next;
    filters.__platformManual = false;
    filters.__platformSyncedFromPortal = next;
    return next;
  }

  function globalPlatform() {
    const filters = ensureFilters();
    if (filters.__platformManual === true) {
      filters.platform = normalizePlatform(filters.platform || 'all') || 'all';
      return filters.platform;
    }
    return syncPlatformFromPortal();
  }

  function platformLabel(value) {
    return PLATFORM_LABELS[normalizePlatform(value)] || PLATFORM_LABELS.cross;
  }

  function taskStamp(tasks) {
    if (!Array.isArray(tasks) || !tasks.length) return '0';
    return [
      tasks.length,
      tasks.map((task) => [
        task?.id,
        task?.status,
        task?.updatedAt || task?.updated_at,
        task?.due || task?.deadline || task?.dueDate || task?.due_date,
        task?.owner
      ].map((value) => String(value || '').trim()).join(':')).join('|')
    ].join('#');
  }

  function taskSourceSignature(localTasks, remoteTasks = []) {
    const state = appState();
    return [
      taskStamp(localTasks),
      taskStamp(remoteTasks),
      Array.isArray(state?.skus) ? state.skus.length : 0,
      state?.productLeaderboard?.generatedAt || '',
      state?.predictiveRisk?.generatedAt || '',
      state?.autoTaskSignals?.generatedAt || '',
      state?.team?.mode || '',
      state?.team?.updatedAt || state?.team?.loadedAt || ''
    ].map((value) => String(value || '')).join('::');
  }

  function invalidateTaskListCache() {
    taskListCache = { signature: '', expiresAt: 0, tasks: [] };
  }

  function scheduleSparseDataRefresh(delay = 320) {
    if (sparseDataRefreshTimer) return;
    if (Date.now() - TASK_BOOT_STARTED_AT > 7000) return;
    sparseDataRefreshTimer = window.setTimeout(() => {
      sparseDataRefreshTimer = 0;
      invalidateTaskListCache();
      queueEnhance(true);
    }, delay);
  }

  function taskList() {
    const localTasks = (() => {
      const storage = appState()?.storage?.tasks;
      return Array.isArray(storage) ? storage : [];
    })();
    let remoteTasks = [];
    const hasRemoteProvider = typeof window.getAllTasks === 'function';
    if (hasRemoteProvider) {
      try {
        remoteTasks = window.getAllTasks() || [];
      } catch (_) {
        remoteTasks = [];
      }
    }
    remoteTasks = Array.isArray(remoteTasks) ? remoteTasks : [];
    const signature = taskSourceSignature(localTasks, remoteTasks);
    const now = Date.now();
    if (taskListCache.signature === signature && taskListCache.expiresAt > now) {
      return taskListCache.tasks;
    }
    let tasks = [];
    try {
      if (hasRemoteProvider) {
        const byId = new Map();
        remoteTasks.filter(Boolean).forEach((task) => {
          const id = String(task?.id || '').trim();
          if (id) byId.set(id, mergeTaskExtras(task));
        });
        localTasks.filter(Boolean).forEach((task) => {
          const id = String(task?.id || '').trim();
          if (!id) return;
          const remote = byId.get(id) || {};
          byId.set(id, mergeTaskExtras({
            ...remote,
            ...task,
            articleKeys: task.articleKeys || remote.articleKeys,
            articles: task.articles || remote.articles
          }));
        });
        tasks = Array.from(byId.values()).map(mergeTaskExtras);
      } else {
        tasks = localTasks.map(mergeTaskExtras);
      }
    } catch (_) {}
    if (!tasks.length) tasks = localTasks.map(mergeTaskExtras);
    const bootAge = Date.now() - TASK_BOOT_STARTED_AT;
    const sparseBootList = bootAge < 7000 && tasks.length > 0 && tasks.length < 20;
    taskListCache = {
      signature,
      expiresAt: now + (sparseBootList ? 120 : TASK_LIST_CACHE_TTL_MS),
      tasks
    };
    if (sparseBootList) scheduleSparseDataRefresh();
    return taskListCache.tasks;
  }

  function ensureFilters() {
    const filters = TASK_FILTERS;
    Object.keys(TASK_FILTER_DEFAULTS).forEach((key) => {
      if (!filters[key]) filters[key] = TASK_FILTER_DEFAULTS[key];
    });
    if (filters.status === 'no_date') {
      filters.status = 'active';
      filters.horizon = 'no_date';
    }
    filters.owner = normalizeOwnerName(filters.owner || 'all') || 'all';
    filters.platform = normalizePlatform(filters.platform || 'all') || 'all';
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
    if (status === 'waiting_team' || status === 'waiting') return 'waiting_team';
    if (status === 'waiting_rop' || status === 'approval') return 'waiting_rop';
    if (status === 'waiting_decision') return 'waiting_decision';
    if (status === 'active' || status === 'work' || status === 'doing' || status === 'in_progress') return 'in_progress';
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

  function taskOwnerPlatformKey(platform = '') {
    const key = normalizePlatform(platform);
    if (key === 'ya') return 'ym';
    if (key === 'goldapple') return 'ga';
    if (key === 'magnit') return 'mm';
    return key;
  }

  function skuPlatformOwner(sku, platform = '') {
    const platformKey = normalizePlatform(platform);
    if (!sku || !TASK_OWNER_PLATFORM_KEYS.has(platformKey)) return '';
    try {
      if (typeof window.platformOwnerName === 'function') {
        const owner = normalizeEmployeeOwnerName(window.platformOwnerName(sku, platformKey));
        if (owner) return owner;
      }
    } catch (_) {}
    const ownerKey = taskOwnerPlatformKey(platformKey);
    const sources = [sku?.owner?.byPlatform, sku?.ownersByPlatform];
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      const candidate = ownerKey === 'ym'
        ? (source.ym || source.ya || '')
        : source[ownerKey];
      const owner = normalizeEmployeeOwnerName(candidate);
      if (owner) return owner;
    }
    return '';
  }

  function skuDefaultOwner(sku) {
    if (!sku) return '';
    try {
      if (typeof window.ownerName === 'function') {
        const owner = normalizeEmployeeOwnerName(window.ownerName(sku));
        if (owner) return owner;
      }
    } catch (_) {}
    return normalizeEmployeeOwnerName(sku?.owner?.name || sku?.ownerName || sku?.owner || '');
  }

  function isAutoTaskLike(task = {}) {
    const source = normalizeText(task?.source || '');
    const id = normalizeText(task?.id || '');
    return source === 'auto' || Boolean(task?.autoCode) || id.startsWith('auto-');
  }

  function taskPrimarySku(task) {
    for (const key of taskArticleKeys(task)) {
      const sku = findSku(key);
      if (sku) return sku;
    }
    return null;
  }

  function resolveTaskOwner(task = {}, sku = null, platform = '') {
    const taskPlatform = normalizePlatform(platform || task?.platform || '', task);
    const explicitOwner = normalizeEmployeeOwnerName(task?.owner || '');
    const coOwner = normalizeEmployeeOwnerName(task?.coOwner || task?.co_owner || '');
    const skuOwner = skuDefaultOwner(sku);
    const platformOwner = skuPlatformOwner(sku, taskPlatform);
    if (platformOwner && (!explicitOwner || explicitOwner === skuOwner || isAutoTaskLike(task))) {
      return platformOwner;
    }
    return explicitOwner || platformOwner || coOwner || skuOwner || '';
  }

  function taskOwner(task) {
    return resolveTaskOwner(task, taskPrimarySku(task), normalizePlatform('', task));
  }

  function taskType(task) {
    const key = normalizeText(task?.type || 'general') || 'general';
    if (['stock_oos', 'stock', 'oos', 'warehouse', 'logistics'].includes(key)) return 'supply';
    if (['funnel', 'ads', 'ad', 'marketing', 'kz'].includes(key)) return 'traffic';
    if (['owner', 'owners', 'assignee'].includes(key)) return 'assignment';
    if (['return', 'reviews', 'rating'].includes(key)) return 'returns';
    return key;
  }

  function taskSource(task) {
    const source = normalizeText(task?.source || '');
    const id = normalizeText(task?.id || '');
    return source === 'auto' || task?.autoCode || id.startsWith('auto-') ? 'auto' : 'manual';
  }

  function taskTextBundle(task) {
    return [
      task?.id,
      task?.title,
      task?.entityLabel,
      task?.nextAction,
      task?.reason,
      taskOwner(task),
      task?.articleKey,
      taskArticleKeys(task).join(' '),
      task?.source,
      task?.type,
      task?.platform,
      task?.marketplace
    ].map((value) => String(value || '')).join(' ');
  }

  function hasEncodingDamage(value) {
    return /[\u00d0\u00d1\ufffd]/.test(String(value || ''));
  }

  function isRuntimeSmokeTask(task) {
    const text = taskTextBundle(task).toLowerCase();
    return /smoke attachment|contract smoke|visual smoke|playwright|__contract_|task-test|test task|fixture/.test(text);
  }

  function isEmptyPlaceholderTask(task) {
    const title = normalizeText(task?.title || '');
    const defaultTitles = new Set([
      '',
      '\u0437\u0430\u0434\u0430\u0447\u0430',
      '\u043d\u043e\u0432\u0430\u044f \u0437\u0430\u0434\u0430\u0447\u0430',
      '\u0437\u0430\u0434\u0430\u0447\u0430 \u0431\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f'
    ]);
    if (!defaultTitles.has(title)) return false;
    const hasPayload = [
      task?.nextAction,
      task?.reason,
      task?.entityLabel,
      task?.articleKey,
      taskArticleKeys(task).join(' ')
    ].some((value) => String(value || '').trim());
    return !hasPayload && !taskOwner(task);
  }

  function isTaskDisplayable(task) {
    if (!task?.id) return false;
    if (isRuntimeSmokeTask(task)) return false;
    if (isEmptyPlaceholderTask(task)) return false;
    if (hasEncodingDamage(task?.title) || hasEncodingDamage(task?.nextAction) || hasEncodingDamage(task?.reason)) return false;
    return true;
  }

  function isRecentMovedTask(task) {
    const movedAt = Number(TASK_UI.recentMovedAt || 0);
    return Boolean(
      task?.id
      && TASK_UI.recentMovedId
      && String(task.id) === String(TASK_UI.recentMovedId)
      && Number.isFinite(movedAt)
      && Date.now() - movedAt < 90 * 1000
    );
  }

  function markTaskMoved(taskId) {
    TASK_UI.recentMovedId = String(taskId || '');
    TASK_UI.recentMovedAt = Date.now();
    saveUi();
  }

  function keepTaskVisibleAfterStatusChange(task) {
    if (!task?.id) return;
    markTaskMoved(task.id);
  }

  function clearStaleRecentMove() {
    if (!TASK_UI.recentMovedId) return;
    const movedAt = Number(TASK_UI.recentMovedAt || 0);
    if (!Number.isFinite(movedAt) || Date.now() - movedAt > 90 * 1000) {
      TASK_UI.recentMovedId = '';
      TASK_UI.recentMovedAt = 0;
      saveUi();
    }
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
    const status = normalizeText(task?.status || 'new');
    if (status === 'waiting_team') return 'Ждёт команду';
    if (status === 'waiting_rop') return 'Ожидает РОП';
    if (status === 'waiting_decision') return 'На решение';
    if (status === 'in_progress') return 'В работе';
    if (status === 'done') return 'Готово';
    if (status === 'cancelled') return 'Отменено';
    const lane = laneFor(task);
    if (lane === 'waiting_team') return 'Ждёт команду';
    if (lane === 'waiting_rop') return 'Ожидает РОП';
    if (lane === 'waiting_decision') return 'На решение';
    if (lane === 'in_progress') return 'В работе';
    if (lane === 'done') return 'Готово';
    return 'Новая';
  }

  function ownerOptions(tasks) {
    const owners = new Set(OWNER_PINNED);
    tasks.forEach((task) => {
      const owner = taskOwner(task);
      if (owner) owners.add(owner);
    });
    return [...owners].sort((a, b) => {
      const ai = OWNER_PINNED.indexOf(a);
      const bi = OWNER_PINNED.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b, 'ru');
    });
  }

  function allSkus() {
    const skus = appState()?.skus;
    return Array.isArray(skus) ? skus : [];
  }

  function taskId() {
    if (typeof window.uid === 'function') return window.uid('task');
    return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function commentId() {
    if (typeof window.uid === 'function') return window.uid('comment');
    return `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function findSku(articleKey) {
    const key = normalizeText(articleKey);
    if (!key) return null;
    try {
      if (typeof window.getSku === 'function') return window.getSku(articleKey) || null;
    } catch (_) {}
    return allSkus().find((sku) => {
      return [sku?.articleKey, sku?.article, sku?.sku, sku?.id, sku?.nmId]
        .map(normalizeText)
        .includes(key);
    }) || null;
  }

  function skuTitle(sku) {
    return String(sku?.name || sku?.title || sku?.productName || sku?.article || sku?.articleKey || '').trim();
  }

  function parseArticleKeys(value) {
    const source = Array.isArray(value) ? value.join('\n') : String(value || '');
    return [...new Set(source
      .split(/[\n,;]+|\s{2,}/g)
      .map((item) => String(item || '').trim())
      .filter(Boolean))];
  }

  function taskArticleKeys(task) {
    const keys = parseArticleKeys(task?.articleKeys || task?.articles || task?.articleKey || '');
    if (task?.articleKey && !keys.includes(task.articleKey)) keys.unshift(String(task.articleKey));
    return [...new Set(keys)].filter(Boolean);
  }

  function taskArticleSummary(task, limit = 3) {
    const keys = taskArticleKeys(task);
    if (!keys.length) return task?.entityLabel || 'без привязки';
    const head = keys.slice(0, limit).join(', ');
    return keys.length > limit ? `${head} +${keys.length - limit}` : head;
  }

  function taskArticleTextareaValue(task) {
    return taskArticleKeys(task).join('\n');
  }

  function taskSkuListMarkup(task) {
    const keys = taskArticleKeys(task);
    if (!keys.length) return '<div class="task-detail-empty">SKU не выбраны.</div>';
    return keys.map((key) => {
      const sku = findSku(key);
      return `
        <button type="button" class="task-detail-sku-row" data-task-detail-open-article="${escapeHtml(key)}">
          <strong>${escapeHtml(key)}</strong>
          <span>${escapeHtml(sku ? skuTitle(sku) : 'нет в реестре или еще не сопоставлен')}</span>
        </button>
      `;
    }).join('');
  }

  function skuDatalist(limit = 320) {
    return allSkus().slice(0, limit).map((sku) => {
      const key = sku?.articleKey || sku?.article || sku?.sku || sku?.id || '';
      if (!key) return '';
      return `<option value="${escapeHtml(key)}">${escapeHtml(skuTitle(sku))}</option>`;
    }).join('');
  }

  function storageTasks() {
    const state = appState();
    state.storage = state.storage && typeof state.storage === 'object' ? state.storage : {};
    state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
    return state.storage.tasks;
  }

  function storageComments() {
    const state = appState();
    state.storage = state.storage && typeof state.storage === 'object' ? state.storage : {};
    state.storage.comments = Array.isArray(state.storage.comments) ? state.storage.comments : [];
    return state.storage.comments;
  }

  function taskExtras() {
    if (taskExtraCache && typeof taskExtraCache === 'object') return taskExtraCache;
    try {
      const parsed = JSON.parse(localStorage.getItem(EXTRA_KEY) || '{}');
      taskExtraCache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      taskExtraCache = {};
    }
    return taskExtraCache;
  }

  function saveTaskExtras() {
    try {
      localStorage.setItem(EXTRA_KEY, JSON.stringify(taskExtras()));
    } catch (_) {}
  }

  function mergeTaskExtras(task) {
    if (!task?.id) return task;
    const id = String(task.id);
    const cached = TASK_CACHE.get(id);
    const extra = taskExtras()[id];
    let merged = { ...task };
    if (cached) {
      merged = {
        ...merged,
        ...cached,
        articleKeys: cached.articleKeys || merged.articleKeys,
        articles: cached.articles || merged.articles
      };
    }
    if (extra) {
      merged = {
        ...merged,
        ...extra,
        articleKeys: extra.articleKeys || merged.articleKeys,
        articles: extra.articles || merged.articles
      };
    }
    return merged;
  }

  function rememberTask(task) {
    if (!task?.id) return task;
    const id = String(task.id);
    const articleKeys = taskArticleKeys(task);
    const due = taskDate(task);
    const now = new Date().toISOString();
    const snapshot = {
      ...task,
      articleKey: articleKeys[0] || task.articleKey || '',
      articleKeys,
      articles: articleKeys
    };
    TASK_CACHE.set(id, snapshot);
    const extras = taskExtras();
    const previous = extras[id] || {};
    extras[id] = {
      ...previous,
      title: snapshot.title || previous.title || '',
      articleKey: snapshot.articleKey,
      articleKeys: snapshot.articleKeys,
      articles: snapshot.articles,
      entityLabel: snapshot.entityLabel || previous.entityLabel || taskArticleSummary(snapshot),
      owner: taskOwner(snapshot) || taskOwner(previous) || normalizeOwnerName(snapshot.owner || previous.owner || ''),
      status: snapshot.status || previous.status || 'new',
      priority: snapshot.priority || previous.priority || 'medium',
      type: snapshot.type || previous.type || 'general',
      platform: snapshot.platform || snapshot.marketplace || snapshot.marketplaceKey || previous.platform || 'cross',
      due: due || previous.due || '',
      deadline: snapshot.deadline || previous.deadline || due || '',
      dueDate: snapshot.dueDate || previous.dueDate || due || '',
      due_date: snapshot.due_date || previous.due_date || due || '',
      endDate: snapshot.endDate || previous.endDate || due || '',
      end_date: snapshot.end_date || previous.end_date || due || '',
      dateTo: snapshot.dateTo || previous.dateTo || due || '',
      date_to: snapshot.date_to || previous.date_to || due || '',
      nextAction: snapshot.nextAction || previous.nextAction || '',
      reason: snapshot.reason || previous.reason || '',
      source: snapshot.source || previous.source || '',
      updatedAt: snapshot.updatedAt || snapshot.updated_at || now,
      updated_at: snapshot.updated_at || snapshot.updatedAt || now
    };
    saveTaskExtras();
    return task;
  }

  function taskById(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    const local = storageTasks().find((task) => String(task?.id || '') === key);
    if (local) return mergeTaskExtras(local);
    const cached = TASK_CACHE.get(key);
    if (cached) return mergeTaskExtras(cached);
    const found = taskList().find((task) => String(task?.id || '') === key);
    return found ? mergeTaskExtras(found) : null;
  }

  function materializeTask(task) {
    if (!task?.id) return null;
    const tasks = storageTasks();
    let current = tasks.find((item) => String(item?.id || '') === String(task.id));
    if (!current) {
      current = {
        ...mergeTaskExtras(task),
        source: task.source || 'manual',
        createdAt: task.createdAt || task.created_at || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      tasks.unshift(current);
    } else {
      const merged = mergeTaskExtras(task);
      Object.assign(current, {
        ...merged,
        id: current.id,
        createdAt: current.createdAt || current.created_at || merged.createdAt || merged.created_at,
        created_at: current.created_at || current.createdAt || merged.created_at || merged.createdAt,
        updatedAt: current.updatedAt || current.updated_at || merged.updatedAt || merged.updated_at || new Date().toISOString()
      });
    }
    rememberTask(current);
    return current;
  }

  function savePortalState(reason = 'task-kanban-v1') {
    invalidateTaskListCache();
    try {
      if (typeof window.invalidateControlTaskCache === 'function') window.invalidateControlTaskCache();
    } catch (_) {}
    try {
      if (typeof window.saveLocalStorage === 'function') window.saveLocalStorage({ reason });
      else if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason });
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('altea:portal-storage-updated', { detail: { reason } }));
    } catch (_) {}
  }

  function persistTaskLater(task) {
    try {
      const fn = window.persistTask || (typeof persistTask === 'function' ? persistTask : null);
      if (typeof fn === 'function') Promise.resolve(fn(task)).catch((error) => console.error('[task-kanban-v1] persist task', error));
    } catch (error) {
      console.error('[task-kanban-v1] persist task', error);
    }
  }

  function persistCommentLater(comment) {
    try {
      const fn = window.persistComment || (typeof persistComment === 'function' ? persistComment : null);
      if (typeof fn === 'function') Promise.resolve(fn(comment)).catch((error) => console.error('[task-kanban-v1] persist comment', error));
    } catch (error) {
      console.error('[task-kanban-v1] persist comment', error);
    }
  }

  function addTaskHistory(task, kind, text) {
    const message = String(text || '').trim();
    if (!task?.id || !message) return null;
    const app = appState();
    const comment = {
      id: commentId(),
      articleKey: task.articleKey || '',
      author: app?.team?.member?.name || task.owner || 'Команда',
      team: app?.team?.member?.name || 'Команда',
      type: 'task_log',
      text: `[[task:${task.id}]] [[kind:${kind || 'comment'}]] ${message}`,
      createdAt: new Date().toISOString()
    };
    storageComments().unshift(comment);
    persistCommentLater(comment);
    return comment;
  }

  function taskHistory(task) {
    const id = String(task?.id || '').trim();
    if (!id) return [];
    return storageComments()
      .filter((comment) => String(comment?.text || '').includes(`[[task:${id}]]`))
      .map((comment) => ({
        ...comment,
        cleanText: String(comment?.text || '').replace(/^\[\[task:[^\]]+\]\]\s*\[\[kind:[^\]]+\]\]\s*/i, '').trim()
      }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  function storageAttachments() {
    const state = appState();
    state.storage = state.storage && typeof state.storage === 'object' ? state.storage : {};
    state.storage.taskAttachments = Array.isArray(state.storage.taskAttachments) ? state.storage.taskAttachments : [];
    return state.storage.taskAttachments;
  }

  function localAttachments() {
    if (Array.isArray(taskAttachmentCache)) return taskAttachmentCache;
    try {
      const parsed = JSON.parse(localStorage.getItem(ATTACHMENTS_KEY) || '[]');
      taskAttachmentCache = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      taskAttachmentCache = [];
    }
    return taskAttachmentCache;
  }

  function saveLocalAttachments() {
    try {
      localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(localAttachments().slice(0, 400)));
    } catch (_) {}
  }

  function rememberAttachment(attachment) {
    if (!attachment?.taskId) return attachment;
    const list = localAttachments();
    const key = String(attachment.id || `${attachment.taskId}:${attachment.fileName || attachment.name || Date.now()}`);
    const index = list.findIndex((item) => String(item?.id || `${item?.taskId}:${item?.fileName || item?.name || ''}`) === key);
    if (index >= 0) list.splice(index, 1, attachment);
    else list.unshift(attachment);
    saveLocalAttachments();
    return attachment;
  }

  function taskAttachments(taskId) {
    const id = String(taskId || '').trim();
    let remote = [];
    try {
      if (typeof window.getTaskAttachments === 'function') remote = window.getTaskAttachments(taskId) || [];
    } catch (_) {}
    const local = storageAttachments()
      .filter((item) => String(item?.taskId || '') === id)
      .concat(localAttachments().filter((item) => String(item?.taskId || '') === id));
    const byId = new Map();
    [...remote, ...local].filter(Boolean).forEach((item) => {
      const key = String(item?.id || item?.fileName || item?.name || Math.random());
      byId.set(key, item);
    });
    return Array.from(byId.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  function attachmentSizeLabel(size = 0) {
    const bytes = Number(size || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes)} B`;
  }

  function renderTaskAttachments(taskId) {
    const attachments = taskAttachments(taskId);
    if (!attachments.length) {
      return '<div class="task-detail-empty">Файлов пока нет. Можно приложить XLSX, CSV, PDF, DOCX или картинку к этой задаче.</div>';
    }
    return attachments.map((item) => {
      const fileName = item?.fileName || item?.name || 'Файл';
      const meta = [
        item?.createdBy || '',
        item?.createdAt ? formatDate(String(item.createdAt).slice(0, 10)) : '',
        attachmentSizeLabel(item?.size)
      ].filter(Boolean).join(' · ');
      const url = item?.publicUrl || item?.url || item?.dataUrl || '';
      return `
        <div class="task-detail-file-row">
          <div>
            <strong>${escapeHtml(fileName)}</strong>
            <span>${escapeHtml(meta || 'Вложение к задаче')}</span>
          </div>
          ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Открыть</a>` : '<em>ждет синхронизацию</em>'}
        </div>
      `;
    }).join('');
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      if (!file || Number(file.size || 0) > 1024 * 1024) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  async function handleTaskFiles(taskId, files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!taskId || !list.length) return;
    const task = materializeTask(taskById(taskId) || { id: taskId });
    if (!task) return;
    for (const file of list) {
      let attachment = null;
      if (typeof window.uploadTaskAttachment === 'function') {
        try {
          attachment = await window.uploadTaskAttachment(task.id, file);
        } catch (error) {
          console.warn('[task-kanban-v1] remote attachment failed, keeping local metadata', error);
        }
      }
      if (!attachment) {
        const dataUrl = await readFileAsDataUrl(file);
        attachment = {
          id: `attach-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          taskId: task.id,
          articleKey: task.articleKey || '',
          fileName: String(file.name || 'Файл'),
          mimeType: String(file.type || ''),
          size: Number(file.size || 0),
          dataUrl,
          localOnly: true,
          syncStatus: 'local',
          createdAt: new Date().toISOString(),
          createdBy: appState()?.team?.member?.name || task.owner || 'Команда'
        };
        storageAttachments().unshift(attachment);
        rememberAttachment(attachment);
        savePortalState('task-kanban-v1-attachment-local');
      } else {
        rememberAttachment(attachment);
      }
      addTaskHistory(task, 'attachment', `Прикреплен файл: ${attachment.fileName || file.name || 'файл'}.`);
    }
    rememberTask(task);
    savePortalState('task-kanban-v1-attachment');
  }

  function updateTaskLocal(taskId, patch = {}, historyText = '') {
    const source = taskById(taskId);
    const current = materializeTask(source || { id: taskId });
    if (!current) return null;
    const beforeStatus = current.status || 'new';
    Object.assign(current, patch, {
      id: current.id,
      updatedAt: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (!current.title) current.title = 'Новая задача';
    if (!current.status) current.status = 'new';
    rememberTask(current);
    if (beforeStatus !== current.status) keepTaskVisibleAfterStatusChange(current);
    if (historyText) addTaskHistory(current, beforeStatus !== current.status ? 'status' : 'updated', historyText);
    savePortalState('task-kanban-v1-update');
    persistTaskLater(current);
    queueEnhance(true);
    return current;
  }

  function statusOptionsHtml(value) {
    const options = [
      ['new', 'Новая'],
      ['in_progress', 'В работе'],
      ['waiting_team', 'Ждёт команду'],
      ['waiting_rop', 'Ожидает РОП'],
      ['waiting_decision', 'На решение'],
      ['done', 'Готово'],
      ['cancelled', 'Отменено']
    ];
    return options.map(([key, label]) => `<option value="${escapeHtml(key)}" ${String(value || 'new') === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  }

  function createDraft() {
    TASK_UI.draft = TASK_UI.draft && typeof TASK_UI.draft === 'object' ? TASK_UI.draft : {};
    return TASK_UI.draft;
  }

  function updateCreateDraft(form) {
    if (!form) return createDraft();
    const data = new FormData(form);
    const draft = createDraft();
    ['title', 'articleKeys', 'articleKey', 'nextAction', 'reason', 'owner', 'due', 'type', 'priority', 'platform'].forEach((key) => {
      const value = data.get(key);
      if (typeof value === 'string') draft[key] = key === 'owner' ? normalizeOwnerName(value) : value;
    });
    saveUi();
    return draft;
  }

  function draftValue(name, fallback = '') {
    const draft = createDraft();
    return String(draft[name] ?? fallback ?? '');
  }

  function fieldValue(data, draft, name) {
    const value = data.get(name);
    const text = typeof value === 'string' ? value : '';
    return text || String(draft?.[name] || '');
  }

  function matchesFilters(task, filters, platform) {
    const lane = laneFor(task);
    const status = normalizeText(filters.status || 'active');
    if (status === 'active' && !isActive(task)) return false;
    if (status && status !== 'active' && status !== 'all') {
      if (status === 'waiting') {
        if (!WAITING_STATUSES.has(normalizeText(task?.status))) return false;
      } else if (status !== lane && normalizeText(task?.status) !== status) {
        return false;
      }
    }

    const platformFilter = normalizePlatform(platform || filters.platform || 'all');
    if (platformFilter && platformFilter !== 'all') {
      const taskPlatform = normalizePlatform('', task);
      if (taskPlatform !== platformFilter && taskPlatform !== 'cross') return false;
    }

    const owner = normalizeText(normalizeOwnerName(filters.owner || 'all') || 'all');
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
        taskOwner(task),
        task?.nextAction,
        task?.reason,
        task?.articleKey,
        taskArticleKeys(task).join(' '),
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
    if (isRecentMovedTask(task)) score += 1000;
    const createdMs = Date.parse(task?.createdAt || task?.created_at || '');
    if (taskSource(task) === 'manual' && Number.isFinite(createdMs) && Date.now() - createdMs < 24 * 60 * 60 * 1000) score += 120;
    if (isOverdue(task)) score += 70;
    if (task?.priority === 'critical') score += 40;
    if (task?.priority === 'high') score += 22;
    if (laneFor(task) === 'waiting') score += 15;
    if (!taskOwner(task)) score += 10;
    if (!taskDate(task)) score += 8;
    return score;
  }

  function filteredTasks(sourceTasks = null) {
    const filters = ensureFilters();
    const platform = globalPlatform();
    const baseTasks = Array.isArray(sourceTasks)
      ? sourceTasks
      : taskList().filter(Boolean).filter(isTaskDisplayable);
    return baseTasks
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
    const selectedOwner = normalizeOwnerName(filters.owner || 'all') || 'all';
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
          ${selectHtml('owner', 'Owner', selectedOwner, owners)}
          ${selectHtml('status', 'Статус', filters.status || 'active', STATUS_OPTIONS)}
          ${selectHtml('type', 'Тип', filters.type || 'all', TYPE_OPTIONS)}
          ${selectHtml('priority', 'Приоритет', filters.priority || 'all', PRIORITY_OPTIONS)}
          ${selectHtml('horizon', 'Горизонт', filters.horizon || 'all', HORIZON_OPTIONS)}
          ${selectHtml('platform', 'Площадка', filters.platform || 'all', PLATFORM_OPTIONS)}
          ${selectHtml('source', 'Источник', filters.source || 'all', SOURCE_OPTIONS)}
          <button type="button" class="task-design-reset" data-task-reset>Сбросить</button>
        </div>
        <div class="task-design-result-line">Показано ${filtered.length} из ${tasks.length}. Старый слой control-simple на этом маршруте выключен.</div>
      </section>
    `;
  }

  function renderCreateDrawer(platform) {
    if (!TASK_UI.createOpen) return '';
    const ownerValue = normalizeOwnerName(draftValue('owner'));
    return `
      <section class="task-design-create" data-task-create-drawer>
        <form data-task-create-form>
          <div class="task-design-create-head">
            <span class="task-design-kicker">Быстрое создание</span>
            <h3>Новая задача</h3>
          </div>
          <label class="task-design-title-field">
            <span>Что сделать</span>
            <input name="title" required placeholder="Например: проверить карточку SKU" value="${escapeHtml(draftValue('title'))}">
          </label>
          <label class="task-design-article-field">
            <span>Артикулы / SKU</span>
            <textarea name="articleKeys" rows="4" placeholder="Можно вставить списком: каждый артикул с новой строки, через запятую или точку с запятой">${escapeHtml(draftValue('articleKeys'))}</textarea>
          </label>
          <label class="task-design-next-field">
            <span>Первый шаг / ожидаемый результат</span>
            <textarea name="nextAction" rows="3" placeholder="Что должно измениться после выполнения">${escapeHtml(draftValue('nextAction'))}</textarea>
          </label>
          <label class="task-design-reason-field">
            <span>Контекст / доп. описание</span>
            <textarea name="reason" rows="3" placeholder="Причина, ссылки, что проверить, какие метрики смотреть">${escapeHtml(draftValue('reason'))}</textarea>
          </label>
          <div class="task-design-create-grid">
            <label><span>Owner</span><input name="owner" placeholder="Имя ответственного" value="${escapeHtml(ownerValue)}"></label>
            <label><span>Срок</span><input name="due" type="date" value="${escapeHtml(draftValue('due', plusDays(3)))}"></label>
            <label><span>Тип</span><select name="type">${TYPE_OPTIONS.filter(([key]) => key !== 'all').map(([key, label]) => `<option value="${escapeHtml(key)}" ${draftValue('type', 'general') === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
            <label><span>Приоритет</span><select name="priority">${PRIORITY_OPTIONS.filter(([key]) => key !== 'all').map(([key, label]) => `<option value="${escapeHtml(key)}" ${draftValue('priority', 'critical') === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
            <label class="task-design-file-field"><span>Файлы к задаче</span><input name="files" type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.png,.jpg,.jpeg"></label>
          </div>
          <input type="hidden" name="platform" value="${escapeHtml(draftValue('platform', platform === 'all' ? 'cross' : platform))}">
          <div class="task-design-create-actions">
            <span>Площадка: ${escapeHtml(platformLabel(platform))}</span>
            <button type="button" data-task-create-toggle>Отмена</button>
            <button type="button" data-task-create-submit>Создать</button>
          </div>
        </form>
      </section>
    `;
  }

  function taskCard(task) {
    const platform = normalizePlatform('', task);
    const title = task?.title || task?.entityLabel || 'Задача';
    const entity = taskArticleSummary(task);
    const next = task?.nextAction || task?.reason || 'Нужен следующий шаг.';
    const owner = taskOwner(task) || 'Без owner';
    const due = taskDate(task);
    const source = taskSource(task);
    const overdue = isOverdue(task);
    const recent = isRecentMovedTask(task);
    return `
      <article class="task-design-card platform-${escapeHtml(platform)} ${overdue ? 'is-overdue' : ''} ${recent ? 'is-recently-moved' : ''}" draggable="true" data-kanban-task="${escapeHtml(task?.id || '')}" tabindex="0">
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
            <section class="task-design-lane lane-${escapeHtml(lane.key)}" data-kanban-lane="${escapeHtml(lane.key)}" data-lane-key="${escapeHtml(lane.key)}">
              <header>
                <div class="task-design-lane-title">
                  <h3>${escapeHtml(lane.label)}</h3>
                  <p>${escapeHtml(lane.hint)}</p>
                </div>
                <b class="task-design-lane-count">${laneTasks.length}</b>
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
                <td><strong>${escapeHtml(task?.title || task?.entityLabel || 'Задача')}</strong><span>${escapeHtml(task?.nextAction || task?.reason || taskArticleSummary(task) || '')}</span></td>
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
        horizon: filters.horizon || '',
        platform: filters.platform || ''
      },
      counts: [tasks.length, filtered.length],
      tasks: filtered.slice(0, 260).map((task) => [
        task?.id,
        task?.title,
        task?.entityLabel,
        task?.nextAction,
        task?.reason,
        task?.articleKey,
        Array.isArray(task?.articleKeys) ? task.articleKeys.join('|') : '',
        task?.status,
        taskOwner(task),
        task?.priority,
        taskType(task),
        normalizePlatform('', task),
        taskSource(task),
        taskDate(task)
      ])
    }));
  }

  function isTaskDataHydrating() {
    const bootAge = Date.now() - TASK_BOOT_STARTED_AT;
    if (bootAge > 9000) return false;
    const app = appState();
    if (window.__ALTEA_PRIMARY_INIT_PENDING__ === true) return true;
    if (app?.boot && app.boot.dataReady === false) return true;
    return false;
  }

  function shouldHoldSparseBoot(tasks) {
    const bootAge = Date.now() - TASK_BOOT_STARTED_AT;
    if (bootAge >= TASK_SPARSE_BOOT_HOLD_MS) return false;
    if (Array.isArray(tasks) && tasks.length >= 20) return false;
    if (!sparseBootWakeTimer) {
      sparseBootWakeTimer = window.setTimeout(() => {
        sparseBootWakeTimer = 0;
        queueEnhance(true);
      }, Math.max(40, TASK_SPARSE_BOOT_HOLD_MS - bootAge + 30));
    }
    return true;
  }

  function renderHydratingShell(platform) {
    return `
      <section class="task-design-v1 platform-${escapeHtml(platform)} is-loading" data-task-calendar-design-v1 data-task-kanban-v1 data-task-loading="team" data-version="${escapeHtml(VERSION)}">
        <div class="task-design-header">
          <div>
            <span class="task-design-kicker">ALTEA · TASKS V1</span>
            <h2>Задачи команды</h2>
            <p>Загружаем командные задачи и не показываем неполный промежуточный слой.</p>
          </div>
          <div class="task-design-actions">
            <button type="button" disabled>Загрузка</button>
          </div>
        </div>
        <div class="task-design-skeleton" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
      </section>
    `;
  }

  function renderShell() {
    clearStaleRecentMove();
    const filters = ensureFilters();
    const platform = globalPlatform();
    if (isTaskDataHydrating()) {
      const markup = renderHydratingShell(platform);
      return {
        signature: stableHash(markup),
        markup
      };
    }
    const tasks = taskList().filter(Boolean).filter(isTaskDisplayable);
    if (shouldHoldSparseBoot(tasks)) {
      const markup = renderHydratingShell(platform);
      return {
        signature: stableHash(markup),
        markup
      };
    }
    const filtered = filteredTasks(tasks);
    const markup = `
      <section class="task-design-v1 platform-${escapeHtml(platform)}" data-task-calendar-design-v1 data-task-kanban-v1 data-version="${escapeHtml(VERSION)}">
        ${renderFilters(tasks, filtered, filters, platform)}
        ${renderCreateDrawer(platform)}
        ${TASK_UI.view === 'list' ? renderList(filtered) : renderBoard(filtered)}
      </section>
    `;
    return {
      signature: renderSignature(tasks, filtered, filters, platform),
      markup
    };
  }

  function ensureStyle() {
    if (document.getElementById('altea-task-design-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'altea-task-design-v1-style';
    style.textContent = `
      .task-design-v1,.task-design-v1 *{box-sizing:border-box;min-width:0}
      .task-design-v1{--task-bg:#070706;--task-panel:#12100d;--task-panel2:#17130f;--task-line:#302a22;--task-line2:#4a3f31;--task-text:#f7f1e7;--task-muted:#9f9688;--task-gold:#dbc7a3;--task-danger:#ff756b;--task-good:#72e09a;display:grid;gap:12px;margin-top:0;color:var(--task-text);animation:taskDesignIn .28s cubic-bezier(.2,.7,.2,1) both}
      .task-design-v1 button,.task-design-v1 input,.task-design-v1 select,.task-design-v1 textarea{font:inherit}
      .task-design-toolbar,.task-design-create,.task-design-lane,.task-design-list{border:1px solid var(--task-line);border-radius:8px;background:linear-gradient(135deg,rgba(219,199,163,.08),rgba(255,255,255,.018) 42%,rgba(0,0,0,.2)),var(--task-panel);box-shadow:0 18px 54px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.045)}
      .task-design-toolbar{position:relative;top:auto;z-index:2;padding:12px 14px 11px;backdrop-filter:blur(16px)}
      .task-design-toolbar-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:12px}
      .task-design-kicker{display:block;color:var(--task-gold);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}
      .task-design-toolbar h2,.task-design-create h3{margin:4px 0 0;font:500 30px/1.05 Georgia,serif}
      .task-design-toolbar p{max-width:820px;margin:6px 0 0;color:var(--task-muted);font-size:12px;line-height:1.45}
      .task-design-mode{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
      .task-design-mode button,.task-design-reset,.task-design-create-actions button,.task-design-snapshot button{min-height:34px;border:1px solid var(--task-line2);border-radius:999px;background:#0b0907;color:var(--task-text);padding:8px 13px;cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease}
      .task-design-mode button:hover,.task-design-reset:hover,.task-design-create-actions button:hover,.task-design-snapshot button:hover{border-color:rgba(219,199,163,.62);transform:translateY(-1px)}
      .task-design-mode button.active,.task-design-mode button.primary,.task-design-create-actions button[data-task-create-submit]{border-color:rgba(219,199,163,.78);background:linear-gradient(180deg,#ead8b7,#a98448);color:#130f0a;font-weight:900;box-shadow:0 12px 26px rgba(219,199,163,.22)}
      .task-design-snapshot{display:grid;grid-template-columns:repeat(5,minmax(100px,1fr)) minmax(150px,.9fr);gap:8px;margin-bottom:12px}
      .task-design-snapshot button,.task-design-platform-badge{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(219,199,163,.16);border-radius:8px;background:#0b0907;padding:10px 12px;color:var(--task-text)}
      .task-design-snapshot strong{font-size:22px;line-height:1}
      .task-design-snapshot span,.task-design-platform-badge span{color:var(--task-muted);font-size:10px;font-weight:900;text-transform:uppercase}
      .task-design-platform-badge i{width:9px;height:9px;border-radius:50%;background:var(--platform,#dbc7a3);box-shadow:0 0 0 4px color-mix(in srgb,var(--platform,#dbc7a3) 18%,transparent),0 0 18px color-mix(in srgb,var(--platform,#dbc7a3) 48%,transparent)}
      .task-design-filters{display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(7,minmax(128px,1fr)) auto;gap:8px;align-items:end}
      .task-design-filter{display:grid;gap:6px}
      .task-design-filter span{color:var(--task-muted);font-size:10px;font-weight:900;text-transform:uppercase}
      .task-design-filter input,.task-design-filter select,.task-design-create input,.task-design-create select,.task-design-create textarea{width:100%;min-height:38px;border:1px solid var(--task-line);border-radius:8px;background:#050403;color:var(--task-text);padding:9px 10px;outline:none}
      .task-design-filter input:focus,.task-design-filter select:focus,.task-design-create input:focus,.task-design-create textarea:focus{border-color:rgba(219,199,163,.62);box-shadow:0 0 0 3px rgba(219,199,163,.1)}
      .task-design-result-line{margin-top:10px;color:rgba(247,241,231,.54);font-size:11px}
      .task-design-create{padding:12px 14px;animation:taskDesignIn .2s ease both}
      .task-design-create form{display:grid;grid-template-columns:minmax(260px,1fr) minmax(300px,1.1fr) minmax(240px,.8fr);gap:10px;align-items:start}
      .task-design-create-head{grid-column:1/-1;display:flex;align-items:end;justify-content:space-between;gap:12px}
      .task-design-create-head h3{font-size:24px}
      .task-design-create label{display:grid;gap:6px}
      .task-design-create label span,.task-design-create-actions span{color:var(--task-muted);font-size:10px;font-weight:900;text-transform:uppercase}
      .task-design-create textarea{resize:vertical}
      .task-design-article-field textarea{min-height:88px}
      .task-design-create-grid{display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:8px}
      .task-design-file-field{grid-column:1/-1}
      .task-design-create-actions{grid-column:1/-1;display:flex;align-items:center;justify-content:flex-end;gap:8px}
      .task-design-board{display:grid;grid-template-columns:repeat(6,minmax(204px,1fr));gap:10px;overflow-x:auto;padding-bottom:2px;align-items:stretch}
      .task-design-lane{min-height:520px;display:grid;grid-template-rows:82px minmax(0,1fr);overflow:hidden}
      .task-design-lane.is-over{border-color:rgba(219,199,163,.82);background:linear-gradient(135deg,rgba(219,199,163,.12),rgba(255,255,255,.02)),var(--task-panel2)}
      .task-design-lane header{display:grid;grid-template-columns:minmax(0,1fr) 38px;align-items:start;gap:10px;height:82px;padding:13px 12px 11px;border-bottom:1px solid rgba(219,199,163,.12);background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,0))}
      .task-design-lane-title{display:grid;align-content:start;gap:4px;min-height:54px}
      .task-design-lane h3{margin:0;font-size:16px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .task-design-lane p{min-height:28px;margin:0;color:var(--task-muted);font-size:10px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .task-design-lane b{display:grid;place-items:center;width:38px;height:30px;border:1px solid rgba(219,199,163,.2);border-radius:999px;background:rgba(219,199,163,.08);font-size:13px;line-height:1}
      .task-design-dropzone{display:flex;flex-direction:column;gap:10px;padding:10px;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(219,199,163,.32) rgba(255,255,255,.035)}
      .task-design-dropzone::-webkit-scrollbar{width:8px}
      .task-design-dropzone::-webkit-scrollbar-track{background:rgba(255,255,255,.035);border-radius:999px}
      .task-design-dropzone::-webkit-scrollbar-thumb{background:rgba(219,199,163,.26);border-radius:999px}
      .task-design-card{position:relative;overflow:hidden;display:grid;grid-template-rows:auto auto minmax(44px,auto) auto auto;align-content:start;border:1px solid rgba(219,199,163,.16);border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.012)),#0d0b09;padding:11px 11px 10px 14px;cursor:grab;box-shadow:0 12px 28px rgba(0,0,0,.25);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
      .task-design-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--card-color,#dbc7a3);box-shadow:0 0 22px var(--card-color,#dbc7a3)}
      .task-design-card:hover,.task-design-card:focus{outline:0;transform:translateY(-2px);border-color:rgba(219,199,163,.54);box-shadow:0 18px 34px rgba(0,0,0,.3)}
      .task-design-card.is-dragging{opacity:.55;cursor:grabbing}
      .task-design-card.is-recently-moved{border-color:rgba(114,224,154,.72);box-shadow:0 0 0 1px rgba(114,224,154,.18),0 18px 38px rgba(0,0,0,.36),0 0 28px rgba(114,224,154,.18)}
      .task-design-card.is-recently-moved::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(90deg,transparent,rgba(114,224,154,.16),transparent);animation:taskMovedPulse 1.8s ease-out 1;pointer-events:none}
      .task-design-card.is-overdue{border-color:rgba(255,117,107,.44);background:linear-gradient(180deg,rgba(125,29,24,.26),rgba(255,255,255,.012)),#100807}
      .task-design-card-top,.task-design-card-meta,.task-design-card-footer{display:flex;justify-content:space-between;gap:8px;align-items:center}
      .task-design-card-top span,.task-design-card-meta span,.task-design-card-footer span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .task-design-card strong{display:-webkit-box;min-height:32px;margin-top:9px;font-size:13px;line-height:1.25;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .task-design-card p{display:-webkit-box;min-height:44px;margin:7px 0 10px;color:rgba(247,241,231,.64);font-size:11px;line-height:1.38;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .task-design-card small{display:block;margin-top:7px;color:rgba(247,241,231,.42);font-size:10px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
      .task-design-empty,.task-design-more{display:grid;place-items:center;min-height:92px;border:1px dashed rgba(219,199,163,.18);border-radius:8px;background:rgba(0,0,0,.12);color:rgba(247,241,231,.42);font-size:12px;text-align:center}
      .task-design-more{min-height:38px}
      .task-design-list{overflow:auto}
      .task-design-list table{width:100%;border-collapse:collapse;min-width:1020px}
      .task-design-list th,.task-design-list td{border-bottom:1px solid rgba(219,199,163,.1);padding:12px;text-align:left;vertical-align:top}
      .task-design-list th{position:sticky;top:0;background:#0b0907;color:var(--task-muted);font-size:10px;text-transform:uppercase;z-index:1}
      .task-design-list tr{cursor:pointer;transition:background .14s ease}
      .task-design-list tr:hover{background:rgba(219,199,163,.06)}
      .task-design-list td strong{display:block;font-size:13px}
      .task-design-list td span{display:block;margin-top:4px;color:rgba(247,241,231,.5);font-size:11px}
      body.task-detail-open{overflow:hidden}
      .task-detail-backdrop{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:26px;background:rgba(0,0,0,.68);backdrop-filter:blur(18px)}
      .task-detail-dialog{--task-line:#302a22;--task-text:#f7f1e7;--task-muted:#9f9688;--task-gold:#dbc7a3;position:relative;width:min(1180px,calc(100vw - 44px));max-height:calc(100vh - 44px);overflow:auto;border:1px solid rgba(219,199,163,.24);border-radius:10px;background:linear-gradient(135deg,rgba(219,199,163,.12),rgba(80,40,120,.1) 52%,rgba(0,0,0,.28)),#0b0907;color:var(--task-text);box-shadow:0 34px 100px rgba(0,0,0,.55);padding:18px;animation:taskDesignIn .2s ease both}
      .task-detail-close{position:absolute;right:14px;top:12px;width:34px;height:34px;border:1px solid rgba(219,199,163,.26);border-radius:999px;background:#090705;color:var(--task-text);cursor:pointer}
      .task-detail-head{display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:16px;margin-right:42px;margin-bottom:14px}
      .task-detail-head h2{margin:4px 0 6px;font:500 30px/1.06 Georgia,serif}
      .task-detail-head p{margin:0;color:rgba(247,241,231,.68);line-height:1.45}
      .task-detail-status-card,.task-detail-sku-card,.task-detail-files,.task-detail-history{border:1px solid rgba(219,199,163,.16);border-radius:8px;background:rgba(255,255,255,.035);padding:12px}
      .task-detail-status-card{display:grid;align-content:center;gap:6px}
      .task-detail-status-card span,.task-detail-status-card em,.task-detail-form label span,.task-detail-sku-card span,.task-detail-section-head span{color:var(--task-muted);font-size:10px;font-weight:900;text-transform:uppercase;font-style:normal}
      .task-detail-status-card strong{font-size:20px}
      .task-detail-status-card .danger{color:#ff756b}
      .task-detail-form{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px}
      .task-detail-form label{display:grid;gap:6px}
      .task-detail-form label.wide,.task-detail-sku-card,.task-detail-actions{grid-column:span 2}
      .task-detail-form input,.task-detail-form select,.task-detail-form textarea,.task-detail-comment-row textarea{width:100%;min-height:38px;border:1px solid var(--task-line);border-radius:8px;background:#050403;color:var(--task-text);padding:9px 10px;outline:none}
      .task-detail-form textarea{resize:vertical}
      .task-detail-actions{display:flex;flex-wrap:wrap;align-items:end;gap:8px}
      .task-detail-actions button,.task-detail-comment-row button,.task-detail-file-upload span,.task-detail-file-row a,.task-detail-sku-card button{min-height:34px;border:1px solid rgba(219,199,163,.28);border-radius:999px;background:#0b0907;color:var(--task-text);padding:8px 12px;cursor:pointer;text-decoration:none}
      .task-detail-actions button.is-active{border-color:rgba(219,199,163,.72);background:rgba(219,199,163,.14);box-shadow:0 0 18px rgba(219,199,163,.16)}
      .task-detail-actions .primary,.task-detail-comment-row button,.task-detail-file-upload span{background:linear-gradient(180deg,#ead8b7,#a98448);color:#130f0a;font-weight:900}
      .task-detail-sku-card p{margin:6px 0 10px;color:rgba(247,241,231,.62);font-size:12px}
      .task-detail-sku-list{display:grid;gap:6px;margin-bottom:10px;max-height:150px;overflow:auto}
      .task-detail-sku-row{display:grid!important;grid-template-columns:160px minmax(0,1fr);gap:10px;text-align:left;border-radius:7px!important;background:rgba(0,0,0,.22)!important}
      .task-detail-sku-row strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .task-detail-sku-row span{font-size:11px;color:rgba(247,241,231,.62);text-transform:none}
      .task-detail-files,.task-detail-history{margin-top:12px}
      .task-detail-section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}
      .task-detail-section-head h3,.task-detail-history h3{margin:0 0 10px;font-size:15px}
      .task-detail-file-row,.task-detail-history-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid rgba(219,199,163,.1);padding:10px 0}
      .task-detail-file-row:first-child,.task-detail-history-row:first-child{border-top:0}
      .task-detail-file-row strong,.task-detail-history-row strong{display:block;font-size:12px}
      .task-detail-file-row span,.task-detail-history-row span,.task-detail-file-row em{display:block;color:rgba(247,241,231,.58);font-size:11px;font-style:normal}
      .task-detail-file-upload{display:inline-flex;margin-top:8px;cursor:pointer}
      .task-detail-file-upload input{display:none}
      .task-detail-comment-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-bottom:8px}
      .task-detail-empty{border:1px dashed rgba(219,199,163,.2);border-radius:8px;padding:12px;color:rgba(247,241,231,.58);font-size:12px}
      @keyframes taskDesignIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      @keyframes taskMovedPulse{from{opacity:.9;transform:translateX(-40%)}to{opacity:0;transform:translateX(40%)}}
      @media(max-width:1520px){.task-design-filters{grid-template-columns:minmax(220px,1.4fr) repeat(3,minmax(132px,1fr));}.task-design-reset{min-height:38px}.task-design-board{grid-template-columns:repeat(6,224px)}}
      @media(max-width:900px){.task-design-toolbar-top,.task-design-create form,.task-detail-head,.task-detail-form{display:block}.task-design-mode,.task-design-create-actions{justify-content:flex-start;margin-top:10px}.task-design-snapshot{grid-template-columns:repeat(2,1fr)}.task-design-filters{grid-template-columns:1fr}.task-design-board{grid-template-columns:repeat(6,220px)}.task-detail-form label,.task-detail-sku-card,.task-detail-actions{margin-top:10px}.task-detail-comment-row{grid-template-columns:1fr}.task-detail-backdrop{padding:12px}.task-detail-dialog{width:calc(100vw - 24px);max-height:calc(100vh - 24px)}}
      @media(prefers-reduced-motion:reduce){.task-design-v1,.task-design-v1 *{animation:none!important;transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function closeTaskDetail() {
    document.querySelector('[data-task-detail-modal]')?.remove();
    document.body.classList.remove('task-detail-open');
  }

  function renderTaskDetailHistory(task) {
    const history = taskHistory(task).slice(0, 12);
    if (!history.length) return '<div class="task-detail-empty">Истории пока нет.</div>';
    return history.map((item) => `
      <div class="task-detail-history-row">
        <strong>${escapeHtml(formatDate(String(item.createdAt || '').slice(0, 10)))}</strong>
        <span>${escapeHtml(item.cleanText || item.text || '')}</span>
      </div>
    `).join('');
  }

  function openSkuFromTask(task) {
    const articleKey = String(task?.articleKey || taskArticleKeys(task)[0] || '').trim();
    if (!articleKey) return false;
    try {
      closeTaskDetail();
    } catch (_) {}
    try {
      if (typeof window.openSkuModal === 'function' && window.openSkuModal(articleKey)) return true;
    } catch (_) {}
    try {
      const state = appState();
      state.filters = state.filters && typeof state.filters === 'object' ? state.filters : {};
      state.filters.search = articleKey;
      state.filters.focus = 'all';
      state.filters.assignment = 'all';
      state.skuWorkspaceMode = 'registry';
    } catch (_) {}
    try {
      if (typeof window.skuJourneyHandleAction === 'function') {
        window.skuJourneyHandleAction('open-registry', { search: articleKey });
      } else if (typeof window.skuJourneyApplyRegistryFocus === 'function') {
        window.skuJourneyApplyRegistryFocus('all', articleKey);
      } else if (typeof window.setView === 'function') {
        window.setView('sku-contour', { preserveSkuWorkspaceMode: true });
      } else {
        window.location.hash = '#sku-contour';
      }
    } catch (_) {
      try {
        window.location.hash = '#sku-contour';
      } catch (__) {}
    }
    window.setTimeout(() => {
      try {
        if (typeof window.renderSkuRegistry === 'function') window.renderSkuRegistry('view-sku-contour');
        const root = document.getElementById('view-sku-contour') || document;
        const input = root.querySelector('#skuSearchInput, [data-sku-search], input[type="search"], input[name="search"]');
        if (input && input.value !== articleKey) {
          input.value = articleKey;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const row = Array.from(root.querySelectorAll('[data-open-sku]'))
          .find((node) => String(node.getAttribute('data-open-sku') || '') === articleKey);
        row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        row?.classList?.add('task-open-target');
      } catch (_) {}
    }, 120);
    return true;
  }

  function openTask(taskId) {
    const task = taskById(taskId);
    if (!task) return;
    closeTaskDetail();
    const platform = normalizePlatform('', task);
    const modal = document.createElement('div');
    modal.className = 'task-detail-backdrop';
    modal.setAttribute('data-task-detail-modal', '');
    modal.innerHTML = `
      <section class="task-detail-dialog platform-${escapeHtml(platform)}" role="dialog" aria-modal="true" aria-label="Задача">
        <button class="task-detail-close" type="button" data-task-detail-close aria-label="Закрыть">×</button>
        <header class="task-detail-head">
          <div>
            <span class="task-design-kicker">${taskSource(task) === 'auto' ? 'Автосигнал' : 'Ручная задача'} · ${escapeHtml(platformLabel(platform))}</span>
            <h2>${escapeHtml(task.title || task.entityLabel || 'Задача')}</h2>
            <p>${escapeHtml(task.nextAction || task.reason || 'Описание пока не заполнено.')}</p>
          </div>
          <div class="task-detail-status-card">
            <span>Статус</span>
            <strong>${escapeHtml(statusLabel(task))}</strong>
            <em class="${isOverdue(task) ? 'danger' : ''}">${escapeHtml(formatDate(taskDate(task)))}</em>
          </div>
        </header>
        <form class="task-detail-form" data-task-detail-form data-task-id="${escapeHtml(task.id || '')}">
          <label><span>Название</span><input name="title" value="${escapeHtml(task.title || '')}"></label>
          <label><span>Артикулы / SKU</span><textarea name="articleKeys" rows="4" placeholder="Вставьте несколько артикулов списком">${escapeHtml(taskArticleTextareaValue(task))}</textarea></label>
          <label><span>Owner</span><input name="owner" value="${escapeHtml(taskOwner(task) || '')}"></label>
          <label><span>Срок</span><input name="due" type="date" value="${escapeHtml(taskDate(task) || '')}"></label>
          <label><span>Статус</span><select name="status">${statusOptionsHtml(task.status || 'new')}</select></label>
          <label><span>Приоритет</span><select name="priority">${PRIORITY_OPTIONS.filter(([key]) => key !== 'all').map(([key, label]) => `<option value="${escapeHtml(key)}" ${String(task.priority || 'medium') === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
          <label><span>Тип</span><select name="type">${TYPE_OPTIONS.filter(([key]) => key !== 'all').map(([key, label]) => `<option value="${escapeHtml(key)}" ${String(task.type || 'general') === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
          <label><span>Площадка</span><select name="platform">${Object.entries(PLATFORM_LABELS).filter(([key]) => key !== 'all').map(([key, label]) => `<option value="${escapeHtml(key)}" ${platform === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
          <label class="wide"><span>Первый шаг / результат</span><textarea name="nextAction" rows="3">${escapeHtml(task.nextAction || '')}</textarea></label>
          <label class="wide"><span>Контекст / доп. описание</span><textarea name="reason" rows="4">${escapeHtml(task.reason || '')}</textarea></label>
          <div class="task-detail-sku-card">
            <span>Привязка</span>
            <strong>${escapeHtml(taskArticleSummary(task, 2))}</strong>
            <p>Нажмите на артикул, чтобы перейти к SKU. Можно сохранить несколько позиций в одной задаче.</p>
            <div class="task-detail-sku-list">${taskSkuListMarkup(task)}</div>
            <button type="button" data-task-detail-open-sku ${taskArticleKeys(task).length ? '' : 'disabled'}>Открыть первый SKU</button>
          </div>
          <div class="task-detail-actions">
            <button type="button" data-task-detail-status="new">Новые</button>
            <button type="button" data-task-detail-status="in_progress">В работе</button>
            <button type="button" data-task-detail-status="waiting_team">Ждёт команду</button>
            <button type="button" data-task-detail-status="waiting_rop">Ожидает РОП</button>
            <button type="button" data-task-detail-status="waiting_decision">На решение</button>
            <button type="button" data-task-detail-status="done">Готово</button>
            <button type="submit" class="primary">Сохранить</button>
          </div>
        </form>
        <section class="task-detail-files">
          <div class="task-detail-section-head">
            <h3>Файлы к задаче</h3>
            <span>${taskAttachments(task.id).length} файлов</span>
          </div>
          <div data-task-detail-files-list>${renderTaskAttachments(task.id)}</div>
          <label class="task-detail-file-upload">
            <input type="file" multiple data-task-detail-files accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.png,.jpg,.jpeg">
            <span>Прикрепить файл</span>
          </label>
        </section>
        <section class="task-detail-history">
          <h3>История и комментарии</h3>
          <div class="task-detail-comment-row">
            <textarea data-task-detail-comment rows="2" placeholder="Комментарий, что изменилось или что нужно проверить"></textarea>
            <button type="button" data-task-detail-add-comment>Добавить</button>
          </div>
          <div data-task-detail-history-list>${renderTaskDetailHistory(task)}</div>
        </section>
      </section>
    `;
    document.body.appendChild(modal);
    document.body.classList.add('task-detail-open');
    appState().activeTaskId = task.id;
    modal.querySelector('input[name="title"]')?.focus();
  }

  function taskPatchFromForm(form) {
    const data = new FormData(form);
    const articleKeys = parseArticleKeys(data.get('articleKeys') || data.get('articleKey') || '');
    const articleKey = articleKeys[0] || '';
    const sku = findSku(articleKey);
    const original = taskById(form?.getAttribute('data-task-id') || '') || {};
    const platform = String(data.get('platform') || original.platform || 'cross');
    const owner = resolveTaskOwner({ ...original, owner: data.get('owner') || '', platform }, sku, platform);
    return {
      title: String(data.get('title') || '').trim() || 'Новая задача',
      articleKey,
      articleKeys,
      entityLabel: sku
        ? `${sku.article || sku.articleKey || articleKey} · ${skuTitle(sku)}${articleKeys.length > 1 ? ` +${articleKeys.length - 1}` : ''}`
        : taskArticleSummary({ articleKey, articleKeys }),
      owner,
      due: String(data.get('due') || '').trim(),
      status: String(data.get('status') || 'new'),
      priority: String(data.get('priority') || 'medium'),
      type: String(data.get('type') || 'general'),
      platform,
      nextAction: String(data.get('nextAction') || '').trim(),
      reason: String(data.get('reason') || '').trim()
    };
  }

  function refreshOpenTaskDetail(taskId) {
    window.setTimeout(() => openTask(taskId), 50);
  }

  function syncTaskDetailStatus(task, form = null) {
    if (!task?.id) return;
    const modal = form?.closest?.('[data-task-detail-modal]') || document.querySelector('[data-task-detail-modal]');
    if (!modal) return;
    const statusSelect = form?.querySelector?.('select[name="status"]') || modal.querySelector('[data-task-detail-form] select[name="status"]');
    if (statusSelect) statusSelect.value = task.status || 'new';
    const statusCard = modal.querySelector('.task-detail-status-card');
    const statusTitle = statusCard?.querySelector('strong');
    if (statusTitle) statusTitle.textContent = statusLabel(task);
    const statusDate = statusCard?.querySelector('em');
    if (statusDate) {
      statusDate.textContent = formatDate(taskDate(task));
      statusDate.classList.toggle('danger', isOverdue(task));
    }
    modal.querySelectorAll('[data-task-detail-status]').forEach((button) => {
      const active = String(button.getAttribute('data-task-detail-status') || '') === String(task.status || '');
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const historyList = modal.querySelector('[data-task-detail-history-list]');
    if (historyList) historyList.innerHTML = renderTaskDetailHistory(task);
  }

  async function saveTaskDetail(form) {
    const taskId = form?.getAttribute('data-task-id') || '';
    if (!taskId) return;
    const updated = updateTaskLocal(taskId, taskPatchFromForm(form), 'Задача обновлена из карточки задачи.');
    if (updated) refreshOpenTaskDetail(updated.id);
  }

  async function setTaskStatusFromDetail(taskId, status, form = null) {
    if (!taskId || !status) return;
    const patch = form ? { ...taskPatchFromForm(form), status } : { status };
    const updated = updateTaskLocal(taskId, patch, `Статус изменен: ${statusLabel({ status })}.`);
    if (updated) syncTaskDetailStatus(updated, form);
  }

  function addTaskDetailComment(modal) {
    const form = modal?.querySelector('[data-task-detail-form]');
    const taskId = form?.getAttribute('data-task-id') || '';
    const task = taskById(taskId);
    const textarea = modal?.querySelector('[data-task-detail-comment]');
    const text = String(textarea?.value || '').trim();
    if (!task || !text) {
      textarea?.focus();
      return;
    }
    addTaskHistory(materializeTask(task), 'comment', text);
    savePortalState('task-kanban-v1-comment');
    if (textarea) textarea.value = '';
    refreshOpenTaskDetail(task.id);
  }

  function bindTaskDetailEvents() {
    if (detailEventsBound) return;
    detailEventsBound = true;
    document.addEventListener('click', (event) => {
      const modal = event.target.closest?.('[data-task-detail-modal]');
      if (event.target.matches?.('[data-task-detail-modal]') || event.target.closest?.('[data-task-detail-close]')) {
        event.preventDefault();
        closeTaskDetail();
        return;
      }
      if (!modal) return;
      const statusButton = event.target.closest?.('[data-task-detail-status]');
      if (statusButton) {
        event.preventDefault();
        const form = modal.querySelector('[data-task-detail-form]');
        setTaskStatusFromDetail(form?.getAttribute('data-task-id') || '', statusButton.getAttribute('data-task-detail-status') || '', form);
        return;
      }
      if (event.target.closest?.('[data-task-detail-add-comment]')) {
        event.preventDefault();
        addTaskDetailComment(modal);
        return;
      }
      if (event.target.closest?.('[data-task-detail-open-sku]')) {
        event.preventDefault();
        const task = taskById(modal.querySelector('[data-task-detail-form]')?.getAttribute('data-task-id') || '');
        openSkuFromTask(task);
        return;
      }
      const articleButton = event.target.closest?.('[data-task-detail-open-article]');
      if (articleButton) {
        event.preventDefault();
        const task = taskById(modal.querySelector('[data-task-detail-form]')?.getAttribute('data-task-id') || '');
        openSkuFromTask({ ...(task || {}), articleKey: articleButton.getAttribute('data-task-detail-open-article') || '' });
      }
    }, true);
    document.addEventListener('change', (event) => {
      const input = event.target.closest?.('[data-task-detail-files]');
      if (!input) return;
      const modal = input.closest('[data-task-detail-modal]');
      const taskId = modal?.querySelector('[data-task-detail-form]')?.getAttribute('data-task-id') || '';
      const files = Array.from(input.files || []);
      if (!taskId || !files.length) return;
      handleTaskFiles(taskId, files)
        .then(() => refreshOpenTaskDetail(taskId))
        .catch((error) => {
          console.error('[task-kanban-v1] attach files', error);
          alert(error?.message || 'Не удалось прикрепить файл.');
        })
        .finally(() => { input.value = ''; });
    }, true);
    document.addEventListener('submit', (event) => {
      const form = event.target.closest?.('[data-task-detail-form]');
      if (!form) return;
      event.preventDefault();
      event.stopPropagation();
      saveTaskDetail(form);
    }, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.querySelector('[data-task-detail-modal]')) closeTaskDetail();
    });
  }

  async function moveTask(taskId, laneStatus) {
    if (!taskId || !laneStatus) return;
    const targetLane = String(laneStatus || 'new');
    const status = targetLane === 'waiting' ? 'waiting_rop' : targetLane === 'no_date' ? 'new' : targetLane;
    const task = taskList().find((item) => String(item?.id || '') === String(taskId));
    if (task && laneFor(task) === laneFor({ ...task, status })) return;
    const patch = { status };
    if (targetLane === 'no_date') {
      Object.assign(patch, {
        due: '',
        deadline: '',
        dueDate: '',
        due_date: '',
        endDate: '',
        end_date: '',
        dateTo: '',
        date_to: '',
        date: ''
      });
    }
    const updated = updateTaskLocal(taskId, patch, `Task moved by drag and drop: ${status}.`);
    if (updated?.id) {
      markTaskMoved(updated.id);
      const filters = ensureFilters();
      savePortalState('task-kanban-v1-move-visibility');
    }
    if (typeof window.updateTaskStatus === 'function') {
      try {
        Promise.resolve(window.updateTaskStatus(taskId, status)).catch((error) => {
          console.warn('[task-kanban-v1] background updateTaskStatus failed', error);
        });
      } catch (error) {
        console.warn('[task-kanban-v1] background updateTaskStatus failed', error);
      }
    }
    queueEnhance(true);
  }

  async function createTaskFromForm(form) {
    const draft = updateCreateDraft(form);
    const data = new FormData(form);
    const articleKeys = parseArticleKeys(fieldValue(data, draft, 'articleKeys') || fieldValue(data, draft, 'articleKey'));
    const articleKey = articleKeys[0] || '';
    const platform = String(fieldValue(data, draft, 'platform') || globalPlatform() || 'cross');
    const sku = findSku(articleKey);
    const payload = {
      title: String(fieldValue(data, draft, 'title')).trim(),
      nextAction: String(fieldValue(data, draft, 'nextAction')).trim(),
      reason: String(fieldValue(data, draft, 'reason')).trim(),
      articleKey,
      articleKeys,
      owner: resolveTaskOwner({ owner: fieldValue(data, draft, 'owner'), platform, source: 'manual' }, sku, platform),
      due: String(fieldValue(data, draft, 'due')).trim(),
      type: String(fieldValue(data, draft, 'type') || 'general'),
      priority: String(fieldValue(data, draft, 'priority') || 'medium'),
      platform,
      entityLabel: ''
    };
    payload.entityLabel = sku
      ? `${sku.article || sku.articleKey || articleKey} · ${skuTitle(sku)}${articleKeys.length > 1 ? ` +${articleKeys.length - 1}` : ''}`
      : taskArticleSummary(payload);
    let task = {
      id: taskId(),
      source: 'manual',
      status: 'new',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...payload
    };
    storageTasks().unshift(task);
    savePortalState('task-design-create');
    if (task) {
      const current = materializeTask(task) || task;
      Object.assign(current, {
        ...payload,
        id: current.id || task.id,
        status: current.status || task.status || 'new',
        source: current.source || task.source || 'manual',
        createdAt: current.createdAt || task.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      task = current;
      rememberTask(task);
      addTaskHistory(task, 'created', 'Задача создана из вкладки Задачи.');
      const filesInput = form.querySelector('input[name="files"]');
      await handleTaskFiles(task.id, filesInput?.files || []);
      persistTaskLater(task);
      savePortalState('task-kanban-v1-create');
    }
    TASK_UI.createOpen = false;
    TASK_UI.draft = {};
    saveUi();
    queueEnhance(true);
    if (task?.id) window.setTimeout(() => openTask(task.id), 120);
  }

  async function submitCreateTask(form) {
    if (!form || form.dataset.taskSubmitting === '1') return;
    form.dataset.taskSubmitting = '1';
    try {
      await createTaskFromForm(form);
    } finally {
      delete form.dataset.taskSubmitting;
    }
  }

  function bindTaskCreateEvents() {
    if (createEventsBound) return;
    createEventsBound = true;
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-task-create-submit]');
      if (!button) return;
      const form = button.closest('form[data-task-create-form]');
      if (!form || !form.closest('[data-task-calendar-design-v1]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      submitCreateTask(form).catch((error) => {
        console.error('[task-kanban-v1] create task', error);
        alert(error?.message || 'Не удалось создать задачу.');
      });
    }, true);
    document.addEventListener('input', (event) => {
      const form = event.target.closest?.('[data-task-create-form]');
      if (!form || !form.closest('[data-task-calendar-design-v1]')) return;
      updateCreateDraft(form);
    }, true);
    document.addEventListener('change', (event) => {
      const form = event.target.closest?.('[data-task-create-form]');
      if (!form || !form.closest('[data-task-calendar-design-v1]')) return;
      updateCreateDraft(form);
    }, true);
    document.addEventListener('submit', (event) => {
      const form = event.target.closest?.('[data-task-create-form]');
      if (!form || !form.closest('[data-task-calendar-design-v1]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      submitCreateTask(form).catch((error) => {
        console.error('[task-kanban-v1] create task', error);
        alert(error?.message || 'Не удалось создать задачу.');
      });
    }, true);
  }

  function setFilter(name, value) {
    const filters = ensureFilters();
    if (name === 'owner') filters[name] = normalizeOwnerName(value) || 'all';
    else if (name === 'platform') {
      filters[name] = normalizePlatform(value || 'all') || 'all';
      filters.__platformManual = true;
      filters.__platformSyncedFromPortal = '';
    }
    else filters[name] = value;
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
      source: 'all',
      platform: readPortalPlatform()
    });
    filters.__platformManual = false;
    filters.__platformSyncedFromPortal = filters.platform;
    invalidateTaskListCache();
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
      await submitCreateTask(form);
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
    renderingControl = true;
    try {
      viewRoot.classList.add('task-route-locked');
      startControlObserver();
      ensureStyle();
      const { signature, markup } = renderShell();
      const current = viewRoot.querySelector('[data-task-calendar-design-v1]');
      if (current && current.dataset.renderSignature === signature && viewRoot.children.length === 1) {
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
    } finally {
      renderingControl = false;
    }
  }

  function cleanupLegacyControl(viewRoot) {
    if (!viewRoot?.querySelector('[data-task-calendar-design-v1]')) return;
    viewRoot.querySelectorAll('.section-title.control-simple-title,.control-simple-title,.control-simple-panel,[data-task-lazy-panel],.control-simple-platform-board,.control-simple-workstream-lane,.control-simple-workspace,.control-simple-create,.control-simple-filters,.control-simple-filterbar,.control-simple-queue,.control-simple-task,.task-center-queues,.task-center-hotfix,[data-control-simple-root]').forEach((node) => {
      if (!node.closest('[data-task-calendar-design-v1]')) node.remove();
    });
  }

  function queueEnhance(force = false) {
    enhanceQueuedForce = enhanceQueuedForce || force;
    if (enhanceQueued) return;
    enhanceQueued = true;
    const run = () => {
      const shouldForce = enhanceQueuedForce;
      enhanceQueued = false;
      enhanceQueuedForce = false;
      enhanceControl(shouldForce);
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
      if (renderingControl) return;
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
        queueEnhance(true);
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
    bindTaskDetailEvents();
    bindTaskCreateEvents();
    window.__ALTEA_TASK_KANBAN_INVALIDATE__ = invalidateTaskListCache;
    window.__ALTEA_TASK_KANBAN_RENDER__ = function renderTaskKanbanNow() {
      enhanceControl(true);
      return root();
    };
    window.openTaskModal = openTask;
    window.renderTaskModal = openTask;
    const installed = installWrapper();
    if (!installed) window.setTimeout(installWrapper, 450);
    [0, 320].forEach((delay) => window.setTimeout(() => queueEnhance(delay === 0), delay));
    const onRouteChange = (event) => {
      if (event?.type === 'altea:portal-storage-updated' || event?.type === 'altea:data-ready' || event?.type === 'altea:task-signals-ready') {
        invalidateTaskListCache();
      }
      if (event?.type === 'altea:marketplacechange') {
        syncPlatformFromPortal(platformFromMarketplaceEvent(event), { force: true });
        invalidateTaskListCache();
      }
      installWrapper();
      if (isControlRouteActive()) {
        startControlObserver();
        queueEnhance(true);
      }
    };
    window.addEventListener('altea:viewchange', onRouteChange);
    window.addEventListener('altea:data-ready', onRouteChange);
    window.addEventListener('altea:app-ready', onRouteChange);
    window.addEventListener('altea:task-signals-ready', onRouteChange);
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
