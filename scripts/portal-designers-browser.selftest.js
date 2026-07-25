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
    window.__designAccessLevel = level;
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
        if (window.__designFailMembership) throw new TypeError('Failed to fetch membership');
        return new Response(JSON.stringify(window.__designAccessLevel ? [{ access_level: window.__designAccessLevel }] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/portal_design_workspace_history')) {
        return new Response(JSON.stringify(window.__designRemoteWorkspace ? [{ revision: window.__designRemoteRevision, changed_at: '2026-07-20T12:00:00Z', change_summary: 'Тестовая версия', changed_by: null }] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/portal_design_workspace_audit')) {
        return new Response(JSON.stringify(window.__designRemoteWorkspace ? [{ id: 1, revision: window.__designRemoteRevision, event_type: 'workspace.save', summary: 'Тестовая версия', created_at: '2026-07-20T12:00:00Z', actor_id: 'audit-user', actor_email: 'designer@qeep.life' }] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/rpc/save_portal_design_workspace')) {
        const body = JSON.parse(options.body || '{}');
        if (Number(body.p_expected_revision) === Number(window.__designRemoteRevision) && Number(window.__designRevisionRaces) > 0) {
          window.__designRevisionRaces -= 1;
          window.__designRemoteRevision += 1;
          const raceCard = window.__designRemoteWorkspace && window.__designRemoteWorkspace.projects.find((item) => item.id === 'race-remote-card');
          if (raceCard) {
            raceCard.brief = `Командная правка v${window.__designRemoteRevision}`;
            raceCard.updatedAt = new Date(Date.UTC(2026, 6, 24, 11, window.__designRemoteRevision, 0)).toISOString();
            window.__designRemoteWorkspace.updatedAt = raceCard.updatedAt;
          }
          return new Response(JSON.stringify({ message: 'revision_conflict' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }
        if (Number(body.p_expected_revision) !== Number(window.__designRemoteRevision)) {
          return new Response(JSON.stringify({ message: 'revision_conflict' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }
        window.__designRemoteWorkspace = body.p_payload;
        window.__designRemoteRevision += 1;
        return new Response(JSON.stringify([{ revision: window.__designRemoteRevision, updated_at: '2026-07-20T12:01:00Z' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/portal_design_workspaces')) {
        if (window.__designFailWorkspace) {
          return new Response(JSON.stringify({ message: 'temporary outage' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        }
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

async function testWorkspaceThemePalettes(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(page, 'editor', {
    schema: 'altea-design-workspace-v1', version: 1, updatedAt: '2026-07-23T12:00:00Z',
    projects: Object.keys({
      inbox: true,
      brief: true,
      production: true,
      review: true,
      done: true
    }).map((status, index) => ({
      id: `palette-${status}`,
      title: `Палитра ${status}`,
      status,
      type: 'card',
      priority: 'normal',
      owner: index === 0 ? 'Евгения' : '',
      updatedAt: `2026-07-23T12:0${index}:00Z`
    })),
    tests: [], pages: [], activity: [], settings: {}
  });
  const errors = await loadModule(page, baseUrl);
  await page.waitForSelector('[data-design-access="editor"]');
  await page.waitForSelector('[data-design-drop-status="done"]');

  const palettes = await page.evaluate(() => {
    document.body.classList.add('altea-premium-app');
    const read = (theme, mode, legacy) => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.themeMode = mode;
      document.body.dataset.theme = theme;
      document.body.dataset.portalTheme = theme;
      document.body.dataset.portalThemeLegacy = legacy;
      const workspace = document.querySelector('.design-ws');
      const styles = getComputedStyle(workspace);
      return {
        background: styles.getPropertyValue('--design-bg').trim(),
        panel: styles.getPropertyValue('--design-panel-strong').trim(),
        ink: styles.getPropertyValue('--design-ink').trim(),
        headingColor: getComputedStyle(document.querySelector('.design-ws-head h2')).color,
        cardTitleColor: getComputedStyle(document.querySelector('.design-ws-card:not(.has-cover) h3')).color,
        columns: Array.from(document.querySelectorAll('.design-ws-column')).map((column) => getComputedStyle(column).backgroundImage)
      };
    };
    return {
      light: read('porcelain-day', 'light', 'light'),
      gray: read('graphite-frost', 'dark', 'gray'),
      dark: read('noir-pearl', 'dark', 'dark')
    };
  });

  assert.strictEqual(palettes.light.background, '#f5f1ea', 'Porcelain Day must keep the designers workspace light inside the premium shell');
  assert.strictEqual(palettes.light.ink, '#151515', 'Light workspace typography must use the explicit near-black ink token');
  assert.strictEqual(palettes.light.headingColor, 'rgb(21, 21, 21)', 'Light workspace headings must stay black after portal theme changes');
  assert.strictEqual(palettes.light.cardTitleColor, 'rgb(21, 21, 21)', 'Light task-card titles must stay black on white cards');
  assert.strictEqual(palettes.gray.background, '#20252d', 'Graphite Frost must use the dedicated gray workspace palette');
  assert.strictEqual(palettes.dark.background, '#0d0d10', 'Dark portal themes must retain the dark designers workspace');
  assert.strictEqual(new Set([palettes.light.background, palettes.gray.background, palettes.dark.background]).size, 3, 'Light, gray, and dark palettes must remain visually distinct');
  assert.strictEqual(new Set(palettes.light.columns).size, 5, 'Every board stage must keep its own status-tinted surface');
  const designerOptions = await page.locator('[data-design-filter="owner"] option').allTextContents();
  assert.ok(designerOptions.includes('Ульяна'), 'Legacy tasks assigned to Евгения must appear under Ульяна in the designers filter');
  assert.ok(!designerOptions.includes('Евгения'), 'The retired Евгения filter option must not remain visible');
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  await context.close();
}

async function testViewer(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(page, 'viewer', {
    schema: 'altea-design-workspace-v1', version: 1, updatedAt: '2026-07-20T12:00:00Z',
    projects: [{ id: 'viewer-project', title: 'Доступный проект', status: 'review', type: 'card', priority: 'normal', coverImageUrl: 'https://example.com/product.jpg', attachments: [{ id: 'viewer-file', fileName: 'product.jpg', mimeType: 'image/jpeg', size: 1024, url: 'https://example.com/product.jpg' }], updatedAt: '2026-07-20T12:00:00Z' }],
    tests: [], pages: [], activity: [], settings: {}
  });
  const errors = await loadModule(page, baseUrl);
  await page.waitForSelector('[data-design-access="viewer"]');
  await page.waitForSelector('[data-design-project="viewer-project"]');
  assert.strictEqual(await page.locator('[data-design-add-project]').count(), 0, 'Viewer must not see create controls');
  assert.strictEqual(await page.locator('[data-design-status]:not([disabled])').count(), 0, 'Viewer status controls must be disabled');
  assert.strictEqual(await page.locator('[data-design-project] [data-design-card-cover]').count(), 1, 'Viewer must see the shared product-card cover');
  await page.click('[data-design-project="viewer-project"]');
  assert.strictEqual(await page.locator('[data-design-project-form] [name="title"]:disabled').count(), 1, 'Viewer dialog must be read-only');
  assert.strictEqual(await page.locator('[data-design-project-attachment-item]').count(), 1, 'Viewer must see shared task attachments');
  assert.strictEqual(await page.locator('[data-design-project-attachment-input], [data-design-set-project-cover], [data-design-remove-project-attachment]').count(), 0, 'Viewer must not see attachment mutation controls');
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

async function testViewerKeepsCacheDuringRemoteFailure(browser, baseUrl) {
  const context = await browser.newContext();
  const workspace = {
    schema: 'altea-design-workspace-v1', version: 1, updatedAt: '2026-07-20T12:00:00Z',
    projects: [{ id: 'cached-viewer-project', title: 'Проект из последней синхронизации', status: 'review', type: 'card', priority: 'normal', updatedAt: '2026-07-20T12:00:00Z' }],
    tests: [], pages: [], activity: [], settings: {}
  };

  const onlinePage = await context.newPage();
  await onlinePage.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(onlinePage, 'viewer', workspace);
  const onlineErrors = await loadModule(onlinePage, baseUrl);
  await onlinePage.waitForSelector('[data-design-project="cached-viewer-project"]');
  await onlinePage.evaluate(() => window.AlteaDesignWorkspace.whenLocalSaved());
  assert.strictEqual(onlineErrors.length, 0, onlineErrors.join('\n'));
  await onlinePage.close();

  const offlinePage = await context.newPage();
  await offlinePage.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(offlinePage, 'viewer', workspace);
  await offlinePage.evaluate(() => {
    window.__designFailMembership = true;
    window.__designFailWorkspace = true;
  });
  const offlineErrors = await loadModule(offlinePage, baseUrl);
  await offlinePage.waitForSelector('[data-design-access="viewer"]');
  await offlinePage.waitForSelector('[data-design-project="cached-viewer-project"]');
  await offlinePage.waitForSelector('.design-ws-notice.is-error [data-design-sync]');
  const diagnostics = await offlinePage.evaluate(() => window.AlteaDesignWorkspace.diagnostics());
  assert.match(diagnostics.remoteLoadError, /503/, 'Remote failure must be reported in diagnostics');
  assert.strictEqual(diagnostics.membershipCheckFailed, true, 'A membership timeout must remain distinguishable from a confirmed revocation');
  assert.match(diagnostics.workspaceAccessMessage, /Офлайн/, 'A membership timeout must use the safe read-only fallback');
  assert.strictEqual(await offlinePage.locator('[data-design-add-project]').count(), 0, 'Offline membership fallback must not grant write access');
  await offlinePage.evaluate(() => {
    window.__designFailMembership = false;
    window.__designFailWorkspace = false;
  });
  await offlinePage.click('[data-design-sync]');
  await offlinePage.waitForFunction(() => !window.AlteaDesignWorkspace.diagnostics().membershipCheckFailed);
  assert.strictEqual((await offlinePage.evaluate(() => window.AlteaDesignWorkspace.diagnostics())).workspaceAccess, 'viewer', 'Retry must restore the confirmed membership');
  assert.strictEqual(offlineErrors.length, 0, offlineErrors.join('\n'));
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
  await page.fill('[data-design-project-form] [name="brief"]', 'Собрать карточку товара и проверить читаемость оффера');
  const coverPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');
  await page.setInputFiles('[data-design-project-attachment-input]', [
    { name: 'product-cover.png', mimeType: 'image/png', buffer: coverPng },
    { name: 'technical-brief.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') }
  ]);
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-design-project-form] [name="attachments"]').value).length === 2);
  assert.strictEqual(await page.locator('[data-design-project-form] [name="coverImageUrl"]').inputValue().then((value) => value.includes('/storage/v1/object/public/portal-task-files/')), true, 'First uploaded image must become the product-card cover');
  await page.click('[data-design-project-form] button[type="submit"]');
  await page.waitForFunction(() => window.__designRequests.some((item) => item.method === 'POST' && item.url.includes('/rpc/save_portal_design_workspace')));
  const saveRequest = await page.evaluate(() => window.__designRequests.find((item) => item.method === 'POST' && item.url.includes('/rpc/save_portal_design_workspace')));
  const body = JSON.parse(saveRequest.body);
  assert.strictEqual(body.p_expected_revision, 3, 'Editor save must use the loaded optimistic revision');
  assert.ok(body.p_payload.projects.some((item) => item.title === 'Командный проект'), 'Editor save must include the new project');
  const savedProject = body.p_payload.projects.find((item) => item.title === 'Командный проект');
  assert.strictEqual(savedProject.attachments.length, 2, 'Editor save must persist every uploaded task attachment');
  assert.ok(savedProject.coverImageUrl.includes('product-cover.png'), 'First photo must remain the card cover in the shared payload');
  assert.strictEqual(await page.locator('[data-design-project] [data-design-card-cover] img').count(), 1, 'Board card must render the first photo as its visual background');
  assert.match(await page.locator('[data-design-project] .design-ws-card-cover-overlay').innerText(), /Командный проект[\s\S]*Собрать карточку товара/, 'Task title and brief must render over the product image');
  assert.match(await page.locator('[data-design-project] .design-ws-attachment-count').innerText(), /2/, 'Card must expose its attachment count');
  await page.click('[data-design-project]');
  assert.strictEqual(await page.locator('[data-design-project-attachment-item]').count(), 2, 'Project dialog must show uploaded photo and file');
  assert.strictEqual(await page.locator('.design-project-cover-badge').count(), 1, 'Project dialog must identify the active cover');
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  await context.close();
}

async function testTenEditorRevisionRace(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(page, 'editor', {
    schema: 'altea-design-workspace-v1',
    version: 1,
    updatedAt: '2026-07-24T11:00:00Z',
    projects: [
      {
        id: 'race-local-card',
        title: 'Локальная карточка',
        status: 'inbox',
        type: 'card',
        priority: 'normal',
        createdAt: '2026-07-24T10:00:00Z',
        updatedAt: '2026-07-24T11:00:00Z'
      },
      {
        id: 'race-remote-card',
        title: 'Командная карточка',
        status: 'review',
        type: 'card',
        priority: 'normal',
        brief: 'Базовая командная версия',
        createdAt: '2026-07-24T10:00:00Z',
        updatedAt: '2026-07-24T11:00:00Z'
      }
    ],
    tests: [],
    pages: [],
    activity: [],
    settings: {}
  });
  const errors = await loadModule(page, baseUrl);
  await page.waitForSelector('[data-design-access="editor"]');
  await page.evaluate(() => { window.__designRevisionRaces = 9; });
  await page.click('[data-design-project="race-local-card"]');
  await page.selectOption('[data-design-project-form] [name="status"]', 'production');
  await page.click('[data-design-project-form] button[type="submit"]');
  await page.waitForFunction(() => window.__designRequests.filter((request) => request.method === 'POST' && request.url.includes('/rpc/save_portal_design_workspace')).length === 10);
  await page.waitForFunction(() => window.AlteaDesignWorkspace.diagnostics().cacheDirty === false);
  const state = await page.evaluate(() => ({
    diagnostics: window.AlteaDesignWorkspace.diagnostics(),
    remoteRevision: window.__designRemoteRevision,
    remoteWorkspace: window.__designRemoteWorkspace,
    postCount: window.__designRequests.filter((request) => request.method === 'POST' && request.url.includes('/rpc/save_portal_design_workspace')).length
  }));
  assert.strictEqual(state.postCount, 10, 'Nine competing writers plus the local writer must use ten optimistic POST attempts');
  assert.strictEqual(state.diagnostics.lastSyncRebaseAttempts, 10, 'The client must rebase across every competing revision');
  assert.strictEqual(state.remoteRevision, 13, 'All nine competing revisions and the final local revision must be serialized');
  assert.strictEqual(state.remoteWorkspace.projects.find((item) => item.id === 'race-local-card').status, 'production', 'The local card move must survive all competing revisions');
  assert.strictEqual(state.remoteWorkspace.projects.find((item) => item.id === 'race-remote-card').brief, 'Командная правка v12', 'The latest competing team edit must survive the final local write');
  assert.strictEqual(state.diagnostics.syncConflictCount, 0, 'Independent edits from ten writers must not create false conflicts');
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  await context.close();
}

async function testBoardAndModalOverflow(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 720 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(page, 'editor', {
    schema: 'altea-design-workspace-v1', version: 1, updatedAt: '2026-07-22T12:00:00Z',
    projects: [{
      id: 'overflow-project',
      title: 'Оперативная карточка retinol_boost_krem_dlya_vek_30ml_SUPERLONGWITHOUTBREAK',
      status: 'inbox', type: 'card', priority: 'normal', owner: 'Анастасия Колмогорова Старший дизайнер',
      marketplace: 'WILDBERRIES_LONG_MARKETPLACE_VALUE',
      brief: 'https://towering-approach-bfb.notion.site/10e745f6263a802f886cdb53eac842fe?v=10e745f6263a8186900a000c129272b0',
      url: 'https://example.com/source', tags: ['ОченьДлинныйТегБезПробелов_ABCDEFGHIJK'],
      createdAt: '2026-07-22T12:00:00Z', updatedAt: '2026-07-22T12:00:00Z'
    }],
    tests: [], pages: [], activity: [], settings: {}
  });
  const errors = await loadModule(page, baseUrl);
  await page.waitForSelector('[data-design-project="overflow-project"]');

  const desktopLayout = await page.evaluate(() => {
    const card = document.querySelector('[data-design-project="overflow-project"]');
    const column = card.closest('.design-ws-column');
    const wrap = document.querySelector('[data-design-board-scrollport]');
    return {
      cardRight: card.getBoundingClientRect().right,
      columnRight: column.getBoundingClientRect().right,
      wrapClientWidth: wrap.clientWidth,
      wrapScrollWidth: wrap.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    };
  });
  assert.ok(desktopLayout.cardRight <= desktopLayout.columnRight + 1, 'Long SKU, URL, and tags must not stretch a card outside its column');
  assert.ok(desktopLayout.wrapScrollWidth > desktopLayout.wrapClientWidth, 'Wide board must retain a horizontal scrollport');
  assert.ok(desktopLayout.bodyScrollWidth <= desktopLayout.viewportWidth + 1, 'Board overflow must remain inside its scrollport, not the whole page');
  const boardSliders = page.locator('[data-design-board-slider]');
  assert.strictEqual(await boardSliders.count(), 2, 'Board navigation must expose synchronized sliders above and below the columns');
  await boardSliders.first().evaluate((slider) => {
    slider.value = '600';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('[data-design-board-scrollport]').scrollLeft > 0);
  await page.locator('[data-design-board-scrollport]').evaluate((scrollport) => {
    scrollport.scrollLeft = scrollport.scrollWidth - scrollport.clientWidth;
    scrollport.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-design-board-slider]')).every((slider) => Number(slider.value) >= 995));
  assert.deepStrictEqual(await page.locator('[data-design-board-slider-value]').allTextContents(), ['100%', '100%'], 'Both slider labels must stay synchronized with natural horizontal scrolling');

  await page.click('[data-design-project="overflow-project"]');
  await page.waitForSelector('[data-design-project-form]');
  const desktopModal = await page.evaluate(() => {
    const modal = document.querySelector('.design-ws-modal');
    const form = document.querySelector('[data-design-project-form]');
    const rect = modal.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: innerWidth, modalClientWidth: modal.clientWidth, modalScrollWidth: modal.scrollWidth, formClientWidth: form.clientWidth, formScrollWidth: form.scrollWidth };
  });
  assert.ok(desktopModal.left >= -1 && desktopModal.right <= desktopModal.viewport + 1, 'Desktop modal must stay inside the viewport');
  assert.ok(desktopModal.modalScrollWidth <= desktopModal.modalClientWidth + 1, 'Desktop modal must not hide fields off the right edge');
  assert.ok(desktopModal.formScrollWidth <= desktopModal.formClientWidth + 1, 'Long field values must not widen the project form');
  await page.click('.design-ws-modal [data-design-close]');

  await page.setViewportSize({ width: 390, height: 720 });
  await page.click('[data-design-project="overflow-project"]');
  await page.waitForSelector('[data-design-project-form]');
  const mobileModal = await page.evaluate(() => {
    const modal = document.querySelector('.design-ws-modal');
    const grid = document.querySelector('.design-ws-form-grid');
    const rect = modal.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: innerWidth, modalClientWidth: modal.clientWidth, modalScrollWidth: modal.scrollWidth, gridColumns: getComputedStyle(grid).gridTemplateColumns };
  });
  assert.ok(mobileModal.left >= -1 && mobileModal.right <= mobileModal.viewport + 1, 'Mobile modal must stay inside the viewport');
  assert.ok(mobileModal.modalScrollWidth <= mobileModal.modalClientWidth + 1, 'Mobile modal must expose every field without horizontal clipping');
  assert.ok(!/\s/.test(mobileModal.gridColumns.trim()), 'Mobile project form must collapse to one column');
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
  await page.waitForSelector('[data-design-conflict-choice="local"]');
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

async function testOfflineEditorThreeWayMerge(browser, baseUrl) {
  const context = await browser.newContext();
  const workspace = {
    schema: 'altea-design-workspace-v1',
    version: 1,
    updatedAt: '2026-07-24T09:00:00Z',
    projects: [
      {
        id: 'offline-card-a',
        title: 'Карточка A',
        status: 'review',
        type: 'card',
        priority: 'normal',
        brief: 'Исходный бриф A',
        createdAt: '2026-07-24T08:00:00Z',
        updatedAt: '2026-07-24T09:00:00Z'
      },
      {
        id: 'offline-card-b',
        title: 'Карточка B',
        status: 'inbox',
        type: 'card',
        priority: 'normal',
        brief: 'Исходный бриф B',
        createdAt: '2026-07-24T08:00:00Z',
        updatedAt: '2026-07-24T09:00:00Z'
      },
      {
        id: 'offline-card-c',
        title: 'Карточка C',
        status: 'brief',
        type: 'card',
        priority: 'normal',
        brief: 'Исходный бриф C',
        createdAt: '2026-07-24T08:00:00Z',
        updatedAt: '2026-07-24T09:00:00Z'
      }
    ],
    tests: [],
    pages: [],
    activity: [],
    settings: {}
  };

  const onlinePage = await context.newPage();
  await onlinePage.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(onlinePage, 'editor', workspace);
  const onlineErrors = await loadModule(onlinePage, baseUrl);
  await onlinePage.waitForSelector('[data-design-access="editor"]');
  await onlinePage.evaluate(() => window.AlteaDesignWorkspace.whenLocalSaved());
  assert.strictEqual(
    (await onlinePage.evaluate(() => window.AlteaDesignWorkspace.diagnostics())).confirmedAccessLevel,
    'editor',
    'A successful online membership check must authorize later offline editing'
  );
  assert.strictEqual(onlineErrors.length, 0, onlineErrors.join('\n'));
  await onlinePage.close();

  const offlinePage = await context.newPage();
  await offlinePage.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(offlinePage, 'editor', workspace);
  await offlinePage.evaluate(() => {
    window.__designFailMembership = true;
    window.__designFailWorkspace = true;
  });
  const offlineErrors = await loadModule(offlinePage, baseUrl);
  await offlinePage.waitForSelector('[data-design-access="editor"]');
  assert.strictEqual(
    (await offlinePage.evaluate(() => window.AlteaDesignWorkspace.diagnostics())).offlineEditMode,
    true,
    'A recently confirmed editor must be able to keep working offline'
  );

  await offlinePage.click('[data-design-project="offline-card-a"]');
  await offlinePage.selectOption('[data-design-project-form] [name="status"]', 'production');
  await offlinePage.click('[data-design-project-form] button[type="submit"]');
  await offlinePage.click('[data-design-project="offline-card-b"]');
  await offlinePage.selectOption('[data-design-project-form] [name="status"]', 'review');
  await offlinePage.click('[data-design-project-form] button[type="submit"]');
  await offlinePage.click('[data-design-project="offline-card-c"]');
  await offlinePage.selectOption('[data-design-project-form] [name="status"]', 'production');
  await offlinePage.click('[data-design-project-form] button[type="submit"]');
  await offlinePage.evaluate(() => window.AlteaDesignWorkspace.whenLocalSaved());
  assert.strictEqual(
    (await offlinePage.evaluate(() => window.__designRequests)).some((request) => request.method === 'POST'),
    false,
    'Offline moves must remain local until membership and the latest revision are fetched'
  );

  await offlinePage.evaluate(() => {
    window.__designRemoteWorkspace = JSON.parse(JSON.stringify(window.__designRemoteWorkspace));
    window.__designRemoteWorkspace.projects.find((item) => item.id === 'offline-card-a').title = 'Карточка A · правка команды';
    window.__designRemoteWorkspace.projects.find((item) => item.id === 'offline-card-a').updatedAt = '2026-07-24T09:05:00Z';
    window.__designRemoteWorkspace.projects.find((item) => item.id === 'offline-card-b').status = 'done';
    window.__designRemoteWorkspace.projects.find((item) => item.id === 'offline-card-b').updatedAt = '2026-07-24T09:06:00Z';
    window.__designRemoteWorkspace.projects.find((item) => item.id === 'offline-card-c').status = 'done';
    window.__designRemoteWorkspace.projects.find((item) => item.id === 'offline-card-c').updatedAt = '2026-07-24T09:07:00Z';
    window.__designRemoteWorkspace.updatedAt = '2026-07-24T09:07:00Z';
    window.__designRemoteRevision = 4;
    window.__designFailMembership = false;
    window.__designFailWorkspace = false;
  });

  await offlinePage.click('[data-design-sync]');
  await offlinePage.waitForSelector('[data-design-conflict-choice="local"]');
  const conflictState = await offlinePage.evaluate(() => ({
    diagnostics: window.AlteaDesignWorkspace.diagnostics(),
    requests: window.__designRequests
  }));
  assert.strictEqual(conflictState.diagnostics.syncConflictCount, 2, 'Every card moved to two different columns must be listed separately');
  assert.deepStrictEqual(conflictState.diagnostics.syncConflictFields, ['status', 'status'], 'Each conflict must be limited to its status field');
  assert.strictEqual(conflictState.requests.some((request) => request.method === 'POST'), false, 'No payload may be written before the conflict is resolved');

  await offlinePage.click('[data-design-conflict-choice="local"][data-design-conflict-index="0"]');
  assert.strictEqual(await offlinePage.locator('[data-design-conflict-apply]').isDisabled(), true, 'Apply must stay blocked until every card has a decision');
  await offlinePage.click('[data-design-conflict-choice="remote"][data-design-conflict-index="1"]');
  assert.strictEqual(await offlinePage.locator('[data-design-conflict-apply]').isEnabled(), true, 'Apply must unlock after every card has a decision');
  offlinePage.once('dialog', (dialog) => dialog.accept());
  await offlinePage.click('[data-design-conflict-apply]');
  await offlinePage.waitForFunction(() => window.__designRequests.some((request) => request.method === 'POST' && request.url.includes('/rpc/save_portal_design_workspace')));
  const saveRequest = await offlinePage.evaluate(() => window.__designRequests.findLast((request) => request.method === 'POST' && request.url.includes('/rpc/save_portal_design_workspace')));
  const saved = JSON.parse(saveRequest.body).p_payload;
  const savedA = saved.projects.find((item) => item.id === 'offline-card-a');
  const savedB = saved.projects.find((item) => item.id === 'offline-card-b');
  const savedC = saved.projects.find((item) => item.id === 'offline-card-c');
  assert.strictEqual(savedA.title, 'Карточка A · правка команды', 'A remote title edit must survive an unrelated offline column move');
  assert.strictEqual(savedA.status, 'production', 'The offline column move must survive an unrelated remote title edit');
  assert.strictEqual(savedB.status, 'review', 'The local decision must apply only to its selected card');
  assert.strictEqual(savedC.status, 'done', 'The team decision must apply only to its selected card');
  assert.strictEqual(offlineErrors.length, 0, offlineErrors.join('\n'));
  await context.close();
}

async function testOfflineEditorRoleDowngradeStopsPush(browser, baseUrl) {
  const context = await browser.newContext();
  const workspace = {
    schema: 'altea-design-workspace-v1',
    version: 1,
    updatedAt: '2026-07-24T10:00:00Z',
    projects: [{
      id: 'offline-downgrade-card',
      title: 'Карточка со сменой роли',
      status: 'inbox',
      type: 'card',
      priority: 'normal',
      createdAt: '2026-07-24T09:00:00Z',
      updatedAt: '2026-07-24T10:00:00Z'
    }],
    tests: [],
    pages: [],
    activity: [],
    settings: {}
  };

  const onlinePage = await context.newPage();
  await onlinePage.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(onlinePage, 'editor', workspace);
  await loadModule(onlinePage, baseUrl);
  await onlinePage.waitForSelector('[data-design-access="editor"]');
  await onlinePage.evaluate(() => window.AlteaDesignWorkspace.whenLocalSaved());
  await onlinePage.close();

  const offlinePage = await context.newPage();
  await offlinePage.goto(`${baseUrl}/blank`, { waitUntil: 'domcontentloaded' });
  await installRemoteFixture(offlinePage, 'editor', workspace);
  await offlinePage.evaluate(() => {
    window.__designFailMembership = true;
    window.__designFailWorkspace = true;
  });
  const errors = await loadModule(offlinePage, baseUrl);
  await offlinePage.waitForSelector('[data-design-access="editor"]');
  await offlinePage.click('[data-design-project="offline-downgrade-card"]');
  await offlinePage.selectOption('[data-design-project-form] [name="status"]', 'production');
  await offlinePage.click('[data-design-project-form] button[type="submit"]');
  await offlinePage.evaluate(() => window.AlteaDesignWorkspace.whenLocalSaved());
  await offlinePage.evaluate(() => {
    window.__designAccessLevel = 'viewer';
    window.__designFailMembership = false;
    window.__designFailWorkspace = false;
  });
  await offlinePage.click('[data-design-sync]');
  await offlinePage.waitForFunction(() => window.AlteaDesignWorkspace.diagnostics().workspaceAccess === 'viewer');
  const state = await offlinePage.evaluate(() => ({
    diagnostics: window.AlteaDesignWorkspace.diagnostics(),
    status: window.AlteaDesignWorkspace.getData().projects.find((item) => item.id === 'offline-downgrade-card').status,
    requests: window.__designRequests
  }));
  assert.strictEqual(state.diagnostics.cacheDirty, true, 'Unsent offline work must remain marked dirty after an editor downgrade');
  assert.strictEqual(state.status, 'production', 'A role downgrade must not overwrite the unsent local card move');
  assert.strictEqual(state.requests.some((request) => request.method === 'POST'), false, 'A downgraded editor must never push offline changes');
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
    await testWorkspaceThemePalettes(browser, baseUrl);
    await testViewer(browser, baseUrl);
    await testViewerKeepsCacheDuringRemoteFailure(browser, baseUrl);
    await testRemoteEditor(browser, baseUrl);
    await testTenEditorRevisionRace(browser, baseUrl);
    await testBoardAndModalOverflow(browser, baseUrl);
    await testConcurrentConflict(browser, baseUrl);
    await testOfflineEditorThreeWayMerge(browser, baseUrl);
    await testOfflineEditorRoleDowngradeStopsPush(browser, baseUrl);
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
