(function () {
  if (window.__ALTEA_TEAM_RECONNECT_HOTFIX_20260417I__) return;
  window.__ALTEA_TEAM_RECONNECT_HOTFIX_20260417I__ = true;

  let reconnectInFlight = false;

  function appState() {
    return typeof state === 'object' && state ? state : null;
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
      app.team.note = reason || 'Повторно подключаем командную базу…';
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

  [4000, 12000, 22000, 35000].forEach((delay, index) => {
    window.setTimeout(() => {
      retryTeam(index === 0 ? 'Переподключаем командную базу…' : 'Повторно загружаем командные данные…');
    }, delay);
  });
})();
