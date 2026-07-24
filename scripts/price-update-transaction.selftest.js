#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  mergeOverlayWithPrevious,
  priceFactMetrics,
  promoteJsonGeneration,
  stampPriceGeneration,
  validatePriceGeneration
} = require('./price-update-transaction');

function row(articleKey, dates, price = 100) {
  const daily = dates.map((date) => ({ date, price }));
  return {
    articleKey,
    currentPrice: price,
    valueDate: dates.at(-1),
    daily
  };
}

function overlay(platformRows) {
  return {
    generatedAt: '2026-07-22T12:00:00.000Z',
    platforms: Object.fromEntries(
      Object.entries(platformRows).map(([platform, rows]) => [platform, { rows }])
    )
  };
}

const historyDates = ['2026-07-18', '2026-07-19', '2026-07-20'];
const previous = overlay({
  wb: ['a', 'b', 'c', 'd'].map((key) => row(key, historyDates)),
  ozon: ['a', 'b', 'c', 'd'].map((key) => row(key, historyDates, 110)),
  ym: ['a', 'b', 'c'].map((key) => row(key, historyDates, 120))
});
previous.extraMarketplace = { marker: 'keep' };

const freshSource = overlay({
  wb: ['a', 'b', 'c', 'd'].map((key) => row(key, [...historyDates, '2026-07-22'], 130)),
  ozon: ['a', 'b', 'c', 'd'].map((key) => row(key, [...historyDates, '2026-07-22'], 140))
});
const merged = mergeOverlayWithPrevious(freshSource, previous);
const mergedMetrics = priceFactMetrics(merged);
assert.strictEqual(mergedMetrics.byPlatform.wb.latestFactDate, '2026-07-22');
assert.strictEqual(mergedMetrics.byPlatform.ym.latestFactDate, '2026-07-20');
assert.strictEqual(merged.platforms.ym.rows.length, 3, 'Отсутствующая площадка не должна исчезать');
assert.strictEqual(merged.extraMarketplace.marker, 'keep');
assert.strictEqual(merged.platforms.wb.rows.find((item) => item.articleKey === 'a').currentPrice, 130);

const clientOnlyMetrics = priceFactMetrics(overlay({
  ozon: [{
    articleKey: 'client-only',
    currentClientPrice: 99,
    currentPriceDate: '2026-07-22',
    daily: [{ date: '2026-07-22', clientPrice: 99 }]
  }]
}));
assert.strictEqual(clientOnlyMetrics.byPlatform.ozon.pricedRowCount, 0, 'Клиентская цена без цены продавца не должна считаться заполненной ценой MP');
assert.strictEqual(clientOnlyMetrics.byPlatform.ozon.clientPricedRowCount, 1);

const validPrices = overlay({
  wb: merged.platforms.wb.rows,
  ozon: merged.platforms.ozon.rows,
  ym: merged.platforms.ym.rows
});
const validRepricer = { rows: [{ articleKey: 'a' }, { articleKey: 'b' }] };
const validAudit = validatePriceGeneration({
  previousOverlay: previous,
  previousRepricer: validRepricer,
  rawOverlay: freshSource,
  overlay: merged,
  prices: validPrices,
  repricer: validRepricer,
  expectedDate: '2026-07-23'
});
assert.strictEqual(validAudit.publishAllowed, true, validAudit.blockingReasons.join('\n'));
assert.ok(validAudit.warnings.some((message) => message.includes('ym')));

const partialSource = overlay({
  wb: [row('a', [...historyDates, '2026-07-22'], 150)],
  ozon: ['a', 'b', 'c', 'd'].map((key) => row(key, [...historyDates, '2026-07-22'], 140))
});
const partialMerged = mergeOverlayWithPrevious(partialSource, previous);
const partialAudit = validatePriceGeneration({
  previousOverlay: previous,
  previousRepricer: validRepricer,
  rawOverlay: partialSource,
  overlay: partialMerged,
  prices: overlay({
    wb: partialMerged.platforms.wb.rows,
    ozon: partialMerged.platforms.ozon.rows,
    ym: partialMerged.platforms.ym.rows
  }),
  repricer: validRepricer,
  expectedDate: '2026-07-23'
});
assert.strictEqual(partialAudit.publishAllowed, false);
assert.ok(
  partialAudit.blockingReasons.some((message) => message.includes('последний срез неполный')),
  partialAudit.blockingReasons.join('\n')
);

const stamped = stampPriceGeneration({
  overlay: merged,
  prices: validPrices,
  repricer: validRepricer
}, {
  asOfDate: mergedMetrics.latestFactDate,
  sourceKind: 'selftest',
  sourceMtime: '2026-07-22T12:00:00.000Z'
});
assert.ok(stamped.id.startsWith('prices-'));
assert.strictEqual(stamped.payloads.overlay.priceGeneration.id, stamped.id);
assert.strictEqual(stamped.payloads.prices.priceGeneration.id, stamped.id);
assert.strictEqual(stamped.payloads.repricer.priceGeneration.id, stamped.id);
const restamped = stampPriceGeneration(stamped.payloads, {
  asOfDate: mergedMetrics.latestFactDate,
  sourceKind: 'selftest',
  sourceMtime: '2026-07-22T12:00:00.000Z'
});
assert.strictEqual(
  restamped.id,
  stamped.id,
  'Повторная сборка тех же данных не должна создавать новый generation id'
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-price-generation-'));
try {
  const targets = Object.entries(stamped.payloads).map(([name, payload]) => ({
    path: path.join(tempDir, `${name}.json`),
    payload
  }));
  promoteJsonGeneration(targets);
  const ids = targets.map((target) => JSON.parse(fs.readFileSync(target.path, 'utf8')).priceGeneration.id);
  assert.strictEqual(new Set(ids).size, 1);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('price-update-transaction selftest: ok');
