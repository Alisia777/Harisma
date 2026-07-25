#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const daria = read('.github/workflows/daria-prices.yml');
assert.match(daria, /permissions:\s*\n\s+contents:\s*write\s*\n\s+actions:\s*write/);
assert.match(daria, /id:\s*publish/);
assert.match(daria, /BASE_SHA=\$\(git rev-parse HEAD\)/);
assert.match(daria, /changed=true/);
assert.match(daria, /if:\s*steps\.publish\.outputs\.changed == 'true'/);
assert.match(daria, /portal-data-truth\.yml\/dispatches/);
assert.match(daria, /inputs\[base-ref\]=\$BASE_SHA/);

const truth = read('.github/workflows/portal-data-truth.yml');
assert.match(truth, /daria-prices\*\.csv/);
assert.match(truth, /exports\/daria-prices\.summary\.json/);
assert.match(truth, /\.github\/workflows\/daria-prices\.yml/);
assert.match(truth, /node scripts\/portal-yandex-market-price-sync\.selftest\.js/);
assert.match(truth, /node scripts\/portal-order-lifecycle\.selftest\.js/);

const daily = read('.github/workflows/portal-daily-close.yml');
assert.match(daily, /ALTEA_YM_API_KEY:\s*\$\{\{ secrets\.ALTEA_YM_API_KEY \}\}/);
assert.match(daily, /ALTEA_YM_CAMPAIGN_ID:\s*\$\{\{ secrets\.ALTEA_YM_CAMPAIGN_ID \}\}/);
assert.match(daily, /node scripts\/portal-yandex-market-price-sync\.js/);
assert.match(daily, /--as-of-date '\$\{\{ steps\.cutoff\.outputs\.value \}\}'/);
assert.match(daily, /--api-price-file \.portal-truth-output\/price-sync\/yandex-market-prices\.json/);

console.log('portal-auto-refresh-workflow selftest ok');
