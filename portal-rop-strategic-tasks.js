(function () {
  if (window.__ALTEA_ROP_STRATEGIC_TASKS__) return;
  window.__ALTEA_ROP_STRATEGIC_TASKS__ = true;

  const DATA_PATH = 'data/rop_strategic_tasks.json';
  const STORAGE_READY_POLL_MS = 120;
  const STATUS_ORDER = ['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision', 'done'];
  const STATUS_META = {
    new: { label: 'Не начато', tone: 'warn' },
    in_progress: { label: 'В работе', tone: 'info' },
    waiting_team: { label: 'Блокер', tone: 'warn' },
    waiting_rop: { label: 'У РОПа', tone: 'warn' },
    waiting_decision: { label: 'Эскалация', tone: 'danger' },
    done: { label: 'Готово', tone: 'ok' },
    cancelled: { label: 'Отменено', tone: '' }
  };
  const PRIORITY_META_LOCAL = {
    critical: { label: 'Критичный', tone: 'danger', rank: 4 },
    high: { label: 'Высокий', tone: 'warn', rank: 3 },
    medium: { label: 'Средний', tone: 'info', rank: 2 },
    low: { label: 'Низкий', tone: '', rank: 1 }
  };

  let dataPromise = null;
  let ropData = null;
  let mergeDone = false;
  let originalRenderControlCenter = null;
  let originalRenderExecutive = null;
  let originalPullRemoteState = null;

  function appState() {
    if (window.__alteaAppState) return window.__alteaAppState;
    try {
      if (typeof state !== 'undefined') return state;
    } catch (error) {}
    return null;
  }

  function html(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function intFmt(value) {
    if (typeof fmt !== 'undefined' && fmt?.int) return fmt.int(value);
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat('ru-RU').format(number) : '0';
  }

  function moneyFmt(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number === 0) return '—';
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(number);
  }

  function pctFmt(value) {
    if (value === null || value === undefined || value === '') return '—';
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${(number * 100).toFixed(1)}%`;
  }

  function chip(label, tone = '') {
    if (typeof badge === 'function') return badge(label, tone);
    return `<span class="chip ${html(tone)}">${html(label)}</span>`;
  }

  function todayKey() {
    if (typeof todayIso === 'function') return todayIso();
    return new Date().toISOString().slice(0, 10);
  }

  function isActive(status) {
    return !['done', 'cancelled'].includes(String(status || 'new'));
  }

  function isOverdueDate(due, status) {
    return Boolean(due) && isActive(status) && String(due) < todayKey();
  }

  function statusMeta(status) {
    return STATUS_META[status] || STATUS_META.new;
  }

  function priorityMeta(priority) {
    return PRIORITY_META_LOCAL[priority] || PRIORITY_META_LOCAL.high;
  }

  function strategicState() {
    const st = appState();
    if (!st) return {};
    st.ropStrategic = st.ropStrategic && typeof st.ropStrategic === 'object' ? st.ropStrategic : {};
    st.ropStrategic.tab = st.ropStrategic.tab || 'tasks';
    st.ropStrategic.filters = st.ropStrategic.filters && typeof st.ropStrategic.filters === 'object'
      ? st.ropStrategic.filters
      : {};
    st.ropStrategic.filters.search = String(st.ropStrategic.filters.search || '');
    st.ropStrategic.filters.owner = String(st.ropStrategic.filters.owner || 'all');
    st.ropStrategic.filters.platform = String(st.ropStrategic.filters.platform || 'all');
    st.ropStrategic.filters.status = String(st.ropStrategic.filters.status || 'active');
    st.ropStrategic.filters.priority = String(st.ropStrategic.filters.priority || 'all');
    return st.ropStrategic;
  }

  function strategicModeEnabled() {
    return Boolean(strategicState().enabled);
  }

  async function loadRopData() {
    if (ropData) return ropData;
    if (!dataPromise) {
      dataPromise = fetch(`${DATA_PATH}?v=20260522strategic2`, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error(`Не удалось загрузить ${DATA_PATH}`);
          return response.json();
        })
        .then((payload) => {
          ropData = payload || { tasks: [], adPassports: [], contacts: [], raci: [] };
          return ropData;
        });
    }
    return dataPromise;
  }

  function buildPortalTask(seed) {
    const reasonParts = [
      seed.metricsBasis ? `Основание: ${seed.metricsBasis}` : '',
      seed.target ? `Цель: ${seed.target}` : '',
      seed.deliverable ? `Артефакт: ${seed.deliverable}` : '',
      seed.dependencies ? `Зависимости: ${seed.dependencies}` : ''
    ].filter(Boolean);
    return {
      id: seed.id,
      source: 'strategic',
      articleKey: '',
      title: seed.title || seed.sourceId || 'Стратегическая задача',
      nextAction: seed.nextAction || seed.deliverable || '',
      reason: reasonParts.join('\n'),
      owner: seed.owner || '',
      due: seed.dueDate || '',
      status: seed.status || 'new',
      type: seed.taskType || 'general',
      priority: seed.priority || 'high',
      platform: seed.platformKey || 'cross',
      createdAt: seed.createdAt || new Date().toISOString(),
      updatedAt: seed.updatedAt || seed.createdAt || new Date().toISOString(),
      entityLabel: `${seed.sourceId || seed.id} · ${seed.rop || seed.owner || 'РОП'} · ${seed.platform || 'площадка'}`,
      autoCode: 'rop_strategic'
    };
  }

  function materializeStrategicTasks(payload) {
    const st = appState();
    if (!st?.storage || !Array.isArray(payload?.tasks)) return false;
    st.storage.tasks = Array.isArray(st.storage.tasks) ? st.storage.tasks : [];
    const existingIds = new Set(st.storage.tasks.map((task) => String(task?.id || '')));
    let added = 0;
    for (const seed of payload.tasks) {
      if (!seed?.id || existingIds.has(seed.id)) continue;
      st.storage.tasks.push(buildPortalTask(seed));
      existingIds.add(seed.id);
      added += 1;
    }
    if (added) {
      try {
        if (typeof saveLocalStorage === 'function') saveLocalStorage();
      } catch (error) {}
      try {
        if (typeof window.invalidateControlTaskCache === 'function') window.invalidateControlTaskCache();
      } catch (error) {}
    }
    mergeDone = true;
    return added > 0;
  }

  async function ensureStrategicDataMerged() {
    const payload = await loadRopData();
    return materializeStrategicTasks(payload);
  }

  function waitForPortalReady(callback) {
    const st = appState();
    if (st?.boot?.dataReady && window.__ALTEA_PRIMARY_INIT_FINISHED__) {
      callback();
      return;
    }
    window.setTimeout(() => waitForPortalReady(callback), STORAGE_READY_POLL_MS);
  }

  function allPortalTasks() {
    try {
      if (typeof getAllTasks === 'function') return getAllTasks();
    } catch (error) {}
    const st = appState();
    return Array.isArray(st?.storage?.tasks) ? st.storage.tasks : [];
  }

  function runtimeTaskFor(seed) {
    const runtime = allPortalTasks().find((task) => String(task?.id || '') === seed.id);
    return runtime || buildPortalTask(seed);
  }

  function strategicRows(payload) {
    return (payload?.tasks || []).map((seed) => {
      const task = runtimeTaskFor(seed);
      return {
        seed,
        task,
        sourceId: seed.sourceId || seed.id,
        owner: task.owner || seed.owner || '',
        platform: seed.platform || task.platform || '',
        platformKey: seed.platformKey || task.platform || 'cross',
        kpiBlock: seed.kpiBlock || '',
        title: task.title || seed.title || '',
        due: task.due || seed.dueDate || '',
        status: task.status || seed.status || 'new',
        priority: task.priority || seed.priority || 'high',
        nextAction: task.nextAction || seed.nextAction || '',
        deliverable: seed.deliverable || '',
        target: seed.target || '',
        metricsBasis: seed.metricsBasis || '',
        cadence: seed.cadence || '',
        impact: seed.impact || '',
        dependencies: seed.dependencies || ''
      };
    });
  }

  function filterRows(rows) {
    const filters = strategicState().filters;
    const search = String(filters.search || '').trim().toLowerCase();
    return rows.filter((row) => {
      const haystack = [
        row.sourceId,
        row.owner,
        row.platform,
        row.kpiBlock,
        row.title,
        row.nextAction,
        row.deliverable,
        row.target
      ].join(' ').toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
      if (filters.platform !== 'all' && row.platformKey !== filters.platform && row.platform !== filters.platform) return false;
      if (filters.priority !== 'all' && row.priority !== filters.priority) return false;
      if (filters.status === 'active' && !isActive(row.status)) return false;
      if (filters.status !== 'all' && filters.status !== 'active' && row.status !== filters.status) return false;
      return true;
    });
  }

  function ownerSummary(rows, owner) {
    const ownerRows = rows.filter((row) => row.owner === owner);
    const done = ownerRows.filter((row) => row.status === 'done').length;
    const active = ownerRows.filter((row) => isActive(row.status)).length;
    const critical = ownerRows.filter((row) => row.priority === 'critical' && isActive(row.status)).length;
    const overdue = ownerRows.filter((row) => isOverdueDate(row.due, row.status)).length;
    const progress = ownerRows.length ? Math.round((done / ownerRows.length) * 100) : 0;
    return { owner, rows: ownerRows, total: ownerRows.length, done, active, critical, overdue, progress };
  }

  function buildSummary(rows) {
    const active = rows.filter((row) => isActive(row.status));
    const done = rows.filter((row) => row.status === 'done');
    const critical = active.filter((row) => row.priority === 'critical');
    const blocked = active.filter((row) => row.status === 'waiting_team');
    const overdue = active.filter((row) => isOverdueDate(row.due, row.status));
    const progress = rows.length ? Math.round((done.length / rows.length) * 100) : 0;
    return { total: rows.length, active: active.length, done: done.length, critical: critical.length, blocked: blocked.length, overdue: overdue.length, progress };
  }

  function platformOptions(rows) {
    const options = new Map([['all', 'Все площадки']]);
    rows.forEach((row) => {
      const key = row.platformKey || row.platform || 'cross';
      if (!options.has(key)) options.set(key, row.platform || key);
    });
    return [...options.entries()];
  }

  function renderLaunchBlock(payload) {
    return `
      <div class="rop-strategic-launch" data-rop-strategic-launch>
        <div>
          <strong>Стратегические задачи РОПов до 5 июня</strong>
          <span>${intFmt(payload?.summary?.taskCount || 23)} задач · ${intFmt(payload?.summary?.criticalCount || 8)} критичных · РК паспорта, contact log и RACI/SLA</span>
        </div>
        <button class="btn primary" type="button" data-rop-strategic-open>Открыть</button>
      </div>
    `;
  }

  function renderTabs() {
    const tab = strategicState().tab;
    const tabs = [
      ['tasks', 'Задачи'],
      ['ads', 'РК паспорта'],
      ['contacts', 'Contact log'],
      ['raci', 'RACI/SLA']
    ];
    return `
      <div class="rop-strategic-tabs">
        ${tabs.map(([key, label]) => `<button class="quick-chip ${tab === key ? 'active' : ''}" type="button" data-rop-tab="${key}">${label}</button>`).join('')}
        <button class="quick-chip" type="button" data-rop-strategic-close>Обычные задачи</button>
      </div>
    `;
  }

  function renderFilters(rows) {
    const filters = strategicState().filters;
    const owners = ['all', ...new Set(rows.map((row) => row.owner).filter(Boolean))];
    return `
      <div class="rop-strategic-filters">
        <input data-rop-filter="search" value="${html(filters.search)}" placeholder="Поиск по задаче, KPI, артефакту">
        <select data-rop-filter="owner">
          ${owners.map((owner) => `<option value="${html(owner)}" ${filters.owner === owner ? 'selected' : ''}>${owner === 'all' ? 'Все РОПы' : html(owner)}</option>`).join('')}
        </select>
        <select data-rop-filter="platform">
          ${platformOptions(rows).map(([key, label]) => `<option value="${html(key)}" ${filters.platform === key ? 'selected' : ''}>${html(label)}</option>`).join('')}
        </select>
        <select data-rop-filter="status">
          <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Активные</option>
          <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Все статусы</option>
          ${STATUS_ORDER.map((key) => `<option value="${key}" ${filters.status === key ? 'selected' : ''}>${html(statusMeta(key).label)}</option>`).join('')}
        </select>
        <select data-rop-filter="priority">
          <option value="all" ${filters.priority === 'all' ? 'selected' : ''}>Все приоритеты</option>
          ${Object.entries(PRIORITY_META_LOCAL).map(([key, meta]) => `<option value="${key}" ${filters.priority === key ? 'selected' : ''}>${html(meta.label)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  function renderKpiStrip(summary, payload) {
    return `
      <div class="kpi-strip">
        <div class="mini-kpi"><span>Всего</span><strong>${intFmt(summary.total)}</strong><span>стратегических задач</span></div>
        <div class="mini-kpi warn"><span>Активно</span><strong>${intFmt(summary.active)}</strong><span>в работе до ${html(payload.targetDate || '2026-06-05')}</span></div>
        <div class="mini-kpi danger"><span>Критично</span><strong>${intFmt(summary.critical)}</strong><span>реклама, данные, коммуникации</span></div>
        <div class="mini-kpi danger"><span>Просрочено</span><strong>${intFmt(summary.overdue)}</strong><span>нужен апдейт срока</span></div>
        <div class="mini-kpi warn"><span>Блокеры</span><strong>${intFmt(summary.blocked)}</strong><span>ждет функций или площадку</span></div>
        <div class="mini-kpi"><span>Готовность</span><strong>${intFmt(summary.progress)}%</strong><span>${intFmt(summary.done)} закрыто</span></div>
      </div>
    `;
  }

  function renderOwnerCards(rows) {
    const owners = [...new Set(rows.map((row) => row.owner).filter(Boolean))];
    return `
      <div class="rop-strategic-owner-grid">
        ${owners.map((owner) => {
          const model = ownerSummary(rows, owner);
          return `
            <div class="rop-owner-card ${model.overdue || model.critical ? 'is-risk' : ''}">
              <div class="rop-owner-card-head">
                <div>
                  <h3>${html(owner)}</h3>
                  <p>${intFmt(model.active)} активно · ${intFmt(model.done)} готово</p>
                </div>
                ${chip(`${intFmt(model.progress)}%`, model.progress >= 80 ? 'ok' : model.progress ? 'info' : 'warn')}
              </div>
              <div class="rop-progress"><span style="width:${Math.max(4, model.progress)}%"></span></div>
              <div class="badge-stack">
                ${chip(`${intFmt(model.total)} задач`)}
                ${chip(`${intFmt(model.critical)} крит.`, model.critical ? 'danger' : 'ok')}
                ${chip(`${intFmt(model.overdue)} проср.`, model.overdue ? 'danger' : 'ok')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderTaskForm(row) {
    return `
      <form class="rop-inline-form" data-rop-task-form="${html(row.task.id)}">
        <input name="owner" value="${html(row.owner)}" list="ropStrategicOwners" placeholder="Owner">
        <input name="due" type="date" value="${html(row.due)}">
        <select name="status">
          ${STATUS_ORDER.map((key) => `<option value="${key}" ${row.status === key ? 'selected' : ''}>${html(statusMeta(key).label)}</option>`).join('')}
          <option value="cancelled" ${row.status === 'cancelled' ? 'selected' : ''}>Отменено</option>
        </select>
        <textarea name="nextAction" rows="1" placeholder="Следующее действие">${html(row.nextAction)}</textarea>
        <div class="rop-inline-actions">
          <button class="btn small-btn" type="submit">Сохранить</button>
          <button class="btn ghost small-btn" type="button" data-open-task="${html(row.task.id)}">Открыть</button>
        </div>
      </form>
    `;
  }

  function renderTaskTable(rows) {
    const filtered = filterRows(rows);
    const ownerOptions = [...new Set(rows.map((row) => row.owner).filter(Boolean))];
    return `
      <datalist id="ropStrategicOwners">${ownerOptions.map((owner) => `<option value="${html(owner)}"></option>`).join('')}</datalist>
      <div class="table-wrap rop-strategic-table">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>РОП / площадка</th>
              <th>KPI-блок</th>
              <th>Задача и критерий</th>
              <th>Срок</th>
              <th>Статус</th>
              <th>Правка</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((row) => {
              const overdue = isOverdueDate(row.due, row.status);
              const sMeta = statusMeta(row.status);
              const pMeta = priorityMeta(row.priority);
              return `
                <tr class="${overdue ? 'is-overdue' : ''} ${row.priority === 'critical' ? 'is-critical' : ''}">
                  <td><strong>${html(row.sourceId)}</strong><div class="badge-stack" style="margin-top:8px">${chip(pMeta.label, pMeta.tone)}</div></td>
                  <td><strong>${html(row.owner || '—')}</strong><div class="muted small">${html(row.platform || '—')}</div></td>
                  <td>${html(row.kpiBlock || '—')}<div class="muted small" style="margin-top:6px">${html(row.cadence || '')}</div></td>
                  <td>
                    <div class="rop-task-title">${html(row.title)}</div>
                    <div class="rop-task-context">${html(row.deliverable || row.target || '')}</div>
                  </td>
                  <td>${chip(row.due || '—', overdue ? 'danger' : '')}</td>
                  <td>${chip(sMeta.label, overdue ? 'danger' : sMeta.tone)}</td>
                  <td>${renderTaskForm(row)}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="7"><div class="empty">По этим фильтрам задач нет</div></td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTaskDetails(rows) {
    const filtered = filterRows(rows).slice(0, 6);
    return `
      <div class="rop-detail-grid">
        ${filtered.map((row) => `
          <div class="rop-detail-item">
            <strong>${html(row.sourceId)} · ${html(row.kpiBlock)}</strong>
            <span>${html(row.metricsBasis || row.impact || row.target || '')}</span>
            <div class="badge-stack" style="margin-top:10px">${chip(row.owner, 'info')}${chip(row.platform)}${chip(row.due || '—', isOverdueDate(row.due, row.status) ? 'danger' : '')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderTasksTab(payload, rows) {
    const summary = buildSummary(rows);
    return `
      ${renderFilters(rows)}
      ${renderKpiStrip(summary, payload)}
      ${renderOwnerCards(rows)}
      <div class="rop-warning-line">Контрольное правило: у каждой РК, ценового расхождения, OOS-риска и коммуникации должен быть владелец, срок и следующее действие. Финальный дедлайн контура: ${html(payload.targetDate || '2026-06-05')}.</div>
      ${renderTaskTable(rows)}
      ${renderTaskDetails(rows)}
    `;
  }

  function filterByOwnerAndPlatform(items, ownerKey = 'rop') {
    const filters = strategicState().filters;
    return (items || []).filter((item) => {
      if (filters.owner !== 'all' && item[ownerKey] !== filters.owner) return false;
      if (filters.platform !== 'all') {
        const platformKey = String(item.platform || '').toLowerCase();
        if (!platformKey.includes(filters.platform) && !(filters.platform === 'ya' && /ям|яндекс/i.test(item.platform || ''))) return false;
      }
      return true;
    });
  }

  function renderAdsTab(payload, rows) {
    const items = filterByOwnerAndPlatform(payload.adPassports || []);
    return `
      ${renderFilters(rows)}
      <div class="table-wrap rop-compact-table">
        <table>
          <thead><tr><th>РОП</th><th>Площадка</th><th>Кампания</th><th>Экономика</th><th>Решение</th><th>Следующее действие</th></tr></thead>
          <tbody>
            ${items.map((item) => `
              <tr>
                <td><strong>${html(item.rop || '—')}</strong></td>
                <td>${html(item.platform || '—')}</td>
                <td><strong>${html(item.campaign || '—')}</strong><div class="muted small">${html(item.campaignStatus || '')}</div></td>
                <td>
                  <div class="badge-stack">${chip(`Расход ${moneyFmt(item.spendRub)}`)}${chip(`Продажи ${moneyFmt(item.adSalesRub)}`)}${chip(`ДРР ${pctFmt(item.drr)}`)}</div>
                </td>
                <td>${chip(item.decision || 'wait', item.decision === 'scale' ? 'ok' : item.decision === 'stop' ? 'danger' : 'warn')} ${chip(item.reasonCode || 'WAIT')}</td>
                <td>${html(item.nextAction || item.comment || '—')}</td>
              </tr>
            `).join('') || '<tr><td colspan="6"><div class="empty">РК паспорта по этим фильтрам не найдены</div></td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderContactsTab(payload, rows) {
    const items = filterByOwnerAndPlatform(payload.contacts || []);
    return `
      ${renderFilters(rows)}
      <div class="table-wrap rop-compact-table">
        <table>
          <thead><tr><th>Дата</th><th>РОП</th><th>Площадка</th><th>Тема</th><th>Цель</th><th>Дедлайн</th><th>Статус</th></tr></thead>
          <tbody>
            ${items.map((item) => `
              <tr>
                <td>${html(item.date || '—')}</td>
                <td><strong>${html(item.rop || '—')}</strong></td>
                <td>${html(item.platform || '—')}</td>
                <td>${html(item.topic || '—')}</td>
                <td>${html(item.goal || '—')}</td>
                <td>${chip(item.deadline || '—', isOverdueDate(item.deadline, item.responseStatus === 'done' ? 'done' : 'new') ? 'danger' : '')}</td>
                <td>${html(item.responseStatus || item.nextAction || '—')}</td>
              </tr>
            `).join('') || '<tr><td colspan="7"><div class="empty">Контакты по этим фильтрам не найдены</div></td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderRaciTab(payload) {
    return `
      <div class="rop-raci-grid">
        ${(payload.raci || []).map((row) => `
          <div class="rop-raci-card">
            <div class="rop-owner-card-head">
              <h3>${html(row.process || 'Процесс')}</h3>
              ${chip(row.slaRhythm || 'SLA')}
            </div>
            <div class="rop-raci-roles">
              <span><b>Бренд</b>${html(row.brandLead || '—')}</span>
              <span><b>РОП</b>${html(row.rop || '—')}</span>
              <span><b>Маркетинг</b>${html(row.marketing || '—')}</span>
              <span><b>Контент</b>${html(row.content || '—')}</span>
              <span><b>Supply</b>${html(row.supply || '—')}</span>
              <span><b>Аналитика</b>${html(row.analytics || '—')}</span>
              <span><b>Финансы</b>${html(row.finance || '—')}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderCurrentTab(payload, rows) {
    const tab = strategicState().tab;
    if (tab === 'ads') return renderAdsTab(payload, rows);
    if (tab === 'contacts') return renderContactsTab(payload, rows);
    if (tab === 'raci') return renderRaciTab(payload);
    return renderTasksTab(payload, rows);
  }

  function renderStrategicScreen(root) {
    if (!root) return;
    if (!ropData) {
      root.innerHTML = `
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Стратегические задачи</h3>
              <p class="small muted">Подгружаем контур РОПов из seed.</p>
            </div>
            ${chip('загрузка', 'info')}
          </div>
        </div>
      `;
      loadRopData()
        .then((payload) => {
          materializeStrategicTasks(payload);
          if (strategicModeEnabled()) renderStrategicScreen(root);
        })
        .catch((error) => {
          root.innerHTML = `<div class="card"><div class="section-subhead"><div><h3>Стратегические задачи</h3><p class="small muted">${html(error.message)}</p></div>${chip('ошибка', 'danger')}</div></div>`;
        });
      return;
    }

    if (!mergeDone) materializeStrategicTasks(ropData);
    const rows = strategicRows(ropData);
    const summary = buildSummary(rows);
    root.innerHTML = `
      <div class="rop-strategic-root">
        <div class="section-title">
          <div>
            <h2>Стратегические задачи</h2>
            <p>Рабочий контур РОПов по KPI бренда Altea: задачи, сроки, статусы, доказательства РК, коммуникации и ответственность.</p>
          </div>
          <div class="badge-stack">
            ${chip(`до ${html(ropData.targetDate || '2026-06-05')}`, 'warn')}
            ${chip(`${intFmt(summary.total)} задач`, 'info')}
            ${chip(`${intFmt(summary.critical)} критичных`, summary.critical ? 'danger' : 'ok')}
          </div>
        </div>
        ${renderTabs()}
        ${renderCurrentTab(ropData, rows)}
      </div>
    `;
  }

  function insertLaunchBlock(root) {
    if (!root || root.querySelector('[data-rop-strategic-launch]')) return;
    const sectionTitle = root.querySelector('.section-title');
    if (!sectionTitle) return;
    sectionTitle.insertAdjacentHTML('afterend', renderLaunchBlock(ropData || { summary: { taskCount: 23, criticalCount: 8 } }));
  }

  function insertExecutiveLaunchBlock(root) {
    if (!root || root.querySelector('[data-rop-strategic-launch]')) return;
    const sectionTitle = root.querySelector('.section-title');
    if (sectionTitle) {
      sectionTitle.insertAdjacentHTML('afterend', renderLaunchBlock(ropData || { summary: { taskCount: 23, criticalCount: 8 } }));
      return;
    }
    root.insertAdjacentHTML('afterbegin', renderLaunchBlock(ropData || { summary: { taskCount: 23, criticalCount: 8 } }));
  }

  function patchRenderControlCenter() {
    if (window.__ALTEA_ROP_STRATEGIC_RENDER_PATCHED__) return;
    window.__ALTEA_ROP_STRATEGIC_RENDER_PATCHED__ = true;
    originalRenderControlCenter = typeof window.renderControlCenter === 'function'
      ? window.renderControlCenter
      : (typeof renderControlCenter === 'function' ? renderControlCenter : null);
    const patched = function renderControlCenterWithStrategicTasks() {
      const root = document.getElementById('view-control');
      if (strategicModeEnabled()) {
        renderStrategicScreen(root);
        return;
      }
      if (typeof originalRenderControlCenter === 'function') originalRenderControlCenter();
      insertLaunchBlock(document.getElementById('view-control'));
    };
    window.renderControlCenter = patched;
    try { renderControlCenter = patched; } catch (error) {}
  }

  function patchRenderExecutive() {
    if (window.__ALTEA_ROP_STRATEGIC_EXEC_RENDER_PATCHED__) return;
    window.__ALTEA_ROP_STRATEGIC_EXEC_RENDER_PATCHED__ = true;
    originalRenderExecutive = typeof window.renderExecutive === 'function'
      ? window.renderExecutive
      : (typeof renderExecutive === 'function' ? renderExecutive : null);
    if (typeof originalRenderExecutive !== 'function') return;
    const patched = function renderExecutiveWithStrategicTasks() {
      originalRenderExecutive();
      insertExecutiveLaunchBlock(document.getElementById('view-executive'));
    };
    window.renderExecutive = patched;
    try { renderExecutive = patched; } catch (error) {}
  }

  function patchRemotePull() {
    if (window.__ALTEA_ROP_STRATEGIC_PULL_PATCHED__) return;
    window.__ALTEA_ROP_STRATEGIC_PULL_PATCHED__ = true;
    originalPullRemoteState = typeof window.pullRemoteState === 'function'
      ? window.pullRemoteState
      : (typeof pullRemoteState === 'function' ? pullRemoteState : null);
    if (typeof originalPullRemoteState !== 'function') return;
    const patchedPull = async function pullRemoteStateWithStrategicSeed(...args) {
      const result = await originalPullRemoteState.apply(this, args);
      try {
        await ensureStrategicDataMerged();
      } catch (error) {
        console.error(error);
      }
      return result;
    };
    window.pullRemoteState = patchedPull;
    try { pullRemoteState = patchedPull; } catch (error) {}
  }

  function refreshLaunchEntrypoints() {
    const st = appState();
    const activeView = st?.activeView || String(location.hash || '').replace(/^#/, '') || '';
    if (activeView === 'control' && !strategicModeEnabled()) {
      insertLaunchBlock(document.getElementById('view-control'));
    }
    if (activeView === 'executive') {
      insertExecutiveLaunchBlock(document.getElementById('view-executive'));
    }
  }

  function startLaunchEntrypointWatcher() {
    if (window.__ALTEA_ROP_STRATEGIC_ENTRYPOINT_WATCHER__) return;
    window.__ALTEA_ROP_STRATEGIC_ENTRYPOINT_WATCHER__ = true;
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      refreshLaunchEntrypoints();
      if (ticks >= 40) window.clearInterval(timer);
    }, 250);
    window.addEventListener('hashchange', () => window.setTimeout(refreshLaunchEntrypoints, 150));
    document.body.addEventListener('click', () => window.setTimeout(refreshLaunchEntrypoints, 150), true);
  }

  async function saveStrategicTaskForm(form) {
    const taskId = form.getAttribute('data-rop-task-form');
    if (!taskId) return;
    const formData = new FormData(form);
    const patch = {
      owner: String(formData.get('owner') || '').trim(),
      due: String(formData.get('due') || '').trim(),
      status: String(formData.get('status') || 'new').trim(),
      nextAction: String(formData.get('nextAction') || '').trim()
    };
    if (typeof updateTaskRecord === 'function') {
      await updateTaskRecord(taskId, patch);
    } else {
      const st = appState();
      const task = st?.storage?.tasks?.find((item) => item.id === taskId);
      if (task) Object.assign(task, patch, { updatedAt: new Date().toISOString() });
      try {
        if (typeof saveLocalStorage === 'function') saveLocalStorage();
      } catch (error) {}
      renderStrategicScreen(document.getElementById('view-control'));
    }
  }

  function installListeners() {
    if (window.__ALTEA_ROP_STRATEGIC_LISTENERS__) return;
    window.__ALTEA_ROP_STRATEGIC_LISTENERS__ = true;

    document.body.addEventListener('click', (event) => {
      const open = event.target.closest('[data-rop-strategic-open]');
      if (open) {
        strategicState().enabled = true;
        strategicState().tab = 'tasks';
        if (typeof setView === 'function') setView('control');
        else renderStrategicScreen(document.getElementById('view-control'));
        return;
      }

      const close = event.target.closest('[data-rop-strategic-close]');
      if (close) {
        strategicState().enabled = false;
        if (typeof renderControlCenter === 'function') renderControlCenter();
        return;
      }

      const tab = event.target.closest('[data-rop-tab]');
      if (tab) {
        strategicState().tab = tab.dataset.ropTab || 'tasks';
        renderStrategicScreen(document.getElementById('view-control'));
      }
    });

    document.body.addEventListener('input', (event) => {
      const filter = event.target.closest('[data-rop-filter]');
      if (!filter || filter.dataset.ropFilter !== 'search') return;
      strategicState().filters.search = filter.value;
      renderStrategicScreen(document.getElementById('view-control'));
    });

    document.body.addEventListener('change', (event) => {
      const filter = event.target.closest('[data-rop-filter]');
      if (!filter) return;
      strategicState().filters[filter.dataset.ropFilter] = filter.value;
      renderStrategicScreen(document.getElementById('view-control'));
    });

    document.body.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-rop-task-form]');
      if (!form) return;
      event.preventDefault();
      await saveStrategicTaskForm(form);
      strategicState().enabled = true;
      renderStrategicScreen(document.getElementById('view-control'));
    });
  }

  function boot() {
    patchRenderControlCenter();
    patchRenderExecutive();
    patchRemotePull();
    installListeners();
    startLaunchEntrypointWatcher();
    loadRopData()
      .then((payload) => {
        ropData = payload;
        waitForPortalReady(async () => {
          try {
            await ensureStrategicDataMerged();
          } catch (error) {
            console.error(error);
          }
          const root = document.getElementById('view-control');
          if (appState()?.activeView === 'control' && root) {
            if (strategicModeEnabled()) renderStrategicScreen(root);
            else insertLaunchBlock(root);
          }
          if (appState()?.activeView === 'executive') {
            insertExecutiveLaunchBlock(document.getElementById('view-executive'));
          }
          refreshLaunchEntrypoints();
        });
      })
      .catch((error) => console.error(error));
  }

  boot();
})();
