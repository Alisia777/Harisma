(function () {
  if (window.__ALTEA_SUPABASE_SNAPSHOT_HOTFIX_20260419J__) return;
  window.__ALTEA_SUPABASE_SNAPSHOT_HOTFIX_20260419J__ = true;

  const SNAPSHOT_TABLE = 'portal_data_snapshots';
  const SNAPSHOT_KEYS = ['dashboard', 'skus', 'platform_trends', 'logistics', 'ads_summary', 'platform_plan', 'prices'];
  const SNAPSHOT_TO_STATE = {
    dashboard: 'dashboard',
    skus: 'skus',
    platform_trends: 'platformTrends',
    logistics: 'logistics',
    ads_summary: 'adsSummary',
    platform_plan: 'platformPlan',
    prices: 'prices'
  };
  const FALLBACK_CONFIG = {
    brand: '\u0410\u043b\u0442\u0435\u044f',
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

  function parseFreshStamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const normalized = /^\d{4}-\d{2}$/.test(raw)
      ? `${raw}-01T00:00:00Z`
      : /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T00:00:00Z`
        : raw;
    const stamp = Date.parse(normalized);
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function bumpFreshness(score, value) {
    return Math.max(score, parseFreshStamp(value));
  }

  function payloadFreshnessScore(snapshotKey, payload, rowUpdatedAt = '') {
    if (payload === null || payload === undefined) return 0;
    let score = bumpFreshness(0, rowUpdatedAt);
    score = bumpFreshness(score, payload.generatedAt);
    score = bumpFreshness(score, payload.updatedAt);
    score = bumpFreshness(score, payload.updated_at);
    score = bumpFreshness(score, payload.asOfDate);
    score = bumpFreshness(score, payload.dataFreshness?.asOfDate);

    if (snapshotKey === 'dashboard') {
      score = bumpFreshness(score, payload.dataFreshness?.asOfDate);
      return score;
    }

    if (snapshotKey === 'platform_trends' || snapshotKey === 'ads_summary') {
      (payload.platforms || []).forEach((platform) => {
        (platform?.series || []).forEach((item) => {
          score = bumpFreshness(score, item?.date || item?.label);
        });
      });
      return score;
    }

    if (snapshotKey === 'platform_plan') {
      Object.keys(payload.months || {}).forEach((monthKey) => {
        score = bumpFreshness(score, `${monthKey}-01`);
      });
      return score;
    }

    if (snapshotKey === 'prices') {
      score = bumpFreshness(score, payload.month?.key ? `${payload.month.key}-01` : '');
      (payload.dates || []).forEach((item) => {
        score = bumpFreshness(score, item?.date || item?.label);
      });
      return score;
    }

    if (snapshotKey === 'skus' && Array.isArray(payload)) {
      payload.forEach((item) => {
        score = bumpFreshness(score, item?.updatedAt || item?.updated_at || item?.createdAt);
      });
      return score;
    }

    return score;
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
    if (snapshotKey === 'ads_summary') {
      return Array.isArray(payload.platforms) && payload.platforms.length > 0;
    }
    if (snapshotKey === 'platform_plan') {
      return typeof payload?.months === 'object' && payload.months !== null && Object.keys(payload.months).length > 0;
    }
    if (snapshotKey === 'prices') {
      return Array.isArray(payload?.dates) && payload.dates.length > 0
        && typeof payload?.platforms === 'object' && payload.platforms !== null
        && Object.keys(payload.platforms).length > 0;
    }
    return typeof payload === 'object' && payload !== null && Object.keys(payload).length > 0;
  }

  function normalizeBadge(noteText) {
    if (typeof state !== 'object' || !state || !state.team) return;
    state.team.mode = 'local';
    state.team.ready = false;
    state.team.note = noteText || '\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c \u00b7 \u0432\u0438\u0442\u0440\u0438\u043d\u0430 \u0438\u0437 Supabase';
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  }

  async function fetchSnapshots() {
    const activeCfg = cfg();
    if (!activeCfg.supabase?.url || !activeCfg.supabase?.anonKey || typeof fetch !== 'function') return;
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
      ? await withTimeout(request, 5000, '\u0412\u0438\u0442\u0440\u0438\u043d\u0430 Supabase')
      : await request;
    if (!response?.ok) throw new Error(`Supabase snapshots ${response?.status || 'request failed'}`);
    return typeof withTimeout === 'function'
      ? await withTimeout(response.json(), 5000, '\u0427\u0442\u0435\u043d\u0438\u0435 \u0432\u0438\u0442\u0440\u0438\u043d\u044b Supabase')
      : await response.json();
  }

  function applySnapshots(rows) {
    if (typeof state !== 'object' || !state || !Array.isArray(rows) || !rows.length) return false;
    let applied = false;
    for (const row of rows) {
      const target = SNAPSHOT_TO_STATE[row?.snapshot_key];
      if (!target || !payloadLooksUsable(row.snapshot_key, row.payload)) continue;
      const currentPayload = state[target];
      const currentUsable = payloadLooksUsable(row.snapshot_key, currentPayload);
      const incomingFreshness = payloadFreshnessScore(row.snapshot_key, row.payload, row?.updated_at);
      const currentFreshness = payloadFreshnessScore(row.snapshot_key, currentPayload);
      if (currentUsable && currentFreshness >= incomingFreshness) continue;
      state[target] = clone(row.payload);
      applied = true;
    }
    if (!applied) return false;
    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    const note = String(state.team?.note || '');
    const shouldNormalizeBadge = state.team?.mode === 'pending';
    if (shouldNormalizeBadge) {
      normalizeBadge('\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c \u00b7 \u0432\u0438\u0442\u0440\u0438\u043d\u0430 \u0438\u0437 Supabase');
    }
    if (/\u041e\u0448\u0438\u0431\u043a\u0430|Supabase|\u0431\u0430\u0437\u0430 \u043f\u043e\u043a\u0430 \u0431\u0435\u0437 \u0440\u0435\u0448\u0435\u043d\u0438\u0439|\u0446\u0435\u043d\u043e\u0432\u043e\u0439 \u043a\u043e\u043d\u0442\u0443\u0440/i.test(note)) {
      normalizeBadge('\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c \u00b7 \u0432\u0438\u0442\u0440\u0438\u043d\u0430 \u0438\u0437 Supabase');
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
