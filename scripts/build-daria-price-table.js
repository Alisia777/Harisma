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

function priceOrNull(value) {
  const parsed = numberOrNull(value);
  return parsed === null || parsed < 0 ? null : parsed;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function renderMoney(value) {
  return value === null ? '' : roundMoney(value);
}

function renderAdjustedMoney(value, multiplier) {
  return value === null ? '' : roundMoney(value * multiplier);
}

function tableCell(value, delimiter) {
  const text = String(value ?? '');
  if (delimiter === '\t') return text.replace(/[\t\r\n]+/g, ' ');
  if (text.includes(delimiter) || /["\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
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
      const wbRawPrice = numberOrNull(row.wb?.currentPrice ?? row.wb?.price ?? row.wb?.recPrice);
      if (!sku || wbRawPrice === null) return null;
      const wbPrice = priceOrNull(wbRawPrice);
      const ozonPrice = priceOrNull(row.ozon?.currentPrice ?? row.ozon?.price ?? row.ozon?.recPrice);
      const ymMinPrice = priceOrNull(row.ym?.minPrice ?? row.ym?.workingZoneFrom);
      const ymMaxPrice = priceOrNull(row.ym?.maxPrice ?? row.ym?.workingZoneTo);
      return {
        sku,
        wbPrice: renderMoney(wbPrice),
        ymMinPrice: renderMoney(ymMinPrice),
        ymMaxPrice: renderMoney(ymMaxPrice),
        ozonPrice: renderMoney(ozonPrice),
        dariaWbPrice: renderAdjustedMoney(wbPrice, multiplier),
        dariaYmPrice: renderAdjustedMoney(ymMaxPrice, multiplier),
        dariaOzonPrice: renderAdjustedMoney(ozonPrice, multiplier)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.sku.localeCompare(right.sku, 'ru'));
}

function renderTable(rows, delimiter = ',') {
  const lines = [
    [
      'SKU',
      '\u0426\u0435\u043d\u0430 WB \u0431\u0435\u0437 \u0421\u041f\u041f',
      '\u042f\u041c min (\u043a\u043e\u0440\u0438\u0434\u043e\u0440)',
      '\u042f\u041c max (\u043a\u043e\u0440\u0438\u0434\u043e\u0440)',
      '\u0426\u0435\u043d\u0430 Ozon',
      '\u0420\u0430\u0441\u0447\u0435\u0442 WB +2% \u0431\u0435\u0437 \u0421\u041f\u041f',
      '\u0420\u0430\u0441\u0447\u0435\u0442 \u042f\u041c (+2% \u043e\u0442 max)',
      '\u0420\u0430\u0441\u0447\u0435\u0442 Ozon (+2%)'
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
  return `${lines.map((line) => line.map((value) => tableCell(value, delimiter)).join(delimiter)).join('\n')}\n`;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input || path.join(root, 'data', 'skus.json'));
  const outputPath = path.resolve(args.output || path.join(root, 'daria-prices.csv'));
  const tsvOutputPath = args['tsv-output'] ? path.resolve(args['tsv-output']) : null;
  const semicolonOutputPath = args['semicolon-output'] ? path.resolve(args['semicolon-output']) : null;
  const summaryPath = path.resolve(args.summary || path.join(root, 'exports', 'daria-prices.summary.json'));
  const multiplier = numberOrNull(args.multiplier) ?? 1.02;

  const skus = readJson(inputPath, []);
  if (!Array.isArray(skus)) throw new Error(`${inputPath} must contain an array`);
  const rows = buildRows(skus, multiplier);
  if (!rows.length) throw new Error('No price rows generated');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderTable(rows), 'utf8');
  if (tsvOutputPath) {
    fs.mkdirSync(path.dirname(tsvOutputPath), { recursive: true });
    fs.writeFileSync(tsvOutputPath, renderTable(rows, '\t'), 'utf8');
  }
  if (semicolonOutputPath) {
    fs.mkdirSync(path.dirname(semicolonOutputPath), { recursive: true });
    fs.writeFileSync(semicolonOutputPath, renderTable(rows, ';'), 'utf8');
  }

  const wbPrices = rows.map((row) => row.wbPrice).filter((value) => typeof value === 'number');
  const summary = {
    generatedAt: new Date().toISOString(),
    inputPath,
    outputPath,
    tsvOutputPath,
    semicolonOutputPath,
    rowCount: rows.length,
    multiplier,
    rowsWithOzonPrice: rows.filter((row) => row.ozonPrice !== '').length,
    rowsWithYandexMarketRange: rows.filter((row) => row.ymMinPrice !== '' || row.ymMaxPrice !== '').length,
    minWbPrice: wbPrices.length ? Math.min(...wbPrices) : null,
    maxWbPrice: wbPrices.length ? Math.max(...wbPrices) : null
  };
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main();
