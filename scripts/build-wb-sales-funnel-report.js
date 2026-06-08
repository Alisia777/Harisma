#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_INPUT = process.env.WB_FUNNEL_REPORT || '';
const DEFAULT_OUTPUT = path.join('data', 'wb_sales_funnel_report.json');

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asText(value) {
  return String(value ?? '').trim();
}

function excelDateToIso(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const text = asText(value);
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const ru = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  return '';
}

function dateDiffDays(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function periodLabel(period) {
  if (!period?.from || !period?.to) return '';
  const short = (iso) => {
    const [year, month, day] = iso.split('-');
    return `${day}.${month}.${year}`;
  };
  return `${short(period.from)} - ${short(period.to)}`;
}

function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function readPeriod(workbook) {
  const rows = sheetRows(workbook, 'Общая информация').flat().map(asText).filter(Boolean);
  const result = { from: '', to: '', days: 0, label: '' };
  const previous = { from: '', to: '', days: 0, label: '' };
  rows.forEach((cell) => {
    const match = cell.match(/С\s+(\d{4}-\d{2}-\d{2})\s+по\s+(\d{4}-\d{2}-\d{2})/i);
    if (!match) return;
    const target = result.from ? previous : result;
    target.from = match[1];
    target.to = match[2];
    target.days = dateDiffDays(target.from, target.to);
    target.label = periodLabel(target);
  });
  return { period: result, previousPeriod: previous };
}

function makeHeaderMap(headers) {
  const map = new Map();
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

function pick(row, headerMap, names, mode = 'number') {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const index = headerMap.get(normalizeHeader(name));
    if (index !== undefined) {
      const value = row[index];
      return mode === 'text' ? asText(value) : asNumber(value);
    }
  }
  return mode === 'text' ? '' : 0;
}

function readItems(workbook) {
  const rows = sheetRows(workbook, 'Товары');
  if (rows.length < 3) return [];
  const headerMap = makeHeaderMap(rows[1] || []);

  return rows.slice(2)
    .map((row) => {
      const article = pick(row, headerMap, ['Артикул продавца', 'Артикул'], 'text');
      const nmId = pick(row, headerMap, 'Артикул WB', 'text');
      if (!article && !nmId) return null;
      return {
        articleKey: normalizeKey(article || nmId),
        article,
        nmId,
        brand: pick(row, headerMap, 'Бренд', 'text'),
        subject: pick(row, headerMap, 'Предмет', 'text'),
        name: pick(row, headerMap, ['Название', 'Наименование'], 'text'),
        cardRating: pick(row, headerMap, 'Рейтинг карточки'),
        reviewRating: pick(row, headerMap, 'Рейтинг по отзывам'),
        views: pick(row, headerMap, 'Показы'),
        clicks: pick(row, headerMap, 'Переходы в карточку'),
        carts: pick(row, headerMap, 'Положили в корзину'),
        ordersUnits: pick(row, headerMap, 'Заказали товаров, шт'),
        buyoutsUnits: pick(row, headerMap, 'Выкупили, шт'),
        cancellationsUnits: pick(row, headerMap, 'Отменили, шт'),
        buyoutPct: pick(row, headerMap, 'Процент выкупа'),
        previousBuyoutPct: pick(row, headerMap, 'Процент выкупа (предыдущий период)'),
        ordersRevenue: pick(row, headerMap, 'Заказали на сумму, ₽'),
        previousOrdersRevenue: pick(row, headerMap, 'Заказали на сумму, ₽ (предыдущий период)'),
        ordersRevenueDelta: pick(row, headerMap, 'Динамика суммы заказов, ₽'),
        buyoutRevenue: pick(row, headerMap, 'Выкупили на сумму, ₽'),
        previousBuyoutRevenue: pick(row, headerMap, 'Выкупили на сумму, ₽ (предыдущий период)'),
        cancelRevenue: pick(row, headerMap, 'Отменили на сумму, ₽'),
        avgPrice: pick(row, headerMap, 'Средняя цена, ₽'),
        avgOrdersPerDay: pick(row, headerMap, 'Среднее количество заказов в день, шт'),
        wbStock: pick(row, headerMap, 'Остатки «Склад WB», шт'),
        ownStock: pick(row, headerMap, 'Остатки «Мой склад», шт')
      };
    })
    .filter(Boolean);
}

function buildTotals(items) {
  return items.reduce((acc, item) => {
    acc.items += 1;
    acc.ordersRevenue += item.ordersRevenue;
    acc.previousOrdersRevenue += item.previousOrdersRevenue;
    acc.ordersUnits += item.ordersUnits;
    acc.buyoutRevenue += item.buyoutRevenue;
    acc.buyoutsUnits += item.buyoutsUnits;
    acc.cancellationsUnits += item.cancellationsUnits;
    acc.wbStock += item.wbStock;
    acc.ownStock += item.ownStock;
    return acc;
  }, {
    items: 0,
    ordersRevenue: 0,
    previousOrdersRevenue: 0,
    ordersUnits: 0,
    buyoutRevenue: 0,
    buyoutsUnits: 0,
    cancellationsUnits: 0,
    wbStock: 0,
    ownStock: 0
  });
}

function main() {
  const inputFile = argValue('--input-file', DEFAULT_INPUT);
  const outputFile = argValue('--output-file', DEFAULT_OUTPUT);
  if (!inputFile) throw new Error('Pass --input-file or WB_FUNNEL_REPORT');
  if (!fs.existsSync(inputFile)) throw new Error(`WB funnel report not found: ${inputFile}`);

  const workbook = XLSX.readFile(inputFile, { cellDates: true });
  const { period, previousPeriod } = readPeriod(workbook);
  const items = readItems(workbook);
  if (!items.length) throw new Error('No rows found on sheet "Товары"');

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'wb-sales-funnel-xlsx',
    sourceFile: path.basename(inputFile),
    period,
    previousPeriod,
    totals: buildTotals(items),
    items
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const retiderm = items.find((item) => item.articleKey === 'retiderm_50ml');
  console.log(`Wrote ${outputFile}: ${items.length} items, ${Math.round(payload.totals.ordersRevenue)} RUB`);
  if (retiderm) {
    console.log(`retiderm_50ml: ${Math.round(retiderm.ordersRevenue)} RUB, ${Math.round(retiderm.ordersUnits)} orders, rating ${retiderm.reviewRating}`);
  }
}

main();
