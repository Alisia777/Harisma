const state = {
  dashboard: { cards: [], generatedAt: '' },
  skus: [],
  prices: { generatedAt: '', platforms: {} },
  smartPriceWorkbench: { generatedAt: '', platforms: {} },
  smartPriceWorkbenchBase: { generatedAt: '', platforms: {} },
  smartPriceWorkbenchLive: { generatedAt: '', platforms: {} },
  smartPriceOverlay: { generatedAt: '', platforms: {} },
  priceWorkbenchSupport: { generatedAt: '', platforms: {} },
  productLeaderboard: { generatedAt: '', items: [], summary: {} },
  productLeaderboardHistory: [],
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
    repricerSettings: {},
    repricerSettingsUpdatedAt: '',
    repricerOverrides: [],
    repricerSkuProfiles: [],
    repricerCorridors: [],
    repricerOverrideDeletes: [],
    repricerSkuProfileDeletes: [],
    repricerCorridorDeletes: []
  },
  filters: {
    search: '',
    segment: 'all',
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
    sort: 'buys',
    category: 'all',
    snapshot: 'latest'
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
      launches: false,
      productLeaderboard: false,
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

const STORAGE_KEY = 'brand-portal-local-v1';
const ACTIVE_TASK_STATUSES = new Set(['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision']);
const VIEW_TITLES = {
  dashboard: 'Дашборд',
  documents: 'Документы',
  repricer: 'Репрайсер',
  'ads-funnel': 'Рекламная воронка',
  prices: 'Цены',
  order: 'Заказ товара',
  control: 'Задачи',
  skus: 'Реестр СКЮ',
  launches: 'Продукт / Ксения',
  'product-leaderboard': 'Продуктовый лидерборд',
  'launch-control': 'Запуск новинок',
  meetings: 'Ритм работы',
  executive: 'Руководителю'
};
const VIEW_DATA_REQUIREMENTS = {
  control: 'launches',
  launches: 'launches',
  'ads-funnel': 'productLeaderboard',
  'product-leaderboard': 'productLeaderboard',
  'launch-control': 'launches',
  executive: 'launches',
  meetings: 'meetings',
  documents: 'documents',
  repricer: 'repricer'
};
const DISABLED_VIEWS = new Set(['meetings']);
const VIEW_REDIRECTS = {
  meetings: 'dashboard'
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
  retail: {
    label: 'ЯМ / Летуаль / Магнит / ЗЯ',
    chip: 'ЯМ / сети',
    description: 'Яндекс Маркет, Летуаль, Магнит и Золотое Яблоко одним РОПом.',
    kind: 'ok'
  },
  product: {
    label: 'Продукт / новинки',
    chip: 'Продукт',
    description: 'Календарь новинок, продуктовая проработка и запуск карточек.',
    kind: 'info'
  },
  executive: {
    label: 'Руководитель / директор',
    chip: 'Директор',
    description: 'Согласования, эскалации и задачи продукт-директора.',
    kind: 'danger'
  },
  cross: {
    label: 'Общий контур',
    chip: 'Общий контур',
    description: 'Сквозные вопросы по owner, решениям и межплощадочным задачам.',
    kind: ''
  }
};

const CONTROL_WORKSTREAM_ORDER = ['cross', 'wb', 'ozon', 'retail', 'product', 'executive'];
const CONTROL_WORKSTREAM_FILTER_ORDER = ['all', ...CONTROL_WORKSTREAM_ORDER];

const DEFAULT_APP_CONFIG = {
  brand: 'Алтея',
  teamMode: 'local',
  teamMember: { name: '', role: 'Команда' },
  supabase: { url: '', anonKey: '', auth: 'anonymous' }
};


const RUNTIME_SUPABASE_FALLBACK = {
  brand: 'Алтея',
  teamMode: 'supabase',
  teamMember: { name: '', role: 'Команда' },
  supabase: {
    url: 'https://iyckwryrucqrxwlowxow.supabase.co',
    anonKey: 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw',
    auth: 'anonymous'
  }
};

function isLocalHost() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

const TEAM_TABLES = {
  tasks: 'portal_tasks',
  comments: 'portal_comments',
  decisions: 'portal_decisions',
  owners: 'portal_owner_assignments'
};

const PORTAL_SNAPSHOT_TABLE = 'portal_data_snapshots';
const PORTAL_SNAPSHOT_PATH_MAP = {
  'data/dashboard.json': 'dashboard',
  'data/skus.json': 'skus',
  'data/platform_trends.json': 'platform_trends',
  'data/logistics.json': 'logistics',
  'data/ads_summary.json': 'ads_summary',
  'data/platform_plan.json': 'platform_plan',
  'data/prices.json': 'prices',
  'data/smart_price_workbench.json': 'smart_price_workbench',
  'data/smart_price_overlay.json': 'smart_price_overlay',
  'data/product_leaderboard.json': 'product_leaderboard',
  'data/product_leaderboard_history.json': 'product_leaderboard_history'
};
const portalSnapshotState = {
  client: null,
  promise: null,
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
  const merged = {
    ...DEFAULT_APP_CONFIG,
    ...raw,
    teamMember: { ...DEFAULT_APP_CONFIG.teamMember, ...(raw.teamMember || {}) },
    supabase: { ...DEFAULT_APP_CONFIG.supabase, ...(raw.supabase || {}) }
  };
  const missingRemote = merged.teamMode !== 'supabase' || !merged.supabase?.url || !merged.supabase?.anonKey;
  if (missingRemote && !isLocalHost()) {
    return {
      ...merged,
      ...RUNTIME_SUPABASE_FALLBACK,
      teamMember: { ...RUNTIME_SUPABASE_FALLBACK.teamMember, ...(merged.teamMember || {}) }
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

  return score;
}

function chooseFreshestPayload(snapshotKey, snapshotPayload, localPayload) {
  const snapshotReady = snapshotPayloadLooksUsable(snapshotKey, snapshotPayload) ? snapshotPayload : null;
  const localReady = localPayload !== null && localPayload !== undefined ? localPayload : null;
  if (snapshotReady && localReady) {
    return payloadFreshnessScore(snapshotKey, localReady) >= payloadFreshnessScore(snapshotKey, snapshotReady)
      ? { payload: localReady, source: 'local' }
      : { payload: snapshotReady, source: 'snapshot' };
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

  for (let index = nextSeries.length - 1; index >= 0; index -= 1) {
    const currentDate = String(nextSeries[index]?.date || '').trim();
    if (currentDate && currentDate > valueDate) nextSeries.splice(index, 1);
  }

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
  if (snapshotKey === 'platform_plan') return typeof payload?.months === 'object' && payload.months !== null && Object.keys(payload.months).length > 0;
  if (snapshotKey === 'smart_price_workbench') {
    return typeof payload?.platforms === 'object' && payload.platforms !== null && Object.keys(payload.platforms).length > 0;
  }
  if (snapshotKey === 'prices') {
    return Array.isArray(payload?.dates) && payload.dates.length > 0
      && typeof payload?.platforms === 'object' && payload.platforms !== null
      && Object.keys(payload.platforms).length > 0;
  }
  if (snapshotKey === 'product_leaderboard') {
    return Array.isArray(payload?.items) && payload.items.length > 0;
  }
  if (snapshotKey === 'product_leaderboard_history') {
    return Array.isArray(payload) && payload.length > 0;
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
  portalSnapshotState.rows = {};
  portalSnapshotState.brand = '';
}

function getPortalSnapshotRequestConfig() {
  const cfg = currentConfig();
  if (!cfg.supabase?.url || !cfg.supabase?.anonKey || typeof fetch !== 'function') return null;
  if (state.team?.mode === 'pending') return null;
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
      Authorization: `Bearer ${cfg.supabase.anonKey}`,
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

function decodeChunkedPortalSnapshots(data) {
  const rows = {};
  const chunkGroups = new Map();

  for (const row of data || []) {
    const snapshotKey = String(row?.snapshot_key || '').trim();
    if (!snapshotKey) continue;
    const chunkMeta = parseChunkedSnapshotKey(snapshotKey);
    if (!chunkMeta) {
      rows[snapshotKey] = row?.payload;
      continue;
    }
    if (!chunkGroups.has(chunkMeta.baseKey)) chunkGroups.set(chunkMeta.baseKey, []);
    chunkGroups.get(chunkMeta.baseKey).push({
      index: chunkMeta.index,
      payload: row?.payload
    });
  }

  for (const [baseKey, parts] of chunkGroups.entries()) {
    const meta = rows[baseKey];
    if (meta && meta.chunked !== true) continue;
    const expectedCount = Number(meta?.chunk_count || meta?.chunkCount || 0);
    const chunkCount = expectedCount > 0 ? expectedCount : parts.length;
    const ordered = parts
      .filter((part) => part.index >= 1 && part.index <= chunkCount)
      .sort((left, right) => left.index - right.index);
    if (!ordered.length || ordered.length !== chunkCount) continue;
    const text = ordered
      .map((part) => {
        if (typeof part.payload === 'string') return part.payload;
        if (typeof part.payload?.data === 'string') return part.payload.data;
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
    5000,
    'Загрузка витрины из Supabase'
  )
    .then((response) => {
      if (!response?.ok) throw new Error(`Supabase snapshots ${response?.status || 'request failed'}`);
      return withTimeout(response.json(), 5000, 'Чтение витрины из Supabase');
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

async function loadPortalSnapshotPayload(path) {
  const snapshotKey = snapshotKeyFromPath(path);
  if (!snapshotKey) return null;
  const rows = await loadPortalSnapshotRows();
  const payload = rows[snapshotKey];
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
    launchOverrides: [],
    launchDeletedIds: [],
    repricerSettings: defaultRepricerSettings(),
    repricerSettingsUpdatedAt: '',
    repricerOverrides: [],
    repricerSkuProfiles: [],
    repricerCorridors: [],
    repricerOverrideDeletes: [],
    repricerSkuProfileDeletes: [],
    repricerCorridorDeletes: []
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
      minMarginPct: 15,
      defaultTargetDays: 30,
      launchTargetDays: 45,
      oosDays: 5,
      alignmentEnabled: true,
      deadbandPct: 3,
      deadbandRub: 50
    },
    brandRules: {
      'Алтея': { defaultTargetDays: 30, launchTargetDays: 45, oosDays: 5, minMarginPct: 15, alignmentEnabled: true },
      CPA: { defaultTargetDays: 30, launchTargetDays: 45, oosDays: 5, minMarginPct: 15, alignmentEnabled: true }
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
  if (['freeze', 'hold', 'force'].includes(raw)) return raw;
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

const OWNER_CANONICAL_NAMES = new Map([
  ['алексей', 'Алексей'],
  ['александр', 'Александр Озон'],
  ['анна', 'Анна'],
  ['артем', 'Александр Озон'],
  ['артём', 'Александр Озон'],
  ['дарья', 'Даша'],
  ['даша', 'Даша'],
  ['екатерина', 'Екатерина'],
  ['кирилл', 'Кирилл'],
  ['ксения', 'Ксения'],
  ['мария', 'Мария'],
  ['олеся', 'Олеся'],
  ['светлана', 'Светлана']
]);

const OWNER_NAME_ALIASES = new Map([
  ['александр озон', 'Александр Озон'],
  ['анна пирогова', 'Анна'],
  ['екатерина доброжирова', 'Екатерина'],
  ['екатерина доможирова', 'Екатерина'],
  ['мария васильева', 'Мария'],
  ['мария васильевна', 'Мария'],
  ['олеся савинова', 'Олеся']
]);

function normalizeOwnerToken(value = '') {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalOwnerName(value = '') {
  const normalized = normalizeOwnerToken(value);
  if (!normalized) return '';

  const lowered = normalized.toLowerCase();
  if (EMPTY_OWNER_NAMES.has(lowered)) return '';
  if (OWNER_NAME_ALIASES.has(lowered)) return OWNER_NAME_ALIASES.get(lowered);
  if (OWNER_CANONICAL_NAMES.has(lowered)) return OWNER_CANONICAL_NAMES.get(lowered);

  const [firstToken = ''] = normalized.split(' ');
  const firstTokenLowered = firstToken.toLowerCase();
  if (OWNER_CANONICAL_NAMES.has(firstTokenLowered)) return OWNER_CANONICAL_NAMES.get(firstTokenLowered);

  return normalized;
}

function normalizeOwnerPlatformKey(platform = '') {
  const normalized = String(platform || '').trim().toLowerCase();
  if (normalized === 'ya' || normalized === 'yandex' || normalized === 'yandex_market' || normalized === 'market') return 'ym';
  return normalized;
}

function platformOwnerName(sku, platform = '') {
  const key = normalizeOwnerPlatformKey(platform);
  if (!sku || !key) return '';

  const sources = [
    sku?.ownersByPlatform,
    sku?.owner?.byPlatform
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
  return {
    articleKey: item.articleKey || '',
    ownerName: canonicalOwnerName(item.ownerName || item.owner || ''),
    ownerRole: String(item.ownerRole || '').trim(),
    note: String(item.note || '').trim(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    assignedBy: String(item.assignedBy || state.team.member.name || 'Команда').trim() || 'Команда'
  };
}

const CP1251_EXTENDED_CHARS =
  '\u0402\u0403\u201a\u0453\u201e\u2026\u2020\u2021\u20ac\u2030\u0409\u2039\u040a\u040c\u040b\u040f'
  + '\u0452\u2018\u2019\u201c\u201d\u2022\u2013\u2014\ufffd\u2122\u0459\u203a\u045a\u045c\u045b\u045f'
  + '\u00a0\u040e\u045e\u0408\u00a4\u0490\u00a6\u00a7\u0401\u00a9\u0404\u00ab\u00ac\u00ad\u00ae\u0407'
  + '\u00b0\u00b1\u0406\u0456\u0491\u00b5\u00b6\u00b7\u0451\u2116\u0454\u00bb\u0458\u0405\u0455\u0457'
  + '\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f'
  + '\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f'
  + '\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f'
  + '\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f';

function countMojibakeMarkers(value) {
  let count = 0;
  for (const char of String(value || '')) {
    const code = char.charCodeAt(0);
    if ((code >= 0x402 && code <= 0x40F) || (code >= 0x452 && code <= 0x45F)) count += 1;
  }
  return count;
}

function countRussianLetters(value) {
  let count = 0;
  for (const char of String(value || '')) {
    const code = char.charCodeAt(0);
    if (code === 0x401 || code === 0x451 || (code >= 0x410 && code <= 0x44F)) count += 1;
  }
  return count;
}

function encodeCp1251Bytes(value) {
  const bytes = [];
  for (const char of String(value || '')) {
    const code = char.charCodeAt(0);
    if (code <= 0x7F) {
      bytes.push(code);
      continue;
    }
    const index = CP1251_EXTENDED_CHARS.indexOf(char);
    if (index === -1) return null;
    bytes.push(index + 0x80);
  }
  return bytes;
}

function repairBrokenUtf8Cp1251String(value) {
  if (typeof value !== 'string' || !value) return String(value ?? '');
  try {
    const bytes = encodeCp1251Bytes(value);
    if (!bytes) return value;
    const repaired = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    if (!repaired || repaired === value) return value;

    const markerBefore = countMojibakeMarkers(value);
    const markerAfter = countMojibakeMarkers(repaired);
    const russianBefore = countRussianLetters(value);
    const russianAfter = countRussianLetters(repaired);
    if (markerAfter < markerBefore || (markerBefore > 0 && russianAfter >= russianBefore - markerBefore)) {
      return repaired;
    }
  } catch {
    return value;
  }
  return value;
}

window.repairBrokenUtf8Cp1251String = repairBrokenUtf8Cp1251String;

function escapeHtml(value) {
  const safeValue = repairBrokenUtf8Cp1251String(String(value ?? ''));
  return safeValue
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
    const [snapshotResult, localResult] = await Promise.allSettled([
      loadPortalSnapshotPayload(path),
      loadJson(path)
    ]);
    if (snapshotResult.status === 'rejected') {
      console.warn(`[portal-snapshots] ${snapshotKey}`, snapshotResult.reason);
    }
    const chosen = chooseFreshestPayload(
      snapshotKey,
      snapshotResult.status === 'fulfilled' ? snapshotResult.value : null,
      localResult.status === 'fulfilled' ? localResult.value : null
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
    const launches = await loadJsonOrFallback('data/launches.json', [], 'Продукт / Ксения');
    state.launches = Array.isArray(launches) ? launches : [];
  },
  productLeaderboard: async () => {
    const [payload, history] = await Promise.all([
      loadJsonOrFallback('data/product_leaderboard.json', { generatedAt: '', items: [], summary: {} }, 'Продуктовый лидерборд'),
      loadJsonOrFallback('data/product_leaderboard_history.json', [], 'История продуктового лидерборда')
    ]);
    state.productLeaderboard = typeof normalizeProductLeaderboardPayload === 'function'
      ? normalizeProductLeaderboardPayload(payload)
      : (payload || { generatedAt: '', items: [], summary: {} });
    state.productLeaderboardHistory = Array.isArray(history) ? history : [];
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
    const [repricer, smartPriceWorkbench, smartPriceWorkbenchLive, smartPriceOverlay, repricerLive, prices, priceWorkbenchSupport] = await Promise.all([
      loadJsonOrFallback('data/repricer.json', { generatedAt: '', summary: {}, rows: [] }, 'Репрайсер'),
      loadJsonOrFallback('data/smart_price_workbench.json', { generatedAt: '', platforms: {} }, 'Ценовой контур'),
      optionalLoadJson('tmp-smart_price_workbench-live.json'),
      loadJsonOrFallback('data/smart_price_overlay.json', { generatedAt: '', platforms: {} }, 'Overlay цен'),
      optionalLoadJson('tmp-live-repricer.json'),
      loadJsonOrFallback('data/prices.json', { generatedAt: '', platforms: {} }, 'Цены'),
      loadJsonOrFallback('data/price_workbench_support.json', { generatedAt: '', platforms: {} }, 'Поддержка ценового контура')
    ]);
    state.repricer = repricer || { generatedAt: '', summary: {}, rows: [] };
    state.repricerLive = repricerLive || { generatedAt: '', rows: [] };
    state.prices = prices || { generatedAt: '', platforms: {} };
    state.priceWorkbenchSupport = priceWorkbenchSupport || { generatedAt: '', platforms: {} };
    state.smartPriceWorkbenchLive = smartPriceWorkbenchLive || { generatedAt: '', platforms: {} };
    state.smartPriceOverlay = smartPriceOverlay || { generatedAt: '', platforms: {} };
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
