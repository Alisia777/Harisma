#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { execFileSync } = require('child_process');
const XLSX = require('xlsx');

const BRAND = 'Алтея';
function todayIso() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const TODAY = String(process.env.ALTEA_TODAY || todayIso()).slice(0, 10);

function isoDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}
const DEFAULT_SOURCE_WORKBOOK = path.join('.altea-google-sheet-sync-output', 'tmp-source-google-current.xlsx');
const DEFAULT_WB_REPORT = 'report 2026-5-5.xlsx';
const DEFAULT_WB_NM_MAP = '0.xlsx';
const DEFAULT_OUTPUT_DIR = 'exports';
const WB_ANALYTICS_URL = 'https://seller-analytics-api.wildberries.ru';
const OZON_SELLER_URL = 'https://api-seller.ozon.ru';
const LETUAL_DEFAULT_BASE_URL = 'https://partner.letu.ru';
const LETUAL_DEFAULT_GRAPHQL_PATH = '/api/graphql';
const MEGAMARKET_DEFAULT_BASE_URL = 'https://api.megamarket.tech';
const MEGAMARKET_ORDER_SEARCH_PATH = '/api/market/v1/orderService/order/search';
const MEGAMARKET_ORDER_GET_PATH = '/api/market/v2/orderService/order/get';
const LETUAL_DEFAULT_LOCAL_EXPORT_XLSX = 'C:/Users/artiu/Downloads/Letu.xlsx';
const LETUAL_DEFAULT_PLAN_XLSX = 'C:/Users/artiu/OneDrive/Рабочий стол/План/Лэтуаль.xlsx';
const ZYA_DEFAULT_SALES_XLSX = path.join('data', 'external_sources', 'zya_plan.xlsx');
const ZYA_DRIVE_SALES_XLSX = path.join('data', 'external_sources', 'zya_sales_drive.xlsx');
const MAGNIT_DRIVE_SALES_XLSX = path.join('data', 'external_sources', 'magnit_sales_drive.xlsx');
const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');
const TELEGRAM_DOWNLOADS_DIR = path.join(DOWNLOADS_DIR, 'Telegram Desktop');
const ZYA_LOCAL_SALES_XLSX_CANDIDATES = [
  ZYA_DRIVE_SALES_XLSX,
  path.join(TELEGRAM_DOWNLOADS_DIR, '\u0417\u042f 2.xlsx'),
  path.join(DOWNLOADS_DIR, '\u0417\u043e\u043b\u043e\u0442\u043e\u0435 \u042f\u0431\u043b\u043e\u043a\u043e.xlsx'),
  ZYA_DEFAULT_SALES_XLSX
];
const ZYA_LOCAL_SALES_ZIP = path.join(TELEGRAM_DOWNLOADS_DIR, '\u0417\u042f \u043f\u0440\u043e\u0434\u0430\u0436\u0438.zip');
const ZYA_LOCAL_ADS_XLSX = path.join(TELEGRAM_DOWNLOADS_DIR, '\u0420\u0435\u043a\u043b\u0430\u043c\u0430 \u0417\u042f.xlsx');
const RETAIL_NETWORK_SALES_DEFAULT_XLSX = path.join('data', 'external_sources', 'retail_network_sales.xlsx');
const LETUAL_CPC_STATS_QUERY = `
  query getCpcStats($where: CpcStatsFilter!, $limit: Int!, $offset: Int!) {
    cpcStats(where: $where, limit: $limit, offset: $offset) {
      count
      rows {
        website {
          id
          name
          alias
        }
        user {
          id
          email
        }
        cost
        clicks
      }
    }
  }
`;

const OZONE_METRICS = [
  'hits_view_search',
  'hits_view_pdp',
  'hits_view',
  'hits_tocart_search',
  'hits_tocart_pdp',
  'hits_tocart',
  'session_view_search',
  'session_view_pdp',
  'session_view',
  'revenue',
  'returns',
  'cancellations',
  'ordered_units',
  'delivered_units'
];

const OZON_METRIC_MAP = {
  hits_view_search: 'impressions_search',
  hits_view_pdp: 'pdp_views',
  hits_view: 'impressions_total',
  hits_tocart_search: 'add_to_cart_search',
  hits_tocart_pdp: 'add_to_cart_pdp',
  hits_tocart: 'add_to_cart_total',
  session_view_search: 'sessions_search',
  session_view_pdp: 'sessions_pdp',
  session_view: 'sessions_total',
  revenue: 'orders_revenue',
  returns: 'returns_units',
  cancellations: 'cancellations_units',
  ordered_units: 'orders_units',
  delivered_units: 'delivered_units'
};

const METRIC_ORDER = [
  'impressions_total',
  'impressions_search',
  'pdp_views',
  'traffic_card_opens',
  'sessions_total',
  'sessions_search',
  'sessions_pdp',
  'add_to_cart_total',
  'add_to_cart_search',
  'add_to_cart_pdp',
  'orders_units',
  'orders_revenue',
  'delivered_units',
  'buyout_units',
  'delivered_revenue',
  'buyout_revenue',
  'returns_units',
  'cancellations_units',
  'cancel_revenue',
  'wishlist',
  'ads_impressions',
  'ads_clicks',
  'ads_spend',
  'ads_orders',
  'ads_revenue',
  'cart_cr',
  'order_cr',
  'buyout_pct',
  'ads_ctr',
  'ads_drr',
  'avg_order_value',
  'ltv_proxy',
  'logistics_cost',
  'storage_cost',
  'penalties',
  'net_payout'
];

const METRICS = {
  impressions_total: ['Показы / просмотры всего', 'шт.'],
  impressions_search: ['Показы в поиске/категории', 'шт.'],
  pdp_views: ['Просмотры карточки / PDP', 'шт.'],
  traffic_card_opens: ['Переходы в карточку / трафик', 'шт.'],
  sessions_total: ['Сессии всего', 'шт.'],
  sessions_search: ['Сессии поиск/категория', 'шт.'],
  sessions_pdp: ['Сессии PDP', 'шт.'],
  add_to_cart_total: ['Добавления в корзину всего', 'шт.'],
  add_to_cart_search: ['Добавления в корзину из поиска', 'шт.'],
  add_to_cart_pdp: ['Добавления в корзину из PDP', 'шт.'],
  orders_units: ['Заказы, шт.', 'шт.'],
  orders_revenue: ['Заказы, руб.', 'руб.'],
  delivered_units: ['Доставлено, шт.', 'шт.'],
  buyout_units: ['Выкупы, шт.', 'шт.'],
  delivered_revenue: ['Доставлено, руб.', 'руб.'],
  buyout_revenue: ['Выкупы, руб.', 'руб.'],
  returns_units: ['Возвраты, шт.', 'шт.'],
  cancellations_units: ['Отмены, шт.', 'шт.'],
  cancel_revenue: ['Отмены, руб.', 'руб.'],
  wishlist: ['Добавления в избранное', 'шт.'],
  ads_impressions: ['Реклама: показы', 'шт.'],
  ads_clicks: ['Реклама: клики', 'шт.'],
  ads_spend: ['Реклама: расход', 'руб.'],
  ads_orders: ['Реклама: заказы', 'шт.'],
  ads_revenue: ['Реклама: выручка', 'руб.'],
  cart_cr: ['CR показ/трафик -> корзина', '%'],
  order_cr: ['CR корзина -> заказ', '%'],
  buyout_pct: ['Выкуп / доставляемость', '%'],
  ads_ctr: ['Реклама: CTR', '%'],
  ads_drr: ['Реклама: ДРР', '%'],
  avg_order_value: ['Средний чек заказа', 'руб.'],
  ltv_proxy: ['LTV proxy: выручка / заказ', 'руб.'],
  logistics_cost: ['Логистика', 'руб.'],
  storage_cost: ['Хранение', 'руб.'],
  penalties: ['Штрафы', 'руб.'],
  net_payout: ['К перечислению / net payout', 'руб.']
};

const PLATFORM_ORDER = [
  ['wb', 'ВБ'],
  ['ozon', 'Озон'],
  ['ym', 'Я Маркет'],
  ['letu', 'Лэтуаль'],
  ['goldapple', 'ЗЯ'],
  ['other', 'Остальное (...)'],
  ['online', 'Онлайн магазины'],
  ['b2b', 'b2b'],
  ['export', 'Экспорт']
];

const OZON_LTV_SCREENSHOT_ROWS = [
  ['2025', 'Итого 2025', 1.04, 1.09, 1.13, 1.17, 1.20, 1.23, 1.24, 1.25, 1.26, 1.26, 1.26, 1.26, 1.26],
  ['2025', 'Апрель', 1.03, 1.07, 1.10, 1.13, 1.15, 1.17, 1.19, 1.21, 1.23, 1.25, 1.26, 1.28, 1.28],
  ['2025', 'Май', 1.04, 1.09, 1.12, 1.15, 1.18, 1.21, 1.24, 1.27, 1.29, 1.31, 1.33, 1.35, 1.35],
  ['2025', 'Июнь', 1.03, 1.07, 1.11, 1.14, 1.17, 1.19, 1.22, 1.24, 1.26, 1.28, 1.30, 1.30, 1.30],
  ['2025', 'Июль', 1.04, 1.08, 1.11, 1.15, 1.18, 1.21, 1.24, 1.26, 1.28, 1.31, 1.31, 1.31, 1.31],
  ['2025', 'Август', 1.04, 1.09, 1.13, 1.18, 1.21, 1.24, 1.27, 1.30, 1.32, 1.32, 1.32, '', 1.32],
  ['2025', 'Сентябрь', 1.03, 1.08, 1.12, 1.16, 1.19, 1.22, 1.24, 1.27, 1.27, '', '', '', 1.27],
  ['2025', 'Октябрь', 1.04, 1.10, 1.15, 1.19, 1.22, 1.25, 1.28, 1.29, 1.29, '', '', '', 1.29],
  ['2025', 'Ноябрь', 1.04, 1.10, 1.15, 1.18, 1.22, 1.25, 1.26, 1.26, '', '', '', '', 1.26],
  ['2025', 'Декабрь', 1.04, 1.09, 1.13, 1.17, 1.20, 1.21, '', '', '', '', '', '', 1.21],
  ['2026', 'Итого 2026', 1.05, 1.10, 1.12, 1.13, 1.13, 1.13, '', '', '', '', '', '', 1.13],
  ['2026', 'Январь', 1.04, 1.11, 1.16, 1.20, 1.21, 1.21, '', '', '', '', '', '', 1.21],
  ['2026', 'Февраль', 1.05, 1.13, 1.18, 1.19, 1.19, '', '', '', '', '', '', '', 1.19],
  ['2026', 'Март', 1.05, 1.11, 1.12, 1.13, '', '', '', '', '', '', '', '', 1.13],
  ['2026', 'Апрель', 1.06, 1.07, 1.07, '', '', '', '', '', '', '', '', '', 1.07],
  ['2026', 'Май', 1.02, 1.03, '', '', '', '', '', '', '', '', '', '', 1.03],
  ['Всего', 'Всего', 1.05, 1.10, 1.13, 1.15, 1.16, 1.17, 1.18, 1.18, 1.18, 1.18, 1.18, 1.18, 1.18]
];

const MARKETPLACE_TO_PLATFORM = {
  WB: 'wb',
  Wildberries: 'wb',
  wb: 'wb',
  OZ: 'ozon',
  Ozon: 'ozon',
  ozon: 'ozon',
  YM: 'ym',
  'Я.Маркет': 'ym',
  'Я Маркет': 'ym',
  ya: 'ym',
  ym: 'ym'
};

function canonicalRequestedPlatform(value) {
  const raw = normalizeKey(value);
  if (!raw || ['all', '*'].includes(raw)) return raw;
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['oz', 'ozon'].includes(raw)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'yandexmarket', '\u044f\u043c\u0430\u0440\u043a\u0435\u0442'].includes(raw)) return 'ym';
  if (['ga', 'goldapple', 'goldenapple', 'zya', '\u0437\u044f', '\u0437\u043e\u043b\u043e\u0442\u043e\u0435\u044f\u0431\u043b\u043e\u043a\u043e'].includes(raw)) return 'goldapple';
  if (['letu', 'letual', 'letoile', '\u043b\u0435\u0442\u0443\u0430\u043b\u044c', '\u043b\u044d\u0442\u0443\u0430\u043b\u044c'].includes(raw)) return 'letu';
  if (['megamarket', 'sbermegamarket', 'mega', '\u043c\u0435\u0433\u0430\u043c\u0430\u0440\u043a\u0435\u0442'].includes(raw)) return 'megamarket';
  if (['samokat', '\u0441\u0430\u043c\u043e\u043a\u0430\u0442'].includes(raw)) return 'samokat';
  if (['magnit', 'magnitmarket', 'mm', '\u043c\u0430\u0433\u043d\u0438\u0442', '\u043c\u0430\u0433\u043d\u0438\u0442\u043c\u0430\u0440\u043a\u0435\u0442'].includes(raw)) return 'magnit';
  return raw;
}

function requestedPlatformSet(value) {
  const requested = normalizeText(value);
  if (!requested) return null;
  const keys = requested
    .split(',')
    .map(canonicalRequestedPlatform)
    .filter((key) => key && !['all', '*'].includes(key));
  return keys.length ? new Set(keys) : null;
}

function platformRequested(options, platformKey) {
  const requested = options?.requestedPlatforms;
  if (!requested) return true;
  const key = canonicalRequestedPlatform(platformKey);
  return requested.has(key) || (key === 'ym' && requested.has('ya')) || (key === 'magnit' && requested.has('magnitmarket'));
}

function parseArgs(argv) {
  const args = { command: 'build' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args.command = token;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    if (key === 'skip-wb-funnel') {
      args.skipWbFunnel = true;
      continue;
    }
    if (key === 'skip-ozon-api') {
      args.skipOzonApi = true;
      continue;
    }
    const value = inlineValue === undefined ? argv[index + 1] : inlineValue;
    if (inlineValue === undefined) index += 1;
    args[key] = value;
  }
  return args;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function firstExistingPath(candidates) {
  for (const candidate of candidates.flat()) {
    const normalized = String(candidate || '').trim();
    if (normalized && fs.existsSync(normalized)) return normalized;
  }
  return '';
}

function explicitOrExistingPath(explicitValue, fallbackCandidates) {
  const normalized = String(explicitValue || '').trim();
  return normalized || firstExistingPath(fallbackCandidates);
}

const USER_ENV_CACHE = new Map();

function userEnv(name) {
  if (process.env.ALTEA_PORTAL_API_IGNORE_USER_ENV) return '';
  if (USER_ENV_CACHE.has(name)) return USER_ENV_CACHE.get(name);
  let value = '';
  if (process.platform === 'win32') {
    try {
      const safeName = String(name).replace(/'/g, "''");
      value = execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        `[Environment]::GetEnvironmentVariable('${safeName}', 'User')`
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (_error) {
      value = '';
    }
  }
  USER_ENV_CACHE.set(name, value);
  return value;
}

function envValue(name) {
  return process.env[name] || userEnv(name) || '';
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function resolveOptions(args) {
  const outputDir = path.resolve(args['output-dir'] || DEFAULT_OUTPUT_DIR);
  const output = path.resolve(args.output || path.join(outputDir, `altea_max_funnel_2025_2026_${timestamp()}.xlsx`));
  const from = isoDate(args.from || args['date-from'] || process.env.ALTEA_API_FROM || process.env.ALTEA_PORTAL_API_MAX_FROM || '2025-01-01') || '2025-01-01';
  const to = isoDate(args.to || args['date-to'] || process.env.ALTEA_API_TO || process.env.ALTEA_PORTAL_API_MAX_TO || TODAY) || TODAY;
  if (from > to) throw new Error(`Invalid API window: ${from}..${to}`);
  return {
    command: args.command || 'build',
    sourceWorkbook: path.resolve(args['source-xlsx'] || DEFAULT_SOURCE_WORKBOOK),
    wbReport: path.resolve(args['wb-report'] || DEFAULT_WB_REPORT),
    wbNmMap: path.resolve(args['wb-nm-map'] || DEFAULT_WB_NM_MAP),
    output,
    fetchOzonApi: !args.skipOzonApi,
    fetchWbFunnel: !args.skipWbFunnel,
    ozonClientId: String(args['ozon-client-id'] || process.env.ALTEA_OZON_CLIENT_ID || '').trim(),
    ozonApiKey: String(args['ozon-api-key'] || process.env.ALTEA_OZON_API_KEY || '').trim(),
    wbAnalyticsToken: String(args['wb-token'] || process.env.ALTEA_WB_API_TOKEN || process.env.ALTEA_WB_PROMOTION_TOKEN || '').trim(),
    ymApiKey: String(args['ym-api-key'] || process.env.ALTEA_YM_API_KEY || '').trim(),
    ymCampaignId: String(args['ym-campaign-id'] || process.env.ALTEA_YM_CAMPAIGN_ID || '').trim(),
    ymBusinessId: String(args['ym-business-id'] || process.env.ALTEA_YM_BUSINESS_ID || '').trim(),
    ymUseShowsSales: asBool(args['ym-use-shows-sales'] ?? process.env.ALTEA_YM_USE_SHOWS_SALES, false),
    zyaApiToken: String(args['zya-token'] || args['zya-api-token'] || process.env.ALTEA_ZYA_API_TOKEN || process.env.ALTEA_ZYA_API_KEY || process.env.ALTEA_GOLDAPPLE_API_TOKEN || process.env.ALTEA_GOLDAPPLE_API_KEY || '').trim(),
    zyaApiBaseUrl: String(args['zya-base-url'] || process.env.ALTEA_ZYA_API_BASE_URL || process.env.ALTEA_GOLDAPPLE_API_BASE_URL || '').trim(),
    zyaSalesPath: String(args['zya-sales-path'] || process.env.ALTEA_ZYA_SALES_PATH || process.env.ALTEA_GOLDAPPLE_SALES_PATH || '').trim(),
    zyaClientId: String(args['zya-client-id'] || process.env.ALTEA_ZYA_CLIENT_ID || process.env.ALTEA_GOLDAPPLE_CLIENT_ID || '').trim(),
    letualApiToken: String(args['letual-token'] || envValue('ALTEA_LETUAL_API_TOKEN') || '').trim(),
    letualApiBaseUrl: String(args['letual-base-url'] || envValue('ALTEA_LETUAL_API_BASE_URL') || LETUAL_DEFAULT_BASE_URL).trim(),
    letualSalesPath: String(args['letual-sales-path'] || envValue('ALTEA_LETUAL_SALES_PATH') || LETUAL_DEFAULT_GRAPHQL_PATH).trim(),
    letualClientId: String(args['letual-client-id'] || envValue('ALTEA_LETUAL_CLIENT_ID') || '').trim(),
    letualFullHistory: asBool(args['letual-full-history'] ?? envValue('ALTEA_LETUAL_FULL_HISTORY'), false),
    letualLocalExportXlsx: String(args['letual-local-export-xlsx'] || envValue('ALTEA_LETUAL_LOCAL_EXPORT_XLSX') || LETUAL_DEFAULT_LOCAL_EXPORT_XLSX).trim(),
    letualPlanXlsx: String(args['letual-plan-xlsx'] || envValue('ALTEA_LETUAL_PLAN_XLSX') || LETUAL_DEFAULT_PLAN_XLSX).trim(),
    zyaSalesZip: explicitOrExistingPath(args['zya-sales-zip'] || process.env.ALTEA_ZYA_SALES_ZIP, [ZYA_LOCAL_SALES_ZIP]),
    zyaSalesXlsx: explicitOrExistingPath(args['zya-sales-xlsx'] || process.env.ALTEA_ZYA_SALES_XLSX, ZYA_LOCAL_SALES_XLSX_CANDIDATES),
    zyaAdsXlsx: explicitOrExistingPath(args['zya-ads-xlsx'] || process.env.ALTEA_ZYA_ADS_XLSX, [ZYA_LOCAL_ADS_XLSX]),
    retailNetworkSalesXlsx: String(args['retail-network-sales-xlsx'] || process.env.ALTEA_RETAIL_NETWORK_SALES_XLSX || RETAIL_NETWORK_SALES_DEFAULT_XLSX).trim(),
    magnitApiToken: String(args['magnit-token'] || args['magnit-api-token'] || process.env.ALTEA_MAGNIT_API_TOKEN || process.env.ALTEA_MAGNIT_API_KEY || process.env.ALTEA_MAGNIT_MARKET_API_TOKEN || process.env.ALTEA_MAGNIT_MARKET_API_KEY || '').trim(),
    magnitApiBaseUrl: String(args['magnit-base-url'] || process.env.ALTEA_MAGNIT_API_BASE_URL || process.env.ALTEA_MAGNIT_MARKET_API_BASE_URL || '').trim(),
    magnitSalesPath: String(args['magnit-sales-path'] || process.env.ALTEA_MAGNIT_SALES_PATH || process.env.ALTEA_MAGNIT_MARKET_SALES_PATH || '').trim(),
    magnitClientId: String(args['magnit-client-id'] || process.env.ALTEA_MAGNIT_CLIENT_ID || process.env.ALTEA_MAGNIT_MARKET_CLIENT_ID || '').trim(),
    magnitSalesCsv: String(args['magnit-sales-csv'] || process.env.ALTEA_MAGNIT_SALES_CSV || '').trim(),
    magnitSalesXlsx: explicitOrExistingPath(
      args['magnit-sales-xlsx'] || args['magnit-sales-workbook'] || process.env.ALTEA_MAGNIT_SALES_XLSX || process.env.ALTEA_MAGNIT_SALES_WORKBOOK,
      [MAGNIT_DRIVE_SALES_XLSX]
    ),
    magnitServicesCsv: String(args['magnit-services-csv'] || process.env.ALTEA_MAGNIT_SERVICES_CSV || '').trim(),
    megamarketApiToken: String(args['megamarket-token'] || args['megamarket-api-token'] || envValue('ALTEA_MEGAMARKET_API_TOKEN') || envValue('ALTEA_MEGAMARKET_API_KEY') || '').trim(),
    megamarketApiBaseUrl: String(args['megamarket-base-url'] || envValue('ALTEA_MEGAMARKET_API_BASE_URL') || MEGAMARKET_DEFAULT_BASE_URL).trim(),
    megamarketSalesPath: String(args['megamarket-sales-path'] || envValue('ALTEA_MEGAMARKET_SALES_PATH') || MEGAMARKET_ORDER_SEARCH_PATH).trim(),
    megamarketOrderGetPath: String(args['megamarket-order-get-path'] || envValue('ALTEA_MEGAMARKET_ORDER_GET_PATH') || MEGAMARKET_ORDER_GET_PATH).trim(),
    megamarketClientId: String(args['megamarket-client-id'] || envValue('ALTEA_MEGAMARKET_CLIENT_ID') || '').trim(),
    samokatApiToken: String(args['samokat-token'] || args['samokat-api-token'] || envValue('ALTEA_SAMOKAT_API_TOKEN') || envValue('ALTEA_SAMOKAT_API_KEY') || '').trim(),
    samokatApiBaseUrl: String(args['samokat-base-url'] || envValue('ALTEA_SAMOKAT_API_BASE_URL') || '').trim(),
    samokatSalesPath: String(args['samokat-sales-path'] || envValue('ALTEA_SAMOKAT_SALES_PATH') || '').trim(),
    samokatClientId: String(args['samokat-client-id'] || envValue('ALTEA_SAMOKAT_CLIENT_ID') || '').trim(),
    requestedPlatforms: requestedPlatformSet(args.platforms || args['extra-platforms'] || envValue('ALTEA_PORTAL_API_PLATFORMS') || ''),
    from,
    to
  };
}

function readWorkbook(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return XLSX.readFile(filePath, { cellDates: false });
}

function fileMtimeIso(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch (_error) {
    return '';
  }
}

function fileMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs || 0;
  } catch (_error) {
    return 0;
  }
}

function withFileMtime(filePath, detail) {
  const mtime = fileMtimeIso(filePath);
  return mtime ? `${detail}; fileMtime=${mtime.slice(0, 10)}` : detail;
}

function sheetRows(workbook, sheetName, options = {}) {
  if (!workbook || !workbook.Sheets[sheetName]) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false, ...options });
}

function numberOrZero(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let normalized = String(value)
    .replace(/\s+/g, '')
    .replace(/₽/g, '')
    .replace(/руб\.?/gi, '')
    .replace(/%/g, '')
    .trim();
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    const commaParts = normalized.split(',');
    normalized = commaParts.length === 2 && /^\d{3}$/.test(commaParts[1])
      ? commaParts.join('')
      : normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^\p{L}0-9]+/gu, '');
}

function monthKey(value) {
  if (!value && value !== 0) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 7);
  const raw = normalizeText(value);
  let match = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (match) return `${match[1]}-${match[2]}`;
  match = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${String(Number(match[2])).padStart(2, '0')}`;
  }
  return '';
}

function monthKeyFromExcelSerial(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const formatted = XLSX.SSF.format('yyyy-mm', value);
  return /^\d{4}-\d{2}$/.test(formatted) ? formatted : '';
}

function normalizeYear(value) {
  const raw = normalizeText(value);
  if (/^\d{4}$/.test(raw)) return raw;
  if (/^\d{2}$/.test(raw)) return `20${raw}`;
  return '';
}

function monthKeyFromRussianText(value, fallbackYear = '') {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return '';
  const year = normalizeYear(raw.match(/(20\d{2}|\d{2})/)?.[1] || fallbackYear);
  const monthTokens = [
    ['\u044f\u043d\u0432\u0430\u0440', '01'],
    ['\u044f\u043d\u0432', '01'],
    ['\u0444\u0435\u0432\u0440\u0430\u043b', '02'],
    ['\u0444\u0435\u0432', '02'],
    ['\u043c\u0430\u0440\u0442', '03'],
    ['\u043c\u0430\u0440', '03'],
    ['\u0430\u043f\u0440\u0435\u043b', '04'],
    ['\u0430\u043f\u0440', '04'],
    ['\u043c\u0430\u0439', '05'],
    ['\u043c\u0430\u044f', '05'],
    ['\u0438\u044e\u043d', '06'],
    ['\u0438\u044e\u043b', '07'],
    ['\u0430\u0432\u0433\u0443\u0441\u0442', '08'],
    ['\u0430\u0432\u0433', '08'],
    ['\u0441\u0435\u043d\u0442\u044f\u0431\u0440', '09'],
    ['\u0441\u0435\u043d', '09'],
    ['\u043e\u043a\u0442\u044f\u0431\u0440', '10'],
    ['\u043e\u043a\u0442', '10'],
    ['\u043d\u043e\u044f\u0431\u0440', '11'],
    ['\u043d\u043e\u044f', '11'],
    ['\u0434\u0435\u043a\u0430\u0431\u0440', '12'],
    ['\u0434\u0435\u043a', '12'],
    ['январ', '01'],
    ['янв', '01'],
    ['феврал', '02'],
    ['фев', '02'],
    ['март', '03'],
    ['мар', '03'],
    ['апрел', '04'],
    ['апр', '04'],
    ['май', '05'],
    ['мая', '05'],
    ['июн', '06'],
    ['июл', '07'],
    ['август', '08'],
    ['авг', '08'],
    ['сентябр', '09'],
    ['сен', '09'],
    ['октябр', '10'],
    ['окт', '10'],
    ['ноябр', '11'],
    ['ноя', '11'],
    ['декабр', '12'],
    ['дек', '12']
  ];
  for (const [needle, month] of monthTokens) {
    if (raw.includes(needle)) return year ? `${year}-${month}` : '';
  }
  return '';
}

function months2025And2026() {
  const months = [];
  for (const year of [2025, 2026]) {
    for (let month = 1; month <= 12; month += 1) months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

function monthEnd(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function monthRange(month) {
  const [yearPart, monthPart] = String(month).split('-');
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) return null;
  return {
    from: `${year}-${String(monthNumber).padStart(2, '0')}-01`,
    to: monthEnd(year, monthNumber)
  };
}

function trailingMonths(toDate, count) {
  const match = String(toDate || TODAY).slice(0, 10).match(/^(\d{4})-(\d{2})/);
  if (!match) return [];
  const result = [];
  const cursor = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const monthCount = Math.max(1, Number(count) || 1);
  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - offset, 1));
    result.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const allowed = new Set(months2025And2026());
  return result.filter((month) => allowed.has(month));
}

function isRateMetric(metricKey) {
  return ['cart_cr', 'order_cr', 'buyout_pct', 'ads_ctr', 'ads_drr'].includes(metricKey);
}

class MetricStore {
  constructor() {
    this.rows = new Map();
    this.sources = new Map();
  }

  key(parts) {
    return [
      parts.level || 'total',
      parts.platformKey || '',
      parts.articleKey || '',
      parts.metricKey || ''
    ].join('|');
  }

  ensure(parts) {
    const key = this.key(parts);
    if (!this.rows.has(key)) {
      const [metricLabel, unit] = METRICS[parts.metricKey] || [parts.metricKey, ''];
      this.rows.set(key, {
        brand: BRAND,
        level: parts.level || 'total',
        platformKey: parts.platformKey || '',
        platform: platformLabel(parts.platformKey),
        articleKey: parts.articleKey || '',
        article: parts.article || parts.articleKey || '',
        name: parts.name || '',
        metricKey: parts.metricKey,
        metric: metricLabel,
        unit,
        values: {},
        source: parts.source || ''
      });
    }
    const row = this.rows.get(key);
    if (parts.source) {
      row.source = row.source ? mergeSource(row.source, parts.source) : parts.source;
      this.sources.set(parts.source, true);
    }
    if (parts.article && !row.article) row.article = parts.article;
    if (parts.name && !row.name) row.name = parts.name;
    return row;
  }

  add(parts, month, value) {
    if (!month || !months2025And2026().includes(month)) return;
    const numeric = numberOrZero(value);
    if (!numeric && value !== 0) return;
    const row = this.ensure(parts);
    row.values[month] = numberOrZero(row.values[month]) + numeric;
  }

  set(parts, month, value) {
    if (!month || !months2025And2026().includes(month)) return;
    const row = this.ensure(parts);
    row.values[month] = numberOrZero(value);
  }

  get(level, platformKey, articleKey, metricKey) {
    return this.rows.get(this.key({ level, platformKey, articleKey, metricKey }));
  }

  value(level, platformKey, articleKey, metricKey, month) {
    return numberOrZero(this.get(level, platformKey, articleKey, metricKey)?.values?.[month]);
  }

  allRows() {
    return Array.from(this.rows.values());
  }

  removeWhere(predicate) {
    for (const [key, row] of this.rows.entries()) {
      if (predicate(row)) this.rows.delete(key);
    }
  }
}

function mergeSource(left, right) {
  const pieces = new Set(String(left).split(' + ').concat(String(right).split(' + ')).map((item) => item.trim()).filter(Boolean));
  return Array.from(pieces).join(' + ');
}

function platformLabel(platformKey) {
  return PLATFORM_LABEL_OVERRIDES[platformKey] || PLATFORM_ORDER_EXTENDED.find(([key]) => key === platformKey)?.[1] || platformKey;
}

function metricParts(metricKey) {
  return { metricKey };
}

const PLATFORM_ORDER_EXTENDED = PLATFORM_ORDER.concat([
  ['magnitmarket', 'Магнит Маркет'],
  ['megamarket', 'Megamarket'],
  ['samokat', 'Samokat']
]);

const PLATFORM_LABEL_OVERRIDES = {
  magnitmarket: 'Магнит Маркет',
  megamarket: 'Megamarket',
  samokat: 'Samokat'
};

const MARKETPLACE_PLATFORM_OVERRIDES = {
  зя: 'goldapple',
  'золотоеяблоко': 'goldapple',
  'золотое яблоко': 'goldapple',
  'магнитмаркет': 'magnitmarket',
  'магнит маркет': 'magnitmarket',
  megamarket: 'megamarket',
  'mega market': 'megamarket',
  samokat: 'samokat'
};

function marketplacePlatformKey(value) {
  const raw = normalizeText(value);
  const key = normalizeKey(value);
  return (
    MARKETPLACE_TO_PLATFORM[raw]
    || MARKETPLACE_TO_PLATFORM[key]
    || MARKETPLACE_PLATFORM_OVERRIDES[key]
    || MARKETPLACE_PLATFORM_OVERRIDES[raw.toLowerCase()]
    || ''
  );
}

function sourceNote(notes, source, status, detail = '') {
  notes.push({ source, status, detail });
}

function loadLetualArticleMap(filePath) {
  const map = new Map();
  if (!filePath) return map;
  const workbook = readWorkbook(filePath);
  if (!workbook) return map;

  const pushRows = (sheetName, articleFields, nameFields) => {
    if (!workbook.SheetNames.includes(sheetName)) return;
    for (const row of sheetRows(workbook, sheetName)) {
      const article = normalizeText(articleFields.map((field) => row[field]).find((value) => normalizeText(value)));
      const name = normalizeText(nameFields.map((field) => row[field]).find((value) => normalizeText(value)));
      if (!article || !name) continue;
      if (!map.has(article)) map.set(article, name);
      const normalizedArticle = normalizeKey(article);
      if (normalizedArticle && !map.has(normalizedArticle)) map.set(normalizedArticle, name);
    }
  };

  pushRows('Сводная', ['Артикул', 'Артикул Алькора'], ['Название', 'Название товара']);
  pushRows('Продажи', ['Артикул', 'Артикул Алькора'], ['Название товара', 'Название']);
  pushRows('Лист1', ['Артикул'], ['Артикул']);
  return map;
}

function loadLetualSalesMap(filePath) {
  const map = new Map();
  if (!filePath) return map;
  const workbook = readWorkbook(filePath);
  if (!workbook) return map;
  if (!workbook.SheetNames.includes('Продажи')) return map;

  const pickField = (row, needles) => {
    const field = Object.keys(row).find((key) => needles.some((needle) => String(key).includes(needle)));
    return field ? row[field] : '';
  };

  for (const row of sheetRows(workbook, 'Продажи')) {
    const article = normalizeText(row['Артикул'] || row['Артикул Алькор']);
    if (!article) continue;
    const units = numberOrZero(pickField(row, ['Всего. Заказано']));
    const revenue = numberOrZero(pickField(row, ['Всего. Заказано, Р']));
    const name = normalizeText(row['Название товара'] || row['Название'] || article);
    const record = {
      name,
      units,
      revenue,
      revenuePerUnit: units ? revenue / units : 0
    };
    map.set(article, record);
    const normalizedArticle = normalizeKey(article);
    if (normalizedArticle && !map.has(normalizedArticle)) map.set(normalizedArticle, record);
  }
  return map;
}

function loadWbNmMap(filePath) {
  const workbook = readWorkbook(filePath);
  const result = new Map();
  if (!workbook) return result;
  const firstSheet = workbook.SheetNames[0];
  for (const row of sheetRows(workbook, firstSheet)) {
    const nmId = normalizeText(row['Артикул WB'] || row['nmID'] || row['nmId']);
    const article = normalizeText(row['Артикул продавца'] || row['supplierArticle'] || row['vendorCode']);
    const name = normalizeText(row['Наименование'] || row['name']);
    if (nmId) result.set(String(Math.trunc(numberOrZero(nmId))), { article, name });
  }
  return result;
}

function addWbReport(store, filePath, notes) {
  const workbook = readWorkbook(filePath);
  if (!workbook) {
    sourceNote(notes, 'WB seller report XLSX', 'missing', filePath);
    return;
  }
  const rows = sheetRows(workbook, workbook.SheetNames[0]);
  let count = 0;
  for (const row of rows) {
    const year = String(row['Год'] || '').trim();
    const rawMonth = String(row['Месяц'] || '').trim();
    const rawDay = String(row['День'] || '').trim();
    if (!/^(2025|2026)$/.test(year) || !/^\d{1,2}$/.test(rawMonth) || rawDay) continue;
    const month = `${year}-${String(Number(rawMonth)).padStart(2, '0')}`;
    if (!months2025And2026().includes(month)) continue;
    const common = { level: 'total', platformKey: 'wb', source: 'WB seller report XLSX' };
    store.add({ ...common, ...metricParts('orders_revenue') }, month, row['Сумма заказов по розничным ценам с учётом согласованной скидки, руб.']);
    store.add({ ...common, ...metricParts('orders_units') }, month, row['Заказано, шт.']);
    store.add({ ...common, ...metricParts('buyout_revenue') }, month, row['Сумма продаж по розничным ценам с учётом согласованной скидки, руб.']);
    store.add({ ...common, ...metricParts('buyout_units') }, month, row['Выкупили, шт.']);
    store.add({ ...common, ...metricParts('net_payout') }, month, row['К перечислению за товар, руб.']);
    store.add({ ...common, ...metricParts('logistics_cost') }, month, row['Стоимость логистики, руб.']);
    store.add({ ...common, ...metricParts('storage_cost') }, month, row['Стоимость хранения, руб.']);
    store.add({ ...common, ...metricParts('penalties') }, month, row['Штрафы, руб.']);
    count += 1;
  }
  sourceNote(notes, 'WB seller report XLSX', count ? 'loaded' : 'empty', `${count} month rows from ${path.basename(filePath)}`);
}

function addFactMarketplace(store, workbook, notes, options = {}) {
  const rows = sheetRows(workbook, 'fact_marketplace_daily_sku');
  if (!rows.length) {
    sourceNote(notes, 'fact_marketplace_daily_sku', 'missing/empty');
    return;
  }
  let count = 0;
  for (const row of rows) {
    const platformKey = marketplacePlatformKey(row.marketplace);
    if (!platformKey) continue;
    if (!platformRequested(options, platformKey)) continue;
    const month = monthKey(row.date);
    if (!month) continue;
    const article = normalizeText(row.item_code);
    const source = 'Google fact_marketplace_daily_sku';
    const commonTotal = { level: 'total', platformKey, source };
    const commonSku = { level: 'sku', platformKey, articleKey: article || `${platformKey}-unmapped`, article, source };
    const units = numberOrZero(row.sales_qty || row.wb_quantity_sold || row.oz_quantity_sold);
    const revenue = numberOrZero(row.revenue || row.wb_finished_price || row.oz_seller_price);
    if (platformKey === 'ym') {
      store.add({ ...commonTotal, ...metricParts('orders_units') }, month, units);
      store.add({ ...commonTotal, ...metricParts('orders_revenue') }, month, revenue);
    }
    if (article) {
      store.add({ ...commonSku, ...metricParts('orders_units') }, month, units);
      store.add({ ...commonSku, ...metricParts('orders_revenue') }, month, revenue);
    }
    count += 1;
  }
  sourceNote(notes, 'Google fact_marketplace_daily_sku', 'loaded', `${count} daily SKU rows`);
}

function addFactAds(store, workbook, notes, options = {}) {
  const rows = sheetRows(workbook, 'fact_ads_daily_sku');
  if (!rows.length) {
    sourceNote(notes, 'fact_ads_daily_sku', 'missing/empty');
    return;
  }
  let count = 0;
  for (const row of rows) {
    const platformKey = marketplacePlatformKey(row.platform);
    if (!platformKey) continue;
    if (!platformRequested(options, platformKey)) continue;
    const month = monthKey(row.date);
    if (!month) continue;
    const article = normalizeText(row.offer_id || row.sku);
    const name = normalizeText(row.offer_id);
    const source = 'Google fact_ads_daily_sku';
    const commonTotal = { level: 'total', platformKey, source };
    const commonSku = { level: 'sku', platformKey, articleKey: article || `${platformKey}-ads-unmapped`, article, name, source };
    const metricValues = {
      ads_impressions: row.views_orders,
      ads_clicks: row.clicks_orders,
      ads_spend: row.spend_orders,
      ads_orders: row.orders_count_orders,
      ads_revenue: row.orders_sum_orders
    };
    for (const [metricKey, value] of Object.entries(metricValues)) {
      store.add({ ...commonTotal, ...metricParts(metricKey) }, month, value);
      if (article) store.add({ ...commonSku, ...metricParts(metricKey) }, month, value);
    }
    count += 1;
  }
  sourceNote(notes, 'Google fact_ads_daily_sku', 'loaded', `${count} daily ads rows`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response, attempt) {
  const header = response.headers.get('retry-after');
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return Math.min(60000, attempt * 15000);
}

async function requestJson(url, options, errorPrefix) {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      if (attempt < attempts) {
        await sleep(Math.min(60000, attempt * 15000));
        continue;
      }
      throw error;
    }
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (response.ok) {
      return payload;
    }
    if (attempt < attempts && (response.status === 429 || response.status >= 500 || response.status === 0)) {
      await sleep(retryAfterMs(response, attempt));
      continue;
    }
    throw new Error(`${errorPrefix}: HTTP ${response.status} ${text.slice(0, 700)}`);
  }
  throw new Error(`${errorPrefix}: request failed after retries`);
}

async function fetchOzonAnalytics(options, dimension, from, to) {
  const rows = [];
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const payload = {
      date_from: from,
      date_to: to,
      metrics: OZONE_METRICS,
      dimension,
      filters: [],
      sort: [{ key: 'revenue', order: 'DESC' }],
      limit,
      offset
    };
    const json = await requestJson(`${OZON_SELLER_URL}/v1/analytics/data`, {
      method: 'POST',
      headers: {
        'Client-Id': options.ozonClientId,
        'Api-Key': options.ozonApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, 'Ozon analytics API');
    const batch = Array.isArray(json?.result?.data) ? json.result.data : [];
    rows.push(...batch);
    if (batch.length < limit) break;
  }
  return rows;
}

function addOzonRows(store, rows, level, notes) {
  let count = 0;
  for (const row of rows) {
    const dims = Array.isArray(row.dimensions) ? row.dimensions : [];
    let sku = '';
    let name = '';
    let month = '';
    if (level === 'sku') {
      sku = normalizeText(dims[0]?.id);
      name = normalizeText(dims[0]?.name);
      month = monthKey(dims[1]?.id || dims[1]?.name);
    } else {
      month = monthKey(dims[0]?.id || dims[0]?.name);
    }
    if (!month) continue;
    const metricValues = row.metrics || [];
    for (let index = 0; index < OZONE_METRICS.length; index += 1) {
      const metricKey = OZON_METRIC_MAP[OZONE_METRICS[index]];
      if (!metricKey) continue;
      store.add({
        level,
        platformKey: 'ozon',
        articleKey: sku || '',
        article: sku || '',
        name,
        metricKey,
        source: 'Ozon Seller API /v1/analytics/data'
      }, month, metricValues[index]);
    }
    count += 1;
  }
  sourceNote(notes, `Ozon Seller API ${level}`, 'loaded', `${count} rows`);
}

async function addOzonApi(store, options, notes) {
  if (!options.fetchOzonApi) {
    sourceNote(notes, 'Ozon Seller API', 'skipped', '--skip-ozon-api');
    return;
  }
  if (!options.ozonClientId || !options.ozonApiKey) {
    sourceNote(notes, 'Ozon Seller API', 'missing credentials', 'ALTEA_OZON_CLIENT_ID / ALTEA_OZON_API_KEY');
    return;
  }
  const periods = [
    ['2025-01-01', '2025-12-31'],
    ['2026-01-01', TODAY]
  ];
  for (const [from, to] of periods) {
    const totalRows = await fetchOzonAnalytics(options, ['month'], from, to);
    addOzonRows(store, totalRows, 'total', notes);
    const skuRows = await fetchOzonAnalytics(options, ['sku', 'month'], from, to);
    addOzonRows(store, skuRows, 'sku', notes);
  }
}

function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((line) => line.trim());
  const firstDataLine = lines.find((line) => ((line.match(/;/g) || []).length + (line.match(/,/g) || []).length) > 1) || lines[0] || '';
  const delimiter = (firstDataLine.match(/;/g) || []).length > (firstDataLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const filtered = rows
    .map((item) => item.map((cell) => String(cell ?? '').trim()))
    .filter((item) => item.some((cell) => cell !== ''));
  const headerIndex = filtered.findIndex((item) => item.filter(Boolean).length >= 2);
  if (headerIndex < 0) return [];
  const [header = [], ...body] = filtered.slice(headerIndex);
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ''])));
}

function collectObjects(value, result = []) {
  if (!value) return result;
  if (Array.isArray(value)) {
    value.forEach((item) => collectObjects(item, result));
    return result;
  }
  if (typeof value !== 'object') return result;
  const keys = Object.keys(value);
  if (keys.some((key) => /offer|sku|year|month|day|date|order|sale|show|click|revenue|amount|quantity|vendor|article|дата|месяц|год|артикул|выруч|сумм|колич|заказ|продаж|шт/i.test(key))) {
    result.push(value);
  }
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') collectObjects(nested, result);
  }
  return result;
}

function unzipWithPowerShell(zipPath, destination) {
  fs.mkdirSync(destination, { recursive: true });
  execFileSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(destination)} -Force`
  ], { stdio: 'pipe' });
}

async function wbAnalyticsRequest(options, apiPath, requestOptions = {}) {
  const url = new URL(`${WB_ANALYTICS_URL}${apiPath}`);
  Object.entries(requestOptions.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const method = requestOptions.method || 'GET';
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: options.wbAnalyticsToken,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body)
  });
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/zip')) {
    if (!response.ok) throw new Error(`WB analytics ${apiPath}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`WB analytics ${apiPath}: HTTP ${response.status} ${text.slice(0, 700)}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function createAndDownloadWbFunnelReport(options, startDate, endDate) {
  const id = randomUUID();
  await wbAnalyticsRequest(options, '/api/v2/nm-report/downloads', {
    method: 'POST',
    body: {
      id,
      reportType: 'DETAIL_HISTORY_REPORT',
      userReportName: `Altea max funnel ${startDate} ${endDate}`,
      params: {
        nmIDs: [],
        subjectIds: [],
        brandNames: [BRAND],
        tagIds: [],
        startDate,
        endDate,
        timezone: 'Europe/Moscow',
        aggregationLevel: 'month',
        skipDeletedNm: false
      }
    }
  });

  let status = '';
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 5000 : 15000));
    const list = await wbAnalyticsRequest(options, '/api/v2/nm-report/downloads', {
      query: { 'filter[downloadIds]': id }
    });
    const item = Array.isArray(list?.data) ? list.data.find((entry) => entry.id === id) : null;
    status = normalizeText(item?.status);
    if (status === 'SUCCESS') break;
    if (status === 'FAILED') throw new Error(`WB report ${id} failed`);
  }
  if (status !== 'SUCCESS') throw new Error(`WB report ${id} was not ready in time; last status=${status || 'unknown'}`);

  const zip = await wbAnalyticsRequest(options, `/api/v2/nm-report/downloads/file/${id}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altea-wb-funnel-'));
  const zipPath = path.join(tmpDir, `${id}.zip`);
  fs.writeFileSync(zipPath, zip);
  const extractDir = path.join(tmpDir, 'out');
  unzipWithPowerShell(zipPath, extractDir);
  const csvPath = findFirstFile(extractDir, /\.csv$/i);
  if (!csvPath) throw new Error(`WB report ${id} zip did not contain CSV`);
  return parseCsv(fs.readFileSync(csvPath, 'utf8'));
}

function findFirstFile(dir, pattern) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      const nested = findFirstFile(fullPath, pattern);
      if (nested) return nested;
    } else if (pattern.test(item.name)) {
      return fullPath;
    }
  }
  return '';
}

function addWbFunnelCsvRows(store, csvRows, nmMap, notes, sourceLabel) {
  let count = 0;
  for (const row of csvRows) {
    const nmId = String(Math.trunc(numberOrZero(row.nmID || row.nmId || row.nm_id)));
    const mapped = nmMap.get(nmId) || {};
    const article = mapped.article || (nmId ? `wb-nm-${nmId}` : 'wb-unmapped');
    const name = mapped.name || normalizeText(row.name) || article;
    const month = monthKey(row.dt || row.date || row.month);
    if (!month) continue;
    const commonTotal = { level: 'total', platformKey: 'wb', source: sourceLabel };
    const commonSku = { level: 'sku', platformKey: 'wb', articleKey: article, article, name, source: sourceLabel };
    const metricValues = {
      traffic_card_opens: row.openCardCount,
      add_to_cart_total: row.addToCartCount,
      orders_units: row.ordersCount,
      orders_revenue: row.ordersSumRub,
      buyout_units: row.buyoutsCount,
      buyout_revenue: row.buyoutsSumRub,
      cancellations_units: row.cancelCount,
      cancel_revenue: row.cancelSumRub,
      wishlist: row.addToWishlist
    };
    const totalOnlyMetrics = new Set([
      'traffic_card_opens',
      'add_to_cart_total',
      'cancellations_units',
      'cancel_revenue',
      'wishlist'
    ]);
    for (const [metricKey, value] of Object.entries(metricValues)) {
      if (totalOnlyMetrics.has(metricKey)) {
        store.add({ ...commonTotal, ...metricParts(metricKey) }, month, value);
      }
      store.add({ ...commonSku, ...metricParts(metricKey) }, month, value);
    }
    count += 1;
  }
  sourceNote(notes, sourceLabel, 'loaded', `${count} CSV rows`);
}

async function addWbFunnelApi(store, options, notes) {
  if (!options.fetchWbFunnel) {
    sourceNote(notes, 'WB Analytics CSV API', 'skipped', '--skip-wb-funnel');
    return;
  }
  if (!options.wbAnalyticsToken) {
    sourceNote(notes, 'WB Analytics CSV API', 'missing credentials', 'ALTEA_WB_API_TOKEN');
    return;
  }
  const nmMap = loadWbNmMap(options.wbNmMap);
  try {
    const periods = [
      ['2025-05-15', '2025-12-31'],
      ['2026-01-01', TODAY]
    ];
    sourceNote(
      notes,
      'WB Analytics CSV API coverage',
      'limited',
      'WB analytics CSV is available from 2025-05-15; Jan-Apr 2025 WB sales stay from seller report without traffic/card details.'
    );
    for (const [from, to] of periods) {
      const rows = await createAndDownloadWbFunnelReport(options, from, to);
      addWbFunnelCsvRows(store, rows, nmMap, notes, `WB Analytics CSV API ${from}..${to}`);
    }
  } catch (error) {
    sourceNote(notes, 'WB Analytics CSV API', 'failed', error.message);
  }
}

async function yandexRequest(options, apiPath, requestOptions = {}) {
  const url = new URL(`https://api.partner.market.yandex.ru${apiPath}`);
  Object.entries(requestOptions.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    method: requestOptions.method || 'GET',
    headers: {
      'Api-Key': options.ymApiKey,
      'Content-Type': 'application/json'
    },
    body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(`Yandex Market API ${apiPath}: HTTP ${response.status} ${text.slice(0, 700)}`);
  }
  return payload;
}

async function downloadAndParseZipJson(fileUrl) {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`report file download failed: HTTP ${response.status}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altea-report-'));
  const zipPath = path.join(tmpDir, 'report.zip');
  fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  const extractDir = path.join(tmpDir, 'out');
  unzipWithPowerShell(zipPath, extractDir);
  const files = [];
  collectFiles(extractDir, /\.(json|csv)$/i, files);
  const rows = [];
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, 'utf8');
    if (/\.csv$/i.test(filePath)) {
      rows.push(...parseCsv(text));
      continue;
    }
    try {
      const payload = JSON.parse(text);
      rows.push(...collectObjects(payload).filter((row) => (
        row.offerId || row.orderItems || row.shows || row.clicks || row.orderItemsTotalAmount
      )));
    } catch {
      // Ignore non-data JSON files in report archives.
    }
  }
  return rows;
}

async function downloadAndParseNamedZipJson(fileUrl, wantedFileName) {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`report file download failed: HTTP ${response.status}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altea-report-'));
  const zipPath = path.join(tmpDir, 'report.zip');
  fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  const extractDir = path.join(tmpDir, 'out');
  unzipWithPowerShell(zipPath, extractDir);
  const files = [];
  collectFiles(extractDir, new RegExp(`^${wantedFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), files);
  if (!files.length) return [];
  const text = fs.readFileSync(files[0], 'utf8');
  const payload = JSON.parse(text);
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  return collectObjects(payload);
}

function collectFiles(dir, pattern, result) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) collectFiles(fullPath, pattern, result);
    else if (pattern.test(item.name)) result.push(fullPath);
  }
}

async function generateYandexShowsSalesReport(options, from, to, identity) {
  const body = {
    dateFrom: from,
    dateTo: to,
    grouping: 'OFFERS'
  };
  if (identity?.campaignId) body.campaignId = Number(identity.campaignId);
  else if (identity?.businessId) body.businessId = Number(identity.businessId);
  else throw new Error('Yandex Market campaignId or businessId is required');

  const generated = await yandexRequest(options, '/v2/reports/shows-sales/generate', {
    method: 'POST',
    query: { format: 'JSON' },
    body
  });
  const reportId = normalizeText(generated?.result?.reportId);
  if (!reportId) throw new Error(`Yandex Market reportId was not returned: ${JSON.stringify(generated).slice(0, 500)}`);

  let latest = null;
  for (let attempt = 1; attempt <= 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 5000 : 10000));
    latest = await yandexRequest(options, `/v2/reports/info/${encodeURIComponent(reportId)}`);
    const status = normalizeText(latest?.result?.status);
    if (status === 'DONE') return downloadAndParseZipJson(latest.result.file);
    if (status === 'FAILED') throw new Error(`Yandex Market report failed: ${JSON.stringify(latest).slice(0, 700)}`);
  }
  throw new Error(`Yandex Market report was not ready in time: ${JSON.stringify(latest).slice(0, 700)}`);
}

async function generateYandexKeyIndicatorsReport(options, identity) {
  const body = { detalizationLevel: 'MONTH' };
  if (identity?.campaignId) body.campaignId = Number(identity.campaignId);
  else if (identity?.businessId) body.businessId = Number(identity.businessId);
  else throw new Error('Yandex Market campaignId or businessId is required');

  const generated = await yandexRequest(options, '/v2/reports/key-indicators/generate', {
    method: 'POST',
    query: { format: 'JSON' },
    body
  });
  const reportId = normalizeText(generated?.result?.reportId);
  if (!reportId) throw new Error(`Yandex Market key-indicators reportId was not returned: ${JSON.stringify(generated).slice(0, 500)}`);

  let latest = null;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 5000 : 5000));
    latest = await yandexRequest(options, `/v2/reports/info/${encodeURIComponent(reportId)}`);
    const status = normalizeText(latest?.result?.status);
    if (status === 'DONE') return downloadAndParseNamedZipJson(latest.result.file, 'key_indicators_full.json');
    if (status === 'FAILED') throw new Error(`Yandex Market key-indicators report failed: ${JSON.stringify(latest).slice(0, 700)}`);
  }
  throw new Error(`Yandex Market key-indicators report was not ready in time: ${JSON.stringify(latest).slice(0, 700)}`);
}

function yandexMonth(row) {
  const year = String(row.year || row.YEAR || '').trim();
  const month = String(row.month || row.MONTH || '').trim();
  if (/^\d{4}$/.test(year) && /^\d{1,2}$/.test(month)) return `${year}-${String(Number(month)).padStart(2, '0')}`;
  return monthKey(row.day || row.DAY || row.date || row.DATE);
}

function addYandexRows(store, rows, notes, sourceLabel) {
  const metricMap = {
    impressions_total: ['shows', 'SHOWS'],
    traffic_card_opens: ['clicks', 'CLICKS'],
    add_to_cart_total: ['toCart', 'TO_CART'],
    orders_units: ['orderItems', 'ORDER_ITEMS'],
    orders_revenue: ['orderItemsTotalAmount', 'ORDER_ITEMS_TOTAL_AMOUNT'],
    delivered_units: ['orderItemsDeliveredCount', 'ORDER_ITEMS_DELIVERED_COUNT'],
    delivered_revenue: ['orderItemsDeliveredTotalAmount', 'ORDER_ITEMS_DELIVERED_TOTAL_AMOUNT'],
    cancellations_units: ['orderItemsCanceledCount', 'ORDER_ITEMS_CANCELED_COUNT'],
    returns_units: ['orderItemsReturnedCount', 'ORDER_ITEMS_RETURNED_COUNT']
  };
  let count = 0;
  for (const row of rows) {
    const month = yandexMonth(row);
    if (!month) continue;
    const offerId = normalizeText(row.offerId || row.OFFER_ID || row.shopSku || row.sku);
    const name = normalizeText(row.offerName || row.OFFER_NAME || row.name);
    const commonTotal = { level: 'total', platformKey: 'ym', source: sourceLabel };
    const commonSku = { level: 'sku', platformKey: 'ym', articleKey: offerId || 'ym-unmapped', article: offerId, name, source: sourceLabel };
    let hasMetric = false;
    for (const [metricKey, candidates] of Object.entries(metricMap)) {
      const raw = candidates.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== '');
      if (raw === undefined || raw === null || raw === '') continue;
      store.add({ ...commonTotal, metricKey }, month, raw);
      if (offerId) store.add({ ...commonSku, metricKey }, month, raw);
      hasMetric = true;
    }
    if (hasMetric) count += 1;
  }
  sourceNote(notes, sourceLabel, count ? 'loaded' : 'empty', `${count} Yandex Market report rows`);
}

function addYandexKeyIndicatorRows(store, rows, notes, sourceLabel) {
  let count = 0;
  for (const row of rows) {
    const month = monthKeyFromRussianText(row.period || row.PERIOD || '');
    if (!month) continue;
    const commonTotal = { level: 'total', platformKey: 'ym', source: sourceLabel };
    const shows = numberOrZero(row.shows || row.SHOWS);
    const toCartConversion = numberOrZero(row.toCartConversion || row.TO_CART_CONVERSION);
    const ordersDelivered = numberOrZero(row.ordersDelivered || row.ORDERS_DELIVERED);
    const gmv = numberOrZero(row.gmv || row.GMV);
    const promotionServices = numberOrZero(row.promotionServices || row.PROMOTION_SERVICES || row.boost || row.BOOST);
    const logisticServices = numberOrZero(row.logisticServices || row.LOGISTIC_SERVICES);
    const warehouseServices = numberOrZero(row.warehouseServices || row.WAREHOUSE_SERVICES);
    if (!shows && !ordersDelivered && !gmv && !promotionServices && !logisticServices && !warehouseServices) continue;

    if (shows) store.add({ ...commonTotal, metricKey: 'impressions_total' }, month, shows);
    if (shows && toCartConversion) {
      store.add({ ...commonTotal, metricKey: 'add_to_cart_total' }, month, (shows * toCartConversion) / 100);
    }
    if (ordersDelivered) store.add({ ...commonTotal, metricKey: 'orders_units' }, month, ordersDelivered);
    if (gmv) {
      store.add({ ...commonTotal, metricKey: 'orders_revenue' }, month, gmv);
      store.add({ ...commonTotal, metricKey: 'ads_revenue' }, month, gmv);
    }
    if (promotionServices) store.add({ ...commonTotal, metricKey: 'ads_spend' }, month, promotionServices);
    if (logisticServices) store.add({ ...commonTotal, metricKey: 'logistics_cost' }, month, logisticServices);
    if (warehouseServices) store.add({ ...commonTotal, metricKey: 'storage_cost' }, month, warehouseServices);
    count += 1;
  }
  sourceNote(notes, sourceLabel, count ? 'loaded' : 'empty', `${count} Yandex Market monthly rows`);
}

async function addYandexMarketApi(store, options, notes) {
  if (!options.ymApiKey) {
    sourceNote(notes, 'Yandex Market API', 'missing credentials', 'ALTEA_YM_API_KEY');
    return;
  }
  try {
    let identities = [];
    if (options.ymCampaignId) identities.push({ campaignId: options.ymCampaignId });
    else if (options.ymBusinessId) identities.push({ businessId: options.ymBusinessId });
    else {
      const campaignsPayload = await yandexRequest(options, '/v2/campaigns');
      const campaigns = Array.isArray(campaignsPayload?.result?.campaigns)
        ? campaignsPayload.result.campaigns
        : Array.isArray(campaignsPayload?.campaigns)
          ? campaignsPayload.campaigns
          : [];
      identities = campaigns
        .map((campaign) => normalizeText(campaign.id || campaign.campaignId))
        .filter(Boolean)
        .map((campaignId) => ({ campaignId }));
      sourceNote(notes, 'Yandex Market API campaigns', identities.length ? 'loaded' : 'empty', `${identities.length} campaigns discovered`);
    }
    if (!identities.length) {
      sourceNote(notes, 'Yandex Market API', 'missing id', 'No campaignId/businessId entered and GET /v2/campaigns returned no campaigns.');
      return;
    }
    const loadKeyIndicators = async (sourceLabel) => {
      const rows = [];
      for (const identity of identities) {
        rows.push(...await generateYandexKeyIndicatorsReport(options, identity));
      }
      const metricKeys = new Set([
        'impressions_total',
        'add_to_cart_total',
        'orders_units',
        'orders_revenue',
        'ads_spend',
        'ads_revenue',
        'logistics_cost',
        'storage_cost'
      ]);
      store.removeWhere((row) => row.platformKey === 'ym' && metricKeys.has(row.metricKey));
      addYandexKeyIndicatorRows(store, rows, notes, sourceLabel);
    };
    if (!options.ymUseShowsSales) {
      sourceNote(notes, 'Yandex Market API shows-sales', 'skipped', 'Disabled by default to avoid the hourly report-generation limit; set ALTEA_YM_USE_SHOWS_SALES=1 to enable.');
      await loadKeyIndicators('Yandex Market API key-indicators');
      return;
    }
    try {
      const periods = [
        ['2025-01-01', '2025-12-31'],
        ['2026-01-01', TODAY]
      ];
      const rows = [];
      for (const identity of identities) {
        for (const [from, to] of periods) {
          rows.push(...await generateYandexShowsSalesReport(options, from, to, identity));
        }
      }
      const metricKeys = new Set([
        'impressions_total',
        'traffic_card_opens',
        'add_to_cart_total',
        'orders_units',
        'orders_revenue',
        'delivered_units',
        'delivered_revenue',
        'cancellations_units',
        'returns_units'
      ]);
      store.removeWhere((row) => row.platformKey === 'ym' && metricKeys.has(row.metricKey));
      addYandexRows(store, rows, notes, 'Yandex Market API shows-sales');
    } catch (error) {
      sourceNote(notes, 'Yandex Market API shows-sales', 'failed', error.message);
      await loadKeyIndicators('Yandex Market API key-indicators');
    }
  } catch (error) {
    sourceNote(notes, 'Yandex Market API key-indicators', 'failed', error.message);
  }
}

function buildLetualUrl(options) {
  const base = String(options.letualApiBaseUrl || LETUAL_DEFAULT_BASE_URL).replace(/\/+$/, '');
  let salesPath = String(options.letualSalesPath || LETUAL_DEFAULT_GRAPHQL_PATH);
  if (!base && !salesPath) return '';
  salesPath = salesPath
    .replace('{dateFrom}', options.from)
    .replace('{dateTo}', options.to)
    .replace('{from}', options.from)
    .replace('{to}', options.to);
  if (/^https?:\/\//i.test(salesPath)) return salesPath;
  const url = new URL(`${base}/${salesPath.replace(/^\/+/, '')}`);
  if (!isLetualGraphqlUrl(url.toString())) {
    if (!/[?&](dateFrom|from)=/i.test(url.search)) url.searchParams.set('dateFrom', options.from);
    if (!/[?&](dateTo|to)=/i.test(url.search)) url.searchParams.set('dateTo', options.to);
    if (options.letualClientId && !url.searchParams.has('clientId')) url.searchParams.set('clientId', options.letualClientId);
  }
  return url.toString();
}

function isLetualGraphqlUrl(url) {
  return /\/api\/graphql(?:[/?#]|$)/i.test(String(url || ''));
}

function isUnauthorizedGraphqlResponse(payload) {
  return Boolean(
    payload &&
    Array.isArray(payload.errors) &&
    payload.errors.some((error) => {
      const message = String(error?.message || '');
      return /unauthorized/i.test(message) || error?.status === 401 || error?.status === 403;
    })
  );
}

function letualCpcWhereCandidates(month) {
  const range = monthRange(month);
  if (!range) return [];
  return [
    { dateFrom: range.from, dateTo: range.to },
    { from: range.from, to: range.to },
    { start: range.from, end: range.to },
    { period: { from: range.from, to: range.to } },
    { period: { dateFrom: range.from, dateTo: range.to } },
    { date: { from: range.from, to: range.to } }
  ];
}

async function fetchLetualCpcStats(store, options, url, month, notes) {
  const whereCandidates = letualCpcWhereCandidates(month);
  for (const where of whereCandidates) {
    let payload;
    try {
      payload = await requestJson(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.letualApiToken}`,
          'Api-Key': options.letualApiToken,
          'X-API-Key': options.letualApiToken,
          'X-Client-Id': options.letualClientId || '',
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: {
          query: LETUAL_CPC_STATS_QUERY,
          variables: { where, limit: 1000, offset: 0 }
        }
      }, 'Letual GraphQL API');
    } catch (error) {
      if (/Unauthorized/i.test(error.message || '')) throw error;
      continue;
    }
    if (isUnauthorizedGraphqlResponse(payload)) {
      throw new Error('Unauthorized');
    }
    const rows = Array.isArray(payload?.data?.cpcStats?.rows) ? payload.data.cpcStats.rows : [];
    if (!payload?.data?.cpcStats && Array.isArray(payload?.errors) && payload.errors.length) {
      continue;
    }
    let totalClicks = 0;
    let totalCost = 0;
    let count = 0;
    for (const row of rows) {
      const alias = normalizeText(row?.website?.alias || row?.website?.name || row?.user?.email || row?.website?.id || row?.user?.id);
      const name = normalizeText(row?.website?.name || row?.website?.alias || row?.user?.email);
      const rowClicks = numberOrZero(row?.clicks);
      const rowCost = numberOrZero(row?.cost);
      totalClicks += rowClicks;
      totalCost += rowCost;
      count += 1;
      const commonSku = {
        level: 'sku',
        platformKey: 'letu',
        articleKey: alias || 'letu-cpc-unmapped',
        article: alias,
        name,
        source: 'Letual GraphQL cpcStats'
      };
      if (alias) {
        store.add({ ...commonSku, metricKey: 'ads_clicks' }, month, rowClicks);
        store.add({ ...commonSku, metricKey: 'ads_spend' }, month, rowCost);
      }
    }
    store.add({ level: 'total', platformKey: 'letu', source: 'Letual GraphQL cpcStats', metricKey: 'ads_clicks' }, month, totalClicks);
    store.add({ level: 'total', platformKey: 'letu', source: 'Letual GraphQL cpcStats', metricKey: 'ads_spend' }, month, totalCost);
    sourceNote(notes, 'Letual GraphQL cpcStats', count ? 'loaded' : 'empty', `${month} rows=${count}`);
    return true;
  }
  return false;
}

function addLetualLocalExport(store, options, notes) {
  const filePath = options.letualLocalExportXlsx;
  if (!filePath) {
    sourceNote(notes, 'Letual local export', 'missing', 'ALTEA_LETUAL_LOCAL_EXPORT_XLSX');
    return;
  }
  const workbook = readWorkbook(filePath);
  if (!workbook) {
    sourceNote(notes, 'Letual local export', 'missing', filePath);
    return;
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet || !worksheet['!ref']) {
    sourceNote(notes, 'Letual local export', 'empty', path.basename(filePath));
    return;
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
  const headerRow = rows[0] || [];
  const metricRow = rows[1] || [];
  const groups = [];
  for (let col = 1; col < headerRow.length; col += 7) {
    const month = monthKeyFromExcelSerial(headerRow[col]);
    if (!month) break;
    groups.push({
      month,
      col,
      headers: metricRow.slice(col, col + 7)
    });
  }
  if (!groups.length) {
    sourceNote(notes, 'Letual local export', 'empty', `${path.basename(filePath)} has no dated columns`);
    return;
  }

  const articleMap = loadLetualArticleMap(options.letualPlanXlsx);
  const salesMap = loadLetualSalesMap(options.letualPlanXlsx);
  let skuRows = 0;
  let monthsWithValues = new Set();

  for (let rowIndex = 2; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const article = normalizeText(row[0]);
    if (!article || article === 'Total' || /^Примененные фильтры/i.test(article)) continue;

    const salesRecord = salesMap.get(article) || salesMap.get(normalizeKey(article));
    const name = articleMap.get(article) || articleMap.get(normalizeKey(article)) || salesRecord?.name || article;
    let rowHasValues = false;

    for (const group of groups) {
      const values = row.slice(group.col, group.col + 7);
      const totalRevenue = numberOrZero(values[0]);
      const adsRevenue = numberOrZero(values[1]);
      const adsOrders = numberOrZero(values[2]);
      const otherUnits = numberOrZero(values[3]);
      const otherRevenue = numberOrZero(values[4]);
      const organicRevenue = numberOrZero(values[5]);
      const organicUnits = numberOrZero(values[6]);
      const totalUnits = adsOrders + otherUnits + organicUnits;
      const revenueValue = totalRevenue || (adsRevenue + otherRevenue + organicRevenue) || (salesRecord?.revenuePerUnit ? totalUnits * salesRecord.revenuePerUnit : 0);

      if (!revenueValue && !totalUnits && !adsRevenue && !adsOrders) continue;

      const totalCommon = { level: 'total', platformKey: 'letu', source: 'Letual local export' };
      const skuCommon = { level: 'sku', platformKey: 'letu', articleKey: article || 'letual-unmapped', article, name, source: 'Letual local export' };

      store.add({ ...totalCommon, ...metricParts('orders_revenue') }, group.month, revenueValue);
      store.add({ ...totalCommon, ...metricParts('orders_units') }, group.month, totalUnits);
      if (adsRevenue) store.add({ ...totalCommon, ...metricParts('ads_revenue') }, group.month, adsRevenue);
      if (adsOrders) store.add({ ...totalCommon, ...metricParts('ads_orders') }, group.month, adsOrders);

      store.add({ ...skuCommon, ...metricParts('orders_revenue') }, group.month, revenueValue);
      store.add({ ...skuCommon, ...metricParts('orders_units') }, group.month, totalUnits);
      if (adsRevenue) store.add({ ...skuCommon, ...metricParts('ads_revenue') }, group.month, adsRevenue);
      if (adsOrders) store.add({ ...skuCommon, ...metricParts('ads_orders') }, group.month, adsOrders);

      rowHasValues = true;
      monthsWithValues.add(group.month);
    }

    if (rowHasValues) skuRows += 1;
  }

  const monthRangeText = groups.length ? `${groups[0].month}..${groups[groups.length - 1].month}` : '';
  sourceNote(
    notes,
    'Letual local export',
    skuRows ? 'loaded' : 'empty',
    withFileMtime(filePath, `${skuRows} SKU rows, ${monthsWithValues.size} months from ${path.basename(filePath)}${monthRangeText ? ` (${monthRangeText})` : ''}`)
  );
}

function addGenericLetualRows(store, rows, notes, sourceLabel) {
  return addGenericMarketplaceRows(store, rows, notes, {
    platformKey: 'letu',
    sourceLabel,
    defaultArticle: 'letu-unmapped'
  });
}

const GENERIC_MARKETPLACE_FIELDS = {
  date: ['date', 'day', 'month', 'period', 'createdAt', 'orderDate', 'saleDate', 'salesDate', 'deliveryDate', 'Дата', 'День', 'Месяц', 'Период', 'Дата заказа', 'Дата продажи', 'Дата начисления'],
  year: ['year', 'год', 'Год'],
  month: ['monthNumber', 'month_num', 'monthNo', 'month', 'Месяц', 'Номер месяца'],
  article: ['article', 'offerId', 'offer_id', 'sku', 'vendorCode', 'vendor_code', 'item_code', 'sellerSku', 'seller_sku', 'Seller SKU ID', 'Артикул', 'Артикул продавца', 'Артикул у ЗЯ', 'Артикул Общий', 'Код товара', 'Код номенклатуры', 'Номенклатура', 'SKU', 'Штрихкод'],
  name: ['name', 'offerName', 'productName', 'itemName', 'title', 'Название', 'Наименование', 'Наименование товара', 'Название товара'],
  impressions_total: ['impressions', 'shows', 'views', 'totalViews', 'viewCount', 'Показы', 'Просмотры', 'Показы всего', 'Просмотры всего'],
  impressions_search: ['searchImpressions', 'categoryImpressions', 'searchViews', 'Показы в поиске', 'Показы в категории'],
  pdp_views: ['pdpViews', 'cardViews', 'productViews', 'detailViews', 'Просмотры карточки', 'Просмотры PDP', 'Карточка просмотры'],
  traffic_card_opens: ['clicks', 'visits', 'cardOpens', 'traffic', 'Переходы', 'Клики', 'Переходы в карточку', 'Открытия карточки'],
  sessions_total: ['sessions', 'sessionsTotal', 'visits', 'Сессии', 'Сессии всего'],
  sessions_search: ['searchSessions', 'categorySessions', 'Сессии поиск', 'Сессии категория'],
  sessions_pdp: ['pdpSessions', 'cardSessions', 'Сессии PDP', 'Сессии карточки'],
  add_to_cart_total: ['addToCart', 'add_to_cart', 'carts', 'cartAdds', 'Добавления в корзину', 'Корзины', 'В корзину'],
  add_to_cart_search: ['searchAddToCart', 'addToCartSearch', 'Добавления в корзину из поиска'],
  add_to_cart_pdp: ['pdpAddToCart', 'addToCartPdp', 'Добавления в корзину из карточки'],
  orders_units: ['ordersUnits', 'orderItems', 'quantity', 'qty', 'count', 'sales_qty', 'ordered_units', 'units', 'items', 'Заказы шт', 'Заказано шт', 'Продано шт', 'Количество', 'Шт', 'ИТОГО,шт', 'Итого,шт', 'Июнь шт', 'Май шт', 'Апрель шт'],
  orders_revenue: ['ordersRevenue', 'revenue', 'amount', 'sum', 'total', 'sales_sum', 'ordered_amount', 'salesAmount', 'grossRevenue', 'Заказы руб', 'Заказано руб', 'Продано руб', 'Выручка', 'Сумма', 'Итого', 'ИТОГО, руб.', 'Итого, руб.', 'Фактическая сумма продаж', 'Июнь руб', 'Май руб', 'Апрель руб'],
  delivered_units: ['deliveredUnits', 'delivered_count', 'delivered', 'buyoutUnits', 'Выкуплено шт', 'Доставлено шт'],
  delivered_revenue: ['deliveredRevenue', 'delivered_amount', 'buyoutRevenue', 'Выкуплено руб', 'Доставлено руб'],
  buyout_units: ['buyoutUnits', 'boughtUnits', 'Выкупы шт', 'Выкуплено шт'],
  buyout_revenue: ['buyoutRevenue', 'boughtRevenue', 'Выкупы руб', 'Выкуплено руб'],
  returns_units: ['returns', 'returnsUnits', 'returned_count', 'Возвраты', 'Возвраты шт'],
  cancellations_units: ['cancellations', 'cancelled', 'canceled_count', 'Отмены', 'Отмены шт'],
  cancel_revenue: ['cancelRevenue', 'cancelledRevenue', 'Отмены руб'],
  wishlist: ['wishlist', 'favorites', 'favoriteAdds', 'Избранное', 'Добавления в избранное'],
  ads_impressions: ['adsImpressions', 'adImpressions', 'adShows', 'Реклама показы', 'Показы рекламы'],
  ads_clicks: ['adsClicks', 'adClicks', 'Реклама клики', 'Клики рекламы'],
  ads_spend: ['adsSpend', 'adSpend', 'cost', 'spend', 'Расход', 'Расход (RUB)', 'Реклама расход'],
  ads_orders: ['adsOrders', 'adOrders', 'postViewOrders', 'postClickOrders', 'Реклама заказы'],
  ads_revenue: ['adsRevenue', 'adRevenue', 'postViewRevenue', 'postClickRevenue', 'Реклама выручка'],
  cart_cr: ['cartCr', 'cartConversion', 'CR корзина'],
  order_cr: ['orderCr', 'orderConversion', 'CR заказ'],
  buyout_pct: ['buyoutPct', 'buyoutPercent', 'Выкуп %'],
  ads_ctr: ['adsCtr', 'adCtr', 'CTR (%)', 'CTR'],
  ads_drr: ['adsDrr', 'adDrr', 'ДРР (%)', 'ДРР'],
  avg_order_value: ['avgOrderValue', 'averageOrderValue', 'avgCheck', 'Средний чек', 'Ср. чек'],
  logistics_cost: ['logisticsCost', 'Логистика'],
  storage_cost: ['storageCost', 'Хранение'],
  penalties: ['penalties', 'Штрафы'],
  net_payout: ['netPayout', 'payout', 'К перечислению']
};

function rowFieldValue(row, aliases) {
  if (!row || typeof row !== 'object') return '';
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) {
      const value = row[alias];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  const byKey = new Map(Object.keys(row).map((key) => [normalizeKey(key), row[key]]));
  for (const alias of aliases) {
    const value = byKey.get(normalizeKey(alias));
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function monthKeyFromMarketplaceRow(row) {
  const direct = rowFieldValue(row, GENERIC_MARKETPLACE_FIELDS.date);
  const year = normalizeYear(rowFieldValue(row, GENERIC_MARKETPLACE_FIELDS.year)) || TODAY.slice(0, 4);
  let month = monthKey(direct) || monthKeyFromRussianText(direct, year);
  if (month) return month;
  const rawMonth = rowFieldValue(row, GENERIC_MARKETPLACE_FIELDS.month);
  month = monthKey(rawMonth) || monthKeyFromRussianText(rawMonth, year);
  if (month) return month;
  const monthNumber = Number(String(rawMonth).replace(/\D+/g, ''));
  if (year && monthNumber >= 1 && monthNumber <= 12) return `${year}-${String(monthNumber).padStart(2, '0')}`;
  return '';
}

function addGenericMarketplaceRows(store, rows, notes, config) {
  let count = 0;
  const months = new Set();
  const skuSet = new Set();
  const platformKey = config.platformKey;
  const sourceLabel = config.sourceLabel;
  for (const row of rows) {
    const month = monthKeyFromMarketplaceRow(row);
    if (!month) continue;
    const article = normalizeText(rowFieldValue(row, GENERIC_MARKETPLACE_FIELDS.article));
    const name = normalizeText(rowFieldValue(row, GENERIC_MARKETPLACE_FIELDS.name)) || article;
    const commonTotal = { level: 'total', platformKey, source: sourceLabel };
    const commonSku = { level: 'sku', platformKey, articleKey: article || config.defaultArticle || `${platformKey}-unmapped`, article, name, source: sourceLabel };
    let hasMetric = false;
    for (const [metricKey, candidates] of Object.entries(GENERIC_MARKETPLACE_FIELDS)) {
      if (!METRICS[metricKey]) continue;
      const raw = rowFieldValue(row, candidates);
      if (raw === undefined || raw === null || raw === '') continue;
      store.add({ ...commonTotal, metricKey }, month, raw);
      if (article) store.add({ ...commonSku, metricKey }, month, raw);
      hasMetric = true;
    }
    const units = numberOrZero(rowFieldValue(row, GENERIC_MARKETPLACE_FIELDS.orders_units));
    const revenue = numberOrZero(rowFieldValue(row, GENERIC_MARKETPLACE_FIELDS.orders_revenue));
    if (hasMetric && (units || revenue)) {
      if (!numberOrZero(rowFieldValue(row, GENERIC_MARKETPLACE_FIELDS.delivered_units))) {
        store.add({ ...commonTotal, metricKey: 'delivered_units' }, month, units);
        store.add({ ...commonTotal, metricKey: 'buyout_units' }, month, units);
        if (article) {
          store.add({ ...commonSku, metricKey: 'delivered_units' }, month, units);
          store.add({ ...commonSku, metricKey: 'buyout_units' }, month, units);
        }
      }
      if (!numberOrZero(rowFieldValue(row, GENERIC_MARKETPLACE_FIELDS.delivered_revenue))) {
        store.add({ ...commonTotal, metricKey: 'delivered_revenue' }, month, revenue);
        store.add({ ...commonTotal, metricKey: 'buyout_revenue' }, month, revenue);
        if (article) {
          store.add({ ...commonSku, metricKey: 'delivered_revenue' }, month, revenue);
          store.add({ ...commonSku, metricKey: 'buyout_revenue' }, month, revenue);
        }
      }
    }
    if (hasMetric) {
      count += 1;
      months.add(month);
      if (article) skuSet.add(article);
    }
  }
  const orderedMonths = Array.from(months).sort();
  sourceNote(notes, sourceLabel, count ? 'loaded' : 'empty', `${count} rows, ${skuSet.size} SKU${orderedMonths.length ? `, ${orderedMonths[0]}..${orderedMonths[orderedMonths.length - 1]}` : ''}`);
  return count;
}

function envAny(names) {
  return names.map((name) => envValue(name)).find((value) => normalizeText(value)) || '';
}

function applyApiTemplate(value, options) {
  return String(value || '')
    .replace(/\{dateFrom\}|\{from\}/g, options.from)
    .replace(/\{dateTo\}|\{to\}/g, options.to)
    .replace(/\{today\}/g, TODAY);
}

function buildGenericApiUrl(baseUrl, apiPath, options) {
  const pathWithDates = applyApiTemplate(apiPath, options);
  if (/^https?:\/\//i.test(pathWithDates)) return pathWithDates;
  if (!baseUrl || !pathWithDates) return '';
  const url = new URL(`${String(baseUrl).replace(/\/+$/, '')}/${String(pathWithDates).replace(/^\/+/, '')}`);
  const originalPath = String(apiPath || '');
  if (!/\{dateFrom\}|\{from\}/.test(originalPath) && !url.searchParams.has('dateFrom') && !url.searchParams.has('from')) {
    url.searchParams.set('dateFrom', options.from);
  }
  if (!/\{dateTo\}|\{to\}/.test(originalPath) && !url.searchParams.has('dateTo') && !url.searchParams.has('to')) {
    url.searchParams.set('dateTo', options.to);
  }
  return url.toString();
}

function genericApiHeaders(token, clientId) {
  return {
    Authorization: `Bearer ${token}`,
    'Api-Key': token,
    'X-Api-Key': token,
    'X-API-Key': token,
    'X-Merchant-Token': token,
    'X-Client-Id': clientId || '',
    'Content-Type': 'application/json',
    Accept: 'application/json, text/csv;q=0.9, */*;q=0.8'
  };
}

async function addGenericMarketplaceApi(store, options, notes, config) {
  const token = normalizeText(config.token);
  const baseUrl = normalizeText(config.baseUrl);
  const salesPath = normalizeText(config.salesPath);
  if (!token) {
    sourceNote(notes, config.sourceLabel, 'missing credentials', config.tokenHelp);
    return 0;
  }
  if (!baseUrl && !/^https?:\/\//i.test(salesPath)) {
    sourceNote(notes, config.sourceLabel, 'missing endpoint', config.endpointHelp);
    return 0;
  }
  if (!salesPath) {
    sourceNote(notes, config.sourceLabel, 'missing endpoint', config.endpointHelp);
    return 0;
  }
  try {
    const url = buildGenericApiUrl(baseUrl, salesPath, options);
    const method = normalizeText(envAny(config.methodEnv || []) || (isLetualGraphqlUrl(url) ? 'POST' : 'GET')).toUpperCase();
    let body = null;
    const bodyTemplate = envAny(config.bodyEnv || []);
    const graphqlQuery = envAny(config.graphqlQueryEnv || []);
    if (graphqlQuery) {
      body = {
        query: applyApiTemplate(graphqlQuery, options),
        variables: {
          dateFrom: options.from,
          dateTo: options.to,
          from: options.from,
          to: options.to,
          clientId: config.clientId || ''
        }
      };
    } else if (bodyTemplate) {
      body = JSON.parse(applyApiTemplate(bodyTemplate, options));
    } else if (isLetualGraphqlUrl(url)) {
      sourceNote(notes, config.sourceLabel, 'missing query', `${config.graphqlQueryHelp} for GraphQL sales rows`);
      return 0;
    }
    const response = await fetch(url, {
      method,
      headers: genericApiHeaders(token, config.clientId),
      body: method === 'GET' || !body ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status} ${text.slice(0, 700)}`);
    let rows = [];
    try {
      rows = collectObjects(JSON.parse(text));
    } catch {
      rows = parseCsv(text);
    }
    return addGenericMarketplaceRows(store, rows, notes, {
      platformKey: config.platformKey,
      sourceLabel: config.sourceLabel,
      defaultArticle: config.defaultArticle
    });
  } catch (error) {
    sourceNote(notes, config.sourceLabel, 'failed', error.message);
    return 0;
  }
}

async function megamarketPost(options, apiPath, token, body) {
  const url = buildGenericApiUrl(options.megamarketApiBaseUrl || MEGAMARKET_DEFAULT_BASE_URL, apiPath, options);
  const response = await fetch(url, {
    method: 'POST',
    headers: genericApiHeaders(token, options.megamarketClientId),
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} ${text.slice(0, 700)}`);
  if (payload?.success === 0) throw new Error(`API error ${JSON.stringify(payload?.error || payload).slice(0, 700)}`);
  return payload || {};
}

function megamarketDateTime(dateKey, endOfDay = false) {
  return `${dateKey}T${endOfDay ? '23:59:59' : '00:00:00'}+03:00`;
}

function isMegamarketCanceled(value) {
  return /CANCELED|CANCELLED|RETURN|РћРўРњР•Рќ|Р’РћР—Р’Р РђРў/i.test(normalizeText(value));
}

function isMegamarketDelivered(value) {
  return /DELIVERED|Р”РћРЎРўРђР’/i.test(normalizeText(value));
}

async function addMegamarketApiSales(store, options, notes) {
  const token = normalizeText(options.megamarketApiToken);
  if (!token) {
    sourceNote(notes, 'Megamarket API sales', 'missing credentials', 'ALTEA_MEGAMARKET_API_TOKEN / ALTEA_MEGAMARKET_API_KEY');
    return 0;
  }
  try {
    const searchPayload = await megamarketPost(options, options.megamarketSalesPath || MEGAMARKET_ORDER_SEARCH_PATH, token, {
      data: {
        dateFrom: megamarketDateTime(options.from),
        dateTo: megamarketDateTime(options.to, true),
        count: 200
      }
    });
    const shipmentIds = Array.isArray(searchPayload?.data?.shipments) ? searchPayload.data.shipments.map(normalizeText).filter(Boolean) : [];
    if (!shipmentIds.length) {
      sourceNote(notes, 'Megamarket API sales', 'empty', `${options.from}..${options.to}: 0 shipments`);
      return 0;
    }

    let itemCount = 0;
    let activeItemCount = 0;
    let deliveredItemCount = 0;
    let activeRevenue = 0;
    let deliveredRevenue = 0;
    const batches = [];
    for (let index = 0; index < shipmentIds.length; index += 50) batches.push(shipmentIds.slice(index, index + 50));
    for (const batch of batches) {
      const detailPayload = await megamarketPost(options, options.megamarketOrderGetPath || MEGAMARKET_ORDER_GET_PATH, token, {
        data: { shipments: batch }
      });
      for (const shipment of Array.isArray(detailPayload?.data?.shipments) ? detailPayload.data.shipments : []) {
        const orderMonth = monthKey(shipment.creationDate) || monthKey(shipment.statusDate) || monthKey(options.from);
        const deliveryMonth = monthKey(shipment.statusDate) || monthKey(shipment.deliveryDate) || orderMonth;
        for (const item of Array.isArray(shipment.items) ? shipment.items : []) {
          const status = normalizeText(item.status || shipment.status);
          const canceled = isMegamarketCanceled(status);
          const delivered = isMegamarketDelivered(status);
          const quantity = numberOrZero(item.quantity);
          const grossRevenue = quantity * numberOrZero(item.price);
          const article = normalizeText(item.offerId || item.itemId || item.goodsId);
          const name = normalizeText(item.goodsData?.name || article);
          const commonTotal = { level: 'total', platformKey: 'megamarket', source: 'Megamarket API sales' };
          const commonSku = { level: 'sku', platformKey: 'megamarket', articleKey: article || `megamarket-${itemCount}`, article: article || `megamarket-${itemCount}`, name, source: 'Megamarket API sales' };

          if (!canceled) {
            store.add({ ...commonTotal, metricKey: 'orders_units' }, orderMonth, quantity);
            store.add({ ...commonTotal, metricKey: 'orders_revenue' }, orderMonth, grossRevenue);
            if (article) {
              store.add({ ...commonSku, metricKey: 'orders_units' }, orderMonth, quantity);
              store.add({ ...commonSku, metricKey: 'orders_revenue' }, orderMonth, grossRevenue);
            }
            activeItemCount += 1;
            activeRevenue += grossRevenue;
          } else {
            store.add({ ...commonTotal, metricKey: 'cancellations_units' }, orderMonth, quantity);
            store.add({ ...commonTotal, metricKey: 'cancel_revenue' }, orderMonth, grossRevenue);
            if (article) {
              store.add({ ...commonSku, metricKey: 'cancellations_units' }, orderMonth, quantity);
              store.add({ ...commonSku, metricKey: 'cancel_revenue' }, orderMonth, grossRevenue);
            }
          }
          if (delivered && !canceled) {
            store.add({ ...commonTotal, metricKey: 'delivered_units' }, deliveryMonth, quantity);
            store.add({ ...commonTotal, metricKey: 'delivered_revenue' }, deliveryMonth, grossRevenue);
            store.add({ ...commonTotal, metricKey: 'buyout_units' }, deliveryMonth, quantity);
            store.add({ ...commonTotal, metricKey: 'buyout_revenue' }, deliveryMonth, grossRevenue);
            if (article) {
              store.add({ ...commonSku, metricKey: 'delivered_units' }, deliveryMonth, quantity);
              store.add({ ...commonSku, metricKey: 'delivered_revenue' }, deliveryMonth, grossRevenue);
              store.add({ ...commonSku, metricKey: 'buyout_units' }, deliveryMonth, quantity);
              store.add({ ...commonSku, metricKey: 'buyout_revenue' }, deliveryMonth, grossRevenue);
            }
            deliveredItemCount += 1;
            deliveredRevenue += grossRevenue;
          }
          itemCount += 1;
        }
      }
    }

    sourceNote(
      notes,
      'Megamarket API sales',
      itemCount ? 'loaded' : 'empty',
      `${shipmentIds.length} shipments, ${itemCount} item rows, active ${activeItemCount} / ${Math.round(activeRevenue * 100) / 100} rub, delivered ${deliveredItemCount} / ${Math.round(deliveredRevenue * 100) / 100} rub, ${options.from}..${options.to}`
    );
    if (shipmentIds.length >= 200) sourceNote(notes, 'Megamarket API sales', 'warning', 'Search returned the request count limit; pagination may be needed.');
    return itemCount;
  } catch (error) {
    sourceNote(notes, 'Megamarket API sales', 'failed', error.message);
    return 0;
  }
}

function addRetailMonthlyMetric(store, commonTotal, commonSku, month, units, revenue) {
  const values = {
    orders_units: units,
    orders_revenue: revenue,
    delivered_units: units,
    delivered_revenue: revenue,
    buyout_units: units,
    buyout_revenue: revenue
  };
  for (const [metricKey, value] of Object.entries(values)) {
    if (commonSku.article) store.set({ ...commonSku, metricKey }, month, value);
  }
}

function addRetailNetworkSalesXlsx(store, filePath, notes, options = {}) {
  const skipPlatforms = options.skipPlatforms || new Set();
  if (!filePath) {
    sourceNote(notes, 'Retail network sales XLSX fallback', 'missing file', 'ALTEA_RETAIL_NETWORK_SALES_XLSX');
    return 0;
  }
  if (!fs.existsSync(filePath)) {
    sourceNote(notes, 'Retail network sales XLSX fallback', 'missing file', filePath);
    return 0;
  }
  const configs = [
    {
      sheet: 'ЗЯ',
      platformKey: 'goldapple',
      source: 'Retail network sales XLSX fallback / ZYA',
      article: 'Артикул',
      name: 'Наименование',
      months: [
        ['2026-01', 'Январь шт', 'Январь руб'],
        ['2026-02', 'Февраль шт', 'Февраль руб'],
        ['2026-03', 'Март шт', 'Март руб'],
        ['2026-04', 'Апрель шт', 'Апрель руб'],
        ['2026-05', 'Май шт', 'Май руб'],
        ['2026-06', 'Июнь шт', 'Июнь руб']
      ]
    },
    {
      sheet: 'Лету',
      platformKey: 'letu',
      source: 'Retail network sales XLSX fallback / Letual',
      article: 'Артикул',
      months: [
        ['2026-01', 'Январь шт', 'Январь руб'],
        ['2026-02', 'Февраль шт', 'Февраль руб'],
        ['2026-03', 'Март шт', 'Март руб'],
        ['2026-04', 'Апрель шт', 'Апрель руб'],
        ['2026-05', 'Май шт', 'Май руб'],
        ['2026-06', 'Июнь шт', 'Июнь руб']
      ]
    },
    {
      sheet: 'МагнитМаркет',
      platformKey: 'magnitmarket',
      source: 'Retail network sales XLSX fallback / Magnit Market',
      article: 'Артикул',
      months: [
        ['2026-01', 'Январь шт', 'Январь руб'],
        ['2026-02', 'Февраль шт', 'Февраль руб'],
        ['2026-03', 'Март шт', 'Март руб'],
        ['2026-04', 'Апрель шт', 'Апрель руб'],
        ['2026-05', 'Май шт', 'Май руб'],
        ['2026-06', 'Июнь шт', 'Июнь руб']
      ]
    },
    {
      sheet: 'ЯМ',
      platformKey: 'ya',
      source: 'Retail network sales XLSX fallback / Yandex Market',
      article: 'Артикул',
      name: 'Наименование',
      months: [
        ['2026-01', 'Январь шт', 'Январь руб'],
        ['2026-02', 'Февраль шт', 'Февраль руб'],
        ['2026-03', 'Март шт', 'Март руб'],
        ['2026-04', 'Апрель шт', 'Апрель руб'],
        ['2026-05', 'Май шт', 'Май руб'],
        ['2026-06', 'Июнь шт', 'Июнь руб']
      ]
    }
  ];
  try {
    const workbook = readWorkbook(filePath);
    let totalRows = 0;
    const details = [];
    for (const config of configs) {
      if (!platformRequested(options, config.platformKey)) {
        continue;
      }
      if (skipPlatforms.has(config.platformKey) || (config.platformKey === 'magnitmarket' && skipPlatforms.has('magnit'))) {
        details.push(`${config.sheet}: skipped because API loaded`);
        continue;
      }
      const sheetName = workbook?.SheetNames?.find((name) => normalizeKey(name) === normalizeKey(config.sheet));
      if (!sheetName) {
        details.push(`${config.sheet}: missing`);
        continue;
      }
      const rows = sheetRows(workbook, sheetName, { raw: true });
      const totals = new Map();
      let rowCount = 0;
      for (const row of rows) {
        const article = normalizeText(row[config.article]);
        if (!article) continue;
        const name = normalizeText(config.name ? row[config.name] : '') || article;
        const commonTotal = { level: 'total', platformKey: config.platformKey, source: config.source };
        const commonSku = { level: 'sku', platformKey: config.platformKey, articleKey: article, article, name, source: config.source };
        let rowHasValue = false;
        for (const [month, unitsColumn, revenueColumn] of config.months) {
          const units = numberOrZero(row[unitsColumn]);
          const revenue = numberOrZero(row[revenueColumn]);
          if (!units && !revenue) continue;
          addRetailMonthlyMetric(store, commonTotal, commonSku, month, units, revenue);
          const bucket = totals.get(month) || { units: 0, revenue: 0 };
          bucket.units += units;
          bucket.revenue += revenue;
          totals.set(month, bucket);
          rowHasValue = true;
        }
        if (rowHasValue) rowCount += 1;
      }
      for (const [month, bucket] of totals.entries()) {
        const totalCommon = { level: 'total', platformKey: config.platformKey, source: config.source };
        const metricValues = {
          orders_units: bucket.units,
          orders_revenue: bucket.revenue,
          delivered_units: bucket.units,
          delivered_revenue: bucket.revenue,
          buyout_units: bucket.units,
          buyout_revenue: bucket.revenue
        };
        for (const [metricKey, value] of Object.entries(metricValues)) {
          store.set({ ...totalCommon, metricKey }, month, value);
        }
      }
      totalRows += rowCount;
      details.push(`${config.sheet}: ${rowCount} SKU`);
    }
    sourceNote(notes, 'Retail network sales XLSX fallback', totalRows ? 'loaded' : 'empty', withFileMtime(filePath, `${totalRows} SKU rows (${details.join('; ')})`));
    return totalRows;
  } catch (error) {
    sourceNote(notes, 'Retail network sales XLSX fallback', 'failed', error.message);
    return 0;
  }
}

async function addLetualApi(store, options, notes) {
  let salesApiRows = 0;
  if (!options.letualApiToken) {
    sourceNote(notes, 'Letual API', 'missing credentials', 'ALTEA_LETUAL_API_TOKEN');
  } else {
    const url = buildLetualUrl(options);
    if (!url) {
      sourceNote(notes, 'Letual API', 'saved token only', 'Need a Letual endpoint to pull data.');
    } else if (isLetualGraphqlUrl(url)) {
      salesApiRows = await addGenericMarketplaceApi(store, options, notes, {
        platformKey: 'letu',
        sourceLabel: 'Letual API sales',
        defaultArticle: 'letu-unmapped',
        token: options.letualApiToken,
        baseUrl: options.letualApiBaseUrl,
        salesPath: options.letualSalesPath,
        clientId: options.letualClientId,
        tokenHelp: 'ALTEA_LETUAL_API_TOKEN',
        endpointHelp: 'ALTEA_LETUAL_API_BASE_URL / ALTEA_LETUAL_SALES_PATH',
        methodEnv: ['ALTEA_LETUAL_API_METHOD'],
        bodyEnv: ['ALTEA_LETUAL_API_BODY_JSON'],
        graphqlQueryEnv: ['ALTEA_LETUAL_GRAPHQL_QUERY'],
        graphqlQueryHelp: 'ALTEA_LETUAL_GRAPHQL_QUERY'
      });
      let loadedMonths = 0;
      try {
        const months = options.letualFullHistory ? months2025And2026() : trailingMonths(TODAY, 2);
        for (const month of months) {
          const ok = await fetchLetualCpcStats(store, options, url, month, notes);
          if (ok) loadedMonths += 1;
        }
        sourceNote(notes, 'Letual GraphQL', loadedMonths ? 'loaded' : 'empty', `${loadedMonths}/${months.length} month windows queried${options.letualFullHistory ? '' : ' (recent months only; set ALTEA_LETUAL_FULL_HISTORY=1 for full backfill)'}`);
      } catch (error) {
        sourceNote(notes, 'Letual GraphQL', 'failed', error.message);
      }
    } else {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${options.letualApiToken}`,
            'Api-Key': options.letualApiToken,
            'X-API-Key': options.letualApiToken,
            'X-Client-Id': options.letualClientId || ''
          }
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status} ${text.slice(0, 700)}`);
        let rows = [];
        try {
          rows = collectObjects(JSON.parse(text));
        } catch {
          rows = parseCsv(text);
        }
        salesApiRows = addGenericLetualRows(store, rows, notes, 'Letual API sales');
      } catch (error) {
        sourceNote(notes, 'Letual API', 'failed', error.message);
      }
    }
  }

  if (!salesApiRows) addLetualLocalExport(store, options, notes);
  return salesApiRows > 0;
}

function loadBestWorkbookRowsFromZip(zipPath, requiredHeaders = []) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altea-zip-'));
  const extractDir = path.join(tmpDir, 'out');
  unzipWithPowerShell(zipPath, extractDir);
  const xlsxFiles = [];
  collectFiles(extractDir, /\.xlsx$/i, xlsxFiles);
  let fallback = null;
  for (const filePath of xlsxFiles) {
    const workbook = readWorkbook(filePath);
    if (!workbook) continue;
    for (const sheetName of workbook.SheetNames) {
      const rows = sheetRows(workbook, sheetName);
      if (!rows.length) continue;
      const headerNames = Object.keys(rows[0] || {});
      const candidate = { filePath, sheetName, rows };
      if (requiredHeaders.length && requiredHeaders.every((header) => headerNames.includes(header))) {
        return candidate;
      }
      if (!fallback || rows.length > fallback.rows.length) fallback = candidate;
    }
  }
  return fallback;
}

function addZyaSalesZip(store, zipPath, notes) {
  if (!zipPath) {
    sourceNote(notes, 'ZYA sales ZIP', 'missing file', 'ALTEA_ZYA_SALES_ZIP');
    return 0;
  }
  if (!fs.existsSync(zipPath)) {
    sourceNote(notes, 'ZYA sales ZIP', 'missing file', zipPath);
    return 0;
  }
  try {
    const selection = loadBestWorkbookRowsFromZip(zipPath, ['Дата заказа', 'Заказано руб', 'Доставлено руб']);
    if (!selection) {
      sourceNote(notes, 'ZYA sales ZIP', 'empty', path.basename(zipPath));
      return 0;
    }
    let count = 0;
    for (const row of selection.rows) {
      const month = monthKey(row['Дата заказа'] || row['Дата получения']);
      if (!month) continue;
      const article = normalizeText(row['Артикул'] || row['Seller SKU ID'] || row['SKU'] || row['Номенклатура'] || row['Штрихкод']);
      const name = normalizeText(row['Наименование']) || article;
      const commonTotal = { level: 'total', platformKey: 'goldapple', source: 'ZYA sales ZIP' };
      const commonSku = { level: 'sku', platformKey: 'goldapple', articleKey: article || `zya-${count}`, article: article || `zya-${count}`, name, source: 'ZYA sales ZIP' };
      const metricValues = {
        orders_units: row['Заказано шт'],
        orders_revenue: row['Заказано руб'],
        delivered_units: row['Доставлено шт'],
        delivered_revenue: row['Доставлено руб'],
        buyout_units: row['Доставлено шт'],
        buyout_revenue: row['Доставлено руб'],
        cancellations_units: row['Отменено шт'],
        cancel_revenue: row['Отменено руб'],
        returns_units: row['Возвраты шт']
      };
      for (const [metricKey, value] of Object.entries(metricValues)) {
        store.add({ ...commonTotal, ...metricParts(metricKey) }, month, value);
        if (article) store.add({ ...commonSku, ...metricParts(metricKey) }, month, value);
      }
      count += 1;
    }
    sourceNote(notes, 'ZYA sales ZIP', count ? 'loaded' : 'empty', withFileMtime(zipPath, `${count} rows from ${path.basename(selection.filePath)} / ${selection.sheetName}`));
    return count;
  } catch (error) {
    sourceNote(notes, 'ZYA sales ZIP', 'failed', error.message);
    return 0;
  }
}

const ZYA_HEADERS = {
  saleDate: '\u0414\u0430\u0442\u0430 \u043f\u0440\u043e\u0434\u0430\u0436\u0438',
  productCode: '\u041a\u043e\u0434 \u0442\u043e\u0432\u0430\u0440\u0430',
  productName: '\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435 \u0442\u043e\u0432\u0430\u0440\u0430',
  soldUnits: '\u0418\u0442\u043e\u0433\u043e \u0440\u0435\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u043d\u043e (\u0448\u0442.)',
  soldRevenue: '\u0418\u0442\u043e\u0433\u043e \u0440\u0435\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u043d\u043e (\u0441\u0443\u043c\u043c\u0430, \u0434\u043b\u044f \u0440\u0430\u0441\u0447\u0435\u0442\u0430 \u0430\u0433\u0435\u043d\u0442\u0441\u043a\u043e\u0433\u043e \u0432\u043e\u0437\u043d\u0430\u0433\u0440\u0430\u0436\u0434\u0435\u043d\u0438\u044f)',
  salePrice: '\u0426\u0435\u043d\u0430 \u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u0438',
  finalRevenue: '\u0424\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u0441\u0443\u043c\u043c\u0430 \u043f\u0440\u043e\u0434\u0430\u0436',
  nomenclatureCode: '\u041a\u043e\u0434 \u043d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u044b',
  article: '\u0410\u0440\u0442\u0438\u043a\u0443\u043b',
  name: '\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435'
};

const ZYA_MONTHLY_HEADERS = {
  articleZya: '\u0410\u0440\u0442\u0438\u043a\u0443\u043b \u0443 \u0417\u042f',
  articleCommon: '\u0410\u0440\u0442\u0438\u043a\u0443\u043b \u041e\u0431\u0449\u0438\u0439',
  article: '\u0410\u0440\u0442\u0438\u043a\u0443\u043b',
  name: '\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435',
  totalRevenue: '\u0418\u0422\u041e\u0413\u041e, \u0440\u0443\u0431.',
  totalUnits: '\u0418\u0422\u041e\u0413\u041e,\u0448\u0442',
  avgCheck: '\u0421\u0440. \u0447\u0435\u043a'
};

const ZYA_ORDER_HEADERS = {
  brand: 'Бренд',
  name: 'Наименование',
  nomenclature: 'Номенклатура',
  article: 'Артикул',
  barcode: 'Штрихкод',
  orderId: 'Номер заказа',
  orderDate: 'Дата заказа',
  ordersRevenue: 'Заказано руб',
  deliveredRevenue: 'Доставлено руб',
  inTransitRevenue: 'В пути руб',
  canceledRevenue: 'Отменено руб',
  ordersUnits: 'Заказано шт',
  deliveredUnits: 'Доставлено шт',
  inTransitUnits: 'В пути шт',
  canceledUnits: 'Отменено шт',
  returnsUnits: 'Возвраты шт'
};

function rowValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return '';
}

function sheetRowsFromDetectedHeader(workbook, sheetName, requiredHeaders) {
  if (!workbook || !workbook.Sheets[sheetName]) return null;
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false, blankrows: false });
  const requiredKeys = requiredHeaders.map(normalizeKey);
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 10); rowIndex += 1) {
    const headers = rows[rowIndex].map((header) => normalizeText(header));
    const headerKeys = new Set(headers.map(normalizeKey));
    if (!requiredKeys.every((key) => headerKeys.has(key))) continue;
    const dataRows = rows.slice(rowIndex + 1).map((values) => {
      const row = {};
      headers.forEach((header, index) => {
        if (!header) return;
        row[header] = values[index] ?? '';
      });
      return row;
    }).filter((row) => Object.values(row).some((value) => normalizeText(value)));
    return dataRows;
  }
  return null;
}

function normalizeZyaCode(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function findWorkbookRowsByHeaders(workbook, requiredHeaders) {
  if (!workbook || !Array.isArray(workbook.SheetNames)) return null;
  for (const sheetName of workbook.SheetNames) {
    const rows = sheetRows(workbook, sheetName);
    if (!rows.length) continue;
    const headers = new Set(Object.keys(rows[0] || {}));
    if (requiredHeaders.every((header) => headers.has(header))) {
      return { sheetName, rows };
    }
    const detectedRows = sheetRowsFromDetectedHeader(workbook, sheetName, requiredHeaders);
    if (detectedRows?.length) return { sheetName, rows: detectedRows };
  }
  return null;
}

function buildZyaArticleLookup(workbook) {
  const selection = findWorkbookRowsByHeaders(workbook, [ZYA_HEADERS.nomenclatureCode, ZYA_HEADERS.article]);
  const lookup = new Map();
  if (!selection) return lookup;
  for (const row of selection.rows) {
    const code = normalizeZyaCode(row[ZYA_HEADERS.nomenclatureCode]);
    const article = normalizeText(row[ZYA_HEADERS.article]);
    if (!code || !article) continue;
    lookup.set(code, {
      article,
      name: normalizeText(row[ZYA_HEADERS.name]) || article
    });
  }
  return lookup;
}

function addZyaMonthlySalesXlsx(store, workbook, filePath, notes) {
  if (!workbook || !Array.isArray(workbook.SheetNames)) return 0;
  const months = new Set();
  const skuSet = new Set();
  let count = 0;

  for (const sheetName of workbook.SheetNames) {
    const month = monthKey(sheetName) || monthKeyFromRussianText(sheetName, TODAY.slice(0, 4));
    if (!month) continue;
    const rows = sheetRowsFromDetectedHeader(workbook, sheetName, [
      ZYA_MONTHLY_HEADERS.name,
      ZYA_MONTHLY_HEADERS.totalRevenue,
      ZYA_MONTHLY_HEADERS.totalUnits
    ]);
    if (!rows?.length) continue;

    for (const row of rows) {
      const revenue = numberOrZero(rowFieldValue(row, [
        ZYA_MONTHLY_HEADERS.totalRevenue,
        '\u0418\u0442\u043e\u0433\u043e, \u0440\u0443\u0431.',
        '\u0418\u0442\u043e\u0433\u043e \u0440\u0443\u0431',
        '\u041f\u0440\u043e\u0434\u0430\u0436\u0438 \u0440\u0443\u0431'
      ]));
      const units = numberOrZero(rowFieldValue(row, [
        ZYA_MONTHLY_HEADERS.totalUnits,
        '\u0418\u0422\u041e\u0413\u041e, \u0448\u0442',
        '\u0418\u0442\u043e\u0433\u043e,\u0448\u0442',
        '\u041f\u0440\u043e\u0434\u0430\u0436\u0438 \u0448\u0442'
      ]));
      if (!revenue && !units) continue;

      const article = normalizeText(rowFieldValue(row, [
        ZYA_MONTHLY_HEADERS.articleCommon,
        ZYA_MONTHLY_HEADERS.articleZya,
        ZYA_MONTHLY_HEADERS.article,
        '\u0410\u0440\u0442\u0438\u043a\u0443\u043b \u0410\u043b\u044c\u043a\u043e\u0440\u0430'
      ])) || `zya-monthly-${count}`;
      const name = normalizeText(rowFieldValue(row, [ZYA_MONTHLY_HEADERS.name])) || article;
      const avgOrderValue = rowFieldValue(row, [ZYA_MONTHLY_HEADERS.avgCheck]);
      const totalCommon = { level: 'total', platformKey: 'goldapple', source: 'ZYA monthly XLSX' };
      const skuCommon = { level: 'sku', platformKey: 'goldapple', articleKey: article, article, name, source: 'ZYA monthly XLSX' };
      const metricValues = {
        orders_units: units,
        orders_revenue: revenue,
        delivered_units: units,
        delivered_revenue: revenue,
        buyout_units: units,
        buyout_revenue: revenue,
        avg_order_value: avgOrderValue
      };

      for (const [metricKey, value] of Object.entries(metricValues)) {
        if (value === undefined || value === null || value === '') continue;
        store.add({ ...totalCommon, ...metricParts(metricKey) }, month, value);
        store.add({ ...skuCommon, ...metricParts(metricKey) }, month, value);
      }
      months.add(month);
      skuSet.add(article);
      count += 1;
    }
  }

  const orderedMonths = Array.from(months).sort();
  sourceNote(
    notes,
    'ZYA monthly XLSX',
    count ? 'loaded' : 'empty',
    withFileMtime(filePath, `${count} SKU rows, ${skuSet.size} SKU${orderedMonths.length ? `, ${orderedMonths[0]}..${orderedMonths[orderedMonths.length - 1]}` : ''} from ${path.basename(filePath)}`)
  );
  return count;
}

function addZyaOrderSalesXlsx(store, workbook, filePath, notes) {
  const selection = findWorkbookRowsByHeaders(workbook, [
    ZYA_ORDER_HEADERS.orderDate,
    ZYA_ORDER_HEADERS.article,
    ZYA_ORDER_HEADERS.ordersUnits
  ]);
  if (!selection) return 0;

  const skuSet = new Set();
  const months = new Set();
  let count = 0;
  for (const row of selection.rows) {
    const month = monthKey(row[ZYA_ORDER_HEADERS.orderDate]);
    if (!month) continue;
    const article = normalizeText(row[ZYA_ORDER_HEADERS.article] || row[ZYA_ORDER_HEADERS.nomenclature] || row[ZYA_ORDER_HEADERS.barcode]);
    const name = normalizeText(row[ZYA_ORDER_HEADERS.name]) || article;
    const metricValues = {
      orders_units: row[ZYA_ORDER_HEADERS.ordersUnits],
      orders_revenue: row[ZYA_ORDER_HEADERS.ordersRevenue],
      delivered_units: row[ZYA_ORDER_HEADERS.deliveredUnits],
      delivered_revenue: row[ZYA_ORDER_HEADERS.deliveredRevenue],
      buyout_units: row[ZYA_ORDER_HEADERS.deliveredUnits],
      buyout_revenue: row[ZYA_ORDER_HEADERS.deliveredRevenue],
      cancellations_units: row[ZYA_ORDER_HEADERS.canceledUnits],
      cancel_revenue: row[ZYA_ORDER_HEADERS.canceledRevenue],
      returns_units: row[ZYA_ORDER_HEADERS.returnsUnits]
    };
    const hasMetric = Object.values(metricValues).some((value) => numberOrZero(value) !== 0);
    if (!hasMetric) continue;

    const totalCommon = { level: 'total', platformKey: 'goldapple', source: 'ZYA order sales XLSX' };
    const skuCommon = { level: 'sku', platformKey: 'goldapple', articleKey: article || `zya-order-${count}`, article: article || `zya-order-${count}`, name, source: 'ZYA order sales XLSX' };
    for (const [metricKey, value] of Object.entries(metricValues)) {
      store.add({ ...totalCommon, ...metricParts(metricKey) }, month, value);
      if (article) store.add({ ...skuCommon, ...metricParts(metricKey) }, month, value);
    }
    skuSet.add(article || `zya-order-${count}`);
    months.add(month);
    count += 1;
  }

  const orderedMonths = Array.from(months).sort();
  sourceNote(
    notes,
    'ZYA order sales XLSX',
    count ? 'loaded' : 'empty',
    withFileMtime(filePath, `${count} order rows, ${skuSet.size} SKU, ${orderedMonths[0] || ''}..${orderedMonths[orderedMonths.length - 1] || ''} from ${path.basename(filePath)} / ${selection.sheetName}`)
  );
  return count;
}

function addZyaSalesXlsx(store, filePath, notes) {
  if (!filePath) {
    sourceNote(notes, 'ZYA sales XLSX', 'missing file', 'ALTEA_ZYA_SALES_XLSX');
    return 0;
  }
  if (!fs.existsSync(filePath)) {
    sourceNote(notes, 'ZYA sales XLSX', 'missing file', filePath);
    return 0;
  }
  try {
    const workbook = readWorkbook(filePath);
    const orderCount = addZyaOrderSalesXlsx(store, workbook, filePath, notes);
    if (orderCount) return orderCount;
    const selection = findWorkbookRowsByHeaders(workbook, [ZYA_HEADERS.saleDate, ZYA_HEADERS.productCode, ZYA_HEADERS.soldUnits]);
    if (!selection) {
      const monthlyCount = addZyaMonthlySalesXlsx(store, workbook, filePath, notes);
      if (monthlyCount) return monthlyCount;
      sourceNote(notes, 'ZYA sales XLSX', 'empty', `${path.basename(filePath)} has no daily sales sheet`);
      return 0;
    }
    const articleLookup = buildZyaArticleLookup(workbook);
    const skuSet = new Set();
    const months = new Set();
    let count = 0;

    for (const row of selection.rows) {
      const month = monthKey(row[ZYA_HEADERS.saleDate]);
      if (!month) continue;
      const units = numberOrZero(row[ZYA_HEADERS.soldUnits]);
      const revenue = numberOrZero(rowValue(row, [ZYA_HEADERS.finalRevenue, ZYA_HEADERS.soldRevenue, ZYA_HEADERS.salePrice]));
      if (!units && !revenue) continue;

      const code = normalizeZyaCode(row[ZYA_HEADERS.productCode]);
      const mapped = articleLookup.get(code);
      const article = mapped?.article || code || `zya-${count}`;
      const name = mapped?.name || normalizeText(row[ZYA_HEADERS.productName]) || article;
      const totalCommon = { level: 'total', platformKey: 'goldapple', source: 'ZYA sales XLSX' };
      const skuCommon = { level: 'sku', platformKey: 'goldapple', articleKey: article, article, name, source: 'ZYA sales XLSX' };
      const metricValues = {
        orders_units: units,
        orders_revenue: revenue,
        delivered_units: units,
        delivered_revenue: revenue,
        buyout_units: units,
        buyout_revenue: revenue
      };

      for (const [metricKey, value] of Object.entries(metricValues)) {
        store.add({ ...totalCommon, ...metricParts(metricKey) }, month, value);
        store.add({ ...skuCommon, ...metricParts(metricKey) }, month, value);
      }
      skuSet.add(article);
      months.add(month);
      count += 1;
    }

    const orderedMonths = Array.from(months).sort();
    sourceNote(
      notes,
      'ZYA sales XLSX',
      count ? 'loaded' : 'empty',
      withFileMtime(filePath, `${count} daily rows, ${skuSet.size} SKU, ${orderedMonths[0] || ''}..${orderedMonths[orderedMonths.length - 1] || ''} from ${path.basename(filePath)} / ${selection.sheetName}`)
    );
    return count;
  } catch (error) {
    sourceNote(notes, 'ZYA sales XLSX', 'failed', error.message);
    return 0;
  }
}

function addZyaAdsXlsx(store, filePath, notes) {
  if (!filePath) {
    sourceNote(notes, 'ZYA ads XLSX', 'missing file', 'ALTEA_ZYA_ADS_XLSX');
    return 0;
  }
  if (!fs.existsSync(filePath)) {
    sourceNote(notes, 'ZYA ads XLSX', 'missing file', filePath);
    return 0;
  }
  try {
    const workbook = readWorkbook(filePath);
    if (!workbook || !workbook.SheetNames.length) {
      sourceNote(notes, 'ZYA ads XLSX', 'empty', path.basename(filePath));
      return 0;
    }
    const rows = sheetRows(workbook, workbook.SheetNames[0]);
    let count = 0;
    for (const row of rows) {
      const campaign = rowFieldValue(row, ['Кампания', 'campaign', 'campaignName']);
      const adName = rowFieldValue(row, ['Реклама', 'ad', 'adName', 'placementName']);
      const month = monthKey(campaign) || monthKeyFromRussianText(campaign, TODAY.slice(0, 4));
      if (!month) continue;
      const adLabel = normalizeText(adName) || normalizeText(campaign);
      const article = adLabel.replace(/\s*\+\s*$/, '').trim() || `zya-ad-${count}`;
      const name = normalizeText(adName) || article;
      const postViewOrders = numberOrZero(rowFieldValue(row, ['PostView Продано товаров', 'postViewOrders']));
      const postClickOrders = numberOrZero(rowFieldValue(row, ['PostClick Продано товаров', 'postClickOrders']));
      const postViewRevenue = numberOrZero(rowFieldValue(row, ['PostView Выручка (RUB)', 'postViewRevenue']));
      const postClickRevenue = numberOrZero(rowFieldValue(row, ['PostClick Выручка (RUB)', 'postClickRevenue']));
      const commonTotal = { level: 'total', platformKey: 'goldapple', source: 'ZYA ads XLSX' };
      const commonSku = { level: 'sku', platformKey: 'goldapple', articleKey: article, article, name, source: 'ZYA ads XLSX' };
      const metricValues = {
        impressions_total: rowFieldValue(row, ['Показы', 'impressions', 'shows']),
        pdp_views: rowFieldValue(row, ['Просмотры', 'views', 'pdpViews']),
        traffic_card_opens: rowFieldValue(row, ['Клики', 'clicks']),
        ads_impressions: rowFieldValue(row, ['Показы', 'impressions', 'shows']),
        ads_clicks: rowFieldValue(row, ['Клики', 'clicks']),
        ads_spend: rowFieldValue(row, ['Расход (RUB)', 'Расход', 'spend', 'cost']),
        ads_orders: postViewOrders + postClickOrders,
        ads_revenue: postViewRevenue + postClickRevenue,
        ads_ctr: rowFieldValue(row, ['CTR (%)', 'CTR', 'ctr'])
      };
      for (const [metricKey, value] of Object.entries(metricValues)) {
        if (value === undefined || value === null || value === '') continue;
        store.add({ ...commonTotal, ...metricParts(metricKey) }, month, value);
        store.add({ ...commonSku, ...metricParts(metricKey) }, month, value);
      }
      count += 1;
    }
    sourceNote(notes, 'ZYA ads XLSX', count ? 'loaded' : 'empty', withFileMtime(filePath, `${count} rows from ${path.basename(filePath)}`));
    return count;
  } catch (error) {
    sourceNote(notes, 'ZYA ads XLSX', 'failed', error.message);
    return 0;
  }
}

function addMagnitSalesRows(store, rows, notes, sourceLabel, detail) {
  let count = 0;
  for (const row of rows) {
    const orderMonth = monthKey(rowFieldValue(row, ['Дата создания', 'orderDate', 'createdAt']));
    if (!orderMonth) continue;
    const deliveryDate = rowFieldValue(row, ['Дата получения', 'deliveryDate', 'receivedAt']);
    const deliveryMonth = monthKey(deliveryDate) || orderMonth;
    const status = normalizeText(rowFieldValue(row, ['Статус', 'status'])).toLowerCase();
    const article = normalizeText(rowFieldValue(row, ['Seller SKU ID', 'sellerSkuId', 'SKU', 'Штрихкод', 'barcode']));
    const name = normalizeText(rowFieldValue(row, ['Наименование', 'name', 'productName'])) || article;
    const commonTotal = { level: 'total', platformKey: 'magnitmarket', source: sourceLabel };
    const commonSku = { level: 'sku', platformKey: 'magnitmarket', articleKey: article || `magnit-${count}`, article: article || `magnit-${count}`, name, source: sourceLabel };
    const ordersUnits = rowFieldValue(row, ['Количество', 'quantity']);
    const grossRevenue = rowFieldValue(row, ['Выручка (руб.)', 'revenue']);
    const netRevenue = rowFieldValue(row, ['Выручка с вычетом комиссии (руб.)', 'netRevenue', 'netPayout']);
    const returnedUnits = rowFieldValue(row, ['Возвраты', 'returns']);
    const isDelivered = Boolean(deliveryDate) || /заверш|достав|получ/i.test(status);
    const isCanceled = /отмен|отказ/i.test(status);
    const orderMetrics = {
      orders_units: ordersUnits,
      orders_revenue: grossRevenue,
      cancellations_units: isCanceled ? ordersUnits : 0,
      cancel_revenue: isCanceled ? grossRevenue : 0,
      returns_units: returnedUnits
    };
    const deliveryMetrics = {
      delivered_units: isDelivered ? ordersUnits : 0,
      delivered_revenue: isDelivered ? grossRevenue : 0,
      buyout_units: isDelivered ? ordersUnits : 0,
      buyout_revenue: isDelivered ? grossRevenue : 0,
      net_payout: isDelivered ? netRevenue : 0
    };
    for (const [metricKey, value] of Object.entries(orderMetrics)) {
      store.add({ ...commonTotal, ...metricParts(metricKey) }, orderMonth, value);
      if (article) store.add({ ...commonSku, ...metricParts(metricKey) }, orderMonth, value);
    }
    for (const [metricKey, value] of Object.entries(deliveryMetrics)) {
      store.add({ ...commonTotal, ...metricParts(metricKey) }, deliveryMonth, value);
      if (article) store.add({ ...commonSku, ...metricParts(metricKey) }, deliveryMonth, value);
    }
    count += 1;
  }
  sourceNote(notes, sourceLabel, count ? 'loaded' : 'empty', `${count} rows${detail ? ` from ${detail}` : ''}`);
  return count;
}

function addMagnitSalesCsv(store, filePath, notes) {
  if (!filePath) {
    sourceNote(notes, 'Magnit Market sales CSV', 'missing file', 'ALTEA_MAGNIT_SALES_CSV');
    return 0;
  }
  if (!fs.existsSync(filePath)) {
    sourceNote(notes, 'Magnit Market sales CSV', 'missing file', filePath);
    return 0;
  }
  try {
    const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
    return addMagnitSalesRows(store, rows, notes, 'Magnit Market sales CSV', withFileMtime(filePath, path.basename(filePath)));
  } catch (error) {
    sourceNote(notes, 'Magnit Market sales CSV', 'failed', error.message);
    return 0;
  }
}

function addMagnitSalesXlsx(store, filePath, notes) {
  if (!filePath) {
    sourceNote(notes, 'Magnit Market sales XLSX', 'missing file', 'ALTEA_MAGNIT_SALES_XLSX');
    return 0;
  }
  if (!fs.existsSync(filePath)) {
    sourceNote(notes, 'Magnit Market sales XLSX', 'missing file', filePath);
    return 0;
  }
  try {
    const workbook = readWorkbook(filePath);
    const selection = findWorkbookRowsByHeaders(workbook, ['Статус', 'Дата создания', 'Seller SKU ID']);
    if (!selection) {
      sourceNote(notes, 'Magnit Market sales XLSX', 'empty', `${path.basename(filePath)} has no sales sheet`);
      return 0;
    }
    return addMagnitSalesRows(store, selection.rows, notes, 'Magnit Market sales XLSX', withFileMtime(filePath, `${path.basename(filePath)} / ${selection.sheetName}`));
  } catch (error) {
    sourceNote(notes, 'Magnit Market sales XLSX', 'failed', error.message);
    return 0;
  }
}

function addMagnitServicesCsv(store, filePath, notes) {
  if (!filePath) {
    sourceNote(notes, 'Magnit Market services CSV', 'missing file', 'ALTEA_MAGNIT_SERVICES_CSV');
    return;
  }
  if (!fs.existsSync(filePath)) {
    sourceNote(notes, 'Magnit Market services CSV', 'missing file', filePath);
    return;
  }
  try {
    const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
    let count = 0;
    for (const row of rows) {
      const status = normalizeText(row['Статус']).toLowerCase();
      if (status && !/оплачен/.test(status)) continue;
      const month = monthKey(row['Дата списания']);
      if (!month) continue;
      const spend = row['Сумма (руб.)'] || row['Стоимость (руб.)'];
      const commonTotal = { level: 'total', platformKey: 'magnitmarket', source: 'Magnit Market services CSV' };
      store.add({ ...commonTotal, ...metricParts('ads_spend') }, month, spend);
      count += 1;
    }
    sourceNote(notes, 'Magnit Market services CSV', count ? 'loaded' : 'empty', withFileMtime(filePath, `${count} paid rows from ${path.basename(filePath)}`));
  } catch (error) {
    sourceNote(notes, 'Magnit Market services CSV', 'failed', error.message);
  }
}

function deriveRows(store) {
  const months = months2025And2026();
  const existing = store.allRows().slice();
  const scopes = new Set();
  for (const row of existing) {
    scopes.add([row.level, row.platformKey, row.articleKey, row.article, row.name].join('|'));
  }
  for (const scope of scopes) {
    const [level, platformKey, articleKey, article, name] = scope.split('|');
    const base = { level, platformKey, articleKey, article, name, source: 'calculated' };
    for (const month of months) {
      const impressions = store.value(level, platformKey, articleKey, 'impressions_total', month)
        || store.value(level, platformKey, articleKey, 'traffic_card_opens', month)
        || store.value(level, platformKey, articleKey, 'pdp_views', month);
      const cart = store.value(level, platformKey, articleKey, 'add_to_cart_total', month);
      const orders = store.value(level, platformKey, articleKey, 'orders_units', month);
      const revenue = store.value(level, platformKey, articleKey, 'orders_revenue', month);
      const delivered = store.value(level, platformKey, articleKey, 'delivered_units', month)
        || store.value(level, platformKey, articleKey, 'buyout_units', month);
      const adImpressions = store.value(level, platformKey, articleKey, 'ads_impressions', month);
      const adClicks = store.value(level, platformKey, articleKey, 'ads_clicks', month);
      const adSpend = store.value(level, platformKey, articleKey, 'ads_spend', month);
      const adRevenue = store.value(level, platformKey, articleKey, 'ads_revenue', month);
      if (impressions > 0 && cart > 0) store.set({ ...base, metricKey: 'cart_cr' }, month, cart / impressions);
      if (cart > 0 && orders > 0) store.set({ ...base, metricKey: 'order_cr' }, month, orders / cart);
      if (orders > 0 && delivered > 0) store.set({ ...base, metricKey: 'buyout_pct' }, month, delivered / orders);
      if (adImpressions > 0 && adClicks > 0) store.set({ ...base, metricKey: 'ads_ctr' }, month, adClicks / adImpressions);
      if (adRevenue > 0 && adSpend > 0) store.set({ ...base, metricKey: 'ads_drr' }, month, adSpend / adRevenue);
      if (orders > 0 && revenue > 0) {
        store.set({ ...base, metricKey: 'avg_order_value' }, month, revenue / orders);
        store.set({ ...base, metricKey: 'ltv_proxy' }, month, revenue / orders);
      }
    }
  }
}

function totalForYear(row, year) {
  const months = months2025And2026().filter((month) => month.startsWith(`${year}-`));
  if (isRateMetric(row.metricKey) || ['avg_order_value', 'ltv_proxy'].includes(row.metricKey)) {
    const values = months.map((month) => numberOrZero(row.values[month])).filter((value) => value > 0);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : '';
  }
  const total = months.reduce((sum, month) => sum + numberOrZero(row.values[month]), 0);
  return total || '';
}

function formatRowsForForm(store) {
  const months = months2025And2026();
  const byKey = new Map(store.allRows().filter((row) => row.level === 'total').map((row) => [`${row.platformKey}|${row.metricKey}`, row]));
  const rows = [];
  for (const [platformKey, platform] of PLATFORM_ORDER_EXTENDED) {
    for (const metricKey of METRIC_ORDER) {
      const source = byKey.get(`${platformKey}|${metricKey}`);
      const [metric, unit] = METRICS[metricKey] || [metricKey, ''];
      const values = months.map((month) => source?.values?.[month] ?? '');
      rows.push([
        BRAND,
        platform,
        metric,
        unit,
        ...values,
        source ? totalForYear(source, 2025) : '',
        source ? totalForYear(source, 2026) : '',
        source?.source || ''
      ]);
    }
  }
  return rows;
}

function formatSkuRows(store) {
  const months = months2025And2026();
  return store.allRows()
    .filter((row) => row.level === 'sku')
    .sort((left, right) => (
      left.platform.localeCompare(right.platform, 'ru')
      || left.article.localeCompare(right.article, 'ru')
      || METRIC_ORDER.indexOf(left.metricKey) - METRIC_ORDER.indexOf(right.metricKey)
    ))
    .map((row) => [
      row.brand,
      row.platform,
      row.article,
      row.name,
      row.metric,
      row.unit,
      ...months.map((month) => row.values[month] ?? ''),
      totalForYear(row, 2025),
      totalForYear(row, 2026),
      row.source
    ]);
}

function formatRawRows(store) {
  const raw = [];
  for (const row of store.allRows()) {
    for (const month of months2025And2026()) {
      if (row.values[month] === undefined || row.values[month] === '') continue;
      raw.push({
        brand: row.brand,
        level: row.level,
        platform: row.platform,
        platform_key: row.platformKey,
        article: row.article,
        name: row.name,
        metric: row.metric,
        metric_key: row.metricKey,
        unit: row.unit,
        month,
        value: row.values[month],
        source: row.source
      });
    }
  }
  return raw.sort((a, b) => a.month.localeCompare(b.month) || a.platform.localeCompare(b.platform, 'ru'));
}

function makeSheet(rows, headerRows = 1) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRows - 1, c: 0 }, e: { r: rows.length - 1, c: rows[headerRows - 1].length - 1 } }) };
  return ws;
}

function buildOzonLtvSheet() {
  const rows = [
    ['Ozon LTV в заказах: когортная матрица из BI-profit screenshot', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Период на скрине', '01.04.2025 - 03.05.2026', 'Тип', 'LTV в заказах', 'Важно', 'Значения перенесены со скриншота; для автопересчета нужен export/API BI-profit с cohort buyer/order history.', '', '', '', '', '', '', '', '', '', ''],
    ['Год', 'Когорта', 'M001', 'M002', 'M003', 'M004', 'M005', 'M006', 'M007', 'M008', 'M009', 'M010', 'M011', 'M012', 'Всего', 'Источник'],
    ...OZON_LTV_SCREENSHOT_ROWS.map((row) => [...row, 'BI-profit screenshot'])
  ];
  const ws = makeSheet(rows, 3);
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } }
  ];
  setWidths(ws, [12, 18, ...Array(12).fill(10), 10, 28]);
  return ws;
}

function setWidths(ws, widths) {
  ws['!cols'] = widths.map((wch) => ({ wch }));
}

function buildWorkbook(store, notes, options) {
  const months = months2025And2026();
  const monthLabels = months.map((month) => {
    const [year, rawMonth] = month.split('-');
    return `${rawMonth}.${year}`;
  });

  const formHeader1 = ['Бренд', 'Площадка', 'Метрика', 'Ед.', ...monthLabels, '2025 Итого', '2026 Итого', 'Источник'];
  const formRows = [
    [`${BRAND}: максимальная воронка 2025-2026 по месяцам`, '', '', '', ...Array(months.length + 3).fill('')],
    ['', '', '', '', ...Array(12).fill('2025'), ...Array(12).fill('2026'), '', '', ''],
    formHeader1,
    ...formatRowsForForm(store)
  ];
  const formSheet = makeSheet(formRows, 3);
  formSheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: formHeader1.length - 1 } },
    { s: { r: 1, c: 4 }, e: { r: 1, c: 15 } },
    { s: { r: 1, c: 16 }, e: { r: 1, c: 27 } }
  ];
  setWidths(formSheet, [16, 18, 34, 10, ...Array(24).fill(12), 14, 14, 42]);

  const skuHeader = ['Бренд', 'Площадка', 'Артикул/SKU', 'Название', 'Метрика', 'Ед.', ...monthLabels, '2025 Итого', '2026 Итого', 'Источник'];
  const skuSheet = makeSheet([skuHeader, ...formatSkuRows(store)]);
  setWidths(skuSheet, [16, 16, 28, 52, 34, 10, ...Array(24).fill(12), 14, 14, 42]);

  const rawSheet = XLSX.utils.json_to_sheet(formatRawRows(store));
  setWidths(rawSheet, [16, 12, 16, 14, 28, 52, 34, 22, 10, 12, 14, 44]);

  const sourceRows = [
    ['Источник', 'Статус', 'Деталь'],
    ...notes.map((note) => [note.source, note.status, note.detail || '']),
    ['Файл собран', new Date().toISOString(), options.output],
    ['Ограничение', 'LTV', 'Нет ID покупателя из WB/Ozon; строка LTV proxy = выручка / заказ как приближение по товарной воронке.']
  ];
  const sourcesSheet = makeSheet(sourceRows);
  setWidths(sourcesSheet, [34, 18, 100]);

  const readmeRows = [
    ['Что это'],
    [`Отдельный файл по форме: бренд -> площадка -> метрика -> месяцы 2025 и 2026. Будущие месяцы 2026 оставлены пустыми.`],
    ['Как читать'],
    ['Форма_месяцы: верхний срез по площадкам. SKU_месяцы: детализация по артикулам/SKU, где источник даёт такую детализацию. raw_monthly: нормализованная таблица для BI/PowerQuery.'],
    ['Что можно докинуть позже'],
    ['Сторонние площадки: добавляем новые API в raw_monthly и те же строки появятся в форме без изменения структуры.']
  ];
  const readmeSheet = makeSheet(readmeRows, 1);
  setWidths(readmeSheet, [120]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, formSheet, 'Форма_месяцы');
  XLSX.utils.book_append_sheet(wb, buildOzonLtvSheet(), 'Ozon_LTV_когорты');
  XLSX.utils.book_append_sheet(wb, skuSheet, 'SKU_месяцы');
  XLSX.utils.book_append_sheet(wb, rawSheet, 'raw_monthly');
  XLSX.utils.book_append_sheet(wb, sourcesSheet, 'Источники');
  XLSX.utils.book_append_sheet(wb, readmeSheet, 'README');
  return wb;
}

function writeWorkbookSafely(workbook, desiredOutput) {
  fs.mkdirSync(path.dirname(desiredOutput), { recursive: true });
  try {
    XLSX.writeFile(workbook, desiredOutput);
    return desiredOutput;
  } catch (error) {
    if (!/EBUSY|EPERM|access denied|permission/i.test(String(error?.message || ''))) {
      throw error;
    }
    const fallback = desiredOutput.replace(/\.xlsx$/i, `_${timestamp()}.xlsx`);
    XLSX.writeFile(workbook, fallback);
    return fallback;
  }
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (options.command !== 'build') throw new Error(`Unsupported command: ${options.command}`);
  const notes = [];
  const store = new MetricStore();

  if (platformRequested(options, 'wb')) addWbReport(store, options.wbReport, notes);

  const sourceWorkbook = readWorkbook(options.sourceWorkbook);
  if (sourceWorkbook) {
    addFactMarketplace(store, sourceWorkbook, notes, options);
    addFactAds(store, sourceWorkbook, notes, options);
  } else {
    sourceNote(notes, 'Google source workbook', 'missing', options.sourceWorkbook);
  }

  const apiLoadedPlatforms = new Set();
  let zyaApiRows = 0;
  if (platformRequested(options, 'goldapple')) {
    zyaApiRows = await addGenericMarketplaceApi(store, options, notes, {
      platformKey: 'goldapple',
      sourceLabel: 'ZYA API sales',
      defaultArticle: 'zya-unmapped',
      token: options.zyaApiToken,
      baseUrl: options.zyaApiBaseUrl,
      salesPath: options.zyaSalesPath,
      clientId: options.zyaClientId,
      tokenHelp: 'ALTEA_ZYA_API_TOKEN / ALTEA_ZYA_API_KEY / ALTEA_GOLDAPPLE_API_TOKEN',
      endpointHelp: 'ALTEA_ZYA_API_BASE_URL + ALTEA_ZYA_SALES_PATH',
      methodEnv: ['ALTEA_ZYA_API_METHOD', 'ALTEA_GOLDAPPLE_API_METHOD'],
      bodyEnv: ['ALTEA_ZYA_API_BODY_JSON', 'ALTEA_GOLDAPPLE_API_BODY_JSON'],
      graphqlQueryEnv: ['ALTEA_ZYA_GRAPHQL_QUERY', 'ALTEA_GOLDAPPLE_GRAPHQL_QUERY'],
      graphqlQueryHelp: 'ALTEA_ZYA_GRAPHQL_QUERY / ALTEA_GOLDAPPLE_GRAPHQL_QUERY'
    });
  }
  if (zyaApiRows) apiLoadedPlatforms.add('goldapple');
  if (platformRequested(options, 'goldapple') && !zyaApiRows) {
    const zyaSalesZipExists = Boolean(options.zyaSalesZip && fs.existsSync(options.zyaSalesZip));
    const zyaSalesXlsxExists = Boolean(options.zyaSalesXlsx && fs.existsSync(options.zyaSalesXlsx));
    const useZyaZip = zyaSalesZipExists && (!zyaSalesXlsxExists || fileMtimeMs(options.zyaSalesZip) >= fileMtimeMs(options.zyaSalesXlsx));
    let zyaRows = 0;
    if (useZyaZip) {
      zyaRows = addZyaSalesZip(store, options.zyaSalesZip, notes);
      if (!zyaRows && zyaSalesXlsxExists) zyaRows = addZyaSalesXlsx(store, options.zyaSalesXlsx, notes);
    } else {
      if (zyaSalesZipExists) sourceNote(notes, 'ZYA sales ZIP', 'skipped', withFileMtime(options.zyaSalesZip, `newer XLSX selected: ${path.basename(options.zyaSalesXlsx || '')}`));
      zyaRows = addZyaSalesXlsx(store, options.zyaSalesXlsx, notes);
      if (!zyaRows && zyaSalesZipExists) addZyaSalesZip(store, options.zyaSalesZip, notes);
    }
    if (zyaRows) apiLoadedPlatforms.add('goldapple');
  }
  if (platformRequested(options, 'goldapple')) addZyaAdsXlsx(store, options.zyaAdsXlsx, notes);
  let magnitApiRows = 0;
  if (platformRequested(options, 'magnit')) {
    magnitApiRows = await addGenericMarketplaceApi(store, options, notes, {
      platformKey: 'magnitmarket',
      sourceLabel: 'Magnit Market API sales',
      defaultArticle: 'magnit-unmapped',
      token: options.magnitApiToken,
      baseUrl: options.magnitApiBaseUrl,
      salesPath: options.magnitSalesPath,
      clientId: options.magnitClientId,
      tokenHelp: 'ALTEA_MAGNIT_API_TOKEN / ALTEA_MAGNIT_API_KEY / ALTEA_MAGNIT_MARKET_API_TOKEN',
      endpointHelp: 'ALTEA_MAGNIT_API_BASE_URL + ALTEA_MAGNIT_SALES_PATH',
      methodEnv: ['ALTEA_MAGNIT_API_METHOD', 'ALTEA_MAGNIT_MARKET_API_METHOD'],
      bodyEnv: ['ALTEA_MAGNIT_API_BODY_JSON', 'ALTEA_MAGNIT_MARKET_API_BODY_JSON'],
      graphqlQueryEnv: ['ALTEA_MAGNIT_GRAPHQL_QUERY', 'ALTEA_MAGNIT_MARKET_GRAPHQL_QUERY'],
      graphqlQueryHelp: 'ALTEA_MAGNIT_GRAPHQL_QUERY / ALTEA_MAGNIT_MARKET_GRAPHQL_QUERY'
    });
  }
  if (magnitApiRows) apiLoadedPlatforms.add('magnitmarket');
  if (platformRequested(options, 'magnit') && !magnitApiRows) {
    let magnitRows = addMagnitSalesXlsx(store, options.magnitSalesXlsx, notes);
    if (!magnitRows) magnitRows = addMagnitSalesCsv(store, options.magnitSalesCsv, notes);
    if (magnitRows) apiLoadedPlatforms.add('magnitmarket');
    addMagnitServicesCsv(store, options.magnitServicesCsv, notes);
  }
  const megamarketApiRows = platformRequested(options, 'megamarket')
    ? await addMegamarketApiSales(store, options, notes)
    : 0;
  if (megamarketApiRows) apiLoadedPlatforms.add('megamarket');
  const samokatApiRows = platformRequested(options, 'samokat')
    ? await addGenericMarketplaceApi(store, options, notes, {
      platformKey: 'samokat',
      sourceLabel: 'Samokat API sales',
      defaultArticle: 'samokat-unmapped',
      token: options.samokatApiToken,
      baseUrl: options.samokatApiBaseUrl,
      salesPath: options.samokatSalesPath,
      clientId: options.samokatClientId,
      tokenHelp: 'ALTEA_SAMOKAT_API_TOKEN / ALTEA_SAMOKAT_API_KEY',
      endpointHelp: 'ALTEA_SAMOKAT_API_BASE_URL + ALTEA_SAMOKAT_SALES_PATH',
      methodEnv: ['ALTEA_SAMOKAT_API_METHOD'],
      bodyEnv: ['ALTEA_SAMOKAT_API_BODY_JSON'],
      graphqlQueryEnv: ['ALTEA_SAMOKAT_GRAPHQL_QUERY'],
      graphqlQueryHelp: 'ALTEA_SAMOKAT_GRAPHQL_QUERY'
    })
    : 0;
  if (samokatApiRows) apiLoadedPlatforms.add('samokat');
  if (platformRequested(options, 'ozon')) await addOzonApi(store, options, notes);
  if (platformRequested(options, 'wb')) await addWbFunnelApi(store, options, notes);
  if (platformRequested(options, 'ym')) await addYandexMarketApi(store, options, notes);
  if (platformRequested(options, 'letu') && await addLetualApi(store, options, notes)) apiLoadedPlatforms.add('letu');
  addRetailNetworkSalesXlsx(store, options.retailNetworkSalesXlsx, notes, { skipPlatforms: apiLoadedPlatforms, requestedPlatforms: options.requestedPlatforms });
  sourceNote(
    notes,
    'Ozon LTV в заказах',
    'manual screenshot',
    'Added as Ozon_LTV_когорты from BI-profit screenshot, period 01.04.2025-03.05.2026.'
  );
  deriveRows(store);

  const workbook = buildWorkbook(store, notes, options);
  const actualOutput = writeWorkbookSafely(workbook, options.output);

  const summary = {
    output: actualOutput,
    totalRows: store.allRows().filter((row) => row.level === 'total').length,
    skuRows: store.allRows().filter((row) => row.level === 'sku').length,
    rawValues: formatRawRows(store).length,
    sources: notes
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
