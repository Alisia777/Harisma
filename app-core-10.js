const EXECUTIVE_MARKETPLACE_KEYS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'];
const EXECUTIVE_SUPPORT_KEYS = ['cross', 'product'];
const EXECUTIVE_WORKSTREAM_KEYS = [...EXECUTIVE_MARKETPLACE_KEYS, ...EXECUTIVE_SUPPORT_KEYS];

function buildExecutiveWorkstreamSummary(active, key) {
  const tasks = sortTasks(active.filter((task) => controlWorkstreamKey(task, getSku(task.articleKey)) === key));
  const waitingRop = sortTasks(tasks.filter((task) => task.status === 'waiting_rop'));
  const waitingDirector = sortTasks(tasks.filter((task) => task.status === 'waiting_decision'));
  const overdue = tasks.filter(isTaskOverdue);
  const critical = tasks.filter((task) => task.priority === 'critical');
  const noOwner = tasks.filter((task) => !task.owner);
  const hotTasks = sortTasks(tasks.filter((task) => (
    task.status === 'waiting_decision'
    || task.status === 'waiting_rop'
    || isTaskOverdue(task)
    || task.priority === 'critical'
    || !task.owner
  ))).slice(0, 4);
  return {
    key,
    meta: controlWorkstreamMeta(key),
    tasks,
    activeCount: tasks.length,
    waitingRop,
    waitingRopCount: waitingRop.length,
    waitingDirector,
    waitingDirectorCount: waitingDirector.length,
    overdueCount: overdue.length,
    criticalCount: critical.length,
    noOwnerCount: noOwner.length,
    hotTasks,
    ownerPreview: [...new Set(tasks.map((task) => task.owner).filter(Boolean))].slice(0, 3)
  };
}

function buildExecutiveModel() {
  const control = getControlSnapshot();
  const active = sortTasks(control.active);
  const workstreams = EXECUTIVE_WORKSTREAM_KEYS.map((key) => buildExecutiveWorkstreamSummary(active, key));
  const waitingRop = sortTasks(active.filter((task) => task.status === 'waiting_rop'));
  const waitingDirector = sortTasks(active.filter((task) => task.status === 'waiting_decision'));
  const overdue = active.filter(isTaskOverdue);
  const critical = sortTasks(active.filter((task) => task.priority === 'critical'));
  const noOwnerTasks = sortTasks(active.filter((task) => !task.owner));
  const launchFocus = getLaunchItems().slice(0, 4);
  const unassignedSkus = state.skus.filter((sku) => !sku?.flags?.assigned).slice(0, 6);
  const escalations = sortTasks(active.filter((task) => (
    task.status === 'waiting_decision'
    || task.status === 'waiting_rop'
    || isTaskOverdue(task)
    || task.priority === 'critical'
    || !task.owner
  )));
  return {
    control,
    active,
    workstreams,
    marketplaceRows: workstreams.filter((row) => EXECUTIVE_MARKETPLACE_KEYS.includes(row.key)),
    supportRows: workstreams.filter((row) => EXECUTIVE_SUPPORT_KEYS.includes(row.key)),
    waitingRop,
    waitingRopCount: waitingRop.length,
    waitingDirector,
    waitingDirectorCount: waitingDirector.length,
    overdue,
    critical,
    criticalCount: critical.length,
    noOwnerTasks: noOwnerTasks.slice(0, 8),
    noOwnerCount: noOwnerTasks.length,
    launchFocus,
    unassignedSkus,
    escalations: escalations.slice(0, 12),
    riskWorkstreamCount: workstreams.filter((row) => row.overdueCount || row.criticalCount || row.noOwnerCount || row.waitingRopCount || row.waitingDirectorCount).length
  };
}

function renderExecutiveWorkstreamCard(row) {
  const hasRisk = row.overdueCount || row.criticalCount || row.noOwnerCount || row.waitingRopCount || row.waitingDirectorCount;
  const ownerText = row.ownerPreview.length ? row.ownerPreview.join(' · ') : 'owner не выделен';
  return `
    <div class="card executive-market-card ${hasRisk ? 'has-risk' : ''}">
      <div class="section-subhead">
        <div>
          <h3>${escapeHtml(row.meta.label)}</h3>
          <p class="small muted">${escapeHtml(ownerText)}</p>
        </div>
        ${badge(`${fmt.int(row.activeCount)} активных`, row.activeCount ? row.meta.kind : 'ok')}
      </div>
      <div class="badge-stack">
        ${badge(`РОП ${fmt.int(row.waitingRopCount)}`, row.waitingRopCount ? 'warn' : 'ok')}
        ${badge(`финал ${fmt.int(row.waitingDirectorCount)}`, row.waitingDirectorCount ? 'danger' : 'ok')}
        ${badge(`проср. ${fmt.int(row.overdueCount)}`, row.overdueCount ? 'danger' : '')}
        ${badge(`без owner ${fmt.int(row.noOwnerCount)}`, row.noOwnerCount ? 'warn' : '')}
      </div>
      <div class="task-mini-grid" style="margin-top:12px">
        ${row.hotTasks.length ? row.hotTasks.map(renderMiniTask).join('') : '<div class="empty">Срочных задач нет</div>'}
      </div>
      <button class="btn small-btn" type="button" data-executive-open-workstream="${escapeHtml(row.key)}">Открыть задачи ${escapeHtml(row.meta.chip)}</button>
    </div>
  `;
}

function renderExecutiveWorkstreamRow(row) {
  return `
    <div class="executive-market-row">
      <div>
        <strong>${escapeHtml(row.meta.label)}</strong>
        <div class="muted small">${escapeHtml(row.ownerPreview.length ? row.ownerPreview.join(' · ') : 'Ответственные появятся из задач')}</div>
      </div>
      <div class="badge-stack">
        ${badge(`активно ${fmt.int(row.activeCount)}`, row.activeCount ? row.meta.kind : '')}
        ${badge(`РОП ${fmt.int(row.waitingRopCount)}`, row.waitingRopCount ? 'warn' : 'ok')}
        ${badge(`финал ${fmt.int(row.waitingDirectorCount)}`, row.waitingDirectorCount ? 'danger' : 'ok')}
        ${badge(`проср. ${fmt.int(row.overdueCount)}`, row.overdueCount ? 'danger' : 'ok')}
        ${badge(`без owner ${fmt.int(row.noOwnerCount)}`, row.noOwnerCount ? 'warn' : 'ok')}
      </div>
      <button class="btn ghost small-btn" type="button" data-executive-open-workstream="${escapeHtml(row.key)}">Показать</button>
    </div>
  `;
}

function renderExecutive() {
  const root = document.getElementById('view-executive');
  const model = buildExecutiveModel();
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Руководителю</h2>
        <p>Свод по РОПам и маркетплейсам: каждый контур видит свои задачи, руководитель видит риски, просрочки и финальные согласования.</p>
      </div>
      <div class="badge-stack">${badge(`${fmt.int(model.waitingDirectorCount)} ждут финала`, model.waitingDirectorCount ? 'danger' : 'ok')}${badge(`${fmt.int(model.waitingRopCount)} ждут РОПа`, model.waitingRopCount ? 'warn' : 'ok')}</div>
    </div>

    <div class="kpi-strip">
      <div class="mini-kpi danger"><span>Финал</span><strong>${fmt.int(model.waitingDirectorCount)}</strong><span>управленческое решение</span></div>
      <div class="mini-kpi warn"><span>У РОПов</span><strong>${fmt.int(model.waitingRopCount)}</strong><span>согласование площадки</span></div>
      <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(model.overdue.length)}</strong><span>нужен апдейт срока</span></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(model.noOwnerCount)}</strong><span>нужно закрепить</span></div>
      <div class="mini-kpi"><span>Активно</span><strong>${fmt.int(model.active.length)}</strong><span>все задачи</span></div>
      <div class="mini-kpi"><span>Контуры с риском</span><strong>${fmt.int(model.riskWorkstreamCount)}</strong><span>площадки и блоки</span></div>
    </div>

    <div class="executive-market-grid" style="margin-top:14px">
      ${model.marketplaceRows.map(renderExecutiveWorkstreamCard).join('')}
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>У РОПов на согласовании</h3>
            <p class="small muted">Задачи уже сданы исполнителем и ждут решения конкретной площадки.</p>
          </div>
          ${badge(`${fmt.int(model.waitingRopCount)} шт.`, model.waitingRopCount ? 'warn' : 'ok')}
        </div>
        <div class="task-mini-grid">${model.waitingRop.slice(0, 8).map(renderMiniTask).join('') || '<div class="empty">Нет задач на согласовании у РОПов</div>'}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Финал руководителя</h3>
            <p class="small muted">РОП уже согласовал, осталось зафиксировать итог или вернуть задачу обратно.</p>
          </div>
          ${badge(`${fmt.int(model.waitingDirectorCount)} шт.`, model.waitingDirectorCount ? 'danger' : 'ok')}
        </div>
        <div class="task-mini-grid">${model.waitingDirector.slice(0, 8).map(renderMiniTask).join('') || '<div class="empty">Нет задач на финальном согласовании</div>'}</div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Матрица ответственности</h3>
          <p class="small muted">Одна строка — один контур. Нажмите “Показать”, чтобы перейти в задачи уже с фильтром этой площадки.</p>
        </div>
        ${badge(`${fmt.int(model.workstreams.length)} контуров`, 'info')}
      </div>
      <div class="executive-market-table">${model.workstreams.map(renderExecutiveWorkstreamRow).join('')}</div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Сквозные и продуктовые</h3>
            <p class="small muted">Общие вопросы и продуктовые запуски отдельно от WB/Ozon.</p>
          </div>
        </div>
        <div class="executive-market-table">${model.supportRows.map(renderExecutiveWorkstreamRow).join('')}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Что требует решения сегодня</h3>
            <p class="small muted">Просрочки, критичные задачи и всё, что зависло без owner.</p>
          </div>
          ${badge(`${fmt.int(model.escalations.length)} в short-list`, model.escalations.length ? 'danger' : 'ok')}
        </div>
        <div class="task-mini-grid">${model.escalations.map(renderMiniTask).join('') || '<div class="empty">Нет срочных эскалаций</div>'}</div>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-executive-open-workstream]').forEach((button) => button.addEventListener('click', () => {
    state.controlFilters.platform = button.dataset.executiveOpenWorkstream || 'all';
    state.controlFilters.status = 'active';
    state.controlFilters.horizon = 'all';
    state.controlFilters.source = 'all';
    state.controlFilters.lazyQueue = 'mine';
    setView('control');
  }));
}

async function createComment(payload) {
  const comment = normalizeComment({
    id: uid('comment'),
    articleKey: payload.articleKey,
    author: String(payload.author || state.team.member.name || 'Команда').trim() || 'Команда',
    team: String(payload.team || teamMemberLabel()).trim() || 'Команда',
    createdAt: new Date().toISOString(),
    text: String(payload.text || '').trim(),
    type: String(payload.type || 'signal')
  });
  if (!comment.text) return;
  state.storage.comments.unshift(comment);
  saveLocalStorage();
  try {
    await persistComment(comment);
  } catch (error) {
    console.error(error);
  }
}

async function createTaskHistoryEntry(taskId, kind, text, payload = {}) {
  const task = getTask(taskId);
  if (!task || !String(text || '').trim()) return;
  await createComment({
    articleKey: task.articleKey || '',
    author: payload.author || state.team.member.name || task.owner || 'Команда',
    team: payload.team || teamMemberLabel(),
    type: 'task_log',
    text: `[[task:${taskId}]] [[kind:${kind}]] ${String(text || '').trim()}`
  });
}

async function removeOwnerAssignment(articleKey) {
  const normalizedArticleKey = String(articleKey || '').trim();
  if (!normalizedArticleKey) return;
  const clearedOverride = normalizeOwnerOverride({
    articleKey: normalizedArticleKey,
    ownerName: '',
    ownerRole: '',
    note: '',
    updatedAt: new Date().toISOString(),
    assignedBy: state.team.member.name || 'Команда'
  });
  state.storage.ownerOverrides = (state.storage.ownerOverrides || []).filter((item) => item.articleKey !== normalizedArticleKey);
  state.storage.ownerOverrides.unshift(clearedOverride);
  applyOwnerOverridesToSkus();
  saveLocalStorage();
  try {
    await persistOwnerOverride(clearedOverride);
  } catch (error) {
    console.error(error);
  }
}

function buildTaskUpdateMessage(before, after) {
  const changes = [];
  if (before.title !== after.title) changes.push(`заголовок → ${after.title}`);
  if ((before.owner || '') !== (after.owner || '')) changes.push(`owner → ${after.owner || 'Без owner'}`);
  if ((before.due || '') !== (after.due || '')) changes.push(`срок → ${after.due || '—'}`);
  if (before.status !== after.status) changes.push(`статус → ${(TASK_STATUS_META[after.status] || TASK_STATUS_META.new).label}`);
  if (before.priority !== after.priority) changes.push(`приоритет → ${(PRIORITY_META[after.priority] || PRIORITY_META.medium).label}`);
  if (before.type !== after.type) changes.push(`тип → ${TASK_TYPE_META[after.type] || TASK_TYPE_META.general}`);
  if (before.platform !== after.platform) changes.push(`контур → ${controlWorkstreamMeta(controlWorkstreamKey(after, getSku(after.articleKey))).label}`);
  if ((before.nextAction || '') !== (after.nextAction || '')) changes.push('обновлён следующий шаг');
  if ((before.reason || '') !== (after.reason || '')) changes.push('обновлён контекст');
  if ((before.entityLabel || '') !== (after.entityLabel || '')) changes.push(`тема → ${after.entityLabel || '—'}`);
  return changes.length ? `Изменения по задаче: ${changes.join('; ')}.` : '';
}

async function upsertOwnerAssignment(payload) {
  const normalizedOwnerName = canonicalOwnerName(payload?.ownerName || '');
  const override = normalizeOwnerOverride({
    articleKey: payload.articleKey,
    ownerName: normalizedOwnerName,
    ownerRole: payload.ownerRole,
    note: payload.note,
    updatedAt: new Date().toISOString(),
    assignedBy: state.team.member.name || 'Команда'
  });
  state.storage.ownerOverrides = (state.storage.ownerOverrides || []).filter((item) => item.articleKey !== override.articleKey);
  state.storage.ownerOverrides.unshift(override);
  applyOwnerOverridesToSkus();
  saveLocalStorage();
  try {
    await persistOwnerOverride(override);
  } catch (error) {
    console.error(error);
  }
}

async function createDecision(payload) {
  const decision = normalizeDecision({
    id: uid('decision'),
    articleKey: payload.articleKey,
    title: payload.title,
    decision: payload.decision,
    owner: payload.owner,
    status: payload.status,
    due: payload.due,
    createdAt: new Date().toISOString(),
    createdBy: state.team.member.name || 'Команда'
  });
  if (!decision.decision) return;
  state.storage.decisions.unshift(decision);
  saveLocalStorage();
  try {
    await persistDecision(decision);
  } catch (error) {
    console.error(error);
  }
}

async function createManualTask(payload) {
  const skipRerender = Boolean(payload?.skipRerender);
  const task = normalizeTask({
    id: uid('task'),
    source: 'manual',
    articleKey: payload.articleKey,
    entityLabel: payload.entityLabel,
    title: String(payload.title || '').trim() || 'Новая задача',
    type: payload.type,
    priority: payload.priority,
    platform: payload.platform,
    owner: String(payload.owner || '').trim(),
    due: payload.due || plusDays(3),
    status: 'new',
    nextAction: String(payload.nextAction || '').trim(),
    reason: String(payload.reason || '').trim()
  }, 'manual');
  state.storage.tasks.unshift(task);
  saveLocalStorage();
  try {
    await persistTask(task);
  } catch (error) {
    console.error(error);
  }
  await createTaskHistoryEntry(task.id, 'created', `Задача создана${task.owner ? ` · owner ${task.owner}` : ''}${task.due ? ` · срок ${task.due}` : ''}.`);
  if (!skipRerender) {
    rerenderCurrentView();
    if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
  }
  return task;
}

async function takeAutoTask(taskId) {
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
  try {
    await persistTask(manual);
  } catch (error) {
    console.error(error);
  }
  await createTaskHistoryEntry(manual.id, 'created', 'Авто-сигнал взят в ручную работу и переведён в контур команды.');
  rerenderCurrentView();
  if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
  openTaskModal(manual.id);
}

async function ensureTaskRecordForUpdate(taskId) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return null;

  const existing = state.storage.tasks.find((item) => item.id === normalizedTaskId);
  if (existing) return existing;

  const sourceTask = getAllTasks().find((item) => item.id === normalizedTaskId);
  if (!sourceTask) return null;

  const materialized = normalizeTask({
    ...sourceTask,
    id: normalizedTaskId,
    source: 'manual',
    createdAt: sourceTask.createdAt || new Date().toISOString()
  }, 'manual');

  state.storage.tasks.unshift(materialized);
  saveLocalStorage();
  try {
    await persistTask(materialized);
  } catch (error) {
    console.error(error);
  }
  return materialized;
}

async function updateTaskRecord(taskId, patch = {}) {
  const current = await ensureTaskRecordForUpdate(taskId);
  if (!current) return null;

  const before = { ...current };
  const updated = normalizeTask({
    ...current,
    ...patch,
    id: current.id,
    source: current.source,
    createdAt: current.createdAt,
    articleKey: patch.articleKey !== undefined ? patch.articleKey : current.articleKey
  }, current.source || 'manual');

  Object.assign(current, updated);
  saveLocalStorage();
  try {
    await persistTask(current);
  } catch (error) {
    console.error(error);
  }

  const historyMessage = buildTaskUpdateMessage(before, current);
  if (historyMessage) await createTaskHistoryEntry(taskId, current.status !== before.status ? 'status' : 'updated', historyMessage);

  rerenderCurrentView();
  if (state.activeSku === current.articleKey) renderSkuModal(current.articleKey);
  return current;
}

async function updateTaskStatus(taskId, status) {
  return updateTaskRecord(taskId, { status });
}

async function closeTaskWithReport(taskId, report) {
  const task = await updateTaskRecord(taskId, { status: 'done' });
  if (!task) return null;
  await createTaskHistoryEntry(taskId, 'report', `Задача закрыта с отчётом: ${report}`);
  return task;
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
  const rawKey = String(articleKey ?? '').trim();
  const sku = getSku(rawKey);

  if (!sku) {
    if (rawKey) {
      state.filters.search = rawKey;
      state.filters.market = 'all';
      state.filters.focus = 'all';
      state.filters.assignment = 'all';
      setView('skus');
    }
    setAppError(rawKey
      ? `SKU ${rawKey} не найден в реестре. Открыла Реестр SKU и поставила поиск по артикулу.`
      : 'Не удалось открыть SKU: в кнопке нет артикула.');
    window.setTimeout(() => {
      if (!(state.runtimeErrors || []).length) setAppError('');
    }, 2400);
    return false;
  }

  renderSkuModal(skuPrimaryKey(sku, rawKey));
  return true;
}

const ACTIVE_VIEW_STORAGE_KEY = 'altea-portal-active-view-v1';

function normalizeViewName(view) {
  return typeof normalizePortalView === 'function' ? normalizePortalView(view) : view;
}

function readViewFromHash() {
  const raw = String(window.location.hash || '').replace(/^#/, '').trim();
  if (!raw) return '';
  return normalizeViewName(raw);
}

function readPersistedView() {
  try {
    const raw = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    const candidate = typeof parsed === 'string' ? parsed : parsed?.activeView;
    return candidate ? normalizeViewName(candidate) : '';
  } catch (error) {
    return '';
  }
}

function persistActiveView(view) {
  try {
    localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, JSON.stringify({
      activeView: view,
      updatedAt: new Date().toISOString()
    }));
  } catch (error) {
    // LocalStorage может быть недоступен в приватном режиме.
  }
}

function syncHashWithView(view) {
  if (!window?.history || !window?.location) return;
  const targetHash = `#${view}`;
  if (window.location.hash === targetHash) return;
  const nextUrl = `${window.location.pathname}${window.location.search}${targetHash}`;
  window.history.replaceState(window.history.state || null, '', nextUrl);
}

function resolveInitialView() {
  return readViewFromHash() || readPersistedView() || normalizeViewName(state.activeView || 'dashboard');
}

function setView(view, options = {}) {
  view = normalizeViewName(view);
  const persist = options.persist !== false;
  const syncHash = options.syncHash !== false;
  state.activeView = view;
  if (persist) persistActiveView(view);
  if (syncHash) syncHashWithView(view);
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  window.dispatchEvent(new CustomEvent('altea:viewchange', { detail: { view } }));
  void prepareView(view);
}

async function prepareView(view) {
  view = typeof normalizePortalView === 'function' ? normalizePortalView(view) : view;
  if (!state.boot.dataReady) {
    rerenderCurrentView();
    return;
  }

  const lazyKey = VIEW_DATA_REQUIREMENTS[view];
  if (lazyKey && !state.boot.lazyReady?.[lazyKey]) {
    renderViewLoading(`view-${view}`, VIEW_TITLES[view] || 'Экран');
  }

  try {
    await ensureViewData(view);
  } catch (error) {
    console.error(error);
    renderViewFailure(`view-${view}`, VIEW_TITLES[view] || 'Экран', error);
    setAppError(`Портал не смог подгрузить ${VIEW_TITLES[view] || 'экран'}: ${error.message}`);
    return;
  }

  if (state.activeView !== view) return;
  rerenderCurrentView();
}

function renderViewFailure(rootId, title, error) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = `
    <div class="card">
      <div class="head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <div class="muted small">Экран не удалось отрисовать полностью</div>
        </div>
        ${badge('ошибка', 'danger')}
      </div>
      <div class="muted" style="margin-top:10px">${escapeHtml(error?.message || 'Неизвестная ошибка')}</div>
      <div class="muted small" style="margin-top:8px">Обнови страницу после фикса или синка. Остальные разделы портала продолжают работать.</div>
    </div>
  `;
}

function renderDashboardView() {
  const interactiveApi = window.__ALTEA_DASHBOARD_INTERACTIVE_API__;
  if (interactiveApi && typeof interactiveApi.prime === 'function') {
    interactiveApi.prime(false);
    return;
  }
  renderDashboard();
}

function rerenderCurrentView() {
  applyOwnerOverridesToSkus();
  const renderPlan = [
    ['view-sku-plan-fact', 'План-факт SKU', () => renderSkuPlanFact('view-sku-plan-fact')],
    ['view-wb-rating', 'Рейтинг карточек', () => renderWbCardRating('view-wb-rating')],
    ['view-ads-funnel', 'Рекламная воронка', () => renderAdsFunnel('view-ads-funnel')],
    ['view-iu-drr', 'ИУ / ДРР', () => renderIuDrr('view-iu-drr')],
    ['view-dashboard', 'Дашборд', renderDashboardView],
    ['view-documents', 'Документы', renderDocuments],
    ['view-repricer', 'Репрайсер', renderRepricer],
    ['view-prices', 'Цены', () => { if (typeof window.renderPriceWorkbench === 'function') window.renderPriceWorkbench(); }],
    ['view-order', 'Логистика и заказ', () => { if (typeof renderOrderCalculator === 'function') renderOrderCalculator(); }],
    ['view-control', 'Задачи', renderControlCenter],
    ['view-skus', 'Реестр SKU', renderSkuRegistry],
    ['view-launches', 'Продукт / Ксения', renderLaunches],
    ['view-product-leaderboard', 'Продуктовый лидерборд', renderProductLeaderboard],
    ['view-launch-control', 'Запуск новинок', renderLaunchControl],
    ['view-meetings', 'Ритм работы', renderMeetings],
    ['view-executive', 'Руководителю', renderExecutive]
  ];
  const errors = [];
  const activeView = typeof normalizePortalView === 'function'
    ? normalizePortalView(state.activeView || 'dashboard')
    : (state.activeView || 'dashboard');
  if (state.activeView !== activeView) state.activeView = activeView;
  const activeRootId = `view-${activeView}`;
  const activeEntry = renderPlan.find(([rootId]) => rootId === activeRootId) || renderPlan[0];
  if (activeEntry) {
    const [rootId, title, renderer] = activeEntry;
    try {
      renderer();
    } catch (error) {
      console.error(error);
      errors.push(`${title}: ${error.message}`);
      renderViewFailure(rootId, title, error);
    }
  }
  state.runtimeErrors = errors;
  updateSyncBadge();
  if (errors.length) setAppError(`Портал загрузил не всё: ${errors[0]}`);
  else if (Array.isArray(state.boot?.dataWarnings) && state.boot.dataWarnings.length) setAppError(`Предупреждение по данным: ${state.boot.dataWarnings[0]}`);
  else setAppError('');
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
  if (state.boot.listenersAttached) return;
  state.boot.listenersAttached = true;
  ensureTaskModal();
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
  window.addEventListener('hashchange', () => {
    const hashView = readViewFromHash();
    if (!hashView || hashView === state.activeView) return;
    setView(hashView, { syncHash: false, persist: true });
  });

  document.body.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-open-sku]');
    if (openBtn) {
      event.preventDefault();
      event.stopPropagation();
      const opened = openSkuModal(openBtn.dataset.openSku || openBtn.getAttribute('data-open-sku'));
      if (opened && document.getElementById('taskModal')?.classList.contains('open')) closeTaskModal();
      return;
    }

    const openTaskBtn = event.target.closest('[data-open-task]');
    if (openTaskBtn) {
      openTaskModal(openTaskBtn.dataset.openTask);
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

    if (event.target.closest('[data-view-executive]')) {
      setView('executive');
      return;
    }

    const takeBtn = event.target.closest('[data-take-task]');
    if (takeBtn) {
      takeAutoTask(takeBtn.dataset.takeTask);
      return;
    }
  });

  document.getElementById('skuModal').addEventListener('click', (event) => {
    if (event.target.id === 'skuModal') closeSkuModal();
  });

  document.getElementById('exportStorageBtn').addEventListener('click', exportStorage);
  document.getElementById('pullRemoteBtn').addEventListener('click', async () => { await pullRemoteState(true); });
  document.getElementById('pushRemoteBtn').addEventListener('click', async () => { await pushStateToRemote(); });
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
  attachGlobalListeners();
  state.boot.dataWarnings = [];
  window.__ALTEA_PRIMARY_INIT_PENDING__ = true;
  // Критично: попытка подключения к Supabase не должна зависеть от первого рендера.
  // Иначе любой сбой данных/экрана создает ложное ощущение, что портал даже не пытался подключиться.
  const teamInitPromise = initTeamStore()
    .then(() => {
      if (!state.boot.dataReady) return;
      try {
        rerenderCurrentView();
        if (state.activeSku) renderSkuModal(state.activeSku);
      } catch (error) {
        console.error(error);
        setAppError(`Командная база подключена, но экран не удалось перерисовать: ${error.message}`);
      }
    })
    .catch((error) => {
      console.error(error);
      setAppError(`Портал открылся локально: ${error.message || 'ошибка подключения к командной базе'}`);
    });

  try {
    const local = loadLocalStorage();
    const [dashboard, skus, seed, productLeaderboard, productLeaderboardHistory, skuMatrix] = await Promise.all([
      loadJsonOrFallback('data/dashboard.json', { cards: [], generatedAt: '' }, 'Дашборд'),
      loadJsonOrFallback('data/skus.json', [], 'SKU'),
      loadJsonOrFallback('data/seed_comments.json', { comments: [], tasks: [] }, 'Seed comments'),
      loadJsonOrFallback('data/product_leaderboard.json', { generatedAt: '', items: [], summary: {} }, 'Продуктовый лидерборд'),
      loadJsonOrFallback('data/product_leaderboard_history.json', [], 'История продуктового лидерборда'),
      loadJsonOrFallback('data/sku_matrix.json', { schema: 'portal-sku-matrix-v1', summary: {}, items: [], apiUnmapped: [], ignoredApiSku: [], indexes: { byArticleKey: {}, aliasToArticleKey: {} } }, 'SKU matrix')
    ]);

    state.dashboard = dashboard || { cards: [] };
    state.skus = Array.isArray(skus) ? skus : [];
    state.launches = [];
    state.meetings = [];
    state.documents = { groups: [] };
    state.productLeaderboard = typeof normalizeProductLeaderboardPayload === 'function'
      ? normalizeProductLeaderboardPayload(productLeaderboard)
      : (productLeaderboard || { generatedAt: '', items: [], summary: {} });
    state.productLeaderboardHistory = Array.isArray(productLeaderboardHistory) ? productLeaderboardHistory : [];
    state.skuMatrix = skuMatrix && typeof skuMatrix === 'object'
      ? skuMatrix
      : { schema: 'portal-sku-matrix-v1', summary: {}, items: [], apiUnmapped: [], ignoredApiSku: [], indexes: { byArticleKey: {}, aliasToArticleKey: {} } };
    state.boot.lazyReady.productLeaderboard = true;
    state.repricer = { generatedAt: '', summary: {}, rows: [] };
    if (!state.orderCalc.articleKey) state.orderCalc.articleKey = state.skus[0]?.articleKey || '';
    if (!state.orderCalc.daysToNextReceipt) state.orderCalc.daysToNextReceipt = String(Math.round(numberOrZero(state.skus[0]?.leadTimeDays) || 30));
    state.storage = {
      comments: Array.isArray(local.comments) ? local.comments : [],
      tasks: Array.isArray(local.tasks) ? local.tasks : [],
      decisions: Array.isArray(local.decisions) ? local.decisions : [],
      ownerOverrides: Array.isArray(local.ownerOverrides) ? local.ownerOverrides : [],
      repricerSettings: normalizeRepricerSettings(local.repricerSettings || {}),
      repricerSettingsUpdatedAt: String(local.repricerSettingsUpdatedAt || '').trim(),
      repricerOverrides: Array.isArray(local.repricerOverrides) ? local.repricerOverrides.map(normalizeRepricerOverride).filter((item) => item.articleKey) : [],
      repricerSkuProfiles: Array.isArray(local.repricerSkuProfiles) ? local.repricerSkuProfiles.map(normalizeRepricerSkuProfile).filter((item) => item.articleKey) : [],
      repricerCorridors: Array.isArray(local.repricerCorridors) ? local.repricerCorridors.map(normalizeRepricerCorridor).filter((item) => item.articleKey) : [],
      repricerOverrideDeletes: Array.isArray(local.repricerOverrideDeletes) ? local.repricerOverrideDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey) : [],
      repricerSkuProfileDeletes: Array.isArray(local.repricerSkuProfileDeletes) ? local.repricerSkuProfileDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey) : [],
      repricerCorridorDeletes: Array.isArray(local.repricerCorridorDeletes) ? local.repricerCorridorDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey) : [],
      repricerPendingApiAdds: Array.isArray(local.repricerPendingApiAdds) ? local.repricerPendingApiAdds.filter((item) => item && typeof item === 'object') : [],
      repricerPendingApiDeletes: Array.isArray(local.repricerPendingApiDeletes) ? local.repricerPendingApiDeletes.filter((item) => item && typeof item === 'object') : [],
      repricerPendingCostFixes: Array.isArray(local.repricerPendingCostFixes) ? local.repricerPendingCostFixes.filter((item) => item && typeof item === 'object') : [],
      repricerPendingApiTasks: Array.isArray(local.repricerPendingApiTasks) ? local.repricerPendingApiTasks.filter((item) => item && typeof item === 'object') : [],
      repricerRepairHistory: Array.isArray(local.repricerRepairHistory) ? local.repricerRepairHistory.filter((item) => item && typeof item === 'object').slice(0, 400) : [],
      repricerRepairSnapshots: Array.isArray(local.repricerRepairSnapshots) ? local.repricerRepairSnapshots.filter((item) => item && typeof item === 'object').slice(0, 10) : [],
      repricerApiReconcileHistory: Array.isArray(local.repricerApiReconcileHistory) ? local.repricerApiReconcileHistory.filter((item) => item && typeof item === 'object').slice(0, 100) : [],
      repricerLastAuditImport: local.repricerLastAuditImport && typeof local.repricerLastAuditImport === 'object' ? local.repricerLastAuditImport : null,
      repricerLastAutoFix: local.repricerLastAutoFix && typeof local.repricerLastAutoFix === 'object' ? local.repricerLastAutoFix : null,
      repricerLastImportValidation: local.repricerLastImportValidation && typeof local.repricerLastImportValidation === 'object' ? local.repricerLastImportValidation : null,
      repricerLastApiReconcile: local.repricerLastApiReconcile && typeof local.repricerLastApiReconcile === 'object' ? local.repricerLastApiReconcile : null
    };
    applyOwnerOverridesToSkus();
    mergeSeedStorage(seed || {});
    state.boot.dataReady = true;
    rerenderCurrentView();
    setView(resolveInitialView(), { persist: true, syncHash: true });
    if (state.boot.dataWarnings.length) setAppError(`Часть данных загружена с исправлениями: ${state.boot.dataWarnings[0]}`);
    else setAppError('');
  } catch (error) {
    console.error(error);
    setAppError(`Портал не смог загрузить данные: ${error.message}`);
  } finally {
    window.__ALTEA_PRIMARY_INIT_PENDING__ = false;
    window.__ALTEA_PRIMARY_INIT_FINISHED__ = true;
  }

  return teamInitPromise;
}

init();
