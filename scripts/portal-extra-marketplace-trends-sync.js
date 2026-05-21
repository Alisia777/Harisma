#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_WORKBOOK = 'exports/altea_max_funnel_2025_2026.xlsx';
const EXTRA_PLATFORM_ORDER = ['goldapple', 'letu', 'magnit'];
const EXTRA_PLATFORM_LABELS = {
  goldapple: 'ЗЯ',
  letu: 'Лэтуаль',
  magnit: 'Магнит Маркет'
};
const ADS_PLATFORM_ORDER = ['ozon', 'ya', ...EXTRA_PLATFORM_ORDER];
const PLATFORM_KEY_ALIASES = {
  ya: 'ya',
  ym: 'ya',
  'я.маркет': 'ya',
  'я маркет': 'ya',
  yandex: 'ya',
  'yandex market': 'ya',
  goldapple: 'goldapple',
  ga: 'goldapple',
  zya: 'goldapple',
  'зя': 'goldapple',
  'золотое яблоко': 'goldapple',
  'золотоеяблоко': 'goldapple',
  letu: 'letu',
  'летуаль': 'letu',
  'лэтуаль': 'letu',
  magnit: 'magnit',
  mm: 'magnit',
  magnitmarket: 'magnit',
  'магнит маркет': 'magnit',
  'магнитмаркет': 'magnit'
};
const PLATFORM_SUPPORT_KEYS = {
  ya: 'ym',
  goldapple: 'ga',
  letu: 'letu',
  magnit: 'mm'
};

function parseArgs(argv) {
  const args = { command: 'sync' };
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

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function readJson(filePath, fallback = null) {
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

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function firstFiniteOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeSkuToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z\u0430-\u044f\u04510-9]+/giu, '');
}

const OUT_OF_SCOPE_BRAND_TOKENS = [
  'qeep',
  'qip',
  'harly',
  'harley',
  '\u043a\u0432\u0438\u043f',
  '\u0445\u0430\u0440\u043b\u0438'
].map((token) => normalizeSkuToken(token));

function isOutOfScopeBrandText(value) {
  const compact = normalizeSkuToken(value);
  return Boolean(compact) && OUT_OF_SCOPE_BRAND_TOKENS.some((token) => token && compact.includes(token));
}

function isOutOfScopeBrandRow(row = {}) {
  return [
    row.brand,
    row.brandName,
    row.brand_name,
    row.article,
    row.articleKey,
    row.sourceArticleKey,
    row.sku,
    row.offer_id,
    row.offerId,
    row.vendorCode,
    row.name,
    row.offerName,
    row.productName,
    row.campaignName,
    row.campaign
  ].some(isOutOfScopeBrandText);
}

function canonicalPlatformKey(value) {
  const raw = normalizeKey(value);
  return PLATFORM_KEY_ALIASES[raw] || raw;
}

function platformLabel(key) {
  return ({ ...EXTRA_PLATFORM_LABELS, ya: 'Я.Маркет', wb: 'WB', ozon: 'Ozon', all: 'Все площадки' })[canonicalPlatformKey(key)] || String(key || '').toUpperCase();
}

function supportKeyForPlatform(key) {
  return PLATFORM_SUPPORT_KEYS[canonicalPlatformKey(key)] || canonicalPlatformKey(key);
}

function aliasPlatformMatches(value, platformKey) {
  const raw = normalizeKey(value);
  if (!raw || ['all', 'any', '*'].includes(raw)) return true;
  return supportKeyForPlatform(canonicalPlatformKey(raw)) === supportKeyForPlatform(platformKey);
}

function skuAliasRows(payload = {}) {
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

function activeSkuAliasRows(payload = {}) {
  return skuAliasRows(payload).filter((row) => {
    const status = normalizeSkuToken(row?.status ?? row?.active ?? 'active');
    return !['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove', 'ignore', 'skip'].includes(status);
  });
}

function firstTextValue(row, names) {
  for (const name of names) {
    const value = normalizeText(row?.[name]);
    if (value) return value;
  }
  return '';
}

function articleKeyForSku(sku, fallback = '') {
  return normalizeText(sku?.articleKey || sku?.article || sku?.sku || sku?.vendorCode || fallback);
}

function articleNameForSku(sku, fallback = '') {
  return normalizeText(sku?.name || sku?.title || fallback);
}

function skuLookupTokens(sku = {}, platformKey = '') {
  const supportKey = supportKeyForPlatform(platformKey);
  const platformBucket = sku?.[supportKey] || sku?.[canonicalPlatformKey(platformKey)] || {};
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.nmId,
    sku.nmID,
    sku.barcode,
    platformBucket.offerId,
    platformBucket.offer_id,
    platformBucket.vendorCode,
    platformBucket.vendor_code,
    platformBucket.sku
  ];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') {
        values.push(alias);
        return;
      }
      if (platformKey && !aliasPlatformMatches(alias?.platform || alias?.marketplace || alias?.sourcePlatform, platformKey)) return;
      values.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.offer_id, alias?.vendorCode);
    });
  }
  Object.entries(sku.platformAliases || {}).forEach(([aliasPlatform, aliases]) => {
    if (platformKey && !aliasPlatformMatches(aliasPlatform, platformKey)) return;
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });
  return values;
}

function buildSkuLookup(skus = [], skuAliases = {}) {
  const lookup = new Map();
  const addToken = (value, sku) => {
    const token = normalizeSkuToken(value);
    if (token && !lookup.has(token)) lookup.set(token, sku);
  };

  for (const sku of Array.isArray(skus) ? skus : []) {
    skuLookupTokens(sku).forEach((value) => addToken(value, sku));
    EXTRA_PLATFORM_ORDER.forEach((platformKey) => skuLookupTokens(sku, platformKey).forEach((value) => addToken(value, sku)));
  }

  for (const row of activeSkuAliasRows(skuAliases)) {
    const platform = canonicalPlatformKey(firstTextValue(row, ['platform', 'marketplace', 'source_platform', 'sourcePlatform']));
    if (platform && !EXTRA_PLATFORM_ORDER.includes(platform)) continue;
    const targetToken = normalizeSkuToken(firstTextValue(row, ['target_sku', 'targetSku', 'target', 'portal_sku', 'article_key', 'articleKey', 'sku']));
    const aliasValue = firstTextValue(row, ['api_sku', 'apiSku', 'api_article', 'alias', 'value', 'source_sku', 'marketplace_sku', 'external_sku', 'offer_id', 'offerId', 'vendor_code', 'vendorCode']);
    const targetSku = lookup.get(targetToken);
    if (targetSku) addToken(aliasValue, targetSku);
  }

  return lookup;
}

function monthKeyFromHeader(header) {
  const match = String(header || '').trim().match(/^(\d{2})\.(\d{4})$/);
  if (!match) return '';
  return `${match[2]}-${match[1]}`;
}

function monthStart(monthKey) {
  return `${String(monthKey || '').slice(0, 7)}-01`;
}

function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const ru = raw.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?$/);
  if (ru) {
    const year = ru[3] ? Number(ru[3].length === 2 ? `20${ru[3]}` : ru[3]) : new Date().getFullYear();
    return `${year}-${String(Number(ru[2])).padStart(2, '0')}-${String(Number(ru[1])).padStart(2, '0')}`;
  }
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function parseDate(value) {
  const iso = isoDate(value);
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, offset) {
  const next = cleanDate(date);
  next.setDate(next.getDate() + offset);
  return next;
}

function iso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(monthKeyValue) {
  const match = String(monthKeyValue || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return {
    start: new Date(year, monthIndex, 1),
    end: new Date(year, monthIndex + 1, 0)
  };
}

function dayCount(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) return 0;
  return Math.max(0, Math.round((cleanDate(end) - cleanDate(start)) / 86400000)) + 1;
}

function enumerateDates(from, to) {
  const result = [];
  let cursor = parseDate(from);
  const end = parseDate(to);
  while (cursor && end && cursor <= end) {
    result.push(iso(cursor));
    cursor = addDays(cursor, 1);
  }
  return result;
}

function daysCoveredForMonth(monthKeyValue, asOfDate) {
  const bounds = monthRange(monthKeyValue);
  if (!bounds || !(asOfDate instanceof Date) || Number.isNaN(asOfDate.getTime())) return 0;
  if (bounds.start > asOfDate) return 0;
  const end = monthKey(bounds.start) === monthKey(asOfDate) ? new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate()) : bounds.end;
  return dayCount(bounds.start, end);
}

function distributeMonthlyValue(total, days) {
  const value = numberOrZero(total);
  if (!(days > 0)) return [];
  const daily = value / days;
  return Array.from({ length: days }, () => daily);
}

function rawMetricValue(metricName, row) {
  const metric = normalizeKey(metricName);
  const names = {
    orders_units: ['orders_units', 'заказано, шт.', 'заказы, шт.', 'заказы шт', 'заказы'],
    orders_revenue: ['orders_revenue', 'заказано, руб.', 'заказы, руб.', 'оборот', 'выручка'],
    delivered_units: ['delivered_units', 'доставлено, шт.', 'доставлено шт'],
    delivered_revenue: ['delivered_revenue', 'доставлено, руб.', 'доставлено руб'],
    buyout_units: ['buyout_units', 'выкуплено, шт.', 'выкупы, шт.', 'выкупили, шт.'],
    buyout_revenue: ['buyout_revenue', 'выкуплено, руб.', 'выкупы, руб.', 'выкупили, руб.'],
    cancellations_units: ['cancellations_units', 'отмены, шт.', 'отмена, шт.'],
    cancel_revenue: ['cancel_revenue', 'отмены, руб.', 'отмена, руб.'],
    returns_units: ['returns_units', 'возвраты, шт.'],
    ads_impressions: ['ads_impressions', 'реклама: показы', 'показы', 'показы / просмотры всего'],
    ads_clicks: ['ads_clicks', 'реклама: клики', 'клики'],
    ads_spend: ['ads_spend', 'реклама: расход', 'расход', 'сумма', 'стоимость'],
    ads_orders: ['ads_orders', 'реклама: заказы'],
    ads_revenue: ['ads_revenue', 'реклама: выручка'],
    net_payout: ['net_payout', 'к перечислению / net payout', 'к перечислению', 'нет-пэйаут']
  };
  const list = names[metric] || [metric];
  for (const key of list) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const raw = row[key];
      if (raw !== '' && raw !== null && raw !== undefined) return numberOrZero(raw);
    }
  }
  return null;
}

function loadWorkbookData(workbook, sheetName) {
  if (!workbook.Sheets[sheetName]) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
}

function platformMonthlyTotals(rawRows, asOfDate) {
  const platforms = new Map();
  const monthHeaders = Object.keys(rawRows[0] || {}).filter((header) => /^\d{2}\.\d{4}$/.test(String(header)));

  const normalizeRowPlatform = (row) => canonicalPlatformKey(row.platform_key || row.platformKey || row.platform);
  const setMonthlyMetric = (bucket, field, value, priority) => {
    const priorityField = `${field}Priority`;
    if (!(value > 0)) return;
    if (priority >= numberOrZero(bucket[priorityField])) {
      bucket[field] = value;
      bucket[priorityField] = priority;
    }
  };

  if (!monthHeaders.length) {
    const allowedPlatforms = new Set(['wb', 'ozon', 'ya', ...EXTRA_PLATFORM_ORDER]);
    for (const row of rawRows) {
      if (normalizeKey(row.level || row['level']) !== 'total') continue;
      const platformKey = normalizeRowPlatform(row);
      if (!allowedPlatforms.has(platformKey)) continue;
      const month = normalizeText(row.month || row['month']);
      const monthDate = parseDate(`${month}-01`);
      if (!month || !monthDate || monthDate > asOfDate) continue;
      const metric = normalizeKey(row.metric_key || row.metric || '');
      const value = numberOrZero(row.value);
      const platform = platforms.get(platformKey) || new Map();
      const current = platform.get(month) || {
        monthKey: month,
        units: 0,
        unitsPriority: 0,
        revenue: 0,
        revenuePriority: 0,
        estimatedMargin: 0,
        estimatedMarginPriority: 0,
        adsSpend: 0,
        adsSpendPriority: 0
      };
      if (metric === 'orders_units') setMonthlyMetric(current, 'units', value, platformKey === 'ya' ? 2 : 3);
      else if (metric === 'delivered_units') setMonthlyMetric(current, 'units', value, platformKey === 'ya' ? 3 : 2);
      else if (metric === 'buyout_units') setMonthlyMetric(current, 'units', value, 1);

      if (metric === 'orders_revenue') setMonthlyMetric(current, 'revenue', value, platformKey === 'ya' ? 2 : 3);
      else if (metric === 'buyout_revenue') setMonthlyMetric(current, 'revenue', value, 2);
      else if (metric === 'delivered_revenue') setMonthlyMetric(current, 'revenue', value, platformKey === 'ya' ? 3 : 1);
      else if (metric === 'net_payout') {
        setMonthlyMetric(current, 'revenue', value, 0);
        setMonthlyMetric(current, 'estimatedMargin', value, 3);
      }

      if (metric === 'ads_spend') setMonthlyMetric(current, 'adsSpend', value, 1);
      platform.set(month, current);
      platforms.set(platformKey, platform);
    }
    for (const platform of platforms.values()) {
      for (const month of platform.values()) {
        if (!(month.estimatedMargin > 0) && month.revenue > 0 && month.adsSpend > 0) {
          month.estimatedMargin = Math.max(0, month.revenue - month.adsSpend);
        }
      }
    }
    return platforms;
  }

  for (const row of rawRows) {
    if (normalizeKey(row.level || row['level']) !== 'total') continue;
    const platformKey = normalizeRowPlatform(row);
    if (!EXTRA_PLATFORM_ORDER.includes(platformKey) && platformKey !== 'ya') continue;
    const platform = platforms.get(platformKey) || new Map();
    for (const header of monthHeaders) {
      const month = monthKeyFromHeader(header);
      if (!month) continue;
      const monthDate = parseDate(`${month}-01`);
      if (!monthDate || monthDate > asOfDate) continue;
      const current = platform.get(month) || {
        monthKey: month,
        ordersUnits: 0,
        ordersRevenue: 0,
        deliveredUnits: 0,
        deliveredRevenue: 0,
        buyoutUnits: 0,
        buyoutRevenue: 0,
        cancellationsUnits: 0,
        cancelRevenue: 0,
        returnsUnits: 0,
        adsImpressions: 0,
        adsClicks: 0,
        adsSpend: 0,
        adsOrders: 0,
        adsRevenue: 0,
        netPayout: 0
      };
      const metric = normalizeKey(row.metric_key || row.metric || '');
      const value = numberOrZero(row[header]);
      if (metric === 'orders_units') current.ordersUnits += value;
      else if (metric === 'orders_revenue') current.ordersRevenue += value;
      else if (metric === 'delivered_units') current.deliveredUnits += value;
      else if (metric === 'delivered_revenue') current.deliveredRevenue += value;
      else if (metric === 'buyout_units') current.buyoutUnits += value;
      else if (metric === 'buyout_revenue') current.buyoutRevenue += value;
      else if (metric === 'cancellations_units') current.cancellationsUnits += value;
      else if (metric === 'cancel_revenue') current.cancelRevenue += value;
      else if (metric === 'returns_units') current.returnsUnits += value;
      else if (metric === 'ads_impressions' || metric === 'impressions_total') current.adsImpressions += value;
      else if (metric === 'ads_clicks' || metric === 'pdp_views' || metric === 'traffic_card_opens') current.adsClicks += value;
      else if (metric === 'ads_spend') current.adsSpend += value;
      else if (metric === 'ads_orders' || metric === 'add_to_cart_total' || metric === 'order_cr') current.adsOrders += value;
      else if (metric === 'ads_revenue') current.adsRevenue += value;
      else if (metric === 'net_payout') current.netPayout += value;
      platform.set(month, current);
    }
    platforms.set(platformKey, platform);
  }

  const result = new Map();
  for (const [platformKey, months] of platforms.entries()) {
    const monthList = [...months.values()].sort((left, right) => left.monthKey.localeCompare(right.monthKey));
    const series = [];
    for (const month of monthList) {
      const days = daysCoveredForMonth(month.monthKey, asOfDate);
      if (!days) continue;
      const revenue = platformKey === 'ya'
        ? (month.deliveredRevenue || month.ordersRevenue || month.buyoutRevenue || month.netPayout || 0)
        : (month.ordersRevenue || month.buyoutRevenue || month.netPayout || 0);
      const estimatedMargin = month.netPayout > 0
        ? month.netPayout
        : platformKey === 'ya' && revenue > 0 && month.adsSpend > 0
          ? Math.max(0, revenue - month.adsSpend)
          : month.buyoutRevenue > 0 && month.adsSpend > 0
          ? Math.max(0, month.buyoutRevenue - month.adsSpend)
          : month.ordersRevenue > 0 && month.adsSpend > 0
            ? Math.max(0, month.ordersRevenue - month.adsSpend)
            : null;
      const unitTotal = platformKey === 'ya' ? (month.deliveredUnits || month.ordersUnits) : month.ordersUnits;
      const dailyUnits = distributeMonthlyValue(unitTotal, days);
      const dailyRevenue = distributeMonthlyValue(revenue, days);
      const dailyMargin = estimatedMargin != null ? distributeMonthlyValue(estimatedMargin, days) : [];
      const bounds = monthRange(month.monthKey);
      if (!bounds) continue;
      const activeEnd = monthKey(asOfDate) === month.monthKey ? asOfDate : bounds.end;
      for (let offset = 0; offset < days; offset += 1) {
        const date = addDays(bounds.start, offset);
        if (date > activeEnd) break;
        series.push({
          date: iso(date),
          label: iso(date),
          units: dailyUnits[offset] || 0,
          revenue: dailyRevenue[offset] || 0,
          estimatedMargin: dailyMargin[offset] || 0
        });
      }
    }
    result.set(platformKey, series);
  }
  return result;
}

function buildArticleRows(rows, skus, skuAliases, asOfDate) {
  const skuLookup = buildSkuLookup(skus, skuAliases);
  const monthHeaders = Object.keys(rows[0] || {}).filter((header) => /^\d{2}\.\d{4}$/.test(String(header)));
  const grouped = new Map();

  for (const row of rows) {
    const platformKey = canonicalPlatformKey(row['Площадка'] || row.platform || row.marketplace);
    if (!EXTRA_PLATFORM_ORDER.includes(platformKey)) continue;
    const sourceArticleKey = normalizeText(row['Артикул/SKU'] || row.article || row.sku || row.offer_id || row.vendorCode);
    if (!sourceArticleKey) continue;
    if (isOutOfScopeBrandRow(row) || isOutOfScopeBrandText(sourceArticleKey)) continue;
    const sku = skuLookup.get(normalizeSkuToken(sourceArticleKey)) || null;
    const articleKey = articleKeyForSku(sku, sourceArticleKey);
    const name = articleNameForSku(sku, normalizeText(row['Название'] || row.name || row.offerName || row.productName) || articleKey);
    const metric = normalizeKey(row['Метрика'] || row.metric || row.metric_key);
    const bucketKey = `${platformKey}|${normalizeSkuToken(articleKey)}`;
    const bucket = grouped.get(bucketKey) || {
      platformKey,
      articleKey,
      article: articleKey,
      name,
      sku,
      skuMatched: Boolean(sku),
      sourceArticleKeys: new Set(),
      metrics: new Map(),
      source: 'SKU_месяцы'
    };
    bucket.name = bucket.name || name;
    bucket.sku = bucket.sku || sku;
    bucket.skuMatched = bucket.skuMatched || Boolean(sku);
    bucket.sourceArticleKeys.add(sourceArticleKey);
    const series = bucket.metrics.get(metric) || new Map();
    for (const header of monthHeaders) {
      const month = monthKeyFromHeader(header);
      if (!month) continue;
      const monthDate = parseDate(`${month}-01`);
      if (!monthDate || monthDate > asOfDate) continue;
      const raw = row[header];
      if (raw === '' || raw === null || raw === undefined) continue;
      series.set(month, numberOrZero(series.get(month)) + numberOrZero(raw));
    }
    bucket.metrics.set(metric, series);
    grouped.set(bucketKey, bucket);
  }

  const ownerKeyMap = {
    goldapple: 'ga',
    letu: 'letu',
    magnit: 'mm'
  };

  const result = [];
  for (const bucket of grouped.values()) {
    const months = new Map();
    const metricSeries = bucket.metrics;
    const availableMonths = new Set();
    for (const series of metricSeries.values()) {
      for (const month of series.keys()) availableMonths.add(month);
    }
    [...availableMonths].sort().forEach((month) => {
      const ordersUnits = metricSeries.get('orders_units')?.get(month) ?? metricSeries.get('заказы, шт.')?.get(month) ?? 0;
      const ordersRevenue = metricSeries.get('orders_revenue')?.get(month) ?? metricSeries.get('заказы, руб.')?.get(month) ?? 0;
      const deliveredUnits = metricSeries.get('delivered_units')?.get(month) ?? 0;
      const deliveredRevenue = metricSeries.get('delivered_revenue')?.get(month) ?? 0;
      const buyoutUnits = metricSeries.get('buyout_units')?.get(month) ?? 0;
      const buyoutRevenue = metricSeries.get('buyout_revenue')?.get(month) ?? 0;
      const cancellationsUnits = metricSeries.get('cancellations_units')?.get(month) ?? 0;
      const cancelRevenue = metricSeries.get('cancel_revenue')?.get(month) ?? 0;
      const returnsUnits = metricSeries.get('returns_units')?.get(month) ?? 0;
      const adsImpressions = metricSeries.get('ads_impressions')?.get(month) ?? metricSeries.get('impressions_total')?.get(month) ?? 0;
      const adsClicks = metricSeries.get('ads_clicks')?.get(month) ?? metricSeries.get('pdp_views')?.get(month) ?? metricSeries.get('traffic_card_opens')?.get(month) ?? 0;
      const adsSpend = metricSeries.get('ads_spend')?.get(month) ?? 0;
      const adsOrders = metricSeries.get('ads_orders')?.get(month) ?? 0;
      const adsRevenue = metricSeries.get('ads_revenue')?.get(month) ?? 0;
      const netPayout = metricSeries.get('net_payout')?.get(month) ?? 0;
      const revenue = ordersRevenue || buyoutRevenue || netPayout || 0;
      const estimatedMargin = netPayout > 0
        ? netPayout
        : buyoutRevenue > 0 && adsSpend > 0
          ? Math.max(0, buyoutRevenue - adsSpend)
          : ordersRevenue > 0 && adsSpend > 0
            ? Math.max(0, ordersRevenue - adsSpend)
            : null;
      const avgOrderValue = ordersUnits > 0 ? revenue / ordersUnits : 0;
      const buyoutPct = ordersUnits > 0 && buyoutUnits > 0 ? buyoutUnits / ordersUnits : null;
      const adsCtr = adsImpressions > 0 && adsClicks > 0 ? adsClicks / adsImpressions : null;
      const adsDrr = adsRevenue > 0 && adsSpend > 0 ? adsSpend / adsRevenue : null;
      months.set(month, {
        monthKey: month,
        date: monthStart(month),
        units: ordersUnits,
        ordersUnits,
        revenue,
        deliveredUnits,
        deliveredRevenue,
        buyoutUnits,
        buyoutRevenue,
        cancellationsUnits,
        cancelRevenue,
        returnsUnits,
        adsImpressions,
        adsClicks,
        adsSpend,
        adsOrders,
        adsRevenue,
        avgOrderValue,
        ltvProxy: avgOrderValue,
        buyoutPct,
        adsCtr,
        adsDrr,
        estimatedMargin,
        price: avgOrderValue
      });
    });

    const monthly = [...months.values()].sort((left, right) => left.monthKey.localeCompare(right.monthKey));
    const daily = [];
    for (const month of monthly) {
      const bounds = monthRange(month.monthKey);
      if (!bounds) continue;
      const days = daysCoveredForMonth(month.monthKey, asOfDate);
      if (!days) continue;
      const dailyOrdersUnits = distributeMonthlyValue(month.ordersUnits, days);
      const dailyRevenue = distributeMonthlyValue(month.revenue, days);
      const dailyAdsSpend = distributeMonthlyValue(month.adsSpend, days);
      const dailyAdsRevenue = distributeMonthlyValue(month.adsRevenue, days);
      const dailyAdsOrders = distributeMonthlyValue(month.adsOrders, days);
      const dailyAdsImpressions = distributeMonthlyValue(month.adsImpressions, days);
      const dailyAdsClicks = distributeMonthlyValue(month.adsClicks, days);
      const dailyEstimatedMargin = month.estimatedMargin != null ? distributeMonthlyValue(month.estimatedMargin, days) : [];
      const activeEnd = monthKey(asOfDate) === month.monthKey ? asOfDate : bounds.end;
      for (let offset = 0; offset < days; offset += 1) {
        const date = addDays(bounds.start, offset);
        if (date > activeEnd) break;
        daily.push({
          date: iso(date),
          units: dailyOrdersUnits[offset] || 0,
          ordersUnits: dailyOrdersUnits[offset] || 0,
          deliveredUnits: dailyOrdersUnits[offset] || 0,
          revenue: dailyRevenue[offset] || 0,
          adsSpend: dailyAdsSpend[offset] || 0,
          adsRevenue: dailyAdsRevenue[offset] || 0,
          adsOrders: dailyAdsOrders[offset] || 0,
          adsImpressions: dailyAdsImpressions[offset] || 0,
          adsClicks: dailyAdsClicks[offset] || 0,
          price: dailyOrdersUnits[offset] > 0 ? (dailyRevenue[offset] || 0) / dailyOrdersUnits[offset] : month.price,
          estimatedMargin: dailyEstimatedMargin[offset] || 0,
          turnoverDays: null
        });
      }
    }

    const latestMonth = monthly[monthly.length - 1] || null;
    const latestPrice = latestMonth ? numberOrZero(latestMonth.price) : 0;
    const latestMarginPct = latestMonth && latestMonth.revenue > 0 && latestMonth.estimatedMargin != null
      ? latestMonth.estimatedMargin / latestMonth.revenue
      : null;
    const ownerKey = ownerKeyMap[bucket.platformKey] || bucket.platformKey;
    const sku = bucket.sku || null;
    const sourceArticleKeys = Array.from(bucket.sourceArticleKeys || []);

    result.push({
      platformKey: bucket.platformKey,
      platformLabel: platformLabel(bucket.platformKey),
      articleKey: bucket.articleKey,
      article: bucket.article,
      sourceArticleKey: sourceArticleKeys[0] || bucket.articleKey,
      sourceArticleKeys,
      skuMatched: Boolean(sku),
      name: bucket.name || bucket.articleKey,
      owner: sku?.ownersByPlatform?.[ownerKey] || sku?.owner?.byPlatform?.[ownerKey] || sku?.owner?.name || '',
      currentPrice: latestPrice,
      currentClientPrice: latestPrice,
      currentFillPrice: latestPrice,
      minPrice: null,
      stock: 0,
      turnoverDays: null,
      currentTurnoverDays: null,
      marginPct: latestMarginPct,
      estimatedMarginPct: latestMarginPct,
      monthly,
      daily,
      source: bucket.source
    });
  }

  return result;
}

function adsMetricTarget(metric) {
  const key = normalizeKey(metric);
  const map = {
    ads_impressions: { field: 'views', priority: 3 },
    impressions_total: { field: 'views', priority: 2 },
    ads_clicks: { field: 'clicks', priority: 3 },
    pdp_views: { field: 'clicks', priority: 2 },
    add_to_cart_total: { field: 'clicks', priority: 1 },
    traffic_card_opens: { field: 'clicks', priority: 1 },
    ads_spend: { field: 'spend', priority: 1 },
    ads_orders: { field: 'orders', priority: 3 },
    orders_units: { field: 'orders', priority: 2 },
    ads_revenue: { field: 'revenue', priority: 3 },
    orders_revenue: { field: 'revenue', priority: 2 },
    net_payout: { field: 'revenue', priority: 1 },
    revenue: { field: 'revenue', priority: 0 }
  };
  return map[key] || null;
}

function setPriorityMetric(bucket, metric, value) {
  const target = adsMetricTarget(metric);
  if (!target || !(value > 0)) return;
  const priorityField = `${target.field}Priority`;
  if (target.priority >= numberOrZero(bucket[priorityField])) {
    bucket[target.field] = value;
    bucket[priorityField] = target.priority;
  }
}

function addPriorityMetric(bucket, metric, value) {
  const target = adsMetricTarget(metric);
  if (!target || !(value > 0)) return;
  const priorityField = `${target.field}Priority`;
  const currentPriority = numberOrZero(bucket[priorityField]);
  if (target.priority > currentPriority) {
    bucket[target.field] = 0;
    bucket[priorityField] = target.priority;
  }
  if (target.priority === numberOrZero(bucket[priorityField])) {
    bucket[target.field] += value;
  }
}

function buildAdsItemSeries(rawRows, asOfDate) {
  const grouped = new Map();
  const totalGrouped = new Map();
  const skuMonthPresence = new Set();
  const allowedPlatforms = new Set(ADS_PLATFORM_ORDER);

  for (const row of Array.isArray(rawRows) ? rawRows : []) {
    const platformKey = canonicalPlatformKey(row.platform_key || row.platformKey || row.platform);
    if (!allowedPlatforms.has(platformKey)) continue;
    const level = normalizeKey(row.level || row['level']);
    const month = normalizeText(row.month || row['month']);
    const monthDate = parseDate(`${month}-01`);
    if (!month || !monthDate || monthDate > asOfDate) continue;
    const articleKey = normalizeText(row.article || row.sku || row.offer_id || row.vendorCode);
    const metric = normalizeKey(row.metric_key || row.metric || '');
    const value = numberOrZero(row.value);
    if (!adsMetricTarget(metric)) continue;
    if (level === 'total') {
      const bucketKey = `${platformKey}|__total|${month}`;
      const bucket = totalGrouped.get(bucketKey) || {
        date: monthStart(month),
        platformKey,
        articleKey: `${platformKey}-total`,
        article: `${platformKey}-total`,
        name: `${platformLabel(platformKey)} · итого`,
        views: 0,
        viewsPriority: 0,
        clicks: 0,
        clicksPriority: 0,
        spend: 0,
        spendPriority: 0,
        orders: 0,
        ordersPriority: 0,
        revenue: 0,
        revenuePriority: 0
      };
      setPriorityMetric(bucket, metric, value);
      totalGrouped.set(bucketKey, bucket);
      continue;
    }
    if (level !== 'sku') continue;
    if (!articleKey) continue;
    skuMonthPresence.add(`${platformKey}|${month}`);
    if (isOutOfScopeBrandRow(row)) continue;
    const name = normalizeText(row.name || row.offerName || row.productName || row.article) || articleKey;
    const bucketKey = `${platformKey}|${articleKey}|${month}`;
    const bucket = grouped.get(bucketKey) || {
      date: monthStart(month),
      platformKey,
      articleKey,
      article: articleKey,
      name,
      views: 0,
      viewsPriority: 0,
      clicks: 0,
      clicksPriority: 0,
      spend: 0,
      spendPriority: 0,
      orders: 0,
      ordersPriority: 0,
      revenue: 0,
      revenuePriority: 0
    };
    bucket.name = bucket.name || name;
    setPriorityMetric(bucket, metric, value);
    grouped.set(bucketKey, bucket);
  }

  const fallbackTotals = [...totalGrouped.values()].filter((row) => !skuMonthPresence.has(`${row.platformKey}|${row.date.slice(0, 7)}`));

  return [...grouped.values(), ...fallbackTotals]
    .map(({ viewsPriority, clicksPriority, spendPriority, ordersPriority, revenuePriority, ...row }) => ({
      ...row,
      campaignId: 'marketplace-workbook',
      campaignName: 'Marketplace workbook',
      channel: 'marketplace-workbook'
    }))
    .filter((row) => row.views || row.clicks || row.spend || row.orders || row.revenue)
    .sort((left, right) => left.date.localeCompare(right.date) || left.platformKey.localeCompare(right.platformKey) || left.articleKey.localeCompare(right.articleKey));
}

function mergeItemSeries(baseSeries, extraSeries) {
  const result = [];
  const seen = new Set();
  for (const row of [...(Array.isArray(baseSeries) ? baseSeries : []), ...(Array.isArray(extraSeries) ? extraSeries : [])]) {
    if (isOutOfScopeBrandRow(row)) continue;
    const date = normalizeText(row?.date || row?.label);
    const platformKey = normalizeKey(row?.platformKey || row?.platform || '');
    const articleKey = normalizeText(row?.articleKey || row?.article || row?.offer_id || row?.offerId || row?.sku || '');
    const key = `${date}|${platformKey}|${articleKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result.sort((left, right) => {
    const leftDate = normalizeText(left?.date || left?.label);
    const rightDate = normalizeText(right?.date || right?.label);
    return leftDate.localeCompare(rightDate)
      || normalizeKey(left?.platformKey || left?.platform || '').localeCompare(normalizeKey(right?.platformKey || right?.platform || ''))
      || normalizeText(left?.articleKey || left?.article || '').localeCompare(normalizeText(right?.articleKey || right?.article || ''));
  });
}

function buildPlatformSeriesFromMonthly(monthlyTotals, asOfDate) {
  const entries = [...monthlyTotals.values()].sort((left, right) => left.monthKey.localeCompare(right.monthKey));
  const series = [];
  for (const month of entries) {
    const bounds = monthRange(month.monthKey);
    if (!bounds) continue;
    const days = daysCoveredForMonth(month.monthKey, asOfDate);
    if (!days) continue;
    const dailyUnits = distributeMonthlyValue(month.units, days);
    const dailyRevenue = distributeMonthlyValue(month.revenue, days);
    const dailyMargin = month.estimatedMargin != null ? distributeMonthlyValue(month.estimatedMargin, days) : [];
    const activeEnd = monthKey(asOfDate) === month.monthKey ? asOfDate : bounds.end;
    for (let offset = 0; offset < days; offset += 1) {
      const date = addDays(bounds.start, offset);
      if (date > activeEnd) break;
      series.push({
        date: iso(date),
        label: iso(date),
        units: dailyUnits[offset] || 0,
        revenue: dailyRevenue[offset] || 0,
        estimatedMargin: dailyMargin[offset] || 0
      });
    }
  }
  return series;
}

function latestPlatformDate(platformTrends, key) {
  const platform = (Array.isArray(platformTrends?.platforms) ? platformTrends.platforms : [])
    .find((item) => canonicalPlatformKey(item?.key || item?.platformKey) === canonicalPlatformKey(key));
  let latest = '';
  for (const point of Array.isArray(platform?.series) ? platform.series : []) {
    const date = isoDate(point?.date || point?.label);
    if (date && date > latest) latest = date;
  }
  return latest;
}

function completeMarketplaceDate(platformTrends) {
  const coreDates = ['wb', 'ozon']
    .map((key) => latestPlatformDate(platformTrends, key))
    .filter(Boolean)
    .sort();
  if (coreDates.length >= 2) return coreDates[0];
  return coreDates[0] || '';
}

function completeSeriesDate(platformSeriesMap) {
  const coreDates = ['wb', 'ozon']
    .map((key) => {
      let latest = '';
      for (const point of Array.isArray(platformSeriesMap.get(key)) ? platformSeriesMap.get(key) : []) {
        const date = isoDate(point?.date || point?.label);
        if (date && date > latest) latest = date;
      }
      return latest;
    })
    .filter(Boolean)
    .sort();
  if (coreDates.length >= 2) return coreDates[0];
  return coreDates[0] || '';
}

function trimSeriesToDate(series, cutoffDate) {
  const cutoff = isoDate(cutoffDate);
  const list = (Array.isArray(series) ? series : [])
    .map((point) => {
      const date = isoDate(point?.date || point?.label);
      return date ? { ...point, date, label: date } : null;
    })
    .filter((point) => point && (!cutoff || point.date <= cutoff))
    .sort((left, right) => left.date.localeCompare(right.date));
  const latestIndex = list.length - 1;
  return list.map((point, index) => ({
    ...point,
    dayOffset: latestIndex - index
  }));
}

function trimArticleDailyToDate(article, cutoffDate) {
  const daily = trimSeriesToDate(article?.daily || [], cutoffDate);
  const latestPoint = daily[daily.length - 1] || {};
  const latestPrice = numberOrZero(latestPoint.price);
  return {
    ...article,
    daily,
    currentPrice: latestPrice || article?.currentPrice || 0,
    currentClientPrice: latestPrice || article?.currentClientPrice || article?.currentPrice || 0,
    currentFillPrice: latestPrice || article?.currentFillPrice || article?.currentPrice || 0
  };
}

function trimExtraPlatformToDate(bucket, cutoffDate) {
  if (!bucket || typeof bucket !== 'object') return bucket;
  const cutoff = isoDate(cutoffDate);
  const next = {
    ...bucket,
    articles: (Array.isArray(bucket.articles) ? bucket.articles : [])
      .map((article) => trimArticleDailyToDate(article, cutoff))
      .filter((article) => !Array.isArray(article.daily) || article.daily.length)
  };
  if (cutoff) {
    if (next.asOfDate) next.asOfDate = cutoff;
    if (next.to && isoDate(next.to) > cutoff) next.to = cutoff;
  }
  return next;
}

function articleRevenueTotal(article) {
  return (Array.isArray(article?.monthly) ? article.monthly : [])
    .reduce((sum, month) => sum + numberOrZero(month?.revenue), 0);
}

function articleDiagnostics(articles) {
  const summary = {
    articleCount: articles.length,
    matchedArticleCount: 0,
    unmatchedArticleCount: 0,
    revenue: 0,
    matchedRevenue: 0,
    unmatchedRevenue: 0,
    matchRate: 0,
    revenueMatchRate: 0,
    unmatchedSamples: []
  };
  for (const article of articles) {
    const revenue = articleRevenueTotal(article);
    summary.revenue += revenue;
    if (article?.skuMatched) {
      summary.matchedArticleCount += 1;
      summary.matchedRevenue += revenue;
      continue;
    }
    summary.unmatchedArticleCount += 1;
    summary.unmatchedRevenue += revenue;
    if (summary.unmatchedSamples.length < 30) {
      summary.unmatchedSamples.push({
        articleKey: article?.articleKey || '',
        sourceArticleKey: article?.sourceArticleKey || '',
        name: article?.name || '',
        revenue: Number(revenue.toFixed(4))
      });
    }
  }
  summary.matchRate = summary.articleCount > 0 ? Number((summary.matchedArticleCount / summary.articleCount).toFixed(4)) : 0;
  summary.revenueMatchRate = summary.revenue > 0 ? Number((summary.matchedRevenue / summary.revenue).toFixed(4)) : 0;
  summary.revenue = Number(summary.revenue.toFixed(4));
  summary.matchedRevenue = Number(summary.matchedRevenue.toFixed(4));
  summary.unmatchedRevenue = Number(summary.unmatchedRevenue.toFixed(4));
  return summary;
}

function buildAllSeries(platformSeriesMap) {
  const officialFinanceTurnoverForPoint = (key, point) => {
    const sellerSummary = point?.wbSellerSummary && typeof point.wbSellerSummary === 'object'
      ? point.wbSellerSummary
      : {};
    if (canonicalPlatformKey(key) === 'wb') {
      return firstNumber(
        point?.wbSellerSummaryFinanceTurnover,
        point?.financeTurnover,
        sellerSummary.financeTurnover,
        sellerSummary.salesRevenue,
        point?.revenue
      );
    }
    return firstNumber(point?.financeTurnover, point?.revenue);
  };
  const officialMarginForPoint = (key, point) => {
    const sellerSummary = point?.wbSellerSummary && typeof point.wbSellerSummary === 'object'
      ? point.wbSellerSummary
      : {};
    if (canonicalPlatformKey(key) === 'wb') {
      return firstNumber(
        point?.wbSellerSummaryPayForGoods,
        point?.financialResult,
        sellerSummary.financialResult,
        sellerSummary.payForGoods,
        point?.estimatedMargin
      );
    }
    return firstNumber(point?.financialResult, point?.estimatedMargin);
  };
  const byDate = new Map();
  for (const [key, series] of platformSeriesMap.entries()) {
    for (const point of Array.isArray(series) ? series : []) {
      const date = isoDate(point?.date || point?.label);
      if (!date) continue;
      const current = byDate.get(date) || {
        date,
        label: date,
        units: 0,
        revenue: 0,
        financeTurnover: 0,
        financialResult: 0,
        estimatedMargin: 0
      };
      current.units += numberOrZero(point.units);
      current.revenue += numberOrZero(point.revenue);
      const financeTurnover = officialFinanceTurnoverForPoint(key, point);
      const financialResult = officialMarginForPoint(key, point);
      current.financeTurnover += financeTurnover;
      current.financialResult += financialResult;
      current.estimatedMargin += financialResult;
      byDate.set(date, current);
    }
  }
  return [...byDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => ({
      ...point,
      units: Number(point.units.toFixed(4)),
      revenue: Number(point.revenue.toFixed(4)),
      financeTurnover: Number(point.financeTurnover.toFixed(4)),
      financialResult: Number(point.financialResult.toFixed(4)),
      estimatedMargin: Number(point.estimatedMargin.toFixed(4))
    }));
}

function buildAdsPlatformSeries(monthlyTotals, asOfDate) {
  const entries = [...monthlyTotals.values()].sort((left, right) => left.monthKey.localeCompare(right.monthKey));
  const series = [];
  for (const month of entries) {
    const bounds = monthRange(month.monthKey);
    if (!bounds) continue;
    const days = daysCoveredForMonth(month.monthKey, asOfDate);
    if (!days) continue;
    const dailyViews = distributeMonthlyValue(month.views, days);
    const dailyClicks = distributeMonthlyValue(month.clicks, days);
    const dailySpend = distributeMonthlyValue(month.spend, days);
    const dailyOrders = distributeMonthlyValue(month.orders, days);
    const dailyRevenue = distributeMonthlyValue(month.revenue, days);
    const activeEnd = monthKey(asOfDate) === month.monthKey ? asOfDate : bounds.end;
    for (let offset = 0; offset < days; offset += 1) {
      const date = addDays(bounds.start, offset);
      if (date > activeEnd) break;
      series.push({
        date: iso(date),
        label: iso(date),
        views: dailyViews[offset] || 0,
        clicks: dailyClicks[offset] || 0,
        spend: dailySpend[offset] || 0,
        orders: dailyOrders[offset] || 0,
        revenue: dailyRevenue[offset] || 0
      });
    }
  }
  return series;
}

function buildAdsAllSeries(platformSeriesMap) {
  const byDate = new Map();
  for (const series of platformSeriesMap.values()) {
    for (const point of Array.isArray(series) ? series : []) {
      const date = isoDate(point?.date || point?.label);
      if (!date) continue;
      const current = byDate.get(date) || { date, label: date, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 };
      current.views += numberOrZero(point.views);
      current.clicks += numberOrZero(point.clicks);
      current.spend += numberOrZero(point.spend);
      current.orders += numberOrZero(point.orders);
      current.revenue += numberOrZero(point.revenue);
      byDate.set(date, current);
    }
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function updatePlatformTrends(basePlatformTrends, platformTotals, articleRows, asOfDate) {
  const next = deepClone(basePlatformTrends || {});
  const cutoffDate = iso(asOfDate);
  const existingPlatforms = Array.isArray(next.platforms) ? [...next.platforms] : [];
  const platformMap = new Map(existingPlatforms.map((platform) => [canonicalPlatformKey(platform?.key), deepClone(platform)]));
  const resultPlatforms = [];
  const existingExtraMarketplace = next.extraMarketplace && typeof next.extraMarketplace === 'object'
    ? deepClone(next.extraMarketplace)
    : {};
  const existingExtraPlatforms = existingExtraMarketplace?.platforms && typeof existingExtraMarketplace.platforms === 'object'
    ? existingExtraMarketplace.platforms
    : {};
  const extraMarketplace = {
    ...existingExtraMarketplace,
    generatedAt: new Date().toISOString(),
    workbook: DEFAULT_WORKBOOK,
    asOfDate: cutoffDate,
    platforms: Object.fromEntries(Object.entries(existingExtraPlatforms).map(([key, bucket]) => [
      key,
      trimExtraPlatformToDate(bucket, cutoffDate)
    ]))
  };

  const extraArticleMap = new Map();
  for (const row of articleRows) {
    const key = canonicalPlatformKey(row.platformKey);
    const list = extraArticleMap.get(key) || [];
    list.push(row);
    extraArticleMap.set(key, list);
  }

  for (const key of EXTRA_PLATFORM_ORDER) {
    const series = buildPlatformSeriesFromMonthly(platformTotals.get(key) || new Map(), asOfDate);
    const existing = platformMap.get(key) || {};
    const articles = (extraArticleMap.get(key) || []).sort((left, right) => left.articleKey.localeCompare(right.articleKey));
    const diagnostics = articleDiagnostics(articles);
    resultPlatforms.push({
      ...existing,
      key,
      label: platformLabel(key),
      series,
      articles,
      diagnostics
    });
    extraMarketplace.platforms[key] = {
      key,
      label: platformLabel(key),
      supportKey: supportKeyForPlatform(key),
      diagnostics,
      articles
    };
  }

  for (const platform of existingPlatforms) {
    const key = canonicalPlatformKey(platform?.key);
    if (EXTRA_PLATFORM_ORDER.includes(key) || key === 'all') continue;
    const platformNext = key === 'ya'
      ? { ...platform, series: trimSeriesToDate(platform.series, cutoffDate) }
      : platform;
    resultPlatforms.push(platformNext);
  }

  const allSeriesMap = new Map();
  for (const [key, monthlyTotals] of platformTotals.entries()) {
    allSeriesMap.set(key, buildPlatformSeriesFromMonthly(monthlyTotals || new Map(), asOfDate));
  }
  for (const [key, platform] of platformMap.entries()) {
    if (EXTRA_PLATFORM_ORDER.includes(key) || key === 'all') continue;
    const series = key === 'ya' ? trimSeriesToDate(platform.series, cutoffDate) : platform.series;
    allSeriesMap.set(key, Array.isArray(series) ? series : []);
  }
  const allSeriesCutoff = completeSeriesDate(allSeriesMap);
  const allSeries = buildAllSeries(allSeriesMap)
    .filter((point) => !allSeriesCutoff || isoDate(point?.date || point?.label) <= allSeriesCutoff);
  const allExisting = platformMap.get('all') || {};
  const latestMarketplaceDate = allSeries.length ? allSeries[allSeries.length - 1].date : iso(asOfDate);
  resultPlatforms.push({
    ...allExisting,
    key: 'all',
    label: 'Все площадки',
    series: allSeries
  });

  next.generatedAt = new Date().toISOString();
  next.latestMarketplaceDate = latestMarketplaceDate;
  next.note = 'Marketplace facts refreshed from API-backed platform_trends.json with marketplace workbook extras.';
  next.platforms = resultPlatforms;
  next.extraMarketplace = extraMarketplace;
  return next;
}

function buildAdsSummary(baseAdsSummary, wbPlatformSeries, platformAdsSeries, asOfDate) {
  const existing = deepClone(baseAdsSummary || {});
  const next = {
    ...existing,
    generatedAt: new Date().toISOString(),
    asOfDate: iso(asOfDate),
    window: {
      from: existing.window?.from || monthStart(iso(asOfDate)),
      to: existing.window?.to || iso(asOfDate),
      days: Number.isFinite(Number(existing.window?.days)) ? Number(existing.window.days) : enumerateDates(existing.window?.from || monthStart(iso(asOfDate)), existing.window?.to || iso(asOfDate)).length
    },
    note: 'WB Promotion API daily facts plus marketplace workbook extras.',
    sourceMode: existing.sourceMode || 'wb-api+external-sheet+marketplace-workbook'
  };

  const mergedPlatformSeries = new Map();
  const windowFrom = isoDate(next.window.from) || monthStart(iso(asOfDate));
  const windowTo = isoDate(next.window.to) || iso(asOfDate);
  const addPlatform = (key, label, series, extra = {}) => {
    const cleanSeries = Array.isArray(series) ? series.map((point) => ({
      date: isoDate(point?.date || point?.label),
      label: isoDate(point?.date || point?.label),
      views: numberOrZero(point.views),
      clicks: numberOrZero(point.clicks),
      spend: numberOrZero(point.spend),
      orders: numberOrZero(point.orders),
      revenue: numberOrZero(point.revenue)
    })).filter((point) => point.date && point.date >= windowFrom && point.date <= windowTo) : [];
    mergedPlatformSeries.set(canonicalPlatformKey(key), cleanSeries);
    return {
      key: canonicalPlatformKey(key),
      platformKey: canonicalPlatformKey(key),
      label,
      ...extra,
      ...totalsFromSeries(cleanSeries),
      series: cleanSeries
    };
  };

  const totalsFromSeries = (series) => series.reduce((acc, row) => {
    acc.views += numberOrZero(row.views);
    acc.clicks += numberOrZero(row.clicks);
    acc.spend += numberOrZero(row.spend);
    acc.orders += numberOrZero(row.orders);
    acc.revenue += numberOrZero(row.revenue);
    return acc;
  }, { views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 });

  const existingWb = Array.isArray(existing.platforms)
    ? existing.platforms.find((platform) => canonicalPlatformKey(platform?.key || platform?.platformKey || platform?.label) === 'wb')
    : null;
  const freshWb = Array.isArray(wbPlatformSeries) && wbPlatformSeries.length
    ? wbPlatformSeries
    : Array.isArray(existingWb?.series)
      ? existingWb.series
      : [];
  const adPlatforms = [];
  adPlatforms.push(addPlatform('wb', existingWb?.label || 'WB', freshWb, existingWb ? { ...existingWb, key: 'wb', platformKey: 'wb', label: existingWb?.label || 'WB' } : {}));
  for (const key of ADS_PLATFORM_ORDER) {
    if (!platformAdsSeries.has(key)) continue;
    adPlatforms.push(addPlatform(key, platformLabel(key), platformAdsSeries.get(key)));
  }
  const allSeries = buildAdsAllSeries(mergedPlatformSeries);
  adPlatforms.push({
    key: 'all',
    platformKey: 'all',
    label: 'Все площадки',
    ...totalsFromSeries(allSeries),
    series: allSeries
  });

  next.platforms = adPlatforms;
  return next;
}

function resolveOptions(args) {
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(process.cwd(), 'data'));
  const outputDir = args['output-dir'] ? path.resolve(args['output-dir']) : '';
  const workbookPath = path.resolve(args.workbook || args['workbook'] || DEFAULT_WORKBOOK);
  return {
    command: args.command || 'sync',
    dryRun: Boolean(args.dryRun),
    mirrorLocalFallback: asBool(args['mirror-local-fallback'], Boolean(args.mirrorLocalFallback)),
    baseDataDir,
    outputDir,
    workbookPath
  };
}

function smartPriceOverlayKey(value) {
  const canonical = canonicalPlatformKey(value);
  return canonical === 'ym' ? 'ya' : canonical;
}

function smartPriceArticleTokens(row = {}) {
  const tokens = new Set();
  [
    row.articleKey,
    row.article,
    row.sku,
    row.item_code,
    row.vendorCode,
    row.offerId,
    row.nmId,
    row.name
  ].forEach((value) => {
    const exact = normalizeKey(value);
    const compact = normalizeSkuToken(value);
    if (exact) tokens.add(exact);
    if (compact) tokens.add(compact);
  });
  return [...tokens];
}

function buildSmartPriceMarginLookup(priceSnapshot = {}) {
  const lookup = new Map();
  const platforms = priceSnapshot?.platforms || {};
  for (const [rawKey, bucket] of Object.entries(platforms)) {
    const platformKey = smartPriceOverlayKey(rawKey);
    if (!['wb', 'ozon', 'ya'].includes(platformKey)) continue;
    const rows = Array.isArray(bucket?.rows) ? bucket.rows : [];
    for (const row of rows) {
      for (const token of smartPriceArticleTokens(row)) {
        lookup.set(`${platformKey}|${token}`, row);
      }
    }
  }
  return lookup;
}

function findSmartPriceMarginRow(lookup, platformKey, row) {
  for (const token of smartPriceArticleTokens(row)) {
    const match = lookup.get(`${platformKey}|${token}`);
    if (match) return match;
  }
  return null;
}

function mergeSmartPriceMarginFields(row, priceRow) {
  if (!priceRow) return row;
  const next = { ...row };
  let enriched = false;
  [
    'minPrice',
    'hardMinPrice',
    'maxPrice',
    'basePrice',
    'allowedMarginPct',
    'avgMargin7dPct',
    'currentTurnoverDays',
    'workingZoneFrom',
    'workingZoneTo'
  ].forEach((field) => {
    const value = firstFiniteOrNull(priceRow[field]);
    if (value !== null) {
      next[field] = value;
      enriched = true;
    } else if (next.marginSource === 'prices.json') {
      delete next[field];
    }
  });

  const marginPct = firstFiniteOrNull(priceRow.marginPct, priceRow.marginTotalPct, priceRow.avgMargin7dPct, priceRow.allowedMarginPct);
  if (marginPct !== null) {
    next.marginPct = marginPct;
    next.marginTotalPct = marginPct;
    if (firstFiniteOrNull(next.estimatedMarginPct) === null) next.estimatedMarginPct = marginPct;
    enriched = true;
  } else if (next.marginSource === 'prices.json') {
    delete next.marginPct;
    delete next.marginTotalPct;
    delete next.estimatedMarginPct;
  }
  if (enriched) {
    next.marginSource = 'prices.json';
  } else if (next.marginSource === 'prices.json') {
    delete next.marginSource;
  }
  return next;
}

function enrichSmartPriceOverlayWithPrices(baseOverlay, priceSnapshot = {}) {
  const next = deepClone(baseOverlay || {});
  next.platforms = next.platforms && typeof next.platforms === 'object' ? next.platforms : {};
  const marginLookup = buildSmartPriceMarginLookup(priceSnapshot);
  for (const [rawKey, bucket] of Object.entries(next.platforms)) {
    const platformKey = smartPriceOverlayKey(rawKey);
    if (!['wb', 'ozon', 'ya'].includes(platformKey) || !Array.isArray(bucket?.rows)) continue;
    bucket.rows = bucket.rows
      .filter((row) => !isOutOfScopeBrandRow(row))
      .map((row) => mergeSmartPriceMarginFields(row, findSmartPriceMarginRow(marginLookup, platformKey, row)));
  }
  return next;
}

function updateSmartPriceOverlay(baseOverlay, extraMarketplace, asOfDate, priceSnapshot = {}) {
  const next = enrichSmartPriceOverlayWithPrices(baseOverlay, priceSnapshot);
  next.platforms = next.platforms && typeof next.platforms === 'object' ? next.platforms : {};
  const platforms = extraMarketplace?.platforms || {};
  for (const [key, bucket] of Object.entries(platforms)) {
    if (!EXTRA_PLATFORM_ORDER.includes(canonicalPlatformKey(key))) continue;
    const articles = Array.isArray(bucket?.articles) ? bucket.articles : [];
    next.platforms[key] = {
      key,
      label: bucket?.label || platformLabel(key),
      source: 'platform_trends.extraMarketplace',
      generatedAt: new Date().toISOString(),
      asOfDate: iso(asOfDate),
      rows: articles.map((row) => ({
        ...row,
        platformKey: key,
        platformLabel: bucket?.label || row.platformLabel || platformLabel(key),
        sourceMode: row.source || 'marketplace-workbook'
      }))
    };
  }
  next.generatedAt = new Date().toISOString();
  next.asOfDate = iso(asOfDate);
  next.extraMarketplace = {
    generatedAt: next.generatedAt,
    asOfDate: next.asOfDate,
    source: 'platform_trends.extraMarketplace',
    platforms: Object.fromEntries(Object.entries(platforms).map(([key, bucket]) => [key, {
      key,
      label: bucket?.label || platformLabel(key),
      articleCount: Array.isArray(bucket?.articles) ? bucket.articles.length : 0
    }]))
  };
  return next;
}

function writeOutputs(platformTrends, adsSummary, smartPriceOverlay, options) {
  const files = [];
  const platformPath = path.join(options.baseDataDir, 'platform_trends.json');
  const adsPath = path.join(options.baseDataDir, 'ads_summary.json');
  const overlayPath = path.join(options.baseDataDir, 'smart_price_overlay.json');
  writeJson(platformPath, platformTrends);
  writeJson(adsPath, adsSummary);
  if (smartPriceOverlay) writeJson(overlayPath, smartPriceOverlay);
  files.push(platformPath, adsPath);
  if (smartPriceOverlay) files.push(overlayPath);

  if (options.outputDir) {
    const outputPlatformPath = path.join(options.outputDir, 'platform_trends.json');
    const outputAdsPath = path.join(options.outputDir, 'ads_summary.json');
    const outputOverlayPath = path.join(options.outputDir, 'smart_price_overlay.json');
    writeJson(outputPlatformPath, platformTrends);
    writeJson(outputAdsPath, adsSummary);
    if (smartPriceOverlay) writeJson(outputOverlayPath, smartPriceOverlay);
    files.push(outputPlatformPath, outputAdsPath);
    if (smartPriceOverlay) files.push(outputOverlayPath);
  }

  if (options.mirrorLocalFallback && options.outputDir) {
    const resolvedPlatformPath = path.resolve(path.join(options.outputDir, 'platform_trends.json'));
    const resolvedAdsPath = path.resolve(path.join(options.outputDir, 'ads_summary.json'));
    if (path.resolve(platformPath) !== resolvedPlatformPath) {
      writeJson(platformPath, platformTrends);
    }
    if (path.resolve(adsPath) !== resolvedAdsPath) {
      writeJson(adsPath, adsSummary);
    }
  }

  return files;
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (options.command !== 'sync') throw new Error(`Unsupported command: ${options.command}`);
  if (!fs.existsSync(options.workbookPath)) throw new Error(`Workbook not found: ${options.workbookPath}`);

  const workbook = XLSX.readFile(options.workbookPath);
  const rawMonthlyRows = loadWorkbookData(workbook, 'raw_monthly');
  const skuMonthlyRows = loadWorkbookData(workbook, 'SKU_месяцы');
  const basePlatformTrends = readJson(path.join(options.baseDataDir, 'platform_trends.json'), {});
  const baseAdsSummary = readJson(path.join(options.baseDataDir, 'ads_summary.json'), {});
  const baseSmartPriceOverlay = readJson(path.join(options.baseDataDir, 'smart_price_overlay.json'), { generatedAt: '', platforms: {} });
  const priceSnapshot = readJson(path.join(options.baseDataDir, 'prices.json'), { platforms: {} });
  const skus = readJson(path.join(options.baseDataDir, 'skus.json'), []);
  const skuAliases = readJson(path.join(options.baseDataDir, 'sku_aliases.json'), { aliases: [] });
  const referenceDate = parseDate(completeMarketplaceDate(basePlatformTrends) || basePlatformTrends.latestMarketplaceDate || baseAdsSummary.asOfDate || new Date().toISOString().slice(0, 10))
    || new Date();

  const platformTotals = platformMonthlyTotals(rawMonthlyRows, referenceDate);
  const articleRows = buildArticleRows(skuMonthlyRows, skus, skuAliases, referenceDate);

  const platformTrends = updatePlatformTrends(basePlatformTrends, platformTotals, articleRows, referenceDate);

  const adsMonthlyTotals = new Map();
  const skuAdsFieldPresence = new Set();
  const totalAdsRows = [];
  const addAdsRow = (platformKey, monthKeyValue, metric, value, aggregate = false) => {
    const platform = adsMonthlyTotals.get(platformKey) || new Map();
    const current = platform.get(monthKeyValue) || {
      monthKey: monthKeyValue,
      views: 0,
      viewsPriority: 0,
      clicks: 0,
      clicksPriority: 0,
      spend: 0,
      spendPriority: 0,
      orders: 0,
      ordersPriority: 0,
      revenue: 0
    };
    if (aggregate) addPriorityMetric(current, metric, value);
    else setPriorityMetric(current, metric, value);
    platform.set(monthKeyValue, current);
    adsMonthlyTotals.set(platformKey, platform);
  };

  for (const row of rawMonthlyRows) {
    const level = normalizeKey(row.level || row['level']);
    const platformKey = canonicalPlatformKey(row.platform_key || row.platformKey || row.platform);
    const month = normalizeText(row.month || row['month']);
    const monthDate = parseDate(`${month}-01`);
    if (!month || !monthDate || monthDate > referenceDate) continue;
    const metric = normalizeKey(row.metric_key || row.metric || '');
    const target = adsMetricTarget(metric);
    if (!target) continue;
    const value = numberOrZero(row.value);
    const targetKey = platformKey === 'ym' ? 'ya' : platformKey;
    if (!ADS_PLATFORM_ORDER.includes(targetKey)) continue;
    if (level === 'sku') {
      if (isOutOfScopeBrandRow(row)) continue;
      skuAdsFieldPresence.add(`${targetKey}|${month}|${target.field}`);
      addAdsRow(targetKey, month, metric, value, true);
      continue;
    }
    if (level === 'total') {
      totalAdsRows.push({ targetKey, month, metric, value, field: target.field });
    }
  }

  for (const row of totalAdsRows) {
    if (skuAdsFieldPresence.has(`${row.targetKey}|${row.month}|${row.field}`)) continue;
    addAdsRow(row.targetKey, row.month, row.metric, row.value);
  }

  const wbPlatformSeries = (platformTotals.get('wb') || []).length ? buildPlatformSeriesFromMonthly(platformTotals.get('wb'), referenceDate) : [];
  const extraAdsSeriesMap = new Map();
  for (const [platformKey, months] of adsMonthlyTotals.entries()) {
    const series = buildAdsPlatformSeries(months, referenceDate);
    extraAdsSeriesMap.set(platformKey, series);
  }

  const mergedAdsSummary = buildAdsSummary(baseAdsSummary, wbPlatformSeries, extraAdsSeriesMap, referenceDate);
  mergedAdsSummary.itemSeries = mergeItemSeries(mergedAdsSummary.itemSeries, buildAdsItemSeries(rawMonthlyRows, referenceDate));
  mergedAdsSummary.extraMarketplace = {
    generatedAt: new Date().toISOString(),
    workbook: options.workbookPath,
    asOfDate: iso(referenceDate),
    platforms: EXTRA_PLATFORM_ORDER.reduce((acc, key) => {
      acc[key] = {
        key,
        label: platformLabel(key),
        supportKey: supportKeyForPlatform(key),
        articleCount: (platformTrends.extraMarketplace?.platforms?.[key]?.articles || []).length
      };
      return acc;
    }, {})
  };

  const smartPriceOverlay = updateSmartPriceOverlay(baseSmartPriceOverlay, platformTrends.extraMarketplace, referenceDate, priceSnapshot);
  const writtenFiles = writeOutputs(platformTrends, mergedAdsSummary, smartPriceOverlay, options);
  const summary = {
    dryRun: options.dryRun,
    workbookPath: options.workbookPath,
    asOfDate: iso(referenceDate),
    extraPlatforms: EXTRA_PLATFORM_ORDER,
    platformPoints: platformTrends.platforms.reduce((sum, platform) => sum + (Array.isArray(platform.series) ? platform.series.length : 0), 0),
    articleRows: articleRows.length,
    writtenFiles
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
