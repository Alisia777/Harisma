#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_PLAN_PCT = 0.08;
const DEFAULT_OZON_PLAN_PCT = 0.25;
const WB_CONTRACT = {
  seller: 'ООО "СМАРТ-СЭЙЛ"',
  source: '2_Соглашение_по_Программе_сотрудничества_2026_на_год_СМАРТ_01_03.docx',
  salesPeriodStart: '2026-03-01',
  salesPeriodEnd: '2026-12-31',
  marketingRate: 0.08,
  thresholdRate: 0.9,
  stornoCancelRate: 0.98,
  halfYears: [
    { key: '2026-H1', from: '2026-01-01', to: '2026-06-30', targetRevenue: 899394278 },
    { key: '2026-H2', from: '2026-07-01', to: '2026-12-31', targetRevenue: 2397395634 }
  ]
};
const CHANNEL_KEYS = [
  ['wbPromotion', 'ВБ Продвижение'],
  ['wbMedia', 'ВБ Медиа'],
  ['wbInfluencer', 'ВБ Инфлюенс'],
  ['pvzAds', 'Реклама в ПВЗ'],
  ['brandZone', 'Брендзона'],
  ['overviews', 'Обзоры'],
  ['reviewPoints', 'Отзывы за баллы'],
  ['externalAds', 'Внешка']
];
const DOWNLOADS_ROOT = path.resolve(process.env.USERPROFILE || process.cwd(), 'Downloads');
const QUARTER_REPORT_CANDIDATES = [
  path.join(DOWNLOADS_ROOT, 'report 2026-5-13.xlsx'),
  path.join(DOWNLOADS_ROOT, 'report 2026-05-13.xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'report 2026-5-13.xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'report 2026-05-13.xlsx')
];
const QUARTER_DRR_CANDIDATES = [
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'ДРР ВБ.xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'ДРР ВБ (3).xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'ДРР ВБ (2).xlsx'),
  path.join(DOWNLOADS_ROOT, 'Telegram Desktop', 'ДРР ВБ (1).xlsx'),
  path.join(DOWNLOADS_ROOT, 'ДРР ВБ.xlsx'),
  path.join(DOWNLOADS_ROOT, 'iu-drr-wb-2026-05.xls'),
  path.join(DOWNLOADS_ROOT, 'iu-drr-wb-2026-05 (1).xls'),
  path.join(DOWNLOADS_ROOT, 'iu-drr-wb-2026-05 (2).xls'),
  path.join(DOWNLOADS_ROOT, 'iu-drr-wb-2026-05 (3).xls')
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--mirror-local-fallback') {
      args.mirrorLocalFallback = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function roundRate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000000) / 1000000 : null;
}

function isoDate(value) {
  if (!value && value !== 0) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function dateFromCell(value, yearHint = '') {
  if (!value && value !== 0) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const raw = String(value).trim();
  if (!raw) return '';
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (match) {
    const year = match[3]
      ? (match[3].length === 2 ? `20${match[3]}` : match[3])
      : String(yearHint || '').trim();
    if (!year) return '';
    return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
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
  const dates = [];
  let cursor = from;
  while (cursor && to && cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function daysInclusive(from, to) {
  if (!from || !to || from > to) return 0;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function maxDate(left, right) {
  if (!left) return right || '';
  if (!right) return left || '';
  return left > right ? left : right;
}

function minDate(left, right) {
  if (!left) return right || '';
  if (!right) return left || '';
  return left < right ? left : right;
}

function contractHalfYearForDate(dateKey) {
  return WB_CONTRACT.halfYears.find((period) => dateKey >= period.from && dateKey <= period.to) || null;
}

function contractDailyTargetRevenueWb(dateKey) {
  if (!dateKey || dateKey < WB_CONTRACT.salesPeriodStart || dateKey > WB_CONTRACT.salesPeriodEnd) return 0;
  const halfYear = contractHalfYearForDate(dateKey);
  if (!halfYear) return 0;
  const days = daysInclusive(halfYear.from, halfYear.to);
  return days > 0 ? numberOrZero(halfYear.targetRevenue) / days : 0;
}

function contractTargetRevenueWbForRange(from, to) {
  if (!from || !to || from > to) return 0;
  let total = 0;
  for (const halfYear of WB_CONTRACT.halfYears) {
    const start = maxDate(from, maxDate(WB_CONTRACT.salesPeriodStart, halfYear.from));
    const end = minDate(to, minDate(WB_CONTRACT.salesPeriodEnd, halfYear.to));
    const activeDays = daysInclusive(start, end);
    const halfYearDays = daysInclusive(halfYear.from, halfYear.to);
    if (activeDays > 0 && halfYearDays > 0) {
      total += numberOrZero(halfYear.targetRevenue) * activeDays / halfYearDays;
    }
  }
  return total;
}

function contractMonthTargetRevenueWb(month) {
  const year = Number(String(month || '').slice(0, 4));
  const monthNumber = Number(String(month || '').slice(5, 7));
  if (!year || !monthNumber) return 0;
  const days = new Date(year, monthNumber, 0).getDate();
  return contractTargetRevenueWbForRange(`${month}-01`, `${month}-${String(days).padStart(2, '0')}`);
}

function monthKey(dateKey) {
  return String(dateKey || '').slice(0, 7);
}

function periodLabel(dateKey) {
  return String(dateKey || '').slice(8, 10) + '.' + String(dateKey || '').slice(5, 7);
}

function findExistingPath(candidates = []) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return '';
}

function readWorkbookRows(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
}

function readQuarterReportRows(filePath, from, to) {
  const rows = readWorkbookRows(filePath);
  const selected = [];
  for (const row of rows.slice(1)) {
    const date = dateFromCell(row?.[2]);
    if (!date || date < from || date > to) continue;
    const ordersRevenueWb = roundMoney(row?.[3]);
    const revenueWb = roundMoney(row?.[6]);
    if (ordersRevenueWb <= 0 && revenueWb <= 0) continue;
    selected.push({
      date,
      ordersRevenueWb,
      revenueWb
    });
  }
  return selected;
}

function readQuarterDrrRows(filePath, from, to, yearHint) {
  const rows = readWorkbookRows(filePath);
  const selected = [];
  for (const row of rows.slice(1)) {
    const date = dateFromCell(row?.[0], yearHint);
    if (!date || date < from || date > to) continue;
    const spendFact = roundMoney(row?.[3]);
    if (spendFact <= 0) continue;
    selected.push({
      date,
      spendFact
    });
  }
  return selected;
}

function mergeQuarterRows(reportRows, drrRows, dailyRows, from, to) {
  const rows = new Map();
  const merge = (row, fields = []) => {
    if (!row?.date || row.date < from || row.date > to) return;
    const current = rows.get(row.date) || { date: row.date };
    for (const field of fields) {
      if (row[field] !== undefined && row[field] !== null) {
        const value = numberOrZero(row[field]);
        if (value !== 0 || current[field] === undefined) current[field] = value;
      }
    }
    rows.set(row.date, current);
  };
  for (const row of reportRows || []) {
    merge(row, ['ordersRevenueWb', 'revenueWb']);
  }
  for (const row of drrRows || []) {
    merge(row, ['spendFact']);
  }
  for (const row of dailyRows || []) {
    merge(row, ['ordersRevenueWb', 'revenueWb', 'spendFact']);
  }
  return [...rows.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function buildQuarterSummary(dailyRows, asOfDate) {
  const from = WB_CONTRACT.salesPeriodStart;
  const to = asOfDate || dailyRows[dailyRows.length - 1]?.date || '';
  if (!from || !to || from > to) {
    return {
      status: 'empty',
      from,
      to,
      label: '',
      days: 0,
      targetRevenueWb: 0,
      revenueWb: 0,
      ordersRevenueWb: 0,
      planPct: roundRate(WB_CONTRACT.marketingRate),
      planSpendWb: 0,
      spendFact: 0,
      factPct: null,
      ordersAdPct: null,
      revenueDelta: 0,
      spendDelta: 0
    };
  }
  const reportPath = findExistingPath(QUARTER_REPORT_CANDIDATES);
  const drrPath = findExistingPath(QUARTER_DRR_CANDIDATES);
  const yearHint = Number(String(to).slice(0, 4)) || new Date().getFullYear();
  const reportRows = reportPath ? readQuarterReportRows(reportPath, from, to) : [];
  const drrRows = drrPath ? readQuarterDrrRows(drrPath, from, minDate(to, `${String(yearHint)}-04-30`), String(yearHint)) : [];
  const mergedRows = mergeQuarterRows(reportRows, drrRows, dailyRows, from, to);
  const revenueWb = roundMoney(sumRows(mergedRows, 'revenueWb'));
  const ordersRevenueWb = roundMoney(sumRows(mergedRows, 'ordersRevenueWb'));
  const spendFact = roundMoney(sumRows(mergedRows, 'spendFact'));
  const targetRevenueWb = roundMoney(contractTargetRevenueWbForRange(from, to));
  const planSpendWb = roundMoney(revenueWb * numberOrZero(WB_CONTRACT.marketingRate));
  const revenueDelta = roundMoney(revenueWb - targetRevenueWb);
  const spendDelta = roundMoney(spendFact - planSpendWb);
  const sourceParts = [];
  if (reportPath) sourceParts.push(path.basename(reportPath));
  if (drrPath) sourceParts.push(path.basename(drrPath));
  sourceParts.push('iu_drr_summary.json');
  return {
    status: reportPath && drrPath ? 'ok' : 'partial',
    from,
    to,
    label: `${String(from).slice(8, 10)}.${String(from).slice(5, 7)}–${String(to).slice(8, 10)}.${String(to).slice(5, 7)}`,
    days: mergedRows.length,
    targetRevenueWb,
    revenueWb,
    ordersRevenueWb,
    revenueDelta,
    revenueDeltaPct: targetRevenueWb > 0 ? roundRate(revenueDelta / targetRevenueWb) : null,
    revenueCompletionPct: targetRevenueWb > 0 ? roundRate(revenueWb / targetRevenueWb) : null,
    planPct: roundRate(WB_CONTRACT.marketingRate),
    planSpendWb,
    spendFact,
    factPct: revenueWb > 0 ? roundRate(spendFact / revenueWb) : null,
    ordersAdPct: ordersRevenueWb > 0 ? roundRate(spendFact / ordersRevenueWb) : null,
    spendDelta,
    spendDeltaPct: planSpendWb > 0 ? roundRate(spendDelta / planSpendWb) : null,
    source: {
      reportPath: reportPath || '',
      drrPath: drrPath || '',
      reportRows: reportRows.length,
      drrRows: drrRows.length,
      mergedRows: mergedRows.length
    },
    sourceLabel: sourceParts.join(' + '),
    sourceWarnings: [
      ...(!reportPath ? ['report workbook not found'] : []),
      ...(!drrPath ? ['WB DRR workbook not found'] : [])
    ]
  };
}

function resolveOptions(args) {
  const inputDir = path.resolve(args['input-dir'] || path.join(process.cwd(), 'data'));
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(process.cwd(), 'data'));
  const outputDir = args['output-dir'] ? path.resolve(args['output-dir']) : '';
  const mirrorDataDir = path.resolve(args['mirror-data-dir'] || process.env.ALTEA_PORTAL_FALLBACK_DIR || baseDataDir);
  return {
    dryRun: Boolean(args.dryRun),
    inputDir,
    baseDataDir,
    outputDir,
    mirrorDataDir,
    mirrorLocalFallback: Boolean(args.mirrorLocalFallback),
    from: isoDate(args.from || args['date-from']),
    to: isoDate(args.to || args['date-to'])
  };
}

function readLayer(options, fileName, fallback) {
  return readJson(path.join(options.inputDir, fileName), readJson(path.join(options.baseDataDir, fileName), fallback));
}

function normalizePlatformKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'wildberries' || raw === 'вб') return 'wb';
  if (raw === 'ym' || raw === 'yandex') return 'ya';
  return raw || 'all';
}

function buildPlatformDateMap(platformTrends, platformKey) {
  const record = (platformTrends?.platforms || []).find((platform) => normalizePlatformKey(platform?.key || platform?.label) === platformKey);
  const map = new Map();
  for (const point of record?.series || []) {
    const date = isoDate(point?.date || point?.label);
    if (!date) continue;
    const sellerSummary = point?.wbSellerSummary && typeof point.wbSellerSummary === 'object'
      ? point.wbSellerSummary
      : {};
    const wbFinanceTurnover = platformKey === 'wb'
      ? numberOrZero(
        point?.wbSellerSummaryFinanceTurnover
        || point?.financeTurnover
        || sellerSummary.financeTurnover
        || sellerSummary.salesRevenue
      )
      : 0;
    const wbFinancialResult = platformKey === 'wb'
      ? numberOrZero(
        point?.wbSellerSummaryPayForGoods
        || point?.financialResult
        || sellerSummary.financialResult
        || sellerSummary.payForGoods
      )
      : 0;
    const wbOrdersRevenue = platformKey === 'wb'
      ? numberOrZero(
        point?.wbSellerSummaryReferenceRevenue
        || sellerSummary.ordersRevenue
        || point?.revenue
      )
      : numberOrZero(point.revenue);
    map.set(date, {
      units: numberOrZero(point.units),
      ordersRevenue: wbOrdersRevenue,
      revenue: wbFinanceTurnover > 0 ? wbFinanceTurnover : numberOrZero(point.revenue),
      margin: wbFinancialResult > 0 ? wbFinancialResult : numberOrZero(point.estimatedMargin || point.margin),
      source: wbFinanceTurnover > 0 ? 'wb-seller-summary-finance-turnover' : 'platform-trends-orders'
    });
  }
  return map;
}

function channelKey(channel) {
  const raw = String(channel || '').trim().toLowerCase();
  if (/медиа|media/.test(raw)) return 'wbMedia';
  if (/инфлю|influ/.test(raw)) return 'wbInfluencer';
  if (/пвз|pvz/.test(raw)) return 'pvzAds';
  if (/брендзон|brand/.test(raw)) return 'brandZone';
  if (/обзор/.test(raw)) return 'overviews';
  if (/отзыв/.test(raw)) return 'reviewPoints';
  if (/внеш|external/.test(raw)) return 'externalAds';
  return 'wbPromotion';
}

function emptyAdsBucket() {
  return { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0, rows: 0, sourceModes: [] };
}

function addAdsBucket(map, date, row) {
  const current = map.get(date) || emptyAdsBucket();
  current.spend += numberOrZero(row.spend);
  current.views += numberOrZero(row.views);
  current.clicks += numberOrZero(row.clicks);
  current.orders += numberOrZero(row.orders);
  current.revenue += numberOrZero(row.revenue);
  const explicitRows = Number(row.sourceRows ?? row.operationRows);
  current.rows += Number.isFinite(explicitRows) ? explicitRows : 1;
  const sourceMode = String(row.sourceMode || row.source || row.campaignId || row.channel || '').trim();
  if (sourceMode && !current.sourceModes.includes(sourceMode)) current.sourceModes.push(sourceMode);
  map.set(date, current);
  return current;
}

function mergePlatformAdsSeries(adsSummary, platformKey, targetMap, onSpendGap) {
  const platform = (adsSummary?.platforms || []).find((item) =>
    normalizePlatformKey(item?.key || item?.platformKey || item?.label) === platformKey
  );
  for (const point of platform?.series || []) {
    const date = isoDate(point.date || point.label);
    if (!date) continue;
    const platformSpend = numberOrZero(point.spend);
    const current = targetMap.get(date) || emptyAdsBucket();
    if (platformSpend > current.spend + 1) {
      const gap = platformSpend - current.spend;
      current.spend += gap;
      if (typeof onSpendGap === 'function') onSpendGap(date, gap);
    }
    current.views = Math.max(current.views, numberOrZero(point.views));
    current.clicks = Math.max(current.clicks, numberOrZero(point.clicks));
    current.orders = Math.max(current.orders, numberOrZero(point.orders));
    current.revenue = Math.max(current.revenue, numberOrZero(point.revenue));
    const sourceMode = String(point.sourceMode || `${platformKey}_platform_series`).trim();
    if (sourceMode && !current.sourceModes.includes(sourceMode)) current.sourceModes.push(sourceMode);
    targetMap.set(date, current);
  }
}

function buildAdsDailyMaps(adsSummary) {
  const byDate = new Map();
  const byDateChannel = new Map();
  const ozonByDate = new Map();
  for (const row of adsSummary?.itemSeries || []) {
    const platformKey = normalizePlatformKey(row?.platformKey || row?.platform || row?.marketplace || row?.data_source);
    if (!['wb', 'ozon'].includes(platformKey)) continue;
    const date = isoDate(row.date || row.day || row.label);
    if (!date) continue;
    const targetMap = platformKey === 'ozon' ? ozonByDate : byDate;
    addAdsBucket(targetMap, date, row);

    if (platformKey !== 'wb') continue;
    const key = `${date}|${channelKey(row.channel)}`;
    const channelCurrent = byDateChannel.get(key) || 0;
    byDateChannel.set(key, channelCurrent + numberOrZero(row.spend));
  }

  mergePlatformAdsSeries(adsSummary, 'wb', byDate, (date, gap) => {
    const key = `${date}|wbPromotion`;
    byDateChannel.set(key, (byDateChannel.get(key) || 0) + gap);
  });
  mergePlatformAdsSeries(adsSummary, 'ozon', ozonByDate);

  return { byDate, byDateChannel, ozonByDate };
}

function buildReviewPointsMap(wbFeedbacksSummary) {
  const map = new Map();
  for (const row of wbFeedbacksSummary?.reviewsForPoints?.daily || []) {
    const date = isoDate(row.date);
    if (!date) continue;
    const current = map.get(date) || { spend: 0, feedbacks: 0 };
    current.spend += numberOrZero(row.spend ?? row.points);
    current.feedbacks += numberOrZero(row.feedbacks);
    map.set(date, current);
  }
  return map;
}

function planPctForMonth(iuPlan, month) {
  const source = iuPlan?.months?.[month] || {};
  const pct = numberOrZero(source.iuAdsWb) > 0 && numberOrZero(source.iuRevenueWb) > 0
    ? numberOrZero(source.iuAdsWb) / numberOrZero(source.iuRevenueWb)
    : DEFAULT_PLAN_PCT;
  const workbookRate = Number.isFinite(pct) && pct > 0 ? pct : DEFAULT_PLAN_PCT;
  return numberOrZero(WB_CONTRACT.marketingRate) || workbookRate;
}

function ozonPlanPctForMonth(iuPlan, month) {
  const source = iuPlan?.months?.[month] || {};
  const pct = numberOrZero(source.iuAdsOzon) > 0 && numberOrZero(source.iuRevenueOzon) > 0
    ? numberOrZero(source.iuAdsOzon) / numberOrZero(source.iuRevenueOzon)
    : numberOrZero(iuPlan?.assumptions?.ozonIuAdsRate) || DEFAULT_OZON_PLAN_PCT;
  return Number.isFinite(pct) && pct > 0 ? pct : DEFAULT_OZON_PLAN_PCT;
}

function monthPlan(iuPlan, month) {
  const source = iuPlan?.months?.[month] || {};
  const days = numberOrZero(source.days) || new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const iuRevenueWb = numberOrZero(source.iuRevenueWb);
  const iuRevenueOzon = numberOrZero(source.iuRevenueOzon);
  const iuAdsWb = numberOrZero(source.iuAdsWb);
  const iuAdsOzon = numberOrZero(source.iuAdsOzon);
  const dailyIuRevenueWb = numberOrZero(source.dailyIuRevenueWb) || (days > 0 ? iuRevenueWb / days : 0);
  const dailyIuRevenueOzon = numberOrZero(source.dailyIuRevenueOzon) || (days > 0 ? iuRevenueOzon / days : 0);
  const dailyIuAdsWb = numberOrZero(source.dailyIuAdsWb) || (days > 0 ? iuAdsWb / days : 0);
  const dailyIuAdsOzon = numberOrZero(source.dailyIuAdsOzon) || (days > 0 ? iuAdsOzon / days : 0);
  return {
    label: source.label || month,
    days,
    iuRevenueWb,
    iuRevenueOzon,
    iuRevenueTotal: numberOrZero(source.iuRevenueTotal),
    iuAdsWb,
    iuAdsOzon,
    iuAdsTotal: numberOrZero(source.iuAdsTotal),
    dailyIuRevenueWb,
    dailyIuRevenueOzon,
    dailyIuRevenueTotal: numberOrZero(source.dailyIuRevenueTotal) || dailyIuRevenueWb + dailyIuRevenueOzon,
    dailyIuAdsWb,
    dailyIuAdsOzon,
    dailyIuAdsTotal: numberOrZero(source.dailyIuAdsTotal) || dailyIuAdsWb + dailyIuAdsOzon
  };
}

function dateRange(platformTrends, adsSummary, explicitFrom, explicitTo) {
  const dates = [];
  for (const platform of platformTrends?.platforms || []) {
    for (const point of platform?.series || []) {
      const date = isoDate(point.date || point.label);
      if (date) dates.push(date);
    }
  }
  for (const row of adsSummary?.itemSeries || []) {
    const date = isoDate(row.date || row.day || row.label);
    if (date) dates.push(date);
  }
  const platformLatestDate = (key) => (
    (platformTrends?.platforms || [])
      .find((platform) => String(platform?.key || '').trim().toLowerCase() === key)
      ?.series
      ?.map((point) => isoDate(point.date || point.label))
      ?.filter(Boolean) || []
  ).sort().pop() || '';
  const wbLatestDate = platformLatestDate('wb');
  const ozonLatestDate = platformLatestDate('ozon');
  const latestCompleteMarketplaceDate = wbLatestDate && ozonLatestDate
    ? (wbLatestDate < ozonLatestDate ? wbLatestDate : ozonLatestDate)
    : '';
  const sorted = dates.sort();
  const to = explicitTo || latestCompleteMarketplaceDate || sorted[sorted.length - 1] || isoDate(platformTrends?.latestMarketplaceDate) || isoDate(adsSummary?.asOfDate) || new Date().toISOString().slice(0, 10);
  const from = explicitFrom || (WB_CONTRACT.salesPeriodStart && WB_CONTRACT.salesPeriodStart <= to
    ? WB_CONTRACT.salesPeriodStart
    : `${to.slice(0, 7)}-01`);
  return { from, to };
}

function buildDailyRows(platformTrends, iuPlan, adsSummary, wbFeedbacksSummary, options) {
  const wbMap = buildPlatformDateMap(platformTrends, 'wb');
  const ozonMap = buildPlatformDateMap(platformTrends, 'ozon');
  const adsMaps = buildAdsDailyMaps(adsSummary);
  const reviewPointsMap = buildReviewPointsMap(wbFeedbacksSummary);
  const ozonPendingAdsDates = new Set(
    (adsSummary?.diagnostics?.ozonAdsFinance?.pendingDates || [])
      .map(isoDate)
      .filter(Boolean)
  );
  const range = dateRange(platformTrends, adsSummary, options.from, options.to);
  return enumerateDates(range.from, range.to).map((date) => {
    const month = monthKey(date);
    const plan = monthPlan(iuPlan, month);
    const planPct = planPctForMonth(iuPlan, month);
    const planPctOzon = ozonPlanPctForMonth(iuPlan, month);
    const contractHalfYear = contractHalfYearForDate(date);
    const wb = wbMap.get(date) || {};
    const ozon = ozonMap.get(date) || {};
    const ads = adsMaps.byDate.get(date) || {};
    const ozonAds = adsMaps.ozonByDate.get(date) || {};
    const hasOzonAdsFact = adsMaps.ozonByDate.has(date);
    const hasOzonAdsPending = ozonPendingAdsDates.has(date);
    const revenueWb = numberOrZero(wb.revenue);
    const ordersRevenueWb = numberOrZero(wb.ordersRevenue) || revenueWb;
    const revenueOzon = numberOrZero(ozon.revenue);
    const adsPctBaseWb = revenueWb;
    const adsPctBaseIu = adsPctBaseWb + revenueOzon;
    const managementTargetRevenueWb = numberOrZero(plan.dailyIuRevenueWb);
    const contractTargetRevenueWb = contractDailyTargetRevenueWb(date);
    const targetRevenueWb = contractTargetRevenueWb || managementTargetRevenueWb;
    const targetRevenueOzon = numberOrZero(plan.dailyIuRevenueOzon);
    const revenueWbDelta = revenueWb - targetRevenueWb;
    const revenueOzonDelta = revenueOzon - targetRevenueOzon;
    const managementPlanSpendWb = numberOrZero(plan.dailyIuAdsWb) || (targetRevenueWb * planPct);
    const contractMarketingPlanWb = revenueWb * planPct;
    const planSpendWb = contractMarketingPlanWb || managementPlanSpendWb;
    const planSpendOzon = numberOrZero(plan.dailyIuAdsOzon) || (targetRevenueOzon * planPctOzon);
    const spendFactOzon = hasOzonAdsFact ? numberOrZero(ozonAds.spend) : revenueOzon * planPctOzon;
    const ozonAdsSourceModes = Array.isArray(ozonAds.sourceModes) ? ozonAds.sourceModes.filter(Boolean) : [];
    const ozonAdsFactMode = hasOzonAdsFact
      ? (ozonAdsSourceModes.includes('ozon_seller_finance_api')
        ? 'ozon_seller_finance_api'
        : (ozonAdsSourceModes.join('+') || 'ads_summary_fact'))
      : hasOzonAdsPending
        ? 'pending_ozon_seller_finance_api_modeled_from_revenue_25pct'
      : 'modeled_from_revenue_25pct_no_ozon_ads_fact';
    const channels = Object.fromEntries(CHANNEL_KEYS.map(([key]) => [key, 0]));
    for (const [key] of CHANNEL_KEYS) channels[key] = roundMoney(adsMaps.byDateChannel.get(`${date}|${key}`) || 0);
    const feedbackReviewPoints = reviewPointsMap.get(date) || { spend: 0, feedbacks: 0 };
    const reviewPointsFromFeedbacks = roundMoney(feedbackReviewPoints.spend);
    let reviewPointsAddedToSpend = 0;
    if (reviewPointsFromFeedbacks > 0 && numberOrZero(channels.reviewPoints) <= 0) {
      channels.reviewPoints = reviewPointsFromFeedbacks;
      reviewPointsAddedToSpend = reviewPointsFromFeedbacks;
    }
    const externalSpend = numberOrZero(channels.externalAds);
    const spendFactTotal = numberOrZero(ads.spend) + reviewPointsAddedToSpend;
    const spendFact = Math.max(0, spendFactTotal - externalSpend);
    const spendFactIu = spendFact + spendFactOzon;
    const spendDelta = spendFact - planSpendWb;
    const spendDeltaOzon = spendFactOzon - planSpendOzon;
    const spendDeltaIu = spendFactIu - planSpendWb - planSpendOzon;
    return {
      date,
      period: periodLabel(date),
      monthKey: month,
      contractPeriodKey: contractHalfYear?.key || '',
      targetRevenueWb: roundMoney(targetRevenueWb),
      contractTargetRevenueWb: roundMoney(contractTargetRevenueWb),
      managementTargetRevenueWb: roundMoney(managementTargetRevenueWb),
      revenueWb: roundMoney(revenueWb),
      ordersRevenueWb: roundMoney(ordersRevenueWb),
      adsPctBaseWb: roundMoney(adsPctBaseWb),
      revenueWbDelta: roundMoney(revenueWbDelta),
      revenueWbDeltaPct: targetRevenueWb > 0 ? roundRate(revenueWbDelta / targetRevenueWb) : null,
      revenueWbCompletionPct: targetRevenueWb > 0 ? roundRate(revenueWb / targetRevenueWb) : null,
      targetRevenueOzon: roundMoney(targetRevenueOzon),
      revenueOzon: roundMoney(revenueOzon),
      revenueOzonDelta: roundMoney(revenueOzonDelta),
      revenueOzonDeltaPct: targetRevenueOzon > 0 ? roundRate(revenueOzonDelta / targetRevenueOzon) : null,
      revenueOzonCompletionPct: targetRevenueOzon > 0 ? roundRate(revenueOzon / targetRevenueOzon) : null,
      planPctOzon: roundRate(planPctOzon),
      planSpendOzon: roundMoney(planSpendOzon),
      spendFactOzon: roundMoney(spendFactOzon),
      factPctOzon: revenueOzon > 0 ? roundRate(spendFactOzon / revenueOzon) : null,
      spendDeltaOzon: roundMoney(spendDeltaOzon),
      spendDeltaOzonPct: planSpendOzon > 0 ? roundRate(spendDeltaOzon / planSpendOzon) : null,
      ozonAdsFactMode,
      revenueTotalIu: roundMoney(numberOrZero(wb.revenue) + revenueOzon),
      revenueWbSource: wb.source || '',
      unitsWb: Math.round(numberOrZero(wb.units)),
      unitsOzon: Math.round(numberOrZero(ozon.units)),
      planPct: roundRate(planPct),
      planSpendWb: roundMoney(planSpendWb),
      contractMarketingPlanWb: roundMoney(contractMarketingPlanWb),
      managementPlanSpendWb: roundMoney(managementPlanSpendWb),
      spendFact: roundMoney(spendFact),
      spendFactDrr: roundMoney(spendFact),
      spendFactTotal: roundMoney(spendFactTotal),
      spendFactIu: roundMoney(spendFactIu),
      spendFactTotalIu: roundMoney(spendFactTotal + spendFactOzon),
      factPct: adsPctBaseWb > 0 ? roundRate(spendFact / adsPctBaseWb) : null,
      factPctIu: adsPctBaseIu > 0 ? roundRate(spendFactIu / adsPctBaseIu) : null,
      ordersAdPct: ordersRevenueWb > 0 ? roundRate(spendFact / ordersRevenueWb) : null,
      ...channels,
      reviewPointsSource: reviewPointsFromFeedbacks > 0 ? 'wb_feedbacks_api_supplierFeedbackValuation' : '',
      reviewPointsFeedbacks: Math.round(numberOrZero(feedbackReviewPoints.feedbacks)),
      spendDelta: roundMoney(spendDelta),
      spendDeltaPct: planSpendWb > 0 ? roundRate(spendDelta / planSpendWb) : null,
      spendDeltaIu: roundMoney(spendDeltaIu),
      spendDeltaIuPct: planSpendWb + planSpendOzon > 0 ? roundRate(spendDeltaIu / (planSpendWb + planSpendOzon)) : null,
      externalAdsExcludedFromDrr: true,
      adsViews: Math.round(numberOrZero(ads.views)),
      adsClicks: Math.round(numberOrZero(ads.clicks)),
      adsOrders: Math.round(numberOrZero(ads.orders)),
      adsRevenue: roundMoney(numberOrZero(ads.revenue)),
      sourceRows: Math.round(numberOrZero(ads.rows)),
      ozonAdsViews: Math.round(numberOrZero(ozonAds.views)),
      ozonAdsClicks: Math.round(numberOrZero(ozonAds.clicks)),
      ozonAdsOrders: Math.round(numberOrZero(ozonAds.orders)),
      ozonAdsRevenue: roundMoney(numberOrZero(ozonAds.revenue)),
      ozonAdsSourceRows: Math.round(numberOrZero(ozonAds.rows))
    };
  });
}

function sumRows(rows, field) {
  return rows.reduce((sum, row) => sum + numberOrZero(row[field]), 0);
}

function buildMonthRows(dailyRows, iuPlan) {
  const groups = new Map();
  for (const row of dailyRows) {
    const current = groups.get(row.monthKey) || [];
    current.push(row);
    groups.set(row.monthKey, current);
  }
  return [...groups.entries()].map(([month, rows]) => {
    const plan = monthPlan(iuPlan, month);
    const revenueWb = sumRows(rows, 'revenueWb');
    const ordersRevenueWb = sumRows(rows, 'ordersRevenueWb');
    const adsPctBaseWb = sumRows(rows, 'adsPctBaseWb') || revenueWb;
    const revenueOzon = sumRows(rows, 'revenueOzon');
    const revenueTotalIu = sumRows(rows, 'revenueTotalIu');
    const adsPctBaseIu = adsPctBaseWb + revenueOzon;
    const spendFact = sumRows(rows, 'spendFact');
    const spendFactOzon = sumRows(rows, 'spendFactOzon');
    const spendFactIu = sumRows(rows, 'spendFactIu');
    const spendFactTotal = sumRows(rows, 'spendFactTotal');
    const spendFactTotalIu = sumRows(rows, 'spendFactTotalIu');
    const externalAds = sumRows(rows, 'externalAds');
    const planSpendWb = sumRows(rows, 'planSpendWb');
    const contractMarketingPlanWb = sumRows(rows, 'contractMarketingPlanWb');
    const managementPlanSpendWb = sumRows(rows, 'managementPlanSpendWb');
    const planSpendOzon = sumRows(rows, 'planSpendOzon');
    const targetRevenueWb = sumRows(rows, 'targetRevenueWb');
    const targetRevenueOzon = sumRows(rows, 'targetRevenueOzon');
    const revenueWbDelta = sumRows(rows, 'revenueWbDelta');
    const revenueOzonDelta = sumRows(rows, 'revenueOzonDelta');
    const spendDeltaOzon = sumRows(rows, 'spendDeltaOzon');
    const spendDeltaIu = sumRows(rows, 'spendDeltaIu');
    const ozonAdsFactModes = Array.from(new Set(rows.map((row) => row.ozonAdsFactMode).filter(Boolean)));
    const plannedRevenueToDate = numberOrZero(plan.dailyIuRevenueTotal) * rows.length;
    const contractMonthTargetWb = contractMonthTargetRevenueWb(month);
    const plannedRevenueWbToDate = targetRevenueWb;
    const plannedRevenueOzonToDate = numberOrZero(plan.dailyIuRevenueOzon) * rows.length;
    const plannedAdsWbToDate = planSpendWb;
    const plannedAdsOzonToDate = numberOrZero(plan.dailyIuAdsOzon) * rows.length;
    const plannedAdsToDate = plannedAdsWbToDate + plannedAdsOzonToDate;
    return {
      monthKey: month,
      label: plan.label,
      daysInPlan: plan.days,
      daysInSummary: rows.length,
      iuRevenuePlan: roundMoney(plan.iuRevenueTotal),
      iuRevenuePlanToDate: roundMoney(plannedRevenueToDate),
      iuRevenueFactToDate: roundMoney(revenueTotalIu),
      iuRevenueCompletionToDate: plannedRevenueToDate > 0 ? roundRate(revenueTotalIu / plannedRevenueToDate) : null,
      iuRevenueWbPlan: roundMoney(contractMonthTargetWb || plan.iuRevenueWb),
      iuRevenueWbPlanToDate: roundMoney(plannedRevenueWbToDate),
      iuRevenueWbFactToDate: roundMoney(revenueWb),
      iuRevenueWbCompletionToDate: plannedRevenueWbToDate > 0 ? roundRate(revenueWb / plannedRevenueWbToDate) : null,
      iuRevenueOzonPlan: roundMoney(plan.iuRevenueOzon),
      iuRevenueOzonPlanToDate: roundMoney(plannedRevenueOzonToDate),
      iuRevenueOzonFactToDate: roundMoney(revenueOzon),
      iuRevenueOzonCompletionToDate: plannedRevenueOzonToDate > 0 ? roundRate(revenueOzon / plannedRevenueOzonToDate) : null,
      iuAdsPlan: roundMoney((contractMonthTargetWb || plan.iuRevenueWb) * planPctForMonth(iuPlan, month)),
      iuAdsPlanToDate: roundMoney(plannedAdsWbToDate),
      iuAdsOzonPlan: roundMoney(plan.iuAdsOzon),
      iuAdsOzonPlanToDate: roundMoney(plannedAdsOzonToDate),
      iuAdsTotalPlan: roundMoney(plan.iuAdsTotal),
      iuAdsTotalPlanToDate: roundMoney(plannedAdsToDate),
      iuAdsFactWbToDate: roundMoney(spendFact),
      iuAdsFactWbTotalToDate: roundMoney(spendFactTotal),
      iuAdsFactOzonToDate: roundMoney(spendFactOzon),
      iuAdsFactTotalToDate: roundMoney(spendFactIu),
      iuAdsFactTotalWithExternalToDate: roundMoney(spendFactTotalIu),
      iuAdsCompletionToDate: plannedAdsWbToDate > 0 ? roundRate(spendFact / plannedAdsWbToDate) : null,
      iuAdsCompletionOzonToDate: plannedAdsOzonToDate > 0 ? roundRate(spendFactOzon / plannedAdsOzonToDate) : null,
      iuAdsCompletionTotalToDate: plannedAdsToDate > 0 ? roundRate(spendFactIu / plannedAdsToDate) : null,
      targetRevenueWb: roundMoney(targetRevenueWb),
      revenueWbDelta: roundMoney(revenueWbDelta),
      revenueWbDeltaPct: targetRevenueWb > 0 ? roundRate(revenueWbDelta / targetRevenueWb) : null,
      revenueWbCompletionPct: targetRevenueWb > 0 ? roundRate(revenueWb / targetRevenueWb) : null,
      targetRevenueOzon: roundMoney(targetRevenueOzon),
      revenueOzonDelta: roundMoney(revenueOzonDelta),
      revenueOzonDeltaPct: targetRevenueOzon > 0 ? roundRate(revenueOzonDelta / targetRevenueOzon) : null,
      revenueOzonCompletionPct: targetRevenueOzon > 0 ? roundRate(revenueOzon / targetRevenueOzon) : null,
      planPctOzon: roundRate(ozonPlanPctForMonth(iuPlan, month)),
      planSpendOzon: roundMoney(planSpendOzon),
      revenueWb: roundMoney(revenueWb),
      ordersRevenueWb: roundMoney(ordersRevenueWb),
      adsPctBaseWb: roundMoney(adsPctBaseWb),
      revenueOzon: roundMoney(revenueOzon),
      spendFact: roundMoney(spendFact),
      spendFactDrr: roundMoney(spendFact),
      spendFactTotal: roundMoney(spendFactTotal),
      spendFactOzon: roundMoney(spendFactOzon),
      spendFactIu: roundMoney(spendFactIu),
      spendFactTotalIu: roundMoney(spendFactTotalIu),
      externalAds: roundMoney(externalAds),
      planSpendWb: roundMoney(planSpendWb),
      contractMarketingPlanWb: roundMoney(contractMarketingPlanWb),
      managementPlanSpendWb: roundMoney(managementPlanSpendWb),
      drrWb: adsPctBaseWb > 0 ? roundRate(spendFact / adsPctBaseWb) : null,
      drrOzon: revenueOzon > 0 ? roundRate(spendFactOzon / revenueOzon) : null,
      drrIu: adsPctBaseIu > 0 ? roundRate(spendFactIu / adsPctBaseIu) : null,
      spendDelta: roundMoney(spendFact - planSpendWb),
      spendDeltaPct: planSpendWb > 0 ? roundRate((spendFact - planSpendWb) / planSpendWb) : null,
      ordersAdPct: ordersRevenueWb > 0 ? roundRate(spendFact / ordersRevenueWb) : null,
      spendDeltaOzon: roundMoney(spendDeltaOzon),
      spendDeltaOzonPct: planSpendOzon > 0 ? roundRate(spendDeltaOzon / planSpendOzon) : null,
      spendDeltaIu: roundMoney(spendDeltaIu),
      spendDeltaIuPct: planSpendWb + planSpendOzon > 0 ? roundRate(spendDeltaIu / (planSpendWb + planSpendOzon)) : null,
      ozonAdsFactMode: ozonAdsFactModes.length === 1 ? ozonAdsFactModes[0] : ozonAdsFactModes.join('+'),
      planPct: roundRate(planPctForMonth(iuPlan, month)),
      externalAdsExcludedFromDrr: true,
      ozonAdsViews: sumRows(rows, 'ozonAdsViews'),
      ozonAdsClicks: sumRows(rows, 'ozonAdsClicks'),
      ozonAdsOrders: sumRows(rows, 'ozonAdsOrders'),
      ozonAdsRevenue: roundMoney(sumRows(rows, 'ozonAdsRevenue')),
      ozonAdsSourceRows: sumRows(rows, 'ozonAdsSourceRows'),
      channels: Object.fromEntries(CHANNEL_KEYS.map(([key, label]) => [key, {
        key,
        label,
        spend: roundMoney(sumRows(rows, key))
      }])),
      reviewPointsFeedbacks: sumRows(rows, 'reviewPointsFeedbacks')
    };
  }).sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function buildContractPeriodRows(dailyRows) {
  return WB_CONTRACT.halfYears.map((period) => {
    const from = maxDate(period.from, WB_CONTRACT.salesPeriodStart);
    const to = minDate(period.to, WB_CONTRACT.salesPeriodEnd);
    const rows = dailyRows.filter((row) => row.date >= from && row.date <= to);
    const targetRevenue = contractTargetRevenueWbForRange(from, to);
    const loadedTargetRevenue = sumRows(rows, 'targetRevenueWb');
    const factRevenue = sumRows(rows, 'revenueWb');
    const ordersRevenue = sumRows(rows, 'ordersRevenueWb');
    const marketingPlan = factRevenue * numberOrZero(WB_CONTRACT.marketingRate);
    const marketingSpend = sumRows(rows, 'spendFact');
    return {
      key: period.key,
      from,
      to,
      loadedFrom: rows[0]?.date || '',
      loadedTo: rows[rows.length - 1]?.date || '',
      loadedDays: rows.length,
      targetRevenue: roundMoney(targetRevenue),
      thresholdRevenue: roundMoney(targetRevenue * numberOrZero(WB_CONTRACT.thresholdRate)),
      stornoCancelRevenue: roundMoney(targetRevenue * numberOrZero(WB_CONTRACT.stornoCancelRate)),
      loadedTargetRevenue: roundMoney(loadedTargetRevenue),
      factRevenue: roundMoney(factRevenue),
      ordersRevenue: roundMoney(ordersRevenue),
      revenueCompletionToLoadedTarget: loadedTargetRevenue > 0 ? roundRate(factRevenue / loadedTargetRevenue) : null,
      revenueCompletionToPeriodTarget: targetRevenue > 0 ? roundRate(factRevenue / targetRevenue) : null,
      marketingRate: roundRate(WB_CONTRACT.marketingRate),
      marketingPlan: roundMoney(marketingPlan),
      marketingSpend: roundMoney(marketingSpend),
      marketingCompletion: marketingPlan > 0 ? roundRate(marketingSpend / marketingPlan) : null,
      drrWb: factRevenue > 0 ? roundRate(marketingSpend / factRevenue) : null,
      ordersAdPct: ordersRevenue > 0 ? roundRate(marketingSpend / ordersRevenue) : null
    };
  });
}

function buildOzonQuarterSummary(dailyRows) {
  const from = WB_CONTRACT.salesPeriodStart;
  const to = dailyRows.map((row) => row.date).filter(Boolean).sort().pop() || '';
  if (!from || !to || from > to) {
    return {
      status: 'empty',
      from,
      to,
      label: '',
      days: 0,
      targetRevenueOzon: 0,
      revenueOzon: 0,
      revenueDeltaOzon: 0,
      planPctOzon: roundRate(DEFAULT_OZON_PLAN_PCT),
      planSpendOzon: 0,
      spendFactOzon: 0,
      factPctOzon: null,
      spendDeltaOzon: 0
    };
  }
  const rows = dailyRows.filter((row) => row.date >= from && row.date <= to);
  const targetRevenueOzon = roundMoney(sumRows(rows, 'targetRevenueOzon'));
  const revenueOzon = roundMoney(sumRows(rows, 'revenueOzon'));
  const planSpendOzon = roundMoney(sumRows(rows, 'planSpendOzon'));
  const spendFactOzon = roundMoney(sumRows(rows, 'spendFactOzon'));
  const revenueDeltaOzon = roundMoney(revenueOzon - targetRevenueOzon);
  const spendDeltaOzon = roundMoney(spendFactOzon - planSpendOzon);
  return {
    status: rows.length ? 'ok' : 'empty',
    from,
    to,
    label: `${String(from).slice(8, 10)}.${String(from).slice(5, 7)}-${String(to).slice(8, 10)}.${String(to).slice(5, 7)}`,
    days: rows.length,
    targetRevenueOzon,
    revenueOzon,
    revenueDeltaOzon,
    revenueDeltaPctOzon: targetRevenueOzon > 0 ? roundRate(revenueDeltaOzon / targetRevenueOzon) : null,
    revenueCompletionPctOzon: targetRevenueOzon > 0 ? roundRate(revenueOzon / targetRevenueOzon) : null,
    planPctOzon: targetRevenueOzon > 0 ? roundRate(planSpendOzon / targetRevenueOzon) : roundRate(DEFAULT_OZON_PLAN_PCT),
    planSpendOzon,
    spendFactOzon,
    factPctOzon: revenueOzon > 0 ? roundRate(spendFactOzon / revenueOzon) : null,
    spendDeltaOzon,
    spendDeltaPctOzon: planSpendOzon > 0 ? roundRate(spendDeltaOzon / planSpendOzon) : null,
    sourceLabel: 'Ozon Analytics API + iu_plan.json + ads_summary.json'
  };
}

function buildChannelRows(dailyRows, adsSummary = {}, wbFeedbacksSummary = {}) {
  const adsSourceMode = String(adsSummary.sourceMode || adsSummary.source || '');
  const wbAdsSource = adsSourceMode.includes('google-sheets-fact-ads')
    ? 'Google Sheets fact_ads_daily_sku'
    : 'WB Promotion API';
  const reviewPointsSource = numberOrZero(wbFeedbacksSummary?.reviewsForPoints?.spend) > 0
    ? 'WB Feedbacks API'
    : '';
  return CHANNEL_KEYS.map(([key, label]) => ({
    key,
    label,
    spend: roundMoney(sumRows(dailyRows, key)),
    source: key === 'wbPromotion' || key === 'wbMedia'
      ? wbAdsSource
      : key === 'reviewPoints' && (reviewPointsSource || sumRows(dailyRows, key) > 0)
        ? (reviewPointsSource || 'WB ads source')
      : key === 'externalAds' && (adsSourceMode.includes('external-sheet') || sumRows(dailyRows, key) > 0)
        ? 'Google Sheets внешка'
        : 'нет источника в v1'
  })).sort((left, right) => right.spend - left.spend || left.label.localeCompare(right.label, 'ru'));
}

function buildPayload(options) {
  const platformTrends = readLayer(options, 'platform_trends.json', { platforms: [] });
  const iuPlan = readLayer(options, 'iu_plan.json', { months: {} });
  const adsSummary = readLayer(options, 'ads_summary.json', { platforms: [], itemSeries: [] });
  const wbFeedbacksSummary = readLayer(options, 'wb_feedbacks_summary.json', { reviewsForPoints: {}, daily: [], cards: [] });
  const dailyRows = buildDailyRows(platformTrends, iuPlan, adsSummary, wbFeedbacksSummary, options);
  const months = buildMonthRows(dailyRows, iuPlan);
  const contractPeriods = buildContractPeriodRows(dailyRows);
  const currentMonth = months[months.length - 1] || null;
  const channels = buildChannelRows(dailyRows, adsSummary, wbFeedbacksSummary);
  const asOfDate = dailyRows.map((row) => row.date).filter(Boolean).sort().pop() || isoDate(platformTrends?.latestMarketplaceDate) || isoDate(adsSummary?.asOfDate) || '';
  const wbQuarter = buildQuarterSummary(dailyRows, asOfDate);
  const ozonQuarter = buildOzonQuarterSummary(dailyRows);
  const noSourceChannels = channels
    .filter((channel) => channel.source !== 'Google Sheets fact_ads_daily_sku')
    .filter((channel) => !['WB Promotion API', 'WB Feedbacks API', 'Google Sheets внешка'].includes(channel.source))
    .map((channel) => channel.label);
  return {
    generatedAt: new Date().toISOString(),
    asOfDate,
    source: {
      iuPlanGeneratedAt: iuPlan.generatedAt || '',
      platformTrendsGeneratedAt: platformTrends.generatedAt || '',
      adsSummaryGeneratedAt: adsSummary.generatedAt || '',
      wbFeedbacksGeneratedAt: wbFeedbacksSummary.generatedAt || '',
      adsSourceMode: adsSummary.sourceMode || adsSummary.source || ''
    },
    window: {
      from: dailyRows[0]?.date || '',
      to: dailyRows[dailyRows.length - 1]?.date || '',
      days: dailyRows.length
    },
    contract: {
      ...WB_CONTRACT,
      activeTargetRevenue: roundMoney(contractTargetRevenueWbForRange(WB_CONTRACT.salesPeriodStart, WB_CONTRACT.salesPeriodEnd)),
      activeMarketingPlanAtTarget: roundMoney(
        contractTargetRevenueWbForRange(WB_CONTRACT.salesPeriodStart, WB_CONTRACT.salesPeriodEnd)
        * numberOrZero(WB_CONTRACT.marketingRate)
      )
    },
    planPctDefault: DEFAULT_PLAN_PCT,
    ozonPlanPctDefault: DEFAULT_OZON_PLAN_PCT,
    kpis: currentMonth,
    wbQuarter,
    ozonQuarter,
    quarterSummary: wbQuarter,
    contractPeriods,
    months,
    channels,
    daily: dailyRows,
    diagnostics: {
      adsSourceMode: adsSummary.sourceMode || adsSummary.source || '',
      adsDiagnostics: adsSummary.diagnostics || {},
      wbFeedbacksDiagnostics: wbFeedbacksSummary.diagnostics || {},
      reviewPointsSource: wbFeedbacksSummary?.reviewsForPoints?.sourceStatus || '',
      noSourceChannels,
      unmatchedNmIds: adsSummary.diagnostics?.unmatchedNmIds || [],
      notes: [
        'Ozon ad spend comes from Ozon Seller Finance API daily advertising operations when present; planPctOzon remains the plan benchmark.',
        'Review points are filled from WB Feedbacks API supplierFeedbackValuation when present.',
        'WB contract logic: factual turnover is sales minus returns, without WB deductions; it maps to revenueWb / finance turnover.',
        'WB marketing plan is 8% of factual turnover. ordersRevenueWb is retained as a report-control field, not as the contract DRR denominator.',
        'WB quarter summary combines report workbook sales/orders with March-April DRR rows and the current May daily IU/DRR layer. DRR by contract uses sales/buyouts; the control advertising percentage uses orders revenue.',
        'ИУ по обороту в workbook сверяется по WB; Ozon ведётся отдельным контуром.',
        'ДРР и каналы рекламы считаются по WB.',
        'Каналы без источника показываются нулем до подключения отдельного источника.'
      ]
    }
  };
}

function writeOutputs(payload, options) {
  const files = [];
  if (options.outputDir) {
    const outputPath = path.join(options.outputDir, 'iu_drr_summary.json');
    writeJson(outputPath, payload);
    files.push(outputPath);
  }
  if (options.mirrorLocalFallback && options.mirrorDataDir) {
    const mirrorPath = path.join(options.mirrorDataDir, 'iu_drr_summary.json');
    const outputPath = options.outputDir ? path.resolve(options.outputDir, 'iu_drr_summary.json') : '';
    if (path.resolve(mirrorPath) !== outputPath) {
      writeJson(mirrorPath, payload);
      files.push(mirrorPath);
    }
  }
  return files;
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const payload = buildPayload(options);
  const writtenFiles = options.dryRun ? [] : writeOutputs(payload, options);
  console.log(JSON.stringify({
    dryRun: options.dryRun,
    asOfDate: payload.asOfDate,
    window: payload.window,
    currentMonth: payload.kpis?.monthKey || '',
    revenueFact: payload.kpis?.iuRevenueFactToDate || 0,
    spendFact: payload.kpis?.spendFact || 0,
    drrWb: payload.kpis?.drrWb ?? null,
    dailyRows: payload.daily.length,
    writtenFiles
  }, null, 2));
}

main();
