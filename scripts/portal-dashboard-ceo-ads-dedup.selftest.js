#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MODULE = 'portal-dashboard-ceo-motion-v1.js';

function fixtureState() {
  const date = '2026-06-29';
  const revenue = 10000;
  const planSpendOzon = 900;
  const financeNet = 1000;
  return {
    activeView: 'dashboard',
    dashboard: {
      companyPlan: {
        activeMonth: {
          monthKey: '2026-06',
          days: 30,
          planRevenueMonth: 300000,
          channels: {
            ozon: { revenue: 300000, dailyRevenue: 10000, label: 'Ozon' }
          }
        }
      },
      brandSummary: [{ plan_units: 0 }],
      cards: []
    },
    portalDashboardMetrics: { metrics: [] },
    platformTrends: {
      latestMarketplaceDate: date,
      platforms: [
        {
          key: 'ozon',
          label: 'Ozon',
          series: [{ date, revenue, ordersUnits: 10, units: 10, estimatedMargin: 1800 }]
        },
        {
          key: 'all',
          label: 'All',
          series: [{ date, revenue, ordersUnits: 10, units: 10, estimatedMargin: 1800 }]
        }
      ]
    },
    platformSkuArticles: { platforms: [] },
    productLeaderboard: {},
    adsSummary: { platforms: [] },
    iuDrrSummary: {
      asOfDate: date,
      daily: [
        {
          date,
          revenueOzon: revenue,
          ozonGmv: revenue,
          targetRevenueOzon: revenue,
          revenueOzonCompletionPct: 1,
          planSpendOzon,
          // Regression fixture: this value is intentionally doubled as finance fact + plan.
          spendFactOzon: financeNet + planSpendOzon,
          ozonDrrSpendGross: 1050,
          ozonDrrExcludedTotal: 50,
          ozonFinanceSourceRows: 12,
          factPctOzon: 0.1,
          ozonAdsFactMode: 'ozon_finance_balance_gmv_drr_excluding_premium_plus_original_badge'
        }
      ]
    },
    expected: { financeNet, planSpendOzon, doubled: financeNet + planSpendOzon, revenue }
  };
}

function serve() {
  const mime = {
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };
  const server = http.createServer((req, res) => {
    const pathname = String(req.url || '/').split('?')[0];
    if (pathname === '/' || pathname === '/blank') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="view-dashboard"></div></body></html>');
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(pathname).replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    const state = fixtureState();
    await page.goto(`http://127.0.0.1:${port}/blank`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((payload) => {
      window.state = payload;
      window.fetch = () => Promise.resolve({ ok: false, json: async () => null });
      localStorage.setItem('altea.portal.marketplace', 'ozon');
      localStorage.setItem('altea.dashboard.ceoMotion.period', 'mtd');
      localStorage.setItem('altea.dashboard.ceoMotion.metric', 'revenue');
    }, state);
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/${MODULE}` });
    await page.waitForFunction(() => window.__ALTEA_DASHBOARD_CEO_MOTION_V1__?.buildModel, null, { timeout: 30000 });

    const modelResult = await page.evaluate(() => {
      const api = window.__ALTEA_DASHBOARD_CEO_MOTION_V1__;
      const model = api.buildModel();
      return {
        version: api.version,
        platform: model.platform,
        adsTotal: model.adsBreakdown.total,
        totalAds: model.total.ads,
        drr: model.total.drr,
        adRows: model.adRows.length
      };
    });
    assert.strictEqual(modelResult.platform, 'ozon');
    assert.strictEqual(modelResult.adsTotal, state.expected.financeNet);
    assert.strictEqual(modelResult.totalAds, state.expected.financeNet);
    assert.ok(Math.abs(modelResult.drr - 0.1) < 0.000001, `Expected DRR 0.1, got ${modelResult.drr}`);

    await page.click('[data-ceo-metric="ads"]');
    await page.waitForSelector('[data-ceo-drawer]', { timeout: 30000 });
    const drawerText = await page.locator('[data-ceo-drawer]').innerText();
    const compact = drawerText.replace(/\s+/g, ' ');
    assert.ok(compact.includes('1 000'), `Drawer must show clean fact, got: ${compact}`);
    assert.ok(!compact.includes('1 900'), `Drawer shows doubled fact+plan: ${compact}`);
    assert.deepStrictEqual(errors, []);
    console.log('portal-dashboard-ceo-ads-dedup selftest ok');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
