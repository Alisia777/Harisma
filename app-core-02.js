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

function normalizePortalStorageSnapshot(source = {}) {
  const parsed = source && typeof source === 'object' ? source : {};
  const defaults = defaultStorage();
  return {
    ...defaults,
    comments: Array.isArray(parsed.comments) ? parsed.comments.map(normalizeComment) : [],
    tasks: Array.isArray(parsed.tasks) ? normalizeStorageTasks(parsed.tasks, 'manual') : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizeDecision) : [],
    ownerOverrides: Array.isArray(parsed.ownerOverrides) ? parsed.ownerOverrides.map(normalizeOwnerOverride) : [],
    productLifecycleOverrides: Array.isArray(parsed.productLifecycleOverrides) ? parsed.productLifecycleOverrides.map(normalizeProductLifecycleOverride).filter((item) => item.articleKey) : [],
    taskAttachments: Array.isArray(parsed.taskAttachments) ? parsed.taskAttachments.map(normalizeTaskAttachment).filter((item) => item.taskId && item.objectPath) : [],
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

const STORAGE_HISTORY_KEY = `${STORAGE_KEY}-history-v1`;
const STORAGE_HISTORY_LIMIT = 16;

function portalStorageHistoryPayload(source = {}) {
  const snapshot = normalizePortalStorageSnapshot(source);
  return {
    comments: snapshot.comments,
    tasks: snapshot.tasks,
    decisions: snapshot.decisions,
    ownerOverrides: snapshot.ownerOverrides,
    productLifecycleOverrides: snapshot.productLifecycleOverrides,
    taskAttachments: snapshot.taskAttachments,
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
    taskAttachments: Array.isArray(payload.taskAttachments) ? payload.taskAttachments.length : 0,
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

function skuLookupToken(value = '') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

function skuLookupValues(sku = {}) {
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
  return [
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
}

function skuPrimaryKey(sku, fallback = '') {
  return String(sku?.articleKey || sku?.article || fallback || '').trim();
}

function getSku(articleKey) {
  const rawKey = String(articleKey ?? '').trim();
  if (!rawKey) return null;

  const exact = state.skus.find((sku) => skuLookupValues(sku).some((value) => String(value ?? '').trim() === rawKey));
  if (exact) return exact;

  const lookupKey = skuLookupToken(rawKey);
  if (!lookupKey) return null;

  return state.skus.find((sku) => skuLookupValues(sku).some((value) => skuLookupToken(value) === lookupKey)) || null;
}

function ownerName(sku) {
  const localOwner = canonicalOwnerName(sku?.owner?.name || '');
  return localOwner || skuMatrixOwnerName(sku, '');
}

function taskPlatformOwnerName(sku, platform = '', fallback = '') {
  const normalizedPlatform = normalizeTaskPlatform(platform || '');
  if (sku && ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'].includes(normalizedPlatform) && typeof platformOwnerName === 'function') {
    const marketplaceOwner = canonicalOwnerName(platformOwnerName(sku, normalizedPlatform) || '');
    if (marketplaceOwner) return marketplaceOwner;
  }
  return canonicalOwnerName(fallback || ownerName(sku) || '');
}

function ownerOptions() {
  const pool = new Set();
  const addOwner = (value) => {
    const normalized = canonicalOwnerName(value || '');
    if (normalized) pool.add(normalized);
  };
  if (typeof OWNER_CANONICAL_NAMES !== 'undefined') {
    for (const name of OWNER_CANONICAL_NAMES.values()) addOwner(name);
  }
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
  for (const task of state.storage.tasks || []) {
    addOwner(task.owner);
    addOwner(task.coOwner);
  }
  addOwner(state.team.member?.name);
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

function getTaskHistory(taskId) {
  return (state.storage.comments || [])
    .map((comment) => {
      const parsed = parseTaskLogComment(comment);
      return parsed && parsed.taskId === taskId ? { ...comment, kind: parsed.kind, text: parsed.text } : null;
    })
    .filter(Boolean)
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
  const source = task?.source || sourceHint;
  const platform = detectTaskPlatform(task, sku);
  const currentMatrixOwner = taskPlatformOwnerName(sku, platform, ownerName(sku));
  const explicitOwner = canonicalOwnerName(task?.owner || task?.ownerName || '');
  const resolvedOwner = source === 'auto'
    ? (currentMatrixOwner || explicitOwner)
    : (explicitOwner || currentMatrixOwner);
  const coOwner = canonicalOwnerName(
    task?.coOwner
    || task?.co_owner
    || task?.secondaryOwner
    || task?.secondary_owner
    || task?.collaborator
    || parsedReason.coOwner
    || ''
  );
  return {
    id: task?.id || stableId(sourceHint === 'auto' ? 'auto' : 'task', `${task?.articleKey || ''}|${title}|${task?.due || ''}|${createdAt}|${sourceHint}`),
    source,
    articleKey: task?.articleKey || '',
    title,
    nextAction: task?.nextAction || '',
    reason: parsedReason.reason,
    owner: resolvedOwner,
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

function normalizeStorageTasks(tasks, sourceHint = 'manual') {
  return (tasks || [])
    .map((task) => normalizeTask(task, task?.source || sourceHint))
    .filter((task) => !isNonPersistentTaskSource(task?.source));
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
  priceDropPct: 0.15,
  revenueDropPct: 0.20,
  aovDropPct: 0.20,
  returnsGrowthPct: 0.20,
  conversionDropPct: 0.10,
  profitabilityDropPct: 0.25,
  minRecentOrders: 10,
  minPriceRecentOrders: 80,
  minBaseOrders: 50,
  minBaseRevenueDay: 30000,
  minRevenueLossDay: 30000,
  minReturnsCurrent: 20,
  minReturnsBaseline: 10,
  minReturnsDelta: 8,
  minKzClicks: 700,
  minKzRevenue: 50000,
  minKzSpend: 30000,
  totalLimit: 18,
  launchLimit: 5,
  familyLimits: {
    stock: 10,
    price: 3,
    sales: 4,
    kz: 5,
    aov: 1,
    returns: 2
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

function autoSignalOwner(sku, platform = '', fallback = '') {
  const normalizedPlatform = normalizeTaskPlatform(platform || '');
  if (['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'].includes(normalizedPlatform)) {
    return taskPlatformOwnerName(sku, normalizedPlatform, fallback);
  }
  return canonicalOwnerName(fallback || ownerName(sku) || '');
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

function autoSignalIssueKey(platform, articleKey) {
  return `${normalizeTaskPlatform(platform || 'all')}|${String(articleKey || '').trim().toLowerCase()}`;
}

function autoSignalActiveStockKeys() {
  const rows = Array.isArray(state.oosControl?.rows) ? state.oosControl.rows : [];
  return new Set(rows
    .filter((row) => row?.articleKey || row?.article)
    .filter((row) => row.status === 'oos' || autoSignalFinite(row.turnoverDays, Number.POSITIVE_INFINITY) <= AUTO_SIGNAL_RULES.stockDays)
    .map((row) => autoSignalIssueKey(row.platform, row.articleKey || row.article)));
}

function buildStockAutoSignalCandidates() {
  const rows = Array.isArray(state.oosControl?.rows) ? state.oosControl.rows : [];
  return rows.map((row) => {
    const sku = getSku(row.articleKey || row.article);
    if (!autoSignalSkuAllowed(sku)) return null;
    const platform = normalizeTaskPlatform(row.platform || 'all');
    const platformLabel = row.platformLabel || autoSignalPlatformLabel(platform);
    const days = autoSignalFinite(row.turnoverDays, NaN);
    const clusters = Math.max(1, Math.round(autoSignalFinite(row.clusterCount || 1, 1)));
    const places = Array.isArray(row.placesAtRisk)
      ? row.placesAtRisk.map((item) => item.place).filter(Boolean).slice(0, 4).join(', ')
      : row.place;
    const isOos = row.status === 'oos';
    const clusterLabel = `${clusters} ${clusters === 1 ? 'кластер' : 'кластеров'}`;
    return {
      family: 'stock',
      dedupeKey: `${row.articleKey || row.article}|stock|${platform}`,
      articleKey: row.articleKey || row.article,
      taskType: 'supply',
      platform,
      priority: isOos ? 'critical' : 'high',
      score: 1000 + autoSignalFinite(row.revenueAtRiskDay) / 100000,
      task: {
        id: stableId('auto-stock-v2', row.issueKey || `${platform}|${row.articleKey}`),
        source: 'auto',
        autoCode: 'stock_quality_v2',
        articleKey: row.articleKey || row.article,
        title: isOos
          ? `${platformLabel}: OOS по SKU`
          : `${platformLabel}: ${clusterLabel} <${AUTO_SIGNAL_RULES.stockDays} дней`,
        nextAction: row.recommendation || `Проверить поставку и закрыть кластеры с покрытием меньше ${AUTO_SIGNAL_RULES.stockDays} дней.`,
        reason: [
          `${platformLabel}: ${row.statusLabel || 'риск OOS'}`,
          Number.isFinite(days) ? `покрытие ${autoSignalNum(days, 1)} д.` : '',
          clusterLabel,
          places ? `кластеры: ${places}` : '',
          `риск выручки ${autoSignalMoney(row.revenueAtRiskDay || 0)}/день`
        ].filter(Boolean).join(' · '),
        owner: autoSignalOwner(sku, platform),
        due: autoSignalTaskDue(isOos ? 'critical' : 'high'),
        status: 'new',
        type: 'supply',
        priority: isOos ? 'critical' : 'high',
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
    if (priceDrop >= AUTO_SIGNAL_RULES.priceDropPct && recentOrders7 >= AUTO_SIGNAL_RULES.minPriceRecentOrders) {
      const priority = priceDrop >= 0.25 ? 'critical' : 'high';
      const priceDropLabel = autoSignalPct(priceDrop);
      candidates.push({
        family: 'price',
        dedupeKey: articleKey,
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
          owner: autoSignalOwner(sku, platform),
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
    const stockAlreadyExplainsSales = activeStockKeys.has(autoSignalIssueKey(platform, articleKey));
    if (
      !stockAlreadyExplainsSales
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
        dedupeKey: articleKey,
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
          owner: autoSignalOwner(sku, platform),
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
      base.length >= 5
      && baseOrders >= AUTO_SIGNAL_RULES.minBaseOrders
      && recentOrders >= AUTO_SIGNAL_RULES.minRecentOrders
      && aovDrop >= AUTO_SIGNAL_RULES.aovDropPct
    ) {
      const priority = aovDrop >= 0.30 ? 'high' : 'medium';
      candidates.push({
        family: 'aov',
        dedupeKey: articleKey,
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
          owner: autoSignalOwner(sku, platform),
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
      dedupeKey: articleKey,
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
        owner: autoSignalOwner(sku, platform),
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
      dedupeKey: articleKey,
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
        owner: autoSignalOwner(sku, 'wb'),
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
  const familyCounts = {};
  const sorted = candidates.slice().sort((left, right) =>
    autoSignalFinite(right.score) - autoSignalFinite(left.score)
    || String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru')
  );
  for (const candidate of sorted) {
    const family = candidate.family || 'general';
    const limit = AUTO_SIGNAL_RULES.familyLimits[family] || 6;
    const dedupeKey = candidate.dedupeKey || candidate.articleKey || candidate.task?.id;
    if (!dedupeKey || used.has(dedupeKey)) continue;
    if ((familyCounts[family] || 0) >= limit) continue;
    selected.push(candidate);
    used.add(dedupeKey);
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
    ...buildKzAutoSignalCandidates(leaderboardPayload)
  ]).map((candidate) => {
    const task = candidate.task || {};
    const taskType = task.type || candidate.taskType || 'general';
    const signalKey = `${taskType}:${candidate.family || task.autoCode || 'auto'}:${candidate.platform || task.platform || 'all'}`;
    if (!canRegisterAutoSignalTask(keys, task.articleKey || candidate.articleKey, taskType, signalKey)) return null;
    return normalizeTask(task, 'auto');
  }).filter(Boolean);
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
  const legacyKzAutoTasksEnabled = false;
  const legacySkuFlagAutoTasksEnabled = false;

  for (const sku of state.skus) {
    const articleKey = sku.articleKey;
    const owner = ownerName(sku);
    const platform = sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon ? 'wb+ozon' : sku?.flags?.toWorkWB ? 'wb' : sku?.flags?.toWorkOzon ? 'ozon' : detectTaskPlatform({}, sku);
    const lifecycleKey = String(sku?.productLifecycle?.key || (typeof productLifecycleForSku === 'function' ? productLifecycleForSku(sku)?.key : '') || '').toLowerCase();
    const exitSku = ['exit', 'archived'].includes(lifecycleKey) || /вывод|вывед/.test(String(sku?.status || '').toLowerCase());
    if (exitSku) continue;
    const needsOwnerSignal = !sku?.flags?.assigned && (
      sku?.flags?.toWorkWB
      || sku?.flags?.toWorkOzon
      || sku?.flags?.toWork
      || sku?.flags?.negativeMargin
      || sku?.flags?.lowStock
      || sku?.flags?.highReturn
      || numberOrZero(sku?.focusScore) >= 60
      || monthRevenue(sku) > 0
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

    if (legacySkuFlagAutoTasksEnabled && sku?.flags?.lowStock && !exitSku && canRegisterAutoTask(keys, articleKey, 'supply')) {
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

  const activeLaunchTaskKeys = new Set(
    (state.storage.tasks || [])
      .filter((task) => task?.type === 'launch' && isTaskActive(task))
      .map((task) => `${String(task.articleKey || '').trim()}|${String(task.entityLabel || task.title || '').trim().toLowerCase()}`)
  );
  const launchItems = typeof getLaunchItems === 'function' ? getLaunchItems({ skipTaskLookup: true }) : [];
  const launchCandidates = [];
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
    const dedupeKey = `${String(item?.articleKey || '').trim()}|${String(item?.name || '').trim().toLowerCase()}`;
    if (activeLaunchTaskKeys.has(dedupeKey)) return;
    activeLaunchTaskKeys.add(dedupeKey);
    const blockers = [
      item.owner ? '' : 'нет owner',
      item.articleKey ? '' : 'нет SKU',
      item.presentationUrl ? '' : 'нет презентации'
    ].filter(Boolean);
    const priority = daysUntilLaunch <= 14 || blockers.length >= 2 ? 'high' : 'medium';
    const due = launchGateDate && diffFromTodayInDays(launchGateDate) > 0
      ? launchGateDate
      : daysUntilLaunch <= 14
        ? plusDays(1)
        : daysUntilLaunch <= 30
          ? plusDays(2)
          : plusDays(5);
    launchCandidates.push({
      score: (daysUntilLaunch <= 14 ? 300 : 0)
        + blockers.length * 80
        + Math.max(0, 45 - daysUntilLaunch),
      task: normalizeTask({
      id: `auto-launch-${item.id || item.articleKey || hashString(item.name || launchDate)}`,
      source: 'auto',
      autoCode: 'launch_pipeline',
      articleKey: item.articleKey || '',
      entityLabel: item.name || item.articleKey || 'Новинка',
      title: blockers.length ? 'Новинка: закрыть запусковой блокер' : 'Новинка: финальная проверка запуска',
      nextAction: 'Закрыть самый близкий блокер запуска: owner, SKU, презентация, карточка или Gantt. В задаче оставить конкретный недостающий артефакт и дату, когда он будет готов.',
      reason: [
        item.launchMonth || 'Срок запуска',
        item.status || 'Нужно уточнить статус',
        item.production || '',
        blockers.length ? `блокеры: ${blockers.join(', ')}` : 'критичных блокеров не найдено'
      ].filter(Boolean).join(' · '),
      owner: item.owner || '',
      due,
      status: 'new',
      type: 'launch',
      priority,
      platform: 'product'
    }, 'auto')
    });
  });
  launchCandidates
    .sort((left, right) => autoSignalFinite(right.score) - autoSignalFinite(left.score)
      || String(left.task?.entityLabel || '').localeCompare(String(right.task?.entityLabel || ''), 'ru'))
    .slice(0, AUTO_SIGNAL_RULES.launchLimit)
    .forEach((candidate) => tasks.push(candidate.task));

  return tasks;
  } finally {
    state.__buildingAutoTasks = false;
  }
}

function getAllTasks() {
  const storedTasks = state.storage.tasks
    .filter((task) => !isDeprecatedAutoSignalTask(task))
    .map((task) => normalizeTask(task, task?.source || 'manual'));
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
