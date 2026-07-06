#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname || '/');
    if ((pathname === '/' || pathname === '/index.html') && url.searchParams.has('build-check')) {
      const remote = INDEX.includes('__ALTEA_PORTAL_BUILD__')
        ? INDEX.replace(/__ALTEA_PORTAL_BUILD__\s*=\s*['"][^'"]+['"]/, "__ALTEA_PORTAL_BUILD__ = 'selftest-remote-build'")
        : INDEX.replace('<script>', "<script>\n    window.__ALTEA_PORTAL_BUILD__ = 'selftest-remote-build';");
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(remote);
      return;
    }
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
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
  const page = await browser.newPage({ viewport: { width: 1920, height: 950 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    await page.addInitScript(() => {
      localStorage.clear();
      window.__ALTEA_PORTAL_BUILD__ = 'selftest-current-build';
      localStorage.setItem('altea-portal-active-view-v1', JSON.stringify({
        activeView: 'control',
        updatedAt: new Date().toISOString()
      }));
      localStorage.setItem('altea.portal.marketplace', 'all');
    });
    await page.goto(`http://127.0.0.1:${port}/index.html#control`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.alteaPortalAuthGate), null, { timeout: 30000 });
    await page.evaluate(async () => {
      window.__ALTEA_PORTAL_ACCESS__ = {
        email: 'm.a.pavlenko@qeep.life',
        roles: ['employee'],
        allowedViews: [
          'dashboard', 'data-health', 'control', 'executive', 'sku-plan-fact',
          'repricer', 'prices', 'order', 'oos-control', 'sku-contour',
          'launches', 'launch-control', 'iu-drr', 'wb-rating',
          'product-leaderboard', 'meetings', 'documents'
        ]
      };
      document.body.classList.remove('portal-auth-locked');
      document.getElementById('portalAuthScreen')?.remove();
      await window.alteaPortalAuthGate.loadDelayedScripts();
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForSelector('.altea-premium-app:not([hidden]) [data-altea-marketplace="ozon"]', { timeout: 60000 });
    await page.waitForSelector('[data-task-calendar-design-v1]', { timeout: 60000 });
    await page.waitForSelector('#altea-build-refresh-banner', { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('.altea-motion-stage.is-visible'), null, { timeout: 60000 });
    const initialCardCount = await page.locator('[data-kanban-task]').count();
    assert.ok(initialCardCount <= 108, `Task entry rendered too many cards: ${initialCardCount}`);
    const moreCopy = await page.locator('.task-design-more').evaluateAll((nodes) => nodes.map((node) => node.textContent || '').join('\n'));
    assert.ok(!moreCopy.includes('Уточните фильтр'), moreCopy);

    const hitbox = await page.evaluate(() => {
      const chip = document.querySelector('.altea-premium-app:not([hidden]) [data-altea-marketplace="ozon"]');
      const banner = document.getElementById('altea-build-refresh-banner');
      const chipRect = chip.getBoundingClientRect();
      const bannerRect = banner.getBoundingClientRect();
      const x = chipRect.left + chipRect.width / 2;
      const y = chipRect.top + chipRect.height / 2;
      const top = document.elementFromPoint(x, y);
      const overlap = !(bannerRect.right < chipRect.left
        || bannerRect.left > chipRect.right
        || bannerRect.bottom < chipRect.top
        || bannerRect.top > chipRect.bottom);
      return {
        chipRect: {
          left: chipRect.left,
          top: chipRect.top,
          right: chipRect.right,
          bottom: chipRect.bottom
        },
        bannerRect: {
          left: bannerRect.left,
          top: bannerRect.top,
          right: bannerRect.right,
          bottom: bannerRect.bottom
        },
        overlap,
        topMarketplace: top?.closest?.('[data-altea-marketplace]')?.getAttribute('data-altea-marketplace') || '',
        topId: top?.id || '',
        topClass: String(top?.className || '')
      };
    });

    assert.strictEqual(hitbox.overlap, false, `Build banner overlaps marketplace chip: ${JSON.stringify(hitbox)}`);
    assert.strictEqual(hitbox.topMarketplace, 'ozon', `Marketplace chip is covered: ${JSON.stringify(hitbox)}`);

    await page.click('.altea-premium-app:not([hidden]) [data-altea-marketplace="ozon"]', { timeout: 30000 });
    await page.waitForFunction(() => (
      localStorage.getItem('altea.portal.marketplace') === 'ozon'
      && document.body.dataset.marketplace === 'ozon'
      && document.documentElement.dataset.marketplace === 'ozon'
      && document.querySelector('[data-task-calendar-design-v1]')?.classList.contains('platform-ozon')
    ), null, { timeout: 30000 });
    const after = await page.evaluate(() => ({
      active: document.querySelector('.altea-premium-app:not([hidden]) [data-altea-marketplace="ozon"]')?.classList.contains('is-active'),
      pressed: document.querySelector('.altea-premium-app:not([hidden]) [data-altea-marketplace="ozon"]')?.getAttribute('aria-pressed'),
      stored: localStorage.getItem('altea.portal.marketplace')
    }));

    assert.deepStrictEqual(after, { active: true, pressed: 'true', stored: 'ozon' });
    await page.click('.altea-premium-app:not([hidden]) [data-altea-marketplace="all"]', { timeout: 30000 });
    await page.waitForFunction(() => (
      localStorage.getItem('altea.portal.marketplace') === 'all'
      && document.querySelector('[data-task-calendar-design-v1]')?.classList.contains('platform-all')
    ), null, { timeout: 30000 });

    await page.evaluate(() => {
      const state = window.__alteaAppState || window.state;
      state.storage = state.storage || {};
      state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
      state.storage.tasks = state.storage.tasks.filter((task) => task && task.id !== 'selftest-filter-bind');
      state.storage.tasks.push({
        id: 'selftest-filter-bind',
        title: 'Selftest filter bind task',
        nextAction: 'Check that search filters task cards',
        owner: 'Мария Васильева',
        status: 'new',
        priority: 'critical',
        type: 'general',
        source: 'manual',
        due: '2026-07-02',
        createdAt: new Date().toISOString(),
        platform: 'wb',
        articleKey: 'SELFTEST-FILTER-BIND'
      });
      Object.assign(state.controlFilters || (state.controlFilters = {}), {
        search: '',
        owner: 'all',
        status: 'active',
        type: 'all',
        priority: 'all',
        horizon: 'all',
        source: 'all',
        platform: 'all'
      });
      window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__?.renderControl();
    });
    await page.waitForSelector('[data-kanban-task="selftest-filter-bind"]', { timeout: 30000 });

    await page.fill('[data-task-filter="search"]', 'Selftest filter bind task');
    await page.waitForFunction(() => (
      window.__alteaAppState?.controlFilters?.search === 'Selftest filter bind task'
      && document.querySelectorAll('[data-kanban-task="selftest-filter-bind"]').length === 1
      && document.querySelectorAll('[data-kanban-task]').length === 1
    ), null, { timeout: 30000 });

    await page.fill('[data-task-filter="search"]', 'no-match-portal-filter');
    await page.waitForFunction(() => (
      window.__alteaAppState?.controlFilters?.search === 'no-match-portal-filter'
      && document.querySelectorAll('[data-kanban-task]').length === 0
    ), null, { timeout: 30000 });
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().then(() => {
  console.log('portal-marketplace-hitbox.selftest: ok');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
