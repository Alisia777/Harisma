#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildCanonicalRepricer, resolveOptions } = require('./build-canonical-repricer');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function seed(root, stockAvailable, advertisingStatus = 'trusted', options = {}) {
  const dataDir = path.join(root, 'data');
  writeJson(path.join(dataDir, 'smart_price_workbench.json'), {
    generatedAt: '2026-07-24T08:00:00Z',
    platforms: {
      wb: {
        rows: [{
          articleKey: 'live-oos-test',
          productStatus: 'Актуальный',
          currentFillPrice: 1000,
          currentPriceDate: '2026-07-24',
          costRub: 100,
          manualMinPrice: 500,
          manualMaxPrice: options.manualMaxPrice ?? 1500,
          targetMarginPct: 0.2,
          maxMarginPct: 0.4
        }]
      }
    }
  });
  writeJson(path.join(dataDir, 'smart_price_overlay.json'), { platforms: { wb: { rows: [] } } });
  writeJson(path.join(dataDir, 'price_workbench_support.json'), { platforms: { wb: { rows: [] } } });
  writeJson(path.join(dataDir, 'order_procurement_wb.json'), {
    generatedAt: '2026-07-24T00:00:00Z',
    rows: [{ articleKey: 'live-oos-test', inStock: 50, asOfDate: '2026-07-24' }]
  });
  writeJson(path.join(dataDir, 'repricer_live_signals.json'), {
    schema: 'repricer-live-signals-v1',
    generatedAt: '2026-07-24T08:00:00Z',
    asOfDate: '2026-07-24',
    platforms: {
      wb: {
        advertising: {
          status: advertisingStatus,
          observedPct: 0.05,
          contractPct: 0.0877,
          appliedPct: 0.0877,
          to: '2026-07-24'
        },
        stock: {
          status: options.stockSnapshotStatus || 'trusted_direct',
          asOfDate: '2026-07-24',
          rows: [{
            articleKey: 'live-oos-test',
            platform: 'wb',
            available: stockAvailable,
            inbound: 0,
            partialOos: Boolean(options.partialOos),
            oosRiskStatus: String(options.oosRiskStatus || ''),
            oosRiskRule: String(options.oosRiskRule || ''),
            sourceMode: options.sourceMode || 'wb_stock_api',
            asOfDate: '2026-07-24'
          }]
        }
      }
    }
  });
  writeJson(path.join(dataDir, 'skus.json'), [{ articleKey: 'live-oos-test', status: 'Актуальный' }]);
  writeJson(path.join(dataDir, 'portal_indicator_policy.json'), {
    version: 'test',
    visual_rules: {
      blocked: { color: 'red', business_status: 'neutral', label: 'blocked' },
      trusted: { color: 'green', business_status: null, label: 'trusted' }
    },
    policies: {
      price_default: { requires: ['trusted_current_price', 'complete_economics', 'approved_corridor'] },
      turnover_default: { target_days: 30 }
    }
  });
  writeJson(path.join(dataDir, 'portal_metric_registry.json'), { version: 'test', metrics: [] });
  writeJson(path.join(dataDir, 'portal_feature_policy.json'), {
    features: { repricer: { required_publishable_coverage: 0.01, maintenance_mode: false } }
  });
  writeJson(path.join(dataDir, 'repricer_economics_policy.json'), {
    version: 'test',
    enabledPlatforms: ['wb'],
    priceFreshness: { maxAgeDays: 2 },
    liveSignals: { requiredPlatforms: ['wb'] },
    platforms: {
      wb: {
        commissionPct: 32.03,
        platformCostsPerUnit: 90,
        internalAdvertisingPct: 8.77,
        taxPct: 0
      }
    }
  });
}

function build(root) {
  const result = buildCanonicalRepricer({
    ...resolveOptions({
      'input-dir': path.join(root, 'data'),
      'output-dir': path.join(root, 'out'),
      'as-of-date': '2026-07-24'
    }),
    noWrite: true,
    noFail: true
  });
  return result.payload.rows[0];
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repricer-live-oos-guard-'));
try {
  seed(root, 0, 'trusted');
  const oos = build(root);
  assert.strictEqual(oos.facts.stock_status, 'trusted_zero_oos');
  assert.strictEqual(oos.recommendation.status, 'blocked');
  assert.strictEqual(oos.recommendation.price, null);
  assert(oos.recommendation.reason_codes.includes('trusted_oos'));

  seed(root, 10, 'trusted');
  const available = build(root);
  assert.strictEqual(available.facts.stock, 10);
  assert.strictEqual(available.recommendation.status, 'ready');
  assert.strictEqual(available.facts.stock_source_status, 'trusted_direct');

  seed(root, 10, 'trusted', {
    stockSnapshotStatus: 'trusted_fallback',
    sourceMode: 'fallback_procurement'
  });
  const fallbackStock = build(root);
  assert.strictEqual(fallbackStock.facts.stock_status, 'trusted');
  assert.strictEqual(fallbackStock.facts.stock_source_status, 'trusted_fallback');
  assert.strictEqual(fallbackStock.recommendation.status, 'blocked');
  assert(fallbackStock.recommendation.reason_codes.includes('direct_stock_required'));

  seed(root, 10, 'fallback_contract');
  const staleAds = build(root);
  assert.strictEqual(staleAds.recommendation.status, 'blocked');
  assert(staleAds.recommendation.reason_codes.includes('advertising_snapshot_stale'));

  seed(root, 10, 'trusted', {
    manualMaxPrice: 950,
    oosRiskStatus: 'risk',
    oosRiskRule: 'oos_soon_turnover_active_or_new'
  });
  const riskyDecrease = build(root);
  assert.strictEqual(riskyDecrease.recommendation.price, 950);
  assert.strictEqual(riskyDecrease.recommendation.status, 'blocked');
  assert(riskyDecrease.recommendation.reason_codes.includes('oos_risk_price_decrease_blocked'));

  seed(root, 10, 'trusted', {
    manualMaxPrice: 950,
    partialOos: true
  });
  const partialOosDecrease = build(root);
  assert.strictEqual(partialOosDecrease.recommendation.status, 'blocked');
  assert(partialOosDecrease.recommendation.reason_codes.includes('oos_risk_price_decrease_blocked'));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('[repricer-live-oos-guard] PASS: direct per-SKU stock, full OOS, partial OOS/risk price decreases, and stale advertising are enforced');
