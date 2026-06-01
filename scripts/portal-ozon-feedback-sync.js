#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OZON_API_BASE_URL = 'https://api-seller.ozon.ru';
const DEFAULT_OUTPUT_FILE = 'ozon_feedbacks_summary.json';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
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
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function chunk(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) chunks.push(array.slice(index, index + size));
  return chunks;
}

function compactText(value, maxLength = 420) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function resolveOptions(args) {
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(process.cwd(), 'data'));
  const outputDir = path.resolve(args['output-dir'] || baseDataDir);
  return {
    clientId: args['client-id'] || process.env.ALTEA_OZON_CLIENT_ID || '',
    apiKey: args['api-key'] || process.env.ALTEA_OZON_API_KEY || '',
    apiBaseUrl: String(args['api-base-url'] || process.env.ALTEA_OZON_API_BASE_URL || OZON_API_BASE_URL).replace(/\/+$/, ''),
    outputDir,
    outputFile: args['output-file'] || DEFAULT_OUTPUT_FILE,
    to: args.to || args['date-to'] || todayIso(),
    productLimit: Math.min(Math.max(1, Number(args['product-limit']) || 1000), 1000),
    infoChunkSize: Math.min(Math.max(1, Number(args['info-chunk-size']) || 100), 1000),
    ratingChunkSize: Math.min(Math.max(1, Number(args['rating-chunk-size']) || 100), 1000)
  };
}

async function ozonRequest(options, apiPath, body = {}) {
  const response = await fetch(`${options.apiBaseUrl}${apiPath}`, {
    method: 'POST',
    headers: {
      'Client-Id': options.clientId,
      'Api-Key': options.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const message = payload?.message || payload?.error || text || `HTTP ${response.status}`;
    const error = new Error(`Ozon API ${apiPath} failed: HTTP ${response.status} ${String(message).slice(0, 500)}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function safeOzonRequest(options, apiPath, body, diagnostics, label) {
  try {
    const payload = await ozonRequest(options, apiPath, body);
    diagnostics.sources.push({ key: label, endpoint: apiPath, status: 'loaded' });
    return { ok: true, payload };
  } catch (error) {
    diagnostics.warnings.push(`${label}: ${error.message}`);
    diagnostics.sources.push({
      key: label,
      endpoint: apiPath,
      status: 'error',
      httpStatus: error.status || null,
      message: error.payload?.message || error.message
    });
    return { ok: false, error };
  }
}

async function fetchProductList(options) {
  const items = [];
  let lastId = '';
  for (let page = 0; page < 50; page += 1) {
    const payload = await ozonRequest(options, '/v3/product/list', {
      filter: { visibility: 'ALL' },
      limit: options.productLimit,
      last_id: lastId
    });
    const pageItems = Array.isArray(payload?.result?.items) ? payload.result.items : [];
    items.push(...pageItems);
    lastId = payload?.result?.last_id || '';
    if (!lastId || !pageItems.length) break;
  }
  return items;
}

async function fetchProductInfos(options, productIds) {
  const items = [];
  for (const ids of chunk(productIds, options.infoChunkSize)) {
    const payload = await ozonRequest(options, '/v3/product/info/list', { product_id: ids });
    items.push(...(Array.isArray(payload?.items) ? payload.items : []));
  }
  return items;
}

async function fetchContentRatings(options, skus, diagnostics) {
  const products = [];
  for (const skuChunk of chunk(skus, options.ratingChunkSize)) {
    const result = await safeOzonRequest(options, '/v1/product/rating-by-sku', { skus: skuChunk }, diagnostics, 'content_rating');
    if (result.ok) products.push(...(Array.isArray(result.payload?.products) ? result.payload.products : []));
  }
  return products;
}

async function probeReviewAccess(options, diagnostics) {
  const count = await safeOzonRequest(options, '/v1/review/count', {}, diagnostics, 'review_count');
  const list = await safeOzonRequest(options, '/v1/review/list', { limit: 20, sort_dir: 'DESC' }, diagnostics, 'review_list');
  return {
    countAvailable: count.ok,
    listAvailable: list.ok,
    status: count.ok || list.ok ? 'available' : 'permission_denied',
    count: count.payload || null,
    sample: list.payload || null,
    message: count.error?.payload?.message || list.error?.payload?.message || ''
  };
}

function primarySku(info) {
  return numberOrNull(info?.sku) || numberOrNull(info?.sources?.[0]?.sku);
}

function stockSummary(info) {
  const rows = Array.isArray(info?.stocks?.stocks) ? info.stocks.stocks : [];
  return rows.reduce((acc, row) => {
    acc.present += numberOrZero(row.present);
    acc.reserved += numberOrZero(row.reserved);
    return acc;
  }, { present: 0, reserved: 0 });
}

function ratingGroupMap(rating = {}) {
  const result = {};
  (Array.isArray(rating.groups) ? rating.groups : []).forEach((group) => {
    if (group?.key) result[group.key] = {
      name: group.name || group.key,
      rating: numberOrNull(group.rating),
      weight: numberOrNull(group.weight),
      improveAttributes: Array.isArray(group.improve_attributes)
        ? group.improve_attributes.map((item) => item.name || item.id).filter(Boolean)
        : []
    };
  });
  return result;
}

function buildCards(infos, ratings) {
  const ratingBySku = new Map(ratings.map((item) => [String(item.sku), item]));
  return infos.map((info) => {
    const sku = primarySku(info);
    const stock = stockSummary(info);
    const rating = ratingBySku.get(String(sku)) || null;
    const groups = ratingGroupMap(rating);
    const reviewPromo = (Array.isArray(info.promotions) ? info.promotions : []).find((item) => item.type === 'REVIEWS_PROMO') || null;
    const statusName = info?.statuses?.status_name || '';
    const statusDescription = info?.statuses?.status_description || '';
    return {
      platform: 'ozon',
      productId: info.id,
      sku,
      offerId: info.offer_id || '',
      articleKey: normalizeKey(info.offer_id || ''),
      title: info.name || '',
      label: info.offer_id || info.name || String(info.id || sku || ''),
      contentRating: numberOrNull(rating?.rating),
      contentRatingGroups: groups,
      contentRatingImprove: Object.values(groups).flatMap((group) => group.improveAttributes).slice(0, 10),
      reviewRating: null,
      feedbackCount: null,
      lowRatingCount: null,
      unansweredFeedbackCount: null,
      questionCount: null,
      unansweredQuestionCount: null,
      price: numberOrNull(info.price),
      oldPrice: numberOrNull(info.old_price),
      minPrice: numberOrNull(info.min_price),
      stockPresent: stock.present,
      stockReserved: stock.reserved,
      hasStock: Boolean(info?.stocks?.has_stock),
      archived: Boolean(info.is_archived),
      status: statusName,
      statusDescription,
      visibility: info?.visibility_details || {},
      reviewPromoEnabled: Boolean(reviewPromo?.is_enabled),
      updatedAt: info.updated_at || '',
      primaryImage: Array.isArray(info.primary_image) ? info.primary_image[0] : info.primary_image || '',
      comment: rating
        ? (numberOrZero(rating.rating) < 70 ? 'Низкий рейтинг контента: открыть карточку' : 'Карточка по контенту ок')
        : 'Нет рейтинга контента по SKU'
    };
  }).sort((a, b) => {
    const aRating = a.contentRating === null ? -1 : a.contentRating;
    const bRating = b.contentRating === null ? -1 : b.contentRating;
    return aRating - bRating || String(a.offerId).localeCompare(String(b.offerId), 'ru');
  });
}

function buildTotals(cards, productList, reviewAccess) {
  const rated = cards.filter((card) => card.contentRating !== null);
  const avgContentRating = rated.length
    ? round(rated.reduce((sum, card) => sum + numberOrZero(card.contentRating), 0) / rated.length, 2)
    : null;
  return {
    products: productList.length,
    cards: cards.length,
    contentRated: rated.length,
    avgContentRating,
    contentBelow70: cards.filter((card) => numberOrZero(card.contentRating) > 0 && numberOrZero(card.contentRating) < 70).length,
    contentBelow90: cards.filter((card) => numberOrZero(card.contentRating) > 0 && numberOrZero(card.contentRating) < 90).length,
    reviewPromoEnabled: cards.filter((card) => card.reviewPromoEnabled).length,
    hasStock: cards.filter((card) => card.hasStock).length,
    stockPresent: cards.reduce((sum, card) => sum + numberOrZero(card.stockPresent), 0),
    archived: cards.filter((card) => card.archived).length,
    reviewApiStatus: reviewAccess.status,
    reviewApiMessage: compactText(reviewAccess.message, 260)
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const options = resolveOptions(args);
  if (!options.clientId || !options.apiKey) {
    throw new Error('Set ALTEA_OZON_CLIENT_ID and ALTEA_OZON_API_KEY before running Ozon sync.');
  }

  const outputPath = path.join(options.outputDir, options.outputFile);
  const previous = readJson(outputPath, null);
  const diagnostics = { warnings: [], sources: [] };

  const productList = await fetchProductList(options);
  diagnostics.sources.push({ key: 'product_list', endpoint: '/v3/product/list', status: 'loaded', rows: productList.length });
  const productIds = [...new Set(productList.map((item) => numberOrNull(item.product_id)).filter(Boolean))];
  const infos = await fetchProductInfos(options, productIds);
  diagnostics.sources.push({ key: 'product_info', endpoint: '/v3/product/info/list', status: 'loaded', rows: infos.length });
  const skus = [...new Set(infos.map(primarySku).filter(Boolean))];
  const ratings = await fetchContentRatings(options, skus, diagnostics);
  const reviewAccess = await probeReviewAccess(options, diagnostics);
  const cards = buildCards(infos, ratings);
  const totals = buildTotals(cards, productList, reviewAccess);

  const snapshot = {
    date: options.to,
    generatedAt: new Date().toISOString(),
    cards
  };
  const priorHistory = Array.isArray(previous?.history) ? previous.history : [];
  const history = [...priorHistory.filter((item) => item?.date !== options.to), snapshot].slice(-21);

  const payload = {
    schema: 'portal-ozon-feedbacks-v1',
    generatedAt: new Date().toISOString(),
    source: 'ozon-seller-api',
    docsUrl: 'https://docs.ozon.ru/api/seller/',
    window: { to: options.to, days: 1 },
    summary: {
      feedbacks: { count: null, answered: null, unanswered: null, lowRating: null, avgRating: null },
      questions: { count: null, answered: null, unanswered: null },
      counters: {
        reviewApiStatus: reviewAccess.status,
        reviewApiMessage: totals.reviewApiMessage
      },
      ...totals
    },
    reviewAccess,
    cards,
    reviews: [],
    questions: [],
    daily: [],
    history,
    diagnostics
  };

  writeJson(outputPath, payload);
  console.log(JSON.stringify({
    ok: true,
    outputPath,
    products: productList.length,
    cards: cards.length,
    contentRated: totals.contentRated,
    avgContentRating: totals.avgContentRating,
    reviewApiStatus: reviewAccess.status,
    warnings: diagnostics.warnings.slice(0, 5)
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
