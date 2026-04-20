(function () {
  if (window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260420E__) return;
  window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260420E__ = true;
  const VERSION = '20260420e';
  const PARTS = [
    'bundles/dashboard-runtime-20260420d.part01.txt',
    'bundles/dashboard-runtime-20260420d.part02.txt',
    'bundles/dashboard-runtime-20260420d.part03.txt'
  ];

  function patchSource(source) {
    return source
      .split("executive.metrics.some((metric) => metric.adsReady) ? adsSection(executive) : '',")
      .join("adsSection(executive),")
      .split("Источник факта: ${esc(executive.range.availableLabel)} · актуально на ${esc(longDate(executive.range.max))}.")
      .join("Источник факта: ${esc(executive.range.availableLabel)} · daily bridge из Google Sheets в 09:00 МСК · актуально на ${esc(longDate(executive.range.max))}.");
  }

  async function inflateSource() {
    if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream is not available in this browser');
    const chunks = await Promise.all(PARTS.map(async (part) => {
      const response = await fetch(part + '?v=' + VERSION, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load ' + part + ' (' + response.status + ')');
      return response.text();
    }));
    const binary = atob(chunks.join(''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return patchSource(await new Response(stream).text());
  }

  let bootPromise = null;

  async function boot() {
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      const source = await inflateSource();
      const runner = new Function(source + '\n//# sourceURL=portal-dashboard-interactive-hotfix.source.js?v=' + VERSION);
      runner.call(window);
    })().catch((error) => {
      console.warn('[portal-dashboard-interactive-loader]', error);
      bootPromise = null;
      throw error;
    });
    return bootPromise;
  }

  function start() {
    if (window.__ALTEA_DASHBOARD_INTERACTIVE_20260419H__) return;
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
