(function () {
  if (window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260420G__) return;
  window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260420G__ = true;
  const VERSION = '20260420g';
  const PARTS = [
    'bundles/dashboard-runtime-20260420d.part01.txt',
    'bundles/dashboard-runtime-20260420d.part02.txt',
    'bundles/dashboard-runtime-20260420d.part03.txt'
  ];
  const FIX_STYLE_ID = 'altea-dashboard-modal-layout-fix-20260420g';

  function ensureModalLayoutFix() {
    if (document.getElementById(FIX_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FIX_STYLE_ID;
    style.textContent = `
      body > .portal-exec-modal > .portal-exec-modal-card {
        display: grid;
        gap: 14px;
        width: min(1860px, 98vw) !important;
        max-height: 94vh !important;
        overflow: auto !important;
        padding: 20px 22px !important;
      }
      body > .portal-exec-modal .portal-exec-modal-metrics {
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)) !important;
      }
      body > .portal-exec-modal .portal-exec-modal-grid {
        grid-template-columns: minmax(420px, 1.02fr) minmax(620px, .98fr) !important;
        gap: 16px !important;
        align-items: start !important;
      }
      body > .portal-exec-modal .portal-exec-modal-grid > * {
        min-width: 0 !important;
      }
      body > .portal-exec-modal .portal-exec-side-stack {
        display: grid;
        gap: 14px;
        min-width: 0;
        align-content: start;
      }
      body > .portal-exec-modal .portal-exec-modal-card {
        min-width: 0;
      }
      body > .portal-exec-modal .portal-exec-modal-grid .portal-exec-modal-card,
      body > .portal-exec-modal .portal-exec-side-stack .portal-exec-modal-card,
      body > .portal-exec-modal .portal-exec-modal-actions .portal-exec-modal-card {
        width: auto !important;
        max-height: none !important;
        overflow-x: auto !important;
        overflow-y: visible !important;
      }
      body > .portal-exec-modal .portal-exec-modal-actions {
        margin-top: 14px;
        min-width: 0;
      }
      body > .portal-exec-modal .portal-exec-modal-table {
        width: max-content;
        min-width: 100%;
      }
      body > .portal-exec-modal .portal-exec-modal-table th,
      body > .portal-exec-modal .portal-exec-modal-table td {
        min-width: 88px;
        line-height: 1.4;
      }
      body > .portal-exec-modal .portal-exec-modal-table th:first-child,
      body > .portal-exec-modal .portal-exec-modal-table td:first-child {
        min-width: 320px;
      }
      @media (max-width: 1400px) {
        body > .portal-exec-modal .portal-exec-modal-grid {
          grid-template-columns: 1fr !important;
        }
      }
      @media (max-width: 720px) {
        body > .portal-exec-modal > .portal-exec-modal-card {
          width: min(99vw, 99vw) !important;
          padding: 16px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function patchSource(source) {
    return source
      .replace(
        /(<div class="portal-exec-side-stack">\s*<div class="portal-exec-modal-card">[\s\S]*?<\/table>\s*<\/div>)\s*(\$\{renderActionBullets\([\s\S]*?\)\})\s*<\/div>\s*<\/div>/g,
        '$1</div></div><div class="portal-exec-modal-actions">$2</div>'
      )
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
      ensureModalLayoutFix();
      const source = await inflateSource();
      const runner = new Function(source + '\n//# sourceURL=portal-dashboard-interactive-hotfix.source.js?v=' + VERSION);
      runner.call(window);
      ensureModalLayoutFix();
    })().catch((error) => {
      console.warn('[portal-dashboard-interactive-loader]', error);
      bootPromise = null;
      throw error;
    });
    return bootPromise;
  }

  function start() {
    ensureModalLayoutFix();
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
