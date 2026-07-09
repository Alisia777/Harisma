(function () {
  'use strict';

  if (window.__ALTEA_LAUNCH_AUTOTASKS_V1__) return;
  window.__ALTEA_LAUNCH_AUTOTASKS_V1__ = true;

  const VERSION = '20260709-launch-perf-v1';
  const MAX_BULK_TASKS = 30;
  const AUGMENT_MIN_INTERVAL_MS = 220;
  const SNAPSHOT_CACHE_MS = 6000;
  const REMOVED_STATUSES = new Set(['deleted', 'removed']);
  const CLOSED_STATUSES = new Set(['done', 'closed', 'complete', 'completed', 'cancelled', 'canceled', 'archive', 'archived']);
  const TASK_STATUSES = [
    ['new', 'Новая'],
    ['in_progress', 'В работе'],
    ['waiting_team', 'Ждет команду'],
    ['waiting_rop', 'Ожидает РОП'],
    ['waiting_decision', 'На решение'],
    ['done', 'Готово']
  ];
  const TASK_PRIORITIES = [
    ['critical', 'Критично'],
    ['high', 'Высокий'],
    ['medium', 'Средний'],
    ['low', 'Низкий']
  ];

  const ROLE_LABELS = {
    product: 'Продакт',
    marketingLead: 'Маркетолог рук',
    marketing: 'Маркетолог',
    pr: 'PR и SMM',
    logist: 'Логист',
    kz: 'КЗ',
    rop: 'РОП'
  };

  const ROLE_FIELDS = {
    product: ['productOwner', 'product_owner', 'responsible', 'owner'],
    marketingLead: ['marketingLead', 'marketing_lead', 'marketingManager', 'marketing_manager', 'leadOwner', 'owner'],
    marketing: ['marketingOwner', 'marketing_owner', 'marketer', 'owner'],
    pr: ['prOwner', 'smmOwner', 'contentOwner', 'owner'],
    logist: ['logist', 'logistOwner', 'logisticsOwner', 'supplyOwner', 'owner'],
    kz: ['kzOwner', 'selfBuyOwner', 'buyoutOwner', 'owner'],
    rop: ['ropOwner', 'salesOwner', 'commercialOwner', 'owner']
  };

  const LAUNCH_MARKETPLACE_LABELS = {
    wb: 'WB',
    ozon: 'Ozon',
    ya: 'Я.Маркет',
    goldapple: 'ЗЯ',
    letu: "Л'Этуаль",
    megamarket: 'Мегамаркет',
    samokat: 'Самокат',
    magnit: 'Магнит'
  };

  const LAUNCH_MARKETPLACE_ALIASES = {
    wb: 'wb',
    wildberries: 'wb',
    вб: 'wb',
    ozon: 'ozon',
    озон: 'ozon',
    ya: 'ya',
    ym: 'ya',
    yandex: 'ya',
    yandexmarket: 'ya',
    yamarket: 'ya',
    ям: 'ya',
    ямаркет: 'ya',
    яндекс: 'ya',
    яндексмаркет: 'ya',
    goldapple: 'goldapple',
    goldenapple: 'goldapple',
    zya: 'goldapple',
    ga: 'goldapple',
    зя: 'goldapple',
    золотоеяблоко: 'goldapple',
    золотойяблоко: 'goldapple',
    letu: 'letu',
    letual: 'letu',
    letoile: 'letu',
    летуаль: 'letu',
    лэтуаль: 'letu',
    megamarket: 'megamarket',
    sbermegamarket: 'megamarket',
    мегамаркет: 'megamarket',
    samokat: 'samokat',
    самокат: 'samokat',
    magnit: 'magnit',
    magnitmarket: 'magnit',
    magnet: 'magnit',
    magnetmarket: 'magnit',
    mm: 'magnit',
    магнит: 'magnit',
    магнитмаркет: 'magnit'
  };

  const PROCESS_TASKS = [
    {
      id: 't30-product-file',
      phase: 'intake',
      phaseLabel: 'Паспорт новинки',
      trigger: 'firstStock',
      offset: -30,
      role: 'product',
      priority: 'critical',
      title: 'Загрузить продакт-файл и описание новинки',
      nextAction: 'Загрузить файл, описание товара, ключевые свойства, плановые даты и ссылки на материалы в портал.',
      evidence: 'Ссылка на продакт-файл или вложение в задаче'
    },
    {
      id: 't25-team-presentation',
      phase: 'kickoff',
      phaseLabel: 'Командный старт',
      trigger: 'firstStock',
      offset: -25,
      role: 'product',
      priority: 'high',
      title: 'Провести презентацию товара команде',
      nextAction: 'Показать товар маркетологам, аккаунтерам по отзывам, креаторам и PR: позиционирование, сроки, площадки, риски.',
      evidence: 'Комментарий с итогами встречи'
    },
    {
      id: 't25-marketing-distribution',
      phase: 'kickoff',
      phaseLabel: 'Командный старт',
      trigger: 'firstStock',
      offset: -25,
      role: 'marketingLead',
      priority: 'high',
      title: 'Распределить SKU и определить бенчмарки',
      nextAction: 'Закрепить маркетолога, список SKU, категорию, 4-5 бенчмарков и KPI карточки.',
      evidence: 'Owner, бенчмарки и категория заполнены'
    },
    {
      id: 't14-funnel-tz',
      phase: 'prelaunch',
      phaseLabel: 'Подготовка карточки',
      trigger: 'firstStock',
      offset: -14,
      role: 'marketing',
      priority: 'high',
      title: 'Проработать воронку и ТЗ дизайнерам',
      nextAction: 'Подготовить воронку карточки и ТЗ на первый слайд: 3-4 варианта главного фото или концепта.',
      evidence: 'Ссылка на ТЗ или макеты'
    },
    {
      id: 't14-seo-description',
      phase: 'prelaunch',
      phaseLabel: 'Подготовка карточки',
      trigger: 'firstStock',
      offset: -14,
      role: 'marketing',
      priority: 'high',
      title: 'Подготовить SEO-описание карточки',
      nextAction: 'Собрать SEO-описание, характеристики и передать ответственным за карточку и контент.',
      evidence: 'SEO-текст и характеристики готовы'
    },
    {
      id: 't14-kz-reviews',
      phase: 'prelaunch',
      phaseLabel: 'Подготовка карточки',
      trigger: 'firstStock',
      offset: -14,
      role: 'marketing',
      priority: 'medium',
      title: 'Подготовить отзывы для КЗ',
      nextAction: 'Если товар берется в работу КЗ, подготовить тексты, фотоотзывы и вводные для команды.',
      evidence: 'Пакет отзывов или отметка, что КЗ не нужен'
    },
    {
      id: 't14-pr-smm-brief',
      phase: 'prelaunch',
      phaseLabel: 'Подготовка карточки',
      trigger: 'firstStock',
      offset: -14,
      role: 'pr',
      priority: 'medium',
      title: 'Уточнить задачу PR/SMM по запуску',
      nextAction: 'В Excel действие для PR/SMM пустое. Зафиксировать, нужен ли контент, посевы, публикации или внешняя поддержка.',
      evidence: 'Решение PR/SMM: нужен план или не требуется'
    },
    {
      id: 't3-shipment-signal',
      phase: 'shipment',
      phaseLabel: 'Отгрузка',
      trigger: 'firstStock',
      offset: -3,
      role: 'logist',
      priority: 'critical',
      title: 'Дать сигнал об отгрузке товара',
      nextAction: 'Подтвердить, что товар отгружен, указать дату, склад, площадки и риски по задержке.',
      evidence: 'Дата отгрузки и комментарий логиста'
    },
    {
      id: 't3-card-readiness',
      phase: 'shipment',
      phaseLabel: 'Отгрузка',
      trigger: 'firstStock',
      offset: -3,
      role: 'marketing',
      priority: 'critical',
      title: 'Проверить готовность карточки',
      nextAction: 'Проверить фото, SEO, характеристики, цену, контент и готовность к рекламе до поступления товара.',
      evidence: 'Чек готовности карточки закрыт'
    },
    {
      id: 'd0-fill-mp-stock',
      phase: 'mp-stock',
      phaseLabel: 'Поступление на МП',
      trigger: 'mpStock',
      fallbackTrigger: 'firstStock',
      offset: 0,
      role: 'logist',
      priority: 'high',
      title: 'Пополнить склады маркетплейсов',
      nextAction: 'Проверить распределение по складам МП и закрыть дефициты по площадкам.',
      evidence: 'Склады МП пополнены или есть план пополнения'
    },
    {
      id: 'd0-kz-start',
      phase: 'mp-stock',
      phaseLabel: 'Поступление на МП',
      trigger: 'mpStock',
      fallbackTrigger: 'firstStock',
      offset: 0,
      role: 'kz',
      priority: 'high',
      title: 'КЗ: взять товар в работу и начать выкупы',
      nextAction: 'После поступления на склад МП взять новинку в работу и запустить плановые выкупы, если КЗ нужен.',
      evidence: 'КЗ запущен или отмечено, что не требуется'
    },
    {
      id: 'd0-rop-price',
      phase: 'mp-stock',
      phaseLabel: 'Поступление на МП',
      trigger: 'mpStock',
      fallbackTrigger: 'firstStock',
      offset: 0,
      role: 'rop',
      priority: 'high',
      title: 'РОП: встать в плановую высокую цену',
      nextAction: 'Проверить стартовую цену, акции и не уйти ниже плановой экономики в первые дни запуска.',
      evidence: 'Цена проверена'
    },
    {
      id: 'd0-marketing-ads-reviews',
      phase: 'mp-stock',
      phaseLabel: 'Поступление на МП',
      trigger: 'mpStock',
      fallbackTrigger: 'firstStock',
      offset: 0,
      role: 'marketing',
      priority: 'high',
      title: 'Включить отзывы за баллы и РК',
      nextAction: 'Запустить отзывы за баллы и рекламные кампании после поступления товара на МП.',
      evidence: 'Отзывы за баллы и РК включены'
    },
    {
      id: 'd7-wb-actions',
      phase: 'launch-week',
      phaseLabel: 'Первая неделя',
      trigger: 'mpStock',
      fallbackTrigger: 'firstStock',
      offset: 7,
      role: 'rop',
      priority: 'medium',
      title: 'Проверить акции и промо площадки',
      nextAction: 'Проверить доступные акции/промо выбранной площадки, экономику и подать товар в релевантные механики.',
      evidence: 'Акции/промо площадки проверены'
    },
    {
      id: 'd7-review-pin',
      phase: 'launch-week',
      phaseLabel: 'Первая неделя',
      trigger: 'mpStock',
      fallbackTrigger: 'firstStock',
      offset: 7,
      role: 'marketing',
      priority: 'medium',
      title: 'Отсмотреть и закрепить отзывы',
      nextAction: 'Проверить первые отзывы, закрепить сильные и зафиксировать проблемы покупателей.',
      evidence: 'Отзывы просмотрены'
    },
    {
      id: 'd7-ad-hypotheses',
      phase: 'launch-week',
      phaseLabel: 'Первая неделя',
      trigger: 'mpStock',
      fallbackTrigger: 'firstStock',
      offset: 7,
      role: 'marketing',
      priority: 'medium',
      title: 'Оценить РК и выдвинуть гипотезы',
      nextAction: 'Посмотреть первые показатели рекламы, зафиксировать выводы и гипотезы по доработке карточки.',
      evidence: 'Гипотезы и показатели РК зафиксированы'
    },
    {
      id: 'd60-main-photo-ab',
      phase: 'optimization',
      phaseLabel: 'D+60 оптимизация',
      trigger: 'firstStock',
      offset: 60,
      role: 'marketing',
      priority: 'medium',
      title: 'A/B тест главного фото',
      nextAction: 'Запустить или завершить A/B тест главного фото и зафиксировать победивший вариант.',
      evidence: 'Результат A/B теста'
    },
    {
      id: 'd60-semantics-feedback',
      phase: 'optimization',
      phaseLabel: 'D+60 оптимизация',
      trigger: 'firstStock',
      offset: 60,
      role: 'marketing',
      priority: 'medium',
      title: 'Собрать семантику, отзывы и вопросы покупателей',
      nextAction: 'Собрать семантическое ядро, отзывы, вопросы и причины сомнений покупателей по новинке.',
      evidence: 'Семантика и обратная связь собраны'
    },
    {
      id: 'd60-seo-creatives-update',
      phase: 'optimization',
      phaseLabel: 'D+60 оптимизация',
      trigger: 'firstStock',
      offset: 60,
      role: 'marketing',
      priority: 'medium',
      title: 'Скорректировать SEO и креативы карточки',
      nextAction: 'Обновить SEO, слайды и креативы карточки по данным первых 60 дней.',
      evidence: 'Карточка обновлена или правки заведены'
    },
    {
      id: 'reorder-feedback',
      phase: 'reorder',
      phaseLabel: 'Повторный заказ',
      trigger: 'repeatOrder',
      fallbackTrigger: 'firstStock',
      offset: 0,
      role: 'marketing',
      priority: 'high',
      title: 'Подготовить обратную связь к повторному заказу',
      nextAction: 'Собрать обратную связь покупателей, изменения рынка и предложения по улучшению товара до повторного заказа.',
      evidence: 'Презентация или список правок для повторного заказа'
    }
  ];

  const MONTHS = {
    январь: '01',
    января: '01',
    февраль: '02',
    февраля: '02',
    март: '03',
    марта: '03',
    апрель: '04',
    апреля: '04',
    май: '05',
    мая: '05',
    июнь: '06',
    июня: '06',
    июль: '07',
    июля: '07',
    август: '08',
    августа: '08',
    сентябрь: '09',
    сентября: '09',
    октябрь: '10',
    октября: '10',
    ноябрь: '11',
    ноября: '11',
    декабрь: '12',
    декабря: '12'
  };

  let wrapTimer = 0;
  let renderQueued = false;
  let knownTasksCache = null;
  let opsSnapshotCache = null;
  let opsPanelQueued = false;
  let selectedDetailQueued = false;
  let historyBackfillQueued = false;
  let historyBackfilled = false;
  let lastAugmentAt = 0;
  let lastHandledAction = { key: '', at: 0 };

  function appState() {
    let stateRef = window.__alteaAppState || window.__ALTEA_STATE__ || null;
    try {
      stateRef = stateRef || (typeof state === 'object' && state ? state : null);
    } catch {
      stateRef = stateRef || null;
    }
    if (!stateRef) {
      window.state = window.state && typeof window.state === 'object' ? window.state : {};
      stateRef = window.state;
    }
    window.__alteaAppState = stateRef;
    window.__ALTEA_STATE__ = stateRef;
    stateRef.storage = stateRef.storage && typeof stateRef.storage === 'object' ? stateRef.storage : {};
    stateRef.storage.tasks = Array.isArray(stateRef.storage.tasks) ? stateRef.storage.tasks : [];
    return stateRef;
  }

  function html(value) {
    const source = String(value ?? '');
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(source);
    return source
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function todayKey() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(value) {
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const iso = text.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
    const ru = text.toLowerCase().match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
    if (ru && MONTHS[ru[2]]) return `${ru[3]}-${MONTHS[ru[2]]}-${String(ru[1]).padStart(2, '0')}`;
    return '';
  }

  function parseMonthKey(label) {
    const exact = parseDateKey(label);
    if (exact) return `${exact.slice(0, 7)}-01`;
    const text = String(label || '').trim().toLowerCase();
    const match = text.match(/([а-яё]+)\s+(\d{4})/i);
    if (!match || !MONTHS[match[1]]) return '';
    return `${match[2]}-${MONTHS[match[1]]}-01`;
  }

  function shiftDateKey(dateKey, days) {
    const key = parseDateKey(dateKey);
    if (!key) return '';
    const date = new Date(`${key}T12:00:00`);
    date.setDate(date.getDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function dayDiff(dateKey, reference = todayKey()) {
    const left = parseDateKey(dateKey);
    const right = parseDateKey(reference);
    if (!left || !right) return Number.POSITIVE_INFINITY;
    const a = new Date(`${left}T12:00:00`).getTime();
    const b = new Date(`${right}T12:00:00`).getTime();
    return Math.round((a - b) / 86400000);
  }

  function hashString(value) {
    const text = String(value || '');
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function stableId(prefix, raw) {
    if (typeof window.stableId === 'function') return window.stableId(prefix, raw);
    return `${prefix}-${hashString(raw)}`;
  }

  function launchId(item = {}) {
    if (typeof window.launchStableId === 'function') return window.launchStableId(item);
    return String(item.id || item.articleKey || item.article || item.name || stableId('launch', JSON.stringify(item))).trim();
  }

  function launchItems(options = {}) {
    const source = typeof window.getLaunchItems === 'function'
      ? window.getLaunchItems({ skipTaskLookup: true })
      : appState().launches;
    const items = (Array.isArray(source) ? source : [])
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({ ...item, id: launchId(item) }));
    return options.skipMarketplaceScope ? items : items.filter((item) => launchMatchesMarketplace(item));
  }

  function firstText(item, fields) {
    for (const field of fields) {
      const value = String(item?.[field] || '').trim();
      if (value) return value;
    }
    return '';
  }

  function marketplaceTextValues(value) {
    if (Array.isArray(value)) return value.flatMap(marketplaceTextValues);
    if (value && typeof value === 'object') {
      return ['key', 'id', 'name', 'label', 'marketplace', 'platform', 'network']
        .map((field) => String(value?.[field] || '').trim())
        .filter(Boolean);
    }
    const text = String(value || '').trim();
    return text ? [text] : [];
  }

  function normalizeLaunchMarketplace(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const compact = raw.replace(/[\s._'`"\u2019-]+/g, '');
    if (LAUNCH_MARKETPLACE_ALIASES[compact]) return LAUNCH_MARKETPLACE_ALIASES[compact];
    if (/\bwildberries\b|\bwb\b|(^|\W)вб($|\W)/.test(raw)) return 'wb';
    if (/\bozon\b|озон/.test(raw)) return 'ozon';
    if (/яндекс|я\.?\s?маркет|\byandex\b|\bya\b|\bym\b/.test(raw)) return 'ya';
    if (/gold\s?apple|golden\s?apple|золот.*яблок|(^|\W)з\s?я($|\W)/.test(raw)) return 'goldapple';
    if (/l['`\u2019\s.-]*etoile|letu|letual|л['`\u2019\s.-]*[еэ]туал|летуаль|лэтуаль/.test(raw)) return 'letu';
    if (/sber\s?mega\s?market|mega\s?market|мегамаркет/.test(raw)) return 'megamarket';
    if (/samokat|самокат/.test(raw)) return 'samokat';
    if (/magnit|magnet|магнит|(^|\W)mm($|\W)/.test(raw)) return 'magnit';
    return '';
  }

  function activeMarketplaceKey() {
    const stateRef = appState();
    const candidates = [
      document.body?.dataset?.marketplace,
      document.body?.dataset?.platform,
      stateRef.filters?.market,
      stateRef.filters?.platform,
      stateRef.globalMarket,
      stateRef.marketplace
    ];
    for (const value of candidates) {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) continue;
      if (raw === 'all' || raw === '\u0432\u0441\u0435' || raw === '\u0432\u0441\u0435 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0438') return 'all';
      const key = normalizeLaunchMarketplace(raw);
      if (key) return key;
      if (['all', 'wb', 'ozon', 'ya', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit'].includes(raw)) return raw;
    }
    return 'all';
  }

  function launchMarketplaceKeys(item) {
    const fields = [
      'marketplaces',
      'marketplace',
      'platforms',
      'platform',
      'marketplaceKey',
      'network',
      'networks',
      'retailer',
      'channel',
      'market',
      'salesChannel',
      'launchPlatform'
    ];
    const keys = new Set();
    fields.flatMap((field) => marketplaceTextValues(item?.[field])).forEach((value) => {
      const direct = normalizeLaunchMarketplace(value);
      if (direct) keys.add(direct);
      String(value || '')
        .split(/[,+;/|]+|\s+\+\s+|\s+и\s+/i)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          const key = normalizeLaunchMarketplace(part);
          if (key) keys.add(key);
        });
    });
    return Array.from(keys);
  }

  function launchMatchesMarketplace(item, marketplace = activeMarketplaceKey()) {
    const selected = String(marketplace || 'all').trim();
    if (!selected || selected === 'all') return true;
    return launchMarketplaceKeys(item).includes(selected);
  }

  function launchMarketplaceKey(item) {
    const keys = launchMarketplaceKeys(item);
    if (!keys.length) return 'product';
    return keys.length === 1 ? keys[0] : 'cross';
  }

  function launchMarketplaceLabel(item) {
    const keys = launchMarketplaceKeys(item);
    if (!keys.length) return firstText(item, ['marketplaces', 'marketplace', 'platform', 'network']);
    return keys.map((key) => LAUNCH_MARKETPLACE_LABELS[key] || key).join(' + ');
  }

  function ownerForRole(item, role) {
    return firstText(item, ROLE_FIELDS[role] || ['owner']);
  }

  function launchName(item) {
    return String(item?.name || item?.title || item?.articleKey || item?.article || 'Новинка').trim();
  }

  function articleKey(item) {
    return String(item?.articleKey || item?.article || item?.sku || '').trim();
  }

  function firstStockDateInfo(item) {
    const exact = firstText(item, [
      'firstStockDate',
      'firstWarehouseDate',
      'warehouseDate',
      'supplyDate',
      'stockDate',
      'launchDate',
      'dueDate',
      'date'
    ]);
    const parsedExact = parseDateKey(exact);
    if (parsedExact) return { date: parsedExact, source: 'exact', label: 'точная дата' };

    const month = parseMonthKey(firstText(item, ['launchMonth', 'month', 'launchPeriod']));
    if (month) return { date: month, source: 'month', label: 'месяц запуска' };

    return { date: '', source: 'missing', label: 'нет даты' };
  }

  function mpStockDateInfo(item) {
    const exact = firstText(item, [
      'mpStockDate',
      'marketplaceStockDate',
      'marketplaceWarehouseDate',
      'mpWarehouseDate',
      'marketplaceArrivalDate',
      'stockMpDate'
    ]);
    const parsed = parseDateKey(exact);
    if (parsed) return { date: parsed, source: 'exact', label: 'дата МП' };
    return { date: '', source: 'missing', label: 'нет даты МП' };
  }

  function repeatOrderDateInfo(item) {
    const exact = firstText(item, [
      'repeatOrderDate',
      'nextOrderDate',
      'plannedReorderDate',
      'reorderDate',
      'firstRepeatOrderDate'
    ]);
    const parsed = parseDateKey(exact);
    if (parsed) return { date: shiftDateKey(parsed, -120), source: 'exact', label: '120 дней до повторного заказа' };
    const firstStock = firstStockDateInfo(item);
    if (firstStock.date) return { date: shiftDateKey(firstStock.date, 120), source: 'fallback', label: 'D+120 без даты повторного заказа' };
    return { date: '', source: 'missing', label: 'нет даты повторного заказа' };
  }

  function anchorForTask(item, def) {
    const primary = def.trigger === 'mpStock'
      ? mpStockDateInfo(item)
      : def.trigger === 'repeatOrder'
        ? repeatOrderDateInfo(item)
        : firstStockDateInfo(item);
    if (primary.date) return { ...primary, date: shiftDateKey(primary.date, def.offset || 0) };
    if (def.fallbackTrigger) {
      const fallback = def.fallbackTrigger === 'mpStock' ? mpStockDateInfo(item) : firstStockDateInfo(item);
      if (fallback.date) return { ...fallback, source: `${fallback.source}-fallback`, date: shiftDateKey(fallback.date, def.offset || 0) };
    }
    return { date: '', source: 'missing', label: 'нет даты' };
  }

  function taskAutoCode(launchKey, defId) {
    return `launch_ops:${launchKey}:${defId}`;
  }

  function launchOpsSuppressionKeys(launchKey, defId) {
    const code = taskAutoCode(launchKey, defId);
    return [`code:${code}`, `id:${stableId('task-launch-auto', code)}`];
  }

  function launchOpsTombstoneSet() {
    try {
      if (typeof window.launchAutoTaskTombstoneSet === 'function') return window.launchAutoTaskTombstoneSet();
    } catch {}
    const storage = appState().storage || {};
    return new Set((Array.isArray(storage.launchAutoTaskTombstones) ? storage.launchAutoTaskTombstones : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean));
  }

  function isLaunchOpsSuppressed(launchKey, defId) {
    const tombstones = launchOpsTombstoneSet();
    return launchOpsSuppressionKeys(launchKey, defId).some((key) => tombstones.has(key));
  }

  function allKnownTasks() {
    if (knownTasksCache) return knownTasksCache;
    const storage = appState().storage.tasks || [];
    let remote = [];
    try {
      remote = typeof window.getAllTasks === 'function' ? (window.getAllTasks() || []) : [];
    } catch {
      remote = [];
    }
    const map = new Map();
    [...storage, ...remote].filter(Boolean).forEach((task) => {
      const id = String(task.id || '').trim() || stableId('task-shadow', JSON.stringify(task));
      if (!map.has(id)) map.set(id, task);
    });
    knownTasksCache = [...map.values()];
    return knownTasksCache;
  }

  function isRemoved(task) {
    return REMOVED_STATUSES.has(String(task?.status || '').trim().toLowerCase());
  }

  function isClosed(task) {
    return CLOSED_STATUSES.has(String(task?.status || '').trim().toLowerCase());
  }

  function existingTaskFor(launchKey, defId) {
    const code = taskAutoCode(launchKey, defId);
    return allKnownTasks().find((task) => {
      if (isRemoved(task)) return false;
      return String(task?.autoCode || '') === code
        || String(task?.launchAutoKey || '') === code
        || String(task?.id || '') === stableId('task-launch-auto', code);
    }) || null;
  }

  function taskPayload(item, def) {
    const key = launchId(item);
    const anchor = anchorForTask(item, def);
    const roleLabel = ROLE_LABELS[def.role] || def.role || 'Команда';
    const due = anchor.date || '';
    const productName = launchName(item);
    const article = articleKey(item);
    const status = due && dayDiff(due) <= 0 ? 'in_progress' : 'new';
    const code = taskAutoCode(key, def.id);
    const title = `${productName}: ${def.title}`;
    const platform = launchMarketplaceKey(item);
    const platformLabel = launchMarketplaceLabel(item);
    const context = [
      `Процесс запуска: ${def.phaseLabel}`,
      `Роль: ${roleLabel}`,
      platformLabel ? `Площадка: ${platformLabel}` : '',
      due ? `Срок: ${due}` : 'Срок не рассчитан, нужна дата запуска или склада',
      anchor.source === 'month' ? 'Дата рассчитана от месяца запуска, нужна точная дата склада' : '',
      anchor.source === 'fallback' || String(anchor.source || '').includes('fallback') ? 'Использована резервная дата, уточните дату склада МП' : '',
      def.evidence ? `Результат: ${def.evidence}` : '',
      firstText(item, ['status']) ? `Статус новинки: ${item.status}` : ''
    ].filter(Boolean).join('\n');
    const now = new Date().toISOString();

    return {
      id: stableId('task-launch-auto', code),
      source: 'auto',
      autoCode: code,
      launchAutoKey: code,
      launchId: key,
      articleKey: article,
      title,
      entityLabel: productName,
      nextAction: def.nextAction,
      reason: context,
      owner: ownerForRole(item, def.role),
      due,
      status,
      type: 'launch',
      priority: def.priority || 'medium',
      platform,
      createdAt: now,
      updatedAt: now,
      generatedBy: VERSION
    };
  }

  function plannedTasksForLaunch(item) {
    const key = launchId(item);
    return PROCESS_TASKS.map((def) => {
      const suppressed = isLaunchOpsSuppressed(key, def.id);
      const existing = suppressed ? null : existingTaskFor(key, def.id);
      const payload = taskPayload(item, def);
      return { def, payload, existing, suppressed, launch: item };
    });
  }

  function missingTasksForLaunch(item) {
    return plannedTasksForLaunch(item).filter((entry) => !entry.existing && !entry.suppressed);
  }

  function missingTasksForAll() {
    return launchItems().flatMap((item) => missingTasksForLaunch(item));
  }

  function taskScore(entry) {
    const due = entry.payload.due;
    const diff = due ? dayDiff(due) : 999;
    const priority = entry.payload.priority === 'critical' ? 300 : entry.payload.priority === 'high' ? 200 : 100;
    const dateScore = !due ? 20 : diff < 0 ? 220 + Math.min(90, Math.abs(diff)) : diff <= 7 ? 170 - diff : Math.max(0, 60 - diff);
    const ownerPenalty = entry.payload.owner ? 0 : 35;
    return priority + dateScore + ownerPenalty;
  }

  function storageTasks() {
    const stateRef = appState();
    stateRef.storage = stateRef.storage && typeof stateRef.storage === 'object' ? stateRef.storage : {};
    stateRef.storage.tasks = Array.isArray(stateRef.storage.tasks) ? stateRef.storage.tasks : [];
    return stateRef.storage.tasks;
  }

  function storageComments() {
    const stateRef = appState();
    stateRef.storage = stateRef.storage && typeof stateRef.storage === 'object' ? stateRef.storage : {};
    stateRef.storage.comments = Array.isArray(stateRef.storage.comments) ? stateRef.storage.comments : [];
    return stateRef.storage.comments;
  }

  function commentId(seed = '') {
    if (typeof window.uid === 'function') return window.uid('comment');
    return stableId('comment-launch-auto', `${seed}|${Date.now()}|${Math.random().toString(36).slice(2, 8)}`);
  }

  function taskSourceKey(task = {}) {
    const source = String(task.source || '').trim().toLowerCase();
    const id = String(task.id || '').trim().toLowerCase();
    return source === 'auto' || task.autoCode || id.startsWith('auto-') ? 'auto' : 'manual';
  }

  function persistTaskLater(task) {
    try {
      const fn = window.persistTask || (typeof persistTask === 'function' ? persistTask : null);
      if (typeof fn === 'function') Promise.resolve(fn(task)).catch((error) => console.warn('[launch-autotasks] persist task', error));
    } catch (error) {
      console.warn('[launch-autotasks] persist task', error);
    }
  }

  function persistCommentLater(comment) {
    try {
      const fn = window.persistComment || (typeof persistComment === 'function' ? persistComment : null);
      if (typeof fn === 'function') Promise.resolve(fn(comment)).catch((error) => console.warn('[launch-autotasks] persist comment', error));
    } catch (error) {
      console.warn('[launch-autotasks] persist comment', error);
    }
  }

  function createTaskHistory(task, entry) {
    if (!task?.id) return null;
    const comments = storageComments();
    const marker = `[[task:${task.id}]]`;
    if (comments.some((comment) => String(comment?.text || '').includes(marker) && String(comment?.text || '').includes('[[kind:created]]'))) return null;
    const message = [
      '\u0410\u0432\u0442\u043e\u0437\u0430\u0434\u0430\u0447\u0430 \u0441\u043e\u0437\u0434\u0430\u043d\u0430 \u0438\u0437 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044f \u043d\u043e\u0432\u0438\u043d\u043e\u043a.',
      entry?.def?.phaseLabel ? `\u042d\u0442\u0430\u043f: ${entry.def.phaseLabel}.` : '',
      task.due ? `\u0421\u0440\u043e\u043a: ${task.due}.` : '\u0421\u0440\u043e\u043a \u043d\u0443\u0436\u043d\u043e \u0443\u0442\u043e\u0447\u043d\u0438\u0442\u044c.'
    ].filter(Boolean).join(' ');
    const comment = {
      id: commentId(`${task.id}|created`),
      articleKey: task.articleKey || '',
      author: appState()?.team?.member?.name || task.owner || '\u041a\u043e\u043c\u0430\u043d\u0434\u0430',
      team: appState()?.team?.member?.name || '\u041a\u043e\u043c\u0430\u043d\u0434\u0430',
      type: 'task_log',
      text: `${marker} [[kind:created]] ${message}`,
      createdAt: new Date().toISOString()
    };
    comments.unshift(comment);
    persistCommentLater(comment);
    return comment;
  }

  function backfillLaunchTaskHistory() {
    const tasks = allKnownTasks().filter((task) => (
      task
      && !isRemoved(task)
      && String(task.autoCode || '').startsWith('launch_ops:')
    ));
    let created = 0;
    tasks.forEach((task) => {
      if (createTaskHistory(task, null)) created += 1;
    });
    if (created) saveState('launch-autotasks-history-backfill');
  }

  function createTasks(entries, limit = Number.POSITIVE_INFINITY) {
    const created = [];
    const candidates = entries
      .filter((entry) => entry && !entry.existing)
      .sort((left, right) => taskScore(right) - taskScore(left));
    const tasks = storageTasks();
    for (const entry of candidates) {
      if (created.length >= limit) break;
      const freshExisting = existingTaskFor(launchId(entry.launch), entry.def.id);
      if (freshExisting) continue;
      const task = { ...entry.payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      tasks.unshift(task);
      created.push(task);
      createTaskHistory(task, entry);
      persistTaskLater(task);
    }
    if (created.length) saveState('launch-autotasks-create');
    return created;
  }

  function saveState(reason) {
    knownTasksCache = null;
    let usedPortalSave = false;
    try {
      if (typeof window.saveLocalStorage === 'function') {
        window.saveLocalStorage({ reason });
        usedPortalSave = true;
      } else if (typeof saveLocalStorage === 'function') {
        saveLocalStorage({ reason });
        usedPortalSave = true;
      }
    } catch (error) {
      console.warn('[launch-autotasks] save', error);
    }
    if (!usedPortalSave) try {
      window.dispatchEvent(new CustomEvent('altea:portal-storage-updated', { detail: { source: reason || VERSION } }));
    } catch {}
  }

  function taskIdentity(task = {}) {
    return String(task.id || task.autoCode || task.launchAutoKey || '').trim();
  }

  function taskDue(task = {}) {
    return parseDateKey(task.due || task.startDate || task.date) || '';
  }

  function statusLabel(value) {
    const key = String(value || 'new').trim();
    return (TASK_STATUSES.find(([status]) => status === key) || TASK_STATUSES[0])[1];
  }

  function priorityLabel(value) {
    const key = String(value || 'medium').trim();
    return (TASK_PRIORITIES.find(([priority]) => priority === key) || TASK_PRIORITIES[2])[1];
  }

  function optionHtml(options, selected) {
    return options.map(([value, label]) => (
      `<option value="${html(value)}" ${String(selected || '') === value ? 'selected' : ''}>${html(label)}</option>`
    )).join('');
  }

  function findKnownTask(taskId) {
    const id = String(taskId || '').trim();
    if (!id) return null;
    return allKnownTasks().find((task) => {
      if (!task || isRemoved(task)) return false;
      return taskIdentity(task) === id
        || String(task.autoCode || '').trim() === id
        || String(task.launchAutoKey || '').trim() === id;
    }) || null;
  }

  function findLaunchById(launchKey) {
    const key = String(launchKey || '').trim();
    return launchItems({ skipMarketplaceScope: true }).find((item) => launchId(item) === key) || null;
  }

  function taskLaunchItem(task = {}) {
    const key = String(task.launchId || '').trim();
    if (key) {
      const byKey = findLaunchById(key);
      if (byKey) return byKey;
    }
    const article = String(task.articleKey || '').trim();
    return launchItems({ skipMarketplaceScope: true }).find((item) => article && articleKey(item) === article) || null;
  }

  function ensureTaskInStorage(task) {
    if (!task) return null;
    const tasks = storageTasks();
    const id = taskIdentity(task);
    const code = String(task.autoCode || task.launchAutoKey || '').trim();
    let stored = tasks.find((item) => {
      if (!item) return false;
      return (id && taskIdentity(item) === id)
        || (code && String(item.autoCode || item.launchAutoKey || '').trim() === code);
    });
    if (!stored) {
      stored = {
        ...task,
        id: id || stableId('task-launch-edit', JSON.stringify(task)),
        source: task.source || 'auto',
        status: task.status || 'new',
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      tasks.unshift(stored);
    }
    return stored;
  }

  function addTaskLog(task, text) {
    if (!task?.id || !String(text || '').trim()) return null;
    const comment = {
      id: commentId(`${task.id}|manual-edit`),
      articleKey: task.articleKey || '',
      author: appState()?.team?.member?.name || task.owner || 'Команда',
      team: appState()?.team?.member?.name || 'Команда',
      type: 'task_log',
      text: `[[task:${task.id}]] [[kind:edit]] ${String(text || '').trim()}`,
      createdAt: new Date().toISOString()
    };
    storageComments().unshift(comment);
    persistCommentLater(comment);
    return comment;
  }

  function saveTaskPatch(taskId, patch, logText = '') {
    const task = ensureTaskInStorage(findKnownTask(taskId));
    if (!task) return null;
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    if (isClosed(task)) {
      const recordAutoTombstone = window.recordAutoTaskTombstone || window.recordLaunchAutoTaskTombstone;
      if (typeof recordAutoTombstone === 'function') {
        try { recordAutoTombstone(task); } catch (error) { console.warn('[launch-autotasks] tombstone', error); }
      }
    }
    if (logText) addTaskLog(task, logText);
    persistTaskLater(task);
    saveState('launch-task-modal-save');
    return task;
  }

  function taskHistoryHtml(task) {
    const marker = `[[task:${task?.id || ''}]]`;
    return storageComments()
      .filter((comment) => marker && String(comment?.text || '').includes(marker))
      .slice(0, 5)
      .map((comment) => {
        const text = String(comment.text || '')
          .replace(marker, '')
          .replace(/\[\[kind:[^\]]+\]\]/g, '')
          .trim();
        return `<span><b>${html(String(comment.createdAt || '').slice(0, 10) || 'без даты')}</b>${html(text || 'История обновлена')}</span>`;
      }).join('') || '<p>Истории пока нет.</p>';
  }

  function closeLaunchOpsModal() {
    document.querySelectorAll('[data-launch-ops-modal]').forEach((node) => node.remove());
    document.body.classList.remove('launch-ops-modal-open');
  }

  function openLaunchOpsModal(content) {
    closeLaunchOpsModal();
    const modal = document.createElement('div');
    modal.className = 'launch-ops-modal-back';
    modal.setAttribute('data-launch-ops-modal', '');
    modal.innerHTML = `
      <section class="launch-ops-modal" role="dialog" aria-modal="true">
        <button type="button" class="launch-ops-modal-x" data-launch-modal-close aria-label="Закрыть">×</button>
        ${content}
      </section>
    `;
    modal.addEventListener('submit', (event) => {
      const form = event.target?.closest?.('[data-launch-task-form]');
      if (!form) return;
      event.preventDefault();
      saveLaunchTaskForm(form);
    }, true);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeLaunchOpsModal();
    });
    modal.__launchOpsEsc = (event) => {
      if (event.key === 'Escape') closeLaunchOpsModal();
    };
    document.addEventListener('keydown', modal.__launchOpsEsc, { once: true });
    document.body.appendChild(modal);
    document.body.classList.add('launch-ops-modal-open');
  }

  function taskMetaHtml(task) {
    const launch = taskLaunchItem(task);
    return `
      <div class="launch-ops-modal-meta">
        <span><b>Новинка</b>${html(task.entityLabel || (launch ? launchName(launch) : 'без привязки'))}</span>
        <span><b>Площадка</b>${html(task.platform ? (LAUNCH_MARKETPLACE_LABELS[task.platform] || task.platform) : (launch ? launchMarketplaceLabel(launch) : 'не указана'))}</span>
        <span><b>Owner</b>${html(task.owner || 'без owner')}</span>
        <span><b>Срок</b>${html(taskDue(task) || 'без даты')}</span>
      </div>
    `;
  }

  function openLaunchTaskModal(taskId) {
    const task = findKnownTask(taskId);
    if (!task) {
      launchToast('Задача не найдена в календаре.');
      return false;
    }
    const stored = ensureTaskInStorage(task);
    const due = taskDue(stored);
    openLaunchOpsModal(`
      <header class="launch-ops-modal-head">
        <span>Задача запуска</span>
        <h2>${html(shortTaskTitle(stored))}</h2>
        <p>${html(stored.nextAction || stored.reason || 'Можно сразу поправить срок, owner, статус и следующий шаг.')}</p>
      </header>
      ${taskMetaHtml(stored)}
      <form class="launch-ops-task-form" data-launch-task-form data-launch-task-id="${html(stored.id || taskIdentity(stored))}">
        <label class="wide"><span>Название</span><input name="title" value="${html(stored.title || '')}"></label>
        <label><span>Owner</span><input name="owner" value="${html(stored.owner || '')}" placeholder="Кому задача"></label>
        <label><span>Срок</span><input name="due" type="date" value="${html(due)}"></label>
        <label><span>Статус</span><select name="status">${optionHtml(TASK_STATUSES, stored.status || 'new')}</select></label>
        <label><span>Приоритет</span><select name="priority">${optionHtml(TASK_PRIORITIES, stored.priority || 'medium')}</select></label>
        <label class="wide"><span>Что сделать</span><textarea name="nextAction" rows="3">${html(stored.nextAction || '')}</textarea></label>
        <label class="wide"><span>Контекст / комментарий</span><textarea name="reason" rows="4">${html(stored.reason || '')}</textarea></label>
        <div class="launch-ops-modal-actions wide">
          <button type="button" data-launch-task-status="in_progress">В работу</button>
          <button type="button" data-launch-task-status="waiting_team">Ждет команду</button>
          <button type="button" data-launch-task-status="done">Готово</button>
          <button type="button" data-launch-task-open-pool>Открыть пул задач</button>
          <button type="submit" class="primary" data-launch-task-save>Сохранить</button>
        </div>
      </form>
      <section class="launch-ops-modal-history">
        <strong>История</strong>
        ${taskHistoryHtml(stored)}
      </section>
    `);
    window.setTimeout(() => {
      document.querySelector('[data-launch-task-form] input[name="title"]')?.focus();
    }, 20);
    return true;
  }

  function saveLaunchTaskForm(form) {
    if (!form) return null;
    const taskId = form.dataset.launchTaskId || '';
    const data = new FormData(form);
    const patch = {
      title: String(data.get('title') || '').trim() || 'Задача запуска',
      owner: String(data.get('owner') || '').trim(),
      due: String(data.get('due') || '').trim(),
      status: String(data.get('status') || 'new').trim(),
      priority: String(data.get('priority') || 'medium').trim(),
      nextAction: String(data.get('nextAction') || '').trim(),
      reason: String(data.get('reason') || '').trim()
    };
    const saved = saveTaskPatch(taskId, patch, `Задача обновлена из календаря новинок. Статус: ${statusLabel(patch.status)}.`);
    if (saved) {
      launchToast('Задача сохранена.');
      rerenderLaunchesSoon();
      window.setTimeout(() => openLaunchTaskModal(saved.id), 80);
    }
    return saved;
  }

  function updateLaunchTaskStatus(form, status) {
    const taskId = form?.dataset?.launchTaskId || '';
    const task = saveTaskPatch(taskId, { status: String(status || 'new') }, `Статус изменен на "${statusLabel(status)}".`);
    if (task) {
      launchToast(`Статус: ${statusLabel(status)}.`);
      rerenderLaunchesSoon();
      window.setTimeout(() => openLaunchTaskModal(task.id), 80);
    }
    return task;
  }

  function queueItemsForKey(key, items = launchItems()) {
    const queueKey = String(key || '').trim();
    if (queueKey === 'noOwner') return items.filter((item) => !ownerForRole(item, 'product'));
    if (queueKey === 'noExactDate') return items.filter((item) => firstStockDateInfo(item).source !== 'exact');
    if (queueKey === 'noProductFile') return items.filter((item) => !firstText(item, ['productFileUrl', 'productFile', 'briefUrl', 'presentationUrl', 'fileUrl']));
    if (queueKey === 'noMarketplace') return items.filter((item) => !String(item.marketplaces || item.marketplace || '').trim());
    if (queueKey === 'waitMp') return items.filter((item) => !mpStockDateInfo(item).date);
    return [];
  }

  function launchQueueActionHint(item, key) {
    if (key === 'noOwner') return 'Назначьте product owner, чтобы автозадачи ушли конкретному человеку.';
    if (key === 'noExactDate') return 'Уточните первую дату склада, иначе сроки считаются грубо от месяца.';
    if (key === 'noProductFile') return 'Добавьте продукт-файл или ссылку, чтобы команда видела вводные.';
    if (key === 'noMarketplace') return 'Укажите сеть запуска, иначе фильтры по площадкам будут путаться.';
    if (key === 'waitMp') return 'Заполните дату склада МП, от нее зависят КЗ/РОП/РК сигналы.';
    return launchName(item);
  }

  function launchPositionCardHtml(item, key) {
    const id = launchId(item);
    const missing = missingTasksForLaunch(item).length;
    const planned = plannedTasksForLaunch(item);
    const created = planned.length - missing;
    return `
      <article class="launch-ops-position-card">
        <div>
          <span>${html(launchMarketplaceLabel(item) || 'площадка не указана')}</span>
          <strong>${html(launchName(item))}</strong>
          <small>${html(launchQueueActionHint(item, key))}</small>
        </div>
        <dl>
          <span><dt>Owner</dt><dd>${html(ownerForRole(item, 'product') || 'нет owner')}</dd></span>
          <span><dt>Склад</dt><dd>${html(firstStockDateInfo(item).date || 'нет точной даты')}</dd></span>
          <span><dt>Задачи</dt><dd>${html(created)}/${html(planned.length)} создано</dd></span>
        </dl>
        <footer>
          <button type="button" data-launch-queue-select="${html(id)}">Выбрать</button>
          <button type="button" data-launch-queue-create="${html(id)}" ${missing ? '' : 'disabled'}>Создать ${html(missing || '')}</button>
          <button type="button" data-launch-queue-open="${html(id)}">Показать задачи</button>
        </footer>
      </article>
    `;
  }

  function openQueueModal(key) {
    const rows = launchQueueRows(launchItems());
    const row = rows.find((item) => item.key === key) || { label: 'Очередь контроля', hint: 'Позиции, требующие действия' };
    const items = queueItemsForKey(key);
    openLaunchOpsModal(`
      <header class="launch-ops-modal-head">
        <span>Очередь контроля</span>
        <h2>${html(row.label)}</h2>
        <p>${html(row.hint)}. Нажмите позицию и сделайте действие сразу, не уходя из календаря.</p>
      </header>
      <div class="launch-ops-position-list">
        ${items.length ? items.map((item) => launchPositionCardHtml(item, key)).join('') : '<p>В этой очереди сейчас нет позиций.</p>'}
      </div>
    `);
    return items;
  }

  function launchTasksModalListHtml(item) {
    const planned = plannedTasksForLaunch(item);
    return planned.map((entry) => {
      const task = entry.existing || null;
      const closedByUser = Boolean(entry.suppressed && !task);
      const stateLabel = closedByUser ? 'Закрыта' : task ? statusLabel(task.status || 'new') : 'Не создана';
      return `
        <article class="launch-ops-task-row ${task || closedByUser ? 'ready' : 'missing'}">
          <div>
            <span>${html(entry.def.phaseLabel)} · ${html(ROLE_LABELS[entry.def.role] || '')}</span>
            <strong>${html(entry.def.title)}</strong>
            <small>${html((task && taskDue(task)) || entry.payload.due || 'без даты')} · ${html(stateLabel)}</small>
          </div>
          <footer>
            ${closedByUser ? '<button type="button" disabled>Закрыта</button>' : task ? `<button type="button" data-launch-ops-open-task="${html(task.id || taskIdentity(task))}">Открыть</button>` : `<button type="button" data-launch-ops-create-one="${html(entry.def.id)}" data-launch-ops-launch="${html(launchId(item))}">Создать</button>`}
          </footer>
        </article>
      `;
    }).join('');
  }

  function openLaunchTasksModal(launchKey) {
    const item = findLaunchById(launchKey);
    if (!item) {
      launchToast('Новинка не найдена.');
      return false;
    }
    appState().launchV1SelectedId = launchId(item);
    openLaunchOpsModal(`
      <header class="launch-ops-modal-head">
        <span>Пул задач по новинке</span>
        <h2>${html(launchName(item))}</h2>
        <p>${html(launchMarketplaceLabel(item) || 'площадка не указана')} · ${html(firstStockDateInfo(item).date || 'без точной даты склада')}</p>
      </header>
      <div class="launch-ops-task-list">
        ${launchTasksModalListHtml(item)}
      </div>
    `);
    rerenderLaunchesSoon();
    return true;
  }

  function openDayTasksModal(day) {
    const tasks = launchAutoTasksForCalendar()
      .filter((task) => taskDue(task) === day)
      .sort((left, right) => String(shortTaskTitle(left)).localeCompare(String(shortTaskTitle(right)), 'ru'));
    openLaunchOpsModal(`
      <header class="launch-ops-modal-head">
        <span>Задачи дня</span>
        <h2>${html(day || 'без даты')}</h2>
        <p>Все задачи запуска, которые стоят на это число.</p>
      </header>
      <div class="launch-ops-task-list">
        ${tasks.length ? tasks.map((task) => `
          <article class="launch-ops-task-row ready">
            <div>
              <span>${html(task.entityLabel || 'Новинка')}</span>
              <strong>${html(shortTaskTitle(task))}</strong>
              <small>${html(statusLabel(task.status || 'new'))} · ${html(task.owner || 'без owner')}</small>
            </div>
            <footer><button type="button" data-launch-ops-open-task="${html(task.id || taskIdentity(task))}">Открыть</button></footer>
          </article>
        `).join('') : '<p>Задач на этот день не найдено.</p>'}
      </div>
    `);
    return tasks;
  }

  function snapshot() {
    const stateRef = appState();
    const storage = stateRef.storage || {};
    const items = launchItems();
    const cacheKey = [
      items.length,
      Array.isArray(storage.tasks) ? storage.tasks.length : 0,
      Array.isArray(storage.launchOverrides) ? storage.launchOverrides.length : 0,
      Array.isArray(storage.launchDeletedIds) ? storage.launchDeletedIds.length : 0,
      Array.isArray(storage.launchAutoTaskTombstones) ? storage.launchAutoTaskTombstones.length : 0
    ].join(':');
    const now = Date.now();
    if (opsSnapshotCache && opsSnapshotCache.key === cacheKey && now - opsSnapshotCache.at < SNAPSHOT_CACHE_MS) {
      return opsSnapshotCache.data;
    }
    const missing = missingTasksForAll();
    const exactDateMissing = items.filter((item) => firstStockDateInfo(item).source !== 'exact').length;
    const noOwner = items.filter((item) => !ownerForRole(item, 'product')).length;
    const noMarketplace = items.filter((item) => !String(item.marketplaces || item.marketplace || '').trim()).length;
    const dueSoon = missing.filter((entry) => entry.payload.due && dayDiff(entry.payload.due) <= 7).length;
    const overdue = missing.filter((entry) => entry.payload.due && dayDiff(entry.payload.due) < 0).length;
    const data = { items, missing, exactDateMissing, noOwner, noMarketplace, dueSoon, overdue };
    opsSnapshotCache = { key: cacheKey, at: now, data };
    return data;
  }

  function selectedLaunch() {
    const selectedId = String(appState().launchV1SelectedId || '').trim();
    return launchItems().find((item) => launchId(item) === selectedId) || launchItems()[0] || null;
  }

  function launchQueueRows(items) {
    const rows = [];
    const noOwner = items.filter((item) => !ownerForRole(item, 'product'));
    const noExactDate = items.filter((item) => firstStockDateInfo(item).source !== 'exact');
    const noProductFile = items.filter((item) => !firstText(item, ['productFileUrl', 'productFile', 'briefUrl', 'presentationUrl', 'fileUrl']));
    const noMarketplace = items.filter((item) => !String(item.marketplaces || item.marketplace || '').trim());
    const waitMp = items.filter((item) => !mpStockDateInfo(item).date);
    [
      ['noOwner', 'Нет owner', noOwner.length, 'Кому уйдут задачи запуска', 'danger'],
      ['noExactDate', 'Нет точной даты склада', noExactDate.length, 'Сроки считаются от месяца, нужна дата', 'warn'],
      ['noProductFile', 'Нет продакт-файла', noProductFile.length, 'Нужно вложить или указать ссылку', 'warn'],
      ['noMarketplace', 'Нет площадки', noMarketplace.length, 'Укажите площадку запуска: WB/Ozon/Я.Маркет/ЗЯ/Лэтуаль/Мегамаркет/Самокат/Магнит', 'info'],
      ['waitMp', 'Ждет дату склада МП', waitMp.length, 'Сигналы КЗ/РОП/РК зависят от поступления', 'info']
    ].forEach(([key, label, count, hint, tone]) => {
      if (count) rows.push({ key, label, count, hint, tone });
    });
    return rows;
  }

  function renderOpsPanel() {
    const data = snapshot();
    const selected = selectedLaunch();
    const selectedMissing = selected ? missingTasksForLaunch(selected) : [];
    const queue = launchQueueRows(data.items);
    return `
      <section class="launch-ops-panel" data-launch-ops-panel>
        <div class="launch-ops-head">
          <div>
            <span>Процесс и автозадачи</span>
            <strong>Запуск новинки по Excel</strong>
          </div>
          <div class="launch-ops-actions">
            <button type="button" data-launch-ops-action="selected" data-launch-ops-create-selected ${selectedMissing.length ? '' : 'disabled'}>Создать по выбранной</button>
            <button type="button" data-launch-ops-action="bulk" data-launch-ops-create-bulk ${data.missing.length ? '' : 'disabled'}>Создать пакет ${Math.min(MAX_BULK_TASKS, data.missing.length)}</button>
            <button type="button" data-launch-ops-action="open" data-launch-ops-open-tasks>Открыть задачи</button>
          </div>
        </div>
        <div class="launch-ops-kpis">
          ${[
            ['Новинки', data.items.length, 'в календаре'],
            ['Нужно задач', data.missing.length, 'не создано'],
            ['Срочно', data.dueSoon, 'срок 7 дней'],
            ['Просрочено', data.overdue, 'по расчету'],
            ['Без точной даты', data.exactDateMissing, 'нужна дата склада']
          ].map(([label, value, hint]) => `
            <span>
              <em>${html(label)}</em>
              <strong>${html(value)}</strong>
              <small>${html(hint)}</small>
            </span>
          `).join('')}
        </div>
        <div class="launch-ops-body">
          <div class="launch-ops-queue">
            <strong>Очереди контроля</strong>
            ${queue.length ? queue.slice(0, 5).map((row) => `
              <button type="button" class="${html(row.tone)}" data-launch-ops-filter="${html(row.label)}" data-launch-ops-queue="${html(row.key)}">
                <i></i>
                <span>${html(row.label)}<small>${html(row.hint)}</small></span>
                <b>${html(row.count)}</b>
              </button>
            `).join('') : '<p>Критичных дыр по паспорту не видно.</p>'}
          </div>
          <div class="launch-ops-selected">
            <strong>Выбранная новинка</strong>
            ${selected ? `
              <p>${html(launchName(selected))}</p>
              <small>${html(selectedMissing.length ? `${selectedMissing.length} автозадач можно создать` : 'все автозадачи по шаблону уже созданы')}</small>
              <div>
                ${selectedMissing.slice(0, 6).map((entry) => `
                  <button type="button" data-launch-ops-action="one" data-launch-ops-create-one="${html(entry.def.id)}" data-launch-ops-launch="${html(launchId(selected))}">
                    <span>${html(entry.def.phaseLabel)}</span>
                    <strong>${html(entry.def.title)}</strong>
                    <em>${html(entry.payload.due || 'без даты')} · ${html(ROLE_LABELS[entry.def.role] || '')}</em>
                  </button>
                `).join('') || '<p>Новых задач по выбранной новинке нет.</p>'}
              </div>
            ` : '<p>Выберите новинку в календаре.</p>'}
          </div>
        </div>
      </section>
    `;
  }

  function renderOpsPanelShell() {
    return `
      <section class="launch-ops-panel loading" data-launch-ops-panel>
        <div class="launch-ops-head">
          <div>
            <span>Процесс и автозадачи</span>
            <strong>Готовим задачи запуска</strong>
          </div>
          <div class="launch-ops-actions">
            <button type="button" data-launch-ops-action="open" data-launch-ops-open-tasks>Открыть задачи</button>
          </div>
        </div>
        <div class="launch-ops-kpis">
          ${['Новинки', 'Нужно задач', 'Срочно', 'Просрочено', 'Без точной даты'].map((label) => `
            <span>
              <em>${html(label)}</em>
              <strong>...</strong>
              <small>считаем без блокировки</small>
            </span>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderSelectedOpsBlock(item) {
    if (!item) return '';
    const planned = plannedTasksForLaunch(item);
    const missing = planned.filter((entry) => !entry.existing && !entry.suppressed);
    const doneCount = planned.length - missing.length;
    return `
      <div class="launch-ops-detail" data-launch-ops-detail>
        <div>
          <strong>Автопроцесс запуска</strong>
          <span>${doneCount}/${planned.length} создано</span>
        </div>
        <div class="launch-ops-detail-grid">
          ${planned.slice(0, 8).map((entry) => `
            <span class="${entry.existing || entry.suppressed ? 'ok' : entry.payload.due && dayDiff(entry.payload.due) < 0 ? 'danger' : 'warn'}">
              <i></i>
              <b>${html(entry.def.phaseLabel)}</b>
              <em>${html(entry.payload.due || 'без даты')}</em>
            </span>
          `).join('')}
        </div>
        <button type="button" data-launch-ops-action="selected" data-launch-ops-create-selected ${missing.length ? '' : 'disabled'}>${missing.length ? 'Создать недостающие по этой новинке' : 'Все автозадачи созданы'}</button>
      </div>
    `;
  }

  function launchAutoTasksForCalendar() {
    const marketplace = activeMarketplaceKey();
    const visibleLaunches = new Set(launchItems().map((item) => launchId(item)));
    if (marketplace !== 'all' && !visibleLaunches.size) return [];
    return allKnownTasks().filter((task) => {
      if (!task || isRemoved(task)) return false;
      if (isClosed(task)) return false;
      if (!String(task.autoCode || '').startsWith('launch_ops:')) return false;
      if (!parseDateKey(task.due || task.startDate || task.date)) return false;
      const key = String(task.launchId || '').trim();
      if (!key) return marketplace === 'all';
      return visibleLaunches.has(key);
    });
  }

  function shortTaskTitle(task = {}) {
    const title = String(task.title || task.nextAction || '\u0410\u0432\u0442\u043e\u0437\u0430\u0434\u0430\u0447\u0430').trim();
    const entity = String(task.entityLabel || '').trim();
    return entity && title.startsWith(`${entity}:`) ? title.slice(entity.length + 1).trim() : title;
  }

  function injectTaskChipsIntoCalendar(root) {
    if (!root) return;
    root.querySelectorAll('.launch-ops-task-chip,.launch-ops-task-more').forEach((node) => node.remove());
    const tasksByDay = new Map();
    launchAutoTasksForCalendar().forEach((task) => {
      const due = parseDateKey(task.due || task.startDate || task.date);
      if (!due) return;
      if (!tasksByDay.has(due)) tasksByDay.set(due, []);
      tasksByDay.get(due).push(task);
    });
    root.querySelectorAll('[data-launch-v1-day]').forEach((dayNode) => {
      const day = dayNode.dataset.launchV1Day || '';
      const tasks = (tasksByDay.get(day) || []).sort((left, right) => {
        const leftScore = taskSourceKey(left) === 'auto' ? 0 : 1;
        const rightScore = taskSourceKey(right) === 'auto' ? 0 : 1;
        return leftScore - rightScore || String(left.title || '').localeCompare(String(right.title || ''), 'ru');
      });
      if (!tasks.length) return;
      const holder = Array.from(dayNode.children).find((node) => node.tagName === 'DIV') || dayNode;
      tasks.slice(0, 3).forEach((task) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `launch-ops-task-chip ${dayDiff(day) < 0 ? 'danger' : ''}`;
        button.dataset.launchOpsOpenTask = String(task.id || '');
        button.title = String(task.title || '');
        button.innerHTML = `<span>${html(shortTaskTitle(task))}</span>`;
        holder.appendChild(button);
      });
      if (tasks.length > 3) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'launch-ops-task-more';
        more.dataset.launchOpsDay = day;
        more.title = `Показать все задачи на ${day}`;
        more.textContent = `+\u0435\u0449\u0435 ${tasks.length - 3} \u0437\u0430\u0434\u0430\u0447`;
        holder.appendChild(more);
      }
    });
  }

  function injectStyles() {
    if (document.getElementById('launch-autotasks-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'launch-autotasks-v1-style';
    style.textContent = `
      .launch-ops-panel{position:relative;z-index:30;pointer-events:auto;border:1px solid rgba(224,190,126,.18);border-radius:10px;background:linear-gradient(145deg,rgba(18,12,7,.72),rgba(9,17,25,.52));box-shadow:inset 0 1px 0 rgba(255,255,255,.04);padding:16px;display:grid;gap:14px;color:var(--sl-text,#f7f1e8)}
      .launch-ops-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
      .launch-ops-head span,.launch-ops-kpis em,.launch-ops-selected small,.launch-ops-queue small,.launch-ops-detail span,.launch-ops-detail em{font-size:11px;color:var(--sl-muted,rgba(247,241,232,.62));font-style:normal}
      .launch-ops-head strong{display:block;font-size:20px;margin-top:2px}
      .launch-ops-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .launch-ops-actions button,.launch-ops-detail>button{position:relative;z-index:31;pointer-events:auto;min-height:38px;border:1px solid rgba(224,190,126,.24);border-radius:8px;background:rgba(255,255,255,.035);color:var(--sl-text,#f7f1e8);padding:0 12px;font-weight:800;cursor:pointer}
      .launch-ops-actions button:first-child,.launch-ops-detail>button{background:linear-gradient(180deg,#ffe1a1,#b98536);color:#130d07;border-color:rgba(255,227,157,.7)}
      .launch-ops-actions button:disabled,.launch-ops-detail>button:disabled{opacity:.48;cursor:not-allowed;filter:saturate(.4)}
      .launch-ops-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
      .launch-ops-kpis span{border:1px solid rgba(224,190,126,.13);border-radius:8px;background:rgba(0,0,0,.18);padding:10px 12px;display:grid;gap:3px;min-height:76px}
      .launch-ops-kpis strong{font-size:26px;line-height:1}
      .launch-ops-kpis small{font-size:11px;color:var(--sl-muted,rgba(247,241,232,.62))}
      .launch-ops-body{display:grid;grid-template-columns:minmax(260px,.75fr) minmax(320px,1fr);gap:12px}
      .launch-ops-queue,.launch-ops-selected,.launch-ops-detail{border-top:1px solid rgba(224,190,126,.12);padding-top:12px;display:grid;gap:8px}
      .launch-ops-queue button,.launch-ops-selected button{position:relative;width:100%;border:1px solid rgba(224,190,126,.2);border-radius:8px;background:linear-gradient(90deg,rgba(224,190,126,.055),rgba(5,5,5,.3));color:var(--sl-text,#f7f1e8);display:grid;grid-template-columns:10px minmax(0,1fr) auto 20px;gap:10px;align-items:center;text-align:left;padding:10px 10px;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.035);transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}
      .launch-ops-queue button::after,.launch-ops-selected button::after{content:"›";display:grid;place-items:center;width:20px;height:20px;border:1px solid rgba(224,190,126,.22);border-radius:999px;background:rgba(224,190,126,.08);color:#f0d49a;font-size:18px;line-height:1;transition:background .16s ease,border-color .16s ease,transform .16s ease}
      .launch-ops-queue button:hover,.launch-ops-queue button:focus-visible,.launch-ops-selected button:hover,.launch-ops-selected button:focus-visible{border-color:rgba(255,225,161,.62);background:linear-gradient(90deg,rgba(224,190,126,.14),rgba(28,19,11,.42));box-shadow:0 0 0 1px rgba(224,190,126,.18),0 10px 24px rgba(0,0,0,.22);transform:translateY(-1px);outline:none}
      .launch-ops-queue button:hover::after,.launch-ops-queue button:focus-visible::after,.launch-ops-selected button:hover::after,.launch-ops-selected button:focus-visible::after{background:#f0d49a;border-color:#ffe1a1;color:#130d07;transform:translateX(2px)}
      .launch-ops-queue button:active,.launch-ops-selected button:active{transform:translateY(0);box-shadow:inset 0 0 0 1px rgba(224,190,126,.25)}
      .launch-ops-selected button{grid-template-columns:minmax(0,1fr);padding-right:40px}
      .launch-ops-selected button::after{position:absolute;right:10px;top:50%;transform:translateY(-50%)}
      .launch-ops-selected button:hover::after,.launch-ops-selected button:focus-visible::after{transform:translateY(-50%) translateX(2px)}
      .launch-ops-queue i,.launch-ops-detail i{width:8px;height:8px;border-radius:50%;background:#f0d49a}
      .launch-ops-queue .danger i,.launch-ops-detail .danger i{background:#ff7469}.launch-ops-queue .warn i,.launch-ops-detail .warn i{background:#f0c469}.launch-ops-queue .info i{background:#58d6ca}.launch-ops-detail .ok i{background:#67d59a}
      .launch-ops-queue span,.launch-ops-selected button{display:grid;gap:2px}.launch-ops-queue b{color:#f0d49a}
      .launch-ops-selected p,.launch-ops-queue p{margin:0;color:var(--sl-muted,rgba(247,241,232,.62))}
      .launch-ops-selected>div{display:grid;gap:8px;max-height:258px;overflow:auto;padding-right:4px}
      .launch-ops-selected button span{font-size:10px;letter-spacing:0;text-transform:uppercase;color:#f0d49a}.launch-ops-selected button strong{font-size:12px}.launch-ops-selected button em{font-size:11px;color:var(--sl-muted,rgba(247,241,232,.62));font-style:normal}
      .launch-ops-detail{margin-top:12px}
      .launch-ops-detail>div:first-child{display:flex;justify-content:space-between;gap:10px;align-items:center}
      .launch-ops-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .launch-ops-detail-grid span{border:1px solid rgba(224,190,126,.13);border-radius:8px;padding:8px;background:rgba(0,0,0,.14);display:grid;grid-template-columns:10px minmax(0,1fr);gap:7px;align-items:center}
      .launch-ops-detail-grid b{font-size:11px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.launch-ops-detail-grid em{grid-column:2}
      .launch-ops-task-chip{position:relative;width:100%;display:grid;grid-template-columns:7px minmax(0,1fr);gap:7px;align-items:center;margin-top:5px;border:1px solid rgba(88,214,202,.28);border-radius:7px;background:linear-gradient(90deg,rgba(24,48,52,.42),rgba(8,16,18,.22));color:var(--sl-text,#f7f1e8);padding:6px 24px 6px 7px;text-align:left;font-size:10px;line-height:1.18;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.035);transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}
      .launch-ops-task-chip::before{content:"";width:7px;height:7px;border-radius:50%;background:#58d6ca;box-shadow:0 0 0 3px rgba(88,214,202,.12)}
      .launch-ops-task-chip::after{content:"›";position:absolute;right:7px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:14px;height:14px;border:1px solid rgba(88,214,202,.24);border-radius:999px;color:#58d6ca;font-size:13px;line-height:1;background:rgba(88,214,202,.08);transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease}
      .launch-ops-task-chip:hover,.launch-ops-task-chip:focus-visible{border-color:rgba(88,214,202,.72);background:linear-gradient(90deg,rgba(33,78,82,.48),rgba(12,25,29,.34));box-shadow:0 0 0 1px rgba(88,214,202,.18),0 8px 18px rgba(0,0,0,.2);transform:translateY(-1px);outline:none}
      .launch-ops-task-chip:hover::after,.launch-ops-task-chip:focus-visible::after{background:#58d6ca;border-color:#8ff2e8;color:#061214;transform:translateY(-50%) translateX(2px)}
      .launch-ops-task-chip.danger{border-color:rgba(255,116,105,.38);background:linear-gradient(90deg,rgba(62,24,22,.42),rgba(18,8,8,.25))}.launch-ops-task-chip.danger::before{background:#ff7469;box-shadow:0 0 0 3px rgba(255,116,105,.12)}.launch-ops-task-chip.danger::after{border-color:rgba(255,116,105,.24);color:#ff7469;background:rgba(255,116,105,.08)}
      .launch-ops-task-chip.danger:hover,.launch-ops-task-chip.danger:focus-visible{border-color:rgba(255,116,105,.74);background:linear-gradient(90deg,rgba(86,31,27,.52),rgba(24,10,9,.34));box-shadow:0 0 0 1px rgba(255,116,105,.16),0 8px 18px rgba(0,0,0,.2)}.launch-ops-task-chip.danger:hover::after,.launch-ops-task-chip.danger:focus-visible::after{background:#ff7469;border-color:#ff9f98;color:#150706}
      .launch-ops-task-chip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.launch-ops-task-more{display:block;width:100%;margin-top:5px;border:1px dashed rgba(224,190,126,.35);border-radius:7px;background:rgba(224,190,126,.045);color:#f0d49a;font-size:10px;text-align:left;padding:4px 22px 4px 7px;cursor:pointer;position:relative;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,color .16s ease}
      .launch-ops-task-more::after{content:"›";position:absolute;right:7px;top:50%;transform:translateY(-50%);color:#f0d49a;font-size:13px;line-height:1}.launch-ops-task-more:hover,.launch-ops-task-more:focus-visible{border-color:rgba(255,225,161,.68);background:rgba(224,190,126,.11);box-shadow:0 0 0 1px rgba(224,190,126,.13);outline:none}
      .launch-ops-modal-open{overflow:hidden}
      .launch-ops-modal-back{position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.62);backdrop-filter:blur(8px);display:grid;place-items:center;padding:24px;color:var(--sl-text,#f7f1e8)}
      .launch-ops-modal{position:relative;width:min(980px,calc(100vw - 32px));max-height:min(86vh,820px);overflow:auto;border:1px solid rgba(224,190,126,.28);border-radius:12px;background:linear-gradient(145deg,rgba(12,14,18,.98),rgba(18,10,8,.96));box-shadow:0 28px 90px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.05);padding:22px;display:grid;gap:16px}
      .launch-ops-modal-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border:1px solid rgba(224,190,126,.25);border-radius:9px;background:rgba(255,255,255,.04);color:var(--sl-text,#f7f1e8);font-size:22px;line-height:1;cursor:pointer}
      .launch-ops-modal-head{display:grid;gap:6px;padding-right:42px}.launch-ops-modal-head span{text-transform:uppercase;letter-spacing:2px;color:#f0d49a;font-size:11px;font-weight:900}.launch-ops-modal-head h2{margin:0;font-size:30px;line-height:1.08}.launch-ops-modal-head p{margin:0;color:var(--sl-muted,rgba(247,241,232,.66))}
      .launch-ops-modal-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.launch-ops-modal-meta span{border:1px solid rgba(224,190,126,.14);border-radius:8px;background:rgba(0,0,0,.2);padding:9px 10px;display:grid;gap:4px;min-width:0}.launch-ops-modal-meta b{font-size:10px;text-transform:uppercase;color:var(--sl-muted,rgba(247,241,232,.58))}.launch-ops-modal-meta span{font-size:12px}
      .launch-ops-task-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.launch-ops-task-form label{display:grid;gap:6px}.launch-ops-task-form label.wide,.launch-ops-modal-actions.wide{grid-column:1/-1}.launch-ops-task-form span{font-size:11px;text-transform:uppercase;color:#f0d49a;font-weight:900}.launch-ops-task-form input,.launch-ops-task-form select,.launch-ops-task-form textarea{width:100%;border:1px solid rgba(224,190,126,.22);border-radius:8px;background:rgba(0,0,0,.28);color:var(--sl-text,#f7f1e8);padding:10px 12px;font:inherit}.launch-ops-task-form textarea{resize:vertical}
      .launch-ops-modal-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.launch-ops-modal-actions button,.launch-ops-position-card footer button,.launch-ops-task-row footer button{min-height:36px;border:1px solid rgba(224,190,126,.24);border-radius:8px;background:rgba(255,255,255,.04);color:var(--sl-text,#f7f1e8);padding:0 12px;font-weight:850;cursor:pointer}.launch-ops-modal-actions button.primary,.launch-ops-position-card footer button:first-child{background:linear-gradient(180deg,#ffe1a1,#b98536);color:#130d07;border-color:rgba(255,227,157,.65)}.launch-ops-position-card footer button:disabled,.launch-ops-task-row footer button:disabled{opacity:.45;cursor:not-allowed}
      .launch-ops-modal-history,.launch-ops-position-list,.launch-ops-task-list{display:grid;gap:10px}.launch-ops-modal-history{border-top:1px solid rgba(224,190,126,.14);padding-top:12px}.launch-ops-modal-history span{display:grid;gap:3px;border:1px solid rgba(224,190,126,.1);border-radius:8px;background:rgba(0,0,0,.18);padding:9px 10px}.launch-ops-modal-history p,.launch-ops-position-list p,.launch-ops-task-list p{margin:0;color:var(--sl-muted,rgba(247,241,232,.62))}
      .launch-ops-position-list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:52vh;overflow:auto;padding-right:4px}.launch-ops-position-card,.launch-ops-task-row{border:1px solid rgba(224,190,126,.14);border-radius:9px;background:rgba(0,0,0,.22);padding:12px;display:grid;gap:10px}.launch-ops-position-card strong,.launch-ops-task-row strong{display:block;font-size:14px;line-height:1.25}.launch-ops-position-card span,.launch-ops-task-row span{font-size:10px;text-transform:uppercase;color:#f0d49a;font-weight:850}.launch-ops-position-card small,.launch-ops-task-row small{color:var(--sl-muted,rgba(247,241,232,.62));font-size:11px}.launch-ops-position-card dl{margin:0;display:grid;gap:6px}.launch-ops-position-card dl span{display:flex;justify-content:space-between;gap:10px;text-transform:none;color:inherit;font-weight:500}.launch-ops-position-card dt{color:var(--sl-muted,rgba(247,241,232,.62))}.launch-ops-position-card dd{margin:0;text-align:right}.launch-ops-position-card footer,.launch-ops-task-row footer{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
      .launch-ops-task-list{max-height:58vh;overflow:auto;padding-right:4px}.launch-ops-task-row{grid-template-columns:minmax(0,1fr) auto;align-items:center}.launch-ops-task-row.missing{border-color:rgba(240,196,105,.22)}.launch-ops-task-row.ready{border-color:rgba(88,214,202,.18)}
      @media (max-width:1100px){.launch-ops-head,.launch-ops-body{grid-template-columns:1fr;display:grid}.launch-ops-actions{justify-content:start}.launch-ops-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (max-width:720px){.launch-ops-kpis,.launch-ops-detail-grid,.launch-ops-modal-meta,.launch-ops-task-form,.launch-ops-position-list,.launch-ops-task-row{grid-template-columns:1fr}.launch-ops-modal{padding:18px}.launch-ops-modal-head h2{font-size:24px}}
    `;
    document.head.appendChild(style);
  }

  function queueHistoryBackfill() {
    if (historyBackfilled || historyBackfillQueued) return;
    historyBackfillQueued = true;
    const run = () => {
      historyBackfillQueued = false;
      historyBackfilled = true;
      try {
        backfillLaunchTaskHistory();
      } catch (error) {
        console.warn('[launch-autotasks] backfill', error);
      }
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1800 });
    else window.setTimeout(run, 240);
  }

  function queueOpsPanelRender() {
    if (opsPanelQueued) return;
    opsPanelQueued = true;
    const run = () => {
      opsPanelQueued = false;
      const root = document.getElementById('view-launches');
      if (!root || !root.querySelector('.launch-v1-shell')) return;
      const panel = root.querySelector('[data-launch-ops-panel]');
      if (!panel) return;
      try {
        panel.outerHTML = renderOpsPanel();
        hardwireOpsButtons(root);
        bindOpsEvents(root);
      } catch (error) {
        console.warn('[launch-autotasks] ops panel', error);
      }
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1600 });
    else window.setTimeout(run, 160);
  }

  function augmentLaunchView() {
    const root = document.getElementById('view-launches');
    if (!root || !root.querySelector('.launch-v1-shell')) return;
    queueHistoryBackfill();
    const oldPanel = root.querySelector('[data-launch-ops-panel]');
    if (oldPanel) oldPanel.remove();
    const kpis = root.querySelector('.launch-v1-kpis');
    if (kpis) {
      kpis.insertAdjacentHTML('afterend', renderOpsPanelShell());
      queueOpsPanelRender();
    }

    root.querySelectorAll('[data-launch-ops-detail]').forEach((node) => node.remove());
    const selected = selectedLaunch();
    const detail = root.querySelector('.launch-v1-detail');
    if (detail && selected) detail.insertAdjacentHTML('beforeend', renderSelectedOpsBlock(selected));

    injectTaskChipsIntoCalendar(root);
    hardwireOpsButtons(root);
    bindOpsEvents(root);
  }

  function refreshSelectedOpsDetail() {
    const root = document.getElementById('view-launches');
    if (!root || !root.querySelector('.launch-v1-shell')) return;
    root.querySelectorAll('[data-launch-ops-detail]').forEach((node) => node.remove());
    const selected = selectedLaunch();
    const detail = root.querySelector('.launch-v1-detail');
    if (detail && selected) detail.insertAdjacentHTML('beforeend', renderSelectedOpsBlock(selected));
    hardwireOpsButtons(root);
    bindOpsEvents(root);
  }

  function queueSelectedOpsDetail() {
    if (selectedDetailQueued) return;
    selectedDetailQueued = true;
    const run = () => {
      selectedDetailQueued = false;
      try {
        refreshSelectedOpsDetail();
      } catch (error) {
        console.warn('[launch-autotasks] selected detail', error);
      }
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else window.setTimeout(run, 0);
  }

  function openTasksView() {
    const stateRef = appState();
    stateRef.activeView = 'control';
    stateRef.controlFilters = stateRef.controlFilters || {};
    Object.assign(stateRef.controlFilters, {
      search: '',
      owner: 'all',
      status: 'active',
      type: 'launch',
      priority: 'all',
      platform: 'all',
      horizon: 'all',
      source: 'auto'
    });
    try {
      if (typeof window.invalidateControlTaskCache === 'function') window.invalidateControlTaskCache();
    } catch {}
    const activateDom = () => {
      try { stateRef.activeView = 'control'; } catch {}
      document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === 'view-control'));
      document.querySelectorAll('.nav-btn').forEach((button) => button.classList.toggle('active', button.dataset.view === 'control'));
      document.body.dataset.portalView = 'control';
    };
    const renderControl = () => {
      activateDom();
      try {
        if (window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__?.renderControl) {
          window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__.renderControl();
        } else if (typeof window.renderControlCenter === 'function') {
          window.renderControlCenter('view-control');
        }
      } catch (error) {
        console.warn('[launch-autotasks] open tasks render', error);
      }
    };
    try {
      if (typeof window.setView === 'function') window.setView('control');
      else window.location.hash = '#control';
    } catch {
      window.location.hash = '#control';
    }
    renderControl();
    try { history.replaceState(null, '', `${window.location.pathname}${window.location.search}#control`); } catch {}
    try { window.dispatchEvent(new CustomEvent('altea:viewchange', { detail: { view: 'control', source: VERSION } })); } catch {}
    [0, 80, 220, 600, 1200].forEach((delay) => {
      window.setTimeout(() => {
        renderControl();
      }, delay);
    });
  }

  function launchToast(message) {
    if (typeof window.setAppError === 'function') {
      window.setAppError(message);
      return;
    }
    const toast = document.createElement('div');
    toast.className = 'launch-ops-toast';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9999;padding:12px 14px;border-radius:8px;background:#17110b;color:#ffe1a1;border:1px solid rgba(224,190,126,.4);box-shadow:0 16px 38px rgba(0,0,0,.34);font:700 13px system-ui;';
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
  }

  function rerenderLaunchesSoon() {
    if (typeof window.renderLaunches === 'function') {
      window.setTimeout(() => window.renderLaunches('view-launches'), 80);
    } else {
      queueAugment();
    }
  }

  function createSelectedTasks() {
    const selected = selectedLaunch();
    if (!selected) return [];
    const created = createTasks(missingTasksForLaunch(selected), PROCESS_TASKS.length);
    launchToast(created.length ? `Создано задач по новинке: ${created.length}` : 'По выбранной новинке новых задач нет.');
    rerenderLaunchesSoon();
    return created;
  }

  function createBulkTasks() {
    const created = createTasks(missingTasksForAll(), MAX_BULK_TASKS);
    launchToast(created.length ? `Создан пакет автозадач: ${created.length}` : 'Новых автозадач для запуска нет.');
    rerenderLaunchesSoon();
    return created;
  }

  function createOneTask(launchKey, defId) {
    const item = launchItems().find((entry) => launchId(entry) === launchKey);
    if (!item) return [];
    const entry = missingTasksForLaunch(item).find((candidate) => candidate.def.id === defId);
    const created = entry ? createTasks([entry], 1) : [];
    launchToast(created.length ? 'Автозадача создана.' : 'Эта автозадача уже есть.');
    rerenderLaunchesSoon();
    if (created[0]?.id) window.setTimeout(() => openLaunchTaskModal(created[0].id), 180);
    return created;
  }

  function eventElement(event) {
    const target = event?.target;
    if (!target) return null;
    if (target.nodeType === 1) return target;
    return target.parentElement || null;
  }

  function opsButtonFromEvent(event) {
    const target = eventElement(event);
    return target?.closest?.('[data-launch-ops-create-selected],[data-launch-ops-create-bulk],[data-launch-ops-open-tasks],[data-launch-ops-open-task],[data-launch-ops-create-one],[data-launch-ops-queue],[data-launch-ops-day],[data-launch-modal-close],[data-launch-task-status],[data-launch-task-open-pool],[data-launch-queue-select],[data-launch-queue-create],[data-launch-queue-open]') || null;
  }

  function opsActionKey(button) {
    if (!button) return '';
    if (button.matches?.('[data-launch-modal-close]')) return 'modal-close';
    if (button.matches?.('[data-launch-task-status]')) return `task-status:${button.dataset.launchTaskStatus || ''}`;
    if (button.matches?.('[data-launch-task-open-pool]')) return 'task-open-pool';
    if (button.matches?.('[data-launch-queue-select]')) return `queue-select:${button.dataset.launchQueueSelect || ''}`;
    if (button.matches?.('[data-launch-queue-create]')) return `queue-create:${button.dataset.launchQueueCreate || ''}`;
    if (button.matches?.('[data-launch-queue-open]')) return `queue-open:${button.dataset.launchQueueOpen || ''}`;
    if (button.matches?.('[data-launch-ops-queue]')) return `queue:${button.dataset.launchOpsQueue || ''}`;
    if (button.matches?.('[data-launch-ops-day]')) return `day:${button.dataset.launchOpsDay || ''}`;
    if (button.matches?.('[data-launch-ops-create-selected]')) return 'selected';
    if (button.matches?.('[data-launch-ops-create-bulk]')) return 'bulk';
    if (button.matches?.('[data-launch-ops-open-tasks]')) return 'open';
    if (button.matches?.('[data-launch-ops-open-task]')) return `open-task:${button.dataset.launchOpsOpenTask || ''}`;
    if (button.matches?.('[data-launch-ops-create-one]')) return `one:${button.dataset.launchOpsLaunch || ''}:${button.dataset.launchOpsCreateOne || ''}`;
    return button.dataset.launchOpsAction || '';
  }

  function consumeOpsEvent(event, key) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    if (event?.stopImmediatePropagation) event.stopImmediatePropagation();
    lastHandledAction = { key, at: Date.now() };
  }

  function isDuplicateOpsEvent(key) {
    return key && lastHandledAction.key === key && Date.now() - lastHandledAction.at < 450;
  }

  function recordOpsAction(stage, key, detail = {}) {
    window.__ALTEA_LAUNCH_OPS_LAST_ACTION__ = {
      stage,
      key,
      detail,
      at: new Date().toISOString(),
      version: VERSION
    };
  }

  function handleOpsClick(event) {
    const button = opsButtonFromEvent(event);
    if (!button) return false;
    const key = opsActionKey(button);
    if (isDuplicateOpsEvent(key)) {
      consumeOpsEvent(event, key);
      recordOpsAction('duplicate', key);
      return true;
    }
    if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
    consumeOpsEvent(event, key);
    try {
      if (button.matches?.('[data-launch-modal-close]')) {
        closeLaunchOpsModal();
        recordOpsAction('modal-close', key);
        return true;
      }
      if (button.matches?.('[data-launch-task-status]')) {
        const form = button.closest?.('[data-launch-task-form]');
        const task = updateLaunchTaskStatus(form, button.dataset.launchTaskStatus || 'new');
        recordOpsAction('task-status', key, { taskId: task?.id || '' });
        return true;
      }
      if (button.matches?.('[data-launch-task-open-pool]')) {
        const form = button.closest?.('[data-launch-task-form]');
        const task = findKnownTask(form?.dataset?.launchTaskId || '');
        const item = taskLaunchItem(task || {});
        if (item) openLaunchTasksModal(launchId(item));
        else openTasksView();
        recordOpsAction('task-open-pool', key, { taskId: task?.id || '' });
        return true;
      }
      if (button.matches?.('[data-launch-queue-select]')) {
        const launchKey = button.dataset.launchQueueSelect || '';
        appState().launchV1SelectedId = launchKey;
        closeLaunchOpsModal();
        rerenderLaunchesSoon();
        window.setTimeout(() => {
          const cssKey = window.CSS?.escape ? window.CSS.escape(launchKey) : String(launchKey).replace(/"/g, '\\"');
          document.querySelector(`[data-launch-v1-card="${cssKey}"],[data-launch-v1-open="${cssKey}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        }, 140);
        recordOpsAction('queue-selected', key, { launchKey });
        return true;
      }
      if (button.matches?.('[data-launch-queue-create]')) {
        const launchKey = button.dataset.launchQueueCreate || '';
        const item = findLaunchById(launchKey);
        const created = item ? createTasks(missingTasksForLaunch(item), PROCESS_TASKS.length) : [];
        launchToast(created.length ? `Создано задач: ${created.length}` : 'Новых задач по этой новинке нет.');
        if (item) openLaunchTasksModal(launchKey);
        recordOpsAction('queue-created', key, { launchKey, count: created.length });
        return true;
      }
      if (button.matches?.('[data-launch-queue-open]')) {
        const launchKey = button.dataset.launchQueueOpen || '';
        openLaunchTasksModal(launchKey);
        recordOpsAction('queue-opened-launch-tasks', key, { launchKey });
        return true;
      }
      if (button.matches?.('[data-launch-ops-queue]')) {
        const items = openQueueModal(button.dataset.launchOpsQueue || '');
        recordOpsAction('opened-queue', key, { count: items.length });
        return true;
      }
      if (button.matches?.('[data-launch-ops-day]')) {
        const tasks = openDayTasksModal(button.dataset.launchOpsDay || '');
        recordOpsAction('opened-day', key, { count: tasks.length });
        return true;
      }
      if (button.matches?.('[data-launch-ops-create-selected]')) {
        const created = createSelectedTasks();
        recordOpsAction('created-selected', key, { count: created.length });
        return true;
      }
      if (button.matches?.('[data-launch-ops-create-bulk]')) {
        const created = createBulkTasks();
        recordOpsAction('created-bulk', key, { count: created.length });
        return true;
      }
      if (button.matches?.('[data-launch-ops-open-tasks]')) {
        openTasksView();
        recordOpsAction('opened-control', key);
        return true;
      }
      if (button.matches?.('[data-launch-ops-open-task]')) {
        const taskId = button.dataset.launchOpsOpenTask || '';
        if (taskId) openLaunchTaskModal(taskId);
        else openTasksView();
        recordOpsAction('opened-task', key, { taskId });
        return true;
      }
      if (button.matches?.('[data-launch-ops-create-one]')) {
        const created = createOneTask(button.dataset.launchOpsLaunch || '', button.dataset.launchOpsCreateOne || '');
        recordOpsAction('created-one', key, { count: created.length });
        return true;
      }
    } catch (error) {
      console.warn('[launch-autotasks] action failed', key, error);
      recordOpsAction('failed', key, { message: error?.message || String(error || '') });
      launchToast('\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043d\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u043b\u043e\u0441\u044c: \u043e\u0431\u043d\u043e\u0432\u043b\u044f\u044e \u0441\u0432\u044f\u0437\u044c \u043a\u043d\u043e\u043f\u043e\u043a.');
      queueAugment();
      return true;
    }
    return false;
  }

  function hardwireOpsButtons(root) {
    if (!root) return;
    root.querySelectorAll('[data-launch-ops-create-selected],[data-launch-ops-create-bulk],[data-launch-ops-open-tasks],[data-launch-ops-open-task],[data-launch-ops-create-one],[data-launch-ops-queue],[data-launch-ops-day],[data-launch-modal-close],[data-launch-task-status],[data-launch-task-open-pool],[data-launch-queue-select],[data-launch-queue-create],[data-launch-queue-open]').forEach((button) => {
      if (button.__launchOpsHardwired) return;
      button.__launchOpsHardwired = true;
      button.addEventListener('click', handleOpsClick, true);
    });
  }

  function bindOpsEvents(root) {
    if (root.__launchOpsBound) return;
    root.__launchOpsBound = true;
    root.addEventListener('click', handleOpsClick);
  }

  function bindGlobalOpsEvents() {
    if (window.__ALTEA_LAUNCH_OPS_GLOBAL_CLICK_HARDWIRE__) return;
    window.__ALTEA_LAUNCH_OPS_GLOBAL_CLICK_HARDWIRE__ = true;
    document.addEventListener('click', handleOpsClick, true);
  }

  function queueAugment(options = {}) {
    if (options.invalidateTasks) {
      knownTasksCache = null;
      opsSnapshotCache = null;
      historyBackfilled = false;
    }
    if (renderQueued) return;
    const root = document.getElementById('view-launches');
    if (!root && appState().activeView && appState().activeView !== 'launches') return;
    renderQueued = true;
    const run = () => {
      renderQueued = false;
      const now = Date.now();
      if (now - lastAugmentAt < AUGMENT_MIN_INTERVAL_MS) {
        window.setTimeout(() => queueAugment(), AUGMENT_MIN_INTERVAL_MS - (now - lastAugmentAt));
        return;
      }
      lastAugmentAt = now;
      try {
        augmentLaunchView();
      } catch (error) {
        console.warn('[launch-autotasks] augment', error);
      }
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else window.setTimeout(run, 0);
  }

  function wrapRenderLaunches() {
    const current = window.renderLaunches;
    if (typeof current !== 'function') return false;
    if (current.__launchAutotasksWrapped) return true;
    const wrapped = function renderLaunchesWithAutotasks(...args) {
      const result = current.apply(this, args);
      queueAugment();
      return result;
    };
    wrapped.__launchAutotasksWrapped = true;
    wrapped.__launchAutotasksBase = current;
    window.renderLaunches = wrapped;
    return true;
  }

  function boot() {
    injectStyles();
    bindGlobalOpsEvents();
    if (!wrapRenderLaunches()) {
      wrapTimer += 1;
      if (wrapTimer < 120) window.setTimeout(boot, 80);
      return;
    }
    queueAugment();
  }

  window.getLaunchOpsAutotaskSnapshot = snapshot;
  window.createLaunchOpsAutotasksForSelected = createSelectedTasks;
  window.createLaunchOpsAutotasksBulk = createBulkTasks;
  window.__ALTEA_LAUNCH_OPS_API__ = {
    version: VERSION,
    snapshot,
    createSelected: createSelectedTasks,
    createBulk: createBulkTasks,
    createOne: createOneTask,
    openTasks: openTasksView,
    openTask: openLaunchTaskModal,
    openQueue: openQueueModal,
    openDay: openDayTasksModal,
    openLaunchTasks: openLaunchTasksModal,
    refresh: queueAugment
  };

  ['altea:app-ready', 'altea:data-ready', 'altea:viewchange', 'altea:launches-rendered', 'hashchange'].forEach((eventName) => {
    window.addEventListener(eventName, () => queueAugment());
  });
  window.addEventListener('altea:launches-selected', () => queueSelectedOpsDetail());
  window.addEventListener('altea:portal-storage-updated', () => queueAugment({ invalidateTasks: true }));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
