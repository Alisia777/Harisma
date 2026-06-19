#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_PLAN_PCT = 0.085;
const DEFAULT_OZON_PLAN_PCT = 0.25;
const DEFAULT_OZON_SMART_SHARE = 0.4;
const OZON_API_BASE_URL = 'https://api-seller.ozon.ru';
const OZON_FINANCE_TRANSACTION_PAGE_SIZE = 1000;
const OZON_FINANCE_DRR_EXCLUSION_FIELDS = [
  'drrExcludedPremiumPlus',
  'drrExcludedOriginalBadge'
];
const OZON_FINANCE_FIELDS = [
  'salesGross',
  'realizationRevenue',
  'discountBonus',
  'partnerPrograms',
  'returnsGross',
  'ozonReward',
  'deliveryServices',
  'partnerServices',
  'fboServices',
  'ads',
  ...OZON_FINANCE_DRR_EXCLUSION_FIELDS,
  'otherServices',
  'compensations',
  'accruedNet'
];
const OZON_FINANCE_GROUP_FIELDS = OZON_FINANCE_FIELDS
  .filter((field) => !OZON_FINANCE_DRR_EXCLUSION_FIELDS.includes(field));
const OZON_REALIZATION_FIELDS = [
  'realizationRevenue',
  'discountBonus',
  'partnerPrograms',
  'realizationSalesGross',
  'realizationReturnRevenue',
  'realizationReturnBonus'
];
const OZON_FINANCE_GROUP_LABELS = {
  salesGross: 'Продажи',
  realizationRevenue: 'Ozon UI revenue',
  discountBonus: 'Ozon discount points',
  partnerPrograms: 'Ozon partner programs',
  returnsGross: 'Возвраты',
  ozonReward: 'Вознаграждение Ozon',
  deliveryServices: 'Услуги доставки',
  partnerServices: 'Услуги партнеров',
  fboServices: 'Услуги FBO',
  ads: 'Продвижение и реклама',
  drrExcludedPremiumPlus: 'Исключено из ДРР: Premium Plus',
  drrExcludedOriginalBadge: 'Исключено из ДРР: Бейдж Оригинал',
  otherServices: 'Другие услуги и штрафы',
  compensations: 'Компенсации и декомпенсации',
  accruedNet: 'Начислено'
};
const OZON_FINANCE_SELLER_UI_CONTROL_BREAKDOWN = {
  salesGross: 25966472,
  returnsGross: -89593,
  ozonReward: -6057377,
  deliveryServices: -2860744,
  partnerServices: -527010,
  fboServices: -578774,
  ads: -6054621,
  otherServices: -130371,
  compensations: -486,
  accruedNet: 9667496
};
const WB_CONTRACT = {
  seller: 'ООО "СМАРТ-СЭЙЛ"',
  source: '2_Соглашение_по_Программе_сотрудничества_2026_на_год_СМАРТ_01_03.docx',
  salesPeriodStart: '2026-03-01',
  salesPeriodEnd: '2026-12-31',
  marketingRate: 0.085,
  thresholdRate: 0.9,
  stornoCancelRate: 0.98,
  halfYears: [
    { key: '2026-H1', from: '2026-01-01', to: '2026-06-30', targetRevenue: 899394278 },
    { key: '2026-H2', from: '2026-07-01', to: '2026-12-31', targetRevenue: 2397395634 }
  ]
};
const CHANNEL_KEYS = [
  ['wbPromotion', 'ВБ Продвижение'],
  ['wbMedia', 'ВБ Медиа'],
  ['wbInfluencer', 'ВБ Инфлюенс'],
  ['pvzAds', 'Реклама в ПВЗ'],
  ['brandZone', 'Брендзона'],
  ['overviews', 'Обзоры'],
  ['reviewPoints', 'Отзывы за баллы'],
  ['externalAds', 'Внешка']
];
const CHANNEL_LABEL_BY_KEY = Object.fromEntries(CHANNEL_KEYS);
const DOWNLOADS_ROOT = path.resolve(process.env.USERPROFILE || process.cwd(), 'Downloads');
const QUARTER_REPORT_CANDIDATES = [
  path.join(DOWNLOADS_ROOT, 'report 2026-5-18.xlsx'),
  path.join(DOWNLOADS_ROOT, 'report 2026-05-18.xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'report 2026-5-18.xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'report 2026-05-18.xlsx'),
  path.join(DOWNLOADS_ROOT, 'report 2026-5-13.xlsx'),
  path.join(DOWNLOADS_ROOT, 'report 2026-05-13.xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'report 2026-5-13.xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'report 2026-05-13.xlsx')
];
const QUARTER_DRR_CANDIDATES = [
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'ДРР ВБ.xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'ДРР ВБ (3).xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'ДРР ВБ (2).xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'ДРР ВБ (1).xlsx'),
  path.join(DOWNLOADS_ROOT, 'ДРР ВБ.xlsx'),
  path.join(DOWNLOADS_ROOT, 'iu-drr-wb-2026-05.xls'),
  path.join(DOWNLOADS_ROOT, 'iu-drr-wb-2026-05 (1).xls'),
  path.join(DOWNLOADS_ROOT, 'iu-drr-wb-2026-05 (2).xls'),
  path.join(DOWNLOADS_ROOT, 'iu-drr-wb-2026-05 (3).xls')
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--mirror-local-fallback') {
      args.mirrorLocalFallback = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function deepClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyOrZero(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const normalized = String(value)
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^0-9.+-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rateOrNull(value) {
  const parsed = moneyOrZero(value);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function roundRate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000000) / 1000000 : null;
}

function medianNumber(values) {
  const sorted = values
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isoDate(value) {
  if (!value && value !== 0) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function todayDateKey() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function dateFromCell(value, yearHint = '') {
  if (!value && value !== 0) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const raw = String(value).trim();
  if (!raw) return '';
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (match) {
    const year = match[3]
      ? (match[3].length === 2 ? `20${match[3]}` : match[3])
      : String(yearHint || '').trim();
    if (!year) return '';
    return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(from, to) {
  const dates = [];
  let cursor = from;
  while (cursor && to && cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function daysInclusive(from, to) {
  if (!from || !to || from > to) return 0;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function maxDate(left, right) {
  if (!left) return right || '';
  if (!right) return left || '';
  return left > right ? left : right;
}

function minDate(left, right) {
  if (!left) return right || '';
  if (!right) return left || '';
  return left < right ? left : right;
}

function contractHalfYearForDate(dateKey) {
  return WB_CONTRACT.halfYears.find((period) => dateKey >= period.from && dateKey <= period.to) || null;
}

function contractDailyTargetRevenueWb(dateKey) {
  if (!dateKey || dateKey < WB_CONTRACT.salesPeriodStart || dateKey > WB_CONTRACT.salesPeriodEnd) return 0;
  const halfYear = contractHalfYearForDate(dateKey);
  if (!halfYear) return 0;
  const days = daysInclusive(halfYear.from, halfYear.to);
  return days > 0 ? numberOrZero(halfYear.targetRevenue) / days : 0;
}

function contractTargetRevenueWbForRange(from, to) {
  if (!from || !to || from > to) return 0;
  let total = 0;
  for (const halfYear of WB_CONTRACT.halfYears) {
    const start = maxDate(from, maxDate(WB_CONTRACT.salesPeriodStart, halfYear.from));
    const end = minDate(to, minDate(WB_CONTRACT.salesPeriodEnd, halfYear.to));
    const activeDays = daysInclusive(start, end);
    const halfYearDays = daysInclusive(halfYear.from, halfYear.to);
    if (activeDays > 0 && halfYearDays > 0) {
      total += numberOrZero(halfYear.targetRevenue) * activeDays / halfYearDays;
    }
  }
  return total;
}

function contractMonthTargetRevenueWb(month) {
  const year = Number(String(month || '').slice(0, 4));
  const monthNumber = Number(String(month || '').slice(5, 7));
  if (!year || !monthNumber) return 0;
  const days = new Date(year, monthNumber, 0).getDate();
  return contractTargetRevenueWbForRange(`${month}-01`, `${month}-${String(days).padStart(2, '0')}`);
}

function companyChannelRevenuePlan(companyPlan, month, channelKey) {
  const source = companyPlan?.months?.[month] || {};
  return Math.max(
    numberOrZero(source.channels?.[channelKey]?.revenue),
    numberOrZero(companyPlan?.rules?.controlTotals?.[month]?.[channelKey])
  );
}

function companyOzonRevenuePlan(companyPlan, month) {
  return companyChannelRevenuePlan(companyPlan, month, 'ozon');
}

function companyWbRevenuePlan(companyPlan, month) {
  return companyChannelRevenuePlan(companyPlan, month, 'wb');
}

function companyYandexRevenuePlan(companyPlan, month) {
  return companyChannelRevenuePlan(companyPlan, month, 'ya');
}

function monthKey(dateKey) {
  return String(dateKey || '').slice(0, 7);
}

function periodLabel(dateKey) {
  return String(dateKey || '').slice(8, 10) + '.' + String(dateKey || '').slice(5, 7);
}

function findExistingPath(candidates = []) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return '';
}

function findNewestDownloadFile(predicate) {
  try {
    const entries = fs.readdirSync(DOWNLOADS_ROOT, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map((entry) => {
        const filePath = path.join(DOWNLOADS_ROOT, entry.name);
        return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
      })
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.filePath || '';
  } catch (_error) {
    return '';
  }
}

function findNewestFileInDirs(dirs, predicate) {
  const matches = [];
  for (const dir of dirs) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !predicate(entry.name)) continue;
        const filePath = path.join(dir, entry.name);
        matches.push({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs });
      }
    } catch (_error) {
      // Optional source folders may not exist.
    }
  }
  return matches.sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.filePath || '';
}

function readWorkbookRows(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
}

function normalizeTextKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function normalizeCampaignId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  const raw = String(value || '').trim().replace(/\s+/g, '');
  if (!raw) return '';
  if (/^\d+(?:\.0+)?$/.test(raw)) return String(Math.trunc(Number(raw)));
  return raw;
}

function decodeOzonLowByteText(value) {
  return String(value || '').replace(/[\s\S]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code === 0x01) return 'Ё';
    if (code === 0x51) return 'ё';
    if (code >= 0x10 && code <= 0x4f) return String.fromCharCode(0x0400 + code);
    return char;
  });
}

function normalizeSkuKey(value) {
  return String(value || '').trim().replace(/^'+/, '').trim();
}

function findHeaderIndex(headers, patterns) {
  const normalized = headers.map((header) => normalizeTextKey(header));
  for (const pattern of patterns) {
    const index = normalized.findIndex((header) => pattern.test(header));
    if (index >= 0) return index;
  }
  return -1;
}

function parseDelimitedLine(line, separator = ';') {
  const result = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < String(line).length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === separator && !quoted) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

function readSemicolonCsvRows(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return lines.map((line) => parseDelimitedLine(line, ';'));
}

function getRowValue(row, index) {
  return index >= 0 ? row?.[index] : null;
}

function buildOzonProductMaps(filePath) {
  const rows = readSemicolonCsvRows(filePath);
  if (!rows.length) return { bySku: new Map(), byArticle: new Map(), rows: 0 };
  const headers = rows[0] || [];
  const index = {
    article: findHeaderIndex(headers, [/^артикул$/i]),
    productId: findHeaderIndex(headers, [/ozon product id/i]),
    sku: findHeaderIndex(headers, [/^sku$/i]),
    name: findHeaderIndex(headers, [/название товара/i]),
    category: findHeaderIndex(headers, [/^категория$/i]),
    type: findHeaderIndex(headers, [/^тип$/i]),
    status: findHeaderIndex(headers, [/статус товара/i]),
    fboStock: findHeaderIndex(headers, [/доступно к продаже по схеме fbo/i]),
    reservedStock: findHeaderIndex(headers, [/^зарезервировано/i]),
    fbsStock: findHeaderIndex(headers, [/доступно к продаже по схеме fbs/i]),
    realFbsStock: findHeaderIndex(headers, [/доступно к продаже по схеме realfbs/i]),
    ownReservedStock: findHeaderIndex(headers, [/зарезервировано на моих складах/i]),
    price: findHeaderIndex(headers, [/текущая цена/i])
  };
  const bySku = new Map();
  const byArticle = new Map();
  for (const row of rows.slice(1)) {
    const sku = normalizeSkuKey(getRowValue(row, index.sku));
    const article = normalizeSkuKey(getRowValue(row, index.article));
    const item = {
      article,
      ozonProductId: normalizeSkuKey(getRowValue(row, index.productId)),
      sku,
      name: String(getRowValue(row, index.name) || '').trim(),
      category: String(getRowValue(row, index.category) || '').trim(),
      productType: String(getRowValue(row, index.type) || '').trim(),
      status: String(getRowValue(row, index.status) || '').trim(),
      fboStock: moneyOrZero(getRowValue(row, index.fboStock)),
      reservedStock: moneyOrZero(getRowValue(row, index.reservedStock)),
      fbsStock: moneyOrZero(getRowValue(row, index.fbsStock)),
      realFbsStock: moneyOrZero(getRowValue(row, index.realFbsStock)),
      ownReservedStock: moneyOrZero(getRowValue(row, index.ownReservedStock)),
      price: moneyOrZero(getRowValue(row, index.price))
    };
    item.availableStock = item.fboStock + item.fbsStock + item.realFbsStock;
    if (sku && !bySku.has(sku)) bySku.set(sku, item);
    if (article && !byArticle.has(article.toLowerCase())) byArticle.set(article.toLowerCase(), item);
  }
  return { bySku, byArticle, rows: Math.max(0, rows.length - 1) };
}

function emptyOzonFinanceBucket(key = '', label = '') {
  return {
    key,
    label,
    rowCount: 0,
    quantity: 0,
    salesGross: 0,
    realizationRevenue: 0,
    discountBonus: 0,
    partnerPrograms: 0,
    realizationSalesGross: 0,
    realizationReturnRevenue: 0,
    realizationReturnBonus: 0,
    returnsGross: 0,
    ozonReward: 0,
    deliveryServices: 0,
    partnerServices: 0,
    fboServices: 0,
    ads: 0,
    drrExcludedPremiumPlus: 0,
    drrExcludedOriginalBadge: 0,
    otherServices: 0,
    compensations: 0,
    accruedNet: 0
  };
}

function addOzonFinanceParts(bucket, parts) {
  bucket.rowCount += 1;
  bucket.quantity += numberOrZero(parts.quantity);
  for (const key of OZON_FINANCE_FIELDS) {
    bucket[key] = numberOrZero(bucket[key]) + numberOrZero(parts[key]);
  }
  return bucket;
}

function materializeOzonFinanceBucket(bucket) {
  const result = { ...bucket };
  for (const key of OZON_FINANCE_FIELDS) result[key] = roundMoney(result[key]);
  result.quantity = roundMoney(result.quantity);
  const excludedFromDrr = OZON_FINANCE_DRR_EXCLUSION_FIELDS
    .reduce((sum, field) => sum + numberOrZero(result[field]), 0);
  const grossPromotionExpense = Math.max(0, -numberOrZero(result.ads));
  result.drrExcludedTotal = roundMoney(excludedFromDrr);
  result.drrSpendGross = roundMoney(grossPromotionExpense);
  result.drrSpend = roundMoney(Math.max(0, grossPromotionExpense - excludedFromDrr));

  const realizationGross = numberOrZero(result.realizationSalesGross);
  const financeGross = numberOrZero(result.salesGross);
  const gmvGross = realizationGross > 0 ? realizationGross : financeGross;
  const realizationReturns = numberOrZero(result.realizationReturnRevenue) + numberOrZero(result.realizationReturnBonus);
  const financeReturns = Math.abs(Math.min(0, numberOrZero(result.returnsGross)));
  const gmvReturns = realizationReturns > 0 ? realizationReturns : financeReturns;
  result.ozonGmvGross = roundMoney(gmvGross);
  result.ozonReturns = roundMoney(gmvReturns);
  result.ozonGmv = roundMoney(Math.max(0, gmvGross - gmvReturns));
  result.ozonGmvMode = realizationGross > 0
    ? 'realization_by_day_sales_minus_returns'
    : (financeGross > 0 ? 'finance_transactions_sales_minus_returns' : '');
  return result;
}

function deliveryColumnsTotal(row, indexes) {
  return indexes.deliveryColumns.reduce((sum, index) => sum + moneyOrZero(getRowValue(row, index)), 0);
}

function ozonFinanceLeftoverGroup(type) {
  const raw = normalizeTextKey(type);
  const decoded = normalizeTextKey(decodeOzonLowByteText(type));
  const text = `${raw} ${decoded}`;
  if (/costperclick|promotion|advertising|premium|installment|cashback|badge|sellerinstallment/.test(text)) return 'ads';
  if (/compensat|decompensat/.test(text)) return 'compensations';
  if (/fbo|warehouse|storage|supply|crossdocking|cargo|shortage|surplus|expiration|package|disposal|spoiling|spoilage|shipment|dropoff|directflow|fulfillment|movement/.test(text)) {
    return 'fboServices';
  }
  if (/acquiring|earlypayment|flexiblepayment|partner/.test(text)) return 'partnerServices';
  if (
    /оплата.?за.?клик|продвижение|реклама|premium|рассроч|бонусы.?продавца|бейдж/.test(text)
    || raw.includes('70 :;8:')
    || raw.includes('70 70:07')
    || raw.includes('5:;0<0 2 a5b8')
  ) return 'ads';
  if (/компенсац|декомпенсац/.test(text)) return 'compensations';
  if (/fbo|склад|склада|грузомест|кросс.?докинг|поставк|вывоз|утилизац|сроков.?годности|упаковк|брак|излишк|бронированию.?места|слот/.test(text)) {
    return 'fboServices';
  }
  if (/эквайринг|досрочн|гибкий.?график|партнер|партнёр/.test(text)) {
    return 'partnerServices';
  }
  return 'otherServices';
}

function ozonFinanceDrrExclusionField(type) {
  const raw = normalizeTextKey(type);
  const decoded = normalizeTextKey(decodeOzonLowByteText(type));
  const text = `${raw} ${decoded}`;
  if (/operationsubscriptionpremiumplus|premium\s*plus|premiumplus|подписк.*premium/.test(text)) {
    return 'drrExcludedPremiumPlus';
  }
  if (/operationlabeloriginal|labeloriginal|original.*badge|badge.*original|бейдж.*оригинал|оригинал.*бейдж/.test(text)) {
    return 'drrExcludedOriginalBadge';
  }
  return '';
}

function applyOzonFinanceLeftover(parts, type, leftover) {
  const group = ozonFinanceLeftoverGroup(type);
  parts[group] += leftover;
  const exclusionField = group === 'ads' ? ozonFinanceDrrExclusionField(type) : '';
  if (exclusionField) {
    parts[exclusionField] += -leftover;
  }
}

function ozonFinanceIndexes(headers) {
  const detectedDeliveryColumns = [
    [/сборка заказа/i],
    [/обработка отправления/i],
    [/^магистраль$/i],
    [/последняя миля/i],
    [/обратная магистраль/i],
    [/обработка возврата/i],
    [/обработка отмененного/i],
    [/обработка невыкупленного/i],
    [/^логистика$/i],
    [/обратная логистика/i]
  ].map((patterns) => findHeaderIndex(headers, patterns)).filter((index) => index >= 0);
  const withFallback = (value, fallback) => (value >= 0 ? value : fallback);
  const deliveryColumns = detectedDeliveryColumns.length ? detectedDeliveryColumns : [12, 13, 14, 15, 16, 17, 18, 19, 20, 23];
  return {
    date: withFallback(findHeaderIndex(headers, [/дата начисления/i]), 0),
    type: withFallback(findHeaderIndex(headers, [/тип начисления/i]), 1),
    sku: withFallback(findHeaderIndex(headers, [/^sku$/i]), 5),
    article: withFallback(findHeaderIndex(headers, [/^артикул$/i]), 6),
    name: withFallback(findHeaderIndex(headers, [/название товара или услуги/i, /название товара/i]), 7),
    quantity: withFallback(findHeaderIndex(headers, [/^количество$/i]), 8),
    gross: withFallback(findHeaderIndex(headers, [/за продажу.*возврат.*вычета/i, /до вычета комиссий/i]), 9),
    reward: withFallback(findHeaderIndex(headers, [/^вознаграждение ozon$/i]), 11),
    total: withFallback(findHeaderIndex(headers, [/итого.*руб/i, /^итого$/i]), 24),
    deliveryColumns
  };
}

function ozonFinancePartsFromRow(row, indexes) {
  const gross = moneyOrZero(getRowValue(row, indexes.gross));
  const total = moneyOrZero(getRowValue(row, indexes.total));
  const reward = moneyOrZero(getRowValue(row, indexes.reward));
  const deliveryServices = deliveryColumnsTotal(row, indexes);
  const salesGross = gross > 0 ? gross : 0;
  const returnsGross = gross < 0 ? gross : 0;
  const type = String(getRowValue(row, indexes.type) || '').trim();
  const leftoverRaw = total - gross - reward - deliveryServices;
  const leftover = Math.abs(leftoverRaw) < 0.005 ? 0 : leftoverRaw;
  const parts = {
    type,
    date: isoDate(getRowValue(row, indexes.date)),
    sku: normalizeSkuKey(getRowValue(row, indexes.sku)),
    article: normalizeSkuKey(getRowValue(row, indexes.article)),
    name: String(getRowValue(row, indexes.name) || '').trim(),
    quantity: moneyOrZero(getRowValue(row, indexes.quantity)),
    salesGross,
    returnsGross,
    ozonReward: reward,
    deliveryServices,
    partnerServices: 0,
    fboServices: 0,
    ads: 0,
    drrExcludedPremiumPlus: 0,
    drrExcludedOriginalBadge: 0,
    otherServices: 0,
    compensations: 0,
    accruedNet: total
  };
  applyOzonFinanceLeftover(parts, type, leftover);
  return parts;
}

function productForOzonFinanceRow(parts, productMaps) {
  return productMaps.bySku.get(parts.sku)
    || productMaps.byArticle.get(String(parts.article || '').toLowerCase())
    || null;
}

function buildOzonFinanceSummary(options) {
  const financePath = options.ozonFinancePath || '';
  if (!financePath || !fs.existsSync(financePath)) {
    return {
      status: 'missing',
      source: { financePath, productsPath: options.ozonProductsPath || '', productRows: 0 },
      totals: materializeOzonFinanceBucket(emptyOzonFinanceBucket('total', 'Начислено Ozon')),
      daily: [],
      months: [],
      groups: [],
      sku: [],
      categories: [],
      types: [],
      control: {
        rowsAccruedNet: 0,
        sellerUiAccruedNet: roundMoney(options.ozonFinanceControlTotal),
        deltaToSellerUi: options.ozonFinanceControlTotal ? roundMoney(0 - options.ozonFinanceControlTotal) : null
      },
      diagnostics: { warnings: ['Ozon Finance workbook not found'] }
    };
  }
  const rows = readWorkbookRows(financePath);
  const headers = rows[0] || [];
  const indexes = ozonFinanceIndexes(headers);
  const required = ['date', 'type', 'gross', 'reward', 'total'];
  const missing = required.filter((key) => indexes[key] < 0);
  const productMaps = buildOzonProductMaps(options.ozonProductsPath);
  const totals = emptyOzonFinanceBucket('total', 'Начислено Ozon');
  const daily = new Map();
  const months = new Map();
  const groups = new Map();
  const sku = new Map();
  const categories = new Map();
  const types = new Map();
  let nonSkuRowCount = 0;
  let unmappedSkuRows = 0;
  if (!missing.length) {
    for (const row of rows.slice(1)) {
      const parts = ozonFinancePartsFromRow(row, indexes);
      if (!parts.date && !parts.type && !parts.sku && !parts.article && !parts.accruedNet) continue;
      addOzonFinanceParts(totals, parts);
      if (parts.date) {
        const current = daily.get(parts.date) || emptyOzonFinanceBucket(parts.date, parts.date);
        addOzonFinanceParts(current, parts);
        daily.set(parts.date, current);
        const month = monthKey(parts.date);
        const monthBucket = months.get(month) || emptyOzonFinanceBucket(month, month);
        addOzonFinanceParts(monthBucket, parts);
        months.set(month, monthBucket);
      }
      for (const key of OZON_FINANCE_GROUP_FIELDS.filter((field) => field !== 'accruedNet')) {
        const value = numberOrZero(parts[key]);
        if (!value) continue;
        const groupBucket = groups.get(key) || emptyOzonFinanceBucket(key, OZON_FINANCE_GROUP_LABELS[key] || key);
        groupBucket.rowCount += 1;
        groupBucket[key] += value;
        groupBucket.accruedNet += value;
        groups.set(key, groupBucket);
      }
      const typeKey = parts.type || 'Без типа';
      const typeBucket = types.get(typeKey) || emptyOzonFinanceBucket(typeKey, typeKey);
      addOzonFinanceParts(typeBucket, parts);
      types.set(typeKey, typeBucket);

      const product = productForOzonFinanceRow(parts, productMaps);
      if (parts.sku || parts.article) {
        const skuKey = parts.sku || parts.article;
        const skuBucket = sku.get(skuKey) || {
          ...emptyOzonFinanceBucket(skuKey, parts.article || skuKey),
          sku: parts.sku,
          article: parts.article,
          name: parts.name,
          productName: product?.name || parts.name,
          category: product?.category || '',
          productType: product?.productType || '',
          status: product?.status || '',
          ozonProductId: product?.ozonProductId || '',
          fboStock: product?.fboStock || 0,
          fbsStock: product?.fbsStock || 0,
          realFbsStock: product?.realFbsStock || 0,
          availableStock: product?.availableStock || 0,
          reservedStock: product?.reservedStock || 0,
          ownReservedStock: product?.ownReservedStock || 0,
          price: product?.price || 0,
          unmapped: !product
        };
        if (!skuBucket.productName && product?.name) skuBucket.productName = product.name;
        if (!skuBucket.name && parts.name) skuBucket.name = parts.name;
        addOzonFinanceParts(skuBucket, parts);
        sku.set(skuKey, skuBucket);
        if (!product) unmappedSkuRows += 1;

        const categoryKey = product?.category || 'Без категории';
        const categoryBucket = categories.get(categoryKey) || emptyOzonFinanceBucket(categoryKey, categoryKey);
        addOzonFinanceParts(categoryBucket, parts);
        categories.set(categoryKey, categoryBucket);
      } else {
        nonSkuRowCount += 1;
      }
    }
  }
  const rowsAccruedNet = roundMoney(totals.accruedNet);
  const sellerUiAccruedNet = options.ozonFinanceControlTotal ? roundMoney(options.ozonFinanceControlTotal) : null;
  const materializedTotals = materializeOzonFinanceBucket(totals);
  const sellerUiBreakdown = sellerUiAccruedNet === OZON_FINANCE_SELLER_UI_CONTROL_BREAKDOWN.accruedNet
    ? { ...OZON_FINANCE_SELLER_UI_CONTROL_BREAKDOWN }
    : {};
  const groupDeltas = Object.fromEntries(OZON_FINANCE_FIELDS
    .filter((field) => field !== 'quantity')
    .filter((field) => sellerUiBreakdown[field] !== undefined)
    .map((field) => [field, {
      rowsValue: roundMoney(materializedTotals[field]),
      sellerUiValue: roundMoney(sellerUiBreakdown[field]),
      delta: roundMoney(materializedTotals[field] - sellerUiBreakdown[field])
    }]));
  return {
    status: missing.length ? 'error' : 'ok',
    source: {
      financePath,
      financeFile: path.basename(financePath),
      productsPath: options.ozonProductsPath || '',
      productsFile: options.ozonProductsPath ? path.basename(options.ozonProductsPath) : '',
      productRows: productMaps.rows,
      sourceRows: Math.max(0, rows.length - 1)
    },
    window: {
      from: [...daily.keys()].sort()[0] || '',
      to: [...daily.keys()].sort().pop() || '',
      days: daily.size
    },
    totals: materializedTotals,
    daily: [...daily.values()]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((bucket) => materializeOzonFinanceBucket({ ...bucket, date: bucket.key, period: periodLabel(bucket.key), monthKey: monthKey(bucket.key) })),
    months: [...months.values()]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((bucket) => materializeOzonFinanceBucket({ ...bucket, monthKey: bucket.key })),
    groups: [...groups.values()]
      .map(materializeOzonFinanceBucket)
      .sort((left, right) => Math.abs(right.accruedNet) - Math.abs(left.accruedNet)),
    sku: [...sku.values()]
      .map((bucket) => ({
        ...materializeOzonFinanceBucket(bucket),
        fboStock: roundMoney(bucket.fboStock),
        fbsStock: roundMoney(bucket.fbsStock),
        realFbsStock: roundMoney(bucket.realFbsStock),
        availableStock: roundMoney(bucket.availableStock),
        reservedStock: roundMoney(bucket.reservedStock),
        ownReservedStock: roundMoney(bucket.ownReservedStock),
        price: roundMoney(bucket.price)
      }))
      .sort((left, right) => Math.abs(right.accruedNet) - Math.abs(left.accruedNet)),
    categories: [...categories.values()]
      .map(materializeOzonFinanceBucket)
      .sort((left, right) => Math.abs(right.accruedNet) - Math.abs(left.accruedNet)),
    types: [...types.values()]
      .map(materializeOzonFinanceBucket)
      .sort((left, right) => Math.abs(right.accruedNet) - Math.abs(left.accruedNet)),
    control: {
      rowsAccruedNet,
      sellerUiAccruedNet,
      deltaToSellerUi: sellerUiAccruedNet === null ? null : roundMoney(rowsAccruedNet - sellerUiAccruedNet),
      sellerUiBreakdown,
      groupDeltas
    },
    diagnostics: {
      missingHeaders: missing,
      nonSkuRowCount,
      unmappedSkuRows,
      deliveryColumns: indexes.deliveryColumns.length,
      warnings: missing.length ? [`Missing required Ozon Finance headers: ${missing.join(', ')}`] : []
    }
  };
}

function classifyOzonApiServiceAsDelivery(serviceName = '') {
  const text = normalizeTextKey(serviceName);
  return /delivery|returnflow|lastmile|logistic|logistics|handover|directflowlogistic/.test(text);
}

function ozonFinancePartsFromApiOperation(operation = {}) {
  const services = Array.isArray(operation.services) ? operation.services : [];
  const items = Array.isArray(operation.items) ? operation.items : [];
  const serviceDelivery = services
    .filter((service) => classifyOzonApiServiceAsDelivery(service?.name))
    .reduce((sum, service) => sum + moneyOrZero(service?.price), 0);
  const gross = moneyOrZero(operation.accruals_for_sale);
  const total = moneyOrZero(operation.amount);
  const reward = moneyOrZero(operation.sale_commission);
  const type = [
    operation.operation_type,
    operation.operation_type_name,
    operation.type
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' | ');
  const leftoverRaw = total - gross - reward - serviceDelivery;
  const leftover = Math.abs(leftoverRaw) < 0.005 ? 0 : leftoverRaw;
  const firstItem = items[0] || {};
  const parts = {
    type,
    date: isoDate(operation.operation_date),
    sku: normalizeSkuKey(firstItem.sku),
    article: '',
    name: String(firstItem.name || operation.operation_type_name || operation.operation_type || '').trim(),
    quantity: items.length || 0,
    salesGross: gross > 0 ? gross : 0,
    returnsGross: gross < 0 ? gross : 0,
    ozonReward: reward,
    deliveryServices: serviceDelivery,
    partnerServices: 0,
    fboServices: 0,
    ads: 0,
    drrExcludedPremiumPlus: 0,
    drrExcludedOriginalBadge: 0,
    otherServices: 0,
    compensations: 0,
    accruedNet: total
  };
  applyOzonFinanceLeftover(parts, type, leftover);
  return parts;
}

function materializeOzonFinanceSummaryFromParts(options, partsRows, source, warnings = []) {
  const productMaps = buildOzonProductMaps(options.ozonProductsPath);
  const totals = emptyOzonFinanceBucket('total', 'Ozon accrued');
  const daily = new Map();
  const months = new Map();
  const groups = new Map();
  const sku = new Map();
  const categories = new Map();
  const types = new Map();
  let nonSkuRowCount = 0;
  let unmappedSkuRows = 0;

  for (const parts of partsRows) {
    if (!parts.date && !parts.type && !parts.sku && !parts.article && !parts.accruedNet) continue;
    addOzonFinanceParts(totals, parts);
    if (parts.date) {
      const current = daily.get(parts.date) || emptyOzonFinanceBucket(parts.date, parts.date);
      addOzonFinanceParts(current, parts);
      daily.set(parts.date, current);
      const month = monthKey(parts.date);
      const monthBucket = months.get(month) || emptyOzonFinanceBucket(month, month);
      addOzonFinanceParts(monthBucket, parts);
      months.set(month, monthBucket);
    }
    for (const key of OZON_FINANCE_GROUP_FIELDS.filter((field) => field !== 'accruedNet')) {
      const value = numberOrZero(parts[key]);
      if (!value) continue;
      const groupBucket = groups.get(key) || emptyOzonFinanceBucket(key, OZON_FINANCE_GROUP_LABELS[key] || key);
      groupBucket.rowCount += 1;
      groupBucket[key] += value;
      groupBucket.accruedNet += value;
      groups.set(key, groupBucket);
    }
    const typeKey = parts.type || 'No type';
    const typeBucket = types.get(typeKey) || emptyOzonFinanceBucket(typeKey, typeKey);
    addOzonFinanceParts(typeBucket, parts);
    types.set(typeKey, typeBucket);

    const product = productForOzonFinanceRow(parts, productMaps);
    if (parts.sku || parts.article) {
      const skuKey = parts.sku || parts.article;
      const skuBucket = sku.get(skuKey) || {
        ...emptyOzonFinanceBucket(skuKey, parts.article || skuKey),
        sku: parts.sku,
        article: parts.article || product?.article || '',
        name: parts.name,
        productName: product?.name || parts.name,
        category: product?.category || '',
        productType: product?.productType || '',
        status: product?.status || '',
        ozonProductId: product?.ozonProductId || '',
        fboStock: product?.fboStock || 0,
        fbsStock: product?.fbsStock || 0,
        realFbsStock: product?.realFbsStock || 0,
        availableStock: product?.availableStock || 0,
        reservedStock: product?.reservedStock || 0,
        ownReservedStock: product?.ownReservedStock || 0,
        price: product?.price || 0,
        unmapped: !product
      };
      if (!skuBucket.productName && product?.name) skuBucket.productName = product.name;
      if (!skuBucket.name && parts.name) skuBucket.name = parts.name;
      addOzonFinanceParts(skuBucket, parts);
      sku.set(skuKey, skuBucket);
      if (!product) unmappedSkuRows += 1;

      const categoryKey = product?.category || 'Unmapped';
      const categoryBucket = categories.get(categoryKey) || emptyOzonFinanceBucket(categoryKey, categoryKey);
      addOzonFinanceParts(categoryBucket, parts);
      categories.set(categoryKey, categoryBucket);
    } else {
      nonSkuRowCount += 1;
    }
  }

  const rowsAccruedNet = roundMoney(totals.accruedNet);
  const sellerUiAccruedNet = options.ozonFinanceControlTotal ? roundMoney(options.ozonFinanceControlTotal) : null;
  const materializedTotals = materializeOzonFinanceBucket(totals);
  const sellerUiBreakdown = sellerUiAccruedNet === OZON_FINANCE_SELLER_UI_CONTROL_BREAKDOWN.accruedNet
    ? { ...OZON_FINANCE_SELLER_UI_CONTROL_BREAKDOWN }
    : {};
  const groupDeltas = Object.fromEntries(OZON_FINANCE_FIELDS
    .filter((field) => field !== 'quantity')
    .filter((field) => sellerUiBreakdown[field] !== undefined)
    .map((field) => [field, {
      rowsValue: roundMoney(materializedTotals[field]),
      sellerUiValue: roundMoney(sellerUiBreakdown[field]),
      delta: roundMoney(materializedTotals[field] - sellerUiBreakdown[field])
    }]));

  return {
    status: 'ok',
    source: {
      ...source,
      productsPath: options.ozonProductsPath || '',
      productsFile: options.ozonProductsPath ? path.basename(options.ozonProductsPath) : '',
      productRows: productMaps.rows,
      sourceRows: partsRows.length
    },
    window: {
      from: [...daily.keys()].sort()[0] || '',
      to: [...daily.keys()].sort().pop() || '',
      days: daily.size
    },
    totals: materializedTotals,
    daily: [...daily.values()]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((bucket) => materializeOzonFinanceBucket({ ...bucket, date: bucket.key, period: periodLabel(bucket.key), monthKey: monthKey(bucket.key) })),
    months: [...months.values()]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((bucket) => materializeOzonFinanceBucket({ ...bucket, monthKey: bucket.key })),
    groups: [...groups.values()]
      .map(materializeOzonFinanceBucket)
      .sort((left, right) => Math.abs(right.accruedNet) - Math.abs(left.accruedNet)),
    sku: [...sku.values()]
      .map((bucket) => ({
        ...materializeOzonFinanceBucket(bucket),
        fboStock: roundMoney(bucket.fboStock),
        fbsStock: roundMoney(bucket.fbsStock),
        realFbsStock: roundMoney(bucket.realFbsStock),
        availableStock: roundMoney(bucket.availableStock),
        reservedStock: roundMoney(bucket.reservedStock),
        ownReservedStock: roundMoney(bucket.ownReservedStock),
        price: roundMoney(bucket.price)
      }))
      .sort((left, right) => Math.abs(right.accruedNet) - Math.abs(left.accruedNet)),
    categories: [...categories.values()]
      .map(materializeOzonFinanceBucket)
      .sort((left, right) => Math.abs(right.accruedNet) - Math.abs(left.accruedNet)),
    types: [...types.values()]
      .map(materializeOzonFinanceBucket)
      .sort((left, right) => Math.abs(right.accruedNet) - Math.abs(left.accruedNet)),
    control: {
      rowsAccruedNet,
      sellerUiAccruedNet,
      deltaToSellerUi: sellerUiAccruedNet === null ? null : roundMoney(rowsAccruedNet - sellerUiAccruedNet),
      sellerUiBreakdown,
      groupDeltas
    },
    diagnostics: {
      missingHeaders: [],
      nonSkuRowCount,
      unmappedSkuRows,
      deliveryColumns: 0,
      warnings
    }
  };
}

async function ozonApiRequest(options, endpoint, body) {
  const response = await fetch(`${options.ozonApiBaseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-Id': options.ozonClientId,
      'Api-Key': options.ozonApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_error) {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(`Ozon API ${endpoint} failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return payload || {};
}

async function fetchOzonFinanceApiOperations(options) {
  const pageSize = Math.max(1, Math.min(1000, Math.trunc(numberOrZero(options.ozonFinanceApiPageSize || OZON_FINANCE_TRANSACTION_PAGE_SIZE))));
  const operations = [];
  let pageCount = 1;
  let rowCount = 0;
  for (let page = 1; page <= pageCount; page += 1) {
    const payload = await ozonApiRequest(options, '/v3/finance/transaction/list', {
      filter: {
        date: {
          from: `${options.ozonFinanceApiFrom}T00:00:00.000Z`,
          to: `${options.ozonFinanceApiTo}T23:59:59.999Z`
        },
        operation_type: [],
        posting_number: '',
        transaction_type: 'all'
      },
      page,
      page_size: pageSize
    });
    const result = payload.result || {};
    if (page === 1) {
      pageCount = Math.max(1, Math.trunc(numberOrZero(result.page_count || 1)));
      rowCount = Math.trunc(numberOrZero(result.row_count || 0));
    }
    operations.push(...(Array.isArray(result.operations) ? result.operations : []));
  }
  return { operations, pageCount, rowCount, pageSize };
}

async function buildOzonFinanceSummaryFromApi(options) {
  if (!options.ozonClientId || !options.ozonApiKey) {
    return {
      status: 'missing',
      source: { sourceMode: 'api', endpoint: '/v3/finance/transaction/list', sourceRows: 0 },
      totals: materializeOzonFinanceBucket(emptyOzonFinanceBucket('total', 'Ozon accrued')),
      daily: [],
      months: [],
      groups: [],
      sku: [],
      categories: [],
      types: [],
      control: {
        rowsAccruedNet: 0,
        sellerUiAccruedNet: roundMoney(options.ozonFinanceControlTotal),
        deltaToSellerUi: options.ozonFinanceControlTotal ? roundMoney(0 - options.ozonFinanceControlTotal) : null
      },
      diagnostics: { warnings: ['Ozon API credentials are not set'] }
    };
  }
  const fetched = await fetchOzonFinanceApiOperations(options);
  const partsRows = fetched.operations.map(ozonFinancePartsFromApiOperation);
  return materializeOzonFinanceSummaryFromParts(options, partsRows, {
    sourceMode: 'api',
    endpoint: '/v3/finance/transaction/list',
    apiBaseUrl: options.ozonApiBaseUrl,
    from: options.ozonFinanceApiFrom,
    to: options.ozonFinanceApiTo,
    apiRowCount: fetched.rowCount,
    fetchedRows: fetched.operations.length,
    pageCount: fetched.pageCount,
    pageSize: fetched.pageSize
  }, fetched.operations.length === fetched.rowCount ? [] : [
    `Ozon API row_count ${fetched.rowCount} differs from fetched rows ${fetched.operations.length}; finance data may have changed during pagination.`
  ]);
}

function emptyOzonRealizationBucket(date = '') {
  return {
    date,
    rowCount: 0,
    realizationRevenue: 0,
    discountBonus: 0,
    partnerPrograms: 0,
    realizationSalesGross: 0,
    realizationReturnRevenue: 0,
    realizationReturnBonus: 0
  };
}

function addOzonRealizationRow(bucket, row = {}) {
  const delivery = row.delivery_commission || {};
  const returnCommission = row.return_commission || {};
  const hasDelivery = Boolean(row.delivery_commission);
  const quantity = numberOrZero(delivery.quantity || 1) || 1;
  const revenue = moneyOrZero(delivery.amount);
  const discountBonus = moneyOrZero(delivery.bonus);
  const partnerPrograms = moneyOrZero(delivery.stars)
    + moneyOrZero(delivery.bank_coinvestment)
    + moneyOrZero(delivery.pick_up_point_coinvestment);
  bucket.rowCount += 1;
  if (hasDelivery) {
    bucket.realizationRevenue += revenue;
    bucket.discountBonus += discountBonus;
    bucket.partnerPrograms += partnerPrograms;
    bucket.realizationSalesGross += revenue + discountBonus + partnerPrograms;
    if (!(revenue + discountBonus + partnerPrograms > 0)) {
      bucket.realizationSalesGross += moneyOrZero(row.seller_price_per_instance) * quantity;
    }
  }
  bucket.realizationReturnRevenue += moneyOrZero(returnCommission.amount);
  bucket.realizationReturnBonus += moneyOrZero(returnCommission.bonus);
}

function materializeOzonRealizationBucket(bucket = {}) {
  return {
    ...bucket,
    rowCount: Math.round(numberOrZero(bucket.rowCount)),
    realizationRevenue: roundMoney(bucket.realizationRevenue),
    discountBonus: roundMoney(bucket.discountBonus),
    partnerPrograms: roundMoney(bucket.partnerPrograms),
    realizationSalesGross: roundMoney(bucket.realizationSalesGross),
    realizationReturnRevenue: roundMoney(bucket.realizationReturnRevenue),
    realizationReturnBonus: roundMoney(bucket.realizationReturnBonus)
  };
}

function addOzonRealizationBucket(target, source = {}) {
  target.rowCount += numberOrZero(source.rowCount);
  for (const field of OZON_REALIZATION_FIELDS) {
    target[field] = numberOrZero(target[field]) + numberOrZero(source[field]);
  }
  return target;
}

async function fetchOzonFinanceRealizationByDay(options) {
  if (!options.ozonClientId || !options.ozonApiKey) {
    return { status: 'missing', daily: [], totals: emptyOzonRealizationBucket('total'), warnings: ['Ozon API credentials are not set'] };
  }
  const dates = enumerateDates(options.ozonFinanceApiFrom, options.ozonFinanceApiTo);
  const daily = [];
  const totals = emptyOzonRealizationBucket('total');
  const warnings = [];
  for (const date of dates) {
    const [year, month, day] = date.split('-').map((value) => Number(value));
    try {
      const payload = await ozonApiRequest(options, '/v1/finance/realization/by-day', { day, month, year });
      const bucket = emptyOzonRealizationBucket(date);
      for (const row of Array.isArray(payload.rows) ? payload.rows : []) {
        addOzonRealizationRow(bucket, row);
      }
      const materialized = materializeOzonRealizationBucket(bucket);
      daily.push(materialized);
      addOzonRealizationBucket(totals, materialized);
    } catch (error) {
      warnings.push(`Ozon realization ${date}: ${error?.message || String(error)}`);
    }
  }
  return {
    status: warnings.length && !daily.length ? 'error' : 'ok',
    endpoint: '/v1/finance/realization/by-day',
    daily,
    totals: materializeOzonRealizationBucket(totals),
    warnings
  };
}

function mergeOzonRealizationIntoFinance(summary, realization) {
  if (!realization || !Array.isArray(realization.daily) || !realization.daily.length) return summary;
  const next = deepClone(summary);
  const byDate = new Map(realization.daily.map((row) => [row.date, row]));
  const apply = (bucket = {}, source = {}) => materializeOzonFinanceBucket({
    ...bucket,
    realizationRevenue: roundMoney(source.realizationRevenue),
    discountBonus: roundMoney(source.discountBonus),
    partnerPrograms: roundMoney(source.partnerPrograms),
    realizationSalesGross: roundMoney(source.realizationSalesGross),
    realizationReturnRevenue: roundMoney(source.realizationReturnRevenue),
    realizationReturnBonus: roundMoney(source.realizationReturnBonus)
  });
  next.daily = (Array.isArray(next.daily) ? next.daily : []).map((row) => {
    const source = byDate.get(row.date);
    return source ? apply(row, source) : row;
  });
  const monthTotals = new Map();
  for (const row of realization.daily) {
    const month = monthKey(row.date);
    const bucket = monthTotals.get(month) || emptyOzonRealizationBucket(month);
    addOzonRealizationBucket(bucket, row);
    monthTotals.set(month, bucket);
  }
  next.months = (Array.isArray(next.months) ? next.months : []).map((row) => {
    const source = monthTotals.get(row.monthKey);
    return source ? apply(row, materializeOzonRealizationBucket(source)) : row;
  });
  next.totals = apply(next.totals || {}, realization.totals);
  next.source = {
    ...(next.source || {}),
    realizationEndpoint: realization.endpoint,
    realizationRows: numberOrZero(realization.totals?.rowCount)
  };
  next.diagnostics = {
    ...(next.diagnostics || {}),
    realizationWarnings: realization.warnings || []
  };
  return next;
}

async function buildOzonFinanceSummaryAuto(options) {
  const sourceMode = String(options.ozonFinanceSource || 'auto').toLowerCase();
  const withRealization = async (summary) => {
    if (summary?.source?.sourceMode !== 'api') return summary;
    const realization = await fetchOzonFinanceRealizationByDay(options);
    return mergeOzonRealizationIntoFinance(summary, realization);
  };
  if (sourceMode === 'file') return buildOzonFinanceSummary(options);
  try {
    const apiSummary = await buildOzonFinanceSummaryFromApi(options);
    if (apiSummary.status === 'ok' || sourceMode === 'api') return withRealization(apiSummary);
  } catch (error) {
    if (sourceMode === 'api') throw error;
    const fileSummary = buildOzonFinanceSummary(options);
    fileSummary.diagnostics = {
      ...(fileSummary.diagnostics || {}),
      warnings: [
        ...((fileSummary.diagnostics || {}).warnings || []),
        `Ozon API fallback to file: ${error?.message || String(error)}`
      ]
    };
    fileSummary.source = {
      ...(fileSummary.source || {}),
      sourceMode: 'file-fallback',
      apiError: error?.message || String(error)
    };
    return fileSummary;
  }
  return buildOzonFinanceSummary(options);
}

function findSheetRowsByName(workbookRows, pattern, fallbackIndex = 0) {
  const found = Object.entries(workbookRows).find(([name]) => pattern.test(String(name || '')));
  return found?.[1] || Object.values(workbookRows)[fallbackIndex] || [];
}

function readWorkbookSheets(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  return Object.fromEntries(workbook.SheetNames.map((sheetName) => [
    sheetName,
    XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true })
  ]));
}

function extractOzonPlanContractKpis(conditionRows) {
  const offerIndex = conditionRows.findIndex((row) => normalizeTextKey(row?.[0]) === 'offer');
  const header = offerIndex >= 0 ? conditionRows[offerIndex + 1] || [] : [];
  const values = offerIndex >= 0 ? conditionRows[offerIndex + 2] || [] : [];
  const rateByHeader = (headerName) => {
    const index = header.findIndex((cell) => normalizeTextKey(cell).replace(/\s+/g, '') === headerName);
    return index >= 0 ? rateOrNull(values[index]) : null;
  };
  const descriptionRows = conditionRows
    .map((row) => String(row?.[0] || '').trim())
    .filter((text) => /^\d+\./.test(text));
  return {
    gmvKpi: descriptionRows.find((text) => /gmv/i.test(text)) || 'GMV KPI',
    rkoKpi: descriptionRows.find((text) => /РКО|расч[её]тно/i.test(text)) || '',
    piKpi: descriptionRows.find((text) => /\bPI\b/i.test(text)) || '',
    adRevKpi: descriptionRows.find((text) => /adrev/i.test(text)) || 'AdRev KPI',
    adRevKpiRate: roundRate(rateByHeader('ar') || DEFAULT_OZON_PLAN_PCT),
    grossRate: roundRate(rateByHeader('gr')),
    commissionRate: roundRate(rateByHeader('tr')),
    sppRate: roundRate(rateByHeader('gp'))
  };
}

function buildOzonPlanDashboardSummary(options) {
  const planPath = options.ozonPlanPath || '';
  if (!planPath || !fs.existsSync(planPath)) {
    return {
      status: 'missing',
      source: { planPath, planFile: '' },
      monthlyTargets: {},
      contractKpis: {},
      accounts: [],
      daily: [],
      dailyAccounts: [],
      monthly: [],
      totals: { revenue: 0, gmv: 0, ads: 0, targetDrr: DEFAULT_OZON_PLAN_PCT, deltaToTargetSpend: 0 },
      allocation: {
        method: 'both_accounts_smart_share',
        scope: 'all_accounts',
        smartShare: DEFAULT_OZON_SMART_SHARE,
        totalAds: 0,
        smartAllocatedAds: 0,
        otherAllocatedAds: 0
      }
    };
  }
  const sheets = readWorkbookSheets(planPath);
  const conditionRows = findSheetRowsByName(sheets, /Условия|услов/i, 0);
  const dashboardRows = findSheetRowsByName(sheets, /Дашборд|dashboard/i, 1);
  const contractKpis = extractOzonPlanContractKpis(conditionRows);
  const monthlyTargets = {};
  for (let rowIndex = 0; rowIndex < conditionRows.length; rowIndex += 1) {
    const row = conditionRows[rowIndex] || [];
    if (normalizeTextKey(row[0]) !== 'gmv dr') continue;
    const header = conditionRows[rowIndex - 1] || [];
    for (let col = 1; col < row.length; col += 1) {
      const label = String(header[col] || '').trim();
      const match = label.match(/(?:plan|fact)\s+(\d{2})\/(\d{2})/i);
      if (!match) continue;
      monthlyTargets[`20${match[2]}-${match[1]}`] = roundMoney(row[col]);
    }
  }
  const sections = [
    { key: 'primary', label: 'Кабинет 1', start: 0 },
    { key: 'smart', label: 'Смарт', start: 22 }
  ];
  const accountMaps = new Map(sections.map((section) => [section.key, {
    key: section.key,
    label: section.label,
    rowCount: 0,
    revenue: 0,
    gmv: 0,
    ads: 0,
    deltaToTargetSpend: 0,
    cumulativeAds: 0,
    forecastDailyAds: 0,
    targetDrr: DEFAULT_OZON_PLAN_PCT
  }]));
  const dailyMap = new Map();
  for (const row of dashboardRows.slice(5)) {
    for (const section of sections) {
      const offset = section.start;
      const date = isoDate(row[offset]);
      if (!date) continue;
      const revenue = moneyOrZero(row[offset + 1]);
      const gmv = moneyOrZero(row[offset + 2]);
      const ads = moneyOrZero(row[offset + 11]);
      if (!revenue && !gmv && !ads) continue;
      const drr = moneyOrZero(row[offset + 12]);
      const targetDrr = moneyOrZero(row[offset + 13]) || DEFAULT_OZON_PLAN_PCT;
      const deltaToTargetSpend = moneyOrZero(row[offset + 14]);
      const cumulativeAds = moneyOrZero(row[offset + 15]);
      const forecastDailyAds = moneyOrZero(row[offset + 16]);
      const point = {
        date,
        monthKey: monthKey(date),
        accountKey: section.key,
        accountLabel: section.label,
        revenue: roundMoney(revenue),
        gmv: roundMoney(gmv),
        ads: roundMoney(ads),
        drr: drr || (revenue > 0 ? roundRate(ads / revenue) : null),
        targetDrr,
        deltaToTargetSpend: roundMoney(deltaToTargetSpend),
        cumulativeAds: roundMoney(cumulativeAds),
        forecastDailyAds: roundMoney(forecastDailyAds)
      };
      dailyMap.set(`${section.key}|${date}`, point);
      const account = accountMaps.get(section.key);
      account.rowCount += 1;
      account.revenue += revenue;
      account.gmv += gmv;
      account.ads += ads;
      account.deltaToTargetSpend += deltaToTargetSpend;
      account.cumulativeAds = cumulativeAds || account.cumulativeAds;
      account.forecastDailyAds = forecastDailyAds || account.forecastDailyAds;
      account.targetDrr = targetDrr;
    }
  }
  const dailyRows = [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date) || left.accountKey.localeCompare(right.accountKey));
  const dailyTotals = [...new Set(dailyRows.map((row) => row.date).filter(Boolean))].sort().map((date) => {
    const dateRows = dailyRows.filter((row) => row.date === date);
    const targetDrr = dateRows.map((row) => numberOrZero(row.targetDrr)).find((value) => value > 0) || DEFAULT_OZON_PLAN_PCT;
    const accountBreakdown = Object.fromEntries(dateRows.map((row) => {
      const revenue = numberOrZero(row.revenue);
      const gmv = numberOrZero(row.gmv);
      const ads = numberOrZero(row.ads);
      return [row.accountKey, {
        key: row.accountKey,
        label: row.accountLabel,
        revenue: roundMoney(revenue),
        gmv: roundMoney(gmv),
        ads: roundMoney(ads),
        drrRevenue: revenue > 0 ? roundRate(ads / revenue) : null,
        drrGmv: gmv > 0 ? roundRate(ads / gmv) : null,
        targetDrr: numberOrZero(row.targetDrr) || DEFAULT_OZON_PLAN_PCT,
        deltaToTargetSpend: roundMoney(row.deltaToTargetSpend),
        cumulativeAds: roundMoney(row.cumulativeAds),
        forecastDailyAds: roundMoney(row.forecastDailyAds)
      }];
    }));
    const totalsForDate = dateRows.reduce((sum, row) => {
      sum.revenue += numberOrZero(row.revenue);
      sum.gmv += numberOrZero(row.gmv);
      sum.ads += numberOrZero(row.ads);
      sum.deltaToTargetSpend += numberOrZero(row.deltaToTargetSpend);
      sum.cumulativeAds += numberOrZero(row.cumulativeAds);
      sum.forecastDailyAds += numberOrZero(row.forecastDailyAds);
      return sum;
    }, { revenue: 0, gmv: 0, ads: 0, targetDrr, deltaToTargetSpend: 0, cumulativeAds: 0, forecastDailyAds: 0 });
    return {
      date,
      monthKey: monthKey(date),
      rowCount: dateRows.length,
      revenue: roundMoney(totalsForDate.revenue),
      gmv: roundMoney(totalsForDate.gmv),
      ads: roundMoney(totalsForDate.ads),
      drrRevenue: totalsForDate.revenue > 0 ? roundRate(totalsForDate.ads / totalsForDate.revenue) : null,
      drrGmv: totalsForDate.gmv > 0 ? roundRate(totalsForDate.ads / totalsForDate.gmv) : null,
      targetDrr,
      deltaToTargetSpend: roundMoney(totalsForDate.deltaToTargetSpend),
      cumulativeAds: roundMoney(totalsForDate.cumulativeAds),
      forecastDailyAds: roundMoney(totalsForDate.forecastDailyAds),
      accountBreakdown
    };
  });
  const accounts = [...accountMaps.values()].map((account) => ({
    ...account,
    revenue: roundMoney(account.revenue),
    gmv: roundMoney(account.gmv),
    ads: roundMoney(account.ads),
    deltaToTargetSpend: roundMoney(account.deltaToTargetSpend),
    cumulativeAds: roundMoney(account.cumulativeAds),
    forecastDailyAds: roundMoney(account.forecastDailyAds),
    drrRevenue: account.revenue > 0 ? roundRate(account.ads / account.revenue) : null,
    drrGmv: account.gmv > 0 ? roundRate(account.ads / account.gmv) : null
  }));
  const totals = accounts.reduce((sum, account) => {
    sum.revenue += numberOrZero(account.revenue);
    sum.gmv += numberOrZero(account.gmv);
    sum.ads += numberOrZero(account.ads);
    sum.deltaToTargetSpend += numberOrZero(account.deltaToTargetSpend);
    return sum;
  }, { revenue: 0, gmv: 0, ads: 0, targetDrr: accounts[0]?.targetDrr || DEFAULT_OZON_PLAN_PCT, deltaToTargetSpend: 0 });
  totals.revenue = roundMoney(totals.revenue);
  totals.gmv = roundMoney(totals.gmv);
  totals.ads = roundMoney(totals.ads);
  totals.deltaToTargetSpend = roundMoney(totals.deltaToTargetSpend);
  totals.drrRevenue = totals.revenue > 0 ? roundRate(totals.ads / totals.revenue) : null;
  totals.drrGmv = totals.gmv > 0 ? roundRate(totals.ads / totals.gmv) : null;
  const smartShare = numberOrZero(options.ozonSmartShare) > 0 ? numberOrZero(options.ozonSmartShare) : DEFAULT_OZON_SMART_SHARE;
  const buildAllocation = (sourceTotals) => ({
    method: 'both_accounts_smart_share',
    scope: 'all_accounts',
    smartShare: roundRate(smartShare),
    totalAds: roundMoney(sourceTotals.ads),
    smartAllocatedAds: roundMoney(sourceTotals.ads * smartShare),
    otherAllocatedAds: roundMoney(sourceTotals.ads * (1 - smartShare)),
    totalRevenue: roundMoney(sourceTotals.revenue),
    smartAllocatedRevenue: roundMoney(sourceTotals.revenue * smartShare),
    otherAllocatedRevenue: roundMoney(sourceTotals.revenue * (1 - smartShare)),
    totalGmv: roundMoney(sourceTotals.gmv),
    smartAllocatedGmv: roundMoney(sourceTotals.gmv * smartShare),
    otherAllocatedGmv: roundMoney(sourceTotals.gmv * (1 - smartShare))
  });
  const allocation = buildAllocation(totals);
  const monthly = [...new Set(dailyRows.map((row) => row.monthKey).filter(Boolean))].sort().map((month) => {
    const monthRows = dailyRows.filter((row) => row.monthKey === month);
    const monthAccounts = sections.map((section) => {
      const accountRows = monthRows.filter((row) => row.accountKey === section.key);
      const account = accountRows.reduce((sum, row) => {
        sum.rowCount += 1;
        sum.revenue += numberOrZero(row.revenue);
        sum.gmv += numberOrZero(row.gmv);
        sum.ads += numberOrZero(row.ads);
        sum.deltaToTargetSpend += numberOrZero(row.deltaToTargetSpend);
        sum.cumulativeAds = numberOrZero(row.cumulativeAds) || sum.cumulativeAds;
        sum.forecastDailyAds = numberOrZero(row.forecastDailyAds) || sum.forecastDailyAds;
        sum.targetDrr = numberOrZero(row.targetDrr) || sum.targetDrr || DEFAULT_OZON_PLAN_PCT;
        return sum;
      }, { key: section.key, label: section.label, rowCount: 0, revenue: 0, gmv: 0, ads: 0, deltaToTargetSpend: 0, cumulativeAds: 0, forecastDailyAds: 0, targetDrr: DEFAULT_OZON_PLAN_PCT });
      return {
        ...account,
        revenue: roundMoney(account.revenue),
        gmv: roundMoney(account.gmv),
        ads: roundMoney(account.ads),
        deltaToTargetSpend: roundMoney(account.deltaToTargetSpend),
        cumulativeAds: roundMoney(account.cumulativeAds),
        forecastDailyAds: roundMoney(account.forecastDailyAds),
        drrRevenue: account.revenue > 0 ? roundRate(account.ads / account.revenue) : null,
        drrGmv: account.gmv > 0 ? roundRate(account.ads / account.gmv) : null
      };
    });
    const monthTotals = monthAccounts.reduce((sum, account) => {
      sum.revenue += numberOrZero(account.revenue);
      sum.gmv += numberOrZero(account.gmv);
      sum.ads += numberOrZero(account.ads);
      sum.deltaToTargetSpend += numberOrZero(account.deltaToTargetSpend);
      sum.cumulativeAds += numberOrZero(account.cumulativeAds);
      sum.forecastDailyAds += numberOrZero(account.forecastDailyAds);
      return sum;
    }, { revenue: 0, gmv: 0, ads: 0, targetDrr: monthAccounts[0]?.targetDrr || DEFAULT_OZON_PLAN_PCT, deltaToTargetSpend: 0, cumulativeAds: 0, forecastDailyAds: 0 });
    monthTotals.revenue = roundMoney(monthTotals.revenue);
    monthTotals.gmv = roundMoney(monthTotals.gmv);
    monthTotals.ads = roundMoney(monthTotals.ads);
    monthTotals.deltaToTargetSpend = roundMoney(monthTotals.deltaToTargetSpend);
    monthTotals.cumulativeAds = roundMoney(monthTotals.cumulativeAds);
    monthTotals.forecastDailyAds = roundMoney(monthTotals.forecastDailyAds);
    monthTotals.drrRevenue = monthTotals.revenue > 0 ? roundRate(monthTotals.ads / monthTotals.revenue) : null;
    monthTotals.drrGmv = monthTotals.gmv > 0 ? roundRate(monthTotals.ads / monthTotals.gmv) : null;
    return {
      monthKey: month,
      monthlyTargetGmv: roundMoney(monthlyTargets[month]),
      totals: monthTotals,
      allocation: buildAllocation(monthTotals)
    };
  });
  return {
    status: 'ok',
    source: { planPath, planFile: path.basename(planPath) },
    monthlyTargets,
    contractKpis,
    accounts,
    daily: dailyTotals,
    dailyAccounts: dailyRows,
    monthly,
    totals,
    allocation
  };
}

function readQuarterReportRows(filePath, from, to) {
  const rows = readWorkbookRows(filePath);
  const selected = [];
  for (const row of rows.slice(1)) {
    const date = dateFromCell(row?.[2]);
    if (!date || date < from || date > to) continue;
    const ordersRevenueWb = roundMoney(row?.[3]);
    const revenueWb = roundMoney(row?.[6]);
    if (ordersRevenueWb <= 0 && revenueWb <= 0) continue;
    selected.push({
      date,
      ordersRevenueWb,
      revenueWb
    });
  }
  return selected;
}

function readQuarterDrrRows(filePath, from, to, yearHint) {
  const rows = readWorkbookRows(filePath);
  const selected = [];
  for (const row of rows.slice(1)) {
    const date = dateFromCell(row?.[0], yearHint);
    if (!date || date < from || date > to) continue;
    const spendFact = roundMoney(row?.[3]);
    if (spendFact <= 0) continue;
    selected.push({
      date,
      spendFact
    });
  }
  return selected;
}

function mergeQuarterRows(reportRows, drrRows, dailyRows, from, to) {
  const rows = new Map();
  const merge = (row, fields = []) => {
    if (!row?.date || row.date < from || row.date > to) return;
    const current = rows.get(row.date) || { date: row.date };
    for (const field of fields) {
      if (row[field] !== undefined && row[field] !== null) {
        current[field] = numberOrZero(row[field]);
      }
    }
    rows.set(row.date, current);
  };
  for (const row of reportRows || []) {
    merge(row, ['ordersRevenueWb', 'revenueWb']);
  }
  for (const row of drrRows || []) {
    merge(row, ['spendFact']);
  }
  for (const row of dailyRows || []) {
    merge(row, ['ordersRevenueWb', 'revenueWb', 'spendFact', 'planSpendWb']);
  }
  return [...rows.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function buildQuarterSummary(dailyRows, asOfDate) {
  const from = WB_CONTRACT.salesPeriodStart;
  const to = asOfDate || dailyRows[dailyRows.length - 1]?.date || '';
  if (!from || !to || from > to) {
    return {
      status: 'empty',
      from,
      to,
      label: '',
      days: 0,
      targetRevenueWb: 0,
      revenueWb: 0,
      ordersRevenueWb: 0,
      planPct: roundRate(WB_CONTRACT.marketingRate),
      planSpendWb: 0,
      spendFact: 0,
      factPct: null,
      ordersAdPct: null,
      revenueDelta: 0,
      spendDelta: 0
    };
  }
  const reportPath = findExistingPath(QUARTER_REPORT_CANDIDATES);
  const drrPath = findExistingPath(QUARTER_DRR_CANDIDATES);
  const yearHint = Number(String(to).slice(0, 4)) || new Date().getFullYear();
  const reportRows = reportPath ? readQuarterReportRows(reportPath, from, to) : [];
  const drrRows = drrPath ? readQuarterDrrRows(drrPath, from, minDate(to, `${String(yearHint)}-04-30`), String(yearHint)) : [];
  const mergedRows = mergeQuarterRows(reportRows, drrRows, dailyRows, from, to);
  const revenueWb = roundMoney(sumRows(mergedRows, 'revenueWb'));
  const ordersRevenueWb = roundMoney(sumRows(mergedRows, 'ordersRevenueWb'));
  const spendFact = roundMoney(sumRows(mergedRows, 'spendFact'));
  const targetRevenueWb = roundMoney(contractTargetRevenueWbForRange(from, to));
  const controlPlanSpendWb = roundMoney(sumRows(mergedRows, 'planSpendWb'));
  const planSpendWb = controlPlanSpendWb || roundMoney(revenueWb * numberOrZero(WB_CONTRACT.marketingRate));
  const planPct = revenueWb > 0 && planSpendWb > 0
    ? roundRate(planSpendWb / revenueWb)
    : roundRate(WB_CONTRACT.marketingRate);
  const revenueDelta = roundMoney(revenueWb - targetRevenueWb);
  const spendDelta = roundMoney(spendFact - planSpendWb);
  const sourceParts = [];
  if (reportPath) sourceParts.push(path.basename(reportPath));
  if (drrPath) sourceParts.push(path.basename(drrPath));
  sourceParts.push('iu_drr_summary.json');
  return {
    status: reportPath && drrPath ? 'ok' : 'partial',
    from,
    to,
    label: `${String(from).slice(8, 10)}.${String(from).slice(5, 7)}–${String(to).slice(8, 10)}.${String(to).slice(5, 7)}`,
    days: mergedRows.length,
    targetRevenueWb,
    revenueWb,
    ordersRevenueWb,
    revenueDelta,
    revenueDeltaPct: targetRevenueWb > 0 ? roundRate(revenueDelta / targetRevenueWb) : null,
    revenueCompletionPct: targetRevenueWb > 0 ? roundRate(revenueWb / targetRevenueWb) : null,
    planPct,
    planSpendWb,
    spendFact,
    factPct: revenueWb > 0 ? roundRate(spendFact / revenueWb) : null,
    ordersAdPct: ordersRevenueWb > 0 ? roundRate(spendFact / ordersRevenueWb) : null,
    spendDelta,
    spendDeltaPct: planSpendWb > 0 ? roundRate(spendDelta / planSpendWb) : null,
    source: {
      reportPath: reportPath || '',
      drrPath: drrPath || '',
      reportRows: reportRows.length,
      drrRows: drrRows.length,
      mergedRows: mergedRows.length
    },
    sourceLabel: sourceParts.join(' + '),
    sourceWarnings: [
      ...(!reportPath ? ['report workbook not found'] : []),
      ...(!drrPath ? ['WB DRR workbook not found'] : [])
    ]
  };
}

function resolveOptions(args) {
  const inputDir = path.resolve(args['input-dir'] || path.join(process.cwd(), 'data'));
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(process.cwd(), 'data'));
  const outputDir = args['output-dir'] ? path.resolve(args['output-dir']) : '';
  const mirrorDataDir = path.resolve(args['mirror-data-dir'] || process.env.ALTEA_PORTAL_FALLBACK_DIR || baseDataDir);
  const apiTo = isoDate(args['ozon-finance-api-to'] || args.to || args['date-to']) || todayDateKey();
  const apiFrom = isoDate(args['ozon-finance-api-from'] || args.from || args['date-from']) || `${apiTo.slice(0, 7)}-01`;
  const ozonFinancePath = args['ozon-finance-file']
    ? path.resolve(args['ozon-finance-file'])
    : findNewestDownloadFile((name) => /^Отчет по товарам за период .*\.xlsx$/i.test(name));
  const ozonProductsPath = args['ozon-products-file']
    ? path.resolve(args['ozon-products-file'])
    : findNewestDownloadFile((name) => /^products.*\.csv$/i.test(name));
  const ozonPlanPath = args['ozon-plan-file']
    ? path.resolve(args['ozon-plan-file'])
    : findNewestFileInDirs(
      [DOWNLOADS_ROOT, path.join(DOWNLOADS_ROOT, 'Telegram Desktop')],
      (name) => /^Дашборд.*ИУ.*Оз.*\.xlsx$/i.test(name)
    );
  const wbAdsChannelOverridesPath = path.resolve(
    args['wb-ads-channel-overrides']
    || args['channel-overrides']
    || args['channel-overrides-json']
    || process.env.ALTEA_WB_ADS_CHANNEL_OVERRIDES
    || path.join(baseDataDir, 'wb_ads_channel_overrides.json')
  );
  const wbAdsChannelOverrides = readWbAdsChannelOverrides(wbAdsChannelOverridesPath);
  return {
    dryRun: Boolean(args.dryRun),
    inputDir,
    baseDataDir,
    outputDir,
    mirrorDataDir,
    mirrorLocalFallback: Boolean(args.mirrorLocalFallback),
    from: isoDate(args.from || args['date-from']),
    to: isoDate(args.to || args['date-to']),
    ozonFinancePath,
    ozonProductsPath,
    ozonPlanPath,
    ozonFinanceControlTotal: moneyOrZero(args['ozon-finance-control-total'] || process.env.ALTEA_OZON_FINANCE_CONTROL_TOTAL),
    ozonSmartShare: roundRate(args['ozon-smart-share'] || process.env.ALTEA_OZON_SMART_SHARE || DEFAULT_OZON_SMART_SHARE),
    ozonFinanceSource: String(args['ozon-finance-source'] || process.env.ALTEA_OZON_FINANCE_SOURCE || 'auto').trim().toLowerCase(),
    ozonClientId: String(args['ozon-client-id'] || process.env.ALTEA_OZON_CLIENT_ID || '').trim(),
    ozonApiKey: String(args['ozon-api-key'] || process.env.ALTEA_OZON_API_KEY || '').trim(),
    ozonApiBaseUrl: String(args['ozon-api-base-url'] || process.env.ALTEA_OZON_API_BASE_URL || OZON_API_BASE_URL).replace(/\/+$/, ''),
    ozonFinanceApiFrom: apiFrom,
    ozonFinanceApiTo: apiTo,
    ozonFinanceApiPageSize: Math.max(1, Math.min(1000, Math.trunc(numberOrZero(args['ozon-finance-api-page-size'] || OZON_FINANCE_TRANSACTION_PAGE_SIZE)))),
    wbAdsChannelOverridesPath,
    wbAdsChannelOverrides: wbAdsChannelOverrides.map,
    wbAdsChannelOverridesDiagnostics: wbAdsChannelOverrides.diagnostics
  };
}

function readLayer(options, fileName, fallback) {
  return readJson(path.join(options.inputDir, fileName), readJson(path.join(options.baseDataDir, fileName), fallback));
}

function normalizePlatformKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'wildberries' || raw === 'вб') return 'wb';
  if (raw === 'ym' || raw === 'yandex') return 'ya';
  return raw || 'all';
}

function normalizeChannelOverrideLabel(value) {
  const raw = String(value || '').trim();
  const normalized = normalizeTextKey(raw);
  const compact = normalized.replace(/[\s_-]+/g, '');
  if (!raw) return '';
  if (compact === 'wbmedia' || compact === 'media' || /медиа|media/.test(normalized)) return CHANNEL_LABEL_BY_KEY.wbMedia;
  if (compact === 'wbinfluencer' || /инфлю|influ/.test(normalized)) return CHANNEL_LABEL_BY_KEY.wbInfluencer;
  if (compact === 'pvz' || /пвз|pvz/.test(normalized)) return CHANNEL_LABEL_BY_KEY.pvzAds;
  if (/брендзон|brand/.test(normalized)) return CHANNEL_LABEL_BY_KEY.brandZone;
  if (/обзор/.test(normalized)) return CHANNEL_LABEL_BY_KEY.overviews;
  if (compact === 'reviewpoints' || /отзыв|review/.test(normalized)) return CHANNEL_LABEL_BY_KEY.reviewPoints;
  if (/внеш|external/.test(normalized)) return CHANNEL_LABEL_BY_KEY.externalAds;
  if (compact === 'wbpromotion' || compact === 'promotion' || /продвиж/.test(normalized)) return CHANNEL_LABEL_BY_KEY.wbPromotion;
  return raw;
}

function readWbAdsChannelOverrides(filePath) {
  const diagnostics = {
    path: filePath || '',
    exists: false,
    campaigns: 0,
    invalidRows: 0
  };
  const map = new Map();
  const raw = readJson(filePath, null);
  if (!raw) return { map, diagnostics };
  diagnostics.exists = true;

  const addEntry = (key, value) => {
    const entry = value && typeof value === 'object' && !Array.isArray(value) ? value : { channel: value };
    const campaignId = normalizeCampaignId(entry.campaignId || entry.advertId || entry.id || key);
    const channel = normalizeChannelOverrideLabel(entry.channel || entry.label || entry.type || entry.article);
    if (!campaignId || !channel) {
      diagnostics.invalidRows += 1;
      return;
    }
    map.set(campaignId, {
      campaignId,
      channel,
      channelKey: channelKey(channel),
      reason: String(entry.reason || entry.note || '').trim()
    });
  };

  if (Array.isArray(raw)) {
    raw.forEach((entry, index) => addEntry(index, entry));
  } else if (raw && typeof raw === 'object') {
    if (raw.campaigns) Object.entries(raw.campaigns).forEach(([key, value]) => addEntry(key, value));
    if (raw.overrides) Object.entries(raw.overrides).forEach(([key, value]) => addEntry(key, value));
    if (!raw.campaigns && !raw.overrides) {
      const metaKeys = new Set(['generatedAt', 'source', 'note', 'version']);
      Object.entries(raw)
        .filter(([key]) => !metaKeys.has(key))
        .forEach(([key, value]) => addEntry(key, value));
    }
  }

  diagnostics.campaigns = map.size;
  return { map, diagnostics };
}

function buildPlatformDateMap(platformTrends, platformKey) {
  const record = (platformTrends?.platforms || []).find((platform) => normalizePlatformKey(platform?.key || platform?.label) === platformKey);
  const map = new Map();
  for (const point of record?.series || []) {
    const date = isoDate(point?.date || point?.label);
    if (!date) continue;
    const sellerSummary = point?.wbSellerSummary && typeof point.wbSellerSummary === 'object'
      ? point.wbSellerSummary
      : {};
    const wbFinanceTurnover = platformKey === 'wb'
      ? numberOrZero(
        point?.wbSellerSummaryFinanceTurnover
        || point?.financeTurnover
        || sellerSummary.financeTurnover
        || sellerSummary.salesRevenue
      )
      : 0;
    const wbFinancialResult = platformKey === 'wb'
      ? numberOrZero(
        point?.wbSellerSummaryPayForGoods
        || point?.financialResult
        || sellerSummary.financialResult
        || sellerSummary.payForGoods
      )
      : 0;
    const wbOrdersRevenue = platformKey === 'wb'
      ? numberOrZero(
        point?.wbSellerSummaryReferenceRevenue
        || sellerSummary.ordersRevenue
        || point?.revenue
      )
      : numberOrZero(point.ordersRevenue ?? point.revenue);
    const ordersUnits = numberOrZero(point.ordersUnits ?? point.units);
    const deliveredUnits = numberOrZero(point.deliveredUnits);
    map.set(date, {
      units: numberOrZero(point.units),
      ordersUnits,
      deliveredUnits,
      ordersRevenue: wbOrdersRevenue,
      revenue: wbFinanceTurnover > 0 ? wbFinanceTurnover : numberOrZero(point.revenue),
      deliveredRevenue: numberOrZero(point.deliveredRevenue ?? point.revenue),
      adsImpressions: numberOrZero(point.adsImpressions ?? point.views),
      adsClicks: numberOrZero(point.adsClicks ?? point.clicks),
      addToCart: numberOrZero(point.addToCart ?? point.toCart),
      cancellationsUnits: numberOrZero(point.cancellationsUnits),
      returnsUnits: numberOrZero(point.returnsUnits),
      sourceRows: numberOrZero(point.sourceRows || point.rows),
      margin: wbFinancialResult > 0 ? wbFinancialResult : numberOrZero(point.estimatedMargin || point.margin),
      deduction: numberOrZero(point?.deduction || sellerSummary.deduction),
      wbPromotionDeduction: numberOrZero(point?.wbPromotionDeduction || sellerSummary.wbPromotionDeduction),
      reviewDeduction: numberOrZero(point?.reviewDeduction || sellerSummary.reviewDeduction),
      wbMediaDeduction: numberOrZero(point?.wbMediaDeduction || sellerSummary.wbMediaDeduction),
      cashbackAmount: numberOrZero(point?.cashbackAmount || sellerSummary.cashbackAmount),
      cashbackDiscount: numberOrZero(point?.cashbackDiscount || sellerSummary.cashbackDiscount),
      cashbackCommissionChange: numberOrZero(point?.cashbackCommissionChange || sellerSummary.cashbackCommissionChange),
      source: wbFinanceTurnover > 0 ? 'wb-seller-summary-finance-turnover' : 'platform-trends-orders'
    });
  }
  return map;
}

function channelKey(channel) {
  const raw = normalizeTextKey(channel);
  const compact = raw.replace(/[\s_-]+/g, '');
  if (compact === 'wbmedia' || compact === 'media' || /медиа|media/.test(raw)) return 'wbMedia';
  if (compact === 'wbinfluencer' || /инфлю|influ/.test(raw)) return 'wbInfluencer';
  if (compact === 'pvz' || /пвз|pvz/.test(raw)) return 'pvzAds';
  if (/брендзон|brand/.test(raw)) return 'brandZone';
  if (/обзор/.test(raw)) return 'overviews';
  if (compact === 'reviewpoints' || /отзыв|review/.test(raw)) return 'reviewPoints';
  if (/внеш|external/.test(raw)) return 'externalAds';
  return 'wbPromotion';
}

function emptyAdsBucket() {
  return { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0, rows: 0 };
}

function addAdsBucket(map, date, row) {
  const current = map.get(date) || emptyAdsBucket();
  current.spend += numberOrZero(row.spend);
  current.views += numberOrZero(row.views);
  current.clicks += numberOrZero(row.clicks);
  current.orders += numberOrZero(row.orders);
  current.revenue += numberOrZero(row.revenue);
  current.rows += 1;
  map.set(date, current);
  return current;
}

function resolveAdsRowChannel(row, channelOverrides, diagnostics) {
  const fallback = row?.channel || '';
  const campaignId = normalizeCampaignId(row?.campaignId || row?.advertId || row?.id);
  const override = campaignId && channelOverrides instanceof Map ? channelOverrides.get(campaignId) : null;
  if (!override?.channel) return fallback;
  diagnostics.channelOverridesAppliedRows += 1;
  diagnostics.channelOverridesAppliedSpend = roundMoney(diagnostics.channelOverridesAppliedSpend + numberOrZero(row?.spend));
  diagnostics.channelOverridesAppliedCampaigns.add(campaignId);
  return override.channel;
}

function mergePlatformAdsSeries(adsSummary, platformKey, targetMap, onSpendGap) {
  const platform = (adsSummary?.platforms || []).find((item) =>
    normalizePlatformKey(item?.key || item?.platformKey || item?.label) === platformKey
  );
  for (const point of platform?.series || []) {
    const date = isoDate(point.date || point.label);
    if (!date) continue;
    const platformSpend = numberOrZero(point.spend);
    const current = targetMap.get(date) || emptyAdsBucket();
    if (platformSpend > current.spend + 1) {
      const gap = platformSpend - current.spend;
      current.spend += gap;
      if (typeof onSpendGap === 'function') onSpendGap(date, gap);
    }
    current.views = Math.max(current.views, numberOrZero(point.views));
    current.clicks = Math.max(current.clicks, numberOrZero(point.clicks));
    current.orders = Math.max(current.orders, numberOrZero(point.orders));
    current.revenue = Math.max(current.revenue, numberOrZero(point.revenue));
    current.rows = Math.max(current.rows, numberOrZero(point.sourceRows || point.rows));
    targetMap.set(date, current);
  }
}

function buildAdsDailyMaps(adsSummary, channelOverrides = new Map()) {
  const byDate = new Map();
  const byDateChannel = new Map();
  const ozonByDate = new Map();
  const diagnostics = {
    channelOverridesLoaded: channelOverrides instanceof Map ? channelOverrides.size : 0,
    channelOverridesAppliedRows: 0,
    channelOverridesAppliedSpend: 0,
    channelOverridesAppliedCampaigns: new Set()
  };
  for (const row of adsSummary?.itemSeries || []) {
    const platformKey = normalizePlatformKey(row?.platformKey || row?.platform || row?.marketplace || row?.data_source);
    if (!['wb', 'ozon'].includes(platformKey)) continue;
    const date = isoDate(row.date || row.day || row.label);
    if (!date) continue;
    if (platformKey === 'ozon') continue;
    const targetMap = platformKey === 'ozon' ? ozonByDate : byDate;
    addAdsBucket(targetMap, date, row);

    const resolvedChannel = resolveAdsRowChannel(row, channelOverrides, diagnostics);
    const key = `${date}|${channelKey(resolvedChannel)}`;
    const channelCurrent = byDateChannel.get(key) || 0;
    byDateChannel.set(key, channelCurrent + numberOrZero(row.spend));
  }

  mergePlatformAdsSeries(adsSummary, 'wb', byDate, (date, gap) => {
    const key = `${date}|wbPromotion`;
    byDateChannel.set(key, (byDateChannel.get(key) || 0) + gap);
  });
  mergePlatformAdsSeries(adsSummary, 'ozon', ozonByDate);

  return {
    byDate,
    byDateChannel,
    ozonByDate,
    diagnostics: {
      ...diagnostics,
      channelOverridesAppliedCampaigns: [...diagnostics.channelOverridesAppliedCampaigns].sort()
    }
  };
}

function buildReviewPointsMap(wbFeedbacksSummary) {
  const map = new Map();
  for (const row of wbFeedbacksSummary?.reviewsForPoints?.daily || []) {
    const date = isoDate(row.date);
    if (!date) continue;
    const current = map.get(date) || { spend: 0, feedbacks: 0 };
    current.spend += numberOrZero(row.spend ?? row.points);
    current.feedbacks += numberOrZero(row.feedbacks);
    map.set(date, current);
  }
  return map;
}

function planPctForMonth(iuPlan, month) {
  return numberOrZero(WB_CONTRACT.marketingRate) || DEFAULT_PLAN_PCT;
}

function ozonPlanPctForMonth(iuPlan, month) {
  const source = iuPlan?.months?.[month] || {};
  const pct = numberOrZero(source.iuAdsOzon) > 0 && numberOrZero(source.iuRevenueOzon) > 0
    ? numberOrZero(source.iuAdsOzon) / numberOrZero(source.iuRevenueOzon)
    : numberOrZero(iuPlan?.assumptions?.ozonIuAdsRate) || DEFAULT_OZON_PLAN_PCT;
  return Number.isFinite(pct) && pct > 0 ? pct : DEFAULT_OZON_PLAN_PCT;
}

function monthPlan(iuPlan, month, companyPlan) {
  const source = iuPlan?.months?.[month] || {};
  const days = numberOrZero(source.days) || new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const iuRevenueWbMin = numberOrZero(source.iuRevenueWb);
  const corporateRevenueWb = companyWbRevenuePlan(companyPlan, month);
  const iuRevenueWb = Math.max(iuRevenueWbMin, corporateRevenueWb);
  const contractRevenueOzon = numberOrZero(source.iuRevenueOzon);
  const corporateRevenueOzon = companyOzonRevenuePlan(companyPlan, month);
  const iuRevenueOzon = Math.max(contractRevenueOzon, corporateRevenueOzon);
  const corporateRevenueYandex = companyYandexRevenuePlan(companyPlan, month);
  const iuRevenueYandex = corporateRevenueYandex;
  const iuAdsWb = numberOrZero(source.iuAdsWb);
  const iuAdsOzon = Math.max(numberOrZero(source.iuAdsOzon), iuRevenueOzon * ozonPlanPctForMonth(iuPlan, month));
  const dailyIuRevenueWb = days > 0 ? iuRevenueWb / days : 0;
  const dailyIuRevenueOzon = days > 0 ? iuRevenueOzon / days : 0;
  const dailyIuRevenueYandex = days > 0 ? iuRevenueYandex / days : 0;
  const dailyIuAdsWb = numberOrZero(source.dailyIuAdsWb) || (days > 0 ? iuAdsWb / days : 0);
  const dailyIuAdsOzon = days > 0 ? iuAdsOzon / days : 0;
  return {
    label: source.label || month,
    days,
    iuRevenueWb,
    iuRevenueWbIuMin: iuRevenueWbMin,
    iuRevenueWbCorporatePlan: corporateRevenueWb,
    iuRevenueWbPlanSource: corporateRevenueWb > iuRevenueWbMin ? 'corporate_plan' : 'iu_contract',
    iuRevenueOzon,
    iuRevenueOzonContractMin: contractRevenueOzon,
    iuRevenueOzonCorporatePlan: corporateRevenueOzon,
    iuRevenueOzonPlanSource: corporateRevenueOzon > contractRevenueOzon ? 'corporate_plan' : 'iu_contract_40pct',
    iuRevenueYandex,
    iuRevenueYandexCorporatePlan: corporateRevenueYandex,
    iuRevenueYandexPlanSource: corporateRevenueYandex > 0 ? 'corporate_plan' : '',
    iuRevenueTotal: iuRevenueWb + iuRevenueOzon + iuRevenueYandex,
    iuAdsWb,
    iuAdsOzon,
    iuAdsTotal: iuAdsWb + iuAdsOzon,
    dailyIuRevenueWb,
    dailyIuRevenueOzon,
    dailyIuRevenueYandex,
    dailyIuRevenueTotal: dailyIuRevenueWb + dailyIuRevenueOzon + dailyIuRevenueYandex,
    dailyIuAdsWb,
    dailyIuAdsOzon,
    dailyIuAdsTotal: dailyIuAdsWb + dailyIuAdsOzon
  };
}

function buildWbDailyPlanMap(iuPlan) {
  const map = new Map();
  for (const row of iuPlan?.wbDailyPlan?.daily || []) {
    const date = isoDate(row?.date);
    if (!date) continue;
    map.set(date, {
      date,
      gmvPlanGross: moneyOrZero(row.gmvPlanGross),
      adsPlanGross: moneyOrZero(row.adsPlanGross),
      targetRevenue: moneyOrZero(row.gmvPlanOur),
      planSpend: moneyOrZero(row.adsPlanOur),
      factRevenue: moneyOrZero(row.revenueFactOur ?? row.revenueFactGross),
      factSpend: moneyOrZero(row.adsFactOur ?? row.adsFactGross),
      factRevenueGross: moneyOrZero(row.revenueFactGross),
      factSpendGross: moneyOrZero(row.adsFactGross),
      share: roundRate(row.share || iuPlan?.wbDailyPlan?.share || iuPlan?.assumptions?.wbIuOurShare || 0.4),
      source: iuPlan?.wbDailyPlan?.sourceWorkbook || ''
    });
  }
  return map;
}

function wbDailyPlanRange(iuPlan) {
  const dates = (Array.isArray(iuPlan?.wbDailyPlan?.daily) ? iuPlan.wbDailyPlan.daily : [])
    .map((row) => isoDate(row?.date))
    .filter(Boolean)
    .sort();
  return {
    from: dates[0] || '',
    to: dates[dates.length - 1] || '',
    days: dates.length,
    source: iuPlan?.wbDailyPlan?.sourceWorkbook || ''
  };
}

function dateRange(platformTrends, adsSummary, explicitFrom, explicitTo, iuPlan) {
  const wbWorkbookRange = wbDailyPlanRange(iuPlan);
  const dates = [];
  for (const platform of platformTrends?.platforms || []) {
    for (const point of platform?.series || []) {
      const date = isoDate(point.date || point.label);
      if (date) dates.push(date);
    }
  }
  for (const row of adsSummary?.itemSeries || []) {
    const date = isoDate(row.date || row.day || row.label);
    if (date) dates.push(date);
  }
  const platformLatestDate = (key) => (
    (platformTrends?.platforms || [])
      .find((platform) => String(platform?.key || '').trim().toLowerCase() === key)
      ?.series
      ?.map((point) => isoDate(point.date || point.label))
      ?.filter(Boolean) || []
  ).sort().pop() || '';
  const wbLatestDate = platformLatestDate('wb');
  const ozonLatestDate = platformLatestDate('ozon');
  const latestCompleteMarketplaceDate = wbLatestDate && ozonLatestDate
    ? (wbLatestDate < ozonLatestDate ? wbLatestDate : ozonLatestDate)
    : '';
  const sorted = dates.sort();
  const adsWindowTo = isoDate(adsSummary?.window?.to || adsSummary?.asOfDate);
  const latestReliableTo = [latestCompleteMarketplaceDate, adsWindowTo]
    .filter(Boolean)
    .sort()[0] || '';
  const to = explicitTo || latestReliableTo || wbWorkbookRange.to || sorted[sorted.length - 1] || isoDate(platformTrends?.latestMarketplaceDate) || isoDate(adsSummary?.asOfDate) || new Date().toISOString().slice(0, 10);
  const from = explicitFrom || `${to.slice(0, 7)}-01`;
  const extendsBeyondControl = Boolean(wbWorkbookRange.to && latestReliableTo && latestReliableTo > wbWorkbookRange.to);
  return {
    from,
    to,
    source: wbWorkbookRange.from && wbWorkbookRange.to
      ? (extendsBeyondControl ? 'api_window_with_wb_iu_control_calibration' : 'wb_iu_control_bounded_api_window')
      : 'api_window',
    sourceWorkbook: wbWorkbookRange.source,
    sourceDays: wbWorkbookRange.days,
    controlFrom: wbWorkbookRange.from,
    controlTo: wbWorkbookRange.to,
    requestedFrom: explicitFrom || '',
    requestedTo: explicitTo || ''
  };
}

function wbRawRevenueForIu(wb) {
  return numberOrZero(wb?.revenue) || numberOrZero(wb?.ordersRevenue);
}

function emptyChannelSpendMap() {
  return Object.fromEntries(CHANNEL_KEYS.map(([key]) => [key, 0]));
}

function computeWbApiSpendSelection(date, wb, ads, adsMaps, reviewPointsMap) {
  const channels = emptyChannelSpendMap();
  for (const [key] of CHANNEL_KEYS) {
    channels[key] = roundMoney(adsMaps.byDateChannel.get(`${date}|${key}`) || 0);
  }

  const feedbackReviewPoints = reviewPointsMap.get(date) || { spend: 0, feedbacks: 0 };
  const wbPromotionFromFinanceDeductions = roundMoney(wb.wbPromotionDeduction);
  const wbPromotionFromAds = numberOrZero(channels.wbPromotion);
  let wbPromotionAddedToSpend = 0;

  const reviewPointsFromFinanceDeductions = roundMoney(wb.reviewDeduction);
  const reviewPointsFromCashback = roundMoney(wb.cashbackAmount);
  const reviewPointsFromFeedbacks = roundMoney(feedbackReviewPoints.spend);
  const reviewPointsFromAds = numberOrZero(channels.reviewPoints);
  const selectedReviewPoints = reviewPointsFromFinanceDeductions > 0
    ? reviewPointsFromFinanceDeductions
    : Math.max(reviewPointsFromAds, reviewPointsFromFeedbacks);
  let reviewPointsAddedToSpend = 0;
  if (selectedReviewPoints > reviewPointsFromAds) {
    channels.reviewPoints = selectedReviewPoints;
    reviewPointsAddedToSpend = selectedReviewPoints - reviewPointsFromAds;
  }

  const wbMediaFromFinanceDeductions = roundMoney(wb.wbMediaDeduction);
  const wbMediaFromAds = numberOrZero(channels.wbMedia);
  let wbMediaAddedToSpend = 0;
  if (wbMediaFromFinanceDeductions > 0) {
    channels.wbMedia = roundMoney(wbMediaFromAds + wbMediaFromFinanceDeductions);
    wbMediaAddedToSpend = wbMediaFromFinanceDeductions;
  }

  const externalSpend = numberOrZero(channels.externalAds);
  const apiSpendFactTotal = numberOrZero(ads.spend) + wbPromotionAddedToSpend + reviewPointsAddedToSpend + wbMediaAddedToSpend;
  const wbApiSpendFact = Math.max(0, apiSpendFactTotal - externalSpend);
  return {
    channels,
    feedbackReviewPoints,
    wbPromotionFromFinanceDeductions,
    wbPromotionFromAds,
    wbPromotionAddedToSpend,
    reviewPointsFromFinanceDeductions,
    reviewPointsFromCashback,
    reviewPointsFromFeedbacks,
    reviewPointsFromAds,
    selectedReviewPoints,
    wbMediaFromFinanceDeductions,
    wbMediaFromAds,
    externalSpend,
    apiSpendFactTotal,
    wbApiSpendFact
  };
}

function buildWbIuApiCalibration(range, wbMap, adsMaps, reviewPointsMap, wbDailyPlanMap) {
  const diagnostics = {
    applied: false,
    mode: 'raw_api',
    from: range.from || '',
    to: range.to || '',
    controlFrom: range.controlFrom || '',
    controlTo: range.controlTo || '',
    sourceWorkbook: range.sourceWorkbook || '',
    revenueFactor: 1,
    spendFactor: 1,
    recentSpendFactor: 1,
    recentSpendFactorDays: 0,
    controlDays: 0,
    revenueDays: 0,
    spendDays: 0,
    missingApiRevenueDays: 0,
    missingApiSpendDays: 0,
    controlRevenue: 0,
    rawApiRevenue: 0,
    normalizedApiRevenue: 0,
    revenueMatchPct: null,
    controlSpend: 0,
    controlPlanSpend: 0,
    controlPlanRate: null,
    rawApiSpend: 0,
    normalizedApiSpend: 0,
    spendMatchPct: null,
    dateFactors: {},
    targetMarketingRate: roundRate(WB_CONTRACT.marketingRate),
    rule: 'WB IU/DRR renders the uploaded IU control workbook when a control date exists; API rows are retained for audit deltas only.'
  };

  if (!range.from || !range.to) return diagnostics;

  for (const date of enumerateDates(range.from, range.to)) {
    const control = wbDailyPlanMap.get(date);
    if (!control) continue;
    diagnostics.controlDays += 1;
    const rawRevenue = wbRawRevenueForIu(wbMap.get(date) || {});
    const rawSpend = computeWbApiSpendSelection(
      date,
      wbMap.get(date) || {},
      adsMaps.byDate.get(date) || {},
      adsMaps,
      reviewPointsMap
    ).wbApiSpendFact;
    const controlRevenue = numberOrZero(control.factRevenue);
    const controlSpend = numberOrZero(control.factSpend);
    const controlPlanSpend = numberOrZero(control.planSpend);
    const dateFactor = {};

    if (controlRevenue > 0) {
      diagnostics.controlRevenue += controlRevenue;
      if (rawRevenue > 0) {
        diagnostics.rawApiRevenue += rawRevenue;
        diagnostics.revenueDays += 1;
        dateFactor.revenueFactor = controlRevenue / rawRevenue;
      } else {
        diagnostics.missingApiRevenueDays += 1;
      }
    }
    if (controlPlanSpend > 0) {
      diagnostics.controlPlanSpend += controlPlanSpend;
    }
    if (controlSpend > 0) {
      diagnostics.controlSpend += controlSpend;
      if (rawSpend > 0) {
        diagnostics.rawApiSpend += rawSpend;
        diagnostics.spendDays += 1;
        dateFactor.spendFactor = controlSpend / rawSpend;
      } else {
        diagnostics.missingApiSpendDays += 1;
      }
    }
    if (dateFactor.revenueFactor || dateFactor.spendFactor) {
      diagnostics.dateFactors[date] = dateFactor;
    }
  }

  diagnostics.revenueFactor = diagnostics.controlRevenue > 0 && diagnostics.rawApiRevenue > 0
    ? diagnostics.controlRevenue / diagnostics.rawApiRevenue
    : 1;
  diagnostics.spendFactor = diagnostics.controlSpend > 0 && diagnostics.rawApiSpend > 0
    ? diagnostics.controlSpend / diagnostics.rawApiSpend
    : 1;
  const recentSpendFactors = Object.entries(diagnostics.dateFactors)
    .filter(([, value]) => numberOrZero(value.spendFactor) > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-5)
    .map(([, value]) => value.spendFactor);
  diagnostics.recentSpendFactor = medianNumber(recentSpendFactors) || diagnostics.spendFactor || 1;
  diagnostics.recentSpendFactorDays = recentSpendFactors.length;
  diagnostics.normalizedApiRevenue = diagnostics.rawApiRevenue * diagnostics.revenueFactor;
  diagnostics.normalizedApiSpend = diagnostics.rawApiSpend * diagnostics.spendFactor;
  diagnostics.revenueMatchPct = diagnostics.controlRevenue > 0
    ? roundRate(diagnostics.normalizedApiRevenue / diagnostics.controlRevenue)
    : null;
  diagnostics.spendMatchPct = diagnostics.controlSpend > 0
    ? roundRate(diagnostics.normalizedApiSpend / diagnostics.controlSpend)
    : null;
  diagnostics.controlPlanRate = diagnostics.controlRevenue > 0 && diagnostics.controlPlanSpend > 0
    ? roundRate(diagnostics.controlPlanSpend / diagnostics.controlRevenue)
    : null;
  diagnostics.targetMarketingRate = diagnostics.controlPlanRate || diagnostics.targetMarketingRate;
  diagnostics.applied = diagnostics.revenueDays > 0 || diagnostics.spendDays > 0;
  diagnostics.mode = diagnostics.applied ? 'api_audit_against_wb_iu_control' : 'raw_api';

  diagnostics.controlRevenue = roundMoney(diagnostics.controlRevenue);
  diagnostics.rawApiRevenue = roundMoney(diagnostics.rawApiRevenue);
  diagnostics.normalizedApiRevenue = roundMoney(diagnostics.normalizedApiRevenue);
  diagnostics.controlSpend = roundMoney(diagnostics.controlSpend);
  diagnostics.controlPlanSpend = roundMoney(diagnostics.controlPlanSpend);
  diagnostics.rawApiSpend = roundMoney(diagnostics.rawApiSpend);
  diagnostics.normalizedApiSpend = roundMoney(diagnostics.normalizedApiSpend);
  diagnostics.revenueFactorRounded = roundRate(diagnostics.revenueFactor);
  diagnostics.spendFactorRounded = roundRate(diagnostics.spendFactor);
  diagnostics.recentSpendFactorRounded = roundRate(diagnostics.recentSpendFactor);
  diagnostics.dateFactors = Object.fromEntries(
    Object.entries(diagnostics.dateFactors).map(([date, value]) => [date, {
      revenueFactor: value.revenueFactor || null,
      spendFactor: value.spendFactor || null,
      revenueFactorRounded: value.revenueFactor ? roundRate(value.revenueFactor) : null,
      spendFactorRounded: value.spendFactor ? roundRate(value.spendFactor) : null
    }])
  );
  return diagnostics;
}

function buildDailyRows(platformTrends, iuPlan, companyPlan, adsSummary, wbFeedbacksSummary, options) {
  const wbMap = buildPlatformDateMap(platformTrends, 'wb');
  const ozonMap = buildPlatformDateMap(platformTrends, 'ozon');
  const yandexMap = buildPlatformDateMap(platformTrends, 'ya');
  const adsMaps = buildAdsDailyMaps(adsSummary, options.wbAdsChannelOverrides);
  const ozonFinanceDailyRows = Array.isArray(options.ozonFinance?.daily) ? options.ozonFinance.daily : [];
  const ozonFinanceDailyMap = new Map(ozonFinanceDailyRows
    .map((row) => [isoDate(row.date || row.key || row.label), row])
    .filter(([date]) => Boolean(date)));
  options.wbAdsChannelOverrideRuntime = adsMaps.diagnostics;
  const reviewPointsMap = buildReviewPointsMap(wbFeedbacksSummary);
  const wbDailyPlanMap = buildWbDailyPlanMap(iuPlan);
  const range = dateRange(platformTrends, adsSummary, options.from, options.to, iuPlan);
  options.effectiveIuDrrWindow = range;
  const wbIuApiCalibration = buildWbIuApiCalibration(range, wbMap, adsMaps, reviewPointsMap, wbDailyPlanMap);
  options.wbIuApiCalibration = wbIuApiCalibration;
  const ozonAdsFinanceApplied = Boolean(adsSummary?.diagnostics?.ozonAdsFinance?.days)
    || String(adsSummary?.sourceMode || adsSummary?.source || '').includes('ozon-seller-finance-api');
  const ozonAdsFactSourceMode = adsSummary?.diagnostics?.ozonDailySellerFunnel?.applied
    ? 'ozon_seller_analytics_daily_funnel_smart_spend'
    : ozonAdsFinanceApplied
      ? 'ozon_seller_finance_api'
    : 'google_sheets_fact_ads_daily_sku';
  return enumerateDates(range.from, range.to).map((date) => {
    const month = monthKey(date);
    const plan = monthPlan(iuPlan, month, companyPlan);
    const contractPlanPct = planPctForMonth(iuPlan, month);
    const planPctOzon = ozonPlanPctForMonth(iuPlan, month);
    const contractHalfYear = contractHalfYearForDate(date);
    const wb = wbMap.get(date) || {};
    const wbDailyPlan = wbDailyPlanMap.get(date) || null;
    const ozon = ozonMap.get(date) || {};
    const ozonFinance = ozonFinanceDailyMap.get(date) || {};
    const hasOzonFinanceDay = ozonFinanceDailyMap.has(date);
    const yandex = yandexMap.get(date) || {};
    const ads = adsMaps.byDate.get(date) || {};
    const ozonAds = adsMaps.ozonByDate.get(date) || {};
    const hasOzonAdsFact = adsMaps.ozonByDate.has(date);
    const wbIuFactRevenue = numberOrZero(wbDailyPlan?.factRevenue);
    const wbIuFactSpend = numberOrZero(wbDailyPlan?.factSpend);
    const hasWbIuControlFact = Boolean(wbDailyPlan && (wbIuFactRevenue > 0 || wbIuFactSpend > 0));
    const wbRawApiRevenue = wbRawRevenueForIu(wb);
    const wbRevenueCalibrationFactor = numberOrZero(wbIuApiCalibration.dateFactors?.[date]?.revenueFactor)
      || numberOrZero(wbIuApiCalibration.revenueFactor || 1);
    const wbApiRevenue = wbRawApiRevenue > 0
      ? wbRawApiRevenue * wbRevenueCalibrationFactor
      : 0;
    const revenueWb = hasWbIuControlFact && wbIuFactRevenue > 0
      ? wbIuFactRevenue
      : (wbApiRevenue || wbIuFactRevenue);
    const ordersRevenueWb = revenueWb || numberOrZero(wb.ordersRevenue) || wbIuFactRevenue;
    const revenueOzonApiRaw = numberOrZero(ozon.revenue);
    const ozonFinanceGmv = numberOrZero(ozonFinance.ozonGmv);
    const revenueOzon = hasOzonFinanceDay ? ozonFinanceGmv : revenueOzonApiRaw;
    const revenueYandex = numberOrZero(yandex.revenue);
    const ordersRevenueYandex = numberOrZero(yandex.ordersRevenue);
    const adsPctBaseWb = revenueWb;
    const adsPctBaseIu = adsPctBaseWb + revenueOzon + revenueYandex;
    const wbDailyPlanTargetRevenue = numberOrZero(wbDailyPlan?.targetRevenue);
    const wbDailyPlanSpend = numberOrZero(wbDailyPlan?.planSpend);
    const planPct = contractPlanPct;
    const selectedDailyRevenueWb = numberOrZero(plan.dailyIuRevenueWb);
    const managementTargetRevenueWb = plan.iuRevenueWbPlanSource === 'corporate_plan'
      ? selectedDailyRevenueWb
      : (wbDailyPlanTargetRevenue || selectedDailyRevenueWb);
    const contractTargetRevenueWb = contractDailyTargetRevenueWb(date);
    const targetRevenueWb = Math.max(contractTargetRevenueWb, managementTargetRevenueWb);
    const targetRevenueOzon = numberOrZero(plan.dailyIuRevenueOzon);
    const targetRevenueYandex = numberOrZero(plan.dailyIuRevenueYandex);
    const revenueWbDelta = revenueWb - targetRevenueWb;
    const revenueOzonDelta = revenueOzon - targetRevenueOzon;
    const revenueYandexDelta = revenueYandex - targetRevenueYandex;
    const managementPlanSpendWb = targetRevenueWb * contractPlanPct;
    const contractMarketingPlanWb = revenueWb * contractPlanPct;
    const controlPlanSpendWb = hasWbIuControlFact && wbDailyPlanSpend > 0 ? wbDailyPlanSpend : 0;
    const planSpendWb = controlPlanSpendWb || contractMarketingPlanWb;
    const selectedPlanPct = revenueWb > 0 && planSpendWb > 0
      ? planSpendWb / revenueWb
      : contractPlanPct;
    const planSpendOzon = numberOrZero(plan.dailyIuAdsOzon) || (targetRevenueOzon * planPctOzon);
    const spendFactOzon = hasOzonFinanceDay
      ? numberOrZero(ozonFinance.drrSpend)
      : (hasOzonAdsFact ? numberOrZero(ozonAds.spend) : revenueOzon * planPctOzon);
    const ozonAdsFactMode = hasOzonFinanceDay
      ? 'ozon_finance_balance_gmv_drr_excluding_premium_plus_original_badge'
      : hasOzonAdsFact
      ? ozonAdsFactSourceMode
      : 'modeled_from_revenue_25pct_no_ozon_ads_fact';
    const spendFactYandex = 0;
    const yandexAdsFactMode = revenueYandex || ordersRevenueYandex || numberOrZero(yandex.adsImpressions)
      ? 'yandex_market_sales_funnel_no_ad_spend'
      : '';
    const spendSelection = computeWbApiSpendSelection(date, wb, ads, adsMaps, reviewPointsMap);
    const {
      channels,
      feedbackReviewPoints,
      reviewPointsFromFinanceDeductions,
      reviewPointsFromCashback,
      reviewPointsFromFeedbacks,
      reviewPointsFromAds,
      wbMediaFromFinanceDeductions,
      wbMediaFromAds,
      wbPromotionFromFinanceDeductions,
      wbPromotionFromAds,
      wbPromotionAddedToSpend,
      externalSpend,
      apiSpendFactTotal,
      wbApiSpendFact: wbRawApiSpendFact
    } = spendSelection;
    const wbSpendCalibrationFactor = numberOrZero(wbIuApiCalibration.dateFactors?.[date]?.spendFactor)
      || (
        wbIuApiCalibration.controlTo
        && date > wbIuApiCalibration.controlTo
        && numberOrZero(wbIuApiCalibration.recentSpendFactor)
      )
      || numberOrZero(wbIuApiCalibration.spendFactor || 1);
    const wbApiSpendFact = wbRawApiSpendFact > 0
      ? wbRawApiSpendFact * wbSpendCalibrationFactor
      : 0;
    const spendFact = hasWbIuControlFact && wbIuFactSpend > 0
      ? wbIuFactSpend
      : (wbApiSpendFact || wbIuFactSpend);
    const wbIuSpendChannelAdjustment = spendFact > 0
      ? roundMoney(spendFact - wbRawApiSpendFact)
      : 0;
    if (wbIuSpendChannelAdjustment !== 0) {
      channels.wbPromotion = roundMoney(numberOrZero(channels.wbPromotion) + wbIuSpendChannelAdjustment);
    }
    const spendFactTotal = roundMoney(spendFact + externalSpend);
    const spendFactIu = spendFact + spendFactOzon + spendFactYandex;
    const spendDelta = spendFact - planSpendWb;
    const spendDeltaOzon = spendFactOzon - planSpendOzon;
    const spendDeltaIu = spendFactIu - planSpendWb - planSpendOzon;
    return {
      date,
      period: periodLabel(date),
      monthKey: month,
      contractPeriodKey: contractHalfYear?.key || '',
      targetRevenueWb: roundMoney(targetRevenueWb),
      contractTargetRevenueWb: roundMoney(contractTargetRevenueWb),
      managementTargetRevenueWb: roundMoney(managementTargetRevenueWb),
      selectedDailyRevenueWb: roundMoney(selectedDailyRevenueWb),
      wbIuPlanSource: wbDailyPlan?.source || '',
      wbIuPlanShare: wbDailyPlan ? wbDailyPlan.share : null,
      wbIuPlanGmvGross: roundMoney(wbDailyPlan?.gmvPlanGross),
      wbIuPlanAdsGross: roundMoney(wbDailyPlan?.adsPlanGross),
      wbIuFactRevenueGross: roundMoney(wbDailyPlan?.factRevenueGross),
      wbIuFactAdsGross: roundMoney(wbDailyPlan?.factSpendGross),
      wbIuFactSource: wbIuFactRevenue || wbIuFactSpend ? wbDailyPlan?.source || '' : '',
      wbIuFactMode: hasWbIuControlFact ? 'wb_iu_control_workbook' : (wbIuApiCalibration.applied ? 'wb_api_calibrated_to_iu_control' : 'platform_api_raw'),
      wbIuControlRevenue: roundMoney(wbIuFactRevenue),
      wbIuControlSpend: roundMoney(wbIuFactSpend),
      wbRawApiRevenue: roundMoney(wbRawApiRevenue),
      wbRawApiSpendFact: roundMoney(wbRawApiSpendFact),
      wbApiRevenueCalibrationFactor: roundRate(wbRevenueCalibrationFactor),
      wbApiSpendCalibrationFactor: roundRate(wbSpendCalibrationFactor),
      wbApiRevenue: roundMoney(wbApiRevenue),
      wbApiSpendFact: roundMoney(wbApiSpendFact),
      wbIuRevenueApiDelta: wbIuFactRevenue ? roundMoney(wbIuFactRevenue - wbApiRevenue) : null,
      wbIuAdsApiDelta: wbIuFactSpend ? roundMoney(wbIuFactSpend - wbApiSpendFact) : null,
      wbIuRevenueRawApiDelta: wbIuFactRevenue ? roundMoney(wbIuFactRevenue - wbRawApiRevenue) : null,
      wbIuAdsRawApiDelta: wbIuFactSpend ? roundMoney(wbIuFactSpend - wbRawApiSpendFact) : null,
      wbIuRevenueControlMatchPct: wbIuFactRevenue > 0 ? roundRate(wbApiRevenue / wbIuFactRevenue) : null,
      wbIuAdsControlMatchPct: wbIuFactSpend > 0 ? roundRate(wbApiSpendFact / wbIuFactSpend) : null,
      wbIuSpendChannelAdjustment,
      wbRevenuePlanSource: plan.iuRevenueWbPlanSource,
      revenueWb: roundMoney(revenueWb),
      ordersRevenueWb: roundMoney(ordersRevenueWb),
      adsPctBaseWb: roundMoney(adsPctBaseWb),
      revenueWbDelta: roundMoney(revenueWbDelta),
      revenueWbDeltaPct: targetRevenueWb > 0 ? roundRate(revenueWbDelta / targetRevenueWb) : null,
      revenueWbCompletionPct: targetRevenueWb > 0 ? roundRate(revenueWb / targetRevenueWb) : null,
      targetRevenueOzon: roundMoney(targetRevenueOzon),
      revenueOzon: roundMoney(revenueOzon),
      revenueOzonApiRaw: roundMoney(revenueOzonApiRaw),
      ozonGmv: roundMoney(ozonFinanceGmv),
      ozonGmvGross: roundMoney(ozonFinance.ozonGmvGross),
      ozonReturns: roundMoney(ozonFinance.ozonReturns),
      ozonGmvMode: ozonFinance.ozonGmvMode || (hasOzonFinanceDay ? 'ozon_finance_unknown' : 'seller_analytics_fallback'),
      revenueOzonDelta: roundMoney(revenueOzonDelta),
      revenueOzonDeltaPct: targetRevenueOzon > 0 ? roundRate(revenueOzonDelta / targetRevenueOzon) : null,
      revenueOzonCompletionPct: targetRevenueOzon > 0 ? roundRate(revenueOzon / targetRevenueOzon) : null,
      planPctOzon: roundRate(planPctOzon),
      planSpendOzon: roundMoney(planSpendOzon),
      spendFactOzon: roundMoney(spendFactOzon),
      ozonDrrSpendGross: roundMoney(ozonFinance.drrSpendGross),
      ozonDrrExcludedPremiumPlus: roundMoney(ozonFinance.drrExcludedPremiumPlus),
      ozonDrrExcludedOriginalBadge: roundMoney(ozonFinance.drrExcludedOriginalBadge),
      ozonDrrExcludedTotal: roundMoney(ozonFinance.drrExcludedTotal),
      ozonFinanceSourceRows: Math.round(numberOrZero(ozonFinance.rowCount)),
      factPctOzon: revenueOzon > 0 ? roundRate(spendFactOzon / revenueOzon) : null,
      spendDeltaOzon: roundMoney(spendDeltaOzon),
      spendDeltaOzonPct: planSpendOzon > 0 ? roundRate(spendDeltaOzon / planSpendOzon) : null,
      ozonAdsFactMode,
      targetRevenueYandex: roundMoney(targetRevenueYandex),
      revenueYandex: roundMoney(revenueYandex),
      ordersRevenueYandex: roundMoney(ordersRevenueYandex),
      revenueYandexDelta: roundMoney(revenueYandexDelta),
      revenueYandexDeltaPct: targetRevenueYandex > 0 ? roundRate(revenueYandexDelta / targetRevenueYandex) : null,
      revenueYandexCompletionPct: targetRevenueYandex > 0 ? roundRate(revenueYandex / targetRevenueYandex) : null,
      planSpendYandex: 0,
      spendFactYandex: roundMoney(spendFactYandex),
      factPctYandex: null,
      yandexAdsFactMode,
      revenueTotalIu: roundMoney(revenueWb + revenueOzon + revenueYandex),
      revenueWbSource: hasWbIuControlFact && wbIuFactRevenue > 0
        ? 'wb_iu_control_workbook'
        : wbIuApiCalibration.applied
        ? 'wb_api_orders_normalized_to_iu_control'
        : (wb.source || 'wb_api'),
      unitsWb: Math.round(numberOrZero(wb.units)),
      unitsOzon: Math.round(numberOrZero(ozon.units)),
      ordersUnitsOzon: Math.round(numberOrZero(ozon.ordersUnits || ozon.units)),
      deliveredUnitsOzon: Math.round(numberOrZero(ozon.deliveredUnits)),
      unitsYandex: Math.round(numberOrZero(yandex.units)),
      ordersUnitsYandex: Math.round(numberOrZero(yandex.ordersUnits)),
      deliveredUnitsYandex: Math.round(numberOrZero(yandex.deliveredUnits)),
      yandexShows: Math.round(numberOrZero(yandex.adsImpressions)),
      yandexClicks: Math.round(numberOrZero(yandex.adsClicks)),
      yandexToCart: Math.round(numberOrZero(yandex.addToCart)),
      yandexCtr: numberOrZero(yandex.adsImpressions) > 0 ? roundRate(numberOrZero(yandex.adsClicks) / numberOrZero(yandex.adsImpressions)) : null,
      yandexCartRate: numberOrZero(yandex.adsImpressions) > 0 ? roundRate(numberOrZero(yandex.addToCart) / numberOrZero(yandex.adsImpressions)) : null,
      yandexOrderRate: numberOrZero(yandex.addToCart) > 0 ? roundRate(numberOrZero(yandex.ordersUnits) / numberOrZero(yandex.addToCart)) : null,
      yandexBuyoutRate: numberOrZero(yandex.ordersUnits) > 0 ? roundRate(numberOrZero(yandex.deliveredUnits) / numberOrZero(yandex.ordersUnits)) : null,
      yandexCancellationsUnits: Math.round(numberOrZero(yandex.cancellationsUnits)),
      yandexReturnsUnits: Math.round(numberOrZero(yandex.returnsUnits)),
      yandexSourceRows: Math.round(numberOrZero(yandex.sourceRows)),
      planPct: roundRate(selectedPlanPct),
      planSpendWb: roundMoney(planSpendWb),
      controlPlanSpendWb: roundMoney(controlPlanSpendWb),
      contractMarketingPlanWb: roundMoney(contractMarketingPlanWb),
      managementPlanSpendWb: roundMoney(managementPlanSpendWb),
      spendFact: roundMoney(spendFact),
      spendFactDrr: roundMoney(spendFact),
      spendFactTotal: roundMoney(spendFactTotal),
      spendFactIu: roundMoney(spendFactIu),
      spendFactTotalIu: roundMoney(spendFactTotal + spendFactOzon + spendFactYandex),
      factPct: adsPctBaseWb > 0 ? roundRate(spendFact / adsPctBaseWb) : null,
      factPctIu: adsPctBaseIu > 0 ? roundRate(spendFactIu / adsPctBaseIu) : null,
      ordersAdPct: ordersRevenueWb > 0 ? roundRate(spendFact / ordersRevenueWb) : null,
      ...channels,
      wbDeduction: roundMoney(wb.deduction),
      wbPromotionFinanceDeduction: roundMoney(wbPromotionFromFinanceDeductions),
      wbPromotionFromAds: roundMoney(wbPromotionFromAds),
      wbPromotionAddedToSpend: roundMoney(wbPromotionAddedToSpend),
      wbPromotionSource: wbPromotionFromAds > 0 ? 'wb_ads_channel' : '',
      wbReviewDeduction: roundMoney(wb.reviewDeduction),
      wbMediaFinanceDeduction: roundMoney(wb.wbMediaDeduction),
      wbCashbackAmount: roundMoney(wb.cashbackAmount),
      wbCashbackDiscount: roundMoney(wb.cashbackDiscount),
      wbCashbackCommissionChange: roundMoney(wb.cashbackCommissionChange),
      reviewPointsSource: reviewPointsFromFinanceDeductions > 0
        ? 'wb_finance_api_detailed_deduction_review'
        : reviewPointsFromAds > 0
          ? 'wb_ads_financial_upd'
          : reviewPointsFromFeedbacks > 0
            ? 'wb_feedbacks_api_supplierFeedbackValuation'
            : '',
      reviewPointsCashbackControl: reviewPointsFromCashback,
      wbMediaSource: wbMediaFromFinanceDeductions > 0
        ? 'wb_finance_api_detailed_deduction_media'
        : (wbMediaFromAds > 0 ? 'wb_ads_channel' : ''),
      reviewPointsFeedbacks: Math.round(numberOrZero(feedbackReviewPoints.feedbacks)),
      spendDelta: roundMoney(spendDelta),
      spendDeltaPct: planSpendWb > 0 ? roundRate(spendDelta / planSpendWb) : null,
      spendDeltaIu: roundMoney(spendDeltaIu),
      spendDeltaIuPct: planSpendWb + planSpendOzon > 0 ? roundRate(spendDeltaIu / (planSpendWb + planSpendOzon)) : null,
      externalAdsExcludedFromDrr: true,
      adsViews: Math.round(numberOrZero(ads.views)),
      adsClicks: Math.round(numberOrZero(ads.clicks)),
      adsOrders: Math.round(numberOrZero(ads.orders)),
      adsRevenue: roundMoney(numberOrZero(ads.revenue)),
      sourceRows: Math.round(numberOrZero(ads.rows)),
      ozonAdsViews: Math.round(numberOrZero(ozonAds.views)),
      ozonAdsClicks: Math.round(numberOrZero(ozonAds.clicks)),
      ozonAdsOrders: Math.round(numberOrZero(ozonAds.orders)),
      ozonAdsRevenue: roundMoney(numberOrZero(ozonAds.revenue)),
      ozonAdsSourceRows: Math.round(numberOrZero(ozonAds.rows))
    };
  });
}

function sumRows(rows, field) {
  return rows.reduce((sum, row) => sum + numberOrZero(row[field]), 0);
}

function buildMonthRows(dailyRows, iuPlan, companyPlan) {
  const groups = new Map();
  for (const row of dailyRows) {
    const current = groups.get(row.monthKey) || [];
    current.push(row);
    groups.set(row.monthKey, current);
  }
  return [...groups.entries()].map(([month, rows]) => {
    const plan = monthPlan(iuPlan, month, companyPlan);
    const revenueWb = sumRows(rows, 'revenueWb');
    const ordersRevenueWb = sumRows(rows, 'ordersRevenueWb');
    const adsPctBaseWb = sumRows(rows, 'adsPctBaseWb') || revenueWb;
    const revenueOzon = sumRows(rows, 'revenueOzon');
    const revenueOzonApiRaw = sumRows(rows, 'revenueOzonApiRaw');
    const ozonGmv = sumRows(rows, 'ozonGmv');
    const ozonGmvGross = sumRows(rows, 'ozonGmvGross');
    const ozonReturns = sumRows(rows, 'ozonReturns');
    const revenueYandex = sumRows(rows, 'revenueYandex');
    const ordersRevenueYandex = sumRows(rows, 'ordersRevenueYandex');
    const revenueTotalIu = sumRows(rows, 'revenueTotalIu');
    const adsPctBaseIu = adsPctBaseWb + revenueOzon + revenueYandex;
    const spendFact = sumRows(rows, 'spendFact');
    const spendFactOzon = sumRows(rows, 'spendFactOzon');
    const ozonDrrSpendGross = sumRows(rows, 'ozonDrrSpendGross');
    const ozonDrrExcludedPremiumPlus = sumRows(rows, 'ozonDrrExcludedPremiumPlus');
    const ozonDrrExcludedOriginalBadge = sumRows(rows, 'ozonDrrExcludedOriginalBadge');
    const ozonDrrExcludedTotal = sumRows(rows, 'ozonDrrExcludedTotal');
    const spendFactYandex = sumRows(rows, 'spendFactYandex');
    const spendFactIu = sumRows(rows, 'spendFactIu');
    const spendFactTotal = sumRows(rows, 'spendFactTotal');
    const spendFactTotalIu = sumRows(rows, 'spendFactTotalIu');
    const externalAds = sumRows(rows, 'externalAds');
    const planSpendWb = sumRows(rows, 'planSpendWb');
    const contractMarketingPlanWb = sumRows(rows, 'contractMarketingPlanWb');
    const managementPlanSpendWb = sumRows(rows, 'managementPlanSpendWb');
    const planSpendOzon = sumRows(rows, 'planSpendOzon');
    const planSpendYandex = sumRows(rows, 'planSpendYandex');
    const targetRevenueWb = sumRows(rows, 'targetRevenueWb');
    const targetRevenueOzon = sumRows(rows, 'targetRevenueOzon');
    const targetRevenueYandex = sumRows(rows, 'targetRevenueYandex');
    const revenueWbDelta = sumRows(rows, 'revenueWbDelta');
    const revenueOzonDelta = sumRows(rows, 'revenueOzonDelta');
    const revenueYandexDelta = sumRows(rows, 'revenueYandexDelta');
    const spendDeltaOzon = sumRows(rows, 'spendDeltaOzon');
    const spendDeltaIu = sumRows(rows, 'spendDeltaIu');
    const ozonAdsFactModes = Array.from(new Set(rows.map((row) => row.ozonAdsFactMode).filter(Boolean)));
    const contractMonthTargetWb = contractMonthTargetRevenueWb(month);
    const monthlyRevenueWbPlan = Math.max(
      numberOrZero(contractMonthTargetWb),
      numberOrZero(plan.iuRevenueWb),
      numberOrZero(targetRevenueWb)
    );
    const monthlyAdsWbPlan = Math.max(
      numberOrZero(plan.iuAdsWb),
      numberOrZero(planSpendWb)
    );
    const plannedRevenueWbToDate = targetRevenueWb;
    const plannedRevenueOzonToDate = targetRevenueOzon;
    const plannedRevenueYandexToDate = targetRevenueYandex;
    const plannedRevenueToDate = plannedRevenueWbToDate + plannedRevenueOzonToDate + plannedRevenueYandexToDate;
    const plannedAdsWbToDate = planSpendWb;
    const plannedAdsOzonToDate = planSpendOzon;
    const plannedAdsYandexToDate = planSpendYandex;
    const plannedAdsToDate = plannedAdsWbToDate + plannedAdsOzonToDate + plannedAdsYandexToDate;
    return {
      monthKey: month,
      label: plan.label,
      daysInPlan: plan.days,
      daysInSummary: rows.length,
      iuRevenuePlan: roundMoney(monthlyRevenueWbPlan + plan.iuRevenueOzon + plan.iuRevenueYandex),
      iuRevenuePlanToDate: roundMoney(plannedRevenueToDate),
      iuRevenueFactToDate: roundMoney(revenueTotalIu),
      iuRevenueCompletionToDate: plannedRevenueToDate > 0 ? roundRate(revenueTotalIu / plannedRevenueToDate) : null,
      iuRevenueWbPlan: roundMoney(monthlyRevenueWbPlan),
      iuRevenueWbIuMin: roundMoney(plan.iuRevenueWbIuMin),
      iuRevenueWbCorporatePlan: roundMoney(plan.iuRevenueWbCorporatePlan),
      iuRevenueWbPlanSource: plan.iuRevenueWbPlanSource,
      iuRevenueWbPlanToDate: roundMoney(plannedRevenueWbToDate),
      iuRevenueWbFactToDate: roundMoney(revenueWb),
      iuRevenueWbCompletionToDate: plannedRevenueWbToDate > 0 ? roundRate(revenueWb / plannedRevenueWbToDate) : null,
      iuRevenueOzonPlan: roundMoney(plan.iuRevenueOzon),
      iuRevenueOzonContractMin: roundMoney(plan.iuRevenueOzonContractMin),
      iuRevenueOzonCorporatePlan: roundMoney(plan.iuRevenueOzonCorporatePlan),
      iuRevenueOzonPlanSource: plan.iuRevenueOzonPlanSource,
      iuRevenueOzonPlanToDate: roundMoney(plannedRevenueOzonToDate),
      iuRevenueOzonFactToDate: roundMoney(revenueOzon),
      iuRevenueOzonCompletionToDate: plannedRevenueOzonToDate > 0 ? roundRate(revenueOzon / plannedRevenueOzonToDate) : null,
      iuRevenueYandexPlan: roundMoney(plan.iuRevenueYandex),
      iuRevenueYandexCorporatePlan: roundMoney(plan.iuRevenueYandexCorporatePlan),
      iuRevenueYandexPlanSource: plan.iuRevenueYandexPlanSource,
      iuRevenueYandexPlanToDate: roundMoney(plannedRevenueYandexToDate),
      iuRevenueYandexFactToDate: roundMoney(revenueYandex),
      iuRevenueYandexCompletionToDate: plannedRevenueYandexToDate > 0 ? roundRate(revenueYandex / plannedRevenueYandexToDate) : null,
      iuAdsPlan: roundMoney(monthlyAdsWbPlan),
      iuAdsPlanToDate: roundMoney(plannedAdsWbToDate),
      iuAdsOzonPlan: roundMoney(plan.iuAdsOzon),
      iuAdsOzonPlanToDate: roundMoney(plannedAdsOzonToDate),
      iuAdsYandexPlan: 0,
      iuAdsYandexPlanToDate: roundMoney(plannedAdsYandexToDate),
      iuAdsTotalPlan: roundMoney(monthlyAdsWbPlan + plan.iuAdsOzon),
      iuAdsTotalPlanToDate: roundMoney(plannedAdsToDate),
      iuAdsFactWbToDate: roundMoney(spendFact),
      iuAdsFactWbTotalToDate: roundMoney(spendFactTotal),
      iuAdsFactOzonToDate: roundMoney(spendFactOzon),
      iuAdsFactYandexToDate: roundMoney(spendFactYandex),
      iuAdsFactTotalToDate: roundMoney(spendFactIu),
      iuAdsFactTotalWithExternalToDate: roundMoney(spendFactTotalIu),
      iuAdsCompletionToDate: plannedAdsWbToDate > 0 ? roundRate(spendFact / plannedAdsWbToDate) : null,
      iuAdsCompletionOzonToDate: plannedAdsOzonToDate > 0 ? roundRate(spendFactOzon / plannedAdsOzonToDate) : null,
      iuAdsCompletionTotalToDate: plannedAdsToDate > 0 ? roundRate(spendFactIu / plannedAdsToDate) : null,
      targetRevenueWb: roundMoney(targetRevenueWb),
      revenueWbDelta: roundMoney(revenueWbDelta),
      revenueWbDeltaPct: targetRevenueWb > 0 ? roundRate(revenueWbDelta / targetRevenueWb) : null,
      revenueWbCompletionPct: targetRevenueWb > 0 ? roundRate(revenueWb / targetRevenueWb) : null,
      targetRevenueOzon: roundMoney(targetRevenueOzon),
      revenueOzonDelta: roundMoney(revenueOzonDelta),
      revenueOzonDeltaPct: targetRevenueOzon > 0 ? roundRate(revenueOzonDelta / targetRevenueOzon) : null,
      revenueOzonCompletionPct: targetRevenueOzon > 0 ? roundRate(revenueOzon / targetRevenueOzon) : null,
      targetRevenueYandex: roundMoney(targetRevenueYandex),
      revenueYandexDelta: roundMoney(revenueYandexDelta),
      revenueYandexDeltaPct: targetRevenueYandex > 0 ? roundRate(revenueYandexDelta / targetRevenueYandex) : null,
      revenueYandexCompletionPct: targetRevenueYandex > 0 ? roundRate(revenueYandex / targetRevenueYandex) : null,
      planPctOzon: roundRate(ozonPlanPctForMonth(iuPlan, month)),
      planSpendOzon: roundMoney(planSpendOzon),
      planSpendYandex: roundMoney(planSpendYandex),
      revenueWb: roundMoney(revenueWb),
      ordersRevenueWb: roundMoney(ordersRevenueWb),
      adsPctBaseWb: roundMoney(adsPctBaseWb),
      revenueOzon: roundMoney(revenueOzon),
      revenueOzonApiRaw: roundMoney(revenueOzonApiRaw),
      ozonGmv: roundMoney(ozonGmv),
      ozonGmvGross: roundMoney(ozonGmvGross),
      ozonReturns: roundMoney(ozonReturns),
      revenueYandex: roundMoney(revenueYandex),
      ordersRevenueYandex: roundMoney(ordersRevenueYandex),
      spendFact: roundMoney(spendFact),
      spendFactDrr: roundMoney(spendFact),
      spendFactTotal: roundMoney(spendFactTotal),
      spendFactOzon: roundMoney(spendFactOzon),
      ozonDrrSpendGross: roundMoney(ozonDrrSpendGross),
      ozonDrrExcludedPremiumPlus: roundMoney(ozonDrrExcludedPremiumPlus),
      ozonDrrExcludedOriginalBadge: roundMoney(ozonDrrExcludedOriginalBadge),
      ozonDrrExcludedTotal: roundMoney(ozonDrrExcludedTotal),
      spendFactYandex: roundMoney(spendFactYandex),
      spendFactIu: roundMoney(spendFactIu),
      spendFactTotalIu: roundMoney(spendFactTotalIu),
      externalAds: roundMoney(externalAds),
      planSpendWb: roundMoney(planSpendWb),
      contractMarketingPlanWb: roundMoney(contractMarketingPlanWb),
      managementPlanSpendWb: roundMoney(managementPlanSpendWb),
      drrWb: adsPctBaseWb > 0 ? roundRate(spendFact / adsPctBaseWb) : null,
      drrOzon: revenueOzon > 0 ? roundRate(spendFactOzon / revenueOzon) : null,
      drrYandex: null,
      drrIu: adsPctBaseIu > 0 ? roundRate(spendFactIu / adsPctBaseIu) : null,
      spendDelta: roundMoney(spendFact - planSpendWb),
      spendDeltaPct: planSpendWb > 0 ? roundRate((spendFact - planSpendWb) / planSpendWb) : null,
      ordersAdPct: ordersRevenueWb > 0 ? roundRate(spendFact / ordersRevenueWb) : null,
      spendDeltaOzon: roundMoney(spendDeltaOzon),
      spendDeltaOzonPct: planSpendOzon > 0 ? roundRate(spendDeltaOzon / planSpendOzon) : null,
      spendDeltaYandex: roundMoney(spendFactYandex - planSpendYandex),
      spendDeltaYandexPct: planSpendYandex > 0 ? roundRate((spendFactYandex - planSpendYandex) / planSpendYandex) : null,
      spendDeltaIu: roundMoney(spendDeltaIu),
      spendDeltaIuPct: planSpendWb + planSpendOzon > 0 ? roundRate(spendDeltaIu / (planSpendWb + planSpendOzon)) : null,
      ozonAdsFactMode: ozonAdsFactModes.length === 1 ? ozonAdsFactModes[0] : ozonAdsFactModes.join('+'),
      yandexAdsFactMode: Array.from(new Set(rows.map((row) => row.yandexAdsFactMode).filter(Boolean))).join('+'),
      planPct: adsPctBaseWb > 0 && planSpendWb > 0
        ? roundRate(planSpendWb / adsPctBaseWb)
        : roundRate(planPctForMonth(iuPlan, month)),
      externalAdsExcludedFromDrr: true,
      ozonAdsViews: sumRows(rows, 'ozonAdsViews'),
      ozonAdsClicks: sumRows(rows, 'ozonAdsClicks'),
      ozonAdsOrders: sumRows(rows, 'ozonAdsOrders'),
      ozonAdsRevenue: roundMoney(sumRows(rows, 'ozonAdsRevenue')),
      ozonAdsSourceRows: sumRows(rows, 'ozonAdsSourceRows'),
      yandexShows: sumRows(rows, 'yandexShows'),
      yandexClicks: sumRows(rows, 'yandexClicks'),
      yandexToCart: sumRows(rows, 'yandexToCart'),
      yandexCtr: sumRows(rows, 'yandexShows') > 0 ? roundRate(sumRows(rows, 'yandexClicks') / sumRows(rows, 'yandexShows')) : null,
      yandexCartRate: sumRows(rows, 'yandexShows') > 0 ? roundRate(sumRows(rows, 'yandexToCart') / sumRows(rows, 'yandexShows')) : null,
      yandexOrderRate: sumRows(rows, 'yandexToCart') > 0 ? roundRate(sumRows(rows, 'ordersUnitsYandex') / sumRows(rows, 'yandexToCart')) : null,
      yandexBuyoutRate: sumRows(rows, 'ordersUnitsYandex') > 0 ? roundRate(sumRows(rows, 'deliveredUnitsYandex') / sumRows(rows, 'ordersUnitsYandex')) : null,
      unitsYandex: sumRows(rows, 'unitsYandex'),
      ordersUnitsYandex: sumRows(rows, 'ordersUnitsYandex'),
      deliveredUnitsYandex: sumRows(rows, 'deliveredUnitsYandex'),
      yandexCancellationsUnits: sumRows(rows, 'yandexCancellationsUnits'),
      yandexReturnsUnits: sumRows(rows, 'yandexReturnsUnits'),
      yandexSourceRows: sumRows(rows, 'yandexSourceRows'),
      wbDeduction: roundMoney(sumRows(rows, 'wbDeduction')),
      wbReviewDeduction: roundMoney(sumRows(rows, 'wbReviewDeduction')),
      wbMediaFinanceDeduction: roundMoney(sumRows(rows, 'wbMediaFinanceDeduction')),
      wbCashbackAmount: roundMoney(sumRows(rows, 'wbCashbackAmount')),
      wbCashbackDiscount: roundMoney(sumRows(rows, 'wbCashbackDiscount')),
      wbCashbackCommissionChange: roundMoney(sumRows(rows, 'wbCashbackCommissionChange')),
      channels: Object.fromEntries(CHANNEL_KEYS.map(([key, label]) => [key, {
        key,
        label,
        spend: roundMoney(sumRows(rows, key))
      }])),
      reviewPointsCashbackControl: roundMoney(sumRows(rows, 'reviewPointsCashbackControl')),
      reviewPointsFeedbacks: sumRows(rows, 'reviewPointsFeedbacks')
    };
  }).sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function buildContractPeriodRows(dailyRows) {
  return WB_CONTRACT.halfYears.map((period) => {
    const from = maxDate(period.from, WB_CONTRACT.salesPeriodStart);
    const to = minDate(period.to, WB_CONTRACT.salesPeriodEnd);
    const rows = dailyRows.filter((row) => row.date >= from && row.date <= to);
    const targetRevenue = contractTargetRevenueWbForRange(from, to);
    const loadedTargetRevenue = sumRows(rows, 'targetRevenueWb');
    const factRevenue = sumRows(rows, 'revenueWb');
    const ordersRevenue = sumRows(rows, 'ordersRevenueWb');
    const marketingPlan = sumRows(rows, 'planSpendWb') || factRevenue * numberOrZero(WB_CONTRACT.marketingRate);
    const marketingSpend = sumRows(rows, 'spendFact');
    const marketingRate = factRevenue > 0 && marketingPlan > 0
      ? marketingPlan / factRevenue
      : numberOrZero(WB_CONTRACT.marketingRate);
    return {
      key: period.key,
      from,
      to,
      loadedFrom: rows[0]?.date || '',
      loadedTo: rows[rows.length - 1]?.date || '',
      loadedDays: rows.length,
      targetRevenue: roundMoney(targetRevenue),
      thresholdRevenue: roundMoney(targetRevenue * numberOrZero(WB_CONTRACT.thresholdRate)),
      stornoCancelRevenue: roundMoney(targetRevenue * numberOrZero(WB_CONTRACT.stornoCancelRate)),
      loadedTargetRevenue: roundMoney(loadedTargetRevenue),
      factRevenue: roundMoney(factRevenue),
      ordersRevenue: roundMoney(ordersRevenue),
      revenueCompletionToLoadedTarget: loadedTargetRevenue > 0 ? roundRate(factRevenue / loadedTargetRevenue) : null,
      revenueCompletionToPeriodTarget: targetRevenue > 0 ? roundRate(factRevenue / targetRevenue) : null,
      marketingRate: roundRate(marketingRate),
      marketingPlan: roundMoney(marketingPlan),
      marketingSpend: roundMoney(marketingSpend),
      marketingCompletion: marketingPlan > 0 ? roundRate(marketingSpend / marketingPlan) : null,
      drrWb: factRevenue > 0 ? roundRate(marketingSpend / factRevenue) : null,
      ordersAdPct: ordersRevenue > 0 ? roundRate(marketingSpend / ordersRevenue) : null
    };
  });
}

function buildWbControlPeriodRows(iuPlan, to = '') {
  const controlTo = isoDate(to) || isoDate(iuPlan?.wbDailyPlan?.to) || '';
  return (Array.isArray(iuPlan?.wbDailyPlan?.daily) ? iuPlan.wbDailyPlan.daily : [])
    .map((row) => {
      const date = isoDate(row?.date);
      if (!date || date < WB_CONTRACT.salesPeriodStart) return null;
      if (controlTo && date > controlTo) return null;
      const revenueWb = moneyOrZero(row.revenueFactOur ?? row.revenueFactGross);
      const spendFact = moneyOrZero(row.adsFactOur ?? row.adsFactGross);
      const planSpendWb = moneyOrZero(row.adsPlanOur ?? row.adsPlanGross);
      if (revenueWb <= 0 && spendFact <= 0 && planSpendWb <= 0) return null;
      return {
        date,
        ordersRevenueWb: revenueWb,
        revenueWb,
        spendFact,
        planSpendWb
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildChannelRows(dailyRows, adsSummary = {}, wbFeedbacksSummary = {}) {
  const adsSourceMode = String(adsSummary.sourceMode || adsSummary.source || '');
  const wbAdsSource = adsSourceMode.includes('google-sheets-fact-ads')
    ? 'Google Sheets fact_ads_daily_sku'
    : 'WB Promotion API';
  const reviewPointSources = new Set(dailyRows.map((row) => row.reviewPointsSource).filter(Boolean));
  const reviewPointsSource = reviewPointSources.has('wb_finance_api_detailed_deduction_review')
    ? 'WB Finance API detailed deductions'
    : reviewPointSources.has('wb_ads_financial_upd')
      ? 'WB Promotion UPD'
      : numberOrZero(wbFeedbacksSummary?.reviewsForPoints?.spend) > 0
        ? 'WB Feedbacks API'
        : '';
  const hasWbMediaFinanceDeductions = dailyRows.some((row) => numberOrZero(row.wbMediaFinanceDeduction) > 0);
  const wbMediaSource = hasWbMediaFinanceDeductions
    ? `${wbAdsSource} + WB Finance API detailed deductions`
    : wbAdsSource;
  return CHANNEL_KEYS.map(([key, label]) => ({
    key,
    label,
    spend: roundMoney(sumRows(dailyRows, key)),
    source: key === 'wbPromotion'
      ? wbAdsSource
      : key === 'wbMedia'
        ? wbMediaSource
      : key === 'reviewPoints' && (reviewPointsSource || sumRows(dailyRows, key) > 0)
        ? (reviewPointsSource || 'WB ads source')
      : key === 'externalAds' && (adsSourceMode.includes('external-sheet') || sumRows(dailyRows, key) > 0)
        ? 'Google Sheets внешка'
        : 'нет источника в v1'
  })).sort((left, right) => right.spend - left.spend || left.label.localeCompare(right.label, 'ru'));
}

function buildPlanTruthRows(iuPlan, companyPlan) {
  const monthKeys = new Set([
    ...Object.keys(iuPlan?.months || {}),
    ...Object.keys(companyPlan?.months || {})
  ]);
  return [...monthKeys].sort().map((month) => {
    const plan = monthPlan(iuPlan, month, companyPlan);
    const companyMonth = companyPlan?.months?.[month] || {};
    const channels = companyMonth.channels || {};
    return {
      monthKey: month,
      label: plan.label,
      days: plan.days,
      rule: 'wb=max(corporate,iu); ozon=max(corporate,iu_40pct)',
      corporateTotal: roundMoney(companyMonth.revenue),
      selectedWbOzonRevenue: roundMoney(plan.iuRevenueWb + plan.iuRevenueOzon),
      wb: {
        selectedRevenue: roundMoney(plan.iuRevenueWb),
        corporatePlan: roundMoney(plan.iuRevenueWbCorporatePlan),
        iuPlan: roundMoney(plan.iuRevenueWbIuMin),
        source: plan.iuRevenueWbPlanSource,
        dailyRevenue: roundMoney(plan.dailyIuRevenueWb),
        iuAdsPlan: roundMoney(plan.iuAdsWb),
        dailyIuAds: roundMoney(plan.dailyIuAdsWb)
      },
      ozon: {
        selectedRevenue: roundMoney(plan.iuRevenueOzon),
        corporatePlan: roundMoney(plan.iuRevenueOzonCorporatePlan),
        iuPlan40: roundMoney(plan.iuRevenueOzonContractMin),
        source: plan.iuRevenueOzonPlanSource,
        dailyRevenue: roundMoney(plan.dailyIuRevenueOzon),
        iuAdsPlan: roundMoney(plan.iuAdsOzon),
        dailyIuAds: roundMoney(plan.dailyIuAdsOzon)
      },
      otherChannels: {
        ya: roundMoney(channels.ya?.revenue),
        goldapple: roundMoney(channels.goldapple?.revenue),
        letu: roundMoney(channels.letu?.revenue),
        magnit: roundMoney(channels.magnit?.revenue),
        d2c: roundMoney(channels.d2c?.revenue),
        b2b: roundMoney(channels.b2b?.revenue)
      }
    };
  });
}

async function buildPayload(options) {
  const platformTrends = readLayer(options, 'platform_trends.json', { platforms: [] });
  const iuPlan = readLayer(options, 'iu_plan.json', { months: {} });
  const companyPlan = readLayer(options, 'company_plan.json', { months: {} });
  const adsSummary = readLayer(options, 'ads_summary.json', { platforms: [], itemSeries: [] });
  const wbFeedbacksSummary = readLayer(options, 'wb_feedbacks_summary.json', { reviewsForPoints: {}, daily: [], cards: [] });
  const ozonPlan = buildOzonPlanDashboardSummary(options);
  const ozonFinance = await buildOzonFinanceSummaryAuto(options);
  options.ozonFinance = ozonFinance;
  const dailyRows = buildDailyRows(platformTrends, iuPlan, companyPlan, adsSummary, wbFeedbacksSummary, options);
  const months = buildMonthRows(dailyRows, iuPlan, companyPlan);
  const planTruth = buildPlanTruthRows(iuPlan, companyPlan);
  const currentMonth = months[months.length - 1] || null;
  const channels = buildChannelRows(dailyRows, adsSummary, wbFeedbacksSummary);
  const asOfDate = dailyRows.map((row) => row.date).filter(Boolean).sort().pop() || isoDate(platformTrends?.latestMarketplaceDate) || isoDate(adsSummary?.asOfDate) || '';
  const wbControlPeriodRows = buildWbControlPeriodRows(iuPlan, iuPlan?.wbDailyPlan?.to || asOfDate);
  const wbPeriodRows = wbControlPeriodRows.length ? wbControlPeriodRows : dailyRows;
  const wbPeriodTo = wbPeriodRows.map((row) => row.date).filter(Boolean).sort().pop() || asOfDate;
  const contractPeriods = buildContractPeriodRows(wbPeriodRows);
  const wbQuarter = buildQuarterSummary(wbPeriodRows, wbPeriodTo);
  const noSourceChannels = channels
    .filter((channel) => channel.source !== 'Google Sheets fact_ads_daily_sku')
    .filter((channel) => !String(channel.source || '').startsWith('WB Promotion API'))
    .filter((channel) => !String(channel.source || '').startsWith('WB Finance API'))
    .filter((channel) => !['WB Feedbacks API', 'Google Sheets внешка'].includes(channel.source))
    .map((channel) => channel.label);
  return {
    generatedAt: new Date().toISOString(),
    asOfDate,
    source: {
      iuPlanGeneratedAt: iuPlan.generatedAt || '',
      companyPlanGeneratedAt: companyPlan.generatedAt || '',
      platformTrendsGeneratedAt: platformTrends.generatedAt || '',
      adsSummaryGeneratedAt: adsSummary.generatedAt || '',
      wbFeedbacksGeneratedAt: wbFeedbacksSummary.generatedAt || '',
      ozonFinanceSourceMode: ozonFinance.source?.sourceMode || '',
      ozonFinanceEndpoint: ozonFinance.source?.endpoint || '',
      ozonFinanceFile: ozonFinance.source?.financeFile || '',
      ozonProductsFile: ozonFinance.source?.productsFile || '',
      ozonPlanFile: ozonPlan.source?.planFile || '',
      adsSourceMode: adsSummary.sourceMode || adsSummary.source || '',
      wbAdsChannelOverridesFile: options.wbAdsChannelOverridesPath || ''
    },
    window: {
      from: dailyRows[0]?.date || '',
      to: dailyRows[dailyRows.length - 1]?.date || '',
      days: dailyRows.length,
      source: options.effectiveIuDrrWindow?.source || '',
      sourceWorkbook: options.effectiveIuDrrWindow?.sourceWorkbook || '',
      controlFrom: options.effectiveIuDrrWindow?.controlFrom || '',
      controlTo: options.effectiveIuDrrWindow?.controlTo || '',
      requestedFrom: options.effectiveIuDrrWindow?.requestedFrom || '',
      requestedTo: options.effectiveIuDrrWindow?.requestedTo || ''
    },
    contract: {
      ...WB_CONTRACT,
      activeTargetRevenue: roundMoney(contractTargetRevenueWbForRange(WB_CONTRACT.salesPeriodStart, WB_CONTRACT.salesPeriodEnd)),
      activeMarketingPlanAtTarget: roundMoney(
        contractTargetRevenueWbForRange(WB_CONTRACT.salesPeriodStart, WB_CONTRACT.salesPeriodEnd)
        * numberOrZero(WB_CONTRACT.marketingRate)
      )
    },
    planPctDefault: DEFAULT_PLAN_PCT,
    ozonPlanPctDefault: DEFAULT_OZON_PLAN_PCT,
    kpis: currentMonth,
    ozonPlan,
    ozonFinance,
    wbQuarter,
    quarterSummary: wbQuarter,
    contractPeriods,
    planTruth: {
      rule: 'WB and Ozon revenue plans use the higher value between corporate plan and IU benchmark; Ozon IU benchmark is Smart-Sale 40%.',
      months: planTruth
    },
    months,
    channels,
    daily: dailyRows,
    diagnostics: {
      adsSourceMode: adsSummary.sourceMode || adsSummary.source || '',
      adsDiagnostics: adsSummary.diagnostics || {},
      wbIuApiCalibration: options.wbIuApiCalibration || {},
      wbAdsChannelOverrides: {
        ...(options.wbAdsChannelOverridesDiagnostics || {}),
        ...(options.wbAdsChannelOverrideRuntime || {})
      },
      wbFeedbacksDiagnostics: wbFeedbacksSummary.diagnostics || {},
      ozonFinanceDiagnostics: ozonFinance.diagnostics || {},
      reviewPointsSource: Array.from(new Set(dailyRows.map((row) => row.reviewPointsSource).filter(Boolean))).join('+')
        || wbFeedbacksSummary?.reviewsForPoints?.sourceStatus
        || '',
      noSourceChannels,
      unmatchedNmIds: adsSummary.diagnostics?.unmatchedNmIds || [],
      notes: [
        'Ozon IU fact is calculated from Ozon Finance balance GMV: sales/revenue minus returns. Seller analytics revenue is retained as revenueOzonApiRaw for audit and used only when finance data is missing.',
        'Ozon DRR fact is calculated from Ozon Finance promotion/expense rows divided by GMV; Premium Plus and Бейдж Оригинал are excluded from the numerator.',
        'WB revenue plan is max(corporate WB plan, Smart-Sale IU WB plan); WB ad plan remains on the IU/DRR ad contour.',
        'Ozon revenue plan is max(corporate Ozon plan, Smart-Sale IU 40% share); ad plan scales from the selected revenue plan by Ozon benchmark DRR.',
        'WB review spend uses WB Finance API detailed deduction rows where sellerOperName is review write-off; cashbackAmount is retained only as a control field.',
        'WB Promotion finance deduction rows are retained as audit fields only; daily Smart-Sale advertising fact uses WB Promotion API plus the IU control/external correction layer because finance deductions are accrual rows and do not match daily cabinet facts.',
        'WB IU/DRR logic: raw WB API sales and ad spend are audited against the IU control workbook; when a control date exists, the rendered WB metric uses the Smart-Sale control workbook values.',
        'WB marketing plan uses the uploaded control workbook plan spend/rate when available; the contract fallback is used only when the workbook has no control row. ordersRevenueWb is retained as a report-control field, not as a separate contract denominator.',
        'WB quarter summary combines report workbook sales/orders with March-April DRR rows and the current May daily IU/DRR layer. DRR by contract uses sales/buyouts; the control advertising percentage uses orders revenue.',
        'ИУ по обороту в workbook сверяется по WB; Ozon ведётся отдельным финансовым контуром по логике workbook "Расчет показателей ИУ.xlsx".',
        'Yandex Market revenue and funnel are taken from platform_trends sales funnel; ad spend is not present in that source and remains separate until a spend API/source is connected.',
        'ДРР и каналы рекламы считаются по WB; Ozon and Yandex are shown as platform contours with their own source availability.',
        'Каналы без источника показываются нулем до подключения отдельного источника.'
      ]
    }
  };
}

function writeOutputs(payload, options) {
  const files = [];
  if (options.outputDir) {
    const outputPath = path.join(options.outputDir, 'iu_drr_summary.json');
    writeJson(outputPath, payload);
    files.push(outputPath);
  }
  if (options.mirrorLocalFallback && options.mirrorDataDir) {
    const mirrorPath = path.join(options.mirrorDataDir, 'iu_drr_summary.json');
    const outputPath = options.outputDir ? path.resolve(options.outputDir, 'iu_drr_summary.json') : '';
    if (path.resolve(mirrorPath) !== outputPath) {
      writeJson(mirrorPath, payload);
      files.push(mirrorPath);
    }
  }
  return files;
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const payload = await buildPayload(options);
  const writtenFiles = options.dryRun ? [] : writeOutputs(payload, options);
  const currentMonthKey = payload.kpis?.monthKey || '';
  const ozonPlanMonthForLog = (payload.ozonPlan?.monthly || []).find((month) => month.monthKey === currentMonthKey)
    || (payload.ozonPlan?.monthly || []).find((month) => month.monthKey === '2026-05')
    || {};
  console.log(JSON.stringify({
    dryRun: options.dryRun,
    asOfDate: payload.asOfDate,
    window: payload.window,
    currentMonth: currentMonthKey,
    revenueFact: payload.kpis?.iuRevenueFactToDate || 0,
    spendFact: payload.kpis?.spendFact || 0,
    drrWb: payload.kpis?.drrWb ?? null,
    ozonFinance: {
      status: payload.ozonFinance?.status || '',
      sourceMode: payload.ozonFinance?.source?.sourceMode || '',
      apiRowCount: payload.ozonFinance?.source?.apiRowCount || 0,
      fetchedRows: payload.ozonFinance?.source?.fetchedRows || 0,
      sourceRows: payload.ozonFinance?.source?.sourceRows || 0,
      accruedNet: payload.ozonFinance?.totals?.accruedNet || 0,
      sellerUiAccruedNet: payload.ozonFinance?.control?.sellerUiAccruedNet ?? null,
      deltaToSellerUi: payload.ozonFinance?.control?.deltaToSellerUi ?? null
    },
    ozonPlan: {
      status: payload.ozonPlan?.status || '',
      planFile: payload.ozonPlan?.source?.planFile || '',
      mayTarget: payload.ozonPlan?.monthlyTargets?.['2026-05'] || 0,
      smartGmv: ozonPlanMonthForLog.allocation?.smartAllocatedGmv || 0,
      smartAds: ozonPlanMonthForLog.allocation?.smartAllocatedAds || 0,
      bothAccountsAds: ozonPlanMonthForLog.allocation?.totalAds || ozonPlanMonthForLog.totals?.ads || 0,
      smartShareAds: ozonPlanMonthForLog.allocation?.smartAllocatedAds || 0
    },
    dailyRows: payload.daily.length,
    writtenFiles
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
