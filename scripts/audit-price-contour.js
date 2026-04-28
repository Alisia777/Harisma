const path = require('path');
const {
  asIsoDate,
  firstNumber,
  firstPositive,
  latestSeriesDate,
  mergeSmartPriceContour,
  parseFreshStamp,
  rowIndex,
  safeReadJson,
  shouldUseLiveWorkbench
} = require('./smart-price-contour');

const ROOT = process.cwd();
const DEFAULT_FILES = {
  prices: path.join(ROOT, 'data', 'prices.json'),
  workbench: path.join(ROOT, 'data', 'smart_price_workbench.json'),
  overlay: path.join(ROOT, 'data', 'smart_price_overlay.json'),
  live: path.join(ROOT, 'tmp-smart_price_workbench-live.json')
};

function normalizePlatformKey(platform = '') {
  if (platform === 'ya' || platform === 'ym') return 'ym';
  return platform;
}

function normalizeIndexPlatforms(index = {}) {
  const normalized = {};
  Object.entries(index).forEach(([platform, map]) => {
    const targetKey = normalizePlatformKey(platform);
    if (!normalized[targetKey]) normalized[targetKey] = new Map();
    map.forEach((row, key) => {
      if (!normalized[targetKey].has(key)) normalized[targetKey].set(key, row);
    });
  });
  return normalized;
}

function compareMetrics(pricesRow, mergedRow) {
  const pricesPrice = firstPositive(pricesRow?.currentPrice, pricesRow?.currentFillPrice);
  const mergedPrice = firstPositive(mergedRow?.currentFillPrice, mergedRow?.currentPrice);
  const pricesClient = firstPositive(pricesRow?.currentClientPrice);
  const mergedClient = firstPositive(mergedRow?.currentClientPrice);
  const pricesTurnover = firstNumber(pricesRow?.currentTurnoverDays, pricesRow?.turnoverDays);
  const mergedTurnover = firstNumber(mergedRow?.currentTurnoverDays, mergedRow?.turnoverCurrentDays, mergedRow?.turnoverDays);
  const pricesDate = latestSeriesDate(pricesRow) || asIsoDate(pricesRow?.generatedAt || '');
  const mergedDate = latestSeriesDate(mergedRow) || asIsoDate(mergedRow?.generatedAt || '');

  return {
    pricesPrice,
    mergedPrice,
    pricesClient,
    mergedClient,
    pricesTurnover,
    mergedTurnover,
    pricesDate,
    mergedDate,
    priceDelta: pricesPrice !== null && mergedPrice !== null ? mergedPrice - pricesPrice : null,
    clientDelta: pricesClient !== null && mergedClient !== null ? mergedClient - pricesClient : null,
    turnoverDelta: pricesTurnover !== null && mergedTurnover !== null ? mergedTurnover - pricesTurnover : null
  };
}

function formatDateTime(value) {
  const stamp = parseFreshStamp(value);
  if (!stamp) return '—';
  return new Date(stamp).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' });
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value));
}

function buildAudit() {
  const prices = safeReadJson(DEFAULT_FILES.prices, { generatedAt: '', platforms: {} });
  const workbench = safeReadJson(DEFAULT_FILES.workbench, { generatedAt: '', platforms: {} });
  const overlay = safeReadJson(DEFAULT_FILES.overlay, { generatedAt: '', platforms: {} });
  const live = safeReadJson(DEFAULT_FILES.live, { generatedAt: '', platforms: {} });
  const mergedWorkbench = mergeSmartPriceContour(workbench || {}, overlay || {}, live || {});

  const priceIndex = normalizeIndexPlatforms(rowIndex(prices));
  const mergedIndex = normalizeIndexPlatforms(rowIndex(mergedWorkbench));
  const platforms = new Set([
    ...Object.keys(priceIndex),
    ...Object.keys(mergedIndex)
  ]);

  const summary = [];
  const mismatches = [];

  platforms.forEach((platform) => {
    const pricesMap = priceIndex[platform] || new Map();
    const mergedMap = mergedIndex[platform] || new Map();
    const keys = new Set([...pricesMap.keys(), ...mergedMap.keys()]);
    const platformSummary = {
      platform,
      totalSku: keys.size,
      priceMismatch: 0,
      clientMismatch: 0,
      turnoverMismatch: 0,
      staleDate: 0,
      missingMergedPrice: 0,
      missingPriceLayerPrice: 0
    };

    keys.forEach((key) => {
      const pricesRow = pricesMap.get(key) || null;
      const mergedRow = mergedMap.get(key) || null;
      const metrics = compareMetrics(pricesRow, mergedRow);
      if (metrics.mergedPrice === null) platformSummary.missingMergedPrice += 1;
      if (metrics.pricesPrice === null) platformSummary.missingPriceLayerPrice += 1;
      if (metrics.priceDelta !== null && Math.abs(metrics.priceDelta) >= 1) platformSummary.priceMismatch += 1;
      if (metrics.clientDelta !== null && Math.abs(metrics.clientDelta) >= 1) platformSummary.clientMismatch += 1;
      if (metrics.turnoverDelta !== null && Math.abs(metrics.turnoverDelta) >= 0.1) platformSummary.turnoverMismatch += 1;
      if (metrics.mergedDate && metrics.pricesDate && metrics.mergedDate > metrics.pricesDate) platformSummary.staleDate += 1;

      if (
        (metrics.priceDelta !== null && Math.abs(metrics.priceDelta) >= 1)
        || (metrics.clientDelta !== null && Math.abs(metrics.clientDelta) >= 1)
        || (metrics.turnoverDelta !== null && Math.abs(metrics.turnoverDelta) >= 0.1)
      ) {
        mismatches.push({
          platform,
          article: mergedRow?.articleKey || mergedRow?.article || pricesRow?.articleKey || pricesRow?.article || key,
          name: mergedRow?.name || pricesRow?.name || '',
          pricesPrice: metrics.pricesPrice,
          mergedPrice: metrics.mergedPrice,
          priceDelta: metrics.priceDelta,
          pricesClient: metrics.pricesClient,
          mergedClient: metrics.mergedClient,
          clientDelta: metrics.clientDelta,
          pricesTurnover: metrics.pricesTurnover,
          mergedTurnover: metrics.mergedTurnover,
          turnoverDelta: metrics.turnoverDelta,
          pricesDate: metrics.pricesDate,
          mergedDate: metrics.mergedDate,
          sourceMode: mergedRow?.sourceMode || '',
          overlayValueDate: asIsoDate(mergedRow?.valueDate || mergedRow?.historyFreshnessDate || '')
        });
      }
    });

    summary.push(platformSummary);
  });

  mismatches.sort((left, right) => Math.abs(right.priceDelta || 0) - Math.abs(left.priceDelta || 0)
    || Math.abs(right.clientDelta || 0) - Math.abs(left.clientDelta || 0));

  return {
    generatedAt: new Date().toISOString(),
    files: {
      prices: { path: DEFAULT_FILES.prices, generatedAt: prices?.generatedAt || '' },
      workbench: { path: DEFAULT_FILES.workbench, generatedAt: workbench?.generatedAt || '' },
      overlay: { path: DEFAULT_FILES.overlay, generatedAt: overlay?.generatedAt || '' },
      live: { path: DEFAULT_FILES.live, generatedAt: live?.generatedAt || '' },
      mergedWorkbench: { generatedAt: mergedWorkbench?.generatedAt || '' }
    },
    liveAccepted: shouldUseLiveWorkbench(workbench || {}, live || {}),
    summary,
    topMismatches: mismatches.slice(0, 30)
  };
}

function renderMarkdown(audit) {
  const lines = [];
  lines.push('# Аудит ценового контура');
  lines.push('');
  lines.push(`Собрано: ${formatDateTime(audit.generatedAt)}`);
  lines.push('');
  lines.push('## Свежесть слоёв');
  lines.push('');
  lines.push('| Слой | generatedAt |');
  lines.push('| --- | --- |');
  Object.entries(audit.files).forEach(([key, meta]) => {
    lines.push(`| ${key} | ${meta.generatedAt ? `${meta.generatedAt} (${formatDateTime(meta.generatedAt)})` : '—'} |`);
  });
  lines.push('');
  lines.push(`Использовать \`tmp-smart_price_workbench-live.json\`: **${audit.liveAccepted ? 'да' : 'нет'}**`);
  lines.push('');
  lines.push('## Сводка по площадкам');
  lines.push('');
  lines.push('| Площадка | SKU | Расхождение цены | Расхождение клиента | Расхождение оборач. | Более свежая дата в merged | Нет цены в merged | Нет цены в prices |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  audit.summary.forEach((row) => {
    lines.push(`| ${row.platform} | ${row.totalSku} | ${row.priceMismatch} | ${row.clientMismatch} | ${row.turnoverMismatch} | ${row.staleDate} | ${row.missingMergedPrice} | ${row.missingPriceLayerPrice} |`);
  });
  lines.push('');
  lines.push('## Топ расхождений');
  lines.push('');
  lines.push('| Площадка | Артикул | Цена prices | Цена merged | Δ цена | Клиент prices | Клиент merged | Δ клиент | Дата prices | Дата merged | sourceMode |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |');
  audit.topMismatches.forEach((row) => {
    lines.push(`| ${row.platform} | ${row.article} | ${formatMoney(row.pricesPrice)} | ${formatMoney(row.mergedPrice)} | ${formatMoney(row.priceDelta)} | ${formatMoney(row.pricesClient)} | ${formatMoney(row.mergedClient)} | ${formatMoney(row.clientDelta)} | ${row.pricesDate || '—'} | ${row.mergedDate || '—'} | ${row.sourceMode || '—'} |`);
  });
  lines.push('');
  lines.push('## Контуры риска');
  lines.push('');
  lines.push('- `Цены`: legacy `data/prices.json` уже можно использовать как совместимый fallback, но источником истины для развития всё равно должен оставаться merged-контур.');
  lines.push('- `Дашборд`: карточки и деталка цен должны жить на том же merged workbench, иначе одна SKU снова разойдётся между экранами.');
  lines.push('- `Репрайсер`: значения `currentPrice/currentClientPrice/turnoverDays` чувствительны к stale live-слою и требуют того же freshness-gate.');
  lines.push('- `Новые экраны`: любой новый view, который читает `prices.json` напрямую, должен получать уже rebuilt legacy-слой, а не старый мартовский snapshot.');
  lines.push('');
  return lines.join('\n');
}

const audit = buildAudit();
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(audit, null, 2));
} else {
  process.stdout.write(renderMarkdown(audit));
}
