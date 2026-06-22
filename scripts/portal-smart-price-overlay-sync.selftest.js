#!/usr/bin/env node

const assert = require('assert');
const zlib = require('zlib');
const XLSX = require('xlsx');

const {
  buildWorkbookRequestHeaders,
  decodeWorkbookFromEnvironment,
  extractGoogleFileId,
  redactUrl,
  workbookBufferLooksLikeSmartPrices,
  workbookSheetNamesLookLikeSmartPrices
} = require('./portal-smart-price-overlay-sync');

function makeWorkbookBuffer(sheetNames) {
  const workbook = XLSX.utils.book_new();
  sheetNames.forEach((sheetName) => {
    const sheet = XLSX.utils.aoa_to_sheet([['ok'], [1]]);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const smartWorkbook = makeWorkbookBuffer(['dim_sku', 'fact_marketplace_daily_sku']);
const wrongWorkbook = makeWorkbookBuffer(['Instructions', 'Upload']);

assert.strictEqual(workbookSheetNamesLookLikeSmartPrices(['dim_sku', 'fact_marketplace_daily_sku']), true);
assert.strictEqual(workbookSheetNamesLookLikeSmartPrices(['Upload']), false);
assert.strictEqual(workbookBufferLooksLikeSmartPrices(smartWorkbook), true);
assert.strictEqual(workbookBufferLooksLikeSmartPrices(wrongWorkbook), false);

const gzipWorkbook = decodeWorkbookFromEnvironment({
  sourceXlsxGzipBase64: zlib.gzipSync(smartWorkbook).toString('base64'),
  sourceMtime: '2026-06-22T06:00:03Z'
});
assert.strictEqual(gzipWorkbook.sourceKind, 'env-gzip-base64');
assert.strictEqual(gzipWorkbook.sourceMtimeIso, '2026-06-22T06:00:03.000Z');
assert.strictEqual(workbookBufferLooksLikeSmartPrices(gzipWorkbook.buffer), true);

const plainWorkbook = decodeWorkbookFromEnvironment({
  sourceXlsxBase64: smartWorkbook.toString('base64')
});
assert.strictEqual(plainWorkbook.sourceKind, 'env-base64');
assert.strictEqual(workbookBufferLooksLikeSmartPrices(plainWorkbook.buffer), true);

assert.throws(
  () => decodeWorkbookFromEnvironment({ sourceXlsxBase64: wrongWorkbook.toString('base64') }),
  /smart-price workbook schema/
);

assert.strictEqual(
  extractGoogleFileId('https://docs.google.com/spreadsheets/d/abc123DEF456/edit?gid=1#gid=1'),
  'abc123DEF456'
);
assert.strictEqual(extractGoogleFileId('https://drive.google.com/file/d/file-id-123/view'), 'file-id-123');
assert.strictEqual(extractGoogleFileId('https://drive.google.com/open?id=file-id-456'), 'file-id-456');

assert.strictEqual(redactUrl('https://example.com/file.xlsx?token=secret#fragment'), 'https://example.com/file.xlsx?redacted=1');
assert.strictEqual(redactUrl('https://example.com/file.xlsx'), 'https://example.com/file.xlsx');

const bearerHeaders = buildWorkbookRequestHeaders({ httpAuthBearer: 'secret-token' });
assert.strictEqual(bearerHeaders.Authorization, 'Bearer secret-token');
const customHeaders = buildWorkbookRequestHeaders({ httpAuthHeader: 'X-Signed-Token: secret-token' });
assert.strictEqual(customHeaders['X-Signed-Token'], 'secret-token');

console.log('portal-smart-price-overlay-sync selftest ok');
