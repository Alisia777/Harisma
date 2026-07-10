#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const STORAGE_MODULE = 'portal-document-storage-v1.js';
const FOLDER_NAME = 'Реклама и маркетинг';
const LEGACY_RESOURCE_ID = 'legacy-root-resource';
const LEGACY_RESOURCE_TITLE = 'Старый файл без папки';
const STATIC_RESOURCE_TITLE = 'Навигация по вкладкам';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertStaticContracts() {
  const storageModule = read(STORAGE_MODULE);
  const appCore01 = read('app-core-01.js');
  const appCore02 = read('app-core-02.js');
  const appCore03 = read('app-core-03.js');
  const teamHotfix = read('portal-team-runtime-hotfix.js');
  const liveIndex = read('live-index.html');

  for (const selector of [
    'data-document-storage-create-folder',
    'data-document-storage-folder-form',
    'data-document-storage-folder-name',
    'data-document-storage-create-folder-submit',
    'data-open-document-folder',
    'data-document-storage-back',
    'data-move-resource-link',
    'data-document-resource-card',
    'data-document-resource-id',
    'data-drop-document-folder',
    'data-drop-document-root',
    'data-delete-document-folder'
  ]) {
    assert.ok(storageModule.includes(selector), `${STORAGE_MODULE} must expose [${selector}]`);
  }
  assert.match(storageModule, /name=["']folderId["']/, 'Upload form must expose a folder target select');

  assert.match(appCore01, /resourceFolders\s*:\s*\[\]/, 'Default storage must initialize resourceFolders');
  assert.match(appCore02, /resourceFolders\s*:\s*Array\.isArray\(parsed\.resourceFolders\)/, 'Storage normalization must preserve resourceFolders');
  assert.match(appCore02, /resourceFolders\s*:\s*snapshot\.resourceFolders/, 'Storage backup/history must preserve resourceFolders');
  assert.match(appCore02, /resourceFolders\s*:\s*Array\.isArray\(imported\.resourceFolders\)/, 'Storage import must preserve resourceFolders');
  assert.ok(appCore02.includes('hydratePortalStorageBeforeRemote'), 'Local storage must hydrate before remote team initialization');
  assert.ok(appCore02.includes('__ALTEA_PORTAL_STORAGE_EARLY_HYDRATED__'), 'Early storage hydration must be idempotent');
  assert.ok(teamHotfix.includes('hydratePortalStorageBeforeRemoteHotfix'), 'Remote pulls must defensively hydrate local storage first');
  assert.ok(storageModule.includes('persistExactResourceComment'), 'Resource events must persist their exact deterministic comment');
  assert.ok(!storageModule.includes('window.createComment'), 'Resource events must not use the production createComment override');
  assert.ok(
    liveIndex.indexOf('portal-team-runtime-hotfix.js?v=20260710storagefolderpersist1')
      < liveIndex.indexOf('app-core-10.js?v=20260710delegated-nav1'),
    'Live entrypoint must install the team persistence guard before primary init'
  );

  for (const [name, source] of [
    ['app-core-03.js', appCore03],
    ['portal-team-runtime-hotfix.js', teamHotfix]
  ]) {
    assert.ok(source.includes('[[resource-folder:v1]]'), `${name} must read the folder event marker`);
    assert.ok(source.includes('[[resource-folder-delete:v1]]'), `${name} must read the folder deletion marker`);
    assert.match(source, /folderId\s*:\s*String\(raw\.folderId/, `${name} must preserve resource folderId during comment normalization`);
    assert.match(source, /updatedAt\s*:\s*String\(raw\.updatedAt/, `${name} must preserve resource updatedAt during comment normalization`);
    assert.ok(source.includes('resource_folder'), `${name} must recognize remote folder events`);
    assert.ok(source.includes('resource_folder_delete'), `${name} must recognize remote folder tombstones`);
  }
}

function fixtureState() {
  return {
    activeView: 'documents',
    documents: {
      groups: [{
        title: 'Инструкции портала',
        items: [{
          title: STATIC_RESOURCE_TITLE,
          href: 'docs/navigation.md',
          description: 'Базовый документ портала',
          type: 'Документ'
        }]
      }]
    },
    docFilters: { search: '', group: 'all', type: 'all' },
    storage: {
      comments: [],
      resourceFolders: [],
      resourceLinks: [{
        id: LEGACY_RESOURCE_ID,
        title: LEGACY_RESOURCE_TITLE,
        href: 'https://example.com/legacy-file.xlsx',
        description: 'Создан до появления папок',
        group: 'Общее хранилище',
        type: 'Таблица',
        createdAt: '2026-07-01T10:00:00.000Z'
      }]
    },
    team: {
      member: { name: 'Тест', email: 'test@example.com', role: 'admin' },
      accessToken: ''
    }
  };
}

function serve() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(String(request.url || '/').split('?')[0]);
    if (pathname === '/' || pathname === '/fixture') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html>
        <html><head><meta charset="utf-8"><title>Storage folders selftest</title></head>
        <body>
          <aside class="sidebar"><nav class="nav"><button class="nav-btn" data-view="control">Tasks</button></nav></aside>
          <main class="main"><section class="view" id="view-control"></section><section class="view active" id="view-documents"></section></main>
          <div id="appError" class="hidden"></div>
        </body></html>`);
      return;
    }

    const filePath = path.join(ROOT, pathname.replace(/^\/+/, ''));
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function installFixture(page, state = fixtureState()) {
  await page.evaluate((payload) => {
    window.state = payload.state;
    window.__alteaAppState = window.state;
    window.escapeHtml = (value) => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    window.badge = (label, tone = '') => `<span class="chip ${window.escapeHtml(tone)}">${window.escapeHtml(label)}</span>`;
    window.fmt = {
      int: (value) => String(Number(value) || 0),
      date: (value) => String(value || '')
    };
    window.stableId = (prefix, value) => `${prefix}-${String(value || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'fixture'}`;
    window.currentBrand = () => 'altea';
    window.currentConfig = () => ({});
    window.setAppError = (message) => {
      window.__storageErrors.push(String(message || ''));
      const banner = document.getElementById('appError');
      if (banner) {
        banner.textContent = String(message || '');
        banner.classList.toggle('hidden', !message);
      }
    };
    window.__storageErrors = [];
    window.__storageSaveReasons = [];
    window.__createCommentCalls = 0;
    window.__persistedComments = [];
    window.__persistCommentShouldFail = false;
    window.saveLocalStorage = (options = {}) => {
      window.__storageSaveReasons.push(String(options.reason || ''));
      localStorage.setItem('brand-portal-local-v1', JSON.stringify(window.state.storage));
    };
    window.hasRemoteStore = () => true;
    window.createComment = async () => {
      window.__createCommentCalls += 1;
      throw new Error('Production createComment override must be bypassed for storage events');
    };
    window.persistComment = async (comment) => {
      if (window.__persistCommentShouldFail) throw new Error('Simulated remote persistence failure');
      const index = window.__persistedComments.findIndex((item) => item.id === comment.id);
      const copy = JSON.parse(JSON.stringify(comment));
      if (index >= 0) window.__persistedComments.splice(index, 1, copy);
      else window.__persistedComments.unshift(copy);
      return copy;
    };
    window.setView = (view) => {
      window.state.activeView = view;
      window.dispatchEvent(new CustomEvent('altea:viewchange', { detail: { view } }));
    };
  }, { state });
}

async function visibleText(page) {
  return page.locator('#view-documents').innerText();
}

async function dragResourceTo(page, resourceId, targetSelector) {
  const source = page.locator(
    `[data-document-resource-card][data-document-resource-id="${resourceId}"]`
  ).first();
  const target = page.locator(targetSelector).first();

  await source.waitFor({ state: 'visible' });
  await target.waitFor({ state: 'visible' });
  assert.strictEqual(
    await source.getAttribute('draggable'),
    'true',
    'Resource cards must opt into native HTML drag-and-drop'
  );
  await source.dragTo(target);
}

async function reloadWithStorage(page, port, storage) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const state = fixtureState();
  state.storage = storage;
  await installFixture(page, state);
  await page.addScriptTag({ url: `http://127.0.0.1:${port}/${STORAGE_MODULE}` });
  await page.evaluate(() => window.__ALTEA_DOCUMENT_STORAGE_V1__.render());
}

async function assertFolderSurvives(page, folderId, staticResourceId, sourceLabel) {
  const folderSelector = `[data-open-document-folder="${folderId}"]`;
  await page.waitForSelector(folderSelector);
  assert.strictEqual(
    await page.locator(folderSelector).count(),
    1,
    `${sourceLabel}: persisted folder must render exactly once after returning`
  );

  await page.click(folderSelector);
  await page.waitForSelector('[data-document-storage-back]');
  assert.ok(
    (await visibleText(page)).includes(LEGACY_RESOURCE_TITLE),
    `${sourceLabel}: user resource placement must survive returning to the folder`
  );
  assert.strictEqual(
    await page.locator(`[data-document-resource-card][data-document-resource-id="${staticResourceId}"]`).count(),
    1,
    `${sourceLabel}: static resource placement must survive without duplicating the base card`
  );
  await page.click('[data-document-storage-back]');
  await page.waitForSelector(folderSelector);
}

async function runEarlyHydrationContract() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const folderId = 'boot-race-folder';
  try {
    await page.goto(`http://127.0.0.1:${port}/fixture`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((targetFolderId) => {
      localStorage.setItem('brand-portal-local-v1', JSON.stringify({
        comments: [],
        tasks: [],
        decisions: [],
        ownerOverrides: [],
        resourceLinks: [],
        resourceFolders: [{
          id: targetFolderId,
          title: 'Папка до старта синхронизации',
          group: 'Общее хранилище',
          createdAt: '2026-07-10T12:00:00.000Z',
          updatedAt: '2026-07-10T12:00:00.000Z'
        }]
      }));
    }, folderId);
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/app-core-01.js` });
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/app-core-02.js` });
    const result = await page.evaluate((targetFolderId) => {
      const hydratedBeforeRemote = (window.__alteaAppState?.storage?.resourceFolders || [])
        .some((folder) => folder.id === targetFolderId);
      const remotePartial = {
        comments: [{
          id: 'remote-comment',
          articleKey: 'remote',
          author: 'Команда',
          team: 'Команда',
          type: 'signal',
          text: 'remote',
          createdAt: '2026-07-10T12:01:00.000Z'
        }]
      };
      window.__alteaAppState.storage = window.completePortalStorage(
        remotePartial,
        window.__alteaAppState.storage
      );
      localStorage.setItem('brand-portal-local-v1', JSON.stringify(window.__alteaAppState.storage));
      const persistedAfterRemote = JSON.parse(localStorage.getItem('brand-portal-local-v1') || '{}');
      return {
        earlyFlag: window.__ALTEA_PORTAL_STORAGE_EARLY_HYDRATED__ === true,
        hydratedBeforeRemote,
        survivedRemoteSave: (persistedAfterRemote.resourceFolders || [])
          .some((folder) => folder.id === targetFolderId)
      };
    }, folderId);
    assert.strictEqual(result.earlyFlag, true, 'Early local storage hydration flag must be set');
    assert.strictEqual(result.hydratedBeforeRemote, true, 'Folder must hydrate before a fast remote pull starts');
    assert.strictEqual(result.survivedRemoteSave, true, 'Fast remote save must not erase the hydrated folder');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runDomContract() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const runtimeErrors = [];

  page.on('pageerror', (error) => runtimeErrors.push(error.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('dialog', (dialog) => dialog.accept());

  try {
    await page.goto(`http://127.0.0.1:${port}/fixture`, { waitUntil: 'domcontentloaded' });
    await installFixture(page);
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/${STORAGE_MODULE}` });
    await page.evaluate(() => window.__ALTEA_DOCUMENT_STORAGE_V1__.render());

    await page.waitForSelector('[data-document-storage-create-folder]');
    assert.ok((await visibleText(page)).includes(LEGACY_RESOURCE_TITLE), 'Legacy resource without folderId must remain visible in root');
    assert.ok((await visibleText(page)).includes(STATIC_RESOURCE_TITLE), 'Static/base resource must be visible in root');
    assert.strictEqual(await page.evaluate(() => window.state.storage.resourceLinks[0].folderId || ''), '', 'Legacy resource must normalize to root without rewriting data');

    await page.click('[data-document-storage-create-folder]');
    await page.waitForSelector('[data-document-storage-folder-form]');
    await page.fill('[data-document-storage-folder-name]', FOLDER_NAME);
    await page.click('[data-document-storage-create-folder-submit]');
    await page.waitForFunction((name) => (
      window.state.storage.resourceFolders || []
    ).some((folder) => (folder.title || folder.name) === name && folder.id), FOLDER_NAME);

    const folderId = await page.evaluate((name) => (
      window.state.storage.resourceFolders || []
    ).find((folder) => (folder.title || folder.name) === name)?.id || '', FOLDER_NAME);
    assert.ok(folderId, 'Created folder must have a stable id');

    const folderOpen = page.locator(`[data-open-document-folder="${folderId}"]`).first();
    await folderOpen.click();
    await page.waitForSelector('[data-document-storage-back]');
    assert.ok(!(await visibleText(page)).includes(LEGACY_RESOURCE_TITLE), 'Root-only legacy resource must not leak into an opened empty folder');
    assert.ok(!(await visibleText(page)).includes(STATIC_RESOURCE_TITLE), 'Root-only static resource must not leak into an opened empty folder');
    await page.click('[data-document-storage-back]');
    await page.waitForSelector(`[data-open-document-folder="${folderId}"]`);
    assert.ok((await visibleText(page)).includes(LEGACY_RESOURCE_TITLE), 'Back must return to the root folder');

    const moveControl = page.locator(`[data-move-resource-link="${LEGACY_RESOURCE_ID}"]`).first();
    assert.strictEqual(await moveControl.evaluate((element) => element.tagName), 'SELECT', 'Move control must remain available for deterministic keyboard access');

    await dragResourceTo(page, LEGACY_RESOURCE_ID, `[data-drop-document-folder="${folderId}"]`);
    await page.waitForFunction(({ resourceId, targetFolderId }) => (
      window.state.storage.resourceLinks || []
    ).find((item) => item.id === resourceId)?.folderId === targetFolderId, {
      resourceId: LEGACY_RESOURCE_ID,
      targetFolderId: folderId
    });
    assert.ok(!(await visibleText(page)).includes(LEGACY_RESOURCE_TITLE), 'Resource dragged into a folder must leave root immediately');

    await page.click(`[data-open-document-folder="${folderId}"]`);
    await page.waitForSelector('[data-document-storage-back]');
    assert.ok((await visibleText(page)).includes(LEGACY_RESOURCE_TITLE), 'Dragged resource must be visible inside its folder');
    await page.click('[data-document-storage-back]');

    const folderCountBeforeDelete = await page.evaluate(() => window.state.storage.resourceFolders.length);
    await page.click(`[data-delete-document-folder="${folderId}"]`);
    await page.waitForTimeout(120);
    const deletionResult = await page.evaluate((targetFolderId) => ({
      folderStillExists: (window.state.storage.resourceFolders || []).some((folder) => folder.id === targetFolderId),
      resourceStillAssigned: (window.state.storage.resourceLinks || []).some((item) => item.id === 'legacy-root-resource' && item.folderId === targetFolderId),
      folderCount: window.state.storage.resourceFolders.length,
      errors: window.__storageErrors.slice(),
      text: document.getElementById('view-documents')?.innerText || ''
    }), folderId);
    assert.strictEqual(deletionResult.folderStillExists, true, 'Non-empty folder deletion must be refused');
    assert.strictEqual(deletionResult.resourceStillAssigned, true, 'Refused deletion must not orphan or delete resources');
    assert.strictEqual(deletionResult.folderCount, folderCountBeforeDelete, 'Refused deletion must not mutate folder collection');
    assert.ok(
      /не пуст|содержит|перемест|файл/i.test([...deletionResult.errors, deletionResult.text].join(' ')),
      'Non-empty deletion refusal must explain how to resolve it'
    );

    await page.click(`[data-open-document-folder="${folderId}"]`);
    await page.waitForSelector('[data-drop-document-root]');
    await dragResourceTo(page, LEGACY_RESOURCE_ID, '[data-drop-document-root]');
    await page.waitForFunction((resourceId) => (
      window.state.storage.resourceLinks || []
    ).find((item) => item.id === resourceId)?.folderId === '', LEGACY_RESOURCE_ID);
    assert.ok(!(await visibleText(page)).includes(LEGACY_RESOURCE_TITLE), 'Resource dragged to root must leave the opened folder immediately');

    await page.click('[data-document-storage-back]');
    await page.waitForSelector(`[data-document-resource-card][data-document-resource-id="${LEGACY_RESOURCE_ID}"]`);
    assert.ok((await visibleText(page)).includes(LEGACY_RESOURCE_TITLE), 'Resource dragged back to root must be visible in root');
    assert.strictEqual(
      await page.evaluate((resourceId) => (
        window.state.storage.resourceLinks || []
      ).find((item) => item.id === resourceId)?.folderId, LEGACY_RESOURCE_ID),
      '',
      'Dragging back to root must persist an empty folderId'
    );

    await page.selectOption('#docGroupFilter', 'all');
    const staticCard = page.locator('[data-document-resource-card]').filter({ hasText: STATIC_RESOURCE_TITLE }).first();
    const staticResourceId = await staticCard.getAttribute('data-document-resource-id');
    assert.ok(staticResourceId?.startsWith('static-resource-'), 'Static cards must receive stable placement ids');
    assert.strictEqual(await staticCard.locator('[data-delete-resource-link]').count(), 0, 'Static cards must not become deletable');

    await dragResourceTo(page, staticResourceId, `[data-drop-document-folder="${folderId}"]`);
    await page.waitForFunction(({ resourceId, targetFolderId }) => (
      window.state.storage.resourceLinks || []
    ).find((item) => item.id === resourceId)?.folderId === targetFolderId, {
      resourceId: staticResourceId,
      targetFolderId: folderId
    });
    assert.strictEqual(
      await page.locator(`[data-document-resource-card][data-document-resource-id="${staticResourceId}"]`).count(),
      0,
      'Static card dragged into a folder must leave root'
    );

    await page.click(`[data-open-document-folder="${folderId}"]`);
    const movedStaticCard = page.locator(`[data-document-resource-card][data-document-resource-id="${staticResourceId}"]`);
    await movedStaticCard.waitFor({ state: 'visible' });
    assert.strictEqual(await movedStaticCard.count(), 1, 'Static placement override must not duplicate the base card');
    assert.ok((await movedStaticCard.innerText()).includes('база'), 'Moved static card must retain its base source label');
    assert.strictEqual(await movedStaticCard.locator('[data-delete-resource-link]').count(), 0, 'Moved static card must remain non-deletable');

    await dragResourceTo(page, staticResourceId, '[data-drop-document-root]');
    await page.waitForFunction((resourceId) => (
      window.state.storage.resourceLinks || []
    ).find((item) => item.id === resourceId)?.folderId === '', staticResourceId);
    await page.click('[data-document-storage-back]');
    await page.selectOption('#docGroupFilter', 'all');
    assert.strictEqual(
      await page.locator(`[data-document-resource-card][data-document-resource-id="${staticResourceId}"]`).count(),
      1,
      'Static card dragged back to root must still render exactly once'
    );

    // Persistence regression: put both a user card and a canonical/base card in
    // the folder, then prove the folder tree can be reconstructed after a route
    // round-trip, a full localStorage reload, and a comments-only team reload.
    await dragResourceTo(page, LEGACY_RESOURCE_ID, `[data-drop-document-folder="${folderId}"]`);
    await page.waitForFunction(({ resourceId, targetFolderId }) => (
      (window.state.storage.comments || []).some((comment) => (
        comment.type === 'resource_link'
        && String(comment.text || '').includes(resourceId)
        && String(comment.text || '').includes(targetFolderId)
      ))
    ), { resourceId: LEGACY_RESOURCE_ID, targetFolderId: folderId });

    await dragResourceTo(page, staticResourceId, `[data-drop-document-folder="${folderId}"]`);
    await page.waitForFunction(({ resourceId, targetFolderId }) => (
      (window.state.storage.comments || []).some((comment) => (
        comment.type === 'resource_link'
        && String(comment.text || '').includes(resourceId)
        && String(comment.text || '').includes(targetFolderId)
      ))
    ), { resourceId: staticResourceId, targetFolderId: folderId });

    const durableSnapshot = await page.evaluate(({ targetFolderId, resourceIds }) => {
      const raw = localStorage.getItem('brand-portal-local-v1');
      const localStorageState = raw ? JSON.parse(raw) : null;
      return {
        localStorageState,
        remoteComments: JSON.parse(JSON.stringify(window.__persistedComments || [])),
        createCommentCalls: window.__createCommentCalls,
        folderSavedLocally: Boolean(localStorageState?.resourceFolders?.some((folder) => folder.id === targetFolderId)),
        resourcesSavedLocally: resourceIds.every((resourceId) => (
          localStorageState?.resourceLinks?.some((item) => item.id === resourceId && item.folderId === targetFolderId)
        )),
        folderEventSaved: Boolean((window.state.storage.comments || []).some((comment) => (
          comment.type === 'resource_folder' && String(comment.text || '').includes(targetFolderId)
        ))),
        resourceEventsSaved: resourceIds.every((resourceId) => (
          (window.state.storage.comments || []).some((comment) => (
            comment.type === 'resource_link'
            && String(comment.text || '').includes(resourceId)
            && String(comment.text || '').includes(targetFolderId)
          ))
        ))
      };
    }, { targetFolderId: folderId, resourceIds: [LEGACY_RESOURCE_ID, staticResourceId] });
    assert.ok(durableSnapshot.localStorageState, 'Folder persistence must write a localStorage snapshot');
    assert.strictEqual(durableSnapshot.folderSavedLocally, true, 'Created folder must be durable in localStorage');
    assert.strictEqual(durableSnapshot.resourcesSavedLocally, true, 'Both card placements must be durable in localStorage');
    assert.strictEqual(durableSnapshot.folderEventSaved, true, 'Created folder must have a synchronized comment event');
    assert.strictEqual(durableSnapshot.resourceEventsSaved, true, 'Both card placements must have synchronized comment events');
    assert.strictEqual(durableSnapshot.createCommentCalls, 0, 'Storage sync must bypass the createComment override');
    assert.strictEqual(
      durableSnapshot.remoteComments.filter((comment) => comment.type === 'resource_folder').length,
      1,
      'Folder sync must keep one deterministic remote event'
    );
    assert.strictEqual(
      durableSnapshot.remoteComments.filter((comment) => comment.type === 'resource_link').length,
      2,
      'Repeated moves must update deterministic resource events instead of appending duplicates'
    );

    await page.click(`[data-open-document-folder="${folderId}"]`);
    await page.waitForSelector('[data-document-storage-back]');
    await page.evaluate(() => {
      window.setView('control');
      document.getElementById('view-documents')?.classList.remove('active');
      document.getElementById('view-control')?.classList.add('active');
      // A route renderer may replace the previous view contents while away.
      const root = document.getElementById('view-documents');
      if (root) root.innerHTML = '';
      window.setView('documents');
      document.getElementById('view-control')?.classList.remove('active');
      root?.classList.add('active');
      // Use the same public renderer invoked by the production route table.
      window.renderDocuments();
    });
    await assertFolderSurvives(page, folderId, staticResourceId, 'SPA route round-trip');

    await reloadWithStorage(page, port, durableSnapshot.localStorageState);
    await assertFolderSurvives(page, folderId, staticResourceId, 'localStorage reload');

    await page.evaluate(() => localStorage.clear());
    await reloadWithStorage(page, port, {
      comments: durableSnapshot.remoteComments,
      resourceFolders: [],
      resourceLinks: []
    });
    await assertFolderSurvives(page, folderId, staticResourceId, 'comments-only team reload');

    await page.evaluate(() => {
      window.__persistCommentShouldFail = true;
    });
    const failedFolderName = 'Локальная папка при ошибке синхронизации';
    await page.click('[data-document-storage-create-folder]');
    await page.waitForSelector('[data-document-storage-folder-form]');
    await page.fill('[data-document-storage-folder-name]', failedFolderName);
    await page.click('[data-document-storage-create-folder-submit]');
    await page.waitForFunction((title) => (
      window.state.documentStorageStatus?.tone === 'warn'
      && (window.state.storage.resourceFolders || []).some((folder) => folder.title === title)
    ), failedFolderName);
    const failedSyncResult = await page.evaluate((title) => ({
      message: window.state.documentStorageStatus?.message || '',
      tone: window.state.documentStorageStatus?.tone || '',
      localFolderExists: (window.state.storage.resourceFolders || []).some((folder) => folder.title === title),
      remoteFolderExists: (window.__persistedComments || []).some((comment) => (
        comment.type === 'resource_folder' && String(comment.text || '').includes(title)
      )),
      createCommentCalls: window.__createCommentCalls
    }), failedFolderName);
    assert.strictEqual(failedSyncResult.localFolderExists, true, 'Remote failure must not discard the local folder');
    assert.strictEqual(failedSyncResult.remoteFolderExists, false, 'Failed remote persistence must not report a remote event');
    assert.strictEqual(failedSyncResult.tone, 'warn', 'Failed remote persistence must show a warning status');
    assert.match(failedSyncResult.message, /локально|не подтвержд/i, 'Failure status must explain that sync is not confirmed');
    assert.strictEqual(failedSyncResult.createCommentCalls, 0, 'Failure path must still bypass createComment');

    assert.deepStrictEqual(runtimeErrors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  assertStaticContracts();
  await runEarlyHydrationContract();
  await runDomContract();
  console.log('portal-document-storage-folders.selftest: ok');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
