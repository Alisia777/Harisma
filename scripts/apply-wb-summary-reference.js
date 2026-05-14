#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ORDERS_REVENUE_HEADER = 'Сумма заказов по розничным ценам с учётом согласованной скидки, руб.';
const ORDERS_UNITS_HEADER = 'Заказано, шт.';
const ORDERS_COUNT_HEADER = 'Количество заказов';
const SALES_REVENUE_HEADER = 'Сумма продаж по розничным ценам с учётом согласованной скидки, руб.';
const BUYOUT_UNITS_HEADER = 'Выкупили, шт.';
const MARKUP_COEF_HEADER = 'Коэффициент наценки продаж по оплатам';
const BUYOUT_PCT_HEADER = 'Процент выкупа';
const TURNOVER_DAYS_HEADER = 'Оборачиваемость, дней';
const PAY_FOR_GOODS_HEADER = 'К перечислению за товар, руб.';
const LOGISTICS_HEADER = 'Стоимость логистики, руб.';
const STORAGE_HEADER = 'Стоимость хранения, руб.';
const FINES_HEADER = 'Штрафы, руб.';
const ADDITIONAL_PAYMENTS_HEADER = 'Доплаты, руб.';
const DAMAGE_COMPENSATION_HEADER = 'Компенсация ущерба, руб.';
const VOLUNTARY_RETURN_COMPENSATION_HEADER = 'Добровольная компенсация при возврате, руб.';
const ACCEPTANCE_OPERATIONS_HEADER = 'Операции при приемке, руб.';
const TOTAL_PAY_HEADER = 'Итого к перечислению, руб.';

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function findHeader(keys, header, fallbackIndex) {
  return keys.find((key) => key === header) || keys[fallbackIndex];
}

function isoFromExcelDate(value) {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  return '';
}

function readReferenceRows(xlsxPath) {
  const workbook = XLSX.readFile(xlsxPath, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  if (!rows.length) return [];

  const keys = Object.keys(rows[0]);
  const dayKey = findHeader(keys, 'День', 2);
  const revenueKey = findHeader(keys, ORDERS_REVENUE_HEADER, 3);
  const unitsKey = findHeader(keys, ORDERS_UNITS_HEADER, 4);
  const ordersCountKey = findHeader(keys, ORDERS_COUNT_HEADER, 5);
  const salesRevenueKey = findHeader(keys, SALES_REVENUE_HEADER, 6);
  const buyoutUnitsKey = findHeader(keys, BUYOUT_UNITS_HEADER, 7);
  const markupCoefKey = findHeader(keys, MARKUP_COEF_HEADER, 8);
  const buyoutPctKey = findHeader(keys, BUYOUT_PCT_HEADER, 9);
  const turnoverDaysKey = findHeader(keys, TURNOVER_DAYS_HEADER, 10);
  const payForGoodsKey = findHeader(keys, PAY_FOR_GOODS_HEADER, 11);
  const logisticsKey = findHeader(keys, LOGISTICS_HEADER, 12);
  const storageKey = findHeader(keys, STORAGE_HEADER, 13);
  const finesKey = findHeader(keys, FINES_HEADER, 14);
  const additionalPaymentsKey = findHeader(keys, ADDITIONAL_PAYMENTS_HEADER, 15);
  const damageCompensationKey = findHeader(keys, DAMAGE_COMPENSATION_HEADER, 16);
  const voluntaryReturnCompensationKey = findHeader(keys, VOLUNTARY_RETURN_COMPENSATION_HEADER, 17);
  const acceptanceOperationsKey = findHeader(keys, ACCEPTANCE_OPERATIONS_HEADER, 18);
  const totalPayKey = findHeader(keys, TOTAL_PAY_HEADER, 19);

  return rows
    .map((row) => {
      const ordersRevenue = Math.round(numberOrZero(row[revenueKey]));
      const ordersUnits = numberOrZero(row[unitsKey]);
      const salesRevenue = roundMoney(row[salesRevenueKey]);
      const payForGoods = roundMoney(row[payForGoodsKey]);
      const totalPay = roundMoney(row[totalPayKey]);
      return {
        date: isoFromExcelDate(row[dayKey]),
        revenue: ordersRevenue,
        units: ordersUnits,
        sellerSummary: {
          source: 'wb-seller-summary-xlsx',
          ordersRevenue,
          ordersUnits,
          ordersCount: numberOrZero(row[ordersCountKey]),
          salesRevenue,
          buyoutUnits: numberOrZero(row[buyoutUnitsKey]),
          markupCoef: numberOrNull(row[markupCoefKey]),
          buyoutPct: numberOrNull(row[buyoutPctKey]),
          turnoverDays: numberOrNull(row[turnoverDaysKey]),
          payForGoods,
          logistics: roundMoney(row[logisticsKey]),
          storage: roundMoney(row[storageKey]),
          fines: roundMoney(row[finesKey]),
          additionalPayments: roundMoney(row[additionalPaymentsKey]),
          damageCompensation: roundMoney(row[damageCompensationKey]),
          voluntaryReturnCompensation: roundMoney(row[voluntaryReturnCompensationKey]),
          acceptanceOperations: roundMoney(row[acceptanceOperationsKey]),
          totalPay,
          financeTurnover: salesRevenue,
          financialResult: payForGoods
        }
      };
    })
    .filter((row) => row.date && row.revenue > 0);
}

function withReferenceFields(point, reference) {
  const sellerSummary = reference.sellerSummary || {};
  return {
    ...point,
    units: reference.units || point.units,
    revenue: reference.revenue,
    wbSellerSummary: sellerSummary,
    wbSellerSummaryReferenceRevenue: reference.revenue,
    wbSellerSummaryReferenceUnits: reference.units || null,
    wbSellerSummaryFinanceTurnover: sellerSummary.financeTurnover || null,
    wbSellerSummarySalesRevenue: sellerSummary.salesRevenue || null,
    wbSellerSummaryBuyoutUnits: sellerSummary.buyoutUnits || null,
    wbSellerSummaryPayForGoods: sellerSummary.payForGoods || null,
    wbSellerSummaryTotalPay: sellerSummary.totalPay || null,
    wbSellerSummaryTurnoverDays: sellerSummary.turnoverDays,
    financeTurnover: sellerSummary.financeTurnover || point.financeTurnover || null,
    financialResult: sellerSummary.financialResult || point.financialResult || null
  };
}

function applyReference(platformTrends, referenceRows) {
  const referenceMap = new Map(referenceRows.map((row) => [row.date, row]));
  const platforms = Array.isArray(platformTrends.platforms) ? platformTrends.platforms : [];
  const wbPlatform = platforms.find((platform) => String(platform?.key || '').toLowerCase() === 'wb');
  if (!wbPlatform || !Array.isArray(wbPlatform.series)) {
    throw new Error('WB platform series was not found in platform_trends.json');
  }

  let changed = 0;
  const appliedDates = [];
  wbPlatform.series = wbPlatform.series.map((point) => {
    const date = isoFromExcelDate(point?.label || point?.date);
    const reference = referenceMap.get(date);
    if (!reference) return point;
    appliedDates.push(date);
    const oldRevenue = Math.round(numberOrZero(point.revenue));
    const oldUnits = numberOrZero(point.units);
    if (oldRevenue !== reference.revenue || Math.round(oldUnits) !== Math.round(reference.units)) changed += 1;
    return withReferenceFields(point, reference);
  });

  platformTrends.wbSellerSummaryReference = {
    source: 'wb-seller-summary-xlsx',
    revenueField: ORDERS_REVENUE_HEADER,
    financeTurnoverField: SALES_REVENUE_HEADER,
    financialResultField: PAY_FOR_GOODS_HEADER,
    turnoverDaysField: TURNOVER_DAYS_HEADER,
    appliedAt: new Date().toISOString(),
    matchedDays: appliedDates.length,
    changedDays: changed,
    dates: appliedDates.sort()
  };

  if (platformTrends.wbApiDirect) {
    platformTrends.wbApiDirect.revenueField = 'ordersSumRub / seller-summary-reference';
    platformTrends.wbApiDirect.revenueSource = 'seller-analytics-api:GROUPED_HISTORY_REPORT + wb seller summary reconciliation';
  }

  return changed;
}

function main() {
  const args = parseArgs(process.argv);
  const xlsxPath = path.resolve(args.xlsx || args.file || '');
  if (!xlsxPath || !fs.existsSync(xlsxPath)) {
    throw new Error(`Reference xlsx was not found: ${xlsxPath || '(empty)'}`);
  }

  const trendsPath = path.resolve(args['platform-trends'] || path.join(process.cwd(), 'data', 'platform_trends.json'));
  const outputPath = path.resolve(args.output || trendsPath);
  const platformTrends = readJson(trendsPath);
  const referenceRows = readReferenceRows(xlsxPath);
  const changed = applyReference(platformTrends, referenceRows);
  writeJson(outputPath, platformTrends);
  console.log(`Applied WB seller summary reference to ${changed} day(s): ${outputPath}`);
}

if (require.main === module) {
  main();
}
