(function () {
  if (window.__ALTEA_TEAM_RUNTIME_HOTFIX_20260417J__) return;
  window.__ALTEA_TEAM_RUNTIME_HOTFIX_20260417J__ = true;

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

  async function signInViaRestHotfix() {
    const cfg = restConfig();
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
    return readJson(response, 'Анонимный вход Supabase');
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
      const response = await client.auth.signInAnonymously();
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
        url.searchParams.set('status', 'in.(new,in_progress,waiting_team,waiting_decision)');
      } else {
        url.searchParams.set('select', '*');
      }
      const response = await fetch(url.toString(), {
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.accessToken}`,
          Accept: 'application/json'
        }
      });
      return readJson(response, `Запрос ${table}`);
    }
    if (!app?.team?.client?.from) return [];
    const query = isTaskTable
      ? app.team.client
          .from(table)
          .select('id,article_key,title,next_action,reason,owner,due,status,type,priority,platform,source,entity_label,auto_code,created_at,updated_at')
          .eq('brand', currentBrandSafe())
          .in('status', ['new', 'in_progress', 'waiting_team', 'waiting_decision'])
      : app.team.client.from(table).select('*').eq('brand', currentBrandSafe());
    const response = await query;
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
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(rows)
      });
      await readJson(response, `Синхронизация ${table}`);
      return;
    }
    if (!app?.team?.client?.from) return;
    const response = await app.team.client.from(table).upsert(rows, { onConflict });
    if (response?.error) throw response.error;
  }

  async function pullRemoteStateHotfix(rerender = true) {
    if (!hasRemoteStoreHotfix()) return null;
    const app = appState();
    if (!app?.team) return null;
    try {
      app.team.mode = 'pending';
      app.team.note = 'Загружаем командные данные…';
      app.team.error = '';
      if (typeof updateSyncBadge === 'function') updateSyncBadge();

      const taskRows = await queryRemoteHotfix(TABLES.tasks);
      const [commentResult, decisionResult, ownerResult] = await Promise.allSettled([
        queryRemoteHotfix(TABLES.comments),
        queryRemoteHotfix(TABLES.decisions),
        queryRemoteHotfix(TABLES.owners)
      ]);

      const commentRows = commentResult.status === 'fulfilled' ? (commentResult.value || []) : [];
      const decisionRows = decisionResult.status === 'fulfilled' ? (decisionResult.value || []) : [];
      const ownerRows = ownerResult.status === 'fulfilled' ? (ownerResult.value || []) : [];
      const softErrors = [commentResult, decisionResult, ownerResult]
        .filter((result) => result.status !== 'fulfilled')
        .map((result) => result.reason?.message || String(result.reason || 'Неизвестная ошибка'))
        .filter(Boolean);
      const remoteEmpty = !taskRows.length && !commentRows.length && !decisionRows.length && !ownerRows.length;

      if (!remoteEmpty) {
        app.storage.tasks = typeof normalizeStorageTasks === 'function'
          ? normalizeStorageTasks(taskRows.map(fromRemoteTask), 'manual')
          : taskRows.map(fromRemoteTask);
        app.storage.comments = commentRows.map(fromRemoteComment);
        app.storage.decisions = decisionRows.map(fromRemoteDecision);
        app.storage.ownerOverrides = ownerRows.map(fromRemoteOwner);
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
      if ((cfg.supabase?.auth || 'anonymous') === 'anonymous') {
        const signIn = await signInAnonymouslyHotfix();
        app.team.accessToken = signIn?.access_token || '';
        app.team.userId = signIn?.user?.id || '';
        if (!app.team.accessToken) throw new Error('Supabase не вернул access token');
      } else {
        if (!window.supabase?.createClient) throw new Error('Supabase client не загрузился');
        app.team.client = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: 'altea-team-store'
          }
        });
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
  assignGlobal('initTeamStore', initTeamStoreHotfix);

  window.setTimeout(() => {
    const app = appState();
    if (!app?.boot?.dataReady || !canUseRemote()) return;
    if (app.team?.mode === 'ready') return;
    initTeamStoreHotfix().then(() => {
      if (typeof rerenderCurrentView === 'function') {
        rerenderCurrentView();
        if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
      }
    }).catch((error) => console.warn('[portal-team-runtime-hotfix]', error));
  }, 1800);
})();
