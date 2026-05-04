(function () {
  if (window.__ALTEA_CONTROL_CENTER_V2__) return;
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
    retail: { label: 'ЯМ / сети', chip: 'ЯМ / сети', kind: 'ok' },
    cross: { label: 'Общий контур', chip: 'Общий контур', kind: '' }
  };

  const originalRenderControlCenter = typeof renderControlCenter === 'function' ? renderControlCenter : null;
  const originalGetSkuComments = typeof getSkuComments === 'function' ? getSkuComments : null;

  function parseTaskLogComment(comment) {
    const match = String(comment?.text || '').match(/^\[\[task:([^\]]+)\]\]\s*\[\[kind:([^\]]+)\]\]\s*/i);
    if (!match) return null;
    return {
      taskId: match[1],
      kind: match[2],
      text: String(comment?.text || '').replace(match[0], '').trim()
    };
  }

  function normalizeTaskPlatform(value, contextText) {
    const raw = String(value || '').trim().toLowerCase();
    const text = `${raw} ${String(contextText || '').trim().toLowerCase()}`;
    if (raw === 'cross' || raw === 'common' || raw === 'general' || raw === 'shared') return 'cross';
    if (raw === 'retail') return 'retail';
    if (raw === 'wb') return 'wb';
    if (raw === 'ozon') return 'ozon';
    if (raw === 'wb+ozon' || raw === 'wb + ozon' || raw === 'all') return 'cross';
    if (/яндекс|я[.\s-]?маркет|letu?al|л[еэ]туал|магнит|golden apple|золот[а-я\s-]*яблок/.test(text)) return 'retail';
    if (/(^|\W)wb($|\W)|wildberries|вб/.test(text)) return 'wb';
    if (/ozon|озон/.test(text)) return 'ozon';
    return 'cross';
  }

  function controlWorkstreamMeta(key) {
    return CONTROL_WORKSTREAM_META[key] || CONTROL_WORKSTREAM_META.cross;
  }

  function controlWorkstreamKey(task, sku) {
    const text = `${task?.title || ''} ${task?.nextAction || ''} ${task?.reason || ''} ${task?.entityLabel || ''}`;
    const platform = normalizeTaskPlatform(task?.platform, text);
    if (platform === 'wb') return 'wb';
    if (platform === 'ozon') return 'ozon';
    if (platform === 'retail') return 'retail';
    if (platform === 'cross') return 'cross';
    if (sku?.flags?.toWorkWB && !sku?.flags?.toWorkOzon) return 'wb';
    if (sku?.flags?.toWorkOzon && !sku?.flags?.toWorkWB) return 'ozon';
    return 'cross';
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

  function ensureTaskModal() {
    let modal = document.getElementById('taskModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'taskModal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-card task-modal-card" id="taskModalBody"></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
      if (event.target.id === 'taskModal') closeTaskModal();
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
    await createComment({
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
    rerenderCurrentView();
    if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
    return task;
  }

  async function takeAutoTaskV2(taskId) {
    const task = typeof getAllTasks === 'function'
      ? getAllTasks().find((item) => item.id === taskId)
      : null;
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

  async function updateTaskRecord(taskId, patch) {
    const current = (state.storage.tasks || []).find((item) => item.id === taskId);
    if (!current) return null;
    const before = { ...current };
    const updated = normalizeTask({
      ...current,
      ...patch,
      id: current.id,
      source: current.source,
      createdAt: current.createdAt,
      articleKey: patch && patch.articleKey !== undefined ? patch.articleKey : current.articleKey
    }, current.source || 'manual');
    Object.assign(current, updated);
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

  async function closeTaskWithReport(taskId, report) {
    const task = await updateTaskRecord(taskId, { status: 'done' });
    if (!task) return null;
    await createTaskHistoryEntry(taskId, 'report', `Задача закрыта с отчётом: ${report}`);
    return task;
  }

  async function submitTaskForRopApproval(taskId, report) {
    const task = await updateTaskRecord(taskId, { status: 'waiting_rop' });
    if (!task) return null;
    await createTaskHistoryEntry(taskId, 'report', `\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c \u0441\u0434\u0430\u043b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0420\u041e\u041f\u0443 \u043d\u0430 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u0435: ${report}`);
    return task;
  }

  async function approveTaskByRop(taskId, comment) {
    const task = await updateTaskRecord(taskId, { status: 'waiting_decision' });
    if (!task) return null;
    const note = String(comment || '').trim();
    await createTaskHistoryEntry(
      taskId,
      'status',
      note
        ? `\u0420\u041e\u041f \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e: ${note}`
        : '\u0420\u041e\u041f \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e \u043d\u0430 \u0444\u0438\u043d\u0430\u043b\u044c\u043d\u043e\u0435 \u0437\u0430\u043a\u0440\u044b\u0442\u0438\u0435.'
    );
    return task;
  }

  async function returnTaskToWork(taskId, comment) {
    const task = await updateTaskRecord(taskId, { status: 'in_progress' });
    if (!task) return null;
    const note = String(comment || '').trim();
    await createTaskHistoryEntry(
      taskId,
      'comment',
      note
        ? `\u0420\u041e\u041f \u0432\u0435\u0440\u043d\u0443\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0432 \u0440\u0430\u0431\u043e\u0442\u0443: ${note}`
        : '\u0420\u041e\u041f \u0432\u0435\u0440\u043d\u0443\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0432 \u0440\u0430\u0431\u043e\u0442\u0443.'
    );
    return task;
  }

  async function finalCloseTaskWithReport(taskId, report) {
    const task = await updateTaskRecord(taskId, { status: 'done' });
    if (!task) return null;
    await createTaskHistoryEntry(taskId, 'report', `\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u0444\u0438\u043d\u0430\u043b\u044c\u043d\u043e \u0437\u0430\u043a\u0440\u044b\u043b \u0437\u0430\u0434\u0430\u0447\u0443: ${report}`);
    return task;
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
              <option value="retail" ${normalizeTaskPlatform(task.platform) === 'retail' ? 'selected' : ''}>ЯМ / сети</option>
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
    }

    if (replacedHistoryCard) {
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
                <option value="retail" ${normalizeTaskPlatform(task.platform) === 'retail' ? 'selected' : ''}>ЯМ / сети</option>
              </select>
              <textarea name="reason" rows="3" placeholder="Контекст / почему задача возникла">${escapeHtml(task.reason || '')}</textarea>
            </div>
          </details>
          <button class="btn primary" type="submit">Сохранить</button>
        </form>
      </div>
    `;
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
        <div class="compact-history" style="margin-top:12px">${historyHtml}</div>
        <form id="taskCommentForm" class="form-stack" style="margin-top:12px">
          <textarea name="text" rows="3" placeholder="Короткий апдейт по задаче" required></textarea>
          <button class="btn" type="submit">Сохранить апдейт</button>
        </form>
      </div>
    `;
  }

  function renderCompactGeneralTaskCard(selectedWorkstream, owners, approvalCount) {
    const fixedPlatform = selectedWorkstream && selectedWorkstream !== 'all';
    const defaultPlatform = fixedPlatform ? selectedWorkstream : 'cross';
    const defaultEntity = fixedPlatform ? controlWorkstreamMeta(selectedWorkstream).label : '';
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
            <input name="due" type="date" value="${plusDays(2)}">
          </div>
          ${fixedPlatform
            ? `<input type="hidden" name="platform" value="${escapeHtml(defaultPlatform)}"><div class="inline-hint">Контур задачи: ${escapeHtml(controlWorkstreamMeta(selectedWorkstream).label)}</div>`
            : `
              <select name="platform">
                <option value="cross" ${defaultPlatform === 'cross' ? 'selected' : ''}>Общий контур</option>
                <option value="wb">РОП WB</option>
                <option value="ozon">РОП Ozon</option>
                <option value="retail">ЯМ / сети</option>
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
    const tasks = typeof filteredControlTasks === 'function' ? filteredControlTasks() : getAllTasks();
    const owners = ownerOptions();
    const approvalCount = tasks.filter((task) => task.status === 'waiting_rop' || task.status === 'waiting_decision').length;
    const selectedWorkstream = CONTROL_WORKSTREAM_META[state?.controlFilters?.platform] ? state.controlFilters.platform : 'all';
    const firstTwoCol = root.querySelector('.two-col');
    const firstRowCards = firstTwoCol ? Array.from(firstTwoCol.children).filter((node) => node.classList?.contains('card')) : [];

    if (firstRowCards[1]) {
      firstRowCards[1].outerHTML = renderCompactGeneralTaskCard(selectedWorkstream, owners, approvalCount);
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

    const summaryHint = root.querySelector('.task-mini:last-child .muted.small');
    if (summaryHint) {
      summaryHint.textContent = approvalCount
        ? 'Открыть задачу, обновить шаг и отправить результат на согласование.'
        : 'Открывать задачу, фиксировать короткий апдейт и вести следующий шаг.';
    }

    root.querySelector('#generalTaskForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const task = await createManualTask({
        articleKey: '',
        entityLabel: form.get('entityLabel'),
        title: form.get('title'),
        type: form.get('type') || 'general',
        priority: form.get('priority') || 'high',
        platform: form.get('platform') || (selectedWorkstream !== 'all' ? selectedWorkstream : 'cross'),
        owner: form.get('owner'),
        due: form.get('due'),
        nextAction: form.get('nextAction'),
        reason: form.get('reason')
      });
      renderControlCenter();
      if (task?.id) openTaskModal(task.id);
    });

    const platformSelect = root.querySelector('#controlPlatformFilter');
    if (platformSelect && !platformSelect.querySelector('option[value="cross"]')) {
      platformSelect.insertAdjacentHTML('beforeend', `
        <option value="retail" ${state.controlFilters.platform === 'retail' ? 'selected' : ''}>ЯМ / сети</option>
        <option value="cross" ${state.controlFilters.platform === 'cross' ? 'selected' : ''}>Общий контур</option>
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
    window.updateTaskRecord = updateTaskRecord;
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
      renderGeneralTaskEnhancements(root);
    };

    try { taskPlatformBadge = window.taskPlatformBadge; } catch {}
    try { renderTaskCard = window.renderTaskCard; } catch {}
    try { renderMiniTask = window.renderMiniTask; } catch {}
    try { createManualTask = window.createManualTask; } catch {}
    try { takeAutoTask = window.takeAutoTask; } catch {}
    try { updateTaskStatus = window.updateTaskStatus; } catch {}
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
