#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  advertisingSnapshot,
  buildLiveSignals,
  directSnapshotUsable,
  mergeDirectWithFallback,
  normalizeOzonStocks,
  resolveOptions,
  skuIndexes
} = require('./portal-repricer-live-signals-sync');
const { normalizeKey } = require('./smart-price-contour');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repricer-live-signals-'));
  const inputDir = path.join(root, 'data');
  try {
    const dates = ['2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22'];
    const platformRows = (spend, revenue) => ({
      platforms: [
        { key: 'wb', series: dates.map((date) => ({ date, spend, revenue })) },
        { key: 'ozon', series: dates.map((date) => ({ date, spend, revenue })) }
      ]
    });
    writeJson(path.join(inputDir, 'ads_summary.json'), platformRows(100, 0));
    writeJson(path.join(inputDir, 'platform_trends.json'), platformRows(0, 1000));
    writeJson(path.join(inputDir, 'repricer_economics_policy.json'), {
      platforms: {
        wb: { internalAdvertisingPct: 8.77 },
        ozon: { internalAdvertisingPct: 24.878 }
      }
    });
    writeJson(path.join(inputDir, 'skus.json'), [
      { articleKey: 'sku-a', nmId: '101' },
      { articleKey: 'sku-b', nmId: '102' }
    ]);
    writeJson(path.join(inputDir, 'order_procurement_wb.json'), {
      generatedAt: '2026-07-23T00:00:00Z',
      window: { to: '2026-07-23' },
      rows: [
        { articleKey: 'sku-a', place: 'A', inStock: 0, inTransit: 0, inRequest: 0 },
        { articleKey: 'sku-a', place: 'B', inStock: 5, inTransit: 0, inRequest: 0 },
        { articleKey: 'sku-b', place: 'A', inStock: 0, inTransit: 0, inRequest: 0 }
      ]
    });
    writeJson(path.join(inputDir, 'order_procurement_ozon.json'), {
      generatedAt: '2026-07-23T00:00:00Z',
      window: { to: '2026-07-23' },
      rows: [{ articleKey: 'sku-a', inStock: 0, inTransit: 3, inRequest: 0 }]
    });

    const economicsPolicy = readJson(path.join(inputDir, 'repricer_economics_policy.json'));
    const observedBelowContract = advertisingSnapshot({
      platform: 'wb',
      adsSummary: readJson(path.join(inputDir, 'ads_summary.json')),
      platformTrends: readJson(path.join(inputDir, 'platform_trends.json')),
      economicsPolicy,
      asOfDate: '2026-07-24'
    });
    assert.strictEqual(observedBelowContract.status, 'trusted');
    assert.strictEqual(observedBelowContract.observedPct, 0.1);
    assert.strictEqual(observedBelowContract.appliedPct, 0.1);

    const highContract = advertisingSnapshot({
      platform: 'ozon',
      adsSummary: readJson(path.join(inputDir, 'ads_summary.json')),
      platformTrends: readJson(path.join(inputDir, 'platform_trends.json')),
      economicsPolicy,
      asOfDate: '2026-07-24'
    });
    assert.strictEqual(highContract.observedPct, 0.1);
    assert.strictEqual(highContract.appliedPct, 0.24878);

    const payload = await buildLiveSignals({
      ...resolveOptions({
        'input-dir': inputDir,
        'as-of-date': '2026-07-24',
        'skip-stock-api': true
      }),
      inputDir,
      asOfDate: '2026-07-24',
      skipStockApi: true
    });
    const wbA = payload.rows.find((row) => row.platform === 'wb' && row.articleKey === 'sku-a');
    const wbB = payload.rows.find((row) => row.platform === 'wb' && row.articleKey === 'sku-b');
    const ozA = payload.rows.find((row) => row.platform === 'ozon' && row.articleKey === 'sku-a');
    assert(wbA.partialOos, 'one zero warehouse with positive aggregate stock must be partial OOS');
    assert(!wbA.oos, 'positive aggregate stock must not be full OOS');
    assert(wbB.oos, 'zero aggregate and zero inbound must be OOS');
    assert(!ozA.oos, 'inbound stock must prevent full OOS');

    const indexes = skuIndexes([{ articleKey: 'sku-a' }]);
    const normalized = normalizeOzonStocks([{
      offer_id: 'sku-a',
      stocks: [
        { type: 'fbo', present: 10, reserved: 3 },
        { type: 'fbs', present: 2, reserved: 1 }
      ]
    }], indexes, '2026-07-24', 'v3');
    assert.strictEqual(normalized.rows[0].present, 12);
    assert.strictEqual(normalized.rows[0].reserved, 4);
    assert.strictEqual(normalized.rows[0].available, 8);
    assert.strictEqual(normalized.rows[0].oos, false);
    assert.strictEqual(directSnapshotUsable(normalized), true);
    assert.strictEqual(directSnapshotUsable({ status: 'trusted_direct', sourceRows: 0, rows: [] }), false);

    const enrichedIndexes = skuIndexes([{
      articleKey: 'sku-alias',
      platformAliases: { wb: ['wb-nm-777'], ozon: ['ozon-offer-alias'] }
    }], {
      platforms: {
        wb: { rows: [{ articleKey: 'sku-live', nmId: 888 }] },
        ozon: { rows: [{ articleKey: 'sku-live', offerId: 'ozon-live-offer' }] }
      }
    });
    assert.strictEqual(enrichedIndexes.byWbNmId.get('777'), 'sku-alias');
    assert.strictEqual(enrichedIndexes.byWbNmId.get('888'), 'sku-live');
    assert.strictEqual(enrichedIndexes.byArticle.get(normalizeKey('ozon-offer-alias')), 'sku-alias');
    assert.strictEqual(enrichedIndexes.byArticle.get(normalizeKey('ozon-live-offer')), 'sku-live');

    const mixed = mergeDirectWithFallback(normalized, {
      rows: [
        stockRowFixture('sku-a', 'ozon', 1, 'fallback_procurement'),
        stockRowFixture('sku-b', 'ozon', 2, 'fallback_procurement')
      ]
    });
    assert.strictEqual(mixed.directRows, 1);
    assert.strictEqual(mixed.fallbackRows, 1);
    assert.strictEqual(mixed.directCoverage, 0.5);
    assert.strictEqual(mixed.rows.find((row) => row.articleKey === 'sku-a').sourceMode, 'ozon_stock_api_v3');
    assert.strictEqual(mixed.rows.find((row) => row.articleKey === 'sku-b').sourceMode, 'fallback_procurement');

    await assert.rejects(
      () => buildLiveSignals({
        ...resolveOptions({
          'input-dir': inputDir,
          'as-of-date': '2026-07-24',
          strict: true
        }),
        inputDir,
        asOfDate: '2026-07-24',
        strict: true,
        skipStockApi: false,
        wbToken: '',
        ozonClientId: '',
        ozonApiKey: ''
      }),
      /wb direct stock snapshot is unavailable/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('[portal-repricer-live-signals-sync] PASS: safe ad rate, fresh stock, partial OOS and full OOS are separated');
}

function stockRowFixture(articleKey, platform, available, sourceMode) {
  return {
    articleKey,
    normalizedArticleKey: normalizeKey(articleKey),
    platform,
    present: available,
    reserved: 0,
    available,
    inbound: 0,
    oos: available <= 0,
    partialOos: false,
    source: sourceMode,
    sourceMode,
    asOfDate: '2026-07-24'
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

run().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
