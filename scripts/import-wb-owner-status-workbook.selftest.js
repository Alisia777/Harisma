#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const { runImport } = require('./import-wb-owner-status-workbook');

const MARIA = '\u041c\u0430\u0440\u0438\u044f \u0412\u0430\u0441\u0438\u043b\u044c\u0435\u0432\u0430';
const MAXIM = '\u041c\u0430\u043a\u0441\u0438\u043c \u041b\u0430\u043f\u044b\u0433\u0438\u043d';
const DARIA = '\u041c\u043e\u043b\u043e\u0434\u044f\u043a\u043e\u0432\u0430 \u0414\u0430\u0440\u0438\u044f';
const ACTIVE = '\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439';

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-owner-import-'));
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const workbookPath = path.join(root, 'owners.xlsx');
const reportPath = path.join(dataDir, 'report.json');

const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([
  ['\u0410\u0440\u0442\u0438\u043a\u0443\u043b', '\u0410\u0440\u0442\u0438\u043a\u0443\u043b \u0412\u0411', '\u0428\u041a', '\u0421\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c', '', '\u0421\u0442\u0430\u0442\u0443\u0441', '\u041c\u0418\u041d', '\u041c\u0410\u041a\u0421'],
  ['sku_one', 101, '4600000000001', 100, MAXIM, ACTIVE, 300, 400],
  ['sku_two', 102, '4600000000002', 120, MARIA, ACTIVE, 360, 480]
]);
XLSX.utils.book_append_sheet(workbook, sheet, 'WB');
XLSX.writeFile(workbook, workbookPath);

writeJson(path.join(dataDir, 'skus.json'), [
  {
    articleKey: 'sku_one',
    article: 'sku_one',
    status: ACTIVE,
    registryStatus: ACTIVE,
    owner: { name: MARIA, byPlatform: { wb: MARIA, ozon: DARIA } },
    ownersByPlatform: { wb: MARIA, ozon: DARIA },
    wb: { owner: MARIA, status: ACTIVE },
    ozon: { owner: DARIA, status: ACTIVE },
    platformMatrix: {
      wb: { owner: MARIA, status: ACTIVE },
      ozon: { owner: DARIA, status: ACTIVE }
    }
  },
  {
    articleKey: 'sku_two',
    article: 'sku_two',
    status: ACTIVE,
    registryStatus: ACTIVE,
    owner: { name: MARIA, byPlatform: { wb: MARIA } },
    ownersByPlatform: { wb: MARIA },
    wb: { owner: MARIA, status: ACTIVE },
    platformMatrix: { wb: { owner: MARIA, status: ACTIVE } }
  }
]);
writeJson(path.join(dataDir, 'smart_price_workbench.json'), {
  platforms: {
    wb: { rows: [{ articleKey: 'sku_one', owner: MARIA, status: ACTIVE }] },
    ozon: { rows: [{ articleKey: 'sku_one', owner: DARIA, status: ACTIVE }] }
  }
});
writeJson(path.join(dataDir, 'order_procurement_wb.json'), {
  rows: [{ articleKey: 'sku_one', platformKey: 'wb', owner: MARIA, lifecycleStatus: ACTIVE }]
});

const report = runImport({
  inputPath: workbookPath,
  dataDir,
  reportPath,
  runDate: '2026-07-16',
  generatedAt: '2026-07-16T00:00:00+03:00',
  dryRun: false,
  allowMissing: false
});

const skus = readJson(path.join(dataDir, 'skus.json'));
assert.strictEqual(skus[0].owner.name, MAXIM);
assert.strictEqual(skus[0].owner.byPlatform.wb, MAXIM);
assert.strictEqual(skus[0].owner.byPlatform.ozon, DARIA);
assert.strictEqual(skus[0].ownersByPlatform.ozon, DARIA);
assert.strictEqual(skus[0].platformMatrix.wb.owner, MAXIM);
assert.strictEqual(skus[0].platformMatrix.ozon.owner, DARIA);
assert.strictEqual(skus[0].wbOwnerDistribution.ownerWb, MAXIM);

const workbench = readJson(path.join(dataDir, 'smart_price_workbench.json'));
assert.strictEqual(workbench.platforms.wb.rows[0].owner, MAXIM);
assert.strictEqual(workbench.platforms.ozon.rows[0].owner, DARIA);
const procurement = readJson(path.join(dataDir, 'order_procurement_wb.json'));
assert.strictEqual(procurement.rows[0].owner, MAXIM);
assert.strictEqual(report.summary.matchedRows, 2);
assert.strictEqual(report.summary.ownerChanges, 1);
assert.deepStrictEqual(report.summary.activeOwnerCounts, { [MAXIM]: 1, [MARIA]: 1 });

console.log('import-wb-owner-status-workbook selftest: ok');
