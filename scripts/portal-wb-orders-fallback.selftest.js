#!/usr/bin/env node

const assert = require('assert');
const {
  buildWbOrderSeries,
  mergeSeriesPoints,
  mergeWbArticles,
  normalizeWbOrderRows,
  resolveOptions,
  wbOrderRevenue
} = require('./portal-wb-orders-trends-sync');

const rows = [
  {
    date: '2026-07-24T10:00:00',
    supplierArticle: 'sku_a',
    nmId: 101,
    finishedPrice: 850,
    priceWithDisc: 800,
    isCancel: false
  },
  {
    date: '2026-07-24T11:00:00',
    supplierArticle: 'sku_b',
    nmId: 102,
    finishedPrice: 0,
    priceWithDisc: 700,
    isCancel: false
  },
  {
    date: '2026-07-24T12:00:00',
    supplierArticle: 'sku_cancelled',
    finishedPrice: 900,
    isCancel: true
  }
];
const skus = [
  { articleKey: 'sku_a', supplierArticle: 'sku_a', nmId: 101, wb: { marginPct: 0.2 } },
  { articleKey: 'sku_b', supplierArticle: 'sku_b', nmId: 102, wb: { marginPct: 0.1 } }
];

assert.strictEqual(wbOrderRevenue(rows[0]), 850);
assert.strictEqual(normalizeWbOrderRows(rows).length, 2);

const built = buildWbOrderSeries(rows, skus, {
  from: '2026-07-23',
  to: '2026-07-24'
});
const latest = built.series.find((point) => point.label === '2026-07-24');
assert.strictEqual(latest.units, 2);
assert.strictEqual(latest.revenue, 1550);
assert.strictEqual(latest.estimatedMargin, 240);
assert.strictEqual(built.diagnostics.positiveRows, 2);
assert.strictEqual(built.articles.length, 2);

const mergedSeries = mergeSeriesPoints([
  { label: '2026-07-23', units: 10, revenue: 5000, dayOffset: 0 }
], built.series);
assert.deepStrictEqual(
  mergedSeries.map((point) => [point.label, point.revenue, point.dayOffset]),
  [
    ['2026-07-23', 5000, 1],
    ['2026-07-24', 1550, 0]
  ]
);

const mergedArticles = mergeWbArticles([
  {
    articleKey: 'sku_a',
    article: 'sku_a',
    daily: [{ date: '2026-07-23', revenue: 500, units: 1, price: 500, dayOffset: 0 }]
  }
], built.articles);
const skuA = mergedArticles.find((article) => article.articleKey === 'sku_a');
assert.deepStrictEqual(skuA.daily.map((point) => point.date), ['2026-07-23', '2026-07-24']);
assert.deepStrictEqual(skuA.daily.map((point) => point.dayOffset), [1, 0]);
assert.strictEqual(skuA.sourceMode, 'wb-statistics-orders-fallback');

const tokenEnvKeys = [
  'ALTEA_WB_API_TOKEN',
  'ALTEA_WB_FINANCE_TOKEN',
  'ALTEA_WB_ANALYTICS_TOKEN',
  'ALTEA_WB_STATISTICS_TOKEN',
  'ALTEA_WB_PROMOTION_TOKEN'
];
const previousTokenEnv = Object.fromEntries(tokenEnvKeys.map((key) => [key, process.env[key]]));
try {
  for (const key of tokenEnvKeys) delete process.env[key];
  process.env.ALTEA_WB_API_TOKEN = 'general-token';
  process.env.ALTEA_WB_FINANCE_TOKEN = 'finance-token';
  const routed = resolveOptions({
    from: '2026-07-23',
    to: '2026-07-24'
  });
  assert.strictEqual(routed.analyticsToken, 'general-token');
  assert.strictEqual(routed.statisticsToken, 'general-token');
  assert.strictEqual(routed.financeToken, 'finance-token');

  process.env.ALTEA_WB_ANALYTICS_TOKEN = 'analytics-token';
  process.env.ALTEA_WB_STATISTICS_TOKEN = 'statistics-token';
  const explicit = resolveOptions({
    from: '2026-07-23',
    to: '2026-07-24'
  });
  assert.strictEqual(explicit.analyticsToken, 'analytics-token');
  assert.strictEqual(explicit.statisticsToken, 'statistics-token');
  assert.strictEqual(explicit.financeToken, 'finance-token');
} finally {
  for (const key of tokenEnvKeys) {
    if (previousTokenEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousTokenEnv[key];
  }
}

console.log('portal-wb-orders-fallback selftest ok');
