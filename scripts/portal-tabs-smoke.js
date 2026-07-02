#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const DEFAULT_URL = 'http://127.0.0.1:4187/index.html';
const GUEST_EMAIL = 'guest@qeep.life';
const GUEST_PASSWORD = 'NihsS%Hn_uE#kXBfcX!e';
const STORAGE_KEY = 'brand-portal-local-v1';

const TARGET_VIEWS = [
  { view: 'executive', label: 'Executive' },
  { view: 'control', label: 'Tasks' },
  { view: 'data-health', label: 'Calendar' }
];
const VIEW_LABELS = {
  executive: 'Executive',
  control: 'Tasks',
  'data-health': 'Calendar',
  prices: 'Prices',
  repricer: 'Repricer',
  order: 'Order procurement',
  'oos-control': 'OOS control',
  'sku-plan-fact': 'SKU plan fact',
  'sku-contour': 'SKU workspace',
  'iu-drr': 'IU/DRR'
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.gz': 'application/gzip'
};

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function resolveTargetViews(rawViews = '') {
  const raw = String(rawViews || '').trim();
  if (!raw) return TARGET_VIEWS;
  const views = raw.split(',')
    .map((view) => view.trim())
    .filter(Boolean);
  return views.length
    ? views.map((view) => ({ view, label: VIEW_LABELS[view] || view }))
    : TARGET_VIEWS;
}

function safeDecodePathname(pathname = '/') {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return '/';
  }
}

function createStaticPortalServer(rootDir = process.cwd()) {
  const rootPath = path.resolve(rootDir);
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const rawPath = safeDecodePathname(requestUrl.pathname || '/');
    const relativePath = rawPath === '/' ? 'index.html' : rawPath.replace(/^[/\\]+/, '');
    const filePath = path.resolve(rootPath, relativePath);
    const insideRoot = filePath === rootPath || filePath.startsWith(`${rootPath}${path.sep}`);

    if (!insideRoot) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    fs.readFile(filePath, (error, buffer) => {
      if (error) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, { 'content-type': type });
      if (request.method === 'HEAD') response.end();
      else response.end(buffer);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/index.html`
      });
    });
  });
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
  const value = String(url || '');
  return /favicon\.ico/i.test(value)
    || /\/data\/portal_dashboard_metrics\.json/i.test(value)
    || /\/data\/smart_price_overlay\.json/i.test(value)
    || /\/assets\/altea-portal-all-themes\/.*\/motion\//i.test(value)
    || /portal-shell-customizer-v2/i.test(value)
    || /portal-workspaces-general-to-detail-v1/i.test(value)
    || /altea-motion-runtime/i.test(value)
    || /portal-security-audit/i.test(value)
    || /portal-leaderboard-motion-v2/i.test(value)
    || /portal-general-to-detail-v2/i.test(value)
    || /portal-planfact-general-to-detail-v4/i.test(value);
}

async function authenticateIfNeeded(page) {
  const emailInput = page.locator('#portalAuthEmail').first();
  const needsAuth = await emailInput.count().then(Boolean).catch(() => false);
  if (!needsAuth) return false;

  await emailInput.fill(GUEST_EMAIL);
  await page.locator('#portalAuthPassword').fill(GUEST_PASSWORD);
  await page.locator('#portalAuthSubmit').click();
  await page.waitForFunction(() => !document.body.classList.contains('portal-auth-locked'), undefined, { timeout: 20000 });
  return true;
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    window.__alteaAppState?.boot?.dataReady === true
    && Array.isArray(window.__alteaAppState?.skus)
    && window.__alteaAppState.skus.length > 0
  ), undefined, { timeout: 60000 });
  await page.waitForTimeout(1000);
}

async function clickView(page, view) {
  const alreadyActive = await page.evaluate((targetView) => Boolean(
    document.querySelector(`[data-premium-nav="${targetView}"].is-active`)
      || document.querySelector(`#view-${targetView}`)?.classList.contains('active')
      || document.querySelector(`[data-premium-stage="${targetView}"].is-active`)
  ), view).catch(() => false);
  if (alreadyActive) return;

  const premiumNav = page.locator(`[data-premium-nav="${view}"]`).first();
  if (await premiumNav.count().then(Boolean).catch(() => false)) {
    await premiumNav.waitFor({ state: 'visible', timeout: 10000 });
    await premiumNav.click({ timeout: 10000 });
  } else {
    const nav = page.locator(`.nav-btn[data-view="${view}"]`).first();
    await nav.waitFor({ state: 'visible', timeout: 10000 });
    await nav.click({ timeout: 10000 });
  }
  await page.waitForFunction((targetView) => (
    document.querySelector(`#view-${targetView}`)?.classList.contains('active')
    || document.querySelector(`[data-premium-stage="${targetView}"]`)?.classList.contains('is-active')
  ), view, { timeout: 12000 });
}

async function waitForViewReady(page, view) {
  await page.waitForFunction((targetView) => {
    const premiumContent = document.querySelector('.altea-premium-app:not([hidden]) [data-premium-content]');
    const premiumNav = document.querySelector(`[data-premium-nav="${targetView}"].is-active`);
    const premium = document.querySelector(`[data-premium-stage="${targetView}"].is-active`);
    const root = premium || ((premiumNav && premiumContent) ? premiumContent : document.querySelector(`#view-${targetView}`));
    if (!root) return false;
    if (!premiumNav && !premium && !root.classList.contains('active')) return false;
    const textLength = ((root.innerText || root.textContent) || '').trim().length;
    const text = ((root.innerText || root.textContent) || '').trim().toLowerCase();
    const visibleButtons = Array.from(root.querySelectorAll('button')).filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }).length;
    const hasUsableSurface = root.children.length > 0
      && (textLength > 80 || root.querySelector('button, table, .data-table, [data-task-calendar-design-v1]'));
    const stillBooting = root.querySelector('[data-task-loading="boot"], [data-task-loading="team"]');
    const stillLoadingText = /подтягиваю данные|загрузка данных|loading/.test(text);
    const viewLoadingText = stillLoadingText
      || /подгружаем данные|загрузка данных|контур пока не получил|нужно дождаться|подключаю фактические|демонстрационные цифры/.test(text);
    if (targetView === 'repricer') {
      let repricerRows = 0;
      try {
        repricerRows = typeof window.buildRepricerRows === 'function' ? window.buildRepricerRows().length : 0;
      } catch (_) {
        repricerRows = 0;
      }
      return hasUsableSurface && !stillBooting && !viewLoadingText && repricerRows > 0 && visibleButtons > 0;
    }
    if (targetView === 'iu-drr') {
      return hasUsableSurface && !stillBooting && !viewLoadingText && textLength > 300 && visibleButtons > 0;
    }
    return hasUsableSurface && !stillBooting && !viewLoadingText;
  }, view, { timeout: 60000 });
  await page.waitForTimeout(1000);
}

async function summarizeView(page, view) {
  return page.evaluate((targetView) => {
    const premiumContent = document.querySelector('.altea-premium-app:not([hidden]) [data-premium-content]');
    const premiumNav = document.querySelector(`[data-premium-nav="${targetView}"].is-active`);
    const premium = document.querySelector(`[data-premium-stage="${targetView}"].is-active`);
    const root = premium || ((premiumNav && premiumContent) ? premiumContent : document.querySelector(`#view-${targetView}`));
    const text = ((root?.innerText || root?.textContent) || '').trim();
    const buttons = Array.from(root?.querySelectorAll('button') || []);
    const visibleButtons = buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });

    return {
      view: targetView,
      active: Boolean(premiumNav || premium || root?.classList.contains('active')),
      childCount: root?.children.length || 0,
      textLength: text.length,
      buttonCount: visibleButtons.length,
      disabledButtonCount: visibleButtons.filter((button) => button.disabled).length,
      formControlCount: root?.querySelectorAll('input, select, textarea').length || 0,
      tableCount: root?.querySelectorAll('table, .data-table').length || 0,
      cardCount: root?.querySelectorAll('.card, [class*="card"], .task-mini, .task-card, [data-task-card]').length || 0,
      hasTaskDesign: Boolean(root?.querySelector('[data-task-calendar-design-v1]')),
      appError: document.querySelector('#appError')?.textContent || '',
      appErrorClass: document.querySelector('#appError')?.className || '',
      textStart: text.slice(0, 240)
    };
  }, view);
}

function validateSummary(summary, label) {
  const failures = [];
  if (!summary.active) failures.push(`${label} view is not active`);
  if (summary.childCount <= 0) failures.push(`${label} view is empty`);
  if (summary.textLength <= 80) failures.push(`${label} view text is too small (${summary.textLength})`);
  if (summary.buttonCount <= 0) failures.push(`${label} view has no visible buttons`);
  if (isErrorBanner(summary.appError, summary.appErrorClass)) {
    failures.push(`${label} app error banner: ${summary.appError}`);
  }
  if (summary.view === 'control' && !summary.hasTaskDesign && summary.cardCount <= 0) {
    failures.push('Tasks view did not render task design or cards');
  }
  if (summary.view === 'data-health' && summary.formControlCount <= 0 && summary.buttonCount <= 0) {
    failures.push('Calendar view did not render controls');
  }
  return failures;
}

function isErrorBanner(text, className) {
  const value = String(text || '').toLowerCase();
  const classes = String(className || '').toLowerCase();
  return /danger|error/.test(classes)
    || /error|failed|\u043e\u0448\u0438\u0431|\u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c/.test(value);
}

async function clickIfPresent(page, selectors, label) {
  for (const selector of selectors) {
    const all = page.locator(selector);
    const count = await all.count().catch(() => 0);
    if (!count) continue;
    const limit = Math.min(count, 12);
    for (let index = 0; index < limit; index += 1) {
      const locator = all.nth(index);
      const visible = await locator.isVisible().catch(() => false);
      if (!visible) continue;
      const started = Date.now();
      try {
        await locator.click({ timeout: 8000 });
        await page.waitForTimeout(800);
        const state = await page.evaluate(() => ({
          appState: Boolean(window.__alteaAppState),
          activeViews: Array.from(document.querySelectorAll('.view.active')).map((node) => node.id),
          activePremiumStage: document.querySelector('[data-premium-stage].is-active')?.getAttribute('data-premium-stage') || '',
          modalOpen: Boolean(document.querySelector('.modal.open, #taskModal.open, #skuModal.open')),
          appError: document.querySelector('#appError')?.textContent || '',
          appErrorClass: document.querySelector('#appError')?.className || ''
        }));
        await page.keyboard.press('Escape').catch(() => {});
        await page.locator('#taskModal [data-close-task-modal], #skuModal [data-close-modal], .modal.open button').first().click({ timeout: 1500 }).catch(() => {});
        return { label, selector, index, ok: state.appState && !isErrorBanner(state.appError, state.appErrorClass), ms: Date.now() - started, state };
      } catch (error) {
        if (index === limit - 1) {
          return { label, selector, index, ok: false, ms: Date.now() - started, error: error.message };
        }
      }
    }
  }
  return { label, ok: false, missing: true, selectors };
}

async function main() {
  const args = parseArgs(process.argv);
  let staticServer = null;
  let url = args.url || process.env.PORTAL_TABS_URL || DEFAULT_URL;
  if (args.serve || process.env.PORTAL_TABS_SERVE === '1') {
    staticServer = await createStaticPortalServer(process.cwd());
    if (!args.url && !process.env.PORTAL_TABS_URL) url = staticServer.url;
  }
  const targetViews = resolveTargetViews(args.views || process.env.PORTAL_TABS_VIEWS || '');
  const outputDir = path.resolve(args.outputDir || path.join('tmp_screens', `portal-tabs-smoke-${Date.now()}`));
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: args.headful !== true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(90000);

  const pageErrors = [];
  const consoleIssues = [];
  const failedLocal = [];

  page.on('pageerror', (error) => pageErrors.push(error.message || String(error)));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleIssues.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('response', (response) => {
    const responseUrl = response.url();
    if (response.status() >= 400 && isLocalUrl(responseUrl) && !isOptionalLocalMiss(responseUrl)) {
      failedLocal.push(`${response.status()} ${responseUrl}`);
    }
  });
  page.on('requestfailed', (request) => {
    const requestUrl = request.url();
    const failureText = request.failure()?.errorText || 'unknown';
    if (/ERR_ABORTED/i.test(failureText)) return;
    if (isLocalUrl(requestUrl) && !isOptionalLocalMiss(requestUrl)) {
      failedLocal.push(`failed ${requestUrl}: ${failureText}`);
    }
  });

  const originalStorage = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY).catch(() => null);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const authenticated = await authenticateIfNeeded(page);
    await waitForApp(page);

    const summaries = [];
    const failures = [];
    for (const target of targetViews) {
      await clickView(page, target.view);
      await waitForViewReady(page, target.view);
      const summary = await summarizeView(page, target.view);
      const screenshot = path.join(outputDir, `${target.view}.png`);
      await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled', timeout: 30000 });
      summary.screenshot = screenshot;
      summaries.push(summary);
      failures.push(...validateSummary(summary, target.label));
    }

    const clickChecks = [];
    const selectedViews = new Set(targetViews.map((target) => target.view));
    if (selectedViews.has('executive')) {
      await clickView(page, 'executive');
      await waitForViewReady(page, 'executive');
      clickChecks.push(await clickIfPresent(page, [
        '[data-premium-stage="executive"].is-active button:not([disabled])',
        '[data-premium-content] button:not([disabled])',
        '#view-executive.active button:not([disabled])'
      ], 'executive-primary-button'));
    }

    if (selectedViews.has('control')) {
      await clickView(page, 'control');
      await waitForViewReady(page, 'control');
      clickChecks.push(await clickIfPresent(page, [
        '[data-premium-stage="control"].is-active [data-open-task]',
        '[data-premium-stage="control"].is-active button:not([disabled])',
        '[data-premium-content] [data-open-task]',
        '[data-premium-content] button:not([disabled])',
        '#view-control.active [data-open-task]',
        '#view-control.active button:not([disabled])'
      ], 'tasks-open-button'));
    }

    if (selectedViews.has('data-health')) {
      await clickView(page, 'data-health');
      await waitForViewReady(page, 'data-health');
      clickChecks.push(await clickIfPresent(page, [
        '[data-premium-stage="data-health"].is-active [data-health-refresh]',
        '[data-premium-stage="data-health"].is-active button:not([disabled])',
        '[data-premium-content] [data-health-refresh]',
        '[data-premium-content] button:not([disabled])',
        '#view-data-health.active [data-health-refresh]',
        '#view-data-health.active button:not([disabled])'
      ], 'calendar-primary-button'));
    }

    for (const check of clickChecks) {
      if (!check.ok) failures.push(`${check.label} failed: ${check.error || (check.missing ? 'missing' : 'not ok')}`);
    }
    if (pageErrors.length) failures.push(`page errors: ${pageErrors.join(' | ')}`);
    if (failedLocal.length) failures.push(`local request failures: ${failedLocal.join(' | ')}`);

    const report = {
      ok: failures.length === 0,
      url,
      authenticated,
      outputDir,
      summaries,
      clickChecks,
      pageErrors,
      failedLocal,
      consoleIssues: consoleIssues.slice(-50)
    };

    console.log(JSON.stringify(report, null, 2));
    if (failures.length) {
      console.error(`portal-tabs-smoke failed:\n- ${failures.join('\n- ')}`);
      process.exitCode = 1;
    }
  } finally {
    await page.evaluate(({ key, value }) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }, { key: STORAGE_KEY, value: originalStorage }).catch(() => {});
    await browser.close();
    if (staticServer?.server) await new Promise((resolve) => staticServer.server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
