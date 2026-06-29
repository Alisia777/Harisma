#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const PLATFORM_KEY = 'magnit';
const PLATFORM_LABEL = 'Магнит Маркет';
const SUPPORT_KEY = 'mm';
const SOURCE_MODE = 'magnit-market-csv-daily';
const API_SOURCE_MODE = 'magnit-market-partner-api';
const DEFAULT_API_BASE_URL = 'https://b2b-api.magnit.ru';
const DEFAULT_API_HISTORY_FROM = '2026-01-01';

function parseArgs(argv) {
  const args = { command: 'sync' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      if (index === 2) args.command = token;
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
    if (token === '--allow-missing-source') {
      args.requireSource = false;
      continue;
    }
    if (token === '--require-source') {
      args.requireSource = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const next = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined && next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/giu, '');
}

function numberOrZero(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = normalizeText(value)
    .replace(/\s+/g, '')
    .replace(/₽/g, '')
    .replace(/руб\.?/gi, '')
    .replace(/%/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const raw = normalizeText(value).toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
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
    const first = Number(match[1]);
    const second = Number(match[2]);
    const delimiter = raw.includes('/') ? '/' : raw.includes('.') ? '.' : '-';
    const monthFirst = delimiter === '/' && first <= 12;
    const month = monthFirst || second > 12 ? first : second;
    const day = monthFirst || second > 12 ? second : first;
    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  const start = isoDate(from);
  const end = isoDate(to);
  if (!start || !end || start > end) return [];
  const result = [];
  for (let date = start; date <= end; date = addDays(date, 1)) result.push(date);
  return result;
}

function monthKey(value) {
  const date = isoDate(value);
  return date ? date.slice(0, 7) : '';
}

function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const firstDataLine = clean.split(/\r?\n/).find((line) => ((line.match(/;/g) || []).length + (line.match(/,/g) || []).length) > 1) || '';
  const delimiter = (firstDataLine.match(/;/g) || []).length >= (firstDataLine.match(/,/g) || []).length ? ';' : ',';
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
  const headerIndex = filtered.findIndex((item) => {
    const joined = item.join('|').toLowerCase();
    return item.filter(Boolean).length >= 2 && joined.includes('статус') && (joined.includes('дата') || joined.includes('sku'));
  });
  const fallbackHeaderIndex = filtered.findIndex((item) => item.filter(Boolean).length >= 2);
  const start = headerIndex >= 0 ? headerIndex : fallbackHeaderIndex;
  if (start < 0) return [];
  const [header = [], ...body] = filtered.slice(start);
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ''])));
}

function workbookRowsByHeaders(filePath, requiredHeaders) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const required = requiredHeaders.map(normalizeKey);
  for (const sheetName of workbook.SheetNames || []) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    });
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
      const headers = rows[rowIndex].map((header) => normalizeText(header));
      const headerSet = new Set(headers.map(normalizeKey));
      if (!required.every((header) => headerSet.has(header))) continue;
      const body = rows.slice(rowIndex + 1)
        .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
        .filter((row) => Object.values(row).some((value) => normalizeText(value)));
      return { sheetName, rows: body };
    }
  }
  return { sheetName: '', rows: [] };
}

function salesRowsFromFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (['.xlsx', '.xls', '.xlsm'].includes(extension)) {
    const selection = workbookRowsByHeaders(filePath, ['Статус', 'Дата создания', 'Seller SKU ID']);
    return {
      rows: selection.rows,
      kind: 'workbook',
      detail: selection.sheetName ? `${path.basename(filePath)} / ${selection.sheetName}` : path.basename(filePath)
    };
  }
  return {
    rows: parseCsv(fs.readFileSync(filePath, 'utf8')),
    kind: 'csv',
    detail: path.basename(filePath)
  };
}

function resolvePath(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  return path.resolve(raw);
}

function existingPath(...candidates) {
  for (const candidate of candidates.map(resolvePath).filter(Boolean)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function defaultLocalTemp(name) {
  const localAppData = normalizeText(process.env.LOCALAPPDATA);
  return localAppData ? path.join(localAppData, 'Temp', name) : '';
}

function resolveOptions(args) {
  const root = process.cwd();
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(root, 'data'));
  const outputDir = args['output-dir'] ? path.resolve(args['output-dir']) : '';
  const inputFile = path.resolve(args['input-file'] || path.join(baseDataDir, 'platform_trends.json'));
  const outputFile = path.resolve(args['output-file'] || (outputDir ? path.join(outputDir, 'platform_trends.json') : inputFile));
  const smartPriceInputFile = path.resolve(args['smart-price-input-file'] || path.join(baseDataDir, 'smart_price_overlay.json'));
  const smartPriceOutputFile = path.resolve(args['smart-price-output-file'] || (outputDir ? path.join(outputDir, 'smart_price_overlay.json') : smartPriceInputFile));
  const rawOutputDir = path.resolve(args['raw-output-dir'] || path.join(outputDir || baseDataDir, 'raw'));
  const apiKey = normalizeText(
    args['api-key']
    || process.env.ALTEA_MAGNIT_API_KEY
    || process.env.ALTEA_MAGNIT_API_TOKEN
    || process.env.ALTEA_MAGNIT_MARKET_API_KEY
    || process.env.ALTEA_MAGNIT_MARKET_API_TOKEN
  );
  const salesCsv = existingPath(
    args['sales-csv'],
    process.env.ALTEA_MAGNIT_SALES_CSV,
    path.join(baseDataDir, 'external_sources', 'magnit_sales.csv'),
    path.join(root, 'data', 'external_sources', 'magnit_sales.csv'),
    path.join(root, '..', 'data', 'external_sources', 'magnit_sales.csv'),
    defaultLocalTemp('magnit_sales.csv')
  );
  const salesWorkbook = existingPath(
    args['sales-xlsx'],
    args['sales-xls'],
    args['sales-workbook'],
    process.env.ALTEA_MAGNIT_SALES_XLSX,
    process.env.ALTEA_MAGNIT_SALES_XLS,
    process.env.ALTEA_MAGNIT_SALES_WORKBOOK,
    path.join(baseDataDir, 'external_sources', 'magnit_sales_drive.xlsx'),
    path.join(baseDataDir, 'external_sources', 'magnit_sales.xlsx'),
    path.join(root, 'data', 'external_sources', 'magnit_sales_drive.xlsx'),
    path.join(root, 'data', 'external_sources', 'magnit_sales.xlsx'),
    path.join(root, '..', 'data', 'external_sources', 'magnit_sales_drive.xlsx'),
    path.join(root, '..', 'data', 'external_sources', 'magnit_sales.xlsx'),
    defaultLocalTemp('magnit_sales.xlsx')
  );
  const servicesCsv = existingPath(
    args['services-csv'],
    process.env.ALTEA_MAGNIT_SERVICES_CSV,
    path.join(baseDataDir, 'external_sources', 'magnit_services.csv'),
    path.join(root, 'data', 'external_sources', 'magnit_services.csv'),
    path.join(root, '..', 'data', 'external_sources', 'magnit_services.csv'),
    defaultLocalTemp('magnit_services.csv')
  );
  return {
    command: args.command || 'sync',
    dryRun: Boolean(args.dryRun),
    mirrorLocalFallback: asBool(args['mirror-local-fallback'], Boolean(args.mirrorLocalFallback)),
    requireSource: args.requireSource !== undefined ? Boolean(args.requireSource) : asBool(args['require-source'], true),
    baseDataDir,
    outputDir,
    inputFile,
    outputFile,
    smartPriceInputFile,
    smartPriceOutputFile,
    rawOutputFile: path.resolve(args['raw-output'] || path.join(rawOutputDir, 'magnit_market.json')),
    skusFile: path.resolve(args['skus-file'] || path.join(baseDataDir, 'skus.json')),
    skuAliasesFile: path.resolve(args['sku-aliases-file'] || path.join(baseDataDir, 'sku_aliases.json')),
    lastGoodFile: path.resolve(args['last-good-file'] || path.join(baseDataDir, 'last_good', 'platform_trends.json')),
    apiKey,
    apiBaseUrl: normalizeText(args['api-base-url'] || process.env.ALTEA_MAGNIT_API_BASE_URL || process.env.ALTEA_MAGNIT_MARKET_API_BASE_URL || DEFAULT_API_BASE_URL),
    apiFrom: isoDate(args['api-from'] || args.from || args['date-from'] || process.env.ALTEA_MAGNIT_HISTORY_FROM || DEFAULT_API_HISTORY_FROM),
    apiTo: isoDate(args['api-to'] || args.to || args['date-to'] || new Date()),
    apiPageSize: Math.max(1, Math.min(1000, Number(args['api-page-size'] || process.env.ALTEA_MAGNIT_API_PAGE_SIZE || 1000) || 1000)),
    apiMaxPages: Math.max(1, Number(args['api-max-pages'] || process.env.ALTEA_MAGNIT_API_MAX_PAGES || 200) || 200),
    preferApi: args['prefer-api'] !== undefined ? asBool(args['prefer-api'], true) : true,
    salesCsv,
    salesWorkbook,
    servicesCsv,
    from: isoDate(args.from || args['date-from'] || ''),
    to: isoDate(args.to || args['date-to'] || '')
  };
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

function aliasPlatformMatches(value) {
  const raw = normalizeKey(value);
  return !raw || ['all', 'any', PLATFORM_KEY, 'magnitmarket', SUPPORT_KEY, 'магнит', 'магнитмаркет'].includes(raw);
}

function activeAliasRows(payload = {}) {
  return skuAliasRows(payload).filter((row) => {
    const status = normalizeKey(row?.status ?? row?.active ?? 'active');
    return !['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove', 'ignore', 'skip'].includes(status);
  });
}

function addLookupToken(lookup, value, sku) {
  const token = normalizeKey(value);
  if (token && !lookup.has(token)) lookup.set(token, sku);
}

function buildSkuLookup(skus = [], skuAliases = {}) {
  const lookup = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    [
      sku.articleKey,
      sku.article,
      sku.sku,
      sku.vendorCode,
      sku.offerId,
      sku.barcode,
      sku.ean,
      sku?.mm?.sku,
      sku?.mm?.article,
      sku?.mm?.sellerSku,
      sku?.magnit?.sku,
      sku?.magnit?.article,
      sku?.magnit?.sellerSku,
      sku?.magnitmarket?.sku,
      sku?.magnitmarket?.article
    ].forEach((value) => addLookupToken(lookup, value, sku));
  }

  for (const row of activeAliasRows(skuAliases)) {
    if (!aliasPlatformMatches(row.platform || row.marketplace || row.sourcePlatform)) continue;
    const target = normalizeText(row.target_sku || row.targetSku || row.target || row.articleKey || row.article);
    if (!target) continue;
    const sku = lookup.get(normalizeKey(target)) || (Array.isArray(skus) ? skus : []).find((item) => normalizeKey(item.articleKey || item.article) === normalizeKey(target));
    if (!sku) continue;
    [
      row.api_sku,
      row.apiSku,
      row.alias,
      row.value,
      row.source_sku,
      row.marketplace_sku,
      row.external_sku,
      row.offer_id,
      row.offerId,
      row.vendor_code,
      row.vendorCode
    ].forEach((value) => addLookupToken(lookup, value, sku));
  }
  return lookup;
}

function articleKeyForSku(sku, fallback) {
  return normalizeText(sku?.articleKey || sku?.article || fallback);
}

function articleNameForSku(sku, fallback) {
  return normalizeText(sku?.name || fallback);
}

function ownerForSku(sku) {
  return normalizeText(
    sku?.ownersByPlatform?.[SUPPORT_KEY]
    || sku?.owner?.byPlatform?.[SUPPORT_KEY]
    || sku?.owner?.name
    || ''
  );
}

function emptyMetricBucket(date = '') {
  return {
    date,
    ordersUnits: 0,
    ordersRevenue: 0,
    deliveredUnits: 0,
    deliveredRevenue: 0,
    buyoutUnits: 0,
    buyoutRevenue: 0,
    cancellationsUnits: 0,
    cancelRevenue: 0,
    returnsUnits: 0,
    netPayout: 0,
    adsSpend: 0
  };
}

function addBucketMetric(map, date, patch) {
  if (!date) return;
  const bucket = map.get(date) || emptyMetricBucket(date);
  for (const [key, value] of Object.entries(patch)) {
    bucket[key] = numberOrZero(bucket[key]) + numberOrZero(value);
  }
  map.set(date, bucket);
}

function sourceFileInfo(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    file: path.basename(filePath),
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString()
  };
}

function inRequestedRange(date, options) {
  if (!date) return false;
  if (options.from && date < options.from) return false;
  if (options.to && date > options.to) return false;
  return true;
}

function buildMagnitSnapshot(options, skus, skuAliases) {
  const salesSource = options.salesWorkbook || options.salesCsv;
  if (!salesSource) {
    const message = 'Magnit sales source is missing. Expected ALTEA_MAGNIT_SALES_XLSX, ALTEA_MAGNIT_SALES_CSV, or data/external_sources/magnit_sales_drive.xlsx.';
    if (options.requireSource) throw new Error(message);
    return { missing: true, message };
  }

  const salesInput = salesRowsFromFile(salesSource);
  const salesRows = salesInput.rows;
  const sourceMode = salesInput.kind === 'workbook' ? 'magnit-market-xlsx-daily' : SOURCE_MODE;
  const serviceRows = options.servicesCsv ? parseCsv(fs.readFileSync(options.servicesCsv, 'utf8')) : [];
  const skuLookup = buildSkuLookup(skus, skuAliases);
  const platformDaily = new Map();
  const articleMap = new Map();
  const normalizedSales = [];
  const normalizedServices = [];
  const skipped = { salesWithoutDate: 0, salesWithoutArticle: 0, servicesWithoutDate: 0 };

  function articleBucket(row) {
    const sourceArticleKey = normalizeText(row['Seller SKU ID'] || row.SellerSkuId || row.sellerSkuId || row.SKU || row['Штрихкод']);
    if (!sourceArticleKey) {
      skipped.salesWithoutArticle += 1;
      return null;
    }
    const sku = skuLookup.get(normalizeKey(sourceArticleKey)) || null;
    const articleKey = articleKeyForSku(sku, sourceArticleKey);
    const name = articleNameForSku(sku, normalizeText(row['Наименование']) || articleKey);
    const key = normalizeKey(articleKey);
    const bucket = articleMap.get(key) || {
      platformKey: PLATFORM_KEY,
      platformLabel: PLATFORM_LABEL,
      articleKey,
      article: articleKey,
      sourceArticleKey,
      sourceArticleKeys: new Set(),
      skuMatched: Boolean(sku),
      name,
      owner: ownerForSku(sku),
      dailyMap: new Map(),
      source: sourceMode
    };
    bucket.sourceArticleKeys.add(sourceArticleKey);
    bucket.skuMatched = bucket.skuMatched || Boolean(sku);
    bucket.name = bucket.name || name;
    bucket.owner = bucket.owner || ownerForSku(sku);
    articleMap.set(key, bucket);
    return bucket;
  }

  for (const row of salesRows) {
    const orderDate = isoDate(row['Дата создания']);
    if (!orderDate) {
      skipped.salesWithoutDate += 1;
      continue;
    }
    if (!inRequestedRange(orderDate, options)) continue;
    const deliveryDateRaw = isoDate(row['Дата получения']);
    const status = normalizeText(row['Статус']).toLowerCase();
    const isCanceled = /отмен|отказ/i.test(status);
    const isDelivered = Boolean(deliveryDateRaw) || /заверш|достав|получ/i.test(status);
    const deliveryDate = deliveryDateRaw || (isDelivered ? orderDate : '');
    const quantity = numberOrZero(row['Количество']);
    const grossRevenue = numberOrZero(row['Выручка (руб.)']);
    const netPayout = numberOrZero(row['Выручка с вычетом комиссии (руб.)']);
    const returnsUnits = numberOrZero(row['Возвраты']);
    const cancelRevenue = isCanceled ? grossRevenue : 0;
    const article = articleBucket(row);

    const orderPatch = {
      ordersUnits: quantity,
      ordersRevenue: grossRevenue,
      cancellationsUnits: isCanceled ? quantity : 0,
      cancelRevenue,
      returnsUnits
    };
    addBucketMetric(platformDaily, orderDate, orderPatch);
    if (article) addBucketMetric(article.dailyMap, orderDate, orderPatch);

    if (deliveryDate && inRequestedRange(deliveryDate, options)) {
      const deliveryPatch = {
        deliveredUnits: isDelivered ? quantity : 0,
        deliveredRevenue: isDelivered ? grossRevenue : 0,
        buyoutUnits: isDelivered ? quantity : 0,
        buyoutRevenue: isDelivered ? grossRevenue : 0,
        netPayout: isDelivered ? netPayout : 0
      };
      addBucketMetric(platformDaily, deliveryDate, deliveryPatch);
      if (article) addBucketMetric(article.dailyMap, deliveryDate, deliveryPatch);
    }

    normalizedSales.push({
      status: row['Статус'],
      orderDate,
      deliveryDate,
      orderId: normalizeText(row['№ заказа']),
      sourceArticleKey: normalizeText(row['Seller SKU ID'] || row.SKU || row['Штрихкод']),
      articleKey: article?.articleKey || '',
      skuMatched: Boolean(article?.skuMatched),
      quantity,
      revenue: grossRevenue,
      netPayout,
      returnsUnits,
      source: SOURCE_MODE
    });
  }

  for (const row of serviceRows) {
    const status = normalizeText(row['Статус']).toLowerCase();
    if (status && !/оплачен|оплачено|paid/i.test(status)) continue;
    const date = isoDate(row['Дата списания']);
    if (!date) {
      skipped.servicesWithoutDate += 1;
      continue;
    }
    if (!inRequestedRange(date, options)) continue;
    const spend = numberOrZero(row['Сумма (руб.)'] || row['Стоимость (руб.)']);
    addBucketMetric(platformDaily, date, { adsSpend: spend });
    normalizedServices.push({
      date,
      sourceName: row['Источник'] || '',
      service: row['Услуга'] || '',
      status: row['Статус'] || '',
      spend,
      source: SOURCE_MODE
    });
  }

  const dailyDates = [...platformDaily.keys()].sort();
  const firstDate = dailyDates[0] || '';
  const lastDate = dailyDates[dailyDates.length - 1] || '';
  const fullDates = enumerateDates(options.from || firstDate, options.to || lastDate);
  const series = fullDates
    .map((date) => platformDaily.get(date) || emptyMetricBucket(date))
    .map((row, index, list) => dailyPoint(row, list.length - 1 - index, sourceMode));

  const articles = [...articleMap.values()]
    .map((article) => buildArticle(article, fullDates))
    .filter((article) => article.daily.length)
    .sort((left, right) => left.articleKey.localeCompare(right.articleKey));

  const diagnostics = articleDiagnostics(articles);
  diagnostics.source = sourceMode;
  diagnostics.dailyMode = true;
  diagnostics.inputKind = salesInput.kind;
  diagnostics.inputDetail = salesInput.detail;
  diagnostics.salesRows = salesRows.length;
  diagnostics.serviceRows = serviceRows.length;
  diagnostics.normalizedSalesRows = normalizedSales.length;
  diagnostics.normalizedServiceRows = normalizedServices.length;
  diagnostics.firstDate = firstDate;
  diagnostics.lastDate = lastDate;
  diagnostics.skipped = skipped;
  diagnostics.files = {
    sales: sourceFileInfo(salesSource),
    services: sourceFileInfo(options.servicesCsv)
  };

  return {
    key: PLATFORM_KEY,
    label: PLATFORM_LABEL,
    sourceMode,
    series,
    articles,
    diagnostics,
    raw: {
      schema: 'portal-magnit-market-raw-v1',
      generatedAt: new Date().toISOString(),
      sourceMode,
      window: {
        from: options.from || firstDate,
        to: options.to || lastDate
      },
      diagnostics,
      sales: normalizedSales,
      services: normalizedServices
    }
  };
}

function apiDateTime(dateKey, endOfDay = false) {
  const date = isoDate(dateKey);
  if (!date) return '';
  const shifted = endOfDay ? addDays(date, 1) : date;
  return `${shifted}T00:00:00+03:00`;
}

function magnitApiHeaders(apiKey) {
  return {
    'X-Api-Key': apiKey,
    'X-API-Key': apiKey,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

function magnitApiUrl(options, endpoint) {
  return `${String(options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '')}/${String(endpoint || '').replace(/^\/+/, '')}`;
}

async function magnitApiPost(options, endpoint, body) {
  const response = await fetch(magnitApiUrl(options, endpoint), {
    method: 'POST',
    headers: magnitApiHeaders(options.apiKey),
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const detail = typeof payload?.message === 'string' ? payload.message : text.slice(0, 700);
    throw new Error(`${endpoint}: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
  }
  return payload;
}

function responseItems(payload) {
  const candidates = [
    payload?.result?.items,
    payload?.result?.orders,
    payload?.result,
    payload?.items,
    payload?.orders,
    payload?.data?.items,
    payload?.data?.result?.items
  ];
  return candidates.find(Array.isArray) || [];
}

function responseNextPageToken(payload) {
  return normalizeText(
    payload?.result?.next_page_token
    || payload?.result?.nextPageToken
    || payload?.next_page_token
    || payload?.nextPageToken
    || payload?.pagination?.next_page_token
    || payload?.result?.pagination?.next_page_token
  );
}

function responseTotalPages(payload) {
  const value = Number(
    payload?.result?.pagination?.total_pages
    || payload?.pagination?.total_pages
    || payload?.result?.total_pages
    || payload?.total_pages
  );
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function buildMagnitApiSkuFilters(skuAliases = {}) {
  const skuIds = new Set();
  const sellerSkuIds = new Set();
  for (const row of activeAliasRows(skuAliases)) {
    if (!aliasPlatformMatches(row.platform || row.marketplace || row.sourcePlatform)) continue;
    const value = normalizeText(row.api_sku || row.apiSku || row.alias || row.value || row.marketplace_sku || row.external_sku);
    if (!value) continue;
    const note = normalizeText(row.note || row.source || '').toLowerCase();
    const isNumeric = /^\d+$/.test(value);
    if (isNumeric && (note.includes('product') || value.length <= 10)) {
      skuIds.add(Number(value));
    } else {
      sellerSkuIds.add(value);
    }
  }
  return {
    sku_ids: Array.from(skuIds),
    seller_sku_ids: Array.from(sellerSkuIds)
  };
}

async function fetchMagnitSkuInfo(options, endpoint, filters) {
  const rows = [];
  for (let page = 0; page < options.apiMaxPages; page += 1) {
    const filter = {};
    if (Array.isArray(filters.sku_ids) && filters.sku_ids.length) filter.sku_ids = filters.sku_ids;
    if (Array.isArray(filters.seller_sku_ids) && filters.seller_sku_ids.length) filter.seller_sku_ids = filters.seller_sku_ids;
    const payload = await magnitApiPost(options, endpoint, {
      filter,
      pagination: {
        dir: 'ASC',
        page,
        page_size: options.apiPageSize
      }
    });
    const pageRows = responseItems(payload);
    rows.push(...pageRows);
    const totalPages = responseTotalPages(payload);
    if (totalPages && page + 1 >= totalPages) break;
    if (pageRows.length < options.apiPageSize) break;
  }
  return rows;
}

async function fetchMagnitOrders(options) {
  const rows = [];
  let pageToken = '';
  for (let page = 0; page < options.apiMaxPages; page += 1) {
    const body = {
      dir: 'ASC',
      page_size: options.apiPageSize,
      created_at: {
        from: apiDateTime(options.apiFrom),
        to: apiDateTime(options.apiTo, true)
      }
    };
    if (pageToken) body.page_token = pageToken;
    const payload = await magnitApiPost(options, '/api/seller/v1/orders/list', body);
    const pageRows = responseItems(payload);
    rows.push(...pageRows);
    pageToken = responseNextPageToken(payload);
    if (!pageToken || pageRows.length < options.apiPageSize) break;
  }
  return rows;
}

function apiArticleBucket(articleMap, skuLookup, sourceArticleKey, fallbackName = '') {
  const sourceKey = normalizeText(sourceArticleKey);
  if (!sourceKey) return null;
  const sku = skuLookup.get(normalizeKey(sourceKey)) || null;
  const articleKey = articleKeyForSku(sku, sourceKey);
  const name = articleNameForSku(sku, fallbackName || articleKey);
  const key = normalizeKey(articleKey);
  const bucket = articleMap.get(key) || {
    platformKey: PLATFORM_KEY,
    platformLabel: PLATFORM_LABEL,
    articleKey,
    article: articleKey,
    sourceArticleKey: sourceKey,
    sourceArticleKeys: new Set(),
    skuMatched: Boolean(sku),
    name,
    owner: ownerForSku(sku),
    dailyMap: new Map(),
    source: API_SOURCE_MODE
  };
  bucket.sourceArticleKeys.add(sourceKey);
  bucket.skuMatched = bucket.skuMatched || Boolean(sku);
  bucket.name = bucket.name || name;
  bucket.owner = bucket.owner || ownerForSku(sku);
  articleMap.set(key, bucket);
  return bucket;
}

function apiRowKey(row) {
  return normalizeText(row?.sku_id ?? row?.skuId ?? row?.seller_sku_id ?? row?.sellerSkuId ?? row?.seller_sku ?? row?.sellerSku);
}

function mapInfoBySourceKey(rows = []) {
  const map = new Map();
  for (const row of rows) {
    [
      row?.sku_id,
      row?.skuId,
      row?.seller_sku_id,
      row?.sellerSkuId,
      row?.seller_sku,
      row?.sellerSku
    ].map(normalizeText).filter(Boolean).forEach((key) => map.set(normalizeKey(key), row));
  }
  return map;
}

function stockFromInfo(row) {
  if (!row || typeof row !== 'object') return 0;
  const direct = numberOrZero(row.stock || row.quantity || row.available_stock || row.availableStock);
  const details = Array.isArray(row.stock_info_details) ? row.stock_info_details : (Array.isArray(row.stockInfoDetails) ? row.stockInfoDetails : []);
  const detailed = details.reduce((sum, item) => sum + numberOrZero(item?.stock || item?.quantity || item?.available_stock), 0);
  return detailed || direct;
}

function enrichArticlesWithApiInfo(articles, priceRows, stockRows) {
  const priceMap = mapInfoBySourceKey(priceRows);
  const stockMap = mapInfoBySourceKey(stockRows);
  return articles.map((article) => {
    const sourceKeys = Array.isArray(article.sourceArticleKeys) ? article.sourceArticleKeys : [article.sourceArticleKey, article.articleKey];
    const priceRow = sourceKeys.map((key) => priceMap.get(normalizeKey(key))).find(Boolean);
    const stockRow = sourceKeys.map((key) => stockMap.get(normalizeKey(key))).find(Boolean);
    const currentPrice = firstNumber(priceRow?.price, priceRow?.old_price, article.currentPrice);
    const stock = stockFromInfo(stockRow);
    return {
      ...article,
      currentPrice,
      currentClientPrice: currentPrice,
      currentFillPrice: currentPrice,
      stock,
      apiPrice: priceRow ? {
        skuId: normalizeText(priceRow.sku_id ?? priceRow.skuId),
        sellerSkuId: normalizeText(priceRow.seller_sku_id ?? priceRow.sellerSkuId),
        price: numberOrZero(priceRow.price),
        oldPrice: numberOrZero(priceRow.old_price ?? priceRow.oldPrice),
        commissionPercent: numberOrZero(priceRow.commission_percent ?? priceRow.commissionPercent),
        timestamp: normalizeText(priceRow.timestamp || '')
      } : null,
      apiStock: stockRow ? {
        skuId: normalizeText(stockRow.sku_id ?? stockRow.skuId),
        sellerSkuId: normalizeText(stockRow.seller_sku_id ?? stockRow.sellerSkuId),
        stock
      } : null
    };
  });
}

async function buildMagnitApiSnapshot(options, skus, skuAliases) {
  if (!options.preferApi || !options.apiKey) return null;

  const skuLookup = buildSkuLookup(skus, skuAliases);
  const filters = buildMagnitApiSkuFilters(skuAliases);
  const apiErrors = [];
  let priceRows = [];
  let stockRows = [];
  const orders = await fetchMagnitOrders(options);

  try {
    priceRows = await fetchMagnitSkuInfo(options, '/api/seller/v1/products/sku/price/info', filters);
  } catch (error) {
    apiErrors.push(error.message);
  }

  try {
    stockRows = await fetchMagnitSkuInfo(options, '/api/seller/v1/products/sku/stocks/info', filters);
  } catch (error) {
    apiErrors.push(error.message);
  }

  const platformDaily = new Map();
  const articleMap = new Map();
  const normalizedOrders = [];
  const skipped = { ordersWithoutDate: 0, itemsWithoutSku: 0, emptyOrders: 0 };

  for (const order of orders) {
    const orderDate = isoDate(order?.created_at || order?.createdAt || order?.cutoff_time || order?.cutoffTime);
    if (!orderDate) {
      skipped.ordersWithoutDate += 1;
      continue;
    }
    if (!inRequestedRange(orderDate, { from: options.apiFrom, to: options.apiTo })) continue;
    const items = Array.isArray(order?.items) ? order.items : [];
    if (!items.length) skipped.emptyOrders += 1;
    const status = normalizeText(order?.status).toUpperCase();
    const isCanceledOrder = /CANCEL|CANCELED|CANCELLED|ОТМЕН/i.test(status);

    for (const item of items) {
      const skuId = normalizeText(item?.sku_id ?? item?.skuId ?? item?.sku?.id);
      if (!skuId) {
        skipped.itemsWithoutSku += 1;
        continue;
      }
      const quantity = numberOrZero(item?.quantity ?? item?.qty);
      const canceledQuantity = numberOrZero(item?.canceled_quantity ?? item?.canceledQuantity);
      const orderedUnits = Math.max(0, quantity + canceledQuantity);
      const price = firstNumber(
        item?.financial_data?.payment_price,
        item?.financialData?.paymentPrice,
        item?.financial_data?.price,
        item?.financialData?.price,
        item?.price
      );
      const revenue = orderedUnits * price;
      const cancelUnits = isCanceledOrder ? orderedUnits : canceledQuantity;
      const cancelRevenue = cancelUnits * price;
      const patch = {
        ordersUnits: orderedUnits,
        ordersRevenue: revenue,
        cancellationsUnits: cancelUnits,
        cancelRevenue
      };
      addBucketMetric(platformDaily, orderDate, patch);
      const article = apiArticleBucket(articleMap, skuLookup, skuId);
      if (article) addBucketMetric(article.dailyMap, orderDate, patch);
      normalizedOrders.push({
        date: orderDate,
        orderId: normalizeText(order?.order_id || order?.orderId || ''),
        status,
        sourceArticleKey: skuId,
        articleKey: article?.articleKey || '',
        skuMatched: Boolean(article?.skuMatched),
        quantity: orderedUnits,
        canceledQuantity: cancelUnits,
        price,
        revenue,
        source: API_SOURCE_MODE
      });
    }
  }

  const dailyDates = [...platformDaily.keys()].sort();
  const firstDate = dailyDates[0] || options.apiFrom || '';
  const lastDate = dailyDates[dailyDates.length - 1] || options.apiTo || '';
  const fullDates = enumerateDates(options.apiFrom || firstDate, options.apiTo || lastDate);
  const series = fullDates
    .map((date) => platformDaily.get(date) || emptyMetricBucket(date))
    .map((row, index, list) => dailyPoint(row, list.length - 1 - index, API_SOURCE_MODE));

  const articles = enrichArticlesWithApiInfo(
    [...articleMap.values()]
      .map((article) => buildArticle(article, fullDates))
      .filter((article) => article.daily.length)
      .sort((left, right) => left.articleKey.localeCompare(right.articleKey)),
    priceRows,
    stockRows
  );

  const diagnostics = articleDiagnostics(articles);
  diagnostics.source = API_SOURCE_MODE;
  diagnostics.dailyMode = true;
  diagnostics.ordersRows = orders.length;
  diagnostics.normalizedOrderRows = normalizedOrders.length;
  diagnostics.priceRows = priceRows.length;
  diagnostics.stockRows = stockRows.length;
  diagnostics.firstDate = firstDate;
  diagnostics.lastDate = lastDate;
  diagnostics.window = { from: options.apiFrom, to: options.apiTo };
  diagnostics.skuFilter = {
    skuIds: filters.sku_ids.length,
    sellerSkuIds: filters.seller_sku_ids.length
  };
  diagnostics.skipped = skipped;
  diagnostics.apiErrors = apiErrors;

  return {
    key: PLATFORM_KEY,
    label: PLATFORM_LABEL,
    sourceMode: API_SOURCE_MODE,
    series,
    articles,
    diagnostics,
    raw: {
      schema: 'portal-magnit-market-raw-v2',
      generatedAt: new Date().toISOString(),
      sourceMode: API_SOURCE_MODE,
      window: {
        from: options.apiFrom,
        to: options.apiTo
      },
      diagnostics,
      orders: normalizedOrders,
      prices: priceRows.map((row) => ({
        skuId: normalizeText(row.sku_id ?? row.skuId),
        sellerSkuId: normalizeText(row.seller_sku_id ?? row.sellerSkuId),
        price: numberOrZero(row.price),
        oldPrice: numberOrZero(row.old_price ?? row.oldPrice),
        commissionPercent: numberOrZero(row.commission_percent ?? row.commissionPercent),
        timestamp: normalizeText(row.timestamp || '')
      })),
      stocks: stockRows.map((row) => ({
        skuId: normalizeText(row.sku_id ?? row.skuId),
        sellerSkuId: normalizeText(row.seller_sku_id ?? row.sellerSkuId),
        stock: stockFromInfo(row)
      }))
    }
  };
}

function dailyPoint(row, dayOffset = 0, sourceMode = SOURCE_MODE) {
  const revenue = numberOrZero(row.ordersRevenue);
  const units = numberOrZero(row.ordersUnits);
  const netPayout = numberOrZero(row.netPayout);
  const price = units > 0 ? revenue / units : 0;
  return {
    date: row.date,
    label: row.date,
    dayOffset,
    units,
    revenue,
    financeTurnover: revenue,
    financialResult: netPayout,
    estimatedMargin: netPayout,
    ordersUnits: units,
    ordersRevenue: revenue,
    deliveredUnits: numberOrZero(row.deliveredUnits),
    deliveredRevenue: numberOrZero(row.deliveredRevenue),
    buyoutUnits: numberOrZero(row.buyoutUnits),
    buyoutRevenue: numberOrZero(row.buyoutRevenue),
    cancellationsUnits: numberOrZero(row.cancellationsUnits),
    cancelRevenue: numberOrZero(row.cancelRevenue),
    returnsUnits: numberOrZero(row.returnsUnits),
    netPayout,
    adsSpend: numberOrZero(row.adsSpend),
    price,
    source: sourceMode
  };
}

function buildArticle(article, fullDates) {
  const daily = fullDates
    .map((date) => article.dailyMap.get(date) || emptyMetricBucket(date))
    .map((row, index, list) => dailyPoint(row, list.length - 1 - index, article.source || SOURCE_MODE))
    .filter((row) => (
      row.revenue > 0
      || row.units > 0
      || row.deliveredRevenue > 0
      || row.netPayout > 0
      || row.returnsUnits > 0
      || row.cancellationsUnits > 0
    ));
  const monthlyMap = new Map();
  for (const row of daily) {
    const month = monthKey(row.date);
    const bucket = monthlyMap.get(month) || {
      monthKey: month,
      date: `${month}-01`,
      units: 0,
      ordersUnits: 0,
      revenue: 0,
      deliveredUnits: 0,
      deliveredRevenue: 0,
      buyoutUnits: 0,
      buyoutRevenue: 0,
      cancellationsUnits: 0,
      cancelRevenue: 0,
      returnsUnits: 0,
      adsSpend: 0,
      netPayout: 0,
      estimatedMargin: 0
    };
    bucket.units += numberOrZero(row.units);
    bucket.ordersUnits += numberOrZero(row.ordersUnits);
    bucket.revenue += numberOrZero(row.revenue);
    bucket.deliveredUnits += numberOrZero(row.deliveredUnits);
    bucket.deliveredRevenue += numberOrZero(row.deliveredRevenue);
    bucket.buyoutUnits += numberOrZero(row.buyoutUnits);
    bucket.buyoutRevenue += numberOrZero(row.buyoutRevenue);
    bucket.cancellationsUnits += numberOrZero(row.cancellationsUnits);
    bucket.cancelRevenue += numberOrZero(row.cancelRevenue);
    bucket.returnsUnits += numberOrZero(row.returnsUnits);
    bucket.adsSpend += numberOrZero(row.adsSpend);
    bucket.netPayout += numberOrZero(row.netPayout);
    bucket.estimatedMargin += numberOrZero(row.estimatedMargin);
    monthlyMap.set(month, bucket);
  }
  const monthly = [...monthlyMap.values()]
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
    .map((row) => {
      const avgOrderValue = row.ordersUnits > 0 ? row.revenue / row.ordersUnits : 0;
      const marginPct = row.revenue > 0 ? row.estimatedMargin / row.revenue : null;
      return {
        ...roundMetrics(row),
        avgOrderValue,
        ltvProxy: avgOrderValue,
        buyoutPct: row.ordersUnits > 0 && row.buyoutUnits > 0 ? row.buyoutUnits / row.ordersUnits : null,
        price: avgOrderValue,
        marginPct,
        estimatedMarginPct: marginPct
      };
    });
  const latestDailyWithPrice = [...daily].reverse().find((row) => row.price > 0) || null;
  const latestMonth = monthly[monthly.length - 1] || null;
  const latestMarginPct = latestMonth?.marginPct ?? null;
  const sourceArticleKeys = Array.from(article.sourceArticleKeys || []);
  return {
    platformKey: PLATFORM_KEY,
    platformLabel: PLATFORM_LABEL,
    articleKey: article.articleKey,
    article: article.article,
    sourceArticleKey: sourceArticleKeys[0] || article.sourceArticleKey || article.articleKey,
    sourceArticleKeys,
    skuMatched: Boolean(article.skuMatched),
    name: article.name || article.articleKey,
    owner: article.owner || '',
    currentPrice: latestDailyWithPrice?.price || latestMonth?.price || 0,
    currentClientPrice: latestDailyWithPrice?.price || latestMonth?.price || 0,
    currentFillPrice: latestDailyWithPrice?.price || latestMonth?.price || 0,
    minPrice: null,
    stock: 0,
    turnoverDays: null,
    currentTurnoverDays: null,
    marginPct: latestMarginPct,
    estimatedMarginPct: latestMarginPct,
    monthly,
    daily: daily.map(roundMetrics),
    source: article.source || SOURCE_MODE
  };
}

function roundMetrics(row) {
  const next = { ...row };
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = Number(value.toFixed(4));
  }
  return next;
}

function articleRevenueTotal(article) {
  return (Array.isArray(article?.monthly) ? article.monthly : [])
    .reduce((sum, row) => sum + numberOrZero(row.revenue), 0);
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
    if (article.skuMatched) {
      summary.matchedArticleCount += 1;
      summary.matchedRevenue += revenue;
    } else {
      summary.unmatchedArticleCount += 1;
      summary.unmatchedRevenue += revenue;
      if (summary.unmatchedSamples.length < 30) {
        summary.unmatchedSamples.push({
          articleKey: article.articleKey || '',
          sourceArticleKey: article.sourceArticleKey || '',
          name: article.name || '',
          revenue: Number(revenue.toFixed(4))
        });
      }
    }
  }
  summary.matchRate = summary.articleCount ? Number((summary.matchedArticleCount / summary.articleCount).toFixed(4)) : 0;
  summary.revenueMatchRate = summary.revenue ? Number((summary.matchedRevenue / summary.revenue).toFixed(4)) : 0;
  summary.revenue = Number(summary.revenue.toFixed(4));
  summary.matchedRevenue = Number(summary.matchedRevenue.toFixed(4));
  summary.unmatchedRevenue = Number(summary.unmatchedRevenue.toFixed(4));
  return summary;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function buildAllSeries(platformSeriesMap) {
  const byDate = new Map();
  for (const [key, series] of platformSeriesMap.entries()) {
    if (key === 'all') continue;
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
      const sellerSummary = point?.wbSellerSummary && typeof point.wbSellerSummary === 'object' ? point.wbSellerSummary : {};
      const financeTurnover = key === 'wb'
        ? firstNumber(point?.wbSellerSummaryFinanceTurnover, point?.financeTurnover, sellerSummary.financeTurnover, sellerSummary.salesRevenue, point?.revenue)
        : firstNumber(point?.financeTurnover, point?.revenue);
      const financialResult = key === 'wb'
        ? firstNumber(point?.wbSellerSummaryPayForGoods, point?.financialResult, sellerSummary.financialResult, sellerSummary.payForGoods, point?.estimatedMargin)
        : firstNumber(point?.financialResult, point?.estimatedMargin);
      current.units += numberOrZero(point.units);
      current.revenue += numberOrZero(point.revenue);
      current.financeTurnover += financeTurnover;
      current.financialResult += financialResult;
      current.estimatedMargin += financialResult;
      byDate.set(date, current);
    }
  }
  return [...byDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map(roundMetrics);
}

function platformRevenue(platform = {}) {
  return (Array.isArray(platform.series) ? platform.series : [])
    .reduce((sum, point) => sum + numberOrZero(point.revenue), 0);
}

function replaceMagnitPlatform(platformTrends, magnit) {
  const next = deepClone(platformTrends || {});
  const sourceMode = magnit.sourceMode || SOURCE_MODE;
  const existingPlatforms = Array.isArray(next.platforms) ? next.platforms : [];
  const result = [];
  let inserted = false;

  for (const platform of existingPlatforms) {
    const key = normalizeKey(platform?.key || platform?.platformKey || platform?.label);
    if (key === PLATFORM_KEY || key === 'magnitmarket' || key === SUPPORT_KEY || key === 'all') {
      if ((key === PLATFORM_KEY || key === 'magnitmarket' || key === SUPPORT_KEY) && !inserted) {
        result.push({
          ...platform,
          key: PLATFORM_KEY,
          label: PLATFORM_LABEL,
          series: magnit.series,
          articles: magnit.articles,
          diagnostics: magnit.diagnostics
        });
        inserted = true;
      }
      continue;
    }
    result.push(platform);
  }
  if (!inserted) {
    const insertIndex = Math.max(result.findIndex((platform) => normalizeKey(platform?.key) === 'letu') + 1, 0);
    result.splice(insertIndex, 0, {
      key: PLATFORM_KEY,
      label: PLATFORM_LABEL,
      series: magnit.series,
      articles: magnit.articles,
      diagnostics: magnit.diagnostics
    });
  }

  const platformSeriesMap = new Map(result.map((platform) => [normalizeKey(platform.key || platform.platformKey), platform.series || []]));
  const allSeries = buildAllSeries(platformSeriesMap);
  result.push({
    ...(existingPlatforms.find((platform) => normalizeKey(platform?.key) === 'all') || {}),
    key: 'all',
    label: 'Все площадки',
    series: allSeries
  });

  next.generatedAt = new Date().toISOString();
  next.latestMarketplaceDate = allSeries.length ? allSeries[allSeries.length - 1].date : (next.latestMarketplaceDate || '');
  next.note = 'Marketplace facts refreshed from API-backed platform_trends.json with Magnit Market daily source.';
  next.platforms = result;
  const extraMarketplace = next.extraMarketplace && typeof next.extraMarketplace === 'object' ? next.extraMarketplace : {};
  next.extraMarketplace = {
    ...extraMarketplace,
    generatedAt: next.generatedAt,
    asOfDate: next.latestMarketplaceDate,
    source: sourceMode,
    platforms: {
      ...(extraMarketplace.platforms || {}),
      [PLATFORM_KEY]: {
        key: PLATFORM_KEY,
        label: PLATFORM_LABEL,
        supportKey: SUPPORT_KEY,
        source: sourceMode,
        asOfDate: magnit.diagnostics.lastDate || '',
        window: {
          from: magnit.diagnostics.firstDate || '',
          to: magnit.diagnostics.lastDate || ''
        },
        diagnostics: magnit.diagnostics,
        articles: magnit.articles
      }
    }
  };
  next.magnitMarketSync = {
    source: sourceMode,
    generatedAt: next.generatedAt,
    diagnostics: magnit.diagnostics
  };
  return next;
}

function updateSmartPriceOverlay(overlay, magnit, asOfDate) {
  if (!overlay || typeof overlay !== 'object') return null;
  const sourceMode = magnit.sourceMode || SOURCE_MODE;
  const next = deepClone(overlay);
  next.platforms = next.platforms && typeof next.platforms === 'object' ? next.platforms : {};
  next.platforms[PLATFORM_KEY] = {
    key: PLATFORM_KEY,
    label: PLATFORM_LABEL,
    source: sourceMode,
    generatedAt: new Date().toISOString(),
    asOfDate: asOfDate || magnit.diagnostics.lastDate || '',
    rows: magnit.articles.map((row) => ({
      ...row,
      platformKey: PLATFORM_KEY,
      platformLabel: PLATFORM_LABEL,
      sourceMode
    }))
  };
  next.generatedAt = new Date().toISOString();
  next.extraMarketplace = {
    ...(next.extraMarketplace || {}),
    generatedAt: next.generatedAt,
    asOfDate: asOfDate || magnit.diagnostics.lastDate || '',
    source: sourceMode,
    platforms: {
      ...((next.extraMarketplace || {}).platforms || {}),
      [PLATFORM_KEY]: {
        key: PLATFORM_KEY,
        label: PLATFORM_LABEL,
        articleCount: magnit.articles.length,
        source: sourceMode
      }
    }
  };
  return next;
}

function protectAgainstSilentZero(options, currentPlatformTrends, lastGoodPlatformTrends, magnit) {
  const currentMagnit = (Array.isArray(currentPlatformTrends?.platforms) ? currentPlatformTrends.platforms : [])
    .find((platform) => ['magnit', 'magnitmarket', 'mm'].includes(normalizeKey(platform?.key || platform?.platformKey)));
  const lastGoodMagnit = (Array.isArray(lastGoodPlatformTrends?.platforms) ? lastGoodPlatformTrends.platforms : [])
    .find((platform) => ['magnit', 'magnitmarket', 'mm'].includes(normalizeKey(platform?.key || platform?.platformKey)));
  const currentRevenue = platformRevenue(currentMagnit);
  const lastGoodRevenue = platformRevenue(lastGoodMagnit);
  const nextRevenue = magnit ? magnit.series.reduce((sum, point) => sum + numberOrZero(point.revenue), 0) : 0;
  if (!magnit && options.requireSource && (currentRevenue > 0 || lastGoodRevenue > 0)) {
    throw new Error(`Magnit Market source is missing while previous revenue exists (current=${Math.round(currentRevenue)}, lastGood=${Math.round(lastGoodRevenue)}).`);
  }
  if (magnit && nextRevenue <= 0 && (currentRevenue > 0 || lastGoodRevenue > 0)) {
    throw new Error(`Magnit Market daily sync produced zero revenue while previous revenue exists (current=${Math.round(currentRevenue)}, lastGood=${Math.round(lastGoodRevenue)}).`);
  }
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (!['sync', 'probe'].includes(options.command)) throw new Error(`Unsupported command: ${options.command}`);
  const platformTrends = readJson(options.inputFile, {});
  const lastGoodPlatformTrends = readJson(options.lastGoodFile, {});
  const skus = readJson(options.skusFile, []);
  const skuAliases = readJson(options.skuAliasesFile, { aliases: [] });
  const smartPriceOverlay = readJson(options.smartPriceInputFile, null);
  if (options.command === 'probe') {
    if (!options.apiKey) {
      console.log(JSON.stringify({
        status: 'missing-api-key',
        sourceMode: API_SOURCE_MODE,
        expectedEnv: [
          'ALTEA_MAGNIT_API_KEY',
          'ALTEA_MAGNIT_API_TOKEN',
          'ALTEA_MAGNIT_MARKET_API_KEY',
          'ALTEA_MAGNIT_MARKET_API_TOKEN'
        ],
        apiBaseUrl: options.apiBaseUrl,
        window: { from: options.apiFrom, to: options.apiTo }
      }, null, 2));
      return;
    }
    const apiSnapshot = await buildMagnitApiSnapshot(options, skus, skuAliases);
    if (!options.dryRun) writeJson(options.rawOutputFile, apiSnapshot.raw);
    console.log(JSON.stringify({
      status: 'ok',
      sourceMode: apiSnapshot.sourceMode,
      apiBaseUrl: options.apiBaseUrl,
      rawOutputFile: options.dryRun ? '' : options.rawOutputFile,
      window: apiSnapshot.diagnostics.window,
      ordersRows: apiSnapshot.diagnostics.ordersRows,
      normalizedOrderRows: apiSnapshot.diagnostics.normalizedOrderRows,
      priceRows: apiSnapshot.diagnostics.priceRows,
      stockRows: apiSnapshot.diagnostics.stockRows,
      articles: apiSnapshot.articles.length,
      revenue: Math.round(apiSnapshot.diagnostics.revenue * 100) / 100,
      firstDate: apiSnapshot.diagnostics.firstDate,
      lastDate: apiSnapshot.diagnostics.lastDate,
      apiErrors: apiSnapshot.diagnostics.apiErrors
    }, null, 2));
    return;
  }

  const magnit = options.apiKey
    ? await buildMagnitApiSnapshot(options, skus, skuAliases)
    : buildMagnitSnapshot(options, skus, skuAliases);
  protectAgainstSilentZero(options, platformTrends, lastGoodPlatformTrends, magnit.missing ? null : magnit);
  if (magnit.missing) {
    console.log(JSON.stringify({ status: 'skipped', reason: magnit.message, dryRun: options.dryRun }, null, 2));
    return;
  }
  const nextPlatformTrends = replaceMagnitPlatform(platformTrends, magnit);
  const nextOverlay = updateSmartPriceOverlay(smartPriceOverlay, magnit, magnit.diagnostics.lastDate || nextPlatformTrends.latestMarketplaceDate);
  if (!options.dryRun) {
    writeJson(options.outputFile, nextPlatformTrends);
    if (nextOverlay) writeJson(options.smartPriceOutputFile, nextOverlay);
    writeJson(options.rawOutputFile, magnit.raw);
    if (options.mirrorLocalFallback && options.outputDir) {
      writeJson(path.join(options.baseDataDir, 'platform_trends.json'), nextPlatformTrends);
      if (nextOverlay) writeJson(path.join(options.baseDataDir, 'smart_price_overlay.json'), nextOverlay);
      writeJson(path.join(options.baseDataDir, 'raw', 'magnit_market.json'), magnit.raw);
    }
  }
  console.log(JSON.stringify({
    status: 'ok',
    dryRun: options.dryRun,
    inputFile: options.inputFile,
    outputFile: options.outputFile,
    smartPriceOutputFile: nextOverlay ? options.smartPriceOutputFile : '',
    rawOutputFile: options.rawOutputFile,
    salesWorkbook: options.salesWorkbook || '',
    salesCsv: options.salesCsv,
    servicesCsv: options.servicesCsv || '',
    series: magnit.series.length,
    articles: magnit.articles.length,
    revenue: Math.round(magnit.diagnostics.revenue * 100) / 100,
    firstDate: magnit.diagnostics.firstDate,
    lastDate: magnit.diagnostics.lastDate,
    sourceMode: magnit.sourceMode || SOURCE_MODE,
    warnings: [
      ...(magnit.diagnostics.lastDate && nextPlatformTrends.latestMarketplaceDate && magnit.diagnostics.lastDate < nextPlatformTrends.latestMarketplaceDate
        ? [`Magnit latest source date ${magnit.diagnostics.lastDate} is older than portal latest marketplace date ${nextPlatformTrends.latestMarketplaceDate}.`]
        : [])
    ]
  }, null, 2));
}

try {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
