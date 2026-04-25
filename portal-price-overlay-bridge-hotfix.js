(function () {
  if (window.__ALTEA_PRICE_OVERLAY_BRIDGE_20260425E__) return;
  window.__ALTEA_PRICE_OVERLAY_BRIDGE_20260425E__ = true;

  const OVERLAY_B64 = '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';
  let payloadPromise = null;
  let rerenderTimer = 0;

  function decodeBase64ToBytes(base64) {
    const normalized = String(base64 || '').replace(/\s+/g, '');
    if (!normalized) return new Uint8Array();
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function inflatePayload() {
    if (payloadPromise) return payloadPromise;
    payloadPromise = (async () => {
      if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream is not available in this browser');
      const bytes = decodeBase64ToBytes(OVERLAY_B64);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(stream).text());
    })().catch((error) => {
      console.warn('[price-overlay-bridge]', error);
      payloadPromise = null;
      return null;
    });
    return payloadPromise;
  }

  function globalState() {
    if (typeof state !== 'undefined') return state;
    if (typeof window !== 'undefined' && window.state) return window.state;
    return null;
  }

  function priceState() {
    const rootState = globalState();
    return rootState && rootState.priceWorkbench ? rootState.priceWorkbench : null;
  }

  function isoDate(value) {
    return value ? String(value).slice(0, 10) : '';
  }

  function norm(value) {
    return String(value || '').trim().toLowerCase();
  }

  function marketKey(value) {
    const normalized = norm(value);
    return normalized === 'ya' ? 'ym' : normalized || 'wb';
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function overlayFlagEnabled(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function ensureBaseRow(row) {
    if (!row || row.__overlayBridgeBase) return row && row.__overlayBridgeBase;
    row.__overlayBridgeBase = {
      monthly: clone(Array.isArray(row.monthly) ? row.monthly : []),
      currentFillPrice: row.currentFillPrice,
      currentPrice: row.currentPrice,
      currentClientPrice: row.currentClientPrice,
      currentSppPct: row.currentSppPct,
      currentTurnoverDays: row.currentTurnoverDays,
      turnoverCurrentDays: row.turnoverCurrentDays,
      owner: row.owner,
      status: row.status,
      historyNote: row.historyNote
    };
    return row.__overlayBridgeBase;
  }

  function resetRow(row) {
    const base = ensureBaseRow(row);
    if (!base) return;
    row.monthly = clone(base.monthly);
    row.currentFillPrice = base.currentFillPrice;
    row.currentPrice = base.currentPrice;
    row.currentClientPrice = base.currentClientPrice;
    row.currentSppPct = base.currentSppPct;
    row.currentTurnoverDays = base.currentTurnoverDays;
    row.turnoverCurrentDays = base.turnoverCurrentDays;
    row.owner = base.owner;
    row.status = base.status;
    row.historyNote = base.historyNote;
  }

  function clearOverlayPoint(point, overlayRow) {
    if (!point || !overlayRow) return;
    if (overlayFlagEnabled(overlayRow.clearCurrentFillPrice) || overlayFlagEnabled(overlayRow.clearCurrentPrice)) point.price = null;
    if (overlayFlagEnabled(overlayRow.clearCurrentClientPrice)) point.clientPrice = null;
    if (overlayFlagEnabled(overlayRow.clearCurrentSppPct)) point.sppPct = null;
    if (overlayFlagEnabled(overlayRow.clearCurrentTurnoverDays)) point.turnoverDays = null;
  }

  function mergeTimelineWithOverlay(baseTimeline, overlayRow, overlayDate) {
    const cutoff = isoDate((overlayRow && (overlayRow.valueDate || overlayRow.historyFreshnessDate)) || overlayDate);
    const next = clone(Array.isArray(baseTimeline) ? baseTimeline : []);
    if (!cutoff) return next;
    const filtered = next.filter((item) => {
      const date = isoDate(item && item.date);
      return !date || date <= cutoff;
    });
    let point = filtered.find((item) => isoDate(item && item.date) === cutoff);
    if (!point) {
      point = { date: cutoff };
      filtered.push(point);
    }
    if (overlayRow) {
      clearOverlayPoint(point, overlayRow);
      if (overlayRow.currentFillPrice != null) point.price = overlayRow.currentFillPrice;
      else if (overlayRow.currentPrice != null) point.price = overlayRow.currentPrice;
      if (overlayRow.currentClientPrice != null) point.clientPrice = overlayRow.currentClientPrice;
      if (overlayRow.currentSppPct != null) point.sppPct = overlayRow.currentSppPct;
      if (overlayRow.currentTurnoverDays != null) point.turnoverDays = overlayRow.currentTurnoverDays;
    }
    filtered.sort((left, right) => String((left && left.date) || '').localeCompare(String((right && right.date) || '')));
    return filtered;
  }

  function buildOverlayMaps(payload) {
    const maps = { wb: {}, ozon: {}, ym: {} };
    ['wb', 'ozon', 'ym', 'ya'].forEach((platform) => {
      const target = marketKey(platform);
      const rows = ((((payload || {}).platforms || {})[platform] || {}).rows) || {};
      Object.keys(rows).forEach((key) => {
        const row = rows[key];
        const articleKey = norm(row && (row.articleKey || row.article || row.sku || key));
        if (!articleKey || maps[target][articleKey]) return;
        maps[target][articleKey] = row;
      });
    });
    return maps;
  }

  function applyOverlayToRow(row, overlayRow, overlayDate) {
    if (!row) return;
    resetRow(row);
    if (!overlayRow) return;
    row.monthly = mergeTimelineWithOverlay(row.__overlayBridgeBase && row.__overlayBridgeBase.monthly, overlayRow, overlayDate);
    const clearsFill = overlayFlagEnabled(overlayRow.clearCurrentFillPrice) || overlayFlagEnabled(overlayRow.clearCurrentPrice);
    const clearsClient = overlayFlagEnabled(overlayRow.clearCurrentClientPrice);
    const clearsSpp = overlayFlagEnabled(overlayRow.clearCurrentSppPct);
    const clearsTurnover = overlayFlagEnabled(overlayRow.clearCurrentTurnoverDays);
    const overlayFill = overlayRow.currentFillPrice != null ? overlayRow.currentFillPrice : overlayRow.currentPrice;
    row.currentFillPrice = clearsFill ? null : (overlayFill != null ? overlayFill : row.currentFillPrice);
    row.currentPrice = row.currentFillPrice;
    row.currentClientPrice = clearsClient ? null : (overlayRow.currentClientPrice != null ? overlayRow.currentClientPrice : row.currentClientPrice);
    row.currentSppPct = clearsSpp ? null : (overlayRow.currentSppPct != null ? overlayRow.currentSppPct : row.currentSppPct);
    if (clearsTurnover) {
      row.currentTurnoverDays = null;
      row.turnoverCurrentDays = null;
    } else if (overlayRow.currentTurnoverDays != null) {
      row.currentTurnoverDays = overlayRow.currentTurnoverDays;
      row.turnoverCurrentDays = overlayRow.currentTurnoverDays;
    }
    if (overlayRow.owner) row.owner = overlayRow.owner;
    if (overlayRow.status) row.status = overlayRow.status;
  }

  function latestKnownDate(rows) {
    let latest = '';
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      (Array.isArray(row && row.monthly) ? row.monthly : []).forEach((item) => {
        const date = isoDate(item && item.date);
        if (date && (!latest || date > latest)) latest = date;
      });
    });
    return latest;
  }

  function buildPresetRange(priceStateRef, preset, market) {
    const rows = ((((priceStateRef.seed || {}).platforms || {})[market] || {}).rows) || [];
    const latest = latestKnownDate(rows);
    if (!latest) return { dateFrom: '', dateTo: '' };
    let earliest = '';
    rows.forEach((row) => {
      (Array.isArray(row && row.monthly) ? row.monthly : []).forEach((item) => {
        const date = isoDate(item && item.date);
        if (date && (!earliest || date < earliest)) earliest = date;
      });
    });
    if (preset === 'all') return { dateFrom: earliest, dateTo: latest };
    const latestDate = new Date(latest + 'T12:00:00');
    if (preset === 'prev_month') {
      const start = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), 0));
      return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) };
    }
    if (preset === 'month') {
      const start = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), 1));
      return { dateFrom: start.toISOString().slice(0, 10), dateTo: latest };
    }
    const days = preset === '7d' ? 7 : preset === '14d' ? 14 : 30;
    const start = new Date(latestDate.getTime());
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const dateFrom = start.toISOString().slice(0, 10);
    return { dateFrom: earliest && dateFrom < earliest ? earliest : dateFrom, dateTo: latest };
  }

  function requestRerender() {
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => {
      const rootState = globalState();
      if (rootState && rootState.activeView === 'prices' && typeof window.renderPriceWorkbench === 'function') {
        window.renderPriceWorkbench();
      }
    }, 20);
  }

  async function warm() {
    const priceStateRef = priceState();
    if (!priceStateRef || !priceStateRef.seed || priceStateRef.__overlayBridgeApplied) return;
    const payload = await inflatePayload();
    if (!payload || !payload.platforms) return;
    const overlayDate = isoDate(payload.asOfDate || payload.generatedAt);
    const maps = buildOverlayMaps(payload);
    Object.keys((priceStateRef.seed || {}).platforms || {}).forEach((platform) => {
      const rows = ((((priceStateRef.seed || {}).platforms || {})[platform] || {}).rows) || [];
      rows.forEach((row) => {
        const key = norm(row && (row.articleKey || row.article || row.sku));
        applyOverlayToRow(row, key ? maps[marketKey(platform)][key] || null : null, overlayDate);
      });
    });
    priceStateRef.overlayMeta = {
      available: true,
      version: overlayDate,
      generatedAt: String(payload.generatedAt || ''),
      asOfDate: overlayDate
    };
    if (priceStateRef.filters && priceStateRef.filters.preset && priceStateRef.filters.preset !== 'custom') {
      const range = buildPresetRange(priceStateRef, priceStateRef.filters.preset, marketKey(priceStateRef.filters.market));
      priceStateRef.filters.dateFrom = range.dateFrom;
      priceStateRef.filters.dateTo = range.dateTo;
    }
    priceStateRef.__overlayBridgeApplied = true;
    requestRerender();
  }

  function install() {
    if (typeof window.renderPriceWorkbench !== 'function' || window.renderPriceWorkbench.__ALTEA_OVERLAY_BRIDGE_PATCHED__) return false;
    const original = window.renderPriceWorkbench;
    window.renderPriceWorkbench = function patchedRenderPriceWorkbench() {
      warm().catch((error) => console.warn('[price-overlay-bridge]', error));
      return original.apply(this, arguments);
    };
    window.renderPriceWorkbench.__ALTEA_OVERLAY_BRIDGE_PATCHED__ = true;
    warm().catch((error) => console.warn('[price-overlay-bridge]', error));
    return true;
  }

  window.addEventListener('altea:viewchange', function (event) {
    if (!event || !event.detail || event.detail.view !== 'prices') return;
    warm().catch((error) => console.warn('[price-overlay-bridge]', error));
  });

  if (install()) return;
  let attempts = 0;
  const timer = setInterval(function () {
    attempts += 1;
    if (install() || attempts >= 40) clearInterval(timer);
  }, 250);
})();
