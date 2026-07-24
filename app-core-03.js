const TEAM_RESOURCE_ARTICLE_KEY = '__portal_resource_links__';
const TEAM_RESOURCE_LINK_MARKER = '[[resource-link:v1]]';
const TEAM_RESOURCE_DELETE_MARKER = '[[resource-link-delete:v1]]';
const TEAM_RESOURCE_FOLDER_MARKER = '[[resource-folder:v1]]';
const TEAM_RESOURCE_FOLDER_DELETE_MARKER = '[[resource-folder-delete:v1]]';

function resourceSyncHash(value = '') {
  const str = String(value || '');
  let hash = 0;
  for (let index = 0; index < str.length; index += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function resourceSyncId(prefix, raw) {
  if (typeof stableId === 'function') return stableId(prefix, raw);
  return `${prefix}-${resourceSyncHash(raw)}`;
}

function readResourceSyncPayload(text = '', marker = TEAM_RESOURCE_LINK_MARKER) {
  const raw = String(text || '');
  const index = raw.indexOf(marker);
  if (index < 0) return null;
  const json = raw.slice(index + marker.length).trim();
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (error) {
    console.warn('[team-sync] resource payload parse', error);
    return null;
  }
}

function resourceSyncStamp(item = {}) {
  const stamp = Date.parse(String(item.updatedAt || item.createdAt || item.deletedAt || ''));
  return Number.isFinite(stamp) ? stamp : 0;
}

function resourceSyncKey(item = {}) {
  return String(item.id || item.href || item.localFileId || item.objectPath || item.title || '').trim();
}

function normalizeResourceLinkForSync(raw = {}, fallback = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const createdAt = String(raw.createdAt || fallback.createdAt || new Date().toISOString()).trim();
  const base = `${raw.href || raw.url || raw.link || fallback.href || ''}|${raw.title || raw.name || raw.fileName || fallback.title || ''}|${createdAt}`;
  const item = {
    id: String(raw.id || fallback.id || resourceSyncId('resource', base)).trim(),
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
  return resourceSyncKey(item) ? item : null;
}

function resourceLinksFromCommentsForSync(comments = []) {
  return (Array.isArray(comments) ? comments : [])
    .filter((comment) => comment?.articleKey === TEAM_RESOURCE_ARTICLE_KEY && comment?.type === 'resource_link')
    .map((comment) => {
      const payload = readResourceSyncPayload(comment.text, TEAM_RESOURCE_LINK_MARKER);
      return payload ? normalizeResourceLinkForSync(payload, {
        createdAt: comment.createdAt,
        owner: comment.author
      }) : null;
    })
    .filter(Boolean);
}

function deletedResourceKeysFromCommentsForSync(comments = []) {
  const deleted = new Set();
  (Array.isArray(comments) ? comments : [])
    .filter((comment) => comment?.articleKey === TEAM_RESOURCE_ARTICLE_KEY && comment?.type === 'resource_link_delete')
    .forEach((comment) => {
      const payload = readResourceSyncPayload(comment.text, TEAM_RESOURCE_DELETE_MARKER);
      if (!payload) return;
      [payload.id, payload.href, payload.localFileId, payload.objectPath]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .forEach((value) => deleted.add(value));
    });
  return deleted;
}

function mergeResourceLinksWithCommentEvents(localLinks = [], comments = []) {
  const deleted = deletedResourceKeysFromCommentsForSync(comments);
  const merged = new Map();
  [...resourceLinksFromCommentsForSync(comments), ...(Array.isArray(localLinks) ? localLinks : []).map((item) => normalizeResourceLinkForSync(item))]
    .filter(Boolean)
    .forEach((item) => {
      const key = resourceSyncKey(item);
      if (!key || deleted.has(key) || deleted.has(item.id) || deleted.has(item.href) || deleted.has(item.localFileId) || deleted.has(item.objectPath)) return;
      const current = merged.get(key);
      if (!current || resourceSyncStamp(item) >= resourceSyncStamp(current)) merged.set(key, item);
    });
  return [...merged.values()].sort((left, right) => resourceSyncStamp(right) - resourceSyncStamp(left)).slice(0, 500);
}

function normalizeResourceFolderForSync(raw = {}, fallback = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || raw.name || fallback.title || '').trim();
  if (!title) return null;
  const createdAt = String(raw.createdAt || fallback.createdAt || new Date().toISOString()).trim();
  const group = String(raw.group || fallback.group || 'Общее хранилище').trim() || 'Общее хранилище';
  const id = String(raw.id || fallback.id || resourceSyncId('resource-folder', `${title}|${group}|${createdAt}`)).trim();
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

function resourceFoldersFromCommentsForSync(comments = []) {
  return (Array.isArray(comments) ? comments : [])
    .filter((comment) => comment?.articleKey === TEAM_RESOURCE_ARTICLE_KEY && comment?.type === 'resource_folder')
    .map((comment) => {
      const payload = readResourceSyncPayload(comment.text, TEAM_RESOURCE_FOLDER_MARKER);
      return payload ? normalizeResourceFolderForSync(payload, {
        createdAt: comment.createdAt,
        owner: comment.author
      }) : null;
    })
    .filter(Boolean);
}

function deletedResourceFolderIdsFromCommentsForSync(comments = []) {
  const deleted = new Set();
  (Array.isArray(comments) ? comments : [])
    .filter((comment) => comment?.articleKey === TEAM_RESOURCE_ARTICLE_KEY && comment?.type === 'resource_folder_delete')
    .forEach((comment) => {
      const payload = readResourceSyncPayload(comment.text, TEAM_RESOURCE_FOLDER_DELETE_MARKER);
      const id = String(payload?.id || '').trim();
      if (id) deleted.add(id);
    });
  return deleted;
}

function mergeResourceFoldersWithCommentEvents(localFolders = [], comments = []) {
  const deleted = deletedResourceFolderIdsFromCommentsForSync(comments);
  const merged = new Map();
  [...resourceFoldersFromCommentsForSync(comments), ...(Array.isArray(localFolders) ? localFolders : []).map((item) => normalizeResourceFolderForSync(item))]
    .filter(Boolean)
    .forEach((folder) => {
      if (!folder.id || deleted.has(folder.id)) return;
      const current = merged.get(folder.id);
      if (!current || resourceSyncStamp(folder) >= resourceSyncStamp(current)) merged.set(folder.id, folder);
    });
  return [...merged.values()].sort((left, right) => resourceSyncStamp(right) - resourceSyncStamp(left)).slice(0, 300);
}

function resourceLinkCommentForSync(item = {}) {
  const link = normalizeResourceLinkForSync(item);
  if (!link) return null;
  const key = resourceSyncKey(link);
  return normalizeComment({
    id: resourceSyncId('resource-link', key),
    articleKey: TEAM_RESOURCE_ARTICLE_KEY,
    author: link.owner || state.team?.member?.name || 'Команда',
    team: 'Хранилище',
    type: 'resource_link',
    createdAt: link.updatedAt || link.createdAt || new Date().toISOString(),
    text: `${TEAM_RESOURCE_LINK_MARKER} ${JSON.stringify(link)}`
  });
}

function resourceFolderCommentForSync(item = {}) {
  const folder = normalizeResourceFolderForSync(item);
  if (!folder) return null;
  return normalizeComment({
    id: resourceSyncId('resource-folder', folder.id),
    articleKey: TEAM_RESOURCE_ARTICLE_KEY,
    author: folder.owner || state.team?.member?.name || 'Команда',
    team: 'Хранилище',
    type: 'resource_folder',
    createdAt: folder.updatedAt || folder.createdAt || new Date().toISOString(),
    text: `${TEAM_RESOURCE_FOLDER_MARKER} ${JSON.stringify(folder)}`
  });
}

function ensureResourceLinksHaveCommentEvents() {
  if (!state?.storage || !Array.isArray(state.storage.resourceLinks) || !state.storage.resourceLinks.length) return;
  state.storage.comments = Array.isArray(state.storage.comments) ? state.storage.comments : [];
  const existingByKey = new Map(resourceLinksFromCommentsForSync(state.storage.comments).map((item) => [resourceSyncKey(item), item]).filter(([key]) => key));
  const additions = [];
  state.storage.resourceLinks.forEach((item) => {
    const normalized = normalizeResourceLinkForSync(item);
    const key = resourceSyncKey(normalized || {});
    if (!normalized || !key) return;
    const existing = existingByKey.get(key);
    if (existing && resourceSyncStamp(existing) >= resourceSyncStamp(normalized)) return;
    const comment = resourceLinkCommentForSync(normalized);
    if (!comment) return;
    additions.push(comment);
    existingByKey.set(key, normalized);
  });
  if (additions.length) state.storage.comments = mergeRemoteListWithLocal(state.storage.comments, additions, normalizeComment);
  state.storage.resourceLinks = mergeResourceLinksWithCommentEvents(state.storage.resourceLinks, state.storage.comments);
}

function ensureResourceFoldersHaveCommentEvents() {
  if (!state?.storage || !Array.isArray(state.storage.resourceFolders) || !state.storage.resourceFolders.length) return;
  state.storage.comments = Array.isArray(state.storage.comments) ? state.storage.comments : [];
  const deletedIds = deletedResourceFolderIdsFromCommentsForSync(state.storage.comments);
  const existingById = new Map(resourceFoldersFromCommentsForSync(state.storage.comments).map((folder) => [folder.id, folder]));
  const additions = [];
  state.storage.resourceFolders.forEach((item) => {
    const folder = normalizeResourceFolderForSync(item);
    if (!folder || deletedIds.has(folder.id)) return;
    const existing = existingById.get(folder.id);
    if (existing && resourceSyncStamp(existing) >= resourceSyncStamp(folder)) return;
    const comment = resourceFolderCommentForSync(folder);
    if (!comment) return;
    additions.push(comment);
    existingById.set(folder.id, folder);
  });
  if (additions.length) state.storage.comments = mergeRemoteListWithLocal(state.storage.comments, additions, normalizeComment);
  state.storage.resourceFolders = mergeResourceFoldersWithCommentEvents(state.storage.resourceFolders, state.storage.comments);
}

async function initTeamStore() {
  const cfg = currentConfig();
  state.team.member = { ...DEFAULT_APP_CONFIG.teamMember, ...(cfg.teamMember || {}) };
  state.team.error = '';
  state.team.accessToken = '';
  state.team.client = null;
  state.team.userId = '';
  const wantsRemote = cfg.teamMode === 'supabase' && cfg.supabase?.url && cfg.supabase?.anonKey;
  state.team.note = wantsRemote ? 'Подключаем командную базу…' : 'Локальный режим';
  state.team.mode = wantsRemote ? 'pending' : 'local';
  state.team.ready = false;
  updateSyncBadge();

  if (cfg.teamMode !== 'supabase' || !cfg.supabase?.url || !cfg.supabase?.anonKey) {
    applyOwnerOverridesToSkus();
    updateSyncBadge();
    return;
  }

  try {
    state.team.mode = 'pending';
    state.team.note = 'Подключаем командную базу…';
    updateSyncBadge();

    if ((cfg.supabase.auth || 'anonymous') !== 'anonymous') {
      const session = window.alteaPortalAuthGate?.getSession?.() || window.__ALTEA_AUTH_SESSION__ || null;
      state.team.accessToken = session?.access_token || '';
      state.team.userId = session?.user?.id || '';
      if (!state.team.accessToken) throw new Error('Supabase auth session is missing');
      const email = String(session?.user?.email || '').trim();
      if (email) state.team.member = { ...(state.team.member || {}), name: email };
      state.team.client = createRestTeamClient();
    } else if ((cfg.supabase.auth || 'anonymous') === 'anonymous') {
      const signIn = await signInTeamAnonymously();
      state.team.accessToken = signIn?.access_token || '';
      state.team.userId = signIn?.user?.id || '';
      if (!state.team.accessToken) throw new Error('Supabase не вернул access token');
      state.team.client = createRestTeamClient();
    } else {
      if (!window.supabase?.createClient) {
        throw new Error('Supabase client не загрузился');
      }
      const client = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'altea-team-store'
        }
      });
      state.team.client = client;
    }

    state.team.mode = 'ready';
    state.team.ready = true;
    state.team.note = 'Командная база подключена';
    await pullRemoteState(false);
  } catch (error) {
    console.error(error);
    state.team.mode = 'error';
    state.team.lastPullCoverage = {
      tasks: false,
      comments: false,
      decisions: false,
      owners: false,
      attachments: false,
      repricerControls: false
    };
    state.team.ready = false;
    state.team.error = error.message || 'Ошибка подключения';
    state.team.note = 'Ошибка Supabase — работаем локально';
    applyOwnerOverridesToSkus();
    updateSyncBadge();
  }
}

function remoteTaskRow(task) {
  return {
    id: task.id,
    brand: currentBrand(),
    article_key: task.articleKey,
    title: task.title,
    next_action: task.nextAction || '',
    reason: typeof composeTaskReason === 'function' ? composeTaskReason(task.reason || '', task.coOwner || '') : (task.reason || ''),
    owner: task.owner || '',
    due: task.due || null,
    status: task.status,
    type: task.type,
    priority: task.priority,
    platform: task.platform,
    source: task.source,
    entity_label: task.entityLabel || '',
    auto_code: task.autoCode || '',
    created_at: task.createdAt || new Date().toISOString(),
    updated_at: task.updatedAt || new Date().toISOString()
  };
}

function fromRemoteTask(row) {
  return {
    id: row.id,
    articleKey: row.article_key,
    title: row.title,
    nextAction: row.next_action,
    reason: row.reason,
    owner: row.owner,
    due: row.due,
    status: row.status,
    type: row.type,
    priority: row.priority,
    platform: row.platform,
    source: row.source || 'manual',
    entityLabel: row.entity_label,
    autoCode: row.auto_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at
  };
}

function remoteCommentRow(comment) {
  return {
    id: comment.id,
    brand: currentBrand(),
    article_key: comment.articleKey,
    author: comment.author,
    team: comment.team,
    text: comment.text,
    type: comment.type,
    created_at: comment.createdAt
  };
}

function fromRemoteComment(row) {
  return normalizeComment({
    id: row.id,
    articleKey: row.article_key,
    author: row.author,
    team: row.team,
    text: row.text,
    type: row.type,
    createdAt: row.created_at
  });
}

function remoteDecisionRow(decision) {
  return {
    id: decision.id,
    brand: currentBrand(),
    article_key: decision.articleKey,
    title: decision.title,
    decision: decision.decision,
    owner: decision.owner,
    status: decision.status,
    due: decision.due || null,
    created_at: decision.createdAt,
    created_by: decision.createdBy
  };
}

function fromRemoteDecision(row) {
  return normalizeDecision({
    id: row.id,
    articleKey: row.article_key,
    title: row.title,
    decision: row.decision,
    owner: row.owner,
    status: row.status,
    due: row.due,
    createdAt: row.created_at,
    createdBy: row.created_by
  });
}

function remoteOwnerRow(item) {
  return {
    brand: currentBrand(),
    article_key: item.articleKey,
    owner_name: item.ownerName,
    owner_role: item.ownerRole,
    note: item.note,
    updated_at: item.updatedAt,
    assigned_by: item.assignedBy
  };
}

function fromRemoteOwner(row) {
  return normalizeOwnerOverride({
    articleKey: row.article_key,
    ownerName: row.owner_name,
    ownerRole: row.owner_role,
    note: row.note,
    updatedAt: row.updated_at,
    assignedBy: row.assigned_by
  });
}

function remoteTaskAttachmentRow(item) {
  return {
    id: item.id,
    brand: currentBrand(),
    task_id: item.taskId,
    article_key: item.articleKey || '',
    file_name: item.fileName || 'Файл',
    mime_type: item.mimeType || '',
    file_size: Number(item.size || 0) || 0,
    bucket_name: item.bucket || TASK_ATTACHMENTS_BUCKET,
    object_path: item.objectPath || '',
    public_url: item.publicUrl || '',
    created_at: item.createdAt || new Date().toISOString(),
    created_by: item.createdBy || state.team.member.name || 'Команда'
  };
}

function fromRemoteTaskAttachment(row) {
  return normalizeTaskAttachment({
    id: row.id,
    taskId: row.task_id,
    articleKey: row.article_key,
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: row.file_size,
    bucket: row.bucket_name,
    objectPath: row.object_path,
    publicUrl: row.public_url,
    createdAt: row.created_at,
    createdBy: row.created_by
  });
}

function storageAsciiSlug(value = '') {
  const cyrillicMap = {
    '\u0430': 'a', '\u0431': 'b', '\u0432': 'v', '\u0433': 'g', '\u0434': 'd',
    '\u0435': 'e', '\u0451': 'e', '\u0436': 'zh', '\u0437': 'z', '\u0438': 'i',
    '\u0439': 'y', '\u043a': 'k', '\u043b': 'l', '\u043c': 'm', '\u043d': 'n',
    '\u043e': 'o', '\u043f': 'p', '\u0440': 'r', '\u0441': 's', '\u0442': 't',
    '\u0443': 'u', '\u0444': 'f', '\u0445': 'h', '\u0446': 'ts', '\u0447': 'ch',
    '\u0448': 'sh', '\u0449': 'sch', '\u044a': '', '\u044b': 'y', '\u044c': '',
    '\u044d': 'e', '\u044e': 'yu', '\u044f': 'ya'
  };
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('')
    .map((char) => cyrillicMap[char.toLowerCase()] ?? char)
    .join('');
}

function safeStoragePathSegment(value = '', fallback = 'file') {
  const ascii = storageAsciiSlug(value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_ .-]+|[_ .-]+$/g, '')
    .slice(0, 120);
  return ascii || fallback;
}

function encodeStoragePath(path = '') {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function taskAttachmentPublicUrl(bucket, objectPath) {
  const cfg = teamRestConfig();
  if (!cfg?.baseUrl || !bucket || !objectPath) return '';
  return `${cfg.baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`;
}

function taskAttachmentObjectPath(taskId, fileName) {
  const ext = taskAttachmentExt(fileName || '') || 'bin';
  const stamp = String(Date.now());
  return `task-attachments/${stamp}-${uid('file')}.${ext}`;
}

function taskAttachmentExt(name = '') {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function taskAttachmentAllowed(file) {
  const ext = taskAttachmentExt(file?.name || '');
  return TASK_ATTACHMENT_ALLOWED_EXTENSIONS.includes(ext);
}

function isTaskAttachmentSchemaMissingError(error) {
  const message = String(error?.message || error || '');
  return /portal_task_attachments|relation .* does not exist|PGRST205|Could not find the table/i.test(message);
}

function isTaskAttachmentBucketMissingError(error) {
  const message = String(error?.message || error || '');
  return /portal-task-files|bucket.*not found|storage\/v1\/object|The resource was not found|NoSuchBucket/i.test(message);
}

function taskAttachmentSetupHint() {
  return 'Supabase setup is incomplete. Create table public.portal_task_attachments and bucket portal-task-files.';
}

function taskAttachmentDeferredSyncMessage() {
  return '\u0424\u0430\u0439\u043b \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d, \u043d\u043e \u0431\u0430\u0437\u0430 \u043d\u0435 \u0443\u0441\u043f\u0435\u043b\u0430 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u0437\u0430\u043f\u0438\u0441\u044c. \u041e\u043d \u043e\u0441\u0442\u0430\u043b\u0441\u044f \u0432 \u044d\u0442\u043e\u0439 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435; \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u0434\u043e\u0433\u043e\u043d\u0438\u0442\u0441\u044f \u043f\u0440\u0438 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0439 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0435.';
}

const REPRICER_CONTROLS_SNAPSHOT_KEY = 'repricer_controls';

function buildRepricerControlsPayload() {
  return {
    generatedAt: new Date().toISOString(),
    updatedBy: state.team?.member?.name || 'Команда',
    settings: normalizeRepricerSettings(state.storage?.repricerSettings || {}),
    settingsUpdatedAt: state.storage?.repricerSettingsUpdatedAt || '',
    overrides: Array.isArray(state.storage?.repricerOverrides)
      ? state.storage.repricerOverrides.map(normalizeRepricerOverride).filter((item) => item.articleKey)
      : [],
    productLifecycleOverrides: Array.isArray(state.storage?.productLifecycleOverrides)
      ? state.storage.productLifecycleOverrides.map(normalizeProductLifecycleOverride).filter((item) => item.articleKey)
      : [],
    skuProfiles: Array.isArray(state.storage?.repricerSkuProfiles)
      ? state.storage.repricerSkuProfiles.map(normalizeRepricerSkuProfile).filter((item) => item.articleKey)
      : [],
    corridors: Array.isArray(state.storage?.repricerCorridors)
      ? state.storage.repricerCorridors.map(normalizeRepricerCorridor).filter((item) => item.articleKey)
      : [],
    overrideDeletes: Array.isArray(state.storage?.repricerOverrideDeletes)
      ? state.storage.repricerOverrideDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey)
      : [],
    skuProfileDeletes: Array.isArray(state.storage?.repricerSkuProfileDeletes)
      ? state.storage.repricerSkuProfileDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey)
      : [],
    corridorDeletes: Array.isArray(state.storage?.repricerCorridorDeletes)
      ? state.storage.repricerCorridorDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey)
      : [],
    productLifecycleOverrideDeletes: Array.isArray(state.storage?.productLifecycleOverrideDeletes)
      ? state.storage.productLifecycleOverrideDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey)
      : [],
    pendingApiAdds: repricerControlsQueueItems(state.storage?.repricerPendingApiAdds),
    pendingApiDeletes: repricerControlsQueueItems(state.storage?.repricerPendingApiDeletes),
    pendingCostFixes: repricerControlsQueueItems(state.storage?.repricerPendingCostFixes),
    pendingApiTasks: repricerControlsQueueItems(state.storage?.repricerPendingApiTasks),
    skuDecisionApprovals: repricerControlsQueueItems(state.storage?.skuDecisionApprovals).slice(0, 1000),
    repairHistory: repricerControlsQueueItems(state.storage?.repricerRepairHistory).slice(0, 400),
    repairSnapshots: repricerControlsQueueItems(state.storage?.repricerRepairSnapshots).slice(0, 10),
    apiReconcileHistory: repricerControlsQueueItems(state.storage?.repricerApiReconcileHistory).slice(0, 100),
    lastAuditImport: state.storage?.repricerLastAuditImport && typeof state.storage.repricerLastAuditImport === 'object' ? state.storage.repricerLastAuditImport : null,
    lastAutoFix: state.storage?.repricerLastAutoFix && typeof state.storage.repricerLastAutoFix === 'object' ? state.storage.repricerLastAutoFix : null,
    lastImportValidation: state.storage?.repricerLastImportValidation && typeof state.storage.repricerLastImportValidation === 'object' ? state.storage.repricerLastImportValidation : null,
    lastApiReconcile: state.storage?.repricerLastApiReconcile && typeof state.storage.repricerLastApiReconcile === 'object' ? state.storage.repricerLastApiReconcile : null
  };
}

function applyRepricerControlsPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  state.storage.repricerSettings = normalizeRepricerSettings(payload.settings || payload.repricerSettings || {});
  state.storage.repricerSettingsUpdatedAt = String(payload.settingsUpdatedAt || '').trim();
  state.storage.repricerOverrides = Array.isArray(payload.overrides || payload.repricerOverrides)
    ? (payload.overrides || payload.repricerOverrides).map(normalizeRepricerOverride).filter((item) => item.articleKey)
    : [];
  state.storage.productLifecycleOverrides = Array.isArray(payload.productLifecycleOverrides)
    ? payload.productLifecycleOverrides.map(normalizeProductLifecycleOverride).filter((item) => item.articleKey)
    : [];
  state.storage.repricerSkuProfiles = Array.isArray(payload.skuProfiles || payload.repricerSkuProfiles)
    ? (payload.skuProfiles || payload.repricerSkuProfiles).map(normalizeRepricerSkuProfile).filter((item) => item.articleKey)
    : [];
  state.storage.repricerCorridors = Array.isArray(payload.corridors || payload.repricerCorridors)
    ? (payload.corridors || payload.repricerCorridors).map(normalizeRepricerCorridor).filter((item) => item.articleKey)
    : [];
  state.storage.repricerOverrideDeletes = Array.isArray(payload.overrideDeletes || payload.repricerOverrideDeletes)
    ? (payload.overrideDeletes || payload.repricerOverrideDeletes).map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey)
    : [];
  state.storage.repricerSkuProfileDeletes = Array.isArray(payload.skuProfileDeletes || payload.repricerSkuProfileDeletes)
    ? (payload.skuProfileDeletes || payload.repricerSkuProfileDeletes).map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey)
    : [];
  state.storage.repricerCorridorDeletes = Array.isArray(payload.corridorDeletes || payload.repricerCorridorDeletes)
    ? (payload.corridorDeletes || payload.repricerCorridorDeletes).map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey)
    : [];
  state.storage.productLifecycleOverrideDeletes = Array.isArray(payload.productLifecycleOverrideDeletes)
    ? payload.productLifecycleOverrideDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey)
    : [];
  if (Array.isArray(payload.pendingApiAdds || payload.repricerPendingApiAdds)) state.storage.repricerPendingApiAdds = repricerControlsQueueItems(payload.pendingApiAdds || payload.repricerPendingApiAdds);
  if (Array.isArray(payload.pendingApiDeletes || payload.repricerPendingApiDeletes)) state.storage.repricerPendingApiDeletes = repricerControlsQueueItems(payload.pendingApiDeletes || payload.repricerPendingApiDeletes);
  if (Array.isArray(payload.pendingCostFixes || payload.repricerPendingCostFixes)) state.storage.repricerPendingCostFixes = repricerControlsQueueItems(payload.pendingCostFixes || payload.repricerPendingCostFixes);
  if (Array.isArray(payload.pendingApiTasks || payload.repricerPendingApiTasks)) state.storage.repricerPendingApiTasks = repricerControlsQueueItems(payload.pendingApiTasks || payload.repricerPendingApiTasks);
  if (Array.isArray(payload.skuDecisionApprovals)) state.storage.skuDecisionApprovals = repricerControlsQueueItems(payload.skuDecisionApprovals).slice(0, 1000);
  if (typeof window.skuDecisionApprovals === 'function') window.skuDecisionApprovals();
  if (Array.isArray(payload.repairHistory || payload.repricerRepairHistory)) state.storage.repricerRepairHistory = repricerControlsQueueItems(payload.repairHistory || payload.repricerRepairHistory).slice(0, 400);
  if (Array.isArray(payload.repairSnapshots || payload.repricerRepairSnapshots)) state.storage.repricerRepairSnapshots = repricerControlsQueueItems(payload.repairSnapshots || payload.repricerRepairSnapshots).slice(0, 10);
  if (Array.isArray(payload.apiReconcileHistory || payload.repricerApiReconcileHistory)) state.storage.repricerApiReconcileHistory = repricerControlsQueueItems(payload.apiReconcileHistory || payload.repricerApiReconcileHistory).slice(0, 100);
  if (payload.lastAuditImport && typeof payload.lastAuditImport === 'object') state.storage.repricerLastAuditImport = payload.lastAuditImport;
  if (payload.lastAutoFix && typeof payload.lastAutoFix === 'object') state.storage.repricerLastAutoFix = payload.lastAutoFix;
  if (payload.lastImportValidation && typeof payload.lastImportValidation === 'object') state.storage.repricerLastImportValidation = payload.lastImportValidation;
  if (payload.lastApiReconcile && typeof payload.lastApiReconcile === 'object') state.storage.repricerLastApiReconcile = payload.lastApiReconcile;
  saveLocalStorage();
  return true;
}

function repricerControlsStamp(value) {
  if (!value) return 0;
  const stamp = Date.parse(String(value));
  return Number.isFinite(stamp) ? stamp : 0;
}

function repricerControlsQueueItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ ...item }))
    .filter((item) => String(item.articleKey || item.article || item.sku || item.id || '').trim());
}

function repricerQueueStamp(item) {
  return repricerControlsStamp(item?.updatedAt || item?.acceptedAt || item?.reconciledAt || item?.sentAt || item?.requestedAt || item?.importedAt || item?.createdAt);
}

function repricerQueueType(item) {
  const raw = String(item?.type || item?.action || item?.command || item?.kind || '').trim().toUpperCase();
  if (raw) return raw;
  if (item?.costRub != null || item?.cost != null) return 'UPDATE_COST';
  return 'API';
}

function repricerQueueField(item, type = repricerQueueType(item)) {
  const raw = String(item?.field || item?.apiField || '').trim().toLowerCase();
  if (type === 'UPDATE_COST') return 'cost';
  if (type === 'ADD_SKU' || type === 'DELETE_SKU') return 'sku';
  return raw || String(item?.reason || '').trim().toLowerCase();
}

function repricerQueuePayloadSignature(item) {
  const type = repricerQueueType(item);
  const field = repricerQueueField(item, type);
  const value = item?.value ?? item?.costRub ?? item?.cost ?? '';
  return `${type}|${field}|${String(value).trim()}`;
}

function repricerQueueStatusRank(item) {
  const status = String(item?.status || 'open').trim().toLowerCase();
  if (status === 'accepted') return 4;
  if (status === 'sent') return 3;
  if (status === 'open') return 2;
  if (status === 'error') return 1;
  return 0;
}

function repricerQueueKey(item) {
  const articleKey = String(item?.articleKey || item?.article || item?.sku || '').trim();
  const rawPlatform = String(item?.platform || '').trim().toLowerCase();
  const platform = ['wb', 'ozon', 'all'].includes(rawPlatform) ? rawPlatform : 'all';
  const type = repricerQueueType(item);
  const field = repricerQueueField(item, type);
  if (articleKey) return `${type}|${articleKey}|${platform}|${field}`;
  return String(item?.id || '').trim();
}

function repricerPreferQueueItem(current, next) {
  if (!current) return next;
  if (!next) return current;
  if (repricerQueuePayloadSignature(current) !== repricerQueuePayloadSignature(next)) {
    return repricerQueueStamp(next) >= repricerQueueStamp(current) ? next : current;
  }
  const currentRank = repricerQueueStatusRank(current);
  const nextRank = repricerQueueStatusRank(next);
  if (nextRank !== currentRank) return nextRank > currentRank ? next : current;
  return repricerQueueStamp(next) >= repricerQueueStamp(current) ? next : current;
}

function mergeRepricerQueueItems(remoteItems, localItems, limit = 400) {
  const map = new Map();
  [...repricerControlsQueueItems(remoteItems), ...repricerControlsQueueItems(localItems)].forEach((item) => {
    const key = repricerQueueKey(item);
    if (!key) return;
    map.set(key, repricerPreferQueueItem(map.get(key), item));
  });
  return [...map.values()]
    .sort((a, b) => repricerQueueStamp(b) - repricerQueueStamp(a))
    .slice(0, limit);
}

function repricerLatestObject(remoteObject, localObject, stampKeys = ['importedAt', 'appliedAt', 'updatedAt', 'createdAt']) {
  const remote = remoteObject && typeof remoteObject === 'object' ? remoteObject : null;
  const local = localObject && typeof localObject === 'object' ? localObject : null;
  if (!remote) return local;
  if (!local) return remote;
  const stamp = (item) => Math.max(...stampKeys.map((key) => repricerControlsStamp(item?.[key])));
  return stamp(local) >= stamp(remote) ? local : remote;
}

function repricerControlsKey(item, withPlatform = true) {
  const articleKey = String(item?.articleKey || item?.article || '').trim();
  if (!articleKey) return '';
  if (!withPlatform) return articleKey;
  const rawPlatform = String(item?.platform || '').trim().toLowerCase();
  const platform = ['wb', 'ozon', 'all'].includes(rawPlatform) ? rawPlatform : 'all';
  return `${articleKey}|${platform}`;
}

function mergeRepricerDeleteTombstones(remoteItems, localItems, withPlatform = true) {
  const map = new Map();
  [...(Array.isArray(remoteItems) ? remoteItems : []), ...(Array.isArray(localItems) ? localItems : [])]
    .map((item) => normalizeRepricerDeleteTombstone(item))
    .filter((item) => item.articleKey)
    .forEach((item) => {
      const key = repricerControlsKey(item, withPlatform);
      if (!key) return;
      const current = map.get(key);
      if (!current || repricerControlsStamp(item.deletedAt) >= repricerControlsStamp(current.deletedAt)) {
        map.set(key, item);
      }
    });
  return [...map.values()].sort((a, b) => repricerControlsStamp(b.deletedAt) - repricerControlsStamp(a.deletedAt));
}

function mergeRepricerEntityList(remoteItems, localItems, remoteDeletes, localDeletes, normalizeFn, withPlatform = true) {
  const deleteList = mergeRepricerDeleteTombstones(remoteDeletes, localDeletes, withPlatform);
  const deleteMap = new Map(deleteList.map((item) => [repricerControlsKey(item, withPlatform), item]));
  const itemMap = new Map();
  [...(Array.isArray(remoteItems) ? remoteItems : []), ...(Array.isArray(localItems) ? localItems : [])]
    .map((item) => normalizeFn(item))
    .filter((item) => item.articleKey)
    .forEach((item) => {
      const key = repricerControlsKey(item, withPlatform);
      if (!key) return;
      const current = itemMap.get(key);
      if (!current || repricerControlsStamp(item.updatedAt) >= repricerControlsStamp(current.updatedAt)) {
        itemMap.set(key, item);
      }
    });
  return [...itemMap.values()]
    .filter((item) => {
      const tombstone = deleteMap.get(repricerControlsKey(item, withPlatform));
      return !tombstone || repricerControlsStamp(item.updatedAt) > repricerControlsStamp(tombstone.deletedAt);
    })
    .sort((a, b) => repricerControlsStamp(b.updatedAt) - repricerControlsStamp(a.updatedAt));
}

function mergeRepricerControlsPayload(remotePayload, localPayload) {
  const remote = remotePayload && typeof remotePayload === 'object' ? remotePayload : {};
  const local = localPayload && typeof localPayload === 'object' ? localPayload : {};
  const remoteSettingsUpdatedAt = String(remote.settingsUpdatedAt || '').trim();
  const localSettingsUpdatedAt = String(local.settingsUpdatedAt || '').trim();
  const useLocalSettings = repricerControlsStamp(localSettingsUpdatedAt) >= repricerControlsStamp(remoteSettingsUpdatedAt);
  const merged = {
    generatedAt: new Date().toISOString(),
    updatedBy: local.updatedBy || remote.updatedBy || (state.team?.member?.name || 'Команда'),
    settings: normalizeRepricerSettings(useLocalSettings ? (local.settings || local.repricerSettings || {}) : (remote.settings || remote.repricerSettings || {})),
    settingsUpdatedAt: useLocalSettings ? localSettingsUpdatedAt : remoteSettingsUpdatedAt,
    overrideDeletes: mergeRepricerDeleteTombstones(remote.overrideDeletes || remote.repricerOverrideDeletes, local.overrideDeletes || local.repricerOverrideDeletes, true),
    skuProfileDeletes: mergeRepricerDeleteTombstones(remote.skuProfileDeletes || remote.repricerSkuProfileDeletes, local.skuProfileDeletes || local.repricerSkuProfileDeletes, false),
    corridorDeletes: mergeRepricerDeleteTombstones(remote.corridorDeletes || remote.repricerCorridorDeletes, local.corridorDeletes || local.repricerCorridorDeletes, true),
    productLifecycleOverrideDeletes: mergeRepricerDeleteTombstones(remote.productLifecycleOverrideDeletes, local.productLifecycleOverrideDeletes, false)
  };
  merged.overrides = mergeRepricerEntityList(
    remote.overrides || remote.repricerOverrides,
    local.overrides || local.repricerOverrides,
    merged.overrideDeletes,
    [],
    normalizeRepricerOverride,
    true
  );
  merged.skuProfiles = mergeRepricerEntityList(
    remote.skuProfiles || remote.repricerSkuProfiles,
    local.skuProfiles || local.repricerSkuProfiles,
    merged.skuProfileDeletes,
    [],
    normalizeRepricerSkuProfile,
    false
  );
  merged.corridors = mergeRepricerEntityList(
    remote.corridors || remote.repricerCorridors,
    local.corridors || local.repricerCorridors,
    merged.corridorDeletes,
    [],
    normalizeRepricerCorridor,
    true
  );
  merged.productLifecycleOverrides = mergeRepricerEntityList(
    remote.productLifecycleOverrides,
    local.productLifecycleOverrides,
    merged.productLifecycleOverrideDeletes,
    [],
    normalizeProductLifecycleOverride,
    false
  );
  merged.pendingApiAdds = mergeRepricerQueueItems(remote.pendingApiAdds || remote.repricerPendingApiAdds, local.pendingApiAdds || local.repricerPendingApiAdds);
  merged.pendingApiDeletes = mergeRepricerQueueItems(remote.pendingApiDeletes || remote.repricerPendingApiDeletes, local.pendingApiDeletes || local.repricerPendingApiDeletes);
  merged.pendingCostFixes = mergeRepricerQueueItems(remote.pendingCostFixes || remote.repricerPendingCostFixes, local.pendingCostFixes || local.repricerPendingCostFixes);
  merged.pendingApiTasks = mergeRepricerQueueItems(remote.pendingApiTasks || remote.repricerPendingApiTasks, local.pendingApiTasks || local.repricerPendingApiTasks);
  merged.skuDecisionApprovals = mergeRepricerQueueItems(remote.skuDecisionApprovals, local.skuDecisionApprovals, 1000);
  merged.repairHistory = mergeRepricerQueueItems(remote.repairHistory || remote.repricerRepairHistory, local.repairHistory || local.repricerRepairHistory, 400);
  merged.repairSnapshots = mergeRepricerQueueItems(remote.repairSnapshots || remote.repricerRepairSnapshots, local.repairSnapshots || local.repricerRepairSnapshots, 10);
  merged.apiReconcileHistory = mergeRepricerQueueItems(remote.apiReconcileHistory || remote.repricerApiReconcileHistory, local.apiReconcileHistory || local.repricerApiReconcileHistory, 100);
  merged.lastAuditImport = repricerLatestObject(remote.lastAuditImport, local.lastAuditImport || local.repricerLastAuditImport, ['importedAt', 'updatedAt']);
  merged.lastAutoFix = repricerLatestObject(remote.lastAutoFix, local.lastAutoFix || local.repricerLastAutoFix, ['appliedAt', 'updatedAt']);
  merged.lastImportValidation = repricerLatestObject(remote.lastImportValidation, local.lastImportValidation || local.repricerLastImportValidation, ['validatedAt', 'updatedAt']);
  merged.lastApiReconcile = repricerLatestObject(remote.lastApiReconcile, local.lastApiReconcile || local.repricerLastApiReconcile, ['checkedAt', 'updatedAt']);
  return merged;
}

async function queryRemoteRepricerControls() {
  const cfg = teamRestConfig();
  if (!cfg?.baseUrl || !cfg?.anonKey) return null;
  const url = new URL(`${cfg.baseUrl}/rest/v1/${PORTAL_SNAPSHOT_TABLE}`);
  url.searchParams.set('select', 'snapshot_key,payload');
  url.searchParams.set('brand', `eq.${cfg.brand}`);
  url.searchParams.set('snapshot_key', `eq.${REPRICER_CONTROLS_SNAPSHOT_KEY}`);
  const authToken = cfg.accessToken || cfg.anonKey;
  const response = await withTimeout(fetch(url.toString(), {
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json'
    }
  }), 8000, 'Репрайсер controls');
  const rows = await readSupabaseJson(response, 'Репрайсер controls');
  return rows?.[0]?.payload ? JSON.parse(JSON.stringify(rows[0].payload)) : null;
}

let repricerControlsPersistRevision = 0;
let repricerControlsPersistChain = Promise.resolve();

async function persistRepricerControlsRevision(revision) {
  if (!hasRemoteStore()) return;
  const localPayload = buildRepricerControlsPayload();
  const remotePayload = await queryRemoteRepricerControls();
  if (revision !== repricerControlsPersistRevision) return { superseded: true };
  const payload = mergeRepricerControlsPayload(remotePayload, localPayload);
  await upsertRemote(PORTAL_SNAPSHOT_TABLE, [{
    brand: currentBrand(),
    snapshot_key: REPRICER_CONTROLS_SNAPSHOT_KEY,
    payload,
    payload_hash: hashString(JSON.stringify(payload)),
    source: 'portal-managed-repricer',
    generated_at: payload.generatedAt
  }], 'brand,snapshot_key');
  if (revision !== repricerControlsPersistRevision) return { superseded: true };
  applyRepricerControlsPayload(payload);
  if (typeof resetPortalSnapshotState === 'function') resetPortalSnapshotState();
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Репрайсер синхронизирован · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
  return { superseded: false };
}

function persistRepricerControls() {
  if (!hasRemoteStore()) return Promise.resolve();
  const revision = ++repricerControlsPersistRevision;
  const operation = repricerControlsPersistChain
    .catch(() => undefined)
    .then(() => persistRepricerControlsRevision(revision));
  repricerControlsPersistChain = operation;
  return operation;
}

function teamRestConfig() {
  const cfg = currentConfig();
  if (!cfg.supabase?.url || !cfg.supabase?.anonKey || typeof fetch !== 'function') return null;
  const baseUrl = String(cfg.supabase.url || '').replace(/\/+$/, '');
  const passwordAuth = String(cfg.supabase?.auth || '').trim().toLowerCase() !== 'anonymous';
  const authToken = window.alteaPortalAuthGate?.getSession?.()?.access_token || window.__ALTEA_AUTH_SESSION__?.access_token || '';
  const accessToken = state.team.accessToken || authToken || (passwordAuth ? '' : cfg.supabase.anonKey);
  return {
    baseUrl,
    anonKey: cfg.supabase.anonKey,
    accessToken,
    brand: currentBrand()
  };
}

async function readSupabaseJson(response, label) {
  const bodyText = await response.text();
  if (!response.ok) {
    const error = new Error(`${label}: ${bodyText || response.status || 'request failed'}`);
    error.status = response.status;
    error.body = bodyText;
    try {
      const bodyJson = bodyText ? JSON.parse(bodyText) : null;
      if (bodyJson && typeof bodyJson === 'object') {
        error.code = bodyJson.code || '';
        error.statusCode = bodyJson.statusCode || response.status;
        error.supabaseError = bodyJson;
      }
    } catch (_) {}
    throw error;
  }
  return bodyText ? JSON.parse(bodyText) : [];
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientSupabaseError(error) {
  const message = String(error?.message || error || '');
  const body = String(error?.body || '');
  const code = String(error?.code || error?.supabaseError?.code || '');
  const status = Number(error?.status || error?.statusCode || error?.supabaseError?.statusCode || 0);
  return status === 544
    || status === 502
    || status === 503
    || status === 504
    || /DatabaseTimeout|timed out|timeout|statement timeout|connection.*timed out/i.test(`${message} ${body} ${code}`);
}

async function retryTransientSupabase(action, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 1;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 900;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isTransientSupabaseError(error)) throw error;
      await waitMs(delayMs * (attempt + 1));
    }
  }
  throw lastError;
}

async function signInTeamViaRest() {
  const cfg = teamRestConfig();
  if (!cfg) throw new Error('Supabase REST недоступен');
  const response = await fetch(`${cfg.baseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  return readSupabaseJson(response, 'Анонимный вход Supabase');
}

async function signInTeamAnonymously() {
  const cfg = currentConfig();
  const cacheKey = 'altea-team-anon-session-v1';
  const fallbackAnonKeySession = (error) => {
    if (error) console.warn('[team-store] anonymous auth fallback', error);
    return {
      access_token: cfg.supabase?.anonKey || '',
      user: null,
      anon_key_fallback: true
    };
  };
  const readCachedSession = () => {
    try {
      const cached = JSON.parse(window.sessionStorage?.getItem(cacheKey) || 'null');
      if (!cached || cached.url !== cfg.supabase?.url || cached.anonKey !== cfg.supabase?.anonKey) return null;
      if (!cached.access_token || Number(cached.expiresAt || 0) <= Date.now() + 60000) return null;
      return { access_token: cached.access_token, user: cached.user || null };
    } catch {
      return null;
    }
  };
  const writeCachedSession = (payload, expiresAt) => {
    try {
      if (!payload?.access_token) return;
      window.sessionStorage?.setItem(cacheKey, JSON.stringify({
        url: cfg.supabase?.url || '',
        anonKey: cfg.supabase?.anonKey || '',
        access_token: payload.access_token,
        user: payload.user || null,
        expiresAt: Number(expiresAt) || Date.now() + 45 * 60 * 1000
      }));
    } catch {}
  };
  const cached = readCachedSession();
  if (cached) return cached;
  if (window.supabase?.createClient) {
    try {
      const client = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'altea-team-store'
        }
      });
      const response = await client.auth.signInAnonymously();
      if (response?.error) throw response.error;
      const payload = {
        access_token: response?.data?.session?.access_token || '',
        user: response?.data?.user || null
      };
      writeCachedSession(payload, Number(response?.data?.session?.expires_at || 0) * 1000);
      return payload;
    } catch (error) {
      return fallbackAnonKeySession(error);
    }
  }
  try {
    const payload = await signInTeamViaRest();
    writeCachedSession(payload, Date.now() + Number(payload?.expires_in || 2700) * 1000);
    return payload;
  } catch (error) {
    return fallbackAnonKeySession(error);
  }
}

function createRestTeamClient() {
  const build = (table) => ({
    table,
    method: 'GET',
    filters: [],
    selectValue: '*',
    orderValue: '',
    limitValue: null,
    body: null,
    onConflict: '',
    prefer: '',
    select(columns) {
      this.selectValue = columns || '*';
      return this;
    },
    eq(column, value) {
      this.filters.push([column, `eq.${String(value ?? '')}`]);
      return this;
    },
    in(column, values) {
      const list = Array.isArray(values) ? values.map((item) => String(item)).join(',') : String(values || '');
      this.filters.push([column, `in.(${list})`]);
      return this;
    },
    order(column, options = {}) {
      const ascending = options?.ascending !== false;
      this.orderValue = `${column}.${ascending ? 'asc' : 'desc'}`;
      return this;
    },
    limit(value) {
      this.limitValue = Number(value) || null;
      return this;
    },
    upsert(rows, options = {}) {
      this.method = 'POST';
      this.body = rows;
      this.onConflict = options?.onConflict || '';
      this.prefer = 'resolution=merge-duplicates,return=minimal';
      return this;
    },
    insert(rows) {
      this.method = 'POST';
      this.body = rows;
      this.prefer = 'return=representation';
      return this;
    },
    delete() {
      this.method = 'DELETE';
      this.prefer = 'return=representation';
      return this;
    },
    async execute() {
      const cfg = teamRestConfig();
      if (!cfg?.baseUrl || !cfg?.anonKey || !cfg?.accessToken) {
        return { data: null, error: { message: 'Командная база недоступна' } };
      }
      const url = new URL(`${cfg.baseUrl}/rest/v1/${this.table}`);
      if (this.method === 'GET') url.searchParams.set('select', this.selectValue);
      if (this.onConflict) url.searchParams.set('on_conflict', this.onConflict);
      if (this.orderValue) url.searchParams.set('order', this.orderValue);
      if (this.limitValue) url.searchParams.set('limit', String(this.limitValue));
      for (const [column, value] of this.filters) url.searchParams.set(column, value);
      try {
        const response = await fetch(url.toString(), {
          method: this.method,
          headers: {
            apikey: cfg.anonKey,
            Authorization: `Bearer ${cfg.accessToken}`,
            Accept: 'application/json',
            ...(this.body !== null ? { 'Content-Type': 'application/json' } : {}),
            ...(this.prefer ? { Prefer: this.prefer } : {})
          },
          ...(this.body !== null ? { body: JSON.stringify(this.body) } : {})
        });
        const data = await readSupabaseJson(response, `${this.method} ${this.table}`);
        return { data, error: null };
      } catch (error) {
        return { data: null, error: { message: error?.message || String(error) } };
      }
    },
    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  });

  return {
    from(table) {
      return build(table);
    }
  };
}

function hasRemoteStore() {
  return Boolean(state.team.ready && (state.team.client || state.team.accessToken));
}

function syncedItemStamp(item = {}) {
  const value = item.updatedAt || item.updated_at || item.createdAt || item.created_at || '';
  const stamp = Date.parse(String(value || ''));
  return Number.isFinite(stamp) ? stamp : 0;
}

function mergeRemoteListWithLocal(localItems = [], remoteItems = [], normalizeFn = (item) => item, keyFn = (item) => item?.id) {
  const merged = new Map();
  [...(Array.isArray(remoteItems) ? remoteItems : []), ...(Array.isArray(localItems) ? localItems : [])]
    .map((item) => normalizeFn(item))
    .filter(Boolean)
    .forEach((item) => {
      const key = String(keyFn(item) || '').trim();
      if (!key) return;
      const current = merged.get(key);
      if (!current || syncedItemStamp(item) >= syncedItemStamp(current)) merged.set(key, item);
    });
  return [...merged.values()].sort((a, b) => syncedItemStamp(b) - syncedItemStamp(a));
}

function mergeRemoteTasksWithLocal(remoteTasks = []) {
  const merged = new Map();
  normalizeStorageTasks(state.storage.tasks || [], 'manual').forEach((task) => {
    if (task?.id) merged.set(task.id, task);
  });
  normalizeStorageTasks(remoteTasks || [], 'manual').forEach((task) => {
    if (!task?.id) return;
    const current = merged.get(task.id);
    if (!current || syncedItemStamp(task) >= syncedItemStamp(current)) merged.set(task.id, task);
  });
  return sortTasks([...merged.values()]);
}

async function queryRemote(table) {
  if (!hasRemoteStore()) return [];
  const isTaskTable = table === TEAM_TABLES.tasks;
  const isAttachmentTable = table === TEAM_TABLES.attachments;
  const cfg = teamRestConfig();
  if (cfg?.accessToken) {
    const url = new URL(`${cfg.baseUrl}/rest/v1/${table}`);
    url.searchParams.set('brand', `eq.${cfg.brand}`);
    if (isTaskTable) {
      url.searchParams.set('select', 'id,article_key,title,next_action,reason,owner,due,status,type,priority,platform,source,entity_label,auto_code,created_at,updated_at');
    } else if (isAttachmentTable) {
      url.searchParams.set('select', 'id,task_id,article_key,file_name,mime_type,file_size,bucket_name,object_path,public_url,created_at,created_by,updated_at');
    } else {
      url.searchParams.set('select', '*');
    }
    const response = await withTimeout(fetch(url.toString(), {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json'
      }
    }), 8000, `Запрос ${table}`);
    return readSupabaseJson(response, `Запрос ${table}`);
  }
  const query = isTaskTable
    ? state.team.client
        .from(table)
        .select('id,article_key,title,next_action,reason,owner,due,status,type,priority,platform,source,entity_label,auto_code,created_at,updated_at')
        .eq('brand', currentBrand())
    : isAttachmentTable
      ? state.team.client
          .from(table)
          .select('id,task_id,article_key,file_name,mime_type,file_size,bucket_name,object_path,public_url,created_at,created_by,updated_at')
          .eq('brand', currentBrand())
      : state.team.client.from(table).select('*').eq('brand', currentBrand());
  const response = await withTimeout(query, 8000, `Запрос ${table}`);
  if (response.error) throw response.error;
  return response.data || [];
}

async function purgeRemoteAutoTasks(rows = []) {
  if (!hasRemoteStore()) return 0;
  const ids = [...new Set((rows || [])
    .filter((row) => row?.source === 'auto' && row?.id)
    .map((row) => String(row.id).trim())
    .filter(Boolean))];
  if (!ids.length) return 0;

  const cfg = teamRestConfig();
  if (cfg?.accessToken) {
    const url = new URL(`${cfg.baseUrl}/rest/v1/${TEAM_TABLES.tasks}`);
    url.searchParams.set('brand', `eq.${cfg.brand}`);
    url.searchParams.set('source', 'eq.auto');
    url.searchParams.set('id', `in.(${ids.join(',')})`);
    const response = await withTimeout(fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json',
        Prefer: 'return=representation'
      }
    }), 8000, 'Удаление auto-задач');
    const deleted = await readSupabaseJson(response, 'Удаление auto-задач');
    return Array.isArray(deleted) ? deleted.length : ids.length;
  }

  const response = await withTimeout(
    state.team.client
      .from(TEAM_TABLES.tasks)
      .delete()
      .eq('brand', currentBrand())
      .eq('source', 'auto')
      .in('id', ids),
    8000,
    'Удаление auto-задач'
  );
  if (response.error) throw response.error;
  return Array.isArray(response.data) ? response.data.length : ids.length;
}

async function upsertRemote(table, rows, onConflict) {
  if (!hasRemoteStore() || !rows.length) return;
  const label = `\u0421\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u044f ${table}`;
  const cfg = teamRestConfig();
  if (cfg?.accessToken) {
    const url = new URL(`${cfg.baseUrl}/rest/v1/${table}`);
    url.searchParams.set('on_conflict', onConflict);
    await retryTransientSupabase(async () => {
      const response = await withTimeout(fetch(url.toString(), {
        method: 'POST',
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(rows)
    }), 8000, `Синхронизация ${table}`);
    await readSupabaseJson(response, `Синхронизация ${table}`);
    }, { retries: 1, delayMs: 1000 });
    return;
  }
  const response = await retryTransientSupabase(() => withTimeout(
    state.team.client.from(table).upsert(rows, { onConflict }),
    8000,
    `Синхронизация ${table}`
  ), { retries: 1, delayMs: 1000 });
  if (response.error) throw response.error;
}

async function upsertTaskAttachmentsSafe(rows = []) {
  const preparedRows = Array.isArray(rows) ? rows : [];
  if (!preparedRows.length) return { skipped: false, warning: '' };
  try {
    await upsertRemote(TEAM_TABLES.attachments, preparedRows, 'id');
    return { skipped: false, warning: '' };
  } catch (error) {
    if (isTaskAttachmentSchemaMissingError(error)) {
      return { skipped: true, warning: taskAttachmentSetupHint() };
    }
    if (isTransientSupabaseError(error)) {
      return { skipped: true, warning: taskAttachmentDeferredSyncMessage() };
    }
    throw error;
  }
}

async function pullRemoteState(rerender = true) {
  if (!hasRemoteStore()) return;
  try {
    state.team.mode = 'pending';
    state.team.note = 'Загружаем командные данные…';
    updateSyncBadge();
    const taskRows = await queryRemote(TEAM_TABLES.tasks);
    const [commentResult, decisionResult, ownerResult, attachmentResult, repricerControlsResult] = await Promise.allSettled([
      queryRemote(TEAM_TABLES.comments),
      queryRemote(TEAM_TABLES.decisions),
      queryRemote(TEAM_TABLES.owners),
      queryRemote(TEAM_TABLES.attachments),
      queryRemoteRepricerControls()
    ]);
    const manualTaskRows = taskRows.filter((row) => row?.source !== 'auto');
    const staleAutoTaskRows = taskRows.filter((row) => row?.source === 'auto');
    const commentsLoaded = commentResult.status === 'fulfilled';
    const decisionsLoaded = decisionResult.status === 'fulfilled';
    const ownersLoaded = ownerResult.status === 'fulfilled';
    const attachmentsLoaded = attachmentResult.status === 'fulfilled';
    const repricerControlsLoaded = repricerControlsResult.status === 'fulfilled';
    const commentRows = commentsLoaded ? (commentResult.value || []) : null;
    const decisionRows = decisionsLoaded ? (decisionResult.value || []) : null;
    const ownerRows = ownersLoaded ? (ownerResult.value || []) : null;
    const attachmentRows = attachmentsLoaded ? (attachmentResult.value || []) : null;
    const repricerControls = repricerControlsLoaded ? (repricerControlsResult.value || null) : null;
    const softErrors = [commentResult, decisionResult, ownerResult, attachmentResult, repricerControlsResult]
      .filter((result) => result.status !== 'fulfilled')
      .map((result) => result.reason?.message || String(result.reason || 'Неизвестная ошибка'))
      .filter(Boolean);
    state.team.lastPullCoverage = {
      tasks: true,
      comments: commentsLoaded,
      decisions: decisionsLoaded,
      owners: ownersLoaded,
      attachments: attachmentsLoaded,
      repricerControls: repricerControlsLoaded
    };
    let autoCleanupCount = 0;
    if (staleAutoTaskRows.length) {
      try {
        autoCleanupCount = await purgeRemoteAutoTasks(staleAutoTaskRows);
      } catch (error) {
        softErrors.push(error?.message || String(error));
      }
    }
    const hasKnownRemoteData = Boolean(manualTaskRows.length)
      || (commentsLoaded && Boolean(commentRows?.length))
      || (decisionsLoaded && Boolean(decisionRows?.length))
      || (ownersLoaded && Boolean(ownerRows?.length))
      || (attachmentsLoaded && Boolean(attachmentRows?.length))
      || (repricerControlsLoaded && Boolean(repricerControls));
    const remoteEmpty = !hasKnownRemoteData;
    if (!remoteEmpty) {
      state.storage.tasks = mergeRemoteTasksWithLocal(manualTaskRows.map(fromRemoteTask));
      if (commentsLoaded) {
        state.storage.comments = mergeRemoteListWithLocal(state.storage.comments || [], commentRows.map(fromRemoteComment), normalizeComment);
        state.storage.resourceLinks = mergeResourceLinksWithCommentEvents(state.storage.resourceLinks || [], state.storage.comments);
        state.storage.resourceFolders = mergeResourceFoldersWithCommentEvents(state.storage.resourceFolders || [], state.storage.comments);
      }
      if (decisionsLoaded) state.storage.decisions = mergeRemoteListWithLocal(state.storage.decisions || [], decisionRows.map(fromRemoteDecision), normalizeDecision);
      if (ownersLoaded) state.storage.ownerOverrides = mergeRemoteListWithLocal(
        state.storage.ownerOverrides || [],
        ownerRows.map(fromRemoteOwner),
        normalizeOwnerOverride,
        (item) => item.articleKey
      );
      if (attachmentsLoaded) state.storage.taskAttachments = attachmentRows.map(fromRemoteTaskAttachment).filter((item) => item.taskId && item.objectPath);
      if (repricerControls) applyRepricerControlsPayload(repricerControls);
      applyOwnerOverridesToSkus();
      saveLocalStorage();
    }
    state.team.mode = 'ready';
    state.team.lastSyncAt = new Date().toISOString();
    state.team.error = softErrors.join(' | ');
    state.team.note = remoteEmpty
      ? 'Командная база пока пустая — локальные данные сохранены'
      : softErrors.length
        ? `Командная база подключена частично · ${fmt.date(state.team.lastSyncAt)}`
        : `Командная база синхронизирована · ${fmt.date(state.team.lastSyncAt)}`;
    if (autoCleanupCount) state.team.note += ` · убрали legacy auto: ${autoCleanupCount}`;
    updateSyncBadge();
    if (rerender) {
      rerenderCurrentView();
      if (state.activeSku) renderSkuModal(state.activeSku);
    }
  } catch (error) {
    console.error(error);
    state.team.mode = 'error';
    state.team.lastPullCoverage = {
      tasks: false,
      comments: false,
      decisions: false,
      owners: false,
      attachments: false,
      repricerControls: false
    };
    state.team.error = error.message || 'Не удалось загрузить данные';
    state.team.note = 'Ошибка загрузки из Supabase';
    updateSyncBadge();
  }
}

async function pushStateToRemote() {
  if (!hasRemoteStore()) return;
  try {
    state.team.mode = 'pending';
    state.team.note = 'Отправляем локальные данные в командную базу…';
    updateSyncBadge();
    const remoteTaskRows = await queryRemote(TEAM_TABLES.tasks);
    const staleAutoTaskRows = remoteTaskRows.filter((row) => row?.source === 'auto');
    if (staleAutoTaskRows.length) await purgeRemoteAutoTasks(staleAutoTaskRows);
    ensureResourceLinksHaveCommentEvents();
    ensureResourceFoldersHaveCommentEvents();
    await Promise.all([
      upsertRemote(TEAM_TABLES.tasks, (state.storage.tasks || []).map(remoteTaskRow), 'id'),
      upsertRemote(TEAM_TABLES.comments, (state.storage.comments || []).map(remoteCommentRow), 'id'),
      upsertRemote(TEAM_TABLES.decisions, (state.storage.decisions || []).map(remoteDecisionRow), 'id'),
      upsertRemote(TEAM_TABLES.owners, (state.storage.ownerOverrides || []).map(remoteOwnerRow), 'brand,article_key'),
      persistRepricerControls()
    ]);
    const attachmentSync = await upsertTaskAttachmentsSafe((state.storage.taskAttachments || []).map(remoteTaskAttachmentRow));
    state.team.mode = 'ready';
    state.team.lastSyncAt = new Date().toISOString();
    state.team.error = attachmentSync.warning || '';
    state.team.note = attachmentSync.skipped
      ? `Данные отправлены в Supabase · ${fmt.date(state.team.lastSyncAt)} · attachments paused`
      : `Данные отправлены в Supabase · ${fmt.date(state.team.lastSyncAt)}`;
    updateSyncBadge();
  } catch (error) {
    console.error(error);
    state.team.mode = 'error';
    state.team.error = error.message || 'Не удалось отправить данные';
    state.team.note = 'Ошибка выгрузки в Supabase';
    updateSyncBadge();
  }
}

async function persistTask(task) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.tasks, [remoteTaskRow(task)], 'id');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Задача синхронизирована · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

async function persistComment(comment) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.comments, [remoteCommentRow(comment)], 'id');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Комментарий синхронизирован · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

async function createComment(comment) {
  const normalized = normalizeComment(comment);
  state.storage.comments = mergeRemoteListWithLocal(state.storage.comments || [], [normalized], normalizeComment);
  if (normalized.articleKey === TEAM_RESOURCE_ARTICLE_KEY) {
    state.storage.resourceLinks = mergeResourceLinksWithCommentEvents(state.storage.resourceLinks || [], state.storage.comments);
    state.storage.resourceFolders = mergeResourceFoldersWithCommentEvents(state.storage.resourceFolders || [], state.storage.comments);
  }
  saveLocalStorage({ reason: 'comment-create' });
  await persistComment(normalized);
  return normalized;
}

window.persistComment = persistComment;
window.createComment = createComment;

async function persistDecision(decision) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.decisions, [remoteDecisionRow(decision)], 'id');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Решение синхронизировано · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

async function persistOwnerOverride(item) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.owners, [remoteOwnerRow(item)], 'brand,article_key');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Ответственный синхронизирован · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

async function persistTaskAttachment(item) {
  if (!hasRemoteStore()) return;
  try {
    await upsertRemote(TEAM_TABLES.attachments, [remoteTaskAttachmentRow(item)], 'id');
  } catch (error) {
    if (isTaskAttachmentSchemaMissingError(error)) {
      throw new Error(taskAttachmentSetupHint());
    }
    throw error;
  }
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Вложение синхронизировано · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

function retryTaskAttachmentPersistInBackground(attachment) {
  if (!attachment || typeof setTimeout !== 'function') return;
  setTimeout(async () => {
    try {
      await persistTaskAttachment(attachment);
      state.team.error = '';
      state.team.note = `\u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u043d\u043e \u00b7 ${fmt.date(state.team.lastSyncAt)}`;
      state.team.mode = 'ready';
      updateSyncBadge();
    } catch (error) {
      console.warn('[task-attachment] deferred persist retry', error);
    }
  }, 6000);
}

let taskAttachmentRemoteInitPromise = null;

async function ensureTaskAttachmentRemoteStore() {
  if (hasRemoteStore()) return;
  const cfg = currentConfig();
  const canInitRemote = cfg.teamMode === 'supabase'
    && cfg.supabase?.url
    && cfg.supabase?.anonKey
    && typeof initTeamStore === 'function';
  if (!canInitRemote) return;
  if (!taskAttachmentRemoteInitPromise) {
    taskAttachmentRemoteInitPromise = Promise.resolve()
      .then(() => initTeamStore())
      .catch((error) => {
        console.warn('[task-attachment] remote init retry', error);
      })
      .finally(() => {
        taskAttachmentRemoteInitPromise = null;
      });
  }
  await taskAttachmentRemoteInitPromise;
}

async function deleteTaskAttachmentRecord(attachmentId) {
  const normalizedId = String(attachmentId || '').trim();
  if (!normalizedId || !hasRemoteStore()) return;
  try {
    const cfg = teamRestConfig();
    if (cfg?.accessToken) {
      const url = new URL(`${cfg.baseUrl}/rest/v1/${TEAM_TABLES.attachments}`);
      url.searchParams.set('brand', `eq.${cfg.brand}`);
      url.searchParams.set('id', `eq.${normalizedId}`);
      const response = await withTimeout(fetch(url.toString(), {
        method: 'DELETE',
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.accessToken}`,
          Accept: 'application/json',
          Prefer: 'return=representation'
        }
      }), 10000, 'Удаление вложения');
      await readSupabaseJson(response, 'Удаление вложения');
    } else {
      const response = await withTimeout(
        state.team.client
          .from(TEAM_TABLES.attachments)
          .delete()
          .eq('brand', currentBrand())
          .eq('id', normalizedId),
        10000,
        'Удаление вложения'
      );
      if (response.error) throw response.error;
    }
  } catch (error) {
    if (isTaskAttachmentSchemaMissingError(error)) return;
    throw error;
  }
}

async function removeTaskAttachmentObject(item) {
  const attachment = normalizeTaskAttachment(item || {});
  const cfg = teamRestConfig();
  if (!attachment.bucket || !attachment.objectPath || !cfg?.accessToken) return;
  const objectUrl = `${cfg.baseUrl}/storage/v1/object/${encodeURIComponent(attachment.bucket)}/${encodeStoragePath(attachment.objectPath)}`;
  const response = await withTimeout(fetch(objectUrl, {
    method: 'DELETE',
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.accessToken}`,
      Accept: 'application/json'
    }
  }), 15000, 'Удаление файла');
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Удаление файла: ${body || response.status || 'request failed'}`);
  }
}

async function deleteTaskAttachment(attachmentId) {
  const normalizedId = String(attachmentId || '').trim();
  if (!normalizedId) return;
  const currentAttachment = (state.storage.taskAttachments || []).map(normalizeTaskAttachment).find((item) => item.id === normalizedId);
  state.storage.taskAttachments = (state.storage.taskAttachments || []).filter((item) => String(item?.id || '').trim() !== normalizedId);
  saveLocalStorage();
  try {
    if (currentAttachment) {
      try {
        await removeTaskAttachmentObject(currentAttachment);
      } catch (error) {
        console.warn('[task-attachment] file delete', error);
      }
    }
    await deleteTaskAttachmentRecord(normalizedId);
    state.team.lastSyncAt = new Date().toISOString();
    state.team.note = `Вложение удалено · ${fmt.date(state.team.lastSyncAt)}`;
    state.team.mode = 'ready';
    updateSyncBadge();
  } catch (error) {
    if (currentAttachment) {
      state.storage.taskAttachments.unshift(currentAttachment);
      saveLocalStorage();
    }
    throw error;
  }
}

async function uploadTaskAttachment(taskId, file, options = {}) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) throw new Error('Не выбрана задача для вложения.');
  if (!file) throw new Error('Файл не выбран.');
  if (!taskAttachmentAllowed(file)) {
    throw new Error(`Разрешены только файлы: ${TASK_ATTACHMENT_ALLOWED_EXTENSIONS.join(', ')}.`);
  }
  if (Number(file.size || 0) <= 0) throw new Error('Файл пустой.');
  if (Number(file.size || 0) > TASK_ATTACHMENT_MAX_BYTES) {
    throw new Error(`Файл больше ${Math.round(TASK_ATTACHMENT_MAX_BYTES / (1024 * 1024))} МБ.`);
  }
  if (!hasRemoteStore()) await ensureTaskAttachmentRemoteStore();
  const cfg = teamRestConfig();
  if (!hasRemoteStore() || !cfg?.accessToken) {
    throw new Error('Нужна активная синхронизация с Supabase, чтобы загрузить вложение.');
  }
  const task = typeof getTask === 'function' ? getTask(normalizedTaskId) : null;
  if (!task) throw new Error('Задача не найдена.');

  const bucket = String(options.bucket || TASK_ATTACHMENTS_BUCKET).trim() || TASK_ATTACHMENTS_BUCKET;
  const objectPath = taskAttachmentObjectPath(normalizedTaskId, file.name || 'file');
  const uploadUrl = `${cfg.baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`;

  const uploadResponse = await withTimeout(fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false'
    },
    body: file
  }), 30000, 'Загрузка вложения');

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text();
    if (isTaskAttachmentBucketMissingError(body)) {
      throw new Error(taskAttachmentSetupHint());
    }
    throw new Error(`Загрузка вложения: ${body || uploadResponse.status || 'request failed'}`);
  }

  const attachment = normalizeTaskAttachment({
    id: uid('attach'),
    taskId: normalizedTaskId,
    articleKey: task.articleKey || '',
    fileName: String(file.name || 'Файл'),
    mimeType: String(file.type || ''),
    size: Number(file.size || 0),
    bucket,
    objectPath,
    publicUrl: taskAttachmentPublicUrl(bucket, objectPath),
    createdAt: new Date().toISOString(),
    createdBy: state.team.member.name || task.owner || 'Команда'
  });

  state.storage.taskAttachments = (state.storage.taskAttachments || []).filter((item) => item.id !== attachment.id);
  state.storage.taskAttachments.unshift(attachment);
  saveLocalStorage();

  try {
    await persistTaskAttachment(attachment);
  } catch (error) {
    if (isTransientSupabaseError(error)) {
      console.warn('[task-attachment] metadata persist deferred', error);
      state.team.mode = 'error';
      state.team.error = taskAttachmentDeferredSyncMessage();
      state.team.note = '\u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0436\u0434\u0435\u0442 \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e\u0439 \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u0438';
      updateSyncBadge();
      retryTaskAttachmentPersistInBackground(attachment);
      return attachment;
    }
    try {
      await removeTaskAttachmentObject(attachment);
    } catch (cleanupError) {
      console.warn('[task-attachment] cleanup after failed persist', cleanupError);
    }
    state.storage.taskAttachments = (state.storage.taskAttachments || []).filter((item) => item.id !== attachment.id);
    saveLocalStorage();
    throw error;
  }

  return attachment;
}

async function deleteOwnerOverride(articleKey) {
  const normalizedArticleKey = String(articleKey || '').trim();
  if (!normalizedArticleKey || !hasRemoteStore()) return;

  const cfg = teamRestConfig();
  if (cfg?.accessToken) {
    const url = new URL(`${cfg.baseUrl}/rest/v1/${TEAM_TABLES.owners}`);
    url.searchParams.set('brand', `eq.${cfg.brand}`);
    url.searchParams.set('article_key', `eq.${normalizedArticleKey}`);
    const response = await withTimeout(fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json',
        Prefer: 'return=representation'
      }
    }), 8000, 'Удаление owner');
    await readSupabaseJson(response, 'Удаление owner');
  } else {
    const response = await withTimeout(
      state.team.client
        .from(TEAM_TABLES.owners)
        .delete()
        .eq('brand', currentBrand())
        .eq('article_key', normalizedArticleKey),
      8000,
      'Удаление owner'
    );
    if (response.error) throw response.error;
  }

  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Owner снят · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

function updateSyncBadge() {
  const badgeEl = document.getElementById('syncStatusBadge');
  const pullBtn = document.getElementById('pullRemoteBtn');
  const pushBtn = document.getElementById('pushRemoteBtn');
  if (!badgeEl) return;
  badgeEl.className = 'sync-status';
  const mode = state.team.mode || 'local';
  const hasUiError = Array.isArray(state.runtimeErrors) && state.runtimeErrors.length > 0;
  if (hasUiError) badgeEl.classList.add('pending');
  else if (mode === 'ready') badgeEl.classList.add('ready');
  else if (mode === 'pending') badgeEl.classList.add('pending');
  else if (mode === 'error') badgeEl.classList.add('error');
  else badgeEl.classList.add('local');
  const member = state.team.member?.name ? ` · ${state.team.member.name}` : '';
  const uiNote = hasUiError ? ' · есть ошибка интерфейса' : '';
  badgeEl.textContent = `${state.team.note || 'Локальный режим'}${member}${uiNote}`;
  const allowRemoteActions = mode !== 'local';
  if (pullBtn) {
    pullBtn.disabled = !hasRemoteStore();
    pullBtn.classList.toggle('hidden', !allowRemoteActions);
  }
  if (pushBtn) {
    pushBtn.disabled = !hasRemoteStore();
    pushBtn.classList.toggle('hidden', !allowRemoteActions);
  }
}

function filteredControlTasks(options = {}) {
  const f = state.controlFilters;
  const search = String(f.search || '').trim().toLowerCase();
  const selectedWorkstream = normalizeControlWorkstreamFilter(f.platform);
  const selectedPriority = String(f.priority || 'all').trim().toLowerCase();
  const ignorePlatform = Boolean(options.ignorePlatform);

  return getAllTasks().filter((task) => {
    const sku = getSku(task.articleKey);
    const workstream = controlWorkstreamMeta(controlWorkstreamKey(task, sku));
    const taskOwner = typeof canonicalOwnerName === 'function'
      ? canonicalOwnerName(task.owner || '')
      : String(task.owner || '').trim();
    const hay = [task.title, task.nextAction, task.reason, task.owner, taskOwner, task.articleKey, sku?.article, sku?.name, sku?.category, workstream.label, workstream.chip].filter(Boolean).join(' ').toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (f.owner !== 'all' && taskOwner !== f.owner) return false;
    if (f.status === 'active' && !isTaskActive(task)) return false;
    if (f.status !== 'active' && f.status !== 'all' && task.status !== f.status) return false;
    if (f.type !== 'all' && task.type !== f.type) return false;
    if (!ignorePlatform && selectedWorkstream !== 'all' && controlWorkstreamKey(task, sku) !== selectedWorkstream) return false;
    if (f.source === 'manual' && task.source === 'auto') return false;
    if (f.source === 'auto' && task.source !== 'auto') return false;
    if (selectedPriority !== 'all' && task.priority !== selectedPriority) return false;
    if (f.horizon === 'overdue' && !isTaskOverdue(task)) return false;
    if (f.horizon === 'today' && task.due !== todayIso()) return false;
    if (f.horizon === 'week' && (!task.due || task.due > plusDays(7))) return false;
    if (f.horizon === 'no_owner' && task.owner) return false;
    return true;
  });
}

function renderTaskCard(task) {
  const sku = getSku(task.articleKey);
  const skuLabel = taskEntityLine(task, sku);
  const controls = task.source === 'auto'
    ? `
      <button class="btn small-btn" data-take-task="${escapeHtml(task.id)}">Взять в работу</button>
      <button class="btn ghost small-btn" data-open-task="${escapeHtml(task.id)}">Открыть</button>
    `
    : `<button class="btn ghost small-btn" data-open-task="${escapeHtml(task.id)}">Открыть задачу</button>`;

  return `
    <div class="task-card ${isTaskOverdue(task) ? 'overdue' : ''}">
      <div class="head">
        <div>
          <div class="title">${escapeHtml(task.title)}</div>
          <div class="muted small" style="margin-top:4px">${skuLabel}</div>
        </div>
        ${taskStatusBadge(task)}
      </div>
      <div class="meta">${taskPriorityBadge(task)}${taskTypeBadge(task)}${taskPlatformBadge(task)}${taskSourceBadge(task)}</div>
      ${task.reason ? `<div class="muted small">${escapeHtmlMultiline(task.reason)}</div>` : ''}
      ${task.nextAction ? `<div><strong class="small">Следующее действие</strong><div class="muted small" style="margin-top:4px">${escapeHtmlMultiline(task.nextAction)}</div></div>` : ''}
      <div class="foot">
        <div class="muted small">${escapeHtml(task.owner || 'Без ответственного')} · срок ${escapeHtml(task.due || '—')}</div>
        <div class="actions">${controls}</div>
      </div>
    </div>
  `;
}

function renderMiniTask(task) {
  const sku = getSku(task.articleKey);
  return `
    <div class="task-mini ${isTaskOverdue(task) ? 'overdue' : ''}" data-open-task="${escapeHtml(task.id)}" style="cursor:pointer">
      <div class="left">
        <strong>${escapeHtml(task.title)}</strong>
        <div class="muted small">${escapeHtml(sku?.article || task.articleKey || task.entityLabel || '—')} · ${escapeHtml(task.owner || 'Без ответственного')} · ${escapeHtml(task.due || '—')}</div>
      </div>
      <div class="badge-stack">${taskPriorityBadge(task)}${taskStatusBadge(task)}</div>
    </div>
  `;
}

function renderOwnerRow(row, max) {
  const width = Math.max(6, Math.round((row.total / Math.max(1, max)) * 100));
  return `
    <div class="owner-row">
      <div class="head">
        <strong>${escapeHtml(row.owner)}</strong>
        <div class="badge-stack">
          ${badge(`${fmt.int(row.total)} задач`)}
          ${row.overdue ? badge(`${fmt.int(row.overdue)} проср.`, 'danger') : ''}
          ${row.critical ? badge(`${fmt.int(row.critical)} крит.`, 'warn') : ''}
        </div>
      </div>
      <div class="owner-bar"><span style="width:${width}%"></span></div>
    </div>
  `;
}

function buildControlWorkstreamSummary(tasks, key) {
  const grouped = key === 'all'
    ? sortTasks(tasks)
    : sortTasks(tasks.filter((task) => controlWorkstreamKey(task, getSku(task.articleKey)) === key));
  const active = grouped.filter(isTaskActive);
  const owners = [...new Set(active.map((task) => task.owner || 'Без ответственного'))].slice(0, 3);
  const meta = controlWorkstreamMeta(key);
  return {
    key,
    meta,
    tasks: grouped,
    activeCount: active.length,
    overdueCount: active.filter(isTaskOverdue).length,
    criticalCount: active.filter((task) => task.priority === 'critical').length,
    waitingCount: active.filter((task) => task.status === 'waiting_rop').length,
    ownerPreview: owners,
    typeCount: new Set(active.map((task) => task.type)).size
  };
}

function renderControlWorkstreamCard(summary, selectedKey) {
  const isSelected = selectedKey === summary.key;
  const hint = summary.ownerPreview.length
    ? `${summary.ownerPreview.join(' · ')} · ${fmt.int(summary.typeCount)} типов задач`
    : summary.meta.description;
  return `
    <button
      type="button"
      class="card kpi"
      data-control-workstream="${escapeHtml(summary.key)}"
      style="text-align:left;cursor:pointer;${isSelected ? 'box-shadow: inset 0 0 0 1px rgba(212, 164, 74, 0.46);border-color: rgba(212, 164, 74, 0.38);' : ''}"
    >
      <div class="label">${escapeHtml(summary.meta.label)}</div>
      <div class="value">${fmt.int(summary.activeCount)}</div>
      <div class="hint">${escapeHtml(hint)}</div>
      <div class="badge-stack" style="margin-top:10px">
        ${badge(`${fmt.int(summary.overdueCount)} проср.`, summary.overdueCount ? 'danger' : '')}
        ${badge(`${fmt.int(summary.criticalCount)} крит.`, summary.criticalCount ? 'warn' : '')}
        ${summary.waitingCount ? badge(`${fmt.int(summary.waitingCount)} на согл. у РОПа`, 'info') : badge('в контуре')}
      </div>
    </button>
  `;
}
