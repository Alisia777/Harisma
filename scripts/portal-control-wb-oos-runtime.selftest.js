#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm'
};

function serve() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const relative = decodeURIComponent(url.pathname || '/') === '/'
      ? 'index.html'
      : decodeURIComponent(url.pathname || '/').replace(/^\/+/, '');
    const filePath = path.join(ROOT, relative);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  const requestedUrls = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requestedUrls.push(request.url()));

  try {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('altea-portal-active-view-v1', JSON.stringify({
        activeView: 'dashboard',
        updatedAt: new Date().toISOString()
      }));
      localStorage.setItem('altea.portal.marketplace', 'all');
    });
    await page.goto(`http://127.0.0.1:${port}/index.html?portal-refresh=20260716#control`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForFunction(() => Boolean(window.alteaPortalAuthGate), null, { timeout: 30000 });
    await page.evaluate(async () => {
      const access = {
        email: 'control-oos-selftest@qeep.life',
        roles: ['employee'],
        allowedViews: ['dashboard', 'control', 'oos-control', 'sku-contour', 'repricer', 'prices', 'order', 'documents']
      };
      window.__ALTEA_PORTAL_ACCESS__ = access;
      window.alteaPortalAuthGate.ensureAuthenticated = async () => access;
      document.body.classList.remove('portal-auth-locked');
      document.getElementById('portalAuthScreen')?.remove();
      await window.alteaPortalAuthGate.loadDelayedScripts();
      window.dispatchEvent(new Event('focus'));
    });

    await page.waitForFunction(() => (
      window.__alteaAppState?.boot?.dataReady === true
      && window.__alteaAppState?.boot?.lazyReady?.controlCenter === true
      && typeof window.getAllTasks === 'function'
    ), null, { timeout: 120000 });
    await page.waitForSelector('#view-control [data-task-filter="owner"]', { timeout: 60000 });

    const result = await page.evaluate(() => {
      const state = window.__alteaAppState;
      const tasks = window.getAllTasks();
      const stockTasks = tasks.filter((task) => task?.autoCode === 'stock_quality_v2');
      const penka = state.skus.find((sku) => (sku.articleKey || sku.article) === 'penka_kudryavii_metod_150ml');
      const penkaOos = state.oosControl?.rows?.find((row) => (
        row.platform === 'wb' && row.articleKey === 'penka_kudryavii_metod_150ml'
      ));
      const ownerOptions = Array.from(
        document.querySelectorAll('#view-control [data-task-filter="owner"] option')
      ).map((option) => (option.textContent || '').trim());
      return {
        activeView: state.activeView,
        oosRows: state.oosControl?.rows?.length || 0,
        stockTasks,
        penkaOwner: penka?.ownersByPlatform?.wb || penka?.owner?.byPlatform?.wb || '',
        penkaOosOwner: penkaOos?.owner || '',
        ownerOptions
      };
    });

    assert.strictEqual(result.activeView, 'control');
    assert.ok(result.oosRows > 0, 'OOS layer must be loaded on direct task entry');
    assert.ok(
      result.stockTasks.some((task) => task.platform === 'wb'),
      'At least one WB stock/OOS auto task must be generated'
    );
    assert.strictEqual(result.penkaOwner, '\u041c\u0430\u043a\u0441\u0438\u043c \u041b\u0430\u043f\u044b\u0433\u0438\u043d');
    assert.strictEqual(result.penkaOosOwner, '\u041c\u0430\u043a\u0441\u0438\u043c \u041b\u0430\u043f\u044b\u0433\u0438\u043d');
    assert.ok(
      result.ownerOptions.includes('\u041c\u0430\u043a\u0441\u0438\u043c \u041b\u0430\u043f\u044b\u0433\u0438\u043d'),
      'Task owner filter must expose the updated WB owner'
    );
    assert.strictEqual(new Set(result.stockTasks.map((task) => task.id)).size, result.stockTasks.length);
    assert.ok(
      requestedUrls.some((url) => url.includes('control_auto_task_sources')),
      'Direct task entry must request the compact auto-task source'
    );
    assert.ok(
      !requestedUrls.some((url) => url.includes('/data/smart_price_overlay.json')),
      `Direct task entry must not request the full smart price overlay: ${requestedUrls.filter((url) => url.includes('smart_price_overlay')).join(', ')}`
    );
    assert.ok(
      !requestedUrls.some((url) => url.includes('/data/ads_summary.json')),
      `Direct task entry must not request the full ads summary: ${requestedUrls.filter((url) => url.includes('ads_summary')).join(', ')}`
    );
    assert.deepStrictEqual(pageErrors, []);
    console.log('portal-control-wb-oos-runtime selftest: ok');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
