(function () {
  'use strict';

  if (window.__ALTEA_WORKSPACES_GTD_V1__) return;
  window.__ALTEA_WORKSPACES_GTD_V1__ = true;

  const VERSION = '20260622-workspaces-gtd-v1';
  const ROOT_SELECTOR = '[data-workspaces-gtd-v1]';
  const ROUTES = {
    control: {
      rootId: 'view-control',
      index: '01',
      title: 'Задачи',
      kicker: 'команда -> срок -> следующий шаг',
      question: 'Сначала общий контур исполнения, затем канбан и конкретная карточка задачи.',
      status: 'Канбан и очереди берутся из текущей базы задач',
      detail: '[data-task-kanban-v1], .task-kanban-v1, .kanban-board, .task-board, .control-kanban, table, .sku-plan-fact-card'
    },
    'data-health': {
      rootId: 'view-data-health',
      index: '02',
      title: 'Календарь',
      kicker: 'период -> событие -> задача',
      question: 'Промо, регулярные события и дедлайны задач остаются в родном календарном контуре.',
      status: 'События и задачи синхронизируются через текущий state',
      detail: '.calendar, .event-calendar, [data-calendar], .promo-calendar, table, .sku-plan-fact-card'
    },
    prices: {
      rootId: 'view-prices',
      index: '03',
      title: 'Цены',
      kicker: 'средний чек -> причина -> SKU',
      question: 'Общий ценовой сигнал сверху, рабочая таблица SKU и фильтры остаются ниже.',
      status: 'Данные берутся из текущей витрины цен',
      detail: '.price-workbench-table, .price-workbench, table, .sku-plan-fact-card, .sku-plan-fact-row'
    },
    repricer: {
      rootId: 'view-repricer',
      index: '04',
      title: 'Репрайсер',
      kicker: 'готовность -> решение -> аудит',
      question: 'Новый слой заменяет старый repricer GTD-root, но не трогает native guard, MIN/MAX и экспорт.',
      status: 'Старый repricer overlay удаляется перед mount',
      detail: '.repricer-card, .repricer-table, table, .sku-plan-fact-card, .sku-plan-fact-row'
    },
    'wb-rating': {
      rootId: 'view-wb-rating',
      index: '05',
      title: 'Рейтинг карточек',
      kicker: 'сигнал -> карточка -> действие',
      question: 'Сводка сверху ведет в текущую таблицу отзывов, вопросов, негатива и рейтинга.',
      status: 'Рабочая таблица рейтинга остается native',
      detail: '.rating-work-table, .rating-structured-shell, .rating-work-card, table, .sku-plan-fact-row'
    }
  };

  const moneyFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const intFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const pctFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

  function qs(selector, root = document) {
    return root ? root.querySelector(selector) : null;
  }

  function qsa(selector, root = document) {
    return root ? Array.from(root.querySelectorAll(selector)) : [];
  }

  function appState() {
    try {
      if (window.state && typeof window.state === 'object') return window.state;
    } catch (_) {}
    return {};
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function fmtInt(value) {
    return intFmt.format(Math.round(num(value)));
  }

  function fmtMoney(value) {
    return `${moneyFmt.format(Math.round(num(value)))} ₽`;
  }

  function fmtPct(value) {
    const parsed = num(value);
    return `${pctFmt.format(Math.abs(parsed) <= 3 && parsed !== 0 ? parsed * 100 : parsed)}%`;
  }

  function ratio(part, total) {
    const den = num(total);
    if (!den) return 0;
    return Math.max(0, Math.min(1, num(part) / den));
  }

  function activeRoute() {
    const stateRoute = appState().activeView;
    if (stateRoute && ROUTES[stateRoute]) return stateRoute;
    const active = qs('.view.active[id^="view-"]');
    const domRoute = active?.id?.replace(/^view-/, '');
    if (domRoute && ROUTES[domRoute]) return domRoute;
    const hashRoute = String(window.location.hash || '').replace(/^#/, '').split('?')[0];
    return ROUTES[hashRoute] ? hashRoute : null;
  }

  function viewFor(route) {
    const config = ROUTES[route];
    return config ? document.getElementById(config.rootId) : null;
  }

  function isVisible(element) {
    if (!element || element.closest(ROOT_SELECTOR)) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function uniqueVisible(nodes) {
    const seen = new Set();
    return nodes.filter((node) => {
      if (!node || seen.has(node)) return false;
      seen.add(node);
      return isVisible(node);
    });
  }

  function visibleRows(view) {
    return uniqueVisible(qsa('tbody tr, .sku-plan-fact-row, .repricer-card, .rating-work-row, .task-card, [data-task-id]', view));
  }

  function textIncludes(element, words) {
    const text = String(element?.textContent || '').toLowerCase();
    return words.some((word) => text.includes(word));
  }

  function parseDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
    const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (ru) return new Date(`${ru[3]}-${ru[2]}-${ru[1]}T00:00:00`);
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function isTaskDone(task) {
    const status = String(task?.status || task?.stage || task?.column || '').toLowerCase();
    return ['done', 'closed', 'complete', 'ready', 'archive', 'готов', 'закрыт', 'заверш', 'отмен'].some((word) => status.includes(word));
  }

  function taskOwner(task) {
    return task?.owner || task?.assignee || task?.responsible || task?.lead || task?.manager || '';
  }

  function taskDue(task) {
    return task?.due || task?.deadline || task?.date || task?.targetDate || '';
  }

  function getTasks() {
    try {
      if (typeof window.getAllTasks === 'function') {
        const tasks = window.getAllTasks();
        if (Array.isArray(tasks)) return tasks.filter(Boolean);
      }
    } catch (error) {
      console.warn('[workspaces-gtd-v1] getAllTasks failed', error);
    }
    const stored = appState().storage?.tasks;
    return Array.isArray(stored) ? stored.filter(Boolean) : [];
  }

  function getCalendarEvents() {
    const state = appState();
    const sources = [
      state.storage?.promoEvents,
      state.promoEvents,
      window.__ALTEA_PROMO_CALENDAR_STATE__?.events,
      window.__ALTEA_PROMO_CALENDAR_STATE__?.items
    ];
    for (const source of sources) {
      if (Array.isArray(source)) return source.filter(Boolean);
    }
    return [];
  }

  function countBy(items, getter, limit = 6) {
    const map = new Map();
    items.forEach((item) => {
      const key = String(getter(item) || '').trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ru'))
      .slice(0, limit)
      .map(([label, value]) => ({ label, value }));
  }

  function platformLabel(value) {
    const key = String(value || '').toLowerCase();
    if (!key || key === 'all') return 'Все';
    if (key.includes('wb') || key.includes('wildberries')) return 'WB';
    if (key.includes('ozon')) return 'Ozon';
    if (key.includes('ym') || key.includes('ya') || key.includes('янд')) return 'Я.Маркет';
    if (key.includes('letu') || key.includes('лэту')) return 'Лэтуаль';
    if (key.includes('magnit') || key.includes('магнит')) return 'Магнит';
    return value;
  }

  function platformTone(value) {
    const key = String(value || '').toLowerCase();
    if (key.includes('wb') || key.includes('wildberries')) return '#b86cff';
    if (key.includes('ozon')) return '#70a7ed';
    if (key.includes('ym') || key.includes('ya') || key.includes('янд')) return '#e5bf5b';
    if (key.includes('letu') || key.includes('лэту')) return '#d96aa9';
    if (key.includes('magnit') || key.includes('магнит')) return '#e7786b';
    return '#dbc7a3';
  }

  function cardHtml(card) {
    const progress = Math.max(0, Math.min(100, num(card.progress) * 100));
    const attrs = [
      `style="--wgtd-card-accent:${escapeHtml(card.tone || '#dbc7a3')}"`,
      card.action ? `data-workspaces-action="${escapeHtml(card.action)}"` : '',
      card.valueKey ? `data-workspaces-value="${escapeHtml(card.valueKey)}"` : '',
      card.routeMode ? `data-workspaces-mode="${escapeHtml(card.routeMode)}"` : ''
    ].filter(Boolean).join(' ');
    return `
      <button class="workspace-gtd-v1__card" type="button" ${attrs}>
        <small>${escapeHtml(card.label)}</small>
        <strong>${escapeHtml(card.value)}</strong>
        <span>${escapeHtml(card.hint || '')}</span>
        <div class="workspace-gtd-v1__bar" aria-hidden="true"><i style="--wgtd-progress:${progress.toFixed(2)}"></i></div>
      </button>
    `;
  }

  function segmentHtml(segment) {
    const attrs = [
      segment.action ? `data-workspaces-action="${escapeHtml(segment.action)}"` : '',
      segment.valueKey ? `data-workspaces-value="${escapeHtml(segment.valueKey)}"` : ''
    ].filter(Boolean).join(' ');
    return `
      <button class="workspace-gtd-v1__segment" type="button" ${attrs}>
        <small>${escapeHtml(segment.label)}</small>
        <strong>${escapeHtml(segment.value)}</strong>
        <span>${escapeHtml(segment.hint || '')}</span>
      </button>
    `;
  }

  function actionHtml(action) {
    const attrs = [
      `data-workspaces-action="${escapeHtml(action.action)}"`,
      action.valueKey ? `data-workspaces-value="${escapeHtml(action.valueKey)}"` : '',
      action.routeMode ? `data-workspaces-mode="${escapeHtml(action.routeMode)}"` : ''
    ].filter(Boolean).join(' ');
    return `<button class="workspace-gtd-v1__action ${action.primary ? 'primary' : ''}" type="button" ${attrs}>${escapeHtml(action.label)}</button>`;
  }

  function shell(route, model) {
    const config = ROUTES[route];
    const cards = model.cards.map(cardHtml).join('');
    const segments = model.segments.length ? model.segments.map(segmentHtml).join('') : '<span class="workspace-gtd-v1__note">Детализация появится после загрузки native-данных.</span>';
    const actions = model.actions.map(actionHtml).join('');
    return `
      <div class="workspace-gtd-v1__frame">
        <div class="workspace-gtd-v1__head">
          <div>
            <p class="workspace-gtd-v1__kicker">${escapeHtml(config.index)} · ${escapeHtml(config.kicker)}</p>
            <h2 class="workspace-gtd-v1__title">${escapeHtml(model.title || config.title)}</h2>
            <p class="workspace-gtd-v1__question">${escapeHtml(model.question || config.question)}</p>
          </div>
          <div class="workspace-gtd-v1__status">${escapeHtml(model.status || config.status)}</div>
        </div>
        <div class="workspace-gtd-v1__cards">${cards}</div>
        <div class="workspace-gtd-v1__bridge">
          <div class="workspace-gtd-v1__segments">${segments}</div>
          <div>
            <div class="workspace-gtd-v1__actions">${actions}</div>
            <p class="workspace-gtd-v1__note">${escapeHtml(model.note || 'Ниже остается рабочий native-слой: таблицы, фильтры, формы и сохранение не заменяются.')}</p>
          </div>
        </div>
        <span class="workspace-gtd-v1__audit">version ${escapeHtml(VERSION)}</span>
      </div>
    `;
  }

  function baseActions(route) {
    const detailLabel = route === 'control' ? 'К канбану' : 'К рабочей таблице';
    return [
      { label: detailLabel, action: route === 'control' ? 'scroll-kanban' : 'scroll-detail', primary: true },
      { label: 'Фокус на фильтры', action: 'focus-filters' }
    ];
  }

  function buildControlModel(view) {
    const tasks = getTasks();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const active = tasks.filter((task) => !isTaskDone(task));
    const overdue = active.filter((task) => {
      const date = parseDate(taskDue(task));
      return date && date < today;
    });
    const noOwner = active.filter((task) => !String(taskOwner(task)).trim());
    const approval = active.filter((task) => String(task.status || task.stage || '').toLowerCase().includes('approval') || String(task.status || task.stage || '').toLowerCase().includes('соглас'));
    const rows = visibleRows(view);
    const total = tasks.length || rows.length;
    return {
      cards: [
        { label: 'В работе', value: fmtInt(active.length || rows.length), hint: 'не закрытые задачи', progress: ratio(active.length || rows.length, Math.max(total, 1)), tone: '#70a7ed', action: 'scroll-kanban' },
        { label: 'Просрочено', value: fmtInt(overdue.length), hint: 'нужен следующий шаг', progress: ratio(overdue.length, Math.max(active.length, 1)), tone: '#e7786b', action: 'scroll-kanban' },
        { label: 'Без owner', value: fmtInt(noOwner.length), hint: 'не назначен ответственный', progress: ratio(noOwner.length, Math.max(active.length, 1)), tone: '#e5bf5b', action: 'focus-filters' },
        { label: 'На согласовании', value: fmtInt(approval.length), hint: 'ожидают решения', progress: ratio(approval.length, Math.max(active.length, 1)), tone: '#c7a8d2', action: 'scroll-kanban' }
      ],
      segments: countBy(active, taskOwner).map((item) => ({ label: item.label, value: fmtInt(item.value), hint: 'задач', action: 'set-owner', valueKey: item.label })),
      actions: [
        { label: 'К канбану', action: 'scroll-kanban', primary: true },
        { label: 'Поставить задачу', action: 'create-task' },
        { label: 'Очистить фокус', action: 'focus-filters' }
      ],
      note: 'Канбан, drag/drop, владельцы, сроки и сохранение остаются в текущей задачной системе.'
    };
  }

  function buildCalendarModel(view) {
    const events = getCalendarEvents();
    const tasks = getTasks();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    const promo = events.filter((event) => String(event.kind || event.type || '').toLowerCase().includes('promo') || String(event.category || '').toLowerCase().includes('акц'));
    const regular = events.filter((event) => !promo.includes(event));
    const dueTasks = tasks.filter((task) => {
      const date = parseDate(taskDue(task));
      return date && date >= now && date <= weekEnd && !isTaskDone(task);
    });
    const rows = visibleRows(view);
    const total = events.length || rows.length;
    return {
      cards: [
        { label: 'События', value: fmtInt(total), hint: 'в текущем календаре', progress: total ? 1 : 0, tone: '#c59ad8', action: 'scroll-detail' },
        { label: 'Промо', value: fmtInt(promo.length), hint: 'акции и маркетинг', progress: ratio(promo.length, Math.max(total, 1)), tone: '#e5bf5b', action: 'calendar-kind', valueKey: 'promo' },
        { label: 'Регулярные', value: fmtInt(regular.length), hint: 'события команды', progress: ratio(regular.length, Math.max(total, 1)), tone: '#70a7ed', action: 'calendar-kind', valueKey: 'regular' },
        { label: 'Дедлайны 7 дней', value: fmtInt(dueTasks.length), hint: 'из задач', progress: ratio(dueTasks.length, Math.max(tasks.length, 1)), tone: '#e7786b', action: 'scroll-detail' }
      ],
      segments: countBy(events, (event) => event.platform || event.marketplace || event.owner || event.category).map((item) => ({
        label: platformLabel(item.label),
        value: fmtInt(item.value),
        hint: 'событий',
        action: 'scroll-detail',
        valueKey: item.label
      })),
      actions: [
        { label: 'К календарю', action: 'scroll-detail', primary: true },
        { label: 'Создать событие', action: 'create-calendar' },
        { label: 'Синхронизировать задачи', action: 'sync-calendar-tasks' }
      ],
      note: 'Календарь не заводит вторую базу: события и дедлайны читаются из текущего хранилища портала.'
    };
  }

  function buildPricesModel(view) {
    const state = appState();
    const rows = visibleRows(view);
    const tables = qsa('table, [role="table"]', view).filter(isVisible);
    const filters = qsa('input, select, [data-price-filter], [data-table-filter]', view).filter(isVisible);
    const selected = state.priceWorkbench?.selectedKey || state.priceWorkbench?.filters?.market || '';
    const platformSegments = countBy(rows, (row) => {
      const text = String(row.textContent || '');
      if (/ozon/i.test(text)) return 'Ozon';
      if (/wb|wildberries/i.test(text)) return 'WB';
      if (/маркет|янд/i.test(text)) return 'Я.Маркет';
      if (/лэту/i.test(text)) return 'Лэтуаль';
      if (/магнит/i.test(text)) return 'Магнит';
      return '';
    });
    return {
      cards: [
        { label: 'Строки SKU', value: fmtInt(rows.length), hint: 'видимый рабочий срез', progress: rows.length ? 1 : 0, tone: '#dbc7a3', action: 'scroll-detail' },
        { label: 'Таблицы', value: fmtInt(tables.length), hint: 'native-блоки детализации', progress: tables.length ? 1 : 0, tone: '#70a7ed', action: 'scroll-detail' },
        { label: 'Фильтры', value: fmtInt(filters.length), hint: 'поиск, статус, площадка', progress: filters.length ? 1 : 0, tone: '#c7a8d2', action: 'focus-filters' },
        { label: 'Текущий фокус', value: selected ? String(selected) : 'Все', hint: 'из state.priceWorkbench', progress: selected ? 1 : 0.55, tone: '#e5bf5b', action: 'focus-filters' }
      ],
      segments: platformSegments.map((item) => ({ label: platformLabel(item.label), value: fmtInt(item.value), hint: 'строк', action: 'set-marketplace', valueKey: item.label })),
      actions: baseActions('prices'),
      note: 'Общие графики и LFL ведут к полной артикульной таблице; формулы цен не меняются.'
    };
  }

  function repricerRows() {
    try {
      if (typeof window.buildRepricerRows === 'function') {
        const rows = window.buildRepricerRows();
        return Array.isArray(rows) ? rows : [];
      }
    } catch (error) {
      console.warn('[workspaces-gtd-v1] buildRepricerRows failed', error);
    }
    return [];
  }

  function buildRepricerModel(view) {
    const rows = repricerRows();
    const sides = rows.flatMap((row) => [row.wb, row.ozon, row.ym, row.market].filter(Boolean));
    const nativeRows = visibleRows(view);
    const changed = rows.filter((row) => row.changed || row.hasManualOverride).length;
    const safe = sides.filter((side) => side.safeToExport || side.promoSafeToExport || side.guard === 'ok').length;
    const audit = sides.filter((side) => side.confidence === 'yellow' || side.guard === 'audit').length;
    const stop = sides.filter((side) => side.confidence === 'red' || side.criticalGate === 'BLOCK' || side.guard === 'stop').length;
    const belowMin = sides.filter((side) => side.belowMin || side.floorRaiseReady).length;
    const totalSides = sides.length || nativeRows.length || 1;
    return {
      cards: [
        { label: 'Готово к выгрузке', value: fmtPct(ratio(safe, totalSides)), hint: `${fmtInt(safe)} из ${fmtInt(totalSides)}`, progress: ratio(safe, totalSides), tone: '#74c99a', action: 'repricer-mode', routeMode: 'general' },
        { label: 'Решения', value: fmtInt(changed), hint: 'изменения и ручные решения', progress: ratio(changed, Math.max(rows.length, 1)), tone: '#e5bf5b', action: 'repricer-mode', routeMode: 'changes' },
        { label: 'Аудит', value: fmtInt(audit), hint: 'желтая зона', progress: ratio(audit, totalSides), tone: '#70a7ed', action: 'repricer-mode', routeMode: 'blocked' },
        { label: 'Стоп', value: fmtInt(stop), hint: 'красные guard-ограничения', progress: ratio(stop, totalSides), tone: '#e7786b', action: 'repricer-mode', routeMode: 'blocked' },
        { label: 'Ниже MIN', value: fmtInt(belowMin), hint: 'проверить вручную', progress: ratio(belowMin, totalSides), tone: '#c7a8d2', action: 'scroll-detail' }
      ],
      segments: countBy(sides, (side) => side.platform || side.marketplace || side.side || side.market).map((item) => ({
        label: platformLabel(item.label),
        value: fmtInt(item.value),
        hint: 'решений',
        action: 'set-marketplace',
        valueKey: item.label
      })),
      actions: [
        { label: 'К решениям', action: 'scroll-detail', primary: true },
        { label: 'Режим аудит', action: 'repricer-mode', routeMode: 'blocked' },
        { label: 'Режим изменения', action: 'repricer-mode', routeMode: 'changes' }
      ],
      note: 'Старый repricer GTD-root удален; native-репрайсер ниже остается единственным рабочим контуром.'
    };
  }

  function buildRatingModel(view) {
    const rows = visibleRows(view);
    const tableRows = uniqueVisible(qsa('tbody tr, .rating-work-row', view));
    const cards = uniqueVisible(qsa('.rating-work-card, .rating-card, .sku-plan-fact-card', view));
    const riskRows = rows.filter((row) => textIncludes(row, ['риск', 'негатив', 'без ответа', 'низк', 'красн']));
    const questionRows = rows.filter((row) => textIncludes(row, ['вопрос', 'question']));
    const filters = qsa('input, select, [data-rating-status], [data-rating-sort], [data-rating-platform]', view).filter(isVisible);
    return {
      cards: [
        { label: 'Карточки', value: fmtInt(cards.length || tableRows.length || rows.length), hint: 'в рабочем срезе', progress: rows.length ? 1 : 0, tone: '#dbc7a3', action: 'scroll-detail' },
        { label: 'Риски', value: fmtInt(riskRows.length), hint: 'негатив и без ответа', progress: ratio(riskRows.length, Math.max(rows.length, 1)), tone: '#e7786b', action: 'scroll-detail' },
        { label: 'Вопросы', value: fmtInt(questionRows.length), hint: 'очередь ответа', progress: ratio(questionRows.length, Math.max(rows.length, 1)), tone: '#70a7ed', action: 'scroll-detail' },
        { label: 'Фильтры', value: fmtInt(filters.length), hint: 'статус, сортировка, платформа', progress: filters.length ? 1 : 0, tone: '#c7a8d2', action: 'focus-filters' }
      ],
      segments: [
        { label: 'Таблица', value: fmtInt(tableRows.length), hint: 'строк', action: 'scroll-detail' },
        { label: 'Фильтры', value: fmtInt(filters.length), hint: 'контролов', action: 'focus-filters' },
        { label: 'Карточки', value: fmtInt(cards.length), hint: 'панелей', action: 'scroll-detail' }
      ],
      actions: baseActions('wb-rating'),
      note: 'Детализация рейтинга, отзывы, вопросы и сортировки остаются в текущем WB rating модуле.'
    };
  }

  function buildModel(route, view) {
    if (route === 'control') return buildControlModel(view);
    if (route === 'data-health') return buildCalendarModel(view);
    if (route === 'prices') return buildPricesModel(view);
    if (route === 'repricer') return buildRepricerModel(view);
    if (route === 'wb-rating') return buildRatingModel(view);
    return { cards: [], segments: [], actions: baseActions(route) };
  }

  function cleanupLegacy(route) {
    if (route === 'repricer') {
      qsa('#view-repricer [data-gtd-v2="repricer"]').forEach((node) => node.remove());
    }
    if (route === 'control') {
      const boards = qsa('#view-control [data-task-kanban-v1]');
      boards.slice(1).forEach((node) => node.remove());
    }
  }

  function cleanupInactive(active) {
    qsa(ROOT_SELECTOR).forEach((node) => {
      if (node.getAttribute('data-workspaces-gtd-v1') !== active) node.remove();
    });
    Object.keys(ROUTES).forEach((route) => {
      const view = viewFor(route);
      if (!view) return;
      const roots = qsa(`${ROOT_SELECTOR}[data-workspaces-gtd-v1="${route}"]`, view);
      roots.slice(1).forEach((node) => node.remove());
    });
  }

  let viewObserver = null;
  let viewObserverRoute = null;
  let viewObserverTimer = 0;

  function stopViewObserver() {
    if (viewObserver) viewObserver.disconnect();
    viewObserver = null;
    viewObserverRoute = null;
    if (viewObserverTimer) window.clearTimeout(viewObserverTimer);
    viewObserverTimer = 0;
  }

  function watchActiveView(route, view) {
    if (!route || !view || viewObserverRoute === route) return;
    stopViewObserver();
    if (typeof MutationObserver !== 'function') return;
    viewObserverRoute = route;
    viewObserver = new MutationObserver(() => {
      const stillActive = activeRoute() === route;
      if (!stillActive) {
        stopViewObserver();
        return;
      }
      const missingRoot = !qs(`${ROOT_SELECTOR}[data-workspaces-gtd-v1="${route}"]`, view);
      const legacyRepricer = route === 'repricer' && !!qs('[data-gtd-v2="repricer"]', view);
      const duplicateRoots = qsa(`${ROOT_SELECTOR}[data-workspaces-gtd-v1="${route}"]`, view).length > 1;
      if (missingRoot || legacyRepricer || duplicateRoots) scheduleRender();
    });
    viewObserver.observe(view, { childList: true, subtree: true });
    viewObserverTimer = window.setTimeout(() => {
      if (viewObserverRoute === route) stopViewObserver();
    }, 22000);
  }

  function mount(route, view, html) {
    cleanupLegacy(route);
    let root = qs(`${ROOT_SELECTOR}[data-workspaces-gtd-v1="${route}"]`, view);
    if (!root) {
      root = document.createElement('section');
      root.className = 'workspace-gtd-v1';
      root.setAttribute('data-workspaces-gtd-v1', route);
      view.prepend(root);
    } else if (root.parentElement !== view || root.previousElementSibling) {
      view.prepend(root);
    }
    root.setAttribute('data-version', VERSION);
    root.innerHTML = html;
    bindRoot(root, route);
    cleanupLegacy(route);
  }

  function renderActive() {
    const route = activeRoute();
    cleanupInactive(route);
    if (!route || !ROUTES[route]) return;
    const view = viewFor(route);
    if (!view) return;
    watchActiveView(route, view);
    const model = buildModel(route, view);
    mount(route, view, shell(route, model));
  }

  let renderToken = 0;
  function scheduleRender() {
    const token = ++renderToken;
    window.setTimeout(() => {
      if (token === renderToken) renderActive();
    }, 0);
  }

  function focusElement(element) {
    if (!element) return false;
    element.setAttribute('data-workspaces-gtd-focused', 'true');
    element.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    window.setTimeout(() => element.removeAttribute('data-workspaces-gtd-focused'), 1800);
    return true;
  }

  function scrollToDetail(route) {
    const view = viewFor(route);
    const selector = ROUTES[route]?.detail;
    const target = selector ? qsa(selector, view).find(isVisible) : null;
    return focusElement(target || view);
  }

  function focusFilters(route) {
    const view = viewFor(route);
    const target = qsa('input, select, [data-table-filter], [data-rating-status], [data-rating-sort], [data-price-filter]', view).find(isVisible);
    return focusElement(target || view);
  }

  function clickButtonByText(view, words) {
    const button = qsa('button, [role="button"]', view).find((node) => {
      const text = String(node.textContent || '').toLowerCase();
      return words.some((word) => text.includes(word));
    });
    if (!button) return false;
    button.click();
    return true;
  }

  function setSelectByText(view, value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    const select = qsa('select', view).find((item) => qsa('option', item).some((option) => String(option.textContent || option.value || '').trim().toLowerCase() === normalized));
    if (!select) return false;
    const option = qsa('option', select).find((item) => String(item.textContent || item.value || '').trim().toLowerCase() === normalized);
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setGlobalMarketplace(value) {
    const raw = String(value || 'all').toLowerCase();
    let platform = raw;
    if (raw.includes('wb') || raw.includes('wildberries')) platform = 'wb';
    else if (raw.includes('ozon')) platform = 'ozon';
    else if (raw.includes('ym') || raw.includes('янд') || raw.includes('маркет')) platform = 'ym';
    else if (raw.includes('letu') || raw.includes('лэту')) platform = 'letu';
    else if (raw.includes('magnit') || raw.includes('магнит')) platform = 'magnit';
    try { localStorage.setItem('altea.portal.marketplace', platform); } catch (_) {}
    document.documentElement.dataset.marketplace = platform;
    if (document.body) document.body.dataset.marketplace = platform;
    window.dispatchEvent(new CustomEvent('altea:marketplacechange', { detail: { platform } }));
    scheduleRender();
  }

  function setRepricerMode(mode) {
    const state = appState();
    if (state.repricerFilters) state.repricerFilters.mode = mode || 'all';
    if (typeof window.renderRepricer === 'function') {
      try { window.renderRepricer(); } catch (error) { console.warn('[workspaces-gtd-v1] renderRepricer failed', error); }
    }
    scheduleRender();
  }

  function bindRoot(root, route) {
    if (root.__workspacesGtdV1Bound) return;
    root.__workspacesGtdV1Bound = true;
    root.addEventListener('click', (event) => {
      const control = event.target.closest('[data-workspaces-action]');
      if (!control || !root.contains(control)) return;
      const action = control.getAttribute('data-workspaces-action');
      const value = control.getAttribute('data-workspaces-value');
      const mode = control.getAttribute('data-workspaces-mode');
      const view = viewFor(route);
      if (action === 'scroll-detail' || action === 'scroll-kanban') {
        scrollToDetail(route);
      } else if (action === 'focus-filters') {
        focusFilters(route);
      } else if (action === 'create-task') {
        if (!clickButtonByText(view, ['поставить задачу', 'новая задача', 'создать задачу'])) {
          root.dispatchEvent(new CustomEvent('altea:gtd:open-task', { bubbles: true, detail: { source: 'workspaces-gtd-v1' } }));
        }
      } else if (action === 'create-calendar') {
        if (!clickButtonByText(view, ['создать', 'добавить', 'событие'])) {
          root.dispatchEvent(new CustomEvent('altea:gtd:create-calendar-item', { bubbles: true, detail: { kind: 'regular' } }));
        }
      } else if (action === 'sync-calendar-tasks') {
        window.dispatchEvent(new CustomEvent('altea:gtd:sync-calendar-tasks', { detail: { source: 'workspaces-gtd-v1' } }));
        scrollToDetail(route);
      } else if (action === 'calendar-kind') {
        root.dispatchEvent(new CustomEvent('altea:gtd:create-calendar-item', { bubbles: true, detail: { kind: value || 'promo' } }));
        scrollToDetail(route);
      } else if (action === 'set-owner') {
        if (!setSelectByText(view, value)) focusFilters(route);
      } else if (action === 'set-marketplace') {
        setGlobalMarketplace(value);
      } else if (action === 'repricer-mode') {
        setRepricerMode(mode || value || 'all');
      }
    });
  }

  function wrapRenderer(name) {
    const current = window[name];
    if (typeof current !== 'function' || current.__workspacesGtdV1Wrapped) return false;
    const wrapped = function workspacesGtdWrappedRenderer(...args) {
      const result = current.apply(this, args);
      scheduleRender();
      return result;
    };
    wrapped.__workspacesGtdV1Wrapped = true;
    try {
      Object.defineProperty(wrapped, 'name', { value: current.name || name });
    } catch (_) {}
    window[name] = wrapped;
    return true;
  }

  function wrapRenderers() {
    [
      'renderControlCenter',
      'renderPortalDataHealth',
      'renderEventCalendar',
      'renderPromoEventsCalendar',
      'renderPriceWorkbench',
      'renderRepricer',
      'renderWbCardRating',
      'renderWbCardRatingReport',
      'renderWbCardRatingStructured'
    ].forEach(wrapRenderer);
  }

  function boot() {
    wrapRenderers();
    [0, 350, 900, 1800, 4200, 9000, 16000, 23000].forEach((delay) => window.setTimeout(() => {
      wrapRenderers();
      renderActive();
    }, delay));
    ['hashchange', 'altea:viewchange', 'altea:data-ready', 'altea:app-ready', 'altea:portal-storage-updated', 'altea:marketplacechange'].forEach((eventName) => {
      window.addEventListener(eventName, scheduleRender);
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-view], a[href^="#"]')) scheduleRender();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
