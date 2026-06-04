(function () {
  if (window.__ALTEA_TASK_ATTACHMENT_AUTH_HOTFIX_20260604__) return;
  window.__ALTEA_TASK_ATTACHMENT_AUTH_HOTFIX_20260604__ = true;

  function appState() {
    try {
      if (typeof state === 'object' && state) return state;
    } catch (_) {}
    return window.state || null;
  }

  function config() {
    try {
      return typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
    } catch (_) {
      return window.APP_CONFIG || {};
    }
  }

  function brand() {
    try {
      return typeof currentBrand === 'function' ? currentBrand() : (config().brand || 'Алтея');
    } catch (_) {
      return config().brand || 'Алтея';
    }
  }

  function canUseRemote() {
    const cfg = config();
    return Boolean(cfg?.teamMode === 'supabase' && cfg?.supabase?.url && cfg?.supabase?.anonKey);
  }

  function restConfig() {
    const cfg = config();
    if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey || typeof fetch !== 'function') return null;
    const app = appState();
    return {
      baseUrl: String(cfg.supabase.url || '').replace(/\/+$/, ''),
      anonKey: cfg.supabase.anonKey,
      accessToken: String(app?.team?.accessToken || cfg.supabase.anonKey || ''),
      brand: brand()
    };
  }

  async function readJson(response, label) {
    if (typeof readSupabaseJson === 'function') return readSupabaseJson(response, label);
    const bodyText = await response.text();
    if (!response.ok) throw new Error(`${label}: ${bodyText || response.status || 'request failed'}`);
    return bodyText ? JSON.parse(bodyText) : [];
  }

  function fallbackSession(error) {
    if (error) console.warn('[task-attachment-auth-hotfix] anonymous auth fallback', error);
    return {
      access_token: config()?.supabase?.anonKey || '',
      user: null,
      anon_key_fallback: true
    };
  }

  async function signInAnonymous() {
    const cfg = config();
    if (window.supabase?.createClient && cfg?.supabase?.url && cfg?.supabase?.anonKey) {
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
        return {
          access_token: response?.data?.session?.access_token || '',
          user: response?.data?.user || null
        };
      } catch (error) {
        return fallbackSession(error);
      }
    }
    try {
      const cfgRest = restConfig();
      if (!cfgRest) return fallbackSession();
      const response = await fetch(`${cfgRest.baseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          apikey: cfgRest.anonKey,
          Authorization: `Bearer ${cfgRest.anonKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      return readJson(response, 'Анонимный вход Supabase');
    } catch (error) {
      return fallbackSession(error);
    }
  }

  function hasRemote() {
    const app = appState();
    return Boolean(app?.team?.ready && (app.team.accessToken || app.team.client || canUseRemote()));
  }

  const originalInitTeamStore = typeof initTeamStore === 'function' ? initTeamStore : null;
  const originalQueryRemote = typeof queryRemote === 'function' ? queryRemote : null;
  const originalUpsertRemote = typeof upsertRemote === 'function' ? upsertRemote : null;

  async function initTeamStorePatched(...args) {
    if (!canUseRemote()) {
      return originalInitTeamStore ? originalInitTeamStore.apply(this, args) : undefined;
    }
    const app = appState();
    try {
      if (originalInitTeamStore) await originalInitTeamStore.apply(this, args);
    } catch (error) {
      console.warn('[task-attachment-auth-hotfix] init retry', error);
    }
    const cfg = restConfig();
    if (app?.team && cfg?.anonKey && (!app.team.ready || !app.team.accessToken)) {
      app.team.accessToken = app.team.accessToken || cfg.anonKey;
      app.team.ready = true;
      app.team.mode = 'ready';
      app.team.error = '';
      app.team.note = app.team.note || 'Командная база подключена';
      if (typeof updateSyncBadge === 'function') updateSyncBadge();
    }
  }

  async function queryRemotePatched(table) {
    const cfg = restConfig();
    if (!cfg?.accessToken) return originalQueryRemote ? originalQueryRemote(table) : [];
    const isTaskTable = table === TEAM_TABLES.tasks;
    const isAttachmentTable = table === TEAM_TABLES.attachments;
    const url = new URL(`${cfg.baseUrl}/rest/v1/${table}`);
    url.searchParams.set('brand', `eq.${cfg.brand}`);
    if (isTaskTable) {
      url.searchParams.set('select', 'id,article_key,title,next_action,reason,owner,due,status,type,priority,platform,source,entity_label,auto_code,created_at,updated_at');
    } else if (isAttachmentTable) {
      url.searchParams.set('select', 'id,task_id,article_key,file_name,mime_type,file_size,bucket_name,object_path,public_url,created_at,created_by,updated_at');
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

  async function upsertRemotePatched(table, rows, onConflict) {
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) return;
    const cfg = restConfig();
    if (!cfg?.accessToken) return originalUpsertRemote ? originalUpsertRemote(table, rows, onConflict) : undefined;
    const url = new URL(`${cfg.baseUrl}/rest/v1/${table}`);
    url.searchParams.set('on_conflict', onConflict);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(items)
    });
    await readJson(response, `Синхронизация ${table}`);
  }

  function assign(name, value) {
    window[name] = value;
    try {
      eval(`${name} = window.${name}`);
    } catch (error) {
      console.warn('[task-attachment-auth-hotfix] bind', name, error);
    }
  }

  assign('teamRestConfig', restConfig);
  assign('signInTeamAnonymously', signInAnonymous);
  assign('hasRemoteStore', hasRemote);
  assign('queryRemote', queryRemotePatched);
  assign('upsertRemote', upsertRemotePatched);
  assign('initTeamStore', initTeamStorePatched);

  window.setTimeout(() => {
    const app = appState();
    const cfg = restConfig();
    if (app?.team && cfg?.anonKey && canUseRemote() && (!app.team.ready || !app.team.accessToken)) {
      app.team.accessToken = app.team.accessToken || cfg.anonKey;
      app.team.ready = true;
      app.team.mode = 'ready';
      if (typeof updateSyncBadge === 'function') updateSyncBadge();
    }
  }, 0);
})();