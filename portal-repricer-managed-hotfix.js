(function () {
  if (window.__ALTEA_REPRICER_MANAGED_HOTFIX_LOADER_20260425B__) return;
  window.__ALTEA_REPRICER_MANAGED_HOTFIX_LOADER_20260425B__ = true;

  const VERSION = '20260425b';
  const SNAPSHOT_TABLE = 'portal_data_snapshots';
  const SNAPSHOT_KEY = 'repricer_runtime_hotfix_20260424b';
  const LOCAL_RUNTIME_MANIFEST = `${SNAPSHOT_KEY}.json`;
  const RUNTIME_FETCH_TIMEOUT_MS = 4500;
  const FALLBACK_CONFIG = {
    brand: '\u0410\u043b\u0442\u0435\u044f',
    supabase: {
      url: 'https://iyckwryrucqrxwlowxow.supabase.co',
      anonKey: 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw'
    }
  };

  function cfg() {
    const raw = typeof currentConfig === 'function'
      ? (currentConfig() || {})
      : (window.APP_CONFIG || {});
    const rawSupabase = raw.supabase || {};
    return {
      ...FALLBACK_CONFIG,
      ...raw,
      supabase: {
        ...FALLBACK_CONFIG.supabase,
        ...rawSupabase,
        url: rawSupabase.url || FALLBACK_CONFIG.supabase.url,
        anonKey: rawSupabase.anonKey || FALLBACK_CONFIG.supabase.anonKey
      }
    };
  }

  function brand() {
    if (typeof currentBrand === 'function') return currentBrand();
    return cfg().brand || FALLBACK_CONFIG.brand;
  }

  function escapeFallbackHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function emergencyCard(title, message) {
    return `
      <div class="card">
        <div class="head">
          <div>
            <h3>${escapeFallbackHtml(title)}</h3>
            <div class="muted small">Emergency fallback is active</div>
          </div>
          <span class="badge badge-warn">recovery</span>
        </div>
        <div class="muted" style="margin-top:10px">${escapeFallbackHtml(message)}</div>
        <div class="muted small" style="margin-top:8px">The main production bundle did not load completely. Other sections stay available while the missing tail of the file is being restored.</div>
      </div>
    `;
  }

  function installFallbackRenderer(name, rootId, title, message) {
    if (typeof window[name] === 'function') return false;
    window[name] = function emergencyViewRenderer() {
      const root = document.getElementById(rootId);
      if (!root) return;
      root.innerHTML = emergencyCard(title, message);
    };
    return true;
  }

  function installAppErrorFallback() {
    if (typeof window.setAppError === 'function') return false;
    window.setAppError = function setAppErrorFallback(message = '') {
      const banner = document.getElementById('appError');
      if (!banner) return;
      if (!message) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
      }
      banner.textContent = String(message || '');
      banner.classList.remove('hidden');
    };
    return true;
  }

  function installSyncBadgeFallback() {
    if (typeof window.updateSyncBadge === 'function') return false;
    window.updateSyncBadge = function updateSyncBadgeFallback() {
      const badge = document.getElementById('syncStatusBadge');
      if (!badge) return;
      const errors = Array.isArray(window.state?.runtimeErrors) ? window.state.runtimeErrors : [];
      const runtimeSuffix = errors.length ? ' | emergency mode' : '';
      badge.className = `sync-status ${errors.length ? 'pending' : 'local'}`;
      badge.textContent = `${window.state?.team?.note || 'Local mode'}${runtimeSuffix}`;
    };
    return true;
  }

  function installViewFailureFallback() {
    if (typeof window.renderViewFailure === 'function') return false;
    window.renderViewFailure = function renderViewFailureFallback(rootId, title, error) {
      const root = document.getElementById(rootId);
      if (!root) return;
      root.innerHTML = emergencyCard(title, error?.message || 'This screen is temporarily unavailable');
    };
    return true;
  }

  function installOwnerOverrideFallback() {
    if (typeof window.applyOwnerOverridesToSkus === 'function') return false;
    window.applyOwnerOverridesToSkus = function applyOwnerOverridesToSkusFallback() {};
    return true;
  }

  function installRerenderFallback() {
    if (typeof window.rerenderCurrentView === 'function') return false;

    window.rerenderCurrentView = function rerenderCurrentViewFallback() {
      try {
        window.applyOwnerOverridesToSkus?.();
      } catch (error) {
        console.warn('[portal-emergency-rerender] applyOwnerOverridesToSkus failed', error);
      }

      const renderPlan = [
        ['dashboard', 'view-dashboard', 'Dashboard', window.renderDashboard],
        ['documents', 'view-documents', 'Documents', window.renderDocuments],
        ['repricer', 'view-repricer', 'Repricer', window.renderRepricer],
        ['prices', 'view-prices', 'Prices', () => window.renderPriceWorkbench?.()],
        ['order', 'view-order', 'Order', window.renderOrderCalculator],
        ['control', 'view-control', 'Tasks', window.renderControlCenter],
        ['skus', 'view-skus', 'SKU registry', window.renderSkuRegistry],
        ['launches', 'view-launches', 'Product / Ksenia', window.renderLaunches],
        ['launch-control', 'view-launch-control', 'Launch control', window.renderLaunchControl],
        ['meetings', 'view-meetings', 'Work rhythm', window.renderMeetings],
        ['executive', 'view-executive', 'Executive', window.renderExecutive]
      ];

      const activeView = String(window.state?.activeView || 'dashboard');
      const target = renderPlan.find(([view]) => view === activeView) || renderPlan[0];
      const [, rootId, title, renderer] = target;
      const errors = [];

      try {
        if (typeof renderer === 'function') renderer();
        else throw new Error(`Renderer ${title} is not available`);
      } catch (error) {
        console.error(error);
        errors.push(`${title}: ${error.message}`);
        window.renderViewFailure?.(rootId, title, error);
      }

      if (window.state) window.state.runtimeErrors = errors;
      window.updateSyncBadge?.();
      window.setAppError?.(errors.length ? `Portal loaded with gaps: ${errors[0]}` : '');
    };

    return true;
  }

  function installEmergencyAppCoreFallbacks() {
    const installed = [];

    if (installAppErrorFallback()) installed.push('setAppError');
    if (installSyncBadgeFallback()) installed.push('updateSyncBadge');
    if (installViewFailureFallback()) installed.push('renderViewFailure');
    if (installOwnerOverrideFallback()) installed.push('applyOwnerOverridesToSkus');

    const renderers = [
      ['renderDashboard', 'view-dashboard', 'Dashboard', 'The main screen is still recovering after an incomplete app-core publish.'],
      ['renderDocuments', 'view-documents', 'Documents', 'The documents section is temporarily served in a safe fallback mode.'],
      ['renderRepricer', 'view-repricer', 'Repricer', 'The repricer section is temporarily served through an emergency fallback.'],
      ['renderOrderCalculator', 'view-order', 'Order', 'The order and logistics block did not make it into the published bundle and is temporarily hidden.'],
      ['renderControlCenter', 'view-control', 'Tasks', 'The task control section is temporarily served in a safe fallback mode.'],
      ['renderSkuRegistry', 'view-skus', 'SKU registry', 'The SKU registry is temporarily unavailable until the full file is restored.'],
      ['renderLaunches', 'view-launches', 'Product / Ksenia', 'The product screen is temporarily unavailable until the full file is restored.'],
      ['renderLaunchControl', 'view-launch-control', 'Launch control', 'The launch-control screen is temporarily unavailable until the full file is restored.'],
      ['renderMeetings', 'view-meetings', 'Work rhythm', 'The meetings screen is temporarily served in a safe fallback mode.'],
      ['renderExecutive', 'view-executive', 'Executive', 'The executive summary is temporarily unavailable until the full file is restored.']
    ];

    for (const [name, rootId, title, message] of renderers) {
      if (installFallbackRenderer(name, rootId, title, message)) installed.push(name);
    }

    if (installRerenderFallback()) installed.push('rerenderCurrentView');

    if (installed.length) {
      console.warn('[portal-repricer-managed-hotfix-loader] app-core emergency fallbacks installed', installed);
    }

    return installed.length > 0;
  }

  function scheduleRecoveryRerender() {
    [40, 180, 700, 1600].forEach((delay) => {
      window.setTimeout(() => {
        if (typeof window.rerenderCurrentView !== 'function') return;
        try {
          window.rerenderCurrentView();
        } catch (error) {
          console.warn('[portal-repricer-managed-hotfix-loader] recovery rerender failed', error);
        }
      }, delay);
    });
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error(label)), ms);
      })
    ]);
  }

  async function fetchSupabasePayload() {
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

    const response = await withTimeout(fetch(url.toString(), {
      cache: 'no-store',
      headers: {
        apikey: activeCfg.supabase.anonKey,
        Authorization: `Bearer ${activeCfg.supabase.anonKey}`,
        Accept: 'application/json'
      }
    }), RUNTIME_FETCH_TIMEOUT_MS, 'Supabase runtime timed out');

    if (!response.ok) throw new Error(`Supabase runtime ${response.status}`);

    const rows = await withTimeout(
      response.json(),
      RUNTIME_FETCH_TIMEOUT_MS,
      'Supabase runtime body timed out'
    );

    const main = rows.find((row) => row?.snapshot_key === SNAPSHOT_KEY);
    if (!main) throw new Error(`Runtime snapshot ${SNAPSHOT_KEY} is missing`);

    if (main.payload?.chunked) {
      const parts = rows
        .filter((row) => String(row?.snapshot_key || '').startsWith(`${SNAPSHOT_KEY}__part__`))
        .sort((left, right) => String(left.snapshot_key).localeCompare(String(right.snapshot_key)));
      const expectedParts = Number(main.payload.chunk_count || 0);
      if (expectedParts && parts.length < expectedParts) {
        throw new Error(`Runtime snapshot is incomplete: ${parts.length}/${expectedParts}`);
      }
      return JSON.parse(parts.map((row) => String(row?.payload?.data || '')).join(''));
    }

    return main.payload;
  }

  function parseLocalChunk(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    try {
      return JSON.parse(raw);
    } catch (error) {
      return raw.replace(/^"+/, '').replace(/"+$/, '');
    }
  }

  async function fetchLocalPayload() {
    const manifestResponse = await withTimeout(
      fetch(`${LOCAL_RUNTIME_MANIFEST}?v=${VERSION}`, { cache: 'no-store' }),
      RUNTIME_FETCH_TIMEOUT_MS,
      'Local runtime manifest timed out'
    );

    if (!manifestResponse.ok) {
      throw new Error(`Local runtime manifest ${manifestResponse.status}`);
    }

    const manifest = await withTimeout(
      manifestResponse.json(),
      RUNTIME_FETCH_TIMEOUT_MS,
      'Local runtime manifest body timed out'
    );

    if (manifest?.chunked) {
      const expectedParts = Number(manifest.chunk_count || 0);
      if (expectedParts <= 0) {
        throw new Error('Local runtime manifest does not declare chunk_count');
      }

      const chunks = await Promise.all(Array.from({ length: expectedParts }, (_, index) => {
        const partUrl = `${SNAPSHOT_KEY}.part${index + 1}.txt?v=${VERSION}`;
        return withTimeout(
          fetch(partUrl, { cache: 'no-store' }),
          RUNTIME_FETCH_TIMEOUT_MS,
          `Local runtime part ${index + 1} timed out`
        ).then((response) => {
          if (!response.ok) throw new Error(`Local runtime part ${index + 1} ${response.status}`);
          return withTimeout(
            response.text(),
            RUNTIME_FETCH_TIMEOUT_MS,
            `Local runtime part ${index + 1} body timed out`
          );
        });
      }));

      return parseLocalChunk(chunks.join(''));
    }

    if (typeof manifest?.payload === 'string' && manifest.payload) return manifest.payload;
    throw new Error('Local runtime payload is missing');
  }

  async function fetchPayload() {
    try {
      return await fetchSupabasePayload();
    } catch (error) {
      console.warn('[portal-repricer-managed-hotfix-loader] supabase runtime fallback', error);
    }
    return await fetchLocalPayload();
  }

  async function inflateSource() {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('DecompressionStream is not available in this browser');
    }

    const binary = atob(await fetchPayload());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }

  let bootPromise = null;

  async function boot() {
    if (bootPromise) return bootPromise;

    bootPromise = (async () => {
      const source = await inflateSource();
      const blob = new Blob(
        [source + '\n//# sourceURL=portal-repricer-managed-hotfix-' + VERSION + '.js'],
        { type: 'text/javascript' }
      );
      const scriptUrl = URL.createObjectURL(blob);

      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = scriptUrl;
          script.async = false;
          script.onload = () => {
            script.remove();
            resolve();
          };
          script.onerror = (error) => {
            script.remove();
            reject(error || new Error('Failed to execute repricer hotfix runtime'));
          };
          document.head.appendChild(script);
        });
      } finally {
        URL.revokeObjectURL(scriptUrl);
      }

      if (typeof window.rerenderCurrentView === 'function' && window.state?.activeView === 'repricer') {
        window.rerenderCurrentView();
      }
    })().catch((error) => {
      console.warn('[portal-repricer-managed-hotfix-loader]', error);
      bootPromise = null;
      throw error;
    });

    return bootPromise;
  }

  function start() {
    const installedEmergencyFallbacks = installEmergencyAppCoreFallbacks();
    if (installedEmergencyFallbacks) scheduleRecoveryRerender();

    if (window.__ALTEA_REPRICER_MANAGED_HOTFIX_20260424B__) {
      if (typeof window.rerenderCurrentView === 'function' && window.state?.activeView === 'repricer') {
        window.rerenderCurrentView();
      }
      return;
    }

    boot().catch(() => {});
  }

  installEmergencyAppCoreFallbacks();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(start, 120), { once: true });
  } else {
    window.setTimeout(start, 120);
  }

  window.addEventListener('load', () => window.setTimeout(start, 120), { once: true });
  window.setTimeout(start, 1200);
})();