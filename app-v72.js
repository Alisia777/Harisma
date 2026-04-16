(function () {
  const V72_TASK_SOURCES = ['РОП', 'Руководитель', 'Бренд-лид', 'WB', 'Ozon', 'Логистика', 'Маркетинг', 'Контент', 'Финансы', 'Внешний трафик'];
  const V72_CONTOURS = [
    'ROP / поручения',
    'Weekly МП',
    'Weekly Финансы',
    'Demand + Логистика + Supply',
    'Marketing Review',
    'PMR / Новинки',
    'Документы / регламенты',
    'Прочее'
  ];
  const V72_LINK_TYPES = ['SKU', 'Кластер', 'Склад', 'Встреча', 'Документ', 'Прочее'];
  const CORE_EMPLOYEES = ['Олеся', 'Мария', 'Светлана', 'Даша', 'Артем', 'Виктория'];

  state.v72 = Object.assign({
    taskQueue: 'active',
    taskSource: 'all',
    taskContour: 'all',
    taskOwner: 'all',
    taskPriority: 'all',
    taskSearch: '',
    employeeFocus: 'all',
    adminVisible: false
  }, state.v72 || {});

  const baseOwnerOptions = ownerOptions;
  ownerOptions = function () {
    const pool = new Set(baseOwnerOptions());
    CORE_EMPLOYEES.forEach((name) => pool.add(name));
    pool.delete('Кирилл');
    return [...pool].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'));
  };

  function html(value) {
    return escapeHtml(value == null ? '' : String(value));
  }

  function adminUiEnabled() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return state.v72.adminVisible || params.get('admin') === '1' || Boolean(window.APP_CONFIG?.adminUi);
    } catch (error) {
      return state.v72.adminVisible || Boolean(window.APP_CONFIG?.adminUi);
    }
  }

  function patchV72Chrome() {
    document.title = 'Altea Portal · v7.2 · Team Ops';
    const topbar = document.querySelector('.topbar p');
    if (topbar) topbar.textContent = 'v7.2: задачник под РОПа, приоритеты, свод по менеджерам и текущая работа по артикулам.';
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) brandSub.textContent = 'Imperial v7.2 · team ops · задачи · логика · контроль';
    const activeDashboard = document.querySelector('.nav-btn[data-view="dashboard"] small');
    if (activeDashboard) activeDashboard.textContent = 'Pulse + KPI + лидеры';
    const controlLabel = document.querySelector('.nav-btn[data-view="control"] small');
    if (controlLabel) controlLabel.textContent = 'Задачи · РОП · сотрудники';
    syncAdminVisibility();
    try { updateSyncBadge(); } catch (error) {}
  }

  function syncAdminVisibility() {
    const exportBtn = document.getElementById('exportStorageBtn');
    const importBtn = document.querySelector('.file-input');
    const adminToggle = document.getElementById('toggleAdminBarBtn');
    if (exportBtn) exportBtn.classList.toggle('hidden', !adminUiEnabled());
    if (importBtn) importBtn.classList.toggle('hidden', !adminUiEnabled());
    if (adminToggle) adminToggle.textContent = adminUiEnabled() ? 'Скрыть админ' : 'Админ';
  }

  const baseUpdateSyncBadge = updateSyncBadge;
  updateSyncBadge = function () {
    baseUpdateSyncBadge();
    syncAdminVisibility();
    const badgeEl = document.getElementById('syncStatusBadge');
    if (!badgeEl) return;
    const member = state.team.member?.name ? ` · ${state.team.member.name}` : '';
    if (state.team.mode === 'ready') badgeEl.textContent = `Командная база online${member}`;
    if (state.team.mode === 'local') badgeEl.textContent = 'Локальный режим';
    if (state.team.mode === 'pending') badgeEl.textContent = 'Синхронизация…';
    if (state.team.mode === 'error') badgeEl.textContent = `Ошибка синка${state.team.error ? ` · ${state.team.error}` : ''}`;
  };

  function encodeEntity(meta) {
    return [meta.source || '', meta.contour || '', meta.linkType || '', meta.target || '', meta.requester || ''].join('§');
  }

  function taskMeta(task) {
    const raw = String(task?.entityLabel || '').trim();
    if (raw.includes('§')) {
      const [source, contour, linkType, target, requester] = raw.split('§');
      return {
        source: source || '',
        contour: contour || '',
        linkType: linkType || '',
        target: target || '',
        requester: requester || ''
      };
    }
    const reason = String(task?.reason || '');
    const meta = { source: '', contour: '', linkType: '', target: '', requester: '' };
    reason.split(' || ').map((part) => part.trim()).filter(Boolean).forEach((part) => {
      if (part.startsWith('SOURCE::')) meta.source = part.replace('SOURCE::', '').trim();
      if (part.startsWith('CONTOUR::')) meta.contour = part.replace('CONTOUR::', '').trim();
      if (part.startsWith('REQUESTER::')) meta.requester = part.replace('REQUESTER::', '').trim();
      if (part.startsWith('LINKTYPE::')) meta.linkType = part.replace('LINKTYPE::', '').trim();
      if (part.startsWith('TARGET::')) meta.target = part.replace('TARGET::', '').trim();
    });
    if (!meta.source) meta.source = task?.source === 'auto' ? 'Авто-сигнал' : 'Ручная';
    if (!meta.target) meta.target = task?.articleKey || '';
    if (!meta.linkType) meta.linkType = getSku(task?.articleKey) ? 'SKU' : 'Прочее';
    return meta;
  }

  function serializeTaskReason(reason, source, contour, requester, linkType, target) {
    const parts = [];
    if (source) parts.push(`SOURCE::${String(source).trim()}`);
    if (contour) parts.push(`CONTOUR::${String(contour).trim()}`);
    if (requester) parts.push(`REQUESTER::${String(requester).trim()}`);
    if (linkType) parts.push(`LINKTYPE::${String(linkType).trim()}`);
    if (target) parts.push(`TARGET::${String(target).trim()}`);
    const clean = String(reason || '').trim();
    if (clean) parts.push(clean);
    return parts.join(' || ');
  }

  function cleanTaskReason(task) {
    return String(task?.reason || '')
      .split(' || ')
      .map((part) => part.trim())
      .filter((part) => part && !/^(SOURCE|CONTOUR|REQUESTER|LINKTYPE|TARGET)::/.test(part))
      .join(' · ');
  }

  function taskTargetValue(linkType, raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (linkType === 'SKU') {
      const direct = state.skus.find((sku) => sku.articleKey === value || sku.article === value || String(sku.name || '').toLowerCase() === value.toLowerCase());
      return direct?.articleKey || value;
    }
    return value;
  }

  function allTaskTargets() {
    const rows = [];
    state.skus.forEach((sku) => rows.push({ type: 'SKU', value: sku.articleKey, label: `${sku.article || sku.articleKey} · ${sku.name || ''}` }));
    (state.logistics?.ozonClusters || []).forEach((row) => rows.push({ type: 'Кластер', value: row.name, label: `Ozon кластер · ${row.name}` }));
    (state.logistics?.wbWarehouses || []).forEach((row) => rows.push({ type: 'Склад', value: row.name, label: `WB склад · ${row.name}` }));
    (state.documents?.groups || []).forEach((group) => (group.items || []).forEach((item) => rows.push({ type: 'Документ', value: item.title, label: `Документ · ${item.title}` })));
    (state.meetings || []).forEach((meeting) => rows.push({ type: 'Встреча', value: meeting.title, label: `Встреча · ${meeting.title}` }));
    return rows;
  }

  async function createTeamTask(payload) {
    const targetRaw = String(payload.target || '').trim();
    const target = taskTargetValue(payload.linkType, targetRaw);
    if (!target) throw new Error('Нужно выбрать привязку задачи');
    const task = normalizeTask({
      id: uid('task'),
      source: 'manual',
      articleKey: payload.linkType === 'SKU' ? target : '',
      title: String(payload.title || '').trim() || 'Новая задача',
      type: payload.type || 'general',
      priority: payload.priority || 'medium',
      platform: payload.platform || 'all',
      owner: String(payload.owner || '').trim(),
      due: payload.due || plusDays(3),
      status: 'new',
      nextAction: String(payload.nextAction || '').trim(),
      reason: serializeTaskReason(payload.reason, payload.requestSource, payload.contour, payload.requester, payload.linkType, targetRaw),
      entityLabel: encodeEntity({
        source: payload.requestSource,
        contour: payload.contour,
        linkType: payload.linkType,
        target: targetRaw,
        requester: payload.requester
      })
    }, 'manual');
    state.storage.tasks.unshift(task);
    saveLocalStorage();
    try {
      await persistTask(task);
    } catch (error) {
      console.error(error);
    }
  }

  function baseTaskFilters() {
    return {
      search: String(state.v72.taskSearch || '').trim().toLowerCase(),
      queue: state.v72.taskQueue || 'active',
      source: state.v72.taskSource || 'all',
      contour: state.v72.taskContour || 'all',
      owner: state.v72.taskOwner || 'all',
      priority: state.v72.taskPriority || 'all'
    };
  }

  function filteredTeamTasks() {
    const filters = baseTaskFilters();
    return getAllTasks().filter((task) => {
      const meta = taskMeta(task);
      const sku = getSku(task.articleKey);
      const hay = [task.title, task.nextAction, task.reason, task.owner, task.articleKey, sku?.article, sku?.name, sku?.category, meta.source, meta.contour, meta.target, meta.requester]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (filters.search && !hay.includes(filters.search)) return false;
      if (filters.owner !== 'all' && (task.owner || 'Без owner') !== filters.owner) return false;
      if (filters.source !== 'all' && meta.source !== filters.source) return false;
      if (filters.contour !== 'all' && meta.contour !== filters.contour) return false;
      if (filters.priority !== 'all' && (task.priority || 'medium') !== filters.priority) return false;
      if (filters.queue === 'active' && !isTaskActive(task)) return false;
      if (filters.queue === 'overdue' && !isTaskOverdue(task)) return false;
      if (filters.queue === 'waiting_decision' && task.status !== 'waiting_decision') return false;
      if (filters.queue === 'no_owner' && task.owner) return false;
      if (filters.queue === 'critical' && (!isTaskActive(task) || task.priority !== 'critical')) return false;
      if (filters.queue === 'my' && state.team.member?.name && task.owner !== state.team.member.name) return false;
      return true;
    });
  }

  function sourceSummary(tasks) {
    const counts = new Map();
    tasks.forEach((task) => {
      const label = taskMeta(task).source || 'Не указан';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
  }

  function contourSummary(tasks) {
    const counts = new Map();
    tasks.forEach((task) => {
      const label = taskMeta(task).contour || 'Без контура';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
  }

  function ownerSummaryRows() {
    const owners = new Set([...ownerOptions(), ...state.skus.map((sku) => ownerName(sku)).filter(Boolean), ...getAllTasks().map((task) => task.owner).filter(Boolean)]);
    const rows = [];
    owners.forEach((name) => {
      const skuList = state.skus.filter((sku) => ownerName(sku) === name);
      const taskList = getAllTasks().filter((task) => task.owner === name);
      const active = taskList.filter(isTaskActive);
      const overdue = active.filter(isTaskOverdue);
      const critical = active.filter((task) => task.priority === 'critical');
      const waiting = active.filter((task) => task.status === 'waiting_decision');
      const done = taskList.filter((task) => task.status === 'done');
      const planValues = skuList.map((sku) => Number(sku?.planFact?.completionFeb26Pct)).filter((value) => Number.isFinite(value));
      const avgPlan = planValues.length ? planValues.reduce((sum, value) => sum + value, 0) / planValues.length : null;
      const negativeMargin = skuList.filter((sku) => sku?.flags?.negativeMargin || sku?.flags?.wbNegativeMargin || sku?.flags?.ozonNegativeMargin).length;
      const toWork = skuList.filter((sku) => sku?.flags?.toWork || sku?.flags?.toWorkWB || sku?.flags?.toWorkOzon).length;
      const externalTraffic = skuList.filter((sku) => sku?.flags?.hasExternalTraffic).length;
      const underPlan = skuList.filter((sku) => sku?.flags?.underPlan).length;
      const revenue = skuList.reduce((sum, sku) => sum + (Number(monthRevenue(sku)) || 0), 0);
      if (!skuList.length && !taskList.length) return;
      rows.push({
        name,
        skuCount: skuList.length,
        revenue,
        active: active.length,
        overdue: overdue.length,
        critical: critical.length,
        waiting: waiting.length,
        done: done.length,
        totalTasks: taskList.length,
        completionRate: taskList.length ? done.length / taskList.length : null,
        avgPlan,
        negativeMargin,
        toWork,
        externalTraffic,
        underPlan,
        skuList,
        taskList,
        activeTasks: active
      });
    });
    return rows.sort((a, b) => b.overdue - a.overdue || b.active - a.active || b.critical - a.critical || b.revenue - a.revenue || a.name.localeCompare(b.name, 'ru'));
  }

  function selectedEmployeeSummary(summaries) {
    if (!summaries.length) return null;
    if (state.v72.employeeFocus === 'all') return null;
    return summaries.find((item) => item.name === state.v72.employeeFocus) || null;
  }

  function aggregateFocusSummary(summaries) {
    if (!summaries.length) return null;
    const allSku = summaries.reduce((sum, row) => sum + row.skuCount, 0);
    const planRows = summaries.map((row) => row.avgPlan).filter((value) => Number.isFinite(value));
    return {
      name: 'Все сотрудники',
      active: summaries.reduce((sum, row) => sum + row.active, 0),
      overdue: summaries.reduce((sum, row) => sum + row.overdue, 0),
      critical: summaries.reduce((sum, row) => sum + row.critical, 0),
      waiting: summaries.reduce((sum, row) => sum + row.waiting, 0),
      done: summaries.reduce((sum, row) => sum + row.done, 0),
      skuCount: allSku,
      avgPlan: planRows.length ? planRows.reduce((sum, value) => sum + value, 0) / planRows.length : null,
      negativeMargin: summaries.reduce((sum, row) => sum + row.negativeMargin, 0),
      toWork: summaries.reduce((sum, row) => sum + row.toWork, 0),
      externalTraffic: summaries.reduce((sum, row) => sum + row.externalTraffic, 0),
      underPlan: summaries.reduce((sum, row) => sum + row.underPlan, 0),
      revenue: summaries.reduce((sum, row) => sum + row.revenue, 0)
    };
  }

  function groupedArticleActivity(ownerFilter = 'all') {
    const tasks = getAllTasks().filter((task) => isTaskActive(task) && (ownerFilter === 'all' || task.owner === ownerFilter));
    const groups = new Map();
    tasks.forEach((task) => {
      const meta = taskMeta(task);
      const sku = getSku(task.articleKey);
      const key = task.articleKey || `${meta.linkType}::${meta.target || task.id}`;
      const label = sku ? `${sku.article || sku.articleKey}` : `${meta.linkType || 'Объект'} · ${meta.target || task.title}`;
      const subtitle = sku ? (sku.name || '') : (meta.target || '');
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          articleKey: task.articleKey || '',
          label,
          subtitle,
          sku,
          owners: new Set(),
          contours: new Set(),
          sourceSet: new Set(),
          tasks: [],
          topPriority: 0,
          overdue: 0
        });
      }
      const entry = groups.get(key);
      entry.tasks.push(task);
      if (task.owner) entry.owners.add(task.owner);
      if (meta.contour) entry.contours.add(meta.contour);
      if (meta.source) entry.sourceSet.add(meta.source);
      entry.topPriority = Math.max(entry.topPriority, PRIORITY_META[task.priority]?.rank || 0);
      if (isTaskOverdue(task)) entry.overdue += 1;
    });
    return [...groups.values()]
      .map((entry) => {
        const completion = Number(entry.sku?.planFact?.completionFeb26Pct);
        return Object.assign(entry, {
          owners: [...entry.owners],
          contours: [...entry.contours],
          sources: [...entry.sourceSet],
          activeCount: entry.tasks.length,
          completion: Number.isFinite(completion) ? completion : null,
          negativeMargin: Boolean(entry.sku?.flags?.negativeMargin || entry.sku?.flags?.wbNegativeMargin || entry.sku?.flags?.ozonNegativeMargin),
          toWork: Boolean(entry.sku?.flags?.toWork || entry.sku?.flags?.toWorkWB || entry.sku?.flags?.toWorkOzon),
          externalTraffic: Boolean(entry.sku?.flags?.hasExternalTraffic)
        });
      })
      .sort((a, b) => b.overdue - a.overdue || b.topPriority - a.topPriority || b.activeCount - a.activeCount || a.label.localeCompare(b.label, 'ru'));
  }

  function renderEmployeeSummaryTable(rows) {
    if (!rows.length) return '<div class="empty">Сотрудники пока не определены</div>';
    return `
      <div class="v72-manager-table">
        <div class="v72-manager-row head">
          <span>Сотрудник</span>
          <span>Активно</span>
          <span>Проср.</span>
          <span>Крит.</span>
          <span>Выполн.</span>
          <span>SKU</span>
          <span>План</span>
          <span>Маржа-</span>
          <span>SKU в работе</span>
        </div>
        ${rows.map((row) => `
          <button class="v72-manager-row ${state.v72.employeeFocus === row.name ? 'active' : ''}" type="button" data-v72-owner-focus="${html(row.name)}">
            <span class="manager-name">${html(row.name)}</span>
            <span>${fmt.int(row.active)}</span>
            <span class="${row.overdue ? 'danger-txt' : ''}">${fmt.int(row.overdue)}</span>
            <span>${fmt.int(row.critical)}</span>
            <span>${fmt.int(row.done)}</span>
            <span>${fmt.int(row.skuCount)}</span>
            <span>${row.avgPlan != null ? html(fmt.pct(row.avgPlan)) : '—'}</span>
            <span>${fmt.int(row.negativeMargin)}</span>
            <span>${fmt.int(row.toWork)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function focusMetric(label, value, hint, kind = '') {
    return `<div class="v72-focus-metric ${kind}"><span>${html(label)}</span><strong>${value}</strong><small>${html(hint || '')}</small></div>`;
  }

  function renderFocusHeader(summary) {
    if (!summary) return '<div class="empty">Нет данных по сотрудникам</div>';
    return `
      <div class="v72-focus-header">
        <div>
          <h3>${html(summary.name)}</h3>
          <p class="small muted">РОП видит текущую нагрузку по задачам и состояние закреплённых SKU.</p>
        </div>
        <div class="quick-actions">
          <button class="quick-chip ${state.v72.employeeFocus === 'all' ? 'active' : ''}" type="button" data-v72-owner-focus="all">Все сотрудники</button>
          ${summary.name !== 'Все сотрудники' ? `<button class="quick-chip" type="button" data-v72-filter-owner="${html(summary.name)}">Фильтр в задачнике</button>` : ''}
        </div>
      </div>
      <div class="v72-focus-metrics">
        ${focusMetric('Активные задачи', fmt.int(summary.active), 'Текущий поток', summary.active ? 'info' : '')}
        ${focusMetric('Просроченные', fmt.int(summary.overdue), 'Требуют реакции РОПа', summary.overdue ? 'danger' : '')}
        ${focusMetric('Критичные', fmt.int(summary.critical), 'Высокий приоритет', summary.critical ? 'warn' : '')}
        ${focusMetric('Выполнено', fmt.int(summary.done), 'Закрытые задачи', '')}
        ${focusMetric('SKU на ведении', fmt.int(summary.skuCount), 'Закреплённый портфель', '')}
        ${focusMetric('Средний план', summary.avgPlan != null ? html(fmt.pct(summary.avgPlan)) : '—', 'По SKU с планом', '')}
        ${focusMetric('Отрицательная маржа', fmt.int(summary.negativeMargin), 'SKU в риске', summary.negativeMargin ? 'warn' : '')}
        ${focusMetric('SKU в работе', fmt.int(summary.toWork), 'Ниже плана / маржа-', summary.toWork ? 'warn' : '')}
      </div>
    `;
  }

  function renderArticleActivity(items) {
    if (!items.length) return '<div class="empty">Нет активных задач по выбранному сотруднику</div>';
    return `<div class="v72-article-stack">${items.slice(0, 12).map((item) => {
      const taskRows = item.tasks.slice(0, 4).map((task) => `
        <div class="v72-article-task">
          <div>
            <strong>${html(task.title)}</strong>
            <div class="small muted">${html(cleanTaskReason(task) || taskMeta(task).contour || 'Без контекста')}</div>
          </div>
          <div class="badge-stack">
            ${taskPriorityBadge(task)}
            ${taskStatusBadge(task)}
          </div>
        </div>
        <div class="small muted v72-article-action">${html(task.nextAction || 'Следующее действие не заполнено')}</div>
      `).join('');
      return `
        <article class="v72-article-card ${item.overdue ? 'overdue' : ''}">
          <div class="head">
            <div>
              <strong>${item.articleKey ? linkToSku(item.articleKey, item.label) : html(item.label)}</strong>
              <div class="muted small">${html(item.subtitle || 'Без названия')}</div>
            </div>
            <div class="badge-stack">
              ${badge(`${fmt.int(item.activeCount)} задач`, item.activeCount > 1 ? 'info' : '')}
              ${item.completion != null ? badge(`План ${fmt.pct(item.completion)}`, item.completion < 0.8 ? 'warn' : 'ok') : ''}
              ${item.negativeMargin ? badge('Маржа-', 'danger') : ''}
              ${item.toWork ? badge('В работе', 'warn') : ''}
              ${item.externalTraffic ? badge('Есть трафик', 'ok') : badge('Без трафика', '')}
            </div>
          </div>
          <div class="badge-stack" style="margin-top:8px">${item.owners.map((owner) => badge(owner, 'ok')).join('')}${item.contours.slice(0, 2).map((contour) => badge(contour, '')).join('')}</div>
          <div class="v72-article-task-list">${taskRows}</div>
        </article>
      `;
    }).join('')}</div>`;
  }

  function renderTaskLaneCard(task) {
    const sku = getSku(task.articleKey);
    const meta = taskMeta(task);
    const label = sku ? linkToSku(sku.articleKey, sku.article || sku.articleKey) : badge(meta.target || task.entityLabel || 'Объект', '');
    const context = cleanTaskReason(task);
    const controlHtml = task.source === 'auto'
      ? `<button class="btn small-btn" type="button" data-v72-take="${html(task.id)}">Взять в работу</button>`
      : `
        <div class="task-stage-actions">
          ${['new', 'in_progress', 'waiting_team', 'waiting_decision', 'done'].map((status) => `
            <button class="stage-btn ${task.status === status ? 'active' : ''}" type="button" data-v72-task-id="${html(task.id)}" data-v72-set="${status}">${html(TASK_STATUS_META[status].label)}</button>
          `).join('')}
        </div>
      `;
    return `
      <article class="v72-task-card ${isTaskOverdue(task) ? 'overdue' : ''}">
        <div class="head">
          <div>
            <strong>${html(task.title)}</strong>
            <div class="muted small" style="margin-top:4px">${label}</div>
          </div>
          ${taskStatusBadge(task)}
        </div>
        <div class="badge-stack" style="margin-top:10px">
          ${taskPriorityBadge(task)}
          ${taskTypeBadge(task)}
          ${taskPlatformBadge(task)}
          ${meta.source ? badge(meta.source, 'info') : ''}
          ${meta.contour ? badge(meta.contour, '') : ''}
          ${task.owner ? badge(task.owner, 'ok') : badge('Без owner', 'warn')}
        </div>
        ${meta.target && !task.articleKey ? `<div class="muted small" style="margin-top:8px">Привязка: ${html(meta.linkType)} · ${html(meta.target)}</div>` : ''}
        <div class="team-note" style="margin-top:10px">${html(task.nextAction || 'Следующее действие не заполнено')}</div>
        ${context ? `<div class="muted small" style="margin-top:8px">${html(context)}</div>` : ''}
        <div class="foot">
          <div class="meta-line"><span>${html(task.owner || 'Без owner')}</span><span>${html(task.due || 'Без срока')}</span></div>
          ${controlHtml}
        </div>
      </article>
    `;
  }

  async function setTaskStage(taskId, status) {
    const existing = state.storage.tasks.find((item) => item.id === taskId);
    if (existing) {
      await updateTaskStatus(taskId, status);
      return;
    }
    const autoTask = getAllTasks().find((item) => item.id === taskId && item.source === 'auto');
    if (!autoTask) return;
    await takeAutoTask(taskId);
    if (status !== 'in_progress') {
      const manual = state.storage.tasks.find((item) => item.source === 'manual' && item.title === autoTask.title && item.articleKey === autoTask.articleKey);
      if (manual) await updateTaskStatus(manual.id, status);
    }
  }

  function taskFormDefaults() {
    return {
      requestSource: 'РОП',
      requester: '',
      contour: 'ROP / поручения',
      linkType: 'SKU',
      platform: 'all',
      priority: 'medium',
      type: 'general',
      due: plusDays(3)
    };
  }

  renderControlCenter = function () {
    patchV72Chrome();
    const root = document.getElementById('view-control');
    const filtered = filteredTeamTasks();
    const summaries = ownerSummaryRows();
    const focusSummary = selectedEmployeeSummary(summaries) || aggregateFocusSummary(summaries);
    const focusItems = groupedArticleActivity(state.v72.employeeFocus === 'all' ? 'all' : state.v72.employeeFocus);
    const owners = ['all', ...ownerOptions(), 'Без owner'];
    const counts = {
      active: getAllTasks().filter(isTaskActive).length,
      overdue: getAllTasks().filter(isTaskOverdue).length,
      critical: getAllTasks().filter((task) => isTaskActive(task) && task.priority === 'critical').length,
      waiting: getAllTasks().filter((task) => task.status === 'waiting_decision').length,
      noOwner: getAllTasks().filter((task) => isTaskActive(task) && !task.owner).length,
      rop: getAllTasks().filter((task) => taskMeta(task).source === 'РОП').length,
      done: getAllTasks().filter((task) => task.status === 'done').length
    };
    const lanes = {
      new: filtered.filter((task) => task.status === 'new'),
      in_progress: filtered.filter((task) => task.status === 'in_progress'),
      waiting_team: filtered.filter((task) => task.status === 'waiting_team'),
      waiting_decision: filtered.filter((task) => task.status === 'waiting_decision')
    };
    const defaults = taskFormDefaults();
    const targets = allTaskTargets();
    const sourceStats = sourceSummary(getAllTasks()).slice(0, 8);
    const contourStats = contourSummary(getAllTasks()).slice(0, 8);

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Задачник команды и контроль РОПа</h2>
          <p>Задачи теперь ставятся как в Trello / Asana: кто поставил → кому назначили → какой приоритет → следующее действие → срок. Ниже — свод по менеджерам и по артикулам.</p>
        </div>
        <div class="quick-actions">
          <button class="quick-chip ${state.v72.taskQueue === 'active' ? 'active' : ''}" type="button" data-v72-queue="active">Активные</button>
          <button class="quick-chip ${state.v72.taskQueue === 'overdue' ? 'active' : ''}" type="button" data-v72-queue="overdue">Просрочено</button>
          <button class="quick-chip ${state.v72.taskQueue === 'critical' ? 'active' : ''}" type="button" data-v72-queue="critical">Критичные</button>
          <button class="quick-chip ${state.v72.taskQueue === 'waiting_decision' ? 'active' : ''}" type="button" data-v72-queue="waiting_decision">Ждут решения</button>
          <button class="quick-chip ${state.v72.taskQueue === 'no_owner' ? 'active' : ''}" type="button" data-v72-queue="no_owner">Без owner</button>
        </div>
      </div>

      <div class="kpi-strip">
        <div class="mini-kpi"><span>Активные</span><strong>${fmt.int(counts.active)}</strong></div>
        <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(counts.overdue)}</strong></div>
        <div class="mini-kpi warn"><span>Критичные</span><strong>${fmt.int(counts.critical)}</strong></div>
        <div class="mini-kpi warn"><span>Ждут решения</span><strong>${fmt.int(counts.waiting)}</strong></div>
        <div class="mini-kpi"><span>От РОПов</span><strong>${fmt.int(counts.rop)}</strong></div>
        <div class="mini-kpi"><span>Сделано</span><strong>${fmt.int(counts.done)}</strong></div>
      </div>

      <div class="v72-task-shell">
        <aside class="v72-task-side">
          <section class="card">
            <div class="section-subhead">
              <div>
                <h3>Поставить задачу</h3>
                <p class="small muted">РОП выбирает сотрудника, ставит приоритет и цепляет задачу к SKU, кластеру, складу или встрече.</p>
              </div>
              ${badge(state.team.mode === 'ready' ? 'синхрон' : 'локально', state.team.mode === 'ready' ? 'ok' : 'warn')}
            </div>
            <form id="v72TaskForm" class="v72-task-form">
              <div class="field-group">
                <label>Источник</label>
                <select name="requestSource">${V72_TASK_SOURCES.map((item) => `<option value="${html(item)}" ${item === defaults.requestSource ? 'selected' : ''}>${html(item)}</option>`).join('')}</select>
              </div>
              <div class="field-group">
                <label>Кто поставил</label>
                <input name="requester" placeholder="Имя / роль" value="${html(defaults.requester)}">
              </div>
              <div class="field-group field-span-2">
                <label>Контур / встреча</label>
                <select name="contour">${V72_CONTOURS.map((item) => `<option value="${html(item)}" ${item === defaults.contour ? 'selected' : ''}>${html(item)}</option>`).join('')}</select>
              </div>
              <div class="field-group">
                <label>Привязка</label>
                <select name="linkType">${V72_LINK_TYPES.map((item) => `<option value="${html(item)}">${html(item)}</option>`).join('')}</select>
              </div>
              <div class="field-group field-span-2">
                <label>SKU / кластер / склад / документ</label>
                <input list="v72TaskTargets" name="target" placeholder="Начни вводить объект" required>
                <datalist id="v72TaskTargets">${targets.map((item) => `<option value="${html(item.value)}">${html(item.label)}</option>`).join('')}</datalist>
              </div>
              <div class="field-group field-span-3">
                <label>Название задачи</label>
                <input name="title" placeholder="Что именно нужно сделать" required>
              </div>
              <div class="field-group">
                <label>Кому</label>
                <input list="v72OwnerList" name="owner" placeholder="Сотрудник" required>
                <datalist id="v72OwnerList">${ownerOptions().map((name) => `<option value="${html(name)}"></option>`).join('')}</datalist>
              </div>
              <div class="field-group">
                <label>Тип</label>
                <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${html(value)}">${html(label)}</option>`).join('')}</select>
              </div>
              <div class="field-group">
                <label>Площадка</label>
                <select name="platform">
                  <option value="all">Все площадки</option>
                  <option value="wb">WB</option>
                  <option value="ozon">Ozon</option>
                  <option value="wb+ozon">WB + Ozon</option>
                </select>
              </div>
              <div class="field-group">
                <label>Приоритет</label>
                <select name="priority">
                  <option value="low">Низкий</option>
                  <option value="medium" selected>Средний</option>
                  <option value="high">Высокий</option>
                  <option value="critical">Критично</option>
                </select>
              </div>
              <div class="field-group">
                <label>Срок</label>
                <input name="due" type="date" value="${defaults.due}">
              </div>
              <div class="field-group field-span-3">
                <label>Следующее действие</label>
                <textarea name="nextAction" rows="3" placeholder="Что человек должен сделать и по какому критерию считаем готовым" required></textarea>
              </div>
              <div class="field-group field-span-3">
                <label>Контекст / блокер</label>
                <textarea name="reason" rows="3" placeholder="Почему задача появилась и что важно не потерять"></textarea>
              </div>
              <div class="field-group field-span-3 task-submit-row">
                <button class="btn primary" type="submit">Поставить задачу</button>
              </div>
            </form>
          </section>

          <section class="card">
            <div class="section-subhead"><div><h3>Фильтры</h3><p class="small muted">Срез по owner, источнику, контуру и приоритету.</p></div></div>
            <div class="v72-filter-stack">
              <input id="v72TaskSearch" placeholder="Поиск по задаче, SKU, сотруднику, контуру…" value="${html(state.v72.taskSearch)}">
              <select id="v72TaskOwnerFilter">${owners.map((item) => `<option value="${html(item)}" ${state.v72.taskOwner === item ? 'selected' : ''}>${html(item === 'all' ? 'Все owner' : item)}</option>`).join('')}</select>
              <select id="v72TaskPriorityFilter">
                <option value="all">Все приоритеты</option>
                ${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${html(value)}" ${state.v72.taskPriority === value ? 'selected' : ''}>${html(meta.label)}</option>`).join('')}
              </select>
              <select id="v72TaskSourceFilter"><option value="all">Все источники</option>${V72_TASK_SOURCES.map((item) => `<option value="${html(item)}" ${state.v72.taskSource === item ? 'selected' : ''}>${html(item)}</option>`).join('')}</select>
              <select id="v72TaskContourFilter"><option value="all">Все контуры</option>${V72_CONTOURS.map((item) => `<option value="${html(item)}" ${state.v72.taskContour === item ? 'selected' : ''}>${html(item)}</option>`).join('')}</select>
            </div>
          </section>

          <section class="card">
            <div class="section-subhead"><div><h3>Кто ставит задачи</h3><p class="small muted">Полезно для контроля РОПов и смежных команд.</p></div></div>
            <div class="v72-stat-list">${sourceStats.length ? sourceStats.map((item) => `<button class="stat-row" type="button" data-v72-source="${html(item.label)}"><span>${html(item.label)}</span><strong>${fmt.int(item.count)}</strong></button>`).join('') : '<div class="empty">Пока пусто</div>'}</div>
          </section>

          <section class="card">
            <div class="section-subhead"><div><h3>По контурам</h3><p class="small muted">Задачи можно привязывать к Weekly, Demand, PMR и ad hoc-поручениям.</p></div></div>
            <div class="v72-stat-list">${contourStats.length ? contourStats.map((item) => `<button class="stat-row" type="button" data-v72-contour="${html(item.label)}"><span>${html(item.label)}</span><strong>${fmt.int(item.count)}</strong></button>`).join('') : '<div class="empty">Пока пусто</div>'}</div>
          </section>
        </aside>

        <section class="v72-task-board">
          <div class="v72-board-grid">
            <div class="card v72-lane">
              <div class="section-subhead"><div><h3>Новые</h3><p class="small muted">Новые поручения и сигналы.</p></div>${badge(fmt.int(lanes.new.length), lanes.new.length ? 'warn' : 'ok')}</div>
              <div class="v72-lane-stack">${lanes.new.length ? lanes.new.map(renderTaskLaneCard).join('') : '<div class="empty">Пусто</div>'}</div>
            </div>
            <div class="card v72-lane">
              <div class="section-subhead"><div><h3>В работе</h3><p class="small muted">То, что сотрудники уже двигают.</p></div>${badge(fmt.int(lanes.in_progress.length), lanes.in_progress.length ? 'info' : 'ok')}</div>
              <div class="v72-lane-stack">${lanes.in_progress.length ? lanes.in_progress.map(renderTaskLaneCard).join('') : '<div class="empty">Пусто</div>'}</div>
            </div>
            <div class="card v72-lane">
              <div class="section-subhead"><div><h3>Ждут команду</h3><p class="small muted">Нужен другой отдел или входные.</p></div>${badge(fmt.int(lanes.waiting_team.length), lanes.waiting_team.length ? 'warn' : 'ok')}</div>
              <div class="v72-lane-stack">${lanes.waiting_team.length ? lanes.waiting_team.map(renderTaskLaneCard).join('') : '<div class="empty">Пусто</div>'}</div>
            </div>
            <div class="card v72-lane">
              <div class="section-subhead"><div><h3>Ждут решения</h3><p class="small muted">Эскалации к бренд-лиду / Виктору.</p></div>${badge(fmt.int(lanes.waiting_decision.length), lanes.waiting_decision.length ? 'danger' : 'ok')}</div>
              <div class="v72-lane-stack">${lanes.waiting_decision.length ? lanes.waiting_decision.map(renderTaskLaneCard).join('') : '<div class="empty">Пусто</div>'}</div>
            </div>
          </div>

          <div class="team-strip v72-summary-strip">
            <div class="card v72-manager-summary-card">
              <div class="section-subhead">
                <div>
                  <h3>Свод по сотрудникам</h3>
                  <p class="small muted">РОП видит нагрузку менеджеров: задачи, просрочку, выполнение плана и проблемные SKU.</p>
                </div>
                ${badge(`${fmt.int(summaries.length)} чел.`, summaries.length ? 'info' : '')}
              </div>
              ${renderEmployeeSummaryTable(summaries)}
            </div>
            <div class="card v72-focus-card">
              ${renderFocusHeader(focusSummary)}
              ${renderArticleActivity(focusItems)}
            </div>
          </div>
        </section>
      </div>
    `;

    const form = root.querySelector('#v72TaskForm');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      try {
        await createTeamTask({
          requestSource: formData.get('requestSource'),
          requester: formData.get('requester'),
          contour: formData.get('contour'),
          linkType: formData.get('linkType'),
          target: formData.get('target'),
          title: formData.get('title'),
          owner: formData.get('owner'),
          type: formData.get('type'),
          platform: formData.get('platform'),
          priority: formData.get('priority'),
          due: formData.get('due'),
          nextAction: formData.get('nextAction'),
          reason: formData.get('reason')
        });
        form.reset();
        renderControlCenter();
        rerenderCurrentView();
      } catch (error) {
        alert(error.message || 'Не удалось поставить задачу');
      }
    });

    root.querySelector('#v72TaskSearch')?.addEventListener('input', (event) => {
      state.v72.taskSearch = event.target.value;
      renderControlCenter();
    });
    root.querySelector('#v72TaskOwnerFilter')?.addEventListener('change', (event) => {
      state.v72.taskOwner = event.target.value;
      if (event.target.value !== 'all' && event.target.value !== 'Без owner') state.v72.employeeFocus = event.target.value;
      renderControlCenter();
    });
    root.querySelector('#v72TaskPriorityFilter')?.addEventListener('change', (event) => {
      state.v72.taskPriority = event.target.value;
      renderControlCenter();
    });
    root.querySelector('#v72TaskSourceFilter')?.addEventListener('change', (event) => {
      state.v72.taskSource = event.target.value;
      renderControlCenter();
    });
    root.querySelector('#v72TaskContourFilter')?.addEventListener('change', (event) => {
      state.v72.taskContour = event.target.value;
      renderControlCenter();
    });
    root.querySelectorAll('[data-v72-queue]').forEach((btn) => btn.addEventListener('click', () => {
      state.v72.taskQueue = btn.dataset.v72Queue || 'active';
      renderControlCenter();
    }));
    root.querySelectorAll('[data-v72-source]').forEach((btn) => btn.addEventListener('click', () => {
      state.v72.taskSource = btn.dataset.v72Source || 'all';
      renderControlCenter();
    }));
    root.querySelectorAll('[data-v72-contour]').forEach((btn) => btn.addEventListener('click', () => {
      state.v72.taskContour = btn.dataset.v72Contour || 'all';
      renderControlCenter();
    }));
    root.querySelectorAll('[data-v72-owner-focus]').forEach((btn) => btn.addEventListener('click', () => {
      state.v72.employeeFocus = btn.dataset.v72OwnerFocus || 'all';
      if (state.v72.employeeFocus === 'all') state.v72.taskOwner = 'all';
      renderControlCenter();
    }));
    root.querySelectorAll('[data-v72-filter-owner]').forEach((btn) => btn.addEventListener('click', () => {
      state.v72.taskOwner = btn.dataset.v72FilterOwner || 'all';
      state.v72.employeeFocus = btn.dataset.v72FilterOwner || 'all';
      renderControlCenter();
    }));
    root.querySelectorAll('[data-v72-set]').forEach((btn) => btn.addEventListener('click', async () => {
      await setTaskStage(btn.dataset.v72TaskId, btn.dataset.v72Set);
    }));
    root.querySelectorAll('[data-v72-take]').forEach((btn) => btn.addEventListener('click', async () => {
      await takeAutoTask(btn.dataset.v72Take);
    }));
  };

  const baseRerenderCurrentView = rerenderCurrentView;
  rerenderCurrentView = function () {
    patchV72Chrome();
    baseRerenderCurrentView();
  };

  document.addEventListener('DOMContentLoaded', patchV72Chrome);
  const adminToggle = document.getElementById('toggleAdminBarBtn');
  if (adminToggle && !adminToggle.dataset.v72Bound) {
    adminToggle.dataset.v72Bound = '1';
    adminToggle.addEventListener('click', () => {
      state.v72.adminVisible = !adminUiEnabled();
      syncAdminVisibility();
      try { updateSyncBadge(); } catch (error) {}
    });
  }
  patchV72Chrome();
  try { updateSyncBadge(); } catch (error) {}
  try { rerenderCurrentView(); } catch (error) { console.error(error); }
})();
