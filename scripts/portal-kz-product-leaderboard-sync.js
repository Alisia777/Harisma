#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const XLSX = require('xlsx');

const DEFAULT_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1_WNHliH2-7E17H8J6BvYTSBWVD7cuDDBpn0GJ5Crxdg/edit?gid=349075746#gid=349075746';
const DEFAULT_SOURCE_GID = '349075746';
const DEFAULT_BRAND_FILTER = 'АЛТЕЯ';
const DEFAULT_OUTPUT_DIR = '.altea-google-sheet-sync-output';
const DEFAULT_PROFILE_DIR = '.altea-google-sheets-profile';

function parseArgs(argv) {
  const args = {
    command: 'sync',
    dryRun: false,
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
    if (token === '--mirror-local-fallback') {
      args.mirrorLocalFallback = true;
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

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function numberOrZero(value) {
  const normalized = typeof value === 'string' ? value.replace(/\s+/g, '').replace(',', '.').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value) {
  const normalized = typeof value === 'string' ? value.replace(/\s+/g, '').replace(',', '.').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sum(values) {
  return values.reduce((total, value) => total + numberOrZero(value), 0);
}

function averageRate(numerator, denominator) {
  const top = numberOrZero(numerator);
  const bottom = numberOrZero(denominator);
  if (!bottom) return 0;
  return top / bottom;
}

function safePctValue(value) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : parsed / 100;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function stableId(prefix, raw) {
  return `${prefix}-${crypto.createHash('sha1').update(String(raw || '')).digest('hex').slice(0, 12)}`;
}

function resolveSkuOwner(sku) {
  const directOwner = normalizeText(
    sku?.owner && typeof sku.owner === 'object'
      ? sku.owner.name
      : (sku?.ownerName || sku?.owner)
  );
  if (directOwner) return directOwner;
  const byPlatform = sku?.ownersByPlatform || {};
  return [
    byPlatform.wb,
    byPlatform.ozon,
    byPlatform.ym,
    byPlatform.ga,
    byPlatform.letu,
    byPlatform.mm
  ].map(normalizeText).find(Boolean) || '';
}

function resolveSkuCategory(sku) {
  return normalizeText(sku?.category || sku?.type || sku?.segment);
}

function resolveSkuTraffic(sku) {
  if (sku?.flags?.hasKZ) return 'КЗ';
  if (sku?.flags?.hasVK) return 'VK';
  const channels = Array.isArray(sku?.traffic?.channels) ? sku.traffic.channels.filter(Boolean) : [];
  return channels.join(', ');
}

async function fetchWorkbookBuffer(options) {
  const browser = await chromium.launchPersistentContext(options.profileDir, {
    headless: true,
    channel: 'chrome'
  });
  try {
    const response = await browser.request.get(options.exportUrl, { failOnStatusCode: false });
    if (!response.ok()) {
      throw new Error(`Google export returned HTTP ${response.status()}`);
    }
    return Buffer.from(await response.body());
  } finally {
    await browser.close();
  }
}

function resolveLeaderboardSignal(item) {
  if (!item.owner) return 'no_owner';
  if (item.buys <= 0 || item.revenue <= 0) return 'no_sales';
  if (item.drrPct !== null && item.drrPct >= 0.4) return 'risk';
  if (item.romiPct !== null && item.romiPct < 1.5) return 'risk';
  if (item.romiPct !== null && item.romiPct >= 2.5 && item.drrPct !== null && item.drrPct <= 0.3) return 'leader';
  return 'steady';
}

function buildSummary(items) {
  const reach = sum(items.map((item) => item.reach));
  const reactions = sum(items.map((item) => item.reactions));
  const posts = sum(items.map((item) => item.posts));
  const clicks = sum(items.map((item) => item.clicks));
  const carts = sum(items.map((item) => item.carts));
  const orders = sum(items.map((item) => item.orders));
  const buys = sum(items.map((item) => item.buys));
  const contentCost = sum(items.map((item) => item.contentCost));
  const revenue = sum(items.map((item) => item.revenue));
  const income = sum(items.map((item) => item.income));
  return {
    skuCount: items.length,
    ownerCount: new Set(items.map((item) => normalizeText(item.owner)).filter(Boolean)).size,
    reach,
    reactions,
    posts,
    clicks,
    carts,
    orders,
    buys,
    contentCost,
    revenue,
    income,
    ctrPct: averageRate(clicks, reach),
    cartRatePct: averageRate(carts, clicks),
    orderRatePct: averageRate(orders, clicks),
    buyRatePct: averageRate(buys, clicks),
    buyoutPct: averageRate(buys, orders),
    romiPct: averageRate(income, contentCost),
    drrPct: averageRate(contentCost, revenue)
  };
}

function buildPayload(rows, skus, options) {
  const baseSkus = Array.isArray(skus) ? skus : [];
  const skuByKey = new Map(
    baseSkus
      .map((sku) => [normalizeKey(sku.articleKey || sku.article || sku.sku), sku])
      .filter(([key]) => key)
  );

  const headerKeys = Object.keys(rows[0] || {});
  if (headerKeys.length < 22) {
    throw new Error(`КЗ-лист выглядит неполным: найдено только ${headerKeys.length} колонок.`);
  }

  const [
    brandKey,
    productKey,
    articleKeyField,
    articleField,
    costKey,
    reachKey,
    reactionsKey,
    postsKey,
    clicksKey,
    ordersKey,
    buysKey,
    cartsKey,
    erviewKey,
    contentCostKey,
    ctrKey,
    conversionKey,
    revenueKey,
    incomeKey,
    ecpmKey,
    grossEcpmKey,
    romiKey,
    drrKey
  ] = headerKeys;

  const brandRows = rows.filter((row) => normalizeText(row[brandKey]) === options.brandFilter);
  const matchedItems = [];
  const unmatchedItems = [];

  brandRows.forEach((row) => {
    const articleKey = normalizeText(row[articleKeyField]);
    const articleLookupKey = normalizeKey(articleKey);
    const sku = skuByKey.get(articleLookupKey) || null;

    const item = {
      id: stableId('product-leaderboard', articleKey || row[articleField] || row[productKey]),
      brand: normalizeText(row[brandKey]),
      weekLabel: options.sheetName,
      articleKey,
      article: normalizeText(row[articleField]),
      name: normalizeText(row[productKey]) || (sku?.name || articleKey || 'SKU'),
      owner: resolveSkuOwner(sku),
      category: resolveSkuCategory(sku),
      traffic: resolveSkuTraffic(sku),
      inPortal: Boolean(sku),
      reach: numberOrZero(row[reachKey]),
      reactions: numberOrZero(row[reactionsKey]),
      posts: numberOrZero(row[postsKey]),
      clicks: numberOrZero(row[clicksKey]),
      carts: numberOrZero(row[cartsKey]),
      orders: numberOrZero(row[ordersKey]),
      buys: numberOrZero(row[buysKey]),
      itemCost: numberOrZero(row[costKey]),
      contentCost: numberOrZero(row[contentCostKey]),
      revenue: numberOrZero(row[revenueKey]),
      income: numberOrZero(row[incomeKey]),
      erviewPct: safePctValue(row[erviewKey]),
      ctrPct: safePctValue(row[ctrKey]),
      conversionPct: safePctValue(row[conversionKey]),
      ecpm: numberOrNull(row[ecpmKey]),
      grossEcpm: numberOrNull(row[grossEcpmKey]),
      romiPct: safePctValue(row[romiKey]),
      drrPct: safePctValue(row[drrKey])
    };

    item.buyRatePct = averageRate(item.buys, item.clicks);
    item.buyoutPct = averageRate(item.buys, item.orders);
    item.signal = resolveLeaderboardSignal(item);

    if (sku) matchedItems.push(item);
    else unmatchedItems.push(item);
  });

  matchedItems.sort((left, right) =>
    right.buys - left.buys
    || right.revenue - left.revenue
    || right.income - left.income
    || left.name.localeCompare(right.name, 'ru')
  );

  const summary = buildSummary(matchedItems);
  return {
    generatedAt: new Date().toISOString(),
    sourceFile: options.sourceUrl,
    sourceGid: options.sourceGid,
    sourceSheetName: options.sheetName,
    weekLabel: options.sheetName,
    brandFilter: options.brandFilter,
    header: {
      brandKey,
      productKey,
      articleKeyField,
      articleField
    },
    totals: {
      sourceRows: rows.length,
      brandRows: brandRows.length,
      matchedRows: matchedItems.length,
      unmatchedRows: unmatchedItems.length
    },
    summary,
    owners: [...new Set(matchedItems.map((item) => item.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    categories: [...new Set(matchedItems.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    items: matchedItems,
    unmatchedItems
  };
}

function writeSnapshot(outputDir, payload, options) {
  const outputPath = path.join(outputDir, 'product_leaderboard.json');
  writeJson(outputPath, payload);

  const written = [outputPath];
  if (options.mirrorLocalFallback) {
    const mirrorPath = cwdJoin('data', 'product_leaderboard.json');
    writeJson(mirrorPath, payload);
    written.push(mirrorPath);
  }
  return written;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.command !== 'sync') {
    throw new Error(`Unknown command: ${args.command}`);
  }

  const options = {
    sourceUrl: args['source-url'] || process.env.ALTEA_KZ_LEADERBOARD_SHEET_URL || DEFAULT_SOURCE_URL,
    sourceGid: args.gid || process.env.ALTEA_KZ_LEADERBOARD_SHEET_GID || DEFAULT_SOURCE_GID,
    brandFilter: args['brand-filter'] || process.env.ALTEA_KZ_LEADERBOARD_BRAND || DEFAULT_BRAND_FILTER,
    outputDir: path.resolve(args['output-dir'] || cwdJoin(DEFAULT_OUTPUT_DIR)),
    profileDir: path.resolve(args['profile-dir'] || cwdJoin(DEFAULT_PROFILE_DIR)),
    dryRun: Boolean(args.dryRun),
    mirrorLocalFallback: Boolean(args.mirrorLocalFallback)
  };
  options.exportUrl = `https://docs.google.com/spreadsheets/d/${options.sourceUrl.match(/\/d\/([^/]+)/)?.[1] || ''}/export?format=xlsx&gid=${options.sourceGid}`;
  if (!/\/d\/[^/]+/.test(options.sourceUrl)) {
    throw new Error(`Не удалось извлечь spreadsheet id из ${options.sourceUrl}`);
  }

  const workbook = XLSX.read(await fetchWorkbookBuffer(options), { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false });
  const skus = readJson(cwdJoin('data', 'skus.json'));
  const payload = buildPayload(rows, skus, { ...options, sheetName });
  const outputFiles = writeSnapshot(options.outputDir, payload, options);

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    sourceUrl: options.sourceUrl,
    sourceGid: options.sourceGid,
    sheetName,
    brandFilter: options.brandFilter,
    outputFiles,
    summary: {
      sourceRows: payload.totals.sourceRows,
      brandRows: payload.totals.brandRows,
      matchedRows: payload.totals.matchedRows,
      unmatchedRows: payload.totals.unmatchedRows,
      buys: payload.summary.buys,
      revenue: payload.summary.revenue,
      income: payload.summary.income
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
