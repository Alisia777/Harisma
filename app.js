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
const ACTIVE_TASK_STATUSES = new Set(['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision']);
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
  waiting_rop: { label: 'На согласовании у РОПа', kind: 'warn' },
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

async function ensureViewData(view) {
  const key = VIEW_DATA_REQUIREMENTS[view];
  if (!key) return;
  if (state.boot.lazyReady?.[key]) return;
  if (state.boot.lazyLoads?.[key]) return state.boot.lazyLoads[key];

  const loader = LAZY_DATA_LOADERS[key];
  if (!loader) return;

  const pending = Promise.resolve()
    .then(() => loader())
    .then(() => {
      state.boot.lazyReady[key] = true;
    })
    .finally(() => {
      delete state.boot.lazyLoads[key];
    });

  state.boot.lazyLoads[key] = pending;
  return pending;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} превысил ${Math.round(ms / 1000)} сек.`)), ms);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function uid(prefix = 'item') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function loadLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStorage();
    const parsed = JSON.parse(raw);
    return {
      comments: Array.isArray(parsed.comments) ? parsed.comments.map(normalizeComment) : [],
      tasks: Array.isArray(parsed.tasks) ? normalizeStorageTasks(parsed.tasks, 'manual') : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizeDecision) : [],
      ownerOverrides: Array.isArray(parsed.ownerOverrides) ? parsed.ownerOverrides.map(normalizeOwnerOverride) : []
    };
  } catch {
    return defaultStorage();
  }
}

function saveLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.storage));
}

function teamMemberLabel() {
  const member = state.team.member || {};
  if (!member.name) return member.role || 'Команда';
  return `${member.name}${member.role ? ` · ${member.role}` : ''}`;
}

function prepareSkuBaseState() {
  for (const sku of state.skus) {
    if (!sku.__baseOwner) sku.__baseOwner = JSON.parse(JSON.stringify(sku.owner || {}));
  }
}

function applyOwnerOverridesToSkus() {
  prepareSkuBaseState();
  const overrideMap = new Map((state.storage.ownerOverrides || []).map((item) => [item.articleKey, item]));
  for (const sku of state.skus) {
    const baseOwner = JSON.parse(JSON.stringify(sku.__baseOwner || {}));
    const override = overrideMap.get(sku.articleKey);
    if (override) {
      sku.owner = {
        ...baseOwner,
        name: override.ownerName || '',
        source: override.ownerName ? 'Командное закрепление' : (baseOwner.source || ''),
        registryStatus: override.ownerRole || baseOwner.registryStatus || ''
      };
      sku.flags = sku.flags || {};
      sku.flags.assigned = Boolean(override.ownerName);
    } else {
      sku.owner = baseOwner;
      sku.flags = sku.flags || {};
      sku.flags.assigned = Boolean(baseOwner?.name);
    }
  }
}

function getSku(articleKey) {
  return state.skus.find((sku) => sku.articleKey === articleKey || sku.article === articleKey) || null;
}

function ownerName(sku) {
  return sku?.owner?.name || '';
}

function ownerOptions() {
  const pool = new Set();
  for (const sku of state.skus) if (ownerName(sku)) pool.add(ownerName(sku));
  for (const item of state.storage.ownerOverrides || []) if (item.ownerName) pool.add(item.ownerName);
  for (const task of state.storage.tasks || []) if (task.owner) pool.add(task.owner);
  if (state.team.member?.name) pool.add(state.team.member.name);
  return [...pool].sort((a, b) => a.localeCompare(b, 'ru'));
}

function ownerCell(sku) {
  const owner = ownerName(sku);
  if (!owner) return `<div class="owner-cell"><strong>Не закреплён</strong><div class="muted small">Нужно назначить owner</div></div>`;
  return `<div class="owner-cell"><strong>${escapeHtml(owner)}</strong><div class="muted small">${escapeHtml(skuOperationalStatusMeta(sku).label || '—')}</div></div>`;
}

function trafficBadges(sku, emptyLabel = 'нет') {
  const chips = [];
  if (sku?.traffic?.kz) chips.push('<span class="chip info">🚀 КЗ</span>');
  if (sku?.traffic?.vk) chips.push('<span class="chip info">📣 VK</span>');
  return chips.length ? `<div class="badge-stack traffic-inline">${chips.join('')}</div>` : `<span class="muted small">${escapeHtml(emptyLabel)}</span>`;
}

function parseTaskLogComment(comment) {
  const match = String(comment?.text || '').match(/^\[\[task:([^\]]+)\]\]\s*\[\[kind:([^\]]+)\]\]\s*/i);
  if (!match) return null;
  return {
    taskId: match[1],
    kind: match[2],
    text: String(comment?.text || '').replace(match[0], '').trim()
  };
}

function getTaskHistory(taskId) {
  return (state.storage.comments || [])
    .map((comment) => {
      const parsed = parseTaskLogComment(comment);
      return parsed && parsed.taskId === taskId ? { ...comment, kind: parsed.kind, text: parsed.text } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getRecentTaskHistory(tasks, limit = 6) {
  const taskIds = new Set((tasks || []).map((task) => task.id).filter(Boolean));
  return (state.storage.comments || [])
    .map((comment) => {
      const parsed = parseTaskLogComment(comment);
      return parsed && taskIds.has(parsed.taskId) ? { ...comment, taskId: parsed.taskId, kind: parsed.kind, text: parsed.text } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

function getSkuComments(articleKey) {
  return (state.storage.comments || [])
    .filter((comment) => comment.articleKey === articleKey && !parseTaskLogComment(comment))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getSkuDecisions(articleKey) {
  return (state.storage.decisions || [])
    .filter((decision) => decision.articleKey === articleKey)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function mergeSeedStorage(seed) {
  const existingComments = new Set((state.storage.comments || []).map((item) => `${item.articleKey}|${item.author}|${item.createdAt}|${item.text}`));
  const existingTasks = new Set((state.storage.tasks || []).map((item) => `${item.articleKey}|${item.owner}|${item.due}|${item.title}`));

  for (const rawComment of seed.comments || []) {
    const comment = normalizeComment(rawComment);
    const key = `${comment.articleKey}|${comment.author}|${comment.createdAt}|${comment.text}`;
    if (!existingComments.has(key)) state.storage.comments.push(comment);
  }
  for (const task of seed.tasks || []) {
    const normalized = normalizeTask(task, 'seed');
    const key = `${normalized.articleKey}|${normalized.owner}|${normalized.due}|${normalized.title}`;
    if (!existingTasks.has(key)) state.storage.tasks.push(normalized);
  }
  saveLocalStorage();
}

function mergeImportedStorage(imported) {
  const seed = {
    comments: Array.isArray(imported.comments) ? imported.comments : [],
    tasks: Array.isArray(imported.tasks) ? imported.tasks : [],
    decisions: Array.isArray(imported.decisions) ? imported.decisions : [],
    ownerOverrides: Array.isArray(imported.ownerOverrides) ? imported.ownerOverrides : []
  };
  mergeSeedStorage(seed);
  for (const raw of seed.decisions) {
    const decision = normalizeDecision(raw);
    if (!state.storage.decisions.some((item) => item.id === decision.id)) state.storage.decisions.unshift(decision);
  }
  for (const raw of seed.ownerOverrides) {
    const override = normalizeOwnerOverride(raw);
    state.storage.ownerOverrides = (state.storage.ownerOverrides || []).filter((item) => item.articleKey !== override.articleKey);
    state.storage.ownerOverrides.unshift(override);
  }
  applyOwnerOverridesToSkus();
  saveLocalStorage();
}

function marginBadge(label, value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return badge(`${label} —`);
  return badge(`${label} ${fmt.pct(value)}`, Number(value) < 0 ? 'danger' : 'ok');
}
function currentWorkLabel() {
  if (state.filters.market === 'wb') return 'В работу WB = план < 80% + маржа WB < 0';
  if (state.filters.market === 'ozon') return 'В работу Ozon = план < 80% + маржа Ozon < 0';
  return 'В работу = план < 80% + отрицательная маржа';
}

function priorityBadges(sku) {
  const parts = [];
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) parts.push('<span class="chip danger">В работу WB/Ozon</span>');
  else if (sku?.flags?.toWorkWB) parts.push('<span class="chip danger">В работу WB</span>');
  else if (sku?.flags?.toWorkOzon) parts.push('<span class="chip danger">В работу Ozon</span>');
  else if (sku?.flags?.toWork) parts.push('<span class="chip danger">В работу</span>');
  if (sku?.flags?.wbNegativeMargin) parts.push('<span class="chip danger">WB маржа < 0</span>');
  if (sku?.flags?.ozonNegativeMargin) parts.push('<span class="chip danger">Ozon маржа < 0</span>');
  if (!sku?.flags?.assigned) parts.push('<span class="chip warn">Без owner</span>');
  if (sku?.flags?.hasKZ) parts.push('<span class="chip info">🚀 КЗ</span>');
  if (sku?.flags?.hasVK) parts.push('<span class="chip info">📣 VK</span>');
  parts.push(scoreChip(sku?.focusScore || 0));
  return `<div class="badge-stack">${parts.join('')}</div>`;
}

function commentTypeChip(type) {
  const map = { signal: 'info', risk: 'danger', focus: 'warn', idea: 'ok' };
  return badge(type || 'comment', map[type] || '');
}

function mapTaskStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (['open', 'new'].includes(raw)) return 'new';
  if (['in_progress', 'in progress', 'progress', 'doing', 'work', 'в работе'].includes(raw)) return 'in_progress';
  if (['waiting_team', 'waiting-team', 'wait_team'].includes(raw)) return 'waiting_team';
  if (['waiting_rop', 'rop_approval', 'waiting_approval', 'approval_rop', 'on_rop_approval'].includes(raw)) return 'waiting_rop';
  if (['blocked', 'waiting_decision', 'wait_decision', 'decision', 'waiting', 'ждёт', 'ждет'].includes(raw)) return 'waiting_decision';
  if (['done', 'complete', 'completed', 'сделано'].includes(raw)) return 'done';
  if (['cancelled', 'canceled', 'отменено'].includes(raw)) return 'cancelled';
  return 'new';
}

function inferTaskType(text = '') {
  const raw = String(text || '').toLowerCase();
  if (/марж|цен|min price|unit|убыт|цена/.test(raw)) return 'price_margin';
  if (/контент|карточ|фото|тз|креатив|описан/.test(raw)) return 'content';
  if (/трафик|кз|vk|вк|инфлю|реклама|рк|smm/.test(raw)) return 'traffic';
  if (/остат|постав|склад|supply|oos|логист/.test(raw)) return 'supply';
  if (/возврат|отзыв|рейтинг/.test(raw)) return 'returns';
  if (/owner|закреп|назнач/.test(raw)) return 'assignment';
  if (/новин|launch|gate|бриф/.test(raw)) return 'launch';
  return 'general';
}

function normalizeTaskPlatform(value, contextText = '') {
  const raw = String(value || '').trim().toLowerCase();
  const text = `${raw} ${String(contextText || '').trim().toLowerCase()}`;

  if (raw === 'all') return 'all';
  if (['cross', 'common', 'shared', 'general'].includes(raw)) return 'cross';
  if (['wb', 'wildberries', 'вб'].includes(raw)) return 'wb';
  if (['ozon', 'озон'].includes(raw)) return 'ozon';
  if (['wb+ozon', 'wb + ozon', 'wb_ozon', 'wb-ozon'].includes(raw)) return 'wb+ozon';
  if (['retail', 'federal', 'network', 'marketplaces_plus', 'marketplace_plus'].includes(raw)) return 'retail';

  if (/яндекс|я[.\s-]?маркет|yandex|letu?al|л[еэ]туал|л[еэ]туаль|магнит|golden apple|золот[а-я\s-]*яблок/.test(text)) return 'retail';
  if (/(^|\W)wb($|\W)|wildberries|вб/.test(text)) return 'wb';
  if (/ozon|озон/.test(text)) return 'ozon';
  return 'all';
}

function normalizeControlWorkstreamFilter(value) {
  const raw = String(value || 'all').trim().toLowerCase();
  if (raw === 'all') return 'all';
  const normalized = normalizeTaskPlatform(raw);
  if (normalized === 'wb+ozon') return 'cross';
  return CONTROL_WORKSTREAM_ORDER.includes(normalized) ? normalized : 'all';
}

function controlWorkstreamMeta(key) {
  return CONTROL_WORKSTREAM_META[key] || CONTROL_WORKSTREAM_META.cross;
}

function controlWorkstreamKey(task, sku = null) {
  const text = `${task?.title || ''} ${task?.nextAction || ''} ${task?.reason || ''} ${task?.entityLabel || ''}`;
  const platform = normalizeTaskPlatform(task?.platform, text);

  if (platform === 'wb') return 'wb';
  if (platform === 'ozon') return 'ozon';
  if (platform === 'retail') return 'retail';
  if (platform === 'wb+ozon' || platform === 'cross' || platform === 'all') return 'cross';

  if (sku?.flags?.toWorkWB && !sku?.flags?.toWorkOzon) return 'wb';
  if (sku?.flags?.toWorkOzon && !sku?.flags?.toWorkWB) return 'ozon';
  return 'cross';
}

function detectTaskPlatform(task, sku) {
  const text = `${task?.title || ''} ${task?.nextAction || ''} ${task?.reason || ''}`.toLowerCase();
  if (task?.platform) return normalizeTaskPlatform(task.platform, text);
  if (/яндекс|я[.\s-]?маркет|yandex|letu?al|л[еэ]туал|л[еэ]туаль|магнит|golden apple|золот[а-я\s-]*яблок/.test(text)) return 'retail';
  if (text.includes('wb') && text.includes('ozon')) return 'wb+ozon';
  if (text.includes('wb')) return 'wb';
  if (text.includes('ozon')) return 'ozon';
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) return 'wb+ozon';
  if (sku?.flags?.toWorkWB) return 'wb';
  if (sku?.flags?.toWorkOzon) return 'ozon';
  if (sku?.flags?.hasWB && sku?.flags?.hasOzon) return 'wb+ozon';
  if (sku?.flags?.hasWB) return 'wb';
  if (sku?.flags?.hasOzon) return 'ozon';
  return 'all';
}

function normalizeTask(task, sourceHint = 'manual') {
  const sku = task?.articleKey ? getSku(task.articleKey) : null;
  const title = task?.title || 'Задача без названия';
  const type = task?.type || inferTaskType(`${title} ${task?.nextAction || ''}`);
  const priority = task?.priority || (type === 'price_margin' ? 'critical' : type === 'assignment' ? 'high' : 'medium');
  const createdAt = task?.createdAt || new Date().toISOString();
  return {
    id: task?.id || stableId(sourceHint === 'auto' ? 'auto' : 'task', `${task?.articleKey || ''}|${title}|${task?.due || ''}|${createdAt}|${sourceHint}`),
    source: task?.source || sourceHint,
    articleKey: task?.articleKey || '',
    title,
    nextAction: task?.nextAction || '',
    reason: task?.reason || '',
    owner: task?.owner || ownerName(sku) || '',
    due: task?.due || plusDays(type === 'assignment' ? 1 : 3),
    status: mapTaskStatus(task?.status),
    type,
    priority,
    platform: detectTaskPlatform(task, sku),
    createdAt,
    entityLabel: task?.entityLabel || sku?.name || title,
    autoCode: task?.autoCode || ''
  };
}

function normalizeStorageTasks(tasks, sourceHint = 'manual') {
  return (tasks || []).map((task) => normalizeTask(task, task?.source || sourceHint));
}

function isTaskActive(task) {
  return ACTIVE_TASK_STATUSES.has(task?.status);
}

function isTaskOverdue(task) {
  return Boolean(task?.due) && isTaskActive(task) && task.due < todayIso();
}

function taskStatusBadge(task) {
  const meta = isTaskOverdue(task) ? { label: 'Просрочено', kind: 'danger' } : (TASK_STATUS_META[task?.status] || TASK_STATUS_META.new);
  return badge(meta.label, meta.kind);
}

function taskPriorityBadge(task) {
  const meta = PRIORITY_META[task?.priority] || PRIORITY_META.medium;
  return badge(meta.label, meta.kind);
}

function taskTypeBadge(task) {
  const kind = task?.type === 'price_margin' ? 'danger' : task?.type === 'assignment' ? 'warn' : 'info';
  return badge(TASK_TYPE_META[task?.type] || TASK_TYPE_META.general, kind);
}

function taskSourceBadge(task) {
  if (task?.source === 'auto') return badge('авто-сигнал', 'info');
  if (task?.source === 'seed') return badge('seed');
  return badge('ручная', 'ok');
}

function taskPlatformBadge(task) {
  const meta = controlWorkstreamMeta(controlWorkstreamKey(task, getSku(task.articleKey)));
  return badge(meta.chip, meta.kind);
}

function taskSortKey(task) {
  return [
    Number(isTaskOverdue(task)),
    Number(isTaskActive(task)),
    PRIORITY_META[task?.priority]?.rank || 1,
    task?.due || '9999-12-31',
    task?.title || ''
  ];
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const ka = taskSortKey(a);
    const kb = taskSortKey(b);
    return kb[0] - ka[0]
      || kb[1] - ka[1]
      || kb[2] - ka[2]
      || ka[3].localeCompare(kb[3])
      || ka[4].localeCompare(kb[4], 'ru');
  });
}

function getTask(taskId) {
  return getAllTasks().find((task) => task.id === taskId) || null;
}

function taskHeadline(task) {
  return task?.title || task?.entityLabel || 'Задача';
}

function taskEntityLine(task, sku) {
  if (sku) return linkToSku(sku.articleKey, sku.article || sku.articleKey);
  return badge(task?.entityLabel || 'Общая задача', 'info');
}

function taskHistoryBadge(kind) {
  const meta = TASK_LOG_META[kind] || TASK_LOG_META.comment;
  return badge(meta.label, meta.tone);
}

function renderTaskHistoryItem(item) {
  return `
    <div class="comment-item">
      <div class="head">
        <strong>${escapeHtml(item.author || 'Команда')}</strong>
        <div class="badge-stack">${taskHistoryBadge(item.kind)}${badge(item.team || 'Команда')}</div>
      </div>
      <div class="muted small">${fmt.date(item.createdAt)}</div>
      <p>${escapeHtml(item.text || '—')}</p>
    </div>
  `;
}

function ensureTaskModal() {
  let modal = document.getElementById('taskModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'taskModal';
  modal.className = 'modal';
  modal.innerHTML = '<div class="modal-card task-modal-card" id="taskModalBody"></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => {
    if (event.target.id === 'taskModal') closeTaskModal();
  });
  return modal;
}

function storedTaskKeys() {
  return new Set((state.storage.tasks || [])
    // Completed saved tasks are still deliberate outcomes and should suppress duplicate auto tasks.
    .map((task) => normalizeTask(task, task?.source || 'manual'))
    .filter((task) => task.articleKey && task.type)
    .map((task) => `${task.articleKey}|${task.type}`));
}

function buildAutoTasks() {
  const keys = storedTaskKeys();
  const tasks = [];

  for (const sku of state.skus) {
    const articleKey = sku.articleKey;
    const owner = ownerName(sku);
    const platform = sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon ? 'wb+ozon' : sku?.flags?.toWorkWB ? 'wb' : sku?.flags?.toWorkOzon ? 'ozon' : detectTaskPlatform({}, sku);
    const exitSku = String(sku?.status || '').toLowerCase().includes('вывод');

    if ((sku?.flags?.toWorkWB || sku?.flags?.toWorkOzon || sku?.flags?.toWork) && !keys.has(`${articleKey}|price_margin`)) {
      tasks.push(normalizeTask({
        id: `auto-price-${articleKey}`,
        source: 'auto',
        autoCode: 'price_margin',
        articleKey,
        title: 'Разобрать цену и маржу',
        nextAction: 'Проверить цену, unit-экономику и дать план действий по SKU в работе.',
        reason: sku.focusReasons || 'Ниже плана и отрицательная маржа.',
        owner,
        due: plusDays(2),
        status: 'new',
        type: 'price_margin',
        priority: 'critical',
        platform
      }, 'auto'));
    } else if (sku?.flags?.negativeMargin && !keys.has(`${articleKey}|price_margin`)) {
      tasks.push(normalizeTask({
        id: `auto-neg-${articleKey}`,
        source: 'auto',
        autoCode: 'negative_margin',
        articleKey,
        title: 'Проверить отрицательную маржу',
        nextAction: 'Сверить комиссии, логистику, возвраты и min price.',
        reason: 'Есть отрицательная маржа хотя бы по одной из площадок.',
        owner,
        due: plusDays(3),
        status: 'new',
        type: 'price_margin',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (sku?.flags?.lowStock && !exitSku && !keys.has(`${articleKey}|supply`)) {
      tasks.push(normalizeTask({
        id: `auto-stock-${articleKey}`,
        source: 'auto',
        autoCode: 'low_stock',
        articleKey,
        title: 'Проверить остатки и поставку',
        nextAction: 'Подтвердить риск OOS, поставить срок и план отгрузки.',
        reason: 'Низкий остаток по SKU.',
        owner,
        due: plusDays(2),
        status: 'new',
        type: 'supply',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (!sku?.flags?.assigned && !keys.has(`${articleKey}|assignment`)) {
      tasks.push(normalizeTask({
        id: `auto-owner-${articleKey}`,
        source: 'auto',
        autoCode: 'assignment',
        articleKey,
        title: 'Назначить owner по SKU',
        nextAction: 'Закрепить ответственного и срок первого апдейта.',
        reason: 'SKU без закрепления.',
        owner: '',
        due: plusDays(1),
        status: 'new',
        type: 'assignment',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (sku?.flags?.highReturn && !keys.has(`${articleKey}|returns`)) {
      tasks.push(normalizeTask({
        id: `auto-returns-${articleKey}`,
        source: 'auto',
        autoCode: 'returns',
        articleKey,
        title: 'Разобрать возвраты и отзывы',
        nextAction: 'Проверить причины возвратов, отзывы и нужные правки карточки.',
        reason: sku?.returns?.topReason || 'Высокие возвраты по SKU.',
        owner,
        due: plusDays(3),
        status: 'new',
        type: 'returns',
        priority: 'medium',
        platform
      }, 'auto'));
    }

    if ((sku?.focusScore || 0) >= 4 && !sku?.flags?.hasExternalTraffic && !exitSku && !keys.has(`${articleKey}|traffic`)) {
      tasks.push(normalizeTask({
        id: `auto-traffic-${articleKey}`,
        source: 'auto',
        autoCode: 'traffic',
        articleKey,
        title: 'Проверить внешний трафик по фокусному SKU',
        nextAction: 'Решить, нужен ли КЗ / VK / инфлюенсеры и зафиксировать owner канала.',
        reason: 'Фокусный SKU без внешнего трафика.',
        owner,
        due: plusDays(4),
        status: 'new',
        type: 'traffic',
        priority: 'medium',
        platform
      }, 'auto'));
    }
  }

  return tasks;
}

function getAllTasks() {
  return sortTasks([...state.storage.tasks, ...buildAutoTasks()]);
}

function getSkuControlTasks(articleKey) {
  return sortTasks(getAllTasks().filter((task) => task.articleKey === articleKey));
}

function nextTaskForSku(articleKey) {
  const tasks = getSkuControlTasks(articleKey);
  return tasks.find(isTaskActive) || tasks[0] || null;
}

function getControlSnapshot() {
  const tasks = getAllTasks();
  const active = tasks.filter(isTaskActive);
  const overdue = active.filter(isTaskOverdue);
  const waitingDecision = active.filter((task) => task.status === 'waiting_decision');
  const noOwner = active.filter((task) => !task.owner);
  const dueThisWeek = active.filter((task) => task.due && task.due <= plusDays(7));
  const ownerMap = new Map();

  for (const task of active) {
    const key = task.owner || 'Без owner';
    const row = ownerMap.get(key) || { owner: key, total: 0, overdue: 0, critical: 0, waiting: 0 };
    row.total += 1;
    if (isTaskOverdue(task)) row.overdue += 1;
    if (task.priority === 'critical') row.critical += 1;
    if (task.status === 'waiting_decision') row.waiting += 1;
    ownerMap.set(key, row);
  }

  return {
    tasks,
    active,
    overdue,
    waitingDecision,
    noOwner,
    dueThisWeek,
    byOwner: [...ownerMap.values()].sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner, 'ru')),
    todayList: sortTasks(active).filter((task) => isTaskOverdue(task) || task.priority === 'critical' || (task.due && task.due <= plusDays(2))).slice(0, 12),
    autoCount: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length,
    manualCount: tasks.filter((task) => task.source !== 'auto' && isTaskActive(task)).length
  };
}

async function initTeamStore() {
  const cfg = currentConfig();
  state.team.member = { ...DEFAULT_APP_CONFIG.teamMember, ...(cfg.teamMember || {}) };
  state.team.error = '';
  state.team.accessToken = '';
  state.team.client = null;
  state.team.userId = '';
  const wantsRemote = cfg.teamMode === 'supabase' && cfg.supabase?.url && cfg.supabase?.anonKey;
  state.team.note = wantsRemote ? 'Подключаем командную базу…' : 'Локальный режим';
  state.team.mode = wantsRemote ? 'pending' : 'local';
  state.team.ready = false;
  updateSyncBadge();

  if (cfg.teamMode !== 'supabase' || !cfg.supabase?.url || !cfg.supabase?.anonKey) {
    applyOwnerOverridesToSkus();
    updateSyncBadge();
    return;
  }

  try {
    state.team.mode = 'pending';
    state.team.note = 'Подключаем командную базу…';
    updateSyncBadge();

    if ((cfg.supabase.auth || 'anonymous') === 'anonymous') {
      const signIn = await signInTeamAnonymously();
      state.team.accessToken = signIn?.access_token || '';
      state.team.userId = signIn?.user?.id || '';
      if (!state.team.accessToken) throw new Error('Supabase не вернул access token');
      state.team.client = createRestTeamClient();
    } else {
      if (!window.supabase?.createClient) {
        throw new Error('Supabase client не загрузился');
      }
      const client = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'altea-team-store'
        }
      });
      state.team.client = client;
    }

    state.team.mode = 'ready';
    state.team.ready = true;
    state.team.note = 'Командная база подключена';
    await pullRemoteState(false);
  } catch (error) {
    console.error(error);
    state.team.mode = 'error';
    state.team.ready = false;
    state.team.error = error.message || 'Ошибка подключения';
    state.team.note = 'Ошибка Supabase — работаем локально';
    applyOwnerOverridesToSkus();
    updateSyncBadge();
  }
}

function remoteTaskRow(task) {
  return {
    id: task.id,
    brand: currentBrand(),
    article_key: task.articleKey,
    title: task.title,
    next_action: task.nextAction || '',
    reason: task.reason || '',
    owner: task.owner || '',
    due: task.due || null,
    status: task.status,
    type: task.type,
    priority: task.priority,
    platform: task.platform,
    source: task.source,
    entity_label: task.entityLabel || '',
    auto_code: task.autoCode || '',
    created_at: task.createdAt || new Date().toISOString()
  };
}

function fromRemoteTask(row) {
  return {
    id: row.id,
    articleKey: row.article_key,
    title: row.title,
    nextAction: row.next_action,
    reason: row.reason,
    owner: row.owner,
    due: row.due,
    status: row.status,
    type: row.type,
    priority: row.priority,
    platform: row.platform,
    source: row.source || 'manual',
    entityLabel: row.entity_label,
    autoCode: row.auto_code,
    createdAt: row.created_at
  };
}

function remoteCommentRow(comment) {
  return {
    id: comment.id,
    brand: currentBrand(),
    article_key: comment.articleKey,
    author: comment.author,
    team: comment.team,
    text: comment.text,
    type: comment.type,
    created_at: comment.createdAt
  };
}

function fromRemoteComment(row) {
  return normalizeComment({
    id: row.id,
    articleKey: row.article_key,
    author: row.author,
    team: row.team,
    text: row.text,
    type: row.type,
    createdAt: row.created_at
  });
}

function remoteDecisionRow(decision) {
  return {
    id: decision.id,
    brand: currentBrand(),
    article_key: decision.articleKey,
    title: decision.title,
    decision: decision.decision,
    owner: decision.owner,
    status: decision.status,
    due: decision.due || null,
    created_at: decision.createdAt,
    created_by: decision.createdBy
  };
}

function fromRemoteDecision(row) {
  return normalizeDecision({
    id: row.id,
    articleKey: row.article_key,
    title: row.title,
    decision: row.decision,
    owner: row.owner,
    status: row.status,
    due: row.due,
    createdAt: row.created_at,
    createdBy: row.created_by
  });
}

function remoteOwnerRow(item) {
  return {
    brand: currentBrand(),
    article_key: item.articleKey,
    owner_name: item.ownerName,
    owner_role: item.ownerRole,
    note: item.note,
    updated_at: item.updatedAt,
    assigned_by: item.assignedBy
  };
}

function fromRemoteOwner(row) {
  return normalizeOwnerOverride({
    articleKey: row.article_key,
    ownerName: row.owner_name,
    ownerRole: row.owner_role,
    note: row.note,
    updatedAt: row.updated_at,
    assignedBy: row.assigned_by
  });
}

function teamRestConfig() {
  const cfg = currentConfig();
  if (!cfg.supabase?.url || !cfg.supabase?.anonKey || typeof fetch !== 'function') return null;
  const baseUrl = String(cfg.supabase.url || '').replace(/\/+$/, '');
  return {
    baseUrl,
    anonKey: cfg.supabase.anonKey,
    accessToken: state.team.accessToken || '',
    brand: currentBrand()
  };
}

async function readSupabaseJson(response, label) {
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`${label}: ${bodyText || response.status || 'request failed'}`);
  }
  return bodyText ? JSON.parse(bodyText) : [];
}

async function signInTeamViaRest() {
  const cfg = teamRestConfig();
  if (!cfg) throw new Error('Supabase REST недоступен');
  const response = await fetch(`${cfg.baseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  return readSupabaseJson(response, 'Анонимный вход Supabase');
}

async function signInTeamAnonymously() {
  const cfg = currentConfig();
  if (window.supabase?.createClient) {
    const client = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'altea-team-store'
      }
    });
    const response = await client.auth.signInAnonymously();
    if (response?.error) throw response.error;
    return {
      access_token: response?.data?.session?.access_token || '',
      user: response?.data?.user || null
    };
  }
  return signInTeamViaRest();
}

function createRestTeamClient() {
  const build = (table) => ({
    table,
    method: 'GET',
    filters: [],
    selectValue: '*',
    orderValue: '',
    limitValue: null,
    body: null,
    onConflict: '',
    prefer: '',
    select(columns) {
      this.selectValue = columns || '*';
      return this;
    },
    eq(column, value) {
      this.filters.push([column, `eq.${String(value ?? '')}`]);
      return this;
    },
    in(column, values) {
      const list = Array.isArray(values) ? values.map((item) => String(item)).join(',') : String(values || '');
      this.filters.push([column, `in.(${list})`]);
      return this;
    },
    order(column, options = {}) {
      const ascending = options?.ascending !== false;
      this.orderValue = `${column}.${ascending ? 'asc' : 'desc'}`;
      return this;
    },
    limit(value) {
      this.limitValue = Number(value) || null;
      return this;
    },
    upsert(rows, options = {}) {
      this.method = 'POST';
      this.body = rows;
      this.onConflict = options?.onConflict || '';
      this.prefer = 'resolution=merge-duplicates,return=representation';
      return this;
    },
    insert(rows) {
      this.method = 'POST';
      this.body = rows;
      this.prefer = 'return=representation';
      return this;
    },
    delete() {
      this.method = 'DELETE';
      this.prefer = 'return=representation';
      return this;
    },
    async execute() {
      const cfg = teamRestConfig();
      if (!cfg?.baseUrl || !cfg?.anonKey || !cfg?.accessToken) {
        return { data: null, error: { message: 'Командная база недоступна' } };
      }
      const url = new URL(`${cfg.baseUrl}/rest/v1/${this.table}`);
      if (this.method === 'GET') url.searchParams.set('select', this.selectValue);
      if (this.onConflict) url.searchParams.set('on_conflict', this.onConflict);
      if (this.orderValue) url.searchParams.set('order', this.orderValue);
      if (this.limitValue) url.searchParams.set('limit', String(this.limitValue));
      for (const [column, value] of this.filters) url.searchParams.set(column, value);
      try {
        const response = await fetch(url.toString(), {
          method: this.method,
          headers: {
            apikey: cfg.anonKey,
            Authorization: `Bearer ${cfg.accessToken}`,
            Accept: 'application/json',
            ...(this.body !== null ? { 'Content-Type': 'application/json' } : {}),
            ...(this.prefer ? { Prefer: this.prefer } : {})
          },
          ...(this.body !== null ? { body: JSON.stringify(this.body) } : {})
        });
        const data = await readSupabaseJson(response, `${this.method} ${this.table}`);
        return { data, error: null };
      } catch (error) {
        return { data: null, error: { message: error?.message || String(error) } };
      }
    },
    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  });

  return {
    from(table) {
      return build(table);
    }
  };
}

function hasRemoteStore() {
  return Boolean(state.team.ready && (state.team.client || state.team.accessToken));
}

async function queryRemote(table) {
  if (!hasRemoteStore()) return [];
  const isTaskTable = table === TEAM_TABLES.tasks;
  if (state.team.accessToken) {
    const cfg = teamRestConfig();
    if (!cfg) return [];
    const url = new URL(`${cfg.baseUrl}/rest/v1/${table}`);
    url.searchParams.set('brand', `eq.${cfg.brand}`);
    if (isTaskTable) {
      url.searchParams.set('select', 'id,article_key,title,next_action,reason,owner,due,status,type,priority,platform,source,entity_label,auto_code,created_at,updated_at');
      url.searchParams.set('status', 'in.(new,in_progress,waiting_team,waiting_rop,waiting_decision)');
    } else {
      url.searchParams.set('select', '*');
    }
    const response = await withTimeout(fetch(url.toString(), {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json'
      }
    }), 8000, `Запрос ${table}`);
    return readSupabaseJson(response, `Запрос ${table}`);
  }
  const query = isTaskTable
    ? state.team.client
        .from(table)
        .select('id,article_key,title,next_action,reason,owner,due,status,type,priority,platform,source,entity_label,auto_code,created_at,updated_at')
        .eq('brand', currentBrand())
        .in('status', ['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision'])
    : state.team.client.from(table).select('*').eq('brand', currentBrand());
  const response = await withTimeout(query, 8000, `Запрос ${table}`);
  if (response.error) throw response.error;
  return response.data || [];
}

async function upsertRemote(table, rows, onConflict) {
  if (!hasRemoteStore() || !rows.length) return;
  if (state.team.accessToken) {
    const cfg = teamRestConfig();
    if (!cfg) return;
    const url = new URL(`${cfg.baseUrl}/rest/v1/${table}`);
    url.searchParams.set('on_conflict', onConflict);
    const response = await withTimeout(fetch(url.toString(), {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(rows)
    }), 8000, `Синхронизация ${table}`);
    await readSupabaseJson(response, `Синхронизация ${table}`);
    return;
  }
  const response = await withTimeout(
    state.team.client.from(table).upsert(rows, { onConflict }),
    8000,
    `Синхронизация ${table}`
  );
  if (response.error) throw response.error;
}

async function pullRemoteState(rerender = true) {
  if (!hasRemoteStore()) return;
  try {
    state.team.mode = 'pending';
    state.team.note = 'Загружаем командные данные…';
    updateSyncBadge();
    const taskRows = await queryRemote(TEAM_TABLES.tasks);
    const [commentResult, decisionResult, ownerResult] = await Promise.allSettled([
      queryRemote(TEAM_TABLES.comments),
      queryRemote(TEAM_TABLES.decisions),
      queryRemote(TEAM_TABLES.owners)
    ]);
    const commentRows = commentResult.status === 'fulfilled' ? (commentResult.value || []) : [];
    const decisionRows = decisionResult.status === 'fulfilled' ? (decisionResult.value || []) : [];
    const ownerRows = ownerResult.status === 'fulfilled' ? (ownerResult.value || []) : [];
    const softErrors = [commentResult, decisionResult, ownerResult]
      .filter((result) => result.status !== 'fulfilled')
      .map((result) => result.reason?.message || String(result.reason || 'Неизвестная ошибка'))
      .filter(Boolean);
    const remoteEmpty = !taskRows.length && !commentRows.length && !decisionRows.length && !ownerRows.length;
    if (!remoteEmpty) {
      state.storage.tasks = normalizeStorageTasks(taskRows.map(fromRemoteTask), 'manual');
      state.storage.comments = commentRows.map(fromRemoteComment);
      state.storage.decisions = decisionRows.map(fromRemoteDecision);
      state.storage.ownerOverrides = ownerRows.map(fromRemoteOwner);
      applyOwnerOverridesToSkus();
      saveLocalStorage();
    }
    state.team.mode = 'ready';
    state.team.lastSyncAt = new Date().toISOString();
    state.team.error = softErrors.join(' | ');
    state.team.note = remoteEmpty
      ? 'Командная база пока пустая — локальные данные сохранены'
      : softErrors.length
        ? `Командная база подключена частично · ${fmt.date(state.team.lastSyncAt)}`
        : `Командная база синхронизирована · ${fmt.date(state.team.lastSyncAt)}`;
    updateSyncBadge();
    if (rerender) {
      rerenderCurrentView();
      if (state.activeSku) renderSkuModal(state.activeSku);
    }
  } catch (error) {
    console.error(error);
    state.team.mode = 'error';
    state.team.error = error.message || 'Не удалось загрузить данные';
    state.team.note = 'Ошибка загрузки из Supabase';
    updateSyncBadge();
  }
}

async function pushStateToRemote() {
  if (!hasRemoteStore()) return;
  try {
    state.team.mode = 'pending';
    state.team.note = 'Отправляем локальные данные в командную базу…';
    updateSyncBadge();
    await Promise.all([
      upsertRemote(TEAM_TABLES.tasks, (state.storage.tasks || []).map(remoteTaskRow), 'id'),
      upsertRemote(TEAM_TABLES.comments, (state.storage.comments || []).map(remoteCommentRow), 'id'),
      upsertRemote(TEAM_TABLES.decisions, (state.storage.decisions || []).map(remoteDecisionRow), 'id'),
      upsertRemote(TEAM_TABLES.owners, (state.storage.ownerOverrides || []).map(remoteOwnerRow), 'brand,article_key')
    ]);
    state.team.mode = 'ready';
    state.team.lastSyncAt = new Date().toISOString();
    state.team.note = `Данные отправлены в Supabase · ${fmt.date(state.team.lastSyncAt)}`;
    updateSyncBadge();
  } catch (error) {
    console.error(error);
    state.team.mode = 'error';
    state.team.error = error.message || 'Не удалось отправить данные';
    state.team.note = 'Ошибка выгрузки в Supabase';
    updateSyncBadge();
  }
}

async function persistTask(task) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.tasks, [remoteTaskRow(task)], 'id');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Задача синхронизирована · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

async function persistComment(comment) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.comments, [remoteCommentRow(comment)], 'id');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Комментарий синхронизирован · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

async function persistDecision(decision) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.decisions, [remoteDecisionRow(decision)], 'id');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Решение синхронизировано · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

async function persistOwnerOverride(item) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.owners, [remoteOwnerRow(item)], 'brand,article_key');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Owner синхронизирован · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

function updateSyncBadge() {
  const badgeEl = document.getElementById('syncStatusBadge');
  const pullBtn = document.getElementById('pullRemoteBtn');
  const pushBtn = document.getElementById('pushRemoteBtn');
  if (!badgeEl) return;
  badgeEl.className = 'sync-status';
  const mode = state.team.mode || 'local';
  const hasUiError = Array.isArray(state.runtimeErrors) && state.runtimeErrors.length > 0;
  if (hasUiError) badgeEl.classList.add('pending');
  else if (mode === 'ready') badgeEl.classList.add('ready');
  else if (mode === 'pending') badgeEl.classList.add('pending');
  else if (mode === 'error') badgeEl.classList.add('error');
  else badgeEl.classList.add('local');
  const member = state.team.member?.name ? ` · ${state.team.member.name}` : '';
  const uiNote = hasUiError ? ' · есть ошибка интерфейса' : '';
  badgeEl.textContent = `${state.team.note || 'Локальный режим'}${member}${uiNote}`;
  if (pullBtn) pullBtn.disabled = !hasRemoteStore();
  if (pushBtn) pushBtn.disabled = !hasRemoteStore();
}

function filteredControlTasks(options = {}) {
  const f = state.controlFilters;
  const search = String(f.search || '').trim().toLowerCase();
  const selectedWorkstream = normalizeControlWorkstreamFilter(f.platform);
  const ignorePlatform = Boolean(options.ignorePlatform);

  return getAllTasks().filter((task) => {
    const sku = getSku(task.articleKey);
    const workstream = controlWorkstreamMeta(controlWorkstreamKey(task, sku));
    const hay = [task.title, task.nextAction, task.reason, task.owner, task.articleKey, sku?.article, sku?.name, sku?.category, workstream.label, workstream.chip].filter(Boolean).join(' ').toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (f.owner !== 'all' && (task.owner || 'Без owner') !== f.owner) return false;
    if (f.status === 'active' && !isTaskActive(task)) return false;
    if (f.status !== 'active' && f.status !== 'all' && task.status !== f.status) return false;
    if (f.type !== 'all' && task.type !== f.type) return false;
    if (!ignorePlatform && selectedWorkstream !== 'all' && controlWorkstreamKey(task, sku) !== selectedWorkstream) return false;
    if (f.source === 'manual' && task.source === 'auto') return false;
    if (f.source === 'auto' && task.source !== 'auto') return false;
    if (f.horizon === 'overdue' && !isTaskOverdue(task)) return false;
    if (f.horizon === 'today' && task.due !== todayIso()) return false;
    if (f.horizon === 'week' && (!task.due || task.due > plusDays(7))) return false;
    if (f.horizon === 'no_owner' && task.owner) return false;
    return true;
  });
}

function renderTaskCard(task) {
  const sku = getSku(task.articleKey);
  const skuLabel = taskEntityLine(task, sku);
  const controls = task.source === 'auto'
    ? `
      <button class="btn small-btn" data-take-task="${escapeHtml(task.id)}">Взять в работу</button>
      <button class="btn ghost small-btn" data-open-task="${escapeHtml(task.id)}">Открыть</button>
    `
    : `<button class="btn ghost small-btn" data-open-task="${escapeHtml(task.id)}">Открыть задачу</button>`;

  return `
    <div class="task-card ${isTaskOverdue(task) ? 'overdue' : ''}">
      <div class="head">
        <div>
          <div class="title">${escapeHtml(task.title)}</div>
          <div class="muted small" style="margin-top:4px">${skuLabel}</div>
        </div>
        ${taskStatusBadge(task)}
      </div>
      <div class="meta">${taskPriorityBadge(task)}${taskTypeBadge(task)}${taskPlatformBadge(task)}${taskSourceBadge(task)}</div>
      ${task.reason ? `<div class="muted small">${escapeHtml(task.reason)}</div>` : ''}
      ${task.nextAction ? `<div><strong class="small">Следующее действие</strong><div class="muted small" style="margin-top:4px">${escapeHtml(task.nextAction)}</div></div>` : ''}
      <div class="foot">
        <div class="muted small">${escapeHtml(task.owner || 'Без owner')} · срок ${escapeHtml(task.due || '—')}</div>
        <div class="actions">${controls}</div>
      </div>
    </div>
  `;
}

function renderMiniTask(task) {
  const sku = getSku(task.articleKey);
  return `
    <div class="task-mini ${isTaskOverdue(task) ? 'overdue' : ''}" data-open-task="${escapeHtml(task.id)}" style="cursor:pointer">
      <div class="left">
        <strong>${escapeHtml(task.title)}</strong>
        <div class="muted small">${escapeHtml(sku?.article || task.articleKey || task.entityLabel || '—')} · ${escapeHtml(task.owner || 'Без owner')} · ${escapeHtml(task.due || '—')}</div>
      </div>
      <div class="badge-stack">${taskPriorityBadge(task)}${taskStatusBadge(task)}</div>
    </div>
  `;
}

function renderOwnerRow(row, max) {
  const width = Math.max(6, Math.round((row.total / Math.max(1, max)) * 100));
  return `
    <div class="owner-row">
      <div class="head">
        <strong>${escapeHtml(row.owner)}</strong>
        <div class="badge-stack">
          ${badge(`${fmt.int(row.total)} задач`)}
          ${row.overdue ? badge(`${fmt.int(row.overdue)} проср.`, 'danger') : ''}
          ${row.critical ? badge(`${fmt.int(row.critical)} крит.`, 'warn') : ''}
        </div>
      </div>
      <div class="owner-bar"><span style="width:${width}%"></span></div>
    </div>
  `;
}

function buildControlWorkstreamSummary(tasks, key) {
  const grouped = key === 'all'
    ? sortTasks(tasks)
    : sortTasks(tasks.filter((task) => controlWorkstreamKey(task, getSku(task.articleKey)) === key));
  const active = grouped.filter(isTaskActive);
  const owners = [...new Set(active.map((task) => task.owner || 'Без owner'))].slice(0, 3);
  const meta = controlWorkstreamMeta(key);
  return {
    key,
    meta,
    tasks: grouped,
    activeCount: active.length,
    overdueCount: active.filter(isTaskOverdue).length,
    criticalCount: active.filter((task) => task.priority === 'critical').length,
    waitingCount: active.filter((task) => task.status === 'waiting_decision').length,
    ownerPreview: owners,
    typeCount: new Set(active.map((task) => task.type)).size
  };
}

function renderControlWorkstreamCard(summary, selectedKey) {
  const isSelected = selectedKey === summary.key;
  const hint = summary.ownerPreview.length
    ? `${summary.ownerPreview.join(' · ')} · ${fmt.int(summary.typeCount)} типов задач`
    : summary.meta.description;
  return `
    <button
      type="button"
      class="card kpi"
      data-control-workstream="${escapeHtml(summary.key)}"
      style="text-align:left;cursor:pointer;${isSelected ? 'box-shadow: inset 0 0 0 1px rgba(212, 164, 74, 0.46);border-color: rgba(212, 164, 74, 0.38);' : ''}"
    >
      <div class="label">${escapeHtml(summary.meta.label)}</div>
      <div class="value">${fmt.int(summary.activeCount)}</div>
      <div class="hint">${escapeHtml(hint)}</div>
      <div class="badge-stack" style="margin-top:10px">
        ${badge(`${fmt.int(summary.overdueCount)} проср.`, summary.overdueCount ? 'danger' : '')}
        ${badge(`${fmt.int(summary.criticalCount)} крит.`, summary.criticalCount ? 'warn' : '')}
        ${summary.waitingCount ? badge(`${fmt.int(summary.waitingCount)} ждут решения`, 'info') : badge('в контуре')}
      </div>
    </button>
  `;
}

function renderControlWorkstreamSection(summary) {
  const pool = summary.tasks.filter(isTaskActive).length ? summary.tasks.filter(isTaskActive) : summary.tasks;
  const tasksHtml = pool.length
    ? pool.slice(0, 10).map(renderTaskCard).join('')
    : '<div class="empty">Нет задач под текущий срез</div>';
  const ownerLine = summary.ownerPreview.length
    ? `Ключевые owner: ${summary.ownerPreview.join(' · ')}`
    : 'Owner пока не закреплены или контур заполнен только авто-сигналами.';
  return `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>${escapeHtml(summary.meta.label)}</h3>
          <p class="small muted">${escapeHtml(summary.meta.description)}</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(summary.activeCount)} активн.`, summary.activeCount ? summary.meta.kind : '')}
          ${summary.overdueCount ? badge(`${fmt.int(summary.overdueCount)} проср.`, 'danger') : ''}
          ${summary.criticalCount ? badge(`${fmt.int(summary.criticalCount)} крит.`, 'warn') : ''}
        </div>
      </div>
      <div class="muted small" style="margin-top:6px">${escapeHtml(ownerLine)}</div>
      <div class="stack" style="margin-top:12px">${tasksHtml}</div>
    </div>
  `;
}

function skuOperationalStatusMeta(sku) {
  const rawStatus = String(sku?.status || '').toLowerCase();
  const registryStatus = String(sku?.owner?.registryStatus || '').toLowerCase();

  if (rawStatus.includes('вывод') || registryStatus.includes('вывод')) return { label: 'На вывод', tone: '' };
  if (rawStatus.includes('нов') || registryStatus.includes('нов')) return { label: 'Новинка', tone: 'info' };
  if (rawStatus.includes('вопрос') || registryStatus.includes('вопрос')) return { label: 'Под вопросом', tone: 'warn' };
  if (rawStatus.includes('специф') || registryStatus.includes('специф')) return { label: 'Нет в спецификации', tone: 'warn' };
  if (!sku?.flags?.assigned) return { label: 'Без owner', tone: 'warn' };
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) return { label: 'В работу WB + Ozon', tone: 'danger' };
  if (sku?.flags?.toWorkWB) return { label: 'В работу WB', tone: 'danger' };
  if (sku?.flags?.toWorkOzon) return { label: 'В работу Ozon', tone: 'danger' };
  if (sku?.flags?.negativeMargin) return { label: 'Маржа в риске', tone: 'danger' };
  if (sku?.flags?.lowStock) return { label: 'Низкий остаток', tone: 'warn' };
  if (sku?.flags?.underPlan) return { label: 'Ниже плана', tone: 'warn' };
  if ((sku?.focusScore || 0) >= 4) return { label: 'Наблюдать', tone: 'warn' };
  if (registryStatus) return { label: sku.owner.registryStatus, tone: 'ok' };
  if (sku?.status) return { label: sku.status, tone: 'ok' };
  return { label: 'Актуальный', tone: 'ok' };
}

function skuOperationalStatus(sku) {
  const meta = skuOperationalStatusMeta(sku);
  return badge(meta.label, meta.tone);
}

function renderSkuTaskSummary(sku, task = nextTaskForSku(sku.articleKey)) {
  if (!task) return `<div class="muted small">Нет активной задачи</div>`;
  return `
    <div><strong>${escapeHtml(task.title)}</strong></div>
    <div class="muted small">${escapeHtml(task.nextAction || task.reason || 'Нужен апдейт')}</div>
    <div class="badge-stack" style="margin-top:6px">${taskStatusBadge(task)}${taskPriorityBadge(task)}</div>
  `;
}


function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function avg(values) {
  const clean = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (!clean.length) return null;
  return clean.reduce((acc, value) => acc + value, 0) / clean.length;
}

function bestTurnoverDays(sku) {
  const values = [sku?.wb?.turnoverDays, sku?.ozon?.turnoverDays]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  return values.length ? Math.min(...values) : null;
}

function totalSkuStock(sku) {
  return numberOrZero(sku?.wb?.stock) + numberOrZero(sku?.ozon?.stockProducts ?? sku?.ozon?.stock);
}

function currentCompletionPct(sku) {
  return numberOrZero(
    sku?.planFact?.completionAprToDatePct
    ?? sku?.planFact?.completionAprMonthPct
    ?? sku?.planFact?.completionFeb26Pct
  );
}

function currentMarginPct(sku) {
  const direct = sku?.planFact?.factApr16MarginPct ?? sku?.planFact?.factFeb26MarginPct;
  if (direct !== undefined && direct !== null && direct !== '') return numberOrZero(direct);
  const wb = sku?.wb?.marginPct;
  const oz = sku?.ozon?.marginPct;
  const values = [wb, oz].filter(v => v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v))).map(Number);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function monthRevenue(sku) {
  return numberOrZero(
    sku?.planFact?.factApr16Revenue
    ?? sku?.planFact?.factFeb26Revenue
    ?? sku?.orders?.value
    ?? sku?.planFact?.factTotalRevenue
  );
}

function monthNetRevenue(sku) {
  return numberOrZero(
    sku?.planFact?.factApr16NetRevenue
    ?? sku?.planFact?.factFeb26NetRevenue
    ?? sku?.orders?.value
    ?? sku?.planFact?.factApr16Revenue
  );
}

function monthUnits(sku) {
  return numberOrZero(
    sku?.planFact?.factApr16Units
    ?? sku?.planFact?.factFeb26Units
    ?? sku?.orders?.units
  );
}

function externalTrafficLabel(sku) {
  const parts = [];
  if (sku?.flags?.hasKZ) parts.push('🚀 КЗ');
  if (sku?.flags?.hasVK) parts.push('📣 VK');
  return parts.join(' · ') || 'без внешнего трафика';
}

function renderLeaderRow(item, index, maxValue, metricLabel, metaHtml = '') {
  const width = maxValue > 0 ? Math.max(6, Math.round((numberOrZero(item.metricValue) / maxValue) * 100)) : 12;
  return `
    <div class="leader-row interactive-row" data-open-sku="${escapeHtml(item.articleKey)}">
      <div class="leader-rank">${index + 1}</div>
      <div class="leader-main">
        <div class="leader-headline">
          <div>
            <strong>${linkToSku(item.articleKey, item.article || item.articleKey)}</strong>
            <div class="muted small">${escapeHtml(item.title || 'Без названия')}</div>
          </div>
          <div class="leader-value">${escapeHtml(metricLabel(item.metricValue))}</div>
        </div>
        <div class="leader-bar"><span style="width:${width}%"></span></div>
        <div class="leader-meta">${metaHtml}</div>
      </div>
    </div>
  `;
}

function renderInverseLeaderRow(item, index, maxValue, metricLabel, metaHtml = '') {
  const rawValue = numberOrZero(item.metricValue);
  const width = maxValue > 0 ? Math.max(8, Math.round((1 - rawValue / maxValue) * 100)) : 12;
  return `
    <div class="leader-row interactive-row" data-open-sku="${escapeHtml(item.articleKey)}">
      <div class="leader-rank">${index + 1}</div>
      <div class="leader-main">
        <div class="leader-headline">
          <div>
            <strong>${linkToSku(item.articleKey, item.article || item.articleKey)}</strong>
            <div class="muted small">${escapeHtml(item.title || 'Без названия')}</div>
          </div>
          <div class="leader-value">${escapeHtml(metricLabel(item.metricValue))}</div>
        </div>
        <div class="leader-bar inverse"><span style="width:${width}%"></span></div>
        <div class="leader-meta">${metaHtml}</div>
      </div>
    </div>
  `;
}

function buildVisualDashboardModel() {
  const control = getControlSnapshot();
  const activeSkus = state.skus.filter((sku) => !String(sku?.status || '').toLowerCase().includes('вывод'));
  const revenueTotal = activeSkus.reduce((acc, sku) => acc + monthRevenue(sku), 0);
  const netRevenueTotal = activeSkus.reduce((acc, sku) => acc + monthNetRevenue(sku), 0);
  const unitsTotal = activeSkus.reduce((acc, sku) => acc + monthUnits(sku), 0);
  const avgCompletion = avg(activeSkus.map((sku) => currentCompletionPct(sku)));
  const avgMargin = avg(activeSkus.map((sku) => currentMarginPct(sku)));
  const trafficCount = activeSkus.filter((sku) => sku?.flags?.hasExternalTraffic).length;
  const leadersSales = [...activeSkus]
    .filter((sku) => monthRevenue(sku) > 0)
    .sort((a, b) => monthRevenue(b) - monthRevenue(a))
    .slice(0, 8)
    .map((sku) => ({
      articleKey: sku.articleKey,
      article: sku.article,
      title: sku.name,
      metricValue: monthRevenue(sku),
      owner: ownerName(sku),
      marginPct: currentMarginPct(sku),
      units: monthUnits(sku),
      traffic: externalTrafficLabel(sku)
    }));
  const turnoverCandidates = [...activeSkus]
    .map((sku) => ({
      sku,
      metricValue: bestTurnoverDays(sku)
    }))
    .filter((row) => row.metricValue && row.metricValue > 0 && totalSkuStock(row.sku) > 0)
    .sort((a, b) => a.metricValue - b.metricValue)
    .slice(0, 8)
    .map((row) => ({
      articleKey: row.sku.articleKey,
      article: row.sku.article,
      title: row.sku.name,
      metricValue: row.metricValue,
      stock: totalSkuStock(row.sku),
      target: avg([row.sku?.wb?.targetTurnoverDays, row.sku?.ozon?.targetTurnoverDays]),
      owner: ownerName(row.sku)
    }));
  const romiLeaders = [...activeSkus]
    .filter((sku) => numberOrZero(sku?.content?.romi) > 0)
    .sort((a, b) => numberOrZero(b?.content?.romi) - numberOrZero(a?.content?.romi))
    .slice(0, 6)
    .map((sku) => ({
      articleKey: sku.articleKey,
      article: sku.article,
      title: sku.name,
      metricValue: numberOrZero(sku?.content?.romi),
      posts: numberOrZero(sku?.content?.posts),
      clicks: numberOrZero(sku?.content?.clicks),
      orders: numberOrZero(sku?.content?.orders)
    }));
  const worklist = [...state.skus]
    .filter((sku) => sku?.flags?.toWork)
    .sort((a, b) => numberOrZero(b?.focusScore) - numberOrZero(a?.focusScore) || monthRevenue(b) - monthRevenue(a))
    .slice(0, 6);
  const freshness = state.dashboard?.dataFreshness || {};
  return {
    control,
    revenueTotal,
    netRevenueTotal,
    unitsTotal,
    avgCompletion,
    avgMargin,
    trafficCount,
    leadersSales,
    turnoverCandidates,
    romiLeaders,
    worklist,
    freshness
  };
}

function renderDashboard() {
  const root = document.getElementById('view-dashboard');
  const model = buildVisualDashboardModel();
  const control = model.control;
  const salesMax = Math.max(1, ...model.leadersSales.map((item) => numberOrZero(item.metricValue)));
  const turnoverMax = Math.max(1, ...model.turnoverCandidates.map((item) => numberOrZero(item.metricValue)));
  const romiMax = Math.max(1, ...model.romiLeaders.map((item) => numberOrZero(item.metricValue)));

  const heroCards = [
    { label: 'Выручка за срез', value: fmt.money(model.revenueTotal), hint: 'Сумма факта / order value по активным SKU.' },
    { label: 'Net revenue', value: fmt.money(model.netRevenueTotal), hint: 'Чистая выручка по доступному срезу.' },
    { label: 'Продано единиц', value: fmt.int(model.unitsTotal), hint: 'Факт units по SKU в текущем портале.' },
    { label: 'Среднее выполнение', value: fmt.pct(model.avgCompletion), hint: 'Средний completion по SKU с планом.' },
    { label: 'Средняя маржа', value: fmt.pct(model.avgMargin), hint: 'Средняя маржа по текущему месячному срезу.' },
    { label: 'SKU с внешним трафиком', value: fmt.int(model.trafficCount), hint: 'КЗ / VK уже отмечены в рабочем контуре.' }
  ].map((card) => `
    <div class="hero-kpi">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.hint)}</small>
    </div>
  `).join('');

  const formatCardValue = (card) => {
    if (typeof card?.value === 'string') return escapeHtml(card.value);
    if (card?.format === 'money') return escapeHtml(fmt.money(card.value));
    if (card?.format === 'pct') return escapeHtml(fmt.pct(card.value));
    return escapeHtml(fmt.int(card?.value));
  };

  const dashboardCards = Array.isArray(state.dashboard?.cards) ? state.dashboard.cards : [];
  const baseCards = dashboardCards.map((card) => `
    <div class="card kpi">
      <div class="label">${escapeHtml(card.label)}</div>
      <div class="value">${formatCardValue(card)}</div>
      <div class="hint">${escapeHtml(card.hint)}</div>
    </div>
  `).join('');

  const salesRows = model.leadersSales.map((item, index) => renderLeaderRow(
    item,
    index,
    salesMax,
    (value) => fmt.money(value),
    `${badge(item.owner || 'Без owner', item.owner ? 'ok' : 'warn')}${marginBadge('Маржа', item.marginPct)}${badge(`${fmt.int(item.units)} шт.`)}${badge(item.traffic, item.traffic.includes('без') ? '' : 'info')}`
  )).join('');

  const turnoverRows = model.turnoverCandidates.map((item, index) => renderInverseLeaderRow(
    item,
    index,
    turnoverMax,
    (value) => `${fmt.num(value, 1)} дн.`,
    `${badge(`Цель ${fmt.num(item.target, 0)} дн.`, 'info')}${badge(`Остаток ${fmt.int(item.stock)} шт.`)}${badge(item.owner || 'Без owner', item.owner ? 'ok' : 'warn')}`
  )).join('');

  const romiRows = model.romiLeaders.map((item, index) => renderLeaderRow(
    item,
    index,
    romiMax,
    (value) => fmt.num(value, 1),
    `${badge(`${fmt.int(item.posts)} постов`)}${badge(`${fmt.int(item.clicks)} кликов`)}${badge(`${fmt.int(item.orders)} заказов`, 'info')}`
  )).join('');

  const workRows = model.worklist.map((sku) => `
    <div class="alert-row">
      <div>
        <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
        <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
      </div>
      <div class="badge-stack">
        ${skuOperationalStatus(sku)}
        ${marginBadge('WB', sku?.wb?.marginPct)}
        ${marginBadge('Ozon', sku?.ozon?.marginPct)}
      </div>
      <div class="muted small">${escapeHtml(sku.focusReasons || 'Ниже плана и отрицательная маржа')}</div>
    </div>
  `).join('');

  root.innerHTML = `
    <section class="hero-panel">
      <div class="hero-copy">
        <div class="eyebrow">ALTEA · brand pulse</div>
        <h2>Красивый дашборд бренда</h2>
        <p>Отдельный визуальный слой для общего состояния бренда: сверху pulse, ниже лидеры продаж и оборачиваемости, а внизу — красные зоны, которые нельзя потерять.</p>
        <div class="badge-stack" style="margin-top:12px">
          ${badge(`План/факт: ${model.freshness.planFactMonth || '—'}`)}
          ${badge(`Лидерборд: ${(model.freshness.contentPeriods || []).join(' / ') || '—'}`, 'info')}
          ${badge(`Новинки: ${model.freshness.launchPlanHorizon || '—'}`)}
        </div>
      </div>
      <div class="hero-grid">${heroCards}</div>
    </section>

    <div class="section-title" style="margin-top:18px">
      <div>
        <h2>Общее состояние бренда</h2>
        <p>Крупные KPI, чтобы за минуту понять, где мы стоим по Алтея.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" data-view-control>Открыть задачи</button>
        <button class="quick-chip" data-control-preset="overdue">Просрочено</button>
        <button class="quick-chip" data-view-executive>Свод руководителя</button>
      </div>
    </div>

    <div class="grid cards">${baseCards}</div>

    <div class="dashboard-grid-3" style="margin-top:14px">
      <div class="card visual-card">
        <div class="section-subhead">
          <div>
            <h3>Лидеры продаж</h3>
            <p class="small muted">Берём текущую выручку по срезу и показываем сильнейшие SKU.</p>
          </div>
          ${badge(`${fmt.int(model.leadersSales.length)} SKU`, 'ok')}
        </div>
        <div class="leader-list">${salesRows || '<div class="empty">Нет данных по продажам</div>'}</div>
      </div>

      <div class="card visual-card">
        <div class="section-subhead">
          <div>
            <h3>Лидеры по оборачиваемости</h3>
            <p class="small muted">Чем меньше дней оборота, тем быстрее крутится SKU.</p>
          </div>
          ${badge('быстрее = лучше', 'info')}
        </div>
        <div class="leader-list">${turnoverRows || '<div class="empty">Нет данных по оборачиваемости</div>'}</div>
      </div>

      <div class="card visual-card">
        <div class="section-subhead">
          <div>
            <h3>Лидеры по контенту / ROMI</h3>
            <p class="small muted">Кого уже тащит контент и где есть наглядный сигнал для масштабирования.</p>
          </div>
          ${badge('контент-потенциал', 'info')}
        </div>
        <div class="leader-list">${romiRows || '<div class="empty">Нет ROMI в текущем срезе</div>'}</div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Красные зоны</h3>
            <p class="small muted">SKU, которые уже просятся в работу из-за плана и маржи.</p>
          </div>
          ${badge(`${fmt.int(model.worklist.length)} в фокусе`, model.worklist.length ? 'danger' : 'ok')}
        </div>
        <div class="alert-stack">${workRows || '<div class="empty">Сейчас нет критичных SKU</div>'}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Операционный чек на сегодня</h3>
            <p class="small muted">Сразу видно, что показать на утреннем / weekly созвоне.</p>
          </div>
          ${badge(`${fmt.int(control.todayList.length)} в short-list`, 'warn')}
        </div>
        <div class="task-mini-grid">${control.todayList.slice(0, 8).map(renderMiniTask).join('') || '<div class="empty">Нет задач для экспресс-чека</div>'}</div>
      </div>
    </div>

    <div class="footer-note">Последняя генерация данных: ${escapeHtml(state.dashboard.generatedAt || '—')}. Этот экран теперь отвечает за визуальный pulse бренда, а не за канбан задач.</div>
  `;
}

function renderControlCenter() {
  const root = document.getElementById('view-control');
  state.controlFilters.platform = normalizeControlWorkstreamFilter(state.controlFilters.platform);
  const tasks = filteredControlTasks();
  const baseTasks = filteredControlTasks({ ignorePlatform: true });
  const selectedWorkstream = state.controlFilters.platform;
  const selectedSummary = buildControlWorkstreamSummary(baseTasks, selectedWorkstream);
  const owners = [...new Set(getAllTasks().map((task) => task.owner || 'Без owner'))].sort((a, b) => a.localeCompare(b, 'ru'));
  const ownerSuggestions = ownerOptions();
  const unassignedSkus = [...state.skus]
    .filter((sku) => !sku?.flags?.assigned)
    .sort((a, b) => (b.focusScore || 0) - (a.focusScore || 0) || monthRevenue(b) - monthRevenue(a))
    .slice(0, 8);
  const waitingDecisions = [...(state.storage.decisions || [])]
    .filter((decision) => decision.status === 'waiting_decision' || decision.status === 'new')
    .sort((a, b) => (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31'))
    .slice(0, 8);
  const workstreamSummaries = CONTROL_WORKSTREAM_FILTER_ORDER.map((key) => buildControlWorkstreamSummary(baseTasks, key));
  const sectionKeys = selectedWorkstream === 'all'
    ? CONTROL_WORKSTREAM_ORDER.filter((key) => workstreamSummaries.find((item) => item.key === key)?.tasks.length)
    : [selectedWorkstream];
  const workstreamCards = workstreamSummaries.map((summary) => renderControlWorkstreamCard(summary, selectedWorkstream)).join('');
  const board = sectionKeys.length
    ? sectionKeys.map((key) => renderControlWorkstreamSection(workstreamSummaries.find((item) => item.key === key))).join('')
    : `<div class="card" style="margin-top:14px"><div class="empty">Нет задач под текущий фильтр.</div></div>`;

  const counts = {
    active: tasks.filter(isTaskActive).length,
    overdue: tasks.filter(isTaskOverdue).length,
    noOwner: tasks.filter((task) => isTaskActive(task) && !task.owner).length,
    waiting: tasks.filter((task) => task.status === 'waiting_decision').length,
    critical: tasks.filter((task) => isTaskActive(task) && task.priority === 'critical').length,
    auto: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length
  };
  const spotlightTasks = tasks.slice(0, 4);
  const recentHistory = getRecentTaskHistory(tasks, 8);

  const assignHtml = unassignedSkus.length ? unassignedSkus.map((sku) => `
    <div class="assign-row">
      <div class="head">
        <div>
          <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
          <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
        </div>
        <div class="badge-stack">${scoreChip(sku.focusScore || 0)}${skuOperationalStatus(sku)}</div>
      </div>
      <div class="team-note">${escapeHtml(sku.focusReasons || 'Нужно просто закрепить owner и первый срок апдейта.')}</div>
      <div class="inline-form" style="margin-top:10px">
        <input class="inline-input" list="ownerOptionsList" data-owner-assign-input="${escapeHtml(sku.articleKey)}" placeholder="Кто владелец SKU">
        <input class="inline-input" data-owner-assign-role="${escapeHtml(sku.articleKey)}" placeholder="Роль / зона" value="Owner SKU">
        <button class="btn small-btn" type="button" data-save-owner="${escapeHtml(sku.articleKey)}">Закрепить</button>
      </div>
    </div>
  `).join('') : '<div class="empty">Все SKU уже закреплены</div>';

  const decisionsHtml = waitingDecisions.length ? waitingDecisions.map((item) => {
    const sku = getSku(item.articleKey);
    return `
      <div class="decision-item">
        <div class="head">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <div class="muted small">${sku ? linkToSku(sku.articleKey, sku.article || sku.articleKey) : escapeHtml(item.articleKey)}</div>
          </div>
          <div class="badge-stack">${taskStatusBadge(item)}${item.owner ? badge(item.owner, 'info') : ''}</div>
        </div>
        <div class="muted small">${escapeHtml(item.decision || 'Нужно зафиксировать решение')}</div>
        <div class="meta-line" style="margin-top:8px"><span class="muted small">Срок ${escapeHtml(item.due || '—')}</span><span class="muted small">${escapeHtml(item.createdBy || 'Команда')}</span></div>
      </div>
    `;
  }).join('') : '<div class="empty">Нет решений в ожидании</div>';
  const recentHistoryHtml = recentHistory.length
    ? recentHistory.map((item) => {
      const task = getTask(item.taskId);
      return `
        <div class="decision-item">
          <div class="head">
            <div>
              <strong>${escapeHtml(taskHeadline(task))}</strong>
              <div class="muted small">${task ? taskEntityLine(task, getSku(task.articleKey)) : escapeHtml(item.taskId)}</div>
            </div>
            <div class="badge-stack">${taskHistoryBadge(item.kind)}${item.team ? badge(item.team, 'info') : ''}</div>
          </div>
          <div class="muted small">${escapeHtml(item.text || '—')}</div>
          <div class="meta-line" style="margin-top:8px"><span class="muted small">${fmt.date(item.createdAt)}</span><span class="muted small">${escapeHtml(item.author || 'Команда')}</span></div>
        </div>
      `;
    }).join('')
    : '<div class="empty">История появится после первых апдейтов по задачам</div>';

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Контур задач по РОПам</h2>
        <p>Сверху держим общую картину по выбранной площадке, ниже работаем уже по конкретным задачам, комментариям и развилкам.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" data-control-preset="active">Активные</button>
        <button class="quick-chip" data-control-preset="overdue">Просроченные</button>
        <button class="quick-chip" data-control-preset="critical">Критичные</button>
        <button class="quick-chip" data-control-preset="no_owner">Без owner</button>
      </div>
    </div>

    <div class="kpi-strip">
      <div class="mini-kpi"><span>Активно</span><strong>${fmt.int(counts.active)}</strong></div>
      <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(counts.overdue)}</strong></div>
      <div class="mini-kpi warn"><span>Критично</span><strong>${fmt.int(counts.critical)}</strong></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(counts.noOwner)}</strong></div>
      <div class="mini-kpi"><span>Ждёт решения</span><strong>${fmt.int(counts.waiting)}</strong></div>
      <div class="mini-kpi"><span>Авто-сигналы</span><strong>${fmt.int(counts.auto)}</strong></div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(controlWorkstreamMeta(selectedSummary.key).label)}</h3>
            <p class="small muted">${escapeHtml(controlWorkstreamMeta(selectedSummary.key).description)}</p>
          </div>
          <div class="badge-stack">
            ${badge(`${fmt.int(selectedSummary.activeCount)} активн.`, selectedSummary.activeCount ? controlWorkstreamMeta(selectedSummary.key).kind : '')}
            ${selectedSummary.overdueCount ? badge(`${fmt.int(selectedSummary.overdueCount)} проср.`, 'danger') : badge('без просрочек', 'ok')}
            ${selectedSummary.waitingCount ? badge(`${fmt.int(selectedSummary.waitingCount)} ждут решения`, 'warn') : badge('решения не висят', 'ok')}
          </div>
        </div>
        <div class="task-mini-grid">
          <div class="task-mini">
            <div class="left"><strong>Ключевые owner</strong><div class="muted small">${escapeHtml(selectedSummary.ownerPreview.length ? selectedSummary.ownerPreview.join(' · ') : 'Пока без явных owner')}</div></div>
            <div class="badge-stack">${badge(`${fmt.int(selectedSummary.typeCount)} типов задач`)}</div>
          </div>
          <div class="task-mini">
            <div class="left"><strong>Фокус по контуру</strong><div class="muted small">${escapeHtml(selectedSummary.criticalCount ? 'Сначала критичные и блокирующие задачи' : 'Можно идти по плановой очереди')}</div></div>
            <div class="badge-stack">${badge(`${fmt.int(selectedSummary.criticalCount)} крит.`, selectedSummary.criticalCount ? 'danger' : 'ok')}</div>
          </div>
          <div class="task-mini">
            <div class="left"><strong>Что делать менеджеру</strong><div class="muted small">${escapeHtml(selectedSummary.waitingCount ? 'Разобрать задачи, которые зависли на согласовании' : 'Открывать задачу, обновлять шаг и фиксировать комментарий')}</div></div>
            <div class="badge-stack">${badge('drilldown → комментарий → отчёт', 'info')}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Поставить общую задачу</h3>
            <p class="small muted">Для межкомандных задач без привязки к одному SKU: weekly, запуск, маркетинг, согласование, правки.</p>
          </div>
          ${badge('общий контур', 'info')}
        </div>
        <form id="generalTaskForm" class="form-grid compact">
          <input name="title" placeholder="Что нужно сделать" required>
          <input name="entityLabel" placeholder="Проект / тема / блок" value="${selectedWorkstream !== 'all' ? controlWorkstreamMeta(selectedWorkstream).label : ''}">
          <select name="platform">
            <option value="cross" ${selectedWorkstream === 'cross' || selectedWorkstream === 'all' ? 'selected' : ''}>Общий контур</option>
            <option value="wb" ${selectedWorkstream === 'wb' ? 'selected' : ''}>РОП WB</option>
            <option value="ozon" ${selectedWorkstream === 'ozon' ? 'selected' : ''}>РОП Ozon</option>
            <option value="retail" ${selectedWorkstream === 'retail' ? 'selected' : ''}>ЯМ / Летуаль / Магнит / ЗЯ</option>
          </select>
          <select name="type">
            <option value="general">Общее</option>
            <option value="launch">Новинка / запуск</option>
            <option value="traffic">Трафик / продвижение</option>
            <option value="content">Контент / карточка</option>
            <option value="assignment">Закрепление</option>
          </select>
          <select name="priority">
            ${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${value === 'high' ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
          </select>
          <input name="owner" list="ownerOptionsList" placeholder="Кто ведёт задачу">
          <input name="due" type="date" value="${plusDays(2)}">
          <textarea name="nextAction" rows="3" placeholder="Что считаем первым шагом и как поймём, что задача сделана" required></textarea>
          <button class="btn primary" type="submit">Поставить задачу</button>
        </form>
      </div>
    </div>

    <div class="grid cards" style="margin-top:14px">${workstreamCards}</div>

    <div class="control-filters">
      <input id="controlSearchInput" placeholder="Поиск по SKU, задаче, owner, контуру…" value="${escapeHtml(state.controlFilters.search)}">
      <select id="controlPlatformFilter">
        <option value="all" ${selectedWorkstream === 'all' ? 'selected' : ''}>Все контуры</option>
        <option value="ozon" ${selectedWorkstream === 'ozon' ? 'selected' : ''}>РОП Ozon</option>
        <option value="wb" ${selectedWorkstream === 'wb' ? 'selected' : ''}>РОП WB</option>
        <option value="retail" ${selectedWorkstream === 'retail' ? 'selected' : ''}>ЯМ / Летуаль / Магнит / ЗЯ</option>
        <option value="cross" ${selectedWorkstream === 'cross' ? 'selected' : ''}>Общий контур</option>
      </select>
      <select id="controlOwnerFilter">
        <option value="all">Все owner</option>
        ${owners.map((owner) => `<option value="${escapeHtml(owner)}" ${state.controlFilters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
      </select>
      <select id="controlStatusFilter">
        <option value="active" ${state.controlFilters.status === 'active' ? 'selected' : ''}>Только активные</option>
        <option value="all" ${state.controlFilters.status === 'all' ? 'selected' : ''}>Все статусы</option>
        ${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${state.controlFilters.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
      </select>
      <select id="controlTypeFilter">
        <option value="all">Все типы</option>
        ${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}" ${state.controlFilters.type === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
      </select>
      <select id="controlHorizonFilter">
        <option value="all">Весь горизонт</option>
        <option value="overdue" ${state.controlFilters.horizon === 'overdue' ? 'selected' : ''}>Просрочено</option>
        <option value="today" ${state.controlFilters.horizon === 'today' ? 'selected' : ''}>Срок сегодня</option>
        <option value="week" ${state.controlFilters.horizon === 'week' ? 'selected' : ''}>Срок на 7 дней</option>
        <option value="no_owner" ${state.controlFilters.horizon === 'no_owner' ? 'selected' : ''}>Без owner</option>
      </select>
      <select id="controlSourceFilter">
        <option value="all">Все источники</option>
        <option value="manual" ${state.controlFilters.source === 'manual' ? 'selected' : ''}>Ручные + seed</option>
        <option value="auto" ${state.controlFilters.source === 'auto' ? 'selected' : ''}>Только авто-сигналы</option>
      </select>
    </div>

    ${board}

    <div class="team-strip">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Последние апдейты по задачам</h3>
            <p class="small muted">Это лента истории: кто обновил задачу, что поменялось и где уже есть отчёт по результату.</p>
          </div>
          ${badge(`${fmt.int(recentHistory.length)} записей`, recentHistory.length ? 'info' : 'ok')}
        </div>
        <div class="decision-list">${recentHistoryHtml}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Командный контур и закрепление</h3>
            <p class="small muted">Отсюда быстро добиваем SKU без owner и держим общий контур в одном месте.</p>
          </div>
          ${badge(state.team.mode === 'ready' ? 'Supabase ready' : state.team.mode === 'local' ? 'local' : state.team.mode, state.team.mode === 'ready' ? 'ok' : state.team.mode === 'error' ? 'danger' : 'warn')}
        </div>
        <div class="team-note">${escapeHtml(state.team.note || 'Локальный режим')} · ${escapeHtml(teamMemberLabel())}</div>
        <datalist id="ownerOptionsList">${ownerSuggestions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <div class="assign-list" style="margin-top:12px">${assignHtml}</div>
      </div>
    </div>

    <div class="check-grid" style="margin:14px 0">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Решения ждут подтверждения</h3>
            <p class="small muted">То, что руководитель или бренд-лид должны быстро зафиксировать.</p>
          </div>
          ${badge(`${fmt.int(waitingDecisions.length)} шт.`, waitingDecisions.length ? 'warn' : 'ok')}
        </div>
        <div class="decision-list">${decisionsHtml}</div>
      </div>

      <div class="card">
        <h3>Чек-лист контроля</h3>
        <div class="check-list">
          <div class="check-item"><strong>1.</strong><span>Закрыть просрочки и перенести сроки, если реально ждём другой отдел.</span></div>
          <div class="check-item"><strong>2.</strong><span>Проверить все задачи без owner и закрепить их.</span></div>
          <div class="check-item"><strong>3.</strong><span>Открывать задачу через карточку, а не только менять статус в списке.</span></div>
          <div class="check-item"><strong>4.</strong><span>При закрытии просить короткий отчёт: что сделали, какой результат, где артефакт.</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Что здесь уже контролируем</h3>
        <div class="task-mini-grid">
          ${spotlightTasks.length ? spotlightTasks.map(renderMiniTask).join('') : '<div class="empty">Нет задач для экспресс-чека</div>'}
        </div>
      </div>
    </div>
  `;

  document.getElementById('controlSearchInput').addEventListener('input', (e) => { state.controlFilters.search = e.target.value; renderControlCenter(); });
  root.querySelectorAll('[data-control-workstream]').forEach((btn) => btn.addEventListener('click', () => {
    state.controlFilters.platform = btn.dataset.controlWorkstream;
    renderControlCenter();
  }));
  document.getElementById('controlOwnerFilter').addEventListener('change', (e) => { state.controlFilters.owner = e.target.value; renderControlCenter(); });
  document.getElementById('controlStatusFilter').addEventListener('change', (e) => { state.controlFilters.status = e.target.value; renderControlCenter(); });
  document.getElementById('controlTypeFilter').addEventListener('change', (e) => { state.controlFilters.type = e.target.value; renderControlCenter(); });
  document.getElementById('controlPlatformFilter').addEventListener('change', (e) => { state.controlFilters.platform = e.target.value; renderControlCenter(); });
  document.getElementById('controlHorizonFilter').addEventListener('change', (e) => { state.controlFilters.horizon = e.target.value; renderControlCenter(); });
  document.getElementById('controlSourceFilter').addEventListener('change', (e) => { state.controlFilters.source = e.target.value; renderControlCenter(); });
  document.getElementById('generalTaskForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const task = await createManualTask({
      articleKey: '',
      entityLabel: form.get('entityLabel'),
      title: form.get('title'),
      type: form.get('type'),
      priority: form.get('priority'),
      platform: form.get('platform'),
      owner: form.get('owner'),
      due: form.get('due'),
      nextAction: form.get('nextAction')
    });
    renderControlCenter();
    if (task?.id) openTaskModal(task.id);
  });

  root.querySelectorAll('[data-save-owner]').forEach((btn) => btn.addEventListener('click', async () => {
    const articleKey = btn.dataset.saveOwner;
    const ownerInput = root.querySelector(`[data-owner-assign-input="${articleKey}"]`);
    const roleInput = root.querySelector(`[data-owner-assign-role="${articleKey}"]`);
    await upsertOwnerAssignment({
      articleKey,
      ownerName: ownerInput?.value || '',
      ownerRole: roleInput?.value || 'Owner SKU',
      note: 'Закреплено из контрольного центра'
    });
    renderControlCenter();
    if (state.activeSku === articleKey) renderSkuModal(articleKey);
    rerenderCurrentView();
  }));
}

function closeTaskModal() {
  document.getElementById('taskModal')?.classList.remove('open');
  state.activeTaskId = null;
}

function openTaskModal(taskId) {
  renderTaskModal(taskId);
}

function renderTaskModal(taskId) {
  const task = getTask(taskId);
  if (!task) return;

  state.activeTaskId = taskId;
  const sku = getSku(task.articleKey);
  const modal = ensureTaskModal();
  const body = document.getElementById('taskModalBody');
  const owners = ownerOptions();
  const history = getTaskHistory(taskId);
  const historyHtml = history.length
    ? history.map(renderTaskHistoryItem).join('')
    : `<div class="comment-item"><div class="head"><strong>Портал</strong>${taskHistoryBadge('created')}</div><div class="muted small">${fmt.date(task.createdAt)}</div><p>Задача уже есть в контуре. Дальше все апдейты и отчёты будут появляться здесь.</p></div>`;

  body.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="muted small">${escapeHtml(controlWorkstreamMeta(controlWorkstreamKey(task, sku)).label)} · ${escapeHtml(task.entityLabel || taskHeadline(task))}</div>
        <h2>${escapeHtml(taskHeadline(task))}</h2>
        <div class="badge-stack">${taskStatusBadge(task)}${taskPriorityBadge(task)}${taskTypeBadge(task)}${taskPlatformBadge(task)}${taskSourceBadge(task)}</div>
      </div>
      <div class="badge-stack">
        ${sku ? `<button class="btn ghost" type="button" data-open-sku="${escapeHtml(sku.articleKey)}">Открыть SKU</button>` : ''}
        <button class="btn ghost" type="button" data-close-task-modal>Закрыть</button>
      </div>
    </div>

    <div class="kv-3">
      <div class="card subtle">
        <h3>Контекст</h3>
        ${metricRow('Owner', escapeHtml(task.owner || 'Не назначен'))}
        ${metricRow('Срок', escapeHtml(task.due || '—'))}
        ${metricRow('Источник', escapeHtml(task.source || 'manual'))}
        ${metricRow('SKU / тема', sku ? escapeHtml(sku.article || sku.articleKey) : escapeHtml(task.entityLabel || 'Общая задача'))}
      </div>
      <div class="card subtle">
        <h3>Что делаем сейчас</h3>
        <div class="note-box">${escapeHtml(task.nextAction || 'Нужно описать следующий шаг')}</div>
        <div class="muted small" style="margin-top:10px">${escapeHtml(task.reason || 'Причина / контекст пока не заполнены')}</div>
      </div>
      <div class="card subtle">
        <h3>Как закрывать</h3>
        <div class="note-box">Маркетолог закрывает задачу не просто сменой статуса, а коротким отчётом: что сделал, какой результат получил и где лежит артефакт / ссылка.</div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Редактировать задачу</h3>
            <p class="small muted">Из карточки можно менять owner, сроки, следующий шаг, приоритет и статус.</p>
          </div>
          ${task.articleKey ? taskEntityLine(task, sku) : badge('Общая задача', 'info')}
        </div>
        <datalist id="taskOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <form id="taskEditForm" class="form-grid compact">
          <input name="title" value="${escapeHtml(task.title || '')}" required>
          <input name="entityLabel" value="${escapeHtml(task.entityLabel || '')}" placeholder="Проект / тема">
          <input name="owner" list="taskOwnerList" value="${escapeHtml(task.owner || '')}" placeholder="Кто ведёт">
          <input name="due" type="date" value="${escapeHtml(task.due || '')}">
          <select name="status">${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
          <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}" ${task.priority === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
          <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}" ${task.type === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
          <select name="platform">
            <option value="cross" ${task.platform === 'cross' ? 'selected' : ''}>Общий контур</option>
            <option value="wb" ${task.platform === 'wb' ? 'selected' : ''}>РОП WB</option>
            <option value="ozon" ${task.platform === 'ozon' ? 'selected' : ''}>РОП Ozon</option>
            <option value="retail" ${task.platform === 'retail' ? 'selected' : ''}>ЯМ / Летуаль / Магнит / ЗЯ</option>
            <option value="wb+ozon" ${task.platform === 'wb+ozon' ? 'selected' : ''}>WB + Ozon</option>
          </select>
          <textarea name="nextAction" rows="4" placeholder="Следующее действие">${escapeHtml(task.nextAction || '')}</textarea>
          <textarea name="reason" rows="4" placeholder="Контекст / почему задача возникла">${escapeHtml(task.reason || '')}</textarea>
          <button class="btn primary" type="submit">Сохранить изменения</button>
        </form>
      </div>

      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Комментарии и история</h3>
            <p class="small muted">Видно все апдейты по задаче: изменения, обсуждение и отчёты по закрытию.</p>
          </div>
          ${badge(`${fmt.int(history.length)} записей`, history.length ? 'info' : 'ok')}
        </div>
        <div class="list">${historyHtml}</div>
        <form id="taskCommentForm" class="form-grid compact" style="margin-top:12px">
          <input name="author" value="${escapeHtml(state.team.member.name || task.owner || 'Команда')}" placeholder="Кто пишет" required>
          <textarea name="text" rows="4" placeholder="Апдейт по задаче: что сделано, что мешает, что нужно от других" required></textarea>
          <button class="btn" type="submit">Добавить комментарий</button>
        </form>
      </div>
    </div>

    ${!['done', 'cancelled'].includes(task.status) ? `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Закрыть задачу с отчётом</h3>
            <p class="small muted">Когда маркетолог завершил работу, здесь фиксируется результат. Без отчёта задача не считается закрытой по смыслу.</p>
          </div>
          ${badge('обязателен короткий отчёт', 'warn')}
        </div>
        <form id="taskCloseForm" class="form-grid compact">
          <textarea name="report" rows="5" placeholder="Что сделали, какой результат получили, где лежит артефакт / ссылка" required></textarea>
          <button class="btn primary" type="submit">Закрыть задачу</button>
        </form>
      </div>
    ` : ''}
  `;

  modal.classList.add('open');

  body.querySelector('[data-close-task-modal]')?.addEventListener('click', closeTaskModal);
  body.querySelector('#taskEditForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await updateTaskRecord(taskId, {
      title: form.get('title'),
      entityLabel: form.get('entityLabel'),
      owner: form.get('owner'),
      due: form.get('due'),
      status: form.get('status'),
      priority: form.get('priority'),
      type: form.get('type'),
      platform: form.get('platform'),
      nextAction: form.get('nextAction'),
      reason: form.get('reason')
    });
    renderTaskModal(taskId);
  });

  body.querySelector('#taskCommentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createTaskHistoryEntry(taskId, 'comment', form.get('text'), {
      author: form.get('author'),
      team: teamMemberLabel()
    });
    renderTaskModal(taskId);
  });

  body.querySelector('#taskCloseForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const report = String(form.get('report') || '').trim();
    if (!report) return;
    await closeTaskWithReport(taskId, report);
    renderTaskModal(taskId);
  });
}

function filterSkuByMarket(sku) {
  if (state.filters.market === 'wb') return sku?.flags?.hasWB;
  if (state.filters.market === 'ozon') return sku?.flags?.hasOzon;
  return true;
}

function filterSkuByWorkLogic(sku) {
  if (state.filters.market === 'wb') return sku?.flags?.toWorkWB;
  if (state.filters.market === 'ozon') return sku?.flags?.toWorkOzon;
  return sku?.flags?.toWork;
}

function buildSkuRegistryTaskMap() {
  const map = new Map();
  for (const task of getAllTasks()) {
    const key = String(task?.articleKey || '').trim();
    if (!key || map.has(key)) continue;
    map.set(key, task);
  }
  return map;
}

function getFilteredSkus(taskMap = buildSkuRegistryTaskMap()) {
  const q = String(state.filters.search || '').trim().toLowerCase();
  return state.skus.filter((sku) => {
    if (!filterSkuByMarket(sku)) return false;
    const hay = [sku.article, sku.articleKey, sku.name, sku.brand, sku.category, sku.segment, ownerName(sku), sku.status, sku.focusReasons].filter(Boolean).join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (state.filters.owner !== 'all' && ownerName(sku) !== state.filters.owner) return false;
    if (state.filters.segment !== 'all' && sku.segment !== state.filters.segment) return false;
    if (state.filters.assignment === 'assigned' && !sku?.flags?.assigned) return false;
    if (state.filters.assignment === 'unassigned' && sku?.flags?.assigned) return false;
    if (state.filters.traffic === 'any' && !sku?.flags?.hasExternalTraffic) return false;
    if (state.filters.traffic === 'kz' && !sku?.flags?.hasKZ) return false;
    if (state.filters.traffic === 'vk' && !sku?.flags?.hasVK) return false;
    if (state.filters.traffic === 'none' && sku?.flags?.hasExternalTraffic) return false;

    switch (state.filters.focus) {
      case 'toWork':
        return filterSkuByWorkLogic(sku);
      case 'negativeMargin':
        return sku?.flags?.negativeMargin;
      case 'underPlan':
        return sku?.flags?.underPlan;
      case 'focus4':
        return (sku?.focusScore || 0) >= 4;
      case 'lowStock':
        return sku?.flags?.lowStock;
      case 'highReturn':
        return sku?.flags?.highReturn;
      case 'extAny':
        return sku?.flags?.hasExternalTraffic;
      case 'extKZ':
        return sku?.flags?.hasKZ;
      case 'extVK':
        return sku?.flags?.hasVK;
      case 'unassigned':
        return !sku?.flags?.assigned;
      default:
        return true;
    }
  }).sort((a, b) => {
    const aTask = taskMap.get(String(a.articleKey || '').trim()) || null;
    const bTask = taskMap.get(String(b.articleKey || '').trim()) || null;
    return Number(filterSkuByWorkLogic(b)) - Number(filterSkuByWorkLogic(a))
      || Number((b.focusScore || 0)) - Number((a.focusScore || 0))
      || Number(isTaskOverdue(bTask)) - Number(isTaskOverdue(aTask))
      || String(a.article || '').localeCompare(String(b.article || ''), 'ru');
  });
}

function renderSkuRegistry() {
  const root = document.getElementById('view-skus');
  const skuTaskMap = buildSkuRegistryTaskMap();
  const items = getFilteredSkus(skuTaskMap);
  const owners = [...new Set(state.skus.map((sku) => ownerName(sku)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const segments = [...new Set(state.skus.map((sku) => sku.segment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const assignedCount = items.filter((sku) => sku?.flags?.assigned).length;
  const unassignedCount = items.length - assignedCount;
  const kzCount = items.filter((sku) => sku?.flags?.hasKZ).length;
  const vkCount = items.filter((sku) => sku?.flags?.hasVK).length;

  const rows = items.map((sku) => {
    const task = skuTaskMap.get(String(sku.articleKey || '').trim()) || null;
    return `
    <tr>
      <td>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</td>
      <td><div><strong>${escapeHtml(sku.name || 'Без названия')}</strong></div><div class="muted small">${escapeHtml(sku.category || sku.segment || '—')}</div></td>
      <td>${skuOperationalStatus(sku)}</td>
      <td>${ownerCell(sku)}</td>
      <td>${trafficBadges(sku, 'нет')}</td>
      <td>${renderSkuTaskSummary(sku, task)}</td>
      <td>${task?.due ? escapeHtml(task.due) : '—'}</td>
    </tr>
  `;
  }).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Реестр SKU · Алтея</h2>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(items.length)} SKU`)}
        ${badge(`${fmt.int(assignedCount)} с owner`, 'ok')}
        ${badge(`${fmt.int(unassignedCount)} без owner`, unassignedCount ? 'warn' : 'ok')}
        ${badge(`🚀 КЗ ${fmt.int(kzCount)}`, kzCount ? 'info' : '')}
        ${badge(`📣 VK ${fmt.int(vkCount)}`, vkCount ? 'info' : '')}
      </div>
    </div>

    <div class="market-tabs">
      <button class="market-tab ${state.filters.market === 'all' ? 'active' : ''}" data-market-filter="all">Все площадки</button>
      <button class="market-tab ${state.filters.market === 'wb' ? 'active' : ''}" data-market-filter="wb">WB</button>
      <button class="market-tab ${state.filters.market === 'ozon' ? 'active' : ''}" data-market-filter="ozon">Ozon</button>
    </div>

    <div class="filters filters-advanced">
      <input id="skuSearchInput" placeholder="Поиск по артикулу, названию, категории, owner…" value="${escapeHtml(state.filters.search)}">
      <select id="skuOwnerFilter">
        <option value="all">Все owner</option>
        ${owners.map((owner) => `<option value="${escapeHtml(owner)}" ${state.filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
      </select>
      <select id="skuSegmentFilter">
        <option value="all">Все сегменты</option>
        ${segments.map((segment) => `<option value="${escapeHtml(segment)}" ${state.filters.segment === segment ? 'selected' : ''}>${escapeHtml(segment)}</option>`).join('')}
      </select>
      <select id="skuFocusFilter">
        <option value="all" ${state.filters.focus === 'all' ? 'selected' : ''}>Все SKU</option>
        <option value="toWork" ${state.filters.focus === 'toWork' ? 'selected' : ''}>${currentWorkLabel()}</option>
        <option value="negativeMargin" ${state.filters.focus === 'negativeMargin' ? 'selected' : ''}>Отрицательная маржа</option>
        <option value="underPlan" ${state.filters.focus === 'underPlan' ? 'selected' : ''}>Ниже плана</option>
        <option value="focus4" ${state.filters.focus === 'focus4' ? 'selected' : ''}>Фокус score ≥ 4</option>
        <option value="lowStock" ${state.filters.focus === 'lowStock' ? 'selected' : ''}>Низкий остаток</option>
        <option value="highReturn" ${state.filters.focus === 'highReturn' ? 'selected' : ''}>Высокие возвраты</option>
        <option value="extAny" ${state.filters.focus === 'extAny' ? 'selected' : ''}>Есть внешний трафик</option>
        <option value="unassigned" ${state.filters.focus === 'unassigned' ? 'selected' : ''}>Без owner</option>
      </select>
      <select id="skuTrafficFilter">
        <option value="all" ${state.filters.traffic === 'all' ? 'selected' : ''}>Весь трафик</option>
        <option value="any" ${state.filters.traffic === 'any' ? 'selected' : ''}>Есть внешний трафик</option>
        <option value="kz" ${state.filters.traffic === 'kz' ? 'selected' : ''}>🚀 Только КЗ</option>
        <option value="vk" ${state.filters.traffic === 'vk' ? 'selected' : ''}>📣 Только VK</option>
        <option value="none" ${state.filters.traffic === 'none' ? 'selected' : ''}>Без внешнего трафика</option>
      </select>
      <select id="skuAssignmentFilter">
        <option value="all" ${state.filters.assignment === 'all' ? 'selected' : ''}>Все закрепления</option>
        <option value="assigned" ${state.filters.assignment === 'assigned' ? 'selected' : ''}>Закреплённые</option>
        <option value="unassigned" ${state.filters.assignment === 'unassigned' ? 'selected' : ''}>Незакреплённые</option>
      </select>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Артикул</th>
            <th>SKU</th>
            <th>Статус</th>
            <th>Owner</th>
            <th>Внешний трафик</th>
            <th>Следующее действие</th>
            <th>Дедлайн</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="7" class="text-center muted">Ничего не найдено</td></tr>`}</tbody>
      </table>
    </div>

  `;

  document.getElementById('skuSearchInput').addEventListener('input', (e) => { state.filters.search = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuOwnerFilter').addEventListener('change', (e) => { state.filters.owner = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuSegmentFilter').addEventListener('change', (e) => { state.filters.segment = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuFocusFilter').addEventListener('change', (e) => { state.filters.focus = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuTrafficFilter').addEventListener('change', (e) => { state.filters.traffic = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuAssignmentFilter').addEventListener('change', (e) => { state.filters.assignment = e.target.value; renderSkuRegistry(); });
  root.querySelectorAll('[data-market-filter]').forEach((btn) => btn.addEventListener('click', (e) => { state.filters.market = e.currentTarget.dataset.marketFilter; renderSkuRegistry(); }));
}

function metricRow(label, value, kind = '') {
  return `<div class="metric-row"><span>${escapeHtml(label)}</span><strong class="${kind}">${value}</strong></div>`;
}

function renderSkuModal(articleKey) {
  const sku = getSku(articleKey);
  if (!sku) return;
  state.activeSku = articleKey;

  const body = document.getElementById('skuModalBody');
  const modal = document.getElementById('skuModal');
  const comments = getSkuComments(articleKey);
  const decisions = getSkuDecisions(articleKey);
  const tasks = getSkuControlTasks(articleKey);
  const activeTask = nextTaskForSku(articleKey);
  const owners = ownerOptions();

  body.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="muted small">${escapeHtml(sku.brand || 'Алтея')} · ${escapeHtml(sku.segment || sku.category || '—')}</div>
        <h2>${escapeHtml(sku.name || 'Без названия')}</h2>
        <div class="badge-stack">${linkToSku(sku.articleKey, sku.article || sku.articleKey)}${skuOperationalStatus(sku)}${scoreChip(sku.focusScore || 0)}${trafficBadges(sku, 'нет')}</div>
      </div>
      <button class="btn ghost" data-close-modal>Закрыть</button>
    </div>

    <div class="kv-3">
      <div class="card subtle">
        <h3>Результат</h3>
        ${metricRow('План Feb 26', fmt.int(sku.planFact?.planFeb26Units))}
        ${metricRow('Факт Feb 26', fmt.int(sku.planFact?.factFeb26Units))}
        ${metricRow('Выполнение', fmt.pct(sku.planFact?.completionFeb26Pct), (sku.planFact?.completionFeb26Pct || 0) < 0.8 ? 'danger-text' : '')}
        ${metricRow('WB маржа', fmt.pct(sku.wb?.marginPct), (sku.wb?.marginPct || 0) < 0 ? 'danger-text' : '')}
        ${metricRow('Ozon маржа', fmt.pct(sku.ozon?.marginPct), (sku.ozon?.marginPct || 0) < 0 ? 'danger-text' : '')}
      </div>
      <div class="card subtle">
        <h3>Почему в фокусе</h3>
        ${metricRow('Owner', escapeHtml(ownerName(sku) || 'Не закреплён'))}
        ${metricRow('WB остаток', fmt.int(sku.wb?.stock), (sku.wb?.stock || 0) <= 50 ? 'warn-text' : '')}
        ${metricRow('Ozon остаток', fmt.int(sku.ozon?.stock), (sku.ozon?.stock || 0) <= 50 ? 'warn-text' : '')}
        ${metricRow('Возвраты WB', fmt.pct(sku.returns?.wbPct), (sku.returns?.wbPct || 0) >= 0.05 ? 'warn-text' : '')}
        ${metricRow('Возвраты Ozon', fmt.pct(sku.returns?.ozonPct), (sku.returns?.ozonPct || 0) >= 0.05 ? 'warn-text' : '')}
        <div class="note-box">${escapeHtml(sku.focusReasons || 'Нет явной причины в текущем срезе.')}</div>
      </div>
      <div class="card subtle">
        <h3>Что делаем</h3>
        <div class="badge-stack">${activeTask ? taskPriorityBadge(activeTask) : ''}${activeTask ? taskStatusBadge(activeTask) : ''}${activeTask ? taskTypeBadge(activeTask) : ''}</div>
        <div class="note-box">${escapeHtml(activeTask?.nextAction || 'Активной задачи пока нет.')}</div>
        <div class="metric-row"><span>Следующий срок</span><strong>${escapeHtml(activeTask?.due || '—')}</strong></div>
        <div class="metric-row"><span>Внешний трафик</span><strong>${sku?.flags?.hasExternalTraffic ? 'Есть' : 'Нет'}</strong></div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Задачи по SKU</h3>
        <div class="list">${tasks.length ? tasks.map(renderTaskCard).join('') : '<div class="empty">По этому SKU задач ещё нет</div>'}</div>
      </div>
      <div class="card">
        <h3>Добавить задачу</h3>
        <form id="manualTaskForm" class="form-grid compact">
          <input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">
          <input name="title" placeholder="Что делаем" required>
          <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select>
          <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}">${escapeHtml(meta.label)}</option>`).join('')}</select>
          <select name="platform">
            <option value="cross">Общий контур</option>
            <option value="wb">РОП WB</option>
            <option value="ozon">РОП Ozon</option>
            <option value="retail">ЯМ / Летуаль / Магнит / ЗЯ</option>
          </select>
          <input name="owner" placeholder="Owner" value="${escapeHtml(ownerName(sku) || '')}">
          <input name="due" type="date" value="${plusDays(3)}">
          <textarea name="nextAction" rows="3" placeholder="Следующее действие и что считаем результатом"></textarea>
          <button class="btn primary" type="submit">Добавить задачу</button>
        </form>
      </div>
    </div>

    <div class="modal-grid-3">
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Owner и зона ответственности</h3>
            <p class="small muted">Закрепление по SKU и короткая пометка, если owner меняется.</p>
          </div>
          <span class="owner-badge">${escapeHtml(ownerName(sku) || 'Не закреплён')}</span>
        </div>
        <datalist id="skuOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <form id="ownerForm" class="form-grid compact">
          <input name="ownerName" list="skuOwnerList" placeholder="Кто owner" value="${escapeHtml(ownerName(sku) || '')}" required>
          <input name="ownerRole" placeholder="Роль / зона" value="${escapeHtml(sku?.owner?.registryStatus || 'Owner SKU')}">
          <textarea name="note" rows="3" placeholder="Что важно по закреплению / передаче SKU"></textarea>
          <button class="btn" type="submit">Сохранить owner</button>
        </form>
        <div class="team-note">Командный режим: ${escapeHtml(state.team.note || 'Локальный режим')}</div>
      </div>
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Журнал решений</h3>
            <p class="small muted">То, что уже согласовали или ждёт подтверждения руководителя.</p>
          </div>
          ${badge(`${fmt.int(decisions.length)} записей`, decisions.length ? 'info' : '')}
        </div>
        <div class="small-stack">${decisions.length ? decisions.map((item) => `
          <div class="decision-item">
            <div class="head">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="badge-stack">${taskStatusBadge(item)}${item.owner ? badge(item.owner, 'info') : ''}</div>
            </div>
            <div class="muted small">${escapeHtml(item.decision || 'Решение не заполнено')}</div>
            <div class="meta-line" style="margin-top:8px"><span class="muted small">Срок ${escapeHtml(item.due || '—')}</span><span class="muted small">${escapeHtml(item.createdBy || 'Команда')}</span></div>
          </div>
        `).join('') : '<div class="empty">Решений пока нет</div>'}</div>
      </div>
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Добавить решение</h3>
            <p class="small muted">Фиксируем не обсуждение, а итог: что решили, кто owner, какой срок.</p>
          </div>
        </div>
        <form id="decisionForm" class="form-grid compact">
          <input name="title" placeholder="Короткий заголовок решения" required>
          <input name="owner" placeholder="Кто ведёт решение" value="${escapeHtml(ownerName(sku) || '')}">
          <select name="status">${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${value === 'waiting_decision' ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
          <input name="due" type="date" value="${plusDays(3)}">
          <textarea name="decision" rows="4" placeholder="Что именно решили / что ещё нужно подтвердить" required></textarea>
          <button class="btn" type="submit">Сохранить решение</button>
        </form>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Комментарии и апдейты</h3>
        <div class="list">${comments.length ? comments.map((comment) => `
          <div class="comment-item">
            <div class="head"><strong>${escapeHtml(comment.author || 'Команда')}</strong><div class="badge-stack">${commentTypeChip(comment.type)}${badge(comment.team || 'Команда')}</div></div>
            <div class="muted small">${fmt.date(comment.createdAt)}</div>
            <p>${escapeHtml(comment.text)}</p>
          </div>
        `).join('') : '<div class="empty">Комментариев пока нет</div>'}</div>
      </div>
      <div class="card">
        <h3>Добавить апдейт</h3>
        <form id="commentForm" class="form-grid compact">
          <input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">
          <input name="author" placeholder="Кто пишет" value="${escapeHtml(state.team.member.name || ownerName(sku) || 'Команда')}" required>
          <select name="type">
            <option value="signal">Сигнал</option>
            <option value="risk">Риск</option>
            <option value="focus">Фокус</option>
            <option value="idea">Идея</option>
          </select>
          <textarea name="text" rows="5" placeholder="Коротко: что случилось, что делаем, что нужно от других" required></textarea>
          <button class="btn" type="submit">Сохранить апдейт</button>
        </form>
      </div>
    </div>
  `;

  modal.classList.add('open');

  body.querySelector('#manualTaskForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createManualTask({
      articleKey,
      title: form.get('title'),
      type: form.get('type'),
      priority: form.get('priority'),
      platform: form.get('platform'),
      owner: form.get('owner'),
      due: form.get('due'),
      nextAction: form.get('nextAction')
    });
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#ownerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await upsertOwnerAssignment({
      articleKey,
      ownerName: form.get('ownerName'),
      ownerRole: form.get('ownerRole'),
      note: form.get('note')
    });
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#decisionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createDecision({
      articleKey,
      title: form.get('title'),
      decision: form.get('decision'),
      owner: form.get('owner'),
      status: form.get('status'),
      due: form.get('due')
    });
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#commentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createComment({
      articleKey,
      author: form.get('author'),
      team: teamMemberLabel(),
      type: form.get('type'),
      text: form.get('text')
    });
    renderSkuModal(articleKey);
  });
}

function deriveLaunchStatus(sku) {
  if (!ownerName(sku)) return 'Нужен owner';
  if (sku?.flags?.negativeMargin || sku?.flags?.toWork) return 'Нужна корректировка экономики';
  if (totalSkuStock(sku) <= 0) return 'Ждём поставку';
  if (!sku?.flags?.hasExternalTraffic) return 'Готовим трафик';
  return 'В работе';
}

function deriveLaunchPhase(sku) {
  if (!ownerName(sku)) return 'owner';
  if (totalSkuStock(sku) <= 0) return 'supply';
  if (!sku?.flags?.hasExternalTraffic) return 'content';
  if (sku?.flags?.negativeMargin || sku?.flags?.toWork) return 'economy';
  return 'scale';
}

function launchPhaseMeta(phase) {
  const map = {
    owner: { label: 'Нужен owner', tone: 'warn' },
    supply: { label: 'Поставка', tone: 'warn' },
    content: { label: 'Контент / трафик', tone: 'info' },
    economy: { label: 'Экономика', tone: 'danger' },
    scale: { label: 'Масштабирование', tone: 'ok' }
  };
  return map[phase] || map.content;
}

function normalizeLaunchItem(item = {}) {
  return {
    id: item.id || stableId('launch', item.articleKey || item.name || item.title || ''),
    articleKey: item.articleKey || '',
    name: item.name || item.title || 'Новинка',
    reportGroup: item.reportGroup || item.segment || 'Продукт',
    subCategory: item.subCategory || item.category || '—',
    launchMonth: item.launchMonth || state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус',
    status: item.status || 'Статус не указан',
    phase: item.phase || 'content',
    owner: item.owner || '',
    production: item.production || '',
    plannedRevenue: numberOrZero(item.plannedRevenue),
    targetCost: numberOrZero(item.targetCost),
    externalTraffic: item.externalTraffic || 'без внешнего трафика',
    activeTasks: numberOrZero(item.activeTasks),
    blockers: Array.isArray(item.blockers) ? item.blockers.filter(Boolean) : []
  };
}

function buildLaunchItemsFromSkus() {
  return state.skus
    .filter((sku) => String(sku?.segment || '').toUpperCase() === 'GROWTH' || String(sku?.status || '').toLowerCase().includes('нов'))
    .map((sku) => {
      const phase = deriveLaunchPhase(sku);
      const blockers = [];
      if (!ownerName(sku)) blockers.push('не назначен owner');
      if (totalSkuStock(sku) <= 0) blockers.push('нет остатка');
      if (!sku?.flags?.hasExternalTraffic) blockers.push('нет внешнего трафика');
      if (sku?.flags?.negativeMargin) blockers.push('маржа в риске');
      if (sku?.flags?.highReturn) blockers.push('высокие возвраты');
      return normalizeLaunchItem({
        articleKey: sku.articleKey,
        name: sku.name || sku.article || sku.articleKey,
        reportGroup: sku.segment || 'GROWTH',
        subCategory: sku.category || '—',
        launchMonth: state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус',
        status: deriveLaunchStatus(sku),
        phase,
        owner: ownerName(sku),
        production: totalSkuStock(sku) > 0 ? `Остаток ${fmt.int(totalSkuStock(sku))}` : 'Без остатка',
        plannedRevenue: monthRevenue(sku),
        targetCost: 0,
        externalTraffic: externalTrafficLabel(sku),
        activeTasks: getSkuControlTasks(sku.articleKey).filter(isTaskActive).length,
        blockers
      });
    })
    .sort((a, b) => b.activeTasks - a.activeTasks || b.plannedRevenue - a.plannedRevenue || a.name.localeCompare(b.name, 'ru'));
}

function getLaunchItems() {
  const source = Array.isArray(state.launches) && state.launches.length ? state.launches.map(normalizeLaunchItem) : buildLaunchItemsFromSkus();
  return source.slice(0, 24);
}

function renderLaunches() {
  const root = document.getElementById('view-launches');
  const items = getLaunchItems();
  const rows = items.map((item) => `
    <div class="list-item">
      <div class="head">
        <div>
          <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || 'Новинка') : escapeHtml(item.name || 'Новинка')}</strong>
          <div class="muted small">${escapeHtml(item.reportGroup || '—')} · ${escapeHtml(item.subCategory || '—')}</div>
        </div>
        ${badge(item.launchMonth || '—', 'info')}
      </div>
      <div class="badge-stack">${badge(launchPhaseMeta(item.phase).label, launchPhaseMeta(item.phase).tone)}${item.production ? badge(item.production) : ''}${item.owner ? badge(item.owner, 'info') : badge('Без owner', 'warn')}</div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(item.status || 'Статус не указан')}</div>
      <div class="muted small" style="margin-top:8px">План выручки: ${fmt.money(item.plannedRevenue)} · Трафик: ${escapeHtml(item.externalTraffic || '—')}</div>
      <div class="badge-stack" style="margin-top:8px">${badge(`${fmt.int(item.activeTasks || 0)} активн. задач`, item.activeTasks ? 'warn' : 'ok')}${(item.blockers || []).slice(0, 2).map((text) => badge(text, 'warn')).join('')}</div>
    </div>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Новинки и pipeline</h2>
        <p>Собрала product-layer по SKU роста и новинкам: карточка, owner, экономика, трафик и текущие блокеры в одном месте.</p>
      </div>
      <div class="badge-stack">${badge(`${fmt.int(items.length)} SKU в запуске`, items.length ? 'info' : 'warn')}${badge(`${fmt.int(items.filter((item) => !item.owner).length)} без owner`, items.filter((item) => !item.owner).length ? 'warn' : 'ok')}${badge(`${fmt.int(items.filter((item) => item.activeTasks).length)} с активными задачами`, items.filter((item) => item.activeTasks).length ? 'warn' : 'ok')}</div>
    </div>
    <div class="card">
      <div class="pipeline-strip">
        <span>Owner</span><span>Поставка</span><span>Контент</span><span>Трафик</span><span>Экономика</span><span>Масштаб</span>
      </div>
      <div class="list" style="margin-top:14px">${rows || '<div class="empty">Нет новинок в текущем срезе</div>'}</div>
    </div>
  `;
}

function renderLaunchControl() {
  const root = document.getElementById('view-launch-control');
  const items = getLaunchItems();
  const phaseOrder = ['owner', 'supply', 'content', 'economy', 'scale'];
  const groups = phaseOrder
    .map((key) => ({ key, meta: launchPhaseMeta(key), items: items.filter((item) => item.phase === key) }))
    .filter((group) => group.items.length);

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Запуск новинок</h2>
        <p>Отдельный экран запуска: сверху видно, где именно сейчас блокируется запуск, а ниже можно пройтись по SKU как по чек-листу.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(items.length)} в запуске`, items.length ? 'info' : 'warn')}
        ${badge(`${fmt.int(items.filter((item) => item.phase === 'owner').length)} ждут owner`, items.filter((item) => item.phase === 'owner').length ? 'warn' : 'ok')}
        ${badge(`${fmt.int(items.filter((item) => item.phase === 'content').length)} ждут трафик`, items.filter((item) => item.phase === 'content').length ? 'warn' : 'ok')}
      </div>
    </div>

    <div class="grid cards" style="margin-top:14px">
      ${groups.map((group) => `
        <div class="card kpi">
          <div class="label">${escapeHtml(group.meta.label)}</div>
          <div class="value">${fmt.int(group.items.length)}</div>
          <div class="hint">SKU в этой фазе запуска</div>
          <div class="badge-stack" style="margin-top:10px">${group.items.slice(0, 3).map((item) => badge(item.owner || item.name, item.owner ? '' : 'warn')).join('')}</div>
        </div>
      `).join('') || '<div class="card"><div class="empty">Нет SKU в запуске</div></div>'}
    </div>

    ${groups.map((group) => `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(group.meta.label)}</h3>
            <p class="small muted">Что надо закрыть на этом этапе, чтобы SKU не зависал между отделами.</p>
          </div>
          ${badge(`${fmt.int(group.items.length)} SKU`, group.meta.tone)}
        </div>
        <div class="list">
          ${group.items.map((item) => `
            <div class="list-item">
              <div class="head">
                <div>
                  <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || 'Новинка') : escapeHtml(item.name || 'Новинка')}</strong>
                  <div class="muted small">${escapeHtml(item.subCategory || '—')}</div>
                </div>
                <div class="badge-stack">${item.owner ? badge(item.owner, 'info') : badge('Без owner', 'warn')}${badge(`${fmt.int(item.activeTasks || 0)} задач`, item.activeTasks ? 'warn' : 'ok')}</div>
              </div>
              <div class="check-list">
                <div class="check-item"><strong>1.</strong><span>${ownerName(getSku(item.articleKey)) ? 'Owner назначен' : 'Назначить owner и зону ответственности'}</span></div>
                <div class="check-item"><strong>2.</strong><span>${totalSkuStock(getSku(item.articleKey)) > 0 ? `Остаток есть: ${fmt.int(totalSkuStock(getSku(item.articleKey)))}` : 'Проверить поставку и доступность SKU'}</span></div>
                <div class="check-item"><strong>3.</strong><span>${getSku(item.articleKey)?.flags?.hasExternalTraffic ? `Трафик есть: ${escapeHtml(item.externalTraffic)}` : 'Подготовить запуск трафика / контента'}</span></div>
                <div class="check-item"><strong>4.</strong><span>${(item.blockers || []).length ? `Блокеры: ${escapeHtml(item.blockers.join(', '))}` : 'Критичных блокеров не видно'}</span></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

function renderMeetings() {
  const root = document.getElementById('view-meetings');
  const cards = (state.meetings || []).map((meeting) => {
    const level = String(meeting.id || '').startsWith('weekly') ? 'Weekly' : String(meeting.id || '').startsWith('monthly') ? 'Monthly' : 'PMR';
    const outputs = Array.isArray(meeting.outputs) ? meeting.outputs.join(' · ') : (meeting.outputs || '—');
    const participants = Array.isArray(meeting.participants) ? meeting.participants.join(', ') : '—';
    return `
      <div class="card meeting-card">
        <div class="head">
          <div>
            <h3>${escapeHtml(meeting.title || 'Встреча')}</h3>
            <div class="muted small">${escapeHtml(meeting.cadence || '—')} · ${escapeHtml(meeting.duration || '—')}</div>
          </div>
          ${badge(level)}
        </div>
        <p>${escapeHtml(meeting.question || '—')}</p>
        <div class="muted small"><strong>Участники:</strong> ${escapeHtml(participants)}</div>
        <div class="muted small" style="margin-top:8px"><strong>Выход:</strong> ${escapeHtml(outputs)}</div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Ритм работы</h2>
        <p>Weekly / Monthly / PMR должны рождать задачи с owner и сроком — без этого портал не будет живым.</p>
      </div>
    </div>
    <div class="grid cards-2">${cards || '<div class="empty">Нет карты встреч</div>'}</div>
  `;
}


function getDocumentGroupsFiltered() {
  const search = String(state.docFilters.search || '').trim().toLowerCase();
  return (state.documents?.groups || [])
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => {
        const hay = [group.title, item.title, item.description, item.type, item.filename].filter(Boolean).join(' ').toLowerCase();
        if (state.docFilters.group !== 'all' && group.title !== state.docFilters.group) return false;
        if (search && !hay.includes(search)) return false;
        return true;
      })
    }))
    .filter((group) => group.items.length);
}

function renderDocuments() {
  const root = document.getElementById('view-documents');
  const groups = state.documents?.groups || [];
  const filteredGroups = getDocumentGroupsFiltered();
  const totalDocs = groups.reduce((acc, group) => acc + (group.items || []).length, 0);
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Центр документов</h2>
        <p>Портал должен быть порталом: ключевые файлы вынесены кнопками, чтобы команда не искала их по чатам и почте.</p>
      </div>
      <div class="badge-stack">${badge(`${fmt.int(totalDocs)} файлов`, 'ok')}${badge('кнопки → документы', 'info')}</div>
    </div>

    <div class="banner">
      <div>📎</div>
      <div><strong>Сейчас документы лежат прямо в папке portal / library.</strong> Для боевого публичного домена лучше перевести эти ссылки на Google Drive / SharePoint с доступом по ролям, чтобы не делать рабочие xlsx публичными.</div>
    </div>

    <div class="filters docs-filters">
      <input id="docSearchInput" placeholder="Поиск по названию документа, назначению или типу…" value="${escapeHtml(state.docFilters.search)}">
      <select id="docGroupFilter">
        <option value="all">Все группы</option>
        ${groups.map((group) => `<option value="${escapeHtml(group.title)}" ${state.docFilters.group === group.title ? 'selected' : ''}>${escapeHtml(group.title)}</option>`).join('')}
      </select>
    </div>

    <div class="doc-groups">
      ${filteredGroups.map((group) => `
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>${escapeHtml(group.title)}</h3>
              <p class="small muted">Кнопки открывают локальные demo-файлы или могут быть заменены на рабочие ссылки.</p>
            </div>
            ${badge(`${fmt.int(group.items.length)} шт.`)}
          </div>
          <div class="doc-grid">
            ${group.items.map((item) => `
              <a class="doc-card" href="${escapeHtml(item.href)}" target="_blank" rel="noopener">
                <div class="doc-top"><span class="doc-type">${escapeHtml(item.type)}</span><span class="muted small">${escapeHtml(String(item.sizeMb || '0'))} MB</span></div>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.description || 'Рабочий файл')}</p>
                <span class="doc-action">Открыть файл →</span>
              </a>
            `).join('')}
          </div>
        </div>
      `).join('') || '<div class="empty">Ничего не найдено по фильтрам документов.</div>'}
    </div>
  `;

  document.getElementById('docSearchInput').addEventListener('input', (event) => {
    state.docFilters.search = event.target.value;
    renderDocuments();
  });
  document.getElementById('docGroupFilter').addEventListener('change', (event) => {
    state.docFilters.group = event.target.value;
    renderDocuments();
  });
}

function repricerModeMatches(row, platform, mode) {
  const wbChanged = Math.abs(numberOrZero(row?.wb?.recPrice) - numberOrZero(row?.wb?.currentPrice)) >= 1;
  const ozonChanged = Math.abs(numberOrZero(row?.ozon?.recPrice) - numberOrZero(row?.ozon?.currentPrice)) >= 1;
  const wbBelow = numberOrZero(row?.wb?.currentPrice) > 0 && numberOrZero(row?.wb?.minPrice) > 0 && numberOrZero(row?.wb?.currentPrice) < numberOrZero(row?.wb?.minPrice);
  const ozonBelow = numberOrZero(row?.ozon?.currentPrice) > 0 && numberOrZero(row?.ozon?.minPrice) > 0 && numberOrZero(row?.ozon?.currentPrice) < numberOrZero(row?.ozon?.minPrice);
  const wbMarginRisk = row?.wb?.marginNoAdsCurrentPct != null && row?.wb?.marginNoAdsMinPct != null && numberOrZero(row?.wb?.marginNoAdsCurrentPct) < numberOrZero(row?.wb?.marginNoAdsMinPct);
  const ozonMarginRisk = row?.ozon?.marginNoAdsCurrentPct != null && row?.ozon?.marginNoAdsMinPct != null && numberOrZero(row?.ozon?.marginNoAdsCurrentPct) < numberOrZero(row?.ozon?.marginNoAdsMinPct);
  const byPlatform = {
    wb: { changed: wbChanged, below: wbBelow, margin: wbMarginRisk },
    ozon: { changed: ozonChanged, below: ozonBelow, margin: ozonMarginRisk },
    all: { changed: wbChanged || ozonChanged, below: wbBelow || ozonBelow, margin: wbMarginRisk || ozonMarginRisk }
  };
  if (mode === 'all') return true;
  if (mode === 'changes') return byPlatform[platform || 'all'].changed;
  if (mode === 'below_min') return byPlatform[platform || 'all'].below;
  if (mode === 'margin_risk') return byPlatform[platform || 'all'].margin;
  return true;
}

function getFilteredRepricerRows() {
  const search = String(state.repricerFilters.search || '').trim().toLowerCase();
  const platform = state.repricerFilters.platform || 'all';
  const mode = state.repricerFilters.mode || 'changes';
  return (state.repricer?.rows || []).filter((row) => {
    const hay = [row.article, row.articleKey, row.name, row.legalEntity, row.status, row.tag, row?.wb?.strategy, row?.ozon?.strategy].filter(Boolean).join(' ').toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (platform === 'wb' && numberOrZero(row?.wb?.currentPrice) <= 0) return false;
    if (platform === 'ozon' && numberOrZero(row?.ozon?.currentPrice) <= 0) return false;
    if (!repricerModeMatches(row, platform, mode)) return false;
    return true;
  });
}

function renderRepricerSide(title, side, sideKey) {
  if (!side || (!side.currentPrice && !side.recPrice && !side.strategy)) {
    return `<div class="repricer-side"><div class="repricer-side-head">${escapeHtml(title)}</div><div class="muted small">Нет данных по площадке.</div></div>`;
  }
  const changed = Math.abs(numberOrZero(side.recPrice) - numberOrZero(side.currentPrice)) >= 1;
  const belowMin = numberOrZero(side.currentPrice) > 0 && numberOrZero(side.minPrice) > 0 && numberOrZero(side.currentPrice) < numberOrZero(side.minPrice);
  const marginRisk = side.marginNoAdsCurrentPct != null && side.marginNoAdsMinPct != null && numberOrZero(side.marginNoAdsCurrentPct) < numberOrZero(side.marginNoAdsMinPct);
  return `
    <div class="repricer-side ${changed ? 'changed' : ''}">
      <div class="repricer-side-head">${escapeHtml(title)} ${changed ? '<span class="chip info">есть изменение</span>' : ''}</div>
      <div class="repricer-prices">
        <div><span>Текущая</span><strong>${fmt.money(side.currentPrice)}</strong></div>
        <div><span>Реком.</span><strong>${fmt.money(side.recPrice)}</strong></div>
        <div><span>Δ</span><strong>${side.changePct == null ? '—' : fmt.pct(side.changePct)}</strong></div>
      </div>
      <div class="badge-stack" style="margin-top:8px">
        ${badge(`min ${fmt.money(side.minPrice)}`, belowMin ? 'danger' : '')}
        ${badge(`base ${fmt.money(side.basePrice)}`)}
        ${side.newMarginPct == null ? '' : badge(`нов. маржа ${fmt.pct(side.newMarginPct)}`, numberOrZero(side.newMarginPct) < 0 ? 'danger' : 'ok')}
        ${marginRisk ? badge('маржа без рекламы ниже порога', 'warn') : ''}
      </div>
      <div class="muted small" style="margin-top:8px"><strong>${escapeHtml(side.strategy || 'Стратегия не определена')}</strong></div>
      <div class="muted small" style="margin-top:6px">${escapeHtml(side.reason || 'Причина не указана')}</div>
    </div>
  `;
}

function renderRepricer() {
  const root = document.getElementById('view-repricer');
  const summary = state.repricer?.summary || {};
  const rows = getFilteredRepricerRows();
  const cards = [
    { label: 'SKU в модели', value: summary.skuCount, hint: 'Алтея внутри актуального xlsx-репрайсера.' },
    { label: 'Изменения WB', value: summary.wbChangeCount, hint: 'SKU, где WB рекомендует сдвиг цены.' },
    { label: 'Изменения Ozon', value: summary.ozonChangeCount, hint: 'SKU, где Ozon рекомендует сдвиг цены.' },
    { label: 'Ниже min price', value: numberOrZero(summary.wbBelowMinCount) + numberOrZero(summary.ozonBelowMinCount), hint: 'Нужен приоритетный разбор min price.' },
    { label: 'Риск маржи', value: numberOrZero(summary.wbMarginRiskCount) + numberOrZero(summary.ozonMarginRiskCount), hint: 'Маржа без рекламы ниже порога.' },
    { label: 'Выравнивание цен MP', value: numberOrZero(summary.wbEqualizeCount) + numberOrZero(summary.ozonEqualizeCount), hint: 'Сработала логика follow / equalize между MP.' }
  ].map((card) => `
    <div class="card kpi control-card">
      <div class="label">${escapeHtml(card.label)}</div>
      <div class="value">${fmt.int(card.value)}</div>
      <div class="hint">${escapeHtml(card.hint)}</div>
    </div>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Репрайсер</h2>
        <p>Интегрировала Excel-репрайсер в портал как понятную витрину: здесь видно рекомендации по ценам, стратегии и причины без ковыряния в формулах.</p>
      </div>
      <div class="quick-actions">
        <a class="quick-chip anchor-chip" href="library/repricer_2026_03_27.xlsx" target="_blank" rel="noopener">Скачать текущий xlsx</a>
        <a class="quick-chip anchor-chip" href="library/repricer_2026_03_20.xlsx" target="_blank" rel="noopener">Открыть прошлую версию</a>
      </div>
    </div>

    <div class="grid cards">${cards}</div>

    <div class="filters repricer-filters" style="margin-top:14px">
      <input id="repricerSearchInput" placeholder="Поиск по артикулу, названию, стратегии…" value="${escapeHtml(state.repricerFilters.search)}">
      <select id="repricerPlatformFilter">
        <option value="all" ${state.repricerFilters.platform === 'all' ? 'selected' : ''}>WB + Ozon</option>
        <option value="wb" ${state.repricerFilters.platform === 'wb' ? 'selected' : ''}>Только WB</option>
        <option value="ozon" ${state.repricerFilters.platform === 'ozon' ? 'selected' : ''}>Только Ozon</option>
      </select>
      <select id="repricerModeFilter">
        <option value="changes" ${state.repricerFilters.mode === 'changes' ? 'selected' : ''}>Только с изменением цены</option>
        <option value="below_min" ${state.repricerFilters.mode === 'below_min' ? 'selected' : ''}>Ниже min price</option>
        <option value="margin_risk" ${state.repricerFilters.mode === 'margin_risk' ? 'selected' : ''}>Риск маржи без рекламы</option>
        <option value="all" ${state.repricerFilters.mode === 'all' ? 'selected' : ''}>Все SKU в модели</option>
      </select>
    </div>

    <div class="repricer-stack">
      ${rows.map((row) => `
        <div class="card repricer-card">
          <div class="head">
            <div>
              <strong>${linkToSku(row.articleKey, row.article || row.articleKey)}</strong>
              <div class="muted small">${escapeHtml(row.name || 'Без названия')} · ${escapeHtml(row.legalEntity || '—')}</div>
            </div>
            <div class="badge-stack">${badge(row.status || '—')}${row.tag ? badge(row.tag, 'info') : ''}</div>
          </div>
          <div class="repricer-side-grid ${state.repricerFilters.platform !== 'all' ? 'single' : ''}">
            ${state.repricerFilters.platform !== 'ozon' ? renderRepricerSide('WB', row.wb, 'wb') : ''}
            ${state.repricerFilters.platform !== 'wb' ? renderRepricerSide('Ozon', row.ozon, 'ozon') : ''}
          </div>
        </div>
      `).join('') || '<div class="empty">По выбранным фильтрам репрайсер ничего не показал.</div>'}
    </div>
  `;

  document.getElementById('repricerSearchInput').addEventListener('input', (event) => {
    state.repricerFilters.search = event.target.value;
    renderRepricer();
  });
  document.getElementById('repricerPlatformFilter').addEventListener('change', (event) => {
    state.repricerFilters.platform = event.target.value;
    renderRepricer();
  });
  document.getElementById('repricerModeFilter').addEventListener('change', (event) => {
    state.repricerFilters.mode = event.target.value;
    renderRepricer();
  });
}

function getOrderCalcBase() {
  const sku = getSku(state.orderCalc.articleKey || state.skus[0]?.articleKey);
  if (!sku) return null;
  const scope = state.orderCalc.scope || 'all';
  const wbStock = numberOrZero(sku?.wb?.stock);
  const ozonStock = numberOrZero(sku?.ozon?.stockProducts ?? sku?.ozon?.stock);
  const autoInTransit = numberOrZero(sku?.ozon?.stockInTransit) + numberOrZero(sku?.ozon?.stockInSupplyRequest);
  const availableNow = scope === 'wb' ? wbStock : scope === 'ozon' ? ozonStock : wbStock + ozonStock;
  const ordersDaily = numberOrZero(sku?.orders?.units) / 27;
  const planDaily = Math.max(numberOrZero(sku?.planFact?.planApr26Units) / 30, numberOrZero(sku?.planFact?.planMar26Units) / 31);
  const factDaily = numberOrZero(sku?.planFact?.factFeb26Units) / 29;
  let dailySales = Math.max(ordersDaily, planDaily, factDaily);
  if (state.orderCalc.salesSource === 'orders') dailySales = ordersDaily;
  if (state.orderCalc.salesSource === 'plan') dailySales = Math.max(planDaily, factDaily);
  if (state.orderCalc.salesSource === 'manual') dailySales = numberOrZero(state.orderCalc.manualDailySales);

  const daysToNextReceipt = numberOrZero(state.orderCalc.daysToNextReceipt) || numberOrZero(sku?.leadTimeDays) || 30;
  const targetCoverAfter = numberOrZero(state.orderCalc.targetCoverAfter) || 30;
  const safetyDays = numberOrZero(state.orderCalc.safetyDays) || 7;
  const inbound = state.orderCalc.inboundManual === '' ? autoInTransit : numberOrZero(state.orderCalc.inboundManual);
  const totalHorizon = daysToNextReceipt + targetCoverAfter + safetyDays;
  const demandUnits = dailySales * totalHorizon;
  const rawOrderQty = Math.max(0, demandUnits - availableNow - inbound);
  const moq = Math.max(0, numberOrZero(state.orderCalc.moq));
  const packSize = Math.max(1, numberOrZero(state.orderCalc.packSize));
  let finalQty = rawOrderQty;
  if (finalQty > 0 && moq > 0) finalQty = Math.max(finalQty, moq);
  if (finalQty > 0) finalQty = Math.ceil(finalQty / packSize) * packSize;
  const coverageNowDays = dailySales > 0 ? availableNow / dailySales : null;
  const stockoutRisk = coverageNowDays != null && coverageNowDays < daysToNextReceipt;
  const summaryText = `${sku.article || sku.articleKey}: при скорости ${fmt.num(dailySales, 1)} шт./день, горизонте ${fmt.int(totalHorizon)} дн., наличии ${fmt.int(availableNow)} шт. и входящем запасе ${fmt.int(inbound)} шт. рекомендованный заказ = ${fmt.int(finalQty)} шт.`;
  return {
    sku,
    scope,
    availableNow,
    wbStock,
    ozonStock,
    autoInTransit,
    inbound,
    dailySales,
    ordersDaily,
    planDaily,
    factDaily,
    daysToNextReceipt,
    targetCoverAfter,
    safetyDays,
    totalHorizon,
    demandUnits,
    rawOrderQty,
    finalQty,
    coverageNowDays,
    stockoutRisk,
    summaryText
  };
}

function renderOrderCalculator() {
  const root = document.getElementById('view-order');
  if (!root) return;
  injectOrderProcurementStyles();
  const renderToken = ++ORDER_PROCUREMENT_RUNTIME.renderToken;

  if (orderProcurementHasReadyData()) {
    try {
      orderProcurementRenderInto(root);
    } catch (error) {
      console.error('[order-procurement] sync render', error);
    }
  } else {
    root.innerHTML = renderOrderProcurementLoading();
  }

  const platform = ensureOrderProcurementState().platform;
  ensureOrderProcurementSources(platform)
    .then(() => {
      if (renderToken !== ORDER_PROCUREMENT_RUNTIME.renderToken) return;
      orderProcurementRenderInto(root);
    })
    .catch((error) => {
      if (renderToken !== ORDER_PROCUREMENT_RUNTIME.renderToken) return;
      console.error('[order-procurement] render', error);
      root.innerHTML = renderOrderProcurementError();
    });
}

const ORDER_PROCUREMENT_VERSION = '20260421d';
const ORDER_PROCUREMENT_STYLE_ID = `altea-order-procurement-${ORDER_PROCUREMENT_VERSION}`;
const ORDER_PROCUREMENT_RUNTIME = {
  renderToken: 0,
  cache: {
    skus: null,
    warehouse: null,
    combined: null,
    wb: null,
    ozon: null
  },
  pending: new Map()
};

function ensureOrderProcurementState() {
  state.orderProcurement = state.orderProcurement || {};
  state.orderProcurement.platform = state.orderProcurement.platform === 'ozon' ? 'ozon' : 'wb';
  state.orderProcurement.days = clampOrderProcurementDays(state.orderProcurement.days);
  return state.orderProcurement;
}

function clampOrderProcurementDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(180, Math.round(parsed)));
}

function orderProcurementNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function orderProcurementEscape(value) {
  return escapeHtml(value == null ? '' : String(value));
}

function orderProcurementNormalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function orderProcurementUnique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function orderProcurementBadge(text, tone = '') {
  return badge(text, tone);
}

function orderProcurementTurnoverTone(value) {
  if (!Number.isFinite(Number(value))) return 'info';
  if (Number(value) < 7) return 'danger';
  if (Number(value) < 14) return 'warn';
  return 'ok';
}

function orderProcurementTurnoverBadge(value) {
  if (!Number.isFinite(Number(value))) return orderProcurementBadge('n/a', 'info');
  return orderProcurementBadge(`${fmt.num(value, 1)} дн.`, orderProcurementTurnoverTone(value));
}

function orderProcurementFormatDateTime(value) {
  if (!value) return 'последний доступный срез';
  try {
    return new Date(value).toLocaleString('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return String(value);
  }
}

function orderProcurementResolvedPath(path) {
  return path.includes('?') ? path : `${path}?v=${ORDER_PROCUREMENT_VERSION}`;
}

async function orderProcurementParseResponse(response, path) {
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const isGzip =
    path.endsWith('.gz') ||
    contentType.includes('application/gzip') ||
    contentType.includes('application/x-gzip') ||
    contentType.includes('gzip');

  let text = '';
  if (isGzip) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error(`Браузер не поддерживает распаковку gzip для ${path}`);
    }
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = await response.text();
  }

  return JSON.parse(sanitizeLooseJson(text));
}

async function orderProcurementFetchJson(paths) {
  let lastError = null;
  for (const path of paths) {
    try {
      const response = await fetch(orderProcurementResolvedPath(path), { cache: 'no-store' });
      return await orderProcurementParseResponse(response, path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Не удалось загрузить order-файлы.');
}

function orderProcurementLoadCached(key, loader) {
  if (ORDER_PROCUREMENT_RUNTIME.cache[key]) {
    return Promise.resolve(ORDER_PROCUREMENT_RUNTIME.cache[key]);
  }
  if (ORDER_PROCUREMENT_RUNTIME.pending.has(key)) {
    return ORDER_PROCUREMENT_RUNTIME.pending.get(key);
  }

  const promise = Promise.resolve()
    .then(loader)
    .then((data) => {
      ORDER_PROCUREMENT_RUNTIME.cache[key] = data;
      return data;
    })
    .finally(() => {
      ORDER_PROCUREMENT_RUNTIME.pending.delete(key);
    });

  ORDER_PROCUREMENT_RUNTIME.pending.set(key, promise);
  return promise;
}

async function ensureOrderProcurementSources(platform = 'wb') {
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';

  if (Array.isArray(state.skus) && state.skus.length) {
    ORDER_PROCUREMENT_RUNTIME.cache.skus = state.skus;
  } else {
    await orderProcurementLoadCached('skus', () => loadJson('data/skus.json'));
  }

  await orderProcurementLoadCached('warehouse', async () => {
    try {
      return await orderProcurementFetchJson(['data/warehouse_stock_overlay.json', 'data/warehouse_stock_overlay.json.gz']);
    } catch (error) {
      console.warn('[order-procurement] warehouse overlay', error);
      return { generatedAt: '', rows: [] };
    }
  });

  if (!ORDER_PROCUREMENT_RUNTIME.cache.combined) {
    try {
      await orderProcurementLoadCached('combined', () => orderProcurementFetchJson(['data/order_procurement.json', 'data/order_procurement.json.gz']));
    } catch (combinedError) {
      if (normalizedPlatform === 'wb' && !ORDER_PROCUREMENT_RUNTIME.cache.wb) {
        await orderProcurementLoadCached('wb', () => orderProcurementFetchJson(['data/order_procurement_wb.json', 'data/order_procurement_wb.json.gz']));
      }
      if (normalizedPlatform === 'ozon' && !ORDER_PROCUREMENT_RUNTIME.cache.ozon) {
        await orderProcurementLoadCached('ozon', () => orderProcurementFetchJson(['data/order_procurement_ozon.json', 'data/order_procurement_ozon.json.gz']));
      }
      if (!ORDER_PROCUREMENT_RUNTIME.cache.wb && !ORDER_PROCUREMENT_RUNTIME.cache.ozon) {
        throw combinedError;
      }
    }
  }
}

function orderProcurementCurrentPayload(platform) {
  if (ORDER_PROCUREMENT_RUNTIME.cache.combined && Array.isArray(ORDER_PROCUREMENT_RUNTIME.cache.combined.rows)) {
    const target = platform === 'ozon' ? 'ozon' : 'wb';
    return {
      ...ORDER_PROCUREMENT_RUNTIME.cache.combined,
      platform: target.toUpperCase(),
      rows: ORDER_PROCUREMENT_RUNTIME.cache.combined.rows.filter((row) => orderProcurementNormalizeKey(row?.platform) === target)
    };
  }
  return platform === 'ozon' ? ORDER_PROCUREMENT_RUNTIME.cache.ozon : ORDER_PROCUREMENT_RUNTIME.cache.wb;
}

function orderProcurementHasReadyData() {
  const platform = ensureOrderProcurementState().platform;
  const payload = orderProcurementCurrentPayload(platform);
  const hasRows = Array.isArray(payload?.rows) && payload.rows.length > 0;
  const hasSkus =
    (Array.isArray(state.skus) && state.skus.length > 0) ||
    (Array.isArray(ORDER_PROCUREMENT_RUNTIME.cache.skus) && ORDER_PROCUREMENT_RUNTIME.cache.skus.length > 0);
  return hasRows && hasSkus;
}

function orderProcurementBuildSkuLookup() {
  const rows = Array.isArray(state.skus) && state.skus.length
    ? state.skus
    : (Array.isArray(ORDER_PROCUREMENT_RUNTIME.cache.skus) ? ORDER_PROCUREMENT_RUNTIME.cache.skus : []);
  const lookup = new Map();

  rows.forEach((row) => {
    orderProcurementUnique([
      orderProcurementNormalizeKey(row?.articleKey),
      orderProcurementNormalizeKey(row?.article),
      orderProcurementNormalizeKey(row?.sku)
    ]).forEach((key) => {
      if (key && !lookup.has(key)) lookup.set(key, row);
    });
  });

  return lookup;
}

function orderProcurementBuildWarehouseMap() {
  const rows = Array.isArray(ORDER_PROCUREMENT_RUNTIME.cache.warehouse?.rows) ? ORDER_PROCUREMENT_RUNTIME.cache.warehouse.rows : [];
  const lookup = new Map();

  rows.forEach((row) => {
    const key = orderProcurementNormalizeKey(row?.articleKey || row?.article);
    if (!key) return;
    lookup.set(key, {
      stockWarehouse: orderProcurementNumber(row?.stockWarehouse),
      inboundWarehouse: 0,
      accepted: orderProcurementNumber(row?.accepted),
      shippedWB: orderProcurementNumber(row?.shippedWB),
      shippedOzon: orderProcurementNumber(row?.shippedOzon)
    });
  });

  return lookup;
}

function orderProcurementReadMetric(row, days, keys) {
  const key = keys[days] || null;
  if (!key) return null;
  const value = Math.ceil(orderProcurementNumber(row?.[key]));
  return value > 0 ? value : 0;
}

function orderProcurementOrdersForDays(row, days) {
  const direct = orderProcurementReadMetric(row, days, {
    7: 'sales7',
    14: 'sales14',
    28: 'sales28'
  });
  if (direct !== null) return direct;
  return Math.ceil(Math.max(0, orderProcurementNumber(row?.avgDaily) * days));
}

function orderProcurementNeedForDays(row, days) {
  const direct = orderProcurementReadMetric(row, days, {
    7: 'targetNeed7',
    14: 'targetNeed14',
    28: 'targetNeed28'
  });
  if (direct !== null && direct >= 0) return direct;

  const orders = orderProcurementOrdersForDays(row, days);
  const stock = orderProcurementNumber(row?.inStock);
  const inFlight = orderProcurementNumber(row?.inTransit) + orderProcurementNumber(row?.inRequest);
  return Math.max(0, Math.ceil(orders - stock - inFlight));
}

function orderProcurementSafeTurnover(row) {
  if (row?.turnoverDays !== null && row?.turnoverDays !== undefined && row?.turnoverDays !== '') {
    const value = Number(row.turnoverDays);
    return Number.isFinite(value) ? value : null;
  }
  const avgDaily = orderProcurementNumber(row?.avgDaily);
  if (avgDaily <= 0) return null;
  return orderProcurementNumber(row?.inStock) / avgDaily;
}

function buildOrderProcurementModel() {
  const orderState = ensureOrderProcurementState();
  const platform = orderState.platform === 'ozon' ? 'ozon' : 'wb';
  const days = clampOrderProcurementDays(orderState.days);
  const payload = orderProcurementCurrentPayload(platform) || { rows: [] };
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const skuLookup = orderProcurementBuildSkuLookup();
  const warehouseLookup = orderProcurementBuildWarehouseMap();
  const rowMap = new Map();
  const placeOrder = [];
  const placeSeen = new Set();
  const clusterTotalsMap = new Map();

  rows.forEach((row) => {
    const article = String(row?.article || '').trim();
    const articleKey = orderProcurementNormalizeKey(row?.articleKey || article);
    if (!articleKey) return;

    const place = String(row?.place || '').trim() || 'Без кластера';
    if (!placeSeen.has(place)) {
      placeSeen.add(place);
      placeOrder.push(place);
    }

    const sku = skuLookup.get(articleKey) || skuLookup.get(orderProcurementNormalizeKey(article)) || {};
    const warehouse = warehouseLookup.get(articleKey) || warehouseLookup.get(orderProcurementNormalizeKey(article)) || {};
    const current = rowMap.get(articleKey) || {
      article,
      articleKey,
      name: sku?.name || row?.name || article,
      owner: sku?.owner?.name || row?.owner || '',
      warehouseStock: orderProcurementNumber(warehouse.stockWarehouse),
      inboundWarehouse: orderProcurementNumber(warehouse.inboundWarehouse),
      totalNeed: 0,
      totalOrders: 0,
      clusters: {}
    };

    const clusterOrders = orderProcurementOrdersForDays(row, days);
    const clusterNeed = orderProcurementNeedForDays(row, days);
    const cluster = {
      mpStock: orderProcurementNumber(row?.inStock),
      orders: clusterOrders,
      turnover: orderProcurementSafeTurnover(row),
      need: clusterNeed
    };

    current.totalNeed += clusterNeed;
    current.totalOrders += clusterOrders;
    current.clusters[place] = cluster;
    rowMap.set(articleKey, current);

    const clusterTotal = clusterTotalsMap.get(place) || { mpStock: 0, orders: 0, need: 0 };
    clusterTotal.mpStock += cluster.mpStock;
    clusterTotal.orders += cluster.orders;
    clusterTotal.need += cluster.need;
    clusterTotalsMap.set(place, clusterTotal);
  });

  const list = [...rowMap.values()].sort((left, right) => {
    if (right.totalNeed !== left.totalNeed) return right.totalNeed - left.totalNeed;
    if (right.totalOrders !== left.totalOrders) return right.totalOrders - left.totalOrders;
    return String(left.article).localeCompare(String(right.article), 'ru');
  });

  const totals = list.reduce((acc, row) => {
    acc.warehouseStock += orderProcurementNumber(row.warehouseStock);
    acc.inboundWarehouse += orderProcurementNumber(row.inboundWarehouse);
    acc.totalNeed += orderProcurementNumber(row.totalNeed);
    return acc;
  }, { warehouseStock: 0, inboundWarehouse: 0, totalNeed: 0 });

  return {
    platform,
    platformLabel: platform === 'ozon' ? 'OZ' : 'WB',
    days,
    generatedAt: payload.generatedAt || ORDER_PROCUREMENT_RUNTIME.cache.warehouse?.generatedAt || null,
    window: payload.window || null,
    places: placeOrder,
    rows: list,
    totals,
    clusterTotals: placeOrder.map((place) => ({
      place,
      ...(clusterTotalsMap.get(place) || { mpStock: 0, orders: 0, need: 0 })
    }))
  };
}

function exportOrderProcurementCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function exportOrderProcurementModel(model) {
  const headers = [
    'SKU / Номенклатура',
    'Артикул',
    'Остатки мой склад',
    'В пути на склад',
    'Итого заказ товара'
  ];

  model.places.forEach((place) => {
    headers.push(
      `${place} · Остаток MP`,
      `${place} · Заказы`,
      `${place} · Оборачиваемость`,
      `${place} · Рек. к заказу`
    );
  });

  const lines = [headers.map(exportOrderProcurementCell).join(';')];
  model.rows.forEach((row) => {
    const cells = [
      row.name,
      row.article,
      row.warehouseStock,
      row.inboundWarehouse,
      row.totalNeed
    ];

    model.places.forEach((place) => {
      const cluster = row.clusters[place] || {};
      cells.push(
        cluster.mpStock || 0,
        cluster.orders || 0,
        cluster.turnover == null ? '' : Number(cluster.turnover).toFixed(1),
        cluster.need || 0
      );
    });

    lines.push(cells.map(exportOrderProcurementCell).join(';'));
  });

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `zakaz-tovara-${model.platform}-${model.days}d-${todayIso()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderOrderProcurementClusterSummary(model) {
  if (!model.clusterTotals.length) return '';
  return `
    <div class="altea-order-procurement__cluster-strip">
      ${model.clusterTotals.map((cluster) => `
        <div class="altea-order-procurement__cluster-card">
          <span>${orderProcurementEscape(cluster.place)}</span>
          <strong>${fmt.int(cluster.need)}</strong>
          <small>к заказу · ${fmt.int(cluster.mpStock)} на MP</small>
        </div>
      `).join('')}
    </div>
  `;
}

function renderOrderProcurementTable(model) {
  const headGroups = model.places
    .map((place) => `<th colspan="4" class="altea-order-procurement__cluster-head">${orderProcurementEscape(place)}</th>`)
    .join('');

  const headMetrics = model.places
    .map(() => `
      <th>Остаток MP</th>
      <th>Заказы</th>
      <th>Оборачиваемость</th>
      <th>Рек. к заказу</th>
    `)
    .join('');

  const columnCount = 5 + (model.places.length * 4);
  const body = model.rows.length
    ? model.rows.map((row) => {
        const clusterCells = model.places.map((place) => {
          const cluster = row.clusters[place] || {};
          return `
            <td class="altea-order-procurement__num">${fmt.int(cluster.mpStock)}</td>
            <td class="altea-order-procurement__num">${fmt.int(cluster.orders)}</td>
            <td>${orderProcurementTurnoverBadge(cluster.turnover)}</td>
            <td>${orderProcurementBadge(fmt.int(cluster.need), cluster.need > 0 ? 'warn' : 'ok')}</td>
          `;
        }).join('');

        const articleLabel = row.article || row.articleKey;
        const skuLink = typeof linkToSku === 'function'
          ? linkToSku(row.articleKey || articleLabel, articleLabel)
          : orderProcurementEscape(articleLabel);

        return `
          <tr>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--sku">
              <strong>${orderProcurementEscape(row.name || articleLabel)}</strong>
              <div class="altea-order-procurement__meta">${orderProcurementEscape(row.owner || 'Без owner')}</div>
            </td>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--article">${skuLink}</td>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--warehouse altea-order-procurement__num">${fmt.int(row.warehouseStock)}</td>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--inbound altea-order-procurement__num">${fmt.int(row.inboundWarehouse)}</td>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--total">${orderProcurementBadge(fmt.int(row.totalNeed), row.totalNeed > 0 ? 'warn' : 'ok')}</td>
            ${clusterCells}
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td colspan="${columnCount}" class="altea-order-procurement__empty">По выбранной площадке строки не загрузились.</td>
      </tr>
    `;

  return `
    <div class="altea-order-procurement__table-wrap imperial-table-wrap">
      <table class="altea-order-procurement__table">
        <thead>
          <tr>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--sku">SKU / Номенклатура</th>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--article">Артикул</th>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--warehouse">Остатки мой склад</th>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--inbound">В пути на склад</th>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--total">Итого заказ товара</th>
            ${headGroups}
          </tr>
          <tr>${headMetrics}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderOrderProcurement(model) {
  const range = model.window?.from && model.window?.to
    ? `${orderProcurementEscape(model.window.from)} - ${orderProcurementEscape(model.window.to)}`
    : 'последний доступный срез';

  return `
    <section class="imperial-section altea-order-procurement" data-altea-order-procurement>
      <div class="card">
        <div class="section-title">
          <div>
            <h2>Заказ товара по кластерам</h2>
            <p>Рабочая форма закупщика: слева центральный склад, справа кластеры площадки, ниже готовая рекомендация по заказу на каждый кластер.</p>
          </div>
          <div class="badge-stack">
            ${orderProcurementBadge(`Площадка: ${model.platformLabel}`, model.platform === 'wb' ? 'ok' : 'info')}
            ${orderProcurementBadge(`Оборачиваемость: ${model.days} дн.`, 'info')}
            ${orderProcurementBadge(`Срез: ${range}`, 'info')}
          </div>
        </div>

        <div class="altea-order-procurement__toolbar">
          <label class="altea-order-procurement__field">
            <span>Оборачиваемость, дней</span>
            <input id="alteaOrderTargetDays" type="number" min="1" max="180" step="1" value="${orderProcurementEscape(model.days)}">
          </label>

          <div class="altea-order-procurement__field">
            <span>Площадка</span>
            <div class="altea-order-procurement__platforms">
              <button type="button" class="altea-order-procurement__platform-btn ${model.platform === 'wb' ? 'is-active' : ''}" data-altea-order-platform="wb">WB</button>
              <button type="button" class="altea-order-procurement__platform-btn ${model.platform === 'ozon' ? 'is-active' : ''}" data-altea-order-platform="ozon">OZ</button>
            </div>
          </div>

          <div class="badge-stack">
            ${orderProcurementBadge(`SKU: ${fmt.int(model.rows.length)}`, model.rows.length ? 'ok' : 'warn')}
            ${orderProcurementBadge(`Кластеры: ${fmt.int(model.places.length)}`, model.places.length ? 'ok' : 'warn')}
            ${orderProcurementBadge(`Обновлено: ${orderProcurementFormatDateTime(model.generatedAt)}`, 'info')}
          </div>

          <div class="altea-order-procurement__actions">
            <button type="button" class="btn" data-altea-order-export>Выгрузить в Excel</button>
          </div>
        </div>
      </div>

      <div class="altea-order-procurement__summary">
        <div class="mini-kpi">
          <span>SKU в расчёте</span>
          <strong>${fmt.int(model.rows.length)}</strong>
          <span>${model.platformLabel}</span>
        </div>
        <div class="mini-kpi">
          <span>Остаток мой склад</span>
          <strong>${fmt.int(model.totals.warehouseStock)}</strong>
          <span>из файла реальных остатков</span>
        </div>
        <div class="mini-kpi">
          <span>В пути на склад</span>
          <strong>${fmt.int(model.totals.inboundWarehouse)}</strong>
          <span>источник пока не подключён</span>
        </div>
        <div class="mini-kpi warn">
          <span>Итого к заказу</span>
          <strong>${fmt.int(model.totals.totalNeed)}</strong>
          <span>сумма по всем кластерам</span>
        </div>
      </div>

      ${renderOrderProcurementClusterSummary(model)}

      <div class="card altea-order-procurement__table-card">
        <div class="section-subhead">
          <div>
            <h3>Таблица заказа</h3>
            <p class="small muted">Слева фиксированные колонки по SKU и складу, справа блоки кластеров выбранной площадки: остатки MP, заказы, оборачиваемость и рекомендованный заказ.</p>
          </div>
          <div class="badge-stack">
            ${orderProcurementBadge(`Период расчёта: ${model.days} дн.`, 'info')}
            ${orderProcurementBadge('Колонка "В пути" пока = 0', 'warn')}
          </div>
        </div>

        ${renderOrderProcurementTable(model)}

        <div class="altea-order-procurement__caption">
          Колонка "Остатки мой склад" уже берётся из файла реальных остатков. Колонку "В пути на склад" оставили отдельной, но пока не заполняем, потому что источник ещё не подключён.
        </div>
      </div>
    </section>
  `;
}

function renderOrderProcurementLoading() {
  return `
    <section class="imperial-section altea-order-procurement">
      <div class="card">
        <h2>Заказ товара по кластерам</h2>
        <p class="small muted">Подтягиваю данные по складу и кластерам, чтобы собрать рабочую форму закупщика.</p>
      </div>
    </section>
  `;
}

function renderOrderProcurementError() {
  return `
    <section class="imperial-section altea-order-procurement">
      <div class="card">
        <h3>Заказ товара пока не загрузился</h3>
        <p class="small muted">Не удалось прочитать order-файлы. Проверьте, что доступны <code>data/order_procurement.json</code> и <code>data/warehouse_stock_overlay.json</code>.</p>
      </div>
    </section>
  `;
}

function orderProcurementRenderInto(root) {
  const model = buildOrderProcurementModel();
  root.innerHTML = renderOrderProcurement(model);
  bindOrderProcurement(root);
}

function bindOrderProcurement(root) {
  root.querySelectorAll('[data-altea-order-platform]').forEach((button) => {
    button.addEventListener('click', () => {
      ensureOrderProcurementState().platform = button.dataset.alteaOrderPlatform === 'ozon' ? 'ozon' : 'wb';
      renderOrderCalculator();
    });
  });

  root.querySelector('#alteaOrderTargetDays')?.addEventListener('change', (event) => {
    ensureOrderProcurementState().days = clampOrderProcurementDays(event.target.value);
    renderOrderCalculator();
  });

  root.querySelector('[data-altea-order-export]')?.addEventListener('click', () => {
    try {
      exportOrderProcurementModel(buildOrderProcurementModel());
      setAppError('Выгрузка заказа подготовлена.');
      window.setTimeout(() => setAppError(''), 1600);
    } catch (error) {
      console.error('[order-procurement] export', error);
      setAppError('Не удалось выгрузить таблицу заказа. Попробуйте ещё раз.');
    }
  });
}

function injectOrderProcurementStyles() {
  if (document.getElementById(ORDER_PROCUREMENT_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = ORDER_PROCUREMENT_STYLE_ID;
  style.textContent = `
    .altea-order-procurement {
      --col-sku: 320px;
      --col-article: 170px;
      --col-warehouse: 150px;
      --col-inbound: 150px;
      --col-total: 170px;
      display: grid;
      gap: 14px;
      width: 100%;
      margin-top: 18px;
    }

    .altea-order-procurement__toolbar {
      display: grid;
      grid-template-columns: minmax(180px, 220px) auto 1fr auto;
      gap: 12px;
      align-items: end;
      margin-top: 12px;
    }

    .altea-order-procurement__field span {
      display: block;
      margin-bottom: 6px;
      color: rgba(255, 244, 229, 0.64);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .altea-order-procurement__field input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(212, 164, 74, 0.18);
      background: rgba(17, 14, 11, 0.96);
      color: #fff1dd;
    }

    .altea-order-procurement__platforms,
    .altea-order-procurement__actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }

    .altea-order-procurement__actions {
      justify-content: flex-end;
    }

    .altea-order-procurement__platform-btn {
      min-width: 70px;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid rgba(212, 164, 74, 0.22);
      background: rgba(18, 14, 10, 0.92);
      color: #fff1dd;
      font: inherit;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }

    .altea-order-procurement__platform-btn:hover {
      transform: translateY(-1px);
      border-color: rgba(212, 164, 74, 0.44);
    }

    .altea-order-procurement__platform-btn.is-active {
      background: linear-gradient(135deg, rgba(212, 164, 74, 0.30), rgba(101, 67, 33, 0.56));
      border-color: rgba(240, 196, 101, 0.60);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
    }

    .altea-order-procurement__summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }

    .altea-order-procurement__cluster-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }

    .altea-order-procurement__cluster-card {
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid rgba(212, 164, 74, 0.14);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01)),
        rgba(17, 14, 11, 0.96);
    }

    .altea-order-procurement__cluster-card span,
    .altea-order-procurement__cluster-card small {
      display: block;
    }

    .altea-order-procurement__cluster-card span {
      color: rgba(255, 244, 229, 0.72);
      font-size: 12px;
      line-height: 1.4;
    }

    .altea-order-procurement__cluster-card strong {
      display: block;
      margin: 8px 0 4px;
      font-size: 22px;
      line-height: 1;
    }

    .altea-order-procurement__cluster-card small {
      color: rgba(255, 244, 229, 0.56);
    }

    .altea-order-procurement__table-card {
      overflow: hidden;
    }

    .altea-order-procurement__table-wrap {
      margin-top: 14px;
      overflow: auto;
      max-width: 100%;
    }

    .altea-order-procurement__table {
      width: max-content;
      min-width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }

    .altea-order-procurement__table th,
    .altea-order-procurement__table td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(212, 164, 74, 0.10);
      vertical-align: top;
    }

    .altea-order-procurement__table thead th {
      position: sticky;
      top: 0;
      z-index: 5;
      background: rgba(18, 14, 11, 0.98);
      white-space: nowrap;
    }

    .altea-order-procurement__table thead tr:nth-child(2) th {
      top: 49px;
      z-index: 6;
    }

    .altea-order-procurement__cluster-head {
      text-align: center;
      font-size: 12px;
      letter-spacing: 0.04em;
    }

    .altea-order-procurement__sticky-head,
    .altea-order-procurement__sticky-cell {
      position: sticky;
      z-index: 7;
      background: rgba(17, 14, 11, 0.985);
      box-shadow: 1px 0 0 rgba(212, 164, 74, 0.08);
    }

    .altea-order-procurement__sticky-head {
      z-index: 8;
    }

    .altea-order-procurement__sticky-head--sku,
    .altea-order-procurement__sticky-cell--sku {
      left: 0;
      min-width: var(--col-sku);
      width: var(--col-sku);
    }

    .altea-order-procurement__sticky-head--article,
    .altea-order-procurement__sticky-cell--article {
      left: var(--col-sku);
      min-width: var(--col-article);
      width: var(--col-article);
    }

    .altea-order-procurement__sticky-head--warehouse,
    .altea-order-procurement__sticky-cell--warehouse {
      left: calc(var(--col-sku) + var(--col-article));
      min-width: var(--col-warehouse);
      width: var(--col-warehouse);
    }

    .altea-order-procurement__sticky-head--inbound,
    .altea-order-procurement__sticky-cell--inbound {
      left: calc(var(--col-sku) + var(--col-article) + var(--col-warehouse));
      min-width: var(--col-inbound);
      width: var(--col-inbound);
    }

    .altea-order-procurement__sticky-head--total,
    .altea-order-procurement__sticky-cell--total {
      left: calc(var(--col-sku) + var(--col-article) + var(--col-warehouse) + var(--col-inbound));
      min-width: var(--col-total);
      width: var(--col-total);
    }

    .altea-order-procurement__sticky-cell strong {
      display: block;
      margin-bottom: 4px;
    }

    .altea-order-procurement__meta {
      color: rgba(255, 244, 229, 0.58);
      font-size: 12px;
      line-height: 1.4;
    }

    .altea-order-procurement__num {
      text-align: right;
      white-space: nowrap;
    }

    .altea-order-procurement__table tbody tr:hover td {
      background: rgba(255, 244, 229, 0.03);
    }

    .altea-order-procurement__table tbody tr:hover .altea-order-procurement__sticky-cell {
      background: rgba(28, 22, 16, 0.98);
    }

    .altea-order-procurement__empty {
      padding: 22px 14px;
      text-align: center;
      color: rgba(255, 244, 229, 0.64);
    }

    .altea-order-procurement__caption {
      margin-top: 10px;
      color: rgba(255, 244, 229, 0.58);
      font-size: 12px;
    }

    @media (max-width: 1400px) {
      .altea-order-procurement__toolbar,
      .altea-order-procurement__summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .altea-order-procurement__actions {
        justify-content: flex-start;
      }
    }

    @media (max-width: 900px) {
      .altea-order-procurement {
        --col-sku: 240px;
        --col-article: 140px;
        --col-warehouse: 120px;
        --col-inbound: 120px;
        --col-total: 140px;
      }

      .altea-order-procurement__toolbar,
      .altea-order-procurement__summary {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

function buildExecutiveModel() {
  const control = getControlSnapshot();
  const active = control.active;
  const overdue = control.overdue;
  const waiting = control.waitingDecision;
  const critical = active.filter((task) => task.priority === 'critical');
  const noOwnerTasks = active.filter((task) => !task.owner);
  const launchFocus = getLaunchItems().slice(0, 6);
  const unassignedSkus = state.skus.filter((sku) => !sku?.flags?.assigned).slice(0, 8);
  const categories = [
    { title: 'Цена / маржа', items: sortTasks(active.filter((task) => task.type === 'price_margin')).slice(0, 5), tone: 'danger' },
    { title: 'Supply / остатки', items: sortTasks(active.filter((task) => task.type === 'supply')).slice(0, 5), tone: 'warn' },
    { title: 'Внешний трафик', items: sortTasks(active.filter((task) => task.type === 'traffic')).slice(0, 5), tone: 'info' },
    { title: 'Закрепление / owner', items: sortTasks(active.filter((task) => task.type === 'assignment')).slice(0, 5), tone: 'warn' }
  ];
  return {
    control,
    active,
    overdue,
    waiting,
    critical,
    noOwnerTasks,
    launchFocus,
    unassignedSkus,
    categories,
    ceoList: sortTasks(active).filter((task) => isTaskOverdue(task) || task.status === 'waiting_decision' || task.priority === 'critical').slice(0, 12)
  };
}

function renderExecutive() {
  const root = document.getElementById('view-executive');
  const model = buildExecutiveModel();
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Свод для руководителя</h2>
        <p>Финальный слой: сюда вынесены только задачи и алерты, которые реально требуют контроля, эскалации или решения по ресурсу.</p>
      </div>
      <div class="badge-stack">${badge(`${fmt.int(model.critical.length)} критично`, model.critical.length ? 'danger' : 'ok')}${badge(`${fmt.int(model.waiting.length)} ждут решения`, model.waiting.length ? 'warn' : 'ok')}</div>
    </div>

    <div class="kpi-strip">
      <div class="mini-kpi danger"><span>Активные задачи</span><strong>${fmt.int(model.active.length)}</strong><span>всего в контуре</span></div>
      <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(model.overdue.length)}</strong><span>нужен апдейт / перенос</span></div>
      <div class="mini-kpi warn"><span>Критично по марже</span><strong>${fmt.int(model.critical.length)}</strong><span>цена и экономика</span></div>
      <div class="mini-kpi warn"><span>Ждут решения</span><strong>${fmt.int(model.waiting.length)}</strong><span>зависло на развилке</span></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(model.noOwnerTasks.length)}</strong><span>в задачах</span></div>
      <div class="mini-kpi"><span>SKU без owner</span><strong>${fmt.int(model.unassignedSkus.length)}</strong><span>в бренде Алтея</span></div>
    </div>

    <div class="dashboard-grid-4" style="margin-top:14px">
      ${model.categories.map((group) => `
        <div class="card tone-${escapeHtml(group.tone)}">
          <div class="section-subhead">
            <div>
              <h3>${escapeHtml(group.title)}</h3>
              <p class="small muted">То, что нельзя терять из вида на уровне руководителя.</p>
            </div>
            ${badge(`${fmt.int(group.items.length)} шт.`, group.tone)}
          </div>
          <div class="list compact-list">
            ${group.items.length ? group.items.map((task) => renderMiniTask(task)).join('') : '<div class="empty">Нет активных алертов</div>'}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>На личном контроле · 7 дней</h3>
            <p class="small muted">Просрочки, критичные задачи и вопросы, которые уже ждут решения.</p>
          </div>
          ${badge(`${fmt.int(model.ceoList.length)} в short-list`, 'danger')}
        </div>
        <div class="task-mini-grid">${model.ceoList.map(renderMiniTask).join('') || '<div class="empty">Нет эскалаций</div>'}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Новинки и незакреплённые SKU</h3>
            <p class="small muted">Два частых провала: запуск без сопровождения и товар без явного owner.</p>
          </div>
          ${badge(`${fmt.int(model.launchFocus.length)} новинок`, 'info')}
        </div>
        <div class="alert-stack">
          ${model.launchFocus.map((item) => `
            <div class="alert-row">
              <div>
                <strong>${escapeHtml(item.name || 'Новинка')}</strong>
                <div class="muted small">${escapeHtml(item.launchMonth || '—')} · ${escapeHtml(item.reportGroup || '—')}</div>
              </div>
              <div class="badge-stack">${badge(item.tag || 'новинка', 'info')}${item.production ? badge(item.production) : ''}</div>
              <div class="muted small">${escapeHtml(item.status || 'Статус не указан')}</div>
            </div>
          `).join('')}
          ${model.unassignedSkus.slice(0, 4).map((sku) => `
            <div class="alert-row">
              <div>
                <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
                <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
              </div>
              <div class="badge-stack">${badge('Без owner', 'warn')}${skuOperationalStatus(sku)}</div>
              <div class="muted small">${escapeHtml(sku.focusReasons || 'Нужно закрепить ответственного и сценарий работы')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

async function createComment(payload) {
  const comment = normalizeComment({
    id: uid('comment'),
    articleKey: payload.articleKey,
    author: String(payload.author || state.team.member.name || 'Команда').trim() || 'Команда',
    team: String(payload.team || teamMemberLabel()).trim() || 'Команда',
    createdAt: new Date().toISOString(),
    text: String(payload.text || '').trim(),
    type: String(payload.type || 'signal')
  });
  if (!comment.text) return;
  state.storage.comments.unshift(comment);
  saveLocalStorage();
  try {
    await persistComment(comment);
  } catch (error) {
    console.error(error);
  }
}

async function createTaskHistoryEntry(taskId, kind, text, payload = {}) {
  const task = getTask(taskId);
  if (!task || !String(text || '').trim()) return;
  await createComment({
    articleKey: task.articleKey || '',
    author: payload.author || state.team.member.name || task.owner || 'Команда',
    team: payload.team || teamMemberLabel(),
    type: 'task_log',
    text: `[[task:${taskId}]] [[kind:${kind}]] ${String(text || '').trim()}`
  });
}

function buildTaskUpdateMessage(before, after) {
  const changes = [];
  if (before.title !== after.title) changes.push(`заголовок → ${after.title}`);
  if ((before.owner || '') !== (after.owner || '')) changes.push(`owner → ${after.owner || 'Без owner'}`);
  if ((before.due || '') !== (after.due || '')) changes.push(`срок → ${after.due || '—'}`);
  if (before.status !== after.status) changes.push(`статус → ${(TASK_STATUS_META[after.status] || TASK_STATUS_META.new).label}`);
  if (before.priority !== after.priority) changes.push(`приоритет → ${(PRIORITY_META[after.priority] || PRIORITY_META.medium).label}`);
  if (before.type !== after.type) changes.push(`тип → ${TASK_TYPE_META[after.type] || TASK_TYPE_META.general}`);
  if (before.platform !== after.platform) changes.push(`контур → ${controlWorkstreamMeta(controlWorkstreamKey(after, getSku(after.articleKey))).label}`);
  if ((before.nextAction || '') !== (after.nextAction || '')) changes.push('обновлён следующий шаг');
  if ((before.reason || '') !== (after.reason || '')) changes.push('обновлён контекст');
  if ((before.entityLabel || '') !== (after.entityLabel || '')) changes.push(`тема → ${after.entityLabel || '—'}`);
  return changes.length ? `Изменения по задаче: ${changes.join('; ')}.` : '';
}

async function upsertOwnerAssignment(payload) {
  const override = normalizeOwnerOverride({
    articleKey: payload.articleKey,
    ownerName: payload.ownerName,
    ownerRole: payload.ownerRole,
    note: payload.note,
    updatedAt: new Date().toISOString(),
    assignedBy: state.team.member.name || 'Команда'
  });
  state.storage.ownerOverrides = (state.storage.ownerOverrides || []).filter((item) => item.articleKey !== override.articleKey);
  state.storage.ownerOverrides.unshift(override);
  applyOwnerOverridesToSkus();
  saveLocalStorage();
  try {
    await persistOwnerOverride(override);
  } catch (error) {
    console.error(error);
  }
}

async function createDecision(payload) {
  const decision = normalizeDecision({
    id: uid('decision'),
    articleKey: payload.articleKey,
    title: payload.title,
    decision: payload.decision,
    owner: payload.owner,
    status: payload.status,
    due: payload.due,
    createdAt: new Date().toISOString(),
    createdBy: state.team.member.name || 'Команда'
  });
  if (!decision.decision) return;
  state.storage.decisions.unshift(decision);
  saveLocalStorage();
  try {
    await persistDecision(decision);
  } catch (error) {
    console.error(error);
  }
}

async function createManualTask(payload) {
  const task = normalizeTask({
    id: uid('task'),
    source: 'manual',
    articleKey: payload.articleKey,
    entityLabel: payload.entityLabel,
    title: String(payload.title || '').trim() || 'Новая задача',
    type: payload.type,
    priority: payload.priority,
    platform: payload.platform,
    owner: String(payload.owner || '').trim(),
    due: payload.due || plusDays(3),
    status: 'new',
    nextAction: String(payload.nextAction || '').trim(),
    reason: String(payload.reason || '').trim()
  }, 'manual');
  state.storage.tasks.unshift(task);
  saveLocalStorage();
  try {
    await persistTask(task);
  } catch (error) {
    console.error(error);
  }
  await createTaskHistoryEntry(task.id, 'created', `Задача создана${task.owner ? ` · owner ${task.owner}` : ''}${task.due ? ` · срок ${task.due}` : ''}.`);
  rerenderCurrentView();
  if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
  return task;
}

async function takeAutoTask(taskId) {
  const task = getAllTasks().find((item) => item.id === taskId);
  if (!task || task.source !== 'auto') return;
  const manual = normalizeTask({
    ...task,
    id: uid('task'),
    source: 'manual',
    status: 'in_progress',
    owner: task.owner || ownerName(getSku(task.articleKey)) || ''
  }, 'manual');
  state.storage.tasks.unshift(manual);
  saveLocalStorage();
  try {
    await persistTask(manual);
  } catch (error) {
    console.error(error);
  }
  await createTaskHistoryEntry(manual.id, 'created', 'Авто-сигнал взят в ручную работу и переведён в контур команды.');
  rerenderCurrentView();
  if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
  openTaskModal(manual.id);
}

async function updateTaskRecord(taskId, patch = {}) {
  const current = state.storage.tasks.find((item) => item.id === taskId);
  if (!current) return null;

  const before = { ...current };
  const updated = normalizeTask({
    ...current,
    ...patch,
    id: current.id,
    source: current.source,
    createdAt: current.createdAt,
    articleKey: patch.articleKey !== undefined ? patch.articleKey : current.articleKey
  }, current.source || 'manual');

  Object.assign(current, updated);
  saveLocalStorage();
  try {
    await persistTask(current);
  } catch (error) {
    console.error(error);
  }

  const historyMessage = buildTaskUpdateMessage(before, current);
  if (historyMessage) await createTaskHistoryEntry(taskId, current.status !== before.status ? 'status' : 'updated', historyMessage);

  rerenderCurrentView();
  if (state.activeSku === current.articleKey) renderSkuModal(current.articleKey);
  return current;
}

async function updateTaskStatus(taskId, status) {
  return updateTaskRecord(taskId, { status });
}

async function closeTaskWithReport(taskId, report) {
  const task = await updateTaskRecord(taskId, { status: 'done' });
  if (!task) return null;
  await createTaskHistoryEntry(taskId, 'report', `Задача закрыта с отчётом: ${report}`);
  return task;
}

function exportStorage() {
  const blob = new Blob([JSON.stringify(state.storage, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `altea-portal-storage-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importStorage(file) {
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  mergeImportedStorage(data);
  rerenderCurrentView();
  if (state.activeSku) renderSkuModal(state.activeSku);
}

function applyControlPreset(preset) {
  state.controlFilters.status = 'active';
  state.controlFilters.horizon = 'all';
  state.controlFilters.type = 'all';

  if (preset === 'overdue') {
    state.controlFilters.horizon = 'overdue';
  } else if (preset === 'no_owner') {
    state.controlFilters.horizon = 'no_owner';
  } else if (preset === 'critical') {
    state.controlFilters.type = 'price_margin';
  }
}

function closeSkuModal() {
  document.getElementById('skuModal').classList.remove('open');
  state.activeSku = null;
}

function openSkuModal(articleKey) {
  renderSkuModal(articleKey);
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  window.dispatchEvent(new CustomEvent('altea:viewchange', { detail: { view } }));
  void prepareView(view);
}

async function prepareView(view) {
  if (!state.boot.dataReady) {
    rerenderCurrentView();
    return;
  }

  const lazyKey = VIEW_DATA_REQUIREMENTS[view];
  if (lazyKey && !state.boot.lazyReady?.[lazyKey]) {
    renderViewLoading(`view-${view}`, VIEW_TITLES[view] || 'Экран');
  }

  try {
    await ensureViewData(view);
  } catch (error) {
    console.error(error);
    renderViewFailure(`view-${view}`, VIEW_TITLES[view] || 'Экран', error);
    setAppError(`Портал не смог подгрузить ${VIEW_TITLES[view] || 'экран'}: ${error.message}`);
    return;
  }

  if (state.activeView !== view) return;
  rerenderCurrentView();
}

function renderViewFailure(rootId, title, error) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = `
    <div class="card">
      <div class="head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <div class="muted small">Экран не удалось отрисовать полностью</div>
        </div>
        ${badge('ошибка', 'danger')}
      </div>
      <div class="muted" style="margin-top:10px">${escapeHtml(error?.message || 'Неизвестная ошибка')}</div>
      <div class="muted small" style="margin-top:8px">Обнови страницу после фикса или синка. Остальные разделы портала продолжают работать.</div>
    </div>
  `;
}

function rerenderCurrentView() {
  applyOwnerOverridesToSkus();
  const renderPlan = [
    ['view-dashboard', 'Дашборд', renderDashboard],
    ['view-documents', 'Документы', renderDocuments],
    ['view-repricer', 'Репрайсер', renderRepricer],
    ['view-prices', 'Цены', () => { if (typeof window.renderPriceWorkbench === 'function') window.renderPriceWorkbench(); }],
    ['view-order', 'Логистика и заказ', renderOrderCalculator],
    ['view-control', 'Задачи', renderControlCenter],
    ['view-skus', 'Реестр SKU', renderSkuRegistry],
    ['view-launches', 'Продукт / Ксения', renderLaunches],
    ['view-launch-control', 'Запуск новинок', renderLaunchControl],
    ['view-meetings', 'Ритм работы', renderMeetings],
    ['view-executive', 'Руководителю', renderExecutive]
  ];
  const errors = [];
  const activeRootId = `view-${state.activeView || 'dashboard'}`;
  const activeEntry = renderPlan.find(([rootId]) => rootId === activeRootId) || renderPlan[0];
  if (activeEntry) {
    const [rootId, title, renderer] = activeEntry;
    try {
      renderer();
    } catch (error) {
      console.error(error);
      errors.push(`${title}: ${error.message}`);
      renderViewFailure(rootId, title, error);
    }
  }
  state.runtimeErrors = errors;
  updateSyncBadge();
  if (errors.length) setAppError(`Портал загрузил не всё: ${errors[0]}`);
  else setAppError('');
}

function setAppError(message = '') {
  const banner = document.getElementById('appError');
  if (!message) {
    banner.classList.add('hidden');
    banner.textContent = '';
    return;
  }
  banner.textContent = message;
  banner.classList.remove('hidden');
}

function attachGlobalListeners() {
  if (state.boot.listenersAttached) return;
  state.boot.listenersAttached = true;
  ensureTaskModal();
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));

  document.body.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-open-sku]');
    if (openBtn) {
      if (document.getElementById('taskModal')?.classList.contains('open')) closeTaskModal();
      openSkuModal(openBtn.dataset.openSku);
      return;
    }

    const openTaskBtn = event.target.closest('[data-open-task]');
    if (openTaskBtn) {
      openTaskModal(openTaskBtn.dataset.openTask);
      return;
    }

    const closeBtn = event.target.closest('[data-close-modal]');
    if (closeBtn) {
      closeSkuModal();
      return;
    }

    const presetBtn = event.target.closest('[data-control-preset]');
    if (presetBtn) {
      applyControlPreset(presetBtn.dataset.controlPreset);
      setView('control');
      return;
    }

    if (event.target.closest('[data-view-control]')) {
      setView('control');
      return;
    }

    if (event.target.closest('[data-view-executive]')) {
      setView('executive');
      return;
    }

    const takeBtn = event.target.closest('[data-take-task]');
    if (takeBtn) {
      takeAutoTask(takeBtn.dataset.takeTask);
      return;
    }
  });

  document.getElementById('skuModal').addEventListener('click', (event) => {
    if (event.target.id === 'skuModal') closeSkuModal();
  });

  document.getElementById('exportStorageBtn').addEventListener('click', exportStorage);
  document.getElementById('pullRemoteBtn').addEventListener('click', async () => { await pullRemoteState(true); });
  document.getElementById('pushRemoteBtn').addEventListener('click', async () => { await pushStateToRemote(); });
  document.getElementById('importStorageInput').addEventListener('change', async (event) => {
    try {
      await importStorage(event.target.files?.[0]);
      event.target.value = '';
    } catch (error) {
      setAppError(`Не удалось импортировать JSON: ${error.message}`);
    }
  });
}

async function init() {
  attachGlobalListeners();
  state.boot.dataWarnings = [];
  window.__ALTEA_PRIMARY_INIT_PENDING__ = true;
  // Критично: попытка подключения к Supabase не должна зависеть от первого рендера.
  // Иначе любой сбой данных/экрана создает ложное ощущение, что портал даже не пытался подключиться.
  const teamInitPromise = initTeamStore()
    .then(() => {
      if (!state.boot.dataReady) return;
      try {
        rerenderCurrentView();
        if (state.activeSku) renderSkuModal(state.activeSku);
      } catch (error) {
        console.error(error);
        setAppError(`Командная база подключена, но экран не удалось перерисовать: ${error.message}`);
      }
    })
    .catch((error) => {
      console.error(error);
      setAppError(`Портал открылся локально: ${error.message || 'ошибка подключения к командной базе'}`);
    });

  try {
    const local = loadLocalStorage();
    const [dashboard, skus, seed] = await Promise.all([
      loadJsonOrFallback('data/dashboard.json', { cards: [], generatedAt: '' }, 'Дашборд'),
      loadJsonOrFallback('data/skus.json', [], 'SKU'),
      loadJsonOrFallback('data/seed_comments.json', { comments: [], tasks: [] }, 'Seed comments')
    ]);

    state.dashboard = dashboard || { cards: [] };
    state.skus = Array.isArray(skus) ? skus : [];
    state.launches = [];
    state.meetings = [];
    state.documents = { groups: [] };
    state.repricer = { generatedAt: '', summary: {}, rows: [] };
    if (!state.orderCalc.articleKey) state.orderCalc.articleKey = state.skus[0]?.articleKey || '';
    if (!state.orderCalc.daysToNextReceipt) state.orderCalc.daysToNextReceipt = String(Math.round(numberOrZero(state.skus[0]?.leadTimeDays) || 30));
    state.storage = {
      comments: Array.isArray(local.comments) ? local.comments : [],
      tasks: Array.isArray(local.tasks) ? local.tasks : [],
      decisions: Array.isArray(local.decisions) ? local.decisions : [],
      ownerOverrides: Array.isArray(local.ownerOverrides) ? local.ownerOverrides : []
    };
    applyOwnerOverridesToSkus();
    mergeSeedStorage(seed || {});
    state.boot.dataReady = true;
    rerenderCurrentView();
    setView('dashboard');
    if (state.boot.dataWarnings.length) setAppError(`Часть данных загружена с исправлениями: ${state.boot.dataWarnings[0]}`);
    else setAppError('');
  } catch (error) {
    console.error(error);
    setAppError(`Портал не смог загрузить данные: ${error.message}`);
  } finally {
    window.__ALTEA_PRIMARY_INIT_PENDING__ = false;
    window.__ALTEA_PRIMARY_INIT_FINISHED__ = true;
  }

  return teamInitPromise;
}

init();
