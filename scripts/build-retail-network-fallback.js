#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { isoDate, letualBusinessDate } = require('./portal-retail-network-daily-sync');

const SHEETS = [
  { key: 'letu', needle: 'лету' },
  { key: 'goldapple', needle: 'зя' },
  { key: 'megamarket', needle: 'мм' }
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.slice(2);
    args[key] = inlineValue === undefined ? argv[++index] : inlineValue;
  }
  return args;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[ё]/g, 'е').replace(/[^a-zа-я0-9]+/gi, '');
}

function findSheetName(workbook, needle) {
  const target = normalizeKey(needle);
  return workbook.SheetNames.find((name) => normalizeKey(name).includes(target)) || '';
}

function headerKind(row) {
  const keys = row.map(normalizeKey);
  if (keys.includes('датавыгрузки') && keys.includes('периодвыгрузки')) return 'letu';
  if (keys.includes('дата') && keys.includes('артикул') && keys.includes('заказаноруб')) return 'goldapple';
  if (keys.includes('дата') && keys.includes('sellerskuid') && keys.includes('выручкаруб')) return 'megamarket';
  return '';
}

function headerIndex(header, key) {
  return header.map(normalizeKey).indexOf(key);
}

function businessDate(row, header, kind) {
  if (kind === 'letu') {
    const declaredIndex = headerIndex(header, 'датавыгрузки');
    const periodIndex = headerIndex(header, 'периодвыгрузки');
    return letualBusinessDate(row[declaredIndex], row[periodIndex]);
  }
  return isoDate(row[headerIndex(header, 'дата')]);
}

function filterRows(rows, kind, from, to) {
  let header = null;
  let emittedHeader = null;
  let selectedCount = 0;
  const output = [];
  for (const row of rows) {
    if (headerKind(row) === kind) {
      header = row;
      continue;
    }
    if (!header) continue;
    const date = businessDate(row, header, kind);
    if (!date || date < from || date > to) continue;
    const headerSignature = JSON.stringify(header);
    if (headerSignature !== emittedHeader) {
      output.push(header);
      emittedHeader = headerSignature;
    }
    output.push(row);
    selectedCount += 1;
  }
  if (!header) throw new Error(`Header not found for ${kind}`);
  if (!selectedCount) throw new Error(`No ${kind} rows in fallback window ${from}..${to}`);
  return { rows: output, selectedCount };
}

function buildFallbackWorkbook(options) {
  const input = path.resolve(options.input || '');
  const output = path.resolve(options.output || '');
  const from = isoDate(options.from);
  const to = isoDate(options.to);
  if (!input || !fs.existsSync(input)) throw new Error(`Input workbook not found: ${input || '?'}`);
  if (!output) throw new Error('Output workbook is required');
  if (!from || !to || from > to) throw new Error(`Invalid fallback window: ${from || '?'}..${to || '?'}`);

  const source = XLSX.readFile(input, { cellDates: false });
  const target = XLSX.utils.book_new();
  const summary = {};
  for (const spec of SHEETS) {
    const sheetName = findSheetName(source, spec.needle);
    if (!sheetName) throw new Error(`Workbook sheet not found: ${spec.needle}`);
    const rows = XLSX.utils.sheet_to_json(source.Sheets[sheetName], { header: 1, raw: false, defval: '' });
    const filtered = filterRows(rows, spec.key, from, to);
    XLSX.utils.book_append_sheet(target, XLSX.utils.aoa_to_sheet(filtered.rows), sheetName.slice(0, 31));
    summary[spec.key] = { sheetName, rows: filtered.selectedCount };
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  XLSX.writeFile(target, output, { compression: true });
  return { input, output, from, to, summary };
}

if (require.main === module) {
  try {
    const result = buildFallbackWorkbook(parseArgs(process.argv));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  buildFallbackWorkbook,
  businessDate,
  filterRows,
  headerKind,
  normalizeKey
};
