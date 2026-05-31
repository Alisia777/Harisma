(function () {
  if (window.__ALTEA_PREMIUM_POLISH_20260516B__) return;
  window.__ALTEA_PREMIUM_POLISH_20260516B__ = true;
  window.__ALTEA_PREMIUM_POLISH_20260516A__ = true;

  const STYLE_ID = 'altea-premium-polish-20260516b';
  const VERSION = '20260516premium2';
  const PLATFORM_RGB = {
    all: [212, 164, 74],
    wb: [139, 92, 246],
    ozon: [22, 131, 255],
    ya: [244, 196, 48],
    goldapple: [154, 196, 58],
    letu: [217, 70, 239],
    magnit: [239, 68, 68],
    product: [45, 212, 191],
    cross: [212, 164, 74],
    sku: [236, 203, 123],
    drr: [245, 158, 11],
    iu: [99, 102, 241]
  };

  function normalizePlatform(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'all' || raw.includes('все')) return 'all';
    if (raw.includes('wb') || raw.includes('вб') || raw.includes('wild')) return 'wb';
    if (raw.includes('ozon') || raw.includes('оз')) return 'ozon';
    if (raw.includes('ym') || raw.includes('ya') || raw.includes('маркет') || raw.includes('янд')) return 'ya';
    if (raw.includes('gold') || raw.includes('золот') || raw === 'зя') return 'goldapple';
    if (raw.includes('letu') || raw.includes('лет') || raw.includes("l'")) return 'letu';
    if (raw.includes('magnit') || raw.includes('магнит')) return 'magnit';
    if (raw.includes('product') || raw.includes('продукт') || raw.includes('новин')) return 'product';
    if (raw.includes('cross') || raw.includes('общ')) return 'cross';
    if (raw.includes('ддр') || raw.includes('drr')) return 'drr';
    if (raw.includes('иу') || raw.includes('iu')) return 'iu';
    return raw;
  }

  function rgbFor(key) {
    return PLATFORM_RGB[normalizePlatform(key)] || PLATFORM_RGB.all;
  }

  function activePortalView() {
    if (window.state && state.activeView) return String(state.activeView);
    const active = document.querySelector('.view.active');
    return active ? String(active.id || '').replace(/^view-/, '') : '';
  }

  function polishView() {
    const view = activePortalView();
    return ['control', 'iu-drr', 'wb-rating', 'skus'].includes(view) ? view : '';
  }

  function setPalette(node, platformKey) {
    if (!node) return;
    const key = normalizePlatform(platformKey);
    const rgb = rgbFor(key);
    node.dataset.premiumPlatform = key;
    node.style.setProperty('--portal-premium-rgb', `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
  }

  function escapeSelectorValue(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value || '').replace(/["\\]/g, '\\$&');
  }

  function activeControlPlatform(root) {
    const active = root.querySelector('.control-simple-direction.active[data-platform]');
    return normalizePlatform(active?.dataset.platform || 'all');
  }

  function activeSkuPlatform(root) {
    const active = root.querySelector('.market-tab.active[data-market-filter]');
    return normalizePlatform(active?.dataset.marketFilter || 'all');
  }

  function activeIuDrrPlatform(root) {
    const active = root.querySelector('[data-iu-drr-platform].active');
    return normalizePlatform(active?.dataset.iuDrrPlatform || 'wb');
  }

  function platformFromText(text, fallback = 'all') {
    const raw = String(text || '').toLowerCase();
    if (raw.includes('wb') || raw.includes(' вб ')) return 'wb';
    if (raw.includes('ozon') || raw.includes('озон')) return 'ozon';
    if (raw.includes('я.маркет') || raw.includes('яндекс')) return 'ya';
    if (raw.includes('золотое яблоко') || raw.includes(' зя ')) return 'goldapple';
    if (raw.includes("л'этуаль") || raw.includes('лэтуаль')) return 'letu';
    if (raw.includes('магнит')) return 'magnit';
    if (raw.includes('продукт') || raw.includes('новинк')) return 'product';
    return normalizePlatform(fallback);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .portal-premium-view {
        --portal-premium-rgb: 212, 164, 74;
        --portal-premium-line: rgba(var(--portal-premium-rgb), .36);
        --portal-premium-soft: rgba(var(--portal-premium-rgb), .115);
        --portal-premium-faint: rgba(var(--portal-premium-rgb), .055);
      }
      .portal-premium-view > .section-title,
      .portal-premium-view .control-simple-title,
      .portal-premium-view .section-subhead {
        border: 1px solid rgba(var(--portal-premium-rgb), .18);
        border-radius: 14px;
        padding: 14px 16px;
        background:
          radial-gradient(circle at 84% 0, rgba(var(--portal-premium-rgb), .16), transparent 31%),
          linear-gradient(180deg, rgba(25,20,16,.72), rgba(12,10,8,.62));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
      }
      .portal-premium-view h2,
      .portal-premium-view h3 {
        letter-spacing: 0;
      }
      .portal-premium-token {
        --portal-premium-rgb: 212, 164, 74;
        border-color: rgba(var(--portal-premium-rgb), .24) !important;
        background:
          linear-gradient(180deg, rgba(var(--portal-premium-rgb), .10), rgba(255,255,255,.018)) !important;
        color: rgba(255,244,229,.84) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
      }
      .portal-premium-token.active,
      .portal-premium-token[aria-pressed="true"] {
        border-color: rgba(var(--portal-premium-rgb), .62) !important;
        background:
          radial-gradient(circle at 18% 0, rgba(255,255,255,.16), transparent 28%),
          linear-gradient(180deg, rgba(var(--portal-premium-rgb), .34), rgba(var(--portal-premium-rgb), .14)) !important;
        color: #fff7e8 !important;
        box-shadow: 0 14px 34px rgba(var(--portal-premium-rgb), .13), inset 0 1px 0 rgba(255,255,255,.09);
      }
      .portal-premium-surface {
        --portal-premium-rgb: 212, 164, 74;
        border-color: rgba(var(--portal-premium-rgb), .22) !important;
        background:
          radial-gradient(circle at 92% 0, rgba(var(--portal-premium-rgb), .12), transparent 34%),
          linear-gradient(180deg, rgba(26,21,17,.66), rgba(10,9,8,.78)) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.035), 0 16px 42px rgba(0,0,0,.16);
      }
      .portal-premium-view .control-simple-queue,
      .portal-premium-view .control-simple-task,
      .portal-premium-view .card.portal-surface,
      .portal-premium-view .card.subtle,
      .portal-premium-view .control-simple-create,
      .portal-premium-view .control-simple-panel,
      .portal-premium-view .control-simple-workspace {
        border-radius: 12px;
      }
      .portal-premium-view .control-simple-task {
        position: relative;
        overflow: hidden;
      }
      .portal-premium-view .control-simple-task::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: linear-gradient(180deg, rgba(var(--portal-premium-rgb), .88), rgba(var(--portal-premium-rgb), .26));
      }
      .portal-premium-view .control-simple-queue-head,
      .portal-premium-view .badge-stack,
      .portal-premium-view .kpi-strip {
        align-items: center;
      }
      .portal-premium-table-wrap {
        --portal-premium-rgb: 212, 164, 74;
        border: 1px solid rgba(var(--portal-premium-rgb), .15);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(var(--portal-premium-rgb), .035), rgba(255,255,255,.012));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
      }
      .portal-premium-view table {
        border-collapse: separate;
        border-spacing: 0;
      }
      .portal-premium-view table th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: rgba(18,14,11,.96) !important;
        border-bottom: 1px solid rgba(var(--portal-premium-rgb), .20) !important;
      }
      .portal-premium-view table tr.portal-premium-row > td:first-child {
        box-shadow: inset 3px 0 0 rgba(var(--portal-premium-rgb), .78);
      }
      .portal-premium-view table tr.portal-premium-row > td {
        background: linear-gradient(90deg, rgba(var(--portal-premium-rgb), .045), transparent 42%);
      }
      .portal-premium-view table tr.portal-premium-row:hover > td {
        background: linear-gradient(90deg, rgba(var(--portal-premium-rgb), .105), rgba(255,255,255,.018) 56%) !important;
      }
      .portal-premium-view .mini-kpi,
      .portal-premium-view .chip,
      .portal-premium-view .portal-pill {
        border-color: rgba(var(--portal-premium-rgb), .18);
      }
      .portal-premium-view .link-btn.sku-pill {
        border-color: rgba(var(--portal-premium-rgb), .22) !important;
        background: rgba(var(--portal-premium-rgb), .075) !important;
      }
      .portal-premium-view[data-premium-view="wb-rating"] {
        --portal-premium-rgb: 139, 92, 246;
      }
      .portal-premium-view[data-premium-view="wb-rating"] .alert-row,
      .portal-premium-view[data-premium-view="skus"] .sku-registry-row {
        border-color: rgba(var(--portal-premium-rgb), .16);
      }
      @media (max-width: 900px) {
        .portal-premium-view > .section-title,
        .portal-premium-view .control-simple-title,
        .portal-premium-view .section-subhead {
          padding: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function decorateTokens(root, selector, attrName) {
    root.querySelectorAll(selector).forEach((node) => {
      const key = attrName ? node.dataset[attrName] : node.textContent;
      node.classList.add('portal-premium-token');
      setPalette(node, key);
    });
  }

  function decorateSurfaces(root, platformKey) {
    root.querySelectorAll([
      '.card.portal-surface',
      '.card.subtle',
      '.control-simple-panel',
      '.control-simple-workspace',
      '.control-simple-create',
      '.control-simple-queue',
      '.control-simple-task'
    ].join(',')).forEach((node) => {
      node.classList.add('portal-premium-surface');
      setPalette(node, node.dataset.premiumPlatform || platformKey);
    });
  }

  function decorateTables(root, platformKey) {
    root.querySelectorAll('.table-wrap').forEach((node) => {
      node.classList.add('portal-premium-table-wrap');
      setPalette(node, platformKey);
    });
    root.querySelectorAll('table').forEach((table) => {
      const wrap = table.closest('.table-wrap');
      if (!wrap) {
        table.classList.add('portal-premium-table-wrap');
        setPalette(table, platformKey);
      }
    });
  }

  function decorateRows(root, selector, fallback) {
    root.querySelectorAll(selector).forEach((row) => {
      row.classList.add('portal-premium-row');
      setPalette(row, platformFromText(row.textContent, fallback));
    });
  }

  function applyControl() {
    const root = document.getElementById('view-control');
    if (!root) return;
    const active = activeControlPlatform(root);
    root.classList.add('portal-premium-view');
    root.dataset.premiumView = 'control';
    setPalette(root, active);
    decorateTokens(root, '.control-simple-direction[data-platform]', 'platform');
    decorateSurfaces(root, active);
    decorateRows(root, '.control-simple-task', active);
  }

  function applyIuDrr() {
    const root = document.getElementById('view-iu-drr');
    if (!root) return;
    const active = activeIuDrrPlatform(root);
    root.classList.add('portal-premium-view');
    root.dataset.premiumView = 'iu-drr';
    setPalette(root, active);
    decorateTokens(root, '[data-iu-drr-platform]', 'iuDrrPlatform');
    decorateTokens(root, '[data-iu-drr-tab]', 'iuDrrTab');
    root.querySelectorAll('[data-iu-drr-tab="drr"]').forEach((node) => setPalette(node, 'drr'));
    root.querySelectorAll('[data-iu-drr-tab="loyalty"]').forEach((node) => setPalette(node, 'iu'));
    decorateSurfaces(root, active);
    decorateTables(root, active);
    decorateRows(root, 'tbody tr', active);
  }

  function applyWbRating() {
    const root = document.getElementById('view-wb-rating');
    if (!root) return;
    root.classList.add('portal-premium-view');
    root.dataset.premiumView = 'wb-rating';
    setPalette(root, 'wb');
    decorateSurfaces(root, 'wb');
    decorateTables(root, 'wb');
    decorateRows(root, 'tbody tr', 'wb');
    root.querySelectorAll('.link-btn.sku-pill').forEach((node) => setPalette(node, 'wb'));
  }

  function applySkus() {
    const root = document.getElementById('view-skus');
    if (!root) return;
    const active = activeSkuPlatform(root);
    root.classList.add('portal-premium-view');
    root.dataset.premiumView = 'skus';
    setPalette(root, active === 'all' ? 'sku' : active);
    decorateTokens(root, '.market-tab[data-market-filter]', 'marketFilter');
    decorateSurfaces(root, active === 'all' ? 'sku' : active);
    decorateTables(root, active === 'all' ? 'sku' : active);
    decorateRows(root, '.sku-registry-row', active === 'all' ? 'sku' : active);
    root.querySelectorAll('.link-btn.sku-pill').forEach((node) => setPalette(node, active === 'all' ? 'sku' : active));
  }

  function applyPremiumPolish() {
    ensureStyles();
    const view = polishView();
    if (view === 'control') applyControl();
    else if (view === 'iu-drr') applyIuDrr();
    else if (view === 'wb-rating') applyWbRating();
    else if (view === 'skus') applySkus();
  }

  let timer = 0;
  function schedule() {
    if (!polishView()) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(applyPremiumPolish, 140);
  }

  function scheduleBurst() {
    schedule();
    window.setTimeout(schedule, 700);
    window.setTimeout(schedule, 1800);
  }

  window.__ALTEA_PREMIUM_POLISH_API__ = { version: VERSION, apply: applyPremiumPolish, schedule, scheduleBurst };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleBurst, { once: true });
  } else {
    scheduleBurst();
  }
  window.addEventListener('load', scheduleBurst);
  window.addEventListener('hashchange', scheduleBurst);
  window.addEventListener('altea:viewchange', scheduleBurst);
  document.addEventListener('click', (event) => {
    if (polishView() && event.target.closest('.nav-btn,[data-platform],[data-market-filter],[data-iu-drr-platform],[data-iu-drr-tab]')) scheduleBurst();
  }, true);
  const observer = new MutationObserver((mutations) => {
    if (!polishView()) return;
    if (mutations.some((item) => item.addedNodes.length || item.removedNodes.length)) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
