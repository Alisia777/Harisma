#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const AUTH_KEY = 'altea-portal-auth-v1';

function serve() {
  const fixtureHtml = [
    '<!doctype html><html><head><meta charset="utf-8"></head>',
    '<body class="portal-auth-locked">',
    '<div class="app-shell"><div class="top-actions"></div>',
    '<button class="nav-btn" data-view="dashboard">Dashboard</button>',
    '<section class="view" id="view-dashboard"></section></div>',
    '<script src="/portal-auth-gate.js"></script>',
    '</body></html>'
  ].join('');
  const realClientHtml = fixtureHtml.replace(
    '<script src="/portal-auth-gate.js"></script>',
    '<script src="/assets/vendor/supabase.js"></script><script src="/portal-auth-gate.js"></script>'
  );

  const server = http.createServer((req, res) => {
    const pathname = String(req.url || '/').split('?')[0];
    if (pathname === '/' || pathname === '/real') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pathname === '/real' ? realClientHtml : fixtureHtml);
      return;
    }
    if (pathname === '/portal-auth-gate.js' || pathname === '/assets/vendor/supabase.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      fs.createReadStream(path.join(ROOT, pathname.replace(/^\/+/, ''))).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function run() {
  const server = await serve();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browserName = process.env.PORTAL_AUTH_BROWSER === 'webkit' ? 'webkit' : 'chromium';
  const browserType = browserName === 'webkit' ? webkit : chromium;
  const browser = await browserType.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {})
  });

  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.addInitScript(({ authKey }) => {
      window.requestAnimationFrame = function () { return 0; };
      if (window.HTMLMediaElement) {
        window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      }

      const originalSetItem = window.Storage.prototype.setItem;
      window.Storage.prototype.setItem = function quotaLimitedSetItem(key, value) {
        if (this === window.localStorage && String(key) === authKey) {
          throw new DOMException('Safari localStorage quota exhausted', 'QuotaExceededError');
        }
        return originalSetItem.call(this, key, value);
      };

      const base64Url = (value) => btoa(JSON.stringify(value))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const accessToken = [
        base64Url({ alg: 'HS256', typ: 'JWT' }),
        base64Url({
          aud: 'authenticated',
          exp: expiresAt,
          sub: 'macos-fixture-user',
          email: 'm.v.pekhova@qeep.life',
          role: 'authenticated'
        }),
        'fixture-signature'
      ].join('.');
      const session = {
        access_token: accessToken,
        refresh_token: 'fixture-refresh-token',
        expires_in: 3600,
        expires_at: expiresAt,
        token_type: 'bearer',
        user: {
          id: 'macos-fixture-user',
          email: 'm.v.pekhova@qeep.life',
          user_metadata: {},
          app_metadata: { portal_role: 'employee' }
        }
      };

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
        roles: { employee: { views: ['dashboard'] } },
        users: { 'm.v.pekhova@qeep.life': { role: 'employee' } }
      };

      window.supabase = {
        createClient(url, key, options) {
          const authOptions = options && options.auth;
          const storage = authOptions && authOptions.storage;
          const storageKey = authOptions && authOptions.storageKey;
          let listener = null;
          window.__fixtureAuthStorage = {
            custom: Boolean(storage && storage.getItem && storage.setItem),
            key: storageKey
          };

          return {
            auth: {
              async getSession() {
                const raw = storage ? await storage.getItem(storageKey) : window.localStorage.getItem(storageKey);
                return { data: { session: raw ? JSON.parse(raw) : null }, error: null };
              },
              onAuthStateChange(callback) {
                listener = callback;
                return { data: { subscription: { unsubscribe() {} } } };
              },
              async signInWithPassword() {
                if (storage) await storage.setItem(storageKey, JSON.stringify(session));
                else window.localStorage.setItem(storageKey, JSON.stringify(session));
                if (listener) setTimeout(() => listener('SIGNED_IN', session), 0);
                return { data: { session }, error: null };
              },
              async signOut() {
                if (storage) await storage.removeItem(storageKey);
                else window.localStorage.removeItem(storageKey);
                if (listener) setTimeout(() => listener('SIGNED_OUT', null), 0);
                return { error: null };
              }
            }
          };
        }
      };
    }, { authKey: AUTH_KEY });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#portalAuthForm');
    await page.fill('#portalAuthEmail', 'm.v.pekhova@qeep.life');
    await page.fill('#portalAuthPassword', 'fixture-password');
    await page.click('#portalAuthSubmit');
    try {
      await page.waitForFunction(() => !document.body.classList.contains('portal-auth-locked'), null, { polling: 100 });
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        status: document.getElementById('portalAuthStatus') && document.getElementById('portalAuthStatus').textContent,
        storage: window.__fixtureAuthStorage || null,
        locked: document.body.classList.contains('portal-auth-locked'),
        email: document.getElementById('portalAuthEmail') && document.getElementById('portalAuthEmail').value,
        passwordLength: (document.getElementById('portalAuthPassword') && document.getElementById('portalAuthPassword').value.length) || 0
      }));
      throw new Error(`${browserName}: initial login did not unlock: ${JSON.stringify(diagnostics)}; page errors: ${JSON.stringify(pageErrors)}`);
    }

    const signedIn = await page.evaluate((authKey) => ({
      customStorage: window.__fixtureAuthStorage,
      localValue: window.localStorage.getItem(authKey),
      unlocked: !document.body.classList.contains('portal-auth-locked')
    }), AUTH_KEY);
    assert.strictEqual(signedIn.customStorage.custom, true, 'Supabase must receive the durable custom storage adapter');
    assert.strictEqual(signedIn.customStorage.key, AUTH_KEY);
    assert.strictEqual(signedIn.localValue, null, 'The fixture must reproduce Safari localStorage quota failure');
    assert.strictEqual(signedIn.unlocked, true);

    await page.goto(`${baseUrl}/real`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('portal-auth-locked'), null, { polling: 100 });

    const restored = await page.evaluate(() => ({
      screen: Boolean(document.getElementById('portalAuthScreen')),
      email: window.__ALTEA_PORTAL_ACCESS__ && window.__ALTEA_PORTAL_ACCESS__.email,
      session: window.alteaPortalAuthGate && window.alteaPortalAuthGate.getSession()
    }));
    assert.strictEqual(restored.screen, false, `${browserName}: the real Supabase client must restore IndexedDB auth`);
    assert.strictEqual(restored.email, 'm.v.pekhova@qeep.life');
    assert.match(restored.session && restored.session.access_token, /^eyJ/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('portal-auth-locked'), null, { polling: 100 });
    assert.strictEqual(
      await page.locator('#portalAuthScreen').count(),
      0,
      `${browserName}: F5 must not reopen the login screen`
    );
    assert.deepStrictEqual(pageErrors, []);
    console.log(`portal-auth-macos-persistence.selftest (${browserName}): ok`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
