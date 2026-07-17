async function ensureViewData(view) {
  const key = VIEW_DATA_REQUIREMENTS[view];
  if (!key) return;
  if (state.boot.lazyReady?.[key]) return;
  if (state.boot.lazyLoads?.[key]) return state.boot.lazyLoads[key];

  const loader = LAZY_DATA_LOADERS[key];
  if (!loader) return;

  const pending = Promise.resolve()
    .then(() => loader())
    .then(() => {
      state.boot.lazyReady[key] = true;
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        const detail = { view, key, lazy: true };
        window.dispatchEvent(new CustomEvent('altea:view-data-ready', { detail }));
        window.dispatchEvent(new CustomEvent('altea:data-ready', { detail }));
      }
    })
    .finally(() => {
      delete state.boot.lazyLoads[key];
    });

  state.boot.lazyLoads[key] = pending;
  return pending;
}

const AUTO_RETURNS_TASKS_ENABLED = false;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} превысил ${Math.round(ms / 1000)} сек.`)), ms);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function uid(prefix = 'item') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function skuMatrixToken(value = '') {
  return String(value ?? '').trim().toLowerCase().replaceAll('ё', 'е').replace(/[^a-zа-я0-9]+/gi, '');
}

function skuMatrixPlatform(value = '') {
  const raw = skuMatrixToken(value);
  if (!raw || raw === 'all' || raw === 'все') return 'all';
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['oz', 'ozon'].includes(raw)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'yandexmarket', 'ямаркет'].includes(raw)) return 'ya';
  if (['ga', 'goldapple', 'зя', 'золотоеяблоко'].includes(raw)) return 'goldapple';
  if (['letu', 'letual', 'летуаль'].includes(raw)) return 'letu';
  if (['mm', 'magnit', 'magnitmarket', 'магнитмаркет'].includes(raw)) return 'magnit';
  return raw;
}

function getSkuMatrixEntry(articleKey = '') {
  const matrix = state.skuMatrix || {};
  const items = Array.isArray(matrix.items) ? matrix.items : [];
  const directIndex = matrix.indexes?.byArticleKey?.[articleKey];
  if (Number.isInteger(directIndex) && items[directIndex]) return items[directIndex];
  const token = skuMatrixToken(articleKey);
  return items.find((item) => skuMatrixToken(item.articleKey || item.article) === token) || null;
}

function getSkuMatrixAliasArticle(platform = '', apiSku = '') {
  const indexes = state.skuMatrix?.indexes?.aliasToArticleKey || {};
  const normalizedPlatform = skuMatrixPlatform(platform);
  const token = skuMatrixToken(apiSku);
  if (!token) return '';
  return indexes[`${normalizedPlatform}|${token}`] || indexes[`all|${token}`] || '';
}

function skuMatrixSummary() {
  return state.skuMatrix?.summary || {};
}

function skuMatrixEntryForSku(skuOrArticleKey = '') {
  if (!skuOrArticleKey) return null;
  if (typeof skuOrArticleKey === 'string' || typeof skuOrArticleKey === 'number') {
    return getSkuMatrixEntry(String(skuOrArticleKey));
  }
  const key = skuOrArticleKey.articleKey || skuOrArticleKey.article || skuOrArticleKey.sku || '';
  return key ? getSkuMatrixEntry(key) : null;
}

function skuMatrixOwnerName(skuOrArticleKey = '', fallback = '') {
  const entry = skuMatrixEntryForSku(skuOrArticleKey);
  return canonicalOwnerName(entry?.owner || fallback || '');
}

function skuMatrixStatusLabel(skuOrArticleKey = '', fallback = '') {
  const entry = skuMatrixEntryForSku(skuOrArticleKey);
  return String(entry?.registryStatus || entry?.status || fallback || '').trim();
}

function skuMatrixProblemMeta(problemState = '') {
  const key = String(problemState || 'ok').trim() || 'ok';
  const meta = state.skuMatrix?.problemStates?.[key] || {};
  const defaults = {
    ok: { label: '\u0412 \u043c\u0430\u0442\u0440\u0438\u0446\u0435', tone: 'ok' },
    missing_owner: { label: '\u041d\u0435\u0442 owner', tone: 'warn' },
    has_critical_issue: { label: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0434\u0430\u043d\u043d\u044b\u0445', tone: 'danger' },
    has_warning: { label: '\u0415\u0441\u0442\u044c \u0437\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u0435', tone: 'warn' },
    api_unmapped: { label: 'API SKU \u0431\u0435\u0437 \u043f\u0430\u0440\u044b', tone: 'danger' },
    ignored: { label: 'API SKU \u0432 ignore', tone: '' },
    duplicate_risk: { label: '\u0420\u0438\u0441\u043a \u0434\u0443\u0431\u043b\u044f \u0432\u044b\u0440\u0443\u0447\u043a\u0438', tone: 'danger' },
    problem: { label: '\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u043d\u044b\u0439 SKU', tone: 'warn' }
  };
  return {
    label: meta.label || defaults[key]?.label || key,
    tone: meta.tone ?? defaults[key]?.tone ?? 'warn'
  };
}

function skuMatrixProblemState(skuOrArticleKey = '') {
  if (skuOrArticleKey && typeof skuOrArticleKey === 'object') {
    if (skuOrArticleKey.__skuPlanFactUnmapped) return 'api_unmapped';
    if (skuOrArticleKey.syntheticUnmapped) return 'api_unmapped';
    if (skuOrArticleKey.matrixProblemState) return skuOrArticleKey.matrixProblemState;
  }
  const entry = skuMatrixEntryForSku(skuOrArticleKey);
  if (entry?.problemState) return entry.problemState;
  if (Array.isArray(entry?.problemStates) && entry.problemStates.length) return entry.problemStates[0];
  const owner = typeof skuOrArticleKey === 'object'
    ? canonicalOwnerName(skuOrArticleKey?.owner?.name || '')
    : '';
  return owner ? 'ok' : 'missing_owner';
}

function plusDays(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftDateKey(dateKey, days) {
  const value = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const AUTO_TASK_HISTORY_LIMIT = 600;

function autoTaskHistorySignalKey(task = {}) {
  const article = String(task?.articleKey || task?.entityLabel || '').trim().toLowerCase();
  const code = String(task?.autoCode || task?.type || task?.title || 'auto').trim().toLowerCase();
  const platform = normalizeTaskPlatform(task?.platform || 'all');
  return `${article || 'common'}|${code || 'auto'}|${platform || 'all'}`;
}

function autoTaskHistoryHash(value = '') {
  return typeof hashString === 'function' ? hashString(value) : String(value || '').length.toString(36);
}

function autoTaskHistorySignature(task = {}) {
  return autoTaskHistoryHash([
    task?.title,
    task?.priority,
    task?.type,
    task?.platform,
    task?.owner,
    task?.due,
    task?.reason,
    task?.nextAction
  ].map((item) => String(item || '').trim()).join('|'));
}

function normalizeAutoTaskSnapshotEntry(entry = {}) {
  const signalKey = String(entry.signalKey || '').trim();
  if (!signalKey) return null;
  return {
    signalKey,
    taskId: String(entry.taskId || '').trim(),
    articleKey: String(entry.articleKey || '').trim(),
    platform: normalizeTaskPlatform(entry.platform || 'all'),
    autoCode: String(entry.autoCode || '').trim(),
    type: String(entry.type || '').trim(),
    title: String(entry.title || '').trim(),
    priority: String(entry.priority || '').trim(),
    owner: String(entry.owner || '').trim(),
    due: String(entry.due || '').trim(),
    nextAction: String(entry.nextAction || '').trim(),
    reason: String(entry.reason || '').trim(),
    signature: String(entry.signature || '').trim(),
    firstSeenAt: String(entry.firstSeenAt || entry.createdAt || '').trim(),
    lastSeenAt: String(entry.lastSeenAt || entry.updatedAt || '').trim(),
    lastSeenDate: String(entry.lastSeenDate || '').trim(),
    lastChangedAt: String(entry.lastChangedAt || '').trim(),
    seenCount: Math.max(1, Math.round(autoSignalFinite(entry.seenCount, 1)))
  };
}

function normalizeAutoTaskSnapshot(snapshot = {}) {
  const active = Array.isArray(snapshot?.active)
    ? snapshot.active.map(normalizeAutoTaskSnapshotEntry).filter(Boolean).slice(0, 250)
    : [];
  return {
    generatedAt: String(snapshot?.generatedAt || '').trim(),
    active
  };
}

function normalizeAutoTaskHistoryEvent(event = {}) {
  const signalKey = String(event.signalKey || '').trim();
  if (!signalKey) return null;
  const kind = ['created', 'updated', 'seen', 'resolved'].includes(String(event.kind || '').trim())
    ? String(event.kind || '').trim()
    : 'updated';
  return {
    id: String(event.id || stableId('auto-history', `${signalKey}|${event.createdAt || ''}|${kind}`)),
    signalKey,
    taskId: String(event.taskId || '').trim(),
    articleKey: String(event.articleKey || '').trim(),
    platform: normalizeTaskPlatform(event.platform || 'all'),
    autoCode: String(event.autoCode || '').trim(),
    type: String(event.type || '').trim(),
    kind,
    title: String(event.title || '').trim(),
    priority: String(event.priority || '').trim(),
    owner: String(event.owner || '').trim(),
    due: String(event.due || '').trim(),
    nextAction: String(event.nextAction || '').trim(),
    reason: String(event.reason || '').trim(),
    text: String(event.text || '').trim(),
    firstSeenAt: String(event.firstSeenAt || '').trim(),
    lastSeenAt: String(event.lastSeenAt || '').trim(),
    lastSeenDate: String(event.lastSeenDate || '').trim(),
    lastChangedAt: String(event.lastChangedAt || '').trim(),
    seenCount: Math.max(1, Math.round(autoSignalFinite(event.seenCount, 1))),
    createdAt: String(event.createdAt || '').trim()
  };
}

function normalizeAutoTaskHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .map(normalizeAutoTaskHistoryEvent)
    .filter(Boolean)
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
    .slice(0, AUTO_TASK_HISTORY_LIMIT);
}

function normalizeStoredResourceLink(item = {}) {
  if (!item || typeof item !== 'object') return null;
  return {
    ...item,
    folderId: String(item.folderId || '').trim(),
    updatedAt: String(item.updatedAt || item.createdAt || '').trim()
  };
}

function normalizeStoredResourceFolder(item = {}) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || item.name || '').trim();
  if (!title) return null;
  const group = String(item.group || '\u041e\u0431\u0449\u0435\u0435 \u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435').trim() || '\u041e\u0431\u0449\u0435\u0435 \u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435';
  const createdAt = String(item.createdAt || '').trim();
  const id = String(item.id || stableId('resource-folder', `${title}|${group}|${createdAt}`)).trim();
  if (!id) return null;
  return {
    id,
    title,
    description: String(item.description || item.note || '').trim(),
    group,
    owner: String(item.owner || item.createdBy || '').trim(),
    createdAt,
    updatedAt: String(item.updatedAt || createdAt).trim()
  };
}

function normalizePortalStorageSnapshot(source = {}) {
  const parsed = source && typeof source === 'object' ? source : {};
  const defaults = defaultStorage();
  return {
    ...defaults,
    comments: Array.isArray(parsed.comments) ? parsed.comments.map(normalizeComment) : [],
    tasks: Array.isArray(parsed.tasks) ? normalizeStorageTasks(parsed.tasks, 'manual') : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizeDecision) : [],
    ownerOverrides: Array.isArray(parsed.ownerOverrides) ? parsed.ownerOverrides.map(normalizeOwnerOverride) : [],
    resourceLinks: Array.isArray(parsed.resourceLinks) ? parsed.resourceLinks.map(normalizeStoredResourceLink).filter(Boolean) : [],
    resourceFolders: Array.isArray(parsed.resourceFolders) ? parsed.resourceFolders.map(normalizeStoredResourceFolder).filter(Boolean) : [],
    productLifecycleOverrides: Array.isArray(parsed.productLifecycleOverrides) ? parsed.productLifecycleOverrides.map(normalizeProductLifecycleOverride).filter((item) => item.articleKey) : [],
    taskAttachments: Array.isArray(parsed.taskAttachments) ? parsed.taskAttachments.map(normalizeTaskAttachment).filter((item) => item.taskId && item.objectPath) : [],
    autoTaskSnapshot: normalizeAutoTaskSnapshot(parsed.autoTaskSnapshot || defaults.autoTaskSnapshot),
    autoTaskHistory: normalizeAutoTaskHistory(parsed.autoTaskHistory || []),
    promoEvents: Array.isArray(parsed.promoEvents) ? parsed.promoEvents.filter((item) => item && typeof item === 'object') : [],
    promoEventDeletedIds: Array.isArray(parsed.promoEventDeletedIds) ? parsed.promoEventDeletedIds.filter((item) => item && typeof item === 'object') : [],
    launchOverrides: Array.isArray(parsed.launchOverrides) ? parsed.launchOverrides.filter((item) => item && typeof item === 'object') : [],
    launchDeletedIds: Array.isArray(parsed.launchDeletedIds) ? parsed.launchDeletedIds.map((item) => String(item || '').trim()).filter(Boolean) : [],
    repricerSettings: normalizeRepricerSettings(parsed.repricerSettings || {}),
    repricerSettingsUpdatedAt: String(parsed.repricerSettingsUpdatedAt || '').trim(),
    repricerOverrides: Array.isArray(parsed.repricerOverrides) ? parsed.repricerOverrides.map(normalizeRepricerOverride).filter((item) => item.articleKey) : [],
    repricerSkuProfiles: Array.isArray(parsed.repricerSkuProfiles) ? parsed.repricerSkuProfiles.map(normalizeRepricerSkuProfile).filter((item) => item.articleKey) : [],
    repricerCorridors: Array.isArray(parsed.repricerCorridors) ? parsed.repricerCorridors.map(normalizeRepricerCorridor).filter((item) => item.articleKey) : [],
    repricerOverrideDeletes: Array.isArray(parsed.repricerOverrideDeletes) ? parsed.repricerOverrideDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey) : [],
    repricerSkuProfileDeletes: Array.isArray(parsed.repricerSkuProfileDeletes) ? parsed.repricerSkuProfileDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey) : [],
    repricerCorridorDeletes: Array.isArray(parsed.repricerCorridorDeletes) ? parsed.repricerCorridorDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey) : [],
    repricerPendingApiAdds: Array.isArray(parsed.repricerPendingApiAdds) ? parsed.repricerPendingApiAdds.filter((item) => item && typeof item === 'object') : [],
    repricerPendingApiDeletes: Array.isArray(parsed.repricerPendingApiDeletes) ? parsed.repricerPendingApiDeletes.filter((item) => item && typeof item === 'object') : [],
    repricerPendingCostFixes: Array.isArray(parsed.repricerPendingCostFixes) ? parsed.repricerPendingCostFixes.filter((item) => item && typeof item === 'object') : [],
    repricerPendingApiTasks: Array.isArray(parsed.repricerPendingApiTasks) ? parsed.repricerPendingApiTasks.filter((item) => item && typeof item === 'object') : [],
    repricerRepairHistory: Array.isArray(parsed.repricerRepairHistory) ? parsed.repricerRepairHistory.filter((item) => item && typeof item === 'object').slice(0, 400) : [],
    repricerRepairSnapshots: Array.isArray(parsed.repricerRepairSnapshots) ? parsed.repricerRepairSnapshots.filter((item) => item && typeof item === 'object').slice(0, 10) : [],
    repricerApiReconcileHistory: Array.isArray(parsed.repricerApiReconcileHistory) ? parsed.repricerApiReconcileHistory.filter((item) => item && typeof item === 'object').slice(0, 100) : [],
    repricerLastAuditImport: parsed.repricerLastAuditImport && typeof parsed.repricerLastAuditImport === 'object' ? parsed.repricerLastAuditImport : null,
    repricerLastAutoFix: parsed.repricerLastAutoFix && typeof parsed.repricerLastAutoFix === 'object' ? parsed.repricerLastAutoFix : null,
    repricerLastImportValidation: parsed.repricerLastImportValidation && typeof parsed.repricerLastImportValidation === 'object' ? parsed.repricerLastImportValidation : null,
    repricerLastApiReconcile: parsed.repricerLastApiReconcile && typeof parsed.repricerLastApiReconcile === 'object' ? parsed.repricerLastApiReconcile : null,
    portalDataRules: parsed.portalDataRules && typeof parsed.portalDataRules === 'object' ? parsed.portalDataRules : {},
    portalDataRulesUpdatedAt: String(parsed.portalDataRulesUpdatedAt || '').trim(),
    portalIssueSnapshot: parsed.portalIssueSnapshot && typeof parsed.portalIssueSnapshot === 'object' ? parsed.portalIssueSnapshot : null
  };
}

function completePortalStorage(partial = {}, previous = {}) {
  const previousStorage = previous && typeof previous === 'object' ? previous : {};
  const partialStorage = partial && typeof partial === 'object' ? partial : {};
  return normalizePortalStorageSnapshot({ ...previousStorage, ...partialStorage });
}

function loadLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStorage();
    const parsed = JSON.parse(raw);
    const tasks = Array.isArray(parsed.tasks) ? normalizeStorageTasks(parsed.tasks, 'manual') : [];
    if (Array.isArray(parsed.tasks) && tasks.length !== parsed.tasks.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, tasks }));
      } catch {}
    }
    return normalizePortalStorageSnapshot({ ...parsed, tasks });
  } catch {
    return defaultStorage();
  }
}

window.normalizePortalStorageSnapshot = normalizePortalStorageSnapshot;
window.completePortalStorage = completePortalStorage;

function hydratePortalStorageBeforeRemote() {
  if (window.__ALTEA_PORTAL_STORAGE_EARLY_HYDRATED__) return state.storage;
  const persisted = loadLocalStorage();
  state.storage = completePortalStorage(persisted, state.storage || {});
  window.__ALTEA_PORTAL_STORAGE_EARLY_HYDRATED__ = true;
  return state.storage;
}

window.alteaHydratePortalStorageBeforeRemote = hydratePortalStorageBeforeRemote;
hydratePortalStorageBeforeRemote();

const STORAGE_HISTORY_KEY = `${STORAGE_KEY}-history-v1`;
const STORAGE_HISTORY_LIMIT = 16;

function portalStorageHistoryPayload(source = {}) {
  const snapshot = normalizePortalStorageSnapshot(source);
  return {
    comments: snapshot.comments,
    tasks: snapshot.tasks,
    decisions: snapshot.decisions,
    ownerOverrides: snapshot.ownerOverrides,
    resourceLinks: snapshot.resourceLinks,
    resourceFolders: snapshot.resourceFolders,
    productLifecycleOverrides: snapshot.productLifecycleOverrides,
    taskAttachments: snapshot.taskAttachments,
    autoTaskSnapshot: snapshot.autoTaskSnapshot,
    autoTaskHistory: snapshot.autoTaskHistory,
    promoEvents: snapshot.promoEvents,
    promoEventDeletedIds: snapshot.promoEventDeletedIds,
    launchOverrides: snapshot.launchOverrides,
    launchDeletedIds: snapshot.launchDeletedIds
  };
}

function portalStorageHistoryHash(payload = {}) {
  const text = JSON.stringify(payload);
  return typeof hashString === 'function' ? hashString(text) : String(text.length);
}

function portalStorageHistoryCounts(payload = {}) {
  return {
    comments: Array.isArray(payload.comments) ? payload.comments.length : 0,
    tasks: Array.isArray(payload.tasks) ? payload.tasks.length : 0,
    decisions: Array.isArray(payload.decisions) ? payload.decisions.length : 0,
    ownerOverrides: Array.isArray(payload.ownerOverrides) ? payload.ownerOverrides.length : 0,
    resourceLinks: Array.isArray(payload.resourceLinks) ? payload.resourceLinks.length : 0,
    resourceFolders: Array.isArray(payload.resourceFolders) ? payload.resourceFolders.length : 0,
    taskAttachments: Array.isArray(payload.taskAttachments) ? payload.taskAttachments.length : 0,
    autoTaskHistory: Array.isArray(payload.autoTaskHistory) ? payload.autoTaskHistory.length : 0,
    promoEvents: Array.isArray(payload.promoEvents) ? payload.promoEvents.length : 0
  };
}

function loadPortalStorageHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
  } catch {
    return [];
  }
}

function savePortalStorageHistory(history = []) {
  const normalized = Array.isArray(history) ? history.filter((item) => item && typeof item === 'object') : [];
  for (let limit = Math.min(STORAGE_HISTORY_LIMIT, normalized.length); limit >= 1; limit -= 1) {
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(normalized.slice(0, limit)));
      return true;
    } catch {}
  }
  return false;
}

function backupPortalStorage(reason = 'save') {
  try {
    const payload = portalStorageHistoryPayload(state.storage || {});
    const hash = portalStorageHistoryHash(payload);
    const history = loadPortalStorageHistory();
    if (history[0]?.hash === hash) return null;
    const capturedAt = new Date().toISOString();
    const entry = {
      id: `storage-${capturedAt.replace(/[^0-9]/g, '').slice(0, 14)}-${hash}`,
      capturedAt,
      reason,
      build: String(window.__ALTEA_PORTAL_BUILD__ || ''),
      hash,
      counts: portalStorageHistoryCounts(payload),
      storage: payload
    };
    savePortalStorageHistory([entry, ...history.filter((item) => item?.hash !== hash)]);
    return entry;
  } catch (error) {
    console.warn('[portal-storage-history] backup failed', error);
    return null;
  }
}

function listPortalStorageBackups() {
  return loadPortalStorageHistory().map((item) => ({
    id: item.id,
    capturedAt: item.capturedAt,
    reason: item.reason,
    build: item.build,
    counts: item.counts || {},
    hash: item.hash
  }));
}

function restorePortalStorageBackup(id) {
  const backupId = String(id || '').trim();
  const history = loadPortalStorageHistory();
  const entry = history.find((item) => item?.id === backupId);
  if (!entry?.storage) return null;
  backupPortalStorage('before-restore');
  state.storage = completePortalStorage(entry.storage, {});
  saveLocalStorage({ skipBackup: true, reason: 'restore' });
  applyOwnerOverridesToSkus();
  rerenderCurrentView();
  if (state.activeSku) renderSkuModal(state.activeSku);
  return entry;
}

window.alteaListStorageBackups = listPortalStorageBackups;
window.alteaRestoreStorageBackup = restorePortalStorageBackup;
window.alteaBackupPortalStorage = backupPortalStorage;

function saveLocalStorage(options = {}) {
  if (!options?.skipBackup) backupPortalStorage(options?.reason || 'save');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.storage));
  window.dispatchEvent(new CustomEvent('altea:portal-storage-updated', {
    detail: {
      key: STORAGE_KEY,
      source: 'app-core'
    }
  }));
}

let externalPortalStorageSyncQueued = false;

function syncPortalStorageFromExternal(source = 'external') {
  if (!state?.boot?.dataReady) return;

  state.storage = loadLocalStorage();
  applyOwnerOverridesToSkus();

  const skipPricesRerender = state.activeView === 'prices' && source === 'prices';
  if (skipPricesRerender) return;

  try {
    rerenderCurrentView();
    if (state.activeSku) renderSkuModal(state.activeSku);
  } catch (error) {
    console.error('[portal-storage-sync]', source, error);
  }
}

function queuePortalStorageSync(source = 'external') {
  if (externalPortalStorageSyncQueued) return;
  externalPortalStorageSyncQueued = true;
  window.setTimeout(() => {
    externalPortalStorageSyncQueued = false;
    syncPortalStorageFromExternal(source);
  }, 0);
}

window.addEventListener('altea:portal-storage-updated', (event) => {
  const detail = event?.detail || {};
  if (detail.key && detail.key !== STORAGE_KEY) return;
  if (detail.source === 'app-core') return;
  queuePortalStorageSync(detail.source || 'event');
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  queuePortalStorageSync('storage');
});

function teamMemberLabel() {
  const member = state.team.member || {};
  if (!member.name) return member.role || 'Команда';
  return `${member.name}${member.role ? ` · ${member.role}` : ''}`;
}

function normalizeSkuOwnerState(sku) {
  if (!sku || typeof sku !== 'object') return sku;

  if (sku.owner && typeof sku.owner === 'object') {
    sku.owner.name = canonicalOwnerName(sku.owner.name || '');
    if (sku.owner.byPlatform && typeof sku.owner.byPlatform === 'object') {
      for (const key of Object.keys(sku.owner.byPlatform)) {
        sku.owner.byPlatform[key] = canonicalOwnerName(sku.owner.byPlatform[key] || '');
      }
    }
  }
  if (sku.__baseOwner && typeof sku.__baseOwner === 'object') {
    sku.__baseOwner.name = canonicalOwnerName(sku.__baseOwner.name || '');
    if (sku.__baseOwner.byPlatform && typeof sku.__baseOwner.byPlatform === 'object') {
      for (const key of Object.keys(sku.__baseOwner.byPlatform)) {
        sku.__baseOwner.byPlatform[key] = canonicalOwnerName(sku.__baseOwner.byPlatform[key] || '');
      }
    }
  }
  if (sku.ownersByPlatform && typeof sku.ownersByPlatform === 'object') {
    for (const key of Object.keys(sku.ownersByPlatform)) {
      sku.ownersByPlatform[key] = canonicalOwnerName(sku.ownersByPlatform[key] || '');
    }
  }

  sku.flags = sku.flags || {};
  sku.flags.assigned = Boolean(sku.owner?.name);
  return sku;
}

function prepareSkuBaseState() {
  for (const sku of state.skus) {
    normalizeSkuOwnerState(sku);
    if (!sku.__baseOwner) sku.__baseOwner = JSON.parse(JSON.stringify(sku.owner || {}));
    if (!Object.prototype.hasOwnProperty.call(sku, '__baseStatus')) sku.__baseStatus = sku.status || '';
    if (!Object.prototype.hasOwnProperty.call(sku, '__baseProductStatus')) sku.__baseProductStatus = sku.productStatus || '';
  }
}

function applyOwnerOverridesToSkus() {
  prepareSkuBaseState();
  const overrideMap = new Map((state.storage.ownerOverrides || []).map((item) => [item.articleKey, item]));
  for (const sku of state.skus) {
    const baseOwner = JSON.parse(JSON.stringify(sku.__baseOwner || {}));
    baseOwner.name = canonicalOwnerName(baseOwner.name || '');
    const override = overrideMap.get(sku.articleKey);
    if (override) {
      const assignedOwnerName = canonicalOwnerName(override.ownerName || '');
      const hasAssignedOwner = Boolean(assignedOwnerName);
      const baseOwnerByPlatform = typeof normalizeOwnerOverridePlatforms === 'function'
        ? normalizeOwnerOverridePlatforms({
          ...(sku.ownersByPlatform || {}),
          ...(baseOwner.byPlatform || {})
        })
        : { ...(sku.ownersByPlatform || {}), ...(baseOwner.byPlatform || {}) };
      const overrideOwnerByPlatform = typeof normalizeOwnerOverridePlatforms === 'function'
        ? normalizeOwnerOverridePlatforms(override.ownerByPlatform || {})
        : { ...(override.ownerByPlatform || {}) };
      const ownerByPlatform = {
        ...baseOwnerByPlatform,
        ...overrideOwnerByPlatform
      };
      const hasPlatformOwner = Object.keys(ownerByPlatform).length > 0;
      sku.owner = {
        ...baseOwner,
        name: hasAssignedOwner ? assignedOwnerName : '',
        byPlatform: hasPlatformOwner ? ownerByPlatform : baseOwner.byPlatform,
        source: (hasAssignedOwner || hasPlatformOwner) ? 'Командное закрепление' : '',
        registryStatus: hasAssignedOwner
          ? (override.ownerRole || baseOwner.registryStatus || '')
          : (override.ownerRole || '')
      };
      if (hasPlatformOwner) sku.ownersByPlatform = ownerByPlatform;
      sku.flags = sku.flags || {};
      sku.flags.assigned = hasAssignedOwner || hasPlatformOwner;
    } else {
      sku.owner = baseOwner;
      sku.flags = sku.flags || {};
      sku.flags.assigned = Boolean(baseOwner?.name);
    }

    const lifecycle = typeof productLifecycleForSku === 'function'
      ? productLifecycleForSku({
        ...sku,
        status: sku.__baseStatus || sku.status || '',
        productStatus: sku.__baseProductStatus || sku.productStatus || ''
      }, sku.articleKey)
      : null;
    if (lifecycle) {
      sku.productLifecycle = lifecycle;
      if (lifecycle.explicit) {
        sku.productStatus = lifecycle.label;
        sku.status = lifecycle.label;
      } else {
        sku.productStatus = sku.__baseProductStatus || lifecycle.label || sku.productStatus || '';
        sku.status = sku.__baseStatus || sku.status || lifecycle.label || '';
      }
    }
  }
}

const SKU_LOOKUP_TOKEN_CACHE = new Map();
const SKU_LOOKUP_TOKEN_CACHE_LIMIT = 60000;
const SKU_LOOKUP_VALUES_CACHE = new WeakMap();
let skuLookupIndexCache = {
  source: null,
  length: -1,
  exact: null,
  token: null
};

function skuLookupToken(value = '') {
  const raw = String(value ?? '');
  if (SKU_LOOKUP_TOKEN_CACHE.has(raw)) return SKU_LOOKUP_TOKEN_CACHE.get(raw);
  const token = raw
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
  if (SKU_LOOKUP_TOKEN_CACHE.size > SKU_LOOKUP_TOKEN_CACHE_LIMIT) SKU_LOOKUP_TOKEN_CACHE.clear();
  SKU_LOOKUP_TOKEN_CACHE.set(raw, token);
  return token;
}

function skuLookupValues(sku = {}) {
  if (sku && typeof sku === 'object') {
    const cached = SKU_LOOKUP_VALUES_CACHE.get(sku);
    if (cached && cached.aliases === sku.aliases && cached.platformAliases === sku.platformAliases) {
      return cached.values.slice();
    }
  }
  const aliasValues = [];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') aliasValues.push(alias);
      else aliasValues.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.vendorCode, alias?.nmId);
    });
  }
  Object.values(sku.platformAliases || {}).forEach((values) => {
    if (Array.isArray(values)) aliasValues.push(...values);
    else aliasValues.push(values);
  });
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.nmId,
    sku.nmID,
    sku.barcode,
    ...aliasValues
  ].filter((value) => String(value ?? '').trim());
  if (sku && typeof sku === 'object') {
    SKU_LOOKUP_VALUES_CACHE.set(sku, {
      aliases: sku.aliases,
      platformAliases: sku.platformAliases,
      values
    });
    return values.slice();
  }
  return values;
}

function skuPrimaryKey(sku, fallback = '') {
  return String(sku?.articleKey || sku?.article || fallback || '').trim();
}

function resetSkuLookupIndex() {
  skuLookupIndexCache = {
    source: null,
    length: -1,
    exact: null,
    token: null
  };
}

function skuLookupIndex() {
  const skus = Array.isArray(state.skus) ? state.skus : [];
  if (
    skuLookupIndexCache.source === skus
    && skuLookupIndexCache.length === skus.length
    && skuLookupIndexCache.exact
    && skuLookupIndexCache.token
  ) {
    return skuLookupIndexCache;
  }

  const exact = new Map();
  const token = new Map();
  skus.forEach((sku) => {
    skuLookupValues(sku).forEach((value) => {
      const exactKey = String(value ?? '').trim();
      if (exactKey && !exact.has(exactKey)) exact.set(exactKey, sku);
      const lookupKey = skuLookupToken(value);
      if (lookupKey && !token.has(lookupKey)) token.set(lookupKey, sku);
    });
  });
  skuLookupIndexCache = {
    source: skus,
    length: skus.length,
    exact,
    token
  };
  return skuLookupIndexCache;
}

function getSku(articleKey) {
  const rawKey = String(articleKey ?? '').trim();
  if (!rawKey) return null;
  const index = skuLookupIndex();
  const exact = index.exact.get(rawKey);
  if (exact) return exact;
  const lookupKey = skuLookupToken(rawKey);
  if (!lookupKey) return null;
  return index.token.get(lookupKey) || null;
}

window.invalidateSkuLookupIndex = resetSkuLookupIndex;

function ownerName(sku) {
  const localOwner = canonicalOwnerName(sku?.owner?.name || '');
  return localOwner || skuMatrixOwnerName(sku, '');
}

const TASK_MARKETPLACE_PLATFORM_KEYS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'];
const TASK_PLATFORM_OWNER_KEYS = new Set(TASK_MARKETPLACE_PLATFORM_KEYS);

function taskOwnerPlatformKey(platform = '') {
  const key = normalizeTaskPlatform(platform);
  if (key === 'ya') return 'ym';
  if (key === 'goldapple') return 'ga';
  if (key === 'magnit') return 'mm';
  return key;
}

function taskPlatformOwnerName(sku, platform = '') {
  const platformKey = normalizeTaskPlatform(platform);
  if (!sku || !TASK_PLATFORM_OWNER_KEYS.has(platformKey)) return '';

  try {
    if (typeof platformOwnerName === 'function') {
      const platformOwner = canonicalOwnerName(platformOwnerName(sku, platformKey) || '');
      if (platformOwner) return platformOwner;
    }
  } catch {}

  const ownerKey = taskOwnerPlatformKey(platformKey);
  const sources = [sku?.owner?.byPlatform, sku?.ownersByPlatform];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const candidate = ownerKey === 'ym'
      ? (source.ym || source.ya || '')
      : source[ownerKey];
    const normalized = canonicalOwnerName(candidate || '');
    if (normalized) return normalized;
  }
  return '';
}

function defaultTaskPlatformOwnerName(platform = '') {
  const platformKey = normalizeTaskPlatform(platform);
  if (!TASK_PLATFORM_OWNER_KEYS.has(platformKey)) return '';
  try {
    if (typeof activeOwnerList === 'function') {
      const owner = activeOwnerList(platformKey)
        .map((value) => canonicalOwnerName(value || ''))
        .find(Boolean);
      if (owner) return owner;
    }
  } catch {}
  return '';
}

function isAutoTaskLike(task = {}, sourceHint = '') {
  const source = String(task?.source || sourceHint || '').trim().toLowerCase();
  const id = String(task?.id || '').trim().toLowerCase();
  return source === 'auto' || Boolean(task?.autoCode) || id.startsWith('auto-');
}

function isPersistentAutoTask(task = {}) {
  const code = String(task?.autoCode || '').trim().toLowerCase();
  return code === 'oos_control' || code === 'rop_strategic';
}

function resolveTaskOwner(task = {}, sku = null, platform = '', sourceHint = '') {
  const taskPlatform = normalizeTaskPlatform(platform || task?.platform || '', taskMarketplaceContext(task, sku));
  const explicitOwner = canonicalOwnerName(task?.owner || '');
  const skuOwner = ownerName(sku);
  const platformOwner = taskPlatformOwnerName(sku, taskPlatform);
  const defaultPlatformOwner = !sku && task?.type === 'launch'
    ? defaultTaskPlatformOwnerName(taskPlatform)
    : '';

  if (task?.platformOwnerOnly && TASK_PLATFORM_OWNER_KEYS.has(taskPlatform)) {
    return platformOwner || defaultPlatformOwner || explicitOwner || '';
  }
  if (platformOwner && (!explicitOwner || explicitOwner === skuOwner || isAutoTaskLike(task, sourceHint))) {
    return platformOwner;
  }
  return explicitOwner || platformOwner || defaultPlatformOwner || skuOwner || '';
}

function ownerOptions() {
  const pool = new Set(typeof activeOwnerList === 'function' ? activeOwnerList() : []);
  const addOwner = (value) => {
    const normalized = typeof activeOwnerName === 'function'
      ? activeOwnerName(value || '')
      : canonicalOwnerName(value || '');
    if (normalized) pool.add(normalized);
  };
  for (const sku of state.skus) {
    addOwner(ownerName(sku));
    if (sku?.ownersByPlatform && typeof sku.ownersByPlatform === 'object') {
      Object.values(sku.ownersByPlatform).forEach(addOwner);
    }
    if (sku?.owner?.byPlatform && typeof sku.owner.byPlatform === 'object') {
      Object.values(sku.owner.byPlatform).forEach(addOwner);
    }
  }
  for (const item of state.storage.ownerOverrides || []) addOwner(item.ownerName);
  return [...pool].sort((a, b) => a.localeCompare(b, 'ru'));
}

const TASK_COOWNER_REASON_RE = /\[\[coOwner:([^\]]+)\]\]/g;

function parseTaskReasonMeta(reasonValue = '') {
  let coOwner = '';
  const reason = String(reasonValue || '')
    .replace(TASK_COOWNER_REASON_RE, (_match, payload) => {
      try {
        coOwner = canonicalOwnerName(decodeURIComponent(payload) || '');
      } catch {
        coOwner = canonicalOwnerName(payload || '');
      }
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { reason, coOwner };
}

function composeTaskReason(reasonValue = '', coOwnerValue = '') {
  const cleanReason = parseTaskReasonMeta(reasonValue).reason;
  const coOwner = canonicalOwnerName(coOwnerValue || '');
  if (!coOwner) return cleanReason;
  const marker = `[[coOwner:${encodeURIComponent(coOwner)}]]`;
  return [cleanReason, marker].filter(Boolean).join('\n');
}

function ownerCell(sku) {
  const owner = ownerName(sku);
  if (!owner) return `<div class="owner-cell"><strong>Не закреплён</strong><div class="muted small">Нужно назначить owner</div></div>`;
  return `<div class="owner-cell"><strong>${escapeHtml(owner)}</strong><div class="muted small">${escapeHtml(skuOperationalStatusMeta(sku).label || '—')}</div></div>`;
}

function trafficBadges(sku, emptyLabel = 'нет') {
  const chips = [];
  if (sku?.traffic?.kz) chips.push('<span class="chip info">🚀 КЗ</span>');
  if (sku?.traffic?.vk) chips.push('<span class="chip info">📣 VK</span>');
  return chips.length ? `<div class="badge-stack traffic-inline">${chips.join('')}</div>` : `<span class="muted small">${escapeHtml(emptyLabel)}</span>`;
}

function parseTaskLogComment(comment) {
  const match = String(comment?.text || '').match(/^\[\[task:([^\]]+)\]\]\s*\[\[kind:([^\]]+)\]\]\s*/i);
  if (!match) return null;
  return {
    taskId: match[1],
    kind: match[2],
    text: String(comment?.text || '').replace(match[0], '').trim()
  };
}

function getTaskForHistory(taskId = '') {
  const id = String(taskId || '').trim();
  if (!id) return null;
  const stored = (state.storage.tasks || []).find((task) => String(task?.id || '') === id);
  if (stored) return stored;
  if (state.__buildingAutoTasks) return null;
  try {
    return typeof getAllTasks === 'function'
      ? getAllTasks().find((task) => String(task?.id || '') === id) || null
      : null;
  } catch {
    return null;
  }
}

function getAutoTaskHistoryItems(taskOrId = '') {
  const task = typeof taskOrId === 'object' && taskOrId
    ? taskOrId
    : getTaskForHistory(taskOrId);
  const taskId = String(typeof taskOrId === 'object' ? taskOrId?.id : taskOrId || '').trim();
  const signalKey = task ? autoTaskHistorySignalKey(task) : '';
  return (state.storage.autoTaskHistory || [])
    .filter((event) => {
      if (!event) return false;
      if (taskId && String(event.taskId || '') === taskId) return true;
      return signalKey && String(event.signalKey || '') === signalKey;
    })
    .map((event) => ({
      id: event.id,
      author: 'Портал',
      team: 'Авто-сигнал',
      kind: event.kind === 'seen' || event.kind === 'resolved' ? event.kind : (event.kind || 'updated'),
      text: event.text || event.title || event.autoCode || 'Авто-сигнал обновлён.',
      createdAt: event.createdAt,
      articleKey: event.articleKey || task?.articleKey || ''
    }));
}

window.getAutoTaskHistoryItems = getAutoTaskHistoryItems;

function getTaskHistory(taskId) {
  return [
    ...(state.storage.comments || [])
    .map((comment) => {
      const parsed = parseTaskLogComment(comment);
      return parsed && parsed.taskId === taskId ? { ...comment, kind: parsed.kind, text: parsed.text } : null;
    })
    .filter(Boolean),
    ...getAutoTaskHistoryItems(taskId)
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getRecentTaskHistory(tasks, limit = 6) {
  const taskIds = new Set((tasks || []).map((task) => task.id).filter(Boolean));
  return (state.storage.comments || [])
    .map((comment) => {
      const parsed = parseTaskLogComment(comment);
      return parsed && taskIds.has(parsed.taskId) ? { ...comment, taskId: parsed.taskId, kind: parsed.kind, text: parsed.text } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

function getSkuComments(articleKey) {
  return (state.storage.comments || [])
    .filter((comment) => comment.articleKey === articleKey && !parseTaskLogComment(comment))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getSkuDecisions(articleKey) {
  return (state.storage.decisions || [])
    .filter((decision) => decision.articleKey === articleKey)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getTaskAttachments(taskId) {
  const wantedTaskId = String(taskId || '').trim();
  if (!wantedTaskId) return [];
  return (state.storage.taskAttachments || [])
    .map(normalizeTaskAttachment)
    .filter((item) => item.taskId === wantedTaskId && item.objectPath)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function mergeSeedStorage(seed) {
  const existingComments = new Set((state.storage.comments || []).map((item) => `${item.articleKey}|${item.author}|${item.createdAt}|${item.text}`));
  const existingTasks = new Set((state.storage.tasks || []).map((item) => `${item.articleKey}|${item.owner}|${item.due}|${item.title}`));
  const existingAttachments = new Set((state.storage.taskAttachments || []).map((item) => String(item?.id || '').trim()).filter(Boolean));

  for (const rawComment of seed.comments || []) {
    const comment = normalizeComment(rawComment);
    const key = `${comment.articleKey}|${comment.author}|${comment.createdAt}|${comment.text}`;
    if (!existingComments.has(key)) state.storage.comments.push(comment);
  }
  for (const task of seed.tasks || []) {
    const normalized = normalizeTask(task, 'seed');
    if (isNonPersistentTaskSource(normalized?.source)) continue;
    const key = `${normalized.articleKey}|${normalized.owner}|${normalized.due}|${normalized.title}`;
    if (!existingTasks.has(key)) state.storage.tasks.push(normalized);
  }
  for (const rawAttachment of seed.taskAttachments || []) {
    const attachment = normalizeTaskAttachment(rawAttachment);
    if (!attachment.taskId || !attachment.objectPath || existingAttachments.has(attachment.id)) continue;
    state.storage.taskAttachments.push(attachment);
  }
  saveLocalStorage();
}

function mergeImportedStorage(imported) {
  state.storage.tasks = normalizeStorageTasks(state.storage.tasks || [], 'manual');
  const seed = {
    comments: Array.isArray(imported.comments) ? imported.comments : [],
    tasks: Array.isArray(imported.tasks) ? imported.tasks : [],
    decisions: Array.isArray(imported.decisions) ? imported.decisions : [],
    ownerOverrides: Array.isArray(imported.ownerOverrides) ? imported.ownerOverrides : [],
    resourceLinks: Array.isArray(imported.resourceLinks) ? imported.resourceLinks : [],
    resourceFolders: Array.isArray(imported.resourceFolders) ? imported.resourceFolders : [],
    productLifecycleOverrides: Array.isArray(imported.productLifecycleOverrides) ? imported.productLifecycleOverrides : [],
    taskAttachments: Array.isArray(imported.taskAttachments) ? imported.taskAttachments : [],
    promoEvents: Array.isArray(imported.promoEvents) ? imported.promoEvents : [],
    promoEventDeletedIds: Array.isArray(imported.promoEventDeletedIds) ? imported.promoEventDeletedIds : [],
    launchOverrides: Array.isArray(imported.launchOverrides) ? imported.launchOverrides : [],
    launchDeletedIds: Array.isArray(imported.launchDeletedIds) ? imported.launchDeletedIds : [],
    repricerSettings: imported.repricerSettings || {},
    repricerSettingsUpdatedAt: String(imported.repricerSettingsUpdatedAt || '').trim(),
    repricerOverrides: Array.isArray(imported.repricerOverrides) ? imported.repricerOverrides : [],
    repricerSkuProfiles: Array.isArray(imported.repricerSkuProfiles) ? imported.repricerSkuProfiles : [],
    repricerCorridors: Array.isArray(imported.repricerCorridors) ? imported.repricerCorridors : [],
    repricerOverrideDeletes: Array.isArray(imported.repricerOverrideDeletes) ? imported.repricerOverrideDeletes : [],
    repricerSkuProfileDeletes: Array.isArray(imported.repricerSkuProfileDeletes) ? imported.repricerSkuProfileDeletes : [],
    repricerCorridorDeletes: Array.isArray(imported.repricerCorridorDeletes) ? imported.repricerCorridorDeletes : [],
    portalDataRules: imported.portalDataRules && typeof imported.portalDataRules === 'object' ? imported.portalDataRules : null,
    portalDataRulesUpdatedAt: String(imported.portalDataRulesUpdatedAt || '').trim(),
    portalIssueSnapshot: imported.portalIssueSnapshot && typeof imported.portalIssueSnapshot === 'object' ? imported.portalIssueSnapshot : null
  };
  mergeSeedStorage(seed);
  for (const raw of seed.decisions) {
    const decision = normalizeDecision(raw);
    if (!state.storage.decisions.some((item) => item.id === decision.id)) state.storage.decisions.unshift(decision);
  }
  for (const raw of seed.ownerOverrides) {
    const override = normalizeOwnerOverride(raw);
    state.storage.ownerOverrides = (state.storage.ownerOverrides || []).filter((item) => item.articleKey !== override.articleKey);
    state.storage.ownerOverrides.unshift(override);
  }
  for (const raw of seed.resourceLinks) {
    if (!raw || typeof raw !== 'object') continue;
    const resourceId = String(raw.id || stableId('resource', `${raw.href || ''}|${raw.title || ''}|${raw.createdAt || ''}`)).trim();
    if (!resourceId) continue;
    state.storage.resourceLinks = (state.storage.resourceLinks || []).filter((item) => String(item?.id || '').trim() !== resourceId);
    state.storage.resourceLinks.unshift({ ...raw, id: resourceId });
  }
  for (const raw of seed.resourceFolders) {
    const folder = normalizeStoredResourceFolder(raw);
    if (!folder) continue;
    state.storage.resourceFolders = (state.storage.resourceFolders || []).filter((item) => String(item?.id || '').trim() !== folder.id);
    state.storage.resourceFolders.unshift(folder);
  }
  for (const raw of seed.productLifecycleOverrides) {
    const override = normalizeProductLifecycleOverride(raw);
    if (!override.articleKey) continue;
    state.storage.productLifecycleOverrides = (state.storage.productLifecycleOverrides || []).filter((item) => item.articleKey !== override.articleKey);
    state.storage.productLifecycleOverrides.unshift(override);
  }
  for (const raw of seed.taskAttachments) {
    const attachment = normalizeTaskAttachment(raw);
    if (!attachment.taskId || !attachment.objectPath) continue;
    state.storage.taskAttachments = (state.storage.taskAttachments || []).filter((item) => item.id !== attachment.id);
    state.storage.taskAttachments.unshift(attachment);
  }
  for (const raw of seed.launchOverrides) {
    if (!raw || typeof raw !== 'object') continue;
    const launchId = String(raw.id || '').trim();
    if (!launchId) continue;
    state.storage.launchOverrides = (state.storage.launchOverrides || []).filter((item) => String(item?.id || '').trim() !== launchId);
    state.storage.launchOverrides.unshift({ ...raw, id: launchId });
  }
  for (const rawId of seed.launchDeletedIds) {
    const launchId = String(rawId || '').trim();
    if (!launchId) continue;
    if (!Array.isArray(state.storage.launchDeletedIds)) state.storage.launchDeletedIds = [];
    if (!state.storage.launchDeletedIds.includes(launchId)) state.storage.launchDeletedIds.unshift(launchId);
  }
  state.storage.repricerSettings = normalizeRepricerSettings(seed.repricerSettings || state.storage.repricerSettings || {});
  if (seed.repricerSettingsUpdatedAt) {
    state.storage.repricerSettingsUpdatedAt = seed.repricerSettingsUpdatedAt;
  }
  for (const raw of seed.repricerOverrides) {
    const override = normalizeRepricerOverride(raw);
    if (!override.articleKey) continue;
    state.storage.repricerOverrides = (state.storage.repricerOverrides || []).filter((item) => !(item.articleKey === override.articleKey && item.platform === override.platform));
    state.storage.repricerOverrides.unshift(override);
  }
  for (const raw of seed.repricerSkuProfiles) {
    const profile = normalizeRepricerSkuProfile(raw);
    if (!profile.articleKey) continue;
    state.storage.repricerSkuProfiles = (state.storage.repricerSkuProfiles || []).filter((item) => item.articleKey !== profile.articleKey);
    state.storage.repricerSkuProfiles.unshift(profile);
  }
  for (const raw of seed.repricerCorridors) {
    const corridor = normalizeRepricerCorridor(raw);
    if (!corridor.articleKey) continue;
    state.storage.repricerCorridors = (state.storage.repricerCorridors || []).filter((item) => !(item.articleKey === corridor.articleKey && item.platform === corridor.platform));
    state.storage.repricerCorridors.unshift(corridor);
  }
  for (const raw of seed.repricerOverrideDeletes) {
    const marker = normalizeRepricerDeleteTombstone(raw);
    if (!marker.articleKey) continue;
    state.storage.repricerOverrides = (state.storage.repricerOverrides || []).filter((item) => !(item.articleKey === marker.articleKey && item.platform === marker.platform));
    state.storage.repricerOverrideDeletes = (state.storage.repricerOverrideDeletes || []).filter((item) => !(item.articleKey === marker.articleKey && item.platform === marker.platform));
    state.storage.repricerOverrideDeletes.unshift(marker);
  }
  for (const raw of seed.repricerSkuProfileDeletes) {
    const marker = normalizeRepricerDeleteTombstone(raw);
    if (!marker.articleKey) continue;
    state.storage.repricerSkuProfiles = (state.storage.repricerSkuProfiles || []).filter((item) => item.articleKey !== marker.articleKey);
    state.storage.repricerSkuProfileDeletes = (state.storage.repricerSkuProfileDeletes || []).filter((item) => item.articleKey !== marker.articleKey);
    state.storage.repricerSkuProfileDeletes.unshift(marker);
  }
  for (const raw of seed.repricerCorridorDeletes) {
    const marker = normalizeRepricerDeleteTombstone(raw);
    if (!marker.articleKey) continue;
    state.storage.repricerCorridors = (state.storage.repricerCorridors || []).filter((item) => !(item.articleKey === marker.articleKey && item.platform === marker.platform));
    state.storage.repricerCorridorDeletes = (state.storage.repricerCorridorDeletes || []).filter((item) => !(item.articleKey === marker.articleKey && item.platform === marker.platform));
    state.storage.repricerCorridorDeletes.unshift(marker);
  }
  if (seed.portalDataRules) state.storage.portalDataRules = { ...(state.storage.portalDataRules || {}), ...seed.portalDataRules };
  if (seed.portalDataRulesUpdatedAt) state.storage.portalDataRulesUpdatedAt = seed.portalDataRulesUpdatedAt;
  if (seed.portalIssueSnapshot) state.storage.portalIssueSnapshot = seed.portalIssueSnapshot;
  state.storage = completePortalStorage(state.storage, {});
  applyOwnerOverridesToSkus();
  saveLocalStorage();
}

function marginBadge(label, value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return badge(`${label} —`);
  return badge(`${label} ${fmt.pct(value)}`, Number(value) < 0 ? 'danger' : 'ok');
}
function currentWorkLabel() {
  if (state.filters.market === 'wb') return 'В работу WB = план < 80% + маржа WB < 0';
  if (state.filters.market === 'ozon') return 'В работу Ozon = план < 80% + маржа Ozon < 0';
  return 'В работу = план < 80% + отрицательная маржа';
}

function priorityBadges(sku) {
  const parts = [];
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) parts.push('<span class="chip danger">В работу WB/Ozon</span>');
  else if (sku?.flags?.toWorkWB) parts.push('<span class="chip danger">В работу WB</span>');
  else if (sku?.flags?.toWorkOzon) parts.push('<span class="chip danger">В работу Ozon</span>');
  else if (sku?.flags?.toWork) parts.push('<span class="chip danger">В работу</span>');
  if (sku?.flags?.wbNegativeMargin) parts.push('<span class="chip danger">WB маржа < 0</span>');
  if (sku?.flags?.ozonNegativeMargin) parts.push('<span class="chip danger">Ozon маржа < 0</span>');
  if (!sku?.flags?.assigned) parts.push('<span class="chip warn">Без owner</span>');
  if (sku?.flags?.hasKZ) parts.push('<span class="chip info">🚀 КЗ</span>');
  if (sku?.flags?.hasVK) parts.push('<span class="chip info">📣 VK</span>');
  parts.push(scoreChip(sku?.focusScore || 0));
  return `<div class="badge-stack">${parts.join('')}</div>`;
}

function commentTypeChip(type) {
  const map = { signal: 'info', risk: 'danger', focus: 'warn', idea: 'ok' };
  return badge(type || 'comment', map[type] || '');
}

function mapTaskStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (['open', 'new'].includes(raw)) return 'new';
  if (['in_progress', 'in progress', 'progress', 'doing', 'work', 'в работе'].includes(raw)) return 'in_progress';
  if (['waiting_team', 'waiting-team', 'wait_team'].includes(raw)) return 'waiting_team';
  if (['waiting_rop', 'rop_approval', 'waiting_approval', 'approval_rop', 'on_rop_approval'].includes(raw)) return 'waiting_rop';
  if (['blocked', 'waiting_decision', 'wait_decision', 'decision', 'waiting', 'waiting_executive', 'executive_approval', 'manager_approval', 'leader_approval', 'ждёт', 'ждет'].includes(raw)) return 'waiting_decision';
  if (['done', 'complete', 'completed', 'сделано'].includes(raw)) return 'done';
  if (['cancelled', 'canceled', 'отменено'].includes(raw)) return 'cancelled';
  return 'new';
}

function inferTaskType(text = '') {
  const raw = String(text || '').toLowerCase();
  if (/марж|цен|min price|unit|убыт|цена/.test(raw)) return 'price_margin';
  if (/контент|карточ|фото|тз|креатив|описан/.test(raw)) return 'content';
  if (/трафик|кз|vk|вк|инфлю|реклама|рк|smm/.test(raw)) return 'traffic';
  if (/остат|постав|склад|supply|oos|логист/.test(raw)) return 'supply';
  if (/возврат|отзыв|рейтинг/.test(raw)) return 'returns';
  if (/owner|закреп|назнач/.test(raw)) return 'assignment';
  if (/новин|launch|gate|бриф/.test(raw)) return 'launch';
  return 'general';
}

function isGoldAppleMarketplaceText(raw = '', compact = '') {
  const text = String(raw || '').toLowerCase();
  const flat = String(compact || text.replace(/[\s._'`"\u2019-]+/g, '')).toLowerCase();
  if (['goldapple', 'goldenapple', 'zya', '\u0437\u044f', '\u0437\u043e\u043b\u043e\u0442\u043e\u0435\u044f\u0431\u043b\u043e\u043a\u043e'].includes(flat)) return true;
  if (/(^|[^a-z0-9\u0430-\u044f\u0451])(?:z\s*y\s*a|\u0437\s*\u044f)(?=$|[^a-z0-9\u0430-\u044f\u0451])/i.test(text)) return true;
  return /\u0437\u043e\u043b\u043e\u0442[\u0430-\u044f\u0451\s-]*(\u044f\u0431\u043b\u043e\u043a|\u044f\u0431\u043b)|golden\s*apple|gold[\s_-]*apple|goldapple/i.test(text);
}

function detectMarketplaceNetworkKey(text = '') {
  const raw = String(text || '').toLowerCase();
  const compact = raw.replace(/[\s._'`"\u2019-]+/g, '');
  if (!raw) return '';
  if (isGoldAppleMarketplaceText(raw, compact)) return 'goldapple';
  if (/\u043b[\s'`\u2019.-]*[\u0435\u044d]\u0442\u0443\u0430\u043b|\u043b\u0435\u0442\u0443\u0430\u043b\u044c?|\u043b\u044d\u0442\u0443\u0430\u043b\u044c?|letual|letu|letoile|l[\s'`.-]*etoile/.test(raw) || ['letu', 'letual', 'letoile', '\u043b\u0435\u0442\u0443\u0430\u043b\u044c', '\u043b\u0435\u0442\u0443\u0430\u043b', '\u043b\u044d\u0442\u0443\u0430\u043b\u044c', '\u043b\u044d\u0442\u0443\u0430\u043b'].includes(compact)) return 'letu';
  if (/\u043c\u0430\u0433\u043d\u0438\u0442|magnit|magnet|(^|\W)mm($|\W)/.test(raw) || ['magnit', 'magnitmarket', 'magnet', 'magnetmarket', 'mm', '\u043c\u0430\u0433\u043d\u0438\u0442', '\u043c\u0430\u0433\u043d\u0438\u0442\u043c\u0430\u0440\u043a\u0435\u0442'].includes(compact)) return 'magnit';
  if (/\u044f\u043d\u0434\u0435\u043a\u0441|\u044f[.\s-]?\u043c\u0430\u0440\u043a\u0435\u0442|yandex|(^|[^a-z0-9])(ya|ym)([^a-z0-9]|$)|(^|[^\u0430-\u044f\u04510-9])\u044f\u043c([^\u0430-\u044f\u04510-9]|$)/.test(raw)) return 'ya';
  if (isGoldAppleMarketplaceText(raw, compact)) return 'goldapple';
  if (/\u043b['\u2019]?\s?[\u0435\u044d]\u0442\u0443\u0430\u043b|\u043b\u0435\u0442\u0443\u0430\u043b\u044c|letual|letu|letoile|l['\s.-]*etoile/.test(raw) || ['letu', 'letual', 'letoile'].includes(compact)) return 'letu';
  if (/\u043c\u0430\u0433\u043d\u0438\u0442|magnit|(^|\W)mm($|\W)/.test(raw) || ['magnit', 'magnitmarket', 'mm'].includes(compact)) return 'magnit';
  if (isGoldAppleMarketplaceText(raw, compact)) return 'goldapple';
  if (/\u043b['’]?\s?[\u0435\u044d]\u0442\u0443\u0430\u043b|\u043b\u0435\u0442\u0443\u0430\u043b\u044c|letual|letu/.test(raw)) return 'letu';
  if (/\u043c\u0430\u0433\u043d\u0438\u0442|magnit|(^|\W)mm($|\W)/.test(raw)) return 'magnit';
  if (/\u044f\u043d\u0434\u0435\u043a\u0441|\u044f[.\s-]?\u043c\u0430\u0440\u043a\u0435\u0442|\u044f\u043c|ym|yandex/.test(raw)) return 'ya';
  if (raw.includes('золотое яблоко') || raw.includes('goldapple') || raw.includes('gold apple') || raw.includes('золот')) return 'goldapple';
  if (raw.includes("л'этуаль") || raw.includes('летуаль') || raw.includes('letual') || raw.includes('letu')) return 'letu';
  if (raw.includes('магнит маркет') || raw.includes('магнитмаркет') || raw.includes('магнит') || raw.includes('magnit') || raw.includes('mm')) return 'magnit';
  if (raw.includes('яндекс') || raw.includes('я.маркет') || raw.includes('я маркет') || raw.includes('ям') || raw.includes('ym') || raw.includes('yandex')) return 'ya';
  return '';
}

function detectMarketplaceKeyList(text = '') {
  const raw = String(text || '').toLowerCase();
  const compact = raw.replace(/[\s._'`"\u2019-]+/g, '');
  const keys = [];
  const push = (key) => {
    if (key && !keys.includes(key)) keys.push(key);
  };
  if (/(^|[^a-zа-я0-9])wb(?=$|[^a-zа-я0-9])|wildberries|(^|[^а-я0-9])вб(?=$|[^а-я0-9])/i.test(raw)) push('wb');
  if (/ozon|озон/.test(raw)) push('ozon');
  if (/яндекс|я[.\s-]?маркет|yandex|(^|[^a-zа-я0-9])(ya|ym|ям)(?=$|[^a-zа-я0-9])/i.test(raw)) push('ya');
  if (isGoldAppleMarketplaceText(raw, compact)) push('goldapple');
  if (/л[\s'`\u2019.-]*[еэ]туал|летуаль?|лэтуаль?|letual|letu|letoile|l[\s'`.-]*etoile/.test(raw)) push('letu');
  if (/магнит|magnit|magnet|(^|\W)mm($|\W)/.test(raw)) push('magnit');
  if (/продукт|новин|launch|ксюш/.test(raw)) push('product');
  return keys;
}

function detectCorrectedGoldappleTaskPlatform(task, sku = null) {
  const platform = String(task?.platform || '').trim().toLowerCase();
  const compactPlatform = platform.replace(/[\s._'`"\u2019-]+/g, '');
  if (!['goldapple', 'goldenapple', 'zya', 'ga', 'зя', 'золотоеяблоко'].includes(compactPlatform)) return '';

  const titleKeys = detectMarketplaceKeyList([task?.title, task?.name, task?.subject, task?.articleKey].filter(Boolean).join(' '))
    .filter((key) => key !== 'goldapple');
  if (titleKeys.length === 1) return titleKeys[0];

  const marker = String([task?.entityLabel, task?.project, task?.topic].filter(Boolean).join(' ')).trim().toLowerCase();
  if (/^wb[\s-]/i.test(marker)) return 'wb';
  if (/^oz[\s-]|^ozon[\s-]/i.test(marker)) return 'ozon';
  if (/^mix[\s-]/i.test(marker)) return 'cross';

  const contextKeys = detectMarketplaceKeyList([
    task?.marketplace, task?.marketplaceKey, task?.network, task?.retailer, task?.channel, task?.market,
    task?.entityLabel, task?.direction, task?.workstream, task?.queue, task?.project, task?.topic,
    task?.nextAction, task?.reason,
    sku?.platform, sku?.marketplace, sku?.marketplaceKey, sku?.name, sku?.articleKey
  ].filter(Boolean).join(' '));
  const nonGold = contextKeys.filter((key) => key !== 'goldapple');
  if (nonGold.length === 1 && !contextKeys.includes('goldapple')) return nonGold[0];
  if (nonGold.length > 1) return 'cross';
  return '';
}

function detectTaskSpecificMarketplace(task) {
  const text = taskMarketplaceContext(task);
  return detectMarketplaceNetworkKey(text);
}

function marketplaceContextValue(value, depth = 0) {
  if (value == null || depth > 2) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => marketplaceContextValue(item, depth + 1)).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !/^(history|comments|updates|logs|rawRows?|html|node|element)$/i.test(key))
      .map(([key, item]) => `${key} ${marketplaceContextValue(item, depth + 1)}`)
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function taskMarketplaceContext(task, sku = null) {
  const taskFields = [
    'platform', 'marketplace', 'marketplaceKey', 'network', 'retailer', 'channel', 'market',
    'contour', 'direction', 'workstream', 'queue', 'role', 'team', 'project', 'topic',
    'title', 'name', 'subject', 'entityLabel', 'description', 'nextAction', 'reason',
    'context', 'comment', 'note', 'notes', 'details', 'message', 'text', 'body',
    'articleKey', 'sku', 'apiSku', 'tags', 'labels', 'meta', 'extra', 'payload', 'fields'
  ];
  const skuFields = [
    'platform', 'marketplace', 'marketplaceKey', 'network', 'retailer', 'channel', 'market',
    'name', 'title', 'articleKey', 'sku', 'apiSku'
  ];
  const taskContext = taskFields.map((key) => marketplaceContextValue(task?.[key])).join(' ');
  const skuContext = skuFields.map((key) => marketplaceContextValue(sku?.[key])).join(' ');
  return [taskContext, skuContext].filter(Boolean).join(' ');
}

function normalizeTaskPlatform(value, contextText = '') {
  const raw = String(value || '').trim().toLowerCase();
  const compactRaw = raw.replace(/[\s._'`"\u2019-]+/g, '');
  const text = `${raw} ${String(contextText || '').trim().toLowerCase()}`;

  if (raw === 'all') return 'all';
  if (['cross', 'common', 'shared', 'general'].includes(raw)) return 'cross';
  if (['wb', 'wildberries', 'вб'].includes(raw)) return 'wb';
  if (['ozon', 'озон'].includes(raw)) return 'ozon';
  if (['wb+ozon', 'wb + ozon', 'wb_ozon', 'wb-ozon'].includes(raw)) return 'wb+ozon';
  if (['goldapple', 'goldenapple', 'zya', 'ga'].includes(compactRaw)) return 'goldapple';
  if (['letu', 'letual', 'letoile'].includes(compactRaw)) return 'letu';
  if (['magnit', 'magnitmarket', 'mm'].includes(compactRaw)) return 'magnit';
  if (['ya', 'ym', 'yandex', 'yandex_market', 'yandexmarket', 'ya_market', 'ям', 'я.маркет', 'яндекс'].includes(raw)) return 'ya';
  if (['goldapple', 'ga', 'zya', 'зя'].includes(raw)) return 'goldapple';
  if (['letu', 'letual', 'летуаль'].includes(raw)) return 'letu';
  if (['magnit', 'mm'].includes(raw)) return 'magnit';
  if (['retail', 'federal', 'network', 'marketplaces_plus', 'marketplace_plus'].includes(raw)) return detectMarketplaceNetworkKey(text) || 'cross';
  if (['product', 'launch', 'launches', 'новинки', 'продукт', 'ксюша'].includes(raw)) return 'product';
  if (['executive', 'director', 'ceo', 'lead', 'директор', 'руководитель'].includes(raw)) return 'cross';

  if (/продукт|новин|launch|ксюш/.test(text)) return 'product';
  if (/директор|руководител|ceo|executive|эскалац|согласовани/.test(text)) return 'cross';
  const marketplace = detectMarketplaceNetworkKey(text);
  if (marketplace) return marketplace;
  if (/(^|\W)wb($|\W)|wildberries|вб/.test(text)) return 'wb';
  if (/ozon|озон/.test(text)) return 'ozon';
  return 'all';
}

function normalizeControlWorkstreamFilter(value) {
  const raw = String(value || 'all').trim().toLowerCase();
  if (raw === 'all') return 'all';
  const normalized = normalizeTaskPlatform(raw);
  if (normalized === 'wb+ozon') return 'cross';
  return CONTROL_WORKSTREAM_ORDER.includes(normalized) ? normalized : 'all';
}

function controlWorkstreamMeta(key) {
  return CONTROL_WORKSTREAM_META[key] || CONTROL_WORKSTREAM_META.cross;
}

function controlWorkstreamKey(task, sku = null) {
  const correctedGoldapplePlatform = detectCorrectedGoldappleTaskPlatform(task, sku);
  if (correctedGoldapplePlatform) return correctedGoldapplePlatform;

  const text = taskMarketplaceContext(task, sku);
  const specificMarketplace = detectMarketplaceNetworkKey(text);
  if (specificMarketplace === 'goldapple' || specificMarketplace === 'letu' || specificMarketplace === 'magnit' || specificMarketplace === 'ya') return specificMarketplace;

  const platform = normalizeTaskPlatform(task?.platform, text);

  if (platform === 'wb') return 'wb';
  if (platform === 'ozon') return 'ozon';
  if (platform === 'ya' || platform === 'goldapple' || platform === 'letu' || platform === 'magnit') return platform;
  if (platform === 'product') return 'product';
  if (platform === 'wb+ozon' || platform === 'cross' || platform === 'all') return 'cross';

  if (task?.type === 'launch') return 'product';
  if (sku?.flags?.toWorkWB && !sku?.flags?.toWorkOzon) return 'wb';
  if (sku?.flags?.toWorkOzon && !sku?.flags?.toWorkWB) return 'ozon';
  return 'cross';
}

function detectTaskPlatform(task, sku) {
  const correctedGoldapplePlatform = detectCorrectedGoldappleTaskPlatform(task, sku);
  if (correctedGoldapplePlatform) return correctedGoldapplePlatform;

  const text = taskMarketplaceContext(task, sku).toLowerCase();
  const explicitPlatform = task?.platform ? normalizeTaskPlatform(task.platform, text) : '';
  const strategicCross = explicitPlatform === 'cross'
    && (String(task?.source || '').trim().toLowerCase() === 'strategic'
      || String(task?.autoCode || '').trim().toLowerCase() === 'rop_strategic');
  if (strategicCross) return 'cross';

  if (explicitPlatform && explicitPlatform !== 'all' && explicitPlatform !== 'cross') return explicitPlatform;
  const marketplace = detectMarketplaceNetworkKey(text);
  if (marketplace) return marketplace;
  if (explicitPlatform) return explicitPlatform;
  if (/директор|руководител|ceo|executive|эскалац|согласовани/.test(text)) return 'cross';
  if (/продукт|новин|launch|ксюш/.test(text) || task?.type === 'launch') return 'product';
  if (text.includes('wb') && text.includes('ozon')) return 'wb+ozon';
  if (text.includes('wb')) return 'wb';
  if (text.includes('ozon')) return 'ozon';
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) return 'wb+ozon';
  if (sku?.flags?.toWorkWB) return 'wb';
  if (sku?.flags?.toWorkOzon) return 'ozon';
  if (sku?.flags?.hasWB && sku?.flags?.hasOzon) return 'wb+ozon';
  if (sku?.flags?.hasWB) return 'wb';
  if (sku?.flags?.hasOzon) return 'ozon';
  return 'all';
}

function normalizeTask(task, sourceHint = 'manual') {
  const sku = task?.articleKey ? getSku(task.articleKey) : null;
  const title = task?.title || 'Задача без названия';
  const type = task?.type || inferTaskType(`${title} ${task?.nextAction || ''}`);
  const priority = task?.priority || (type === 'price_margin' ? 'critical' : type === 'assignment' ? 'high' : 'medium');
  const createdAt = task?.createdAt || task?.created_at || new Date().toISOString();
  const updatedAt = task?.updatedAt || task?.updated_at || createdAt;
  const parsedReason = parseTaskReasonMeta(task?.reason || '');
  const coOwner = canonicalOwnerName(
    task?.coOwner
    || task?.co_owner
    || task?.secondaryOwner
    || task?.secondary_owner
    || task?.collaborator
    || parsedReason.coOwner
    || ''
  );
  const platform = detectTaskPlatform(task, sku);
  return {
    id: task?.id || stableId(sourceHint === 'auto' ? 'auto' : 'task', `${task?.articleKey || ''}|${title}|${task?.due || ''}|${createdAt}|${sourceHint}`),
    source: task?.source || sourceHint,
    articleKey: task?.articleKey || '',
    title,
    nextAction: task?.nextAction || '',
    reason: parsedReason.reason,
    owner: resolveTaskOwner(task, sku, platform, sourceHint),
    coOwner,
    due: task?.due || plusDays(type === 'assignment' ? 1 : 3),
    status: mapTaskStatus(task?.status),
    type,
    priority,
    platform,
    createdAt,
    updatedAt,
    entityLabel: task?.entityLabel || sku?.name || title,
    autoCode: task?.autoCode || ''
  };
}

function isNonPersistentTaskSource(source) {
  const normalized = String(source || '').trim().toLowerCase();
  return normalized === 'auto' || normalized === 'seed';
}

const FBS_ONLY_STOCK_SIGNAL_SKUS = new Map([
  ['retinol_full_journey', new Set(['*'])]
]);

function fbsOnlyStockSignalSuppressed(articleKey = '', platform = '') {
  const key = String(articleKey || '').trim().toLowerCase();
  if (!key) return false;
  const blockedPlatforms = FBS_ONLY_STOCK_SIGNAL_SKUS.get(key);
  if (!blockedPlatforms) return false;
  const normalizedPlatform = normalizeTaskPlatform(platform || 'all');
  return blockedPlatforms.has('*')
    || blockedPlatforms.has(normalizedPlatform)
    || blockedPlatforms.has('all');
}

function isSuppressedAutoStockTask(task = {}) {
  const source = String(task?.source || '').trim().toLowerCase();
  const code = String(task?.autoCode || '').trim().toLowerCase();
  const id = String(task?.id || '').trim().toLowerCase();
  const type = String(task?.type || '').trim().toLowerCase();
  const autoLike = source === 'auto' || id.startsWith('auto-') || Boolean(code);
  const stockLike = type === 'supply'
    || code === 'low_stock'
    || code.includes('stock')
    || /^auto-stock[_-]/.test(id);
  return autoLike && stockLike && fbsOnlyStockSignalSuppressed(task?.articleKey, task?.platform);
}

function normalizeStorageTasks(tasks, sourceHint = 'manual') {
  return (tasks || [])
    .map((task) => normalizeTask(task, task?.source || sourceHint))
    .filter((task) => !isSuppressedAutoStockTask(task))
    .filter((task) => !isNonPersistentTaskSource(task?.source))
    .filter((task) => !isAutoTaskLike(task, task?.source) || isPersistentAutoTask(task));
}

function isTaskActive(task) {
  return ACTIVE_TASK_STATUSES.has(task?.status);
}

function isTaskOverdue(task) {
  return Boolean(task?.due) && isTaskActive(task) && task.due < todayIso();
}

const DEPRECATED_AUTO_SIGNAL_CODES = new Set([
  'kz_owner',
  'kz_economics',
  'kz_card',
  'kz_traffic',
  'price_margin',
  'low_stock',
  'negative_margin',
  'assignment'
]);

function isDeprecatedAutoSignalTask(task = {}) {
  const code = String(task?.autoCode || '').trim().toLowerCase();
  if (DEPRECATED_AUTO_SIGNAL_CODES.has(code)) return true;
  const id = String(task?.id || '').trim().toLowerCase();
  if (/^auto-kz[_-](owner|economics|card|traffic)/.test(id)) return true;
  if (/^auto-stock[_-]/.test(id) && (!code || code === 'low_stock')) return true;
  return false;
}

function taskStatusBadge(task) {
  const meta = isTaskOverdue(task) ? { label: 'Просрочено', kind: 'danger' } : (TASK_STATUS_META[task?.status] || TASK_STATUS_META.new);
  return badge(meta.label, meta.kind);
}

function taskPriorityBadge(task) {
  const meta = PRIORITY_META[task?.priority] || PRIORITY_META.medium;
  return badge(meta.label, meta.kind);
}

function taskTypeBadge(task) {
  const kind = task?.type === 'price_margin' ? 'danger' : task?.type === 'assignment' ? 'warn' : 'info';
  return badge(TASK_TYPE_META[task?.type] || TASK_TYPE_META.general, kind);
}

function taskProductStatusBadge(task) {
  const sku = task?.articleKey ? getSku(task.articleKey) : null;
  if (!sku) return '';
  const meta = typeof skuOperationalStatusMeta === 'function'
    ? skuOperationalStatusMeta(sku)
    : (typeof productLifecycleForSku === 'function' ? productLifecycleForSku(sku) : null);
  const label = meta?.label || sku?.status || '';
  if (!label) return '';
  return badge(label, meta?.tone || meta?.kind || 'info');
}

function taskSourceBadge(task) {
  return taskProductStatusBadge(task);
}

function taskPlatformBadge(task) {
  const meta = controlWorkstreamMeta(controlWorkstreamKey(task, getSku(task.articleKey)));
  return badge(meta.chip, meta.kind);
}

function taskSortKey(task) {
  return [
    Number(isTaskOverdue(task)),
    Number(isTaskActive(task)),
    PRIORITY_META[task?.priority]?.rank || 1,
    task?.due || '9999-12-31',
    task?.title || ''
  ];
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const ka = taskSortKey(a);
    const kb = taskSortKey(b);
    return kb[0] - ka[0]
      || kb[1] - ka[1]
      || kb[2] - ka[2]
      || ka[3].localeCompare(kb[3])
      || ka[4].localeCompare(kb[4], 'ru');
  });
}

function getTask(taskId) {
  return getAllTasks().find((task) => task.id === taskId) || null;
}

function taskHeadline(task) {
  return task?.title || task?.entityLabel || 'Задача';
}

function taskEntityLine(task, sku) {
  if (sku) return linkToSku(sku.articleKey, sku.article || sku.articleKey);
  return badge(task?.entityLabel || 'Общая задача', 'info');
}

function taskHistoryBadge(kind) {
  const meta = TASK_LOG_META[kind] || TASK_LOG_META.comment;
  return badge(meta.label, meta.tone);
}

function renderTaskHistoryItem(item) {
  return `
    <div class="comment-item">
      <div class="head">
        <strong>${escapeHtml(item.author || 'Команда')}</strong>
        <div class="badge-stack">${taskHistoryBadge(item.kind)}${badge(item.team || 'Команда')}</div>
      </div>
      <div class="muted small">${fmt.date(item.createdAt)}</div>
      <p>${escapeHtml(item.text || '—')}</p>
    </div>
  `;
}

function taskModalSelectionElement(node) {
  if (!node) return null;
  return node.nodeType === 1 ? node : node.parentElement;
}

function taskModalHasTextSelection(modal) {
  const selection = window.getSelection ? window.getSelection() : null;
  if (!selection || selection.isCollapsed || !String(selection.toString() || '').trim()) return false;
  const anchor = taskModalSelectionElement(selection.anchorNode);
  const focus = taskModalSelectionElement(selection.focusNode);
  return Boolean((anchor && modal.contains(anchor)) || (focus && modal.contains(focus)));
}

function ensureTaskModal() {
  let modal = document.getElementById('taskModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'taskModal';
  modal.className = 'modal';
  modal.innerHTML = '<div class="modal-card task-modal-card" id="taskModalBody"></div>';
  document.body.appendChild(modal);
  let backdropPointerStarted = false;
  const rememberBackdropStart = (event) => {
    backdropPointerStarted = event.target === modal && !taskModalHasTextSelection(modal);
  };
  modal.addEventListener('pointerdown', rememberBackdropStart);
  modal.addEventListener('mousedown', rememberBackdropStart);
  modal.addEventListener('click', (event) => {
    if (event.target !== modal) {
      backdropPointerStarted = false;
      return;
    }
    if (!backdropPointerStarted || taskModalHasTextSelection(modal)) {
      backdropPointerStarted = false;
      return;
    }
    backdropPointerStarted = false;
    closeTaskModal();
  });
  return modal;
}

function storedTaskKeys() {
  return new Set(
    state.storage.tasks
      .filter(isTaskActive)
      .filter((task) => !isAutoTaskLike(task, task?.source))
      .filter((task) => !isDeprecatedAutoSignalTask(task))
      .map((task) => `${task.articleKey}|${task.type}`)
  );
}

function canRegisterAutoTask(keys, articleKey, type) {
  const key = `${articleKey}|${type}`;
  if (!articleKey || keys.has(key)) return false;
  keys.add(key);
  return true;
}

function parseRuDateRangeEnd(value = '') {
  const match = String(value || '').match(/-\s*(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function diffFromTodayInDays(dateKey = '') {
  if (!dateKey) return Number.POSITIVE_INFINITY;
  const today = todayIso();
  const todayDate = new Date(`${today}T00:00:00`);
  const targetDate = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(todayDate.getTime()) || Number.isNaN(targetDate.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);
}

function productLeaderboardFreshForAuto(payload = {}) {
  const weekEnd = parseRuDateRangeEnd(payload?.weekLabel || payload?.sourceSheetName || '');
  if (weekEnd) return diffFromTodayInDays(weekEnd) >= -21;
  const generated = String(payload?.generatedAt || '').slice(0, 10);
  return generated ? diffFromTodayInDays(generated) >= -21 : false;
}

function launchMonthToDateKey(label = '') {
  const match = String(label || '').trim().toLowerCase().match(/^([а-яё]+)\s+(\d{4})$/i);
  if (!match) return '';
  const monthMap = {
    январь: '01',
    февраль: '02',
    март: '03',
    апрель: '04',
    май: '05',
    июнь: '06',
    июль: '07',
    август: '08',
    сентябрь: '09',
    октябрь: '10',
    ноябрь: '11',
    декабрь: '12'
  };
  const month = monthMap[match[1]];
  if (!month) return '';
  return `${match[2]}-${month}-01`;
}

function leaderboardSeverityRank(severity) {
  if (severity === 'critical') return 4;
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

function leaderboardPriorityForSeverity(severity) {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function leaderboardDueForSeverity(severity) {
  if (severity === 'critical') return plusDays(1);
  if (severity === 'high') return plusDays(2);
  if (severity === 'medium') return plusDays(3);
  return plusDays(5);
}

function leaderboardTaskSeverity(alerts) {
  let top = 'info';
  let rank = 1;
  for (const alert of alerts || []) {
    const nextRank = leaderboardSeverityRank(alert?.severity);
    if (nextRank > rank) {
      rank = nextRank;
      top = alert?.severity || 'info';
    }
  }
  return top;
}

function leaderboardTopAlertsText(alerts, limit = 2) {
  return (alerts || [])
    .map((alert) => String(alert?.label || alert?.title || '').trim())
    .filter(Boolean)
    .slice(0, limit)
    .join(' · ');
}

function leaderboardAlertsForFamilies(item, families) {
  const familySet = new Set(Array.isArray(families) ? families : [families]);
  return (item?.diagnostics?.alerts || [])
    .filter((alert) => familySet.has(alert?.family))
    .sort((left, right) =>
      leaderboardSeverityRank(right?.severity) - leaderboardSeverityRank(left?.severity)
      || String(left?.title || '').localeCompare(String(right?.title || ''), 'ru')
    );
}

function leaderboardHasEscalation(alerts) {
  return (alerts || []).some((alert) => leaderboardSeverityRank(alert?.severity) >= 3);
}

function buildLeaderboardAutoTask({
  articleKey,
  owner,
  platform,
  item,
  alerts,
  autoCode,
  title,
  nextAction,
  type
}) {
  const severity = leaderboardTaskSeverity(alerts);
  const summary = leaderboardTopAlertsText(alerts) || item?.diagnostics?.summary || 'Есть отклонения по KZ-воронке.';
  const weekLabel = String(item?.weekLabel || '').trim();
  const reason = weekLabel ? `${weekLabel}: ${summary}` : summary;

  return normalizeTask({
    id: `auto-${autoCode}-${articleKey}`,
    source: 'auto',
    autoCode,
    articleKey,
    title,
    nextAction,
    reason,
    owner,
    due: leaderboardDueForSeverity(severity),
    status: 'new',
    type,
    priority: leaderboardPriorityForSeverity(severity),
    platform,
    entityLabel: item?.name || title
  }, 'auto');
}

const AUTO_SIGNAL_RULES = {
  stockDays: 10,
  stockWatchDays: 30,
  minStockWatchRiskDay: 150000,
  priceDropPct: 0.15,
  priceRisePct: 0.10,
  priceImpactDropPct: 0.20,
  revenueDropPct: 0.20,
  aovDropPct: 0.20,
  returnsGrowthPct: 0.20,
  conversionDropPct: 0.10,
  profitabilityDropPct: 0.25,
  minRecentOrders: 10,
  minPriceRecentOrders: 80,
  minPriceRiseBaseOrders: 40,
  minPriceRiseSmallBaseOrders: 8,
  minBaseOrders: 50,
  minBaseRevenueDay: 30000,
  minRevenueLossDay: 30000,
  minReturnsCurrent: 20,
  minReturnsBaseline: 10,
  minReturnsDelta: 8,
  minKzClicks: 700,
  minKzRevenue: 50000,
  minKzSpend: 30000,
  minAdsSpend: 50000,
  minAdsClicks: 300,
  minAdsOrders: 20,
  maxAdsDrr: 0.45,
  maxAdsCpo: 450,
  minAdsCtr: 0.008,
  minAdsCr: 0.06,
  adsMetricDropPct: 0.25,
  adsTwoDayDropPct: 0.25,
  adsTwoDayPointDropPct: 0.20,
  minAdsDailyViews: 1000,
  minAdsDailyClicks: 30,
  minAdsDailyOrders: 5,
  minAdsTwoDayBaseDays: 7,
  totalLimit: 32,
  launchLimit: 5,
  familyLimits: {
    stock: 8,
    price: 6,
    sales: 5,
    ads: 8,
    kz: 4,
    aov: 2,
    returns: 3
  }
};

function autoSignalText(value = '') {
  return String(value || '').trim().toLowerCase().replaceAll('ё', 'е');
}

function autoSignalSkuAllowed(sku = {}) {
  if (!sku || typeof sku !== 'object') return false;
  const lifecycle = typeof productLifecycleForSku === 'function'
    ? productLifecycleForSku(sku)
    : { key: '', label: sku.status || sku.registryStatus || '' };
  const text = autoSignalText([
    lifecycle?.key,
    lifecycle?.label,
    sku?.status,
    sku?.registryStatus,
    sku?.owner?.registryStatus
  ].filter(Boolean).join(' '));
  if (/вывод|на вывод|вывед|сняти|снимаем|спа|spa|нет в спецификации|под вопрос|архив|archive|paused|pause|freeze|hold/.test(text)) return false;
  const policy = autoSignalText(lifecycle?.taskPolicy || '');
  if (['exit', 'archive', 'decision'].includes(policy)) return false;
  const key = autoSignalText(lifecycle?.key || '');
  if (key) return ['active', 'new', 'relaunch', 'watch'].includes(key) || ['normal', 'launch'].includes(policy);
  return /актуаль|новин|наблюд|active|new|launch|watch|monitor/.test(text);
}

function autoSignalPlatformLabel(platform = '') {
  const key = normalizeTaskPlatform(platform || 'all');
  const meta = controlWorkstreamMeta(key === 'all' ? 'cross' : key);
  return meta?.chip || platform || 'MP';
}

function autoSignalTaskOwner(sku, platform = '', fallback = '') {
  return taskPlatformOwnerName(sku, platform)
    || canonicalOwnerName(fallback || '')
    || ownerName(sku)
    || '';
}

function launchTaskExplicitPlatforms(item = {}) {
  const text = [
    item?.marketplaces,
    item?.marketplace,
    item?.marketplaceKey,
    item?.platform,
    item?.platforms,
    item?.network,
    item?.retailer,
    item?.channel,
    item?.market,
    item?.workstream
  ].map((value) => marketplaceContextValue(value)).filter(Boolean).join(' ');
  const detected = detectMarketplaceKeyList(text)
    .filter((key) => TASK_PLATFORM_OWNER_KEYS.has(key));
  if (detected.length) return detected;
  const normalized = normalizeTaskPlatform(item?.platform || item?.marketplace || item?.marketplaces || '', text);
  if (TASK_PLATFORM_OWNER_KEYS.has(normalized)) return [normalized];
  if (/all|marketplaces?|маркетплейс|маркетплеи|площадк|все мп|всех мп|\bмп\b/i.test(text)) {
    return TASK_MARKETPLACE_PLATFORM_KEYS.slice();
  }
  return [];
}

function launchTaskSkuPlatforms(sku = null) {
  if (!sku || typeof sku !== 'object') return [];
  const platforms = [];
  const push = (key) => {
    if (key && TASK_PLATFORM_OWNER_KEYS.has(key) && !platforms.includes(key)) platforms.push(key);
  };
  if (sku?.flags?.hasWB || sku?.flags?.toWorkWB) push('wb');
  if (sku?.flags?.hasOzon || sku?.flags?.toWorkOzon) push('ozon');
  return platforms;
}

function launchTaskPlatforms(item = {}, sku = null) {
  const explicit = launchTaskExplicitPlatforms(item);
  if (explicit.length) return explicit;
  const skuPlatforms = launchTaskSkuPlatforms(sku);
  if (skuPlatforms.length) return skuPlatforms;
  return TASK_MARKETPLACE_PLATFORM_KEYS.slice();
}

function autoSignalMetric(item, key) {
  const metric = item?.diagnostics?.metrics?.[key] || {};
  return {
    value: Number(metric.value),
    baseline: Number(metric.baseline),
    deltaPct: Number(metric.deltaPct)
  };
}

function autoSignalFinite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function autoSignalArticleKey(row = {}) {
  return String(row?.articleKey || row?.article || row?.sku || '').trim();
}

function autoSignalReturnUnits(row = {}) {
  return Math.max(0, autoSignalFinite(
    row?.returns?.count
      ?? row?.returns?.units
      ?? row?.returnsCount
      ?? row?.returnCount
      ?? row?.returnsUnits
      ?? row?.refundUnits
      ?? 0,
    0
  ));
}

function autoSignalReturnValue(row = {}) {
  return Math.max(0, autoSignalFinite(
    row?.returns?.value
      ?? row?.returnsValue
      ?? row?.returnValue
      ?? row?.refundValue
      ?? 0,
    0
  ));
}

function autoSignalReturnReason(row = {}) {
  return String(row?.returns?.topReason || row?.topReturnReason || row?.returnReason || '').trim();
}

function autoSignalReturnPlatform(sku = {}) {
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) return 'wb+ozon';
  if (sku?.flags?.toWorkWB) return 'wb';
  if (sku?.flags?.toWorkOzon) return 'ozon';
  if (sku?.flags?.hasWB && sku?.flags?.hasOzon) return 'wb+ozon';
  if (sku?.flags?.hasWB) return 'wb';
  if (sku?.flags?.hasOzon) return 'ozon';
  return detectTaskPlatform({}, sku);
}

function autoSignalReturnsBaselineMap() {
  const rows = Array.isArray(state.autoSignalBaselines?.skus) ? state.autoSignalBaselines.skus : [];
  return new Map(rows
    .map((row) => [autoSignalArticleKey(row).toLowerCase(), row])
    .filter(([articleKey]) => articleKey));
}

function autoSignalPct(value, digits = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return `${(parsed * 100).toFixed(digits)}%`;
}

function autoSignalMoney(value) {
  if (typeof fmt !== 'undefined' && typeof fmt.money === 'function') return fmt.money(value || 0);
  return `${Math.round(Number(value) || 0)} ₽`;
}

function autoSignalNum(value, digits = 1) {
  if (typeof fmt !== 'undefined' && typeof fmt.num === 'function') return fmt.num(value, digits);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '—';
}

function autoSignalTaskDue(priority) {
  if (priority === 'critical') return plusDays(1);
  if (priority === 'high') return plusDays(2);
  return plusDays(3);
}

function canRegisterAutoSignalTask(keys, articleKey, taskType, signalKey) {
  const article = String(articleKey || '').trim();
  if (!article) return false;
  if (keys.has(`${article}|${taskType}`)) return false;
  const scopedKey = `${article}|${signalKey || taskType}`;
  if (keys.has(scopedKey)) return false;
  keys.add(scopedKey);
  return true;
}

function autoSignalDailyRows(row = {}) {
  return (Array.isArray(row.daily) ? row.daily : [])
    .filter((point) => point?.date)
    .slice()
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
}

function autoSignalSum(rows, key) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + autoSignalFinite(row?.[key]), 0);
}

function autoSignalPriceOverlayRows() {
  const result = [];
  Object.entries(state.smartPriceOverlay?.platforms || {}).forEach(([platform, payload]) => {
    if (!['wb', 'ozon'].includes(normalizeTaskPlatform(platform))) return;
    const rows = Array.isArray(payload?.rows) ? payload.rows : Object.values(payload?.rows || {});
    rows.forEach((row) => result.push({ platform: normalizeTaskPlatform(platform), row }));
  });
  return result;
}

function autoSignalAdsArticleKey(row = {}) {
  return String(row?.articleKey || row?.offer_id || row?.offerId || row?.article || row?.sku || '').trim();
}

function autoSignalAdsIsAggregateArticle(articleKey = '') {
  const key = String(articleKey || '').trim().toLowerCase();
  if (!key) return true;
  return key === 'all'
    || key === 'total'
    || key.includes('finance')
    || key.includes('summary')
    || key.includes('ads-total')
    || key.endsWith('-total')
    || key.endsWith('_total');
}

function autoSignalAdsDateKey(row = {}) {
  const raw = String(row?.dateKey || row?.date || row?.day || row?.label || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
}

function autoSignalAdsTotals(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    acc.views += autoSignalFinite(row.views, 0);
    acc.clicks += autoSignalFinite(row.clicks, 0);
    acc.spend += autoSignalFinite(row.spend, 0);
    acc.orders += autoSignalFinite(row.orders, 0);
    acc.revenue += autoSignalFinite(row.revenue, 0);
    return acc;
  }, { views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 });
}

function autoSignalAdsRate(top, bottom, fallback = 0) {
  const numerator = autoSignalFinite(top, 0);
  const denominator = autoSignalFinite(bottom, 0);
  if (denominator <= 0) return fallback;
  return numerator / denominator;
}

function autoSignalAdsMetrics(totals = {}) {
  const spend = autoSignalFinite(totals.spend, 0);
  const revenue = autoSignalFinite(totals.revenue, 0);
  const orders = autoSignalFinite(totals.orders, 0);
  return {
    ctr: autoSignalAdsRate(totals.clicks, totals.views, 0),
    cr: autoSignalAdsRate(totals.orders, totals.clicks, 0),
    cpc: autoSignalAdsRate(totals.spend, totals.clicks, 0),
    cpo: orders > 0 ? spend / orders : (spend > 0 ? Number.POSITIVE_INFINITY : 0),
    drr: revenue > 0 ? spend / revenue : (spend > 0 ? Number.POSITIVE_INFINITY : 0)
  };
}

function autoSignalAdsMetricDrop(baseValue, currentValue) {
  const base = autoSignalFinite(baseValue, 0);
  const current = autoSignalFinite(currentValue, 0);
  if (base <= 0) return 0;
  return Math.max(0, (base - current) / base);
}

function autoSignalAdsMetricGrowth(baseValue, currentValue) {
  const base = autoSignalFinite(baseValue, 0);
  const current = autoSignalFinite(currentValue, 0);
  if (base <= 0) return 0;
  return Math.max(0, (current - base) / base);
}

function autoSignalAdsRatioLabel(value, emptyLabel = 'нет данных') {
  return Number.isFinite(value) ? autoSignalPct(value, 1) : emptyLabel;
}

function autoSignalAdsMoneyRatioLabel(value, emptyLabel = 'нет заказов') {
  return Number.isFinite(value) ? autoSignalMoney(value) : emptyLabel;
}

function autoSignalAdsMetricSum(points = [], key = '') {
  return (Array.isArray(points) ? points : []).reduce((sum, point) => sum + autoSignalFinite(point?.[key], 0), 0);
}

function autoSignalAdsTwoDayWindow(bucket = {}) {
  const points = Array.isArray(bucket.points) ? bucket.points : [];
  if (points.length < AUTO_SIGNAL_RULES.minAdsTwoDayBaseDays + 2) return null;
  const latest = points.slice(-2);
  const base = points.slice(
    Math.max(0, points.length - AUTO_SIGNAL_RULES.minAdsTwoDayBaseDays - 2),
    points.length - 2
  );
  if (latest.length < 2 || base.length < AUTO_SIGNAL_RULES.minAdsTwoDayBaseDays) return null;
  const metric = (key) => {
    const baseAvg = autoSignalAdsMetricSum(base, key) / Math.max(1, base.length);
    const latestAvg = autoSignalAdsMetricSum(latest, key) / Math.max(1, latest.length);
    const drop = baseAvg > 0 ? Math.max(0, (baseAvg - latestAvg) / baseAvg) : 0;
    const bothDaysDown = baseAvg > 0 && latest.every((point) =>
      autoSignalFinite(point?.[key], 0) <= baseAvg * (1 - AUTO_SIGNAL_RULES.adsTwoDayPointDropPct)
    );
    return {
      baseAvg,
      latestAvg,
      drop,
      bothDaysDown,
      latestValues: latest.map((point) => autoSignalFinite(point?.[key], 0))
    };
  };
  const baseTotals = autoSignalAdsTotals(base);
  const latestTotals = autoSignalAdsTotals(latest);
  const baseMetrics = autoSignalAdsMetrics(baseTotals);
  const latestMetrics = autoSignalAdsMetrics(latestTotals);
  return {
    latest,
    base,
    baseTotals,
    latestTotals,
    baseMetrics,
    latestMetrics,
    dateLabel: latest.map((point) => String(point.dateKey || '').slice(5) || point.dateKey || '').filter(Boolean).join(', '),
    views: metric('views'),
    clicks: metric('clicks'),
    orders: metric('orders'),
    spend: metric('spend'),
    ctrDrop: autoSignalAdsMetricDrop(baseMetrics.ctr, latestMetrics.ctr),
    crDrop: autoSignalAdsMetricDrop(baseMetrics.cr, latestMetrics.cr),
    drrGrowth: Number.isFinite(baseMetrics.drr) && Number.isFinite(latestMetrics.drr)
      ? autoSignalAdsMetricGrowth(baseMetrics.drr, latestMetrics.drr)
      : 0
  };
}

function autoSignalAdsTwoDayMetricLabel(stat = {}, formatter = autoSignalNum, digits = 0, suffix = '/день') {
  const values = Array.isArray(stat.latestValues)
    ? stat.latestValues.map((value) => formatter(value, digits)).join(' / ')
    : formatter(stat.latestAvg, digits);
  return `база ${formatter(stat.baseAvg, digits)}${suffix}, последние 2 дня ${values}`;
}

function autoSignalAdsBuckets() {
  const rows = Array.isArray(state.adsSummary?.itemSeries) ? state.adsSummary.itemSeries : [];
  const buckets = new Map();
  const skuCache = new Map();
  rows.forEach((row, index) => {
    const platform = normalizeTaskPlatform(row?.platformKey || row?.platform || row?.market || row?.channel || '');
    if (!['wb', 'ozon', 'ya'].includes(platform)) return;
    const articleKey = autoSignalAdsArticleKey(row);
    if (autoSignalAdsIsAggregateArticle(articleKey)) return;
    const articleLookup = articleKey.toLowerCase();
    if (!skuCache.has(articleLookup)) skuCache.set(articleLookup, getSku(articleKey));
    const sku = skuCache.get(articleLookup);
    if (!autoSignalSkuAllowed(sku)) return;

    const bucketKey = `${articleLookup}|${platform}`;
    const bucket = buckets.get(bucketKey) || {
      articleKey,
      platform,
      sku,
      name: row?.name || sku?.name || articleKey,
      owner: autoSignalTaskOwner(sku, platform, row?.owner),
      daily: new Map(),
      campaigns: new Set()
    };
    const dateKey = autoSignalAdsDateKey(row) || `row-${index}`;
    const point = bucket.daily.get(dateKey) || {
      dateKey,
      views: 0,
      clicks: 0,
      spend: 0,
      orders: 0,
      revenue: 0
    };
    point.views += autoSignalFinite(row?.views ?? row?.adsImpressions ?? row?.shows, 0);
    point.clicks += autoSignalFinite(row?.clicks ?? row?.adsClicks, 0);
    point.spend += autoSignalFinite(row?.spend ?? row?.adsSpend, 0);
    point.orders += autoSignalFinite(row?.orders ?? row?.ordersUnits, 0);
    point.revenue += autoSignalFinite(row?.revenue ?? row?.deliveredRevenue ?? row?.ordersRevenue, 0);
    bucket.daily.set(dateKey, point);
    const campaign = String(row?.campaignName || row?.campaignId || row?.channel || '').trim();
    if (campaign) bucket.campaigns.add(campaign);
    buckets.set(bucketKey, bucket);
  });

  return [...buckets.values()].map((bucket) => {
    const points = [...bucket.daily.values()]
      .filter((point) => point.spend || point.clicks || point.views || point.orders || point.revenue)
      .sort((left, right) => String(left.dateKey || '').localeCompare(String(right.dateKey || '')));
    const baseEnd = Math.max(0, points.length - 7);
    const baseStart = Math.max(0, points.length - 28);
    const recent = points.slice(Math.max(0, points.length - 7));
    const base = points.slice(baseStart, baseEnd);
    const totals = autoSignalAdsTotals(points);
    const recentTotals = autoSignalAdsTotals(recent);
    const baseTotals = autoSignalAdsTotals(base);
    return {
      ...bucket,
      points,
      days: points.length,
      campaigns: [...bucket.campaigns].slice(0, 4),
      totals,
      recentTotals,
      baseTotals,
      metrics: autoSignalAdsMetrics(totals),
      recentMetrics: autoSignalAdsMetrics(recentTotals),
      baseMetrics: autoSignalAdsMetrics(baseTotals)
    };
  });
}

function autoSignalIssueKey(platform, articleKey) {
  return `${normalizeTaskPlatform(platform || 'all')}|${String(articleKey || '').trim().toLowerCase()}`;
}

function autoSignalStockSignalLevel(row = {}) {
  const days = autoSignalFinite(row.turnoverDays, NaN);
  const riskDay = autoSignalFinite(row.revenueAtRiskDay, 0);
  const isOos = String(row.status || '').toLowerCase() === 'oos';
  const isCriticalRisk = isOos || (Number.isFinite(days) && days <= AUTO_SIGNAL_RULES.stockDays);
  const isWatch = !isCriticalRisk
    && Number.isFinite(days)
    && days <= AUTO_SIGNAL_RULES.stockWatchDays
    && riskDay >= AUTO_SIGNAL_RULES.minStockWatchRiskDay;
  if (isOos) return 'oos';
  if (isCriticalRisk) return 'risk';
  if (isWatch) return 'watch';
  return '';
}

function autoSignalActiveStockKeys() {
  const rows = Array.isArray(state.oosControl?.rows) ? state.oosControl.rows : [];
  return new Set(rows
    .filter((row) => row?.articleKey || row?.article)
    .filter((row) => !fbsOnlyStockSignalSuppressed(row.articleKey || row.article, row.platform))
    .filter((row) => {
      const level = autoSignalStockSignalLevel(row);
      return level === 'oos' || level === 'risk';
    })
    .map((row) => autoSignalIssueKey(row.platform, row.articleKey || row.article)));
}

function buildStockAutoSignalCandidates() {
  const rows = Array.isArray(state.oosControl?.rows) ? state.oosControl.rows : [];
  return rows.map((row) => {
    const sku = getSku(row.articleKey || row.article);
    if (!autoSignalSkuAllowed(sku)) return null;
    const platform = normalizeTaskPlatform(row.platform || 'all');
    if (fbsOnlyStockSignalSuppressed(row.articleKey || row.article, platform)) return null;
    const platformLabel = row.platformLabel || autoSignalPlatformLabel(platform);
    const days = autoSignalFinite(row.turnoverDays, NaN);
    const signalLevel = autoSignalStockSignalLevel(row);
    if (!signalLevel) return null;
    const isOos = signalLevel === 'oos';
    const isNearOos = signalLevel === 'oos' || signalLevel === 'risk';
    const isWatch = signalLevel === 'watch';
    const riskDay = autoSignalFinite(row.revenueAtRiskDay, 0);
    const priority = isOos ? 'critical' : isNearOos ? 'high' : 'medium';
    const clusters = Math.max(1, Math.round(autoSignalFinite(row.clusterCount || 1, 1)));
    const places = Array.isArray(row.placesAtRisk)
      ? row.placesAtRisk.map((item) => item.place).filter(Boolean).slice(0, 4).join(', ')
      : row.place;
    const clusterLabel = `${clusters} ${clusters === 1 ? 'кластер' : 'кластеров'}`;
    return {
      family: 'stock',
      dedupeKey: `${row.articleKey || row.article}|stock|${platform}`,
      articleKey: row.articleKey || row.article,
      taskType: 'supply',
      platform,
      priority,
      score: isNearOos
        ? 1000 + riskDay / 100000
        : 660 + riskDay / 50000 + Math.max(0, AUTO_SIGNAL_RULES.stockWatchDays - days) * 2,
      task: {
        id: stableId('auto-stock-v2', row.issueKey || `${platform}|${row.articleKey}`),
        source: 'auto',
        autoCode: 'stock_quality_v2',
        articleKey: row.articleKey || row.article,
        title: isOos
          ? `${platformLabel}: OOS по SKU`
          : isNearOos
            ? `${platformLabel}: ${clusterLabel} <${AUTO_SIGNAL_RULES.stockDays} дней`
            : `${platformLabel}: запас ${autoSignalNum(days, 1)} д., не довести до OOS`,
        nextAction: isWatch
          ? (row.recommendation || `Проверить дату поставки/перемещения и закрыть риск до OOS: покрытие меньше ${AUTO_SIGNAL_RULES.stockWatchDays} дней при высокой выручке под риском.`)
          : (row.recommendation || `Проверить поставку и закрыть кластеры с покрытием меньше ${AUTO_SIGNAL_RULES.stockDays} дней.`),
        reason: [
          `${platformLabel}: ${isWatch ? 'watch до OOS' : (row.statusLabel || 'риск OOS')}`,
          Number.isFinite(days) ? `покрытие ${autoSignalNum(days, 1)} д.` : '',
          clusterLabel,
          places ? `кластеры: ${places}` : '',
          `риск выручки ${autoSignalMoney(riskDay)}/день`
        ].filter(Boolean).join(' · '),
        owner: autoSignalTaskOwner(sku, platform, row.owner),
        due: autoSignalTaskDue(priority),
        status: 'new',
        type: 'supply',
        priority,
        platform,
        entityLabel: row.name || sku?.name || row.articleKey || row.article
      }
    };
  }).filter(Boolean);
}

function buildPriceAndSalesAutoSignalCandidates() {
  const candidates = [];
  const activeStockKeys = autoSignalActiveStockKeys();
  autoSignalPriceOverlayRows().forEach(({ platform, row }) => {
    const articleKey = String(row?.articleKey || row?.article || '').trim();
    const sku = getSku(articleKey);
    if (!articleKey || !autoSignalSkuAllowed(sku)) return;
    const daily = autoSignalDailyRows(row);
    if (daily.length < 6) return;
    const platformLabel = autoSignalPlatformLabel(platform);
    const latest = daily[daily.length - 1] || {};
    const prevPriceRows = daily.slice(Math.max(0, daily.length - 8), daily.length - 1).filter((point) => autoSignalFinite(point.price) > 0);
    const previousPrice = autoSignalSum(prevPriceRows, 'price') / Math.max(1, prevPriceRows.length);
    const currentPrice = autoSignalFinite(latest.price || row.currentPrice || row.currentFillPrice);
    const recentOrders7 = autoSignalSum(daily.slice(-7), 'ordersUnits');
    const priceDrop = previousPrice > 0 && currentPrice > 0 ? (previousPrice - currentPrice) / previousPrice : 0;
    const priceRise = previousPrice > 0 && currentPrice > 0 ? (currentPrice - previousPrice) / previousPrice : 0;
    const hasPriceDropSignal = priceDrop >= AUTO_SIGNAL_RULES.priceDropPct && recentOrders7 >= AUTO_SIGNAL_RULES.minPriceRecentOrders;
    if (hasPriceDropSignal) {
      const priority = priceDrop >= 0.25 ? 'critical' : 'high';
      const priceDropLabel = autoSignalPct(priceDrop);
      candidates.push({
        family: 'price',
        dedupeKey: `${articleKey}|price|${platform}`,
        articleKey,
        taskType: 'price_margin',
        platform,
        priority,
        score: 760 + priceDrop * 100 + recentOrders7 / 8,
        task: {
          id: stableId('auto-price-drop-v2', `${platform}|${articleKey}`),
          source: 'auto',
          autoCode: 'price_drop_v2',
          articleKey,
          title: `${platformLabel}: цена -${priceDropLabel} к среднему уровню`,
          nextAction: 'Проверить цену как аварийный сигнал: это промо, ошибка цены или сбой правил. В задаче зафиксировать решение: оставить промо до даты, вернуть цену или согласовать исключение.',
          reason: `${platformLabel}: текущая цена ${autoSignalMoney(currentPrice)}, средняя за 7 предыдущих дней ${autoSignalMoney(previousPrice)}, отклонение ${priceDropLabel}. Проверка прошла фильтр объёма: ${autoSignalNum(recentOrders7, 0)} заказов за 7 дней.`,
          owner: autoSignalTaskOwner(sku, platform, row.owner),
          due: autoSignalTaskDue(priority),
          status: 'new',
          type: 'price_margin',
          priority,
          platform,
          entityLabel: sku?.name || articleKey
        }
      });
    }

    const recent = daily.slice(-3);
    const base = daily.slice(Math.max(0, daily.length - 10), daily.length - 3);
    const recentDays = Math.max(1, recent.length);
    const baseDays = Math.max(1, base.length);
    const recentRevenueDay = autoSignalSum(recent, 'revenue') / recentDays;
    const baseRevenueDay = autoSignalSum(base, 'revenue') / baseDays;
    const recentOrders = autoSignalSum(recent, 'ordersUnits');
    const baseOrders = autoSignalSum(base, 'ordersUnits');
    const revenueDrop = baseRevenueDay > 0 ? (baseRevenueDay - recentRevenueDay) / baseRevenueDay : 0;
    const revenueLossDay = baseRevenueDay - recentRevenueDay;
    const orderDrop = baseOrders > 0 ? (baseOrders - recentOrders) / baseOrders : 0;
    const priceImpact = Math.max(0, revenueDrop, orderDrop);
    const priceRiseVolumeOk = baseOrders >= AUTO_SIGNAL_RULES.minPriceRiseBaseOrders
      || (priceRise >= 0.30 && baseOrders >= AUTO_SIGNAL_RULES.minPriceRiseSmallBaseOrders);
    const hasPriceRiseSignal = priceRise >= AUTO_SIGNAL_RULES.priceRisePct
      && base.length >= 5
      && priceRiseVolumeOk
      && (
        priceImpact >= AUTO_SIGNAL_RULES.priceImpactDropPct
        || recentOrders >= AUTO_SIGNAL_RULES.minRecentOrders
      );
    if (hasPriceRiseSignal) {
      const priority = priceRise >= 0.30 || priceImpact >= 0.35 ? 'critical' : 'high';
      const priceRiseLabel = autoSignalPct(priceRise);
      const impactLabel = priceImpact > 0 ? autoSignalPct(priceImpact) : 'без падения';
      candidates.push({
        family: 'price',
        dedupeKey: `${articleKey}|price-rise|${platform}`,
        articleKey,
        taskType: 'price_margin',
        platform,
        priority,
        score: 780 + priceRise * 130 + priceImpact * 100 + baseOrders / 10 + Math.max(0, revenueLossDay) / 5000,
        task: {
          id: stableId('auto-price-rise-v2', `${platform}|${articleKey}`),
          source: 'auto',
          autoCode: 'price_rise_v2',
          articleKey,
          title: `${platformLabel}: цена +${priceRiseLabel}, проверить влияние на спрос`,
          nextAction: 'Проверить повышение цены: это плановое повышение, завершение промо или сбой правил. Сверить заказы/выручку после изменения и зафиксировать решение: удержать цену, откатить или компенсировать трафиком/скидкой.',
          reason: `${platformLabel}: текущая цена ${autoSignalMoney(currentPrice)}, средняя за 7 предыдущих дней ${autoSignalMoney(previousPrice)}, рост ${priceRiseLabel}; эффект по заказам/выручке ${impactLabel}. База: ${autoSignalNum(baseOrders, 0)} заказов, последние 3 дня: ${autoSignalNum(recentOrders, 0)} заказов.`,
          owner: autoSignalTaskOwner(sku, platform, row.owner),
          due: autoSignalTaskDue(priority),
          status: 'new',
          type: 'price_margin',
          priority,
          platform,
          entityLabel: sku?.name || articleKey
        }
      });
    }
    const stockAlreadyExplainsSales = activeStockKeys.has(autoSignalIssueKey(platform, articleKey));
    if (
      !stockAlreadyExplainsSales
      && !hasPriceDropSignal
      && !hasPriceRiseSignal
      && base.length >= 5
      && baseRevenueDay >= AUTO_SIGNAL_RULES.minBaseRevenueDay
      && baseOrders >= AUTO_SIGNAL_RULES.minBaseOrders
      && recentOrders >= AUTO_SIGNAL_RULES.minRecentOrders
      && revenueDrop >= AUTO_SIGNAL_RULES.revenueDropPct
      && revenueLossDay >= AUTO_SIGNAL_RULES.minRevenueLossDay
    ) {
      const priority = revenueDrop >= 0.35 ? 'critical' : 'high';
      const revenueDropLabel = autoSignalPct(revenueDrop);
      candidates.push({
        family: 'sales',
        dedupeKey: `${articleKey}|sales|${platform}`,
        articleKey,
        taskType: 'traffic',
        platform,
        priority,
        score: 700 + revenueDrop * 100 + revenueLossDay / 5000,
        task: {
          id: stableId('auto-sales-drop-v2', `${platform}|${articleKey}`),
          source: 'auto',
          autoCode: 'sales_drop_v2',
          articleKey,
          title: `${platformLabel}: оборот -${revenueDropLabel}, потеря ${autoSignalMoney(revenueLossDay)}/день`,
          nextAction: 'Разобрать корневую причину за 15 минут: остаток, цена, реклама, карточка. В задаче оставить один выбранный рычаг и срок повторной проверки.',
          reason: `${platformLabel}: 3-дневный оборот ${autoSignalMoney(recentRevenueDay)}/день против базы ${autoSignalMoney(baseRevenueDay)}/день; падение ${revenueDropLabel}, минус ${autoSignalMoney(revenueLossDay)}/день. OOS по этой площадке не найден, поэтому это отдельный сигнал, не дубль остатков.`,
          owner: autoSignalTaskOwner(sku, platform, row.owner),
          due: autoSignalTaskDue(priority),
          status: 'new',
          type: 'traffic',
          priority,
          platform,
          entityLabel: sku?.name || articleKey
        }
      });
    }

    const recentAov = autoSignalSum(recent, 'revenue') / Math.max(1, recentOrders);
    const baseAov = autoSignalSum(base, 'revenue') / Math.max(1, baseOrders);
    const aovDrop = baseAov > 0 ? (baseAov - recentAov) / baseAov : 0;
    if (
      !hasPriceDropSignal
      && !hasPriceRiseSignal
      && base.length >= 5
      && baseOrders >= AUTO_SIGNAL_RULES.minBaseOrders
      && recentOrders >= AUTO_SIGNAL_RULES.minRecentOrders
      && aovDrop >= AUTO_SIGNAL_RULES.aovDropPct
    ) {
      const priority = aovDrop >= 0.30 ? 'high' : 'medium';
      candidates.push({
        family: 'aov',
        dedupeKey: `${articleKey}|aov|${platform}`,
        articleKey,
        taskType: 'price_margin',
        platform,
        priority,
        score: 620 + aovDrop * 100 + baseOrders / 20,
        task: {
          id: stableId('auto-aov-drop-v2', `${platform}|${articleKey}`),
          source: 'auto',
          autoCode: 'aov_drop_v2',
          articleKey,
          title: `${platformLabel}: средний чек заметно упал`,
          nextAction: 'Проверить цену, скидку, наборы и структуру заказов. Если это промо, зафиксировать ожидаемый эффект; если нет — вернуть экономику.',
          reason: `${platformLabel}: средний чек ${autoSignalMoney(recentAov)} против ${autoSignalMoney(baseAov)}, падение ${autoSignalPct(aovDrop)}.`,
          owner: autoSignalTaskOwner(sku, platform, row.owner),
          due: autoSignalTaskDue(priority),
          status: 'new',
          type: 'price_margin',
          priority,
          platform,
          entityLabel: sku?.name || articleKey
        }
      });
    }
  });
  return candidates;
}

function buildReturnsAutoSignalCandidates() {
  const baselineMap = autoSignalReturnsBaselineMap();
  if (!baselineMap.size) return [];
  return (state.skus || []).map((sku) => {
    const articleKey = autoSignalArticleKey(sku);
    if (!articleKey || !autoSignalSkuAllowed(sku)) return null;
    const baseline = baselineMap.get(articleKey.toLowerCase());
    if (!baseline) return null;
    const currentReturns = autoSignalReturnUnits(sku);
    const baselineReturns = autoSignalReturnUnits(baseline);
    const delta = currentReturns - baselineReturns;
    const growth = baselineReturns > 0 ? delta / baselineReturns : 0;
    if (
      currentReturns < AUTO_SIGNAL_RULES.minReturnsCurrent
      || baselineReturns < AUTO_SIGNAL_RULES.minReturnsBaseline
      || delta < AUTO_SIGNAL_RULES.minReturnsDelta
      || growth < AUTO_SIGNAL_RULES.returnsGrowthPct
    ) {
      return null;
    }

    const currentValue = autoSignalReturnValue(sku);
    const baselineValue = autoSignalReturnValue(baseline);
    const valueDelta = currentValue - baselineValue;
    const priority = growth >= 0.5 || delta >= 30 ? 'critical' : 'high';
    const platform = autoSignalReturnPlatform(sku);
    const platformLabel = platform === 'wb+ozon' ? 'WB+Ozon' : autoSignalPlatformLabel(platform);
    const topReason = autoSignalReturnReason(sku) || autoSignalReturnReason(baseline);
    const growthLabel = autoSignalPct(growth);
    return {
      family: 'returns',
      dedupeKey: `${articleKey}|returns|${platform}`,
      articleKey,
      taskType: 'returns',
      platform,
      priority,
      score: 735 + growth * 120 + delta * 3 + Math.max(0, valueDelta) / 10000,
      task: {
        id: stableId('auto-returns-spike-v2', articleKey),
        source: 'auto',
        autoCode: 'returns_spike_v2',
        articleKey,
        title: `${platformLabel}: возвраты +${growthLabel}, ${autoSignalNum(currentReturns, 0)} шт.`,
        nextAction: 'Проверить причину резкого роста возвратов: карточка, ожидание покупателя, качество партии, упаковка, цена/промо и отзывы. В задаче оставить одну подтвержденную причину и действие.',
        reason: [
          `возвраты выросли с ${autoSignalNum(baselineReturns, 0)} до ${autoSignalNum(currentReturns, 0)} шт.`,
          `рост ${growthLabel}, дельта +${autoSignalNum(delta, 0)} шт.`,
          Math.abs(valueDelta) > 0 ? `деньги: ${valueDelta >= 0 ? '+' : ''}${autoSignalMoney(valueDelta)}` : '',
          topReason ? `топ-причина: ${topReason}` : '',
          state.autoSignalBaselines?.source ? `сравнение с ${state.autoSignalBaselines.source}` : ''
        ].filter(Boolean).join(' · '),
        owner: autoSignalTaskOwner(sku, platform),
        due: autoSignalTaskDue(priority),
        status: 'new',
        type: 'returns',
        priority,
        platform,
        entityLabel: sku?.name || articleKey
      }
    };
  }).filter(Boolean);
}

function autoSignalLeaderboardSnapshots() {
  const current = state.productLeaderboard || {};
  const history = Array.isArray(state.productLeaderboardHistory) ? state.productLeaderboardHistory : [];
  const map = new Map();
  [current, ...history].forEach((payload) => {
    if (!payload || !Array.isArray(payload.items)) return;
    const week = String(payload.weekLabel || payload.sourceSheetName || payload.generatedAt || '').trim();
    if (!week) return;
    const existing = map.get(week);
    if (!existing || String(payload.generatedAt || '').localeCompare(String(existing.generatedAt || '')) > 0) {
      map.set(week, payload);
    }
  });
  return [...map.values()].sort((left, right) => String(right.generatedAt || '').localeCompare(String(left.generatedAt || '')));
}

function autoSignalPreviousLeaderboardItem(articleKey, currentWeek) {
  const key = String(articleKey || '').trim().toLowerCase();
  if (!key) return null;
  const snapshots = autoSignalLeaderboardSnapshots();
  const previous = snapshots.find((payload) => String(payload.weekLabel || payload.sourceSheetName || '') !== String(currentWeek || ''));
  return (previous?.items || []).find((item) => String(item.articleKey || '').trim().toLowerCase() === key) || null;
}

function buildAdsTwoDayFunnelAutoSignalCandidates() {
  return autoSignalAdsBuckets().flatMap((bucket) => {
    const totals = bucket.totals || {};
    if (
      autoSignalFinite(totals.spend, 0) < AUTO_SIGNAL_RULES.minAdsSpend
      || autoSignalFinite(totals.clicks, 0) < AUTO_SIGNAL_RULES.minAdsClicks
    ) {
      return [];
    }

    const window = autoSignalAdsTwoDayWindow(bucket);
    if (!window) return [];
    const platformLabel = autoSignalPlatformLabel(bucket.platform);
    const latestSpend = autoSignalFinite(window.latestTotals.spend, 0);
    const latestMetrics = window.latestMetrics || {};
    const baseMetrics = window.baseMetrics || {};
    const campaignLabel = bucket.campaigns.length ? `кампании: ${bucket.campaigns.join(', ')}` : '';
    const metricContext = [
      `CTR ${autoSignalPct(latestMetrics.ctr, 1)} против базы ${autoSignalPct(baseMetrics.ctr, 1)}`,
      `CR ${autoSignalPct(latestMetrics.cr, 1)} против базы ${autoSignalPct(baseMetrics.cr, 1)}`,
      `ДРР ${autoSignalAdsRatioLabel(latestMetrics.drr, 'нет выручки')} против базы ${autoSignalAdsRatioLabel(baseMetrics.drr, 'нет выручки')}`
    ].join(' · ');
    const commonReason = [
      window.dateLabel ? `период: ${window.dateLabel}` : '',
      `расход за 2 дня ${autoSignalMoney(latestSpend)}`,
      metricContext,
      campaignLabel
    ].filter(Boolean).join(' · ');

    const candidates = [];
    const pushCandidate = ({
      code,
      title,
      statusLabel,
      stat,
      formatter = autoSignalNum,
      digits = 0,
      metricSuffix = '/день',
      priority,
      score,
      nextAction,
      extraReason = ''
    }) => {
      candidates.push({
        family: 'ads',
        dedupeKey: `${bucket.articleKey}|${code}|${bucket.platform}`,
        articleKey: bucket.articleKey,
        taskType: 'traffic',
        platform: bucket.platform,
        priority,
        score: score + 240,
        task: {
          id: stableId(`auto-${code}`, `${bucket.platform}|${bucket.articleKey}`),
          source: 'auto',
          autoCode: code,
          articleKey: bucket.articleKey,
          title: `${platformLabel}: ${title}`,
          nextAction,
          reason: [
            `Бизнес-статус: ${statusLabel}.`,
            `${autoSignalAdsTwoDayMetricLabel(stat, formatter, digits, metricSuffix)}; падение ${autoSignalPct(stat.drop)}.`,
            extraReason,
            commonReason
          ].filter(Boolean).join(' · '),
          owner: autoSignalTaskOwner(bucket.sku, bucket.platform, bucket.owner),
          due: autoSignalTaskDue(priority),
          status: 'new',
          type: 'traffic',
          priority,
          platform: bucket.platform,
          entityLabel: bucket.name || bucket.sku?.name || bucket.articleKey
        }
      });
    };

    const viewsDrop = window.views.drop >= AUTO_SIGNAL_RULES.adsTwoDayDropPct
      && window.views.bothDaysDown
      && window.views.baseAvg >= AUTO_SIGNAL_RULES.minAdsDailyViews;
    const clicksDrop = window.clicks.drop >= AUTO_SIGNAL_RULES.adsTwoDayDropPct
      && window.clicks.bothDaysDown
      && window.clicks.baseAvg >= AUTO_SIGNAL_RULES.minAdsDailyClicks;
    const ordersDrop = window.orders.drop >= AUTO_SIGNAL_RULES.adsTwoDayDropPct
      && window.orders.bothDaysDown
      && window.orders.baseAvg >= AUTO_SIGNAL_RULES.minAdsDailyOrders;
    const crDrop = window.crDrop >= AUTO_SIGNAL_RULES.adsMetricDropPct
      && window.clicks.baseAvg >= AUTO_SIGNAL_RULES.minAdsDailyClicks
      && window.orders.baseAvg >= AUTO_SIGNAL_RULES.minAdsDailyOrders;

    if (viewsDrop) {
      const priority = window.views.drop >= 0.40 || latestSpend >= AUTO_SIGNAL_RULES.minAdsSpend / 2 ? 'high' : 'medium';
      pushCandidate({
        code: 'ads_views_drop_2d_v2',
        title: `показы просели 2 дня подряд (-${autoSignalPct(window.views.drop)})`,
        statusLabel: 'верх воронки / показы просели 2 дня подряд',
        stat: window.views,
        priority,
        score: 815 + autoSignalFinite(totals.spend, 0) / 1400 + window.views.drop * 150,
        nextAction: 'Проверить верх рекламной воронки: статус РК, дневной бюджет, ставки, охват, остатки и поисковые фразы. В задаче зафиксировать причину просадки показов и решение: вернуть показы, перераспределить бюджет или оставить ограничение осознанно.'
      });
    }

    if (clicksDrop) {
      const priority = window.clicks.drop >= 0.35 || latestSpend >= AUTO_SIGNAL_RULES.minAdsSpend / 2 ? 'high' : 'medium';
      pushCandidate({
        code: 'ads_clicks_drop_2d_v2',
        title: `клики просели 2 дня подряд (-${autoSignalPct(window.clicks.drop)})`,
        statusLabel: 'середина воронки / клики просели 2 дня подряд',
        stat: window.clicks,
        priority,
        score: 845 + autoSignalFinite(totals.spend, 0) / 1300 + window.clicks.drop * 170 + window.ctrDrop * 80,
        nextAction: 'Проверить клики и CTR: креатив, ставку, позицию, релевантность запросов и карточку в выдаче. В задаче оставить одно действие: поднять/снизить ставку, заменить креатив, почистить запросы или остановить РК.',
        extraReason: window.ctrDrop >= AUTO_SIGNAL_RULES.adsMetricDropPct
          ? `CTR за 2 дня просел на ${autoSignalPct(window.ctrDrop)} к базе.`
          : ''
      });
    }

    if (ordersDrop) {
      const priority = window.orders.drop >= 0.35 || latestSpend >= AUTO_SIGNAL_RULES.minAdsSpend / 2 ? 'critical' : 'high';
      pushCandidate({
        code: 'ads_orders_drop_2d_v2',
        title: `заказы просели 2 дня подряд (-${autoSignalPct(window.orders.drop)})`,
        statusLabel: 'низ воронки / заказы просели 2 дня подряд',
        stat: window.orders,
        priority,
        score: 900 + autoSignalFinite(totals.spend, 0) / 1200 + window.orders.drop * 220 + window.crDrop * 100,
        nextAction: 'Проверить низ рекламной воронки: карточка, цена, остатки, доставка, отзывы и качество трафика. В задаче зафиксировать, это проблема конверсии, цены/остатков или надо урезать неокупаемый трафик.',
        extraReason: [
          clicksDrop ? `клики тоже просели на ${autoSignalPct(window.clicks.drop)}` : '',
          window.crDrop >= AUTO_SIGNAL_RULES.adsMetricDropPct ? `CR за 2 дня просел на ${autoSignalPct(window.crDrop)} к базе` : ''
        ].filter(Boolean).join('; ')
      });
    }

    if (!ordersDrop && crDrop) {
      const priority = window.crDrop >= 0.35 || latestSpend >= AUTO_SIGNAL_RULES.minAdsSpend / 2 ? 'critical' : 'high';
      pushCandidate({
        code: 'ads_cr_drop_2d_v2',
        title: `конверсия в заказ просела 2 дня (-${autoSignalPct(window.crDrop)})`,
        statusLabel: 'низ воронки / CR просел 2 дня',
        stat: {
          baseAvg: baseMetrics.cr,
          latestAvg: latestMetrics.cr,
          latestValues: [latestMetrics.cr],
          drop: window.crDrop
        },
        formatter: autoSignalPct,
        digits: 1,
        metricSuffix: '',
        priority,
        score: 875 + autoSignalFinite(totals.spend, 0) / 1250 + window.crDrop * 210,
        nextAction: 'Проверить конверсию из клика в заказ: цена, карточка, наличие, доставка, отзывы, промо и качество запросов. В задаче зафиксировать причину просадки CR и действие по карточке/цене/РК.',
        extraReason: `клики за 2 дня ${autoSignalNum(window.clicks.latestAvg, 0)}/день против базы ${autoSignalNum(window.clicks.baseAvg, 0)}/день`
      });
    }

    return candidates;
  });
}

function buildAdsFunnelAutoSignalCandidates() {
  return autoSignalAdsBuckets().map((bucket) => {
    const totals = bucket.totals || {};
    const metrics = bucket.metrics || {};
    const recentTotals = bucket.recentTotals || {};
    const baseTotals = bucket.baseTotals || {};
    const recentMetrics = bucket.recentMetrics || {};
    const baseMetrics = bucket.baseMetrics || {};
    if (
      autoSignalFinite(totals.spend, 0) < AUTO_SIGNAL_RULES.minAdsSpend
      || autoSignalFinite(totals.clicks, 0) < AUTO_SIGNAL_RULES.minAdsClicks
    ) {
      return null;
    }

    const platformLabel = autoSignalPlatformLabel(bucket.platform);
    const drrBad = !Number.isFinite(metrics.drr)
      || metrics.drr >= AUTO_SIGNAL_RULES.maxAdsDrr;
    const cpoBad = autoSignalFinite(totals.orders, 0) >= AUTO_SIGNAL_RULES.minAdsOrders
      && metrics.cpo >= AUTO_SIGNAL_RULES.maxAdsCpo;
    const ctrLow = autoSignalFinite(totals.views, 0) > 0
      && metrics.ctr > 0
      && metrics.ctr < AUTO_SIGNAL_RULES.minAdsCtr;
    const crLow = metrics.cr > 0
      && metrics.cr < AUTO_SIGNAL_RULES.minAdsCr;
    const baseReady = autoSignalFinite(baseTotals.clicks, 0) >= AUTO_SIGNAL_RULES.minAdsClicks
      || autoSignalFinite(baseTotals.spend, 0) >= AUTO_SIGNAL_RULES.minAdsSpend;
    const recentReady = autoSignalFinite(recentTotals.clicks, 0) >= AUTO_SIGNAL_RULES.minAdsClicks / 3
      || autoSignalFinite(recentTotals.spend, 0) >= AUTO_SIGNAL_RULES.minAdsSpend / 3;
    const ctrDrop = baseReady && recentReady
      ? autoSignalAdsMetricDrop(baseMetrics.ctr, recentMetrics.ctr)
      : 0;
    const crDrop = baseReady && recentReady
      ? autoSignalAdsMetricDrop(baseMetrics.cr, recentMetrics.cr)
      : 0;
    const drrGrowth = baseReady && recentReady && Number.isFinite(baseMetrics.drr) && Number.isFinite(recentMetrics.drr)
      ? autoSignalAdsMetricGrowth(baseMetrics.drr, recentMetrics.drr)
      : 0;

    const reasons = [];
    const titleParts = [];
    if (drrBad) {
      titleParts.push(Number.isFinite(metrics.drr) ? `ДРР ${autoSignalPct(metrics.drr, 0)}` : 'нет выручки');
      reasons.push(`ДРР выше нормы: ${autoSignalAdsRatioLabel(metrics.drr, 'нет выручки')} при норме до ${autoSignalPct(AUTO_SIGNAL_RULES.maxAdsDrr, 0)}`);
    }
    if (cpoBad) {
      titleParts.push(`CPO ${autoSignalAdsMoneyRatioLabel(metrics.cpo)}`);
      reasons.push(`CPO выше нормы: ${autoSignalAdsMoneyRatioLabel(metrics.cpo)} при норме до ${autoSignalMoney(AUTO_SIGNAL_RULES.maxAdsCpo)}`);
    }
    if (ctrLow) {
      titleParts.push(`CTR ${autoSignalPct(metrics.ctr, 1)}`);
      reasons.push(`CTR ниже порога: ${autoSignalPct(metrics.ctr, 1)} при пороге ${autoSignalPct(AUTO_SIGNAL_RULES.minAdsCtr, 1)}`);
    }
    if (crLow) {
      titleParts.push(`CR ${autoSignalPct(metrics.cr, 1)}`);
      reasons.push(`CR ниже порога: ${autoSignalPct(metrics.cr, 1)} при пороге ${autoSignalPct(AUTO_SIGNAL_RULES.minAdsCr, 1)}`);
    }
    if (ctrDrop >= AUTO_SIGNAL_RULES.adsMetricDropPct) {
      reasons.push(`последние 7 дней CTR просел на ${autoSignalPct(ctrDrop)} к базе`);
    }
    if (crDrop >= AUTO_SIGNAL_RULES.adsMetricDropPct) {
      reasons.push(`последние 7 дней CR просел на ${autoSignalPct(crDrop)} к базе`);
    }
    if (drrGrowth >= AUTO_SIGNAL_RULES.adsMetricDropPct) {
      reasons.push(`последние 7 дней ДРР вырос на ${autoSignalPct(drrGrowth)} к базе`);
    }
    if (!reasons.length) return null;

    const priority = !Number.isFinite(metrics.drr)
      || metrics.drr >= 1
      || metrics.cpo >= AUTO_SIGNAL_RULES.maxAdsCpo * 1.5
      || drrGrowth >= 0.5
      ? 'critical'
      : (drrBad || cpoBad || crLow ? 'high' : 'medium');
    const titleMetric = titleParts.slice(0, 2).join(', ') || 'отклонение метрик';
    const campaignLabel = bucket.campaigns.length ? `кампании: ${bucket.campaigns.join(', ')}` : '';
    return {
      family: 'ads',
      dedupeKey: `${bucket.articleKey}|ads-funnel|${bucket.platform}`,
      articleKey: bucket.articleKey,
      taskType: 'traffic',
      platform: bucket.platform,
      priority,
      score: 730
        + autoSignalFinite(totals.spend, 0) / 1000
        + (drrBad ? 120 : 0)
        + (cpoBad ? 90 : 0)
        + (crLow ? 70 : 0)
        + (ctrLow ? 40 : 0)
        + Math.max(ctrDrop, crDrop, drrGrowth) * 100,
      task: {
        id: stableId('auto-ads-funnel-v2', `${bucket.platform}|${bucket.articleKey}`),
        source: 'auto',
        autoCode: 'ads_funnel_v2',
        articleKey: bucket.articleKey,
        title: `${platformLabel}: рекламная воронка — ${titleMetric}`,
        nextAction: 'Разобрать рекламную воронку: CTR = креатив/ставка/запросы, CR = карточка/цена/остатки, ДРР/CPO = ставка, бюджет или отключение РК. В задаче оставить одно решение и дату повторной проверки.',
        reason: [
          `${platformLabel}: расход ${autoSignalMoney(totals.spend)}, выручка ${autoSignalMoney(totals.revenue)}, заказы ${autoSignalNum(totals.orders, 0)}`,
          `CTR ${autoSignalPct(metrics.ctr, 1)}, CR ${autoSignalPct(metrics.cr, 1)}, ДРР ${autoSignalAdsRatioLabel(metrics.drr, 'нет выручки')}, CPO ${autoSignalAdsMoneyRatioLabel(metrics.cpo)}`,
          reasons.slice(0, 4).join(' · '),
          campaignLabel
        ].filter(Boolean).join(' · '),
        owner: autoSignalTaskOwner(bucket.sku, bucket.platform, bucket.owner),
        due: autoSignalTaskDue(priority),
        status: 'new',
        type: 'traffic',
        priority,
        platform: bucket.platform,
        entityLabel: bucket.name || bucket.sku?.name || bucket.articleKey
      }
    };
  }).filter(Boolean);
}

function buildKzAutoSignalCandidates(leaderboardPayload = {}) {
  const items = Array.isArray(leaderboardPayload.items) ? leaderboardPayload.items : [];
  const weekLabel = String(leaderboardPayload.weekLabel || leaderboardPayload.sourceSheetName || '').trim();
  return items.map((item) => {
    const articleKey = String(item.articleKey || '').trim();
    const sku = getSku(articleKey);
    if (!articleKey || item.inPortal === false || !autoSignalSkuAllowed(sku)) return null;
    const revenue = autoSignalFinite(item.revenue);
    const clicks = autoSignalFinite(item.clicks);
    const spend = autoSignalFinite(item.contentCost);
    const romi = autoSignalMetric(item, 'romiPct');
    const drr = autoSignalMetric(item, 'drrPct');
    const conversion = autoSignalMetric(item, 'conversionPct');
    const buyRate = autoSignalMetric(item, 'buyRatePct');
    const previous = autoSignalPreviousLeaderboardItem(articleKey, weekLabel);
    const previousRevenue = autoSignalFinite(previous?.revenue);
    const previousOrders = autoSignalFinite(previous?.orders);
    const currentOrders = autoSignalFinite(item.orders);
    const previousAov = previousRevenue / Math.max(1, previousOrders);
    const currentAov = revenue / Math.max(1, currentOrders);
    const revenueDrop = previousRevenue > 0 ? (previousRevenue - revenue) / previousRevenue : 0;
    const aovDrop = previousAov > 0 ? (previousAov - currentAov) / previousAov : 0;
    const reasons = [];
    const spendGate = spend >= AUTO_SIGNAL_RULES.minKzSpend;
    const revenueGate = revenue >= AUTO_SIGNAL_RULES.minKzRevenue;
    const badProfitabilityLevel = (Number.isFinite(romi.value) && romi.value < 1)
      || (Number.isFinite(drr.value) && drr.value >= 0.45);

    const profitabilityDrop = (
      (Number.isFinite(romi.deltaPct) && romi.deltaPct <= -AUTO_SIGNAL_RULES.profitabilityDropPct && romi.value < romi.baseline)
      || (Number.isFinite(drr.deltaPct) && drr.deltaPct >= AUTO_SIGNAL_RULES.profitabilityDropPct && drr.value > drr.baseline)
      || badProfitabilityLevel
    ) && spendGate && (revenueGate || badProfitabilityLevel);
    if (profitabilityDrop) {
      reasons.push(`реклама не держит экономику: расход ${autoSignalMoney(spend)}, выручка ${autoSignalMoney(revenue)}, ROMI ${autoSignalPct(romi.value, 1)} против базы ${autoSignalPct(romi.baseline, 1)}, ДРР ${autoSignalPct(drr.value, 1)}`);
    }

    const conversionDrop = clicks >= AUTO_SIGNAL_RULES.minKzClicks && (
      (Number.isFinite(conversion.deltaPct) && conversion.deltaPct <= -AUTO_SIGNAL_RULES.conversionDropPct && conversion.value < conversion.baseline)
      || (Number.isFinite(buyRate.deltaPct) && buyRate.deltaPct <= -AUTO_SIGNAL_RULES.conversionDropPct && buyRate.value < buyRate.baseline)
    );
    if (conversionDrop && (profitabilityDrop || revenueDrop >= AUTO_SIGNAL_RULES.revenueDropPct)) {
      reasons.push(`конверсия КЗ ниже базы на ${autoSignalPct(Math.abs(Math.min(conversion.deltaPct || 0, buyRate.deltaPct || 0)))}`);
    }

    if (profitabilityDrop && previousRevenue >= AUTO_SIGNAL_RULES.minKzRevenue && revenueDrop >= AUTO_SIGNAL_RULES.revenueDropPct) {
      reasons.push(`выручка КЗ упала на ${autoSignalPct(revenueDrop)} к прошлой неделе`);
    }
    if (profitabilityDrop && previousOrders >= 20 && currentOrders >= 10 && aovDrop >= AUTO_SIGNAL_RULES.aovDropPct) {
      reasons.push(`средний чек КЗ упал на ${autoSignalPct(aovDrop)}`);
    }
    if (!profitabilityDrop && !(conversionDrop && revenueDrop >= AUTO_SIGNAL_RULES.revenueDropPct && revenueGate)) return null;
    if (!reasons.length) return null;

    const priority = profitabilityDrop || revenueDrop >= 0.35 ? 'critical' : 'high';
    const title = profitabilityDrop
      ? `КЗ WB: реклама режет доходность`
      : conversionDrop
        ? 'КЗ WB: конверсия просела вместе с оборотом'
        : 'КЗ WB: проверить просадку оборота после КЗ';
    return {
      family: 'kz',
      dedupeKey: `${articleKey}|kz|wb`,
      articleKey,
      taskType: 'traffic',
      platform: 'wb',
      priority,
      score: 740
        + (profitabilityDrop ? 180 : 0)
        + spend / 1000
        + Math.max(revenueDrop, aovDrop, Math.abs(conversion.deltaPct || 0), Math.abs(romi.deltaPct || 0)) * 100
        + revenue / 100000,
      task: {
        id: stableId('auto-kz-quality-v2', articleKey),
        source: 'auto',
        autoCode: 'kz_quality_v2',
        articleKey,
        title,
        nextAction: 'Разобрать только WB/КЗ: найти РК или креатив, который тратит деньги без окупаемости. В задаче оставить одно действие: выключить/урезать, заменить креатив, поправить карточку или подтвердить промо-исключение.',
        reason: `${weekLabel || 'КЗ'}: ${reasons.slice(0, 3).join(' · ')}. Ozon не назначаем: КЗ ведем как WB-контур.`,
        owner: autoSignalTaskOwner(sku, 'wb'),
        due: autoSignalTaskDue(priority),
        status: 'new',
        type: 'traffic',
        priority,
        platform: 'wb',
        entityLabel: sku?.name || item.name || articleKey
      }
    };
  }).filter(Boolean);
}

function selectAutoSignalCandidates(candidates = []) {
  const selected = [];
  const used = new Set();
  const usedIntent = new Set();
  const familyCounts = {};
  const sorted = candidates.slice().sort((left, right) =>
    autoSignalFinite(right.score) - autoSignalFinite(left.score)
    || String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru')
  );
  for (const candidate of sorted) {
    const family = candidate.family || 'general';
    const limit = AUTO_SIGNAL_RULES.familyLimits[family] || 6;
    const dedupeKey = candidate.dedupeKey || candidate.articleKey || candidate.task?.id;
    const articleKey = String(candidate.articleKey || candidate.task?.articleKey || '').trim().toLowerCase();
    const taskType = String(candidate.taskType || candidate.task?.type || 'general').trim().toLowerCase();
    const platform = normalizeTaskPlatform(candidate.platform || candidate.task?.platform || 'all');
    const intentKey = candidate.intentKey || (articleKey ? `${articleKey}|${taskType}|${platform || 'all'}` : '');
    if (!dedupeKey || used.has(dedupeKey)) continue;
    if (intentKey && usedIntent.has(intentKey)) continue;
    if ((familyCounts[family] || 0) >= limit) continue;
    selected.push(candidate);
    used.add(dedupeKey);
    if (intentKey) usedIntent.add(intentKey);
    familyCounts[family] = (familyCounts[family] || 0) + 1;
    if (selected.length >= AUTO_SIGNAL_RULES.totalLimit) break;
  }
  return selected;
}

function buildQualityAutoSignalTasks(keys, leaderboardPayload = {}) {
  return selectAutoSignalCandidates([
    ...buildStockAutoSignalCandidates(),
    ...buildPriceAndSalesAutoSignalCandidates(),
    ...buildReturnsAutoSignalCandidates(),
    ...buildAdsTwoDayFunnelAutoSignalCandidates(),
    ...buildAdsFunnelAutoSignalCandidates(),
    ...buildKzAutoSignalCandidates(leaderboardPayload)
  ]).map((candidate) => {
    const task = candidate.task || {};
    const taskType = task.type || candidate.taskType || 'general';
    const signalKey = `${taskType}:${candidate.family || task.autoCode || 'auto'}:${candidate.platform || task.platform || 'all'}`;
    if (!canRegisterAutoSignalTask(keys, task.articleKey || candidate.articleKey, taskType, signalKey)) return null;
    return normalizeTask(task, 'auto');
  }).filter(Boolean);
}

function predictiveAutoSignalRows() {
  const rows = [];
  if (Array.isArray(state.autoTaskSignals?.signals)) rows.push(...state.autoTaskSignals.signals);
  if (Array.isArray(state.predictiveRisk?.autoTaskSignals)) rows.push(...state.predictiveRisk.autoTaskSignals);
  if (Array.isArray(state.predictiveRisk?.autoTaskSignals?.signals)) rows.push(...state.predictiveRisk.autoTaskSignals.signals);
  return rows.filter((row) => row && typeof row === 'object');
}

function predictiveSignalRiskScore(signal = {}) {
  return autoSignalFinite(signal.riskScore ?? signal.score ?? signal.probabilityScore, 0);
}

function predictiveSignalPriority(signal = {}) {
  const raw = String(signal.priority || '').trim().toLowerCase();
  if (['critical', 'high', 'medium', 'low'].includes(raw)) return raw;
  const score = predictiveSignalRiskScore(signal);
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

function predictiveSignalType(signal = {}) {
  const raw = String(signal.type || '').trim().toLowerCase();
  if (raw) return raw;
  const ruleId = String(signal.ruleId || signal.rule_id || '').trim().toLowerCase();
  if (/stock|oos|supply/.test(ruleId)) return 'supply';
  if (/price|margin/.test(ruleId)) return 'price_margin';
  if (/ads|traffic|demand|funnel/.test(ruleId)) return 'traffic';
  if (/launch/.test(ruleId)) return 'launch';
  return 'general';
}

function predictiveSignalArticleKey(signal = {}) {
  return String(signal.articleKey || signal.article || signal.sku || '').trim();
}

function predictiveSignalAutoCode(signal = {}) {
  const code = String(signal.autoCode || '').trim();
  if (code) return code;
  const ruleId = String(signal.ruleId || 'predictive').trim().toLowerCase() || 'predictive';
  const articleKey = predictiveSignalArticleKey(signal).toLowerCase();
  const platform = normalizeTaskPlatform(signal.platform || signal.marketplace || 'cross');
  return `predictive:${ruleId}:${platform}:${articleKey || stableId('signal', signal.title || signal.id || ruleId)}`;
}

function predictiveSignalSortKey(signal = {}) {
  const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  return (priorityRank[predictiveSignalPriority(signal)] || 0) * 1000 + predictiveSignalRiskScore(signal);
}

function predictiveSignalClosedAt(task = {}) {
  return String(task.closedAt || task.closed_at || task.updatedAt || task.updated_at || task.completedAt || task.completed_at || '').slice(0, 10);
}

function predictiveSignalMatchesTask(signal = {}, task = {}) {
  const signalCode = predictiveSignalAutoCode(signal);
  const taskCode = String(task.autoCode || '').trim();
  if (signalCode && taskCode && signalCode === taskCode) return true;
  const articleKey = predictiveSignalArticleKey(signal);
  const taskArticle = String(task.articleKey || '').trim();
  const signalType = predictiveSignalType(signal);
  const taskType = String(task.type || '').trim().toLowerCase();
  return Boolean(articleKey && taskArticle && articleKey === taskArticle && signalType === taskType);
}

function predictiveSignalRecentlyClosed(signal = {}, quietDays = 7) {
  if (predictiveSignalPriority(signal) === 'critical') return false;
  const today = todayIso();
  return (state.storage?.tasks || []).some((task) => {
    if (!['done', 'cancelled'].includes(mapTaskStatus(task?.status))) return false;
    if (!predictiveSignalMatchesTask(signal, task)) return false;
    const closedAt = predictiveSignalClosedAt(task);
    if (!closedAt) return true;
    return diffFromTodayInDays(closedAt) >= -quietDays && closedAt <= today;
  });
}

function buildPredictiveAutoSignalTasks(keys) {
  const rows = predictiveAutoSignalRows()
    .filter((signal) => signal.createTask !== false && signal.suppressed !== true)
    .sort((left, right) =>
      predictiveSignalSortKey(right) - predictiveSignalSortKey(left)
      || String(predictiveSignalAutoCode(left)).localeCompare(String(predictiveSignalAutoCode(right)), 'ru')
    );
  const tasks = [];
  const usedCodes = new Set();
  const maxTasks = 80;

  for (const signal of rows) {
    const autoCode = predictiveSignalAutoCode(signal);
    if (!autoCode || usedCodes.has(autoCode)) continue;
    if (predictiveSignalRecentlyClosed(signal)) continue;
    const articleKey = predictiveSignalArticleKey(signal);
    const taskType = predictiveSignalType(signal);
    const platform = normalizeTaskPlatform(signal.platform || signal.marketplace || 'cross');
    const signalKey = `predictive:${autoCode}`;
    if (articleKey && !canRegisterAutoSignalTask(keys, articleKey, taskType, signalKey)) continue;
    if (!articleKey) {
      const globalKey = `predictive|${autoCode}`;
      if (keys.has(globalKey)) continue;
      keys.add(globalKey);
    }

    const priority = predictiveSignalPriority(signal);
    tasks.push(normalizeTask({
      id: signal.id || stableId('auto-predictive', autoCode),
      source: 'auto',
      autoCode,
      articleKey,
      title: signal.title || `Прогнозный риск: ${signal.entityLabel || articleKey || autoCode}`,
      nextAction: signal.nextAction || signal.recommendedAction || 'Проверить прогнозный риск, подтвердить причину и зафиксировать решение.',
      reason: signal.reason || signal.description || signal.summary || 'Прогнозный слой нашел отклонение по показателям и рекомендует ручную проверку.',
      owner: signal.owner || '',
      due: signal.due || autoSignalTaskDue(priority),
      status: signal.status || 'new',
      type: taskType,
      priority,
      platform,
      entityLabel: signal.entityLabel || signal.name || articleKey || signal.title || autoCode
    }, 'auto'));
    usedCodes.add(autoCode);
    if (tasks.length >= maxTasks) break;
  }

  return tasks;
}

function autoTaskHistorySnapshotFromTask(task = {}, previous = null, nowIso = new Date().toISOString()) {
  const signalKey = autoTaskHistorySignalKey(task);
  return {
    signalKey,
    taskId: String(task.id || stableId('auto-task', signalKey)),
    articleKey: String(task.articleKey || '').trim(),
    platform: normalizeTaskPlatform(task.platform || 'all'),
    autoCode: String(task.autoCode || '').trim(),
    type: String(task.type || '').trim(),
    title: String(task.title || '').trim(),
    priority: String(task.priority || '').trim(),
    owner: String(task.owner || '').trim(),
    due: String(task.due || '').trim(),
    nextAction: String(task.nextAction || '').trim(),
    reason: String(task.reason || '').trim(),
    signature: autoTaskHistorySignature(task),
    firstSeenAt: previous?.firstSeenAt || nowIso,
    lastSeenAt: nowIso,
    lastSeenDate: todayIso(),
    lastChangedAt: previous?.lastChangedAt || '',
    seenCount: Math.max(1, Math.round(autoSignalFinite(previous?.seenCount, 0) + 1))
  };
}

function autoTaskHistoryEvent(kind, entry = {}, text = '', nowIso = new Date().toISOString()) {
  const event = normalizeAutoTaskHistoryEvent({
    id: stableId('auto-history', `${entry.signalKey}|${kind}|${nowIso}|${entry.signature || ''}`),
    signalKey: entry.signalKey,
    taskId: entry.taskId,
    articleKey: entry.articleKey,
    platform: entry.platform,
    autoCode: entry.autoCode,
    type: entry.type,
    kind,
    title: entry.title,
    priority: entry.priority,
    owner: entry.owner,
    due: entry.due,
    nextAction: entry.nextAction,
    reason: entry.reason,
    text,
    firstSeenAt: entry.firstSeenAt,
    lastSeenAt: entry.lastSeenAt,
    lastSeenDate: entry.lastSeenDate,
    lastChangedAt: entry.lastChangedAt,
    seenCount: entry.seenCount,
    createdAt: nowIso
  });
  return event;
}

function autoTaskHistoryUpdateText(previous = {}, next = {}) {
  const changes = [];
  if (previous.priority && next.priority && previous.priority !== next.priority) {
    changes.push(`приоритет ${previous.priority} → ${next.priority}`);
  }
  if (previous.title && next.title && previous.title !== next.title) {
    changes.push('обновился заголовок');
  }
  if (previous.due && next.due && previous.due !== next.due) {
    changes.push(`срок ${previous.due} → ${next.due}`);
  }
  if (!changes.length) changes.push('обновились детали сигнала');
  return `Авто-сигнал обновился: ${next.title || previous.title || next.autoCode || 'сигнал'}. ${changes.join('; ')}.`;
}

function saveAutoTaskHistoryStorage() {
  try {
    if (typeof saveLocalStorage === 'function') {
      saveLocalStorage({ skipBackup: true, reason: 'auto-task-history' });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.storage));
    }
  } catch (error) {
    console.warn('[auto-task-history] save failed', error);
  }
}

function syncAutoTaskHistory(autoTasks = []) {
  if (state.__syncingAutoTaskHistory) return;
  if (!state.storage || typeof state.storage !== 'object') return;
  if (state.boot && state.boot.dataReady === false) return;
  if (state.boot?.lazyReady && state.boot.lazyReady.controlCenter !== true) return;
  state.__syncingAutoTaskHistory = true;
  try {
    state.storage.autoTaskSnapshot = normalizeAutoTaskSnapshot(state.storage.autoTaskSnapshot || {});
    state.storage.autoTaskHistory = normalizeAutoTaskHistory(state.storage.autoTaskHistory || []);

    const nowIso = new Date().toISOString();
    const today = todayIso();
    const previousActive = new Map(
      (state.storage.autoTaskSnapshot.active || []).map((entry) => [entry.signalKey, entry])
    );
    const nextActive = [];
    const events = [];
    const seenKeys = new Set();

    (autoTasks || [])
      .filter((task) => task && (task.source === 'auto' || task.autoCode))
      .forEach((task) => {
        const signalKey = autoTaskHistorySignalKey(task);
        if (!signalKey || seenKeys.has(signalKey)) return;
        seenKeys.add(signalKey);
        const previous = previousActive.get(signalKey) || null;
        const next = autoTaskHistorySnapshotFromTask(task, previous, nowIso);

        if (!previous) {
          events.push(autoTaskHistoryEvent('created', next, `Авто-сигнал появился: ${next.title || next.autoCode || 'сигнал'}.`, nowIso));
        } else if (previous.signature !== next.signature) {
          next.lastChangedAt = nowIso;
          events.push(autoTaskHistoryEvent('updated', next, autoTaskHistoryUpdateText(previous, next), nowIso));
        } else if (previous.lastSeenDate && previous.lastSeenDate !== today) {
          events.push(autoTaskHistoryEvent('seen', next, `Авто-сигнал подтверждён повторным расчётом: ${next.title || next.autoCode || 'сигнал'}.`, nowIso));
        } else {
          next.firstSeenAt = previous.firstSeenAt;
          next.lastSeenAt = previous.lastSeenAt;
          next.lastSeenDate = previous.lastSeenDate;
          next.lastChangedAt = previous.lastChangedAt;
          next.seenCount = previous.seenCount;
        }
        nextActive.push(next);
      });

    previousActive.forEach((previous, signalKey) => {
      if (seenKeys.has(signalKey)) return;
      events.push(autoTaskHistoryEvent('resolved', previous, `Авто-сигнал ушёл из текущей очереди: ${previous.title || previous.autoCode || 'сигнал'}.`, nowIso));
    });

    if (!events.length) return;
    const mergedHistory = normalizeAutoTaskHistory([
      ...events.filter(Boolean),
      ...(state.storage.autoTaskHistory || [])
    ]);
    state.storage.autoTaskSnapshot = {
      generatedAt: nowIso,
      active: nextActive
    };
    state.storage.autoTaskHistory = mergedHistory;
    saveAutoTaskHistoryStorage();
  } finally {
    state.__syncingAutoTaskHistory = false;
  }
}

function buildAutoTasks() {
  if (state.__buildingAutoTasks) return [];
  state.__buildingAutoTasks = true;
  try {
  const keys = storedTaskKeys();
  const tasks = [];
  const leaderboardPayload = typeof normalizeProductLeaderboardPayload === 'function'
    ? normalizeProductLeaderboardPayload(state.productLeaderboard || {})
    : (state.productLeaderboard || { items: [] });
  const leaderboardFresh = productLeaderboardFreshForAuto(leaderboardPayload);
  const leaderboardMap = new Map(
    (Array.isArray(leaderboardPayload.items) ? leaderboardPayload.items : [])
      .filter((item) => item?.articleKey)
      .map((item) => [String(item.articleKey).trim().toLowerCase(), item])
  );
  tasks.push(...buildQualityAutoSignalTasks(keys, leaderboardFresh ? leaderboardPayload : { items: [] }));
  tasks.push(...buildPredictiveAutoSignalTasks(keys));
  const legacyKzAutoTasksEnabled = false;
  const legacySkuFlagAutoTasksEnabled = false;

  for (const sku of state.skus) {
    const articleKey = sku.articleKey;
    const owner = ownerName(sku);
    const platform = sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon ? 'wb+ozon' : sku?.flags?.toWorkWB ? 'wb' : sku?.flags?.toWorkOzon ? 'ozon' : detectTaskPlatform({}, sku);
    const lifecycleKey = String(sku?.productLifecycle?.key || (typeof productLifecycleForSku === 'function' ? productLifecycleForSku(sku)?.key : '') || '').toLowerCase();
    const exitSku = ['exit', 'archived'].includes(lifecycleKey) || /вывод|вывед/.test(String(sku?.status || '').toLowerCase());
    if (exitSku) continue;
    const needsOwnerSignal = legacySkuFlagAutoTasksEnabled && !sku?.flags?.assigned && (
      sku?.flags?.toWorkWB
      || sku?.flags?.toWorkOzon
      || sku?.flags?.toWork
      || sku?.flags?.negativeMargin
      || sku?.flags?.lowStock
      || sku?.flags?.highReturn
      || numberOrZero(sku?.focusScore) >= 60
      || (typeof monthRevenue === 'function' ? monthRevenue(sku) : numberOrZero(sku?.planFact?.factTotalRevenue || sku?.orders?.value)) > 0
      || String(sku?.status || '').toLowerCase().includes('нов')
      || String(sku?.segment || '').toUpperCase() === 'GROWTH'
    );
    const leaderboardItem = leaderboardMap.get(String(articleKey || '').trim().toLowerCase()) || null;

    if (legacyKzAutoTasksEnabled && leaderboardFresh && leaderboardItem?.inPortal !== false) {
      const assignmentAlerts = leaderboardAlertsForFamilies(leaderboardItem, 'ownership');
      if (assignmentAlerts.length && canRegisterAutoTask(keys, articleKey, 'assignment')) {
        tasks.push(buildLeaderboardAutoTask({
          articleKey,
          owner: '',
          platform,
          item: leaderboardItem,
          alerts: assignmentAlerts,
          autoCode: 'kz_owner',
          title: 'КЗ: назначить owner по SKU',
          nextAction: 'Закрепить владельца карточки и weekly KZ-разбора, чтобы сигналы по воронке не висели без ответа.',
          type: 'assignment'
        }));
      }

      const economicsAlerts = leaderboardAlertsForFamilies(leaderboardItem, 'economics');
      if (leaderboardHasEscalation(economicsAlerts) && canRegisterAutoTask(keys, articleKey, 'price_margin')) {
        tasks.push(buildLeaderboardAutoTask({
          articleKey,
          owner,
          platform,
          item: leaderboardItem,
          alerts: economicsAlerts,
          autoCode: 'kz_economics',
          title: 'КЗ: разобрать цену и экономику',
          nextAction: 'Сверить цену витрины, ДРР/ROMI и unit-маржу. В апдейте выбрать решение: цена, промо, карточка или без изменений.',
          type: 'price_margin'
        }));
      }

      const contentAlerts = leaderboardAlertsForFamilies(leaderboardItem, 'card');
      if (leaderboardHasEscalation(contentAlerts) && canRegisterAutoTask(keys, articleKey, 'content')) {
        tasks.push(buildLeaderboardAutoTask({
          articleKey,
          owner,
          platform,
          item: leaderboardItem,
          alerts: contentAlerts,
          autoCode: 'kz_card',
          title: 'КЗ: разобрать карточку и оффер',
          nextAction: 'Проверить первый экран, цену, оффер и путь в корзину. Зафиксировать правки по карточке и срок перепроверки.',
          type: 'content'
        }));
      }

      const trafficAlerts = leaderboardAlertsForFamilies(leaderboardItem, ['traffic', 'sales']);
      if (!exitSku && leaderboardHasEscalation(trafficAlerts) && canRegisterAutoTask(keys, articleKey, 'traffic')) {
        tasks.push(buildLeaderboardAutoTask({
          articleKey,
          owner,
          platform,
          item: leaderboardItem,
          alerts: trafficAlerts,
          autoCode: 'kz_traffic',
          title: 'КЗ: разобрать трафик и воронку',
          nextAction: 'Проверить охват, CTR, связку креативов и источник трафика. Зафиксировать гипотезу и следующий запуск.',
          type: 'traffic'
        }));
      }
    }

    if (legacySkuFlagAutoTasksEnabled && (sku?.flags?.toWorkWB || sku?.flags?.toWorkOzon || sku?.flags?.toWork) && canRegisterAutoTask(keys, articleKey, 'price_margin')) {
      tasks.push(normalizeTask({
        id: `auto-price-${articleKey}`,
        source: 'auto',
        autoCode: 'price_margin',
        articleKey,
        title: 'Разобрать цену и маржу',
        nextAction: 'Проверить цену, unit-экономику и дать план действий по SKU в работе.',
        reason: sku.focusReasons || 'Ниже плана и отрицательная маржа.',
        owner,
        due: plusDays(2),
        status: 'new',
        type: 'price_margin',
        priority: 'critical',
        platform
      }, 'auto'));
    } else if (legacySkuFlagAutoTasksEnabled && sku?.flags?.negativeMargin && canRegisterAutoTask(keys, articleKey, 'price_margin')) {
      tasks.push(normalizeTask({
        id: `auto-neg-${articleKey}`,
        source: 'auto',
        autoCode: 'negative_margin',
        articleKey,
        title: 'Проверить отрицательную маржу',
        nextAction: 'Сверить комиссии, логистику, возвраты и min price.',
        reason: 'Есть отрицательная маржа хотя бы по одной из площадок.',
        owner,
        due: plusDays(3),
        status: 'new',
        type: 'price_margin',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (legacySkuFlagAutoTasksEnabled && sku?.flags?.lowStock && !exitSku && !fbsOnlyStockSignalSuppressed(articleKey, platform) && canRegisterAutoTask(keys, articleKey, 'supply')) {
      tasks.push(normalizeTask({
        id: `auto-stock-${articleKey}`,
        source: 'auto',
        autoCode: 'low_stock',
        articleKey,
        title: 'Проверить остатки и поставку',
        nextAction: 'Подтвердить риск OOS, поставить срок и план отгрузки.',
        reason: 'Низкий остаток по SKU.',
        owner,
        due: plusDays(2),
        status: 'new',
        type: 'supply',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (legacySkuFlagAutoTasksEnabled && needsOwnerSignal && canRegisterAutoTask(keys, articleKey, 'assignment')) {
      tasks.push(normalizeTask({
        id: `auto-owner-${articleKey}`,
        source: 'auto',
        autoCode: 'assignment',
        articleKey,
        title: 'Назначить owner по SKU',
        nextAction: 'Закрепить ответственного и срок первого апдейта.',
        reason: 'SKU без закрепления.',
        owner: '',
        due: plusDays(1),
        status: 'new',
        type: 'assignment',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (AUTO_RETURNS_TASKS_ENABLED && sku?.flags?.highReturn && canRegisterAutoTask(keys, articleKey, 'returns')) {
      tasks.push(normalizeTask({
        id: `auto-returns-${articleKey}`,
        source: 'auto',
        autoCode: 'returns',
        articleKey,
        title: 'Разобрать возвраты и отзывы',
        nextAction: 'Проверить причины возвратов, отзывы и нужные правки карточки.',
        reason: sku?.returns?.topReason || 'Высокие возвраты по SKU.',
        owner,
        due: plusDays(3),
        status: 'new',
        type: 'returns',
        priority: 'medium',
        platform
      }, 'auto'));
    }
  }

  const activeLaunchTaskKeys = new Set();
  (state.storage.tasks || [])
    .filter((task) => task?.type === 'launch' && isTaskActive(task))
    .forEach((task) => {
      const articleKey = String(task.articleKey || '').trim();
      const entityKey = String(task.entityLabel || task.title || '').trim().toLowerCase();
      const platform = normalizeTaskPlatform(task.platform || '');
      if (!entityKey && !articleKey) return;
      if (TASK_PLATFORM_OWNER_KEYS.has(platform)) {
        activeLaunchTaskKeys.add(`${platform}|${articleKey}|${entityKey}`);
      } else {
        activeLaunchTaskKeys.add(`all|${articleKey}|${entityKey}`);
      }
    });
  const launchItems = typeof getLaunchItems === 'function' ? getLaunchItems({ skipTaskLookup: true }) : [];
  const launchCandidates = [];
  const seenLaunchItemKeys = new Set();
  launchItems.forEach((item) => {
    const launchDate = typeof launchDueDateKey === 'function'
      ? launchDueDateKey(item)
      : launchMonthToDateKey(item?.launchMonth);
    const daysUntilLaunch = diffFromTodayInDays(launchDate);
    const launchGateDate = shiftDateKey(launchDate, -30);
    const statusRaw = String(item?.status || '').toLowerCase();
    if (!launchDate || daysUntilLaunch < -10 || daysUntilLaunch > 45) return;
    if (/запущ|live|продаж|готово/.test(statusRaw)) return;
    const linkedSku = item?.articleKey ? getSku(item.articleKey) : null;
    if (linkedSku && !autoSignalSkuAllowed(linkedSku)) return;
    const itemDedupeKey = `${String(item?.articleKey || '').trim()}|${String(item?.name || '').trim().toLowerCase()}`;
    if (seenLaunchItemKeys.has(itemDedupeKey)) return;
    seenLaunchItemKeys.add(itemDedupeKey);
    const baseBlockers = [
      item.articleKey ? '' : 'нет SKU',
      item.presentationUrl ? '' : 'нет презентации'
    ].filter(Boolean);
    const due = launchGateDate && diffFromTodayInDays(launchGateDate) > 0
      ? launchGateDate
      : daysUntilLaunch <= 14
        ? plusDays(1)
        : daysUntilLaunch <= 30
          ? plusDays(2)
          : plusDays(5);
    const platforms = launchTaskPlatforms(item, linkedSku);
    launchCandidates.push({
      score: (daysUntilLaunch <= 14 ? 300 : 0)
        + (baseBlockers.length + (item.owner ? 0 : 1)) * 80
        + Math.max(0, 45 - daysUntilLaunch),
      articleKey: item.articleKey || '',
      item,
      linkedSku,
      launchDate,
      due,
      baseBlockers,
      platforms
    });
  });
  launchCandidates
    .sort((left, right) => autoSignalFinite(right.score) - autoSignalFinite(left.score)
      || String(left.item?.name || left.articleKey || '').localeCompare(String(right.item?.name || right.articleKey || ''), 'ru'))
    .slice(0, AUTO_SIGNAL_RULES.launchLimit)
    .forEach((candidate) => {
      const item = candidate.item || {};
      const baseId = item.id || item.articleKey || hashString(item.name || candidate.launchDate);
      const entityLabel = item.name || item.articleKey || 'Новинка';
      (candidate.platforms || []).forEach((platform) => {
        const platformKey = normalizeTaskPlatform(platform || 'product');
        const platformLabel = autoSignalPlatformLabel(platformKey);
        const entityKey = String(entityLabel || '').trim().toLowerCase();
        const activeKey = `${platformKey}|${String(candidate.articleKey || '').trim()}|${entityKey}`;
        if (activeLaunchTaskKeys.has(activeKey) || activeLaunchTaskKeys.has(`all|${String(candidate.articleKey || '').trim()}|${entityKey}`)) return;
        activeLaunchTaskKeys.add(activeKey);
        const platformOwner = taskPlatformOwnerName(candidate.linkedSku, platformKey) || defaultTaskPlatformOwnerName(platformKey);
        const ownerMissing = !platformOwner && !canonicalOwnerName(item.owner || '');
        const blockers = [
          ownerMissing ? `нет owner ${platformLabel}` : '',
          ...(candidate.baseBlockers || [])
        ].filter(Boolean);
        const priority = diffFromTodayInDays(candidate.launchDate) <= 14 || blockers.length >= 2 ? 'high' : 'medium';
        tasks.push(normalizeTask({
          id: `auto-launch-${platformKey}-${baseId}`,
          source: 'auto',
          autoCode: 'launch_pipeline',
          articleKey: candidate.articleKey || '',
          entityLabel,
          title: blockers.length ? 'Новинка: закрыть запусковой блокер' : 'Новинка: финальная проверка запуска',
          nextAction: 'Закрыть самый близкий блокер запуска по этой площадке: owner, SKU, презентация, карточка или Gantt. В задаче оставить конкретный недостающий артефакт и дату, когда он будет готов.',
          reason: [
            `площадка: ${platformLabel}`,
            item.launchMonth || 'Срок запуска',
            item.status || 'Нужно уточнить статус',
            item.production || '',
            blockers.length ? `блокеры: ${blockers.join(', ')}` : 'критичных блокеров не найдено'
          ].filter(Boolean).join(' · '),
          owner: platformOwner || (!candidate.linkedSku ? item.owner : ''),
          platformOwnerOnly: Boolean(candidate.linkedSku),
          due: candidate.due,
          status: 'new',
          type: 'launch',
          priority,
          platform: platformKey
        }, 'auto'));
      });
    });

  syncAutoTaskHistory(tasks);
  return tasks;
  } finally {
    state.__buildingAutoTasks = false;
  }
}

function getAllTasks() {
  const storedTasks = normalizeStorageTasks(state.storage.tasks || [], 'manual')
    .filter((task) => !isSuppressedAutoStockTask(task))
    .filter((task) => !isDeprecatedAutoSignalTask(task));
  return sortTasks([...storedTasks, ...buildAutoTasks()]);
}

function getSkuControlTasks(articleKey) {
  return sortTasks(getAllTasks().filter((task) => task.articleKey === articleKey));
}

function nextTaskForSku(articleKey) {
  const tasks = getSkuControlTasks(articleKey);
  return tasks.find(isTaskActive) || tasks[0] || null;
}

function getControlSnapshot() {
  const tasks = getAllTasks();
  const active = tasks.filter(isTaskActive);
  const overdue = active.filter(isTaskOverdue);
  const waitingRop = active.filter((task) => task.status === 'waiting_rop');
  const waitingDecision = active.filter((task) => task.status === 'waiting_decision');
  const noOwner = active.filter((task) => !task.owner);
  const dueThisWeek = active.filter((task) => task.due && task.due <= plusDays(7));
  const ownerMap = new Map();

  for (const task of active) {
    const key = task.owner || 'Без owner';
    const row = ownerMap.get(key) || { owner: key, total: 0, overdue: 0, critical: 0, waiting: 0, waitingRop: 0, waitingDecision: 0 };
    row.total += 1;
    if (isTaskOverdue(task)) row.overdue += 1;
    if (task.priority === 'critical') row.critical += 1;
    if (task.status === 'waiting_rop') row.waitingRop += 1;
    if (task.status === 'waiting_decision') row.waitingDecision += 1;
    row.waiting = row.waitingRop + row.waitingDecision;
    ownerMap.set(key, row);
  }

  return {
    tasks,
    active,
    overdue,
    waitingRop,
    waitingDecision,
    noOwner,
    dueThisWeek,
    byOwner: [...ownerMap.values()].sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner, 'ru')),
    todayList: sortTasks(active).filter((task) => isTaskOverdue(task) || task.status === 'waiting_rop' || task.status === 'waiting_decision' || task.priority === 'critical' || (task.due && task.due <= plusDays(2))).slice(0, 12),
    autoCount: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length,
    manualCount: tasks.filter((task) => task.source !== 'auto' && isTaskActive(task)).length
  };
}
