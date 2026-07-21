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
      res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/portal-designers.css"></head><body><section id="view-designers"></section></body></html>');
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(pathname).replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const type = path.extname(file) === '.js' ? 'application/javascript; charset=utf-8'
      : (path.extname(file) === '.css' ? 'text/css; charset=utf-8' : 'application/json; charset=utf-8');
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function installRemoteFixture(page, accessLevel, workspace) {
  await page.evaluate(({ accessLevel: level, workspace: payload }) => {
    const nativeFetch = window.fetch.bind(window);
    window.__designRequests = [];
    window.__designRemoteWorkspace = payload;
    window.__designRemoteRevision = payload ? 3 : 0;
    window.currentConfig = () => ({ brand: 'Алтея', supabase: { url: 'https://supabase.test', anonKey: 'anon-key' } });
    window.__ALTEA_AUTH_SESSION__ = {
      access_token: 'signed-user-token',
      user: { id: `user-${level || 'none'}`, email: `${level || 'none'}@qeep.life` }
    };
    window.fetch = async (input, options = {}) => {
      const url = String(input && input.url ? input.url : input);
      if (!url.startsWith('https://supabase.test/')) return nativeFetch(input, options);
      window.__designRequests.push({ url, method: options.method || 'GET', body: options.body || '' });
      if (url.includes('/portal_design_workspace_members')) {
        return new Response(JSON.stringify(level ? [{ access_level: level }] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/portal_design_workspace_history')) {
        return new Response(JSON.stringify(window.__designRemoteWorkspace ? [{ revision: window.__designRemoteRevision, changed_at: '2026-07-20T12:00:00Z', change_summary: 'Тестовая версия', changed_by: null }] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/portal_design_workspace_audit')) {
        return new Response(JSON.stringify(window.__designRemoteWorkspace ? [{ id: 1, revision: window.__designRemoteRevision, event_type: 'workspace.save', summary: 'Тестовая версия', created_at: '2026-07-20T12:00:00Z', actor_id: 'audit-user', actor_email: 'designer@qeep.life' }] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/rpc/save_portal_design_workspace')) {
        const body = JSON.parse(options.body || '{}');
        if (Number(body.p_expected_revision) !== Number(window.__designRemoteRevision)) {
          return new Response(JSON.stringify({ message: 'revision_conflict' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }
        window.__designRemoteWorkspace = body.p_payload;
        window.__designRemoteRevision += 1;
        return new Response(JSON.stringify([{ revision: window.__designRemoteRevision, updated_at: '2026-07-20T12:01:00Z' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/portal_design_workspaces')) {
        return new Response(JSON.stringify(window.__designRemoteWorkspace ? [{ payload: window.__designRemoteWorkspace, revision: window.__designRemoteRevision, updated_at: '2026-07-20T12:00:00Z' }] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  }, { accessLevel, workspace });
}

async function loadModule(page, baseUrl) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addScriptTag({ url: `${baseUrl}/portal-designers.js` });
  return errors;
}

async function testLocalEditor(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  const errors = await loadModule(page, baseUrl);
  await page.waitForSelector('[data-design-access="local"]');
  await page.click('[data-design-add-project]');
  await page.fill('[data-design-project-form] [name="title"]', 'Проверка резервной копии');
  await page.click('[data-design-project-form] button[type="submit"]');
  await page.waitForFunction(() => window.AlteaDesignWorkspace.getData().projects.some((item) => item.title === 'Проверка резервной копии'));
  await page.click('[data-design-add-project-status="review"]');
  assert.strictEqual(await page.locator('[data-design-project-form] [name="status"]').inputValue(), 'review', 'Quick add must preselect the selected board stage');
  await page.click('[data-design-close]');
  await page.click('[data-design-project]');
  await page.click('[data-design-duplicate-project]');
  await page.waitForFunction(() => window.AlteaDesignWorkspace.getData().projects.some((item) => /— копия$/.test(item.title)));
  await page.keyboard.press('/');
  assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-design-search')), true, 'Slash shortcut must focus project search');
  await page.click('[data-design-focus="review"]');
  assert.strictEqual(await page.locator('[data-design-filter="status"]').inputValue(), 'review', 'Summary metric must apply its project focus');
  await page.evaluate(() => window.AlteaDesignWorkspace.whenLocalSaved());
  await page.click('[data-design-mode="history"]');
  await page.waitForFunction(() => document.querySelectorAll('.design-ws-activity-list article').length >= 1);
  assert.ok((await page.locator('.design-ws-history-panel').count()) >= 4, 'History view must distinguish remote versions, local backups, server audit, and local activity');
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  await context.close();
}

async function testViewer(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(page, 'viewer', {
    schema: 'altea-design-workspace-v1', version: 1, updatedAt: '2026-07-20T12:00:00Z',
    projects: [{ id: 'viewer-project', title: 'Доступный проект', status: 'review', type: 'card', priority: 'normal', updatedAt: '2026-07-20T12:00:00Z' }],
    tests: [], pages: [], activity: [], settings: {}
  });
  const errors = await loadModule(page, baseUrl);
  await page.waitForSelector('[data-design-access="viewer"]');
  await page.waitForSelector('[data-design-project="viewer-project"]');
  assert.strictEqual(await page.locator('[data-design-add-project]').count(), 0, 'Viewer must not see create controls');
  assert.strictEqual(await page.locator('[data-design-status]:not([disabled])').count(), 0, 'Viewer status controls must be disabled');
  await page.click('[data-design-project="viewer-project"]');
  assert.strictEqual(await page.locator('[data-design-project-form] [name="title"]:disabled').count(), 1, 'Viewer dialog must be read-only');
  const importBlocked = await page.evaluate(() => {
    try { window.AlteaDesignWorkspace.importNotionCsv('Name\nForbidden'); return false; }
    catch (error) { return /редакторам/.test(error.message); }
  });
  assert.strictEqual(importBlocked, true, 'Viewer API imports must be blocked');
  await page.click('[data-design-close]');
  await page.click('[data-design-mode="history"]');
  assert.match(await page.locator('.design-ws-history-panel').allTextContents().then((items) => items.join(' ')), /Серверный аудит[\s\S]*designer@qeep\.life/, 'Viewer history must show immutable server actor data');
  assert.strictEqual((await page.evaluate(() => window.__designRequests)).some((item) => item.method === 'POST'), false, 'Viewer load must never write to Supabase');
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  await context.close();
}

async function testRemoteEditor(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(page, 'editor', {
    schema: 'altea-design-workspace-v1', version: 1, updatedAt: '2026-07-20T12:00:00Z',
    projects: [], tests: [], pages: [], activity: [], settings: {}
  });
  const errors = await loadModule(page, baseUrl);
  await page.waitForSelector('[data-design-access="editor"]');
  await page.evaluate(() => window.AlteaDesignWorkspace.sync(true));
  assert.strictEqual((await page.evaluate(() => window.__designRequests)).some((item) => item.method === 'POST'), false, 'A clean editor refresh must not create a redundant revision');
  await page.click('[data-design-add-project]');
  await page.fill('[data-design-project-form] [name="title"]', 'Командный проект');
  await page.click('[data-design-project-form] button[type="submit"]');
  await page.waitForFunction(() => window.__designRequests.some((item) => item.method === 'POST' && item.url.includes('/rpc/save_portal_design_workspace')));
  const saveRequest = await page.evaluate(() => window.__designRequests.find((item) => item.method === 'POST' && item.url.includes('/rpc/save_portal_design_workspace')));
  const body = JSON.parse(saveRequest.body);
  assert.strictEqual(body.p_expected_revision, 3, 'Editor save must use the loaded optimistic revision');
  assert.ok(body.p_payload.projects.some((item) => item.title === 'Командный проект'), 'Editor save must include the new project');
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  await context.close();
}

async function testConcurrentConflict(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(page, 'editor', {
    schema: 'altea-design-workspace-v1', version: 1, updatedAt: '2026-07-20T12:00:00Z',
    projects: [{ id: 'shared-project', title: 'Базовая версия', status: 'review', type: 'card', priority: 'normal', createdAt: '2026-07-20T10:00:00Z', updatedAt: '2026-07-20T12:00:00Z' }],
    tests: [], pages: [], activity: [], settings: {}
  });
  const errors = await loadModule(page, baseUrl);
  await page.waitForSelector('[data-design-access="editor"]');
  await page.click('[data-design-project="shared-project"]');
  await page.fill('[data-design-project-form] [name="title"]', 'Локальная версия');
  await page.evaluate(() => {
    window.__designRemoteWorkspace = JSON.parse(JSON.stringify(window.__designRemoteWorkspace));
    window.__designRemoteWorkspace.projects[0].title = 'Командная версия';
    window.__designRemoteWorkspace.projects[0].updatedAt = '2026-07-20T12:05:00Z';
    window.__designRemoteWorkspace.updatedAt = '2026-07-20T12:05:00Z';
    window.__designRemoteRevision = 4;
  });
  await page.click('[data-design-project-form] button[type="submit"]');
  await page.waitForSelector('[data-design-conflict-local]');
  const state = await page.evaluate(() => ({
    diagnostics: window.AlteaDesignWorkspace.diagnostics(),
    requests: window.__designRequests,
    title: window.AlteaDesignWorkspace.getData().projects.find((item) => item.id === 'shared-project').title
  }));
  assert.strictEqual(state.diagnostics.syncConflictCount, 1, 'Same-entity concurrent edits must surface a conflict');
  assert.strictEqual(state.title, 'Локальная версия', 'The client must preserve the local edit until the user resolves the conflict');
  assert.strictEqual(state.requests.some((item) => item.method === 'POST'), false, 'A detected conflict must not overwrite the server');
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  await context.close();
}

async function testRevokedMember(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(page, '', null);
  await page.evaluate(() => {
    function hashText(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16);
    }
    const key = `altea-design-workspace-v1:${hashText('user-none')}`;
    localStorage.setItem(key, JSON.stringify({
      dirty: false,
      data: {
        schema: 'altea-design-workspace-v1', version: 1, updatedAt: '2026-07-20T10:00:00Z',
        projects: [{ id: 'secret', title: 'TOP_SECRET_PROJECT', updatedAt: '2026-07-20T10:00:00Z' }],
        tests: [], pages: [], activity: [], settings: {}
      }
    }));
    window.__secretRendered = false;
    new MutationObserver(() => {
      if (document.body.textContent.includes('TOP_SECRET_PROJECT')) window.__secretRendered = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const errors = await loadModule(page, baseUrl);
  await page.waitForSelector('[data-design-access="none"]');
  await page.evaluate(() => window.AlteaDesignWorkspace.whenLocalSaved());
  const state = await page.evaluate(() => ({
    secretRendered: window.__secretRendered,
    secretInData: window.AlteaDesignWorkspace.getData().projects.some((item) => item.title === 'TOP_SECRET_PROJECT'),
    canCreate: (() => {
      const button = document.querySelector('[data-design-add-project]');
      return Boolean(button && !button.hidden && !button.disabled);
    })(),
    diagnostics: window.AlteaDesignWorkspace.diagnostics()
  }));
  assert.strictEqual(state.secretRendered, false, 'Cached private data must not flash before membership is checked');
  assert.strictEqual(state.secretInData, false, 'Revoked membership must discard cached private data');
  assert.strictEqual(state.canCreate, false, 'Revoked membership must not expose write actions');
  assert.strictEqual(state.diagnostics.workspaceAccess, 'none');
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  await context.close();
}

async function run() {
  const server = await serve();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
  try {
    await testLocalEditor(browser, baseUrl);
    await testViewer(browser, baseUrl);
    await testRemoteEditor(browser, baseUrl);
    await testConcurrentConflict(browser, baseUrl);
    await testRevokedMember(browser, baseUrl);
    console.log('portal-designers-browser.selftest: ok');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
