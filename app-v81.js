(function () {
  const STATUS_META = {
    ok: { label: 'Ок', kind: 'ok' },
    under_plan: { label: 'Ниже плана', kind: 'warn' },
    margin_risk: { label: 'Маржа / цена', kind: 'danger' },
    content_issue: { label: 'Контент / возвраты', kind: 'warn' },
    traffic_needed: { label: 'Нужен трафик', kind: 'info' },
    price_check: { label: 'Проверить цену', kind: 'warn' },
    oos_risk: { label: 'Риск OOS', kind: 'danger' },
    waiting_decision: { label: 'Ждёт решения', kind: 'danger' },
    launch_delay: { label: 'Риск запуска', kind: 'warn' },
    archive: { label: 'Вывод / архив', kind: '' }
  };

  const STATUS_RISK_META = {
    none: { label: 'Без риска', kind: '' },
    low: { label: 'Низкий риск', kind: '' },
    medium: { label: 'Средний риск', kind: 'warn' },
    high: { label: 'Высокий риск', kind: 'danger' }
  };

  state.v81 = Object.assign({
    rows: [],
    ready: false,
    mode: 'seed',
    note: 'Статусы WB пока не загружены',
    issue: '',
    loadedAt: '',
    sourceName: 'masha_status_updates.json'
  }, state.v81 || {});

  function statusRows() {
    return Array.isArray(state.v81?.rows) ? state.v81.rows : [];
  }

  function normalizeStatusRow(item = {}) {
    const statusCode = STATUS_META[item.statusCode] ? item.statusCode : 'ok';
    const riskLevel = STATUS_RISK_META[item.riskLevel] ? item.riskLevel : (item.riskFlag ? 'medium' : 'none');
    return {
      id: item.id || stableId('masha-status', `${item.articleKey || ''}|${item.marketplace || ''}|${item.statusDate || ''}|${item.updatedAt || ''}`),
      statusDate: item.statusDate || todayIso(),
      updatedAt: item.updatedAt || new Date().toISOString(),
      marketplace: String(item.marketplace || 'wb').toLowerCase(),
      articleKey: String(item.articleKey || '').trim(),
      article: String(item.article || '').trim(),
      skuName: String(item.skuName || '').trim(),
      ownerName: String(item.ownerName || item.owner || '').trim(),
      ownerLogin: String(item.ownerLogin || '').trim(),
      statusCode,
      statusText: String(item.statusText || STATUS_META[statusCode].label).trim() || STATUS_META[statusCode].label,
      riskFlag: Boolean(item.riskFlag || riskLevel === 'medium' || riskLevel === 'high'),
      riskLevel,
      nextStep: String(item.nextStep || '').trim(),
      comment: String(item.comment || '').trim(),
      dueDate: item.dueDate || '',
      needsTask: Boolean(item.needsTask),
      priority: String(item.priority || (riskLevel === 'high' ? 'critical' : riskLevel === 'medium' ? 'high' : 'medium')).trim(),
      rootCause: String(item.rootCause || '').trim(),
      meetingType: String(item.meetingType || '').trim(),
      linkedCluster: String(item.linkedCluster || '').trim(),
      linkedWarehouse: String(item.linkedWarehouse || '').trim(),
      linkedDocUrl: String(item.linkedDocUrl || '').trim(),
      sourceName: String(item.sourceName || 'masha_status_source').trim() || 'masha_status_source',
      sourceType: String(item.sourceType || 'file').trim() || 'file',
      updatedBy: String(item.updatedBy || 'Маша РОП WB').trim() || 'Маша РОП WB'
    };
  }

  function buildSeedStatusRows() {
    return statusRows().length ? statusRows() : [];
  }

  function statusSeverityRank(row) {
    const codeRank = {
      waiting_decision: 90,
      margin_risk: 80,
      oos_risk: 75,
      launch_delay: 70,
      under_plan: 60,
      content_issue: 50,
      traffic_needed: 40,
      price_check: 30,
      archive: 10,
      ok: 0
    };
    const riskRank = { high: 30, medium: 20, low: 10, none: 0 };
    return (codeRank[row?.statusCode] || 0) + (riskRank[row?.riskLevel] || 0);
  }

  function rowsForSku(articleKey, market = 'all') {
    const rows = statusRows().filter((row) => row.articleKey === articleKey);
    const filtered = market === 'all' ? rows : rows.filter((row) => row.marketplace === market);
    return filtered.sort((a, b) => {
      return statusSeverityRank(b) - statusSeverityRank(a)
        || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }

  function currentStatusForSku(articleKey, market = 'all') {
    return rowsForSku(articleKey, market)[0] || null;
  }

  function riskBadge(row) {
    if (!row) return '';
    const meta = STATUS_RISK_META[row.riskLevel] || STATUS_RISK_META.none;
    if (row.riskLevel === 'none' && !row.riskFlag) return '';
    return badge(meta.label, meta.kind);
  }

  function statusBadge(row) {
    if (!row) return badge('Статус РОПа не загружен');
    const meta = STATUS_META[row.statusCode] || STATUS_META.ok;
    return badge(`WB · ${row.statusText || meta.label}`, meta.kind);
  }

  function statusInlineHtml(row) {
    if (!row) return '<div class="masha-status-inline muted">Статус РОПа WB пока не загружен</div>';
    return `
      <div class="masha-status-inline">
        <div class="badge-stack">${statusBadge(row)}${riskBadge(row)}</div>
        <div class="masha-status-meta">${escapeHtml(row.nextStep || row.comment || 'Следующий шаг не заполнен')}${row.dueDate ? ` · срок ${escapeHtml(row.dueDate)}` : ''}</div>
      </div>
    `;
  }

  function enhanceSkuRegistryV81() {
    const root = document.getElementById('view-skus');
    if (!root) return;
    const header = root.querySelector('.section-title .badge-stack');
    const risky = statusRows().filter((row) => row.riskLevel === 'high' || row.riskFlag).length;
    if (header && !root.querySelector('.v81-source-flag')) {
      header.insertAdjacentHTML('beforeend', `<span class="chip info v81-source-flag">WB статусы РОПа ${escapeHtml(fmt.int(statusRows().length))}</span><span class="chip ${risky ? 'warn' : ''}">${escapeHtml(fmt.int(risky))} с риском</span>`);
    }
    const headCell = root.querySelector('thead th:nth-child(3)');
    if (headCell) headCell.textContent = 'Статус / РОП';
    root.querySelectorAll('tbody tr').forEach((tr) => {
      const trigger = tr.querySelector('[data-open-sku]');
      if (!trigger) return;
      const articleKey = trigger.dataset.openSku;
      const row = currentStatusForSku(articleKey, state.filters?.market || 'all');
      const statusCell = tr.children[2];
      if (statusCell) {
        statusCell.querySelectorAll('.masha-status-inline').forEach((el) => el.remove());
        statusCell.insertAdjacentHTML('beforeend', statusInlineHtml(row));
      }
      const nextCell = tr.children[5];
      if (nextCell && row && !nextCell.querySelector('.masha-status-next')) {
        nextCell.insertAdjacentHTML('beforeend', `<div class="masha-status-next muted small">РОП WB: ${escapeHtml(row.nextStep || '—')}</div>`);
      }
    });
  }

  function modalStatusBlock(articleKey) {
    const rows = rowsForSku(articleKey, 'all');
    const current = rows[0] || null;
    const history = rows.slice(0, 4).map((row) => `
      <div class="status-history-row">
        <div>
          <strong>${escapeHtml(row.statusText || (STATUS_META[row.statusCode] || STATUS_META.ok).label)}</strong>
          <div class="muted small">${escapeHtml(row.updatedBy || 'РОП')} · ${fmt.date(row.updatedAt)}</div>
        </div>
        <div class="badge-stack">${statusBadge(row)}${riskBadge(row)}</div>
        <div class="muted small">${escapeHtml(row.nextStep || row.comment || 'Без следующего шага')}</div>
      </div>
    `).join('');

    return `
      <div class="card subtle v81-status-card">
        <div class="section-subhead">
          <div>
            <h3>Статус от РОПа / Маши</h3>
            <p class="small muted">Источник статусов SKU по WB. Не каждая строка становится задачей — только action-item'ы.</p>
          </div>
          <div class="badge-stack">${statusBadge(current)}${riskBadge(current)}</div>
        </div>
        ${current ? `
          <div class="v81-status-grid">
            <div class="note-box"><strong>Следующий шаг</strong><div class="muted small" style="margin-top:6px">${escapeHtml(current.nextStep || 'Не заполнен')}</div></div>
            <div class="note-box"><strong>Комментарий</strong><div class="muted small" style="margin-top:6px">${escapeHtml(current.comment || current.rootCause || 'Нет комментария')}</div></div>
            <div class="note-box"><strong>Срок / встреча</strong><div class="muted small" style="margin-top:6px">${escapeHtml(current.dueDate || '—')} · ${escapeHtml(current.meetingType || 'без привязки')}</div></div>
          </div>
        ` : '<div class="empty">Статусная форма WB ещё не подключена</div>'}
        <div class="status-history-block">${history || '<div class="empty">История обновлений пока пустая</div>'}</div>
      </div>
    `;
  }

  function enhanceSkuModalV81(articleKey) {
    const body = document.getElementById('skuModalBody');
    if (!body) return;
    body.querySelectorAll('.v81-status-card').forEach((el) => el.remove());
    const anchor = body.querySelector('.modal-grid-3') || body.querySelector('.two-col');
    if (anchor) anchor.insertAdjacentHTML('beforebegin', modalStatusBlock(articleKey));
  }

  function actionableStatusRows() {
    return statusRows().filter((row) => row.sourceType !== 'seed' && (row.needsTask || row.dueDate || row.riskLevel === 'high' || row.statusCode === 'waiting_decision'));
  }

  function statusType(row) {
    if (!row) return 'general';
    if (['margin_risk', 'price_check'].includes(row.statusCode)) return 'price_margin';
    if (row.statusCode === 'oos_risk') return 'supply';
    if (row.statusCode === 'content_issue') return 'returns';
    if (row.statusCode === 'traffic_needed') return 'traffic';
    if (row.statusCode === 'launch_delay') return 'launch';
    if (row.statusCode === 'waiting_decision') return 'general';
    return 'general';
  }

  function statusPriority(row) {
    if (row.priority && PRIORITY_META[row.priority]) return row.priority;
    if (row.riskLevel === 'high') return 'critical';
    if (row.riskLevel === 'medium') return 'high';
    return 'medium';
  }

  function buildStatusTasks() {
    const existingKeys = new Set([
      ...((state.storage?.tasks || []).filter(isTaskActive).map((task) => `${task.articleKey}|${task.type}`)),
      ...((typeof buildAutoTasks.__base === 'function' ? buildAutoTasks.__base() : []).filter(isTaskActive).map((task) => `${task.articleKey}|${task.type}`))
    ]);
    const tasks = [];
    for (const row of actionableStatusRows()) {
      const type = statusType(row);
      const key = `${row.articleKey}|${type}`;
      if (existingKeys.has(key)) continue;
      const task = normalizeTask({
        id: stableId('masha-task', `${row.articleKey}|${row.marketplace}|${row.statusDate}|${row.statusCode}`),
        source: 'auto',
        origin: 'masha_status',
        autoCode: `masha_${row.statusCode}`,
        articleKey: row.articleKey,
        title: `Статус РОПа: ${row.statusText || (STATUS_META[row.statusCode] || STATUS_META.ok).label}`,
        nextAction: row.nextStep || row.comment || 'Нужно обновить действие по статусу РОПа.',
        reason: row.rootCause || row.comment || 'Источник: файл статусов РОПа WB.',
        owner: row.ownerName || (getSku(row.articleKey) ? ownerName(getSku(row.articleKey)) : ''),
        due: row.dueDate || plusDays(row.riskLevel === 'high' ? 2 : 4),
        status: row.statusCode === 'waiting_decision' ? 'waiting_decision' : 'new',
        type,
        priority: statusPriority(row),
        platform: row.marketplace === 'oz' ? 'ozon' : row.marketplace,
        createdAt: row.updatedAt,
        entityLabel: row.skuName || row.articleKey
      }, 'auto');
      task.origin = 'masha_status';
      tasks.push(task);
    }
    return tasks;
  }

  function controlStatusSummaryHtml() {
    const rows = statusRows();
    const risky = rows.filter((row) => row.riskLevel === 'high' || row.riskFlag);
    const waiting = rows.filter((row) => row.statusCode === 'waiting_decision');
    const due = rows.filter((row) => row.dueDate && row.dueDate <= plusDays(7));
    const top = [...rows].sort((a, b) => statusSeverityRank(b) - statusSeverityRank(a)).slice(0, 6);
    return `
      <div class="card v81-status-summary-card">
        <div class="section-subhead">
          <div>
            <h3>Источник статусов РОПа WB</h3>
            <p class="small muted">Отдельная форма статусов встроена как источник snapshot'ов по SKU и action-item'ов в задачник.</p>
          </div>
          <div class="badge-stack">${badge(`${fmt.int(rows.length)} статусов`, 'info')}${badge(`${fmt.int(risky.length)} риск`, risky.length ? 'warn' : 'ok')}</div>
        </div>
        <div class="v81-kpis">
          <div class="mini-kpi"><span>Обновлений</span><strong>${fmt.int(rows.length)}</strong></div>
          <div class="mini-kpi warn"><span>С риском</span><strong>${fmt.int(risky.length)}</strong></div>
          <div class="mini-kpi danger"><span>Срок ≤ 7 дн.</span><strong>${fmt.int(due.length)}</strong></div>
          <div class="mini-kpi"><span>Ждут решения</span><strong>${fmt.int(waiting.length)}</strong></div>
        </div>
        <div class="alert-stack" style="margin-top:12px">
          ${top.length ? top.map((row) => `
            <div class="alert-row">
              <div>
                <strong>${linkToSku(row.articleKey, row.article || row.articleKey)}</strong>
                <div class="muted small">${escapeHtml(row.skuName || '')}</div>
              </div>
              <div class="badge-stack">${statusBadge(row)}${riskBadge(row)}</div>
              <div class="muted small">${escapeHtml(row.nextStep || row.comment || 'Без следующего шага')}</div>
            </div>
          `).join('') : '<div class="empty">Статусный источник пока не загружен</div>'}
        </div>
      </div>
    `;
  }

  function enhanceControlCenterV81() {
    const root = document.getElementById('view-control');
    if (!root) return;
    root.querySelectorAll('.v81-status-summary-card').forEach((el) => el.remove());
    const grid = root.querySelector('.check-grid');
    if (grid) grid.insertAdjacentHTML('beforeend', controlStatusSummaryHtml());
  }

  function executiveStatusHtml() {
    const rows = statusRows();
    const risky = rows.filter((row) => row.riskLevel === 'high' || row.riskFlag);
    const decision = rows.filter((row) => row.statusCode === 'waiting_decision');
    const latest = [...rows].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 6);
    return `
      <div class="card v81-exec-status-card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Статусы от РОПа в executive-слое</h3>
            <p class="small muted">Сюда попадает только статусный слой WB: риски, ожидание решения и последние апдейты по SKU.</p>
          </div>
          <div class="badge-stack">${badge(`${fmt.int(risky.length)} риск`, risky.length ? 'warn' : 'ok')}${badge(`${fmt.int(decision.length)} ждут решения`, decision.length ? 'danger' : 'ok')}</div>
        </div>
        <div class="alert-stack">
          ${latest.length ? latest.map((row) => `
            <div class="alert-row">
              <div>
                <strong>${linkToSku(row.articleKey, row.article || row.articleKey)}</strong>
                <div class="muted small">${escapeHtml(row.skuName || '')}</div>
              </div>
              <div class="badge-stack">${statusBadge(row)}${riskBadge(row)}</div>
              <div class="muted small">${escapeHtml(row.nextStep || row.comment || 'Без следующего шага')}</div>
            </div>
          `).join('') : '<div class="empty">Статусы РОПа пока не загружены</div>'}
        </div>
      </div>
    `;
  }

  const baseBuildAutoTasks = buildAutoTasks;
  buildAutoTasks = function () {
    const tasks = baseBuildAutoTasks();
    buildAutoTasks.__base = baseBuildAutoTasks;
    return [...tasks, ...buildStatusTasks()];
  };
  buildAutoTasks.__base = baseBuildAutoTasks;

  const baseTaskSourceBadge = taskSourceBadge;
  taskSourceBadge = function (task) {
    if (task?.origin === 'masha_status') return badge('статус РОПа', 'info');
    return baseTaskSourceBadge(task);
  };

  const baseRenderSkuRegistry = renderSkuRegistry;
  renderSkuRegistry = function () {
    baseRenderSkuRegistry();
    try { enhanceSkuRegistryV81(); } catch (error) { console.error(error); }
  };

  const baseRenderSkuModal = renderSkuModal;
  renderSkuModal = function (articleKey) {
    baseRenderSkuModal(articleKey);
    try { enhanceSkuModalV81(articleKey); } catch (error) { console.error(error); }
  };

  const baseRenderControlCenter = renderControlCenter;
  renderControlCenter = function () {
    baseRenderControlCenter();
    try { enhanceControlCenterV81(); } catch (error) { console.error(error); }
  };

  const baseRenderExecutive = renderExecutive;
  renderExecutive = function () {
    baseRenderExecutive();
    try {
      const root = document.getElementById('view-executive');
      if (!root) return;
      root.querySelectorAll('.v81-exec-status-card').forEach((el) => el.remove());
      root.insertAdjacentHTML('beforeend', executiveStatusHtml());
    } catch (error) {
      console.error(error);
    }
  };

  async function loadStatusSource() {
    try {
      const rows = await loadJson('data/masha_status_updates.json');
      const normalized = Array.isArray(rows) ? rows.map(normalizeStatusRow).filter((row) => row.articleKey) : [];
      state.v81.rows = normalized;
      state.v81.ready = normalized.length > 0;
      state.v81.mode = normalized.some((row) => row.sourceType !== 'seed') ? 'file' : 'seed';
      state.v81.note = normalized.length ? `Статусы WB загружены: ${fmt.int(normalized.length)}` : 'Статусы WB пустые — работаем без файла';
      state.v81.loadedAt = new Date().toISOString();
      state.v81.issue = '';
    } catch (error) {
      console.error(error);
      state.v81.rows = [];
      state.v81.ready = false;
      state.v81.mode = 'error';
      state.v81.note = 'Не удалось загрузить статусный источник WB';
      state.v81.issue = error.message || 'Ошибка загрузки';
    }
  }

  async function v81Init() {
    await loadStatusSource();
    try {
      rerenderCurrentView();
      if (state.activeSku) renderSkuModal(state.activeSku);
    } catch (error) {
      console.error(error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', v81Init, { once: true });
  else setTimeout(v81Init, 0);
})();
