(function () {
  'use strict';

  const VERSION = '20260629-storage-v3';
  const STORAGE_VIEW = 'documents';
  const RESOURCE_ARTICLE_KEY = '__portal_resource_links__';
  const RESOURCE_LINK_MARKER = '[[resource-link:v1]]';
  const RESOURCE_DELETE_MARKER = '[[resource-link-delete:v1]]';
  const RESOURCE_BUCKET = 'portal-task-files';
  const LOCAL_FILE_DB = 'altea-document-storage-files-v1';
  const LOCAL_FILE_STORE = 'files';
  const REMOTE_FILE_MAX_BYTES = 50 * 1024 * 1024;
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
      || /^assets\/[a-z0-9._/-]+\.(svg|png|jpe?g|webp|pdf)$/i.test(path);
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
      sizeMb: String(raw.sizeMb || '').trim(),
      createdAt: String(raw.createdAt || '').trim(),
      source
    };
  }

  function ensureStorageShape() {
    const state = appState();
    state.storage = state.storage && typeof state.storage === 'object' ? state.storage : {};
    state.storage.resourceLinks = Array.isArray(state.storage.resourceLinks) ? state.storage.resourceLinks : [];
    state.docFilters = state.docFilters && typeof state.docFilters === 'object' ? state.docFilters : {};
    state.docFilters.search = String(state.docFilters.search || '');
    state.docFilters.group = String(state.docFilters.group || 'all');
    state.docFilters.type = String(state.docFilters.type || 'all');
    return state;
  }

  function staticDocumentLinks() {
    const state = appState();
    return (state.documents?.groups || []).flatMap((group) => {
      const title = String(group?.title || DEFAULT_GROUP).trim() || DEFAULT_GROUP;
      return (group?.items || []).map((item) => normalizeResourceLink(item, 'static', title));
    });
  }

  function userDocumentLinks() {
    const state = ensureStorageShape();
    const localLinks = (state.storage.resourceLinks || []).map((item) => normalizeResourceLink(item, 'user', item.group || DEFAULT_GROUP));
    const remoteLinks = resourceLinksFromComments();
    const deleted = deletedResourceLinksFromComments();
    const seen = new Set();
    return [...localLinks, ...remoteLinks]
      .filter((item) => {
        const key = resourceKey(item);
        if (!key || seen.has(key) || deleted.has(key) || deleted.has(item.id) || deleted.has(item.href)) return false;
        seen.add(key);
        return true;
      });
  }

  function allDocumentLinks() {
    return [...userDocumentLinks(), ...staticDocumentLinks()];
  }

  function filteredDocumentLinks() {
    const state = ensureStorageShape();
    const search = String(state.docFilters.search || '').trim().toLowerCase();
    const group = state.docFilters.group || 'all';
    const type = state.docFilters.type || 'all';
    return allDocumentLinks().filter((item) => {
      const haystack = [item.title, item.description, item.href, item.group, item.type, item.owner].join(' ').toLowerCase();
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

  function resourceMeta(item) {
    const meta = [chip(item.type || 'Ссылка', item.source === 'user' ? 'info' : '')];
    if (item.owner) meta.push(chip(item.owner));
    if (item.source === 'user') meta.push(chip('добавлено командой', 'ok'));
    if (item.storageMode === 'local-file') meta.push(chip('локальный файл', 'warn'));
    if (item.storageMode === 'supabase') meta.push(chip('файл загружен', 'ok'));
    if (item.storageMode === 'missing-file') meta.push(chip('файл не прикреплён', 'warn'));
    if (item.fileSize) meta.push(chip(formatBytes(item.fileSize)));
    else if (item.sizeMb && item.sizeMb !== '0') meta.push(chip(`${item.sizeMb} MB`));
    return meta.join('');
  }

  function renderResourceCard(item) {
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
      actions.push(`<a class="doc-action" href="${html(href)}" target="_blank" rel="noopener"${downloadAttr}>${download ? 'Скачать файл' : 'Открыть'}</a>`);
    }
    const action = actions.length
      ? actions.join('')
      : `<span class="doc-action is-disabled">${item.fileName || item.storageMode === 'missing-file' ? 'Файл не прикреплён' : 'Файл или ссылка не указаны'}</span>`;
    const deleteAction = item.source === 'user'
      ? `<button class="link-btn document-storage-delete" type="button" data-delete-resource-link="${html(item.id)}">Удалить</button>`
      : '';
    return `
      <div class="doc-card document-storage-card ${item.source === 'user' ? 'is-user-added' : ''} ${hasHref || hasLocalFile ? '' : 'is-disabled'}">
        <div class="doc-top">
          <span class="doc-type">${html(item.group)}</span>
          <span class="muted small">${html(item.source === 'user' ? sourceLabel : 'база')}</span>
        </div>
        <strong>${html(item.title)}</strong>
        ${item.fileName ? `<div class="muted small">${html(item.fileName)}</div>` : ''}
        <p>${html(item.description || 'Описание пока не заполнено.')}</p>
        <div class="badge-stack">${resourceMeta(item)}</div>
        <div class="document-storage-actions">${action}${deleteAction}</div>
      </div>
    `;
  }

  function renderEmptyState() {
    return `
      <div class="empty document-storage-empty">
        Ничего не найдено. Измени фильтр или добавь новый файл или ссылку в хранилище.
      </div>
    `;
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

  async function uploadResourceFileRemote(resourceId, file) {
    const cfg = remoteConfig();
    if (!cfg?.baseUrl || !cfg?.anonKey || !cfg?.accessToken) return null;
    if (Number(file.size || 0) > REMOTE_FILE_MAX_BYTES) return null;
    const brand = typeof currentBrand === 'function' ? currentBrand() : 'altea';
    const ext = fileExt(file.name || '');
    const objectPath = `resource-storage/${cleanPathPart(brand)}/${Date.now()}-${cleanPathPart(resourceId)}.${ext}`;
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

  async function persistResourceLinkEvent(item, deleted = false) {
    if (typeof window.createComment !== 'function') return;
    const marker = deleted ? RESOURCE_DELETE_MARKER : RESOURCE_LINK_MARKER;
    const payload = deleted
      ? { id: item.id || '', href: item.href || '', deletedAt: new Date().toISOString() }
      : item;
    try {
      await window.createComment({
        articleKey: RESOURCE_ARTICLE_KEY,
        author: item.owner || appState().team?.member?.name || 'Команда',
        team: 'Хранилище',
        type: deleted ? 'resource_link_delete' : 'resource_link',
        text: `${marker} ${JSON.stringify(payload)}`
      });
    } catch (error) {
      console.warn('[document-storage] remote event', error);
    }
  }

  async function addResourceLink(form) {
    const state = ensureStorageShape();
    const data = new FormData(form);
    const file = form.querySelector('input[name="file"]')?.files?.[0] || null;
    const title = String(data.get('title') || '').trim();
    const href = safeHref(data.get('href') || '');
    if (!title && !file) {
      setError('Заполни название или выбери файл для хранилища.');
      return;
    }
    if (!href && !file) {
      setError('Добавь ссылку или выбери файл.');
      return;
    }
    if (file && Number(file.size || 0) <= 0) {
      setError('Файл пустой, выбери другой.');
      return;
    }
    const resourceId = `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let filePayload = {};
    if (file) {
      try {
        const remotePayload = await uploadResourceFileRemote(resourceId, file).catch((error) => {
          console.warn('[document-storage] remote file upload skipped', error);
          return null;
        });
        if (remotePayload) {
          filePayload = remotePayload;
        } else {
          await putLocalResourceFile(resourceId, file);
          filePayload = { storageMode: 'local-file', localFileId: resourceId };
        }
      } catch (error) {
        console.warn('[document-storage] local file save failed', error);
        setError(`Не удалось сохранить файл: ${error.message || error}`);
        return;
      }
    }
    const rawType = String(data.get('type') || '').trim();
    const next = normalizeResourceLink({
      id: resourceId,
      title: title || file?.name || '',
      href: filePayload.href || href,
      description: String(data.get('description') || '').trim(),
      group: String(data.get('group') || DEFAULT_GROUP).trim() || DEFAULT_GROUP,
      type: file && (!rawType || rawType === 'Ссылка') ? inferType({ href: file.name }) : (rawType || 'Ссылка'),
      owner: String(data.get('owner') || state.team?.member?.name || '').trim(),
      fileName: file?.name || '',
      fileSize: Number(file?.size || 0),
      mimeType: file?.type || '',
      ...filePayload,
      createdAt: new Date().toISOString()
    }, 'user');
    state.storage.resourceLinks = [
      next,
      ...(state.storage.resourceLinks || []).filter((item) => safeHref(item.href || item.url || item.link || '') !== next.href)
    ].slice(0, 500);
    persistStorage('resource-link-add');
    await persistResourceLinkEvent(next, false);
    form.reset();
    setError('');
    renderDocumentStorage();
  }

  async function deleteResourceLink(id) {
    const state = ensureStorageShape();
    const resourceId = String(id || '').trim();
    const current = userDocumentLinks().find((item) => item.id === resourceId) || { id: resourceId };
    state.storage.resourceLinks = (state.storage.resourceLinks || []).filter((item) => String(item?.id || '').trim() !== resourceId);
    if (current.localFileId) await deleteLocalResourceFile(current.localFileId);
    persistStorage('resource-link-delete');
    await persistResourceLinkEvent(current, true);
    renderDocumentStorage();
  }

  function bindDocumentStorage(root) {
    const state = ensureStorageShape();
    const search = root.querySelector('#docSearchInput');
    const group = root.querySelector('#docGroupFilter');
    const type = root.querySelector('#docTypeFilter');
    const form = root.querySelector('[data-document-storage-form]');

    if (search) search.addEventListener('input', (event) => {
      state.docFilters.search = event.target.value;
      renderDocumentStorage();
    });
    if (group) group.addEventListener('change', (event) => {
      state.docFilters.group = event.target.value;
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
    const fileInput = form?.querySelector('input[name="file"]');
    const fileLabel = form?.querySelector('[data-document-storage-file-name]');
    if (fileInput && fileLabel) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0] || null;
        fileLabel.textContent = file ? `${file.name} · ${formatBytes(file.size) || '0 B'}` : 'Файл не выбран';
      });
    }

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

    const allItems = allDocumentLinks();
    const userItems = userDocumentLinks();
    const filtered = filteredDocumentLinks();
    const groups = groupDocumentLinks(filtered);
    const groupOptions = [...new Set([...GROUPS, ...allItems.map((item) => item.group).filter(Boolean)])];
    const typeOptions = [...new Set([...TYPES, ...allItems.map((item) => item.type).filter(Boolean)])];

    root.innerHTML = `
      <div class="document-storage-shell" data-document-storage-version="${html(VERSION)}">
        <div class="section-title">
          <div>
            <h2>Хранилище файлов и ссылок</h2>
            <p>Единое место для рабочих папок, файлов, отчетов и ссылок с коротким описанием.</p>
          </div>
          <div class="badge-stack">
            ${chip(`${formatCount(allItems.length)} всего`, 'ok')}
            ${chip(`${formatCount(userItems.length)} добавлено`, userItems.length ? 'info' : '')}
          </div>
        </div>

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
              <input class="document-storage-file-control" name="file" type="file">
              <span>Выбрать файл</span>
              <em data-document-storage-file-name>Файл не выбран</em>
            </label>
            <select name="group">${GROUPS.map((item) => `<option value="${html(item)}">${html(item)}</option>`).join('')}</select>
            <select name="type">${TYPES.map((item) => `<option value="${html(item)}">${html(item)}</option>`).join('')}</select>
            <input name="owner" placeholder="Owner или команда">
            <textarea name="description" required placeholder="Что это за ссылка и когда ей пользоваться"></textarea>
            <button class="btn" type="submit">Сохранить</button>
          </form>
        </div>

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
              <div class="doc-grid">${group.items.map(renderResourceCard).join('')}</div>
            </div>
          `).join('') : renderEmptyState()}
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
