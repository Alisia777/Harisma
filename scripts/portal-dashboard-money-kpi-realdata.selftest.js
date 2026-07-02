#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MODULE = 'portal-dashboard-ceo-motion-v1.js';
const RUB = String.fromCharCode(0x20bd);
const PLATFORMS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'megamarket', 'magnit', 'all'];

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'));
  } catch {
    return fallback;
  }
}

function loadState() {
  return {
    activeView: 'dashboard',
    dashboard: readJson('dashboard.json', {}),
    portalDashboardMetrics: readJson('portal_dashboard_metrics.json', { metrics: [] }),
    platformTrends: readJson('platform_trends.json', { platforms: [] }),
    platformSkuArticles: readJson('platform_sku_articles.json', { platforms: [] }),
    productLeaderboard: readJson('product_leaderboard.json', {}),
    adsSummary: readJson('ads_summary.json', { platforms: [] }),
    iuDrrSummary: readJson('iu_drr_summary.json', {})
  };
}

function serve() {
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
    res.writeHead(200, {
      'Content-Type': file.endsWith('.js')
        ? 'application/javascript; charset=utf-8'
        : 'application/json; charset=utf-8'
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function snapshot(page, platform) {
  return page.evaluate((value) => {
    localStorage.setItem('altea.portal.marketplace', value);
    const api = window.__ALTEA_DASHBOARD_CEO_MOTION_V1__;
    const model = api.buildModel();
    api.render();
    const kpis = Array.from(document.querySelectorAll('.ceo-kpi')).map((node) => ({
      label: node.querySelector('small')?.textContent?.trim(),
      value: node.querySelector('strong')?.textContent?.trim(),
      note: node.querySelector('p')?.textContent?.trim()
    }));
    return {
      platform: value,
      version: api.version,
      orderRub: model.total.orderRub,
      buyoutRub: model.total.buyoutRub,
      monthToDateBuyoutRub: model.monthToDate?.total?.buyoutRub,
      orderUnits: model.total.orders,
      buyoutUnits: model.total.buys,
      orderKpi: kpis[0]?.value || '',
      buyoutKpi: kpis[1]?.value || '',
      monthToDateBuyoutLabel: kpis[2]?.label || '',
      monthToDateBuyoutKpi: kpis[2]?.value || '',
      monthToDateBuyoutNote: kpis[2]?.note || ''
    };
  }, platform);
}

async function run() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
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
      localStorage.setItem('altea.dashboard.ceoMotion.metric', 'orders');
      localStorage.setItem('altea.dashboard.ceoMotion.dateTo', '2026-06-30');
      localStorage.setItem('altea.dashboard.ceoMotion.month', '2026-06');
    }, loadState());
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/${MODULE}` });
    await page.waitForFunction(() => window.__ALTEA_DASHBOARD_CEO_MOTION_V1__?.buildModel, null, { timeout: 30000 });

    const rows = [];
    for (const platform of PLATFORMS) {
      const item = await snapshot(page, platform);
      assert.strictEqual(item.version, '20260702-dashboard-no-buyout-proxy1');
      assert.ok(item.orderRub > 0, `${platform} must have positive order rubles`);
      assert.ok(item.buyoutRub > 0, `${platform} must have positive buyout rubles`);
      assert.ok(item.monthToDateBuyoutRub > 0, `${platform} must have positive month-to-date buyout rubles`);
      assert.ok(item.orderKpi.includes(RUB), `${platform} orders KPI must render money, got "${item.orderKpi}"`);
      assert.ok(item.buyoutKpi.includes(RUB), `${platform} buyout KPI must render money, got "${item.buyoutKpi}"`);
      assert.ok(item.monthToDateBuyoutLabel.includes('Выкупы с 01.06'), `${platform} MTD KPI label must explain month-to-date buyouts, got "${item.monthToDateBuyoutLabel}"`);
      assert.ok(item.monthToDateBuyoutKpi.includes(RUB), `${platform} MTD buyout KPI must render money, got "${item.monthToDateBuyoutKpi}"`);
      assert.match(item.monthToDateBuyoutNote, /с 01\.06 по \d{2}\.06/, `${platform} MTD KPI note must show the month-to-date range`);
      assert.notStrictEqual(item.orderKpi, String(Math.round(item.orderUnits)), `${platform} orders KPI leaked units`);
      assert.notStrictEqual(item.buyoutKpi, String(Math.round(item.buyoutUnits)), `${platform} buyout KPI leaked units`);
      rows.push(`${platform}: ${item.orderKpi} / ${item.buyoutKpi} / ${item.monthToDateBuyoutKpi}`);
    }

    const ya = await snapshot(page, 'ya');
    assert.notStrictEqual(
      ya.monthToDateBuyoutKpi,
      ya.buyoutKpi,
      `Yandex MTD buyout KPI must not duplicate the selected 7-day buyout KPI (${ya.buyoutKpi})`
    );

    assert.deepStrictEqual(errors, []);
    console.log(`portal-dashboard-money-kpi-realdata selftest ok\n${rows.join('\n')}`);
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
