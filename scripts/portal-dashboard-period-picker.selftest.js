#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MODULE = 'portal-dashboard-ceo-motion-v1.js';

function dateRange(from, to) {
  const result = [];
  for (let cursor = from; cursor <= to;) {
    result.push(cursor);
    const date = new Date(`${cursor}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    cursor = date.toISOString().slice(0, 10);
  }
  return result;
}

function fixtureState() {
  const dates = dateRange('2026-06-01', '2026-07-01');
  const series = dates.map((date, index) => ({
    date,
    label: date,
    revenue: 10000 + index,
    ordersUnits: 10 + index,
    units: 10 + index,
    estimatedMargin: 2000 + index
  }));
  const iuDaily = dates.map((date, index) => ({
    date,
    revenueOzon: 10000 + index,
    targetRevenueOzon: 10000,
    spendFactOzon: 100 + index,
    planSpendOzon: 120,
    ozonDrrSpendGross: 100 + index,
    ozonDrrExcludedTotal: 0,
    ozonFinanceSourceRows: 1
  }));
  return {
    activeView: 'dashboard',
    dashboard: {
      dataFreshness: { asOfDate: '2026-07-01' },
      companyPlan: {
        activeMonth: {
          monthKey: '2026-07',
          label: 'июль 2026',
          days: 31,
          planRevenueMonth: 310000,
          channels: {
            ozon: { revenue: 310000, dailyRevenue: 10000, label: 'Ozon' }
          }
        },
        months: {
          '2026-06': {
            monthKey: '2026-06',
            label: 'июнь 2026',
            days: 30,
            revenue: 300000,
            channels: {
              ozon: { revenue: 300000, dailyRevenue: 10000, label: 'Ozon' }
            }
          },
          '2026-07': {
            monthKey: '2026-07',
            label: 'июль 2026',
            days: 31,
            revenue: 310000,
            channels: {
              ozon: { revenue: 310000, dailyRevenue: 10000, label: 'Ozon' }
            }
          }
        }
      },
      brandSummary: [{ plan_units: 0 }],
      cards: []
    },
    portalDashboardMetrics: { metrics: [] },
    platformTrends: {
      latestMarketplaceDate: '2026-07-01',
      platforms: [
        { key: 'ozon', label: 'Ozon', series },
        { key: 'all', label: 'All', series }
      ]
    },
    platformSkuArticles: { platforms: [] },
    productLeaderboard: {},
    adsSummary: { platforms: [] },
    iuDrrSummary: {
      asOfDate: '2026-07-01',
      daily: iuDaily
    }
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

async function snapshot(page) {
  return page.evaluate(() => {
    const api = window.__ALTEA_DASHBOARD_CEO_MOTION_V1__;
    const model = api.buildModel();
    return {
      version: api.version,
      period: model.period,
      range: model.range,
      planMonthKey: model.planMonthKey,
      month: document.querySelector('[data-ceo-month]')?.value,
      dateTo: document.querySelector('[data-ceo-date-to]')?.value,
      activePeriod: document.querySelector('[data-ceo-period].active')?.getAttribute('data-ceo-period'),
      points: model.series.points.map((point) => point.date)
    };
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
      localStorage.setItem('altea.portal.marketplace', 'ozon');
      localStorage.setItem('altea.dashboard.ceoMotion.period', 'mtd');
      localStorage.setItem('altea.dashboard.ceoMotion.metric', 'revenue');
      localStorage.removeItem('altea.dashboard.ceoMotion.dateTo');
      localStorage.removeItem('altea.dashboard.ceoMotion.month');
    }, fixtureState());
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/${MODULE}` });
    await page.waitForSelector('[data-ceo-month]', { timeout: 30000 });

    await page.selectOption('[data-ceo-month]', '2026-06');
    await page.waitForFunction(() => document.querySelector('[data-ceo-date-to]')?.value === '2026-06-30', null, { timeout: 30000 });
    const june = await snapshot(page);
    assert.strictEqual(june.version, '20260701-dashboard-buyout-estimate1');
    assert.strictEqual(june.period, 'month');
    assert.strictEqual(june.activePeriod, 'month');
    assert.strictEqual(june.month, '2026-06');
    assert.strictEqual(june.dateTo, '2026-06-30');
    assert.strictEqual(june.range.start, '2026-06-01');
    assert.strictEqual(june.range.end, '2026-06-30');
    assert.strictEqual(june.planMonthKey, '2026-06');
    assert.strictEqual(june.points.length, 30);
    const layout = await page.evaluate(() => {
      const bar = document.querySelector('.ceo-periodbar');
      const buttons = Array.from(document.querySelectorAll('[data-ceo-period]'));
      return {
        barOverflow: bar.scrollWidth - bar.clientWidth,
        buttonOverflows: buttons.map((button) => button.scrollWidth - button.clientWidth),
        buttonWhiteSpace: buttons.map((button) => getComputedStyle(button).whiteSpace),
        labels: Array.from(document.querySelectorAll('.ceo-date-field span')).map((node) => node.textContent.trim())
      };
    });
    assert.ok(layout.barOverflow <= 1, `Period filter overflows by ${layout.barOverflow}px`);
    assert.ok(layout.buttonOverflows.every((value) => value <= 1), `Period buttons overflow: ${layout.buttonOverflows.join(', ')}`);
    assert.ok(layout.buttonWhiteSpace.every((value) => value === 'nowrap'), `Period buttons must not wrap: ${layout.buttonWhiteSpace.join(', ')}`);
    assert.deepStrictEqual(layout.labels, ['Месяц', 'Срез до']);

    await page.click('[data-ceo-period="7"]');
    await page.waitForFunction(() => window.__ALTEA_DASHBOARD_CEO_MOTION_V1__?.buildModel()?.period === '7', null, { timeout: 30000 });
    const seven = await snapshot(page);
    assert.strictEqual(seven.period, '7');
    assert.strictEqual(seven.dateTo, '2026-06-30');
    assert.strictEqual(seven.range.start, '2026-06-24');
    assert.strictEqual(seven.range.end, '2026-06-30');
    assert.deepStrictEqual(seven.points, [
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
      '2026-06-29',
      '2026-06-30'
    ]);

    await page.fill('[data-ceo-date-to]', '2026-06-14');
    await page.dispatchEvent('[data-ceo-date-to]', 'change');
    await page.waitForFunction(() => window.__ALTEA_DASHBOARD_CEO_MOTION_V1__?.buildModel()?.range?.end === '2026-06-14', null, { timeout: 30000 });
    const custom = await snapshot(page);
    assert.strictEqual(custom.period, '7');
    assert.strictEqual(custom.dateTo, '2026-06-14');
    assert.strictEqual(custom.range.start, '2026-06-08');
    assert.strictEqual(custom.range.end, '2026-06-14');
    assert.deepStrictEqual(errors, []);
    console.log('portal-dashboard-period-picker selftest ok');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
