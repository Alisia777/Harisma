(function () {
  'use strict';

  if (window.__ALTEA_DESIGN_WORKSPACE_V1__) return;
  window.__ALTEA_DESIGN_WORKSPACE_V1__ = true;

  var ROOT_ID = 'view-designers';
  var STORAGE_KEY = 'altea-design-workspace-v1';
  var UI_KEY = 'altea-design-workspace-ui-v1';
  var REMOTE_TABLE = 'portal_design_workspaces';
  var REMOTE_MEMBERS_TABLE = 'portal_design_workspace_members';
  var REMOTE_HISTORY_TABLE = 'portal_design_workspace_history';
  var REMOTE_AUDIT_TABLE = 'portal_design_workspace_audit';
  var REMOTE_SAVE_RPC = 'save_portal_design_workspace';
  var REMOTE_RESTORE_RPC = 'restore_portal_design_workspace_revision';
  var DB_NAME = 'altea-design-workspace';
  var DB_STORE = 'snapshots';
  var DB_RECORD_KEY = 'current';
  var LOCAL_STORAGE_SOFT_LIMIT = 1500000;
  var MAX_IMPORT_BYTES = 8 * 1024 * 1024;
  var MAX_IMPORT_ROWS = 12000;
  var MAX_TEST_IMAGE_BYTES = 2 * 1024 * 1024;
  var PROJECT_PAGE_SIZE = 100;
  var TEST_PAGE_SIZE = 24;
  var KNOWLEDGE_PAGE_SIZE = 60;
  var ACTIVITY_LIMIT = 500;
  var LOCAL_BACKUP_LIMIT = 10;
  var LOCAL_BACKUP_INTERVAL_MS = 5 * 60 * 1000;
  var REMOTE_REQUEST_TIMEOUT_MS = 12000;
  var LOCAL_READ_TIMEOUT_MS = 6000;
  var SEED_PATH = 'data/design_workspace.json';
  var SCHEMA = 'altea-design-workspace-v1';

  var STATUS = {
    inbox: { label: 'Запросы', color: '#8d8780' },
    brief: { label: 'Бриф', color: '#c98a36' },
    production: { label: 'В работе', color: '#7e5cff' },
    review: { label: 'На ревью', color: '#4e83bf' },
    done: { label: 'Готово', color: '#54a987' }
  };

  var TYPES = [
    ['card', 'Карточка товара'],
    ['rich', 'Rich-контент'],
    ['social', 'Соцсети'],
    ['presentation', 'Презентация'],
    ['package', 'Упаковка'],
    ['photo', 'Фото / ретушь'],
    ['brand', 'Бренд-дизайн'],
    ['other', 'Другое']
  ];

  var PRIORITIES = {
    high: { label: 'Высокий', color: '#c65858' },
    normal: { label: 'Обычный', color: '#c98a36' },
    low: { label: 'Низкий', color: '#54a987' }
  };

  var TEST_STATUS = {
    planned: { label: 'Запланирован', color: '#8d8780' },
    running: { label: 'Идёт тест', color: '#7e5cff' },
    analysis: { label: 'Анализ', color: '#c98a36' },
    complete: { label: 'Завершён', color: '#54a987' }
  };

  var PAGE_CATEGORIES = ['Процессы', 'Брифы', 'Бренд-система', 'Шаблоны', 'Референсы', 'Архив'];
  var PAGE_KINDS = [
    ['page', 'Страница'],
    ['guide', 'Регламент'],
    ['brief', 'Бриф'],
    ['template', 'Шаблон'],
    ['library', 'Библиотека'],
    ['link', 'Ссылка']
  ];

  var FALLBACK_DATA = {
    schema: SCHEMA,
    version: 1,
    updatedAt: '',
    projects: [],
    tests: [],
    pages: [],
    activity: [],
    settings: { departmentName: 'Дизайн-отдел', defaultView: 'board' }
  };

  var cache = readLocal();
  var data = normalizeData(cache.data || FALLBACK_DATA);
  var ui = readUi();
  var activeDialog = null;
  var lastFocusedElement = null;
  var loadStarted = false;
  var loadFinished = false;
  var syncTimer = 0;
  var searchTimer = 0;
  var remoteRevision = 0;
  var workspaceAccess = 'checking';
  var workspaceAccessMessage = 'Проверяем права доступа';
  var remoteHistory = [];
  var remoteAudit = [];
  var localBackups = [];
  var lastBackupAt = 0;
  var lastCommittedData = clone(data);
  var lastSyncedData = normalizeData(cache.lastSyncedData || FALLBACK_DATA);
  var syncConflicts = [];
  var pendingConflict = null;
  var localPersistState = 'idle';
  var localPersistError = '';
  var localPersistChain = Promise.resolve();
  var syncState = cache.dirty ? 'pending' : 'local';
  var syncMessage = cache.dirty ? 'Есть несинхронизированные изменения' : 'Сохранено на устройстве';
  var remoteLoadError = '';
  var toastTimer = 0;

  function html(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function nowIso() { return new Date().toISOString(); }

  function uid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return prefix + '-' + window.crypto.randomUUID();
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function string(value) { return String(value == null ? '' : value).trim(); }

  function timestamp(value) {
    var parsed = Date.parse(string(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function storageScope() {
    var session = window.alteaPortalAuthGate && typeof window.alteaPortalAuthGate.getSession === 'function'
      ? window.alteaPortalAuthGate.getSession()
      : window.__ALTEA_AUTH_SESSION__;
    var user = session && session.user;
    return hashText(string(user && (user.id || user.email)) || 'local');
  }

  function legacyStorageScope() {
    var session = window.alteaPortalAuthGate && typeof window.alteaPortalAuthGate.getSession === 'function'
      ? window.alteaPortalAuthGate.getSession()
      : window.__ALTEA_AUTH_SESSION__;
    var user = session && session.user;
    return legacyHashText(string(user && (user.id || user.email)) || 'local');
  }

  function scopedStorageKey() { return STORAGE_KEY + ':' + storageScope(); }
  function scopedRecordKey() { return DB_RECORD_KEY + ':' + storageScope(); }
  function scopedBackupPrefix() { return 'backup:' + storageScope() + ':'; }
  function legacyScopedStorageKey() { return STORAGE_KEY + ':' + legacyStorageScope(); }
  function legacyScopedRecordKey() { return DB_RECORD_KEY + ':' + legacyStorageScope(); }
  function legacyScopedBackupPrefix() { return 'backup:' + legacyStorageScope() + ':'; }

  function normalizeProject(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var status = STATUS[raw.status] ? raw.status : statusFromText(raw.status);
    var priority = PRIORITIES[raw.priority] ? raw.priority : priorityFromText(raw.priority);
    var type = TYPES.some(function (item) { return item[0] === raw.type; }) ? raw.type : typeFromText(raw.type);
    var createdAt = string(raw.createdAt) || nowIso();
    return {
      id: string(raw.id) || uid('design-project'),
      title: string(raw.title || raw.name) || 'Без названия',
      type: type,
      status: status,
      owner: string(raw.owner || raw.assignee),
      dueDate: normalizeDate(raw.dueDate || raw.deadline || raw.due),
      priority: priority,
      marketplace: string(raw.marketplace || raw.platform),
      brief: string(raw.brief || raw.description || raw.notes),
      url: safeUrl(raw.url || raw.link || raw.href),
      tags: normalizeTags(raw.tags),
      archived: raw.archived === true,
      createdAt: createdAt,
      updatedAt: string(raw.updatedAt) || createdAt,
      source: string(raw.source),
      sourceKey: string(raw.sourceKey)
    };
  }

  function normalizePage(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var createdAt = string(raw.createdAt) || nowIso();
    var category = string(raw.category) || 'Процессы';
    if (PAGE_CATEGORIES.indexOf(category) === -1) PAGE_CATEGORIES.push(category);
    return {
      id: string(raw.id) || uid('design-page'),
      title: string(raw.title || raw.name) || 'Без названия',
      category: category,
      kind: PAGE_KINDS.some(function (item) { return item[0] === raw.kind; }) ? raw.kind : 'page',
      summary: string(raw.summary || raw.description),
      content: string(raw.content || raw.notes),
      url: safeUrl(raw.url || raw.link || raw.href),
      owner: string(raw.owner),
      status: raw.status === 'draft' ? 'draft' : 'published',
      archived: raw.archived === true,
      createdAt: createdAt,
      updatedAt: string(raw.updatedAt) || createdAt,
      source: string(raw.source),
      sourceKey: string(raw.sourceKey)
    };
  }

  function number(value) {
    if (value === '' || value == null) return 0;
    var parsed = Number(String(value).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function normalizeVariant(raw, fallbackName) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
      name: string(raw.name) || fallbackName,
      imageUrl: safeImageUrl(raw.imageUrl || raw.image || raw.preview),
      views: number(raw.views || raw.impressions || raw.shows),
      clicks: number(raw.clicks),
      carts: number(raw.carts || raw.addToCart || raw.add_to_cart),
      orders: number(raw.orders || raw.conversions),
      revenue: number(raw.revenue || raw.sales || raw.gmv)
    };
  }

  function normalizeTest(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var createdAt = string(raw.createdAt) || nowIso();
    var status = TEST_STATUS[raw.status] ? raw.status : testStatusFromText(raw.status);
    var winner = ['control', 'variant', 'inconclusive'].indexOf(raw.winner) >= 0 ? raw.winner : '';
    return {
      id: string(raw.id) || uid('design-test'),
      title: string(raw.title || raw.name) || 'Тест без названия',
      sku: string(raw.sku || raw.article || raw.articleKey),
      marketplace: string(raw.marketplace || raw.platform),
      owner: string(raw.owner || raw.assignee),
      status: status,
      hypothesis: string(raw.hypothesis || raw.description),
      startDate: normalizeDate(raw.startDate || raw.dateFrom),
      endDate: normalizeDate(raw.endDate || raw.dateTo),
      control: normalizeVariant(raw.control || raw.a, 'Контроль A'),
      variant: normalizeVariant(raw.variant || raw.b, 'Вариант B'),
      winner: winner,
      conclusion: string(raw.conclusion || raw.result),
      decision: string(raw.decision || raw.action),
      sourceUrl: safeUrl(raw.sourceUrl || raw.reportUrl || raw.url),
      tags: normalizeTags(raw.tags),
      archived: raw.archived === true,
      createdAt: createdAt,
      updatedAt: string(raw.updatedAt) || createdAt,
      source: string(raw.source),
      sourceKey: string(raw.sourceKey)
    };
  }

  function normalizeActivity(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
      id: string(raw.id) || uid('design-event'),
      action: string(raw.action) || 'change',
      summary: string(raw.summary) || 'Рабочее пространство изменено',
      entityType: string(raw.entityType),
      entityId: string(raw.entityId),
      actor: string(raw.actor),
      createdAt: string(raw.createdAt) || nowIso()
    };
  }

  function normalizeData(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
      schema: SCHEMA,
      version: 1,
      updatedAt: string(raw.updatedAt),
      projects: Array.isArray(raw.projects) ? raw.projects.map(normalizeProject) : [],
      tests: Array.isArray(raw.tests) ? raw.tests.map(normalizeTest) : [],
      pages: Array.isArray(raw.pages) ? raw.pages.map(normalizePage) : [],
      activity: Array.isArray(raw.activity) ? raw.activity.map(normalizeActivity).sort(function (a, b) { return timestamp(b.createdAt) - timestamp(a.createdAt); }).slice(0, ACTIVITY_LIMIT) : [],
      settings: Object.assign({}, FALLBACK_DATA.settings, raw.settings || {})
    };
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(scopedStorageKey());
      if (!raw && legacyScopedStorageKey() !== scopedStorageKey()) {
        raw = localStorage.getItem(legacyScopedStorageKey());
        if (raw) {
          localStorage.setItem(scopedStorageKey(), raw);
          localStorage.removeItem(legacyScopedStorageKey());
        }
      }
      if (!raw) return { data: clone(FALLBACK_DATA), dirty: false, lastSyncedData: null };
      var parsed = JSON.parse(raw);
      if (parsed && parsed.data) return { data: parsed.data, dirty: parsed.dirty === true, lastSyncedData: parsed.lastSyncedData || null };
      if (parsed && parsed.indexedDb) return { data: clone(FALLBACK_DATA), dirty: parsed.dirty === true, indexedDb: true, lastSyncedData: null };
      return { data: parsed, dirty: false, lastSyncedData: null };
    } catch (_) {
      return { data: clone(FALLBACK_DATA), dirty: false, lastSyncedData: null };
    }
  }

  function readUi() {
    var fallback = {
      mode: 'board', search: '', status: 'active', owner: 'all', type: 'all', deadline: 'all', projectPage: 1,
      testSearch: '', testStatus: 'all', testOwner: 'all', testPage: 1,
      knowledgeSearch: '', knowledgeCategory: 'all', knowledgePage: 1
    };
    try {
      var parsed = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      return Object.assign(fallback, parsed || {});
    } catch (_) { return fallback; }
  }

  function writeUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (_) {}
  }

  function openWorkspaceDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB недоступна')); return; }
      var request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Не удалось открыть локальную базу')); };
      request.onblocked = function () { reject(new Error('Локальная база заблокирована другой вкладкой')); };
    });
  }

  async function readIndexed() {
    var db = await openWorkspaceDb();
    try {
      return await new Promise(function (resolve, reject) {
        var transaction = db.transaction(DB_STORE, 'readonly');
        var store = transaction.objectStore(DB_STORE);
        var request = store.get(scopedRecordKey());
        request.onsuccess = function () {
          if (request.result || legacyScopedRecordKey() === scopedRecordKey()) { resolve(request.result || null); return; }
          var legacyRequest = store.get(legacyScopedRecordKey());
          legacyRequest.onsuccess = function () { resolve(legacyRequest.result || null); };
          legacyRequest.onerror = function () { reject(legacyRequest.error || new Error('Не удалось прочитать прежний локальный кэш')); };
        };
        request.onerror = function () { reject(request.error || new Error('Не удалось прочитать локальную базу')); };
      });
    } finally { db.close(); }
  }

  async function writeIndexed(value) {
    var db = await openWorkspaceDb();
    try {
      await new Promise(function (resolve, reject) {
        var transaction = db.transaction(DB_STORE, 'readwrite');
        var store = transaction.objectStore(DB_STORE);
        store.put(value, scopedRecordKey());
        if (legacyScopedRecordKey() !== scopedRecordKey()) store.delete(legacyScopedRecordKey());
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error || new Error('Не удалось сохранить локальную базу')); };
        transaction.onabort = function () { reject(transaction.error || new Error('Локальное сохранение отменено')); };
      });
    } finally { db.close(); }
  }

  async function readIndexedBackups() {
    var db = await openWorkspaceDb();
    try {
      return await new Promise(function (resolve, reject) {
        var transaction = db.transaction(DB_STORE, 'readonly');
        var store = transaction.objectStore(DB_STORE);
        if (typeof store.getAll !== 'function') { resolve([]); return; }
        var request = store.getAll();
        request.onsuccess = function () {
          resolve((request.result || []).filter(function (item) { return item && item.backup === true && (item.scope === storageScope() || item.scope === legacyStorageScope()) && item.data; })
            .sort(function (a, b) { return timestamp(b.createdAt) - timestamp(a.createdAt); })
            .slice(0, LOCAL_BACKUP_LIMIT));
        };
        request.onerror = function () { reject(request.error || new Error('Не удалось прочитать резервные копии')); };
      });
    } finally { db.close(); }
  }

  async function writeIndexedBackup(snapshot, reason) {
    var db = await openWorkspaceDb();
    var key = scopedBackupPrefix() + Date.now() + ':' + Math.random().toString(36).slice(2, 7);
    var record = {
      key: key,
      scope: storageScope(),
      backup: true,
      createdAt: nowIso(),
      reason: string(reason) || 'Автоматическая резервная копия',
      data: clone(snapshot)
    };
    try {
      await new Promise(function (resolve, reject) {
        var transaction = db.transaction(DB_STORE, 'readwrite');
        var store = transaction.objectStore(DB_STORE);
        store.put(record, key);
        if (typeof store.getAllKeys === 'function') {
          var keysRequest = store.getAllKeys();
          keysRequest.onsuccess = function () {
            var prefix = scopedBackupPrefix();
            var keys = (keysRequest.result || []).filter(function (item) { return String(item).indexOf(prefix) === 0; }).sort().reverse();
            keys.slice(LOCAL_BACKUP_LIMIT).forEach(function (oldKey) { store.delete(oldKey); });
          };
        }
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error || new Error('Не удалось создать резервную копию')); };
        transaction.onabort = function () { reject(transaction.error || new Error('Создание резервной копии отменено')); };
      });
      return record;
    } finally { db.close(); }
  }

  function refreshLocalBackups() {
    return readIndexedBackups().then(function (items) {
      localBackups = items;
      if (items[0]) lastBackupAt = Math.max(lastBackupAt, timestamp(items[0].createdAt));
      renderDesigners();
      return items;
    }).catch(function () { return []; });
  }

  function queueLocalBackup(reason, force, snapshot) {
    var stamp = Date.now();
    if (!force && lastBackupAt && stamp - lastBackupAt < LOCAL_BACKUP_INTERVAL_MS) return Promise.resolve(false);
    lastBackupAt = stamp;
    var copy = clone(snapshot || lastCommittedData || data);
    localPersistChain = localPersistChain.catch(function () {}).then(function () {
      return writeIndexedBackup(copy, reason);
    }).then(function () {
      return refreshLocalBackups();
    }).then(function () { return true; }).catch(function (error) {
      lastBackupAt = 0;
      if (force) showToast(error && error.message ? error.message : 'Не удалось создать резервную копию');
      return false;
    });
    return localPersistChain;
  }

  async function purgeScopedLocalData() {
    try { localStorage.removeItem(scopedStorageKey()); } catch (_) {}
    try { localStorage.removeItem(legacyScopedStorageKey()); } catch (_) {}
    var db;
    try { db = await openWorkspaceDb(); } catch (_) { return false; }
    try {
      await new Promise(function (resolve, reject) {
        var transaction = db.transaction(DB_STORE, 'readwrite');
        var store = transaction.objectStore(DB_STORE);
        store.delete(scopedRecordKey());
        store.delete(legacyScopedRecordKey());
        if (typeof store.getAllKeys === 'function') {
          var request = store.getAllKeys();
          request.onsuccess = function () {
            var prefix = scopedBackupPrefix();
            var legacyPrefix = legacyScopedBackupPrefix();
            (request.result || []).forEach(function (key) {
              if (String(key).indexOf(prefix) === 0 || String(key).indexOf(legacyPrefix) === 0) store.delete(key);
            });
          };
        }
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error || new Error('Не удалось очистить локальный кэш')); };
      });
      return true;
    } catch (_) { return false; }
    finally { db.close(); }
  }

  function updateLocalPersistMessage() {
    if (localPersistState === 'error') {
      syncState = 'error';
      syncMessage = 'Не сохранено · ' + (localPersistError || 'ошибка локальной базы');
    } else if (localPersistState === 'pending' && syncState !== 'pending') {
      syncState = 'pending';
      syncMessage = 'Сохраняем на устройстве';
    } else if (localPersistState === 'ok' && (!remoteConfig() || !remoteConfig().token)) {
      syncState = 'local';
      syncMessage = 'Сохранено на устройстве';
    }
  }

  function writeLocal(dirty) {
    cache = { data: data, dirty: dirty === true, lastSyncedData: lastSyncedData };
    var snapshot = clone(cache);
    var serialized = JSON.stringify(snapshot);
    var localFallbackSaved = false;
    try {
      if (serialized.length <= LOCAL_STORAGE_SOFT_LIMIT) localStorage.setItem(scopedStorageKey(), serialized);
      else localStorage.setItem(scopedStorageKey(), JSON.stringify({ indexedDb: true, dirty: dirty === true, updatedAt: data.updatedAt }));
      localFallbackSaved = true;
    } catch (_) { localFallbackSaved = false; }
    localPersistState = 'pending';
    localPersistError = '';
    localPersistChain = localPersistChain.catch(function () {}).then(function () { return writeIndexed(snapshot); }).then(function () {
      localPersistState = 'ok';
      localPersistError = '';
      updateLocalPersistMessage();
      renderDesigners();
      return true;
    }).catch(function (error) {
      if (localFallbackSaved && serialized.length <= LOCAL_STORAGE_SOFT_LIMIT) {
        localPersistState = 'ok';
        updateLocalPersistMessage();
        renderDesigners();
        return true;
      }
      localPersistState = 'error';
      localPersistError = error && error.message ? error.message : 'локальная база недоступна';
      updateLocalPersistMessage();
      renderDesigners();
      return false;
    });
    return localPersistChain;
  }

  function normalizeTags(value) {
    var list = Array.isArray(value) ? value : string(value).split(/[,;|]/);
    var output = [];
    list.forEach(function (item) {
      var tag = string(item);
      if (tag && output.indexOf(tag) === -1) output.push(tag);
    });
    return output.slice(0, 12);
  }

  function normalizeDate(value) {
    var raw = string(value);
    if (!raw) return '';
    var direct = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (direct) return direct[1] + '-' + direct[2] + '-' + direct[3];
    var ru = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(raw);
    if (ru) return ru[3] + '-' + String(ru[2]).padStart(2, '0') + '-' + String(ru[1]).padStart(2, '0');
    var parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }

  function safeUrl(value) {
    var raw = string(value);
    if (!raw) return '';
    if (/^(www\.|docs\.google\.|drive\.google\.|figma\.com)/i.test(raw)) raw = 'https://' + raw;
    try {
      var url = new URL(raw, window.location.href);
      return /^(https?:|mailto:)$/.test(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  function safeImageUrl(value) {
    var raw = string(value);
    if (!raw) return '';
    if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw.replace(/\s+/g, '');
    return safeUrl(raw);
  }

  function legacyHashText(value) {
    var text = String(value || '');
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function hashText(value) {
    var text = String(value || '');
    var h1 = 1779033703;
    var h2 = 3144134277;
    var h3 = 1013904242;
    var h4 = 2773480762;
    for (var index = 0; index < text.length; index += 1) {
      var code = text.charCodeAt(index);
      h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    function hex(part) { return (part >>> 0).toString(16).padStart(8, '0'); }
    return hex(h1 ^ h2 ^ h3 ^ h4) + hex(h2 ^ h1) + hex(h3 ^ h1) + hex(h4 ^ h1);
  }

  function uniqueImportId(prefix, sourceKey, usedIds) {
    var base = prefix + hashText(sourceKey);
    var candidate = base;
    var attempt = 0;
    while (usedIds.has(candidate)) {
      attempt += 1;
      candidate = base + '-' + attempt;
    }
    usedIds.add(candidate);
    return candidate;
  }

  function mergeEntities(remote, local, normalizer) {
    var map = new Map();
    [remote || [], local || []].forEach(function (list) {
      list.forEach(function (raw) {
        var item = normalizer(raw);
        var existing = map.get(item.id);
        if (!existing || timestamp(item.updatedAt) >= timestamp(existing.updatedAt)) map.set(item.id, item);
      });
    });
    return Array.from(map.values());
  }

  function mergeData(remote, local) {
    remote = normalizeData(remote || {});
    local = normalizeData(local || {});
    return normalizeData({
      updatedAt: timestamp(local.updatedAt) >= timestamp(remote.updatedAt) ? local.updatedAt : remote.updatedAt,
      projects: mergeEntities(remote.projects, local.projects, normalizeProject),
      tests: mergeEntities(remote.tests, local.tests, normalizeTest),
      pages: mergeEntities(remote.pages, local.pages, normalizePage),
      activity: mergeEntities(remote.activity, local.activity, normalizeActivity).sort(function (a, b) { return timestamp(b.createdAt) - timestamp(a.createdAt); }).slice(0, ACTIVITY_LIMIT),
      settings: Object.assign({}, remote.settings || {}, local.settings || {})
    });
  }

  function valueSignature(value) {
    try { return JSON.stringify(value == null ? null : value); } catch (_) { return String(value); }
  }

  function sameValue(left, right) {
    return valueSignature(left) === valueSignature(right);
  }

  function mergeEntityListsThreeWay(base, remote, local, normalizer, entityType, conflicts) {
    var baseMap = new Map((base || []).map(function (item) { item = normalizer(item); return [item.id, item]; }));
    var remoteMap = new Map((remote || []).map(function (item) { item = normalizer(item); return [item.id, item]; }));
    var localMap = new Map((local || []).map(function (item) { item = normalizer(item); return [item.id, item]; }));
    var ids = new Set(Array.from(baseMap.keys()).concat(Array.from(remoteMap.keys()), Array.from(localMap.keys())));
    var localPreferred = [];
    var remotePreferred = [];
    ids.forEach(function (id) {
      var baseItem = baseMap.get(id) || null;
      var remoteItem = remoteMap.get(id) || null;
      var localItem = localMap.get(id) || null;
      var remoteChanged = !sameValue(remoteItem, baseItem);
      var localChanged = !sameValue(localItem, baseItem);
      var conflict = remoteChanged && localChanged && !sameValue(remoteItem, localItem);
      if (conflict) {
        conflicts.push({
          entityType: entityType,
          entityId: id,
          title: string((localItem && localItem.title) || (remoteItem && remoteItem.title) || id)
        });
      }
      var safeItem = localChanged ? localItem : remoteItem;
      var localChoice = conflict ? localItem : safeItem;
      var remoteChoice = conflict ? remoteItem : safeItem;
      if (localChoice) localPreferred.push(localChoice);
      if (remoteChoice) remotePreferred.push(remoteChoice);
    });
    return { local: localPreferred, remote: remotePreferred };
  }

  function threeWayMergeData(base, remote, local) {
    base = normalizeData(base || {});
    remote = normalizeData(remote || {});
    local = normalizeData(local || {});
    var conflicts = [];
    var projects = mergeEntityListsThreeWay(base.projects, remote.projects, local.projects, normalizeProject, 'project', conflicts);
    var tests = mergeEntityListsThreeWay(base.tests, remote.tests, local.tests, normalizeTest, 'test', conflicts);
    var pages = mergeEntityListsThreeWay(base.pages, remote.pages, local.pages, normalizePage, 'page', conflicts);
    var remoteSettingsChanged = !sameValue(remote.settings, base.settings);
    var localSettingsChanged = !sameValue(local.settings, base.settings);
    var settingsConflict = remoteSettingsChanged && localSettingsChanged && !sameValue(remote.settings, local.settings);
    if (settingsConflict) conflicts.push({ entityType: 'settings', entityId: 'settings', title: 'Настройки отдела' });
    var safeSettings = localSettingsChanged ? local.settings : remote.settings;
    var common = {
      updatedAt: timestamp(local.updatedAt) >= timestamp(remote.updatedAt) ? local.updatedAt : remote.updatedAt,
      activity: mergeEntities(remote.activity, local.activity, normalizeActivity).sort(function (a, b) { return timestamp(b.createdAt) - timestamp(a.createdAt); }).slice(0, ACTIVITY_LIMIT)
    };
    return {
      conflicts: conflicts,
      serverData: remote,
      localData: normalizeData(Object.assign({}, common, {
        projects: projects.local,
        tests: tests.local,
        pages: pages.local,
        settings: settingsConflict ? local.settings : safeSettings
      })),
      remoteData: normalizeData(Object.assign({}, common, {
        projects: projects.remote,
        tests: tests.remote,
        pages: pages.remote,
        settings: settingsConflict ? remote.settings : safeSettings
      }))
    };
  }

  function registerSyncConflict(result, revision) {
    syncConflicts = (result && result.conflicts) || [];
    pendingConflict = {
      localData: clone(result.localData),
      remoteData: clone(result.remoteData),
      serverData: clone(result.serverData),
      remoteRevision: number(revision)
    };
    queueLocalBackup('Перед разрешением конфликта синхронизации', true, data);
    syncState = 'error';
    syncMessage = 'Конфликт изменений: ' + syncConflicts.length;
    renderDesigners();
  }

  function resolveSyncConflict(preferLocal) {
    if (!ensureEditor() || !pendingConflict) return false;
    var resolution = pendingConflict;
    data = normalizeData(preferLocal ? resolution.localData : resolution.remoteData);
    lastSyncedData = normalizeData(resolution.serverData);
    remoteRevision = number(resolution.remoteRevision);
    syncConflicts = [];
    pendingConflict = null;
    appendActivity(preferLocal ? 'Конфликт разрешён в пользу локальной версии' : 'Конфликт разрешён в пользу командной версии', {
      action: preferLocal ? 'workspace.conflict.local' : 'workspace.conflict.remote'
    });
    data.updatedAt = nowIso();
    lastCommittedData = clone(data);
    writeLocal(true);
    scheduleSync(50);
    renderDesigners();
    return true;
  }

  function currentActor() {
    var access = window.alteaPortalAccess && typeof window.alteaPortalAccess.get === 'function'
      ? window.alteaPortalAccess.get()
      : window.__ALTEA_PORTAL_ACCESS__;
    var session = window.alteaPortalAuthGate && typeof window.alteaPortalAuthGate.getSession === 'function'
      ? window.alteaPortalAuthGate.getSession()
      : window.__ALTEA_AUTH_SESSION__;
    return string(access && (access.name || access.email)) || string(session && session.user && session.user.email) || 'Локальный пользователь';
  }

  function canEdit() { return workspaceAccess === 'editor' || workspaceAccess === 'local'; }

  function ensureEditor() {
    if (canEdit()) return true;
    showToast(workspaceAccess === 'viewer' ? 'Режим просмотра: изменения недоступны' : 'Нет прав редактора рабочей базы');
    return false;
  }

  function appConfig() {
    try {
      if (typeof window.currentConfig === 'function') return window.currentConfig() || {};
    } catch (_) {}
    return window.APP_CONFIG || {};
  }

  function remoteConfig() {
    var cfg = appConfig();
    var supabase = cfg.supabase || {};
    var baseUrl = string(supabase.url).replace(/\/+$/, '');
    var anonKey = string(supabase.anonKey);
    var session = window.alteaPortalAuthGate && typeof window.alteaPortalAuthGate.getSession === 'function'
      ? window.alteaPortalAuthGate.getSession()
      : window.__ALTEA_AUTH_SESSION__;
    var token = string(session && session.access_token) || string(window.__alteaAppState && window.__alteaAppState.team && window.__alteaAppState.team.accessToken);
    var brand = string(cfg.brand) || 'Алтея';
    return baseUrl && anonKey ? { baseUrl: baseUrl, anonKey: anonKey, token: token, brand: brand } : null;
  }

  function remoteHeaders(cfg) {
    return { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.token, Accept: 'application/json' };
  }

  function withTimeout(promise, timeoutMs, message) {
    var timer = 0;
    return Promise.race([
      Promise.resolve(promise),
      new Promise(function (_, reject) {
        timer = window.setTimeout(function () { reject(new Error(message)); }, timeoutMs);
      })
    ]).finally(function () {
      if (timer) window.clearTimeout(timer);
    });
  }

  async function fetchRemoteRequest(url, options, timeoutMessage) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, REMOTE_REQUEST_TIMEOUT_MS) : 0;
    var requestOptions = Object.assign({}, options || {});
    if (controller) requestOptions.signal = controller.signal;
    try {
      return await fetch(url, requestOptions);
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error(timeoutMessage || 'Командная база не ответила вовремя');
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function fetchMembership() {
    var cfg = remoteConfig();
    if (!cfg || !cfg.token || typeof fetch !== 'function') return { level: 'local', message: 'Локальный режим' };
    var url = new URL(cfg.baseUrl + '/rest/v1/' + REMOTE_MEMBERS_TABLE);
    url.searchParams.set('select', 'access_level');
    url.searchParams.set('brand', 'eq.' + cfg.brand);
    url.searchParams.set('limit', '1');
    var response = await fetchRemoteRequest(url.toString(), { headers: remoteHeaders(cfg) }, 'Проверка доступа заняла слишком много времени');
    if (response.status === 404) return { level: 'setup', message: 'Командная база ожидает настройки' };
    if (!response.ok) return { level: 'none', message: response.status === 401 ? 'Сессия доступа истекла' : 'Не удалось проверить роль' };
    var rows = await response.json();
    var level = rows && rows[0] && rows[0].access_level;
    if (level === 'editor') return { level: 'editor', message: 'Редактор командной базы' };
    if (level === 'viewer') return { level: 'viewer', message: 'Только просмотр' };
    return { level: 'none', message: 'Нет доступа к базе дизайн-отдела' };
  }

  async function fetchRemoteHistory() {
    var cfg = remoteConfig();
    if (!cfg || !cfg.token || typeof fetch !== 'function') return [];
    var url = new URL(cfg.baseUrl + '/rest/v1/' + REMOTE_HISTORY_TABLE);
    url.searchParams.set('select', 'revision,changed_at,change_summary,changed_by');
    url.searchParams.set('brand', 'eq.' + cfg.brand);
    url.searchParams.set('order', 'revision.desc');
    url.searchParams.set('limit', '50');
    var response = await fetchRemoteRequest(url.toString(), { headers: remoteHeaders(cfg) }, 'История версий не ответила вовремя');
    if (response.status === 404) return [];
    if (!response.ok) throw new Error('История версий недоступна');
    return await response.json();
  }

  async function fetchRemoteAudit() {
    var cfg = remoteConfig();
    if (!cfg || !cfg.token || typeof fetch !== 'function') return [];
    var url = new URL(cfg.baseUrl + '/rest/v1/' + REMOTE_AUDIT_TABLE);
    url.searchParams.set('select', 'id,revision,event_type,summary,created_at,actor_id,actor_email');
    url.searchParams.set('brand', 'eq.' + cfg.brand);
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', '100');
    var response = await fetchRemoteRequest(url.toString(), { headers: remoteHeaders(cfg) }, 'Серверный аудит не ответил вовремя');
    if (response.status === 404) return [];
    if (!response.ok) throw new Error('Серверный аудит недоступен');
    return await response.json();
  }

  async function fetchRemote() {
    var cfg = remoteConfig();
    if (!cfg || !cfg.token || typeof fetch !== 'function') return null;
    var url = new URL(cfg.baseUrl + '/rest/v1/' + REMOTE_TABLE);
    url.searchParams.set('select', 'payload,revision,updated_at');
    url.searchParams.set('brand', 'eq.' + cfg.brand);
    url.searchParams.set('limit', '1');
    var response = await fetchRemoteRequest(url.toString(), {
      headers: remoteHeaders(cfg)
    }, 'Командная база не ответила вовремя');
    if (!response.ok) throw new Error(response.status === 404 ? 'Закрытая база дизайнеров ещё не настроена' : 'Общий контур вернул ' + response.status);
    var rows = await response.json();
    if (!rows || !rows[0]) return { payload: null, revision: 0 };
    return { payload: rows[0].payload || null, revision: number(rows[0].revision), updatedAt: rows[0].updated_at || '' };
  }

  async function pushRemote(payload, expectedRevision) {
    var cfg = remoteConfig();
    if (!cfg || !cfg.token || typeof fetch !== 'function') return false;
    var url = new URL(cfg.baseUrl + '/rest/v1/rpc/' + REMOTE_SAVE_RPC);
    var response = await fetchRemoteRequest(url.toString(), {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.token,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_brand: cfg.brand,
        p_payload: payload,
        p_payload_hash: hashText(JSON.stringify(payload)),
        p_expected_revision: Math.max(0, number(expectedRevision))
      })
    }, 'Командная база не подтвердила сохранение вовремя');
    var result = null;
    try { result = await response.json(); } catch (_) {}
    if (!response.ok) {
      var detail = string(result && (result.message || result.details || result.hint));
      var error = new Error(/revision_conflict/i.test(detail) ? 'revision_conflict' : ('Синхронизация вернула ' + response.status + (detail ? ' · ' + detail : '')));
      error.code = /revision_conflict/i.test(detail) ? 'revision_conflict' : 'remote_write_failed';
      throw error;
    }
    var row = Array.isArray(result) ? result[0] : result;
    return { revision: number(row && row.revision) || Math.max(1, number(expectedRevision) + 1), updatedAt: row && row.updated_at };
  }

  async function loadSeed() {
    if (typeof fetch !== 'function') return null;
    try {
      var response = await fetchRemoteRequest(SEED_PATH, { cache: 'no-store' }, 'Начальные данные не загрузились вовремя');
      if (!response.ok) return null;
      return await response.json();
    } catch (_) { return null; }
  }

  async function loadWorkspace() {
    if (loadStarted) return;
    loadStarted = true;
    syncState = 'pending';
    syncMessage = 'Загружаем рабочее пространство';
    renderDesigners();
    try {
      var results = await Promise.allSettled([
        loadSeed(),
        fetchRemote(),
        withTimeout(readIndexed(), LOCAL_READ_TIMEOUT_MS, 'Локальная копия не ответила вовремя'),
        fetchMembership(),
        fetchRemoteHistory(),
        withTimeout(readIndexedBackups(), LOCAL_READ_TIMEOUT_MS, 'Резервные копии не ответили вовремя'),
        fetchRemoteAudit()
      ]);
      var seed = results[0].status === 'fulfilled' ? results[0].value : null;
      var remote = results[1].status === 'fulfilled' ? results[1].value : null;
      var remoteRequestFailed = results[1].status === 'rejected';
      remoteLoadError = remoteRequestFailed
        ? string(results[1].reason && results[1].reason.message) || 'Не удалось получить командные данные'
        : '';
      var indexed = results[2].status === 'fulfilled' ? results[2].value : null;
      var membership = results[3].status === 'fulfilled' ? results[3].value : { level: 'none', message: 'Не удалось проверить права доступа' };
      remoteHistory = results[4].status === 'fulfilled' ? (results[4].value || []) : [];
      localBackups = results[5].status === 'fulfilled' ? (results[5].value || []) : [];
      remoteAudit = results[6].status === 'fulfilled' ? (results[6].value || []) : [];
      workspaceAccess = membership.level;
      workspaceAccessMessage = membership.message;
      var hasPersistedSyncBase = Boolean(cache.lastSyncedData);
      if (seed) data = mergeData(seed, data);
      if (indexed && indexed.data) {
        if (timestamp(indexed.data.updatedAt) >= timestamp(data.updatedAt)) data = normalizeData(indexed.data);
        cache.dirty = cache.dirty || indexed.dirty === true;
        if (indexed.lastSyncedData) {
          lastSyncedData = normalizeData(indexed.lastSyncedData);
          hasPersistedSyncBase = true;
        }
      }
      if (remote && remote.payload) {
        remoteRevision = number(remote.revision);
        if (workspaceAccess === 'viewer' || !cache.dirty) {
          data = normalizeData(remote.payload);
          lastSyncedData = normalizeData(remote.payload);
        } else if (!hasPersistedSyncBase) {
          // Legacy dirty caches did not retain their common ancestor. Preserve
          // local work and use the current server state as the safest baseline.
          lastSyncedData = normalizeData(remote.payload);
        }
      } else {
        if (!hasPersistedSyncBase) lastSyncedData = normalizeData(FALLBACK_DATA);
      }
      // A transient remote error must never replace a previously synced viewer
      // snapshot with the intentionally sparse public seed.
      if (workspaceAccess === 'viewer' && !remoteRequestFailed && (!remote || !remote.payload)) data = normalizeData(seed || FALLBACK_DATA);
      if (workspaceAccess === 'none') {
        data = normalizeData(seed || FALLBACK_DATA);
        localBackups = [];
        remoteHistory = [];
        remoteAudit = [];
        await purgeScopedLocalData();
      }
      if (!canEdit()) cache.dirty = false;
      lastCommittedData = clone(data);
      if (localBackups[0]) lastBackupAt = timestamp(localBackups[0].createdAt);
      writeLocal(cache.dirty);
      if (workspaceAccess === 'editor') {
        syncState = remoteRequestFailed ? 'error' : (remote && remote.payload ? (cache.dirty ? 'pending' : 'ok') : 'pending');
        syncMessage = remoteRequestFailed ? remoteLoadError : (remote && remote.payload ? (cache.dirty ? 'Нужно отправить локальные изменения' : 'Командная база подключена · редактор') : 'Редактор · создаём общую базу');
      } else if (workspaceAccess === 'viewer') {
        syncState = remoteRequestFailed ? 'error' : 'ok';
        syncMessage = remoteRequestFailed ? remoteLoadError : 'Командная база · только просмотр';
      } else if (workspaceAccess === 'local') {
        syncState = 'local';
        syncMessage = 'Локальный режим';
      } else {
        syncState = 'error';
        syncMessage = workspaceAccessMessage;
      }
    } catch (error) {
      syncState = 'error';
      syncMessage = error && error.message ? error.message : 'Синхронизация недоступна';
    } finally {
      loadFinished = true;
      renderDesigners();
      if (cache.dirty && workspaceAccess === 'editor') scheduleSync(400);
    }
  }

  function scheduleSync(delay) {
    if (syncTimer) window.clearTimeout(syncTimer);
    if (workspaceAccess !== 'editor') {
      syncState = workspaceAccess === 'local' ? 'local' : (workspaceAccess === 'viewer' ? 'ok' : 'error');
      syncMessage = workspaceAccess === 'local' ? 'Сохранено на устройстве' : workspaceAccessMessage;
      return;
    }
    syncState = remoteConfig() && remoteConfig().token ? 'pending' : (localPersistState === 'error' ? 'error' : 'local');
    syncMessage = syncState === 'pending' ? 'Сохраняем изменения' : (syncState === 'error' ? 'Не удалось сохранить на устройстве' : 'Сохраняем на устройстве');
    syncTimer = window.setTimeout(function () {
      syncTimer = 0;
      syncRemote();
    }, delay == null ? 650 : delay);
  }

  async function syncRemote(force) {
    var cfg = remoteConfig();
    if (!cfg || !cfg.token) {
      syncState = 'local';
      syncMessage = 'Сохранено на устройстве';
      renderDesigners();
      return false;
    }
    remoteLoadError = '';
    if (workspaceAccess === 'viewer') {
      syncState = 'pending';
      syncMessage = 'Обновляем командную базу';
      renderDesigners();
      try {
        var viewerRemote = await fetchRemote();
        if (viewerRemote && viewerRemote.payload) data = normalizeData(viewerRemote.payload);
        remoteRevision = viewerRemote ? number(viewerRemote.revision) : 0;
        lastSyncedData = viewerRemote && viewerRemote.payload ? normalizeData(viewerRemote.payload) : normalizeData(FALLBACK_DATA);
        remoteHistory = await fetchRemoteHistory().catch(function () { return remoteHistory; });
        remoteAudit = await fetchRemoteAudit().catch(function () { return remoteAudit; });
        syncConflicts = [];
        pendingConflict = null;
        lastCommittedData = clone(data);
        await writeLocal(false);
        syncState = 'ok';
        syncMessage = 'Командная база обновлена · только просмотр';
        renderDesigners();
        return true;
      } catch (viewerError) {
        syncState = 'error';
        syncMessage = viewerError && viewerError.message ? viewerError.message : 'Обновление недоступно';
        remoteLoadError = syncMessage;
        renderDesigners();
        return false;
      }
    }
    if (workspaceAccess !== 'editor') {
      syncState = 'error';
      syncMessage = workspaceAccessMessage;
      renderDesigners();
      return false;
    }
    syncState = 'pending';
    syncMessage = force ? 'Обновляем командную базу' : 'Сохраняем изменения';
    renderDesigners();
    try {
      var hasLocalChanges = cache.dirty === true;
      var remote = await fetchRemote();
      remoteRevision = remote ? number(remote.revision) : 0;
      if (!hasLocalChanges && (!remote || !remote.payload)) {
        remoteHistory = await fetchRemoteHistory().catch(function () { return remoteHistory; });
        remoteAudit = await fetchRemoteAudit().catch(function () { return remoteAudit; });
        syncConflicts = [];
        pendingConflict = null;
        syncState = 'ok';
        syncMessage = 'Редактор · общая база ещё не создана';
        renderDesigners();
        return true;
      }
      var serverData = remote && remote.payload ? normalizeData(remote.payload) : normalizeData(FALLBACK_DATA);
      if (!hasLocalChanges) {
        data = serverData;
        lastSyncedData = clone(serverData);
        lastCommittedData = clone(data);
        remoteHistory = await fetchRemoteHistory().catch(function () { return remoteHistory; });
        remoteAudit = await fetchRemoteAudit().catch(function () { return remoteAudit; });
        syncConflicts = [];
        pendingConflict = null;
        await writeLocal(false);
        syncState = 'ok';
        syncMessage = 'Командная база обновлена';
        renderDesigners();
        return true;
      }
      var mergeResult = threeWayMergeData(lastSyncedData, serverData, data);
      if (mergeResult.conflicts.length) {
        registerSyncConflict(mergeResult, remoteRevision);
        return false;
      }
      data = mergeResult.localData;
      data.updatedAt = nowIso();
      var pushed;
      try {
        pushed = await pushRemote(data, remoteRevision);
      } catch (error) {
        if (!error || error.code !== 'revision_conflict') throw error;
        var latest = await fetchRemote();
        var latestServerData = latest && latest.payload ? normalizeData(latest.payload) : normalizeData(FALLBACK_DATA);
        var retryMerge = threeWayMergeData(serverData, latestServerData, data);
        remoteRevision = latest ? number(latest.revision) : 0;
        if (retryMerge.conflicts.length) {
          registerSyncConflict(retryMerge, remoteRevision);
          return false;
        }
        data = retryMerge.localData;
        data.updatedAt = nowIso();
        pushed = await pushRemote(data, remoteRevision);
      }
      remoteRevision = pushed ? number(pushed.revision) : remoteRevision;
      remoteHistory = await fetchRemoteHistory().catch(function () { return remoteHistory; });
      remoteAudit = await fetchRemoteAudit().catch(function () { return remoteAudit; });
      syncConflicts = [];
      pendingConflict = null;
      lastSyncedData = clone(data);
      lastCommittedData = clone(data);
      await writeLocal(false);
      syncState = 'ok';
      syncMessage = 'Все изменения синхронизированы';
      renderDesigners();
      return true;
    } catch (error) {
      writeLocal(true);
      syncState = 'error';
      syncMessage = 'Сохранено локально · ' + (error && error.message ? error.message : 'синк недоступен');
      remoteLoadError = error && error.message ? error.message : 'Синхронизация недоступна';
      renderDesigners();
      return false;
    }
  }

  function appendActivity(message, meta) {
    meta = meta || {};
    data.activity = [normalizeActivity({
      id: uid('design-event'),
      action: meta.action || 'change',
      summary: message || 'Рабочее пространство изменено',
      entityType: meta.entityType,
      entityId: meta.entityId,
      actor: currentActor(),
      createdAt: nowIso()
    })].concat(data.activity || []).slice(0, ACTIVITY_LIMIT);
  }

  function mutate(message, meta) {
    if (!canEdit()) {
      data = normalizeData(lastCommittedData || FALLBACK_DATA);
      ensureEditor();
      renderDesigners();
      return false;
    }
    queueLocalBackup('До изменения: ' + (message || 'рабочая база'), false, lastCommittedData);
    appendActivity(message, meta);
    data.updatedAt = nowIso();
    writeLocal(true);
    scheduleSync();
    lastCommittedData = clone(data);
    renderDesigners();
    if (message) showToast(message);
    return true;
  }

  function typeLabel(type) {
    var found = TYPES.find(function (item) { return item[0] === type; });
    return found ? found[1] : 'Другое';
  }

  function kindLabel(kind) {
    var found = PAGE_KINDS.find(function (item) { return item[0] === kind; });
    return found ? found[1] : 'Страница';
  }

  function statusFromText(value) {
    var raw = string(value).toLowerCase();
    if (/готов|done|complete|опублик|approved|согласован/.test(raw)) return 'done';
    if (/ревью|review|провер|согласован/.test(raw)) return 'review';
    if (/работ|progress|doing|production|дизайн/.test(raw)) return 'production';
    if (/бриф|brief|тз|technical/.test(raw)) return 'brief';
    return 'inbox';
  }

  function testStatusFromText(value) {
    var raw = string(value).toLowerCase();
    if (/заверш|complete|done|finished/.test(raw)) return 'complete';
    if (/анализ|analysis|result|итог/.test(raw)) return 'analysis';
    if (/идет|идёт|running|active|запущ/.test(raw)) return 'running';
    return 'planned';
  }

  function ratio(numerator, denominator) {
    var top = number(numerator);
    var bottom = number(denominator);
    return bottom > 0 ? top / bottom : null;
  }

  function formatPct(value, digits) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { style: 'percent', minimumFractionDigits: digits == null ? 1 : digits, maximumFractionDigits: digits == null ? 1 : digits }).format(Number(value));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(number(value));
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(number(value));
  }

  function normalCdf(value) {
    var sign = value < 0 ? -1 : 1;
    var x = Math.abs(value) / Math.sqrt(2);
    var t = 1 / (1 + .3275911 * x);
    var erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
    return .5 * (1 + sign * erf);
  }

  function significance(successA, totalA, successB, totalB) {
    successA = number(successA); totalA = number(totalA); successB = number(successB); totalB = number(totalB);
    if (totalA < 100 || totalB < 100 || successA > totalA || successB > totalB) return { significant: false, pValue: null, reason: 'Нужно минимум 100 кликов на вариант' };
    var pooled = (successA + successB) / (totalA + totalB);
    var variance = pooled * (1 - pooled) * (1 / totalA + 1 / totalB);
    if (variance <= 0) return { significant: false, pValue: null, reason: 'Недостаточно вариативности данных' };
    var z = (successB / totalB - successA / totalA) / Math.sqrt(variance);
    var pValue = 2 * (1 - normalCdf(Math.abs(z)));
    return { significant: pValue < .05, pValue: pValue, zScore: z, reason: pValue < .05 ? '' : 'Разница статистически не подтверждена' };
  }

  function validateVariantFunnel(variant, label) {
    var views = number(variant && variant.views);
    var clicks = number(variant && variant.clicks);
    var carts = number(variant && variant.carts);
    var orders = number(variant && variant.orders);
    if (clicks > views) return label + ': клики не могут превышать показы';
    if (carts > clicks) return label + ': добавления в корзину не могут превышать клики';
    if (orders > clicks) return label + ': заказы не могут превышать клики';
    if (carts > 0 && orders > carts) return label + ': заказы не могут превышать добавления в корзину';
    return '';
  }

  function validateTest(test) {
    return validateVariantFunnel(test && test.control, 'Контроль A') || validateVariantFunnel(test && test.variant, 'Вариант B');
  }

  function testMetrics(test) {
    var control = test.control || normalizeVariant({}, 'Контроль A');
    var variant = test.variant || normalizeVariant({}, 'Вариант B');
    var controlCtr = ratio(control.clicks, control.views);
    var variantCtr = ratio(variant.clicks, variant.views);
    var controlCr = ratio(control.orders, control.clicks);
    var variantCr = ratio(variant.orders, variant.clicks);
    var controlViewCr = ratio(control.orders, control.views);
    var variantViewCr = ratio(variant.orders, variant.views);
    var crUplift = controlCr && variantCr != null ? (variantCr - controlCr) / controlCr : null;
    var ctrUplift = controlCtr && variantCtr != null ? (variantCtr - controlCtr) / controlCtr : null;
    var revenueUplift = control.revenue > 0 ? (variant.revenue - control.revenue) / control.revenue : null;
    var confidence = significance(control.orders, control.clicks, variant.orders, variant.clicks);
    return {
      controlCtr: controlCtr,
      variantCtr: variantCtr,
      controlCr: controlCr,
      variantCr: variantCr,
      controlViewCr: controlViewCr,
      variantViewCr: variantViewCr,
      crUplift: crUplift,
      ctrUplift: ctrUplift,
      revenueUplift: revenueUplift,
      significant: confidence.significant,
      pValue: confidence.pValue,
      significanceReason: confidence.reason
    };
  }

  function inferredWinner(test) {
    if (test.winner) return test.winner;
    var metrics = testMetrics(test);
    if (metrics.variantCr == null || metrics.controlCr == null) return '';
    if (!metrics.significant) return 'inconclusive';
    if (Math.abs(metrics.variantCr - metrics.controlCr) < .0001) return 'inconclusive';
    return metrics.variantCr > metrics.controlCr ? 'variant' : 'control';
  }

  function priorityFromText(value) {
    var raw = string(value).toLowerCase();
    if (/high|urgent|высок|сроч|крит/.test(raw)) return 'high';
    if (/low|низк/.test(raw)) return 'low';
    return 'normal';
  }

  function typeFromText(value) {
    var raw = string(value).toLowerCase();
    if (/rich|рич/.test(raw)) return 'rich';
    if (/карточ|market|wb|ozon/.test(raw)) return 'card';
    if (/соц|social|smm|stories|пост/.test(raw)) return 'social';
    if (/презент|presentation|deck/.test(raw)) return 'presentation';
    if (/упаков|package|этикет/.test(raw)) return 'package';
    if (/фото|photo|ретуш/.test(raw)) return 'photo';
    if (/бренд|brand|logo|логотип/.test(raw)) return 'brand';
    return 'other';
  }

  function formatDate(value) {
    var raw = normalizeDate(value);
    if (!raw) return 'без срока';
    try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(raw + 'T12:00:00')); }
    catch (_) { return raw; }
  }

  function formatDateTime(value) {
    var parsed = timestamp(value);
    if (!parsed) return 'дата не указана';
    try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(parsed)); }
    catch (_) { return string(value); }
  }

  function isOverdue(project) {
    if (!project.dueDate || project.status === 'done') return false;
    return project.dueDate < new Date().toISOString().slice(0, 10);
  }

  function isDueSoon(project) {
    if (!project.dueDate || project.status === 'done') return false;
    var due = new Date(project.dueDate + 'T23:59:59').getTime();
    var diff = due - Date.now();
    return diff >= 0 && diff <= 3 * 86400000;
  }

  function activeProjects() {
    return data.projects.filter(function (item) { return !item.archived; });
  }

  function activeTests() {
    return data.tests.filter(function (item) { return !item.archived; });
  }

  function filteredProjects() {
    var search = string(ui.search).toLowerCase();
    return activeProjects().filter(function (project) {
      if (ui.status === 'active' && project.status === 'done') return false;
      if (ui.status === 'done' && project.status !== 'done') return false;
      if (ui.status !== 'all' && ui.status !== 'active' && ui.status !== 'done' && project.status !== ui.status) return false;
      if (ui.owner !== 'all' && project.owner !== ui.owner) return false;
      if (ui.type !== 'all' && project.type !== ui.type) return false;
      if (ui.deadline === 'urgent' && !isOverdue(project) && !isDueSoon(project)) return false;
      if (ui.deadline === 'overdue' && !isOverdue(project)) return false;
      if (ui.deadline === 'week') {
        var dueAt = project.dueDate ? new Date(project.dueDate + 'T23:59:59').getTime() : 0;
        var weekDiff = dueAt - Date.now();
        if (project.status === 'done' || weekDiff < 0 || weekDiff > 7 * 86400000) return false;
      }
      if (ui.deadline === 'no_date' && project.dueDate) return false;
      if (!search) return true;
      var haystack = [project.title, project.owner, project.marketplace, project.brief, typeLabel(project.type)].concat(project.tags || []).join(' ').toLowerCase();
      return haystack.indexOf(search) !== -1;
    }).sort(function (a, b) {
      if (a.status !== b.status) return Object.keys(STATUS).indexOf(a.status) - Object.keys(STATUS).indexOf(b.status);
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return timestamp(b.updatedAt) - timestamp(a.updatedAt);
    });
  }

  function filteredTests() {
    var search = string(ui.testSearch).toLowerCase();
    return activeTests().filter(function (test) {
      if (ui.testStatus !== 'all' && test.status !== ui.testStatus) return false;
      if (ui.testOwner !== 'all' && test.owner !== ui.testOwner) return false;
      if (!search) return true;
      var haystack = [test.title, test.sku, test.marketplace, test.owner, test.hypothesis, test.conclusion, test.decision]
        .concat(test.tags || []).join(' ').toLowerCase();
      return haystack.indexOf(search) !== -1;
    }).sort(function (a, b) { return timestamp(b.updatedAt) - timestamp(a.updatedAt); });
  }

  function activePages() {
    return data.pages.filter(function (page) { return !page.archived; });
  }

  function filteredPages() {
    var search = string(ui.knowledgeSearch).toLowerCase();
    return activePages().filter(function (page) {
      if (ui.knowledgeCategory !== 'all' && page.category !== ui.knowledgeCategory) return false;
      if (!search) return true;
      var haystack = [page.title, page.category, page.summary, page.content, page.owner, kindLabel(page.kind)].join(' ').toLowerCase();
      return haystack.indexOf(search) !== -1;
    }).sort(function (a, b) { return timestamp(b.updatedAt) - timestamp(a.updatedAt); });
  }

  function optionList(list, selected) {
    return list.map(function (item) {
      var value = Array.isArray(item) ? item[0] : item;
      var label = Array.isArray(item) ? item[1] : item;
      return '<option value="' + html(value) + '"' + (value === selected ? ' selected' : '') + '>' + html(label) + '</option>';
    }).join('');
  }

  function renderSummary() {
    var projects = activeProjects();
    var active = projects.filter(function (item) { return item.status !== 'done'; }).length;
    var review = projects.filter(function (item) { return item.status === 'review'; }).length;
    var urgent = projects.filter(function (item) { return isOverdue(item) || isDueSoon(item); }).length;
    var month = new Date().toISOString().slice(0, 7);
    var completed = projects.filter(function (item) { return item.status === 'done' && string(item.updatedAt).slice(0, 7) === month; }).length;
    var runningTests = activeTests().filter(function (item) { return item.status === 'running' || item.status === 'analysis'; }).length;
    var total = Math.max(1, projects.length);
    return '<div class="design-ws-summary" aria-label="Пульс дизайн-отдела">' + [
      ['active', 'Активные проекты', active, 'в производстве сейчас', '#8b6cff', Math.min(100, active / total * 100)],
      ['review', 'На ревью', review, 'нужно решение или правки', '#62a8ff', Math.min(100, review / total * 100)],
      ['urgent', 'Фокус по срокам', urgent, 'просрочено или ≤ 3 дней', '#ff776d', Math.min(100, urgent / total * 100)],
      ['tests', 'Тесты конверсии', runningTests, 'идут или на анализе', '#f0ad4e', Math.min(100, runningTests / Math.max(1, activeTests().length) * 100)],
      ['done', 'Готово за месяц', completed, 'результат команды', '#5ed0a0', Math.min(100, completed / total * 100)]
    ].map(function (metric) {
      return '<button type="button" class="design-ws-metric" data-design-focus="' + metric[0] + '" style="--metric:' + metric[4] + ';--metric-progress:' + metric[5] + '%"><span>' + html(metric[1]) + '</span><strong>' + metric[2] + '</strong><small>' + html(metric[3]) + '</small><i aria-hidden="true"></i></button>';
    }).join('') + '</div>';
  }

  function hasProjectFilters() {
    return Boolean(string(ui.search) || ui.status !== 'active' || ui.owner !== 'all' || ui.type !== 'all' || ui.deadline !== 'all');
  }

  function resetProjectFilters() {
    ui.search = '';
    ui.status = 'active';
    ui.owner = 'all';
    ui.type = 'all';
    ui.deadline = 'all';
    ui.projectPage = 1;
    writeUi();
    renderDesigners();
  }

  function applySummaryFocus(focus) {
    if (focus === 'tests') {
      ui.mode = 'tests';
    } else {
      ui.mode = 'board';
      ui.search = '';
      ui.owner = 'all';
      ui.type = 'all';
      ui.deadline = focus === 'urgent' ? 'urgent' : 'all';
      ui.status = focus === 'review' ? 'review' : (focus === 'done' ? 'done' : 'active');
    }
    ui.projectPage = 1;
    writeUi();
    renderDesigners();
  }

  function renderFilters() {
    var owners = Array.from(new Set(activeProjects().map(function (item) { return item.owner; }).filter(Boolean))).sort();
    return '<div class="design-ws-filter-row"><label class="design-ws-search"><span aria-hidden="true">⌕</span>' +
      '<input type="search" placeholder="Найти проект, SKU или тег…" value="' + html(ui.search) + '" data-design-search="search" data-design-search-page="projectPage" aria-label="Поиск по проектам"><kbd>/</kbd></label>' +
      '<select data-design-filter="status" data-design-filter-page="projectPage" aria-label="Статус">' + optionList([['active', 'Активные'], ['all', 'Все статусы'], ['inbox', 'Запросы'], ['brief', 'Бриф'], ['production', 'В работе'], ['review', 'На ревью'], ['done', 'Готово']], ui.status) + '</select>' +
      '<select data-design-filter="owner" data-design-filter-page="projectPage" aria-label="Ответственный"><option value="all">Все дизайнеры</option>' + optionList(owners, ui.owner) + '</select>' +
      '<select data-design-filter="type" data-design-filter-page="projectPage" aria-label="Тип проекта"><option value="all">Все типы</option>' + optionList(TYPES, ui.type) + '</select>' +
      '<select data-design-filter="deadline" data-design-filter-page="projectPage" aria-label="Срок"><option value="all">Любой срок</option>' + optionList([['urgent', 'Фокус ≤ 3 дней'], ['overdue', 'Просрочено'], ['week', 'Ближайшие 7 дней'], ['no_date', 'Без дедлайна']], ui.deadline) + '</select>' +
      (hasProjectFilters() ? '<button type="button" class="design-ws-filter-reset" data-design-reset-filters aria-label="Сбросить фильтры" title="Сбросить фильтры">Сбросить</button>' : '') +
      '</div>';
  }

  function ownerInitials(owner) {
    var parts = string(owner || 'Команда').split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || '—';
  }

  function dueMeta(project) {
    if (!project.dueDate) return { tone: 'neutral', label: 'Срок не задан' };
    if (project.status === 'done') return { tone: 'done', label: formatDate(project.dueDate) };
    if (isOverdue(project)) return { tone: 'danger', label: 'Просрочено · ' + formatDate(project.dueDate) };
    if (isDueSoon(project)) return { tone: 'warning', label: 'Скоро · ' + formatDate(project.dueDate) };
    return { tone: 'neutral', label: formatDate(project.dueDate) };
  }

  function renderTestFilters() {
    var owners = Array.from(new Set(activeTests().map(function (test) { return test.owner; }).filter(Boolean))).sort();
    return '<div class="design-ws-section-filters"><div class="design-ws-filter-row">' +
      '<input type="search" placeholder="Поиск по тестам, SKU и выводам" value="' + html(ui.testSearch) + '" data-design-search="testSearch" data-design-search-page="testPage" aria-label="Поиск по тестам">' +
      '<select data-design-filter="testStatus" data-design-filter-page="testPage" aria-label="Статус теста"><option value="all">Все статусы</option>' + optionList(Object.keys(TEST_STATUS).map(function (key) { return [key, TEST_STATUS[key].label]; }), ui.testStatus) + '</select>' +
      '<select data-design-filter="testOwner" data-design-filter-page="testPage" aria-label="Ответственный за тест"><option value="all">Все ответственные</option>' + optionList(owners, ui.testOwner) + '</select>' +
      '</div></div>';
  }

  function renderKnowledgeFilters() {
    var categories = Array.from(new Set(activePages().map(function (page) { return page.category; }).filter(Boolean))).sort();
    return '<div class="design-ws-section-filters"><div class="design-ws-filter-row">' +
      '<input type="search" placeholder="Поиск по базе знаний" value="' + html(ui.knowledgeSearch) + '" data-design-search="knowledgeSearch" data-design-search-page="knowledgePage" aria-label="Поиск по базе знаний">' +
      '<select data-design-filter="knowledgeCategory" data-design-filter-page="knowledgePage" aria-label="Категория базы знаний"><option value="all">Все категории</option>' + optionList(categories, ui.knowledgeCategory) + '</select>' +
      '</div></div>';
  }

  function renderCard(project) {
    var priority = PRIORITIES[project.priority] || PRIORITIES.normal;
    var due = dueMeta(project);
    var tags = (project.tags || []).slice(0, 2).map(function (tag) { return '<span class="design-ws-chip">' + html(tag) + '</span>'; }).join('');
    return '<article class="design-ws-card' + (isOverdue(project) ? ' is-overdue' : '') + '" draggable="true" tabindex="0" data-design-project="' + html(project.id) + '">' +
      '<div class="design-ws-card-kicker"><span>' + html(typeLabel(project.type)) + '</span><span class="design-ws-priority-label"><i class="design-ws-priority" style="--priority-color:' + priority.color + '"></i>' + html(priority.label) + '</span></div>' +
      '<h3>' + html(project.title) + '</h3>' +
      (project.brief ? '<p>' + html(project.brief.slice(0, 120)) + (project.brief.length > 120 ? '…' : '') + '</p>' : '<p>Откройте карточку, чтобы добавить бриф и ссылки.</p>') +
      '<div class="design-ws-card-context">' + (project.marketplace ? '<span>' + html(project.marketplace) + '</span>' : '') + tags + '</div>' +
      '<div class="design-ws-card-foot"><span class="design-ws-owner"><i aria-hidden="true">' + html(ownerInitials(project.owner)) + '</i><b>' + html(project.owner || 'Не назначен') + '</b></span><span class="design-ws-due ' + due.tone + '">' + html(due.label) + '</span>' +
      (project.url ? '<a class="design-ws-resource-link" href="' + html(project.url) + '" target="_blank" rel="noopener" data-design-resource-link aria-label="Открыть исходник" title="Открыть исходник">↗</a>' : '') + '</div>' +
      '</article>';
  }

  function renderBoard(projects) {
    return '<div class="design-ws-board-navigation"><div><strong>Этапы работы</strong><span>Листайте доску кнопками или горизонтальным жестом</span></div><div class="design-ws-board-navigation-actions"><button type="button" data-design-board-scroll="-1" aria-label="Предыдущие этапы" title="Прокрутить доску влево">←</button><button type="button" data-design-board-scroll="1" aria-label="Следующие этапы" title="Прокрутить доску вправо">→</button></div></div>' +
      '<div class="design-ws-board-wrap" data-design-board-scrollport tabindex="0" aria-label="Доска проектов: пять этапов, доступна горизонтальная прокрутка"><div class="design-ws-board">' + Object.keys(STATUS).map(function (key) {
      var meta = STATUS[key];
      var allRows = projects.filter(function (project) { return project.status === key; });
      var rows = allRows.slice(0, 20);
      var total = allRows.length;
      return '<section class="design-ws-column" data-design-drop-status="' + key + '">' +
        '<div class="design-ws-column-head"><div><div class="design-ws-column-title" style="--status-color:' + meta.color + '"><i></i><span>' + html(meta.label) + '</span></div><small>' + html(key === 'inbox' ? 'входящие задачи' : (key === 'brief' ? 'уточняем задачу' : (key === 'production' ? 'создаём макет' : (key === 'review' ? 'согласование' : 'результат')))) + '</small></div><div class="design-ws-column-head-actions"><span class="design-ws-count">' + total + '</span>' + (canEdit() ? '<button type="button" data-design-add-project-status="' + key + '" aria-label="Добавить проект в «' + html(meta.label) + '»" title="Добавить проект">+</button>' : '') + '</div></div>' +
        '<div class="design-ws-column-list">' + (rows.length ? rows.map(renderCard).join('') + (total > rows.length ? '<button type="button" class="design-ws-column-more" data-design-mode="table">Ещё ' + (total - rows.length) + ' · открыть таблицу</button>' : '') : '<button type="button" class="design-ws-empty design-ws-empty-action"' + (canEdit() ? ' data-design-add-project-status="' + key + '"' : ' disabled') + '><span aria-hidden="true">＋</span><strong>' + html(key === 'done' ? 'Здесь появится результат' : 'Пока пусто') + '</strong><p>' + html(canEdit() ? 'Добавить проект в этот этап' : 'Перетащите карточку сюда') + '</p></button>') + '</div>' +
        '</section>';
    }).join('') + '</div></div>';
  }

  function renderTable(projects) {
    if (!projects.length) return renderEmptyProjects();
    return '<div class="design-ws-table-wrap"><table class="design-ws-table"><thead><tr><th>Проект</th><th>Статус</th><th>Ответственный</th><th>Срок</th><th>Приоритет</th><th>Теги</th><th aria-label="Исходник"></th></tr></thead><tbody>' +
      projects.map(function (project) {
        var status = STATUS[project.status] || STATUS.inbox;
        var priority = PRIORITIES[project.priority] || PRIORITIES.normal;
        return '<tr data-design-project="' + html(project.id) + '"><td><strong>' + html(project.title) + '</strong><small>' + html(typeLabel(project.type)) + (project.marketplace ? ' · ' + html(project.marketplace) : '') + '</small></td>' +
          '<td><select class="design-ws-field" data-design-status="' + html(project.id) + '">' + optionList(Object.keys(STATUS).map(function (key) { return [key, STATUS[key].label]; }), project.status) + '</select></td>' +
          '<td><span class="design-ws-owner"><i aria-hidden="true">' + html(ownerInitials(project.owner)) + '</i><b>' + html(project.owner || '—') + '</b></span></td><td><span class="design-ws-due ' + dueMeta(project).tone + '">' + html(dueMeta(project).label) + '</span></td>' +
          '<td><span class="design-ws-chip" style="color:' + priority.color + '">' + html(priority.label) + '</span></td><td>' + html((project.tags || []).join(', ') || '—') + '</td><td>' + (project.url ? '<a class="design-ws-table-link" href="' + html(project.url) + '" target="_blank" rel="noopener" data-design-resource-link aria-label="Открыть исходник">↗</a>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderVariantPreview(variant, label) {
    return '<div class="design-test-variant"><div class="design-test-preview">' +
      (variant.imageUrl ? '<img src="' + html(variant.imageUrl) + '" alt="' + html(label) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '<span>' + html(label) + '<small>добавьте ссылку на макет или скриншот</small></span>') +
      '</div><strong>' + html(variant.name || label) + '</strong></div>';
  }

  function renderTestMetric(label, control, variant, formatter) {
    formatter = formatter || formatNumber;
    return '<div class="design-test-metric-row"><span>' + html(label) + '</span><strong>' + html(formatter(control)) + '</strong><strong>' + html(formatter(variant)) + '</strong></div>';
  }

  function renderTestCard(test) {
    var metrics = testMetrics(test);
    var status = TEST_STATUS[test.status] || TEST_STATUS.planned;
    var winner = inferredWinner(test);
    var uplift = metrics.crUplift;
    var upliftClass = uplift == null ? '' : (uplift >= 0 ? ' positive' : ' negative');
    var winnerLabel = winner === 'variant' ? 'Победил B' : (winner === 'control' ? 'Победил A' : (winner === 'inconclusive' ? 'Без победителя' : 'Нет вывода'));
    var confidenceLabel = test.winner ? 'Решение задано вручную' : (metrics.significant ? '95% значимость' : (metrics.significanceReason || 'Недостаточно данных'));
    var conclusion = string(test.conclusion);
    var decision = string(test.decision);
    var insight = conclusion || decision
      ? '<div class="design-test-insights">' +
        (conclusion ? '<div><span>Вывод</span><p>' + html(conclusion) + '</p></div>' : '') +
        (decision ? '<div><span>Следующий шаг</span><p>' + html(decision) + '</p></div>' : '') + '</div>'
      : (test.status === 'complete' ? '<div class="design-test-insights is-empty"><strong>Зафиксируйте вывод и следующий шаг</strong></div>' : '');
    return '<article class="design-test-card" tabindex="0" data-design-test="' + html(test.id) + '">' +
      '<div class="design-test-head"><div><span class="design-ws-chip" style="color:' + status.color + '">' + html(status.label) + '</span><h3>' + html(test.title) + '</h3><p>' + html([test.marketplace, test.sku ? 'SKU ' + test.sku : ''].filter(Boolean).join(' · ') || 'Площадка и SKU не указаны') + '</p></div>' +
      '<div class="design-test-result' + upliftClass + '"><strong>' + html(uplift == null ? '—' : ((uplift > 0 ? '+' : '') + formatPct(uplift))) + '</strong><span>uplift CR</span></div></div>' +
      (test.hypothesis ? '<div class="design-test-hypothesis"><span>Гипотеза</span>' + html(test.hypothesis) + '</div>' : '') +
      '<div class="design-test-previews">' + renderVariantPreview(test.control, 'Контроль A') + renderVariantPreview(test.variant, 'Вариант B') + '</div>' +
      '<div class="design-test-metrics"><div class="design-test-metric-row header"><span>Метрика</span><strong>A</strong><strong>B</strong></div>' +
      renderTestMetric('Показы', test.control.views, test.variant.views) +
      renderTestMetric('CTR', metrics.controlCtr, metrics.variantCtr, formatPct) +
      renderTestMetric('В корзину', test.control.carts, test.variant.carts) +
      renderTestMetric('Заказы', test.control.orders, test.variant.orders) +
      renderTestMetric('CR из клика', metrics.controlCr, metrics.variantCr, formatPct) +
      renderTestMetric('CR из показа', metrics.controlViewCr, metrics.variantViewCr, formatPct) +
      renderTestMetric('Выручка', test.control.revenue, test.variant.revenue, formatMoney) + '</div>' +
      insight +
      '<div class="design-test-foot"><span class="design-ws-chip">' + html(winnerLabel) + '</span><span class="design-ws-chip">' + html(confidenceLabel) + '</span><span>' + html(test.owner || 'ответственный не указан') + '</span><span>' + html(test.endDate ? 'до ' + formatDate(test.endDate) : 'период не задан') + '</span></div>' +
      '</article>';
  }

  function pageSlice(items, pageKey, pageSize) {
    var totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    var page = Math.min(totalPages, Math.max(1, number(ui[pageKey]) || 1));
    ui[pageKey] = page;
    return { items: items.slice((page - 1) * pageSize, page * pageSize), page: page, pageSize: pageSize, totalPages: totalPages, total: items.length };
  }

  function renderPager(pageKey, paged) {
    if (!paged || paged.totalPages <= 1) return '';
    return '<nav class="design-ws-pager" aria-label="Страницы"><span>' + html(((paged.page - 1) * paged.pageSize + 1) + '–' + Math.min(paged.total, paged.page * paged.pageSize) + ' из ' + paged.total) + '</span>' +
      '<div><button type="button" class="design-ws-btn" data-design-page-nav="' + html(pageKey) + '" data-design-page-value="' + (paged.page - 1) + '"' + (paged.page <= 1 ? ' disabled' : '') + '>←</button>' +
      '<strong>' + paged.page + ' / ' + paged.totalPages + '</strong>' +
      '<button type="button" class="design-ws-btn" data-design-page-nav="' + html(pageKey) + '" data-design-page-value="' + (paged.page + 1) + '"' + (paged.page >= paged.totalPages ? ' disabled' : '') + '>→</button></div></nav>';
  }

  function renderTests() {
    var allTests = activeTests();
    var tests = filteredTests();
    var paged = pageSlice(tests, 'testPage', TEST_PAGE_SIZE);
    return '<div class="design-ws-pages-head"><div><h3>Тесты конверсии</h3><p>История гипотез: что загрузили на маркетплейс, как выглядело и какой результат получили.</p></div><button type="button" class="design-ws-btn" data-design-import-test>Импорт метрик MP CSV</button></div>' +
      renderTestFilters() +
      (tests.length ? '<div class="design-tests-grid">' + paged.items.map(renderTestCard).join('') + '</div>' + renderPager('testPage', paged)
        : (allTests.length ? '<div class="design-ws-empty"><div><strong>Ничего не найдено</strong><p>Измените запрос или сбросьте фильтры тестов.</p><button type="button" class="design-ws-btn" data-design-clear-filters="tests" style="margin-top:14px">Сбросить фильтры</button></div></div>'
          : '<div class="design-ws-empty"><div><strong>Тестов пока нет</strong><p>Создайте гипотезу, добавьте визуалы A/B и зафиксируйте показатели маркетплейса до и после.</p><button type="button" class="design-ws-btn primary" data-design-add-test style="margin-top:14px">Создать тест</button></div></div>'));
  }

  function renderEmptyProjects() {
    return '<div class="design-ws-empty"><div><strong>Рабочая доска пока пустая</strong><p>Создайте первый проект или экспортируйте нужную database из Notion в CSV. Страницы и вложения автоматически не копируются.</p><button type="button" class="design-ws-btn primary" data-design-add-project style="margin-top:14px">Создать проект</button></div></div>';
  }

  function pageIcon(kind) {
    return ({ page: '◇', guide: '≡', brief: '✓', template: '▦', library: '◫', link: '↗' })[kind] || '◇';
  }

  function renderPages() {
    var allPages = activePages();
    var pages = filteredPages();
    var paged = pageSlice(pages, 'knowledgePage', KNOWLEDGE_PAGE_SIZE);
    return '<div class="design-ws-pages-head"><div><h3>База знаний</h3><p>Регламенты, брифы, шаблоны и решения отдела.</p></div></div>' +
      renderKnowledgeFilters() +
      (pages.length ? '<div class="design-ws-pages">' + paged.items.map(function (page) {
        return '<article class="design-ws-page" tabindex="0" data-design-page="' + html(page.id) + '"><span class="design-ws-page-icon">' + pageIcon(page.kind) + '</span><h4>' + html(page.title) + '</h4><p>' + html(page.summary || page.content.slice(0, 150) || 'Добавьте описание страницы.') + '</p><div class="design-ws-page-meta"><span class="design-ws-chip">' + html(page.category) + '</span><span class="design-ws-chip">' + html(page.status === 'draft' ? 'черновик' : kindLabel(page.kind)) + '</span>' + (page.url ? '<a class="design-ws-resource-link" href="' + html(page.url) + '" target="_blank" rel="noopener" data-design-resource-link aria-label="Открыть материал" title="Открыть материал">↗</a>' : '') + '</div></article>';
      }).join('') + '</div>' + renderPager('knowledgePage', paged)
        : (allPages.length ? '<div class="design-ws-empty"><div><strong>Ничего не найдено</strong><p>Измените запрос или сбросьте фильтры базы знаний.</p><button type="button" class="design-ws-btn" data-design-clear-filters="knowledge" style="margin-top:14px">Сбросить фильтры</button></div></div>'
          : '<div class="design-ws-empty"><div><strong>База знаний пустая</strong><p>Создайте регламент, бриф или ссылку на библиотеку.</p></div></div>'));
  }

  function renderArchiveRows(items, type, title) {
    return '<section class="design-ws-archive-section"><h3>' + html(title) + '<span>' + items.length + '</span></h3>' + (items.length ? '<div class="design-ws-archive-list">' + items.map(function (item) {
      return '<article><div><strong>' + html(item.title) + '</strong><small>' + html(item.owner || item.category || item.sku || 'без дополнительной информации') + '</small></div><button type="button" class="design-ws-btn" data-design-restore="' + html(type) + '" data-design-restore-id="' + html(item.id) + '">Восстановить</button></article>';
    }).join('') + '</div>' : '<p class="design-ws-muted">В этом разделе архив пуст.</p>') + '</section>';
  }

  function renderHistory() {
    var localRows = localBackups.slice(0, LOCAL_BACKUP_LIMIT);
    var activityRows = (data.activity || []).slice(0, 80);
    var auditRows = remoteAudit.slice(0, 100);
    return '<div class="design-ws-pages-head"><div><h3>История и резервные копии</h3><p>Командные версии создаются только при реальном изменении данных, локальные — автоматически перед изменениями.</p></div>' +
      '<div class="design-ws-head-actions"><button type="button" class="design-ws-btn" data-design-export>Экспорт JSON</button>' +
      (canEdit() ? '<button type="button" class="design-ws-btn" data-design-import-backup>Восстановить JSON</button><button type="button" class="design-ws-btn primary" data-design-backup>Создать копию</button>' : '') + '</div></div>' +
      '<div class="design-ws-history-grid"><section class="design-ws-history-panel"><div class="design-ws-history-title"><h3>Командные версии</h3><span>' + remoteHistory.length + '</span></div>' +
      (remoteHistory.length ? '<div class="design-ws-history-list">' + remoteHistory.map(function (item) {
        var revision = number(item.revision);
        return '<article><div><strong>Версия ' + revision + (revision === remoteRevision ? ' · текущая' : '') + '</strong><small>' + html(item.change_summary || 'Синхронизация рабочей базы') + ' · ' + html(formatDateTime(item.changed_at)) + '</small></div>' +
          (canEdit() && revision !== remoteRevision ? '<button type="button" class="design-ws-btn" data-design-restore-remote="' + revision + '">Восстановить</button>' : '') + '</article>';
      }).join('') + '</div>' : '<p class="design-ws-muted">Появятся после подключения миграции Supabase и первой синхронизации.</p>') + '</section>' +
      '<section class="design-ws-history-panel"><div class="design-ws-history-title"><h3>Локальные копии</h3><span>' + localRows.length + '</span></div>' +
      (localRows.length ? '<div class="design-ws-history-list">' + localRows.map(function (item) {
        return '<article><div><strong>' + html(formatDateTime(item.createdAt)) + '</strong><small>' + html(item.reason || 'Автоматическая резервная копия') + '</small></div>' +
          (canEdit() ? '<button type="button" class="design-ws-btn" data-design-restore-local="' + html(item.key) + '">Восстановить</button>' : '') + '</article>';
      }).join('') + '</div>' : '<p class="design-ws-muted">Копия будет создана автоматически перед первым изменением.</p>') + '</section></div>' +
      '<section class="design-ws-history-panel design-ws-activity"><div class="design-ws-history-title"><h3>Серверный аудит</h3><span>' + auditRows.length + '</span></div>' +
      (auditRows.length ? '<div class="design-ws-activity-list">' + auditRows.map(function (item) {
        var actor = string(item.actor_email) || (item.actor_id ? 'Пользователь ' + string(item.actor_id).slice(0, 8) : 'Системное действие');
        return '<article><i></i><div><strong>' + html(auditEventLabel(item.event_type) + ' · версия ' + number(item.revision)) + '</strong><small>' + html(item.summary || 'Изменение рабочей базы') + ' · ' + html(actor) + ' · ' + html(formatDateTime(item.created_at)) + '</small></div></article>';
      }).join('') + '</div>' : '<p class="design-ws-muted">Появится после применения миграции и первой серверной синхронизации.</p>') + '</section>' +
      '<section class="design-ws-history-panel design-ws-activity"><div class="design-ws-history-title"><h3>Локальная активность</h3><span>' + activityRows.length + '</span></div>' +
      (activityRows.length ? '<div class="design-ws-activity-list">' + activityRows.map(function (item) {
        return '<article><i></i><div><strong>' + html(item.summary) + '</strong><small>' + html(item.actor || 'Пользователь') + ' · ' + html(formatDateTime(item.createdAt)) + '</small></div></article>';
      }).join('') + '</div>' : '<p class="design-ws-muted">Новые изменения будут фиксироваться здесь.</p>') + '</section>';
  }

  function auditEventLabel(eventType) {
    return ({
      'workspace.create': 'Создание базы',
      'workspace.save': 'Сохранение',
      'workspace.restore': 'Восстановление',
      'workspace.conflict.local': 'Конфликт · локальная версия',
      'workspace.conflict.remote': 'Конфликт · командная версия'
    })[string(eventType)] || 'Изменение базы';
  }

  function renderArchive() {
    return '<div class="design-ws-pages-head"><div><h3>Архив</h3><p>Архивные материалы можно восстановить без потери данных.</p></div></div><div class="design-ws-archive">' +
      renderArchiveRows(data.projects.filter(function (item) { return item.archived; }), 'project', 'Проекты') +
      renderArchiveRows(data.tests.filter(function (item) { return item.archived; }), 'test', 'Тесты') +
      renderArchiveRows(data.pages.filter(function (item) { return item.archived; }), 'page', 'Страницы') + '</div>';
  }

  function renderDesignSystem() {
    var systemPages = data.pages.filter(function (page) {
      return !page.archived && /бренд|шаблон|референс/i.test(page.category + ' ' + page.title);
    });
    var links = systemPages.filter(function (page) { return page.url; });
    return '<div class="design-ws-system-grid">' +
      '<article class="design-ws-system-card wide"><h3>Основа бренда</h3><p>Быстрый доступ к гайдлайнам и главным дизайн-ресурсам. Добавляйте ссылки через базу знаний — они появятся здесь автоматически.</p><div class="design-ws-system-links">' +
        (links.length ? links.slice(0, 6).map(function (page) { return '<a class="design-ws-system-link" href="' + html(page.url) + '" target="_blank" rel="noopener"><strong>' + html(page.title) + '</strong><span>открыть ↗</span></a>'; }).join('') : '<div class="design-ws-empty"><p>Добавьте ссылку на Figma, облачную папку или брендбук.</p></div>') +
        '</div></article>' +
      '<article class="design-ws-system-card"><h3>Палитра интерфейса</h3><p>Рабочая нейтральная база и акценты пространства дизайнеров.</p><div class="design-ws-swatches"><span class="design-ws-swatch" style="--swatch:#11100f"></span><span class="design-ws-swatch" style="--swatch:#f6f1e8"></span><span class="design-ws-swatch" style="--swatch:#7e5cff"></span><span class="design-ws-swatch" style="--swatch:#54a987"></span></div></article>' +
      '<article class="design-ws-system-card"><h3>Шаблоны</h3><p>' + systemPages.filter(function (page) { return /шаблон/i.test(page.category + ' ' + page.title); }).length + ' материалов в библиотеке.</p><button type="button" class="design-ws-btn" data-design-mode="knowledge" style="margin-top:18px">Открыть базу знаний</button></article>' +
      '<article class="design-ws-system-card"><h3>Правила работы</h3><p>Храните SLA, порядок согласования, версии файлов и требования к брифу рядом с проектами.</p><button type="button" class="design-ws-btn" data-design-add-page style="margin-top:18px">Добавить регламент</button></article>' +
      '</div>';
  }

  function renderBody() {
    var projects = filteredProjects();
    if (ui.mode === 'tests') return renderTests();
    if (ui.mode === 'knowledge') return renderPages();
    if (ui.mode === 'system') return renderDesignSystem();
    if (ui.mode === 'archive') return renderArchive();
    if (ui.mode === 'history') return renderHistory();
    if (!projects.length && !activeProjects().length) return renderEmptyProjects();
    if (ui.mode === 'board') return renderBoard(projects);
    var paged = pageSlice(projects, 'projectPage', PROJECT_PAGE_SIZE);
    return renderTable(paged.items) + renderPager('projectPage', paged);
  }

  function renderDialog() {
    if (!activeDialog) return '';
    if (activeDialog.type === 'project') return renderProjectDialog(activeDialog.id);
    if (activeDialog.type === 'page') return renderPageDialog(activeDialog.id);
    if (activeDialog.type === 'test') return renderTestDialog(activeDialog.id);
    return '';
  }

  function renderProjectDialog(id) {
    var project = id ? data.projects.find(function (item) { return item.id === id; }) : null;
    project = project || {
      id: '', title: '', type: 'other', status: (activeDialog && activeDialog.prefillStatus) || 'inbox', owner: '', dueDate: '', priority: 'normal',
      marketplace: '', brief: '', url: '', tags: [], archived: false, createdAt: '', updatedAt: ''
    };
    var statusOptions = Object.keys(STATUS).map(function (key) { return [key, STATUS[key].label]; });
    return '<div class="design-ws-modal-layer" data-design-close-layer><section class="design-ws-modal" role="dialog" aria-modal="true" aria-label="' + html(id ? 'Редактировать проект' : 'Новый проект') + '">' +
      '<div class="design-ws-modal-head"><div><h3>' + html(id ? 'Проект' : 'Новый проект') + '</h3><p>Карточка производства: бриф, ответственный, срок и ссылка на исходники.</p></div><button type="button" class="design-ws-icon-btn" data-design-close aria-label="Закрыть">×</button></div>' +
      '<form class="design-ws-form" data-design-project-form data-project-id="' + html(id || '') + '"><div class="design-ws-form-grid">' +
      field('Название', 'title', project.title, 'text', true, true) +
      selectField('Тип работы', 'type', TYPES, project.type) +
      selectField('Статус', 'status', statusOptions, project.status) +
      field('Ответственный', 'owner', project.owner, 'text') +
      field('Дедлайн', 'dueDate', project.dueDate, 'date') +
      selectField('Приоритет', 'priority', Object.keys(PRIORITIES).map(function (key) { return [key, PRIORITIES[key].label]; }), project.priority) +
      field('Площадка / бренд', 'marketplace', project.marketplace, 'text') +
      field('Ссылка на Figma / Drive', 'url', project.url, 'url') +
      field('Теги через запятую', 'tags', (project.tags || []).join(', '), 'text', false, true) +
      textareaField('Бриф и критерии готовности', 'brief', project.brief, true) +
      '</div><div class="design-ws-modal-actions"><div class="design-ws-modal-secondary">' + (id ? '<button type="button" class="design-ws-btn danger" data-design-delete-project="' + html(id) + '">В архив</button><button type="button" class="design-ws-btn" data-design-duplicate-project="' + html(id) + '">Дублировать</button>' : '<span></span>') + '</div><div class="design-ws-modal-actions-right"><button type="button" class="design-ws-btn" data-design-close>Отмена</button><button type="submit" class="design-ws-btn primary">Сохранить проект</button></div></div></form></section></div>';
  }

  function renderPageDialog(id) {
    var page = id ? data.pages.find(function (item) { return item.id === id; }) : null;
    page = page || {
      id: '', title: '', category: ui.mode === 'system' ? 'Бренд-система' : 'Процессы', kind: 'page',
      summary: '', content: '', url: '', owner: '', status: 'published', archived: false, createdAt: '', updatedAt: ''
    };
    return '<div class="design-ws-modal-layer" data-design-close-layer><section class="design-ws-modal" role="dialog" aria-modal="true" aria-label="' + html(id ? 'Редактировать страницу' : 'Новая страница') + '">' +
      '<div class="design-ws-modal-head"><div><h3>' + html(id ? 'Страница отдела' : 'Новая страница') + '</h3><p>Регламент, бриф, шаблон, референс или ссылка на внешний материал.</p></div><button type="button" class="design-ws-icon-btn" data-design-close aria-label="Закрыть">×</button></div>' +
      '<form class="design-ws-form" data-design-page-form data-page-id="' + html(id || '') + '"><div class="design-ws-form-grid">' +
      field('Название', 'title', page.title, 'text', true, true) +
      selectField('Категория', 'category', PAGE_CATEGORIES, page.category) +
      selectField('Тип', 'kind', PAGE_KINDS, page.kind) +
      selectField('Публикация', 'status', [['published', 'Опубликовано'], ['draft', 'Черновик']], page.status) +
      field('Ответственный', 'owner', page.owner, 'text') +
      field('Ссылка', 'url', page.url, 'url') +
      textareaField('Краткое описание', 'summary', page.summary, true) +
      textareaField('Содержание / заметки', 'content', page.content, true) +
      '</div><div class="design-ws-modal-actions">' + (id ? '<button type="button" class="design-ws-btn danger" data-design-delete-page="' + html(id) + '">В архив</button>' : '<span></span>') + '<div class="design-ws-modal-actions-right"><button type="button" class="design-ws-btn" data-design-close>Отмена</button><button type="submit" class="design-ws-btn primary">Сохранить страницу</button></div></div></form></section></div>';
  }

  function renderTestDialog(id) {
    var test = id ? data.tests.find(function (item) { return item.id === id; }) : null;
    test = test || {
      id: '', title: '', sku: '', marketplace: '', owner: '', status: 'planned', hypothesis: '', startDate: '', endDate: '',
      control: normalizeVariant({}, 'Контроль A'), variant: normalizeVariant({}, 'Вариант B'), winner: '', conclusion: '', decision: '', sourceUrl: '', tags: []
    };
    var statusOptions = Object.keys(TEST_STATUS).map(function (key) { return [key, TEST_STATUS[key].label]; });
    return '<div class="design-ws-modal-layer" data-design-close-layer><section class="design-ws-modal" role="dialog" aria-modal="true" aria-label="' + html(id ? 'Редактировать тест конверсии' : 'Новый тест конверсии') + '">' +
      '<div class="design-ws-modal-head"><div><h3>' + html(id ? 'Тест конверсии' : 'Новый тест конверсии') + '</h3><p>Зафиксируйте гипотезу, визуалы A/B, показатели маркетплейса и итоговое решение.</p></div><button type="button" class="design-ws-icon-btn" data-design-close aria-label="Закрыть">×</button></div>' +
      '<form class="design-ws-form" data-design-test-form data-test-id="' + html(id || '') + '"><div class="design-ws-form-grid">' +
      field('Название теста', 'title', test.title, 'text', true, true) +
      field('SKU / артикул', 'sku', test.sku, 'text') + field('Маркетплейс', 'marketplace', test.marketplace, 'text') +
      field('Ответственный', 'owner', test.owner, 'text') + selectField('Статус', 'status', statusOptions, test.status) +
      field('Дата старта', 'startDate', test.startDate, 'date') + field('Дата завершения', 'endDate', test.endDate, 'date') +
      textareaField('Гипотеза: что меняем и почему это должно повлиять на конверсию', 'hypothesis', test.hypothesis, true) +
      '<div class="design-test-form-section"><h4>Контроль A — было</h4><p>Исходный макет и базовые показатели за сопоставимый период.</p></div>' +
      field('Название A', 'controlName', test.control.name, 'text') + imageField('Скриншот / макет A', 'controlImageUrl', test.control.imageUrl) +
      field('Показы A', 'controlViews', test.control.views, 'number') + field('Клики A', 'controlClicks', test.control.clicks, 'number') +
      field('Добавления в корзину A', 'controlCarts', test.control.carts, 'number') + field('Заказы A', 'controlOrders', test.control.orders, 'number') +
      field('Выручка A, ₽', 'controlRevenue', test.control.revenue, 'number') + '<span></span>' +
      '<div class="design-test-form-section"><h4>Вариант B — стало</h4><p>Новый макет и результат после публикации на площадке.</p></div>' +
      field('Название B', 'variantName', test.variant.name, 'text') + imageField('Скриншот / макет B', 'variantImageUrl', test.variant.imageUrl) +
      field('Показы B', 'variantViews', test.variant.views, 'number') + field('Клики B', 'variantClicks', test.variant.clicks, 'number') +
      field('Добавления в корзину B', 'variantCarts', test.variant.carts, 'number') + field('Заказы B', 'variantOrders', test.variant.orders, 'number') +
      field('Выручка B, ₽', 'variantRevenue', test.variant.revenue, 'number') + '<span></span>' +
      '<div class="design-test-form-section"><h4>Итог</h4><p>Что получили на выходе и какое решение приняли.</p></div>' +
      selectField('Победитель', 'winner', [['', 'Определить по CR'], ['control', 'Контроль A'], ['variant', 'Вариант B'], ['inconclusive', 'Недостаточно данных']], test.winner) +
      field('Ссылка на отчёт MP', 'sourceUrl', test.sourceUrl, 'url') +
      textareaField('Вывод по тесту', 'conclusion', test.conclusion, true) + textareaField('Решение / следующий шаг', 'decision', test.decision, true) +
      field('Теги через запятую', 'tags', (test.tags || []).join(', '), 'text', false, true) +
      '</div><div class="design-ws-modal-actions">' + (id ? '<button type="button" class="design-ws-btn danger" data-design-delete-test="' + html(id) + '">В архив</button>' : '<span></span>') + '<div class="design-ws-modal-actions-right"><button type="button" class="design-ws-btn" data-design-close>Отмена</button><button type="submit" class="design-ws-btn primary">Сохранить тест</button></div></div></form></section></div>';
  }

  function field(label, name, value, type, required, full) {
    return '<label class="design-ws-form-label' + (full ? ' full' : '') + '"><span>' + html(label) + '</span><input class="design-ws-field" type="' + html(type || 'text') + '" name="' + html(name) + '" value="' + html(value) + '"' + (required ? ' required' : '') + '></label>';
  }

  function selectField(label, name, options, selected) {
    return '<label class="design-ws-form-label"><span>' + html(label) + '</span><select class="design-ws-field" name="' + html(name) + '">' + optionList(options, selected) + '</select></label>';
  }

  function textareaField(label, name, value, full) {
    return '<label class="design-ws-form-label' + (full ? ' full' : '') + '"><span>' + html(label) + '</span><textarea class="design-ws-field" name="' + html(name) + '">' + html(value) + '</textarea></label>';
  }

  function imageField(label, name, value) {
    return '<label class="design-ws-form-label"><span>' + html(label) + '</span><span class="design-ws-image-field">' +
      '<input class="design-ws-field" type="url" name="' + html(name) + '" value="' + html(value) + '" placeholder="https://… или загрузите файл">' +
      '<span class="design-ws-btn design-ws-file-btn">Выбрать файл<input type="file" accept="image/png,image/jpeg,image/webp" data-design-image-input="' + html(name) + '"></span>' +
      '</span><small>PNG, JPG или WebP до 2 МБ. Файл сохранится вместе с тестом.</small></label>';
  }

  function formatSyncClock(value) {
    var parsed = timestamp(value);
    if (!parsed) return '';
    try { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(parsed)); }
    catch (_) { return ''; }
  }

  function syncStatusLabel() {
    var parts = [syncMessage];
    if (remoteRevision > 0) parts.push('v' + remoteRevision);
    var clock = formatSyncClock(data.updatedAt);
    if (clock) parts.push(clock);
    return parts.join(' · ');
  }

  function renderHeaderActions() {
    if (!canEdit()) return '';
    var notion = '<button type="button" class="design-ws-btn" data-design-import title="Экспортируйте нужную database из Notion в CSV. Структура пространства и вложения автоматически не копируются">Импорт CSV из Notion</button>';
    if (ui.mode === 'board' || ui.mode === 'table') return notion + '<button type="button" class="design-ws-btn primary" data-design-add-project>+ Новый проект</button>';
    if (ui.mode === 'tests') return '<button type="button" class="design-ws-btn primary" data-design-add-test>+ Новый тест</button>';
    if (ui.mode === 'knowledge') return notion + '<button type="button" class="design-ws-btn primary" data-design-add-page>+ Новая страница</button>';
    if (ui.mode === 'system') return '<button type="button" class="design-ws-btn primary" data-design-add-page>+ Материал системы</button>';
    return '';
  }

  function renderUtilityActions() {
    return '<div class="design-ws-filter-row">' +
      (ui.mode === 'history' ? '' : '<button type="button" class="design-ws-btn" data-design-export>Экспорт JSON</button>') +
      '<button type="button" class="design-ws-btn" data-design-sync>' + (canEdit() ? 'Синхронизировать' : 'Обновить') + '</button></div>';
  }

  function renderDesigners(rootId) {
    var root = document.getElementById(rootId || ROOT_ID);
    if (!root) return null;
    var modeTabs = [['board', 'Доска'], ['table', 'Проекты'], ['tests', 'Тесты конверсии'], ['knowledge', 'База знаний'], ['system', 'Дизайн-система'], ['archive', 'Архив'], ['history', 'История']];
    var modeIcons = { board: '◫', table: '≡', tests: '↗', knowledge: '◇', system: '✦', archive: '□', history: '↶' };
    var archivedCount = data.projects.concat(data.tests, data.pages).filter(function (item) { return item.archived; }).length;
    var modeCounts = { board: activeProjects().length, table: activeProjects().length, tests: activeTests().length, knowledge: data.pages.filter(function (item) { return !item.archived; }).length, archive: archivedCount, history: remoteHistory.length + localBackups.length };
    var showFilters = ui.mode === 'board' || ui.mode === 'table';
    var checkingAccess = workspaceAccess === 'checking';
    var bodyContent = checkingAccess ? '<div class="design-ws-empty"><div><strong>Проверяем доступ</strong><p>Данные рабочей базы появятся после проверки членства.</p></div></div>' : renderBody();
    var accessNotice = workspaceAccess === 'viewer'
      ? '<div class="design-ws-notice is-readonly"><strong>Режим просмотра.</strong> Обновлять данные можно, редактирование и восстановление версий отключены.</div>'
      : ((workspaceAccess === 'none' || workspaceAccess === 'setup') ? '<div class="design-ws-notice is-error"><strong>Доступ не настроен.</strong> ' + html(workspaceAccessMessage) + '. Обратитесь к администратору раздела.</div>' : '');
    var remoteNotice = remoteLoadError && (workspaceAccess === 'viewer' || workspaceAccess === 'editor')
      ? '<div class="design-ws-notice is-error"><strong>Командные данные временно не загрузились.</strong> Показана последняя сохранённая копия. Проверьте интернет и нажмите «Обновить».<div class="design-ws-head-actions"><button type="button" class="design-ws-btn primary" data-design-sync>Повторить загрузку</button></div></div>'
      : '';
    var conflictNotice = syncConflicts.length && pendingConflict
      ? '<div class="design-ws-notice is-error"><strong>Одновременно изменены одни и те же материалы: ' + syncConflicts.length + '.</strong> Локальная копия сохранена. Выберите версию для конфликтующих карточек.<div class="design-ws-head-actions"><button type="button" class="design-ws-btn" data-design-conflict-remote>Командная версия</button><button type="button" class="design-ws-btn primary" data-design-conflict-local>Локальная версия</button></div></div>'
      : '';
    var renderedSyncLabel = syncStatusLabel();
    root.innerHTML = '<div class="design-ws" data-design-workspace data-design-access="' + html(workspaceAccess) + '" data-design-readonly="' + (!canEdit()) + '">' +
      '<header class="design-ws-head"><div class="design-ws-head-copy"><span class="design-ws-eyebrow"><i aria-hidden="true">✦</i> Creative operations</span><h2>Дизайн-студия</h2><p>Единый рабочий ритм — от входящего запроса и брифа до готового макета, эксперимента и знания команды.</p><div class="design-ws-head-hints"><span><kbd>/</kbd> поиск проектов</span>' + (canEdit() ? '<span><kbd>N</kbd> новый проект</span>' : '') + '</div></div>' +
      '<div class="design-ws-head-actions"><div class="design-ws-head-status"><span class="design-ws-access">' + html(workspaceAccess === 'editor' ? 'Редактор' : (workspaceAccess === 'viewer' ? 'Просмотр' : (workspaceAccess === 'local' ? 'Локально' : (checkingAccess ? 'Проверка' : 'Нет доступа')))) + '</span><span class="design-ws-sync ' + html(syncState) + '" title="' + html(renderedSyncLabel) + '">' + html(renderedSyncLabel) + '</span></div><div class="design-ws-head-buttons">' + renderHeaderActions() + '</div></div></header>' +
      (checkingAccess ? '' : renderSummary()) +
      '<div class="design-ws-toolbar"><div class="design-ws-tabs" role="tablist">' + modeTabs.map(function (tab) { return '<button type="button" role="tab" aria-selected="' + (ui.mode === tab[0] ? 'true' : 'false') + '" class="design-ws-tab' + (ui.mode === tab[0] ? ' active' : '') + '" data-design-mode="' + tab[0] + '"><i aria-hidden="true">' + modeIcons[tab[0]] + '</i><span>' + html(tab[1]) + '</span>' + (modeCounts[tab[0]] != null ? '<b>' + modeCounts[tab[0]] + '</b>' : '') + '</button>'; }).join('') + '</div>' +
      (showFilters ? renderFilters() : renderUtilityActions()) + '</div>' +
      (!loadFinished && loadStarted ? '<div class="design-ws-notice">Подключаем общую базу отдела. Локальная версия уже доступна для работы.</div>' : '') +
      accessNotice + remoteNotice + conflictNotice +
      '<main class="design-ws-body">' + bodyContent + '</main>' +
      '<input class="design-ws-hidden-input" type="file" accept=".csv,text/csv" data-design-import-input>' +
      '<input class="design-ws-hidden-input" type="file" accept=".csv,text/csv" data-design-test-import-input>' +
      '<input class="design-ws-hidden-input" type="file" accept=".json,application/json" data-design-backup-input>' +
      renderDialog() + '</div>';
    if (!canEdit()) {
      root.querySelectorAll('[data-design-add-project], [data-design-add-project-status], [data-design-add-page], [data-design-add-test], [data-design-import], [data-design-import-test], [data-design-delete-project], [data-design-duplicate-project], [data-design-delete-page], [data-design-delete-test], [data-design-restore], [data-design-backup], [data-design-import-backup], [data-design-restore-local], [data-design-restore-remote], form button[type="submit"]').forEach(function (node) { node.hidden = true; node.disabled = true; });
      root.querySelectorAll('form input, form select, form textarea, [data-design-status]').forEach(function (node) { node.disabled = true; });
      root.querySelectorAll('[data-design-project][draggable]').forEach(function (node) { node.draggable = false; });
    }
    root.querySelectorAll('[data-design-restore]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        restoreEntity(button.getAttribute('data-design-restore'), button.getAttribute('data-design-restore-id'));
      });
    });
    return root;
  }

  function showToast(message) {
    var existing = document.querySelector('.design-ws-toast');
    if (existing) existing.remove();
    var node = document.createElement('div');
    node.className = 'design-ws-toast';
    node.textContent = message;
    document.body.appendChild(node);
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 3200);
  }

  function rememberDialogFocus(type, id) {
    lastFocusedElement = { type: type, id: id || '' };
  }

  function restoreDialogFocus() {
    var target = null;
    if (lastFocusedElement) {
      var attr = lastFocusedElement.type === 'project' ? 'data-design-project' : (lastFocusedElement.type === 'page' ? 'data-design-page' : 'data-design-test');
      if (lastFocusedElement.id) {
        target = Array.prototype.find.call(document.querySelectorAll('[' + attr + ']'), function (node) { return node.getAttribute(attr) === lastFocusedElement.id; });
      } else {
        target = document.querySelector(lastFocusedElement.type === 'project' ? '[data-design-add-project]' : (lastFocusedElement.type === 'page' ? '[data-design-add-page]' : '[data-design-add-test]'));
      }
    }
    lastFocusedElement = null;
    if (target && typeof target.focus === 'function') target.focus();
  }

  function openProject(id, prefillStatus) {
    rememberDialogFocus('project', id);
    activeDialog = { type: 'project', id: id || '', prefillStatus: STATUS[prefillStatus] ? prefillStatus : '' };
    renderDesigners();
    focusDialog();
  }

  function openPage(id) {
    rememberDialogFocus('page', id);
    activeDialog = { type: 'page', id: id || '' };
    renderDesigners();
    focusDialog();
  }

  function openTest(id) {
    rememberDialogFocus('test', id);
    activeDialog = { type: 'test', id: id || '' };
    renderDesigners();
    focusDialog();
  }

  function closeDialog() {
    activeDialog = null;
    renderDesigners();
    restoreDialogFocus();
  }

  function focusDialog() {
    window.requestAnimationFrame(function () {
      var fieldNode = document.querySelector('.design-ws-modal [name="title"]:not([disabled])') || document.querySelector('.design-ws-modal [data-design-close]');
      if (fieldNode) fieldNode.focus();
    });
  }

  function formValues(form) {
    var values = {};
    Array.prototype.forEach.call(form.elements || [], function (element) {
      if (element.name) values[element.name] = element.value;
    });
    return values;
  }

  function saveProject(form) {
    if (!ensureEditor()) return false;
    var values = formValues(form);
    var id = string(form.getAttribute('data-project-id'));
    var existing = id ? data.projects.find(function (item) { return item.id === id; }) : null;
    var stamp = nowIso();
    var project = normalizeProject(Object.assign({}, existing || {}, values, {
      id: id || uid('design-project'),
      title: values.title,
      tags: normalizeTags(values.tags),
      createdAt: existing ? existing.createdAt : stamp,
      updatedAt: stamp,
      archived: false
    }));
    if (existing) data.projects = data.projects.map(function (item) { return item.id === id ? project : item; });
    else data.projects.unshift(project);
    activeDialog = null;
    mutate(existing ? 'Проект обновлён' : 'Проект добавлен', { action: existing ? 'project.update' : 'project.create', entityType: 'project', entityId: project.id });
    restoreDialogFocus();
  }

  function savePage(form) {
    if (!ensureEditor()) return false;
    var values = formValues(form);
    var id = string(form.getAttribute('data-page-id'));
    var existing = id ? data.pages.find(function (item) { return item.id === id; }) : null;
    var stamp = nowIso();
    var page = normalizePage(Object.assign({}, existing || {}, values, {
      id: id || uid('design-page'),
      title: values.title,
      createdAt: existing ? existing.createdAt : stamp,
      updatedAt: stamp,
      archived: false
    }));
    if (existing) data.pages = data.pages.map(function (item) { return item.id === id ? page : item; });
    else data.pages.unshift(page);
    activeDialog = null;
    mutate(existing ? 'Страница обновлена' : 'Страница добавлена', { action: existing ? 'page.update' : 'page.create', entityType: 'page', entityId: page.id });
    restoreDialogFocus();
  }

  function saveTest(form) {
    if (!ensureEditor()) return false;
    var values = formValues(form);
    var id = string(form.getAttribute('data-test-id'));
    var existing = id ? data.tests.find(function (item) { return item.id === id; }) : null;
    var stamp = nowIso();
    var test = normalizeTest(Object.assign({}, existing || {}, values, {
      id: id || uid('design-test'),
      title: values.title,
      control: {
        name: values.controlName,
        imageUrl: values.controlImageUrl,
        views: values.controlViews,
        clicks: values.controlClicks,
        carts: values.controlCarts,
        orders: values.controlOrders,
        revenue: values.controlRevenue
      },
      variant: {
        name: values.variantName,
        imageUrl: values.variantImageUrl,
        views: values.variantViews,
        clicks: values.variantClicks,
        carts: values.variantCarts,
        orders: values.variantOrders,
        revenue: values.variantRevenue
      },
      tags: normalizeTags(values.tags),
      createdAt: existing ? existing.createdAt : stamp,
      updatedAt: stamp,
      archived: false
    }));
    var validationError = validateTest(test);
    if (validationError) { showToast(validationError); return false; }
    if (existing) data.tests = data.tests.map(function (item) { return item.id === id ? test : item; });
    else data.tests.unshift(test);
    activeDialog = null;
    mutate(existing ? 'Тест обновлён' : 'Тест добавлен', { action: existing ? 'test.update' : 'test.create', entityType: 'test', entityId: test.id });
    restoreDialogFocus();
    return true;
  }

  function archiveProject(id) {
    if (!ensureEditor()) return;
    var project = data.projects.find(function (item) { return item.id === id; });
    if (!project) return;
    project.archived = true;
    project.updatedAt = nowIso();
    activeDialog = null;
    mutate('Проект перемещён в архив', { action: 'project.archive', entityType: 'project', entityId: id });
    restoreDialogFocus();
  }

  function duplicateProject(id) {
    if (!ensureEditor()) return;
    var source = data.projects.find(function (item) { return item.id === id; });
    if (!source) return;
    var stamp = nowIso();
    var copyProject = normalizeProject(Object.assign({}, clone(source), {
      id: uid('design-project'),
      title: source.title + ' — копия',
      status: 'inbox',
      dueDate: '',
      archived: false,
      createdAt: stamp,
      updatedAt: stamp,
      source: 'duplicate'
    }));
    data.projects.unshift(copyProject);
    activeDialog = null;
    mutate('Создана копия проекта', { action: 'project.duplicate', entityType: 'project', entityId: copyProject.id });
    restoreDialogFocus();
  }

  function archivePage(id) {
    if (!ensureEditor()) return;
    var page = data.pages.find(function (item) { return item.id === id; });
    if (!page) return;
    page.archived = true;
    page.updatedAt = nowIso();
    activeDialog = null;
    mutate('Страница перемещена в архив', { action: 'page.archive', entityType: 'page', entityId: id });
    restoreDialogFocus();
  }

  function archiveTest(id) {
    if (!ensureEditor()) return;
    var test = data.tests.find(function (item) { return item.id === id; });
    if (!test) return;
    test.archived = true;
    test.updatedAt = nowIso();
    activeDialog = null;
    mutate('Тест перемещён в архив', { action: 'test.archive', entityType: 'test', entityId: id });
    restoreDialogFocus();
  }

  function restoreEntity(type, id) {
    if (!ensureEditor()) return;
    var list = type === 'project' ? data.projects : (type === 'test' ? data.tests : data.pages);
    var item = list.find(function (entry) { return entry.id === id; });
    if (!item) return;
    item.archived = false;
    item.updatedAt = nowIso();
    mutate('Материал восстановлен из архива', { action: type + '.restore', entityType: type, entityId: id });
  }

  function updateProjectStatus(id, status) {
    if (!ensureEditor()) return;
    var project = data.projects.find(function (item) { return item.id === id; });
    if (!project || !STATUS[status] || project.status === status) return;
    project.status = status;
    project.updatedAt = nowIso();
    mutate('Статус проекта: ' + STATUS[status].label, { action: 'project.status', entityType: 'project', entityId: id });
  }

  function importSize(value) {
    try { return new Blob([String(value || '')]).size; } catch (_) { return String(value || '').length * 2; }
  }

  function assertImportSize(text) {
    if (importSize(text) > MAX_IMPORT_BYTES) throw new Error('Файл больше 8 МБ. Разделите импорт на несколько частей');
  }

  function detectDelimiter(text) {
    var line = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).find(function (item) { return string(item); }) || '';
    var candidates = [',', ';', '\t'];
    var best = ',';
    var bestCount = -1;
    candidates.forEach(function (candidate) {
      var quoted = false;
      var count = 0;
      for (var index = 0; index < line.length; index += 1) {
        if (line[index] === '"') quoted = !quoted;
        else if (!quoted && line[index] === candidate) count += 1;
      }
      if (count > bestCount) { best = candidate; bestCount = count; }
    });
    return best;
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var fieldValue = '';
    var quoted = false;
    text = String(text || '').replace(/^\uFEFF/, '');
    assertImportSize(text);
    var delimiter = detectDelimiter(text);
    for (var index = 0; index < text.length; index += 1) {
      var char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') { fieldValue += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else fieldValue += char;
      } else if (char === '"') quoted = true;
      else if (char === delimiter) { row.push(fieldValue); fieldValue = ''; }
      else if (char === '\n') {
        row.push(fieldValue.replace(/\r$/, '')); rows.push(row); row = []; fieldValue = '';
        if (rows.length > MAX_IMPORT_ROWS) throw new Error('В файле больше 12 000 строк. Разделите импорт на части');
      }
      else fieldValue += char;
    }
    if (fieldValue || row.length) { row.push(fieldValue.replace(/\r$/, '')); rows.push(row); }
    return rows.filter(function (item) { return item.some(function (cell) { return string(cell); }); });
  }

  function normalizeHeader(value) {
    return string(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
  }

  function csvValue(record, aliases) {
    for (var index = 0; index < aliases.length; index += 1) {
      var key = normalizeHeader(aliases[index]);
      if (Object.prototype.hasOwnProperty.call(record, key) && string(record[key])) return string(record[key]);
    }
    return '';
  }

  function importNotionCsv(text) {
    if (!ensureEditor()) throw new Error('Импорт доступен только редакторам');
    var rows = parseCsv(text);
    if (rows.length < 2) throw new Error('В CSV нет строк для импорта');
    var headers = rows[0].map(normalizeHeader);
    var pageSignals = ['категория', 'category', 'раздел', 'section', 'содержание', 'content', 'текст', 'body', 'типстраницы', 'pagekind'].map(normalizeHeader);
    var projectSignals = ['дедлайн', 'deadline', 'duedate', 'срок', 'приоритет', 'priority', 'этап', 'stage', 'sku', 'артикул', 'marketplace', 'маркетплейс'].map(normalizeHeader);
    var pageMode = pageSignals.some(function (key) { return headers.indexOf(key) >= 0; })
      && !projectSignals.some(function (key) { return headers.indexOf(key) >= 0; });
    var imported = [];
    var usedPageIds = new Set(data.pages.map(function (item) { return item.id; }));
    var usedProjectIds = new Set(data.projects.map(function (item) { return item.id; }));
    rows.slice(1).forEach(function (cells, rowIndex) {
      var record = {};
      headers.forEach(function (key, index) { if (key) record[key] = cells[index] || ''; });
      var title = csvValue(record, ['Название', 'Name', 'Title', 'Задача', 'Проект', 'Task']);
      if (!title) return;
      var owner = csvValue(record, ['Ответственный', 'Owner', 'Assignee', 'Исполнитель', 'Дизайнер']);
      var sourceId = csvValue(record, ['ID', 'Page ID', 'Notion ID']);
      var stamp = nowIso();
      if (pageMode) {
        var pageSourceKey = string(sourceId) || normalizeHeader([title, owner].join('|'));
        var existingPage = data.pages.find(function (item) {
          return item.sourceKey === pageSourceKey
            || ((item.source === 'notion-csv' || String(item.id).indexOf('notion-page-') === 0)
              && normalizeHeader([item.title, item.owner].join('|')) === normalizeHeader([title, owner].join('|')));
        });
        imported.push(normalizePage({
          id: existingPage ? existingPage.id : uniqueImportId('notion-page-', pageSourceKey, usedPageIds),
          title: title,
          category: csvValue(record, ['Категория', 'Category', 'Раздел', 'Section']) || 'Процессы',
          kind: /brief|бриф/i.test(csvValue(record, ['Тип', 'Type', 'Тип страницы', 'Page kind'])) ? 'brief' : 'page',
          summary: csvValue(record, ['Описание', 'Description', 'Summary', 'Кратко']),
          content: csvValue(record, ['Содержание', 'Content', 'Текст', 'Body', 'Notes', 'Заметки']),
          url: csvValue(record, ['Ссылка', 'URL', 'Link']),
          owner: owner,
          status: /draft|чернов/i.test(csvValue(record, ['Статус', 'Status', 'Публикация'])) ? 'draft' : 'published',
          source: 'notion-csv',
          sourceKey: pageSourceKey,
          createdAt: existingPage ? existingPage.createdAt : stamp,
          updatedAt: new Date(Date.now() + rowIndex).toISOString()
        }));
      } else {
        var due = csvValue(record, ['Дедлайн', 'Срок', 'Due', 'Due date', 'Deadline', 'Date']);
        var projectSourceKey = string(sourceId) || normalizeHeader([title, owner, normalizeDate(due)].join('|'));
        var existingProject = data.projects.find(function (item) {
          return item.sourceKey === projectSourceKey
            || ((item.source === 'notion-csv' || String(item.id).indexOf('notion-') === 0)
              && normalizeHeader([item.title, item.owner, item.dueDate].join('|')) === normalizeHeader([title, owner, normalizeDate(due)].join('|')));
        });
        imported.push(normalizeProject({
          id: existingProject ? existingProject.id : uniqueImportId('notion-', projectSourceKey, usedProjectIds),
          title: title,
          status: statusFromText(csvValue(record, ['Статус', 'Status', 'Stage', 'Этап'])),
          owner: owner,
          dueDate: normalizeDate(due),
          priority: priorityFromText(csvValue(record, ['Приоритет', 'Priority'])),
          type: typeFromText(csvValue(record, ['Тип', 'Type', 'Формат', 'Category'])),
          marketplace: csvValue(record, ['Площадка', 'Marketplace', 'Platform', 'Brand', 'Бренд']),
          brief: csvValue(record, ['Бриф', 'Brief', 'Description', 'Описание', 'Комментарий', 'Notes']),
          url: csvValue(record, ['Ссылка', 'URL', 'Link', 'Figma', 'Исходники']),
          tags: csvValue(record, ['Теги', 'Tags', 'Labels']),
          source: 'notion-csv',
          sourceKey: projectSourceKey,
          createdAt: existingProject ? existingProject.createdAt : stamp,
          updatedAt: new Date(Date.now() + rowIndex).toISOString()
        }));
      }
    });
    if (!imported.length) throw new Error('Не найдена колонка «Название» / Name');
    if (pageMode) {
      data.pages = mergeEntities(data.pages, imported, normalizePage);
      ui.mode = 'knowledge';
      ui.knowledgePage = 1;
      writeUi();
      mutate('Импортировано страниц Notion: ' + imported.length);
    } else {
      data.projects = mergeEntities(data.projects, imported, normalizeProject);
      ui.projectPage = 1;
      mutate('Импортировано проектов: ' + imported.length);
    }
    return imported.length;
  }

  function importMarketplaceCsv(text) {
    if (!ensureEditor()) throw new Error('Импорт доступен только редакторам');
    var rows = parseCsv(text);
    if (rows.length < 2) throw new Error('В CSV нет строк с метриками');
    var headers = rows[0].map(normalizeHeader);
    var groups = new Map();
    rows.slice(1).forEach(function (cells) {
      var record = {};
      headers.forEach(function (key, index) { if (key) record[key] = cells[index] || ''; });
      var sku = csvValue(record, ['SKU', 'Артикул', 'Article', 'Article ID', 'NM ID', 'nmId']);
      var title = csvValue(record, ['Тест', 'Test', 'Название теста', 'Experiment']) || (sku ? 'Тест SKU ' + sku : '');
      if (!title) return;
      var variantRaw = csvValue(record, ['Вариант', 'Variant', 'Группа', 'Group', 'Версия', 'Version']);
      var variantKey = normalizeHeader(variantRaw);
      var side = /^(b|б|test|variant|new|after)$|вариант(b|б)|тест|нов|после/i.test(variantKey) ? 'variant' : 'control';
      var key = normalizeHeader(title + '|' + sku);
      if (!groups.has(key)) groups.set(key, { title: title, sku: sku, marketplace: '', control: {}, variant: {} });
      var group = groups.get(key);
      group.marketplace = group.marketplace || csvValue(record, ['Площадка', 'Marketplace', 'Platform', 'MP']);
      var metrics = group[side];
      metrics.name = metrics.name || variantRaw || (side === 'variant' ? 'Вариант B' : 'Контроль A');
      metrics.imageUrl = metrics.imageUrl || csvValue(record, ['Макет', 'Скриншот', 'Image', 'Preview', 'Creative URL']);
      metrics.views = number(metrics.views) + number(csvValue(record, ['Показы', 'Views', 'Impressions', 'Shows']));
      metrics.clicks = number(metrics.clicks) + number(csvValue(record, ['Клики', 'Clicks']));
      metrics.carts = number(metrics.carts) + number(csvValue(record, ['Корзины', 'Добавления в корзину', 'Add to cart', 'Carts']));
      metrics.orders = number(metrics.orders) + number(csvValue(record, ['Заказы', 'Orders', 'Conversions', 'Конверсии']));
      metrics.revenue = number(metrics.revenue) + number(csvValue(record, ['Выручка', 'Revenue', 'Sales', 'GMV', 'Оборот']));
    });
    if (!groups.size) throw new Error('Нужна колонка «Тест» или «SKU»');
    var touched = 0;
    var updates = [];
    var usedTestIds = new Set(data.tests.map(function (item) { return item.id; }));
    groups.forEach(function (group) {
      var testSourceKey = normalizeHeader(group.title + '|' + group.sku);
      var existing = data.tests.find(function (item) {
        return item.sourceKey === testSourceKey
          || normalizeHeader(item.title + '|' + item.sku) === testSourceKey
          || (group.sku && item.sku === group.sku && normalizeHeader(item.title) === normalizeHeader(group.title));
      });
      var stamp = nowIso();
      var next = normalizeTest(Object.assign({}, existing || {}, {
        id: existing ? existing.id : uniqueImportId('mp-test-', testSourceKey, usedTestIds),
        title: group.title,
        sku: group.sku || (existing && existing.sku),
        marketplace: group.marketplace || (existing && existing.marketplace),
        status: existing && existing.status === 'complete' ? 'complete' : 'analysis',
        control: Object.assign({}, existing ? existing.control : {}, group.control),
        variant: Object.assign({}, existing ? existing.variant : {}, group.variant),
        createdAt: existing ? existing.createdAt : stamp,
        updatedAt: stamp,
        source: 'marketplace-csv',
        sourceKey: testSourceKey
      }));
      var validationError = validateTest(next);
      if (validationError) throw new Error(group.title + ' · ' + validationError);
      updates.push({ existing: existing, next: next });
      touched += 1;
    });
    updates.forEach(function (update) {
      if (update.existing) data.tests = data.tests.map(function (item) { return item.id === update.existing.id ? update.next : item; });
      else data.tests.unshift(update.next);
    });
    ui.mode = 'tests';
    ui.testPage = 1;
    writeUi();
    mutate('Импортировано тестов с метриками: ' + touched);
    return touched;
  }

  function downloadFile(name, content, type) {
    var blob = new Blob([content], { type: type || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJson() {
    downloadFile('altea-design-workspace-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 2), 'application/json');
    showToast('Экспорт рабочей базы готов');
  }

  function createManualBackup() {
    if (!ensureEditor()) return;
    queueLocalBackup('Ручная резервная копия', true, data).then(function (saved) {
      if (saved) showToast('Резервная копия создана');
    });
  }

  function restoreLocalBackup(key) {
    if (!ensureEditor()) return false;
    var backup = localBackups.find(function (item) { return item.key === key; });
    if (!backup || !backup.data) { showToast('Резервная копия не найдена'); return false; }
    queueLocalBackup('Перед восстановлением локальной копии', true, data);
    data = normalizeData(backup.data);
    lastCommittedData = clone(data);
    mutate('Восстановлена локальная копия от ' + formatDateTime(backup.createdAt), { action: 'workspace.restore.local' });
    return true;
  }

  async function restoreRemoteRevision(revision) {
    if (!ensureEditor()) return false;
    var cfg = remoteConfig();
    if (!cfg || !cfg.token) { showToast('Командная база недоступна'); return false; }
    syncState = 'pending';
    syncMessage = 'Восстанавливаем версию ' + revision;
    renderDesigners();
    try {
      var url = new URL(cfg.baseUrl + '/rest/v1/rpc/' + REMOTE_RESTORE_RPC);
      var response = await fetchRemoteRequest(url.toString(), {
        method: 'POST',
        headers: Object.assign({}, remoteHeaders(cfg), { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ p_brand: cfg.brand, p_revision: number(revision), p_expected_revision: remoteRevision })
      }, 'Командная база не подтвердила восстановление вовремя');
      var result = null;
      try { result = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(string(result && (result.message || result.details)) || 'Восстановление вернуло ' + response.status);
      var remote = await fetchRemote();
      if (remote && remote.payload) data = normalizeData(remote.payload);
      remoteRevision = remote ? number(remote.revision) : remoteRevision;
      remoteHistory = await fetchRemoteHistory().catch(function () { return remoteHistory; });
      remoteAudit = await fetchRemoteAudit().catch(function () { return remoteAudit; });
      lastSyncedData = clone(data);
      lastCommittedData = clone(data);
      await writeLocal(false);
      syncState = 'ok';
      syncMessage = 'Версия восстановлена';
      renderDesigners();
      showToast('Командная версия ' + revision + ' восстановлена');
      return true;
    } catch (error) {
      syncState = 'error';
      syncMessage = error && error.message ? error.message : 'Не удалось восстановить версию';
      renderDesigners();
      return false;
    }
  }

  function importBackupJson(text) {
    if (!ensureEditor()) throw new Error('Восстановление доступно только редакторам');
    assertImportSize(text);
    var parsed;
    try { parsed = JSON.parse(String(text || '')); } catch (_) { throw new Error('Некорректный JSON-файл'); }
    var source = parsed && parsed.data ? parsed.data : parsed;
    if (!source || !Array.isArray(source.projects) || !Array.isArray(source.tests) || !Array.isArray(source.pages)) {
      throw new Error('Это не резервная копия рабочей базы дизайнеров');
    }
    queueLocalBackup('Перед восстановлением JSON', true, data);
    data = normalizeData(source);
    lastCommittedData = clone(data);
    mutate('Рабочая база восстановлена из JSON', { action: 'workspace.restore.json' });
    return true;
  }

  function bindEvents() {
    if (document.documentElement.dataset.designWorkspaceEvents === '1') return;
    document.documentElement.dataset.designWorkspaceEvents = '1';

    document.addEventListener('click', function (event) {
      var root = event.target && event.target.closest && event.target.closest('#' + ROOT_ID);
      if (!root) return;
      if (event.target.closest('[data-design-resource-link]')) return;
      var boardScrollButton = event.target.closest('[data-design-board-scroll]');
      if (boardScrollButton) {
        var boardScrollport = root.querySelector('[data-design-board-scrollport]');
        var boardDirection = number(boardScrollButton.getAttribute('data-design-board-scroll')) < 0 ? -1 : 1;
        var boardDistance = boardScrollport ? Math.max(280, Math.round(boardScrollport.clientWidth * .78)) : 0;
        if (boardScrollport && typeof boardScrollport.scrollBy === 'function') {
          boardScrollport.scrollBy({ left: boardDirection * boardDistance, behavior: 'smooth' });
        } else if (boardScrollport) {
          boardScrollport.scrollLeft += boardDirection * boardDistance;
        }
        return;
      }
      var summaryFocus = event.target.closest('[data-design-focus]');
      if (summaryFocus) { applySummaryFocus(summaryFocus.getAttribute('data-design-focus')); return; }
      if (event.target.closest('[data-design-reset-filters]')) { resetProjectFilters(); return; }
      var mode = event.target.closest('[data-design-mode]');
      if (mode) { ui.mode = mode.getAttribute('data-design-mode') || 'board'; writeUi(); renderDesigners(); return; }
      var pageButton = event.target.closest('[data-design-page-nav]');
      if (pageButton && !pageButton.disabled) {
        ui[pageButton.getAttribute('data-design-page-nav')] = Math.max(1, number(pageButton.getAttribute('data-design-page-value')) || 1);
        writeUi(); renderDesigners(); return;
      }
      if (event.target.closest('[data-design-add-project]')) { if (ensureEditor()) openProject(''); return; }
      var quickProject = event.target.closest('[data-design-add-project-status]');
      if (quickProject) { if (ensureEditor()) openProject('', quickProject.getAttribute('data-design-add-project-status')); return; }
      if (event.target.closest('[data-design-add-page]')) { if (ensureEditor()) openPage(''); return; }
      if (event.target.closest('[data-design-add-test]')) { if (ensureEditor()) openTest(''); return; }
      if (event.target.closest('[data-design-import]')) { if (ensureEditor()) root.querySelector('[data-design-import-input]').click(); return; }
      if (event.target.closest('[data-design-import-test]')) { if (ensureEditor()) root.querySelector('[data-design-test-import-input]').click(); return; }
      if (event.target.closest('[data-design-import-backup]')) { if (ensureEditor()) root.querySelector('[data-design-backup-input]').click(); return; }
      if (event.target.closest('[data-design-backup]')) { createManualBackup(); return; }
      if (event.target.closest('[data-design-export]')) { exportJson(); return; }
      if (event.target.closest('[data-design-sync]')) { syncRemote(true); return; }
      var clearFilters = event.target.closest('[data-design-clear-filters]');
      if (clearFilters) {
        if (clearFilters.getAttribute('data-design-clear-filters') === 'tests') {
          ui.testSearch = ''; ui.testStatus = 'all'; ui.testOwner = 'all'; ui.testPage = 1;
        } else {
          ui.knowledgeSearch = ''; ui.knowledgeCategory = 'all'; ui.knowledgePage = 1;
        }
        writeUi(); renderDesigners(); return;
      }
      if (event.target.closest('[data-design-conflict-remote]')) {
        if (window.confirm('Принять командную версию конфликтующих материалов? Локальная копия уже сохранена.')) resolveSyncConflict(false);
        return;
      }
      if (event.target.closest('[data-design-conflict-local]')) {
        if (window.confirm('Сохранить локальную версию конфликтующих материалов поверх командной? Неконфликтующие изменения коллег сохранятся.')) resolveSyncConflict(true);
        return;
      }
      var restoreLocal = event.target.closest('[data-design-restore-local]');
      if (restoreLocal) {
        if (ensureEditor() && window.confirm('Восстановить выбранную локальную копию? Текущее состояние будет сохранено отдельно.')) restoreLocalBackup(restoreLocal.getAttribute('data-design-restore-local'));
        return;
      }
      var restoreRemote = event.target.closest('[data-design-restore-remote]');
      if (restoreRemote) {
        var revision = number(restoreRemote.getAttribute('data-design-restore-remote'));
        if (ensureEditor() && window.confirm('Восстановить командную версию ' + revision + '? Будет создана новая версия, данные не удалятся.')) restoreRemoteRevision(revision);
        return;
      }
      var deleteProject = event.target.closest('[data-design-delete-project]');
      if (deleteProject) { archiveProject(deleteProject.getAttribute('data-design-delete-project')); return; }
      var duplicateProjectButton = event.target.closest('[data-design-duplicate-project]');
      if (duplicateProjectButton) { duplicateProject(duplicateProjectButton.getAttribute('data-design-duplicate-project')); return; }
      var deletePage = event.target.closest('[data-design-delete-page]');
      if (deletePage) { archivePage(deletePage.getAttribute('data-design-delete-page')); return; }
      var deleteTest = event.target.closest('[data-design-delete-test]');
      if (deleteTest) { archiveTest(deleteTest.getAttribute('data-design-delete-test')); return; }
      if (event.target.closest('[data-design-close]')) { closeDialog(); return; }
      var layer = event.target.closest('[data-design-close-layer]');
      if (layer && event.target === layer) { closeDialog(); return; }
      if (event.target.closest('[data-design-status]')) return;
      var project = event.target.closest('[data-design-project]');
      if (project) { openProject(project.getAttribute('data-design-project')); return; }
      var page = event.target.closest('[data-design-page]');
      if (page) { openPage(page.getAttribute('data-design-page')); return; }
      var test = event.target.closest('[data-design-test]');
      if (test) { openTest(test.getAttribute('data-design-test')); }
    });

    document.addEventListener('submit', function (event) {
      var projectForm = event.target.closest && event.target.closest('[data-design-project-form]');
      if (projectForm) { event.preventDefault(); saveProject(projectForm); return; }
      var pageForm = event.target.closest && event.target.closest('[data-design-page-form]');
      if (pageForm) { event.preventDefault(); savePage(pageForm); return; }
      var testForm = event.target.closest && event.target.closest('[data-design-test-form]');
      if (testForm) { event.preventDefault(); saveTest(testForm); }
    });

    document.addEventListener('change', function (event) {
      if (!event.target || !event.target.closest || !event.target.closest('#' + ROOT_ID)) return;
      var filter = event.target.getAttribute('data-design-filter');
      if (filter) {
        ui[filter] = event.target.value;
        ui[event.target.getAttribute('data-design-filter-page') || 'projectPage'] = 1;
        writeUi(); renderDesigners(); return;
      }
      var projectId = event.target.getAttribute('data-design-status');
      if (projectId) { event.stopPropagation(); updateProjectStatus(projectId, event.target.value); return; }
      if (event.target.matches('[data-design-import-input]')) {
        var file = event.target.files && event.target.files[0];
        if (!file) return;
        if (file.size > MAX_IMPORT_BYTES) { showToast('Файл больше 8 МБ. Разделите импорт на части'); event.target.value = ''; return; }
        file.text().then(importNotionCsv).catch(function (error) { showToast(error && error.message ? error.message : 'Не удалось прочитать CSV'); });
        event.target.value = '';
        return;
      }
      if (event.target.matches('[data-design-test-import-input]')) {
        var metricsFile = event.target.files && event.target.files[0];
        if (!metricsFile) return;
        if (metricsFile.size > MAX_IMPORT_BYTES) { showToast('Файл больше 8 МБ. Разделите импорт на части'); event.target.value = ''; return; }
        metricsFile.text().then(importMarketplaceCsv).catch(function (error) { showToast(error && error.message ? error.message : 'Не удалось прочитать CSV маркетплейса'); });
        event.target.value = '';
        return;
      }
      if (event.target.matches('[data-design-backup-input]')) {
        var backupFile = event.target.files && event.target.files[0];
        if (!backupFile) return;
        if (backupFile.size > MAX_IMPORT_BYTES) { showToast('Файл больше 8 МБ. Для большой базы используйте командную историю'); event.target.value = ''; return; }
        backupFile.text().then(importBackupJson).catch(function (error) { showToast(error && error.message ? error.message : 'Не удалось восстановить JSON'); });
        event.target.value = '';
        return;
      }
      if (event.target.matches('[data-design-image-input]')) {
        var imageFile = event.target.files && event.target.files[0];
        if (!imageFile) return;
        if (!/^image\/(?:png|jpeg|webp)$/i.test(imageFile.type || '')) { showToast('Поддерживаются PNG, JPG и WebP'); event.target.value = ''; return; }
        if (imageFile.size > MAX_TEST_IMAGE_BYTES) { showToast('Изображение больше 2 МБ. Сожмите файл или используйте ссылку'); event.target.value = ''; return; }
        var targetName = event.target.getAttribute('data-design-image-input');
        var form = event.target.closest('form');
        var targetInput = form && form.elements && form.elements[targetName];
        var reader = new FileReader();
        reader.onload = function () {
          if (targetInput) targetInput.value = safeImageUrl(reader.result);
          showToast('Изображение добавлено к тесту');
        };
        reader.onerror = function () { showToast('Не удалось прочитать изображение'); };
        reader.readAsDataURL(imageFile);
        event.target.value = '';
      }
    });

    document.addEventListener('input', function (event) {
      if (!event.target || !event.target.matches || !event.target.matches('#' + ROOT_ID + ' [data-design-search]')) return;
      var value = event.target.value;
      var searchKey = event.target.getAttribute('data-design-search') || 'search';
      var pageKey = event.target.getAttribute('data-design-search-page') || 'projectPage';
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        searchTimer = 0;
        ui[searchKey] = value;
        ui[pageKey] = 1;
        writeUi();
        renderDesigners();
        var next = document.querySelector('#' + ROOT_ID + ' [data-design-search="' + searchKey + '"]');
        if (next) { next.focus(); try { next.setSelectionRange(value.length, value.length); } catch (_) {} }
      }, 180);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && activeDialog) { closeDialog(); return; }
      if (event.key === 'Tab' && activeDialog) {
        var modal = document.querySelector('.design-ws-modal');
        var focusable = modal ? Array.prototype.slice.call(modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')) : [];
        if (focusable.length) {
          var first = focusable[0];
          var last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); return; }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); return; }
        }
      }
      if ((event.key === 'Enter' || event.key === ' ') && event.target && event.target.matches && event.target.matches('[data-design-project], [data-design-page], [data-design-test]')) {
        event.preventDefault();
        if (event.target.hasAttribute('data-design-project')) openProject(event.target.getAttribute('data-design-project'));
        else if (event.target.hasAttribute('data-design-page')) openPage(event.target.getAttribute('data-design-page'));
        else openTest(event.target.getAttribute('data-design-test'));
        return;
      }
      var root = document.getElementById(ROOT_ID);
      var inputLike = event.target && /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName || '');
      if (!activeDialog && root && !root.hidden && !inputLike && event.key === '/') {
        var search = root.querySelector('[data-design-search]');
        event.preventDefault();
        if (search) { search.focus(); search.select(); }
        else {
          ui.mode = 'board';
          writeUi();
          renderDesigners();
          window.requestAnimationFrame(function () {
            var nextSearch = root.querySelector('[data-design-search]');
            if (nextSearch) { nextSearch.focus(); nextSearch.select(); }
          });
        }
        return;
      }
      if (!activeDialog && root && !root.hidden && !inputLike && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'n' && canEdit()) {
        event.preventDefault();
        openProject('');
      }
    });

    document.addEventListener('dragstart', function (event) {
      var card = event.target && event.target.closest && event.target.closest('#' + ROOT_ID + ' [data-design-project]');
      if (!canEdit() || !card || !event.dataTransfer) return;
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.getAttribute('data-design-project'));
    });

    document.addEventListener('dragend', function (event) {
      var card = event.target && event.target.closest && event.target.closest('[data-design-project]');
      if (card) card.classList.remove('dragging');
      document.querySelectorAll('.design-ws-column.is-drop-target').forEach(function (column) { column.classList.remove('is-drop-target'); });
    });

    document.addEventListener('dragover', function (event) {
      var column = event.target && event.target.closest && event.target.closest('#' + ROOT_ID + ' [data-design-drop-status]');
      if (!canEdit() || !column) return;
      event.preventDefault();
      column.classList.add('is-drop-target');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });

    document.addEventListener('dragleave', function (event) {
      var column = event.target && event.target.closest && event.target.closest('[data-design-drop-status]');
      if (column && !column.contains(event.relatedTarget)) column.classList.remove('is-drop-target');
    });

    document.addEventListener('drop', function (event) {
      var column = event.target && event.target.closest && event.target.closest('#' + ROOT_ID + ' [data-design-drop-status]');
      if (!canEdit() || !column || !event.dataTransfer) return;
      event.preventDefault();
      column.classList.remove('is-drop-target');
      updateProjectStatus(event.dataTransfer.getData('text/plain'), column.getAttribute('data-design-drop-status'));
    });
  }

  window.renderDesigners = renderDesigners;
  window.AlteaDesignWorkspace = {
    render: renderDesigners,
    sync: syncRemote,
    importNotionCsv: importNotionCsv,
    importMarketplaceCsv: importMarketplaceCsv,
    getData: function () { return clone(data); },
    whenLocalSaved: function () { return localPersistChain; },
    diagnostics: function () {
      return {
        localPersistState: localPersistState,
        localPersistError: localPersistError,
        remoteRevision: remoteRevision,
        workspaceAccess: workspaceAccess,
        workspaceAccessMessage: workspaceAccessMessage,
        remoteHistoryCount: remoteHistory.length,
        remoteAuditCount: remoteAudit.length,
        remoteLoadError: remoteLoadError,
        syncConflictCount: syncConflicts.length,
        localBackupCount: localBackups.length,
        storageScope: storageScope()
      };
    }
  };

  bindEvents();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { if (document.getElementById(ROOT_ID)) renderDesigners(); loadWorkspace(); }, { once: true });
  } else {
    if (document.getElementById(ROOT_ID)) renderDesigners();
    loadWorkspace();
  }
  window.addEventListener('altea:viewchange', function (event) {
    if (event && event.detail && event.detail.view === 'designers') renderDesigners();
  });
})();
