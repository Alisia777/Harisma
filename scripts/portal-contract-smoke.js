#!/usr/bin/env node

const { chromium } = require('playwright');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const next = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined && next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function isLocalUrl(url) {
  try {
    const parsed = new URL(url);
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isOptionalLocalMiss(url) {
  return /\/\.altea-google-sheet-sync-output\//i.test(String(url || ''))
    || /favicon\.ico/i.test(String(url || ''));
}

async function clickView(page, view) {
  const selector = `.nav-btn[data-view="${view}"]`;
  const locator = page.locator(selector).first();
  const count = await page.locator(selector).count();
  if (!count) throw new Error(`Navigation button not found: ${view}`);
  const isActive = await locator.evaluate((button) => button.classList.contains('active'));
  if (!isActive) await locator.evaluate((button) => button.click(), undefined, { timeout: 30000 });
  await page.waitForTimeout(1000);
}

async function assertVisible(page, selector, label) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 8000 });
  const box = await locator.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) throw new Error(`${label} is not visible`);
}

async function waitForSkuData(page) {
  await page.waitForFunction(() => (
    window.__alteaAppState?.boot?.dataReady === true
    && Array.isArray(window.__alteaAppState?.skus)
    && window.__alteaAppState.skus.length > 0
  ), undefined, { timeout: 60000 });
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url || process.env.PORTAL_CONTRACT_URL || 'http://127.0.0.1:4187/index.html';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(20000);
  const pageErrors = [];
  const failedLocal = [];

  try {
    page.on('pageerror', (error) => pageErrors.push(error.message || String(error)));
    page.on('response', (response) => {
      const status = response.status();
      const responseUrl = response.url();
      if (status >= 400 && isLocalUrl(responseUrl) && !isOptionalLocalMiss(responseUrl)) {
        failedLocal.push(`${status} ${responseUrl}`);
      }
    });
    page.on('requestfailed', (request) => {
      const requestUrl = request.url();
      if (isLocalUrl(requestUrl) && !isOptionalLocalMiss(requestUrl)) {
        failedLocal.push(`failed ${requestUrl}: ${request.failure()?.errorText || 'unknown'}`);
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => window.__alteaAppState && window.__alteaAppState.boot, undefined, { timeout: 12000 });
    await waitForSkuData(page);
    await clickView(page, 'dashboard');
    await assertVisible(page, '#view-dashboard', 'dashboard');
    await waitForSkuData(page);

    const initial = await page.evaluate(() => ({
      skus: Array.isArray(window.__alteaAppState?.skus) ? window.__alteaAppState.skus.length : 0,
      dashboardCards: Array.isArray(window.__alteaAppState?.dashboard?.cards) ? window.__alteaAppState.dashboard.cards.length : 0,
      syncHealthLoaded: Boolean(window.__alteaAppState?.syncHealth)
    }));
    if (initial.skus <= 0) throw new Error('SKU data did not load.');

    await clickView(page, 'sku-plan-fact');
    await assertVisible(page, '#view-sku-plan-fact', 'SKU plan-fact');
    const planFactOk = await page.evaluate(() => Boolean(
      document.querySelector('#view-sku-plan-fact [data-sku-plan-fact-quality-export]')
      || document.querySelector('#view-sku-plan-fact [data-sku-plan-fact-quality-import]')
      || document.querySelector('#view-sku-plan-fact .sku-plan-fact-card')
    ));
    if (!planFactOk) throw new Error('Plan-fact quality controls did not render.');

    await clickView(page, 'sku-contour');
    await assertVisible(page, '#view-sku-contour', 'SKU contour');
    const contourOk = await page.evaluate(() => Boolean(
      document.querySelector('#view-sku-contour [data-sku-contour-quality-export]')
      && document.querySelector('#view-sku-contour [data-sku-contour-quality-import]')
    ));
    if (!contourOk) throw new Error('SKU contour controls did not render.');

    await clickView(page, 'skus');
    await assertVisible(page, '#view-skus', 'SKU registry');
    const registryOk = await page.evaluate(() => Boolean(
      document.querySelector('#view-skus table')
      || document.querySelector('#view-skus .data-table')
      || document.querySelector('#view-skus .card')
    ));
    if (!registryOk) throw new Error('SKU registry did not render a usable surface.');

    await clickView(page, 'prices');
    await assertVisible(page, '#view-prices', 'prices');
    await page.waitForFunction(() => {
      const root = document.querySelector('#view-prices');
      return root && (root.children.length > 0 || (root.textContent || '').trim().length > 20);
    }, null, { timeout: 12000 });
    const pricesOk = await page.evaluate(() => Boolean(
      document.querySelector('#view-prices table')
      || document.querySelector('#view-prices .data-table')
      || document.querySelector('#view-prices .card')
      || (document.querySelector('#view-prices')?.children.length || 0) > 0
    ));
    if (!pricesOk) throw new Error('Prices view did not render a usable surface.');

    await clickView(page, 'repricer');
    await assertVisible(page, '#view-repricer', 'repricer');

    if (pageErrors.length || failedLocal.length) {
      throw new Error(JSON.stringify({ pageErrors, failedLocal }, null, 2));
    }

    console.log(JSON.stringify({
      ok: true,
      url,
      initial
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
