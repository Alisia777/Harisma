#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildCanonicalRepricer,
  resolveOptions
} = require('./build-canonical-repricer');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function seedData(root) {
  const dataDir = path.join(root, 'data');
  writeJson(path.join(dataDir, 'smart_price_workbench.json'), {
    generatedAt: '2026-06-20T00:00:00.000Z',
    platforms: {
      wb: {
        rows: [{
          articleKey: 'freshness-test-sku',
          productStatus: 'Актуальный',
          currentFillPrice: 1000,
          currentPriceDate: '2026-06-20',
          currentClientPrice: 950,
          costRub: 100,
          manualMinPrice: 500,
          manualMaxPrice: 1500,
          targetMarginPct: 0.2
        }]
      }
    }
  });
  writeJson(path.join(dataDir, 'smart_price_overlay.json'), {
    generatedAt: '2026-06-20T00:00:00.000Z',
    platforms: { wb: { rows: [] } }
  });
  writeJson(path.join(dataDir, 'price_workbench_support.json'), {
    generatedAt: '2026-06-20T00:00:00.000Z',
    platforms: { wb: { rows: [] } }
  });
  writeJson(path.join(dataDir, 'order_procurement_wb.json'), {
    generatedAt: '2026-07-24T00:00:00.000Z',
    rows: [{
      articleKey: 'freshness-test-sku',
      inStock: 10,
      inTransit: 0,
      inRequest: 0,
      asOfDate: '2026-07-24'
    }]
  });
  writeJson(path.join(dataDir, 'portal_indicator_policy.json'), {
    schema: 'portal-indicator-policy-v1',
    version: 'selftest',
    visual_rules: {
      blocked: { color: 'red', business_status: 'neutral', label: 'blocked' },
      trusted: { color: 'green', business_status: null, label: 'trusted' }
    },
    policies: {
      price_default: {
        requires: ['trusted_current_price', 'complete_economics', 'approved_corridor']
      },
      turnover_default: { target_days: 30 }
    }
  });
  writeJson(path.join(dataDir, 'portal_metric_registry.json'), {
    schema: 'portal-metric-registry-v1',
    version: 'selftest',
    metrics: []
  });
  writeJson(path.join(dataDir, 'portal_feature_policy.json'), {
    schema: 'portal-feature-policy-v1',
    features: {
      repricer: {
        required_publishable_coverage: 0.01,
        maintenance_mode: false,
        maintenance_reason: ''
      }
    }
  });
  writeJson(path.join(dataDir, 'repricer_economics_policy.json'), {
    schema: 'repricer-economics-policy-v1',
    version: 'selftest',
    enabledPlatforms: ['wb'],
    priceFreshness: { maxAgeDays: 2 },
    approval: { sharpPriceChangePct: 10 },
    platforms: {
      wb: {
        commissionPct: 19,
        logisticsPerUnit: 125,
        taxPct: 0
      }
    }
  });
}

function canonicalRow(options) {
  const result = buildCanonicalRepricer({ ...options, noWrite: true, noFail: true });
  const row = result.payload.rows.find((item) => (
    item.article_key === 'freshness-test-sku'
    && item.platform === 'wb'
  ));
  assert(row, 'canonical test row must exist');
  return { payload: result.payload, row };
}

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-repricer-freshness-'));
  const previousCwd = process.cwd();
  try {
    seedData(root);
    process.chdir(root);
    const options = resolveOptions({
      'input-dir': path.join(root, 'data'),
      'output-dir': path.join(root, 'out'),
      'as-of-date': '2026-07-24'
    });
    process.chdir(previousCwd);

    const stale = canonicalRow(options);
    assert.strictEqual(stale.payload.freshness_reference_date, '2026-07-24');
    assert.strictEqual(stale.row.facts.as_of, '2026-06-20');
    assert.strictEqual(stale.row.facts.price_age_days, 34);
    assert.strictEqual(stale.row.facts.price_freshness, 'stale');
    assert.strictEqual(stale.row.recommendation.status, 'blocked');
    assert(stale.row.recommendation.reason_codes.includes('stale_current_seller_price'));
    assert.strictEqual(
      stale.payload.source_checksums['tmp-smart_price_workbench-live.json'].exists,
      false
    );

    writeJson(path.join(root, 'tmp-smart_price_workbench-live.json'), {
      generatedAt: '2026-07-24T08:00:00.000Z',
      platforms: {
        wb: {
          rows: [{
            articleKey: 'freshness-test-sku',
            currentFillPrice: 1200,
            currentPriceDate: '2026-07-24',
            currentClientPrice: 1150
          }]
        }
      }
    });

    const fresh = canonicalRow(options);
    assert.strictEqual(fresh.row.facts.seller_price, 1200);
    assert.strictEqual(fresh.row.facts.as_of, '2026-07-24');
    assert.strictEqual(fresh.row.facts.price_age_days, 0);
    assert.strictEqual(fresh.row.facts.price_freshness, 'fresh');
    assert.strictEqual(fresh.row.facts.sources.seller_price.source_mode, 'live');
    assert.strictEqual(fresh.row.recommendation.status, 'ready');
    assert.strictEqual(
      fresh.payload.source_checksums['tmp-smart_price_workbench-live.json'].exists,
      true
    );
    assert.notStrictEqual(stale.payload.snapshot_id, fresh.payload.snapshot_id);

    writeJson(path.join(root, 'data', 'repricer_live_prices.json'), {
      schema: 'repricer-live-prices-v1',
      generatedAt: '2026-07-24T09:00:00.000Z',
      asOfDate: '2026-07-24',
      platforms: {
        wb: {
          rows: [{
            articleKey: 'freshness-test-sku',
            currentFillPrice: 1300,
            currentPriceDate: '2026-07-24',
            currentSellerPriceSource: 'wb-prices-api',
            currentSellerPriceFile: 'repricer_live_prices.json'
          }, {
            articleKey: 'api-only-unregistered-sku',
            currentFillPrice: 500,
            currentPriceDate: '2026-07-24',
            currentSellerPriceSource: 'wb-prices-api',
            currentSellerPriceFile: 'repricer_live_prices.json'
          }]
        }
      }
    });

    const directApi = canonicalRow(options);
    assert.strictEqual(directApi.row.facts.seller_price, 1300);
    assert.strictEqual(directApi.row.facts.sources.seller_price.source_mode, 'wb-prices-api');
    assert.strictEqual(directApi.row.facts.sources.seller_price.file, 'repricer_live_prices.json');
    assert.strictEqual(directApi.payload.source_checksums['repricer_live_prices.json'].exists, true);
    assert.strictEqual(directApi.payload.rows.length, 1, 'API-only SKU must wait for registry onboarding before entering canonical');
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log('[build-canonical-repricer-freshness-selftest] PASS: wall-clock freshness and direct API price snapshot are enforced');
}

run();
