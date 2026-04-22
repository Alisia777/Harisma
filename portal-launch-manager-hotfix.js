(function () {
  if (window.__ALTEA_LAUNCH_MANAGER_HOTFIX_20260422A__) return;
  window.__ALTEA_LAUNCH_MANAGER_HOTFIX_20260422A__ = true;

  if (window.__ALTEA_LAUNCH_MONTH_FILTER_HOTFIX_20260422C__) return;

  const STORAGE_KEY = 'brand-portal-launch-manager-v1';
  const PHASE_OPTIONS = [
    { value: 'owner', label: 'Нужен owner' },
    { value: 'supply', label: 'Поставка' },
    { value: 'content', label: 'Контент / трафик' },
    { value: 'economy', label: 'Экономика' },
    { value: 'scale', label: 'Масштаб' }
  ];
  const VIEW_IDS = ['view-launches', 'view-launch-control'];
  const EMPTY_TEXT = '—';

  function canBoot() {
    return typeof window === 'object'
      && typeof document === 'object'
      && typeof getLaunchItems === 'function'
      && typeof normalizeLaunchItem === 'function'
      && typeof rerenderCurrentView === 'function'
      && typeof escapeHtml === 'function'
      && typeof badge === 'function'
      && typeof fmt === 'object';
  }

  function createId(prefix) {
    if (typeof uid === 'function') return uid(prefix);
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getBaseId(item = {}) {
    if (item.id) return String(item.id);
    if (typeof stableId === 'function') {
      return stableId('launch', `${item.articleKey || ''}|${item.name || item.title || ''}|${item.launchMonth || ''}`);
    }
    return `${item.articleKey || item.name || 'launch'}|${item.launchMonth || ''}`;
  }

  function normalizeMonth(value) {
    const label = String(value || '').trim();
    return label || 'Без месяца';
  }

  function normalizeBlockers(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    return String(value || '')
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseNumber(value) {
    const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeRecord).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.map(normalizeRecord)));
  }

  function getManagerState() {
    if (typeof state !== 'object' || !state) {
      return { records: loadRecords(), editor: { open: false, draft: null } };
    }
    state.launchManagerHotfix = state.launchManagerHotfix || {};
    if (!Array.isArray(state.launchManagerHotfix.records)) {
      state.launchManagerHotfix.records = loadRecords();
    }
    if (!state.launchManagerHotfix.editor) {
      state.launchManagerHotfix.editor = { open: false, draft: null };
    }
    return state.launchManagerHotfix;
  }

  function persistRecords() {
    const manager = getManagerState();
    saveRecords(manager.records);
  }

  function emptyDraft() {
    return {
      id: '',
      baseId: '',
      mode: 'manual',
      articleKey: '',
      name: '',
      reportGroup: 'Продукт',
      subCategory: '',
      launchMonth: '',
      status: '',
      phase: 'content',
      owner: '',
      production: '',
      plannedRevenue: '',
      externalTraffic: '',
      blockersText: '',
      hidden: false
    };
  }

  function normalizeRecord(record = {}) {
    const baseId = String(record.baseId || record.id || createId('launch')).trim();
    const mode = record.mode === 'override' ? 'override' : 'manual';
    const phase = PHASE_OPTIONS.some((item) => item.value === record.phase) ? record.phase : 'content';
    return {
      id: String(record.id || (mode === 'manual' ? baseId : '')).trim(),
      baseId,
      mode,
      articleKey: String(record.articleKey || '').trim(),
      name: String(record.name || '').trim(),
      reportGroup: String(record.reportGroup || 'Продукт').trim() || 'Продукт',
      subCategory: String(record.subCategory || '').trim(),
      launchMonth: normalizeMonth(record.launchMonth || ''),
      status: String(record.status || '').trim(),
      phase,
      owner: String(record.owner || '').trim(),
      production: String(record.production || '').trim(),
      plannedRevenue: record.plannedRevenue === '' ? '' : parseNumber(record.plannedRevenue),
      externalTraffic: String(record.externalTraffic || '').trim(),
      blockersText: Array.isArray(record.blockers)
        ? record.blockers.join('\n')
        : String(record.blockersText || '').trim(),
      hidden: Boolean(record.hidden)
    };
  }

  function buildItemFromRecord(record, fallback = {}) {
    return normalizeLaunchItem({
      id: record.mode === 'manual' ? (record.id || record.baseId) : (fallback.id || record.baseId),
      articleKey: record.articleKey || fallback.articleKey || '',
      name: record.name || fallback.name || 'Новинка',
      reportGroup: record.reportGroup || fallback.reportGroup || 'Продукт',
      subCategory: record.subCategory || fallback.subCategory || EMPTY_TEXT,
      launchMonth: record.launchMonth || fallback.launchMonth || 'Без месяца',
      status: record.status || fallback.status || 'Статус не указан',
      phase: record.phase || fallback.phase || 'content',
      owner: record.owner || fallback.owner || '',
      production: record.production || fallback.production || '',
      plannedRevenue: record.plannedRevenue === '' ? (fallback.plannedRevenue || 0) : parseNumber(record.plannedRevenue),
      externalTraffic: record.externalTraffic || fallback.externalTraffic || 'без внешнего трафика',
      activeTasks: fallback.activeTasks || 0,
      blockers: normalizeBlockers(record.blockersText || fallback.blockers || [])
    });
  }

  const originalGetLaunchItems = getLaunchItems.bind(window);
  const originalRenderLaunches = typeof renderLaunches === 'function' ? renderLaunches.bind(window) : null;
  const originalRenderLaunchControl = typeof renderLaunchControl === 'function' ? renderLaunchControl.bind(window) : null;

  function getRecordsMap(records, mode) {
    const map = new Map();
    records
      .filter((item) => item.mode === mode)
      .forEach((item) => {
        map.set(item.baseId, item);
      });
    return map;
  }

  function sortItems(items) {
    return items.sort((left, right) => {
      const monthDelta = String(left.launchMonth || '').localeCompare(String(right.launchMonth || ''), 'ru');
      if (monthDelta) return monthDelta;
      const planDelta = parseNumber(right.plannedRevenue) - parseNumber(left.plannedRevenue);
      if (planDelta) return planDelta;
      return String(left.name || '').localeCompare(String(right.name || ''), 'ru');
    });
  }

  function getManagedLaunchItems() {
    const manager = getManagerState();
    const baseItems = Array.isArray(originalGetLaunchItems()) ? originalGetLaunchItems() : [];
    const overrides = getRecordsMap(manager.records, 'override');
    const visible = [];

    baseItems.forEach((item) => {
      const baseId = getBaseId(item);
      const override = overrides.get(baseId);
      if (override?.hidden) return;
      visible.push(override ? buildItemFromRecord(override, item) : normalizeLaunchItem(item));
    });

    manager.records
      .filter((item) => item.mode === 'manual' && !item.hidden)
      .forEach((item) => visible.push(buildItemFromRecord(item)));

    return sortItems(visible);
  }

  function toDraftFromItem(item) {
    return {
      id: '',
      baseId: getBaseId(item),
      mode: 'override',
      articleKey: item.articleKey || '',
      name: item.name || '',
      reportGroup: item.reportGroup || 'Продукт',
      subCategory: item.subCategory === EMPTY_TEXT ? '' : (item.subCategory || ''),
      launchMonth: normalizeMonth(item.launchMonth || ''),
      status: item.status || '',
      phase: item.phase || 'content',
      owner: item.owner || '',
      production: item.production || '',
      plannedRevenue: item.plannedRevenue || '',
      externalTraffic: item.externalTraffic === 'без внешнего трафика' ? '' : (item.externalTraffic || ''),
      blockersText: Array.isArray(item.blockers) ? item.blockers.join('\n') : '',
      hidden: false
    };
  }

  function setEditorDraft(draft) {
    const manager = getManagerState();
    manager.editor = { open: true, draft: normalizeRecord({ ...emptyDraft(), ...draft }) };
  }

  function closeEditor() {
    const manager = getManagerState();
    manager.editor = { open: false, draft: null };
  }

  function upsertRecordFromDraft(draft) {
    const manager = getManagerState();
    const record = normalizeRecord(draft);
    if (record.mode === 'manual' && !record.id) {
      record.id = createId('launch-manual');
      record.baseId = record.id;
    }

    const key = record.mode === 'manual' ? record.id : record.baseId;
    const nextRecords = manager.records.filter((item) => {
      const currentKey = item.mode === 'manual' ? item.id : item.baseId;
      return currentKey !== key;
    });
    nextRecords.push(record);
    manager.records = nextRecords.map(normalizeRecord);
    persistRecords();
    closeEditor();
  }

  function hideLaunchItem(item) {
    const manager = getManagerState();
    const baseId = getBaseId(item);
    const isManual = manager.records.some((record) => record.mode === 'manual' && record.id === baseId);
    if (isManual) {
      manager.records = manager.records.map((record) => {
        if (record.mode === 'manual' && record.id === baseId) return normalizeRecord({ ...record, hidden: true });
        return record;
      });
    } else {
      const existing = manager.records.find((record) => record.mode === 'override' && record.baseId === baseId);
      const fallback = existing || toDraftFromItem(item);
      const hiddenRecord = normalizeRecord({ ...fallback, mode: 'override', baseId, hidden: true });
      manager.records = manager.records
        .filter((record) => !(record.mode === 'override' && record.baseId === baseId))
        .concat(hiddenRecord);
    }
    persistRecords();
  }

  function restoreRecord(recordId) {
    const manager = getManagerState();
    manager.records = manager.records.map((record) => {
      const currentId = record.mode === 'manual' ? record.id : record.baseId;
      if (currentId !== recordId) return record;
      return normalizeRecord({ ...record, hidden: false });
    });
    persistRecords();
  }

  function removeManualRecord(recordId) {
    const manager = getManagerState();
    manager.records = manager.records.filter((record) => !(record.mode === 'manual' && record.id === recordId));
    persistRecords();
  }

  function getAllVisibleItems() {
    return getManagedLaunchItems().map((item) => normalizeLaunchItem(item));
  }

  function getHiddenRecords() {
    return getManagerState().records.filter((item) => item.hidden);
  }

  function renderManagerListItem(item) {
    const itemId = getBaseId(item);
    return `
      <div class="list-item">
        <div class="head">
          <div>
            <strong>${escapeHtml(item.name || 'Новинка')}</strong>
            <div class="muted small">${escapeHtml(item.launchMonth || 'Без месяца')} · ${escapeHtml(item.reportGroup || 'Продукт')}</div>
          </div>
          <div class="badge-stack">
            ${badge(item.phase ? PHASE_OPTIONS.find((phase) => phase.value === item.phase)?.label || item.phase : 'Фаза')}
            ${item.owner ? badge(item.owner, 'info') : badge('Без owner', 'warn')}
          </div>
        </div>
        <div class="muted small">${escapeHtml(item.status || 'Статус не указан')}</div>
        <div class="badge-stack" style="margin-top:8px">
          <button class="btn ghost" type="button" data-launch-edit="${escapeHtml(itemId)}">Изменить</button>
          <button class="btn ghost" type="button" data-launch-hide="${escapeHtml(itemId)}">Убрать</button>
        </div>
      </div>
    `;
  }

  function renderHiddenRecord(record) {
    const itemId = record.mode === 'manual' ? record.id : record.baseId;
    return `
      <div class="list-item">
        <div class="head">
          <div>
            <strong>${escapeHtml(record.name || record.articleKey || 'Скрытая новинка')}</strong>
            <div class="muted small">${escapeHtml(record.launchMonth || 'Без месяца')}</div>
          </div>
          ${badge('Скрыто', 'warn')}
        </div>
        <div class="badge-stack" style="margin-top:8px">
          <button class="btn ghost" type="button" data-launch-restore="${escapeHtml(itemId)}">Вернуть</button>
          ${record.mode === 'manual' ? `<button class="btn ghost" type="button" data-launch-drop="${escapeHtml(itemId)}">Удалить запись</button>` : ''}
        </div>
      </div>
    `;
  }

  function renderManagerCard() {
    const manager = getManagerState();
    const items = getAllVisibleItems();
    const hidden = getHiddenRecords();
    const draft = manager.editor?.draft || emptyDraft();

    return `
      <div class="card" data-launch-manager-card style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Управление новинками</h3>
            <p class="small muted">Здесь можно добавить новинку вручную, поправить месяц, owner, статус или убрать строку из запуска без потери остальных карточек.</p>
          </div>
          <div class="badge-stack">
            ${badge(`${fmt.int(items.length)} в работе`, items.length ? 'info' : 'warn')}
            ${badge(`${fmt.int(hidden.length)} скрыто`, hidden.length ? 'warn' : 'ok')}
          </div>
        </div>
        <div class="badge-stack" style="margin-top:10px">
          <button class="btn" type="button" data-launch-create>Добавить новинку</button>
          ${manager.editor?.open ? '<button class="btn ghost" type="button" data-launch-cancel>Закрыть форму</button>' : ''}
        </div>
        ${manager.editor?.open ? `
          <form class="form-grid compact" data-launch-manager-form style="margin-top:14px">
            <input type="hidden" name="mode" value="${escapeHtml(draft.mode || 'manual')}">
            <input type="hidden" name="id" value="${escapeHtml(draft.id || '')}">
            <input type="hidden" name="baseId" value="${escapeHtml(draft.baseId || '')}">
            <input name="name" placeholder="Название новинки" value="${escapeHtml(draft.name || '')}" required>
            <input name="articleKey" placeholder="Артикул / articleKey" value="${escapeHtml(draft.articleKey || '')}">
            <input name="launchMonth" placeholder="Месяц запуска" value="${escapeHtml(draft.launchMonth || '')}">
            <select name="phase">${PHASE_OPTIONS.map((item) => `<option value="${item.value}" ${draft.phase === item.value ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select>
            <input name="status" placeholder="Статус" value="${escapeHtml(draft.status || '')}">
            <input name="owner" placeholder="Owner" value="${escapeHtml(draft.owner || '')}">
            <input name="reportGroup" placeholder="Группа" value="${escapeHtml(draft.reportGroup || '')}">
            <input name="subCategory" placeholder="Подкатегория" value="${escapeHtml(draft.subCategory || '')}">
            <input name="production" placeholder="Поставка / производство" value="${escapeHtml(draft.production || '')}">
            <input name="plannedRevenue" type="number" step="1" placeholder="План выручки" value="${escapeHtml(draft.plannedRevenue || '')}">
            <input name="externalTraffic" placeholder="Трафик" value="${escapeHtml(draft.externalTraffic || '')}">
            <textarea name="blockersText" rows="3" placeholder="Блокеры через Enter или запятую">${escapeHtml(draft.blockersText || '')}</textarea>
            <button class="btn primary" type="submit">Сохранить</button>
          </form>
        ` : ''}
        <div class="list" style="margin-top:14px">
          ${items.map(renderManagerListItem).join('') || '<div class="empty">Пока нет управляемых новинок в этом запуске.</div>'}
        </div>
        ${hidden.length ? `
          <div class="card subtle" style="margin-top:14px">
            <h3>Скрытые строки</h3>
            <div class="list">${hidden.map(renderHiddenRecord).join('')}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function findManagedItemById(itemId) {
    return getAllVisibleItems().find((item) => getBaseId(item) === itemId);
  }

  function attachManager(root) {
    if (!root || root.querySelector('[data-launch-manager-card]')) return;
    const title = root.querySelector('.section-title');
    if (title) {
      title.insertAdjacentHTML('afterend', renderManagerCard());
    } else {
      root.insertAdjacentHTML('afterbegin', renderManagerCard());
    }
    bindManager(root);
  }

  function bindManager(root) {
    root.querySelectorAll('[data-launch-create]').forEach((button) => {
      button.addEventListener('click', () => {
        setEditorDraft(emptyDraft());
        rerenderCurrentView();
      });
    });

    root.querySelectorAll('[data-launch-cancel]').forEach((button) => {
      button.addEventListener('click', () => {
        closeEditor();
        rerenderCurrentView();
      });
    });

    root.querySelectorAll('[data-launch-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = findManagedItemById(button.dataset.launchEdit || '');
        if (!item) return;
        setEditorDraft(toDraftFromItem(item));
        rerenderCurrentView();
      });
    });

    root.querySelectorAll('[data-launch-hide]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = findManagedItemById(button.dataset.launchHide || '');
        if (!item) return;
        hideLaunchItem(item);
        rerenderCurrentView();
      });
    });

    root.querySelectorAll('[data-launch-restore]').forEach((button) => {
      button.addEventListener('click', () => {
        restoreRecord(button.dataset.launchRestore || '');
        rerenderCurrentView();
      });
    });

    root.querySelectorAll('[data-launch-drop]').forEach((button) => {
      button.addEventListener('click', () => {
        removeManualRecord(button.dataset.launchDrop || '');
        rerenderCurrentView();
      });
    });

    root.querySelectorAll('[data-launch-manager-form]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        upsertRecordFromDraft({
          mode: data.get('mode') || 'manual',
          id: data.get('id') || '',
          baseId: data.get('baseId') || '',
          articleKey: data.get('articleKey') || '',
          name: data.get('name') || '',
          reportGroup: data.get('reportGroup') || '',
          subCategory: data.get('subCategory') || '',
          launchMonth: data.get('launchMonth') || '',
          status: data.get('status') || '',
          phase: data.get('phase') || 'content',
          owner: data.get('owner') || '',
          production: data.get('production') || '',
          plannedRevenue: data.get('plannedRevenue') || '',
          externalTraffic: data.get('externalTraffic') || '',
          blockersText: data.get('blockersText') || ''
        });
        rerenderCurrentView();
      });
    });
  }

  function renderLaunchesWithManager() {
    if (typeof originalRenderLaunches === 'function') originalRenderLaunches();
    attachManager(document.getElementById('view-launches'));
  }

  function renderLaunchControlWithManager() {
    if (typeof originalRenderLaunchControl === 'function') originalRenderLaunchControl();
    attachManager(document.getElementById('view-launch-control'));
  }

  function install() {
    if (!canBoot()) return false;
    getLaunchItems = getManagedLaunchItems;
    window.getLaunchItems = getManagedLaunchItems;
    if (typeof originalRenderLaunches === 'function') {
      renderLaunches = renderLaunchesWithManager;
      window.renderLaunches = renderLaunchesWithManager;
    }
    if (typeof originalRenderLaunchControl === 'function') {
      renderLaunchControl = renderLaunchControlWithManager;
      window.renderLaunchControl = renderLaunchControlWithManager;
    }

    if (VIEW_IDS.some((id) => document.getElementById(id)?.classList.contains('active'))) {
      rerenderCurrentView();
    }
    return true;
  }

  if (!install()) {
    const timer = window.setInterval(() => {
      if (install()) window.clearInterval(timer);
    }, 120);
    window.setTimeout(() => window.clearInterval(timer), 15000);
  }

  window.addEventListener('altea:viewchange', (event) => {
    const view = event?.detail?.view;
    if (!view || (view !== 'launches' && view !== 'launch-control')) return;
    window.setTimeout(() => {
      attachManager(document.getElementById(`view-${view}`));
    }, 120);
  });
})();
