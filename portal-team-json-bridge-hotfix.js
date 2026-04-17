(function () {
  if (window.__ALTEA_TEAM_JSON_BRIDGE_HOTFIX_20260417N__) return;
  window.__ALTEA_TEAM_JSON_BRIDGE_HOTFIX_20260417N__ = true;

  const BRIDGE_URLS = [
    {
      type: 'base64Parts',
      urls: [
        'data/team_state.b64.part1.txt?v=20260417n',
        'data/team_state.b64.part2.txt?v=20260417n',
        'data/team_state.b64.part3.txt?v=20260417n',
        'data/team_state.b64.part4.txt?v=20260417n'
      ]
    },
    { type: 'json', url: 'data/team_state.json?v=20260417l' }
  ];
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
      ? `\u041a\u043e\u043c\u0430\u043d\u0434\u043d\u0430\u044f \u0431\u0430\u0437\u0430 \u0447\u0435\u0440\u0435\u0437 \u043f\u043e\u0440\u0442\u0430\u043b \u00b7 ${fmtDate(generatedAt)}`
      : '\u041a\u043e\u043c\u0430\u043d\u0434\u043d\u0430\u044f \u0431\u0430\u0437\u0430 \u0447\u0435\u0440\u0435\u0437 \u043f\u043e\u0440\u0442\u0430\u043b';
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

  function decodeBase64Json(text) {
    const binary = window.atob(String(text || '').trim());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  }

  async function loadBridge() {
    let lastError = null;
    for (const candidate of BRIDGE_URLS) {
      try {
        if (candidate.type === 'base64Parts') {
          const parts = [];
          for (const url of candidate.urls || []) {
            const partResponse = await fetch(url, { cache: 'no-store' });
            if (!partResponse.ok) throw new Error(`team bridge ${partResponse.status || 'request failed'}`);
            parts.push(await partResponse.text());
          }
          return decodeBase64Json(parts.join(''));
        }
        const response = await fetch(candidate.url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`team bridge ${response.status || 'request failed'}`);
        if (candidate.type === 'base64') return decodeBase64Json(await response.text());
        return response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('team bridge unavailable');
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
        pullBtn.title = '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0437\u0435\u0440\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0441\u043d\u0438\u043c\u043e\u043a \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u043e\u0439 \u0431\u0430\u0437\u044b';
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
