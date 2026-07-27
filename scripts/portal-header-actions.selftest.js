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
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
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
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function unlockPortal(page) {
  await page.waitForFunction(() => Boolean(window.alteaPortalAuthGate), null, { timeout: 30000 });
  await page.evaluate(async () => {
    window.__ALTEA_PORTAL_ACCESS__ = {
      email: 'header-actions.selftest@qeep.life',
      roles: ['employee'],
      allowedViews: ['dashboard']
    };
    document.body.classList.remove('portal-auth-locked');
    document.getElementById('portalAuthScreen')?.remove();
    await window.alteaPortalAuthGate.loadDelayedScripts();
    window.dispatchEvent(new Event('focus'));
  });
}

async function installActionSpies(page) {
  await page.evaluate(() => {
    window.__HEADER_ACTION_SELFTEST__ = { pull: 0, push: 0, signOut: 0 };
    window.pullRemoteState = async function pullRemoteStateSpy(rerender) {
      assertBoolean(rerender);
      window.__HEADER_ACTION_SELFTEST__.pull += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    };
    window.pushStateToRemote = async function pushStateToRemoteSpy() {
      window.__HEADER_ACTION_SELFTEST__.push += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    };
    try {
      pullRemoteState = window.pullRemoteState;
      pushStateToRemote = window.pushStateToRemote;
    } catch (error) {}
    window.alteaPortalAuthGate.signOut = async function signOutSpy() {
      window.__HEADER_ACTION_SELFTEST__.signOut += 1;
    };

    function assertBoolean(value) {
      if (value !== true) throw new Error(`pullRemoteState must receive true, got ${String(value)}`);
    }
  });
}

async function clickAction(page, proxy, counter, expected) {
  const selector = `.altea-premium-app:not([hidden]) [data-premium-proxy="${proxy}"]`;
  await page.locator(selector).click({ timeout: 30000 });
  if (proxy !== 'portalAuthSignOutBtn') {
    try {
      await page.waitForFunction(
        ({ target, name, count }) => {
          const button = document.querySelector(target);
          return button?.dataset?.premiumActionState === 'busy'
            || window.__HEADER_ACTION_SELFTEST__?.[name] === count;
        },
        { target: selector, name: counter, count: expected },
        { timeout: 5000 }
      );
    } catch (error) {
      const diagnostic = await page.evaluate(({ target, name }) => {
        const button = document.querySelector(target);
        return {
          text: button?.textContent || '',
          disabled: Boolean(button?.disabled),
          state: button?.dataset?.premiumActionState || '',
          busy: button?.dataset?.premiumActionBusy || '',
          token: button?.dataset?.premiumActionToken || '',
          counter: window.__HEADER_ACTION_SELFTEST__?.[name]
        };
      }, { target: selector, name: counter });
      throw new Error(`${error.message}; ${proxy}: ${JSON.stringify(diagnostic)}`);
    }
  }
  await page.waitForFunction(
    ({ name, count }) => window.__HEADER_ACTION_SELFTEST__?.[name] === count,
    { name: counter, count: expected },
    { timeout: 5000 }
  );
  if (proxy !== 'portalAuthSignOutBtn') {
    try {
      await page.waitForFunction(
        (target) => {
          const button = document.querySelector(target);
          return button && !button.disabled && button.dataset.premiumActionBusy !== '1';
        },
        selector,
        { timeout: 5000 }
      );
    } catch (error) {
      const diagnostic = await page.evaluate((target) => {
        const button = document.querySelector(target);
        return {
          text: button?.textContent || '',
          disabled: Boolean(button?.disabled),
          state: button?.dataset?.premiumActionState || '',
          busy: button?.dataset?.premiumActionBusy || '',
          token: button?.dataset?.premiumActionToken || ''
        };
      }, selector);
      throw new Error(`${error.message}; restore ${proxy}: ${JSON.stringify(diagnostic)}`);
    }
  }
}

async function openAndCloseHelp(page) {
  const help = page.locator('.altea-premium-app:not([hidden]) [data-academy-global-help]');
  await help.click({ timeout: 30000 });
  await page.waitForSelector('.academy-drawer', { state: 'visible', timeout: 5000 });
  await page.locator('[data-academy-drawer-close]').click({ timeout: 5000 });
  await page.waitForSelector('.academy-drawer', { state: 'detached', timeout: 5000 });
}

async function replaceDashboardAndTopbar(page) {
  await page.evaluate(() => {
    const dashboard = window.__ALTEA_DASHBOARD_CEO_MOTION_V1__;
    if (!dashboard || typeof dashboard.render !== 'function') {
      throw new Error('Dashboard renderer is not ready');
    }
    dashboard.render();

    const topbar = document.querySelector('.altea-premium-app:not([hidden]) .altea-premium-shell-topbar');
    if (!topbar) throw new Error('Premium topbar is not ready');
    topbar.replaceWith(topbar.cloneNode(true));
  });

  // Give MutationObserver-based repairs enough time to process the replacement.
  await page.waitForTimeout(250);
  await page.waitForSelector('.altea-premium-app:not([hidden]) .ceo-motion-v1', { timeout: 30000 });
}

async function run() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });

  try {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('altea-portal-active-view-v1', JSON.stringify({
        activeView: 'dashboard',
        updatedAt: new Date().toISOString()
      }));
      localStorage.setItem('altea.portal.marketplace', 'all');
    });
    await page.goto(`http://127.0.0.1:${port}/index.html#dashboard`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await unlockPortal(page);
    await page.waitForSelector('.altea-premium-app:not([hidden]) .ceo-motion-v1', { timeout: 60000 });
    await page.waitForSelector('.altea-premium-app:not([hidden]) [data-academy-global-help]', { timeout: 30000 });
    await installActionSpies(page);

    assert.match(
      (await page.locator('[data-premium-base-action]').innerText()).trim(),
      /баз/i,
      'team database status must be a clear database action'
    );
    await clickAction(page, 'syncStatusBadge', 'pull', 1);
    await clickAction(page, 'pullRemoteBtn', 'pull', 2);
    await clickAction(page, 'pushRemoteBtn', 'push', 1);
    await clickAction(page, 'portalAuthSignOutBtn', 'signOut', 1);
    await openAndCloseHelp(page);

    await replaceDashboardAndTopbar(page);

    await clickAction(page, 'syncStatusBadge', 'pull', 3);
    await clickAction(page, 'pullRemoteBtn', 'pull', 4);
    await clickAction(page, 'pushRemoteBtn', 'push', 2);
    await clickAction(page, 'portalAuthSignOutBtn', 'signOut', 2);
    await openAndCloseHelp(page);

    const counts = await page.evaluate(() => window.__HEADER_ACTION_SELFTEST__);
    assert.deepStrictEqual(counts, { pull: 4, push: 2, signOut: 2 });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().then(() => {
  console.log('portal-header-actions.selftest: ok');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
