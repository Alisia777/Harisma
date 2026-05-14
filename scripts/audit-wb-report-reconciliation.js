#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const HEADERS = {
  day: 'День',
  ordersRevenue: 'Сумма заказов по розничным ценам с учётом согласованной скидки, руб.',
  orderedUnits: 'Заказано, шт.',
  ordersCount: 'Количество заказов',
  salesRevenue: 'Сумма продаж по розничным ценам с учётом согласованной скидки, руб.',
  buyoutUnits: 'Выкупили, шт.',
  turnoverDays: 'Оборачиваемость, дней',
  payForGoods: 'К перечислению за товар, руб.',
  totalPay: 'Итого к перечислению, руб.'
};

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
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function round(value, precision = 0) {
  const factor = 10 ** precision;
  return Math.round(numberOrZero(value) * factor) / factor;
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function averagePositive(values) {
  const positive = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return positive.length ? positive.reduce((sum, value) => sum + value, 0) / positive.length : 0;
}

function readReportRows(reportPath) {
  const workbook = XLSX.readFile(reportPath, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true })
    .map((row) => ({
      date: isoDate(row[HEADERS.day]),
      ordersRevenue: numberOrZero(row[HEADERS.ordersRevenue]),
      orderedUnits: numberOrZero(row[HEADERS.orderedUnits]),
      ordersCount: numberOrZero(row[HEADERS.ordersCount]),
      salesRevenue: numberOrZero(row[HEADERS.salesRevenue]),
      buyoutUnits: numberOrZero(row[HEADERS.buyoutUnits]),
      turnoverDays: numberOrZero(row[HEADERS.turnoverDays]),
      payForGoods: numberOrZero(row[HEADERS.payForGoods]),
      totalPay: numberOrZero(row[HEADERS.totalPay])
    }))
    .filter((row) => row.date && row.ordersRevenue > 0);
}

function summarizeReport(rows, from, to) {
  const selected = rows.filter((row) => row.date >= from && row.date <= to);
  const ordersRevenue = selected.reduce((sum, row) => sum + row.ordersRevenue, 0);
  const orderedUnits = selected.reduce((sum, row) => sum + row.orderedUnits, 0);
  const ordersCount = selected.reduce((sum, row) => sum + row.ordersCount, 0);
  const salesRevenue = selected.reduce((sum, row) => sum + row.salesRevenue, 0);
  const buyoutUnits = selected.reduce((sum, row) => sum + row.buyoutUnits, 0);
  const payForGoods = selected.reduce((sum, row) => sum + row.payForGoods, 0);
  const totalPay = selected.reduce((sum, row) => sum + row.totalPay, 0);
  return {
    days: selected.length,
    ordersRevenue: round(ordersRevenue),
    orderedUnits: round(orderedUnits),
    ordersCount: round(ordersCount),
    salesRevenue: round(salesRevenue),
    buyoutUnits: round(buyoutUnits),
    payForGoods: round(payForGoods),
    totalPay: round(totalPay),
    avgCheckByUnits: orderedUnits > 0 ? round(ordersRevenue / orderedUnits) : 0,
    avgCheckByOrders: ordersCount > 0 ? round(ordersRevenue / ordersCount) : 0,
    turnoverDaysAvg: round(averagePositive(selected.map((row) => row.turnoverDays)), 1),
    daily: selected
  };
}

function findPlatform(platformTrends, platformKey) {
  return (platformTrends?.platforms || []).find((platform) =>
    String(platform?.key || platform?.label || '').trim().toLowerCase() === platformKey
  ) || null;
}

function summarizePlatform(platformTrends, platformKey, from, to) {
  const platform = findPlatform(platformTrends, platformKey);
  const selected = (platform?.series || [])
    .map((point) => ({ ...point, dateKey: isoDate(point?.date || point?.label) }))
    .filter((point) => point.dateKey >= from && point.dateKey <= to);

  const turnoverValues = [];
  const totals = selected.reduce((acc, point) => {
    const sellerSummary = point?.wbSellerSummary && typeof point.wbSellerSummary === 'object'
      ? point.wbSellerSummary
      : {};
    const financeTurnover = firstFinite(
      point?.wbSellerSummaryFinanceTurnover,
      point?.financeTurnover,
      sellerSummary.financeTurnover,
      sellerSummary.salesRevenue
    );
    const financialResult = firstFinite(
      point?.wbSellerSummaryPayForGoods,
      point?.financialResult,
      sellerSummary.financialResult,
      sellerSummary.payForGoods,
      point?.estimatedMargin
    );
    const turnoverDays = firstFinite(point?.wbSellerSummaryTurnoverDays, sellerSummary.turnoverDays);
    acc.ordersRevenue += firstFinite(point?.wbSellerSummaryReferenceRevenue, point?.revenue);
    acc.orderedUnits += firstFinite(point?.wbSellerSummaryReferenceUnits, point?.units);
    acc.financeTurnover += financeTurnover;
    acc.financialResult += financialResult;
    acc.estimatedMargin += firstFinite(point?.estimatedMargin);
    acc.totalPay += firstFinite(point?.wbSellerSummaryTotalPay, sellerSummary.totalPay);
    if (turnoverDays > 0) turnoverValues.push(turnoverDays);
    return acc;
  }, {
    days: selected.length,
    ordersRevenue: 0,
    orderedUnits: 0,
    financeTurnover: 0,
    financialResult: 0,
    estimatedMargin: 0,
    totalPay: 0
  });

  return {
    ...totals,
    ordersRevenue: round(totals.ordersRevenue),
    orderedUnits: round(totals.orderedUnits),
    financeTurnover: round(totals.financeTurnover),
    financialResult: round(totals.financialResult),
    estimatedMargin: round(totals.estimatedMargin),
    totalPay: round(totals.totalPay),
    avgCheckByUnits: totals.orderedUnits > 0 ? round(totals.ordersRevenue / totals.orderedUnits) : 0,
    turnoverDaysAvg: round(averagePositive(turnoverValues), 1)
  };
}

function summarizeIuDrr(iuDrr, from, to) {
  const selected = (iuDrr?.daily || []).filter((row) => isoDate(row?.date) >= from && isoDate(row?.date) <= to);
  const ordersRevenueWb = selected.reduce((sum, row) => sum + numberOrZero(row?.ordersRevenueWb), 0);
  const adPctBaseWb = selected.reduce((sum, row) => sum + numberOrZero(row?.adsPctBaseWb || row?.revenueWb), 0);
  const spendFact = selected.reduce((sum, row) => sum + numberOrZero(row?.spendFact), 0);
  return {
    days: selected.length,
    revenueWb: round(selected.reduce((sum, row) => sum + numberOrZero(row?.revenueWb), 0)),
    ordersRevenueWb: round(ordersRevenueWb),
    adPctBaseWb: round(adPctBaseWb),
    spendFact: round(spendFact, 2),
    drrWb: adPctBaseWb > 0 ? round(spendFact / adPctBaseWb, 6) : null
  };
}

function diff(actual, expected) {
  return round(actual - expected, 2);
}

function addCheck(checks, name, actual, expected, tolerance = 0.5) {
  const delta = diff(actual, expected);
  checks.push({
    name,
    actual,
    expected,
    delta,
    ok: Math.abs(delta) <= tolerance
  });
}

function main() {
  const args = parseArgs(process.argv);
  const root = process.cwd();
  const reportPath = path.resolve(args.report || args.xlsx || path.join(process.env.USERPROFILE || root, 'Downloads', 'report 2026-5-13.xlsx'));
  const from = isoDate(args.from || args['date-from']) || '2026-05-07';
  const to = isoDate(args.to || args['date-to']) || '2026-05-13';
  const inputDir = path.resolve(args['input-dir'] || path.join(root, 'data'));
  const report = summarizeReport(readReportRows(reportPath), from, to);
  const platformTrends = readJson(path.join(inputDir, 'platform_trends.json'), {});
  const iuDrr = readJson(path.join(inputDir, 'iu_drr_summary.json'), {});
  const wb = summarizePlatform(platformTrends, 'wb', from, to);
  const all = summarizePlatform(platformTrends, 'all', from, to);
  const iu = summarizeIuDrr(iuDrr, from, to);

  const checks = [];
  addCheck(checks, 'WB orders revenue', wb.ordersRevenue, report.ordersRevenue);
  addCheck(checks, 'WB ordered units', wb.orderedUnits, report.orderedUnits);
  addCheck(checks, 'WB avg check by units', wb.avgCheckByUnits, report.avgCheckByUnits);
  addCheck(checks, 'WB finance turnover / sales revenue', wb.financeTurnover, report.salesRevenue);
  addCheck(checks, 'WB financial result / pay for goods', wb.financialResult, report.payForGoods);
  addCheck(checks, 'WB total pay', wb.totalPay, report.totalPay);
  addCheck(checks, 'WB turnover days avg', wb.turnoverDaysAvg, report.turnoverDaysAvg, 0.05);
  addCheck(checks, 'IU/DRR revenueWb', iu.revenueWb, report.salesRevenue);
  addCheck(checks, 'IU/DRR contract ad pct base', iu.adPctBaseWb, report.salesRevenue);
  addCheck(checks, 'IU/DRR ordersRevenueWb control', iu.ordersRevenueWb, report.ordersRevenue);
  addCheck(checks, 'WB estimatedMargin normalized', wb.estimatedMargin, report.payForGoods);

  const payload = {
    reportPath,
    inputDir,
    range: { from, to },
    report,
    portal: {
      generatedAt: platformTrends.generatedAt || '',
      wb,
      all,
      iuDrr: iu
    },
    checks,
    ok: checks.every((item) => item.ok)
  };

  console.log(JSON.stringify(payload, null, 2));
  if (!payload.ok) process.exitCode = 1;
}

main();
