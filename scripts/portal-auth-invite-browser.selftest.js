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
      res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div class="top-actions"></div></body></html>');
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(pathname).replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function run() {
  const server = await serve();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/blank#access_token=fixture&type=invite`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const session = {
        access_token: 'fixture-token',
        user: { id: 'designer-fixture', email: 'a.kolmogorova@qeep.life', app_metadata: { portal_role: 'designer' }, user_metadata: {} }
      };
      window.__passwordUpdateCalls = 0;
      window.APP_CONFIG = { portalAuthRequired: true };
      window.ALTEA_PORTAL_ACCESS_RULES = {
        allViews: ['designers'], defaultViews: [], enforceUserAllowlist: true,
        roles: { designer: { views: ['designers'] } },
        users: { 'a.kolmogorova@qeep.life': { role: 'designer' } }
      };
      window.supabase = {
        createClient() {
          return {
            auth: {
              getSession: async () => ({ data: { session } }),
              onAuthStateChange(callback) {
                setTimeout(() => callback('SIGNED_IN', session), 0);
                return { data: { subscription: { unsubscribe() {} } } };
              },
              updateUser: async ({ password }) => {
                window.__passwordUpdateCalls += 1;
                window.__passwordWasStrong = password.length >= 12;
                return { data: { user: session.user }, error: null };
              },
              signOut: async () => ({ error: null })
            }
          };
        }
      };
    });
    await page.addScriptTag({ url: `${baseUrl}/portal-auth-gate.js` });
    await page.waitForSelector('#portalAuthPasswordConfirm');
    assert.strictEqual(await page.locator('#portalAuthTitle').textContent(), 'Создайте пароль');
    assert.strictEqual(await page.locator('#portalAuthEmail').isVisible(), false, 'Email login field must be hidden during invitation setup');

    await page.fill('#portalAuthPassword', 'short');
    await page.fill('#portalAuthPasswordConfirm', 'short');
    await page.click('#portalAuthSubmit');
    assert.match(await page.locator('#portalAuthStatus').textContent(), /минимум 12 символов/i);
    assert.strictEqual(await page.evaluate(() => window.__passwordUpdateCalls), 0, 'Weak password must not reach Supabase');

    await page.fill('#portalAuthPassword', 'Correct-Horse-92');
    await page.fill('#portalAuthPasswordConfirm', 'Correct-Horse-93');
    await page.click('#portalAuthSubmit');
    assert.match(await page.locator('#portalAuthStatus').textContent(), /не совпадают/i);
    assert.strictEqual(await page.evaluate(() => window.__passwordUpdateCalls), 0, 'Mismatched passwords must not reach Supabase');

    await page.fill('#portalAuthPasswordConfirm', 'Correct-Horse-92');
    await page.click('#portalAuthSubmit');
    await page.waitForFunction(() => window.location.hash === '#designers' && !document.getElementById('portalAuthScreen'));
    const result = await page.evaluate(() => ({
      calls: window.__passwordUpdateCalls,
      strong: window.__passwordWasStrong,
      email: window.__ALTEA_PORTAL_ACCESS__ && window.__ALTEA_PORTAL_ACCESS__.email,
      views: window.__ALTEA_PORTAL_ACCESS__ && window.__ALTEA_PORTAL_ACCESS__.allowedViews
    }));
    assert.strictEqual(result.calls, 1, 'A valid submission must update the password exactly once');
    assert.strictEqual(result.strong, true);
    assert.strictEqual(result.email, 'a.kolmogorova@qeep.life');
    assert.deepStrictEqual(result.views, ['designers']);
    assert.deepStrictEqual(pageErrors, []);
    console.log('portal-auth-invite-browser.selftest: ok');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
