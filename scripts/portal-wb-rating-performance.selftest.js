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
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm'
};

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(ROOT, relative);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403);
      response.end('forbidden');
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500);
        response.end(error.code || 'read_error');
        return;
      }
      const body = relative === 'index.html'
        ? Buffer.from(data.toString('utf8').replace(
          '<head>',
          '<head><script>window.APP_CONFIG={portalAuthRequired:false,teamMode:\"local\",supabase:{url:\"\",anonKey:\"\"}};window.__ALTEA_PORTAL_ACCESS__={name:\"Rating selftest\",email:\"rating@example.com\",role:\"admin\"};</script>'
        ), 'utf8')
        : data;
      response.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      url: `http://127.0.0.1:${server.address().port}/index.html#wb-rating`
    }));
  });
}

async function run() {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(90000);
  const fatalErrors = [];
  page.on('pageerror', (error) => fatalErrors.push(String(error?.message || error)));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view-wb-rating .rating-structured-shell');
    const bodyText = await page.locator('#view-wb-rating').innerText();
    assert(bodyText.includes('WB рейтинг ЛК'));
    assert(bodyText.includes('нет доступа'), 'derived card average must not impersonate WB cabinet rating');
    assert(bodyText.includes('нужен сервисный токен'));
    assert(
      bodyText.includes('хвост API устарел') || bodyText.includes('хвост API свежий'),
      'current-tail freshness must be explicit'
    );

    // The authenticated shell loads application scripts sequentially. On a busy
    // CI runner the legacy rating render can become visible a few milliseconds
    // before the structured report styles finish loading.
    await page.waitForFunction(() => {
      const table = document.querySelector('#view-wb-rating .rating-work-table');
      if (!table
        || !document.getElementById('altea-wb-rating-structured-v6')) return false;
      const style = getComputedStyle(table);
      return table.clientWidth > 0 && ['auto', 'scroll'].includes(style.overflowX);
    });
    await page.waitForFunction(() => {
      const input = document.querySelector('#view-wb-rating [data-rating-search]');
      if (!input) return false;
      const now = performance.now();
      const marker = window.__alteaRatingSelftestStableInput;
      if (!marker || marker.input !== input) {
        window.__alteaRatingSelftestStableInput = { input, since: now };
        return false;
      }
      return now - marker.since >= 900;
    });
    await page.addStyleTag({
      content: '#view-wb-rating .rating-work-table { max-height:70vh; }'
    });
    const tableStyle = await page.locator('#view-wb-rating .rating-work-table').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        maxHeight: style.maxHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY
      };
    });
    assert(
      ['none', 'max-content'].includes(tableStyle.maxHeight),
      `late generic styles must not cap the rating table: ${JSON.stringify(tableStyle)}`
    );
    assert(
      ['auto', 'scroll'].includes(tableStyle.overflowX),
      `rating table must retain horizontal scrolling: ${JSON.stringify(tableStyle)}`
    );
    assert(
      ['visible', 'clip', 'auto'].includes(tableStyle.overflowY),
      `rating table must not force a separate vertical scrollbar: ${JSON.stringify(tableStyle)}`
    );

    const search = page.locator('#view-wb-rating [data-rating-search]').first();
    await search.focus();
    await search.fill('retinait');
    await page.evaluate(() => window.renderWbCardRating('view-wb-rating'));
    await page.waitForTimeout(450);
    await page.waitForFunction(() => (
      document.activeElement?.hasAttribute?.('data-rating-search')
      && document.activeElement?.value === 'retinait'
    ));
    assert.strictEqual(await search.inputValue(), 'retinait');
    const frameAdvanced = await page.evaluate(() => new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve(true));
    }));
    const focusState = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName || '',
      activeSearch: document.activeElement?.hasAttribute?.('data-rating-search') || false,
      activeValue: document.activeElement?.value || '',
      searchCount: document.querySelectorAll('#view-wb-rating [data-rating-search]').length
    }));
    assert(focusState.activeSearch, `search focus was lost: ${JSON.stringify(focusState)}`);
    assert.strictEqual(frameAdvanced, true, 'rating search must release the main thread for the next frame');

    await page.evaluate(() => {
      state.wbFeedbacks.currentState = {
        observedAt: new Date().toISOString(),
        basis: 'current_unanswered_list',
        feedbacksUnansweredVerified: 0,
        questionsUnansweredVerified: 0
      };
      state.wbFeedbacks.generatedAt = new Date().toISOString();
      window.dispatchEvent(new CustomEvent('altea:datarefresh', {
        detail: { keys: ['wb_feedbacks_summary'] }
      }));
    });
    await page.waitForFunction(() => (
      document.querySelector('#view-wb-rating')?.innerText.includes('проверено: закрыто')
    ));
    assert.strictEqual(fatalErrors.length, 0, `page errors: ${fatalErrors.join(' | ')}`);
    process.stdout.write('portal-wb-rating-performance selftest: OK\n');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
