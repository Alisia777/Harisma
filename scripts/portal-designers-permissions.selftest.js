#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

function portalRoleMatrix() {
  const source = fs.readFileSync(path.join(ROOT, 'portal-auth-access.js'), 'utf8');
  const window = {
    location: {
      protocol: 'https:',
      hostname: 'харизмой.рф',
      host: 'харизмой.рф',
      pathname: '/',
      search: '',
      hash: '',
      replace() {}
    }
  };
  vm.runInNewContext(source, { window }, { filename: 'portal-auth-access.js' });
  const rules = window.ALTEA_PORTAL_ACCESS_RULES;
  assert.ok(rules && rules.roles, 'Portal access rules must be available');

  const roles = ['owner', 'director', 'product', 'designer', 'employee', 'guest', 'readonly'];
  return roles.map((role) => {
    const configured = rules.roles[role] && rules.roles[role].views;
    const views = configured === '*' ? rules.allViews : (Array.isArray(configured) ? configured : []);
    return { role, tabVisible: views.includes('designers') };
  });
}

function serve() {
  const server = http.createServer((req, res) => {
    const pathname = String(req.url || '/').split('?')[0];
    if (pathname === '/' || pathname === '/blank') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/portal-designers.css"></head><body><section class="view active" id="view-designers"></section></body></html>');
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(pathname).replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const extension = path.extname(file);
    const type = extension === '.js' ? 'application/javascript; charset=utf-8'
      : (extension === '.css' ? 'text/css; charset=utf-8' : 'application/json; charset=utf-8');
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function installWorkspaceFixture(page, accessLevel) {
  await page.evaluate((level) => {
    const nativeFetch = window.fetch.bind(window);
    const payload = {
      schema: 'altea-design-workspace-v1',
      version: 1,
      updatedAt: '2026-07-21T12:00:00Z',
      projects: [{
        id: 'permission-project',
        title: 'Проект для проверки прав',
        status: 'review',
        type: 'card',
        priority: 'normal',
        owner: 'Тестовый дизайнер',
        updatedAt: '2026-07-21T12:00:00Z'
      }],
      tests: [],
      pages: [],
      activity: [],
      settings: {}
    };
    window.currentConfig = () => ({ brand: 'Алтея', supabase: { url: 'https://supabase.test', anonKey: 'anon-key' } });
    window.__ALTEA_AUTH_SESSION__ = {
      access_token: 'signed-user-token',
      user: { id: `permission-${level || 'none'}`, email: `${level || 'none'}@qeep.life` }
    };
    window.fetch = async (input, options = {}) => {
      const url = String(input && input.url ? input.url : input);
      if (!url.startsWith('https://supabase.test/')) return nativeFetch(input, options);
      if (url.includes('/portal_design_workspace_members')) {
        return new Response(JSON.stringify(level ? [{ access_level: level }] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/portal_design_workspaces')) {
        const rows = level ? [{ payload, revision: 5, updated_at: payload.updatedAt }] : [];
        return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/portal_design_workspace_history') || url.includes('/portal_design_workspace_audit')) {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/rpc/')) {
        return new Response(JSON.stringify([{ revision: 6, updated_at: payload.updatedAt }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  }, accessLevel);
}

async function workspaceAccessMatrix(browser, baseUrl) {
  const rows = [];
  for (const accessLevel of ['editor', 'viewer', '']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
    await installWorkspaceFixture(page, accessLevel);
    await page.addScriptTag({ url: `${baseUrl}/portal-designers.js` });
    const expectedAccess = accessLevel || 'none';
    await page.waitForSelector(`[data-design-access="${expectedAccess}"]`);
    const state = await page.evaluate(() => {
      const create = document.querySelector('[data-design-add-project]');
      const project = document.querySelector('[data-design-project="permission-project"]');
      const notice = Array.from(document.querySelectorAll('.design-ws-notice')).map((node) => node.textContent.trim()).join(' ');
      return {
        projectVisible: Boolean(project),
        createVisible: Boolean(create && !create.hidden && !create.disabled),
        notice
      };
    });
    assert.strictEqual(errors.length, 0, errors.join('\n'));
    rows.push({ access: expectedAccess, ...state });
    await context.close();
  }
  return rows;
}

async function run() {
  const roles = portalRoleMatrix();
  const expectedRoles = {
    owner: true,
    director: true,
    product: true,
    designer: true,
    employee: false,
    guest: false,
    readonly: false
  };
  roles.forEach((row) => assert.strictEqual(row.tabVisible, expectedRoles[row.role], `Unexpected Designers visibility for ${row.role}`));

  const server = await serve();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
  try {
    const workspaces = await workspaceAccessMatrix(browser, baseUrl);
    const editor = workspaces.find((row) => row.access === 'editor');
    const viewer = workspaces.find((row) => row.access === 'viewer');
    const none = workspaces.find((row) => row.access === 'none');
    assert.deepStrictEqual({ project: editor.projectVisible, create: editor.createVisible }, { project: true, create: true }, 'Editor must see data and write actions');
    assert.deepStrictEqual({ project: viewer.projectVisible, create: viewer.createVisible }, { project: true, create: false }, 'Viewer must see data without write actions');
    assert.deepStrictEqual({ project: none.projectVisible, create: none.createVisible }, { project: false, create: false }, 'Non-member must not see protected data or write actions');
    assert.match(none.notice, /Доступ не настроен/, 'Non-member must see an explicit access notice');
    console.log(JSON.stringify({ portalRoles: roles, workspaceAccess: workspaces }, null, 2));
    console.log('portal-designers-permissions.selftest: ok');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
