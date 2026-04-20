(function () {
  if (window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260420J__) return;
  window.__ALTEA_DASHBOARD_INTERACTIVE_LOADER_20260420J__ = true;

  const VERSION = '20260420j';
  const PARTS = [
    'bundles/dashboard-runtime-20260420d.part01.txt',
    'bundles/dashboard-runtime-20260420d.part02.txt',
    'bundles/dashboard-runtime-20260420d.part03.txt'
  ];
  const FIX_STYLE_ID = 'altea-dashboard-modal-layout-fix-20260420j';
  const TASK_OBSERVER_KEY = '__ALTEA_DASHBOARD_TASK_OBSERVER_20260420J__';

  function stateRef() {
    return typeof window.state === 'object' && window.state ? window.state : null;
  }

  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function chip(text, tone) {
    if (typeof window.badge === 'function') return window.badge(text, tone || '');
    return '<span class="portal-exec-chip ' + (tone || '') + '">' + esc(text) + '</span>';
  }

  function int(value) {
    if (typeof window.fmt === 'object' && window.fmt && typeof window.fmt.int === 'function') return window.fmt.int(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
  }

  function cleanDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function iso(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function ensureModalLayoutFix() {
    if (document.getElementById(FIX_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FIX_STYLE_ID;
    style.textContent = [
      'body > .portal-exec-modal > .portal-exec-modal-card { display:grid; gap:14px; width:min(1860px,98vw)!important; max-height:94vh!important; overflow:auto!important; padding:20px 22px!important; }',
      'body > .portal-exec-modal .portal-exec-modal-metrics { grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important; }',
      'body > .portal-exec-modal .portal-exec-modal-grid { grid-template-columns:minmax(420px,1.02fr) minmax(620px,.98fr)!important; gap:16px!important; align-items:start!important; }',
      'body > .portal-exec-modal .portal-exec-modal-grid > * { min-width:0!important; }',
      'body > .portal-exec-modal .portal-exec-side-stack { display:grid; gap:14px; min-width:0; align-content:start; }',
      'body > .portal-exec-modal .portal-exec-modal-card { min-width:0; }',
      'body > .portal-exec-modal .portal-exec-modal-grid .portal-exec-modal-card, body > .portal-exec-modal .portal-exec-side-stack .portal-exec-modal-card, body > .portal-exec-modal .portal-exec-modal-actions .portal-exec-modal-card { width:auto!important; max-height:none!important; overflow-x:auto!important; overflow-y:visible!important; }',
      'body > .portal-exec-modal .portal-exec-modal-actions { margin-top:14px; min-width:0; }',
      'body > .portal-exec-modal .portal-exec-modal-table { width:max-content; min-width:100%; }',
      'body > .portal-exec-modal .portal-exec-modal-table th, body > .portal-exec-modal .portal-exec-modal-table td { min-width:88px; line-height:1.4; }',
      'body > .portal-exec-modal .portal-exec-modal-table th:first-child, body > .portal-exec-modal .portal-exec-modal-table td:first-child { min-width:320px; }',
      '@media (max-width:1400px) { body > .portal-exec-modal .portal-exec-modal-grid { grid-template-columns:1fr!important; } }',
      '@media (max-width:720px) { body > .portal-exec-modal > .portal-exec-modal-card { width:min(99vw,99vw)!important; padding:16px!important; } }',
      '#view-dashboard .portal-exec-focus-grid { display:grid; gap:12px; grid-template-columns:repeat(4,minmax(0,1fr)); }',
      '#view-dashboard .portal-exec-focus-card { padding:14px; border-radius:18px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.03); }',
      '#view-dashboard .portal-exec-focus-card strong { color:#f6ead4; display:block; }',
      '#view-dashboard .portal-exec-focus-card p { margin:8px 0 0; color:rgba(245,232,207,.68); font-size:13px; }',
      '#view-dashboard .portal-exec-focus-card .portal-exec-chip-stack { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }',
      '#view-dashboard .portal-exec-focus-card .muted.small { color:rgba(245,232,207,.62); font-size:12px; }',
      '@media (max-width:1280px) { #view-dashboard .portal-exec-focus-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }',
      '@media (max-width:720px) { #view-dashboard .portal-exec-focus-grid { grid-template-columns:1fr; } }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function patchSource(source) {
    return source
      .replace(
        /(<div class="portal-exec-side-stack">\s*<div class="portal-exec-modal-card">[\s\S]*?<\/table>\s*<\/div>)\s*(\$\{renderActionBullets\([\s\S]*?\)\})\s*<\/div>\s*<\/div>/g,
        '$1</div></div><div class="portal-exec-modal-actions">$2</div>'
      )
      .split("executive.metrics.some((metric) => metric.adsReady) ? adsSection(executive) : '',")
      .join('adsSection(executive),')
      .split('Источник факта: ${esc(executive.range.availableLabel)} · актуально на ${esc(longDate(executive.range.max))}.')
      .join('Источник факта: ${esc(executive.range.availableLabel)} · daily bridge из Google Sheets в 09:00 МСК · актуально на ${esc(longDate(executive.range.max))}.');
  }

  async function inflateSource() {
    if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream is not available in this browser');
    const chunks = await Promise.all(PARTS.map(async function (part) {
      const response = await fetch(part + '?v=' + VERSION, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load ' + part + ' (' + response.status + ')');
      return response.text();
    }));
    const binary = atob(chunks.join(''));
    const bytes = Uint8Array.from(binary, function (char) { return char.charCodeAt(0); });
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return patchSource(await new Response(stream).text());
  }

  function dashboardSelectedPlatform() {
    return stateRef()?.uiHotfix?.dashboardPlatform || 'all';
  }

  function dashboardControlPlatformKey(platformKey) {
    if (platformKey === 'ya') return 'retail';
    if (platformKey === 'wb' || platformKey === 'ozon') return platformKey;
    return 'all';
  }

  function dashboardTaskWorkstreamKey(task) {
    const raw = String(task?.platform || '').trim().toLowerCase();
    const text = (raw + ' ' + (task?.title || '') + ' ' + (task?.nextAction || '') + ' ' + (task?.reason || '') + ' ' + (task?.entityLabel || '')).toLowerCase();
    if (['wb+ozon', 'wb + ozon', 'cross', 'common', 'shared', 'general', 'all'].includes(raw)) return 'cross';
    if (/(^|\W)wb($|\W)|wildberries|вб/.test(text)) return 'wb';
    if (/ozon|озон/.test(text)) return 'ozon';
    if (/retail|market|яндекс|я\.маркет|ям|letu|лету|магнит|golden apple|золот/.test(text)) return 'retail';
    return 'cross';
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
    if (dashboardTaskIsOverdue(task)) return chip('Просрочено', 'danger');
    if (task?.status === 'waiting_decision') return chip('Ждет решения', 'info');
    if (task?.status === 'in_progress') return chip('В работе', 'warn');
    if (task?.status === 'waiting_team') return chip('Ждет команду', 'info');
    return chip('Активна', 'ok');
  }

  function dashboardTaskPriorityChip(task) {
    if (task?.priority === 'critical') return chip('Критично', 'danger');
    if (task?.priority === 'high') return chip('Высокий', 'warn');
    if (task?.priority === 'medium') return chip('Средний', 'info');
    return chip('Планово', '');
  }

  function dashboardTaskPlatformChip(task) {
    const key = dashboardTaskWorkstreamKey(task);
    if (key === 'wb') return chip('WB', 'warn');
    if (key === 'ozon') return chip('Ozon', 'info');
    if (key === 'retail') return chip('ЯМ / сети', 'ok');
    return chip('Общий контур', '');
  }

  function dashboardTaskQueue(platformKey) {
    const snapshot = typeof window.getControlSnapshot === 'function'
      ? window.getControlSnapshot()
      : { tasks: (stateRef()?.storage?.tasks || []) };
    const tasks = Array.isArray(snapshot?.tasks) ? snapshot.tasks : [];
    return tasks.slice()
      .filter(function (task) { return task && task.source !== 'auto'; })
      .filter(dashboardTaskIsActive)
      .filter(function (task) { return dashboardTaskMatchesPlatform(task, platformKey); })
      .sort(function (left, right) {
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

  function openControlView(platformKey) {
    const app = stateRef();
    if (app) {
      app.controlFilters = app.controlFilters || {};
      app.controlFilters.platform = dashboardControlPlatformKey(platformKey);
      app.controlFilters.source = 'manual';
      app.controlFilters.status = 'active';
      app.controlFilters.type = 'all';
      app.controlFilters.horizon = 'all';
      app.controlFilters.owner = 'all';
      app.controlFilters.search = '';
      app.controlFilters.priority = 'all';
    }
    if (typeof window.setView === 'function') {
      window.setView('control');
      return;
    }
    document.querySelector('.nav-btn[data-view="control"]')?.click();
  }

  function buildTaskSectionHtml(platformKey) {
    const rows = dashboardTaskQueue(platformKey);
    const overdueCount = rows.filter(dashboardTaskIsOverdue).length;
    const ownerCount = new Set(rows.map(function (task) { return task.owner || 'Без owner'; })).size;
    const controlPlatformKey = dashboardControlPlatformKey(platformKey);
    const cards = rows.map(function (task) {
      const sku = typeof window.getSku === 'function' ? window.getSku(task.articleKey) : null;
      const tone = dashboardTaskTone(task);
      const title = task.title || 'Задача без названия';
      const subtitle = task.nextAction || task.reason || sku?.name || task.entityLabel || 'Нужен следующий шаг по задаче.';
      const subject = sku?.article || task.articleKey || task.entityLabel || 'Без SKU';
      return ''
        + '<article class="portal-exec-card portal-exec-focus-card is-' + esc(tone) + ' is-clickable" data-portal-open-control="1" data-portal-control-platform="' + esc(controlPlatformKey) + '">'
        + '  <div class="portal-exec-card-head">'
        + '    <span class="portal-exec-card-label">' + esc(subject) + '</span>'
        +      dashboardTaskStatusChip(task)
        + '  </div>'
        + '  <strong>' + esc(title) + '</strong>'
        + '  <p>' + esc(subtitle) + '</p>'
        + '  <div class="muted small" style="margin-top:8px">' + esc(task.owner || 'Без owner') + ' · срок ' + esc(task.due || '—') + '</div>'
        + '  <div class="portal-exec-chip-stack">'
        +       dashboardTaskPriorityChip(task)
        +       dashboardTaskPlatformChip(task)
        + '  </div>'
        + '</article>';
    }).join('');

    return ''
      + '<div class="portal-exec-head">'
      + '  <div class="portal-exec-copy">'
      + '    <h3>Задачи РОПов: что разобрать первым</h3>'
      + '    <p>Здесь показываем активные ручные задачи по выбранной площадке. Клик по карточке или по кнопке сверху открывает задачник с этим же контуром.</p>'
      + '  </div>'
      + '  <div class="badge-stack">'
      +       chip(int(rows.length) + ' задач', rows.length ? 'warn' : 'ok')
      +      (overdueCount ? chip(int(overdueCount) + ' проср.', 'danger') : chip(int(ownerCount) + ' owner', 'info'))
      + '    <button type="button" class="quick-chip" data-portal-open-control="1" data-portal-control-platform="' + esc(controlPlatformKey) + '">Открыть задачник</button>'
      + '  </div>'
      + '</div>'
      + '<div class="portal-exec-focus-grid">'
      +   (cards || '<div class="portal-exec-empty">По выбранной площадке сейчас нет ручных задач РОПов. Откройте задачник, чтобы посмотреть весь контур.</div>')
      + '</div>';
  }

  function applyRopTaskPanel() {
    const root = document.getElementById('view-dashboard');
    const container = root && root.querySelector('[data-portal-dashboard-executive-root]');
    if (!container) return;
    const sections = Array.from(container.querySelectorAll('.portal-exec-section'));
    const target = sections.find(function (section) {
      return section.dataset.portalRopTaskBlock === '1'
        || /Что разобрать первым/i.test(section.querySelector('.portal-exec-copy h3')?.textContent || '');
    }) || sections[3];
    if (!target) return;
    target.dataset.portalRopTaskBlock = '1';
    target.className = 'portal-exec-section is-highlight';
    target.innerHTML = buildTaskSectionHtml(dashboardSelectedPlatform());
  }

  function bindTaskOpeners() {
    if (document.body && document.body.dataset.portalRopTaskOpenersBound === '1') return;
    if (document.body) document.body.dataset.portalRopTaskOpenersBound = '1';
    document.addEventListener('click', function (event) {
      const node = event.target.closest('[data-portal-open-control]');
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      openControlView(node.dataset.portalControlPlatform || dashboardSelectedPlatform() || 'all');
    }, true);
  }

  function observeTaskPanel() {
    if (window[TASK_OBSERVER_KEY]) return;
    const attach = function () {
      const root = document.getElementById('view-dashboard');
      if (!root) return false;
      const observer = new MutationObserver(function () {
        window.requestAnimationFrame(applyRopTaskPanel);
      });
      observer.observe(root, { childList: true, subtree: true });
      window[TASK_OBSERVER_KEY] = observer;
      return true;
    };
    if (attach()) return;
    [600, 2200, 6000].forEach(function (delay) { window.setTimeout(attach, delay); });
  }

  let bootPromise = null;

  async function boot() {
    if (bootPromise) return bootPromise;
    bootPromise = (async function () {
      ensureModalLayoutFix();
      const source = await inflateSource();
      const runner = new Function(source + '\n//# sourceURL=portal-dashboard-interactive-hotfix.source.js?v=' + VERSION);
      runner.call(window);
      ensureModalLayoutFix();
      bindTaskOpeners();
      observeTaskPanel();
      [0, 80, 400].forEach(function (delay) { window.setTimeout(applyRopTaskPanel, delay); });
    })().catch(function (error) {
      console.warn('[portal-dashboard-interactive-loader]', error);
      bootPromise = null;
      throw error;
    });
    return bootPromise;
  }

  function start() {
    ensureModalLayoutFix();
    bindTaskOpeners();
    observeTaskPanel();
    [0, 80, 400].forEach(function (delay) { window.setTimeout(applyRopTaskPanel, delay); });
    if (window.__ALTEA_DASHBOARD_INTERACTIVE_20260419H__) return;
    boot().catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.setTimeout(start, 120); }, { once: true });
  } else {
    window.setTimeout(start, 120);
  }
  window.addEventListener('load', function () { window.setTimeout(start, 120); }, { once: true });
  [1200, 2600].forEach(function (delay) { window.setTimeout(start, delay); });
})();
