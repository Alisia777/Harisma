(function () {
  if (window.__ALTEA_SMART_PRICE_OVERLAY_HOTFIX_20260424B__) return;
  window.__ALTEA_SMART_PRICE_OVERLAY_HOTFIX_20260424B__ = true;

  const SNAPSHOT_TABLE = 'portal_data_snapshots';
  const SNAPSHOT_KEY = 'smart_price_overlay';
  const OVERLAY_PATH = 'data/smart_price_overlay.json';
  const SUPPORT_FULL_PATH = 'data/price_workbench_support.json';
  const SUPPORT_COMPACT_PATH = 'data/price_workbench_support.compact.json';
  const SUPPORT_DASHBOARD_PATH = 'data/price_workbench_support.dashboard-compact.json';
  const FALLBACK_CONFIG = {
    brand: '\u0410\u043b\u0442\u0435\u044f',
    supabase: {
      url: 'https://iyckwryrucqrxwlowxow.supabase.co',
      anonKey: 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw'
    }
  };

  let overlayPromise = null;
  let supportPromise = null;
  let lastAppliedAt = '';
  const SMART_PRICE_WORKBENCH_PATH = 'data/smart_price_workbench.json';
  const WORKBENCH_OVERLAY_TIMEOUT_MS = 1800;
  let fetchPatched = false;

  function cfg() {
    if (typeof currentConfig === 'function') {
      const active = currentConfig();
      if (active) return active;
    }
    const raw = window.APP_CONFIG || {};
    return {
      ...FALLBACK_CONFIG,
      ...raw,
      supabase: {
        ...FALLBACK_CONFIG.supabase,
        ...(raw.supabase || {})
      }
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

  function jsonResponse(payload) {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function normalizePath(path) {
    return String(path || '').replaceAll('\\', '/').split('?')[0].replace(/^\//, '');
  }

  function normalizeKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z\u0430-\u044f0-9]+/gi, '');
  }

  function parseFreshStamp(value) {
    if (!value) return 0;
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

  function overlayFlagEnabled(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function valueMissing(value) {
    return value === null || value === undefined || value === ''
      || (Array.isArray(value) && value.length === 0);
  }

  function mergeField(target, key, value, force) {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    if (!force && !valueMissing(target[key])) return;
    target[key] = clone(value);
  }

  function overlayRows(rows) {
    if (Array.isArray(rows)) return rows;
    if (rows && typeof rows === 'object') return Object.values(rows);
    return [];
  }

  function clearOverlayPoint(point, overlayRow) {
    if (overlayFlagEnabled(overlayRow?.clearCurrentFillPrice) || overlayFlagEnabled(overlayRow?.clearCurrentPrice)) {
      point.price = null;
    }
    if (overlayFlagEnabled(overlayRow?.clearCurrentClientPrice)) {
      point.clientPrice = null;
    }
    if (overlayFlagEnabled(overlayRow?.clearCurrentSppPct)) {
      point.sppPct = null;
    }
    if (overlayFlagEnabled(overlayRow?.clearCurrentTurnoverDays)) {
      point.turnoverDays = null;
    }
  }

  function clearOverlayRowFields(row, overlayRow) {
    if (overlayFlagEnabled(overlayRow?.clearCurrentFillPrice) || overlayFlagEnabled(overlayRow?.clearCurrentPrice)) {
      row.currentFillPrice = null;
      row.currentPrice = null;
    }
    if (overlayFlagEnabled(overlayRow?.clearCurrentClientPrice)) {
      row.currentClientPrice = null;
    }
    if (overlayFlagEnabled(overlayRow?.clearCurrentSppPct)) {
      row.currentSppPct = null;
    }
    if (overlayFlagEnabled(overlayRow?.clearCurrentTurnoverDays)) {
      row.turnoverCurrentDays = null;
      row.currentTurnoverDays = null;
    }
  }

  function mergeTimeline(series, overlayRow) {
    const next = Array.isArray(series) ? series.map((item) => ({ ...(item || {}) })) : [];
    const valueDate = String(overlayRow?.valueDate || overlayRow?.historyFreshnessDate || '').trim();
    if (!valueDate) return next;

    const filtered = next.filter((item) => {
      const itemDate = String(item?.date || '').trim();
      return !itemDate || itemDate <= valueDate;
    });
    let point = filtered.find((item) => String(item?.date || '').trim() === valueDate);
    if (!point) {
      point = { date: valueDate };
      filtered.push(point);
    }
    clearOverlayPoint(point, overlayRow);
    if (!valueMissing(overlayRow?.currentFillPrice)) point.price = overlayRow.currentFillPrice;
    else if (!valueMissing(overlayRow?.currentPrice)) point.price = overlayRow.currentPrice;
    if (!valueMissing(overlayRow?.currentClientPrice)) point.clientPrice = overlayRow.currentClientPrice;
    if (!valueMissing(overlayRow?.currentSppPct)) point.sppPct = overlayRow.currentSppPct;
    if (!valueMissing(overlayRow?.currentTurnoverDays)) point.turnoverDays = overlayRow.currentTurnoverDays;
    return filtered.sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')));
  }

  function mergeOverlayRow(primaryRow, overlayRow) {
    const next = clone(primaryRow) || {};
    if (!overlayRow || typeof overlayRow !== 'object') return next;
    clearOverlayRowFields(next, overlayRow);

    [
      'articleKey',
      'article',
      'name',
      'owner',
      'status',
      'currentFillPrice',
      'currentPrice',
      'currentClientPrice',
      'currentSppPct',
      'currentTurnoverDays',
      'turnoverCurrentDays',
      'historyNote',
      'valueDate',
      'sourceMode'
    ].forEach((key) => mergeField(next, key, overlayRow[key], true));

    next.monthly = mergeTimeline(next.monthly, overlayRow);
    next.daily = mergeTimeline(next.daily, overlayRow);
    return next;
  }

  function mergeOverlayPayload(primaryPayload, overlayPayload) {
    const primary = primaryPayload && typeof primaryPayload === 'object'
      ? clone(primaryPayload)
      : { generatedAt: '', platforms: {} };
    const overlay = overlayPayload && typeof overlayPayload === 'object'
      ? clone(overlayPayload)
      : null;
    if (!primary?.platforms && !overlay?.platforms) return primary;

    const merged = primary || { generatedAt: '', platforms: {} };
    merged.platforms = merged.platforms && typeof merged.platforms === 'object' ? merged.platforms : {};
    if (!overlay?.platforms) {
      return merged;
    }

    const platforms = new Set([
      ...Object.keys(primary?.platforms || {}),
      ...Object.keys(overlay?.platforms || {})
    ]);

    platforms.forEach((platform) => {
      const primaryBucket = primary?.platforms?.[platform] || {};
      const overlayBucket = overlay?.platforms?.[platform] || {};
      const primaryRows = overlayRows(primaryBucket.rows);
      const extraRows = overlayRows(overlayBucket.rows);
      const overlayMap = new Map();
      extraRows.forEach((row) => {
        const key = normalizeKey(row?.articleKey || row?.article || row?.sku);
        if (!key || overlayMap.has(key)) return;
        overlayMap.set(key, row);
      });

      const mergedRows = [];
      const usedKeys = new Set();
      primaryRows.forEach((row) => {
        const key = normalizeKey(row?.articleKey || row?.article || row?.sku);
        const overlayRow = key ? overlayMap.get(key) : null;
        if (key && overlayRow) usedKeys.add(key);
        mergedRows.push(mergeOverlayRow(row, overlayRow));
      });

      extraRows.forEach((row) => {
        const key = normalizeKey(row?.articleKey || row?.article || row?.sku);
        if (!key || usedKeys.has(key)) return;
        mergedRows.push(mergeOverlayRow({}, row));
      });

      merged.platforms[platform] = {
        ...(primaryBucket || {}),
        label: primaryBucket?.label || overlayBucket?.label,
        emptyNote: primaryBucket?.emptyNote || overlayBucket?.emptyNote,
        rows: mergedRows
      };
    });

    const overlayStamp = parseFreshStamp(overlay.generatedAt);
    const currentStamp = parseFreshStamp(merged.generatedAt);
    if (overlayStamp > currentStamp) merged.generatedAt = overlay.generatedAt || merged.generatedAt || '';
    merged.priceOverlayAt = overlay.generatedAt || '';
    merged.priceOverlaySource = overlay.sourceFile || '';
    merged.priceOverlayUsed = true;
    return merged;
  }

  function decodePayload(mainRow, rows) {
    if (!mainRow) return null;
    const payload = mainRow.payload;
    if (!payload?.chunked) return payload || null;
    const expected = Number(payload.chunk_count || payload.chunkCount || 0);
    const prefix = `${SNAPSHOT_KEY}__part__`;
    const parts = rows
      .filter((row) => String(row?.snapshot_key || '').startsWith(prefix))
      .sort((left, right) => String(left?.snapshot_key || '').localeCompare(String(right?.snapshot_key || '')));
    if (expected && parts.length < expected) {
      throw new Error(`Overlay snapshot incomplete: ${parts.length}/${expected}`);
    }
    return JSON.parse(parts.map((row) => String(row?.payload?.data || '')).join(''));
  }

  async function fetchOverlaySnapshot() {
    if (overlayPromise) return overlayPromise;
    overlayPromise = (async () => {
      const activeCfg = cfg();
      if (!activeCfg.supabase?.url || !activeCfg.supabase?.anonKey) {
        throw new Error('Supabase runtime is not configured');
      }
      const baseUrl = String(activeCfg.supabase.url || '').replace(/\/+$/, '');
      const url = new URL(`${baseUrl}/rest/v1/${SNAPSHOT_TABLE}`);
      url.searchParams.set('select', 'snapshot_key,payload,updated_at');
      url.searchParams.set('brand', `eq.${brand()}`);
      url.searchParams.set('snapshot_key', `like.${SNAPSHOT_KEY}*`);
      url.searchParams.set('order', 'snapshot_key.asc');
      const response = await fetch(url.toString(), {
        cache: 'no-store',
        headers: {
          apikey: activeCfg.supabase.anonKey,
          Authorization: `Bearer ${activeCfg.supabase.anonKey}`,
          Accept: 'application/json'
        }
      });
      if (!response.ok) throw new Error(`Supabase overlay ${response.status}`);
      const rows = await response.json();
      const main = rows.find((row) => row?.snapshot_key === SNAPSHOT_KEY);
      return decodePayload(main, rows);
    })().catch((error) => {
      console.warn('[portal-smart-price-overlay-hotfix]', error);
      overlayPromise = null;
      return null;
    });
    return overlayPromise;
  }

  async function fetchSupportPayload(originalFetch) {
    if (supportPromise) return supportPromise;
    supportPromise = (async () => {
      try {
        if (typeof state !== 'undefined' && state?.priceWorkbenchSupport?.platforms) {
          return clone(state.priceWorkbenchSupport);
        }
      } catch (error) {
        console.warn('[portal-smart-price-overlay-hotfix] support state', error);
      }

      try {
        if (typeof window.__alteaLoadPortalSnapshot === 'function') {
          const snapshot = await window.__alteaLoadPortalSnapshot(SUPPORT_FULL_PATH);
          if (snapshot?.platforms) return clone(snapshot);
        }
      } catch (error) {
        console.warn('[portal-smart-price-overlay-hotfix] support snapshot', error);
      }

      if (typeof originalFetch === 'function') {
        try {
          const response = await originalFetch(SUPPORT_FULL_PATH, { cache: 'no-store' });
          if (response?.ok) {
            const payload = await response.clone().json();
            if (payload?.platforms) return payload;
          }
        } catch (error) {
          console.warn('[portal-smart-price-overlay-hotfix] support local', error);
        }
      }

      return { generatedAt: '', platforms: {} };
    })().catch((error) => {
      console.warn('[portal-smart-price-overlay-hotfix] support', error);
      supportPromise = null;
      return { generatedAt: '', platforms: {} };
    });
    return supportPromise;
  }

  function patchSnapshotLoader() {
    const original = typeof window.__alteaLoadPortalSnapshot === 'function'
      ? window.__alteaLoadPortalSnapshot.bind(window)
      : null;
    window.__alteaLoadPortalSnapshot = async function patchedLoadPortalSnapshot(path) {
      const normalized = normalizePath(path);
      if (normalized === OVERLAY_PATH) {
        return clone(await fetchOverlaySnapshot());
      }
      if (original) return original(path);
      return null;
    };
  }

  function patchFetchForWorkbench() {
    if (fetchPatched || typeof window.fetch !== 'function') return;
    fetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function patchedFetch(input, init) {
      const normalized = normalizePath(typeof input === 'string' ? input : input?.url || '');
      if (normalized === SUPPORT_COMPACT_PATH || normalized === SUPPORT_DASHBOARD_PATH) {
        const supportPayload = await fetchSupportPayload(originalFetch);
        return jsonResponse(supportPayload);
      }
      if (normalized === SMART_PRICE_WORKBENCH_PATH) {
        try {
          const response = await originalFetch(input, init);
          if (!response?.ok) return response;
          const payload = await response.clone().json();
          try {
            if (typeof state !== 'undefined' && payload?.platforms) {
              state.smartPriceWorkbenchBase = clone(payload);
            }
          } catch (error) {
            console.warn('[portal-smart-price-overlay-hotfix] base state', error);
          }
          const overlay = await Promise.race([
            fetchOverlaySnapshot(),
            new Promise((resolve) => window.setTimeout(() => resolve(null), WORKBENCH_OVERLAY_TIMEOUT_MS))
          ]);
          return jsonResponse(mergeOverlayPayload(payload, overlay));
        } catch (error) {
          console.warn('[portal-smart-price-overlay-hotfix] fetch merge', error);
        }
      }
      if (normalized === OVERLAY_PATH) {
        try {
          const overlay = await fetchOverlaySnapshot();
          if (overlay?.platforms) return jsonResponse(overlay);
        } catch (error) {
          console.warn('[portal-smart-price-overlay-hotfix] overlay fetch', error);
        }
      }
      return originalFetch(input, init);
    };
  }

  async function applyOverlayToState() {
    if (typeof state === 'undefined' || !state?.smartPriceWorkbench?.platforms) return;
    const overlay = await fetchOverlaySnapshot();
    if (!overlay?.platforms) return;
    if (lastAppliedAt && lastAppliedAt === String(overlay.generatedAt || '')) return;
    const baseWorkbench = state.smartPriceWorkbenchBase?.platforms
      ? clone(state.smartPriceWorkbenchBase)
      : clone(state.smartPriceWorkbench);
    state.smartPriceOverlay = clone(overlay);
    state.smartPriceWorkbench = mergeOverlayPayload(baseWorkbench, overlay);
    lastAppliedAt = String(overlay.generatedAt || '');
    if (typeof rerenderCurrentView === 'function' && ['prices', 'repricer'].includes(state.activeView)) {
      rerenderCurrentView();
    }
  }

  function scheduleApply(delay) {
    window.setTimeout(() => {
      applyOverlayToState().catch((error) => console.warn('[portal-smart-price-overlay-hotfix]', error));
    }, delay);
  }

  patchSnapshotLoader();
  patchFetchForWorkbench();
  [120, 900, 2400, 6000].forEach(scheduleApply);
  window.addEventListener('altea:viewchange', (event) => {
    const view = event?.detail?.view;
    if (!view || !['prices', 'repricer'].includes(view)) return;
    [120, 700, 1800].forEach(scheduleApply);
  });
})();
