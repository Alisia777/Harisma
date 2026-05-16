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
    return {
      comments: Array.isArray(parsed.comments) ? parsed.comments.map(normalizeComment) : [],
      tasks,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizeDecision) : [],
      ownerOverrides: Array.isArray(parsed.ownerOverrides) ? parsed.ownerOverrides.map(normalizeOwnerOverride) : [],
      taskAttachments: Array.isArray(parsed.taskAttachments) ? parsed.taskAttachments.map(normalizeTaskAttachment).filter((item) => item.taskId && item.objectPath) : [],
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
      repricerLastApiReconcile: parsed.repricerLastApiReconcile && typeof parsed.repricerLastApiReconcile === 'object' ? parsed.repricerLastApiReconcile : null
    };
  } catch {
    return defaultStorage();
  }
}

function saveLocalStorage() {
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
      sku.owner = {
        ...baseOwner,
        name: hasAssignedOwner ? assignedOwnerName : '',
        source: hasAssignedOwner ? 'Командное закрепление' : '',
        registryStatus: hasAssignedOwner
          ? (override.ownerRole || baseOwner.registryStatus || '')
          : (override.ownerRole || '')
      };
      sku.flags = sku.flags || {};
      sku.flags.assigned = hasAssignedOwner;
    } else {
      sku.owner = baseOwner;
      sku.flags = sku.flags || {};
      sku.flags.assigned = Boolean(baseOwner?.name);
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
  for (const task of state.storage.tasks || []) addOwner(task.owner);
  addOwner(state.team.member?.name);
  return [...pool].sort((a, b) => a.localeCompare(b, 'ru'));
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
    taskAttachments: Array.isArray(imported.taskAttachments) ? imported.taskAttachments : [],
    launchOverrides: Array.isArray(imported.launchOverrides) ? imported.launchOverrides : [],
    launchDeletedIds: Array.isArray(imported.launchDeletedIds) ? imported.launchDeletedIds : [],
    repricerSettings: imported.repricerSettings || {},
    repricerSettingsUpdatedAt: String(imported.repricerSettingsUpdatedAt || '').trim(),
    repricerOverrides: Array.isArray(imported.repricerOverrides) ? imported.repricerOverrides : [],
    repricerSkuProfiles: Array.isArray(imported.repricerSkuProfiles) ? imported.repricerSkuProfiles : [],
    repricerCorridors: Array.isArray(imported.repricerCorridors) ? imported.repricerCorridors : [],
    repricerOverrideDeletes: Array.isArray(imported.repricerOverrideDeletes) ? imported.repricerOverrideDeletes : [],
    repricerSkuProfileDeletes: Array.isArray(imported.repricerSkuProfileDeletes) ? imported.repricerSkuProfileDeletes : [],
    repricerCorridorDeletes: Array.isArray(imported.repricerCorridorDeletes) ? imported.repricerCorridorDeletes : []
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

function detectMarketplaceNetworkKey(text = '') {
  const raw = String(text || '').toLowerCase();
  if (!raw) return '';
  if (raw.includes('золотое яблоко') || raw.includes('goldapple') || raw.includes('gold apple') || raw.includes('золот')) return 'goldapple';
  if (raw.includes("л'этуаль") || raw.includes('летуаль') || raw.includes('letual') || raw.includes('letu')) return 'letu';
  if (raw.includes('магнит маркет') || raw.includes('магнитмаркет') || raw.includes('магнит') || raw.includes('magnit') || raw.includes('mm')) return 'magnit';
  if (raw.includes('яндекс') || raw.includes('я.маркет') || raw.includes('я маркет') || raw.includes('ям') || raw.includes('ym') || raw.includes('yandex')) return 'ya';
  return '';
}

function normalizeTaskPlatform(value, contextText = '') {
  const raw = String(value || '').trim().toLowerCase();
  const text = `${raw} ${String(contextText || '').trim().toLowerCase()}`;

  if (raw === 'all') return 'all';
  if (['cross', 'common', 'shared', 'general'].includes(raw)) return 'cross';
  if (['wb', 'wildberries', 'вб'].includes(raw)) return 'wb';
  if (['ozon', 'озон'].includes(raw)) return 'ozon';
  if (['wb+ozon', 'wb + ozon', 'wb_ozon', 'wb-ozon'].includes(raw)) return 'wb+ozon';
  if (['ya', 'ym', 'yandex', 'yandex_market', 'yandexmarket', 'ya_market', 'ям', 'я.маркет', 'яндекс'].includes(raw)) return 'ya';
  if (['goldapple', 'ga', 'zya', 'зя'].includes(raw)) return 'goldapple';
  if (['letu', 'letual', 'летуаль'].includes(raw)) return 'letu';
  if (['magnit', 'mm'].includes(raw)) return 'magnit';
  if (['retail', 'federal', 'network', 'marketplaces_plus', 'marketplace_plus'].includes(raw)) return detectMarketplaceNetworkKey(text) || 'ya';
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
  const text = `${task?.title || ''} ${task?.nextAction || ''} ${task?.reason || ''} ${task?.entityLabel || ''}`;
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
  const text = `${task?.title || ''} ${task?.nextAction || ''} ${task?.reason || ''}`.toLowerCase();
  if (task?.platform) return normalizeTaskPlatform(task.platform, text);
  if (/директор|руководител|ceo|executive|эскалац|согласовани/.test(text)) return 'cross';
  if (/продукт|новин|launch|ксюш/.test(text) || task?.type === 'launch') return 'product';
  const marketplace = detectMarketplaceNetworkKey(text);
  if (marketplace) return marketplace;
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
  const createdAt = task?.createdAt || new Date().toISOString();
  return {
    id: task?.id || stableId(sourceHint === 'auto' ? 'auto' : 'task', `${task?.articleKey || ''}|${title}|${task?.due || ''}|${createdAt}|${sourceHint}`),
    source: task?.source || sourceHint,
    articleKey: task?.articleKey || '',
    title,
    nextAction: task?.nextAction || '',
    reason: task?.reason || '',
    owner: canonicalOwnerName(task?.owner || ownerName(sku) || ''),
    due: task?.due || plusDays(type === 'assignment' ? 1 : 3),
    status: mapTaskStatus(task?.status),
    type,
    priority,
    platform: detectTaskPlatform(task, sku),
    createdAt,
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

function taskSourceBadge(task) {
  if (task?.source === 'auto') return badge('авто-сигнал', 'info');
  if (task?.source === 'seed') return badge('seed');
  return badge('ручная', 'ok');
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

function ensureTaskModal() {
  let modal = document.getElementById('taskModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'taskModal';
  modal.className = 'modal';
  modal.innerHTML = '<div class="modal-card task-modal-card" id="taskModalBody"></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => {
    if (event.target.id === 'taskModal') closeTaskModal();
  });
  return modal;
}

function storedTaskKeys() {
  return new Set(state.storage.tasks.filter(isTaskActive).map((task) => `${task.articleKey}|${task.type}`));
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

  for (const sku of state.skus) {
    const articleKey = sku.articleKey;
    const owner = ownerName(sku);
    const platform = sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon ? 'wb+ozon' : sku?.flags?.toWorkWB ? 'wb' : sku?.flags?.toWorkOzon ? 'ozon' : detectTaskPlatform({}, sku);
    const exitSku = String(sku?.status || '').toLowerCase().includes('вывод');
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

    if (leaderboardFresh && leaderboardItem?.inPortal !== false) {
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
          nextAction: 'Проверить ROMI, ДРР, цену, оффер и unit-экономику. Зафиксировать, что меняем в карточке или промо.',
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

    if ((sku?.flags?.toWorkWB || sku?.flags?.toWorkOzon || sku?.flags?.toWork) && canRegisterAutoTask(keys, articleKey, 'price_margin')) {
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
    } else if (sku?.flags?.negativeMargin && canRegisterAutoTask(keys, articleKey, 'price_margin')) {
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

    if (sku?.flags?.lowStock && !exitSku && canRegisterAutoTask(keys, articleKey, 'supply')) {
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

    if (needsOwnerSignal && canRegisterAutoTask(keys, articleKey, 'assignment')) {
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

    if (sku?.flags?.highReturn && canRegisterAutoTask(keys, articleKey, 'returns')) {
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
  launchItems.forEach((item) => {
    const launchDate = typeof launchDueDateKey === 'function'
      ? launchDueDateKey(item)
      : launchMonthToDateKey(item?.launchMonth);
    const daysUntilLaunch = diffFromTodayInDays(launchDate);
    const launchGateDate = shiftDateKey(launchDate, -30);
    const statusRaw = String(item?.status || '').toLowerCase();
    if (!launchDate || daysUntilLaunch < -10 || daysUntilLaunch > 45) return;
    if (/запущ|live|продаж|готово/.test(statusRaw)) return;
    const dedupeKey = `${String(item?.articleKey || '').trim()}|${String(item?.name || '').trim().toLowerCase()}`;
    if (activeLaunchTaskKeys.has(dedupeKey)) return;
    activeLaunchTaskKeys.add(dedupeKey);
    tasks.push(normalizeTask({
      id: `auto-launch-${item.id || item.articleKey || hashString(item.name || launchDate)}`,
      source: 'auto',
      autoCode: 'launch_pipeline',
      articleKey: item.articleKey || '',
      entityLabel: item.name || item.articleKey || 'Новинка',
      title: 'Подготовить запуск новинки',
      nextAction: 'Проверить owner, карточку, презентацию, запуск в реестре SKU, gantt и ближайшие блокеры по новинке.',
      reason: [
        item.launchMonth || 'Срок запуска',
        item.status || 'Нужно уточнить статус',
        item.production || '',
        item.articleKey ? 'SKU связано' : 'без SKU',
        item.presentationUrl ? 'материалы есть' : 'без презентации'
      ].filter(Boolean).join(' · '),
      owner: item.owner || '',
      due: launchGateDate && diffFromTodayInDays(launchGateDate) > 0
        ? launchGateDate
        : daysUntilLaunch <= 14
          ? plusDays(1)
          : daysUntilLaunch <= 30
            ? plusDays(2)
            : plusDays(5),
      status: 'new',
      type: 'launch',
      priority: daysUntilLaunch <= 14 ? 'high' : 'medium',
      platform: 'product'
    }, 'auto'));
  });

  return tasks;
  } finally {
    state.__buildingAutoTasks = false;
  }
}

function getAllTasks() {
  return sortTasks([...state.storage.tasks, ...buildAutoTasks()]);
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
