#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');
const { canonicalColumn } = require('./portal-upload-apply-runtime');

function decodeXml(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function columnIndex(reference = '') {
  const letters = String(reference).match(/^[A-Z]+/)?.[0] || '';
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseSheetXml(xml = '') {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<x:row\b[^>]*>([\s\S]*?)<\/x:row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<x:c\b([^>]*)>([\s\S]*?)<\/x:c>/g)) {
      const reference = cellMatch[1].match(/\br="([^"]+)"/)?.[1] || '';
      const type = cellMatch[1].match(/\bt="([^"]+)"/)?.[1] || '';
      const raw = cellMatch[2].match(/<x:v>([\s\S]*?)<\/x:v>/)?.[1] || '';
      const decoded = decodeXml(raw);
      row[columnIndex(reference)] = ['str', 'inlineStr'].includes(type) ? decoded : (decoded === '' ? '' : Number(decoded));
    }
    rows.push(row);
  }
  return rows;
}

const input = process.argv[2];
assert(input, 'usage: repricer-team-workbook-contract.selftest.js <xlsx>');
const filePath = path.resolve(input);
const workbookXml = execFileSync('unzip', ['-p', filePath, 'xl/workbook.xml'], { encoding: 'utf8' });
const sheetXml = execFileSync('unzip', ['-p', filePath, 'xl/worksheets/sheet1.xml'], { encoding: 'utf8' });
const matrix = parseSheetXml(sheetXml);
const headers = matrix[0] || [];
const columnMap = {};
headers.forEach((header, index) => {
  const canonical = canonicalColumn(header);
  if (canonical && columnMap[canonical] === undefined) columnMap[canonical] = index;
});

assert.strictEqual(headers[0], 'Маржа, %', 'margin must be the leftmost column');
for (const field of ['targetMarginPct', 'articleKey', 'platform', 'minPrice', 'maxPrice', 'effectiveFrom', 'author', 'role', 'reason']) {
  assert.notStrictEqual(columnMap[field], undefined, `server upload header missing: ${field}`);
}
assert(workbookXml.includes('name="Маржа_MIN_MAX"'));
assert(workbookXml.includes('name="Статусы_OOS"'));
assert(workbookXml.includes('name="Проверки"'));
assert(workbookXml.includes('name="Источники_и_правила"'));
assert(!/#REF!|#VALUE!|#DIV\/0!|#N\/A/i.test(sheetXml), 'formula error found in workbook');

const rows = matrix.slice(1).filter((row) => String(row[columnMap.articleKey] || '').trim());
assert.strictEqual(rows.length, 123);
rows.forEach((row, index) => {
  const margin = Number(row[columnMap.targetMarginPct]);
  const minPrice = Number(row[columnMap.minPrice]);
  const maxPrice = Number(row[columnMap.maxPrice]);
  assert(margin > 0 && margin < 1, `row ${index + 2}: invalid margin`);
  assert(minPrice > 0, `row ${index + 2}: invalid minPrice`);
  assert(maxPrice >= minPrice, `row ${index + 2}: maxPrice below minPrice`);
  assert(String(row[columnMap.platform] || '').match(/^(wb|ozon)$/), `row ${index + 2}: invalid platform`);
  assert(row[columnMap.effectiveFrom] !== '', `row ${index + 2}: missing effectiveFrom`);
  assert(String(row[columnMap.author] || '').trim(), `row ${index + 2}: missing author`);
  assert(String(row[columnMap.role] || '').trim(), `row ${index + 2}: missing role`);
  assert(String(row[columnMap.reason] || '').trim(), `row ${index + 2}: missing reason`);
});

console.log(`[repricer-team-workbook-contract] OK: ${rows.length} rows match the server min/max upload contract`);
