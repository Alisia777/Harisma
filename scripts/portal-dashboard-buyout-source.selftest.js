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
          series: [{ date, label: date, revenue: 1000, financeTurnover: 800, units: 100, estimatedMargin: 300 }]
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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
      const api = window.__ALTEA_DASHBOARD_CEO_MOTION_V1__;
      const model = api.buildModel();
      api.render();
      const card = (model.platformCards || []).find((item) => item.key === value);
      const kpis = Array.from(document.querySelectorAll('.ceo-kpi')).map((node) => ({
        label: node.querySelector('small')?.textContent?.trim(),
        value: node.querySelector('strong')?.textContent?.trim(),
        note: node.querySelector('p')?.textContent?.trim()
      }));
      return {
        version: api.version,
        platform: model.platform,
        orders: model.total.orders,
        orderRub: model.total.orderRub,
        buys: model.total.buys,
        buyoutRub: model.total.buyoutRub,
        buyoutRows: model.total.buyoutRows,
        buyoutOrders: model.total.buyoutOrders,
        buyoutEstimatedRows: model.total.buyoutEstimatedRows,
        buyoutProxyRows: model.total.buyoutProxyRows,
        planBuys: model.plan.buys,
        planOrderRub: model.plan.orderRub,
        planBuyoutRub: model.plan.buyoutRub,
        seriesValues: model.series.points.map((point) => point.value),
        kpis,
        card: card ? {
          orders: card.total.orders,
          orderRub: card.total.orderRub,
          buys: card.total.buys,
          buyoutRub: card.total.buyoutRub,
          buyoutRows: card.total.buyoutRows,
          buyoutEstimatedRows: card.total.buyoutEstimatedRows,
          buyoutProxyRows: card.total.buyoutProxyRows
        } : null
      };
    }, platform);

    const wb = await snapshot('wb');
    assert.strictEqual(wb.version, '20260701-dashboard-money-rub5');
    assert.strictEqual(wb.orders, 100);
    assert.strictEqual(wb.orderRub, 1000);
    assert.strictEqual(wb.buys, 80);
    assert.strictEqual(wb.buyoutRub, 800);
    assert.strictEqual(wb.buyoutRows, 1);
    assert.strictEqual(wb.buyoutOrders, 100);
    assert.strictEqual(wb.buyoutEstimatedRows, 1);
    assert.strictEqual(wb.buyoutProxyRows, 0);
    assert.notStrictEqual(wb.planBuys, null);
    assert.notStrictEqual(wb.planBuyoutRub, null);
    assert.deepStrictEqual(wb.seriesValues, [800]);
    assert.strictEqual(cleanText(wb.kpis.find((item) => item.label === 'Заказы')?.value), '1 тыс. ₽');
    assert.strictEqual(cleanText(wb.kpis.find((item) => item.label === 'Выкупы')?.value), '800 ₽');
    assert.match(cleanText(wb.kpis.find((item) => item.label === 'Выкупы')?.note), /план .*₽/);
    assert.deepStrictEqual(wb.card, { orders: 100, orderRub: 1000, buys: 80, buyoutRub: 800, buyoutRows: 1, buyoutEstimatedRows: 1, buyoutProxyRows: 0 });

    const ozon = await snapshot('ozon');
    assert.strictEqual(ozon.orders, 10);
    assert.strictEqual(ozon.orderRub, 2000);
    assert.strictEqual(ozon.buys, 7);
    assert.strictEqual(ozon.buyoutRub, 1400);
    assert.strictEqual(ozon.buyoutRows, 1);
    assert.strictEqual(ozon.buyoutOrders, 10);
    assert.strictEqual(ozon.buyoutEstimatedRows, 1);
    assert.strictEqual(ozon.buyoutProxyRows, 0);
    assert.deepStrictEqual(ozon.seriesValues, [1400]);
    assert.strictEqual(cleanText(ozon.kpis.find((item) => item.label === 'Заказы')?.value), '2 тыс. ₽');
    assert.strictEqual(cleanText(ozon.kpis.find((item) => item.label === 'Выкупы')?.value), '1 тыс. ₽');
    assert.deepStrictEqual(ozon.card, { orders: 10, orderRub: 2000, buys: 7, buyoutRub: 1400, buyoutRows: 1, buyoutEstimatedRows: 1, buyoutProxyRows: 0 });

    const goldapple = await snapshot('goldapple');
    assert.strictEqual(goldapple.orders, 5);
    assert.strictEqual(goldapple.orderRub, 500);
    assert.strictEqual(goldapple.buys, 5);
    assert.strictEqual(goldapple.buyoutRub, 500);
    assert.strictEqual(goldapple.buyoutRows, 1);
    assert.strictEqual(goldapple.buyoutEstimatedRows, 1);
    assert.strictEqual(goldapple.buyoutProxyRows, 1);
    assert.deepStrictEqual(goldapple.seriesValues, [500]);
    assert.deepStrictEqual(goldapple.card, { orders: 5, orderRub: 500, buys: 5, buyoutRub: 500, buyoutRows: 1, buyoutEstimatedRows: 1, buyoutProxyRows: 1 });

    const all = await snapshot('all');
    assert.strictEqual(all.orders, 115);
    assert.strictEqual(all.orderRub, 3500);
    assert.strictEqual(all.buys, 92);
    assert.strictEqual(all.buyoutRub, 2700);
    assert.strictEqual(all.buyoutRows, 3);
    assert.strictEqual(all.buyoutOrders, 115);
    assert.strictEqual(all.buyoutEstimatedRows, 3);
    assert.strictEqual(all.buyoutProxyRows, 1);
    assert.notStrictEqual(all.orders, all.buys);
    assert.notStrictEqual(all.orderRub, all.buyoutRub);

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
