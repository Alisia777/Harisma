const state = {
  dashboard: null,
  skus: [],
  launches: [],
  meetings: [],
  storage: { comments: [], tasks: [] },
  filters: {
    search: '',
    segment: 'all',
    focus: 'all',
    market: 'all',
    owner: 'all',
    traffic: 'all',
    assignment: 'all'
  },
  controlFilters: {
    search: '',
    owner: 'all',
    status: 'active',
    type: 'all',
    platform: 'all',
    horizon: 'all',
    source: 'all'
  },
  activeView: 'dashboard',
  activeSku: null
};

const STORAGE_KEY = 'brand-portal-local-v1';
const ACTIVE_TASK_STATUSES = new Set(['new', 'in_progress', 'waiting_team', 'waiting_decision']);

const TASK_STATUS_META = {
  new: { label: 'Новая', kind: 'warn' },
  in_progress: { label: 'В работе', kind: 'info' },
  waiting_team: { label: 'Ждёт другого отдела', kind: 'warn' },
  waiting_decision: { label: 'Ждёт решения', kind: 'danger' },
  done: { label: 'Сделано', kind: 'ok' },
  cancelled: { label: 'Отменено', kind: '' }
};

const TASK_TYPE_META = {
  price_margin: 'Цена / маржа',
  content: 'Контент / карточка',
  traffic: 'Трафик / продвижение',
  supply: 'Остатки / поставка',
  returns: 'Отзывы / возвраты',
  assignment: 'Закрепление',
  launch: 'Новинка',
  general: 'Общее'
};

const PRIORITY_META = {
  critical: { label: 'Критично', kind: 'danger', rank: 4 },
  high: { label: 'Высокий', kind: 'warn', rank: 3 },
  medium: { label: 'Средний', kind: 'info', rank: 2 },
  low: { label: 'Низкий', kind: '', rank: 1 }
};

const fmt = {
  int(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value));
  },
  money(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value));
  },
  pct(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return `${(Number(value) * 100).toFixed(1)}%`;
  },
  num(value, digits = 1) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value));
  },
  date(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(value);
    }
  }
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function badge(text, kind = '') {
  return `<span class="chip ${kind}">${escapeHtml(text)}</span>`;
}

function scoreChip(score) {
  if (score >= 5) return badge(`Фокус ${score}`, 'danger');
  if (score >= 4) return badge(`Фокус ${score}`, 'warn');
  if (score >= 2) return badge(`Наблюдать ${score}`, 'info');
  return badge(`База ${score || 0}`);
}

function linkToSku(articleKey, label) {
  return `<button class="link-btn sku-pill" data-open-sku="${escapeHtml(articleKey)}">${escapeHtml(label || articleKey)}</button>`;
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  return response.json();
}

function uid(prefix = 'item') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function loadLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { comments: [], tasks: [] };
    const parsed = JSON.parse(raw);
    return {
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
    };
  } catch {
    return { comments: [], tasks: [] };
  }
}

function saveLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.storage));
}

function getSku(articleKey) {
  return state.skus.find((sku) => sku.articleKey === articleKey || sku.article === articleKey) || null;
}

function ownerName(sku) {
  return sku?.owner?.name || '';
}

function ownerCell(sku) {
  const owner = ownerName(sku);
  if (!owner) return `<div class="owner-cell"><strong>Не закреплён</strong><div class="muted small">Нужно назначить owner</div></div>`;
  return `<div class="owner-cell"><strong>${escapeHtml(owner)}</strong><div class="muted small">${escapeHtml(sku?.owner?.registryStatus || sku?.status || '—')}</div></div>`;
}

function trafficBadges(sku, emptyLabel = 'нет') {
  const chips = [];
  if (sku?.traffic?.kz) chips.push('<span class="chip info">🚀 КЗ</span>');
  if (sku?.traffic?.vk) chips.push('<span class="chip info">📣 VK</span>');
  return chips.length ? `<div class="badge-stack traffic-inline">${chips.join('')}</div>` : `<span class="muted small">${escapeHtml(emptyLabel)}</span>`;
}

function marginBadge(label, value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return badge(`${label} —`);
  return badge(`${label} ${fmt.pct(value)}`, Number(value) < 0 ? 'danger' : 'ok');
}

function currentWorkLabel() {
  if (state.filters.market === 'wb') return 'В работу WB = план < 80% + маржа WB < 0';
  if (state.filters.market === 'ozon') return 'В работу Ozon = план < 80% + маржа Ozon < 0';
  return 'В работу = план < 80% + отрицательная маржа';
}

function priorityBadges(sku) {
  const parts = [];
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) parts.push('<span class="chip danger">В работу WB/Ozon</span>');
  else if (sku?.flags?.toWorkWB) parts.push('<span class="chip danger">В работу WB</span>');
  else if (sku?.flags?.toWorkOzon) parts.push('<span class="chip danger">В работу Ozon</span>');
  else if (sku?.flags?.toWork) parts.push('<span class="chip danger">В работу</span>');
  if (sku?.flags?.wbNegativeMargin) parts.push('<span class="chip danger">WB маржа < 0</span>');
  if (sku?.flags?.ozonNegativeMargin) parts.push('<span class="chip danger">Ozon маржа < 0</span>');
  if (!sku?.flags?.assigned) parts.push('<span class="chip warn">Без owner</span>');
  if (sku?.flags?.hasKZ) parts.push('<span class="chip info">🚀 КЗ</span>');
  if (sku?.flags?.hasVK) parts.push('<span class="chip info">📣 VK</span>');
  parts.push(scoreChip(sku?.focusScore || 0));
  return `<div class="badge-stack">${parts.join('')}</div>`;
}

function commentTypeChip(type) {
  const map = { signal: 'info', risk: 'danger', focus: 'warn', idea: 'ok' };
  return badge(type || 'comment', map[type] || '');
}

function mapTaskStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (['open', 'new'].includes(raw)) return 'new';
  if (['in_progress', 'in progress', 'progress', 'doing', 'work', 'в работе'].includes(raw)) return 'in_progress';
  if (['waiting_team', 'waiting-team', 'wait_team'].includes(raw)) return 'waiting_team';
  if (['blocked', 'waiting_decision', 'wait_decision', 'decision', 'waiting', 'ждёт', 'ждет'].includes(raw)) return 'waiting_decision';
  if (['done', 'complete', 'completed', 'сделано'].includes(raw)) return 'done';
  if (['cancelled', 'canceled', 'отменено'].includes(raw)) return 'cancelled';
  return 'new';
}

function inferTaskType(text = '') {
  const raw = String(text || '').toLowerCase();
  if (/марж|цен|min price|unit|убыт|цена/.test(raw)) return 'price_margin';
  if (/контент|карточ|фото|тз|креатив|описан/.test(raw)) return 'content';
  if (/трафик|кз|vk|вк|инфлю|реклама|рк|smm/.test(raw)) return 'traffic';
  if (/остат|постав|склад|supply|oos|логист/.test(raw)) return 'supply';
  if (/возврат|отзыв|рейтинг/.test(raw)) return 'returns';
  if (/owner|закреп|назнач/.test(raw)) return 'assignment';
  if (/новин|launch|gate|бриф/.test(raw)) return 'launch';
  return 'general';
}

function detectTaskPlatform(task, sku) {
  if (task?.platform) return task.platform;
  const text = `${task?.title || ''} ${task?.nextAction || ''}`.toLowerCase();
  if (text.includes('wb') && text.includes('ozon')) return 'wb+ozon';
  if (text.includes('wb')) return 'wb';
  if (text.includes('ozon')) return 'ozon';
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) return 'wb+ozon';
  if (sku?.flags?.toWorkWB) return 'wb';
  if (sku?.flags?.toWorkOzon) return 'ozon';
  if (sku?.flags?.hasWB && sku?.flags?.hasOzon) return 'wb+ozon';
  if (sku?.flags?.hasWB) return 'wb';
  if (sku?.flags?.hasOzon) return 'ozon';
  return 'all';
}

function normalizeTask(task, sourceHint = 'manual') {
  const sku = task?.articleKey ? getSku(task.articleKey) : null;
  const title = task?.title || 'Задача без названия';
  const type = task?.type || inferTaskType(`${title} ${task?.nextAction || ''}`);
  const priority = task?.priority || (type === 'price_margin' ? 'critical' : type === 'assignment' ? 'high' : 'medium');
  return {
    id: task?.id || uid(sourceHint === 'auto' ? 'auto' : 'task'),
    source: task?.source || sourceHint,
    articleKey: task?.articleKey || '',
    title,
    nextAction: task?.nextAction || '',
    reason: task?.reason || '',
    owner: task?.owner || ownerName(sku) || '',
    due: task?.due || plusDays(type === 'assignment' ? 1 : 3),
    status: mapTaskStatus(task?.status),
    type,
    priority,
    platform: detectTaskPlatform(task, sku),
    createdAt: task?.createdAt || new Date().toISOString(),
    entityLabel: task?.entityLabel || sku?.name || title,
    autoCode: task?.autoCode || ''
  };
}

function normalizeStorageTasks(tasks, sourceHint = 'manual') {
  return (tasks || []).map((task) => normalizeTask(task, task?.source || sourceHint));
}

function mergeSeedStorage(seed) {
  const existingComments = new Set(state.storage.comments.map((item) => `${item.articleKey}|${item.author}|${item.createdAt}|${item.text}`));
  const existingTasks = new Set(state.storage.tasks.map((item) => `${item.articleKey}|${item.owner}|${item.due}|${item.title}`));

  for (const comment of seed.comments || []) {
    const key = `${comment.articleKey}|${comment.author}|${comment.createdAt}|${comment.text}`;
    if (!existingComments.has(key)) state.storage.comments.push(comment);
  }
  for (const task of seed.tasks || []) {
    const normalized = normalizeTask(task, 'seed');
    const key = `${normalized.articleKey}|${normalized.owner}|${normalized.due}|${normalized.title}`;
    if (!existingTasks.has(key)) state.storage.tasks.push(normalized);
  }
  saveLocalStorage();
}

function mergeImportedStorage(imported) {
  const seed = {
    comments: Array.isArray(imported.comments) ? imported.comments : [],
    tasks: Array.isArray(imported.tasks) ? imported.tasks : []
  };
  mergeSeedStorage(seed);
}

function getSkuComments(articleKey) {
  return state.storage.comments
    .filter((comment) => comment.articleKey === articleKey)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function isTaskActive(task) {
  return ACTIVE_TASK_STATUSES.has(task?.status);
}

function isTaskOverdue(task) {
  return Boolean(task?.due) && isTaskActive(task) && task.due < todayIso();
}

function taskStatusBadge(task) {
  const meta = isTaskOverdue(task) ? { label: 'Просрочено', kind: 'danger' } : (TASK_STATUS_META[task?.status] || TASK_STATUS_META.new);
  return badge(meta.label, meta.kind);
}

function taskPriorityBadge(task) {
  const meta = PRIORITY_META[task?.priority] || PRIORITY_META.medium;
  return badge(meta.label, meta.kind);
}

function taskTypeBadge(task) {
  const kind = task?.type === 'price_margin' ? 'danger' : task?.type === 'assignment' ? 'warn' : 'info';
  return badge(TASK_TYPE_META[task?.type] || TASK_TYPE_META.general, kind);
}

function taskSourceBadge(task) {
  if (task?.source === 'auto') return badge('авто-сигнал', 'info');
  if (task?.source === 'seed') return badge('seed');
  return badge('ручная', 'ok');
}

function taskPlatformBadge(task) {
  if (task?.platform === 'wb') return badge('WB');
  if (task?.platform === 'ozon') return badge('Ozon');
  if (task?.platform === 'wb+ozon') return badge('WB + Ozon');
  return badge('Все площадки');
}

function taskSortKey(task) {
  return [
    Number(isTaskOverdue(task)),
    Number(isTaskActive(task)),
    PRIORITY_META[task?.priority]?.rank || 1,
    task?.due || '9999-12-31',
    task?.title || ''
  ];
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const ka = taskSortKey(a);
    const kb = taskSortKey(b);
    return kb[0] - ka[0]
      || kb[1] - ka[1]
      || kb[2] - ka[2]
      || ka[3].localeCompare(kb[3])
      || ka[4].localeCompare(kb[4], 'ru');
  });
}

function storedTaskKeys() {
  return new Set(state.storage.tasks.filter(isTaskActive).map((task) => `${task.articleKey}|${task.type}`));
}

function buildAutoTasks() {
  const keys = storedTaskKeys();
  const tasks = [];

  for (const sku of state.skus) {
    const articleKey = sku.articleKey;
    const owner = ownerName(sku);
    const platform = sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon ? 'wb+ozon' : sku?.flags?.toWorkWB ? 'wb' : sku?.flags?.toWorkOzon ? 'ozon' : detectTaskPlatform({}, sku);
    const exitSku = String(sku?.status || '').toLowerCase().includes('вывод');

    if ((sku?.flags?.toWorkWB || sku?.flags?.toWorkOzon || sku?.flags?.toWork) && !keys.has(`${articleKey}|price_margin`)) {
      tasks.push(normalizeTask({
        id: `auto-price-${articleKey}`,
        source: 'auto',
        autoCode: 'price_margin',
        articleKey,
        title: 'Разобрать цену и маржу',
        nextAction: 'Проверить цену, unit-экономику и дать план действий по SKU в работе.',
        reason: sku.focusReasons || 'Ниже плана и отрицательная маржа.',
        owner,
        due: plusDays(2),
        status: 'new',
        type: 'price_margin',
        priority: 'critical',
        platform
      }, 'auto'));
    } else if (sku?.flags?.negativeMargin && !keys.has(`${articleKey}|price_margin`)) {
      tasks.push(normalizeTask({
        id: `auto-neg-${articleKey}`,
        source: 'auto',
        autoCode: 'negative_margin',
        articleKey,
        title: 'Проверить отрицательную маржу',
        nextAction: 'Сверить комиссии, логистику, возвраты и min price.',
        reason: 'Есть отрицательная маржа хотя бы по одной из площадок.',
        owner,
        due: plusDays(3),
        status: 'new',
        type: 'price_margin',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (sku?.flags?.lowStock && !exitSku && !keys.has(`${articleKey}|supply`)) {
      tasks.push(normalizeTask({
        id: `auto-stock-${articleKey}`,
        source: 'auto',
        autoCode: 'low_stock',
        articleKey,
        title: 'Проверить остатки и поставку',
        nextAction: 'Подтвердить риск OOS, поставить срок и план отгрузки.',
        reason: 'Низкий остаток по SKU.',
        owner,
        due: plusDays(2),
        status: 'new',
        type: 'supply',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (!sku?.flags?.assigned && !keys.has(`${articleKey}|assignment`)) {
      tasks.push(normalizeTask({
        id: `auto-owner-${articleKey}`,
        source: 'auto',
        autoCode: 'assignment',
        articleKey,
        title: 'Назначить owner по SKU',
        nextAction: 'Закрепить ответственного и срок первого апдейта.',
        reason: 'SKU без закрепления.',
        owner: '',
        due: plusDays(1),
        status: 'new',
        type: 'assignment',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (sku?.flags?.highReturn && !keys.has(`${articleKey}|returns`)) {
      tasks.push(normalizeTask({
        id: `auto-returns-${articleKey}`,
        source: 'auto',
        autoCode: 'returns',
        articleKey,
        title: 'Разобрать возвраты и отзывы',
        nextAction: 'Проверить причины возвратов, отзывы и нужные правки карточки.',
        reason: sku?.returns?.topReason || 'Высокие возвраты по SKU.',
        owner,
        due: plusDays(3),
        status: 'new',
        type: 'returns',
        priority: 'medium',
        platform
      }, 'auto'));
    }

    if ((sku?.focusScore || 0) >= 4 && !sku?.flags?.hasExternalTraffic && !exitSku && !keys.has(`${articleKey}|traffic`)) {
      tasks.push(normalizeTask({
        id: `auto-traffic-${articleKey}`,
        source: 'auto',
        autoCode: 'traffic',
        articleKey,
        title: 'Проверить внешний трафик по фокусному SKU',
        nextAction: 'Решить, нужен ли КЗ / VK / инфлюенсеры и зафиксировать owner канала.',
        reason: 'Фокусный SKU без внешнего трафика.',
        owner,
        due: plusDays(4),
        status: 'new',
        type: 'traffic',
        priority: 'medium',
        platform
      }, 'auto'));
    }
  }

  return tasks;
}

function getAllTasks() {
  return sortTasks([...state.storage.tasks, ...buildAutoTasks()]);
}

function getSkuControlTasks(articleKey) {
  return sortTasks(getAllTasks().filter((task) => task.articleKey === articleKey));
}

function nextTaskForSku(articleKey) {
  const tasks = getSkuControlTasks(articleKey);
  return tasks.find(isTaskActive) || tasks[0] || null;
}

function getControlSnapshot() {
  const tasks = getAllTasks();
  const active = tasks.filter(isTaskActive);
  const overdue = active.filter(isTaskOverdue);
  const waitingDecision = active.filter((task) => task.status === 'waiting_decision');
  const noOwner = active.filter((task) => !task.owner);
  const dueThisWeek = active.filter((task) => task.due && task.due <= plusDays(7));
  const ownerMap = new Map();

  for (const task of active) {
    const key = task.owner || 'Без owner';
    const row = ownerMap.get(key) || { owner: key, total: 0, overdue: 0, critical: 0, waiting: 0 };
    row.total += 1;
    if (isTaskOverdue(task)) row.overdue += 1;
    if (task.priority === 'critical') row.critical += 1;
    if (task.status === 'waiting_decision') row.waiting += 1;
    ownerMap.set(key, row);
  }

  return {
    tasks,
    active,
    overdue,
    waitingDecision,
    noOwner,
    dueThisWeek,
    byOwner: [...ownerMap.values()].sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner, 'ru')),
    todayList: sortTasks(active).filter((task) => isTaskOverdue(task) || task.priority === 'critical' || (task.due && task.due <= plusDays(2))).slice(0, 12),
    autoCount: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length,
    manualCount: tasks.filter((task) => task.source !== 'auto' && isTaskActive(task)).length
  };
}

function filteredControlTasks() {
  const f = state.controlFilters;
  const search = String(f.search || '').trim().toLowerCase();

  return getAllTasks().filter((task) => {
    const sku = getSku(task.articleKey);
    const hay = [task.title, task.nextAction, task.reason, task.owner, task.articleKey, sku?.article, sku?.name, sku?.category].filter(Boolean).join(' ').toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (f.owner !== 'all' && (task.owner || 'Без owner') !== f.owner) return false;
    if (f.status === 'active' && !isTaskActive(task)) return false;
    if (f.status !== 'active' && f.status !== 'all' && task.status !== f.status) return false;
    if (f.type !== 'all' && task.type !== f.type) return false;
    if (f.platform !== 'all' && task.platform !== f.platform) return false;
    if (f.source === 'manual' && task.source === 'auto') return false;
    if (f.source === 'auto' && task.source !== 'auto') return false;
    if (f.horizon === 'overdue' && !isTaskOverdue(task)) return false;
    if (f.horizon === 'today' && task.due !== todayIso()) return false;
    if (f.horizon === 'week' && (!task.due || task.due > plusDays(7))) return false;
    if (f.horizon === 'no_owner' && task.owner) return false;
    return true;
  });
}

function renderTaskCard(task) {
  const sku = getSku(task.articleKey);
  const skuLabel = sku ? linkToSku(sku.articleKey, sku.article || sku.articleKey) : badge(task.articleKey || task.entityLabel || 'SKU');
  const controls = task.source === 'auto'
    ? `<button class="btn small-btn" data-take-task="${escapeHtml(task.id)}">Взять в работу</button>`
    : `<select class="inline-select task-status-select" data-task-id="${escapeHtml(task.id)}">${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>`;

  return `
    <div class="task-card ${isTaskOverdue(task) ? 'overdue' : ''}">
      <div class="head">
        <div>
          <div class="title">${escapeHtml(task.title)}</div>
          <div class="muted small" style="margin-top:4px">${skuLabel}</div>
        </div>
        ${taskStatusBadge(task)}
      </div>
      <div class="meta">${taskPriorityBadge(task)}${taskTypeBadge(task)}${taskPlatformBadge(task)}${taskSourceBadge(task)}</div>
      ${task.reason ? `<div class="muted small">${escapeHtml(task.reason)}</div>` : ''}
      ${task.nextAction ? `<div><strong class="small">Следующее действие</strong><div class="muted small" style="margin-top:4px">${escapeHtml(task.nextAction)}</div></div>` : ''}
      <div class="foot">
        <div class="muted small">${escapeHtml(task.owner || 'Без owner')} · срок ${escapeHtml(task.due || '—')}</div>
        <div class="actions">${controls}</div>
      </div>
    </div>
  `;
}

function renderMiniTask(task) {
  const sku = getSku(task.articleKey);
  return `
    <div class="task-mini ${isTaskOverdue(task) ? 'overdue' : ''}">
      <div class="left">
        <strong>${escapeHtml(task.title)}</strong>
        <div class="muted small">${escapeHtml(sku?.article || task.articleKey || task.entityLabel || '—')} · ${escapeHtml(task.owner || 'Без owner')} · ${escapeHtml(task.due || '—')}</div>
      </div>
      <div class="badge-stack">${taskPriorityBadge(task)}${taskStatusBadge(task)}</div>
    </div>
  `;
}

function renderOwnerRow(row, max) {
  const width = Math.max(6, Math.round((row.total / Math.max(1, max)) * 100));
  return `
    <div class="owner-row">
      <div class="head">
        <strong>${escapeHtml(row.owner)}</strong>
        <div class="badge-stack">
          ${badge(`${fmt.int(row.total)} задач`)}
          ${row.overdue ? badge(`${fmt.int(row.overdue)} проср.`, 'danger') : ''}
          ${row.critical ? badge(`${fmt.int(row.critical)} крит.`, 'warn') : ''}
        </div>
      </div>
      <div class="owner-bar"><span style="width:${width}%"></span></div>
    </div>
  `;
}

function skuOperationalStatus(sku) {
  if (String(sku?.status || '').toLowerCase().includes('вывод')) return badge('Вывод');
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) return badge('В работу WB + Ozon', 'danger');
  if (sku?.flags?.toWorkWB) return badge('В работу WB', 'danger');
  if (sku?.flags?.toWorkOzon) return badge('В работу Ozon', 'danger');
  if (sku?.flags?.toWork) return badge('В работу', 'danger');
  if ((sku?.focusScore || 0) >= 4) return badge('Наблюдать', 'warn');
  return badge('Ок', 'ok');
}

function renderSkuTaskSummary(sku) {
  const task = nextTaskForSku(sku.articleKey);
  if (!task) return `<div class="muted small">Нет активной задачи</div>`;
  return `
    <div><strong>${escapeHtml(task.title)}</strong></div>
    <div class="muted small">${escapeHtml(task.nextAction || task.reason || 'Нужен апдейт')}</div>
    <div class="badge-stack" style="margin-top:6px">${taskStatusBadge(task)}${taskPriorityBadge(task)}</div>
  `;
}

function renderDashboard() {
  const root = document.getElementById('view-dashboard');
  const control = getControlSnapshot();

  const actionCards = [
    { label: 'Активные задачи', value: control.active.length, hint: 'Открытые задачи по SKU и авто-сигналам.' },
    { label: 'Просрочено', value: control.overdue.length, hint: 'Нужен апдейт или перенос срока.' },
    { label: 'Ждёт решения', value: control.waitingDecision.length, hint: 'Зависло на согласовании или развилке.' },
    { label: 'Без owner', value: control.noOwner.length, hint: 'Нужно закрепить ответственного.' },
    { label: 'Авто-сигналы', value: control.autoCount, hint: 'Сформированы из маржи, плана, остатков и возвратов.' },
    { label: 'Ручные задачи', value: control.manualCount, hint: 'Созданы командой и seed-пакетом.' }
  ].map((card) => `
    <div class="card kpi control-card">
      <div class="label">${escapeHtml(card.label)}</div>
      <div class="value">${fmt.int(card.value)}</div>
      <div class="hint">${escapeHtml(card.hint)}</div>
    </div>
  `).join('');

  const ownerRows = control.byOwner.slice(0, 8);
  const maxOwner = Math.max(1, ...ownerRows.map((row) => row.total));

  const baseCards = (state.dashboard.cards || []).map((card) => `
    <div class="card kpi">
      <div class="label">${escapeHtml(card.label)}</div>
      <div class="value">${fmt.int(card.value)}</div>
      <div class="hint">${escapeHtml(card.hint)}</div>
    </div>
  `).join('');

  const toWork = (state.dashboard.toWork || []).map((row) => `
    <div class="list-item">
      <div class="head">
        <div>
          <div><strong>${linkToSku(row.article, row.product_name_final || row.article)}</strong></div>
          <div class="muted small">${escapeHtml(row.brand || 'Алтея')}</div>
        </div>
        ${badge(fmt.pct(row.plan_completion_feb26_pct), 'danger')}
      </div>
      <div class="badge-stack">
        <span class="chip danger">В работу</span>
        ${marginBadge('WB', row.wb_margin_pct)}
        ${marginBadge('Ozon', row.ozon_margin_pct)}
        ${badge(`Остаток ${fmt.int(row.total_mp_stock)} шт.`, row.total_mp_stock <= 50 ? 'warn' : '')}
      </div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(row.focus_reasons || 'Ниже плана и отрицательная маржа')}</div>
    </div>
  `).join('');

  const unassigned = (state.dashboard.unassigned || []).map((row) => `
    <div class="list-item">
      <div class="head">
        <div>
          <div><strong>${linkToSku(row.article, row.product_name_final || row.article)}</strong></div>
          <div class="muted small">${escapeHtml(row.brand || 'Алтея')}</div>
        </div>
        ${badge('Без owner', 'warn')}
      </div>
      <div class="badge-stack">${scoreChip(row.focus_score || 0)}${marginBadge('WB', row.wb_margin_pct)}${marginBadge('Ozon', row.ozon_margin_pct)}</div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(row.focus_reasons || 'Нужен ответственный')}</div>
    </div>
  `).join('');

  const focusRows = (state.dashboard.focusTop || []).map((row) => `
    <tr>
      <td>${linkToSku(row.article, row.article)}</td>
      <td><div><strong>${escapeHtml(row.product_name_final || 'Без названия')}</strong></div><div class="muted small">${escapeHtml(row.focus_reasons || '—')}</div></td>
      <td>${scoreChip(row.focus_score || 0)}</td>
      <td>${fmt.pct(row.plan_completion_feb26_pct)}</td>
      <td>${fmt.int(row.total_mp_stock)}</td>
      <td>${row.content_romi == null ? '—' : fmt.num(row.content_romi, 1)}</td>
    </tr>
  `).join('');

  root.innerHTML = `
    <div class="banner">
      <div>✅</div>
      <div><strong>Контроль вынесен в отдельный слой.</strong> Первый экран больше не шумит цифрами, а показывает, что реально надо проверить сегодня: просрочки, задачи без owner, критичные SKU и авто-сигналы.</div>
    </div>

    <div class="section-title">
      <div>
        <h2>Что требует внимания сегодня</h2>
        <p>Сверху — оперативный inbox. Ниже — обзор бренда и фокусные SKU.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" data-view-control>Открыть контроль</button>
        <button class="quick-chip" data-control-preset="overdue">Просрочено</button>
        <button class="quick-chip" data-control-preset="no_owner">Без owner</button>
      </div>
    </div>

    <div class="grid cards">${actionCards}</div>

    <div class="summary-grid" style="margin-top:14px">
      <div class="card">
        <h3>Свод задач на чек</h3>
        <p class="small muted">Берём то, что уже просрочено, критично по марже или без owner.</p>
        <div class="list" style="margin-top:12px">${control.todayList.length ? control.todayList.map(renderMiniTask).join('') : '<div class="empty">Нет активных задач</div>'}</div>
      </div>
      <div class="card">
        <h3>Нагрузка по owner</h3>
        <p class="small muted">Легко видно, у кого реально висит работа и где нужен контроль.</p>
        <div class="owner-summary" style="margin-top:12px">${ownerRows.length ? ownerRows.map((row) => renderOwnerRow(row, maxOwner)).join('') : '<div class="empty">Пока нет задач по owner</div>'}</div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>SKU в работе</h3>
        <p class="small muted">Логика «в работу»: отстаёт от плана и одновременно даёт отрицательную маржу.</p>
        <div class="list">${toWork || '<div class="empty">Сейчас нет SKU, которые одновременно ниже плана и в отрицательной марже</div>'}</div>
      </div>
      <div class="card">
        <h3>Без owner</h3>
        <p class="small muted">Это первый приоритет в настройке контроля — без закрепления не работает задачник.</p>
        <div class="list">${unassigned || '<div class="empty">Все ключевые SKU закреплены</div>'}</div>
      </div>
    </div>

    <div class="section-title">
      <div>
        <h2>Обзор бренда</h2>
        <p>Базовые KPI и фокусные SKU оставила, но сдвинула ниже, чтобы не мешали daily-check.</p>
      </div>
    </div>

    <div class="grid cards">${baseCards}</div>

    <div class="card" style="margin-top:14px">
      <h3>Фокусные SKU</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Артикул</th>
              <th>SKU</th>
              <th>Фокус</th>
              <th>Выполнение</th>
              <th>Остатки</th>
              <th>ROMI</th>
            </tr>
          </thead>
          <tbody>${focusRows || `<tr><td colspan="6" class="text-center muted">Нет данных</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <div class="footer-note">Последняя генерация данных: ${escapeHtml(state.dashboard.generatedAt || '—')}. Следующий шаг для боевого режима — общий backend для задач и комментариев.</div>
  `;
}

function renderControlCenter() {
  const root = document.getElementById('view-control');
  const tasks = filteredControlTasks();
  const owners = [...new Set(getAllTasks().map((task) => task.owner || 'Без owner'))].sort((a, b) => a.localeCompare(b, 'ru'));
  const columns = [
    ['new', 'Новые'],
    ['in_progress', 'В работе'],
    ['waiting_team', 'Ждёт другого отдела'],
    ['waiting_decision', 'Ждёт решения'],
    ['done', 'Сделано']
  ];

  const counts = {
    active: tasks.filter(isTaskActive).length,
    overdue: tasks.filter(isTaskOverdue).length,
    noOwner: tasks.filter((task) => isTaskActive(task) && !task.owner).length,
    waiting: tasks.filter((task) => task.status === 'waiting_decision').length,
    critical: tasks.filter((task) => isTaskActive(task) && task.priority === 'critical').length,
    auto: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length
  };

  const board = columns.map(([status, label]) => {
    const columnTasks = tasks.filter((task) => task.status === status);
    return `
      <div class="board-col">
        <h3>${escapeHtml(label)} <span class="muted">· ${fmt.int(columnTasks.length)}</span></h3>
        <div class="stack">${columnTasks.length ? columnTasks.map(renderTaskCard).join('') : '<div class="empty">Пусто</div>'}</div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Контроль задач и визуальный чек</h2>
        <p>Один слой для weekly-задач, сигналов по марже и ручных задач команды.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" data-control-preset="active">Активные</button>
        <button class="quick-chip" data-control-preset="overdue">Просроченные</button>
        <button class="quick-chip" data-control-preset="critical">Критичные</button>
        <button class="quick-chip" data-control-preset="no_owner">Без owner</button>
      </div>
    </div>

    <div class="kpi-strip">
      <div class="mini-kpi"><span>Активно</span><strong>${fmt.int(counts.active)}</strong></div>
      <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(counts.overdue)}</strong></div>
      <div class="mini-kpi warn"><span>Критично</span><strong>${fmt.int(counts.critical)}</strong></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(counts.noOwner)}</strong></div>
      <div class="mini-kpi"><span>Ждёт решения</span><strong>${fmt.int(counts.waiting)}</strong></div>
      <div class="mini-kpi"><span>Авто-сигналы</span><strong>${fmt.int(counts.auto)}</strong></div>
    </div>

    <div class="control-filters">
      <input id="controlSearchInput" placeholder="Поиск по SKU, названию, owner, действию…" value="${escapeHtml(state.controlFilters.search)}">
      <select id="controlOwnerFilter">
        <option value="all">Все owner</option>
        ${owners.map((owner) => `<option value="${escapeHtml(owner)}" ${state.controlFilters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
      </select>
      <select id="controlStatusFilter">
        <option value="active" ${state.controlFilters.status === 'active' ? 'selected' : ''}>Только активные</option>
        <option value="all" ${state.controlFilters.status === 'all' ? 'selected' : ''}>Все статусы</option>
        ${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${state.controlFilters.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
      </select>
      <select id="controlTypeFilter">
        <option value="all">Все типы</option>
        ${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}" ${state.controlFilters.type === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
      </select>
      <select id="controlPlatformFilter">
        <option value="all">Все площадки</option>
        <option value="wb" ${state.controlFilters.platform === 'wb' ? 'selected' : ''}>WB</option>
        <option value="ozon" ${state.controlFilters.platform === 'ozon' ? 'selected' : ''}>Ozon</option>
        <option value="wb+ozon" ${state.controlFilters.platform === 'wb+ozon' ? 'selected' : ''}>WB + Ozon</option>
      </select>
      <select id="controlHorizonFilter">
        <option value="all">Весь горизонт</option>
        <option value="overdue" ${state.controlFilters.horizon === 'overdue' ? 'selected' : ''}>Просрочено</option>
        <option value="today" ${state.controlFilters.horizon === 'today' ? 'selected' : ''}>Срок сегодня</option>
        <option value="week" ${state.controlFilters.horizon === 'week' ? 'selected' : ''}>Срок на 7 дней</option>
        <option value="no_owner" ${state.controlFilters.horizon === 'no_owner' ? 'selected' : ''}>Без owner</option>
      </select>
      <select id="controlSourceFilter">
        <option value="all">Все источники</option>
        <option value="manual" ${state.controlFilters.source === 'manual' ? 'selected' : ''}>Ручные + seed</option>
        <option value="auto" ${state.controlFilters.source === 'auto' ? 'selected' : ''}>Только авто-сигналы</option>
      </select>
    </div>

    <div class="check-grid" style="margin-bottom:14px">
      <div class="card">
        <h3>Чек-лист контроля</h3>
        <div class="check-list">
          <div class="check-item"><strong>1.</strong><span>Закрыть просрочки и перенести сроки, если реально ждём другой отдел.</span></div>
          <div class="check-item"><strong>2.</strong><span>Проверить все задачи без owner и закрепить их.</span></div>
          <div class="check-item"><strong>3.</strong><span>Отдельно посмотреть критичные задачи по марже и цене.</span></div>
          <div class="check-item"><strong>4.</strong><span>Пробежать новинки без внешнего трафика и задачи по запуску.</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Что здесь уже контролируем</h3>
        <div class="task-mini-grid">
          ${getControlSnapshot().todayList.slice(0, 4).map(renderMiniTask).join('') || '<div class="empty">Нет задач для экспресс-чека</div>'}
        </div>
      </div>
    </div>

    <div class="board-columns">${board}</div>
  `;

  document.getElementById('controlSearchInput').addEventListener('input', (e) => { state.controlFilters.search = e.target.value; renderControlCenter(); });
  document.getElementById('controlOwnerFilter').addEventListener('change', (e) => { state.controlFilters.owner = e.target.value; renderControlCenter(); });
  document.getElementById('controlStatusFilter').addEventListener('change', (e) => { state.controlFilters.status = e.target.value; renderControlCenter(); });
  document.getElementById('controlTypeFilter').addEventListener('change', (e) => { state.controlFilters.type = e.target.value; renderControlCenter(); });
  document.getElementById('controlPlatformFilter').addEventListener('change', (e) => { state.controlFilters.platform = e.target.value; renderControlCenter(); });
  document.getElementById('controlHorizonFilter').addEventListener('change', (e) => { state.controlFilters.horizon = e.target.value; renderControlCenter(); });
  document.getElementById('controlSourceFilter').addEventListener('change', (e) => { state.controlFilters.source = e.target.value; renderControlCenter(); });
}

function filterSkuByMarket(sku) {
  if (state.filters.market === 'wb') return sku?.flags?.hasWB;
  if (state.filters.market === 'ozon') return sku?.flags?.hasOzon;
  return true;
}

function filterSkuByWorkLogic(sku) {
  if (state.filters.market === 'wb') return sku?.flags?.toWorkWB;
  if (state.filters.market === 'ozon') return sku?.flags?.toWorkOzon;
  return sku?.flags?.toWork;
}

function getFilteredSkus() {
  const q = String(state.filters.search || '').trim().toLowerCase();
  return state.skus.filter((sku) => {
    if (!filterSkuByMarket(sku)) return false;
    const hay = [sku.article, sku.articleKey, sku.name, sku.brand, sku.category, sku.segment, ownerName(sku), sku.status, sku.focusReasons].filter(Boolean).join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (state.filters.owner !== 'all' && ownerName(sku) !== state.filters.owner) return false;
    if (state.filters.segment !== 'all' && sku.segment !== state.filters.segment) return false;
    if (state.filters.assignment === 'assigned' && !sku?.flags?.assigned) return false;
    if (state.filters.assignment === 'unassigned' && sku?.flags?.assigned) return false;
    if (state.filters.traffic === 'any' && !sku?.flags?.hasExternalTraffic) return false;
    if (state.filters.traffic === 'kz' && !sku?.flags?.hasKZ) return false;
    if (state.filters.traffic === 'vk' && !sku?.flags?.hasVK) return false;
    if (state.filters.traffic === 'none' && sku?.flags?.hasExternalTraffic) return false;

    switch (state.filters.focus) {
      case 'toWork':
        return filterSkuByWorkLogic(sku);
      case 'negativeMargin':
        return sku?.flags?.negativeMargin;
      case 'underPlan':
        return sku?.flags?.underPlan;
      case 'focus4':
        return (sku?.focusScore || 0) >= 4;
      case 'lowStock':
        return sku?.flags?.lowStock;
      case 'highReturn':
        return sku?.flags?.highReturn;
      case 'extAny':
        return sku?.flags?.hasExternalTraffic;
      case 'extKZ':
        return sku?.flags?.hasKZ;
      case 'extVK':
        return sku?.flags?.hasVK;
      case 'unassigned':
        return !sku?.flags?.assigned;
      default:
        return true;
    }
  }).sort((a, b) => {
    const aTask = nextTaskForSku(a.articleKey);
    const bTask = nextTaskForSku(b.articleKey);
    return Number(filterSkuByWorkLogic(b)) - Number(filterSkuByWorkLogic(a))
      || Number((b.focusScore || 0)) - Number((a.focusScore || 0))
      || Number(isTaskOverdue(bTask)) - Number(isTaskOverdue(aTask))
      || String(a.article || '').localeCompare(String(b.article || ''), 'ru');
  });
}

function renderSkuRegistry() {
  const root = document.getElementById('view-skus');
  const items = getFilteredSkus();
  const owners = [...new Set(state.skus.map((sku) => ownerName(sku)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const segments = [...new Set(state.skus.map((sku) => sku.segment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const assignedCount = items.filter((sku) => sku?.flags?.assigned).length;
  const unassignedCount = items.length - assignedCount;
  const kzCount = items.filter((sku) => sku?.flags?.hasKZ).length;
  const vkCount = items.filter((sku) => sku?.flags?.hasVK).length;

  const rows = items.map((sku) => `
    <tr>
      <td>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</td>
      <td><div><strong>${escapeHtml(sku.name || 'Без названия')}</strong></div><div class="muted small">${escapeHtml(sku.category || sku.segment || '—')}</div></td>
      <td>${skuOperationalStatus(sku)}</td>
      <td>${ownerCell(sku)}</td>
      <td>${trafficBadges(sku, 'нет')}</td>
      <td>${renderSkuTaskSummary(sku)}</td>
      <td>${nextTaskForSku(sku.articleKey)?.due ? escapeHtml(nextTaskForSku(sku.articleKey).due) : '—'}</td>
    </tr>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Реестр SKU · Алтея</h2>
        <p>Сократила строку до операционного минимума: статус, owner, внешний трафик, следующее действие и срок.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(items.length)} SKU`)}
        ${badge(`${fmt.int(assignedCount)} с owner`, 'ok')}
        ${badge(`${fmt.int(unassignedCount)} без owner`, unassignedCount ? 'warn' : 'ok')}
        ${badge(`🚀 КЗ ${fmt.int(kzCount)}`, kzCount ? 'info' : '')}
        ${badge(`📣 VK ${fmt.int(vkCount)}`, vkCount ? 'info' : '')}
      </div>
    </div>

    <div class="market-tabs">
      <button class="market-tab ${state.filters.market === 'all' ? 'active' : ''}" data-market-filter="all">Все площадки</button>
      <button class="market-tab ${state.filters.market === 'wb' ? 'active' : ''}" data-market-filter="wb">WB</button>
      <button class="market-tab ${state.filters.market === 'ozon' ? 'active' : ''}" data-market-filter="ozon">Ozon</button>
    </div>

    <div class="filters filters-advanced">
      <input id="skuSearchInput" placeholder="Поиск по артикулу, названию, категории, owner…" value="${escapeHtml(state.filters.search)}">
      <select id="skuOwnerFilter">
        <option value="all">Все owner</option>
        ${owners.map((owner) => `<option value="${escapeHtml(owner)}" ${state.filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
      </select>
      <select id="skuSegmentFilter">
        <option value="all">Все сегменты</option>
        ${segments.map((segment) => `<option value="${escapeHtml(segment)}" ${state.filters.segment === segment ? 'selected' : ''}>${escapeHtml(segment)}</option>`).join('')}
      </select>
      <select id="skuFocusFilter">
        <option value="all" ${state.filters.focus === 'all' ? 'selected' : ''}>Все SKU</option>
        <option value="toWork" ${state.filters.focus === 'toWork' ? 'selected' : ''}>${currentWorkLabel()}</option>
        <option value="negativeMargin" ${state.filters.focus === 'negativeMargin' ? 'selected' : ''}>Отрицательная маржа</option>
        <option value="underPlan" ${state.filters.focus === 'underPlan' ? 'selected' : ''}>Ниже плана</option>
        <option value="focus4" ${state.filters.focus === 'focus4' ? 'selected' : ''}>Фокус score ≥ 4</option>
        <option value="lowStock" ${state.filters.focus === 'lowStock' ? 'selected' : ''}>Низкий остаток</option>
        <option value="highReturn" ${state.filters.focus === 'highReturn' ? 'selected' : ''}>Высокие возвраты</option>
        <option value="extAny" ${state.filters.focus === 'extAny' ? 'selected' : ''}>Есть внешний трафик</option>
        <option value="unassigned" ${state.filters.focus === 'unassigned' ? 'selected' : ''}>Без owner</option>
      </select>
      <select id="skuTrafficFilter">
        <option value="all" ${state.filters.traffic === 'all' ? 'selected' : ''}>Весь трафик</option>
        <option value="any" ${state.filters.traffic === 'any' ? 'selected' : ''}>Есть внешний трафик</option>
        <option value="kz" ${state.filters.traffic === 'kz' ? 'selected' : ''}>🚀 Только КЗ</option>
        <option value="vk" ${state.filters.traffic === 'vk' ? 'selected' : ''}>📣 Только VK</option>
        <option value="none" ${state.filters.traffic === 'none' ? 'selected' : ''}>Без внешнего трафика</option>
      </select>
      <select id="skuAssignmentFilter">
        <option value="all" ${state.filters.assignment === 'all' ? 'selected' : ''}>Все закрепления</option>
        <option value="assigned" ${state.filters.assignment === 'assigned' ? 'selected' : ''}>Закреплённые</option>
        <option value="unassigned" ${state.filters.assignment === 'unassigned' ? 'selected' : ''}>Незакреплённые</option>
      </select>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Артикул</th>
            <th>SKU</th>
            <th>Статус</th>
            <th>Owner</th>
            <th>Внешний трафик</th>
            <th>Следующее действие</th>
            <th>Дедлайн</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="7" class="text-center muted">Ничего не найдено</td></tr>`}</tbody>
      </table>
    </div>

    <div class="footer-note">Белый бейдж артикулов оставила. Главная строка теперь читается как рабочий список, а не как длинный аналитический отчёт.</div>
  `;

  document.getElementById('skuSearchInput').addEventListener('input', (e) => { state.filters.search = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuOwnerFilter').addEventListener('change', (e) => { state.filters.owner = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuSegmentFilter').addEventListener('change', (e) => { state.filters.segment = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuFocusFilter').addEventListener('change', (e) => { state.filters.focus = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuTrafficFilter').addEventListener('change', (e) => { state.filters.traffic = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuAssignmentFilter').addEventListener('change', (e) => { state.filters.assignment = e.target.value; renderSkuRegistry(); });
  root.querySelectorAll('[data-market-filter]').forEach((btn) => btn.addEventListener('click', (e) => { state.filters.market = e.currentTarget.dataset.marketFilter; renderSkuRegistry(); }));
}

function metricRow(label, value, kind = '') {
  return `<div class="metric-row"><span>${escapeHtml(label)}</span><strong class="${kind}">${value}</strong></div>`;
}

function renderSkuModal(articleKey) {
  const sku = getSku(articleKey);
  if (!sku) return;
  state.activeSku = articleKey;

  const body = document.getElementById('skuModalBody');
  const modal = document.getElementById('skuModal');
  const comments = getSkuComments(articleKey);
  const tasks = getSkuControlTasks(articleKey);
  const activeTask = nextTaskForSku(articleKey);

  body.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="muted small">${escapeHtml(sku.brand || 'Алтея')} · ${escapeHtml(sku.segment || sku.category || '—')}</div>
        <h2>${escapeHtml(sku.name || 'Без названия')}</h2>
        <div class="badge-stack">${linkToSku(sku.articleKey, sku.article || sku.articleKey)}${skuOperationalStatus(sku)}${scoreChip(sku.focusScore || 0)}${trafficBadges(sku, 'нет')}</div>
      </div>
      <button class="btn ghost" data-close-modal>Закрыть</button>
    </div>

    <div class="kv-3">
      <div class="card subtle">
        <h3>Результат</h3>
        ${metricRow('План Feb 26', fmt.int(sku.planFact?.planFeb26Units))}
        ${metricRow('Факт Feb 26', fmt.int(sku.planFact?.factFeb26Units))}
        ${metricRow('Выполнение', fmt.pct(sku.planFact?.completionFeb26Pct), (sku.planFact?.completionFeb26Pct || 0) < 0.8 ? 'danger-text' : '')}
        ${metricRow('WB маржа', fmt.pct(sku.wb?.marginPct), (sku.wb?.marginPct || 0) < 0 ? 'danger-text' : '')}
        ${metricRow('Ozon маржа', fmt.pct(sku.ozon?.marginPct), (sku.ozon?.marginPct || 0) < 0 ? 'danger-text' : '')}
      </div>
      <div class="card subtle">
        <h3>Почему в фокусе</h3>
        ${metricRow('Owner', escapeHtml(ownerName(sku) || 'Не закреплён'))}
        ${metricRow('WB остаток', fmt.int(sku.wb?.stock), (sku.wb?.stock || 0) <= 50 ? 'warn-text' : '')}
        ${metricRow('Ozon остаток', fmt.int(sku.ozon?.stock), (sku.ozon?.stock || 0) <= 50 ? 'warn-text' : '')}
        ${metricRow('Возвраты WB', fmt.pct(sku.returns?.wbPct), (sku.returns?.wbPct || 0) >= 0.05 ? 'warn-text' : '')}
        ${metricRow('Возвраты Ozon', fmt.pct(sku.returns?.ozonPct), (sku.returns?.ozonPct || 0) >= 0.05 ? 'warn-text' : '')}
        <div class="note-box">${escapeHtml(sku.focusReasons || 'Нет явной причины в текущем срезе.')}</div>
      </div>
      <div class="card subtle">
        <h3>Что делаем</h3>
        <div class="badge-stack">${activeTask ? taskPriorityBadge(activeTask) : ''}${activeTask ? taskStatusBadge(activeTask) : ''}${activeTask ? taskTypeBadge(activeTask) : ''}</div>
        <div class="note-box">${escapeHtml(activeTask?.nextAction || 'Активной задачи пока нет.')}</div>
        <div class="metric-row"><span>Следующий срок</span><strong>${escapeHtml(activeTask?.due || '—')}</strong></div>
        <div class="metric-row"><span>Внешний трафик</span><strong>${sku?.flags?.hasExternalTraffic ? 'Есть' : 'Нет'}</strong></div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Задачи по SKU</h3>
        <div class="list">${tasks.length ? tasks.map(renderTaskCard).join('') : '<div class="empty">По этому SKU задач ещё нет</div>'}</div>
      </div>
      <div class="card">
        <h3>Добавить задачу</h3>
        <form id="manualTaskForm" class="form-grid compact">
          <input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">
          <input name="title" placeholder="Что делаем" required>
          <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select>
          <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}">${escapeHtml(meta.label)}</option>`).join('')}</select>
          <select name="platform">
            <option value="all">Все площадки</option>
            <option value="wb">WB</option>
            <option value="ozon">Ozon</option>
            <option value="wb+ozon">WB + Ozon</option>
          </select>
          <input name="owner" placeholder="Owner" value="${escapeHtml(ownerName(sku) || '')}">
          <input name="due" type="date" value="${plusDays(3)}">
          <textarea name="nextAction" rows="3" placeholder="Следующее действие и что считаем результатом"></textarea>
          <button class="btn primary" type="submit">Добавить задачу</button>
        </form>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Комментарии и апдейты</h3>
        <div class="list">${comments.length ? comments.map((comment) => `
          <div class="comment-item">
            <div class="head"><strong>${escapeHtml(comment.author || 'Команда')}</strong><div class="badge-stack">${commentTypeChip(comment.type)}${badge(comment.team || 'Команда')}</div></div>
            <div class="muted small">${fmt.date(comment.createdAt)}</div>
            <p>${escapeHtml(comment.text)}</p>
          </div>
        `).join('') : '<div class="empty">Комментариев пока нет</div>'}</div>
      </div>
      <div class="card">
        <h3>Добавить апдейт</h3>
        <form id="commentForm" class="form-grid compact">
          <input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">
          <input name="author" placeholder="Кто пишет" value="${escapeHtml(ownerName(sku) || 'Команда')}" required>
          <select name="type">
            <option value="signal">Сигнал</option>
            <option value="risk">Риск</option>
            <option value="focus">Фокус</option>
            <option value="idea">Идея</option>
          </select>
          <textarea name="text" rows="5" placeholder="Коротко: что случилось, что делаем, что нужно от других" required></textarea>
          <button class="btn" type="submit">Сохранить апдейт</button>
        </form>
      </div>
    </div>
  `;

  modal.classList.add('open');

  body.querySelector('#manualTaskForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createManualTask({
      articleKey,
      title: form.get('title'),
      type: form.get('type'),
      priority: form.get('priority'),
      platform: form.get('platform'),
      owner: form.get('owner'),
      due: form.get('due'),
      nextAction: form.get('nextAction')
    });
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#commentForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createComment({
      articleKey,
      author: form.get('author'),
      team: ownerName(sku) ? `Owner · ${ownerName(sku)}` : 'Команда',
      type: form.get('type'),
      text: form.get('text')
    });
    renderSkuModal(articleKey);
  });
}

function renderLaunches() {
  const root = document.getElementById('view-launches');
  const rows = (state.launches || []).map((item) => `
    <div class="list-item">
      <div class="head">
        <div>
          <strong>${escapeHtml(item.name || 'Новинка')}</strong>
          <div class="muted small">${escapeHtml(item.reportGroup || '—')} · ${escapeHtml(item.subCategory || '—')}</div>
        </div>
        ${badge(item.launchMonth || '—', 'info')}
      </div>
      <div class="badge-stack">${badge(item.tag || 'новинка')}${item.production ? badge(item.production) : ''}</div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(item.status || 'Статус не указан')}</div>
      <div class="muted small" style="margin-top:8px">План выручки: ${fmt.money(item.plannedRevenue)} · Целевая себестоимость: ${fmt.money(item.targetCost)}</div>
    </div>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Новинки и pipeline</h2>
        <p>Отдельный слой под запуск, чтобы не терять связку карточка → контент → внешний трафик.</p>
      </div>
    </div>
    <div class="card">
      <div class="pipeline-strip">
        <span>Идея</span><span>PMR</span><span>Дизайн</span><span>Тест</span><span>Поставка</span><span>Карточка</span><span>Контент</span><span>Трафик</span>
      </div>
      <div class="list" style="margin-top:14px">${rows || '<div class="empty">Нет новинок в текущем срезе</div>'}</div>
    </div>
  `;
}

function renderMeetings() {
  const root = document.getElementById('view-meetings');
  const cards = (state.meetings || []).map((meeting) => {
    const level = String(meeting.id || '').startsWith('weekly') ? 'Weekly' : String(meeting.id || '').startsWith('monthly') ? 'Monthly' : 'PMR';
    const outputs = Array.isArray(meeting.outputs) ? meeting.outputs.join(' · ') : (meeting.outputs || '—');
    const participants = Array.isArray(meeting.participants) ? meeting.participants.join(', ') : '—';
    return `
      <div class="card meeting-card">
        <div class="head">
          <div>
            <h3>${escapeHtml(meeting.title || 'Встреча')}</h3>
            <div class="muted small">${escapeHtml(meeting.cadence || '—')} · ${escapeHtml(meeting.duration || '—')}</div>
          </div>
          ${badge(level)}
        </div>
        <p>${escapeHtml(meeting.question || '—')}</p>
        <div class="muted small"><strong>Участники:</strong> ${escapeHtml(participants)}</div>
        <div class="muted small" style="margin-top:8px"><strong>Выход:</strong> ${escapeHtml(outputs)}</div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Ритм работы</h2>
        <p>Weekly / Monthly / PMR должны рождать задачи с owner и сроком — без этого портал не будет живым.</p>
      </div>
    </div>
    <div class="grid cards-2">${cards || '<div class="empty">Нет карты встреч</div>'}</div>
  `;
}

function createComment(payload) {
  const comment = {
    articleKey: payload.articleKey,
    author: String(payload.author || 'Команда').trim() || 'Команда',
    team: String(payload.team || 'Команда').trim() || 'Команда',
    createdAt: new Date().toISOString(),
    text: String(payload.text || '').trim(),
    type: String(payload.type || 'signal')
  };
  if (!comment.text) return;
  state.storage.comments.unshift(comment);
  saveLocalStorage();
}

function createManualTask(payload) {
  const task = normalizeTask({
    id: uid('task'),
    source: 'manual',
    articleKey: payload.articleKey,
    title: String(payload.title || '').trim() || 'Новая задача',
    type: payload.type,
    priority: payload.priority,
    platform: payload.platform,
    owner: String(payload.owner || '').trim(),
    due: payload.due || plusDays(3),
    status: 'new',
    nextAction: String(payload.nextAction || '').trim()
  }, 'manual');
  state.storage.tasks.unshift(task);
  saveLocalStorage();
}

function takeAutoTask(taskId) {
  const task = getAllTasks().find((item) => item.id === taskId);
  if (!task || task.source !== 'auto') return;
  const manual = normalizeTask({
    ...task,
    id: uid('task'),
    source: 'manual',
    status: 'in_progress',
    owner: task.owner || ownerName(getSku(task.articleKey)) || ''
  }, 'manual');
  state.storage.tasks.unshift(manual);
  saveLocalStorage();
  rerenderCurrentView();
  if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
}

function updateTaskStatus(taskId, status) {
  const task = state.storage.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.status = mapTaskStatus(status);
  saveLocalStorage();
  rerenderCurrentView();
  if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
}

function exportStorage() {
  const blob = new Blob([JSON.stringify(state.storage, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `altea-portal-storage-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importStorage(file) {
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  mergeImportedStorage(data);
  rerenderCurrentView();
  if (state.activeSku) renderSkuModal(state.activeSku);
}

function applyControlPreset(preset) {
  state.controlFilters.status = 'active';
  state.controlFilters.horizon = 'all';
  state.controlFilters.type = 'all';

  if (preset === 'overdue') {
    state.controlFilters.horizon = 'overdue';
  } else if (preset === 'no_owner') {
    state.controlFilters.horizon = 'no_owner';
  } else if (preset === 'critical') {
    state.controlFilters.type = 'price_margin';
  }
}

function closeSkuModal() {
  document.getElementById('skuModal').classList.remove('open');
  state.activeSku = null;
}

function openSkuModal(articleKey) {
  renderSkuModal(articleKey);
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  rerenderCurrentView();
}

function rerenderCurrentView() {
  renderDashboard();
  renderControlCenter();
  renderSkuRegistry();
  renderLaunches();
  renderMeetings();
}

function setAppError(message = '') {
  const banner = document.getElementById('appError');
  if (!message) {
    banner.classList.add('hidden');
    banner.textContent = '';
    return;
  }
  banner.textContent = message;
  banner.classList.remove('hidden');
}

function attachGlobalListeners() {
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));

  document.body.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-open-sku]');
    if (openBtn) {
      openSkuModal(openBtn.dataset.openSku);
      return;
    }

    const closeBtn = event.target.closest('[data-close-modal]');
    if (closeBtn) {
      closeSkuModal();
      return;
    }

    const presetBtn = event.target.closest('[data-control-preset]');
    if (presetBtn) {
      applyControlPreset(presetBtn.dataset.controlPreset);
      setView('control');
      return;
    }

    if (event.target.closest('[data-view-control]')) {
      setView('control');
      return;
    }

    const takeBtn = event.target.closest('[data-take-task]');
    if (takeBtn) {
      takeAutoTask(takeBtn.dataset.takeTask);
    }
  });

  document.body.addEventListener('change', (event) => {
    const statusSelect = event.target.closest('.task-status-select');
    if (statusSelect) {
      updateTaskStatus(statusSelect.dataset.taskId, statusSelect.value);
    }
  });

  document.getElementById('skuModal').addEventListener('click', (event) => {
    if (event.target.id === 'skuModal') closeSkuModal();
  });

  document.getElementById('exportStorageBtn').addEventListener('click', exportStorage);
  document.getElementById('importStorageInput').addEventListener('change', async (event) => {
    try {
      await importStorage(event.target.files?.[0]);
      event.target.value = '';
    } catch (error) {
      setAppError(`Не удалось импортировать JSON: ${error.message}`);
    }
  });
}

async function init() {
  try {
    const local = loadLocalStorage();
    const [dashboard, skus, launches, meetings, seed] = await Promise.all([
      loadJson('data/dashboard.json'),
      loadJson('data/skus.json'),
      loadJson('data/launches.json'),
      loadJson('data/meetings.json'),
      loadJson('data/seed_comments.json')
    ]);

    state.dashboard = dashboard;
    state.skus = skus;
    state.launches = launches;
    state.meetings = meetings;
    state.storage.comments = Array.isArray(local.comments) ? local.comments : [];
    state.storage.tasks = normalizeStorageTasks(local.tasks, 'manual');
    mergeSeedStorage(seed);

    attachGlobalListeners();
    rerenderCurrentView();
    setView('dashboard');
    setAppError('');
  } catch (error) {
    console.error(error);
    setAppError(`Портал не смог загрузить данные: ${error.message}`);
  }
}

init();
