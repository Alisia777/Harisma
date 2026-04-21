const state = {
  dashboard: { cards: [], generatedAt: '' },
  skus: [],
  launches: [],
  meetings: [],
  documents: { groups: [] },
  repricer: { generatedAt: '', summary: {}, rows: [] },
  storage: { comments: [], tasks: [], decisions: [], ownerOverrides: [] },
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
    platform: 'all',
    horizon: 'all',
    source: 'all'
  },
  docFilters: {
    search: '',
    group: 'all'
  },
  repricerFilters: {
    search: '',
    platform: 'all',
    mode: 'changes'
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

const STORAGE_KEY = 'brand-portal-local-v1';
const ACTIVE_TASK_STATUSES = new Set(['new', 'in_progress', 'waiting_team', 'waiting_decision']);
const VIEW_TITLES = {
  dashboard: 'Дашборд',
  documents: 'Документы',
  repricer: 'Репрайсер',
  prices: 'Цены',
  order: 'Логистика и заказ',
  control: 'Задачи',
  skus: 'Реестр SKU',
  launches: 'Продукт / Ксения',
  'launch-control': 'Запуск новинок',
  meetings: 'Ритм работы',
  executive: 'Руководителю'
};
const VIEW_DATA_REQUIREMENTS = {
  launches: 'launches',
  'launch-control': 'launches',
  meetings: 'meetings',
  documents: 'documents',
  repricer: 'repricer'
};

const TASK_STATUS_META = {
  new: { label: 'Новая', kind: 'warn' },
  in_progress: { label: 'В работе', kind: 'info' },
  waiting_team: { label: 'Ждёт другого отдела', kind: 'warn' },
  waiting_decision: { label: 'Ждёт решения', kind: 'danger' },
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
  cross: {
    label: 'Общий контур',
    chip: 'Общий контур',
    description: 'Сквозные вопросы по owner, решениям и межплощадочным задачам.',
    kind: ''
  }
};

const CONTROL_WORKSTREAM_ORDER = ['ozon', 'wb', 'retail', 'cross'];
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
  'data/smart_price_workbench.json': 'smart_price_workbench'
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
  return { comments: [], tasks: [], decisions: [], ownerOverrides: [] };
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

function normalizeDecision(item = {}) {
  return {
    id: item.id || stableId('decision', `${item.articleKey || ''}|${item.title || ''}|${item.createdAt || ''}|${item.decision || ''}`),
    articleKey: item.articleKey || '',
    title: String(item.title || 'Решение').trim() || 'Решение',
    decision: String(item.decision || '').trim(),
    owner: String(item.owner || '').trim(),
    status: mapTaskStatus(item.status || 'waiting_decision'),
    due: item.due || '',
    createdAt: item.createdAt || new Date().toISOString(),
    createdBy: String(item.createdBy || state.team.member.name || 'Команда').trim() || 'Команда'
  };
}

function normalizeOwnerOverride(item = {}) {
  return {
    articleKey: item.articleKey || '',
    ownerName: String(item.ownerName || item.owner || '').trim(),
    ownerRole: String(item.ownerRole || '').trim(),
    note: String(item.note || '').trim(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    assignedBy: String(item.assignedBy || state.team.member.name || 'Команда').trim() || 'Команда'
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
  const resolvedPath = path.includes("?") ? path : `${path}?v=20260416b`;
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
  meetings: async () => {
    const meetings = await loadJsonOrFallback('data/meetings.json', [], 'Ритм работы');
    state.meetings = Array.isArray(meetings) ? meetings : [];
  },
  documents: async () => {
    const documents = await loadJsonOrFallback('data/documents.json', { groups: [] }, 'Документы');
    state.documents = documents || { groups: [] };
  },
  repricer: async () => {
    const repricer = await loadJsonOrFallback('data/repricer.json', { generatedAt: '', summary: {}, rows: [] }, 'Репрайсер');
    state.repricer = repricer || { generatedAt: '', summary: {}, rows: [] };
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
