(function () {
  if (window.__ALTEA_TASK_SIMPLE_PATCH_20260422__) return;
  window.__ALTEA_TASK_SIMPLE_PATCH_20260422__ = true;

  const SIMPLE_STATUS_META = {
    new: { label: 'Новая', kind: 'warn' },
    in_progress: { label: 'В работе', kind: 'info' },
    waiting_team: { label: 'Ждёт другой отдел', kind: 'warn' },
    waiting_rop: { label: 'На согласовании у РОПа', kind: 'warn' },
    waiting_decision: { label: 'На согласовании у руководителя', kind: 'danger' },
    done: { label: 'Сделано', kind: 'ok' },
    cancelled: { label: 'Отменено', kind: '' }
  };

  const SIMPLE_WORKSTREAM_META = {
    all: { label: 'Все задачи', chip: 'Все контуры', kind: '' },
    wb: { label: 'РОП WB', chip: 'WB', kind: 'warn' },
    ozon: { label: 'РОП Ozon', chip: 'Ozon', kind: 'info' },
    retail: { label: 'ЯМ / сети', chip: 'ЯМ / сети', kind: 'ok' },
    product: { label: 'Продукт / новинки', chip: 'Продукт', kind: 'info' },
    executive: { label: 'Руководитель / директор', chip: 'Директор', kind: 'danger' },
    cross: { label: 'Общий контур', chip: 'Общий контур', kind: '' }
  };

  const TASK_LOG_KIND_META = {
    created: { label: 'Создана', tone: 'info' },
    updated: { label: 'Изменена', tone: 'warn' },
    comment: { label: 'Комментарий', tone: 'ok' },
    status: { label: 'Статус', tone: 'info' },
    report: { label: 'Отчёт', tone: 'ok' }
  };

  const renderControlCenterBase = typeof renderControlCenter === 'function' ? renderControlCenter : null;
  const renderTaskModalBase = typeof renderTaskModal === 'function' ? renderTaskModal : null;
  const getSkuCommentsBase = typeof getSkuComments === 'function' ? getSkuComments : null;

  function statusMeta(status) {
    return SIMPLE_STATUS_META[status] || SIMPLE_STATUS_META.new;
  }

  function workstreamMeta(key) {
    return SIMPLE_WORKSTREAM_META[key] || SIMPLE_WORKSTREAM_META.cross;
  }

  function taskLogMeta(kind) {
    return TASK_LOG_KIND_META[kind] || TASK_LOG_KIND_META.comment;
  }

  function normalizeTaskPlatformSimple(value, contextText = '') {
    const raw = String(value || '').trim().toLowerCase();
    const text = `${raw} ${String(contextText || '').trim().toLowerCase()}`;
    if (raw === 'wb') return 'wb';
    if (raw === 'ozon') return 'ozon';
    if (raw === 'retail') return 'retail';
    if (raw === 'product' || raw === 'launch' || raw === 'launches') return 'product';
    if (raw === 'executive' || raw === 'director' || raw === 'management') return 'executive';
    if (['cross', 'common', 'general', 'shared', 'all', 'wb+ozon', 'wb + ozon'].includes(raw)) return 'cross';
    if (/продукт|новин|launch|ксюш/.test(text)) return 'product';
    if (/директор|руководител|эскалац|согласовани/.test(text)) return 'executive';
    if (/яндекс|я[.\s-]?маркет|letu?al|л[еэ]туал|магнит|golden apple|золот[а-я\s-]*яблок/.test(text)) return 'retail';
    if (/(^|\W)wb($|\W)|wildberries|вб/.test(text)) return 'wb';
    if (/ozon|озон/.test(text)) return 'ozon';
    return 'cross';
  }

  function controlWorkstreamKeySimple(task, sku) {
    const text = `${task?.title || ''} ${task?.nextAction || ''} ${task?.reason || ''} ${task?.entityLabel || ''}`;
    const platform = normalizeTaskPlatformSimple(task?.platform, text);
    if (platform === 'wb') return 'wb';
    if (platform === 'ozon') return 'ozon';
    if (platform === 'retail') return 'retail';
    if (platform === 'product') return 'product';
    if (platform === 'executive') return 'executive';
    if (sku?.flags?.toWorkWB && !sku?.flags?.toWorkOzon) return 'wb';
    if (sku?.flags?.toWorkOzon && !sku?.flags?.toWorkWB) return 'ozon';
    if (task?.type === 'launch') return 'product';
    return 'cross';
  }

  function parseTaskLogCommentLocal(comment) {
    const text = String(comment?.text || '');
    const match = text.match(/^\[\[task:([^\]]+)\]\]\s*\[\[kind:([^\]]+)\]\]\s*/i);
    if (!match) return null;
    return {
      taskId: match[1],
      kind: match[2],
      text: text.replace(match[0], '').trim()
    };
  }

  function getTaskLocal(taskId) {
    if (typeof getTask === 'function') {
      const task = getTask(taskId);
      if (task) return task;
    }
    return typeof getAllTasks === 'function'
      ? getAllTasks().find((task) => task.id === taskId) || null
      : null;
  }

  function getTaskHistoryLocal(taskId) {
    return (state.storage.comments || [])
      .map((comment) => {
        const parsed = parseTaskLogCommentLocal(comment);
        return parsed && parsed.taskId === taskId ? { ...comment, kind: parsed.kind, text: parsed.text } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function getRecentTaskHistoryLocal(tasks, limit = 6) {
    const taskIds = new Set((tasks || []).map((task) => task.id).filter(Boolean));
    return (state.storage.comments || [])
      .map((comment) => {
        const parsed = parseTaskLogCommentLocal(comment);
        return parsed && taskIds.has(parsed.taskId) ? { ...comment, taskId: parsed.taskId, kind: parsed.kind, text: parsed.text } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  function taskAttachmentBytesLabel(bytes) {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  }

  function isCrossTaskForAttachments(task) {
    const key = normalizeTaskPlatformSimple(task?.platform);
    return key === 'cross';
  }

  function taskAttachmentList(taskId) {
    if (typeof getTaskAttachments === 'function') return getTaskAttachments(taskId);
    return (state.storage.taskAttachments || [])
      .map((item) => (typeof normalizeTaskAttachment === 'function' ? normalizeTaskAttachment(item) : item))
      .filter((item) => String(item?.taskId || '') === String(taskId || ''))
      .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));
  }

  function taskAttachmentHref(item) {
    const normalized = typeof normalizeTaskAttachment === 'function' ? normalizeTaskAttachment(item) : item;
    if (!normalized) return '';
    if (normalized.publicUrl) return normalized.publicUrl;
    if (typeof taskAttachmentPublicUrl === 'function') return taskAttachmentPublicUrl(normalized.bucket, normalized.objectPath);
    return '';
  }

  function normalizeMultilineTaskText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\s+$/g, ''))
      .join('\n')
      .trim();
  }

  function parseTaskArticleKeysInput(rawValue) {
    const raw = String(rawValue || '').replace(/\r\n?/g, '\n');
    if (!raw.trim()) return [];
    const result = [];
    const seen = new Set();
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const firstCell = line.includes('\t') ? String(line.split('\t')[0] || '').trim() : line;
        if (!firstCell) return;
        const chunks = firstCell.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
        (chunks.length ? chunks : [firstCell]).forEach((chunk) => {
          const token = String(chunk || '').trim().split(/\s+/)[0] || '';
          const normalized = token
            .replace(/^[-•*]+/, '')
            .replace(/^["'`«»]+|["'`«»]+$/g, '')
            .trim();
          if (!normalized) return;
          const key = normalized.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          result.push(normalized);
        });
      });
    return result;
  }

  function renderTaskAttachmentsCard(task, attachments) {
    const canUpload = isCrossTaskForAttachments(task);
    const maxMb = Number.isFinite(Number(TASK_ATTACHMENT_MAX_BYTES)) ? Math.max(1, Math.round(Number(TASK_ATTACHMENT_MAX_BYTES) / (1024 * 1024))) : 20;
    const listHtml = attachments.length
      ? attachments.map((item) => {
        const href = taskAttachmentHref(item);
        return `
          <div class="comment-item">
            <div class="head">
              <strong>${escapeHtml(item.fileName || 'Файл')}</strong>
              <div class="badge-stack">${badge(taskAttachmentBytesLabel(item.size || 0), '')}${badge(item.createdBy || 'Команда', 'info')}</div>
            </div>
            <div class="muted small">${fmt.date(item.createdAt)}</div>
            <div class="quick-actions" style="margin-top:8px;justify-content:flex-start">
              ${href ? `<a class="quick-chip" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Открыть</a>` : ''}
              <button class="quick-chip" type="button" data-task-attachment-delete="${escapeHtml(item.id)}">Удалить</button>
            </div>
          </div>
        `;
      }).join('')
      : '<div class="comment-item"><div class="muted small">Вложений пока нет.</div></div>';

    return `
      <div class="card" data-task-attachments-card style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Вложения к задаче</h3>
            <p class="small muted">Excel-файлы лежат в Supabase Storage и доступны команде из карточки задачи.</p>
          </div>
          ${badge(`${fmt.int(attachments.length)} файлов`, attachments.length ? 'info' : 'ok')}
        </div>
        ${canUpload
          ? `
            <form id="taskAttachmentForm" class="form-stack">
              <input type="file" name="attachment" accept=".xlsx,.xls,.csv" required>
              <div class="inline-hint">Разрешены: .xlsx, .xls, .csv · до ${maxMb} MB.</div>
              <button class="btn" type="submit">Загрузить файл</button>
              <div class="muted small" data-task-attachment-status></div>
            </form>
          `
          : `
            <div class="quick-note warn">Загрузка доступна только для задач общего контура.</div>
          `}
        <div class="compact-history" style="margin-top:12px">${listHtml}</div>
      </div>
    `;
  }

  function patchedMapTaskStatus(status) {
    const raw = String(status || '').trim().toLowerCase();
    if (['open', 'new'].includes(raw)) return 'new';
    if (['in_progress', 'in progress', 'progress', 'doing', 'work', 'в работе'].includes(raw)) return 'in_progress';
    if (['waiting_team', 'waiting-team', 'wait_team'].includes(raw)) return 'waiting_team';
    if (['waiting_rop', 'rop_approval', 'waiting_approval', 'approval_rop', 'on_rop_approval'].includes(raw)) return 'waiting_rop';
    if (['blocked', 'waiting_decision', 'wait_decision', 'decision', 'waiting', 'waiting_executive', 'executive_approval', 'manager_approval', 'leader_approval', 'ждёт', 'ждет'].includes(raw)) return 'waiting_decision';
    if (['done', 'complete', 'completed', 'сделано'].includes(raw)) return 'done';
    if (['cancelled', 'canceled', 'отменено'].includes(raw)) return 'cancelled';
    return 'new';
  }

  function patchedIsTaskActive(task) {
    return ['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision'].includes(task?.status);
  }

  function patchedIsTaskOverdue(task) {
    return Boolean(task?.due) && patchedIsTaskActive(task) && task.due < todayIso();
  }

  function patchedTaskStatusBadge(task) {
    const meta = patchedIsTaskOverdue(task)
      ? { label: 'Просрочено', kind: 'danger' }
      : statusMeta(task?.status);
    return badge(meta.label, meta.kind);
  }

  function patchedTaskPlatformBadge(task) {
    const meta = workstreamMeta(controlWorkstreamKeySimple(task, getSku(task.articleKey)));
    return badge(meta.chip, meta.kind);
  }

  function patchedGetControlSnapshot() {
    const tasks = typeof getAllTasks === 'function' ? getAllTasks() : [];
    const active = tasks.filter(patchedIsTaskActive);
    const overdue = active.filter(patchedIsTaskOverdue);
    const waitingRop = active.filter((task) => task.status === 'waiting_rop');
    const waitingDecision = active.filter((task) => task.status === 'waiting_decision');
    const noOwner = active.filter((task) => !task.owner);
    const dueThisWeek = active.filter((task) => task.due && task.due <= plusDays(7));
    const ownerMap = new Map();

    for (const task of active) {
      const key = task.owner || 'Без owner';
      const row = ownerMap.get(key) || {
        owner: key,
        total: 0,
        overdue: 0,
        critical: 0,
        waiting: 0,
        waitingRop: 0,
        waitingDecision: 0
      };
      row.total += 1;
      if (patchedIsTaskOverdue(task)) row.overdue += 1;
      if (task.priority === 'critical') row.critical += 1;
      if (task.status === 'waiting_rop') row.waitingRop += 1;
      if (task.status === 'waiting_decision') row.waitingDecision += 1;
      row.waiting = row.waitingRop + row.waitingDecision;
      ownerMap.set(key, row);
    }

    return {
      tasks,
      active: typeof sortTasks === 'function' ? sortTasks(active) : active,
      overdue,
      waitingRop,
      waitingDecision,
      noOwner,
      dueThisWeek,
      byOwner: [...ownerMap.values()].sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner, 'ru')),
      todayList: (typeof sortTasks === 'function' ? sortTasks(active) : active)
        .filter((task) => (
          patchedIsTaskOverdue(task)
          || task.status === 'waiting_rop'
          || task.status === 'waiting_decision'
          || task.priority === 'critical'
          || (task.due && task.due <= plusDays(2))
        ))
        .slice(0, 12),
      autoCount: tasks.filter((task) => task.source === 'auto' && patchedIsTaskActive(task)).length,
      manualCount: tasks.filter((task) => task.source !== 'auto' && patchedIsTaskActive(task)).length
    };
  }

  async function submitTaskForRopApproval(taskId, report) {
    const task = await updateTaskRecord(taskId, { status: 'waiting_rop' });
    if (!task) return null;
    await createTaskHistoryEntry(taskId, 'report', `Исполнитель сдал результат и передал задачу РОПу на согласование: ${report}`);
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
        ? `РОП согласовал результат и передал задачу руководителю: ${note}`
        : 'РОП согласовал результат и передал задачу руководителю на финальное закрытие.'
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
      note ? `РОП вернул задачу в работу: ${note}` : 'РОП вернул задачу в работу.'
    );
    return task;
  }

  async function finalCloseTaskWithReport(taskId, report) {
    const task = await updateTaskRecord(taskId, { status: 'done' });
    if (!task) return null;
    await createTaskHistoryEntry(taskId, 'report', `Руководитель финально закрыл задачу: ${report}`);
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
              <p class="small muted">РОП либо передаёт задачу руководителю, либо одним комментарием возвращает её в работу.</p>
            </div>
            ${badge('шаг 2 из 3', 'warn')}
          </div>
          <div class="quick-note warn">Оставили только два действия: согласовать и передать дальше или вернуть с короткой причиной.</div>
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
              <p class="small muted">РОП уже согласовал результат. Здесь остаётся только финальный итог и закрытие.</p>
            </div>
            ${badge('шаг 3 из 3', 'danger')}
          </div>
          <div class="quick-note ok">Финальная форма сведена к одному полю: что приняли и почему считаем задачу закрытой.</div>
          <form id="taskFinalCloseForm" class="form-stack" style="margin-top:12px">
            <textarea name="report" rows="4" placeholder="Финальный итог по задаче" required></textarea>
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
            <h3>Сдать результат РОПу</h3>
            <p class="small muted">Исполнитель коротко фиксирует результат, и задача сразу переходит РОПу на согласование.</p>
          </div>
          ${badge('шаг 1 из 3', 'info')}
        </div>
        <div class="quick-note">Оставили только отчёт по факту выполнения. Детали и переписка живут в ленте апдейтов ниже.</div>
        <form id="taskSubmitToRopForm" class="form-stack" style="margin-top:12px">
          <textarea name="report" rows="4" placeholder="Что сделано и какой результат получен" required></textarea>
          <button class="btn primary" type="submit">Отправить РОПу</button>
        </form>
      </div>
    `;
  }

  function renderTaskQuickEditCard(task, owners) {
    return `
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Быстрая правка</h3>
            <p class="small muted">Снаружи оставили только главное: заголовок, owner, срок и ближайший шаг.</p>
          </div>
          ${task.articleKey ? (typeof taskEntityLine === 'function' ? taskEntityLine(task, getSku(task.articleKey)) : badge(task.articleKey, 'info')) : badge('Общая задача', 'info')}
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
              <select name="status">${Object.entries(SIMPLE_STATUS_META).map(([value, meta]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
              <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${task.priority === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
              <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}" ${task.type === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
              <select name="platform">
                <option value="cross" ${normalizeTaskPlatformSimple(task.platform) === 'cross' ? 'selected' : ''}>Общий контур</option>
                <option value="wb" ${normalizeTaskPlatformSimple(task.platform) === 'wb' ? 'selected' : ''}>РОП WB</option>
                <option value="ozon" ${normalizeTaskPlatformSimple(task.platform) === 'ozon' ? 'selected' : ''}>РОП Ozon</option>
                <option value="retail" ${normalizeTaskPlatformSimple(task.platform) === 'retail' ? 'selected' : ''}>ЯМ / сети</option>
                <option value="product" ${normalizeTaskPlatformSimple(task.platform) === 'product' ? 'selected' : ''}>Продукт / новинки</option>
                <option value="executive" ${normalizeTaskPlatformSimple(task.platform) === 'executive' ? 'selected' : ''}>Руководитель / директор</option>
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
      ? history.map((item) => `
          <div class="comment-item">
            <div class="head">
              <strong>${escapeHtml(item.author || 'Команда')}</strong>
              <div class="badge-stack">${badge(taskLogMeta(item.kind).label, taskLogMeta(item.kind).tone)}${badge(item.team || 'Команда')}</div>
            </div>
            <div class="muted small">${fmt.date(item.createdAt)}</div>
            <p>${escapeHtmlMultiline(item.text || '—')}</p>
          </div>
        `).join('')
      : `<div class="comment-item"><div class="head"><strong>Портал</strong>${badge('Создана', 'info')}</div><div class="muted small">${fmt.date(task.createdAt)}</div><p>Пока нет апдейтов. Первая короткая запись появится здесь.</p></div>`;
    return `
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Апдейты и история</h3>
            <p class="small muted">Один короткий апдейт = одна ясная точка синхрона для команды.</p>
          </div>
          ${badge(`${fmt.int(history.length)} записей`, history.length ? 'info' : 'ok')}
        </div>
        <div class="quick-note ok">Пишем кратко: что сделали, что мешает и что нужно от других.</div>
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
    const defaultEntity = fixedPlatform ? workstreamMeta(selectedWorkstream).label : '';
    return `
      <div class="card" data-control-simple-form-card>
        <div class="section-subhead">
          <div>
            <h3>Быстро поставить задачу</h3>
            <p class="small muted">Минимум для старта: что сделать, кто ведёт, срок и первый шаг. Всё остальное дотянем уже в карточке.</p>
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
          <textarea name="articleKeys" rows="4" placeholder="Артикулы для массовой постановки (по одному на строку)&#10;Пример:&#10;curly_method_300ml&#10;retinait_krem_05_50ml"></textarea>
          <div class="inline-hint">Если заполнить артикулы, портал создаст отдельную задачу на каждый SKU без склейки.</div>
          ${fixedPlatform
            ? `<input type="hidden" name="platform" value="${escapeHtml(defaultPlatform)}"><div class="inline-hint">Контур задачи: ${escapeHtml(workstreamMeta(selectedWorkstream).label)}</div>`
            : `
              <select name="platform">
                <option value="cross" ${defaultPlatform === 'cross' ? 'selected' : ''}>Общий контур</option>
                <option value="wb">РОП WB</option>
                <option value="ozon">РОП Ozon</option>
                <option value="retail">ЯМ / сети</option>
                <option value="product">Продукт / новинки</option>
                <option value="executive">Руководитель / директор</option>
              </select>
            `}
          <textarea name="nextAction" rows="3" placeholder="Какой первый шаг делаем сразу" required></textarea>
          <details class="compact-details">
            <summary>Дополнительно: контекст и приоритет</summary>
            <div class="form-grid compact" style="margin-top:10px">
              <input name="entityLabel" placeholder="Проект / тема / блок" value="${escapeHtml(defaultEntity)}">
              <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${value === 'high' ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
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
    const tasks = typeof filteredControlTasks === 'function' ? filteredControlTasks() : (typeof getAllTasks === 'function' ? getAllTasks() : []);
    const owners = ownerOptions();
    const approvalCount = tasks.filter((task) => ['waiting_rop', 'waiting_decision'].includes(task.status)).length;
    const selectedWorkstream = SIMPLE_WORKSTREAM_META[state?.controlFilters?.platform] ? state.controlFilters.platform : 'all';
    const firstTwoCol = root.querySelector('.two-col');
    const cards = firstTwoCol ? Array.from(firstTwoCol.children).filter((node) => node.classList?.contains('card')) : [];

    if (cards[0]) {
      cards[0].outerHTML = renderCompactGeneralTaskCard(selectedWorkstream, owners, approvalCount);
    }

    const generalTaskForm = root.querySelector('#generalTaskForm');
    if (generalTaskForm && !generalTaskForm.dataset.simpleBound) {
      generalTaskForm.dataset.simpleBound = 'true';
      generalTaskForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const articleKeys = parseTaskArticleKeysInput(form.get('articleKeys'));
        const basePayload = {
          entityLabel: form.get('entityLabel'),
          title: form.get('title'),
          type: form.get('type') || 'general',
          priority: form.get('priority') || 'high',
          platform: form.get('platform') || (selectedWorkstream !== 'all' ? selectedWorkstream : 'cross'),
          owner: form.get('owner'),
          due: form.get('due'),
          nextAction: normalizeMultilineTaskText(form.get('nextAction')),
          reason: normalizeMultilineTaskText(form.get('reason'))
        };

        if (!articleKeys.length) {
          const task = await createManualTask({
            articleKey: '',
            ...basePayload
          });
          patchedRenderControlCenter();
          if (task?.id) patchedRenderTaskModal(task.id);
          return;
        }

        const createdTasks = [];
        for (const articleKey of articleKeys) {
          const sku = typeof getSku === 'function' ? getSku(articleKey) : null;
          const task = await createManualTask({
            articleKey,
            ...basePayload,
            entityLabel: basePayload.entityLabel || sku?.name || articleKey,
            owner: String(basePayload.owner || ownerName(sku) || '').trim(),
            skipRerender: true
          });
          if (task?.id) createdTasks.push(task);
        }
        patchedRenderControlCenter();
        if (createdTasks.length) patchedRenderTaskModal(createdTasks[0].id);
      });
    }

    const platformSelect = root.querySelector('#controlPlatformFilter');
    if (platformSelect && !platformSelect.querySelector('option[value="cross"]')) {
      platformSelect.insertAdjacentHTML('beforeend', `
        <option value="retail" ${state.controlFilters.platform === 'retail' ? 'selected' : ''}>ЯМ / сети</option>
        <option value="cross" ${state.controlFilters.platform === 'cross' ? 'selected' : ''}>Общий контур</option>
      `);
    }
  }

  function bindTaskModalHandlers(taskId, body) {
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
      patchedRenderTaskModal(taskId);
    });

    body.querySelector('#taskCommentForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await createTaskHistoryEntry(taskId, 'comment', String(form.get('text') || '').trim(), {
        team: typeof teamMemberLabel === 'function' ? teamMemberLabel() : 'Команда'
      });
      patchedRenderTaskModal(taskId);
    });

    body.querySelector('#taskSubmitToRopForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const report = String(form.get('report') || '').trim();
      if (!report) return;
      await submitTaskForRopApproval(taskId, report);
      patchedRenderTaskModal(taskId);
    });

    body.querySelector('#taskRopApproveForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await approveTaskByRop(taskId, String(form.get('comment') || '').trim());
      patchedRenderTaskModal(taskId);
    });

    body.querySelector('[data-task-return-to-work]')?.addEventListener('click', async () => {
      const comment = String(body.querySelector('#taskRopApproveForm textarea[name="comment"]')?.value || '').trim();
      await returnTaskToWork(taskId, comment);
      patchedRenderTaskModal(taskId);
    });

    body.querySelector('#taskFinalCloseForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const report = String(form.get('report') || '').trim();
      if (!report) return;
      await finalCloseTaskWithReport(taskId, report);
      patchedRenderTaskModal(taskId);
    });

    body.querySelector('#taskAttachmentForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const statusNode = body.querySelector('[data-task-attachment-status]');
      const input = form.querySelector('input[name="attachment"]');
      const file = input?.files?.[0] || null;
      if (!file) {
        if (statusNode) statusNode.textContent = 'Выберите файл перед загрузкой.';
        return;
      }
      try {
        if (statusNode) statusNode.textContent = 'Загружаем файл…';
        const attachment = await uploadTaskAttachment(taskId, file);
        if (typeof createTaskHistoryEntry === 'function') {
          await createTaskHistoryEntry(taskId, 'comment', `Добавлен файл: ${attachment.fileName}`, {
            team: typeof teamMemberLabel === 'function' ? teamMemberLabel() : 'Команда'
          });
        }
        patchedRenderTaskModal(taskId);
      } catch (error) {
        console.error(error);
        if (statusNode) statusNode.textContent = error?.message || 'Не удалось загрузить файл.';
      }
    });

    body.querySelectorAll('[data-task-attachment-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const attachmentId = String(button.getAttribute('data-task-attachment-delete') || '').trim();
        if (!attachmentId) return;
        try {
          await deleteTaskAttachment(attachmentId);
          if (typeof createTaskHistoryEntry === 'function') {
            await createTaskHistoryEntry(taskId, 'comment', 'Удалено вложение из задачи.', {
              team: typeof teamMemberLabel === 'function' ? teamMemberLabel() : 'Команда'
            });
          }
          patchedRenderTaskModal(taskId);
        } catch (error) {
          console.error(error);
        }
      });
    });
  }

  function patchedRenderTaskModal(taskId) {
    if (!renderTaskModalBase) return;
    renderTaskModalBase(taskId);
    const task = getTaskLocal(taskId);
    const body = document.getElementById('taskModalBody');
    if (!task || !body) return;

    const owners = ownerOptions();
    const history = getTaskHistoryLocal(taskId);

    const lifecycleCard = body.querySelector('#taskCloseForm')?.closest('.card');
    if (lifecycleCard) {
      const lifecycleHtml = renderTaskLifecyclePanel(task);
      if (lifecycleHtml) lifecycleCard.outerHTML = lifecycleHtml;
      else lifecycleCard.remove();
    }

    const contentColumns = body.querySelector('.two-col');
    const modalCards = contentColumns ? Array.from(contentColumns.children).filter((node) => node.classList?.contains('card')) : [];
    if (modalCards[0]) modalCards[0].outerHTML = renderTaskQuickEditCard(task, owners);
    if (modalCards[1]) modalCards[1].outerHTML = renderTaskUpdatesCard(task, history);
    body.querySelector('[data-task-attachments-card]')?.remove();
    const attachments = taskAttachmentList(taskId);
    const attachmentsCardHtml = renderTaskAttachmentsCard(task, attachments);
    if (contentColumns) {
      contentColumns.insertAdjacentHTML('afterend', attachmentsCardHtml);
    } else {
      body.insertAdjacentHTML('beforeend', attachmentsCardHtml);
    }

    bindTaskModalHandlers(taskId, body);
  }

  function patchedRenderControlCenter() {
    if (renderControlCenterBase) renderControlCenterBase();
    const root = document.getElementById('view-control');
    if (!root) return;
    renderGeneralTaskEnhancements(root);
  }

  window.parseTaskLogComment = parseTaskLogCommentLocal;
  window.getTaskHistory = getTaskHistoryLocal;
  window.getRecentTaskHistory = getRecentTaskHistoryLocal;
  window.mapTaskStatus = patchedMapTaskStatus;
  window.isTaskActive = patchedIsTaskActive;
  window.isTaskOverdue = patchedIsTaskOverdue;
  window.taskStatusBadge = patchedTaskStatusBadge;
  window.taskPlatformBadge = patchedTaskPlatformBadge;
  window.getControlSnapshot = patchedGetControlSnapshot;
  window.submitTaskForRopApproval = submitTaskForRopApproval;
  window.approveTaskByRop = approveTaskByRop;
  window.returnTaskToWork = returnTaskToWork;
  window.closeTaskWithReport = finalCloseTaskWithReport;
  window.renderTaskModal = patchedRenderTaskModal;
  window.openTaskModal = patchedRenderTaskModal;
  window.renderControlCenter = patchedRenderControlCenter;

  if (getSkuCommentsBase) {
    window.getSkuComments = function patchedGetSkuComments(articleKey) {
      return (getSkuCommentsBase(articleKey) || []).filter((comment) => !parseTaskLogCommentLocal(comment));
    };
  }

  try { parseTaskLogComment = parseTaskLogCommentLocal; } catch {}
  try { getTaskHistory = getTaskHistoryLocal; } catch {}
  try { getRecentTaskHistory = getRecentTaskHistoryLocal; } catch {}
  try { mapTaskStatus = patchedMapTaskStatus; } catch {}
  try { isTaskActive = patchedIsTaskActive; } catch {}
  try { isTaskOverdue = patchedIsTaskOverdue; } catch {}
  try { taskStatusBadge = patchedTaskStatusBadge; } catch {}
  try { taskPlatformBadge = patchedTaskPlatformBadge; } catch {}
  try { getControlSnapshot = patchedGetControlSnapshot; } catch {}
  try { renderTaskModal = patchedRenderTaskModal; } catch {}
  try { openTaskModal = patchedRenderTaskModal; } catch {}
  try { renderControlCenter = patchedRenderControlCenter; } catch {}
  try { getSkuComments = window.getSkuComments; } catch {}

  if (state?.activeView === 'control') patchedRenderControlCenter();
  if (state?.activeView === 'executive' && typeof renderExecutive === 'function') renderExecutive();
})();
