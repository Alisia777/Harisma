#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const { hashPayload } = require('./portal-google-sheet-upload');

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
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'portal-repricer-prices.yml'), 'utf8');
  const wbAdsRefresh = 'node scripts/portal-wb-ads-sync.js sync';
  const ozonAdsRefresh = 'node scripts/portal-ozon-ads-finance-sync.js sync';
  const liveSignalsBuild = 'node scripts/portal-repricer-live-signals-sync.js sync';
  assert(workflow.includes(wbAdsRefresh), 'price refresh workflow must refresh WB advertising before margin recalculation');
  assert(workflow.includes(ozonAdsRefresh), 'price refresh workflow must refresh Ozon advertising before margin recalculation');
  assert(workflow.indexOf(wbAdsRefresh) < workflow.indexOf(liveSignalsBuild), 'WB advertising must refresh before repricer live signals');
  assert(workflow.indexOf(ozonAdsRefresh) < workflow.indexOf(liveSignalsBuild), 'Ozon advertising must refresh before repricer live signals');
  assert(
    workflow.includes('ALTEA_WB_PROMOTION_TOKEN: ${{ secrets.ALTEA_WB_PROMOTION_TOKEN }}'),
    'price refresh workflow must require the protected WB promotion token'
  );
  assert(
    workflow.includes('node scripts/portal-repricer-price-apply.js plan'),
    'the same price-refresh job must rebuild the immutable upload plan'
  );
  assert(
    workflow.includes('--snapshot repricer_price_observation_history,repricer_live_prices'),
    'price refresh must hydrate the previous observation history before collecting the next price'
  );
  assert(
    workflow.includes('node scripts/build-repricer-price-observation-history.js'),
    'price refresh must persist compact price-change observations for cooldown and audit'
  );
  assert(
    workflow.includes('repricer_live_signals,repricer_price_observation_history,canonical_repricer'),
    'the atomic price bundle must publish price history together with canonical recommendations'
  );
  assert(
    workflow.includes('--commit-manifest repricer_price_sync_manifest'),
    'price refresh must publish a commit manifest after the complete bundle'
  );
  assert(
    workflow.includes('--bundle-id "${{ github.run_id }}-${{ github.run_attempt }}"'),
    'each price refresh must have a unique workflow bundle id'
  );
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.setDefaultTimeout(90000);

  let syncRequested = false;
  let snapshotPublicationPhase = 0;
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
  const currentPlanFixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'repricer_price_apply_plan.json'), 'utf8'));
  const currentVerificationFixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'repricer_price_apply_verification.json'), 'utf8'));
  const fixtureBaseStamp = Math.max(
    Date.now(),
    Date.parse(liveFixture.generatedAt || '') || 0,
    Date.parse(currentPlanFixture.generatedAt || '') || 0,
    Date.parse(currentVerificationFixture.generatedAt || '') || 0
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
  const bundleId = 'repricer-price-sync-selftest-bundle';
  const readBundleFixture = (fileName) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', fileName), 'utf8'));
  const bundleFixtures = {
    repricer_live_prices: nextFixture,
    repricer_live_signals: {
      ...readBundleFixture('repricer_live_signals.json'),
      generatedAt,
      atomicSyncMarker: bundleId
    },
    repricer_price_observation_history: {
      schema: 'repricer-price-observation-history-v1',
      generatedAt,
      summary: { rows: 1, observations: 1, price_changed_rows: 0 },
      rows: [{
        platform: 'wb',
        article_key: 'wb-test',
        normalized_article_key: 'wb-test',
        observations: [{
          seller_price: 900,
          client_price: 855,
          first_seen_at: generatedAt,
          last_seen_at: generatedAt,
          source: 'current_live_prices'
        }]
      }],
      atomicSyncMarker: bundleId
    },
    canonical_repricer: {
      ...readBundleFixture('canonical_repricer.json'),
      generatedAt,
      atomicSyncMarker: bundleId
    },
    portal_repricing_reconciliation: {
      ...readBundleFixture('portal_repricing_reconciliation.json'),
      generatedAt,
      atomicSyncMarker: bundleId
    },
    repricer_team_policy_proposals: {
      ...readBundleFixture('repricer_team_policy_proposals.json'),
      generatedAt,
      atomicSyncMarker: bundleId
    },
    repricer_shadow_report: {
      ...readBundleFixture('repricer_shadow_report.json'),
      generatedAt,
      atomicSyncMarker: bundleId
    },
    repricer_price_apply_plan: {
      ...currentPlanFixture,
      generatedAt,
      atomicSyncMarker: bundleId
    },
    repricer: {
      ...readBundleFixture('repricer.json'),
      generatedAt,
      atomicSyncMarker: bundleId
    }
  };
  bundleFixtures.repricer_live_prices.atomicSyncMarker = bundleId;
  const manifestGeneratedAt = new Date(Date.parse(generatedAt) + 30_000).toISOString();
  const priceSyncManifest = {
    schema: 'portal-snapshot-bundle-manifest-v1',
    generatedAt: manifestGeneratedAt,
    bundleId,
    source: 'repricer-live-prices',
    requiredSnapshots: Object.keys(bundleFixtures),
    snapshots: Object.fromEntries(Object.entries(bundleFixtures).map(([snapshotKey, payload]) => [
      snapshotKey,
      {
        payloadHash: hashPayload(payload),
        generatedAt: payload.generatedAt
      }
    ]))
  };
  const planGeneratedAt = new Date(Date.parse(generatedAt) + 60_000).toISOString();
  const verificationGeneratedAt = new Date(Date.parse(generatedAt) + 120_000).toISOString();
  assert(Date.parse(generatedAt) > (Date.parse(liveFixture.generatedAt || '') || 0));
  assert(Date.parse(planGeneratedAt) > (Date.parse(currentPlanFixture.generatedAt || '') || 0));
  assert(Date.parse(verificationGeneratedAt) > (Date.parse(currentVerificationFixture.generatedAt || '') || 0));
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
      {
        platform: 'wb',
        articleKey: 'wb-test',
        currentSellerPrice: 900,
        expectedSellerPrice: 1000,
        currentClientPrice: 855,
        expectedClientPriceAfter: 950
      },
      {
        platform: 'ozon',
        articleKey: 'ozon-test',
        currentSellerPrice: 1000,
        expectedSellerPrice: 1100,
        currentClientPrice: 920,
        expectedClientPriceAfter: 1012
      }
    ]
  };
  const verificationFixture = {
    schema: 'repricer-price-apply-verification-v2',
    generatedAt: verificationGeneratedAt,
    requestedBy: 'operator@example.com',
    confirmationHash: 'a'.repeat(64),
    status: 'verified',
    summary: { rows: 2, matched: 2, mismatched: 0, clientPricesObserved: 2 },
    rows: [
      {
        platform: 'wb',
        articleKey: 'wb-test',
        previousSellerPrice: 900,
        actualSellerPrice: 1000,
        previousClientPrice: 855,
        expectedClientPrice: 950,
        actualClientPrice: 948,
        matched: true
      },
      {
        platform: 'ozon',
        articleKey: 'ozon-test',
        previousSellerPrice: 1000,
        actualSellerPrice: 1100,
        previousClientPrice: 920,
        expectedClientPrice: 1012,
        actualClientPrice: 1012,
        matched: true
      }
    ]
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
      if (syncRequested && snapshotPublicationPhase >= 1) {
        rows.push({
          snapshot_key: 'repricer_live_prices',
          payload: bundleFixtures.repricer_live_prices,
          generated_at: generatedAt,
          updated_at: generatedAt,
          payload_hash: priceSyncManifest.snapshots.repricer_live_prices.payloadHash
        });
      }
      if (syncRequested && snapshotPublicationPhase >= 2) {
        Object.entries(bundleFixtures)
          .filter(([snapshotKey]) => snapshotKey !== 'repricer_live_prices')
          .forEach(([snapshotKey, payload]) => {
            rows.push({
              snapshot_key: snapshotKey,
              payload,
              generated_at: generatedAt,
              updated_at: generatedAt,
              payload_hash: priceSyncManifest.snapshots[snapshotKey].payloadHash
            });
          });
        rows.push({
          snapshot_key: 'repricer_price_sync_manifest',
          payload: priceSyncManifest,
          generated_at: manifestGeneratedAt,
          updated_at: manifestGeneratedAt,
          payload_hash: hashPayload(priceSyncManifest)
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
    await page.waitForSelector('[data-premium-primary-action][data-premium-proxy="repricerPriceSync"]', { timeout: 30000 });
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
      const workflowButtons = Array.from(root?.querySelectorAll('[data-repricer-excel-workflow] button') || [])
        .filter((button) => button.offsetParent !== null)
        .map((button) => normalize(button.textContent));
      const metrics = Object.fromEntries(
        Array.from(root?.querySelectorAll('.repricer-game-metric') || []).map((node) => {
          const label = normalize(node.querySelector('span')?.textContent);
          const value = Number(normalize(node.querySelector('strong')?.textContent).replace(/[^\d-]/g, '')) || 0;
          return [label, value];
        })
      );
      return {
        source: root?.dataset?.repricerDataSource || '',
        hero,
        arrival,
        workflowButtons,
        metrics,
        rows: Number(window.__alteaAppState?.canonicalRepricer?.summary?.rows || 0),
        ready: Number(window.__alteaAppState?.canonicalRepricer?.summary?.publishable_rows || 0),
        blocked: Number(window.__alteaAppState?.canonicalRepricer?.summary?.blocked_rows || 0)
      };
    });
    assert.strictEqual(canonicalUi.source, 'canonical-audit', 'portal must show canonical calculations before cutover');
    assert.strictEqual(
      canonicalUi.metrics.Аудит + canonicalUi.metrics.Стоп,
      canonicalUi.rows,
      `all canonical rows must remain visible in audit/stop while cutover is closed: ${canonicalUi.hero}`
    );
    assert(
      canonicalUi.ready > 0 && canonicalUi.blocked > 0,
      `canonical audit fixture must contain both calculated and blocked recommendations: ${canonicalUi.hero}`
    );
    assert.strictEqual(
      canonicalUi.ready + canonicalUi.blocked,
      canonicalUi.rows,
      `canonical recommendation totals must remain internally consistent: ${canonicalUi.hero}`
    );
    assert(
      canonicalUi.hero.includes('В файл цен 0'),
      `shadow cutover must keep every manual price export closed: ${canonicalUi.hero}`
    );
    assert(
      !canonicalUi.arrival.includes('60 095') && !canonicalUi.arrival.includes('21 480'),
      'legacy economically impossible price spikes must not leak into the canonical operator screen'
    );
    assert.deepStrictEqual(
      canonicalUi.workflowButtons,
      ['1. Скачать рабочий Excel', '2. Загрузить заполненный Excel'],
      'simple mode must expose one clear Excel download/upload workflow'
    );

    const baselineStamp = await page.evaluate(() => {
      window.__alteaAppState.team.accessToken = 'selftest-user-session';
      return Date.parse(window.__alteaAppState.repricerLivePrices?.generatedAt || '') || 0;
    });
    assert(Date.parse(generatedAt) > baselineStamp, 'fixture snapshot must be newer than the current snapshot');

    const topbarPriceAction = page.locator('[data-premium-primary-action]');
    await topbarPriceAction.waitFor({ state: 'visible', timeout: 30000 });
    assert.strictEqual(
      (await topbarPriceAction.innerText()).trim(),
      'Получить актуальные цены',
      'repricer topbar must expose the real WB/Ozon refresh action'
    );
    assert.strictEqual(
      await topbarPriceAction.getAttribute('data-premium-proxy'),
      'repricerPriceSync',
      'repricer topbar action must proxy to the protected price refresh'
    );
    await topbarPriceAction.click();
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-premium-primary-action]');
        return button?.disabled
          && button.dataset.repricerPriceSyncBusy === '1'
          && button.textContent.includes('Обновление идёт');
      },
      null,
      { timeout: 30000 }
    );
    await page.evaluate(() => document.querySelector('[data-premium-primary-action]')?.click());
    await page.waitForTimeout(100);
    assert.strictEqual(dispatchCalls, 1, 'a repeated click while refresh is running must not cancel and restart the job');
    await page.evaluate(() => window.setView('dashboard'));
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-premium-primary-action]');
        return button?.getAttribute('data-premium-proxy') === 'pullRemoteBtn' && !button.disabled;
      },
      null,
      { timeout: 30000 }
    );
    await page.evaluate(() => window.setView('repricer'));
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-premium-primary-action]');
        return button?.getAttribute('data-premium-proxy') === 'repricerPriceSync'
          && button.disabled
          && button.dataset.repricerPriceSyncBusy === '1';
      },
      null,
      { timeout: 30000 }
    );
    snapshotPublicationPhase = 1;
    await page.waitForTimeout(180);
    assert.notStrictEqual(
      await page.evaluate(() => window.__alteaAppState.repricerLivePrices?.atomicSyncMarker || ''),
      bundleId,
      'a new live-price row alone must not replace the old state before the full bundle is committed'
    );
    assert.strictEqual(
      await page.locator('[data-repricer-price-apply="apply"]').isDisabled(),
      true,
      'the old upload plan must remain unusable while the fresh bundle is incomplete'
    );
    snapshotPublicationPhase = 2;
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
      () => document.querySelector('[data-repricer-price-sync-status]')?.textContent?.includes('Готово: единый пакет'),
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
    const atomicState = await page.evaluate(() => ({
      livePrices: window.__alteaAppState?.repricerLivePrices?.atomicSyncMarker || '',
      liveSignals: window.__alteaAppState?.repricerLiveSignals?.atomicSyncMarker || '',
      canonical: window.__alteaAppState?.canonicalRepricer?.atomicSyncMarker || '',
      shadow: window.__alteaAppState?.repricerShadowReport?.atomicSyncMarker || '',
      plan: window.__alteaAppState?.repricerPriceApplyPlan?.atomicSyncMarker || '',
      manifest: window.__alteaAppState?.repricerPriceSyncManifest?.bundleId || ''
    }));
    assert.deepStrictEqual(
      Object.values(atomicState),
      Array(Object.keys(atomicState).length).fill(bundleId),
      `all repricer layers must switch to one committed bundle: ${JSON.stringify(atomicState)}`
    );
    assert(
      (await page.locator('.repricer-live-price-sync-card').innerText()).includes(`Цены API свежие: ${expectedMappedRows}`),
      'repricer card must rerender with the refreshed API count'
    );
    const expectedStockSourceLabel = await page.evaluate(() => {
      const signals = window.__alteaAppState?.repricerLiveSignals
        || window.__alteaAppState?.repricer_live_signals
        || {};
      const directPlatforms = Array.isArray(signals?.summary?.directPlatforms)
        ? signals.summary.directPlatforms.map((value) => String(value || '').trim().toLowerCase())
        : [];
      return ['wb', 'ozon'].every((platform) => directPlatforms.includes(platform))
        ? 'OOS API WB/Ozon'
        : 'OOS fallback';
    });
    assert(
      (await page.locator('.repricer-live-price-sync-card').innerText()).includes(expectedStockSourceLabel),
      'repricer card must make the active stock/OOS source visible to the operator'
    );

    dispatchResponseStatus = 404;
    await page.waitForFunction(
      () => !document.querySelector('[data-premium-primary-action]')?.disabled,
      null,
      { timeout: 30000 }
    );
    await page.locator('[data-premium-primary-action]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-repricer-price-sync-status]')?.textContent?.includes('Серверная функция синхронизации ещё не опубликована'),
      null,
      { timeout: 30000 }
    );
    assert.strictEqual(dispatchCalls, 2, 'each button click must dispatch no more than one server job');

    await page.locator('[data-repricer-price-apply="plan"]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-repricer-price-apply-status]')?.textContent?.includes('План готов: 2 цен'),
      null,
      { timeout: 30000 }
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
      () => document.querySelector('[data-repricer-price-apply-status]')?.textContent?.includes('фактические клиентские цены'),
      null,
      { timeout: 30000 }
    );
    assert.strictEqual(priceApplyDispatchCalls, 2);
    assert.strictEqual(priceApplyBodies[1]?.mode, 'apply');
    assert.strictEqual(priceApplyBodies[1]?.confirmationHash, 'a'.repeat(64));
    assert.strictEqual(
      await page.evaluate(() => window.__alteaAppState?.repricerPriceApplyVerification?.status),
      'verified'
    );
    const verifiedPriceCard = (await page.locator('.repricer-price-apply-card').innerText()).replace(/\s+/g, ' ');
    assert(verifiedPriceCard.includes('клиент 855 ₽ → 948 ₽ факт'));
    assert(verifiedPriceCard.includes('прогноз был 950 ₽'));

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
      `[repricer-price-sync-button-selftest] OK: atomic price bundle, incomplete-publication guard, explicit HTTP 404 diagnostic and verified price submission`
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
