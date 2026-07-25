#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const {
  INPUTS,
  parseMarginPct,
  readInputRows,
  updateRow
} = require('./import-repricer-min-max');
const {
  readSourceMatrix
} = require('./import-ksenia-minmax-matrix');
const {
  lifecycleApprovalMap,
  lifecycleApprovalFor,
  marginGuardRequired
} = require('./build-canonical-repricer');
const {
  alignedPriceGenerationForRepricer,
  buildSide
} = require('./build-legacy-repricer-layer');

function writeWorkbook(filePath, rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Данные');
  XLSX.writeFile(workbook, filePath);
}

function run() {
  assert.deepStrictEqual(
    alignedPriceGenerationForRepricer(
      { priceGeneration: { id: 'prices-test', builtAt: '2026-07-24T00:00:00.000Z', artifact: 'prices' } },
      { priceGeneration: { id: 'prices-test', artifact: 'overlay' } }
    ),
    { id: 'prices-test', builtAt: '2026-07-24T00:00:00.000Z', artifact: 'repricer' }
  );
  assert.strictEqual(
    alignedPriceGenerationForRepricer(
      { priceGeneration: { id: 'prices-a' } },
      { priceGeneration: { id: 'prices-b' } }
    ),
    null
  );

  assert.strictEqual(parseMarginPct('25%'), 0.25);
  assert.strictEqual(parseMarginPct(25), 0.25);
  assert.strictEqual(parseMarginPct('0,25'), 0.25);
  assert.strictEqual(parseMarginPct(0), null);
  assert.strictEqual(parseMarginPct(100), null);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repricer-margin-'));
  try {
    const wbPath = path.join(tempDir, 'Мин макс ВБ.xlsx');
    writeWorkbook(wbPath, [
      ['Артикул', 'Цена мин', 'Цена макс', 'Маржа, %'],
      ['sku-active', 90, 100, '40%'],
      ['sku-new', 80, 120, 0.25]
    ]);
    const imported = readInputRows(tempDir, INPUTS[0]);
    assert.strictEqual(imported.rows.length, 2);
    assert.strictEqual(imported.rows[0].targetMarginPct, 0.4);
    assert.strictEqual(imported.rows[1].targetMarginPct, 0.25);

    const target = { articleKey: 'sku-active', minPrice: 70, maxPrice: 130, allowedMarginPct: 0.2 };
    updateRow(target, imported.rows[0], 'smart_price_workbench.json');
    assert.strictEqual(target.manualMarginPct, 0.4);
    assert.strictEqual(target.targetMarginPct, 0.4);
    assert.strictEqual(target.allowedMarginPct, 0.4);

    writeWorkbook(wbPath, [
      ['Артикул', 'Цена мин', 'Цена макс', 'Маржа, %'],
      ['sku-active', 90, 100, '']
    ]);
    assert.throws(
      () => readInputRows(tempDir, INPUTS[0]),
      /Маржа обязательна/
    );

    const kseniaPath = path.join(tempDir, 'portal_merged_statuses_from_ksenia_minmax.xlsx');
    writeWorkbook(kseniaPath, [
      ['Площадка', 'Артикул', 'Статус', 'Штрихкод', 'Ответственный', 'Себестоимость', 'MIN', 'MAX', 'Маржа, %'],
      ['WB', 'sku-active', 'Актуальный', '123', '', 70, 90, 100, 40],
      ['Ozon', 'sku-new', 'Новинка', '456', '', 40, 70, 120, '25%']
    ]);
    const matrix = readSourceMatrix(kseniaPath);
    assert.strictEqual(matrix.columns.margin, 8);
    assert.deepStrictEqual(matrix.rows.map((row) => row.targetMarginPct), [0.4, 0.25]);

    writeWorkbook(kseniaPath, [
      ['Площадка', 'Артикул', 'Статус', 'Штрихкод', 'Ответственный', 'Себестоимость', 'MIN', 'MAX'],
      ['WB', 'sku-active', 'Актуальный', '123', '', 70, 90, 100]
    ]);
    assert.throws(
      () => readSourceMatrix(kseniaPath),
      /обязательная колонка «Маржа, %»/
    );

    fs.writeFileSync(path.join(tempDir, 'product_lifecycle_approved.json'), JSON.stringify({
      records: [
        {
          id: 'status-approval-1',
          articleKey: 'sku-active',
          platform: 'all',
          lifecycleKey: 'exit',
          approvalStatus: 'approved',
          author: 'Category manager',
          role: 'Product',
          reason: 'Approved managed exit',
          createdAt: '2026-07-24T08:00:00.000Z',
          approvedBy: 'ROP',
          approvedAt: '2026-07-24T09:00:00.000Z'
        },
        {
          id: 'status-draft-1',
          articleKey: 'sku-new',
          lifecycleKey: 'exit',
          approvalStatus: 'waiting_rop',
          author: 'Category manager',
          role: 'Product',
          reason: 'Not approved yet',
          createdAt: '2026-07-24T08:00:00.000Z',
          approvedBy: 'ROP',
          approvedAt: '2026-07-24T09:00:00.000Z'
        }
      ]
    }, null, 2));
    const lifecycleApprovals = lifecycleApprovalMap(tempDir);
    assert.strictEqual(lifecycleApprovalFor(lifecycleApprovals, 'sku-active', 'wb').lifecycleKey, 'exit');
    assert.strictEqual(lifecycleApprovalFor(lifecycleApprovals, 'sku-new', 'wb'), null);
    assert.strictEqual(marginGuardRequired(lifecycleApprovalFor(lifecycleApprovals, 'sku-active', 'wb').lifecycleKey), false);

    const protectedSide = buildSide({
      articleKey: 'sku-active',
      status: 'Актуальный',
      currentPrice: 80,
      currentClientPrice: 80,
      cost: 70,
      minPrice: 90,
      workingZoneTo: 100,
      seedTargetFillPrice: 75,
      targetMarginPct: 0.4
    }, 'wb', null, null, null, '', {
      snapshotAvailable: true,
      present: true,
      inStock: 10,
      inTransit: 0,
      inRequest: 0
    });
    assert.strictEqual(protectedSide.marginFloor, 117);
    assert.strictEqual(protectedSide.recPrice, 117);
    assert.strictEqual(protectedSide.upperCap, 117);
    assert.strictEqual(protectedSide.capLiftedByMargin, true);
    assert(protectedSide.newMarginPct >= 0.4);

    const missingMarginSide = buildSide({
      articleKey: 'sku-active-without-margin',
      status: 'Актуальный',
      currentPrice: 80,
      currentClientPrice: 80,
      cost: 70,
      minPrice: 90,
      workingZoneTo: 100,
      seedTargetFillPrice: 75
    }, 'wb', null, null, null, '', {
      snapshotAvailable: true,
      present: true,
      inStock: 10,
      inTransit: 0,
      inRequest: 0
    });
    assert.strictEqual(missingMarginSide.marginGuardRequired, true);
    assert.strictEqual(missingMarginSide.marginPolicyMissing, true);
    assert.strictEqual(missingMarginSide.action, 'BLOCK_MARGIN');
    assert.strictEqual(missingMarginSide.recPrice, 80);
    assert.match(missingMarginSide.reason, /Нет обязательной маржи SKU/);

    const exitSide = buildSide({
      articleKey: 'sku-exit',
      status: 'Вывод',
      currentPrice: 80,
      currentClientPrice: 80,
      cost: 70,
      minPrice: 90,
      workingZoneTo: 100,
      seedTargetFillPrice: 75,
      targetMarginPct: 0.4
    }, 'wb', null, null, null, '', {
      snapshotAvailable: true,
      present: true,
      inStock: 10,
      inTransit: 0,
      inRequest: 0
    });
    assert.strictEqual(exitSide.marginGuardRequired, false);
    assert.strictEqual(exitSide.marginFloor, 0);
    assert.strictEqual(exitSide.recPrice, 90);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('[repricer-margin-guard-selftest] OK: Excel margin parsing, required-column blocking, propagation, and legacy margin priority passed');
}

run();
