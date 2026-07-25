#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'skus.json'), 'utf8'));
const payload = JSON.parse(fs.readFileSync(path.join(root, 'data', 'sku_aliases.json'), 'utf8'));
const aliases = Array.isArray(payload.aliases) ? payload.aliases : [];
const registryKeys = new Set(registry.map((row) => String(row.articleKey || '').trim()).filter(Boolean));

const expected = [
  {
    platform: 'goldapple',
    api_sku: 'retinol_boost_krem_d',
    target_sku: 'retinol_boost_krem_dlya_vek_30ml'
  },
  {
    platform: 'goldapple',
    api_sku: 'syvorotka_dlya_lica_',
    target_sku: 'syvorotka_dlya_lica_30ml'
  }
];

for (const alias of expected) {
  assert(registryKeys.has(alias.target_sku), `missing canonical target ${alias.target_sku}`);
  const matches = aliases.filter((row) => (
    row.platform === alias.platform
    && row.api_sku === alias.api_sku
    && row.target_sku === alias.target_sku
    && row.status === 'active'
  ));
  assert.strictEqual(matches.length, 1, `expected exactly one active alias ${alias.platform}:${alias.api_sku}`);
}

const targetsByAlias = new Map();
for (const row of aliases.filter((item) => item.status === 'active')) {
  const key = `${row.platform}:${row.api_sku}`;
  if (!targetsByAlias.has(key)) targetsByAlias.set(key, new Set());
  targetsByAlias.get(key).add(row.target_sku);
}
const conflicts = [...targetsByAlias.entries()]
  .filter(([, targets]) => targets.size > 1)
  .map(([key, targets]) => ({ key, targets: [...targets] }));
assert.deepStrictEqual(conflicts, [], `active alias conflicts: ${JSON.stringify(conflicts)}`);

console.log('portal-sku-alias-integrity selftest ok');
