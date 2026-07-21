const state = {
  dashboard: { cards: [], generatedAt: '' },
  skus: [],
  autoSignalBaselines: { skus: [], generatedAt: '', source: '' },
  prices: { generatedAt: '', platforms: {} },
  platformTrends: { generatedAt: '', platforms: [], extraMarketplace: { generatedAt: '', asOfDate: '', platforms: {} } },
  platformPlan: { generatedAt: '', months: {} },
  smartPriceWorkbench: { generatedAt: '', platforms: {} },
  smartPriceWorkbenchBase: { generatedAt: '', platforms: {} },
  smartPriceWorkbenchLive: { generatedAt: '', platforms: {} },
  smartPriceOverlay: { generatedAt: '', platforms: {} },
  priceWorkbenchSupport: { generatedAt: '', platforms: {} },
  productLeaderboard: { generatedAt: '', items: [], summary: {} },
  productLeaderboardHistory: [],
  adsSummary: { generatedAt: '', asOfDate: '', note: '', platforms: [], itemSeries: [] },
  iuDrrSummary: { generatedAt: '', asOfDate: '', months: [], daily: [], channels: [], diagnostics: {} },
  wbFeedbacks: { generatedAt: '', window: {}, summary: {}, cards: [], daily: [], history: [] },
  wbSubstitutionTraffic: { schema: 'portal-wb-substitution-traffic-v1', generatedAt: '', asOfDate: '', summary: {}, articles: [], rows: [] },
  wbSubstitutionTrafficHistory: [],
  skuAliases: { schema: 'sku-api-aliases-v1', aliases: [] },
  skuAliasIgnore: { schema: 'sku-api-ignore-v1', ignored: [] },
  skuAliasAudit: { schema: 'sku-alias-audit-v1', events: [] },
  skuMatrix: { schema: 'portal-sku-matrix-v1', summary: {}, items: [], apiUnmapped: [], ignoredApiSku: [], indexes: { byArticleKey: {}, aliasToArticleKey: {} } },
  syncHealth: { schema: 'portal-sync-health-v1', status: '', publish: { allowed: true, blockingReasons: [], warnings: [] }, sources: {}, quality: {} },
  portalDataQuality: { generatedAt: '', status: '', summary: {}, issues: [] },
  portalDataQuarantine: { schema: 'portal-data-quarantine-v1', summary: {}, rows: [] },
  oosControl: { schema: 'portal-oos-control-v2', generatedAt: '', summary: {}, rows: [], history: { days: [] } },
  predictiveRisk: { schema: 'qharisma-predictive-risk-v1', generatedAt: '', summary: {}, risks: [], autoTaskSignals: [] },
  autoTaskSignals: { schema: 'qharisma-auto-task-signals-v1', generatedAt: '', summary: {}, signals: [] },
  predictiveRiskOutcomeAudit: { schema: 'qharisma-predictive-risk-outcome-audit-v1', generatedAt: '', asOfDate: '', windowDays: 14, signalsCreated: 0, risksDetected: 0 },
  launches: [],
  meetings: [],
  documents: { groups: [] },
  repricer: { generatedAt: '', summary: {}, rows: [] },
  repricerLive: { generatedAt: '', rows: [] },
  storage: {
    comments: [],
    tasks: [],
    decisions: [],
    ownerOverrides: [],
    resourceLinks: [],
    resourceFolders: [],
    productLifecycleOverrides: [],
    taskAttachments: [],
    autoTaskSnapshot: { generatedAt: '', active: [] },
    autoTaskHistory: [],
    repricerSettings: {},
    repricerSettingsUpdatedAt: '',
    repricerOverrides: [],
    repricerSkuProfiles: [],
    repricerCorridors: [],
    repricerOverrideDeletes: [],
    repricerSkuProfileDeletes: [],
    repricerCorridorDeletes: [],
    repricerPendingApiAdds: [],
    repricerPendingApiDeletes: [],
    repricerPendingCostFixes: [],
    repricerPendingApiTasks: [],
    repricerRepairHistory: [],
    repricerRepairSnapshots: [],
    repricerApiReconcileHistory: [],
    repricerLastAuditImport: null,
    repricerLastAutoFix: null,
    repricerLastImportValidation: null,
    repricerLastApiReconcile: null
  },
  filters: {
  search: '',
  segment: 'all',
  lifecycle: 'all',
  focus: 'all',
  market: 'all',
  owner: 'all',
    traffic: 'all',
    assignment: 'all'
  },
  controlFilters: {
    search: '',
    owner: 'all',
    status: 'active',
    type: 'all',
    priority: 'all',
    platform: 'all',
    horizon: 'all',
    source: 'all'
  },
  docFilters: {
    search: '',
    group: 'all'
  },
  launchFilters: {
    month: 'all',
    search: '',
    group: 'all',
    tag: 'all',
    status: 'all',
    phase: 'all'
  },
  productLeaderboardFilters: {
    search: '',
    owner: 'all',
    signal: 'all',
    sort: 'gameScore',
    category: 'all',
    snapshot: 'latest',
    lflCurrentSnapshot: 'latest',
    lflCompareSnapshot: ''
  },
  adsFunnelFilters: {
    search: '',
    platform: 'all',
    horizon: '28',
    sort: 'spend',
    sortDir: 'desc'
  },
  iuDrrFilters: {
    month: 'latest'
  },
  oosControlFilters: {
    search: '',
    platform: 'all',
    owner: 'all',
    department: 'all',
    status: 'active'
  },
  skuPlanFactFilters: {
    search: '',
    owner: 'all',
    status: 'active',
    platform: 'all',
    month: 'latest',
    date: '',
    sort: 'gap',
    sortDir: 'asc'
  },
  repricerFilters: {
    search: '',
    platform: 'all',
    mode: 'changes',
    economicSource: 'all',
    listSize: 'focus'
  },
  orderCalc: {
    articleKey: '',
    scope: 'all',
    salesSource: 'hybrid',
    manualDailySales: '',
    daysToNextReceipt: '',
    targetCoverAfter: '30',
    safetyDays: '7',
    inboundManual: '',
    packSize: '1',
    moq: '0'
  },
  orderProcurement: {
    platform: 'wb',
    days: 30
  },
  activeView: 'dashboard',
  activeSku: null,
  activeTaskId: null,

  boot: {
  dataReady: false,
    listenersAttached: false,
    dataWarnings: [],
    lazyReady: {
      controlCenter: false,
      launches: false,
      productLeaderboard: false,
      adsFunnel: false,
      iuDrr: false,
      skuPlanFact: false,
      oosControl: false,
      predictiveRisk: false,
      meetings: false,
      documents: false,
      repricer: false
    },
    lazyLoads: {}
  },
  team: {
    mode: 'local',
    ready: false,
    error: '',
    note: 'Подключаем командную базу…',
    member: { name: '', role: 'Команда' },
    lastSyncAt: '',
    userId: '',
    accessToken: ''
  }
};

window.__ALTEA_CONTROL_CENTER_V2__ = true;
window.__ALTEA_ORDER_PROCUREMENT_ENABLED__ = true;
window.__ALTEA_OPTIMIZED_RENDER__ = true;
window.__alteaAppState = state;

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

window.numberOrZero = window.numberOrZero || numberOrZero;

const STORAGE_KEY = 'brand-portal-local-v1';
const ACTIVE_TASK_STATUSES = new Set(['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision']);
const VIEW_TITLES = {
  dashboard: 'Дашборд',
  documents: 'Хранилище',
  designers: 'Дизайнеры',
  repricer: 'Репрайсер',
  prices: 'Цены',
  order: 'Заказ товара',
  control: 'Задачи',
  skus: 'Реестр СКЮ',
  'data-health': 'Календарь',
  'oos-control': 'OOS контроль',
  'sku-contour': 'SKU workspace',
  launches: 'Продукт / новинки',
  'iu-drr': 'Показатели площадок',
  'sku-plan-fact': 'План-факт SKU',
  'wb-rating': 'Рейтинг карточек',
  'product-leaderboard': 'Продуктовый лидерборд',
  'launch-control': 'Запуск новинок',
  meetings: 'Ритм работы',
  executive: 'Руководителю'
};
const VIEW_DATA_REQUIREMENTS = {
  control: 'controlCenter',
  launches: 'launches',
  'iu-drr': 'iuDrr',
  'sku-plan-fact': 'skuPlanFact',
  'sku-contour': 'skuPlanFact',
  'data-health': '',
  'oos-control': 'oosControl',
  'wb-rating': 'iuDrr',
  'product-leaderboard': 'productLeaderboard',
  'launch-control': 'launches',
  executive: 'skuPlanFact',
  meetings: 'meetings',
  documents: 'documents',
  designers: '',
  repricer: 'repricer'
};
const DISABLED_VIEWS = new Set(['meetings', 'ads-funnel', 'launch-control']);
const VIEW_REDIRECTS = {
  meetings: 'dashboard',
  'launch-control': 'launches',
  'ads-funnel': 'iu-drr'
};

function normalizePortalView(view = 'dashboard') {
  const raw = String(view || 'dashboard').trim() || 'dashboard';
  return DISABLED_VIEWS.has(raw) ? (VIEW_REDIRECTS[raw] || 'dashboard') : raw;
}

const TASK_STATUS_META = {
  new: { label: 'Новая', kind: 'warn' },
  in_progress: { label: 'В работе', kind: 'info' },
  waiting_team: { label: 'Ждёт другого отдела', kind: 'warn' },
  waiting_rop: { label: 'На согласовании у РОПа', kind: 'warn' },
  waiting_decision: { label: 'На согласовании у руководителя', kind: 'danger' },
  done: { label: 'Сделано', kind: 'ok' },
  cancelled: { label: 'Отменено', kind: '' }
};

const TASK_TYPE_META = {
  price_margin: 'Цена / маржа',
  content: 'Контент / карточка',
  traffic: 'Трафик / продвижение',
  supply: 'Остатки / поставка',
  returns: 'Отзывы / возвраты',
  assignment: 'Закрепление',
  launch: 'Новинка',
  data_quality: 'Качество данных',
  general: 'Общее'
};

const PRIORITY_META = {
  critical: { label: 'Критично', kind: 'danger', rank: 4 },
  high: { label: 'Высокий', kind: 'warn', rank: 3 },
  medium: { label: 'Средний', kind: 'info', rank: 2 },
  low: { label: 'Низкий', kind: '', rank: 1 }
};

const TASK_LOG_META = {
  created: { label: 'Создана', tone: 'info' },
  updated: { label: 'Изменена', tone: 'warn' },
  seen: { label: 'Повтор', tone: 'info' },
  resolved: { label: 'Ушёл', tone: 'ok' },
  comment: { label: 'Комментарий', tone: 'ok' },
  status: { label: 'Статус', tone: 'info' },
  report: { label: 'Отчёт', tone: 'ok' }
};

const CONTROL_WORKSTREAM_META = {
  all: {
    label: 'Все задачи',
    chip: 'Все контуры',
    description: 'Полный срез задачника без разбиения по командам.',
    kind: ''
  },
  ozon: {
    label: 'РОП Ozon',
    chip: 'Ozon РОП',
    description: 'Отдельный операционный контур по Ozon.',
    kind: 'info'
  },
  wb: {
    label: 'РОП WB',
    chip: 'WB РОП',
    description: 'Отдельный контур по Wildberries.',
    kind: 'warn'
  },
  ya: {
    label: 'Я.Маркет',
    chip: 'Я.Маркет',
    description: 'Отдельный контур Яндекс Маркета.',
    kind: 'ok'
  },
  goldapple: {
    label: 'Золотое яблоко',
    chip: 'Золотое яблоко',
    description: 'Отдельный контур Золотого Яблока.',
    kind: 'ok'
  },
  letu: {
    label: "Л'Этуаль",
    chip: "Л'Этуаль",
    description: 'Отдельный контур Л\'Этуаль.',
    kind: 'ok'
  },
  magnit: {
    label: 'Магнит Маркет',
    chip: 'Магнит Маркет',
    description: 'Отдельный контур Магнит Маркета.',
    kind: 'ok'
  },
  product: {
    label: 'Продукт / новинки',
    chip: 'Продукт',
    description: 'Календарь новинок, продуктовая проработка и запуск карточек.',
    kind: 'info'
  },
  executive: {
    label: 'Управленческий финал',
    chip: 'Финал',
    description: 'Финальные согласования и управленческие эскалации.',
    kind: 'danger'
  },
  cross: {
    label: 'Общий контур',
    chip: 'Общий контур',
    description: 'Сквозные вопросы по owner, решениям и межплощадочным задачам.',
    kind: ''
  }
};

const CONTROL_WORKSTREAM_ORDER = ['cross', 'wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product'];
const CONTROL_WORKSTREAM_FILTER_ORDER = ['all', ...CONTROL_WORKSTREAM_ORDER];

const DEFAULT_APP_CONFIG = {
  brand: 'Алтея',
  teamMode: 'local',
  teamMember: { name: '', role: 'Команда' },
  supabase: { url: '', anonKey: '', auth: 'email_password' }
};


const RUNTIME_SUPABASE_FALLBACK = {
  brand: 'Алтея',
  teamMode: 'supabase',
  teamMember: { name: '', role: 'Команда' },
  supabase: {
    url: 'https://iyckwryrucqrxwlowxow.supabase.co',
    anonKey: 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw',
    auth: 'email_password'
  }
};

function isLocalHost() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

const TEAM_TABLES = {
  tasks: 'portal_tasks',
  comments: 'portal_comments',
  decisions: 'portal_decisions',
  owners: 'portal_owner_assignments',
  attachments: 'portal_task_attachments'
};
const TASK_ATTACHMENTS_BUCKET = 'portal-task-files';
const TASK_ATTACHMENT_ALLOWED_EXTENSIONS = ['xlsx', 'xls', 'csv'];
const TASK_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

const PORTAL_SNAPSHOT_TABLE = 'portal_data_snapshots';
const PORTAL_SNAPSHOT_REQUEST_TIMEOUT_MS = 5000;
const PORTAL_SNAPSHOT_PATH_MAP = {
  'data/dashboard.json': 'dashboard',
  'data/skus.json': 'skus',
  'data/platform_trends.json': 'platform_trends',
  'data/logistics.json': 'logistics',
  'data/ads_summary.json': 'ads_summary',
  'data/control_auto_task_sources.json': 'control_auto_task_sources',
  'data/iu_drr_summary.json': 'iu_drr_summary',
  'data/wb_feedbacks_summary.json': 'wb_feedbacks_summary',
  'data/wb_substitution_traffic.json': 'wb_substitution_traffic',
  'data/wb_substitution_traffic_history.json': 'wb_substitution_traffic_history',
  'data/platform_plan.json': 'platform_plan',
  'data/prices.json': 'prices',
  'data/smart_price_workbench.json': 'smart_price_workbench',
  'data/smart_price_overlay.json': 'smart_price_overlay',
  'data/repricer.json': 'repricer',
  'data/price_workbench_support.json': 'price_workbench_support',
  'data/price_workbench_support.dashboard-compact.json': 'price_workbench_support',
  'data/product_leaderboard.json': 'product_leaderboard',
  'data/product_leaderboard_history.json': 'product_leaderboard_history',
  'data/order_procurement.json': 'order_procurement',
  'data/order_procurement_wb.json': 'order_procurement_wb',
  'data/order_procurement_ozon.json': 'order_procurement_ozon',
  'data/order_procurement_ym.json': 'order_procurement_ym',
  'data/oos_control.json': 'oos_control',
  'data/predictive_risk_snapshot.json': 'predictive_risk_snapshot',
  'data/auto_task_signals.json': 'auto_task_signals',
  'data/predictive_risk_outcome_audit.json': 'predictive_risk_outcome_audit',
  'data/warehouse_stock_overlay.json': 'warehouse_stock_overlay',
  'data/portal_data_quality.json': 'portal_data_quality',
  'data/portal_data_quarantine.json': 'portal_data_quarantine',
  'data/sku_aliases.json': 'sku_aliases',
  'data/sku_alias_ignore.json': 'sku_alias_ignore',
  'data/sku_alias_audit.json': 'sku_alias_audit',
  'data/sku_matrix.json': 'sku_matrix',
  'data/portal_sync_health.json': 'portal_sync_health'
};
const portalSnapshotState = {
  client: null,
  promise: null,
  promises: {},
  rows: {},
  brand: ''
};

const fmt = {
  int(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value));
  },
  money(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value));
  },
  pct(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return `${(Number(value) * 100).toFixed(1)}%`;
  },
  num(value, digits = 1) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value));
  },
  date(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(value);
    }
  }
};


function currentConfig() {
  const raw = window.APP_CONFIG || {};
  const hasExplicitTeamMode = Object.prototype.hasOwnProperty.call(raw, 'teamMode');
  const merged = {
    ...DEFAULT_APP_CONFIG,
    ...raw,
    teamMember: { ...DEFAULT_APP_CONFIG.teamMember, ...(raw.teamMember || {}) },
    supabase: { ...DEFAULT_APP_CONFIG.supabase, ...(raw.supabase || {}) }
  };
  const missingRemote = merged.teamMode !== 'supabase' || !merged.supabase?.url || !merged.supabase?.anonKey;
  const explicitLocalMode = hasExplicitTeamMode && String(raw.teamMode || '').trim().toLowerCase() === 'local';
  const authRemote = window.__ALTEA_AUTH_REMOTE_CONFIG__;
  const fallback = authRemote?.supabase?.url && authRemote?.supabase?.anonKey
    ? authRemote
    : RUNTIME_SUPABASE_FALLBACK;
  if (missingRemote && !explicitLocalMode) {
    return {
      ...merged,
      ...fallback,
      teamMember: { ...(fallback.teamMember || {}), ...(merged.teamMember || {}) },
      supabase: { ...(fallback.supabase || {}), ...(raw.supabase || {}) }
    };
  }
  return merged;
}


function currentBrand() {
  return currentConfig().brand || 'Алтея';
}

function normalizeSnapshotPath(path = '') {
  return String(path || '').replaceAll('\\', '/').split('?')[0];
}

function snapshotKeyFromPath(path = '') {
  return PORTAL_SNAPSHOT_PATH_MAP[normalizeSnapshotPath(path)] || null;
}

function parseFreshStamp(value) {
  if (!value) return 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = /^\d{4}-\d{2}$/.test(raw)
    ? `${raw}-01T00:00:00Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00Z`
      : raw;
  const stamp = Date.parse(normalized);
  return Number.isFinite(stamp) ? stamp : 0;
}

function bumpFreshness(score, value) {
  return Math.max(score, parseFreshStamp(value));
}

function payloadFreshnessScore(snapshotKey, payload) {
  if (payload === null || payload === undefined) return 0;
  let score = 0;
  score = bumpFreshness(score, payload.generatedAt);
  score = bumpFreshness(score, payload.updatedAt);
  score = bumpFreshness(score, payload.updated_at);
  score = bumpFreshness(score, payload.asOfDate);
  score = bumpFreshness(score, payload.dataFreshness?.asOfDate);

  if (snapshotKey === 'dashboard') {
    score = bumpFreshness(score, payload.generatedAt);
    score = bumpFreshness(score, payload.dataFreshness?.asOfDate);
    return score;
  }

  if (snapshotKey === 'platform_trends') {
    (payload.platforms || []).forEach((platform) => {
      (platform?.series || []).forEach((item) => {
        score = bumpFreshness(score, item?.date || item?.label);
      });
    });
    return score;
  }

  if (snapshotKey === 'ads_summary') {
    score = bumpFreshness(score, payload.asOfDate);
    (payload.platforms || []).forEach((platform) => {
      (platform?.series || []).forEach((item) => {
        score = bumpFreshness(score, item?.date || item?.label);
      });
    });
    return score;
  }

  if (snapshotKey === 'iu_drr_summary') {
    score = bumpFreshness(score, payload.asOfDate);
    (payload.daily || []).forEach((item) => {
      score = bumpFreshness(score, item?.date);
    });
    return score;
  }

  if (snapshotKey === 'wb_feedbacks_summary') {
    score = bumpFreshness(score, payload.window?.to);
    (payload.daily || []).forEach((item) => {
      score = bumpFreshness(score, item?.date);
    });
    return score;
  }

  if (snapshotKey === 'platform_plan') {
    Object.keys(payload.months || {}).forEach((monthKey) => {
      score = bumpFreshness(score, `${monthKey}-01`);
    });
    return score;
  }

  if (snapshotKey === 'prices') {
    score = bumpFreshness(score, payload.month?.key ? `${payload.month.key}-01` : '');
    (payload.dates || []).forEach((item) => {
      score = bumpFreshness(score, item?.date || item?.label);
    });
    return score;
  }

  if (snapshotKey === 'smart_price_workbench') {
    Object.values(payload.platforms || {}).forEach((platform) => {
      Object.values(platform?.rows || {}).forEach((row) => {
        (row?.daily || []).forEach((item) => {
          score = bumpFreshness(score, item?.date);
        });
      });
    });
    return score;
  }

  if (snapshotKey === 'skus' && Array.isArray(payload)) {
    payload.forEach((item) => {
      score = bumpFreshness(score, item?.updatedAt || item?.updated_at || item?.createdAt);
    });
    return score;
  }

  if (snapshotKey === 'product_leaderboard') {
    (payload.items || []).forEach((item) => {
      score = bumpFreshness(score, item?.generatedAt || item?.updatedAt || payload.generatedAt);
    });
    return score;
  }

  if (snapshotKey === 'order_procurement' || snapshotKey === 'order_procurement_wb' || snapshotKey === 'order_procurement_ozon' || snapshotKey === 'order_procurement_ym') {
    score = bumpFreshness(score, payload.window?.to);
    return score;
  }

  if (snapshotKey === 'oos_control') {
    score = bumpFreshness(score, payload.dataFreshness?.dataDate || payload.summary?.dataDate);
    return score;
  }

  if (snapshotKey === 'warehouse_stock_overlay') {
    (payload.rows || []).forEach((item) => {
      score = bumpFreshness(score, item?.updatedAt || item?.updated_at || payload.generatedAt);
    });
    return score;
  }

  if (snapshotKey === 'portal_data_quality') {
    score = bumpFreshness(score, payload.summary?.maxDate);
    return score;
  }

  if (snapshotKey === 'portal_sync_health') {
    score = bumpFreshness(score, payload.publish?.checkedAt || payload.generatedAt);
    score = bumpFreshness(score, payload.freshness?.maxDate);
    return score;
  }

  if (snapshotKey === 'portal_data_quarantine' || snapshotKey === 'sku_alias_audit') {
    return bumpFreshness(score, payload.generatedAt || payload.updatedAt);
  }

  return score;
}

function payloadDataFreshnessScore(snapshotKey, payload) {
  if (payload === null || payload === undefined) return 0;
  let score = 0;
  score = bumpFreshness(score, payload.asOfDate);
  score = bumpFreshness(score, payload.dataFreshness?.asOfDate);

  if (snapshotKey === 'dashboard') {
    return bumpFreshness(score, payload.dataFreshness?.asOfDate);
  }

  if (snapshotKey === 'platform_trends' || snapshotKey === 'ads_summary') {
    (payload.platforms || []).forEach((platform) => {
      (platform?.series || []).forEach((item) => {
        score = bumpFreshness(score, item?.date || item?.label);
      });
    });
    return score;
  }

  if (snapshotKey === 'iu_drr_summary') {
    (payload.daily || []).forEach((item) => {
      score = bumpFreshness(score, item?.date);
    });
    return score;
  }

  if (snapshotKey === 'wb_feedbacks_summary') {
    score = bumpFreshness(score, payload.window?.to);
    (payload.daily || []).forEach((item) => {
      score = bumpFreshness(score, item?.date);
    });
    return score;
  }

  if (snapshotKey === 'platform_plan' || snapshotKey === 'iu_plan') {
    Object.keys(payload.months || {}).forEach((monthKey) => {
      score = bumpFreshness(score, `${monthKey}-01`);
    });
    return score;
  }

  if (snapshotKey === 'prices') {
    score = bumpFreshness(score, payload.month?.key ? `${payload.month.key}-01` : '');
    (payload.dates || []).forEach((item) => {
      score = bumpFreshness(score, item?.date || item?.label);
    });
    return score;
  }

  if (snapshotKey === 'order_procurement' || snapshotKey === 'order_procurement_wb' || snapshotKey === 'order_procurement_ozon' || snapshotKey === 'order_procurement_ym') {
    return bumpFreshness(score, payload.window?.to);
  }

  if (snapshotKey === 'oos_control') {
    return bumpFreshness(score, payload.dataFreshness?.dataDate || payload.summary?.dataDate || payload.generatedAt);
  }

  if (snapshotKey === 'portal_data_quality') {
    return bumpFreshness(score, payload.summary?.maxDate || payload.generatedAt);
  }

  if (snapshotKey === 'portal_sync_health') {
    return bumpFreshness(score, payload.freshness?.maxDate || payload.generatedAt);
  }

  if (snapshotKey === 'portal_data_quarantine' || snapshotKey === 'sku_alias_audit') {
    return bumpFreshness(score, payload.generatedAt || payload.updatedAt);
  }

  return score;
}

function payloadAliasCoverageScore(snapshotKey, payload) {
  if (!payload || typeof payload !== 'object') return 0;
  if (snapshotKey === 'sku_aliases') return Array.isArray(payload.aliases) ? payload.aliases.length : 0;
  if (snapshotKey === 'sku_matrix') return Number(payload.summary?.aliasCount || 0);
  if (snapshotKey === 'portal_data_quality') return Number(payload.summary?.skuAliasCount || 0);
  return 0;
}

function shouldPreferLocalAliasCoverage(snapshotKey, snapshotPayload, localPayload) {
  const keys = new Set(['sku_aliases', 'sku_matrix', 'portal_data_quality']);
  if (!keys.has(snapshotKey)) return false;
  const localScore = payloadAliasCoverageScore(snapshotKey, localPayload);
  const snapshotScore = payloadAliasCoverageScore(snapshotKey, snapshotPayload);
  return localScore > 0 && localScore > snapshotScore;
}

function protectedSnapshotKey() {
  return ['iu', 'drr', 'summary'].join('_');
}

function preferPublishedSnapshotOnTie(snapshotKey) {
  return snapshotKey !== protectedSnapshotKey();
}

function chooseFreshestPayload(snapshotKey, snapshotPayload, localPayload) {
  const snapshotReady = snapshotPayloadLooksUsable(snapshotKey, snapshotPayload) ? snapshotPayload : null;
  const localReady = localPayload !== null && localPayload !== undefined ? localPayload : null;
  if (snapshotReady && localReady) {
    if (shouldPreferLocalAliasCoverage(snapshotKey, snapshotReady, localReady)) {
      return { payload: localReady, source: 'local' };
    }
    const publishFirstKeys = new Set(['prices', 'smart_price_workbench', 'smart_price_overlay', 'repricer']);
    if (publishFirstKeys.has(snapshotKey)) {
      const localFreshness = payloadFreshnessScore(snapshotKey, localReady);
      const snapshotFreshness = payloadFreshnessScore(snapshotKey, snapshotReady);
      if (localFreshness !== snapshotFreshness) {
        return localFreshness > snapshotFreshness
          ? { payload: localReady, source: 'local' }
          : { payload: snapshotReady, source: 'snapshot' };
      }
    }
    const localDataScore = payloadDataFreshnessScore(snapshotKey, localReady);
    const snapshotDataScore = payloadDataFreshnessScore(snapshotKey, snapshotReady);
    if (localDataScore !== snapshotDataScore) {
      return localDataScore > snapshotDataScore
        ? { payload: localReady, source: 'local' }
        : { payload: snapshotReady, source: 'snapshot' };
    }
    const localFreshnessScore = payloadFreshnessScore(snapshotKey, localReady);
    const snapshotFreshnessScore = payloadFreshnessScore(snapshotKey, snapshotReady);
    if (localFreshnessScore !== snapshotFreshnessScore) {
      return localFreshnessScore > snapshotFreshnessScore
        ? { payload: localReady, source: 'local' }
        : { payload: snapshotReady, source: 'snapshot' };
    }
    return preferPublishedSnapshotOnTie(snapshotKey)
      ? { payload: snapshotReady, source: 'snapshot' }
      : { payload: localReady, source: 'local' };
  }
  if (localReady) return { payload: localReady, source: 'local' };
  if (snapshotReady) return { payload: snapshotReady, source: 'snapshot' };
  return null;
}

function cloneJsonValue(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function optionalLoadJson(path) {
  return loadJson(path).catch(() => null);
}

function normalizeWorkbenchArticleKey(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '');
}

function asIsoDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function workbenchValueMissing(value) {
  return value === null || value === undefined || value === ''
    || (Array.isArray(value) && value.length === 0);
}

function mergeWorkbenchField(target, key, value, force = false) {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value) && value.length === 0) return;
  if (!force && !workbenchValueMissing(target[key])) return;
  target[key] = cloneJsonValue(value);
}

function applyLiveWorkbenchCurrentSellerPrice(target = {}, liveRow = {}, liveGeneratedAt = '') {
  const liveSellerPrice = repricerFirstFilledNumber(liveRow?.currentFillPrice, liveRow?.currentPrice);
  if (!(liveSellerPrice > 0)) return false;
  target.currentFillPrice = liveSellerPrice;
  target.currentPrice = liveSellerPrice;
  target.currentSellerPriceSource = 'live';
  target.currentPriceSource = 'live';
  const livePriceDate = asIsoDate(liveRow?.valueDate || liveRow?.historyFreshnessDate || liveGeneratedAt || '');
  if (livePriceDate) target.currentPriceDate = livePriceDate;
  return true;
}

function cloneWorkbenchSeries(series) {
  return Array.isArray(series)
    ? series.map((item) => cloneJsonValue(item) || {})
    : [];
}

function workbenchPlatformStock(row = {}, platform = '') {
  const rawPlatform = String(platform || '').trim().toLowerCase();
  if (rawPlatform === 'ozon') return row.stockOzon ?? row.stock ?? row.stockRepricer ?? row.stockTotal;
  if (rawPlatform === 'wb') return row.stockWb ?? row.stock ?? row.stockRepricer ?? row.stockTotal;
  return row.stock ?? row.stockRepricer ?? row.stockTotal ?? row.stockWb ?? row.stockOzon;
}

function workbenchPlatformTurnover(row = {}, platform = '') {
  const rawPlatform = String(platform || '').trim().toLowerCase();
  if (rawPlatform === 'ozon') return row.turnoverOzonDays ?? row.turnoverCurrentDays ?? row.turnoverTotalDays;
  if (rawPlatform === 'wb') return row.turnoverWbDays ?? row.turnoverCurrentDays ?? row.turnoverTotalDays;
  return row.turnoverCurrentDays ?? row.turnoverTotalDays ?? row.turnoverWbDays ?? row.turnoverOzonDays;
}

function workbenchOverlayTimelineSeries(overlayRow = {}, cutoff = '') {
  const sourceSeries = Array.isArray(overlayRow?.daily)
    ? overlayRow.daily
    : Array.isArray(overlayRow?.monthly)
      ? overlayRow.monthly
      : Array.isArray(overlayRow?.timeline)
        ? overlayRow.timeline
        : [];
  return cloneWorkbenchSeries(sourceSeries)
    .filter((item) => {
      const date = String(item?.date || '').trim();
      if (!date) return false;
      return !cutoff || date <= cutoff;
    })
    .sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')));
}

function applyWorkbenchOverlayPoint(point = {}, source = {}) {
  if (!point || !source) return;
  if (!workbenchValueMissing(source?.currentFillPrice)) point.price = source.currentFillPrice;
  else if (!workbenchValueMissing(source?.currentPrice)) point.price = source.currentPrice;
  else if (!workbenchValueMissing(source?.price)) point.price = source.price;
  if (!workbenchValueMissing(source?.currentClientPrice)) point.clientPrice = source.currentClientPrice;
  else if (!workbenchValueMissing(source?.clientPrice)) point.clientPrice = source.clientPrice;
  if (!workbenchValueMissing(source?.currentSppPct)) point.sppPct = source.currentSppPct;
  else if (!workbenchValueMissing(source?.sppPct)) point.sppPct = source.sppPct;
  if (!workbenchValueMissing(source?.currentTurnoverDays)) point.turnoverDays = source.currentTurnoverDays;
  else if (!workbenchValueMissing(source?.turnoverDays)) point.turnoverDays = source.turnoverDays;
  if (!workbenchValueMissing(source?.ordersUnits)) point.ordersUnits = source.ordersUnits;
  if (!workbenchValueMissing(source?.deliveredUnits)) point.deliveredUnits = source.deliveredUnits;
  if (!workbenchValueMissing(source?.revenue)) point.revenue = source.revenue;
}

function workbenchPayloadFreshness(payload = {}) {
  return payloadFreshnessScore('smart_price_workbench', payload || {});
}

function workbenchPayloadGeneratedStamp(payload = {}) {
  return parseFreshStamp(payload?.generatedAt || payload?.updatedAt || payload?.updated_at || '');
}

function shouldUseWorkbenchLivePayload(primaryPayload = {}, livePayload = {}) {
  if (!snapshotPayloadLooksUsable('smart_price_workbench', livePayload)) return false;
  const primaryGeneratedStamp = workbenchPayloadGeneratedStamp(primaryPayload);
  const liveGeneratedStamp = workbenchPayloadGeneratedStamp(livePayload);
  if (primaryGeneratedStamp && liveGeneratedStamp) return liveGeneratedStamp >= primaryGeneratedStamp;
  if (primaryGeneratedStamp) return false;
  if (liveGeneratedStamp) return true;
  const primaryFreshness = workbenchPayloadFreshness(primaryPayload);
  const liveFreshness = workbenchPayloadFreshness(livePayload);
  if (!primaryFreshness) return liveFreshness > 0;
  return liveFreshness >= primaryFreshness;
}

function mergeSmartWorkbenchRow(primaryRow = {}, liveRow = {}, platform = '', options = {}) {
  const next = cloneJsonValue(primaryRow) || {};
  const live = liveRow && typeof liveRow === 'object' ? liveRow : null;
  if (!live) return next;
  const useFullLive = options.useFullLive !== false;

  if (useFullLive) {
    [
      'articleKey',
      'article',
      'name',
      'owner',
      'marketplace',
      'currentFillPrice',
      'currentClientPrice',
      'currentSppPct',
      'seedTargetFillPrice',
      'seedTargetClientPrice',
      'seedReason',
      'requiredPriceForProfitability',
      'requiredPriceForMargin',
      'allowedMarginPct',
      'marginTotalPct',
      'avgMargin7dPct',
      'minPrice',
      'basePrice',
      'monthly'
    ].forEach((key) => mergeWorkbenchField(next, key, live[key]));

    [
      'brand',
      'strategy',
      'strategyNote',
      'direction',
      'cost',
      'costRub',
      'productStatus',
      'wbBlock',
      'trafficSignal',
      'stockWarehouse',
      'stockWb',
      'stockOzon',
      'stockTotal',
      'sales7Wb',
      'sales7Ozon',
      'sales7Total',
      'turnoverWbDays',
      'turnoverOzonDays',
      'turnoverTotalDays',
      'arrivalDate',
      'firstPrice',
      'discountFromPricePct',
      'recommendedFirstPrice',
      'id',
      'profitabilityPct',
      'marginNoAdsPct',
      'seedPriceRaise',
      'seedNewProfitabilityPct',
      'seedProfitabilityDeltaPct',
      'neededRaiseForProfitability',
      'neededClientPriceForProfitability',
      'neededRaiseForMargin',
      'neededClientPriceForMargin',
      'monthlyCurrentTurnoverDays',
      'monthlyCurrentPrice'
    ].forEach((key) => mergeWorkbenchField(next, key, live[key], true));

    mergeWorkbenchField(next, 'status', live.productStatus || live.status);
    mergeWorkbenchField(next, 'stock', workbenchPlatformStock(live, platform));
    mergeWorkbenchField(next, 'stockRepricer', workbenchPlatformStock(live, platform));
    mergeWorkbenchField(next, 'turnoverCurrentDays', workbenchPlatformTurnover(live, platform));
  }

  applyLiveWorkbenchCurrentSellerPrice(next, live, options.liveGeneratedAt || '');

  if (workbenchValueMissing(next.marketplace) && platform) next.marketplace = platform;
  if (workbenchValueMissing(next.costRub) && !workbenchValueMissing(next.cost)) next.costRub = next.cost;

  return next;
}

function mergeSmartWorkbenchPayload(primaryPayload = {}, livePayload = {}) {
  const primary = primaryPayload && typeof primaryPayload === 'object'
    ? cloneJsonValue(primaryPayload)
    : { generatedAt: '', platforms: {} };
  const liveCandidate = livePayload && typeof livePayload === 'object' ? cloneJsonValue(livePayload) : null;
  const useFullLive = shouldUseWorkbenchLivePayload(primary, liveCandidate);
  const live = liveCandidate?.platforms ? liveCandidate : null;
  const merged = primary && typeof primary === 'object' ? primary : { generatedAt: '', platforms: {} };
  merged.platforms = merged.platforms && typeof merged.platforms === 'object' ? merged.platforms : {};

  const platformKeys = new Set([
    ...Object.keys(primary?.platforms || {}),
    ...Object.keys(live?.platforms || {})
  ]);

  let liveEnrichedRows = 0;

  platformKeys.forEach((platform) => {
    const primaryBucket = primary?.platforms?.[platform] || {};
    const liveBucket = live?.platforms?.[platform] || {};
    const primaryRows = Array.isArray(primaryBucket.rows) ? primaryBucket.rows : [];
    const liveRows = Array.isArray(liveBucket.rows) ? liveBucket.rows : [];
    const liveMap = new Map();

    liveRows.forEach((row) => {
      const key = normalizeWorkbenchArticleKey(row?.articleKey || row?.article);
      if (!key || liveMap.has(key)) return;
      liveMap.set(key, row);
    });

    const mergedRows = [];
    const usedKeys = new Set();

    primaryRows.forEach((row) => {
      const key = normalizeWorkbenchArticleKey(row?.articleKey || row?.article);
      const liveRow = key ? liveMap.get(key) : null;
      if (liveRow) {
        usedKeys.add(key);
        liveEnrichedRows += 1;
      }
      mergedRows.push(mergeSmartWorkbenchRow(row, liveRow, platform, {
        useFullLive,
        liveGeneratedAt: live?.generatedAt || liveCandidate?.generatedAt || ''
      }));
    });

    liveRows.forEach((row) => {
      if (!useFullLive) return;
      const key = normalizeWorkbenchArticleKey(row?.articleKey || row?.article);
      if (!key || usedKeys.has(key)) return;
      liveEnrichedRows += 1;
      mergedRows.push(mergeSmartWorkbenchRow({}, row, platform, {
        useFullLive: true,
        liveGeneratedAt: live?.generatedAt || liveCandidate?.generatedAt || ''
      }));
    });

    const nextBucket = cloneJsonValue(primaryBucket) || {};
    if (!nextBucket.label && liveBucket.label) nextBucket.label = liveBucket.label;
    if (!nextBucket.emptyNote && liveBucket.emptyNote) nextBucket.emptyNote = liveBucket.emptyNote;
    nextBucket.rows = mergedRows;
    merged.platforms[platform] = nextBucket;
  });

  if (useFullLive && (!merged.generatedAt || parseFreshStamp(live?.generatedAt) > parseFreshStamp(merged.generatedAt))) {
    merged.generatedAt = live?.generatedAt || merged.generatedAt || '';
  }
  merged.liveEnrichmentAt = useFullLive ? (live?.generatedAt || '') : '';
  merged.liveCurrentPriceEnrichmentAt = liveCandidate?.generatedAt || '';
  merged.liveEnrichmentUsed = liveEnrichedRows > 0;
  if (live?.sourceFile) merged.liveSourceFile = live.sourceFile;

  return merged;
}

function workbenchOverlayRows(rows) {
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === 'object') return Object.values(rows);
  return [];
}

function overlayFlagEnabled(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function clearWorkbenchOverlayPoint(point = {}, overlayRow = {}) {
  if (overlayFlagEnabled(overlayRow?.clearCurrentFillPrice) || overlayFlagEnabled(overlayRow?.clearCurrentPrice)) {
    point.price = null;
  }
  if (overlayFlagEnabled(overlayRow?.clearCurrentClientPrice)) {
    point.clientPrice = null;
  }
  if (overlayFlagEnabled(overlayRow?.clearCurrentSppPct)) {
    point.sppPct = null;
  }
  if (overlayFlagEnabled(overlayRow?.clearCurrentTurnoverDays)) {
    point.turnoverDays = null;
  }
}

function clearWorkbenchOverlayRowFields(row = {}, overlayRow = {}) {
  if (overlayFlagEnabled(overlayRow?.clearCurrentFillPrice) || overlayFlagEnabled(overlayRow?.clearCurrentPrice)) {
    row.currentFillPrice = null;
    row.currentPrice = null;
  }
  if (overlayFlagEnabled(overlayRow?.clearCurrentClientPrice)) {
    row.currentClientPrice = null;
  }
  if (overlayFlagEnabled(overlayRow?.clearCurrentSppPct)) {
    row.currentSppPct = null;
  }
  if (overlayFlagEnabled(overlayRow?.clearCurrentTurnoverDays)) {
    row.currentTurnoverDays = null;
    row.turnoverCurrentDays = null;
  }
}

function mergeWorkbenchTimelineWithOverlay(series, overlayRow = {}) {
  const nextSeries = cloneWorkbenchSeries(series);
  const valueDate = String(overlayRow?.valueDate || overlayRow?.historyFreshnessDate || '').trim();
  if (!valueDate) return nextSeries;

  const pointsByDate = new Map();
  nextSeries.forEach((item) => {
    const date = String(item?.date || '').trim();
    if (!date || pointsByDate.has(date)) return;
    pointsByDate.set(date, item);
  });

  workbenchOverlayTimelineSeries(overlayRow, valueDate).forEach((item) => {
    const date = String(item?.date || '').trim();
    if (!date) return;
    let point = pointsByDate.get(date);
    if (!point) {
      point = { date };
      nextSeries.push(point);
      pointsByDate.set(date, point);
    }
    applyWorkbenchOverlayPoint(point, item);
  });

  let point = pointsByDate.get(valueDate);
  if (!point) {
    point = { date: valueDate };
    nextSeries.push(point);
  }
  clearWorkbenchOverlayPoint(point, overlayRow);
  applyWorkbenchOverlayPoint(point, overlayRow);

  nextSeries.sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')));
  return nextSeries;
}

function mergeSmartWorkbenchPriceOverlayRow(primaryRow = {}, overlayRow = {}, platform = '') {
  const next = cloneJsonValue(primaryRow) || {};
  const overlay = overlayRow && typeof overlayRow === 'object' ? overlayRow : null;
  if (!overlay) return next;

  clearWorkbenchOverlayRowFields(next, overlay);
  [
    'articleKey',
    'article',
    'name',
    'brand',
    'owner',
    'status',
    'valueDate',
    'historyFreshnessDate',
    'sourceSheet'
  ].forEach((key) => mergeWorkbenchField(next, key, overlay[key], true));

  const keepLiveSellerPrice = String(next.currentSellerPriceSource || next.currentPriceSource || '').trim().toLowerCase() === 'live'
    && !overlayFlagEnabled(overlay?.clearCurrentFillPrice)
    && !overlayFlagEnabled(overlay?.clearCurrentPrice);
  if (!keepLiveSellerPrice) {
    if (!workbenchValueMissing(overlay?.currentFillPrice)) {
      next.currentFillPrice = cloneJsonValue(overlay.currentFillPrice);
      next.currentPrice = cloneJsonValue(overlay.currentFillPrice);
      next.currentSellerPriceSource = 'overlay';
      next.currentPriceSource = 'overlay';
      next.currentPriceDate = asIsoDate(overlay?.valueDate || overlay?.historyFreshnessDate || '');
    } else if (!workbenchValueMissing(overlay?.currentPrice)) {
      next.currentPrice = cloneJsonValue(overlay.currentPrice);
      if (workbenchValueMissing(next.currentFillPrice)) next.currentFillPrice = cloneJsonValue(overlay.currentPrice);
      next.currentSellerPriceSource = 'overlay';
      next.currentPriceSource = 'overlay';
      next.currentPriceDate = asIsoDate(overlay?.valueDate || overlay?.historyFreshnessDate || '');
    }
  }

  [
    'currentClientPrice',
    'currentSppPct',
    'currentTurnoverDays',
    'stock',
    'stockWb',
    'stockOzon',
    'stockSeller',
    'stockTotal'
  ].forEach((key) => mergeWorkbenchField(next, key, overlay[key], true));

  [
    'minPrice',
    'hardMinPrice',
    'maxPrice',
    'basePrice',
    'allowedMarginPct',
    'avgMargin7dPct',
    'estimatedMarginPct',
    'requiredPriceForProfitability',
    'requiredPriceForMargin',
    'workingZoneFrom',
    'workingZoneTo',
    'marginSource'
  ].forEach((key) => mergeWorkbenchField(next, key, overlay[key], true));

  const overlayMarginPct = !workbenchValueMissing(overlay?.marginTotalPct)
    ? overlay.marginTotalPct
    : (!workbenchValueMissing(overlay?.marginPct)
      ? overlay.marginPct
      : overlay?.avgMargin7dPct);
  if (!workbenchValueMissing(overlayMarginPct)) {
    mergeWorkbenchField(next, 'marginPct', overlayMarginPct, true);
    mergeWorkbenchField(next, 'marginTotalPct', overlayMarginPct, true);
  }

  if (platform && workbenchValueMissing(next.marketplace)) next.marketplace = platform;
  if (!workbenchValueMissing(overlay?.status)) next.productStatus = overlay.status;
  next.monthly = mergeWorkbenchTimelineWithOverlay(next.monthly, overlay);
  next.daily = mergeWorkbenchTimelineWithOverlay(next.daily, overlay);
  return next;
}

function mergeSmartWorkbenchPriceOverlay(primaryPayload = {}, overlayPayload = {}) {
  const primary = primaryPayload && typeof primaryPayload === 'object'
    ? cloneJsonValue(primaryPayload)
    : { generatedAt: '', platforms: {} };
  const overlay = overlayPayload && typeof overlayPayload === 'object' ? cloneJsonValue(overlayPayload) : null;
  if (!overlay?.platforms) return primary;

  const merged = primary && typeof primary === 'object' ? primary : { generatedAt: '', platforms: {} };
  merged.platforms = merged.platforms && typeof merged.platforms === 'object' ? merged.platforms : {};
  const platformKeys = new Set([
    ...Object.keys(primary?.platforms || {}),
    ...Object.keys(overlay?.platforms || {})
  ]);

  let overlayRowsUsed = 0;

  platformKeys.forEach((platform) => {
    const primaryBucket = primary?.platforms?.[platform] || {};
    const overlayBucket = overlay?.platforms?.[platform] || {};
    const primaryRows = Array.isArray(primaryBucket.rows) ? primaryBucket.rows : [];
    const overlayRows = workbenchOverlayRows(overlayBucket.rows);
    const overlayMap = new Map();

    overlayRows.forEach((row) => {
      const key = normalizeWorkbenchArticleKey(row?.articleKey || row?.article);
      if (!key || overlayMap.has(key)) return;
      overlayMap.set(key, row);
    });

    const mergedRows = [];
    const usedKeys = new Set();

    primaryRows.forEach((row) => {
      const key = normalizeWorkbenchArticleKey(row?.articleKey || row?.article);
      const overlayRow = key ? overlayMap.get(key) : null;
      if (overlayRow) {
        usedKeys.add(key);
        overlayRowsUsed += 1;
      }
      mergedRows.push(mergeSmartWorkbenchPriceOverlayRow(row, overlayRow, platform));
    });

    overlayRows.forEach((row) => {
      const key = normalizeWorkbenchArticleKey(row?.articleKey || row?.article);
      if (!key || usedKeys.has(key)) return;
      overlayRowsUsed += 1;
      mergedRows.push(mergeSmartWorkbenchPriceOverlayRow({}, row, platform));
    });

    const nextBucket = cloneJsonValue(primaryBucket) || {};
    if (!nextBucket.label && overlayBucket.label) nextBucket.label = overlayBucket.label;
    if (!nextBucket.emptyNote && overlayBucket.emptyNote) nextBucket.emptyNote = overlayBucket.emptyNote;
    nextBucket.rows = mergedRows;
    merged.platforms[platform] = nextBucket;
  });

  if (!merged.generatedAt || parseFreshStamp(overlay?.generatedAt) > parseFreshStamp(merged.generatedAt)) {
    merged.generatedAt = overlay?.generatedAt || merged.generatedAt || '';
  }
  merged.priceOverlayAt = overlay?.generatedAt || '';
  merged.priceOverlaySource = overlay?.sourceFile || '';
  merged.priceOverlayUsed = overlayRowsUsed > 0;
  return merged;
}

function snapshotPayloadLooksUsable(snapshotKey, payload) {
  if (payload === null || payload === undefined) return false;
  if (snapshotKey === 'skus') return Array.isArray(payload) && payload.length > 0;
  if (snapshotKey === 'platform_trends') return Array.isArray(payload?.platforms) && payload.platforms.length > 0;
  if (snapshotKey === 'ads_summary') return Array.isArray(payload?.platforms) && payload.platforms.length > 0;
  if (snapshotKey === 'iu_drr_summary') return Array.isArray(payload?.daily) && payload.daily.length > 0;
  if (snapshotKey === 'wb_feedbacks_summary') return Array.isArray(payload?.cards) && payload.cards.length > 0;
  if (snapshotKey === 'wb_substitution_traffic') return Array.isArray(payload?.articles) && payload.articles.length > 0;
  if (snapshotKey === 'wb_substitution_traffic_history') return Array.isArray(payload) && payload.length > 0;
  if (snapshotKey === 'platform_plan') return typeof payload?.months === 'object' && payload.months !== null && Object.keys(payload.months).length > 0;
  if (snapshotKey === 'smart_price_workbench') {
    return typeof payload?.platforms === 'object' && payload.platforms !== null && Object.keys(payload.platforms).length > 0;
  }
  if (snapshotKey === 'prices') {
    return Array.isArray(payload?.dates) && payload.dates.length > 0
      && typeof payload?.platforms === 'object' && payload.platforms !== null
      && Object.keys(payload.platforms).length > 0;
  }
  if (snapshotKey === 'price_workbench_support') {
    if (typeof payload?.platforms !== 'object' || payload.platforms === null) return false;
    return Object.values(payload.platforms).some((bucket) => {
      const rows = bucket?.rows ?? bucket?.articles;
      if (Array.isArray(rows)) return rows.length > 0;
      return rows && typeof rows === 'object' && Object.keys(rows).length > 0;
    });
  }
  if (snapshotKey === 'product_leaderboard') {
    return Array.isArray(payload?.items) && payload.items.length > 0;
  }
  if (snapshotKey === 'product_leaderboard_history') {
    return Array.isArray(payload) && payload.length > 0;
  }
  if (snapshotKey === 'order_procurement' || snapshotKey === 'order_procurement_wb' || snapshotKey === 'order_procurement_ozon' || snapshotKey === 'order_procurement_ym' || snapshotKey === 'warehouse_stock_overlay') {
    return Array.isArray(payload?.rows) && payload.rows.length > 0;
  }
  if (snapshotKey === 'oos_control') {
    return typeof payload === 'object' && payload !== null && Array.isArray(payload.rows);
  }
  if (snapshotKey === 'portal_data_quality') {
    return typeof payload?.summary === 'object' && payload.summary !== null;
  }
  if (snapshotKey === 'portal_sync_health') {
    return typeof payload === 'object' && payload !== null && typeof payload.publish === 'object';
  }
  if (snapshotKey === 'portal_data_quarantine') {
    return typeof payload === 'object' && payload !== null && Array.isArray(payload.rows);
  }
  if (snapshotKey === 'sku_alias_audit') {
    return typeof payload === 'object' && payload !== null && Array.isArray(payload.events);
  }
  if (snapshotKey === 'logistics') {
    return Array.isArray(payload?.allRows) && payload.allRows.length > 0
      || Array.isArray(payload?.ozonClusters) && payload.ozonClusters.length > 0
      || Array.isArray(payload?.wbWarehouses) && payload.wbWarehouses.length > 0;
  }
  if (snapshotKey === 'dashboard') {
    return Array.isArray(payload?.cards) && payload.cards.length > 0
      || Array.isArray(payload?.brandSummary) && payload.brandSummary.length > 0;
  }
  return typeof payload === 'object' && payload !== null && Object.keys(payload).length > 0;
}

function resetPortalSnapshotState() {
  portalSnapshotState.client = null;
  portalSnapshotState.promise = null;
  portalSnapshotState.promises = {};
  portalSnapshotState.rows = {};
  portalSnapshotState.brand = '';
}

function getPortalSnapshotRequestConfig() {
  const cfg = currentConfig();
  if (!cfg.supabase?.url || !cfg.supabase?.anonKey || typeof fetch !== 'function') return null;
  const brand = currentBrand();
  portalSnapshotState.brand = brand;
  const baseUrl = String(cfg.supabase.url || '').replace(/\/+$/, '');
  const url = new URL(`${baseUrl}/rest/v1/${PORTAL_SNAPSHOT_TABLE}`);
  url.searchParams.set('select', 'snapshot_key,payload,generated_at,updated_at,payload_hash');
  url.searchParams.set('brand', `eq.${brand}`);
  return {
    brand,
    url: url.toString(),
    headers: {
      apikey: cfg.supabase.anonKey,
      Authorization: `Bearer ${state.team?.accessToken || window.__ALTEA_AUTH_SESSION__?.access_token || cfg.supabase.anonKey}`,
      Accept: 'application/json'
    }
  };
}

function parseChunkedSnapshotKey(snapshotKey = '') {
  const match = String(snapshotKey || '').match(/^(.*)__part__(\d{4})$/);
  if (!match) return null;
  return {
    baseKey: match[1],
    index: Number(match[2])
  };
}

function portalSnapshotRowStamp(row) {
  return Math.max(
    parseFreshStamp(row?.updated_at),
    parseFreshStamp(row?.generated_at),
    parseFreshStamp(row?.updatedAt),
    parseFreshStamp(row?.payload?.generatedAt),
    parseFreshStamp(row?.payload?.updatedAt),
    parseFreshStamp(row?.payload?.updated_at),
    parseFreshStamp(row?.payload?.asOfDate),
    parseFreshStamp(row?.payload?.dataFreshness?.asOfDate)
  );
}

function decodeChunkedPortalSnapshots(data) {
  const rows = {};
  const rowFreshness = {};
  const chunkGroups = new Map();

  const rememberRow = (snapshotKey, row) => {
    if (!snapshotKey) return;
    const freshness = portalSnapshotRowStamp(row);
    if (rowFreshness[snapshotKey] !== undefined && rowFreshness[snapshotKey] > freshness) return;
    rowFreshness[snapshotKey] = freshness;
    rows[snapshotKey] = row?.payload;
  };

  for (const row of data || []) {
    const snapshotKey = String(row?.snapshot_key || '').trim();
    if (!snapshotKey) continue;
    const chunkMeta = parseChunkedSnapshotKey(snapshotKey);
    if (!chunkMeta) {
      rememberRow(snapshotKey, row);
      continue;
    }
    rememberRow(snapshotKey, row);
    if (!chunkGroups.has(chunkMeta.baseKey)) chunkGroups.set(chunkMeta.baseKey, []);
    chunkGroups.get(chunkMeta.baseKey).push({
      index: chunkMeta.index,
      payload: row?.payload,
      snapshotKey
    });
  }

  for (const [baseKey, parts] of chunkGroups.entries()) {
    const meta = rows[baseKey];
    if (meta && meta.chunked !== true) continue;
    const expectedCount = Number(meta?.chunk_count || meta?.chunkCount || 0);
    const chunkCount = expectedCount > 0 ? expectedCount : parts.length;
    const ordered = new Map();
    parts.forEach((part) => {
      if (part.index < 1 || part.index > chunkCount) return;
      const existing = ordered.get(part.index);
      const freshness = rowFreshness[part.snapshotKey] || 0;
      if (existing && existing.freshness > freshness) return;
      ordered.set(part.index, {
        freshness,
        payload: part.payload
      });
    });
    const orderedParts = Array.from(ordered.entries())
      .sort((left, right) => left[0] - right[0])
      .map((entry) => entry[1].payload);
    if (!orderedParts.length || orderedParts.length !== chunkCount) continue;
    const text = orderedParts
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.data === 'string') return part.data;
        return '';
      })
      .join('');
    if (!text) continue;
    try {
      rows[baseKey] = JSON.parse(text);
    } catch (error) {
      console.warn(`[portal-snapshots] failed to decode chunked snapshot ${baseKey}`, error);
    }
  }

  return rows;
}

async function loadPortalSnapshotRows() {
  const brand = currentBrand();
  if (portalSnapshotState.promise && portalSnapshotState.brand === brand) return portalSnapshotState.promise;
  const requestConfig = getPortalSnapshotRequestConfig();
  if (!requestConfig) return {};

  portalSnapshotState.promise = withTimeout(
    fetch(requestConfig.url, { headers: requestConfig.headers }),
    PORTAL_SNAPSHOT_REQUEST_TIMEOUT_MS,
    'Загрузка витрины из Supabase'
  )
    .then((response) => {
      if (!response?.ok) throw new Error(`Supabase snapshots ${response?.status || 'request failed'}`);
      return withTimeout(response.json(), PORTAL_SNAPSHOT_REQUEST_TIMEOUT_MS, 'Чтение витрины из Supabase');
    })
    .then((data) => {
      const rows = decodeChunkedPortalSnapshots(data);
      portalSnapshotState.rows = rows;
      return rows;
    })
    .catch((error) => {
      console.warn('[portal-snapshots]', error);
      portalSnapshotState.rows = {};
      return {};
    });

  return portalSnapshotState.promise;
}

function portalSnapshotRequestBaseUrl() {
  const cfg = currentConfig();
  if (!cfg.supabase?.url || !cfg.supabase?.anonKey || typeof fetch !== 'function') return null;
  const brand = currentBrand();
  const baseUrl = String(cfg.supabase.url || '').replace(/\/+$/, '');
  const authToken = state.team?.accessToken || window.alteaPortalAuthGate?.getSession?.()?.access_token || window.__ALTEA_AUTH_SESSION__?.access_token || cfg.supabase.anonKey;
  return {
    brand,
    url: `${baseUrl}/rest/v1/${PORTAL_SNAPSHOT_TABLE}`,
    headers: {
      apikey: cfg.supabase.anonKey,
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json'
    }
  };
}

async function fetchPortalSnapshotRowsByKeys(snapshotKeys) {
  const requestConfig = portalSnapshotRequestBaseUrl();
  if (!requestConfig || !Array.isArray(snapshotKeys) || !snapshotKeys.length) return [];
  const rows = [];
  const chunks = [];
  for (let index = 0; index < snapshotKeys.length; index += 80) chunks.push(snapshotKeys.slice(index, index + 80));
  for (const batch of chunks) {
    const url = new URL(requestConfig.url);
    url.searchParams.set('select', 'snapshot_key,payload,generated_at,updated_at,payload_hash');
    url.searchParams.set('brand', `eq.${requestConfig.brand}`);
    url.searchParams.set('snapshot_key', batch.length === 1 ? `eq.${batch[0]}` : `in.(${batch.join(',')})`);
    url.searchParams.set('order', 'generated_at.desc');
    const response = await withTimeout(
      fetch(url.toString(), { headers: requestConfig.headers }),
      PORTAL_SNAPSHOT_REQUEST_TIMEOUT_MS,
      'Загрузка витрины из Supabase'
    );
    if (!response?.ok) throw new Error(`Supabase snapshots ${response?.status || 'request failed'}`);
    rows.push(...await withTimeout(response.json(), PORTAL_SNAPSHOT_REQUEST_TIMEOUT_MS, 'Чтение витрины из Supabase'));
  }
  return rows;
}

function snapshotPartKeys(snapshotKey, count) {
  const total = Math.max(0, Math.trunc(Number(count) || 0));
  const result = [];
  for (let index = 1; index <= total; index += 1) {
    result.push(`${snapshotKey}__part__${String(index).padStart(4, '0')}`);
  }
  return result;
}

async function loadPortalSnapshotPayloadByKey(snapshotKey) {
  const requestConfig = portalSnapshotRequestBaseUrl();
  if (!requestConfig || !snapshotKey) return null;
  const cacheKey = `${requestConfig.brand}|${snapshotKey}`;
  if (portalSnapshotState.promises?.[cacheKey]) return portalSnapshotState.promises[cacheKey];
  portalSnapshotState.promises[cacheKey] = (async () => {
    try {
      const baseRows = await fetchPortalSnapshotRowsByKeys([snapshotKey]);
      const baseRow = baseRows
        .filter((row) => row?.snapshot_key === snapshotKey)
        .sort((left, right) => portalSnapshotRowStamp(right) - portalSnapshotRowStamp(left))[0];
      const basePayload = baseRow?.payload;
      let rows = baseRows;
      if (basePayload?.chunked === true) {
        const partKeys = snapshotPartKeys(snapshotKey, basePayload.chunk_count || basePayload.chunkCount);
        rows = rows.concat(await fetchPortalSnapshotRowsByKeys(partKeys));
      }
      const decoded = decodeChunkedPortalSnapshots(rows);
      const payload = decoded[snapshotKey];
      if (payload !== undefined) portalSnapshotState.rows[snapshotKey] = payload;
      return payload !== undefined ? cloneJsonValue(payload) : null;
    } catch (error) {
      console.warn(`[portal-snapshots] ${snapshotKey}`, error);
      return null;
    }
  })();
  return portalSnapshotState.promises[cacheKey];
}

async function loadPortalSnapshotPayload(path) {
  const snapshotKey = snapshotKeyFromPath(path);
  if (!snapshotKey) return null;
  const payload = await loadPortalSnapshotPayloadByKey(snapshotKey);
  if (!snapshotPayloadLooksUsable(snapshotKey, payload)) return null;
  return cloneJsonValue(payload);
}

window.__alteaLoadPortalSnapshot = loadPortalSnapshotPayload;

function defaultStorage() {
  return {
    comments: [],
    tasks: [],
    decisions: [],
    ownerOverrides: [],
    resourceLinks: [],
    resourceFolders: [],
    productLifecycleOverrides: [],
    taskAttachments: [],
    autoTaskSnapshot: { generatedAt: '', active: [] },
    autoTaskHistory: [],
    promoEvents: [],
    promoEventDeletedIds: [],
    launchOverrides: [],
    launchDeletedIds: [],
    repricerSettings: defaultRepricerSettings(),
    repricerSettingsUpdatedAt: '',
    repricerOverrides: [],
    repricerSkuProfiles: [],
    repricerCorridors: [],
    repricerOverrideDeletes: [],
    repricerSkuProfileDeletes: [],
    repricerCorridorDeletes: [],
    repricerPendingApiAdds: [],
    repricerPendingApiDeletes: [],
    repricerPendingCostFixes: [],
    repricerPendingApiTasks: [],
    repricerRepairHistory: [],
    repricerRepairSnapshots: [],
    repricerApiReconcileHistory: [],
    repricerLastAuditImport: null,
    repricerLastAutoFix: null,
    repricerLastImportValidation: null,
    repricerLastApiReconcile: null,
    portalDataRules: {},
    portalDataRulesUpdatedAt: '',
    portalIssueSnapshot: null
  };
}

function hashString(value) {
  const str = String(value || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function stableId(prefix, raw) {
  return `${prefix}-${hashString(raw)}`;
}

const PRODUCT_LIFECYCLE_STATUS_META = {
  active: {
    label: 'Актуальный',
    tone: 'ok',
    repricerMode: 'auto',
    taskPolicy: 'normal',
    description: 'Товар в продаже, репрайсер работает по обычным правилам.'
  },
  new: {
    label: 'Новинка',
    tone: 'info',
    repricerMode: 'launch',
    taskPolicy: 'launch',
    description: 'Новинка или первый запуск: репрайсер использует launch-режим, автозадачи смотрят готовность запуска.'
  },
  relaunch: {
    label: 'Перезапуск',
    tone: 'info',
    repricerMode: 'launch',
    taskPolicy: 'launch',
    description: 'Перезапуск: логика близка к новинке, без межплощадочного выравнивания.'
  },
  watch: {
    label: 'Наблюдать',
    tone: 'warn',
    repricerMode: 'auto',
    taskPolicy: 'normal',
    description: 'Товар активен, но требует ручного наблюдения.'
  },
  question: {
    label: 'Под вопросом',
    tone: 'warn',
    repricerMode: 'freeze',
    taskPolicy: 'decision',
    description: 'Нужна управленческая развилка; репрайсер замораживает автосдвиг цены.'
  },
  paused: {
    label: 'Пауза',
    tone: 'warn',
    repricerMode: 'freeze',
    taskPolicy: 'decision',
    description: 'Товар временно на паузе; репрайсер не двигает цену автоматически.'
  },
  exit: {
    label: 'Выводится',
    tone: 'danger',
    repricerMode: 'off',
    taskPolicy: 'exit',
    description: 'Товар выводится: репрайсер не выгружает автоизменения, автозадачи ведут план вывода и остатки.'
  },
  archived: {
    label: 'Выведен',
    tone: '',
    repricerMode: 'off',
    taskPolicy: 'archive',
    description: 'Товар выведен из активного контура.'
  }
};

const PRODUCT_LIFECYCLE_STATUS_ORDER = ['active', 'new', 'relaunch', 'watch', 'question', 'paused', 'exit', 'archived'];

function productLifecycleLookupText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ');
}

function normalizeProductLifecycleKey(value = '') {
  const raw = productLifecycleLookupText(value);
  if (!raw) return '';
  if (['active', 'actual', 'ok', 'актуально', 'актуальный', 'в работе', 'работает'].includes(raw) || /актуал|active/.test(raw)) return 'active';
  if (['relaunch', 'restart', 'перезапуск'].includes(raw) || /перезапуск|relaunch|restart/.test(raw)) return 'relaunch';
  if (['new', 'launch', 'новинка', 'запуск'].includes(raw) || /новин|новый|\blaunch\b|запуск/.test(raw)) return 'new';
  if (['watch', 'monitor', 'наблюдать'].includes(raw) || /наблюд|монитор|watch|monitor/.test(raw)) return 'watch';
  if (['question', 'review', 'под вопросом', 'перерабатываем', 'нет в спецификации'].includes(raw) || /вопрос|перераб|review|специф/.test(raw)) return 'question';
  if (['paused', 'pause', 'freeze', 'hold', 'пауза', 'заморозка', 'стоп'].includes(raw) || /пауза|замороз|freeze|hold/.test(raw)) return 'paused';
  if (['archived', 'removed', 'выведен', 'выведено'].includes(raw) || /вывед|archiv|removed/.test(raw)) return 'archived';
  if (['exit', 'вывод', 'выводится', 'снимаем', 'снятие'].includes(raw) || /вывод|снимаем|снятие|exit|discontinu|sell.?out|clearance/.test(raw)) return 'exit';
  return '';
}

function productLifecycleMeta(key = '', fallbackLabel = '') {
  const normalizedKey = normalizeProductLifecycleKey(key) || String(key || '').trim();
  const meta = PRODUCT_LIFECYCLE_STATUS_META[normalizedKey] || null;
  if (meta) return { key: normalizedKey, ...meta };
  const label = String(fallbackLabel || key || '').trim();
  return {
    key: label ? 'custom' : 'active',
    label: label || PRODUCT_LIFECYCLE_STATUS_META.active.label,
    tone: label ? 'warn' : PRODUCT_LIFECYCLE_STATUS_META.active.tone,
    repricerMode: label ? 'freeze' : PRODUCT_LIFECYCLE_STATUS_META.active.repricerMode,
    taskPolicy: label ? 'decision' : PRODUCT_LIFECYCLE_STATUS_META.active.taskPolicy,
    description: label ? 'Пользовательский статус требует ручной проверки.' : PRODUCT_LIFECYCLE_STATUS_META.active.description
  };
}

function normalizeProductLifecycleOverride(item = {}) {
  const articleKey = String(item.articleKey || item.article || item.sku || '').trim();
  const rawStatus = String(item.status || item.productStatus || item.lifecycleStatus || '').trim();
  const key = normalizeProductLifecycleKey(item.key || rawStatus) || 'active';
  const meta = productLifecycleMeta(key, rawStatus);
  return {
    articleKey,
    key: meta.key,
    status: meta.label,
    note: String(item.note || item.comment || '').trim(),
    updatedAt: String(item.updatedAt || item.updated_at || '').trim() || new Date().toISOString(),
    updatedBy: String(item.updatedBy || item.updated_by || state.team?.member?.name || 'Команда').trim() || 'Команда'
  };
}

function productLifecycleOverrideForArticle(articleKey = '') {
  const wanted = String(articleKey || '').trim();
  if (!wanted) return null;
  return (state.storage?.productLifecycleOverrides || [])
    .map(normalizeProductLifecycleOverride)
    .find((item) => item.articleKey === wanted) || null;
}

function productLifecycleSourceValues(record = {}) {
  if (!record || typeof record !== 'object') return [];
  return [
    ['productLifecycleStatus', record.productLifecycleStatus],
    ['lifecycleStatus', record.lifecycleStatus],
    ['productStatus', record.productStatus],
    ['sheetStatus', record.sheetStatus],
    ['statusSku', record.statusSku],
    ['registryStatus', record.registryStatus],
    ['owner.registryStatus', record.owner?.registryStatus],
    ['status', record.status]
  ]
    .map(([source, value]) => ({ source, value: String(value || '').trim() }))
    .filter((entry) => entry.value);
}

function productLifecycleFinite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function productLifecycleFirstFinite(...values) {
  for (const value of values) {
    const parsed = productLifecycleFinite(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function productLifecycleTotalStock(record = {}) {
  return [
    record?.wb?.stock,
    record?.ozon?.stockProducts,
    record?.ozon?.stock
  ]
    .map(productLifecycleFinite)
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);
}

function productLifecycleHasStockSignal(record = {}) {
  return [
    record?.wb?.stock,
    record?.ozon?.stockProducts,
    record?.ozon?.stock
  ].some((value) => productLifecycleFinite(value) !== null);
}

function productLifecycleCompletionRatio(record = {}) {
  const value = productLifecycleFirstFinite(
    record?.planFact?.completionAprToDatePct,
    record?.planFact?.completionAprMonthPct,
    record?.planFact?.completionToDatePct,
    record?.planFact?.completionMonthPct,
    record?.planFact?.completionFeb26Pct
  );
  if (value === null) return null;
  return value > 1.5 ? value / 100 : value;
}

function productLifecycleSalesUnits(record = {}) {
  return productLifecycleFirstFinite(
    record?.planFact?.factApr16Units,
    record?.planFact?.factAprToDateUnits,
    record?.planFact?.factFeb26Units,
    record?.orders?.units,
    record?.orders?.count
  ) || 0;
}

function productLifecycleAutoForSku(record = {}, articleKey = '') {
  const flags = record?.flags || {};
  const reasons = [];
  let severity = 0;
  let watchSignals = 0;

  const completion = productLifecycleCompletionRatio(record);
  const focusScore = numberOrZero(record?.focusScore);
  const totalStock = productLifecycleTotalStock(record);
  const hasStockSignal = productLifecycleHasStockSignal(record);
  const salesUnits = productLifecycleSalesUnits(record);
  const turnoverDays = productLifecycleFirstFinite(record?.wb?.turnoverDays, record?.ozon?.turnoverDays);
  const marginValues = [
    record?.wb?.marginPct,
    record?.ozon?.marginPct,
    record?.planFact?.factApr16MarginPct,
    record?.planFact?.factFeb26MarginPct
  ]
    .map(productLifecycleFinite)
    .filter((value) => value !== null);
  const hasNegativeMargin = Boolean(flags.negativeMargin || flags.wbNegativeMargin || flags.ozonNegativeMargin || marginValues.some((value) => value < 0));
  const hasToWork = Boolean(flags.toWork || flags.toWorkWB || flags.toWorkOzon);

  if (hasStockSignal && totalStock <= 0 && salesUnits > 0) {
    const meta = productLifecycleMeta('paused');
    return {
      ...meta,
      articleKey,
      status: meta.label,
      source: 'auto',
      explicit: true,
      reason: 'Остаток на активных площадках нулевой при наличии продаж: товар временно уходит в паузу до решения по поставке.',
      note: ''
    };
  }

  if (hasNegativeMargin) {
    severity += 2;
    watchSignals += 1;
    reasons.push('маржа ниже нуля или отмечена как риск');
  }
  if (completion !== null && completion < 0.55) {
    severity += 1;
    watchSignals += 1;
    reasons.push(`выполнение плана ${Math.round(completion * 100)}%`);
  } else if (completion !== null && completion < 0.85) {
    watchSignals += 1;
    reasons.push(`выполнение плана ${Math.round(completion * 100)}%`);
  }
  if (flags.highReturn) {
    severity += 1;
    watchSignals += 1;
    reasons.push('высокие возвраты');
  }
  if (flags.lowStock && totalStock > 0) {
    watchSignals += 1;
    reasons.push('низкий остаток');
  }
  if (hasToWork) {
    severity += 1;
    watchSignals += 1;
    reasons.push('SKU уже попал в работу');
  }
  if (focusScore >= 7) {
    severity += 1;
    watchSignals += 1;
    reasons.push(`фокус score ${focusScore}`);
  } else if (focusScore >= 4) {
    watchSignals += 1;
    reasons.push(`фокус score ${focusScore}`);
  }
  if (turnoverDays !== null && turnoverDays >= 180) {
    watchSignals += 1;
    reasons.push(`оборачиваемость ${Math.round(turnoverDays)} дн.`);
  }

  if (severity >= 3) {
    const meta = productLifecycleMeta('question');
    return {
      ...meta,
      articleKey,
      status: meta.label,
      source: 'auto',
      explicit: true,
      reason: `Авто-статус: нужна развилка по товару (${reasons.slice(0, 3).join('; ')}).`,
      note: ''
    };
  }

  if (watchSignals > 0) {
    const meta = productLifecycleMeta('watch');
    return {
      ...meta,
      articleKey,
      status: meta.label,
      source: 'auto',
      explicit: true,
      reason: `Авто-статус: держим товар на наблюдении (${reasons.slice(0, 3).join('; ')}).`,
      note: ''
    };
  }

  const meta = productLifecycleMeta('active');
  return {
    ...meta,
    articleKey,
    status: meta.label,
    source: 'auto',
    explicit: false,
    reason: 'Критичных авто-сигналов по марже, плану, остаткам и возвратам нет.',
    note: ''
  };
}

function productLifecycleForSku(record = {}, fallbackArticleKey = '') {
  const articleKey = String(record?.articleKey || record?.article || record?.sku || fallbackArticleKey || '').trim();
  const override = productLifecycleOverrideForArticle(articleKey);
  if (override?.key) {
    const meta = productLifecycleMeta(override.key, override.status);
    return {
      ...meta,
      articleKey,
      status: meta.label,
      source: 'manual',
      explicit: true,
      note: override.note || '',
      updatedAt: override.updatedAt || '',
      updatedBy: override.updatedBy || ''
    };
  }

  const sourceMatches = productLifecycleSourceValues(record)
    .map((entry) => ({ ...entry, key: normalizeProductLifecycleKey(entry.value) }))
    .filter((entry) => entry.key);
  const hardSource = sourceMatches.find((entry) => entry.key && entry.key !== 'active');
  if (hardSource) {
    const meta = productLifecycleMeta(hardSource.key, hardSource.value);
    return {
      ...meta,
      articleKey,
      status: meta.label,
      rawStatus: hardSource.value,
      source: hardSource.source,
      explicit: true,
      reason: `Статус пришёл из поля ${hardSource.source}: ${hardSource.value}.`,
      note: ''
    };
  }

  const autoLifecycle = productLifecycleAutoForSku(record, articleKey);
  if (autoLifecycle?.key && autoLifecycle.key !== 'active') return autoLifecycle;

  const activeSource = sourceMatches.find((entry) => entry.key === 'active');
  if (activeSource) {
    const meta = productLifecycleMeta(activeSource.key, activeSource.value);
    return {
      ...meta,
      articleKey,
      status: meta.label,
      rawStatus: activeSource.value,
      source: activeSource.source,
      explicit: true,
      reason: autoLifecycle?.reason || `Статус пришёл из поля ${activeSource.source}: ${activeSource.value}.`,
      note: ''
    };
  }

  return autoLifecycle || {
    ...productLifecycleMeta('active'),
    articleKey,
    status: PRODUCT_LIFECYCLE_STATUS_META.active.label,
    source: 'fallback',
    explicit: false,
    reason: '',
    note: ''
  };
}

function productLifecycleIsExit(recordOrKey = '') {
  const key = typeof recordOrKey === 'string'
    ? normalizeProductLifecycleKey(recordOrKey)
    : productLifecycleForSku(recordOrKey)?.key;
  return key === 'exit' || key === 'archived';
}

function productLifecycleOptionsHtml(current = '') {
  const currentKey = normalizeProductLifecycleKey(current) || String(current || '').trim() || 'active';
  return PRODUCT_LIFECYCLE_STATUS_ORDER.map((key) => {
    const meta = productLifecycleMeta(key);
    return `<option value="${key}" ${key === currentKey ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`;
  }).join('');
}

window.PRODUCT_LIFECYCLE_STATUS_META = PRODUCT_LIFECYCLE_STATUS_META;
window.normalizeProductLifecycleKey = normalizeProductLifecycleKey;
window.normalizeProductLifecycleOverride = normalizeProductLifecycleOverride;
window.productLifecycleForSku = productLifecycleForSku;
window.productLifecycleAutoForSku = productLifecycleAutoForSku;
window.productLifecycleOverrideForArticle = productLifecycleOverrideForArticle;
window.productLifecycleIsExit = productLifecycleIsExit;
window.productLifecycleOptionsHtml = productLifecycleOptionsHtml;

const REPRICER_BRAND_ALIAS_MAP = {
  'алтея': 'Алтея',
  altea: 'Алтея',
  cpa: 'CPA',
  harly: '',
  harley: ''
};

function repricerCanonicalBrandName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const alias = REPRICER_BRAND_ALIAS_MAP[raw.toLowerCase()];
  if (alias !== undefined) return alias;
  return raw;
}

function defaultRepricerSettings() {
  return {
    global: {
      minMarginPct: 25,
      defaultTargetDays: 30,
      launchTargetDays: 45,
      oosDays: 5,
      alignmentEnabled: true,
      deadbandPct: 3,
      deadbandRub: 50
    },
    brandRules: {
      'Алтея': { defaultTargetDays: 30, launchTargetDays: 45, oosDays: 5, minMarginPct: 25, alignmentEnabled: true },
      CPA: { defaultTargetDays: 30, launchTargetDays: 45, oosDays: 5, minMarginPct: 25, alignmentEnabled: true }
    },
    statusRules: {
      'Актуально': { mode: 'auto', allowAutoprice: true, allowLaunch: false, allowAlignment: true },
      'Актуальный': { mode: 'auto', allowAutoprice: true, allowLaunch: false, allowAlignment: true },
      'Новинка': { mode: 'launch', allowAutoprice: true, allowLaunch: true, allowAlignment: false },
      'Перезапуск': { mode: 'launch', allowAutoprice: true, allowLaunch: true, allowAlignment: false },
      'Под вопросом': { mode: 'freeze', allowAutoprice: false, allowLaunch: false, allowAlignment: false },
      'Перерабатываем': { mode: 'freeze', allowAutoprice: false, allowLaunch: false, allowAlignment: false },
      'Вывод': { mode: 'off', allowAutoprice: false, allowLaunch: false, allowAlignment: false }
    },
    roleRules: {
      Hero: { targetDays: 28, minLiftPct: 2, stretchMultiplier: 1.2, allowVolumePush: true, elasticityDefault: -1.3 },
      Traffic: { targetDays: 29, minLiftPct: 2, stretchMultiplier: 1.15, allowVolumePush: true, elasticityDefault: -1.15 },
      Margin: { targetDays: 30, minLiftPct: 3, stretchMultiplier: 1.1, allowVolumePush: false, elasticityDefault: -0.9 },
      Launch: { targetDays: 45, minLiftPct: 0, stretchMultiplier: 1.15, allowVolumePush: false, elasticityDefault: -0.5 },
      Exit: { targetDays: 30, minLiftPct: 0, stretchMultiplier: 1, allowVolumePush: false, elasticityDefault: -1 },
      Freeze: { targetDays: 30, minLiftPct: 0, stretchMultiplier: 1, allowVolumePush: false, elasticityDefault: -0.8 }
    },
    feeRules: {
      wb: { commissionPct: 19, logisticsRub: 72, storageRub: 6, adRub: 35, returnsRub: 12, otherRub: 0 },
      ozon: { commissionPct: 18, logisticsRub: 68, storageRub: 5, adRub: 30, returnsRub: 10, otherRub: 0 },
      yandex: { commissionPct: 17, logisticsRub: 75, storageRub: 6, adRub: 28, returnsRub: 11, otherRub: 0 }
    }
  };
}

function normalizeRepricerMode(mode) {
  const raw = String(mode || '').trim().toLowerCase();
  if (['freeze', 'hold', 'force', 'off'].includes(raw)) return raw;
  return 'auto';
}

function normalizeRepricerEngineMode(mode) {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'hold') return 'launch';
  if (raw === 'force') return 'freeze';
  if (['launch', 'freeze', 'off'].includes(raw)) return raw;
  return 'auto';
}

function repricerNumberOrBlank(value) {
  if (value === null || value === undefined || value === '') return '';
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
}

function repricerSignedNumberOrBlank(value) {
  if (value === null || value === undefined || value === '') return '';
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : '';
}

function repricerBool(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  const raw = String(value).trim().toLowerCase();
  if (['y', 'yes', 'true', '1', 'да'].includes(raw)) return true;
  if (['n', 'no', 'false', '0', 'нет'].includes(raw)) return false;
  return Boolean(value);
}

function repricerDateKey(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (directMatch) return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeRepricerStatusRule(item = {}, fallback = {}) {
  const source = typeof item === 'string' ? { mode: item } : (item || {});
  const base = typeof fallback === 'string' ? { mode: fallback } : (fallback || {});
  return {
    mode: normalizeRepricerEngineMode(source.mode ?? base.mode),
    allowAutoprice: repricerBool(source.allowAutoprice, repricerBool(base.allowAutoprice, true)),
    allowLaunch: repricerBool(source.allowLaunch, repricerBool(base.allowLaunch, false)),
    allowAlignment: repricerBool(source.allowAlignment, repricerBool(base.allowAlignment, true))
  };
}

function normalizeRepricerRoleRule(item = {}, fallback = {}) {
  const source = item || {};
  const base = fallback || {};
  const next = {
    targetDays: Number(source.targetDays ?? base.targetDays),
    minLiftPct: Number(source.minLiftPct ?? base.minLiftPct),
    stretchMultiplier: Number(source.stretchMultiplier ?? base.stretchMultiplier),
    allowVolumePush: repricerBool(source.allowVolumePush, repricerBool(base.allowVolumePush, true)),
    elasticityDefault: Number(source.elasticityDefault ?? base.elasticityDefault)
  };
  if (!Number.isFinite(next.targetDays)) next.targetDays = Number(base.targetDays) || 30;
  if (!Number.isFinite(next.minLiftPct)) next.minLiftPct = Number(base.minLiftPct) || 0;
  if (!Number.isFinite(next.stretchMultiplier)) next.stretchMultiplier = Number(base.stretchMultiplier) || 1;
  if (!Number.isFinite(next.elasticityDefault)) next.elasticityDefault = Number(base.elasticityDefault) || -1;
  return next;
}

function normalizeRepricerBrandRule(item = {}, fallback = {}) {
  const source = item || {};
  const base = fallback || {};
  const next = {
    defaultTargetDays: Number(source.defaultTargetDays ?? base.defaultTargetDays),
    launchTargetDays: Number(source.launchTargetDays ?? base.launchTargetDays),
    oosDays: Number(source.oosDays ?? base.oosDays),
    minMarginPct: Number(source.minMarginPct ?? base.minMarginPct),
    alignmentEnabled: repricerBool(source.alignmentEnabled, repricerBool(base.alignmentEnabled, true))
  };
  if (!Number.isFinite(next.defaultTargetDays)) next.defaultTargetDays = Number(base.defaultTargetDays) || 30;
  if (!Number.isFinite(next.launchTargetDays)) next.launchTargetDays = Number(base.launchTargetDays) || 45;
  if (!Number.isFinite(next.oosDays)) next.oosDays = Number(base.oosDays) || 5;
  if (!Number.isFinite(next.minMarginPct)) next.minMarginPct = Number(base.minMarginPct) || 15;
  return next;
}

function normalizeRepricerFeeRule(item = {}, fallback = {}) {
  const source = item || {};
  const base = fallback || {};
  const next = {
    commissionPct: Number(source.commissionPct ?? base.commissionPct),
    logisticsRub: Number(source.logisticsRub ?? base.logisticsRub),
    storageRub: Number(source.storageRub ?? base.storageRub),
    adRub: Number(source.adRub ?? base.adRub),
    returnsRub: Number(source.returnsRub ?? base.returnsRub),
    otherRub: Number(source.otherRub ?? base.otherRub)
  };
  Object.keys(next).forEach((key) => {
    if (!Number.isFinite(next[key])) next[key] = Number(base[key]) || 0;
  });
  return next;
}

function normalizeRepricerSettings(item = {}) {
  const defaults = defaultRepricerSettings();
  const rawGlobal = typeof item?.global === 'object' && item.global !== null ? item.global : {};
  const rawBrandRules = typeof item?.brandRules === 'object' && item.brandRules !== null ? item.brandRules : {};
  const rawStatusRules = typeof item?.statusRules === 'object' && item.statusRules !== null ? item.statusRules : {};
  const rawRoleRules = typeof item?.roleRules === 'object' && item.roleRules !== null ? item.roleRules : {};
  const rawFeeRules = typeof item?.feeRules === 'object' && item.feeRules !== null ? item.feeRules : {};
  const next = {
    global: {
      minMarginPct: Number(rawGlobal.minMarginPct),
      defaultTargetDays: Number(rawGlobal.defaultTargetDays),
      launchTargetDays: Number(rawGlobal.launchTargetDays),
      oosDays: Number(rawGlobal.oosDays),
      alignmentEnabled: rawGlobal.alignmentEnabled === undefined ? defaults.global.alignmentEnabled : Boolean(rawGlobal.alignmentEnabled),
      deadbandPct: Number(rawGlobal.deadbandPct),
      deadbandRub: Number(rawGlobal.deadbandRub)
    },
    brandRules: {},
    statusRules: {},
    roleRules: {},
    feeRules: {}
  };
  Object.keys(next.global).forEach((key) => {
    if (typeof defaults.global[key] === 'number' && !Number.isFinite(next.global[key])) next.global[key] = defaults.global[key];
  });
  const normalizedRawBrandRules = {};
  Object.keys(rawBrandRules).forEach((brand) => {
    const normalizedBrand = repricerCanonicalBrandName(brand);
    if (!normalizedBrand) return;
    normalizedRawBrandRules[normalizedBrand] = rawBrandRules[brand];
  });
  const brandKeys = new Set([...Object.keys(defaults.brandRules || {}), ...Object.keys(normalizedRawBrandRules)]);
  brandKeys.forEach((brand) => {
    const normalizedBrand = repricerCanonicalBrandName(brand);
    if (!normalizedBrand) return;
    next.brandRules[normalizedBrand] = normalizeRepricerBrandRule(normalizedRawBrandRules[normalizedBrand], defaults.brandRules?.[normalizedBrand] || defaults.global);
  });
  const statusKeys = new Set([...Object.keys(defaults.statusRules), ...Object.keys(rawStatusRules)]);
  statusKeys.forEach((status) => {
    const normalizedStatus = String(status || '').trim();
    if (!normalizedStatus) return;
    next.statusRules[normalizedStatus] = normalizeRepricerStatusRule(rawStatusRules[normalizedStatus], defaults.statusRules[normalizedStatus] || {});
  });
  const roleKeys = new Set([...Object.keys(defaults.roleRules), ...Object.keys(rawRoleRules)]);
  roleKeys.forEach((role) => {
    const normalizedRole = String(role || '').trim();
    if (!normalizedRole) return;
    next.roleRules[normalizedRole] = normalizeRepricerRoleRule(rawRoleRules[normalizedRole], defaults.roleRules[normalizedRole] || {});
  });
  const feeKeys = new Set([...Object.keys(defaults.feeRules), ...Object.keys(rawFeeRules)]);
  feeKeys.forEach((platform) => {
    const normalizedPlatform = String(platform || '').trim().toLowerCase();
    if (!normalizedPlatform) return;
    next.feeRules[normalizedPlatform] = normalizeRepricerFeeRule(rawFeeRules[normalizedPlatform], defaults.feeRules[normalizedPlatform] || {});
  });
  return next;
}

function normalizeRepricerLaunchReady(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (['READY', 'GO', 'LIVE'].includes(raw)) return 'READY';
  if (['HOLD', 'WAIT', 'BLOCK', 'NOT_READY', 'NOT READY', 'DRAFT'].includes(raw)) return 'HOLD';
  return raw;
}

function normalizeRepricerOverride(item = {}) {
  const articleKey = String(item.articleKey || item.article || '').trim();
  const rawPlatform = String(item.platform || '').trim().toLowerCase();
  const platform = ['wb', 'ozon', 'all'].includes(rawPlatform) ? rawPlatform : 'all';
  const promoPrice = repricerNumberOrBlank(item.promoPrice ?? item.promoFixedPrice);
  return {
    id: item.id || stableId('repricer', `${articleKey}|${platform}`),
    articleKey,
    platform,
    mode: normalizeRepricerMode(item.mode),
    floorPrice: repricerNumberOrBlank(item.floorPrice ?? item.floorOverride ?? item.minPrice),
    capPrice: repricerNumberOrBlank(item.capPrice ?? item.capOverride ?? item.maxPrice),
    forcePrice: repricerNumberOrBlank(item.forcePrice),
    promoActive: repricerBool(item.promoActive ?? item.isPromo ?? item.promoEnabled, promoPrice !== ''),
    promoPrice,
    promoLabel: String(item.promoLabel || item.promoTag || item.promoReason || '').trim(),
    promoFrom: repricerDateKey(item.promoFrom ?? item.promoStart ?? item.promoDateFrom),
    promoTo: repricerDateKey(item.promoTo ?? item.promoEnd ?? item.promoDateTo),
    disableAlignment: Boolean(item.disableAlignment || item.noAlignment),
    note: String(item.note || '').trim(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    updatedBy: String(item.updatedBy || item.updatedByName || state.team.member.name || 'Команда').trim() || 'Команда'
  };
}

function normalizeRepricerSkuProfile(item = {}) {
  const articleKey = String(item.articleKey || item.article || '').trim();
  return {
    id: item.id || stableId('repricer-sku', articleKey),
    articleKey,
    status: String(item.status || item.statusSku || '').trim(),
    role: String(item.role || item.roleSku || '').trim(),
    launchReady: normalizeRepricerLaunchReady(item.launchReady || item.launch_status || item.launchState),
    updatedAt: item.updatedAt || new Date().toISOString(),
    updatedBy: String(item.updatedBy || item.updatedByName || state.team.member.name || 'Команда').trim() || 'Команда'
  };
}

function normalizeRepricerCorridor(item = {}) {
  const articleKey = String(item.articleKey || item.article || '').trim();
  const rawPlatform = String(item.platform || '').trim().toLowerCase();
  const platform = ['wb', 'ozon', 'all'].includes(rawPlatform) ? rawPlatform : 'all';
  return {
    id: item.id || stableId('repricer-corridor', `${articleKey}|${platform}`),
    articleKey,
    platform,
    hardFloor: repricerNumberOrBlank(item.hardFloor),
    b2bFloor: repricerNumberOrBlank(item.b2bFloor),
    basePrice: repricerNumberOrBlank(item.basePrice),
    stretchCap: repricerNumberOrBlank(item.stretchCap ?? item.capPrice),
    promoFloor: repricerNumberOrBlank(item.promoFloor),
    elasticity: repricerSignedNumberOrBlank(item.elasticity),
    updatedAt: item.updatedAt || new Date().toISOString(),
    updatedBy: String(item.updatedBy || item.updatedByName || state.team.member.name || 'Команда').trim() || 'Команда'
  };
}

function normalizeRepricerDeleteTombstone(item = {}) {
  const articleKey = String(item.articleKey || item.article || '').trim();
  const rawPlatform = String(item.platform || '').trim().toLowerCase();
  const platform = ['wb', 'ozon', 'all'].includes(rawPlatform) ? rawPlatform : 'all';
  return {
    id: item.id || stableId('repricer-delete', `${articleKey}|${platform}`),
    articleKey,
    platform,
    deletedAt: item.deletedAt || item.updatedAt || new Date().toISOString(),
    updatedBy: String(item.updatedBy || item.updatedByName || state.team.member.name || 'Команда').trim() || 'Команда'
  };
}

function normalizeComment(item = {}) {
  return {
    id: item.id || stableId('comment', `${item.articleKey || ''}|${item.author || ''}|${item.createdAt || ''}|${item.text || ''}`),
    articleKey: item.articleKey || '',
    author: String(item.author || 'Команда').trim() || 'Команда',
    team: String(item.team || 'Команда').trim() || 'Команда',
    createdAt: item.createdAt || new Date().toISOString(),
    text: String(item.text || '').trim(),
    type: String(item.type || 'signal')
  };
}

const EMPTY_OWNER_NAMES = new Set([
  '',
  '-',
  '—',
  'без owner',
  'без владельца',
  'не назначен',
  'не назначена',
  'нет owner',
  'no owner',
  'none'
]);

const ACTIVE_OWNER_NAMES = new Set([
  'Анна Пирогова',
  'Екатерина Доможирова',
  'Максим Лапыгин',
  'Мария Васильева',
  'Молодякова Дария',
  'Питайкин Артём'
]);

const ACTIVE_OWNER_NAMES_BY_PLATFORM = {
  wb: ['Мария Васильева', 'Максим Лапыгин'],
  ozon: ['Молодякова Дария', 'Питайкин Артём'],
  ym: ['Анна Пирогова'],
  ga: ['Екатерина Доможирова'],
  letu: ['Екатерина Доможирова'],
  mm: ['Екатерина Доможирова'],
  megamarket: ['Екатерина Доможирова'],
  samokat: ['Екатерина Доможирова']
};

const OWNER_CANONICAL_NAMES = new Map([
  ['александр', 'Питайкин Артём'],
  ['анна', 'Анна Пирогова'],
  ['артем', 'Питайкин Артём'],
  ['артём', 'Питайкин Артём'],
  ['дария', 'Молодякова Дария'],
  ['дарья', 'Молодякова Дария'],
  ['даша', 'Молодякова Дария'],
  ['екатерина', 'Екатерина Доможирова'],
  ['максим', 'Максим Лапыгин'],
  ['мария', 'Мария Васильева']
]);

const OWNER_NAME_ALIASES = new Map([
  ['александр озон', 'Питайкин Артём'],
  ['питайкин артем', 'Питайкин Артём'],
  ['питайкин артём', 'Питайкин Артём'],
  ['артем питайкин', 'Питайкин Артём'],
  ['артём питайкин', 'Питайкин Артём'],
  ['молодякова дария', 'Молодякова Дария'],
  ['молодякова дарья', 'Молодякова Дария'],
  ['дария молодякова', 'Молодякова Дария'],
  ['дарья молодякова', 'Молодякова Дария'],
  ['анна пирогова', 'Анна Пирогова'],
  ['пирогова анна', 'Анна Пирогова'],
  ['екатерина доброжирова', 'Екатерина Доможирова'],
  ['екатерина доможирова', 'Екатерина Доможирова'],
  ['доможирова екатерина', 'Екатерина Доможирова'],
  ['доброжирова екатерина', 'Екатерина Доможирова'],
  ['мария васильева', 'Мария Васильева'],
  ['мария васильевна', 'Мария Васильева'],
  ['васильева мария', 'Мария Васильева'],
  ['лапыгин максим', 'Максим Лапыгин'],
  ['максим лапыгин', 'Максим Лапыгин']
]);

function normalizeOwnerToken(value = '') {
  const rawValue = value && typeof value === 'object'
    ? (value.name ?? value.ownerName ?? value.owner ?? value.label ?? '')
    : value;
  const normalized = String(rawValue ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized === '[object Object]' ? '' : normalized;
}

function activeOwnerList(platform = 'all') {
  const normalizedPlatform = typeof normalizeOwnerPlatformKey === 'function'
    ? normalizeOwnerPlatformKey(platform)
    : String(platform || '').trim().toLowerCase();
  if (normalizedPlatform && normalizedPlatform !== 'all' && ACTIVE_OWNER_NAMES_BY_PLATFORM[normalizedPlatform]) {
    return ACTIVE_OWNER_NAMES_BY_PLATFORM[normalizedPlatform].filter((owner) => ACTIVE_OWNER_NAMES.has(owner));
  }
  return [...ACTIVE_OWNER_NAMES];
}

function canonicalOwnerName(value = '') {
  const normalized = normalizeOwnerToken(value);
  if (!normalized) return '';

  const lowered = normalized.toLowerCase();
  if (EMPTY_OWNER_NAMES.has(lowered)) return '';
  let canonical = '';
  if (OWNER_NAME_ALIASES.has(lowered)) canonical = OWNER_NAME_ALIASES.get(lowered);
  else if (OWNER_CANONICAL_NAMES.has(lowered)) canonical = OWNER_CANONICAL_NAMES.get(lowered);

  if (!canonical) {
    const [firstToken = ''] = normalized.split(' ');
    const firstTokenLowered = firstToken.toLowerCase();
    if (OWNER_CANONICAL_NAMES.has(firstTokenLowered)) canonical = OWNER_CANONICAL_NAMES.get(firstTokenLowered);
  }

  canonical = canonical || normalized;
  return ACTIVE_OWNER_NAMES.has(canonical) ? canonical : '';
}

function activeOwnerName(value = '', platform = 'all') {
  const canonical = canonicalOwnerName(value);
  if (!canonical) return '';
  const scopedOwners = activeOwnerList(platform);
  return scopedOwners.includes(canonical) ? canonical : '';
}

function isActiveOwnerName(value = '', platform = 'all') {
  return Boolean(activeOwnerName(value, platform));
}

function normalizeOwnerPlatformKey(platform = '') {
  const normalized = String(platform || '').trim().toLowerCase();
  if (normalized === 'ya' || normalized === 'yandex' || normalized === 'yandex_market' || normalized === 'market') return 'ym';
  if (normalized === 'goldapple' || normalized === 'goldenapple' || normalized === 'zya') return 'ga';
  if (normalized === 'magnit' || normalized === 'magnitmarket') return 'mm';
  return normalized;
}

const OWNER_OVERRIDE_PLATFORM_KEYS = new Set(['wb', 'ozon', 'ym', 'letu', 'ga', 'mm']);
const OWNER_OVERRIDE_NOTE_RE = /\[\[ownerByPlatform:([A-Za-z0-9%._~-]+)\]\]/g;

function normalizeOwnerOverridePlatformKey(platform = '') {
  const raw = String(platform || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'wb' || raw === 'wildberries' || raw === 'вб') return 'wb';
  if (raw === 'ozon' || raw === 'oz' || raw === 'озон') return 'ozon';
  if (raw === 'ym' || raw === 'ya' || raw === 'yandex' || raw === 'yandex_market' || raw === 'market' || raw === 'ям' || raw === 'яндекс') return 'ym';
  if (raw === 'letu' || raw === 'letual' || raw === 'лэтуаль' || raw === 'летуаль') return 'letu';
  if (raw === 'ga' || raw === 'goldenapple' || raw === 'зя' || raw === 'зя') return 'ga';
  if (raw === 'mm' || raw === 'magnit' || raw === 'магнит') return 'mm';
  return normalizeOwnerPlatformKey(raw);
}

function normalizeOwnerOverridePlatforms(platforms = {}) {
  const result = {};
  if (!platforms || typeof platforms !== 'object') return result;
  for (const [rawKey, rawValue] of Object.entries(platforms)) {
    const key = normalizeOwnerOverridePlatformKey(rawKey);
    if (!key || !OWNER_OVERRIDE_PLATFORM_KEYS.has(key)) continue;
    const value = canonicalOwnerName(rawValue || '');
    if (!value) continue;
    result[key] = value;
  }
  return result;
}

function parseOwnerOverrideNote(noteValue = '') {
  const raw = String(noteValue || '').trim();
  if (!raw) return { note: '', ownerByPlatform: {} };
  let ownerByPlatform = {};
  const note = raw
    .replace(OWNER_OVERRIDE_NOTE_RE, (_match, payload) => {
      try {
        const decoded = decodeURIComponent(String(payload || '').trim());
        const parsed = JSON.parse(decoded);
        ownerByPlatform = {
          ...ownerByPlatform,
          ...normalizeOwnerOverridePlatforms(parsed)
        };
      } catch {}
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { note, ownerByPlatform };
}

function composeOwnerOverrideNote(noteValue = '', ownerByPlatform = {}) {
  const note = String(noteValue || '').trim();
  const normalizedOwners = normalizeOwnerOverridePlatforms(ownerByPlatform);
  if (!Object.keys(normalizedOwners).length) return note;
  try {
    const payload = encodeURIComponent(JSON.stringify(normalizedOwners));
    const marker = `[[ownerByPlatform:${payload}]]`;
    return note ? `${note}\n${marker}` : marker;
  } catch {
    return note;
  }
}

function platformOwnerName(sku, platform = '') {
  const key = normalizeOwnerPlatformKey(platform);
  if (!sku || !key) return '';

  const sources = [
    sku?.owner?.byPlatform,
    sku?.ownersByPlatform
  ];

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const candidate = key === 'ym'
      ? (source.ym || source.ya || '')
      : source[key];
    const normalized = canonicalOwnerName(candidate || '');
    if (normalized) return normalized;
  }

  return '';
}

function normalizeDecision(item = {}) {
  return {
    id: item.id || stableId('decision', `${item.articleKey || ''}|${item.title || ''}|${item.createdAt || ''}|${item.decision || ''}`),
    articleKey: item.articleKey || '',
    title: String(item.title || 'Решение').trim() || 'Решение',
    decision: String(item.decision || '').trim(),
    owner: canonicalOwnerName(item.owner || ''),
    status: mapTaskStatus(item.status || 'waiting_decision'),
    due: item.due || '',
    createdAt: item.createdAt || new Date().toISOString(),
    createdBy: String(item.createdBy || state.team.member.name || 'Команда').trim() || 'Команда'
  };
}

function normalizeOwnerOverride(item = {}) {
  const parsedNote = parseOwnerOverrideNote(item.note || '');
  const explicitOwnerByPlatform = normalizeOwnerOverridePlatforms(
    item.ownerByPlatform
    || item.ownersByPlatform
    || item.byPlatform
    || {}
  );
  const ownerByPlatform = Object.keys(explicitOwnerByPlatform).length
    ? explicitOwnerByPlatform
    : parsedNote.ownerByPlatform;
  return {
    articleKey: item.articleKey || '',
    ownerName: canonicalOwnerName(item.ownerName || item.owner || ''),
    ownerRole: String(item.ownerRole || '').trim(),
    ownerByPlatform,
    note: parsedNote.note,
    updatedAt: item.updatedAt || new Date().toISOString(),
    assignedBy: String(item.assignedBy || state.team.member.name || 'Команда').trim() || 'Команда'
  };
}

function normalizeTaskAttachment(item = {}) {
  const fileName = String(item.fileName || item.name || '').trim();
  const mimeType = String(item.mimeType || item.mime_type || '').trim();
  const bucket = String(item.bucket || item.bucketName || item.bucket_name || TASK_ATTACHMENTS_BUCKET).trim() || TASK_ATTACHMENTS_BUCKET;
  const objectPath = String(item.objectPath || item.object_path || '').trim();
  const publicUrl = String(item.publicUrl || item.public_url || '').trim();
  const createdBy = String(item.createdBy || item.created_by || state.team.member.name || 'Команда').trim() || 'Команда';
  return {
    id: String(item.id || uid('attach')).trim() || uid('attach'),
    taskId: String(item.taskId || item.task_id || '').trim(),
    articleKey: String(item.articleKey || item.article_key || '').trim(),
    fileName: fileName || 'Файл',
    mimeType,
    size: Number.isFinite(Number(item.size || item.fileSize || item.file_size)) ? Math.max(0, Math.round(Number(item.size || item.fileSize || item.file_size))) : 0,
    bucket,
    objectPath,
    publicUrl,
    createdAt: String(item.createdAt || item.created_at || '').trim() || new Date().toISOString(),
    createdBy
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlMultiline(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

function safeUiMarkup(value) {
  return String(value ?? '');
}

function badge(text, kind = '') {
  return `<span class="chip ${kind}">${escapeHtml(text)}</span>`;
}

function scoreChip(score) {
  if (score >= 5) return badge(`Фокус ${score}`, 'danger');
  if (score >= 4) return badge(`Фокус ${score}`, 'warn');
  if (score >= 2) return badge(`Наблюдать ${score}`, 'info');
  return badge(`База ${score || 0}`);
}

function linkToSku(articleKey, label) {
  return `<button class="link-btn sku-pill" data-open-sku="${escapeHtml(articleKey)}">${escapeHtml(label || articleKey)}</button>`;
}

async function loadJson(path) {
  const requestVersion = String(window.__ALTEA_JSON_VERSION__ || '20260503d').trim() || '20260503d';
  const resolvedPath = path.includes("?") ? path : `${path}?v=${requestVersion}`;
  const response = await fetch(resolvedPath, { cache: "no-store" });
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    const sanitized = sanitizeLooseJson(text);
    if (sanitized === text) throw error;
    console.warn(`JSON sanitized for ${path}: invalid numeric tokens were replaced with null.`);
    registerDataWarning(`Файл ${path} был загружен с исправлениями из-за невалидных чисел.`);
    return JSON.parse(sanitized);
  }
}

function isLooseJsonTokenBoundary(char) {
  return char === undefined || /[\s,\]\[}{:]/.test(char);
}

function sanitizeLooseJson(text) {
  if (!text || typeof text !== 'string') return text;
  const replacements = [
    ['-Infinity', 'null'],
    ['Infinity', 'null'],
    ['NaN', 'null'],
    ['undefined', 'null']
  ];
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    let matched = false;
    for (const [token, replacement] of replacements) {
      if (
        text.startsWith(token, i) &&
        isLooseJsonTokenBoundary(text[i - 1]) &&
        isLooseJsonTokenBoundary(text[i + token.length])
      ) {
        result += replacement;
        i += token.length - 1;
        matched = true;
        break;
      }
    }
    if (!matched) result += char;
  }

  return result;
}

function cloneFallback(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function registerDataWarning(message) {
  if (!message) return;
  if (!Array.isArray(state.boot.dataWarnings)) state.boot.dataWarnings = [];
  if (!state.boot.dataWarnings.includes(message)) state.boot.dataWarnings.push(message);
}

function parsePriceFreshStamp(value) {
  if (!value) return 0;
  const stamp = Date.parse(String(value));
  return Number.isFinite(stamp) ? stamp : 0;
}

function latestPriceLayerSnapshot(layers = []) {
  return layers.reduce((best, layer) => {
    const stamp = parsePriceFreshStamp(layer?.generatedAt || layer?.updatedAt || layer?.updated_at || '');
    if (!stamp || stamp <= best.stamp) return best;
    return {
      stamp,
      source: layer?.source || '',
      generatedAt: layer?.generatedAt || layer?.updatedAt || layer?.updated_at || ''
    };
  }, { stamp: 0, source: '', generatedAt: '' });
}

function registerPriceFreshnessWarning(payloads = {}) {
  const freshest = latestPriceLayerSnapshot([
    { source: 'smart_price_workbench', generatedAt: payloads.smartPriceWorkbench?.generatedAt },
    { source: 'smart_price_overlay', generatedAt: payloads.smartPriceOverlay?.generatedAt },
    { source: 'tmp-smart_price_workbench-live', generatedAt: payloads.smartPriceWorkbenchLive?.generatedAt },
    { source: 'tmp-live-repricer', generatedAt: payloads.repricerLive?.generatedAt },
    { source: 'prices', generatedAt: payloads.prices?.generatedAt }
  ]);
  if (!freshest.stamp) {
    registerDataWarning('Ценовой контур не отдал дату обновления. Источник цен нужно проверить отдельно.');
    return;
  }
  const staleHours = (Date.now() - freshest.stamp) / 36e5;
  if (staleHours < 48) return;
  const asOf = new Date(freshest.stamp).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  registerDataWarning(`Ценовой контур устарел: последний срез ${asOf} из ${freshest.source}. Утренний price-sync нужно проверить.`);
}

async function loadJsonOrFallback(path, fallback, label = path) {
  const snapshotKey = snapshotKeyFromPath(path);
  if (snapshotKey) {
    const skipStagedFallback = new Set(['sku_aliases', 'sku_alias_ignore', 'sku_alias_audit', 'sku_matrix']);
    const stagedPath = String(path || '').startsWith('data/') && !skipStagedFallback.has(snapshotKey)
      ? `.altea-google-sheet-sync-output/${String(path).slice(5)}`
      : '';
    const [snapshotResult, localResult, stagedResult] = await Promise.allSettled([
      loadPortalSnapshotPayload(path),
      loadJson(path),
      stagedPath ? loadJson(stagedPath) : Promise.resolve(null)
    ]);
    if (snapshotResult.status === 'rejected') {
      console.warn(`[portal-snapshots] ${snapshotKey}`, snapshotResult.reason);
    }
    if (stagedResult.status === 'rejected') {
      console.warn(`[portal-staged] ${snapshotKey}`, stagedResult.reason);
    }
    const localPayload = localResult.status === 'fulfilled' ? localResult.value : null;
    const stagedPayload = stagedResult.status === 'fulfilled' ? stagedResult.value : null;
    const localOrStaged = chooseFreshestPayload(snapshotKey, localPayload, stagedPayload)?.payload
      || localPayload
      || stagedPayload
      || null;
    const chosen = chooseFreshestPayload(
      snapshotKey,
      snapshotResult.status === 'fulfilled' ? snapshotResult.value : null,
      localOrStaged
    );
    if (chosen) return chosen.payload;
    if (localResult.status === 'rejected') {
      console.error(localResult.reason);
      registerDataWarning(`${label}: ${localResult.reason?.message || 'Не удалось загрузить данные'}`);
    }
    return cloneFallback(fallback);
  }
  try {
    return await loadJson(path);
  } catch (error) {
    console.error(error);
    registerDataWarning(`${label}: ${error.message}`);
    return cloneFallback(fallback);
  }
}

const LAZY_DATA_LOADERS = {
  launches: async () => {
    const launches = await loadJsonOrFallback('data/launches.json', [], 'Продукт / новинки');
    state.launches = Array.isArray(launches) ? launches : [];
  },
  controlCenter: async () => {
    const [launches, productLeaderboard, oosControl, predictiveRisk, autoTaskSignals, predictiveRiskOutcomeAudit, controlAutoTaskSources, returnBaselineSkus] = await Promise.all([
      loadJsonOrFallback('data/launches.json', [], 'Продукт / новинки'),
      loadJsonOrFallback('data/product_leaderboard.json', { generatedAt: '', items: [], summary: {} }, 'Продуктовый лидерборд'),
      loadJsonOrFallback(
        'data/oos_control.json',
        { schema: 'portal-oos-control-v2', generatedAt: '', summary: {}, rows: [], history: { days: [] } },
        'OOS контроль'
      ),
      loadJsonOrFallback(
        'data/predictive_risk_snapshot.json',
        { schema: 'qharisma-predictive-risk-v1', generatedAt: '', summary: {}, risks: [], autoTaskSignals: [] },
        'Предиктивные риски'
      ),
      loadJsonOrFallback(
        'data/auto_task_signals.json',
        { schema: 'qharisma-auto-task-signals-v1', generatedAt: '', summary: {}, signals: [] },
        'Авто-сигналы задач'
      ),
      loadJsonOrFallback(
        'data/predictive_risk_outcome_audit.json',
        { schema: 'qharisma-predictive-risk-outcome-audit-v1', generatedAt: '', asOfDate: '', windowDays: 14, signalsCreated: 0, risksDetected: 0 },
        'Контроль исходов рисков'
      ),
      loadJsonOrFallback(
        'data/control_auto_task_sources.json',
        {
          schema: 'portal-control-auto-task-sources-v1',
          generatedAt: '',
          smartPriceOverlay: { generatedAt: '', platforms: {} },
          adsSummary: { generatedAt: '', asOfDate: '', itemSeries: [] }
        },
        'Источники авто-задач'
      ),
      loadJsonOrFallback('data/last_good/skus.json', [], 'Базовый срез SKU')
    ]);
    state.launches = Array.isArray(launches) ? launches : [];
    state.productLeaderboard = typeof normalizeProductLeaderboardPayload === 'function'
      ? normalizeProductLeaderboardPayload(productLeaderboard)
      : (productLeaderboard || { generatedAt: '', items: [], summary: {} });
    state.productLeaderboardHistory = Array.isArray(state.productLeaderboardHistory) ? state.productLeaderboardHistory : [];
    state.oosControl = oosControl && typeof oosControl === 'object'
      ? oosControl
      : { schema: 'portal-oos-control-v2', generatedAt: '', summary: {}, rows: [], history: { days: [] } };
    state.predictiveRisk = predictiveRisk && typeof predictiveRisk === 'object'
      ? predictiveRisk
      : { schema: 'qharisma-predictive-risk-v1', generatedAt: '', summary: {}, risks: [], autoTaskSignals: [] };
    state.autoTaskSignals = autoTaskSignals && typeof autoTaskSignals === 'object'
      ? autoTaskSignals
      : { schema: 'qharisma-auto-task-signals-v1', generatedAt: '', summary: {}, signals: [] };
    state.predictiveRiskOutcomeAudit = predictiveRiskOutcomeAudit && typeof predictiveRiskOutcomeAudit === 'object'
      ? predictiveRiskOutcomeAudit
      : { schema: 'qharisma-predictive-risk-outcome-audit-v1', generatedAt: '', asOfDate: '', windowDays: 14, signalsCreated: 0, risksDetected: 0 };
    state.smartPriceOverlay = controlAutoTaskSources?.smartPriceOverlay && typeof controlAutoTaskSources.smartPriceOverlay === 'object'
      ? controlAutoTaskSources.smartPriceOverlay
      : { generatedAt: '', platforms: {} };
    state.adsSummary = controlAutoTaskSources?.adsSummary && typeof controlAutoTaskSources.adsSummary === 'object'
      ? controlAutoTaskSources.adsSummary
      : { generatedAt: '', asOfDate: '', itemSeries: [] };
    const returnBaselineRows = Array.isArray(returnBaselineSkus)
      ? returnBaselineSkus
      : Array.isArray(returnBaselineSkus?.skus)
        ? returnBaselineSkus.skus
        : Array.isArray(returnBaselineSkus?.rows)
          ? returnBaselineSkus.rows
          : [];
    state.autoSignalBaselines = {
      skus: returnBaselineRows,
      generatedAt: returnBaselineSkus && typeof returnBaselineSkus === 'object' && !Array.isArray(returnBaselineSkus)
        ? String(returnBaselineSkus.generatedAt || returnBaselineSkus.asOfDate || '')
        : '',
      source: 'data/last_good/skus.json'
    };
    state.boot.lazyReady.launches = true;
    state.boot.lazyReady.productLeaderboard = true;
    state.boot.lazyReady.oosControl = true;
    state.boot.lazyReady.predictiveRisk = true;
  },
  adsFunnel: async () => {
    const [payload, smartPriceOverlay, summary] = await Promise.all([
      loadJsonOrFallback(
        'data/ads_summary.json',
        { generatedAt: '', asOfDate: '', note: '', platforms: [], itemSeries: [] },
        'Контроль РК'
      ),
      loadJsonOrFallback('data/smart_price_overlay.json', { generatedAt: '', platforms: {} }, 'Факт продаж по SKU'),
      loadJsonOrFallback(
        'data/iu_drr_summary.json',
        { generatedAt: '', asOfDate: '', months: [], daily: [], channels: [], diagnostics: {} },
        'Показатели площадок'
      )
    ]);
    state.adsSummary = payload && typeof payload === 'object'
      ? payload
      : { generatedAt: '', asOfDate: '', note: '', platforms: [], itemSeries: [] };
    state.smartPriceOverlay = smartPriceOverlay && typeof smartPriceOverlay === 'object'
      ? smartPriceOverlay
      : { generatedAt: '', platforms: {} };
    state.iuDrrSummary = summary && typeof summary === 'object'
      ? summary
      : { generatedAt: '', asOfDate: '', months: [], daily: [], channels: [], diagnostics: {} };
  },
  iuDrr: async () => {
    const [summary, adsPayload, wbFeedbacks, wbSubstitutionTraffic] = await Promise.all([
      loadJsonOrFallback(
        'data/iu_drr_summary.json',
        { generatedAt: '', asOfDate: '', months: [], daily: [], channels: [], diagnostics: {} },
        'Показатели площадок'
      ),
      loadJsonOrFallback(
        'data/ads_summary.json',
        { generatedAt: '', asOfDate: '', note: '', platforms: [], itemSeries: [] },
        'Контроль РК'
      ),
      loadJsonOrFallback(
        'data/wb_feedbacks_summary.json',
        { generatedAt: '', window: {}, summary: {}, cards: [], daily: [], history: [] },
        'WB отзывы и вопросы'
      ),
      loadJsonOrFallback(
        'data/wb_substitution_traffic.json',
        { schema: 'portal-wb-substitution-traffic-v1', generatedAt: '', asOfDate: '', summary: {}, articles: [], rows: [] },
        'WB подменные артикулы'
      )
    ]);
    state.iuDrrSummary = summary && typeof summary === 'object'
      ? summary
      : { generatedAt: '', asOfDate: '', months: [], daily: [], channels: [], diagnostics: {} };
    state.adsSummary = adsPayload && typeof adsPayload === 'object'
      ? adsPayload
      : { generatedAt: '', asOfDate: '', note: '', platforms: [], itemSeries: [] };
    state.wbFeedbacks = wbFeedbacks && typeof wbFeedbacks === 'object'
      ? wbFeedbacks
      : { generatedAt: '', window: {}, summary: {}, cards: [], daily: [], history: [] };
    state.wbSubstitutionTraffic = wbSubstitutionTraffic && typeof wbSubstitutionTraffic === 'object'
      ? wbSubstitutionTraffic
      : { schema: 'portal-wb-substitution-traffic-v1', generatedAt: '', asOfDate: '', summary: {}, articles: [], rows: [] };
  },
  oosControl: async () => {
    const [payload, orderProcurementWb, orderProcurementOzon] = await Promise.all([
      loadJsonOrFallback(
        'data/oos_control.json',
        { schema: 'portal-oos-control-v2', generatedAt: '', summary: {}, rows: [], history: { days: [] } },
        'OOS контроль'
      ),
      loadJsonOrFallback('data/order_procurement_wb.json', { generatedAt: '', rows: [] }, 'OOS кластеры WB'),
      loadJsonOrFallback('data/order_procurement_ozon.json', { generatedAt: '', rows: [] }, 'OOS кластеры Ozon')
    ]);
    state.oosControl = payload && typeof payload === 'object'
      ? payload
      : { schema: 'portal-oos-control-v2', generatedAt: '', summary: {}, rows: [], history: { days: [] } };
    state.orderProcurementWb = orderProcurementWb || { generatedAt: '', rows: [] };
    state.order_procurement_wb = state.orderProcurementWb;
    state.orderProcurementOzon = orderProcurementOzon || { generatedAt: '', rows: [] };
    state.order_procurement_ozon = state.orderProcurementOzon;
  },
  skuPlanFact: async () => {
    const [smartPriceWorkbench, smartPriceOverlay, priceWorkbenchSupport, prices, platformTrends, platformPlan, adsPayload, skuAliases, skuAliasIgnore, skuAliasAudit, wbOwnerDistributionAudit, wbSubstitutionTraffic] = await Promise.all([
      loadJsonOrFallback('data/smart_price_workbench.json', { generatedAt: '', platforms: {} }, 'Ценовой контур'),
      loadJsonOrFallback('data/smart_price_overlay.json', { generatedAt: '', platforms: {} }, 'Факт продаж по SKU'),
      loadJsonOrFallback('data/price_workbench_support.dashboard-compact.json', { generatedAt: '', platforms: {} }, 'План SKU'),
      loadJsonOrFallback('data/prices.json', { generatedAt: '', platforms: {} }, 'Цены'),
      loadJsonOrFallback('data/platform_trends.json', { generatedAt: '', platforms: [], extraMarketplace: { generatedAt: '', asOfDate: '', platforms: {} } }, 'Маркетплейсы'),
      loadJsonOrFallback('data/platform_plan.json', { generatedAt: '', months: {} }, 'План по площадкам'),
      loadJsonOrFallback(
        'data/ads_summary.json',
        { generatedAt: '', asOfDate: '', note: '', platforms: [], itemSeries: [] },
        'Рекламные расходы по SKU'
      ),
      loadJsonOrFallback(
        'data/sku_aliases.json',
        { schema: 'sku-api-aliases-v1', aliases: [] },
        'SKU aliases'
      ),
      loadJsonOrFallback(
        'data/sku_alias_ignore.json',
        { schema: 'sku-api-ignore-v1', ignored: [] },
        'Игнор API SKU'
      ),
      loadJsonOrFallback(
        'data/sku_alias_audit.json',
        { schema: 'sku-alias-audit-v1', events: [] },
        'SKU alias audit'
      ),
      loadJsonOrFallback(
        'data/wb_owner_distribution_audit.json',
        { schema: 'portal-wb-owner-distribution-audit-v1', summary: { ownerCounts: {} } },
        'WB owner distribution audit'
      ),
      loadJsonOrFallback(
        'data/wb_substitution_traffic.json',
        { schema: 'portal-wb-substitution-traffic-v1', generatedAt: '', asOfDate: '', summary: {}, articles: [], rows: [] },
        'WB подменные артикулы'
      )
    ]);
    state.smartPriceOverlay = smartPriceOverlay && typeof smartPriceOverlay === 'object'
      ? smartPriceOverlay
      : { generatedAt: '', platforms: {} };
    state.priceWorkbenchSupport = priceWorkbenchSupport && typeof priceWorkbenchSupport === 'object'
      ? priceWorkbenchSupport
      : { generatedAt: '', platforms: {} };
    state.prices = prices && typeof prices === 'object'
      ? prices
      : { generatedAt: '', platforms: {} };
    state.platformTrends = platformTrends && typeof platformTrends === 'object'
      ? platformTrends
      : { generatedAt: '', platforms: [], extraMarketplace: { generatedAt: '', asOfDate: '', platforms: {} } };
    state.platformPlan = platformPlan && typeof platformPlan === 'object'
      ? platformPlan
      : { generatedAt: '', months: {} };
    state.smartPriceWorkbenchBase = mergeSmartWorkbenchPayload(
      smartPriceWorkbench || { generatedAt: '', platforms: {} },
      state.smartPriceWorkbenchLive || null
    );
    state.smartPriceWorkbench = mergeSmartWorkbenchPriceOverlay(
      state.smartPriceWorkbenchBase,
      state.smartPriceOverlay || null
    );
    state.adsSummary = adsPayload && typeof adsPayload === 'object'
      ? adsPayload
      : { generatedAt: '', asOfDate: '', note: '', platforms: [], itemSeries: [] };
    state.skuAliases = skuAliases && typeof skuAliases === 'object'
      ? skuAliases
      : { schema: 'sku-api-aliases-v1', aliases: [] };
    state.skuAliasIgnore = skuAliasIgnore && typeof skuAliasIgnore === 'object'
      ? skuAliasIgnore
      : { schema: 'sku-api-ignore-v1', ignored: [] };
    state.skuAliasAudit = skuAliasAudit && typeof skuAliasAudit === 'object'
      ? skuAliasAudit
      : { schema: 'sku-alias-audit-v1', events: [] };
    state.wbOwnerDistributionAudit = wbOwnerDistributionAudit && typeof wbOwnerDistributionAudit === 'object'
      ? wbOwnerDistributionAudit
      : { schema: 'portal-wb-owner-distribution-audit-v1', summary: { ownerCounts: {} } };
    state.wbSubstitutionTraffic = wbSubstitutionTraffic && typeof wbSubstitutionTraffic === 'object'
      ? wbSubstitutionTraffic
      : { schema: 'portal-wb-substitution-traffic-v1', generatedAt: '', asOfDate: '', summary: {}, articles: [], rows: [] };
  },
  productLeaderboard: async () => {
    const loadLocalProductData = async (path, fallback, label) => {
      try {
        return await loadJson(path);
      } catch (error) {
        console.error(error);
        registerDataWarning(`${label}: ${error.message || 'Не удалось загрузить данные'}`);
        return cloneFallback(fallback);
      }
    };
    const [payload, history, wbSubstitutionTraffic, wbSubstitutionTrafficHistory, iuDrrSummary, adsSummary] = await Promise.all([
      Array.isArray(state.productLeaderboard?.items) && state.productLeaderboard.items.length
        ? Promise.resolve(state.productLeaderboard)
        : loadLocalProductData('data/product_leaderboard.json', { generatedAt: '', items: [], summary: {} }, 'Продуктовый лидерборд'),
      loadLocalProductData('data/product_leaderboard_history.json', [], 'История продуктового лидерборда'),
      loadLocalProductData(
        'data/wb_substitution_traffic.json',
        { schema: 'portal-wb-substitution-traffic-v1', generatedAt: '', asOfDate: '', summary: {}, articles: [], rows: [] },
        'WB подменные артикулы'
      ),
      loadLocalProductData(
        'data/wb_substitution_traffic_history.json',
        [],
        'История WB подменных артикулов'
      ),
      loadLocalProductData(
        'data/iu_drr_summary.json',
        { generatedAt: '', asOfDate: '', months: [], daily: [], channels: [], diagnostics: {} },
        'Показатели площадок'
      ),
      loadLocalProductData(
        'data/ads_summary.json',
        { generatedAt: '', asOfDate: '', note: '', platforms: [], itemSeries: [] },
        'Реклама МП'
      )
    ]);
    state.productLeaderboard = typeof normalizeProductLeaderboardPayload === 'function'
      ? normalizeProductLeaderboardPayload(payload)
      : (payload || { generatedAt: '', items: [], summary: {} });
    state.productLeaderboardHistory = Array.isArray(history) ? history : [];
    state.wbSubstitutionTraffic = wbSubstitutionTraffic && typeof wbSubstitutionTraffic === 'object'
      ? wbSubstitutionTraffic
      : { schema: 'portal-wb-substitution-traffic-v1', generatedAt: '', asOfDate: '', summary: {}, articles: [], rows: [] };
    state.wbSubstitutionTrafficHistory = Array.isArray(wbSubstitutionTrafficHistory) ? wbSubstitutionTrafficHistory : [];
    state.iuDrrSummary = iuDrrSummary && typeof iuDrrSummary === 'object'
      ? iuDrrSummary
      : { generatedAt: '', asOfDate: '', months: [], daily: [], channels: [], diagnostics: {} };
    state.adsSummary = adsSummary && typeof adsSummary === 'object'
      ? adsSummary
      : { generatedAt: '', asOfDate: '', note: '', platforms: [], itemSeries: [] };
  },
  meetings: async () => {
    const meetings = await loadJsonOrFallback('data/meetings.json', [], 'Ритм работы');
    state.meetings = Array.isArray(meetings) ? meetings : [];
  },
  documents: async () => {
    const documents = await loadJsonOrFallback('data/documents.json', { groups: [] }, 'Документы');
    state.documents = documents || { groups: [] };
  },
  repricer: async () => {
    const [repricer, smartPriceWorkbench, smartPriceWorkbenchLive, smartPriceOverlay, repricerLive, prices, priceWorkbenchSupport, orderProcurementWb, orderProcurementOzon, warehouseStockOverlay] = await Promise.all([
      loadJsonOrFallback('data/repricer.json', { generatedAt: '', summary: {}, rows: [] }, 'Репрайсер'),
      loadJsonOrFallback('data/smart_price_workbench.json', { generatedAt: '', platforms: {} }, 'Ценовой контур'),
      optionalLoadJson('tmp-smart_price_workbench-live.json'),
      loadJsonOrFallback('data/smart_price_overlay.json', { generatedAt: '', platforms: {} }, 'Overlay цен'),
      optionalLoadJson('tmp-live-repricer.json'),
      loadJsonOrFallback('data/prices.json', { generatedAt: '', platforms: {} }, 'Цены'),
      loadJsonOrFallback('data/price_workbench_support.json', { generatedAt: '', platforms: {} }, 'Поддержка ценового контура'),
      loadJsonOrFallback('data/order_procurement_wb.json', { generatedAt: '', rows: [] }, 'Отгрузки WB'),
      loadJsonOrFallback('data/order_procurement_ozon.json', { generatedAt: '', rows: [] }, 'Отгрузки Ozon'),
      loadJsonOrFallback('data/warehouse_stock_overlay.json', { generatedAt: '', rows: [] }, 'Склад/отгрузки')
    ]);
    state.repricer = repricer || { generatedAt: '', summary: {}, rows: [] };
    state.repricerLive = repricerLive || { generatedAt: '', rows: [] };
    state.prices = prices || { generatedAt: '', platforms: {} };
    state.priceWorkbenchSupport = priceWorkbenchSupport || { generatedAt: '', platforms: {} };
    state.smartPriceWorkbenchLive = smartPriceWorkbenchLive || { generatedAt: '', platforms: {} };
    state.smartPriceOverlay = smartPriceOverlay || { generatedAt: '', platforms: {} };
    state.orderProcurementWb = orderProcurementWb || { generatedAt: '', rows: [] };
    state.order_procurement_wb = state.orderProcurementWb;
    state.orderProcurementOzon = orderProcurementOzon || { generatedAt: '', rows: [] };
    state.order_procurement_ozon = state.orderProcurementOzon;
    state.warehouseStockOverlay = warehouseStockOverlay || { generatedAt: '', rows: [] };
    state.warehouse_stock_overlay = state.warehouseStockOverlay;
    state.smartPriceWorkbenchBase = mergeSmartWorkbenchPayload(
      smartPriceWorkbench || { generatedAt: '', platforms: {} },
      smartPriceWorkbenchLive || null
    );
    state.smartPriceWorkbench = mergeSmartWorkbenchPriceOverlay(
      state.smartPriceWorkbenchBase,
      smartPriceOverlay || null
    );
    registerPriceFreshnessWarning({
      smartPriceWorkbench: state.smartPriceWorkbench,
      smartPriceOverlay: state.smartPriceOverlay,
      smartPriceWorkbenchLive: state.smartPriceWorkbenchLive,
      repricerLive: state.repricerLive,
      prices: state.prices,
      priceWorkbenchSupport: state.priceWorkbenchSupport
    });
  }
};

function renderViewLoading(rootId, title) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = `
    <div class="card">
      <div class="head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <div class="muted small">Подгружаем данные только для этого раздела, чтобы портал открывался быстрее.</div>
        </div>
        ${badge('загрузка', 'info')}
      </div>
    </div>
  `;
}
