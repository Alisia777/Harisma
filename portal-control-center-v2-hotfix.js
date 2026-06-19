(function () {
  if (window.__ALTEA_CONTROL_CENTER_V2_HOTFIX_20260421__) return;
  window.__ALTEA_CONTROL_CENTER_V2_HOTFIX_20260421__ = true;

  const TASK_LOG_META = {
    created: { label: 'Создана', tone: 'info' },
    updated: { label: 'Изменена', tone: 'warn' },
    comment: { label: 'Комментарий', tone: 'ok' },
    status: { label: 'Статус', tone: 'info' },
    report: { label: 'Отчёт', tone: 'ok' }
  };

  const CONTROL_WORKSTREAM_META = {
    all: { label: 'Все задачи', chip: 'Все контуры', kind: '' },
    wb: { label: 'РОП WB', chip: 'WB', kind: 'warn' },
    ozon: { label: 'РОП Ozon', chip: 'Ozon', kind: 'info' },
    ya: { label: 'Я.Маркет', chip: 'Я.Маркет', kind: 'ok' },
    goldapple: { label: 'Золотое яблоко', chip: 'Золотое яблоко', kind: 'ok' },
    letu: { label: "Л'Этуаль", chip: "Л'Этуаль", kind: 'ok' },
    magnit: { label: 'Магнит Маркет', chip: 'Магнит Маркет', kind: 'ok' },
    product: { label: 'Новинки', chip: 'Новинки', kind: 'info' },
    executive: { label: 'Управленческий финал', chip: 'Финал', kind: 'danger' },
    cross: { label: 'Общий контур', chip: 'Общий контур', kind: '' }
  };
  const CONTROL_TASK_PLATFORM_FILTERS = ['all', 'wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'cross', 'product'];
  const CONTROL_ROLE_PRESETS = [
    { key: 'leader', label: 'Все', platform: 'all', text: 'видит всё' },
    { key: 'wb', label: 'РОП WB', platform: 'wb', text: 'только WB' },
    { key: 'ozon', label: 'РОП Ozon', platform: 'ozon', text: 'только Ozon' },
    { key: 'ya', label: 'Я.Маркет', platform: 'ya', text: 'только Я.Маркет' },
    { key: 'goldapple', label: 'ЗЯ', platform: 'goldapple', text: 'только ЗЯ' },
    { key: 'letu', label: "Л'Этуаль", platform: 'letu', text: "только Л'Этуаль" },
    { key: 'magnit', label: 'Магнит', platform: 'magnit', text: 'только Магнит' },
    { key: 'product', label: 'Продукт', platform: 'product', text: 'новинки' }
  ];
  const CONTROL_ROLE_KEYS = CONTROL_ROLE_PRESETS.map((item) => item.key);
  const RETAIL_ROP_WORKSTREAMS = new Set(['ya', 'goldapple', 'letu', 'magnit']);

  const originalRenderControlCenter = typeof renderControlCenter === 'function' ? renderControlCenter : null;
  const originalGetAllTasks = typeof getAllTasks === 'function' ? getAllTasks : null;
  const originalGetControlSnapshot = typeof getControlSnapshot === 'function' ? getControlSnapshot : null;
  const originalGetSkuComments = typeof getSkuComments === 'function' ? getSkuComments : null;
  let controlTaskCacheVersion = 0;
  let controlSnapshotCache = { key: '', value: null };
  const taskTransitionPromises = new Map();
  const finalCloseTaskPromises = new Map();
  const DEPRECATED_AUTO_SIGNAL_CODES = new Set([
    'kz_owner',
    'kz_economics',
    'kz_card',
    'kz_traffic',
    'price_margin',
    'low_stock',
    'negative_margin',
    'assignment'
  ]);

  function parseTaskLogComment(comment) {
    const match = String(comment?.text || '').match(/^\[\[task:([^\]]+)\]\]\s*\[\[kind:([^\]]+)\]\]\s*/i);
    if (!match) return null;
    return {
      taskId: match[1],
      kind: match[2],
      text: String(comment?.text || '').replace(match[0], '').trim()
    };
  }

  function isGoldAppleMarketplaceText(raw, compact) {
    const text = String(raw || '').toLowerCase();
    const flat = String(compact || text.replace(/[\s._'`"\u2019-]+/g, '')).toLowerCase();
    if (['goldapple', 'goldenapple', 'zya', '\u0437\u044f', '\u0437\u043e\u043b\u043e\u0442\u043e\u0435\u044f\u0431\u043b\u043e\u043a\u043e'].includes(flat)) return true;
    if (/(^|[^a-z0-9\u0430-\u044f\u0451])(?:z\s*y\s*a|\u0437\s*\u044f)(?=$|[^a-z0-9\u0430-\u044f\u0451])/i.test(text)) return true;
    return /\u0437\u043e\u043b\u043e\u0442[\u0430-\u044f\u0451\s-]*(\u044f\u0431\u043b\u043e\u043a|\u044f\u0431\u043b)|golden\s*apple|gold[\s_-]*apple|goldapple/i.test(text);
  }

  function inferMarketplacePlatform(text) {
    const raw = String(text || '').trim().toLowerCase();
    const compact = raw.replace(/[\s._'`"\u2019-]+/g, '');
    if (!raw) return '';
    if (isGoldAppleMarketplaceText(raw, compact)) return 'goldapple';
    if (/\u043b[\s'`\u2019.-]*[\u0435\u044d]\u0442\u0443\u0430\u043b|\u043b\u0435\u0442\u0443\u0430\u043b\u044c?|\u043b\u044d\u0442\u0443\u0430\u043b\u044c?|letual|letu|letoile|l[\s'`.-]*etoile/.test(raw) || ['letu', 'letual', 'letoile', '\u043b\u0435\u0442\u0443\u0430\u043b\u044c', '\u043b\u0435\u0442\u0443\u0430\u043b', '\u043b\u044d\u0442\u0443\u0430\u043b\u044c', '\u043b\u044d\u0442\u0443\u0430\u043b'].includes(compact)) return 'letu';
    if (/\u043c\u0430\u0433\u043d\u0438\u0442|magnit|magnet|(^|\W)mm($|\W)/.test(raw) || ['magnit', 'magnitmarket', 'magnet', 'magnetmarket', 'mm', '\u043c\u0430\u0433\u043d\u0438\u0442', '\u043c\u0430\u0433\u043d\u0438\u0442\u043c\u0430\u0440\u043a\u0435\u0442'].includes(compact)) return 'magnit';
    if (/\u044f\u043d\u0434\u0435\u043a\u0441|\u044f[.\s-]?\u043c\u0430\u0440\u043a\u0435\u0442|yandex|(^|[^a-z0-9])(ya|ym)([^a-z0-9]|$)|(^|[^\u0430-\u044f\u04510-9])\u044f\u043c([^\u0430-\u044f\u04510-9]|$)/.test(raw)) return 'ya';
    if (isGoldAppleMarketplaceText(raw, compact)) return 'goldapple';
    if (/\u043b['\u2019]?\s?[\u0435\u044d]\u0442\u0443\u0430\u043b|\u043b\u0435\u0442\u0443\u0430\u043b\u044c|letual|letu|letoile|l['\s.-]*etoile/.test(raw) || ['letu', 'letual', 'letoile'].includes(compact)) return 'letu';
    if (/\u043c\u0430\u0433\u043d\u0438\u0442|magnit|(^|\W)mm($|\W)/.test(raw) || ['magnit', 'magnitmarket', 'mm'].includes(compact)) return 'magnit';
    if (isGoldAppleMarketplaceText(raw, compact)) return 'goldapple';
    if (/\u043b['’]?\s?[\u0435\u044d]\u0442\u0443\u0430\u043b|\u043b\u0435\u0442\u0443\u0430\u043b\u044c|letual|letu/.test(raw)) return 'letu';
    if (/\u043c\u0430\u0433\u043d\u0438\u0442|magnit|(^|\W)mm($|\W)/.test(raw)) return 'magnit';
    if (/\u044f\u043d\u0434\u0435\u043a\u0441|\u044f[.\s-]?\u043c\u0430\u0440\u043a\u0435\u0442|\u044f\u043c|ym|yandex/.test(raw)) return 'ya';
    return '';
  }

  function normalizeTaskPlatform(value, contextText) {
    const raw = String(value || '').trim().toLowerCase();
    const compactRaw = raw.replace(/[\s._'`"\u2019-]+/g, '');
    const text = `${raw} ${String(contextText || '').trim().toLowerCase()}`;
    if (raw === 'cross' || raw === 'common' || raw === 'general' || raw === 'shared') return 'cross';
    if (raw === 'retail') return inferMarketplacePlatform(contextText) || 'cross';
    if (raw === 'wb') return 'wb';
    if (raw === 'ozon') return 'ozon';
    if (raw === 'wb+ozon' || raw === 'wb + ozon' || raw === 'all') return 'cross';
    if (['goldapple', 'goldenapple', 'zya', 'ga'].includes(compactRaw)) return 'goldapple';
    if (['letu', 'letual', 'letoile'].includes(compactRaw)) return 'letu';
    if (['magnit', 'magnitmarket', 'mm'].includes(compactRaw)) return 'magnit';
    if (isGoldAppleMarketplaceText(text, compactRaw)) return 'goldapple';
    if (/л[еэ]туал|летуаль|letual|letu/.test(text)) return 'letu';
    if (/магнит|magnit|mm/.test(text)) return 'magnit';
    if (/продукт|новин|launch|ксени|ксюш|product/.test(text)) return 'product';
    if (/руковод|директор|director|executive/.test(text)) return 'cross';
    if (/яндекс|я[.\s-]?маркет|ym|yandex/.test(text)) return 'ya';
    if (/(^|\W)wb($|\W)|wildberries|вб/.test(text)) return 'wb';
    if (/ozon|озон/.test(text)) return 'ozon';
    return 'cross';
  }

  function controlWorkstreamMeta(key) {
    return CONTROL_WORKSTREAM_META[key] || CONTROL_WORKSTREAM_META.cross;
  }

  function selectedTaskWorkstream() {
    const role = String(state?.controlFilters?.peopleRole || '').trim().toLowerCase();
    const roleMeta = CONTROL_ROLE_PRESETS.find((item) => item.key === role);
    if (roleMeta && roleMeta.platform !== 'all') return roleMeta.platform;
    const raw = String(state?.controlFilters?.platform || 'all').trim().toLowerCase();
    if (raw === 'retail') return 'all';
    return CONTROL_WORKSTREAM_META[raw] ? raw : 'all';
  }

  function marketplaceContextValue(value, depth = 0) {
    if (value == null || depth > 2) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map((item) => marketplaceContextValue(item, depth + 1)).filter(Boolean).join(' ');
    if (typeof value === 'object') {
      return Object.entries(value)
        .filter(([key]) => !/^(history|comments|updates|logs|rawRows?|html|node|element)$/i.test(key))
        .map(([key, item]) => `${key} ${marketplaceContextValue(item, depth + 1)}`)
        .filter(Boolean)
        .join(' ');
    }
    return '';
  }

  function taskMarketplaceContext(task, sku = null) {
    const taskFields = [
      'platform', 'marketplace', 'marketplaceKey', 'network', 'retailer', 'channel', 'market',
      'contour', 'direction', 'workstream', 'queue', 'role', 'team', 'project', 'topic',
      'title', 'name', 'subject', 'entityLabel', 'description', 'nextAction', 'reason',
      'context', 'comment', 'note', 'notes', 'details', 'message', 'text', 'body',
      'articleKey', 'sku', 'apiSku', 'tags', 'labels', 'meta', 'extra', 'payload', 'fields'
    ];
    const skuFields = [
      'platform', 'marketplace', 'marketplaceKey', 'network', 'retailer', 'channel', 'market',
      'name', 'title', 'articleKey', 'sku', 'apiSku'
    ];
    const taskContext = taskFields.map((key) => marketplaceContextValue(task?.[key])).join(' ');
    const skuContext = skuFields.map((key) => marketplaceContextValue(sku?.[key])).join(' ');
    return [taskContext, skuContext].filter(Boolean).join(' ');
  }

  function currentPeopleRole() {
    const raw = String(state?.controlFilters?.peopleRole || '').trim().toLowerCase();
    if (CONTROL_ROLE_KEYS.includes(raw)) return raw;
    const platform = String(state?.controlFilters?.platform || '').trim().toLowerCase();
    if (CONTROL_ROLE_KEYS.includes(platform)) return platform;
    return 'leader';
  }

  function renderPeopleRoleSwitch() {
    const role = currentPeopleRole();
    return `
      <div class="task-role-switch" data-task-role-switch>
        <span>Роль</span>
        ${CONTROL_ROLE_PRESETS.map((item) => `
          <button class="quick-chip ${role === item.key ? 'active' : ''}" type="button" data-task-role="${escapeHtml(item.key)}" title="${escapeHtml(item.text)}">${escapeHtml(item.label)}</button>
        `).join('')}
      </div>`;
  }

  function controlWorkstreamKey(task, sku) {
    const text = taskMarketplaceContext(task, sku);
    const platform = normalizeTaskPlatform(task?.platform, text);
    if (platform === 'wb') return 'wb';
    if (platform === 'ozon') return 'ozon';
    if (platform === 'ya' || platform === 'goldapple' || platform === 'letu' || platform === 'magnit') return platform;
    if (platform === 'product') return platform;
    if (platform === 'retail') return 'cross';
    if (platform === 'cross') return 'cross';
    if (sku?.flags?.toWorkWB && !sku?.flags?.toWorkOzon) return 'wb';
    if (sku?.flags?.toWorkOzon && !sku?.flags?.toWorkWB) return 'ozon';
    return 'cross';
  }

  function taskWorkstreamCount(tasks, key) {
    const active = (tasks || []).filter(isTaskActive);
    if (key === 'all') return active.length;
    return active.filter((task) => controlWorkstreamKey(task, getSku(task.articleKey)) === key).length;
  }

  function renderTaskWorkstreamSwitch(baseTasks, selectedWorkstream) {
    return `
      <div class="task-workstream-switch" data-task-workstream-switch>
        <span>Кому показываем</span>
        ${CONTROL_TASK_PLATFORM_FILTERS.map((key) => {
          const meta = controlWorkstreamMeta(key);
          const count = taskWorkstreamCount(baseTasks, key);
          return `<button class="quick-chip ${selectedWorkstream === key ? 'active' : ''}" type="button" data-task-platform-filter="${escapeHtml(key)}">${escapeHtml(meta.chip)} ${fmt.int(count)}</button>`;
        }).join('')}
      </div>
    `;
  }

  function getTask(taskId) {
    return typeof getAllTasks === 'function'
      ? getAllTasks().find((task) => task.id === taskId) || null
      : null;
  }

  function getTaskHistory(taskId) {
    return (state.storage.comments || [])
      .map((comment) => {
        const parsed = parseTaskLogComment(comment);
        return parsed && parsed.taskId === taskId ? { ...comment, kind: parsed.kind, text: parsed.text } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function getRecentTaskHistory(tasks, limit) {
    const taskIds = new Set((tasks || []).map((task) => task.id).filter(Boolean));
    return (state.storage.comments || [])
      .map((comment) => {
        const parsed = parseTaskLogComment(comment);
        return parsed && taskIds.has(parsed.taskId) ? { ...comment, taskId: parsed.taskId, kind: parsed.kind, text: parsed.text } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit || 6);
  }

  function taskHeadline(task) {
    return task?.title || task?.entityLabel || 'Задача';
  }

  function taskEntityLine(task, sku) {
    if (sku) return linkToSku(sku.articleKey, sku.article || sku.articleKey);
    return badge(task?.entityLabel || 'Общая задача', 'info');
  }

  function taskHistoryBadge(kind) {
    const meta = TASK_LOG_META[kind] || TASK_LOG_META.comment;
    return badge(meta.label, meta.tone);
  }

  function renderTaskHistoryItem(item) {
    return `
      <div class="comment-item">
        <div class="head">
          <strong>${escapeHtml(item.author || 'Команда')}</strong>
          <div class="badge-stack">${taskHistoryBadge(item.kind)}${badge(item.team || 'Команда')}</div>
        </div>
        <div class="muted small">${fmt.date(item.createdAt)}</div>
        <p>${escapeHtml(item.text || '—')}</p>
      </div>
    `;
  }

  function taskModalSelectionElement(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
  }

  function taskModalHasTextSelection(modal) {
    const selection = window.getSelection ? window.getSelection() : null;
    if (!selection || selection.isCollapsed || !String(selection.toString() || '').trim()) return false;
    const anchor = taskModalSelectionElement(selection.anchorNode);
    const focus = taskModalSelectionElement(selection.focusNode);
    return Boolean((anchor && modal.contains(anchor)) || (focus && modal.contains(focus)));
  }

  function ensureTaskModal() {
    let modal = document.getElementById('taskModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'taskModal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-card task-modal-card" id="taskModalBody"></div>';
    document.body.appendChild(modal);
    let backdropPointerStarted = false;
    const rememberBackdropStart = (event) => {
      backdropPointerStarted = event.target === modal && !taskModalHasTextSelection(modal);
    };
    modal.addEventListener('pointerdown', rememberBackdropStart);
    modal.addEventListener('mousedown', rememberBackdropStart);
    modal.addEventListener('click', (event) => {
      if (event.target !== modal) {
        backdropPointerStarted = false;
        return;
      }
      if (!backdropPointerStarted || taskModalHasTextSelection(modal)) {
        backdropPointerStarted = false;
        return;
      }
      backdropPointerStarted = false;
      closeTaskModal();
    });
    return modal;
  }

  function closeTaskModal() {
    document.getElementById('taskModal')?.classList.remove('open');
    state.activeTaskId = null;
  }

  async function createTaskHistoryEntry(taskId, kind, text, payload) {
    const task = getTask(taskId);
    if (!task || !String(text || '').trim()) return;
    return createComment({
      articleKey: task.articleKey || '',
      author: payload?.author || state.team.member.name || task.owner || 'Команда',
      team: payload?.team || teamMemberLabel(),
      type: 'task_log',
      text: `[[task:${taskId}]] [[kind:${kind}]] ${String(text || '').trim()}`
    });
  }

  function buildTaskUpdateMessage(before, after) {
    const changes = [];
    if (before.title !== after.title) changes.push(`заголовок → ${after.title}`);
    if ((before.owner || '') !== (after.owner || '')) changes.push(`owner → ${after.owner || 'Без owner'}`);
    if ((before.coOwner || '') !== (after.coOwner || '')) changes.push(`соисполнитель → ${after.coOwner || '—'}`);
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

  async function createManualTaskV2(payload) {
    const now = new Date().toISOString();
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
      coOwner: String(payload.coOwner || payload.co_owner || '').trim(),
      due: payload.due || plusDays(3),
      status: 'new',
      nextAction: String(payload.nextAction || '').trim(),
      reason: String(payload.reason || '').trim(),
      createdAt: now,
      updatedAt: now
    }, 'manual');
    state.storage.tasks.unshift(task);
    invalidateControlTaskCache();
    saveLocalStorage();
    try {
      await persistTask(task);
    } catch (error) {
      console.error(error);
    }
    await createTaskHistoryEntry(task.id, 'created', `Задача создана${task.owner ? ` · owner ${task.owner}` : ''}${task.coOwner ? ` · соисполнитель ${task.coOwner}` : ''}${task.due ? ` · срок ${task.due}` : ''}.`);
    if (!payload?.skipRerender) {
      rerenderCurrentView();
      if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
    }
    return task;
  }

  async function takeAutoTaskV2(taskId) {
    const task = typeof getAllTasks === 'function'
      ? getAllTasks().find((item) => item.id === taskId)
      : null;
    if (!task || task.source !== 'auto') return;
    const sku = getSku(task.articleKey);
    const currentOwner = typeof taskPlatformOwnerName === 'function'
      ? taskPlatformOwnerName(sku, task.platform, ownerName(sku))
      : ownerName(sku);
    const manual = normalizeTask({
      ...task,
      id: uid('task'),
      source: 'manual',
      status: 'in_progress',
      owner: currentOwner || task.owner || '',
      updatedAt: new Date().toISOString()
    }, 'manual');
    state.storage.tasks.unshift(manual);
    invalidateControlTaskCache();
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

    const existing = (state.storage.tasks || []).find((item) => item.id === normalizedTaskId);
    if (existing) return existing;

    const sourceTask = typeof getAllTasks === 'function'
      ? getAllTasks().find((item) => item?.id === normalizedTaskId) || null
      : null;
    if (!sourceTask) return null;

    const materialized = normalizeTask({
      ...sourceTask,
      id: normalizedTaskId,
      source: 'manual',
      createdAt: sourceTask.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
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

  async function updateTaskRecord(taskId, patch) {
    const current = await ensureTaskRecordForUpdate(taskId);
    if (!current) return null;
    const before = { ...current };
    const updated = normalizeTask({
      ...current,
      ...patch,
      id: current.id,
      source: current.source,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      articleKey: patch && patch.articleKey !== undefined ? patch.articleKey : current.articleKey
    }, current.source || 'manual');
    Object.assign(current, updated);
    invalidateControlTaskCache();
    saveLocalStorage();
    try {
      await persistTask(current);
    } catch (error) {
      console.error(error);
    }
    const historyMessage = buildTaskUpdateMessage(before, current);
    if (historyMessage) {
      await createTaskHistoryEntry(taskId, current.status !== before.status ? 'status' : 'updated', historyMessage);
    }
    rerenderCurrentView();
    if (state.activeSku === current.articleKey) renderSkuModal(current.articleKey);
    return current;
  }

  async function updateTaskStatusV2(taskId, status) {
    return updateTaskRecord(taskId, { status });
  }

  const TASK_PERSIST_RETRY_DELAYS = [3000, 10000, 30000, 60000];

  function taskPersistStamp(task) {
    const stamp = Date.parse(String(task?.updatedAt || task?.updated_at || task?.createdAt || ''));
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function latestTaskForPersist(task) {
    const id = String(task?.id || '').trim();
    if (!id) return task;
    const current = (state.storage.tasks || []).find((item) => String(item?.id || '').trim() === id);
    if (!current) return task;
    return taskPersistStamp(current) >= taskPersistStamp(task) ? current : task;
  }

  function scheduleTaskPersistRetry(task, attempt) {
    const delay = TASK_PERSIST_RETRY_DELAYS[attempt];
    if (!delay) return;
    window.setTimeout(() => persistTaskInBackground(latestTaskForPersist(task), attempt + 1), delay);
  }

  function persistTaskInBackground(task, attempt = 0) {
    const taskForPersist = latestTaskForPersist(task);
    try {
      Promise.resolve(persistTask(taskForPersist)).catch((error) => {
        console.error(error);
        scheduleTaskPersistRetry(taskForPersist, attempt);
      });
    } catch (error) {
      console.error(error);
      scheduleTaskPersistRetry(taskForPersist, attempt);
    }
  }

  function createTaskHistoryInBackground(taskId, kind, text) {
    if (!text) return;
    try {
      Promise.resolve(createTaskHistoryEntry(taskId, kind, text)).catch((error) => console.error(error));
    } catch (error) {
      console.error(error);
    }
  }

  async function transitionTaskLocalFirst(taskId, status, historyEntries = []) {
    const normalizedTaskId = String(taskId || '').trim();
    if (!normalizedTaskId) return null;
    const transitionKey = `${normalizedTaskId}:${status}`;
    if (taskTransitionPromises.has(transitionKey)) return taskTransitionPromises.get(transitionKey);

    const transitionPromise = (async () => {
      const task = await ensureTaskRecordForUpdate(normalizedTaskId);
      if (!task) return null;

      const before = { ...task };
      const updated = normalizeTask({
        ...task,
        status,
        id: task.id,
        source: task.source,
        createdAt: task.createdAt,
        updatedAt: new Date().toISOString(),
        articleKey: task.articleKey
      }, task.source || 'manual');
      Object.assign(task, updated);
      invalidateControlTaskCache();
      saveLocalStorage();

      persistTaskInBackground(task);

      const historyMessage = buildTaskUpdateMessage(before, task);
      if (historyMessage) createTaskHistoryInBackground(normalizedTaskId, task.status !== before.status ? 'status' : 'updated', historyMessage);
      for (const entry of historyEntries || []) {
        createTaskHistoryInBackground(normalizedTaskId, entry.kind || 'comment', entry.text || '');
      }

      rerenderCurrentView();
      if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
      return task;
    })().finally(() => {
      taskTransitionPromises.delete(transitionKey);
    });

    taskTransitionPromises.set(transitionKey, transitionPromise);
    return transitionPromise;
  }

  async function closeTaskWithReport(taskId, report) {
    return transitionTaskLocalFirst(taskId, 'done', [
      { kind: 'report', text: `Задача закрыта с отчётом: ${report}` }
    ]);
  }

  async function submitTaskForRopApproval(taskId, report) {
    return transitionTaskLocalFirst(taskId, 'waiting_rop', [
      { kind: 'report', text: `\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c \u0441\u0434\u0430\u043b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0420\u041e\u041f\u0443 \u043d\u0430 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u0435: ${report}` }
    ]);
  }

  async function approveTaskByRop(taskId, comment) {
    const note = String(comment || '').trim();
    return transitionTaskLocalFirst(taskId, 'waiting_decision', [
      {
        kind: 'status',
        text: note
          ? `\u0420\u041e\u041f \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e: ${note}`
          : '\u0420\u041e\u041f \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e \u043d\u0430 \u0444\u0438\u043d\u0430\u043b\u044c\u043d\u043e\u0435 \u0437\u0430\u043a\u0440\u044b\u0442\u0438\u0435.'
      }
    ]);
  }

  async function returnTaskToWork(taskId, comment) {
    const note = String(comment || '').trim();
    return transitionTaskLocalFirst(taskId, 'in_progress', [
      {
        kind: 'comment',
        text: note
          ? `\u0420\u041e\u041f \u0432\u0435\u0440\u043d\u0443\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0432 \u0440\u0430\u0431\u043e\u0442\u0443: ${note}`
          : '\u0420\u041e\u041f \u0432\u0435\u0440\u043d\u0443\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0432 \u0440\u0430\u0431\u043e\u0442\u0443.'
      }
    ]);
  }

  async function finalCloseTaskWithReport(taskId, report) {
    const normalizedTaskId = String(taskId || '').trim();
    if (!normalizedTaskId) return null;
    if (finalCloseTaskPromises.has(normalizedTaskId)) return finalCloseTaskPromises.get(normalizedTaskId);

    const closePromise = (async () => {
      const task = await ensureTaskRecordForUpdate(normalizedTaskId);
      if (!task) return null;

      const before = { ...task };
      const updated = normalizeTask({
        ...task,
        status: 'done',
        id: task.id,
        source: task.source,
        createdAt: task.createdAt,
        updatedAt: new Date().toISOString(),
        articleKey: task.articleKey
      }, task.source || 'manual');
      Object.assign(task, updated);
      invalidateControlTaskCache();
      saveLocalStorage();

      persistTaskInBackground(task);

      const historyMessage = buildTaskUpdateMessage(before, task);
      if (historyMessage) {
        Promise.resolve(createTaskHistoryEntry(normalizedTaskId, 'status', historyMessage)).catch((error) => console.error(error));
      }
      Promise.resolve(createTaskHistoryEntry(normalizedTaskId, 'report', `\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u0444\u0438\u043d\u0430\u043b\u044c\u043d\u043e \u0437\u0430\u043a\u0440\u044b\u043b \u0437\u0430\u0434\u0430\u0447\u0443: ${report}`)).catch((error) => console.error(error));

      rerenderCurrentView();
      if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
      return task;
    })().finally(() => {
      finalCloseTaskPromises.delete(normalizedTaskId);
    });

    finalCloseTaskPromises.set(normalizedTaskId, closePromise);
    return closePromise;
  }

  function lifecycleStage(status) {
    if (status === 'waiting_decision') return 3;
    if (status === 'waiting_rop') return 2;
    return 1;
  }

  function renderLifecycleSteps(status) {
    const currentStage = lifecycleStage(status);
    const steps = [
      { title: 'Исполнитель', hint: 'отчёт' },
      { title: 'РОП', hint: 'согласование' },
      { title: 'Руководитель', hint: 'финал' }
    ];
    return `
      <div class="task-flow">
        ${steps.map((step, index) => {
          const stepNumber = index + 1;
          const tone = stepNumber < currentStage ? 'done' : stepNumber === currentStage ? 'active' : '';
          return `<div class="task-flow-step ${tone}"><b>${stepNumber}</b><span>${step.title} · ${step.hint}</span></div>`;
        }).join('')}
      </div>
    `;
  }

  function renderTaskLifecyclePanel(task) {
    if (['done', 'cancelled'].includes(task?.status)) return '';

    if (task.status === 'waiting_rop') {
      return `
        <div class="card" style="margin-top:14px">
          ${renderLifecycleSteps(task.status)}
          <div class="section-subhead">
            <div>
              <h3>Согласование у РОПа</h3>
              <p class="small muted">Здесь нужно только подтвердить результат или вернуть задачу в работу.</p>
            </div>
            ${badge('шаг 2 из 3', 'warn')}
          </div>
          <div class="quick-note warn">Если всё ок, передаём дальше руководителю. Если нужна доработка, оставляем одну короткую пометку и возвращаем в работу.</div>
          <form id="taskRopApproveForm" class="form-stack" style="margin-top:12px">
            <textarea name="comment" rows="3" placeholder="Короткий комментарий РОПа, если нужен"></textarea>
            <div class="badge-stack">
              <button class="btn primary" type="submit">Передать руководителю</button>
              <button class="btn ghost" type="button" data-task-return-to-work>Вернуть в работу</button>
            </div>
          </form>
        </div>
      `;
    }

    if (task.status === 'waiting_decision') {
      return `
        <div class="card" style="margin-top:14px">
          ${renderLifecycleSteps(task.status)}
          <div class="section-subhead">
            <div>
              <h3>Финальное закрытие у руководителя</h3>
              <p class="small muted">Фиксируем итог одной короткой записью и закрываем задачу.</p>
            </div>
            ${badge('шаг 3 из 3', 'danger')}
          </div>
          <div class="quick-note ok">РОП уже дал добро. Здесь нужно только зафиксировать итог и отправить задачу в выполненные.</div>
          <form id="taskFinalCloseForm" class="form-stack" style="margin-top:12px">
            <textarea name="report" rows="4" placeholder="Финальный итог: что приняли и как считаем задачу закрытой" required></textarea>
            <button class="btn primary" type="submit">Закрыть задачу финально</button>
          </form>
        </div>
      `;
    }

    return `
      <div class="card" style="margin-top:14px">
        ${renderLifecycleSteps(task.status)}
        <div class="section-subhead">
          <div>
            <h3>Передать РОПу на согласование</h3>
            <p class="small muted">Исполнитель сдаёт короткий итог, а дальше задача идёт по цепочке РОП → руководитель.</p>
          </div>
          ${badge('шаг 1 из 3', 'warn')}
        </div>
        <div class="quick-note">Минимум для закрытия: что сделали, какой получили результат и где лежит ссылка или артефакт.</div>
        <form id="taskCloseForm" class="form-stack" style="margin-top:12px">
          <textarea name="report" rows="4" placeholder="Короткий итог по задаче" required></textarea>
          <button class="btn primary" type="submit">Отправить РОПу</button>
        </form>
      </div>
    `;
  }

  function renderTaskModal(taskId) {
    const task = getTask(taskId);
    if (!task) return;
    state.activeTaskId = taskId;
    const sku = getSku(task.articleKey);
    const modal = ensureTaskModal();
    const body = document.getElementById('taskModalBody');
    const owners = ownerOptions();
    const history = getTaskHistory(taskId);
    const historyHtml = history.length
      ? history.map(renderTaskHistoryItem).join('')
      : `<div class="comment-item"><div class="head"><strong>Портал</strong>${taskHistoryBadge('created')}</div><div class="muted small">${fmt.date(task.createdAt)}</div><p>Задача уже есть в контуре. Дальше все апдейты и отчёты будут появляться здесь.</p></div>`;

    body.innerHTML = `
      <div class="modal-head">
        <div>
          <div class="muted small">${escapeHtml(controlWorkstreamMeta(controlWorkstreamKey(task, sku)).label)} · ${escapeHtml(task.entityLabel || taskHeadline(task))}</div>
          <h2>${escapeHtml(taskHeadline(task))}</h2>
          <div class="badge-stack">${taskStatusBadge(task)}${taskPriorityBadge(task)}${taskTypeBadge(task)}${taskPlatformBadge(task)}${taskSourceBadge(task)}</div>
        </div>
        <div class="badge-stack">
          ${sku ? `<button class="btn ghost" type="button" data-open-sku="${escapeHtml(sku.articleKey)}">Открыть SKU</button>` : ''}
          <button class="btn ghost" type="button" data-close-task-modal>Закрыть</button>
        </div>
      </div>

      <div class="kv-3">
        <div class="card subtle">
          <h3>Контекст</h3>
          ${metricRow('Owner', escapeHtml(task.owner || 'Не назначен'))}
          ${metricRow('Срок', escapeHtml(task.due || '—'))}
          ${metricRow('Источник', escapeHtml(task.source || 'manual'))}
          ${metricRow('SKU / тема', sku ? escapeHtml(sku.article || sku.articleKey) : escapeHtml(task.entityLabel || 'Общая задача'))}
        </div>
        <div class="card subtle">
          <h3>Что делаем сейчас</h3>
          <div class="note-box">${escapeHtml(task.nextAction || 'Нужно описать следующий шаг')}</div>
          <div class="muted small" style="margin-top:10px">${escapeHtml(task.reason || 'Причина / контекст пока не заполнены')}</div>
        </div>
        <div class="card subtle">
          <h3>Как закрывать</h3>
          <div class="note-box">Маркетолог закрывает задачу коротким отчётом: что сделал, какой результат получил и где лежит ссылка / артефакт.</div>
        </div>
      </div>

      <div class="two-col" style="margin-top:14px">
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Редактировать задачу</h3>
              <p class="small muted">Из карточки можно менять owner, сроки, следующий шаг, приоритет и статус.</p>
            </div>
            ${task.articleKey ? taskEntityLine(task, sku) : badge('Общая задача', 'info')}
          </div>
          <datalist id="taskOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
          <form id="taskEditForm" class="form-grid compact">
            <input name="title" value="${escapeHtml(task.title || '')}" required>
            <input name="entityLabel" value="${escapeHtml(task.entityLabel || '')}" placeholder="Проект / тема">
            <input name="owner" list="taskOwnerList" value="${escapeHtml(task.owner || '')}" placeholder="Кто ведёт">
            <input name="due" type="date" value="${escapeHtml(task.due || '')}">
            <select name="status">${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
            <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${task.priority === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
            <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}" ${task.type === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
            <select name="platform">
              <option value="cross" ${normalizeTaskPlatform(task.platform) === 'cross' ? 'selected' : ''}>Общий контур</option>
              <option value="wb" ${normalizeTaskPlatform(task.platform) === 'wb' ? 'selected' : ''}>РОП WB</option>
              <option value="ozon" ${normalizeTaskPlatform(task.platform) === 'ozon' ? 'selected' : ''}>РОП Ozon</option>
              <option value="ya" ${normalizeTaskPlatform(task.platform) === 'ya' ? 'selected' : ''}>Я.Маркет</option>
              <option value="goldapple" ${normalizeTaskPlatform(task.platform) === 'goldapple' ? 'selected' : ''}>Золотое яблоко</option>
              <option value="letu" ${normalizeTaskPlatform(task.platform) === 'letu' ? 'selected' : ''}>Л'Этуаль</option>
              <option value="magnit" ${normalizeTaskPlatform(task.platform) === 'magnit' ? 'selected' : ''}>Магнит Маркет</option>
            </select>
            <textarea name="nextAction" rows="4" placeholder="Следующее действие">${escapeHtml(task.nextAction || '')}</textarea>
            <textarea name="reason" rows="4" placeholder="Контекст / почему задача возникла">${escapeHtml(task.reason || '')}</textarea>
            <button class="btn primary" type="submit">Сохранить изменения</button>
          </form>
        </div>

        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Комментарии и история</h3>
              <p class="small muted">Здесь видны все апдейты, обсуждение и отчёты по закрытию.</p>
            </div>
            ${badge(`${fmt.int(history.length)} записей`, history.length ? 'info' : 'ok')}
          </div>
          <div class="list">${historyHtml}</div>
          <form id="taskCommentForm" class="form-grid compact" style="margin-top:12px">
            <input name="author" value="${escapeHtml(state.team.member.name || task.owner || 'Команда')}" placeholder="Кто пишет" required>
            <textarea name="text" rows="4" placeholder="Апдейт по задаче: что сделано, что мешает, что нужно от других" required></textarea>
            <button class="btn" type="submit">Добавить комментарий</button>
          </form>
        </div>
      </div>

      ${!['done', 'cancelled'].includes(task.status) ? `
        <div class="card" style="margin-top:14px">
          <div class="section-subhead">
            <div>
              <h3>Закрыть задачу с отчётом</h3>
              <p class="small muted">Без отчёта задача не считается закрытой по смыслу.</p>
            </div>
            ${badge('обязателен короткий отчёт', 'warn')}
          </div>
          <form id="taskCloseForm" class="form-grid compact">
            <textarea name="report" rows="5" placeholder="Что сделали, какой результат получили, где лежит артефакт / ссылка" required></textarea>
            <button class="btn primary" type="submit">Закрыть задачу</button>
          </form>
        </div>
      ` : ''}
    `;

    modal.classList.add('open');

    body.querySelector('[data-close-task-modal]')?.addEventListener('click', closeTaskModal);
    body.querySelector('#taskEditForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await updateTaskRecord(taskId, {
        title: form.get('title'),
        entityLabel: form.get('entityLabel'),
        owner: form.get('owner'),
        due: form.get('due'),
        status: form.get('status'),
        priority: form.get('priority'),
        type: form.get('type'),
        platform: form.get('platform'),
        nextAction: form.get('nextAction'),
        reason: form.get('reason')
      });
      renderTaskModal(taskId);
    });
    body.querySelector('#taskCommentForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await createTaskHistoryEntry(taskId, 'comment', form.get('text'), {
        author: form.get('author'),
        team: teamMemberLabel()
      });
      renderTaskModal(taskId);
    });
    body.querySelector('#taskCloseForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const report = String(form.get('report') || '').trim();
      if (!report) return;
      await closeTaskWithReport(taskId, report);
      renderTaskModal(taskId);
    });
  }

  const renderTaskModalBase = renderTaskModal;
  renderTaskModal = function renderTaskModalPatched(taskId) {
    renderTaskModalBase(taskId);
    const task = getTask(taskId);
    const body = document.getElementById('taskModalBody');
    if (!task || !body) return;
    const owners = ownerOptions();
    const history = getTaskHistory(taskId);

    const lifecycleCard = body.querySelector('#taskCloseForm')?.closest('.card');
    if (lifecycleCard) {
      lifecycleCard.outerHTML = renderTaskLifecyclePanel(task);
    }

    const contentColumns = body.querySelector('.two-col');
    const modalCards = contentColumns ? Array.from(contentColumns.children).filter((node) => node.classList?.contains('card')) : [];
    let replacedEditCard = false;
    let replacedHistoryCard = false;
    if (modalCards[0]) {
      modalCards[0].outerHTML = renderTaskQuickEditCard(task, owners);
      replacedEditCard = true;
    }
    if (modalCards[1]) {
      modalCards[1].outerHTML = renderTaskUpdatesCard(task, history);
      replacedHistoryCard = true;
    }

    const noteBoxes = body.querySelectorAll('.kv-3 .note-box');
    if (noteBoxes[1]) {
      noteBoxes[1].textContent = '\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c \u0441\u0434\u0430\u0451\u0442 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0441 \u043e\u0442\u0447\u0451\u0442\u043e\u043c, \u043f\u043e\u0441\u043b\u0435 \u0447\u0435\u0433\u043e \u0437\u0430\u0434\u0430\u0447\u0430 \u0438\u0434\u0451\u0442 \u043d\u0430 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u0435 \u0420\u041e\u041f\u0443 \u0438 \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u0442\u043e\u043c \u0437\u0430\u043a\u0440\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u0435\u043c.';
    }

    if (replacedEditCard) {
      body.querySelector('#taskEditForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await updateTaskRecord(taskId, {
          title: form.get('title'),
          entityLabel: form.get('entityLabel'),
          owner: form.get('owner'),
          due: form.get('due'),
          status: form.get('status'),
          priority: form.get('priority'),
          type: form.get('type'),
          platform: form.get('platform'),
          nextAction: form.get('nextAction'),
          reason: form.get('reason')
        });
        renderTaskModal(taskId);
      });
      body.querySelectorAll('[data-task-modal-due]').forEach((button) => button.addEventListener('click', async () => {
        const days = Number(button.dataset.taskModalDue || 0);
        const due = plusDays(Number.isFinite(days) ? days : 0);
        const dueInput = body.querySelector('#taskEditForm input[name="due"]');
        if (dueInput) dueInput.value = due;
        await updateTaskRecord(taskId, { due });
        renderTaskModal(taskId);
      }));
    }

    if (replacedHistoryCard) {
      bindTaskAttachmentsInline(taskId, body);
      body.querySelector('#taskCommentForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await createTaskHistoryEntry(taskId, 'comment', form.get('text'), {
          author: form.get('author'),
          team: teamMemberLabel()
        });
        renderTaskModal(taskId);
      });
    }

    body.querySelector('#taskCloseForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const report = String(form.get('report') || '').trim();
      if (!report) return;
      await submitTaskForRopApproval(taskId, report);
      renderTaskModal(taskId);
    });

    body.querySelector('#taskRopApproveForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await approveTaskByRop(taskId, String(form.get('comment') || '').trim());
      renderTaskModal(taskId);
    });

    body.querySelector('[data-task-return-to-work]')?.addEventListener('click', async () => {
      const comment = String(body.querySelector('#taskRopApproveForm textarea[name="comment"]')?.value || '').trim();
      await returnTaskToWork(taskId, comment);
      renderTaskModal(taskId);
    });

    body.querySelector('#taskFinalCloseForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const report = String(form.get('report') || '').trim();
      if (!report) return;
      await finalCloseTaskWithReport(taskId, report);
      renderTaskModal(taskId);
    });
  };

  function renderTaskCardPatched(task) {
    const sku = getSku(task.articleKey);
    const skuLabel = taskEntityLine(task, sku);
    const controls = task.source === 'auto'
      ? `
        <button class="btn small-btn" data-take-task="${escapeHtml(task.id)}">Взять в работу</button>
        <button class="btn ghost small-btn" data-open-task="${escapeHtml(task.id)}">Открыть</button>
      `
      : `<button class="btn ghost small-btn" data-open-task="${escapeHtml(task.id)}">Открыть задачу</button>`;

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

  function renderMiniTaskPatched(task) {
    const sku = getSku(task.articleKey);
    return `
      <div class="task-mini ${isTaskOverdue(task) ? 'overdue' : ''}" data-open-task="${escapeHtml(task.id)}" style="cursor:pointer">
        <div class="left">
          <strong>${escapeHtml(task.title)}</strong>
          <div class="muted small">${escapeHtml(sku?.article || task.articleKey || task.entityLabel || '—')} · ${escapeHtml(task.owner || 'Без owner')} · ${escapeHtml(task.due || '—')}</div>
        </div>
        <div class="badge-stack">${taskPriorityBadge(task)}${taskStatusBadge(task)}</div>
      </div>
    `;
  }

  function renderTaskQuickEditCard(task, owners) {
    return `
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Быстрая правка</h3>
            <p class="small muted">Снаружи оставили только ключевое: заголовок, owner, срок и ближайший шаг.</p>
          </div>
          ${task.articleKey ? taskEntityLine(task, getSku(task.articleKey)) : badge('Общая задача', 'info')}
        </div>
        <datalist id="taskOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <form id="taskEditForm" class="form-stack">
          <input name="title" value="${escapeHtml(task.title || '')}" required>
          <div class="compact-row">
            <input name="owner" list="taskOwnerList" value="${escapeHtml(task.owner || '')}" placeholder="Кто ведёт">
            <input name="due" type="date" value="${escapeHtml(task.due || '')}">
          </div>
          <div class="task-due-modal-quick">
            <span>Быстрый срок</span>
            <button class="btn ghost small-btn" type="button" data-task-modal-due="0">Сегодня</button>
            <button class="btn ghost small-btn" type="button" data-task-modal-due="1">+1 день</button>
            <button class="btn ghost small-btn" type="button" data-task-modal-due="3">+3 дня</button>
            <button class="btn ghost small-btn" type="button" data-task-modal-due="7">+7 дней</button>
          </div>
          <textarea name="nextAction" rows="3" placeholder="Следующий шаг">${escapeHtml(task.nextAction || '')}</textarea>
          <details class="compact-details">
            <summary>Дополнительно: статус, контур и контекст</summary>
            <div class="form-grid compact" style="margin-top:10px">
              <input name="entityLabel" value="${escapeHtml(task.entityLabel || '')}" placeholder="Проект / тема">
              <select name="status">${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
              <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${task.priority === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
              <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}" ${task.type === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
            <select name="platform">
              <option value="cross" ${normalizeTaskPlatform(task.platform) === 'cross' ? 'selected' : ''}>Общий контур</option>
              <option value="wb" ${normalizeTaskPlatform(task.platform) === 'wb' ? 'selected' : ''}>РОП WB</option>
              <option value="ozon" ${normalizeTaskPlatform(task.platform) === 'ozon' ? 'selected' : ''}>РОП Ozon</option>
              <option value="ya" ${normalizeTaskPlatform(task.platform) === 'ya' ? 'selected' : ''}>Я.Маркет</option>
              <option value="goldapple" ${normalizeTaskPlatform(task.platform) === 'goldapple' ? 'selected' : ''}>Золотое яблоко</option>
              <option value="letu" ${normalizeTaskPlatform(task.platform) === 'letu' ? 'selected' : ''}>Л'Этуаль</option>
              <option value="magnit" ${normalizeTaskPlatform(task.platform) === 'magnit' ? 'selected' : ''}>Магнит Маркет</option>
            </select>
            <textarea name="nextAction" rows="4" placeholder="Следующее действие">${escapeHtml(task.nextAction || '')}</textarea>
            <textarea name="reason" rows="4" placeholder="Контекст / почему задача возникла">${escapeHtml(task.reason || '')}</textarea>
            <button class="btn primary" type="submit">Сохранить изменения</button>
          </form>
      </div>
    `;
  }

  function taskAttachmentSizeLabel(size = 0) {
    const bytes = Number(size || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes)} B`;
  }

  function taskAttachmentHref(item) {
    const direct = String(item?.publicUrl || '').trim();
    if (direct) return direct;
    if (typeof taskAttachmentPublicUrl === 'function') return taskAttachmentPublicUrl(item?.bucket || '', item?.objectPath || '');
    return '';
  }

  function renderTaskAttachmentsInline(task) {
    const taskId = String(task?.id || '').trim();
    if (!taskId) return '';
    const attachments = typeof getTaskAttachments === 'function' ? getTaskAttachments(taskId) : [];
    const allowed = typeof TASK_ATTACHMENT_ALLOWED_EXTENSIONS !== 'undefined' && Array.isArray(TASK_ATTACHMENT_ALLOWED_EXTENSIONS)
      ? TASK_ATTACHMENT_ALLOWED_EXTENSIONS.join(', ')
      : 'xlsx, xls, csv';
    const limit = typeof TASK_ATTACHMENT_MAX_BYTES !== 'undefined'
      ? Math.round(TASK_ATTACHMENT_MAX_BYTES / (1024 * 1024))
      : 20;
    const rows = attachments.length ? attachments.map((item) => {
      const href = taskAttachmentHref(item);
      const size = taskAttachmentSizeLabel(item.size);
      const meta = [
        size,
        item.createdBy ? `\u043e\u0442 ${escapeHtml(item.createdBy)}` : '',
        item.createdAt ? fmt.date(item.createdAt) : ''
      ].filter(Boolean).join(' \u00b7 ');
      return `
        <div class="task-attachment-row">
          <div class="task-attachment-main">
            <strong>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(item.fileName || '\u0424\u0430\u0439\u043b')}</a>` : escapeHtml(item.fileName || '\u0424\u0430\u0439\u043b')}</strong>
            <span>${escapeHtml(meta || '\u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043a \u0437\u0430\u0434\u0430\u0447\u0435')}</span>
          </div>
          <div class="task-attachment-actions">
            ${href ? `<a class="btn ghost small-btn" href="${escapeHtml(href)}" target="_blank" rel="noopener">\u041e\u0442\u043a\u0440\u044b\u0442\u044c</a>` : ''}
            <button class="btn ghost small-btn" type="button" data-task-attachment-delete="${escapeHtml(item.id)}">\u0423\u0434\u0430\u043b\u0438\u0442\u044c</button>
          </div>
        </div>`;
    }).join('') : '<div class="empty compact">\u0424\u0430\u0439\u043b\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</div>';
    return `
      <div class="task-attachments-card task-attachments-panel" data-task-attachments-card>
        <div class="section-subhead">
          <div>
            <h3>\u0424\u0430\u0439\u043b\u044b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0430</h3>
            <p class="small muted">\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u0435 Excel/CSV \u0438\u043b\u0438 scorecard \u043f\u0440\u044f\u043c\u043e \u043a \u044d\u0442\u043e\u0439 \u0437\u0430\u0434\u0430\u0447\u0435.</p>
          </div>
          ${badge(`${fmt.int(attachments.length)} \u0444\u0430\u0439\u043b.`, attachments.length ? 'info' : 'ok')}
        </div>
        <div class="ui-stack">
          <div class="task-attachment-list">${rows}</div>
          <div class="task-attachment-upload">
            <label class="btn file-input" data-task-attachment-picker>
              <span data-task-attachment-label>\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0444\u0430\u0439\u043b</span>
              <input type="file" data-task-attachment-input accept=".xlsx,.xls,.csv">
            </label>
            <span class="ui-hint">\u0424\u043e\u0440\u043c\u0430\u0442\u044b: ${escapeHtml(allowed)} \u00b7 \u0434\u043e ${fmt.int(limit)} MB</span>
          </div>
        </div>
      </div>`;
  }

  function bindTaskAttachmentsInline(taskId, body) {
    const attachmentInput = body.querySelector('[data-task-attachment-input]');
    if (attachmentInput && attachmentInput.dataset.boundAttachmentUpload !== '1') {
      attachmentInput.dataset.boundAttachmentUpload = '1';
      attachmentInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const label = body.querySelector('[data-task-attachment-label]');
        const picker = body.querySelector('[data-task-attachment-picker]');
        const initialLabel = label?.textContent || '';
        try {
          attachmentInput.disabled = true;
          if (picker) picker.classList.add('is-loading');
          if (label) label.textContent = '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c...';
          const uploadFn = typeof window.uploadTaskAttachment === 'function'
            ? window.uploadTaskAttachment
            : (typeof uploadTaskAttachment === 'function' ? uploadTaskAttachment : null);
          if (typeof uploadFn !== 'function') throw new Error('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0444\u0430\u0439\u043b\u043e\u0432 \u0435\u0449\u0435 \u043d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0430.');
          const attachment = await uploadFn(taskId, file);
          const historyFn = typeof window.appendTaskHistorySafe === 'function'
            ? window.appendTaskHistorySafe
            : (typeof createTaskHistoryEntry === 'function' ? createTaskHistoryEntry : null);
          if (typeof historyFn === 'function') {
            try {
              await historyFn(taskId, 'comment', `\u041f\u0440\u0438\u043b\u043e\u0436\u0435\u043d \u0444\u0430\u0439\u043b: ${attachment?.fileName || file.name}`, {
                team: typeof teamMemberLabel === 'function' ? teamMemberLabel() : 'Team'
              });
            } catch (error) {
              console.error(error);
            }
          }
          renderTaskModal(taskId);
        } catch (error) {
          console.error(error);
          alert(error?.message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0444\u0430\u0439\u043b.');
        } finally {
          if (attachmentInput.isConnected) {
            attachmentInput.value = '';
            attachmentInput.disabled = false;
          }
          if (picker) picker.classList.remove('is-loading');
          if (label && label.isConnected) label.textContent = initialLabel || '\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0444\u0430\u0439\u043b';
        }
      });
    }

    body.querySelectorAll('[data-task-attachment-delete]').forEach((button) => {
      if (button.dataset.boundAttachmentDelete === '1') return;
      button.dataset.boundAttachmentDelete = '1';
      button.addEventListener('click', async () => {
        const attachmentId = String(button.dataset.taskAttachmentDelete || '').trim();
        if (!attachmentId) return;
        if (!window.confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u043e\u0442 \u0444\u0430\u0439\u043b \u0438\u0437 \u0437\u0430\u0434\u0430\u0447\u0438?')) return;
        const initialText = button.textContent || '';
        try {
          button.disabled = true;
          button.textContent = '\u0423\u0434\u0430\u043b\u044f\u0435\u043c...';
          const deleteFn = typeof window.deleteTaskAttachment === 'function'
            ? window.deleteTaskAttachment
            : (typeof deleteTaskAttachment === 'function' ? deleteTaskAttachment : null);
          if (typeof deleteFn !== 'function') throw new Error('\u0423\u0434\u0430\u043b\u0435\u043d\u0438\u0435 \u0444\u0430\u0439\u043b\u043e\u0432 \u0435\u0449\u0435 \u043d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e.');
          await deleteFn(attachmentId);
          renderTaskModal(taskId);
        } catch (error) {
          console.error(error);
          alert(error?.message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u0444\u0430\u0439\u043b.');
        } finally {
          if (button.isConnected) {
            button.disabled = false;
            button.textContent = initialText || '\u0423\u0434\u0430\u043b\u0438\u0442\u044c';
          }
        }
      });
    });
  }

  function renderTaskUpdatesCard(task, history) {
    const historyHtml = history.length
      ? history.map(renderTaskHistoryItem).join('')
      : `<div class="comment-item"><div class="head"><strong>Портал</strong>${taskHistoryBadge('created')}</div><div class="muted small">${fmt.date(task.createdAt)}</div><p>Пока нет апдейтов. Первая короткая запись появится здесь.</p></div>`;
    return `
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Апдейты и история</h3>
            <p class="small muted">Один короткий апдейт = одна ясная точка синхрона для команды.</p>
          </div>
          ${badge(`${fmt.int(history.length)} записей`, history.length ? 'info' : 'ok')}
        </div>
        <div class="quick-note ok">Пишем кратко: что сделано, что мешает и что нужно от других.</div>
        ${renderTaskAttachmentsInline(task)}
        <div class="compact-history" style="margin-top:12px">${historyHtml}</div>
        <form id="taskCommentForm" class="form-stack" style="margin-top:12px">
          <textarea name="text" rows="3" placeholder="Короткий апдейт по задаче" required></textarea>
          <button class="btn" type="submit">Сохранить апдейт</button>
        </form>
      </div>
    `;
  }

  function taskMeaningKey(task) {
    const article = String(task?.articleKey || task?.entityLabel || '').trim().toLowerCase();
    const meaning = String(task?.autoCode || task?.type || task?.title || '').trim().toLowerCase();
    const platform = String(task?.platform || '').trim().toLowerCase() || 'all';
    return `${article || 'common'}|${meaning || 'general'}|${platform}`;
  }

  function isDeprecatedAutoSignalTask(task = {}) {
    if (typeof window.isDeprecatedAutoSignalTask === 'function' && window.isDeprecatedAutoSignalTask !== isDeprecatedAutoSignalTask) {
      return window.isDeprecatedAutoSignalTask(task);
    }
    const code = String(task?.autoCode || '').trim().toLowerCase();
    if (DEPRECATED_AUTO_SIGNAL_CODES.has(code)) return true;
    const id = String(task?.id || '').trim().toLowerCase();
    if (/^auto-kz[_-](owner|economics|card|traffic)/.test(id)) return true;
    if (/^auto-stock[_-]/.test(id) && (!code || code === 'low_stock')) return true;
    return false;
  }

  function taskDedupeKey(task) {
    if (task?.source !== 'auto') return `manual|${task?.id || taskMeaningKey(task)}`;
    return `auto|${taskMeaningKey(task)}`;
  }

  function shouldPreferTask(candidate, current) {
    if (!current) return true;
    const candidateManual = candidate?.source !== 'auto';
    const currentManual = current?.source !== 'auto';
    if (candidateManual !== currentManual) return candidateManual;
    if (isTaskOverdue(candidate) !== isTaskOverdue(current)) return isTaskOverdue(candidate);
    const candidateRank = PRIORITY_META[candidate?.priority]?.rank || 0;
    const currentRank = PRIORITY_META[current?.priority]?.rank || 0;
    if (candidateRank !== currentRank) return candidateRank > currentRank;
    return String(candidate?.createdAt || '') > String(current?.createdAt || '');
  }

  function dedupeControlTasks(tasks) {
    const manualMeaningKeys = new Set(
      (tasks || [])
        .filter((task) => !isDeprecatedAutoSignalTask(task))
        .filter((task) => task?.source !== 'auto' && isTaskActive(task))
        .map(taskMeaningKey)
    );
    const byKey = new Map();
    for (const task of tasks || []) {
      if (isDeprecatedAutoSignalTask(task)) continue;
      if (task?.source === 'auto' && manualMeaningKeys.has(taskMeaningKey(task))) continue;
      const key = taskDedupeKey(task);
      const existing = byKey.get(key);
      if (shouldPreferTask(task, existing)) byKey.set(key, task);
    }
    const result = [...byKey.values()];
    return typeof sortTasks === 'function' ? sortTasks(result) : result;
  }

  function getAllTasksDeduped() {
    const sourceTasks = typeof originalGetAllTasks === 'function' ? originalGetAllTasks() : [];
    return dedupeControlTasks(sourceTasks);
  }

  function invalidateControlTaskCache() {
    controlTaskCacheVersion += 1;
    controlSnapshotCache = { key: '', value: null };
  }

  function controlSnapshotCacheKey(tasks) {
    const source = tasks || [];
    const stamp = source
      .map((task) => [
        task?.id,
        task?.status,
        task?.owner,
        task?.due,
        task?.priority,
        task?.platform,
        task?.updatedAt,
        task?.source
      ].join(':'))
      .join('|');
    return `${controlTaskCacheVersion}|${source.length}|${stamp}`;
  }

  function getControlSnapshotCached() {
    const tasks = getAllTasksDeduped();
    const key = controlSnapshotCacheKey(tasks);
    if (controlSnapshotCache.key === key && controlSnapshotCache.value) return controlSnapshotCache.value;
    if (typeof originalGetControlSnapshot === 'function') {
      const previousGetAllTasks = typeof getAllTasks === 'function' ? getAllTasks : null;
      try {
        try { getAllTasks = () => tasks; } catch {}
        const value = originalGetControlSnapshot();
        controlSnapshotCache = { key, value };
        return value;
      } finally {
        if (previousGetAllTasks) {
          try { getAllTasks = previousGetAllTasks; } catch {}
        }
      }
    }
    const active = tasks.filter(isTaskActive);
    const overdue = active.filter(isTaskOverdue);
    const waitingRop = active.filter((task) => task.status === 'waiting_rop');
    const waitingDecision = active.filter((task) => task.status === 'waiting_decision');
    const noOwner = active.filter((task) => !task.owner);
    const ownerMap = new Map();
    for (const task of active) {
      const keyName = task.owner || 'Без owner';
      const row = ownerMap.get(keyName) || { owner: keyName, total: 0, overdue: 0, critical: 0, waiting: 0, waitingRop: 0, waitingDecision: 0 };
      row.total += 1;
      if (isTaskOverdue(task)) row.overdue += 1;
      if (task.priority === 'critical') row.critical += 1;
      if (task.status === 'waiting_rop') row.waitingRop += 1;
      if (task.status === 'waiting_decision') row.waitingDecision += 1;
      row.waiting = row.waitingRop + row.waitingDecision;
      ownerMap.set(keyName, row);
    }
    const value = {
      tasks,
      active,
      overdue,
      waitingRop,
      waitingDecision,
      noOwner,
      dueThisWeek: active.filter((task) => task.due && task.due <= plusDays(7)),
      byOwner: [...ownerMap.values()].sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner, 'ru')),
      todayList: sortLazyTasks(active).filter((task) => isTaskOverdue(task) || task.status === 'waiting_rop' || task.status === 'waiting_decision' || task.priority === 'critical' || (task.due && task.due <= plusDays(2))).slice(0, 12),
      autoCount: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length,
      manualCount: tasks.filter((task) => task.source !== 'auto' && isTaskActive(task)).length
    };
    controlSnapshotCache = { key, value };
    return value;
  }

  function controlTasksRawCount() {
    return typeof originalGetAllTasks === 'function' ? originalGetAllTasks().length : getAllTasksDeduped().length;
  }

  function taskUrgencyScore(task) {
    let score = PRIORITY_META[task?.priority]?.rank || 0;
    if (isTaskOverdue(task)) score += 10;
    if (task?.status === 'waiting_rop' || task?.status === 'waiting_decision') score += 8;
    if (!task?.owner) score += 5;
    if (task?.due && task.due <= plusDays(2)) score += 3;
    if (task?.source === 'auto') score -= 1;
    return score;
  }

  function sortLazyTasks(tasks) {
    return [...(tasks || [])].sort((a, b) => {
      const scoreDiff = taskUrgencyScore(b) - taskUrgencyScore(a);
      if (scoreDiff) return scoreDiff;
      return String(a.due || '9999-12-31').localeCompare(String(b.due || '9999-12-31'));
    });
  }

  function lazyTaskBuckets(tasks) {
    const active = (tasks || []).filter(isTaskActive);
    const memberName = String(state?.team?.member?.name || '').trim().toLowerCase();
    const general = active.filter((task) => !String(task.articleKey || '').trim());
    const now = active.filter((task) => isTaskOverdue(task) || task.status === 'waiting_rop' || task.status === 'waiting_decision' || !task.owner || task.priority === 'critical');
    const mine = memberName
      ? active.filter((task) => String(task.owner || '').trim().toLowerCase() === memberName)
      : active.filter((task) => isTaskOverdue(task) || task.priority === 'critical' || (task.due && task.due <= plusDays(2)));
    const urgent = active.filter((task) => isTaskOverdue(task) || task.priority === 'critical' || (task.due && task.due <= plusDays(1)));
    const waiting = active.filter((task) => task.status === 'waiting_rop' || task.status === 'waiting_decision');
    const noOwner = active.filter((task) => !task.owner);
    return {
      now: sortLazyTasks(now),
      mine: sortLazyTasks(mine),
      urgent: sortLazyTasks(urgent),
      waiting: sortLazyTasks(waiting),
      no_owner: sortLazyTasks(noOwner),
      general: sortLazyTasks(general),
      all: sortLazyTasks(active)
    };
  }

  function lazyQueueMeta(key) {
    const current = key || 'now';
    const meta = {
      now: { title: 'Что делать сейчас', text: 'Одна рабочая очередь: просрочено, согласования, без owner и критичные задачи.' },
      mine: { title: 'Мои / сегодня', text: 'Берём сверху вниз: срочные, критичные и ближайшие по сроку.' },
      urgent: { title: 'Срочно', text: 'Сначала закрываем просрочку, критичные задачи и дедлайны до завтра.' },
      waiting: { title: 'Ждёт решения', text: 'Здесь задачи, которые надо согласовать или вернуть в работу.' },
      no_owner: { title: 'Без owner', text: 'Назначаем ответственного прямо здесь, чтобы задача не была ничьей.' },
      general: { title: 'Общие задачи', text: 'Задачи без привязки к карточке: согласования, процессы, созвоны, блоки и поручения.' },
      all: { title: 'Все активные', text: 'Полный активный список без дублей авто-сигналов.' }
    };
    return meta[current] || meta.mine;
  }

  function currentLazyQueue() {
    const raw = String(state?.controlFilters?.lazyQueue || 'now').trim();
    return ['now', 'mine', 'urgent', 'waiting', 'no_owner', 'general', 'all'].includes(raw) ? raw : 'now';
  }

  function preferredLazyQueueForWorkstream(workstream = 'all') {
    return RETAIL_ROP_WORKSTREAMS.has(String(workstream || '').trim().toLowerCase()) ? 'all' : 'now';
  }

  function taskFilterValue(key, fallback = 'all') {
    state.controlFilters = state.controlFilters || {};
    const raw = state.controlFilters[key];
    return raw === undefined || raw === null || raw === '' ? fallback : String(raw);
  }

  function taskFilterActiveCount() {
    const filters = state.controlFilters || {};
    return [
      String(filters.search || '').trim(),
      filters.owner && filters.owner !== 'all',
      filters.type && filters.type !== 'all',
      filters.priority && filters.priority !== 'all',
      filters.horizon && filters.horizon !== 'all',
      filters.source && filters.source !== 'all',
      filters.status && filters.status !== 'active'
    ].filter(Boolean).length;
  }

  function renderTaskFilterBar(tasks, owners) {
    const search = taskFilterValue('search', '');
    const owner = taskFilterValue('owner', 'all');
    const status = taskFilterValue('status', 'active');
    const type = taskFilterValue('type', 'all');
    const priority = taskFilterValue('priority', 'all');
    const horizon = taskFilterValue('horizon', 'all');
    const source = taskFilterValue('source', 'all');
    const activeCount = taskFilterActiveCount();
    return `
      <div class="task-filter-panel" data-task-filter-panel>
        <div class="task-filter-panel-head">
          <div>
            <strong>Фильтры поиска</strong>
            <span>${fmt.int((tasks || []).filter(isTaskActive).length)} активных в текущем срезе</span>
          </div>
          ${activeCount ? badge(`фильтров ${fmt.int(activeCount)}`, 'warn') : badge('без лишнего шума', 'ok')}
        </div>
        <div class="task-filter-grid">
          <label class="span-2"><span>Поиск</span><input data-task-filter="search" value="${escapeHtml(search)}" placeholder="SKU, задача, owner, следующий шаг..."></label>
          <label><span>Owner</span><select data-task-filter="owner">
            <option value="all">Все owner</option>
            ${owners.map((name) => `<option value="${escapeHtml(name)}" ${owner === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
          </select></label>
          <label><span>Статус</span><select data-task-filter="status">
            <option value="active" ${status === 'active' ? 'selected' : ''}>Только активные</option>
            <option value="all" ${status === 'all' ? 'selected' : ''}>Все статусы</option>
            ${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
          </select></label>
          <label><span>Тип</span><select data-task-filter="type">
            <option value="all">Все типы</option>
            ${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}" ${type === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
          </select></label>
          <label><span>Приоритет</span><select data-task-filter="priority">
            <option value="all">Любой приоритет</option>
            ${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${priority === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
          </select></label>
          <label><span>Срок</span><select data-task-filter="horizon">
            <option value="all" ${horizon === 'all' ? 'selected' : ''}>Любой срок</option>
            <option value="overdue" ${horizon === 'overdue' ? 'selected' : ''}>Просрочено</option>
            <option value="today" ${horizon === 'today' ? 'selected' : ''}>Сегодня</option>
            <option value="week" ${horizon === 'week' ? 'selected' : ''}>7 дней</option>
            <option value="no_owner" ${horizon === 'no_owner' ? 'selected' : ''}>Без owner</option>
          </select></label>
          <label><span>Источник</span><select data-task-filter="source">
            <option value="all" ${source === 'all' ? 'selected' : ''}>Все</option>
            <option value="manual" ${source === 'manual' ? 'selected' : ''}>Ручные + seed</option>
            <option value="auto" ${source === 'auto' ? 'selected' : ''}>Авто-сигналы</option>
          </select></label>
          <button class="btn ghost small-btn" type="button" data-task-filter-reset>Сбросить</button>
        </div>
      </div>
    `;
  }

  function parseTaskArticleKeysInput(rawValue) {
    const raw = String(rawValue || '').replace(/\r\n?/g, '\n');
    if (!raw.trim()) return [];
    const seen = new Set();
    const result = [];
    raw
      .split('\n')
      .flatMap((line) => String(line || '').split(/[;,]/))
      .map((part) => part.trim().split(/\s+/)[0])
      .map((part) => part.replace(/^[-•*]+/, '').replace(/^["'`«»]+|["'`«»]+$/g, '').trim())
      .filter(Boolean)
      .forEach((articleKey) => {
        const key = articleKey.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(articleKey);
      });
    return result;
  }

  function renderLazyTaskRow(task) {
    const sku = getSku(task.articleKey);
    const entity = sku ? (sku.article || sku.articleKey) : (task.entityLabel || task.articleKey || 'Общая задача');
    const ownerQuick = !task.owner
      ? `
        <div class="task-owner-quick">
          <input data-task-owner-input="${escapeHtml(task.id)}" list="taskLazyOwnerList" placeholder="Owner">
          <button class="btn small-btn" type="button" data-task-assign-owner="${escapeHtml(task.id)}">Назначить</button>
        </div>
      `
      : '';
    const primaryAction = task.source === 'auto'
      ? `<button class="btn primary small-btn" type="button" data-take-task="${escapeHtml(task.id)}">Взять</button>`
      : task.status === 'new'
        ? `<button class="btn primary small-btn" type="button" data-task-status-fast="${escapeHtml(task.id)}" data-status="in_progress">В работу</button>`
        : `<button class="btn primary small-btn" type="button" data-open-task="${escapeHtml(task.id)}">Открыть</button>`;

    return `
      <div class="task-lazy-row ${isTaskOverdue(task) ? 'overdue' : ''}" data-task-row-id="${escapeHtml(task.id)}">
        <label class="task-select-box" title="Выбрать для массового действия">
          <input type="checkbox" data-task-bulk-select="${escapeHtml(task.id)}">
        </label>
        <div class="task-lazy-main">
          <div class="task-lazy-title">${escapeHtml(task.title || 'Задача')}</div>
          <div class="muted small">${escapeHtml(entity)} · ${escapeHtml(task.owner || 'Без owner')} · срок ${escapeHtml(task.due || '—')}</div>
          <div class="task-lazy-next">${escapeHtml(task.nextAction || task.reason || 'Нужен короткий следующий шаг.')}</div>
          <div class="badge-stack">${taskPriorityBadge(task)}${taskStatusBadge(task)}${taskPlatformBadge(task)}${taskSourceBadge(task)}</div>
        </div>
        <div class="task-lazy-actions">
          ${ownerQuick}
          <div class="task-due-quick">
            <button class="btn ghost small-btn" type="button" data-task-due-fast="${escapeHtml(task.id)}" data-days="1">+1д</button>
            <button class="btn ghost small-btn" type="button" data-task-due-fast="${escapeHtml(task.id)}" data-days="3">+3д</button>
            <button class="btn ghost small-btn" type="button" data-task-due-fast="${escapeHtml(task.id)}" data-days="7">+7д</button>
          </div>
          ${primaryAction}
          <button class="btn ghost small-btn" type="button" data-open-task="${escapeHtml(task.id)}">Карточка</button>
        </div>
      </div>
    `;
  }

  function renderGeneralQuickTaskForm(owners, defaultPlatform = 'cross') {
    const selectedPlatform = 'cross';
    return `
      <div class="task-general-create" data-task-general-create>
        <div class="task-general-create-head">
          <div>
            <strong>Общая задача</strong>
            <span>Без SKU: поручение, согласование, процесс или блок для команды.</span>
          </div>
          ${badge('без карточки', 'info')}
        </div>
        <form id="generalQuickTaskForm" class="task-general-form">
          <input name="title" placeholder="Что нужно сделать без привязки к SKU" required>
          <input name="owner" list="taskLazyOwnerList" placeholder="Кто ведёт">
          <input name="due" type="date" value="${plusDays(2)}">
          <button class="btn primary" type="submit">Поставить</button>
          <textarea name="nextAction" rows="2" placeholder="Первый шаг и ожидаемый результат" required></textarea>
          <details class="compact-details">
            <summary>Контекст и приоритет</summary>
            <div class="form-grid compact" style="margin-top:10px">
              <input name="entityLabel" placeholder="Тема / проект" value="Общая задача">
              <select name="platform">
                <option value="cross" ${selectedPlatform === 'cross' ? 'selected' : ''}>Общий контур</option>
                <option value="wb" ${selectedPlatform === 'wb' ? 'selected' : ''}>РОП WB</option>
                <option value="ozon" ${selectedPlatform === 'ozon' ? 'selected' : ''}>РОП Ozon</option>
                <option value="ya" ${selectedPlatform === 'ya' ? 'selected' : ''}>Я.Маркет</option>
                <option value="goldapple" ${selectedPlatform === 'goldapple' ? 'selected' : ''}>Золотое яблоко</option>
                <option value="letu" ${selectedPlatform === 'letu' ? 'selected' : ''}>Л'Этуаль</option>
                <option value="magnit" ${selectedPlatform === 'magnit' ? 'selected' : ''}>Магнит Маркет</option>
                <option value="product" ${selectedPlatform === 'product' ? 'selected' : ''}>Новинки</option>
              </select>
              <select name="priority">
                ${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${value === 'high' ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
              </select>
              <select name="type">
                <option value="general">Общее</option>
                <option value="launch">Новинка / запуск</option>
                <option value="traffic">Трафик / продвижение</option>
                <option value="content">Контент / карточка</option>
                <option value="assignment">Закрепление</option>
              </select>
              <textarea name="reason" rows="3" placeholder="Почему задача появилась / что важно знать"></textarea>
            </div>
          </details>
        </form>
      </div>
    `;
  }

  function renderTaskBulkToolbar(owners, selected) {
    return `
      <div class="task-bulk-toolbar" data-task-bulk-toolbar>
        <div>
          <strong>Массовые действия</strong>
          <span>${fmt.int(selected.length)} выбрано</span>
        </div>
        <input data-task-bulk-owner list="taskLazyOwnerList" placeholder="Назначить owner">
        <button class="btn small-btn" type="button" data-task-bulk-action="assign_owner">Owner</button>
        <button class="btn ghost small-btn" type="button" data-task-bulk-due="1">+1 день</button>
        <button class="btn ghost small-btn" type="button" data-task-bulk-due="3">+3 дня</button>
        <button class="btn ghost small-btn" type="button" data-task-bulk-due="7">+7 дней</button>
        <button class="btn ghost small-btn" type="button" data-task-bulk-action="in_progress">В работу</button>
        <button class="btn ghost small-btn" type="button" data-task-bulk-action="waiting_rop">К РОПу</button>
        <button class="btn ghost small-btn" type="button" data-task-bulk-action="done">Закрыть</button>
        <button class="btn ghost small-btn" type="button" data-task-cleanup>Навести порядок</button>
      </div>`;
  }

  function selectedBulkTaskIds(root) {
    return Array.from(root.querySelectorAll('[data-task-bulk-select]:checked'))
      .map((input) => String(input.dataset.taskBulkSelect || '').trim())
      .filter(Boolean);
  }

  async function applyBulkPatch(taskIds, patch) {
    const ids = [...new Set(taskIds || [])].filter(Boolean);
    for (const taskId of ids) {
      await updateTaskRecord(taskId, typeof patch === 'function' ? patch(taskId) : patch);
    }
    invalidateControlTaskCache();
    renderControlCenter();
    return ids.length;
  }

  async function cleanupControlTasks() {
    const rawTasks = typeof originalGetAllTasks === 'function' ? originalGetAllTasks() : getAllTasksDeduped();
    const active = (rawTasks || []).filter(isTaskActive);
    const byKey = new Map();
    const updates = [];

    for (const task of active) {
      const key = taskDedupeKey(task);
      const current = byKey.get(key);
      if (!current) {
        byKey.set(key, task);
        continue;
      }
      const keep = shouldPreferTask(task, current) ? task : current;
      const drop = keep === task ? current : task;
      byKey.set(key, keep);
      if (drop?.id && drop.source === 'auto') {
        updates.push({
          id: drop.id,
          patch: {
            status: 'cancelled',
            reason: `${drop.reason || ''}\nАвтоочистка: скрыт дубль задачи ${keep.title || keep.id}.`.trim()
          },
          note: 'дубль'
        });
      }
    }

    for (const task of active) {
      const sku = task.articleKey ? getSku(task.articleKey) : null;
      if (task.articleKey && !sku && task.source === 'auto') {
        updates.push({
          id: task.id,
          patch: {
            status: 'cancelled',
            reason: `${task.reason || ''}\nАвтоочистка: SKU не найден в текущем реестре.`.trim()
          },
          note: 'нет SKU'
        });
        continue;
      }
      const key = controlWorkstreamKey(task, sku);
      if (key && key !== 'all' && key !== task.platform && CONTROL_WORKSTREAM_META[key]) {
        updates.push({
          id: task.id,
          patch: { platform: key },
          note: 'контур'
        });
      }
    }

    const limited = updates.slice(0, 30);
    for (const update of limited) {
      await updateTaskRecord(update.id, update.patch);
    }
    invalidateControlTaskCache();
    renderControlCenter();
    return {
      total: updates.length,
      applied: limited.length,
      duplicates: updates.filter((item) => item.note === 'дубль').length,
      missingSku: updates.filter((item) => item.note === 'нет SKU').length,
      platform: updates.filter((item) => item.note === 'контур').length
    };
  }

  function renderTaskLazyPanel(tasks, owners) {
    const buckets = lazyTaskBuckets(tasks);
    const selectedWorkstream = selectedTaskWorkstream();
    const selectedWorkstreamMeta = controlWorkstreamMeta(selectedWorkstream);
    let queue = currentLazyQueue();
    if (queue === 'now' && RETAIL_ROP_WORKSTREAMS.has(selectedWorkstream)) queue = 'all';
    let selected = buckets[queue] || buckets.mine;
    let meta = lazyQueueMeta(queue);
    if (!selected.length && selectedWorkstream !== 'all' && buckets.all.length) {
      queue = 'all';
      selected = buckets.all;
      meta = {
        title: `${selectedWorkstreamMeta.label}: \u0432\u0441\u0435 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435`,
        text: '\u0412 \u043e\u0447\u0435\u0440\u0435\u0434\u0438 "\u0441\u0435\u0439\u0447\u0430\u0441" \u043f\u0443\u0441\u0442\u043e, \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u0432\u0441\u0435 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u043a\u043e\u043d\u0442\u0443\u0440\u0430.'
      };
    }
    const defaultPlatform = 'cross';
    const rawCount = controlTasksRawCount();
    const duplicatesHidden = Math.max(0, rawCount - (tasks || []).length);
    return `
      <div class="card task-lazy-panel" data-task-lazy-panel>
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(meta.title)}</h3>
            <p class="small muted">${escapeHtml(meta.text)}</p>
          </div>
          <div class="badge-stack">
            ${selectedWorkstream === 'all' ? badge('все контуры', 'info') : badge(`контур: ${selectedWorkstreamMeta.label}`, selectedWorkstreamMeta.kind)}
            ${badge(`${fmt.int(selected.length)} в очереди`, selected.length ? 'warn' : 'ok')}
            ${duplicatesHidden ? badge(`скрыто дублей ${fmt.int(duplicatesHidden)}`, 'info') : badge('дублей нет', 'ok')}
          </div>
        </div>
        <datalist id="taskLazyOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        ${renderTaskFilterBar(tasks, owners)}
        ${renderTaskBulkToolbar(owners, [])}
        ${renderGeneralQuickTaskForm(owners, defaultPlatform)}
        <div class="task-lazy-list">
          ${selected.length ? selected.slice(0, 10).map(renderLazyTaskRow).join('') : '<div class="empty">В этой очереди сейчас пусто.</div>'}
        </div>
        ${selected.length > 10 ? `<div class="muted small" style="margin-top:10px">Показали первые 10, остальное видно в полном режиме.</div>` : ''}
      </div>
    `;
  }

  function setAdvancedTaskVisibility(root) {
    const fullMode = Boolean(state?.controlFilters?.taskFullMode);
    root.classList.toggle('task-full-mode-on', fullMode);
    root.querySelectorAll('[data-task-advanced]').forEach((node) => {
      node.hidden = !fullMode;
    });
    root.querySelectorAll('[data-toggle-task-full-mode]').forEach((button) => {
      button.textContent = fullMode ? 'Скрыть полный режим' : 'Полный режим';
    });
  }

  function markAdvancedTaskBlocks(root, firstRowCards) {
    const kpi = root.querySelector('.kpi-strip');
    const overviewCard = kpi?.nextElementSibling?.matches?.('.card') ? kpi.nextElementSibling : null;
    const workstreamGrid = overviewCard?.nextElementSibling?.matches?.('.grid.cards') ? overviewCard.nextElementSibling : null;
    [kpi, overviewCard, workstreamGrid, firstRowCards?.[1], root.querySelector('.team-strip'), root.querySelector('.check-grid')]
      .filter(Boolean)
      .forEach((node) => { node.dataset.taskAdvanced = '1'; });

    const twoCol = root.querySelector('.two-col');
    let node = twoCol?.nextElementSibling || null;
    while (node && !node.classList?.contains('team-strip') && !node.classList?.contains('check-grid')) {
      if (!node.hasAttribute('data-task-lazy-panel')) node.dataset.taskAdvanced = '1';
      node = node.nextElementSibling;
    }
  }

  function tuneTaskHeader(root, tasks, baseTasks) {
    const title = root.querySelector('.section-title h2');
    const text = root.querySelector('.section-title p');
    const actions = root.querySelector('.section-title .quick-actions');
    const buckets = lazyTaskBuckets(tasks);
    const queue = currentLazyQueue();
    const selectedWorkstream = selectedTaskWorkstream();
    if (title) title.textContent = 'Задачи на сегодня';
    if (text) text.textContent = 'Сначала выбираем площадку: WB видит WB, Ozon видит Ozon, остальные маркетплейсы видят свой контур. Потом работаем короткой очередью.';
    if (actions) {
      actions.innerHTML = `
        ${renderPeopleRoleSwitch()}
        ${renderTaskWorkstreamSwitch(baseTasks || tasks, selectedWorkstream)}
        <div class="task-queue-switch">
          <button class="quick-chip ${queue === 'now' ? 'active' : ''}" type="button" data-task-lazy-queue="now">Сейчас ${fmt.int(buckets.now.length)}</button>
          <button class="quick-chip ${queue === 'mine' ? 'active' : ''}" type="button" data-task-lazy-queue="mine">Мои ${fmt.int(buckets.mine.length)}</button>
          <button class="quick-chip ${queue === 'urgent' ? 'active' : ''}" type="button" data-task-lazy-queue="urgent">Срочно ${fmt.int(buckets.urgent.length)}</button>
          <button class="quick-chip ${queue === 'waiting' ? 'active' : ''}" type="button" data-task-lazy-queue="waiting">Ждёт решения ${fmt.int(buckets.waiting.length)}</button>
          <button class="quick-chip ${queue === 'no_owner' ? 'active' : ''}" type="button" data-task-lazy-queue="no_owner">Без owner ${fmt.int(buckets.no_owner.length)}</button>
          <button class="quick-chip ${queue === 'general' ? 'active' : ''}" type="button" data-task-lazy-queue="general">Общие ${fmt.int(buckets.general.length)}</button>
          <button class="quick-chip" type="button" data-toggle-task-full-mode>Полный режим</button>
        </div>
      `;
    }
  }

  function renderCompactGeneralTaskCard(selectedWorkstream, owners, approvalCount) {
    const fixedPlatform = false;
    const defaultPlatform = 'cross';
    const defaultEntity = selectedWorkstream && selectedWorkstream !== 'all' ? controlWorkstreamMeta(selectedWorkstream).label : '';
    return `
      <div class="card" data-control-center-v2-form-card>
        <div class="section-subhead">
          <div>
            <h3>Быстро поставить задачу</h3>
            <p class="small muted">Минимум для старта: что сделать, кто ведёт, срок и первый шаг. Всё остальное можно дотянуть в карточке.</p>
          </div>
          ${badge(`${fmt.int(approvalCount)} на согласовании`, approvalCount ? 'warn' : 'ok')}
        </div>
        <datalist id="generalTaskOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <form id="generalTaskForm" class="form-stack">
          <input name="title" placeholder="Что нужно сделать" required>
          <div class="compact-row">
            <input name="owner" list="generalTaskOwnerList" placeholder="Кто ведёт задачу">
            <input name="coOwner" list="generalTaskOwnerList" placeholder="Соисполнитель">
            <input name="due" type="date" value="${plusDays(2)}">
          </div>
          ${fixedPlatform
            ? `<input type="hidden" name="platform" value="${escapeHtml(defaultPlatform)}"><div class="inline-hint">Контур задачи: ${escapeHtml(controlWorkstreamMeta(selectedWorkstream).label)}</div>`
            : `
              <select name="platform">
                <option value="cross" ${defaultPlatform === 'cross' ? 'selected' : ''}>Общий контур</option>
                <option value="wb">РОП WB</option>
                <option value="ozon">РОП Ozon</option>
                <option value="ya">Я.Маркет</option>
                <option value="goldapple">Золотое яблоко</option>
                <option value="letu">Л'Этуаль</option>
                <option value="magnit">Магнит Маркет</option>
              </select>
            `}
          <textarea name="nextAction" rows="3" placeholder="Какой первый шаг делаем сразу" required></textarea>
          <details class="compact-details">
            <summary>Дополнительно: контекст и приоритет</summary>
            <div class="form-grid compact" style="margin-top:10px">
              <input name="entityLabel" placeholder="Проект / тема / блок" value="${escapeHtml(defaultEntity)}">
              <select name="priority">
                ${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${value === 'high' ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
              </select>
              <select name="type">
                <option value="general">Общее</option>
                <option value="launch">Новинка / запуск</option>
                <option value="traffic">Трафик / продвижение</option>
                <option value="content">Контент / карточка</option>
                <option value="assignment">Закрепление</option>
              </select>
              <textarea name="articleKeys" rows="4" placeholder="Артикулы для массовой постановки, по одному в строке"></textarea>
              <textarea name="reason" rows="3" placeholder="Коротко: зачем задача и какой контекст"></textarea>
            </div>
          </details>
          <button class="btn primary" type="submit">Поставить задачу</button>
        </form>
      </div>
    `;
  }

  function renderGeneralTaskEnhancements(root) {
    root.querySelector('[data-control-center-v2-block]')?.remove();
    root.querySelector('[data-task-lazy-panel]')?.remove();
    const tasks = typeof filteredControlTasks === 'function' ? filteredControlTasks() : getAllTasks();
    const baseTasks = typeof filteredControlTasks === 'function' ? filteredControlTasks({ ignorePlatform: true }) : getAllTasks();
    const owners = ownerOptions();
    const approvalCount = tasks.filter((task) => task.status === 'waiting_rop' || task.status === 'waiting_decision').length;
    const selectedWorkstreamRaw = String(state?.controlFilters?.platform || '').trim().toLowerCase();
    const selectedWorkstream = selectedWorkstreamRaw === 'retail' ? 'all' : (CONTROL_WORKSTREAM_META[selectedWorkstreamRaw] ? selectedWorkstreamRaw : 'all');
    const firstTwoCol = root.querySelector('.two-col');
    const firstRowCards = firstTwoCol ? Array.from(firstTwoCol.children).filter((node) => node.classList?.contains('card')) : [];

    tuneTaskHeader(root, tasks, baseTasks);
    markAdvancedTaskBlocks(root, firstRowCards);

    const sectionTitle = root.querySelector('.section-title');
    if (sectionTitle) {
      sectionTitle.insertAdjacentHTML('afterend', renderTaskLazyPanel(tasks, owners));
    }

    if (firstRowCards[0]) {
      firstRowCards[0].outerHTML = renderCompactGeneralTaskCard(selectedWorkstream, owners, approvalCount);
    } else {
      const target = root.querySelector('.kpi-strip');
      if (target) {
        target.insertAdjacentHTML('afterend', `
          <div style="margin:14px 0" data-control-center-v2-block>
            ${renderCompactGeneralTaskCard(selectedWorkstream, owners, approvalCount)}
          </div>
        `);
      }
    }

    setAdvancedTaskVisibility(root);

    const summaryHint = root.querySelector('.task-mini:last-child .muted.small');
    if (summaryHint) {
      summaryHint.textContent = approvalCount
        ? 'Открыть задачу, обновить шаг и отправить результат на согласование.'
        : 'Открывать задачу, фиксировать короткий апдейт и вести следующий шаг.';
    }

    root.querySelectorAll('[data-task-filter]').forEach((control) => {
      const eventName = control.tagName === 'INPUT' ? 'input' : 'change';
      control.addEventListener(eventName, (event) => {
        const key = event.currentTarget.getAttribute('data-task-filter');
        if (!key) return;
        state.controlFilters = state.controlFilters || {};
        state.controlFilters[key] = event.currentTarget.value;
        renderControlCenter();
      });
    });

    root.querySelector('[data-task-filter-reset]')?.addEventListener('click', () => {
      state.controlFilters = {
        ...(state.controlFilters || {}),
        search: '',
        owner: 'all',
        status: 'active',
        type: 'all',
        priority: 'all',
        horizon: 'all',
        source: 'all'
      };
      renderControlCenter();
    });

    root.querySelectorAll('[data-task-lazy-queue]').forEach((button) => button.addEventListener('click', () => {
      state.controlFilters.lazyQueue = button.dataset.taskLazyQueue || 'mine';
      renderControlCenter();
    }));

    root.querySelectorAll('[data-task-role]').forEach((button) => button.addEventListener('click', () => {
      const role = button.dataset.taskRole || 'leader';
      const roleMeta = CONTROL_ROLE_PRESETS.find((item) => item.key === role) || CONTROL_ROLE_PRESETS[0];
      state.controlFilters.peopleRole = roleMeta.key;
      state.controlFilters.platform = roleMeta.platform;
      state.controlFilters.lazyQueue = preferredLazyQueueForWorkstream(roleMeta.platform);
      renderControlCenter();
    }));

    root.querySelectorAll('[data-task-platform-filter]').forEach((button) => button.addEventListener('click', () => {
      state.controlFilters.peopleRole = '';
      state.controlFilters.platform = button.dataset.taskPlatformFilter || 'all';
      state.controlFilters.lazyQueue = preferredLazyQueueForWorkstream(state.controlFilters.platform);
      renderControlCenter();
    }));

    root.querySelectorAll('[data-toggle-task-full-mode]').forEach((button) => button.addEventListener('click', () => {
      state.controlFilters.taskFullMode = !state.controlFilters.taskFullMode;
      setAdvancedTaskVisibility(root);
    }));

    root.querySelectorAll('[data-task-status-fast]').forEach((button) => button.addEventListener('click', async () => {
      const taskId = button.dataset.taskStatusFast;
      const status = button.dataset.status || 'in_progress';
      if (!taskId) return;
      await updateTaskStatus(taskId, status);
      renderControlCenter();
    }));

    root.querySelectorAll('[data-task-due-fast]').forEach((button) => button.addEventListener('click', async () => {
      const taskId = button.dataset.taskDueFast;
      const days = Number(button.dataset.days || 1);
      if (!taskId) return;
      await updateTaskRecord(taskId, { due: plusDays(Number.isFinite(days) ? days : 1) });
      renderControlCenter();
    }));

    root.querySelectorAll('[data-task-assign-owner]').forEach((button) => button.addEventListener('click', async () => {
      const taskId = button.dataset.taskAssignOwner;
      const input = root.querySelector(`[data-task-owner-input="${CSS.escape(taskId)}"]`);
      const owner = String(input?.value || '').trim();
      if (!taskId || !owner) return;
      await updateTaskRecord(taskId, { owner });
      renderControlCenter();
    }));

    const bulkToolbar = root.querySelector('[data-task-bulk-toolbar]');
    const refreshBulkToolbar = () => {
      const selectedIds = selectedBulkTaskIds(root);
      if (bulkToolbar) {
        bulkToolbar.classList.toggle('has-selection', selectedIds.length > 0);
        const label = bulkToolbar.querySelector('span');
        if (label) label.textContent = `${fmt.int(selectedIds.length)} выбрано`;
      }
      root.querySelectorAll('[data-task-row-id]').forEach((row) => {
        const id = row.getAttribute('data-task-row-id') || '';
        row.classList.toggle('is-selected', selectedIds.includes(id));
      });
    };
    root.querySelectorAll('[data-task-bulk-select]').forEach((input) => {
      input.addEventListener('change', refreshBulkToolbar);
    });
    refreshBulkToolbar();

    root.querySelectorAll('[data-task-bulk-due]').forEach((button) => button.addEventListener('click', async () => {
      const ids = selectedBulkTaskIds(root);
      if (!ids.length) return;
      const days = Number(button.dataset.taskBulkDue || 1);
      await applyBulkPatch(ids, { due: plusDays(Number.isFinite(days) ? days : 1) });
    }));

    root.querySelectorAll('[data-task-bulk-action]').forEach((button) => button.addEventListener('click', async () => {
      const ids = selectedBulkTaskIds(root);
      if (!ids.length) return;
      const action = button.dataset.taskBulkAction || '';
      if (action === 'assign_owner') {
        const owner = String(root.querySelector('[data-task-bulk-owner]')?.value || '').trim();
        if (!owner) return;
        await applyBulkPatch(ids, { owner });
        return;
      }
      if (action === 'in_progress') await applyBulkPatch(ids, { status: 'in_progress' });
      if (action === 'waiting_rop') await applyBulkPatch(ids, { status: 'waiting_rop' });
      if (action === 'done') await applyBulkPatch(ids, { status: 'done' });
    }));

    root.querySelector('[data-task-cleanup]')?.addEventListener('click', async () => {
      const result = await cleanupControlTasks();
      alert(`Порядок наведён: применено ${result.applied} из ${result.total}. Дубли: ${result.duplicates}, нет SKU: ${result.missingSku}, контуры: ${result.platform}.`);
    });

    root.querySelector('#generalQuickTaskForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const task = await createManualTask({
        articleKey: '',
        entityLabel: form.get('entityLabel') || 'Общая задача',
        title: form.get('title'),
        type: form.get('type') || 'general',
        priority: form.get('priority') || 'high',
        platform: form.get('platform') || 'cross',
        owner: form.get('owner'),
        coOwner: form.get('coOwner'),
        due: form.get('due'),
        nextAction: form.get('nextAction'),
        reason: form.get('reason')
      });
      state.controlFilters.lazyQueue = 'general';
      renderControlCenter();
      if (task?.id) openTaskModal(task.id);
    });

    firstTwoCol?.querySelector('#generalTaskForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const basePayload = {
        articleKey: '',
        entityLabel: form.get('entityLabel'),
        title: form.get('title'),
        type: form.get('type') || 'general',
        priority: form.get('priority') || 'high',
        platform: form.get('platform') || (selectedWorkstream !== 'all' ? selectedWorkstream : 'cross'),
        owner: form.get('owner'),
        coOwner: form.get('coOwner'),
        due: form.get('due'),
        nextAction: form.get('nextAction'),
        reason: form.get('reason')
      };
      const articleKeys = parseTaskArticleKeysInput(form.get('articleKeys'));
      const createdTasks = [];
      if (articleKeys.length) {
        for (const articleKey of articleKeys) {
          const sku = typeof getSku === 'function' ? getSku(articleKey) : null;
          const task = await createManualTask({
            ...basePayload,
            articleKey,
            entityLabel: basePayload.entityLabel || sku?.name || articleKey,
            owner: String(basePayload.owner || ownerName(sku) || '').trim(),
            skipRerender: true
          });
          if (task?.id) createdTasks.push(task);
        }
      } else {
        const task = await createManualTask(basePayload);
        if (task?.id) createdTasks.push(task);
      }
      renderControlCenter();
      if (createdTasks[0]?.id) openTaskModal(createdTasks[0].id);
    });

    const platformSelect = root.querySelector('#controlPlatformFilter');
    if (platformSelect && !platformSelect.querySelector('option[value="cross"]')) {
      platformSelect.insertAdjacentHTML('beforeend', `
        <option value="ya" ${selectedWorkstream === 'ya' ? 'selected' : ''}>Я.Маркет</option>
        <option value="goldapple" ${selectedWorkstream === 'goldapple' ? 'selected' : ''}>Золотое яблоко</option>
        <option value="letu" ${selectedWorkstream === 'letu' ? 'selected' : ''}>Л'Этуаль</option>
        <option value="magnit" ${selectedWorkstream === 'magnit' ? 'selected' : ''}>Магнит Маркет</option>
        <option value="cross" ${selectedWorkstream === 'cross' ? 'selected' : ''}>Общий контур</option>
      `);
    }
  }

  function openTaskModal(taskId) {
    renderTaskModal(taskId);
  }

  function installGlobalBindings() {
    window.__ALTEA_CONTROL_CENTER_V2__ = true;

    window.parseTaskLogComment = parseTaskLogComment;
    window.getTask = getTask;
    window.getTaskHistory = getTaskHistory;
    window.getRecentTaskHistory = getRecentTaskHistory;
    window.ensureTaskModal = ensureTaskModal;
    window.closeTaskModal = closeTaskModal;
    window.openTaskModal = openTaskModal;
    window.renderTaskModal = renderTaskModal;
    window.createTaskHistoryEntry = createTaskHistoryEntry;
    window.closeTaskWithReport = finalCloseTaskWithReport;
    window.submitTaskForRopApproval = submitTaskForRopApproval;
    window.approveTaskByRop = approveTaskByRop;
    window.returnTaskToWork = returnTaskToWork;
    window.finalCloseTaskWithReport = finalCloseTaskWithReport;
    window.updateTaskRecord = updateTaskRecord;
    window.getAllTasks = getAllTasksDeduped;
    window.getControlSnapshot = getControlSnapshotCached;
    window.invalidateControlTaskCache = invalidateControlTaskCache;
    window.taskPlatformBadge = function patchedTaskPlatformBadge(task) {
      const meta = controlWorkstreamMeta(controlWorkstreamKey(task, getSku(task.articleKey)));
      return badge(meta.chip, meta.kind);
    };
    window.renderTaskCard = renderTaskCardPatched;
    window.renderMiniTask = renderMiniTaskPatched;
    window.createManualTask = createManualTaskV2;
    window.takeAutoTask = takeAutoTaskV2;
    window.updateTaskStatus = updateTaskStatusV2;
    window.getSkuComments = function patchedGetSkuComments(articleKey) {
      const comments = typeof originalGetSkuComments === 'function'
        ? originalGetSkuComments(articleKey)
        : (state.storage.comments || []).filter((comment) => comment.articleKey === articleKey);
      return (comments || []).filter((comment) => !parseTaskLogComment(comment));
    };
    window.renderControlCenter = function patchedRenderControlCenter() {
      if (typeof originalRenderControlCenter === 'function') originalRenderControlCenter();
      const root = document.getElementById('view-control');
      if (!root) return;
      if (root.dataset.controlSimple && !state?.controlFilters?.taskSimpleFullMode) return;
      renderGeneralTaskEnhancements(root);
    };

    try { taskPlatformBadge = window.taskPlatformBadge; } catch {}
    try { renderTaskCard = window.renderTaskCard; } catch {}
    try { renderMiniTask = window.renderMiniTask; } catch {}
    try { createManualTask = window.createManualTask; } catch {}
    try { takeAutoTask = window.takeAutoTask; } catch {}
    try { updateTaskRecord = window.updateTaskRecord; } catch {}
    try { updateTaskStatus = window.updateTaskStatus; } catch {}
    try { submitTaskForRopApproval = window.submitTaskForRopApproval; } catch {}
    try { approveTaskByRop = window.approveTaskByRop; } catch {}
    try { returnTaskToWork = window.returnTaskToWork; } catch {}
    try { finalCloseTaskWithReport = window.finalCloseTaskWithReport; } catch {}
    try { closeTaskWithReport = window.closeTaskWithReport; } catch {}
    try { getAllTasks = window.getAllTasks; } catch {}
    try { getControlSnapshot = window.getControlSnapshot; } catch {}
    try { getSkuComments = window.getSkuComments; } catch {}
    try { renderControlCenter = window.renderControlCenter; } catch {}
  }

  function installGlobalListeners() {
    if (window.__ALTEA_CONTROL_CENTER_V2_LISTENERS__) return;
    window.__ALTEA_CONTROL_CENTER_V2_LISTENERS__ = true;

    document.body.addEventListener('click', (event) => {
      const openTaskBtn = event.target.closest('[data-open-task]');
      if (openTaskBtn) {
        openTaskModal(openTaskBtn.dataset.openTask);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeTaskModal();
    });
  }

  installGlobalBindings();
  installGlobalListeners();
  if (state?.activeView === 'control') renderControlCenter();
})();
