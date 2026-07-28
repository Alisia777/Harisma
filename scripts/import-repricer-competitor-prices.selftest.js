#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const {
  buildSnapshot,
  readInputRows,
  recordAttempt,
  writeTemplate
} = require('./import-repricer-competitor-prices');

const rows = [
  {
    'Площадка': 'WB',
    'Наш артикул': 'sku_1',
    'ID предложения конкурента': 'offer_1',
    'Клиентская цена, ₽': '900,50',
    'В наличии': 'Да',
    'Match score': '97%',
    'Штук в упаковке': 1,
    'Валюта': 'RUB',
    'Дата наблюдения': '2026-07-28',
    'Источник': 'approved-provider'
  },
  {
    'Площадка': 'WB',
    'Наш артикул': 'sku_1',
    'ID предложения конкурента': 'offer_2',
    'Клиентская цена, ₽': 920,
    'В наличии': true,
    'Match score': 0.95,
    'Штук в упаковке': 1,
    'Валюта': 'RUB',
    'Дата наблюдения': '2026-07-28',
    'Источник': 'approved-provider'
  }
];

const valid = buildSnapshot(rows, { generatedAt: '2026-07-28T10:00:00Z' });
assert.strictEqual(valid.errors.length, 0);
assert.strictEqual(valid.payload.summary.accepted_rows, 2);
assert.strictEqual(valid.payload.summary.sku_platform_rows, 1);
assert.strictEqual(valid.payload.rows[0].offers[0].client_price, 900.5);
assert.strictEqual(valid.payload.rows[0].offers[0].match_score, 0.97);

const invalid = buildSnapshot([...rows, {
  'Площадка': 'WB',
  'Наш артикул': 'sku_1',
  'ID предложения конкурента': 'bad_pack',
  'Клиентская цена, ₽': 500,
  'В наличии': 'Да',
  'Match score': 0.99,
  'Штук в упаковке': 2,
  'Валюта': 'RUB',
  'Дата наблюдения': '2026-07-28'
}], { generatedAt: '2026-07-28T10:00:00Z' });
assert.strictEqual(invalid.errors.length, 1);
assert.strictEqual(invalid.payload.summary.atomic_rejected, true);
assert.strictEqual(invalid.payload.summary.accepted_rows, 0);
assert.strictEqual(invalid.payload.rows.length, 0);

const partial = buildSnapshot([...rows, {
  'Площадка': 'wrong',
  'Наш артикул': '',
  'Клиентская цена, ₽': -1
}], { allowPartial: true });
assert.strictEqual(partial.errors.length, 1);
assert.strictEqual(partial.payload.summary.accepted_rows, 2);

const history = recordAttempt({}, {
  id: 'attempt-1',
  imported_at: '2026-07-28T10:00:00Z',
  status: 'rejected_atomic',
  errors: invalid.errors
});
assert.strictEqual(history.attempts.length, 1);
assert.strictEqual(history.attempts[0].errors[0].row_number, 4);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repricer-competitor-import-'));
try {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Конкуренты');
  const workbookPath = path.join(tempDir, 'competitors.xlsx');
  XLSX.writeFile(workbook, workbookPath);
  const parsed = readInputRows(workbookPath);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(buildSnapshot(parsed).errors.length, 0);

  const templatePath = path.join(tempDir, 'template.xlsx');
  writeTemplate(templatePath);
  const template = XLSX.readFile(templatePath);
  assert.deepStrictEqual(template.SheetNames, ['Конкуренты', 'Инструкция']);
  assert.strictEqual(
    XLSX.utils.sheet_to_json(template.Sheets['Конкуренты'], { header: 1 })[0][0],
    'Площадка'
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('[repricer-competitor-import-selftest] OK: XLSX contract, atomic rejection, partial mode and persistent error history work');
