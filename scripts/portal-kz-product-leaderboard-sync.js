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
    if (token === '--allow-stale-week') {
      args['allow-stale-week'] = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const nextValue = argv[index + 1];
    if (nextValue === undefined || String(nextValue).startsWith('--')) {
      args[key] = true;
      continue;
    }
    index += 1;
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

function median(values) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => numberOrNull(value))
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  if (list.length % 2) return list[middle];
  return (list[middle - 1] + list[middle]) / 2;
}

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function ratioDelta(actual, baseline) {
  const actualValue = numberOrNull(actual);
  const baselineValue = numberOrNull(baseline);
  if (actualValue === null || baselineValue === null || !baselineValue) return null;
  return actualValue / baselineValue - 1;
}

function alertSeverityRank(severity) {
  if (severity === 'critical') return 4;
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

function buildMetricSnapshot(actual, baseline, lowerIsBetter = false) {
  return {
    value: numberOrNull(actual),
    baseline: numberOrNull(baseline),
    lowerIsBetter: Boolean(lowerIsBetter),
    deltaPct: ratioDelta(actual, baseline)
  };
}

function buildBaselines(items) {
  const rows = Array.isArray(items) ? items : [];
  return {
    erviewPct: median(rows.map((item) => item.erviewPct).filter((value) => value !== null && value > 0)),
    ctrPct: median(rows.map((item) => item.ctrPct).filter((value) => value !== null && value > 0)),
    cartRatePct: median(rows.map((item) => item.cartRatePct).filter((value) => value !== null && value > 0)),
    conversionPct: median(rows.map((item) => item.conversionPct).filter((value) => value !== null && value > 0)),
    buyRatePct: median(rows.map((item) => item.buyRatePct).filter((value) => value !== null && value > 0)),
    buyoutPct: median(rows.map((item) => item.buyoutPct).filter((value) => value !== null && value > 0)),
    romiPct: median(rows.map((item) => item.romiPct).filter((value) => value !== null && value > 0)),
    drrPct: median(rows.map((item) => item.drrPct).filter((value) => value !== null && value > 0)),
    ecpm: median(rows.map((item) => item.ecpm).filter((value) => value !== null && value > 0)),
    grossEcpm: median(rows.map((item) => item.grossEcpm).filter((value) => value !== null && value > 0))
  };
}

function pushDiagnosticsAlert(alerts, config) {
  alerts.push({
    code: config.code,
    family: config.family,
    severity: config.severity,
    title: config.title,
    label: config.label || config.title,
    metricKey: config.metricKey || '',
    value: numberOrNull(config.value),
    baseline: numberOrNull(config.baseline),
    deltaPct: ratioDelta(config.value, config.baseline),
    hint: config.hint || ''
  });
}

function buildDiagnostics(item, baselines) {
  const metrics = {
    erviewPct: buildMetricSnapshot(item.erviewPct, baselines.erviewPct),
    ctrPct: buildMetricSnapshot(item.ctrPct, baselines.ctrPct),
    cartRatePct: buildMetricSnapshot(item.cartRatePct, baselines.cartRatePct),
    conversionPct: buildMetricSnapshot(item.conversionPct, baselines.conversionPct),
    buyRatePct: buildMetricSnapshot(item.buyRatePct, baselines.buyRatePct),
    buyoutPct: buildMetricSnapshot(item.buyoutPct, baselines.buyoutPct),
    romiPct: buildMetricSnapshot(item.romiPct, baselines.romiPct),
    drrPct: buildMetricSnapshot(item.drrPct, baselines.drrPct, true),
    ecpm: buildMetricSnapshot(item.ecpm, baselines.ecpm),
    grossEcpm: buildMetricSnapshot(item.grossEcpm, baselines.grossEcpm)
  };
  const alerts = [];

  if (!item.owner) {
    pushDiagnosticsAlert(alerts, {
      code: 'no_owner',
      family: 'ownership',
      severity: 'critical',
      title: 'Нет owner по SKU',
      label: 'Нет owner',
      hint: 'КЗ уже льётся, а ответственный по карточке не назначен.'
    });
  }

  if (item.buys <= 0 || item.revenue <= 0) {
    pushDiagnosticsAlert(alerts, {
      code: 'no_sales',
      family: 'sales',
      severity: 'critical',
      title: 'Трафик не дошёл до выкупов',
      label: 'Нет выкупов',
      metricKey: 'buys',
      value: item.buys,
      baseline: null,
      hint: 'По КЗ есть активность, но нет выручки или выкупов.'
    });
  }

  if (item.income <= 0 && item.contentCost > 0) {
    pushDiagnosticsAlert(alerts, {
      code: 'negative_income',
      family: 'economics',
      severity: 'critical',
      title: 'КЗ уводит доход в минус',
      label: 'Доход <= 0',
      metricKey: 'income',
      value: item.income,
      baseline: 0,
      hint: 'Нужно разбирать связку контент / оффер / карточка.'
    });
  }

  if (item.reach >= 100000 && metrics.erviewPct.baseline && item.erviewPct !== null && item.erviewPct < Math.max(metrics.erviewPct.baseline * 0.65, 0.0035)) {
    pushDiagnosticsAlert(alerts, {
      code: 'low_erview',
      family: 'traffic',
      severity: 'medium',
      title: 'Отклик ниже медианы КЗ',
      label: 'Отклик просел',
      metricKey: 'erviewPct',
      value: item.erviewPct,
      baseline: metrics.erviewPct.baseline,
      hint: 'Креатив / подача не добирают верх воронки.'
    });
  }

  if (item.reach >= 100000 && metrics.ctrPct.baseline && item.ctrPct !== null && item.ctrPct < Math.max(metrics.ctrPct.baseline * 0.65, 0.004)) {
    pushDiagnosticsAlert(alerts, {
      code: 'low_ctr',
      family: 'traffic',
      severity: 'high',
      title: 'CTR ниже портальной медианы',
      label: 'CTR просел',
      metricKey: 'ctrPct',
      value: item.ctrPct,
      baseline: metrics.ctrPct.baseline,
      hint: 'Охват есть, но клик по карточке слабый.'
    });
  }

  if (item.clicks >= 500 && metrics.cartRatePct.baseline && item.cartRatePct !== null && item.cartRatePct < Math.max(metrics.cartRatePct.baseline * 0.65, 0.12)) {
    pushDiagnosticsAlert(alerts, {
      code: 'low_cart_rate',
      family: 'card',
      severity: 'high',
      title: 'Корзина отстаёт от кликов',
      label: 'Корзина просела',
      metricKey: 'cartRatePct',
      value: item.cartRatePct,
      baseline: metrics.cartRatePct.baseline,
      hint: 'Нужно смотреть оффер, цену и первый экран карточки.'
    });
  }

  if (item.clicks >= 500 && metrics.conversionPct.baseline && item.conversionPct !== null && item.conversionPct < Math.max(metrics.conversionPct.baseline * 0.65, 0.02)) {
    pushDiagnosticsAlert(alerts, {
      code: 'low_conversion',
      family: 'card',
      severity: 'high',
      title: 'Конверсия в заказ ниже нормы',
      label: 'Конверсия просела',
      metricKey: 'conversionPct',
      value: item.conversionPct,
      baseline: metrics.conversionPct.baseline,
      hint: 'Трафик приходит, но карточка не дожимает до заказа.'
    });
  }

  if (item.orders >= 50 && metrics.buyoutPct.baseline && item.buyoutPct !== null && item.buyoutPct < Math.max(metrics.buyoutPct.baseline * 0.85, 0.75)) {
    pushDiagnosticsAlert(alerts, {
      code: 'low_buyout',
      family: 'card',
      severity: 'medium',
      title: 'Выкуп ниже рабочей нормы',
      label: 'Выкуп просел',
      metricKey: 'buyoutPct',
      value: item.buyoutPct,
      baseline: metrics.buyoutPct.baseline,
      hint: 'Есть риск по ожиданиям клиента, упаковке или качеству заявки.'
    });
  }

  if (item.contentCost > 0 && item.romiPct !== null && item.romiPct < 1) {
    pushDiagnosticsAlert(alerts, {
      code: 'romi_below_payback',
      family: 'economics',
      severity: 'critical',
      title: 'ROMI ниже окупаемости',
      label: 'ROMI < 100%',
      metricKey: 'romiPct',
      value: item.romiPct,
      baseline: metrics.romiPct.baseline,
      hint: 'Расход на контент пока не отбивается доходом.'
    });
  } else if (item.contentCost > 0 && metrics.romiPct.baseline && item.romiPct !== null && item.romiPct < Math.max(metrics.romiPct.baseline * 0.6, 1.2)) {
    pushDiagnosticsAlert(alerts, {
      code: 'weak_romi',
      family: 'economics',
      severity: 'high',
      title: 'ROMI заметно ниже медианы',
      label: 'ROMI просел',
      metricKey: 'romiPct',
      value: item.romiPct,
      baseline: metrics.romiPct.baseline,
      hint: 'КЗ работает хуже портального медианного уровня.'
    });
  }

  if (item.revenue > 0 && item.drrPct !== null && item.drrPct > 0.45) {
    pushDiagnosticsAlert(alerts, {
      code: 'high_drr_absolute',
      family: 'economics',
      severity: 'high',
      title: 'ДРР выше рабочего порога',
      label: 'ДРР высок',
      metricKey: 'drrPct',
      value: item.drrPct,
      baseline: metrics.drrPct.baseline,
      hint: 'На этот SKU уходит слишком большая доля выручки.'
    });
  } else if (item.revenue > 0 && metrics.drrPct.baseline && item.drrPct !== null && item.drrPct > Math.max(metrics.drrPct.baseline * 1.35, 0.32)) {
    pushDiagnosticsAlert(alerts, {
      code: 'high_drr',
      family: 'economics',
      severity: 'medium',
      title: 'ДРР выше медианы КЗ',
      label: 'ДРР растёт',
      metricKey: 'drrPct',
      value: item.drrPct,
      baseline: metrics.drrPct.baseline,
      hint: 'Нужно перепроверить цену, оффер и качество входящего трафика.'
    });
  }

  alerts.sort((left, right) =>
    alertSeverityRank(right.severity) - alertSeverityRank(left.severity)
    || String(left.title || '').localeCompare(String(right.title || ''), 'ru')
  );

  const penalty = alerts.reduce((total, alert) => total + (alertSeverityRank(alert.severity) * 10), 0);
  const healthScore = clamp(100 - penalty, 0, 100);
  const highestSeverity = alerts.length ? alerts[0].severity : 'info';
  const summary = alerts.length
    ? alerts.slice(0, 2).map((alert) => alert.label || alert.title).join(' · ')
    : 'Без критичных отклонений по КЗ';

  return {
    healthScore,
    highestSeverity,
    alertCount: alerts.length,
    alerts,
    summary,
    metrics
  };
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

function resolveLeaderboardSignal(item, diagnostics) {
  if (!item.owner) return 'no_owner';
  if (item.buys <= 0 || item.revenue <= 0) return 'no_sales';
  if ((diagnostics?.alerts || []).some((alert) => alertSeverityRank(alert.severity) >= 3)) return 'risk';
  if ((diagnostics?.healthScore || 0) >= 92 && (item.romiPct || 0) >= 2 && (item.drrPct || 1) <= 0.3) return 'leader';
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

    item.cartRatePct = averageRate(item.carts, item.clicks);
    item.buyRatePct = averageRate(item.buys, item.clicks);
    item.buyoutPct = averageRate(item.buys, item.orders);

    if (sku) matchedItems.push(item);
    else unmatchedItems.push(item);
  });

  const baselines = buildBaselines(matchedItems);
  const alertCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    info: 0
  };

  matchedItems.forEach((item) => {
    item.diagnostics = buildDiagnostics(item, baselines);
    item.signal = resolveLeaderboardSignal(item, item.diagnostics);
    (item.diagnostics.alerts || []).forEach((alert) => {
      alertCounts[alert.severity] = numberOrZero(alertCounts[alert.severity]) + 1;
    });
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
    baselines,
    alertCounts,
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
