#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MODULE = 'portal-task-kanban-v1.js';
const MOTION_MODULE = 'altea-motion-runtime.js';
const MOTION_CSS = 'altea-motion-runtime.css';

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

function fixtureTasks() {
  return Array.from({ length: 25 }, (_, index) => ({
    id: `task-entry-${index + 1}`,
    title: `Task entry ${String(index + 1).padStart(2, '0')}`,
    nextAction: 'Check that the task board opens fast and can reveal hidden cards',
    owner: 'РОП Маша',
    status: 'new',
    priority: 'medium',
    type: 'general',
    source: index === 0 ? 'auto' : 'manual',
    autoCode: index === 0 ? 'fixture_auto_signal' : '',
    due: '2026-07-02',
    platform: 'wb',
    articleKey: `SKU-${index + 1}`
  }));
}

function fixtureState() {
  return {
    activeView: 'control',
    controlFilters: {
      search: 'stale-hidden-filter',
      owner: 'Несуществующий owner',
      status: 'active',
      type: 'traffic',
      priority: 'critical',
      horizon: 'overdue',
      source: 'auto',
      platform: 'all'
    },
    storage: {
      tasks: fixtureTasks()
    }
  };
}

function serve() {
  const server = http.createServer((req, res) => {
    const pathname = String(req.url || '/').split('?')[0];
    if (pathname === '/' || pathname === '/blank') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><meta charset="utf-8"></head><body data-marketplace="all"><div id="view-control" class="view active"></div></body></html>');
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(pathname).replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/blank?portal-refresh=fixture#control`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((payload) => {
      window.state = payload;
      window.fetch = () => Promise.resolve({ ok: false, json: async () => null });
      localStorage.setItem('altea.portal.marketplace', 'all');
    }, fixtureState());
    await page.addStyleTag({ url: `http://127.0.0.1:${port}/${MOTION_CSS}` });
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/${MOTION_MODULE}` });
    await page.waitForFunction(() => Boolean(window.AlteaMotion), null, { timeout: 30000 });
    await page.evaluate(() => window.AlteaMotion.hide());
    await page.waitForFunction(() => {
      const stage = document.querySelector('.altea-motion-stage');
      return !stage || stage.hidden || !stage.classList.contains('is-visible');
    }, null, { timeout: 30000 });
    await page.evaluate(() => {
      window.AlteaMotion.transition({
        waitForView: 'control',
        view: 'control',
        minDuration: 80,
        label: 'Задачи'
      });
    });
    await page.waitForSelector('.altea-motion-stage.is-visible', { timeout: 30000 });
    await page.waitForTimeout(140);
    const routeMotionStyle = await page.evaluate(() => {
      const stage = document.querySelector('.altea-motion-stage.is-visible');
      const style = stage ? window.getComputedStyle(stage) : null;
      return {
        pointerEvents: style?.pointerEvents || '',
        opacity: Number(style?.opacity || 0)
      };
    });
    assert.strictEqual(routeMotionStyle.pointerEvents, 'none');
    assert.ok(routeMotionStyle.opacity <= 0.62, `Route overlay opacity blocks work: ${routeMotionStyle.opacity}`);
    await page.waitForFunction(() => !document.querySelector('.altea-motion-stage.is-visible'), null, { timeout: 8000 });
    await page.evaluate(() => {
      window.AlteaMotion.transition({
        waitForView: 'control',
        view: 'control',
        minDuration: 80,
        maxDuration: 1800,
        label: 'Задачи'
      });
    });
    await page.addScriptTag({ url: `http://127.0.0.1:${port}/${MODULE}` });
    await page.waitForSelector('[data-task-calendar-design-v1]', { timeout: 30000 });
    await page.waitForSelector('[data-kanban-task="task-entry-1"]', { timeout: 30000 });
    await page.waitForFunction(() => {
      const stage = document.querySelector('.altea-motion-stage');
      return !stage || stage.hidden || !stage.classList.contains('is-visible');
    }, null, { timeout: 30000 });

    const recovered = await page.evaluate(() => ({
      version: window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__?.version,
      search: window.state.controlFilters.search,
      owner: window.state.controlFilters.owner,
      status: window.state.controlFilters.status,
      type: window.state.controlFilters.type,
      priority: window.state.controlFilters.priority,
      horizon: window.state.controlFilters.horizon,
      source: window.state.controlFilters.source,
      platform: window.state.controlFilters.platform,
      visibleTasks: document.querySelectorAll('[data-kanban-task]').length,
      resultLine: document.querySelector('.task-design-result-line')?.textContent || '',
      hash: window.location.hash,
      searchParams: window.location.search,
      motionVisible: Boolean(document.querySelector('.altea-motion-stage.is-visible'))
    }));

    assert.strictEqual(recovered.version, '20260701-task-auto-tombstone-v1');
    assert.deepStrictEqual(
      {
        search: recovered.search,
        owner: recovered.owner,
        status: recovered.status,
        type: recovered.type,
        priority: recovered.priority,
        horizon: recovered.horizon,
        source: recovered.source,
        platform: recovered.platform
      },
      {
        search: '',
        owner: 'all',
        status: 'active',
        type: 'all',
        priority: 'all',
        horizon: 'all',
        source: 'all',
        platform: 'all'
      }
    );
    assert.strictEqual(recovered.visibleTasks, 18);
    assert.ok(recovered.resultLine.includes('Показано 25 из 25'), recovered.resultLine);
    assert.strictEqual(recovered.hash, '#control');
    assert.strictEqual(recovered.searchParams, '?portal-refresh=fixture');
    assert.strictEqual(recovered.motionVisible, false);

    const moreControl = await page.evaluate(() => {
      const button = document.querySelector('[data-task-show-more-lane="new"]');
      return {
        text: button?.textContent || '',
        isButton: button?.tagName === 'BUTTON'
      };
    });
    assert.strictEqual(moreControl.isButton, true);
    assert.ok(moreControl.text.includes('Показать ещё 7'), moreControl.text);
    assert.ok(!moreControl.text.includes('Уточните'), moreControl.text);
    await page.click('[data-task-show-more-lane="new"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-kanban-task]').length === 25, null, { timeout: 30000 });

    await page.evaluate(() => window.AlteaMotion.workspace());
    await page.waitForSelector('.altea-motion-stage.is-visible', { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('.altea-motion-stage.is-visible'), null, { timeout: 12000 });

    await page.evaluate(() => {
      window.__recordedAutoTombstones = [];
      window.recordAutoTaskTombstone = (task) => {
        window.__recordedAutoTombstones.push({
          id: task?.id || '',
          autoCode: task?.autoCode || '',
          status: task?.status || '',
          source: task?.source || ''
        });
        return true;
      };
    });
    await page.click('[data-kanban-task="task-entry-1"]');
    await page.waitForSelector('[data-task-detail-modal]', { timeout: 30000 });
    await page.click('[data-task-detail-status="done"]');
    await page.waitForFunction(() => (window.__recordedAutoTombstones || []).length === 1, null, { timeout: 30000 });
    const tombstoneRecord = await page.evaluate(() => window.__recordedAutoTombstones[0]);
    assert.deepStrictEqual(tombstoneRecord, {
      id: 'task-entry-1',
      autoCode: 'fixture_auto_signal',
      status: 'done',
      source: 'auto'
    });
    await page.click('[data-task-detail-close]');

    await page.evaluate(() => {
      const fullTasks = (window.state.storage.tasks || []).map((task) => ({ ...task }));
      window.__kanbanRemoteFullTasks = fullTasks;
      window.__kanbanRemoteSparseTasks = fullTasks.slice(0, 10);
      window.__kanbanRemoteTasks = window.__kanbanRemoteFullTasks;
      window.__externalUpdateTaskStatusCalled = false;
      window.updateTaskStatus = () => {
        window.__externalUpdateTaskStatusCalled = true;
        throw new Error('external updateTaskStatus should not run for task-kanban-v1 moves');
      };
      window.state.storage.tasks = [];
      window.getAllTasks = () => window.__kanbanRemoteTasks || [];
      window.__ALTEA_TASK_KANBAN_INVALIDATE__?.();
      window.__ALTEA_TASK_KANBAN_RENDER__?.();
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-kanban-task]').length >= 24, null, { timeout: 30000 });
    await page.evaluate(() => {
      window.__kanbanRemoteTasks = window.__kanbanRemoteSparseTasks;
    });
    await page.click('[data-kanban-task="task-entry-2"]');
    await page.waitForSelector('[data-task-detail-modal]', { timeout: 30000 });
    await page.click('[data-task-detail-status="waiting_rop"]');
    await page.waitForFunction(() => {
      const visible = document.querySelectorAll('[data-kanban-task]').length;
      const waiting = document.querySelector('[data-kanban-lane="waiting_rop"] [data-kanban-task="task-entry-2"]');
      return visible >= 24 && Boolean(waiting);
    }, null, { timeout: 30000 });
    const sparseGuard = await page.evaluate(() => ({
      visibleTasks: document.querySelectorAll('[data-kanban-task]').length,
      resultLine: document.querySelector('.task-design-result-line')?.textContent || '',
      statusFilter: window.state.controlFilters.status,
      sourceFilter: window.state.controlFilters.source,
      horizonFilter: window.state.controlFilters.horizon,
      externalUpdateCalled: Boolean(window.__externalUpdateTaskStatusCalled)
    }));
    assert.ok(sparseGuard.visibleTasks >= 24, sparseGuard.resultLine);
    assert.ok(/24\s+\D+\s+25/.test(sparseGuard.resultLine), sparseGuard.resultLine);
    assert.strictEqual(sparseGuard.statusFilter, 'active');
    assert.strictEqual(sparseGuard.sourceFilter, 'all');
    assert.strictEqual(sparseGuard.horizonFilter, 'all');
    assert.strictEqual(sparseGuard.externalUpdateCalled, false);
    await page.click('[data-task-detail-close]');

    await page.fill('[data-task-filter="search"]', 'ручной пустой поиск');
    await page.waitForFunction(() => window.state.controlFilters.search === 'ручной пустой поиск', null, { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('[data-kanban-task="task-entry-1"]'), null, { timeout: 30000 });
    await page.waitForTimeout(1600);

    const manualEmpty = await page.evaluate(() => ({
      search: window.state.controlFilters.search,
      visibleTasks: document.querySelectorAll('[data-kanban-task]').length,
      emptyText: document.querySelector('.task-design-empty')?.textContent || ''
    }));
    assert.strictEqual(manualEmpty.search, 'ручной пустой поиск');
    assert.strictEqual(manualEmpty.visibleTasks, 0);
    assert.ok(/Нет задач|текущим фильтрам/.test(manualEmpty.emptyText), manualEmpty.emptyText);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().then(() => {
  console.log('portal-task-kanban-filter-recovery.selftest: ok');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
