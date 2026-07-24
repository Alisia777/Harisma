#!/usr/bin/env node

const assert = require('assert');
const {
  buildLegacyRow,
  buildSkuLookup,
  skuOwnerForPlatform
} = require('./build-legacy-prices-layer');

const { normalizeKey } = require('./smart-price-contour');

const OLD_OWNER = '\u041a\u0438\u0440\u0438\u043b\u043b';
const WB_OWNER = '\u041c\u0430\u043a\u0441\u0438\u043c \u041b\u0430\u043f\u044b\u0433\u0438\u043d';
const DEFAULT_OWNER = '\u041c\u0430\u0440\u0438\u044f \u0412\u0430\u0441\u0438\u043b\u044c\u0435\u0432\u0430';

const skus = [{
  articleKey: 'test_sku',
  aliases: ['TEST-SKU'],
  owner: { name: DEFAULT_OWNER, byPlatform: {} },
  ownersByPlatform: { wb: WB_OWNER }
}];
const lookup = buildSkuLookup(skus);

assert.strictEqual(lookup.get(normalizeKey('test_sku')), skus[0]);
assert.notStrictEqual(
  normalizeKey('test_sku'),
  normalizeKey('test_sku_'),
  'Завершающий underscore различает реальные SKU и не должен схлопываться'
);
assert.strictEqual(skuOwnerForPlatform(skus[0], 'wb'), WB_OWNER);
assert.strictEqual(skuOwnerForPlatform(skus[0], 'ozon'), DEFAULT_OWNER);

const row = buildLegacyRow({ articleKey: 'test_sku', owner: OLD_OWNER }, 'wb', null, WB_OWNER);
assert.strictEqual(row.owner, WB_OWNER);

console.log('build-legacy-prices-layer selftest: ok');
