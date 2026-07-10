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

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertStaticContracts() {
  const storageModule = read(STORAGE_MODULE);
  const appCore01 = read('app-core-01.js');
  const appCore02 = read('app-core-02.js');
  const appCore03 = read('app-core-03.js');
  const teamHotfix = read('portal-team-runtime-hotfix.js');

  for (const selector of [
    'data-document-storage-create-folder',
    'data-document-storage-folder-form',
    'data-document-storage-folder-name',
    'data-document-storage-create-folder-submit',
    'data-open-document-folder',
    'data-document-storage-back',
    'data-move-resource-link',
    'data-delete-document-folder'
  ]) {
    assert.ok(storageModule.includes(selector), `${STORAGE_MODULE} must expose [${selector}]`);
  }
  assert.match(storageModule, /name=["']folderId["']/, 'Upload form must expose a folder target select');

  assert.match(appCore01, /resourceFolders\s*:\s*\[\]/, 'Default storage must initialize resourceFolders');
  assert.match(appCore02, /resourceFolders\s*:\s*Array\.isArray\(parsed\.resourceFolders\)/, 'Storage normalization must preserve resourceFolders');
  assert.match(appCore02, /resourceFolders\s*:\s*snapshot\.resourceFolders/, 'Storage backup/history must preserve resourceFolders');
  assert.match(appCore02, /resourceFolders\s*:\s*Array\.isArray\(imported\.resourceFolders\)/, 'Storage import must preserve resourceFolders');

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
    documents: { groups: [] },
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

async function installFixture(page) {
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
    window.saveLocalStorage = (options = {}) => {
      window.__storageSaveReasons.push(String(options.reason || ''));
      localStorage.setItem('brand-portal-local-v1', JSON.stringify(window.state.storage));
    };
    window.createComment = async (comment) => {
      window.state.storage.comments = Array.isArray(window.state.storage.comments) ? window.state.storage.comments : [];
      const index = window.state.storage.comments.findIndex((item) => item.id === comment.id);
      if (index >= 0) window.state.storage.comments.splice(index, 1, comment);
      else window.state.storage.comments.unshift(comment);
      return comment;
    };
    window.persistComment = async () => {};
    window.setView = (view) => {
      window.state.activeView = view;
    };
  }, { state: fixtureState() });
}

async function visibleText(page) {
  return page.locator('#view-documents').innerText();
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
    await page.click('[data-document-storage-back]');
    await page.waitForSelector(`[data-open-document-folder="${folderId}"]`);
    assert.ok((await visibleText(page)).includes(LEGACY_RESOURCE_TITLE), 'Back must return to the root folder');

    const moveControl = page.locator(`[data-move-resource-link="${LEGACY_RESOURCE_ID}"]`).first();
    assert.strictEqual(await moveControl.evaluate((element) => element.tagName), 'SELECT', 'Move control must be a select for deterministic keyboard access');
    await moveControl.selectOption(folderId);
    await page.waitForFunction(({ resourceId, targetFolderId }) => (
      window.state.storage.resourceLinks || []
    ).find((item) => item.id === resourceId)?.folderId === targetFolderId, {
      resourceId: LEGACY_RESOURCE_ID,
      targetFolderId: folderId
    });
    assert.ok(!(await visibleText(page)).includes(LEGACY_RESOURCE_TITLE), 'Moved resource must leave root immediately');

    await page.click(`[data-open-document-folder="${folderId}"]`);
    await page.waitForSelector('[data-document-storage-back]');
    assert.ok((await visibleText(page)).includes(LEGACY_RESOURCE_TITLE), 'Moved resource must be visible inside its folder');
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

    assert.deepStrictEqual(runtimeErrors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  assertStaticContracts();
  await runDomContract();
  console.log('portal-document-storage-folders.selftest: ok');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
