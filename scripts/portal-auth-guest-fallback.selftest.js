#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const GUEST_EMAIL = 'guest@qeep.life';
const GUEST_PASSWORD = 'NihsS%Hn_uE#kXBfcX!e';

function serve() {
  const server = http.createServer((request, response) => {
    const pathname = String(request.url || '/').split('?')[0];
    if (pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end([
        '<!doctype html><html><head><meta charset="utf-8"></head>',
        '<body class="portal-auth-locked">',
        '<div class="top-actions"></div>',
        '<button class="nav-btn" data-view="dashboard">Dashboard</button>',
        '<section class="view" id="view-dashboard"></section>',
        '</body></html>'
      ].join(''));
      return;
    }
    if (pathname === '/portal-auth-gate.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      fs.createReadStream(path.join(ROOT, 'portal-auth-gate.js')).pipe(response);
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function run() {
  const server = await serve();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {})
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      window.APP_CONFIG = {
        portalAuthRequired: true,
        supabase: {
          url: 'https://example.supabase.co',
          anonKey: 'fixture-public-key',
          auth: 'email_password'
        }
      };
      window.ALTEA_PORTAL_ACCESS_RULES = {
        allViews: ['dashboard'],
        defaultViews: [],
        enforceUserAllowlist: true,
        roles: { guest: { views: ['dashboard'] } },
        users: { 'guest@qeep.life': { role: 'guest', name: 'Гостевой вход' } }
      };
      window.__guestAnonymousAttempts = 0;
      window.supabase = {
        createClient() {
          return {
            auth: {
              async getSession() {
                return { data: { session: null }, error: null };
              },
              onAuthStateChange() {
                return { data: { subscription: { unsubscribe() {} } } };
              },
              async signInAnonymously() {
                window.__guestAnonymousAttempts += 1;
                return { data: { session: null }, error: new Error('anonymous signup disabled') };
              },
              async signOut() {
                return { error: null };
              }
            }
          };
        }
      };
    });
    await page.addScriptTag({ url: `${baseUrl}/portal-auth-gate.js` });
    await page.waitForSelector('#portalAuthForm');
    await page.fill('#portalAuthEmail', GUEST_EMAIL);
    await page.fill('#portalAuthPassword', GUEST_PASSWORD);
    await page.click('#portalAuthSubmit');
    await page.waitForFunction(() => !document.body.classList.contains('portal-auth-locked'));

    const result = await page.evaluate(() => ({
      attempts: window.__guestAnonymousAttempts,
      access: window.__ALTEA_PORTAL_ACCESS__,
      session: window.alteaPortalAuthGate?.getSession?.(),
      screenExists: Boolean(document.getElementById('portalAuthScreen'))
    }));
    assert.strictEqual(result.attempts, 1, 'Guest login should try anonymous Supabase auth once');
    assert.strictEqual(result.screenExists, false, 'Guest fallback must unlock the portal');
    assert.strictEqual(result.access?.email, GUEST_EMAIL);
    assert.deepStrictEqual(result.access?.allowedViews, ['dashboard']);
    assert.strictEqual(result.session?.access_token, 'guest-local-session');
    assert.strictEqual(result.session?.user?.app_metadata?.portal_role, 'guest');
    assert.deepStrictEqual(pageErrors, []);
    console.log('portal-auth-guest-fallback.selftest: ok');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
