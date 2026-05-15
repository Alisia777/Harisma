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
const DEFAULT_SOURCE_WORKBOOK = path.join('.altea-google-sheet-sync-output', 'tmp-source-google-current.xlsx');
const DEFAULT_WB_REPORT = 'report 2026-5-5.xlsx';
const DEFAULT_WB_NM_MAP = '0.xlsx';
const DEFAULT_OUTPUT_DIR = 'exports';
const WB_ANALYTICS_URL = 'https://seller-analytics-api.wildberries.ru';
const OZON_SELLER_URL = 'https://api-seller.ozon.ru';
const LETUAL_DEFAULT_BASE_URL = 'https://partner.letu.ru';
const LETUAL_DEFAULT_GRAPHQL_PATH = '/api/graphql';
const LETUAL_DEFAULT_LOCAL_EXPORT_XLSX = 'C:/Users/artiu/Downloads/Letu.xlsx';
const LETUAL_DEFAULT_PLAN_XLSX = 'C:/Users/artiu/OneDrive/Рабочий стол/План/Лэтуаль.xlsx';
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

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function resolveOptions(args) {
  const outputDir = path.resolve(args['output-dir'] || DEFAULT_OUTPUT_DIR);
  const output = path.resolve(args.output || path.join(outputDir, `altea_max_funnel_2025_2026_${timestamp()}.xlsx`));
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
    letualApiToken: String(args['letual-token'] || process.env.ALTEA_LETUAL_API_TOKEN || '').trim(),
    letualApiBaseUrl: String(args['letual-base-url'] || process.env.ALTEA_LETUAL_API_BASE_URL || LETUAL_DEFAULT_BASE_URL).trim(),
    letualSalesPath: String(args['letual-sales-path'] || process.env.ALTEA_LETUAL_SALES_PATH || LETUAL_DEFAULT_GRAPHQL_PATH).trim(),
    letualClientId: String(args['letual-client-id'] || process.env.ALTEA_LETUAL_CLIENT_ID || '').trim(),
    letualFullHistory: asBool(args['letual-full-history'] ?? process.env.ALTEA_LETUAL_FULL_HISTORY, false),
    letualLocalExportXlsx: String(args['letual-local-export-xlsx'] || process.env.ALTEA_LETUAL_LOCAL_EXPORT_XLSX || LETUAL_DEFAULT_LOCAL_EXPORT_XLSX).trim(),
    letualPlanXlsx: String(args['letual-plan-xlsx'] || process.env.ALTEA_LETUAL_PLAN_XLSX || LETUAL_DEFAULT_PLAN_XLSX).trim(),
    zyaSalesZip: String(args['zya-sales-zip'] || process.env.ALTEA_ZYA_SALES_ZIP || '').trim(),
    zyaAdsXlsx: String(args['zya-ads-xlsx'] || process.env.ALTEA_ZYA_ADS_XLSX || '').trim(),
    magnitSalesCsv: String(args['magnit-sales-csv'] || process.env.ALTEA_MAGNIT_SALES_CSV || '').trim(),
    magnitServicesCsv: String(args['magnit-services-csv'] || process.env.ALTEA_MAGNIT_SERVICES_CSV || '').trim(),
    from: '2025-01-01',
    to: TODAY
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
  const normalized = String(value)
    .replace(/\s+/g, '')
    .replace(/₽/g, '')
    .replace(/руб\.?/gi, '')
    .replace(/%/g, '')
    .replace(',', '.')
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-zа-яё0-9]+/giu, '');
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
  ['magnitmarket', 'Магнит Маркет']
]);

const PLATFORM_LABEL_OVERRIDES = {
  magnitmarket: 'Магнит Маркет'
};

const MARKETPLACE_PLATFORM_OVERRIDES = {
  зя: 'goldapple',
  'золотоеяблоко': 'goldapple',
  'золотое яблоко': 'goldapple',
  'магнитмаркет': 'magnitmarket',
  'магнит маркет': 'magnitmarket'
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

function addFactMarketplace(store, workbook, notes) {
  const rows = sheetRows(workbook, 'fact_marketplace_daily_sku');
  if (!rows.length) {
    sourceNote(notes, 'fact_marketplace_daily_sku', 'missing/empty');
    return;
  }
  let count = 0;
  for (const row of rows) {
    const platformKey = marketplacePlatformKey(row.marketplace);
    if (!platformKey) continue;
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

function addFactAds(store, workbook, notes) {
  const rows = sheetRows(workbook, 'fact_ads_daily_sku');
  if (!rows.length) {
    sourceNote(notes, 'fact_ads_daily_sku', 'missing/empty');
    return;
  }
  let count = 0;
  for (const row of rows) {
    const platformKey = marketplacePlatformKey(row.platform);
    if (!platformKey) continue;
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
  if (keys.some((key) => /offer|sku|year|month|day|order|show|click|revenue|amount|quantity/i.test(key))) {
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
  const metricCandidates = {
    orders_units: ['ordersUnits', 'orderItems', 'quantity', 'qty', 'count', 'sales_qty', 'ordered_units'],
    orders_revenue: ['ordersRevenue', 'revenue', 'amount', 'sum', 'total', 'sales_sum', 'ordered_amount'],
    delivered_units: ['deliveredUnits', 'delivered_count', 'delivered'],
    delivered_revenue: ['deliveredRevenue', 'delivered_amount'],
    returns_units: ['returns', 'returnsUnits', 'returned_count'],
    cancellations_units: ['cancellations', 'cancelled', 'canceled_count']
  };
  let count = 0;
  for (const row of rows) {
    const month = monthKey(row.date || row.day || row.month || row.period || row.createdAt || row.orderDate);
    if (!month) continue;
    const article = normalizeText(row.article || row.offerId || row.sku || row.vendorCode || row.item_code);
    const name = normalizeText(row.name || row.offerName || row.productName);
    const commonTotal = { level: 'total', platformKey: 'letu', source: sourceLabel };
    const commonSku = { level: 'sku', platformKey: 'letu', articleKey: article || 'letu-unmapped', article, name, source: sourceLabel };
    let hasMetric = false;
    for (const [metricKey, candidates] of Object.entries(metricCandidates)) {
      const raw = candidates.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== '');
      if (raw === undefined || raw === null || raw === '') continue;
      store.add({ ...commonTotal, metricKey }, month, raw);
      if (article) store.add({ ...commonSku, metricKey }, month, raw);
      hasMetric = true;
    }
    if (hasMetric) count += 1;
  }
  sourceNote(notes, sourceLabel, count ? 'loaded' : 'empty', `${count} Letual rows parsed`);
}

async function addLetualApi(store, options, notes) {
  if (!options.letualApiToken) {
    sourceNote(notes, 'Letual API', 'missing credentials', 'ALTEA_LETUAL_API_TOKEN');
  } else {
    const url = buildLetualUrl(options);
    if (!url) {
      sourceNote(notes, 'Letual API', 'saved token only', 'Need a Letual endpoint to pull data.');
    } else if (isLetualGraphqlUrl(url)) {
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
        addGenericLetualRows(store, rows, notes, 'Letual API');
      } catch (error) {
        sourceNote(notes, 'Letual API', 'failed', error.message);
      }
    }
  }

  addLetualLocalExport(store, options, notes);
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
    return;
  }
  if (!fs.existsSync(zipPath)) {
    sourceNote(notes, 'ZYA sales ZIP', 'missing file', zipPath);
    return;
  }
  try {
    const selection = loadBestWorkbookRowsFromZip(zipPath, ['Дата заказа', 'Заказано руб', 'Доставлено руб']);
    if (!selection) {
      sourceNote(notes, 'ZYA sales ZIP', 'empty', path.basename(zipPath));
      return;
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
  } catch (error) {
    sourceNote(notes, 'ZYA sales ZIP', 'failed', error.message);
  }
}

function addZyaAdsXlsx(store, filePath, notes) {
  if (!filePath) {
    sourceNote(notes, 'ZYA ads XLSX', 'missing file', 'ALTEA_ZYA_ADS_XLSX');
    return;
  }
  if (!fs.existsSync(filePath)) {
    sourceNote(notes, 'ZYA ads XLSX', 'missing file', filePath);
    return;
  }
  try {
    const workbook = readWorkbook(filePath);
    if (!workbook || !workbook.SheetNames.length) {
      sourceNote(notes, 'ZYA ads XLSX', 'empty', path.basename(filePath));
      return;
    }
    const rows = sheetRows(workbook, workbook.SheetNames[0]);
    let count = 0;
    for (const row of rows) {
      const month = monthKey(row['Кампания']) || monthKeyFromRussianText(row['Кампания'], '2026');
      if (!month) continue;
      const adLabel = normalizeText(row['Реклама']) || normalizeText(row['Кампания']);
      const article = adLabel.replace(/\s*\+\s*$/, '').trim() || `zya-ad-${count}`;
      const name = normalizeText(row['Реклама']) || article;
      const commonTotal = { level: 'total', platformKey: 'goldapple', source: 'ZYA ads XLSX' };
      const commonSku = { level: 'sku', platformKey: 'goldapple', articleKey: article, article, name, source: 'ZYA ads XLSX' };
      const metricValues = {
        impressions_total: row['Показы'],
        pdp_views: row['Просмотры'],
        traffic_card_opens: row['Клики'],
        ads_impressions: row['Показы'],
        ads_clicks: row['Клики'],
        ads_spend: row['Расход (RUB)'],
        ads_orders: numberOrZero(row['PostView Продано товаров']) + numberOrZero(row['PostClick Продано товаров']),
        ads_revenue: numberOrZero(row['PostView Выручка (RUB)']) + numberOrZero(row['PostClick Выручка (RUB)'])
      };
      for (const [metricKey, value] of Object.entries(metricValues)) {
        store.add({ ...commonTotal, ...metricParts(metricKey) }, month, value);
        store.add({ ...commonSku, ...metricParts(metricKey) }, month, value);
      }
      count += 1;
    }
    sourceNote(notes, 'ZYA ads XLSX', count ? 'loaded' : 'empty', withFileMtime(filePath, `${count} rows from ${path.basename(filePath)}`));
  } catch (error) {
    sourceNote(notes, 'ZYA ads XLSX', 'failed', error.message);
  }
}

function addMagnitSalesCsv(store, filePath, notes) {
  if (!filePath) {
    sourceNote(notes, 'Magnit Market sales CSV', 'missing file', 'ALTEA_MAGNIT_SALES_CSV');
    return;
  }
  if (!fs.existsSync(filePath)) {
    sourceNote(notes, 'Magnit Market sales CSV', 'missing file', filePath);
    return;
  }
  try {
    const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
    let count = 0;
    for (const row of rows) {
      const orderMonth = monthKey(row['Дата создания']);
      if (!orderMonth) continue;
      const deliveryMonth = monthKey(row['Дата получения']) || orderMonth;
      const status = normalizeText(row['Статус']).toLowerCase();
      const article = normalizeText(row['Seller SKU ID'] || row['SKU'] || row['Штрихкод']);
      const name = normalizeText(row['Наименование']) || article;
      const commonTotal = { level: 'total', platformKey: 'magnitmarket', source: 'Magnit Market sales CSV' };
      const commonSku = { level: 'sku', platformKey: 'magnitmarket', articleKey: article || `magnit-${count}`, article: article || `magnit-${count}`, name, source: 'Magnit Market sales CSV' };
      const ordersUnits = row['Количество'];
      const grossRevenue = row['Выручка (руб.)'];
      const netRevenue = row['Выручка с вычетом комиссии (руб.)'];
      const returnedUnits = row['Возвраты'];
      const isDelivered = Boolean(row['Дата получения']) || /заверш|достав|получ/i.test(status);
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
    sourceNote(notes, 'Magnit Market sales CSV', count ? 'loaded' : 'empty', withFileMtime(filePath, `${count} rows from ${path.basename(filePath)}`));
  } catch (error) {
    sourceNote(notes, 'Magnit Market sales CSV', 'failed', error.message);
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

  addWbReport(store, options.wbReport, notes);

  const sourceWorkbook = readWorkbook(options.sourceWorkbook);
  if (sourceWorkbook) {
    addFactMarketplace(store, sourceWorkbook, notes);
    addFactAds(store, sourceWorkbook, notes);
  } else {
    sourceNote(notes, 'Google source workbook', 'missing', options.sourceWorkbook);
  }

  addZyaSalesZip(store, options.zyaSalesZip, notes);
  addZyaAdsXlsx(store, options.zyaAdsXlsx, notes);
  addMagnitSalesCsv(store, options.magnitSalesCsv, notes);
  addMagnitServicesCsv(store, options.magnitServicesCsv, notes);
  await addOzonApi(store, options, notes);
  await addWbFunnelApi(store, options, notes);
  await addYandexMarketApi(store, options, notes);
  await addLetualApi(store, options, notes);
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
