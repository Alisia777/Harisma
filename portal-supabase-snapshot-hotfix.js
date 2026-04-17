(function () {
  if (window.__ALTEA_SUPABASE_SNAPSHOT_HOTFIX_20260417H__) return;
  window.__ALTEA_SUPABASE_SNAPSHOT_HOTFIX_20260417H__ = true;

  const SNAPSHOT_TABLE = 'portal_data_snapshots';
  const SNAPSHOT_KEYS = ['dashboard', 'skus', 'platform_trends', 'logistics'];
  const SNAPSHOT_TO_STATE = {
    dashboard: 'dashboard',
    skus: 'skus',
    platform_trends: 'platformTrends',
    logistics: 'logistics'
  };
  const FALLBACK_CONFIG = {
    brand: 'Алтея',
    supabase: {
      url: 'https://iyckwryrucqrxwlowxow.supabase.co',
      anonKey: 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw'
    }
  };
  let snapshotRefreshInFlight = false;

  function cfg() {
    if (typeof currentConfig === 'function') return currentConfig();
    const raw = window.APP_CONFIG || {};
    return {
      ...FALLBACK_CONFIG,
      ...raw,
      supabase: { ...FALLBACK_CONFIG.supabase, ...(raw.supabase || {}) }
    };
  }

  function brand() {
    if (typeof currentBrand === 'function') return currentBrand();
    return cfg().brand || FALLBACK_CONFIG.brand;
  }

  function clone(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function payloadLooksUsable(snapshotKey, payload) {
    if (payload === null || payload === undefined) return false;
    if (snapshotKey === 'skus') return Array.isArray(payload) && payload.length > 0;
    if (snapshotKey === 'dashboard') return Array.isArray(payload.cards) && payload.cards.length > 0;
    if (snapshotKey === 'platform_trends') return Array.isArray(payload.platforms) && payload.platforms.length > 0;
    if (snapshotKey === 'logistics') {
      return Array.isArray(payload.allRows) && payload.allRows.length > 0
        || Array.isArray(payload.ozonClusters) && payload.ozonClusters.length > 0
        || Array.isArray(payload.wbWarehouses) && payload.wbWarehouses.length > 0;
    }
    return false;
  }

  function normalizeBadge(noteText) {
    if (typeof state !== 'object' || !state || !state.team) return;
    state.team.mode = 'local';
    state.team.ready = false;
    state.team.note = noteText || 'Локальный режим · витрина из Supabase';
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  }

  async function fetchSnapshots() {
    const activeCfg = cfg();
    if (!activeCfg.supabase?.url || !activeCfg.supabase?.anonKey || typeof fetch !== 'function') return;
    if (typeof state === 'object' && state?.team?.mode === 'pending') return [];
    const baseUrl = String(activeCfg.supabase.url || '').replace(/\/+$/, '');
    const url = new URL(`${baseUrl}/rest/v1/${SNAPSHOT_TABLE}`);
    url.searchParams.set('select', 'snapshot_key,payload,updated_at');
    url.searchParams.set('brand', `eq.${brand()}`);
    url.searchParams.set('snapshot_key', `in.(${SNAPSHOT_KEYS.join(',')})`);
    const request = fetch(url.toString(), {
      headers: {
        apikey: activeCfg.supabase.anonKey,
        Authorization: `Bearer ${activeCfg.supabase.anonKey}`,
        Accept: 'application/json'
      }
    });
    const response = typeof withTimeout === 'function'
      ? await withTimeout(request, 5000, 'Витрина Supabase')
      : await request;
    if (!response?.ok) throw new Error(`Supabase snapshots ${response?.status || 'request failed'}`);
    return typeof withTimeout === 'function'
      ? await withTimeout(response.json(), 5000, 'Чтение витрины Supabase')
      : await response.json();
  }

  function applySnapshots(rows) {
    if (typeof state !== 'object' || !state || !Array.isArray(rows) || !rows.length) return false;
    let applied = false;
    for (const row of rows) {
      const target = SNAPSHOT_TO_STATE[row?.snapshot_key];
      if (!target || !payloadLooksUsable(row.snapshot_key, row.payload)) continue;
      state[target] = clone(row.payload);
      applied = true;
    }
    if (!applied) return false;
    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    const note = String(state.team?.note || '');
    if (/Ошибка|Supabase|база пока без решений|ценовой контур/i.test(note)) {
      normalizeBadge('Локальный режим · витрина из Supabase');
    }
    try {
      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      if (state.activeSku && typeof renderSkuModal === 'function') renderSkuModal(state.activeSku);
    } catch (error) {
      console.warn('[portal-supabase-snapshot-hotfix] rerender', error);
    }
    return true;
  }

  async function refreshSnapshots() {
    if (snapshotRefreshInFlight) return;
    snapshotRefreshInFlight = true;
    try {
      const rows = await fetchSnapshots();
      if (applySnapshots(rows)) {
        window.__ALTEA_SUPABASE_SNAPSHOT_READY__ = true;
      }
    } catch (error) {
      const message = String(error?.message || error || '');
      if (/PGRST205|Could not find the table/i.test(message)) {
        console.warn('[portal-supabase-snapshot-hotfix] snapshot table is not ready yet');
        return;
      }
      console.warn('[portal-supabase-snapshot-hotfix]', error);
    } finally {
      snapshotRefreshInFlight = false;
    }
  }

  [180, 1200, 3600, 9000, 18000].forEach((delay) => {
    window.setTimeout(() => {
      refreshSnapshots().catch((error) => console.warn('[portal-supabase-snapshot-hotfix]', error));
    }, delay);
  });
  refreshSnapshots().catch((error) => console.warn('[portal-supabase-snapshot-hotfix]', error));
})();
