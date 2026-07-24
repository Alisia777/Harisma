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
  const date = '2026-07-22';
  const series = [{ date, revenue: 10000, ordersUnits: 10, estimatedMargin: 2000 }];
  return {
    activeView: 'control',
    dashboard: {
      dataFreshness: { asOfDate: date },
      companyPlan: {
        activeMonth: {
          monthKey: '2026-07',
          days: 31,
          planRevenueMonth: 310000,
          channels: {
            wb: { revenue: 310000, dailyRevenue: 10000, label: 'WB' }
          }
        }
      },
      cards: []
    },
    platformTrends: {
      latestMarketplaceDate: date,
      platforms: [
        { key: 'wb', label: 'WB', series },
        { key: 'all', label: 'All', series }
      ]
    }
  };
}

function serve() {
  const server = http.createServer((req, res) => {
    const pathname = String(req.url || '/').split('?')[0];
    if (pathname === '/' || pathname === '/blank') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><meta charset="utf-8">
        <style>
          body.v87-imperial.altea-premium-shell.altea-premium-presentation-ready
            .view[data-premium-route="dashboard"] > :not(.altea-premium-route) {
            display: none !important;
          }
        </style>
      </head><body class="v87-imperial altea-premium-shell altea-premium-presentation-ready">
        <div id="view-dashboard" class="view active" data-premium-route="dashboard"></div>
      </body></html>`);
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(pathname).replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${port}/blank#control`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((payload) => {
      window.state = payload;
      window.__alteaLoadPortalSnapshot = () => new Promise(() => {});
      window.fetch = () => new Promise(() => {});
    }, fixtureState());
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/${MODULE}` });
    await page.evaluate(() => {
      window.state.activeView = 'dashboard';
      history.replaceState(null, '', '#dashboard');
      window.__ALTEA_DASHBOARD_CEO_MOTION_V1__.render();
    });

    await page.waitForSelector('.ceo-title', { timeout: 1500 });
    const content = await page.locator('#view-dashboard').innerText();
    assert.ok(content.includes('Растём или падаем?'), content);
    assert.ok(!content.includes('Собираем CEO dashboard'), content);
    assert.deepStrictEqual(errors, []);
    console.log('portal-dashboard-navigation-recovery selftest ok');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
