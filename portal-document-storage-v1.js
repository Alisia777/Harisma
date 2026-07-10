(function () {
  'use strict';

  const VERSION = '20260710-storage-drag-drop-v1';
  const STORAGE_VIEW = 'documents';
  const RESOURCE_ARTICLE_KEY = '__portal_resource_links__';
  const RESOURCE_LINK_MARKER = '[[resource-link:v1]]';
  const RESOURCE_DELETE_MARKER = '[[resource-link-delete:v1]]';
  const RESOURCE_FOLDER_MARKER = '[[resource-folder:v1]]';
  const RESOURCE_FOLDER_DELETE_MARKER = '[[resource-folder-delete:v1]]';
  const RESOURCE_BUCKET = 'portal-task-files';
  const LOCAL_FILE_DB = 'altea-document-storage-files-v1';
  const LOCAL_FILE_STORE = 'files';
  const REMOTE_FILE_MAX_BYTES = 30 * 1024 * 1024;
  const DEFAULT_GROUP = 'Общее хранилище';
  const GROUPS = [
    'Общее хранилище',
    'Маркетплейсы',
    'Продукт и контент',
    'Отчеты и аналитика',
    'Шаблоны',
    'Другое'
  ];
  const TYPES = ['Ссылка', 'Папка', 'Файл', 'Таблица', 'Документ', 'Презентация', 'Видео'];

  function appState() {
    return window.__alteaAppState || window.state || {};
  }

  function html(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function chip(label, tone = '') {
    if (typeof window.badge === 'function') return window.badge(label, tone);
    return `<span class="chip ${html(tone)}">${html(label)}</span>`;
  }

  function formatCount(value) {
    if (window.fmt?.int) return window.fmt.int(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function formatFileCount(value) {
    const count = Math.max(0, Math.trunc(Number(value) || 0));
    const mod100 = count % 100;
    const mod10 = count % 10;
    const noun = mod100 >= 11 && mod100 <= 14
      ? 'файлов'
      : (mod10 === 1 ? 'файл' : (mod10 >= 2 && mod10 <= 4 ? 'файла' : 'файлов'));
    return `${formatCount(count)} ${noun}`;
  }

  function formatBytes(value = 0) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  function stableResourceId(raw = {}) {
    const base = `${raw.href || raw.url || raw.link || ''}|${raw.title || raw.name || ''}|${raw.createdAt || ''}`;
    if (raw.id) return String(raw.id);
    if (typeof window.stableId === 'function') return window.stableId('resource', base);
    if (window.crypto?.randomUUID) return `resource-${window.crypto.randomUUID()}`;
    return `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function stableFolderId(raw = {}) {
    if (raw.id) return String(raw.id);
    const base = `${raw.group || ''}|${raw.title || raw.name || ''}|${raw.createdAt || ''}`;
    if (typeof window.stableId === 'function') return window.stableId('resource-folder', base);
    if (window.crypto?.randomUUID) return `resource-folder-${window.crypto.randomUUID()}`;
    return `resource-folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function stableStaticResourceId(raw = {}, group = DEFAULT_GROUP) {
    if (raw.id) return String(raw.id);
    const href = safeHref(raw.href || raw.url || raw.link || '');
    const seed = `${group}|${href || raw.title || raw.name || ''}`;
    if (typeof window.stableId === 'function') return window.stableId('static-resource', seed);
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(index);
      hash |= 0;
    }
    return `static-resource-${Math.abs(hash).toString(36)}`;
  }

  function safeHref(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\s*javascript:/i.test(raw)) return '';
    if (/^[a-z]:[\\/]/i.test(raw) || /^\\\\/.test(raw)) return '';
    if (/^(www\.|docs\.google\.com|drive\.google\.com|sheets\.google\.com|slides\.google\.com)/i.test(raw)) {
      return `https://${raw}`;
    }
    return raw;
  }

  function isAbsoluteHref(href = '') {
    return /^[a-z][a-z0-9+.-]*:/i.test(String(href || '').trim());
  }

  function isKnownInternalHref(href = '') {
    const path = String(href || '').split(/[?#]/)[0].replace(/^\/+/, '');
    return /^docs\/[a-z0-9._/-]+\.md$/i.test(path)
      || /^assets\/[a-z0-9._/-]+\.(svg|png|jpe?g|webp|pdf|xlsx?|csv|docx?|pptx?|zip|txt)$/i.test(path);
  }

  function openableHref(rawHref = '') {
    const href = safeHref(rawHref);
    if (!href) return '';
    if (href.startsWith('#')) return href;
    if (isAbsoluteHref(href)) return href;
    if (isKnownInternalHref(href)) return href;
    return '';
  }

  function looksLikeDownload(item = {}, href = '') {
    const target = String(href || item.href || item.fileName || '').split(/[?#]/)[0].toLowerCase();
    return Boolean(item.fileName || item.storageMode === 'supabase' || /\.(xlsx?|csv|pdf|docx?|pptx?|zip|png|jpe?g|webp|mp4|mov|webm|txt)$/i.test(target));
  }

  function inferType(raw = {}) {
    const explicit = String(raw.type || '').trim();
    if (explicit) return explicit;
    const href = String(raw.href || raw.url || raw.link || '').toLowerCase();
    if (/docs\.google|\/document\//.test(href)) return 'Документ';
    if (/sheets\.google|\.xlsx?|\.csv/.test(href)) return 'Таблица';
    if (/slides\.google|\.pptx?/.test(href)) return 'Презентация';
    if (/drive\.google.*folders|sharepoint.*folder|\/folder/.test(href)) return 'Папка';
    if (/\.(mp4|mov|webm|avi)(\?|#|$)/.test(href)) return 'Видео';
    if (/\.[a-z0-9]{2,5}(\?|#|$)/.test(href)) return 'Файл';
    return 'Ссылка';
  }

  function normalizeResourceLink(raw = {}, source = 'user', groupFallback = DEFAULT_GROUP) {
    const href = safeHref(raw.href || raw.url || raw.link || '');
    const fileName = String(raw.fileName || raw.filename || '').trim();
    const fileSize = Math.max(0, Number(raw.fileSize || raw.size || 0) || 0);
    const title = String(raw.title || raw.name || href || 'Без названия').trim();
    const group = String(raw.group || raw.category || groupFallback || DEFAULT_GROUP).trim() || DEFAULT_GROUP;
    const description = String(raw.description || raw.note || '').trim();
    const owner = String(raw.owner || raw.addedBy || '').trim();
    return {
      id: stableResourceId(raw),
      title,
      description,
      href,
      group,
      type: inferType(raw),
      owner,
      fileName,
      fileSize,
      mimeType: String(raw.mimeType || raw.mime || '').trim(),
      storageMode: String(raw.storageMode || '').trim(),
      localFileId: String(raw.localFileId || '').trim(),
      bucket: String(raw.bucket || '').trim(),
      objectPath: String(raw.objectPath || '').trim(),
      relativePath: String(raw.relativePath || raw.path || '').trim(),
      folderId: String(raw.folderId || raw.parentFolderId || '').trim(),
      sizeMb: String(raw.sizeMb || '').trim(),
      createdAt: String(raw.createdAt || '').trim(),
      updatedAt: String(raw.updatedAt || raw.createdAt || '').trim(),
      source
    };
  }

  function normalizeResourceFolder(raw = {}, source = 'user') {
    const createdAt = String(raw.createdAt || '').trim();
    return {
      id: stableFolderId(raw),
      title: String(raw.title || raw.name || 'Без названия').trim() || 'Без названия',
      description: String(raw.description || raw.note || '').trim(),
      group: String(raw.group || raw.category || DEFAULT_GROUP).trim() || DEFAULT_GROUP,
      owner: String(raw.owner || raw.addedBy || '').trim(),
      createdAt,
      updatedAt: String(raw.updatedAt || createdAt || '').trim(),
      source
    };
  }

  function ensureStorageShape() {
    const state = appState();
    state.storage = state.storage && typeof state.storage === 'object' ? state.storage : {};
    state.storage.resourceLinks = Array.isArray(state.storage.resourceLinks) ? state.storage.resourceLinks : [];
    state.storage.resourceFolders = Array.isArray(state.storage.resourceFolders) ? state.storage.resourceFolders : [];
    state.docFilters = state.docFilters && typeof state.docFilters === 'object' ? state.docFilters : {};
    state.docFilters.search = String(state.docFilters.search || '');
    state.docFilters.group = String(state.docFilters.group || 'all');
    state.docFilters.type = String(state.docFilters.type || 'all');
    state.docFilters.folderId = String(state.docFilters.folderId || '');
    state.docFilters.folderFormOpen = Boolean(state.docFilters.folderFormOpen);
    state.documentStorageStatus = state.documentStorageStatus && typeof state.documentStorageStatus === 'object'
      ? state.documentStorageStatus
      : { message: '', tone: '' };
    return state;
  }

  function staticDocumentLinks() {
    const state = appState();
    return (state.documents?.groups || []).flatMap((group) => {
      const title = String(group?.title || DEFAULT_GROUP).trim() || DEFAULT_GROUP;
      return (group?.items || []).map((item) => normalizeResourceLink({
        ...item,
        id: stableStaticResourceId(item, title)
      }, 'static', title));
    });
  }

  function userDocumentLinks() {
    const state = ensureStorageShape();
    const localLinks = (state.storage.resourceLinks || []).map((item) => normalizeResourceLink(item, 'user', item.group || DEFAULT_GROUP));
    const remoteLinks = resourceLinksFromComments();
    const deleted = deletedResourceLinksFromComments();
    const merged = mergeNewestByKey([...localLinks, ...remoteLinks], resourceKey);
    return merged.filter((item) => {
      const key = resourceKey(item);
      return key && !deleted.has(key) && !deleted.has(item.id) && !deleted.has(item.href);
    });
  }

  function itemTimestamp(item = {}) {
    const stamp = Date.parse(item.updatedAt || item.createdAt || '') || 0;
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function mergeNewestByKey(items, keyOf) {
    const merged = new Map();
    (items || []).forEach((item) => {
      const key = String(keyOf(item) || '').trim();
      if (!key) return;
      const current = merged.get(key);
      if (!current || itemTimestamp(item) >= itemTimestamp(current)) merged.set(key, item);
    });
    return [...merged.values()];
  }

  function userResourceFolders() {
    const state = ensureStorageShape();
    const localFolders = (state.storage.resourceFolders || []).map((item) => normalizeResourceFolder(item, 'user'));
    const remoteFolders = resourceFoldersFromComments();
    const deleted = deletedResourceFoldersFromComments();
    return mergeNewestByKey([...localFolders, ...remoteFolders], (item) => item.id)
      .filter((item) => item.id && !deleted.has(item.id))
      .sort((left, right) => left.title.localeCompare(right.title, 'ru'));
  }

  function validFolderId(rawFolderId = '', folders = userResourceFolders()) {
    const folderId = String(rawFolderId || '').trim();
    return folderId && folders.some((folder) => folder.id === folderId) ? folderId : '';
  }

  function allDocumentLinks() {
    const userItems = userDocumentLinks();
    const userById = new Map(userItems.map((item) => [item.id, item]));
    const staticItems = staticDocumentLinks().map((baseItem) => {
      const placement = userById.get(baseItem.id);
      if (!placement) return baseItem;
      userById.delete(baseItem.id);
      const folderId = String(placement.folderId || '').trim();
      return {
        ...baseItem,
        folderId,
        group: folderId ? (placement.group || baseItem.group) : baseItem.group,
        createdAt: placement.createdAt || baseItem.createdAt,
        updatedAt: placement.updatedAt || placement.createdAt || baseItem.updatedAt,
        source: 'static'
      };
    });
    return [...userById.values(), ...staticItems];
  }

  function filteredDocumentLinks(items) {
    const state = ensureStorageShape();
    const search = String(state.docFilters.search || '').trim().toLowerCase();
    const group = state.docFilters.group || 'all';
    const type = state.docFilters.type || 'all';
    const source = Array.isArray(items) ? items : allDocumentLinks();
    return source.filter((item) => {
      const haystack = [item.title, item.description, item.href, item.group, item.type, item.owner, item.folderTitle].join(' ').toLowerCase();
      if (group !== 'all' && item.group !== group) return false;
      if (type !== 'all' && item.type !== type) return false;
      if (search && !haystack.includes(search)) return false;
      return true;
    });
  }

  function groupDocumentLinks(items) {
    const map = new Map();
    items.forEach((item) => {
      const key = item.group || DEFAULT_GROUP;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return [...map.entries()].map(([title, groupItems]) => ({ title, items: groupItems }));
  }

  function selectOptions(values, active, allLabel) {
    return [
      `<option value="all">${html(allLabel)}</option>`,
      ...values.map((value) => `<option value="${html(value)}" ${active === value ? 'selected' : ''}>${html(value)}</option>`)
    ].join('');
  }

  function folderSelectOptions(folders, activeId = '', rootLabel = 'Без папки') {
    return [
      `<option value="" ${activeId ? '' : 'selected'}>${html(rootLabel)}</option>`,
      ...(folders || []).map((folder) => `<option value="${html(folder.id)}" ${activeId === folder.id ? 'selected' : ''}>${html(folder.title)} · ${html(folder.group)}</option>`)
    ].join('');
  }

  function resourceMeta(item) {
    const meta = [chip(item.type || 'Ссылка', item.source === 'user' ? 'info' : '')];
    if (item.owner) meta.push(chip(item.owner));
    if (item.source === 'user') meta.push(chip('добавлено командой', 'ok'));
    if (item.storageMode === 'local-file') meta.push(chip('локальный файл', 'warn'));
    if (item.storageMode === 'supabase') meta.push(chip('файл загружен', 'ok'));
    if (item.storageMode === 'missing-file') meta.push(chip('файл не прикреплён', 'warn'));
    if (item.folderTitle) meta.push(chip(`Папка: ${item.folderTitle}`, 'info'));
    if (item.fileSize) meta.push(chip(formatBytes(item.fileSize)));
    else if (item.sizeMb && item.sizeMb !== '0') meta.push(chip(`${item.sizeMb} MB`));
    return meta.join('');
  }

  function renderResourceCard(item, folders = []) {
    const href = openableHref(item.href);
    const hasHref = Boolean(href);
    const hasLocalFile = Boolean(item.localFileId);
    const sourceLabel = item.fileName || item.storageMode ? 'рабочий файл' : 'рабочая ссылка';
    const actions = [];
    if (hasLocalFile) {
      actions.push(`<button class="link-btn doc-action" type="button" data-open-resource-file="${html(item.localFileId)}">Скачать файл</button>`);
    }
    if (hasHref) {
      const download = looksLikeDownload(item, href);
      const downloadAttr = download && !/^https?:\/\//i.test(href) ? ` download="${html(item.fileName || item.title || 'file')}"` : '';
      actions.push(`<a class="doc-action" href="${html(href)}" target="_blank" rel="noopener" draggable="false"${downloadAttr}>${download ? 'Скачать файл' : 'Открыть'}</a>`);
    }
    const action = actions.length
      ? actions.join('')
      : `<span class="doc-action is-disabled">${item.fileName || item.storageMode === 'missing-file' ? 'Файл не прикреплён' : 'Файл или ссылка не указаны'}</span>`;
    const deleteAction = item.source === 'user'
      ? `<button class="link-btn document-storage-delete" type="button" data-delete-resource-link="${html(item.id)}">Удалить</button>`
      : '';
    const moveAction = `<label class="document-storage-move"><span>Переместить</span><select aria-label="Папка для ${html(item.title)}" data-move-resource-link="${html(item.id)}">${folderSelectOptions(folders, validFolderId(item.folderId, folders))}</select></label>`;
    return `
      <div class="doc-card document-storage-card ${item.source === 'user' ? 'is-user-added' : ''} ${hasHref || hasLocalFile ? '' : 'is-disabled'}" draggable="true" data-document-resource-card data-document-resource-id="${html(item.id)}">
        <div class="doc-top">
          <span class="doc-type">${html(item.group)}</span>
          <span class="document-storage-card-source"><span class="muted small">${html(item.source === 'user' ? sourceLabel : 'база')}</span><span class="document-storage-drag-handle" title="Перетащите карточку в папку" aria-hidden="true">⋮⋮</span></span>
        </div>
        <strong>${html(item.title)}</strong>
        ${item.fileName ? `<div class="muted small">${html(item.fileName)}</div>` : ''}
        <p>${html(item.description || 'Описание пока не заполнено.')}</p>
        <div class="badge-stack">${resourceMeta(item)}</div>
        ${moveAction}
        <div class="document-storage-actions">${action}${deleteAction}</div>
      </div>
    `;
  }

  function folderStats(folder, items) {
    const folderItems = (items || []).filter((item) => item.folderId === folder.id);
    return {
      count: folderItems.length,
      bytes: folderItems.reduce((sum, item) => sum + Number(item.fileSize || 0), 0)
    };
  }

  function renderFolderCard(folder, items) {
    const stats = folderStats(folder, items);
    return `
      <article class="document-storage-folder-card" data-storage-folder-card="${html(folder.id)}" data-drop-document-folder="${html(folder.id)}" aria-label="Папка ${html(folder.title)}. Сюда можно перетащить карточку файла">
        <button class="document-storage-folder-open" type="button" data-open-document-folder="${html(folder.id)}">
          <span class="document-storage-folder-icon" aria-hidden="true">▰</span>
          <span class="document-storage-folder-copy">
            <strong>${html(folder.title)}</strong>
            <small>${html(folder.description || folder.group)}</small>
          </span>
        </button>
        <div class="document-storage-folder-meta">
          ${chip(formatFileCount(stats.count), stats.count ? 'info' : '')}
          ${chip(folder.group)}
          ${stats.bytes ? chip(formatBytes(stats.bytes)) : ''}
          ${folder.owner ? chip(folder.owner) : ''}
        </div>
        <div class="document-storage-folder-drop-hint"><span aria-hidden="true">↳</span> Перетащите карточку сюда</div>
        <button class="link-btn document-storage-folder-delete" type="button" data-delete-document-folder="${html(folder.id)}">Удалить папку</button>
      </article>
    `;
  }

  function renderEmptyState() {
    return `
      <div class="empty document-storage-empty">
        Ничего не найдено. Измени фильтр или добавь новый файл или ссылку в хранилище.
      </div>
    `;
  }

  function setStorageStatus(message = '', tone = 'info') {
    const state = ensureStorageShape();
    state.documentStorageStatus = {
      message: String(message || '').trim(),
      tone: String(tone || 'info').trim()
    };
  }

  function renderStorageStatus() {
    const status = ensureStorageShape().documentStorageStatus || {};
    if (!status.message) return '';
    return `<div class="banner document-storage-status is-${html(status.tone || 'info')}"><div>i</div><div>${html(status.message)}</div></div>`;
  }

  function readCommentPayload(text = '', marker = RESOURCE_LINK_MARKER) {
    const raw = String(text || '');
    const index = raw.indexOf(marker);
    if (index < 0) return null;
    const json = raw.slice(index + marker.length).trim();
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch (error) {
      console.warn('[document-storage] payload parse', error);
      return null;
    }
  }

  function resourceKey(item = {}) {
    return String(item.id || item.href || item.localFileId || '').trim();
  }

  function resourceEventCommentId(item = {}, deleted = false) {
    const seed = [
      item.id,
      item.href,
      item.localFileId,
      item.objectPath,
      item.title,
      item.fileName
    ].map((value) => String(value || '').trim()).filter(Boolean).join('|') || `${Date.now()}|${Math.random()}`;
    const prefix = deleted ? 'resource-link-delete' : 'resource-link';
    if (typeof window.stableId === 'function') return window.stableId(prefix, seed);
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(index);
      hash |= 0;
    }
    return `${prefix}-${Math.abs(hash).toString(36)}`;
  }

  function resourceFolderEventCommentId(folder = {}, deleted = false) {
    const seed = String(folder.id || `${folder.group || ''}|${folder.title || ''}`).trim() || `${Date.now()}|${Math.random()}`;
    const prefix = deleted ? 'resource-folder-delete' : 'resource-folder';
    if (typeof window.stableId === 'function') return window.stableId(prefix, seed);
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(index);
      hash |= 0;
    }
    return `${prefix}-${Math.abs(hash).toString(36)}`;
  }

  function upsertLocalResourceComment(comment) {
    const state = ensureStorageShape();
    state.storage.comments = Array.isArray(state.storage.comments) ? state.storage.comments : [];
    const index = state.storage.comments.findIndex((item) => String(item?.id || '') === String(comment.id || ''));
    if (index >= 0) state.storage.comments.splice(index, 1, comment);
    else state.storage.comments.unshift(comment);
    persistStorage('resource-link-event');
  }

  function openFileDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('Браузер не поддерживает локальное файловое хранилище.'));
        return;
      }
      const request = window.indexedDB.open(LOCAL_FILE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LOCAL_FILE_STORE)) db.createObjectStore(LOCAL_FILE_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Не удалось открыть файловое хранилище.'));
    });
  }

  function withFileStore(mode, callback) {
    return openFileDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_FILE_STORE, mode);
      const store = tx.objectStore(LOCAL_FILE_STORE);
      const result = callback(store);
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Ошибка файлового хранилища.'));
      };
    }));
  }

  function putLocalResourceFile(id, file) {
    return withFileStore('readwrite', (store) => {
      store.put({
        id,
        blob: file,
        name: file.name || 'file',
        type: file.type || 'application/octet-stream',
        size: Number(file.size || 0),
        updatedAt: new Date().toISOString()
      });
    });
  }

  function getLocalResourceFile(id) {
    return openFileDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_FILE_STORE, 'readonly');
      const request = tx.objectStore(LOCAL_FILE_STORE).get(id);
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error || new Error('Не удалось прочитать файл.'));
      };
    }));
  }

  function deleteLocalResourceFile(id) {
    return withFileStore('readwrite', (store) => {
      store.delete(id);
    }).catch((error) => console.warn('[document-storage] delete local file', error));
  }

  function remoteConfig() {
    try {
      if (typeof teamRestConfig === 'function') return teamRestConfig();
    } catch {}
    const state = appState();
    const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
    const url = String(cfg?.supabase?.url || '').replace(/\/+$/, '');
    const anonKey = cfg?.supabase?.anonKey || '';
    const accessToken = state.team?.accessToken || '';
    return url && anonKey && accessToken ? { baseUrl: url, anonKey, accessToken } : null;
  }

  function encodePath(path = '') {
    if (typeof encodeStoragePath === 'function') return encodeStoragePath(path);
    return String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function fileExt(name = '') {
    const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : 'bin';
  }

  function cleanPathPart(value = 'file') {
    const ascii = String(value || 'file')
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_ .-]+|[_ .-]+$/g, '')
      .slice(0, 80);
    return ascii || 'file';
  }

  function resourceFilePath(file) {
    return String(file?.webkitRelativePath || file?.relativePath || file?.name || 'file')
      .replace(/\\+/g, '/')
      .split('/')
      .filter(Boolean)
      .map(cleanPathPart)
      .join('/') || 'file';
  }

  function selectedResourceFiles(form) {
    const inputs = [
      form.querySelector('input[name="file"]'),
      form.querySelector('input[name="folder"]')
    ].filter(Boolean);
    const seen = new Set();
    return inputs.flatMap((input) => Array.from(input.files || []))
      .filter((file) => {
        const key = [file.webkitRelativePath || file.name || '', file.size || 0, file.lastModified || 0].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  async function uploadResourceFileRemote(resourceId, file) {
    const cfg = remoteConfig();
    if (!cfg?.baseUrl || !cfg?.anonKey || !cfg?.accessToken) return null;
    if (Number(file.size || 0) > REMOTE_FILE_MAX_BYTES) return null;
    const brand = typeof currentBrand === 'function' ? currentBrand() : 'altea';
    const objectPath = `resource-storage/${cleanPathPart(brand)}/${Date.now()}-${cleanPathPart(resourceId)}/${resourceFilePath(file)}`;
    const uploadUrl = `${cfg.baseUrl}/storage/v1/object/${encodeURIComponent(RESOURCE_BUCKET)}/${encodePath(objectPath)}`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'false'
      },
      body: file
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body || `Storage upload ${response.status}`);
    }
    const href = typeof taskAttachmentPublicUrl === 'function'
      ? taskAttachmentPublicUrl(RESOURCE_BUCKET, objectPath)
      : `${cfg.baseUrl}/storage/v1/object/public/${encodeURIComponent(RESOURCE_BUCKET)}/${encodePath(objectPath)}`;
    return { href, bucket: RESOURCE_BUCKET, objectPath, storageMode: 'supabase' };
  }

  async function deleteResourceFileRemote(item = {}) {
    const cfg = remoteConfig();
    const bucket = String(item.bucket || RESOURCE_BUCKET || '').trim();
    const objectPath = String(item.objectPath || '').trim();
    if (!cfg?.baseUrl || !cfg?.anonKey || !cfg?.accessToken || !bucket || !objectPath) return false;
    const deleteUrl = `${cfg.baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`;
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefixes: [objectPath] })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body || `Storage delete ${response.status}`);
    }
    return true;
  }

  async function openLocalResourceFile(id) {
    const record = await getLocalResourceFile(id);
    if (!record?.blob) {
      setError('Файл доступен только в браузере, где его добавили. Если нужен общий доступ, добавьте ссылку на Drive/SharePoint или включите Supabase storage.');
      return;
    }
    const url = URL.createObjectURL(record.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = record.name || 'file';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function resourceLinksFromComments() {
    const state = ensureStorageShape();
    return (state.storage.comments || [])
      .filter((comment) => comment?.articleKey === RESOURCE_ARTICLE_KEY && comment?.type === 'resource_link')
      .map((comment) => {
        const payload = readCommentPayload(comment.text, RESOURCE_LINK_MARKER);
        return payload ? normalizeResourceLink({
          ...payload,
          createdAt: payload.createdAt || comment.createdAt,
          owner: payload.owner || comment.author
        }, 'user', payload.group || DEFAULT_GROUP) : null;
      })
      .filter(Boolean);
  }

  function deletedResourceLinksFromComments() {
    const state = ensureStorageShape();
    const deleted = new Set();
    (state.storage.comments || [])
      .filter((comment) => comment?.articleKey === RESOURCE_ARTICLE_KEY && comment?.type === 'resource_link_delete')
      .forEach((comment) => {
        const payload = readCommentPayload(comment.text, RESOURCE_DELETE_MARKER);
        if (!payload) return;
        [payload.id, payload.href].map((item) => String(item || '').trim()).filter(Boolean).forEach((item) => deleted.add(item));
      });
    return deleted;
  }

  function resourceFoldersFromComments() {
    const state = ensureStorageShape();
    return (state.storage.comments || [])
      .filter((comment) => comment?.articleKey === RESOURCE_ARTICLE_KEY && comment?.type === 'resource_folder')
      .map((comment) => {
        const payload = readCommentPayload(comment.text, RESOURCE_FOLDER_MARKER);
        return payload ? normalizeResourceFolder({
          ...payload,
          createdAt: payload.createdAt || comment.createdAt,
          updatedAt: payload.updatedAt || payload.createdAt || comment.createdAt,
          owner: payload.owner || comment.author
        }, 'user') : null;
      })
      .filter(Boolean);
  }

  function deletedResourceFoldersFromComments() {
    const state = ensureStorageShape();
    const deleted = new Set();
    (state.storage.comments || [])
      .filter((comment) => comment?.articleKey === RESOURCE_ARTICLE_KEY && comment?.type === 'resource_folder_delete')
      .forEach((comment) => {
        const payload = readCommentPayload(comment.text, RESOURCE_FOLDER_DELETE_MARKER);
        const folderId = String(payload?.id || '').trim();
        if (folderId) deleted.add(folderId);
      });
    return deleted;
  }

  function ensureAccessAllowsStorage() {
    const access = window.__ALTEA_PORTAL_ACCESS__;
    if (!access || !Array.isArray(access.allowedViews) || !access.allowedViews.length) return;
    if (access.allowedViews.includes(STORAGE_VIEW)) return;
    access.allowedViews.push(STORAGE_VIEW);
    if (window.alteaPortalAccess && typeof window.alteaPortalAccess.apply === 'function') {
      window.alteaPortalAccess.apply();
    }
  }

  function revealStorageButton(button) {
    if (!button) return;
    button.type = 'button';
    button.dataset.view = STORAGE_VIEW;
    if (button.hidden) button.hidden = false;
    button.classList.remove('portal-access-hidden', 'nav-btn-legacy-hidden', 'hidden');
    if (button.hasAttribute('hidden')) button.removeAttribute('hidden');
    if (button.getAttribute('aria-hidden') === 'true') button.removeAttribute('aria-hidden');
    if (button.hasAttribute('tabindex')) button.removeAttribute('tabindex');
    if (button.getAttribute('data-access-original-hidden') !== '0') button.setAttribute('data-access-original-hidden', '0');
    if (button.style.display) button.style.removeProperty('display');
    if (button.style.visibility) button.style.removeProperty('visibility');

    const title = button.querySelector('.nav-title') || button.querySelector('span:not(.nav-icon):not(.nav-copy)');
    const subtitle = button.querySelector('.nav-subtitle') || button.querySelector('small');
    if (title) title.textContent = 'Хранилище';
    if (subtitle) subtitle.textContent = 'файлы · ссылки · описания';
    if (!button.textContent.trim()) {
      button.innerHTML = '<span>Хранилище</span><small>файлы · ссылки · описания</small>';
    }
  }

  function ensureDocumentStorageShell() {
    ensureAccessAllowsStorage();

    const nav = document.querySelector('.sidebar .nav') || document.querySelector('.nav');
    if (nav) {
      let button = nav.querySelector('.nav-btn[data-view="documents"]');
      if (!button) {
        button = document.createElement('button');
        button.className = 'nav-btn';
        button.type = 'button';
        button.dataset.view = STORAGE_VIEW;
        button.innerHTML = '<span>Хранилище</span><small>файлы · ссылки · описания</small>';
      }
      revealStorageButton(button);
      const control = nav.querySelector('.nav-btn[data-view="control"]');
      if (control && control.nextSibling !== button) {
        nav.insertBefore(button, control.nextSibling);
      } else if (!button.parentNode) {
        nav.appendChild(button);
      }
      if (typeof window.setView === 'function' && button.dataset.documentStorageBound !== '1') {
        button.dataset.documentStorageBound = '1';
        button.addEventListener('click', () => window.setView(STORAGE_VIEW));
      }
    }

    if (window.alteaPortalAccess && typeof window.alteaPortalAccess.apply === 'function') {
      window.alteaPortalAccess.apply();
      const button = document.querySelector('.sidebar .nav .nav-btn[data-view="documents"], .nav .nav-btn[data-view="documents"]');
      revealStorageButton(button);
    }

    const main = document.querySelector('.main');
    if (main && !document.getElementById('view-documents')) {
      const section = document.createElement('section');
      section.className = 'view';
      section.id = 'view-documents';
      const controlSection = document.getElementById('view-control');
      main.insertBefore(section, controlSection?.nextSibling || main.querySelector('.view') || null);
    }
  }

  function startStorageShellGuard() {
    if (window.__ALTEA_DOCUMENT_STORAGE_SHELL_GUARD__) return;
    window.__ALTEA_DOCUMENT_STORAGE_SHELL_GUARD__ = true;
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      window.setTimeout(() => {
        queued = false;
        ensureDocumentStorageShell();
      }, 30);
    };
    [0, 80, 240, 600, 1200, 2400, 5000, 10000].forEach((delay) => {
      window.setTimeout(ensureDocumentStorageShell, delay);
    });
    ['altea:accesschange', 'altea:app-ready', 'altea:data-ready', 'altea:viewchange', 'load'].forEach((eventName) => {
      window.addEventListener(eventName, schedule);
    });
    if (typeof MutationObserver === 'function') {
      const observer = new MutationObserver(schedule);
      const target = document.querySelector('.sidebar') || document.body || document.documentElement;
      if (target) observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden', 'style'] });
    }
  }

  function setError(message) {
    if (typeof window.setAppError === 'function') {
      window.setAppError(message);
      return;
    }
    const banner = document.getElementById('appError');
    if (!banner) return;
    banner.textContent = message || '';
    banner.classList.toggle('hidden', !message);
  }

  function persistStorage(reason = 'resource-link') {
    if (typeof window.saveLocalStorage === 'function') {
      window.saveLocalStorage({ reason });
      return;
    }
    try {
      localStorage.setItem('brand-portal-local-v1', JSON.stringify(appState().storage || {}));
    } catch (error) {
      console.warn('[document-storage] save', error);
    }
  }

  function auditResourceLink(action, item = {}, extra = {}) {
    try {
      if (!window.alteaSecurityAudit || typeof window.alteaSecurityAudit.emit !== 'function') return;
      const actor = appState()?.team?.member?.name || item.owner || '';
      window.alteaSecurityAudit.emit(`document_storage.${action}`, {
        outcome: 'ok',
        severity: action.includes('delete') ? 'warning' : 'info',
        actorEmail: appState()?.team?.member?.email || '',
        actorRole: appState()?.team?.member?.role || '',
        targetType: 'document_storage_resource',
        targetId: item.id || item.href || item.localFileId || '',
        targetName: item.title || item.fileName || item.href || '',
        metadata: {
          actor,
          title: item.title || '',
          fileName: item.fileName || '',
          href: item.href || '',
          group: item.group || '',
          folderId: item.folderId || '',
          type: item.type || '',
          storageMode: item.storageMode || '',
          ...extra
        }
      });
    } catch (_) {}
  }

  async function persistResourceLinkEvent(item, deleted = false) {
    const marker = deleted ? RESOURCE_DELETE_MARKER : RESOURCE_LINK_MARKER;
    const actor = appState().team?.member?.name || item.owner || 'Команда';
    const payload = deleted
      ? {
          id: item.id || '',
          href: item.href || '',
          title: item.title || '',
          fileName: item.fileName || '',
          owner: item.owner || '',
          deletedBy: actor,
          deletedAt: new Date().toISOString()
        }
      : item;
    const createdAt = deleted ? (payload.deletedAt || new Date().toISOString()) : (item.updatedAt || item.createdAt || new Date().toISOString());
    const comment = {
      id: resourceEventCommentId(payload, deleted),
      articleKey: RESOURCE_ARTICLE_KEY,
      author: deleted ? actor : (item.owner || actor),
      team: 'Хранилище',
      type: deleted ? 'resource_link_delete' : 'resource_link',
      createdAt,
      text: `${marker} ${JSON.stringify(payload)}`
    };
    const hasRemoteSync = Boolean(remoteConfig()?.accessToken);
    try {
      if (typeof window.createComment === 'function') {
        await window.createComment(comment);
      } else {
        upsertLocalResourceComment(comment);
        if (typeof window.persistComment === 'function') await window.persistComment(comment);
      }
      return hasRemoteSync;
    } catch (error) {
      upsertLocalResourceComment(comment);
      console.warn('[document-storage] remote event', error);
      return false;
    }
  }

  async function persistResourceFolderEvent(folder, deleted = false) {
    const marker = deleted ? RESOURCE_FOLDER_DELETE_MARKER : RESOURCE_FOLDER_MARKER;
    const actor = appState().team?.member?.name || folder.owner || 'Команда';
    const payload = deleted
      ? {
          id: folder.id || '',
          title: folder.title || '',
          group: folder.group || '',
          owner: folder.owner || '',
          deletedBy: actor,
          deletedAt: new Date().toISOString()
        }
      : folder;
    const createdAt = deleted
      ? payload.deletedAt
      : (folder.updatedAt || folder.createdAt || new Date().toISOString());
    const comment = {
      id: resourceFolderEventCommentId(payload, deleted),
      articleKey: RESOURCE_ARTICLE_KEY,
      author: deleted ? actor : (folder.owner || actor),
      team: 'Хранилище',
      type: deleted ? 'resource_folder_delete' : 'resource_folder',
      createdAt,
      text: `${marker} ${JSON.stringify(payload)}`
    };
    const hasRemoteSync = Boolean(remoteConfig()?.accessToken);
    try {
      if (typeof window.createComment === 'function') {
        await window.createComment(comment);
      } else {
        upsertLocalResourceComment(comment);
        if (typeof window.persistComment === 'function') await window.persistComment(comment);
      }
      return hasRemoteSync;
    } catch (error) {
      upsertLocalResourceComment(comment);
      console.warn('[document-storage] remote folder event', error);
      return false;
    }
  }

  function upsertLocalResourceLink(item) {
    const state = ensureStorageShape();
    const id = String(item?.id || '').trim();
    state.storage.resourceLinks = [
      item,
      ...(state.storage.resourceLinks || []).filter((current) => String(current?.id || '').trim() !== id)
    ].slice(0, 500);
  }

  async function createResourceFolder(form) {
    const state = ensureStorageShape();
    const data = new FormData(form);
    const title = String(data.get('folderName') || '').trim();
    const group = String(data.get('folderGroup') || DEFAULT_GROUP).trim() || DEFAULT_GROUP;
    if (!title) {
      setStorageStatus('Укажите название папки.', 'warn');
      renderDocumentStorage();
      return;
    }
    const duplicate = userResourceFolders().some((folder) => folder.group === group && folder.title.toLocaleLowerCase('ru') === title.toLocaleLowerCase('ru'));
    if (duplicate) {
      setStorageStatus(`Папка «${title}» уже есть в контуре «${group}».`, 'warn');
      renderDocumentStorage();
      return;
    }
    const now = new Date().toISOString();
    const folder = normalizeResourceFolder({
      id: stableFolderId({ title, group, createdAt: now }),
      title,
      description: String(data.get('folderDescription') || '').trim(),
      group,
      owner: String(data.get('folderOwner') || state.team?.member?.name || '').trim(),
      createdAt: now,
      updatedAt: now
    });
    state.storage.resourceFolders = [folder, ...(state.storage.resourceFolders || []).filter((item) => item?.id !== folder.id)].slice(0, 200);
    state.docFilters.folderFormOpen = false;
    persistStorage('resource-folder-add');
    auditResourceLink('folder_add', folder, { targetType: 'document_storage_folder' });
    const synced = await persistResourceFolderEvent(folder, false);
    setStorageStatus(
      synced ? `Папка «${folder.title}» создана.` : `Папка «${folder.title}» создана локально; общий синк пока не подтверждён.`,
      synced ? 'ok' : 'warn'
    );
    renderDocumentStorage();
  }

  async function moveResourceToFolder(id, rawFolderId) {
    const state = ensureStorageShape();
    const folders = userResourceFolders();
    const folderId = validFolderId(rawFolderId, folders);
    const resourceId = String(id || '').trim();
    const current = allDocumentLinks().find((item) => item.id === resourceId);
    if (!current) return;
    const currentFolderId = validFolderId(current.folderId, folders);
    if (currentFolderId === folderId) return;
    const target = folders.find((folder) => folder.id === folderId);
    const canonicalStatic = staticDocumentLinks().find((item) => item.id === resourceId);
    const now = new Date().toISOString();
    const rootGroup = canonicalStatic?.group || current.group || DEFAULT_GROUP;
    const nextGroup = target?.group || rootGroup;
    const updated = normalizeResourceLink({
      ...current,
      folderId,
      group: nextGroup,
      createdAt: current.createdAt || now,
      updatedAt: now
    }, 'user', nextGroup);
    upsertLocalResourceLink(updated);
    persistStorage('resource-link-move');
    auditResourceLink('move', updated, { fromFolderId: currentFolderId, toFolderId: folderId });
    const synced = await persistResourceLinkEvent(updated, false);
    setStorageStatus(
      folderId
        ? `Файл или ссылка перемещены в папку «${target.title}».`
        : 'Файл или ссылка перемещены в корень хранилища.',
      synced ? 'ok' : 'warn'
    );
    renderDocumentStorage();
  }

  async function deleteResourceFolder(id) {
    const state = ensureStorageShape();
    const folderId = String(id || '').trim();
    const folder = userResourceFolders().find((item) => item.id === folderId);
    if (!folder) return;
    const count = allDocumentLinks().filter((item) => item.folderId === folderId).length;
    if (count) {
      setStorageStatus(`Папка «${folder.title}» не удалена: внутри ${formatFileCount(count)}. Сначала переместите их.`, 'warn');
      renderDocumentStorage();
      return;
    }
    state.storage.resourceFolders = (state.storage.resourceFolders || []).filter((item) => String(item?.id || '').trim() !== folderId);
    if (state.docFilters.folderId === folderId) state.docFilters.folderId = '';
    persistStorage('resource-folder-delete');
    auditResourceLink('folder_delete', folder, { targetType: 'document_storage_folder' });
    const synced = await persistResourceFolderEvent(folder, true);
    setStorageStatus(
      synced ? `Папка «${folder.title}» удалена.` : `Папка «${folder.title}» удалена локально; общий синк пока не подтверждён.`,
      synced ? 'ok' : 'warn'
    );
    renderDocumentStorage();
  }

  async function addResourceLink(form) {
    const state = ensureStorageShape();
    const data = new FormData(form);
    const files = selectedResourceFiles(form);
    const title = String(data.get('title') || '').trim();
    const href = safeHref(data.get('href') || '');
    if (!title && !files.length) {
      setStorageStatus('Заполни название или выбери файл для хранилища.', 'warn');
      setError('Заполни название или выбери файл для хранилища.');
      renderDocumentStorage();
      return;
    }
    if (!href && !files.length) {
      setStorageStatus('Добавь ссылку или выбери файл.', 'warn');
      setError('Добавь ссылку или выбери файл.');
      renderDocumentStorage();
      return;
    }
    const emptyFiles = files.filter((file) => Number(file.size || 0) <= 0);
    if (emptyFiles.length) {
      const message = `Не добавлены пустые файлы: ${emptyFiles.map((file) => file.webkitRelativePath || file.name || 'file').slice(0, 4).join(', ')}`;
      setStorageStatus(message, 'warn');
      setError(message);
      renderDocumentStorage();
      return;
    }
    const oversizedFiles = files.filter((file) => Number(file.size || 0) > REMOTE_FILE_MAX_BYTES);
    if (oversizedFiles.length) {
      const message = `Не добавлены файлы больше ${formatBytes(REMOTE_FILE_MAX_BYTES)}: ${oversizedFiles.map((file) => file.webkitRelativePath || file.name || 'file').slice(0, 4).join(', ')}`;
      setStorageStatus(message, 'warn');
      setError(message);
      renderDocumentStorage();
      return;
    }
    const rawType = String(data.get('type') || '').trim();
    const owner = String(data.get('owner') || state.team?.member?.name || '').trim();
    const description = String(data.get('description') || '').trim();
    const folders = userResourceFolders();
    const folderId = validFolderId(data.get('folderId') || '', folders);
    const targetFolder = folders.find((folder) => folder.id === folderId);
    const group = targetFolder?.group || String(data.get('group') || DEFAULT_GROUP).trim() || DEFAULT_GROUP;
    const pendingFiles = files.length ? files : [null];
    const additions = [];
    const failed = [];
    setStorageStatus(files.length ? `Загружаем файлов: ${files.length}...` : 'Сохраняем ссылку...', 'info');
    renderDocumentStorage();

    for (const file of pendingFiles) {
      const resourceId = `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const relativePath = file ? String(file.webkitRelativePath || file.name || '').replace(/\\+/g, '/') : '';
      let filePayload = {};
      if (file) {
      const remotePayload = await uploadResourceFileRemote(resourceId, file).catch((error) => {
        console.warn('[document-storage] remote file upload failed', error);
        failed.push(`${relativePath || file.name}: ${error.message || error}`);
        return null;
      });
      if (!remotePayload) {
        if (!href) {
          continue;
        }
        filePayload = { storageMode: 'missing-file' };
      } else {
        filePayload = remotePayload;
      }
      if (filePayload.storageMode === 'missing-file' && !href) {
        continue;
      }
      }
      additions.push(normalizeResourceLink({
        id: resourceId,
        title: title && pendingFiles.length === 1 ? title : (title ? `${title} · ${relativePath || file?.name || ''}` : (relativePath || file?.name || '')),
        href: filePayload.href || href,
        description: [description, relativePath && relativePath !== file?.name ? `Путь: ${relativePath}` : ''].filter(Boolean).join('\n'),
        group,
        type: file && (!rawType || rawType === 'Ссылка') ? inferType({ href: file.name }) : (rawType || 'Ссылка'),
        owner,
        fileName: file?.name || '',
        fileSize: Number(file?.size || 0),
        mimeType: file?.type || '',
        relativePath,
        folderId,
        ...filePayload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, 'user'));
    }

    if (!additions.length) {
      const tail = failed.length ? ` Supabase отклонил: ${failed.slice(0, 3).join(' | ')}` : '';
      const message = `Файлы не добавлены. Расширь MIME types у bucket portal-task-files или добавь ссылку на папку/файл.${tail}`;
      setStorageStatus(message, 'danger');
      setError(message);
      renderDocumentStorage();
      return;
    }
    state.storage.resourceLinks = [
      ...additions,
      ...(state.storage.resourceLinks || []).filter((item) => !additions.some((next) => safeHref(item.href || item.url || item.link || '') === next.href && next.href))
    ].slice(0, 500);
    persistStorage('resource-link-add');
    additions.forEach((item) => auditResourceLink('add', item));
    const syncResults = [];
    for (const item of additions) syncResults.push(await persistResourceLinkEvent(item, false));
    form.reset();
    const allSynced = syncResults.every(Boolean);
    const resultMessage = allSynced && !failed.length
      ? `Добавлено в хранилище: ${additions.length}.`
      : `Добавлено: ${additions.length}. ${failed.length ? `Не загрузились: ${failed.slice(0, 3).join(' | ')}. ` : ''}${allSynced ? '' : 'Часть записей сохранена только локально: общий Supabase-синк не подтвердился.'}`;
    setStorageStatus(resultMessage, allSynced && !failed.length ? 'ok' : 'warn');
    setError(resultMessage);
    renderDocumentStorage();
  }

  async function deleteResourceLink(id) {
    const state = ensureStorageShape();
    const resourceId = String(id || '').trim();
    const current = userDocumentLinks().find((item) => item.id === resourceId) || { id: resourceId };
    state.storage.resourceLinks = (state.storage.resourceLinks || []).filter((item) => String(item?.id || '').trim() !== resourceId);
    if (current.localFileId) await deleteLocalResourceFile(current.localFileId);
    if (current.objectPath || current.storageMode === 'supabase') {
      try {
        await deleteResourceFileRemote(current);
      } catch (error) {
        console.warn('[document-storage] remote file delete failed', error);
      }
    }
    persistStorage('resource-link-delete');
    auditResourceLink('delete', current, { resourceId });
    await persistResourceLinkEvent(current, true);
    renderDocumentStorage();
  }

  function bindDocumentStorage(root) {
    const state = ensureStorageShape();
    const search = root.querySelector('#docSearchInput');
    const group = root.querySelector('#docGroupFilter');
    const type = root.querySelector('#docTypeFilter');
    const form = root.querySelector('[data-document-storage-form]');
    const folderForm = root.querySelector('[data-document-storage-folder-form]');

    if (search) search.addEventListener('input', (event) => {
      state.docFilters.search = event.target.value;
      renderDocumentStorage();
    });
    if (group) group.addEventListener('change', (event) => {
      state.docFilters.group = event.target.value;
      state.docFilters.folderId = '';
      renderDocumentStorage();
    });
    if (type) type.addEventListener('change', (event) => {
      state.docFilters.type = event.target.value;
      renderDocumentStorage();
    });
    if (form) form.addEventListener('submit', (event) => {
      event.preventDefault();
      void addResourceLink(form);
    });
    if (folderForm) folderForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void createResourceFolder(folderForm);
    });
    root.querySelector('[data-document-storage-create-folder]')?.addEventListener('click', () => {
      state.docFilters.folderFormOpen = true;
      renderDocumentStorage();
      root.querySelector('[data-document-storage-folder-name]')?.focus();
    });
    root.querySelector('[data-document-storage-folder-cancel]')?.addEventListener('click', () => {
      state.docFilters.folderFormOpen = false;
      renderDocumentStorage();
    });
    root.querySelector('[data-document-storage-back]')?.addEventListener('click', () => {
      state.docFilters.folderId = '';
      renderDocumentStorage();
    });
    const fileInput = form?.querySelector('input[name="file"]');
    const folderInput = form?.querySelector('input[name="folder"]');
    const fileLabel = form?.querySelector('[data-document-storage-file-name]');
    if (fileInput && fileLabel) {
      const updateFileLabel = () => {
        const files = selectedResourceFiles(form);
        if (!files.length) {
          fileLabel.textContent = 'Файл не выбран';
          return;
        }
        const total = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
        const first = files[0]?.webkitRelativePath || files[0]?.name || '';
        fileLabel.textContent = files.length === 1
          ? `${first} · ${formatBytes(total) || '0 B'}`
          : `${files.length} файлов · ${formatBytes(total) || '0 B'}`;
      };
      fileInput.addEventListener('change', updateFileLabel);
      folderInput?.addEventListener('change', updateFileLabel);
    }

    const uploadFolder = form?.querySelector('select[name="folderId"]');
    const uploadGroup = form?.querySelector('select[name="group"]');
    uploadFolder?.addEventListener('change', () => {
      const folder = userResourceFolders().find((item) => item.id === uploadFolder.value);
      if (folder && uploadGroup) uploadGroup.value = folder.group;
    });

    root.querySelectorAll('[data-open-document-folder]').forEach((button) => {
      button.addEventListener('click', () => {
        const folder = userResourceFolders().find((item) => item.id === button.dataset.openDocumentFolder);
        if (!folder) return;
        state.docFilters.folderId = folder.id;
        state.docFilters.group = folder.group;
        renderDocumentStorage();
      });
    });
    root.querySelectorAll('[data-delete-document-folder]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void deleteResourceFolder(button.dataset.deleteDocumentFolder);
      });
    });
    root.querySelectorAll('[data-move-resource-link]').forEach((select) => {
      select.addEventListener('change', () => {
        void moveResourceToFolder(select.dataset.moveResourceLink, select.value);
      });
    });

    const clearDocumentDragState = () => {
      state.documentStorageDragId = '';
      root.classList.remove('is-document-dragging');
      root.querySelectorAll('.is-dragging, .is-drop-target').forEach((element) => {
        element.classList.remove('is-dragging', 'is-drop-target');
      });
    };
    root.querySelectorAll('[data-document-resource-card]').forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        const interactive = event.target?.closest?.('a, button, select, input, textarea, label');
        if (interactive && interactive !== card) {
          event.preventDefault();
          return;
        }
        const resourceId = String(card.dataset.documentResourceId || '').trim();
        if (!resourceId || !event.dataTransfer) {
          event.preventDefault();
          return;
        }
        state.documentStorageDragId = resourceId;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', resourceId);
        event.dataTransfer.setData('application/x-altea-document-resource', resourceId);
        card.classList.add('is-dragging');
        root.classList.add('is-document-dragging');
      });
      card.addEventListener('dragend', clearDocumentDragState);
    });
    root.querySelectorAll('[data-drop-document-folder]').forEach((target) => {
      const dragResourceId = (event) => String(
        state.documentStorageDragId
        || event.dataTransfer?.getData('application/x-altea-document-resource')
        || event.dataTransfer?.getData('text/plain')
        || ''
      ).trim();
      target.addEventListener('dragenter', (event) => {
        if (!dragResourceId(event)) return;
        event.preventDefault();
        target.classList.add('is-drop-target');
      });
      target.addEventListener('dragover', (event) => {
        if (!dragResourceId(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        target.classList.add('is-drop-target');
      });
      target.addEventListener('dragleave', (event) => {
        if (event.relatedTarget && target.contains(event.relatedTarget)) return;
        target.classList.remove('is-drop-target');
      });
      target.addEventListener('drop', (event) => {
        const resourceId = dragResourceId(event);
        if (!resourceId) return;
        event.preventDefault();
        event.stopPropagation();
        const folderId = String(target.dataset.dropDocumentFolder || '').trim();
        clearDocumentDragState();
        void moveResourceToFolder(resourceId, folderId);
      });
    });

    root.querySelectorAll('[data-delete-resource-link]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void deleteResourceLink(button.dataset.deleteResourceLink);
      });
    });
    root.querySelectorAll('[data-open-resource-file]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openLocalResourceFile(button.dataset.openResourceFile);
      });
    });
  }

  function renderDocumentStorage() {
    ensureDocumentStorageShell();
    const state = ensureStorageShape();
    const root = document.getElementById('view-documents');
    if (!root) return;

    const folders = userResourceFolders();
    const activeFolderId = validFolderId(state.docFilters.folderId, folders);
    if (state.docFilters.folderId && !activeFolderId) state.docFilters.folderId = '';
    const activeFolder = folders.find((folder) => folder.id === activeFolderId) || null;
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const allItems = allDocumentLinks().map((item) => {
      const folder = folderById.get(item.folderId);
      return folder ? { ...item, folderTitle: folder.title } : item;
    });
    const userItems = allItems.filter((item) => item.source === 'user');
    const hasSearch = Boolean(String(state.docFilters.search || '').trim());
    const scopedItems = activeFolder
      ? allItems.filter((item) => item.folderId === activeFolder.id)
      : (hasSearch
          ? allItems
          : allItems.filter((item) => !validFolderId(item.folderId, folders)));
    const filtered = filteredDocumentLinks(scopedItems);
    const groups = groupDocumentLinks(filtered);
    const groupOptions = [...new Set([...GROUPS, ...folders.map((folder) => folder.group), ...allItems.map((item) => item.group).filter(Boolean)])];
    const typeOptions = [...new Set([...TYPES, ...allItems.map((item) => item.type).filter(Boolean)])];
    const search = String(state.docFilters.search || '').trim().toLocaleLowerCase('ru');
    const visibleFolders = activeFolder ? [] : folders.filter((folder) => {
      if (state.docFilters.group !== 'all' && folder.group !== state.docFilters.group) return false;
      if (!search) return true;
      const statsItems = allItems.filter((item) => item.folderId === folder.id);
      const haystack = [folder.title, folder.description, folder.group, folder.owner, ...statsItems.flatMap((item) => [item.title, item.description])].join(' ').toLocaleLowerCase('ru');
      return haystack.includes(search);
    });
    const uploadFolderId = activeFolder?.id || '';
    const uploadGroup = activeFolder?.group || (state.docFilters.group !== 'all' ? state.docFilters.group : DEFAULT_GROUP);
    const folderFormGroup = activeFolder?.group || (state.docFilters.group !== 'all' ? state.docFilters.group : DEFAULT_GROUP);

    root.innerHTML = `
      <div class="document-storage-shell" data-document-storage-version="${html(VERSION)}">
        <div class="section-title document-storage-section-title">
          <div>
            <h2>Хранилище файлов и ссылок</h2>
            <p>Единое место для рабочих папок, файлов, отчетов и ссылок с коротким описанием.</p>
          </div>
          <div class="document-storage-header-actions">
            <button class="btn" type="button" data-document-storage-create-folder>+ Создать папку</button>
            <div class="badge-stack">
              ${chip(`${formatCount(folders.length)} папок`, folders.length ? 'info' : '')}
              ${chip(`${formatCount(allItems.length)} файлов и ссылок`, 'ok')}
              ${chip(`${formatCount(userItems.length)} добавлено`, userItems.length ? 'info' : '')}
            </div>
          </div>
        </div>

        ${activeFolder ? `
          <nav class="document-storage-breadcrumbs" data-document-storage-breadcrumbs aria-label="Путь к папке">
            <button class="link-btn" type="button" data-document-storage-back>← Все папки</button>
            <span aria-hidden="true">/</span>
            <strong aria-current="page">${html(activeFolder.title)}</strong>
            ${chip(activeFolder.group)}
          </nav>
          <div class="document-storage-root-dropzone" data-drop-document-root data-drop-document-folder="" aria-label="Переместить карточку из папки в корень хранилища">
            <span class="document-storage-root-dropzone-icon" aria-hidden="true">↰</span>
            <span><strong>Без папки</strong><small>Перетащите карточку сюда, чтобы вернуть её в корень</small></span>
          </div>
        ` : ''}

        ${state.docFilters.folderFormOpen ? `
          <div class="card document-storage-folder-form-card">
            <div class="section-subhead">
              <div>
                <h3>Новая папка</h3>
                <p class="small muted">Соберите файлы одной тематики в отдельном разделе.</p>
              </div>
            </div>
            <form class="document-storage-folder-form" data-document-storage-folder-form>
              <input name="folderName" data-document-storage-folder-name placeholder="Название папки" required>
              <select name="folderGroup">${groupOptions.map((item) => `<option value="${html(item)}" ${item === folderFormGroup ? 'selected' : ''}>${html(item)}</option>`).join('')}</select>
              <input name="folderOwner" placeholder="Owner или команда" value="${html(state.team?.member?.name || '')}">
              <input name="folderDescription" placeholder="Коротко: что хранится внутри">
              <div class="document-storage-folder-form-actions">
                <button class="btn" type="submit" data-document-storage-create-folder-submit>Создать</button>
                <button class="link-btn" type="button" data-document-storage-folder-cancel>Отмена</button>
              </div>
            </form>
          </div>
        ` : ''}

        <div class="filters docs-filters document-storage-filters">
          <input id="docSearchInput" placeholder="Поиск по названию, описанию, owner или ссылке" value="${html(state.docFilters.search)}">
          <select id="docGroupFilter">${selectOptions(groupOptions, state.docFilters.group, 'Все группы')}</select>
          <select id="docTypeFilter">${selectOptions(typeOptions, state.docFilters.type, 'Все типы')}</select>
        </div>

        <div class="card document-storage-form-card" id="documentStorageForm">
          <div class="section-subhead">
            <div>
              <h3>Добавить файл или ссылку</h3>
              <p class="small muted">Выберите файл или вставьте ссылку, затем опишите, что это и когда использовать.</p>
            </div>
            ${chip('рабочее хранилище', 'info')}
          </div>
          <form class="document-storage-form" data-document-storage-form>
            <input name="title" placeholder="Название">
            <input name="href" placeholder="Ссылка на файл, папку или документ">
            <label class="document-storage-file-picker">
              <input class="document-storage-file-control" name="file" type="file" multiple>
              <span>Выбрать файлы</span>
              <em data-document-storage-file-name>Файл не выбран</em>
            </label>
            <label class="document-storage-file-picker">
              <input class="document-storage-file-control" name="folder" type="file" webkitdirectory directory multiple>
              <span>Загрузить папку с компьютера</span>
              <em>Загрузит все файлы внутри</em>
            </label>
            <select id="docUploadGroupSelect" name="group">${groupOptions.map((item) => `<option value="${html(item)}" ${item === uploadGroup ? 'selected' : ''}>${html(item)}</option>`).join('')}</select>
            <select id="docUploadFolderSelect" name="folderId" aria-label="Папка назначения">${folderSelectOptions(folders, uploadFolderId)}</select>
            <select name="type">${TYPES.map((item) => `<option value="${html(item)}">${html(item)}</option>`).join('')}</select>
            <input name="owner" placeholder="Owner или команда">
            <textarea name="description" placeholder="Что это за ссылка и когда ей пользоваться"></textarea>
            <button class="btn" type="submit">Сохранить</button>
          </form>
          ${renderStorageStatus()}
        </div>

        ${!activeFolder && visibleFolders.length ? `
          <div class="card document-storage-folders-card">
            <div class="section-subhead">
              <div>
                <h3>Папки</h3>
                <p class="small muted">Перетащите карточку на папку или откройте папку, чтобы увидеть содержимое.</p>
              </div>
              ${chip(`${formatCount(visibleFolders.length)} шт.`)}
            </div>
            <div class="document-storage-folder-grid">${visibleFolders.map((folder) => renderFolderCard(folder, allItems)).join('')}</div>
          </div>
        ` : ''}

        <div class="doc-groups document-storage-groups">
          ${groups.length ? groups.map((group) => `
            <div class="card">
              <div class="section-subhead">
                <div>
                  <h3>${html(group.title)}</h3>
                  <p class="small muted">Файлы и ссылки этого контура.</p>
                </div>
                ${chip(`${formatCount(group.items.length)} шт.`)}
              </div>
              <div class="doc-grid">${group.items.map((item) => renderResourceCard(item, folders)).join('')}</div>
            </div>
          `).join('') : (!visibleFolders.length ? renderEmptyState() : '')}
        </div>
      </div>
    `;

    bindDocumentStorage(root);
  }

  window.__ALTEA_DOCUMENT_STORAGE_V1__ = {
    version: VERSION,
    ensureShell: ensureDocumentStorageShell,
    render: renderDocumentStorage
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startStorageShellGuard, { once: true });
  } else {
    startStorageShellGuard();
  }
})();

function renderDocuments() {
  if (window.__ALTEA_DOCUMENT_STORAGE_V1__?.render) {
    return window.__ALTEA_DOCUMENT_STORAGE_V1__.render();
  }
}
