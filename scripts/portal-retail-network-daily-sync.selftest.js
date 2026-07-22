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
  ['1', '2026-07-21', '2026-07-21', '2026-07-01-2026-07-20', 'Многодневный отчёт', '4600000000003', 'MPL3', 'multi_day_report', 99, 99000, 0, 0, 0, 1, 1]
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
assert.strictEqual(parsed.letu.length, 1, 'Letual revisions must be deduplicated');
assert.strictEqual(parsed.letu[0].date, '2026-07-20', 'Letual business date must come from the one-day export period');
assert.strictEqual(parsed.letu[0].deliveredUnits, 2, 'Letual must keep the newest export revision');
assert.strictEqual(parsed.letu[0].stock, 9, 'Letual total stock must be parsed');
assert.strictEqual(parsed.letu[0].warehouseBreakdown['Центральный склад'].stock, 7, 'Letual warehouse stock must be parsed');
assert.strictEqual(parsed.goldapple.length, 1, 'ZYA revisions must be deduplicated');
assert.strictEqual(parsed.goldapple[0].deliveredRevenue, 600, 'ZYA must keep the last status revision');
assert.strictEqual(parsed.megamarket.length, 1, 'Megamarket duplicate rows must not double sales');

const mmAggregate = aggregatePlatform(parsed.megamarket, {});
assert.strictEqual(mmAggregate.series[0].ordersRevenue, 800);
assert.strictEqual(mmAggregate.series[0].financialResult, 500);
assert.strictEqual(mmAggregate.series[0].units, 1);

const base = {
  platforms: [
    { key: 'goldapple', label: 'ЗЯ', series: [{ date: '2026-07-20', units: 0.5, revenue: 100 }] },
    { key: 'letu', label: 'Лэтуаль', series: [] },
    { key: 'megamarket', label: 'Мегамаркет', series: [] },
    { key: 'samokat', label: 'Самокат', series: [] },
    { key: 'all', label: 'Все площадки', series: [] }
  ]
};
const updated = updatePayload(base, parsed, { to: '2026-07-20', sourceId: 'test' });
const zyaPoint = updated.payload.platforms.find((platform) => platform.key === 'goldapple').series[0];
assert.strictEqual(zyaPoint.units, 3, 'Actual ZYA daily fact must replace the synthetic point');
assert.strictEqual(zyaPoint.deliveredUnits, 2, 'Delivered units must stay distinct from orders');
assert.strictEqual(updated.status.platforms.goldapple.status, 'fresh');
assert.strictEqual(updated.status.platforms.samokat.status, 'missing');

const preservedCurrent = buildPreservedSourceStatus(
  updated.payload,
  { inputFile: 'data/platform_trends.json', to: '2026-07-20' },
  new Error('service account unavailable')
);
assert.deepStrictEqual(preservedCurrent.stale, [], 'Current committed finalized facts may be preserved when Sheet auth is temporarily unavailable');
assert.strictEqual(preservedCurrent.status.platforms.goldapple.status, 'preserved');
const preservedStale = buildPreservedSourceStatus(
  updated.payload,
  { inputFile: 'data/platform_trends.json', to: '2026-07-21' },
  new Error('service account unavailable')
);
assert.deepStrictEqual(preservedStale.stale, ['goldapple', 'letu', 'megamarket'], 'A later cutoff must not silently publish preserved stale retail facts');

assert.strictEqual(isoDate(46218), '2026-07-15');
assert.strictEqual(numberOrZero('1 234,56'), 1234.56);
assert.strictEqual(letualBusinessDate('2026-07-21', '2026-06-07-2026-06-07'), '2026-06-07');
assert.strictEqual(letualBusinessDate('2026-07-21', '2026-07-01-2026-07-20'), '');

console.log('portal-retail-network-daily-sync self-test passed');
