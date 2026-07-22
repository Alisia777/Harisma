#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altea-extra-preserve-'));

function writeJson(name, value) {
  fs.writeFileSync(path.join(tempDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function platform(key, units) {
  return {
    key,
    label: key,
    series: [{ date: '2026-07-20', label: '2026-07-20', units, revenue: units * 100 }],
    articles: [{ articleKey: `${key}-sku`, daily: [{ date: '2026-07-20', units }] }]
  };
}

const retailKeys = ['goldapple', 'letu', 'megamarket'];
const corePlatforms = [platform('wb', 10), platform('ozon', 20)];
const retailPlatforms = retailKeys.map((key, index) => platform(key, index + 1));
writeJson('platform_trends.json', {
  latestMarketplaceDate: '2026-07-20',
  platforms: [...corePlatforms, ...retailPlatforms, platform('samokat', 0), platform('magnit', 4), platform('all', 40)],
  extraMarketplace: {
    asOfDate: '2026-07-20',
    platforms: Object.fromEntries([...retailKeys, 'samokat', 'magnit'].map((key) => [key, {
      key,
      marker: `keep-${key}`,
      articles: platform(key, 1).articles
    }]))
  }
});
writeJson('ads_summary.json', {
  asOfDate: '2026-07-20',
  window: { from: '2026-07-01', to: '2026-07-20' },
  platforms: [...retailKeys, 'samokat', 'magnit'].map((key, index) => ({
    key,
    label: key,
    series: [{ date: '2026-07-20', spend: index + 1 }]
  })),
  itemSeries: retailKeys.map((key, index) => ({ date: '2026-07-20', platformKey: key, articleKey: `${key}-sku`, spend: index + 1 })),
  extraMarketplace: {
    platforms: Object.fromEntries(retailKeys.map((key) => [key, { marker: `ads-${key}` }]))
  }
});
writeJson('smart_price_overlay.json', {
  platforms: Object.fromEntries([...retailKeys, 'samokat', 'magnit'].map((key) => [key, { marker: `price-${key}`, rows: [] }]))
});
writeJson('prices.json', { platforms: {} });
writeJson('skus.json', []);
writeJson('sku_aliases.json', { aliases: [] });

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
  { level: 'total', platform_key: 'samokat', month: '2026-07', metric_key: 'orders', value: 0 },
  { level: 'total', platform_key: 'magnit', month: '2026-07', metric_key: 'orders', value: 0 }
]), 'raw_monthly');
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
  { 'Площадка': 'Самокат', 'Артикул': 'empty' }
]), 'SKU_месяцы');
const workbookPath = path.join(tempDir, 'marketplaces.xlsx');
XLSX.writeFile(workbook, workbookPath);

try {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'portal-extra-marketplace-trends-sync.js'),
    'sync',
    '--workbook', workbookPath,
    '--base-data-dir', tempDir,
    '--output-dir', tempDir,
    '--platforms', 'samokat,magnit',
    '--preserve-unrequested-extra-platforms',
    '--ozon-daily-funnel', '0'
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } });
  assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const trends = JSON.parse(fs.readFileSync(path.join(tempDir, 'platform_trends.json'), 'utf8'));
  const trendKeys = new Set(trends.platforms.map((row) => row.key));
  for (const key of retailKeys) {
    assert.ok(trendKeys.has(key), `${key} was removed from platform trends`);
    const preservedPlatform = trends.platforms.find((row) => row.key === key);
    assert.ok(preservedPlatform.series.length, `${key} series was emptied: ${JSON.stringify(preservedPlatform)}`);
    assert.strictEqual(preservedPlatform.series.at(-1).date, '2026-07-20');
    assert.strictEqual(trends.extraMarketplace.platforms[key].marker, `keep-${key}`);
  }

  const ads = JSON.parse(fs.readFileSync(path.join(tempDir, 'ads_summary.json'), 'utf8'));
  const adsKeys = new Set(ads.platforms.map((row) => row.key));
  for (const key of retailKeys) {
    assert.ok(adsKeys.has(key), `${key} was removed from ads summary`);
    assert.ok(ads.itemSeries.some((row) => row.platformKey === key), `${key} item ads were removed`);
    assert.strictEqual(ads.extraMarketplace.platforms[key].marker, `ads-${key}`);
  }

  const prices = JSON.parse(fs.readFileSync(path.join(tempDir, 'smart_price_overlay.json'), 'utf8'));
  for (const key of retailKeys) {
    assert.strictEqual(prices.platforms[key].marker, `price-${key}`);
  }

  console.log('[portal-extra-marketplace-preserve.selftest] OK');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
