#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PLATFORM_KEY = 'magnit';
const PLATFORM_LABEL = 'Магнит Маркет';
const SUPPORT_KEY = 'mm';
const SOURCE_MODE = 'magnit-market-csv-daily';

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
    return `${year}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
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
  const salesCsv = existingPath(
    args['sales-csv'],
    process.env.ALTEA_MAGNIT_SALES_CSV,
    path.join(baseDataDir, 'external_sources', 'magnit_sales.csv'),
    path.join(root, 'data', 'external_sources', 'magnit_sales.csv'),
    path.join(root, '..', 'data', 'external_sources', 'magnit_sales.csv'),
    defaultLocalTemp('magnit_sales.csv')
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
    salesCsv,
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
  if (!options.salesCsv) {
    const message = 'Magnit sales CSV is missing. Expected ALTEA_MAGNIT_SALES_CSV or data/external_sources/magnit_sales.csv.';
    if (options.requireSource) throw new Error(message);
    return { missing: true, message };
  }

  const salesRows = parseCsv(fs.readFileSync(options.salesCsv, 'utf8'));
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
      source: SOURCE_MODE
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
    .map((row, index, list) => dailyPoint(row, list.length - 1 - index));

  const articles = [...articleMap.values()]
    .map((article) => buildArticle(article, fullDates))
    .filter((article) => article.daily.length)
    .sort((left, right) => left.articleKey.localeCompare(right.articleKey));

  const diagnostics = articleDiagnostics(articles);
  diagnostics.source = SOURCE_MODE;
  diagnostics.dailyMode = true;
  diagnostics.salesRows = salesRows.length;
  diagnostics.serviceRows = serviceRows.length;
  diagnostics.normalizedSalesRows = normalizedSales.length;
  diagnostics.normalizedServiceRows = normalizedServices.length;
  diagnostics.firstDate = firstDate;
  diagnostics.lastDate = lastDate;
  diagnostics.skipped = skipped;
  diagnostics.files = {
    sales: sourceFileInfo(options.salesCsv),
    services: sourceFileInfo(options.servicesCsv)
  };

  return {
    key: PLATFORM_KEY,
    label: PLATFORM_LABEL,
    series,
    articles,
    diagnostics,
    raw: {
      schema: 'portal-magnit-market-raw-v1',
      generatedAt: new Date().toISOString(),
      sourceMode: SOURCE_MODE,
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

function dailyPoint(row, dayOffset = 0) {
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
    source: SOURCE_MODE
  };
}

function buildArticle(article, fullDates) {
  const daily = fullDates
    .map((date) => article.dailyMap.get(date) || emptyMetricBucket(date))
    .map((row, index, list) => dailyPoint(row, list.length - 1 - index))
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
    source: SOURCE_MODE
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
    source: SOURCE_MODE,
    platforms: {
      ...(extraMarketplace.platforms || {}),
      [PLATFORM_KEY]: {
        key: PLATFORM_KEY,
        label: PLATFORM_LABEL,
        supportKey: SUPPORT_KEY,
        source: SOURCE_MODE,
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
    source: SOURCE_MODE,
    generatedAt: next.generatedAt,
    diagnostics: magnit.diagnostics
  };
  return next;
}

function updateSmartPriceOverlay(overlay, magnit, asOfDate) {
  if (!overlay || typeof overlay !== 'object') return null;
  const next = deepClone(overlay);
  next.platforms = next.platforms && typeof next.platforms === 'object' ? next.platforms : {};
  next.platforms[PLATFORM_KEY] = {
    key: PLATFORM_KEY,
    label: PLATFORM_LABEL,
    source: SOURCE_MODE,
    generatedAt: new Date().toISOString(),
    asOfDate: asOfDate || magnit.diagnostics.lastDate || '',
    rows: magnit.articles.map((row) => ({
      ...row,
      platformKey: PLATFORM_KEY,
      platformLabel: PLATFORM_LABEL,
      sourceMode: SOURCE_MODE
    }))
  };
  next.generatedAt = new Date().toISOString();
  next.extraMarketplace = {
    ...(next.extraMarketplace || {}),
    generatedAt: next.generatedAt,
    asOfDate: asOfDate || magnit.diagnostics.lastDate || '',
    source: SOURCE_MODE,
    platforms: {
      ...((next.extraMarketplace || {}).platforms || {}),
      [PLATFORM_KEY]: {
        key: PLATFORM_KEY,
        label: PLATFORM_LABEL,
        articleCount: magnit.articles.length,
        source: SOURCE_MODE
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

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (options.command !== 'sync') throw new Error(`Unsupported command: ${options.command}`);
  const platformTrends = readJson(options.inputFile, {});
  const lastGoodPlatformTrends = readJson(options.lastGoodFile, {});
  const skus = readJson(options.skusFile, []);
  const skuAliases = readJson(options.skuAliasesFile, { aliases: [] });
  const smartPriceOverlay = readJson(options.smartPriceInputFile, null);
  const magnit = buildMagnitSnapshot(options, skus, skuAliases);
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
    salesCsv: options.salesCsv,
    servicesCsv: options.servicesCsv || '',
    series: magnit.series.length,
    articles: magnit.articles.length,
    revenue: Math.round(magnit.diagnostics.revenue * 100) / 100,
    firstDate: magnit.diagnostics.firstDate,
    lastDate: magnit.diagnostics.lastDate,
    sourceMode: SOURCE_MODE,
    warnings: [
      ...(magnit.diagnostics.lastDate && nextPlatformTrends.latestMarketplaceDate && magnit.diagnostics.lastDate < nextPlatformTrends.latestMarketplaceDate
        ? [`Magnit latest source date ${magnit.diagnostics.lastDate} is older than portal latest marketplace date ${nextPlatformTrends.latestMarketplaceDate}.`]
        : [])
    ]
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
