#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const { buildFallbackWorkbook } = require('./build-retail-network-fallback');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retail-fallback-selftest-'));
const input = path.join(tempDir, 'input.xlsx');
const output = path.join(tempDir, 'output.xlsx');
const workbook = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['Дата выгрузки', 'Период выгрузки', 'Артикул', 'Всего. Заказано'],
  ['2026-07-22', '2026-07-22-2026-07-22', 'old_letu', 1],
  ['2026-07-23', '2026-07-23-2026-07-23', 'current_letu', 2],
  ['Период выгрузки', 'Дата выгрузки', 'Артикул', 'Всего. Заказано'],
  ['2026-07-24-2026-07-24', '2026-07-24', 'current_letu_reordered', 3]
]), 'База Лету');
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['Артикул', 'Заказано руб', 'Дата'],
  ['old_zya', 100, '22.07.2026'],
  ['current_zya', 200, '23.07.2026']
]), 'База ЗЯ');
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['SKU', 'Выручка (руб.)', 'Seller SKU ID', 'Дата'],
  ['old_mm', 100, 'old_mm', '22.07.2026'],
  ['current_mm', 200, 'current_mm', '23.07.2026']
]), 'База ММ');
XLSX.writeFile(workbook, input);

try {
  const result = buildFallbackWorkbook({ input, output, from: '2026-07-23', to: '2026-07-24' });
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(result.summary).map(([key, value]) => [key, value.rows])),
    { letu: 2, goldapple: 1, megamarket: 1 }
  );
  const sanitized = XLSX.readFile(output, { cellDates: false });
  assert.deepStrictEqual(sanitized.SheetNames, ['База Лету', 'База ЗЯ', 'База ММ']);
  const sanitizedRows = Object.fromEntries(sanitized.SheetNames.map((name) => [name, (
    XLSX.utils.sheet_to_json(sanitized.Sheets[name], { header: 1, raw: false, defval: '' })
  )]));
  const serialized = JSON.stringify(sanitizedRows);
  assert(!serialized.includes('old_letu'));
  assert(!serialized.includes('old_zya'));
  assert(!serialized.includes('old_mm'));
  assert(serialized.includes('current_letu'));
  assert(serialized.includes('current_letu_reordered'));
  assert(serialized.includes('current_zya'));
  assert(serialized.includes('current_mm'));
  assert.strictEqual(sanitizedRows['База Лету'].filter((row) => row.includes('Дата выгрузки')).length, 2);
  console.log('build-retail-network-fallback selftest ok');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
