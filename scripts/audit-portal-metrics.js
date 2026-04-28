#!/usr/bin/env node

const path = require('path');
const {
  asIsoDate,
  firstNumber,
  firstPositive,
  mergeSmartPriceContour,
  parseFreshStamp,
  safeReadJson
} = require('./smart-price-contour');

const ROOT = process.cwd();
const FILES = {
  workbench: path.join(ROOT, 'data', 'smart_price_workbench.json'),
  overlay: path.join(ROOT, 'data', 'smart_price_overlay.json'),
  live: path.join(ROOT, 'tmp-smart_price_workbench-live.json'),
  prices: path.join(ROOT, 'data', 'prices.json'),
  dashboardLocal: path.join(ROOT, 'data', 'dashboard.json'),
  dashboardStaged: path.join(ROOT, '.altea-google-sheet-sync-output', 'dashboard.json'),
  trendsLocal: path.join(ROOT, 'data', 'platform_trends.json'),
  trendsStaged: path.join(ROOT, '.altea-google-sheet-sync-output', 'platform_trends.json'),
  repricerLocal: path.join(ROOT, 'data', 'repricer.json')
};

const PLATFORM_ORDER = ['wb', 'ozon', 'ya'];
const PLATFORM_LABELS = {
  wb: 'WB',
  ozon: 'Ozon',
  ya: 'Я.Маркет'
};

function readFileMeta(filePath, extra = () => ({})) {
  const json = safeReadJson(filePath, null);
  return {
    path: filePath,
    exists: Boolean(json),
    generatedAt: json?.generatedAt || '',
    ...extra(json)
  };
}

function datasetAsOf(json) {
  return json?.dataFreshness?.asOfDate
    || json?.latestMarketplaceDate
    || json?.asOfDate
    || '';
}

function selectSeries(row = {}) {
  if (Array.isArray(row?.daily) && row.daily.length) return row.daily;
  if (Array.isArray(row?.monthly) && row.monthly.length) return row.monthly;
  if (Array.isArray(row?.timeline) && row.timeline.length) return row.timeline;
  return [];
}

function shortExamples(items = [], limit = 6) {
  return items.slice(0, limit).map((item) => ({
    article: item.article,
    name: item.name
  }));
}

function formatDateTime(value) {
  const stamp = parseFreshStamp(value);
  if (!stamp) return '—';
  return new Date(stamp).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' });
}

function formatCountWithPct(count, total) {
  if (!total) return `${count}`;
  const pct = ((count / total) * 100).toFixed(1);
  return `${count} (${pct}%)`;
}

function fileLagHours(older, fresher) {
  const olderStamp = parseFreshStamp(older);
  const fresherStamp = parseFreshStamp(fresher);
  if (!olderStamp || !fresherStamp || fresherStamp <= olderStamp) return 0;
  return Number(((fresherStamp - olderStamp) / 36e5).toFixed(1));
}

function buildPlatformMetricCoverage(rows = [], platform = '') {
  let latestSeriesDate = '';
  rows.forEach((row) => {
    selectSeries(row).forEach((point) => {
      const date = asIsoDate(point?.date);
      if (date && date > latestSeriesDate) latestSeriesDate = date;
    });
    const freshness = asIsoDate(row?.historyFreshnessDate || row?.valueDate || '');
    if (freshness && freshness > latestSeriesDate) latestSeriesDate = freshness;
  });

  const cutoffStamp = latestSeriesDate
    ? Date.parse(`${latestSeriesDate}T00:00:00Z`) - (6 * 24 * 60 * 60 * 1000)
    : 0;

  const stats = {
    platform,
    label: PLATFORM_LABELS[platform] || platform,
    totalSku: rows.length,
    latestSeriesDate,
    currentPrice: 0,
    currentClientPrice: 0,
    currentSpp: 0,
    currentTurnover: 0,
    orders7d: 0,
    revenue7d: 0,
    latestPointRows: 0,
    latestOrdersRows: 0,
    latestRevenueRows: 0,
    gaps: {
      noCurrentPrice: [],
      noCurrentClientPrice: [],
      noCurrentSpp: [],
      noCurrentTurnover: [],
      noOrders7d: [],
      noRevenue7d: []
    }
  };

  rows.forEach((row) => {
    const article = row?.articleKey || row?.article || '';
    const name = row?.name || '';
    const series = selectSeries(row);
    const recent = series.filter((point) => {
      const date = asIsoDate(point?.date);
      return date && Date.parse(`${date}T00:00:00Z`) >= cutoffStamp;
    });
    const latestPoint = latestSeriesDate
      ? series.find((point) => asIsoDate(point?.date) === latestSeriesDate) || null
      : null;

    const currentPrice = firstPositive(row?.currentFillPrice, row?.currentPrice);
    const currentClientPrice = firstPositive(row?.currentClientPrice);
    const currentSpp = firstNumber(row?.currentSppPct);
    const currentTurnover = firstNumber(row?.currentTurnoverDays, row?.turnoverCurrentDays);
    const hasOrders7d = recent.some((point) => {
      const value = firstNumber(point?.ordersUnits);
      return value !== null && value !== 0;
    });
    const hasRevenue7d = recent.some((point) => {
      const value = firstNumber(point?.revenue);
      return value !== null && value !== 0;
    });
    const hasLatestOrders = latestPoint ? (() => {
      const value = firstNumber(latestPoint?.ordersUnits);
      return value !== null && value !== 0;
    })() : false;
    const hasLatestRevenue = latestPoint ? (() => {
      const value = firstNumber(latestPoint?.revenue);
      return value !== null && value !== 0;
    })() : false;

    if (currentPrice !== null) stats.currentPrice += 1;
    else stats.gaps.noCurrentPrice.push({ article, name });

    if (currentClientPrice !== null) stats.currentClientPrice += 1;
    else stats.gaps.noCurrentClientPrice.push({ article, name });

    if (currentSpp !== null) stats.currentSpp += 1;
    else stats.gaps.noCurrentSpp.push({ article, name });

    if (currentTurnover !== null) stats.currentTurnover += 1;
    else stats.gaps.noCurrentTurnover.push({ article, name });

    if (hasOrders7d) stats.orders7d += 1;
    else stats.gaps.noOrders7d.push({ article, name });

    if (hasRevenue7d) stats.revenue7d += 1;
    else stats.gaps.noRevenue7d.push({ article, name });

    if (latestPoint) stats.latestPointRows += 1;
    if (hasLatestOrders) stats.latestOrdersRows += 1;
    if (hasLatestRevenue) stats.latestRevenueRows += 1;
  });

  return stats;
}

function buildAudit() {
  const workbench = safeReadJson(FILES.workbench, { generatedAt: '', platforms: {} });
  const overlay = safeReadJson(FILES.overlay, { generatedAt: '', platforms: {} });
  const live = safeReadJson(FILES.live, { generatedAt: '', platforms: {} });
  const prices = safeReadJson(FILES.prices, { generatedAt: '', platforms: {} });
  const dashboardLocal = safeReadJson(FILES.dashboardLocal, null);
  const dashboardStaged = safeReadJson(FILES.dashboardStaged, null);
  const trendsLocal = safeReadJson(FILES.trendsLocal, null);
  const trendsStaged = safeReadJson(FILES.trendsStaged, null);
  const repricerLocal = safeReadJson(FILES.repricerLocal, null);

  const merged = mergeSmartPriceContour(workbench || {}, overlay || {}, live || {});
  const metricCoverage = PLATFORM_ORDER.map((platform) =>
    buildPlatformMetricCoverage(merged?.platforms?.[platform]?.rows || [], platform)
  );

  const files = {
    prices: readFileMeta(FILES.prices, (json) => ({ asOfDate: datasetAsOf(json) })),
    workbench: readFileMeta(FILES.workbench, (json) => ({ asOfDate: datasetAsOf(json) })),
    overlay: readFileMeta(FILES.overlay, (json) => ({ asOfDate: datasetAsOf(json) })),
    live: readFileMeta(FILES.live, (json) => ({ asOfDate: datasetAsOf(json) })),
    dashboardLocal: readFileMeta(FILES.dashboardLocal, (json) => ({ asOfDate: datasetAsOf(json) })),
    dashboardStaged: readFileMeta(FILES.dashboardStaged, (json) => ({ asOfDate: datasetAsOf(json) })),
    trendsLocal: readFileMeta(FILES.trendsLocal, (json) => ({ asOfDate: datasetAsOf(json) })),
    trendsStaged: readFileMeta(FILES.trendsStaged, (json) => ({ asOfDate: datasetAsOf(json) })),
    repricerLocal: readFileMeta(FILES.repricerLocal, (json) => ({ rows: Array.isArray(json?.rows) ? json.rows.length : null }))
  };

  const crossTabRisks = [];
  const dashboardLag = fileLagHours(files.dashboardLocal.generatedAt, files.dashboardStaged.generatedAt);
  if (dashboardLag > 0) {
    crossTabRisks.push(`Локальный fallback dashboard.json старше staged-слоя на ${dashboardLag} ч.`);
  }
  const trendsLag = fileLagHours(files.trendsLocal.generatedAt, files.trendsStaged.generatedAt);
  if (trendsLag > 0) {
    crossTabRisks.push(`Локальный fallback platform_trends.json старше staged-слоя на ${trendsLag} ч.`);
  }
  if ((files.repricerLocal.rows || 0) === 0) {
    crossTabRisks.push('data/repricer.json пустой; репрайсеру нельзя доверять этому файлу как самостоятельному источнику факт-метрик.');
  }
  if (files.dashboardStaged.asOfDate && files.dashboardStaged.asOfDate < metricCoverage[0]?.latestSeriesDate) {
    crossTabRisks.push(`Даже staged dashboard держит asOfDate ${files.dashboardStaged.asOfDate}, тогда как ценовой merged-контур уже знает факты до ${metricCoverage[0]?.latestSeriesDate}.`);
  }

  return {
    generatedAt: new Date().toISOString(),
    mergedGeneratedAt: merged?.generatedAt || '',
    files,
    metricCoverage: metricCoverage.map((item) => ({
      ...item,
      gaps: {
        noCurrentPrice: shortExamples(item.gaps.noCurrentPrice),
        noCurrentClientPrice: shortExamples(item.gaps.noCurrentClientPrice),
        noCurrentSpp: shortExamples(item.gaps.noCurrentSpp),
        noCurrentTurnover: shortExamples(item.gaps.noCurrentTurnover),
        noOrders7d: shortExamples(item.gaps.noOrders7d),
        noRevenue7d: shortExamples(item.gaps.noRevenue7d)
      }
    })),
    crossTabRisks
  };
}

function renderMarkdown(audit) {
  const lines = [];
  lines.push('# Аудит метрик портала');
  lines.push('');
  lines.push(`Собрано: ${formatDateTime(audit.generatedAt)}`);
  lines.push(`Merged smart-price contour: ${audit.mergedGeneratedAt ? `${audit.mergedGeneratedAt} (${formatDateTime(audit.mergedGeneratedAt)})` : '—'}`);
  lines.push('');
  lines.push('## Свежесть файлов');
  lines.push('');
  lines.push('| Слой | generatedAt | asOf / rows |');
  lines.push('| --- | --- | --- |');
  Object.entries(audit.files).forEach(([key, meta]) => {
    const extra = meta.rows != null
      ? `rows ${meta.rows}`
      : meta.asOfDate || '—';
    lines.push(`| ${key} | ${meta.generatedAt ? `${meta.generatedAt} (${formatDateTime(meta.generatedAt)})` : '—'} | ${extra} |`);
  });
  lines.push('');
  lines.push('## Покрытие метрик в merged-контуре');
  lines.push('');
  lines.push('| Площадка | SKU | Последний факт | Цена | Цена клиента | SPP | Оборач. | Заказы 7д | Выручка 7д | Точки на последнюю дату | Заказы в последнюю дату | Выручка в последнюю дату |');
  lines.push('| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  audit.metricCoverage.forEach((item) => {
    lines.push(`| ${item.label} | ${item.totalSku} | ${item.latestSeriesDate || '—'} | ${formatCountWithPct(item.currentPrice, item.totalSku)} | ${formatCountWithPct(item.currentClientPrice, item.totalSku)} | ${formatCountWithPct(item.currentSpp, item.totalSku)} | ${formatCountWithPct(item.currentTurnover, item.totalSku)} | ${formatCountWithPct(item.orders7d, item.totalSku)} | ${formatCountWithPct(item.revenue7d, item.totalSku)} | ${formatCountWithPct(item.latestPointRows, item.totalSku)} | ${formatCountWithPct(item.latestOrdersRows, item.totalSku)} | ${formatCountWithPct(item.latestRevenueRows, item.totalSku)} |`);
  });
  lines.push('');
  lines.push('## Примеры дыр по метрикам');
  lines.push('');
  audit.metricCoverage.forEach((item) => {
    lines.push(`### ${item.label}`);
    lines.push('');
    lines.push(`- Без текущей цены: ${item.gaps.noCurrentPrice.map((row) => row.article).join(', ') || 'нет'}`);
    lines.push(`- Без цены клиента: ${item.gaps.noCurrentClientPrice.map((row) => row.article).join(', ') || 'нет'}`);
    lines.push(`- Без SPP: ${item.gaps.noCurrentSpp.map((row) => row.article).join(', ') || 'нет'}`);
    lines.push(`- Без оборачиваемости: ${item.gaps.noCurrentTurnover.map((row) => row.article).join(', ') || 'нет'}`);
    lines.push(`- Без заказов за 7 дней: ${item.gaps.noOrders7d.map((row) => row.article).join(', ') || 'нет'}`);
    lines.push(`- Без выручки за 7 дней: ${item.gaps.noRevenue7d.map((row) => row.article).join(', ') || 'нет'}`);
    lines.push('');
  });
  lines.push('## Межвкладочные риски');
  lines.push('');
  if (!audit.crossTabRisks.length) {
    lines.push('- Явных рисков между слоями не найдено.');
  } else {
    audit.crossTabRisks.forEach((risk) => lines.push(`- ${risk}`));
  }
  lines.push('');
  return lines.join('\n');
}

const audit = buildAudit();
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(audit, null, 2));
} else {
  process.stdout.write(renderMarkdown(audit));
}
