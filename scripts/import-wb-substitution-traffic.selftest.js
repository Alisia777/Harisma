#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const xlsx = require('xlsx');
const { main } = require('./import-wb-substitution-traffic');

function writeFixtureWorkbook(filePath) {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet([{
    'Seller Article': 'SKU-1',
    'Product ID': '123456',
    'Substitution Article': 'WW-1',
    Title: 'Test product',
    'AD Campaign Name': 'Search',
    'Traffic Source': 'search',
    Viewed: 100,
    'Add-to-Cart': 10,
    Orders: 4,
    'Add-to-Favorites': 2,
    'Campaign budget': 500,
    'Search click cost': 5,
    'Cart add cost': 50,
    'Order cost': 125
  }]);
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Traffic');
  xlsx.writeFile(workbook, filePath);
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-substitution-selftest-'));
  try {
    const baseDataDir = path.join(root, 'base');
    const outputDir = path.join(root, 'output');
    const statusFile = path.join(root, 'status', 'refresh.json');
    fs.mkdirSync(baseDataDir, { recursive: true });
    fs.writeFileSync(path.join(baseDataDir, 'skus.json'), `${JSON.stringify([{
      articleKey: 'SKU-1',
      article: 'SKU-1',
      name: 'Test product',
      wb: { supplierArticle: 'SKU-1', nmId: '123456' }
    }], null, 2)}\n`, 'utf8');

    const workbookPath = path.join(root, 'ANS-2026-07-25T10_11_12.000Z.xlsx');
    writeFixtureWorkbook(workbookPath);
    const firstCode = await main([
      process.execPath,
      'import-wb-substitution-traffic.js',
      '--input-xlsx',
      workbookPath,
      '--base-data-dir',
      baseDataDir,
      '--output-dir',
      outputDir,
      '--status-file',
      statusFile
    ], {});
    assert.strictEqual(firstCode, 0);
    const payload = JSON.parse(fs.readFileSync(path.join(outputDir, 'wb_substitution_traffic.json'), 'utf8'));
    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    assert.strictEqual(payload.asOfDate, '2026-07-25');
    assert.strictEqual(payload.source.sourceGeneratedAt, '2026-07-25T10:11:12.000Z');
    assert.strictEqual(payload.source.kind, 'configured-file');
    assert.strictEqual(payload.summary.rowCount, 1);
    assert.strictEqual(payload.summary.mappedRowCount, 1);
    assert.strictEqual(payload.summary.orders, 4);
    assert.strictEqual(status.status, 'ok');
    assert.strictEqual(status.updated, true);

    const base64OutputDir = path.join(root, 'base64-output');
    const base64StatusFile = path.join(root, 'status', 'base64-refresh.json');
    const base64Code = await main([
      process.execPath,
      'import-wb-substitution-traffic.js',
      '--base-data-dir',
      baseDataDir,
      '--output-dir',
      base64OutputDir,
      '--status-file',
      base64StatusFile
    ], {
      ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_B64: fs.readFileSync(workbookPath).toString('base64'),
      ALTEA_WB_SUBSTITUTION_TRAFFIC_SOURCE_MTIME: '2026-07-26T07:30:00Z'
    });
    assert.strictEqual(base64Code, 0);
    const base64Payload = JSON.parse(fs.readFileSync(path.join(base64OutputDir, 'wb_substitution_traffic.json'), 'utf8'));
    assert.strictEqual(base64Payload.asOfDate, '2026-07-26');
    assert.strictEqual(base64Payload.source.kind, 'env-base64');

    const preservedText = fs.readFileSync(path.join(outputDir, 'wb_substitution_traffic.json'), 'utf8');
    const staleStatusFile = path.join(root, 'status', 'stale-refresh.json');
    const staleCode = await main([
      process.execPath,
      'import-wb-substitution-traffic.js',
      '--optional',
      '--base-data-dir',
      baseDataDir,
      '--output-dir',
      outputDir,
      '--status-file',
      staleStatusFile
    ], {
      ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_B64: fs.readFileSync(workbookPath).toString('base64'),
      ALTEA_WB_SUBSTITUTION_TRAFFIC_SOURCE_MTIME: '2026-07-01T07:30:00Z'
    });
    assert.strictEqual(staleCode, 0);
    assert.strictEqual(fs.readFileSync(path.join(outputDir, 'wb_substitution_traffic.json'), 'utf8'), preservedText);
    const staleStatus = JSON.parse(fs.readFileSync(staleStatusFile, 'utf8'));
    assert.strictEqual(staleStatus.status, 'warning');
    assert.strictEqual(staleStatus.updated, false);
    assert.strictEqual(staleStatus.reason, 'configured_source_failed');
    assert(staleStatus.error.includes('older than the preserved verified snapshot'));

    const optionalStatusFile = path.join(root, 'status', 'optional-refresh.json');
    const optionalCode = await main([
      process.execPath,
      'import-wb-substitution-traffic.js',
      '--optional',
      '--base-data-dir',
      baseDataDir,
      '--output-dir',
      outputDir,
      '--status-file',
      optionalStatusFile
    ], {});
    assert.strictEqual(optionalCode, 0);
    assert.strictEqual(fs.readFileSync(path.join(outputDir, 'wb_substitution_traffic.json'), 'utf8'), preservedText);
    const optionalStatus = JSON.parse(fs.readFileSync(optionalStatusFile, 'utf8'));
    assert.strictEqual(optionalStatus.status, 'warning');
    assert.strictEqual(optionalStatus.updated, false);
    assert.strictEqual(optionalStatus.reason, 'source_not_configured');
    assert.strictEqual(optionalStatus.preserved.asOfDate, '2026-07-25');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().then(() => {
  console.log('import-wb-substitution-traffic selftest ok');
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
