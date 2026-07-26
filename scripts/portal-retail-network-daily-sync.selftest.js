#!/usr/bin/env node

const assert = require('assert');
const XLSX = require('xlsx');
const {
  aggregatePlatform,
  buildPreservedSourceStatus,
  isoDate,
  letualBusinessDate,
  numberOrZero,
  parseRetailWorkbook,
  resolveOptions,
  resolveWorkbookSource,
  updatePayload
} = require('./portal-retail-network-daily-sync');

function appendSheet(workbook, name, rows) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
}

const workbook = XLSX.utils.book_new();

appendSheet(workbook, 'База  Лету', [
  [], [], [],
  ['Юр лицо', 'Дата', 'Дата выгрузки', 'Период выгрузки', 'Название товара', 'Штрихкод', 'Артикул Алькор', 'Артикул', 'Всего. Заказано', 'Всего. Заказано, Р', 'Всего. Транзит', 'Всего. Доставлено', 'Всего. Доставлено, Р', 'Всего. Остаток в продаже', 'Центральный склад. Остаток в продаже'],
  ['1', '2026-07-20', '2026-07-21', '2026-07-20-2026-07-20', 'Крем', '4600000000000', 'MPL1', 'cream_1', 2, 1000, 1, 0, 0, 10, 8],
  ['1', '2026-07-20', 'Дата выгрузки', 'Период выгрузки', 'Название товара', 'Штрихкод', 'Артикул Алькор', 'Артикул', 'Всего. Заказано', 'Всего. Заказано, Р', 'Всего. Транзит', 'Всего. Доставлено', 'Всего. Доставлено, Р', 'Всего. Остаток в продаже', 'Центральный склад. Остаток в продаже'],
  ['1', '2026-07-20', '2026-07-22', '2026-07-20-2026-07-20', 'Крем', '4600000000000', 'MPL1', 'cream_1', 2, 1000, 0, 2, 1000, 9, 7],
  ['1', '2026-07-21', '2026-06-08', '2026-06-07-2026-06-07', 'Старая строка', '4600000000002', 'MPL2', 'stale_future_date', 99, 99000, 0, 0, 0, 1, 1],
  ['1', '2026-07-21', '2026-07-21', '2026-07-01-2026-07-20', 'Многодневный отчёт', '4600000000003', 'MPL3', 'multi_day_report', 99, 99000, 0, 0, 0, 1, 1],
  ['1', '2026-07-21', 'Дата выгрузки', 'Период выгрузки', 'Название товара', 'Штрихкод', 'Артикул Алькор', 'Артикул', 'Всего. Заказано', 'Всего. Заказано, Р', 'Всего. Транзит', 'Всего. Доставлено', 'Всего. Доставлено, Р', 'Всего. Остаток в продаже', 'Центральный склад. Остаток в продаже'],
  ['1', '2026-07-21', '2026-07-22', '', '', '', '', '', '', '', '', '', '', '', '']
]);

appendSheet(workbook, 'База  ЗЯ', [
  [], [], [],
  ['Наименование', 'Номенклатура', 'Артикул', 'Штрихкод', 'Заказано руб', 'Доставлено руб', 'В пути руб', 'Отменено руб', 'Заказано шт', 'Доставлено шт', 'В пути шт', 'Отменено шт', 'Возвраты шт', 'Юр Лицо', 'Дата'],
  ['Товар', 'N1', 'product_1', '4600000000001', 900, 0, 900, 0, 3, 0, 3, 0, 0, '1', '20.07.2026'],
  ['Товар', 'N1', 'product_1', '4600000000001', 900, 600, 300, 0, 3, 2, 1, 0, 0, '1', '20.07.2026']
]);

appendSheet(workbook, 'База  ММ', [
  [], [],
  ['SKU', 'Наименование', 'Продано (ед.)', 'Количество возвратов (ед.)', 'Выручка (руб.)', 'Себестоимость (руб.)', 'Выручка с вычетом комиссии (руб.)', 'Комиссия маркетплейса (руб.)', 'Seller SKU ID', 'Юр Лицо', 'Дата'],
  ['MM1', 'Товар MM', 1, 0, 800, 100, 600, 200, 'product_mm', '1', '20.07.2026'],
  ['MM1', 'Товар MM', 1, 0, 800, 100, 600, 200, 'product_mm', '1', '20.07.2026']
]);

const parsed = parseRetailWorkbook(workbook, { from: '2026-07-20', to: '2026-07-21' });
assert.strictEqual(parsed.letu.length, 2, 'Letual revisions must be deduplicated while an explicit empty-day export stays visible');
assert.strictEqual(parsed.letu[0].date, '2026-07-20', 'Letual business date must come from the one-day export period');
assert.strictEqual(parsed.letu[0].deliveredUnits, 2, 'Letual must keep the newest export revision');
assert.strictEqual(parsed.letu[0].stock, 9, 'Letual total stock must be parsed');
assert.strictEqual(parsed.letu[0].warehouseBreakdown['Центральный склад'].stock, 7, 'Letual warehouse stock must be parsed');
assert.strictEqual(parsed.letu[1].coverageOnly, true, 'An empty Letual export must be represented as a zero-fact coverage marker');
assert.strictEqual(parsed.goldapple.length, 1, 'ZYA revisions must be deduplicated');
assert.strictEqual(parsed.goldapple[0].deliveredRevenue, 600, 'ZYA must keep the last status revision');
assert.strictEqual(parsed.megamarket.length, 1, 'Megamarket duplicate rows must not double sales');

const mmAggregate = aggregatePlatform(parsed.megamarket, {});
assert.strictEqual(mmAggregate.series[0].ordersRevenue, 800);
assert.strictEqual(mmAggregate.series[0].financialResult, 500);
assert.strictEqual(mmAggregate.series[0].units, 1);
const letuAggregate = aggregatePlatform(parsed.letu, {});
assert.strictEqual(letuAggregate.series.at(-1).date, '2026-07-21');
assert.strictEqual(letuAggregate.series.at(-1).ordersRevenue, 0);
assert.strictEqual(letuAggregate.articles.length, 1, 'Coverage markers must not create synthetic articles');

const base = {
  platforms: [
    { key: 'goldapple', label: 'ЗЯ', series: [{ date: '2026-07-20', units: 0.5, revenue: 100 }] },
    {
      key: 'letu',
      label: 'Лэтуаль',
      series: [{ date: '2026-07-19', units: 1, revenue: 500 }],
      articles: [
        {
          articleKey: 'cream_1',
          article: 'cream_1',
          daily: [{ date: '2026-07-19', label: '2026-07-19', ordersUnits: 1, ordersRevenue: 500, revenue: 500 }],
          monthly: [{ monthKey: '2026-07', date: '2026-07-01', ordersUnits: 1, ordersRevenue: 500, revenue: 500 }]
        },
        {
          articleKey: 'legacy_1',
          article: 'legacy_1',
          daily: [{ date: '2026-07-19', label: '2026-07-19', ordersUnits: 1, ordersRevenue: 300, revenue: 300 }],
          monthly: [{ monthKey: '2026-07', date: '2026-07-01', ordersUnits: 1, ordersRevenue: 300, revenue: 300 }]
        }
      ]
    },
    { key: 'megamarket', label: 'Мегамаркет', series: [] },
    { key: 'samokat', label: 'Самокат', series: [] },
    { key: 'all', label: 'Все площадки', series: [] }
  ]
};
const updated = updatePayload(base, parsed, {
  to: '2026-07-20',
  sourceId: 'test',
  resolvedSource: 'workbook-fallback:data/external_sources/retail_network_sales.xlsx',
  sourceWarning: 'service account unavailable'
});
const zyaPoint = updated.payload.platforms.find((platform) => platform.key === 'goldapple').series[0];
assert.strictEqual(zyaPoint.units, 3, 'Actual ZYA daily fact must replace the synthetic point');
assert.strictEqual(zyaPoint.deliveredUnits, 2, 'Delivered units must stay distinct from orders');
assert.strictEqual(updated.status.platforms.goldapple.status, 'fresh');
assert.strictEqual(updated.status.platforms.samokat.status, 'missing');
assert.strictEqual(updated.status.source, 'workbook-fallback:data/external_sources/retail_network_sales.xlsx');
assert.strictEqual(updated.status.sourceWarning, 'service account unavailable');
assert.strictEqual(updated.payload.extraMarketplace.source, 'retail-workbook-daily');
assert.strictEqual(updated.payload.extraMarketplace.workbook, 'workbook-fallback:data/external_sources/retail_network_sales.xlsx');
const updatedLetu = updated.payload.platforms.find((platform) => platform.key === 'letu');
assert.deepStrictEqual(updatedLetu.articles.map((article) => article.articleKey), ['cream_1', 'legacy_1']);
assert.deepStrictEqual(updatedLetu.articles.find((article) => article.articleKey === 'cream_1').daily.map((point) => point.date), ['2026-07-19', '2026-07-20']);
assert.strictEqual(updatedLetu.articles.find((article) => article.articleKey === 'cream_1').monthly[0].revenue, 1500);

const preservedEmptyLetu = updatePayload(base, {
  goldapple: parsed.goldapple,
  letu: [],
  megamarket: parsed.megamarket
}, { to: '2026-07-21', sourceId: 'test' });
assert.strictEqual(preservedEmptyLetu.status.platforms.letu.status, 'stale');
assert.strictEqual(preservedEmptyLetu.status.platforms.letu.latestDate, '2026-07-19');
assert.strictEqual(
  preservedEmptyLetu.payload.platforms.find((platform) => platform.key === 'letu').series.at(-1).date,
  '2026-07-19',
  'An empty source window must preserve the last finalized Letual fact'
);

const currentAt20 = JSON.parse(JSON.stringify(updated.payload));
for (const platform of currentAt20.platforms) {
  if (['goldapple', 'letu', 'megamarket'].includes(platform.key)) {
    platform.series = platform.series.filter((point) => point.date <= '2026-07-20');
  }
}
const preservedCurrent = buildPreservedSourceStatus(
  currentAt20,
  { inputFile: 'data/platform_trends.json', to: '2026-07-20' },
  new Error('service account unavailable')
);
assert.deepStrictEqual(preservedCurrent.stale, [], 'Current committed finalized facts may be preserved when Sheet auth is temporarily unavailable');
assert.strictEqual(preservedCurrent.status.platforms.goldapple.status, 'preserved');
const preservedStale = buildPreservedSourceStatus(
  currentAt20,
  { inputFile: 'data/platform_trends.json', to: '2026-07-21', maxLagDays: 0 },
  new Error('service account unavailable')
);
assert.deepStrictEqual(preservedStale.stale, ['goldapple', 'letu', 'megamarket'], 'A later cutoff must not silently publish preserved stale retail facts');
assert.deepStrictEqual(preservedStale.blocking, ['goldapple', 'letu', 'megamarket'], 'Zero lag tolerance must keep a D-1 mismatch blocking');
const preservedWithinTolerance = buildPreservedSourceStatus(
  currentAt20,
  { inputFile: 'data/platform_trends.json', to: '2026-07-21', maxLagDays: 1 },
  new Error('service account unavailable')
);
assert.deepStrictEqual(preservedWithinTolerance.stale, ['goldapple', 'letu', 'megamarket'], 'Lagging status must remain visible even when publication is tolerated');
assert.deepStrictEqual(preservedWithinTolerance.blocking, [], 'A one-day source delay may be published when the workflow opts into one-day tolerance');
const preservedWithExplicitException = buildPreservedSourceStatus(
  currentAt20,
  {
    inputFile: 'data/platform_trends.json',
    to: '2026-07-22',
    maxLagDays: 1,
    allowStalePlatforms: new Set(['letu'])
  },
  new Error('service account unavailable')
);
assert.deepStrictEqual(
  preservedWithExplicitException.blocking,
  ['goldapple', 'megamarket'],
  'An explicit exception must stay scoped to the named platform'
);
const preservedWithAllOptionalRetailExceptions = buildPreservedSourceStatus(
  currentAt20,
  {
    inputFile: 'data/platform_trends.json',
    to: '2026-07-22',
    maxLagDays: 1,
    allowStalePlatforms: new Set(['goldapple', 'letu', 'megamarket'])
  },
  new Error('service account unavailable')
);
assert.deepStrictEqual(
  preservedWithAllOptionalRetailExceptions.stale,
  ['goldapple', 'letu', 'megamarket'],
  'Explicit publication exceptions must not hide stale retail-network diagnostics'
);
assert.deepStrictEqual(
  preservedWithAllOptionalRetailExceptions.blocking,
  [],
  'Optional stale retail-network files must not block fresh marketplace D-1 publication'
);

assert.strictEqual(isoDate(46218), '2026-07-15');
assert.strictEqual(numberOrZero('1 234,56'), 1234.56);
assert.strictEqual(letualBusinessDate('2026-07-21', '2026-06-07-2026-06-07'), '2026-06-07');
assert.strictEqual(letualBusinessDate('2026-07-21', '2026-07-01-2026-07-20'), '');

const previousFallbackWorkbook = process.env.ALTEA_RETAIL_NETWORK_SALES_XLSX;
process.env.ALTEA_RETAIL_NETWORK_SALES_XLSX = __filename;
const fallbackOptions = resolveOptions({});
if (previousFallbackWorkbook === undefined) delete process.env.ALTEA_RETAIL_NETWORK_SALES_XLSX;
else process.env.ALTEA_RETAIL_NETWORK_SALES_XLSX = previousFallbackWorkbook;
assert.strictEqual(fallbackOptions.fallbackWorkbookPath, __filename);

resolveWorkbookSource(
  { workbookPath: '', fallbackWorkbookPath: __filename, sourceId: 'test' },
  async () => { throw new Error('service account unavailable'); }
).then((source) => {
  assert.strictEqual(source.workbookPath, __filename);
  assert.strictEqual(source.source, 'workbook-fallback:scripts/portal-retail-network-daily-sync.selftest.js');
  assert.strictEqual(source.sourceWarning, 'service account unavailable');
  console.log('portal-retail-network-daily-sync self-test passed');
}).catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
