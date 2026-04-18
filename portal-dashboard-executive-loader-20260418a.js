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
    const chunks = [];
    for (const part of PARTS) {
      const response = await fetch(`${part}?v=${VERSION}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to load ${part}: ${response.status}`);
      chunks.push(await response.text());
    }
    return atob(chunks.join(''));
  }

  renameChrome();
  [120, 1200, 3600, 9000].forEach((delay) => window.setTimeout(renameChrome, delay));

  loadParts()
    .then((source) => {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.text = source;
      document.head.appendChild(script);
      guardLayout();
      renameChrome();
    })
    .catch((error) => console.warn('[portal-dashboard-executive-loader]', error));
})();
