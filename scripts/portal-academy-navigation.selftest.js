#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const RENDER_DELAY_MS = 1400;
const NEXT_VIEW = ['iu', 'drr'].join('-');
const PREMIUM_PRESENTATION_SOURCE = fs.readFileSync(path.join(ROOT, 'portal-premium-presentation.js'), 'utf8');
const ENTRYPOINT_SOURCES = ['index.html', 'live-index.html', path.join('docs', 'index.html')]
  .map((file) => ({ file, source: fs.readFileSync(path.join(ROOT, file), 'utf8') }));

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function assertLaunchControlIsRetiredFromPrimaryNavigation() {
  assert.doesNotMatch(
    PREMIUM_PRESENTATION_SOURCE,
    /\{[^{}]*\bid\s*:\s*['"]launch-control['"][^{}]*\}/,
    'launch-control must not be rendered as a primary premium navigation card'
  );
  ENTRYPOINT_SOURCES.forEach(({ file, source }) => {
    assert.doesNotMatch(source, /data-view=['"]launch-control['"]/, `${file} must not register launch-control navigation`);
    assert.doesNotMatch(source, /id=['"]view-launch-control['"]/, `${file} must not register a launch-control section`);
  });
}

function fixtureHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Academy navigation selftest</title>
  <style>
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body { color: #f8efe0; background: #08090c; font: 16px/1.4 Arial, sans-serif; }
    .app-shell { display: grid; grid-template-columns: 250px minmax(0, 1fr); width: 100%; height: 100vh; }
    .sidebar { position: relative; z-index: 2; padding: 22px 16px; background: #0c0d10; }
    .nav-btn { display: block; width: 100%; min-height: 54px; margin: 0 0 32px; color: inherit; background: #15171d; border: 1px solid #4a4030; }
    .nav-btn.active { border-color: #e5c784; }
    .premium-fixture-nav { display: grid; gap: 8px; margin-top: 28px; }
    .premium-fixture-nav button { min-height: 36px; color: inherit; background: #101116; border: 1px solid #3a3328; }
    .premium-fixture-nav button.is-active { border-color: #e5c784; }
    .main { height: 100vh; min-width: 0; overflow: auto; overscroll-behavior: auto; }
    .topbar { position: sticky; top: 0; z-index: 3; height: 58px; padding: 16px 22px; background: #101116; border-bottom: 1px solid #3a3328; }
    .view { display: none; min-height: 2700px; padding: 28px; }
    .view.active { display: block; }
    .view[aria-busy="true"] { min-height: 2700px; }
    .section-title { padding: 20px; border: 1px solid #50452f; background: #15171d; }
    .fixture-copy { max-width: 760px; }
    .fixture-spacer { height: 2250px; }
  </style>
</head>
<body>
  <div id="altea-premium-app" data-premium-active-route="executive" hidden></div>
  <div class="app-shell">
    <aside class="sidebar">
      <button class="nav-btn active" data-view="executive"><span>Руководителю</span></button>
      <button class="nav-btn" data-view="sku-plan-fact"><span>План-факт SKU</span></button>
      <button class="nav-btn" data-view="prices"><span>Цены</span></button>
      <button class="nav-btn" data-view="launches"><span>Новинки</span></button>
      <button class="nav-btn nav-btn-legacy-hidden" data-view="launch-control" hidden aria-hidden="true" tabindex="-1"><span>Запуск новинок</span></button>
      <button class="nav-btn" data-view="${NEXT_VIEW}"><span>ИУ / ДРР</span></button>
      <nav class="premium-fixture-nav" aria-label="Премиальная навигация">
        <button class="is-active" data-premium-nav="executive">Руководителю premium</button>
        <button data-premium-nav="sku-plan-fact">План-факт premium</button>
        <button data-premium-nav="prices">Цены premium</button>
        <button data-premium-nav="launches">Новинки premium</button>
        <button data-premium-nav="launch-control">Устаревший запуск premium</button>
        <button data-premium-nav="${NEXT_VIEW}">ИУ / ДРР premium</button>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar"><span id="syncStatusBadge">Данные готовы</span></header>
      <section class="view active" id="view-executive" data-fixture-ready="true">
        <div class="section-title"><h1>Руководителю</h1></div>
        <p class="fixture-copy">Готовая управленческая поверхность с рисками, решениями и контрольными показателями.</p>
        <div class="fixture-spacer"></div>
      </section>
      <section class="view" id="view-sku-plan-fact" data-fixture-ready="false"></section>
      <section class="view" id="view-prices" data-fixture-ready="false"></section>
      <section class="view" id="view-launches" data-fixture-ready="false"></section>
      <section class="view" id="view-launch-control" data-fixture-ready="false" hidden aria-hidden="true"></section>
      <section class="view" id="view-${NEXT_VIEW}" data-fixture-ready="false"></section>
    </main>
  </div>
  <script>
    (function () {
      var currentView = 'executive';
      var pending = Object.create(null);
      var state = {
        activeView: currentView,
        boot: { dataReady: true }
      };
      window.__alteaAppState = state;
      window.state = state;
      window.__academyFixture = {
        delay: ${RENDER_DELAY_MS},
        visited: ['executive'],
        ready: ['executive'],
        started: []
      };

      function titleFor(view) {
        if (view === 'sku-plan-fact') return 'План-факт SKU';
        if (view === 'prices') return 'Цены';
        if (view === 'launches') return 'Новинки';
        if (view === '${NEXT_VIEW}') return 'ИУ / ДРР';
        return 'Руководителю';
      }

      function markActive(view) {
        document.querySelectorAll('.nav-btn[data-view]').forEach(function (button) {
          button.classList.toggle('active', button.getAttribute('data-view') === view);
        });
        document.querySelectorAll('[data-premium-nav]').forEach(function (button) {
          button.classList.toggle('is-active', button.getAttribute('data-premium-nav') === view);
        });
        document.querySelectorAll('.view').forEach(function (section) {
          section.classList.toggle('active', section.id === 'view-' + view);
        });
        state.activeView = view;
        currentView = view;
        history.replaceState(null, '', '#'+ view);
        window.dispatchEvent(new CustomEvent('altea:viewchange', {
          detail: { view: view, source: 'academy-fixture' }
        }));
      }

      function renderReady(view) {
        var section = document.getElementById('view-' + view);
        section.removeAttribute('aria-busy');
        section.setAttribute('data-fixture-ready', 'true');
        section.innerHTML = '<div class="section-title"><h1>' + titleFor(view) + '</h1></div>'
          + '<p class="fixture-copy">Готовая рабочая поверхность: данные, фильтры и действия раздела полностью отрисованы.</p>'
          + '<div class="fixture-spacer"></div>';
        window.__academyFixture.ready.push(view);
        window.dispatchEvent(new CustomEvent('altea:view-data-ready', { detail: { view: view } }));
        window.dispatchEvent(new CustomEvent('altea:data-ready', { detail: { view: view } }));
      }

      window.setView = function setView(view) {
        var section = document.getElementById('view-' + view);
        if (!section) return Promise.reject(new Error('Unknown view: ' + view));
        if (currentView !== view) window.__academyFixture.visited.push(view);
        markActive(view);
        if (section.getAttribute('data-fixture-ready') === 'true') return Promise.resolve(view);
        if (pending[view]) return pending[view];

        section.setAttribute('aria-busy', 'true');
        section.replaceChildren();
        window.__academyFixture.started.push(view);
        pending[view] = new Promise(function (resolve) {
          window.setTimeout(function () {
            renderReady(view);
            resolve(view);
          }, window.__academyFixture.delay);
        });
        return pending[view];
      };

      document.addEventListener('click', function (event) {
        var premiumButton = event.target.closest('[data-premium-nav]');
        if (premiumButton) {
          var premiumView = premiumButton.getAttribute('data-premium-nav');
          document.getElementById('altea-premium-app').setAttribute('data-premium-active-route', premiumView);
          window.setView(premiumView);
          return;
        }
        var button = event.target.closest('.nav-btn[data-view]');
        if (button) window.setView(button.getAttribute('data-view'));
      });
    })();
  </script>
  <script src="/portal-academy-tour.js"></script>
</body>
</html>`;
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '/academy-navigation-fixture.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fixtureHtml());
      return;
    }

    const rel = pathname.replace(/^\/+/, '');
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function waitForStep(page, stepId) {
  await page.waitForFunction((expected) => (
    window.alteaAcademyTour?.progress?.().currentStep === expected
  ), stepId, { timeout: 5000 });
}

function primaryButton(page) {
  return page.locator('.academy-coach-card .academy-btn-primary').first();
}

async function waitForPrimaryEnabled(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('.academy-coach-card .academy-btn-primary');
    return Boolean(button && !button.disabled);
  }, null, { timeout: 5000 });
}

async function clickNext(page, expectedStep) {
  await primaryButton(page).click({ timeout: 5000 });
  await waitForStep(page, expectedStep);
}

async function cardRect(page) {
  return page.locator('.academy-coach-card').evaluate((card) => {
    const rect = card.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
}

function assertCardInsideViewport(rect, label) {
  assert.ok(rect.width > 0 && rect.height > 0, `${label}: academy card has no size`);
  assert.ok(rect.left >= -1, `${label}: card left edge escaped viewport (${rect.left})`);
  assert.ok(rect.top >= -1, `${label}: card top edge escaped viewport (${rect.top})`);
  assert.ok(rect.right <= rect.viewportWidth + 1, `${label}: card right edge escaped viewport (${rect.right})`);
  assert.ok(rect.bottom <= rect.viewportHeight + 1, `${label}: card bottom edge escaped viewport (${rect.bottom})`);
}

function rectDrift(first, second) {
  return Math.max(
    Math.abs(first.left - second.left),
    Math.abs(first.top - second.top),
    Math.abs(first.width - second.width),
    Math.abs(first.height - second.height)
  );
}

async function assertStableCard(page, label) {
  const first = await cardRect(page);
  assertCardInsideViewport(first, label);
  await page.waitForTimeout(300);
  const second = await cardRect(page);
  assertCardInsideViewport(second, label);
  assert.ok(rectDrift(first, second) <= 2, `${label}: card drifted while target was unchanged`);
}

async function scrollState(page) {
  return page.evaluate(() => {
    const main = document.querySelector('.main');
    return {
      windowY: window.scrollY,
      documentTop: document.documentElement.scrollTop,
      bodyTop: document.body.scrollTop,
      mainTop: main.scrollTop,
      mainMax: main.scrollHeight - main.clientHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      mainOverflow: getComputedStyle(main).overflowY
    };
  });
}

async function assertUserScrollLocked(page, label) {
  await page.waitForTimeout(300);
  const before = await scrollState(page);
  assert.ok(before.mainMax > 600, `${label}: fixture must expose a genuinely scrollable main surface`);
  const delta = before.mainTop < before.mainMax / 2 ? 700 : -700;

  await page.mouse.move(1120, 680);
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(180);
  const afterWheel = await scrollState(page);
  assert.strictEqual(afterWheel.windowY, before.windowY, `${label}: window scrolled through academy overlay`);
  assert.strictEqual(afterWheel.documentTop, before.documentTop, `${label}: document scrolled through academy overlay`);
  assert.strictEqual(afterWheel.bodyTop, before.bodyTop, `${label}: body scrolled through academy overlay`);
  assert.ok(Math.abs(afterWheel.mainTop - before.mainTop) <= 1,
    `${label}: main scroll container moved from ${before.mainTop} to ${afterWheel.mainTop}`);

  await page.keyboard.press(delta > 0 ? 'PageDown' : 'PageUp');
  await page.waitForTimeout(180);
  const afterKey = await scrollState(page);
  assert.ok(Math.abs(afterKey.mainTop - before.mainTop) <= 1,
    `${label}: keyboard scrolling moved main from ${before.mainTop} to ${afterKey.mainTop}`);
}

async function assertDelayedTransition(page, view, navStep) {
  await clickNext(page, navStep);

  await page.waitForFunction((targetView) => (
    window.__alteaAppState?.activeView === targetView
      && document.getElementById('view-' + targetView)?.getAttribute('aria-busy') === 'true'
  ), view, { timeout: 2000 });

  await page.waitForTimeout(80);
  assert.strictEqual(await primaryButton(page).isDisabled(), true,
    `${view}: “Далее” must be disabled as soon as target navigation starts`);

  await page.waitForTimeout(380);
  assert.strictEqual(
    await page.locator(`#view-${view}`).getAttribute('data-fixture-ready'),
    'false',
    `${view}: fixture became ready before the delayed-state assertion`
  );
  assert.strictEqual(await primaryButton(page).isDisabled(), true,
    `${view}: “Далее” became enabled while target content was still empty`);

  await assertStableCard(page, `${view} loading`);
  await assertUserScrollLocked(page, `${view} loading`);

  await page.waitForFunction((targetView) => (
    document.getElementById('view-' + targetView)?.getAttribute('data-fixture-ready') === 'true'
  ), view, { timeout: RENDER_DELAY_MS + 3000 });
  await waitForPrimaryEnabled(page);
  await assertStableCard(page, `${view} ready`);
}

async function run() {
  assertLaunchControlIsRetiredFromPrimaryNavigation();
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.addInitScript(() => localStorage.clear());
    await page.goto(`http://127.0.0.1:${port}/academy-navigation-fixture.html?academy=off#executive`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForFunction(() => Boolean(window.alteaAcademyTour), null, { timeout: 5000 });
    assert.strictEqual(await page.locator('.nav-btn[data-view="launch-control"]:visible').count(), 0,
      'retired legacy launch-control navigation must stay hidden');
    assert.strictEqual(await page.locator('[data-premium-nav="launch-control"]:visible').count(), 1,
      'fixture must expose a stale premium button to prove Academy filters retired routes');
    await page.evaluate(() => window.alteaAcademyTour.start('executive'));
    const visitedTourSteps = [];
    await waitForStep(page, 'nav-executive');
    visitedTourSteps.push('nav-executive');
    await waitForPrimaryEnabled(page);
    await assertUserScrollLocked(page, 'executive navigation');

    await clickNext(page, 'section-executive');
    visitedTourSteps.push('section-executive');
    await waitForPrimaryEnabled(page);
    await assertStableCard(page, 'executive section');

    await assertDelayedTransition(page, 'sku-plan-fact', 'nav-sku-plan-fact');
    visitedTourSteps.push('nav-sku-plan-fact');
    await clickNext(page, 'section-sku-plan-fact');
    visitedTourSteps.push('section-sku-plan-fact');
    await waitForPrimaryEnabled(page);
    await assertStableCard(page, 'sku-plan-fact section');

    await assertDelayedTransition(page, 'prices', 'nav-prices');
    visitedTourSteps.push('nav-prices');
    await clickNext(page, 'section-prices');
    visitedTourSteps.push('section-prices');
    await waitForPrimaryEnabled(page);
    await assertStableCard(page, 'prices section');

    await assertDelayedTransition(page, 'launches', 'nav-launches');
    visitedTourSteps.push('nav-launches');
    await clickNext(page, 'section-launches');
    visitedTourSteps.push('section-launches');
    await waitForPrimaryEnabled(page);
    await assertStableCard(page, 'launches section');

    const nextNavStep = `nav-${NEXT_VIEW}`;
    const nextSectionStep = `section-${NEXT_VIEW}`;
    await assertDelayedTransition(page, NEXT_VIEW, nextNavStep);
    visitedTourSteps.push(nextNavStep);
    await clickNext(page, nextSectionStep);
    visitedTourSteps.push(nextSectionStep);
    await waitForPrimaryEnabled(page);
    await assertStableCard(page, `${NEXT_VIEW} section`);

    assert.deepStrictEqual(
      visitedTourSteps.slice(-3),
      ['section-launches', nextNavStep, nextSectionStep],
      'Academy must continue directly from launches to the next available section'
    );
    assert.ok(
      visitedTourSteps.every((stepId) => !stepId.includes('launch-control')),
      `Academy exposed retired launch-control steps: ${visitedTourSteps.join(', ')}`
    );

    const result = await page.evaluate(() => ({
      visited: window.__academyFixture.visited,
      started: window.__academyFixture.started,
      ready: window.__academyFixture.ready,
      activeView: window.__alteaAppState.activeView,
      currentStep: window.alteaAcademyTour.progress().currentStep,
      tourActive: document.body.classList.contains('altea-academy-tour-active')
    }));

    assert.deepStrictEqual(result.visited, ['executive', 'sku-plan-fact', 'prices', 'launches', NEXT_VIEW]);
    assert.deepStrictEqual(result.started, ['sku-plan-fact', 'prices', 'launches', NEXT_VIEW]);
    assert.deepStrictEqual(result.ready, ['executive', 'sku-plan-fact', 'prices', 'launches', NEXT_VIEW]);
    assert.strictEqual(result.activeView, NEXT_VIEW);
    assert.strictEqual(result.currentStep, nextSectionStep);
    assert.strictEqual(result.tourActive, true);
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().then(() => {
  console.log('portal-academy-navigation.selftest: ok');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
