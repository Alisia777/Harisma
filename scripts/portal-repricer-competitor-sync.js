#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeKey } = require('./repricer-market-intelligence');

const DEFAULT_WB_SEARCH_URL = 'https://search.wb.ru/exactmatch/ru/common/v18/search';
const STOP_WORDS = new Set([
  'для', 'и', 'с', 'со', 'от', 'на', 'в', 'во', 'по', 'из', 'к', 'до', 'без',
  'the', 'a', 'an', 'with', 'for', 'of', 'ml', 'мл', 'г', 'гр', 'kg', 'кг',
  'шт', 'штук', 'капсул', 'капсулы', 'капсула', 'упаковка', 'набор'
]);

function parseArgs(argv = process.argv) {
  const args = { command: 'sync' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token) continue;
    if (!token.startsWith('--') && index === 2) {
      args.command = token;
      continue;
    }
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    const key = token.slice(2, separator >= 0 ? separator : undefined);
    if (separator >= 0) {
      args[key] = token.slice(separator + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function finite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function moneyFromWb(value) {
  const parsed = finite(value);
  if (parsed === null || parsed <= 0) return null;
  return Number((parsed / 100).toFixed(2));
}

function normalizedText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/×/g, 'x')
    .replace(/[^a-zа-я0-9.%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return [...new Set(normalizedText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+(?:[.,]\d+)?$/.test(token)))];
}

function productIdentifiers(...values) {
  const identifiers = new Set();
  const add = (compact) => {
    if (
      compact.length >= 3
      && /[a-zа-я]/.test(compact)
      && /\d/.test(compact)
      && !/^\d+(?:ml|мл|l|л|g|гр|г|kg|кг|caps|капсул|шт)$/.test(compact)
    ) identifiers.add(compact);
  };
  values.forEach((value) => {
    const text = normalizedText(value);
    text.split(' ').forEach((token) => {
      const compact = normalizeKey(token);
      add(compact);
    });
    String(value || '').split('_').slice(0, 2).forEach((part) => {
      const compact = normalizeKey(part);
      add(compact);
    });
  });
  return [...identifiers];
}

function extractPackage(value) {
  const text = normalizedText(value).replace(',', '.');
  const multiply = text.match(/(\d+)\s*[xх]\s*(\d+(?:\.\d+)?)\s*(мл|ml|л|l|г|гр|g|кг|kg|капсул|капсулы|caps|шт)/i);
  const direct = text.match(/(\d+(?:\.\d+)?)\s*(мл|ml|л|l|г|гр|g|кг|kg|капсул|капсулы|caps|шт)/i);
  const match = multiply || direct;
  if (!match) return { dimension: '', amount: null, packUnits: 1, raw: '' };
  const packUnits = multiply ? Math.max(1, Number(match[1])) : 1;
  const amountRaw = Number(multiply ? match[2] : match[1]);
  const unit = String(multiply ? match[3] : match[2]).toLowerCase();
  let dimension = '';
  let amount = amountRaw * packUnits;
  if (['мл', 'ml'].includes(unit)) dimension = 'volume_ml';
  else if (['л', 'l'].includes(unit)) {
    dimension = 'volume_ml';
    amount *= 1000;
  } else if (['г', 'гр', 'g'].includes(unit)) dimension = 'mass_g';
  else if (['кг', 'kg'].includes(unit)) {
    dimension = 'mass_g';
    amount *= 1000;
  } else {
    dimension = 'pieces';
  }
  return {
    dimension,
    amount: Number(amount.toFixed(3)),
    packUnits,
    raw: match[0]
  };
}

function explicitPromotion(product = {}) {
  const text = [
    product.promoTextCard,
    product.promoTextCat,
    product.promoText,
    product.promotionName,
    product.actionLabel
  ].filter(Boolean).join(' ').trim();
  return product.isPromo === true
    || product.promoActive === true
    || Boolean(product.promotionId)
    || Boolean(text);
}

function packageComparable(ownPackage = {}, competitorPackage = {}, tolerance = 0.08) {
  if (!ownPackage.dimension || !competitorPackage.dimension) return false;
  if (ownPackage.dimension !== competitorPackage.dimension) return false;
  if (!ownPackage.amount || !competitorPackage.amount) return false;
  return Math.abs(competitorPackage.amount / ownPackage.amount - 1) <= tolerance;
}

function productMatch(own = {}, competitor = {}, options = {}) {
  const ownName = own.name || own.type || own.category || '';
  const competitorName = `${competitor.name || ''} ${competitor.brand || ''}`;
  const ownTokens = tokens(ownName);
  const competitorTokens = new Set(tokens(competitorName));
  const overlap = ownTokens.length
    ? ownTokens.filter((token) => competitorTokens.has(token)).length / ownTokens.length
    : 0;
  const ownPackage = extractPackage(`${own.name || ''} ${own.articleKey || ''}`);
  const competitorPackage = extractPackage(competitor.name || '');
  const packComparable = packageComparable(
    ownPackage,
    competitorPackage,
    Number(options.packageTolerance ?? 0.08)
  );
  const typeTokens = tokens(own.type || '');
  const typeOverlap = typeTokens.length
    ? typeTokens.filter((token) => competitorTokens.has(token)).length / typeTokens.length
    : overlap;
  const ownIdentifiers = productIdentifiers(own.articleKey, own.name);
  const competitorIdentifiers = new Set(productIdentifiers(competitor.id, competitor.name));
  const exactIdentifier = ownIdentifiers.some((identifier) => competitorIdentifiers.has(identifier));
  let score = Math.min(1,
    overlap * 0.55
    + typeOverlap * 0.20
    + (packComparable ? 0.25 : 0)
  );
  if (exactIdentifier && packComparable) score = Math.max(score, 0.92);
  return {
    score: Number(score.toFixed(4)),
    overlap: Number(overlap.toFixed(4)),
    typeOverlap: Number(typeOverlap.toFixed(4)),
    exactIdentifier,
    packComparable,
    ownPackage,
    competitorPackage
  };
}

function wbProductPrice(product = {}) {
  const sizePrices = (Array.isArray(product.sizes) ? product.sizes : [])
    .map((size) => size?.price || {})
    .find((price) => finite(price.product, price.total, price.basic) !== null) || {};
  return moneyFromWb(
    product.salePriceU
    ?? product.priceU
    ?? sizePrices.product
    ?? sizePrices.total
  );
}

function normalizeWbProduct(product = {}) {
  const id = String(product.id ?? product.nmId ?? '').trim();
  const price = wbProductPrice(product);
  const quantity = finite(product.totalQuantity, product.quantity, product.totalQty);
  return {
    id,
    name: String(product.name || product.title || '').trim(),
    brand: String(product.brand || '').trim(),
    seller: String(product.supplier || product.supplierName || product.brand || '').trim(),
    price,
    inStock: quantity === null ? true : quantity > 0,
    promo: explicitPromotion(product),
    url: id ? `https://www.wildberries.ru/catalog/${encodeURIComponent(id)}/detail.aspx` : '',
    source: 'wb_public_catalog_search'
  };
}

function suspiciousSeller(product = {}, options = {}) {
  const seller = normalizedText(product.seller || product.brand || '');
  const ownBrands = (options.ownBrands || ['алтея', 'alteya', 'alteia'])
    .map(normalizedText)
    .filter(Boolean);
  const denied = (options.deniedSellers || [])
    .map(normalizedText)
    .filter(Boolean);
  if (!seller) return 'seller_missing';
  if (ownBrands.some((brand) => seller.includes(brand))) return 'own_brand';
  if (denied.some((name) => seller.includes(name))) return 'seller_denied';
  if (/(no.?name|неизвест|подозрит|тестов)/i.test(seller)) return 'seller_suspicious';
  return '';
}

function filterCompetitorProducts(own, products = [], options = {}) {
  const minimumMatchScore = Number(options.minimumMatchScore ?? 0.85);
  const observedAt = options.observedAt || new Date().toISOString();
  const accepted = [];
  const rejected = [];
  products.forEach((raw) => {
    const product = raw.source ? raw : normalizeWbProduct(raw);
    const sellerRejection = suspiciousSeller(product, options);
    const match = productMatch(own, product, options);
    let reason = '';
    if (!product.id || !product.name) reason = 'offer_identity_missing';
    else if (product.promo) reason = 'promotion';
    else if (!product.inStock) reason = 'out_of_stock';
    else if (product.price === null || product.price <= 0) reason = 'price_missing';
    else if (sellerRejection) reason = sellerRejection;
    else if (!match.packComparable) reason = 'package_mismatch';
    else if (match.score + 1e-9 < minimumMatchScore) reason = 'match_score_low';
    if (reason) {
      rejected.push({
        competitor_id: product.id,
        seller: product.seller,
        name: product.name,
        reason,
        match_score: match.score
      });
      return;
    }
    const comparablePrice = match.ownPackage.amount && match.competitorPackage.amount
      ? Number((product.price * match.ownPackage.amount / match.competitorPackage.amount).toFixed(2))
      : product.price;
    accepted.push({
      competitor_id: product.id,
      seller: product.seller,
      product_name: product.name,
      client_price: product.price,
      comparable_unit_price: comparablePrice,
      in_stock: true,
      match_score: match.score,
      pack_units: match.competitorPackage.packUnits || 1,
      package_dimension: match.competitorPackage.dimension,
      package_amount: match.competitorPackage.amount,
      own_package_amount: match.ownPackage.amount,
      currency: 'RUB',
      observed_at: observedAt,
      url: product.url,
      source: product.source || 'catalog_provider'
    });
  });
  return { accepted, rejected };
}

function ownSkuCatalog(matrix = {}, canonical = {}, maxSkus = 80) {
  const canonicalRows = (canonical?.rows || [])
    .filter((row) => ['wb', 'ozon'].includes(String(row?.platform || '').toLowerCase()))
    .filter((row) => ['active', 'new', 'relaunch', 'exit'].includes(String(row?.facts?.lifecycle_key || '').toLowerCase()));
  const needed = new Set(canonicalRows.map((row) => normalizeKey(row.article_key)));
  const lifecycleRank = new Map();
  canonicalRows.forEach((row) => {
    const key = normalizeKey(row.article_key);
    const lifecycle = String(row?.facts?.lifecycle_key || '').toLowerCase();
    const rank = ({ new: 0, relaunch: 0, active: 1, exit: 2 }[lifecycle] ?? 3);
    lifecycleRank.set(key, Math.min(lifecycleRank.get(key) ?? 9, rank));
  });
  return (matrix?.items || [])
    .filter((item) => needed.size === 0 || needed.has(normalizeKey(item.articleKey || item.article)))
    .filter((item) => item.name && extractPackage(`${item.name} ${item.articleKey}`).amount)
    .sort((left, right) => (
      (lifecycleRank.get(normalizeKey(left.articleKey || left.article)) ?? 9)
      - (lifecycleRank.get(normalizeKey(right.articleKey || right.article)) ?? 9)
      || String(left.articleKey || left.article || '').localeCompare(String(right.articleKey || right.article || ''), 'ru')
    ))
    .slice(0, Math.max(1, maxSkus))
    .map((item) => ({
      articleKey: String(item.articleKey || item.article || '').trim(),
      name: String(item.name || '').trim(),
      brand: String(item.brand || '').trim(),
      category: String(item.category || '').trim(),
      type: String(item.type || '').trim(),
      status: String(item.status || '').trim()
    }));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(url, options = {}, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Altea-Repricer-Competitor-Audit/1.0'
        },
        signal: AbortSignal.timeout(Number(options.timeoutMs || 15000))
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
      return text ? JSON.parse(text) : {};
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await sleep((attempt + 1) * Number(options.retryDelayMs || 1200));
    }
  }
  throw lastError;
}

async function searchWb(query, options = {}) {
  const url = new URL(options.searchUrl || DEFAULT_WB_SEARCH_URL);
  url.searchParams.set('ab_testing', 'false');
  url.searchParams.set('appType', '1');
  url.searchParams.set('curr', 'rub');
  url.searchParams.set('dest', '-1257786');
  url.searchParams.set('hide_dtype', '13');
  url.searchParams.set('lang', 'ru');
  url.searchParams.set('page', '1');
  url.searchParams.set('query', query);
  url.searchParams.set('resultset', 'catalog');
  url.searchParams.set('sort', 'popular');
  url.searchParams.set('spp', '30');
  const payload = await requestJson(url.toString(), options, Number(options.attempts || 3));
  return payload?.data?.products || payload?.products || [];
}

function previousRowsMap(previous = {}) {
  const map = new Map();
  (previous?.rows || []).forEach((row) => {
    const key = `${String(row.platform || '').toLowerCase()}|${normalizeKey(row.article_key || row.articleKey)}`;
    if (key !== '|') map.set(key, row);
  });
  return map;
}

async function buildCompetitorSnapshot({
  catalog = [],
  previous = {},
  external = {},
  search = searchWb,
  now = new Date(),
  options = {}
} = {}) {
  const rows = [];
  const diagnostics = [];
  const previousMap = previousRowsMap(previous);
  const externalRows = Array.isArray(external?.rows) ? external.rows : [];
  const externalByKey = new Map(externalRows.map((row) => [
    `${String(row.platform || '').toLowerCase()}|${normalizeKey(row.article_key || row.articleKey)}`,
    row
  ]));
  for (let index = 0; index < catalog.length; index += 1) {
    const sku = catalog[index];
    const observedAt = now.toISOString();
    try {
      const rawProducts = await search(sku.name, options);
      const products = rawProducts.map(normalizeWbProduct);
      const filtered = filterCompetitorProducts(sku, products, { ...options, observedAt });
      const externalWb = externalByKey.get(`wb|${normalizeKey(sku.articleKey)}`);
      const mergedOffers = [...filtered.accepted, ...(externalWb?.offers || [])];
      rows.push({
        platform: 'wb',
        article_key: sku.articleKey,
        normalized_article_key: normalizeKey(sku.articleKey),
        observed_at: observedAt,
        source: 'wb_public_catalog_search+external_provider',
        query: sku.name,
        offers: mergedOffers,
        diagnostics: {
          discovered: products.length,
          accepted: mergedOffers.length,
          rejected: filtered.rejected.length,
          rejected_by_reason: filtered.rejected.reduce((acc, row) => {
            acc[row.reason] = (acc[row.reason] || 0) + 1;
            return acc;
          }, {})
        }
      });
      diagnostics.push({
        platform: 'wb',
        articleKey: sku.articleKey,
        status: mergedOffers.length >= Number(options.minimumOffers || 3) ? 'trusted' : 'insufficient',
        discovered: products.length,
        accepted: mergedOffers.length,
        rejected: filtered.rejected.slice(0, 20)
      });
    } catch (error) {
      const prior = previousMap.get(`wb|${normalizeKey(sku.articleKey)}`);
      if (prior) rows.push(prior);
      diagnostics.push({
        platform: 'wb',
        articleKey: sku.articleKey,
        status: prior ? 'retained_previous' : 'failed',
        error: String(error?.message || error).slice(0, 500)
      });
    }
    const externalOzon = externalByKey.get(`ozon|${normalizeKey(sku.articleKey)}`);
    if (externalOzon) {
      rows.push(externalOzon);
      diagnostics.push({
        platform: 'ozon',
        articleKey: sku.articleKey,
        status: (externalOzon.offers || []).length >= Number(options.minimumOffers || 3)
          ? 'trusted'
          : 'insufficient',
        accepted: (externalOzon.offers || []).length,
        provider: externalOzon.source || 'external_provider'
      });
    } else {
      const priorOzon = previousMap.get(`ozon|${normalizeKey(sku.articleKey)}`);
      if (priorOzon) rows.push(priorOzon);
      diagnostics.push({
        platform: 'ozon',
        articleKey: sku.articleKey,
        status: priorOzon ? 'retained_previous' : 'provider_not_configured',
        accepted: priorOzon?.offers?.length || 0
      });
    }
    if (index + 1 < catalog.length && Number(options.delayMs || 0) > 0) {
      await sleep(Number(options.delayMs));
    }
  }
  const deduped = [...new Map(rows.map((row) => [
    `${String(row.platform || '').toLowerCase()}|${normalizeKey(row.article_key || row.articleKey)}`,
    row
  ])).values()];
  const trustedRows = deduped.filter((row) => (row.offers || []).length >= Number(options.minimumOffers || 3)).length;
  return {
    schema: 'repricer-competitor-prices-v2',
    generatedAt: now.toISOString(),
    currency: 'RUB',
    status: trustedRows ? 'ok' : 'insufficient',
    policy: {
      minimumOffers: Number(options.minimumOffers || 3),
      minimumMatchScore: Number(options.minimumMatchScore ?? 0.85),
      packageTolerancePct: Number(options.packageTolerance ?? 0.08),
      promotionsExcluded: true,
      suspiciousSellersExcluded: true,
      ownBrandExcluded: true,
      stalePreviousOffersNeverRefreshed: true,
      ozonProvider: externalRows.some((row) => String(row.platform).toLowerCase() === 'ozon')
        ? 'external_feed'
        : 'not_configured'
    },
    summary: {
      requested_skus: catalog.length,
      sku_platform_rows: deduped.length,
      trusted_rows: trustedRows,
      trusted_offers: deduped.reduce((sum, row) => sum + ((row.offers || []).length >= Number(options.minimumOffers || 3) ? row.offers.length : 0), 0),
      total_offers: deduped.reduce((sum, row) => sum + (row.offers || []).length, 0),
      failed_queries: diagnostics.filter((row) => row.status === 'failed').length,
      retained_previous: diagnostics.filter((row) => row.status === 'retained_previous').length,
      provider_not_configured: diagnostics.filter((row) => row.status === 'provider_not_configured').length
    },
    rows: deduped,
    diagnostics
  };
}

async function loadExternalFeed(args = {}) {
  const filePath = args['external-file'] ? path.resolve(args['external-file']) : '';
  if (filePath && fs.existsSync(filePath)) return readJson(filePath, {});
  const url = String(args['external-url'] || process.env.ALTEA_REPRICER_COMPETITOR_FEED_URL || '').trim();
  if (!url) return {};
  return requestJson(url, { timeoutMs: Number(args['timeout-ms'] || 15000) }, 3);
}

async function main() {
  const args = parseArgs();
  const inputDir = path.resolve(args['input-dir'] || 'data');
  const outputPath = path.resolve(args.output || path.join(inputDir, 'repricer_competitor_prices.json'));
  const previousPath = path.resolve(args.previous || outputPath);
  const maxSkus = Math.max(1, Number(args['max-skus'] || 80));
  const catalog = ownSkuCatalog(
    readJson(path.join(inputDir, 'sku_matrix.json'), {}),
    readJson(path.join(inputDir, 'canonical_repricer.json'), {}),
    maxSkus
  );
  const payload = await buildCompetitorSnapshot({
    catalog,
    previous: readJson(previousPath, {}),
    external: await loadExternalFeed(args),
    now: args['as-of-date'] ? new Date(`${args['as-of-date']}T12:00:00Z`) : new Date(),
    options: {
      searchUrl: args['wb-search-url'] || process.env.ALTEA_WB_PUBLIC_SEARCH_URL || DEFAULT_WB_SEARCH_URL,
      delayMs: Math.max(0, Number(args['delay-ms'] ?? 1200)),
      timeoutMs: Math.max(1000, Number(args['timeout-ms'] || 15000)),
      attempts: Math.max(1, Number(args.attempts || 3)),
      retryDelayMs: Math.max(100, Number(args['retry-delay-ms'] || 1200)),
      minimumOffers: Math.max(2, Number(args['minimum-offers'] || 3)),
      minimumMatchScore: Math.max(0.5, Number(args['minimum-match-score'] || 0.85)),
      packageTolerance: Math.max(0, Number(args['package-tolerance'] || 0.08)),
      deniedSellers: String(args['denied-sellers'] || '').split(',').filter(Boolean)
    }
  });
  writeJson(outputPath, payload);
  console.log(JSON.stringify({ output: outputPath, status: payload.status, summary: payload.summary }, null, 2));
  if (args.strict === true && payload.summary.trusted_rows === 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[repricer-competitor-sync] ${error?.stack || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildCompetitorSnapshot,
  explicitPromotion,
  extractPackage,
  filterCompetitorProducts,
  moneyFromWb,
  normalizeWbProduct,
  normalizedText,
  ownSkuCatalog,
  packageComparable,
  parseArgs,
  productMatch,
  productIdentifiers,
  searchWb,
  suspiciousSeller,
  tokens
};
