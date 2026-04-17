(function(){
  if(window.__ALTEA_PORTAL_DASHBOARD_LAYOUT_20260417A__) return;
  window.__ALTEA_PORTAL_DASHBOARD_LAYOUT_20260417A__ = true;

  const STYLE_ID = 'altea-dashboard-layout-hotfix-20260417a';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #view-dashboard [data-dashboard-layout-root] {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      #view-dashboard .dashboard-layout-section {
        padding: 18px;
        border-radius: 24px;
        border: 1px solid rgba(212, 164, 74, 0.12);
        background:
          radial-gradient(circle at top left, rgba(212, 164, 74, 0.08), transparent 34%),
          linear-gradient(180deg, rgba(24, 18, 14, 0.92), rgba(11, 9, 8, 0.96));
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.18);
      }
      #view-dashboard .dashboard-layout-section.is-primary {
        border-color: rgba(212, 164, 74, 0.16);
        background:
          radial-gradient(circle at top left, rgba(212, 164, 74, 0.1), transparent 36%),
          linear-gradient(180deg, rgba(28, 21, 16, 0.94), rgba(11, 9, 8, 0.98));
      }
      #view-dashboard .dashboard-layout-section.is-secondary {
        border-color: rgba(255, 255, 255, 0.08);
        background:
          linear-gradient(180deg, rgba(18, 14, 12, 0.92), rgba(11, 9, 8, 0.96));
      }
      #view-dashboard .dashboard-layout-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 14px;
      }
      #view-dashboard .dashboard-layout-copy {
        max-width: 820px;
      }
      #view-dashboard .dashboard-layout-copy h2 {
        margin: 0 0 6px;
        font-size: 22px;
        line-height: 1.15;
        color: #f6ead4;
      }
      #view-dashboard .dashboard-layout-copy p {
        margin: 0;
        color: rgba(245, 232, 207, 0.68);
      }
      #view-dashboard .dashboard-layout-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }
      #view-dashboard .dashboard-layout-body {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      #view-dashboard .dashboard-layout-split {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      #view-dashboard .dashboard-layout-section .section-title {
        margin: 0;
        padding: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
      }
      #view-dashboard .dashboard-layout-section .grid.cards {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      #view-dashboard .dashboard-layout-section .two-col {
        grid-template-columns: 1.08fr 0.92fr;
      }
      #view-dashboard .dashboard-layout-leaders .dashboard-grid-3 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      #view-dashboard .dashboard-layout-leaders .dashboard-grid-3 > :nth-child(3) {
        grid-column: 1 / -1;
      }
      #view-dashboard .dashboard-layout-section .card,
      #view-dashboard .dashboard-layout-section [data-portal-dashboard-execution],
      #view-dashboard .dashboard-layout-section [data-portal-dashboard-insights],
      #view-dashboard .dashboard-layout-section [data-portal-dashboard-ads] {
        margin-top: 0 !important;
      }
      #view-dashboard .dashboard-layout-footnote {
        padding: 4px 8px 0;
        color: rgba(245, 232, 207, 0.52);
        font-size: 12px;
      }
      @media (max-width: 1400px) {
        #view-dashboard .dashboard-layout-section .grid.cards {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 1080px) {
        #view-dashboard .dashboard-layout-head,
        #view-dashboard .dashboard-layout-split,
        #view-dashboard .dashboard-layout-section .two-col,
        #view-dashboard .dashboard-layout-leaders .dashboard-grid-3,
        #view-dashboard .dashboard-layout-section .grid.cards {
          grid-template-columns: 1fr;
          flex-direction: column;
        }
        #view-dashboard .dashboard-layout-leaders .dashboard-grid-3 > :nth-child(3) {
          grid-column: auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createSection(container, key, title, text, tone) {
    let section = container.querySelector(`[data-dashboard-layout="${key}"]`);
    if (!section) {
      section = document.createElement('section');
      section.dataset.dashboardLayout = key;
      section.className = `dashboard-layout-section dashboard-layout-${key}${tone ? ` ${tone}` : ''}`;
      section.innerHTML = `
        <div class="dashboard-layout-head">
          <div class="dashboard-layout-copy">
            <h2></h2>
            <p></p>
          </div>
          <div class="dashboard-layout-actions"></div>
        </div>
        <div class="dashboard-layout-body"></div>
      `;
      container.appendChild(section);
    }
    section.querySelector('h2').textContent = title;
    section.querySelector('p').textContent = text;
    section.querySelector('.dashboard-layout-actions').replaceChildren();
    section.querySelector('.dashboard-layout-body').replaceChildren();
    return section;
  }

  function move(node, target) {
    if (node && target) target.appendChild(node);
  }

  function toggle(section) {
    const body = section.querySelector('.dashboard-layout-body');
    section.style.display = body && body.childElementCount ? '' : 'none';
  }

  function reflow() {
    const root = document.getElementById('view-dashboard');
    if (!root) return;
    ensureStyles();

    let container = root.querySelector('[data-dashboard-layout-root]');
    if (!container) {
      container = document.createElement('div');
      container.dataset.dashboardLayoutRoot = 'true';
      root.appendChild(container);
    }

    const hero = root.querySelector('.hero-panel');
    const execution = root.querySelector('[data-portal-dashboard-execution]');
    const ads = root.querySelector('[data-portal-dashboard-ads]');
    const insight = root.querySelector('[data-portal-dashboard-insights]');
    const summaryTitle = root.querySelector('.section-title');
    const summaryCards = root.querySelector('.grid.cards');
    const leaders = root.querySelector('.dashboard-grid-3');
    const focus = root.querySelector('.two-col');
    const footer = root.querySelector('.footer-note');

    const day = createSection(
      container,
      'day',
      'Контур дня',
      'Сначала дата, темп площадок и выполнение против плана в одном сценарии чтения.',
      'is-primary'
    );
    move(hero, day.querySelector('.dashboard-layout-body'));
    move(execution, day.querySelector('.dashboard-layout-body'));

    const money = createSection(
      container,
      'money',
      'Деньги и динамика',
      'После темпа показываем выручку, рекламу и движение маржи в том же диапазоне дат.',
      'is-secondary'
    );
    if (ads || insight) {
      const split = document.createElement('div');
      split.className = 'dashboard-layout-split';
      move(ads, split);
      move(insight, split);
      money.querySelector('.dashboard-layout-body').appendChild(split);
    }

    const health = createSection(
      container,
      'health',
      'Состояние бренда',
      'Ключевые KPI рабочего контура без визуального шума и случайных перескоков по смыслу.',
      ''
    );
    if (summaryTitle) {
      const quickActions = summaryTitle.querySelector('.quick-actions');
      if (quickActions) health.querySelector('.dashboard-layout-actions').appendChild(quickActions);
      summaryTitle.remove();
    }
    move(summaryCards, health.querySelector('.dashboard-layout-body'));

    const focusSection = createSection(
      container,
      'focus',
      'Фокус команды',
      'Риски и короткий список на утренний созвон должны лежать рядом, а не в разных частях экрана.',
      ''
    );
    move(focus, focusSection.querySelector('.dashboard-layout-body'));

    const leadersSection = createSection(
      container,
      'leaders',
      'Лидеры и потенциал',
      'Ниже оставляем уже аналитические блоки: кто растёт, кто быстрее крутится и где есть запас для масштабирования.',
      'is-secondary'
    );
    leadersSection.classList.add('dashboard-layout-leaders');
    move(leaders, leadersSection.querySelector('.dashboard-layout-body'));

    toggle(day);
    toggle(money);
    toggle(health);
    toggle(focusSection);
    toggle(leadersSection);

    let foot = container.querySelector('.dashboard-layout-footnote');
    if (!foot) {
      foot = document.createElement('div');
      foot.className = 'dashboard-layout-footnote';
      container.appendChild(foot);
    }
    if (footer) {
      foot.textContent = footer.textContent || '';
      footer.remove();
    }
  }

  function bridge(name) {
    if (typeof window[name] !== 'function' || window[name].__dashboardLayoutWrapped) return;
    const original = window[name];
    const wrapped = function() {
      const result = original.apply(this, arguments);
      [60, 220, 640].forEach((delay) => window.setTimeout(reflow, delay));
      return result;
    };
    wrapped.__dashboardLayoutWrapped = true;
    window[name] = wrapped;
  }

  bridge('rerenderCurrentView');
  bridge('renderDashboard');
  [120, 900, 2400, 5200, 9000].forEach((delay) => window.setTimeout(reflow, delay));
  reflow();
})();
