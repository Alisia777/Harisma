#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DATES = {
  goldapple: '2026-07-20',
  letu: '2026-07-20',
  megamarket: '2026-07-20',
  samokat: ''
};

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
    const pathname = decodeURIComponent(url.pathname || '/');
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.join(ROOT, relative);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function run() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 950 } });
  try {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('altea-portal-active-view-v1', JSON.stringify({
        activeView: 'executive',
        updatedAt: new Date().toISOString()
      }));
      localStorage.setItem('altea.portal.marketplace', 'all');
    });
    await page.goto(`http://127.0.0.1:${port}/index.html#executive`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.alteaPortalAuthGate), null, { timeout: 30000 });
    await page.evaluate(async () => {
      window.__ALTEA_PORTAL_ACCESS__ = {
        email: 'portal-retail-network-ui-selftest@qeep.life',
        roles: ['employee'],
        allowedViews: [
          'dashboard', 'data-health', 'control', 'executive', 'sku-plan-fact',
          'repricer', 'prices', 'order', 'oos-control', 'sku-contour',
          'launches', 'launch-control', 'wb-rating',
          'product-leaderboard', 'meetings', 'documents'
        ]
      };
      document.body.classList.remove('portal-auth-locked');
      document.getElementById('portalAuthScreen')?.remove();
      await window.alteaPortalAuthGate.loadDelayedScripts();
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForSelector('.altea-premium-app:not([hidden]) [data-altea-marketplace="goldapple"]', { timeout: 90000 });

    const dataState = await page.evaluate((expectedKeys) => {
      return fetch('data/platform_trends.json', { cache: 'no-store' })
        .then((response) => response.json())
        .then((payload) => {
          const platforms = payload.platforms || [];
          const result = {
            latestMarketplaceDate: payload.latestMarketplaceDate || '',
            platforms: {}
          };
          expectedKeys.forEach((key) => {
            const platform = platforms.find((item) => item?.key === key);
            const dates = (platform?.series || []).map((point) => point?.date || point?.label || '').filter(Boolean).sort();
            result.platforms[key] = {
              latest: dates[dates.length - 1] || '',
              has19: dates.includes('2026-07-19'),
              has20: dates.includes('2026-07-20')
            };
          });
          return result;
        });
    }, Object.keys(TARGET_DATES));

    assert.strictEqual(dataState.latestMarketplaceDate, '2026-07-20');
    for (const [key, expectedDate] of Object.entries(TARGET_DATES)) {
      assert.strictEqual(dataState.platforms[key].latest, expectedDate, `${key} latest date`);
      if (expectedDate) {
        assert.strictEqual(dataState.platforms[key].has19, true, `${key} must contain July 19`);
        assert.strictEqual(dataState.platforms[key].has20, true, `${key} must contain July 20`);
      }
    }

    for (const key of Object.keys(TARGET_DATES)) {
      const chip = page.locator(`.altea-premium-app:not([hidden]) [data-altea-marketplace="${key}"]`).first();
      await chip.waitFor({ state: 'attached', timeout: 60000 });
      await chip.evaluate((node) => node.click());
      await page.waitForFunction((platform) => (
        document.body.dataset.marketplace === platform
        && localStorage.getItem('altea.portal.marketplace') === platform
      ), key, { timeout: 30000 });
    }

    console.log('portal-retail-network-ui self-test passed');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
