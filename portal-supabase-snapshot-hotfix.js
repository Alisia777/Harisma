(function () {
  if (window.__ALTEA_SUPABASE_SNAPSHOT_HOTFIX_20260516AUTOSYNC1__) return;
  window.__ALTEA_SUPABASE_SNAPSHOT_HOTFIX_20260516AUTOSYNC1__ = true;
  window.__ALTEA_SUPABASE_SNAPSHOT_HOTFIX_20260515DASH1__ = true;

  const SNAPSHOT_TABLE = 'portal_data_snapshots';
  const SNAPSHOT_KEYS = [
    'dashboard',
    'skus',
    'platform_trends',
    'iu_plan',
    'ads_summary',
    'iu_drr_summary',
    'platform_plan',
    'portal_sync_health',
    'portal_data_quarantine',
    'portal_data_quality',
    'sku_aliases',
    'sku_alias_ignore',
    'sku_alias_audit',
    'sku_matrix',
    'product_leaderboard',
    'product_leaderboard_history',
    'prices',
    'smart_price_workbench',
    'smart_price_overlay',
    'price_workbench_support',
    'repricer',
    'logistics',
    'order_procurement',
    'order_procurement_wb',
    'order_procurement_ozon',
    'oos_control',
    'warehouse_stock_overlay'
  ];
  const VIEW_SNAPSHOT_KEYS = {
    prices: ['prices', 'smart_price_workbench', 'smart_price_overlay', 'price_workbench_support'],
    repricer: ['prices', 'smart_price_workbench', 'smart_price_overlay', 'price_workbench_support'],
    order: ['logistics', 'order_procurement', 'order_procurement_wb', 'order_procurement_ozon', 'warehouse_stock_overlay'],
    'ads-funnel': ['ads_summary', 'smart_price_overlay', 'iu_drr_summary'],
    'oos-control': ['oos_control', 'order_procurement', 'portal_sync_health', 'portal_data_quality', 'smart_price_overlay'],
    'sku-plan-fact': ['smart_price_workbench', 'smart_price_overlay', 'price_workbench_support', 'ads_summary', 'iu_drr_summary', 'portal_data_quality', 'sku_aliases', 'sku_alias_ignore', 'sku_alias_audit', 'sku_matrix'],
    'iu-drr': ['iu_drr_summary', 'ads_summary', 'wb_feedbacks_summary'],
    'wb-rating': ['wb_feedbacks_summary', 'iu_drr_summary']
  };
  const SNAPSHOT_TIMEOUT_MS = 60000;
  const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const AUTO_REFRESH_MIN_GAP_MS = 60 * 1000;
  const SNAPSHOT_TO_STATE = {
    dashboard: 'dashboard',
    skus: 'skus',
    platform_trends: 'platformTrends',
    iu_plan: 'iuPlan',
    logistics: 'logistics',
    ads_summary: 'adsSummary',
    iu_drr_summary: 'iuDrrSummary',
    wb_feedbacks_summary: 'wbFeedbacks',
    platform_plan: 'platformPlan',
    prices: 'prices',
    smart_price_workbench: 'smartPriceWorkbench',
    smart_price_overlay: 'smartPriceOverlay',
    price_workbench_support: 'priceWorkbenchSupport',
    portal_sync_health: 'syncHealth',
    portal_data_quarantine: 'portalDataQuarantine',
    portal_data_quality: 'portalDataQuality',
    sku_aliases: 'skuAliases',
    sku_alias_ignore: 'skuAliasIgnore',
    sku_alias_audit: 'skuAliasAudit',
    sku_matrix: 'skuMatrix',
    product_leaderboard: 'productLeaderboard',
    product_leaderboard_history: 'productLeaderboardHistory',
    repricer: 'repricer',
    order_procurement: 'orderProcurementData',
    order_procurement_wb: 'orderProcurementWb',
    order_procurement_ozon: 'orderProcurementOzon',
    oos_control: 'oosControl',
    warehouse_stock_overlay: 'warehouseStockOverlay'
  };
  const FALLBACK_CONFIG = {
    brand: 'Алтея',
    supabase: {
      url: 'https://iyckwryrucqrxwlowxow.supabase.co',
      anonKey: 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw'
    }
  };
  let snapshotRefreshInFlight = false;
  let scheduledRefreshTimer = 0;
  let lastRequestedRefreshAt = 0;

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

  function activeViewKey() {
    if (typeof state === 'object' && state?.activeView) return String(state.activeView);
    const active = document.querySelector('.view.active[id^="view-"]');
    return active ? String(active.id || '').replace(/^view-/, '') : '';
  }

  function keysForRefresh() {
    const keys = SNAPSHOT_KEYS.slice();
    const view = activeViewKey();
    for (const key of VIEW_SNAPSHOT_KEYS[view] || []) {
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
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

    if (snapshotKey === 'iu_drr_summary') {
      (payload.daily || []).forEach((item) => {
        score = bumpFreshness(score, item?.date);
      });
      return score;
    }

    if (snapshotKey === 'wb_feedbacks_summary') {
      score = bumpFreshness(score, payload.window?.to);
      (payload.daily || []).forEach((item) => {
        score = bumpFreshness(score, item?.date);
      });
      return score;
    }

    if (snapshotKey === 'platform_plan' || snapshotKey === 'iu_plan') {
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

    if (snapshotKey === 'oos_control') {
      return bumpFreshness(score, payload.dataFreshness?.dataDate || payload.summary?.dataDate || payload.generatedAt);
    }

    if (snapshotKey === 'skus' && Array.isArray(payload)) {
      payload.forEach((item) => {
        score = bumpFreshness(score, item?.updatedAt || item?.updated_at || item?.createdAt);
      });
      return score;
    }

    return score;
  }

  function payloadDataFreshnessScore(snapshotKey, payload) {
    if (payload === null || payload === undefined) return 0;
    let score = 0;
    score = bumpFreshness(score, payload.asOfDate);
    score = bumpFreshness(score, payload.dataFreshness?.asOfDate);

    if (snapshotKey === 'dashboard') {
      return bumpFreshness(score, payload.dataFreshness?.asOfDate);
    }

    if (snapshotKey === 'platform_trends' || snapshotKey === 'ads_summary') {
      (payload.platforms || []).forEach((platform) => {
        (platform?.series || []).forEach((item) => {
          score = bumpFreshness(score, item?.date || item?.label);
        });
      });
      return score;
    }

    if (snapshotKey === 'iu_drr_summary') {
      (payload.daily || []).forEach((item) => {
        score = bumpFreshness(score, item?.date);
      });
      return score;
    }

    if (snapshotKey === 'wb_feedbacks_summary') {
      score = bumpFreshness(score, payload.window?.to);
      (payload.daily || []).forEach((item) => {
        score = bumpFreshness(score, item?.date);
      });
      return score;
    }

    if (snapshotKey === 'platform_plan' || snapshotKey === 'iu_plan') {
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

    if (snapshotKey === 'oos_control') {
      return bumpFreshness(score, payload.dataFreshness?.dataDate || payload.summary?.dataDate || payload.generatedAt);
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
    if (snapshotKey === 'iu_drr_summary') {
      return Array.isArray(payload.daily) && payload.daily.length > 0;
    }
    if (snapshotKey === 'wb_feedbacks_summary') {
      return Array.isArray(payload.cards) && payload.cards.length > 0;
    }
    if (snapshotKey === 'platform_plan' || snapshotKey === 'iu_plan') {
      return typeof payload?.months === 'object' && payload.months !== null && Object.keys(payload.months).length > 0;
    }
    if (snapshotKey === 'prices') {
      return Array.isArray(payload?.dates) && payload.dates.length > 0
        && typeof payload?.platforms === 'object' && payload.platforms !== null
        && Object.keys(payload.platforms).length > 0;
    }
    if (snapshotKey === 'smart_price_workbench' || snapshotKey === 'smart_price_overlay' || snapshotKey === 'price_workbench_support') {
      return typeof payload?.platforms === 'object' && payload.platforms !== null
        && Object.keys(payload.platforms).length > 0;
    }
    if (snapshotKey === 'portal_sync_health') return typeof payload?.publish === 'object';
    if (snapshotKey === 'portal_data_quarantine') return Array.isArray(payload?.rows);
    if (snapshotKey === 'portal_data_quality') return typeof payload?.summary === 'object';
    if (snapshotKey === 'sku_aliases') return Array.isArray(payload?.aliases);
    if (snapshotKey === 'sku_alias_ignore') return Array.isArray(payload?.ignored) || Array.isArray(payload?.ignores) || Array.isArray(payload?.rows);
    if (snapshotKey === 'sku_alias_audit') return Array.isArray(payload?.events);
    if (snapshotKey === 'sku_matrix') return Array.isArray(payload?.items) && payload.items.length > 0;
    if (snapshotKey === 'product_leaderboard') return Array.isArray(payload?.items);
    if (snapshotKey === 'product_leaderboard_history') return Array.isArray(payload);
    if (snapshotKey === 'repricer') return Array.isArray(payload?.rows) || typeof payload?.summary === 'object';
    if (snapshotKey === 'order_procurement' || snapshotKey === 'order_procurement_wb' || snapshotKey === 'order_procurement_ozon') {
      return Array.isArray(payload?.rows);
    }
    if (snapshotKey === 'oos_control') return typeof payload === 'object' && payload !== null && Array.isArray(payload?.rows);
    if (snapshotKey === 'warehouse_stock_overlay') return Array.isArray(payload?.rows);
    return typeof payload === 'object' && payload !== null && Object.keys(payload).length > 0;
  }

  function normalizeBadge(noteText) {
    if (typeof state !== 'object' || !state || !state.team) return;
    const mode = String(state.team.mode || '');
    const hasSession = Boolean(state.team.ready || state.team.accessToken || state.team.client);
    if (hasSession || mode === 'pending' || mode === 'ready' || mode === 'error') return;
    state.team.mode = 'local';
    state.team.ready = false;
    state.team.note = noteText || 'Локальный режим · витрина из Supabase';
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  }

  function parseChunkedSnapshotKey(snapshotKey = '') {
    const match = String(snapshotKey || '').match(/^(.*)__part__(\d{4})$/);
    return match ? { baseKey: match[1], index: Number(match[2]) } : null;
  }

  function decodeChunkedSnapshotRows(rows) {
    const decodedRows = [];
    const plainRowsByKey = new Map();
    const plainFreshnessByKey = new Map();
    const metaByKey = new Map();
    const metaFreshnessByKey = new Map();
    const partsByKey = new Map();

    function rowFreshness(row) {
      return Math.max(
        parseFreshStamp(row?.updated_at),
        parseFreshStamp(row?.generated_at),
        parseFreshStamp(row?.payload?.generatedAt),
        parseFreshStamp(row?.payload?.updatedAt),
        parseFreshStamp(row?.payload?.updated_at),
        parseFreshStamp(row?.payload?.asOfDate),
        parseFreshStamp(row?.payload?.dataFreshness?.asOfDate)
      );
    }

    for (const row of Array.isArray(rows) ? rows : []) {
      const snapshotKey = String(row?.snapshot_key || '').trim();
      if (!snapshotKey) continue;
      const chunkMeta = parseChunkedSnapshotKey(snapshotKey);
      if (chunkMeta) {
        if (!SNAPSHOT_TO_STATE[chunkMeta.baseKey]) continue;
        if (!partsByKey.has(chunkMeta.baseKey)) partsByKey.set(chunkMeta.baseKey, new Map());
        const partMap = partsByKey.get(chunkMeta.baseKey);
        const freshness = rowFreshness(row);
        const current = partMap.get(chunkMeta.index);
        if (!current || current.freshness <= freshness) {
          partMap.set(chunkMeta.index, { freshness, payload: row.payload, updated_at: row.updated_at });
        }
        continue;
      }
      if (!SNAPSHOT_TO_STATE[snapshotKey]) continue;
      if (row?.payload?.chunked) {
        const freshness = rowFreshness(row);
        const current = metaByKey.get(snapshotKey);
        if (!current || metaFreshnessByKey.get(snapshotKey) <= freshness) {
          metaByKey.set(snapshotKey, row);
          metaFreshnessByKey.set(snapshotKey, freshness);
        }
        continue;
      }
      const freshness = rowFreshness(row);
      const current = plainRowsByKey.get(snapshotKey);
      if (!current || plainFreshnessByKey.get(snapshotKey) <= freshness) {
        plainRowsByKey.set(snapshotKey, row);
        plainFreshnessByKey.set(snapshotKey, freshness);
      }
    }

    decodedRows.push(...plainRowsByKey.values());

    for (const [baseKey, metaRow] of metaByKey.entries()) {
      const partMap = partsByKey.get(baseKey) || new Map();
      const parts = Array.from(partMap.entries())
        .sort((left, right) => left[0] - right[0])
        .map((entry) => entry[1]);
      const expectedCount = Number(metaRow?.payload?.chunk_count || metaRow?.payload?.chunkCount || 0);
      if (!parts.length || (expectedCount > 0 && parts.length < expectedCount)) continue;
      const text = parts
        .slice(0, expectedCount > 0 ? expectedCount : parts.length)
        .map((part) => typeof part.payload === 'string' ? part.payload : String(part.payload?.data || ''))
        .join('');
      if (!text) continue;
      try {
        decodedRows.push({
          ...metaRow,
          payload: JSON.parse(text),
          updated_at: metaRow.updated_at || parts[parts.length - 1]?.updated_at
        });
      } catch (error) {
        console.warn('[portal-supabase-snapshot-hotfix] failed to decode chunked snapshot', baseKey, error);
      }
    }

    return decodedRows;
  }

  function buildSnapshotUrl(activeCfg) {
    const baseUrl = String(activeCfg.supabase.url || '').replace(/\/+$/, '');
    const url = new URL(`${baseUrl}/rest/v1/${SNAPSHOT_TABLE}`);
    url.searchParams.set('select', 'snapshot_key,payload,updated_at');
    url.searchParams.set('brand', `eq.${brand()}`);
    url.searchParams.set('order', 'updated_at.desc');
    return url;
  }

  function rowIsChunkMeta(row) {
    return Boolean(row?.payload?.chunked);
  }

  async function requestSnapshotRows(activeCfg, url) {
    const request = fetch(url.toString(), {
      cache: 'no-store',
      headers: {
        apikey: activeCfg.supabase.anonKey,
        Authorization: `Bearer ${activeCfg.supabase.anonKey}`,
        Accept: 'application/json'
      }
    });
    const response = typeof withTimeout === 'function'
      ? await withTimeout(request, SNAPSHOT_TIMEOUT_MS, 'Supabase snapshots')
      : await request;
    if (!response?.ok) throw new Error(`Supabase snapshots ${response?.status || 'request failed'}`);
    return typeof withTimeout === 'function'
      ? await withTimeout(response.json(), SNAPSHOT_TIMEOUT_MS, 'Supabase snapshot JSON')
      : await response.json();
  }

  async function requestRowsForExactKeys(activeCfg, keys) {
    const result = [];
    const cleanKeys = (Array.isArray(keys) ? keys : [])
      .map((key) => String(key || '').trim())
      .filter(Boolean);
    for (let index = 0; index < cleanKeys.length; index += 40) {
      const batch = cleanKeys.slice(index, index + 40);
      const url = buildSnapshotUrl(activeCfg);
      url.searchParams.set('snapshot_key', batch.length === 1 ? `eq.${batch[0]}` : `in.(${batch.join(',')})`);
      result.push(...await requestSnapshotRows(activeCfg, url));
    }
    return result;
  }

  function snapshotPartKeys(snapshotKey, count) {
    const total = Math.max(0, Math.trunc(Number(count) || 0));
    const keys = [];
    for (let index = 1; index <= total; index += 1) {
      keys.push(`${snapshotKey}__part__${String(index).padStart(4, '0')}`);
    }
    return keys;
  }

  async function fetchRowsForKeys(activeCfg, keys) {
    if (!Array.isArray(keys) || !keys.length) return [];
    const rows = await requestRowsForExactKeys(activeCfg, keys);
    const chunkedKeys = rows
      .filter(rowIsChunkMeta)
      .map((row) => ({
        key: String(row?.snapshot_key || '').trim(),
        count: Number(row?.payload?.chunk_count || row?.payload?.chunkCount || 0)
      }))
      .filter((item) => SNAPSHOT_TO_STATE[item.key] && item.count > 0);
    if (!chunkedKeys.length) return rows;
    const partGroups = [];
    for (const item of chunkedKeys) {
      try {
        partGroups.push(await requestRowsForExactKeys(activeCfg, snapshotPartKeys(item.key, item.count)));
      } catch (error) {
        console.warn('[portal-supabase-snapshot-hotfix] chunk load failed', item.key, error);
      }
    }
    return rows.concat(...partGroups);
  }

  async function fetchSnapshots() {
    const activeCfg = cfg();
    if (!activeCfg.supabase?.url || !activeCfg.supabase?.anonKey || typeof fetch !== 'function') return;
    const baseUrl = String(activeCfg.supabase.url || '').replace(/\/+$/, '');
    const url = new URL(`${baseUrl}/rest/v1/${SNAPSHOT_TABLE}`);
    url.searchParams.set('select', 'snapshot_key,payload,updated_at');
    url.searchParams.set('brand', `eq.${brand()}`);
    url.searchParams.set('order', 'updated_at.desc');
    const request = fetch(url.toString(), {
      cache: 'no-store',
      headers: {
        apikey: activeCfg.supabase.anonKey,
        Authorization: `Bearer ${activeCfg.supabase.anonKey}`,
        Accept: 'application/json'
      }
    });
    const response = typeof withTimeout === 'function'
      ? await withTimeout(request, SNAPSHOT_TIMEOUT_MS, 'Витрина Supabase')
      : await request;
    if (!response?.ok) throw new Error(`Supabase snapshots ${response?.status || 'request failed'}`);
    const rows = typeof withTimeout === 'function'
      ? await withTimeout(response.json(), SNAPSHOT_TIMEOUT_MS, 'Чтение витрины Supabase')
      : await response.json();
    return decodeChunkedSnapshotRows(rows);
  }

  fetchSnapshots = async function fetchSnapshotsSelective() {
    const activeCfg = cfg();
    if (!activeCfg.supabase?.url || !activeCfg.supabase?.anonKey || typeof fetch !== 'function') return;
    const rows = await fetchRowsForKeys(activeCfg, keysForRefresh());
    return decodeChunkedSnapshotRows(rows);
  };

  function applySnapshots(rows, options = {}) {
    if (typeof state !== 'object' || !state || !Array.isArray(rows) || !rows.length) return false;
    const allowRerender = Boolean(options && options.rerender === true);
    let applied = false;
    for (const row of rows) {
      const target = SNAPSHOT_TO_STATE[row?.snapshot_key];
      if (!target || !payloadLooksUsable(row.snapshot_key, row.payload)) continue;
      const currentPayload = state[target];
      const currentUsable = payloadLooksUsable(row.snapshot_key, currentPayload);
      const incomingFreshness = payloadFreshnessScore(row.snapshot_key, row.payload, row?.updated_at);
      const currentFreshness = payloadFreshnessScore(row.snapshot_key, currentPayload);
      const incomingDataFreshness = payloadDataFreshnessScore(row.snapshot_key, row.payload);
      const currentDataFreshness = payloadDataFreshnessScore(row.snapshot_key, currentPayload);
      if (currentUsable && (incomingDataFreshness || currentDataFreshness)) {
        if (currentDataFreshness > incomingDataFreshness) continue;
        if (currentDataFreshness === incomingDataFreshness && currentFreshness >= incomingFreshness) continue;
      } else if (currentUsable && currentFreshness >= incomingFreshness) {
        continue;
      }
      state[target] = clone(row.payload);
      if (row.snapshot_key === 'order_procurement') {
        state.orderProcurementSnapshot = clone(row.payload);
        state.orderProcurement = clone(row.payload);
      }
      applied = true;
    }
    if (!applied) return false;
    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    const note = String(state.team?.note || '');
    const shouldNormalizeBadge = state.team?.mode === 'pending';
    if (shouldNormalizeBadge) {
      normalizeBadge('Р›РѕРєР°Р»СЊРЅС‹Р№ СЂРµР¶РёРј В· РІРёС‚СЂРёРЅР° РёР· Supabase');
    }
    if (/Ошибка|Supabase|база пока без решений|ценовой контур/i.test(note)) {
      normalizeBadge('Локальный режим · витрина из Supabase');
    }
    if (allowRerender) {
      try {
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
        if (state.activeSku && typeof renderSkuModal === 'function') renderSkuModal(state.activeSku);
      } catch (error) {
        console.warn('[portal-supabase-snapshot-hotfix] rerender', error);
      }
    }
    return true;
  }

  async function refreshSnapshots(options = {}) {
    if (snapshotRefreshInFlight) return;
    snapshotRefreshInFlight = true;
    try {
      const rows = await fetchSnapshots();
      if (applySnapshots(rows, options)) {
        window.__ALTEA_SUPABASE_SNAPSHOT_READY__ = true;
        if (typeof window.__alteaInvalidateDeferredData === 'function') {
          try {
            window.__alteaInvalidateDeferredData();
          } catch (error) {
            console.warn('[portal-supabase-snapshot-hotfix] invalidate deferred cache', error);
          }
        }
        if (typeof window.__alteaResetPortalSnapshotState === 'function') {
          try {
            window.__alteaResetPortalSnapshotState();
          } catch (error) {
            console.warn('[portal-supabase-snapshot-hotfix] reset snapshot cache', error);
          }
        }
        if (window.__ALTEA_DASHBOARD_INTERACTIVE_API__?.applyNow) {
          try {
            window.__ALTEA_DASHBOARD_INTERACTIVE_API__.applyNow(false);
          } catch (error) {
            console.warn('[portal-supabase-snapshot-hotfix] dashboard refresh', error);
          }
        }
        window.dispatchEvent(new CustomEvent('altea:datarefresh', {
          detail: { source: 'supabase-snapshot', changed: true, at: new Date().toISOString() }
        }));
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

  window.__ALTEA_REFRESH_SUPABASE_SNAPSHOTS__ = refreshSnapshots;
  function scheduleRefresh(reason, delay = 250) {
    if (document.hidden && reason !== 'manual') return;
    const now = Date.now();
    if (now - lastRequestedRefreshAt < AUTO_REFRESH_MIN_GAP_MS) return;
    lastRequestedRefreshAt = now;
    if (scheduledRefreshTimer) window.clearTimeout(scheduledRefreshTimer);
    scheduledRefreshTimer = window.setTimeout(() => {
      scheduledRefreshTimer = 0;
      refreshSnapshots({ rerender: reason === 'manual' }).catch((error) => console.warn('[portal-supabase-snapshot-hotfix]', reason, error));
    }, delay);
  }
  window.__ALTEA_SCHEDULE_SUPABASE_SNAPSHOT_REFRESH__ = scheduleRefresh;
  [1200].forEach((delay) => {
    window.setTimeout(() => {
      refreshSnapshots({ rerender: false }).catch((error) => console.warn('[portal-supabase-snapshot-hotfix]', error));
    }, delay);
  });
  window.setInterval(() => scheduleRefresh('interval'), AUTO_REFRESH_INTERVAL_MS);
  window.addEventListener('focus', () => scheduleRefresh('focus', 120));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRefresh('visible', 120);
  });
  refreshSnapshots({ rerender: false }).catch((error) => console.warn('[portal-supabase-snapshot-hotfix]', error));
})();
