#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

function serve() {
  const server = http.createServer((req, res) => {
    const pathname = String(req.url || '/').split('?')[0];
    if (pathname === '/' || pathname === '/blank') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/portal-designers.css"></head><body><section id="view-designers"></section></body></html>');
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(pathname).replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const type = path.extname(file) === '.js' ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function run() {
  const css = fs.readFileSync(path.join(ROOT, 'portal-designers.css'), 'utf8');
  assert.doesNotMatch(css, /font-size:\s*[0-9](?:\.\d+)?px/, 'Designer workspace must not use text below 10px');

  const server = await serve();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ url: `${baseUrl}/portal-designers.js` });
    await page.waitForSelector('[data-design-access="local"]');

    await page.click('[data-design-mode="tests"]');
    assert.strictEqual(await page.locator('.design-ws-head [data-design-add-test]').count(), 1, 'Tests tab must expose a contextual create action');
    assert.strictEqual(await page.locator('.design-ws-head [data-design-add-project]').count(), 0, 'Tests tab must not expose New project');
    assert.strictEqual(await page.locator('[data-design-search="testSearch"]').count(), 1, 'Tests must have search');
    assert.strictEqual(await page.locator('[data-design-filter="testStatus"]').count(), 1, 'Tests must have a status filter');

    await page.click('.design-ws-head [data-design-add-test]');
    await page.fill('[data-design-test-form] [name="title"]', 'Поисковый UX-тест');
    await page.selectOption('[data-design-test-form] [name="status"]', 'complete');
    await page.fill('[data-design-test-form] [name="conclusion"]', 'Новый визуал повысил конверсию');
    await page.fill('[data-design-test-form] [name="decision"]', 'Оставить вариант B и повторить на Ozon');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');
    await page.setInputFiles('[data-design-image-input="controlImageUrl"]', { name: 'control.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => document.querySelector('[name="controlImageUrl"]').value.startsWith('data:image/png;base64,'));
    await page.click('[data-design-test-form] button[type="submit"]');
    await page.waitForSelector('.design-test-card');
    assert.match(await page.locator('.design-test-insights').innerText(), /Новый визуал повысил конверсию[\s\S]*Оставить вариант B/, 'Test card must show conclusion and next step');
    assert.strictEqual(await page.locator('.design-test-preview img').count(), 1, 'Uploaded A/B image must persist on the test card');

    await page.fill('[data-design-search="testSearch"]', 'нет такого теста');
    await page.waitForSelector('[data-design-clear-filters="tests"]');
    assert.strictEqual(await page.locator('.design-test-card').count(), 0, 'Test search must filter cards');
    await page.click('[data-design-clear-filters="tests"]');
    await page.waitForSelector('.design-test-card');

    await page.click('[data-design-mode="knowledge"]');
    assert.strictEqual(await page.locator('.design-ws-head [data-design-add-page]').count(), 1, 'Knowledge tab must expose New page');
    assert.strictEqual(await page.locator('.design-ws-head [data-design-add-project]').count(), 0, 'Knowledge tab must not expose New project');
    assert.strictEqual(await page.locator('[data-design-search="knowledgeSearch"]').count(), 1, 'Knowledge base must have search');
    assert.strictEqual(await page.locator('[data-design-filter="knowledgeCategory"]').count(), 1, 'Knowledge base must have a category filter');
    assert.match(await page.locator('.design-ws-head [data-design-import]').innerText(), /CSV/, 'Notion import must identify its CSV scope');

    await page.click('[data-design-mode="history"]');
    assert.strictEqual(await page.locator('[data-design-export]').count(), 1, 'History must not duplicate Export JSON');
    assert.match(await page.locator('.design-ws-sync').innerText(), /\d{2}:\d{2}/, 'Sync status must show the last change time');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('[data-design-mode="board"]');
    const mobile = await page.evaluate(() => {
      const toolbar = document.querySelector('.design-ws-toolbar').getBoundingClientRect();
      const summary = document.querySelector('.design-ws-summary');
      const summaryRect = summary.getBoundingClientRect();
      return { toolbarTop: toolbar.top, summaryTop: summaryRect.top, scrollWidth: summary.scrollWidth, clientWidth: summary.clientWidth };
    });
    assert.ok(mobile.toolbarTop < mobile.summaryTop, 'Mobile navigation must appear before KPI cards');
    assert.ok(mobile.scrollWidth > mobile.clientWidth, 'Mobile KPI cards must use a compact horizontal strip');
    assert.strictEqual(errors.length, 0, errors.join('\n'));
    console.log('portal-designers-ux.selftest: ok');
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
