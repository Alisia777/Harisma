#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SOON_DAYS = 10;
const DEFAULT_WATCH_DAYS = 30;
const HISTORY_DAY_LIMIT = 370;
const ISSUE_STATE_LIMIT = 5000;
const SIGNAL_LIFECYCLE_KEYS = new Set(['active', 'new']);
const BLOCKED_LIFECYCLE_RE = /вывод|на вывод|вывед|сняти|снимаем|спа|spa|нет в спецификации|под вопрос|архив|archive|paused|pause|freeze|hold/i;

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
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

function resolveOptions(args) {
  const root = process.cwd();
  const inputDir = path.resolve(args['input-dir'] || path.join(root, 'data'));
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(root, 'data'));
  const outputDir = path.resolve(args['output-dir'] || inputDir);
  return {
    inputDir,
    baseDataDir,
    outputDir,
    mirrorLocalFallback: Boolean(args['mirror-local-fallback']),
    soonDays: positiveNumber(args['soon-days'], DEFAULT_SOON_DAYS),
    watchDays: positiveNumber(args['watch-days'], DEFAULT_WATCH_DAYS),
    now: args.now ? new Date(args.now) : new Date()
  };
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readLayer(options, fileName, fallback) {
  const outputPath = path.join(options.inputDir, fileName);
  const basePath = path.join(options.baseDataDir, fileName);
  const outputPayload = readJsonIfExists(outputPath);
  if (outputPayload !== null) return { payload: outputPayload, sourcePath: outputPath };
  const basePayload = readJsonIfExists(basePath);
  if (basePayload !== null) return { payload: basePayload, sourcePath: basePath };
  return { payload: fallback, sourcePath: '' };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function mirrorOutput(options, filePath) {
  if (!options.mirrorLocalFallback) return '';
  fs.mkdirSync(options.baseDataDir, { recursive: true });
  const targetPath = path.join(options.baseDataDir, path.basename(filePath));
  fs.copyFileSync(filePath, targetPath);
  return targetPath;
}

function publicSourcePath(filePath, options) {
  const raw = String(filePath || '').trim();
  if (!raw) return '';
  const normalized = path.resolve(raw);
  for (const baseDir of [options.inputDir, options.baseDataDir, process.cwd()]) {
    const relative = path.relative(baseDir, normalized);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative.split(path.sep).join('/');
    }
  }
  return path.basename(raw);
}

function numberOrZero(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateKey(value) {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizePlatform(value = '') {
  const raw = normalizeKey(value);
  if (['wb', 'wildberries', 'вб'].includes(raw)) return 'wb';
  if (['ozon', 'oz', 'озон'].includes(raw)) return 'ozon';
  if (['ym', 'ya', 'yandex', 'yandex_market', 'яндекс', 'я_маркет'].includes(raw)) return 'ya';
  if (['goldapple', 'ga', 'золотое_яблоко', 'зя'].includes(raw)) return 'goldapple';
  if (['letu', 'letual', 'летуаль'].includes(raw)) return 'letu';
  if (['megamarket', 'mega_market', 'мегамаркет'].includes(raw)) return 'megamarket';
  if (['samokat', 'самокат'].includes(raw)) return 'samokat';
  if (['magnit', 'magnitmarket', 'mm', 'магнит'].includes(raw)) return 'magnit';
  return raw || 'all';
}

function normalizeLifecycleText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ');
}

function lifecycleKeyFromText(value = '') {
  const raw = normalizeLifecycleText(value);
  if (!raw) return '';
  if (['active', 'actual', 'ok', 'актуально', 'актуальный', 'в работе', 'работает'].includes(raw) || /актуал|active/.test(raw)) return 'active';
  if (['new', 'launch', 'новинка', 'запуск'].includes(raw) || /новин|новый|\blaunch\b|запуск/.test(raw)) return 'new';
  if (['exit', 'вывод', 'выводится', 'на вывод', 'снимаем', 'снятие'].includes(raw) || /вывод|снимаем|снятие|exit|discontinu|sell.?out|clearance/.test(raw)) return 'exit';
  if (['archived', 'removed', 'выведен', 'выведено'].includes(raw) || /вывед|archiv|removed/.test(raw)) return 'archived';
  if (['paused', 'pause', 'freeze', 'hold', 'пауза', 'заморозка', 'стоп'].includes(raw) || /пауза|замороз|freeze|hold/.test(raw)) return 'paused';
  if (['question', 'review', 'под вопросом', 'перерабатываем', 'нет в спецификации'].includes(raw) || /вопрос|перераб|review|специф/.test(raw)) return 'question';
  return 'custom';
}

function lifecycleForSku(sku = {}) {
  const candidates = [
    ['status', sku?.status],
    ['lifecycleStatus', sku?.lifecycleStatus],
    ['lifecycle', sku?.lifecycle],
    ['productLifecycle', sku?.productLifecycle],
    ['registryStatus', sku?.registryStatus],
    ['owner.registryStatus', sku?.owner?.registryStatus]
  ];
  for (const [source, value] of candidates) {
    const label = String(value || '').trim();
    if (label && BLOCKED_LIFECYCLE_RE.test(normalizeLifecycleText(label))) {
      return { key: 'exit', label, source };
    }
  }
  for (const [source, value] of candidates) {
    const label = String(value || '').trim();
    if (!label) continue;
    const key = lifecycleKeyFromText(label);
    if (key) return { key, label, source };
  }
  return { key: 'unknown', label: '', source: '' };
}

function isSignalLifecycle(lifecycle = {}) {
  const text = normalizeLifecycleText([lifecycle.key, lifecycle.label].filter(Boolean).join(' '));
  return SIGNAL_LIFECYCLE_KEYS.has(lifecycle.key) && !BLOCKED_LIFECYCLE_RE.test(text);
}

function platformLabel(platform) {
  const key = normalizePlatform(platform);
  if (key === 'wb') return 'WB';
  if (key === 'ozon') return 'Ozon';
  if (key === 'ya') return 'Я.Маркет';
  if (key === 'goldapple') return 'Золотое яблоко';
  if (key === 'letu') return "Л'Этуаль";
  if (key === 'megamarket') return 'Мегамаркет';
  if (key === 'samokat') return 'Самокат';
  if (key === 'magnit') return 'Магнит';
  return String(platform || key || '').trim() || 'Площадка';
}

function skuOwnerForPlatform(sku = {}, platform = '') {
  const key = normalizePlatform(platform);
  const byPlatform = {
    ...(sku?.owner?.byPlatform || {}),
    ...(sku?.ownersByPlatform || {})
  };
  const platformOwner = key === 'ya' || key === 'ym'
    ? (byPlatform.ya || byPlatform.ym || '')
    : (byPlatform[key] || '');
  return String(platformOwner || sku?.owner?.name || '').trim();
}

function skuLookupScore(sku = {}) {
  let score = 0;
  const source = [sku?.matrixSource, sku?.owner?.source, sku?.ownerSource].filter(Boolean).join(' ');
  if (source.includes('ksenia-merged-statuses-minmax')) score += 1000;
  if (sku?.matrixImportedAt) score += 500;
  const article = String(sku?.articleKey || sku?.article || '').trim();
  if (article && !/_+$/.test(article)) score += 25;
  if (isSignalLifecycle(lifecycleForSku(sku))) score += 10;
  return score;
}

function addSkuLookup(lookup, key, sku) {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  const current = lookup.get(normalized);
  if (!current || skuLookupScore(sku) > skuLookupScore(current)) lookup.set(normalized, sku);
}

function buildSkuLookup(skus = []) {
  const lookup = new Map();
  (Array.isArray(skus) ? skus : []).forEach((sku) => {
    [
      sku?.articleKey,
      sku?.article,
      sku?.sourceArticleKey,
      sku?.sku,
      sku?.vendorCode,
      sku?.supplierArticle
    ].forEach((key) => addSkuLookup(lookup, key, sku));
  });
  return lookup;
}

function hashShort(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 14);
}

function daysBetween(left, right) {
  const leftDate = dateKey(left);
  const rightDate = dateKey(right);
  if (!leftDate || !rightDate) return 0;
  const leftStamp = Date.parse(`${leftDate}T00:00:00Z`);
  const rightStamp = Date.parse(`${rightDate}T00:00:00Z`);
  if (!Number.isFinite(leftStamp) || !Number.isFinite(rightStamp)) return 0;
  return Math.max(0, Math.floor((rightStamp - leftStamp) / 86400000));
}

function expectedFactDate(now) {
  const date = new Date(now.getTime());
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function latestPriceFromDaily(row = {}) {
  const daily = Array.isArray(row.daily) ? row.daily : [];
  const latest = daily
    .filter((point) => dateKey(point?.date))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))[0];
  return numberOrZero(latest?.price || latest?.clientPrice || latest?.revenue / Math.max(1, numberOrZero(latest?.ordersUnits)));
}

function buildPriceLookup(smartPriceOverlay, skus) {
  const lookup = new Map();
  const add = (platform, article, price, source) => {
    const key = `${normalizePlatform(platform)}|${normalizeKey(article)}`;
    const value = numberOrZero(price);
    if (!key.endsWith('|') && value > 0 && !lookup.has(key)) lookup.set(key, { price: value, source });
  };

  Object.entries(smartPriceOverlay?.platforms || {}).forEach(([platform, payload]) => {
    const rawRows = payload?.rows;
    const rows = Array.isArray(rawRows) ? rawRows : Object.values(rawRows || {});
    rows.forEach((row) => {
      const price = numberOrZero(row?.currentFillPrice)
        || numberOrZero(row?.currentPrice)
        || numberOrZero(row?.currentClientPrice)
        || latestPriceFromDaily(row);
      add(platform, row?.articleKey || row?.article, price, 'smart_price_overlay');
    });
  });

  (Array.isArray(skus) ? skus : []).forEach((sku) => {
    add('wb', sku?.articleKey || sku?.article, sku?.wb?.currentPrice || sku?.wb?.recPrice, 'skus.wb');
    add('ozon', sku?.articleKey || sku?.article, sku?.ozon?.currentPrice || sku?.ozon?.recPrice, 'skus.ozon');
    const orderPrice = numberOrZero(sku?.orders?.value) / Math.max(1, numberOrZero(sku?.orders?.units));
    add('all', sku?.articleKey || sku?.article, orderPrice, 'skus.orders');
  });

  return lookup;
}

function priceForRow(row, priceLookup) {
  const article = normalizeKey(row?.article || row?.articleKey || row?.sku);
  const platform = normalizePlatform(row?.platform);
  return priceLookup.get(`${platform}|${article}`)
    || priceLookup.get(`all|${article}`)
    || { price: 0, source: '' };
}

function inferDepartment(row, status) {
  if (status === 'oos') return 'Маркетплейс / логистика';
  if (numberOrZero(row?.inTransit) > 0) return 'Логистика';
  if (numberOrZero(row?.inRequest) > 0) return 'Закуп';
  if (numberOrZero(row?.targetNeed14) > 0 || numberOrZero(row?.targetNeed30 ?? row?.targetNeed28) > 0) return 'Закуп';
  return 'Команда MP';
}

function recommendationFor(row, status) {
  const platform = platformLabel(row?.platform);
  const place = String(row?.place || '').trim() || 'склад';
  if (status === 'oos') {
    return `Проверить остаток ${platform} / ${place}, восстановить наличие или зафиксировать причину простоя.`;
  }
  if (numberOrZero(row?.inTransit) > 0) {
    return `Ускорить поставку на ${platform} / ${place} и проверить дату приемки.`;
  }
  if (numberOrZero(row?.inRequest) > 0) {
    return `Проконтролировать заказ поставщику и срок отгрузки для ${platform} / ${place}.`;
  }
  return `Сформировать контрмеру по остатку ${platform} / ${place}: заказ, перемещение или лимит продаж.`;
}

function classifyRow(row, rules, lifecycle) {
  if (!isSignalLifecycle(lifecycle)) return null;

  const inStock = numberOrZero(row?.inStock);
  const avgDaily = numberOrZero(row?.avgDaily);
  const turnoverDays = finiteOrNull(row?.turnoverDays);
  const targetNeed30 = numberOrZero(row?.targetNeed30 ?? row?.targetNeed28);

  if (inStock <= 0 && avgDaily > 0) {
    return { status: 'oos', severity: 'critical', statusLabel: 'OOS', rank: 4, signalRule: 'oos_now_active_or_new' };
  }
  if (turnoverDays !== null && turnoverDays > 0 && turnoverDays < rules.soonDays) {
    return { status: 'risk', severity: 'high', statusLabel: `OOS скоро <${rules.soonDays} д`, rank: 2, signalRule: 'oos_soon_turnover_active_or_new' };
  }
  if ((turnoverDays !== null && turnoverDays > 0 && turnoverDays < rules.watchDays) || targetNeed30 > 0) {
    return { status: 'watch', severity: 'medium', statusLabel: `Контроль запаса <${rules.watchDays} д`, rank: 1, signalRule: 'oos_watch_turnover_active_or_new' };
  }
  return null;
}

function buildRowsLegacy(orderProcurement, skus, smartPriceOverlay, rules) {
  const priceLookup = buildPriceLookup(smartPriceOverlay, skus);
  const skuByKey = buildSkuLookup(skus);
  const sourceRows = Array.isArray(orderProcurement?.rows) ? orderProcurement.rows : [];

  return sourceRows
    .map((row) => {
      const article = String(row?.article || row?.articleKey || row?.sku || '').trim();
      const articleKey = normalizeKey(article);
      if (!articleKey) return null;
      const sku = skuByKey.get(articleKey) || {};
      const lifecycle = lifecycleForSku(sku);
      const classification = classifyRow(row, rules, lifecycle);
      if (!classification) return null;
      const platform = normalizePlatform(row?.platform);
      const platformTitle = platformLabel(platform);
      const place = String(row?.place || '').trim() || 'Без склада';
      const issueKey = `${platform}|${normalizeKey(place)}|${articleKey}`;
      const price = priceForRow(row, priceLookup);
      const avgDaily = numberOrZero(row?.avgDaily);
      const lostRevenueDay = classification.status === 'oos' ? avgDaily * price.price : 0;
      const revenueAtRiskDay = avgDaily * price.price;
      const department = inferDepartment(row, classification.status);
      return {
        issueKey,
        taskId: `task-oos-${hashShort(issueKey)}`,
        platform,
        platformLabel: platformTitle,
        place,
        article,
        articleKey: article,
        name: String(row?.name || sku?.name || article).trim() || article,
        owner: skuOwnerForPlatform(sku, platform) || String(row?.owner || '').trim() || 'Без owner',
        department,
        status: classification.status,
        statusLabel: classification.statusLabel,
        severity: classification.severity,
        rank: classification.rank,
        signalRule: classification.signalRule,
        lifecycleStatus: lifecycle.key,
        lifecycleLabel: lifecycle.label || lifecycle.key,
        lifecycleSource: lifecycle.source,
        inStock: Math.round(numberOrZero(row?.inStock)),
        inTransit: Math.round(numberOrZero(row?.inTransit)),
        inRequest: Math.round(numberOrZero(row?.inRequest)),
        available: Math.round(numberOrZero(row?.available ?? (numberOrZero(row?.inStock) + numberOrZero(row?.inTransit) + numberOrZero(row?.inRequest)))),
        safetyStock: Math.round(numberOrZero(row?.safetyStock)),
        avgDaily: Number(avgDaily.toFixed(4)),
        turnoverDays: finiteOrNull(row?.turnoverDays),
        sales7: Number(numberOrZero(row?.sales7).toFixed(2)),
        sales14: Number(numberOrZero(row?.sales14).toFixed(2)),
        sales28: Number(numberOrZero(row?.sales28).toFixed(2)),
        sales30: Number(numberOrZero(row?.sales30).toFixed(2)),
        rawNeed30: Math.round(numberOrZero(row?.rawNeed30 ?? row?.targetNeed30 ?? row?.targetNeed28)),
        targetNeed7: Math.round(numberOrZero(row?.targetNeed7)),
        targetNeed14: Math.round(numberOrZero(row?.targetNeed14)),
        targetNeed28: Math.round(numberOrZero(row?.targetNeed28)),
        targetNeed30: Math.round(numberOrZero(row?.targetNeed30 ?? row?.targetNeed28)),
        targetHorizonDays: numberOrZero(row?.targetHorizonDays) || 30,
        averagePrice: Math.round(price.price),
        priceSource: price.source,
        lostRevenueDay: Math.round(lostRevenueDay),
        revenueAtRiskDay: Math.round(revenueAtRiskDay),
        recommendation: recommendationFor(row, classification.status)
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.rank - left.rank
      || right.revenueAtRiskDay - left.revenueAtRiskDay
      || left.platformLabel.localeCompare(right.platformLabel, 'ru')
      || left.place.localeCompare(right.place, 'ru')
    ));
}

function signalIssueKey(platform, signalRule, articleKey) {
  return `${normalizePlatform(platform)}|${signalRule}|${normalizeKey(articleKey)}`;
}

function compactPlaceLabel(places, rules, status = '') {
  const rows = Array.isArray(places) ? places : [];
  if (rows.length <= 1) return rows[0]?.place || 'Без склада';
  const threshold = status === 'watch' ? rules.watchDays : rules.soonDays;
  return `${rows.length} кластеров <${threshold} д`;
}

function topPlaceNames(places, limit = 4) {
  return (Array.isArray(places) ? places : [])
    .slice()
    .sort((left, right) => numberOrZero(right.revenueAtRiskDay) - numberOrZero(left.revenueAtRiskDay))
    .map((item) => item.place)
    .filter(Boolean)
    .slice(0, limit)
    .join(', ');
}

function recommendationForAggregate(row, rules) {
  const platform = platformLabel(row?.platform);
  const places = Array.isArray(row?.placesAtRisk) ? row.placesAtRisk : [];
  const placeText = topPlaceNames(places) || row?.place || 'кластер';
  const minDays = finiteOrNull(row?.turnoverDays);
  if (row.status === 'oos') {
    return `Проверить ${platform}: есть OOS по ${places.length || 1} кластеру(ам). Восстановить наличие или зафиксировать причину простоя.`;
  }
  const threshold = row.status === 'watch' ? rules.watchDays : rules.soonDays;
  const prefix = row.status === 'watch' ? 'Поставить в контроль' : 'Проверить';
  return `${prefix} ${platform}: ${places.length || 1} кластер(ов) с покрытием меньше ${threshold} дней (${placeText}). Минимальное покрытие ${minDays === null ? '—' : `${minDays.toFixed(1)} д`}; нужен срок поставки, перемещение или лимит продаж.`;
}

function aggregateSignalRows(rawRows, rules) {
  const groups = new Map();
  rawRows.forEach((row) => {
    const key = signalIssueKey(row.platform, row.signalRule, row.articleKey);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return [...groups.entries()].map(([issueKey, groupRows]) => {
    const rows = groupRows.slice().sort((left, right) =>
      right.rank - left.rank
      || numberOrZero(right.revenueAtRiskDay) - numberOrZero(left.revenueAtRiskDay)
      || String(left.place || '').localeCompare(String(right.place || ''), 'ru')
    );
    const base = rows[0] || {};
    const avgDaily = rows.reduce((sum, row) => sum + numberOrZero(row.avgDaily), 0);
    const weightedPrice = rows.reduce((sum, row) => sum + numberOrZero(row.averagePrice) * numberOrZero(row.avgDaily), 0) / Math.max(1, avgDaily);
    const placesAtRisk = rows.map((row) => ({
      place: row.place,
      inStock: row.inStock,
      inTransit: row.inTransit,
      inRequest: row.inRequest,
      available: row.available,
      avgDaily: row.avgDaily,
      turnoverDays: row.turnoverDays,
      targetNeed30: row.targetNeed30,
      revenueAtRiskDay: row.revenueAtRiskDay,
      lostRevenueDay: row.lostRevenueDay
    }));
    const aggregate = {
      ...base,
      issueKey,
      taskId: `task-oos-${hashShort(issueKey)}`,
      place: compactPlaceLabel(placesAtRisk, rules, base.status),
      clusterCount: placesAtRisk.length,
      placesAtRisk,
      inStock: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.inStock), 0)),
      inTransit: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.inTransit), 0)),
      inRequest: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.inRequest), 0)),
      available: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.available), 0)),
      avgDaily: Number(avgDaily.toFixed(4)),
      turnoverDays: rows.reduce((min, row) => {
        const days = finiteOrNull(row.turnoverDays);
        if (days === null) return min;
        return min === null ? days : Math.min(min, days);
      }, null),
      sales7: Number(rows.reduce((sum, row) => sum + numberOrZero(row.sales7), 0).toFixed(2)),
      sales14: Number(rows.reduce((sum, row) => sum + numberOrZero(row.sales14), 0).toFixed(2)),
      sales28: Number(rows.reduce((sum, row) => sum + numberOrZero(row.sales28), 0).toFixed(2)),
      sales30: Number(rows.reduce((sum, row) => sum + numberOrZero(row.sales30), 0).toFixed(2)),
      rawNeed30: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.rawNeed30), 0)),
      targetNeed7: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.targetNeed7), 0)),
      targetNeed14: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.targetNeed14), 0)),
      targetNeed28: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.targetNeed28), 0)),
      targetNeed30: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.targetNeed30), 0)),
      targetHorizonDays: 30,
      averagePrice: Math.round(weightedPrice || numberOrZero(base.averagePrice)),
      lostRevenueDay: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.lostRevenueDay), 0)),
      revenueAtRiskDay: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.revenueAtRiskDay), 0))
    };
    aggregate.department = inferDepartment(aggregate, aggregate.status);
    aggregate.recommendation = recommendationForAggregate(aggregate, rules);
    return aggregate;
  }).sort((left, right) => (
    right.rank - left.rank
    || right.revenueAtRiskDay - left.revenueAtRiskDay
    || left.platformLabel.localeCompare(right.platformLabel, 'ru')
    || left.article.localeCompare(right.article, 'ru')
  ));
}

function buildRows(orderProcurement, skus, smartPriceOverlay, rules) {
  const priceLookup = buildPriceLookup(smartPriceOverlay, skus);
  const skuByKey = buildSkuLookup(skus);
  const sourceRows = Array.isArray(orderProcurement?.rows) ? orderProcurement.rows : [];

  const rawRows = sourceRows
    .map((row) => {
      const article = String(row?.article || row?.articleKey || row?.sku || '').trim();
      const articleKey = normalizeKey(article);
      if (!articleKey) return null;
      const sku = skuByKey.get(articleKey) || {};
      const lifecycle = lifecycleForSku(sku);
      const classification = classifyRow(row, rules, lifecycle);
      if (!classification) return null;
      const platform = normalizePlatform(row?.platform);
      const platformTitle = platformLabel(platform);
      const place = String(row?.place || '').trim() || 'Без склада';
      const issueKey = signalIssueKey(platform, classification.signalRule, articleKey);
      const price = priceForRow(row, priceLookup);
      const avgDaily = numberOrZero(row?.avgDaily);
      const lostRevenueDay = classification.status === 'oos' ? avgDaily * price.price : 0;
      const revenueAtRiskDay = avgDaily * price.price;
      const department = inferDepartment(row, classification.status);
      return {
        issueKey,
        taskId: `task-oos-${hashShort(issueKey)}`,
        platform,
        platformLabel: platformTitle,
        place,
        article,
        articleKey,
        name: String(row?.name || sku?.name || article).trim() || article,
        owner: skuOwnerForPlatform(sku, platform) || String(row?.owner || '').trim() || 'Без owner',
        department,
        status: classification.status,
        statusLabel: classification.statusLabel,
        severity: classification.severity,
        rank: classification.rank,
        signalRule: classification.signalRule,
        lifecycleStatus: lifecycle.key,
        lifecycleLabel: lifecycle.label || lifecycle.key,
        lifecycleSource: lifecycle.source,
        inStock: Math.round(numberOrZero(row?.inStock)),
        inTransit: Math.round(numberOrZero(row?.inTransit)),
        inRequest: Math.round(numberOrZero(row?.inRequest)),
        available: Math.round(numberOrZero(row?.available ?? (numberOrZero(row?.inStock) + numberOrZero(row?.inTransit) + numberOrZero(row?.inRequest)))),
        safetyStock: Math.round(numberOrZero(row?.safetyStock)),
        avgDaily: Number(avgDaily.toFixed(4)),
        turnoverDays: finiteOrNull(row?.turnoverDays),
        sales7: Number(numberOrZero(row?.sales7).toFixed(2)),
        sales14: Number(numberOrZero(row?.sales14).toFixed(2)),
        sales28: Number(numberOrZero(row?.sales28).toFixed(2)),
        sales30: Number(numberOrZero(row?.sales30).toFixed(2)),
        rawNeed30: Math.round(numberOrZero(row?.rawNeed30 ?? row?.targetNeed30 ?? row?.targetNeed28)),
        targetNeed7: Math.round(numberOrZero(row?.targetNeed7)),
        targetNeed14: Math.round(numberOrZero(row?.targetNeed14)),
        targetNeed28: Math.round(numberOrZero(row?.targetNeed28)),
        targetNeed30: Math.round(numberOrZero(row?.targetNeed30 ?? row?.targetNeed28)),
        targetHorizonDays: numberOrZero(row?.targetHorizonDays) || 30,
        averagePrice: Math.round(price.price),
        priceSource: price.source,
        lostRevenueDay: Math.round(lostRevenueDay),
        revenueAtRiskDay: Math.round(revenueAtRiskDay),
        recommendation: recommendationFor(row, classification.status)
      };
    })
    .filter(Boolean);

  return aggregateSignalRows(rawRows, rules);
}

function summarizeGroup(rows, keyFn, labelFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: labelFn ? labelFn(row, key) : key,
        total: 0,
        oos: 0,
        critical: 0,
        risk: 0,
        watch: 0,
        lostRevenueDay: 0,
        revenueAtRiskDay: 0
      });
    }
    const item = map.get(key);
    item.total += 1;
    if (row.status === 'oos') item.oos += 1;
    if (row.severity === 'critical') item.critical += 1;
    if (row.status === 'risk') item.risk += 1;
    if (row.status === 'watch') item.watch += 1;
    item.lostRevenueDay += numberOrZero(row.lostRevenueDay);
    item.revenueAtRiskDay += numberOrZero(row.revenueAtRiskDay);
  });
  return [...map.values()]
    .map((item) => ({
      ...item,
      lostRevenueDay: Math.round(item.lostRevenueDay),
      revenueAtRiskDay: Math.round(item.revenueAtRiskDay)
    }))
    .sort((left, right) => right.revenueAtRiskDay - left.revenueAtRiskDay || right.total - left.total);
}

function isLegacySoonThresholdState(state, rules) {
  if (Number(rules?.soonDays) === 10) return false;
  const text = [
    state?.place,
    state?.statusLabel,
    state?.recommendation
  ].filter(Boolean).join(' ');
  return /<10\s*д/.test(text);
}

function applyHistory(rows, previousPayload, today, rules) {
  const previousStates = new Map(
    (Array.isArray(previousPayload?.history?.issueStates) ? previousPayload.history.issueStates : [])
      .map((item) => [String(item.issueKey || ''), item])
      .filter(([key]) => key)
  );
  let newIssues = 0;
  let reopenedIssues = 0;
  const activeKeys = new Set(rows.map((row) => row.issueKey));

  rows.forEach((row) => {
    const previous = previousStates.get(row.issueKey);
    const wasResolved = Boolean(previous?.resolvedDate);
    const firstSeenDate = wasResolved || !previous?.firstSeenDate ? today : previous.firstSeenDate;
    const daysOpen = daysBetween(firstSeenDate, today) + 1;
    row.firstSeenDate = firstSeenDate;
    row.lastSeenDate = today;
    row.daysOpen = daysOpen;
    row.isNew = !previous;
    row.isReopened = Boolean(previous && wasResolved);
    if (row.isNew) newIssues += 1;
    if (row.isReopened) reopenedIssues += 1;
  });

  const resolvedToday = [];
  previousStates.forEach((previous, issueKey) => {
    if (activeKeys.has(issueKey) || previous?.resolvedDate) return;
    resolvedToday.push({
      ...previous,
      resolvedDate: today
    });
  });

  const currentStates = rows.map((row) => ({
    issueKey: row.issueKey,
    taskId: row.taskId,
    platform: row.platform,
    platformLabel: row.platformLabel,
    place: row.place,
    article: row.article,
    name: row.name,
    owner: row.owner,
    department: row.department,
    status: row.status,
    severity: row.severity,
    firstSeenDate: row.firstSeenDate,
    lastSeenDate: today,
    daysOpen: row.daysOpen,
    resolvedDate: ''
  }));

  const closedStates = [
    ...resolvedToday,
    ...[...previousStates.values()].filter((item) => item?.resolvedDate && !activeKeys.has(item.issueKey))
  ]
    .filter((item) => !isLegacySoonThresholdState(item, rules))
    .sort((left, right) => String(right.resolvedDate || right.lastSeenDate || '').localeCompare(String(left.resolvedDate || left.lastSeenDate || '')))
    .slice(0, Math.max(0, ISSUE_STATE_LIMIT - currentStates.length));

  return {
    rows,
    newIssues,
    reopenedIssues,
    resolvedToday: resolvedToday.length,
    issueStates: [...currentStates, ...closedStates].slice(0, ISSUE_STATE_LIMIT)
  };
}

function buildSummary(rows, historyResult, freshnessStatus, previousPayload, today) {
  const dailySummary = {
    date: today,
    totalIssues: rows.length,
    oosCount: rows.filter((row) => row.status === 'oos').length,
    criticalCount: rows.filter((row) => row.severity === 'critical').length,
    riskCount: rows.filter((row) => row.status === 'risk').length,
    oosSoonCount: rows.filter((row) => row.signalRule === 'oos_soon_turnover_active_or_new').length,
    watchCount: rows.filter((row) => row.status === 'watch').length,
    placeCount: rows.reduce((sum, row) => sum + Math.max(1, Math.round(numberOrZero(row.clusterCount || 1))), 0),
    lostRevenueDay: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.lostRevenueDay), 0)),
    revenueAtRiskDay: Math.round(rows.reduce((sum, row) => sum + numberOrZero(row.revenueAtRiskDay), 0))
  };

  const previousDays = Array.isArray(previousPayload?.history?.days) ? previousPayload.history.days : [];
  const days = [
    ...previousDays.filter((item) => item?.date && item.date !== today),
    dailySummary
  ]
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .slice(-HISTORY_DAY_LIMIT);
  const monthKey = today.slice(0, 7);
  const monthDays = days.filter((item) => String(item.date || '').startsWith(monthKey));
  const lostRevenueMonth = Math.round(monthDays.reduce((sum, item) => sum + numberOrZero(item.lostRevenueDay), 0));
  const revenueAtRiskMonth = Math.round(monthDays.reduce((sum, item) => sum + numberOrZero(item.revenueAtRiskDay), 0));

  return {
    dailySummary,
    days,
    summary: {
      ...dailySummary,
      monthKey,
      lostRevenueMonth,
      revenueAtRiskMonth,
      newIssues: historyResult.newIssues,
      reopenedIssues: historyResult.reopenedIssues,
      resolvedToday: historyResult.resolvedToday,
      owners: new Set(rows.map((row) => row.owner).filter(Boolean)).size,
      skuCount: new Set(rows.map((row) => row.articleKey).filter(Boolean)).size,
      placeCount: rows.reduce((sum, row) => sum + Math.max(1, Math.round(numberOrZero(row.clusterCount || 1))), 0),
      dataStatus: freshnessStatus.status,
      dataDate: freshnessStatus.dataDate,
      expectedFactDate: freshnessStatus.expectedFactDate
    }
  };
}

function buildFreshness(options, orderProcurement, syncHealth, dataQuality) {
  const expected = expectedFactDate(options.now);
  const dataDate = dateKey(syncHealth?.freshness?.maxDate)
    || dateKey(dataQuality?.summary?.maxDate)
    || dateKey(orderProcurement?.window?.to)
    || dateKey(orderProcurement?.generatedAt);
  const sourceGeneratedAt = orderProcurement?.generatedAt || '';
  const stale = Boolean(dataDate && dataDate < expected);
  const status = !dataDate ? 'unknown' : stale ? 'stale' : 'ok';
  return {
    status,
    dataDate,
    expectedFactDate: expected,
    sourceGeneratedAt,
    message: !dataDate
      ? 'Портал не смог определить дату факта.'
      : stale
        ? `Данные отстают: факт до ${dataDate}, ожидается минимум ${expected}.`
        : `Данные свежие: факт до ${dataDate}.`
  };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const orderLayer = readLayer(options, 'order_procurement.json', { generatedAt: '', rows: [], window: {} });
  const skusLayer = readLayer(options, 'skus.json', []);
  const smartPriceLayer = readLayer(options, 'smart_price_overlay.json', { generatedAt: '', platforms: {} });
  const syncHealthLayer = readLayer(options, 'portal_sync_health.json', {});
  const qualityLayer = readLayer(options, 'portal_data_quality.json', {});
  const previousLayer = readLayer(options, 'oos_control.json', null);

  const rules = {
    soonDays: options.soonDays,
    watchDays: options.watchDays,
    lifecycle: [...SIGNAL_LIFECYCLE_KEYS]
  };
  const today = options.now.toISOString().slice(0, 10);
  const rows = buildRows(orderLayer.payload, skusLayer.payload, smartPriceLayer.payload, rules);
  const freshnessStatus = buildFreshness(options, orderLayer.payload, syncHealthLayer.payload, qualityLayer.payload);
  const previousPayload = previousLayer.payload?.schema === 'portal-oos-control-v2' ? previousLayer.payload : {};
  const historyResult = applyHistory(rows, previousPayload, today, rules);
  const { summary, dailySummary, days } = buildSummary(historyResult.rows, historyResult, freshnessStatus, previousPayload, today);

  const payload = {
    schema: 'portal-oos-control-v2',
    generatedAt: new Date().toISOString(),
    title: 'OOS / stock auto signals',
    rules,
    dataFreshness: {
      ...freshnessStatus,
      orderProcurementGeneratedAt: orderLayer.payload?.generatedAt || '',
      orderWindow: orderLayer.payload?.window || {},
      smartPriceGeneratedAt: smartPriceLayer.payload?.generatedAt || '',
      sources: {
        orderProcurement: publicSourcePath(orderLayer.sourcePath, options),
        skus: publicSourcePath(skusLayer.sourcePath, options),
        smartPriceOverlay: publicSourcePath(smartPriceLayer.sourcePath, options),
        syncHealth: publicSourcePath(syncHealthLayer.sourcePath, options),
        portalDataQuality: publicSourcePath(qualityLayer.sourcePath, options)
      }
    },
    summary,
    byPlatform: summarizeGroup(historyResult.rows, (row) => row.platform, (row) => row.platformLabel),
    byOwner: summarizeGroup(historyResult.rows, (row) => row.owner, (row) => row.owner),
    byDepartment: summarizeGroup(historyResult.rows, (row) => row.department, (row) => row.department),
    rows: historyResult.rows,
    history: {
      days,
      latest: dailySummary,
      issueStates: historyResult.issueStates
    }
  };

  const outputPath = path.join(options.outputDir, 'oos_control.json');
  writeJson(outputPath, payload);
  const mirrored = mirrorOutput(options, outputPath);
  console.log(JSON.stringify({
    generatedAt: payload.generatedAt,
    rows: payload.rows.length,
    oos: payload.summary.oosCount,
    critical: payload.summary.criticalCount,
    risk: payload.summary.riskCount,
    watch: payload.summary.watchCount,
    dataStatus: payload.summary.dataStatus,
    outputPath,
    mirrored
  }, null, 2));
}

main();
