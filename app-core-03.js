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

    if ((cfg.supabase.auth || 'anonymous') === 'anonymous') {
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
    reason: task.reason || '',
    owner: task.owner || '',
    due: task.due || null,
    status: task.status,
    type: task.type,
    priority: task.priority,
    platform: task.platform,
    source: task.source,
    entity_label: task.entityLabel || '',
    auto_code: task.autoCode || '',
    created_at: task.createdAt || new Date().toISOString()
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
    createdAt: row.created_at
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
      : []
  };
}

function applyRepricerControlsPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  state.storage.repricerSettings = normalizeRepricerSettings(payload.settings || payload.repricerSettings || {});
  state.storage.repricerSettingsUpdatedAt = String(payload.settingsUpdatedAt || '').trim();
  state.storage.repricerOverrides = Array.isArray(payload.overrides || payload.repricerOverrides)
    ? (payload.overrides || payload.repricerOverrides).map(normalizeRepricerOverride).filter((item) => item.articleKey)
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
  saveLocalStorage();
  return true;
}

function repricerControlsStamp(value) {
  if (!value) return 0;
  const stamp = Date.parse(String(value));
  return Number.isFinite(stamp) ? stamp : 0;
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
    corridorDeletes: mergeRepricerDeleteTombstones(remote.corridorDeletes || remote.repricerCorridorDeletes, local.corridorDeletes || local.repricerCorridorDeletes, true)
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

async function persistRepricerControls() {
  if (!hasRemoteStore()) return;
  const localPayload = buildRepricerControlsPayload();
  const remotePayload = await queryRemoteRepricerControls();
  const payload = mergeRepricerControlsPayload(remotePayload, localPayload);
  applyRepricerControlsPayload(payload);
  await upsertRemote(PORTAL_SNAPSHOT_TABLE, [{
    brand: currentBrand(),
    snapshot_key: REPRICER_CONTROLS_SNAPSHOT_KEY,
    payload,
    payload_hash: hashString(JSON.stringify(payload)),
    source: 'portal-managed-repricer',
    generated_at: payload.generatedAt
  }], 'brand,snapshot_key');
  if (typeof resetPortalSnapshotState === 'function') resetPortalSnapshotState();
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Репрайсер синхронизирован · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

function teamRestConfig() {
  const cfg = currentConfig();
  if (!cfg.supabase?.url || !cfg.supabase?.anonKey || typeof fetch !== 'function') return null;
  const baseUrl = String(cfg.supabase.url || '').replace(/\/+$/, '');
  return {
    baseUrl,
    anonKey: cfg.supabase.anonKey,
    accessToken: state.team.accessToken || '',
    brand: currentBrand()
  };
}

async function readSupabaseJson(response, label) {
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`${label}: ${bodyText || response.status || 'request failed'}`);
  }
  return bodyText ? JSON.parse(bodyText) : [];
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
  if (window.supabase?.createClient) {
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
    return {
      access_token: response?.data?.session?.access_token || '',
      user: response?.data?.user || null
    };
  }
  return signInTeamViaRest();
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
      this.prefer = 'resolution=merge-duplicates,return=representation';
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

async function queryRemote(table) {
  if (!hasRemoteStore()) return [];
  const isTaskTable = table === TEAM_TABLES.tasks;
  if (state.team.accessToken) {
    const cfg = teamRestConfig();
    if (!cfg) return [];
    const url = new URL(`${cfg.baseUrl}/rest/v1/${table}`);
    url.searchParams.set('brand', `eq.${cfg.brand}`);
    if (isTaskTable) {
      url.searchParams.set('select', 'id,article_key,title,next_action,reason,owner,due,status,type,priority,platform,source,entity_label,auto_code,created_at,updated_at');
      url.searchParams.set('status', 'in.(new,in_progress,waiting_team,waiting_rop,waiting_decision)');
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
        .in('status', ['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision'])
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

  if (state.team.accessToken) {
    const cfg = teamRestConfig();
    if (!cfg) return 0;
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
  if (state.team.accessToken) {
    const cfg = teamRestConfig();
    if (!cfg) return;
    const url = new URL(`${cfg.baseUrl}/rest/v1/${table}`);
    url.searchParams.set('on_conflict', onConflict);
    const response = await withTimeout(fetch(url.toString(), {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(rows)
    }), 8000, `Синхронизация ${table}`);
    await readSupabaseJson(response, `Синхронизация ${table}`);
    return;
  }
  const response = await withTimeout(
    state.team.client.from(table).upsert(rows, { onConflict }),
    8000,
    `Синхронизация ${table}`
  );
  if (response.error) throw response.error;
}

async function pullRemoteState(rerender = true) {
  if (!hasRemoteStore()) return;
  try {
    state.team.mode = 'pending';
    state.team.note = 'Загружаем командные данные…';
    updateSyncBadge();
    const taskRows = await queryRemote(TEAM_TABLES.tasks);
    const [commentResult, decisionResult, ownerResult, repricerControlsResult] = await Promise.allSettled([
      queryRemote(TEAM_TABLES.comments),
      queryRemote(TEAM_TABLES.decisions),
      queryRemote(TEAM_TABLES.owners),
      queryRemoteRepricerControls()
    ]);
    const manualTaskRows = taskRows.filter((row) => row?.source !== 'auto');
    const staleAutoTaskRows = taskRows.filter((row) => row?.source === 'auto');
    const commentRows = commentResult.status === 'fulfilled' ? (commentResult.value || []) : [];
    const decisionRows = decisionResult.status === 'fulfilled' ? (decisionResult.value || []) : [];
    const ownerRows = ownerResult.status === 'fulfilled' ? (ownerResult.value || []) : [];
    const repricerControls = repricerControlsResult.status === 'fulfilled' ? (repricerControlsResult.value || null) : null;
    const softErrors = [commentResult, decisionResult, ownerResult, repricerControlsResult]
      .filter((result) => result.status !== 'fulfilled')
      .map((result) => result.reason?.message || String(result.reason || 'Неизвестная ошибка'))
      .filter(Boolean);
    let autoCleanupCount = 0;
    if (staleAutoTaskRows.length) {
      try {
        autoCleanupCount = await purgeRemoteAutoTasks(staleAutoTaskRows);
      } catch (error) {
        softErrors.push(error?.message || String(error));
      }
    }
    const remoteEmpty = !manualTaskRows.length && !commentRows.length && !decisionRows.length && !ownerRows.length && !repricerControls;
    if (!remoteEmpty) {
      state.storage.tasks = normalizeStorageTasks(manualTaskRows.map(fromRemoteTask), 'manual');
      state.storage.comments = commentRows.map(fromRemoteComment);
      state.storage.decisions = decisionRows.map(fromRemoteDecision);
      state.storage.ownerOverrides = ownerRows.map(fromRemoteOwner);
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
    await Promise.all([
      upsertRemote(TEAM_TABLES.tasks, (state.storage.tasks || []).map(remoteTaskRow), 'id'),
      upsertRemote(TEAM_TABLES.comments, (state.storage.comments || []).map(remoteCommentRow), 'id'),
      upsertRemote(TEAM_TABLES.decisions, (state.storage.decisions || []).map(remoteDecisionRow), 'id'),
      upsertRemote(TEAM_TABLES.owners, (state.storage.ownerOverrides || []).map(remoteOwnerRow), 'brand,article_key'),
      persistRepricerControls()
    ]);
    state.team.mode = 'ready';
    state.team.lastSyncAt = new Date().toISOString();
    state.team.note = `Данные отправлены в Supabase · ${fmt.date(state.team.lastSyncAt)}`;
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
    const hay = [task.title, task.nextAction, task.reason, task.owner, task.articleKey, sku?.article, sku?.name, sku?.category, workstream.label, workstream.chip].filter(Boolean).join(' ').toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (f.owner !== 'all' && (task.owner || 'Без ответственного') !== f.owner) return false;
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
      ${task.reason ? `<div class="muted small">${escapeHtml(task.reason)}</div>` : ''}
      ${task.nextAction ? `<div><strong class="small">Следующее действие</strong><div class="muted small" style="margin-top:4px">${escapeHtml(task.nextAction)}</div></div>` : ''}
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
