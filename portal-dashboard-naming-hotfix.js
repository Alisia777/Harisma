(function(){
  if(window.__ALTEA_PORTAL_DASHBOARD_NAMING_20260417A__) return;
  window.__ALTEA_PORTAL_DASHBOARD_NAMING_20260417A__ = true;

  const rename = () => {
    const root = document.getElementById('view-dashboard');
    if (!root) return;

    const eyebrow = root.querySelector('.hero-panel .eyebrow');
    const title = root.querySelector('.hero-panel .hero-copy h2');
    const intro = root.querySelector('.hero-panel .hero-copy p');
    const sidebarTitle = document.querySelector('.compact-sidebar-foot h4');

    if (sidebarTitle) sidebarTitle.textContent = 'Дом бренда Алтея';
    if (eyebrow) eyebrow.textContent = 'Портал бренда Алтея';
    if (title) title.textContent = 'Дом бренда Алтея';
    if (intro) {
      intro.textContent = 'Главный экран бренда: сверху темп и выполнение по датам, ниже ключевые показатели, маржа и сигналы.';
    }

    root.querySelectorAll('.footer-note,.small.muted,p').forEach((el) => {
      const text = String(el.textContent || '');
      if (
        text.includes('Этот экран теперь отвечает за визуальный pulse бренда') ||
        text.includes('визуальный pulse бренда')
      ) {
        el.textContent = 'Этот экран — Дом бренда Алтея: ключевые показатели, динамика и сигналы по бренду.';
      }
    });
  };

  const wrap = (fnName) => {
    if (typeof window[fnName] !== 'function' || window[fnName].__portalNamingWrapped) return;
    const original = window[fnName];
    const wrapped = function(){
      const result = original.apply(this, arguments);
      [40, 180, 480].forEach((delay) => window.setTimeout(rename, delay));
      return result;
    };
    wrapped.__portalNamingWrapped = true;
    window[fnName] = wrapped;
  };

  wrap('rerenderCurrentView');
  wrap('renderDashboard');
  [80, 600, 1800, 4200, 9000].forEach((delay) => window.setTimeout(rename, delay));
  rename();
})();
