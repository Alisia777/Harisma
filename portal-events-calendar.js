(function () {
  if (window.__ALTEA_PROMO_EVENTS_CALENDAR__) return;
  window.__ALTEA_PROMO_EVENTS_CALENDAR__ = true;

  const SNAPSHOT_KEY = 'promo_events_calendar';
  const SNAPSHOT_TABLE = 'portal_data_snapshots';
  const MAX_SKU_RESULTS = 28;
  const CALENDAR_STATE = window.__ALTEA_PROMO_CALENDAR_STATE__ || {
    month: '',
    dateFrom: '',
    dateTo: '',
    platform: 'all',
    search: '',
    editingId: '',
    selectedDate: '',
    modalOpen: false,
    skuQuery: '',
    draftSkus: [],
    remoteLoaded: false,
    remoteLoading: false,
    remoteSaving: false,
    dataLoaded: false,
    dataLoading: false
  };
  window.__ALTEA_PROMO_CALENDAR_STATE__ = CALENDAR_STATE;

  const PLATFORMS = [
    ['all', 'Все площадки'],
    ['cross', 'Все / микс'],
    ['wb', 'WB'],
    ['ozon', 'Ozon'],
    ['ya', 'Яндекс'],
    ['goldapple', 'ЗЯ'],
    ['letu', 'Летуаль'],
    ['magnit', 'Магнит'],
    ['product', 'Продукт']
  ];
  const EVENT_STATUSES = [
    ['planned', 'План'],
    ['active', 'В эфире'],
    ['done', 'Завершено'],
    ['draft', 'Черновик']
  ];
  const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  function appState() {
    return window.state || window.__alteaAppState || {};
  }

  function html(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function number(value) {
    if (typeof numberOrZero === 'function') return numberOrZero(value);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatInt(value) {
    return typeof fmt?.int === 'function' ? fmt.int(value) : String(Math.round(number(value)));
  }

  function formatMoney(value) {
    if (!(number(value) > 0)) return '';
    return typeof fmt?.money === 'function' ? fmt.money(value) : `${Math.round(number(value)).toLocaleString('ru-RU')} ₽`;
  }

  function token(value = '') {
    if (typeof skuLookupToken === 'function') return skuLookupToken(value);
    return String(value ?? '').trim().toLowerCase().replaceAll('ё', 'е').replace(/[^a-zа-я0-9]+/gi, '');
  }

  function textLines(value) {
    return String(value || '')
      .split(/\r?\n|[,;]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function todayKey() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return date.toISOString().slice(0, 10);
  }

  function dateFromKey(key) {
    const value = String(key || '').trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date();
    if (Number.isNaN(date.getTime())) return new Date(`${todayKey()}T12:00:00`);
    return date;
  }

  function dateKey(date) {
    const value = date instanceof Date ? date : dateFromKey(date);
    const copy = new Date(value);
    copy.setHours(12, 0, 0, 0);
    return copy.toISOString().slice(0, 10);
  }

  function addDays(key, days) {
    const date = dateFromKey(key);
    date.setDate(date.getDate() + Number(days || 0));
    return dateKey(date);
  }

  function daysBetween(startKey, endKey) {
    const start = dateFromKey(startKey);
    const end = dateFromKey(endKey || startKey);
    return Math.max(0, Math.round((end - start) / 86400000));
  }

  function startOfMonth(key = todayKey()) {
    const date = dateFromKey(key);
    date.setDate(1);
    return dateKey(date);
  }

  function endOfMonth(key = todayKey()) {
    const date = dateFromKey(startOfMonth(key));
    date.setMonth(date.getMonth() + 1);
    date.setDate(0);
    return dateKey(date);
  }

  function monthLabel(key) {
    const date = dateFromKey(key);
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }

  function formatDate(key) {
    if (typeof fmt?.date === 'function') return fmt.date(key);
    return String(key || '');
  }

  function uidSafe(prefix) {
    if (typeof uid === 'function') return uid(prefix);
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function platformKey(value) {
    if (typeof normalizeTaskPlatform === 'function') {
      const normalized = normalizeTaskPlatform(value || 'cross');
      return normalized === 'wb+ozon' ? 'cross' : normalized;
    }
    const raw = String(value || 'cross').trim().toLowerCase();
    return PLATFORMS.some(([key]) => key === raw) ? raw : 'cross';
  }

  function platformLabel(value) {
    const key = platformKey(value);
    return PLATFORMS.find(([item]) => item === key)?.[1] || key;
  }

  function statusLabel(status) {
    return EVENT_STATUSES.find(([key]) => key === status)?.[1] || 'План';
  }

  function storage() {
    const state = appState();
    state.storage = state.storage || {};
    if (!Array.isArray(state.storage.promoEvents)) state.storage.promoEvents = [];
    if (!Array.isArray(state.storage.promoEventDeletedIds)) state.storage.promoEventDeletedIds = [];
    return state.storage;
  }

  function normalizeDeleted(item) {
    if (!item || typeof item !== 'object') return null;
    const id = String(item.id || '').trim();
    if (!id) return null;
    return {
      id,
      deletedAt: String(item.deletedAt || item.deleted_at || new Date().toISOString())
    };
  }

  function normalizeEvent(item = {}) {
    const now = new Date().toISOString();
    const title = String(item.title || item.name || '').trim();
    const startDate = String(item.startDate || item.start_date || item.date || todayKey()).slice(0, 10);
    const rawEnd = String(item.endDate || item.end_date || startDate).slice(0, 10);
    const endDate = rawEnd && rawEnd >= startDate ? rawEnd : startDate;
    const skus = Array.isArray(item.skus)
      ? item.skus.map((sku) => String(sku || '').trim()).filter(Boolean)
      : textLines(item.skuText || item.skusText || item.sku || '');
    return {
      id: String(item.id || uidSafe('promo')).trim(),
      title: title || 'Промо без названия',
      platform: platformKey(item.platform || item.marketplace || 'cross'),
      startDate,
      endDate,
      skus,
      skuText: skus.join('\n'),
      comment: String(item.comment || item.note || '').trim(),
      owner: String(item.owner || '').trim(),
      status: String(item.status || 'planned').trim() || 'planned',
      taskId: String(item.taskId || item.task_id || '').trim(),
      createdAt: String(item.createdAt || item.created_at || now),
      updatedAt: String(item.updatedAt || item.updated_at || item.createdAt || now)
    };
  }

  function allEvents() {
    return storage().promoEvents.map(normalizeEvent).filter((event) => event.id && event.title);
  }

  function deletedIds() {
    return storage().promoEventDeletedIds.map(normalizeDeleted).filter(Boolean);
  }

  function applyCalendarPayload(payload = {}) {
    const events = Array.isArray(payload.events) ? payload.events.map(normalizeEvent) : [];
    const deleted = Array.isArray(payload.deletedIds || payload.deleted)
      ? (payload.deletedIds || payload.deleted).map(normalizeDeleted).filter(Boolean)
      : [];
    const deletedMap = new Map(deleted.map((item) => [item.id, item]));
    storage().promoEvents = events
      .filter((event) => {
        const deletedItem = deletedMap.get(event.id);
        return !deletedItem || Date.parse(event.updatedAt || 0) > Date.parse(deletedItem.deletedAt || 0);
      })
      .sort((a, b) => `${a.startDate}|${a.title}`.localeCompare(`${b.startDate}|${b.title}`));
    storage().promoEventDeletedIds = deleted;
  }

  function buildPayload() {
    return {
      generatedAt: new Date().toISOString(),
      updatedBy: appState().team?.member?.name || 'Команда',
      events: allEvents(),
      deletedIds: deletedIds()
    };
  }

  function mergePayload(remotePayload, localPayload) {
    const mergedDeleted = new Map();
    [...(remotePayload?.deletedIds || []), ...(localPayload?.deletedIds || [])]
      .map(normalizeDeleted)
      .filter(Boolean)
      .forEach((item) => {
        const current = mergedDeleted.get(item.id);
        if (!current || Date.parse(item.deletedAt || 0) >= Date.parse(current.deletedAt || 0)) mergedDeleted.set(item.id, item);
      });
    const eventMap = new Map();
    const add = (item) => {
      const event = normalizeEvent(item);
      const deleted = mergedDeleted.get(event.id);
      if (deleted && Date.parse(deleted.deletedAt || 0) >= Date.parse(event.updatedAt || 0)) return;
      const current = eventMap.get(event.id);
      if (!current || Date.parse(event.updatedAt || 0) >= Date.parse(current.updatedAt || 0)) eventMap.set(event.id, event);
    };
    (remotePayload?.events || []).forEach(add);
    (localPayload?.events || []).forEach(add);
    return {
      generatedAt: new Date().toISOString(),
      updatedBy: localPayload?.updatedBy || remotePayload?.updatedBy || appState().team?.member?.name || 'Команда',
      events: [...eventMap.values()].sort((a, b) => `${a.startDate}|${a.title}`.localeCompare(`${b.startDate}|${b.title}`)),
      deletedIds: [...mergedDeleted.values()]
    };
  }

  function restConfig() {
    if (typeof teamRestConfig === 'function') return teamRestConfig();
    const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
    if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey) return null;
    return {
      baseUrl: String(cfg.supabase.url || '').replace(/\/+$/, ''),
      anonKey: cfg.supabase.anonKey,
      accessToken: appState().team?.accessToken || '',
      brand: typeof currentBrand === 'function' ? currentBrand() : (cfg.brand || 'Алтея')
    };
  }

  async function readJson(response, label) {
    if (typeof readSupabaseJson === 'function') return readSupabaseJson(response, label);
    const text = await response.text();
    if (!response.ok) throw new Error(`${label}: ${text || response.status || 'request failed'}`);
    return text ? JSON.parse(text) : [];
  }

  async function fetchWithTimeout(request, timeoutMs, label) {
    if (typeof withTimeout === 'function') return withTimeout(request, timeoutMs, label);
    return request;
  }

  function remoteReady() {
    const cfg = restConfig();
    return Boolean(cfg?.baseUrl && cfg?.anonKey);
  }

  async function queryRemoteCalendar() {
    const cfg = restConfig();
    if (!cfg?.baseUrl || !cfg?.anonKey) return null;
    const url = new URL(`${cfg.baseUrl}/rest/v1/${SNAPSHOT_TABLE}`);
    url.searchParams.set('select', 'snapshot_key,payload');
    url.searchParams.set('brand', `eq.${cfg.brand}`);
    url.searchParams.set('snapshot_key', `eq.${SNAPSHOT_KEY}`);
    const tokenValue = cfg.accessToken || cfg.anonKey;
    const response = await fetchWithTimeout(fetch(url.toString(), {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${tokenValue}`,
        Accept: 'application/json'
      }
    }), 8000, 'Календарь событий');
    const rows = await readJson(response, 'Календарь событий');
    return rows?.[0]?.payload ? JSON.parse(JSON.stringify(rows[0].payload)) : null;
  }

  async function upsertRemoteCalendar(payload) {
    const row = {
      brand: typeof currentBrand === 'function' ? currentBrand() : restConfig()?.brand || 'Алтея',
      snapshot_key: SNAPSHOT_KEY,
      payload,
      payload_hash: typeof hashString === 'function' ? hashString(JSON.stringify(payload)) : String(JSON.stringify(payload).length),
      source: 'portal-promo-calendar',
      generated_at: payload.generatedAt
    };
    if (typeof upsertRemote === 'function') {
      await upsertRemote(SNAPSHOT_TABLE, [row], 'brand,snapshot_key');
      return;
    }
    const cfg = restConfig();
    if (!cfg?.baseUrl || !cfg?.anonKey) return;
    const response = await fetchWithTimeout(fetch(`${cfg.baseUrl}/rest/v1/${SNAPSHOT_TABLE}?on_conflict=brand,snapshot_key`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken || cfg.anonKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify([row])
    }), 10000, 'Сохранение календаря');
    await readJson(response, 'Сохранение календаря');
  }

  async function syncCalendarFromRemote(options = {}) {
    if (CALENDAR_STATE.remoteLoading || !remoteReady()) return null;
    CALENDAR_STATE.remoteLoading = true;
    try {
      const remotePayload = await queryRemoteCalendar();
      const merged = mergePayload(remotePayload || {}, buildPayload());
      applyCalendarPayload(merged);
      if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason: 'promo-calendar-sync' });
      CALENDAR_STATE.remoteLoaded = true;
      if (options.rerender !== false && isCalendarActive() && !CALENDAR_STATE.modalOpen) renderEventCalendar(options.rootId || 'view-data-health');
      return merged;
    } catch (error) {
      console.warn('[promo-calendar] sync', error);
      return null;
    } finally {
      CALENDAR_STATE.remoteLoading = false;
    }
  }

  async function persistPromoCalendarEvents(options = {}) {
    if (CALENDAR_STATE.remoteSaving || !remoteReady()) return null;
    CALENDAR_STATE.remoteSaving = true;
    try {
      const remotePayload = await queryRemoteCalendar();
      const merged = mergePayload(remotePayload || {}, buildPayload());
      applyCalendarPayload(merged);
      if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason: 'promo-calendar-persist' });
      await upsertRemoteCalendar(merged);
      CALENDAR_STATE.remoteLoaded = true;
      const state = appState();
      if (state.team) {
        state.team.lastSyncAt = new Date().toISOString();
        state.team.mode = 'ready';
        state.team.note = `Календарь синхронизирован · ${formatDate(state.team.lastSyncAt)}`;
        if (typeof updateSyncBadge === 'function') updateSyncBadge();
      }
      if (options.rerender) renderEventCalendar(options.rootId || 'view-data-health');
      return merged;
    } catch (error) {
      console.warn('[promo-calendar] persist', error);
      if (typeof setAppError === 'function') setAppError(`Календарь сохранён локально, но Supabase не ответил: ${error.message}`);
      return null;
    } finally {
      CALENDAR_STATE.remoteSaving = false;
    }
  }

  function payloadLooksLoaded(payload, rowsKey = 'rows') {
    if (!payload || typeof payload !== 'object') return false;
    if (Array.isArray(payload?.[rowsKey]) && payload[rowsKey].length) return true;
    if (payload.platforms && Object.keys(payload.platforms).length) return true;
    return false;
  }

  async function loadCalendarJson(path, fallback, label) {
    if (typeof loadJsonOrFallback === 'function') return loadJsonOrFallback(path, fallback, label);
    if (typeof loadJson === 'function') {
      try { return await loadJson(path); } catch { return JSON.parse(JSON.stringify(fallback)); }
    }
    const response = await fetch(path);
    if (!response.ok) return JSON.parse(JSON.stringify(fallback));
    return response.json();
  }

  async function ensureCalendarData(rootId = 'view-data-health') {
    if (CALENDAR_STATE.dataLoading) return;
    const state = appState();
    const needSkus = !Array.isArray(state.skus) || !state.skus.length;
    const needWarehouse = !payloadLooksLoaded(state.warehouseStockOverlay || state.warehouse_stock_overlay);
    const needOverlay = !payloadLooksLoaded(state.smartPriceOverlay);
    if (!needSkus && !needWarehouse && !needOverlay) {
      CALENDAR_STATE.dataLoaded = true;
      return;
    }
    CALENDAR_STATE.dataLoading = true;
    try {
      const [skus, warehouse, overlay] = await Promise.all([
        needSkus ? loadCalendarJson('data/skus.json', [], 'SKU') : Promise.resolve(state.skus),
        needWarehouse ? loadCalendarJson('data/warehouse_stock_overlay.json', { generatedAt: '', rows: [] }, 'Склад/остатки') : Promise.resolve(state.warehouseStockOverlay || state.warehouse_stock_overlay),
        needOverlay ? loadCalendarJson('data/smart_price_overlay.json', { generatedAt: '', platforms: {} }, 'Факт SKU') : Promise.resolve(state.smartPriceOverlay)
      ]);
      if (needSkus) state.skus = Array.isArray(skus) ? skus : [];
      if (needWarehouse) {
        state.warehouseStockOverlay = warehouse && typeof warehouse === 'object' ? warehouse : { generatedAt: '', rows: [] };
        state.warehouse_stock_overlay = state.warehouseStockOverlay;
      }
      if (needOverlay) state.smartPriceOverlay = overlay && typeof overlay === 'object' ? overlay : { generatedAt: '', platforms: {} };
      CALENDAR_STATE.dataLoaded = true;
      if (isCalendarActive()) {
        if (CALENDAR_STATE.modalOpen) renderSkuPicker(document.getElementById(rootId));
        else renderEventCalendar(rootId);
      }
    } catch (error) {
      console.warn('[promo-calendar] data load', error);
    } finally {
      CALENDAR_STATE.dataLoading = false;
    }
  }

  function isCalendarActive() {
    return appState().activeView === 'data-health' || document.getElementById('view-data-health')?.classList.contains('active');
  }

  function monthDays(monthKey) {
    const first = dateFromKey(startOfMonth(monthKey));
    const firstDay = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - firstDay);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return dateKey(date);
    });
  }

  function eventOverlapsDate(event, day) {
    return event.startDate <= day && event.endDate >= day;
  }

  function eventOverlapsRange(event, from, to) {
    const start = from || '0000-01-01';
    const end = to || '9999-12-31';
    return event.startDate <= end && event.endDate >= start;
  }

  function filteredEvents() {
    const query = String(CALENDAR_STATE.search || '').trim().toLowerCase();
    return allEvents().filter((event) => {
      if (CALENDAR_STATE.platform !== 'all' && event.platform !== CALENDAR_STATE.platform) return false;
      if (!eventOverlapsRange(event, CALENDAR_STATE.dateFrom, CALENDAR_STATE.dateTo)) return false;
      if (!query) return true;
      return [event.title, event.comment, event.platform, event.skuText, event.owner].join(' ').toLowerCase().includes(query);
    });
  }

  function eventClass(eventOrPlatform) {
    const key = typeof eventOrPlatform === 'string' ? eventOrPlatform : eventOrPlatform?.platform;
    return `promo-platform-${platformKey(key)}`;
  }

  function eventTone(event) {
    const today = todayKey();
    if (event.status === 'done' || event.endDate < today) return 'done';
    if (event.startDate <= today && event.endDate >= today) return 'active';
    if (daysBetween(today, event.startDate) <= 3) return 'soon';
    return 'planned';
  }

  function activeEvent() {
    return allEvents().find((event) => event.id === CALENDAR_STATE.editingId) || null;
  }

  function blankEvent() {
    const date = CALENDAR_STATE.selectedDate || CALENDAR_STATE.dateFrom || todayKey();
    return {
      id: '',
      title: '',
      platform: CALENDAR_STATE.platform === 'all' ? 'wb' : CALENDAR_STATE.platform,
      startDate: date,
      endDate: date,
      skuText: '',
      skus: [],
      comment: '',
      owner: '',
      status: 'planned',
      taskId: ''
    };
  }

  function skuPrimaryKey(sku = {}, fallback = '') {
    if (typeof window.skuPrimaryKey === 'function') return window.skuPrimaryKey(sku, fallback);
    return String(sku?.articleKey || sku?.article || sku?.sku || fallback || '').trim();
  }

  function skuName(sku = {}) {
    return String(sku?.name || sku?.title || sku?.productName || skuPrimaryKey(sku) || '').trim();
  }

  function skuOwner(sku = {}, platform = '') {
    if (typeof taskPlatformOwnerName === 'function') return taskPlatformOwnerName(sku, platform, '');
    if (typeof ownerName === 'function') return ownerName(sku);
    const key = platformKey(platform);
    return String(sku?.owner?.byPlatform?.[key] || sku?.ownersByPlatform?.[key] || sku?.owner?.name || sku?.owner || '').trim();
  }

  function skuStatus(sku = {}) {
    if (typeof skuMatrixStatusLabel === 'function') return skuMatrixStatusLabel(sku, sku?.registryStatus || sku?.status || '');
    return String(sku?.registryStatus || sku?.status || '').trim();
  }

  function skuBelongsToPlatform(sku = {}, platform = 'all') {
    const key = platformKey(platform);
    if (key === 'all' || key === 'cross' || key === 'product') return true;
    if (typeof skuDataSkuBelongsToPlatform === 'function') return skuDataSkuBelongsToPlatform(sku, key);
    if (key === 'wb') return Boolean(sku?.flags?.hasWB || sku?.owner?.byPlatform?.wb || sku?.ownersByPlatform?.wb);
    if (key === 'ozon') return Boolean(sku?.flags?.hasOzon || sku?.owner?.byPlatform?.ozon || sku?.ownersByPlatform?.ozon);
    return Boolean(sku?.owner?.byPlatform?.[key] || sku?.ownersByPlatform?.[key]);
  }

  function skuByKeyMap() {
    const map = new Map();
    (appState().skus || []).forEach((sku) => {
      const key = skuPrimaryKey(sku);
      if (!key) return;
      map.set(key, sku);
      map.set(token(key), sku);
    });
    return map;
  }

  function findSkuByKey(key = '') {
    const wanted = String(key || '').trim();
    if (!wanted) return null;
    if (typeof getSku === 'function') {
      const found = getSku(wanted);
      if (found) return found;
    }
    return skuByKeyMap().get(wanted) || skuByKeyMap().get(token(wanted)) || null;
  }

  function warehouseMap() {
    const rows = Array.isArray(appState().warehouseStockOverlay?.rows)
      ? appState().warehouseStockOverlay.rows
      : Array.isArray(appState().warehouse_stock_overlay?.rows)
        ? appState().warehouse_stock_overlay.rows
        : [];
    const map = new Map();
    rows.forEach((row) => {
      const key = token(row?.articleKey || row?.article || row?.sku);
      if (!key) return;
      const current = map.get(key) || { stockWarehouse: 0, accepted: 0, shippedWB: 0, shippedOzon: 0 };
      current.stockWarehouse += number(row?.stockWarehouse);
      current.accepted += number(row?.accepted);
      current.shippedWB += number(row?.shippedWB);
      current.shippedOzon += number(row?.shippedOzon);
      map.set(key, current);
    });
    return map;
  }

  function overlayRowMap(platform = '') {
    const key = platformKey(platform);
    const platforms = key === 'cross' || key === 'all' ? ['wb', 'ozon', 'ya'] : [key];
    const map = new Map();
    platforms.forEach((platformName) => {
      const rows = typeof skuPlanFactRowsForPlatform === 'function'
        ? skuPlanFactRowsForPlatform(appState().smartPriceOverlay || {}, platformName)
        : (appState().smartPriceOverlay?.platforms?.[platformName]?.rows || []);
      rows.forEach((row) => {
        const rowKey = token(row?.articleKey || row?.article || row?.sku);
        if (!rowKey || map.has(rowKey)) return;
        map.set(rowKey, { ...row, platformName });
      });
    });
    return map;
  }

  function skuSignals(skuOrKey = {}, platform = '') {
    const sku = typeof skuOrKey === 'object' ? skuOrKey : findSkuByKey(skuOrKey);
    const key = skuPrimaryKey(sku || {}, typeof skuOrKey === 'string' ? skuOrKey : '');
    const wh = warehouseMap().get(token(key)) || {};
    const overlay = overlayRowMap(platform).get(token(key)) || {};
    const platformStock = number(
      platformKey(platform) === 'ozon'
        ? overlay.stockOzon ?? overlay.stock ?? overlay.stockTotal
        : platformKey(platform) === 'wb'
          ? overlay.stockWb ?? overlay.stock ?? overlay.stockTotal
          : overlay.stock ?? overlay.stockTotal ?? overlay.stockWb ?? overlay.stockOzon
    );
    const shipped = platformKey(platform) === 'ozon'
      ? number(wh.shippedOzon)
      : platformKey(platform) === 'wb'
        ? number(wh.shippedWB)
        : number(wh.shippedWB) + number(wh.shippedOzon);
    const daily = Array.isArray(overlay.daily) ? overlay.daily.slice(-7) : [];
    const orders7 = daily.reduce((sum, item) => sum + number(item?.ordersUnits || item?.orders || item?.sales), 0);
    return {
      articleKey: key,
      warehouse: number(wh.stockWarehouse),
      accepted: number(wh.accepted),
      shipped,
      platformStock,
      orders7,
      price: number(overlay.currentClientPrice || overlay.currentFillPrice || overlay.currentPrice || overlay.price),
      marginPct: overlay.marginTotalPct ?? overlay.marginPct ?? overlay.avgMargin7dPct ?? null,
      date: overlay.valueDate || overlay.historyFreshnessDate || appState().smartPriceOverlay?.asOfDate || appState().smartPriceOverlay?.generatedAt || ''
    };
  }

  function skuSignalTone(signals = {}) {
    if (signals.warehouse <= 0 && signals.shipped <= 0 && signals.platformStock <= 0) return 'danger';
    if (signals.warehouse < 20 && signals.shipped < 20) return 'warn';
    return 'ok';
  }

  function skuSignalSummary(signals = {}) {
    const parts = [
      `склад ${formatInt(signals.warehouse)}`,
      signals.shipped ? `отгр. ${formatInt(signals.shipped)}` : '',
      signals.orders7 ? `заказов 7д ${formatInt(signals.orders7)}` : '',
      signals.price ? formatMoney(signals.price) : ''
    ].filter(Boolean);
    return parts.join(' · ') || 'остатки не найдены';
  }

  function skuCandidates(platform = 'all', query = '', selectedKeys = []) {
    const selectedSet = new Set(selectedKeys.map(String));
    const queryToken = token(query);
    const rows = Array.isArray(appState().skus) ? appState().skus : [];
    return rows
      .filter((sku) => {
        if (!skuBelongsToPlatform(sku, platform)) return false;
        if (!queryToken) return true;
        const haystack = [
          skuPrimaryKey(sku),
          skuName(sku),
          skuStatus(sku),
          skuOwner(sku, platform),
          sku?.category,
          sku?.type
        ].join(' ');
        return token(haystack).includes(queryToken);
      })
      .map((sku) => {
        const key = skuPrimaryKey(sku);
        const signals = skuSignals(sku, platform);
        const selected = selectedSet.has(key);
        const rank = (selected ? 10000 : 0)
          + (signals.warehouse > 0 ? 200 : 0)
          + (signals.shipped > 0 ? 120 : 0)
          + (signals.orders7 > 0 ? 80 : 0)
          + number(sku?.focusScore);
        return { sku, key, signals, selected, rank };
      })
      .sort((a, b) => b.rank - a.rank || skuName(a.sku).localeCompare(skuName(b.sku), 'ru'))
      .slice(0, MAX_SKU_RESULTS);
  }

  function selectedSkuRows(platform = 'all') {
    return (CALENDAR_STATE.draftSkus || []).map((key) => {
      const sku = findSkuByKey(key);
      return {
        key,
        sku,
        signals: skuSignals(sku || key, platform)
      };
    });
  }

  function renderSkuChip(row, platform) {
    const name = row.sku ? skuName(row.sku) : row.key;
    const status = row.sku ? skuStatus(row.sku) : 'ручной SKU';
    return `
      <button class="promo-sku-chip tone-${skuSignalTone(row.signals)}" type="button" data-calendar-sku-remove="${html(row.key)}">
        <strong>${html(row.key)}</strong>
        <span>${html(name)}</span>
        <em>${html(status || platformLabel(platform))}</em>
      </button>
    `;
  }

  function renderSkuRow(item, platform) {
    const { sku, key, signals, selected } = item;
    return `
      <button class="promo-sku-option ${selected ? 'selected' : ''} tone-${skuSignalTone(signals)}" type="button" data-calendar-sku-toggle="${html(key)}" aria-pressed="${selected ? 'true' : 'false'}">
        <span class="promo-sku-option-main">
          <strong>${html(key)}</strong>
          <em>${html(skuName(sku))}</em>
        </span>
        <span class="promo-sku-option-meta">
          <b>${html(skuStatus(sku) || 'без статуса')}</b>
          <b>${html(skuOwner(sku, platform) || 'owner не задан')}</b>
          <b>${html(skuSignalSummary(signals))}</b>
        </span>
      </button>
    `;
  }

  function skuPickerInnerHtml(platform = 'all') {
    const selectedRows = selectedSkuRows(platform);
    const candidates = skuCandidates(platform, CALENDAR_STATE.skuQuery, CALENDAR_STATE.draftSkus);
    const selectedHtml = selectedRows.length
      ? selectedRows.map((row) => renderSkuChip(row, platform)).join('')
      : '<div class="promo-sku-empty">SKU пока не выбраны.</div>';
    return `
      <div class="promo-sku-selected">
        ${selectedHtml}
      </div>
      <div class="promo-sku-results">
        ${candidates.length ? candidates.map((item) => renderSkuRow(item, platform)).join('') : '<div class="promo-sku-empty">Ничего не нашлось. Проверьте площадку или поиск.</div>'}
      </div>
    `;
  }

  function renderSkuPicker(root) {
    const form = root.querySelector('[data-calendar-form]');
    const platform = form?.querySelector('[name="platform"]')?.value || 'all';
    const picker = root.querySelector('[data-calendar-sku-picker]');
    if (picker) picker.innerHTML = skuPickerInnerHtml(platform);
    const counter = root.querySelector('[data-calendar-selected-count]');
    if (counter) counter.textContent = `${CALENDAR_STATE.draftSkus.length} SKU`;
  }

  function renderEventPill(event, compact = false) {
    return `
      <button class="promo-event-pill ${eventClass(event)} ${eventTone(event)}" type="button" draggable="true" data-calendar-event="${html(event.id)}">
        <span>${html(platformLabel(event.platform))}</span>
        <strong>${html(event.title)}</strong>
        ${compact ? '' : `<em>${html(statusLabel(event.status))}</em>`}
        ${event.skus.length ? `<b>${formatInt(event.skus.length)} SKU</b>` : ''}
      </button>
    `;
  }

  function renderDay(day, events, monthKey) {
    const inMonth = startOfMonth(day) === startOfMonth(monthKey);
    const dayEvents = events.filter((event) => eventOverlapsDate(event, day)).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const className = [
      'promo-calendar-day',
      inMonth ? '' : 'muted-day',
      day === todayKey() ? 'today' : '',
      dayEvents.length ? 'has-events' : '',
      dayEvents[0] ? eventClass(dayEvents[0]) : ''
    ].filter(Boolean).join(' ');
    return `
      <div class="${className}" role="button" tabindex="0" data-calendar-day="${html(day)}" aria-label="${html(formatDate(day))}">
        <div class="promo-day-head">
          <span>${dateFromKey(day).getDate()}</span>
          <em>${day === todayKey() ? 'сегодня' : dayEvents.length ? `${dayEvents.length} событ.` : ''}</em>
        </div>
        <div class="promo-day-events">
          ${dayEvents.slice(0, 4).map((event) => renderEventPill(event, true)).join('')}
          ${dayEvents.length > 4 ? `<span class="promo-more">+${dayEvents.length - 4}</span>` : ''}
        </div>
      </div>
    `;
  }

  function renderStats(events) {
    const active = events.filter((event) => eventTone(event) === 'active').length;
    const soon = events.filter((event) => eventTone(event) === 'soon').length;
    const skuCount = new Set(events.flatMap((event) => event.skus)).size;
    const days = new Set(events.flatMap((event) => {
      const duration = daysBetween(event.startDate, event.endDate);
      return Array.from({ length: duration + 1 }, (_, index) => addDays(event.startDate, index));
    })).size;
    return `
      <div class="promo-calendar-stats">
        <button type="button" data-calendar-filter-status="all"><span>события</span><strong>${events.length}</strong></button>
        <button type="button" data-calendar-filter-status="active"><span>в эфире</span><strong>${active}</strong></button>
        <button type="button" data-calendar-filter-status="soon"><span>старт рядом</span><strong>${soon}</strong></button>
        <button type="button"><span>закрашено дней</span><strong>${days}</strong><em>${formatInt(skuCount)} SKU</em></button>
      </div>
    `;
  }

  function renderPlatformRail() {
    return `
      <div class="promo-platform-rail">
        ${PLATFORMS.map(([key, label]) => `
          <button class="${CALENDAR_STATE.platform === key ? 'active' : ''} ${eventClass(key)}" type="button" data-calendar-platform-chip="${html(key)}">
            <span>${html(label)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderSideList(events) {
    const sorted = [...events].sort((a, b) => `${a.startDate}|${a.title}`.localeCompare(`${b.startDate}|${b.title}`));
    if (!sorted.length) return '<div class="promo-empty">Событий пока нет.</div>';
    return sorted.slice(0, 10).map((event) => `
      <div class="promo-agenda-item ${eventClass(event)}">
        <button type="button" data-calendar-edit="${html(event.id)}">
          <strong>${html(event.title)}</strong>
          <span>${html(formatDate(event.startDate))}${event.endDate !== event.startDate ? ` - ${html(formatDate(event.endDate))}` : ''}</span>
        </button>
        <div>
          <span>${html(platformLabel(event.platform))}</span>
          ${event.skus.length ? `<span>${formatInt(event.skus.length)} SKU</span>` : '<span>SKU не выбраны</span>'}
          ${event.taskId ? '<span>задача есть</span>' : '<span>задача нужна</span>'}
        </div>
      </div>
    `).join('');
  }

  function renderModal() {
    if (!CALENDAR_STATE.modalOpen) return '';
    const event = activeEvent() || blankEvent();
    const isEdit = Boolean(event.id);
    const selectedRows = selectedSkuRows(event.platform);
    const signalTotals = selectedRows.reduce((acc, row) => {
      acc.warehouse += number(row.signals.warehouse);
      acc.shipped += number(row.signals.shipped);
      acc.orders7 += number(row.signals.orders7);
      return acc;
    }, { warehouse: 0, shipped: 0, orders7: 0 });
    return `
      <div class="promo-modal-backdrop" data-calendar-modal-close>
        <section class="promo-event-modal ${eventClass(event)}" role="dialog" aria-modal="true" aria-label="${isEdit ? 'Событие календаря' : 'Новое событие календаря'}" data-calendar-modal>
          <form class="promo-event-form" data-calendar-form>
            <input type="hidden" name="id" value="${html(event.id)}">
            <header class="promo-modal-head">
              <div>
                <span>${isEdit ? 'Событие' : 'Новое событие'}</span>
                <strong>${isEdit ? html(event.title) : `Промо на ${html(formatDate(event.startDate))}`}</strong>
              </div>
              <button type="button" data-calendar-modal-close aria-label="Закрыть">×</button>
            </header>

            <div class="promo-modal-grid">
              <section class="promo-modal-main">
                <label class="promo-field-wide">
                  <span>Название</span>
                  <input name="title" value="${html(event.title)}" placeholder="Хаммер по Красоте" required>
                </label>
                <div class="promo-form-row">
                  <label>
                    <span>Площадка</span>
                    <select name="platform">${PLATFORMS.filter(([key]) => key !== 'all').map(([key, label]) => `<option value="${html(key)}" ${event.platform === key ? 'selected' : ''}>${html(label)}</option>`).join('')}</select>
                  </label>
                  <label>
                    <span>Статус</span>
                    <select name="status">${EVENT_STATUSES.map(([status, label]) => `<option value="${status}" ${event.status === status ? 'selected' : ''}>${html(label)}</option>`).join('')}</select>
                  </label>
                </div>
                <div class="promo-form-row">
                  <label>
                    <span>Старт</span>
                    <input name="startDate" type="date" value="${html(event.startDate)}" required>
                  </label>
                  <label>
                    <span>Финиш</span>
                    <input name="endDate" type="date" value="${html(event.endDate)}" required>
                  </label>
                </div>
                <label class="promo-field-wide">
                  <span>Комментарий</span>
                  <textarea name="comment" rows="4" placeholder="Условия, механика, что проверить">${html(event.comment)}</textarea>
                </label>
                <label class="promo-field-wide">
                  <span>Owner</span>
                  <input name="owner" value="${html(event.owner)}" placeholder="${html(appState().team?.member?.name || 'Команда')}">
                </label>
              </section>

              <aside class="promo-modal-side">
                <div class="promo-sku-top">
                  <div>
                    <span>SKU в событии</span>
                    <strong data-calendar-selected-count>${formatInt(CALENDAR_STATE.draftSkus.length)} SKU</strong>
                  </div>
                  <div class="promo-sku-totals">
                    <span>склад ${formatInt(signalTotals.warehouse)}</span>
                    <span>отгр. ${formatInt(signalTotals.shipped)}</span>
                    <span>заказы 7д ${formatInt(signalTotals.orders7)}</span>
                  </div>
                </div>
                <label class="promo-sku-search">
                  <span>Выбор из реестра</span>
                  <input type="search" data-calendar-sku-search value="${html(CALENDAR_STATE.skuQuery)}" placeholder="Название или артикул">
                </label>
                <div class="promo-sku-picker" data-calendar-sku-picker>
                  ${skuPickerInnerHtml(event.platform)}
                </div>
              </aside>
            </div>

            <footer class="promo-modal-actions">
              <button class="quick-chip primary" type="submit">${isEdit ? 'Сохранить событие' : 'Добавить событие'}</button>
              ${isEdit ? `<button class="quick-chip" type="button" data-calendar-create-task="${html(event.id)}">${event.taskId ? 'Обновить задачу' : 'Создать задачу'}</button>` : ''}
              ${isEdit ? `<button class="quick-chip danger" type="button" data-calendar-delete="${html(event.id)}">Удалить</button>` : ''}
              <button class="quick-chip" type="button" data-calendar-modal-close>Отмена</button>
            </footer>
          </form>
        </section>
      </div>
    `;
  }

  function renderEventCalendar(rootId = 'view-data-health') {
    const root = document.getElementById(rootId);
    if (!root) return;
    patchCalendarChrome();
    const month = CALENDAR_STATE.month || startOfMonth(todayKey());
    CALENDAR_STATE.month = month;
    if (!CALENDAR_STATE.dateFrom) CALENDAR_STATE.dateFrom = startOfMonth(month);
    if (!CALENDAR_STATE.dateTo) CALENDAR_STATE.dateTo = endOfMonth(month);
    const events = filteredEvents();
    const gridDays = monthDays(month);
    root.innerHTML = `
      <div class="promo-calendar-shell">
        <section class="promo-calendar-command">
          <div class="promo-calendar-command-copy">
            <span>Календарь промо</span>
            <h2>События, SKU и стартовые задачи</h2>
            <p>Промо, акции, запуски, SKU и задачи старта.</p>
          </div>
          <div class="promo-calendar-command-actions">
            <button class="quick-chip" type="button" data-calendar-sync>${CALENDAR_STATE.remoteSaving ? 'Сохраняем...' : 'Синхронизировать'}</button>
            <button class="quick-chip" type="button" data-calendar-today>Сегодня</button>
          </div>
        </section>

        <section class="promo-calendar-toolbar">
          <label>
            <span>С</span>
            <input type="date" data-calendar-date-from value="${html(CALENDAR_STATE.dateFrom)}">
          </label>
          <label>
            <span>По</span>
            <input type="date" data-calendar-date-to value="${html(CALENDAR_STATE.dateTo)}">
          </label>
          <label>
            <span>Площадка</span>
            <select data-calendar-platform>${PLATFORMS.map(([key, label]) => `<option value="${html(key)}" ${CALENDAR_STATE.platform === key ? 'selected' : ''}>${html(label)}</option>`).join('')}</select>
          </label>
          <label>
            <span>Поиск</span>
            <input type="search" data-calendar-search value="${html(CALENDAR_STATE.search)}" placeholder="Промо или SKU">
          </label>
        </section>

        ${renderPlatformRail()}
        ${renderStats(events)}

        <section class="promo-calendar-layout">
          <div class="promo-calendar-board">
            <div class="promo-month-head">
              <button type="button" data-calendar-month="-1">‹</button>
              <strong>${html(monthLabel(month))}</strong>
              <button type="button" data-calendar-month="1">›</button>
            </div>
            <div class="promo-weekdays">${WEEKDAYS.map((day) => `<span>${day}</span>`).join('')}</div>
            <div class="promo-month-grid">${gridDays.map((day) => renderDay(day, events, month)).join('')}</div>
          </div>
          <aside class="promo-calendar-side">
            <div class="promo-side-card">
              <div class="promo-agenda-head">
                <span>Ближайшие события</span>
                <strong>${events.length}</strong>
              </div>
              ${renderSideList(events)}
            </div>
            <div class="promo-side-card promo-data-card">
              <span>Данные для SKU</span>
              <strong>${CALENDAR_STATE.dataLoading ? 'грузим...' : `${formatInt((appState().skus || []).length)} SKU`}</strong>
              <p>${payloadLooksLoaded(appState().warehouseStockOverlay || appState().warehouse_stock_overlay) ? 'Остатки подтянуты в карточку события.' : 'Остатки подтянутся при открытии календаря.'}</p>
            </div>
          </aside>
        </section>
        ${renderModal()}
      </div>
    `;
    bindCalendar(root, rootId);
    if (!CALENDAR_STATE.dataLoaded && !CALENDAR_STATE.dataLoading) ensureCalendarData(rootId);
    if (!CALENDAR_STATE.remoteLoaded && !CALENDAR_STATE.remoteLoading) syncCalendarFromRemote({ rootId, rerender: true });
  }

  function updateMonth(delta) {
    const date = dateFromKey(CALENDAR_STATE.month || todayKey());
    date.setMonth(date.getMonth() + Number(delta || 0));
    CALENDAR_STATE.month = startOfMonth(dateKey(date));
    CALENDAR_STATE.dateFrom = startOfMonth(CALENDAR_STATE.month);
    CALENDAR_STATE.dateTo = endOfMonth(CALENDAR_STATE.month);
  }

  function openEventModal(eventId = '', date = '') {
    CALENDAR_STATE.editingId = String(eventId || '').trim();
    CALENDAR_STATE.selectedDate = date || CALENDAR_STATE.selectedDate || todayKey();
    const event = activeEvent();
    CALENDAR_STATE.draftSkus = event ? [...event.skus] : [];
    CALENDAR_STATE.skuQuery = '';
    CALENDAR_STATE.modalOpen = true;
  }

  function closeEventModal() {
    CALENDAR_STATE.modalOpen = false;
    CALENDAR_STATE.skuQuery = '';
  }

  async function saveEventFromForm(form, rootId) {
    const data = new FormData(form);
    const id = String(data.get('id') || '').trim() || uidSafe('promo');
    const existing = allEvents().find((event) => event.id === id);
    const startDate = String(data.get('startDate') || todayKey()).slice(0, 10);
    const endDateRaw = String(data.get('endDate') || startDate).slice(0, 10);
    const now = new Date().toISOString();
    const event = normalizeEvent({
      ...(existing || {}),
      id,
      title: data.get('title'),
      platform: data.get('platform'),
      startDate,
      endDate: endDateRaw >= startDate ? endDateRaw : startDate,
      skus: [...new Set((CALENDAR_STATE.draftSkus || []).map((sku) => String(sku || '').trim()).filter(Boolean))],
      comment: data.get('comment'),
      owner: data.get('owner'),
      status: data.get('status'),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });
    storage().promoEvents = allEvents().filter((item) => item.id !== event.id);
    storage().promoEvents.unshift(event);
    CALENDAR_STATE.editingId = event.id;
    if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason: 'promo-calendar-save' });
    const eventWithTask = await ensureEventTask(event, existing ? 'updated' : 'created');
    storage().promoEvents = allEvents().map((item) => item.id === eventWithTask.id ? eventWithTask : item);
    if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason: 'promo-calendar-task' });
    await persistPromoCalendarEvents({ rootId });
    CALENDAR_STATE.modalOpen = false;
    renderEventCalendar(rootId);
    if (typeof setAppError === 'function') setAppError(`Событие сохранено: ${eventWithTask.title}.`);
  }

  async function deleteEvent(id, rootId) {
    const event = allEvents().find((item) => item.id === id);
    if (!event) return;
    storage().promoEvents = allEvents().filter((item) => item.id !== id);
    storage().promoEventDeletedIds = [
      ...deletedIds().filter((item) => item.id !== id),
      { id, deletedAt: new Date().toISOString() }
    ];
    CALENDAR_STATE.editingId = '';
    CALENDAR_STATE.modalOpen = false;
    if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason: 'promo-calendar-delete' });
    if (event.taskId && typeof createTaskHistoryEntry === 'function') {
      try { await createTaskHistoryEntry(event.taskId, 'updated', `Календарное событие удалено: ${event.title}.`); } catch {}
    }
    await persistPromoCalendarEvents({ rootId });
    renderEventCalendar(rootId);
  }

  function taskPayload(event) {
    const firstSku = event.skus[0] || '';
    const skuRows = event.skus.map((key) => {
      const sku = findSkuByKey(key);
      const signals = skuSignals(sku || key, event.platform);
      return `${key}: ${skuSignalSummary(signals)}`;
    });
    const period = event.endDate !== event.startDate ? `${event.startDate} - ${event.endDate}` : event.startDate;
    return {
      articleKey: firstSku,
      entityLabel: event.title,
      title: `Старт промо: ${event.title}`,
      type: 'traffic',
      priority: eventTone(event) === 'soon' || eventTone(event) === 'active' ? 'high' : 'medium',
      platform: event.platform,
      owner: event.owner || appState().team?.member?.name || '',
      due: event.startDate,
      nextAction: `Проверить старт промо ${platformLabel(event.platform)}: ${event.title}.`,
      reason: [
        `Период: ${period}`,
        event.skus.length ? `SKU:\n${skuRows.join('\n')}` : '',
        event.comment ? `Комментарий: ${event.comment}` : ''
      ].filter(Boolean).join('\n'),
      skipRerender: true
    };
  }

  async function ensureEventTask(event, reason = 'updated') {
    const normalized = normalizeEvent(event);
    const tasks = Array.isArray(appState().storage?.tasks) ? appState().storage.tasks : [];
    const existingTask = normalized.taskId ? tasks.find((task) => task.id === normalized.taskId) : null;
    const payload = taskPayload(normalized);
    if (existingTask) {
      const before = JSON.stringify({
        title: existingTask.title,
        due: existingTask.due,
        platform: existingTask.platform,
        nextAction: existingTask.nextAction
      });
      existingTask.title = payload.title;
      existingTask.due = payload.due;
      existingTask.platform = payload.platform;
      existingTask.owner = payload.owner || existingTask.owner;
      existingTask.nextAction = payload.nextAction;
      existingTask.reason = payload.reason;
      existingTask.updatedAt = new Date().toISOString();
      if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason: 'promo-calendar-task-update' });
      if (before !== JSON.stringify({ title: existingTask.title, due: existingTask.due, platform: existingTask.platform, nextAction: existingTask.nextAction })) {
        try {
          if (typeof persistTask === 'function') await persistTask(existingTask);
          if (typeof createTaskHistoryEntry === 'function') await createTaskHistoryEntry(existingTask.id, 'updated', `Календарь обновил задачу промо: старт ${normalized.startDate}.`);
        } catch (error) {
          console.warn('[promo-calendar] task update', error);
        }
      }
      return { ...normalized, taskId: existingTask.id };
    }
    if (typeof createManualTask !== 'function') return normalized;
    try {
      const task = await createManualTask(payload);
      if (task?.id && typeof createTaskHistoryEntry === 'function') {
        await createTaskHistoryEntry(task.id, reason === 'created' ? 'created' : 'updated', `Задача связана с календарём промо: ${normalized.title}.`);
      }
      return { ...normalized, taskId: task?.id || normalized.taskId };
    } catch (error) {
      console.warn('[promo-calendar] task create', error);
      return normalized;
    }
  }

  async function moveEvent(id, day, rootId) {
    const event = allEvents().find((item) => item.id === id);
    if (!event) return;
    const duration = daysBetween(event.startDate, event.endDate);
    const moved = {
      ...event,
      startDate: day,
      endDate: addDays(day, duration),
      updatedAt: new Date().toISOString()
    };
    storage().promoEvents = allEvents().map((item) => item.id === id ? moved : item);
    if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason: 'promo-calendar-move' });
    const withTask = await ensureEventTask(moved, 'updated');
    storage().promoEvents = allEvents().map((item) => item.id === id ? withTask : item);
    if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason: 'promo-calendar-move-task' });
    await persistPromoCalendarEvents({ rootId });
    CALENDAR_STATE.editingId = id;
    renderEventCalendar(rootId);
  }

  function openTaskForEvent(id) {
    const event = allEvents().find((item) => item.id === id);
    if (!event?.taskId) return;
    if (typeof openTaskModal === 'function') openTaskModal(event.taskId);
    else if (typeof renderTaskModal === 'function') renderTaskModal(event.taskId);
  }

  function bindCalendar(root, rootId) {
    root.querySelector('[data-calendar-date-from]')?.addEventListener('change', (event) => {
      CALENDAR_STATE.dateFrom = event.target.value || startOfMonth(CALENDAR_STATE.month);
      if (CALENDAR_STATE.dateFrom) CALENDAR_STATE.month = startOfMonth(CALENDAR_STATE.dateFrom);
      renderEventCalendar(rootId);
    });
    root.querySelector('[data-calendar-date-to]')?.addEventListener('change', (event) => {
      CALENDAR_STATE.dateTo = event.target.value || endOfMonth(CALENDAR_STATE.month);
      renderEventCalendar(rootId);
    });
    root.querySelector('[data-calendar-platform]')?.addEventListener('change', (event) => {
      CALENDAR_STATE.platform = event.target.value || 'all';
      renderEventCalendar(rootId);
    });
    root.querySelector('[data-calendar-search]')?.addEventListener('input', (event) => {
      CALENDAR_STATE.search = event.target.value || '';
      renderEventCalendar(rootId);
    });
    root.querySelectorAll('[data-calendar-platform-chip]').forEach((button) => {
      button.addEventListener('click', () => {
        CALENDAR_STATE.platform = button.dataset.calendarPlatformChip || 'all';
        renderEventCalendar(rootId);
      });
    });
    root.querySelectorAll('[data-calendar-month]').forEach((button) => {
      button.addEventListener('click', () => {
        updateMonth(button.dataset.calendarMonth);
        renderEventCalendar(rootId);
      });
    });
    root.querySelector('[data-calendar-today]')?.addEventListener('click', () => {
      CALENDAR_STATE.month = startOfMonth(todayKey());
      CALENDAR_STATE.dateFrom = startOfMonth(todayKey());
      CALENDAR_STATE.dateTo = endOfMonth(todayKey());
      renderEventCalendar(rootId);
    });
    root.querySelector('[data-calendar-sync]')?.addEventListener('click', async () => {
      await persistPromoCalendarEvents({ rootId, rerender: true });
      if (typeof setAppError === 'function') setAppError('Календарь синхронизирован.');
    });
    root.querySelectorAll('[data-calendar-day]').forEach((day) => {
      const open = () => {
        openEventModal('', day.dataset.calendarDay || todayKey());
        renderEventCalendar(rootId);
      };
      day.addEventListener('click', open);
      day.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
      day.addEventListener('dragover', (event) => {
        event.preventDefault();
        day.classList.add('drag-over');
      });
      day.addEventListener('dragleave', () => day.classList.remove('drag-over'));
      day.addEventListener('drop', async (event) => {
        event.preventDefault();
        day.classList.remove('drag-over');
        const id = event.dataTransfer?.getData('application/x-promo-event') || event.dataTransfer?.getData('text/plain');
        if (id) await moveEvent(id, day.dataset.calendarDay, rootId);
      });
    });
    root.querySelectorAll('[data-calendar-event], [data-calendar-edit]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openEventModal(button.dataset.calendarEvent || button.dataset.calendarEdit || '', '');
        renderEventCalendar(rootId);
      });
      button.addEventListener('dragstart', (event) => {
        const id = button.dataset.calendarEvent || button.dataset.calendarEdit || '';
        event.dataTransfer?.setData('text/plain', id);
        event.dataTransfer?.setData('application/x-promo-event', id);
      });
    });
    root.querySelector('[data-calendar-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveEventFromForm(event.currentTarget, rootId);
    });
    root.querySelector('[data-calendar-form] select[name="platform"]')?.addEventListener('change', () => renderSkuPicker(root));
    root.querySelector('[data-calendar-sku-search]')?.addEventListener('input', (event) => {
      CALENDAR_STATE.skuQuery = event.target.value || '';
      renderSkuPicker(root);
    });
    root.querySelector('[data-calendar-sku-picker]')?.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-calendar-sku-toggle]');
      const remove = event.target.closest('[data-calendar-sku-remove]');
      const key = toggle?.dataset.calendarSkuToggle || remove?.dataset.calendarSkuRemove || '';
      if (!key) return;
      const current = new Set(CALENDAR_STATE.draftSkus || []);
      if (remove || current.has(key)) current.delete(key);
      else current.add(key);
      CALENDAR_STATE.draftSkus = [...current];
      renderSkuPicker(root);
    });
    root.querySelectorAll('[data-calendar-modal-close]').forEach((button) => {
      button.addEventListener('click', (event) => {
        if (event.currentTarget === event.target || event.currentTarget.tagName === 'BUTTON') {
          closeEventModal();
          renderEventCalendar(rootId);
        }
      });
    });
    root.querySelector('[data-calendar-delete]')?.addEventListener('click', async (event) => {
      await deleteEvent(event.currentTarget.dataset.calendarDelete, rootId);
    });
    root.querySelector('[data-calendar-create-task]')?.addEventListener('click', async (event) => {
      const id = event.currentTarget.dataset.calendarCreateTask;
      const calendarEvent = allEvents().find((item) => item.id === id);
      if (!calendarEvent) return;
      const updated = await ensureEventTask(calendarEvent, 'updated');
      storage().promoEvents = allEvents().map((item) => item.id === updated.id ? updated : item);
      if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason: 'promo-calendar-task-manual' });
      await persistPromoCalendarEvents({ rootId });
      closeEventModal();
      renderEventCalendar(rootId);
      openTaskForEvent(updated.id);
    });
  }

  function patchCalendarChrome() {
    const button = document.querySelector('.nav-btn[data-view="data-health"]');
    if (button) {
      const title = button.querySelector('span');
      const subtitle = button.querySelector('small');
      if (title) title.textContent = 'Календарь';
      if (subtitle) subtitle.textContent = 'акции · события · SKU';
    }
  }

  function install() {
    patchCalendarChrome();
    window.renderPortalDataHealth = renderEventCalendar;
    window.renderPromoEventsCalendar = renderEventCalendar;
    window.syncPromoCalendarFromRemote = syncCalendarFromRemote;
    window.persistPromoCalendarEvents = persistPromoCalendarEvents;
    try { renderPortalDataHealth = renderEventCalendar; } catch {}
  }

  install();
  window.addEventListener('DOMContentLoaded', install, { once: true });
})();
