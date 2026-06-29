#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const XLSX = require('xlsx');

const DEFAULT_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1isYJavBkZWId5WZsu1zTo1dLNhs6Kf4FfB7Isx2eaWA/edit?gid=2003059667#gid=2003059667';
const DEFAULT_SOURCE_GID = '2003059667';
const DEFAULT_SOURCE_REFRESH = '09:00 Europe/Moscow';
const DEFAULT_PORTAL_REFRESH = '10:00 Europe/Moscow';
const DEFAULT_BRAND = 'Алтея';
const DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw';
const SNAPSHOT_TABLE = 'portal_data_snapshots';
const SNAPSHOT_SOURCE = 'google-sheets-bridge';
const SNAPSHOT_KEYS = [
  'dashboard',
  'skus',
  'platform_trends',
  'logistics',
  'loyalty_system',
  'warehouse_stock_overlay',
  'ads_summary',
  'iu_drr_summary',
  'wb_feedbacks_summary',
  'wb_sales_funnel_report',
  'ozon_feedbacks_summary',
  'wb_substitution_traffic',
  'wb_substitution_traffic_history'
];
const REQUIRED_SOURCE_SHEETS = {
  dimSku: ['dim_sku'],
  skuAliases: ['dim_sku_aliases', 'sku_aliases', 'api_sku_aliases', 'sku_api_aliases'],
  factMarketplace: ['fact_marketplace_daily_sku'],
  factAds: ['fact_ads_daily_sku'],
  factLogistics: ['fact_logistics_daily_cluster_warehouse_sku', 'fact_logistics_daily_cluster_wa'],
  dimWarehouse: ['dim_warehouse'],
  loyaltySystem: [
    'loyalty_system',
    'fact_loyalty_daily_sku',
    'loyalty_daily',
    'system_loyalty',
    'loyalty',
    'bonus_program',
    '\u0421\u0438\u0441\u0442\u0435\u043c\u0430 \u043b\u043e\u044f\u043b\u044c\u043d\u043e\u0441\u0442\u0438',
    '\u041b\u043e\u044f\u043b\u044c\u043d\u043e\u0441\u0442\u044c',
    '\u041b\u043e\u044f\u043b\u044c\u043d\u043e\u0441\u0442\u044c WB',
    '\u0411\u043e\u043d\u0443\u0441\u044b',
    '\u0411\u0430\u043b\u043b\u044b'
  ]
};
const PLATFORM_ORDER = ['wb', 'ozon', 'ya', 'all'];
const PLATFORM_LABELS = {
  wb: 'WB',
  ozon: 'Ozon',
  ya: 'Я.Маркет',
  all: 'Все площадки'
};
const MONTH_PREFIX = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABEL_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const CHROME_CANDIDATES = [
  process.env.ALTEA_CHROME_PATH || '',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
].filter(Boolean);

function parseArgs(argv) {
  const args = {
    command: 'sync',
    dryRun: false,
    initAuth: false,
    mirrorLocalFallback: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--') && index === 2) {
      args.command = token;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--init-auth') {
      args.initAuth = true;
      continue;
    }
    if (token === '--mirror-local-fallback') {
      args.mirrorLocalFallback = true;
      args['mirror-local-fallback'] = true;
      continue;
    }
    if (token === '--no-mirror-local-fallback') {
      args.mirrorLocalFallback = false;
      args['mirror-local-fallback'] = false;
      continue;
    }
    if (token === '--skip-upload') {
      args.skipUpload = true;
      args['skip-upload'] = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const hasSeparateValue = inlineValue === undefined && argv[index + 1] && !String(argv[index + 1]).startsWith('--');
    const nextValue = inlineValue !== undefined ? inlineValue : hasSeparateValue ? argv[index + 1] : true;
    if (hasSeparateValue) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function cwdJoin(...parts) {
  return path.join(process.cwd(), ...parts);
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readOptionalJson(filePath) {
  if (!filePath) return null;
  try {
    return fs.existsSync(filePath) ? readJson(filePath) : null;
  } catch (error) {
    console.warn(`Optional JSON skipped: ${filePath}: ${error.message}`);
    return null;
  }
}

function readOptionalSnapshotJson(filePath) {
  try {
    return filePath && fs.existsSync(filePath) ? readJson(filePath) : null;
  } catch (error) {
    console.warn(`Snapshot fallback skipped: ${filePath}: ${error.message}`);
    return null;
  }
}

function countRussianLetters(value) {
  let count = 0;
  for (const char of String(value || '')) {
    const code = char.charCodeAt(0);
    if (code === 0x401 || code === 0x451 || (code >= 0x410 && code <= 0x44F)) count += 1;
  }
  return count;
}

function countMojibakeMarkers(value) {
  let count = 0;
  for (const char of String(value || '')) {
    const code = char.charCodeAt(0);
    if ((code >= 0x402 && code <= 0x40F) || (code >= 0x452 && code <= 0x45F)) count += 1;
  }
  return count;
}

const CP1251_EXTENDED_CHARS =
  '\u0402\u0403\u201a\u0453\u201e\u2026\u2020\u2021\u20ac\u2030\u0409\u2039\u040a\u040c\u040b\u040f' +
  '\u0452\u2018\u2019\u201c\u201d\u2022\u2013\u2014\ufffd\u2122\u0459\u203a\u045a\u045c\u045b\u045f' +
  '\u00a0\u040e\u045e\u0408\u00a4\u0490\u00a6\u00a7\u0401\u00a9\u0404\u00ab\u00ac\u00ad\u00ae\u0407' +
  '\u00b0\u00b1\u0406\u0456\u0491\u00b5\u00b6\u00b7\u0451\u2116\u0454\u00bb\u0458\u0405\u0455\u0457' +
  '\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f' +
  '\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f' +
  '\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f' +
  '\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f';

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
  if (typeof value !== 'string' || !value) return value;
  try {
    const bytes = encodeCp1251Bytes(value);
    if (!bytes) return value;
    const repaired = Buffer.from(bytes).toString('utf8');
    if (!repaired || repaired === value) return value;
    const markerBefore = countMojibakeMarkers(value);
    const markerAfter = countMojibakeMarkers(repaired);
    const russianBefore = countRussianLetters(value);
    const russianAfter = countRussianLetters(repaired);
    if (markerAfter < markerBefore || (markerBefore > 0 && russianAfter >= russianBefore - markerBefore)) {
      return repaired;
    }
  } catch (_error) {
    return value;
  }
  return value;
}

function repairBrokenUtf8Cp1251Deep(value) {
  if (Array.isArray(value)) return value.map((item) => repairBrokenUtf8Cp1251Deep(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, repairBrokenUtf8Cp1251Deep(item)])
    );
  }
  return repairBrokenUtf8Cp1251String(value);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = repairBrokenUtf8Cp1251Deep(value);
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8');
}

function resolveBooleanOption(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function findChromeExecutable() {
  return CHROME_CANDIDATES.find((candidate) => {
    try {
      return candidate && fs.existsSync(candidate);
    } catch (_error) {
      return false;
    }
  }) || '';
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

const OWNER_CANONICAL_NAMES = new Map([
  ['алексей', 'Алексей'],
  ['александр', 'Питайкин Артём'],
  ['анна', 'Пирогова Анна'],
  ['артем', 'Питайкин Артём'],
  ['артём', 'Питайкин Артём'],
  ['дария', 'Молодякова Дария'],
  ['дарья', 'Молодякова Дария'],
  ['даша', 'Молодякова Дария'],
  ['екатерина', 'Доможирова Екатерина'],
  ['кирилл', 'Кирилл'],
  ['максим', 'Лапыгин Максим'],
  ['ксения', 'Ксения'],
  ['мария', 'Васильева Мария'],
  ['олеся', 'Олеся'],
  ['светлана', 'Светлана']
]);

const OWNER_NAME_ALIASES = new Map([
  ['александр озон', 'Питайкин Артём'],
  ['питайкин артем', 'Питайкин Артём'],
  ['питайкин артём', 'Питайкин Артём'],
  ['молодякова дария', 'Молодякова Дария'],
  ['молодякова дарья', 'Молодякова Дария'],
  ['анна пирогова', 'Пирогова Анна'],
  ['пирогова анна', 'Пирогова Анна'],
  ['екатерина доброжирова', 'Доможирова Екатерина'],
  ['екатерина доможирова', 'Доможирова Екатерина'],
  ['доможирова екатерина', 'Доможирова Екатерина'],
  ['доброжирова екатерина', 'Доможирова Екатерина'],
  ['васильева мария', 'Васильева Мария'],
  ['лапыгин максим', 'Лапыгин Максим'],
  ['максим лапыгин', 'Лапыгин Максим'],
  ['мария васильева', 'Васильева Мария'],
  ['мария васильевна', 'Васильева Мария'],
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
  if (OWNER_NAME_ALIASES.has(lowered)) return OWNER_NAME_ALIASES.get(lowered);
  if (OWNER_CANONICAL_NAMES.has(lowered)) return OWNER_CANONICAL_NAMES.get(lowered);
  const [firstToken = ''] = normalized.split(' ');
  const firstTokenLowered = firstToken.toLowerCase();
  if (OWNER_CANONICAL_NAMES.has(firstTokenLowered)) return OWNER_CANONICAL_NAMES.get(firstTokenLowered);
  return normalized;
}

function isActualSkuStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === 'актуальный' || normalized === 'актуально';
}

function shouldReplaceGenericOwnerName(currentOwnerName = '', sheetStatus = '') {
  return isActualSkuStatus(sheetStatus) && canonicalOwnerName(currentOwnerName) === 'Олеся';
}

function primaryOwnerName(ownersByPlatform = {}) {
  return canonicalOwnerName(
    ownersByPlatform.wb
    || ownersByPlatform.ozon
    || ownersByPlatform.ym
    || ownersByPlatform.letu
    || ownersByPlatform.ga
    || ownersByPlatform.mm
    || ''
  );
}

function normalizeOwnerPlatformKey(platform = '') {
  const normalized = String(platform || '').trim().toLowerCase();
  if (normalized === 'ya' || normalized === 'yandex' || normalized === 'yandex_market' || normalized === 'market') return 'ym';
  return normalized;
}

function skuOwnerForPlatform(sku, platform = '') {
  const key = normalizeOwnerPlatformKey(platform);
  const byPlatform = sku?.ownersByPlatform || sku?.owner?.byPlatform || {};
  const platformOwner = key === 'ym'
    ? (byPlatform.ym || byPlatform.ya || '')
    : (byPlatform[key] || '');
  return canonicalOwnerName(platformOwner || sku?.owner?.name || '');
}

function hasText(value) {
  return normalizeText(value).length > 0;
}

function numberOrZero(value) {
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value) {
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sum(values) {
  return values.reduce((total, value) => total + numberOrZero(value), 0);
}

function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const usShortMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (usShortMatch) {
    const [, monthRaw, dayRaw, yearRaw] = usShortMatch;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${String(Number(monthRaw)).padStart(2, '0')}-${String(Number(dayRaw)).padStart(2, '0')}`;
  }
  const ruShortMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (ruShortMatch) {
    const [, dayRaw, monthRaw, yearRaw] = ruShortMatch;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${String(Number(monthRaw)).padStart(2, '0')}-${String(Number(dayRaw)).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
}

function latestDateOf(values) {
  return values
    .map(isoDate)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || '';
}

function monthKeyFromDate(dateValue) {
  const date = new Date(`${isoDate(dateValue)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 7);
}

function monthLabelRu(dateValue) {
  const date = new Date(`${isoDate(dateValue)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return MONTH_LABEL_RU[date.getUTCMonth()];
}

function monthPrefixForDate(dateValue) {
  const date = new Date(`${isoDate(dateValue)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return MONTH_PREFIX[date.getUTCMonth()];
}

function formatFactCardLabel(dateValue) {
  const date = new Date(`${isoDate(dateValue)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Факт по данным Google Sheets, шт.';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `Факт 01-${day}.${month}, шт.`;
}

const DASHBOARD_MONTH_LABEL_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function dashboardMonthLabelRu(dateValue) {
  const date = new Date(`${isoDate(dateValue)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return DASHBOARD_MONTH_LABEL_RU[date.getUTCMonth()];
}

function dashboardRangeLabel(dateValue) {
  const date = new Date(`${isoDate(dateValue)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `01-${day}.${month}`;
}

function buildCanonicalDashboardCards({
  skus,
  assignedSku,
  totalStock,
  stockDate,
  latestMarketplaceDate,
  factUnits,
  companyPlanSlice
}) {
  const skuCount = Array.isArray(skus) ? skus.length : 0;
  const rangeLabel = dashboardRangeLabel(latestMarketplaceDate);
  const monthLabel = dashboardMonthLabelRu(latestMarketplaceDate);
  const cards = [];
  const seen = new Set();
  const add = (card) => {
    const id = normalizeKey(card.id || card.key || card.label);
    if (!id || seen.has(id)) return;
    seen.add(id);
    cards.push({ ...card, id, metricId: card.metricId || id });
  };

  add({
    id: 'sku-registry-total',
    label: 'SKU в базе',
    value: skuCount,
    hint: 'Канонический SKU/owner-реестр.'
  });
  add({
    id: 'owner-assigned',
    label: 'Закреплено за owner',
    value: assignedSku,
    hint: 'Owner берется из канонического SKU/owner-реестра.'
  });
  add({
    id: 'owner-unassigned',
    label: 'Без owner',
    value: Math.max(0, skuCount - assignedSku),
    hint: 'Неразнесенные SKU остаются видимыми в quarantine/unallocated.'
  });
  add({
    id: 'marketplace-stock-total',
    label: 'Остатки MP, шт.',
    value: totalStock,
    hint: `Складской слой WB/Ozon/Yandex на ${stockDate || latestMarketplaceDate || 'последнюю доступную дату'}.`
  });
  add({
    id: 'marketplace-fact-units',
    label: rangeLabel ? `Факт ${rangeLabel}, шт.` : 'Факт, шт.',
    value: factUnits,
    hint: `Факт WB/Ozon/Yandex из platform_trends.json на ${latestMarketplaceDate || 'последнюю доступную дату'}.`
  });

  if (companyPlanSlice) {
    add({
      id: 'company-plan-revenue',
      label: `План компании ${companyPlanSlice.label || monthLabel || companyPlanSlice.monthKey}, ₽`,
      value: companyPlanSlice.planRevenueMonth,
      format: 'money',
      period: companyPlanSlice.monthKey,
      hint: 'План выручки берется только из company_plan.json.'
    });
    add({
      id: 'company-fact-revenue',
      label: rangeLabel ? `Факт компании ${rangeLabel}, ₽` : 'Факт компании, ₽',
      value: companyPlanSlice.factRevenueToDate,
      format: 'money',
      period: latestMarketplaceDate,
      hint: 'Факт выручки берется только из platform_trends.json.'
    });
    add({
      id: 'company-plan-completion',
      label: 'Выполнение компании к плану',
      value: companyPlanSlice.completionToDatePct,
      valuePct: companyPlanSlice.completionToDatePct,
      format: 'pct',
      period: latestMarketplaceDate,
      hint: 'Факт из platform_trends.json / линейный план из company_plan.json.'
    });
    add({
      id: 'company-forecast-vs-plan',
      label: 'Прогноз / план',
      value: companyPlanSlice.forecastPct,
      valuePct: companyPlanSlice.forecastPct,
      format: 'pct',
      period: companyPlanSlice.monthKey,
      hint: 'Прогноз построен из факта platform_trends.json и месячного плана company_plan.json.'
    });
  }

  return cards;
}

function normalizeMarketplace(value) {
  const raw = normalizeKey(value)
    .replaceAll('.', '')
    .replaceAll('_', '')
    .replaceAll('-', '');
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['oz', 'ozon'].includes(raw)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'yandexmarket', 'ям'].includes(raw)) return 'ya';
  return '';
}

function marginForSku(sku, platformKey) {
  if (!sku || !platformKey) return 0;
  return numberOrZero(sku?.[platformKey]?.marginPct);
}

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function requiredSheetRows(workbook, sheetName) {
  const candidates = Array.isArray(sheetName) ? sheetName : [sheetName];
  const resolvedName = candidates.find((name) => workbook.Sheets[name]);
  const sheet = resolvedName ? workbook.Sheets[resolvedName] : null;
  if (!sheet) throw new Error(`В workbook нет листа ${(candidates.filter(Boolean).join(' / ') || 'unknown')}`);
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
}

function optionalSheetRows(workbook, sheetName) {
  const candidates = Array.isArray(sheetName) ? sheetName : [sheetName];
  const resolvedName = candidates.find((name) => workbook.Sheets[name]);
  const sheet = resolvedName ? workbook.Sheets[resolvedName] : null;
  if (!sheet) return { name: '', rows: [] };
  return {
    name: resolvedName,
    rows: XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })
  };
}

function loyaltySheetCandidates(options = {}) {
  const configuredName = normalizeText(options.loyaltySheetName || '');
  return [
    configuredName,
    ...REQUIRED_SOURCE_SHEETS.loyaltySystem
  ].filter(Boolean);
}

function parseWorkbook(buffer, options = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const loyaltySystemSource = optionalSheetRows(workbook, loyaltySheetCandidates(options));
  const skuAliasesSource = optionalSheetRows(workbook, REQUIRED_SOURCE_SHEETS.skuAliases);
  return {
    dimSku: requiredSheetRows(workbook, REQUIRED_SOURCE_SHEETS.dimSku),
    skuAliases: skuAliasesSource.rows,
    skuAliasesSource,
    factMarketplace: requiredSheetRows(workbook, REQUIRED_SOURCE_SHEETS.factMarketplace),
    factAds: requiredSheetRows(workbook, REQUIRED_SOURCE_SHEETS.factAds),
    factLogistics: requiredSheetRows(workbook, REQUIRED_SOURCE_SHEETS.factLogistics),
    dimWarehouse: requiredSheetRows(workbook, REQUIRED_SOURCE_SHEETS.dimWarehouse),
    loyaltySystem: loyaltySystemSource.rows,
    loyaltySystemSource,
    sourceMeta: {
      sheetNames: {
        loyalty_system: loyaltySystemSource.name,
        dim_sku_aliases: skuAliasesSource.name
      },
      warnings: loyaltySystemSource.name ? [] : ['loyalty_system sheet is optional and was not found in the workbook export']
    }
  };
}

function parseCsvRows(csvText) {
  const workbook = XLSX.read(csvText, { type: 'string' });
  const [firstSheetName = 'Sheet1'] = workbook.SheetNames;
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
}

function looksBrokenDimSkuRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) return false;
  const values = Object.values(rows[0] || {})
    .map((value) => normalizeText(value))
    .filter(Boolean);
  return values.some((value) => /^#REF!?$/i.test(value));
}

function extractSheetGidsFromHtml(html) {
  const gidMap = new Map();
  const matcher = /\[\d+,0,\\"(\d+)\\",\[\{\\"1\\":\[\[0,0,\\"([^\\"]+)\\"/g;
  let match;
  while ((match = matcher.exec(String(html || '')))) {
    const [, gid, sheetName] = match;
    if (gid && sheetName && !gidMap.has(sheetName)) gidMap.set(sheetName, gid);
  }
  return gidMap;
}

async function fetchDirectWorkbook(exportUrl) {
  const response = await fetch(exportUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Direct export failed with HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function initAuthSession(options) {
  fs.mkdirSync(options.profileDir, { recursive: true });
  const chromePath = findChromeExecutable();
  if (chromePath) {
    console.log('');
    console.log('Откроется обычный Google Chrome с отдельным профилем для авторизации Google Sheets.');
    console.log('1. Войдите в Google в открывшемся окне.');
    console.log('2. Убедитесь, что нужная таблица открылась.');
    console.log('3. После этого просто закройте окно браузера.');
    const chromeArgs = [
      `--user-data-dir=${options.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      options.sheetUrl
    ];
    await new Promise((resolve, reject) => {
      const child = spawn(chromePath, chromeArgs, {
        cwd: process.cwd(),
        stdio: 'ignore'
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code && code !== 0) {
          reject(new Error(`Chrome auth session exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
    return;
  }

  const browser = await chromium.launchPersistentContext(options.profileDir, {
    headless: false,
    channel: 'chrome'
  });
  const page = await browser.newPage();
  await page.goto(options.sheetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  console.log('');
  console.log('Открылся отдельный Chrome-профиль для авторизации Google Sheets.');
  console.log('1. Войдите в Google в открывшемся окне.');
  console.log('2. Убедитесь, что нужная таблица открылась.');
  console.log('3. После этого закройте окно браузера.');
  await browser.waitForEvent('close');
}

async function fetchWorkbookViaBrowserAuth(options) {
  const browser = await chromium.launchPersistentContext(options.profileDir, {
    headless: true,
    channel: 'chrome'
  });
  const page = await browser.newPage();
  try {
    await page.goto(options.sheetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    const currentUrl = page.url();
    const title = await page.title();
    if (/accounts\.google\.com/i.test(currentUrl) || /вход/i.test(title)) {
      throw new Error('Google-авторизация для sync-профиля не настроена. Запустите `npm run portal:sheet-auth` один раз и войдите в Google.');
    }
    const response = await browser.request.get(options.exportUrl, {
      failOnStatusCode: false
    });
    if (!response.ok()) {
      throw new Error(`Google export returned HTTP ${response.status()}`);
    }
    return Buffer.from(await response.body());
  } finally {
    await browser.close();
  }
}

async function fetchSheetRowsViaBrowserAuth(options) {
  const browser = await chromium.launchPersistentContext(options.profileDir, {
    headless: true,
    channel: 'chrome'
  });
  const page = await browser.newPage();
  try {
    await page.goto(options.sheetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    const currentUrl = page.url();
    const title = await page.title();
    if (/accounts\.google\.com/i.test(currentUrl) || /вход/i.test(title)) {
      throw new Error('Google-авторизация для sync-профиля не настроена. Запустите `npm run portal:sheet-auth` один раз и войдите в Google.');
    }

    const htmlResponse = await browser.request.get(options.sheetUrl, {
      failOnStatusCode: false,
      timeout: 120000
    });
    if (!htmlResponse.ok()) {
      throw new Error(`Google edit page returned HTTP ${htmlResponse.status()}`);
    }

    const gidMap = extractSheetGidsFromHtml(await htmlResponse.text());
    const baseExportUrl = String(options.sheetUrl).replace(/\/edit.*$/, '');

    function resolveSheetTarget(candidates, label) {
      const names = Array.isArray(candidates) ? candidates : [candidates];
      const resolvedName = names.find((name) => gidMap.has(name));
      if (!resolvedName) {
        throw new Error(`Не удалось найти gid для листа ${label || names.join(', ')}`);
      }
      return { name: resolvedName, gid: gidMap.get(resolvedName) };
    }

    async function fetchCsvRows(candidates, label) {
      const target = resolveSheetTarget(candidates, label);
      const response = await browser.request.get(
        `${baseExportUrl}/export?format=csv&gid=${encodeURIComponent(target.gid)}`,
        { failOnStatusCode: false, timeout: 120000 }
      );
      if (!response.ok()) {
        throw new Error(`CSV export for ${target.name} returned HTTP ${response.status()}`);
      }
      const csvText = await response.text();
      return { ...target, rows: parseCsvRows(csvText) };
    }

    async function fetchOptionalCsvRows(candidates, targetOptions = {}) {
      const names = Array.isArray(candidates) ? candidates : [candidates];
      const explicitGid = normalizeText(targetOptions.gid || '');
      if (explicitGid) {
        const resolvedName = names.find((name) => gidMap.get(name) === explicitGid) || normalizeText(targetOptions.name || '') || `gid:${explicitGid}`;
        const response = await browser.request.get(
          `${baseExportUrl}/export?format=csv&gid=${encodeURIComponent(explicitGid)}`,
          { failOnStatusCode: false, timeout: 120000 }
        );
        if (!response.ok()) return { name: resolvedName, gid: explicitGid, rows: [] };
        const csvText = await response.text();
        return { name: resolvedName, gid: explicitGid, rows: parseCsvRows(csvText) };
      }
      const resolvedName = names.find((name) => gidMap.has(name));
      if (!resolvedName) return { name: '', gid: '', rows: [] };
      const gid = gidMap.get(resolvedName);
      const response = await browser.request.get(
        `${baseExportUrl}/export?format=csv&gid=${encodeURIComponent(gid)}`,
        { failOnStatusCode: false, timeout: 120000 }
      );
      if (!response.ok()) return { name: resolvedName, gid, rows: [] };
      const csvText = await response.text();
      return { name: resolvedName, gid, rows: parseCsvRows(csvText) };
    }

    const dimSkuSource = await fetchCsvRows(REQUIRED_SOURCE_SHEETS.dimSku, 'dim_sku');
    const factLogisticsSource = await fetchCsvRows(REQUIRED_SOURCE_SHEETS.factLogistics, 'fact_logistics_daily_cluster_warehouse_sku');
    const dimWarehouseSource = await fetchCsvRows(REQUIRED_SOURCE_SHEETS.dimWarehouse, 'dim_warehouse');
    const skuAliasesSource = await fetchOptionalCsvRows(REQUIRED_SOURCE_SHEETS.skuAliases);
    const loyaltySystemSource = await fetchOptionalCsvRows(loyaltySheetCandidates(options), {
      gid: options.loyaltySheetGid,
      name: options.loyaltySheetName
    });

    const warnings = [];
    if (!loyaltySystemSource.name) {
      warnings.push('loyalty_system sheet is optional and was not found in the Google workbook');
    }
    let dimSkuRows = dimSkuSource.rows;
    if (looksBrokenDimSkuRows(dimSkuRows)) {
      warnings.push('dim_sku returned #REF! in Google export; keeping local skus.json overlay for owners and contour metadata');
      dimSkuRows = [];
    }

    return {
      dimSku: dimSkuRows,
      skuAliases: skuAliasesSource.rows,
      skuAliasesSource,
      factLogistics: factLogisticsSource.rows,
      dimWarehouse: dimWarehouseSource.rows,
      loyaltySystem: loyaltySystemSource.rows,
      loyaltySystemSource,
      sourceMeta: {
        mode: 'google-csv-tabs',
        gids: {
          dim_sku: dimSkuSource.gid,
          dim_sku_aliases: skuAliasesSource.gid,
          fact_logistics_daily_cluster_warehouse_sku: factLogisticsSource.gid,
          dim_warehouse: dimWarehouseSource.gid,
          loyalty_system: loyaltySystemSource.gid
        },
        sheetNames: {
          dim_sku_aliases: skuAliasesSource.name,
          loyalty_system: loyaltySystemSource.name
        },
        warnings
      }
    };
  } finally {
    await browser.close();
  }
}

function resolveInputBuffer(options) {
  if (options.inputJson) {
    const json = readJson(options.inputJson);
    return { kind: 'json', rows: json };
  }
  if (options.inputXlsx) {
    return { kind: 'xlsx', buffer: fs.readFileSync(options.inputXlsx) };
  }
  return null;
}

function looseRowValue(row = {}, aliases = []) {
  const entries = Object.entries(row || {});
  const normalizedAliases = aliases.map((alias) => normalizeKey(alias)).filter(Boolean);
  for (const [key, value] of entries) {
    if (normalizedAliases.includes(normalizeKey(key)) && hasText(value)) return normalizeText(value);
  }
  for (const [key, value] of entries) {
    const normalizedKey = normalizeKey(key);
    if (hasText(value) && normalizedAliases.some((alias) => normalizedKey.includes(alias) || alias.includes(normalizedKey))) {
      return normalizeText(value);
    }
  }
  return '';
}

function strictRowValue(row = {}, aliases = []) {
  const entries = Object.entries(row || {});
  const normalizedAliases = aliases.map((alias) => normalizeKey(alias)).filter(Boolean);
  for (const [key, value] of entries) {
    if (normalizedAliases.includes(normalizeKey(key)) && hasText(value)) return normalizeText(value);
  }
  return '';
}

function normalizeSkuAliasPlatform(value = '') {
  const normalized = normalizeKey(value)
    .replaceAll('.', '')
    .replaceAll('_', '')
    .replaceAll('-', '');
  if (['wb', 'wildberries', 'wildberry'].includes(normalized)) return 'wb';
  if (['oz', 'ozon'].includes(normalized)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'yandexmarket'].includes(normalized)) return 'ym';
  if (['ga', 'goldapple', 'zolotoeyabloko', 'zy'].includes(normalized)) return 'ga';
  if (['letu', 'letual', 'letoile'].includes(normalized)) return 'letu';
  if (['megamarket', 'mega', 'sbermegamarket'].includes(normalized)) return 'megamarket';
  if (['samokat'].includes(normalized)) return 'samokat';
  if (['mm', 'magnit', 'magnitmarket'].includes(normalized)) return 'mm';
  return normalized || 'all';
}

function splitSkuAliases(value = '') {
  return normalizeText(value)
    .split(/[\n;,|]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readSkuAliasRows(options = {}) {
  const payload = readOptionalJson(options.skuAliasJson);
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.aliases)) return payload.aliases;
  if (payload.aliases && typeof payload.aliases === 'object') {
    return Object.entries(payload.aliases).flatMap(([targetSku, aliases]) => {
      if (Array.isArray(aliases)) return aliases.map((alias) => ({ targetSku, ...(typeof alias === 'object' ? alias : { alias }) }));
      if (aliases && typeof aliases === 'object') return Object.entries(aliases).map(([platform, alias]) => ({ targetSku, platform, alias }));
      return [{ targetSku, alias: aliases }];
    });
  }
  return [];
}

function normalizeSkuAliasRows(sheetRows = [], localRows = []) {
  const result = [];
  const seen = new Set();
  const addAlias = (row, source, platformHint = '', aliasValue = '') => {
    const status = looseRowValue(row, ['status', 'enabled', 'active', 'is_active']);
    if (/^(0|false|no|нет|off|disabled|ignore|skip)$/i.test(status)) return;
    const targetSku = looseRowValue(row, [
      'target_sku',
      'target',
      'portal_sku',
      'main_sku',
      'our_sku',
      'article_key',
      'articlekey',
      'sku'
    ]);
    const platform = normalizeSkuAliasPlatform(platformHint || looseRowValue(row, ['platform', 'marketplace', 'source_platform']));
    const aliases = splitSkuAliases(aliasValue || strictRowValue(row, [
      'api_sku',
      'api_article',
      'alias',
      'source_sku',
      'marketplace_sku',
      'external_sku',
      'offer_id',
      'offerid',
      'vendor_code',
      'vendorcode',
      'nm_id',
      'nmid'
    ]));
    if (!targetSku || !aliases.length) return;
    aliases.forEach((alias) => {
      const key = `${normalizeKey(targetSku)}|${platform}|${normalizeKey(alias)}`;
      if (!normalizeKey(alias) || seen.has(key)) return;
      seen.add(key);
      result.push({
        targetSku,
        alias,
        platform,
        source,
        note: looseRowValue(row, ['note', 'comment', 'name', 'title'])
      });
    });
  };

  const columnAliases = [
    ['wb', ['api_wb', 'wb_alias', 'wb_sku', 'wildberries_sku', 'wildberries_alias']],
    ['ozon', ['api_ozon', 'ozon_alias', 'ozon_sku', 'ozon_offer_id']],
    ['ym', ['api_ym', 'api_ya', 'ym_alias', 'ya_alias', 'yandex_alias', 'yandex_market_sku']],
    ['ga', ['api_ga', 'goldapple_alias', 'goldapple_sku', 'ga_sku']],
    ['letu', ['api_letu', 'letu_alias', 'letual_alias', 'letu_sku']],
    ['megamarket', ['api_megamarket', 'megamarket_alias', 'megamarket_sku']],
    ['samokat', ['api_samokat', 'samokat_alias', 'samokat_sku']],
    ['mm', ['api_mm', 'magnit_alias', 'magnit_market_sku', 'mm_sku']]
  ];

  [
    ...(Array.isArray(sheetRows) ? sheetRows.map((row) => ({ row, source: 'dim_sku_aliases' })) : []),
    ...(Array.isArray(localRows) ? localRows.map((row) => ({ row, source: 'sku_aliases.json' })) : [])
  ].forEach(({ row, source }) => {
    addAlias(row, source);
    columnAliases.forEach(([platform, aliases]) => {
      const value = strictRowValue(row, aliases);
      if (value) addAlias(row, source, platform, value);
    });
  });

  return result;
}

function applySkuAliases(skus = [], aliasRows = []) {
  const skuByToken = new Map();
  skus.forEach((sku, index) => {
    [sku.articleKey, sku.article, sku.sku, sku.vendorCode, sku.supplierArticle, sku.nmId, sku.nmID, sku.barcode]
      .forEach((value) => {
        const token = normalizeKey(value);
        if (token && !skuByToken.has(token)) skuByToken.set(token, index);
      });
  });

  const diagnostics = {
    sourceRows: aliasRows.length,
    appliedRows: 0,
    unmatchedTargetRows: 0,
    unmatchedTargets: []
  };
  const nextSkus = skus.map((sku) => deepClone(sku));

  aliasRows.forEach((aliasRow) => {
    const targetToken = normalizeKey(aliasRow.targetSku);
    const aliasToken = normalizeKey(aliasRow.alias);
    const skuIndex = skuByToken.get(targetToken);
    if (skuIndex === undefined || !aliasToken) {
      diagnostics.unmatchedTargetRows += 1;
      if (diagnostics.unmatchedTargets.length < 50) diagnostics.unmatchedTargets.push(aliasRow);
      return;
    }

    const sku = nextSkus[skuIndex];
    const platform = aliasRow.platform || 'all';
    const aliasPayload = {
      value: aliasRow.alias,
      platform,
      source: aliasRow.source || '',
      note: aliasRow.note || ''
    };
    const aliasKey = `${platform}|${aliasToken}`;
    sku.aliases = Array.isArray(sku.aliases) ? sku.aliases : [];
    const existingAliasKeys = new Set(sku.aliases.map((item) => {
      if (typeof item === 'string') return `all|${normalizeKey(item)}`;
      return `${item?.platform || 'all'}|${normalizeKey(item?.value || item?.alias || item?.sku || '')}`;
    }));
    if (!existingAliasKeys.has(aliasKey)) {
      sku.aliases.push(aliasPayload);
      diagnostics.appliedRows += 1;
    }
    if (platform !== 'all') {
      sku.platformAliases = sku.platformAliases || {};
      sku.platformAliases[platform] = Array.isArray(sku.platformAliases[platform]) ? sku.platformAliases[platform] : [];
      if (!sku.platformAliases[platform].some((value) => normalizeKey(value) === aliasToken)) {
        sku.platformAliases[platform].push(aliasRow.alias);
      }
    }
  });

  return { skus: nextSkus, diagnostics };
}

function buildSkuOverlay(baseSkus, dimSkuRows) {
  const dimByKey = new Map(
    dimSkuRows.map((row) => [normalizeKey(row.sku), row]).filter(([key]) => key)
  );
  let updatedCount = 0;
  const merged = baseSkus.map((item) => {
    const sheetRow = dimByKey.get(normalizeKey(item.articleKey || item.article));
    if (!sheetRow) return deepClone(item);
    updatedCount += 1;
    const next = deepClone(item);
    const ownersByPlatform = {
      wb: canonicalOwnerName(normalizeText(sheetRow.owner_wb)),
      ozon: canonicalOwnerName(normalizeText(sheetRow.owner_oz)),
      ym: canonicalOwnerName(normalizeText(sheetRow.owner_ym)),
      ga: canonicalOwnerName(normalizeText(sheetRow.owner_ga)),
      letu: canonicalOwnerName(normalizeText(sheetRow.owner_letu)),
      megamarket: canonicalOwnerName(normalizeText(sheetRow.owner_megamarket)),
      samokat: canonicalOwnerName(normalizeText(sheetRow.owner_samokat)),
      mm: canonicalOwnerName(normalizeText(sheetRow.owner_mm))
    };
    const categoriesByPlatform = {
      wb: normalizeText(sheetRow.catygory_wb),
      ozon: normalizeText(sheetRow.catygory_oz),
      ym: normalizeText(sheetRow.catygory_ym),
      ga: normalizeText(sheetRow.catygory_ga),
      letu: normalizeText(sheetRow.catygory_letu),
      megamarket: normalizeText(sheetRow.catygory_megamarket),
      samokat: normalizeText(sheetRow.catygory_samokat),
      mm: normalizeText(sheetRow.catygory_mm)
    };
    next.ownersByPlatform = ownersByPlatform;
    next.categoriesByPlatform = categoriesByPlatform;
    next.costPrice = numberOrNull(sheetRow.cost_price);
    next.sheetStatus = normalizeText(sheetRow.status);
    const currentOwnerName = canonicalOwnerName(next?.owner?.name || '');
    const nextOwnerName = shouldReplaceGenericOwnerName(currentOwnerName, next.sheetStatus)
      ? primaryOwnerName(ownersByPlatform)
      : currentOwnerName;
    next.owner = {
      ...(next.owner || {}),
      name: nextOwnerName,
      byPlatform: ownersByPlatform
    };
    return next;
  });
  return { skus: merged, updatedCount };
}

function portalSkuKeySet(skus) {
  return new Set(
    (Array.isArray(skus) ? skus : [])
      .map((item) => normalizeKey(item?.articleKey || item?.article))
      .filter(Boolean)
  );
}

function buildPlatformTrends(baseSkus, factRows, options) {
  const skuByKey = new Map(baseSkus.map((item) => [normalizeKey(item.articleKey || item.article), item]));
  const relevantSkuKeys = portalSkuKeySet(baseSkus);
  const buckets = new Map();
  for (const row of factRows) {
    const date = isoDate(row.date);
    const platform = normalizeMarketplace(row.marketplace);
    const skuKey = normalizeKey(row.item_code);
    if (!date || !platform || !skuKey || !relevantSkuKeys.has(skuKey)) continue;
    const sku = skuByKey.get(skuKey);
    const units = numberOrZero(row.sales_qty);
    const revenue = numberOrZero(row.revenue);
    const margin = revenue * marginForSku(sku, platform);
    const mapKey = `${platform}::${date}`;
    const current = buckets.get(mapKey) || { platform, date, units: 0, revenue: 0, estimatedMargin: 0 };
    current.units += units;
    current.revenue += revenue;
    current.estimatedMargin += margin;
    buckets.set(mapKey, current);
  }

  const dates = Array.from(new Set(Array.from(buckets.values()).map((item) => item.date))).sort().slice(-14);
  const latestDate = dates[dates.length - 1] || '';
  const latestIndex = dates.length - 1;

  const platformPayload = PLATFORM_ORDER.map((platformKey) => {
    const series = dates.map((date, index) => {
      if (platformKey === 'all') {
        const aggregated = ['wb', 'ozon', 'ya'].reduce((acc, key) => {
          const source = buckets.get(`${key}::${date}`);
          if (!source) return acc;
          acc.units += source.units;
          acc.revenue += source.revenue;
          acc.estimatedMargin += source.estimatedMargin;
          return acc;
        }, { units: 0, revenue: 0, estimatedMargin: 0 });
        return {
          dayOffset: latestIndex - index,
          label: date,
          units: Number(aggregated.units.toFixed(4)),
          revenue: Number(aggregated.revenue.toFixed(4)),
          estimatedMargin: Number(aggregated.estimatedMargin.toFixed(4))
        };
      }
      const source = buckets.get(`${platformKey}::${date}`) || { units: 0, revenue: 0, estimatedMargin: 0 };
      return {
        dayOffset: latestIndex - index,
        label: date,
        units: Number(source.units.toFixed(4)),
        revenue: Number(source.revenue.toFixed(4)),
        estimatedMargin: Number(source.estimatedMargin.toFixed(4))
      };
    });
    return {
      key: platformKey,
      label: PLATFORM_LABELS[platformKey],
      series
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    note: 'Последние ежедневные факты площадок пересчитаны из Google Sheets.',
    googleSheetsSourceUrl: options.sourceUrl,
    googleSheetsSourceGid: options.sourceGid,
    googleSheetsRefreshTimeLocal: options.sourceRefreshTimeLocal,
    portalRefreshTimeLocal: options.portalRefreshTimeLocal,
    latestMarketplaceDate: latestDate,
    platforms: platformPayload
  };
}

function refreshPlatformTrendsSnapshot(basePlatformTrends, options) {
  const next = deepClone(basePlatformTrends || {});
  const platforms = Array.isArray(next.platforms) ? next.platforms : [];
  const seriesDates = platforms.flatMap((platform) => (
    Array.isArray(platform?.series)
      ? platform.series.map((point) => isoDate(point?.label || point?.date)).filter(Boolean)
      : []
  ));
  const latestMarketplaceDate = normalizeText(next.latestMarketplaceDate || latestDateOf(seriesDates) || '');
  next.generatedAt = new Date().toISOString();
  next.portalRefreshTimeLocal = options.portalRefreshTimeLocal;
  if (latestMarketplaceDate) {
    next.latestMarketplaceDate = latestMarketplaceDate;
  }
  next.note = 'Marketplace facts refreshed from API-backed platform_trends.json.';
  return next;
}

function marketplaceFactsFromPlatformTrends(platformTrends) {
  const platforms = Array.isArray(platformTrends?.platforms) ? platformTrends.platforms : [];
  const platformMap = new Map(platforms.map((platform) => [normalizeKey(platform?.key), platform]));
  let series = Array.isArray(platformMap.get('all')?.series) ? platformMap.get('all').series : [];

  if (series.length) {
    series = series
      .map((point) => ({
        label: isoDate(point?.label || point?.date) || normalizeText(point?.label || point?.date),
        units: numberOrZero(point?.units),
        revenue: numberOrZero(point?.revenue)
      }))
      .filter((point) => Boolean(point.label));
  } else {
    const byDate = new Map();
    for (const platformKey of ['wb', 'ozon', 'ya']) {
      for (const point of platformMap.get(platformKey)?.series || []) {
        const label = isoDate(point?.label || point?.date);
        if (!label) continue;
        const current = byDate.get(label) || { label, units: 0, revenue: 0 };
        current.units += numberOrZero(point?.units);
        current.revenue += numberOrZero(point?.revenue);
        byDate.set(label, current);
      }
    }
    series = Array.from(byDate.values()).sort((left, right) => left.label.localeCompare(right.label));
  }

  const latestMarketplaceDate = normalizeText(platformTrends?.latestMarketplaceDate || series[series.length - 1]?.label || '');
  const monthKey = monthKeyFromDate(latestMarketplaceDate);
  const monthSeries = monthKey
    ? series.filter((point) => isoDate(point?.label || point?.date).startsWith(monthKey))
    : series;

  return {
    latestMarketplaceDate,
    monthKey,
    factUnits: sum(monthSeries.map((point) => point?.units)),
    factRevenue: sum(monthSeries.map((point) => point?.revenue)),
    source: 'platform_trends.json (API-backed)'
  };
}

function buildDashboardFromPlatformTrends(baseDashboard, skus, logisticsRows, options, platformTrendsSource = null) {
  const next = deepClone(baseDashboard);
  const relevantLogisticsRows = logisticsRows.filter((row) => normalizeKey(row.article) && row.article);
  const marketplaceFacts = marketplaceFactsFromPlatformTrends(platformTrendsSource);
  const latestLogisticsDate = latestDateOf(relevantLogisticsRows.map((row) => row.date));
  const latestMarketplaceDate = marketplaceFacts.latestMarketplaceDate || latestLogisticsDate || '';
  const monthKey = marketplaceFacts.monthKey || monthKeyFromDate(latestMarketplaceDate);
  const monthLabel = monthLabelRu(latestMarketplaceDate);
  const monthPrefix = monthPrefixForDate(latestMarketplaceDate);
  const latestDateObject = latestMarketplaceDate ? new Date(`${latestMarketplaceDate}T00:00:00Z`) : null;
  const currentYear = latestMarketplaceDate ? latestMarketplaceDate.slice(2, 4) : '';
  const dynamicPlanField = monthPrefix && currentYear ? `plan${monthPrefix[0].toUpperCase()}${monthPrefix.slice(1)}${currentYear}Units` : '';
  const configuredPlanField = next.brandSummary?.[0]?.google_sheets_plan_field || dynamicPlanField;
  const planField = [configuredPlanField, dynamicPlanField].find((field) => skus.some((item) => item?.planFact && field in item.planFact)) || configuredPlanField;
  const factUnits = marketplaceFacts.factUnits;
  const factRevenue = marketplaceFacts.factRevenue;
  const totalStock = sum(relevantLogisticsRows
    .filter((row) => isoDate(row.date) === latestLogisticsDate)
    .map((row) => numberOrZero(row.wb_stock) + numberOrZero(row.ozon_stock) + numberOrZero(row.yandex_stock)));
  const assignedSku = countAssignedSkus(skus);
  const planUnits = planField
    ? sum(skus.map((item) => item?.planFact?.[planField]))
    : numberOrZero(next.brandSummary?.[0]?.plan_units);
  const dayOfMonth = latestDateObject ? latestDateObject.getUTCDate() : 0;
  const daysInMonth = latestDateObject
    ? new Date(Date.UTC(latestDateObject.getUTCFullYear(), latestDateObject.getUTCMonth() + 1, 0)).getUTCDate()
    : 0;
  const linearPlanToDate = planUnits > 0 && dayOfMonth > 0 && daysInMonth > 0
    ? (planUnits / daysInMonth) * dayOfMonth
    : planUnits;
  const completion = linearPlanToDate > 0 ? factUnits / linearPlanToDate : 0;
  const companyPlanSlice = buildCompanyPlanSlice(options.companyPlan, monthKey, latestDateObject, factRevenue);

  next.generatedAt = new Date().toISOString();
  next.dataFreshness = {
    ...(next.dataFreshness || {}),
    asOfDate: latestMarketplaceDate,
    googleSheetsMonth: monthKey,
    googleSheetsSourceUrl: options.sourceUrl,
    googleSheetsSourceGid: options.sourceGid,
    googleSheetsBridge: 'scripts/portal-google-sheet-sync.js',
    googleSheetsRefreshTimeLocal: options.sourceRefreshTimeLocal,
    portalRefreshTimeLocal: options.portalRefreshTimeLocal,
    marketplaceFactSource: marketplaceFacts.source
  };
  next.asOfDate = latestMarketplaceDate;
  next.latestMarketplaceDate = latestMarketplaceDate;
  next.marketplaceFactSource = next.dataFreshness.marketplaceFactSource;

  const cards = Array.isArray(next.cards) ? next.cards.filter((card) => {
    const label = String(card?.label || '');
    const hint = String(card?.hint || '');
    const marketplaceLabel = label.includes('MP') || label.startsWith('Факт') || label.startsWith('План') || label.startsWith('Выполнение');
    const marketplaceHint = hint.includes('Google Sheets') || hint.includes('API');
    return !(marketplaceLabel && marketplaceHint);
  }) : [];
  cards.length = 0;
  replaceCard(cards, (card) => card.label === 'SKU РІ Р±Р°Р·Рµ', {
    label: 'SKU РІ Р±Р°Р·Рµ',
    value: skus.length,
    hint: 'Р’ РїРѕСЂС‚Р°Р» РїРѕРїР°Р» С‚РѕР»СЊРєРѕ Р±СЂРµРЅРґ РђР»С‚РµСЏ'
  });
  replaceCard(cards, (card) => card.label === 'Р—Р°РєСЂРµРїР»РµРЅРѕ Р·Р° owner', {
    label: 'Р—Р°РєСЂРµРїР»РµРЅРѕ Р·Р° owner',
    value: assignedSku,
    hint: 'РќР°С€Р»Рё Р·Р°РєСЂРµРїР»РµРЅРёРµ РІ СЂР°Р±РѕС‡РёС… СЂРµРµСЃС‚СЂР°С… Рё РµР¶РµРґРЅРµРІРЅРѕРј Google Sheets.'
  });
  replaceCard(cards, (card) => card.label === 'Р‘РµР· owner', {
    label: 'Р‘РµР· owner',
    value: Math.max(0, skus.length - assignedSku),
    hint: 'РќСѓР¶РЅРѕ РґРѕР·Р°РєСЂРµРїРёС‚СЊ РІСЂСѓС‡РЅСѓСЋ'
  });
  replaceCard(cards, (card) => card.label === 'РћСЃС‚Р°С‚РєРё MP, С€С‚.', {
    label: 'РћСЃС‚Р°С‚РєРё MP, С€С‚.',
    value: totalStock,
    hint: `WB + Ozon РїРѕ API-сСЂРµР·Сѓ platform_trends РЅР° ${latestMarketplaceDate || 'РїРѕСЃР»РµРґРЅСЋСЋ РґРѕСЃС‚СѓРїРЅСѓСЋ РґР°С‚Сѓ'}`
  });
  replaceCard(cards, (card) => card.label === 'РџР»Р°РЅ РјРµСЃСЏС†Р°, С€С‚.' || String(card.label || '').startsWith('РџР»Р°РЅ '), {
    label: monthLabel ? `РџР»Р°РЅ ${monthLabel}, С€С‚.` : 'РџР»Р°РЅ РјРµСЃСЏС†Р°, С€С‚.',
    value: planUnits,
    hint: 'Р›РёРЅРµР№РЅС‹Р№ РїР»Р°РЅ РјРµСЃСЏС†Р° РїРѕ SKU СЂР°Р±РѕС‡РµРіРѕ РєРѕРЅС‚СѓСЂР°.'
  });
  replaceCard(cards, (card) => String(card.hint || '').startsWith('Р¤Р°РєС‚ РїРѕ РґР°РЅРЅС‹Рј Google Sheets'), {
    label: formatFactCardLabel(latestMarketplaceDate),
    value: factUnits,
    hint: `Р¤Р°РєС‚ РїРѕ API-сСЂРµР·Сѓ platform_trends РЅР° ${latestMarketplaceDate || 'РїРѕСЃР»РµРґРЅСЋСЋ РґРѕСЃС‚СѓРїРЅСѓСЋ РґР°С‚Сѓ'}.`
  });
  replaceCard(cards, (card) => card.label === 'Р’С‹РїРѕР»РЅРµРЅРёРµ Рє РїР»Р°РЅСѓ РЅР° РґР°С‚Сѓ', {
    label: 'Р’С‹РїРѕР»РЅРµРЅРёРµ Рє РїР»Р°РЅСѓ РЅР° РґР°С‚Сѓ',
    value: Number(completion.toFixed(4)),
    hint: 'Р¤Р°РєС‚ Рє Р»РёРЅРµР№РЅРѕРјСѓ РїР»Р°РЅСѓ РјРµСЃСЏС†Р° РЅР° РїРѕСЃР»РµРґРЅСЋСЋ РґРѕСЃС‚СѓРїРЅСѓСЋ РґР°С‚Сѓ.',
    valuePct: Number(completion.toFixed(4))
  });
  if (companyPlanSlice) {
    replaceCard(cards, (card) => String(card.label || '').startsWith('РџР»Р°РЅ РєРѕРјРїР°РЅРёРё') || card.hint === 'РћР±С‰РёР№ РїР»Р°РЅ РєРѕРјРїР°РЅРёРё РёР· РџР»Р°РЅ Рђ.xlsx.', {
      label: `РџР»Р°РЅ РєРѕРјРїР°РЅРёРё ${companyPlanSlice.label}, в‚Ѕ`,
      value: companyPlanSlice.planRevenueMonth,
      format: 'money',
      hint: 'РћР±С‰РёР№ РїР»Р°РЅ РєРѕРјРїР°РЅРёРё РёР· РџР»Р°РЅ Рђ.xlsx.'
    });
    replaceCard(cards, (card) => String(card.label || '').startsWith('Р¤Р°РєС‚ РєРѕРјРїР°РЅРёРё') || card.hint === 'Р¤Р°РєС‚ РІС‹СЂСѓС‡РєРё Рє РѕР±С‰РµРјСѓ РїР»Р°РЅСѓ РєРѕРјРїР°РЅРёРё.', {
      label: `Р¤Р°РєС‚ РєРѕРјРїР°РЅРёРё 01-${String(dayOfMonth).padStart(2, '0')}.${String(latestDateObject.getUTCMonth() + 1).padStart(2, '0')}, в‚Ѕ`,
      value: companyPlanSlice.factRevenueToDate,
      format: 'money',
      hint: 'Р¤Р°РєС‚ РІС‹СЂСѓС‡РєРё Рє РѕР±С‰РµРјСѓ РїР»Р°РЅСѓ РєРѕРјРїР°РЅРёРё.'
    });
    replaceCard(cards, (card) => String(card.label || '') === 'Р’С‹РїРѕР»РЅРµРЅРёРµ РєРѕРјРїР°РЅРёРё Рє РїР»Р°РЅСѓ', {
      label: 'Р’С‹РїРѕР»РЅРµРЅРёРµ РєРѕРјРїР°РЅРёРё Рє РїР»Р°РЅСѓ',
      value: companyPlanSlice.completionToDatePct,
      format: 'pct',
      hint: 'Р¤Р°РєС‚ РІС‹СЂСѓС‡РєРё / Р»РёРЅРµР№РЅС‹Р№ РѕР±С‰РёР№ РїР»Р°РЅ РєРѕРјРїР°РЅРёРё РЅР° РґР°С‚Сѓ.',
      valuePct: companyPlanSlice.completionToDatePct
    });
  }
  next.cards = cards;
  if (companyPlanSlice) {
    next.companyPlan = {
      generatedAt: options.companyPlan?.generatedAt || '',
      sourceWorkbook: options.companyPlan?.sourceWorkbook || '',
      sourceSheet: options.companyPlan?.sourceSheet || '',
      sourcePath: options.companyPlan?.sourcePath || '',
      planType: options.companyPlan?.planType || 'company_revenue',
      activeMonthKey: companyPlanSlice.monthKey,
      activeMonth: companyPlanSlice,
      months: options.companyPlan?.months || {}
    };
    next.company_plan_month_key = companyPlanSlice.monthKey;
    next.company_plan_month_label = companyPlanSlice.label;
    next.company_plan_revenue = companyPlanSlice.planRevenueMonth;
    next.company_fact_revenue_to_date = companyPlanSlice.factRevenueToDate;
    next.company_plan_to_date_revenue = companyPlanSlice.planRevenueToDate;
    next.company_plan_completion_month_pct = companyPlanSlice.completionMonthPct;
    next.company_plan_completion_to_date_pct = companyPlanSlice.completionToDatePct;
    next.company_forecast_revenue = companyPlanSlice.forecastRevenue;
    next.company_forecast_pct = companyPlanSlice.forecastPct;
    next.company_plan_source = `${options.companyPlan?.sourceWorkbook || 'company_plan.json'} :: ${options.companyPlan?.sourceSheet || 'company_plan'}`;
  }

  if (!Array.isArray(next.brandSummary) || !next.brandSummary.length) {
    next.brandSummary = [{ brand: options.brand }];
  }
  const summary = {
    ...next.brandSummary[0],
    brand: options.brand,
    sku_count: skus.length,
    total_stock: totalStock,
    assigned_sku: assignedSku,
    google_sheets_plan_field: planField,
    google_sheets_month_key: monthKey,
    asOfDate: latestMarketplaceDate,
    latestMarketplaceDate,
    plan_units: planUnits,
    fact_units_to_date: factUnits,
    fact_revenue_to_date: factRevenue,
    plan_completion_to_date_pct: Number(completion.toFixed(4))
  };
  if (monthPrefix) {
    summary[`${monthPrefix}_plan_units`] = planUnits;
    summary[`${monthPrefix}_fact_units_to_date`] = factUnits;
    summary[`${monthPrefix}_fact_revenue_to_date`] = factRevenue;
    summary[`${monthPrefix}_plan_completion_to_date_pct`] = Number(completion.toFixed(4));
  }
  if (companyPlanSlice) {
    Object.assign(summary, {
      company_plan_month_key: companyPlanSlice.monthKey,
      company_plan_month_label: companyPlanSlice.label,
      company_plan_revenue: companyPlanSlice.planRevenueMonth,
      company_fact_revenue_to_date: companyPlanSlice.factRevenueToDate,
      company_plan_to_date_revenue: companyPlanSlice.planRevenueToDate,
      company_plan_completion_month_pct: companyPlanSlice.completionMonthPct,
      company_plan_completion_to_date_pct: companyPlanSlice.completionToDatePct,
      company_forecast_revenue: companyPlanSlice.forecastRevenue,
      company_forecast_pct: companyPlanSlice.forecastPct,
      company_plan_source: next.company_plan_source
    });
    if (monthPrefix) {
      summary[`${monthPrefix}_company_plan_revenue`] = companyPlanSlice.planRevenueMonth;
      summary[`${monthPrefix}_company_fact_revenue_to_date`] = companyPlanSlice.factRevenueToDate;
      summary[`${monthPrefix}_company_plan_to_date_revenue`] = companyPlanSlice.planRevenueToDate;
      summary[`${monthPrefix}_company_plan_completion_month_pct`] = companyPlanSlice.completionMonthPct;
      summary[`${monthPrefix}_company_plan_completion_to_date_pct`] = companyPlanSlice.completionToDatePct;
      summary[`${monthPrefix}_company_forecast_revenue`] = companyPlanSlice.forecastRevenue;
      summary[`${monthPrefix}_company_forecast_pct`] = companyPlanSlice.forecastPct;
    }
  }
  next.cards = buildCanonicalDashboardCards({
    skus,
    assignedSku,
    totalStock,
    stockDate: latestLogisticsDate,
    latestMarketplaceDate,
    factUnits,
    companyPlanSlice
  });
  next.brandSummary[0] = summary;
  return next;
}

function replaceCard(cards, matcher, nextCard) {
  const index = cards.findIndex(matcher);
  if (index >= 0) {
    cards[index] = { ...cards[index], ...nextCard };
  } else {
    cards.push(nextCard);
  }
}

function countAssignedSkus(skus) {
  return skus.filter((item) => {
    if (hasText(item?.owner?.name)) return true;
    return Object.values(item?.ownersByPlatform || {}).some(hasText);
  }).length;
}

function companyPlanMonth(companyPlan, monthKey) {
  const month = companyPlan?.months?.[monthKey];
  return month && typeof month === 'object' ? month : null;
}

function buildCompanyPlanSlice(companyPlan, monthKey, latestDateObject, factRevenue) {
  const month = companyPlanMonth(companyPlan, monthKey);
  if (!month || !(numberOrZero(month.revenue) > 0)) return null;
  const dayOfMonth = latestDateObject ? latestDateObject.getUTCDate() : 0;
  const daysInMonth = numberOrZero(month.days)
    || (latestDateObject ? new Date(Date.UTC(latestDateObject.getUTCFullYear(), latestDateObject.getUTCMonth() + 1, 0)).getUTCDate() : 0);
  const planRevenueMonth = numberOrZero(month.revenue);
  const planRevenueToDate = planRevenueMonth > 0 && dayOfMonth > 0 && daysInMonth > 0
    ? (planRevenueMonth / daysInMonth) * dayOfMonth
    : planRevenueMonth;
  const forecastRevenue = factRevenue > 0 && dayOfMonth > 0 && daysInMonth > 0
    ? (factRevenue / dayOfMonth) * daysInMonth
    : factRevenue;
  const completionMonthPct = planRevenueMonth > 0 ? factRevenue / planRevenueMonth : 0;
  const completionToDatePct = planRevenueToDate > 0 ? factRevenue / planRevenueToDate : 0;
  const forecastPct = planRevenueMonth > 0 ? forecastRevenue / planRevenueMonth : 0;
  return {
    monthKey,
    label: month.label || monthKey,
    days: daysInMonth,
    dayOfMonth,
    planRevenueMonth: Number(planRevenueMonth.toFixed(2)),
    planRevenueToDate: Number(planRevenueToDate.toFixed(2)),
    factRevenueToDate: Number(factRevenue.toFixed(2)),
    completionMonthPct: Number(completionMonthPct.toFixed(4)),
    completionToDatePct: Number(completionToDatePct.toFixed(4)),
    forecastRevenue: Number(forecastRevenue.toFixed(2)),
    forecastPct: Number(forecastPct.toFixed(4)),
    channels: month.channels || {}
  };
}

function platformTrendsMarketplaceFallback(platformTrends) {
  const latestMarketplaceDate = normalizeText(platformTrends?.latestMarketplaceDate || '');
  const platforms = Array.isArray(platformTrends?.platforms) ? platformTrends.platforms : [];
  if (!latestMarketplaceDate || !platforms.length) return null;

  const monthKey = monthKeyFromDate(latestMarketplaceDate);
  const allPlatform = platforms.find((platform) => normalizeKey(platform?.key) === 'all');

  let series = Array.isArray(allPlatform?.series) && allPlatform.series.length
    ? allPlatform.series
    : null;

  if (!series) {
    const byDate = new Map();
    for (const platform of platforms) {
      if (!Array.isArray(platform?.series)) continue;
      for (const point of platform.series) {
        const date = isoDate(point?.label || point?.date);
        if (!date) continue;
        const current = byDate.get(date) || { units: 0, revenue: 0 };
        current.units += numberOrZero(point?.units);
        current.revenue += numberOrZero(point?.revenue);
        byDate.set(date, current);
      }
    }
    if (!byDate.size) return null;
    series = Array.from(byDate.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([label, values]) => ({
        label,
        units: values.units,
        revenue: values.revenue
      }));
  }

  const monthSeries = monthKey
    ? series.filter((point) => isoDate(point?.label || point?.date).startsWith(monthKey))
    : series;

  return {
    latestMarketplaceDate,
    monthKey,
    factUnits: sum(monthSeries.map((point) => point?.units)),
    factRevenue: sum(monthSeries.map((point) => point?.revenue)),
    source: 'platform_trends fallback after WB API refresh'
  };
}

function buildDashboard(baseDashboard, skus, factRows, logisticsRows, options, platformTrendsFallback = null) {
  const next = deepClone(baseDashboard);
  const relevantSkuKeys = portalSkuKeySet(skus);
  const relevantFactRows = factRows.filter((row) => relevantSkuKeys.has(normalizeKey(row.item_code)));
  const relevantLogisticsRows = logisticsRows.filter((row) => relevantSkuKeys.has(normalizeKey(row.article)));
  const fallbackMarketplace = platformTrendsMarketplaceFallback(platformTrendsFallback);
  const latestMarketplaceDate = latestDateOf(relevantFactRows.map((row) => row.date)) || fallbackMarketplace?.latestMarketplaceDate || '';
  const latestLogisticsDate = latestDateOf(relevantLogisticsRows.map((row) => row.date));
  const monthKey = monthKeyFromDate(latestMarketplaceDate);
  const monthLabel = monthLabelRu(latestMarketplaceDate);
  const monthPrefix = monthPrefixForDate(latestMarketplaceDate);
  const latestDateObject = latestMarketplaceDate ? new Date(`${latestMarketplaceDate}T00:00:00Z`) : null;
  const currentYear = latestMarketplaceDate ? latestMarketplaceDate.slice(2, 4) : '';
  const dynamicPlanField = monthPrefix && currentYear ? `plan${monthPrefix[0].toUpperCase()}${monthPrefix.slice(1)}${currentYear}Units` : '';
  const configuredPlanField = next.brandSummary?.[0]?.google_sheets_plan_field || dynamicPlanField;
  const planField = [configuredPlanField, dynamicPlanField].find((field) => skus.some((item) => item?.planFact && field in item.planFact)) || configuredPlanField;
  const monthFactRows = relevantFactRows.filter((row) => isoDate(row.date).startsWith(monthKey));
  const factUnits = monthFactRows.length
    ? sum(monthFactRows.map((row) => row.sales_qty))
    : numberOrZero(fallbackMarketplace?.factUnits);
  const factRevenue = monthFactRows.length
    ? sum(monthFactRows.map((row) => row.revenue))
    : numberOrZero(fallbackMarketplace?.factRevenue);
  const totalStock = sum(relevantLogisticsRows
    .filter((row) => isoDate(row.date) === latestLogisticsDate)
    .map((row) => numberOrZero(row.wb_stock) + numberOrZero(row.ozon_stock) + numberOrZero(row.yandex_stock)));
  const assignedSku = countAssignedSkus(skus);
  const planUnits = planField
    ? sum(skus.map((item) => item?.planFact?.[planField]))
    : numberOrZero(next.brandSummary?.[0]?.plan_units);
  const dayOfMonth = latestDateObject ? latestDateObject.getUTCDate() : 0;
  const daysInMonth = latestDateObject
    ? new Date(Date.UTC(latestDateObject.getUTCFullYear(), latestDateObject.getUTCMonth() + 1, 0)).getUTCDate()
    : 0;
  const linearPlanToDate = planUnits > 0 && dayOfMonth > 0 && daysInMonth > 0
    ? (planUnits / daysInMonth) * dayOfMonth
    : planUnits;
  const completion = linearPlanToDate > 0 ? factUnits / linearPlanToDate : 0;
  const companyPlanSlice = buildCompanyPlanSlice(options.companyPlan, monthKey, latestDateObject, factRevenue);

  next.generatedAt = new Date().toISOString();
  next.dataFreshness = {
    ...(next.dataFreshness || {}),
    asOfDate: latestMarketplaceDate,
    googleSheetsMonth: monthKey,
    googleSheetsSourceUrl: options.sourceUrl,
    googleSheetsSourceGid: options.sourceGid,
    googleSheetsBridge: 'scripts/portal-google-sheet-sync.js',
    googleSheetsRefreshTimeLocal: options.sourceRefreshTimeLocal,
    portalRefreshTimeLocal: options.portalRefreshTimeLocal,
    marketplaceFactSource: monthFactRows.length ? 'fact_marketplace_daily_sku' : (fallbackMarketplace?.source || 'fact_marketplace_daily_sku')
  };
  next.asOfDate = latestMarketplaceDate;
  next.latestMarketplaceDate = latestMarketplaceDate;
  next.marketplaceFactSource = next.dataFreshness.marketplaceFactSource;

  const cards = Array.isArray(next.cards) ? next.cards : [];
  cards.length = 0;
  replaceCard(cards, (card) => card.label === 'SKU в базе', {
    label: 'SKU в базе',
    value: skus.length,
    hint: 'В портал попал только бренд Алтея'
  });
  replaceCard(cards, (card) => card.label === 'Закреплено за owner', {
    label: 'Закреплено за owner',
    value: assignedSku,
    hint: 'Нашли закрепление в рабочих реестрах и ежедневном Google Sheets.'
  });
  replaceCard(cards, (card) => card.label === 'Без owner', {
    label: 'Без owner',
    value: Math.max(0, skus.length - assignedSku),
    hint: 'Нужно дозакрепить вручную'
  });
  replaceCard(cards, (card) => card.label === 'Остатки MP, шт.', {
    label: 'Остатки MP, шт.',
    value: totalStock,
    hint: `WB + Ozon по срезу Google Sheets на ${latestMarketplaceDate || 'последнюю доступную дату'}`
  });
  replaceCard(cards, (card) => card.hint === 'Линейный план месяца по SKU рабочего контура.', {
    label: monthLabel ? `План ${monthLabel}, шт.` : 'План месяца, шт.',
    value: planUnits,
    hint: 'Линейный план месяца по SKU рабочего контура.'
  });
  replaceCard(cards, (card) => String(card.hint || '').startsWith('Факт по данным Google Sheets'), {
    label: formatFactCardLabel(latestMarketplaceDate),
    value: factUnits,
    hint: `Факт по данным Google Sheets на ${latestMarketplaceDate || 'последнюю доступную дату'}.`
  });
  replaceCard(cards, (card) => card.label === 'Выполнение к плану на дату', {
    label: 'Выполнение к плану на дату',
    value: Number(completion.toFixed(4)),
    hint: 'Факт к линейному плану месяца на последнюю доступную дату.',
    valuePct: Number(completion.toFixed(4))
  });
  if (companyPlanSlice) {
    replaceCard(cards, (card) => String(card.label || '').startsWith('План компании') || card.hint === 'Общий план компании из План А.xlsx.', {
      label: `План компании ${companyPlanSlice.label}, ₽`,
      value: companyPlanSlice.planRevenueMonth,
      format: 'money',
      hint: 'Общий план компании из План А.xlsx.'
    });
    replaceCard(cards, (card) => String(card.label || '').startsWith('Факт компании') || card.hint === 'Факт выручки к общему плану компании.', {
      label: `Факт компании 01-${String(dayOfMonth).padStart(2, '0')}.${String(latestDateObject.getUTCMonth() + 1).padStart(2, '0')}, ₽`,
      value: companyPlanSlice.factRevenueToDate,
      format: 'money',
      hint: 'Факт выручки к общему плану компании.'
    });
    replaceCard(cards, (card) => String(card.label || '') === 'Выполнение компании к плану', {
      label: 'Выполнение компании к плану',
      value: companyPlanSlice.completionToDatePct,
      format: 'pct',
      hint: 'Факт выручки / линейный общий план компании на дату.',
      valuePct: companyPlanSlice.completionToDatePct
    });
  }
  next.cards = cards;
  if (companyPlanSlice) {
    next.companyPlan = {
      generatedAt: options.companyPlan?.generatedAt || '',
      sourceWorkbook: options.companyPlan?.sourceWorkbook || '',
      sourceSheet: options.companyPlan?.sourceSheet || '',
      sourcePath: options.companyPlan?.sourcePath || '',
      planType: options.companyPlan?.planType || 'company_revenue',
      activeMonthKey: companyPlanSlice.monthKey,
      activeMonth: companyPlanSlice,
      months: options.companyPlan?.months || {}
    };
    next.company_plan_month_key = companyPlanSlice.monthKey;
    next.company_plan_month_label = companyPlanSlice.label;
    next.company_plan_revenue = companyPlanSlice.planRevenueMonth;
    next.company_fact_revenue_to_date = companyPlanSlice.factRevenueToDate;
    next.company_plan_to_date_revenue = companyPlanSlice.planRevenueToDate;
    next.company_plan_completion_month_pct = companyPlanSlice.completionMonthPct;
    next.company_plan_completion_to_date_pct = companyPlanSlice.completionToDatePct;
    next.company_forecast_revenue = companyPlanSlice.forecastRevenue;
    next.company_forecast_pct = companyPlanSlice.forecastPct;
    next.company_plan_source = `${options.companyPlan?.sourceWorkbook || 'company_plan.json'} :: ${options.companyPlan?.sourceSheet || 'company_plan'}`;
  }

  if (!Array.isArray(next.brandSummary) || !next.brandSummary.length) {
    next.brandSummary = [{ brand: options.brand }];
  }
  const summary = {
    ...next.brandSummary[0],
    brand: options.brand,
    sku_count: skus.length,
    total_stock: totalStock,
    assigned_sku: assignedSku,
    google_sheets_plan_field: planField,
    google_sheets_month_key: monthKey,
    asOfDate: latestMarketplaceDate,
    latestMarketplaceDate,
    plan_units: planUnits,
    fact_units_to_date: factUnits,
    fact_revenue_to_date: factRevenue,
    plan_completion_to_date_pct: Number(completion.toFixed(4))
  };
  if (monthPrefix) {
    summary[`${monthPrefix}_plan_units`] = planUnits;
    summary[`${monthPrefix}_fact_units_to_date`] = factUnits;
    summary[`${monthPrefix}_fact_revenue_to_date`] = factRevenue;
    summary[`${monthPrefix}_plan_completion_to_date_pct`] = Number(completion.toFixed(4));
  }
  if (companyPlanSlice) {
    Object.assign(summary, {
      company_plan_month_key: companyPlanSlice.monthKey,
      company_plan_month_label: companyPlanSlice.label,
      company_plan_revenue: companyPlanSlice.planRevenueMonth,
      company_fact_revenue_to_date: companyPlanSlice.factRevenueToDate,
      company_plan_to_date_revenue: companyPlanSlice.planRevenueToDate,
      company_plan_completion_month_pct: companyPlanSlice.completionMonthPct,
      company_plan_completion_to_date_pct: companyPlanSlice.completionToDatePct,
      company_forecast_revenue: companyPlanSlice.forecastRevenue,
      company_forecast_pct: companyPlanSlice.forecastPct,
      company_plan_source: next.company_plan_source
    });
    if (monthPrefix) {
      summary[`${monthPrefix}_company_plan_revenue`] = companyPlanSlice.planRevenueMonth;
      summary[`${monthPrefix}_company_fact_revenue_to_date`] = companyPlanSlice.factRevenueToDate;
      summary[`${monthPrefix}_company_plan_to_date_revenue`] = companyPlanSlice.planRevenueToDate;
      summary[`${monthPrefix}_company_plan_completion_month_pct`] = companyPlanSlice.completionMonthPct;
      summary[`${monthPrefix}_company_plan_completion_to_date_pct`] = companyPlanSlice.completionToDatePct;
      summary[`${monthPrefix}_company_forecast_revenue`] = companyPlanSlice.forecastRevenue;
      summary[`${monthPrefix}_company_forecast_pct`] = companyPlanSlice.forecastPct;
    }
  }
  next.cards = buildCanonicalDashboardCards({
    skus,
    assignedSku,
    totalStock,
    stockDate: latestLogisticsDate,
    latestMarketplaceDate,
    factUnits,
    companyPlanSlice
  });
  next.brandSummary[0] = summary;
  return next;
}

function buildLogistics(baseLogistics, skus, factLogisticsRows, options, warehouseStockOverlay) {
  const next = deepClone(baseLogistics);
  const skuByKey = new Map(skus.map((item) => [normalizeKey(item.articleKey || item.article), item]));
  const planMonthField = `plan${String(options?.monthKey || '').replace('-', '')}Units`;
  const latestLogisticsDate = latestDateOf(
    factLogisticsRows
      .filter((row) => skuByKey.has(normalizeKey(row.article)))
      .map((row) => row.date)
  );
  const latestRows = factLogisticsRows.filter((row) => {
    const skuKey = normalizeKey(row.article);
    return skuByKey.has(skuKey) && isoDate(row.date) === latestLogisticsDate;
  });
  const warehouseOverlayRows = Array.isArray(warehouseStockOverlay?.rows)
    ? warehouseStockOverlay.rows
    : [];
  const centralRows = latestRows.filter((row) => /балаших|central/i.test(normalizeText(row.warehouse_name)));

  const centralRowsSummary = centralRows.length
    ? {
        stock: sum(centralRows.map((row) => numberOrZero(row.wb_stock) + numberOrZero(row.ozon_stock) + numberOrZero(row.yandex_stock))),
        skuCount: centralRows.length
      }
    : null;

  const overlayRowsSummary = warehouseOverlayRows.length
    ? warehouseOverlayRows.reduce((acc, row) => {
        acc.accepted += numberOrZero(row.accepted);
        acc.shippedOzon += numberOrZero(row.shippedOzon);
        acc.shippedWB += numberOrZero(row.shippedWB);
        acc.stock += numberOrZero(row.stockWarehouse);
        return acc;
      }, {
        accepted: 0,
        shippedOzon: 0,
        shippedWB: 0,
        stock: 0,
        skuCount: warehouseOverlayRows.length
      })
    : null;

  const centralSummary = overlayRowsSummary || centralRowsSummary;

  const ozonClusterMap = new Map();
  const ozonWarehouseMap = new Map();
  const wbWarehouseMap = new Map();
  const detailedRows = [];

  function skuTurnoverDays(sku, platform) {
    const candidate = platform === 'wb'
      ? numberOrNull(sku?.wb?.turnoverDays)
      : platform === 'ozon'
        ? numberOrNull(sku?.ozon?.turnoverDays)
        : numberOrNull(sku?.ym?.turnoverDays);
    return candidate && candidate > 0 ? Number(candidate.toFixed(2)) : null;
  }

  function avgDailyFromStock(stock, turnoverDays) {
    if (!(stock > 0) || !(turnoverDays > 0)) return 0;
    return Number((stock / turnoverDays).toFixed(4));
  }

  function projectedUnits(avgDaily, days) {
    if (!(avgDaily > 0) || !(days > 0)) return 0;
    return Number((avgDaily * days).toFixed(2));
  }

  function projectedNeed(avgDaily, stock, days) {
    if (!(avgDaily > 0) || !(days > 0)) return 0;
    return Math.max(0, Math.ceil((avgDaily * days) - numberOrZero(stock)));
  }

  function applyCoverage(bucket, stockField, avgField) {
    const stock = numberOrZero(bucket?.[stockField]);
    const avgDaily = numberOrZero(bucket?.[avgField]);
    bucket.coverageDays = avgDaily > 0 ? Number((stock / avgDaily).toFixed(2)) : null;
    bucket.targetNeed7 = projectedNeed(avgDaily, stock, 7);
    bucket.targetNeed14 = projectedNeed(avgDaily, stock, 14);
    bucket.targetNeed28 = projectedNeed(avgDaily, stock, 28);
    return bucket;
  }

  for (const row of latestRows) {
    const sku = skuByKey.get(normalizeKey(row.article));
    const skuName = sku?.name || row.article || 'SKU';
    const wbOwner = skuOwnerForPlatform(sku, 'wb');
    const ozonOwner = skuOwnerForPlatform(sku, 'ozon');
    const ymOwner = skuOwnerForPlatform(sku, 'ym');
    const wbStock = numberOrZero(row.wb_stock);
    const ozonStock = numberOrZero(row.ozon_stock);
    const yandexStock = numberOrZero(row.yandex_stock);
    const warehouse = normalizeText(row.warehouse_name) || 'Склад не указан';
    const cluster = normalizeText(row.ozon_cluster) || warehouse;
    const articleKey = normalizeText(sku?.articleKey || row.article);
    const planMonth = numberOrNull(sku?.planFact?.[planMonthField]);

    if (wbStock > 0) {
      const wbTurnoverDays = skuTurnoverDays(sku, 'wb');
      const wbAvgDaily = avgDailyFromStock(wbStock, wbTurnoverDays);
      const bucket = wbWarehouseMap.get(warehouse) || {
        name: warehouse,
        ordersUnits: 0,
        buyoutsUnits: 0,
        payout: 0,
        stock: 0,
        avgDailyUnits: 0,
        coverageDays: null,
        targetNeed7: 0,
        targetNeed14: 0,
        targetNeed28: 0,
        skuKeys: new Set()
      };
      bucket.stock += wbStock;
      bucket.avgDailyUnits += wbAvgDaily;
      bucket.skuKeys.add(articleKey);
      wbWarehouseMap.set(warehouse, bucket);
      detailedRows.push({
        platform: 'WB',
        place: warehouse,
        article: articleKey,
        name: skuName,
        owner: wbOwner,
        inStock: wbStock,
        inTransit: 0,
        inRequest: 0,
        avgDaily: wbAvgDaily,
        turnoverDays: wbTurnoverDays,
        targetNeed7: projectedNeed(wbAvgDaily, wbStock, 7),
        targetNeed14: projectedNeed(wbAvgDaily, wbStock, 14),
        targetNeed28: projectedNeed(wbAvgDaily, wbStock, 28),
        localShare: null,
        sourceValue: 'sku-turnover',
        sales7: projectedUnits(wbAvgDaily, 7),
        sales14: projectedUnits(wbAvgDaily, 14),
        sales28: projectedUnits(wbAvgDaily, 28),
        planMonth
      });
    }

    if (ozonStock > 0) {
      const ozonTurnoverDays = skuTurnoverDays(sku, 'ozon');
      const ozonAvgDaily = avgDailyFromStock(ozonStock, ozonTurnoverDays);
      const clusterBucket = ozonClusterMap.get(cluster) || {
        name: cluster,
        units: 0,
        value: 0,
        available: 0,
        inRequest: 0,
        inTransit: 0,
        checking: 0,
        avgDailyUnits28: 0,
        coverageDays: null,
        localShare: null,
        targetNeed7: 0,
        targetNeed14: 0,
        targetNeed28: 0,
        skuKeys: new Set()
      };
      clusterBucket.available += ozonStock;
      clusterBucket.avgDailyUnits28 += ozonAvgDaily;
      clusterBucket.skuKeys.add(articleKey);
      ozonClusterMap.set(cluster, clusterBucket);

      const warehouseKey = `${cluster}::${warehouse}`;
      const warehouseBucket = ozonWarehouseMap.get(warehouseKey) || {
        warehouse,
        cluster,
        units: 0,
        value: 0,
        available: 0,
        inRequest: 0,
        inTransit: 0,
        checking: 0,
        avgDailyUnits28: 0,
        coverageDays: null,
        localShare: null,
        targetNeed7: 0,
        targetNeed14: 0,
        targetNeed28: 0,
        skuKeys: new Set()
      };
      warehouseBucket.available += ozonStock;
      warehouseBucket.avgDailyUnits28 += ozonAvgDaily;
      warehouseBucket.skuKeys.add(articleKey);
      ozonWarehouseMap.set(warehouseKey, warehouseBucket);

      detailedRows.push({
        platform: 'Ozon',
        place: cluster,
        article: articleKey,
        name: skuName,
        owner: ozonOwner,
        inStock: ozonStock,
        inTransit: 0,
        inRequest: 0,
        avgDaily: ozonAvgDaily,
        turnoverDays: ozonTurnoverDays,
        targetNeed7: projectedNeed(ozonAvgDaily, ozonStock, 7),
        targetNeed14: projectedNeed(ozonAvgDaily, ozonStock, 14),
        targetNeed28: projectedNeed(ozonAvgDaily, ozonStock, 28),
        localShare: null,
        sourceValue: 'sku-turnover',
        sales7: projectedUnits(ozonAvgDaily, 7),
        sales14: projectedUnits(ozonAvgDaily, 14),
        sales28: projectedUnits(ozonAvgDaily, 28),
        planMonth
      });
    }

    if (yandexStock > 0) {
      const ymTurnoverDays = skuTurnoverDays(sku, 'ym');
      const ymAvgDaily = avgDailyFromStock(yandexStock, ymTurnoverDays);
      detailedRows.push({
        platform: 'Я.Маркет',
        place: warehouse,
        article: articleKey,
        name: skuName,
        owner: ymOwner,
        inStock: yandexStock,
        inTransit: 0,
        inRequest: 0,
        avgDaily: ymAvgDaily,
        turnoverDays: ymTurnoverDays,
        targetNeed7: projectedNeed(ymAvgDaily, yandexStock, 7),
        targetNeed14: projectedNeed(ymAvgDaily, yandexStock, 14),
        targetNeed28: projectedNeed(ymAvgDaily, yandexStock, 28),
        localShare: null,
        sourceValue: 'sku-turnover',
        sales7: projectedUnits(ymAvgDaily, 7),
        sales14: projectedUnits(ymAvgDaily, 14),
        sales28: projectedUnits(ymAvgDaily, 28),
        planMonth
      });
    }
  }

  const wbWarehouses = Array.from(wbWarehouseMap.values())
    .map((item) => applyCoverage(item, 'stock', 'avgDailyUnits'))
    .map((item) => ({ ...item, skuCount: item.skuKeys.size, skuKeys: undefined }))
    .sort((left, right) => right.stock - left.stock);
  const ozonClusters = Array.from(ozonClusterMap.values())
    .map((item) => applyCoverage(item, 'available', 'avgDailyUnits28'))
    .map((item) => ({ ...item, skuCount: item.skuKeys.size, skuKeys: undefined }))
    .sort((left, right) => right.available - left.available);
  const ozonWarehouses = Array.from(ozonWarehouseMap.values())
    .map((item) => applyCoverage(item, 'available', 'avgDailyUnits28'))
    .map((item) => ({ ...item, skuCount: item.skuKeys.size, skuKeys: undefined }))
    .sort((left, right) => right.available - left.available);
  const riskRows = detailedRows.filter((row) => Number.isFinite(row.turnoverDays) && row.turnoverDays < 14);
  const compactRowMap = new Map();
  for (const row of detailedRows) {
    const rowKey = `${row.platform}::${row.place}::${row.article}`;
    const current = compactRowMap.get(rowKey) || {
      platform: row.platform,
      place: row.place,
      article: row.article,
      inStock: 0,
      inTransit: 0,
      inRequest: 0,
      avgDaily: 0,
      turnoverDays: null
    };
    current.inStock += numberOrZero(row.inStock);
    current.inTransit += numberOrZero(row.inTransit);
    current.inRequest += numberOrZero(row.inRequest);
    current.avgDaily += numberOrZero(row.avgDaily);
    if (Number.isFinite(numberOrZero(row.turnoverDays)) && numberOrZero(row.turnoverDays) > 0) {
      current.turnoverDays = current.turnoverDays == null
        ? numberOrZero(row.turnoverDays)
        : Math.min(current.turnoverDays, numberOrZero(row.turnoverDays));
    }
    compactRowMap.set(rowKey, current);
  }
  const allRows = Array.from(compactRowMap.values())
    .sort((left, right) => right.inStock - left.inStock);

  next.generatedAt = new Date().toISOString();
  next.window = {
    from: latestLogisticsDate
      ? new Date(new Date(`${latestLogisticsDate}T00:00:00Z`).getTime() - (27 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)
      : next.window?.from || '',
    to: latestLogisticsDate || next.window?.to || '',
    days: 28
  };
  next.notes = [
    'Остатки Ozon/WB обновлены из Google Sheets workbook.',
    `Последний логистический срез: ${latestLogisticsDate || 'не найден'}.`,
    'Скорости продаж и value сохраняются из текущего портального слоя, пока в Sheets нет отдельного cluster-level sales факта.'
  ];
  if (warehouseOverlayRows.length) {
    next.notes.unshift('Остатки центрального склада обновлены из отдельного листа Склад Балашиха.');
  }
  next.ozonClusters = ozonClusters;
  next.ozonWarehouses = ozonWarehouses;
  next.wbWarehouses = wbWarehouses;
  next.allRows = allRows;
  next.riskRows = riskRows;

  const summaryCards = Array.isArray(next.summaryCards) ? next.summaryCards : [];
  replaceCard(summaryCards, (card) => card.label === 'Кластеры Ozon < 14 дней', {
    label: 'Кластеры Ozon < 14 дней',
    value: ozonClusters.filter((item) => Number.isFinite(item.coverageDays) && item.coverageDays < 14).length,
    hint: 'Свежий риск по Google Sheets.'
  });
  replaceCard(summaryCards, (card) => card.label === 'Склады WB < 14 дней', {
    label: 'Склады WB < 14 дней',
    value: wbWarehouses.filter((item) => Number.isFinite(item.coverageDays) && item.coverageDays < 14).length,
    hint: 'Свежий риск по Google Sheets.'
  });
  if (centralSummary) {
    replaceCard(summaryCards, (card) => card.label === 'Центральный склад, шт.', {
      label: 'Центральный склад, шт.',
      value: Math.round(numberOrZero(centralSummary.stock)),
      hint: warehouseOverlayRows.length
        ? `Склад Балашиха · ${warehouseOverlayRows.length} SKU`
        : 'Остаток в Балашихе'
    });
  }
  next.summaryCards = summaryCards;

  if (next.centralWarehouse && typeof next.centralWarehouse === 'object') {
    if (centralSummary) {
      if (overlayRowsSummary) {
        next.centralWarehouse.accepted = Math.round(numberOrZero(overlayRowsSummary.accepted));
        next.centralWarehouse.shippedOzon = Math.round(numberOrZero(overlayRowsSummary.shippedOzon));
        next.centralWarehouse.shippedWB = Math.round(numberOrZero(overlayRowsSummary.shippedWB));
      }
      next.centralWarehouse.stock = Math.round(numberOrZero(centralSummary.stock));
      next.centralWarehouse.skuCount = numberOrZero(centralSummary.skuCount || next.centralWarehouse.skuCount || 0);
      if (warehouseOverlayRows.length) {
        next.centralWarehouse.source = 'warehouse_stock_overlay';
        next.centralWarehouse.sourceWorkbook = warehouseStockOverlay?.sourceWorkbook || '';
        next.centralWarehouse.sourceSheet = warehouseStockOverlay?.sourceSheet || '';
        next.centralWarehouse.generatedAt = warehouseStockOverlay?.generatedAt || next.generatedAt;
      }
    }
  }

  return next;
}

function normalizeLoyaltyColumnName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/[\s.\-\/]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function loyaltyRowValue(row, aliases) {
  const entries = Object.entries(row || {});
  const normalizedEntries = entries.map(([key, value]) => [normalizeLoyaltyColumnName(key), value]);
  for (const alias of aliases) {
    const normalizedAlias = normalizeLoyaltyColumnName(alias);
    const exact = normalizedEntries.find(([key]) => key === normalizedAlias);
    if (exact && exact[1] !== null && exact[1] !== undefined && exact[1] !== '') return exact[1];
  }
  for (const alias of aliases) {
    const normalizedAlias = normalizeLoyaltyColumnName(alias);
    const loose = normalizedEntries.find(([key]) => key.includes(normalizedAlias) || normalizedAlias.includes(key));
    if (loose && loose[1] !== null && loose[1] !== undefined && loose[1] !== '') return loose[1];
  }
  return '';
}

function loyaltyNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.+-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function loyaltyCompactRaw(row) {
  return Object.fromEntries(
    Object.entries(row || {})
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .slice(0, 18)
  );
}

const LOYALTY_ALIASES = {
  date: ['date', 'day', 'period', 'operation_date', 'created_at', '\u0434\u0430\u0442\u0430', '\u0434\u0435\u043d\u044c', '\u043f\u0435\u0440\u0438\u043e\u0434'],
  article: ['article', 'item_code', 'offer_id', 'sku', 'supplier_article', '\u0430\u0440\u0442\u0438\u043a\u0443\u043b', '\u0442\u043e\u0432\u0430\u0440'],
  platform: ['platform', 'marketplace', 'mp', '\u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0430', '\u043c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441'],
  program: ['program', 'campaign', 'campaign_name', 'loyalty_program', 'source', 'type', '\u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0430', '\u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', '\u0430\u043a\u0446\u0438\u044f', '\u0442\u0438\u043f'],
  spend: ['spend', 'cost', 'expense', 'amount', 'budget', 'points_spent', 'bonus_spend', '\u0440\u0430\u0441\u0445\u043e\u0434', '\u0437\u0430\u0442\u0440\u0430\u0442\u044b', '\u0441\u0443\u043c\u043c\u0430', '\u0431\u044e\u0434\u0436\u0435\u0442'],
  points: ['points', 'bonus', 'bonuses', 'points_count', '\u0431\u0430\u043b\u043b\u044b', '\u0431\u043e\u043d\u0443\u0441\u044b', '\u0431\u0430\u043b\u043b\u043e\u0432'],
  orders: ['orders', 'orders_count', 'qty', 'quantity', '\u0437\u0430\u043a\u0430\u0437\u044b', '\u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e'],
  revenue: ['revenue', 'sales', 'turnover', 'orders_sum', '\u0432\u044b\u0440\u0443\u0447\u043a\u0430', '\u043e\u0431\u043e\u0440\u043e\u0442', '\u043f\u0440\u043e\u0434\u0430\u0436\u0438'],
  customers: ['customers', 'clients', 'buyers', '\u043a\u043b\u0438\u0435\u043d\u0442\u044b', '\u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u0438']
};

function normalizeLoyaltyRows(rawRows) {
  return (Array.isArray(rawRows) ? rawRows : [])
    .map((row, index) => {
      const date = isoDate(loyaltyRowValue(row, LOYALTY_ALIASES.date));
      const articleKey = normalizeText(loyaltyRowValue(row, LOYALTY_ALIASES.article));
      const platform = normalizeText(loyaltyRowValue(row, LOYALTY_ALIASES.platform));
      const program = normalizeText(loyaltyRowValue(row, LOYALTY_ALIASES.program)) || '\u0421\u0438\u0441\u0442\u0435\u043c\u0430 \u043b\u043e\u044f\u043b\u044c\u043d\u043e\u0441\u0442\u0438';
      const spend = loyaltyNumber(loyaltyRowValue(row, LOYALTY_ALIASES.spend));
      const points = loyaltyNumber(loyaltyRowValue(row, LOYALTY_ALIASES.points));
      const orders = loyaltyNumber(loyaltyRowValue(row, LOYALTY_ALIASES.orders));
      const revenue = loyaltyNumber(loyaltyRowValue(row, LOYALTY_ALIASES.revenue));
      const customers = loyaltyNumber(loyaltyRowValue(row, LOYALTY_ALIASES.customers));
      return {
        rowIndex: index + 2,
        date,
        month: date ? date.slice(0, 7) : '',
        articleKey,
        platform,
        program,
        spend: Number(spend.toFixed(2)),
        points: Number(points.toFixed(2)),
        orders: Number(orders.toFixed(4)),
        revenue: Number(revenue.toFixed(2)),
        customers: Number(customers.toFixed(4)),
        raw: loyaltyCompactRaw(row)
      };
    })
    .filter((row) =>
      row.date
      || row.articleKey
      || row.platform
      || row.program
      || row.spend
      || row.points
      || row.orders
      || row.revenue
      || row.customers
    );
}

function loyaltyAggregateRows(rows, keySelector) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keySelector(row) || '';
    if (!key) continue;
    const current = buckets.get(key) || {
      key,
      label: key,
      rows: 0,
      spend: 0,
      points: 0,
      orders: 0,
      revenue: 0,
      customers: 0
    };
    current.rows += 1;
    current.spend += numberOrZero(row.spend);
    current.points += numberOrZero(row.points);
    current.orders += numberOrZero(row.orders);
    current.revenue += numberOrZero(row.revenue);
    current.customers += numberOrZero(row.customers);
    buckets.set(key, current);
  }
  return Array.from(buckets.values())
    .map((item) => ({
      ...item,
      spend: Number(item.spend.toFixed(2)),
      points: Number(item.points.toFixed(2)),
      orders: Number(item.orders.toFixed(4)),
      revenue: Number(item.revenue.toFixed(2)),
      customers: Number(item.customers.toFixed(4))
    }))
    .sort((left, right) => right.spend - left.spend || right.revenue - left.revenue || String(left.label).localeCompare(String(right.label)));
}

function buildLoyaltySystem(rawRows, source, options) {
  const rows = normalizeLoyaltyRows(rawRows);
  const dates = rows.map((row) => row.date).filter(Boolean).sort();
  const asOfDate = dates[dates.length - 1] || '';
  const byProgram = loyaltyAggregateRows(rows, (row) => row.program);
  const byPlatform = loyaltyAggregateRows(rows, (row) => row.platform || 'all');
  const daily = loyaltyAggregateRows(rows, (row) => row.date).sort((left, right) => String(left.key).localeCompare(String(right.key)));
  const months = loyaltyAggregateRows(rows, (row) => row.month).sort((left, right) => String(right.key).localeCompare(String(left.key)));
  const summary = {
    rows: rows.length,
    spend: Number(sum(rows.map((row) => row.spend)).toFixed(2)),
    points: Number(sum(rows.map((row) => row.points)).toFixed(2)),
    orders: Number(sum(rows.map((row) => row.orders)).toFixed(4)),
    revenue: Number(sum(rows.map((row) => row.revenue)).toFixed(2)),
    customers: Number(sum(rows.map((row) => row.customers)).toFixed(4)),
    programs: byProgram.length,
    platforms: byPlatform.filter((item) => item.key !== 'all').length
  };
  return {
    generatedAt: new Date().toISOString(),
    asOfDate,
    source: {
      sheetName: source?.name || '',
      gid: source?.gid || '',
      googleSheetsSourceUrl: options.sourceUrl,
      googleSheetsSourceGid: options.sourceGid,
      googleSheetsRefreshTimeLocal: options.sourceRefreshTimeLocal,
      portalRefreshTimeLocal: options.portalRefreshTimeLocal
    },
    summary,
    months,
    daily,
    byProgram,
    byPlatform,
    rows,
    diagnostics: {
      sheetFound: Boolean(source?.name),
      rowsRead: Array.isArray(rawRows) ? rawRows.length : 0,
      normalizedRows: rows.length,
      expectedSheetNames: REQUIRED_SOURCE_SHEETS.loyaltySystem.filter((name) => /^[\x00-\x7F]+$/.test(name))
    }
  };
}

function buildSnapshots(rows, options) {
  const baseDir = options.baseDataDir;
  const baseDashboard = readJson(path.join(baseDir, 'dashboard.json'));
  const baseSkus = readJson(path.join(baseDir, 'skus.json'));
  const basePlatformTrends = readJson(path.join(baseDir, 'platform_trends.json'));
  const baseLogistics = readJson(path.join(baseDir, 'logistics.json'));
  const warehouseStockOverlay = readOptionalJson(path.join(baseDir, 'warehouse_stock_overlay.json'));
  const adsSummary = readOptionalJson(path.join(baseDir, 'ads_summary.json'));
  const iuDrrSummary = readOptionalJson(path.join(baseDir, 'iu_drr_summary.json'));
  const wbFeedbacksSummary = readOptionalJson(path.join(baseDir, 'wb_feedbacks_summary.json'));
  const wbSubstitutionTraffic = readOptionalJson(path.join(baseDir, 'wb_substitution_traffic.json'));
  const wbSubstitutionTrafficHistory = readOptionalJson(path.join(baseDir, 'wb_substitution_traffic_history.json'));
  const localSkuAliasRows = readSkuAliasRows(options);
  const skuAliasRows = normalizeSkuAliasRows(rows.skuAliases, localSkuAliasRows);
  const overlayResult = buildSkuOverlay(baseSkus, rows.dimSku);
  const aliasResult = applySkuAliases(overlayResult.skus, skuAliasRows);
  const skus = aliasResult.skus;
  const updatedCount = overlayResult.updatedCount;
  const platformTrends = refreshPlatformTrendsSnapshot(basePlatformTrends, options);
  const dashboard = buildDashboardFromPlatformTrends(baseDashboard, skus, rows.factLogistics, options, platformTrends);
  const logistics = buildLogistics(baseLogistics, skus, rows.factLogistics, options, warehouseStockOverlay);
  const loyaltySystem = buildLoyaltySystem(rows.loyaltySystem, rows.loyaltySystemSource, options);
  return {
    snapshots: {
      dashboard,
      skus,
      platform_trends: platformTrends,
      logistics,
      loyalty_system: loyaltySystem,
      warehouse_stock_overlay: warehouseStockOverlay || {
        generatedAt: new Date().toISOString(),
        sourceWorkbook: '',
        sourceSheet: '',
        sourceUrl: '',
        sourceFormat: 'google-csv-export',
        sheetName: '',
        matchField: 'Наименование как в ЛК -> article/articleKey',
        sheetRowCount: 0,
        matchedRowCount: 0,
        matchedSkuCount: 0,
        unmatchedSourceKeys: [],
        summary: {
          stockWarehouse: 0,
          accepted: 0,
          shippedOzon: 0,
          shippedWB: 0
        },
        rows: []
      },
      ...(adsSummary ? { ads_summary: adsSummary } : {}),
      ...(iuDrrSummary ? { iu_drr_summary: iuDrrSummary } : {}),
      ...(wbFeedbacksSummary ? { wb_feedbacks_summary: wbFeedbacksSummary } : {}),
      ...(wbSubstitutionTraffic ? { wb_substitution_traffic: wbSubstitutionTraffic } : {}),
      ...(wbSubstitutionTrafficHistory ? { wb_substitution_traffic_history: wbSubstitutionTrafficHistory } : {})
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sheetSource: options.inputXlsx || options.inputJson || options.sourceUrl,
      sourceMode: rows?.sourceMeta?.mode || (options.inputJson ? 'input-json' : options.inputXlsx ? 'input-xlsx' : 'google-workbook'),
      sourceGids: rows?.sourceMeta?.gids || {},
      sourceWarnings: rows?.sourceMeta?.warnings || [],
      updatedSkus: updatedCount,
      skuAliases: {
        sheetRows: Array.isArray(rows.skuAliases) ? rows.skuAliases.length : 0,
        localRows: localSkuAliasRows.length,
        normalizedRows: skuAliasRows.length,
        appliedRows: aliasResult.diagnostics.appliedRows,
        unmatchedTargetRows: aliasResult.diagnostics.unmatchedTargetRows,
        unmatchedTargets: aliasResult.diagnostics.unmatchedTargets
      },
      dashboard: {
        latest_marketplace_date: dashboard.dataFreshness?.asOfDate || '',
        month_plan_units: dashboard.brandSummary?.[0]?.plan_units || 0,
        month_fact_units: dashboard.brandSummary?.[0]?.fact_units_to_date || 0,
        month_fact_revenue: dashboard.brandSummary?.[0]?.fact_revenue_to_date || 0,
        completion_to_date_pct: dashboard.brandSummary?.[0]?.plan_completion_to_date_pct || 0,
        company_plan_revenue: dashboard.brandSummary?.[0]?.company_plan_revenue || 0,
        company_plan_to_date_revenue: dashboard.brandSummary?.[0]?.company_plan_to_date_revenue || 0,
        company_completion_to_date_pct: dashboard.brandSummary?.[0]?.company_plan_completion_to_date_pct || 0
      },
      platformTrends: {
        latest_marketplace_date: platformTrends.latestMarketplaceDate || '',
        points: platformTrends.platforms?.[0]?.series?.length || 0
      },
      loyaltySystem: {
        sheet_name: loyaltySystem.source?.sheetName || '',
        latest_date: loyaltySystem.asOfDate || '',
        rows: loyaltySystem.summary?.rows || 0,
        spend: loyaltySystem.summary?.spend || 0
      },
      iuDrr: {
        latest_date: iuDrrSummary?.asOfDate || iuDrrSummary?.window?.to || '',
        rows: Array.isArray(iuDrrSummary?.daily) ? iuDrrSummary.daily.length : 0,
        latest_daily_date: Array.isArray(iuDrrSummary?.daily)
          ? iuDrrSummary.daily.map((row) => String(row?.date || '').slice(0, 10)).filter(Boolean).sort().pop() || ''
          : '',
        generated_at: iuDrrSummary?.generatedAt || ''
      },
      logistics: {
        latest_logistics_date: logistics.window?.to || '',
        ozon_cluster_count: logistics.ozonClusters?.length || 0,
        ozon_warehouse_count: logistics.ozonWarehouses?.length || 0,
        wb_warehouse_count: logistics.wbWarehouses?.length || 0,
        central_warehouse_stock: logistics.centralWarehouse?.stock || 0,
        warehouse_stock_overlay_rows: warehouseStockOverlay?.rows?.length || 0
      }
    }
  };
}

function dashboardSnapshotHasMarketplaceFacts(payload) {
  const summary = payload?.brandSummary?.[0] || {};
  return Boolean(
    normalizeText(payload?.dataFreshness?.asOfDate)
    && (
      numberOrZero(summary.fact_units_to_date) > 0
      || numberOrZero(summary.fact_revenue_to_date) > 0
    )
  );
}

function normalizeDashboardMarketplaceAsOf(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const asOfDate = normalizeText(payload?.dataFreshness?.asOfDate || '');
  if (!asOfDate) return payload;
  const next = deepClone(payload);
  next.asOfDate = asOfDate;
  next.latestMarketplaceDate = asOfDate;
  if (Array.isArray(next.brandSummary) && next.brandSummary[0]) {
    next.brandSummary[0] = {
      ...next.brandSummary[0],
      asOfDate,
      latestMarketplaceDate: asOfDate
    };
  }
  return next;
}

function platformTrendsSnapshotHasMarketplaceFacts(payload) {
  const platforms = Array.isArray(payload?.platforms) ? payload.platforms : [];
  return Boolean(
    normalizeText(payload?.latestMarketplaceDate)
    && platforms.some((platform) => Array.isArray(platform?.series) && platform.series.length > 0)
  );
}

function collectSnapshotFallbackFiles(snapshotKey, options = {}) {
  const result = [];
  const seen = new Set();

  function addFile(filePath) {
    if (!filePath) return;
    const resolved = path.resolve(filePath);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    try {
      if (!fs.existsSync(resolved)) return;
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return;
      result.push({ filePath: resolved, mtimeMs: stat.mtimeMs });
    } catch (_error) {
      // Keep fallback discovery best-effort; bad files should not stop sync.
    }
  }

  function walk(dir, depth = 0) {
    if (!dir || depth > 4) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath, depth + 1);
      } else if (entry.isFile() && entry.name === `${snapshotKey}.json`) {
        addFile(entryPath);
      }
    }
  }

  for (const dir of [options.mirrorDataDir, options.baseDataDir, options.outputDir]) {
    if (dir) addFile(path.join(dir, `${snapshotKey}.json`));
  }
  if (options.outputDir) walk(path.join(options.outputDir, 'history'));

  return result.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function findUsableSnapshotFallback(snapshotKey, options, predicate) {
  for (const candidate of collectSnapshotFallbackFiles(snapshotKey, options)) {
    const payload = readOptionalSnapshotJson(candidate.filePath);
    if (payload && predicate(payload)) {
      return { payload, filePath: candidate.filePath };
    }
  }
  return null;
}

function dashboardMetaFromSnapshot(dashboard) {
  const summary = dashboard?.brandSummary?.[0] || {};
  return {
    latest_marketplace_date: dashboard?.dataFreshness?.asOfDate || '',
    month_plan_units: summary.plan_units || 0,
    month_fact_units: summary.fact_units_to_date || 0,
    month_fact_revenue: summary.fact_revenue_to_date || 0,
    completion_to_date_pct: summary.plan_completion_to_date_pct || 0,
    company_plan_revenue: summary.company_plan_revenue || 0,
    company_plan_to_date_revenue: summary.company_plan_to_date_revenue || 0,
    company_completion_to_date_pct: summary.company_plan_completion_to_date_pct || 0
  };
}

function platformTrendsMetaFromSnapshot(platformTrends) {
  return {
    latest_marketplace_date: platformTrends?.latestMarketplaceDate || '',
    points: platformTrends?.platforms?.[0]?.series?.length || 0
  };
}

function refreshMarketplaceFactMeta(meta, snapshots) {
  return {
    ...meta,
    dashboard: dashboardMetaFromSnapshot(snapshots.dashboard),
    platformTrends: platformTrendsMetaFromSnapshot(snapshots.platform_trends)
  };
}

function applyMarketplaceFactFallback(rows, buildResult, options) {
  const snapshots = { ...(buildResult.snapshots || {}) };
  let meta = { ...(buildResult.meta || {}) };
  const dashboardOk = dashboardSnapshotHasMarketplaceFacts(snapshots.dashboard);
  const platformTrendsOk = platformTrendsSnapshotHasMarketplaceFacts(snapshots.platform_trends);
  if (dashboardOk && platformTrendsOk) return buildResult;

  const sourceRows = Array.isArray(rows?.factMarketplace) ? rows.factMarketplace.length : 0;
  const reason = sourceRows > 0
    ? 'fact_marketplace_daily_sku has rows, but none matched portal SKU keys'
    : 'fact_marketplace_daily_sku returned 0 rows';
  const fallback = {};

  if (!dashboardOk) {
    const dashboardFallback = findUsableSnapshotFallback(
      'dashboard',
      options,
      dashboardSnapshotHasMarketplaceFacts
    );
    if (dashboardFallback) {
      snapshots.dashboard = normalizeDashboardMarketplaceAsOf(dashboardFallback.payload);
      fallback.dashboard = dashboardFallback.filePath;
    }
  }

  if (!platformTrendsOk) {
    const trendsFallback = findUsableSnapshotFallback(
      'platform_trends',
      options,
      platformTrendsSnapshotHasMarketplaceFacts
    );
    if (trendsFallback) {
      snapshots.platform_trends = trendsFallback.payload;
      fallback.platform_trends = trendsFallback.filePath;
    }
  }

  const missing = [];
  if (!dashboardSnapshotHasMarketplaceFacts(snapshots.dashboard)) missing.push('dashboard');
  if (!platformTrendsSnapshotHasMarketplaceFacts(snapshots.platform_trends)) missing.push('platform_trends');
  if (missing.length) {
    throw new Error(`${reason}; no usable fallback found for ${missing.join(', ')}`);
  }

  meta = refreshMarketplaceFactMeta(meta, snapshots);
  meta.sourceWarnings = [
    ...(Array.isArray(meta.sourceWarnings) ? meta.sourceWarnings : []),
    `${reason}; used last usable marketplace fallback snapshots instead of writing zeros`
  ];
  meta.marketplaceFactFallback = {
    reason,
    sourceRows,
    snapshots: fallback
  };

  return { ...buildResult, snapshots, meta };
}

function writeSnapshotSet(targetDir, snapshots, meta, options = {}) {
  if (!targetDir) return [];
  const written = [];
  fs.mkdirSync(targetDir, { recursive: true });
  for (const [snapshotKey, payload] of Object.entries(snapshots || {})) {
    const filePath = path.join(targetDir, `${snapshotKey}.json`);
    writeJson(filePath, payload);
    written.push(filePath);
  }
  if (options.metaFileName) {
    const metaPath = path.join(targetDir, options.metaFileName);
    writeJson(metaPath, meta);
    written.push(metaPath);
  }
  return written;
}

async function uploadSnapshot(snapshotKey, payload, options) {
  const generatedAt = payload?.generatedAt
    || payload?.dataFreshness?.asOfDate
    || payload?.window?.to
    || new Date().toISOString();
  const payloadHash = hashPayload(payload);
  const url = `${String(options.supabaseUrl).replace(/\/+$/, '')}/rest/v1/${SNAPSHOT_TABLE}?on_conflict=brand,snapshot_key`;

  async function postRow(row) {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            apikey: options.supabaseKey,
            Authorization: `Bearer ${options.supabaseKey}`,
            Prefer: 'resolution=merge-duplicates,return=minimal',
            'Content-Type': 'application/json; charset=utf-8'
          },
          body: JSON.stringify([row]),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Supabase upload failed for ${row.snapshot_key}: HTTP ${response.status} ${body}`);
        }
        return;
      } catch (error) {
        clearTimeout(timer);
        if (attempt >= 8) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  const inlineRow = {
    brand: options.brand,
    snapshot_key: snapshotKey,
    payload,
    payload_hash: payloadHash,
    source: SNAPSHOT_SOURCE,
    generated_at: generatedAt
  };
  const inlineBodySize = JSON.stringify([inlineRow]).length;
  if (inlineBodySize <= 18000) {
    await postRow(inlineRow);
    return payloadHash;
  }

  const payloadText = JSON.stringify(payload);
  const chunkSize = snapshotKey === 'logistics' ? 16000 : 24000;
  const chunkCount = Math.ceil(payloadText.length / chunkSize);
  const metaRow = {
    brand: options.brand,
    snapshot_key: snapshotKey,
    payload: {
      chunked: true,
      encoding: 'utf8-json',
      chunk_count: chunkCount,
      generatedAt: generatedAt,
      payload_hash: payloadHash
    },
    payload_hash: payloadHash,
    source: SNAPSHOT_SOURCE,
    generated_at: generatedAt
  };
  await postRow(metaRow);

  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = payloadText.slice(index * chunkSize, (index + 1) * chunkSize);
    await postRow({
      brand: options.brand,
      snapshot_key: `${snapshotKey}__part__${String(index + 1).padStart(4, '0')}`,
      payload: { data: chunk },
      payload_hash: hashPayload(chunk),
      source: SNAPSHOT_SOURCE,
      generated_at: generatedAt
    });
  }
  return payloadHash;
}

function resolveOptions(args) {
  const sourceUrl = args['source-url'] || process.env.ALTEA_GOOGLE_SHEET_URL || DEFAULT_SOURCE_URL;
  const sourceGid = args.gid || process.env.ALTEA_GOOGLE_SHEET_GID || DEFAULT_SOURCE_GID;
  const loyaltySheetName = normalizeText(args['loyalty-sheet-name'] || process.env.ALTEA_LOYALTY_SHEET_NAME || '');
  const loyaltySheetGid = normalizeText(args['loyalty-sheet-gid'] || process.env.ALTEA_LOYALTY_SHEET_GID || '');
  const profileDir = path.resolve(args['profile-dir'] || process.env.ALTEA_GOOGLE_SHEET_PROFILE_DIR || cwdJoin('.altea-google-sheets-profile'));
  const baseDataDir = path.resolve(args['base-data-dir'] || cwdJoin('data'));
  const outputDir = args['output-dir'] ? path.resolve(args['output-dir']) : '';
  const mirrorDataDir = path.resolve(args['mirror-data-dir'] || process.env.ALTEA_PORTAL_FALLBACK_DIR || baseDataDir);
  return {
    brand: args.brand || process.env.ALTEA_PORTAL_BRAND || DEFAULT_BRAND,
    sourceUrl,
    sourceGid,
    loyaltySheetName,
    loyaltySheetGid,
    sheetUrl: sourceUrl,
    exportUrl: sourceUrl.replace(/\/edit.*$/, '/export?format=xlsx'),
    sourceRefreshTimeLocal: process.env.ALTEA_GOOGLE_SHEET_REFRESH_AT || DEFAULT_SOURCE_REFRESH,
    portalRefreshTimeLocal: process.env.ALTEA_PORTAL_REFRESH_AT || DEFAULT_PORTAL_REFRESH,
    profileDir,
    baseDataDir,
    outputDir,
    mirrorDataDir,
    mirrorLocalFallback: resolveBooleanOption(args['mirror-local-fallback'], !Boolean(args.dryRun)),
    inputXlsx: args['input-xlsx'] ? path.resolve(args['input-xlsx']) : '',
    inputJson: args['input-json'] ? path.resolve(args['input-json']) : '',
    companyPlanJson: path.resolve(args['company-plan-json'] || process.env.ALTEA_COMPANY_PLAN_JSON || path.join(baseDataDir, 'company_plan.json')),
    skuAliasJson: path.resolve(args['sku-alias-json'] || process.env.ALTEA_SKU_ALIAS_JSON || path.join(baseDataDir, 'sku_aliases.json')),
    supabaseUrl: process.env.ALTEA_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    supabaseKey: process.env.ALTEA_SUPABASE_KEY || DEFAULT_SUPABASE_KEY,
    skipUpload: resolveBooleanOption(args['skip-upload'] ?? args.skipUpload, false),
    dryRun: Boolean(args.dryRun)
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const options = resolveOptions(args);
  options.companyPlan = readOptionalJson(options.companyPlanJson);

  if (args.initAuth) {
    await initAuthSession(options);
    return;
  }

  let rows;
  const resolvedInput = resolveInputBuffer(options);
  if (resolvedInput?.kind === 'json') {
    rows = resolvedInput.rows;
  } else {
    let workbookBuffer = resolvedInput?.buffer || null;
    if (!workbookBuffer) {
      try {
        workbookBuffer = await fetchDirectWorkbook(options.exportUrl);
        console.log('Workbook downloaded via direct Google export.');
      } catch (error) {
        console.log(`Direct export unavailable: ${error.message}`);
        console.log('Trying authenticated Chrome profile. If you just opened the sheet in Chrome, close that Chrome window first.');
        try {
          rows = await fetchSheetRowsViaBrowserAuth(options);
          console.log(`Sheet tabs downloaded via authenticated Chrome profile: ${options.profileDir}`);
        } catch (sheetError) {
          console.log(`Direct tab export unavailable: ${sheetError.message}`);
          workbookBuffer = await fetchWorkbookViaBrowserAuth(options);
          console.log(`Workbook downloaded via authenticated Chrome profile: ${options.profileDir}`);
        }
      }
    }
    if (!rows) rows = parseWorkbook(workbookBuffer, options);
  }

  const { snapshots, meta } = buildSnapshots(rows, options);

  let outputFiles = [];
  if (options.outputDir) {
    outputFiles = writeSnapshotSet(options.outputDir, snapshots, meta, { metaFileName: 'meta.json' });
    const outputMetaCompatPath = path.join(options.outputDir, 'google_sheet_sync_meta.json');
    writeJson(outputMetaCompatPath, meta);
    outputFiles.push(outputMetaCompatPath);
  }

  let mirroredFiles = [];
  const outputDirResolved = options.outputDir ? path.resolve(options.outputDir) : '';
  const mirrorDirResolved = options.mirrorDataDir ? path.resolve(options.mirrorDataDir) : '';
  if (options.mirrorLocalFallback && mirrorDirResolved && mirrorDirResolved !== outputDirResolved) {
    mirroredFiles = writeSnapshotSet(options.mirrorDataDir, snapshots, meta, { metaFileName: 'google_sheet_sync_meta.json' });
  }

  if (options.dryRun || options.skipUpload) {
    console.log(JSON.stringify({
      dryRun: options.dryRun,
      skipUpload: options.skipUpload,
      meta,
      outputDir: options.outputDir || '',
      outputFiles,
      mirrorLocalFallback: options.mirrorLocalFallback,
      mirrorDataDir: options.mirrorDataDir || '',
      mirroredFiles
    }, null, 2));
    return;
  }

  const uploaded = {};
  for (const snapshotKey of SNAPSHOT_KEYS.filter((key) => snapshots[key] !== undefined && snapshots[key] !== null)) {
    uploaded[snapshotKey] = await uploadSnapshot(snapshotKey, snapshots[snapshotKey], options);
  }
  console.log(JSON.stringify({
    uploaded,
    meta,
    outputDir: options.outputDir || '',
    outputFiles,
    mirrorLocalFallback: options.mirrorLocalFallback,
    mirrorDataDir: options.mirrorDataDir || '',
    mirroredFiles
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
