function renderControlCenter() {
  const root = document.getElementById('view-control');
  state.controlFilters.platform = normalizeControlWorkstreamFilter(state.controlFilters.platform);

  const tasks = filteredControlTasks();
  const baseTasks = filteredControlTasks({ ignorePlatform: true });
  const selectedWorkstream = state.controlFilters.platform;
  const selectedSummary = buildControlWorkstreamSummary(baseTasks, selectedWorkstream);
  const owners = [...new Set(getAllTasks().map((task) => task.owner || 'Без owner'))].sort((a, b) => a.localeCompare(b, 'ru'));
  const ownerSuggestions = ownerOptions();
  const unassignedSkus = [...state.skus]
    .filter((sku) => !sku?.flags?.assigned)
    .sort((a, b) => (b.focusScore || 0) - (a.focusScore || 0) || monthRevenue(b) - monthRevenue(a))
    .slice(0, 8);
  const waitingDecisions = [...(state.storage.decisions || [])]
    .filter((decision) => decision.status === 'waiting_decision' || decision.status === 'new')
    .sort((a, b) => (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31'))
    .slice(0, 8);
  const workstreamSummaries = CONTROL_WORKSTREAM_FILTER_ORDER.map((key) => buildControlWorkstreamSummary(baseTasks, key));
  const sectionKeys = selectedWorkstream === 'all'
    ? CONTROL_WORKSTREAM_ORDER.filter((key) => workstreamSummaries.find((item) => item.key === key)?.tasks.length)
    : [selectedWorkstream];
  const workstreamCards = workstreamSummaries.map((summary) => renderControlWorkstreamCard(summary, selectedWorkstream)).join('');
  const board = sectionKeys.length
    ? sectionKeys.map((key) => renderControlWorkstreamSection(workstreamSummaries.find((item) => item.key === key))).join('')
    : `<div class="card" style="margin-top:14px"><div class="empty">По текущему фильтру задач пока нет.</div></div>`;

  const counts = {
    active: tasks.filter(isTaskActive).length,
    overdue: tasks.filter(isTaskOverdue).length,
    noOwner: tasks.filter((task) => isTaskActive(task) && !task.owner).length,
    waiting: tasks.filter((task) => task.status === 'waiting_rop').length,
    critical: tasks.filter((task) => isTaskActive(task) && task.priority === 'critical').length,
    auto: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length
  };

  const spotlightTasks = tasks.slice(0, 4);
  const recentHistory = getRecentTaskHistory(tasks, 8);
  const workstreamOptions = CONTROL_WORKSTREAM_FILTER_ORDER
    .filter((key) => key !== 'all')
    .map((key) => `<option value="${escapeHtml(key)}" ${selectedWorkstream === key ? 'selected' : ''}>${escapeHtml(controlWorkstreamMeta(key).label)}</option>`)
    .join('');

  const assignHtml = unassignedSkus.length ? unassignedSkus.map((sku) => `
    <div class="assign-row">
      <div class="head">
        <div>
          <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
          <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
        </div>
        <div class="badge-stack">${scoreChip(sku.focusScore || 0)}${skuOperationalStatus(sku)}</div>
      </div>
      <div class="team-note">${escapeHtml(sku.focusReasons || 'Нужно закрепить owner и первый срок обновления.')}</div>
      <div class="inline-form" style="margin-top:10px">
        <input class="inline-input" list="ownerOptionsList" data-owner-assign-input="${escapeHtml(sku.articleKey)}" placeholder="Кто отвечает за SKU">
        <input class="inline-input" data-owner-assign-role="${escapeHtml(sku.articleKey)}" placeholder="Роль / зона" value="Owner SKU">
        <button class="btn small-btn" type="button" data-save-owner="${escapeHtml(sku.articleKey)}">Закрепить</button>
      </div>
    </div>
  `).join('') : '<div class="empty">Все SKU уже закреплены.</div>';

  const decisionsHtml = waitingDecisions.length ? waitingDecisions.map((item) => {
    const sku = getSku(item.articleKey);
    return `
      <div class="decision-item">
        <div class="head">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <div class="muted small">${sku ? linkToSku(sku.articleKey, sku.article || sku.articleKey) : escapeHtml(item.articleKey)}</div>
          </div>
          <div class="badge-stack">${taskStatusBadge(item)}${item.owner ? badge(item.owner, 'info') : ''}</div>
        </div>
        <div class="muted small">${escapeHtml(item.decision || 'Нужно зафиксировать решение.')}</div>
        <div class="meta-line" style="margin-top:8px"><span class="muted small">Срок ${escapeHtml(item.due || '—')}</span><span class="muted small">${escapeHtml(item.createdBy || 'Команда')}</span></div>
      </div>
    `;
  }).join('') : '<div class="empty">Нет решений в ожидании.</div>';

  const recentHistoryHtml = recentHistory.length
    ? recentHistory.map((item) => {
      const task = getTask(item.taskId);
      return `
        <div class="decision-item">
          <div class="head">
            <div>
              <strong>${escapeHtml(taskHeadline(task))}</strong>
              <div class="muted small">${task ? taskEntityLine(task, getSku(task.articleKey)) : escapeHtml(item.taskId)}</div>
            </div>
            <div class="badge-stack">${taskHistoryBadge(item.kind)}${item.team ? badge(item.team, 'info') : ''}</div>
          </div>
          <div class="muted small">${escapeHtml(item.text || '—')}</div>
          <div class="meta-line" style="margin-top:8px"><span class="muted small">${fmt.date(item.createdAt)}</span><span class="muted small">${escapeHtml(item.author || 'Команда')}</span></div>
        </div>
      `;
    }).join('')
    : '<div class="empty">История появится после первых обновлений по задачам.</div>';

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Контур задач</h2>
        <p>Сначала общий обзор по всем блокам, затем конкретный контур, а ниже уже точечная работа по задачам, owner и решениям. Это делает экран ближе к формату Asana, а не к разрозненному списку.</p>
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
      <div class="mini-kpi"><span>Ждут решения</span><strong>${fmt.int(counts.waiting)}</strong></div>
      <div class="mini-kpi"><span>Авто-сигналы</span><strong>${fmt.int(counts.auto)}</strong></div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Общий обзор → контуры</h3>
          <p class="small muted">Сверху держим общую картину по всем блокам: Общие, WB, Ozon, ЯМ / сети, Продукт и Руководитель. Ниже уже проваливаемся в конкретный контур.</p>
        </div>
        <div class="badge-stack">
          ${badge(controlWorkstreamMeta(selectedSummary.key).label, controlWorkstreamMeta(selectedSummary.key).kind)}
          ${badge(`${fmt.int(selectedSummary.activeCount)} активных`, selectedSummary.activeCount ? controlWorkstreamMeta(selectedSummary.key).kind : '')}
          ${selectedSummary.overdueCount ? badge(`${fmt.int(selectedSummary.overdueCount)} просрочено`, 'danger') : badge('без просрочек', 'ok')}
        </div>
      </div>
      <div class="task-mini-grid" style="margin-top:12px">
        <div class="task-mini">
          <div class="left">
            <strong>Что видим сверху</strong>
            <div class="muted small">${escapeHtml(controlWorkstreamMeta(selectedSummary.key).description)}</div>
          </div>
          <div class="badge-stack">${badge(`${fmt.int(selectedSummary.typeCount)} типов задач`)}</div>
        </div>
        <div class="task-mini">
          <div class="left">
            <strong>Ключевые owner</strong>
            <div class="muted small">${escapeHtml(selectedSummary.ownerPreview.length ? selectedSummary.ownerPreview.join(' · ') : 'Пока без явных owner')}</div>
          </div>
          <div class="badge-stack">${badge(`${fmt.int(selectedSummary.criticalCount)} критичных`, selectedSummary.criticalCount ? 'danger' : 'ok')}</div>
        </div>
        <div class="task-mini">
          <div class="left">
            <strong>Что важно менеджеру</strong>
            <div class="muted small">${escapeHtml(selectedSummary.waitingCount ? 'Сначала разобрать зависшие решения и блокеры.' : 'Можно идти по плановой очереди задач.')}</div>
          </div>
          <div class="badge-stack">${badge(selectedSummary.waitingCount ? 'есть эскалации' : 'без эскалаций', selectedSummary.waitingCount ? 'warn' : 'ok')}</div>
        </div>
      </div>
    </div>

    <div class="grid cards" style="margin-top:14px">${workstreamCards}</div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Поставить общую задачу</h3>
            <p class="small muted">Форма стала короче и понятнее: тема, контур, тип, ответственный, срок и следующий шаг. Этого достаточно, чтобы задача сразу была читаемой для команды.</p>
          </div>
          ${badge(selectedWorkstream === 'all' ? 'сквозная задача' : controlWorkstreamMeta(selectedWorkstream).label, 'info')}
        </div>
        <form id="generalTaskForm" class="form-grid compact" style="margin-top:12px">
          <label style="display:grid; gap:6px">
            <span class="muted small">Название задачи</span>
            <input name="title" placeholder="Например: согласовать запуск, обновить карточку, проверить цены" required>
          </label>
          <label style="display:grid; gap:6px">
            <span class="muted small">Блок / тема</span>
            <input name="entityLabel" placeholder="Проект, товарная группа, weekly, запуск" value="${selectedWorkstream !== 'all' ? escapeHtml(controlWorkstreamMeta(selectedWorkstream).label) : ''}">
          </label>
          <label style="display:grid; gap:6px">
            <span class="muted small">Контур</span>
            <select name="platform">
              <option value="cross" ${selectedWorkstream === 'cross' || selectedWorkstream === 'all' ? 'selected' : ''}>Общие</option>
              ${workstreamOptions}
            </select>
          </label>
          <label style="display:grid; gap:6px">
            <span class="muted small">Тип задачи</span>
            <select name="type">
              <option value="general">Общее</option>
              <option value="launch">Новинка / запуск</option>
              <option value="traffic">Трафик / продвижение</option>
              <option value="content">Контент / карточка</option>
              <option value="assignment">Закрепление</option>
            </select>
          </label>
          <label style="display:grid; gap:6px">
            <span class="muted small">Приоритет</span>
            <select name="priority">
              ${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${value === 'high' ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
            </select>
          </label>
          <label style="display:grid; gap:6px">
            <span class="muted small">Ответственный</span>
            <input name="owner" list="ownerOptionsList" placeholder="Кто ведёт задачу">
          </label>
          <label style="display:grid; gap:6px">
            <span class="muted small">Срок</span>
            <input name="due" type="date" value="${plusDays(2)}">
          </label>
          <label style="display:grid; gap:6px">
            <span class="muted small">Следующий шаг и критерий результата</span>
            <textarea name="nextAction" rows="4" placeholder="Что делаем первым шагом, кто должен ответить и по какому признаку задача считается закрытой" required></textarea>
          </label>
          <button class="btn primary" type="submit">Поставить задачу</button>
        </form>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Фильтры текущего контура</h3>
            <p class="small muted">После общего обзора переходим к частному: можно быстро сузить срез по owner, статусу, типу, горизонту и источнику задачи.</p>
          </div>
        </div>
        <div class="control-filters" style="margin-top:12px">
          <input id="controlSearchInput" placeholder="Поиск по SKU, задаче, owner, контуру…" value="${escapeHtml(state.controlFilters.search)}">
          <select id="controlPlatformFilter">
            <option value="all" ${selectedWorkstream === 'all' ? 'selected' : ''}>Все контуры</option>
            <option value="cross" ${selectedWorkstream === 'cross' ? 'selected' : ''}>Общие</option>
            ${workstreamOptions}
          </select>
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
      </div>
    </div>

    ${board}

    <div class="team-strip">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Последние обновления по задачам</h3>
            <p class="small muted">Короткая история изменений: кто обновил задачу, что поменялось и где уже есть отчёт по результату.</p>
          </div>
          ${badge(`${fmt.int(recentHistory.length)} записей`, recentHistory.length ? 'info' : 'ok')}
        </div>
        <div class="decision-list">${recentHistoryHtml}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Закрепление SKU</h3>
            <p class="small muted">Быстрый блок, чтобы не оставлять новинки и проблемные карточки без owner.</p>
          </div>
          ${badge(state.team.mode === 'ready' ? 'Supabase ready' : state.team.mode === 'local' ? 'local' : state.team.mode, state.team.mode === 'ready' ? 'ok' : state.team.mode === 'error' ? 'danger' : 'warn')}
        </div>
        <div class="team-note">${escapeHtml(state.team.note || 'Локальный режим')} · ${escapeHtml(teamMemberLabel())}</div>
        <datalist id="ownerOptionsList">${ownerSuggestions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <div class="assign-list" style="margin-top:12px">${assignHtml}</div>
      </div>
    </div>

    <div class="check-grid" style="margin:14px 0">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Решения ждут подтверждения</h3>
            <p class="small muted">То, что руководитель, директор или бренд-лид должны быстро зафиксировать.</p>
          </div>
          ${badge(`${fmt.int(waitingDecisions.length)} шт.`, waitingDecisions.length ? 'warn' : 'ok')}
        </div>
        <div class="decision-list">${decisionsHtml}</div>
      </div>

      <div class="card">
        <h3>Чек-лист контроля</h3>
        <div class="check-list">
          <div class="check-item"><strong>1.</strong><span>Закрыть просрочки и сразу переносить срок, если реально ждём другой отдел.</span></div>
          <div class="check-item"><strong>2.</strong><span>Проверить все задачи без owner и закрепить их.</span></div>
          <div class="check-item"><strong>3.</strong><span>Открывать задачу через карточку и фиксировать следующий шаг, а не только менять статус в списке.</span></div>
          <div class="check-item"><strong>4.</strong><span>При закрытии просить короткий отчёт: что сделали, какой результат и где артефакт.</span></div>
        </div>
      </div>

      <div class="card">
        <h3>Сейчас на контроле</h3>
        <div class="task-mini-grid">
          ${spotlightTasks.length ? spotlightTasks.map(renderMiniTask).join('') : '<div class="empty">Нет задач для экспресс-проверки.</div>'}
        </div>
      </div>
    </div>
  `;

  document.getElementById('controlSearchInput').addEventListener('input', (e) => { state.controlFilters.search = e.target.value; renderControlCenter(); });
  root.querySelectorAll('[data-control-workstream]').forEach((btn) => btn.addEventListener('click', () => {
    state.controlFilters.platform = btn.dataset.controlWorkstream;
    renderControlCenter();
  }));
  document.getElementById('controlOwnerFilter').addEventListener('change', (e) => { state.controlFilters.owner = e.target.value; renderControlCenter(); });
  document.getElementById('controlStatusFilter').addEventListener('change', (e) => { state.controlFilters.status = e.target.value; renderControlCenter(); });
  document.getElementById('controlTypeFilter').addEventListener('change', (e) => { state.controlFilters.type = e.target.value; renderControlCenter(); });
  document.getElementById('controlPlatformFilter').addEventListener('change', (e) => { state.controlFilters.platform = e.target.value; renderControlCenter(); });
  document.getElementById('controlHorizonFilter').addEventListener('change', (e) => { state.controlFilters.horizon = e.target.value; renderControlCenter(); });
  document.getElementById('controlSourceFilter').addEventListener('change', (e) => { state.controlFilters.source = e.target.value; renderControlCenter(); });
  document.getElementById('generalTaskForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const task = await createManualTask({
      articleKey: '',
      entityLabel: form.get('entityLabel'),
      title: form.get('title'),
      type: form.get('type'),
      priority: form.get('priority'),
      platform: form.get('platform'),
      owner: form.get('owner'),
      due: form.get('due'),
      nextAction: form.get('nextAction')
    });
    renderControlCenter();
    if (task?.id) openTaskModal(task.id);
  });

  root.querySelectorAll('[data-save-owner]').forEach((btn) => btn.addEventListener('click', async () => {
    const articleKey = btn.dataset.saveOwner;
    const ownerInput = root.querySelector(`[data-owner-assign-input="${articleKey}"]`);
    const roleInput = root.querySelector(`[data-owner-assign-role="${articleKey}"]`);
    await upsertOwnerAssignment({
      articleKey,
      ownerName: ownerInput?.value || '',
      ownerRole: roleInput?.value || 'Owner SKU',
      note: 'Закреплено из центра задач'
    });
    renderControlCenter();
    if (state.activeSku === articleKey) renderSkuModal(articleKey);
    rerenderCurrentView();
  }));
}

function closeTaskModal() {
  document.getElementById('taskModal')?.classList.remove('open');
  state.activeTaskId = null;
}

function openTaskModal(taskId) {
  renderTaskModal(taskId);
}
