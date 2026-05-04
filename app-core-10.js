function buildExecutiveModel() {
  const control = getControlSnapshot();
  const active = sortTasks(control.active.filter((task) => task.status !== 'waiting_rop'));
  const overdue = active.filter(isTaskOverdue);
  const waiting = sortTasks(active.filter((task) => task.status === 'waiting_decision'));
  const critical = sortTasks(active.filter((task) => task.priority === 'critical'));
  const noOwnerTasks = sortTasks(active.filter((task) => !task.owner));
  const launchFocus = getLaunchItems().slice(0, 4);
  const unassignedSkus = state.skus.filter((sku) => !sku?.flags?.assigned).slice(0, 6);
  const escalations = sortTasks(active.filter((task) => (
    task.status === 'waiting_decision'
    || isTaskOverdue(task)
    || task.priority === 'critical'
    || !task.owner
  )));
  return {
    control,
    active,
    overdue,
    waiting,
    waitingCount: waiting.length,
    critical,
    criticalCount: critical.length,
    noOwnerTasks: noOwnerTasks.slice(0, 8),
    noOwnerCount: noOwnerTasks.length,
    launchFocus,
    unassignedSkus,
    escalations: escalations.slice(0, 12)
  };
}

function renderExecutive() {
  const root = document.getElementById('view-executive');
  const model = buildExecutiveModel();
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Руководителю</h2>
        <p>Оставили только то, что требует финального согласования или быстрого решения по сроку, ресурсу и приоритету.</p>
      </div>
      <div class="badge-stack">${badge(`${fmt.int(model.waitingCount)} ждут финала`, model.waitingCount ? 'warn' : 'ok')}${badge(`${fmt.int(model.criticalCount)} критично`, model.criticalCount ? 'danger' : 'ok')}</div>
    </div>

    <div class="kpi-strip">
      <div class="mini-kpi warn"><span>На финальном согласовании</span><strong>${fmt.int(model.waitingCount)}</strong><span>РОП уже согласовал</span></div>
      <div class="mini-kpi danger"><span>Критично</span><strong>${fmt.int(model.criticalCount)}</strong><span>экономика и блокеры</span></div>
      <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(model.overdue.length)}</strong><span>нужен апдейт срока</span></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(model.noOwnerCount)}</strong><span>нужно закрепить</span></div>
      <div class="mini-kpi"><span>Активно в контуре</span><strong>${fmt.int(model.active.length)}</strong><span>всего задач</span></div>
      <div class="mini-kpi"><span>SKU без owner</span><strong>${fmt.int(model.unassignedSkus.length)}</strong><span>в бренде Алтея</span></div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>На финальном согласовании</h3>
            <p class="small muted">Очередь на закрытие: откройте задачу, дайте финальный комментарий и переведите её в архив выполненных.</p>
          </div>
          ${badge(`${fmt.int(model.waitingCount)} шт.`, model.waitingCount ? 'warn' : 'ok')}
        </div>
        <div class="task-mini-grid">${model.waiting.map(renderMiniTask).join('') || '<div class="empty">Нет задач на финальном согласовании</div>'}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Что требует решения сегодня</h3>
            <p class="small muted">Короткий short-list: просрочки, критичные задачи и всё, что зависло без owner.</p>
          </div>
          ${badge(`${fmt.int(model.escalations.length)} в short-list`, model.escalations.length ? 'danger' : 'ok')}
        </div>
        <div class="task-mini-grid">${model.escalations.map(renderMiniTask).join('') || '<div class="empty">Нет срочных эскалаций</div>'}</div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Где не хватает owner</h3>
            <p class="small muted">Здесь видно задачи, которые зависнут первыми, если не закрепить ответственного.</p>
          </div>
          ${badge(`${fmt.int(model.noOwnerCount)} без owner`, model.noOwnerCount ? 'warn' : 'ok')}
        </div>
        <div class="task-mini-grid">${model.noOwnerTasks.map(renderMiniTask).join('') || '<div class="empty">Все задачи уже закреплены</div>'}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Новинки и SKU без owner</h3>
            <p class="small muted">Два частых риска: запуск без сопровождения и товар без явного владельца.</p>
          </div>
          ${badge(`${fmt.int(model.launchFocus.length)} новинок`, model.launchFocus.length ? 'info' : 'ok')}
        </div>
        <div class="alert-stack">
          ${model.launchFocus.map((item) => `
            <div class="alert-row">
              <div>
                <strong>${escapeHtml(item.name || 'Новинка')}</strong>
                <div class="muted small">${escapeHtml(item.launchMonth || '—')} · ${escapeHtml(item.reportGroup || '—')}</div>
              </div>
              <div class="badge-stack">${badge(item.tag || 'новинка', 'info')}${item.production ? badge(item.production) : ''}</div>
              <div class="muted small">${escapeHtml(item.status || 'Статус не указан')}</div>
            </div>
          `).join('')}
          ${model.unassignedSkus.map((sku) => `
            <div class="alert-row">
              <div>
                <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
                <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
              </div>
              <div class="badge-stack">${badge('Без owner', 'warn')}${skuOperationalStatus(sku)}</div>
              <div class="muted small">${escapeHtml(sku.focusReasons || 'Нужно закрепить ответственного и сценарий работы')}</div>
            </div>
          `).join('') || '<div class="empty">Все SKU закреплены</div>'}
        </div>
      </div>
    </div>
  `;
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
  state.storage.ownerOverrides = (state.storage.ownerOverrides || []).filter((item) => item.articleKey !== normalizedArticleKey);
  applyOwnerOverridesToSkus();
  saveLocalStorage();
  try {
    await deleteOwnerOverride(normalizedArticleKey);
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
  if (!normalizedOwnerName) {
    await removeOwnerAssignment(payload?.articleKey || '');
    return;
  }
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

async function updateTaskRecord(taskId, patch = {}) {
  const current = state.storage.tasks.find((item) => item.id === taskId);
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
  renderSkuModal(articleKey);
}

function setView(view) {
  view = typeof normalizePortalView === 'function' ? normalizePortalView(view) : view;
  state.activeView = view;
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
    ['view-ads-funnel', 'Рекламная воронка', () => renderAdsFunnel('view-ads-funnel')],
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

  document.body.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-open-sku]');
    if (openBtn) {
      if (document.getElementById('taskModal')?.classList.contains('open')) closeTaskModal();
      openSkuModal(openBtn.dataset.openSku);
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
    const [dashboard, skus, seed, productLeaderboard, productLeaderboardHistory] = await Promise.all([
      loadJsonOrFallback('data/dashboard.json', { cards: [], generatedAt: '' }, 'Дашборд'),
      loadJsonOrFallback('data/skus.json', [], 'SKU'),
      loadJsonOrFallback('data/seed_comments.json', { comments: [], tasks: [] }, 'Seed comments'),
      loadJsonOrFallback('data/product_leaderboard.json', { generatedAt: '', items: [], summary: {} }, 'Продуктовый лидерборд'),
      loadJsonOrFallback('data/product_leaderboard_history.json', [], 'История продуктового лидерборда')
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
      repricerCorridorDeletes: Array.isArray(local.repricerCorridorDeletes) ? local.repricerCorridorDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey) : []
    };
    applyOwnerOverridesToSkus();
    mergeSeedStorage(seed || {});
    state.boot.dataReady = true;
    rerenderCurrentView();
    setView('dashboard');
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
