(function(){
  if(window.__ALTEA_PORTAL_DASHBOARD_NAMING_20260417B__) return;
  window.__ALTEA_PORTAL_DASHBOARD_NAMING_20260417B__ = true;

  const ensureStyles = () => {
    if (document.getElementById('altea-dashboard-surface-hotfix-20260417b')) return;
    const style = document.createElement('style');
    style.id = 'altea-dashboard-surface-hotfix-20260417b';
    style.textContent = `
      #view-dashboard .section-title {
        margin-top: 18px;
        padding: 14px 16px;
        border-radius: 20px;
        border: 1px solid rgba(212,164,74,.18);
        background: linear-gradient(90deg, rgba(60,40,20,.92), rgba(25,18,13,.94) 52%, rgba(14,11,10,.96));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
      }
      #view-dashboard .section-title h2 {
        color: #f7ead1;
      }
      #view-dashboard .section-title p {
        color: rgba(245,232,207,.72);
      }
      #view-dashboard .section-subhead {
        padding: 12px 14px;
        margin: -2px -2px 12px;
        border-radius: 16px;
        border: 1px solid rgba(212,164,74,.12);
        background: linear-gradient(90deg, rgba(42,30,19,.82), rgba(19,15,12,.18));
      }
      #view-dashboard .section-subhead h3 {
        color: #f5e8cf;
      }
      #view-dashboard .section-subhead p {
        color: rgba(245,232,207,.64);
      }
      #view-dashboard .chip.info {
        background: rgba(212,164,74,.12);
        border-color: rgba(212,164,74,.32);
        color: #f6ead4;
      }
      #view-dashboard .quick-chip {
        background: rgba(24,18,14,.92);
        border-color: rgba(212,164,74,.22);
        color: #f6ead4;
      }
      #view-dashboard .quick-chip:hover,
      #view-dashboard .quick-chip.active {
        background: linear-gradient(180deg, rgba(212,164,74,.22), rgba(33,24,17,.96));
        border-color: rgba(212,164,74,.38);
      }
      #view-dashboard .leader-rank {
        background: linear-gradient(180deg, rgba(212,164,74,.32), rgba(98,71,27,.34));
        border-color: rgba(212,164,74,.35);
        color: #fff0cb;
      }
      #view-dashboard .leader-bar span,
      #view-dashboard .owner-bar span {
        background: linear-gradient(90deg, #c9923a, #efd07c);
      }
    `;
    document.head.appendChild(style);
  };

  const rename = () => {
    const root = document.getElementById('view-dashboard');
    if (!root) return;

    ensureStyles();

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
