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
const SNAPSHOT_KEYS = ['dashboard', 'skus', 'platform_trends', 'logistics', 'ads_summary'];
const REQUIRED_SOURCE_SHEETS = {
  dimSku: ['dim_sku'],
  factMarketplace: ['fact_marketplace_daily_sku'],
  factAds: ['fact_ads_daily_sku'],
  factLogistics: ['fact_logistics_daily_cluster_warehouse_sku', 'fact_logistics_daily_cluster_wa'],
  dimWarehouse: ['dim_warehouse']
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
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
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
  if (!sheet) throw new Error(`В workbook нет листа ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return {
    dimSku: requiredSheetRows(workbook, REQUIRED_SOURCE_SHEETS.dimSku),
    factMarketplace: requiredSheetRows(workbook, REQUIRED_SOURCE_SHEETS.factMarketplace),
    factAds: requiredSheetRows(workbook, REQUIRED_SOURCE_SHEETS.factAds),
    factLogistics: requiredSheetRows(workbook, REQUIRED_SOURCE_SHEETS.factLogistics),
    dimWarehouse: requiredSheetRows(workbook, REQUIRED_SOURCE_SHEETS.dimWarehouse)
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

function shouldRetryWithVisibleChrome(error) {
  const message = String(error?.message || error || '');
  return /Browser\.getWindowForTarget/i.test(message) || /Browser window not found/i.test(message);
}

async function launchSyncProfileContext(options) {
  try {
    return await chromium.launchPersistentContext(options.profileDir, {
      headless: true,
      channel: 'chrome'
    });
  } catch (error) {
    if (!shouldRetryWithVisibleChrome(error)) throw error;
    console.log('Headless Chrome profile launch failed. Retrying with visible Chrome window.');
    return chromium.launchPersistentContext(options.profileDir, {
      headless: false,
      channel: 'chrome'
    });
  }
}

async function fetchWorkbookViaBrowserAuth(options) {
  const browser = await launchSyncProfileContext(options);
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
  const browser = await launchSyncProfileContext(options);
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

    const dimSkuSource = await fetchCsvRows(REQUIRED_SOURCE_SHEETS.dimSku, 'dim_sku');
    const factMarketplaceSource = await fetchCsvRows(REQUIRED_SOURCE_SHEETS.factMarketplace, 'fact_marketplace_daily_sku');
    const factAdsSource = await fetchCsvRows(REQUIRED_SOURCE_SHEETS.factAds, 'fact_ads_daily_sku');
    const factLogisticsSource = await fetchCsvRows(REQUIRED_SOURCE_SHEETS.factLogistics, 'fact_logistics_daily_cluster_warehouse_sku');
    const dimWarehouseSource = await fetchCsvRows(REQUIRED_SOURCE_SHEETS.dimWarehouse, 'dim_warehouse');

    const warnings = [];
    let dimSkuRows = dimSkuSource.rows;
    if (looksBrokenDimSkuRows(dimSkuRows)) {
      warnings.push('dim_sku returned #REF! in Google export; keeping local skus.json overlay for owners and contour metadata');
      dimSkuRows = [];
    }

    return {
      dimSku: dimSkuRows,
      factMarketplace: factMarketplaceSource.rows,
      factAds: factAdsSource.rows,
      factLogistics: factLogisticsSource.rows,
      dimWarehouse: dimWarehouseSource.rows,
      sourceMeta: {
        mode: 'google-csv-tabs',
        gids: {
          dim_sku: dimSkuSource.gid,
          fact_marketplace_daily_sku: factMarketplaceSource.gid,
          fact_ads_daily_sku: factAdsSource.gid,
          fact_logistics_daily_cluster_warehouse_sku: factLogisticsSource.gid,
          dim_warehouse: dimWarehouseSource.gid
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
      mm: canonicalOwnerName(normalizeText(sheetRow.owner_mm))
    };
    const categoriesByPlatform = {
      wb: normalizeText(sheetRow.catygory_wb),
      ozon: normalizeText(sheetRow.catygory_oz),
      ym: normalizeText(sheetRow.catygory_ym),
      ga: normalizeText(sheetRow.catygory_ga),
      letu: normalizeText(sheetRow.catygory_letu),
      mm: normalizeText(sheetRow.catygory_mm)
    };
    next.ownersByPlatform = ownersByPlatform;
    next.categoriesByPlatform = categoriesByPlatform;
    next.costPrice = numberOrNull(sheetRow.cost_price);
    next.sheetStatus = normalizeText(sheetRow.status);
    next.owner = {
      ...(next.owner || {}),
      name: canonicalOwnerName(next?.owner?.name || ''),
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

function buildAdsSummary(baseSkus, factAdsRows, options) {
  const skuByKey = new Map(baseSkus.map((item) => [normalizeKey(item.articleKey || item.article), item]));
  const relevantSkuKeys = portalSkuKeySet(baseSkus);
  const seriesBuckets = new Map();
  const itemBuckets = new Map();

  for (const row of factAdsRows || []) {
    const date = isoDate(row.date);
    const platform = normalizeMarketplace(row.platform || row.marketplace || row.data_source);
    const articleKey = normalizeKey(row.offer_id || row.offerId || row.sku);
    if (!date || !platform || !articleKey || !relevantSkuKeys.has(articleKey)) continue;
    const mapKey = `${platform}::${date}`;
    const bucket = seriesBuckets.get(mapKey) || { platform, date, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 };
    bucket.views += numberOrZero(row.views_orders);
    bucket.clicks += numberOrZero(row.clicks_orders);
    bucket.spend += numberOrZero(row.spend_orders);
    bucket.orders += numberOrZero(row.orders_count_orders);
    bucket.revenue += numberOrZero(row.orders_sum_orders);
    seriesBuckets.set(mapKey, bucket);

    const itemKey = `${platform}::${articleKey}::${date}`;
    const sku = skuByKey.get(articleKey) || null;
    const itemBucket = itemBuckets.get(itemKey) || {
      date,
      platformKey: platform,
      articleKey: sku?.articleKey || normalizeText(row.offer_id || row.offerId || row.sku),
      offerId: normalizeText(row.offer_id || row.offerId || row.sku),
      name: sku?.name || normalizeText(row.offer_id || row.offerId || row.sku) || 'SKU',
      views: 0,
      clicks: 0,
      spend: 0,
      orders: 0,
      revenue: 0
    };
    itemBucket.views += numberOrZero(row.views_orders);
    itemBucket.clicks += numberOrZero(row.clicks_orders);
    itemBucket.spend += numberOrZero(row.spend_orders);
    itemBucket.orders += numberOrZero(row.orders_count_orders);
    itemBucket.revenue += numberOrZero(row.orders_sum_orders);
    itemBuckets.set(itemKey, itemBucket);
  }

  const dates = Array.from(new Set(Array.from(seriesBuckets.values()).map((item) => item.date))).sort();
  const latestDate = dates[dates.length - 1] || '';
  const latestIndex = dates.length - 1;

  const aggregateSeries = (platformKey, date) => {
    if (platformKey === 'all') {
      return ['wb', 'ozon', 'ya'].reduce((acc, key) => {
        const source = seriesBuckets.get(`${key}::${date}`);
        if (!source) return acc;
        acc.views += source.views;
        acc.clicks += source.clicks;
        acc.spend += source.spend;
        acc.orders += source.orders;
        acc.revenue += source.revenue;
        return acc;
      }, { views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 });
    }
    return seriesBuckets.get(`${platformKey}::${date}`) || { views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 };
  };

  const platforms = PLATFORM_ORDER.map((platformKey) => ({
    key: platformKey,
    label: PLATFORM_LABELS[platformKey],
    series: dates.map((date, index) => {
      const bucket = aggregateSeries(platformKey, date);
      return {
        dayOffset: latestIndex - index,
        label: date,
        views: Number(bucket.views.toFixed(4)),
        clicks: Number(bucket.clicks.toFixed(4)),
        spend: Number(bucket.spend.toFixed(4)),
        orders: Number(bucket.orders.toFixed(4)),
        revenue: Number(bucket.revenue.toFixed(4))
      };
    })
  }));

  return {
    generatedAt: new Date().toISOString(),
    asOfDate: latestDate || null,
    note: 'Рекламная витрина daily bridge пересчитана из fact_ads_daily_sku Google Sheets. Сейчас факт есть для WB и Ozon; retail-канал в исходном листе не опубликован.',
    googleSheetsSourceUrl: options.sourceUrl,
    googleSheetsSourceGid: options.sourceGid,
    googleSheetsRefreshTimeLocal: options.sourceRefreshTimeLocal,
    portalRefreshTimeLocal: options.portalRefreshTimeLocal,
    platforms,
    itemSeries: Array.from(itemBuckets.values())
      .map((item) => ({
        ...item,
        views: Number(item.views.toFixed(4)),
        clicks: Number(item.clicks.toFixed(4)),
        spend: Number(item.spend.toFixed(4)),
        orders: Number(item.orders.toFixed(4)),
        revenue: Number(item.revenue.toFixed(4))
      }))
      .sort((left, right) =>
        String(left.date).localeCompare(String(right.date))
        || String(left.platformKey).localeCompare(String(right.platformKey))
        || String(left.articleKey).localeCompare(String(right.articleKey))
      )
  };
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

function buildDashboard(baseDashboard, skus, factRows, logisticsRows, options) {
  const next = deepClone(baseDashboard);
  const relevantSkuKeys = portalSkuKeySet(skus);
  const relevantFactRows = factRows.filter((row) => relevantSkuKeys.has(normalizeKey(row.item_code)));
  const relevantLogisticsRows = logisticsRows.filter((row) => relevantSkuKeys.has(normalizeKey(row.article)));
  const latestMarketplaceDate = latestDateOf(relevantFactRows.map((row) => row.date));
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
  const factUnits = sum(monthFactRows.map((row) => row.sales_qty));
  const factRevenue = sum(monthFactRows.map((row) => row.revenue));
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

  next.generatedAt = new Date().toISOString();
  next.dataFreshness = {
    ...(next.dataFreshness || {}),
    asOfDate: latestMarketplaceDate,
    googleSheetsMonth: monthKey,
    googleSheetsSourceUrl: options.sourceUrl,
    googleSheetsSourceGid: options.sourceGid,
    googleSheetsBridge: 'scripts/portal-google-sheet-sync.js',
    googleSheetsRefreshTimeLocal: options.sourceRefreshTimeLocal,
    portalRefreshTimeLocal: options.portalRefreshTimeLocal
  };

  const cards = Array.isArray(next.cards) ? next.cards : [];
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
  next.cards = cards;

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
  next.brandSummary[0] = summary;
  return next;
}

function buildLogistics(baseLogistics, skus, factLogisticsRows, options) {
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
  next.summaryCards = summaryCards;

  if (next.centralWarehouse && typeof next.centralWarehouse === 'object') {
    const centralRows = latestRows.filter((row) => /балаших|central/i.test(normalizeText(row.warehouse_name)));
    if (centralRows.length) {
      next.centralWarehouse.stock = sum(centralRows.map((row) => numberOrZero(row.wb_stock) + numberOrZero(row.ozon_stock) + numberOrZero(row.yandex_stock)));
    }
  }

  return next;
}

function buildSnapshots(rows, options) {
  const baseDir = options.baseDataDir;
  const baseDashboard = readJson(path.join(baseDir, 'dashboard.json'));
  const baseSkus = readJson(path.join(baseDir, 'skus.json'));
  const baseLogistics = readJson(path.join(baseDir, 'logistics.json'));
  const { skus, updatedCount } = buildSkuOverlay(baseSkus, rows.dimSku);
  const dashboard = buildDashboard(baseDashboard, skus, rows.factMarketplace, rows.factLogistics, options);
  const platformTrends = buildPlatformTrends(skus, rows.factMarketplace, options);
  const adsSummary = buildAdsSummary(skus, rows.factAds, options);
  const logistics = buildLogistics(baseLogistics, skus, rows.factLogistics, options);
  return {
    snapshots: {
      dashboard,
      skus,
      platform_trends: platformTrends,
      logistics,
      ads_summary: adsSummary
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sheetSource: options.inputXlsx || options.inputJson || options.sourceUrl,
      sourceMode: rows?.sourceMeta?.mode || (options.inputJson ? 'input-json' : options.inputXlsx ? 'input-xlsx' : 'google-workbook'),
      sourceGids: rows?.sourceMeta?.gids || {},
      sourceWarnings: rows?.sourceMeta?.warnings || [],
      updatedSkus: updatedCount,
      dashboard: {
        latest_marketplace_date: dashboard.dataFreshness?.asOfDate || '',
        month_plan_units: dashboard.brandSummary?.[0]?.plan_units || 0,
        month_fact_units: dashboard.brandSummary?.[0]?.fact_units_to_date || 0,
        month_fact_revenue: dashboard.brandSummary?.[0]?.fact_revenue_to_date || 0,
        completion_to_date_pct: dashboard.brandSummary?.[0]?.plan_completion_to_date_pct || 0
      },
      platformTrends: {
        latest_marketplace_date: platformTrends.latestMarketplaceDate || '',
        points: platformTrends.platforms?.[0]?.series?.length || 0
      },
      adsSummary: {
        latest_ads_date: adsSummary.asOfDate || '',
        platforms_with_ads: (adsSummary.platforms || []).filter((platform) =>
          Array.isArray(platform?.series) && platform.series.some((item) =>
            numberOrZero(item?.views) > 0
            || numberOrZero(item?.clicks) > 0
            || numberOrZero(item?.orders) > 0
            || numberOrZero(item?.spend) > 0
            || numberOrZero(item?.revenue) > 0
          )
        ).length,
        item_rows: adsSummary.itemSeries?.length || 0
      },
      logistics: {
        latest_logistics_date: logistics.window?.to || '',
        ozon_cluster_count: logistics.ozonClusters?.length || 0,
        ozon_warehouse_count: logistics.ozonWarehouses?.length || 0,
        wb_warehouse_count: logistics.wbWarehouses?.length || 0
      }
    }
  };
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
  const profileDir = path.resolve(args['profile-dir'] || process.env.ALTEA_GOOGLE_SHEET_PROFILE_DIR || cwdJoin('.altea-google-sheets-profile'));
  const baseDataDir = path.resolve(args['base-data-dir'] || cwdJoin('data'));
  const outputDir = args['output-dir'] ? path.resolve(args['output-dir']) : '';
  const mirrorDataDir = path.resolve(args['mirror-data-dir'] || process.env.ALTEA_PORTAL_FALLBACK_DIR || baseDataDir);
  return {
    brand: args.brand || process.env.ALTEA_PORTAL_BRAND || DEFAULT_BRAND,
    sourceUrl,
    sourceGid,
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
    supabaseUrl: process.env.ALTEA_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    supabaseKey: process.env.ALTEA_SUPABASE_KEY || DEFAULT_SUPABASE_KEY,
    skipUpload: resolveBooleanOption(args['skip-upload'], false),
    dryRun: Boolean(args.dryRun)
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const options = resolveOptions(args);

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
    if (!rows) rows = parseWorkbook(workbookBuffer);
  }

  const { snapshots, meta } = buildSnapshots(rows, options);

  let outputFiles = [];
  if (options.outputDir) {
    outputFiles = writeSnapshotSet(options.outputDir, snapshots, meta, { metaFileName: 'meta.json' });
  }

  let mirroredFiles = [];
  const outputDirResolved = options.outputDir ? path.resolve(options.outputDir) : '';
  const mirrorDirResolved = options.mirrorDataDir ? path.resolve(options.mirrorDataDir) : '';
  if (options.mirrorLocalFallback && mirrorDirResolved && mirrorDirResolved !== outputDirResolved) {
    mirroredFiles = writeSnapshotSet(options.mirrorDataDir, snapshots, meta, { metaFileName: 'google_sheet_sync_meta.json' });
  }

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      meta,
      outputDir: options.outputDir || '',
      outputFiles,
      mirrorLocalFallback: options.mirrorLocalFallback,
      mirrorDataDir: options.mirrorDataDir || '',
      mirroredFiles
    }, null, 2));
    return;
  }

  if (options.skipUpload) {
    console.log(JSON.stringify({
      skippedUpload: true,
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
  for (const snapshotKey of SNAPSHOT_KEYS) {
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
