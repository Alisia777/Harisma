(function () {
  if (window.__ALTEA_TEAM_RECONNECT_HOTFIX_20260420B__) return;
  window.__ALTEA_TEAM_RECONNECT_HOTFIX_20260420B__ = true;

  let reconnectInFlight = false;
  let bootRecoveryInFlight = false;
  const disableLegacyPriceRuntime = Boolean(window.__ALTEA_PRICE_SIMPLE_RUNTIME_MODE__);

  function ensureDashboardModalTaskHotfix() {
    if (document.querySelector('script[data-portal-dashboard-modal-task-hotfix="1"]')) return;
    if (Array.from(document.scripts || []).some((script) => String(script.src || '').includes('portal-dashboard-modal-task-hotfix.js'))) return;
    const script = document.createElement('script');
    script.src = 'portal-dashboard-modal-task-hotfix.js?v=20260420a';
    script.async = false;
    script.dataset.portalDashboardModalTaskHotfix = '1';
    (document.head || document.body || document.documentElement).appendChild(script);
  }

  function fallbackSetView(view) {
    if (!view) return;
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach((section) => {
      section.classList.toggle('active', section.id === `view-${view}`);
    });
    if (typeof rerenderCurrentView === 'function') {
      try {
        rerenderCurrentView();
      } catch (error) {
        console.warn('[portal-team-reconnect-hotfix] nav rerender', error);
      }
    }
  }

  function openViewFromSidebar(view) {
    if (!view) return;
    if (typeof setView === 'function') {
      try {
        setView(view);
        return;
      } catch (error) {
        console.warn('[portal-team-reconnect-hotfix] setView', error);
      }
    }
    fallbackSetView(view);
  }

  function bindSidebarNavRescue() {
    if (document.body?.dataset.portalNavRescueBound === '1') return;
    if (!document.querySelector('.nav-btn[data-view]')) return;
    document.body.dataset.portalNavRescueBound = '1';
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.nav-btn[data-view]');
      if (!button) return;
      openViewFromSidebar(button.dataset.view);
    }, true);
  }

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
    if (app.team.mode === 'pending' && !app.team.error && (app.team.accessToken || app.team.client)) return false;
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

      if ((app.team.accessToken || app.team.client) && typeof pullRemoteState === 'function') {
        await pullRemoteState(true);
      } else if (typeof initTeamStore === 'function') {
        await initTeamStore();
        if (app.boot.dataReady && typeof rerenderCurrentView === 'function') {
          rerenderCurrentView();
          if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
        }
      }
    } catch (error) {
      console.warn('[portal-team-reconnect-hotfix] reconnect', error);
    } finally {
      reconnectInFlight = false;
    }
  }

  function cloneFallback(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function isLooseJsonTokenBoundary(char) {
    return char === undefined || /[\s,\]\[}{:]/.test(char);
  }

  function sanitizeLooseJsonHotfix(text) {
    if (!text || typeof text !== 'string') return text;
    const replacements = [
      ['-Infinity', 'null'],
      ['Infinity', 'null'],
      ['NaN', 'null'],
      ['undefined', 'null']
    ];
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        result += char;
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        result += char;
        continue;
      }
      let matched = false;
      for (const [token, replacement] of replacements) {
        if (
          text.startsWith(token, i) &&
          isLooseJsonTokenBoundary(text[i - 1]) &&
          isLooseJsonTokenBoundary(text[i + token.length])
        ) {
          result += replacement;
          i += token.length - 1;
          matched = true;
          break;
        }
      }
      if (!matched) result += char;
    }

    return result;
  }

  async function safeLoadJson(path, fallback) {
    try {
      const resolved = path.includes('?') ? path : `${path}?v=20260420b`;
      const response = await fetch(resolved, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (error) {
        const sanitized = sanitizeLooseJsonHotfix(text);
        if (sanitized === text) throw error;
        return JSON.parse(sanitized);
      }
    } catch (error) {
      console.warn('[portal-team-reconnect-hotfix] loadJson', path, error);
      return cloneFallback(fallback);
    }
  }

  async function rescueBootData(reason = '') {
    const app = appState();
    if (!app?.boot || bootRecoveryInFlight || app.boot.dataReady) return false;
    bootRecoveryInFlight = true;
    try {
      const local = typeof loadLocalStorage === 'function'
        ? loadLocalStorage()
        : { comments: [], tasks: [], decisions: [], ownerOverrides: [] };
      const [
        dashboard,
        skus,
        launches,
        meetings,
        documents,
        repricer,
        seed
      ] = await Promise.all([
        safeLoadJson('data/dashboard.json', { cards: [], generatedAt: '' }),
        safeLoadJson('data/skus.json', []),
        safeLoadJson('data/launches.json', []),
        safeLoadJson('data/meetings.json', []),
        safeLoadJson('data/documents.json', { groups: [] }),
        safeLoadJson('data/repricer.json', { generatedAt: '', summary: {}, rows: [] }),
        safeLoadJson('data/seed_comments.json', { comments: [], tasks: [] })
      ]);

      app.dashboard = dashboard || { cards: [] };
      app.skus = Array.isArray(skus) ? skus : [];
      app.launches = Array.isArray(launches) ? launches : [];
      app.meetings = Array.isArray(meetings) ? meetings : [];
      app.documents = documents || { groups: [] };
      app.repricer = repricer || { generatedAt: '', summary: {}, rows: [] };
      app.storage = {
        comments: Array.isArray(local.comments) ? local.comments : [],
        tasks: Array.isArray(local.tasks) ? local.tasks : [],
        decisions: Array.isArray(local.decisions) ? local.decisions : [],
        ownerOverrides: Array.isArray(local.ownerOverrides) ? local.ownerOverrides : []
      };

      if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
      if (typeof mergeSeedStorage === 'function') mergeSeedStorage(seed || {});
      if (!app.orderCalc.articleKey) app.orderCalc.articleKey = app.skus[0]?.articleKey || '';
      if (!app.orderCalc.daysToNextReceipt && typeof numberOrZero === 'function') {
        app.orderCalc.daysToNextReceipt = String(Math.round(numberOrZero(app.skus[0]?.leadTimeDays) || 30));
      }

      if (!Array.isArray(app.boot.dataWarnings)) app.boot.dataWarnings = [];
      if (reason && !app.boot.dataWarnings.includes(reason)) app.boot.dataWarnings.push(reason);
      app.boot.dataReady = true;

      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      if (app.activeView === 'dashboard' && typeof renderDashboard === 'function') {
        try {
          renderDashboard();
        } catch (error) {
          console.warn('[portal-team-reconnect-hotfix] dashboard render', error);
        }
      }
      if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
      window.dispatchEvent(new Event('resize'));
      window.setTimeout(() => {
        if (typeof rerenderCurrentView === 'function') {
          try {
            rerenderCurrentView();
          } catch (error) {
            console.warn('[portal-team-reconnect-hotfix] rerender after recovery', error);
          }
        }
      }, 160);
      if (typeof updateSyncBadge === 'function') updateSyncBadge();
      return true;
    } catch (error) {
      console.warn('[portal-team-reconnect-hotfix] boot recovery', error);
      return false;
    } finally {
      bootRecoveryInFlight = false;
    }
  }

  async function ensureBootAndReconnect(reason = '') {
    const app = appState();
    if (!app?.boot) return;
    if (!app.boot.dataReady) {
      const recovered = await rescueBootData(reason || 'recovery');
      if (!recovered) return;
    }
    await retryTeam(reason || 'Повторно загружаем командные данные…');
  }

  let priceRenderWrapped = false;
  let priceSupportPromise = null;
  let priceCloseRescueBound = false;

  function mergePriceSupportPayload(basePayload, overlayPayload) {
    const baseReady = basePayload?.platforms ? basePayload : null;
    const overlayReady = overlayPayload?.platforms ? overlayPayload : null;
    if (!baseReady && !overlayReady) return null;
    const merged = {
      ...(baseReady || {}),
      ...(overlayReady || {}),
      generatedAt: overlayReady?.generatedAt || baseReady?.generatedAt || '',
      platforms: {}
    };
    const platformKeys = new Set([
      ...Object.keys(baseReady?.platforms || {}),
      ...Object.keys(overlayReady?.platforms || {})
    ]);
    platformKeys.forEach((platformKey) => {
      const basePlatform = (baseReady?.platforms || {})[platformKey] || {};
      const overlayPlatform = (overlayReady?.platforms || {})[platformKey] || {};
      const rows = { ...(basePlatform.rows || {}) };
      Object.entries(overlayPlatform.rows || {}).forEach(([articleKey, overlayRow]) => {
        rows[articleKey] = { ...(rows[articleKey] || {}), ...(overlayRow || {}) };
      });
      merged.platforms[platformKey] = {
        ...basePlatform,
        ...overlayPlatform,
        rows
      };
    });
    return merged;
  }

  function decodeBase64ToBytes(base64) {
    const normalized = String(base64 || '').replace(/\s+/g, '');
    if (!normalized) return new Uint8Array();
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function inflateBase64Gzip(base64) {
    const bytes = decodeBase64ToBytes(base64);
    if (!bytes.length) return '';
    if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unavailable');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  function normalizePriceMarket(marketplace) {
    const market = String(marketplace || '').trim().toLowerCase();
    if (market === 'ya' || market === 'ym' || market.includes('market')) return 'ym';
    if (market.includes('oz')) return 'ozon';
    return 'wb';
  }

  function splitPriceKey(key) {
    const value = String(key || '');
    if (!value.includes('::')) return { market: 'wb', articleKey: value };
    const [market, articleKey] = value.split('::');
    return { market: normalizePriceMarket(market), articleKey: String(articleKey || '') };
  }

  function priceSupportPaths() {
    const version = 'v=20260420m';
    return [
      `portal-price-workbench.support.gz.part01.txt?${version}`,
      `portal-price-workbench.support.gz.part02.txt?${version}`,
      `portal-price-workbench.support.gz.part03.txt?${version}`,
      `portal-price-workbench.support.gz.part04.txt?${version}`
    ];
  }

  function loadPriceSupportPayload() {
    if (priceSupportPromise) return priceSupportPromise;
    const compressedLoader = Promise.all(
      priceSupportPaths().map(async (src) => {
        const response = await fetch(src, { cache: 'no-store' });
        if (!response.ok) throw new Error(src);
        return response.text();
      })
    )
      .then((parts) => parts.join(''))
      .then(inflateBase64Gzip)
      .then((text) => JSON.parse(text))
      .catch((error) => {
        console.warn('[portal-team-reconnect-hotfix] price support bundle', error);
        return null;
      });
    const directLoader = safeLoadJson('data/price_workbench_status_overlay.json', null).catch(() => null);
    priceSupportPromise = Promise.all([compressedLoader, directLoader])
      .then(([compressedPayload, directPayload]) => mergePriceSupportPayload(compressedPayload, directPayload))
      .catch((error) => {
        console.warn('[portal-team-reconnect-hotfix] price support payload', error);
        return null;
      });
    return priceSupportPromise;
  }

  function mergePriceSupportIntoState(payload) {
    const app = appState();
    if (!app?.priceWorkbench || !payload?.platforms) return false;
    const current = app.priceWorkbench.support?.platforms ? app.priceWorkbench.support : null;
    app.priceWorkbench.support = mergePriceSupportPayload(current, payload) || payload;
    return true;
  }

  function getPriceSupportRow(key) {
    const app = appState();
    const { market, articleKey } = splitPriceKey(key);
    return app?.priceWorkbench?.support?.platforms?.[market]?.rows?.[articleKey] || null;
  }

  function formatPricePct(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${(num * 100).toFixed(1)}%`;
  }

  function priceSupportStatus(row) {
    const value = row?.productStatus ?? row?.status ?? row?.statusText ?? '';
    return String(value || '').trim();
  }

  function priceSupportStatusNote(row) {
    const value = row?.statusNote ?? row?.historyQuality ?? row?.comment ?? row?.interpretation ?? '';
    return String(value || '').trim();
  }

  function ensurePriceRescueStyles() {
    if (document.getElementById('portalPriceRescueStyles')) return;
    const style = document.createElement('style');
    style.id = 'portalPriceRescueStyles';
    style.textContent = `
      .price-livefix-row-meta { margin-top: 6px; font-size: 11px; line-height: 1.35; color: rgba(255, 228, 187, 0.76); }
      .price-livefix-row-meta strong { color: #f7d48a; font-weight: 700; }
      .price-livefix-kpis { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin: 16px 0; }
      .price-livefix-kpi { border: 1px solid rgba(214, 176, 96, 0.22); border-radius: 16px; padding: 14px 16px; background: rgba(25, 19, 14, 0.76); }
      .price-livefix-kpi span { display: block; margin-bottom: 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255, 228, 187, 0.72); }
      .price-livefix-kpi strong { display: block; font-size: 24px; line-height: 1.1; color: #fff1d4; }
      .price-livefix-kpi small { display: block; margin-top: 6px; font-size: 12px; line-height: 1.4; color: rgba(255, 228, 187, 0.74); }
    `;
    (document.head || document.body || document.documentElement).appendChild(style);
  }

  function patchPriceTableMeta() {
    const root = document.getElementById('view-prices');
    if (!root || !root.classList.contains('active')) return;
    ensurePriceRescueStyles();
    root.querySelectorAll('[data-price-open]').forEach((rowNode) => {
      const supportRow = getPriceSupportRow(rowNode.getAttribute('data-price-open'));
      if (!supportRow) return;
      const hostCell = rowNode.querySelector('td');
      if (!hostCell) return;
      const status = priceSupportStatus(supportRow);
      const allowedPct = Number(supportRow?.allowedMarginPct);
      const bits = [];
      if (status) bits.push(status);
      if (Number.isFinite(allowedPct)) bits.push(`Доп. 3м ${formatPricePct(allowedPct)}`);
      if (!bits.length) return;
      let meta = hostCell.querySelector('[data-price-livefix-meta="1"]');
      if (!meta) {
        meta = document.createElement('div');
        meta.dataset.priceLivefixMeta = '1';
        meta.className = 'price-livefix-row-meta';
        hostCell.appendChild(meta);
      }
      meta.innerHTML = bits.map((item, index) => index === 0 ? `<strong>${item}</strong>` : item).join(' · ');
    });
  }

  function patchModalKpi(body, matcher, value, note) {
    const kpi = Array.from(body.querySelectorAll('.price-modal-kpi')).find((node) => {
      const label = (node.querySelector('.label') || node.querySelector('span'))?.textContent || '';
      return label.toLowerCase().includes(matcher);
    });
    if (!kpi) return false;
    const strong = kpi.querySelector('strong');
    const small = kpi.querySelector('small');
    if (strong) strong.textContent = value;
    if (small) small.textContent = note;
    return true;
  }

  function patchPriceModalMeta() {
    const modal = document.getElementById('skuModal');
    const body = document.getElementById('skuModalBody');
    if (!modal || !body) return;
    if (!modal.classList.contains('open') && !modal.classList.contains('active')) return;
    const app = appState();
    const selectedKey = app?.priceWorkbench?.selectedKey;
    if (!selectedKey) return;
    const supportRow = getPriceSupportRow(selectedKey);
    if (!supportRow) return;
    ensurePriceRescueStyles();
    const allowedPct = Number(supportRow?.allowedMarginPct);
    const allowedValue = Number.isFinite(allowedPct) ? formatPricePct(allowedPct) : '—';
    const allowedNote = 'Средняя допустимая маржа за последние 3 месяца.';
    const statusValue = priceSupportStatus(supportRow) || '—';
    const statusNote = priceSupportStatusNote(supportRow) || 'Статус из рабочих файлов пока не заполнен.';

    const allowedPatched = patchModalKpi(body, 'допуст', allowedValue, allowedNote);
    const statusPatched = patchModalKpi(body, 'статус', statusValue, statusNote);
    if (allowedPatched && statusPatched) return;

    let host = body.querySelector('[data-price-livefix-kpis="1"]');
    if (!host) {
      host = document.createElement('div');
      host.dataset.priceLivefixKpis = '1';
      host.className = 'price-livefix-kpis';
      host.innerHTML = `
        <div class="price-livefix-kpi">
          <span>Допустимая маржа 3м</span>
          <strong data-price-livefix-allowed>${allowedValue}</strong>
          <small data-price-livefix-allowed-note>${allowedNote}</small>
        </div>
        <div class="price-livefix-kpi">
          <span>Статус товара</span>
          <strong data-price-livefix-status>${statusValue}</strong>
          <small data-price-livefix-status-note>${statusNote}</small>
        </div>
      `;
      const card = body.querySelector('.price-modal-card');
      if (card) card.insertBefore(host, card.children[1] || card.firstChild);
      else body.prepend(host);
    } else {
      const allowedStrong = host.querySelector('[data-price-livefix-allowed]');
      const allowedSmall = host.querySelector('[data-price-livefix-allowed-note]');
      const statusStrong = host.querySelector('[data-price-livefix-status]');
      const statusSmall = host.querySelector('[data-price-livefix-status-note]');
      if (allowedStrong) allowedStrong.textContent = allowedValue;
      if (allowedSmall) allowedSmall.textContent = allowedNote;
      if (statusStrong) statusStrong.textContent = statusValue;
      if (statusSmall) statusSmall.textContent = statusNote;
    }
  }

  function closePriceModal(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const modal = document.getElementById('skuModal');
    const body = document.getElementById('skuModalBody');
    if (modal) {
      modal.classList.remove('open');
      modal.classList.remove('active');
    }
    if (body) body.innerHTML = '';
    const app = appState();
    if (app?.priceWorkbench) app.priceWorkbench.selectedKey = '';
  }

  function bindPriceCloseRescue() {
    if (priceCloseRescueBound) return;
    priceCloseRescueBound = true;
    document.addEventListener('click', (event) => {
      const closeButton = event.target.closest('#skuModal [data-close-modal]');
      if (closeButton) {
        closePriceModal(event);
        return;
      }
      const modal = document.getElementById('skuModal');
      if (modal && event.target === modal && (modal.classList.contains('open') || modal.classList.contains('active'))) {
        closePriceModal(event);
      }
    }, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closePriceModal(event);
    }, true);
  }

  function enhancePriceWorkbenchUi() {
    bindPriceCloseRescue();
    patchPriceTableMeta();
    patchPriceModalMeta();
  }

  function wrapPriceRender() {
    if (priceRenderWrapped || typeof window.renderPriceWorkbench !== 'function') return;
    const originalRender = window.renderPriceWorkbench;
    window.renderPriceWorkbench = function wrappedPriceWorkbenchRender(...args) {
      const result = originalRender.apply(this, args);
      window.setTimeout(enhancePriceWorkbenchUi, 0);
      return result;
    };
    priceRenderWrapped = true;
    window.setTimeout(enhancePriceWorkbenchUi, 0);
  }

  function primePriceWorkbenchRescue() {
    if (disableLegacyPriceRuntime) return;
    wrapPriceRender();
    bindPriceCloseRescue();
    loadPriceSupportPayload().then((payload) => {
      if (payload) {
        const merged = mergePriceSupportIntoState(payload);
        const app = appState();
        if (merged && app?.activeView === 'prices' && typeof window.renderPriceWorkbench === 'function') {
          try {
            window.renderPriceWorkbench();
          } catch (error) {
            console.warn('[portal-team-reconnect-hotfix] price rerender', error);
          }
        }
      }
      enhancePriceWorkbenchUi();
    });
  }

  ensureDashboardModalTaskHotfix();
  bindSidebarNavRescue();
  window.setTimeout(() => {
    ensureBootAndReconnect('Восстанавливаем экран и командные данные…');
  }, 3500);
  if (!disableLegacyPriceRuntime) {
    document.addEventListener('click', (event) => {
      const priceButton = event.target.closest('.nav-btn[data-view="prices"]');
      if (!priceButton) return;
      window.setTimeout(primePriceWorkbenchRescue, 120);
    }, true);
  }
  document.getElementById('pullRemoteBtn')?.addEventListener('click', () => {
    window.setTimeout(() => ensureBootAndReconnect('Повторно подключаем командную базу…'), 160);
  });
  if (!disableLegacyPriceRuntime && appState()?.activeView === 'prices') window.setTimeout(primePriceWorkbenchRescue, 220);
  return;

  [2500, 7000, 14000, 24000, 36000].forEach((delay, index) => {
    window.setTimeout(() => {
      ensureBootAndReconnect(index === 0 ? 'Восстанавливаем экран и командные данные…' : 'Повторно загружаем командные данные…');
    }, delay);
  });

  ensureDashboardModalTaskHotfix();
  [120, 1200, 4000].forEach((delay) => {
    window.setTimeout(ensureDashboardModalTaskHotfix, delay);
  });
  bindSidebarNavRescue();
  [600, 2200, 6000].forEach((delay) => {
    window.setTimeout(bindSidebarNavRescue, delay);
  });
  [900, 2200, 5000, 9000].forEach((delay) => {
    window.setTimeout(primePriceWorkbenchRescue, delay);
  });
  document.addEventListener('click', (event) => {
    const priceButton = event.target.closest('.nav-btn[data-view="prices"]');
    if (!priceButton) return;
    window.setTimeout(primePriceWorkbenchRescue, 120);
    window.setTimeout(primePriceWorkbenchRescue, 900);
  }, true);
})();
