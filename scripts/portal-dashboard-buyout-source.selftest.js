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
  const date = '2026-06-30';
  return {
    activeView: 'dashboard',
    dashboard: {
      dataFreshness: { asOfDate: date },
      companyPlan: {
        activeMonth: {
          monthKey: '2026-06',
          label: 'июнь 2026',
          days: 30,
          planRevenueMonth: 300000,
          channels: {
            wb: { revenue: 100000, dailyRevenue: 10000, label: 'WB' },
            ozon: { revenue: 100000, dailyRevenue: 10000, label: 'Ozon' },
            goldapple: { revenue: 100000, dailyRevenue: 10000, label: 'ЗЯ' }
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
          key: 'wb',
          label: 'WB',
          series: [{ date, label: date, revenue: 1000, units: 100, estimatedMargin: 300 }]
        },
        {
          key: 'ozon',
          label: 'Ozon',
          series: [{ date, label: date, revenue: 2000, ordersUnits: 10, units: 10, deliveredUnits: 7, estimatedMargin: 500 }]
        },
        {
          key: 'goldapple',
          label: 'ЗЯ',
          series: [{ date, label: date, revenue: 500, units: 5, estimatedMargin: 0 }]
        },
        {
          key: 'all',
          label: 'All',
          series: [{ date, label: date, revenue: 3500, ordersUnits: 115, units: 115, estimatedMargin: 800 }]
        }
      ]
    },
    platformSkuArticles: { platforms: [] },
    productLeaderboard: {},
    adsSummary: { platforms: [] },
    iuDrrSummary: { asOfDate: date, daily: [] }
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
    await page.goto(`http://127.0.0.1:${port}/blank`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((payload) => {
      window.state = payload;
      window.fetch = () => Promise.resolve({ ok: false, json: async () => null });
      localStorage.setItem('altea.dashboard.ceoMotion.period', '7');
      localStorage.setItem('altea.dashboard.ceoMotion.metric', 'buys');
      localStorage.setItem('altea.dashboard.ceoMotion.dateTo', '2026-06-30');
      localStorage.setItem('altea.dashboard.ceoMotion.month', '2026-06');
      localStorage.setItem('altea.portal.marketplace', 'wb');
    }, fixtureState());
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/${MODULE}` });
    await page.waitForFunction(() => window.__ALTEA_DASHBOARD_CEO_MOTION_V1__?.buildModel, null, { timeout: 30000 });

    const snapshot = async (platform) => page.evaluate((value) => {
      localStorage.setItem('altea.portal.marketplace', value);
      const model = window.__ALTEA_DASHBOARD_CEO_MOTION_V1__.buildModel();
      const card = (model.platformCards || []).find((item) => item.key === value);
      return {
        version: window.__ALTEA_DASHBOARD_CEO_MOTION_V1__.version,
        platform: model.platform,
        orders: model.total.orders,
        buys: model.total.buys,
        buyoutRows: model.total.buyoutRows,
        buyoutOrders: model.total.buyoutOrders,
        planBuys: model.plan.buys,
        seriesValues: model.series.points.map((point) => point.value),
        card: card ? {
          orders: card.total.orders,
          buys: card.total.buys,
          buyoutRows: card.total.buyoutRows
        } : null
      };
    }, platform);

    const wb = await snapshot('wb');
    assert.strictEqual(wb.version, '20260701-dashboard-buyout-source1');
    assert.strictEqual(wb.orders, 100);
    assert.strictEqual(wb.buys, 0);
    assert.strictEqual(wb.buyoutRows, 0);
    assert.strictEqual(wb.buyoutOrders, 0);
    assert.strictEqual(wb.planBuys, null);
    assert.deepStrictEqual(wb.seriesValues, [null]);
    assert.deepStrictEqual(wb.card, { orders: 100, buys: 0, buyoutRows: 0 });

    const ozon = await snapshot('ozon');
    assert.strictEqual(ozon.orders, 10);
    assert.strictEqual(ozon.buys, 7);
    assert.strictEqual(ozon.buyoutRows, 1);
    assert.strictEqual(ozon.buyoutOrders, 10);
    assert.deepStrictEqual(ozon.seriesValues, [7]);
    assert.deepStrictEqual(ozon.card, { orders: 10, buys: 7, buyoutRows: 1 });

    const all = await snapshot('all');
    assert.strictEqual(all.orders, 115);
    assert.strictEqual(all.buys, 7);
    assert.strictEqual(all.buyoutRows, 1);
    assert.strictEqual(all.buyoutOrders, 10);
    assert.notStrictEqual(all.orders, all.buys);

    assert.deepStrictEqual(errors, []);
    console.log('portal-dashboard-buyout-source selftest ok');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
