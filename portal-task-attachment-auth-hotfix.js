(function () {
  'use strict';

  if (window.__ALTEA_TASK_ATTACHMENT_AUTH_HOTFIX_20260805__) return;
  window.__ALTEA_TASK_ATTACHMENT_AUTH_HOTFIX_20260805__ = true;

  function appState() {
    try {
      if (typeof state === 'object' && state) return state;
    } catch (_) {}
    return window.__alteaAppState || window.state || null;
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

  function authenticatedSession() {
    try {
      if (window.alteaPortalAuthGate && typeof window.alteaPortalAuthGate.getSession === 'function') {
        const session = window.alteaPortalAuthGate.getSession();
        if (session && session.access_token) return session;
      }
    } catch (_) {}
    return window.__ALTEA_AUTH_SESSION__ || null;
  }

  function authenticatedToken() {
    const cfg = config();
    const session = authenticatedSession();
    const token = String(session?.access_token || appState()?.team?.accessToken || '').trim();
    const anonKey = String(cfg?.supabase?.anonKey || '').trim();
    if (!token || token === anonKey || token === 'guest-local-session') return '';
    return token;
  }

  function canUseRemote() {
    const cfg = config();
    return Boolean(
      cfg?.teamMode === 'supabase'
      && cfg?.supabase?.url
      && cfg?.supabase?.anonKey
      && authenticatedToken()
    );
  }

  function restConfig() {
    const cfg = config();
    const accessToken = authenticatedToken();
    if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey || !accessToken || typeof fetch !== 'function') return null;
    return {
      baseUrl: String(cfg.supabase.url || '').replace(/\/+$/, ''),
      anonKey: String(cfg.supabase.anonKey || ''),
      accessToken,
      brand: brand()
    };
  }

  async function readJson(response, label) {
    if (typeof readSupabaseJson === 'function') return readSupabaseJson(response, label);
    const bodyText = await response.text();
    if (!response.ok) throw new Error(`${label}: ${bodyText || response.status || 'request failed'}`);
    return bodyText ? JSON.parse(bodyText) : [];
  }

  async function requireAuthenticatedSession() {
    const session = authenticatedSession();
    if (!session?.access_token || !authenticatedToken()) {
      throw new Error('Анонимный доступ к командной базе отключён. Войдите под корпоративной учётной записью.');
    }
    return session;
  }

  function hasRemote() {
    return Boolean(restConfig());
  }

  const originalInitTeamStore = typeof initTeamStore === 'function' ? initTeamStore : null;
  const originalQueryRemote = typeof queryRemote === 'function' ? queryRemote : null;
  const originalUpsertRemote = typeof upsertRemote === 'function' ? upsertRemote : null;

  function publishAuthenticatedState() {
    const app = appState();
    const cfg = restConfig();
    const session = authenticatedSession();
    if (!app?.team || !cfg?.accessToken || !session?.user) return false;
    app.team.accessToken = cfg.accessToken;
    app.team.userId = String(session.user.id || '').trim();
    app.team.ready = true;
    app.team.mode = 'ready';
    app.team.error = '';
    app.team.note = 'Командная база подключена через защищённую сессию';
    if (session.user.email) {
      app.team.member = {
        ...(app.team.member || {}),
        name: String(session.user.email),
        email: String(session.user.email)
      };
    }
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
    return true;
  }

  async function initTeamStorePatched(...args) {
    await requireAuthenticatedSession();
    if (originalInitTeamStore) {
      try {
        await originalInitTeamStore.apply(this, args);
      } catch (error) {
        console.warn('[task-attachment-auth] original init failed; keeping authenticated REST mode', error);
      }
    }
    if (!publishAuthenticatedState()) {
      throw new Error('Не удалось связать командную базу с авторизованной сессией.');
    }
  }

  async function queryRemotePatched(table) {
    const cfg = restConfig();
    if (!cfg?.accessToken) throw new Error('Командная база доступна только после входа.');
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
      cache: 'no-store',
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
    if (!cfg?.accessToken) throw new Error('Командная база доступна только после входа.');
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
      console.warn('[task-attachment-auth] bind', name, error);
    }
  }

  assign('teamRestConfig', restConfig);
  // Keep the legacy function name for compatibility, but never create an
  // anonymous session. It now returns only the current authenticated session.
  assign('signInTeamAnonymously', requireAuthenticatedSession);
  assign('hasRemoteStore', hasRemote);
  assign('queryRemote', queryRemotePatched);
  assign('upsertRemote', upsertRemotePatched);
  assign('initTeamStore', initTeamStorePatched);

  window.addEventListener('altea:accesschange', publishAuthenticatedState);
  window.setTimeout(publishAuthenticatedState, 0);
})();
