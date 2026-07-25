#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const { applyUpload } = require('./portal-upload-apply-runtime');
const { buildCanonicalRepricer, stableStringify } = require('./build-canonical-repricer');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function touchStable(filePath) {
  const date = new Date('2026-06-20T00:00:00.000Z');
  fs.utimesSync(filePath, date, date);
}

function writeWorkbook(filePath, rows, sheetName = 'Upload') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName);
  XLSX.writeFile(workbook, filePath);
  touchStable(filePath);
  return filePath;
}

function writeCsv(filePath, rows, delimiter = ',') {
  const headers = Object.keys(rows[0] || {});
  const lines = [headers.join(delimiter), ...rows.map((row) => headers.map((header) => row[header] ?? '').join(delimiter))];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  touchStable(filePath);
  return filePath;
}

function writeRefWorkbook(filePath) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    { articleKey: 'sku-1', platform: 'wb', 'Маржа, %': 25, minPrice: 90, maxPrice: 150, effectiveFrom: '2026-06-20', author: 'Codex', role: 'admin', reason: 'test' }
  ]);
  sheet.D2 = { t: 'e', v: 23, w: '#REF!', f: 'Z999+#REF!' };
  XLSX.utils.book_append_sheet(workbook, sheet, 'Upload');
  XLSX.writeFile(workbook, filePath);
  touchStable(filePath);
  return filePath;
}

function seedData(root) {
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  writeJson(path.join(dataDir, 'skus.json'), [
    {
      articleKey: 'sku-1',
      article: 'sku-1',
      legalEntity: 'Alisia LLC',
      aliases: [{ value: 'sku-alias-1' }]
    }
  ]);
  writeJson(path.join(dataDir, 'smart_price_workbench.json'), {
    generatedAt: '2026-06-20T00:00:00.000Z',
    platforms: {
      wb: {
        rows: [
          {
            articleKey: 'sku-1',
            status: 'Актуальный',
            currentPrice: 100,
            currentPriceDate: '2026-06-20',
            currentClientPrice: 95,
            costRub: 40,
            minPrice: 70,
            maxPrice: 130
          }
        ]
      },
      ozon: { rows: [] },
      ym: { rows: [] }
    }
  });
  writeJson(path.join(dataDir, 'smart_price_overlay.json'), { generatedAt: '2026-06-20T00:00:00.000Z', platforms: { wb: { rows: [] }, ozon: { rows: [] }, ym: { rows: [] } } });
  writeJson(path.join(dataDir, 'price_workbench_support.json'), { generatedAt: '2026-06-20T00:00:00.000Z', platforms: { wb: { rows: [] }, ozon: { rows: [] }, ym: { rows: [] } } });
  writeJson(path.join(dataDir, 'order_procurement_wb.json'), {
    generatedAt: '2026-06-20T00:00:00.000Z',
    asOfDate: '2026-06-20',
    rows: [{ articleKey: 'sku-1', inStock: 7, inTransit: 1, inRequest: 0, date: '2026-06-20' }]
  });
  writeJson(path.join(dataDir, 'order_procurement_ozon.json'), { generatedAt: '2026-06-20T00:00:00.000Z', rows: [] });
  writeJson(path.join(dataDir, 'order_procurement_ym.json'), { generatedAt: '2026-06-20T00:00:00.000Z', rows: [] });
  writeJson(path.join(dataDir, 'portal_indicator_policy.json'), {
    schema: 'portal-indicator-policy-v1',
    version: 'selftest',
    visual_rules: {
      blocked: { color: 'red', business_status: 'neutral', label: 'blocked' },
      trusted: { color: 'green', business_status: null, label: 'trusted' }
    },
    policies: {
      price_default: { requires: ['trusted_current_price', 'complete_economics', 'approved_corridor'] },
      turnover_default: { target_days: 30 }
    }
  });
  writeJson(path.join(dataDir, 'portal_metric_registry.json'), { schema: 'portal-metric-registry-v1', version: 'selftest', metrics: [] });
  writeJson(path.join(dataDir, 'portal_feature_policy.json'), {
    schema: 'portal-feature-policy-v1',
    features: { repricer: { required_publishable_coverage: 0.01, maintenance_mode: false, maintenance_reason: '' } }
  });
  writeJson(path.join(dataDir, 'repricer_economics_policy.json'), {
    schema: 'repricer-economics-policy-v1',
    version: 'selftest',
    enabledPlatforms: ['wb'],
    platforms: {
      wb: {
        commissionPct: 10,
        logisticsPerUnit: 5,
        taxPct: 6
      }
    }
  });
  return dataDir;
}

function canonicalRow(dataDir, outDir) {
  const { payload } = buildCanonicalRepricer({
    inputDir: dataDir,
    outputDir: outDir,
    liveWorkbenchPath: path.join(path.dirname(dataDir), 'tmp-smart_price_workbench-live.json'),
    asOfDate: '2026-06-20',
    noWrite: false,
    noFail: true
  });
  const row = payload.rows.find((item) => item.article_key === 'sku-1' && item.platform === 'wb');
  assert(row, 'canonical row must exist');
  return row;
}

function uploadOptions(dataDir, outDir, patch = {}) {
  return {
    inputDir: dataDir,
    outputDir: outDir,
    author: 'Codex',
    role: 'admin',
    reason: 'selftest',
    canApprove: true,
    noWrite: false,
    ...patch
  };
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-upload-selftest-'));
  const dataDir = seedData(root);
  const outDir = path.join(root, 'out');
  const uploadDir = path.join(root, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const validMinMax = writeWorkbook(path.join(uploadDir, 'minmax.xlsx'), [
    { articleKey: 'sku-1', platform: 'wb', 'Маржа, %': 25, minPrice: 90, maxPrice: 150, effectiveFrom: '2026-06-20', author: 'Codex', role: 'admin', reason: 'approved corridor' }
  ]);
  const minmaxReport = applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: validMinMax }));
  assert.strictEqual(minmaxReport.e2e.status, 'ok');
  let row = canonicalRow(dataDir, outDir);
  assert.strictEqual(row.policy.floor, 90);
  assert.strictEqual(row.policy.cap, 150);
  assert.strictEqual(row.policy.target_margin_pct, 0.25);
  assert.strictEqual(row.policy.sources.floor.sourceStore, 'server_upload');
  assert.strictEqual(row.policy.sources.margin.sourceStore, 'server_upload');
  assert.strictEqual(row.facts.price_freshness, 'fresh');
  assert.strictEqual(row.recommendation.status, 'ready');

  const workbenchPath = path.join(dataDir, 'smart_price_workbench.json');
  const staleWorkbench = readJson(workbenchPath);
  staleWorkbench.platforms.wb.rows[0].currentPriceDate = '2026-06-10';
  writeJson(workbenchPath, staleWorkbench);
  row = canonicalRow(dataDir, outDir);
  assert.strictEqual(row.facts.price_freshness, 'stale');
  assert.strictEqual(row.recommendation.status, 'blocked');
  assert(row.recommendation.reason_codes.includes('stale_current_seller_price'));
  staleWorkbench.platforms.wb.rows[0].currentPriceDate = '2026-06-20';
  writeJson(workbenchPath, staleWorkbench);

  const registryBefore = stableStringify(readJson(path.join(dataDir, 'repricer_minmax_registry.json')));
  applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: validMinMax }));
  const registryAfter = stableStringify(readJson(path.join(dataDir, 'repricer_minmax_registry.json')));
  assert.strictEqual(registryAfter, registryBefore, 'reimporting the same approved batch must be idempotent');

  const marginPriority = writeWorkbook(path.join(uploadDir, 'margin-priority.xlsx'), [
    { articleKey: 'sku-1', platform: 'wb', 'Маржа, %': 40, minPrice: 90, maxPrice: 100, effectiveFrom: '2026-06-21', author: 'Codex', role: 'admin', reason: 'margin must win over max' }
  ]);
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: marginPriority })).e2e.status, 'ok');
  row = canonicalRow(dataDir, outDir);
  assert.strictEqual(row.policy.margin_floor, 103);
  assert.strictEqual(row.policy.floor, 103);
  assert.strictEqual(row.policy.cap, 103);
  assert.strictEqual(row.policy.cap_lifted_by_margin, true);
  assert.strictEqual(row.recommendation.price, 103);
  assert(row.recommendation.margin_pct >= 0.4, 'final price must not fall below per-SKU target margin');
  assert(row.recommendation.reason_codes.includes('margin_floor_applied'));
  assert(row.recommendation.reason_codes.includes('cap_lifted_by_margin_floor'));

  const validTsv = writeCsv(path.join(uploadDir, 'minmax.tsv'), [
    { articleKey: 'sku-alias-1', platform: 'wb', margin: '25%', minPrice: 91, maxPrice: 151, effectiveFrom: '2026-06-20', author: 'Codex', role: 'admin', reason: 'tsv alias' }
  ], '\t');
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: validTsv })).e2e.status, 'ok');

  const validLegacyXls = writeWorkbook(path.join(uploadDir, 'minmax-legacy.xls'), [
    { articleKey: 'sku-alias-1', platform: 'ozon', 'Маржа, %': '27%', minPrice: 93, maxPrice: 161, effectiveFrom: '2026-06-23', author: 'Codex', role: 'admin', reason: 'legacy xls round-trip' }
  ]);
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: validLegacyXls })).e2e.status, 'ok');
  const legacyXlsRecord = readJson(path.join(dataDir, 'repricer_minmax_registry.json')).rows
    .find((item) => item.sourceFile === 'minmax-legacy.xls');
  assert(legacyXlsRecord, 'legacy XLS upload must be persisted in the registry');
  assert.strictEqual(legacyXlsRecord.articleKey, 'sku-1');
  assert.strictEqual(legacyXlsRecord.platform, 'ozon');
  assert.strictEqual(legacyXlsRecord.targetMarginPct, 0.27);
  assert.strictEqual(legacyXlsRecord.effectiveFrom, '2026-06-23');

  const invalidMinMax = writeWorkbook(path.join(uploadDir, 'minmax-bad.xlsx'), [
    { articleKey: 'sku-1', platform: 'wb', 'Маржа, %': 25, minPrice: 200, maxPrice: 150, effectiveFrom: '2026-06-20', author: 'Codex', role: 'admin', reason: 'bad corridor' }
  ]);
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: invalidMinMax })).e2e.status, 'blocked');

  const missingMargin = writeWorkbook(path.join(uploadDir, 'missing-margin.xlsx'), [
    { articleKey: 'sku-1', platform: 'wb', minPrice: 90, maxPrice: 150, effectiveFrom: '2026-06-20', author: 'Codex', role: 'admin', reason: 'missing margin' }
  ]);
  const missingMarginReport = applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: missingMargin }));
  assert.strictEqual(missingMarginReport.e2e.status, 'blocked');
  assert(missingMarginReport.minmax.errors.some((error) => error.code === 'missing_columns'));

  const unknownSku = writeWorkbook(path.join(uploadDir, 'unknown.xlsx'), [
    { articleKey: 'missing-sku', platform: 'wb', 'Маржа, %': 25, minPrice: 90, maxPrice: 150, effectiveFrom: '2026-06-20', author: 'Codex', role: 'admin', reason: 'bad sku' }
  ]);
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: unknownSku })).e2e.status, 'blocked');

  const refWorkbook = writeRefWorkbook(path.join(uploadDir, 'ref.xlsx'));
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: refWorkbook })).e2e.status, 'blocked');

  const pendingMinMax = writeWorkbook(path.join(uploadDir, 'pending.xlsx'), [
    { articleKey: 'sku-1', platform: 'wb', 'Маржа, %': 30, minPrice: 300, maxPrice: 400, effectiveFrom: '2026-06-20', author: 'Codex', role: 'admin', reason: 'pending' }
  ]);
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: pendingMinMax, canApprove: false })).e2e.status, 'pending_review');
  row = canonicalRow(dataDir, outDir);
  assert.notStrictEqual(row.policy.floor, 300, 'pending review batch must not alter canonical policy');

  writeJson(path.join(dataDir, 'repricer_minmax_registry.json'), {
    rows: [
      ...readJson(path.join(dataDir, 'repricer_minmax_registry.json')).rows,
      {
        id: 'local-draft',
        batchId: 'local',
        articleKey: 'sku-1',
        platform: 'wb',
        minPrice: 10,
        maxPrice: 20,
        effectiveFrom: '2026-06-20',
        author: 'browser',
        role: 'draft',
        reason: 'local draft',
        createdAt: '2026-06-20T00:00:00.000Z',
        approvalStatus: 'approved',
        approvedBy: 'browser',
        approvedAt: '2026-06-20T00:00:00.000Z',
        sourceStore: 'local_storage_draft_only',
        sourceFile: 'localStorage',
        sourceChecksum: 'draft'
      }
    ]
  });
  row = canonicalRow(dataDir, outDir);
  assert.notStrictEqual(row.policy.floor, 10, 'localStorage draft must not alter canonical policy');

  const validCost = writeWorkbook(path.join(uploadDir, 'cost.xlsx'), [
    { articleKey: 'sku-1', legalEntity: 'Alisia LLC', cost: 55, currency: 'RUB', unit: 'piece', effectiveFrom: '2026-06-20', author: 'Codex', role: 'admin', reason: 'verified cost' }
  ]);
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'cost_price', file: validCost })).e2e.status, 'ok');
  row = canonicalRow(dataDir, outDir);
  assert.strictEqual(row.economics.cost, 55);
  assert.strictEqual(row.economics.sources.cost.sourceStore, 'server_upload');

  const zeroCost = writeWorkbook(path.join(uploadDir, 'zero-cost.xlsx'), [
    { articleKey: 'sku-1', legalEntity: 'Alisia LLC', cost: 0, currency: 'RUB', unit: 'piece', effectiveFrom: '2026-06-20', author: 'Codex', role: 'admin', reason: 'bad zero' }
  ]);
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'cost_price', file: zeroCost })).e2e.status, 'blocked');
  row = canonicalRow(dataDir, outDir);
  assert.strictEqual(row.economics.cost, 55, 'blank/zero cost must not erase verified cost');

  applyUpload(uploadOptions(dataDir, outDir, { generateTemplates: true, noWrite: false }));
  const template = XLSX.readFile(path.join(dataDir, 'templates', 'portal-min-max-template.xlsx'));
  assert.deepStrictEqual(template.SheetNames, [
    '\u0417\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435',
    '\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f',
    '\u0421\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a',
    '\u041e\u0448\u0438\u0431\u043a\u0438_\u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0435\u0439_\u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438'
  ]);
  const templateHeaders = XLSX.utils.sheet_to_json(template.Sheets[template.SheetNames[0]], { header: 1, defval: '' })[0];
  assert.deepStrictEqual(templateHeaders.slice(0, 5), ['Маржа, %', 'articleKey', 'platform', 'minPrice', 'maxPrice']);

  const templateRoundTripPath = path.join(uploadDir, 'portal-min-max-template-filled.xlsx');
  const templateSheet = template.Sheets[template.SheetNames[0]];
  const templateValues = {
    articleKey: 'sku-1',
    platform: 'wb',
    'Маржа, %': 0.35,
    minPrice: 92,
    maxPrice: 160,
    effectiveFrom: '2026-06-22',
    author: 'Codex',
    role: 'admin',
    reason: 'filled generated template round-trip'
  };
  XLSX.utils.sheet_add_aoa(templateSheet, [templateHeaders.map((header) => templateValues[header] ?? '')], { origin: 'A2' });
  XLSX.writeFile(template, templateRoundTripPath);
  touchStable(templateRoundTripPath);
  const templateRoundTripReport = applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: templateRoundTripPath }));
  assert.strictEqual(templateRoundTripReport.e2e.status, 'ok');
  row = canonicalRow(dataDir, outDir);
  assert.strictEqual(row.policy.target_margin_pct, 0.35);
  assert.strictEqual(row.policy.min_max_floor, 92);
  assert.strictEqual(row.policy.min_max_cap, 160);
  assert.strictEqual(row.policy.sources.margin.sourceFile, 'portal-min-max-template-filled.xlsx');

  const validCsv = writeCsv(path.join(uploadDir, 'minmax.csv'), [
    { articleKey: 'sku-alias-1', platform: 'wb', margin: '26%', minPrice: 93, maxPrice: 161, effectiveFrom: '2026-06-23', author: 'Codex', role: 'admin', reason: 'csv round-trip' }
  ]);
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: validCsv })).e2e.status, 'ok');
  row = canonicalRow(dataDir, outDir);
  assert.strictEqual(row.policy.target_margin_pct, 0.26);
  assert.strictEqual(row.policy.min_max_floor, 93);
  assert.strictEqual(row.policy.min_max_cap, 161);
  assert.strictEqual(row.policy.sources.margin.sourceFile, 'minmax.csv');

  const sharpMinMax = writeWorkbook(path.join(uploadDir, 'sharp-minmax.xlsx'), [
    { articleKey: 'sku-1', platform: 'wb', 'Маржа, %': 26, minPrice: 150, maxPrice: 160, effectiveFrom: '2026-06-24', author: 'Codex', role: 'admin', reason: 'sharp recommendation needs ROP' }
  ]);
  assert.strictEqual(applyUpload(uploadOptions(dataDir, outDir, { dataset: 'min_max', file: sharpMinMax })).e2e.status, 'ok');
  row = canonicalRow(dataDir, outDir);
  assert.strictEqual(row.recommendation.price, 150);
  assert.strictEqual(row.recommendation.status, 'waiting_rop');
  assert.strictEqual(row.approval_gate.required, true);
  assert(row.recommendation.reason_codes.includes('sharp_price_requires_rop'));

  writeJson(path.join(dataDir, 'repricer_approved_overrides.json'), {
    records: [{
      id: 'approved-sharp-price',
      articleKey: 'sku-1',
      platform: 'wb',
      price: 150,
      approvalStatus: 'approved',
      author: 'Category manager',
      role: 'Product',
      reason: 'ROP approved sharp price',
      createdAt: '2026-06-24T08:00:00.000Z',
      approvedBy: 'ROP',
      approvedAt: '2026-06-24T09:00:00.000Z'
    }]
  });
  row = canonicalRow(dataDir, outDir);
  assert.strictEqual(row.recommendation.status, 'ready');
  assert.strictEqual(row.approval_gate.required, false);
  assert.strictEqual(row.approval_gate.status, 'approved');

  const skuRegistry = readJson(path.join(dataDir, 'skus.json'));
  skuRegistry[0].status = 'Вывод';
  skuRegistry[0].sheetStatus = 'Вывод';
  skuRegistry[0].platformMatrix = { wb: { status: 'Вывод' } };
  writeJson(path.join(dataDir, 'skus.json'), skuRegistry);
  row = canonicalRow(dataDir, outDir);
  assert.strictEqual(row.facts.lifecycle_key, 'exit');
  assert.strictEqual(row.facts.product_status, 'Вывод');
  assert.strictEqual(row.policy.margin_guard_required, false);

  console.log('[upload-apply-selftest] OK: XLSX/XLS/CSV/TSV, freshness block, status priority, margin guard, sharp-price ROP gate, approval, canonical rebuild, and exports passed');
}

if (require.main === module) main();
