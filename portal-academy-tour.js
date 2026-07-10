(function () {
  'use strict';

  if (window.__ALTEA_ACADEMY_TOUR__) return;
  window.__ALTEA_ACADEMY_TOUR__ = true;

  var VERSION = '20260710-native-tour6';
  var STORAGE_KEY = 'altea.academy.progress.v1';
  var HEAVY_DATA_NOTE = 'Данные обновляются ежедневно в 11:00 по Москве. До этого времени часть показателей может быть неполной.';
  var ACADEMY_PORTAL_TARGETS = {
    shell: '.app-shell',
    sidebar: '.sidebar',
    main: '.main',
    topbar: '.topbar',
    syncStatus: '#syncStatusBadge',
    pullRemote: '#pullRemoteBtn',
    pushRemote: '#pushRemoteBtn',
    navButton: function (view) { return '.nav-btn[data-view="' + cssEscape(view) + '"]'; },
    premiumNavButton: function (view) { return '[data-premium-nav="' + cssEscape(view) + '"]'; },
    viewSection: function (view) { return '#view-' + cssEscape(view); }
  };

  var DATA_HEAVY_VIEWS = {
    dashboard: true,
    'data-health': true,
    executive: true,
    'sku-plan-fact': true,
    repricer: true,
    prices: true,
    order: true,
    'oos-control': true,
    'sku-contour': true,
    launches: true,
    'iu-drr': true,
    'wb-rating': true,
    'product-leaderboard': true
  };

  var VIEW_GUIDES = {
    dashboard: {
      title: 'Дашборд',
      summary: 'Общий бизнес-пульс: выручка, маржа, заказы, риски и сигналы по площадкам.',
      watch: ['Сначала смотрим динамику и отклонения от плана.', 'Красные сигналы открываем как задачи, а не держим в голове.'],
      actions: ['Проверьте период, площадку и источник данных.', 'Откройте связанный раздел, если нужен разбор SKU или задачи.'],
      avoid: ['Не принимайте решение по одному KPI без проверки источника и даты обновления.'],
      workflow: 'Открыть дашборд -> выбрать площадку -> найти отклонение -> перейти в профильный раздел -> зафиксировать действие.'
    },
    'data-health': {
      title: 'Календарь и здоровье данных',
      summary: 'Здесь видны события, акции, качество обновлений и точки, где данные требуют проверки.',
      watch: ['Дата последнего обновления.', 'Акции и события, которые меняют спрос, маржу и цену.'],
      actions: ['Сверьте календарь перед анализом цен, заказов и рекламы.', 'Если данные неполные, сначала проверьте источник.'],
      avoid: ['Не сравнивайте периоды, если в календаре есть незакрытые акции или сбои обновления.'],
      workflow: 'Проверить дату обновления -> отметить акции -> понять, какие показатели можно считать финальными.'
    },
    control: {
      title: 'Задачи',
      summary: 'Операционный центр: кто отвечает, что нужно сделать, какой следующий шаг и срок.',
      watch: ['Владелец, статус, приоритет, дедлайн.', 'Автоматические задачи по рискам и ручные поручения команды.'],
      actions: ['Назначайте ответственного и следующий шаг.', 'Закрывайте задачу только после фактического результата.'],
      avoid: ['Не оставляйте задачу без owner, срока и понятного следующего действия.'],
      workflow: 'Открыть поток -> выбрать задачу -> назначить owner -> описать следующий шаг -> довести до статуса сделано.'
    },
    documents: {
      title: 'Хранилище',
      summary: 'Файлы, ссылки, инструкции и материалы, которые должны быть доступны команде.',
      watch: ['Название, группа, владелец и описание материала.', 'Связь документа с задачей или процессом.'],
      actions: ['Добавляйте ссылки и файлы в правильную группу.', 'Используйте хранилище как источник регламентов для новичков.'],
      avoid: ['Не храните важные инструкции только в чатах или личных папках.'],
      workflow: 'Найти группу -> добавить материал -> описать назначение -> использовать ссылку в задаче или обучении.'
    },
    executive: {
      title: 'Руководителю',
      summary: 'Короткий управленческий слой: риски, решения, сотрудники, план-факт и то, что требует вмешательства.',
      watch: ['Отклонения, просрочки, критичные задачи и влияние на план.', 'Какие решения блокируют результат.'],
      actions: ['Открывайте риск и переводите его в задачу или решение.', 'Смотрите контекст по сотруднику и площадке.'],
      avoid: ['Не используйте раздел как витрину: каждое отклонение должно вести к действию.'],
      workflow: 'Найти риск -> открыть детализацию -> назначить действие -> проверить следующий контрольный срок.'
    },
    'sku-plan-fact': {
      title: 'План-факт SKU',
      summary: 'Сверка плана, факта, прогноза, чеков и ДРР по SKU.',
      watch: ['Где факт ниже плана.', 'Какие SKU требуют цены, рекламы, наличия или карточки.'],
      actions: ['Фильтруйте по owner, площадке и статусу.', 'Создавайте задачи на конкретный SKU, а не на общий раздел.'],
      avoid: ['Не смешивайте причины: цена, реклама, наличие и контент разбираются отдельно.'],
      workflow: 'Выбрать площадку -> найти разрыв -> открыть SKU -> понять причину -> создать точечную задачу.'
    },
    repricer: {
      title: 'Репрайсер',
      summary: 'Инструмент работы с ценой. Смотрим текущую цену, рекомендацию, min price и риск.',
      watch: ['Текущая цена, рекомендованная цена, min price, маржа и причина рекомендации.', 'Риск ухода ниже минимально допустимой цены.'],
      actions: ['Проверяйте рекомендацию перед загрузкой.', 'Фиксируйте исключения и коридоры, если цена требует ручного решения.'],
      avoid: ['Нельзя загружать цену ниже минимальной без проверки.'],
      workflow: 'Открыть Репрайсер -> найти SKU -> сверить min price и рекомендацию -> принять или отправить на проверку.'
    },
    prices: {
      title: 'Цены',
      summary: 'Контроль цены, маржи, оборота и СПП по площадкам.',
      watch: ['Цена в портале, цена на маркетплейсе, маржа, СПП, оборот и дата обновления.', 'Разницу между источниками и промо-периодами.'],
      actions: ['Если цена в портале и на маркетплейсе отличается, сначала проверяем время обновления, источник и промо.', 'После проверки передаем изменение в Репрайсер или задачу.'],
      avoid: ['Не меняйте цену, пока не ясно, откуда расхождение и актуальны ли данные.'],
      workflow: 'Выбрать площадку -> найти SKU -> проверить цену и СПП -> сверить дату -> принять действие по цене.'
    },
    order: {
      title: 'Заказ товара',
      summary: 'Планирование поставок, кластеров, складов и страхового запаса.',
      watch: ['Продажи, остатки, дни покрытия, ближайшие поставки и ограничения склада.', 'Разницу между общим спросом и спросом по площадкам.'],
      actions: ['Проверяйте расчет перед созданием поставки.', 'Учитывайте календарь акций и OOS-риски.'],
      avoid: ['Не заказывайте по среднему темпу, если впереди акция или сезонный всплеск.'],
      workflow: 'Выбрать SKU -> проверить продажи и остатки -> задать горизонт -> рассчитать поставку -> передать в работу.'
    },
    'oos-control': {
      title: 'OOS контроль',
      summary: 'Контроль пустых полок: где товара не хватает, какой ущерб и что делать первым.',
      watch: ['SKU с риском OOS, площадка, склад, потерянные продажи и срочность.', 'Связь с заказом товара и рекламой.'],
      actions: ['Создавайте задачи на пополнение и корректировку рекламы.', 'Сверяйте OOS с планом поставок.'],
      avoid: ['Не усиливайте рекламу на SKU, где нет достаточного остатка.'],
      workflow: 'Найти OOS-риск -> проверить остаток и продажи -> открыть заказ товара -> назначить пополнение.'
    },
    'sku-contour': {
      title: 'SKU workspace',
      summary: 'Рабочее место для SKU: реестр, API-контур, alias, ignore и аудит связок.',
      watch: ['Корректность артикула, alias и связки с API.', 'SKU, которые выпали из учета или требуют сопоставления.'],
      actions: ['Исправляйте alias и owner, если SKU не сходится между источниками.', 'Используйте ignore только для осознанных исключений.'],
      avoid: ['Не удаляйте проблемный SKU из анализа вместо исправления связки.'],
      workflow: 'Найти SKU -> проверить alias/API -> поправить связку -> вернуться к план-факту или цене.'
    },
    skus: {
      title: 'Реестр SKU',
      summary: 'Справочник товаров, карточек, владельцев и базовых атрибутов.',
      watch: ['Артикул, название, категория, owner и статус.', 'Заполненность карточки и связь с процессами.'],
      actions: ['Уточняйте owner и ключевые атрибуты.', 'Используйте реестр как точку входа в задачи по товару.'],
      avoid: ['Не заводите дубль SKU, если проблема в alias или источнике.'],
      workflow: 'Найти товар -> проверить owner и атрибуты -> открыть нужный рабочий раздел.'
    },
    launches: {
      title: 'Продукты / Новинки',
      summary: 'Запуск новинок: SKU, owner, площадка, план запуска, статус и чек-лист.',
      watch: ['SKU, owner, MP, план запуска, статус подготовки и задачи по запуску.', 'Где буксует цена, карточка, контент или реклама.'],
      actions: ['Добавьте или выберите новинку, заполните SKU, owner, MP и план запуска.', 'Создайте чек-лист и назначьте задачи по цене, карточке, контенту и рекламе.'],
      avoid: ['Не переводите новинку в запуск без владельца, статуса подготовки и чек-листа.'],
      workflow: 'Открыть Продукты / Новинки -> добавить или выбрать новинку -> заполнить SKU, owner, MP, план запуска -> статус Подготовка -> создать чек-лист -> назначить задачи.'
    },
    'launch-control': {
      title: 'Запуск новинок',
      summary: 'Контроль фаз запуска, чек-листов и просрочек по новинкам.',
      watch: ['Фаза запуска, дедлайны, просрочки и ответственные.', 'Какая задача тормозит вывод товара.'],
      actions: ['Переводите запуск по фазам только после готовых артефактов.', 'Фиксируйте блокеры задачами.'],
      avoid: ['Не закрывайте фазу без материалов, цены и карточки.'],
      workflow: 'Выбрать запуск -> проверить фазу -> найти просрочку -> назначить действие -> обновить статус.'
    },
    'ads-funnel': {
      title: 'Рекламная воронка',
      summary: 'Расходы, трафик, клики, заказы и ДРР по рекламным каналам.',
      watch: ['Расход, клики, конверсия, заказы, ДРР и вклад в продажи.', 'Кампании, где трафик есть, а результата нет.'],
      actions: ['Сверяйте рекламу с остатками и карточкой.', 'Перед изменением бюджета проверьте маржу и цену.'],
      avoid: ['Не увеличивайте бюджет без проверки наличия, цены и конверсии карточки.'],
      workflow: 'Выбрать канал -> найти отклонение -> проверить SKU -> принять действие по бюджету или карточке.'
    },
    'iu-drr': {
      title: 'ИУ / ДРР',
      summary: 'ИУ, ДРР, расходы и результат по WB, Ozon и другим площадкам.',
      watch: ['ДРР, расходы, заказы, выручка, динамика по периоду.', 'Расхождения между площадками.'],
      actions: ['Сначала выберите площадку и период.', 'Сравнивайте расход с план-фактом и ценой.'],
      avoid: ['Не оценивайте рекламу отдельно от маржи и остатков.'],
      workflow: 'Выбрать площадку -> проверить период -> найти перерасход -> открыть SKU или задачу.'
    },
    'wb-rating': {
      title: 'Рейтинг карточек',
      summary: 'Рейтинг, отзывы и динамика карточек WB.',
      watch: ['Карточки с падением рейтинга, свежие отзывы и связь с продажами.', 'Какие проблемы повторяются в обратной связи.'],
      actions: ['Создавайте задачи на контент, качество или карточку.', 'Сверяйте рейтинг с продажами и рекламой.'],
      avoid: ['Не игнорируйте рейтинг, если он уже влияет на конверсию.'],
      workflow: 'Найти карточку с риском -> прочитать причину -> назначить действие по карточке или продукту.'
    },
    'product-leaderboard': {
      title: 'Продуктовый лидерборд',
      summary: 'Рейтинг продуктов по результату, воронке, КЗ и ROMI.',
      watch: ['Лидеры, просадки, вклад в результат и проблемные места воронки.', 'Какие SKU требуют масштабирования или остановки.'],
      actions: ['Используйте лидерборд для приоритизации внимания.', 'Открывайте детали перед решением по бюджету или запасу.'],
      avoid: ['Не переносите подход лидера на другой SKU без проверки экономики.'],
      workflow: 'Найти лидера или просадку -> открыть детали -> проверить экономику -> назначить действие.'
    }
  };

  var QUIZ = [
    {
      id: 'repricer-min-price',
      question: 'Что обязательно проверить перед загрузкой цены из Репрайсера?',
      options: [
        { id: 'min-price', text: 'Min price, рекомендацию и риск ухода ниже минимальной цены.', correct: true },
        { id: 'name', text: 'Только название SKU и текущую цену.', correct: false },
        { id: 'speed', text: 'Только скорость загрузки страницы.', correct: false }
      ],
      explanation: 'В Репрайсере нельзя загружать цену ниже минимальной без проверки причины, маржи и риска.'
    },
    {
      id: 'prices-mismatch',
      question: 'Если цена в портале и на маркетплейсе отличается, что делаем сначала?',
      options: [
        { id: 'change-now', text: 'Сразу меняем цену вручную.', correct: false },
        { id: 'check-source', text: 'Проверяем время обновления, источник и промо.', correct: true },
        { id: 'ignore', text: 'Игнорируем, если разница небольшая.', correct: false }
      ],
      explanation: 'Разница цены может быть связана с обновлением, источником или промо, поэтому сначала нужна сверка.'
    },
    {
      id: 'launch-workflow',
      question: 'Что должно появиться у новинки на этапе подготовки?',
      options: [
        { id: 'checklist', text: 'SKU, owner, MP, план запуска, статус и чек-лист задач.', correct: true },
        { id: 'only-name', text: 'Только красивое название товара.', correct: false },
        { id: 'only-ad', text: 'Только рекламный бюджет.', correct: false }
      ],
      explanation: 'Новинка не должна буксовать без владельца, статуса подготовки и задач по цене, карточке, контенту и рекламе.'
    },
    {
      id: 'heavy-data',
      question: 'Что нужно помнить по data-heavy разделам до 11:00 по Москве?',
      options: [
        { id: 'ready', text: 'Все показатели уже финальные.', correct: false },
        { id: 'partial', text: 'Часть показателей может быть неполной до ежедневного обновления.', correct: true },
        { id: 'disabled', text: 'Разделами нельзя пользоваться весь день.', correct: false }
      ],
      explanation: HEAVY_DATA_NOTE
    }
  ];

  var runtime = {
    overlay: null,
    spotlight: null,
    card: null,
    drawerBackdrop: null,
    drawer: null,
    offer: null,
    steps: [],
    stepIndex: 0,
    mode: 'idle',
    quizAnswers: {},
    quizMessage: '',
    observer: null,
    bootAttempts: 0,
    helpScheduled: false,
    spotlightFrame: 0,
    active: false,
    offerSnoozed: false,
    stepToken: 0,
    stepTimer: 0,
    stepReady: true,
    stepReadyChecks: 0,
    stepStatus: 'ready'
  };

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value || ''));
    return String(value || '').replace(/["\\]/g, '\\$&');
  }

  function safeStorage() {
    try {
      var store = window.localStorage;
      var probe = '__altea_academy_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return store;
    } catch (_) {
      return null;
    }
  }

  function readProgress() {
    var store = safeStorage();
    if (!store) return {};
    try {
      var raw = store.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writeProgress(patch) {
    var store = safeStorage();
    if (!store) return;
    var current = readProgress();
    var next = assign(assign({}, current), patch || {});
    next.version = VERSION;
    next.updatedAt = new Date().toISOString();
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function resetProgress() {
    var store = safeStorage();
    if (!store) return;
    try {
      store.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function isAcademyComplete() {
    var progress = readProgress();
    return Boolean(progress && progress.completedAt && progress.quizPassedAt);
  }

  function isAcademyOfferSnoozed() {
    return Boolean(runtime.offerSnoozed);
  }

  function assign(target, source) {
    var output = target || {};
    var input = source || {};
    Object.keys(input).forEach(function (key) {
      output[key] = input[key];
    });
    return output;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isElementVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    var style = window.getComputedStyle ? window.getComputedStyle(element) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    var rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function firstVisible(selector) {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(selector || ''));
    return nodes.find(isElementVisible) || nodes[0] || null;
  }

  function firstVisibleOnly(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector || '')).find(isElementVisible) || null;
  }

  function portalShellElement() {
    return firstVisibleOnly('#altea-premium-app')
      || firstVisibleOnly(ACADEMY_PORTAL_TARGETS.shell)
      || firstVisible(ACADEMY_PORTAL_TARGETS.shell);
  }

  function portalTopbarElement() {
    return firstVisibleOnly('.altea-premium-shell-topbar')
      || firstVisibleOnly(ACADEMY_PORTAL_TARGETS.topbar)
      || firstVisible(ACADEMY_PORTAL_TARGETS.topbar);
  }

  function portalMainElement() {
    return firstVisibleOnly('.altea-premium-app:not([hidden]) [data-premium-content]')
      || firstVisibleOnly(ACADEMY_PORTAL_TARGETS.main)
      || firstVisible(ACADEMY_PORTAL_TARGETS.main);
  }

  function portalSyncElement() {
    return firstVisibleOnly('[data-premium-proxy="syncStatusBadge"]')
      || firstVisibleOnly(ACADEMY_PORTAL_TARGETS.syncStatus)
      || firstVisible(ACADEMY_PORTAL_TARGETS.syncStatus);
  }

  function navSelector(view) {
    return ACADEMY_PORTAL_TARGETS.navButton(view) + ',' + ACADEMY_PORTAL_TARGETS.premiumNavButton(view);
  }

  function premiumActiveRoute() {
    var shell = document.getElementById('altea-premium-app');
    if (!shell) return '';
    return String(shell.getAttribute('data-premium-active-route') || '').trim();
  }

  function activePortalView() {
    if (window.__alteaAppState && window.__alteaAppState.activeView) return normalizeView(window.__alteaAppState.activeView);
    var activeNav = document.querySelector('.nav-btn.active[data-view], [data-premium-nav].is-active, [data-premium-nav].active');
    var navView = activeNav ? (activeNav.dataset.view || activeNav.getAttribute('data-premium-nav')) : '';
    if (navView) return normalizeView(navView);
    var premium = premiumActiveRoute();
    if (premium) return normalizeView(premium);
    if (window.state && window.state.activeView) return normalizeView(window.state.activeView);
    var hash = String(window.location.hash || '').replace(/^#/, '').replace(/^view-/, '');
    return normalizeView(hash || 'dashboard');
  }

  function viewSurfaces(view) {
    view = normalizeView(view);
    var surfaces = [];
    var premiumStage = firstVisible('[data-premium-stage="' + cssEscape(view) + '"].is-active');
    var premiumContent = firstVisible('.altea-premium-app:not([hidden]) [data-premium-content]');
    var legacy = document.getElementById('view-' + view);
    if (premiumStage) surfaces.push(premiumStage);
    if (premiumContent && premiumActiveRoute() === view) surfaces.push(premiumContent);
    if (legacy) surfaces.push(legacy);
    return surfaces.filter(function (node, index, list) {
      return node && list.indexOf(node) === index;
    });
  }

  function firstReadyViewSurface(view) {
    var surfaces = viewSurfaces(view);
    return surfaces.find(function (root) { return isElementVisible(root) && contentLooksReady(root); })
      || surfaces.find(isElementVisible)
      || surfaces[0]
      || null;
  }

  function getAppState() {
    return window.__alteaAppState || window.state || {};
  }

  function isPortalReady() {
    if (!document.body || document.body.classList.contains('portal-auth-locked')) return false;
    if (document.getElementById('portalAuthScreen')) return false;
    if (!document.querySelector(ACADEMY_PORTAL_TARGETS.shell)) return false;
    if (!document.querySelector('.nav-btn[data-view]')) return false;
    var app = getAppState();
    if (app && app.boot && app.boot.dataReady !== true) return false;
    return true;
  }

  function navButtons() {
    return Array.prototype.slice.call(document.querySelectorAll('.nav-btn[data-view], [data-premium-nav]'))
      .filter(function (button) {
        var view = button.dataset.view || button.getAttribute('data-premium-nav');
        return view
          && !button.hidden
          && button.getAttribute('aria-hidden') !== 'true'
          && !button.classList.contains('nav-btn-legacy-hidden')
          && isElementVisible(button);
      });
  }

  function orderedVisibleViews() {
    var preferred = [
      'dashboard',
      'data-health',
      'control',
      'documents',
      'executive',
      'sku-plan-fact',
      'repricer',
      'prices',
      'order',
      'oos-control',
      'sku-contour',
      'skus',
      'launches',
      'launch-control',
      'ads-funnel',
      'iu-drr',
      'wb-rating',
      'product-leaderboard'
    ];
    var present = {};
    navButtons().forEach(function (button) {
      present[button.dataset.view || button.getAttribute('data-premium-nav')] = true;
    });
    var ordered = preferred.filter(function (view) { return present[view]; });
    navButtons().forEach(function (button) {
      var view = button.dataset.view || button.getAttribute('data-premium-nav');
      if (ordered.indexOf(view) < 0) ordered.push(view);
    });
    return ordered;
  }

  function navTitle(view) {
    var button = firstVisible(navSelector(view)) || document.querySelector(ACADEMY_PORTAL_TARGETS.navButton(view));
    var title = button && button.querySelector('span') ? button.querySelector('span').textContent : '';
    if (!title && button) title = button.textContent || '';
    return String(title || VIEW_GUIDES[view]?.title || view || 'Раздел').trim();
  }

  function navCaption(view) {
    var button = firstVisible(navSelector(view)) || document.querySelector(ACADEMY_PORTAL_TARGETS.navButton(view));
    var small = button && button.querySelector('small,.altea-premium-nav-caption') ? button.querySelector('small,.altea-premium-nav-caption').textContent : '';
    return String(small || '').trim();
  }

  function guideForView(view) {
    if (VIEW_GUIDES[view]) return VIEW_GUIDES[view];
    return {
      title: navTitle(view),
      summary: navCaption(view) || 'Рабочий раздел портала.',
      watch: ['Проверьте заголовок, фильтры, дату обновления и основные действия раздела.'],
      actions: ['Работайте от факта к задаче: нашли отклонение, назначили действие, сохранили результат.'],
      avoid: ['Не меняйте данные без проверки источника и ответственного.'],
      workflow: 'Открыть раздел -> проверить данные -> выбрать действие -> зафиксировать результат.'
    };
  }

  function buildTourSteps() {
    var steps = [
      {
        id: 'shell',
        target: portalShellElement,
        title: 'Академия Алтеи',
        body: 'Это обучение идет поверх настоящего портала. Мы будем подсвечивать реальные вкладки, кнопки и секции, а затем дадим мини-тест.',
        note: 'Пока Академия активна, рабочая зона заблокирована.'
      },
      {
        id: 'topbar',
        target: portalTopbarElement,
        title: 'Верхняя панель',
        body: 'Здесь видны статус синхронизации, обновление командных данных и быстрые действия. Начинаем работу с проверки состояния портала.',
        note: 'Если статус говорит об ошибке или неполных данных, сначала разбираем источник.'
      },
      {
        id: 'sync',
        target: portalSyncElement,
        title: 'Статус данных',
        body: 'Этот индикатор показывает, подключена ли командная база и есть ли ошибки интерфейса.',
        note: HEAVY_DATA_NOTE
      }
    ];

    orderedVisibleViews().forEach(function (view) {
      var guide = guideForView(view);
      steps.push({
        id: 'nav-' + view,
        view: view,
        target: navSelector(view),
        title: guide.title,
        body: guide.summary,
        note: navCaption(view) || guide.workflow
      });
      steps.push({
        id: 'section-' + view,
        view: view,
        target: ACADEMY_PORTAL_TARGETS.viewSection(view),
        title: guide.title + ': как работать',
        body: guide.workflow,
        bullets: guide.watch.concat(guide.actions).slice(0, 4),
        note: DATA_HEAVY_VIEWS[view] ? HEAVY_DATA_NOTE : guide.avoid[0]
      });
    });

    return steps;
  }

  function normalizeView(view) {
    return String(view || '').trim();
  }

  function switchToView(view) {
    view = normalizeView(view);
    if (!view) return;
    if (viewRouteIsActive(view)) return true;
    var premiumButton = firstVisibleOnly(ACADEMY_PORTAL_TARGETS.premiumNavButton(view));
    if (premiumButton && typeof premiumButton.click === 'function') {
      try {
        premiumButton.click();
        return true;
      } catch (_) {}
    }
    try {
      if (typeof window.setView === 'function') {
        var result = window.setView(view, { persist: true, syncHash: true });
        if (window.AlteaPremiumPresentation && typeof window.AlteaPremiumPresentation.scheduleRender === 'function') {
          window.AlteaPremiumPresentation.scheduleRender(0);
          window.AlteaPremiumPresentation.scheduleRender(120);
        }
        if (result && typeof result.catch === 'function') {
          result.catch(function (error) {
            if (window.console && console.warn) console.warn('[academy-tour] async setView failed', error);
          });
        }
        return result || true;
      }
    } catch (error) {
      if (window.console && console.warn) console.warn('[academy-tour] setView failed', error);
    }

    var button = document.querySelector(ACADEMY_PORTAL_TARGETS.navButton(view));
    if (!button) button = firstVisible(ACADEMY_PORTAL_TARGETS.premiumNavButton(view));
    if (button && typeof button.click === 'function') {
      try {
        button.click();
        return;
      } catch (_) {}
    }

    document.querySelectorAll('.nav-btn[data-view]').forEach(function (node) {
      node.classList.toggle('active', node.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(function (section) {
      section.classList.toggle('active', section.id === 'view-' + view);
    });
    var app = getAppState();
    if (app && typeof app === 'object') app.activeView = view;
    try {
      window.dispatchEvent(new CustomEvent('altea:viewchange', { detail: { view: view, source: 'academy-tour' } }));
    } catch (_) {}
    return true;
  }

  function currentHashView() {
    return normalizeView(String(window.location.hash || '').replace(/^#/, '').replace(/^view-/, ''));
  }

  function viewRouteIsActive(view) {
    view = normalizeView(view);
    if (!view) return true;
    var app = getAppState();
    if (app && app.activeView && normalizeView(app.activeView) !== view) return false;
    var premium = premiumActiveRoute();
    if (premium && premium !== view) return false;
    var hash = currentHashView();
    if (hash && hash !== view) return false;
    var activeNav = document.querySelector('.nav-btn.active[data-view], [data-premium-nav].is-active, [data-premium-nav].active');
    if (activeNav) {
      var activeNavView = normalizeView(activeNav.dataset.view || activeNav.getAttribute('data-premium-nav'));
      if (activeNavView && activeNavView !== view) return false;
    }
    var legacy = document.getElementById('view-' + view);
    var activeStage = firstVisibleOnly('[data-premium-stage="' + cssEscape(view) + '"].is-active');
    if (legacy && !legacy.classList.contains('active') && !isElementVisible(legacy) && !activeStage) return false;
    return activePortalView() === view;
  }

  function visibleLoadingMarker(root) {
    if (!root) return null;
    if (root.getAttribute('aria-busy') === 'true') return root;
    if (root.getAttribute('data-plan-fact-loading') === 'true') return root;
    var markers = Array.prototype.slice.call(root.querySelectorAll([
      '[aria-busy="true"]',
      '[data-plan-fact-loading="true"]',
      '[data-task-loading]',
      '[data-loading="true"]',
      '[data-loading="boot"]',
      '[data-loading="team"]',
      '.loading-card',
      '.is-loading',
      '.executive-loading-grid'
    ].join(',')));
    return markers.find(isElementVisible) || null;
  }

  function visibleLoadingCopy(root) {
    if (!root) return null;
    var candidates = Array.prototype.slice.call(root.querySelectorAll('.pw-empty,.empty,[data-loading-message]'));
    return candidates.find(function (node) {
      if (!isElementVisible(node)) return false;
      return /загружа|подгружа|собирает рабочие цифры|готовим|ожидаем|prepar|loading/i.test(String(node.textContent || ''));
    }) || null;
  }

  function readySurfaceForView(view) {
    return viewSurfaces(view).find(function (root) {
      return isElementVisible(root)
        && !visibleLoadingMarker(root)
        && !visibleLoadingCopy(root)
        && contentLooksReady(root);
    }) || null;
  }

  function lazyRequirementReady(view) {
    var requirement = '';
    try {
      if (typeof VIEW_DATA_REQUIREMENTS === 'object' && VIEW_DATA_REQUIREMENTS) {
        requirement = VIEW_DATA_REQUIREMENTS[view] || '';
      }
    } catch (_) {}
    if (!requirement) return true;
    var app = getAppState();
    return Boolean(app && app.boot && app.boot.lazyReady && app.boot.lazyReady[requirement] === true);
  }

  function stepViewIsReady(view) {
    return viewRouteIsActive(view) && lazyRequirementReady(view) && Boolean(readySurfaceForView(view));
  }

  function sectionTargetForView(view) {
    var surface = readySurfaceForView(view);
    if (!surface) return null;
    var candidates = Array.prototype.slice.call(surface.querySelectorAll('.section-title,.route-head,.portal-section-title,.control-simple-title,h1,h2'));
    return candidates.find(isElementVisible) || surface;
  }

  function targetForStep(step) {
    var target = step && step.target;
    var element = null;
    if (step && step.view && /^section-/.test(step.id || '')) {
      element = sectionTargetForView(step.view);
      if (element) return element;
    }
    if (typeof target === 'function') element = target();
    else if (typeof target === 'string') element = firstVisible(target);
    else if (target instanceof Element) element = target;
    if (element && isElementVisible(element)) return element;
    if (step && step.view) {
      if (!element) element = firstVisible(navSelector(step.view))
        || readySurfaceForView(step.view)
        || document.querySelector(ACADEMY_PORTAL_TARGETS.viewSection(step.view));
      if (element) return element;
    }
    return portalMainElement() || portalShellElement();
  }

  function createStyle() {
    if (document.getElementById('altea-academy-tour-style')) return;
    var style = document.createElement('style');
    style.id = 'altea-academy-tour-style';
    style.textContent = [
      'html.altea-academy-tour-active,body.altea-academy-tour-active{overflow:hidden!important;overscroll-behavior:none!important}',
      'html.altea-academy-tour-active .altea-premium-shell-content,html.altea-academy-tour-active .altea-premium-shell-nav,html.altea-academy-tour-active .main,html.altea-academy-tour-active .sidebar{overflow:hidden!important;overscroll-behavior:none!important;scroll-behavior:auto!important}',
      '.academy-entry-overlay{position:fixed;inset:0;z-index:2147483000;pointer-events:auto;overscroll-behavior:none;color:#f8efe0;font-family:inherit}',
      '.academy-entry-overlay *{box-sizing:border-box}',
      '.academy-spotlight-layer{position:fixed;inset:0;pointer-events:none}',
      '.academy-spotlight-hole{position:fixed;border:1px solid rgba(229,199,132,.9);border-radius:8px;box-shadow:0 0 0 9999px rgba(5,5,8,.74),0 18px 64px rgba(229,199,132,.22);transition:left .2s ease,top .2s ease,width .2s ease,height .2s ease,opacity .16s ease;opacity:1}',
      '.academy-spotlight-hole.is-hidden{opacity:0}',
      '.academy-coach-card{position:fixed;width:min(430px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;overscroll-behavior:contain;touch-action:pan-y;border:1px solid rgba(229,199,132,.34);border-radius:8px;background:linear-gradient(155deg,rgba(23,17,14,.98),rgba(10,10,13,.98));box-shadow:0 24px 90px rgba(0,0,0,.46);padding:18px;color:#f8efe0;pointer-events:auto}',
      '.academy-coach-kicker{margin:0 0 8px;color:#e5c784;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}',
      '.academy-coach-card h2,.academy-drawer h2{margin:0;color:#fff6df;font-size:22px;line-height:1.15;letter-spacing:0}',
      '.academy-coach-card p,.academy-drawer p{margin:10px 0 0;color:#d8cdbd;line-height:1.45}',
      '.academy-coach-card ul,.academy-drawer ul{margin:12px 0 0;padding-left:18px;color:#e7dac8;line-height:1.42}',
      '.academy-coach-card li+li,.academy-drawer li+li{margin-top:6px}',
      '.academy-note{margin-top:12px;padding:10px 12px;border:1px solid rgba(229,199,132,.18);border-radius:8px;background:rgba(229,199,132,.08);color:#f0dec0;font-size:13px;line-height:1.35}',
      '.academy-progress{height:6px;margin:14px 0 0;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}',
      '.academy-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#d7aa53,#f3d794);transition:width .2s ease}',
      '.academy-tour-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px}',
      '.academy-btn,.academy-help-btn,.academy-drawer-close{appearance:none;border:1px solid rgba(229,199,132,.28);border-radius:8px;background:rgba(255,255,255,.06);color:#f8efe0;font:inherit;font-weight:800;min-height:38px;padding:9px 12px;cursor:pointer}',
      '.academy-btn:hover,.academy-help-btn:hover,.academy-drawer-close:hover{border-color:rgba(229,199,132,.52);background:rgba(229,199,132,.12)}',
      '.academy-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.academy-btn-primary{background:linear-gradient(135deg,#d7aa53,#f3d794);color:#1c1409;border-color:rgba(243,215,148,.7)}',
      '.academy-btn-ghost{background:rgba(255,255,255,.035)}',
      '.academy-help-btn{display:inline-flex;align-items:center;gap:8px;margin-left:auto;min-height:32px;padding:7px 10px;font-size:13px;line-height:1.1}',
      '.academy-help-btn span{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:rgba(229,199,132,.18);color:#f3d794}',
      '.section-title .academy-help-btn,.control-simple-title .academy-help-btn{margin-left:12px}',
      '.academy-global-help{margin-left:8px;white-space:nowrap;flex:0 0 auto}',
      '.academy-global-help.is-floating{position:fixed;right:18px;bottom:86px;z-index:2147482300;margin-left:0;box-shadow:0 16px 44px rgba(0,0,0,.32)}',
      '.academy-entry-offer{position:fixed;right:18px;bottom:18px;z-index:2147482450;width:min(390px,calc(100vw - 28px));border:1px solid rgba(229,199,132,.34);border-radius:10px;background:linear-gradient(155deg,rgba(23,17,14,.98),rgba(10,10,13,.98));box-shadow:0 24px 90px rgba(0,0,0,.42);padding:16px;color:#f8efe0;pointer-events:auto}',
      '.academy-entry-offer h2{margin:0;color:#fff6df;font-size:18px;line-height:1.18;letter-spacing:0}',
      '.academy-entry-offer p{margin:8px 0 0;color:#d8cdbd;font-size:13px;line-height:1.4}',
      '.academy-entry-offer-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}',
      '.academy-entry-overlay--quiz .academy-spotlight-hole{display:none}',
      '.academy-entry-overlay--quiz .academy-coach-card{width:min(680px,calc(100vw - 28px))}',
      '.academy-quiz-list{display:grid;gap:12px;margin-top:14px}',
      '.academy-quiz-question{padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.04)}',
      '.academy-quiz-question strong{display:block;margin-bottom:10px;color:#fff6df}',
      '.academy-quiz-option{display:flex;align-items:flex-start;gap:10px;min-height:36px;padding:8px;border-radius:8px;color:#e7dac8;cursor:pointer}',
      '.academy-quiz-option:hover{background:rgba(229,199,132,.08)}',
      '.academy-quiz-option input{margin-top:3px;accent-color:#d7aa53}',
      '.academy-quiz-message{margin-top:12px;color:#f3d794;font-weight:800}',
      '.academy-drawer-backdrop{position:fixed;inset:0;z-index:2147482500;background:rgba(4,4,7,.58)}',
      '.academy-drawer{position:fixed;z-index:2147482600;top:0;right:0;width:min(440px,100vw);height:100vh;overflow:auto;border-left:1px solid rgba(229,199,132,.3);background:linear-gradient(160deg,rgba(22,17,14,.98),rgba(9,10,13,.98));box-shadow:-22px 0 80px rgba(0,0,0,.45);padding:18px;color:#f8efe0}',
      '.academy-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}',
      '.academy-drawer-kicker{color:#e5c784;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}',
      '.academy-drawer section{border-top:1px solid rgba(255,255,255,.1);padding-top:14px;margin-top:14px}',
      '.academy-drawer h3{margin:0 0 8px;color:#fff6df;font-size:15px;letter-spacing:0}',
      '.academy-drawer-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}',
      '.academy-drawer-close{min-width:38px;padding:7px 10px}',
      '@media(max-width:760px){.academy-coach-card{left:14px!important;right:14px;top:auto!important;bottom:14px;width:auto}.academy-tour-actions{justify-content:stretch}.academy-tour-actions .academy-btn{flex:1 1 44%}.academy-help-btn{width:100%;justify-content:center;margin:10px 0 0}.academy-drawer{width:100vw}.academy-entry-overlay--quiz .academy-coach-card{width:auto}}'
    ].join('');
    document.head.appendChild(style);
  }

  function renderTourCard() {
    if (!runtime.card || !runtime.steps.length) return;
    var step = runtime.steps[runtime.stepIndex] || runtime.steps[0];
    var progress = Math.round(((runtime.stepIndex + 1) / runtime.steps.length) * 100);
    var stepReady = runtime.stepReady !== false;
    var primaryAction = runtime.stepIndex >= runtime.steps.length - 1 ? 'quiz' : 'next';
    var primaryLabel = runtime.stepIndex >= runtime.steps.length - 1 ? 'Пройти мини-тест' : 'Далее';
    if (!stepReady && step.view) primaryLabel = 'Загружаем раздел…';
    var primaryState = stepReady ? '' : ' disabled aria-busy="true"';
    var bullets = Array.isArray(step.bullets) && step.bullets.length
      ? '<ul>' + step.bullets.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>'
      : '';
    runtime.card.innerHTML = [
      '<div class="academy-coach-kicker">Академия · шаг ' + (runtime.stepIndex + 1) + ' из ' + runtime.steps.length + '</div>',
      '<h2 id="academyCoachTitle">' + escapeHtml(step.title || 'Обучение') + '</h2>',
      '<p>' + escapeHtml(step.body || '') + '</p>',
      bullets,
      !stepReady && step.view ? '<div class="academy-note" data-academy-transition>Ждём, пока вкладка откроется и закончит загрузку данных.</div>' : '',
      step.note ? '<div class="academy-note">' + escapeHtml(step.note) + '</div>' : '',
      '<div class="academy-progress" aria-hidden="true"><span style="width:' + progress + '%"></span></div>',
      '<div class="academy-tour-actions">',
      '<button class="academy-btn academy-btn-ghost" type="button" data-academy-action="back"' + (runtime.stepIndex <= 0 ? ' disabled' : '') + '>Назад</button>',
      '<button class="academy-btn academy-btn-ghost" type="button" data-academy-action="skip-tour">Пропустить урок</button>',
      '<button class="academy-btn academy-btn-primary" type="button" data-academy-action="' + primaryAction + '"' + primaryState + '>' + primaryLabel + '</button>',
      '</div>'
    ].join('');
  }

  function createOverlay() {
    createStyle();
    closeDrawer();
    removeOverlay();
    var overlay = document.createElement('div');
    overlay.className = 'academy-entry-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'academyCoachTitle');
    overlay.innerHTML = [
      '<div class="academy-spotlight-layer" aria-hidden="true">',
      '<div class="academy-spotlight-hole"></div>',
      '</div>',
      '<div class="academy-coach-card"></div>'
    ].join('');
    document.body.appendChild(overlay);
    document.body.classList.add('altea-academy-tour-active');
    document.documentElement.classList.add('altea-academy-tour-active');
    runtime.overlay = overlay;
    runtime.spotlight = overlay.querySelector('.academy-spotlight-hole');
    runtime.card = overlay.querySelector('.academy-coach-card');
    runtime.active = true;
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onTourKeydown, true);
    document.addEventListener('wheel', onTourScroll, { capture: true, passive: false });
    document.addEventListener('touchmove', onTourScroll, { capture: true, passive: false });
  }

  function removeOverlay() {
    clearStepTimer();
    runtime.stepToken += 1;
    if (runtime.overlay && runtime.overlay.parentNode) runtime.overlay.parentNode.removeChild(runtime.overlay);
    runtime.overlay = null;
    runtime.spotlight = null;
    runtime.card = null;
    runtime.active = false;
    runtime.mode = 'idle';
    runtime.stepReady = true;
    runtime.stepReadyChecks = 0;
    runtime.stepStatus = 'ready';
    document.body?.classList.remove('altea-academy-tour-active');
    document.documentElement?.classList.remove('altea-academy-tour-active');
    document.removeEventListener('keydown', onTourKeydown, true);
    document.removeEventListener('wheel', onTourScroll, true);
    document.removeEventListener('touchmove', onTourScroll, true);
  }

  function removeOffer() {
    if (runtime.offer && runtime.offer.parentNode) runtime.offer.parentNode.removeChild(runtime.offer);
    runtime.offer = null;
  }

  function answerOffer(choice) {
    var now = new Date().toISOString();
    if (choice !== 'start') {
      runtime.offerSnoozed = true;
      writeProgress({
        mode: 'offer-snoozed',
        offerAnsweredAt: '',
        offerSnoozedAt: now,
        offerChoice: 'later'
      });
      removeOffer();
      return;
    }

    runtime.offerSnoozed = false;
    writeProgress({
      mode: 'offer-started',
      offerAnsweredAt: now,
      offerSnoozedAt: '',
      offerChoice: 'start'
    });
    removeOffer();
    startTour({ force: true, view: activePortalView() });
  }

  function showAcademyOffer() {
    if (!document.body || runtime.offer || runtime.active || isAcademyComplete() || isAcademyOfferSnoozed()) return false;
    createStyle();
    var offer = document.createElement('section');
    offer.className = 'academy-entry-offer';
    offer.setAttribute('role', 'dialog');
    offer.setAttribute('aria-modal', 'false');
    offer.setAttribute('aria-labelledby', 'academyOfferTitle');
    offer.innerHTML = [
      '<h2 id="academyOfferTitle">Пройти короткое обучение по порталу?</h2>',
      '<p>Покажем основные вкладки, где смотреть данные и как не потеряться в задачах. Можно продолжить работу и открыть обучение позже через кнопку ?.</p>',
      '<div class="academy-entry-offer-actions">',
      '<button class="academy-btn academy-btn-ghost" type="button" data-academy-offer="later">Не сейчас</button>',
      '<button class="academy-btn academy-btn-primary" type="button" data-academy-offer="start">Пройти обучение</button>',
      '</div>'
    ].join('');
    offer.addEventListener('click', function (event) {
      var action = event.target && event.target.closest ? event.target.closest('[data-academy-offer]') : null;
      if (!action) return;
      event.preventDefault();
      answerOffer(action.getAttribute('data-academy-offer') === 'start' ? 'start' : 'later');
    });
    document.body.appendChild(offer);
    runtime.offer = offer;
    return true;
  }

  function dismissAcademy(reason) {
    var now = new Date().toISOString();
    writeProgress({
      mode: 'dismissed',
      currentStep: 'dismissed',
      completedAt: now,
      skippedAt: now,
      skipReason: reason || 'skip'
    });
    removeOverlay();
    try {
      window.dispatchEvent(new CustomEvent('altea:academy-dismissed', { detail: { version: VERSION, reason: reason || 'skip' } }));
    } catch (_) {}
  }

  function onTourScroll(event) {
    if (!runtime.active) return;
    var card = event.target && event.target.closest ? event.target.closest('.academy-coach-card') : null;
    if (card) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onTourKeydown(event) {
    if (!runtime.active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissAcademy('escape');
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      nextStep();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      previousStep();
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].indexOf(event.key) >= 0) {
      var coachCard = event.target && event.target.closest ? event.target.closest('.academy-coach-card') : null;
      if (coachCard && coachCard.scrollHeight > coachCard.clientHeight + 1) return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if ((event.key === ' ' || event.key === 'Spacebar') && !(event.target && event.target.closest && event.target.closest('button,input,textarea,select,a[href]'))) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onOverlayClick(event) {
    var action = event.target && event.target.closest ? event.target.closest('[data-academy-action]') : null;
    if (!action && runtime.mode === 'quiz' && event.target && event.target.closest && event.target.closest('.academy-quiz-list')) {
      return;
    }
    if (!action) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    var type = action.getAttribute('data-academy-action');
    if (type === 'next') nextStep();
    else if (type === 'back') previousStep();
    else if (type === 'skip-tour') dismissAcademy('skip-tour');
    else if (type === 'quiz') renderQuiz();
    else if (type === 'check-quiz') checkQuiz();
    else if (type === 'retry-quiz') renderQuiz(true);
    else if (type === 'restart-tour') startTour({ force: true });
  }

  function startTour(options) {
    options = options || {};
    removeOffer();
    if (!options.force && !isPortalReady()) {
      scheduleBoot();
      return false;
    }
    runtime.steps = buildTourSteps();
    if (!runtime.steps.length) return false;
    var startIndex = 0;
    if (options.view) {
      var navStepId = 'nav-' + options.view;
      var sectionStepId = 'section-' + options.view;
      startIndex = runtime.steps.findIndex(function (step) {
        return step.id === navStepId || step.id === sectionStepId;
      });
      if (startIndex < 0) startIndex = 0;
    } else {
      var progress = readProgress();
      if (progress.currentStep) {
        var savedIndex = runtime.steps.findIndex(function (step) { return step.id === progress.currentStep; });
        if (savedIndex >= 0) startIndex = savedIndex;
      }
    }
    runtime.stepIndex = startIndex;
    runtime.quizAnswers = {};
    runtime.quizMessage = '';
    createOverlay();
    runtime.mode = 'tour';
    enterStep(runtime.stepIndex);
    writeProgress({
      startedAt: readProgress().startedAt || new Date().toISOString(),
      completedAt: '',
      quizPassedAt: '',
      mode: 'tour'
    });
    return true;
  }

  function enterStep(index) {
    if (!runtime.steps.length) return;
    clearStepTimer();
    runtime.stepToken += 1;
    var token = runtime.stepToken;
    runtime.mode = 'tour';
    runtime.stepIndex = Math.max(0, Math.min(index, runtime.steps.length - 1));
    var step = runtime.steps[runtime.stepIndex];
    runtime.stepReadyChecks = 0;
    runtime.stepReady = !step.view;
    runtime.stepStatus = step.view ? 'loading' : 'ready';
    if (step.view && !viewRouteIsActive(step.view)) {
      switchToView(step.view);
    }
    if (step.view && /^nav-/.test(step.id || '')) resetTourViewScroll();
    writeProgress({ currentStep: step.id, currentIndex: runtime.stepIndex, mode: 'tour' });
    renderTourCard();
    if (step.view) {
      runtime.stepTimer = window.setTimeout(function () { checkStepEntry(step, token, 0); }, 0);
      updateSpotlightSoon();
      return;
    }
    runtime.stepTimer = window.setTimeout(function () {
      if (token !== runtime.stepToken) return;
      finishStepEntry(step, token);
    }, 40);
  }

  function nextStep() {
    if (runtime.mode === 'quiz' || runtime.stepReady === false) return;
    if (runtime.stepIndex >= runtime.steps.length - 1) {
      renderQuiz();
      return;
    }
    enterStep(runtime.stepIndex + 1);
  }

  function previousStep() {
    if (runtime.mode === 'quiz') {
      runtime.mode = 'tour';
      enterStep(runtime.stepIndex);
      return;
    }
    enterStep(runtime.stepIndex - 1);
  }

  function clearStepTimer() {
    if (runtime.stepTimer) window.clearTimeout(runtime.stepTimer);
    runtime.stepTimer = 0;
  }

  function resetTourViewScroll() {
    Array.prototype.forEach.call(document.querySelectorAll('.altea-premium-shell-content,.main'), function (container) {
      try {
        container.scrollTop = 0;
        container.scrollLeft = 0;
      } catch (_) {}
    });
    try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch (_) {
      try { window.scrollTo(0, 0); } catch (_) {}
    }
  }

  function finishStepEntry(step, token) {
    if (token !== runtime.stepToken || !runtime.active || runtime.mode !== 'tour') return;
    clearStepTimer();
    runtime.stepReady = true;
    runtime.stepStatus = 'ready';
    renderTourCard();
    var target = targetForStep(step);
    if (target && /^nav-/.test(step.id || '') && typeof target.scrollIntoView === 'function') {
      try { target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); } catch (_) {}
    }
    updateSpotlight();
    focusPrimaryAction();
  }

  function checkStepEntry(step, token, attempt) {
    if (token !== runtime.stepToken || !runtime.active || runtime.mode !== 'tour') return;
    var routeReady = viewRouteIsActive(step.view);
    var ready = routeReady && stepViewIsReady(step.view);
    runtime.stepReadyChecks = ready ? runtime.stepReadyChecks + 1 : 0;
    if (runtime.stepReadyChecks >= 2) {
      finishStepEntry(step, token);
      return;
    }
    if (!routeReady && attempt > 0 && attempt % 6 === 0) switchToView(step.view);
    runtime.stepTimer = window.setTimeout(function () {
      checkStepEntry(step, token, attempt + 1);
    }, ready ? 80 : 100);
  }

  function focusPrimaryAction() {
    if (!runtime.card) return;
    var primary = runtime.card.querySelector('.academy-btn-primary:not(:disabled)');
    if (primary && typeof primary.focus === 'function') {
      try { primary.focus({ preventScroll: true }); } catch (_) { primary.focus(); }
    }
  }

  function updateSpotlightSoon() {
    if (runtime.spotlightFrame) window.cancelAnimationFrame(runtime.spotlightFrame);
    runtime.spotlightFrame = window.requestAnimationFrame(function () {
      runtime.spotlightFrame = 0;
      updateSpotlight();
    });
  }

  function updateSpotlight() {
    if (!runtime.active || runtime.mode !== 'tour' || !runtime.spotlight || !runtime.card) return;
    var viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    var viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    if (runtime.stepReady === false) {
      runtime.spotlight.classList.add('is-hidden');
      positionCard(null, viewportWidth, viewportHeight);
      return;
    }
    var step = runtime.steps[runtime.stepIndex] || {};
    var target = targetForStep(step);
    var rect = target ? target.getBoundingClientRect() : null;
    var pad = 8;

    if (!rect || rect.width <= 0 || rect.height <= 0) {
      runtime.spotlight.classList.add('is-hidden');
      positionCard(null, viewportWidth, viewportHeight);
      return;
    }

    var left = Math.max(8, rect.left - pad);
    var top = Math.max(8, rect.top - pad);
    var width = Math.min(viewportWidth - left - 8, rect.width + pad * 2);
    var height = Math.min(viewportHeight - top - 8, rect.height + pad * 2);
    runtime.spotlight.classList.remove('is-hidden');
    runtime.spotlight.style.left = left + 'px';
    runtime.spotlight.style.top = top + 'px';
    runtime.spotlight.style.width = Math.max(24, width) + 'px';
    runtime.spotlight.style.height = Math.max(24, height) + 'px';
    positionCard({ left: left, top: top, right: left + width, bottom: top + height, width: width, height: height }, viewportWidth, viewportHeight);
  }

  function positionCard(rect, viewportWidth, viewportHeight) {
    if (!runtime.card) return;
    if (viewportWidth <= 760) {
      runtime.card.style.left = '14px';
      runtime.card.style.top = 'auto';
      return;
    }

    var cardRect = runtime.card.getBoundingClientRect();
    var cardWidth = Math.min(cardRect.width || 430, viewportWidth - 28);
    var cardHeight = Math.min(cardRect.height || 360, viewportHeight - 28);
    var gap = 16;
    var left = 18;
    var top = 18;

    if (rect) {
      if (rect.right + gap + cardWidth <= viewportWidth - 14) left = rect.right + gap;
      else if (rect.left - gap - cardWidth >= 14) left = rect.left - gap - cardWidth;
      else left = Math.max(14, Math.min(viewportWidth - cardWidth - 14, rect.left));

      if (rect.top + cardHeight <= viewportHeight - 14) top = rect.top;
      else if (rect.bottom - cardHeight >= 14) top = rect.bottom - cardHeight;
      else if (rect.bottom + gap + cardHeight <= viewportHeight - 14) top = rect.bottom + gap;
      else top = Math.max(14, Math.min(viewportHeight - cardHeight - 14, rect.top));
    } else {
      left = Math.max(14, Math.round((viewportWidth - cardWidth) / 2));
      top = Math.max(14, Math.round((viewportHeight - cardHeight) / 2));
    }

    runtime.card.style.left = Math.round(left) + 'px';
    runtime.card.style.top = Math.round(top) + 'px';
  }

  function renderQuiz(reset) {
    createStyle();
    if (!runtime.overlay) createOverlay();
    if (reset) {
      runtime.quizAnswers = {};
      runtime.quizMessage = '';
    }
    runtime.mode = 'quiz';
    writeProgress({ mode: 'quiz', currentStep: 'quiz' });
    runtime.overlay.classList.add('academy-entry-overlay--quiz');
    var questions = QUIZ.map(function (question, index) {
      var options = question.options.map(function (option) {
        var checked = runtime.quizAnswers[question.id] === option.id ? ' checked' : '';
        return [
          '<label class="academy-quiz-option">',
          '<input type="radio" name="academy-' + escapeHtml(question.id) + '" value="' + escapeHtml(option.id) + '"' + checked + '>',
          '<span>' + escapeHtml(option.text) + '</span>',
          '</label>'
        ].join('');
      }).join('');
      return [
        '<div class="academy-quiz-question" data-academy-question="' + escapeHtml(question.id) + '">',
        '<strong>' + (index + 1) + '. ' + escapeHtml(question.question) + '</strong>',
        options,
        '</div>'
      ].join('');
    }).join('');

    runtime.card.innerHTML = [
      '<div class="academy-coach-kicker">Академия · мини-тест</div>',
      '<h2 id="academyCoachTitle">Проверим, что можно работать</h2>',
      '<p>Ответьте на вопросы по ключевым правилам портала. После успешного теста портал разблокируется.</p>',
      '<div class="academy-quiz-list">' + questions + '</div>',
      runtime.quizMessage ? '<div class="academy-quiz-message">' + escapeHtml(runtime.quizMessage) + '</div>' : '',
      '<div class="academy-tour-actions">',
      '<button class="academy-btn academy-btn-ghost" type="button" data-academy-action="restart-tour">Вернуться к уроку</button>',
      '<button class="academy-btn academy-btn-primary" type="button" data-academy-action="check-quiz">Завершить тест</button>',
      '</div>'
    ].join('');
    runtime.card.querySelectorAll('input[type="radio"]').forEach(function (input) {
      input.addEventListener('change', function () {
        var wrapper = input.closest('[data-academy-question]');
        if (!wrapper) return;
        runtime.quizAnswers[wrapper.getAttribute('data-academy-question')] = input.value;
      });
    });
    window.setTimeout(function () {
      positionCard(null, window.innerWidth || 0, window.innerHeight || 0);
      focusPrimaryAction();
    }, 0);
  }

  function checkQuiz() {
    var missing = QUIZ.filter(function (question) { return !runtime.quizAnswers[question.id]; });
    if (missing.length) {
      runtime.quizMessage = 'Ответьте на все вопросы, чтобы завершить обучение.';
      renderQuiz(false);
      return;
    }

    var wrong = [];
    QUIZ.forEach(function (question) {
      var selected = question.options.find(function (option) { return option.id === runtime.quizAnswers[question.id]; });
      if (!selected || !selected.correct) wrong.push(question);
    });

    if (!wrong.length) {
      completeAcademy();
      return;
    }

    runtime.quizMessage = 'Есть ошибки: ' + wrong.map(function (question) { return question.explanation; }).join(' ');
    renderQuiz(false);
  }

  function completeAcademy() {
    var now = new Date().toISOString();
    writeProgress({
      mode: 'complete',
      currentStep: 'complete',
      completedAt: now,
      quizPassedAt: now,
      quizScore: QUIZ.length + '/' + QUIZ.length
    });
    removeOverlay();
    try {
      window.dispatchEvent(new CustomEvent('altea:academy-complete', { detail: { version: VERSION } }));
    } catch (_) {}
  }

  function contentLooksReady(root) {
    if (!root) return false;
    if (visibleLoadingMarker(root) || visibleLoadingCopy(root)) return false;
    var text = String(root.innerText || root.textContent || '').trim();
    if (text.length >= 40) return true;
    return Boolean(root.querySelector('.section-title,h1,h2,h3,table,.data-table,.card,[class*="card"],form,[data-task-calendar-design-v1],.altea-premium-route,.portal-lux-shell'));
  }

  function ensureGlobalHelpButton() {
    if (!document.body) return;
    var host = portalTopbarElement() || document.querySelector('.topbar,.altea-premium-shell-topbar') || document.body;
    var button = document.querySelector('[data-academy-global-help]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'academy-help-btn academy-global-help';
      button.type = 'button';
      button.setAttribute('data-academy-global-help', '1');
    }
    if (button.parentNode !== host) host.appendChild(button);
    button.classList.toggle('is-floating', host === document.body);
    var view = activePortalView();
    var guide = guideForView(view);
    button.setAttribute('data-academy-help-view', view);
    button.setAttribute('title', 'Как пользоваться: ' + guide.title);
    var helpMarkup = '<span aria-hidden="true">?</span><b>Как пользоваться</b>';
    if (button.innerHTML !== helpMarkup) button.innerHTML = helpMarkup;
  }

  function ensureHelpButtons() {
    if (!document.body) return;
    createStyle();
    ensureGlobalHelpButton();
    orderedVisibleViews().forEach(function (view) {
      var root = firstReadyViewSurface(view);
      if (!root || root.querySelector('[data-academy-help-button]')) return;
      if (!contentLooksReady(root)) return;

      var button = document.createElement('button');
      button.className = 'academy-help-btn';
      button.type = 'button';
      button.setAttribute('data-academy-help-button', view);
      button.innerHTML = '<span aria-hidden="true">?</span><b>Как пользоваться разделом</b>';

      var title = root.querySelector('.section-title, .control-simple-title, .portal-section-title, .route-head, header');
      if (title) title.appendChild(button);
      else root.insertBefore(button, root.firstChild);
    });
  }

  function scheduleHelpButtons() {
    if (runtime.helpScheduled) return;
    runtime.helpScheduled = true;
    window.setTimeout(function () {
      runtime.helpScheduled = false;
      ensureHelpButtons();
      if (runtime.active) updateSpotlightSoon();
    }, 80);
  }

  function drawerList(items) {
    return '<ul>' + (items || []).map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>';
  }

  function openDrawer(view) {
    closeDrawer();
    createStyle();
    view = normalizeView(view || activePortalView());
    var guide = guideForView(view);
    var backdrop = document.createElement('div');
    backdrop.className = 'academy-drawer-backdrop';
    var drawer = document.createElement('aside');
    drawer.className = 'academy-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'academyDrawerTitle');
    drawer.innerHTML = [
      '<div class="academy-drawer-head">',
      '<div><div class="academy-drawer-kicker">Как пользоваться разделом</div><h2 id="academyDrawerTitle">' + escapeHtml(guide.title) + '</h2></div>',
      '<button type="button" class="academy-drawer-close" data-academy-drawer-close aria-label="Закрыть">×</button>',
      '</div>',
      '<p>' + escapeHtml(guide.summary) + '</p>',
      DATA_HEAVY_VIEWS[view] ? '<div class="academy-note">' + escapeHtml(HEAVY_DATA_NOTE) + '</div>' : '',
      '<section><h3>Что смотреть</h3>' + drawerList(guide.watch) + '</section>',
      '<section><h3>Что можно делать</h3>' + drawerList(guide.actions) + '</section>',
      '<section><h3>Что нельзя делать</h3>' + drawerList(guide.avoid) + '</section>',
      '<section><h3>Сценарий работы</h3><p>' + escapeHtml(guide.workflow) + '</p></section>',
      '<div class="academy-drawer-actions">',
      '<button class="academy-btn academy-btn-primary" type="button" data-academy-drawer-tour="' + escapeHtml(view) + '">Открыть полный урок</button>',
      '<button class="academy-btn academy-btn-ghost" type="button" data-academy-drawer-quiz>Пройти мини-тест</button>',
      '</div>'
    ].join('');
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);
    runtime.drawerBackdrop = backdrop;
    runtime.drawer = drawer;
    backdrop.addEventListener('click', closeDrawer);
    drawer.addEventListener('click', function (event) {
      var close = event.target.closest('[data-academy-drawer-close]');
      var tour = event.target.closest('[data-academy-drawer-tour]');
      var quiz = event.target.closest('[data-academy-drawer-quiz]');
      if (close) {
        event.preventDefault();
        closeDrawer();
      } else if (tour) {
        event.preventDefault();
        var targetView = tour.getAttribute('data-academy-drawer-tour');
        closeDrawer();
        startTour({ force: true, view: targetView });
      } else if (quiz) {
        event.preventDefault();
        closeDrawer();
        createOverlay();
        renderQuiz(true);
      }
    });
    var closeButton = drawer.querySelector('[data-academy-drawer-close]');
    if (closeButton) closeButton.focus();
  }

  function closeDrawer() {
    if (runtime.drawerBackdrop && runtime.drawerBackdrop.parentNode) runtime.drawerBackdrop.parentNode.removeChild(runtime.drawerBackdrop);
    if (runtime.drawer && runtime.drawer.parentNode) runtime.drawer.parentNode.removeChild(runtime.drawer);
    runtime.drawerBackdrop = null;
    runtime.drawer = null;
  }

  function installObservers() {
    if (runtime.observer || !document.body) return;
    runtime.observer = new MutationObserver(scheduleHelpButtons);
    runtime.observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', function (event) {
      var helpButton = event.target && event.target.closest
        ? event.target.closest('[data-academy-global-help], [data-academy-help-button]')
        : null;
      if (!helpButton) return;
      event.preventDefault();
      event.stopPropagation();
      var view = helpButton.hasAttribute('data-academy-global-help')
        ? activePortalView()
        : (helpButton.getAttribute('data-academy-help-button') || activePortalView());
      openDrawer(view);
    });
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('.nav-btn[data-view], [data-premium-nav]') : null;
      if (!target) return;
      scheduleHelpButtons();
      window.setTimeout(scheduleHelpButtons, 260);
      window.setTimeout(scheduleHelpButtons, 760);
    }, true);
    ['resize', 'scroll'].forEach(function (eventName) {
      window.addEventListener(eventName, updateSpotlightSoon, true);
    });
    ['altea:viewchange', 'altea:data-ready', 'altea:view-data-ready', 'altea:app-ready', 'altea:accesschange', 'hashchange', 'load'].forEach(function (eventName) {
      window.addEventListener(eventName, function () {
        scheduleHelpButtons();
        window.setTimeout(scheduleHelpButtons, 320);
        window.setTimeout(scheduleHelpButtons, 900);
        updateSpotlightSoon();
        scheduleBoot();
      });
    });
  }

  function scheduleBoot() {
    window.clearTimeout(runtime.bootTimer);
    runtime.bootTimer = window.setTimeout(function () {
      runtime.bootAttempts += 1;
      installObservers();
      scheduleHelpButtons();

      var params = new URLSearchParams(window.location.search || '');
      var academyMode = params.get('academy');
      var shouldStartTour = academyMode === 'reset'
        || academyMode === 'start'
        || academyMode === 'tour'
        || academyMode === 'on';
      if (academyMode === 'reset') resetProgress();
      if (academyMode === 'off') return;

      if (!runtime.active && !isAcademyComplete() && isPortalReady()) {
        if (shouldStartTour) startTour({ force: true });
        else if (!isAcademyOfferSnoozed()) showAcademyOffer();
        return;
      }
      if (!runtime.active && !isAcademyComplete() && runtime.bootAttempts < 160) scheduleBoot();
    }, runtime.bootAttempts < 20 ? 300 : 1000);
  }

  window.alteaAcademyTour = {
    start: function (view) { return startTour({ force: true, view: view }); },
    openHelp: openDrawer,
    reset: function () {
      resetProgress();
      runtime.offerSnoozed = false;
      removeOffer();
      removeOverlay();
      scheduleBoot();
    },
    ask: showAcademyOffer,
    complete: completeAcademy,
    progress: readProgress,
    targets: ACADEMY_PORTAL_TARGETS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      installObservers();
      scheduleBoot();
    }, { once: true });
  } else {
    installObservers();
    scheduleBoot();
  }
})();
