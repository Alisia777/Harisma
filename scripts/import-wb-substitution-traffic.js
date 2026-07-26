#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const xlsx = require('xlsx');

const OUTPUT_NAME = 'wb_substitution_traffic';
const HISTORY_OUTPUT_NAME = 'wb_substitution_traffic_history';
const WB_SUBSTITUTION_SCHEMA = 'portal-wb-substitution-traffic-v1';
const WB_SUBSTITUTION_REFRESH_SCHEMA = 'portal-wb-substitution-refresh-v1';
const DEFAULT_HISTORY_LIMIT = 24;

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!String(token || '').startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const hasNextValue = argv[index + 1] && !String(argv[index + 1]).startsWith('--');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (hasNextValue) {
      args[key] = argv[index + 1];
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function resolveLatestAnsWorkbook(env = process.env) {
  const downloads = env.USERPROFILE ? path.join(env.USERPROFILE, 'Downloads') : '';
  if (!downloads || !fs.existsSync(downloads)) return '';
  const files = fs.readdirSync(downloads)
    .filter((name) => /^ANS-.*\.xlsx$/i.test(name))
    .map((name) => {
      const filePath = path.join(downloads, name);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return files[0]?.filePath || '';
}

function resolveOptions(args, env = process.env) {
  const root = process.cwd();
  const configuredInputXlsx = [
    args['input-xlsx'],
    env.ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX
  ].filter(Boolean)[0] || '';
  const discoveredInputXlsx = resolveLatestAnsWorkbook(env);
  const inputXlsx = [configuredInputXlsx, discoveredInputXlsx]
    .filter(Boolean)
    .find((candidate) => fs.existsSync(candidate)) || '';
  return {
    inputXlsx,
    configuredInputXlsx,
    sourceUrl: String(args['input-url'] || env.ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_URL || '').trim(),
    sourceXlsxBase64: String(env.ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_B64 || '').trim(),
    sourceXlsxGzipBase64: String(env.ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_GZIP_B64 || '').trim(),
    sourceMtime: String(args['source-mtime'] || env.ALTEA_WB_SUBSTITUTION_TRAFFIC_SOURCE_MTIME || '').trim(),
    httpAuthBearer: String(env.ALTEA_WB_SUBSTITUTION_TRAFFIC_HTTP_AUTH_BEARER || '').trim(),
    httpAuthHeader: String(env.ALTEA_WB_SUBSTITUTION_TRAFFIC_HTTP_AUTH_HEADER || '').trim(),
    optional: args.optional === true || String(args.optional || '').toLowerCase() === 'true',
    historyLimit: Math.max(1, Number(env.ALTEA_WB_SUBSTITUTION_TRAFFIC_HISTORY_LIMIT || DEFAULT_HISTORY_LIMIT) || DEFAULT_HISTORY_LIMIT),
    minRows: Math.max(1, Number(args['min-rows'] || 1) || 1),
    minMappedArticles: Math.max(1, Number(args['min-mapped-articles'] || 1) || 1),
    minMappedRatio: Math.max(0, Math.min(1, Number(args['min-mapped-ratio'] || 0) || 0)),
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, 'data')),
    statusFile: args['status-file'] ? path.resolve(String(args['status-file'])) : ''
  };
}

function normalizeText(value) {
  return String(value ?? '').replace(/\uFEFF/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/giu, '');
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value)
    .replace(/\u00A0/g, '')
    .replace(/\s+/g, '')
    .replace('%', '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratio(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom > 0 ? top / bottom : null;
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function skuLookupValues(sku = {}) {
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.barcode,
    sku.nmId,
    sku.productId,
    sku.wb?.supplierArticle,
    sku.wb?.vendorCode,
    sku.wb?.nmId,
    sku.wb?.productId
  ];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') values.push(alias);
      else values.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.vendorCode, alias?.nmId);
    });
  }
  Object.values(sku.platformAliases || {}).forEach((aliases) => {
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });
  return values.filter((value) => normalizeText(value));
}

function buildSkuLookup(skus = []) {
  const map = new Map();
  skus.forEach((sku) => {
    skuLookupValues(sku).forEach((value) => {
      const token = normalizeToken(value);
      if (token && !map.has(token)) map.set(token, sku);
    });
  });
  return map;
}

function sourceTimestampFromFile(filePath = '') {
  const name = path.basename(filePath);
  const match = name.match(/ANS-(\d{4}-\d{2}-\d{2})T(\d{2})_(\d{2})_(\d{2})(?:\.(\d+))?Z/i);
  if (!match) return '';
  const [, date, hour, minute, second, ms = '000'] = match;
  return `${date}T${hour}:${minute}:${second}.${ms.padEnd(3, '0').slice(0, 3)}Z`;
}

function validIsoTimestamp(value = '') {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function parseHeaderLine(line = '') {
  const index = String(line).indexOf(':');
  if (index <= 0) return null;
  const name = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim();
  return name && value ? [name, value] : null;
}

function isGitHubReleaseAssetApiUrl(url = '') {
  return /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/assets\/\d+/i.test(String(url || '').trim());
}

function buildRequestHeaders(options, url = '') {
  const headers = {
    'User-Agent': 'harisma-portal-wb-substitution-sync/1.0'
  };
  if (isGitHubReleaseAssetApiUrl(url)) headers.Accept = 'application/octet-stream';
  if (options.httpAuthBearer) headers.Authorization = `Bearer ${options.httpAuthBearer}`;
  const configuredHeader = parseHeaderLine(options.httpAuthHeader);
  if (configuredHeader) headers[configuredHeader[0]] = configuredHeader[1];
  return headers;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetries(url, init, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleepMs(1000 * attempt);
    }
  }
  throw new Error(`WB substitution workbook request failed: ${lastError?.message || lastError || 'unknown network error'}`);
}

function workbookFileNameFromResponse(response, sourceUrl = '') {
  const disposition = String(response.headers.get('content-disposition') || '');
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch) {
    try {
      return path.basename(decodeURIComponent(encodedMatch[1].trim()));
    } catch {
      return path.basename(encodedMatch[1].trim());
    }
  }
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (plainMatch) return path.basename(plainMatch[1].trim());
  try {
    return path.basename(decodeURIComponent(new URL(sourceUrl).pathname)) || 'wb-substitution-traffic.xlsx';
  } catch {
    return 'wb-substitution-traffic.xlsx';
  }
}

function validateWorkbookBuffer(buffer, sourceLabel = 'configured source') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 128) {
    throw new Error(`WB substitution workbook is empty or invalid: ${sourceLabel}`);
  }
  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'buffer' });
  } catch {
    throw new Error(`WB substitution workbook cannot be parsed: ${sourceLabel}`);
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`WB substitution workbook has no sheets: ${sourceLabel}`);
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false,
    blankrows: false,
    range: 0
  });
  const keys = new Set(Object.keys(rows[0] || {}));
  const requiredColumns = ['Seller Article', 'Substitution Article', 'Viewed', 'Orders'];
  const missingColumns = requiredColumns.filter((column) => !keys.has(column));
  if (missingColumns.length) {
    throw new Error(`WB substitution workbook schema mismatch (${missingColumns.join(', ')}): ${sourceLabel}`);
  }
}

function configuredSourcePresent(options) {
  return Boolean(
    options.configuredInputXlsx
    || options.sourceUrl
    || options.sourceXlsxBase64
    || options.sourceXlsxGzipBase64
  );
}

function sourceTimestamp({ explicit = '', fileName = '', fallback = '' } = {}) {
  return validIsoTimestamp(explicit)
    || sourceTimestampFromFile(fileName)
    || validIsoTimestamp(fallback);
}

async function materializeInputWorkbook(options) {
  const configuredFileMissing = options.configuredInputXlsx && !fs.existsSync(options.configuredInputXlsx);
  const hasAlternativeSource = Boolean(
    options.inputXlsx
    || options.sourceUrl
    || options.sourceXlsxBase64
    || options.sourceXlsxGzipBase64
  );
  if (configuredFileMissing && !hasAlternativeSource) {
    throw new Error('Configured WB substitution workbook file does not exist');
  }

  if (options.inputXlsx) {
    const fileName = path.basename(options.inputXlsx);
    const stat = fs.statSync(options.inputXlsx);
    return {
      inputXlsx: options.inputXlsx,
      sourceFileName: fileName,
      sourceKind: options.configuredInputXlsx ? 'configured-file' : 'discovered-file',
      sourceGeneratedAt: sourceTimestamp({
        explicit: options.sourceMtime,
        fileName,
        fallback: stat.mtime.toISOString()
      }),
      cleanupDir: ''
    };
  }

  let buffer = null;
  let sourceFileName = 'wb-substitution-traffic.xlsx';
  let sourceKind = '';
  let responseTimestamp = '';

  if (options.sourceUrl) {
    const headers = buildRequestHeaders(options, options.sourceUrl);
    let response = await fetchWithRetries(options.sourceUrl, {
      redirect: isGitHubReleaseAssetApiUrl(options.sourceUrl) ? 'manual' : 'follow',
      headers
    });
    if (isGitHubReleaseAssetApiUrl(options.sourceUrl) && response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`WB substitution GitHub asset redirect is invalid: HTTP ${response.status}`);
      response = await fetchWithRetries(location, {
        redirect: 'follow',
        headers: { 'User-Agent': headers['User-Agent'] }
      });
    }
    if (!response.ok) throw new Error(`WB substitution workbook download failed: HTTP ${response.status}`);
    sourceFileName = workbookFileNameFromResponse(response, options.sourceUrl);
    responseTimestamp = response.headers.get('last-modified') || '';
    buffer = Buffer.from(await response.arrayBuffer());
    sourceKind = 'url';
  } else if (options.sourceXlsxGzipBase64) {
    try {
      buffer = zlib.gunzipSync(Buffer.from(options.sourceXlsxGzipBase64, 'base64'));
    } catch {
      throw new Error('WB substitution gzip-base64 workbook cannot be decoded');
    }
    sourceKind = 'env-gzip-base64';
  } else if (options.sourceXlsxBase64) {
    buffer = Buffer.from(options.sourceXlsxBase64, 'base64');
    sourceKind = 'env-base64';
  } else {
    return null;
  }

  validateWorkbookBuffer(buffer, sourceKind);
  const sourceGeneratedAt = sourceTimestamp({
    explicit: options.sourceMtime,
    fileName: sourceFileName,
    fallback: responseTimestamp
  });
  if (!sourceGeneratedAt) {
    throw new Error('WB substitution source timestamp is unavailable; set ALTEA_WB_SUBSTITUTION_TRAFFIC_SOURCE_MTIME');
  }
  const cleanupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harisma-wb-substitution-'));
  const inputXlsx = path.join(cleanupDir, 'wb-substitution-traffic.xlsx');
  fs.writeFileSync(inputXlsx, buffer);
  return {
    inputXlsx,
    sourceFileName,
    sourceKind,
    sourceGeneratedAt,
    cleanupDir
  };
}

function addGroupedMetric(map, key, label, metric) {
  const token = normalizeText(key || label);
  if (!token) return;
  const current = map.get(token) || {
    key: token,
    label: normalizeText(label || token),
    views: 0,
    carts: 0,
    orders: 0,
    favorites: 0,
    rowCount: 0
  };
  current.views += metric.views;
  current.carts += metric.carts;
  current.orders += metric.orders;
  current.favorites += metric.favorites;
  current.rowCount += 1;
  map.set(token, current);
}

function compactTopRows(map, limit = 10) {
  return [...map.values()]
    .sort((left, right) => (
      right.orders - left.orders
      || right.views - left.views
      || right.carts - left.carts
      || String(left.label).localeCompare(String(right.label), 'ru')
    ))
    .slice(0, limit)
    .map((item) => ({
      ...item,
      cartRate: ratio(item.carts, item.views),
      orderRate: ratio(item.orders, item.views)
    }));
}

function blankArticleAggregate({ articleKey, article, sellerArticle, productId, title, sku, matched }) {
  return {
    articleKey,
    article,
    sellerArticle,
    productId,
    title,
    matched: Boolean(matched),
    owner: sku?.owner?.byPlatform?.wb || sku?.ownersByPlatform?.wb || sku?.owner?.name || '',
    name: sku?.name || title || '',
    rowCount: 0,
    views: 0,
    carts: 0,
    orders: 0,
    favorites: 0,
    campaignBudget: 0,
    searchClickCost: 0,
    cartAddCost: 0,
    orderCost: 0,
    substitutions: new Map(),
    campaigns: new Map(),
    trafficSources: new Map()
  };
}

function readWorkbookRows(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false,
    blankrows: false
  });
  return { sheetName, rows };
}

function buildPayload(options) {
  if (!options.inputXlsx) {
    throw new Error('WB substitution traffic workbook not found. Pass --input-xlsx or set ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX.');
  }

  const skus = readJsonIfExists(path.join(options.baseDataDir, 'skus.json'), []);
  if (!Array.isArray(skus)) throw new Error('data/skus.json must be an array.');
  const lookup = buildSkuLookup(skus);
  const workbook = readWorkbookRows(options.inputXlsx);
  const byArticle = new Map();
  const cleanRows = [];
  const summary = {
    rowCount: 0,
    mappedRowCount: 0,
    unmatchedRowCount: 0,
    articleCount: 0,
    matchedArticleCount: 0,
    substitutionArticleCount: 0,
    campaignCount: 0,
    trafficSourceCount: 0,
    views: 0,
    carts: 0,
    orders: 0,
    favorites: 0,
    campaignBudget: 0,
    searchClickCost: 0,
    cartAddCost: 0,
    orderCost: 0,
    cartRate: null,
    orderRate: null
  };
  const globalSubstitutions = new Set();
  const globalCampaigns = new Set();
  const globalTrafficSources = new Set();

  workbook.rows.forEach((raw, index) => {
    const sellerArticle = normalizeText(raw['Seller Article']);
    const sellerToken = normalizeToken(sellerArticle);
    const productId = normalizeText(raw['Product ID']);
    const productToken = normalizeToken(productId);
    const substitutionArticle = normalizeText(raw['Substitution Article']);
    const title = normalizeText(raw.Title);
    const campaignName = normalizeText(raw['AD Campaign Name']);
    const trafficSource = normalizeText(raw['Traffic Source']);
    const metric = {
      views: parseNumber(raw.Viewed),
      carts: parseNumber(raw['Add-to-Cart']),
      orders: parseNumber(raw.Orders),
      favorites: parseNumber(raw['Add-to-Favorites']),
      campaignBudget: parseNumber(raw['Campaign budget']),
      searchClickCost: parseNumber(raw['Search click cost']),
      cartAddCost: parseNumber(raw['Cart add cost']),
      orderCost: parseNumber(raw['Order cost'])
    };
    if (!sellerArticle && !substitutionArticle && !metric.views && !metric.carts && !metric.orders) return;

    const sku = lookup.get(sellerToken) || lookup.get(productToken) || null;
    const articleKey = normalizeText(sku?.articleKey || sku?.article || sellerArticle || productId || `row-${index + 2}`);
    const article = normalizeText(sku?.article || sellerArticle || articleKey);
    const aggregateKey = normalizeToken(articleKey) || sellerToken || productToken || `row${index + 2}`;
    if (!byArticle.has(aggregateKey)) {
      byArticle.set(aggregateKey, blankArticleAggregate({
        articleKey,
        article,
        sellerArticle,
        productId,
        title,
        sku,
        matched: Boolean(sku)
      }));
    }
    const aggregate = byArticle.get(aggregateKey);
    aggregate.rowCount += 1;
    aggregate.views += metric.views;
    aggregate.carts += metric.carts;
    aggregate.orders += metric.orders;
    aggregate.favorites += metric.favorites;
    aggregate.campaignBudget += metric.campaignBudget;
    aggregate.searchClickCost += metric.searchClickCost;
    aggregate.cartAddCost += metric.cartAddCost;
    aggregate.orderCost += metric.orderCost;

    addGroupedMetric(aggregate.substitutions, substitutionArticle || `row-${index + 2}`, substitutionArticle, metric);
    addGroupedMetric(aggregate.campaigns, campaignName || 'Без кампании', campaignName || 'Без кампании', metric);
    addGroupedMetric(aggregate.trafficSources, trafficSource || 'Не указан', trafficSource || 'Не указан', metric);

    summary.rowCount += 1;
    summary.mappedRowCount += sku ? 1 : 0;
    summary.unmatchedRowCount += sku ? 0 : 1;
    summary.views += metric.views;
    summary.carts += metric.carts;
    summary.orders += metric.orders;
    summary.favorites += metric.favorites;
    summary.campaignBudget += metric.campaignBudget;
    summary.searchClickCost += metric.searchClickCost;
    summary.cartAddCost += metric.cartAddCost;
    summary.orderCost += metric.orderCost;
    if (substitutionArticle) globalSubstitutions.add(substitutionArticle);
    if (campaignName) globalCampaigns.add(campaignName);
    if (trafficSource) globalTrafficSources.add(trafficSource);

    cleanRows.push({
      sourceRow: index + 2,
      articleKey,
      article,
      sellerArticle,
      productId,
      title,
      substitutionArticle,
      trafficSource,
      campaignName,
      matched: Boolean(sku),
      ...metric,
      cartRate: ratio(metric.carts, metric.views),
      orderRate: ratio(metric.orders, metric.views)
    });
  });

  const articles = [...byArticle.values()].map((item) => {
    const substitutionCount = item.substitutions.size;
    const campaignCount = item.campaigns.size;
    const trafficSourceCount = item.trafficSources.size;
    return {
      articleKey: item.articleKey,
      article: item.article,
      sellerArticle: item.sellerArticle,
      productId: item.productId,
      title: item.title,
      name: item.name,
      owner: item.owner,
      matched: item.matched,
      rowCount: item.rowCount,
      substitutionCount,
      campaignCount,
      trafficSourceCount,
      views: item.views,
      carts: item.carts,
      orders: item.orders,
      favorites: item.favorites,
      campaignBudget: item.campaignBudget,
      searchClickCost: item.searchClickCost,
      cartAddCost: item.cartAddCost,
      orderCost: item.orderCost,
      cartRate: ratio(item.carts, item.views),
      orderRate: ratio(item.orders, item.views),
      topSubstitutions: compactTopRows(item.substitutions, 12),
      topCampaigns: compactTopRows(item.campaigns, 8),
      topTrafficSources: compactTopRows(item.trafficSources, 6)
    };
  }).sort((left, right) => (
    right.orders - left.orders
    || right.views - left.views
    || right.carts - left.carts
    || String(left.articleKey).localeCompare(String(right.articleKey), 'ru')
  ));

  summary.articleCount = articles.length;
  summary.matchedArticleCount = articles.filter((item) => item.matched).length;
  summary.substitutionArticleCount = globalSubstitutions.size;
  summary.campaignCount = globalCampaigns.size;
  summary.trafficSourceCount = globalTrafficSources.size;
  summary.cartRate = ratio(summary.carts, summary.views);
  summary.orderRate = ratio(summary.orders, summary.views);

  const sourceGeneratedAt = options.sourceGeneratedAt
    || sourceTimestampFromFile(options.sourceFileName || options.inputXlsx)
    || validIsoTimestamp(fs.statSync(options.inputXlsx).mtime.toISOString());
  return {
    schema: WB_SUBSTITUTION_SCHEMA,
    generatedAt: new Date().toISOString(),
    asOfDate: sourceGeneratedAt ? sourceGeneratedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    source: {
      file: options.sourceFileName || path.basename(options.inputXlsx),
      fileName: options.sourceFileName || path.basename(options.inputXlsx),
      kind: options.sourceKind || 'file',
      sheetName: workbook.sheetName,
      sourceGeneratedAt
    },
    summary,
    articles,
    rows: cleanRows
  };
}

function writePayload(options, payload) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const outputPath = path.join(options.outputDir, `${OUTPUT_NAME}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outputPath;
}

function snapshotKey(payload = {}) {
  const sourceStamp = payload.source?.sourceGeneratedAt || payload.asOfDate || payload.generatedAt;
  const sourceFile = payload.source?.fileName || payload.source?.file || '';
  return [sourceStamp, sourceFile].filter(Boolean).join('|') || payload.generatedAt || '';
}

function writeHistoryPayload(options, payload) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const historyPath = path.join(options.outputDir, `${HISTORY_OUTPUT_NAME}.json`);
  const previous = readJsonIfExists(historyPath, []);
  const seen = new Set();
  const history = [payload, ...(Array.isArray(previous) ? previous : [])]
    .filter((item) => item && typeof item === 'object')
    .filter((item) => {
      const key = snapshotKey(item);
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => (
      Date.parse(right.source?.sourceGeneratedAt || right.generatedAt || right.asOfDate || '') -
      Date.parse(left.source?.sourceGeneratedAt || left.generatedAt || left.asOfDate || '')
    ))
    .slice(0, options.historyLimit || DEFAULT_HISTORY_LIMIT);
  fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  return historyPath;
}

function existingArtifactState(options) {
  const payload = readJsonIfExists(path.join(options.outputDir, `${OUTPUT_NAME}.json`), {});
  return {
    asOfDate: payload?.asOfDate || '',
    generatedAt: payload?.generatedAt || '',
    sourceFileName: payload?.source?.fileName || payload?.source?.file || '',
    sourceGeneratedAt: payload?.source?.sourceGeneratedAt || ''
  };
}

function assertPayloadQuality(options, payload, preserved = {}) {
  const summary = payload?.summary || {};
  const rowCount = Number(summary.rowCount || 0);
  const mappedRowCount = Number(summary.mappedRowCount || 0);
  const matchedArticleCount = Number(summary.matchedArticleCount || 0);
  const mappedRatio = rowCount > 0 ? mappedRowCount / rowCount : 0;
  if (rowCount < options.minRows) {
    throw new Error(`WB substitution workbook has ${rowCount} rows; minimum is ${options.minRows}`);
  }
  if (matchedArticleCount < options.minMappedArticles) {
    throw new Error(`WB substitution workbook has ${matchedArticleCount} mapped articles; minimum is ${options.minMappedArticles}`);
  }
  if (mappedRatio < options.minMappedRatio) {
    throw new Error(`WB substitution workbook mapped ratio ${mappedRatio.toFixed(4)} is below ${options.minMappedRatio.toFixed(4)}`);
  }
  const incomingStamp = Date.parse(payload?.source?.sourceGeneratedAt || payload?.asOfDate || '');
  const preservedStamp = Date.parse(preserved.sourceGeneratedAt || preserved.asOfDate || '');
  if (Number.isFinite(incomingStamp) && Number.isFinite(preservedStamp) && incomingStamp < preservedStamp) {
    throw new Error(`WB substitution workbook is older than the preserved verified snapshot (${payload.asOfDate} < ${preserved.asOfDate})`);
  }
  const maxFutureStamp = Date.now() + 36 * 60 * 60 * 1000;
  if (Number.isFinite(incomingStamp) && incomingStamp > maxFutureStamp) {
    throw new Error('WB substitution workbook source timestamp is implausibly in the future');
  }
}

function writeRefreshStatus(options, payload) {
  if (!options.statusFile) return '';
  fs.mkdirSync(path.dirname(options.statusFile), { recursive: true });
  fs.writeFileSync(options.statusFile, `${JSON.stringify({
    schema: WB_SUBSTITUTION_REFRESH_SCHEMA,
    generatedAt: new Date().toISOString(),
    ...payload
  }, null, 2)}\n`, 'utf8');
  return options.statusFile;
}

async function main(argv = process.argv, env = process.env) {
  const options = resolveOptions(parseArgs(argv), env);
  const preserved = existingArtifactState(options);
  let materialized = null;
  try {
    materialized = await materializeInputWorkbook(options);
    if (!materialized) {
      if (!options.optional) {
        throw new Error('WB substitution traffic workbook not found. Pass --input-xlsx, --input-url or configure ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX(_URL/_B64).');
      }
      const statusPath = writeRefreshStatus(options, {
        status: 'warning',
        updated: false,
        reason: 'source_not_configured',
        preserved
      });
      console.warn(JSON.stringify({
        status: 'preserved',
        reason: 'source_not_configured',
        statusPath,
        preserved
      }, null, 2));
      return 0;
    }

    const payload = buildPayload({ ...options, ...materialized });
    assertPayloadQuality(options, payload, preserved);
    const outputPath = writePayload(options, payload);
    const historyPath = writeHistoryPayload(options, payload);
    const statusPath = writeRefreshStatus(options, {
      status: 'ok',
      updated: true,
      sourceKind: materialized.sourceKind,
      sourceGeneratedAt: materialized.sourceGeneratedAt,
      asOfDate: payload.asOfDate,
      summary: payload.summary
    });
    console.log(JSON.stringify({
      status: 'updated',
      sourceKind: materialized.sourceKind,
      sourceGeneratedAt: materialized.sourceGeneratedAt,
      outputPath,
      historyPath,
      statusPath,
      summary: payload.summary
    }, null, 2));
    return 0;
  } catch (error) {
    const statusPath = writeRefreshStatus(options, {
      status: 'warning',
      updated: false,
      reason: configuredSourcePresent(options) ? 'configured_source_failed' : 'source_not_configured',
      error: error.message,
      preserved
    });
    if (options.optional) {
      console.warn(JSON.stringify({
        status: 'preserved',
        reason: configuredSourcePresent(options) ? 'configured_source_failed' : 'source_not_configured',
        error: error.message,
        statusPath,
        preserved
      }, null, 2));
      return 0;
    }
    console.error(error.message);
    return 1;
  } finally {
    if (materialized?.cleanupDir) {
      fs.rmSync(materialized.cleanupDir, { recursive: true, force: true });
    }
  }
}

module.exports = {
  WB_SUBSTITUTION_REFRESH_SCHEMA,
  WB_SUBSTITUTION_SCHEMA,
  buildPayload,
  buildRequestHeaders,
  assertPayloadQuality,
  configuredSourcePresent,
  main,
  materializeInputWorkbook,
  parseArgs,
  resolveOptions,
  sourceTimestampFromFile,
  validateWorkbookBuffer
};

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}
