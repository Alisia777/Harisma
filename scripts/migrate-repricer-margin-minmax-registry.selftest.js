#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { migrateRegistry } = require('./migrate-repricer-margin-minmax-registry');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repricer-registry-migration-'));
  try {
    writeJson(path.join(root, 'skus.json'), [
      { articleKey: 'sku-complete', article: 'sku-complete', status: 'Актуальный' },
      { articleKey: 'sku-gap', article: 'sku-gap', status: 'Новинка' }
    ]);
    writeJson(path.join(root, 'smart_price_workbench.json'), {
      generatedAt: '2026-07-24T00:00:00.000Z',
      platforms: {
        wb: {
          rows: [
            {
              articleKey: 'sku-complete',
              status: 'Актуальный',
              currentPrice: 120,
              currentPriceDate: '2026-07-24',
              costRub: 40,
              targetMarginPct: 0.25,
              maxMarginPct: 0.4,
              minPrice: 100,
              maxPrice: 150
            },
            {
              articleKey: 'sku-gap',
              status: 'Новинка',
              currentPrice: 200,
              currentPriceDate: '2026-07-24',
              costRub: 60,
              minPrice: 170,
              maxPrice: 230
            }
          ]
        }
      }
    });
    writeJson(path.join(root, 'smart_price_overlay.json'), { generatedAt: '2026-07-24T00:00:00.000Z', platforms: {} });
    writeJson(path.join(root, 'price_workbench_support.json'), { generatedAt: '2026-07-24T00:00:00.000Z', platforms: {} });
    writeJson(path.join(root, 'order_procurement_wb.json'), {
      generatedAt: '2026-07-24T00:00:00.000Z',
      asOfDate: '2026-07-24',
      rows: [
        { articleKey: 'sku-complete', inStock: 10, date: '2026-07-24' },
        { articleKey: 'sku-gap', inStock: 10, date: '2026-07-24' }
      ]
    });
    writeJson(path.join(root, 'repricer_economics_policy.json'), {
      schema: 'repricer-economics-policy-v1',
      version: 'selftest',
      enabledPlatforms: ['wb'],
      platforms: { wb: { commissionPct: 10, logisticsPerUnit: 5, taxPct: 0 } }
    });
    writeJson(path.join(root, 'portal_indicator_policy.json'), {
      version: 'selftest',
      policies: {
        price_default: {
          requires: ['trusted_current_price', 'complete_economics', 'approved_corridor']
        },
        turnover_default: { target_days: 30 }
      },
      visual_rules: {
        blocked: { color: 'red', business_status: 'neutral', label: 'blocked' },
        trusted: { color: 'green', business_status: null, label: 'trusted' }
      }
    });
    writeJson(path.join(root, 'portal_feature_policy.json'), {
      features: { repricer: { required_publishable_coverage: 0.01, maintenance_mode: false } }
    });

    const first = migrateRegistry({ inputDir: root, outputDir: root, author: 'Codex', role: 'admin' });
    assert.strictEqual(first.registry.rows.length, 1);
    assert.strictEqual(first.migrated.length, 1);
    assert.strictEqual(first.registry.rows[0].articleKey, 'sku-complete');
    assert.strictEqual(first.registry.rows[0].targetMarginPct, 0.25);
    assert.strictEqual(first.registry.rows[0].maxMarginPct, 0.4);
    assert.strictEqual(first.registry.rows[0].minPrice, 100);
    assert.strictEqual(first.registry.rows[0].maxPrice, 150);
    assert.strictEqual(first.gapReport.summary.blockedRows, 1);
    assert.deepStrictEqual(first.gapReport.rows[0].missing, ['min_margin', 'max_margin']);

    const second = migrateRegistry({ inputDir: root, outputDir: root, author: 'Codex', role: 'admin' });
    assert.strictEqual(second.registry.rows.length, 1, 'migration must be idempotent');
    assert.strictEqual(second.migrated.length, 0);
    assert.strictEqual(second.gapReport.summary.blockedRows, 1);
    console.log('[repricer-registry-migration-selftest] OK: explicit margin/MIN/MAX migrated, gaps blocked, rerun idempotent');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
