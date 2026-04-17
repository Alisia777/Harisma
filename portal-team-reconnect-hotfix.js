(function () {
  if (window.__ALTEA_TEAM_RECONNECT_HOTFIX_20260417N__) return;
  window.__ALTEA_TEAM_RECONNECT_HOTFIX_20260417N__ = true;

  let reconnectInFlight = false;

  function appState() {
    return typeof state === 'object' && state ? state : null;
  }

  function ensureJsonBridgeScript() {
    if (window.__ALTEA_TEAM_JSON_BRIDGE_SCRIPT_20260417N__) return;
    window.__ALTEA_TEAM_JSON_BRIDGE_SCRIPT_20260417N__ = true;
    const existing = document.querySelector('script[src*="portal-team-json-bridge-hotfix.js"]');
    if (existing) return;
    const script = document.createElement('script');
    script.src = 'portal-team-json-bridge-hotfix.js?v=20260417n';
    script.async = false;
    (document.head || document.body || document.documentElement).appendChild(script);
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

  ensureJsonBridgeScript();
  [120, 1200, 4800].forEach((delay) => {
    window.setTimeout(ensureJsonBridgeScript, delay);
  });

  [4000, 12000, 22000, 35000].forEach((delay, index) => {
    window.setTimeout(() => {
      retryTeam(index === 0 ? '\u041f\u0435\u0440\u0435\u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0430\u0435\u043c \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u0443\u044e \u0431\u0430\u0437\u0443\u2026' : '\u041f\u043e\u0432\u0442\u043e\u0440\u043d\u043e \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435\u2026');
    }, delay);
  });
})();
