(function () {
  if (window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260420I__) return;
  window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260420I__ = true;

  const VERSION = '20260420i';
  const PARTS = [
    'bundles/dashboard-runtime-20260420d.part01.txt',
    'bundles/dashboard-runtime-20260420d.part02.txt',
    'bundles/dashboard-runtime-20260420d.part03.txt'
  ];
  const FIX_STYLE_ID = 'altea-dashboard-modal-layout-fix-20260420i';

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

  function injectRuntimeOverrides(source) {
    const override = `
  const TASK_STYLE_ID = 'altea-dashboard-task-block-20260420i';
  function ensureDashboardTaskStyles() {
    if (document.getElementById(TASK_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TASK_STYLE_ID;
    style.textContent = \`
      #view-dashboard .portal-exec-focus-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      #view-dashboard .portal-exec-focus-card { padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.03); }
      #view-dashboard .portal-exec-focus-card strong { color: #f6ead4; display: block; }
      #view-dashboard .portal-exec-focus-card p { margin: 8px 0 0; color: rgba(245,232,207,.68); font-size: 13px; }
      #view-dashboard .portal-exec-focus-card .portal-exec-chip-stack { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      #view-dashboard .portal-exec-focus-card .muted.small { color: rgba(245,232,207,.62); font-size: 12px; }
      @media (max-width: 1280px) { #view-dashboard .portal-exec-focus-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 720px) { #view-dashboard .portal-exec-focus-grid { grid-template-columns: 1fr; } }
    \`;
    document.head.appendChild(style);
  }

  function dashboardTaskWorkstreamKey(task) {
    const raw = String(task?.platform || '').trim().toLowerCase();
    const text = \`${raw} ${task?.title || ''} ${task?.nextAction || ''} ${task?.reason || ''} ${task?.entityLabel || ''}\`.toLowerCase();
    if (['wb+ozon', 'wb + ozon', 'cross', 'common', 'shared', 'general', 'all'].includes(raw)) return 'cross';
    if (/(^|\\W)wb($|\\W)|wildberries|вб/.test(text)) return 'wb';
    if (/ozon|озон/.test(text)) return 'ozon';
    if (/retail|market|яндекс|я\\.маркет|ям|letu|лету|магнит|golden apple|золот/.test(text)) return 'retail';
    return 'cross';
  }

  function dashboardControlPlatformKey(platformKey) {
    if (platformKey === 'ya') return 'retail';
    if (platformKey === 'wb' || platformKey === 'ozon') return platformKey;
    return 'all';
  }

  function dashboardTaskMatchesPlatform(task, platformKey) {
    const selected = dashboardControlPlatformKey(platformKey);
    if (selected === 'all') return true;
    const workstream = dashboardTaskWorkstreamKey(task);
    return workstream === selected || workstream === 'cross';
  }

  function dashboardTaskIsActive(task) {
    return ['new', 'in_progress', 'waiting_team', 'waiting_decision'].includes(String(task?.status || 'new'));
  }

  function dashboardTaskIsOverdue(task) {
    return Boolean(task?.due) && dashboardTaskIsActive(task) && String(task.due) < iso(cleanDate(new Date()));
  }

  function dashboardTaskTone(task) {
    if (dashboardTaskIsOverdue(task)) return 'danger';
    if (task?.priority === 'critical') return 'danger';
    if (task?.status === 'waiting_decision' || task?.priority === 'high') return 'warn';
    return 'ok';
  }

  function dashboardTaskStatusChip(task) {
    if (dashboardTaskIsOverdue(task)) return badgeHtml('Просрочено', 'danger');
    if (task?.status === 'waiting_decision') return badgeHtml('Ждет решения', 'info');
    if (task?.status === 'in_progress') return badgeHtml('В работе', 'warn');
    if (task?.status === 'waiting_team') return badgeHtml('Ждет команду', 'info');
    return badgeHtml('Активна', 'ok');
  }

  function dashboardTaskPriorityChip(task) {
    if (task?.priority === 'critical') return badgeHtml('Критично', 'danger');
    if (task?.priority === 'high') return badgeHtml('Высокий', 'warn');
    if (task?.priority === 'medium') return badgeHtml('Средний', 'info');
    return badgeHtml('Планово');
  }

  function dashboardTaskPlatformChip(task) {
    const key = dashboardTaskWorkstreamKey(task);
    if (key === 'wb') return badgeHtml('WB', 'warn');
    if (key === 'ozon') return badgeHtml('Ozon', 'info');
    if (key === 'retail') return badgeHtml('ЯМ / сети', 'ok');
    return badgeHtml('Общий контур');
  }

  function dashboardTaskQueue(executive) {
    const snapshot = typeof getControlSnapshot === 'function'
      ? getControlSnapshot()
      : { tasks: ((typeof state === 'object' && state ? state : null)?.storage?.tasks || []) };
    const tasks = Array.isArray(snapshot?.tasks) ? snapshot.tasks : [];
    return [...tasks]
      .filter((task) => task && task.source !== 'auto')
      .filter(dashboardTaskIsActive)
      .filter((task) => dashboardTaskMatchesPlatform(task, executive.selectedPlatform))
      .sort((left, right) => {
        const overdueDelta = Number(dashboardTaskIsOverdue(right)) - Number(dashboardTaskIsOverdue(left));
        if (overdueDelta) return overdueDelta;
        const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
        const priorityDelta = (priorityRank[right?.priority] || 0) - (priorityRank[left?.priority] || 0);
        if (priorityDelta) return priorityDelta;
        const waitingDelta = Number(right?.status === 'waiting_decision') - Number(left?.status === 'waiting_decision');
        if (waitingDelta) return waitingDelta;
        const dueDelta = String(left?.due || '9999-12-31').localeCompare(String(right?.due || '9999-12-31'));
        if (dueDelta) return dueDelta;
        return String(right?.createdAt || '').localeCompare(String(left?.createdAt || ''));
      })
      .slice(0, 8);
  }

  function openControlViewFromDashboard(platformKey) {
    if (typeof state === 'object' && state) {
      state.controlFilters = state.controlFilters || {};
      state.controlFilters.platform = dashboardControlPlatformKey(platformKey);
      state.controlFilters.source = 'manual';
      state.controlFilters.status = 'active';
      state.controlFilters.type = 'all';
      state.controlFilters.horizon = 'all';
      state.controlFilters.owner = 'all';
      state.controlFilters.search = '';
      state.controlFilters.priority = 'all';
    }
    if (typeof setView === 'function') {
      setView('control');
      return;
    }
    document.querySelector('.nav-btn[data-view="control"]')?.click();
  }

  ensureDashboardTaskStyles();
  decisionSection = function (executive) {
    const rows = dashboardTaskQueue(executive);
    const overdueCount = rows.filter(dashboardTaskIsOverdue).length;
    const ownerCount = new Set(rows.map((task) => task.owner || 'Без owner')).size;
    const controlPlatformKey = dashboardControlPlatformKey(executive.selectedPlatform);
    return \`
      <section class="portal-exec-section is-highlight">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Задачи РОПов: что разобрать первым</h3>
            <p>Здесь показываем активные ручные задачи по выбранной площадке. Клик по карточке или по кнопке сверху открывает задачник с этим же контуром.</p>
          </div>
          ${sectionMetaHtml(executive, [
            badgeHtml(\`${int(rows.length)} задач\`, rows.length ? 'warn' : 'ok'),
            overdueCount ? badgeHtml(\`${int(overdueCount)} проср.\`, 'danger') : badgeHtml(\`${int(ownerCount)} owner\`, 'info'),
            \`<button type="button" class="quick-chip" data-portal-open-control="1" data-portal-control-platform="${esc(controlPlatformKey)}">Открыть задачник</button>\`
          ])}
        </div>
        <div class="portal-exec-focus-grid">
          ${rows.map((task) => {
            const sku = typeof getSku === 'function' ? getSku(task.articleKey) : null;
            const tone = dashboardTaskTone(task);
            const title = task.title || 'Задача без названия';
            const subtitle = task.nextAction || task.reason || sku?.name || task.entityLabel || 'Нужен следующий шаг по задаче.';
            const subject = sku?.article || task.articleKey || task.entityLabel || 'Без SKU';
            return \`
              <article class="portal-exec-card portal-exec-focus-card is-${tone} is-clickable" data-portal-open-control="1" data-portal-control-platform="${esc(controlPlatformKey)}">
                <div class="portal-exec-card-head">
                  <span class="portal-exec-card-label">${esc(subject)}</span>
                  ${dashboardTaskStatusChip(task)}
                </div>
                <strong>${esc(title)}</strong>
                <p>${esc(subtitle)}</p>
                <div class="muted small" style="margin-top:8px">${esc(task.owner || 'Без owner')} · срок ${esc(task.due || '—')}</div>
                <div class="portal-exec-chip-stack">
                  ${dashboardTaskPriorityChip(task)}
                  ${dashboardTaskPlatformChip(task)}
                </div>
              </article>
            \`;
          }).join('') || '<div class="portal-exec-empty">По выбранной площадке сейчас нет ручных задач РОПов. Откройте задачник, чтобы посмотреть весь контур.</div>'}
        </div>
      </section>
    \`;
  };

  const bindDashboardBase = bindDashboard;
  bindDashboard = function (root, executive) {
    bindDashboardBase(root, executive);
    root.querySelectorAll('[data-portal-open-control]').forEach((node) => {
      if (node.dataset.portalControlBound === '1') return;
      node.dataset.portalControlBound = '1';
      node.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openControlViewFromDashboard(node.dataset.portalControlPlatform || executive.selectedPlatform || 'all');
      });
    });
  };
`;

    const markerPattern = /(\s+scheduleApply\(0, true\);\s*\n\}\)\(\);\s*)$/;
    if (markerPattern.test(source)) {
      return source.replace(markerPattern, `${override}
  scheduleApply(0, true);
})();
`);
    }
    return source.replace(/\}\)\(\);\s*$/, `${override}
})();
`);
  }

  function patchSource(source) {
    const patched = source
      .replace(
        /(<div class="portal-exec-side-stack">\s*<div class="portal-exec-modal-card">[\s\S]*?<\/table>\s*<\/div>)\s*(\$\{renderActionBullets\([\s\S]*?\)\})\s*<\/div>\s*<\/div>/g,
        '$1</div></div><div class="portal-exec-modal-actions">$2</div>'
      )
      .split("executive.metrics.some((metric) => metric.adsReady) ? adsSection(executive) : '',")
      .join('adsSection(executive),')
      .split('Источник факта: ${esc(executive.range.availableLabel)} · актуально на ${esc(longDate(executive.range.max))}.')
      .join('Источник факта: ${esc(executive.range.availableLabel)} · daily bridge из Google Sheets в 09:00 МСК · актуально на ${esc(longDate(executive.range.max))}.');
    return injectRuntimeOverrides(patched);
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
    if (window.__ALTEA_DASHBOARD_INTERACTIVE_20260419H__ || window.__ALTEA_DASHBOARD_INTERACTIVE_20260420I__) return;
    boot().catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(start, 120), { once: true });
  } else {
    window.setTimeout(start, 120);
  }
  window.addEventListener('load', () => window.setTimeout(start, 120), { once: true });
  [1200, 2600].forEach((delay) => window.setTimeout(start, delay));
})();
