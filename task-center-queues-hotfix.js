(function () {
  if (window.__ALTEA_TASK_CENTER_QUEUES_HOTFIX_20260417__) return;
  window.__ALTEA_TASK_CENTER_QUEUES_HOTFIX_20260417__ = true;

  const WORKSTREAM_META = {
    all: {
      label: 'Все задачи',
      chip: 'Все контуры',
      description: 'Полный срез задачника без разбиения по РОПам.',
      kind: ''
    },
    ozon: {
      label: 'РОП Ozon',
      chip: 'Ozon РОП',
      description: 'Отдельный операционный контур по Ozon.',
      kind: 'info'
    },
    wb: {
      label: 'РОП WB',
      chip: 'WB РОП',
      description: 'Отдельный контур по Wildberries.',
      kind: 'warn'
    },
    retail: {
      label: 'ЯМ / Летуаль / Магнит / ЗЯ',
      chip: 'ЯМ / сети',
      description: 'Яндекс Маркет, Летуаль, Магнит и Золотое Яблоко одним РОПом.',
      kind: 'ok'
    },
    cross: {
      label: 'Общий контур',
      chip: 'Общий контур',
      description: 'Owner, решения и кросс-площадочные задачи в одном слое.',
      kind: ''
    }
  };

  const WORKSTREAM_ORDER = ['ozon', 'wb', 'retail', 'cross'];
  const FILTER_ORDER = ['all', ...WORKSTREAM_ORDER];
  const TYPE_FILTER_ORDER = ['all', 'price_margin', 'supply', 'content', 'traffic', 'launch', 'returns', 'assignment', 'general'];

  function taskTypeKind(type) {
    if (type === 'price_margin') return 'danger';
    if (type === 'supply' || type === 'assignment') return 'warn';
    if (type === 'content' || type === 'traffic' || type === 'launch') return 'info';
    if (type === 'returns') return 'ok';
    return '';
  }

  function normalizeTaskPlatform(value, contextText = '') {
    const raw = String(value || '').trim().toLowerCase();
    const text = `${raw} ${String(contextText || '').trim().toLowerCase()}`;

    if (raw === 'all') return 'all';
    if (['cross', 'common', 'shared', 'general'].includes(raw)) return 'cross';
    if (['wb', 'wildberries', 'вб'].includes(raw)) return 'wb';
    if (['ozon', 'озон'].includes(raw)) return 'ozon';
    if (['wb+ozon', 'wb + ozon', 'wb_ozon', 'wb-ozon'].includes(raw)) return 'wb+ozon';
    if (['retail', 'federal', 'network', 'marketplaces_plus', 'marketplace_plus'].includes(raw)) return 'retail';

    if (/яндекс|я[.\s-]?маркет|yandex|letu?al|л[еэ]туал|л[еэ]туаль|магнит|golden apple|золот[а-я\s-]*яблок/.test(text)) return 'retail';
    if (/(^|\W)wb($|\W)|wildberries|вб/.test(text)) return 'wb';
    if (/ozon|озон/.test(text)) return 'ozon';
    return 'all';
  }

  function normalizeControlWorkstreamFilter(value) {
    const raw = String(value || 'all').trim().toLowerCase();
    if (raw === 'all') return 'all';
    const normalized = normalizeTaskPlatform(raw);
    if (normalized === 'wb+ozon') return 'cross';
    return WORKSTREAM_ORDER.includes(normalized) ? normalized : 'all';
  }

  function workstreamMeta(key) {
    return WORKSTREAM_META[key] || WORKSTREAM_META.cross;
  }

  function controlWorkstreamKey(task, sku = null) {
    const text = `${task?.title || ''} ${task?.nextAction || ''} ${task?.reason || ''} ${task?.entityLabel || ''}`;
    const platform = normalizeTaskPlatform(task?.platform, text);

    if (platform === 'wb') return 'wb';
    if (platform === 'ozon') return 'ozon';
    if (platform === 'retail') return 'retail';
    if (platform === 'wb+ozon' || platform === 'cross' || platform === 'all') return 'cross';
    if (sku?.flags?.toWorkWB && !sku?.flags?.toWorkOzon) return 'wb';
    if (sku?.flags?.toWorkOzon && !sku?.flags?.toWorkWB) return 'ozon';
    return 'cross';
  }

  function buildFilteredTasks(options = {}) {
    const filters = state.controlFilters || {};
    const selectedWorkstream = normalizeControlWorkstreamFilter(filters.platform);
    const search = String(filters.search || '').trim().toLowerCase();

    return getAllTasks().filter((task) => {
      const sku = getSku(task.articleKey);
      const workstream = workstreamMeta(controlWorkstreamKey(task, sku));
      const hay = [
        task.title,
        task.nextAction,
        task.reason,
        task.owner,
        task.articleKey,
        sku?.article,
        sku?.name,
        sku?.category,
        workstream.label,
        workstream.chip
      ].filter(Boolean).join(' ').toLowerCase();

      if (search && !hay.includes(search)) return false;
      if (filters.owner !== 'all' && (task.owner || 'Без owner') !== filters.owner) return false;
      if (filters.status === 'active' && !isTaskActive(task)) return false;
      if (filters.status !== 'active' && filters.status !== 'all' && task.status !== filters.status) return false;
      if (!options.ignoreType && filters.type !== 'all' && task.type !== filters.type) return false;
      if (!options.ignorePlatform && selectedWorkstream !== 'all' && controlWorkstreamKey(task, sku) !== selectedWorkstream) return false;
      if (filters.source === 'manual' && task.source === 'auto') return false;
      if (filters.source === 'auto' && task.source !== 'auto') return false;
      if (!options.ignorePriority && filters.priority === 'critical' && task.priority !== 'critical') return false;
      if (filters.horizon === 'overdue' && !isTaskOverdue(task)) return false;
      if (filters.horizon === 'today' && task.due !== todayIso()) return false;
      if (filters.horizon === 'week' && (!task.due || task.due > plusDays(7))) return false;
      if (filters.horizon === 'no_owner' && task.owner) return false;
      return true;
    });
  }

  function buildTypeSummaries(tasks) {
    const activeTasks = tasks.filter(isTaskActive);
    return TYPE_FILTER_ORDER.map((type) => {
      if (type === 'all') {
        return { key: 'all', label: 'Все типы', count: activeTasks.length, kind: '' };
      }
      return {
        key: type,
        label: TASK_TYPE_META[type] || TASK_TYPE_META.general,
        count: activeTasks.filter((task) => task.type === type).length,
        kind: taskTypeKind(type)
      };
    });
  }

  function buildWorkstreamSummary(tasks, key) {
    const grouped = key === 'all'
      ? sortTasks(tasks)
      : sortTasks(tasks.filter((task) => controlWorkstreamKey(task, getSku(task.articleKey)) === key));
    const active = grouped.filter(isTaskActive);
    const owners = [...new Set(active.map((task) => task.owner || 'Без owner'))].slice(0, 3);
    return {
      key,
      meta: workstreamMeta(key),
      tasks: grouped,
      activeCount: active.length,
      overdueCount: active.filter(isTaskOverdue).length,
      criticalCount: active.filter((task) => task.priority === 'critical').length,
      waitingCount: active.filter((task) => task.status === 'waiting_decision').length,
      ownerPreview: owners,
      typeCount: new Set(active.map((task) => task.type)).size
    };
  }

  function splitWorkstreamQueues(summary) {
    const activePool = summary.tasks.filter(isTaskActive);
    const pool = sortTasks(activePool.length ? activePool : summary.tasks);
    const focus = [];
    let manual = [];
    let auto = [];
    const focusIds = new Set();

    pool.forEach((task) => {
      const urgent = isTaskOverdue(task)
        || task.priority === 'critical'
        || task.status === 'waiting_decision'
        || (task.due && task.due <= plusDays(2));
      if (urgent && focus.length < 4) {
        focus.push(task);
        focusIds.add(task.id);
      }
    });

    manual = pool.filter((task) => !focusIds.has(task.id) && task.source !== 'auto');
    auto = pool.filter((task) => !focusIds.has(task.id) && task.source === 'auto');

    if (!focus.length) {
      const fallback = [...manual, ...auto].slice(0, 4);
      fallback.forEach((task) => focusIds.add(task.id));
      focus.push(...fallback);
      manual = manual.filter((task) => !focusIds.has(task.id));
      auto = auto.filter((task) => !focusIds.has(task.id));
    }

    return { focus, manual, auto };
  }

  function renderWorkstreamCard(summary, selectedKey) {
    const isSelected = selectedKey === summary.key;
    const hint = summary.ownerPreview.length
      ? `${summary.ownerPreview.join(' · ')} · ${fmt.int(summary.typeCount)} типов задач`
      : summary.meta.description;

    return `
      <button
        type="button"
        class="card kpi"
        data-control-workstream="${escapeHtml(summary.key)}"
        style="text-align:left;cursor:pointer;${isSelected ? 'box-shadow: inset 0 0 0 1px rgba(212, 164, 74, 0.46);border-color: rgba(212, 164, 74, 0.38);' : ''}"
      >
        <div class="label">${escapeHtml(summary.meta.label)}</div>
        <div class="value">${fmt.int(summary.activeCount)}</div>
        <div class="hint">${escapeHtml(hint)}</div>
        <div class="badge-stack" style="margin-top:10px">
          ${badge(`${fmt.int(summary.overdueCount)} проср.`, summary.overdueCount ? 'danger' : '')}
          ${badge(`${fmt.int(summary.criticalCount)} крит.`, summary.criticalCount ? 'warn' : '')}
          ${summary.waitingCount ? badge(`${fmt.int(summary.waitingCount)} ждут решения`, 'info') : badge('в контуре')}
        </div>
      </button>
    `;
  }

  function renderQueuePanel(title, tasks, emptyText, kind) {
    const visible = tasks.slice(0, 4);
    const hiddenCount = Math.max(0, tasks.length - visible.length);
    return `
      <div class="card" style="background:rgba(255,255,255,0.015);padding:14px">
        <div class="section-subhead">
          <div>
            <h4 style="margin:0">${escapeHtml(title)}</h4>
            <p class="small muted" style="margin-top:4px">${escapeHtml(emptyText)}</p>
          </div>
          ${badge(`${fmt.int(tasks.length)} шт.`, kind)}
        </div>
        <div class="stack" style="margin-top:12px">
          ${visible.length ? visible.map(renderMiniTask).join('') : '<div class="empty">Пусто в этой очереди</div>'}
        </div>
        ${hiddenCount ? `<div class="muted small" style="margin-top:10px">Ещё ${fmt.int(hiddenCount)} задач под этот контур и фильтр.</div>` : ''}
      </div>
    `;
  }

  function renderWorkstreamSection(summary) {
    const queues = splitWorkstreamQueues(summary);
    const typeSummary = buildTypeSummaries(summary.tasks)
      .filter((item) => item.key === 'all' || item.count)
      .slice(1)
      .map((item) => badge(`${item.label}: ${fmt.int(item.count)}`, item.kind))
      .join('');
    const ownerLine = summary.ownerPreview.length
      ? `Ключевые owner: ${summary.ownerPreview.join(' · ')}`
      : 'Owner пока не закреплены или контур заполнен только авто-сигналами.';

    return `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(summary.meta.label)}</h3>
            <p class="small muted">${escapeHtml(summary.meta.description)}</p>
          </div>
          <div class="badge-stack">
            ${badge(`${fmt.int(summary.activeCount)} активн.`, summary.activeCount ? summary.meta.kind : '')}
            ${summary.overdueCount ? badge(`${fmt.int(summary.overdueCount)} проср.`, 'danger') : ''}
            ${summary.criticalCount ? badge(`${fmt.int(summary.criticalCount)} крит.`, 'warn') : ''}
          </div>
        </div>
        <div class="muted small" style="margin-top:6px">${escapeHtml(ownerLine)}</div>
        <div class="badge-stack" style="margin-top:10px;flex-wrap:wrap">${typeSummary || badge('Нет активных типов')}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:14px">
          ${renderQueuePanel('Сегодня в фокусе', queues.focus, 'Просроченное, критичное и то, что нужно дожать сейчас.', 'warn')}
          ${renderQueuePanel('Ручной контур', queues.manual, 'Ручные задачи и реальные договорённости команды.', 'ok')}
          ${renderQueuePanel('Авто-сигналы', queues.auto, 'Сигналы портала, которые ещё не переведены в ручную работу.', 'info')}
        </div>
      </div>
    `;
  }

  function renderTaskComposer() {
    const owners = ownerOptions();
    const ownerOptionsHtml = owners.map((owner) => `<option value="${escapeHtml(owner)}"></option>`).join('');
    const taskTypes = Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('');
    const priorities = Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}">${escapeHtml(meta.label)}</option>`).join('');
    const skuOptions = (Array.isArray(state.skus) ? state.skus : [])
      .slice()
      .sort((a, b) => String(a.article || a.articleKey || '').localeCompare(String(b.article || b.articleKey || ''), 'ru'))
      .map((sku) => {
        const label = sku.article || sku.articleKey || 'SKU';
        const name = sku.name ? ` · ${sku.name}` : '';
        return `<option value="${escapeHtml(label)}">${escapeHtml(`${label}${name}`)}</option>`;
      }).join('');

    return `
      <div class="card" style="margin-top:14px" data-task-center-composer>
        <div class="section-subhead">
          <div>
            <h3>Поставить задачу</h3>
            <p class="small muted">Быстрая постановка задачи прямо из задачника, уже с выбором нужного РОПа.</p>
          </div>
          ${badge('task queues', 'info')}
        </div>
        <form id="taskCenterComposerForm" class="form-grid compact" style="margin-top:12px">
          <input list="taskCenterSkuList" name="articleKey" placeholder="Артикул / SKU" required>
          <datalist id="taskCenterSkuList">${skuOptions}</datalist>
          <input name="title" placeholder="Что делаем" required>
          <select name="type">${taskTypes}</select>
          <select name="priority">${priorities}</select>
          <select name="platform">
            <option value="cross">Общий контур</option>
            <option value="ozon">РОП Ozon</option>
            <option value="wb">РОП WB</option>
            <option value="retail">ЯМ / Летуаль / Магнит / ЗЯ</option>
          </select>
          <input name="owner" list="taskCenterOwnerList" placeholder="Owner / кто делает">
          <datalist id="taskCenterOwnerList">${ownerOptionsHtml}</datalist>
          <input name="due" type="date" value="${plusDays(3)}">
          <input name="nextAction" placeholder="Следующее действие / комментарий">
          <button class="btn" type="submit">Создать задачу</button>
        </form>
        <div class="muted small" style="margin-top:8px">Если артикул совпадает с SKU в портале, задача сразу привяжется к карточке.</div>
      </div>
    `;
  }

  function bindTaskComposer(root) {
    const form = root.querySelector('#taskCenterComposerForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const rawArticle = String(data.get('articleKey') || '').trim();
      const matchedSku = (Array.isArray(state.skus) ? state.skus : []).find((sku) => {
        const article = String(sku.article || '').trim();
        const key = String(sku.articleKey || '').trim();
        return rawArticle === article || rawArticle === key;
      });
      const articleKey = matchedSku?.articleKey || rawArticle;
      if (!articleKey) return;

      await createManualTask({
        articleKey,
        title: String(data.get('title') || '').trim(),
        type: String(data.get('type') || 'general'),
        priority: String(data.get('priority') || 'medium'),
        platform: String(data.get('platform') || 'cross'),
        owner: String(data.get('owner') || '').trim(),
        due: String(data.get('due') || '').trim(),
        nextAction: String(data.get('nextAction') || '').trim()
      });

      form.reset();
      const dueInput = form.querySelector('input[name="due"]');
      if (dueInput) dueInput.value = plusDays(3);
      renderControlCenter();
      if (typeof setAppError === 'function') {
        setAppError('Задача добавлена в рабочий контур.');
        window.setTimeout(() => {
          if (typeof setAppError === 'function' && !(state.runtimeErrors || []).length) setAppError('');
        }, 1800);
      }
    });
  }

  renderControlCenter = function renderControlCenterWithQueues() {
    const root = document.getElementById('view-control');
    state.controlFilters.platform = normalizeControlWorkstreamFilter(state.controlFilters.platform);
    state.controlFilters.priority = state.controlFilters.priority || 'all';

    const tasks = buildFilteredTasks();
    const baseTasks = buildFilteredTasks({ ignorePlatform: true });
    const typeScopeTasks = buildFilteredTasks({ ignoreType: true });
    const selectedWorkstream = state.controlFilters.platform;
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
    const workstreamSummaries = FILTER_ORDER.map((key) => buildWorkstreamSummary(baseTasks, key));
    const sectionKeys = selectedWorkstream === 'all'
      ? WORKSTREAM_ORDER.filter((key) => workstreamSummaries.find((item) => item.key === key)?.tasks.length)
      : [selectedWorkstream];
    const workstreamCards = workstreamSummaries.map((summary) => renderWorkstreamCard(summary, selectedWorkstream)).join('');
    const activePreset = state.controlFilters.priority === 'critical'
      ? 'critical'
      : state.controlFilters.horizon === 'overdue'
        ? 'overdue'
        : state.controlFilters.horizon === 'no_owner'
          ? 'no_owner'
          : 'active';
    const typeChips = buildTypeSummaries(typeScopeTasks)
      .filter((item) => item.key === 'all' || item.count || state.controlFilters.type === item.key)
      .map((item) => {
        const isSelected = state.controlFilters.type === item.key || (item.key === 'all' && state.controlFilters.type === 'all');
        return `
          <button
            type="button"
            class="quick-chip"
            data-control-type="${escapeHtml(item.key)}"
            style="${isSelected ? 'box-shadow: inset 0 0 0 1px rgba(212, 164, 74, 0.46);border-color: rgba(212, 164, 74, 0.42);' : ''}"
          >
            ${escapeHtml(item.label)} · ${fmt.int(item.count)}
          </button>
        `;
      }).join('');
    const board = sectionKeys.length
      ? sectionKeys.map((key) => renderWorkstreamSection(workstreamSummaries.find((item) => item.key === key))).join('')
      : '<div class="card" style="margin-top:14px"><div class="empty">Нет задач под текущий фильтр.</div></div>';

    const counts = {
      active: tasks.filter(isTaskActive).length,
      overdue: tasks.filter(isTaskOverdue).length,
      noOwner: tasks.filter((task) => isTaskActive(task) && !task.owner).length,
      waiting: tasks.filter((task) => task.status === 'waiting_decision').length,
      critical: tasks.filter((task) => isTaskActive(task) && task.priority === 'critical').length,
      auto: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length
    };
    const spotlightTasks = tasks.slice(0, 4);

    const assignHtml = unassignedSkus.length ? unassignedSkus.map((sku) => `
      <div class="assign-row">
        <div class="head">
          <div>
            <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
            <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
          </div>
          <div class="badge-stack">${scoreChip(sku.focusScore || 0)}${skuOperationalStatus(sku)}</div>
        </div>
        <div class="team-note">${escapeHtml(sku.focusReasons || 'Нужно просто закрепить owner и первый срок апдейта.')}</div>
        <div class="inline-form" style="margin-top:10px">
          <input class="inline-input" list="ownerOptionsList" data-owner-assign-input="${escapeHtml(sku.articleKey)}" placeholder="Кто владелец SKU">
          <input class="inline-input" data-owner-assign-role="${escapeHtml(sku.articleKey)}" placeholder="Роль / зона" value="Owner SKU">
          <button class="btn small-btn" type="button" data-save-owner="${escapeHtml(sku.articleKey)}">Закрепить</button>
        </div>
      </div>
    `).join('') : '<div class="empty">Все SKU уже закреплены</div>';

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
          <div class="muted small">${escapeHtml(item.decision || 'Нужно зафиксировать решение')}</div>
          <div class="meta-line" style="margin-top:8px"><span class="muted small">Срок ${escapeHtml(item.due || '—')}</span><span class="muted small">${escapeHtml(item.createdBy || 'Команда')}</span></div>
        </div>
      `;
    }).join('') : '<div class="empty">Нет решений в ожидании</div>';

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Контур задач по РОПам</h2>
          <p>Разбиваем рабочий слой на Ozon, WB, ЯМ / сети и общий межкомандный контур. Внутри каждого РОПа очереди уже разложены на фокус дня, ручную работу и авто-сигналы.</p>
        </div>
        <div class="quick-actions">
          <button class="quick-chip" data-control-preset="active" style="${activePreset === 'active' ? 'box-shadow: inset 0 0 0 1px rgba(212, 164, 74, 0.46);border-color: rgba(212, 164, 74, 0.42);' : ''}">Активные</button>
          <button class="quick-chip" data-control-preset="overdue" style="${activePreset === 'overdue' ? 'box-shadow: inset 0 0 0 1px rgba(212, 164, 74, 0.46);border-color: rgba(212, 164, 74, 0.42);' : ''}">Просроченные</button>
          <button class="quick-chip" data-control-preset="critical" style="${activePreset === 'critical' ? 'box-shadow: inset 0 0 0 1px rgba(212, 164, 74, 0.46);border-color: rgba(212, 164, 74, 0.42);' : ''}">Критичные</button>
          <button class="quick-chip" data-control-preset="no_owner" style="${activePreset === 'no_owner' ? 'box-shadow: inset 0 0 0 1px rgba(212, 164, 74, 0.46);border-color: rgba(212, 164, 74, 0.42);' : ''}">Без owner</button>
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

      <div class="grid cards" style="margin-top:14px">${workstreamCards}</div>

      <div class="control-filters">
        <input id="controlSearchInput" placeholder="Поиск по SKU, задаче, owner, контуру…" value="${escapeHtml(state.controlFilters.search)}">
        <select id="controlPlatformFilter">
          <option value="all" ${selectedWorkstream === 'all' ? 'selected' : ''}>Все контуры</option>
          <option value="ozon" ${selectedWorkstream === 'ozon' ? 'selected' : ''}>РОП Ozon</option>
          <option value="wb" ${selectedWorkstream === 'wb' ? 'selected' : ''}>РОП WB</option>
          <option value="retail" ${selectedWorkstream === 'retail' ? 'selected' : ''}>ЯМ / Летуаль / Магнит / ЗЯ</option>
          <option value="cross" ${selectedWorkstream === 'cross' ? 'selected' : ''}>Общий контур</option>
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
      <div class="badge-stack" style="margin-top:12px;flex-wrap:wrap">${typeChips}</div>

      ${renderTaskComposer()}
      ${board}

      <div class="team-strip">
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Командный контур и закрепление</h3>
              <p class="small muted">Отсюда быстро добиваем SKU без owner и держим общий контур в одном месте.</p>
            </div>
            ${badge(state.team.mode === 'ready' ? 'Supabase ready' : state.team.mode === 'local' ? 'local' : state.team.mode, state.team.mode === 'ready' ? 'ok' : state.team.mode === 'error' ? 'danger' : 'warn')}
          </div>
          <div class="team-note">${escapeHtml(state.team.note || 'Локальный режим')} · ${escapeHtml(teamMemberLabel())}</div>
          <datalist id="ownerOptionsList">${ownerSuggestions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
          <div class="assign-list" style="margin-top:12px">${assignHtml}</div>
        </div>
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Решения ждут подтверждения</h3>
              <p class="small muted">То, что руководитель или бренд-лид должны быстро зафиксировать.</p>
            </div>
            ${badge(`${fmt.int(waitingDecisions.length)} шт.`, waitingDecisions.length ? 'warn' : 'ok')}
          </div>
          <div class="decision-list">${decisionsHtml}</div>
        </div>
      </div>

      <div class="check-grid" style="margin-bottom:14px">
        <div class="card">
          <h3>Чек-лист контроля</h3>
          <div class="check-list">
            <div class="check-item"><strong>1.</strong><span>Закрыть просрочки и перенести сроки, если реально ждём другой отдел.</span></div>
            <div class="check-item"><strong>2.</strong><span>Проверить все задачи без owner и закрепить их.</span></div>
            <div class="check-item"><strong>3.</strong><span>Отдельно посмотреть критичные задачи по марже и цене.</span></div>
            <div class="check-item"><strong>4.</strong><span>По сетям и ЯМ держать отдельный трек, а не смешивать его с WB / Ozon.</span></div>
          </div>
        </div>
        <div class="card">
          <h3>Что здесь уже контролируем</h3>
          <div class="task-mini-grid">
            ${spotlightTasks.length ? spotlightTasks.map(renderMiniTask).join('') : '<div class="empty">Нет задач для экспресс-чека</div>'}
          </div>
        </div>
      </div>
    `;

    bindTaskComposer(root);
    root.querySelectorAll('[data-control-preset]').forEach((button) => button.addEventListener('click', () => {
      const preset = button.dataset.controlPreset || 'active';
      state.controlFilters.status = 'active';
      state.controlFilters.priority = 'all';
      state.controlFilters.horizon = 'all';
      if (preset === 'overdue') state.controlFilters.horizon = 'overdue';
      if (preset === 'critical') state.controlFilters.priority = 'critical';
      if (preset === 'no_owner') state.controlFilters.horizon = 'no_owner';
      renderControlCenter();
    }));
    root.querySelectorAll('[data-control-workstream]').forEach((button) => button.addEventListener('click', () => {
      state.controlFilters.platform = button.dataset.controlWorkstream;
      renderControlCenter();
    }));
    root.querySelectorAll('[data-control-type]').forEach((button) => button.addEventListener('click', () => {
      state.controlFilters.type = button.dataset.controlType || 'all';
      renderControlCenter();
    }));
    document.getElementById('controlSearchInput').addEventListener('input', (event) => { state.controlFilters.search = event.target.value; renderControlCenter(); });
    document.getElementById('controlPlatformFilter').addEventListener('change', (event) => { state.controlFilters.platform = event.target.value; renderControlCenter(); });
    document.getElementById('controlOwnerFilter').addEventListener('change', (event) => { state.controlFilters.owner = event.target.value; renderControlCenter(); });
    document.getElementById('controlStatusFilter').addEventListener('change', (event) => { state.controlFilters.status = event.target.value; if (event.target.value !== 'active') state.controlFilters.priority = 'all'; renderControlCenter(); });
    document.getElementById('controlTypeFilter').addEventListener('change', (event) => { state.controlFilters.type = event.target.value; renderControlCenter(); });
    document.getElementById('controlHorizonFilter').addEventListener('change', (event) => { state.controlFilters.horizon = event.target.value; if (event.target.value !== 'overdue' && event.target.value !== 'no_owner') state.controlFilters.priority = state.controlFilters.priority === 'critical' ? 'critical' : 'all'; renderControlCenter(); });
    document.getElementById('controlSourceFilter').addEventListener('change', (event) => { state.controlFilters.source = event.target.value; renderControlCenter(); });
    root.querySelectorAll('[data-save-owner]').forEach((button) => button.addEventListener('click', async () => {
      const articleKey = button.dataset.saveOwner;
      const ownerInput = root.querySelector(`[data-owner-assign-input="${articleKey}"]`);
      const roleInput = root.querySelector(`[data-owner-assign-role="${articleKey}"]`);
      await upsertOwnerAssignment({
        articleKey,
        ownerName: ownerInput?.value || '',
        ownerRole: roleInput?.value || 'Owner SKU',
        note: 'Закреплено из контрольного центра'
      });
      renderControlCenter();
    }));
  };

  window.setTimeout(() => {
    try {
      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      if (state.activeSku && typeof renderSkuModal === 'function') renderSkuModal(state.activeSku);
    } catch (error) {
      console.warn('[task-center-queues-hotfix]', error);
    }
  }, 220);
})();
