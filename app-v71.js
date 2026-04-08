
(function () {
  const taskRequestSources = ['Руководитель', 'РОП', 'WB', 'Ozon', 'Логистика', 'Маркетинг', 'Контент', 'Финансы', 'Внешний трафик'];
  state.v71 = Object.assign({
    logisticsPlatform: 'ozon',
    logisticsNode: '',
    logisticsArticle: '',
    taskQuickOwner: 'all'
  }, state.v71 || {});

  function escapeOrDash(value) {
    const raw = String(value || '').trim();
    return raw || '—';
  }

  function encodeTaskReason(reason, requestSource) {
    const parts = [];
    if (requestSource) parts.push(`SOURCE::${String(requestSource).trim()}`);
    const cleanReason = String(reason || '').trim();
    if (cleanReason) parts.push(cleanReason);
    return parts.join(' || ');
  }

  function decodeTaskReason(reason) {
    const text = String(reason || '').trim();
    if (!text) return { requestSource: '', reasonText: '' };
    const parts = text.split(' || ').map((item) => item.trim()).filter(Boolean);
    let requestSource = '';
    const reasonParts = [];
    for (const part of parts) {
      if (part.startsWith('SOURCE::')) requestSource = part.replace('SOURCE::', '').trim();
      else reasonParts.push(part);
    }
    return { requestSource, reasonText: reasonParts.join(' · ') };
  }

  function taskSourceBadge(task) {
    const parsed = decodeTaskReason(task.reason);
    return parsed.requestSource ? badge(parsed.requestSource, 'info') : '';
  }

  function taskReasonText(task) {
    return decodeTaskReason(task.reason).reasonText;
  }

  function platformBadge(platform) {
    return taskPlatformBadge({ platform });
  }

  const baseCreateManualTask = createManualTask;
  createManualTask = async function (payload) {
    if (!payload?.requestSource && !payload?.reason) {
      return baseCreateManualTask(payload);
    }
    const task = normalizeTask({
      id: uid('task'),
      source: 'manual',
      articleKey: payload.articleKey,
      title: String(payload.title || '').trim() || 'Новая задача',
      type: payload.type,
      priority: payload.priority,
      platform: payload.platform,
      owner: String(payload.owner || '').trim(),
      due: payload.due || plusDays(3),
      status: 'new',
      nextAction: String(payload.nextAction || '').trim(),
      reason: encodeTaskReason(payload.reason, payload.requestSource)
    }, 'manual');
    state.storage.tasks.unshift(task);
    saveLocalStorage();
    try {
      await persistTask(task);
    } catch (error) {
      console.error(error);
    }
  };

  renderTaskCard = function (task) {
    const sku = getSku(task.articleKey);
    const skuLabel = sku ? linkToSku(sku.articleKey, sku.article || sku.articleKey) : badge(task.articleKey || task.entityLabel || 'SKU');
    const reasonText = taskReasonText(task);
    const actionButtons = task.source === 'auto'
      ? `<button class="btn small-btn" data-take-task="${escapeHtml(task.id)}">Взять в работу</button>`
      : `
        <div class="task-stage-actions">
          ${['new','in_progress','waiting_team','waiting_decision','done'].map((status) => `
            <button class="stage-btn ${task.status === status ? 'active' : ''}" type="button" data-task-id="${escapeHtml(task.id)}" data-task-set="${status}">${escapeHtml(TASK_STATUS_META[status].label)}</button>
          `).join('')}
        </div>
      `;

    return `
      <div class="task-card ${isTaskOverdue(task) ? 'overdue' : ''}">
        <div class="head">
          <div>
            <div class="title">${escapeHtml(task.title)}</div>
            <div class="muted small" style="margin-top:4px">${skuLabel}</div>
          </div>
          ${taskStatusBadge(task)}
        </div>
        <div class="badge-stack" style="margin-top:10px">${taskPriorityBadge(task)}${taskTypeBadge(task)}${platformBadge(task.platform)}${taskSourceBadge(task)}</div>
        <div class="team-note" style="margin-top:10px">${escapeHtml(task.nextAction || 'Следующее действие пока не заполнено')}</div>
        ${reasonText ? `<div class="muted small" style="margin-top:8px">${escapeHtml(reasonText)}</div>` : ''}
        <div class="foot">
          <div class="meta-line"><span>${escapeHtml(task.owner || 'Без owner')}</span><span>${escapeHtml(task.due || '—')}</span></div>
          ${actionButtons}
        </div>
      </div>
    `;
  };

  function normalizeTaskSkuInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const direct = state.skus.find((sku) => sku.articleKey === raw || sku.article === raw);
    if (direct) return direct.articleKey;
    const normalized = raw.toLowerCase();
    const fuzzy = state.skus.find((sku) => [sku.articleKey, sku.article, sku.name].filter(Boolean).some((item) => String(item).toLowerCase() === normalized));
    return fuzzy?.articleKey || '';
  }

  function getV71ControlBuckets() {
    const tasks = filteredControlTasks();
    return {
      intake: tasks.filter((task) => task.status === 'new'),
      work: tasks.filter((task) => ['in_progress', 'waiting_team'].includes(task.status)),
      decisions: tasks.filter((task) => task.status === 'waiting_decision'),
      done: tasks.filter((task) => task.status === 'done').slice(0, 12)
    };
  }

  renderControlCenter = function () {
    const root = document.getElementById('view-control');
    const tasks = filteredControlTasks();
    const owners = [...new Set(getAllTasks().map((task) => task.owner || 'Без owner'))].sort((a, b) => a.localeCompare(b, 'ru'));
    const ownerSuggestions = ownerOptions();
    const buckets = getV71ControlBuckets();
    const waitingDecisions = [...(state.storage.decisions || [])]
      .filter((decision) => decision.status === 'waiting_decision' || decision.status === 'new')
      .sort((a, b) => (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31'))
      .slice(0, 8);
    const unassignedSkus = [...state.skus]
      .filter((sku) => !sku?.flags?.assigned)
      .sort((a, b) => (b.focusScore || 0) - (a.focusScore || 0) || monthRevenue(b) - monthRevenue(a))
      .slice(0, 8);

    const counts = {
      active: tasks.filter(isTaskActive).length,
      overdue: tasks.filter(isTaskOverdue).length,
      noOwner: tasks.filter((task) => isTaskActive(task) && !task.owner).length,
      waiting: tasks.filter((task) => task.status === 'waiting_decision').length,
      critical: tasks.filter((task) => isTaskActive(task) && task.priority === 'critical').length,
      auto: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length
    };

    const assignHtml = unassignedSkus.length ? unassignedSkus.map((sku) => `
      <div class="assign-row compact-v71">
        <div class="head">
          <div>
            <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
            <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
          </div>
          <div class="badge-stack">${skuOperationalStatus(sku)}${scoreChip(sku.focusScore || 0)}</div>
        </div>
        <div class="team-note">${escapeHtml(sku.focusReasons || 'Нужно закрепить owner и стартовый дедлайн.')}</div>
        <div class="inline-form" style="margin-top:10px">
          <input class="inline-input" list="ownerOptionsList" data-owner-assign-input="${escapeHtml(sku.articleKey)}" placeholder="Кто ведёт SKU">
          <input class="inline-input" data-owner-assign-role="${escapeHtml(sku.articleKey)}" placeholder="Роль" value="Owner SKU">
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
        </div>
      `;
    }).join('') : '<div class="empty">Нет решений в ожидании</div>';

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Задачи и контроль</h2>
          <p>Логика стала проще: отдельно входящие, отдельно работа, отдельно решения руководителя. Сюда же заводим задачи от РОПов, МП и логистики.</p>
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
        <div class="mini-kpi"><span>Ждёт решения</span><strong>${fmt.int(counts.waiting)}</strong></div>
        <div class="mini-kpi"><span>Авто-сигналы</span><strong>${fmt.int(counts.auto)}</strong></div>
      </div>

      <div class="card v71-task-intake" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Быстро поставить задачу</h3>
            <p class="small muted">Вот сюда и должны заходить РОПы, логисты, МП и руководитель. Обязательный минимум: SKU, кто поставил, кто ведёт, что делаем и срок.</p>
          </div>
          ${badge(state.team.mode === 'ready' ? 'синхрон' : 'локально', state.team.mode === 'ready' ? 'ok' : 'warn')}
        </div>
        <form id="v71QuickTaskForm" class="v71-task-form">
          <input list="v71SkuList" name="articleKey" placeholder="Артикул / SKU" required>
          <datalist id="v71SkuList">${state.skus.map((sku) => `<option value="${escapeHtml(sku.articleKey)}">${escapeHtml(sku.article || sku.articleKey)} · ${escapeHtml(sku.name || '')}</option>`).join('')}</datalist>
          <select name="requestSource">${taskRequestSources.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}</select>
          <input name="title" placeholder="Коротко: что нужно сделать" required>
          <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select>
          <select name="platform">
            <option value="all">Все площадки</option>
            <option value="wb">WB</option>
            <option value="ozon">Ozon</option>
            <option value="wb+ozon">WB + Ozon</option>
          </select>
          <input list="ownerOptionsList" name="owner" placeholder="Кто ведёт">
          <input name="due" type="date" value="${plusDays(3)}">
          <textarea name="nextAction" rows="3" placeholder="Следующее действие / что считаем готовым" required></textarea>
          <textarea name="reason" rows="3" placeholder="Контекст / почему задача появилась"></textarea>
          <button class="btn primary" type="submit">Добавить задачу</button>
        </form>
      </div>

      <div class="control-filters simplified-v71">
        <input id="controlSearchInput" placeholder="Поиск по SKU, названию, owner, действию…" value="${escapeHtml(state.controlFilters.search)}">
        <select id="controlOwnerFilter">
          <option value="all">Все owner</option>
          ${owners.map((owner) => `<option value="${escapeHtml(owner)}" ${state.controlFilters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
        </select>
        <select id="controlPlatformFilter">
          <option value="all">Все площадки</option>
          <option value="wb" ${state.controlFilters.platform === 'wb' ? 'selected' : ''}>WB</option>
          <option value="ozon" ${state.controlFilters.platform === 'ozon' ? 'selected' : ''}>Ozon</option>
          <option value="wb+ozon" ${state.controlFilters.platform === 'wb+ozon' ? 'selected' : ''}>WB + Ozon</option>
        </select>
        <select id="controlSourceFilter">
          <option value="all">Все источники</option>
          <option value="manual" ${state.controlFilters.source === 'manual' ? 'selected' : ''}>Ручные</option>
          <option value="auto" ${state.controlFilters.source === 'auto' ? 'selected' : ''}>Авто-сигналы</option>
        </select>
      </div>

      <div class="v71-task-grid">
        <div class="card">
          <div class="section-subhead"><div><h3>Входящие</h3><p class="small muted">Новые задачи и сигналы, которые надо быстро разобрать.</p></div>${badge(fmt.int(buckets.intake.length), buckets.intake.length ? 'warn' : 'ok')}</div>
          <div class="stack">${buckets.intake.length ? buckets.intake.map(renderTaskCard).join('') : '<div class="empty">Пусто</div>'}</div>
        </div>
        <div class="card">
          <div class="section-subhead"><div><h3>В работе</h3><p class="small muted">То, что уже взяли в работу, но ещё не закрыли.</p></div>${badge(fmt.int(buckets.work.length), buckets.work.length ? 'info' : 'ok')}</div>
          <div class="stack">${buckets.work.length ? buckets.work.map(renderTaskCard).join('') : '<div class="empty">Пусто</div>'}</div>
        </div>
        <div class="card">
          <div class="section-subhead"><div><h3>Ждут решения</h3><p class="small muted">Эскалации к бренд-лиду / руководителю.</p></div>${badge(fmt.int(buckets.decisions.length), buckets.decisions.length ? 'danger' : 'ok')}</div>
          <div class="stack">${buckets.decisions.length ? buckets.decisions.map(renderTaskCard).join('') : '<div class="empty">Пусто</div>'}</div>
        </div>
      </div>

      <div class="team-strip" style="margin-top:14px">
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>SKU без owner</h3>
              <p class="small muted">Сюда добиваем закрепления и убираем серые зоны.</p>
            </div>
            ${badge(`${fmt.int(unassignedSkus.length)} шт.`, unassignedSkus.length ? 'warn' : 'ok')}
          </div>
          <datalist id="ownerOptionsList">${ownerSuggestions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
          <div class="assign-list">${assignHtml}</div>
        </div>
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Решения руководителя</h3>
              <p class="small muted">Отдельный список того, что ждёт подтверждения.</p>
            </div>
            ${badge(`${fmt.int(waitingDecisions.length)} шт.`, waitingDecisions.length ? 'warn' : 'ok')}
          </div>
          <div class="decision-list">${decisionsHtml}</div>
        </div>
      </div>
    `;

    document.getElementById('controlSearchInput').addEventListener('input', (e) => { state.controlFilters.search = e.target.value; renderControlCenter(); });
    document.getElementById('controlOwnerFilter').addEventListener('change', (e) => { state.controlFilters.owner = e.target.value; renderControlCenter(); });
    document.getElementById('controlPlatformFilter').addEventListener('change', (e) => { state.controlFilters.platform = e.target.value; renderControlCenter(); });
    document.getElementById('controlSourceFilter').addEventListener('change', (e) => { state.controlFilters.source = e.target.value; renderControlCenter(); });

    root.querySelector('#v71QuickTaskForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const articleKey = normalizeTaskSkuInput(form.get('articleKey'));
      if (!articleKey) {
        alert('Нужно выбрать существующий SKU / артикул из портала');
        return;
      }
      await createManualTask({
        articleKey,
        title: form.get('title'),
        type: form.get('type'),
        priority: 'medium',
        platform: form.get('platform'),
        owner: form.get('owner'),
        due: form.get('due'),
        nextAction: form.get('nextAction'),
        reason: form.get('reason'),
        requestSource: form.get('requestSource')
      });
      renderControlCenter();
      rerenderCurrentView();
    });

    root.querySelectorAll('[data-save-owner]').forEach((btn) => btn.addEventListener('click', async () => {
      const articleKey = btn.dataset.saveOwner;
      const ownerInput = root.querySelector(`[data-owner-assign-input="${articleKey}"]`);
      const roleInput = root.querySelector(`[data-owner-assign-role="${articleKey}"]`);
      await upsertOwnerAssignment({
        articleKey,
        ownerName: ownerInput?.value || '',
        ownerRole: roleInput?.value || 'Owner SKU',
        note: 'Закреплено из задачника'
      });
      renderControlCenter();
      rerenderCurrentView();
    }));
  };

  function formatLocalShare(value) {
    const n = Number(value);
    return Number.isFinite(n) ? fmt.pct(n) : '—';
  }

  function logisticsNodes() {
    if (!state.logistics) return [];
    if (state.v71.logisticsPlatform === 'wb') {
      return (state.logistics.wbWarehouses || []).map((row) => ({
        key: row.name,
        label: row.name,
        coverageDays: row.coverageDays,
        need: row[`targetNeed${state.imperial?.targetDays || 14}`] || 0,
        count: row.skuCount || 0,
        subtitle: `${fmt.int(row.stock)} шт.`
      }));
    }
    return (state.logistics.ozonClusters || []).map((row) => ({
      key: row.name,
      label: row.name,
      coverageDays: row.coverageDays,
      need: row[`targetNeed${state.imperial?.targetDays || 14}`] || 0,
      count: row.skuCount || 0,
      subtitle: `${fmt.int(row.available)} шт.`
    }));
  }

  function ensureLogisticsSelection() {
    const nodes = logisticsNodes();
    if (!nodes.length) return;
    if (!nodes.some((item) => item.key === state.v71.logisticsNode)) {
      state.v71.logisticsNode = nodes[0].key;
    }
    const rows = currentRiskRows();
    if (rows.length && !rows.some((item) => item.article === state.v71.logisticsArticle)) {
      state.v71.logisticsArticle = rows[0].article;
    }
  }

  function currentRiskRows() {
    if (!state.logistics) return [];
    const platformLabel = state.v71.logisticsPlatform === 'wb' ? 'WB' : 'Ozon';
    const rows = (state.logistics.riskRows || []).filter((row) => row.platform === platformLabel && row.place === state.v71.logisticsNode);
    return rows.sort((a, b) => Number(b[`targetNeed${state.imperial?.targetDays || 14}`] || 0) - Number(a[`targetNeed${state.imperial?.targetDays || 14}`] || 0) || Number(a.turnoverDays || 999) - Number(b.turnoverDays || 999));
  }

  function selectedRiskRow() {
    const rows = currentRiskRows();
    return rows.find((row) => row.article === state.v71.logisticsArticle) || rows[0] || null;
  }

  function renderLogisticsWorkbench() {
    if (!state.logistics) return '';
    ensureLogisticsSelection();
    const target = state.imperial?.targetDays || 14;
    const nodes = logisticsNodes();
    const rows = currentRiskRows();
    const selected = selectedRiskRow();
    const summaryCards = (state.logistics.summaryCards || []).map((card) => `
      <div class="mini-kpi ${card.valuePct != null && card.valuePct < 0.5 ? 'warn' : ''}"><span>${escapeHtml(card.label)}</span><strong>${card.valuePct != null ? escapeHtml(fmt.pct(card.valuePct)) : escapeHtml(fmt.int(card.value))}</strong><span>${escapeHtml(card.hint || '')}</span></div>
    `).join('');
    const backlogCards = (state.logistics.statusCards || []).map((card) => `
      <div class="mini-kpi"><span>${escapeHtml(card.label)}</span><strong>${fmt.int(card.orders)}</strong><span>${fmt.int(card.units)} шт.</span></div>
    `).join('');
    const selectedSku = selected ? getSku(selected.article) : null;

    return `
      <section class="imperial-section v71-logistics-workbench">
        <div class="section-title">
          <div>
            <h2>Логистика по кластерам и складам</h2>
            <p>Слева — артикулы по выбранной точке, справа — показатели как в рабочем логистическом столе: скорость, покрытие, план, need, локальность и поток.</p>
          </div>
          <div class="quick-actions">
            <button class="quick-chip ${state.v71.logisticsPlatform === 'ozon' ? 'active' : ''}" type="button" data-v71-platform="ozon">Ozon</button>
            <button class="quick-chip ${state.v71.logisticsPlatform === 'wb' ? 'active' : ''}" type="button" data-v71-platform="wb">WB</button>
            ${[7,14,28].map((days) => `<button class="quick-chip ${target === days ? 'active' : ''}" type="button" data-imperial-target="${days}">${days} дней</button>`).join('')}
          </div>
        </div>

        <div class="kpi-strip">${summaryCards}${backlogCards}</div>

        <div class="v71-node-strip">
          ${nodes.map((node) => `
            <button class="v71-node-chip ${state.v71.logisticsNode === node.key ? 'active' : ''}" type="button" data-v71-node="${escapeHtml(node.key)}">
              <strong>${escapeHtml(node.label)}</strong>
              <span>${escapeHtml(node.subtitle)}</span>
              <small>${node.need > 0 ? 'need ' + fmt.int(node.need) : 'ok'} · ${node.coverageDays == null ? '—' : fmt.num(node.coverageDays, 1) + ' дн.'}</small>
            </button>
          `).join('')}
        </div>

        <div class="v71-logistics-grid">
          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>Артикулы точки</h3>
                <p class="small muted">Кликаешь артикул слева — справа получаешь быстрый логистический разбор.</p>
              </div>
              ${badge(`${fmt.int(rows.length)} SKU`, rows.length ? 'info' : '')}
            </div>
            <div class="v71-risk-list">
              ${rows.length ? rows.map((row) => `
                <button class="v71-risk-row ${state.v71.logisticsArticle === row.article ? 'active' : ''}" type="button" data-v71-article="${escapeHtml(row.article)}">
                  <div class="head"><strong>${escapeHtml(row.article)}</strong>${badge(row.owner || 'Без owner', row.owner ? 'ok' : 'warn')}</div>
                  <div class="muted small">${escapeHtml(row.name || 'Без названия')}</div>
                  <div class="badge-stack" style="margin-top:8px">${turnoverBadge(row.turnoverDays)}${badge('need ' + fmt.int(row[`targetNeed${target}`] || 0), (row[`targetNeed${target}`] || 0) > 0 ? 'danger' : 'ok')}</div>
                </button>
              `).join('') : '<div class="empty">По выбранной точке нет риск-SKU</div>'}
            </div>
          </div>
          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>${selected ? escapeHtml(selected.article) : 'Показатели точки'}</h3>
                <p class="small muted">${selected ? escapeHtml(selected.name || '') : 'Выбери артикул слева'}</p>
              </div>
              ${selectedSku ? `<button class="btn small-btn" type="button" data-open-sku="${escapeHtml(selectedSku.articleKey)}">Открыть SKU</button>` : ''}
            </div>
            ${selected ? `
              <div class="v71-metric-grid">
                <div class="mini-kpi"><span>Продажи 7д</span><strong>${fmt.int((Number(selected.avgDaily) || 0) * 7)}</strong><span>${fmt.num(selected.avgDaily, 1)} шт./день</span></div>
                <div class="mini-kpi"><span>Продажи 14д</span><strong>${fmt.int((Number(selected.avgDaily) || 0) * 14)}</strong><span>по текущему темпу</span></div>
                <div class="mini-kpi"><span>План / день</span><strong>${fmt.num(selected.avgDaily, 1)}</strong><span>рабочий темп</span></div>
                <div class="mini-kpi"><span>План / мес</span><strong>${fmt.int((Number(selected.avgDaily) || 0) * 28)}</strong><span>условный 28-дневный горизонт</span></div>
                <div class="mini-kpi"><span>Запас</span><strong>${fmt.int(selected.inStock)}</strong><span>шт.</span></div>
                <div class="mini-kpi"><span>В пути</span><strong>${fmt.int(selected.inTransit)}</strong><span>+ заявка ${fmt.int(selected.inRequest)}</span></div>
                <div class="mini-kpi ${Number(selected[`targetNeed${target}`] || 0) > 0 ? 'danger' : ''}"><span>Реком.</span><strong>${fmt.int(selected[`targetNeed${target}`] || 0)}</strong><span>под цель ${target} дн.</span></div>
                <div class="mini-kpi"><span>Локальность</span><strong>${formatLocalShare(selected.localShare)}</strong><span>${escapeHtml(selected.place)}</span></div>
              </div>
              <div class="v71-detail-table table-wrap" style="margin-top:14px">
                <table>
                  <thead><tr><th>Поле</th><th>Значение</th></tr></thead>
                  <tbody>
                    <tr><td>Площадка</td><td>${escapeHtml(selected.platform)}</td></tr>
                    <tr><td>Точка</td><td>${escapeHtml(selected.place)}</td></tr>
                    <tr><td>Owner</td><td>${escapeHtml(selected.owner || 'Без owner')}</td></tr>
                    <tr><td>Покрытие</td><td>${selected.turnoverDays == null ? '—' : fmt.num(selected.turnoverDays, 1) + ' дн.'}</td></tr>
                    <tr><td>Текущее наличие</td><td>${fmt.int(selected.inStock)} шт.</td></tr>
                    <tr><td>В пути</td><td>${fmt.int(selected.inTransit)} шт.</td></tr>
                    <tr><td>В заявке</td><td>${fmt.int(selected.inRequest)} шт.</td></tr>
                    <tr><td>Need ${target}</td><td>${fmt.int(selected[`targetNeed${target}`] || 0)} шт.</td></tr>
                    <tr><td>Источник стоимости</td><td>${fmt.money(selected.sourceValue || 0)}</td></tr>
                  </tbody>
                </table>
              </div>
            ` : '<div class="empty">Выбери артикул слева</div>'}
          </div>
        </div>
      </section>
    `;
  }

  const baseRenderOrderCalculator = renderOrderCalculator;
  renderOrderCalculator = function () {
    baseRenderOrderCalculator();
    const root = document.getElementById('view-order');
    if (!root) return;
    const firstImperial = root.querySelector('.imperial-section');
    if (firstImperial) firstImperial.outerHTML = renderLogisticsWorkbench();
    const calcTitle = root.querySelector('.order-layout .card h3');
    if (calcTitle) calcTitle.textContent = 'Ручной калькулятор SKU';

    root.querySelectorAll('[data-v71-platform]').forEach((btn) => btn.addEventListener('click', () => {
      state.v71.logisticsPlatform = btn.dataset.v71Platform || 'ozon';
      state.v71.logisticsNode = '';
      state.v71.logisticsArticle = '';
      renderOrderCalculator();
    }));
    root.querySelectorAll('[data-v71-node]').forEach((btn) => btn.addEventListener('click', () => {
      state.v71.logisticsNode = btn.dataset.v71Node || '';
      state.v71.logisticsArticle = '';
      renderOrderCalculator();
    }));
    root.querySelectorAll('[data-v71-article]').forEach((btn) => btn.addEventListener('click', () => {
      state.v71.logisticsArticle = btn.dataset.v71Article || '';
      renderOrderCalculator();
    }));
    root.querySelectorAll('[data-imperial-target]').forEach((btn) => btn.addEventListener('click', () => {
      state.imperial.targetDays = Number(btn.dataset.imperialTarget) || 14;
      renderOrderCalculator();
    }));
  };

  function visibleDocumentGroups() {
    const search = String(state.docFilters.search || '').trim().toLowerCase();
    const selectedGroup = state.docFilters.group || 'all';
    const keep = new Map([
      ['Стратегия и процессы', 'Регламенты и процессы'],
      ['Планирование и аналитика', 'Планы и аналитика'],
      ['Цена и репрайсер', 'Цена и репрайсер'],
      ['Новинки и supply', 'Новинки и supply']
    ]);
    return (state.documents?.groups || [])
      .filter((group) => keep.has(group.title))
      .map((group) => ({
        title: keep.get(group.title),
        items: (group.items || []).filter((item) => {
          const hay = [group.title, keep.get(group.title), item.title, item.description, item.type, item.filename].filter(Boolean).join(' ').toLowerCase();
          if (selectedGroup !== 'all' && keep.get(group.title) !== selectedGroup) return false;
          if (search && !hay.includes(search)) return false;
          return true;
        })
      }))
      .filter((group) => group.items.length);
  }

  renderDocuments = function () {
    const root = document.getElementById('view-documents');
    const groups = visibleDocumentGroups();
    const totalDocs = groups.reduce((acc, group) => acc + (group.items || []).length, 0);
    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Документы и регламенты</h2>
          <p>Здесь должны жить рабочие ссылки и регламенты команды. Техдок портала отсюда убрали, чтобы сотрудники видели только то, с чем реально работают.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(totalDocs)} файлов`, 'info')}</div>
      </div>
      <div class="control-filters simplified-v71" style="margin-bottom:14px">
        <input id="docSearchInput" placeholder="Поиск по названию, типу или назначению…" value="${escapeHtml(state.docFilters.search)}">
        <select id="docGroupFilter">
          <option value="all">Все группы</option>
          ${groups.map((group) => `<option value="${escapeHtml(group.title)}" ${state.docFilters.group === group.title ? 'selected' : ''}>${escapeHtml(group.title)}</option>`).join('')}
        </select>
      </div>
      <div class="v71-doc-grid">
        ${groups.map((group) => `
          <section class="card">
            <div class="section-subhead">
              <div>
                <h3>${escapeHtml(group.title)}</h3>
                <p class="small muted">${group.title === 'Регламенты и процессы' ? 'IBP, схема взаимодействия, карта процессов и общие правила.' : group.title === 'Планы и аналитика' ? 'План, факт, weekly и лидерборды.' : group.title === 'Цена и репрайсер' ? 'Репрайсер, цены, закрепления и спецификации.' : 'Новинки, остатки, возвраты, склады и supplier-goods.'}</p>
              </div>
              ${badge(`${fmt.int(group.items.length)} шт.`, 'ok')}
            </div>
            <div class="v71-doc-list">
              ${group.items.map((item) => `
                <a class="v71-doc-item" href="${escapeHtml(item.href || item.path || "#")}" target="_blank" rel="noopener noreferrer">
                  <div class="head"><span class="file-pill">${escapeHtml((item.type || '').toUpperCase() || 'FILE')}</span><strong>${escapeHtml(item.title)}</strong></div>
                  <div class="muted small">${escapeHtml(item.description || '')}</div>
                  <div class="v71-doc-meta"><span>${escapeHtml(item.filename || '')}</span><span>${fmt.num((Number(item.sizeMb) || 0), 2)} МБ</span></div>
                </a>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </div>
      <div class="imperial-note">Следующий шаг для боевого контура — заменить локальные demo-файлы на рабочие ссылки Google Drive / SharePoint с доступом по ролям.</div>
    `;
    document.getElementById('docSearchInput').addEventListener('input', (e) => {
      state.docFilters.search = e.target.value;
      renderDocuments();
    });
    document.getElementById('docGroupFilter').addEventListener('change', (e) => {
      state.docFilters.group = e.target.value;
      renderDocuments();
    });
  };

  function renderPulseHero() {
    const items = (state.platformTrends?.platforms || []).filter((item) => item.key !== 'all');
    if (!items.length) return '<div class="empty">Нет daily pulse по площадкам</div>';
    return `
      <div class="v71-pulse-grid">
        ${items.map((item) => renderPlatformMiniCard(item)).join('')}
      </div>
    `;
  }

  renderDashboard = function () {
    const root = document.getElementById('view-dashboard');
    const model = buildVisualDashboardModel();
    const control = model.control;
    const salesMax = Math.max(1, ...model.leadersSales.map((item) => numberOrZero(item.metricValue)));
    const turnoverMax = Math.max(1, ...model.turnoverCandidates.map((item) => numberOrZero(item.metricValue)));
    const romiMax = Math.max(1, ...model.romiLeaders.map((item) => numberOrZero(item.metricValue)));

    const heroCards = [
      { label: 'Выручка за срез', value: fmt.money(model.revenueTotal), hint: 'Сумма факта / order value по активным SKU.' },
      { label: 'Net revenue', value: fmt.money(model.netRevenueTotal), hint: 'Чистая выручка по доступному срезу.' },
      { label: 'Продано единиц', value: fmt.int(model.unitsTotal), hint: 'Факт units по SKU в текущем портале.' },
      { label: 'Среднее выполнение', value: fmt.pct(model.avgCompletion), hint: 'Средний completion по SKU с планом.' },
      { label: 'Средняя маржа', value: fmt.pct(model.avgMargin), hint: 'Средняя маржа по текущему месячному срезу.' },
      { label: 'SKU с внешним трафиком', value: fmt.int(model.trafficCount), hint: 'КЗ / VK уже отмечены в рабочем контуре.' }
    ].map((card) => `
      <div class="hero-kpi">
        <span>${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(card.value)}</strong>
        <small>${escapeHtml(card.hint)}</small>
      </div>
    `).join('');

    const baseCards = (state.dashboard.cards || []).map((card) => `
      <div class="card kpi">
        <div class="label">${escapeHtml(card.label)}</div>
        <div class="value">${fmt.int(card.value)}</div>
        <div class="hint">${escapeHtml(card.hint)}</div>
      </div>
    `).join('');

    const salesRows = model.leadersSales.map((item, index) => renderLeaderRow(
      item,
      index,
      salesMax,
      (value) => fmt.money(value),
      `${badge(item.owner || 'Без owner', item.owner ? 'ok' : 'warn')}${marginBadge('Маржа', item.marginPct)}${badge(`${fmt.int(item.units)} шт.`)}${badge(item.traffic, item.traffic.includes('без') ? '' : 'info')}`
    )).join('');

    const turnoverRows = model.turnoverCandidates.map((item, index) => renderInverseLeaderRow(
      item,
      index,
      turnoverMax,
      (value) => `${fmt.num(value, 1)} дн.`,
      `${badge(`Цель ${fmt.num(item.target, 0)} дн.`, 'info')}${badge(`Остаток ${fmt.int(item.stock)} шт.`)}${badge(item.owner || 'Без owner', item.owner ? 'ok' : 'warn')}`
    )).join('');

    const romiRows = model.romiLeaders.map((item, index) => renderLeaderRow(
      item,
      index,
      romiMax,
      (value) => fmt.num(value, 1),
      `${badge(`${fmt.int(item.posts)} постов`)}${badge(`${fmt.int(item.clicks)} кликов`)}${badge(`${fmt.int(item.orders)} заказов`, 'info')}`
    )).join('');

    root.innerHTML = `
      <section class="hero-panel v71-dashboard-hero">
        <div class="hero-copy compact-v71">
          <div class="eyebrow">ALTEA · pulse по площадкам</div>
          <div class="badge-stack" style="margin-top:6px">
            ${badge(`План/факт ${model.freshness.planFactMonth || '—'}`)}
            ${badge(`Лидерборд ${(model.freshness.contentPeriods || []).join(' / ') || '—'}`, 'info')}
            ${badge(`Новинки ${model.freshness.launchPlanHorizon || '—'}`)}
          </div>
          ${renderPulseHero()}
        </div>
        <div class="hero-grid">${heroCards}</div>
      </section>

      <div class="section-title" style="margin-top:18px">
        <div>
          <h2>Общее состояние бренда</h2>
          <p>Крупные KPI, лидеры и красные зоны — без лишних надписей и пустых блоков.</p>
        </div>
        <div class="quick-actions">
          <button class="quick-chip" data-view-control>Открыть задачи</button>
          <button class="quick-chip" data-control-preset="overdue">Просрочено</button>
          <button class="quick-chip" data-view-executive>Свод руководителя</button>
        </div>
      </div>

      <div class="grid cards">${baseCards}</div>

      <div class="dashboard-grid-3" style="margin-top:14px">
        <div class="card visual-card">
          <div class="section-subhead">
            <div>
              <h3>Лидеры продаж</h3>
              <p class="small muted">Берём текущую выручку по срезу и показываем сильнейшие SKU.</p>
            </div>
            ${badge(`${fmt.int(model.leadersSales.length)} SKU`, 'ok')}
          </div>
          <div class="leader-list">${salesRows || '<div class="empty">Нет данных по продажам</div>'}</div>
        </div>

        <div class="card visual-card">
          <div class="section-subhead">
            <div>
              <h3>Лидеры по оборачиваемости</h3>
              <p class="small muted">Чем меньше дней оборота, тем быстрее крутится SKU.</p>
            </div>
            ${badge('быстрее = лучше', 'info')}
          </div>
          <div class="leader-list">${turnoverRows || '<div class="empty">Нет данных по оборачиваемости</div>'}</div>
        </div>

        <div class="card visual-card">
          <div class="section-subhead">
            <div>
              <h3>Лидеры по контенту / ROMI</h3>
              <p class="small muted">Кого уже тащит контент и где есть наглядный сигнал для масштабирования.</p>
            </div>
            ${badge('контент-потенциал', 'info')}
          </div>
          <div class="leader-list">${romiRows || '<div class="empty">Нет ROMI в текущем срезе</div>'}</div>
        </div>
      </div>

      <div class="two-col" style="margin-top:14px">
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Красные зоны</h3>
              <p class="small muted">SKU, которые уже просятся в работу из-за плана и маржи.</p>
            </div>
            ${badge(`${fmt.int(model.worklist.length)} в фокусе`, model.worklist.length ? 'danger' : 'ok')}
          </div>
          <div class="alert-stack">${model.worklist.map((sku) => `
            <div class="alert-row">
              <div>
                <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
                <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
              </div>
              <div class="badge-stack">${skuOperationalStatus(sku)}${marginBadge('WB', sku?.wb?.marginPct)}${marginBadge('Ozon', sku?.ozon?.marginPct)}</div>
              <div class="muted small">${escapeHtml(sku.focusReasons || 'Ниже плана и отрицательная маржа')}</div>
            </div>
          `).join('') || '<div class="empty">Сейчас нет критичных SKU</div>'}</div>
        </div>

        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Операционный чек на сегодня</h3>
              <p class="small muted">Сразу видно, что показать на weekly / daily.</p>
            </div>
            ${badge(`${fmt.int(control.todayList.length)} в short-list`, 'warn')}
          </div>
          <div class="task-mini-grid">${control.todayList.slice(0, 8).map(renderMiniTask).join('') || '<div class="empty">Нет задач для экспресс-чека</div>'}</div>
        </div>
      </div>
    `;
  };

  function patchChrome() {
    document.querySelectorAll('.sidebar-foot').forEach((node) => node.remove());
    const topDesc = document.querySelector('.topbar p');
    if (topDesc) topDesc.textContent = 'Имперская версия: дашборд, логистика по кластерам и складам, задачник с быстрым входом для РОПов / МП / логистики и командный контур через Supabase.';
    const isAdmin = /admin|руковод|бренд|owner/i.test(String(state.team?.member?.role || ''));
    document.querySelectorAll('#exportStorageBtn, .file-input').forEach((node) => {
      if (node) node.style.display = isAdmin ? '' : 'none';
    });
  }

  function attachV71GlobalHandlers() {
    document.body.addEventListener('click', (event) => {
      const statusBtn = event.target.closest('[data-task-set]');
      if (statusBtn) {
        updateTaskStatus(statusBtn.dataset.taskId, statusBtn.dataset.taskSet);
      }
    });
  }

  function bootV71() {
    patchChrome();
    attachV71GlobalHandlers();
    rerenderCurrentView();
  }

  setTimeout(bootV71, 320);
})();
