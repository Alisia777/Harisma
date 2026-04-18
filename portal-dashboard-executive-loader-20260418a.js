(function () {
  if (window.__ALTEA_DASHBOARD_EXECUTIVE_LOADER_20260418A__) return;
  window.__ALTEA_DASHBOARD_EXECUTIVE_LOADER_20260418A__ = true;

  const VERSION = '20260418a';
  const PARTS = [
    'portal-dashboard-executive.b64.part01.txt',
    'portal-dashboard-executive.b64.part02.txt',
    'portal-dashboard-executive.b64.part03.txt',
    'portal-dashboard-executive.b64.part04.txt',
    'portal-dashboard-executive.b64.part05.txt',
    'portal-dashboard-executive.b64.part06.txt',
    'portal-dashboard-executive.b64.part07.txt',
    'portal-dashboard-executive.b64.part08.txt',
    'portal-dashboard-executive.b64.part09.txt',
    'portal-dashboard-executive.b64.part10.txt',
    'portal-dashboard-executive.b64.part11.txt',
    'portal-dashboard-executive.b64.part12.txt',
    'portal-dashboard-executive.b64.part13.txt',
    'portal-dashboard-executive.b64.part14.txt',
    'portal-dashboard-executive.b64.part15.txt',
    'portal-dashboard-executive.b64.part16.txt',
    'portal-dashboard-executive.b64.part17.txt',
    'portal-dashboard-executive.b64.part18.txt',
    'portal-dashboard-executive.b64.part19.txt',
    'portal-dashboard-executive.b64.part20.txt',
    'portal-dashboard-executive.b64.part21.txt',
    'portal-dashboard-executive.b64.part22.txt'
  ];

  function renameChrome() {
    const brandTitle = document.querySelector('.sidebar .brand-title');
    if (brandTitle) brandTitle.textContent = 'Дом бренда Алтея';
    const brandSub = document.querySelector('.sidebar .brand-sub');
    if (brandSub) brandSub.textContent = 'Рабочий контур бренда и решений.';
    const h1 = document.querySelector('.topbar h1');
    if (h1) h1.textContent = 'Дом бренда Алтея';
    const footer = document.querySelector('.sidebar-foot.compact-sidebar-foot');
    if (footer) footer.style.display = 'none';
  }

  function guardLayout() {
    const dashboard = document.getElementById('view-dashboard');
    if (!dashboard || typeof MutationObserver !== 'function') return;
    const sweep = () => {
      if (!dashboard.querySelector('[data-portal-dashboard-executive-root]')) return;
      dashboard.querySelector('[data-dashboard-layout-root]')?.remove();
    };
    sweep();
    const observer = new MutationObserver(sweep);
    observer.observe(dashboard, { childList: true, subtree: true });
  }

  async function loadParts() {
    const responses = await Promise.all(PARTS.map((part) => fetch(`${part}?v=${VERSION}`, { cache: 'no-store' })));
    const chunks = [];
    for (let index = 0; index < PARTS.length; index += 1) {
      const response = responses[index];
      const part = PARTS[index];
      if (!response.ok) throw new Error(`Failed to load ${part}: ${response.status}`);
      chunks.push(await response.text());
    }
    const encoded = chunks.join('').replace(/\s+/g, '');
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  renameChrome();
  [120, 1200, 3600, 9000, 18000, 32000].forEach((delay) => window.setTimeout(renameChrome, delay));

  loadParts()
    .then((source) => {
      const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = blobUrl;
      script.onload = () => {
        URL.revokeObjectURL(blobUrl);
        guardLayout();
        renameChrome();
      };
      script.onerror = (error) => {
        URL.revokeObjectURL(blobUrl);
        console.warn('[portal-dashboard-executive-loader]', error);
      };
      document.head.appendChild(script);
    })
    .catch((error) => console.warn('[portal-dashboard-executive-loader]', error));
})();
