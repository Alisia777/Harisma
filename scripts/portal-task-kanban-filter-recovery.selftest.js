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
      tasks: [
        {
          id: 'task-entry-1',
          title: 'Проверить карточку SKU 123',
          nextAction: 'Обновить статус и передать РОП',
          owner: 'РОП Маша',
          status: 'new',
          priority: 'medium',
          type: 'general',
          source: 'manual',
          due: '2026-07-02',
          platform: 'wb',
          articleKey: 'SKU-123'
        }
      ]
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
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
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

    assert.strictEqual(recovered.version, '20260701-task-entry-light-v1');
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
    assert.strictEqual(recovered.visibleTasks, 1);
    assert.ok(recovered.resultLine.includes('Показано 1 из 1'), recovered.resultLine);
    assert.strictEqual(recovered.hash, '#control');
    assert.strictEqual(recovered.searchParams, '?portal-refresh=fixture');
    assert.strictEqual(recovered.motionVisible, false);

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
