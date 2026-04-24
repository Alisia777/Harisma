(function () {
  if (window.__ALTEA_REPRICER_MANAGED_HOTFIX_LOADER_20260424B__) return;
  window.__ALTEA_REPRICER_MANAGED_HOTFIX_LOADER_20260424B__ = true;
  const VERSION = '20260424b';
  const PARTS = [
    'portal-repricer-managed-hotfix.part01.txt',
    'portal-repricer-managed-hotfix.part02.txt',
    'portal-repricer-managed-hotfix.part03.txt',
    'portal-repricer-managed-hotfix.part04.txt',
    'portal-repricer-managed-hotfix.part05.txt',
    'portal-repricer-managed-hotfix.part06.txt',
    'portal-repricer-managed-hotfix.part07.txt',
    'portal-repricer-managed-hotfix.part08.txt',
    'portal-repricer-managed-hotfix.part09.txt',
    'portal-repricer-managed-hotfix.part10.txt',
    'portal-repricer-managed-hotfix.part11.txt',
    'portal-repricer-managed-hotfix.part12.txt',
    'portal-repricer-managed-hotfix.part13.txt',
    'portal-repricer-managed-hotfix.part14.txt',
    'portal-repricer-managed-hotfix.part15.txt',
    'portal-repricer-managed-hotfix.part16.txt',
    'portal-repricer-managed-hotfix.part17.txt',
    'portal-repricer-managed-hotfix.part18.txt',
    'portal-repricer-managed-hotfix.part19.txt',
    'portal-repricer-managed-hotfix.part20.txt',
    'portal-repricer-managed-hotfix.part21.txt',
    'portal-repricer-managed-hotfix.part22.txt',
    'portal-repricer-managed-hotfix.part23.txt',
    'portal-repricer-managed-hotfix.part24.txt',
    'portal-repricer-managed-hotfix.part25.txt',
    'portal-repricer-managed-hotfix.part26.txt',
    'portal-repricer-managed-hotfix.part27.txt',
    'portal-repricer-managed-hotfix.part28.txt',
    'portal-repricer-managed-hotfix.part29.txt'
  ];

  async function fetchParts() {
    const chunks = [];
    for (const part of PARTS) {
      const response = await fetch(`${part}?v=${VERSION}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`?? ??????? ????????? ${part}`);
      chunks.push(await response.text());
    }
    return chunks.join('');
  }

  async function inflateSource() {
    if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream is not available in this browser');
    const binary = atob(await fetchParts());
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
