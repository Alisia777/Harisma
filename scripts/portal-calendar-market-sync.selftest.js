#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MODULE = 'portal-events-calendar.js';

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

function serve() {
  const server = http.createServer((req, res) => {
    const pathname = String(req.url || '/').split('?')[0];
    if (pathname === '/' || pathname === '/blank') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html data-marketplace="ym"><head><meta charset="utf-8"></head><body data-marketplace="ym"><main><section id="view-data-health" class="view active"></section></main></body></html>');
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(pathname).replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/blank#data-health`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      window.state = {
        activeView: 'data-health',
        filters: { platform: 'ya', market: 'ya' },
        storage: {
          promoEvents: [],
          promoEventDeletedIds: [],
          tasks: [
            {
              id: 'calendar-selftest-wb',
              title: 'Calendar selftest WB task',
              nextAction: 'WB only task',
              platform: 'wb',
              status: 'new',
              source: 'auto',
              type: 'traffic',
              due: '2026-07-03'
            },
            {
              id: 'calendar-selftest-magnit',
              title: 'Calendar selftest Magnit task',
              nextAction: 'Explicit Magnit task',
              platform: 'magnit',
              status: 'new',
              source: 'manual',
              type: 'general',
              due: '2026-07-03'
            },
            {
              id: 'calendar-selftest-magnit-wb-title',
              title: 'K3 WB wording but explicit Magnit',
              nextAction: 'Title mentions WB, explicit platform must win',
              platform: 'magnit',
              status: 'new',
              source: 'manual',
              type: 'general',
              due: '2026-07-04'
            }
          ]
        },
        skus: [],
        launches: [],
        adsSummary: { generatedAt: '', platforms: [], itemSeries: [] },
        warehouseStockOverlay: { generatedAt: '', rows: [] },
        smartPriceOverlay: { generatedAt: '', platforms: {} }
      };
      window.__alteaAppState = window.state;
      localStorage.setItem('altea.portal.marketplace', 'ym');
      document.documentElement.dataset.marketplace = 'ym';
      document.body.dataset.marketplace = 'ym';
    });
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/${MODULE}` });
    await page.evaluate(() => window.renderPromoEventsCalendar('view-data-health'));
    await page.waitForSelector('.promo-calendar-shell', { timeout: 30000 });

    const yandexState = await page.evaluate(() => ({
      activeYa: Boolean(document.querySelector('[data-calendar-platform-chip="ya"].active')),
      activeAll: Boolean(document.querySelector('[data-calendar-platform-chip="all"].active')),
      coverageTotal: Number(document.querySelector('[data-calendar-task-coverage]')?.dataset.total || -1),
      text: document.querySelector('.promo-calendar-shell')?.textContent || ''
    }));
    assert.strictEqual(yandexState.activeYa, true, 'Header YM must select calendar YA chip');
    assert.strictEqual(yandexState.activeAll, false, 'Header YM must not leave calendar on all');
    assert.strictEqual(yandexState.coverageTotal, 0, 'Yandex coverage must not count WB/Magnit tasks');
    assert.ok(!yandexState.text.includes('Calendar selftest WB task'), 'WB task leaked into Yandex filter');

    await page.click('[data-calendar-platform-chip="magnit"]');
    await page.waitForFunction(() => (
      localStorage.getItem('altea.portal.marketplace') === 'magnit'
      && document.body.dataset.marketplace === 'magnit'
      && document.querySelector('[data-calendar-platform-chip="magnit"].active')
    ), null, { timeout: 30000 });
    const magnitState = await page.evaluate(() => ({
      text: document.querySelector('.promo-calendar-shell')?.textContent || '',
      stored: localStorage.getItem('altea.portal.marketplace'),
      bodyMarket: document.body.dataset.marketplace,
      coverageTotal: Number(document.querySelector('[data-calendar-task-coverage]')?.dataset.total || -1),
      coverageDated: Number(document.querySelector('[data-calendar-task-coverage]')?.dataset.dated || -1)
    }));
    assert.strictEqual(magnitState.stored, 'magnit');
    assert.strictEqual(magnitState.bodyMarket, 'magnit');
    assert.strictEqual(magnitState.coverageTotal, 2, 'Magnit coverage must count only Magnit tasks');
    assert.strictEqual(magnitState.coverageDated, 2, 'Magnit dated tasks must stay visible in calendar coverage');
    assert.ok(magnitState.text.includes('Calendar selftest Magnit task'), 'Magnit task is missing from Magnit filter');
    assert.ok(magnitState.text.includes('K3 WB wording but explicit Magnit'), 'Explicit Magnit task with WB in title must stay in Magnit');
    assert.ok(!magnitState.text.includes('Calendar selftest WB task'), 'WB task leaked into Magnit filter');

    await page.evaluate(() => {
      localStorage.setItem('altea.portal.marketplace', 'wb');
      document.documentElement.dataset.marketplace = 'wb';
      document.body.dataset.marketplace = 'wb';
      window.dispatchEvent(new CustomEvent('altea:marketplacechange', { detail: { marketplace: 'wb', platform: 'wb', internalPlatform: 'wb' } }));
    });
    await page.waitForFunction(() => document.querySelector('[data-calendar-platform-chip="wb"].active'), null, { timeout: 30000 });
    const wbState = await page.evaluate(() => ({
      text: document.querySelector('.promo-calendar-shell')?.textContent || '',
      coverageTotal: Number(document.querySelector('[data-calendar-task-coverage]')?.dataset.total || -1)
    }));
    assert.strictEqual(wbState.coverageTotal, 1, 'WB coverage must count only WB tasks');
    assert.ok(wbState.text.includes('Calendar selftest WB task'), 'WB task is missing from WB filter');
    assert.ok(!wbState.text.includes('K3 WB wording but explicit Magnit'), 'Explicit Magnit task leaked into WB filter');

    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run()
  .then(() => console.log('portal-calendar-market-sync.selftest OK'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
