(function () {
  if (window.__ALTEA_DASHBOARD_ROP_TASK_HOTFIX_20260420D__) return;
  window.__ALTEA_DASHBOARD_ROP_TASK_HOTFIX_20260420D__ = true;

  const OBSERVER_KEY = '__ALTEA_DASHBOARD_ROP_TASK_OBSERVER_20260420D__';
  const TEXT = {
    title: '\u0417\u0430\u0434\u0430\u0447\u0438 \u0420\u041e\u041f\u043e\u0432: \u0447\u0442\u043e \u0440\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c \u043f\u0435\u0440\u0432\u044b\u043c',
    cards: '\u0437\u0430\u0434\u0430\u0447',
    manual: '\u0440\u0443\u0447\u043d\u044b\u0445',
    shortList: 'short-list',
    overdue: '\u043f\u0440\u043e\u0441\u0440.',
    owner: 'owner',
    openTasks: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u043d\u0438\u043a',
    active: '\u0410\u043a\u0442\u0438\u0432\u043d\u0430',
    waitingDecision: '\u0416\u0434\u0435\u0442 \u0440\u0435\u0448\u0435\u043d\u0438\u044f',
    inProgress: '\u0412 \u0440\u0430\u0431\u043e\u0442\u0435',
    waitingTeam: '\u0416\u0434\u0435\u0442 \u043a\u043e\u043c\u0430\u043d\u0434\u0443',
    overdueBadge: '\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u043e',
    critical: '\u041a\u0440\u0438\u0442\u0438\u0447\u043d\u043e',
    high: '\u0412\u044b\u0441\u043e\u043a\u0438\u0439',
    medium: '\u0421\u0440\u0435\u0434\u043d\u0438\u0439',
    planned: '\u041f\u043b\u0430\u043d\u043e\u0432\u043e',
    shared: '\u041e\u0431\u0449\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440',
    retail: '\u042f\u041c / \u0441\u0435\u0442\u0438',
    noSku: '\u0411\u0435\u0437 SKU',
    noOwner: '\u0411\u0435\u0437 owner',
    noTitle: '\u0417\u0430\u0434\u0430\u0447\u0430 \u0431\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f',
    noNextStep: '\u041d\u0443\u0436\u0435\u043d \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433 \u043f\u043e \u0437\u0430\u0434\u0430\u0447\u0435.',
    allPlatforms: '\u0412\u0441\u0435 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0438',
    emptyLabel: '\u041f\u0435\u0440\u0435\u0445\u043e\u0434 \u0432 \u0437\u0430\u0434\u0430\u0447\u043d\u0438\u043a',
    emptyNow: '\u0421\u0435\u0439\u0447\u0430\u0441 \u043f\u0443\u0441\u0442\u043e',
    emptyTitle: '\u041d\u0430 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u0440\u0443\u0447\u043d\u044b\u0445 \u0437\u0430\u0434\u0430\u0447 \u0420\u041e\u041f\u043e\u0432.',
    emptyBody: '\u0411\u043b\u043e\u043a \u043d\u0435 \u0441\u043b\u043e\u043c\u0430\u043d: \u0432 \u0442\u0435\u043a\u0443\u0449\u0435\u043c \u0441\u0440\u0435\u0437\u0435 \u0432 \u043a\u043e\u043d\u0442\u0443\u0440\u0435 \u043f\u0440\u043e\u0441\u0442\u043e \u043d\u0435\u0442 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0440\u0443\u0447\u043d\u044b\u0445 \u0437\u0430\u0434\u0430\u0447. \u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0437\u0430\u0434\u0430\u0447\u043d\u0438\u043a, \u0447\u0442\u043e\u0431\u044b \u043f\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u0442\u044c \u0432\u0435\u0441\u044c \u0440\u0435\u0435\u0441\u0442\u0440 \u0438 \u0438\u0441\u0442\u043e\u0440\u0438\u044e \u0441\u0442\u0430\u0442\u0443\u0441\u043e\u0432.',
    visibleLabel: '\u0427\u0442\u043e \u0441\u0435\u0439\u0447\u0430\u0441 \u0432\u0438\u0434\u0438\u0442 \u0431\u043b\u043e\u043a',
    visibleTitle: '\u0424\u0438\u043b\u044c\u0442\u0440 \u043f\u043e \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435 \u0438 \u0442\u0435\u043a\u0443\u0449\u0435\u043c\u0443 \u043f\u0435\u0440\u0438\u043e\u0434\u0443 \u0443\u0436\u0435 \u043f\u0440\u0438\u043c\u0435\u043d\u0435\u043d.',
    visibleBody: '\u041f\u043e\u0441\u043b\u0435 \u043f\u043e\u044f\u0432\u043b\u0435\u043d\u0438\u044f \u0440\u0443\u0447\u043d\u044b\u0445 \u0437\u0430\u0434\u0430\u0447 \u043e\u043d\u0438 \u043f\u043e\u043f\u0430\u0434\u0443\u0442 \u0441\u044e\u0434\u0430 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u0438 \u0431\u0443\u0434\u0443\u0442 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0442\u044c\u0441\u044f \u0432 \u0437\u0430\u0434\u0430\u0447\u043d\u0438\u043a \u0441 \u0442\u0435\u043c\u0438 \u0436\u0435 \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c\u0438.',
    visibleSource: '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: \u0440\u0443\u0447\u043d\u044b\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 task-center',
    fallbackIntro: '\u0420\u0443\u0447\u043d\u044b\u0445 \u0437\u0430\u0434\u0430\u0447 \u043f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435 \u0441\u0435\u0439\u0447\u0430\u0441 \u043d\u0435\u0442, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0439 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 short-list. \u041a\u043b\u0438\u043a \u043f\u043e \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435 \u0438\u043b\u0438 \u043f\u043e \u043a\u043d\u043e\u043f\u043a\u0435 \u0441\u0432\u0435\u0440\u0445\u0443 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u0432\u0435\u0441\u044c \u0437\u0430\u0434\u0430\u0447\u043d\u0438\u043a \u043f\u043e \u044d\u0442\u043e\u043c\u0443 \u043a\u043e\u043d\u0442\u0443\u0440\u0443.',
    liveIntro: '\u0417\u0434\u0435\u0441\u044c \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0440\u0443\u0447\u043d\u044b\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u043f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435. \u041a\u043b\u0438\u043a \u043f\u043e \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435 \u0438\u043b\u0438 \u043f\u043e \u043a\u043d\u043e\u043f\u043a\u0435 \u0441\u0432\u0435\u0440\u0445\u0443 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u0437\u0430\u0434\u0430\u0447\u043d\u0438\u043a \u0441 \u044d\u0442\u0438\u043c \u0436\u0435 \u043a\u043e\u043d\u0442\u0443\u0440\u043e\u043c.',
    graphsTitle: '5 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0447\u0435\u0441\u043a\u0438\u0445 \u0433\u0440\u0430\u0444\u0438\u043a\u043e\u0432',
    duePrefix: '\u0441\u0440\u043e\u043a '
  };

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
    return '<span class="portal-exec-chip ' + esc(tone || '') + '">' + esc(text) + '</span>';
  }

  function int(value) {
    if (typeof window.fmt?.int === 'function') return window.fmt.int(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
  }

  function cleanDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function iso(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.getFullYear()
      + '-' + String(date.getMonth() + 1).padStart(2, '0')
      + '-' + String(date.getDate()).padStart(2, '0');
  }

  function selectedPlatform() {
    return stateRef()?.uiHotfix?.dashboardPlatform || 'all';
  }

  function controlPlatformKey(platformKey) {
    if (platformKey === 'ya') return 'retail';
    if (platformKey === 'wb' || platformKey === 'ozon') return platformKey;
    return 'all';
  }

  function taskWorkstreamKey(task) {
    const raw = String(task?.platform || '').trim().toLowerCase();
    const text = (
      raw + ' '
      + String(task?.title || '') + ' '
      + String(task?.nextAction || '') + ' '
      + String(task?.reason || '') + ' '
      + String(task?.entityLabel || '')
    ).toLowerCase();
    if (['wb+ozon', 'wb + ozon', 'cross', 'common', 'shared', 'general', 'all'].includes(raw)) return 'cross';
    if (/(^|\W)wb($|\W)|wildberries/.test(text)) return 'wb';
    if (/ozon/.test(text)) return 'ozon';
    if (/retail|market|letu|golden apple|yandex/.test(text)) return 'retail';
    return 'cross';
  }

  function taskMatchesPlatform(task, platformKey) {
    const selected = controlPlatformKey(platformKey);
    if (selected === 'all') return true;
    const workstream = taskWorkstreamKey(task);
    return workstream === selected || workstream === 'cross';
  }

  function taskIsActive(task) {
    return ['new', 'in_progress', 'waiting_team', 'waiting_decision'].includes(String(task?.status || 'new'));
  }

  function taskIsOverdue(task) {
    return Boolean(task?.due) && taskIsActive(task) && String(task.due) < iso(cleanDate(new Date()));
  }

  function taskTone(task) {
    if (taskIsOverdue(task) || task?.priority === 'critical') return 'danger';
    if (task?.status === 'waiting_decision' || task?.priority === 'high') return 'warn';
    return 'ok';
  }

  function taskStatusChip(task) {
    if (taskIsOverdue(task)) return chip(TEXT.overdueBadge, 'danger');
    if (task?.status === 'waiting_decision') return chip(TEXT.waitingDecision, 'info');
    if (task?.status === 'in_progress') return chip(TEXT.inProgress, 'warn');
    if (task?.status === 'waiting_team') return chip(TEXT.waitingTeam, 'info');
    return chip(TEXT.active, 'ok');
  }

  function taskPriorityChip(task) {
    if (task?.priority === 'critical') return chip(TEXT.critical, 'danger');
    if (task?.priority === 'high') return chip(TEXT.high, 'warn');
    if (task?.priority === 'medium') return chip(TEXT.medium, 'info');
    return chip(TEXT.planned, '');
  }

  function taskPlatformChip(task) {
    const key = taskWorkstreamKey(task);
    if (key === 'wb') return chip('WB', 'warn');
    if (key === 'ozon') return chip('Ozon', 'info');
    if (key === 'retail') return chip(TEXT.retail, 'ok');
    return chip(TEXT.shared, '');
  }

  function taskSort(left, right) {
    const overdueDelta = Number(taskIsOverdue(right)) - Number(taskIsOverdue(left));
    if (overdueDelta) return overdueDelta;
    const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
    const priorityDelta = (priorityRank[right?.priority] || 0) - (priorityRank[left?.priority] || 0);
    if (priorityDelta) return priorityDelta;
    const waitingDelta = Number(right?.status === 'waiting_decision') - Number(left?.status === 'waiting_decision');
    if (waitingDelta) return waitingDelta;
    const dueDelta = String(left?.due || '9999-12-31').localeCompare(String(right?.due || '9999-12-31'));
    if (dueDelta) return dueDelta;
    return String(right?.createdAt || '').localeCompare(String(left?.createdAt || ''));
  }

  function taskPanelModel(platformKey) {
    const snapshot = typeof window.getControlSnapshot === 'function'
      ? window.getControlSnapshot()
      : { tasks: [] };
    const tasks = Array.isArray(snapshot?.tasks) ? snapshot.tasks : [];
    const manualRows = tasks.slice()
      .filter(Boolean)
      .filter(function (task) { return task.source !== 'auto'; })
      .filter(taskIsActive)
      .filter(function (task) { return taskMatchesPlatform(task, platformKey); })
      .sort(taskSort);
    const fallbackPool = Array.isArray(snapshot?.todayList) && snapshot.todayList.length
      ? snapshot.todayList
      : Array.isArray(snapshot?.active) && snapshot.active.length
        ? snapshot.active
        : tasks;
    const fallbackRows = fallbackPool.slice()
      .filter(Boolean)
      .filter(taskIsActive)
      .filter(function (task) { return taskMatchesPlatform(task, platformKey); })
      .sort(taskSort);
    const usingFallback = manualRows.length === 0;
    return {
      rows: (usingFallback ? fallbackRows : manualRows).slice(0, 8),
      manualCount: manualRows.length,
      usingFallback
    };
  }

  function openControlView(platformKey) {
    const app = stateRef();
    if (app) {
      app.controlFilters = app.controlFilters || {};
      app.controlFilters.platform = controlPlatformKey(platformKey);
      app.controlFilters.source = 'all';
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

  function buildTaskCard(task, platform) {
    const sku = typeof window.getSku === 'function' ? window.getSku(task.articleKey) : null;
    const title = task.title || TEXT.noTitle;
    const subtitle = task.nextAction || task.reason || sku?.name || task.entityLabel || TEXT.noNextStep;
    const subject = sku?.article || task.articleKey || task.entityLabel || TEXT.noSku;
    const owner = task.owner || TEXT.noOwner;
    const due = task.due || '\u2014';
    return ''
      + '<article class="portal-exec-card portal-exec-focus-card is-' + esc(taskTone(task)) + ' is-clickable" data-portal-open-control="1" data-portal-control-platform="' + esc(platform) + '">'
      + '  <div class="portal-exec-card-head">'
      + '    <span class="portal-exec-card-label">' + esc(subject) + '</span>'
      +      taskStatusChip(task)
      + '  </div>'
      + '  <strong>' + esc(title) + '</strong>'
      + '  <p>' + esc(subtitle) + '</p>'
      + '  <div class="muted small" style="margin-top:8px">' + esc(owner) + ' · ' + esc(TEXT.duePrefix + due) + '</div>'
      + '  <div class="portal-exec-chip-stack">'
      +       taskPriorityChip(task)
      +       taskPlatformChip(task)
      + '  </div>'
      + '</article>';
  }

  function buildEmptyCards(platformKey) {
    const platform = controlPlatformKey(platformKey);
    const selectedPlatformLabel = platformKey === 'all' ? TEXT.allPlatforms : String(platformKey || '').toUpperCase();
    return ''
      + '<article class="portal-exec-card portal-exec-focus-card is-ok is-clickable" data-portal-open-control="1" data-portal-control-platform="' + esc(platform) + '">'
      + '  <div class="portal-exec-card-head">'
      + '    <span class="portal-exec-card-label">' + esc(TEXT.emptyLabel) + '</span>'
      +       chip(TEXT.emptyNow, 'ok')
      + '  </div>'
      + '  <strong>' + esc(TEXT.emptyTitle) + '</strong>'
      + '  <p>' + esc(TEXT.emptyBody) + '</p>'
      + '  <div class="portal-exec-chip-stack">'
      + '    <button type="button" class="quick-chip" data-portal-open-control="1" data-portal-control-platform="' + esc(platform) + '">' + esc(TEXT.openTasks) + '</button>'
      + '  </div>'
      + '</article>'
      + '<article class="portal-exec-card portal-exec-focus-card is-warn">'
      + '  <div class="portal-exec-card-head">'
      + '    <span class="portal-exec-card-label">' + esc(TEXT.visibleLabel) + '</span>'
      +       chip(selectedPlatformLabel, 'info')
      + '  </div>'
      + '  <strong>' + esc(TEXT.visibleTitle) + '</strong>'
      + '  <p>' + esc(TEXT.visibleBody) + '</p>'
      + '  <div class="muted small" style="margin-top:8px">' + esc(TEXT.visibleSource) + '</div>'
      + '</article>';
  }

  function buildSectionHtml(platformKey) {
    const panel = taskPanelModel(platformKey);
    const rows = panel.rows;
    const overdueCount = rows.filter(taskIsOverdue).length;
    const ownerCount = new Set(rows.map(function (task) { return task.owner || TEXT.noOwner; })).size;
    const platform = controlPlatformKey(platformKey);
    const cards = rows.map(function (task) { return buildTaskCard(task, platform); }).join('');
    return ''
      + '<div class="portal-exec-head">'
      + '  <div class="portal-exec-copy">'
      + '    <h3>' + esc(TEXT.title) + '</h3>'
      + '    <p>' + esc(panel.usingFallback ? TEXT.fallbackIntro : TEXT.liveIntro) + '</p>'
      + '  </div>'
      + '  <div class="portal-exec-chip-stack">'
      +       chip(int(rows.length) + ' ' + TEXT.cards, rows.length ? 'warn' : 'ok')
      +      (panel.usingFallback ? chip(TEXT.shortList, 'info') : chip(int(panel.manualCount) + ' ' + TEXT.manual, 'info'))
      +      (overdueCount ? chip(int(overdueCount) + ' ' + TEXT.overdue, 'danger') : chip(int(ownerCount) + ' ' + TEXT.owner, 'info'))
      + '    <button type="button" class="quick-chip" data-portal-open-control="1" data-portal-control-platform="' + esc(platform) + '">' + esc(TEXT.openTasks) + '</button>'
      + '  </div>'
      + '</div>'
      + '<div class="portal-exec-focus-grid">'
      +   (cards || buildEmptyCards(platformKey))
      + '</div>';
  }

  function revealSection(target) {
    if (!target) return;
    [
      target,
      ...target.querySelectorAll('.portal-exec-head, .portal-exec-copy, .portal-exec-focus-grid, .portal-exec-empty, .portal-exec-focus-card, .portal-exec-chip-stack, .quick-chip')
    ].forEach(function (node) {
      if (!node || !node.style) return;
      node.style.removeProperty('display');
      node.style.removeProperty('visibility');
      node.style.removeProperty('opacity');
      node.removeAttribute('hidden');
    });
  }

  function isTaskSection(section) {
    if (!section) return false;
    const title = (section.querySelector('.portal-exec-copy h3')?.textContent || '').trim();
    return section.dataset.portalRopTaskBlock === '1'
      || title === TEXT.title
      || title.indexOf('\u0427\u0442\u043e \u0440\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c \u043f\u0435\u0440\u0432\u044b\u043c') !== -1;
  }

  function applyTaskSection() {
    const root = document.getElementById('view-dashboard');
    const container = root && root.querySelector('[data-portal-dashboard-executive-root]');
    if (!container) return;

    const sections = Array.from(container.querySelectorAll('.portal-exec-section'));
    let target = sections.find(isTaskSection) || null;
    if (!target) {
      target = document.createElement('section');
      container.appendChild(target);
    }

    target.dataset.portalRopTaskBlock = '1';
    target.className = 'portal-exec-section is-highlight';
    target.innerHTML = buildSectionHtml(selectedPlatform());

    const metricSection = sections.find(function (section) {
      const title = (section.querySelector('.portal-exec-copy h3')?.textContent || '').trim();
      return title === TEXT.graphsTitle;
    }) || sections[0] || null;

    if (metricSection && metricSection.nextElementSibling !== target) {
      metricSection.insertAdjacentElement('afterend', target);
    }

    revealSection(target);
    window.requestAnimationFrame(function () { revealSection(target); });
    window.setTimeout(function () { revealSection(target); }, 120);
  }

  function bindOpeners() {
    if (document.body?.dataset.portalRopTaskHotfixBound === '1') return;
    if (document.body) document.body.dataset.portalRopTaskHotfixBound = '1';
    document.addEventListener('click', function (event) {
      const node = event.target.closest('[data-portal-open-control]');
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      openControlView(node.dataset.portalControlPlatform || selectedPlatform() || 'all');
    }, true);
  }

  function observeDashboard() {
    if (window[OBSERVER_KEY]) return;
    const attach = function () {
      const root = document.getElementById('view-dashboard');
      if (!root) return false;
      const observer = new MutationObserver(function () {
        window.requestAnimationFrame(applyTaskSection);
      });
      observer.observe(root, { childList: true, subtree: true });
      window[OBSERVER_KEY] = observer;
      return true;
    };
    if (attach()) return;
    [500, 1600, 4200].forEach(function (delay) {
      window.setTimeout(attach, delay);
    });
  }

  function start() {
    bindOpeners();
    observeDashboard();
    [0, 100, 500, 1400].forEach(function (delay) {
      window.setTimeout(applyTaskSection, delay);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.setTimeout(start, 80);
    }, { once: true });
  } else {
    window.setTimeout(start, 80);
  }

  window.addEventListener('load', function () {
    window.setTimeout(start, 120);
  }, { once: true });
})();
