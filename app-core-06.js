function taskAttachmentSizeLabel(size = 0) {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${Math.round(bytes)} Б`;
}

function renderTaskAttachmentItem(item = {}) {
  const attachment = normalizeTaskAttachment(item);
  const sizeLabel = taskAttachmentSizeLabel(attachment.size);
  const meta = [
    attachment.createdBy || '',
    attachment.createdAt ? fmt.date(attachment.createdAt) : '',
    sizeLabel
  ].filter(Boolean).join(' · ');
  const openControl = attachment.publicUrl
    ? `<a class="btn ghost small-btn" href="${escapeHtml(attachment.publicUrl)}" target="_blank" rel="noopener">Открыть</a>`
    : `<button class="btn ghost small-btn" type="button" disabled>Нет ссылки</button>`;
  return `
    <div class="comment-item task-attachment-item">
      <div class="head">
        <div>
          <strong>${escapeHtml(attachment.fileName || 'Файл')}</strong>
          <div class="muted small">${escapeHtml(meta || 'Вложение к задаче')}</div>
        </div>
        <div class="badge-stack">
          ${openControl}
          <button class="btn ghost small-btn" type="button" data-delete-task-attachment="${escapeHtml(attachment.id)}">Удалить</button>
        </div>
      </div>
    </div>
  `;
}

function renderTaskAttachmentsBlock(taskId) {
  const attachments = typeof getTaskAttachments === 'function' ? getTaskAttachments(taskId) : [];
  const accept = '.xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return `
    <div class="task-attachments-block" style="margin:12px 0">
      <div class="modal-section-title">
        <div>
          <h3>Файлы к задаче</h3>
          <p class="small muted">Scorecard, выгрузка, расчет или другой артефакт, на который можно сослаться в отчете.</p>
        </div>
        ${badge(`${fmt.int(attachments.length)} файлов`, attachments.length ? 'info' : 'ok')}
      </div>
      <div class="list">${attachments.length ? attachments.map(renderTaskAttachmentItem).join('') : '<div class="empty">Файлов пока нет. Добавь XLSX, XLS или CSV прямо здесь.</div>'}</div>
      <form id="taskAttachmentForm" class="form-grid compact" style="margin-top:12px">
        <input id="taskAttachmentInput" name="file" type="file" accept="${accept}" required>
        <button class="btn" type="submit">Прикрепить файл</button>
        <div class="muted small">Разрешены XLSX, XLS, CSV до 20 МБ. Файл привяжется именно к этой задаче.</div>
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
        <div class="note-box">${escapeHtmlMultiline(task.nextAction || 'Нужно описать следующий шаг')}</div>
        <div class="muted small" style="margin-top:10px">${escapeHtmlMultiline(task.reason || 'Причина / контекст пока не заполнены')}</div>
      </div>
      <div class="card subtle">
        <h3>Как закрывать</h3>
        <div class="note-box">Маркетолог закрывает задачу не просто сменой статуса, а коротким отчётом: что сделал, какой результат получил и где лежит артефакт / ссылка.</div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="modal-section-title">
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
            <option value="cross" ${task.platform === 'cross' ? 'selected' : ''}>Общий контур</option>
            <option value="wb" ${task.platform === 'wb' ? 'selected' : ''}>РОП WB</option>
            <option value="ozon" ${task.platform === 'ozon' ? 'selected' : ''}>РОП Ozon</option>
            <option value="ya" ${task.platform === 'ya' ? 'selected' : ''}>Я.Маркет</option>
            <option value="goldapple" ${task.platform === 'goldapple' ? 'selected' : ''}>Золотое яблоко</option>
            <option value="letu" ${task.platform === 'letu' ? 'selected' : ''}>Л'Этуаль</option>
            <option value="megamarket" ${task.platform === 'megamarket' ? 'selected' : ''}>Мегамаркет</option>
            <option value="samokat" ${task.platform === 'samokat' ? 'selected' : ''}>Самокат</option>
            <option value="magnit" ${task.platform === 'magnit' ? 'selected' : ''}>Магнит Маркет</option>
            <option value="wb+ozon" ${task.platform === 'wb+ozon' ? 'selected' : ''}>WB + Ozon</option>
          </select>
          <textarea name="nextAction" rows="4" placeholder="Следующее действие">${escapeHtml(task.nextAction || '')}</textarea>
          <textarea name="reason" rows="4" placeholder="Контекст / почему задача возникла">${escapeHtml(task.reason || '')}</textarea>
          <button class="btn primary" type="submit">Сохранить изменения</button>
        </form>
      </div>

      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Комментарии и история</h3>
            <p class="small muted">Видно все апдейты по задаче: изменения, обсуждение и отчёты по закрытию.</p>
          </div>
          ${badge(`${fmt.int(history.length)} записей`, history.length ? 'info' : 'ok')}
        </div>
        ${renderTaskAttachmentsBlock(taskId)}
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
            <p class="small muted">Когда маркетолог завершил работу, здесь фиксируется результат. Без отчёта задача не считается закрытой по смыслу.</p>
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

  body.querySelector('#taskAttachmentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = body.querySelector('#taskAttachmentInput');
    const file = input?.files?.[0] || null;
    if (!file) return;
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Загружаем...';
    }
    try {
      const attachment = await uploadTaskAttachment(taskId, file);
      if (typeof createTaskHistoryEntry === 'function') {
        await createTaskHistoryEntry(taskId, 'comment', `Прикреплен файл: ${attachment.fileName}`, {
          author: state.team.member.name || task.owner || 'Команда',
          team: teamMemberLabel()
        });
      }
      renderTaskModal(taskId);
    } catch (error) {
      window.alert(error?.message || 'Не удалось прикрепить файл.');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Прикрепить файл';
      }
    }
  });

  body.querySelectorAll('[data-delete-task-attachment]').forEach((button) => {
    button.addEventListener('click', async () => {
      const attachmentId = button.getAttribute('data-delete-task-attachment');
      if (!attachmentId) return;
      if (!window.confirm('Удалить файл из задачи?')) return;
      button.disabled = true;
      try {
        await deleteTaskAttachment(attachmentId);
        renderTaskModal(taskId);
      } catch (error) {
        window.alert(error?.message || 'Не удалось удалить файл.');
        button.disabled = false;
      }
    });
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

const REGISTRY_MARKET_TABS = [
  { key: 'all', label: 'Все площадки' },
  { key: 'wb', label: 'WB' },
  { key: 'ozon', label: 'Ozon' },
  { key: 'ya', label: 'Я.Маркет' },
  { key: 'goldapple', label: 'ЗЯ' },
  { key: 'letu', label: 'Лэтуаль' },
  { key: 'megamarket', label: 'Мегамаркет' },
  { key: 'samokat', label: 'Самокат' },
  { key: 'magnit', label: 'Магнит Маркет' }
];
const REGISTRY_MARKET_SUPPORT_KEYS = {
  wb: 'wb',
  ozon: 'ozon',
  ya: 'ym',
  goldapple: 'ga',
  letu: 'letu',
  megamarket: 'megamarket',
  samokat: 'samokat',
  magnit: 'mm'
};

function registryOwnerByMarket(sku, market = '') {
  const supportKey = REGISTRY_MARKET_SUPPORT_KEYS[String(market || '').toLowerCase()] || '';
  if (!supportKey) return '';
  return String(
    sku?.ownersByPlatform?.[supportKey]
    || sku?.owner?.byPlatform?.[supportKey]
    || ''
  ).trim();
}

function registryDisplayOwner(sku, market = state.filters.market) {
  const normalizedMarket = String(market || 'all').toLowerCase();
  if (REGISTRY_MARKET_SUPPORT_KEYS[normalizedMarket]) {
    return canonicalOwnerName(registryOwnerByMarket(sku, normalizedMarket) || '');
  }
  const selectedOwner = canonicalOwnerName(state.filters.owner || '');
  if (selectedOwner && selectedOwner !== 'all' && registryOwnerMatches(sku, selectedOwner, 'all')) {
    return selectedOwner;
  }
  return ownerName(sku);
}

function registryOwnersForFilter(sku, market = state.filters.market) {
  const normalizedMarket = String(market || 'all').toLowerCase();
  const owners = [];
  const addOwner = (value) => {
    const owner = canonicalOwnerName(value || '');
    if (owner && !owners.includes(owner)) owners.push(owner);
  };
  if (REGISTRY_MARKET_SUPPORT_KEYS[normalizedMarket]) {
    addOwner(registryOwnerByMarket(sku, normalizedMarket));
    return owners;
  }
  addOwner(ownerName(sku));
  Object.values(sku?.ownersByPlatform || {}).forEach(addOwner);
  Object.values(sku?.owner?.byPlatform || {}).forEach(addOwner);
  return owners;
}

function registryOwnerMatches(sku, owner, market = state.filters.market) {
  const selectedOwner = canonicalOwnerName(owner || '');
  if (!selectedOwner || selectedOwner === 'all') return true;
  return registryOwnersForFilter(sku, market).includes(selectedOwner);
}

function registryHasOwner(sku) {
  return registryOwnersForFilter(sku).length > 0;
}

function registryOwnerCell(sku) {
  const owner = registryDisplayOwner(sku);
  if (!owner) return `<div class="owner-cell"><strong>Не закреплён</strong><div class="muted small">Нужно назначить owner</div></div>`;
  return `<div class="owner-cell"><strong>${escapeHtml(owner)}</strong><div class="muted small">${escapeHtml(skuOperationalStatusMeta(sku).label || '—')}</div></div>`;
}

function filterSkuByMarket(sku) {
  const market = String(state.filters.market || 'all').toLowerCase();
  if (market === 'wb') return Boolean(sku?.flags?.hasWB || registryOwnerByMarket(sku, market));
  if (market === 'ozon') return Boolean(sku?.flags?.hasOzon || registryOwnerByMarket(sku, market));
  if (REGISTRY_MARKET_SUPPORT_KEYS[market]) return Boolean(registryOwnerByMarket(sku, market));
  return true;
}

function filterSkuByWorkLogic(sku) {
  const market = String(state.filters.market || 'all').toLowerCase();
  if (market === 'wb') return sku?.flags?.toWorkWB;
  if (market === 'ozon') return sku?.flags?.toWorkOzon;
  return sku?.flags?.toWork || Boolean(registryOwnerByMarket(sku, market));
}

function buildSkuRegistryTaskMap() {
  const taskMap = new Map();
  getAllTasks().forEach((task) => {
    const articleKey = String(task?.articleKey || '').trim();
    if (!articleKey || taskMap.has(articleKey)) return;
    taskMap.set(articleKey, task);
  });
  return taskMap;
}

function skuLifecycleMetaForRegistry(sku) {
  return sku?.productLifecycle || (typeof productLifecycleForSku === 'function'
    ? productLifecycleForSku(sku, sku?.articleKey || sku?.article || '')
    : { key: 'active', label: sku?.status || 'Актуальный', tone: 'ok' });
}

function getFilteredSkus(taskMap = null) {
  const nextTaskMap = taskMap instanceof Map ? taskMap : buildSkuRegistryTaskMap();
  state.filters.lifecycle = state.filters.lifecycle || 'all';
  const q = String(state.filters.search || '').trim().toLowerCase();
  return state.skus.filter((sku) => {
    if (!filterSkuByMarket(sku)) return false;
    const matrixProblemState = typeof skuMatrixProblemState === 'function' ? skuMatrixProblemState(sku) : 'ok';
    const matrixProblemMeta = typeof skuMatrixProblemMeta === 'function' ? skuMatrixProblemMeta(matrixProblemState) : null;
    const lifecycle = skuLifecycleMetaForRegistry(sku);
    const hay = [
      sku.article,
      sku.articleKey,
      sku.name,
      sku.brand,
      sku.category,
      sku.segment,
      registryDisplayOwner(sku),
      ownerName(sku),
      ...Object.values(sku?.ownersByPlatform || {}),
      ...Object.values(sku?.owner?.byPlatform || {}),
      sku.status,
      lifecycle?.label,
      lifecycle?.reason,
      sku.focusReasons,
      matrixProblemMeta?.label
    ].filter(Boolean).join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (state.filters.owner !== 'all' && !registryOwnerMatches(sku, state.filters.owner)) return false;
    if (state.filters.segment !== 'all' && sku.segment !== state.filters.segment) return false;
    if (state.filters.lifecycle !== 'all' && (lifecycle?.key || 'active') !== state.filters.lifecycle) return false;
    if (state.filters.assignment === 'assigned' && !registryHasOwner(sku)) return false;
    if (state.filters.assignment === 'unassigned' && registryHasOwner(sku)) return false;
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
        return !registryHasOwner(sku);
      case 'matrixIssue':
        return matrixProblemState && matrixProblemState !== 'ok';
      default:
        return true;
    }
  }).sort((a, b) => {
    const aTask = nextTaskMap.get(String(a.articleKey || '').trim()) || null;
    const bTask = nextTaskMap.get(String(b.articleKey || '').trim()) || null;
    return Number(filterSkuByWorkLogic(b)) - Number(filterSkuByWorkLogic(a))
      || Number((b.focusScore || 0)) - Number((a.focusScore || 0))
      || Number(isTaskOverdue(bTask)) - Number(isTaskOverdue(aTask))
      || String(a.article || '').localeCompare(String(b.article || ''), 'ru');
  });
}

function skuRegistryMarketLabel(activeMarket = 'all') {
  if (typeof skuDataPlatformLabel === 'function') return skuDataPlatformLabel(activeMarket);
  const tab = REGISTRY_MARKET_TABS.find((item) => item.key === activeMarket);
  return tab?.label || 'Все площадки';
}

function skuRegistryOwnerCount(sku, activeMarket = state.filters.market) {
  return registryOwnersForFilter(sku, activeMarket).length;
}

function skuRegistryReasonList(sku, task = null, activeMarket = state.filters.market) {
  const reasons = [];
  const matrixProblemState = typeof skuMatrixProblemState === 'function' ? skuMatrixProblemState(sku) : 'ok';
  const matrixProblemMeta = typeof skuMatrixProblemMeta === 'function' ? skuMatrixProblemMeta(matrixProblemState) : null;
  if (!skuRegistryOwnerCount(sku, activeMarket)) reasons.push({ label: 'нет owner', tone: 'danger', focus: 'unassigned', weight: 60 });
  if (matrixProblemState && matrixProblemState !== 'ok') reasons.push({ label: matrixProblemMeta?.label || 'матрица', tone: matrixProblemMeta?.tone || 'warn', focus: 'matrixIssue', weight: 55 });
  if (task && isTaskOverdue(task)) reasons.push({ label: 'дедлайн горит', tone: 'danger', focus: 'toWork', weight: 45 });
  if (sku?.flags?.underPlan) reasons.push({ label: 'ниже плана', tone: 'warn', focus: 'underPlan', weight: 40 });
  if (sku?.flags?.lowStock) reasons.push({ label: 'низкий остаток', tone: 'danger', focus: 'lowStock', weight: 38 });
  if (sku?.flags?.negativeMargin) reasons.push({ label: 'минус маржа', tone: 'danger', focus: 'negativeMargin', weight: 36 });
  if (sku?.flags?.highReturn) reasons.push({ label: 'возвраты', tone: 'warn', focus: 'highReturn', weight: 24 });
  if (sku?.flags?.hasExternalTraffic) reasons.push({ label: 'внешний трафик', tone: 'info', focus: 'extAny', weight: 18 });
  if (filterSkuByWorkLogic(sku)) reasons.push({ label: currentWorkLabel(), tone: 'info', focus: 'toWork', weight: 16 });
  return reasons;
}

function skuRegistryAttentionScore(sku, task = null, activeMarket = state.filters.market) {
  return skuRegistryReasonList(sku, task, activeMarket).reduce((sum, item) => sum + numberOrZero(item.weight), 0)
    + numberOrZero(sku?.focusScore || 0);
}

function skuRegistryFocusPillHtml(reason) {
  return `<span class="chip ${escapeHtml(reason.tone || '')}">${escapeHtml(reason.label || '')}</span>`;
}

function skuJourneyOpenView(view, options = {}) {
  if (typeof setView === 'function') setView(view, options);
  else document.querySelector(`.nav-btn[data-view="${escapeHtml(view)}"]`)?.click();
}

function skuJourneyApplyRegistryFocus(focus = 'all', search = '') {
  state.skuWorkspaceMode = 'registry';
  state.filters.focus = focus || 'all';
  state.filters.assignment = 'all';
  state.filters.traffic = 'all';
  if (search !== undefined && search !== null) state.filters.search = String(search || '');
  if (state.filters.focus === 'unassigned') state.filters.assignment = 'unassigned';
  if (state.filters.focus === 'extAny') state.filters.traffic = 'any';
  skuJourneyOpenView('sku-contour', { preserveSkuWorkspaceMode: true });
  if (state.activeView === 'sku-contour' && typeof renderSkuRegistry === 'function') renderSkuRegistry('view-sku-contour');
}

function skuJourneyHandleAction(action = '', options = {}) {
  const key = String(action || '').trim();
  if (key === 'open-contour') {
    state.skuWorkspaceMode = 'contour';
    state.skuContourOnlyNew = true;
    skuJourneyOpenView('sku-contour');
    if (state.activeView === 'sku-contour' && typeof renderSkuContour === 'function') renderSkuContour(options.rootId || 'view-sku-contour');
    return;
  }
  if (key === 'open-registry') {
    skuJourneyApplyRegistryFocus('all', options.search || '');
    return;
  }
  if (key === 'registry-unassigned') {
    skuJourneyApplyRegistryFocus('unassigned', options.search || '');
    return;
  }
  if (key === 'registry-matrix') {
    skuJourneyApplyRegistryFocus('matrixIssue', options.search || '');
    return;
  }
  if (key === 'registry-low-stock') {
    skuJourneyApplyRegistryFocus('lowStock', options.search || '');
    return;
  }
  if (key === 'registry-under-plan') {
    skuJourneyApplyRegistryFocus('underPlan', options.search || '');
    return;
  }
  if (key === 'only-new-contour') {
    state.skuWorkspaceMode = 'contour';
    state.skuContourOnlyNew = true;
    if (state.activeView === 'sku-contour' && typeof renderSkuContour === 'function') renderSkuContour(options.rootId || 'view-sku-contour');
    else skuJourneyOpenView('sku-contour');
    return;
  }
  if (key === 'planfact') {
    skuJourneyOpenView('sku-plan-fact');
  }
}

function skuJourneyLevelMeta(score = 0) {
  const value = Math.max(0, Math.min(100, Math.round(numberOrZero(score))));
  if (value >= 92) return { label: 'Уровень 4', title: 'Чистый контур', tone: 'ok' };
  if (value >= 76) return { label: 'Уровень 3', title: 'Рабочий ритм', tone: 'info' };
  if (value >= 56) return { label: 'Уровень 2', title: 'Собираем систему', tone: 'warn' };
  return { label: 'Уровень 1', title: 'Разгрести базу', tone: 'danger' };
}

function skuJourneyPanelHtml({
  source = 'registry',
  activeMarket = 'all',
  ownerCoverage = null,
  contourProgress = null,
  unresolvedCount = 0,
  blockerCount = 0,
  matrixIssueCount = 0,
  workCount = 0,
  apiRiskRevenue = 0,
  journeyStats = null
} = {}) {
  const marketLabel = typeof skuDataPlatformLabel === 'function' ? skuDataPlatformLabel(activeMarket) : skuRegistryMarketLabel(activeMarket);
  const activeModeLabel = source === 'contour' ? 'API-контур' : 'Реестр SKU';
  const stats = Array.isArray(journeyStats) && journeyStats.length ? journeyStats : [
    {
      action: source === 'contour' ? 'only-new-contour' : 'open-contour',
      label: 'API без пары',
      value: fmt.int(unresolvedCount),
      tone: unresolvedCount ? 'warn' : 'ok'
    },
    {
      action: 'registry-unassigned',
      label: 'Owner coverage',
      value: ownerCoverage === null ? '—' : fmt.pct(ownerCoverage),
      tone: ownerCoverage !== null && ownerCoverage < 0.9 ? 'warn' : 'ok'
    },
    {
      action: 'registry-matrix',
      label: 'Матрица',
      value: fmt.int(matrixIssueCount),
      tone: matrixIssueCount ? 'warn' : 'ok'
    },
    {
      action: 'planfact',
      label: 'В работе',
      value: fmt.int(workCount),
      tone: workCount ? 'info' : ''
    }
  ];
  return `
    <div class="sku-workspace-panel">
      <section class="sku-workspace-title">
        <span>${escapeHtml(marketLabel)} · единый SKU workspace</span>
        <strong>${escapeHtml(activeModeLabel)}</strong>
        <em>Одна очередь: API-пары, owner, матрица и план-факт без лишней витрины.</em>
      </section>
      <section class="sku-workspace-switch">
        <button class="${source === 'registry' ? 'active' : ''}" type="button" data-sku-journey-action="open-registry">Реестр</button>
        <button class="${source === 'contour' ? 'active' : ''}" type="button" data-sku-journey-action="open-contour">API-контур</button>
        <button type="button" data-sku-journey-action="planfact">План-факт</button>
      </section>
      <section class="sku-workspace-stats">
        ${stats.map((item) => `
          <button class="${escapeHtml(item.tone || '')}" type="button" data-sku-journey-action="${escapeHtml(item.action)}">
            <b>${escapeHtml(item.value)}</b>
            <span>${escapeHtml(item.label)}</span>
          </button>
        `).join('')}
      </section>
      ${blockerCount || apiRiskRevenue ? `<section class="sku-workspace-note">${fmt.int(blockerCount)} блокеров · ${fmt.money(apiRiskRevenue || 0)} риска</section>` : ''}
    </div>
  `;
}

function skuRegistryFocusBoardHtml({ activeMarket = 'all', allMarketSkus = [], items = [], skuTaskMap = new Map(), matrixIssueCount = 0, registryIssueRows = [] } = {}) {
  const total = allMarketSkus.length;
  const assigned = allMarketSkus.filter((sku) => skuRegistryOwnerCount(sku, activeMarket)).length;
  const unassigned = Math.max(0, total - assigned);
  const ownerCoverage = total ? assigned / total : null;
  const workCount = allMarketSkus.filter((sku) => filterSkuByWorkLogic(sku)).length;
  const underPlanCount = allMarketSkus.filter((sku) => sku?.flags?.underPlan).length;
  const lowStockCount = allMarketSkus.filter((sku) => sku?.flags?.lowStock).length;
  const externalTrafficCount = allMarketSkus.filter((sku) => sku?.flags?.hasExternalTraffic).length;
  const marketIssueRows = activeMarket === 'all' || typeof skuDataIssueMatchesPlatform !== 'function'
    ? registryIssueRows
    : registryIssueRows.filter((row) => skuDataIssueMatchesPlatform(row, activeMarket));
  const marketIssueCount = marketIssueRows.length;
  const resolvedIssueCount = typeof skuContourIssueIsResolved === 'function'
    ? marketIssueRows.filter(skuContourIssueIsResolved).length
    : 0;
  const unresolvedIssueCount = Math.max(0, marketIssueRows.length - resolvedIssueCount);
  const blockerCount = marketIssueRows.filter((row) => row.status === 'blocked' || row.status === 'quarantine').length;
  const apiRiskRevenue = marketIssueRows.reduce((sum, row) => sum + numberOrZero(row.revenue || 0), 0);
  const contourProgress = marketIssueRows.length ? resolvedIssueCount / marketIssueRows.length : 1;
  const matrixIssuesBySku = allMarketSkus.filter((sku) => {
    const stateKey = typeof skuMatrixProblemState === 'function' ? skuMatrixProblemState(sku) : 'ok';
    return stateKey && stateKey !== 'ok';
  }).length;
  const queue = allMarketSkus
    .map((sku) => {
      const task = skuTaskMap.get(String(sku.articleKey || '').trim()) || null;
      const reasons = skuRegistryReasonList(sku, task, activeMarket);
      return {
        sku,
        task,
        reasons,
        score: skuRegistryAttentionScore(sku, task, activeMarket)
      };
    })
    .filter((item) => item.reasons.length)
    .sort((left, right) => right.score - left.score || String(left.sku.article || '').localeCompare(String(right.sku.article || ''), 'ru'))
    .slice(0, 6);
  const bucketItems = [
    { focus: 'unassigned', label: 'Без owner', count: unassigned, help: 'закрепить ответственного', tone: unassigned ? 'danger' : 'ok' },
    { focus: 'matrixIssue', label: 'Матрица', count: matrixIssuesBySku || matrixIssueCount, help: 'alias, ignore, дубли', tone: (matrixIssuesBySku || matrixIssueCount) ? 'warn' : 'ok' },
    { focus: 'lowStock', label: 'Остатки', count: lowStockCount, help: 'не потерять продажи', tone: lowStockCount ? 'danger' : 'ok' },
    { focus: 'underPlan', label: 'Ниже плана', count: underPlanCount, help: 'план-факт просел', tone: underPlanCount ? 'warn' : 'ok' },
    { focus: 'toWork', label: 'В работе', count: workCount, help: currentWorkLabel(), tone: workCount ? 'info' : '' },
    { focus: 'extAny', label: 'Трафик', count: externalTrafficCount, help: 'КЗ/VK и внешние хвосты', tone: externalTrafficCount ? 'info' : '' }
  ];
  return `
    ${skuJourneyPanelHtml({ source: 'registry', activeMarket, ownerCoverage, contourProgress, unresolvedCount: unresolvedIssueCount, blockerCount, matrixIssueCount: matrixIssuesBySku || matrixIssueCount, workCount, apiRiskRevenue })}
    <div class="sku-data-focus-board sku-data-focus-board--compact sku-registry-focus-board">
      <section class="sku-data-focus-panel">
        <div class="sku-data-focus-head">
          <h3>Быстрый фильтр</h3>
          <button class="quick-chip" type="button" data-sku-registry-focus="all">Сбросить</button>
        </div>
        <div class="sku-data-bucket-grid">
          ${bucketItems.map((item) => `
            <button class="sku-data-bucket ${escapeHtml(item.tone || '')} ${state.filters.focus === item.focus ? 'active' : ''}" type="button" data-sku-registry-focus="${escapeHtml(item.focus)}">
              <strong>${fmt.int(item.count)}</strong>
              <span>${escapeHtml(item.label)}</span>
              <em>${escapeHtml(item.help)}</em>
            </button>
          `).join('')}
        </div>
      </section>
      <section class="sku-data-focus-panel">
        <div class="sku-data-focus-head">
          <h3>Очередь на сегодня</h3>
          <button class="quick-chip" type="button" data-sku-registry-open-contour>Контур SKU</button>
        </div>
        <div class="sku-data-focus-list">
          ${queue.length ? queue.map((item) => `
            <button class="sku-data-focus-row" type="button" data-open-sku="${escapeHtml(item.sku.articleKey || '')}">
              <span>
                <strong>${escapeHtml(item.sku.article || item.sku.articleKey || 'SKU')}</strong>
                <em>${escapeHtml(item.sku.name || registryDisplayOwner(item.sku, activeMarket) || 'Без названия')}</em>
                <small>${item.reasons.slice(0, 3).map(skuRegistryFocusPillHtml).join('')}</small>
              </span>
              <b>${fmt.int(item.score)} XP</b>
            </button>
          `).join('') : '<div class="sku-data-focus-empty">Критичных SKU по текущей площадке не видно</div>'}
        </div>
      </section>
    </div>
  `;
}

function renderSkuRegistry(rootId = 'view-skus') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const skuTaskMap = buildSkuRegistryTaskMap();
  const skuPlanModel = typeof skuPlanFactBuildModel === 'function' ? skuPlanFactBuildModel() : {};
  state.filters.lifecycle = state.filters.lifecycle || 'all';
  const activeMarket = typeof skuDataActiveMarket === 'function'
    ? skuDataActiveMarket()
    : String(state.filters.market || 'all').toLowerCase();
  const allMarketSkus = (state.skus || []).filter((sku) => filterSkuByMarket(sku));
  const items = getFilteredSkus(skuTaskMap);
  const registryIssueRows = typeof skuContourIssueRows === 'function' ? skuContourIssueRows(skuPlanModel) : [];
  const registryPlatformBoardHtml = typeof skuDataPlatformBoardHtml === 'function'
    ? skuDataPlatformBoardHtml(skuPlanModel, { activeMarket, issueRows: registryIssueRows })
    : '';
  const registryGameCardsHtml = typeof skuDataGameCardsHtml === 'function' && typeof skuDataSharedCards === 'function'
    ? skuDataGameCardsHtml(skuDataSharedCards(skuPlanModel, activeMarket, items, registryIssueRows))
    : '';
  const owners = [...new Set(state.skus
    .filter((sku) => filterSkuByMarket(sku))
    .flatMap((sku) => registryOwnersForFilter(sku))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
  const segments = [...new Set(state.skus.map((sku) => sku.segment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const lifecycleCounts = new Map();
  state.skus.forEach((sku) => {
    const lifecycle = skuLifecycleMetaForRegistry(sku);
    const key = lifecycle?.key || 'active';
    lifecycleCounts.set(key, (lifecycleCounts.get(key) || 0) + 1);
  });
  const lifecycleOptions = (typeof PRODUCT_LIFECYCLE_STATUS_ORDER !== 'undefined' ? PRODUCT_LIFECYCLE_STATUS_ORDER : ['active', 'new', 'relaunch', 'watch', 'question', 'paused', 'exit', 'archived'])
    .map((key) => {
      const meta = typeof productLifecycleMeta === 'function' ? productLifecycleMeta(key) : { label: key };
      return { key, label: meta.label || key, count: lifecycleCounts.get(key) || 0, tone: meta.tone || '' };
    })
    .filter((item) => item.count > 0 || item.key === state.filters.lifecycle || item.key === 'active');
  const assignedCount = items.filter((sku) => registryHasOwner(sku)).length;
  const unassignedCount = items.length - assignedCount;
  const kzCount = items.filter((sku) => sku?.flags?.hasKZ).length;
  const vkCount = items.filter((sku) => sku?.flags?.hasVK).length;
  const matrixSummary = typeof skuMatrixSummary === 'function' ? skuMatrixSummary() : {};
  const matrixIssueCount = Object.entries(matrixSummary.problemStateCounts || {})
    .filter(([key]) => key !== 'ok')
    .reduce((sum, [, value]) => sum + numberOrZero(value), 0);
  const rows = items.map((sku) => {
    const task = skuTaskMap.get(String(sku.articleKey || '').trim()) || null;
    const matrixProblemState = typeof skuMatrixProblemState === 'function' ? skuMatrixProblemState(sku) : 'ok';
    const matrixProblemMeta = typeof skuMatrixProblemMeta === 'function' ? skuMatrixProblemMeta(matrixProblemState) : null;
    const matrixBadge = matrixProblemState && matrixProblemState !== 'ok' && matrixProblemMeta
      ? `<div class="badge-stack" style="margin-top:6px">${badge(matrixProblemMeta.label, matrixProblemMeta.tone || 'warn')}</div>`
      : '';
    return `
    <tr class="sku-registry-row" data-open-sku="${escapeHtml(sku.articleKey)}">
      <td>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</td>
      <td><div><strong>${escapeHtml(sku.name || 'Без названия')}</strong></div><div class="muted small">${escapeHtml(sku.category || sku.segment || '—')}</div></td>
      <td>${skuOperationalStatus(sku)}${matrixBadge}</td>
      <td>${registryOwnerCell(sku)}</td>
      <td>${trafficBadges(sku, 'нет')}</td>
      <td>${renderSkuTaskSummary(sku, task)}</td>
      <td>${nextTaskForSku(sku.articleKey)?.due ? escapeHtml(nextTaskForSku(sku.articleKey).due) : '—'}</td>
    </tr>
  `;
  }).join('');

  root.innerHTML = `
    <div class="section-title sku-data-title">
      <div>
        <h2>Реестр SKU</h2>
      </div>
      <div class="badge-stack sku-data-muted-noise">
        ${badge(`${fmt.int(items.length)} SKU`)}
        ${badge(`${fmt.int(assignedCount)} с owner`, 'ok')}
        ${badge(`${fmt.int(unassignedCount)} без owner`, unassignedCount ? 'warn' : 'ok')}
        ${lifecycleOptions.filter((item) => item.count > 0 && item.key !== 'active').slice(0, 4).map((item) => badge(`${item.label} ${fmt.int(item.count)}`, item.tone)).join('')}
        ${badge(`${fmt.int(matrixSummary.aliasCount || 0)} alias`, matrixSummary.aliasCount ? 'ok' : '')}
        ${matrixIssueCount ? badge(`${fmt.int(matrixIssueCount)} проблем матрицы`, 'warn') : ''}
        ${badge(`🚀 КЗ ${fmt.int(kzCount)}`, kzCount ? 'info' : '')}
        ${badge(`📣 VK ${fmt.int(vkCount)}`, vkCount ? 'info' : '')}
      </div>
    </div>

    ${skuRegistryFocusBoardHtml({ activeMarket, allMarketSkus, items, skuTaskMap, matrixIssueCount, registryIssueRows })}
    <details class="sku-data-technical sku-data-metrics-drawer">
      <summary class="sku-data-technical-summary">Подробные метрики площадок</summary>
      <div class="sku-data-technical-body">
        ${registryPlatformBoardHtml}
        ${registryGameCardsHtml}
      </div>
    </details>

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
      <select id="skuLifecycleFilter">
        <option value="all" ${state.filters.lifecycle === 'all' ? 'selected' : ''}>Все статусы товара</option>
        ${lifecycleOptions.map((item) => `<option value="${escapeHtml(item.key)}" ${state.filters.lifecycle === item.key ? 'selected' : ''}>${escapeHtml(item.label)} · ${fmt.int(item.count)}</option>`).join('')}
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
        <option value="matrixIssue" ${state.filters.focus === 'matrixIssue' ? 'selected' : ''}>Проблемы матрицы</option>
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

  `;

  root.querySelector('#skuSearchInput')?.addEventListener('input', (e) => { state.filters.search = e.target.value; renderSkuRegistry(rootId); });
  root.querySelector('#skuOwnerFilter')?.addEventListener('change', (e) => { state.filters.owner = e.target.value; renderSkuRegistry(rootId); });
  root.querySelector('#skuSegmentFilter')?.addEventListener('change', (e) => { state.filters.segment = e.target.value; renderSkuRegistry(rootId); });
  root.querySelector('#skuLifecycleFilter')?.addEventListener('change', (e) => { state.filters.lifecycle = e.target.value; renderSkuRegistry(rootId); });
  root.querySelector('#skuFocusFilter')?.addEventListener('change', (e) => { state.filters.focus = e.target.value; renderSkuRegistry(rootId); });
  root.querySelector('#skuTrafficFilter')?.addEventListener('change', (e) => { state.filters.traffic = e.target.value; renderSkuRegistry(rootId); });
  root.querySelector('#skuAssignmentFilter')?.addEventListener('change', (e) => { state.filters.assignment = e.target.value; renderSkuRegistry(rootId); });
  root.querySelectorAll('[data-market-filter]').forEach((btn) => btn.addEventListener('click', (e) => {
    state.filters.market = e.currentTarget.dataset.marketFilter;
    state.filters.owner = 'all';
    renderSkuRegistry(rootId);
  }));
  root.querySelectorAll('[data-sku-registry-focus]').forEach((button) => button.addEventListener('click', (event) => {
    const focus = event.currentTarget.dataset.skuRegistryFocus || 'all';
    skuJourneyApplyRegistryFocus(focus, state.filters.search || '');
  }));
  root.querySelector('[data-sku-registry-open-contour]')?.addEventListener('click', () => {
    skuJourneyHandleAction('open-contour');
  });
  root.querySelectorAll('[data-sku-journey-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (event.__skuJourneyHandled) return;
      event.__skuJourneyHandled = true;
      skuJourneyHandleAction(event.currentTarget.dataset.skuJourneyAction || '');
    });
  });
}

function metricRow(label, value, kind = '') {
  return `<div class="metric-row"><span>${escapeHtml(label)}</span><strong class="${kind}">${value}</strong></div>`;
}
