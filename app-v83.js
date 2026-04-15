(function () {
  const TABLE = 'portal_price_workbench_entries';
  const LOCAL_KEY = 'brand-portal-price-workbench-v83';
  const REMOTE_RETRY_MAX = 45;

  const DECISION_STATUS_META = {
    draft: { label: 'Черновик', kind: '' },
    review: { label: 'На согласовании', kind: 'warn' },
    approved: { label: 'Согласовано', kind: 'ok' },
    on_hold: { label: 'Стоп / hold', kind: 'danger' },
    applied: { label: 'Применено', kind: 'info' }
  };

  const ESCALATION_META = {
    none: { label: 'Без эскалации', kind: '' },
    ksenia: { label: 'Ксении', kind: 'warn' },
    final: { label: 'Финальное согласование', kind: 'danger' },
    rop: { label: 'РОПу', kind: 'info' },
    finance: { label: 'Финансам', kind: 'warn' }
  };

  state.v83 = Object.assign({
    seed: null,
    loading: false,
    issue: '',
    note: '',
    localDecisions: [],
    remoteDecisions: [],
    selectedKey: '',
    filters: {
      market: 'wb',
      search: '',
      status: 'all',
      sort: 'risk'
    }
  }, state.v83 || {});

  function marketLabel(key) {
    return ({ wb: 'WB', ozon: 'ОЗ', ym: 'ЯМ' })[key] || key;
  }

  function moneyShort(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return `${fmt.num(Number(value), 0)} ₽`;
  }

  function pctShort(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  function numOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isNaN(parsed) ? null : parsed;
  }

  function normalizedDate(value) {
    if (!value) return '';
    try {
      return String(value).slice(0, 10);
    } catch {
      return '';
    }
  }

  function workbenchKey(marketplace, articleKey) {
    return `${marketplace}|${articleKey}`;
  }

  function normalizeDecision(item = {}) {
    const marketplace = ['wb', 'ozon', 'ym'].includes(String(item.marketplace || '').toLowerCase())
      ? String(item.marketplace || '').toLowerCase()
      : 'wb';
    const articleKey = String(item.articleKey || item.skuCode || '').trim();
    const sku = articleKey ? getSku(articleKey) : null;
    const decisionStatus = DECISION_STATUS_META[item.decisionStatus] ? item.decisionStatus : 'draft';
    const escalation = ESCALATION_META[item.escalation] ? item.escalation : (item.escalation === 'viktor' ? 'final' : 'none');
    return {
      id: String(item.id || stableId('price-decision', `${currentBrand()}|${marketplace}|${articleKey}`)).trim(),
      brand: currentBrand(),
      marketplace,
      articleKey,
      decisionStatus,
      targetFillPrice: numOrNull(item.targetFillPrice),
      targetClientPrice: numOrNull(item.targetClientPrice),
      reason: String(item.reason || '').trim(),
      owner: String(item.owner || ownerName(sku) || '').trim(),
      dueDate: normalizedDate(item.dueDate),
      needsTask: Boolean(item.needsTask),
      escalation,
      comment: String(item.comment || '').trim(),
      updatedBy: String(item.updatedBy || state.team.member?.name || 'Команда').trim() || 'Команда',
      updatedAt: String(item.updatedAt || new Date().toISOString()).trim() || new Date().toISOString(),
      createdAt: String(item.createdAt || item.updatedAt || new Date().toISOString()).trim() || new Date().toISOString()
    };
  }

  function loadLocalDecisions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      state.v83.localDecisions = Array.isArray(parsed) ? parsed.map(normalizeDecision) : [];
    } catch {
      state.v83.localDecisions = [];
    }
    return state.v83.localDecisions;
  }

  function saveLocalDecisions() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state.v83.localDecisions || []));
  }

  function remoteDecisionRow(item) {
    return {
      id: item.id,
      brand: currentBrand(),
      marketplace: item.marketplace,
      article_key: item.articleKey,
      decision_status: item.decisionStatus,
      target_fill_price: item.targetFillPrice,
      target_client_price: item.targetClientPrice,
      reason: item.reason,
      owner_name: item.owner,
      due_date: item.dueDate || null,
      needs_task: item.needsTask,
      escalation: item.escalation,
      comment: item.comment,
      updated_by: item.updatedBy,
      updated_at: item.updatedAt,
      created_at: item.createdAt
    };
  }

  function fromRemoteDecision(row) {
    return normalizeDecision({
      id: row.id,
      marketplace: row.marketplace,
      articleKey: row.article_key,
      decisionStatus: row.decision_status,
      targetFillPrice: row.target_fill_price,
      targetClientPrice: row.target_client_price,
      reason: row.reason,
      owner: row.owner_name,
      dueDate: row.due_date,
      needsTask: row.needs_task,
      escalation: row.escalation,
      comment: row.comment,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
      createdAt: row.created_at
    });
  }

  async function queryRemoteDecisions() {
    if (!hasRemoteStore()) return [];
    const response = await state.team.client
      .from(TABLE)
      .select('*')
      .eq('brand', currentBrand())
      .order('updated_at', { ascending: false });
    if (response.error) throw response.error;
    return response.data || [];
  }

  async function upsertRemoteDecisions(rows) {
    if (!hasRemoteStore() || !rows.length) return;
    const response = await state.team.client
      .from(TABLE)
      .upsert(rows.map(remoteDecisionRow), { onConflict: 'id' });
    if (response.error) throw response.error;
  }

  async function deleteRemoteDecision(id) {
    if (!hasRemoteStore() || !id) return;
    const response = await state.team.client.from(TABLE).delete().eq('id', id);
    if (response.error) throw response.error;
  }

  function mergeDecisionLayers() {
    const map = new Map();
    for (const item of state.v83.remoteDecisions || []) map.set(workbenchKey(item.marketplace, item.articleKey), item);
    for (const item of state.v83.localDecisions || []) map.set(workbenchKey(item.marketplace, item.articleKey), item);
    return map;
  }

  function ensurePriceSeed() {
    if (state.v83.loading || state.v83.seed) return;
    state.v83.loading = true;
    loadJson('data/smart_price_workbench.json')
      .then((data) => {
        state.v83.seed = data;
        state.v83.issue = '';
        state.v83.note = data.note || '';
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      })
      .catch((error) => {
        console.error(error);
        state.v83.issue = error.message;
        setAppError(`Портал загрузил не всё: price workbench — ${error.message}`);
      })
      .finally(() => {
        state.v83.loading = false;
      });
  }

  function baseRowsForMarket(market) {
    const seed = state.v83.seed;
    if (!seed) return [];
    return (((seed.platforms || {})[market] || {}).rows || []).map((row) => ({ ...row }));
  }

  function effectiveRow(row, decision) {
    const merged = decision ? normalizeDecision(decision) : normalizeDecision({ marketplace: row.marketplace, articleKey: row.articleKey, owner: row.owner });
    const effective = {
      ...row,
      decisionId: merged.id,
      decisionStatus: merged.decisionStatus,
      reason: merged.reason || row.seedReason || '',
      owner: merged.owner || row.owner || '',
      dueDate: merged.dueDate || '',
      needsTask: merged.needsTask,
      escalation: merged.escalation,
      comment: merged.comment || '',
      targetFillPrice: merged.targetFillPrice ?? row.seedTargetFillPrice ?? row.currentFillPrice,
      targetClientPrice: merged.targetClientPrice ?? row.seedTargetClientPrice ?? row.currentClientPrice,
      updatedBy: merged.updatedBy,
      updatedAt: merged.updatedAt,
      createdAt: merged.createdAt
    };
    effective.deltaFillPrice = effective.targetFillPrice != null && row.currentFillPrice != null ? effective.targetFillPrice - row.currentFillPrice : null;
    effective.deltaClientPrice = effective.targetClientPrice != null && row.currentClientPrice != null ? effective.targetClientPrice - row.currentClientPrice : null;
    effective.projectedMarginSignal = effective.targetFillPrice != null && row.currentFillPrice ? ((effective.targetFillPrice - row.currentFillPrice) / row.currentFillPrice) : null;
    return effective;
  }

  function signalsForRow(row) {
    const items = [];
    if (row.allowedMarginPct != null && row.avgMargin7dPct != null && Number(row.avgMargin7dPct) < Number(row.allowedMarginPct)) {
      items.push({ label: 'Средняя маржа 7д ниже допустимой', kind: 'danger' });
    }
    if (row.marginTotalPct != null && row.allowedMarginPct != null && Number(row.marginTotalPct) < Number(row.allowedMarginPct)) {
      items.push({ label: 'Текущая маржа total ниже порога', kind: 'danger' });
    }
    if (row.turnoverTotalDays != null && Number(row.turnoverTotalDays) >= 60) {
      items.push({ label: 'Высокая общая оборачиваемость', kind: 'danger' });
    } else if (row.turnoverTotalDays != null && Number(row.turnoverTotalDays) >= 45) {
      items.push({ label: 'Оборачиваемость требует внимания', kind: 'warn' });
    }
    if (row.targetFillPrice != null && row.minPrice != null && Number(row.targetFillPrice) < Number(row.minPrice)) {
      items.push({ label: 'Целевая цена ниже минимальной', kind: 'danger' });
    }
    if ((Number(row.stockWb) || 0) + (Number(row.stockOzon) || 0) + (Number(row.stockWarehouse) || 0) <= 0) {
      items.push({ label: 'Нет остатков в системе', kind: 'danger' });
    }
    if (row.escalation !== 'none') {
      const meta = ESCALATION_META[row.escalation] || ESCALATION_META.none;
      items.push({ label: `Эскалация: ${meta.label}`, kind: meta.kind || 'warn' });
    }
    if (row.decisionStatus === 'review') items.push({ label: 'Решение ждёт согласования', kind: 'warn' });
    if (row.needsTask) items.push({ label: 'Нужно завести задачу', kind: 'info' });
    return items;
  }

  function riskScore(row) {
    return signalsForRow(row).reduce((sum, item) => sum + (item.kind === 'danger' ? 3 : item.kind === 'warn' ? 2 : 1), 0);
  }

  function effectiveRows() {
    const market = state.v83.filters.market || 'wb';
    const decisionMap = mergeDecisionLayers();
    return baseRowsForMarket(market).map((row) => effectiveRow(row, decisionMap.get(workbenchKey(market, row.articleKey))));
  }

  function effectiveRowsForAllMarkets() {
    const decisionMap = mergeDecisionLayers();
    return ['wb', 'ozon', 'ym'].flatMap((market) => baseRowsForMarket(market).map((row) => effectiveRow(row, decisionMap.get(workbenchKey(market, row.articleKey)))));
  }

  function filteredRows() {
    const q = String(state.v83.filters.search || '').trim().toLowerCase();
    const statusFilter = state.v83.filters.status || 'all';
    const sortMode = state.v83.filters.sort || 'risk';
    const rows = effectiveRows().filter((row) => {
      if (q) {
        const hay = `${row.articleKey} ${row.article} ${row.name} ${row.owner} ${row.reason}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== 'all' && row.decisionStatus !== statusFilter) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sortMode === 'turnover') return (Number(b.turnoverTotalDays) || 0) - (Number(a.turnoverTotalDays) || 0);
      if (sortMode === 'margin') return (Number(a.marginTotalPct) || 0) - (Number(b.marginTotalPct) || 0);
      if (sortMode === 'updated') return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      return riskScore(b) - riskScore(a)
        || (Number(b.turnoverTotalDays) || 0) - (Number(a.turnoverTotalDays) || 0)
        || String(a.articleKey || '').localeCompare(String(b.articleKey || ''), 'ru');
    });
    return rows;
  }

  function selectedRow(rows) {
    if (!rows.length) return null;
    const existing = rows.find((row) => workbenchKey(row.marketplace, row.articleKey) === state.v83.selectedKey);
    if (existing) return existing;
    state.v83.selectedKey = workbenchKey(rows[0].marketplace, rows[0].articleKey);
    return rows[0];
  }

  function summaryCards(rows) {
    const belowMargin = rows.filter((row) => row.allowedMarginPct != null && row.avgMargin7dPct != null && Number(row.avgMargin7dPct) < Number(row.allowedMarginPct));
    const waiting = rows.filter((row) => row.decisionStatus === 'review');
    const withTask = rows.filter((row) => row.needsTask);
    const highTurn = rows.filter((row) => Number(row.turnoverTotalDays) >= 45);
    return [
      { label: 'SKU в работе с ценами', value: fmt.int(rows.length), hint: 'Текущий фильтр площадки.' },
      { label: 'Ниже допустимой маржи', value: fmt.int(belowMargin.length), hint: 'Средняя маржа 7д ниже порога.' },
      { label: 'Ждут согласования', value: fmt.int(waiting.length), hint: 'Решение по цене переведено в review.' },
      { label: 'Требуют действия', value: fmt.int(withTask.length + highTurn.length), hint: 'Нужно действие по цене/оборачиваемости.' }
    ];
  }

  function decisionStatusBadge(row) {
    const meta = DECISION_STATUS_META[row.decisionStatus] || DECISION_STATUS_META.draft;
    return badge(meta.label, meta.kind);
  }

  function escalationBadge(row) {
    if (!row || row.escalation === 'none') return '';
    const meta = ESCALATION_META[row.escalation] || ESCALATION_META.none;
    return badge(meta.label, meta.kind);
  }

  function renderHistory(row) {
    const series = Array.isArray(row.monthly) ? row.monthly : [];
    if (!series.length) return '<div class="empty">История месяца по этому SKU пока не подключена.</div>';
    const items = series.map((item) => `
      <tr>
        <td>${escapeHtml(String(item.date || '').slice(5))}</td>
        <td>${item.turnoverDays == null ? '—' : `${fmt.num(item.turnoverDays, 1)} дн.`}</td>
        <td>${moneyShort(item.price)}</td>
        <td>${pctShort(item.sppPct)}</td>
      </tr>
    `).join('');
    return `
      <div class="v83-history-wrap">
        <table class="v83-history-table">
          <thead><tr><th>Дата</th><th>Обор.</th><th>Цена</th><th>СПП</th></tr></thead>
          <tbody>${items}</tbody>
        </table>
      </div>
    `;
  }

  function renderWorkbenchTable(rows) {
    if (!rows.length) return '<div class="empty">По текущим фильтрам ничего не найдено.</div>';
    const body = rows.map((row) => {
      const key = workbenchKey(row.marketplace, row.articleKey);
      const selected = key === state.v83.selectedKey;
      const warning = riskScore(row) >= 3 ? 'is-risk' : '';
      return `
        <tr class="${selected ? 'is-selected' : ''} ${warning}" data-v83-select="${escapeHtml(key)}">
          <td>
            <div class="v83-sku-title">${escapeHtml(row.articleKey)}</div>
            <div class="muted small">${escapeHtml(row.name || row.article || 'Без названия')}</div>
          </td>
          <td>${escapeHtml(row.owner || '—')}</td>
          <td>${pctShort(row.avgMargin7dPct)}</td>
          <td>${pctShort(row.allowedMarginPct)}</td>
          <td>${row.turnoverTotalDays == null ? '—' : `${fmt.num(row.turnoverTotalDays, 1)} дн.`}</td>
          <td>${moneyShort(row.currentFillPrice)}</td>
          <td>${moneyShort(row.targetFillPrice)}</td>
          <td>${decisionStatusBadge(row)}</td>
        </tr>
      `;
    }).join('');
    return `
      <div class="v83-table-wrap">
        <table class="v83-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Owner</th>
              <th>Маржа 7д</th>
              <th>Допустимая</th>
              <th>Обор.</th>
              <th>Текущая цена</th>
              <th>Целевая</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function renderDetail(row) {
    if (!row) return '<div class="card"><div class="empty">Выбери SKU слева, чтобы работать с ценой.</div></div>';
    const signals = signalsForRow(row).map((item) => badge(item.label, item.kind)).join('') || '<span class="muted small">Сигналы не выявлены</span>';
    return `
      <div class="card v83-detail-card">
        <div class="head">
          <div>
            <h3>${escapeHtml(row.articleKey)}</h3>
            <div class="muted small">${escapeHtml(row.name || row.article || '')}</div>
          </div>
          <div class="badge-stack">${badge(marketLabel(row.marketplace), 'info')}${decisionStatusBadge(row)}${escalationBadge(row)}</div>
        </div>

        <div class="grid cards v83-kpi-grid">
          <div class="card kpi"><div class="label">Себес</div><div class="value">${moneyShort(row.cost)}</div><div class="hint">Себестоимость из price workbench.</div></div>
          <div class="card kpi"><div class="label">Маржа total</div><div class="value">${pctShort(row.marginTotalPct)}</div><div class="hint">Текущая total margin по площадке.</div></div>
          <div class="card kpi"><div class="label">Рентабельность</div><div class="value">${pctShort(row.profitabilityPct)}</div><div class="hint">Текущая рентабельность.</div></div>
          <div class="card kpi"><div class="label">Обор. общая</div><div class="value">${row.turnoverTotalDays == null ? '—' : `${fmt.num(row.turnoverTotalDays, 1)} дн.`}</div><div class="hint">Средняя оборачиваемость по всем складам.</div></div>
        </div>

        <div class="v83-chip-row">
          ${badge(`Остаток WB ${fmt.int(row.stockWb || 0)}`)}
          ${badge(`Остаток OZ ${fmt.int(row.stockOzon || 0)}`)}
          ${badge(`Склад ${fmt.int(row.stockWarehouse || 0)}`)}
          ${badge(`Продажи 7д ${fmt.int(row.sales7Total || 0)}`,'info')}
          ${row.arrivalDate ? badge(`Поставка ${escapeHtml(row.arrivalDate)}`,'warn') : ''}
        </div>

        <div class="v83-signals">${signals}</div>

        <form class="v83-form" data-v83-form="${escapeHtml(workbenchKey(row.marketplace, row.articleKey))}">
          <div class="v83-form-grid">
            <label>
              <span>Статус решения</span>
              <select name="decisionStatus">${Object.entries(DECISION_STATUS_META).map(([value, meta]) => `<option value="${value}" ${row.decisionStatus === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
            </label>
            <label>
              <span>Owner решения</span>
              <input name="owner" value="${escapeHtml(row.owner || '')}" list="v83-owners-list">
            </label>
            <label>
              <span>Срок</span>
              <input type="date" name="dueDate" value="${escapeHtml(row.dueDate || '')}">
            </label>
            <label>
              <span>Эскалация</span>
              <select name="escalation">${Object.entries(ESCALATION_META).map(([value, meta]) => `<option value="${value}" ${row.escalation === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
            </label>
            <label>
              <span>Текущая цена</span>
              <input value="${row.currentFillPrice ?? ''}" disabled>
            </label>
            <label>
              <span>Целевая цена</span>
              <input type="number" step="0.01" name="targetFillPrice" value="${row.targetFillPrice ?? ''}">
            </label>
            <label>
              <span>Цена клиента сейчас</span>
              <input value="${row.currentClientPrice ?? ''}" disabled>
            </label>
            <label>
              <span>Цена клиента целевая</span>
              <input type="number" step="0.01" name="targetClientPrice" value="${row.targetClientPrice ?? ''}">
            </label>
            <label class="v83-span-2">
              <span>Причина / логика решения</span>
              <textarea name="reason" rows="2" placeholder="Почему меняем цену и что хотим получить">${escapeHtml(row.reason || '')}</textarea>
            </label>
            <label class="v83-span-2">
              <span>Комментарий</span>
              <textarea name="comment" rows="2" placeholder="Что важно для Ксении / РОПа / финального согласования">${escapeHtml(row.comment || '')}</textarea>
            </label>
            <label class="v83-check"><input type="checkbox" name="needsTask" ${row.needsTask ? 'checked' : ''}><span>Создать / обновить задачу по цене</span></label>
          </div>
          <div class="v83-form-actions">
            <button type="submit" class="btn">Сохранить решение</button>
            <button type="button" class="btn ghost" data-v83-price-task="${escapeHtml(workbenchKey(row.marketplace, row.articleKey))}">Создать задачу сейчас</button>
            <button type="button" class="btn ghost" data-v83-reset="${escapeHtml(workbenchKey(row.marketplace, row.articleKey))}">Сбросить решение</button>
            <button type="button" class="btn ghost" data-v83-copy-sku="${escapeHtml(row.articleKey)}">Скопировать SKU</button>
          </div>
        </form>

        <datalist id="v83-owners-list">${ownerOptions().map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>

        <div class="v83-projection-grid">
          <div class="card mini"><div class="label">Сид из файла</div><div class="value">${moneyShort(row.seedTargetFillPrice)}</div><div class="hint">Целевая цена из файла Смарт.</div></div>
          <div class="card mini"><div class="label">Дельта цены</div><div class="value">${row.deltaFillPrice == null ? '—' : moneyShort(row.deltaFillPrice)}</div><div class="hint">Целевая минус текущая.</div></div>
          <div class="card mini"><div class="label">Нужная цена для рентаб.</div><div class="value">${moneyShort(row.requiredPriceForProfitability)}</div><div class="hint">Расчёт из файла.</div></div>
          <div class="card mini"><div class="label">Нужная цена для маржи</div><div class="value">${moneyShort(row.requiredPriceForMargin)}</div><div class="hint">Расчёт из файла.</div></div>
        </div>

        <div class="subsection" style="margin-top:16px">
          <div class="head"><div><h3>История месяца</h3><div class="muted small">Цена / СПП / оборачиваемость по датам.</div></div></div>
          ${renderHistory(row)}
        </div>
      </div>
    `;
  }

  function renderPricesWorkbench() {
    const root = document.getElementById('view-prices');
    if (!root) return;
    if (state.v83.loading && !state.v83.seed) {
      root.innerHTML = '<div class="card"><div class="empty">Загружаю smart price workbench…</div></div>';
      return;
    }
    if (state.v83.issue && !state.v83.seed) {
      root.innerHTML = `<div class="card"><div class="empty">Не удалось загрузить smart price workbench: ${escapeHtml(state.v83.issue)}</div></div>`;
      return;
    }
    if (!state.v83.seed) {
      root.innerHTML = '<div class="card"><div class="empty">Price workbench ещё не загружен.</div></div>';
      return;
    }

    const rows = filteredRows();
    const current = selectedRow(rows);
    const cards = summaryCards(rows).map((card) => `
      <div class="card kpi control-card">
        <div class="label">${escapeHtml(card.label)}</div>
        <div class="value">${card.value}</div>
        <div class="hint">${escapeHtml(card.hint)}</div>
      </div>
    `).join('');

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Цены / Price Workbench</h2>
          <p>Это рабочий блок для аналитиков и владельцев ценового решения, а не витрина: здесь меняют цену, фиксируют причину, срок, owner, создают задачу и связывают решение с маржой, оборачиваемостью и остатками.</p>
        </div>
        <div class="quick-actions price-market-switch">
          ${['wb', 'ozon', 'ym'].map((key) => `<button type="button" class="quick-chip ${state.v83.filters.market === key ? 'active' : ''}" data-v83-market="${key}">${marketLabel(key)}</button>`).join('')}
        </div>
      </div>

      <div class="footer-note" style="margin-bottom:14px">${escapeHtml(state.v83.note || '')}</div>
      <div class="grid cards">${cards}</div>

      <div class="v83-toolbar">
        <input id="v83Search" placeholder="Поиск по SKU, названию, owner или причине" value="${escapeHtml(state.v83.filters.search)}">
        <select id="v83StatusFilter">
          <option value="all">Все статусы решений</option>
          ${Object.entries(DECISION_STATUS_META).map(([value, meta]) => `<option value="${value}" ${state.v83.filters.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
        </select>
        <select id="v83SortMode">
          <option value="risk" ${state.v83.filters.sort === 'risk' ? 'selected' : ''}>Сначала рисковые</option>
          <option value="turnover" ${state.v83.filters.sort === 'turnover' ? 'selected' : ''}>По оборачиваемости</option>
          <option value="margin" ${state.v83.filters.sort === 'margin' ? 'selected' : ''}>По марже</option>
          <option value="updated" ${state.v83.filters.sort === 'updated' ? 'selected' : ''}>По обновлению</option>
        </select>
      </div>

      <div class="v83-layout">
        <div class="card v83-master-card">
          <div class="head">
            <div>
              <h3>SKU в работе с ценами</h3>
              <div class="muted small">Это замена файла по ценам: слева список SKU в работе, справа — решение по цене, причина, срок, owner и история месяца.</div>
            </div>
            <div class="badge-stack">${badge(`Источник: ${escapeHtml(state.v83.seed.sourceFile || 'seed')}`)}</div>
          </div>
          ${renderWorkbenchTable(rows)}
        </div>
        ${renderDetail(current)}
      </div>
    `;

    const searchInput = document.getElementById('v83Search');
    if (searchInput) searchInput.addEventListener('input', (event) => {
      state.v83.filters.search = event.target.value;
      renderPricesWorkbench();
    });
    const statusSelect = document.getElementById('v83StatusFilter');
    if (statusSelect) statusSelect.addEventListener('change', (event) => {
      state.v83.filters.status = event.target.value;
      renderPricesWorkbench();
    });
    const sortSelect = document.getElementById('v83SortMode');
    if (sortSelect) sortSelect.addEventListener('change', (event) => {
      state.v83.filters.sort = event.target.value;
      renderPricesWorkbench();
    });
    root.querySelectorAll('[data-v83-market]').forEach((btn) => btn.addEventListener('click', () => {
      state.v83.filters.market = btn.dataset.v83Market;
      state.v83.selectedKey = '';
      renderPricesWorkbench();
    }));
    root.querySelectorAll('[data-v83-select]').forEach((row) => row.addEventListener('click', () => {
      state.v83.selectedKey = row.dataset.v83Select;
      renderPricesWorkbench();
    }));
    root.querySelectorAll('[data-v83-form]').forEach((form) => form.addEventListener('submit', handleFormSubmit));
    root.querySelectorAll('[data-v83-price-task]').forEach((btn) => btn.addEventListener('click', handleCreateTaskClick));
    root.querySelectorAll('[data-v83-reset]').forEach((btn) => btn.addEventListener('click', handleResetDecisionClick));
    root.querySelectorAll('[data-v83-copy-sku]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.v83CopySku || '');
        state.team.note = `SKU скопирован: ${btn.dataset.v83CopySku}`;
        updateSyncBadge();
      } catch (error) {
        console.error(error);
      }
    }));
  }

  function upsertLocalDecision(decision) {
    const normalized = normalizeDecision(decision);
    const key = workbenchKey(normalized.marketplace, normalized.articleKey);
    const rest = (state.v83.localDecisions || []).filter((item) => workbenchKey(item.marketplace, item.articleKey) !== key);
    state.v83.localDecisions = [...rest, normalized];
    saveLocalDecisions();
    return normalized;
  }

  function getRowByKey(key) {
    const [marketplace, articleKey] = String(key || '').split('|');
    return effectiveRows().find((row) => row.marketplace === marketplace && row.articleKey === articleKey) || null;
  }

  function ensurePriceTask(row, decision) {
    const autoCode = `price|${decision.marketplace}|${decision.articleKey}`;
    const title = `Цена ${marketLabel(decision.marketplace)} · ${decision.articleKey}`;
    const nextAction = decision.reason || row.seedReason || 'Проверить и внедрить ценовое решение';
    const existing = (state.storage.tasks || []).find((task) => task.autoCode === autoCode);
    const normalized = normalizeTask({
      id: existing?.id || stableId('task', autoCode),
      source: 'manual',
      articleKey: decision.articleKey,
      title,
      nextAction,
      reason: decision.comment || decision.reason || '',
      owner: decision.owner || row.owner || ownerName(getSku(decision.articleKey)) || '',
      due: decision.dueDate || plusDays(2),
      status: existing?.status || 'new',
      type: 'price_margin',
      priority: decision.escalation === 'final' ? 'critical' : (decision.decisionStatus === 'review' ? 'high' : 'medium'),
      platform: decision.marketplace,
      createdAt: existing?.createdAt || new Date().toISOString(),
      entityLabel: row.name || decision.articleKey,
      autoCode
    }, 'manual');
    state.storage.tasks = [...(state.storage.tasks || []).filter((task) => task.autoCode !== autoCode), normalized];
    saveLocalStorage();
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const key = form.dataset.v83Form;
    const row = getRowByKey(key);
    if (!row) return;
    const decision = upsertLocalDecision({
      id: row.decisionId,
      marketplace: row.marketplace,
      articleKey: row.articleKey,
      decisionStatus: form.elements.decisionStatus.value,
      targetFillPrice: form.elements.targetFillPrice.value,
      targetClientPrice: form.elements.targetClientPrice.value,
      reason: form.elements.reason.value,
      owner: form.elements.owner.value,
      dueDate: form.elements.dueDate.value,
      needsTask: form.elements.needsTask.checked,
      escalation: form.elements.escalation.value,
      comment: form.elements.comment.value,
      updatedBy: state.team.member?.name || 'Команда',
      updatedAt: new Date().toISOString(),
      createdAt: row.createdAt || new Date().toISOString()
    });
    if (decision.needsTask || decision.decisionStatus === 'review' || decision.escalation !== 'none') {
      ensurePriceTask(row, decision);
    }
    state.team.note = 'Ценовое решение сохранено локально';
    updateSyncBadge();
    if (hasRemoteStore()) {
      try {
        await upsertRemoteDecisions([decision]);
        state.v83.remoteDecisions = [...(state.v83.remoteDecisions || []).filter((item) => workbenchKey(item.marketplace, item.articleKey) !== workbenchKey(decision.marketplace, decision.articleKey)), decision];
        state.team.note = 'Ценовое решение синхронизировано в командную базу';
        updateSyncBadge();
      } catch (error) {
        console.error(error);
        state.team.note = `Локально сохранено, но не отправлено в Supabase: ${error.message}`;
        updateSyncBadge();
      }
    }
    rerenderCurrentView();
  }

  function handleCreateTaskClick(event) {
    const key = event.currentTarget.dataset.v83PriceTask;
    const row = getRowByKey(key);
    if (!row) return;
    const decision = normalizeDecision({
      id: row.decisionId,
      marketplace: row.marketplace,
      articleKey: row.articleKey,
      decisionStatus: row.decisionStatus,
      targetFillPrice: row.targetFillPrice,
      targetClientPrice: row.targetClientPrice,
      reason: row.reason,
      owner: row.owner,
      dueDate: row.dueDate,
      needsTask: true,
      escalation: row.escalation,
      comment: row.comment,
      createdAt: row.createdAt,
      updatedAt: new Date().toISOString()
    });
    upsertLocalDecision(decision);
    ensurePriceTask(row, decision);
    state.team.note = 'Задача по цене создана / обновлена';
    saveLocalStorage();
    updateSyncBadge();
    rerenderCurrentView();
  }

  async function handleResetDecisionClick(event) {
    const key = event.currentTarget.dataset.v83Reset;
    const row = getRowByKey(key);
    if (!row) return;
    if (!window.confirm(`Сбросить решение по цене для ${row.articleKey}?`)) return;
    state.v83.localDecisions = (state.v83.localDecisions || []).filter((item) => workbenchKey(item.marketplace, item.articleKey) !== key);
    saveLocalDecisions();
    if (hasRemoteStore()) {
      try {
        await deleteRemoteDecision(row.decisionId);
        state.v83.remoteDecisions = (state.v83.remoteDecisions || []).filter((item) => workbenchKey(item.marketplace, item.articleKey) !== key);
      } catch (error) {
        console.error(error);
      }
    }
    state.team.note = 'Решение по цене сброшено';
    updateSyncBadge();
    rerenderCurrentView();
  }

  async function pullRemotePriceDecisions(rerender = true) {
    if (!hasRemoteStore()) return;
    try {
      const rows = await queryRemoteDecisions();
      state.v83.remoteDecisions = (rows || []).map(fromRemoteDecision);
      state.team.note = rows.length
        ? `Price workbench синхронизирован · ${fmt.int(rows.length)} решений`
        : 'Price workbench: командная база пока без решений';
      updateSyncBadge();
      if (rerender) rerenderCurrentView();
    } catch (error) {
      console.error(error);
      state.v83.issue = error.message;
    }
  }

  async function pushRemotePriceDecisions() {
    if (!hasRemoteStore()) return;
    const rows = state.v83.localDecisions || [];
    if (!rows.length) return;
    try {
      await upsertRemoteDecisions(rows);
      state.v83.remoteDecisions = rows.map(normalizeDecision);
      state.team.note = `Price workbench: отправлено ${fmt.int(rows.length)} решений`;
      updateSyncBadge();
    } catch (error) {
      console.error(error);
      state.team.note = `Price workbench не отправился: ${error.message}`;
      updateSyncBadge();
    }
  }

  function injectSkuPriceCard(articleKey) {
    const modal = document.getElementById('skuModalBody');
    if (!modal) return;
    if (modal.querySelector('.v83-sku-price-card')) return;
    const markets = ['wb', 'ozon'];
    const allRows = effectiveRowsForAllMarkets();
    const rows = markets.map((market) => allRows.find((row) => row.marketplace === market && row.articleKey === articleKey)).filter(Boolean);
    if (!rows.length) return;
    const html = rows.map((row) => `
      <div class="v83-sku-price-row">
        <div class="badge-stack">${badge(marketLabel(row.marketplace), 'info')}${decisionStatusBadge(row)}</div>
        <div class="muted small">Текущая цена ${moneyShort(row.currentFillPrice)} · Целевая ${moneyShort(row.targetFillPrice)} · Маржа ${pctShort(row.marginTotalPct)} · Обор. ${row.turnoverTotalDays == null ? '—' : `${fmt.num(row.turnoverTotalDays, 1)} дн.`}</div>
        <div class="muted small">${escapeHtml(row.reason || 'Причина не заполнена')}</div>
      </div>
    `).join('');
    const block = document.createElement('div');
    block.className = 'card v83-sku-price-card';
    block.innerHTML = `<div class="head"><div><h3>Price workbench</h3><div class="muted small">Рабочие решения по цене из вкладки «Цены».</div></div></div>${html}`;
    const insertionPoint = modal.querySelector('.card-grid') || modal.querySelector('.modal-section') || modal.firstElementChild;
    if (insertionPoint) insertionPoint.insertAdjacentElement('afterend', block);
    else modal.appendChild(block);
  }

  function injectExecutivePriceBlock() {
    const root = document.getElementById('view-executive');
    if (!root || root.querySelector('.v83-exec-block')) return;
    const rows = effectiveRowsForAllMarkets();
    if (!rows.length) return;
    const review = rows.filter((row) => row.decisionStatus === 'review');
    const escalation = rows.filter((row) => row.escalation === 'final' || row.escalation === 'ksenia');
    const risk = rows.filter((row) => row.allowedMarginPct != null && row.avgMargin7dPct != null && Number(row.avgMargin7dPct) < Number(row.allowedMarginPct));
    const body = [
      { label: 'Ждут согласования', value: review.length, hint: 'Решение по цене переведено в review.' },
      { label: 'Эскалации', value: escalation.length, hint: 'Нужно решение: Ксения / финальное согласование.' },
      { label: 'Риск по марже', value: risk.length, hint: 'Маржа 7д ниже допустимой.' }
    ].map((item) => `<div class="card kpi"><div class="label">${escapeHtml(item.label)}</div><div class="value">${fmt.int(item.value)}</div><div class="hint">${escapeHtml(item.hint)}</div></div>`).join('');
    const block = document.createElement('div');
    block.className = 'v83-exec-block';
    block.innerHTML = `<div class="section-title"><div><h2>Ценовой контур</h2><p>Сколько SKU сейчас ждут решения по цене и где есть риск по марже.</p></div></div><div class="grid cards">${body}</div>`;
    root.appendChild(block);
  }

  const prevRenderSkuModal = renderSkuModal;
  renderSkuModal = function (articleKey) {
    prevRenderSkuModal(articleKey);
    try { injectSkuPriceCard(articleKey); } catch (error) { console.error(error); }
  };

  const prevRenderExecutive = renderExecutive;
  renderExecutive = function () {
    prevRenderExecutive();
    try { injectExecutivePriceBlock(); } catch (error) { console.error(error); }
  };

  const prevRerender = rerenderCurrentView;
  rerenderCurrentView = function () {
    prevRerender();
    try { renderPricesWorkbench(); } catch (error) {
      console.error(error);
      renderViewFailure('view-prices', 'Цены', error);
      setAppError(`Портал загрузил не всё: Цены / Smart workbench — ${error.message}`);
    }
  };

  const prevPullRemoteState = pullRemoteState;
  pullRemoteState = async function (rerender = true) {
    await prevPullRemoteState(false);
    await pullRemotePriceDecisions(false);
    if (rerender) {
      rerenderCurrentView();
      if (state.activeSku) renderSkuModal(state.activeSku);
    }
  };

  const prevPushRemoteState = pushStateToRemote;
  pushStateToRemote = async function () {
    await prevPushRemoteState();
    await pushRemotePriceDecisions();
    rerenderCurrentView();
    if (state.activeSku) renderSkuModal(state.activeSku);
  };

  async function bootstrapRemote(retry = 0) {
    if (hasRemoteStore()) {
      await pullRemotePriceDecisions(true);
      return;
    }
    if (retry >= REMOTE_RETRY_MAX) return;
    setTimeout(() => { bootstrapRemote(retry + 1); }, 1000);
  }

  async function boot() {
    loadLocalDecisions();
    ensurePriceSeed();
    try { rerenderCurrentView(); } catch (error) { console.error(error); }
    bootstrapRemote(0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else setTimeout(boot, 0);
})();
