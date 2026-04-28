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
const SNAPSHOT_KEYS = ['dashboard', 'skus', 'platform_trends', 'logistics'];
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
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
    dimSku: requiredSheetRows(workbook, 'dim_sku'),
    factMarketplace: requiredSheetRows(workbook, 'fact_marketplace_daily_sku'),
    factLogistics: requiredSheetRows(workbook, [
      'fact_logistics_daily_cluster_warehouse_sku',
      'fact_logistics_daily_cluster_wa'
    ]),
    dimWarehouse: requiredSheetRows(workbook, 'dim_warehouse')
  };
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
      wb: normalizeText(sheetRow.owner_wb),
      ozon: normalizeText(sheetRow.owner_oz),
      ym: normalizeText(sheetRow.owner_ym),
      ga: normalizeText(sheetRow.owner_ga),
      letu: normalizeText(sheetRow.owner_letu),
      mm: normalizeText(sheetRow.owner_mm)
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
    const owner = sku?.owner?.name || '';
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
        owner,
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
        owner,
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
        owner,
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
  const logistics = buildLogistics(baseLogistics, skus, rows.factLogistics, options);
  return {
    snapshots: {
      dashboard,
      skus,
      platform_trends: platformTrends,
      logistics
    },
    meta: {
      generatedAt: new Date().toISOString(),
      sheetSource: options.inputXlsx || options.inputJson || options.sourceUrl,
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
        workbookBuffer = await fetchWorkbookViaBrowserAuth(options);
        console.log(`Workbook downloaded via authenticated Chrome profile: ${options.profileDir}`);
      }
    }
    rows = parseWorkbook(workbookBuffer);
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
