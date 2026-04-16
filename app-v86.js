(function () {
  const ENTRIES_TABLE = 'portal_price_workbench_entries';
  const HISTORY_TABLE = 'portal_price_workbench_history';
  const LOCAL_ENTRIES_KEY = 'brand-portal-price-workbench-v86-entries';
  const LOCAL_HISTORY_KEY = 'brand-portal-price-workbench-v86-history';
  const REMOTE_RETRY_MAX = 45;

  const DECISION_STATUS_META = {
    draft: { label: 'Черновик', kind: '' },
    review: { label: 'На согласовании', kind: 'warn' },
    approved: { label: 'Согласовано', kind: 'ok' },
    on_hold: { label: 'Стоп / hold', kind: 'danger' },
    applied: { label: 'Применено', kind: 'info' },
    rejected: { label: 'Отклонено', kind: 'danger' }
  };

  const ESCALATION_META = {
    none: { label: 'Без эскалации', kind: '' },
    ksenia: { label: 'Ксении', kind: 'warn' },
    me_ksenia: { label: 'Я + Ксения', kind: 'danger' },
    finance: { label: 'Финансам', kind: 'info' },
    rop: { label: 'РОПу', kind: 'info' }
  };

  const PRESETS = {
    '7d': { label: '7 дней', days: 7 },
    '14d': { label: '14 дней', days: 14 },
    '30d': { label: '30 дней', days: 30 },
    month: { label: 'Текущий месяц', month: true },
    prev_month: { label: 'Прошлый месяц', prevMonth: true },
    all: { label: 'Весь период', all: true }
  };

  state.v86 = Object.assign({
    loading: false,
    issue: '',
    seed: null,
    localEntries: [],
    remoteEntries: [],
    localHistory: [],
    remoteHistory: [],
    filters: {
      market: 'wb',
      search: '',
      status: 'all',
      sort: 'risk',
      owner: 'all',
      riskOnly: false,
      dateFrom: '',
      dateTo: '',
      preset: 'month'
    },
    selectedKey: ''
  }, state.v86 || {});

  function corporateBranding() {
    try {
      document.title = 'Портал бренда Алтея · v8.7 Imperial';
      const sub = document.querySelector('.brand-sub');
      if (sub) sub.textContent = 'Порядок рождается из воли.';
      const h1 = document.querySelector('.topbar h1');
      if (h1) h1.textContent = 'Портал бренда Алтея';
      const p = document.querySelector('.topbar p');
      if (p) p.textContent = 'Истина в том, что правых нет. Есть лишь те, кто выдержал цену решений и не потерял курс во тьме.';
      document.body.classList.add('v86-corporate');
      document.body.classList.add('v87-imperial');
    } catch (error) {
      console.error(error);
    }
  }

  function moneyShort(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return `${fmt.num(Number(value), 0)} ₽`;
  }

  function pctShort(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  function parseNum(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(',', '.').replace('%', ''));
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

  function isoToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function marketLabel(key) {
    return ({ wb: 'WB', ozon: 'ОЗ', ym: 'ЯМ' })[key] || key;
  }

  function workbenchKey(marketplace, articleKey) {
    return `${marketplace}|${articleKey}`;
  }

  function defaultAllowedMargin(row) {
    const raw = parseNum(row.allowedMarginPct);
    if (raw === null) return 0.15;
    return raw;
  }

  function normalizeEntry(item = {}) {
    const marketplace = ['wb', 'ozon', 'ym'].includes(String(item.marketplace || '').toLowerCase()) ? String(item.marketplace || '').toLowerCase() : 'wb';
    const articleKey = String(item.articleKey || item.article_key || '').trim();
    const sku = articleKey ? getSku(articleKey) : null;
    const decisionStatus = DECISION_STATUS_META[item.decisionStatus || item.decision_status] ? (item.decisionStatus || item.decision_status) : 'draft';
    const escalationRaw = item.escalation || item.escalation_code || item.escalation_type || 'none';
    const escalation = ESCALATION_META[escalationRaw] ? escalationRaw : (escalationRaw === 'final' ? 'me_ksenia' : 'none');
    return {
      id: String(item.id || stableId('price-decision', `${currentBrand()}|${marketplace}|${articleKey}`)).trim(),
      brand: currentBrand(),
      marketplace,
      articleKey,
      decisionStatus,
      targetFillPrice: parseNum(item.targetFillPrice ?? item.target_fill_price),
      targetClientPrice: parseNum(item.targetClientPrice ?? item.target_client_price),
      allowedMarginManualPct: parseNum(item.allowedMarginManualPct ?? item.allowed_margin_manual_pct),
      reason: String(item.reason || '').trim(),
      owner: String(item.owner || item.owner_name || ownerName(sku) || '').trim(),
      dueDate: normalizedDate(item.dueDate || item.due_date),
      needsTask: Boolean(item.needsTask ?? item.needs_task),
      escalation,
      comment: String(item.comment || '').trim(),
      updatedBy: String(item.updatedBy || item.updated_by || state.team.member?.name || 'Команда').trim() || 'Команда',
      updatedAt: String(item.updatedAt || item.updated_at || new Date().toISOString()).trim() || new Date().toISOString(),
      createdAt: String(item.createdAt || item.created_at || item.updatedAt || new Date().toISOString()).trim() || new Date().toISOString()
    };
  }

  function normalizeHistory(item = {}) {
    return {
      id: String(item.id || stableId('price-history', JSON.stringify(item))).trim(),
      brand: currentBrand(),
      marketplace: String(item.marketplace || '').trim() || 'wb',
      articleKey: String(item.articleKey || item.article_key || '').trim(),
      eventType: String(item.eventType || item.event_type || 'save').trim() || 'save',
      oldTargetFillPrice: parseNum(item.oldTargetFillPrice ?? item.old_target_fill_price),
      newTargetFillPrice: parseNum(item.newTargetFillPrice ?? item.new_target_fill_price),
      oldTargetClientPrice: parseNum(item.oldTargetClientPrice ?? item.old_target_client_price),
      newTargetClientPrice: parseNum(item.newTargetClientPrice ?? item.new_target_client_price),
      oldAllowedMarginPct: parseNum(item.oldAllowedMarginPct ?? item.old_allowed_margin_pct),
      newAllowedMarginPct: parseNum(item.newAllowedMarginPct ?? item.new_allowed_margin_pct),
      oldDecisionStatus: String(item.oldDecisionStatus || item.old_decision_status || '').trim(),
      newDecisionStatus: String(item.newDecisionStatus || item.new_decision_status || '').trim(),
      reason: String(item.reason || '').trim(),
      comment: String(item.comment || '').trim(),
      changedBy: String(item.changedBy || item.changed_by || state.team.member?.name || 'Команда').trim() || 'Команда',
      changedAt: String(item.changedAt || item.changed_at || new Date().toISOString()).trim() || new Date().toISOString(),
      synced: item.synced !== false
    };
  }

  function loadLocalState() {
    try {
      const entries = JSON.parse(localStorage.getItem(LOCAL_ENTRIES_KEY) || '[]');
      state.v86.localEntries = Array.isArray(entries) ? entries.map(normalizeEntry) : [];
    } catch {
      state.v86.localEntries = [];
    }
    try {
      const history = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]');
      state.v86.localHistory = Array.isArray(history) ? history.map(normalizeHistory) : [];
    } catch {
      state.v86.localHistory = [];
    }
  }

  function saveLocalState() {
    localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(state.v86.localEntries || []));
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(state.v86.localHistory || []));
  }

  function entryToRemote(entry) {
    return {
      id: entry.id,
      brand: currentBrand(),
      marketplace: entry.marketplace,
      article_key: entry.articleKey,
      decision_status: entry.decisionStatus,
      target_fill_price: entry.targetFillPrice,
      target_client_price: entry.targetClientPrice,
      allowed_margin_manual_pct: entry.allowedMarginManualPct,
      reason: entry.reason,
      owner_name: entry.owner,
      due_date: entry.dueDate || null,
      needs_task: entry.needsTask,
      escalation: entry.escalation,
      comment: entry.comment,
      updated_by: entry.updatedBy,
      updated_at: entry.updatedAt,
      created_at: entry.createdAt
    };
  }

  function historyToRemote(row) {
    return {
      id: row.id,
      brand: currentBrand(),
      marketplace: row.marketplace,
      article_key: row.articleKey,
      event_type: row.eventType,
      old_target_fill_price: row.oldTargetFillPrice,
      new_target_fill_price: row.newTargetFillPrice,
      old_target_client_price: row.oldTargetClientPrice,
      new_target_client_price: row.newTargetClientPrice,
      old_allowed_margin_pct: row.oldAllowedMarginPct,
      new_allowed_margin_pct: row.newAllowedMarginPct,
      old_decision_status: row.oldDecisionStatus || null,
      new_decision_status: row.newDecisionStatus || null,
      reason: row.reason,
      comment: row.comment,
      changed_by: row.changedBy,
      changed_at: row.changedAt
    };
  }

  async function queryRemoteEntries() {
    if (!hasRemoteStore()) return [];
    const response = await state.team.client
      .from(ENTRIES_TABLE)
      .select('*')
      .eq('brand', currentBrand())
      .order('updated_at', { ascending: false });
    if (response.error) throw response.error;
    return response.data || [];
  }

  async function upsertRemoteEntries(rows) {
    if (!hasRemoteStore() || !rows.length) return;
    const response = await state.team.client
      .from(ENTRIES_TABLE)
      .upsert(rows.map(entryToRemote), { onConflict: 'id' });
    if (response.error) throw response.error;
  }

  async function deleteRemoteEntry(id) {
    if (!hasRemoteStore() || !id) return;
    const response = await state.team.client.from(ENTRIES_TABLE).delete().eq('id', id);
    if (response.error) throw response.error;
  }

  async function queryRemoteHistory() {
    if (!hasRemoteStore()) return [];
    const response = await state.team.client
      .from(HISTORY_TABLE)
      .select('*')
      .eq('brand', currentBrand())
      .order('changed_at', { ascending: false })
      .limit(1000);
    if (response.error) throw response.error;
    return response.data || [];
  }

  async function insertRemoteHistory(rows) {
    if (!hasRemoteStore() || !rows.length) return;
    const response = await state.team.client
      .from(HISTORY_TABLE)
      .insert(rows.map(historyToRemote));
    if (response.error) throw response.error;
  }

  function ensureSeedLoaded() {
    if (state.v83?.seed) {
      state.v86.seed = state.v83.seed;
      initDateRangeIfNeeded();
      return Promise.resolve(state.v83.seed);
    }
    if (state.v86.loading || state.v86.seed) return Promise.resolve(state.v86.seed);
    state.v86.loading = true;
    return loadJson('data/smart_price_workbench.json')
      .then((data) => {
        state.v86.seed = data;
        if (state.v83) state.v83.seed = data;
        state.v86.issue = '';
        initDateRangeIfNeeded();
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
        return data;
      })
      .catch((error) => {
        console.error(error);
        state.v86.issue = error.message;
        setAppError(`Портал загрузил не всё: Цены — ${error.message}`);
        return null;
      })
      .finally(() => {
        state.v86.loading = false;
      });
  }

  function baseRowsForMarket(market) {
    const seed = state.v86.seed || state.v83?.seed;
    if (!seed) return [];
    return (((seed.platforms || {})[market] || {}).rows || []).map((row) => ({ ...row }));
  }

  function allDatesForMarket(market) {
    const seen = new Set();
    const dates = [];
    for (const row of baseRowsForMarket(market)) {
      for (const item of row.monthly || []) {
        const date = normalizedDate(item.date);
        if (date && !seen.has(date)) {
          seen.add(date);
          dates.push(date);
        }
      }
    }
    dates.sort();
    return dates;
  }

  function presetRange(preset, market) {
    const dates = allDatesForMarket(market);
    if (!dates.length) return { dateFrom: '', dateTo: '' };
    const min = dates[0];
    const max = dates[dates.length - 1];
    if (preset === 'all') return { dateFrom: min, dateTo: max };
    const maxDate = new Date(max);
    if (preset === 'prev_month') {
      const year = maxDate.getUTCFullYear();
      const month = maxDate.getUTCMonth();
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0));
      return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) };
    }
    if (preset === 'month') {
      const start = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), 1));
      return { dateFrom: start.toISOString().slice(0, 10), dateTo: max };
    }
    const days = PRESETS[preset]?.days || 30;
    const start = new Date(maxDate);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const startIso = start.toISOString().slice(0, 10);
    return { dateFrom: startIso < min ? min : startIso, dateTo: max };
  }

  function initDateRangeIfNeeded() {
    if (state.v86.filters.dateFrom && state.v86.filters.dateTo) return;
    const range = presetRange(state.v86.filters.preset || 'month', state.v86.filters.market || 'wb');
    state.v86.filters.dateFrom = range.dateFrom;
    state.v86.filters.dateTo = range.dateTo;
  }

  function applyPreset(preset) {
    state.v86.filters.preset = preset;
    const range = presetRange(preset, state.v86.filters.market || 'wb');
    state.v86.filters.dateFrom = range.dateFrom;
    state.v86.filters.dateTo = range.dateTo;
    renderPriceWorkbenchV86();
  }

  function withinRange(date) {
    const value = normalizedDate(date);
    if (!value) return false;
    const from = state.v86.filters.dateFrom || '';
    const to = state.v86.filters.dateTo || '';
    if (from && value < from) return false;
    if (to && value > to) return false;
    return true;
  }

  function mergeEntryLayers() {
    const map = new Map();
    for (const item of state.v86.remoteEntries || []) map.set(workbenchKey(item.marketplace, item.articleKey), item);
    for (const item of state.v86.localEntries || []) map.set(workbenchKey(item.marketplace, item.articleKey), item);
    return map;
  }

  function sourceLabel(row) {
    if (row.allowedMarginManualPct != null) return 'manual';
    if (row.allowedMarginPct != null) return 'source';
    return 'default';
  }

  function applyEntry(row, entry) {
    const merged = entry ? normalizeEntry(entry) : normalizeEntry({ marketplace: row.marketplace, articleKey: row.articleKey, owner: row.owner });
    const effectiveAllowed = merged.allowedMarginManualPct != null ? merged.allowedMarginManualPct : defaultAllowedMargin(row);
    const monthly = (Array.isArray(row.monthly) ? row.monthly : []).filter((item) => withinRange(item.date));
    const latest = monthly.length ? monthly[monthly.length - 1] : null;
    const avgTurnover = monthly.length ? monthly.reduce((sum, item) => sum + (parseNum(item.turnoverDays) || 0), 0) / monthly.length : (parseNum(row.turnoverTotalDays) || null);
    const avgSpp = monthly.length ? monthly.reduce((sum, item) => sum + (parseNum(item.sppPct) || 0), 0) / monthly.length : (parseNum(row.currentSppPct) || null);
    const latestPrice = latest ? parseNum(latest.price) : (parseNum(row.currentFillPrice) || parseNum(row.monthlyCurrentPrice));
    const latestClient = latestPrice != null ? latestPrice * (1 - (parseNum(latest?.sppPct) ?? parseNum(row.currentSppPct) ?? 0)) : (parseNum(row.currentClientPrice) || null);
    return {
      ...row,
      decisionId: merged.id,
      decisionStatus: merged.decisionStatus,
      targetFillPrice: merged.targetFillPrice ?? row.seedTargetFillPrice ?? latestPrice ?? row.currentFillPrice,
      targetClientPrice: merged.targetClientPrice ?? row.seedTargetClientPrice ?? latestClient ?? row.currentClientPrice,
      allowedMarginManualPct: merged.allowedMarginManualPct,
      effectiveAllowedMarginPct: effectiveAllowed,
      allowedMarginSource: sourceLabel({ ...row, allowedMarginManualPct: merged.allowedMarginManualPct }),
      currentFillPriceDisplay: latestPrice,
      currentClientPriceDisplay: latestClient,
      currentSppDisplay: latest ? parseNum(latest.sppPct) : parseNum(row.currentSppPct),
      turnoverDisplay: avgTurnover,
      avgSppDisplay: avgSpp,
      monthlyFiltered: monthly,
      owner: merged.owner || row.owner || '',
      dueDate: merged.dueDate || '',
      needsTask: merged.needsTask,
      escalation: merged.escalation,
      reason: merged.reason || row.seedReason || '',
      comment: merged.comment || '',
      updatedBy: merged.updatedBy,
      updatedAt: merged.updatedAt,
      createdAt: merged.createdAt,
      deltaFillPrice: (merged.targetFillPrice ?? row.seedTargetFillPrice ?? latestPrice) != null && latestPrice != null ? (merged.targetFillPrice ?? row.seedTargetFillPrice ?? latestPrice) - latestPrice : null,
      deltaClientPrice: (merged.targetClientPrice ?? row.seedTargetClientPrice ?? latestClient) != null && latestClient != null ? (merged.targetClientPrice ?? row.seedTargetClientPrice ?? latestClient) - latestClient : null
    };
  }

  function signalsForRow(row) {
    const items = [];
    if (row.effectiveAllowedMarginPct != null && row.avgMargin7dPct != null && Number(row.avgMargin7dPct) < Number(row.effectiveAllowedMarginPct)) items.push({ label: 'Средняя маржа 7д ниже допустимой', kind: 'danger' });
    if (row.marginTotalPct != null && row.effectiveAllowedMarginPct != null && Number(row.marginTotalPct) < Number(row.effectiveAllowedMarginPct)) items.push({ label: 'Текущая маржа total ниже порога', kind: 'danger' });
    if (row.turnoverDisplay != null && Number(row.turnoverDisplay) >= 60) items.push({ label: 'Высокая оборачиваемость', kind: 'danger' });
    else if (row.turnoverDisplay != null && Number(row.turnoverDisplay) >= 45) items.push({ label: 'Оборачиваемость требует внимания', kind: 'warn' });
    if (row.targetFillPrice != null && row.minPrice != null && Number(row.targetFillPrice) < Number(row.minPrice)) items.push({ label: 'Новая цена ниже min price', kind: 'danger' });
    if (row.escalation !== 'none') items.push({ label: `Эскалация: ${(ESCALATION_META[row.escalation] || ESCALATION_META.none).label}`, kind: (ESCALATION_META[row.escalation] || ESCALATION_META.none).kind || 'warn' });
    if (row.decisionStatus === 'review') items.push({ label: 'Ждёт согласования', kind: 'warn' });
    if (row.needsTask) items.push({ label: 'Нужно действие / задача', kind: 'info' });
    return items;
  }

  function riskScore(row) {
    return signalsForRow(row).reduce((sum, item) => sum + (item.kind === 'danger' ? 3 : item.kind === 'warn' ? 2 : 1), 0);
  }

  function effectiveRows() {
    const market = state.v86.filters.market || 'wb';
    const decisionMap = mergeEntryLayers();
    return baseRowsForMarket(market).map((row) => applyEntry(row, decisionMap.get(workbenchKey(market, row.articleKey))));
  }

  function filteredRows() {
    const q = String(state.v86.filters.search || '').trim().toLowerCase();
    const statusFilter = state.v86.filters.status || 'all';
    const sortMode = state.v86.filters.sort || 'risk';
    const ownerFilter = state.v86.filters.owner || 'all';
    const riskOnly = Boolean(state.v86.filters.riskOnly);
    const rows = effectiveRows().filter((row) => {
      if (q) {
        const hay = `${row.articleKey} ${row.article} ${row.name} ${row.owner} ${row.reason}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== 'all' && row.decisionStatus !== statusFilter) return false;
      if (ownerFilter !== 'all' && row.owner !== ownerFilter) return false;
      if (riskOnly && riskScore(row) < 3) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sortMode === 'turnover') return (Number(b.turnoverDisplay) || 0) - (Number(a.turnoverDisplay) || 0);
      if (sortMode === 'margin') return (Number(a.avgMargin7dPct) || 0) - (Number(b.avgMargin7dPct) || 0);
      if (sortMode === 'updated') return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      return riskScore(b) - riskScore(a) || (Number(b.turnoverDisplay) || 0) - (Number(a.turnoverDisplay) || 0);
    });
    return rows;
  }

  function selectedRow(rows) {
    if (!rows.length) return null;
    const found = rows.find((row) => workbenchKey(row.marketplace, row.articleKey) === state.v86.selectedKey);
    if (found) return found;
    state.v86.selectedKey = workbenchKey(rows[0].marketplace, rows[0].articleKey);
    return rows[0];
  }

  function summaryCards(rows) {
    const below = rows.filter((row) => row.avgMargin7dPct != null && row.effectiveAllowedMarginPct != null && Number(row.avgMargin7dPct) < Number(row.effectiveAllowedMarginPct));
    const review = rows.filter((row) => row.decisionStatus === 'review');
    const tasks = rows.filter((row) => row.needsTask);
    const avgClient = rows.length ? rows.reduce((sum, row) => sum + (parseNum(row.currentClientPriceDisplay) || 0), 0) / rows.length : 0;
    return [
      { label: 'SKU в работе', value: fmt.int(rows.length), hint: 'Текущий срез блока цен.' },
      { label: 'Ниже допустимой маржи', value: fmt.int(below.length), hint: 'Средняя маржа 7д ниже допустимой.' },
      { label: 'Ждут согласования', value: fmt.int(review.length), hint: 'Решение по цене нужно согласовать.' },
      { label: 'Средняя цена клиента', value: rows.length ? moneyShort(avgClient) : '—', hint: 'Пересчитана под фильтр периода.' },
    ];
  }

  function decisionStatusBadge(row) {
    const meta = DECISION_STATUS_META[row.decisionStatus] || DECISION_STATUS_META.draft;
    return badge(meta.label, meta.kind);
  }

  function sourceBadge(row) {
    return badge(row.allowedMarginSource === 'manual' ? 'Ручная маржа' : row.allowedMarginSource === 'source' ? 'Из файла' : 'Дефолт', row.allowedMarginSource === 'manual' ? 'info' : row.allowedMarginSource === 'source' ? '' : 'warn');
  }

  function renderHeaderFilters(rows) {
    const owners = Array.from(new Set(rows.map((row) => row.owner).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'));
    return `
      <div class="v86-sticky-bar">
        <div class="v87-sticky-title">
          <strong>Период и рабочие фильтры цены</strong>
          <span>Фильтр по датам закреплён сверху и перестраивает историю, summary, таблицу и карточку SKU.</span>
        </div>
        <div class="v86-market-switch">
          ${['wb', 'ozon', 'ym'].map((key) => `<button type="button" class="quick-chip ${state.v86.filters.market === key ? 'active' : ''}" data-v86-market="${key}">${marketLabel(key)}</button>`).join('')}
        </div>
        <div class="v86-date-bar">
          <label><span>С даты</span><input type="date" id="v86DateFrom" value="${escapeHtml(state.v86.filters.dateFrom)}"></label>
          <label><span>По дату</span><input type="date" id="v86DateTo" value="${escapeHtml(state.v86.filters.dateTo)}"></label>
          <div class="v86-preset-chips">
            ${Object.entries(PRESETS).map(([key, meta]) => `<button type="button" class="quick-chip ${state.v86.filters.preset === key ? 'active' : ''}" data-v86-preset="${key}">${escapeHtml(meta.label)}</button>`).join('')}
          </div>
        </div>
        <div class="v86-secondary-filters">
          <input id="v86Search" placeholder="Поиск по SKU, названию, owner или причине" value="${escapeHtml(state.v86.filters.search)}">
          <select id="v86OwnerFilter"><option value="all">Все owner</option>${owners.map((owner) => `<option value="${escapeHtml(owner)}" ${state.v86.filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}</select>
          <select id="v86StatusFilter"><option value="all">Все статусы решений</option>${Object.entries(DECISION_STATUS_META).map(([value, meta]) => `<option value="${value}" ${state.v86.filters.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
          <select id="v86SortMode">
            <option value="risk" ${state.v86.filters.sort === 'risk' ? 'selected' : ''}>Сначала рисковые</option>
            <option value="turnover" ${state.v86.filters.sort === 'turnover' ? 'selected' : ''}>По оборачиваемости</option>
            <option value="margin" ${state.v86.filters.sort === 'margin' ? 'selected' : ''}>По марже</option>
            <option value="updated" ${state.v86.filters.sort === 'updated' ? 'selected' : ''}>По обновлению</option>
          </select>
          <label class="v86-risk-toggle"><input type="checkbox" id="v86RiskOnly" ${state.v86.filters.riskOnly ? 'checked' : ''}> Только риск</label>
        </div>
      </div>
    `;
  }

  function renderWorkbenchTable(rows) {
    if (!rows.length) return '<div class="empty">По текущим фильтрам ничего не найдено.</div>';
    const body = rows.map((row) => {
      const key = workbenchKey(row.marketplace, row.articleKey);
      const selected = key === state.v86.selectedKey;
      return `
        <tr class="${selected ? 'is-selected' : ''} ${riskScore(row) >= 3 ? 'is-risk' : ''}" data-v86-select="${escapeHtml(key)}">
          <td><div class="v83-sku-title">${escapeHtml(row.articleKey)}</div><div class="muted small">${escapeHtml(row.name || row.article || 'Без названия')}</div></td>
          <td>${escapeHtml(row.owner || '—')}</td>
          <td>${pctShort(row.avgMargin7dPct)}</td>
          <td>${pctShort(row.effectiveAllowedMarginPct)}</td>
          <td>${row.turnoverDisplay == null ? '—' : `${fmt.num(row.turnoverDisplay, 1)} дн.`}</td>
          <td>${moneyShort(row.currentFillPriceDisplay)}</td>
          <td>${moneyShort(row.currentClientPriceDisplay)}</td>
          <td>${pctShort(row.currentSppDisplay)}</td>
          <td>${moneyShort(row.targetFillPrice)}</td>
          <td>${decisionStatusBadge(row)}</td>
        </tr>
      `;
    }).join('');
    return `
      <div class="v83-table-wrap">
        <table class="v83-table v86-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Owner</th>
              <th>Маржа 7д</th>
              <th>Допустимая</th>
              <th>Обор.</th>
              <th>Цена MP</th>
              <th>Цена с СПП</th>
              <th>СПП</th>
              <th>Предлагаемая</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function filteredHistoryForSelected(row) {
    const all = [...(state.v86.remoteHistory || []), ...(state.v86.localHistory || [])]
      .filter((item) => item.articleKey === row.articleKey && item.marketplace === row.marketplace)
      .sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt)));
    const seen = new Set();
    return all.filter((item) => {
      const key = `${item.id}|${item.changedAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return withinRange(item.changedAt);
    });
  }

  function renderDecisionHistory(row) {
    const entries = filteredHistoryForSelected(row);
    if (!entries.length) return '<div class="empty">История решений по выбранному периоду пока пуста.</div>';
    const body = entries.map((item) => `
      <tr>
        <td>${escapeHtml(String(item.changedAt).slice(0, 10))}</td>
        <td>${escapeHtml(item.changedBy || '—')}</td>
        <td>${pctShort(item.newAllowedMarginPct)}</td>
        <td>${moneyShort(item.newTargetFillPrice)}</td>
        <td>${moneyShort(item.newTargetClientPrice)}</td>
        <td>${escapeHtml((DECISION_STATUS_META[item.newDecisionStatus] || DECISION_STATUS_META.draft).label)}</td>
      </tr>
    `).join('');
    return `
      <div class="v86-history-wrap">
        <table class="v86-history-table">
          <thead><tr><th>Дата</th><th>Кто</th><th>Допустимая маржа</th><th>Цена MP</th><th>Цена с СПП</th><th>Статус</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function renderPeriodHistory(row) {
    const series = row.monthlyFiltered || [];
    if (!series.length) return '<div class="empty">За выбранный период нет дневной истории.</div>';
    const items = series.map((item) => {
      const client = parseNum(item.price) != null ? parseNum(item.price) * (1 - (parseNum(item.sppPct) || 0)) : null;
      return `
        <tr>
          <td>${escapeHtml(String(item.date).slice(5))}</td>
          <td>${item.turnoverDays == null ? '—' : `${fmt.num(item.turnoverDays, 1)} дн.`}</td>
          <td>${moneyShort(item.price)}</td>
          <td>${moneyShort(client)}</td>
          <td>${pctShort(item.sppPct)}</td>
        </tr>
      `;
    }).join('');
    return `
      <div class="v86-history-wrap">
        <table class="v86-history-table">
          <thead><tr><th>Дата</th><th>Обор.</th><th>Цена MP</th><th>Цена с СПП</th><th>СПП</th></tr></thead>
          <tbody>${items}</tbody>
        </table>
      </div>
    `;
  }

  function renderDetail(row) {
    if (!row) return '<div class="card"><div class="empty">Выбери SKU слева, чтобы работать с ценой.</div></div>';
    const signals = signalsForRow(row).map((item) => badge(item.label, item.kind)).join('') || '<span class="muted small">Сигналы не выявлены</span>';
    return `
      <div class="card v83-detail-card v86-detail-card">
        <div class="head">
          <div>
            <h3>${escapeHtml(row.articleKey)}</h3>
            <div class="muted small">${escapeHtml(row.name || row.article || '')}</div>
          </div>
          <div class="badge-stack">${badge(marketLabel(row.marketplace), 'info')}${decisionStatusBadge(row)}${sourceBadge(row)}</div>
        </div>

        <div class="grid cards v83-kpi-grid v86-kpi-grid">
          <div class="card kpi"><div class="label">Цена MP сейчас</div><div class="value">${moneyShort(row.currentFillPriceDisplay)}</div><div class="hint">С учётом фильтра периода.</div></div>
          <div class="card kpi"><div class="label">Цена с СПП</div><div class="value">${moneyShort(row.currentClientPriceDisplay)}</div><div class="hint">Текущая цена для клиента.</div></div>
          <div class="card kpi"><div class="label">СПП</div><div class="value">${pctShort(row.currentSppDisplay)}</div><div class="hint">Среднее значение по периоду.</div></div>
          <div class="card kpi"><div class="label">Допустимая маржа</div><div class="value">${pctShort(row.effectiveAllowedMarginPct)}</div><div class="hint">Источник: ${row.allowedMarginSource === 'manual' ? 'ручная настройка' : row.allowedMarginSource === 'source' ? 'из файла' : 'дефолт'}.</div></div>
          <div class="card kpi"><div class="label">Маржа 7д</div><div class="value">${pctShort(row.avgMargin7dPct)}</div><div class="hint">Из текущего среза.</div></div>
          <div class="card kpi"><div class="label">Обор. средняя</div><div class="value">${row.turnoverDisplay == null ? '—' : `${fmt.num(row.turnoverDisplay, 1)} дн.`}</div><div class="hint">Средняя по всем складам за выбранный период.</div></div>
        </div>

        <div class="v83-chip-row">${signals}</div>

        <form class="v83-form v86-form" data-v86-form="${escapeHtml(workbenchKey(row.marketplace, row.articleKey))}">
          <div class="v83-form-grid v86-form-grid">
            <label>
              <span>Статус решения</span>
              <select name="decisionStatus">${Object.entries(DECISION_STATUS_META).map(([value, meta]) => `<option value="${value}" ${row.decisionStatus === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
            </label>
            <label>
              <span>Owner решения</span>
              <input name="owner" value="${escapeHtml(row.owner || '')}" list="v86-owners-list">
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
              <span>Цена в MP сейчас</span>
              <input value="${row.currentFillPriceDisplay ?? ''}" disabled>
            </label>
            <label>
              <span>Новая цена в MP</span>
              <input type="number" step="0.01" name="targetFillPrice" value="${row.targetFillPrice ?? ''}">
            </label>
            <label>
              <span>Цена с СПП сейчас</span>
              <input value="${row.currentClientPriceDisplay ?? ''}" disabled>
            </label>
            <label>
              <span>Новая цена с СПП</span>
              <input type="number" step="0.01" name="targetClientPrice" value="${row.targetClientPrice ?? ''}">
            </label>
            <label>
              <span>Допустимая маржа, %</span>
              <input type="number" step="0.1" name="allowedMarginManualPct" value="${row.allowedMarginManualPct != null ? (row.allowedMarginManualPct * 100).toFixed(1) : ''}" placeholder="Например, 18.0">
            </label>
            <label>
              <span>Текущий источник маржи</span>
              <input value="${row.allowedMarginSource === 'manual' ? 'Ручная настройка' : row.allowedMarginSource === 'source' ? 'Из файла' : 'Системный дефолт'}" disabled>
            </label>
            <label class="v83-span-2">
              <span>Причина / логика решения</span>
              <textarea name="reason" rows="2" placeholder="Почему меняем цену и что хотим получить">${escapeHtml(row.reason || '')}</textarea>
            </label>
            <label class="v83-span-2">
              <span>Комментарий</span>
              <textarea name="comment" rows="2" placeholder="Что важно для Ксении / РОПа / финансов">${escapeHtml(row.comment || '')}</textarea>
            </label>
            <label class="v83-check"><input type="checkbox" name="needsTask" ${row.needsTask ? 'checked' : ''}><span>Создать / обновить задачу по цене</span></label>
          </div>
          <div class="v83-form-actions">
            <button type="submit" class="btn">Сохранить решение</button>
            <button type="button" class="btn ghost" data-v86-price-task="${escapeHtml(workbenchKey(row.marketplace, row.articleKey))}">Создать задачу сейчас</button>
            <button type="button" class="btn ghost" data-v86-reset="${escapeHtml(workbenchKey(row.marketplace, row.articleKey))}">Сбросить решение</button>
            <button type="button" class="btn ghost" data-v86-copy-sku="${escapeHtml(row.articleKey)}">Скопировать SKU</button>
          </div>
        </form>
        <datalist id="v86-owners-list">${ownerOptions().map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>

        <div class="v83-projection-grid v86-projection-grid">
          <div class="card mini"><div class="label">Из файла</div><div class="value">${moneyShort(row.seedTargetFillPrice)}</div><div class="hint">Целевая цена из файла Смарт.</div></div>
          <div class="card mini"><div class="label">Дельта цены</div><div class="value">${row.deltaFillPrice == null ? '—' : moneyShort(row.deltaFillPrice)}</div><div class="hint">Новая цена MP минус текущая.</div></div>
          <div class="card mini"><div class="label">Нужная цена для рентаб.</div><div class="value">${moneyShort(row.requiredPriceForProfitability)}</div><div class="hint">Расчёт из файла.</div></div>
          <div class="card mini"><div class="label">Нужная цена для маржи</div><div class="value">${moneyShort(row.requiredPriceForMargin)}</div><div class="hint">Расчёт из файла.</div></div>
        </div>

        <div class="subsection" style="margin-top:16px">
          <div class="head"><div><h3>История периода</h3><div class="muted small">Цена / СПП / оборачиваемость под выбранный диапазон дат.</div></div></div>
          ${renderPeriodHistory(row)}
        </div>
        <div class="subsection" style="margin-top:16px">
          <div class="head"><div><h3>История решений и допустимой маржи</h3><div class="muted small">Команда видит, кто и когда менял цену и допустимую маржу.</div></div></div>
          ${renderDecisionHistory(row)}
        </div>
      </div>
    `;
  }

  function renderPriceWorkbenchV86() {
    const root = document.getElementById('view-prices');
    if (!root) return;
    if (state.v86.loading && !(state.v86.seed || state.v83?.seed)) {
      root.innerHTML = '<div class="card"><div class="empty">Загружаю price workbench…</div></div>';
      return;
    }
    if (state.v86.issue && !(state.v86.seed || state.v83?.seed)) {
      root.innerHTML = `<div class="card"><div class="empty">Не удалось загрузить ценовой workbench: ${escapeHtml(state.v86.issue)}</div></div>`;
      return;
    }
    if (!(state.v86.seed || state.v83?.seed)) {
      root.innerHTML = '<div class="card"><div class="empty">Ценовой блок ещё не загружен.</div></div>';
      return;
    }
    initDateRangeIfNeeded();
    const rows = filteredRows();
    const current = selectedRow(rows);
    const cards = summaryCards(rows).map((card) => `
      <div class="card kpi control-card">
        <div class="label">${escapeHtml(card.label)}</div>
        <div class="value">${card.value}</div>
        <div class="hint">${escapeHtml(card.hint)}</div>
      </div>`).join('');

    root.innerHTML = `
      <div class="section-title v86-section-title">
        <div>
          <h2>Цены / Price Workbench</h2>
          <p>Это рабочий блок команды по ценам: здесь задают новую цену в MP, цену с учётом СПП, допустимую маржу, причину решения, owner и срок. Excel остаётся source/backup, а работа идёт в портале.</p>
        </div>
      </div>
      ${renderHeaderFilters(baseRowsForMarket(state.v86.filters.market || 'wb'))}
      <div class="footer-note v86-note">Фильтр по дате влияет на историю, среднюю оборачиваемость, цену и СПП по выбранному периоду. Допустимая маржа может храниться как ручная настройка и имеет свою историю.</div>
      <div class="grid cards">${cards}</div>
      <div class="v83-layout v86-layout">
        <div class="card v83-master-card">
          <div class="head">
            <div>
              <h3>SKU в работе с ценами</h3>
              <div class="muted small">Фильтры и период сверху влияют на всю таблицу. Колонка “Цена с СПП” добавлена как отдельный рабочий показатель.</div>
            </div>
            <div class="badge-stack">${badge(`Источник: ${escapeHtml((state.v86.seed || state.v83.seed).sourceFile || 'seed')}`)}</div>
          </div>
          ${renderWorkbenchTable(rows)}
        </div>
        ${renderDetail(current)}
      </div>
    `;

    const on = (selector, eventName, handler) => {
      const node = root.querySelector(selector);
      if (node) node.addEventListener(eventName, handler);
    };
    on('#v86Search', 'input', (e) => { state.v86.filters.search = e.target.value; renderPriceWorkbenchV86(); });
    on('#v86OwnerFilter', 'change', (e) => { state.v86.filters.owner = e.target.value; renderPriceWorkbenchV86(); });
    on('#v86StatusFilter', 'change', (e) => { state.v86.filters.status = e.target.value; renderPriceWorkbenchV86(); });
    on('#v86SortMode', 'change', (e) => { state.v86.filters.sort = e.target.value; renderPriceWorkbenchV86(); });
    on('#v86RiskOnly', 'change', (e) => { state.v86.filters.riskOnly = e.target.checked; renderPriceWorkbenchV86(); });
    on('#v86DateFrom', 'change', (e) => { state.v86.filters.dateFrom = e.target.value; state.v86.filters.preset = 'custom'; renderPriceWorkbenchV86(); });
    on('#v86DateTo', 'change', (e) => { state.v86.filters.dateTo = e.target.value; state.v86.filters.preset = 'custom'; renderPriceWorkbenchV86(); });
    root.querySelectorAll('[data-v86-preset]').forEach((btn) => btn.addEventListener('click', () => applyPreset(btn.dataset.v86Preset)));
    root.querySelectorAll('[data-v86-market]').forEach((btn) => btn.addEventListener('click', () => {
      state.v86.filters.market = btn.dataset.v86Market;
      state.v86.selectedKey = '';
      const range = presetRange(state.v86.filters.preset || 'month', state.v86.filters.market);
      state.v86.filters.dateFrom = range.dateFrom;
      state.v86.filters.dateTo = range.dateTo;
      renderPriceWorkbenchV86();
    }));
    root.querySelectorAll('[data-v86-select]').forEach((row) => row.addEventListener('click', () => { state.v86.selectedKey = row.dataset.v86Select; renderPriceWorkbenchV86(); }));
    root.querySelectorAll('[data-v86-form]').forEach((form) => form.addEventListener('submit', handleSubmit));
    root.querySelectorAll('[data-v86-reset]').forEach((btn) => btn.addEventListener('click', handleReset));
    root.querySelectorAll('[data-v86-price-task]').forEach((btn) => btn.addEventListener('click', handleCreateTask));
    root.querySelectorAll('[data-v86-copy-sku]').forEach((btn) => btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(btn.dataset.v86CopySku || ''); state.team.note = `SKU скопирован: ${btn.dataset.v86CopySku}`; updateSyncBadge(); } catch (error) { console.error(error); }
    }));
  }

  function getCurrentRowByKey(key) {
    return filteredRows().find((row) => workbenchKey(row.marketplace, row.articleKey) === key) || effectiveRows().find((row) => workbenchKey(row.marketplace, row.articleKey) === key) || null;
  }

  function upsertLocalEntry(entry) {
    const normalized = normalizeEntry(entry);
    const key = workbenchKey(normalized.marketplace, normalized.articleKey);
    state.v86.localEntries = [...(state.v86.localEntries || []).filter((item) => workbenchKey(item.marketplace, item.articleKey) !== key), normalized];
    // keep legacy layer in sync for old cards/tasks
    if (state.v83) {
      const legacy = normalizeEntry(normalized);
      state.v83.localDecisions = [...(state.v83.localDecisions || []).filter((item) => workbenchKey(item.marketplace, item.articleKey) !== key), legacy];
      try { localStorage.setItem('brand-portal-price-workbench-v83', JSON.stringify(state.v83.localDecisions || [])); } catch {}
    }
    saveLocalState();
    return normalized;
  }

  function addHistoryRow(entry, previous) {
    const history = normalizeHistory({
      id: stableId('price-history', `${entry.marketplace}|${entry.articleKey}|${Date.now()}|${Math.random()}`),
      marketplace: entry.marketplace,
      articleKey: entry.articleKey,
      eventType: previous ? 'save' : 'create',
      oldTargetFillPrice: previous?.targetFillPrice,
      newTargetFillPrice: entry.targetFillPrice,
      oldTargetClientPrice: previous?.targetClientPrice,
      newTargetClientPrice: entry.targetClientPrice,
      oldAllowedMarginPct: previous?.allowedMarginManualPct,
      newAllowedMarginPct: entry.allowedMarginManualPct,
      oldDecisionStatus: previous?.decisionStatus,
      newDecisionStatus: entry.decisionStatus,
      reason: entry.reason,
      comment: entry.comment,
      changedBy: state.team.member?.name || 'Команда',
      changedAt: new Date().toISOString(),
      synced: false
    });
    state.v86.localHistory = [history, ...(state.v86.localHistory || [])].slice(0, 1000);
    saveLocalState();
    return history;
  }

  function ensurePriceTask(row, entry) {
    const autoCode = `price|${entry.marketplace}|${entry.articleKey}`;
    const title = `Цена ${marketLabel(entry.marketplace)} · ${entry.articleKey}`;
    const nextAction = entry.reason || row.seedReason || 'Проверить и внедрить ценовое решение';
    const existing = (state.storage.tasks || []).find((task) => task.autoCode === autoCode);
    const normalized = normalizeTask({
      id: existing?.id || stableId('task', autoCode),
      source: 'manual',
      articleKey: entry.articleKey,
      title,
      nextAction,
      reason: entry.comment || entry.reason || '',
      owner: entry.owner || row.owner || ownerName(getSku(entry.articleKey)) || '',
      due: entry.dueDate || plusDays(2),
      status: existing?.status || 'new',
      type: 'price_margin',
      priority: entry.escalation === 'me_ksenia' ? 'critical' : (entry.decisionStatus === 'review' ? 'high' : 'medium'),
      platform: entry.marketplace,
      createdAt: existing?.createdAt || new Date().toISOString(),
      entityLabel: row.name || entry.articleKey,
      autoCode
    }, 'manual');
    state.storage.tasks = [...(state.storage.tasks || []).filter((task) => task.autoCode !== autoCode), normalized];
    saveLocalStorage();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const key = form.dataset.v86Form;
    const row = getCurrentRowByKey(key);
    if (!row) return;
    const previous = mergeEntryLayers().get(key);
    const entry = upsertLocalEntry({
      id: row.decisionId,
      marketplace: row.marketplace,
      articleKey: row.articleKey,
      decisionStatus: form.elements.decisionStatus.value,
      targetFillPrice: form.elements.targetFillPrice.value,
      targetClientPrice: form.elements.targetClientPrice.value,
      allowedMarginManualPct: parseNum(form.elements.allowedMarginManualPct.value) == null ? null : parseNum(form.elements.allowedMarginManualPct.value) / 100,
      reason: form.elements.reason.value,
      owner: form.elements.owner.value,
      dueDate: form.elements.dueDate.value,
      needsTask: form.elements.needsTask.checked,
      escalation: form.elements.escalation.value,
      comment: form.elements.comment.value,
      updatedBy: state.team.member?.name || 'Команда',
      updatedAt: new Date().toISOString(),
      createdAt: previous?.createdAt || row.createdAt || new Date().toISOString()
    });
    const history = addHistoryRow(entry, previous);
    if (entry.needsTask || entry.decisionStatus === 'review' || entry.escalation !== 'none') ensurePriceTask(row, entry);
    state.team.note = 'Решение по цене и допустимая маржа сохранены локально';
    updateSyncBadge();
    if (hasRemoteStore()) {
      try {
        await upsertRemoteEntries([entry]);
        try {
          await insertRemoteHistory([history]);
          history.synced = true;
        } catch (historyError) {
          console.error(historyError);
        }
        state.v86.remoteEntries = [...(state.v86.remoteEntries || []).filter((item) => workbenchKey(item.marketplace, item.articleKey) !== key), entry];
        if (history.synced) state.v86.remoteHistory = [history, ...(state.v86.remoteHistory || [])];
        state.team.note = 'Ценовое решение и допустимая маржа синхронизированы';
        updateSyncBadge();
        saveLocalState();
      } catch (error) {
        console.error(error);
        state.team.note = `Локально сохранено, но не отправлено в Supabase: ${error.message}`;
        updateSyncBadge();
      }
    }
    rerenderCurrentView();
  }

  async function handleReset(event) {
    const key = event.currentTarget.dataset.v86Reset;
    const row = getCurrentRowByKey(key);
    if (!row) return;
    if (!window.confirm(`Сбросить ценовое решение и ручную допустимую маржу для ${row.articleKey}?`)) return;
    state.v86.localEntries = (state.v86.localEntries || []).filter((item) => workbenchKey(item.marketplace, item.articleKey) !== key);
    if (state.v83) state.v83.localDecisions = (state.v83.localDecisions || []).filter((item) => workbenchKey(item.marketplace, item.articleKey) !== key);
    saveLocalState();
    localStorage.setItem('brand-portal-price-workbench-v83', JSON.stringify(state.v83?.localDecisions || []));
    const history = addHistoryRow(normalizeEntry({ marketplace: row.marketplace, articleKey: row.articleKey, allowedMarginManualPct: null, targetFillPrice: null, targetClientPrice: null, decisionStatus: 'draft', reason: 'Сброс решения', comment: '', owner: row.owner }), mergeEntryLayers().get(key));
    if (hasRemoteStore()) {
      try {
        await deleteRemoteEntry(row.decisionId);
        try { await insertRemoteHistory([history]); history.synced = true; } catch {}
        state.v86.remoteEntries = (state.v86.remoteEntries || []).filter((item) => workbenchKey(item.marketplace, item.articleKey) !== key);
      } catch (error) {
        console.error(error);
      }
    }
    state.team.note = 'Решение по цене сброшено';
    updateSyncBadge();
    rerenderCurrentView();
  }

  function handleCreateTask(event) {
    const key = event.currentTarget.dataset.v86PriceTask;
    const row = getCurrentRowByKey(key);
    if (!row) return;
    const entry = normalizeEntry({
      id: row.decisionId,
      marketplace: row.marketplace,
      articleKey: row.articleKey,
      decisionStatus: row.decisionStatus,
      targetFillPrice: row.targetFillPrice,
      targetClientPrice: row.targetClientPrice,
      allowedMarginManualPct: row.allowedMarginManualPct,
      reason: row.reason,
      owner: row.owner,
      dueDate: row.dueDate,
      needsTask: true,
      escalation: row.escalation,
      comment: row.comment,
      createdAt: row.createdAt,
      updatedAt: new Date().toISOString()
    });
    upsertLocalEntry(entry);
    ensurePriceTask(row, entry);
    state.team.note = 'Задача по цене создана / обновлена';
    saveLocalStorage();
    updateSyncBadge();
    rerenderCurrentView();
  }

  async function pullRemotePriceV86(rerender = true) {
    if (!hasRemoteStore()) return;
    try {
      const rows = await queryRemoteEntries();
      state.v86.remoteEntries = (rows || []).map(normalizeEntry);
      try {
        const historyRows = await queryRemoteHistory();
        state.v86.remoteHistory = (historyRows || []).map(normalizeHistory);
      } catch (historyError) {
        console.error(historyError);
      }
      if (rerender) rerenderCurrentView();
      state.team.note = rows.length ? `Ценовой контур синхронизирован · ${fmt.int(rows.length)} решений` : 'Ценовой контур: база пока без решений';
      updateSyncBadge();
    } catch (error) {
      console.error(error);
      state.v86.issue = error.message;
      setAppError(`Портал загрузил не всё: Цены — ${error.message}`);
    }
  }

  async function pushRemotePriceV86() {
    if (!hasRemoteStore()) return;
    try {
      if (state.v86.localEntries?.length) await upsertRemoteEntries(state.v86.localEntries);
      const unsynced = (state.v86.localHistory || []).filter((item) => !item.synced);
      if (unsynced.length) {
        try {
          await insertRemoteHistory(unsynced);
          unsynced.forEach((item) => { item.synced = true; });
          saveLocalState();
        } catch (historyError) {
          console.error(historyError);
        }
      }
      state.team.note = 'Ценовой контур отправлен в командную базу';
      updateSyncBadge();
    } catch (error) {
      console.error(error);
      state.team.note = `Не удалось отправить решения по ценам: ${error.message}`;
      updateSyncBadge();
    }
  }

  function injectExecutivePriceNote() {
    const root = document.getElementById('view-executive');
    if (!root || root.querySelector('.v86-exec-note')) return;
    const block = document.createElement('div');
    block.className = 'card v86-exec-note';
    block.innerHTML = `<div class="head"><div><h3>Цены / price workbench</h3><div class="muted small">Финальное согласование по ценам: ты + Ксения. Виктор в ценовом контуре не участвует.</div></div></div>`;
    root.prepend(block);
  }

  const prevRenderExecutiveV86 = renderExecutive;
  renderExecutive = function () {
    prevRenderExecutiveV86();
    try { injectExecutivePriceNote(); } catch (error) { console.error(error); }
  };

  const prevRerenderV86 = rerenderCurrentView;
  rerenderCurrentView = function () {
    prevRerenderV86();
    try { corporateBranding(); } catch (error) { console.error(error); }
    try { renderPriceWorkbenchV86(); } catch (error) {
      console.error(error);
      renderViewFailure('view-prices', 'Цены', error);
      setAppError(`Портал загрузил не всё: Цены — ${error.message}`);
    }
  };

  const prevPullV86 = pullRemoteState;
  pullRemoteState = async function (rerender = true) {
    await prevPullV86(false);
    await pullRemotePriceV86(false);
    if (rerender) rerenderCurrentView();
  };

  const prevPushV86 = pushStateToRemote;
  pushStateToRemote = async function () {
    await prevPushV86();
    await pushRemotePriceV86();
    rerenderCurrentView();
  };

  async function bootstrapRemote(retry = 0) {
    if (hasRemoteStore()) {
      await pullRemotePriceV86(true);
      return;
    }
    if (retry >= REMOTE_RETRY_MAX) return;
    setTimeout(() => { bootstrapRemote(retry + 1); }, 1000);
  }

  async function boot() {
    corporateBranding();
    loadLocalState();
    await ensureSeedLoaded();
    bootstrapRemote();
    rerenderCurrentView();
  }

  boot();
})();
