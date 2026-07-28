#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  buildCompetitorSnapshot,
  extractPackage,
  filterCompetitorProducts,
  productMatch
} = require('./portal-repricer-competitor-sync');

async function main() {
  const own = {
    articleKey: 'retinol_50ml',
    name: 'Крем для лица с ретинолом 0,25%, 50 мл',
    type: 'Крем для лица с ретинолом',
    category: 'Уход за лицом'
  };
  assert.deepStrictEqual(extractPackage('Набор 2x250 мл'), {
    dimension: 'volume_ml',
    amount: 500,
    packUnits: 2,
    raw: '2x250 мл'
  });
  assert(productMatch(own, { name: 'Крем для лица с ретинолом 0.25%, 50 мл' }).packComparable);

  const products = [
    { id: '1', name: 'Крем для лица с ретинолом 0.25%, 50 мл', seller: 'Brand A', price: 900, inStock: true, promo: false, source: 'fixture' },
    { id: '2', name: 'Крем для лица с ретинолом 0.25%, 50 мл', seller: 'Brand B', price: 920, inStock: true, promo: false, source: 'fixture' },
    { id: '3', name: 'Крем для лица с ретинолом 0.25%, 50 мл', seller: 'Brand C', price: 940, inStock: true, promo: false, source: 'fixture' },
    { id: 'promo', name: 'Крем для лица с ретинолом 0.25%, 50 мл', seller: 'Brand D', price: 500, inStock: true, promo: true, source: 'fixture' },
    { id: 'own', name: 'Крем для лица с ретинолом 0.25%, 50 мл', seller: 'Алтея', price: 700, inStock: true, promo: false, source: 'fixture' },
    { id: 'wrong-pack', name: 'Крем для лица с ретинолом 0.25%, 100 мл', seller: 'Brand E', price: 1000, inStock: true, promo: false, source: 'fixture' }
  ];
  const filtered = filterCompetitorProducts(own, products, {
    observedAt: '2026-07-28T12:00:00.000Z',
    minimumMatchScore: 0.85
  });
  assert.strictEqual(filtered.accepted.length, 3);
  assert(filtered.rejected.some((row) => row.reason === 'promotion'));
  assert(filtered.rejected.some((row) => row.reason === 'own_brand'));
  assert(filtered.rejected.some((row) => row.reason === 'package_mismatch'));

  const snapshot = await buildCompetitorSnapshot({
    catalog: [own],
    search: async () => products.map((row) => ({
      id: row.id,
      name: row.name,
      supplier: row.seller,
      salePriceU: row.price * 100,
      totalQuantity: row.inStock ? 10 : 0,
      ...(row.promo ? { promoTextCard: 'Акция' } : {})
    })),
    now: new Date('2026-07-28T12:00:00Z'),
    options: { minimumOffers: 3, minimumMatchScore: 0.85 }
  });
  assert.strictEqual(snapshot.status, 'ok');
  assert.strictEqual(snapshot.summary.trusted_rows, 1);
  assert.strictEqual(snapshot.summary.trusted_offers, 3);
  assert.strictEqual(snapshot.rows[0].offers.length, 3);
  assert.strictEqual(snapshot.policy.promotionsExcluded, true);
  assert.strictEqual(snapshot.policy.suspiciousSellersExcluded, true);
  console.log('[repricer-competitor-sync-selftest] OK: auto discovery accepts only fresh comparable non-promo competitors and excludes own/suspicious sellers');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
