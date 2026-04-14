(function () {
  const STATUS_TABLE = 'portal_masha_status_updates';
  const LOCAL_KEY = 'brand-portal-masha-status-v82';
  const MARKETPLACE = 'wb';
  const REMOTE_RETRY_MAX = 45;

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

  const RISK_META = {
    none: { label: 'Без риска', kind: '' },
    low: { label: 'Низкий риск', kind: '' },
    medium: { label: 'Средний риск', kind: 'warn' },
    high: { label: 'Высокий риск', kind: 'danger' }
  };

  state.v82 = Object.assign({
    rows: [],
    fileRows: [],
    localRows: [],
    remoteRows: [],
    note: 'Статусы WB ещё не загружены',
    issue: '',
    pulled: false,
    formOpen: false,
    formMode: 'create',
    formContext: 'control',
    editId: '',
    controlSearch: '',
    loadedAt: ''
  }, state.v82 || {});

  function sortedRows(rows) {
    return [...rows].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.articleKey || '').localeCompare(String(b.articleKey || ''), 'ru'));
  }

  function normalizeStatusRow(item = {}) {
    const sku = getSku(item.articleKey || item.article || '');
    const articleKey = String(item.articleKey || sku?.articleKey || item.article || '').trim();
    const statusCode = STATUS_META[item.statusCode] ? item.statusCode : 'ok';
    const riskLevel = RISK_META[item.riskLevel] ? item.riskLevel : (item.riskFlag ? 'medium' : 'none');
    return {
      id: String(item.id || uid('masha-status')).trim(),
      brand: currentBrand(),
      marketplace: String(item.marketplace || MARKETPLACE).trim().toLowerCase() || MARKETPLACE,
      articleKey,
      article: String(item.article || sku?.article || articleKey).trim(),
      skuName: String(item.skuName || sku?.name || '').trim(),
      ownerName: String(item.ownerName || item.owner || ownerName(sku) || '').trim(),
      ownerLogin: String(item.ownerLogin || '').trim(),
      statusCode,
      statusText: String(item.statusText || STATUS_META[statusCode].label).trim() || STATUS_META[statusCode].label,
      riskFlag: Boolean(item.riskFlag || ['medium', 'high'].includes(riskLevel)),
      riskLevel,
      nextStep: String(item.nextStep || '').trim(),
      comment: String(item.comment || '').trim(),
      dueDate: String(item.dueDate || '').trim(),
      needsTask: Boolean(item.needsTask),
      priority: PRIORITY_META[item.priority] ? item.priority : (riskLevel === 'high' ? 'critical' : riskLevel === 'medium' ? 'high' : 'medium'),
      rootCause: String(item.rootCause || '').trim(),
      meetingType: String(item.meetingType || '').trim(),
      linkedCluster: String(item.linkedCluster || '').trim(),
      linkedWarehouse: String(item.linkedWarehouse || '').trim(),
      linkedDocUrl: String(item.linkedDocUrl || '').trim(),
      sourceName: String(item.sourceName || 'portal_wb_status_form').trim() || 'portal_wb_status_form',
      sourceType: String(item.sourceType || 'portal_form').trim() || 'portal_form',
      updatedBy: String(item.updatedBy || state.team.member?.name || 'Команда').trim() || 'Команда',
      statusDate: String(item.statusDate || todayIso()).trim() || todayIso(),
      updatedAt: String(item.updatedAt || new Date().toISOString()).trim() || new Date().toISOString(),
      createdAt: String(item.createdAt || item.updatedAt || new Date().toISOString()).trim() || new Date().toISOString()
    };
  }

  function dedupeRows(rows) {
    const map = new Map();
    for (const row of rows || []) {
      const normalized = normalizeStatusRow(row);
      if (!normalized.articleKey) continue;
      map.set(normalized.id, normalized);
    }
    return sortedRows([...map.values()]);
  }

  function setRows(rows, note = '') {
    const normalized = dedupeRows(rows);
    state.v82.rows = normalized;
    state.v81 = state.v81 || {};
    state.v81.rows = normalized;
    state.v81.ready = normalized.length > 0;
    state.v81.note = note || state.v82.note || '';
    state.v82.loadedAt = new Date().toISOString();
    if (note) state.v82.note = note;
  }

  function loadLocalRows() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      state.v82.localRows = Array.isArray(parsed) ? dedupeRows(parsed) : [];
    } catch {
      state.v82.localRows = [];
    }
    return state.v82.localRows;
  }

  function saveLocalRows() {
    const persistable = (state.v82.rows || []).filter((row) => row.sourceType !== 'seed');
    localStorage.setItem(LOCAL_KEY, JSON.stringify(persistable));
    state.v82.localRows = persistable;
  }

  function mergeSources() {
    return dedupeRows([
      ...(state.v82.fileRows || []),
      ...(state.v82.localRows || []),
      ...(state.v82.remoteRows || [])
    ]);
  }

  function allRows() {
    return Array.isArray(state.v82.rows) ? state.v82.rows : [];
  }

  function rowsForSku(articleKey, marketplace = MARKETPLACE) {
    return sortedRows(allRows().filter((row) => row.articleKey === articleKey && (marketplace === 'all' || row.marketplace === marketplace)));
  }

  function latestRows(marketplace = MARKETPLACE) {
    const map = new Map();
    for (const row of rowsForMarket(marketplace)) {
      const current = map.get(row.articleKey);
      if (!current || String(row.updatedAt || '').localeCompare(String(current.updatedAt || '')) > 0) map.set(row.articleKey, row);
    }
    return sortedRows([...map.values()]);
  }

  function latestForSku(articleKey, marketplace = MARKETPLACE) {
    return rowsForSku(articleKey, marketplace)[0] || null;
  }

  function rowsForMarket(marketplace = MARKETPLACE) {
    return allRows().filter((row) => row.marketplace === marketplace);
  }

  function statusBadgeHtml(row) {
    if (!row) return badge('WB статус не заполнен');
    const meta = STATUS_META[row.statusCode] || STATUS_META.ok;
    return badge(`WB · ${row.statusText || meta.label}`, meta.kind);
  }

  function riskBadgeHtml(row) {
    if (!row || (!row.riskFlag && row.riskLevel === 'none')) return '';
    const meta = RISK_META[row.riskLevel] || RISK_META.none;
    return badge(meta.label, meta.kind);
  }

  function nextDueLabel(row) {
    return row?.dueDate ? `срок ${escapeHtml(row.dueDate)}` : 'без срока';
  }

  function sourceCaption() {
    const remote = hasRemoteStore() ? 'Supabase' : 'локально';
    return `${remote} · ${fmt.int(allRows().length)} записей`; 
  }

  function remoteStatusRow(row) {
    return {
      id: row.id,
      brand: currentBrand(),
      marketplace: row.marketplace,
      article_key: row.articleKey,
      article: row.article,
      sku_name: row.skuName,
      owner_name: row.ownerName,
      owner_login: row.ownerLogin,
      status_code: row.statusCode,
      status_text: row.statusText,
      risk_flag: row.riskFlag,
      risk_level: row.riskLevel,
      next_step: row.nextStep,
      comment: row.comment,
      due_date: row.dueDate || null,
      needs_task: row.needsTask,
      priority: row.priority,
      root_cause: row.rootCause,
      meeting_type: row.meetingType,
      linked_cluster: row.linkedCluster,
      linked_warehouse: row.linkedWarehouse,
      linked_doc_url: row.linkedDocUrl,
      source_name: row.sourceName,
      source_type: row.sourceType,
      updated_by: row.updatedBy,
      status_date: row.statusDate,
      updated_at: row.updatedAt,
      created_at: row.createdAt
    };
  }

  function fromRemoteStatusRow(row) {
    return normalizeStatusRow({
      id: row.id,
      articleKey: row.article_key,
      article: row.article,
      skuName: row.sku_name,
      ownerName: row.owner_name,
      ownerLogin: row.owner_login,
      statusCode: row.status_code,
      statusText: row.status_text,
      riskFlag: row.risk_flag,
      riskLevel: row.risk_level,
      nextStep: row.next_step,
      comment: row.comment,
      dueDate: row.due_date,
      needsTask: row.needs_task,
      priority: row.priority,
      rootCause: row.root_cause,
      meetingType: row.meeting_type,
      linkedCluster: row.linked_cluster,
      linkedWarehouse: row.linked_warehouse,
      linkedDocUrl: row.linked_doc_url,
      sourceName: row.source_name,
      sourceType: row.source_type,
      updatedBy: row.updated_by,
      statusDate: row.status_date,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      marketplace: row.marketplace
    });
  }

  async function queryRemoteStatuses() {
    if (!hasRemoteStore()) return [];
    const response = await state.team.client
      .from(STATUS_TABLE)
      .select('*')
      .eq('brand', currentBrand())
      .order('updated_at', { ascending: false });
    if (response.error) throw response.error;
    return response.data || [];
  }

  async function upsertRemoteStatuses(rows) {
    if (!hasRemoteStore() || !rows.length) return;
    const response = await state.team.client
      .from(STATUS_TABLE)
      .upsert(rows.map(remoteStatusRow), { onConflict: 'id' });
    if (response.error) throw response.error;
  }

  async function deleteRemoteStatus(id) {
    if (!hasRemoteStore() || !id) return;
    const response = await state.team.client
      .from(STATUS_TABLE)
      .delete()
      .eq('brand', currentBrand())
      .eq('id', id);
    if (response.error) throw response.error;
  }

  async function loadFileSeed() {
    try {
      const rows = await loadJson('data/masha_status_updates.json');
      state.v82.fileRows = Array.isArray(rows) ? dedupeRows(rows) : [];
      state.v82.issue = '';
    } catch (error) {
      console.error(error);
      state.v82.fileRows = [];
      state.v82.issue = error.message || 'Не удалось загрузить seed статусов WB';
    }
  }

  function applyMergedRows(note = '') {
    const rows = mergeSources();
    setRows(rows, note || state.v82.note || 'WB статусы загружены');
    saveLocalRows();
  }

  async function pullRemoteStatuses(rerender = true) {
    if (!hasRemoteStore()) return;
    try {
      const remoteRows = await queryRemoteStatuses();
      state.v82.remoteRows = remoteRows.map(fromRemoteStatusRow);
      applyMergedRows(remoteRows.length
        ? `Статусы WB синхронизированы · ${fmt.date(new Date().toISOString())}`
        : 'Supabase пустой по WB-статусам — оставили локальные/seed данные');
      if (rerender) {
        rerenderCurrentView();
        if (state.activeSku) renderSkuModal(state.activeSku);
      }
    } catch (error) {
      console.error(error);
      setAppError(`Статусы WB не загрузились из Supabase: ${error.message}`);
      state.v82.note = 'Ошибка загрузки WB-статусов';
      state.v82.issue = error.message || 'Ошибка Supabase';
    }
  }

  async function pushRemoteStatuses() {
    if (!hasRemoteStore()) return;
    try {
      const rows = allRows().filter((row) => row.sourceType !== 'seed');
      await upsertRemoteStatuses(rows);
      state.v82.note = `Статусы WB отправлены · ${fmt.date(new Date().toISOString())}`;
    } catch (error) {
      console.error(error);
      setAppError(`Статусы WB не отправились в Supabase: ${error.message}`);
      state.v82.note = 'Ошибка выгрузки WB-статусов';
      state.v82.issue = error.message || 'Ошибка Supabase';
    }
  }

  async function persistStatusRow(row) {
    const merged = dedupeRows([...allRows(), row]);
    setRows(merged, 'WB статус сохранён локально');
    saveLocalRows();
    if (hasRemoteStore()) {
      try {
        await upsertRemoteStatuses([row]);
        state.v82.note = `WB статус синхронизирован · ${fmt.date(new Date().toISOString())}`;
      } catch (error) {
        console.error(error);
        setAppError(`Статус WB сохранили локально, но не синхронизировали: ${error.message}`);
      }
    }
  }

  async function removeStatusRow(id) {
    const row = allRows().find((item) => item.id === id);
    if (!row) return;
    if (row.sourceType === 'seed') {
      setAppError('Seed-статус удалять нельзя. Для него лучше создать новый апдейт поверх текущего состояния.');
      return;
    }
    const remaining = allRows().filter((item) => item.id !== id);
    setRows(remaining, 'WB статус удалён локально');
    saveLocalRows();
    if (hasRemoteStore()) {
      try {
        await deleteRemoteStatus(id);
        state.v82.note = `WB статус удалён из Supabase · ${fmt.date(new Date().toISOString())}`;
      } catch (error) {
        console.error(error);
        setAppError(`Удалили локально, но не смогли удалить в Supabase: ${error.message}`);
      }
    }
    rerenderCurrentView();
    if (state.activeSku) renderSkuModal(state.activeSku);
  }

  function latestActionableRows() {
    return latestRows(MARKETPLACE).filter((row) => row.needsTask || row.dueDate || row.riskLevel === 'high' || row.statusCode === 'waiting_decision');
  }

  function statusTaskType(row) {
    if (!row) return 'general';
    if (['margin_risk', 'price_check'].includes(row.statusCode)) return 'price_margin';
    if (row.statusCode === 'oos_risk') return 'supply';
    if (row.statusCode === 'content_issue') return 'returns';
    if (row.statusCode === 'traffic_needed') return 'traffic';
    if (row.statusCode === 'launch_delay') return 'launch';
    return 'general';
  }

  const baseAutoTasks = buildAutoTasks.__base || buildAutoTasks;
  buildAutoTasks = function () {
    const tasks = baseAutoTasks();
    const existingKeys = new Set(tasks.filter(isTaskActive).map((task) => `${task.articleKey}|${task.type}`));
    const autoRows = latestActionableRows();
    const extra = [];
    for (const row of autoRows) {
      const type = statusTaskType(row);
      const key = `${row.articleKey}|${type}`;
      if (existingKeys.has(key)) continue;
      extra.push(normalizeTask({
        id: stableId('masha-task-v82', `${row.articleKey}|${row.marketplace}|${row.updatedAt}|${row.statusCode}`),
        source: 'auto',
        origin: 'masha_status',
        autoCode: `masha_${row.statusCode}`,
        articleKey: row.articleKey,
        title: `Статус РОПа WB: ${row.statusText || STATUS_META[row.statusCode].label}`,
        nextAction: row.nextStep || row.comment || 'Нужно обновить действие по статусу РОПа WB.',
        reason: row.rootCause || row.comment || 'Источник: форма статусов РОПа WB.',
        owner: row.ownerName || ownerName(getSku(row.articleKey)) || '',
        due: row.dueDate || plusDays(row.riskLevel === 'high' ? 2 : 4),
        status: row.statusCode === 'waiting_decision' ? 'waiting_decision' : 'new',
        type,
        priority: row.priority,
        platform: MARKETPLACE,
        createdAt: row.updatedAt,
        entityLabel: row.skuName || row.articleKey
      }, 'auto'));
    }
    return [...tasks, ...extra];
  };
  buildAutoTasks.__base = baseAutoTasks;

  const baseTaskSourceBadge = taskSourceBadge;
  taskSourceBadge = function (task) {
    if (task?.origin === 'masha_status') return badge('форма РОПа WB', 'info');
    return baseTaskSourceBadge(task);
  };

  function statusCellHtml(row) {
    if (!row) return '<div class="masha-status-inline muted">WB статус не заполнен</div>';
    return `
      <div class="masha-status-inline v82-inline">
        <div class="badge-stack">${statusBadgeHtml(row)}${riskBadgeHtml(row)}</div>
        <div class="masha-status-meta">${escapeHtml(row.nextStep || row.comment || 'Без следующего шага')} · ${nextDueLabel(row)}</div>
      </div>
    `;
  }

  function registryHeaderEnhancement(root) {
    const header = root.querySelector('.section-title .badge-stack');
    if (!header) return;
    root.querySelectorAll('.v81-source-flag, .v82-status-flag').forEach((el) => el.remove());
    const risky = latestRows(MARKETPLACE).filter((row) => row.riskLevel === 'high' || row.riskFlag).length;
    header.insertAdjacentHTML('beforeend', `<span class="chip info v82-status-flag">WB форма ${escapeHtml(fmt.int(allRows().length))}</span><span class="chip ${risky ? 'warn' : ''} v82-status-flag">${escapeHtml(fmt.int(risky))} с риском</span>`);
  }

  function enhanceSkuRegistryV82() {
    const root = document.getElementById('view-skus');
    if (!root) return;
    registryHeaderEnhancement(root);
    root.querySelectorAll('tbody tr').forEach((tr) => {
      const trigger = tr.querySelector('[data-open-sku]');
      if (!trigger) return;
      const row = latestForSku(trigger.dataset.openSku, state.filters?.market === 'ozon' ? 'ozon' : MARKETPLACE);
      const statusCell = tr.children[2];
      if (statusCell) {
        statusCell.querySelectorAll('.masha-status-inline').forEach((el) => el.remove());
        statusCell.insertAdjacentHTML('beforeend', statusCellHtml(row));
      }
      const nextCell = tr.children[5];
      if (nextCell) {
        nextCell.querySelectorAll('.masha-status-next').forEach((el) => el.remove());
        if (row) nextCell.insertAdjacentHTML('beforeend', `<div class="masha-status-next muted small">Форма WB: ${escapeHtml(row.nextStep || '—')}</div>`);
      }
    });
  }

  function skuOptionsDatalist(id) {
    return `
      <datalist id="${id}">
        ${state.skus.map((sku) => `<option value="${escapeHtml(`${sku.article || sku.articleKey} · ${sku.name || ''}`)}" data-article-key="${escapeHtml(sku.articleKey)}"></option>`).join('')}
      </datalist>
    `;
  }

  function findSkuBySearch(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    return state.skus.find((sku) => {
      const hay = [sku.article, sku.articleKey, sku.name].filter(Boolean).join(' · ').toLowerCase();
      return hay === raw || hay.includes(raw) || String(sku.articleKey || '').toLowerCase() === raw || String(sku.article || '').toLowerCase() === raw;
    }) || null;
  }

  function statusFormHtml(context = 'control', articleKey = '', row = null) {
    const sku = articleKey ? getSku(articleKey) : null;
    const formId = `v82StatusForm-${context}`;
    const fieldSku = sku ? `${sku.article || sku.articleKey} · ${sku.name || ''}` : '';
    return `
      <form id="${formId}" class="v82-status-form" data-v82-form-context="${context}">
        ${context === 'control' ? `
          <div class="field full-span">
            <label>SKU / артикул</label>
            <input name="skuSearch" list="v82SkuSearchList" placeholder="Начни вводить артикул или название" value="${escapeHtml(fieldSku)}" required>
            <input type="hidden" name="articleKey" value="${escapeHtml(articleKey || row?.articleKey || '')}">
            ${skuOptionsDatalist('v82SkuSearchList')}
          </div>
        ` : `<input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">`}
        <div class="field">
          <label>Статус</label>
          <select name="statusCode">${Object.entries(STATUS_META).map(([value, meta]) => `<option value="${value}" ${row?.statusCode === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Риск</label>
          <select name="riskLevel">${Object.entries(RISK_META).map(([value, meta]) => `<option value="${value}" ${((row?.riskLevel || 'none') === value) ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Приоритет</label>
          <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${(row?.priority || 'medium') === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Срок</label>
          <input type="date" name="dueDate" value="${escapeHtml(row?.dueDate || '')}">
        </div>
        <div class="field full-span">
          <label>Следующий шаг</label>
          <input name="nextStep" placeholder="Что конкретно делаем дальше" value="${escapeHtml(row?.nextStep || '')}" required>
        </div>
        <div class="field full-span">
          <label>Комментарий / root cause</label>
          <textarea name="comment" rows="3" placeholder="Почему SKU в таком статусе, что мешает, что уже сделали">${escapeHtml(row?.comment || '')}</textarea>
        </div>
        <div class="field">
          <label>Owner</label>
          <input name="ownerName" list="v82OwnerList" value="${escapeHtml(row?.ownerName || ownerName(sku) || '')}" placeholder="Кто ведёт SKU">
        </div>
        <div class="field">
          <label>Тип встречи</label>
          <select name="meetingType">
            ${['weekly_mp', 'weekly_rop', 'executive', 'pricing', 'launch_review', 'manual'].map((value) => `<option value="${value}" ${(row?.meetingType || 'weekly_rop') === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}
          </select>
        </div>
        <div class="field v82-checkbox-field">
          <label><input type="checkbox" name="needsTask" ${row?.needsTask ? 'checked' : ''}> Сразу создать action-item в задачнике</label>
        </div>
        <div class="field v82-checkbox-field">
          <label><input type="checkbox" name="riskFlag" ${row?.riskFlag ? 'checked' : ''}> Подсветить как риск</label>
        </div>
        <input type="hidden" name="editId" value="${escapeHtml(row?.id || '')}">
        <datalist id="v82OwnerList">${ownerOptions().map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <div class="v82-form-actions full-span">
          <button class="btn primary" type="submit">${row ? 'Сохранить статус' : 'Добавить статус'}</button>
          ${row ? '<button class="btn ghost" type="button" data-v82-cancel-edit>Отменить</button>' : ''}
        </div>
      </form>
    `;
  }

  function historyRowsHtml(articleKey) {
    const rows = rowsForSku(articleKey, MARKETPLACE);
    if (!rows.length) return '<div class="empty">История статусов пока пустая</div>';
    return rows.slice(0, 8).map((row) => `
      <div class="v82-history-row">
        <div>
          <strong>${escapeHtml(row.statusText || STATUS_META[row.statusCode]?.label || 'Статус')}</strong>
          <div class="muted small">${escapeHtml(row.updatedBy || 'Команда')} · ${fmt.date(row.updatedAt)}</div>
        </div>
        <div class="badge-stack">${statusBadgeHtml(row)}${riskBadgeHtml(row)}</div>
        <div class="muted small">${escapeHtml(row.nextStep || row.comment || 'Без следующего шага')}</div>
        <div class="v82-row-actions">
          <button class="btn tiny ghost" type="button" data-v82-edit-status="${escapeHtml(row.id)}">Править</button>
          ${row.sourceType === 'seed' ? '' : `<button class="btn tiny ghost danger" type="button" data-v82-delete-status="${escapeHtml(row.id)}">Удалить</button>`}
        </div>
      </div>
    `).join('');
  }

  function skuStatusCardHtml(articleKey) {
    const current = latestForSku(articleKey, MARKETPLACE);
    const editing = state.v82.formContext === 'sku' && state.v82.formOpen;
    const editRow = state.v82.editId ? allRows().find((row) => row.id === state.v82.editId) : null;
    return `
      <div class="card subtle v82-status-card">
        <div class="section-subhead">
          <div>
            <h3>Форма статусов РОПа WB</h3>
            <p class="small muted">Файл Маши перенесён в портал: статус, риск, следующий шаг, срок и связь с задачником хранятся в Supabase.</p>
          </div>
          <div class="badge-stack">${statusBadgeHtml(current)}${riskBadgeHtml(current)}</div>
        </div>
        ${current ? `
          <div class="v82-status-grid">
            <div class="note-box"><strong>Следующий шаг</strong><div class="muted small" style="margin-top:6px">${escapeHtml(current.nextStep || 'Не заполнен')}</div></div>
            <div class="note-box"><strong>Комментарий</strong><div class="muted small" style="margin-top:6px">${escapeHtml(current.comment || current.rootCause || 'Без комментария')}</div></div>
            <div class="note-box"><strong>Срок / источник</strong><div class="muted small" style="margin-top:6px">${escapeHtml(current.dueDate || '—')} · ${escapeHtml(current.sourceType || 'portal_form')}</div></div>
          </div>
        ` : '<div class="empty">По этому SKU пока нет WB-статуса. Добавь первую запись прямо в портале.</div>'}
        <div class="v82-form-toolbar">
          <span class="muted small">${escapeHtml(sourceCaption())}</span>
          <button class="btn ${editing ? 'ghost' : ''}" type="button" data-v82-open-form="sku">${editing ? 'Свернуть форму' : 'Обновить статус WB'}</button>
        </div>
        ${editing ? `<div class="v82-inline-form-wrap">${statusFormHtml('sku', articleKey, editRow && editRow.articleKey === articleKey ? editRow : null)}</div>` : ''}
        <div class="status-history-block">${historyRowsHtml(articleKey)}</div>
      </div>
    `;
  }

  function currentSummaryHtml() {
    const rows = latestRows(MARKETPLACE);
    const risk = rows.filter((row) => row.riskFlag || row.riskLevel === 'high').length;
    const wait = rows.filter((row) => row.statusCode === 'waiting_decision').length;
    const due = rows.filter((row) => row.dueDate && row.dueDate <= plusDays(7)).length;
    return `
      <div class="v82-kpis">
        <div class="mini-kpi"><span>Текущих SKU-статусов</span><strong>${fmt.int(rows.length)}</strong></div>
        <div class="mini-kpi ${risk ? 'warn' : ''}"><span>С риском</span><strong>${fmt.int(risk)}</strong></div>
        <div class="mini-kpi ${wait ? 'danger' : ''}"><span>Ждут решения</span><strong>${fmt.int(wait)}</strong></div>
        <div class="mini-kpi ${due ? 'warn' : ''}"><span>Срок ≤ 7 дн.</span><strong>${fmt.int(due)}</strong></div>
      </div>
    `;
  }

  function controlRowsHtml() {
    const search = String(state.v82.controlSearch || '').trim().toLowerCase();
    const rows = latestRows(MARKETPLACE).filter((row) => {
      const hay = [row.article, row.articleKey, row.skuName, row.ownerName, row.nextStep, row.comment].filter(Boolean).join(' ').toLowerCase();
      return !search || hay.includes(search);
    });
    if (!rows.length) return '<tr><td colspan="8" class="muted text-center">Пока нет статусов WB</td></tr>';
    return rows.map((row) => `
      <tr>
        <td>${linkToSku(row.articleKey, row.article || row.articleKey)}</td>
        <td><div><strong>${escapeHtml(row.skuName || 'Без названия')}</strong></div><div class="muted small">${escapeHtml(row.ownerName || 'Без owner')}</div></td>
        <td><div class="badge-stack">${statusBadgeHtml(row)}${riskBadgeHtml(row)}</div></td>
        <td class="muted small">${escapeHtml(row.nextStep || '—')}</td>
        <td>${escapeHtml(row.dueDate || '—')}</td>
        <td>${escapeHtml(row.updatedBy || 'Команда')}</td>
        <td class="muted small">${fmt.date(row.updatedAt)}</td>
        <td>
          <div class="v82-row-actions">
            <button class="btn tiny ghost" type="button" data-v82-edit-status="${escapeHtml(row.id)}">Править</button>
            ${row.sourceType === 'seed' ? '' : `<button class="btn tiny ghost danger" type="button" data-v82-delete-status="${escapeHtml(row.id)}">Удалить</button>`}
          </div>
        </td>
      </tr>
    `).join('');
  }

  function controlWorkspaceHtml() {
    const editing = state.v82.formContext === 'control' && state.v82.formOpen;
    const editRow = state.v82.editId ? allRows().find((row) => row.id === state.v82.editId) : null;
    return `
      <div class="card v82-control-card">
        <div class="section-subhead">
          <div>
            <h3>Форма статусов WB · РОП</h3>
            <p class="small muted">Это уже не отдельный файл. РОП обновляет статус по SKU прямо в портале, а запись уходит в Supabase и при необходимости превращается в задачу.</p>
          </div>
          <div class="badge-stack">${badge('WB', 'info')}${badge(sourceCaption(), '')}</div>
        </div>
        ${currentSummaryHtml()}
        <div class="v82-toolbar">
          <input id="v82ControlSearch" placeholder="Поиск по артикулу, SKU, owner, next step…" value="${escapeHtml(state.v82.controlSearch || '')}">
          <button class="btn" type="button" data-v82-open-form="control">${editing ? 'Свернуть форму' : 'Новая запись статуса'}</button>
        </div>
        ${editing ? `<div class="v82-control-form-wrap">${statusFormHtml('control', editRow?.articleKey || '', editRow)}</div>` : ''}
        <div class="table-wrap" style="margin-top:12px">
          <table class="compact-table v82-status-table">
            <thead>
              <tr>
                <th>Артикул</th>
                <th>SKU / owner</th>
                <th>Статус</th>
                <th>Следующий шаг</th>
                <th>Срок</th>
                <th>Кто обновил</th>
                <th>Обновлено</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>${controlRowsHtml()}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function executiveStatusHtml() {
    const rows = latestRows(MARKETPLACE);
    const top = rows.filter((row) => row.riskFlag || row.statusCode === 'waiting_decision').slice(0, 8);
    return `
      <div class="card v82-exec-status-card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>WB статусы РОПа</h3>
            <p class="small muted">Сводка по текущим статусам SKU из формы РОПа WB, без дубля второго задачника.</p>
          </div>
          <div class="badge-stack">${badge(`${fmt.int(rows.length)} SKU`, 'info')}${badge(`${fmt.int(top.length)} в фокусе`, top.length ? 'warn' : 'ok')}</div>
        </div>
        <div class="alert-stack">
          ${top.length ? top.map((row) => `
            <div class="alert-row">
              <div>
                <strong>${linkToSku(row.articleKey, row.article || row.articleKey)}</strong>
                <div class="muted small">${escapeHtml(row.skuName || '')}</div>
              </div>
              <div class="badge-stack">${statusBadgeHtml(row)}${riskBadgeHtml(row)}</div>
              <div class="muted small">${escapeHtml(row.nextStep || row.comment || 'Без следующего шага')}</div>
            </div>
          `).join('') : '<div class="empty">Нет рискованных WB-статусов</div>'}
        </div>
      </div>
    `;
  }

  function injectModalStatusCard(articleKey) {
    const body = document.getElementById('skuModalBody');
    if (!body) return;
    body.querySelectorAll('.v81-status-card, .v82-status-card').forEach((el) => el.remove());
    const anchor = body.querySelector('.modal-grid-3') || body.querySelector('.two-col');
    if (anchor) anchor.insertAdjacentHTML('beforebegin', skuStatusCardHtml(articleKey));
    wireStatusForms(body, articleKey);
  }

  function injectControlWorkspace() {
    const root = document.getElementById('view-control');
    if (!root) return;
    root.querySelectorAll('.v81-status-summary-card, .v82-control-card').forEach((el) => el.remove());
    const grid = root.querySelector('.check-grid');
    if (grid) grid.insertAdjacentHTML('beforeend', controlWorkspaceHtml());
    else root.insertAdjacentHTML('beforeend', controlWorkspaceHtml());
    wireStatusForms(root);
    const search = root.querySelector('#v82ControlSearch');
    if (search) search.addEventListener('input', (event) => {
      state.v82.controlSearch = event.target.value;
      injectControlWorkspace();
    });
  }

  function injectExecutiveStatus() {
    const root = document.getElementById('view-executive');
    if (!root) return;
    root.querySelectorAll('.v81-exec-status-card, .v82-exec-status-card').forEach((el) => el.remove());
    root.insertAdjacentHTML('beforeend', executiveStatusHtml());
  }

  function resolveArticleKeyFromForm(form, presetArticleKey = '') {
    if (presetArticleKey) return presetArticleKey;
    const direct = String(form.querySelector('[name="articleKey"]')?.value || '').trim();
    if (direct) return direct;
    const search = String(form.querySelector('[name="skuSearch"]')?.value || '').trim();
    const sku = findSkuBySearch(search);
    if (!sku) return '';
    const hidden = form.querySelector('[name="articleKey"]');
    if (hidden) hidden.value = sku.articleKey;
    return sku.articleKey;
  }

  function resetFormState(context = 'control', articleKey = '') {
    state.v82.formOpen = false;
    state.v82.formMode = 'create';
    state.v82.formContext = context;
    state.v82.editId = '';
    if (context === 'sku' && articleKey) state.activeSku = articleKey;
  }

  function openForm(context, articleKey = '', editId = '') {
    state.v82.formOpen = true;
    state.v82.formContext = context;
    state.v82.formMode = editId ? 'edit' : 'create';
    state.v82.editId = editId;
    if (articleKey) state.activeSku = articleKey;
    rerenderCurrentView();
    if (state.activeSku) renderSkuModal(state.activeSku);
  }

  async function handleStatusSubmit(form, presetArticleKey = '') {
    const articleKey = resolveArticleKeyFromForm(form, presetArticleKey);
    if (!articleKey) {
      setAppError('Для статуса WB нужно выбрать SKU / артикул.');
      return;
    }
    const sku = getSku(articleKey);
    const currentEditId = String(form.querySelector('[name="editId"]')?.value || '').trim();
    const existing = currentEditId ? allRows().find((row) => row.id === currentEditId) : null;
    const riskLevel = String(form.querySelector('[name="riskLevel"]')?.value || 'none').trim();
    const nextStep = String(form.querySelector('[name="nextStep"]')?.value || '').trim();
    if (!nextStep) {
      setAppError('Следующий шаг по статусу WB обязателен.');
      return;
    }

    const row = normalizeStatusRow({
      ...(existing || {}),
      id: existing?.id || uid('masha-status'),
      marketplace: MARKETPLACE,
      articleKey,
      article: sku?.article || articleKey,
      skuName: sku?.name || existing?.skuName || '',
      ownerName: String(form.querySelector('[name="ownerName"]')?.value || ownerName(sku) || existing?.ownerName || '').trim(),
      statusCode: String(form.querySelector('[name="statusCode"]')?.value || 'ok').trim(),
      riskLevel,
      riskFlag: Boolean(form.querySelector('[name="riskFlag"]')?.checked || riskLevel === 'medium' || riskLevel === 'high'),
      nextStep,
      comment: String(form.querySelector('[name="comment"]')?.value || '').trim(),
      dueDate: String(form.querySelector('[name="dueDate"]')?.value || '').trim(),
      needsTask: Boolean(form.querySelector('[name="needsTask"]')?.checked),
      priority: String(form.querySelector('[name="priority"]')?.value || 'medium').trim(),
      rootCause: String(form.querySelector('[name="comment"]')?.value || '').trim(),
      meetingType: String(form.querySelector('[name="meetingType"]')?.value || 'weekly_rop').trim(),
      sourceName: 'portal_wb_status_form',
      sourceType: 'portal_form',
      updatedBy: state.team.member?.name || 'Команда',
      statusDate: todayIso(),
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString()
    });

    await persistStatusRow(row);
    resetFormState(form.dataset.v82FormContext || 'control', articleKey);
    rerenderCurrentView();
    if (articleKey) renderSkuModal(articleKey);
  }

  function wireStatusForms(root, presetArticleKey = '') {
    if (!root) return;
    root.querySelectorAll('[data-v82-open-form]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const context = btn.dataset.v82OpenForm || 'control';
        const isSame = state.v82.formOpen && state.v82.formContext === context && !state.v82.editId;
        if (isSame) resetFormState(context, presetArticleKey);
        else openForm(context, presetArticleKey, '');
      });
    });

    root.querySelectorAll('[data-v82-edit-status]').forEach((btn) => btn.addEventListener('click', () => {
      const row = allRows().find((item) => item.id === btn.dataset.v82EditStatus);
      if (!row) return;
      openForm(presetArticleKey ? 'sku' : 'control', row.articleKey, row.id);
    }));

    root.querySelectorAll('[data-v82-delete-status]').forEach((btn) => btn.addEventListener('click', async () => {
      const row = allRows().find((item) => item.id === btn.dataset.v82DeleteStatus);
      if (!row) return;
      const ok = window.confirm(`Удалить статус WB по ${row.article || row.articleKey}?`);
      if (!ok) return;
      await removeStatusRow(row.id);
    }));

    root.querySelectorAll('[data-v82-cancel-edit]').forEach((btn) => btn.addEventListener('click', () => {
      resetFormState(presetArticleKey ? 'sku' : 'control', presetArticleKey);
      rerenderCurrentView();
      if (presetArticleKey) renderSkuModal(presetArticleKey);
    }));

    root.querySelectorAll('.v82-status-form').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await handleStatusSubmit(form, presetArticleKey);
      });
      const searchInput = form.querySelector('[name="skuSearch"]');
      if (searchInput) {
        searchInput.addEventListener('change', () => { resolveArticleKeyFromForm(form, ''); });
        searchInput.addEventListener('blur', () => { resolveArticleKeyFromForm(form, ''); });
      }
    });
  }

  const prevRenderSkuRegistry = renderSkuRegistry;
  renderSkuRegistry = function () {
    prevRenderSkuRegistry();
    try { enhanceSkuRegistryV82(); } catch (error) { console.error(error); }
  };

  const prevRenderSkuModal = renderSkuModal;
  renderSkuModal = function (articleKey) {
    prevRenderSkuModal(articleKey);
    try { injectModalStatusCard(articleKey); } catch (error) { console.error(error); }
  };

  const prevRenderControlCenter = renderControlCenter;
  renderControlCenter = function () {
    prevRenderControlCenter();
    try { injectControlWorkspace(); } catch (error) { console.error(error); }
  };

  const prevRenderExecutive = renderExecutive;
  renderExecutive = function () {
    prevRenderExecutive();
    try { injectExecutiveStatus(); } catch (error) { console.error(error); }
  };

  const basePullRemoteState = pullRemoteState;
  pullRemoteState = async function (rerender = true) {
    await basePullRemoteState(false);
    await pullRemoteStatuses(false);
    if (rerender) {
      rerenderCurrentView();
      if (state.activeSku) renderSkuModal(state.activeSku);
    }
  };

  const basePushStateToRemote = pushStateToRemote;
  pushStateToRemote = async function () {
    await basePushStateToRemote();
    await pushRemoteStatuses();
    rerenderCurrentView();
    if (state.activeSku) renderSkuModal(state.activeSku);
  };

  async function bootstrapRemote(retry = 0) {
    if (hasRemoteStore()) {
      await pullRemoteStatuses(true);
      return;
    }
    if (retry >= REMOTE_RETRY_MAX) return;
    setTimeout(() => { bootstrapRemote(retry + 1); }, 1000);
  }

  async function boot() {
    loadLocalRows();
    await loadFileSeed();
    applyMergedRows(state.v82.localRows.length
      ? `WB форма статусов: локальные + seed данные · ${fmt.int(mergeSources().length)}`
      : `WB форма статусов готова · ${fmt.int(mergeSources().length)} записей`);
    try {
      rerenderCurrentView();
      if (state.activeSku) renderSkuModal(state.activeSku);
    } catch (error) {
      console.error(error);
    }
    bootstrapRemote(0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else setTimeout(boot, 0);
})();
