(function () {
  if (window.__ALTEA_TEAM_RUNTIME_HOTFIX_20260629_TIMEOUT1__) return;
  window.__ALTEA_TEAM_RUNTIME_HOTFIX_20260629_TIMEOUT1__ = true;

  const TABLES = typeof TEAM_TABLES === 'object' && TEAM_TABLES ? TEAM_TABLES : {
    tasks: 'portal_tasks',
    comments: 'portal_comments',
    decisions: 'portal_decisions',
    owners: 'portal_owner_assignments'
  };

  function appState() {
    return typeof state === 'object' && state ? state : null;
  }

  function config() {
    try {
      return typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
    } catch {
      return window.APP_CONFIG || {};
    }
  }

  function currentBrandSafe() {
    if (typeof currentBrand === 'function') return currentBrand();
    return config().brand || 'Алтея';
  }

  function canUseRemote() {
    const cfg = config();
    return Boolean(cfg?.teamMode === 'supabase' && cfg?.supabase?.url && cfg?.supabase?.anonKey);
  }

  function restConfig() {
    const cfg = config();
    if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey || typeof fetch !== 'function') return null;
    return {
      baseUrl: String(cfg.supabase.url || '').replace(/\/+$/, ''),
      anonKey: cfg.supabase.anonKey,
      brand: currentBrandSafe(),
      accessToken: String(appState()?.team?.accessToken || '')
    };
  }

  async function readJson(response, label) {
    if (typeof readSupabaseJson === 'function') return readSupabaseJson(response, label);
    const bodyText = await response.text();
    if (!response.ok) throw new Error(`${label}: ${bodyText || response.status || 'request failed'}`);
    return bodyText ? JSON.parse(bodyText) : [];
  }

  function timeoutHotfix(promise, ms, label) {
    if (typeof withTimeout === 'function') return withTimeout(promise, ms, label);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(`${label} превысил ${Math.round(ms / 1000)} сек.`)), ms);
      Promise.resolve(promise)
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timer);
          reject(error);
        });
    });
  }

  async function signInViaRestHotfix() {
    const cfg = restConfig();
    if (!cfg) throw new Error('Supabase REST unavailable');
    const response = await timeoutHotfix(fetch(`${cfg.baseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: '{}'
    }), 8000, 'supabase anonymous sign-in');
    return timeoutHotfix(readJson(response, 'supabase anonymous sign-in'), 5000, 'supabase anonymous sign-in json');
  }

  async function signInAnonymouslyHotfix() {
    const cfg = config();
    if (window.supabase?.createClient && cfg?.supabase?.url && cfg?.supabase?.anonKey) {
      const client = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'altea-team-store'
        }
      });
      const response = await timeoutHotfix(client.auth.signInAnonymously(), 8000, 'supabase anonymous sign-in');
      if (response?.error) throw response.error;
      return {
        access_token: response?.data?.session?.access_token || '',
        user: response?.data?.user || null
      };
    }
    return signInViaRestHotfix();
  }

  function hasRemoteStoreHotfix() {
    const app = appState();
    return Boolean(app?.team?.ready && (app.team.accessToken || app.team.client));
  }

  function syncedItemStampHotfix(item = {}) {
    const value = item.updatedAt || item.updated_at || item.createdAt || item.created_at || '';
    const stamp = Date.parse(String(value || ''));
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function mergeRemoteListWithLocalHotfix(localItems = [], remoteItems = [], normalizeFn = (item) => item, keyFn = (item) => item?.id) {
    const merged = new Map();
    [...(Array.isArray(remoteItems) ? remoteItems : []), ...(Array.isArray(localItems) ? localItems : [])]
      .map((item) => normalizeFn(item))
      .filter(Boolean)
      .forEach((item) => {
        const key = String(keyFn(item) || '').trim();
        if (!key) return;
        const current = merged.get(key);
        if (!current || syncedItemStampHotfix(item) >= syncedItemStampHotfix(current)) merged.set(key, item);
      });
    return [...merged.values()].sort((a, b) => syncedItemStampHotfix(b) - syncedItemStampHotfix(a));
  }

  const RESOURCE_ARTICLE_KEY = '__portal_resource_links__';
  const RESOURCE_LINK_MARKER = '[[resource-link:v1]]';
  const RESOURCE_DELETE_MARKER = '[[resource-link-delete:v1]]';
  const RESOURCE_FOLDER_MARKER = '[[resource-folder:v1]]';
  const RESOURCE_FOLDER_DELETE_MARKER = '[[resource-folder-delete:v1]]';

  function resourceSyncHashHotfix(value = '') {
    const str = String(value || '');
    let hash = 0;
    for (let index = 0; index < str.length; index += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function resourceSyncIdHotfix(prefix, raw) {
    if (typeof stableId === 'function') return stableId(prefix, raw);
    return `${prefix}-${resourceSyncHashHotfix(raw)}`;
  }

  function readResourcePayloadHotfix(text = '', marker = RESOURCE_LINK_MARKER) {
    const raw = String(text || '');
    const index = raw.indexOf(marker);
    if (index < 0) return null;
    const json = raw.slice(index + marker.length).trim();
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch (error) {
      console.warn('[team-runtime-hotfix] resource payload parse', error);
      return null;
    }
  }

  function resourceStampHotfix(item = {}) {
    const stamp = Date.parse(String(item.updatedAt || item.createdAt || item.deletedAt || ''));
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function resourceKeyHotfix(item = {}) {
    return String(item.id || item.href || item.localFileId || item.objectPath || item.title || '').trim();
  }

  function normalizeResourceLinkHotfix(raw = {}, fallback = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const createdAt = String(raw.createdAt || fallback.createdAt || new Date().toISOString()).trim();
    const base = `${raw.href || raw.url || raw.link || fallback.href || ''}|${raw.title || raw.name || raw.fileName || fallback.title || ''}|${createdAt}`;
    const item = {
      id: String(raw.id || fallback.id || resourceSyncIdHotfix('resource', base)).trim(),
      title: String(raw.title || raw.name || raw.fileName || fallback.title || '').trim(),
      href: String(raw.href || raw.url || raw.link || fallback.href || '').trim(),
      description: String(raw.description || fallback.description || '').trim(),
      group: String(raw.group || fallback.group || 'Общее хранилище').trim() || 'Общее хранилище',
      folderId: String(raw.folderId || fallback.folderId || '').trim(),
      type: String(raw.type || fallback.type || 'Ссылка').trim() || 'Ссылка',
      owner: String(raw.owner || fallback.owner || '').trim(),
      fileName: String(raw.fileName || raw.name || fallback.fileName || '').trim(),
      fileSize: Number(raw.fileSize || raw.size || fallback.fileSize || 0) || 0,
      mimeType: String(raw.mimeType || fallback.mimeType || '').trim(),
      storageMode: String(raw.storageMode || fallback.storageMode || '').trim(),
      localFileId: String(raw.localFileId || fallback.localFileId || '').trim(),
      bucket: String(raw.bucket || fallback.bucket || '').trim(),
      objectPath: String(raw.objectPath || fallback.objectPath || '').trim(),
      sizeMb: String(raw.sizeMb || fallback.sizeMb || '').trim(),
      createdAt,
      updatedAt: String(raw.updatedAt || fallback.updatedAt || createdAt).trim(),
      source: 'user'
    };
    return resourceKeyHotfix(item) ? item : null;
  }

  function resourceLinksFromCommentsHotfix(comments = []) {
    return (Array.isArray(comments) ? comments : [])
      .filter((comment) => comment?.articleKey === RESOURCE_ARTICLE_KEY && comment?.type === 'resource_link')
      .map((comment) => {
        const payload = readResourcePayloadHotfix(comment.text, RESOURCE_LINK_MARKER);
        return payload ? normalizeResourceLinkHotfix(payload, {
          createdAt: comment.createdAt,
          owner: comment.author
        }) : null;
      })
      .filter(Boolean);
  }

  function deletedResourceKeysFromCommentsHotfix(comments = []) {
    const deleted = new Set();
    (Array.isArray(comments) ? comments : [])
      .filter((comment) => comment?.articleKey === RESOURCE_ARTICLE_KEY && comment?.type === 'resource_link_delete')
      .forEach((comment) => {
        const payload = readResourcePayloadHotfix(comment.text, RESOURCE_DELETE_MARKER);
        if (!payload) return;
        [payload.id, payload.href, payload.localFileId, payload.objectPath]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .forEach((value) => deleted.add(value));
      });
    return deleted;
  }

  function mergeResourceLinksWithCommentsHotfix(localLinks = [], comments = []) {
    const deleted = deletedResourceKeysFromCommentsHotfix(comments);
    const merged = new Map();
    [...resourceLinksFromCommentsHotfix(comments), ...(Array.isArray(localLinks) ? localLinks : []).map((item) => normalizeResourceLinkHotfix(item))]
      .filter(Boolean)
      .forEach((item) => {
        const key = resourceKeyHotfix(item);
        if (!key || deleted.has(key) || deleted.has(item.id) || deleted.has(item.href) || deleted.has(item.localFileId) || deleted.has(item.objectPath)) return;
        const current = merged.get(key);
        if (!current || resourceStampHotfix(item) >= resourceStampHotfix(current)) merged.set(key, item);
      });
    return [...merged.values()].sort((left, right) => resourceStampHotfix(right) - resourceStampHotfix(left)).slice(0, 500);
  }

  function normalizeResourceFolderHotfix(raw = {}, fallback = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title || raw.name || fallback.title || '').trim();
    if (!title) return null;
    const createdAt = String(raw.createdAt || fallback.createdAt || new Date().toISOString()).trim();
    const group = String(raw.group || fallback.group || 'Общее хранилище').trim() || 'Общее хранилище';
    const id = String(raw.id || fallback.id || resourceSyncIdHotfix('resource-folder', `${title}|${group}|${createdAt}`)).trim();
    if (!id) return null;
    return {
      id,
      title,
      description: String(raw.description || raw.note || fallback.description || '').trim(),
      group,
      owner: String(raw.owner || raw.createdBy || fallback.owner || '').trim(),
      createdAt,
      updatedAt: String(raw.updatedAt || fallback.updatedAt || createdAt).trim()
    };
  }

  function hydratePortalStorageBeforeRemoteHotfix() {
    try {
      if (typeof window.alteaHydratePortalStorageBeforeRemote === 'function') {
        return window.alteaHydratePortalStorageBeforeRemote();
      }
      if (window.__ALTEA_PORTAL_STORAGE_EARLY_HYDRATED__) return appState()?.storage || null;
      const app = appState();
      if (!app || typeof loadLocalStorage !== 'function') return app?.storage || null;
      const persisted = loadLocalStorage();
      app.storage = typeof completePortalStorage === 'function'
        ? completePortalStorage(persisted, app.storage || {})
        : { ...(app.storage || {}), ...(persisted || {}) };
      window.__ALTEA_PORTAL_STORAGE_EARLY_HYDRATED__ = true;
      return app.storage;
    } catch (error) {
      console.warn('[portal-team-runtime-hotfix:early-storage]', error);
      return appState()?.storage || null;
    }
  }

  hydratePortalStorageBeforeRemoteHotfix();

  function resourceFoldersFromCommentsHotfix(comments = []) {
    return (Array.isArray(comments) ? comments : [])
      .filter((comment) => comment?.articleKey === RESOURCE_ARTICLE_KEY && comment?.type === 'resource_folder')
      .map((comment) => {
        const payload = readResourcePayloadHotfix(comment.text, RESOURCE_FOLDER_MARKER);
        return payload ? normalizeResourceFolderHotfix(payload, {
          createdAt: comment.createdAt,
          owner: comment.author
        }) : null;
      })
      .filter(Boolean);
  }

  function deletedResourceFolderIdsFromCommentsHotfix(comments = []) {
    const deleted = new Set();
    (Array.isArray(comments) ? comments : [])
      .filter((comment) => comment?.articleKey === RESOURCE_ARTICLE_KEY && comment?.type === 'resource_folder_delete')
      .forEach((comment) => {
        const payload = readResourcePayloadHotfix(comment.text, RESOURCE_FOLDER_DELETE_MARKER);
        const id = String(payload?.id || '').trim();
        if (id) deleted.add(id);
      });
    return deleted;
  }

  function mergeResourceFoldersWithCommentsHotfix(localFolders = [], comments = []) {
    const deleted = deletedResourceFolderIdsFromCommentsHotfix(comments);
    const merged = new Map();
    [...resourceFoldersFromCommentsHotfix(comments), ...(Array.isArray(localFolders) ? localFolders : []).map((item) => normalizeResourceFolderHotfix(item))]
      .filter(Boolean)
      .forEach((folder) => {
        if (!folder.id || deleted.has(folder.id)) return;
        const current = merged.get(folder.id);
        if (!current || resourceStampHotfix(folder) >= resourceStampHotfix(current)) merged.set(folder.id, folder);
      });
    return [...merged.values()].sort((left, right) => resourceStampHotfix(right) - resourceStampHotfix(left)).slice(0, 300);
  }

  function mergeRemoteTasksWithLocalHotfix(remoteTasks = []) {
    const app = appState();
    const normalize = typeof normalizeStorageTasks === 'function'
      ? normalizeStorageTasks
      : (items) => Array.isArray(items) ? items : [];
    const sort = typeof sortTasks === 'function'
      ? sortTasks
      : (items) => Array.isArray(items) ? items : [];
    const merged = new Map();
    normalize(app?.storage?.tasks || [], 'manual').forEach((task) => {
      if (task?.id) merged.set(task.id, task);
    });
    normalize(remoteTasks || [], 'manual').forEach((task) => {
      if (!task?.id) return;
      const current = merged.get(task.id);
      if (!current || syncedItemStampHotfix(task) >= syncedItemStampHotfix(current)) merged.set(task.id, task);
    });
    return sort([...merged.values()]);
  }

  async function queryRemoteHotfix(table) {
    if (!hasRemoteStoreHotfix()) return [];
    const app = appState();
    const isTaskTable = table === TABLES.tasks;
    if (app?.team?.accessToken) {
      const cfg = restConfig();
      if (!cfg) return [];
      const url = new URL(`${cfg.baseUrl}/rest/v1/${table}`);
      url.searchParams.set('brand', `eq.${cfg.brand}`);
      if (isTaskTable) {
        url.searchParams.set('select', 'id,article_key,title,next_action,reason,owner,due,status,type,priority,platform,source,entity_label,auto_code,created_at,updated_at');
      } else {
        url.searchParams.set('select', '*');
      }
      const response = await timeoutHotfix(fetch(url.toString(), {
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.accessToken}`,
          Accept: 'application/json'
        }
      }), 8000, `supabase query ${table}`);
      return timeoutHotfix(readJson(response, `supabase query ${table}`), 5000, `supabase query ${table} json`);
    }
    if (!app?.team?.client?.from) return [];
    const query = isTaskTable
      ? app.team.client
          .from(table)
          .select('id,article_key,title,next_action,reason,owner,due,status,type,priority,platform,source,entity_label,auto_code,created_at,updated_at')
          .eq('brand', currentBrandSafe())
      : app.team.client.from(table).select('*').eq('brand', currentBrandSafe());
    const response = await timeoutHotfix(query, 8000, `supabase query ${table}`);
    if (response?.error) throw response.error;
    return response?.data || [];
  }

  async function upsertRemoteHotfix(table, rows, onConflict) {
    if (!hasRemoteStoreHotfix() || !rows.length) return;
    const app = appState();
    if (app?.team?.accessToken) {
      const cfg = restConfig();
      if (!cfg) return;
      const url = new URL(`${cfg.baseUrl}/rest/v1/${table}`);
      url.searchParams.set('on_conflict', onConflict);
      const response = await timeoutHotfix(fetch(url.toString(), {
        method: 'POST',
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(rows)
      }), 8000, `supabase sync ${table}`);
      await timeoutHotfix(readJson(response, `supabase sync ${table}`), 5000, `supabase sync ${table} json`);
      return;
    }
    if (!app?.team?.client?.from) return;
    const response = await timeoutHotfix(app.team.client.from(table).upsert(rows, { onConflict }), 8000, `supabase sync ${table}`);
    if (response?.error) throw response.error;
  }

  async function pullRemoteStateHotfix(rerender = true, options = {}) {
    hydratePortalStorageBeforeRemoteHotfix();
    if (!hasRemoteStoreHotfix()) return null;
    const app = appState();
    if (!app?.team) return null;
    const silent = Boolean(options && options.silent);
    try {
      if (!silent) {
        app.team.mode = 'pending';
        app.team.note = 'Загружаем командные данные…';
      }
      app.team.error = '';
      if (!silent && typeof updateSyncBadge === 'function') updateSyncBadge();

      const taskRows = await queryRemoteHotfix(TABLES.tasks);
      const repricerControlsPromise = typeof queryRemoteRepricerControls === 'function'
        ? queryRemoteRepricerControls()
        : Promise.resolve(null);
      const [commentResult, decisionResult, ownerResult, repricerControlsResult] = await Promise.allSettled([
        queryRemoteHotfix(TABLES.comments),
        queryRemoteHotfix(TABLES.decisions),
        queryRemoteHotfix(TABLES.owners),
        repricerControlsPromise
      ]);

      const commentRows = commentResult.status === 'fulfilled' ? (commentResult.value || []) : [];
      const decisionRows = decisionResult.status === 'fulfilled' ? (decisionResult.value || []) : [];
      const ownerRows = ownerResult.status === 'fulfilled' ? (ownerResult.value || []) : [];
      const repricerControlsLoaded = repricerControlsResult.status === 'fulfilled';
      const repricerControls = repricerControlsLoaded ? (repricerControlsResult.value || null) : null;
      const softErrors = [commentResult, decisionResult, ownerResult]
        .filter((result) => result.status !== 'fulfilled')
        .map((result) => result.reason?.message || String(result.reason || 'Неизвестная ошибка'))
        .filter(Boolean);
      if (!repricerControlsLoaded) {
        console.warn('[portal-team-runtime-hotfix] optional repricer controls were not loaded', repricerControlsResult.reason);
      }
      app.team.lastPullCoverage = {
        ...(app.team.lastPullCoverage || {}),
        tasks: true,
        comments: commentResult.status === 'fulfilled',
        decisions: decisionResult.status === 'fulfilled',
        owners: ownerResult.status === 'fulfilled',
        repricerControls: repricerControlsLoaded
      };
      const remoteEmpty = !taskRows.length && !commentRows.length && !decisionRows.length && !ownerRows.length && !repricerControls;

      if (!remoteEmpty) {
        if (window.__ALTEA_PRIMARY_INIT_FINISHED__ !== true) {
          earlyTeamStorageCommitted = true;
        }
        const previousStorage = app.storage && typeof app.storage === 'object' ? app.storage : {};
        const mergedComments = mergeRemoteListWithLocalHotfix(previousStorage.comments || [], commentRows.map(fromRemoteComment), normalizeComment);
        const remoteStorage = {
          ...previousStorage,
          tasks: mergeRemoteTasksWithLocalHotfix(taskRows.map(fromRemoteTask)),
          comments: mergedComments,
          resourceLinks: mergeResourceLinksWithCommentsHotfix(previousStorage.resourceLinks || [], mergedComments),
          resourceFolders: mergeResourceFoldersWithCommentsHotfix(previousStorage.resourceFolders || [], mergedComments),
          decisions: mergeRemoteListWithLocalHotfix(previousStorage.decisions || [], decisionRows.map(fromRemoteDecision), normalizeDecision),
          ownerOverrides: mergeRemoteListWithLocalHotfix(
            previousStorage.ownerOverrides || [],
            ownerRows.map(fromRemoteOwner),
            normalizeOwnerOverride,
            (item) => item.articleKey
          )
        };
        app.storage = typeof completePortalStorage === 'function'
          ? completePortalStorage(remoteStorage, previousStorage)
          : remoteStorage;
        if (repricerControls && typeof applyRepricerControlsPayload === 'function') {
          applyRepricerControlsPayload(repricerControls);
        }
        if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
        if (typeof saveLocalStorage === 'function') saveLocalStorage();
      }

      app.team.mode = 'ready';
      app.team.ready = true;
      app.team.lastSyncAt = new Date().toISOString();
      app.team.error = softErrors.join(' | ');
      app.team.note = remoteEmpty
        ? 'Командная база пока пустая — локальные данные сохранены'
        : softErrors.length
          ? `Командная база подключена частично · ${typeof fmt?.date === 'function' ? fmt.date(app.team.lastSyncAt) : app.team.lastSyncAt}`
          : `Командная база синхронизирована · ${typeof fmt?.date === 'function' ? fmt.date(app.team.lastSyncAt) : app.team.lastSyncAt}`;
      if (typeof updateSyncBadge === 'function') updateSyncBadge();

      if (rerender && typeof rerenderCurrentView === 'function') {
        rerenderCurrentView();
        if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
      }
      return { remoteEmpty, softErrors };
    } catch (error) {
      console.error(error);
      app.team.mode = 'error';
      app.team.ready = false;
      app.team.error = error?.message || 'Не удалось загрузить данные';
      app.team.note = 'Ошибка загрузки из Supabase';
      if (typeof updateSyncBadge === 'function') updateSyncBadge();
      return null;
    }
  }

  async function initTeamStoreHotfix() {
    hydratePortalStorageBeforeRemoteHotfix();
    const app = appState();
    if (!app?.team) return;
    const cfg = config();
    const memberDefaults = typeof DEFAULT_APP_CONFIG === 'object' && DEFAULT_APP_CONFIG
      ? (DEFAULT_APP_CONFIG.teamMember || {})
      : {};
    app.team.member = { ...memberDefaults, ...(cfg.teamMember || {}) };
    app.team.error = '';
    app.team.accessToken = '';
    app.team.client = null;
    app.team.userId = '';
    app.team.ready = false;

    const wantsRemote = canUseRemote();
    app.team.note = wantsRemote ? 'Подключаем командную базу…' : 'Локальный режим';
    app.team.mode = wantsRemote ? 'pending' : 'local';
    if (typeof updateSyncBadge === 'function') updateSyncBadge();

    if (!wantsRemote) {
      if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
      if (typeof updateSyncBadge === 'function') updateSyncBadge();
      return;
    }

    try {
      const portalSession = window.alteaPortalAuthGate?.getSession?.()
        || window.__ALTEA_AUTH_SESSION__
        || null;
      if (portalSession?.access_token) {
        const email = String(portalSession?.user?.email || '').trim();
        const memberName = String(
          window.__ALTEA_PORTAL_ACCESS__?.name
          || portalSession?.user?.user_metadata?.name
          || email
          || ''
        ).trim();
        app.team.accessToken = portalSession.access_token;
        app.team.userId = String(portalSession?.user?.id || '').trim();
        if (memberName) app.team.member = { ...(app.team.member || {}), name: memberName };
      } else if ((cfg.supabase?.auth || 'anonymous') === 'anonymous') {
        const signIn = await signInAnonymouslyHotfix();
        app.team.accessToken = signIn?.access_token || '';
        app.team.userId = signIn?.user?.id || '';
        if (!app.team.accessToken) throw new Error('Supabase не вернул access token');
      } else {
        throw new Error('Supabase auth session is missing');
      }

      app.team.mode = 'ready';
      app.team.ready = true;
      app.team.note = 'Командная база подключена';
      if (typeof updateSyncBadge === 'function') updateSyncBadge();
      await pullRemoteStateHotfix(false);
    } catch (error) {
      console.error(error);
      app.team.mode = 'error';
      app.team.ready = false;
      app.team.error = error?.message || 'Ошибка подключения';
      app.team.note = 'Ошибка Supabase — работаем локально';
      if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
      if (typeof updateSyncBadge === 'function') updateSyncBadge();
    }
  }

  const AUTO_PULL_INTERVAL_MS = 120000;
  const AUTO_SNAPSHOT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
  let autoPullTimer = 0;
  let autoPullInFlight = false;
  let autoSnapshotRefreshLastAt = 0;
  let autoSnapshotRefreshInFlight = false;
  const POST_BOOT_RECONCILE_POLL_MS = 125;
  const POST_BOOT_RECONCILE_MAX_ATTEMPTS = 240;
  let postBootTeamReconcileDone = false;
  let earlyTeamStorageCommitted = false;


  async function maybeAutoRefreshSnapshotsHotfix(reason = 'auto', options = {}) {
    const app = appState();
    if (!app?.boot?.dataReady || document.hidden) return false;
    const refreshFn = typeof window.__alteaRefreshSnapshotBackedState === 'function'
      ? window.__alteaRefreshSnapshotBackedState
      : null;
    if (!refreshFn || autoSnapshotRefreshInFlight) return false;

    const force = Boolean(options && options.force);
    const now = Date.now();
    if (!force && now - autoSnapshotRefreshLastAt < AUTO_SNAPSHOT_REFRESH_INTERVAL_MS) return false;

    autoSnapshotRefreshInFlight = true;
    autoSnapshotRefreshLastAt = now;
    try {
      if (typeof window.__alteaResetPortalSnapshotState === 'function') {
        try {
          window.__alteaResetPortalSnapshotState();
        } catch (error) {
          console.warn('[portal-team-runtime-hotfix:snapshot-reset]', reason, error);
        }
      }

      const changed = await refreshFn({ rerender: false });
      const allowRerender = Boolean(options && options.rerender === true);
      if (changed && allowRerender) {
        const activeView = String(app.activeView || '').trim();
        if (activeView === 'sku-plan-fact' && typeof window.refreshSkuPlanFactData === 'function') {
          await window.refreshSkuPlanFactData(null, 'view-sku-plan-fact');
        } else if (typeof rerenderCurrentView === 'function') {
          rerenderCurrentView();
          if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
        }
        if (typeof updateSyncBadge === 'function') updateSyncBadge();
      }
      return changed;
    } catch (error) {
      console.warn('[portal-team-runtime-hotfix:snapshot-auto-refresh]', reason, error);
      return false;
    } finally {
      autoSnapshotRefreshInFlight = false;
    }
  }

  async function autoPullRemoteStateHotfix(reason = 'auto') {
    const app = appState();
    if (!app?.team || !canUseRemote() || !hasRemoteStoreHotfix()) return;
    if (app.team.mode === 'pending') return;
    if (autoPullInFlight) return;
    autoPullInFlight = true;
    try {
      const activeView = String(app.activeView || '').trim();
      const taskModalOpen = document.getElementById('taskModal')?.classList.contains('open');
      const allowRerender = false;
      const pullRemote = typeof window.pullRemoteState === 'function'
        ? window.pullRemoteState
        : pullRemoteStateHotfix;
      await pullRemote.call(window, allowRerender, { silent: reason === 'interval' || Boolean(taskModalOpen) });
      await maybeAutoRefreshSnapshotsHotfix(reason);
    } catch (error) {
      console.warn('[portal-team-runtime-hotfix:auto-pull]', reason, error);
    } finally {
      autoPullInFlight = false;
    }
  }

  async function reconcileTeamStateAfterPrimaryBootHotfix() {
    if (postBootTeamReconcileDone) return true;
    const app = appState();
    if (!app?.boot?.dataReady || window.__ALTEA_PRIMARY_INIT_FINISHED__ !== true) return false;
    if (!earlyTeamStorageCommitted) {
      postBootTeamReconcileDone = true;
      return true;
    }
    if (!canUseRemote()) {
      postBootTeamReconcileDone = true;
      return true;
    }
    if (app.team?.mode !== 'ready' || !hasRemoteStoreHotfix()) return false;

    const pullRemote = typeof window.pullRemoteState === 'function'
      ? window.pullRemoteState
      : pullRemoteStateHotfix;
    const result = await pullRemote.call(window, true, { silent: true });
    if (result == null) return false;

    postBootTeamReconcileDone = true;
    window.__ALTEA_TEAM_BOOT_RECONCILED__ = true;
    return true;
  }

  function schedulePostBootTeamReconcileHotfix() {
    if (window.__ALTEA_TEAM_BOOT_RECONCILE_SCHEDULED__) return;
    window.__ALTEA_TEAM_BOOT_RECONCILE_SCHEDULED__ = true;

    const run = async (attempt) => {
      try {
        if (await reconcileTeamStateAfterPrimaryBootHotfix()) return;
      } catch (error) {
        console.warn('[portal-team-runtime-hotfix:boot-reconcile]', error);
      }
      if (attempt >= POST_BOOT_RECONCILE_MAX_ATTEMPTS) return;
      window.setTimeout(() => run(attempt + 1), POST_BOOT_RECONCILE_POLL_MS);
    };

    window.setTimeout(() => run(0), 0);
  }

  function bindAutoPullHotfix() {
    if (autoPullTimer) return;
    autoPullTimer = window.setInterval(() => {
      if (document.hidden) return;
      autoPullRemoteStateHotfix('interval');
    }, AUTO_PULL_INTERVAL_MS);

    window.addEventListener('focus', () => {
      autoPullRemoteStateHotfix('focus');
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) autoPullRemoteStateHotfix('visible');
    });
    window.addEventListener('altea:viewchange', () => {
      autoPullRemoteStateHotfix('viewchange');
    });
  }

  function assignGlobal(name, value) {
    window[name] = value;
    try {
      eval(`${name} = window.${name}`);
    } catch (error) {
      console.warn('[portal-team-runtime-hotfix] global bind', name, error);
    }
  }

  assignGlobal('teamRestConfig', restConfig);
  assignGlobal('signInTeamViaRest', signInViaRestHotfix);
  assignGlobal('signInTeamAnonymously', signInAnonymouslyHotfix);
  assignGlobal('hasRemoteStore', hasRemoteStoreHotfix);
  assignGlobal('queryRemote', queryRemoteHotfix);
  assignGlobal('upsertRemote', upsertRemoteHotfix);
  assignGlobal('pullRemoteState', pullRemoteStateHotfix);
  assignGlobal('portalAutoRefreshSnapshots', maybeAutoRefreshSnapshotsHotfix);
  assignGlobal('initTeamStore', initTeamStoreHotfix);
  bindAutoPullHotfix();
  schedulePostBootTeamReconcileHotfix();

  window.setTimeout(() => {
    const app = appState();
    if (!app?.team || app.team.mode !== 'pending') return;
    app.team.mode = 'local';
    app.team.ready = false;
    app.team.error = app.team.error || 'Командная база не ответила за 14 сек.';
    app.team.note = 'Командная база не ответила — работаем локально';
    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  }, 14000);

  window.setTimeout(() => {
    const app = appState();
    if (!app?.boot?.dataReady || !canUseRemote()) return;
    if (['ready', 'pending', 'error'].includes(String(app.team?.mode || ''))) return;
    initTeamStoreHotfix().then(() => {
      if (typeof rerenderCurrentView === 'function') {
        rerenderCurrentView();
        if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
      }
    }).catch((error) => console.warn('[portal-team-runtime-hotfix]', error));
  }, 1800);
})();
