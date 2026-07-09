#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DEFAULT_URL = 'http://127.0.0.1:4187/index.html';
const GUEST_EMAIL = 'guest@qeep.life';
const GUEST_PASSWORD = 'NihsS%Hn_uE#kXBfcX!e';
const STORAGE_KEY = 'brand-portal-local-v1';
const ACADEMY_STORAGE_KEY = 'altea.academy.progress.v1';

const TARGET_VIEWS = [
  { view: 'executive', label: 'Executive' },
  { view: 'control', label: 'Tasks' },
  { view: 'data-health', label: 'Calendar' }
];

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
  await page.waitForFunction(() => !document.body.classList.contains('portal-auth-locked'), undefined, { timeout: 30000 });
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

async function closeAcademyDrawerIfOpen(page) {
  await page.evaluate(() => {
    document.querySelector('.academy-drawer-backdrop')?.remove();
    document.querySelector('.academy-drawer')?.remove();
  }).catch(() => {});
}

async function clickView(page, view) {
  await closeAcademyDrawerIfOpen(page);
  const selector = `[data-premium-nav="${view}"], .nav-btn[data-view="${view}"]`;
  const count = await page.locator(selector).count();
  if (!count) throw new Error(`Navigation button not found: ${view}`);

  const alreadyActive = await page.evaluate((targetView) => Boolean(
    document.querySelector(`[data-premium-nav="${targetView}"].is-active`)
      || document.querySelector(`#view-${targetView}`)?.classList.contains('active')
      || document.querySelector(`[data-premium-stage="${targetView}"].is-active`)
      || document.querySelector('#altea-premium-app')?.getAttribute('data-premium-active-route') === targetView
  ), view).catch(() => false);

  if (!alreadyActive) {
    const premiumNav = page.locator(`[data-premium-nav="${view}"]`).first();
    if (await premiumNav.count().then(Boolean).catch(() => false)) {
      await premiumNav.waitFor({ state: 'visible', timeout: 10000 });
      await premiumNav.click({ timeout: 10000, noWaitAfter: true });
    } else {
      const nav = page.locator(`.nav-btn[data-view="${view}"]`).first();
      await nav.waitFor({ state: 'visible', timeout: 10000 });
      await nav.click({ timeout: 10000, noWaitAfter: true });
    }
    await page.waitForTimeout(400);
  }

  const active = await page.evaluate((targetView) => Boolean(
    document.querySelector(`[data-premium-nav="${targetView}"].is-active`)
      || document.querySelector(`#view-${targetView}`)?.classList.contains('active')
      || document.querySelector(`[data-premium-stage="${targetView}"].is-active`)
      || document.querySelector('#altea-premium-app')?.getAttribute('data-premium-active-route') === targetView
  ), view).catch(() => false);

  if (!active) {
    await page.evaluate((targetView) => {
      if (typeof window.setView === 'function') {
        window.setView(targetView, { persist: true, syncHash: true });
        return;
      }
      document.querySelectorAll('.nav-btn[data-view], [data-premium-nav]').forEach((button) => {
        const buttonView = button.getAttribute('data-view') || button.getAttribute('data-premium-nav');
        button.classList.toggle('active', buttonView === targetView);
        button.classList.toggle('is-active', buttonView === targetView);
      });
      document.querySelectorAll('.view, .portal-view-shell, [data-premium-stage]').forEach((section) => {
        section.classList.toggle('active', section.id === `view-${targetView}`);
        section.classList.toggle('is-active', section.getAttribute('data-premium-stage') === targetView);
      });
      window.dispatchEvent(new CustomEvent('altea:viewchange', { detail: { view: targetView } }));
    }, view);
  }
  await page.waitForFunction((targetView) => (
    document.querySelector(`#view-${targetView}`)?.classList.contains('active')
    || document.querySelector(`[data-premium-stage="${targetView}"]`)?.classList.contains('is-active')
    || document.querySelector('#altea-premium-app')?.getAttribute('data-premium-active-route') === targetView
  ), view, { timeout: 12000 });
}

async function waitForViewReady(page, view) {
  await page.waitForFunction((targetView) => {
    const premiumContent = document.querySelector('.altea-premium-app:not([hidden]) [data-premium-content]');
    const premiumNav = document.querySelector(`[data-premium-nav="${targetView}"].is-active`);
    const premium = document.querySelector(`[data-premium-stage="${targetView}"].is-active`);
    const root = (premiumNav && premiumContent) ? premiumContent : (premium || document.querySelector(`#view-${targetView}`));
    if (!root) return false;
    if (!premiumNav && !premium && !root.classList.contains('active')) return false;
    const textLength = ((root.innerText || root.textContent) || '').trim().length;
    const hasUsableSurface = root.children.length > 0
      && (textLength > 80 || root.querySelector('button, table, .data-table, [data-task-calendar-design-v1]'));
    const stillBooting = root.querySelector('[data-task-loading="boot"], [data-task-loading="team"]');
    return hasUsableSurface && !stillBooting;
  }, view, { timeout: 30000 });
  await page.waitForTimeout(1000);
}

async function summarizeView(page, view) {
  return page.evaluate((targetView) => {
    const premiumContent = document.querySelector('.altea-premium-app:not([hidden]) [data-premium-content]');
    const premiumNav = document.querySelector(`[data-premium-nav="${targetView}"].is-active`);
    const premium = document.querySelector(`[data-premium-stage="${targetView}"].is-active`);
    const root = (premiumNav && premiumContent) ? premiumContent : (premium || document.querySelector(`#view-${targetView}`));
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
      const isAcademyControl = await locator.evaluate((node) => Boolean(
        node.closest('.academy-entry-overlay,.academy-drawer')
          || node.matches('[data-academy-help-button],.academy-help-btn,.academy-btn,[data-academy-drawer-close]')
      )).catch(() => false);
      if (isAcademyControl) continue;
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

async function completeAcademyIfPresent(page, outputDir) {
  const result = {
    shown: false,
    overlayHasRealTargets: false,
    quizCompleted: false,
    helpButtonReady: false,
    drawerReady: false,
    screenshot: ''
  };

  const shown = await page.waitForSelector('.academy-entry-overlay', { state: 'visible', timeout: 16000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return result;

  result.shown = true;
  await page.waitForFunction(() => {
    const spotlight = document.querySelector('.academy-spotlight-hole');
    const rect = spotlight?.getBoundingClientRect();
    return Boolean(rect && rect.width > 20 && rect.height > 20);
  }, undefined, { timeout: 7000 }).catch(() => {});
  result.overlayHasRealTargets = await page.evaluate(() => {
    const overlay = document.querySelector('.academy-entry-overlay');
    const spotlight = document.querySelector('.academy-spotlight-hole');
    const nav = document.querySelector('.nav-btn[data-view], [data-premium-nav]');
    const rect = spotlight?.getBoundingClientRect();
    return Boolean(
      overlay
      && spotlight
      && nav
      && window.alteaAcademyTour?.targets?.navButton
      && rect
      && rect.width > 20
      && rect.height > 20
    );
  }).catch(() => false);

  result.screenshot = path.join(outputDir, 'academy-tour.png');
  await page.screenshot({ path: result.screenshot, fullPage: false });
  await page.locator('[data-academy-action="skip-tour"]').first().click({ timeout: 10000 });
  await page.waitForSelector('.academy-entry-overlay--quiz', { state: 'visible', timeout: 10000 });

  const correctAnswers = {
    'repricer-min-price': 'min-price',
    'prices-mismatch': 'check-source',
    'launch-workflow': 'checklist',
    'heavy-data': 'partial'
  };

  for (const [question, answer] of Object.entries(correctAnswers)) {
    const label = page.locator(`[data-academy-question="${question}"] label:has(input[value="${answer}"])`);
    const labelCount = await label.count();
    if (labelCount !== 1) throw new Error(`Academy answer label not found: ${question}/${answer}`);
    await label.click({ timeout: 5000 });
    const checked = await page.evaluate(({ questionId, answerId }) => {
      const input = document.querySelector(`[data-academy-question="${questionId}"] input[value="${answerId}"]`);
      return Boolean(input?.checked);
    }, { questionId: question, answerId: answer });
    if (!checked) throw new Error(`Academy answer click did not check radio: ${question}/${answer}`);
  }
  await page.locator('[data-academy-action="check-quiz"]').click({ timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('.academy-entry-overlay'), undefined, { timeout: 10000 });

  result.quizCompleted = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Boolean(parsed?.completedAt && parsed?.quizPassedAt);
  }, ACADEMY_STORAGE_KEY).catch(() => false);

  await clickView(page, 'repricer');
  await waitForViewReady(page, 'repricer');
  result.helpButtonReady = await page.waitForFunction(() => Boolean(
    document.querySelector('[data-academy-help-button="repricer"]')
  ), undefined, { timeout: 12000 }).then(() => true).catch(() => false);

  if (result.helpButtonReady) {
    await page.locator('[data-academy-help-button="repricer"]').first().click({ timeout: 5000 });
    result.drawerReady = await page.waitForFunction(() => {
      const drawer = document.querySelector('.academy-drawer');
      return Boolean(drawer && /Репрайсер/.test(drawer.textContent || '') && /Что смотреть/.test(drawer.textContent || ''));
    }, undefined, { timeout: 7000 }).then(() => true).catch(() => false);
    await page.locator('[data-academy-drawer-close]').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.academy-drawer-backdrop,.academy-drawer'), undefined, { timeout: 4000 })
      .catch(() => page.evaluate(() => {
        document.querySelector('.academy-drawer-backdrop')?.remove();
        document.querySelector('.academy-drawer')?.remove();
      }));
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url || process.env.PORTAL_TABS_URL || DEFAULT_URL;
  const outputDir = path.resolve(args.outputDir || path.join('tmp_screens', `portal-tabs-smoke-${Date.now()}`));
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: args.headful !== true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(20000);
  await page.addInitScript((key) => {
    try { localStorage.removeItem(key); } catch (_) {}
  }, ACADEMY_STORAGE_KEY);

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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const authenticated = await authenticateIfNeeded(page);
    await waitForApp(page);
    const academy = await completeAcademyIfPresent(page, outputDir);

    const summaries = [];
    const failures = [];
    if (!academy.shown) failures.push('Academy tour did not appear after first portal entry');
    if (academy.shown && !academy.overlayHasRealTargets) failures.push('Academy tour did not expose a real DOM spotlight target');
    if (academy.shown && !academy.quizCompleted) failures.push('Academy quiz did not save completion progress');
    if (academy.shown && !academy.helpButtonReady) failures.push('Academy help button was not inserted into repricer view');
    if (academy.shown && !academy.drawerReady) failures.push('Academy drawer did not open repricer content');

    for (const target of TARGET_VIEWS) {
      await clickView(page, target.view);
      await waitForViewReady(page, target.view);
      const summary = await summarizeView(page, target.view);
      const screenshot = path.join(outputDir, `${target.view}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      summary.screenshot = screenshot;
      summaries.push(summary);
      failures.push(...validateSummary(summary, target.label));
    }

    const clickChecks = [];
    await clickView(page, 'executive');
    await waitForViewReady(page, 'executive');
    clickChecks.push(await clickIfPresent(page, [
      '[data-premium-stage="executive"].is-active button:not([disabled])',
      '[data-premium-content] button:not([disabled])',
      '#view-executive.active button:not([disabled])'
    ], 'executive-primary-button'));

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
      academy,
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
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
