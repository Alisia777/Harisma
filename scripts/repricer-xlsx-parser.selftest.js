#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'app-core-08.js'), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

const runtime = {
  window: { XLSX },
  console
};
vm.createContext(runtime);
vm.runInContext([
  extractFunction('repricerImportKey'),
  extractFunction('repricerImportValue'),
  extractFunction('repricerRowsFromMatrix'),
  `function repricerImportDraft(row) {
    const articleKey = repricerImportValue(row, ['article_key', 'article', 'Артикул', 'sku_code', 'SKU']);
    const margin = repricerImportValue(row, ['Новая маржа SKU, %', 'Маржа, %', 'target_margin_pct']);
    const min = repricerImportValue(row, ['minPrice', 'Новый MIN, ₽']);
    const max = repricerImportValue(row, ['maxPrice', 'Новый MAX, ₽']);
    return { articleKey, hasImportFields: Boolean(margin || min || max) };
  }`,
  extractFunction('repricerParseXlsxArrayBuffer')
].join('\n'), runtime);

function workbookBuffer(rows) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Импорт в портал');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
}

const pending = runtime.repricerParseXlsxArrayBuffer(workbookBuffer([
  ['ИМПОРТ В ПОРТАЛ'],
  [],
  ['Маржа, %', 'articleKey', 'platform', 'minPrice', 'maxPrice', 'Контроль'],
  ['', '', '', '', '', 'ОЖИДАЕТ РОП']
]));
assert.strictEqual(pending.length, 1);
assert.strictEqual(pending.__workbookMeta.sheetName, 'Импорт в портал');
assert.strictEqual(pending.__workbookMeta.awaitingRop, 1);
assert.strictEqual(pending.__workbookMeta.approved, 0);

const approved = runtime.repricerParseXlsxArrayBuffer(workbookBuffer([
  ['ИМПОРТ В ПОРТАЛ'],
  ['Служебный заголовок не должен стать строкой колонок'],
  [],
  ['Новая маржа SKU, %', 'article_key', 'platform', 'minPrice', 'maxPrice', 'Контроль'],
  ['37%', 'sku_test', 'WB', '1000', '1200', 'ГОТОВО К ИМПОРТУ']
]));
assert.strictEqual(approved.length, 1);
assert.strictEqual(approved[0].article_key, 'sku_test');
assert.strictEqual(approved[0]['Новая маржа SKU, %'], '37%');
assert.strictEqual(approved.__workbookMeta.approved, 1);
assert.strictEqual(approved.__workbookMeta.awaitingRop, 0);

const vendor = path.join(ROOT, 'assets', 'vendor', 'xlsx.full.min.js');
assert(fs.statSync(vendor).size > 500_000, 'browser XLSX reader asset is missing or truncated');

for (const file of ['index.html', 'live-index.html', 'docs/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert(html.includes('xlsx.full.min.js?v=0.18.5'), `${file} must load the XLSX reader`);
  assert(html.includes('app-core-08.js?v=20260725xlsx1'), `${file} must bust the repricer loader cache`);
}
assert(source.includes('accept=".xlsx,.xls'), 'repricer file input must expose XLSX');

const premium = fs.readFileSync(path.join(ROOT, 'portal-premium-presentation.js'), 'utf8');
assert(premium.includes("targetId === 'repricerPriceSync'"), 'topbar repricer action proxy is missing');
assert(premium.includes("'Получить актуальные цены'"), 'topbar repricer price label is missing');

console.log('[repricer-xlsx-parser-selftest] OK: XLSX pending-ROP guard, approved rows, browser asset, inputs and topbar action passed');
