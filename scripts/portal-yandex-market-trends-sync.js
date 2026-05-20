#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const API_BASE_URL = 'https://api.partner.market.yandex.ru';
const PLATFORM_LABELS = {
  wb: 'WB',
  ozon: 'Ozon',
  ya: '\u042f.\u041c\u0430\u0440\u043a\u0435\u0442',
  all: '\u0412\u0441\u0435 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0438'
};

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      if (index === 2) args.command = token;
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

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z\u0430-\u044f\u04510-9]+/giu, '');
}

function numberOrZero(value) {
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
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

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = normalizeText(value);
  if (!raw) return '';
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  }
  if (/^\d{1,2}$/.test(raw)) return '';
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function localDateKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveOptions(args) {
  const root = process.cwd();
  const settlementHour = Math.max(0, Math.min(23, Math.trunc(numberOrZero(args['settlement-hour'] || process.env.ALTEA_YM_SETTLEMENT_HOUR || 10))));
  const explicitTo = isoDate(args.to || args['date-to']);
  const autoLagDays = new Date().getHours() < settlementHour ? 2 : 1;
  const to = explicitTo || localDateKey(-autoLagDays);
  const from = isoDate(args.from || args['date-from'] || `${to.slice(0, 7)}-01`);
  return {
    command: args.command || 'sync',
    apiKey: normalizeText(args['api-key'] || process.env.ALTEA_YM_API_KEY || ''),
    campaignId: normalizeText(args['campaign-id'] || process.env.ALTEA_YM_CAMPAIGN_ID || ''),
    businessId: normalizeText(args['business-id'] || process.env.ALTEA_YM_BUSINESS_ID || ''),
    apiBaseUrl: normalizeText(args['api-base-url'] || API_BASE_URL).replace(/\/+$/, ''),
    skusPath: path.resolve(args['skus-file'] || path.join(root, 'data', 'skus.json')),
    skuAliasPath: path.resolve(args['sku-alias-file'] || path.join(root, 'data', 'sku_aliases.json')),
    inputPath: path.resolve(args['input-file'] || path.join(root, 'data', 'platform_trends.json')),
    outputPath: path.resolve(args['output-file'] || path.join(root, 'data', 'platform_trends.json')),
    pollAttempts: Math.max(1, Math.trunc(numberOrZero(args['poll-attempts'] || 80))),
    pollIntervalMs: Math.max(1000, Math.trunc(numberOrZero(args['poll-interval-ms'] || 10000))),
    settlementHour,
    autoLagDays,
    explicitTo: Boolean(explicitTo),
    from,
    to
  };
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

function collectFiles(dir, pattern, result) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) collectFiles(fullPath, pattern, result);
    else if (pattern.test(item.name)) result.push(fullPath);
  }
}

function collectObjects(value, result = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectObjects(item, result));
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  result.push(value);
  Object.values(value).forEach((item) => collectObjects(item, result));
  return result;
}

function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/).find((line) => line.trim()) || '';
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
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
    .map((item) => item.map((cell) => normalizeText(cell)))
    .filter((item) => item.some(Boolean));
  const [header = [], ...body] = filtered;
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ''])));
}

async function yandexRequest(options, apiPath, requestOptions = {}) {
  const url = new URL(`${options.apiBaseUrl}${apiPath}`);
  Object.entries(requestOptions.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    method: requestOptions.method || 'GET',
    headers: {
      'Api-Key': options.apiKey,
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
  if (!response.ok) throw new Error(`Yandex Market API ${apiPath}: HTTP ${response.status} ${text.slice(0, 700)}`);
  return payload;
}

async function downloadAndParseReport(fileUrl) {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Yandex Market report file download failed: HTTP ${response.status}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altea-ym-report-'));
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
    const payload = JSON.parse(text);
    rows.push(...collectObjects(payload).filter((row) => (
      row.offerId || row.OFFER_ID || row.orderItems || row.ORDER_ITEMS || row.orderItemsTotalAmount || row.ORDER_ITEMS_TOTAL_AMOUNT
    )));
  }
  return rows;
}

function campaignIdentitiesFromPayload(payload) {
  const campaigns = Array.isArray(payload?.result?.campaigns)
    ? payload.result.campaigns
    : Array.isArray(payload?.campaigns)
      ? payload.campaigns
      : [];
  return campaigns
    .map((campaign) => normalizeText(campaign.id || campaign.campaignId))
    .filter(Boolean)
    .map((campaignId) => ({ campaignId }));
}

async function discoverIdentities(options) {
  if (options.campaignId) {
    return options.campaignId
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .map((campaignId) => ({ campaignId }));
  }
  if (options.businessId) return [{ businessId: options.businessId }];
  const payload = await yandexRequest(options, '/v2/campaigns');
  return campaignIdentitiesFromPayload(payload);
}

async function generateShowsSalesReport(options, identity) {
  const body = {
    dateFrom: options.from,
    dateTo: options.to,
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
  for (let attempt = 1; attempt <= options.pollAttempts; attempt += 1) {
    const estimated = numberOrZero(generated?.result?.estimatedGenerationTime);
    const firstDelay = estimated > 0 ? Math.min(Math.max(estimated, 3000), 20000) : 5000;
    await sleep(attempt === 1 ? firstDelay : options.pollIntervalMs);
    latest = await yandexRequest(options, `/v2/reports/info/${encodeURIComponent(reportId)}`);
    const status = normalizeText(latest?.result?.status);
    if (status === 'DONE') return downloadAndParseReport(latest.result.file);
    if (status === 'FAILED') throw new Error(`Yandex Market report failed: ${JSON.stringify(latest).slice(0, 700)}`);
  }
  throw new Error(`Yandex Market report was not ready in time: ${JSON.stringify(latest).slice(0, 700)}`);
}

function canonicalAliasPlatform(value) {
  const raw = normalizeKey(value);
  if (!raw || ['all', 'any', '*'].includes(raw)) return 'all';
  if (['ya', 'ym', 'yandex', 'yandexmarket', '\u044f\u043c\u0430\u0440\u043a\u0435\u0442'].includes(raw)) return 'ym';
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['oz', 'ozon'].includes(raw)) return 'ozon';
  if (['ga', 'goldapple', 'zya', '\u0437\u044f', '\u0437\u043e\u043b\u043e\u0442\u043e\u0435\u044f\u0431\u043b\u043e\u043a\u043e'].includes(raw)) return 'ga';
  if (['letu', 'letual', '\u043b\u0435\u0442\u0443\u0430\u043b\u044c', '\u043b\u044d\u0442\u0443\u0430\u043b\u044c'].includes(raw)) return 'letu';
  if (['mm', 'magnit', 'magnitmarket', '\u043c\u0430\u0433\u043d\u0438\u0442\u043c\u0430\u0440\u043a\u0435\u0442'].includes(raw)) return 'mm';
  return raw;
}

function aliasPlatformMatches(value, platform) {
  const aliasPlatform = canonicalAliasPlatform(value);
  const targetPlatform = canonicalAliasPlatform(platform);
  return aliasPlatform === 'all' || aliasPlatform === targetPlatform;
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
    const status = normalizeKey(row?.status ?? row?.active ?? 'active');
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

function skuLookupTokens(sku = {}, platform = 'ym') {
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.nmId,
    sku.nmID,
    sku.barcode,
    sku?.ym?.offerId,
    sku?.ym?.offer_id,
    sku?.ya?.offerId,
    sku?.ya?.offer_id,
    sku?.yandex?.offerId,
    sku?.yandex?.offer_id
  ];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') {
        values.push(alias);
        return;
      }
      if (!aliasPlatformMatches(alias?.platform || alias?.marketplace || alias?.sourcePlatform, platform)) return;
      values.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.offer_id, alias?.vendorCode);
    });
  }
  Object.entries(sku.platformAliases || {}).forEach(([aliasPlatform, aliases]) => {
    if (!aliasPlatformMatches(aliasPlatform, platform)) return;
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });
  return values;
}

function skuMaps(skus, skuAliases = {}, platform = 'ym') {
  const byArticle = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    for (const value of skuLookupTokens(sku, platform)) {
      const key = normalizeKey(value);
      if (key && !byArticle.has(key)) byArticle.set(key, sku);
    }
  }
  for (const row of activeSkuAliasRows(skuAliases)) {
    const rowPlatform = firstTextValue(row, ['platform', 'marketplace', 'source_platform', 'sourcePlatform']);
    if (!aliasPlatformMatches(rowPlatform, platform)) continue;
    const targetToken = normalizeKey(firstTextValue(row, ['target_sku', 'targetSku', 'target', 'portal_sku', 'article_key', 'articleKey', 'sku']));
    const aliasValue = firstTextValue(row, ['api_sku', 'apiSku', 'api_article', 'alias', 'value', 'source_sku', 'marketplace_sku', 'external_sku', 'offer_id', 'offerId', 'vendor_code', 'vendorCode']);
    const aliasToken = normalizeKey(aliasValue);
    const targetSku = byArticle.get(targetToken);
    if (targetSku && aliasToken && !byArticle.has(aliasToken)) byArticle.set(aliasToken, targetSku);
  }
  return { byArticle };
}

function articleKeyForSku(sku, fallback = '') {
  return normalizeText(
    sku?.articleKey
    || sku?.article
    || sku?.sku
    || sku?.vendorCode
    || fallback
  );
}

function articleNameForSku(sku, fallback = '') {
  return normalizeText(sku?.name || sku?.title || fallback);
}

function ownerForSku(sku) {
  return normalizeText(
    sku?.owner?.byPlatform?.ym
    || sku?.ownersByPlatform?.ym
    || sku?.owner?.name
    || sku?.owner
    || ''
  );
}

function marginForSku(sku) {
  return numberOrZero(sku?.ym?.marginPct || sku?.ya?.marginPct || sku?.yandex?.marginPct);
}

function monthNumber(value) {
  const raw = normalizeText(value).toLowerCase();
  const numeric = Number(raw.replace(/\D+/g, ''));
  if (numeric >= 1 && numeric <= 12) return numeric;
  const months = {
    '\u044f\u043d\u0432\u0430\u0440\u044c': 1,
    '\u044f\u043d\u0432\u0430\u0440\u044f': 1,
    '\u0444\u0435\u0432\u0440\u0430\u043b\u044c': 2,
    '\u0444\u0435\u0432\u0440\u0430\u043b\u044f': 2,
    '\u043c\u0430\u0440\u0442': 3,
    '\u043c\u0430\u0440\u0442\u0430': 3,
    '\u0430\u043f\u0440\u0435\u043b\u044c': 4,
    '\u0430\u043f\u0440\u0435\u043b\u044f': 4,
    '\u043c\u0430\u0439': 5,
    '\u043c\u0430\u044f': 5,
    '\u0438\u044e\u043d\u044c': 6,
    '\u0438\u044e\u043d\u044f': 6,
    '\u0438\u044e\u043b\u044c': 7,
    '\u0438\u044e\u043b\u044f': 7,
    '\u0430\u0432\u0433\u0443\u0441\u0442': 8,
    '\u0430\u0432\u0433\u0443\u0441\u0442\u0430': 8,
    '\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044c': 9,
    '\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f': 9,
    '\u043e\u043a\u0442\u044f\u0431\u0440\u044c': 10,
    '\u043e\u043a\u0442\u044f\u0431\u0440\u044f': 10,
    '\u043d\u043e\u044f\u0431\u0440\u044c': 11,
    '\u043d\u043e\u044f\u0431\u0440\u044f': 11,
    '\u0434\u0435\u043a\u0430\u0431\u0440\u044c': 12,
    '\u0434\u0435\u043a\u0430\u0431\u0440\u044f': 12
  };
  return months[raw] || 0;
}

function reportRowDate(row) {
  const direct = isoDate(row.day || row.DAY || row.date || row.DATE);
  if (direct) return direct;
  const year = Math.trunc(numberOrZero(row.year || row.YEAR));
  const month = monthNumber(row.month || row.MONTH);
  const day = Math.trunc(numberOrZero(row.day || row.DAY));
  if (year > 2000 && month > 0 && day > 0) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
}

function addArticlePoint(map, sku, fallbackKey, row) {
  const dateKey = reportRowDate(row);
  const articleKey = articleKeyForSku(sku, fallbackKey);
  if (!dateKey || !articleKey) return false;

  let item = map.get(articleKey);
  if (!item) {
    item = {
      platformKey: 'ya',
      platformLabel: PLATFORM_LABELS.ya,
      articleKey,
      article: articleKey,
      name: articleNameForSku(sku, normalizeText(row.offerName || row.OFFER_NAME || fallbackKey)),
      owner: ownerForSku(sku),
      dailyByDate: new Map(),
      sourceRows: 0,
      matchedRows: 0
    };
    map.set(articleKey, item);
  }
  if (!item.name) item.name = articleNameForSku(sku, normalizeText(row.offerName || row.OFFER_NAME || fallbackKey));
  if (!item.owner) item.owner = ownerForSku(sku);
  item.sourceRows += 1;
  if (sku) item.matchedRows += 1;

  const ordersUnits = numberOrZero(row.orderItems ?? row.ORDER_ITEMS);
  const revenue = numberOrZero(row.orderItemsTotalAmount ?? row.ORDER_ITEMS_TOTAL_AMOUNT);
  const deliveredUnits = numberOrZero(row.orderItemsDeliveredCount ?? row.ORDER_ITEMS_DELIVERED_COUNT);
  const deliveredRevenue = numberOrZero(row.orderItemsDeliveredTotalAmount ?? row.ORDER_ITEMS_DELIVERED_TOTAL_AMOUNT);
  const cancellationsUnits = numberOrZero(row.orderItemsCanceledCount ?? row.ORDER_ITEMS_CANCELED_COUNT);
  const returnsUnits = numberOrZero(row.orderItemsReturnedCount ?? row.ORDER_ITEMS_RETURNED_COUNT);
  const adsImpressions = numberOrZero(row.shows ?? row.SHOWS);
  const adsClicks = numberOrZero(row.clicks ?? row.CLICKS);
  const addToCart = numberOrZero(row.toCart ?? row.TO_CART);
  const estimatedMargin = marginForSku(sku) > 0 ? revenue * marginForSku(sku) : 0;

  const point = item.dailyByDate.get(dateKey) || {
    date: dateKey,
    units: 0,
    ordersUnits: 0,
    revenue: 0,
    ordersRevenue: 0,
    deliveredUnits: 0,
    deliveredRevenue: 0,
    cancellationsUnits: 0,
    returnsUnits: 0,
    adsImpressions: 0,
    adsClicks: 0,
    addToCart: 0,
    estimatedMargin: 0
  };
  point.units += ordersUnits;
  point.ordersUnits += ordersUnits;
  point.revenue += revenue;
  point.ordersRevenue += revenue;
  point.deliveredUnits += deliveredUnits;
  point.deliveredRevenue += deliveredRevenue;
  point.cancellationsUnits += cancellationsUnits;
  point.returnsUnits += returnsUnits;
  point.adsImpressions += adsImpressions;
  point.adsClicks += adsClicks;
  point.addToCart += addToCart;
  point.estimatedMargin += estimatedMargin;
  if (point.ordersUnits > 0 && point.revenue > 0) point.price = point.revenue / point.ordersUnits;
  item.dailyByDate.set(dateKey, point);
  return true;
}

function roundPoint(point, latestIndex, index) {
  const ordersUnits = numberOrZero(point.ordersUnits ?? point.units);
  const revenue = numberOrZero(point.revenue);
  return {
    date: point.date,
    dayOffset: latestIndex - index,
    units: Number(numberOrZero(point.units).toFixed(4)),
    ordersUnits: Number(ordersUnits.toFixed(4)),
    revenue: Number(revenue.toFixed(4)),
    ordersRevenue: Number(numberOrZero(point.ordersRevenue ?? point.revenue).toFixed(4)),
    deliveredUnits: Number(numberOrZero(point.deliveredUnits).toFixed(4)),
    deliveredRevenue: Number(numberOrZero(point.deliveredRevenue).toFixed(4)),
    cancellationsUnits: Number(numberOrZero(point.cancellationsUnits).toFixed(4)),
    returnsUnits: Number(numberOrZero(point.returnsUnits).toFixed(4)),
    adsImpressions: Number(numberOrZero(point.adsImpressions).toFixed(4)),
    adsClicks: Number(numberOrZero(point.adsClicks).toFixed(4)),
    addToCart: Number(numberOrZero(point.addToCart).toFixed(4)),
    estimatedMargin: Number(numberOrZero(point.estimatedMargin).toFixed(4)),
    price: ordersUnits > 0 ? Number((revenue / ordersUnits).toFixed(4)) : 0
  };
}

function materializeArticles(articleMap) {
  return Array.from(articleMap.values())
    .map((item) => {
      const daily = Array.from(item.dailyByDate.values())
        .sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')));
      const latestIndex = Math.max(0, daily.length - 1);
      const roundedDaily = daily.map((point, index) => roundPoint(point, latestIndex, index));
      const latestPoint = roundedDaily[roundedDaily.length - 1] || {};
      const currentPrice = numberOrZero(latestPoint.price);
      return {
        platformKey: 'ya',
        platformLabel: PLATFORM_LABELS.ya,
        articleKey: item.articleKey,
        article: item.article || item.articleKey,
        name: item.name || item.article || item.articleKey,
        owner: item.owner || '',
        currentPrice,
        currentClientPrice: currentPrice,
        currentFillPrice: currentPrice,
        sourceRows: item.sourceRows,
        matchedRows: item.matchedRows,
        sourceMode: 'yandex-market-api-direct-sku',
        daily: roundedDaily
      };
    })
    .filter((item) => item.daily.length)
    .sort((left, right) => String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru'));
}

function buildYandexLayer(rows, skus, skuAliases = {}) {
  const maps = skuMaps(skus, skuAliases, 'ym');
  const articleMap = new Map();
  const seriesByDate = new Map();
  const diagnostics = {
    sourceRows: 0,
    matchedRows: 0,
    unmatchedRows: 0,
    skippedRows: 0,
    sourceUnits: 0,
    matchedUnits: 0,
    unmatchedUnits: 0,
    sourceRevenue: 0,
    matchedRevenue: 0,
    unmatchedRevenue: 0,
    unmatchedSamples: []
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    const offerId = normalizeText(row.offerId || row.OFFER_ID || row.shopSku || row.SHOP_SKU || row.sku || row.SKU);
    const dateKey = reportRowDate(row);
    if (!offerId || !dateKey) {
      diagnostics.skippedRows += 1;
      continue;
    }
    const ordersUnits = numberOrZero(row.orderItems ?? row.ORDER_ITEMS);
    const revenue = numberOrZero(row.orderItemsTotalAmount ?? row.ORDER_ITEMS_TOTAL_AMOUNT);
    const deliveredRevenue = numberOrZero(row.orderItemsDeliveredTotalAmount ?? row.ORDER_ITEMS_DELIVERED_TOTAL_AMOUNT);
    const deliveredUnits = numberOrZero(row.orderItemsDeliveredCount ?? row.ORDER_ITEMS_DELIVERED_COUNT);
    const hasBusinessMetric = ordersUnits || revenue || deliveredUnits || deliveredRevenue
      || numberOrZero(row.shows ?? row.SHOWS)
      || numberOrZero(row.clicks ?? row.CLICKS)
      || numberOrZero(row.toCart ?? row.TO_CART);
    if (!hasBusinessMetric) {
      diagnostics.skippedRows += 1;
      continue;
    }
    const sku = maps.byArticle.get(normalizeKey(offerId)) || null;
    diagnostics.sourceRows += 1;
    diagnostics.sourceUnits += ordersUnits;
    diagnostics.sourceRevenue += revenue;
    if (!sku) {
      diagnostics.unmatchedRows += 1;
      diagnostics.unmatchedUnits += ordersUnits;
      diagnostics.unmatchedRevenue += revenue;
      if (diagnostics.unmatchedSamples.length < 50) {
        diagnostics.unmatchedSamples.push({
          offerId,
          date: dateKey,
          units: ordersUnits,
          revenue,
          name: normalizeText(row.offerName || row.OFFER_NAME)
        });
      }
      continue;
    }
    diagnostics.matchedRows += 1;
    diagnostics.matchedUnits += ordersUnits;
    diagnostics.matchedRevenue += revenue;
    addArticlePoint(articleMap, sku, offerId, row);

    const point = seriesByDate.get(dateKey) || {
      label: dateKey,
      date: dateKey,
      units: 0,
      revenue: 0,
      estimatedMargin: 0
    };
    point.units += ordersUnits;
    point.revenue += revenue;
    point.estimatedMargin += sku && marginForSku(sku) > 0 ? revenue * marginForSku(sku) : 0;
    seriesByDate.set(dateKey, point);
  }

  const series = Array.from(seriesByDate.values())
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((point, index, list) => ({
      dayOffset: list.length - 1 - index,
      label: point.label,
      date: point.date,
      units: Number(numberOrZero(point.units).toFixed(4)),
      revenue: Number(numberOrZero(point.revenue).toFixed(4)),
      estimatedMargin: Number(numberOrZero(point.estimatedMargin).toFixed(4))
    }));

  return {
    articles: materializeArticles(articleMap),
    series,
    diagnostics
  };
}

function platformMap(platformTrends) {
  const map = new Map();
  for (const platform of Array.isArray(platformTrends?.platforms) ? platformTrends.platforms : []) {
    map.set(normalizeText(platform?.key), platform);
  }
  return map;
}

function replaceSeriesWindow(existingSeries, freshSeries, from, to) {
  const byDate = new Map();
  for (const point of Array.isArray(existingSeries) ? existingSeries : []) {
    const date = isoDate(point?.label || point?.date);
    if (!date || (date >= from && date <= to)) continue;
    byDate.set(date, { ...point, label: date, date });
  }
  for (const point of Array.isArray(freshSeries) ? freshSeries : []) {
    const date = isoDate(point?.label || point?.date);
    if (!date) continue;
    byDate.set(date, { ...point, label: date, date });
  }
  const list = Array.from(byDate.values()).sort((left, right) => isoDate(left.label || left.date).localeCompare(isoDate(right.label || right.date)));
  const latestIndex = list.length - 1;
  return list.map((point, index) => ({
    ...point,
    dayOffset: latestIndex - index,
    label: isoDate(point.label || point.date),
    date: isoDate(point.date || point.label),
    units: Number(numberOrZero(point.units).toFixed(4)),
    revenue: Number(numberOrZero(point.revenue).toFixed(4)),
    estimatedMargin: Number(numberOrZero(point.estimatedMargin).toFixed(4))
  }));
}

function mergeAllSeries(platforms) {
  const dateSet = new Set();
  for (const key of ['wb', 'ozon', 'ya']) {
    for (const point of platforms.get(key)?.series || []) {
      const date = isoDate(point?.label || point?.date);
      if (date) dateSet.add(date);
    }
  }
  const dates = Array.from(dateSet).sort();
  const latestIndex = dates.length - 1;
  return dates.map((date, index) => {
    const total = { units: 0, revenue: 0, financeTurnover: 0, financialResult: 0, estimatedMargin: 0 };
    for (const key of ['wb', 'ozon', 'ya']) {
      const point = (platforms.get(key)?.series || []).find((item) => isoDate(item?.label || item?.date) === date);
      if (!point) continue;
      const revenue = firstNumber(point?.financeTurnover, point?.revenue);
      const margin = firstNumber(point?.financialResult, point?.estimatedMargin);
      total.units += numberOrZero(point.units);
      total.revenue += numberOrZero(point.revenue);
      total.financeTurnover += revenue;
      total.financialResult += margin;
      total.estimatedMargin += margin;
    }
    return {
      dayOffset: latestIndex - index,
      label: date,
      date,
      units: Number(total.units.toFixed(4)),
      revenue: Number(total.revenue.toFixed(4)),
      financeTurnover: Number(total.financeTurnover.toFixed(4)),
      financialResult: Number(total.financialResult.toFixed(4)),
      estimatedMargin: Number(total.estimatedMargin.toFixed(4))
    };
  });
}

function latestDateFromPlatforms(platforms) {
  const dates = [];
  for (const platform of platforms.values()) {
    for (const point of platform?.series || []) {
      const date = isoDate(point?.label || point?.date);
      if (date) dates.push(date);
    }
  }
  return dates.sort().pop() || '';
}

function updatePlatformTrends(existing, layer, options, identities) {
  const platforms = platformMap(existing);
  const existingYa = platforms.get('ya') || { key: 'ya', label: PLATFORM_LABELS.ya, series: [] };
  platforms.set('ya', {
    ...existingYa,
    key: 'ya',
    label: existingYa.label || PLATFORM_LABELS.ya,
    series: replaceSeriesWindow(existingYa.series, layer.series, options.from, options.to)
  });
  platforms.set('all', {
    ...(platforms.get('all') || {}),
    key: 'all',
    label: PLATFORM_LABELS.all,
    series: mergeAllSeries(platforms)
  });

  const orderedKeys = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'all'];
  const ordered = [
    ...orderedKeys.map((key) => platforms.get(key)).filter(Boolean),
    ...Array.from(platforms.entries())
      .filter(([key]) => !orderedKeys.includes(key))
      .map(([, platform]) => platform)
  ];
  const latestMarketplaceDate = latestDateFromPlatforms(platforms) || existing?.latestMarketplaceDate || options.to;
  const existingExtraMarketplace = existing?.extraMarketplace && typeof existing.extraMarketplace === 'object'
    ? existing.extraMarketplace
    : {};
  const existingExtraPlatforms = existingExtraMarketplace?.platforms && typeof existingExtraMarketplace.platforms === 'object'
    ? existingExtraMarketplace.platforms
    : {};

  return {
    ...existing,
    generatedAt: new Date().toISOString(),
    latestMarketplaceDate,
    note: 'Marketplace facts refreshed from API-backed platform_trends.json with Yandex Market direct SKU layer.',
    platforms: ordered,
    yandexMarketApiDirect: {
      source: 'partner-api:/v2/reports/shows-sales',
      from: options.from,
      to: options.to,
      identities: identities.length,
      sourceRows: layer.diagnostics.sourceRows,
      matchedRows: layer.diagnostics.matchedRows,
      unmatchedRows: layer.diagnostics.unmatchedRows,
      skippedRows: layer.diagnostics.skippedRows,
      matchRate: layer.diagnostics.sourceRows > 0 ? Number((layer.diagnostics.matchedRows / layer.diagnostics.sourceRows).toFixed(4)) : 0,
      sourceRevenue: Number(numberOrZero(layer.diagnostics.sourceRevenue).toFixed(4)),
      matchedRevenue: Number(numberOrZero(layer.diagnostics.matchedRevenue).toFixed(4)),
      unmatchedRevenue: Number(numberOrZero(layer.diagnostics.unmatchedRevenue).toFixed(4)),
      sourceUnits: Number(numberOrZero(layer.diagnostics.sourceUnits).toFixed(4)),
      matchedUnits: Number(numberOrZero(layer.diagnostics.matchedUnits).toFixed(4)),
      unmatchedUnits: Number(numberOrZero(layer.diagnostics.unmatchedUnits).toFixed(4)),
      unmatchedSamples: layer.diagnostics.unmatchedSamples,
      settlementHour: options.settlementHour,
      autoLagDays: options.explicitTo ? 0 : options.autoLagDays,
      explicitTo: options.explicitTo,
      reportFormat: 'JSON',
      grouping: 'OFFERS',
      sourceMode: 'yandex-market-api-direct-sku',
      revenueField: 'orderItemsTotalAmount',
      unitsField: 'orderItems',
      strictSkuMatch: true
    },
    extraMarketplace: {
      ...existingExtraMarketplace,
      generatedAt: new Date().toISOString(),
      asOfDate: latestMarketplaceDate,
      platforms: {
        ...existingExtraPlatforms,
        ya: {
          key: 'ya',
          label: PLATFORM_LABELS.ya,
          supportKey: 'ym',
          source: 'partner-api:/v2/reports/shows-sales',
          sourceMode: 'yandex-market-api-direct-sku',
          strictSkuMatch: true,
          from: options.from,
          to: options.to,
          articles: layer.articles
        }
      }
    }
  };
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (options.command !== 'sync') throw new Error(`Unsupported command: ${options.command}`);
  const existing = readJson(options.inputPath, { platforms: [] });
  if (!options.apiKey) {
    console.warn('Yandex Market API key is not set. Preserve existing platform_trends.json and skip Yandex refresh.');
    if (options.inputPath !== options.outputPath) writeJson(options.outputPath, existing);
    return;
  }

  const skus = readJson(options.skusPath, []);
  const skuAliases = readJson(options.skuAliasPath, { aliases: [] });
  const identities = await discoverIdentities(options);
  if (!identities.length) {
    console.warn('Yandex Market campaignId/businessId was not found. Preserve existing platform_trends.json and skip Yandex refresh.');
    if (options.inputPath !== options.outputPath) writeJson(options.outputPath, existing);
    return;
  }

  const rows = [];
  for (const identity of identities) {
    rows.push(...await generateShowsSalesReport(options, identity));
  }
  const layer = buildYandexLayer(rows, skus, skuAliases);
  const payload = updatePlatformTrends(existing, layer, options, identities);
  writeJson(options.outputPath, payload);
  console.log(JSON.stringify({
    outputPath: options.outputPath,
    generatedAt: payload.generatedAt,
    latestMarketplaceDate: payload.latestMarketplaceDate,
    identities: identities.length,
    sourceRows: layer.diagnostics.sourceRows,
    matchedRows: layer.diagnostics.matchedRows,
    unmatchedRows: layer.diagnostics.unmatchedRows,
    skippedRows: layer.diagnostics.skippedRows,
    matchedRevenue: Number(numberOrZero(layer.diagnostics.matchedRevenue).toFixed(4)),
    unmatchedRevenue: Number(numberOrZero(layer.diagnostics.unmatchedRevenue).toFixed(4)),
    articleRows: layer.articles.length,
    sourceMode: 'yandex-market-api-direct-sku'
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
