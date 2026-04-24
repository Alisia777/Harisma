(function () {
  if (window.__ALTEA_REPRICER_MANAGED_HOTFIX_LOADER_20260424D__) return;
  window.__ALTEA_REPRICER_MANAGED_HOTFIX_LOADER_20260424D__ = true;
  const VERSION = '20260424b';
  const SNAPSHOT_TABLE = 'portal_data_snapshots';
  const SNAPSHOT_KEY = 'repricer_runtime_hotfix_20260424b';
  const STATIC_PAYLOAD_PATH = 'repricer_runtime_hotfix_20260424b.json';
  const STATIC_PART_PATHS = [
    'repricer_runtime_hotfix_20260424b.part1.txt',
    'repricer_runtime_hotfix_20260424b.part2.txt',
    'repricer_runtime_hotfix_20260424b.part3.txt'
  ];
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

  async function fetchStaticPayload() {
    if (typeof fetch !== 'function') return null;
    try {
      const response = await fetch(STATIC_PAYLOAD_PATH, { cache: 'no-store' });
      if (response?.ok) {
        const payload = await response.json();
        if (typeof payload === 'string' && payload.length > 30000) return payload;
      }
    } catch (error) {
      console.warn('[portal-repricer-managed-hotfix-loader] static payload', error);
    }
    try {
      const parts = await Promise.all(
        STATIC_PART_PATHS.map(async (path) => {
          const response = await fetch(path, { cache: 'no-store' });
          if (!response?.ok) throw new Error(`Static runtime part missing: ${path}`);
          return await response.text();
        })
      );
      const payload = parts.join('');
      return payload || null;
    } catch (error) {
      console.warn('[portal-repricer-managed-hotfix-loader] static parts', error);
    }
    return null;
  }

  async function fetchPayload() {
    const staticPayload = await fetchStaticPayload();
    if (typeof staticPayload === 'string' && staticPayload) return staticPayload;
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
    if (!response.ok) throw new Error(`Supabase runtime ${response.status}`);
    const rows = await response.json();
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

  async function inflateSource() {
    if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream is not available in this browser');
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
      const runner = new Function(source + '\n//# sourceURL=portal-repricer-managed-hotfix-' + VERSION + '.js');
      runner.call(window);
      if (typeof rerenderCurrentView === 'function' && state?.activeView === 'repricer') rerenderCurrentView();
    })().catch((error) => {
      console.warn('[portal-repricer-managed-hotfix-loader]', error);
      bootPromise = null;
      throw error;
    });
    return bootPromise;
  }

  function start() {
    if (window.__ALTEA_REPRICER_MANAGED_HOTFIX_20260424B__) {
      if (typeof rerenderCurrentView === 'function' && state?.activeView === 'repricer') rerenderCurrentView();
      return;
    }
    boot().catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(start, 120), { once: true });
  } else {
    window.setTimeout(start, 120);
  }
  window.addEventListener('load', () => window.setTimeout(start, 120), { once: true });
  window.setTimeout(start, 1200);
})();
