#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const {
  isoDate,
  letualBusinessDate
} = require('./portal-retail-network-daily-sync');

const OUT_OF_SCOPE_BRAND_TOKENS = ['qeep', 'qip', 'harly', 'harley', 'квип', 'харли'];

const CONFIG = {
  letu: {
    label: 'Лэтуаль',
    sourceNeedle: 'лету',
    outputSheet: 'База  Лету',
    header: (row) => row.some((cell) => normalizeKey(cell) === 'датавыгрузки')
      && row.some((cell) => normalizeKey(cell) === 'всегозаказано'),
    date: (row) => letualBusinessDate(row[1], row[3]),
    isData: (row) => Boolean(normalizeText(row[9]) && normalizeKey(row[9]) !== 'артикул')
  },
  goldapple: {
    label: 'ЗЯ',
    sourceNeedle: 'зя',
    outputSheet: 'База  ЗЯ',
    header: (row) => normalizeKey(row[0]) === 'наименование',
    date: (row) => isoDate(row[14]),
    isData: (row) => Boolean(normalizeText(row[2]) && normalizeKey(row[2]) !== 'артикул')
  },
  megamarket: {
    label: 'Мегамаркет',
    sourceNeedle: 'мм',
    outputSheet: 'База  ММ',
    header: (row) => normalizeKey(row[0]) === 'sku',
    date: (row) => isoDate(row[10]),
    isData: (row) => Boolean(normalizeText(row[0]) && normalizeKey(row[0]) !== 'sku')
  }
};

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
}

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
}

function isOutOfScopeRow(row) {
  return (Array.isArray(row) ? row : []).some((value) => {
    const key = normalizeKey(value);
    return key && OUT_OF_SCOPE_BRAND_TOKENS.some((token) => key.includes(normalizeKey(token)));
  });
}

function sourceSheets(snapshot) {
  const sheets = snapshot?.sheets && typeof snapshot.sheets === 'object' ? snapshot.sheets : {};
  return Object.entries(sheets).map(([name, payload]) => ({
    name,
    headerRows: rowsOf(payload?.headerRows),
    rows: rowsOf(payload?.rows ?? payload)
  }));
}

function findSourceSheet(snapshot, needle) {
  const normalizedNeedle = normalizeKey(needle);
  const sheet = sourceSheets(snapshot).find((item) => normalizeKey(item.name).includes(normalizedNeedle));
  if (!sheet) throw new Error(`Google snapshot sheet not found: ${needle}`);
  return sheet;
}

function lastHeader(config, sheet) {
  const candidates = [...sheet.headerRows, ...sheet.rows].filter((row) => config.header(row || []));
  if (!candidates.length) throw new Error(`${config.label}: header row not found`);
  return candidates[candidates.length - 1];
}

function selectLatestRows(config, sheet) {
  const datedRows = sheet.rows
    .map((row) => ({
      row: Array.isArray(row) ? row : [],
      date: config.date(Array.isArray(row) ? row : [])
    }))
    .filter((item) => item.date && config.isData(item.row));
  const inScopeRows = datedRows.filter((item) => !isOutOfScopeRow(item.row));
  const sourceLatestDate = datedRows.map((item) => item.date).sort().at(-1) || '';
  const latestDate = inScopeRows.map((item) => item.date).sort().at(-1) || '';
  const rows = inScopeRows.filter((item) => item.date === latestDate).map((item) => item.row);
  return {
    sourceLatestDate,
    sourceRowCount: datedRows.filter((item) => item.date === sourceLatestDate).length,
    excludedOutOfScopeRows: datedRows.length - inScopeRows.length,
    latestDate,
    rows,
    header: lastHeader(config, sheet)
  };
}

function existingWorkbookSelections(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const selections = {};
  for (const [platform, config] of Object.entries(CONFIG)) {
    const sheetName = workbook.SheetNames.find((name) => normalizeKey(name).includes(normalizeKey(config.sourceNeedle)));
    if (!sheetName) continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: ''
    });
    if (!rows.length) continue;
    selections[platform] = {
      header: rows[0],
      rows: rows.slice(1),
      latestDate: rows.map((row) => config.date(row)).filter(Boolean).sort().at(-1) || ''
    };
  }
  return selections;
}

function workbookLatestDates(filePath) {
  return Object.fromEntries(Object.entries(existingWorkbookSelections(filePath))
    .map(([platform, selection]) => [platform, selection.latestDate]));
}

function workbookBytes(selections) {
  const workbook = XLSX.utils.book_new();
  for (const [platform, config] of Object.entries(CONFIG)) {
    const selection = selections[platform];
    const sheet = XLSX.utils.aoa_to_sheet([selection.header, ...selection.rows]);
    XLSX.utils.book_append_sheet(workbook, sheet, config.outputSheet);
  }
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    compression: true
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildFallback(options) {
  const snapshotPath = path.resolve(options.snapshot);
  const outputPath = path.resolve(options.output);
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8').replace(/^\uFEFF/, ''));
  const existingPath = options.existing ? path.resolve(options.existing) : outputPath;
  const existingSelections = existingWorkbookSelections(existingPath);
  const existingDates = Object.fromEntries(Object.entries(existingSelections)
    .map(([platform, selection]) => [platform, selection.latestDate]));
  const selections = {};

  for (const [platform, config] of Object.entries(CONFIG)) {
    const candidate = selectLatestRows(config, findSourceSheet(snapshot, config.sourceNeedle));
    const previousDate = existingDates[platform] || '';
    if (candidate.latestDate && previousDate && candidate.latestDate < previousDate) {
      throw new Error(
        `${config.label}: source regression ${candidate.latestDate} < existing ${previousDate}`
      );
    }
    if (candidate.latestDate && candidate.rows.length) {
      selections[platform] = {
        ...candidate,
        sourceStatus: 'updated'
      };
      continue;
    }
    const preserved = existingSelections[platform];
    if (!preserved?.header?.length || !preserved?.rows?.length || !preserved.latestDate) {
      throw new Error(`${config.label}: no in-scope source rows and no verified existing fallback`);
    }
    selections[platform] = {
      ...candidate,
      ...preserved,
      sourceLatestDate: candidate.sourceLatestDate,
      sourceRowCount: candidate.sourceRowCount,
      excludedOutOfScopeRows: candidate.excludedOutOfScopeRows,
      sourceStatus: 'preserved_no_in_scope_rows'
    };
  }

  const bytes = workbookBytes(selections);
  const previousBytes = fs.existsSync(outputPath) ? fs.readFileSync(outputPath) : null;
  const result = {
    ok: true,
    changed: !previousBytes || !bytes.equals(previousBytes),
    sourceId: normalizeText(snapshot.sourceId),
    generatedAt: normalizeText(snapshot.generatedAt) || new Date().toISOString(),
    output: outputPath,
    bytes: bytes.length,
    sha256: sha256(bytes),
    platforms: Object.fromEntries(Object.entries(selections).map(([platform, selection]) => [
      platform,
      {
        latestDate: selection.latestDate,
        rowCount: selection.rows.length,
        previousDate: existingDates[platform] || '',
        sourceLatestDate: selection.sourceLatestDate,
        sourceRowCount: selection.sourceRowCount,
        excludedOutOfScopeRows: selection.excludedOutOfScopeRows,
        sourceStatus: selection.sourceStatus
      }
    ]))
  };

  if (!options['dry-run']) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const tempPath = `${outputPath}.tmp-${process.pid}`;
    fs.writeFileSync(tempPath, bytes);
    fs.renameSync(tempPath, outputPath);
  }
  if (options.audit) {
    const auditPath = path.resolve(options.audit);
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.writeFileSync(auditPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.snapshot || !args.output) {
    throw new Error('Usage: build-retail-network-google-fallback.js --snapshot <json> --output <xlsx>');
  }
  const result = buildFallback(args);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = {
  buildFallback,
  findSourceSheet,
  isOutOfScopeRow,
  selectLatestRows,
  workbookLatestDates
};
