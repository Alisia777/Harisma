#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function buildRows(skus, multiplier) {
  return skus
    .map((row) => {
      const sku = normalizeText(row.article || row.articleKey || row.sku);
      const wbPrice = numberOrNull(row.wb?.currentPrice ?? row.wb?.price ?? row.wb?.recPrice);
      if (!sku || wbPrice === null) return null;
      const ozonPrice = numberOrNull(row.ozon?.currentPrice ?? row.ozon?.price ?? row.ozon?.recPrice);
      const ymMinPrice = numberOrNull(row.ym?.minPrice ?? row.ym?.workingZoneFrom);
      const ymMaxPrice = numberOrNull(row.ym?.maxPrice ?? row.ym?.workingZoneTo);
      return {
        sku,
        wbPrice: roundMoney(wbPrice),
        ymMinPrice: ymMinPrice === null ? '' : roundMoney(ymMinPrice),
        ymMaxPrice: ymMaxPrice === null ? '' : roundMoney(ymMaxPrice),
        ozonPrice: ozonPrice === null ? '' : roundMoney(ozonPrice),
        dariaWbPrice: roundMoney(wbPrice * multiplier),
        dariaYmPrice: ymMaxPrice === null ? '' : roundMoney(ymMaxPrice * multiplier),
        dariaOzonPrice: ozonPrice === null ? '' : roundMoney(ozonPrice * multiplier)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.sku.localeCompare(right.sku, 'ru'));
}

function renderCsv(rows) {
  const lines = [
    [
      'SKU',
      '\u0426\u0435\u043d\u0430 \u0412\u0411',
      '\u042f\u041c min',
      '\u042f\u041c max',
      '\u0426\u0435\u043d\u0430 Ozon',
      '\u0426\u0435\u043d\u0430 WB + 2%',
      '\u0426\u0435\u043d\u0430 \u042f\u041c max + 2%',
      '\u0426\u0435\u043d\u0430 Ozon + 2%'
    ]
  ];
  for (const row of rows) {
    lines.push([
      row.sku,
      row.wbPrice,
      row.ymMinPrice,
      row.ymMaxPrice,
      row.ozonPrice,
      row.dariaWbPrice,
      row.dariaYmPrice,
      row.dariaOzonPrice
    ]);
  }
  return `${lines.map((line) => line.map(csvCell).join(',')).join('\n')}\n`;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input || path.join(root, 'data', 'skus.json'));
  const outputPath = path.resolve(args.output || path.join(root, 'daria-prices.csv'));
  const summaryPath = path.resolve(args.summary || path.join(root, 'exports', 'daria-prices.summary.json'));
  const multiplier = numberOrNull(args.multiplier) ?? 1.02;

  const skus = readJson(inputPath, []);
  if (!Array.isArray(skus)) throw new Error(`${inputPath} must contain an array`);
  const rows = buildRows(skus, multiplier);
  if (!rows.length) throw new Error('No price rows generated');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderCsv(rows), 'utf8');

  const summary = {
    generatedAt: new Date().toISOString(),
    inputPath,
    outputPath,
    rowCount: rows.length,
    multiplier,
    rowsWithOzonPrice: rows.filter((row) => row.ozonPrice !== '').length,
    rowsWithYandexMarketRange: rows.filter((row) => row.ymMinPrice !== '' || row.ymMaxPrice !== '').length,
    minWbPrice: Math.min(...rows.map((row) => row.wbPrice)),
    maxWbPrice: Math.max(...rows.map((row) => row.wbPrice))
  };
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main();
