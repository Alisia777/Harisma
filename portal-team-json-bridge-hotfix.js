(function () {
  if (window.__ALTEA_TEAM_JSON_BRIDGE_HOTFIX_20260417L__) return;
  window.__ALTEA_TEAM_JSON_BRIDGE_HOTFIX_20260417L__ = true;

  const BRIDGE_URL = 'data/team_state.json?v=20260417l';
  let bridgeLoaded = false;
  let bridgeRefreshInFlight = false;

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

  function applyBridgeBadge(payload) {
    const app = appState();
    if (!app?.team) return;
    const generatedAt = payload?.generatedAt || '';
    app.team.mode = 'local';
    app.team.ready = false;
    app.team.error = '';
    app.team.note = generatedAt
      ? `Командная база через портал · ${fmtDate(generatedAt)}`
      : 'Командная база через портал';
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  }

  function mergeBridgePayload(payload) {
    const app = appState();
    if (!app || !payload) return false;
    const hasArrays = ['tasks', 'comments', 'decisions', 'ownerOverrides']
      .some((key) => Array.isArray(payload[key]) && payload[key].length >= 0);
    if (!hasArrays) return false;

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

    app.teamBridge = {
      source: payload.source || 'json',
      generatedAt: payload.generatedAt || '',
      counts: payload.counts || {}
    };

    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
    applyBridgeBadge(payload);
    bridgeLoaded = true;
    window.__ALTEA_TEAM_JSON_BRIDGE_READY__ = true;
    return true;
  }

  async function loadBridge() {
    const response = await fetch(BRIDGE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`team bridge ${response.status || 'request failed'}`);
    return response.json();
  }

  async function refreshBridge() {
    if (bridgeRefreshInFlight) return false;
    bridgeRefreshInFlight = true;
    try {
      const payload = await loadBridge();
      return mergeBridgePayload(payload);
    } catch (error) {
      console.warn('[portal-team-json-bridge-hotfix]', error);
      return false;
    } finally {
      bridgeRefreshInFlight = false;
    }
  }

  function patchSyncBadge() {
    if (typeof updateSyncBadge !== 'function') return;
    const original = updateSyncBadge;
    updateSyncBadge = function patchedUpdateSyncBadge() {
      original.apply(this, arguments);
      const pullBtn = document.getElementById('pullRemoteBtn');
      if (pullBtn && bridgeLoaded) {
        pullBtn.disabled = false;
        pullBtn.title = 'Обновить зеркальный снимок командной базы';
      }
    };
  }

  function bindPullButton() {
    const attach = () => {
      const pullBtn = document.getElementById('pullRemoteBtn');
      if (!pullBtn || pullBtn.dataset.teamBridgeBound === '1') return;
      pullBtn.dataset.teamBridgeBound = '1';
      pullBtn.addEventListener('click', () => {
        if (typeof hasRemoteStore === 'function' && hasRemoteStore()) return;
        window.setTimeout(() => {
          refreshBridge().catch((error) => console.warn('[portal-team-json-bridge-hotfix]', error));
        }, 0);
      });
    };
    [80, 600, 1800, 3600].forEach((delay) => window.setTimeout(attach, delay));
  }

  patchSyncBadge();
  bindPullButton();
  [200, 1400, 4200].forEach((delay) => {
    window.setTimeout(() => {
      refreshBridge().catch((error) => console.warn('[portal-team-json-bridge-hotfix]', error));
    }, delay);
  });
})();
