(function () {
  if (window.__ALTEA_DASHBOARD_ROP_TASK_HOTFIX_20260420E__) return;
  window.__ALTEA_DASHBOARD_ROP_TASK_HOTFIX_20260420E__ = true;

  const OBSERVER_KEY = '__ALTEA_DASHBOARD_ROP_TASK_OBSERVER_20260420E__';
  const TASK_PATCH_KEY = '__ALTEA_DASHBOARD_MODAL_TASK_PATCH_20260420E__';
  const TASK_STYLE_ID = 'portalDashboardModalTaskComposerStyles20260420e';
  const TEXT = {
    title: '\u0417\u0430\u0434\u0430\u0447\u0438 \u0420\u041e\u041f\u043e\u0432: \u0447\u0442\u043e \u0440\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c \u043f\u0435\u0440\u0432\u044b\u043c',
    cards: '\u0437\u0430\u0434\u0430\u0447',
    manual: '\u0440\u0443\u0447\u043d\u044b\u0445',
    shortList: 'short-list',
    overdue: '\u043f\u0440\u043e\u0441\u0440.',
    owner: 'owner',
    openTasks: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u043d\u0438\u043a',
    active: '\u0410\u043a\u0442\u0438\u0432\u043d\u0430',
    waitingRop: '\u041d\u0430 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u0438 \u0443 \u0420\u041e\u041f\u0430',
    waitingDecision: '\u0416\u0434\u0435\u0442 \u0440\u0435\u0448\u0435\u043d\u0438\u044f',
    inProgress: '\u0412 \u0440\u0430\u0431\u043e\u0442\u0435',
    waitingTeam: '\u0416\u0434\u0435\u0442 \u043a\u043e\u043c\u0430\u043d\u0434\u0443',
    overdueBadge: '\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u043e',
    low: '\u041d\u0438\u0437\u043a\u0438\u0439',
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
    duePrefix: '\u0441\u0440\u043e\u043a ',
    createTaskTitle: '\u041f\u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443 \u0438\u0437 \u044d\u0442\u043e\u0433\u043e \u043e\u043a\u043d\u0430',
    createTaskBody: '\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 SKU, \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0447\u0442\u043e \u0441\u0434\u0435\u043b\u0430\u0442\u044c, \u043d\u0430\u0437\u043d\u0430\u0447\u044c\u0442\u0435 owner \u0438 \u0441\u0440\u043e\u043a. \u0417\u0430\u0434\u0430\u0447\u0430 \u0441\u0440\u0430\u0437\u0443 \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u0432\u043e \u0432\u043a\u043b\u0430\u0434\u043a\u0435 \u00ab\u0417\u0430\u0434\u0430\u0447\u0438\u00bb.',
    fieldSku: 'SKU',
    fieldOwner: 'Owner',
    fieldDue: '\u0421\u0440\u043e\u043a',
    fieldPriority: '\u041f\u0440\u0438\u043e\u0440\u0438\u0442\u0435\u0442',
    fieldTaskTitle: '\u0427\u0442\u043e \u0437\u0430 \u0437\u0430\u0434\u0430\u0447\u0430',
    fieldNextAction: '\u0427\u0442\u043e \u0441\u0434\u0435\u043b\u0430\u0442\u044c / \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439',
    placeholderOwner: '\u041a\u0442\u043e \u043e\u0442\u0432\u0435\u0447\u0430\u0435\u0442',
    placeholderTaskTitle: '\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \u0420\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c \u0446\u0435\u043d\u0443 \u043f\u043e SKU',
    placeholderNextAction: '\u041a\u0430\u043a\u043e\u0439 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433 \u043d\u0443\u0436\u0435\u043d \u043f\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u0438',
    submitTask: '\u041f\u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443',
    taskCreatedIntro: '\u041f\u043e\u0441\u043b\u0435 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f \u0437\u0430\u0434\u0430\u0447\u0430 \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u0432\u043e \u0432\u043a\u043b\u0430\u0434\u043a\u0435 \u00ab\u0417\u0430\u0434\u0430\u0447\u0438\u00bb.',
    taskFillRequired: '\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0430\u0440\u0442\u0438\u043a\u0443\u043b, \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433.',
    taskCreatedPrefix: '\u0417\u0430\u0434\u0430\u0447\u0430 \u043f\u043e ',
    taskCreatedSuffix: ' \u0441\u043e\u0437\u0434\u0430\u043d\u0430.',
    taskCreateError: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.',
    pickTask: '\u041f\u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443',
    defaultTaskSubject: '\u0440\u0430\u0437\u0431\u043e\u0440 SKU',
    defaultTaskTitlePrefix: '\u0420\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c ',
    defaultTaskActionPrefix: '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c SKU ',
    defaultTaskActionInWindow: ' \u0432 \u043e\u043a\u043d\u0435 \u00ab',
    defaultTaskActionSuffix: '\u00bb, \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c \u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u0438 \u0437\u0430\u0444\u0438\u043a\u0441\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433.'
  };

  const PLATFORM_LABELS = {
    wb: 'WB',
    ozon: 'Ozon',
    ya: '\u042f.\u041c\u0430\u0440\u043a\u0435\u0442',
    goldapple: '\u0417\u043e\u043b\u043e\u0442\u043e\u0435 \u042f\u0431\u043b\u043e\u043a\u043e',
    letu: 'L\'\u042d\u0442\u0443\u0430\u043b\u044c',
    magnit: '\u041c\u0430\u0433\u043d\u0438\u0442 \u041c\u0430\u0440\u043a\u0435\u0442',
    retail: TEXT.retail,
    cross: TEXT.shared
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
    const raw = String(platformKey || '').trim().toLowerCase();
    if (raw === 'retail') return 'ya';
    if (raw === 'wb' || raw === 'ozon' || raw === 'ya' || raw === 'goldapple' || raw === 'letu' || raw === 'magnit') return raw;
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
    if (raw === 'wb' || /(^|\W)wb($|\W)|wildberries/.test(text)) return 'wb';
    if (raw === 'ozon' || /ozon/.test(text)) return 'ozon';
    if (raw === 'ya' || raw === 'ym' || raw === 'yandex' || /яндекс|я[.\s-]?маркет/.test(text)) return 'ya';
    if (raw === 'goldapple' || raw === 'zya' || /золот[а-я\s-]*яблок|gold\s*apple|zya|зя/.test(text)) return 'goldapple';
    if (raw === 'letu' || /letu?al|л[еэ]туал/.test(text)) return 'letu';
    if (raw === 'magnit' || raw === 'mm' || /магнит/.test(text)) return 'magnit';
    if (/retail|market/.test(text)) return 'ya';
    return 'cross';
  }

  function taskMatchesPlatform(task, platformKey) {
    const selected = controlPlatformKey(platformKey);
    if (selected === 'all') return true;
    const workstream = taskWorkstreamKey(task);
    return workstream === selected || workstream === 'cross';
  }

  function taskIsActive(task) {
    return ['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision'].includes(String(task?.status || 'new'));
  }

  function taskIsOverdue(task) {
    return Boolean(task?.due) && taskIsActive(task) && String(task.due) < iso(cleanDate(new Date()));
  }

  function taskTone(task) {
    if (taskIsOverdue(task) || task?.priority === 'critical') return 'danger';
    if (task?.status === 'waiting_decision' || task?.status === 'waiting_rop' || task?.priority === 'high') return 'warn';
    return 'ok';
  }

  function taskStatusChip(task) {
    if (taskIsOverdue(task)) return chip(TEXT.overdueBadge, 'danger');
    if (task?.status === 'waiting_rop') return chip(TEXT.waitingRop, 'info');
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
    if (key === 'ya') return chip(PLATFORM_LABELS.ya, 'ok');
    if (key === 'goldapple') return chip(PLATFORM_LABELS.goldapple, 'ok');
    if (key === 'letu') return chip(PLATFORM_LABELS.letu, 'ok');
    if (key === 'magnit') return chip(PLATFORM_LABELS.magnit, 'ok');
    if (key === 'retail') return chip(TEXT.retail, 'ok');
    return chip(TEXT.shared, '');
  }

  function taskSort(left, right) {
    const overdueDelta = Number(taskIsOverdue(right)) - Number(taskIsOverdue(left));
    if (overdueDelta) return overdueDelta;
    const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
    const priorityDelta = (priorityRank[right?.priority] || 0) - (priorityRank[left?.priority] || 0);
    if (priorityDelta) return priorityDelta;
    const waitingStatuses = ['waiting_rop', 'waiting_decision'];
    const waitingDelta = Number(waitingStatuses.includes(right?.status)) - Number(waitingStatuses.includes(left?.status));
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
    const selectedPlatformLabel = platformKey === 'all' ? TEXT.allPlatforms : (PLATFORM_LABELS[platform] || String(platformKey || '').toUpperCase());
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

  function plusDaysIso(days) {
    if (typeof window.plusDays === 'function') return window.plusDays(days);
    const date = cleanDate(new Date());
    date.setDate(date.getDate() + Number(days || 0));
    return iso(date);
  }

  function numberOrZero(value) {
    if (typeof window.num === 'function') return window.num(value);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function taskOwnerOptions() {
    const direct = typeof window.ownerOptions === 'function' ? window.ownerOptions() : [];
    if (Array.isArray(direct) && direct.length) return direct.filter(Boolean);
    const skuRows = Array.isArray(stateRef()?.skus) ? stateRef().skus : [];
    return Array.from(new Set(skuRows
      .map(function (sku) {
        return String(
          sku?.owner
          || sku?.ownerName
          || sku?.owner_name
          || sku?.manager
          || ''
        ).trim();
      })
      .filter(Boolean)))
      .sort(function (left, right) { return String(left).localeCompare(String(right), 'ru'); });
  }

  function ensureTaskComposerStyles() {
    if (document.getElementById(TASK_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TASK_STYLE_ID;
    style.textContent = `
      body > .portal-exec-modal .portal-exec-task-panel { margin-top: 14px; }
      body > .portal-exec-modal .portal-exec-task-panel .portal-exec-modal-card { padding: 16px; }
      body > .portal-exec-modal .portal-exec-modal-task-copy { display: grid; gap: 8px; margin-bottom: 12px; }
      body > .portal-exec-modal .portal-exec-modal-task-copy strong { color: #f6ead4; font-size: 18px; }
      body > .portal-exec-modal .portal-exec-modal-task-copy p { margin: 0; color: rgba(245,232,207,.72); line-height: 1.5; }
      body > .portal-exec-modal .portal-exec-task-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      body > .portal-exec-modal .portal-exec-task-grid label { display: grid; gap: 6px; min-width: 0; }
      body > .portal-exec-modal .portal-exec-task-grid label.wide { grid-column: 1 / -1; }
      body > .portal-exec-modal .portal-exec-task-grid span { color: rgba(245,232,207,.72); font-size: 12px; }
      body > .portal-exec-modal .portal-exec-task-grid input,
      body > .portal-exec-modal .portal-exec-task-grid select,
      body > .portal-exec-modal .portal-exec-task-grid textarea {
        width: 100%;
        min-width: 0;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(212,164,74,.18);
        background: rgba(17,14,11,.96);
        color: #f6ead4;
        font: inherit;
        box-sizing: border-box;
      }
      body > .portal-exec-modal .portal-exec-task-grid textarea { min-height: 96px; resize: vertical; }
      body > .portal-exec-modal .portal-exec-task-grid input:focus,
      body > .portal-exec-modal .portal-exec-task-grid select:focus,
      body > .portal-exec-modal .portal-exec-task-grid textarea:focus {
        outline: none;
        border-color: rgba(236,203,123,.88);
        box-shadow: 0 0 0 3px rgba(212,164,74,.12);
      }
      body > .portal-exec-modal .portal-exec-task-actions {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      body > .portal-exec-modal .portal-exec-task-actions .portal-exec-chip-stack { display: flex; gap: 8px; flex-wrap: wrap; }
      body > .portal-exec-modal .portal-exec-task-status { color: rgba(245,232,207,.68); font-size: 12px; }
      body > .portal-exec-modal .portal-exec-task-status.is-success { color: #9fdfab; }
      body > .portal-exec-modal .portal-exec-task-status.is-error { color: #ff9a8a; }
      body > .portal-exec-modal .portal-exec-issue-row .quick-chip { margin-top: 10px; }
      @media (max-width: 900px) {
        body > .portal-exec-modal .portal-exec-task-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 720px) {
        body > .portal-exec-modal .portal-exec-task-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function modalTaskPriorityMeta() {
    return {
      low: TEXT.low,
      medium: TEXT.medium,
      high: TEXT.high,
      critical: TEXT.critical
    };
  }

  function normalizeModalTaskRow(detail, row) {
    const articleKey = String(row?.articleKey || row?.article || '').trim();
    if (!articleKey) return null;
    const sku = typeof window.getSku === 'function' ? window.getSku(articleKey) : null;
    const owner = row?.owner || (typeof window.ownerName === 'function' ? window.ownerName(sku) : '') || '';
    const detailLabel = detail?.taskPreset?.label || detail?.title || TEXT.defaultTaskSubject;
    const platformKey = row?.platformKey || detail?.taskPreset?.platformKey || '';
    let priority = row?.priority || detail?.taskPreset?.priority || 'high';
    if (!row?.priority && typeof row?.score === 'number') {
      priority = row.score >= 7 ? 'critical' : row.score >= 4 ? 'high' : 'medium';
    }
    if (!row?.priority && typeof row?.marginPct === 'number' && row.marginPct < 0) {
      priority = 'critical';
    }
    const title = String(row?.taskTitle || '').trim() || (TEXT.defaultTaskTitlePrefix + articleKey);
    const nextAction = String(row?.nextAction || row?.reasons || detail?.taskPreset?.nextAction || '').trim()
      || (TEXT.defaultTaskActionPrefix + articleKey + TEXT.defaultTaskActionInWindow + detailLabel + TEXT.defaultTaskActionSuffix);
    return {
      articleKey,
      label: articleKey
        + (row?.name ? ' · ' + row.name : sku?.name ? ' · ' + sku.name : ''),
      owner,
      platformKey,
      priority,
      type: row?.type || detail?.taskPreset?.type || 'price_margin',
      title,
      nextAction
    };
  }

  function modalTaskRows(detail) {
    const raw = Array.isArray(detail?.taskRows) ? detail.taskRows : [];
    const seen = new Set();
    return raw
      .map(function (row) { return normalizeModalTaskRow(detail, row); })
      .filter(function (row) {
        if (!row || seen.has(row.articleKey)) return false;
        seen.add(row.articleKey);
        return true;
      });
  }

  function renderModalTaskPanel(detail) {
    const rows = modalTaskRows(detail);
    if (!rows.length) return '';
    const first = rows[0];
    const owners = taskOwnerOptions();
    const priorities = modalTaskPriorityMeta();
    return `
      <section class="portal-exec-task-panel">
        <div class="portal-exec-modal-card">
          <div class="portal-exec-modal-task-copy">
            <strong>${esc(TEXT.createTaskTitle)}</strong>
            <p>${esc(TEXT.createTaskBody)}</p>
          </div>
          <form data-portal-task-form="1">
            <div class="portal-exec-task-grid">
              <label>
                <span>${esc(TEXT.fieldSku)}</span>
                <select name="articleKey">
                  ${rows.map(function (row) { return `<option value="${esc(row.articleKey)}">${esc(row.label)}</option>`; }).join('')}
                </select>
              </label>
              <label>
                <span>${esc(TEXT.fieldOwner)}</span>
                <input name="owner" list="portalExecModalOwners" value="${esc(first.owner || '')}" placeholder="${esc(TEXT.placeholderOwner)}">
              </label>
              <label>
                <span>${esc(TEXT.fieldDue)}</span>
                <input type="date" name="due" value="${esc(plusDaysIso(3))}">
              </label>
              <label>
                <span>${esc(TEXT.fieldPriority)}</span>
                <select name="priority">
                  ${Object.entries(priorities).map(function (entry) {
                    const key = entry[0];
                    const label = entry[1];
                    return `<option value="${key}" ${first.priority === key ? 'selected' : ''}>${esc(label)}</option>`;
                  }).join('')}
                </select>
              </label>
              <label class="wide">
                <span>${esc(TEXT.fieldTaskTitle)}</span>
                <input name="title" value="${esc(first.title)}" placeholder="${esc(TEXT.placeholderTaskTitle)}">
              </label>
              <label class="wide">
                <span>${esc(TEXT.fieldNextAction)}</span>
                <textarea name="nextAction" placeholder="${esc(TEXT.placeholderNextAction)}">${esc(first.nextAction)}</textarea>
              </label>
            </div>
            <div class="portal-exec-task-actions">
              <div class="portal-exec-chip-stack">
                <button type="submit" class="btn">${esc(TEXT.submitTask)}</button>
                <button type="button" class="btn ghost" data-portal-task-open-control="1">${esc(TEXT.openTasks)}</button>
              </div>
              <div class="portal-exec-task-status" data-portal-task-status>${esc(TEXT.taskCreatedIntro)}</div>
            </div>
            <datalist id="portalExecModalOwners">
              ${owners.map(function (name) { return `<option value="${esc(name)}"></option>`; }).join('')}
            </datalist>
          </form>
        </div>
      </section>
    `;
  }

  function withModalTaskPanel(detail) {
    if (!detail || detail.__dashboardTaskPanelApplied) return detail;
    const panel = renderModalTaskPanel(detail);
    if (!panel) return detail;
    return {
      ...detail,
      __dashboardTaskPanelApplied: true,
      body: `${detail.body || ''}${panel}`
    };
  }

  function bindModalTaskPanel(modal, detail) {
    const form = modal && modal.querySelector('[data-portal-task-form]');
    if (!form || form.dataset.portalTaskBound === '1') return;
    const rows = modalTaskRows(detail);
    if (!rows.length) return;
    form.dataset.portalTaskBound = '1';
    const rowMap = new Map(rows.map(function (row) { return [row.articleKey, row]; }));
    const statusNode = form.querySelector('[data-portal-task-status]');

    function setStatus(kind, text) {
      if (!statusNode) return;
      statusNode.className = 'portal-exec-task-status' + (kind ? ' is-' + kind : '');
      statusNode.textContent = text;
    }

    function syncSelected(articleKey) {
      const row = rowMap.get(articleKey);
      if (!row) return;
      form.elements.owner.value = row.owner || '';
      form.elements.title.value = row.title || '';
      form.elements.nextAction.value = row.nextAction || '';
      form.elements.priority.value = row.priority || 'high';
    }

    if (form.elements.articleKey) {
      form.elements.articleKey.addEventListener('change', function (event) {
        syncSelected(event.target.value);
      });
    }

    modal.querySelectorAll('[data-portal-task-pick]').forEach(function (button) {
      button.addEventListener('click', function () {
        const articleKey = button.dataset.portalTaskPick;
        if (!articleKey || !rowMap.has(articleKey)) return;
        form.elements.articleKey.value = articleKey;
        syncSelected(articleKey);
        form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });

    const openControlButton = form.querySelector('[data-portal-task-open-control]');
    if (openControlButton) {
      openControlButton.addEventListener('click', function () {
        const row = rowMap.get(form.elements.articleKey.value);
        openControlView(row?.platformKey || detail?.taskPreset?.platformKey || 'all');
      });
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const articleKey = String(form.elements.articleKey.value || '').trim();
      const title = String(form.elements.title.value || '').trim();
      const nextAction = String(form.elements.nextAction.value || '').trim();
      if (!articleKey || !title || !nextAction) {
        setStatus('error', TEXT.taskFillRequired);
        return;
      }
      if (typeof window.createManualTask !== 'function') {
        setStatus('error', TEXT.taskCreateError);
        return;
      }
      const row = rowMap.get(articleKey);
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      try {
        await window.createManualTask({
          articleKey: articleKey,
          title: title,
          nextAction: nextAction,
          owner: String(form.elements.owner.value || '').trim(),
          due: form.elements.due.value,
          priority: form.elements.priority.value,
          type: row?.type || 'price_margin',
          platform: row?.platformKey || ''
        });
        if (typeof window.updateSyncBadge === 'function') window.updateSyncBadge();
        if (typeof window.rerenderCurrentView === 'function') window.rerenderCurrentView();
        setStatus('success', TEXT.taskCreatedPrefix + articleKey + TEXT.taskCreatedSuffix);
      } catch (error) {
        console.error(error);
        setStatus('error', TEXT.taskCreateError);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  function modalPlatformKey(value) {
    const raw = String(value || '').toLowerCase();
    if (raw === 'wb' || /(^|\W)wb($|\W)|wildberries/.test(raw)) return 'wb';
    if (raw === 'ozon' || /ozon/.test(raw)) return 'ozon';
    if (raw === 'ya' || raw === 'ym' || raw === 'yandex' || /\u044f\u043c|\u0441\u0435\u0442|\u044f\u043d\u0434\u0435\u043a\u0441|market|retail/.test(raw)) return 'ya';
    if (raw === 'goldapple' || raw === 'zya' || /золот[а-я\s-]*яблок|gold\s*apple|zya|зя/.test(raw)) return 'goldapple';
    if (raw === 'letu' || /letu?al|л[еэ]туал/.test(raw)) return 'letu';
    if (raw === 'magnit' || raw === 'mm' || /магнит/.test(raw)) return 'magnit';
    return 'all';
  }

  function modalTaskPreset(modalTitle) {
    const title = String(modalTitle || '').toLowerCase();
    const platformKey = modalPlatformKey(modalTitle);
    if (/\u0440\u0438\u0441\u043a/.test(title)) {
      return {
        label: modalTitle,
        platformKey: platformKey,
        priority: 'critical',
        type: 'price_margin',
        titlePrefix: '\u0420\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c \u0440\u0438\u0441\u043a \u043f\u043e SKU ',
        nextActionPrefix: '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0440\u0438\u0441\u043a \u0438 \u043f\u0440\u0438\u0447\u0438\u043d\u0443 \u043f\u043e SKU '
      };
    }
    if (/\u043f\u043b\u0430\u043d|\u0432\u044b\u043f\u043e\u043b\u043d/.test(title)) {
      return {
        label: modalTitle,
        platformKey: platformKey,
        priority: 'high',
        type: 'assignment',
        titlePrefix: '\u0420\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435 \u043f\u043b\u0430\u043d\u0430 \u043f\u043e SKU ',
        nextActionPrefix: '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043f\u043b\u0430\u043d / \u0444\u0430\u043a\u0442 \u0438 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c \u0448\u0430\u0433 \u043f\u043e SKU '
      };
    }
    if (/\u0446\u0435\u043d|\u0447\u0435\u043a/.test(title)) {
      return {
        label: modalTitle,
        platformKey: platformKey,
        priority: 'high',
        type: 'price_margin',
        titlePrefix: '\u0420\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c \u0446\u0435\u043d\u0443 \u043f\u043e SKU ',
        nextActionPrefix: '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0446\u0435\u043d\u0443, \u0447\u0435\u043a \u0438 \u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u043f\u043e SKU '
      };
    }
    if (/\u043c\u0430\u0440\u0436/.test(title)) {
      return {
        label: modalTitle,
        platformKey: platformKey,
        priority: 'critical',
        type: 'price_margin',
        titlePrefix: '\u0420\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c \u043c\u0430\u0440\u0436\u0443 \u043f\u043e SKU ',
        nextActionPrefix: '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043c\u0430\u0440\u0436\u0443 \u0438 \u043a\u043e\u0440\u0438\u0434\u043e\u0440 \u0446\u0435\u043d\u044b \u043f\u043e SKU '
      };
    }
    if (/\u043e\u0431\u043e\u0440\u0430\u0447|\u043e\u0441\u0442\u0430\u0442|\u0437\u0430\u043f\u0430\u0441/.test(title)) {
      return {
        label: modalTitle,
        platformKey: platformKey,
        priority: 'high',
        type: 'supply',
        titlePrefix: '\u0420\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c \u043e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c \u043f\u043e SKU ',
        nextActionPrefix: '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c, \u043e\u0441\u0442\u0430\u0442\u043e\u043a \u0438 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0443 \u043f\u043e SKU '
      };
    }
    return {
      label: modalTitle,
      platformKey: platformKey,
      priority: 'high',
      type: 'assignment',
      titlePrefix: '\u0420\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c SKU ',
      nextActionPrefix: '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c SKU '
    };
  }

  function modalTitleNode(modal) {
    return modal?.querySelector('#portalDashboardExecutiveModalTitle')
      || modal?.querySelector('h2')
      || modal?.querySelector('h3');
  }

  function modalTitleText(modal) {
    return modalTitleNode(modal)?.textContent?.trim() || '';
  }

  function tableTaskRows(modal, preset) {
    return Array.from(modal.querySelectorAll('table')).flatMap(function (table) {
      const headers = Array.from(table.querySelectorAll('thead th')).map(function (node) {
        return String(node.textContent || '').trim().toLowerCase();
      });
      const skuIndex = headers.findIndex(function (label) { return label.indexOf('sku') !== -1; });
      if (skuIndex === -1) return [];
      const ownerIndex = headers.findIndex(function (label) { return label.indexOf('owner') !== -1; });
      const platformIndex = headers.findIndex(function (label) {
        return label.indexOf('\u043f\u043b\u043e\u0449') !== -1 || label.indexOf('platform') !== -1;
      });
      return Array.from(table.querySelectorAll('tbody tr')).map(function (row) {
        const cells = Array.from(row.children);
        const skuCell = cells[skuIndex];
        const articleKey = String(
          row.dataset.openPriceArticle
          || row.dataset.openSku
          || skuCell?.querySelector('[data-open-sku]')?.dataset.openSku
          || skuCell?.querySelector('button')?.textContent
          || skuCell?.querySelector('strong')?.textContent
          || ''
        ).trim();
        if (!articleKey) return null;
        const ownerCell = ownerIndex >= 0 ? cells[ownerIndex] : null;
        const owner = ownerCell
          ? String(ownerCell.querySelector('strong')?.textContent || ownerCell.textContent || '').trim().split('\n')[0].trim()
          : '';
        const platformRaw = String(
          row.dataset.openPriceMarket
          || (platformIndex >= 0 ? cells[platformIndex]?.textContent || '' : '')
          || preset.platformKey
          || ''
        ).trim();
        const name = String(
          skuCell?.querySelector('.muted.small')?.textContent
          || cells[skuIndex + 1]?.querySelector('strong')?.textContent
          || ''
        ).trim();
        return {
          articleKey: articleKey,
          name: name,
          owner: owner,
          platformKey: modalPlatformKey(platformRaw),
          priority: preset.priority,
          type: preset.type,
          taskTitle: preset.titlePrefix + articleKey,
          nextAction: preset.nextActionPrefix + articleKey + TEXT.defaultTaskActionInWindow + preset.label + TEXT.defaultTaskActionSuffix
        };
      }).filter(Boolean);
    });
  }

  function issueTaskRows(modal, preset) {
    return Array.from(modal.querySelectorAll('.portal-exec-issue-row')).map(function (row) {
      const articleKey = String(row.querySelector('.muted.small')?.textContent || '').trim();
      if (!articleKey) return null;
      const name = String(row.querySelector('strong')?.textContent || '').trim();
      const owner = String(row.querySelector('.portal-exec-chip-stack .chip')?.textContent || '').trim();
      const reason = String(row.querySelector('p')?.textContent || '').trim();
      const rowPlatform = modalPlatformKey(reason + ' ' + preset.platformKey + ' ' + preset.label);
      return {
        articleKey: articleKey,
        name: name,
        owner: owner,
        platformKey: rowPlatform,
        priority: /10|9|8|\u043e\u0442\u0440\u0438\u0446|\u043c\u0430\u0440\u0436/.test(reason.toLowerCase()) ? 'critical' : preset.priority,
        type: preset.type,
        taskTitle: preset.titlePrefix + articleKey,
        nextAction: reason || (preset.nextActionPrefix + articleKey + TEXT.defaultTaskActionInWindow + preset.label + TEXT.defaultTaskActionSuffix)
      };
    }).filter(Boolean);
  }

  function uniqueTaskRows(rows) {
    const seen = new Set();
    return rows.filter(function (row) {
      if (!row || seen.has(row.articleKey)) return false;
      seen.add(row.articleKey);
      return true;
    });
  }

  function appendIssueTaskButtons(modal) {
    modal.querySelectorAll('.portal-exec-issue-row').forEach(function (row) {
      if (row.querySelector('[data-portal-task-pick]')) return;
      const articleKey = String(row.querySelector('.muted.small')?.textContent || '').trim();
      const paragraph = row.querySelector('p');
      if (!articleKey || !paragraph) return;
      paragraph.insertAdjacentHTML(
        'afterend',
        `<button type="button" class="quick-chip" data-portal-task-pick="${esc(articleKey)}">${esc(TEXT.pickTask)}</button>`
      );
    });
  }

  function enhanceDashboardModalTasks() {
    const modal = document.querySelector('body > .portal-exec-modal');
    if (!modal) return;
    const body = modal.querySelector('#portalDashboardExecutiveModalBody') || modal.querySelector('.portal-exec-modal-card');
    if (!body) return;
    const preset = modalTaskPreset(modalTitleText(modal));
    const signature = [
      preset.label,
      modal.querySelectorAll('table tbody tr').length,
      modal.querySelectorAll('.portal-exec-issue-row').length
    ].join('|');
    if (modal.dataset.portalTaskSignature === signature && modal.querySelector('[data-portal-task-form]')) return;
    modal.querySelector('.portal-exec-task-panel')?.remove();
    modal.querySelectorAll('[data-portal-task-pick]').forEach(function (button) { button.remove(); });
    appendIssueTaskButtons(modal);
    const taskRows = uniqueTaskRows([
      ...issueTaskRows(modal, preset),
      ...tableTaskRows(modal, preset)
    ]);
    if (!taskRows.length) return;
    const detail = {
      title: preset.label,
      taskRows: taskRows,
      taskPreset: {
        label: preset.label,
        platformKey: preset.platformKey,
        priority: preset.priority,
        type: preset.type
      }
    };
    body.insertAdjacentHTML('beforeend', renderModalTaskPanel(detail));
    bindModalTaskPanel(modal, detail);
    modal.dataset.portalTaskSignature = signature;
  }

  function observeDashboardModals() {
    if (document.body?.dataset.portalTaskModalObserverBound === '1') return;
    if (document.body) document.body.dataset.portalTaskModalObserverBound = '1';
    const observer = new MutationObserver(function () {
      window.requestAnimationFrame(enhanceDashboardModalTasks);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    [0, 200, 800].forEach(function (delay) {
      window.setTimeout(enhanceDashboardModalTasks, delay);
    });
  }

  function wrapDetailBuilder(name, enhancer) {
    if (typeof window[name] !== 'function' || window[name].__portalModalTaskWrapped) return false;
    const original = window[name];
    const wrapped = function () {
      const detail = original.apply(this, arguments);
      return enhancer(detail, Array.from(arguments));
    };
    wrapped.__portalModalTaskWrapped = true;
    window[name] = wrapped;
    return true;
  }

  function applyDashboardModalTaskPatch() {
    if (window[TASK_PATCH_KEY] === 'done') return true;

    if (typeof window.renderIssueRow === 'function' && !window.renderIssueRow.__portalTaskPickWrapped) {
      const renderIssueRowBase = window.renderIssueRow;
      const wrappedIssueRow = function (row) {
        const html = renderIssueRowBase.apply(this, arguments);
        const articleKey = String(row?.articleKey || row?.article || '').trim();
        if (!articleKey || /data-portal-task-pick=/.test(html)) return html;
        return html.replace(
          /<\/p>\s*<\/div>\s*$/,
          `</p><button type="button" class="quick-chip" data-portal-task-pick="${esc(articleKey)}">${esc(TEXT.pickTask)}</button></div>`
        );
      };
      wrappedIssueRow.__portalTaskPickWrapped = true;
      window.renderIssueRow = wrappedIssueRow;
    }

    ensureTaskComposerStyles();

    wrapDetailBuilder('buildPlatformDetail', function (detail, args) {
      if (!detail) return detail;
      const metric = args[0] || {};
      const mode = args[2];
      const taskRows = Array.isArray(metric?.issues?.rows)
        ? metric.issues.rows.slice(0, 12).map(function (row) {
          return { ...row, articleKey: row.article, platformKey: metric?.key || 'all' };
        })
        : [];
      return {
        ...detail,
        taskRows: taskRows,
        taskPreset: {
          label: detail?.title || `${metric?.label || '\u041f\u043b\u043e\u0449\u0430\u0434\u043a\u0430'} \u00b7 \u0440\u0438\u0441\u043a\u0438 \u043f\u0435\u0440\u0438\u043e\u0434\u0430`,
          priority: mode === 'issues' ? 'critical' : 'high',
          platformKey: metric?.key || 'all',
          type: 'price_margin'
        }
      };
    });

    wrapDetailBuilder('buildCompletionDetail', function (detail, args) {
      if (!detail || typeof window.articleRowsForPlatform !== 'function') return detail;
      const metric = args[0] || {};
      const executive = args[1] || {};
      const taskRows = window.articleRowsForPlatform(metric.key, executive.range)
        .sort(function (left, right) {
          return numberOrZero(left.completionPct) - numberOrZero(right.completionPct)
            || numberOrZero(right.planUnitsSelected) - numberOrZero(left.planUnitsSelected)
            || numberOrZero(right.salesValue) - numberOrZero(left.salesValue);
        })
        .slice(0, 18);
      return {
        ...detail,
        taskRows: taskRows,
        taskPreset: {
          label: detail?.title || `${metric?.label || '\u041f\u043b\u0430\u043d'} \u00b7 \u043f\u043b\u0430\u043d-\u0444\u0430\u043a\u0442`,
          priority: 'high',
          platformKey: metric?.key || 'all',
          type: 'assignment'
        }
      };
    });

    wrapDetailBuilder('buildPriceDetail', function (detail, args) {
      if (!detail || typeof window.articleRowsForPlatform !== 'function') return detail;
      const metric = args[0] || {};
      const executive = args[1] || {};
      const taskRows = window.articleRowsForPlatform(metric.key, executive.range)
        .map(function (row) {
          return {
            ...row,
            deltaPct: row.startPrice > 0 && row.endPrice > 0 ? (row.endPrice - row.startPrice) / row.startPrice : null
          };
        })
        .sort(function (left, right) {
          return Math.abs(numberOrZero(right.deltaPct)) - Math.abs(numberOrZero(left.deltaPct))
            || numberOrZero(right.avgPrice) - numberOrZero(left.avgPrice);
        })
        .slice(0, 18);
      return {
        ...detail,
        taskRows: taskRows,
        taskPreset: {
          label: detail?.title || `${metric?.label || '\u0426\u0435\u043d\u0430'} \u00b7 \u0446\u0435\u043d\u0430`,
          priority: 'high',
          platformKey: metric?.key || 'all',
          type: 'price_margin'
        }
      };
    });

    wrapDetailBuilder('buildRevenueDetail', function (detail, args) {
      if (!detail || typeof window.articleRowsForPlatform !== 'function') return detail;
      const metric = args[0] || {};
      const executive = args[1] || {};
      const taskRows = window.articleRowsForPlatform(metric.key, executive.range)
        .sort(function (left, right) {
          return numberOrZero(right.salesValue) - numberOrZero(left.salesValue)
            || numberOrZero(right.actualUnitsSelected) - numberOrZero(left.actualUnitsSelected);
        })
        .slice(0, 18);
      return {
        ...detail,
        taskRows: taskRows,
        taskPreset: {
          label: detail?.title || `${metric?.label || '\u041e\u0431\u043e\u0440\u043e\u0442'} \u00b7 \u043e\u0431\u043e\u0440\u043e\u0442`,
          priority: 'high',
          platformKey: metric?.key || 'all',
          type: 'assignment'
        }
      };
    });

    wrapDetailBuilder('buildMarginDetail', function (detail, args) {
      if (!detail || typeof window.marginRowsForPlatform !== 'function') return detail;
      const metric = args[0] || {};
      const taskRows = window.marginRowsForPlatform(metric.key)
        .sort(function (left, right) {
          return numberOrZero(left.marginPct) - numberOrZero(right.marginPct)
            || numberOrZero(right.stock) - numberOrZero(left.stock);
        })
        .slice(0, 18);
      return {
        ...detail,
        taskRows: taskRows,
        taskPreset: {
          label: detail?.title || `${metric?.label || '\u041c\u0430\u0440\u0436\u0430'} \u00b7 \u043c\u0430\u0440\u0436\u0430`,
          priority: 'critical',
          platformKey: metric?.key || 'all',
          type: 'price_margin'
        }
      };
    });

    wrapDetailBuilder('buildStockDetail', function (detail, args) {
      if (!detail || typeof window.articleRowsForPlatform !== 'function') return detail;
      const platformKey = args[0];
      const executive = args[1] || {};
      const taskRows = window.articleRowsForPlatform(platformKey, executive.range)
        .sort(function (left, right) {
          return numberOrZero(right.avgTurnoverDays) - numberOrZero(left.avgTurnoverDays)
            || numberOrZero(right.stock) - numberOrZero(left.stock);
        })
        .slice(0, 18);
      return {
        ...detail,
        taskRows: taskRows,
        taskPreset: {
          label: detail?.title || '\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c \u0438 \u0437\u0430\u043f\u0430\u0441',
          priority: 'high',
          platformKey: platformKey || 'all',
          type: 'supply'
        }
      };
    });

    if (typeof window.openModal === 'function' && !window.openModal.__portalTaskComposerWrapped) {
      const openModalBase = window.openModal;
      const wrappedOpenModal = function (detail) {
        ensureTaskComposerStyles();
        const enhanced = withModalTaskPanel(detail);
        const result = openModalBase.call(this, enhanced);
        const modal = typeof window.ensureModal === 'function'
          ? window.ensureModal()
          : document.querySelector('body > .portal-exec-modal');
        if (modal) bindModalTaskPanel(modal, enhanced);
        return result;
      };
      wrappedOpenModal.__portalTaskComposerWrapped = true;
      window.openModal = wrappedOpenModal;
    }

    if (window.openModal && window.openModal.__portalTaskComposerWrapped) {
      window[TASK_PATCH_KEY] = 'done';
      return true;
    }
    return false;
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
    [600].forEach(function (delay) {
      window.setTimeout(attach, delay);
    });
  }

  function start() {
    bindOpeners();
    observeDashboard();
    observeDashboardModals();
    applyDashboardModalTaskPatch();
    [0, 220].forEach(function (delay) {
      window.setTimeout(applyTaskSection, delay);
    });
    [0, 300].forEach(function (delay) {
      window.setTimeout(applyDashboardModalTaskPatch, delay);
      window.setTimeout(enhanceDashboardModalTasks, delay);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.setTimeout(start, 80);
    }, { once: true });
  } else {
    window.setTimeout(start, 80);
  }
})();
