#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');

const {
  applyReconciliation,
  buildReport,
  normalizeRate,
  parseWorkbook,
  validateControlWindows,
  validateDailyRows
} = require('./build-wb-fixed-rate-report');

function makeWorkbook(filePath) {
  const rows = [
    ['WB fixed-rate detailed report'],
    [
      'Year',
      'Period',
      'Sales target',
      'Sales fact',
      'Sales delta',
      'Sales delta pct',
      'Ad plan',
      'Ad plan pct',
      'Ad fact',
      'Ad fact pct',
      'Ad delta',
      'Ad delta pct',
      'Sales completion',
      'Ads completion'
    ],
    [2026, '02.07', 1000, 1200, 200, 20, 96, 8, 60, 5, -36, -37.5, 120, 62.5],
    [2026, '03.07', 1000, 800, -200, -20, 64, 8, 80, 10, 16, 25, 80, 125]
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Meta'], ['Period', 'test']]), 'Info');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Details');
  XLSX.writeFile(workbook, filePath);
}

function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-fixed-rate-test-'));
  const filePath = path.join(tmpDir, 'fixed-rate-test.xlsx');
  makeWorkbook(filePath);

  assert.strictEqual(normalizeRate(8), 0.08);
  assert.strictEqual(normalizeRate('5.5'), 0.055);
  assert.strictEqual(normalizeRate(0.125), 0.125);

  const parsed = parseWorkbook(filePath);
  assert.strictEqual(parsed.sheetName, 'Details');
  assert.strictEqual(parsed.daily.length, 2);
  assert.deepStrictEqual(parsed.daily.map((row) => row.date), ['2026-07-02', '2026-07-03']);
  assert.strictEqual(parsed.daily[0].planPct, 0.08);
  assert.strictEqual(parsed.daily[0].factPct, 0.05);
  assert.strictEqual(parsed.daily[1].adsCompletionPct, 1.25);

  const validation = validateDailyRows(parsed.daily);
  assert.deepStrictEqual(validation.errors, []);

  const reconciliation = {
    daily: [
      {
        date: '2026-07-01',
        targetRevenue: 1000,
        revenue: 900,
        planSpend: 72,
        planPct: 0.08,
        spendFact: 30,
        factPct: 0.033333,
        source: 'fixture reconciliation'
      }
    ],
    controlWindows: [
      {
        from: '2026-07-01',
        to: '2026-07-03',
        targetRevenue: 3000,
        revenue: 2900,
        planSpend: 232,
        spendFact: 170
      }
    ]
  };
  const reconciled = applyReconciliation(parsed.daily, reconciliation);
  assert.deepStrictEqual(reconciled.daily.map((row) => row.date), ['2026-07-01', '2026-07-02', '2026-07-03']);
  assert.strictEqual(reconciled.daily[0].source, 'fixture reconciliation');
  assert.deepStrictEqual(validateControlWindows(reconciled.daily, reconciliation.controlWindows).errors, []);

  const reconciliationPath = path.join(tmpDir, 'wb-fixed-rate-reconciliation.json');
  fs.writeFileSync(reconciliationPath, `${JSON.stringify(reconciliation, null, 2)}\n`, 'utf8');

  const report = buildReport({ source: filePath, downloadsDir: tmpDir, reconciliation: reconciliationPath });
  assert.strictEqual(report.sourceWorkbook, 'fixed-rate-test.xlsx');
  assert.deepStrictEqual(report.period, { from: '2026-07-01', to: '2026-07-03' });
  assert.strictEqual(report.daily.length, 3);
  assert.strictEqual(report.diagnostics.workbookRows, 2);
  assert.strictEqual(report.diagnostics.reconciliation.applied.length, 1);
  assert.ok(report.sourceWorkbookSha256);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('build-wb-fixed-rate-report selftest ok');
}

main();
