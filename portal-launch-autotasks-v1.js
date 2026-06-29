(function () {
  'use strict';

  if (window.__ALTEA_LAUNCH_AUTOTASKS_V1__) return;
  window.__ALTEA_LAUNCH_AUTOTASKS_V1__ = true;

  const VERSION = '20260629-launch-autotasks-v1';
  const MAX_BULK_TASKS = 30;
  const REMOVED_STATUSES = new Set(['deleted', 'removed']);

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
      title: 'Войти в акции WB',
      nextAction: 'Проверить доступные акции WB, экономику и подать товар в релевантные акции.',
      evidence: 'Акции проверены'
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

  function appState() {
    let stateRef = null;
    try {
      stateRef = typeof state === 'object' && state ? state : null;
    } catch {
      stateRef = null;
    }
    if (!stateRef) {
      window.state = window.state && typeof window.state === 'object' ? window.state : {};
      stateRef = window.state;
    }
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

  function launchItems() {
    const source = typeof window.getLaunchItems === 'function'
      ? window.getLaunchItems({ skipTaskLookup: true })
      : appState().launches;
    return (Array.isArray(source) ? source : [])
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({ ...item, id: launchId(item) }));
  }

  function firstText(item, fields) {
    for (const field of fields) {
      const value = String(item?.[field] || '').trim();
      if (value) return value;
    }
    return '';
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
    const context = [
      `Процесс запуска: ${def.phaseLabel}`,
      `Роль: ${roleLabel}`,
      due ? `Срок: ${due}` : 'Срок не рассчитан, нужна дата запуска или склада',
      anchor.source === 'month' ? 'Дата рассчитана от месяца запуска, нужна точная дата склада' : '',
      anchor.source === 'fallback' || String(anchor.source || '').includes('fallback') ? 'Использована резервная дата, уточните дату склада МП' : '',
      def.evidence ? `Результат: ${def.evidence}` : '',
      firstText(item, ['status']) ? `Статус новинки: ${item.status}` : '',
      firstText(item, ['marketplaces']) ? `Площадки: ${item.marketplaces}` : ''
    ].filter(Boolean).join('\n');
    const now = new Date().toISOString();

    return {
      id: stableId('task-launch-auto', code),
      source: 'manual',
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
      platform: 'product',
      createdAt: now,
      updatedAt: now,
      generatedBy: VERSION
    };
  }

  function plannedTasksForLaunch(item) {
    const key = launchId(item);
    return PROCESS_TASKS.map((def) => {
      const existing = existingTaskFor(key, def.id);
      const payload = taskPayload(item, def);
      return { def, payload, existing, launch: item };
    });
  }

  function missingTasksForLaunch(item) {
    return plannedTasksForLaunch(item).filter((entry) => !entry.existing);
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
    return appState().storage.tasks;
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
    }
    if (created.length) saveState('launch-autotasks-create');
    return created;
  }

  function saveState(reason) {
    knownTasksCache = null;
    try {
      if (typeof window.saveLocalStorage === 'function') window.saveLocalStorage({ reason });
      else if (typeof saveLocalStorage === 'function') saveLocalStorage({ reason });
    } catch (error) {
      console.warn('[launch-autotasks] save', error);
    }
    try {
      window.dispatchEvent(new CustomEvent('altea:portal-storage-updated', { detail: { source: reason || VERSION } }));
    } catch {}
  }

  function snapshot() {
    const items = launchItems();
    const missing = missingTasksForAll();
    const exactDateMissing = items.filter((item) => firstStockDateInfo(item).source !== 'exact').length;
    const noOwner = items.filter((item) => !ownerForRole(item, 'product')).length;
    const noMarketplace = items.filter((item) => !String(item.marketplaces || item.marketplace || '').trim()).length;
    const dueSoon = missing.filter((entry) => entry.payload.due && dayDiff(entry.payload.due) <= 7).length;
    const overdue = missing.filter((entry) => entry.payload.due && dayDiff(entry.payload.due) < 0).length;
    return { items, missing, exactDateMissing, noOwner, noMarketplace, dueSoon, overdue };
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
      ['Нет owner', noOwner.length, 'Кому уйдут задачи запуска', 'danger'],
      ['Нет точной даты склада', noExactDate.length, 'Сроки считаются от месяца, нужна дата', 'warn'],
      ['Нет продакт-файла', noProductFile.length, 'Нужно вложить или указать ссылку', 'warn'],
      ['Нет площадки', noMarketplace.length, 'WB/Ozon/Я.Маркет нужны для запуска', 'info'],
      ['Ждет дату склада МП', waitMp.length, 'Сигналы КЗ/РОП/РК зависят от поступления', 'info']
    ].forEach(([label, count, hint, tone]) => {
      if (count) rows.push({ label, count, hint, tone });
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
            <button type="button" data-launch-ops-create-selected ${selected ? '' : 'disabled'}>Создать по выбранной</button>
            <button type="button" data-launch-ops-create-bulk>Создать пакет ${Math.min(MAX_BULK_TASKS, data.missing.length)}</button>
            <button type="button" data-launch-ops-open-tasks>Открыть задачи</button>
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
              <button type="button" class="${html(row.tone)}" data-launch-ops-filter="${html(row.label)}">
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
                  <button type="button" data-launch-ops-create-one="${html(entry.def.id)}" data-launch-ops-launch="${html(launchId(selected))}">
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

  function renderSelectedOpsBlock(item) {
    if (!item) return '';
    const planned = plannedTasksForLaunch(item);
    const missing = planned.filter((entry) => !entry.existing);
    const doneCount = planned.length - missing.length;
    return `
      <div class="launch-ops-detail" data-launch-ops-detail>
        <div>
          <strong>Автопроцесс запуска</strong>
          <span>${doneCount}/${planned.length} создано</span>
        </div>
        <div class="launch-ops-detail-grid">
          ${planned.slice(0, 8).map((entry) => `
            <span class="${entry.existing ? 'ok' : entry.payload.due && dayDiff(entry.payload.due) < 0 ? 'danger' : 'warn'}">
              <i></i>
              <b>${html(entry.def.phaseLabel)}</b>
              <em>${html(entry.payload.due || 'без даты')}</em>
            </span>
          `).join('')}
        </div>
        <button type="button" data-launch-ops-create-selected>Создать недостающие по этой новинке</button>
      </div>
    `;
  }

  function injectStyles() {
    if (document.getElementById('launch-autotasks-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'launch-autotasks-v1-style';
    style.textContent = `
      .launch-ops-panel{border:1px solid rgba(224,190,126,.18);border-radius:10px;background:linear-gradient(145deg,rgba(18,12,7,.72),rgba(9,17,25,.52));box-shadow:inset 0 1px 0 rgba(255,255,255,.04);padding:16px;display:grid;gap:14px;color:var(--sl-text,#f7f1e8)}
      .launch-ops-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
      .launch-ops-head span,.launch-ops-kpis em,.launch-ops-selected small,.launch-ops-queue small,.launch-ops-detail span,.launch-ops-detail em{font-size:11px;color:var(--sl-muted,rgba(247,241,232,.62));font-style:normal}
      .launch-ops-head strong{display:block;font-size:20px;margin-top:2px}
      .launch-ops-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .launch-ops-actions button,.launch-ops-detail>button{min-height:38px;border:1px solid rgba(224,190,126,.24);border-radius:8px;background:rgba(255,255,255,.035);color:var(--sl-text,#f7f1e8);padding:0 12px;font-weight:800;cursor:pointer}
      .launch-ops-actions button:first-child,.launch-ops-detail>button{background:linear-gradient(180deg,#ffe1a1,#b98536);color:#130d07;border-color:rgba(255,227,157,.7)}
      .launch-ops-actions button:disabled{opacity:.48;cursor:not-allowed}
      .launch-ops-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
      .launch-ops-kpis span{border:1px solid rgba(224,190,126,.13);border-radius:8px;background:rgba(0,0,0,.18);padding:10px 12px;display:grid;gap:3px;min-height:76px}
      .launch-ops-kpis strong{font-size:26px;line-height:1}
      .launch-ops-kpis small{font-size:11px;color:var(--sl-muted,rgba(247,241,232,.62))}
      .launch-ops-body{display:grid;grid-template-columns:minmax(260px,.75fr) minmax(320px,1fr);gap:12px}
      .launch-ops-queue,.launch-ops-selected,.launch-ops-detail{border-top:1px solid rgba(224,190,126,.12);padding-top:12px;display:grid;gap:8px}
      .launch-ops-queue button,.launch-ops-selected button{width:100%;border:1px solid rgba(224,190,126,.14);border-radius:8px;background:rgba(5,5,5,.28);color:var(--sl-text,#f7f1e8);display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:10px;align-items:center;text-align:left;padding:9px 10px}
      .launch-ops-selected button{grid-template-columns:minmax(0,1fr)}
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
      @media (max-width:1100px){.launch-ops-head,.launch-ops-body{grid-template-columns:1fr;display:grid}.launch-ops-actions{justify-content:start}.launch-ops-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (max-width:720px){.launch-ops-kpis,.launch-ops-detail-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function augmentLaunchView() {
    const root = document.getElementById('view-launches');
    if (!root || !root.querySelector('.launch-v1-shell')) return;
    const oldPanel = root.querySelector('[data-launch-ops-panel]');
    if (oldPanel) oldPanel.remove();
    const kpis = root.querySelector('.launch-v1-kpis');
    if (kpis) kpis.insertAdjacentHTML('afterend', renderOpsPanel());

    root.querySelectorAll('[data-launch-ops-detail]').forEach((node) => node.remove());
    const selected = selectedLaunch();
    const detail = root.querySelector('.launch-v1-detail');
    if (detail && selected) detail.insertAdjacentHTML('beforeend', renderSelectedOpsBlock(selected));

    bindOpsEvents(root);
  }

  function openTasksView() {
    appState().activeView = 'control';
    appState().controlFilters = appState().controlFilters || {};
    Object.assign(appState().controlFilters, { type: 'launch', source: 'auto', status: 'active' });
    if (typeof window.setView === 'function') window.setView('control');
    else window.location.hash = '#control';
    window.setTimeout(() => {
      if (typeof window.renderControlCenter === 'function') window.renderControlCenter('view-control');
    }, 120);
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
    if (created[0]?.id && typeof window.openTaskModal === 'function') {
      window.setTimeout(() => window.openTaskModal(created[0].id), 180);
    }
    return created;
  }

  function bindOpsEvents(root) {
    if (root.__launchOpsBound) return;
    root.__launchOpsBound = true;
    root.addEventListener('click', (event) => {
      const selectedButton = event.target.closest?.('[data-launch-ops-create-selected]');
      if (selectedButton) {
        event.preventDefault();
        event.stopPropagation();
        createSelectedTasks();
        return;
      }
      const bulkButton = event.target.closest?.('[data-launch-ops-create-bulk]');
      if (bulkButton) {
        event.preventDefault();
        event.stopPropagation();
        createBulkTasks();
        return;
      }
      const openTasks = event.target.closest?.('[data-launch-ops-open-tasks]');
      if (openTasks) {
        event.preventDefault();
        event.stopPropagation();
        openTasksView();
        return;
      }
      const single = event.target.closest?.('[data-launch-ops-create-one]');
      if (single) {
        event.preventDefault();
        event.stopPropagation();
        createOneTask(single.dataset.launchOpsLaunch || '', single.dataset.launchOpsCreateOne || '');
      }
    });
  }

  function queueAugment() {
    if (renderQueued) return;
    renderQueued = true;
    const run = () => {
      renderQueued = false;
      knownTasksCache = null;
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

  ['altea:app-ready', 'altea:data-ready', 'altea:viewchange', 'altea:portal-storage-updated', 'altea:launches-rendered', 'hashchange'].forEach((eventName) => {
    window.addEventListener(eventName, () => queueAugment());
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
