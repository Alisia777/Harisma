#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const { buildFallback, workbookLatestDates } = require('./build-retail-network-google-fallback');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retail-google-fallback-'));
const snapshotPath = path.join(tempDir, 'snapshot.json');
const outputPath = path.join(tempDir, 'retail.xlsx');
const snapshot = {
  schema: 'retail-network-google-range-snapshot-v1',
  sourceId: 'sheet-test',
  generatedAt: '2026-07-27T08:00:00Z',
  sheets: {
    'База / Лету': {
      headerRows: [[
        'Юр лицо', 'Дата', 'Дата выгрузки', 'Период выгрузки', 'Фото', 'Название товара',
        'Штрихкод', 'Бренд товара', 'Артикул Алькор', 'Артикул', 'Всего. Заказано',
        'Всего. Заказано, Р'
      ]],
      rows: [
        ['1', '2026-07-24', '2026-07-25', '2026-07-24-2026-07-24', '', 'old', '', '', '', 'old', '1', '100'],
        ['1', '2026-07-25', '2026-07-26', '2026-07-25-2026-07-25', '', 'new', '', '', '', 'new', '2', '300']
      ]
    },
    'База / ЗЯ': {
      headerRows: [['Наименование', 'Номенклатура', 'Артикул', 'Штрихкод', 'Заказано руб', '', '', '', 'Заказано шт', '', '', '', '', 'Юр Лицо', 'Дата']],
      rows: [
        ['old', '', 'old', '', '100', '', '', '', '1', '', '', '', '', '1', '24.07.2026'],
        ['new', '', 'new', '', '300', '', '', '', '2', '', '', '', '', '1', '26.07.2026']
      ]
    },
    'База / ММ': {
      headerRows: [['SKU', 'Наименование', 'Продано (ед.)', 'Количество возвратов (ед.)', 'Выручка (руб.)', '', '', '', 'Seller SKU ID', 'Юр Лицо', 'Дата']],
      rows: [
        ['old', 'old', '1', '0', '100', '', '', '', 'old', '1', '24.07.2026'],
        ['new', 'new', '2', '0', '300', '', '', '', 'new', '1', '25.07.2026']
      ]
    }
  }
};

fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
const result = buildFallback({ snapshot: snapshotPath, output: outputPath });
assert.strictEqual(result.ok, true);
assert.deepStrictEqual(
  Object.fromEntries(Object.entries(result.platforms).map(([key, value]) => [key, [value.latestDate, value.rowCount]])),
  {
    letu: ['2026-07-25', 1],
    goldapple: ['2026-07-26', 1],
    megamarket: ['2026-07-25', 1]
  }
);
assert.deepStrictEqual(workbookLatestDates(outputPath), {
  letu: '2026-07-25',
  goldapple: '2026-07-26',
  megamarket: '2026-07-25'
});

const workbook = XLSX.readFile(outputPath);
assert.deepStrictEqual(workbook.SheetNames, ['База  Лету', 'База  ЗЯ', 'База  ММ']);
assert.strictEqual(XLSX.utils.sheet_to_json(workbook.Sheets['База  Лету'], { header: 1 })[1][9], 'new');

snapshot.sheets['База / Лету'].rows = [
  ['1', '2026-07-26', '2026-07-27', '2026-07-26-2026-07-26', '', 'QEEP only', '', '', '', 'qeep_only', '3', '500']
];
fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
const preserved = buildFallback({ snapshot: snapshotPath, output: outputPath });
assert.strictEqual(preserved.platforms.letu.sourceStatus, 'preserved_no_in_scope_rows');
assert.strictEqual(preserved.platforms.letu.sourceLatestDate, '2026-07-26');
assert.strictEqual(preserved.platforms.letu.latestDate, '2026-07-25');
assert.strictEqual(
  XLSX.utils.sheet_to_json(XLSX.readFile(outputPath).Sheets['База  Лету'], { header: 1 })[1][9],
  'new'
);

snapshot.sheets['База / ЗЯ'].rows = [
  ['regression', '', 'regression', '', '1', '', '', '', '1', '', '', '', '', '1', '23.07.2026']
];
fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
assert.throws(
  () => buildFallback({ snapshot: snapshotPath, output: outputPath }),
  /source regression 2026-07-23 < existing 2026-07-26/
);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('build-retail-network-google-fallback selftest: ok');
