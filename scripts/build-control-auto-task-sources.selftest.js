#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildPayload } = require('./build-control-auto-task-sources');

function daily(count) {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, '0')}`,
    ordersUnits: index + 1,
    revenue: (index + 1) * 100,
    price: 900 + index,
    unused: 'drop-me'
  }));
}

const payload = buildPayload({
  generatedAt: '2026-07-16T09:00:00.000Z',
  smartHistoryDays: 3,
  adsHistoryDays: 2,
  smartPriceOverlay: {
    generatedAt: '2026-07-16T08:00:00.000Z',
    platforms: {
      wb: {
        rows: [{
          articleKey: 'sku_wb',
          name: 'WB SKU',
          owner: 'Maxim',
          currentPrice: 999,
          daily: daily(5),
          bulkyPayload: { should: 'not survive' }
        }]
      },
      ozon: {
        rows: [{
          articleKey: 'sku_ozon',
          name: 'Ozon SKU',
          owner: 'Maria',
          currentFillPrice: 799,
          daily: daily(4)
        }]
      },
      ym: {
        rows: [{ articleKey: 'sku_ym', daily: daily(5) }]
      }
    }
  },
  adsSummary: {
    generatedAt: '2026-07-16T08:30:00.000Z',
    asOfDate: '2026-07-15',
    itemSeries: [
      { date: '2026-07-12', platformKey: 'wb', articleKey: 'sku_wb', spend: 10, views: 100 },
      { date: '2026-07-13', platformKey: 'wb', articleKey: 'sku_wb', spend: 20, views: 200, campaignName: 'A' },
      { date: '2026-07-13', platformKey: 'wb', articleKey: 'sku_wb', spend: 5, clicks: 7, campaignName: 'B' },
      { date: '2026-07-14', platformKey: 'wb', articleKey: 'sku_wb', spend: 30, orders: 2, revenue: 400 },
      { date: '2026-07-14', platformKey: 'ozon', articleKey: 'sku_ozon', spend: 40, views: 300 },
      { date: '2026-07-14', platformKey: 'ya', articleKey: 'sku_ya', spend: 50, views: 400 },
      { date: '2026-07-14', platformKey: 'goldapple', articleKey: 'sku_ga', spend: 60 },
      { date: '2026-07-14', platformKey: 'wb', articleKey: 'ads-total', spend: 1000 }
    ]
  }
});

assert.strictEqual(payload.schema, 'portal-control-auto-task-sources-v1');
assert.strictEqual(payload.generatedAt, '2026-07-16T09:00:00.000Z');
assert.deepStrictEqual(Object.keys(payload.smartPriceOverlay.platforms).sort(), ['ozon', 'wb']);
assert.strictEqual(payload.smartPriceOverlay.platforms.wb.rows[0].daily.length, 3);
assert.strictEqual(payload.smartPriceOverlay.platforms.wb.rows[0].daily[0].date, '2026-07-03');
assert.strictEqual(payload.smartPriceOverlay.platforms.wb.rows[0].bulkyPayload, undefined);

const wbAds = payload.adsSummary.itemSeries.filter((row) => row.platformKey === 'wb');
assert.strictEqual(wbAds.length, 2);
assert.strictEqual(wbAds[0].date, '2026-07-13');
assert.strictEqual(wbAds[0].spend, 25);
assert.strictEqual(wbAds[0].clicks, 7);
assert.strictEqual(wbAds[0].campaignName, 'A, B');
assert.ok(payload.adsSummary.itemSeries.some((row) => row.platformKey === 'ozon'));
assert.ok(payload.adsSummary.itemSeries.some((row) => row.platformKey === 'ya'));
assert.ok(!payload.adsSummary.itemSeries.some((row) => row.platformKey === 'goldapple'));
assert.ok(!payload.adsSummary.itemSeries.some((row) => row.articleKey === 'ads-total'));
assert.strictEqual(payload.summary.smartPriceRows, 2);
assert.strictEqual(payload.summary.adsRows, 4);

console.log('build-control-auto-task-sources selftest: ok');
