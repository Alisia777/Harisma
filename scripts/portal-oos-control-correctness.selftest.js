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

function expectedFactDate(now = new Date()) {
  const date = new Date(now.getTime());
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
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
    await page.goto(`http://127.0.0.1:${port}/index.html?portal-refresh=20260724#oos-control`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForFunction(() => Boolean(window.alteaPortalAuthGate), null, { timeout: 30000 });
    await page.evaluate(async () => {
      const access = {
        email: 'oos-correctness-selftest@qeep.life',
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
      && window.__alteaAppState?.boot?.lazyReady?.oosControl === true
      && window.__alteaAppState?.activeView === 'oos-control'
      && document.querySelectorAll('#view-oos-control .oos-signal').length > 0
    ), null, { timeout: 120000 });

    const initial = await page.evaluate(() => {
      const state = window.__alteaAppState;
      return {
        activeView: state.activeView,
        rowCount: state.oosControl?.rows?.length || 0,
        criticalRowCount: (state.oosControl?.rows || []).filter((row) => row.severity === 'critical').length,
        dataDate: state.oosControl?.dataFreshness?.dataDate || state.oosControl?.summary?.dataDate || '',
        signalCount: document.querySelectorAll('#view-oos-control .oos-signal').length
      };
    });
    assert.strictEqual(initial.activeView, 'oos-control');
    assert.ok(initial.rowCount > 0, 'Direct OOS entry must load the OOS data layer');
    assert.ok(initial.criticalRowCount > 0, 'Fixture must contain critical OOS rows');
    assert.ok(initial.signalCount > 0, 'Direct OOS entry must render cluster signals');
    const decodedRequests = requestedUrls.map((url) => {
      try {
        return decodeURIComponent(url);
      } catch {
        return url;
      }
    });
    const smartPriceRequests = decodedRequests.filter((url) => url.includes('smart_price_overlay'));
    assert.deepStrictEqual(
      smartPriceRequests,
      [],
      `Direct OOS entry must not load the full smart price overlay: ${smartPriceRequests.join(', ')}`
    );
    assert.ok(
      !decodedRequests.some((url) => /order_procurement(?:_wb|_ozon|_ym)?/i.test(url)),
      'Direct OOS entry must use the prepared OOS layer instead of full procurement payloads'
    );

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('altea:data-ready', {
        detail: { view: 'oos-control', key: 'oosControl', lazy: true }
      }));
    });
    await page.waitForTimeout(350);

    const stableShell = await page.evaluate(() => {
      const root = document.getElementById('view-oos-control');
      return {
        pageHead: root?.querySelectorAll(':scope > .page-head').length || 0,
        freshness: root?.querySelectorAll(':scope > .oos-freshness-notice').length || 0,
        tabs: root?.querySelectorAll(':scope > .oos-view-tabs').length || 0,
        command: root?.querySelectorAll(':scope > .oos-command').length || 0,
        focus: root?.querySelectorAll(':scope > [data-oos-focus]').length || 0
      };
    });
    assert.deepStrictEqual(stableShell, {
      pageHead: 1,
      freshness: 1,
      tabs: 1,
      command: 1,
      focus: 1
    }, 'Route layer lock must preserve the complete OOS shell');

    const expected = expectedFactDate();
    const freshnessText = await page.locator('#view-oos-control .oos-freshness-notice').innerText();
    if (initial.dataDate && initial.dataDate < expected) {
      assert.match(freshnessText, /Данные отстают/);
      assert.ok(freshnessText.includes(expected), 'Stale notice must use the runtime expected fact date');
    }

    const statusFilter = page.locator('#view-oos-control .oos-signal-tools select[data-oos-filter="status"]');
    assert.strictEqual(await statusFilter.count(), 1);
    await statusFilter.selectOption('critical');
    await page.waitForFunction(() => (
      document.querySelector('#view-oos-control .oos-signal-tools select[data-oos-filter="status"]')?.value === 'critical'
    ));
    const criticalSignals = await page.locator('#view-oos-control .oos-signal').count();
    assert.ok(criticalSignals > 0, 'Critical filter must keep severity=critical OOS signals visible');
    const emptyText = await page.locator('#view-oos-control .oos-risk-queue .oos-empty').count();
    assert.strictEqual(emptyText, 0, 'Critical filter must not render a false empty state');

    const procurementTab = page.locator('#view-oos-control [data-oos-tab="procurement"]');
    assert.strictEqual(await procurementTab.count(), 1, 'OOS must expose the prices and procurement budget tab');
    await procurementTab.click();
    await page.waitForSelector('#view-oos-control [data-oos-procurement]', { timeout: 10000 });

    const forecast = await page.evaluate(() => {
      const model = window.oosProcurementBuildModel();
      return {
        horizon: model.ui.horizon,
        scenarioCount: model.scenarios.length,
        lineCount: model.lines.length,
        domLineCount: document.querySelectorAll('#view-oos-control .oos-procurement-table tbody tr').length,
        units: model.summary.needUnits,
        budget: model.summary.knownBudget,
        safetyDays: model.ui.safetyDays,
        safetyUnits: model.summary.safetyUnits,
        effectiveDays: model.formulaPassport.effectiveDays,
        concentrationPct: model.summary.topBudgetSharePct,
        priceDateRows: model.lines.filter((line) => line.purchasePriceUpdatedAt).length,
        missingCostRows: model.summary.missingCostRows,
        parityOk: model.lines.every((line) => line.needUnits === line.baseNeedUnits),
        arithmeticOk: model.lines.every((line) => (
          line.purchasePrice === null
            ? line.procurementBudget === null
            : Math.abs(line.procurementBudget - line.needUnits * line.purchasePrice) < 0.001
        ))
      };
    });
    assert.strictEqual(forecast.horizon, 14, 'Procurement forecast must open with the operational 14-day scenario');
    assert.strictEqual(forecast.scenarioCount, 4, 'Forecast must expose 7/14/28/30-day scenarios');
    assert.ok(forecast.lineCount > 0, 'Current OOS fixture must produce procurement recommendations');
    assert.strictEqual(forecast.domLineCount, forecast.lineCount, 'Forecast table must render every priced recommendation');
    assert.ok(forecast.units > 0, 'Procurement forecast must calculate units');
    assert.ok(forecast.budget > 0, 'Procurement forecast must calculate a monetary budget');
    assert.strictEqual(forecast.safetyDays, 0, 'Forecast must default to exact procurement-program parity');
    assert.strictEqual(forecast.safetyUnits, 0, 'Default forecast must not silently add safety units');
    assert.strictEqual(forecast.effectiveDays, 14, 'Default effective horizon must equal the selected horizon');
    assert.ok(forecast.concentrationPct > 0, 'Forecast must calculate budget concentration by SKU');
    assert.ok(forecast.priceDateRows > 0, 'Forecast must expose purchase-price freshness where the registry provides it');
    assert.strictEqual(forecast.missingCostRows, 0, 'Current fixture must have a purchase price for every recommended line');
    assert.ok(forecast.parityOk, 'Safety 0 must preserve the exact procurement-program recommendation');
    assert.ok(forecast.arithmeticOk, 'Every procurement line must equal need units × purchase price');

    const lifecycleNeed = await page.evaluate(() => {
      const row = {
        avgDaily: 110.333,
        inStock: 2584,
        inTransit: 0,
        inRequest: 0,
        safetyStock: 0,
        rawNeed30: 726,
        targetNeed30: 0
      };
      return {
        target: window.orderProcurementNeedForDays(row, 30),
        raw: window.orderProcurementRawNeedForDays(row, 30)
      };
    });
    assert.deepStrictEqual(
      lifecycleNeed,
      { target: 0, raw: 726 },
      '30-day procurement must keep lifecycle-suppressed target need separate from raw blocked need'
    );

    await page.locator('#view-oos-control [data-oos-procurement-horizon="7"]').click();
    await page.waitForFunction(() => window.oosProcurementBuildModel().ui.horizon === 7);
    const urgentScenario = await page.evaluate(() => {
      const model = window.oosProcurementBuildModel();
      return { units: model.summary.needUnits, budget: model.summary.knownBudget };
    });
    assert.ok(urgentScenario.units <= forecast.units, '7-day scenario must not exceed the 14-day procurement quantity');
    assert.ok(urgentScenario.budget <= forecast.budget, '7-day scenario must not exceed the 14-day procurement budget');

    await page.locator('#view-oos-control [data-oos-procurement-horizon="14"]').click();
    await page.locator('#view-oos-control [data-oos-procurement-safety-days]').selectOption('7');
    await page.waitForFunction(() => window.oosProcurementBuildModel().ui.safetyDays === 7);
    const bufferedScenario = await page.evaluate(() => {
      const model = window.oosProcurementBuildModel();
      return {
        units: model.summary.needUnits,
        budget: model.summary.knownBudget,
        safetyUnits: model.summary.safetyUnits,
        effectiveDays: model.formulaPassport.effectiveDays,
        arithmeticOk: model.lines.every((line) => line.needUnits === line.baseNeedUnits + line.safetyUnits)
      };
    });
    assert.ok(bufferedScenario.units > forecast.units, 'Safety scenario must add units above exact program parity');
    assert.ok(bufferedScenario.budget > forecast.budget, 'Safety scenario must increase the procurement budget');
    assert.ok(bufferedScenario.safetyUnits > 0, 'Safety scenario must disclose the additional units');
    assert.strictEqual(bufferedScenario.effectiveDays, 21, '14-day horizon plus 7 safety days must cover 21 days');
    assert.ok(bufferedScenario.arithmeticOk, 'Every line must reconcile base need and disclosed safety units');

    const forecastSearch = page.locator('#view-oos-control [data-oos-procurement-search]');
    await forecastSearch.fill('gel');
    await page.waitForTimeout(300);
    const searchFocus = await page.evaluate(() => ({
      value: document.querySelector('#view-oos-control [data-oos-procurement-search]')?.value || '',
      active: document.activeElement?.matches?.('#view-oos-control [data-oos-procurement-search]') || false
    }));
    assert.strictEqual(searchFocus.value, 'gel');
    assert.strictEqual(searchFocus.active, true, 'Forecast search must retain focus after rerender');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('altea:data-ready', {
        detail: { view: 'oos-control', key: 'oosControl', lazy: true }
      }));
    });
    await page.waitForTimeout(350);
    const forecastShell = await page.evaluate(() => {
      const root = document.getElementById('view-oos-control');
      return {
        pageHead: root?.querySelectorAll(':scope > .page-head').length || 0,
        freshness: root?.querySelectorAll(':scope > .oos-freshness-notice').length || 0,
        tabs: root?.querySelectorAll(':scope > .oos-view-tabs').length || 0,
        board: root?.querySelectorAll(':scope > [data-oos-procurement]').length || 0,
        formula: root?.querySelectorAll(':scope > .oos-procurement-formula').length || 0
      };
    });
    assert.deepStrictEqual(forecastShell, {
      pageHead: 1,
      freshness: 1,
      tabs: 1,
      board: 1,
      formula: 1
    }, 'Route layer lock must preserve the procurement forecast shell');

    const source = fs.readFileSync(path.join(ROOT, 'app-core-11.js'), 'utf8');
    assert.match(
      source,
      /function oosControlRiskAmount\(row = \{\}\) \{\s+return Math\.max\(/,
      'OOS ranking must not add lost revenue to the same revenue-at-risk amount'
    );
    assert.doesNotMatch(
      source,
      /return numberOrZero\(row\.revenueAtRiskDay \|\| 0\) \+ numberOrZero\(row\.lostRevenueDay \|\| 0\)/,
      'OOS risk amount must not double-count current OOS'
    );

    ['index.html', 'live-index.html', 'docs/index.html'].forEach((fileName) => {
      const html = fs.readFileSync(path.join(ROOT, fileName), 'utf8');
      assert.ok(html.includes('app-core-01.js?v=20260724allstatuses2ooscorrectness2planfactlazywb1'), `${fileName} must cache-bust OOS loading`);
      assert.ok(html.includes('styles.css?v=20260724oosforecast1scenario1'), `${fileName} must cache-bust OOS forecast styles`);
      assert.ok(html.includes('app-core-09.js?v=20260620premiumshell4procurement1'), `${fileName} must cache-bust procurement need logic`);
      assert.ok(html.includes('app-core-11.js?v=20260724planfactcorrectness4oosforecast1scenario1planscope1'), `${fileName} must cache-bust OOS logic without discarding the plan-fact correctness cache version`);
      assert.ok(html.includes('portal-route-layer-lock.js?v=20260724oosforecast2'), `${fileName} must cache-bust the route lock`);
      assert.ok(html.includes('portal-snapshot-refresh-hotfix.js?v=20260724ooscorrectness3ui23planfactlazywb1'), `${fileName} must cache-bust OOS refresh scope`);
    });

    assert.deepStrictEqual(pageErrors, []);
    console.log('portal-oos-control-correctness selftest: ok');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
