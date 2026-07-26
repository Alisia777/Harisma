#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const XLSX = require('xlsx');

const {
  assertDirectLivePriceMerge,
  buildWorkbookRequestHeaders,
  decodeWorkbookFromEnvironment,
  extractGoogleFileId,
  mergeApiPriceOverlay,
  mergeDirectLivePriceOverlay,
  preserveExtraMarketplace,
  redactUrl,
  workbookBufferLooksLikeSmartPrices,
  workbookSheetNamesLookLikeSmartPrices
} = require('./portal-smart-price-overlay-sync');
const {
  extractReportDate,
  parseCurrentPriceSnapshot
} = require('./build-smart-price-overlay');
const {
  forwardedArgs: priceImportForwardedArgs,
  parseArgs: parsePriceImportArgs
} = require('./import-price-history-report');
const { numOrNull } = require('./smart-price-contour');

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
assert.strictEqual(workbookSheetNamesLookLikeSmartPrices(['Исходные данные', 'Динамика по дням']), true);
assert.strictEqual(workbookSheetNamesLookLikeSmartPrices(['WB — текущие', 'Ozon — текущие']), true);
assert.strictEqual(workbookSheetNamesLookLikeSmartPrices(['Upload']), false);
assert.strictEqual(workbookBufferLooksLikeSmartPrices(smartWorkbook), true);
assert.strictEqual(workbookBufferLooksLikeSmartPrices(wrongWorkbook), false);
assert.strictEqual(extractReportDate('Снято 23.07.2026 в 15:40'), '2026-07-23');

const currentPriceWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(currentPriceWorkbook, XLSX.utils.aoa_to_sheet([
  ['Текущие цены WB'],
  ['Источник: WB Smart-Sale → Prices. Снято 23.07.2026'],
  [],
  [],
  [],
  ['Группа', 'SKU', 'Товар', 'Загруженная цена', 'Цена клиента'],
  ['Алтея', 'adenofrin', 'Аденофрин', 560, ''],
  ['Алтея', 'artoks_75ml', 'Артокс', 900, 751]
]), 'WB — текущие');
XLSX.utils.book_append_sheet(currentPriceWorkbook, XLSX.utils.aoa_to_sheet([
  ['Текущие цены Ozon'],
  ['Источник: Ozon Smart-Sale → Prices. Снято 23.07.2026'],
  [],
  [],
  [],
  ['Группа', 'SKU', 'Товар', 'Загруженная цена', 'Цена клиента'],
  ['Алтея', 'adenofrin', 'Аденофрин', 670, 670]
]), 'Ozon — текущие');
const currentPricePayload = {
  generatedAt: '2026-07-23T12:00:00.000Z',
  sourceFile: 'current-prices.xlsx',
  platforms: {}
};
assert.strictEqual(parseCurrentPriceSnapshot(currentPriceWorkbook, currentPricePayload, '2026-07-23'), true);
assert.strictEqual(currentPricePayload.priceCurrentSnapshot.asOfDate, '2026-07-23');
assert.deepStrictEqual(currentPricePayload.priceCurrentSnapshot.rowsByPlatform, { wb: 2, ozon: 1 });
assert.strictEqual(currentPricePayload.platforms.wb.rows[0].currentFillPrice, 560);
assert.strictEqual(currentPricePayload.platforms.wb.rows[0].clearCurrentClientPrice, true);
assert.strictEqual(currentPricePayload.platforms.ozon.rows[0].currentClientPrice, 670);
assert.strictEqual(numOrNull(null), null);
assert.strictEqual(numOrNull(''), null);
assert.strictEqual(numOrNull(0), 0);

const directPriceMerged = mergeDirectLivePriceOverlay({
  generatedAt: '2026-07-26T12:00:00Z',
  platforms: {
    wb: {
      rows: [{
        articleKey: 'adenofrin',
        currentFillPrice: 560,
        currentPrice: 560,
        currentClientPrice: 530,
        currentPriceDate: '2026-07-24',
        valueDate: '2026-07-24',
        daily: [{ date: '2026-07-24', price: 560, clientPrice: 530 }]
      }]
    }
  }
}, {
  generatedAt: '2026-07-26T10:00:00Z',
  asOfDate: '2026-07-26',
  status: 'ok',
  blockingReasons: [],
  platforms: {
    wb: {
      rows: [{
        articleKey: 'adenofrin',
        currentFillPrice: 590,
        currentPrice: 590,
        currentClientPrice: 561,
        currentListPrice: 700,
        currentPriceDate: '2026-07-26',
        valueDate: '2026-07-26',
        currentSellerPriceSource: 'wb-prices-api',
        currentSellerPriceFile: 'repricer_live_prices.json',
        daily: [{ date: '2026-07-26', price: 590, clientPrice: 561 }]
      }]
    }
  }
});
assert.strictEqual(directPriceMerged.platforms.wb.rows[0].currentPrice, 590);
assert.strictEqual(directPriceMerged.platforms.wb.rows[0].currentClientPrice, 561);
assert.strictEqual(directPriceMerged.platforms.wb.rows[0].currentListPrice, 700);
assert.strictEqual(directPriceMerged.platforms.wb.rows[0].currentPriceDate, '2026-07-26');
assert.strictEqual(directPriceMerged.platforms.wb.rows[0].currentSellerPriceFile, 'repricer_live_prices.json');
assert.deepStrictEqual(
  directPriceMerged.platforms.wb.rows[0].daily.map((point) => point.date),
  ['2026-07-24', '2026-07-26']
);
assert.deepStrictEqual(directPriceMerged.priceCurrentSnapshot, {
  importedAt: '2026-07-26T10:00:00Z',
  sourceFile: 'repricer_live_prices.json',
  sourceKind: 'direct-api',
  asOfDate: '2026-07-26',
  rowsByPlatform: { wb: 1 }
});
assert.strictEqual(directPriceMerged.directLivePriceSnapshot.status, 'ok');
assert.deepStrictEqual(directPriceMerged.directLivePriceSnapshot.sourceRowsByPlatform, { wb: 1 });
assert.deepStrictEqual(directPriceMerged.directLivePriceSnapshot.mergeCoverageByPlatform, { wb: 1 });

const directLiveOnlyMerged = mergeDirectLivePriceOverlay({
  generatedAt: '2026-07-26T12:00:00Z',
  platforms: {
    wb: { rows: [] },
    ozon: { rows: [] },
    ym: { rows: [] }
  }
}, {
  generatedAt: '2026-07-26T10:00:00Z',
  asOfDate: '2026-07-26',
  status: 'ok',
  blockingReasons: [],
  platforms: {
    wb: {
      rows: [{
        articleKey: 'cabinet-only-wb',
        article: 'wb-vendor-code',
        nmId: 123456,
        currentPrice: 610,
        currentClientPrice: 579,
        currentPriceDate: '2026-07-26'
      }]
    },
    ozon: {
      rows: [{
        articleKey: 'cabinet-only-ozon',
        article: 'ozon-offer-id',
        offerId: 'ozon-offer-id',
        currentPrice: 720,
        currentClientPrice: 699,
        currentPriceDate: '2026-07-26'
      }]
    },
    ym: {
      rows: [{
        articleKey: 'cabinet-only-ym',
        article: 'ym-offer-id',
        currentPrice: 830,
        currentClientPrice: 830,
        currentPriceDate: '2026-07-26'
      }]
    }
  }
});
assert.deepStrictEqual(
  Object.fromEntries(Object.entries(directLiveOnlyMerged.platforms).map(([platform, bucket]) => [
    platform,
    bucket.rows.map((row) => row.articleKey)
  ])),
  {
    wb: ['cabinet-only-wb'],
    ozon: ['cabinet-only-ozon'],
    ym: ['cabinet-only-ym']
  }
);
assert.deepStrictEqual(
  directLiveOnlyMerged.directLivePriceSnapshot.mergeCoverageByPlatform,
  { wb: 1, ozon: 1, ym: 1 }
);
assert.doesNotThrow(
  () => assertDirectLivePriceMerge({
    status: 'ok',
    blockingReasons: [],
    platforms: {
      wb: { rows: [{}] },
      ozon: { rows: [{}] },
      ym: { rows: [{}] }
    }
  }, directLiveOnlyMerged, 0.95)
);
assert.throws(
  () => assertDirectLivePriceMerge({}, {}, 0.95),
  /missing or invalid/
);

const parsedPriceImportArgs = parsePriceImportArgs([
  'node',
  'import-price-history-report.js',
  '--input',
  __filename,
  '--dry-run'
]);
assert.strictEqual(parsedPriceImportArgs['dry-run'], true);
assert.ok(priceImportForwardedArgs(parsedPriceImportArgs).includes('--dry-run'));

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
const githubAssetHeaders = buildWorkbookRequestHeaders(
  { httpAuthBearer: 'github-token' },
  'https://api.github.com/repos/Alisia777/Harisma/releases/assets/123456'
);
assert.strictEqual(githubAssetHeaders.Authorization, 'Bearer github-token');
assert.strictEqual(githubAssetHeaders.Accept, 'application/octet-stream');

const preserveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-smart-price-preserve-'));
const stagedOverlayPath = path.join(preserveDir, 'smart_price_overlay.json');
fs.writeFileSync(stagedOverlayPath, JSON.stringify({
  generatedAt: '2026-06-22T06:00:03.429Z',
  asOfDate: '2026-06-21',
  platforms: { wb: { rows: [] }, ozon: { rows: [] } }
}));
assert.strictEqual(preserveExtraMarketplace(stagedOverlayPath, stagedOverlayPath, {
  generatedAt: '2026-07-20T12:25:00.000Z',
  asOfDate: '2026-07-19',
  extraMarketplace: {
    generatedAt: '2026-07-20T12:25:00.000Z',
    asOfDate: '2026-07-19',
    platforms: { goldapple: { articleCount: 59 } }
  }
}), true);
const preservedOverlay = JSON.parse(fs.readFileSync(stagedOverlayPath, 'utf8'));
assert.strictEqual(
  preservedOverlay.generatedAt,
  '2026-06-22T06:00:03.429Z',
  'Метаданные другой площадки не должны подменять дату генерации факта цены'
);
assert.strictEqual(
  preservedOverlay.asOfDate,
  '2026-06-21',
  'Метаданные другой площадки не должны подменять фактическую дату цены'
);
assert.strictEqual(preservedOverlay.extraMarketplace.platforms.goldapple.articleCount, 59);
fs.rmSync(preserveDir, { recursive: true, force: true });

const apiMerged = mergeApiPriceOverlay({
  generatedAt: '2026-07-23T10:00:00.000Z',
  platforms: {
    wb: { rows: [{ articleKey: 'wb-1', currentPrice: 500, valueDate: '2026-07-23' }] },
    ym: { rows: [{ articleKey: 'ym-1', currentPrice: 600, valueDate: '2026-07-20' }] }
  }
}, {
  generatedAt: '2026-07-24T08:00:00.000Z',
  asOfDate: '2026-07-23',
  source: 'yandex-market-prices-api',
  priceApiSnapshot: { mappedRowCount: 1, asOfDate: '2026-07-23' },
  platforms: {
    ym: {
      rows: [{
        articleKey: 'ym-1',
        currentPrice: 650,
        currentPriceDate: '2026-07-23',
        valueDate: '2026-07-23',
        daily: [{ date: '2026-07-23', price: 650 }]
      }]
    }
  }
});
assert.strictEqual(apiMerged.platforms.wb.rows.length, 1);
assert.strictEqual(apiMerged.platforms.ym.rows[0].currentPrice, 650);
assert.strictEqual(apiMerged.platforms.ym.rows[0].currentPriceDate, '2026-07-23');
assert.strictEqual(apiMerged.priceApiSnapshot.mappedRowCount, 1);

console.log('portal-smart-price-overlay-sync selftest ok');
