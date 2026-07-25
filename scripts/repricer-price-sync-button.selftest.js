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
          '<head><script>window.APP_CONFIG={portalAuthRequired:false};window.__ALTEA_AUTH_SESSION__={access_token:\"repricer-selftest-token\",user:{id:\"repricer-selftest-user\",email:\"repricer-selftest@example.com\",user_metadata:{name:\"Repricer selftest\"}}};window.__ALTEA_PORTAL_ACCESS__={name:\"Repricer selftest\",email:\"repricer-selftest@example.com\",role:\"admin\"};window.__ALTEA_REPRICER_PRICE_SYNC_TEST_POLL_MS__=20;window.__ALTEA_REPRICER_PRICE_APPLY_TEST_POLL_MS__=20;</script>'
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
      url: `http://127.0.0.1:${server.address().port}/index.html`
    }));
  });
}

async function run() {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.setDefaultTimeout(90000);

  let syncRequested = false;
  let dispatchCalls = 0;
  let snapshotCalls = 0;
  let authorizationHeader = '';
  let dispatchBody = null;
  let dispatchResponseStatus = 202;
  let priceApplyRequested = false;
  let priceApplySubmitted = false;
  let priceApplyDispatchCalls = 0;
  const priceApplyBodies = [];
  const supabaseRequests = [];
  const liveFixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'repricer_live_prices.json'), 'utf8'));
  const fixtureBaseStamp = Math.max(
    Date.now(),
    Date.parse(liveFixture.generatedAt || '') || 0
  );
  const generatedAt = new Date(fixtureBaseStamp + 60_000).toISOString();
  const expectedMappedRows = Number(liveFixture.summary?.mappedRows || 0) + 1;
  const nextFixture = {
    ...liveFixture,
    generatedAt,
    summary: {
      ...(liveFixture.summary || {}),
      mappedRows: expectedMappedRows
    }
  };
  const planGeneratedAt = new Date(Date.parse(generatedAt) + 60_000).toISOString();
  const verificationGeneratedAt = new Date(Date.parse(generatedAt) + 120_000).toISOString();
  const planFixture = {
    schema: 'repricer-price-apply-plan-v1',
    generatedAt: planGeneratedAt,
    requestedBy: 'operator@example.com',
    status: 'ready',
    applyAllowed: true,
    confirmationHash: 'a'.repeat(64),
    summary: { actions: 2, wb: 1, ozon: 1, rejected: 0, ignored: 0 },
    globalBlockers: [],
    actions: [
      { platform: 'wb', articleKey: 'wb-test', expectedSellerPrice: 1000 },
      { platform: 'ozon', articleKey: 'ozon-test', expectedSellerPrice: 1100 }
    ]
  };
  const verificationFixture = {
    schema: 'repricer-price-apply-verification-v1',
    generatedAt: verificationGeneratedAt,
    requestedBy: 'operator@example.com',
    confirmationHash: 'a'.repeat(64),
    status: 'verified',
    summary: { rows: 2, matched: 2, mismatched: 0 },
    rows: []
  };

  await page.route('https://iyckwryrucqrxwlowxow.supabase.co/**', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    supabaseRequests.push(`${request.method()} ${requestUrl.pathname}`);
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'content-type': 'application/json; charset=utf-8'
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }
    if (requestUrl.pathname.endsWith('/functions/v1/repricer-price-sync')) {
      dispatchCalls += 1;
      authorizationHeader = request.headers().authorization || '';
      dispatchBody = request.postDataJSON();
      syncRequested = dispatchResponseStatus === 202;
      await route.fulfill({
        status: dispatchResponseStatus,
        headers,
        body: JSON.stringify(dispatchResponseStatus === 202
          ? { ok: true, status: 'queued' }
          : { ok: false, error: 'not_found' })
      });
      return;
    }
    if (requestUrl.pathname.endsWith('/functions/v1/repricer-price-apply')) {
      priceApplyDispatchCalls += 1;
      const body = request.postDataJSON();
      priceApplyBodies.push(body);
      priceApplyRequested = body?.mode === 'plan' || priceApplyRequested;
      priceApplySubmitted = body?.mode === 'apply' || priceApplySubmitted;
      await route.fulfill({
        status: 202,
        headers,
        body: JSON.stringify({
          ok: true,
          status: 'queued',
          mode: body?.mode || 'plan',
          requestedBy: 'operator@example.com'
        })
      });
      return;
    }
    if (requestUrl.pathname.includes('/rest/v1/portal_data_snapshots')) {
      snapshotCalls += 1;
      const rows = [];
      if (syncRequested) {
        rows.push({
          snapshot_key: 'repricer_live_prices',
          payload: nextFixture,
          generated_at: generatedAt,
          updated_at: generatedAt,
          payload_hash: 'selftest'
        });
      }
      if (priceApplyRequested) {
        rows.push({
          snapshot_key: 'repricer_price_apply_plan',
          payload: planFixture,
          generated_at: planGeneratedAt,
          updated_at: planGeneratedAt,
          payload_hash: 'plan-selftest'
        });
      }
      if (priceApplySubmitted) {
        rows.push({
          snapshot_key: 'repricer_price_apply_verification',
          payload: verificationFixture,
          generated_at: verificationGeneratedAt,
          updated_at: verificationGeneratedAt,
          payload_hash: 'verification-selftest'
        });
      }
      await route.fulfill({ status: 200, headers, body: JSON.stringify(rows) });
      return;
    }
    await route.fulfill({ status: 200, headers, body: '[]' });
  });

  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('dialog', (dialog) => dialog.accept());

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(
      () => window.__alteaAppState?.boot?.dataReady && Array.isArray(window.__alteaAppState?.skus),
      null,
      { timeout: 90000 }
    );
    await page.evaluate(() => window.setView('repricer'));
    await page.waitForFunction(
      () => window.__alteaAppState?.boot?.lazyReady?.repricer
        && Array.isArray(window.__alteaAppState?.canonicalRepricer?.rows)
        && window.__alteaAppState.canonicalRepricer.rows.length > 0,
      null,
      { timeout: 90000 }
    );
    await page.waitForSelector('[data-repricer-price-sync]', { timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelector('#view-repricer')?.dataset?.repricerDataSource === 'canonical-audit',
      null,
      { timeout: 30000 }
    );

    const canonicalUi = await page.evaluate(() => {
      const root = document.querySelector('#view-repricer');
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const hero = normalize(root?.querySelector('.repricer-game-hero')?.textContent);
      const arrival = normalize(root?.querySelector('.repricer-arrival-price-card')?.textContent);
      return {
        source: root?.dataset?.repricerDataSource || '',
        hero,
        arrival,
        ready: Number(window.__alteaAppState?.canonicalRepricer?.summary?.publishable_rows || 0),
        blocked: Number(window.__alteaAppState?.canonicalRepricer?.summary?.blocked_rows || 0)
      };
    });
    assert.strictEqual(canonicalUi.source, 'canonical-audit', 'portal must show canonical calculations before cutover');
    assert(
      canonicalUi.hero.includes(`Аудит ${canonicalUi.ready}`),
      `canonical ready rows must be visible as audit-only: ${canonicalUi.hero}`
    );
    assert(
      canonicalUi.hero.includes(`Стоп ${canonicalUi.blocked}`),
      `canonical blocked rows must remain stopped: ${canonicalUi.hero}`
    );
    assert(
      canonicalUi.hero.includes('В файл цен 0'),
      `shadow cutover must keep every manual price export closed: ${canonicalUi.hero}`
    );
    assert(
      !canonicalUi.arrival.includes('60 095') && !canonicalUi.arrival.includes('21 480'),
      'legacy economically impossible price spikes must not leak into the canonical operator screen'
    );

    const baselineStamp = await page.evaluate(() => {
      window.__alteaAppState.team.accessToken = 'selftest-user-session';
      return Date.parse(window.__alteaAppState.repricerLivePrices?.generatedAt || '') || 0;
    });
    assert(Date.parse(generatedAt) > baselineStamp, 'fixture snapshot must be newer than the current snapshot');

    await page.locator('[data-repricer-price-sync]').click();
    await page.waitForTimeout(1000);
    const dispatchDiagnostic = await page.evaluate(() => ({
      status: document.querySelector('[data-repricer-price-sync-status]')?.textContent || '',
      generatedAt: window.__alteaAppState.repricerLivePrices?.generatedAt || '',
      pollDelay: window.__ALTEA_REPRICER_PRICE_SYNC_TEST_POLL_MS__,
      hasToken: Boolean(window.__alteaAppState.team?.accessToken)
    }));
    assert.strictEqual(dispatchCalls, 1, `button did not dispatch once: ${JSON.stringify(dispatchDiagnostic)}`);
    try {
      await page.waitForFunction(
        (stamp) => Date.parse(window.__alteaAppState.repricerLivePrices?.generatedAt || '') === stamp,
        Date.parse(generatedAt),
        { timeout: 30000 }
      );
    } catch (error) {
      const failureDiagnostic = await page.evaluate(() => ({
        status: document.querySelector('[data-repricer-price-sync-status]')?.textContent || '',
        generatedAt: window.__alteaAppState.repricerLivePrices?.generatedAt || '',
        pollDelay: window.__ALTEA_REPRICER_PRICE_SYNC_TEST_POLL_MS__
      }));
      throw new Error(`${error.message}; ${JSON.stringify({ failureDiagnostic, snapshotCalls, supabaseRequests })}`);
    }
    await page.waitForFunction(
      () => document.querySelector('[data-repricer-price-sync-status]')?.textContent?.includes('Готово: свежие цены'),
      null,
      { timeout: 30000 }
    );

    assert.strictEqual(dispatchCalls, 1, 'button must dispatch exactly one server job');
    assert.strictEqual(authorizationHeader, 'Bearer selftest-user-session', 'button must use the signed-in user token');
    assert.strictEqual(dispatchBody?.source, 'portal-repricer');
    assert(Number.isFinite(Date.parse(dispatchBody?.requestedAt || '')), 'button request must include requestedAt');
    assert.strictEqual(
      await page.evaluate(() => Number(window.__alteaAppState.repricerLivePrices?.summary?.mappedRows || 0)),
      expectedMappedRows,
      'new live-price snapshot must replace the old state'
    );
    assert(
      (await page.locator('.repricer-live-price-sync-card').innerText()).includes(`Цены API свежие: ${expectedMappedRows}`),
      'repricer card must rerender with the refreshed API count'
    );
    assert(
      (await page.locator('.repricer-live-price-sync-card').innerText()).includes('OOS fallback'),
      'repricer card must make fallback stock/OOS data visible to the operator'
    );

    dispatchResponseStatus = 404;
    await page.waitForFunction(
      () => !document.querySelector('[data-repricer-price-sync]')?.disabled,
      null,
      { timeout: 5000 }
    );
    await page.locator('[data-repricer-price-sync]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-repricer-price-sync-status]')?.textContent?.includes('Серверная функция синхронизации ещё не опубликована'),
      null,
      { timeout: 5000 }
    );
    assert.strictEqual(dispatchCalls, 2, 'each button click must dispatch no more than one server job');

    await page.locator('[data-repricer-price-apply="plan"]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-repricer-price-apply-status]')?.textContent?.includes('План готов: 2 цен'),
      null,
      { timeout: 10000 }
    );
    assert.strictEqual(priceApplyDispatchCalls, 1);
    assert.strictEqual(priceApplyBodies[0]?.mode, 'plan');
    assert.strictEqual(
      await page.locator('[data-repricer-price-apply="apply"]').isEnabled(),
      true,
      'verified ready plan must enable the explicit apply button'
    );

    await page.locator('[data-repricer-price-apply="apply"]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-repricer-price-apply-status]')?.textContent?.includes('цены изменены и совпали'),
      null,
      { timeout: 10000 }
    );
    assert.strictEqual(priceApplyDispatchCalls, 2);
    assert.strictEqual(priceApplyBodies[1]?.mode, 'apply');
    assert.strictEqual(priceApplyBodies[1]?.confirmationHash, 'a'.repeat(64));
    assert.strictEqual(
      await page.evaluate(() => window.__alteaAppState?.repricerPriceApplyVerification?.status),
      'verified'
    );

    const unexpectedErrors = errors.filter((message) => !(
      /Failed to load resource/i.test(message)
      || /Репрайсер controls превысил 8 сек/i.test(message)
      || /supabase query .* превысил 8 сек/i.test(message)
      || /portal_(?:tasks|comments).*row-level security/i.test(message)
      || /\[task-workflow-resilient\].*persist/i.test(message)
      || /\[repricer\.priceSync\].*Серверная функция синхронизации ещё не опубликована/i.test(message)
    ));
    assert.strictEqual(unexpectedErrors.length, 0, `browser errors: ${unexpectedErrors.join(' | ')}`);
    console.log(
      `[repricer-price-sync-button-selftest] OK: price refresh, explicit HTTP 404 diagnostic, immutable apply plan and verified price submission`
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
