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
            <option value="retail" ${task.platform === 'retail' ? 'selected' : ''}>ЯМ / Летуаль / Магнит / ЗЯ</option>
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

  body.querySelector('#taskCloseForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const report = String(form.get('report') || '').trim();
    if (!report) return;
    await closeTaskWithReport(taskId, report);
    renderTaskModal(taskId);
  });
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

function buildSkuRegistryTaskMap() {
  const taskMap = new Map();
  getAllTasks().forEach((task) => {
    const articleKey = String(task?.articleKey || '').trim();
    if (!articleKey || taskMap.has(articleKey)) return;
    taskMap.set(articleKey, task);
  });
  return taskMap;
}

function getFilteredSkus(taskMap = null) {
  const nextTaskMap = taskMap instanceof Map ? taskMap : buildSkuRegistryTaskMap();
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
    const aTask = nextTaskMap.get(String(a.articleKey || '').trim()) || null;
    const bTask = nextTaskMap.get(String(b.articleKey || '').trim()) || null;
    return Number(filterSkuByWorkLogic(b)) - Number(filterSkuByWorkLogic(a))
      || Number((b.focusScore || 0)) - Number((a.focusScore || 0))
      || Number(isTaskOverdue(bTask)) - Number(isTaskOverdue(aTask))
      || String(a.article || '').localeCompare(String(b.article || ''), 'ru');
  });
}

function renderSkuRegistry() {
  const root = document.getElementById('view-skus');
  const skuTaskMap = buildSkuRegistryTaskMap();
  const items = getFilteredSkus(skuTaskMap);
  const owners = [...new Set(state.skus.map((sku) => ownerName(sku)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const segments = [...new Set(state.skus.map((sku) => sku.segment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const assignedCount = items.filter((sku) => sku?.flags?.assigned).length;
  const unassignedCount = items.length - assignedCount;
  const kzCount = items.filter((sku) => sku?.flags?.hasKZ).length;
  const vkCount = items.filter((sku) => sku?.flags?.hasVK).length;
  const registryLiveNote = `
    <div class="card subtle" style="margin:12px 0 14px;">
      <strong>Реестр живой.</strong>
      <div class="muted small" style="margin-top:6px">
        Берём snapshot-backed <code>data/skus.json</code>. После кнопки "Обновить командные данные" перечитываем реестр и,
        если карточка SKU уже открыта, перерисовываем и её тоже.
      </div>
    </div>
  `;

  const rows = items.map((sku) => {
    const task = skuTaskMap.get(String(sku.articleKey || '').trim()) || null;
    return `
    <tr>
      <td>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</td>
      <td><div><strong>${escapeHtml(sku.name || 'Без названия')}</strong></div><div class="muted small">${escapeHtml(sku.category || sku.segment || '—')}</div></td>
      <td>${skuOperationalStatus(sku)}</td>
      <td>${ownerCell(sku)}</td>
      <td>${trafficBadges(sku, 'нет')}</td>
      <td>${renderSkuTaskSummary(sku, task)}</td>
      <td>${nextTaskForSku(sku.articleKey)?.due ? escapeHtml(nextTaskForSku(sku.articleKey).due) : '—'}</td>
    </tr>
  `;
  }).join('');

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

    ${registryLiveNote}

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
