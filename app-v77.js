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
      editingNoveltyId: '',
      draftProduct: null,
      draftNovelty: null,
      sections: {
        guide: true,
        registry: true,
        novelties: true,
        tasks: true,
        notebook: false
      }
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
  state.v76.ui = Object.assign({ editingProductId: '', editingNoveltyId: '', draftProduct: null, draftNovelty: null, sections: {} }, state.v76.ui || {});
  state.v76.ui.sections = Object.assign({ guide: true, registry: true, novelties: true, tasks: true, notebook: false }, state.v76.ui.sections || {});

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

  function v76EntityOptions() {
    const products = (state.v76.store.products || []).map((item) => ({ value: `product:${item.id}`, label: `${item.name} · ${item.productCode}` }));
    const novelties = (state.v76.store.novelties || []).map((item) => ({ value: `novelty:${item.id}`, label: `Новинка · ${item.name}` }));
    return [...products, ...novelties].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }

  function v76PatchChrome() {
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) brandSub.textContent = 'Imperial v7.8 · продукт · статусы · новинки · контроль';
    const topDesc = document.querySelector('.topbar p');
    if (topDesc) topDesc.textContent = 'v7.8: исправлен runtime-сбой рендера, блок Ксении и ритм работы снова открываются корректно; база онлайн и ошибки интерфейса теперь различаются.';
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


  function v77EmptyProductDraft() {
    return {
      id: 'draft-product',
      productCode: '',
      articleKey: '',
      name: '',
      category: '',
      subCategory: '',
      status: 'idea',
      launchMonth: '',
      targetCost: '',
      targetPrice: '',
      minPrice: '',
      rrp: '',
      plannedRevenue: '',
      owner: 'Ксения',
      notes: ''
    };
  }

  function v77EmptyNoveltyDraft() {
    return {
      id: 'draft-novelty',
      productId: '',
      productCode: '',
      name: '',
      category: '',
      launchMonth: '',
      stage: 'idea',
      statusText: '',
      production: '',
      targetCost: '',
      plannedRevenue: '',
      owner: 'Ксения',
      nextStep: '',
      blockers: ''
    };
  }

  function v77SectionOpen(key) {
    return state.v76.ui.sections?.[key] !== false;
  }

  function v77ToggleSection(key) {
    state.v76.ui.sections[key] = !v77SectionOpen(key);
    v76RenderProductDirector();
  }

  function v77GuideCard(title, body) {
    return `
      <div class="v77-guide-card">
        <strong>${escapeHtml(title)}</strong>
        <div class="muted small">${escapeHtml(body)}</div>
      </div>
    `;
  }

  function v77SectionCard({ key, title, description, hint = '', controls = '', badges = '', body = '' }) {
    const open = v77SectionOpen(key);
    return `
      <div class="card v77-section-card ${open ? '' : 'is-collapsed'}">
        <div class="section-subhead v77-section-head">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p class="small muted">${escapeHtml(description)}</p>
            ${hint ? `<div class="v77-hint">${escapeHtml(hint)}</div>` : ''}
          </div>
          <div class="v77-section-tools">
            ${badges}
            <button class="btn ghost small-btn" type="button" data-v77-toggle-section="${escapeHtml(key)}">${open ? 'Свернуть' : 'Развернуть'}</button>
          </div>
        </div>
        ${open && controls ? `<div class="v77-section-controls">${controls}</div>` : ''}
        ${open ? `<div class="v77-section-body">${body}</div>` : ''}
      </div>
    `;
  }

  function v77ProductDisplayRow(item) {
    const code = item.articleKey ? linkToSku(item.articleKey, item.articleKey) : badge(item.productCode);
    return `
      <tr>
        <td>${code}</td>
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="muted small">${escapeHtml(item.category || '—')} · ${escapeHtml(item.subCategory || '—')}</div>
        </td>
        <td>${v76StatusBadge(item.status)}</td>
        <td>${escapeHtml(item.launchMonth || '—')}</td>
        <td>${fmt.money(item.targetCost)}</td>
        <td>${fmt.money(item.plannedRevenue)}</td>
        <td><div class="muted small">${escapeHtml(item.notes || '—')}</div></td>
        <td>
          <div class="v76-actions-row">
            <button class="btn small-btn" type="button" data-v77-start-edit-product="${escapeHtml(item.id)}">Править в списке</button>
            <button class="btn ghost small-btn" type="button" data-v77-delete-product="${escapeHtml(item.id)}">Удалить</button>
          </div>
        </td>
      </tr>
    `;
  }

  function v77ProductEditorShell(item, isNew = false) {
    return `
      <tr class="v77-edit-shell" data-v77-product-editor="${escapeHtml(item.id)}">
        <td colspan="8">
          <div class="v77-inline-editor">
            <div class="v77-inline-editor-grid">
              <label><span>Код товара</span><input data-field="productCode" value="${escapeHtml(item.productCode || '')}" placeholder="PRD-123ABC"></label>
              <label><span>Артикул SKU</span><input data-field="articleKey" list="v76SkuCodes" value="${escapeHtml(item.articleKey || '')}" placeholder="Если уже есть SKU"></label>
              <label class="wide"><span>Название товара</span><input data-field="name" value="${escapeHtml(item.name || '')}" placeholder="Название товара"></label>
              <label><span>Категория</span><input data-field="category" value="${escapeHtml(item.category || '')}" placeholder="Уход / БАД"></label>
              <label><span>Подкатегория</span><input data-field="subCategory" value="${escapeHtml(item.subCategory || '')}" placeholder="Anti-age"></label>
              <label><span>Статус товара</span><select data-field="status">${Object.entries(PRODUCT_STATUS_META).map(([key, meta]) => `<option value="${key}" ${item.status === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select></label>
              <label><span>Месяц запуска</span><input data-field="launchMonth" value="${escapeHtml(item.launchMonth || '')}" placeholder="Октябрь 2026"></label>
              <label><span>Target cost</span><input data-field="targetCost" type="number" step="0.01" value="${escapeHtml(item.targetCost || '')}"></label>
              <label><span>Target price</span><input data-field="targetPrice" type="number" step="0.01" value="${escapeHtml(item.targetPrice || '')}"></label>
              <label><span>Min price</span><input data-field="minPrice" type="number" step="0.01" value="${escapeHtml(item.minPrice || '')}"></label>
              <label><span>RRP</span><input data-field="rrp" type="number" step="0.01" value="${escapeHtml(item.rrp || '')}"></label>
              <label><span>План выручки</span><input data-field="plannedRevenue" type="number" step="0.01" value="${escapeHtml(item.plannedRevenue || '')}"></label>
              <label class="wide"><span>Комментарий / куда движемся</span><textarea data-field="notes" rows="3" placeholder="Что важно по товару, на каком он этапе, что дальше">${escapeHtml(item.notes || '')}</textarea></label>
            </div>
            <div class="v76-actions-row">
              <button class="btn" type="button" data-v77-save-product="${escapeHtml(item.id)}">${isNew ? 'Сохранить товар' : 'Сохранить изменения'}</button>
              <button class="btn ghost" type="button" data-v77-cancel-product="${escapeHtml(item.id)}">Отменить</button>
              ${isNew ? '' : `<button class="btn ghost" type="button" data-v77-delete-product="${escapeHtml(item.id)}">Удалить</button>`}
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  function v77NoveltyDisplayCard(item) {
    return `
      <div class="v77-novelty-card">
        <div class="head">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <div class="muted small">${escapeHtml(item.productCode || '—')} · ${escapeHtml(item.category || '—')} · ${escapeHtml(item.launchMonth || '—')}</div>
          </div>
          <div class="badge-stack">${v76NoveltyStageBadge(item.stage)}</div>
        </div>
        <div class="v77-novelty-grid">
          <div><span>Target cost</span><strong>${fmt.money(item.targetCost)}</strong></div>
          <div><span>План выручки</span><strong>${fmt.money(item.plannedRevenue)}</strong></div>
          <div><span>Производство</span><strong>${escapeHtml(item.production || '—')}</strong></div>
          <div><span>Owner</span><strong>${escapeHtml(item.owner || 'Ксения')}</strong></div>
        </div>
        <div class="muted small"><strong>Статус:</strong> ${escapeHtml(item.statusText || '—')}</div>
        <div class="muted small"><strong>Следующий шаг:</strong> ${escapeHtml(item.nextStep || '—')}</div>
        ${item.blockers ? `<div class="muted small"><strong>Блокеры:</strong> ${escapeHtml(item.blockers)}</div>` : ''}
        <div class="v76-actions-row">
          <button class="btn small-btn" type="button" data-v77-start-edit-novelty="${escapeHtml(item.id)}">Править карточку</button>
          <button class="btn ghost small-btn" type="button" data-v77-delete-novelty="${escapeHtml(item.id)}">Удалить</button>
        </div>
      </div>
    `;
  }

  function v77NoveltyEditorCard(item, isNew = false) {
    return `
      <div class="v77-novelty-card v77-novelty-editor" data-v77-novelty-editor="${escapeHtml(item.id)}">
        <div class="head">
          <div>
            <strong>${isNew ? 'Новая карточка новинки' : 'Редактирование карточки новинки'}</strong>
            <div class="muted small">Новинка = один pipeline: этап, блокеры, производство, следующий шаг и план.</div>
          </div>
          <div class="badge-stack">${v76NoveltyStageBadge(item.stage || 'idea')}</div>
        </div>
        <div class="v77-inline-editor-grid">
          <label><span>Код товара</span><input data-field="productCode" list="v76ProductCodes" value="${escapeHtml(item.productCode || '')}" placeholder="PRD-123ABC"></label>
          <label class="wide"><span>Название новинки</span><input data-field="name" value="${escapeHtml(item.name || '')}" placeholder="Новая новинка"></label>
          <label><span>Категория</span><input data-field="category" value="${escapeHtml(item.category || '')}" placeholder="Уход / БАД"></label>
          <label><span>Месяц запуска</span><input data-field="launchMonth" value="${escapeHtml(item.launchMonth || '')}" placeholder="Июль 2026"></label>
          <label><span>Этап</span><select data-field="stage">${Object.entries(NOVELTY_STAGE_META).map(([key, meta]) => `<option value="${key}" ${item.stage === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select></label>
          <label><span>Статус текстом</span><input data-field="statusText" value="${escapeHtml(item.statusText || '')}" placeholder="Что реально происходит сейчас"></label>
          <label><span>Производство</span><input data-field="production" value="${escapeHtml(item.production || '')}" placeholder="Контрактное / собственное"></label>
          <label><span>Target cost</span><input data-field="targetCost" type="number" step="0.01" value="${escapeHtml(item.targetCost || '')}"></label>
          <label><span>План выручки</span><input data-field="plannedRevenue" type="number" step="0.01" value="${escapeHtml(item.plannedRevenue || '')}"></label>
          <label class="wide"><span>Следующий шаг</span><textarea data-field="nextStep" rows="2" placeholder="Что делаем дальше">${escapeHtml(item.nextStep || '')}</textarea></label>
          <label class="wide"><span>Блокеры</span><textarea data-field="blockers" rows="2" placeholder="Что мешает запуску">${escapeHtml(item.blockers || '')}</textarea></label>
        </div>
        <div class="v76-actions-row">
          <button class="btn" type="button" data-v77-save-novelty="${escapeHtml(item.id)}">${isNew ? 'Сохранить новинку' : 'Сохранить изменения'}</button>
          <button class="btn ghost" type="button" data-v77-cancel-novelty="${escapeHtml(item.id)}">Отменить</button>
          ${isNew ? '' : `<button class="btn ghost" type="button" data-v77-delete-novelty="${escapeHtml(item.id)}">Удалить</button>`}
        </div>
      </div>
    `;
  }

  async function v77DeleteRemoteRow(table, id) {
    if (!hasRemoteStore() || state.v76.remote.schemaReady === false || !id) return;
    const response = await state.team.client.from(table).delete().eq('brand', currentBrand()).eq('id', id);
    if (response.error) throw response.error;
  }

  async function v77DeleteProduct(id) {
    const item = v76FindProduct(id);
    if (!item) return;
    const linkedNovelties = (state.v76.store.novelties || []).filter((row) => row.productId === id || row.productCode === item.productCode).length;
    const question = linkedNovelties
      ? `Удалить товар «${item.name}»? Связанные карточки новинок останутся в списке, но товар исчезнет из матрицы.`
      : `Удалить товар «${item.name}» из реестра?`;
    if (!window.confirm(question)) return;
    state.v76.store.products = (state.v76.store.products || []).filter((row) => row.id !== id);
    v76SaveLocalStore();
    try { await v77DeleteRemoteRow(V76_TABLES.products, id); } catch (error) { console.error(error); }
    await v76PersistNotebook({
      entityType: 'product',
      entityId: id,
      entityCode: item.productCode,
      title: 'Товар удалён из продуктового реестра',
      body: item.name,
      nextStep: '',
      due: '',
      status: 'done',
      author: state.team.member?.name || 'Ксения',
      kind: 'matrix'
    }, false);
    state.v76.ui.editingProductId = '';
    state.v76.ui.draftProduct = null;
    rerenderCurrentView();
  }

  async function v77DeleteNovelty(id) {
    const item = v76FindNovelty(id);
    if (!item) return;
    if (!window.confirm(`Удалить карточку новинки «${item.name}»?`)) return;
    state.v76.store.novelties = (state.v76.store.novelties || []).filter((row) => row.id !== id);
    v76SaveLocalStore();
    try { await v77DeleteRemoteRow(V76_TABLES.novelties, id); } catch (error) { console.error(error); }
    await v76PersistNotebook({
      entityType: 'novelty',
      entityId: id,
      entityCode: item.productCode,
      title: 'Карточка новинки удалена',
      body: item.name,
      nextStep: '',
      due: '',
      status: 'done',
      author: state.team.member?.name || 'Ксения',
      kind: 'launch'
    }, false);
    state.v76.ui.editingNoveltyId = '';
    state.v76.ui.draftNovelty = null;
    rerenderCurrentView();
  }

  function v77CollectFields(container) {
    const payload = {};
    container.querySelectorAll('[data-field]').forEach((field) => {
      payload[field.dataset.field] = field.value;
    });
    return payload;
  }

  function v77ProductRowsHtml(products) {
    const rows = [];
    if (state.v76.ui.editingProductId === 'draft-product') {
      rows.push(v77ProductEditorShell(state.v76.ui.draftProduct || v77EmptyProductDraft(), true));
    }
    for (const item of products) {
      if (state.v76.ui.editingProductId === item.id) rows.push(v77ProductEditorShell(item, false));
      else rows.push(v77ProductDisplayRow(item));
    }
    return rows.join('') || '<tr><td colspan="8" class="text-center muted">Нет товаров под текущий фильтр</td></tr>';
  }

  function v77NoveltyCardsHtml(novelties) {
    const cards = [];
    if (state.v76.ui.editingNoveltyId === 'draft-novelty') {
      cards.push(v77NoveltyEditorCard(state.v76.ui.draftNovelty || v77EmptyNoveltyDraft(), true));
    }
    for (const item of novelties) {
      if (state.v76.ui.editingNoveltyId === item.id) cards.push(v77NoveltyEditorCard(item, false));
      else cards.push(v77NoveltyDisplayCard(item));
    }
    return cards.join('') || '<div class="empty">Нет новинок под текущий фильтр</div>';
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
    const waitingTasks = activeTasks.filter((task) => task.status === 'waiting_decision');
    const entityOptions = v76EntityOptions();
    const remoteNoteKind = state.v76.remote.schemaReady === false ? 'warn' : state.v76.remote.error ? 'danger' : hasRemoteStore() ? 'ok' : '';

    const guide = v77SectionCard({
      key: 'guide',
      title: 'Как работать в блоке Ксении',
      description: 'Четыре понятных слоя вместо перегруженной формы сверху.',
      badges: badge(`Синк ${hasRemoteStore() ? 'включён' : 'локально'}`, hasRemoteStore() ? 'ok' : ''),
      body: `
        <div class="v77-guide-grid">
          ${v77GuideCard('Реестр товаров', 'Матрица товаров. Здесь меняется статус товара, экономика и комментарий. Новый товар добавляется кнопкой прямо в список.')}
          ${v77GuideCard('Карточки новинок', 'Каждая карточка = одна новинка. Здесь храним этап, блокеры, производство, следующий шаг и план выручки.')}
          ${v77GuideCard('Задачник Ксении', 'Личные продуктовые задачи со сроками, приоритетом и статусом. Всё, что Ксения делает в работе, видно здесь.')}
          ${v77GuideCard('Тетрадь действий', 'Журнал решений и действий по товарам и новинкам: что сделано, что решили и что дальше.')}
        </div>
      `
    });

    const registryControls = `
      <div class="v77-toolbar-row">
        <input id="v76ProductSearch" placeholder="Поиск по товару / коду / категории" value="${escapeHtml(state.v76.filters.productSearch)}">
        <select id="v76ProductStatusFilter"><option value="all">Все статусы</option>${Object.entries(PRODUCT_STATUS_META).map(([key, meta]) => `<option value="${key}" ${state.v76.filters.productStatus === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
        <button class="btn" type="button" data-v77-add-product>Добавить товар</button>
      </div>
    `;

    const noveltyControls = `
      <div class="v77-toolbar-row">
        <input id="v76NoveltySearch" placeholder="Поиск по новинке / коду / шагу" value="${escapeHtml(state.v76.filters.noveltySearch)}">
        <select id="v76NoveltyStageFilter"><option value="all">Все этапы</option>${Object.entries(NOVELTY_STAGE_META).map(([key, meta]) => `<option value="${key}" ${state.v76.filters.noveltyStage === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
        <button class="btn" type="button" data-v77-add-novelty>Добавить новинку</button>
      </div>
    `;

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Продукт / Ксения</h2>
          <p>Продуктовый контур Ксении: матрица товаров, новинки, личные продуктовые задачи и тетрадь действий — в одном месте.</p>
        </div>
        <div class="badge-stack">
          ${badge(`Товаров ${fmt.int(products.length)}`, 'info')}
          ${badge(`Новинок ${fmt.int(novelties.length)}`, novelties.length ? 'warn' : '')}
          ${badge(`Активных задач ${fmt.int(activeTasks.length)}`, activeTasks.length ? 'info' : '')}
          ${badge(`Просрочено ${fmt.int(overdueTasks.length)}`, overdueTasks.length ? 'danger' : 'ok')}
        </div>
      </div>

      <div class="v76-sync-note">${badge(state.v76.remote.note || 'Локальное хранение', remoteNoteKind)}</div>

      ${guide}

      ${v77SectionCard({
        key: 'registry',
        title: 'Реестр товаров директора по товару',
        description: 'Таблица матрицы товаров. Здесь Ксения меняет статус товара и экономику прямо в строке списка.',
        hint: 'Для нового товара нажмите «Добавить товар» — редактируемая строка появится сразу внутри таблицы.',
        badges: badge(`В матрице ${fmt.int(products.length)}`, 'info'),
        controls: registryControls,
        body: `
          <datalist id="v76SkuCodes">${(state.skus || []).map((sku) => `<option value="${escapeHtml(sku.articleKey || sku.article || '')}">${escapeHtml(sku.name || '')}</option>`).join('')}</datalist>
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
              <tbody>${v77ProductRowsHtml(products)}</tbody>
            </table>
          </div>
        `
      })}

      ${v77SectionCard({
        key: 'novelties',
        title: 'Карточки новинок',
        description: 'Pipeline запуска: одна карточка = одна новинка. Этап, блокеры, следующий шаг, cost, выручка и производство.',
        hint: 'Для новой новинки нажмите «Добавить новинку» — карточка откроется прямо в этом списке. Здесь же её редактируем и удаляем.',
        badges: badge(`Новинок ${fmt.int(novelties.length)}`, novelties.length ? 'warn' : ''),
        controls: `${noveltyControls}<datalist id="v76ProductCodes">${(state.v76.store.products || []).map((item) => `<option value="${escapeHtml(item.productCode)}">${escapeHtml(item.name)}</option>`).join('')}</datalist>`,
        body: `<div class="v77-novelty-list">${v77NoveltyCardsHtml(novelties)}</div>`
      })}

      ${v77SectionCard({
        key: 'tasks',
        title: 'Задачник Ксении со сроками',
        description: 'Личные продуктовые задачи с дедлайном, приоритетом и статусом.',
        hint: 'Сюда попадают задачи по товарам, новинкам, ценам, калькуляторам и матрице. Это персональный список действий Ксении.',
        badges: v76ManagerSummary(tasks),
        body: `
          <form id="v76TaskForm" class="v76-form-grid v76-task-form">
            <label class="wide"><span>Товар / новинка</span><select name="entity">${entityOptions.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('')}</select></label>
            <label class="wide"><span>Задача</span><input name="title" placeholder="Например, согласовать калькулятор и цену"></label>
            <label><span>Приоритет</span><select name="priority">${Object.entries(PRIORITY_META).map(([key, meta]) => `<option value="${key}">${escapeHtml(meta.label)}</option>`).join('')}</select></label>
            <label><span>Статус</span><select name="status">${Object.entries(TASK_STATUS_META).map(([key, meta]) => `<option value="${key}">${escapeHtml(meta.label)}</option>`).join('')}</select></label>
            <label><span>Срок</span><input name="due" type="date" value="${escapeHtml(plusDays(3))}"></label>
            <label><span>Owner</span><select name="owner">${ownerOptions().map((owner) => `<option value="${escapeHtml(owner)}" ${owner === 'Ксения' ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}</select></label>
            <label class="wide"><span>Следующее действие</span><textarea name="nextAction" rows="2" placeholder="Что именно делаем"></textarea></label>
            <label class="wide"><span>Контекст / причина</span><textarea name="reason" rows="2" placeholder="Почему появилась задача"></textarea></label>
            <div class="v76-actions-row wide"><button class="btn" type="submit">Поставить задачу</button></div>
          </form>
          <div class="stack" style="margin-top:14px">${tasks.length ? tasks.slice(0, 12).map(renderTaskCard).join('') : '<div class="empty">У Ксении пока нет задач — теперь их можно заводить прямо здесь.</div>'}</div>
        `
      })}

      ${v77SectionCard({
        key: 'notebook',
        title: 'Тетрадь действий',
        description: 'Хроника по товарам и новинкам: решения, действия, что сделали и что дальше.',
        hint: 'Здесь фиксируем продуктовые решения, встречи с производством, изменения статусов и важные шаги по новинкам.',
        badges: badge(`Записей ${fmt.int(notebook.length)}`, notebook.length ? 'info' : ''),
        controls: `<div class="v77-toolbar-row"><select id="v76NotebookKindFilter"><option value="all">Все типы</option>${Object.entries(NOTEBOOK_KIND_META).map(([key, label]) => `<option value="${key}" ${state.v76.filters.notebookKind === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></div>`,
        body: `
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
          <div class="stack" style="margin-top:12px">${notebook.length ? notebook.slice(0, 12).map(v76RenderNotebookItem).join('') : '<div class="empty">Тетрадь действий пока пустая — сюда будут падать и ручные записи, и изменения статусов.</div>'}</div>
        `
      })}
    `;

    const productSearch = root.querySelector('#v76ProductSearch');
    if (productSearch) productSearch.addEventListener('input', (e) => { state.v76.filters.productSearch = e.target.value; v76RenderProductDirector(); });
    const productStatusFilter = root.querySelector('#v76ProductStatusFilter');
    if (productStatusFilter) productStatusFilter.addEventListener('change', (e) => { state.v76.filters.productStatus = e.target.value; v76RenderProductDirector(); });
    const noveltySearch = root.querySelector('#v76NoveltySearch');
    if (noveltySearch) noveltySearch.addEventListener('input', (e) => { state.v76.filters.noveltySearch = e.target.value; v76RenderProductDirector(); });
    const noveltyStageFilter = root.querySelector('#v76NoveltyStageFilter');
    if (noveltyStageFilter) noveltyStageFilter.addEventListener('change', (e) => { state.v76.filters.noveltyStage = e.target.value; v76RenderProductDirector(); });
    const notebookKindFilter = root.querySelector('#v76NotebookKindFilter');
    if (notebookKindFilter) notebookKindFilter.addEventListener('change', (e) => { state.v76.filters.notebookKind = e.target.value; v76RenderProductDirector(); });

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
        entityCode: item?.productCode || '',
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

    root.querySelectorAll('[data-v77-toggle-section]').forEach((btn) => btn.addEventListener('click', () => v77ToggleSection(btn.dataset.v77ToggleSection)));
    root.querySelectorAll('[data-v77-add-product]').forEach((btn) => btn.addEventListener('click', () => {
      state.v76.ui.editingProductId = 'draft-product';
      state.v76.ui.draftProduct = v77EmptyProductDraft();
      v76RenderProductDirector();
    }));
    root.querySelectorAll('[data-v77-add-novelty]').forEach((btn) => btn.addEventListener('click', () => {
      state.v76.ui.editingNoveltyId = 'draft-novelty';
      state.v76.ui.draftNovelty = v77EmptyNoveltyDraft();
      v76RenderProductDirector();
    }));
    root.querySelectorAll('[data-v77-start-edit-product]').forEach((btn) => btn.addEventListener('click', () => {
      state.v76.ui.editingProductId = btn.dataset.v77StartEditProduct;
      state.v76.ui.draftProduct = null;
      v76RenderProductDirector();
    }));
    root.querySelectorAll('[data-v77-cancel-product]').forEach((btn) => btn.addEventListener('click', () => {
      state.v76.ui.editingProductId = '';
      state.v76.ui.draftProduct = null;
      v76RenderProductDirector();
    }));
    root.querySelectorAll('[data-v77-save-product]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.v77SaveProduct;
      const editor = root.querySelector(`[data-v77-product-editor="${CSS.escape(id)}"]`);
      if (!editor) return;
      const data = v77CollectFields(editor);
      const prev = id === 'draft-product' ? null : v76FindProduct(id);
      const normalized = v76NormalizeProduct({
        id: prev?.id,
        productCode: data.productCode || prev?.productCode || v76CodeFromName(data.name, 'PRD'),
        articleKey: data.articleKey || '',
        name: data.name || '',
        category: data.category || '',
        subCategory: data.subCategory || '',
        status: data.status || 'idea',
        launchMonth: data.launchMonth || '',
        targetCost: data.targetCost || '',
        targetPrice: data.targetPrice || '',
        minPrice: data.minPrice || '',
        rrp: data.rrp || '',
        plannedRevenue: data.plannedRevenue || '',
        notes: data.notes || '',
        owner: 'Ксения',
        source: prev?.source || 'manual',
        createdAt: prev?.createdAt || v76Now()
      });
      if (!normalized.name) { window.alert('Нужно указать название товара.'); return; }
      await v76PersistProduct(normalized, prev?.status || '');
      if (!prev) {
        await v76PersistNotebook({
          entityType: 'product', entityId: normalized.id, entityCode: normalized.productCode,
          title: 'Товар заведён в портал', body: `${normalized.name} добавлен в продуктовый контур Ксении`, nextStep: normalized.notes || '', due: '', status: 'done', author: state.team.member?.name || 'Ксения', kind: 'matrix'
        }, false);
      }
      state.v76.ui.editingProductId = '';
      state.v76.ui.draftProduct = null;
      rerenderCurrentView();
    }));
    root.querySelectorAll('[data-v77-delete-product]').forEach((btn) => btn.addEventListener('click', async () => { await v77DeleteProduct(btn.dataset.v77DeleteProduct); }));

    root.querySelectorAll('[data-v77-start-edit-novelty]').forEach((btn) => btn.addEventListener('click', () => {
      state.v76.ui.editingNoveltyId = btn.dataset.v77StartEditNovelty;
      state.v76.ui.draftNovelty = null;
      v76RenderProductDirector();
    }));
    root.querySelectorAll('[data-v77-cancel-novelty]').forEach((btn) => btn.addEventListener('click', () => {
      state.v76.ui.editingNoveltyId = '';
      state.v76.ui.draftNovelty = null;
      v76RenderProductDirector();
    }));
    root.querySelectorAll('[data-v77-save-novelty]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.v77SaveNovelty;
      const editor = root.querySelector(`[data-v77-novelty-editor="${CSS.escape(id)}"]`);
      if (!editor) return;
      const data = v77CollectFields(editor);
      const prev = id === 'draft-novelty' ? null : v76FindNovelty(id);
      const code = String(data.productCode || prev?.productCode || v76CodeFromName(data.name, 'PRD')).trim();
      let product = [...(state.v76.store.products || [])].find((row) => row.productCode === code);
      if (!product) {
        product = await v76PersistProduct(v76NormalizeProduct({
          productCode: code,
          name: data.name || 'Новая новинка',
          category: data.category || '',
          status: 'idea',
          launchMonth: data.launchMonth || '',
          targetCost: data.targetCost || '',
          plannedRevenue: data.plannedRevenue || '',
          notes: 'Создан автоматически из карточки новинки',
          owner: 'Ксения',
          source: 'manual'
        }), '');
      }
      const novelty = v76NormalizeNovelty({
        id: prev?.id,
        productId: product.id,
        productCode: code,
        name: data.name || '',
        category: data.category || '',
        launchMonth: data.launchMonth || '',
        stage: data.stage || 'idea',
        statusText: data.statusText || '',
        production: data.production || '',
        targetCost: data.targetCost || '',
        plannedRevenue: data.plannedRevenue || '',
        nextStep: data.nextStep || '',
        blockers: data.blockers || '',
        owner: 'Ксения',
        source: prev?.source || 'manual',
        createdAt: prev?.createdAt || v76Now()
      });
      if (!novelty.name) { window.alert('Нужно указать название новинки.'); return; }
      await v76PersistNovelty(novelty, prev?.stage || '');
      if (!prev) {
        await v76PersistNotebook({
          entityType: 'novelty', entityId: novelty.id, entityCode: novelty.productCode,
          title: 'Карточка новинки заведена', body: `${novelty.name} добавлена в pipeline новинок`, nextStep: novelty.nextStep || '', due: '', status: 'done', author: state.team.member?.name || 'Ксения', kind: 'launch'
        }, false);
      }
      state.v76.ui.editingNoveltyId = '';
      state.v76.ui.draftNovelty = null;
      rerenderCurrentView();
    }));
    root.querySelectorAll('[data-v77-delete-novelty]').forEach((btn) => btn.addEventListener('click', async () => { await v77DeleteNovelty(btn.dataset.v77DeleteNovelty); }));
  }

  const v76BaseRenderLaunches = renderLaunches;
  renderLaunches = function () {
    v76PatchChrome();
    try {
      v76RenderProductDirector();
    } catch (error) {
      console.error(error);
      const root = document.getElementById('view-launches');
      if (root) {
        root.innerHTML = `
          <div class="card">
            <div class="head">
              <div>
                <h3>Продукт / Ксения</h3>
                <div class="muted small">Блок не удалось загрузить полностью</div>
              </div>
              ${badge('ошибка', 'danger')}
            </div>
            <div class="muted" style="margin-top:10px">${escapeHtml(error.message || 'Неизвестная ошибка')}</div>
          </div>
        `;
      }
      throw error;
    }
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
