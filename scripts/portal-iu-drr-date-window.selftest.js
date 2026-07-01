#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MODULE = 'portal-iu-drr-position-funnel-v3.js';

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
  const daily = dateRange('2026-06-20', '2026-07-01').map((date, index) => ({
    date,
    monthKey: date.slice(0, 7),
    targetRevenueOzon: 1000,
    revenueOzon: 800 + index,
    planSpendOzon: 100,
    spendFactOzon: 50,
    factPctOzon: 0.06,
    ozonFinanceSourceRows: 1,
    ozonAdsFactMode: 'fixture'
  }));
  return {
    portalMarketplace: 'ozon',
    iuDrrV3View: 'iu',
    iuDrrFilters: {
      month: '2026-07',
      windowPeriod: '7'
    },
    iuDrrSummary: {
      asOfDate: '2026-07-01',
      months: [{ key: '2026-06' }, { key: '2026-07' }],
      daily
    },
    iuDrrV3Sources: {
      leaderboard: {},
      skuMatrix: {},
      wbFunnel: {}
    }
  };
}

function serve() {
  const server = http.createServer((req, res) => {
    const pathname = String(req.url || '/').split('?')[0];
    if (pathname === '/' || pathname === '/blank') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="view-iu-drr"></div></body></html>');
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
    }, fixtureState());
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/${MODULE}` });
    await page.waitForSelector('#iuDrrV3DateTo', { timeout: 30000 });
    const julyResult = await page.evaluate(() => {
      const dates = Array.from(new Set(Array.from(document.querySelectorAll('[data-iu-v3-row]'))
        .map((row) => row.getAttribute('data-iu-v3-date'))
        .filter(Boolean))).sort();
      return {
        version: document.querySelector('.iu-drr-v3-shell')?.getAttribute('data-iu-drr-version'),
        month: document.querySelector('#iuDrrV3Month')?.value,
        dateTo: document.querySelector('#iuDrrV3DateTo')?.value,
        selectedPeriod: document.querySelector('[data-iu-v3-period][aria-selected="true"]')?.getAttribute('data-iu-v3-period'),
        dates,
        badges: Array.from(document.querySelectorAll('.iu-drr-v3-badge')).map((node) => node.textContent.trim())
      };
    });

    assert.strictEqual(julyResult.version, '20260701-iudrr-cross-month-window1');
    assert.strictEqual(julyResult.month, '2026-07');
    assert.strictEqual(julyResult.dateTo, '2026-07-01');
    assert.strictEqual(julyResult.selectedPeriod, '7');
    assert.deepStrictEqual(julyResult.dates, [
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01'
    ]);
    assert.ok(julyResult.badges.some((badge) => badge.includes('25.06') && badge.includes('01.07')));

    await page.fill('#iuDrrV3DateTo', '2026-06-29');
    await page.dispatchEvent('#iuDrrV3DateTo', 'change');
    await page.waitForFunction(() => document.querySelector('#iuDrrV3Month')?.value === '2026-06', null, { timeout: 30000 });

    const result = await page.evaluate(() => {
      const dates = Array.from(new Set(Array.from(document.querySelectorAll('[data-iu-v3-row]'))
        .map((row) => row.getAttribute('data-iu-v3-date'))
        .filter(Boolean))).sort();
      return {
        version: document.querySelector('.iu-drr-v3-shell')?.getAttribute('data-iu-drr-version'),
        month: document.querySelector('#iuDrrV3Month')?.value,
        dateTo: document.querySelector('#iuDrrV3DateTo')?.value,
        selectedPeriod: document.querySelector('[data-iu-v3-period][aria-selected="true"]')?.getAttribute('data-iu-v3-period'),
        firstDate: dates[0],
        lastDate: dates[dates.length - 1],
        dates,
        badges: Array.from(document.querySelectorAll('.iu-drr-v3-badge')).map((node) => node.textContent.trim())
      };
    });

    assert.strictEqual(result.version, '20260701-iudrr-cross-month-window1');
    assert.strictEqual(result.month, '2026-06');
    assert.strictEqual(result.dateTo, '2026-06-29');
    assert.strictEqual(result.selectedPeriod, '7');
    assert.deepStrictEqual(result.dates, [
      '2026-06-23',
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
      '2026-06-29'
    ]);
    assert.ok(result.badges.some((badge) => badge.includes('23.06') && badge.includes('29.06')));
    assert.deepStrictEqual(errors, []);
    console.log('portal-iu-drr-date-window selftest ok');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
