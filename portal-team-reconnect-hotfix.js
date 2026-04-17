(function () {
  if (window.__ALTEA_TEAM_RECONNECT_HOTFIX_20260417P__) return;
  window.__ALTEA_TEAM_RECONNECT_HOTFIX_20260417P__ = true;

  const SNAPSHOT_PARTS = [
    'data/team_state.b64.part1.txt?v=20260417n',
    'data/team_state.b64.part2.txt?v=20260417n',
    'data/team_state.b64.part3.txt?v=20260417n',
    'data/team_state.b64.part4.txt?v=20260417n'
  ];
  let reconnectInFlight = false;

  function appState() {
    return typeof state === 'object' && state ? state : null;
  }

  function fmtDate(value) {
    try {
      if (typeof fmt?.date === 'function') return fmt.date(value);
    } catch {}
    try {
      return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(value || '');
    }
  }

  function canUseRemote() {
    try {
      const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
      return Boolean(cfg?.teamMode === 'supabase' && cfg?.supabase?.url && cfg?.supabase?.anonKey);
    } catch {
      return false;
    }
  }

  function shouldReconnect() {
    const app = appState();
    if (!app?.team || !app?.boot) return false;
    if (!canUseRemote()) return false;
    if (!app.boot.dataReady) return false;
    if (app.team.mode === 'ready') return false;
    if (app.team.mode === 'pending' && !app.team.error && app.team.accessToken) return false;
    return true;
  }

  function ensureSnapshotBadge(payload) {
    const app = appState();
    if (!app?.team || !payload) return false;
    app.teamBridge = {
      source: payload.source || 'portal-snapshot',
      generatedAt: payload.generatedAt || '',
      counts: payload.counts || {}
    };
    app.team.mode = 'local';
    app.team.ready = false;
    app.team.error = '';
    app.team.note = payload.generatedAt
      ? `\u041a\u043e\u043c\u0430\u043d\u0434\u043d\u0430\u044f \u0431\u0430\u0437\u0430 \u0447\u0435\u0440\u0435\u0437 \u043f\u043e\u0440\u0442\u0430\u043b \u00b7 ${fmtDate(payload.generatedAt)}`
      : '\u041a\u043e\u043c\u0430\u043d\u0434\u043d\u0430\u044f \u0431\u0430\u0437\u0430 \u0447\u0435\u0440\u0435\u0437 \u043f\u043e\u0440\u0442\u0430\u043b';
    window.__ALTEA_TEAM_JSON_BRIDGE_READY__ = true;
    return true;
  }

  async function fetchTextWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`snapshot ${response.status || 'request failed'}`);
      return response.text();
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function loadPortalSnapshot() {
    const parts = [];
    for (const url of SNAPSHOT_PARTS) {
      parts.push(await fetchTextWithTimeout(url, 8000));
    }
    const binary = window.atob(parts.join('').trim());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  }

  function applyPortalSnapshot(payload) {
    const app = appState();
    if (!app?.team || !payload) return false;
    const hasArrays = ['tasks', 'comments', 'decisions', 'ownerOverrides']
      .some((key) => Array.isArray(payload[key]) && payload[key].length >= 0);
    if (!hasArrays) return false;

    ensureSnapshotBadge(payload);

    if (typeof mergeImportedStorage === 'function') {
      mergeImportedStorage(payload);
    } else {
      app.storage = app.storage || {};
      app.storage.tasks = Array.isArray(payload.tasks) ? payload.tasks.slice() : [];
      app.storage.comments = Array.isArray(payload.comments) ? payload.comments.slice() : [];
      app.storage.decisions = Array.isArray(payload.decisions) ? payload.decisions.slice() : [];
      app.storage.ownerOverrides = Array.isArray(payload.ownerOverrides) ? payload.ownerOverrides.slice() : [];
      if (typeof saveLocalStorage === 'function') saveLocalStorage();
    }

    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
    return true;
  }

  async function loadPortalSnapshotIntoState() {
    try {
      if (typeof hasRemoteStore === 'function' && hasRemoteStore()) return false;
      const payload = await loadPortalSnapshot();
      const applied = applyPortalSnapshot(payload);
      if (!applied) {
        ensureSnapshotBadge(payload);
        if (typeof updateSyncBadge === 'function') updateSyncBadge();
      }
      return applied;
    } catch (error) {
      console.warn('[portal-team-reconnect-hotfix:snapshot]', error);
      return false;
    }
  }

  async function retryTeam(reason = '') {
    const app = appState();
    if (!app?.team || reconnectInFlight || !shouldReconnect()) return;
    reconnectInFlight = true;
    try {
      app.team.error = '';
      app.team.mode = 'pending';
      app.team.note = reason || '\u041f\u043e\u0432\u0442\u043e\u0440\u043d\u043e \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0430\u0435\u043c \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u0443\u044e \u0431\u0430\u0437\u0443\u2026';
      if (typeof updateSyncBadge === 'function') updateSyncBadge();

      if (app.team.accessToken && typeof pullRemoteState === 'function') {
        await pullRemoteState(true);
      } else if (typeof initTeamStore === 'function') {
        await initTeamStore();
        if (app.boot.dataReady && typeof rerenderCurrentView === 'function') {
          rerenderCurrentView();
          if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
        }
      }
    } catch (error) {
      console.warn('[portal-team-reconnect-hotfix]', error);
    } finally {
      reconnectInFlight = false;
    }
  }

  function patchSyncBadgeForSnapshot() {
    if (typeof updateSyncBadge !== 'function') return;
    const original = updateSyncBadge;
    updateSyncBadge = function patchedUpdateSyncBadge() {
      original.apply(this, arguments);
      const app = appState();
      const badge = document.getElementById('syncStatusBadge');
      if (!badge || !app?.teamBridge) return;
      badge.className = 'sync-status ready';
      badge.textContent = app.team?.note || '\u041a\u043e\u043c\u0430\u043d\u0434\u043d\u0430\u044f \u0431\u0430\u0437\u0430 \u0447\u0435\u0440\u0435\u0437 \u043f\u043e\u0440\u0442\u0430\u043b';
    };
  }

  patchSyncBadgeForSnapshot();
  window.__ALTEA_TEAM_JSON_BRIDGE_REFRESH__ = loadPortalSnapshotIntoState;
  [1200, 5200, 12000, 22000].forEach((delay) => {
    window.setTimeout(() => {
      loadPortalSnapshotIntoState().catch((error) => console.warn('[portal-team-reconnect-hotfix:snapshot]', error));
    }, delay);
  });

  [4000, 12000, 22000, 35000].forEach((delay, index) => {
    window.setTimeout(() => {
      retryTeam(index === 0 ? '\u041f\u0435\u0440\u0435\u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0430\u0435\u043c \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u0443\u044e \u0431\u0430\u0437\u0443\u2026' : '\u041f\u043e\u0432\u0442\u043e\u0440\u043d\u043e \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435\u2026');
    }, delay);
  });
})();
