(function () {
  const V76_LOCAL_KEY = 'brand-portal-v76-product-v1';
  const V76_TABLES = {
    products: 'portal_product_items',
    novelties: 'portal_novelty_cards',
    notebook: 'portal_product_notebook'
  };

  const PRODUCT_STATUS_META = {
    idea: { label: 'Идея', kind: '' },
    research: { label: 'Исследование', kind: 'info' },
    development: { label: 'Разработка', kind: 'warn' },
    pricing: { label: 'Калькулятор / цена', kind: 'warn' },
    production: { label: 'Производство', kind: 'warn' },
    ready: { label: 'Готов к запуску', kind: 'ok' },
    active: { label: 'В матрице', kind: 'ok' },
    hold: { label: 'Пауза', kind: 'danger' },
    archive: { label: 'Архив / вывод', kind: '' }
  };

  const NOVELTY_STAGE_META = {
    idea: { label: 'Идея', kind: '' },
    brief: { label: 'Бриф / ТЗ', kind: 'info' },
    formula: { label: 'Рецептура / разработка', kind: 'warn' },
    sample: { label: 'Образцы / тест', kind: 'warn' },
    packaging: { label: 'Упаковка / печать', kind: 'warn' },
    production: { label: 'Производство', kind: 'warn' },
    launch_ready: { label: 'Готово к запуску', kind: 'ok' },
    live: { label: 'Запущено', kind: 'ok' },
    hold: { label: 'Пауза', kind: 'danger' },
    cancelled: { label: 'Отменено', kind: '' }
  };

  const NOTEBOOK_KIND_META = {
    action: 'Действие',
    decision: 'Решение',
    supplier: 'Поставщик',
    pricing: 'Цена / калькулятор',
    launch: 'Новинка',
    matrix: 'Матрица',
    note: 'Заметка'
  };

  state.v76 = Object.assign({
    filters: {
      productSearch: '',
      productStatus: 'all',
      noveltySearch: '',
      noveltyStage: 'all',
      taskStatus: 'active',
      notebookKind: 'all'
    },
    ui: {
      editingProductId: '',
      editingNoveltyId: ''
    },
    store: {
      products: [],
      novelties: [],
      notebook: []
    },
    remote: {
      schemaReady: null,
      note: 'Локальное хранение',
      lastSyncAt: '',
      error: ''
    }
  }, state.v76 || {});

  function v76DefaultStore() {
    return { products: [], novelties: [], notebook: [] };
  }

  function v76MonthKey(label) {
    const raw = String(label || '').trim();
    if (!raw) return '9999-99';
    const map = {
      'Январь': 1, 'Февраль': 2, 'Март': 3, 'Апрель': 4, 'Май': 5, 'Июнь': 6,
      'Июль': 7, 'Август': 8, 'Сентябрь': 9, 'Октябрь': 10, 'Ноябрь': 11, 'Декабрь': 12
    };
    const parts = raw.split(' ');
    const month = map[parts[0]] || 99;
    const year = Number(parts[1]) || 9999;
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  function v76CodeFromName(name, prefix = 'PRD') {
    const clean = String(name || '').trim();
    return `${prefix}-${hashString(clean || Math.random().toString(36)).slice(0, 6).toUpperCase()}`;
  }

  function v76Now() {
    return new Date().toISOString();
  }

  function v76LoadLocalStore() {
    try {
      const raw = localStorage.getItem(V76_LOCAL_KEY);
      if (!raw) return v76DefaultStore();
      const parsed = JSON.parse(raw);
      return {
        products: Array.isArray(parsed.products) ? parsed.products.map(v76NormalizeProduct) : [],
        novelties: Array.isArray(parsed.novelties) ? parsed.novelties.map(v76NormalizeNovelty) : [],
        notebook: Array.isArray(parsed.notebook) ? parsed.notebook.map(v76NormalizeNotebook) : []
      };
    } catch {
      return v76DefaultStore();
    }
  }

  function v76SaveLocalStore() {
    localStorage.setItem(V76_LOCAL_KEY, JSON.stringify(state.v76.store));
  }

  function v76InferProductStatus(item) {
    const text = `${item?.status || ''} ${item?.name || ''}`.toLowerCase();
    if (text.includes('этикетки') || text.includes('производств')) return 'production';
    if (text.includes('nda') || text.includes('рецептур') || text.includes('кп') || text.includes('тз') || text.includes('договор')) return 'development';
    if (!item?.targetCost) return 'pricing';
    const monthKey = v76MonthKey(item?.launchMonth);
    if (monthKey <= '2026-05') return 'ready';
    if (monthKey <= '2026-08') return 'research';
    return 'idea';
  }

  function v76InferNoveltyStage(item) {
    const text = `${item?.status || ''}`.toLowerCase();
    if (text.includes('этикетки') || text.includes('печати')) return 'packaging';
    if (text.includes('производств')) return 'production';
    if (text.includes('nda') || text.includes('договор') || text.includes('кп')) return 'brief';
    if (text.includes('рецептур')) return 'formula';
    if (!item?.targetCost) return 'sample';
    const monthKey = v76MonthKey(item?.launchMonth);
    if (monthKey <= '2026-05') return 'launch_ready';
    return 'idea';
  }

  function v76NormalizeProduct(item = {}) {
    const productCode = String(item.productCode || item.code || item.articleKey || v76CodeFromName(item.name, 'PRD')).trim();
    return {
      id: item.id || stableId('product', `${productCode}|${item.name || ''}`),
      productCode,
      articleKey: String(item.articleKey || '').trim(),
      name: String(item.name || 'Новый товар').trim() || 'Новый товар',
      category: String(item.category || '').trim(),
      subCategory: String(item.subCategory || '').trim(),
      status: PRODUCT_STATUS_META[item.status] ? item.status : 'idea',
      launchMonth: String(item.launchMonth || '').trim(),
      targetCost: item.targetCost ?? '',
      targetPrice: item.targetPrice ?? '',
      minPrice: item.minPrice ?? '',
      rrp: item.rrp ?? '',
      plannedRevenue: item.plannedRevenue ?? '',
      owner: String(item.owner || 'Ксения').trim() || 'Ксения',
      source: String(item.source || 'manual').trim() || 'manual',
      notes: String(item.notes || '').trim(),
      createdAt: item.createdAt || v76Now(),
      updatedAt: item.updatedAt || v76Now()
    };
  }

  function v76NormalizeNovelty(item = {}) {
    const productCode = String(item.productCode || item.code || v76CodeFromName(item.name, 'NOV')).trim();
    return {
      id: item.id || stableId('novelty', `${productCode}|${item.name || ''}|${item.launchMonth || ''}`),
      productId: String(item.productId || '').trim(),
      productCode,
      name: String(item.name || 'Новая новинка').trim() || 'Новая новинка',
      category: String(item.category || '').trim(),
      launchMonth: String(item.launchMonth || '').trim(),
      stage: NOVELTY_STAGE_META[item.stage] ? item.stage : 'idea',
      statusText: String(item.statusText || '').trim(),
      production: String(item.production || '').trim(),
      targetCost: item.targetCost ?? '',
      plannedRevenue: item.plannedRevenue ?? '',
      owner: String(item.owner || 'Ксения').trim() || 'Ксения',
      nextStep: String(item.nextStep || '').trim(),
      blockers: String(item.blockers || '').trim(),
      source: String(item.source || 'manual').trim() || 'manual',
      createdAt: item.createdAt || v76Now(),
      updatedAt: item.updatedAt || v76Now()
    };
  }

  function v76NormalizeNotebook(item = {}) {
    return {
      id: item.id || uid('note'),
      entityType: String(item.entityType || 'product').trim() || 'product',
      entityId: String(item.entityId || '').trim(),
      entityCode: String(item.entityCode || '').trim(),
      title: String(item.title || 'Действие').trim() || 'Действие',
      body: String(item.body || item.text || '').trim(),
      nextStep: String(item.nextStep || '').trim(),
      due: item.due || '',
      status: mapTaskStatus(item.status || 'new'),
      author: String(item.author || state.team.member?.name || 'Ксения').trim() || 'Ксения',
      kind: NOTEBOOK_KIND_META[item.kind] ? item.kind : 'action',
      createdAt: item.createdAt || v76Now(),
      updatedAt: item.updatedAt || v76Now()
    };
  }

  function v76SeedProductsFromLaunches() {
    const seen = new Map();
    for (const launch of state.launches || []) {
      const code = v76CodeFromName(launch.name, 'PRD');
      const item = v76NormalizeProduct({
        productCode: code,
        name: launch.name,
        category: launch.reportGroup,
        subCategory: launch.subCategory,
        status: v76InferProductStatus(launch),
        launchMonth: launch.launchMonth,
        targetCost: launch.targetCost,
        plannedRevenue: launch.plannedRevenue,
        owner: 'Ксения',
        source: 'launch_plan',
        notes: launch.status || ''
      });
      seen.set(item.id, item);
    }
    return [...seen.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function v76SeedNoveltiesFromLaunches(products) {
    const productByCode = new Map((products || []).map((item) => [item.productCode, item]));
    const seen = new Map();
    for (const launch of state.launches || []) {
      const code = v76CodeFromName(launch.name, 'PRD');
      const novelty = v76NormalizeNovelty({
        productId: productByCode.get(code)?.id || '',
        productCode: code,
        name: launch.name,
        category: launch.reportGroup,
        launchMonth: launch.launchMonth,
        stage: v76InferNoveltyStage(launch),
        statusText: launch.status,
        production: launch.production,
        targetCost: launch.targetCost,
        plannedRevenue: launch.plannedRevenue,
        owner: 'Ксения',
        nextStep: launch.status || '',
        blockers: '',
        source: 'launch_plan'
      });
      seen.set(novelty.id, novelty);
    }
    return [...seen.values()].sort((a, b) => v76MonthKey(a.launchMonth).localeCompare(v76MonthKey(b.launchMonth)) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function v76MergeSeedWithLocal(seeded, existing) {
    const map = new Map((seeded || []).map((item) => [item.id, item]));
    for (const item of existing || []) map.set(item.id, item);
    return [...map.values()];
  }

  function v76BootstrapStore() {
    const local = v76LoadLocalStore();
    const seededProducts = v76SeedProductsFromLaunches();
    const seededNovelties = v76SeedNoveltiesFromLaunches(seededProducts);
    state.v76.store.products = v76MergeSeedWithLocal(seededProducts, local.products || []).map(v76NormalizeProduct);
    state.v76.store.novelties = v76MergeSeedWithLocal(seededNovelties, local.novelties || []).map(v76NormalizeNovelty);
    state.v76.store.notebook = (local.notebook || []).map(v76NormalizeNotebook).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    v76SaveLocalStore();
  }

  function v76ProductList() {
    const q = String(state.v76.filters.productSearch || '').trim().toLowerCase();
    return [...(state.v76.store.products || [])]
      .filter((item) => {
        const hay = [item.productCode, item.articleKey, item.name, item.category, item.subCategory, item.notes].filter(Boolean).join(' ').toLowerCase();
        if (q && !hay.includes(q)) return false;
        if (state.v76.filters.productStatus !== 'all' && item.status !== state.v76.filters.productStatus) return false;
        return true;
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function v76NoveltyList() {
    const q = String(state.v76.filters.noveltySearch || '').trim().toLowerCase();
    return [...(state.v76.store.novelties || [])]
      .filter((item) => {
        const hay = [item.productCode, item.name, item.category, item.nextStep, item.blockers].filter(Boolean).join(' ').toLowerCase();
        if (q && !hay.includes(q)) return false;
        if (state.v76.filters.noveltyStage !== 'all' && item.stage !== state.v76.filters.noveltyStage) return false;
        return true;
      })
      .sort((a, b) => v76MonthKey(a.launchMonth).localeCompare(v76MonthKey(b.launchMonth)) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function v76NotebookList() {
    return [...(state.v76.store.notebook || [])]
      .filter((item) => state.v76.filters.notebookKind === 'all' ? true : item.kind === state.v76.filters.notebookKind)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function v76KseniaTasks() {
    return sortTasks(getAllTasks().filter((task) => {
      const hay = `${task.title || ''} ${task.reason || ''} ${task.nextAction || ''} ${task.entityLabel || ''}`.toLowerCase();
      return String(task.owner || '').toLowerCase() === 'ксения'
        || String(task.source || '').startsWith('ksenia_')
        || hay.includes('новин')
        || hay.includes('калькулятор')
        || hay.includes('ценов')
        || hay.includes('матриц');
    }));
  }

  function v76ProductsByCode() {
    return new Map((state.v76.store.products || []).map((item) => [item.productCode, item]));
  }

  function v76FindProduct(id) {
    return (state.v76.store.products || []).find((item) => item.id === id) || null;
  }

  function v76FindNovelty(id) {
    return (state.v76.store.novelties || []).find((item) => item.id === id) || null;
  }

  function v76StatusBadge(status) {
    const meta = PRODUCT_STATUS_META[status] || PRODUCT_STATUS_META.idea;
    return badge(meta.label, meta.kind);
  }

  function v76NoveltyStageBadge(stage) {
    const meta = NOVELTY_STAGE_META[stage] || NOVELTY_STAGE_META.idea;
    return badge(meta.label, meta.kind);
  }

  function v76NotebookKindBadge(kind) {
    return badge(NOTEBOOK_KIND_META[kind] || 'Заметка', kind === 'decision' ? 'warn' : kind === 'pricing' ? 'info' : '');
  }

  function v76EntityOptions() {
    const products = (state.v76.store.products || []).map((item) => ({ value: `product:${item.id}`, label: `${item.name} · ${item.productCode}` }));
    const novelties = (state.v76.store.novelties || []).map((item) => ({ value: `novelty:${item.id}`, label: `Новинка · ${item.name}` }));
    return [...products, ...novelties].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }

  function v76PatchChrome() {
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) brandSub.textContent = 'Imperial v7.6 · ops portal · продукт · логистика · контроль';
    const topDesc = document.querySelector('.topbar p');
    if (topDesc) topDesc.textContent = 'v7.6: у Ксении появился живой продуктовый контур — статусы товаров, ввод новинок, тетрадь действий и задачник со сроками.';
    const launchNavSmall = document.querySelector('.nav-btn[data-view="launches"] small');
    if (launchNavSmall) launchNavSmall.textContent = 'Статусы · новинки · тетрадь · сроки';
    const launchNavText = document.querySelector('.nav-btn[data-view="launches"] span');
    if (launchNavText) launchNavText.textContent = 'Продукт / Ксения';
  }

  const v76BaseOwnerOptions = ownerOptions;
  ownerOptions = function () {
    const pool = new Set(v76BaseOwnerOptions());
    pool.add('Ксения');
    return [...pool].sort((a, b) => a.localeCompare(b, 'ru'));
  };

  function v76IsSchemaMissing(error) {
    const msg = String(error?.message || error || '');
    return /does not exist|Could not find the table|relation .* does not exist|404/.test(msg);
  }

  function v76RemoteProductRow(item) {
    return {
      id: item.id,
      brand: currentBrand(),
      product_code: item.productCode,
      article_key: item.articleKey || '',
      name: item.name,
      category: item.category,
      sub_category: item.subCategory,
      status: item.status,
      launch_month: item.launchMonth,
      target_cost: item.targetCost === '' ? null : item.targetCost,
      target_price: item.targetPrice === '' ? null : item.targetPrice,
      min_price: item.minPrice === '' ? null : item.minPrice,
      rrp: item.rrp === '' ? null : item.rrp,
      planned_revenue: item.plannedRevenue === '' ? null : item.plannedRevenue,
      owner: item.owner,
      notes: item.notes,
      source: item.source,
      created_at: item.createdAt,
      updated_at: item.updatedAt
    };
  }

  function v76FromRemoteProduct(row) {
    return v76NormalizeProduct({
      id: row.id,
      productCode: row.product_code,
      articleKey: row.article_key,
      name: row.name,
      category: row.category,
      subCategory: row.sub_category,
      status: row.status,
      launchMonth: row.launch_month,
      targetCost: row.target_cost,
      targetPrice: row.target_price,
      minPrice: row.min_price,
      rrp: row.rrp,
      plannedRevenue: row.planned_revenue,
      owner: row.owner,
      notes: row.notes,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  function v76RemoteNoveltyRow(item) {
    return {
      id: item.id,
      brand: currentBrand(),
      product_id: item.productId || '',
      product_code: item.productCode,
      name: item.name,
      category: item.category,
      launch_month: item.launchMonth,
      stage: item.stage,
      status_text: item.statusText,
      production: item.production,
      target_cost: item.targetCost === '' ? null : item.targetCost,
      planned_revenue: item.plannedRevenue === '' ? null : item.plannedRevenue,
      owner: item.owner,
      next_step: item.nextStep,
      blockers: item.blockers,
      source: item.source,
      created_at: item.createdAt,
      updated_at: item.updatedAt
    };
  }

  function v76FromRemoteNovelty(row) {
    return v76NormalizeNovelty({
      id: row.id,
      productId: row.product_id,
      productCode: row.product_code,
      name: row.name,
      category: row.category,
      launchMonth: row.launch_month,
      stage: row.stage,
      statusText: row.status_text,
      production: row.production,
      targetCost: row.target_cost,
      plannedRevenue: row.planned_revenue,
      owner: row.owner,
      nextStep: row.next_step,
      blockers: row.blockers,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  function v76RemoteNotebookRow(item) {
    return {
      id: item.id,
      brand: currentBrand(),
      entity_type: item.entityType,
      entity_id: item.entityId,
      entity_code: item.entityCode,
      title: item.title,
      body: item.body,
      next_step: item.nextStep,
      due: item.due || null,
      status: item.status,
      author: item.author,
      kind: item.kind,
      created_at: item.createdAt,
      updated_at: item.updatedAt
    };
  }

  function v76FromRemoteNotebook(row) {
    return v76NormalizeNotebook({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityCode: row.entity_code,
      title: row.title,
      body: row.body,
      nextStep: row.next_step,
      due: row.due,
      status: row.status,
      author: row.author,
      kind: row.kind,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  async function v76PullRemoteOnly() {
    if (!hasRemoteStore() || state.v76.remote.schemaReady === false) return;
    try {
      const [products, novelties, notebook] = await Promise.all([
        queryRemote(V76_TABLES.products),
        queryRemote(V76_TABLES.novelties),
        queryRemote(V76_TABLES.notebook)
      ]);
      state.v76.remote.schemaReady = true;
      if ((products || []).length || (novelties || []).length || (notebook || []).length) {
        state.v76.store.products = (products || []).map(v76FromRemoteProduct);
        state.v76.store.novelties = (novelties || []).map(v76FromRemoteNovelty);
        state.v76.store.notebook = (notebook || []).map(v76FromRemoteNotebook).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        v76SaveLocalStore();
      }
      state.v76.remote.lastSyncAt = v76Now();
      state.v76.remote.note = (products || []).length || (novelties || []).length || (notebook || []).length
        ? `Блок Ксении синхронизирован · ${fmt.date(state.v76.remote.lastSyncAt)}`
        : 'Для блока Ксении пока нет удалённых записей';
      state.v76.remote.error = '';
    } catch (error) {
      if (v76IsSchemaMissing(error)) {
        state.v76.remote.schemaReady = false;
        state.v76.remote.note = 'Для статусов / новинок Ксении нужно один раз прогнать SQL migration v7.6';
        state.v76.remote.error = '';
        return;
      }
      console.error(error);
      state.v76.remote.error = error.message || 'Ошибка синка блока Ксении';
      state.v76.remote.note = 'Блок Ксении сейчас работает локально';
    }
  }

  async function v76PushRemoteOnly() {
    if (!hasRemoteStore() || state.v76.remote.schemaReady === false) return;
    try {
      await Promise.all([
        upsertRemote(V76_TABLES.products, (state.v76.store.products || []).map(v76RemoteProductRow), 'id'),
        upsertRemote(V76_TABLES.novelties, (state.v76.store.novelties || []).map(v76RemoteNoveltyRow), 'id'),
        upsertRemote(V76_TABLES.notebook, (state.v76.store.notebook || []).map(v76RemoteNotebookRow), 'id')
      ]);
      state.v76.remote.schemaReady = true;
      state.v76.remote.lastSyncAt = v76Now();
      state.v76.remote.note = `Блок Ксении отправлен в командную базу · ${fmt.date(state.v76.remote.lastSyncAt)}`;
      state.v76.remote.error = '';
    } catch (error) {
      if (v76IsSchemaMissing(error)) {
        state.v76.remote.schemaReady = false;
        state.v76.remote.note = 'Нужен SQL migration v7.6 для синка блока Ксении';
        state.v76.remote.error = '';
        return;
      }
      console.error(error);
      state.v76.remote.error = error.message || 'Ошибка выгрузки блока Ксении';
      state.v76.remote.note = 'Блок Ксении не выгружен в Supabase';
    }
  }

  async function v76PersistProduct(item, previousStatus = '') {
    const normalized = v76NormalizeProduct({ ...item, updatedAt: v76Now() });
    state.v76.store.products = (state.v76.store.products || []).filter((row) => row.id !== normalized.id);
    state.v76.store.products.unshift(normalized);
    state.v76.store.products = state.v76.store.products.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    v76SaveLocalStore();
    await v76PushRemoteOnly();
    if (previousStatus && previousStatus !== normalized.status) {
      await v76PersistNotebook({
        entityType: 'product',
        entityId: normalized.id,
        entityCode: normalized.productCode,
        title: `Статус товара изменён`,
        body: `${normalized.name}: ${PRODUCT_STATUS_META[previousStatus]?.label || previousStatus} → ${PRODUCT_STATUS_META[normalized.status]?.label || normalized.status}`,
        nextStep: normalized.notes || '',
        due: '',
        status: 'done',
        author: state.team.member?.name || 'Ксения',
        kind: 'action'
      }, false);
    }
    return normalized;
  }

  async function v76PersistNovelty(item, previousStage = '') {
    const normalized = v76NormalizeNovelty({ ...item, updatedAt: v76Now() });
    state.v76.store.novelties = (state.v76.store.novelties || []).filter((row) => row.id !== normalized.id);
    state.v76.store.novelties.unshift(normalized);
    state.v76.store.novelties = state.v76.store.novelties.sort((a, b) => v76MonthKey(a.launchMonth).localeCompare(v76MonthKey(b.launchMonth)) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    v76SaveLocalStore();
    await v76PushRemoteOnly();
    if (previousStage && previousStage !== normalized.stage) {
      await v76PersistNotebook({
        entityType: 'novelty',
        entityId: normalized.id,
        entityCode: normalized.productCode,
        title: `Этап новинки изменён`,
        body: `${normalized.name}: ${NOVELTY_STAGE_META[previousStage]?.label || previousStage} → ${NOVELTY_STAGE_META[normalized.stage]?.label || normalized.stage}`,
        nextStep: normalized.nextStep || '',
        due: '',
        status: 'done',
        author: state.team.member?.name || 'Ксения',
        kind: 'launch'
      }, false);
    }
    return normalized;
  }

  async function v76PersistNotebook(item, rerender = true) {
    const normalized = v76NormalizeNotebook({ ...item, updatedAt: v76Now() });
    state.v76.store.notebook = (state.v76.store.notebook || []).filter((row) => row.id !== normalized.id);
    state.v76.store.notebook.unshift(normalized);
    state.v76.store.notebook = state.v76.store.notebook.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    v76SaveLocalStore();
    await v76PushRemoteOnly();
    if (rerender) rerenderCurrentView();
    return normalized;
  }

  const v76BasePull = pullRemoteState;
  pullRemoteState = async function (rerender = true) {
    await v76BasePull(false);
    await v76PullRemoteOnly();
    if (rerender) {
      rerenderCurrentView();
      if (state.activeSku) renderSkuModal(state.activeSku);
    }
  };

  const v76BasePush = pushStateToRemote;
  pushStateToRemote = async function () {
    await v76BasePush();
    await v76PushRemoteOnly();
    rerenderCurrentView();
  };

  const v76BaseExport = exportStorage;
  exportStorage = function () {
    const payload = {
      ...state.storage,
      v76ProductDirector: state.v76.store
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `altea-portal-storage-v76-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const v76BaseImport = importStorage;
  importStorage = async function (file) {
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    mergeImportedStorage(data);
    if (data.v76ProductDirector) {
      state.v76.store.products = Array.isArray(data.v76ProductDirector.products) ? data.v76ProductDirector.products.map(v76NormalizeProduct) : state.v76.store.products;
      state.v76.store.novelties = Array.isArray(data.v76ProductDirector.novelties) ? data.v76ProductDirector.novelties.map(v76NormalizeNovelty) : state.v76.store.novelties;
      state.v76.store.notebook = Array.isArray(data.v76ProductDirector.notebook) ? data.v76ProductDirector.notebook.map(v76NormalizeNotebook) : state.v76.store.notebook;
      v76SaveLocalStore();
    }
    rerenderCurrentView();
  };

  function v76RenderNotebookItem(item) {
    const meta = TASK_STATUS_META[item.status] || TASK_STATUS_META.new;
    return `
      <div class="v76-note-item">
        <div class="head">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <div class="muted small">${escapeHtml(item.entityCode || item.entityType || '—')} · ${escapeHtml(item.author || 'Ксения')}</div>
          </div>
          <div class="badge-stack">${v76NotebookKindBadge(item.kind)}${badge(meta.label, meta.kind)}</div>
        </div>
        <div class="muted small">${escapeHtml(item.body || '—')}</div>
        ${item.nextStep ? `<div class="muted small" style="margin-top:6px"><strong>Следующее действие:</strong> ${escapeHtml(item.nextStep)}</div>` : ''}
        <div class="meta-line"><span class="muted small">Срок ${escapeHtml(item.due || '—')}</span><span class="muted small">${fmt.date(item.createdAt)}</span></div>
      </div>
    `;
  }

  function v76ProductRow(item) {
    const skuLabel = item.articleKey ? linkToSku(item.articleKey, item.articleKey) : badge(item.productCode);
    return `
      <tr>
        <td>${skuLabel}</td>
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="muted small">${escapeHtml(item.category || '—')} · ${escapeHtml(item.subCategory || '—')}</div>
        </td>
        <td>
          <select class="inline-select" data-v76-product-status="${escapeHtml(item.id)}">
            ${Object.entries(PRODUCT_STATUS_META).map(([key, meta]) => `<option value="${key}" ${item.status === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
          </select>
        </td>
        <td>${escapeHtml(item.launchMonth || '—')}</td>
        <td>${fmt.money(item.targetCost)}</td>
        <td>${fmt.money(item.plannedRevenue)}</td>
        <td><div class="muted small">${escapeHtml(item.notes || '—')}</div></td>
        <td>
          <div class="v76-actions-row">
            <button class="btn small-btn" type="button" data-v76-save-product-status="${escapeHtml(item.id)}">Сохранить</button>
            <button class="btn ghost small-btn" type="button" data-v76-edit-product="${escapeHtml(item.id)}">Редактировать</button>
          </div>
        </td>
      </tr>
    `;
  }

  function v76NoveltyCard(item) {
    return `
      <div class="v76-novelty-card">
        <div class="head">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <div class="muted small">${escapeHtml(item.productCode)} · ${escapeHtml(item.category || '—')} · ${escapeHtml(item.launchMonth || '—')}</div>
          </div>
          <div class="badge-stack">${v76NoveltyStageBadge(item.stage)}</div>
        </div>
        <div class="v76-novelty-grid">
          <div><span>Target cost</span><strong>${fmt.money(item.targetCost)}</strong></div>
          <div><span>План выручки</span><strong>${fmt.money(item.plannedRevenue)}</strong></div>
          <div><span>Производство</span><strong>${escapeHtml(item.production || '—')}</strong></div>
          <div><span>Owner</span><strong>${escapeHtml(item.owner || 'Ксения')}</strong></div>
        </div>
        <div class="muted small"><strong>Следующий шаг:</strong> ${escapeHtml(item.nextStep || '—')}</div>
        ${item.blockers ? `<div class="muted small"><strong>Блокеры:</strong> ${escapeHtml(item.blockers)}</div>` : ''}
        <div class="v76-actions-row" style="margin-top:10px">
          <select class="inline-select" data-v76-novelty-stage="${escapeHtml(item.id)}">
            ${Object.entries(NOVELTY_STAGE_META).map(([key, meta]) => `<option value="${key}" ${item.stage === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
          </select>
          <button class="btn small-btn" type="button" data-v76-save-novelty-stage="${escapeHtml(item.id)}">Сохранить этап</button>
          <button class="btn ghost small-btn" type="button" data-v76-edit-novelty="${escapeHtml(item.id)}">Редактировать</button>
        </div>
      </div>
    `;
  }

  function v76ManagerSummary(tasks) {
    const active = tasks.filter(isTaskActive);
    const overdue = active.filter(isTaskOverdue);
    const waiting = active.filter((task) => task.status === 'waiting_decision');
    return `
      <div class="badge-stack">
        ${badge(`Активно ${fmt.int(active.length)}`, active.length ? 'info' : '')}
        ${badge(`Просрочено ${fmt.int(overdue.length)}`, overdue.length ? 'danger' : 'ok')}
        ${badge(`Ждут решения ${fmt.int(waiting.length)}`, waiting.length ? 'warn' : 'ok')}
      </div>
    `;
  }

  function v76ProductFormDefaults() {
    return v76FindProduct(state.v76.ui.editingProductId) || {
      productCode: '', articleKey: '', name: '', category: '', subCategory: '', status: 'idea', launchMonth: '', targetCost: '', targetPrice: '', minPrice: '', rrp: '', plannedRevenue: '', notes: ''
    };
  }

  function v76NoveltyFormDefaults() {
    return v76FindNovelty(state.v76.ui.editingNoveltyId) || {
      productId: '', productCode: '', name: '', category: '', launchMonth: '', stage: 'idea', statusText: '', production: '', targetCost: '', plannedRevenue: '', nextStep: '', blockers: ''
    };
  }

  function v76RenderProductDirector() {
    const root = document.getElementById('view-launches');
    if (!root) return;
    const products = v76ProductList();
    const novelties = v76NoveltyList();
    const notebook = v76NotebookList();
    const tasks = v76KseniaTasks();
    const activeTasks = tasks.filter(isTaskActive);
    const overdueTasks = activeTasks.filter(isTaskOverdue);
    const prodDefaults = v76ProductFormDefaults();
    const noveltyDefaults = v76NoveltyFormDefaults();
    const entityOptions = v76EntityOptions();
    const remoteNoteKind = state.v76.remote.schemaReady === false ? 'warn' : state.v76.remote.error ? 'danger' : hasRemoteStore() ? 'ok' : '';

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Продукт / Ксения</h2>
          <p>Живой продуктовый контур: менять статусы товара, заводить товары, вносить новинки, вести тетрадь действий и держать свой задачник со сроками — прямо в портале.</p>
        </div>
        <div class="badge-stack">
          ${badge(`Товаров ${fmt.int(products.length)}`, 'info')}
          ${badge(`Новинок ${fmt.int(novelties.length)}`, novelties.length ? 'warn' : '')}
          ${badge(`Задач ${fmt.int(activeTasks.length)}`, activeTasks.length ? 'info' : '')}
          ${badge(`Просрочено ${fmt.int(overdueTasks.length)}`, overdueTasks.length ? 'danger' : 'ok')}
        </div>
      </div>

      <div class="v76-sync-note">${badge(state.v76.remote.note || 'Локальное хранение', remoteNoteKind)}</div>

      <div class="grid cards-2 v76-top-grid">
        <div class="card v76-form-card">
          <div class="section-subhead">
            <div>
              <h3>${state.v76.ui.editingProductId ? 'Редактировать товар' : 'Завести товар в матрицу'}</h3>
              <p class="small muted">Ксения может вручную добавить товар, привязать SKU и перевести его в нужный статус.</p>
            </div>
            ${v76StatusBadge(prodDefaults.status || 'idea')}
          </div>
          <form id="v76ProductForm" class="v76-form-grid">
            <input type="hidden" name="productId" value="${escapeHtml(prodDefaults.id || '')}">
            <label><span>Код товара</span><input name="productCode" value="${escapeHtml(prodDefaults.productCode || '')}" placeholder="PRD-123ABC"></label>
            <label><span>Артикул SKU</span><input name="articleKey" list="v76SkuCodes" value="${escapeHtml(prodDefaults.articleKey || '')}" placeholder="Если товар уже есть в SKU"></label>
            <label class="wide"><span>Название товара</span><input name="name" value="${escapeHtml(prodDefaults.name || '')}" placeholder="Например, сыворотка с PDRN"></label>
            <label><span>Категория</span><input name="category" value="${escapeHtml(prodDefaults.category || '')}" placeholder="Уход за лицом"></label>
            <label><span>Подкатегория</span><input name="subCategory" value="${escapeHtml(prodDefaults.subCategory || '')}" placeholder="Anti-age"></label>
            <label><span>Статус товара</span><select name="status">${Object.entries(PRODUCT_STATUS_META).map(([key, meta]) => `<option value="${key}" ${prodDefaults.status === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select></label>
            <label><span>Месяц запуска</span><input name="launchMonth" value="${escapeHtml(prodDefaults.launchMonth || '')}" placeholder="Май 2026"></label>
            <label><span>Target cost</span><input name="targetCost" type="number" step="0.01" value="${escapeHtml(prodDefaults.targetCost || '')}"></label>
            <label><span>Target price</span><input name="targetPrice" type="number" step="0.01" value="${escapeHtml(prodDefaults.targetPrice || '')}"></label>
            <label><span>Min price</span><input name="minPrice" type="number" step="0.01" value="${escapeHtml(prodDefaults.minPrice || '')}"></label>
            <label><span>RRP</span><input name="rrp" type="number" step="0.01" value="${escapeHtml(prodDefaults.rrp || '')}"></label>
            <label><span>План выручки</span><input name="plannedRevenue" type="number" step="0.01" value="${escapeHtml(prodDefaults.plannedRevenue || '')}"></label>
            <label class="wide"><span>Комментарий / примечание</span><textarea name="notes" rows="3" placeholder="Что важно по товару и куда движемся">${escapeHtml(prodDefaults.notes || '')}</textarea></label>
            <div class="v76-actions-row wide">
              <button class="btn" type="submit">${state.v76.ui.editingProductId ? 'Сохранить товар' : 'Добавить товар'}</button>
              ${state.v76.ui.editingProductId ? '<button class="btn ghost" type="button" id="v76ResetProductForm">Сбросить форму</button>' : ''}
            </div>
          </form>
          <datalist id="v76SkuCodes">${(state.skus || []).map((sku) => `<option value="${escapeHtml(sku.articleKey || sku.article || '')}">${escapeHtml(sku.name || '')}</option>`).join('')}</datalist>
        </div>

        <div class="card v76-form-card">
          <div class="section-subhead">
            <div>
              <h3>${state.v76.ui.editingNoveltyId ? 'Редактировать карточку новинки' : 'Завести карточку новинки'}</h3>
              <p class="small muted">Отдельная система ввода новинок: этап, cost, выручка, следующий шаг, блокеры и производство.</p>
            </div>
            ${v76NoveltyStageBadge(noveltyDefaults.stage || 'idea')}
          </div>
          <form id="v76NoveltyForm" class="v76-form-grid">
            <input type="hidden" name="noveltyId" value="${escapeHtml(noveltyDefaults.id || '')}">
            <input type="hidden" name="productId" value="${escapeHtml(noveltyDefaults.productId || '')}">
            <label><span>Код товара</span><input name="productCode" list="v76ProductCodes" value="${escapeHtml(noveltyDefaults.productCode || '')}" placeholder="PRD-123ABC"></label>
            <label class="wide"><span>Название новинки</span><input name="name" value="${escapeHtml(noveltyDefaults.name || '')}" placeholder="Новая новинка"></label>
            <label><span>Категория</span><input name="category" value="${escapeHtml(noveltyDefaults.category || '')}" placeholder="Уход / БАД"></label>
            <label><span>Месяц запуска</span><input name="launchMonth" value="${escapeHtml(noveltyDefaults.launchMonth || '')}" placeholder="Июнь 2026"></label>
            <label><span>Этап</span><select name="stage">${Object.entries(NOVELTY_STAGE_META).map(([key, meta]) => `<option value="${key}" ${noveltyDefaults.stage === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select></label>
            <label><span>Статус текстом</span><input name="statusText" value="${escapeHtml(noveltyDefaults.statusText || '')}" placeholder="Что реально происходит сейчас"></label>
            <label><span>Производство</span><input name="production" value="${escapeHtml(noveltyDefaults.production || '')}" placeholder="Контрактное / собственное"></label>
            <label><span>Target cost</span><input name="targetCost" type="number" step="0.01" value="${escapeHtml(noveltyDefaults.targetCost || '')}"></label>
            <label><span>План выручки</span><input name="plannedRevenue" type="number" step="0.01" value="${escapeHtml(noveltyDefaults.plannedRevenue || '')}"></label>
            <label class="wide"><span>Следующий шаг</span><textarea name="nextStep" rows="2" placeholder="Что делаем дальше">${escapeHtml(noveltyDefaults.nextStep || '')}</textarea></label>
            <label class="wide"><span>Блокеры</span><textarea name="blockers" rows="2" placeholder="Что мешает запуску">${escapeHtml(noveltyDefaults.blockers || '')}</textarea></label>
            <div class="v76-actions-row wide">
              <button class="btn" type="submit">${state.v76.ui.editingNoveltyId ? 'Сохранить карточку' : 'Добавить новинку'}</button>
              ${state.v76.ui.editingNoveltyId ? '<button class="btn ghost" type="button" id="v76ResetNoveltyForm">Сбросить форму</button>' : ''}
            </div>
          </form>
          <datalist id="v76ProductCodes">${(state.v76.store.products || []).map((item) => `<option value="${escapeHtml(item.productCode)}">${escapeHtml(item.name)}</option>`).join('')}</datalist>
        </div>
      </div>

      <div class="grid cards-2 v76-middle-grid">
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Задачник Ксении со сроками</h3>
              <p class="small muted">Свои продуктовые задачи прямо в её вкладке: срок, приоритет, статус и привязка к товару / новинке.</p>
            </div>
            ${v76ManagerSummary(tasks)}
          </div>
          <form id="v76TaskForm" class="v76-form-grid v76-task-form">
            <label class="wide"><span>Товар / новинка</span><select name="entity">${entityOptions.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('')}</select></label>
            <label class="wide"><span>Задача</span><input name="title" placeholder="Например, согласовать калькулятор и цену"></label>
            <label><span>Приоритет</span><select name="priority">${Object.entries(PRIORITY_META).map(([key, meta]) => `<option value="${key}">${escapeHtml(meta.label)}</option>`).join('')}</select></label>
            <label><span>Статус</span><select name="status">${Object.entries(TASK_STATUS_META).map(([key, meta]) => `<option value="${key}">${escapeHtml(meta.label)}</option>`).join('')}</select></label>
            <label><span>Срок</span><input name="due" type="date" value="${todayIso()}"></label>
            <label><span>Owner</span><select name="owner">${ownerOptions().map((name) => `<option value="${escapeHtml(name)}" ${name === 'Ксения' ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>
            <label class="wide"><span>Следующее действие</span><textarea name="nextAction" rows="2" placeholder="Что конкретно нужно сделать"> </textarea></label>
            <label class="wide"><span>Причина / контекст</span><textarea name="reason" rows="2" placeholder="Что случилось и почему задача появилась"></textarea></label>
            <div class="v76-actions-row wide"><button class="btn" type="submit">Добавить задачу</button></div>
          </form>
          <div class="stack" style="margin-top:14px">${tasks.length ? tasks.slice(0, 10).map(renderTaskCard).join('') : '<div class="empty">У Ксении пока нет задач — теперь их можно заводить прямо здесь.</div>'}</div>
        </div>

        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Тетрадь действий</h3>
              <p class="small muted">Хроника по товарам и новинкам: что сделали, что решили, что дальше и к какому сроку.</p>
            </div>
            ${badge(`Записей ${fmt.int(notebook.length)}`, notebook.length ? 'info' : '')}
          </div>
          <form id="v76NotebookForm" class="v76-form-grid v76-task-form">
            <label class="wide"><span>Товар / новинка</span><select name="entity">${entityOptions.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('')}</select></label>
            <label><span>Тип записи</span><select name="kind">${Object.entries(NOTEBOOK_KIND_META).map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join('')}</select></label>
            <label><span>Статус</span><select name="status">${Object.entries(TASK_STATUS_META).map(([key, meta]) => `<option value="${key}">${escapeHtml(meta.label)}</option>`).join('')}</select></label>
            <label><span>Срок</span><input name="due" type="date"></label>
            <label class="wide"><span>Заголовок</span><input name="title" placeholder="Например, созвон с производством"></label>
            <label class="wide"><span>Что сделали / решили</span><textarea name="body" rows="2" placeholder="Коротко фиксируем действие"></textarea></label>
            <label class="wide"><span>Следующий шаг</span><textarea name="nextStep" rows="2" placeholder="Что дальше и к какому сроку"></textarea></label>
            <div class="v76-actions-row wide"><button class="btn" type="submit">Добавить запись</button></div>
          </form>
          <div class="v76-filter-row" style="margin-top:12px">
            <select id="v76NotebookKindFilter"><option value="all">Все типы</option>${Object.entries(NOTEBOOK_KIND_META).map(([key, label]) => `<option value="${key}" ${state.v76.filters.notebookKind === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
          </div>
          <div class="stack" style="margin-top:12px">${notebook.length ? notebook.slice(0, 12).map(v76RenderNotebookItem).join('') : '<div class="empty">Тетрадь действий пока пустая — сюда будут падать и ручные записи, и изменения статусов.</div>'}</div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Реестр товаров директора по товару</h3>
            <p class="small muted">Здесь Ксения видит все товары, меняет статус товара на портале и может заносить новые.</p>
          </div>
          <div class="v76-filter-row">
            <input id="v76ProductSearch" placeholder="Поиск по товару / коду / категории" value="${escapeHtml(state.v76.filters.productSearch)}">
            <select id="v76ProductStatusFilter"><option value="all">Все статусы</option>${Object.entries(PRODUCT_STATUS_META).map(([key, meta]) => `<option value="${key}" ${state.v76.filters.productStatus === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Код / SKU</th>
                <th>Товар</th>
                <th>Статус</th>
                <th>Месяц</th>
                <th>Target cost</th>
                <th>План выручки</th>
                <th>Комментарий</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>${products.map(v76ProductRow).join('') || '<tr><td colspan="8" class="text-center muted">Нет товаров под текущий фильтр</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Карточки новинок</h3>
            <p class="small muted">Система ввода новинок: куда движемся, на каком этапе, какие блокеры и какой следующий шаг.</p>
          </div>
          <div class="v76-filter-row">
            <input id="v76NoveltySearch" placeholder="Поиск по новинке / коду / шагу" value="${escapeHtml(state.v76.filters.noveltySearch)}">
            <select id="v76NoveltyStageFilter"><option value="all">Все этапы</option>${Object.entries(NOVELTY_STAGE_META).map(([key, meta]) => `<option value="${key}" ${state.v76.filters.noveltyStage === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="v76-novelty-list">${novelties.map(v76NoveltyCard).join('') || '<div class="empty">Нет новинок под текущий фильтр</div>'}</div>
      </div>
    `;

    root.querySelector('#v76ProductSearch')?.addEventListener('input', (e) => { state.v76.filters.productSearch = e.target.value; v76RenderProductDirector(); });
    root.querySelector('#v76ProductStatusFilter')?.addEventListener('change', (e) => { state.v76.filters.productStatus = e.target.value; v76RenderProductDirector(); });
    root.querySelector('#v76NoveltySearch')?.addEventListener('input', (e) => { state.v76.filters.noveltySearch = e.target.value; v76RenderProductDirector(); });
    root.querySelector('#v76NoveltyStageFilter')?.addEventListener('change', (e) => { state.v76.filters.noveltyStage = e.target.value; v76RenderProductDirector(); });
    root.querySelector('#v76NotebookKindFilter')?.addEventListener('change', (e) => { state.v76.filters.notebookKind = e.target.value; v76RenderProductDirector(); });

    root.querySelector('#v76ProductForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const prev = state.v76.ui.editingProductId ? v76FindProduct(state.v76.ui.editingProductId) : null;
      const item = v76NormalizeProduct({
        id: fd.get('productId') || undefined,
        productCode: fd.get('productCode') || v76CodeFromName(fd.get('name'), 'PRD'),
        articleKey: fd.get('articleKey') || '',
        name: fd.get('name') || '',
        category: fd.get('category') || '',
        subCategory: fd.get('subCategory') || '',
        status: fd.get('status') || 'idea',
        launchMonth: fd.get('launchMonth') || '',
        targetCost: fd.get('targetCost') || '',
        targetPrice: fd.get('targetPrice') || '',
        minPrice: fd.get('minPrice') || '',
        rrp: fd.get('rrp') || '',
        plannedRevenue: fd.get('plannedRevenue') || '',
        notes: fd.get('notes') || '',
        owner: 'Ксения',
        source: prev?.source || 'manual',
        createdAt: prev?.createdAt || v76Now()
      });
      if (!item.name) return;
      await v76PersistProduct(item, prev?.status || '');
      if (!prev) {
        await v76PersistNotebook({
          entityType: 'product', entityId: item.id, entityCode: item.productCode,
          title: 'Товар заведён в портал', body: `${item.name} добавлен в продуктовый контур Ксении`, nextStep: item.notes || '', due: '', status: 'done', author: state.team.member?.name || 'Ксения', kind: 'action'
        }, false);
      }
      state.v76.ui.editingProductId = '';
      rerenderCurrentView();
    });

    root.querySelector('#v76ResetProductForm')?.addEventListener('click', () => {
      state.v76.ui.editingProductId = '';
      v76RenderProductDirector();
    });

    root.querySelector('#v76NoveltyForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const prev = state.v76.ui.editingNoveltyId ? v76FindNovelty(state.v76.ui.editingNoveltyId) : null;
      const code = String(fd.get('productCode') || v76CodeFromName(fd.get('name'), 'PRD')).trim();
      let product = [...(state.v76.store.products || [])].find((row) => row.productCode === code);
      if (!product) {
        product = await v76PersistProduct(v76NormalizeProduct({
          productCode: code,
          name: fd.get('name') || 'Новая новинка',
          category: fd.get('category') || '',
          status: 'idea',
          launchMonth: fd.get('launchMonth') || '',
          targetCost: fd.get('targetCost') || '',
          plannedRevenue: fd.get('plannedRevenue') || '',
          notes: 'Создан автоматически из карточки новинки',
          owner: 'Ксения',
          source: 'manual'
        }), '');
      }
      const novelty = v76NormalizeNovelty({
        id: fd.get('noveltyId') || undefined,
        productId: product.id,
        productCode: code,
        name: fd.get('name') || '',
        category: fd.get('category') || '',
        launchMonth: fd.get('launchMonth') || '',
        stage: fd.get('stage') || 'idea',
        statusText: fd.get('statusText') || '',
        production: fd.get('production') || '',
        targetCost: fd.get('targetCost') || '',
        plannedRevenue: fd.get('plannedRevenue') || '',
        nextStep: fd.get('nextStep') || '',
        blockers: fd.get('blockers') || '',
        owner: 'Ксения',
        source: prev?.source || 'manual',
        createdAt: prev?.createdAt || v76Now()
      });
      if (!novelty.name) return;
      await v76PersistNovelty(novelty, prev?.stage || '');
      if (!prev) {
        await v76PersistNotebook({
          entityType: 'novelty', entityId: novelty.id, entityCode: novelty.productCode,
          title: 'Карточка новинки заведена', body: `${novelty.name} добавлена в систему ввода новинок`, nextStep: novelty.nextStep || '', due: '', status: 'done', author: state.team.member?.name || 'Ксения', kind: 'launch'
        }, false);
      }
      state.v76.ui.editingNoveltyId = '';
      rerenderCurrentView();
    });

    root.querySelector('#v76ResetNoveltyForm')?.addEventListener('click', () => {
      state.v76.ui.editingNoveltyId = '';
      v76RenderProductDirector();
    });

    root.querySelector('#v76TaskForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const entity = String(fd.get('entity') || '');
      const [entityType, entityId] = entity.split(':');
      const item = entityType === 'novelty' ? v76FindNovelty(entityId) : v76FindProduct(entityId);
      const task = normalizeTask({
        id: uid('task'),
        articleKey: item?.articleKey || item?.productCode || item?.id || '',
        title: fd.get('title') || 'Продуктовая задача',
        nextAction: fd.get('nextAction') || '',
        reason: fd.get('reason') || '',
        owner: fd.get('owner') || 'Ксения',
        due: fd.get('due') || plusDays(3),
        status: fd.get('status') || 'new',
        type: entityType === 'novelty' ? 'launch' : 'general',
        priority: fd.get('priority') || 'medium',
        platform: 'all',
        source: 'ksenia_task',
        entityLabel: item?.name || item?.productCode || 'Продукт'
      }, 'manual');
      state.storage.tasks.unshift(task);
      saveLocalStorage();
      try { await persistTask(task); } catch (error) { console.error(error); }
      await v76PersistNotebook({
        entityType: entityType || 'product', entityId: item?.id || '', entityCode: item?.productCode || '',
        title: 'Поставлена продуктовая задача', body: task.title, nextStep: task.nextAction || '', due: task.due || '', status: task.status, author: state.team.member?.name || 'Ксения', kind: 'action'
      }, false);
      event.target.reset();
      rerenderCurrentView();
    });

    root.querySelector('#v76NotebookForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const entity = String(fd.get('entity') || '');
      const [entityType, entityId] = entity.split(':');
      const item = entityType === 'novelty' ? v76FindNovelty(entityId) : v76FindProduct(entityId);
      await v76PersistNotebook({
        entityType: entityType || 'product',
        entityId: item?.id || '',
        entityCode: item?.productCode || item?.productCode || '',
        title: fd.get('title') || 'Запись',
        body: fd.get('body') || '',
        nextStep: fd.get('nextStep') || '',
        due: fd.get('due') || '',
        status: fd.get('status') || 'new',
        author: state.team.member?.name || 'Ксения',
        kind: fd.get('kind') || 'action'
      });
      event.target.reset();
    });

    root.querySelectorAll('[data-v76-edit-product]').forEach((btn) => btn.addEventListener('click', () => {
      state.v76.ui.editingProductId = btn.dataset.v76EditProduct;
      v76RenderProductDirector();
    }));

    root.querySelectorAll('[data-v76-save-product-status]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.v76SaveProductStatus;
      const product = v76FindProduct(id);
      const select = root.querySelector(`[data-v76-product-status="${CSS.escape(id)}"]`);
      if (!product || !select) return;
      const prev = product.status;
      product.status = select.value;
      await v76PersistProduct(product, prev);
      rerenderCurrentView();
    }));

    root.querySelectorAll('[data-v76-edit-novelty]').forEach((btn) => btn.addEventListener('click', () => {
      state.v76.ui.editingNoveltyId = btn.dataset.v76EditNovelty;
      v76RenderProductDirector();
    }));

    root.querySelectorAll('[data-v76-save-novelty-stage]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.v76SaveNoveltyStage;
      const novelty = v76FindNovelty(id);
      const select = root.querySelector(`[data-v76-novelty-stage="${CSS.escape(id)}"]`);
      if (!novelty || !select) return;
      const prev = novelty.stage;
      novelty.stage = select.value;
      await v76PersistNovelty(novelty, prev);
      rerenderCurrentView();
    }));
  }

  const v76BaseRenderLaunches = renderLaunches;
  renderLaunches = function () {
    v76PatchChrome();
    v76RenderProductDirector();
  };

  const v76BaseRerender = rerenderCurrentView;
  rerenderCurrentView = function () {
    v76PatchChrome();
    v76BaseRerender();
  };

  async function v76WaitForBaseData() {
    let guard = 0;
    while (!(state.launches && state.launches.length) && guard < 60) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 200));
      guard += 1;
    }
  }

  async function v76Init() {
    await v76WaitForBaseData();
    v76PatchChrome();
    v76BootstrapStore();
    if (hasRemoteStore()) await v76PullRemoteOnly();
    if (state.activeView === 'launches') renderLaunches();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', v76Init);
  } else {
    v76Init();
  }
})();
