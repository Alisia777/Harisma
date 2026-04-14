(function () {
  const OLD_KEY = 'brand-portal-v76-product-v1';
  const NEW_KEY = 'brand-portal-v80-product-v2';
  const TABLES = {
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

  const EXEC_FILTERS = ['active', 'overdue', 'critical', 'waiting', 'noOwnerTasks', 'unassignedSkus'];

  state.v80 = Object.assign({
    payloadSupported: null,
    filters: {
      productSearch: '',
      productStatus: 'all',
      productPlanMonth: 'all',
      productFactMonth: 'all',
      productRiskOnly: false,
      noveltySearch: '',
      noveltyStage: 'all',
      noveltyPlanMonth: 'all',
      noveltyFactMonth: 'all',
      noveltyRiskOnly: false,
      notebookKind: 'all'
    },
    ui: {
      editingProductId: '',
      editingNoveltyId: '',
      sections: {
        guide: true,
        registry: true,
        novelties: true,
        tasks: true,
        notebook: false
      }
    },
    executive: {
      filter: 'overdue'
    },
    launchChecklist: null
  }, state.v80 || {});

  function n(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function empty(value) {
    return value === null || value === undefined || value === '';
  }

  function uidSafe(prefix) {
    if (typeof uid === 'function') return uid(prefix);
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function stableIdSafe(prefix, key) {
    if (typeof stableId === 'function') return stableId(prefix, key);
    return `${prefix}-${btoa(unescape(encodeURIComponent(String(key || Math.random())))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;
  }

  function currentBrandSafe() {
    try { return typeof currentBrand === 'function' ? currentBrand() : 'Алтея'; } catch { return 'Алтея'; }
  }

  function monthMap() {
    return {
      'Январь': 1, 'Февраль': 2, 'Март': 3, 'Апрель': 4, 'Май': 5, 'Июнь': 6,
      'Июль': 7, 'Август': 8, 'Сентябрь': 9, 'Октябрь': 10, 'Ноябрь': 11, 'Декабрь': 12
    };
  }

  function monthKey(label) {
    const raw = String(label || '').trim();
    if (!raw) return '';
    const parts = raw.split(/\s+/);
    const month = monthMap()[parts[0]] || 0;
    const year = Number(parts[1]) || 0;
    if (!month || !year) return '';
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  function monthDelay(planLabel, factLabel) {
    const a = monthKey(planLabel);
    const b = monthKey(factLabel);
    if (!a || !b) return null;
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return (by - ay) * 12 + (bm - am);
  }

  function calcWorkPrice(row) {
    if (!empty(row.targetPrice)) return n(row.targetPrice);
    if (!empty(row.mrp) && !empty(row.maxDiscountPct)) return n(row.mrp) * (1 - (n(row.maxDiscountPct) / 100));
    if (!empty(row.rrp)) return n(row.rrp);
    if (!empty(row.minPrice)) return n(row.minPrice);
    return null;
  }

  function calcPlannedUnits(row) {
    if (!empty(row.plannedUnits)) return n(row.plannedUnits);
    const price = calcWorkPrice(row);
    if (!price) return null;
    const revenue = n(row.plannedRevenue);
    return revenue ? revenue / price : null;
  }

  function calcInvestmentsTotal(row) {
    if (!empty(row.investmentsTotal)) return n(row.investmentsTotal);
    return n(row.investmentDevelopment) + n(row.investmentFirstBatch) + n(row.investmentOther);
  }

  function calcContribution(row) {
    const price = calcWorkPrice(row);
    const cost = n(row.targetCost);
    if (!price) return null;
    return price - cost;
  }

  function calcBreakEvenUnits(row) {
    if (!empty(row.breakEvenUnits)) return n(row.breakEvenUnits);
    const contribution = calcContribution(row);
    const investments = calcInvestmentsTotal(row);
    if (!investments || !contribution || contribution <= 0) return null;
    return investments / contribution;
  }

  function calcBreakEvenMonths(row) {
    if (!empty(row.breakEvenMonths)) return n(row.breakEvenMonths);
    const beUnits = calcBreakEvenUnits(row);
    const periodMonths = n(row.revenuePeriodMonths) || 3;
    const planUnits = calcPlannedUnits(row);
    if (!beUnits || !planUnits || periodMonths <= 0) return null;
    const monthlyUnits = planUnits / periodMonths;
    if (!monthlyUnits) return null;
    return beUnits / monthlyUnits;
  }

  function calcRoiPct(row) {
    if (!empty(row.roiPct)) return n(row.roiPct);
    const investments = calcInvestmentsTotal(row);
    const revenue = n(row.plannedRevenue);
    const planUnits = calcPlannedUnits(row);
    const targetCost = n(row.targetCost);
    if (!investments) return null;
    const grossProfit = revenue - (planUnits || 0) * targetCost;
    return ((grossProfit - investments) / investments) * 100;
  }

  function toBool(value) {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'да', 'risk', 'on'].includes(String(value || '').toLowerCase());
  }

  function ensurePayload(obj) {
    return obj && typeof obj === 'object' ? obj : {};
  }

  function normalizeProduct(item = {}) {
    const payload = ensurePayload(item.payload_json || item.payload || item.meta || {});
    const row = {
      id: item.id || stableIdSafe('product', `${item.product_code || item.productCode || item.code || ''}|${item.name || ''}`),
      productCode: String(item.product_code || item.productCode || item.code || '').trim() || stableIdSafe('prd', item.name || Math.random()).slice(0, 10).toUpperCase(),
      articleKey: String(item.article_key || item.articleKey || '').trim(),
      name: String(item.name || 'Новый товар').trim() || 'Новый товар',
      category: String(item.category || '').trim(),
      subCategory: String(item.sub_category || item.subCategory || '').trim(),
      status: PRODUCT_STATUS_META[item.status || payload.status] ? (item.status || payload.status) : 'idea',
      launchMonth: String(item.launch_month || item.launchMonth || payload.launchMonth || '').trim(),
      launchMonthFact: String(payload.launchMonthFact || item.launch_month_fact || '').trim(),
      targetCost: item.target_cost ?? item.targetCost ?? payload.targetCost ?? '',
      targetPrice: item.target_price ?? item.targetPrice ?? payload.targetPrice ?? '',
      minPrice: item.min_price ?? item.minPrice ?? payload.minPrice ?? '',
      rrp: item.rrp ?? payload.rrp ?? '',
      mrp: item.mrp ?? payload.mrp ?? '',
      maxDiscountPct: item.max_discount_pct ?? payload.maxDiscountPct ?? '',
      plannedRevenue: item.planned_revenue ?? item.plannedRevenue ?? payload.plannedRevenue ?? '',
      revenuePeriodMonths: item.revenue_period_months ?? payload.revenuePeriodMonths ?? 3,
      plannedUnits: item.planned_units ?? payload.plannedUnits ?? '',
      investmentDevelopment: item.investment_development ?? payload.investmentDevelopment ?? '',
      investmentFirstBatch: item.investment_first_batch ?? payload.investmentFirstBatch ?? '',
      investmentOther: item.investment_other ?? payload.investmentOther ?? '',
      investmentsTotal: item.investments_total ?? payload.investmentsTotal ?? '',
      breakEvenUnits: item.break_even_units ?? payload.breakEvenUnits ?? '',
      breakEvenMonths: item.break_even_months ?? payload.breakEvenMonths ?? '',
      roiPct: item.roi_pct ?? payload.roiPct ?? '',
      risk: toBool(item.risk ?? payload.risk),
      owner: String(item.owner || payload.owner || 'Ксения').trim() || 'Ксения',
      notes: String(item.notes || payload.notes || '').trim(),
      briefUrl: String(payload.briefUrl || '').trim(),
      recipeUrl: String(payload.recipeUrl || '').trim(),
      designUrl: String(payload.designUrl || '').trim(),
      contractUrl: String(payload.contractUrl || '').trim(),
      source: String(item.source || payload.source || 'manual').trim() || 'manual',
      createdAt: item.created_at || item.createdAt || payload.createdAt || new Date().toISOString(),
      updatedAt: item.updated_at || item.updatedAt || payload.updatedAt || new Date().toISOString()
    };
    row.workingPrice = calcWorkPrice(row);
    row.plannedUnitsCalc = calcPlannedUnits(row);
    row.investmentsTotalCalc = calcInvestmentsTotal(row);
    row.breakEvenUnitsCalc = calcBreakEvenUnits(row);
    row.breakEvenMonthsCalc = calcBreakEvenMonths(row);
    row.roiPctCalc = calcRoiPct(row);
    row.delayMonths = monthDelay(row.launchMonth, row.launchMonthFact);
    return row;
  }

  function normalizeNovelty(item = {}) {
    const payload = ensurePayload(item.payload_json || item.payload || item.meta || {});
    const row = {
      id: item.id || stableIdSafe('novelty', `${item.product_code || item.productCode || ''}|${item.name || ''}|${item.launch_month || item.launchMonth || ''}`),
      productId: String(item.product_id || item.productId || '').trim(),
      productCode: String(item.product_code || item.productCode || '').trim(),
      name: String(item.name || 'Новая новинка').trim() || 'Новая новинка',
      category: String(item.category || '').trim(),
      launchMonth: String(item.launch_month || item.launchMonth || payload.launchMonth || '').trim(),
      launchMonthFact: String(payload.launchMonthFact || item.launch_month_fact || '').trim(),
      stage: NOVELTY_STAGE_META[item.stage || payload.stage] ? (item.stage || payload.stage) : 'idea',
      statusText: String(item.status_text || item.statusText || payload.statusText || '').trim(),
      production: String(item.production || payload.production || '').trim(),
      targetCost: item.target_cost ?? item.targetCost ?? payload.targetCost ?? '',
      mrp: item.mrp ?? payload.mrp ?? '',
      maxDiscountPct: item.max_discount_pct ?? payload.maxDiscountPct ?? '',
      plannedRevenue: item.planned_revenue ?? item.plannedRevenue ?? payload.plannedRevenue ?? '',
      revenuePeriodMonths: item.revenue_period_months ?? payload.revenuePeriodMonths ?? 3,
      plannedUnits: item.planned_units ?? payload.plannedUnits ?? '',
      investmentDevelopment: item.investment_development ?? payload.investmentDevelopment ?? '',
      investmentFirstBatch: item.investment_first_batch ?? payload.investmentFirstBatch ?? '',
      investmentOther: item.investment_other ?? payload.investmentOther ?? '',
      investmentsTotal: item.investments_total ?? payload.investmentsTotal ?? '',
      breakEvenUnits: item.break_even_units ?? payload.breakEvenUnits ?? '',
      breakEvenMonths: item.break_even_months ?? payload.breakEvenMonths ?? '',
      roiPct: item.roi_pct ?? payload.roiPct ?? '',
      risk: toBool(item.risk ?? payload.risk),
      owner: String(item.owner || payload.owner || 'Ксения').trim() || 'Ксения',
      nextStep: String(item.next_step || item.nextStep || payload.nextStep || '').trim(),
      blockers: String(item.blockers || payload.blockers || '').trim(),
      anchorDate: String(payload.anchorDate || item.anchor_date || '').trim(),
      briefUrl: String(payload.briefUrl || '').trim(),
      recipeUrl: String(payload.recipeUrl || '').trim(),
      designUrl: String(payload.designUrl || '').trim(),
      contractUrl: String(payload.contractUrl || '').trim(),
      source: String(item.source || payload.source || 'manual').trim() || 'manual',
      createdAt: item.created_at || item.createdAt || payload.createdAt || new Date().toISOString(),
      updatedAt: item.updated_at || item.updatedAt || payload.updatedAt || new Date().toISOString()
    };
    row.workingPrice = calcWorkPrice(row);
    row.plannedUnitsCalc = calcPlannedUnits(row);
    row.investmentsTotalCalc = calcInvestmentsTotal(row);
    row.breakEvenUnitsCalc = calcBreakEvenUnits(row);
    row.breakEvenMonthsCalc = calcBreakEvenMonths(row);
    row.roiPctCalc = calcRoiPct(row);
    row.delayMonths = monthDelay(row.launchMonth, row.launchMonthFact);
    return row;
  }

  function normalizeNotebook(item = {}) {
    return {
      id: item.id || uidSafe('note'),
      entityType: String(item.entity_type || item.entityType || 'product').trim() || 'product',
      entityId: String(item.entity_id || item.entityId || '').trim(),
      entityCode: String(item.entity_code || item.entityCode || '').trim(),
      title: String(item.title || 'Действие').trim() || 'Действие',
      body: String(item.body || item.text || '').trim(),
      nextStep: String(item.next_step || item.nextStep || '').trim(),
      due: item.due || '',
      status: String(item.status || 'new').trim() || 'new',
      author: String(item.author || (state.team && state.team.member && state.team.member.name) || 'Ксения').trim() || 'Ксения',
      kind: NOTEBOOK_KIND_META[item.kind] ? item.kind : 'action',
      createdAt: item.created_at || item.createdAt || new Date().toISOString(),
      updatedAt: item.updated_at || item.updatedAt || new Date().toISOString()
    };
  }

  function seedProducts() {
    const out = new Map();
    for (const launch of state.launches || []) {
      const code = stableIdSafe('prd', launch.name || Math.random()).replace(/^product-/,'PRD-').slice(0, 10).toUpperCase();
      const product = normalizeProduct({
        id: stableIdSafe('product', `${code}|${launch.name}`),
        productCode: code,
        name: launch.name,
        category: launch.reportGroup,
        subCategory: launch.subCategory,
        status: launch.targetCost ? 'research' : 'idea',
        launchMonth: launch.launchMonth,
        targetCost: launch.targetCost,
        rrp: launch.rrpVat,
        mrp: launch.mrpVat,
        plannedRevenue: launch.plannedRevenue,
        revenuePeriodMonths: 3,
        owner: 'Ксения',
        source: 'launch_plan',
        notes: launch.status || ''
      });
      out.set(product.id, product);
    }
    return [...out.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function seedNovelties(products) {
    const byCode = new Map((products || []).map((p) => [p.productCode, p]));
    const out = new Map();
    for (const launch of state.launches || []) {
      const code = stableIdSafe('prd', launch.name || Math.random()).replace(/^product-/,'PRD-').slice(0, 10).toUpperCase();
      const novelty = normalizeNovelty({
        id: stableIdSafe('novelty', `${code}|${launch.name}|${launch.launchMonth}`),
        productId: byCode.get(code)?.id || '',
        productCode: code,
        name: launch.name,
        category: launch.reportGroup,
        launchMonth: launch.launchMonth,
        stage: launch.targetCost ? 'sample' : 'idea',
        statusText: launch.status,
        production: launch.production,
        targetCost: launch.targetCost,
        mrp: launch.mrpVat,
        plannedRevenue: launch.plannedRevenue,
        revenuePeriodMonths: 3,
        owner: 'Ксения',
        nextStep: launch.status || '',
        source: 'launch_plan'
      });
      out.set(novelty.id, novelty);
    }
    return [...out.values()].sort((a, b) => monthKey(a.launchMonth).localeCompare(monthKey(b.launchMonth)) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function loadLocalStore() {
    const local = (() => {
      try {
        const raw = localStorage.getItem(NEW_KEY) || localStorage.getItem(OLD_KEY);
        if (raw) return JSON.parse(raw);
      } catch {}
      return null;
    })();
    const source = local || state.v76?.store || {};
    return {
      products: Array.isArray(source.products) ? source.products.map(normalizeProduct) : [],
      novelties: Array.isArray(source.novelties) ? source.novelties.map(normalizeNovelty) : [],
      notebook: Array.isArray(source.notebook) ? source.notebook.map(normalizeNotebook) : []
    };
  }

  function saveLocalStore() {
    state.v76 = state.v76 || {};
    state.v76.store = state.v76.store || {};
    const payload = {
      products: state.v76.store.products || [],
      novelties: state.v76.store.novelties || [],
      notebook: state.v76.store.notebook || []
    };
    try {
      localStorage.setItem(NEW_KEY, JSON.stringify(payload));
      localStorage.setItem(OLD_KEY, JSON.stringify(payload));
    } catch {}
  }

  function mergeEntities(seedRows, localRows, remoteRows, normalize) {
    const map = new Map();
    (seedRows || []).forEach((row) => map.set(row.id, normalize(row)));
    (localRows || []).forEach((row) => map.set(row.id, normalize(row)));
    if ((remoteRows || []).length) (remoteRows || []).forEach((row) => map.set(row.id, normalize(row)));
    return [...map.values()];
  }

  function ensureStoreSeeded() {
    state.v76 = state.v76 || {};
    state.v76.store = state.v76.store || { products: [], novelties: [], notebook: [] };
    const local = loadLocalStore();
    const seededProducts = seedProducts();
    const seededNovelties = seedNovelties(seededProducts);
    state.v76.store.products = mergeEntities(seededProducts, local.products, [], normalizeProduct).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    state.v76.store.novelties = mergeEntities(seededNovelties, local.novelties, [], normalizeNovelty).sort((a, b) => monthKey(a.launchMonth).localeCompare(monthKey(b.launchMonth)) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    state.v76.store.notebook = (local.notebook || []).map(normalizeNotebook).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    saveLocalStore();
  }

  function rowsOrEmpty(rows) {
    return Array.isArray(rows) ? rows : [];
  }

  async function queryTable(table) {
    const response = await state.team.client.from(table).select('*').eq('brand', currentBrandSafe());
    if (response.error) throw response.error;
    return response.data || [];
  }

  function productRemoteRow(row, includePayload = true) {
    const payload = {
      launchMonthFact: row.launchMonthFact || '',
      mrp: empty(row.mrp) ? null : n(row.mrp),
      maxDiscountPct: empty(row.maxDiscountPct) ? null : n(row.maxDiscountPct),
      revenuePeriodMonths: empty(row.revenuePeriodMonths) ? null : n(row.revenuePeriodMonths),
      plannedUnits: empty(row.plannedUnits) ? null : n(row.plannedUnits),
      investmentDevelopment: empty(row.investmentDevelopment) ? null : n(row.investmentDevelopment),
      investmentFirstBatch: empty(row.investmentFirstBatch) ? null : n(row.investmentFirstBatch),
      investmentOther: empty(row.investmentOther) ? null : n(row.investmentOther),
      investmentsTotal: empty(row.investmentsTotal) ? null : n(row.investmentsTotal),
      breakEvenUnits: empty(row.breakEvenUnits) ? null : n(row.breakEvenUnits),
      breakEvenMonths: empty(row.breakEvenMonths) ? null : n(row.breakEvenMonths),
      roiPct: empty(row.roiPct) ? null : n(row.roiPct),
      risk: !!row.risk,
      briefUrl: row.briefUrl || '',
      recipeUrl: row.recipeUrl || '',
      designUrl: row.designUrl || '',
      contractUrl: row.contractUrl || ''
    };
    const out = {
      id: row.id,
      brand: currentBrandSafe(),
      product_code: row.productCode,
      article_key: row.articleKey || '',
      name: row.name,
      category: row.category,
      sub_category: row.subCategory,
      status: row.status,
      launch_month: row.launchMonth,
      target_cost: empty(row.targetCost) ? null : n(row.targetCost),
      target_price: empty(row.targetPrice) ? null : n(row.targetPrice),
      min_price: empty(row.minPrice) ? null : n(row.minPrice),
      rrp: empty(row.rrp) ? null : n(row.rrp),
      planned_revenue: empty(row.plannedRevenue) ? null : n(row.plannedRevenue),
      owner: row.owner || 'Ксения',
      notes: row.notes || '',
      source: row.source || 'manual',
      created_at: row.createdAt,
      updated_at: new Date().toISOString()
    };
    if (includePayload) out.payload_json = payload;
    return out;
  }

  function noveltyRemoteRow(row, includePayload = true) {
    const payload = {
      launchMonthFact: row.launchMonthFact || '',
      mrp: empty(row.mrp) ? null : n(row.mrp),
      maxDiscountPct: empty(row.maxDiscountPct) ? null : n(row.maxDiscountPct),
      revenuePeriodMonths: empty(row.revenuePeriodMonths) ? null : n(row.revenuePeriodMonths),
      plannedUnits: empty(row.plannedUnits) ? null : n(row.plannedUnits),
      investmentDevelopment: empty(row.investmentDevelopment) ? null : n(row.investmentDevelopment),
      investmentFirstBatch: empty(row.investmentFirstBatch) ? null : n(row.investmentFirstBatch),
      investmentOther: empty(row.investmentOther) ? null : n(row.investmentOther),
      investmentsTotal: empty(row.investmentsTotal) ? null : n(row.investmentsTotal),
      breakEvenUnits: empty(row.breakEvenUnits) ? null : n(row.breakEvenUnits),
      breakEvenMonths: empty(row.breakEvenMonths) ? null : n(row.breakEvenMonths),
      roiPct: empty(row.roiPct) ? null : n(row.roiPct),
      risk: !!row.risk,
      anchorDate: row.anchorDate || '',
      briefUrl: row.briefUrl || '',
      recipeUrl: row.recipeUrl || '',
      designUrl: row.designUrl || '',
      contractUrl: row.contractUrl || ''
    };
    const out = {
      id: row.id,
      brand: currentBrandSafe(),
      product_id: row.productId || '',
      product_code: row.productCode,
      name: row.name,
      category: row.category,
      launch_month: row.launchMonth,
      stage: row.stage,
      status_text: row.statusText || '',
      production: row.production || '',
      target_cost: empty(row.targetCost) ? null : n(row.targetCost),
      planned_revenue: empty(row.plannedRevenue) ? null : n(row.plannedRevenue),
      owner: row.owner || 'Ксения',
      next_step: row.nextStep || '',
      blockers: row.blockers || '',
      source: row.source || 'manual',
      created_at: row.createdAt,
      updated_at: new Date().toISOString()
    };
    if (includePayload) out.payload_json = payload;
    return out;
  }

  function notebookRemoteRow(row) {
    return {
      id: row.id,
      brand: currentBrandSafe(),
      entity_type: row.entityType,
      entity_id: row.entityId,
      entity_code: row.entityCode,
      title: row.title,
      body: row.body,
      next_step: row.nextStep || '',
      due: row.due || null,
      status: row.status || 'new',
      author: row.author || 'Ксения',
      kind: row.kind || 'action',
      created_at: row.createdAt,
      updated_at: new Date().toISOString()
    };
  }

  async function upsertWithPayloadSupport(table, rows, mapper) {
    if (!rows.length) return;
    let response = await state.team.client.from(table).upsert(rows.map((row) => mapper(row, true)), { onConflict: 'id' });
    if (!response.error) {
      state.v80.payloadSupported = true;
      return;
    }
    const msg = String(response.error.message || response.error);
    if (/payload_json|column .* does not exist|schema cache/.test(msg)) {
      state.v80.payloadSupported = false;
      response = await state.team.client.from(table).upsert(rows.map((row) => mapper(row, false)), { onConflict: 'id' });
      if (response.error) throw response.error;
      return;
    }
    throw response.error;
  }

  async function deleteRemoteRow(table, id) {
    if (!hasRemoteStore() || !id) return;
    const response = await state.team.client.from(table).delete().eq('brand', currentBrandSafe()).eq('id', id);
    if (response.error) throw response.error;
  }

  async function loadChecklistTemplate() {
    if (state.v80.launchChecklist) return state.v80.launchChecklist;
    try {
      state.v80.launchChecklist = await loadJson('data/launch_checklist_template.json');
    } catch (error) {
      console.warn('Не удалось загрузить checklist шаблон', error);
      state.v80.launchChecklist = { tasks: [] };
    }
    return state.v80.launchChecklist;
  }

  async function pullKseniaMerge(snapshot) {
    ensureStoreSeeded();
    if (!hasRemoteStore() || !state.team?.client) return;
    const baseLocal = snapshot || clone(state.v76.store);
    try {
      const [remoteProducts, remoteNovelties, remoteNotebook] = await Promise.all([
        queryTable(TABLES.products).catch((error) => { throw error; }),
        queryTable(TABLES.novelties).catch((error) => { throw error; }),
        queryTable(TABLES.notebook).catch((error) => { throw error; })
      ]);
      const seededProducts = seedProducts();
      const seededNovelties = seedNovelties(seededProducts);
      const nextProducts = mergeEntities(seededProducts, rowsOrEmpty(baseLocal.products), rowsOrEmpty(remoteProducts).map(normalizeProduct), normalizeProduct);
      const nextNovelties = mergeEntities(seededNovelties, rowsOrEmpty(baseLocal.novelties), rowsOrEmpty(remoteNovelties).map(normalizeNovelty), normalizeNovelty);
      const nextNotebook = rowsOrEmpty(remoteNotebook).length ? rowsOrEmpty(remoteNotebook).map(normalizeNotebook) : rowsOrEmpty(baseLocal.notebook).map(normalizeNotebook);
      state.v76.store.products = nextProducts.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
      state.v76.store.novelties = nextNovelties.sort((a, b) => monthKey(a.launchMonth).localeCompare(monthKey(b.launchMonth)) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
      state.v76.store.notebook = nextNotebook.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      saveLocalStore();
      state.v76.remote = state.v76.remote || {};
      state.v76.remote.schemaReady = true;
      state.v76.remote.lastSyncAt = new Date().toISOString();
      const restored = (!remoteProducts.length && state.v76.store.products.length) || (!remoteNovelties.length && state.v76.store.novelties.length);
      state.v76.remote.note = restored
        ? `Блок Ксении синхронизирован · пустая remote-таблица не затёрла локальные товары/новинки · ${fmt.date(state.v76.remote.lastSyncAt)}`
        : `Блок Ксении синхронизирован · ${fmt.date(state.v76.remote.lastSyncAt)}`;
      state.v76.remote.error = '';
    } catch (error) {
      console.error(error);
      state.v76.remote = state.v76.remote || {};
      state.v76.remote.error = error.message || 'Ошибка синка блока Ксении';
      state.v76.remote.note = 'Блок Ксении работает локально';
    }
  }

  async function pushKseniaMerge() {
    ensureStoreSeeded();
    if (!hasRemoteStore() || !state.team?.client) return;
    try {
      await Promise.all([
        upsertWithPayloadSupport(TABLES.products, rowsOrEmpty(state.v76.store.products), productRemoteRow),
        upsertWithPayloadSupport(TABLES.novelties, rowsOrEmpty(state.v76.store.novelties), noveltyRemoteRow),
        state.team.client.from(TABLES.notebook).upsert(rowsOrEmpty(state.v76.store.notebook).map(notebookRemoteRow), { onConflict: 'id' })
      ]);
      state.v76.remote = state.v76.remote || {};
      state.v76.remote.lastSyncAt = new Date().toISOString();
      state.v76.remote.note = `Блок Ксении выгружен в командную базу · ${fmt.date(state.v76.remote.lastSyncAt)}`;
      state.v76.remote.error = '';
      state.v76.remote.schemaReady = true;
    } catch (error) {
      console.error(error);
      state.v76.remote = state.v76.remote || {};
      state.v76.remote.error = error.message || 'Ошибка выгрузки блока Ксении';
      state.v76.remote.note = 'Блок Ксении не выгружен';
    }
  }

  function collectFieldMap(root) {
    const out = {};
    root.querySelectorAll('[data-field]').forEach((el) => {
      if (el.type === 'checkbox') out[el.dataset.field] = el.checked;
      else out[el.dataset.field] = el.value;
    });
    return out;
  }

  function productOptions() {
    return (state.v76.store.products || []).map((item) => ({ value: `product:${item.id}`, label: `${item.name} · ${item.productCode}` }));
  }

  function noveltyOptions() {
    return (state.v76.store.novelties || []).map((item) => ({ value: `novelty:${item.id}`, label: `Новинка · ${item.name}` }));
  }

  function statusBadge(status) {
    const meta = PRODUCT_STATUS_META[status] || PRODUCT_STATUS_META.idea;
    return badge(meta.label, meta.kind);
  }

  function stageBadge(stage) {
    const meta = NOVELTY_STAGE_META[stage] || NOVELTY_STAGE_META.idea;
    return badge(meta.label, meta.kind);
  }

  function riskBadge(flag) {
    return flag ? badge('Риск', 'danger') : badge('Ок', 'ok');
  }

  function monthOptions(rows, field) {
    const opts = [...new Set((rows || []).map((row) => String(row[field] || '').trim()).filter(Boolean))];
    opts.sort((a, b) => monthKey(a).localeCompare(monthKey(b)));
    return opts;
  }

  function productList() {
    ensureStoreSeeded();
    const f = state.v80.filters;
    const q = String(f.productSearch || '').trim().toLowerCase();
    return rowsOrEmpty(state.v76.store.products).filter((row) => {
      const hay = `${row.productCode} ${row.articleKey} ${row.name} ${row.category} ${row.subCategory} ${row.notes}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (f.productStatus !== 'all' && row.status !== f.productStatus) return false;
      if (f.productPlanMonth !== 'all' && row.launchMonth !== f.productPlanMonth) return false;
      if (f.productFactMonth !== 'all' && row.launchMonthFact !== f.productFactMonth) return false;
      if (f.productRiskOnly && !row.risk) return false;
      return true;
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function noveltyList() {
    ensureStoreSeeded();
    const f = state.v80.filters;
    const q = String(f.noveltySearch || '').trim().toLowerCase();
    return rowsOrEmpty(state.v76.store.novelties).filter((row) => {
      const hay = `${row.productCode} ${row.name} ${row.category} ${row.nextStep} ${row.blockers}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (f.noveltyStage !== 'all' && row.stage !== f.noveltyStage) return false;
      if (f.noveltyPlanMonth !== 'all' && row.launchMonth !== f.noveltyPlanMonth) return false;
      if (f.noveltyFactMonth !== 'all' && row.launchMonthFact !== f.noveltyFactMonth) return false;
      if (f.noveltyRiskOnly && !row.risk) return false;
      return true;
    }).sort((a, b) => monthKey(a.launchMonth).localeCompare(monthKey(b.launchMonth)) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function notebookList() {
    const kind = state.v80.filters.notebookKind;
    return rowsOrEmpty(state.v76.store.notebook).filter((row) => kind === 'all' ? true : row.kind === kind).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function kseniaTasks() {
    return sortTasks((getAllTasks ? getAllTasks() : rowsOrEmpty(state.storage?.tasks)).filter((task) => {
      const owner = String(task.owner || '').toLowerCase();
      const source = String(task.source || '').toLowerCase();
      const hay = `${task.title || ''} ${task.reason || ''} ${task.nextAction || ''} ${task.entityLabel || ''}`.toLowerCase();
      return owner === 'ксения' || source.startsWith('ksenia_') || source === 'launch_checklist' || hay.includes('новин') || hay.includes('калькулятор') || hay.includes('цена') || hay.includes('матриц');
    }));
  }

  function guideCard(title, text) {
    return `<div class="v80-guide-card"><strong>${escapeHtml(title)}</strong><div class="muted small">${escapeHtml(text)}</div></div>`;
  }

  function monthPill(value) {
    return value ? badge(value, 'info') : '—';
  }

  function delayCell(row) {
    if (row.delayMonths == null) return '—';
    if (row.delayMonths <= 0) return `<span class="ok-text">${fmt.int(row.delayMonths)} мес</span>`;
    return `<span class="danger-text">+${fmt.int(row.delayMonths)} мес</span>`;
  }

  function linkOrDash(url, label) {
    if (!url) return '<span class="muted">—</span>';
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="doc-link">${escapeHtml(label)}</a>`;
  }

  function productRowDisplay(row) {
    const skuCell = row.articleKey ? `${linkToSku(row.articleKey, row.articleKey)} <button type="button" class="btn ghost tiny-btn" data-copy-sku="${escapeHtml(row.articleKey)}">коп.</button>` : badge(row.productCode, 'info');
    return `
      <tr>
        <td class="sticky-col">${skuCell}</td>
        <td><strong>${escapeHtml(row.name)}</strong><div class="muted small">${escapeHtml(row.category || '—')} · ${escapeHtml(row.subCategory || '—')}</div></td>
        <td>${statusBadge(row.status)}</td>
        <td>${monthPill(row.launchMonth)}</td>
        <td>${monthPill(row.launchMonthFact)}</td>
        <td>${delayCell(row)}</td>
        <td>${empty(row.mrp) ? '—' : fmt.money(row.mrp)}</td>
        <td>${empty(row.maxDiscountPct) ? '—' : `${fmt.num(row.maxDiscountPct, 0)}%`}</td>
        <td>${fmt.money(row.targetCost)}</td>
        <td>${row.workingPrice ? fmt.money(row.workingPrice) : '—'}</td>
        <td>${fmt.money(row.plannedRevenue)}${row.revenuePeriodMonths ? `<div class="muted small">${fmt.int(row.revenuePeriodMonths)} мес</div>` : ''}</td>
        <td>${row.plannedUnitsCalc ? fmt.int(row.plannedUnitsCalc) : '—'}</td>
        <td>${row.investmentsTotalCalc ? fmt.money(row.investmentsTotalCalc) : '—'}</td>
        <td>${row.breakEvenUnitsCalc ? fmt.int(row.breakEvenUnitsCalc) : '—'}${row.breakEvenMonthsCalc ? `<div class="muted small">${fmt.num(row.breakEvenMonthsCalc, 1)} мес</div>` : ''}</td>
        <td>${row.roiPctCalc != null && Number.isFinite(Number(row.roiPctCalc)) ? `${fmt.num(row.roiPctCalc, 0)}%` : '—'}</td>
        <td>${riskBadge(row.risk)}</td>
        <td><div class="muted small">${escapeHtml(row.notes || '—')}</div></td>
        <td><div class="doc-link-list">${linkOrDash(row.briefUrl, 'ТЗ')}${linkOrDash(row.recipeUrl, 'Рецептура')}${linkOrDash(row.designUrl, 'Дизайн')}${linkOrDash(row.contractUrl, 'Договор')}</div></td>
        <td><div class="v80-actions"><button class="btn small-btn" type="button" data-v80-edit-product="${escapeHtml(row.id)}">Править</button><button class="btn ghost small-btn" type="button" data-v80-delete-product="${escapeHtml(row.id)}">Удалить</button></div></td>
      </tr>`;
  }

  function productEditorRow(row, isNew) {
    return `
      <tr class="v80-edit-shell" data-v80-product-editor="${escapeHtml(row.id)}"><td colspan="18">
        <div class="v80-editor-grid">
          <label><span>Код</span><input data-field="productCode" value="${escapeHtml(row.productCode || '')}"></label>
          <label><span>Артикул SKU</span><input data-field="articleKey" value="${escapeHtml(row.articleKey || '')}" list="v80SkuList"></label>
          <label class="wide"><span>Название</span><input data-field="name" value="${escapeHtml(row.name || '')}"></label>
          <label><span>Категория</span><input data-field="category" value="${escapeHtml(row.category || '')}"></label>
          <label><span>Подкатегория</span><input data-field="subCategory" value="${escapeHtml(row.subCategory || '')}"></label>
          <label><span>Статус</span><select data-field="status">${Object.entries(PRODUCT_STATUS_META).map(([k,m])=>`<option value="${k}" ${row.status===k?'selected':''}>${escapeHtml(m.label)}</option>`).join('')}</select></label>
          <label><span>Месяц запуска план</span><input data-field="launchMonth" value="${escapeHtml(row.launchMonth || '')}" placeholder="Октябрь 2026"></label>
          <label><span>Месяц запуска факт</span><input data-field="launchMonthFact" value="${escapeHtml(row.launchMonthFact || '')}" placeholder="Ноябрь 2026"></label>
          <label><span>Target cost</span><input data-field="targetCost" type="number" step="0.01" value="${escapeHtml(row.targetCost || '')}"></label>
          <label><span>Target price</span><input data-field="targetPrice" type="number" step="0.01" value="${escapeHtml(row.targetPrice || '')}"></label>
          <label><span>Min price</span><input data-field="minPrice" type="number" step="0.01" value="${escapeHtml(row.minPrice || '')}"></label>
          <label><span>RRP</span><input data-field="rrp" type="number" step="0.01" value="${escapeHtml(row.rrp || '')}"></label>
          <label><span>МРЦ</span><input data-field="mrp" type="number" step="0.01" value="${escapeHtml(row.mrp || '')}"></label>
          <label><span>Макс. скидка %</span><input data-field="maxDiscountPct" type="number" step="0.01" value="${escapeHtml(row.maxDiscountPct || '')}"></label>
          <label><span>План выручки</span><input data-field="plannedRevenue" type="number" step="0.01" value="${escapeHtml(row.plannedRevenue || '')}"></label>
          <label><span>Период плана, мес</span><input data-field="revenuePeriodMonths" type="number" step="1" min="1" value="${escapeHtml(row.revenuePeriodMonths || 3)}"></label>
          <label><span>План, шт</span><input data-field="plannedUnits" type="number" step="0.01" value="${escapeHtml(row.plannedUnits || '')}" placeholder="Можно оставить пустым"></label>
          <label><span>Инвестиции: разработка</span><input data-field="investmentDevelopment" type="number" step="0.01" value="${escapeHtml(row.investmentDevelopment || '')}"></label>
          <label><span>Инвестиции: 1 партия</span><input data-field="investmentFirstBatch" type="number" step="0.01" value="${escapeHtml(row.investmentFirstBatch || '')}"></label>
          <label><span>Инвестиции: прочее</span><input data-field="investmentOther" type="number" step="0.01" value="${escapeHtml(row.investmentOther || '')}"></label>
          <label><span>Риск</span><input data-field="risk" type="checkbox" ${row.risk ? 'checked' : ''}></label>
          <label><span>Ссылка: ТЗ</span><input data-field="briefUrl" value="${escapeHtml(row.briefUrl || '')}" placeholder="https://..."></label>
          <label><span>Ссылка: рецептура</span><input data-field="recipeUrl" value="${escapeHtml(row.recipeUrl || '')}" placeholder="https://..."></label>
          <label><span>Ссылка: дизайн</span><input data-field="designUrl" value="${escapeHtml(row.designUrl || '')}" placeholder="https://..."></label>
          <label><span>Ссылка: договор</span><input data-field="contractUrl" value="${escapeHtml(row.contractUrl || '')}" placeholder="https://..."></label>
          <label class="wide"><span>Комментарий</span><textarea data-field="notes" rows="3">${escapeHtml(row.notes || '')}</textarea></label>
        </div>
        <div class="v80-actions"><button class="btn" type="button" data-v80-save-product="${escapeHtml(row.id)}">${isNew ? 'Сохранить товар' : 'Сохранить изменения'}</button><button class="btn ghost" type="button" data-v80-cancel-product="${escapeHtml(row.id)}">Отменить</button>${!isNew ? `<button class="btn ghost" type="button" data-v80-delete-product="${escapeHtml(row.id)}">Удалить</button>` : ''}</div>
      </td></tr>`;
  }

  function noveltyDisplayCard(row) {
    return `
      <div class="v80-novelty-card">
        <div class="head"><div><strong>${escapeHtml(row.name)}</strong><div class="muted small">${escapeHtml(row.productCode || '—')} · ${escapeHtml(row.category || '—')}</div></div><div class="badge-stack">${stageBadge(row.stage)}${riskBadge(row.risk)}</div></div>
        <div class="v80-novelty-grid">
          <div><span>Запуск план</span><strong>${escapeHtml(row.launchMonth || '—')}</strong></div>
          <div><span>Запуск факт</span><strong>${escapeHtml(row.launchMonthFact || '—')}</strong></div>
          <div><span>Delay</span><strong>${row.delayMonths == null ? '—' : `${row.delayMonths > 0 ? '+' : ''}${fmt.int(row.delayMonths)} мес`}</strong></div>
          <div><span>Производство</span><strong>${escapeHtml(row.production || '—')}</strong></div>
          <div><span>Target cost</span><strong>${fmt.money(row.targetCost)}</strong></div>
          <div><span>МРЦ / скидка</span><strong>${empty(row.mrp) ? '—' : fmt.money(row.mrp)}${empty(row.maxDiscountPct) ? '' : ` / ${fmt.num(row.maxDiscountPct, 0)}%`}</strong></div>
          <div><span>План выручки</span><strong>${fmt.money(row.plannedRevenue)}</strong></div>
          <div><span>План, шт</span><strong>${row.plannedUnitsCalc ? fmt.int(row.plannedUnitsCalc) : '—'}</strong></div>
          <div><span>Инвестиции</span><strong>${row.investmentsTotalCalc ? fmt.money(row.investmentsTotalCalc) : '—'}</strong></div>
          <div><span>Break-even / ROI</span><strong>${row.breakEvenUnitsCalc ? fmt.int(row.breakEvenUnitsCalc) : '—'} / ${row.roiPctCalc != null && Number.isFinite(Number(row.roiPctCalc)) ? `${fmt.num(row.roiPctCalc, 0)}%` : '—'}</strong></div>
        </div>
        <div class="muted small"><strong>Статус:</strong> ${escapeHtml(row.statusText || '—')}</div>
        <div class="muted small"><strong>Следующий шаг:</strong> ${escapeHtml(row.nextStep || '—')}</div>
        ${row.blockers ? `<div class="muted small"><strong>Блокеры:</strong> ${escapeHtml(row.blockers)}</div>` : ''}
        <div class="doc-link-list">${linkOrDash(row.briefUrl, 'ТЗ')}${linkOrDash(row.recipeUrl, 'Рецептура')}${linkOrDash(row.designUrl, 'Дизайн')}${linkOrDash(row.contractUrl, 'Договор')}</div>
        <div class="v80-actions"><button class="btn small-btn" type="button" data-v80-edit-novelty="${escapeHtml(row.id)}">Править</button><button class="btn ghost small-btn" type="button" data-v80-delete-novelty="${escapeHtml(row.id)}">Удалить</button><button class="btn ghost small-btn" type="button" data-v80-checklist="${escapeHtml(row.id)}">Создать чек-лист</button></div>
      </div>`;
  }

  function noveltyEditorCard(row, isNew) {
    return `
      <div class="v80-novelty-card v80-novelty-editor" data-v80-novelty-editor="${escapeHtml(row.id)}">
        <div class="head"><div><strong>${isNew ? 'Новая карточка новинки' : 'Редактирование карточки новинки'}</strong><div class="muted small">Pipeline новинки: этап, риск, экономика, инвестиции, документы и next step.</div></div><div class="badge-stack">${stageBadge(row.stage)}</div></div>
        <div class="v80-editor-grid">
          <label><span>Код товара</span><input data-field="productCode" list="v80ProductCodeList" value="${escapeHtml(row.productCode || '')}"></label>
          <label class="wide"><span>Название новинки</span><input data-field="name" value="${escapeHtml(row.name || '')}"></label>
          <label><span>Категория</span><input data-field="category" value="${escapeHtml(row.category || '')}"></label>
          <label><span>Запуск план</span><input data-field="launchMonth" value="${escapeHtml(row.launchMonth || '')}" placeholder="Июль 2026"></label>
          <label><span>Запуск факт</span><input data-field="launchMonthFact" value="${escapeHtml(row.launchMonthFact || '')}" placeholder="Август 2026"></label>
          <label><span>Anchor дата склада</span><input data-field="anchorDate" type="date" value="${escapeHtml(row.anchorDate || '')}"></label>
          <label><span>Этап</span><select data-field="stage">${Object.entries(NOVELTY_STAGE_META).map(([k,m])=>`<option value="${k}" ${row.stage===k?'selected':''}>${escapeHtml(m.label)}</option>`).join('')}</select></label>
          <label><span>Риск</span><input data-field="risk" type="checkbox" ${row.risk ? 'checked' : ''}></label>
          <label><span>Статус текстом</span><input data-field="statusText" value="${escapeHtml(row.statusText || '')}"></label>
          <label><span>Производство</span><input data-field="production" value="${escapeHtml(row.production || '')}"></label>
          <label><span>Target cost</span><input data-field="targetCost" type="number" step="0.01" value="${escapeHtml(row.targetCost || '')}"></label>
          <label><span>МРЦ</span><input data-field="mrp" type="number" step="0.01" value="${escapeHtml(row.mrp || '')}"></label>
          <label><span>Макс. скидка %</span><input data-field="maxDiscountPct" type="number" step="0.01" value="${escapeHtml(row.maxDiscountPct || '')}"></label>
          <label><span>План выручки</span><input data-field="plannedRevenue" type="number" step="0.01" value="${escapeHtml(row.plannedRevenue || '')}"></label>
          <label><span>Период плана, мес</span><input data-field="revenuePeriodMonths" type="number" step="1" min="1" value="${escapeHtml(row.revenuePeriodMonths || 3)}"></label>
          <label><span>План, шт</span><input data-field="plannedUnits" type="number" step="0.01" value="${escapeHtml(row.plannedUnits || '')}"></label>
          <label><span>Инвестиции: разработка</span><input data-field="investmentDevelopment" type="number" step="0.01" value="${escapeHtml(row.investmentDevelopment || '')}"></label>
          <label><span>Инвестиции: 1 партия</span><input data-field="investmentFirstBatch" type="number" step="0.01" value="${escapeHtml(row.investmentFirstBatch || '')}"></label>
          <label><span>Инвестиции: прочее</span><input data-field="investmentOther" type="number" step="0.01" value="${escapeHtml(row.investmentOther || '')}"></label>
          <label><span>Ссылка: ТЗ</span><input data-field="briefUrl" value="${escapeHtml(row.briefUrl || '')}" placeholder="https://..."></label>
          <label><span>Ссылка: рецептура</span><input data-field="recipeUrl" value="${escapeHtml(row.recipeUrl || '')}" placeholder="https://..."></label>
          <label><span>Ссылка: дизайн</span><input data-field="designUrl" value="${escapeHtml(row.designUrl || '')}" placeholder="https://..."></label>
          <label><span>Ссылка: договор</span><input data-field="contractUrl" value="${escapeHtml(row.contractUrl || '')}" placeholder="https://..."></label>
          <label class="wide"><span>Следующий шаг</span><textarea data-field="nextStep" rows="2">${escapeHtml(row.nextStep || '')}</textarea></label>
          <label class="wide"><span>Блокеры</span><textarea data-field="blockers" rows="2">${escapeHtml(row.blockers || '')}</textarea></label>
        </div>
        <div class="v80-actions"><button class="btn" type="button" data-v80-save-novelty="${escapeHtml(row.id)}">${isNew ? 'Сохранить новинку' : 'Сохранить изменения'}</button><button class="btn ghost" type="button" data-v80-cancel-novelty="${escapeHtml(row.id)}">Отменить</button>${!isNew ? `<button class="btn ghost" type="button" data-v80-delete-novelty="${escapeHtml(row.id)}">Удалить</button>` : ''}</div>
      </div>`;
  }

  function emptyProductDraft() {
    return normalizeProduct({ id: 'draft-product', owner: 'Ксения', revenuePeriodMonths: 3 });
  }

  function emptyNoveltyDraft() {
    return normalizeNovelty({ id: 'draft-novelty', owner: 'Ксения', revenuePeriodMonths: 3, stage: 'idea' });
  }

  function sectionCard(key, title, description, controls, body, badges = '') {
    const open = state.v80.ui.sections[key] !== false;
    return `
      <div class="card v80-section ${open ? '' : 'collapsed'}">
        <div class="section-subhead">
          <div><h3>${escapeHtml(title)}</h3><p class="small muted">${escapeHtml(description)}</p></div>
          <div class="v80-actions">${badges}<button class="btn ghost small-btn" type="button" data-v80-toggle="${escapeHtml(key)}">${open ? 'Свернуть' : 'Развернуть'}</button></div>
        </div>
        ${open && controls ? `<div class="v80-controls">${controls}</div>` : ''}
        ${open ? `<div class="v80-body">${body}</div>` : ''}
      </div>`;
  }

  function notebookCards(items) {
    if (!items.length) return '<div class="empty">Записей пока нет.</div>';
    return items.map((item) => `
      <div class="v80-note-card">
        <div class="head"><strong>${escapeHtml(item.title)}</strong><div class="badge-stack">${badge(NOTEBOOK_KIND_META[item.kind] || 'Заметка', item.kind === 'decision' ? 'warn' : 'info')}${badge(TASK_STATUS_META[item.status]?.label || item.status || 'Новая', item.status === 'done' ? 'ok' : '')}</div></div>
        <div class="muted small">${escapeHtml(item.entityCode || '—')} · ${escapeHtml(item.author || 'Ксения')} · ${fmt.date(item.createdAt)}</div>
        <div>${escapeHtml(item.body || '—')}</div>
        ${item.nextStep ? `<div class="muted small"><strong>Дальше:</strong> ${escapeHtml(item.nextStep)}</div>` : ''}
      </div>`).join('');
  }

  function renderLaunchesV80() {
    ensureStoreSeeded();
    const root = document.getElementById('view-launches');
    if (!root) return;
    const products = productList();
    const novelties = noveltyList();
    const notebook = notebookList();
    const tasks = kseniaTasks();
    const activeTasks = tasks.filter((task) => typeof isTaskActive === 'function' ? isTaskActive(task) : task.status !== 'done');
    const overdueTasks = activeTasks.filter((task) => typeof isTaskOverdue === 'function' ? isTaskOverdue(task) : false);
    const waitingTasks = activeTasks.filter((task) => task.status === 'waiting_decision');

    const productPlanOptions = monthOptions(state.v76.store.products, 'launchMonth');
    const productFactOptions = monthOptions(state.v76.store.products, 'launchMonthFact');
    const noveltyPlanOptions = monthOptions(state.v76.store.novelties, 'launchMonth');
    const noveltyFactOptions = monthOptions(state.v76.store.novelties, 'launchMonthFact');

    const productRows = [];
    if (state.v80.ui.editingProductId === 'draft-product') productRows.push(productEditorRow(emptyProductDraft(), true));
    products.forEach((row) => productRows.push(state.v80.ui.editingProductId === row.id ? productEditorRow(row, false) : productRowDisplay(row)));

    const noveltyCards = [];
    if (state.v80.ui.editingNoveltyId === 'draft-novelty') noveltyCards.push(noveltyEditorCard(emptyNoveltyDraft(), true));
    novelties.forEach((row) => noveltyCards.push(state.v80.ui.editingNoveltyId === row.id ? noveltyEditorCard(row, false) : noveltyDisplayCard(row)));

    const remoteKind = state.v76?.remote?.error ? 'danger' : hasRemoteStore() ? 'ok' : '';
    const productOptionsHtml = productOptions().concat(noveltyOptions()).map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('');

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Продукт / Ксения</h2>
          <p>Продуктовый кабинет: статус товара, экономика, новинки, launch checklist, задачи и тетрадь действий — в одном месте.</p>
        </div>
        <div class="badge-stack">${badge(`Товаров ${fmt.int(products.length)}`, 'info')}${badge(`Новинок ${fmt.int(novelties.length)}`, novelties.length ? 'warn' : '')}${badge(`Активных задач ${fmt.int(activeTasks.length)}`, activeTasks.length ? 'info' : '')}${badge(`Просрочено ${fmt.int(overdueTasks.length)}`, overdueTasks.length ? 'danger' : 'ok')}</div>
      </div>
      <div class="footer-note">${badge(state.v76?.remote?.note || 'Локальное хранение', remoteKind)}</div>
      ${sectionCard('guide', 'Как работать в блоке Ксении', 'Матрица товаров, карточки новинок, launch checklist, продуктовые задачи и тетрадь действий.', '', `<div class="v80-guide-grid">${guideCard('Реестр товаров', 'Меняем статус, экономику, запуск план/факт и риск прямо в строке товара.')} ${guideCard('Карточки новинок', 'По каждой новинке видно этап, блокеры, инвестиции, break-even, ROI и можно создать чек-лист запуска.')} ${guideCard('Задачник Ксении', 'Личные продуктовые задачи со сроками, приоритетами и статусом.')} ${guideCard('Тетрадь действий', 'Решения, договорённости, изменения статусов и next step.')}</div>`)}
      ${sectionCard('registry', 'Реестр товаров директора по товару', 'Главный список товаров. Здесь Ксения меняет статус, запуск план/факт, ценовой коридор, инвестиции и риск.', `<div class="v80-controls-row"><input id="v80ProductSearch" placeholder="Поиск по товару / коду / категории" value="${escapeHtml(state.v80.filters.productSearch)}"><select id="v80ProductStatus"><option value="all">Все статусы</option>${Object.entries(PRODUCT_STATUS_META).map(([k,m]) => `<option value="${k}" ${state.v80.filters.productStatus===k?'selected':''}>${escapeHtml(m.label)}</option>`).join('')}</select><select id="v80ProductPlanMonth"><option value="all">План запуска: все</option>${productPlanOptions.map((m) => `<option value="${escapeHtml(m)}" ${state.v80.filters.productPlanMonth===m?'selected':''}>${escapeHtml(m)}</option>`).join('')}</select><select id="v80ProductFactMonth"><option value="all">Факт запуска: все</option>${productFactOptions.map((m) => `<option value="${escapeHtml(m)}" ${state.v80.filters.productFactMonth===m?'selected':''}>${escapeHtml(m)}</option>`).join('')}</select><label class="toggle"><input id="v80ProductRisk" type="checkbox" ${state.v80.filters.productRiskOnly?'checked':''}> Только риск</label><button class="btn" type="button" data-v80-add-product>Добавить товар</button></div>`, `<datalist id="v80SkuList">${(state.skus || []).map((sku) => `<option value="${escapeHtml(sku.articleKey || sku.article || '')}">${escapeHtml(sku.name || '')}</option>`).join('')}</datalist><div class="table-wrap v80-wide-table-wrap"><table class="v80-table"><thead><tr><th class="sticky-col">Код / SKU</th><th>Товар</th><th>Статус</th><th>Запуск план</th><th>Запуск факт</th><th>Delay</th><th>МРЦ</th><th>Макс. скидка</th><th>Target cost</th><th>Рабочая цена</th><th>План выручки / период</th><th>План, шт</th><th>Инвестиции</th><th>Break-even</th><th>ROI</th><th>Риск</th><th>Комментарий</th><th>Документы</th><th>Действия</th></tr></thead><tbody>${productRows.join('') || '<tr><td colspan="19" class="text-center muted">Нет товаров под текущий фильтр</td></tr>'}</tbody></table></div>`)}
      ${sectionCard('novelties', 'Карточки новинок', 'Launch cockpit по новинкам: план/факт запуска, инвестиции, break-even, риск, документы, checklist и next step.', `<div class="v80-controls-row"><input id="v80NoveltySearch" placeholder="Поиск по новинке / коду / шагу" value="${escapeHtml(state.v80.filters.noveltySearch)}"><select id="v80NoveltyStage"><option value="all">Все этапы</option>${Object.entries(NOVELTY_STAGE_META).map(([k,m]) => `<option value="${k}" ${state.v80.filters.noveltyStage===k?'selected':''}>${escapeHtml(m.label)}</option>`).join('')}</select><select id="v80NoveltyPlanMonth"><option value="all">План запуска: все</option>${noveltyPlanOptions.map((m) => `<option value="${escapeHtml(m)}" ${state.v80.filters.noveltyPlanMonth===m?'selected':''}>${escapeHtml(m)}</option>`).join('')}</select><select id="v80NoveltyFactMonth"><option value="all">Факт запуска: все</option>${noveltyFactOptions.map((m) => `<option value="${escapeHtml(m)}" ${state.v80.filters.noveltyFactMonth===m?'selected':''}>${escapeHtml(m)}</option>`).join('')}</select><label class="toggle"><input id="v80NoveltyRisk" type="checkbox" ${state.v80.filters.noveltyRiskOnly?'checked':''}> Только риск</label><button class="btn" type="button" data-v80-add-novelty>Добавить новинку</button></div><datalist id="v80ProductCodeList">${rowsOrEmpty(state.v76.store.products).map((row) => `<option value="${escapeHtml(row.productCode)}">${escapeHtml(row.name)}</option>`).join('')}</datalist>`, `<div class="v80-card-grid">${noveltyCards.join('') || '<div class="empty">Нет новинок под текущий фильтр</div>'}</div>`)}
      ${sectionCard('tasks', 'Задачник Ксении со сроками', 'Задачи по товарам, новинкам, матрице и калькуляторам. Всё, что у Ксении в работе, видно здесь.', '', `<form id="v80TaskForm" class="form-grid compact"><label class="wide"><span>Товар / новинка</span><select name="entity">${productOptionsHtml}</select></label><label class="wide"><span>Задача</span><input name="title" placeholder="Например, согласовать калькулятор и цену"></label><label><span>Приоритет</span><select name="priority">${Object.entries(PRIORITY_META).map(([k,m]) => `<option value="${k}">${escapeHtml(m.label)}</option>`).join('')}</select></label><label><span>Статус</span><select name="status">${Object.entries(TASK_STATUS_META).map(([k,m]) => `<option value="${k}">${escapeHtml(m.label)}</option>`).join('')}</select></label><label><span>Срок</span><input name="due" type="date" value="${plusDays(3)}"></label><label><span>Owner</span><select name="owner">${ownerOptions().map((name) => `<option value="${escapeHtml(name)}" ${name==='Ксения'?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select></label><label class="wide"><span>Следующее действие</span><textarea name="nextAction" rows="2" placeholder="Что именно делаем"></textarea></label><label class="wide"><span>Контекст / причина</span><textarea name="reason" rows="2" placeholder="Почему появилась задача"></textarea></label><div class="v80-actions wide"><button class="btn" type="submit">Поставить задачу</button>${badge(`Активно ${fmt.int(activeTasks.length)}`, activeTasks.length ? 'info' : '')}${badge(`Просрочено ${fmt.int(overdueTasks.length)}`, overdueTasks.length ? 'danger' : 'ok')}${badge(`Ждут решения ${fmt.int(waitingTasks.length)}`, waitingTasks.length ? 'warn' : 'ok')}</div></form><div class="stack">${tasks.length ? tasks.slice(0, 12).map((task) => typeof renderTaskCard === 'function' ? renderTaskCard(task) : `<div>${escapeHtml(task.title)}</div>`).join('') : '<div class="empty">У Ксении пока нет задач.</div>'}</div>`)}
      ${sectionCard('notebook', 'Тетрадь действий', 'Журнал решений и действий по товарам и новинкам: что сделали, что решили и что дальше.', `<div class="v80-controls-row"><select id="v80NotebookKind"><option value="all">Все типы</option>${Object.entries(NOTEBOOK_KIND_META).map(([k,label]) => `<option value="${k}" ${state.v80.filters.notebookKind===k?'selected':''}>${escapeHtml(label)}</option>`).join('')}</select></div>`, `<form id="v80NotebookForm" class="form-grid compact"><label class="wide"><span>Товар / новинка</span><select name="entity">${productOptionsHtml}</select></label><label><span>Тип записи</span><select name="kind">${Object.entries(NOTEBOOK_KIND_META).map(([k,label]) => `<option value="${k}">${escapeHtml(label)}</option>`).join('')}</select></label><label><span>Статус</span><select name="status">${Object.entries(TASK_STATUS_META).map(([k,m]) => `<option value="${k}">${escapeHtml(m.label)}</option>`).join('')}</select></label><label><span>Срок</span><input name="due" type="date"></label><label class="wide"><span>Заголовок</span><input name="title" placeholder="Например, согласовали цену"></label><label class="wide"><span>Что сделали / решили</span><textarea name="body" rows="2"></textarea></label><label class="wide"><span>Следующий шаг</span><textarea name="nextStep" rows="2"></textarea></label><div class="v80-actions wide"><button class="btn" type="submit">Добавить запись</button></div></form><div class="v80-notebook-list">${notebookCards(notebook)}</div>`)}
    `;

    const on = (selector, event, handler) => root.querySelector(selector)?.addEventListener(event, handler);
    on('#v80ProductSearch', 'input', (e) => { state.v80.filters.productSearch = e.target.value; renderLaunches(); });
    on('#v80ProductStatus', 'change', (e) => { state.v80.filters.productStatus = e.target.value; renderLaunches(); });
    on('#v80ProductPlanMonth', 'change', (e) => { state.v80.filters.productPlanMonth = e.target.value; renderLaunches(); });
    on('#v80ProductFactMonth', 'change', (e) => { state.v80.filters.productFactMonth = e.target.value; renderLaunches(); });
    on('#v80ProductRisk', 'change', (e) => { state.v80.filters.productRiskOnly = e.target.checked; renderLaunches(); });
    on('#v80NoveltySearch', 'input', (e) => { state.v80.filters.noveltySearch = e.target.value; renderLaunches(); });
    on('#v80NoveltyStage', 'change', (e) => { state.v80.filters.noveltyStage = e.target.value; renderLaunches(); });
    on('#v80NoveltyPlanMonth', 'change', (e) => { state.v80.filters.noveltyPlanMonth = e.target.value; renderLaunches(); });
    on('#v80NoveltyFactMonth', 'change', (e) => { state.v80.filters.noveltyFactMonth = e.target.value; renderLaunches(); });
    on('#v80NoveltyRisk', 'change', (e) => { state.v80.filters.noveltyRiskOnly = e.target.checked; renderLaunches(); });
    on('#v80NotebookKind', 'change', (e) => { state.v80.filters.notebookKind = e.target.value; renderLaunches(); });

    root.querySelectorAll('[data-v80-toggle]').forEach((btn) => btn.addEventListener('click', () => {
      const key = btn.dataset.v80Toggle;
      state.v80.ui.sections[key] = state.v80.ui.sections[key] === false;
      renderLaunches();
    }));

    root.querySelectorAll('[data-copy-sku]').forEach((btn) => btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(btn.dataset.copySku || ''); btn.textContent = 'скопировано'; setTimeout(() => { btn.textContent = 'коп.'; }, 1500); } catch (error) { console.error(error); }
    }));

    root.querySelectorAll('[data-v80-add-product]').forEach((btn) => btn.addEventListener('click', () => { state.v80.ui.editingProductId = 'draft-product'; renderLaunches(); }));
    root.querySelectorAll('[data-v80-add-novelty]').forEach((btn) => btn.addEventListener('click', () => { state.v80.ui.editingNoveltyId = 'draft-novelty'; renderLaunches(); }));
    root.querySelectorAll('[data-v80-edit-product]').forEach((btn) => btn.addEventListener('click', () => { state.v80.ui.editingProductId = btn.dataset.v80EditProduct; renderLaunches(); }));
    root.querySelectorAll('[data-v80-cancel-product]').forEach((btn) => btn.addEventListener('click', () => { state.v80.ui.editingProductId = ''; renderLaunches(); }));
    root.querySelectorAll('[data-v80-edit-novelty]').forEach((btn) => btn.addEventListener('click', () => { state.v80.ui.editingNoveltyId = btn.dataset.v80EditNovelty; renderLaunches(); }));
    root.querySelectorAll('[data-v80-cancel-novelty]').forEach((btn) => btn.addEventListener('click', () => { state.v80.ui.editingNoveltyId = ''; renderLaunches(); }));

    root.querySelectorAll('[data-v80-save-product]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.v80SaveProduct;
      const editor = root.querySelector(`[data-v80-product-editor="${CSS.escape(id)}"]`);
      if (!editor) return;
      const fields = collectFieldMap(editor);
      const prev = rowsOrEmpty(state.v76.store.products).find((row) => row.id === id);
      const product = normalizeProduct({
        id: prev?.id || (id === 'draft-product' ? undefined : id),
        productCode: fields.productCode || prev?.productCode || uidSafe('PRD').slice(0, 10).toUpperCase(),
        articleKey: fields.articleKey || '',
        name: fields.name || '',
        category: fields.category || '',
        subCategory: fields.subCategory || '',
        status: fields.status || 'idea',
        launchMonth: fields.launchMonth || '',
        launchMonthFact: fields.launchMonthFact || '',
        targetCost: fields.targetCost || '',
        targetPrice: fields.targetPrice || '',
        minPrice: fields.minPrice || '',
        rrp: fields.rrp || '',
        mrp: fields.mrp || '',
        maxDiscountPct: fields.maxDiscountPct || '',
        plannedRevenue: fields.plannedRevenue || '',
        revenuePeriodMonths: fields.revenuePeriodMonths || 3,
        plannedUnits: fields.plannedUnits || '',
        investmentDevelopment: fields.investmentDevelopment || '',
        investmentFirstBatch: fields.investmentFirstBatch || '',
        investmentOther: fields.investmentOther || '',
        risk: fields.risk,
        notes: fields.notes || '',
        briefUrl: fields.briefUrl || '',
        recipeUrl: fields.recipeUrl || '',
        designUrl: fields.designUrl || '',
        contractUrl: fields.contractUrl || '',
        owner: 'Ксения',
        source: prev?.source || 'manual',
        createdAt: prev?.createdAt || new Date().toISOString()
      });
      if (!product.name) return window.alert('Нужно указать название товара.');
      state.v76.store.products = rowsOrEmpty(state.v76.store.products).filter((row) => row.id !== product.id).concat(product).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
      saveLocalStore();
      await pushKseniaMerge();
      state.v80.ui.editingProductId = '';
      if (prev && prev.status !== product.status) {
        state.v76.store.notebook.unshift(normalizeNotebook({ entityType: 'product', entityId: product.id, entityCode: product.productCode, title: 'Статус товара изменён', body: `${product.name}: ${PRODUCT_STATUS_META[prev.status]?.label || prev.status} → ${PRODUCT_STATUS_META[product.status]?.label || product.status}`, kind: 'matrix', author: state.team?.member?.name || 'Ксения', status: 'done' }));
        saveLocalStore();
      }
      renderLaunches();
    }));

    root.querySelectorAll('[data-v80-delete-product]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.v80DeleteProduct;
      const row = rowsOrEmpty(state.v76.store.products).find((item) => item.id === id);
      if (!row) return;
      if (!window.confirm(`Удалить товар «${row.name}»?`)) return;
      state.v76.store.products = rowsOrEmpty(state.v76.store.products).filter((item) => item.id !== id);
      saveLocalStore();
      try { await deleteRemoteRow(TABLES.products, id); } catch (error) { console.error(error); }
      renderLaunches();
    }));

    root.querySelectorAll('[data-v80-save-novelty]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.v80SaveNovelty;
      const editor = root.querySelector(`[data-v80-novelty-editor="${CSS.escape(id)}"]`);
      if (!editor) return;
      const fields = collectFieldMap(editor);
      const prev = rowsOrEmpty(state.v76.store.novelties).find((row) => row.id === id);
      let product = rowsOrEmpty(state.v76.store.products).find((row) => row.productCode === fields.productCode);
      if (!product && fields.productCode) {
        product = normalizeProduct({ productCode: fields.productCode, name: fields.name || 'Новая новинка', category: fields.category || '', status: 'idea', launchMonth: fields.launchMonth || '', owner: 'Ксения', source: 'manual', notes: 'Создано из карточки новинки' });
        state.v76.store.products.push(product);
      }
      const novelty = normalizeNovelty({
        id: prev?.id || (id === 'draft-novelty' ? undefined : id),
        productId: product?.id || prev?.productId || '',
        productCode: fields.productCode || prev?.productCode || '',
        name: fields.name || '',
        category: fields.category || '',
        launchMonth: fields.launchMonth || '',
        launchMonthFact: fields.launchMonthFact || '',
        anchorDate: fields.anchorDate || '',
        stage: fields.stage || 'idea',
        risk: fields.risk,
        statusText: fields.statusText || '',
        production: fields.production || '',
        targetCost: fields.targetCost || '',
        mrp: fields.mrp || '',
        maxDiscountPct: fields.maxDiscountPct || '',
        plannedRevenue: fields.plannedRevenue || '',
        revenuePeriodMonths: fields.revenuePeriodMonths || 3,
        plannedUnits: fields.plannedUnits || '',
        investmentDevelopment: fields.investmentDevelopment || '',
        investmentFirstBatch: fields.investmentFirstBatch || '',
        investmentOther: fields.investmentOther || '',
        nextStep: fields.nextStep || '',
        blockers: fields.blockers || '',
        briefUrl: fields.briefUrl || '',
        recipeUrl: fields.recipeUrl || '',
        designUrl: fields.designUrl || '',
        contractUrl: fields.contractUrl || '',
        owner: 'Ксения',
        source: prev?.source || 'manual',
        createdAt: prev?.createdAt || new Date().toISOString()
      });
      if (!novelty.name) return window.alert('Нужно указать название новинки.');
      state.v76.store.novelties = rowsOrEmpty(state.v76.store.novelties).filter((row) => row.id !== novelty.id).concat(novelty).sort((a, b) => monthKey(a.launchMonth).localeCompare(monthKey(b.launchMonth)) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
      saveLocalStore();
      await pushKseniaMerge();
      state.v80.ui.editingNoveltyId = '';
      renderLaunches();
    }));

    root.querySelectorAll('[data-v80-delete-novelty]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.v80DeleteNovelty;
      const row = rowsOrEmpty(state.v76.store.novelties).find((item) => item.id === id);
      if (!row) return;
      if (!window.confirm(`Удалить новинку «${row.name}»?`)) return;
      state.v76.store.novelties = rowsOrEmpty(state.v76.store.novelties).filter((item) => item.id !== id);
      saveLocalStore();
      try { await deleteRemoteRow(TABLES.novelties, id); } catch (error) { console.error(error); }
      renderLaunches();
    }));

    root.querySelectorAll('[data-v80-checklist]').forEach((btn) => btn.addEventListener('click', async () => {
      const novelty = rowsOrEmpty(state.v76.store.novelties).find((item) => item.id === btn.dataset.v80Checklist);
      if (!novelty) return;
      const tpl = await loadChecklistTemplate();
      const anchor = novelty.anchorDate || plusDays(7);
      const existingKeys = new Set(rowsOrEmpty(state.storage?.tasks).filter((task) => task.source === 'launch_checklist' && String(task.articleKey) === String(novelty.productCode)).map((task) => `${task.source}|${task.articleKey}|${task.title}`));
      const created = [];
      rowsOrEmpty(tpl.tasks).forEach((t) => {
        const title = `${t.phase_label}: ${t.task_title}`;
        const key = `launch_checklist|${novelty.productCode}|${title}`;
        if (existingKeys.has(key)) return;
        const due = new Date(anchor);
        due.setDate(due.getDate() + n(t.relative_finish_day));
        const task = normalizeTask({
          id: uidSafe('task'),
          articleKey: novelty.productCode,
          title,
          reason: t.task_description || '',
          nextAction: t.notes_hint || novelty.nextStep || '',
          owner: 'Ксения',
          due: due.toISOString().slice(0, 10),
          status: 'new',
          type: t.category && /логист/i.test(t.category) ? 'supply' : t.category && /контент|отзывы|реклама|ctr|полки|акции|органика/i.test(t.category) ? 'traffic' : t.category && /экономика/i.test(t.category) ? 'pricing' : 'launch',
          priority: t.is_critical ? 'critical' : 'medium',
          platform: 'all',
          source: 'launch_checklist',
          entityLabel: novelty.name
        }, 'manual');
        state.storage.tasks.unshift(task);
        created.push(task);
      });
      if (typeof saveLocalStorage === 'function') saveLocalStorage();
      try { if (typeof persistTask === 'function') for (const task of created) await persistTask(task); } catch (error) { console.error(error); }
      state.v76.store.notebook.unshift(normalizeNotebook({ entityType: 'novelty', entityId: novelty.id, entityCode: novelty.productCode, title: 'Создан launch checklist', body: `${created.length} задач по запуску создано автоматически`, nextStep: novelty.nextStep || '', status: 'done', kind: 'launch', author: state.team?.member?.name || 'Ксения' }));
      saveLocalStore();
      await pushKseniaMerge();
      rerenderCurrentView();
      window.alert(`Создано задач по запуску: ${created.length}`);
    }));

    root.querySelector('#v80TaskForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      const [entityType, entityId] = String(fd.get('entity') || '').split(':');
      const entity = entityType === 'novelty' ? rowsOrEmpty(state.v76.store.novelties).find((row) => row.id === entityId) : rowsOrEmpty(state.v76.store.products).find((row) => row.id === entityId);
      const task = normalizeTask({
        id: uidSafe('task'),
        articleKey: entity?.articleKey || entity?.productCode || entity?.id || '',
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
        entityLabel: entity?.name || entity?.productCode || 'Продукт'
      }, 'manual');
      state.storage.tasks.unshift(task);
      if (typeof saveLocalStorage === 'function') saveLocalStorage();
      try { if (typeof persistTask === 'function') await persistTask(task); } catch (error) { console.error(error); }
      state.v76.store.notebook.unshift(normalizeNotebook({ entityType: entityType || 'product', entityId: entity?.id || '', entityCode: entity?.productCode || '', title: 'Поставлена продуктовая задача', body: task.title, nextStep: task.nextAction || '', due: task.due || '', status: task.status, author: state.team?.member?.name || 'Ксения', kind: 'action' }));
      saveLocalStore();
      await pushKseniaMerge();
      event.currentTarget.reset();
      rerenderCurrentView();
    });

    root.querySelector('#v80NotebookForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      const [entityType, entityId] = String(fd.get('entity') || '').split(':');
      const entity = entityType === 'novelty' ? rowsOrEmpty(state.v76.store.novelties).find((row) => row.id === entityId) : rowsOrEmpty(state.v76.store.products).find((row) => row.id === entityId);
      state.v76.store.notebook.unshift(normalizeNotebook({
        id: uidSafe('note'),
        entityType: entityType || 'product',
        entityId: entity?.id || '',
        entityCode: entity?.productCode || '',
        title: fd.get('title') || 'Запись',
        body: fd.get('body') || '',
        nextStep: fd.get('nextStep') || '',
        due: fd.get('due') || '',
        status: fd.get('status') || 'new',
        author: state.team?.member?.name || 'Ксения',
        kind: fd.get('kind') || 'action'
      }));
      saveLocalStore();
      await pushKseniaMerge();
      event.currentTarget.reset();
      renderLaunches();
    });
  }

  function copySkuEnhancer(articleKey) {
    const body = document.getElementById('skuModalBody');
    if (!body) return;
    if (body.querySelector('[data-v80-copy-modal-sku]')) return;
    const titleWrap = body.querySelector('.modal-head > div');
    if (!titleWrap) return;
    const stack = titleWrap.querySelector('.badge-stack');
    if (!stack) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ghost tiny-btn';
    btn.dataset.v80CopyModalSku = articleKey;
    btn.textContent = 'Скопировать SKU';
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(articleKey); btn.textContent = 'Скопировано'; setTimeout(() => { btn.textContent = 'Скопировать SKU'; }, 1500); } catch (error) { console.error(error); }
    });
    stack.appendChild(btn);
  }

  function execDrilldownHtml(model, filter) {
    const titleMap = {
      active: 'Активные задачи',
      overdue: 'Просроченные задачи',
      critical: 'Критично по марже',
      waiting: 'Ждут решения',
      noOwnerTasks: 'Задачи без owner',
      unassignedSkus: 'SKU без owner'
    };
    const items = model[filter] || [];
    if (filter === 'unassignedSkus') {
      return `
        <div class="card v80-exec-card"><div class="section-subhead"><div><h3>${escapeHtml(titleMap[filter])}</h3><p class="small muted">Провал в закреплении — можно провалиться в карточку SKU.</p></div>${badge(`${fmt.int(items.length)} шт.`, items.length ? 'warn' : 'ok')}</div><div class="alert-stack">${items.length ? items.map((sku) => `<div class="alert-row"><div><strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong><div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div></div><div class="badge-stack">${badge('Без owner', 'warn')}</div><div class="muted small">${escapeHtml(sku.focusReasons || 'Нужно закрепить владельца')}</div></div>`).join('') : '<div class="empty">Нет незакреплённых SKU</div>'}</div></div>`;
    }
    return `
      <div class="card v80-exec-card"><div class="section-subhead"><div><h3>${escapeHtml(titleMap[filter])}</h3><p class="small muted">Провалиться из summary в конкретные задачи.</p></div>${badge(`${fmt.int(items.length)} шт.`, items.length ? 'warn' : 'ok')}</div><div class="task-mini-grid">${items.length ? items.map((task) => typeof renderMiniTask === 'function' ? renderMiniTask(task) : `<div>${escapeHtml(task.title || 'Задача')}</div>`).join('') : '<div class="empty">Нет задач по выбранному фильтру</div>'}</div></div>`;
  }

  function enhanceExecutive() {
    const root = document.getElementById('view-executive');
    if (!root || typeof buildExecutiveModel !== 'function') return;
    const model = buildExecutiveModel();
    const tiles = [...root.querySelectorAll('.kpi-strip .mini-kpi')];
    tiles.forEach((tile, index) => {
      const filter = EXEC_FILTERS[index];
      tile.classList.add('clickable');
      if (state.v80.executive.filter === filter) tile.classList.add('is-active');
      tile.addEventListener('click', () => {
        state.v80.executive.filter = filter;
        renderExecutive();
      });
    });
    let host = root.querySelector('#v80ExecutiveDrilldown');
    if (!host) {
      host = document.createElement('div');
      host.id = 'v80ExecutiveDrilldown';
      host.style.marginTop = '14px';
      root.insertBefore(host, root.querySelector('.dashboard-grid-4'));
    }
    host.innerHTML = execDrilldownHtml(model, state.v80.executive.filter || 'overdue');
  }

  async function v80Init() {
    ensureStoreSeeded();
    try { await loadChecklistTemplate(); } catch {}
    // repair after current sync layer possibly wiped local lists
    if (rowsOrEmpty(state.v76.store.products).length === 0 || rowsOrEmpty(state.v76.store.novelties).length === 0) {
      const snapshot = clone(loadLocalStore());
      if (hasRemoteStore()) await pullKseniaMerge(snapshot);
      else ensureStoreSeeded();
    }
  }

  const prevPull = pullRemoteState;
  pullRemoteState = async function (rerender = true) {
    const snapshot = clone(state.v76?.store || loadLocalStore());
    await prevPull(false);
    await pullKseniaMerge(snapshot);
    if (rerender) {
      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      if (state.activeSku && typeof renderSkuModal === 'function') renderSkuModal(state.activeSku);
    }
  };

  const prevPush = pushStateToRemote;
  pushStateToRemote = async function () {
    await prevPush();
    await pushKseniaMerge();
    if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
  };

  const baseRenderLaunches = renderLaunches;
  renderLaunches = function () {
    try {
      renderLaunchesV80();
    } catch (error) {
      console.error(error);
      const root = document.getElementById('view-launches');
      if (root) root.innerHTML = `<div class="card"><div class="head"><div><h3>Продукт / Ксения</h3><div class="muted small">Не удалось отрисовать блок</div></div>${badge('ошибка', 'danger')}</div><div class="muted" style="margin-top:10px">${escapeHtml(error.message)}</div></div>`;
    }
  };

  const baseRenderSkuModal = renderSkuModal;
  renderSkuModal = function (articleKey) {
    baseRenderSkuModal(articleKey);
    copySkuEnhancer(articleKey);
  };

  const baseRenderExecutive = renderExecutive;
  renderExecutive = function () {
    baseRenderExecutive();
    enhanceExecutive();
  };

  const baseRerender = rerenderCurrentView;
  rerenderCurrentView = function () {
    baseRerender();
    try {
      if (state.activeView === 'launches') renderLaunches();
      if (state.activeView === 'executive') renderExecutive();
    } catch (error) {
      console.error(error);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', v80Init, { once: true });
  else v80Init();
})();
