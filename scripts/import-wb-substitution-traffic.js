#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const OUTPUT_NAME = 'wb_substitution_traffic';
const WB_SUBSTITUTION_SCHEMA = 'portal-wb-substitution-traffic-v1';

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

function resolveLatestAnsWorkbook() {
  const downloads = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Downloads') : '';
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

function resolveOptions(args) {
  const root = process.cwd();
  const inputXlsx = [
    args['input-xlsx'],
    process.env.ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX,
    resolveLatestAnsWorkbook()
  ].filter(Boolean).find((candidate) => fs.existsSync(candidate)) || '';
  return {
    inputXlsx,
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, 'data'))
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

  const sourceGeneratedAt = sourceTimestampFromFile(options.inputXlsx);
  return {
    schema: WB_SUBSTITUTION_SCHEMA,
    generatedAt: new Date().toISOString(),
    asOfDate: sourceGeneratedAt ? sourceGeneratedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    source: {
      file: path.basename(options.inputXlsx),
      fileName: path.basename(options.inputXlsx),
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

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const payload = buildPayload(options);
  const outputPath = writePayload(options, payload);
  console.log(JSON.stringify({
    inputXlsx: options.inputXlsx,
    outputPath,
    summary: payload.summary
  }, null, 2));
}

main();
