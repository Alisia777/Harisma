const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MODULE = path.join(ROOT, 'portal-wb-rating-feedback-ux.js');
const moduleSource = fs.readFileSync(MODULE, 'utf8');
const interfaceSource = fs.readFileSync(path.join(ROOT, 'portal-interface-optimization.css'), 'utf8');
const workbenchSource = fs.readFileSync(path.join(ROOT, 'portal-wb-rating-workbench-v2.css'), 'utf8');
const reportSource = fs.readFileSync(path.join(ROOT, 'portal-wb-rating-report-hotfix.js'), 'utf8');
const authSource = fs.readFileSync(path.join(ROOT, 'portal-auth-access.js'), 'utf8');
const coreSource = fs.readFileSync(path.join(ROOT, 'app-core-01.js'), 'utf8');
const coreUiSource = fs.readFileSync(path.join(ROOT, 'app-core-02.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function metricCard(platform, index) {
  return `<button class="rating-planfact-card" data-rating-platform="${platform}"><span>${platform}-${index}</span></button>`;
}

function cells(prefix) {
  return Array.from({ length: 18 }, (_, index) => {
    if (index === 0) return `<td class="article-cell"><strong>${prefix}</strong></td>`;
    return `<td>${prefix}-${index + 1}</td>`;
  }).join('');
}

async function main() {
  const finalOzonHistoryStart = reportSource.lastIndexOf('function renderOzonHistoryCards');
  const finalOzonHistory = reportSource.slice(
    finalOzonHistoryStart,
    reportSource.indexOf('function renderOzonQuestions', finalOzonHistoryStart)
  );
  assert.match(
    reportSource,
    /filterOzonRows[\s\S]+ratingSearchQuery\(\)[\s\S]+ratingRowSearchText\(row,\s*'ozon'\)/,
    'Ozon table search must use the same article and workflow search contract'
  );
  assert.match(reportSource, /data-rating-more/, 'large result sets must expose progressive loading');
  assert.match(
    reportSource,
    /RATING_SEARCH_DEBOUNCE_MS\s*=\s*180[\s\S]+setTimeout\(applySearch,\s*RATING_SEARCH_DEBOUNCE_MS\)/,
    'search must debounce expensive report rerenders'
  );
  assert.match(
    reportSource,
    /sellerRating[\s\S]+totals\.avgRating\s*=\s*totals\.sellerRating\s*\?\?\s*totals\.cardAvgRating/,
    'overall WB rating must prefer the current seller rating returned by WB API'
  );
  assert.match(
    reportSource,
    /workbenchState\.rowLimit\s*=\s*currentRowLimit\(\)\s*\+\s*RATING_RENDER_LIMIT/,
    'progressive loading must increase the current row budget'
  );
  assert.match(finalOzonHistory, /data-rating-detail=/, 'Ozon history rows must expose their article');
  assert.match(finalOzonHistory, /data-rating-platform="ozon"/, 'Ozon history rows must identify their platform');
  assert.match(finalOzonHistory, /currentRowLimit\(\)/, 'Ozon history rows must use progressive loading');
  assert.match(finalOzonHistory, /renderMoreRows\(filteredRows\.length\)/, 'Ozon history must expose more rows');
  assert.match(reportSource, /ratingWorkflowMatches\(row,\s*'ozon'\)/, 'Ozon status must filter source rows');
  assert.match(reportSource, /ratingWorkflowMatches\(row,\s*'wb'\)/, 'WB status must filter source rows');
  assert.match(
    reportSource,
    /ratingWorkflowMatches\(item,\s*structuredState\.platform\)/,
    'review and question queues must filter source items'
  );
  assert.match(reportSource, /model\.snapshots\.length/, 'historical snapshots must stay available');
  assert.match(authSource, /var EMPLOYEE_VIEWS\s*=\s*\[[\s\S]*?'wb-rating'/, 'employees must retain access to reviews');
  assert.match(coreSource, /comments:\s*'portal_comments'/, 'workflow must reuse the shared comments table');
  assert.match(
    indexSource,
    /portal-wb-rating-feedback-ux\.js\?v=20260728ratinglayout2/,
    'reviews UX must cache-bust the corrected header and theme contract'
  );
  assert.match(
    interfaceSource,
    /portal-wb-rating-workbench-v2\.css\?v=20260728ratinglayout2/,
    'interface entrypoint must cache-bust the reviews workbench theme contract'
  );

  const commentHelpers = coreUiSource.slice(
    coreUiSource.indexOf('function commentTypeChip'),
    coreUiSource.indexOf('function mapTaskStatus')
  );
  const helperContext = {
    badge: (label, tone = '') => `${tone}:${label}`
  };
  vm.runInNewContext(commentHelpers, helperContext);
  const workflowComment = {
    type: 'rating_workflow',
    text: '[[rating-workflow:v1]][[platform:ozon]][[status:progress]][[entry:feedback]][[owner:%D0%90%D0%BD%D0%BD%D0%B0]][[due:2026-08-01]]Проверить карточку'
  };
  assert.equal(helperContext.commentTypeChip('rating_workflow'), 'info:Отзывы');
  assert.equal(
    helperContext.commentDisplayText(workflowComment),
    'OZON · Отзыв по артикулу · В работе · ответственный Анна · срок 2026-08-01 — Проверить карточку',
    'shared comment feeds must render readable workflow text without metadata markers'
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message || String(error)));

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="ru" data-theme="porcelain-day">
      <head>
        <meta charset="utf-8">
        <style>
          :root {
            --bg:#f3efe7; --surface:#fffdf9; --panel:#f8f3eb;
            --text:#241f1a; --muted:#756b61; --line:#d6cab9;
            --accent:#9b7953; --ok:#18794e; --warn:#a06416; --danger:#b42318;
            --portal-theme-accent:#9b7953;
            --portal-theme-control:#f8f3eb;
            --portal-theme-surface:#fffdf9;
            --portal-theme-surface-strong:#fffaf2;
            --portal-theme-active:#eadfc9;
            --portal-theme-primary:#ead5ad;
            --portal-theme-primary-text:#241f1a;
          }
          * { box-sizing:border-box; }
          body { background:var(--bg); color:var(--text); font-family:Arial,sans-serif; }
          .section-title { display:flex; justify-content:space-between; }
          .rating-planfact-board { display:grid; grid-template-columns:repeat(5,1fr); }
          .rating-work-table { width:900px; overflow:auto; }
          .rating-work-table table { min-width:2060px; border-collapse:separate; border-spacing:0; table-layout:fixed; }
          .rating-work-table th,.rating-work-table td { padding:8px; }
          .rating-sort-control { display:flex; gap:4px; }
        </style>
      </head>
      <body class="v87-imperial altea-premium-shell" data-theme="porcelain-day">
        <section id="view-wb-rating">
          <div class="section-title"><div><h2>Отзывы</h2></div></div>
          <div class="rating-planfact-toolbar">
            <div class="rating-platform-selector">
              <button class="active" data-rating-platform="wb">WB</button>
              <button data-rating-platform="ozon">Ozon</button>
            </div>
          </div>
          <div class="rating-planfact-board">
            ${Array.from({ length: 5 }, (_, index) => metricCard('wb', index)).join('')}
            ${Array.from({ length: 5 }, (_, index) => metricCard('ozon', index)).join('')}
          </div>
          <div class="rating-sort-control">
            <span>Фильтр</span>
            <button class="active" data-rating-status="all">Все</button>
            <button data-rating-status="negative">Негатив</button>
            <button data-rating-status="unanswered">Без ответа</button>
          </div>
          <div class="rating-sort-control">
            <span>Сортировка</span>
            <button class="active" data-rating-sort="revenue">Выручка</button>
            <button data-rating-sort="reviews7">Отзывы 7д</button>
            <button data-rating-sort="negative7">Негатив 7д</button>
            <button data-rating-sort="questions">Вопросы</button>
          </div>
          <div class="rating-work-table">
            <table>
              <colgroup>
                <col style="width:230px"><col style="width:120px"><col style="width:118px"><col style="width:86px"><col style="width:86px"><col style="width:92px"><col style="width:96px"><col style="width:96px"><col style="width:120px"><col style="width:98px"><col style="width:98px"><col style="width:104px"><col style="width:94px"><col style="width:92px"><col style="width:92px"><col style="width:92px"><col style="width:112px"><col style="width:138px">
              </colgroup>
              <thead><tr>${Array.from({ length: 18 }, (_, index) => `<th>H${index + 1}</th>`).join('')}</tr></thead>
              <tbody>
                <tr class="rating-work-row" data-rating-detail="WB-ARTICLE-1" data-rating-platform="wb">${cells('WB-ARTICLE-1')}</tr>
                <tr class="rating-work-row" data-rating-detail="WB-ARTICLE-2" data-rating-platform="wb">${cells('WB-ARTICLE-2')}</tr>
                <tr class="rating-work-row" data-rating-detail="OZON-ARTICLE-1" data-rating-platform="ozon">${cells('OZON-ARTICLE-1')}</tr>
              </tbody>
            </table>
          </div>
        </section>
      </body>
      </html>
    `);

    await page.evaluate(() => {
      window.__copied = '';
      window.__remoteComments = [];
      window.__alteaAppState = {
        team: {
          mode: 'ready',
          accessToken: 'employee-access-token',
          member: { name: 'Тестовый сотрудник', role: 'Маркетплейсы' }
        },
        wbFeedbacks: {
          generatedAt: '2026-07-27T09:00:00.000Z',
          window: { to: '2026-07-27' },
          cards: []
        },
        storage: { comments: [] }
      };
      window.APP_CONFIG = {
        wbFeedbackSyncEndpoint: 'https://example.test/functions/v1/wb-feedback-sync',
        supabase: { anonKey: 'public-anon-key' }
      };
      window.__feedbackSyncRequests = [];
      window.__ALTEA_WB_FEEDBACK_SYNC_TEST_POLL_MS__ = 0;
      window.fetch = async (url, options) => {
        window.__feedbackSyncRequests.push({ url: String(url), options: structuredClone(options || {}) });
        return {
          ok: true,
          status: 202,
          json: async () => ({ ok: true, status: 'queued' })
        };
      };
      window.__alteaRefreshSnapshotBackedState = async () => {
        window.__alteaAppState.wbFeedbacks.generatedAt = '2026-07-28T12:00:00.000Z';
        window.__alteaAppState.wbFeedbacks.window.to = '2026-07-28';
        return true;
      };
      window.hasRemoteStore = () => true;
      window.teamMemberLabel = () => 'Маркетплейсы';
      window.createComment = async (comment) => {
        const normalized = {
          ...comment,
          id: `comment-${window.__alteaAppState.storage.comments.length + 1}`,
          createdAt: new Date().toISOString()
        };
        window.__alteaAppState.storage.comments.push(normalized);
        window.__remoteComments.push(structuredClone(normalized));
        return normalized;
      };
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value) => { window.__copied = value; } }
      });
    });

    await page.addStyleTag({ content: workbenchSource });
    await page.addScriptTag({ content: moduleSource });
    await page.waitForTimeout(80);

    assert.equal(await page.locator('[data-rating-feedback-toolbar]').count(), 1, 'toolbar must be added once');
    assert.equal(await page.locator('[data-rating-ux-select]').count(), 2, 'large filter groups must collapse to selects');
    assert.equal(await page.locator('[data-rating-row-actions]').count(), 3, 'each WB and Ozon row must receive actions');
    assert.equal(await page.locator('[data-rating-comment-head]').count(), 1, 'the table must expose one explicit team comment column');
    assert.equal(await page.locator('[data-rating-comment-col]').count(), 1, 'the table must expose one matching comment col');
    assert.equal(await page.locator('[data-rating-comment-cell]').count(), 3, 'each article must expose its own team comment cell');
    assert.match(await page.locator('[data-rating-comment-head]').innerText(), /Комментарий команде/);
    assert.match(await page.locator('[data-rating-comment-head]').innerText(), /Google-таблице/);
    assert.equal(await page.locator('[data-rating-smart-board]').count(), 1, 'premium smart board must be added once');
    assert.equal(await page.locator('[data-rating-smart-filter]').count(), 5, 'smart board must expose five quick filters');
    assert.match(await page.locator('[data-rating-smart-board]').innerText(), /Приоритет команды на сегодня/);
    assert.match(await page.locator('[data-rating-feedback-toolbar]').innerText(), /Действия по артикулу/);
    assert.equal(await page.locator('[data-rating-data-refresh]').count(), 1, 'WB refresh action must be visible once');
    assert.match(await page.locator('[data-rating-data-refresh-status]').innerText(), /каждые 30 минут/);
    const lightThemeMetrics = await page.evaluate(() => ({
      boardBackground: getComputedStyle(document.querySelector('[data-rating-smart-board]')).backgroundColor,
      boardHeading: getComputedStyle(document.querySelector('[data-rating-smart-board] h3')).color,
      refreshText: getComputedStyle(document.querySelector('.rating-data-refresh button')).color,
      cellText: getComputedStyle(document.querySelector('.rating-work-table td')).color
    }));
    assert.equal(lightThemeMetrics.boardBackground, 'rgb(255, 250, 242)', 'light theme must remove the dark smart-board residue');
    assert.equal(lightThemeMetrics.boardHeading, 'rgb(36, 31, 26)', 'light smart-board heading must stay readable');
    assert.equal(lightThemeMetrics.refreshText, 'rgb(36, 31, 26)', 'light refresh action must not keep pale dark-theme text');
    assert.equal(lightThemeMetrics.cellText, 'rgb(36, 31, 26)', 'light table cells must use the active theme text');

    const tableGeometry = await page.evaluate(() => {
      const table = document.querySelector('.rating-work-table table');
      const first = table.querySelector('thead th:nth-child(1)').getBoundingClientRect();
      const second = table.querySelector('thead th:nth-child(2)').getBoundingClientRect();
      const note = table.querySelector('[data-rating-comment-cell] .rating-note-button').getBoundingClientRect();
      const noteBox = table.querySelector('[data-rating-comment-cell] .rating-team-comment-box').getBoundingClientRect();
      return {
        tableWidth: table.getBoundingClientRect().width,
        firstWidth: first.width,
        secondWidth: second.width,
        adjacentGap: second.left - first.right,
        noteInside: note.left >= noteBox.left && note.right <= noteBox.right
      };
    });
    assert.equal(tableGeometry.tableWidth, 2244, 'table width must equal the complete 19-column contract');
    assert.equal(tableGeometry.firstWidth, 230, 'article column must keep its declared width');
    assert.equal(tableGeometry.secondWidth, 280, 'team comment column must keep its declared width');
    assert.equal(tableGeometry.adjacentGap, 0, 'sticky columns must meet without overlap or a gap');
    assert.equal(tableGeometry.noteInside, true, 'comment action must remain inside its cell');

    await page.evaluate(() => {
      const header = document.querySelector('.rating-work-table thead th:nth-child(3)');
      const button = document.createElement('button');
      button.className = 'altea-th-filter-btn';
      button.textContent = '⌄';
      header.appendChild(button);
    });
    const headerFilterGeometry = await page.evaluate(() => {
      const header = document.querySelector('.rating-work-table thead th:nth-child(3)');
      const button = header.querySelector('.altea-th-filter-btn');
      const headerRect = header.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        position: getComputedStyle(button).position,
        inside: buttonRect.left >= headerRect.left
          && buttonRect.right <= headerRect.right
          && buttonRect.top >= headerRect.top
          && buttonRect.bottom <= headerRect.bottom
      };
    });
    assert.equal(headerFilterGeometry.position, 'absolute', 'filter arrow must not enlarge or split the header');
    assert.equal(headerFilterGeometry.inside, true, 'filter arrow must remain inside its header cell');
    assert.equal(await page.locator('[data-rating-copy]').first().innerText(), 'Копировать артикул');
    assert.equal(await page.locator('[data-rating-note]').first().innerText(), 'Добавить комментарий');
    assert.match(await page.locator('[data-rating-comment-cell]').first().innerText(), /напишите коллегам/);
    assert.equal(await page.locator('#view-wb-rating').getAttribute('data-rating-density'), 'compact');

    await page.evaluate(() => {
      const button = document.querySelector('[data-rating-data-refresh]');
      button.click();
      button.click();
    });
    await page.waitForFunction(() => window.alteaWbFeedbackSyncState().busy === false);
    assert.equal(
      await page.evaluate(() => window.__feedbackSyncRequests.length),
      1,
      'refresh action must suppress duplicate requests while synchronization is busy'
    );
    const syncRequest = await page.evaluate(() => window.__feedbackSyncRequests[0]);
    assert.equal(syncRequest.url, 'https://example.test/functions/v1/wb-feedback-sync');
    assert.equal(syncRequest.options.method, 'POST');
    assert.equal(syncRequest.options.headers.Authorization, 'Bearer employee-access-token');
    assert.match(syncRequest.options.body, /portal-wb-rating/);
    assert.match(await page.locator('[data-rating-data-refresh-status]').innerText(), /Готово: свежие отзывы/);
    assert.match(await page.locator('[data-rating-data-freshness]').innerText(), /28\.07\.2026/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(20);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      0,
      'mobile reviews route must not overflow the page horizontally'
    );
    assert.equal(
      await page.locator('[data-rating-smart-board]').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
      1,
      'smart board must stack into one column on mobile'
    );
    assert.equal(
      await page.locator('.rating-smart-kpis').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
      2,
      'smart KPI cards must remain touch-friendly in two columns'
    );
    await page.setViewportSize({ width: 1440, height: 900 });

    const compactVisibleCards = await page.locator('.rating-planfact-board > [data-rating-platform]').evaluateAll(
      (nodes) => nodes.filter((node) => getComputedStyle(node).display !== 'none').length
    );
    assert.equal(compactVisibleCards, 5, 'compact mode must show only active platform metrics');

    const compactVisibleHeaders = await page.locator('.rating-ux-wide-table thead th').evaluateAll(
      (nodes) => nodes.filter((node) => getComputedStyle(node).display !== 'none').length
    );
    assert.equal(compactVisibleHeaders, 11, 'compact table must retain the explicit comment column and hide duplicate period columns');
    assert.equal(
      await page.locator('.rating-ux-wide-table tbody td').first().evaluate((node) => getComputedStyle(node).position),
      'sticky',
      'article column must be sticky'
    );
    assert.equal(
      await page.locator('[data-rating-comment-cell]').first().evaluate((node) => getComputedStyle(node).position),
      'sticky',
      'team comment column must remain visible beside the article'
    );

    await page.locator('[data-rating-copy]').first().click();
    await page.waitForTimeout(20);
    assert.equal(await page.evaluate(() => window.__copied), 'WB-ARTICLE-1', 'copy must use row article');
    await page.locator('[data-rating-copy]').nth(2).click();
    await page.waitForTimeout(20);
    assert.equal(await page.evaluate(() => window.__copied), 'OZON-ARTICLE-1', 'Ozon copy must use row article');

    await page.locator('[data-rating-note]').first().click();
    assert.match(await page.locator('.rating-note-dialog').innerText(), /внутренняя запись для коллег/);
    await page.locator('[data-rating-note-kind]').selectOption('feedback');
    await page.locator('[data-rating-note-status]').selectOption('progress');
    await page.locator('[data-rating-note-owner]').fill('Тестовый сотрудник');
    await page.locator('[data-rating-note-due]').fill('2000-01-01');
    await page.locator('[data-rating-note-text]').fill('Ответить на негативный отзыв и проверить карточку.');
    await page.locator('[data-rating-note-form]').evaluate((form) => form.requestSubmit());
    await page.waitForTimeout(80);

    const comments = await page.evaluate(() => window.__alteaAppState.storage.comments);
    const remoteComments = await page.evaluate(() => window.__remoteComments);
    assert.equal(comments.length, 1, 'workflow save must append one team comment');
    assert.equal(remoteComments.length, 1, 'workflow form must send one comment to the persistence boundary');
    assert.deepEqual(remoteComments[0], comments[0], 'local and remote workflow payloads must match');
    assert.equal(comments[0].type, 'rating_workflow');
    assert.match(comments[0].text, /\[\[platform:wb\]\]/);
    assert.match(comments[0].text, /\[\[status:progress\]\]/);
    assert.match(comments[0].text, /\[\[entry:feedback\]\]/);
    assert.match(comments[0].text, /\[\[owner:%D0%A2%D0%B5%D1%81%D1%82%D0%BE%D0%B2%D1%8B%D0%B9%20%D1%81%D0%BE%D1%82%D1%80%D1%83%D0%B4%D0%BD%D0%B8%D0%BA\]\]/);
    assert.match(comments[0].text, /\[\[due:2000-01-01\]\]/);
    assert.match(comments[0].text, /Ответить на негативный отзыв/);
    await page.waitForFunction(() => document.querySelector('[data-rating-row-actions]')?.textContent.includes('В работе'));
    await page.waitForFunction(() => document.querySelector('[data-rating-comment-cell]')?.textContent.includes('Ответить на негативный отзыв'));
    assert.match(await page.locator('[data-rating-comment-cell]').first().innerText(), /Сохранено · В работе/);
    assert.match(await page.locator('[data-rating-note]').first().innerText(), /Открыть \/ добавить · 1/);

    const workflowSearch = await page.evaluate(
      () => window.__alteaRatingWorkflowSearchText('WB-ARTICLE-1', 'wb')
    );
    assert.match(workflowSearch, /Тестовый сотрудник/);
    assert.match(workflowSearch, /негативный отзыв/);
    assert.equal(
      await page.evaluate(() => window.__alteaRatingWorkflowMatches('WB-ARTICLE-1', 'wb')),
      true,
      'all workflow statuses must match by default'
    );
    assert.equal(
      await page.locator('[data-rating-smart-filter="mine"] .rating-smart-kpi__value').innerText(),
      '1',
      'smart board must count the current employee queue'
    );
    assert.equal(
      await page.locator('[data-rating-smart-filter="overdue"] .rating-smart-kpi__value').innerText(),
      '1',
      'smart board must count overdue workflow entries'
    );
    await page.locator('[data-rating-smart-filter="mine"]').click();
    assert.equal(await page.locator('[data-rating-workflow-filter]').inputValue(), 'mine');
    assert.equal(await page.locator('.rating-work-row:not(.is-workflow-filtered)').count(), 1);
    await page.locator('[data-rating-smart-filter="all"]').click();
    assert.equal(await page.locator('.rating-work-row:not(.is-workflow-filtered)').count(), 3);
    await page.locator('[data-rating-smart-filter="overdue"]').click();
    assert.equal(await page.locator('.rating-work-row:not(.is-workflow-filtered)').count(), 1);
    await page.locator('[data-rating-smart-filter="all"]').click();

    await page.evaluate(() => {
      window.__ratingRenderCalls = 0;
      window.renderWbCardRating = () => {
        window.__ratingRenderCalls += 1;
        document.querySelectorAll('.rating-work-row').forEach((row) => {
          const matches = window.__alteaRatingWorkflowMatches(
            row.dataset.ratingDetail,
            row.dataset.ratingPlatform
          );
          row.classList.toggle('is-workflow-filtered', !matches);
        });
      };
    });
    await page.locator('[data-rating-workflow-filter]').selectOption('progress');
    await page.waitForFunction(() => window.__ratingRenderCalls === 1);
    assert.equal(await page.locator('.rating-work-row:not(.is-workflow-filtered)').count(), 1);
    assert.equal(await page.locator('.rating-work-row.is-workflow-filtered').count(), 2);
    assert.equal(
      await page.evaluate(() => window.__alteaRatingWorkflowMatches('WB-ARTICLE-1', 'wb')),
      true,
      'matching status must pass source filtering'
    );
    assert.equal(
      await page.evaluate(() => window.__alteaRatingWorkflowMatches('OZON-ARTICLE-1', 'ozon')),
      false,
      'unmatched rows must be excluded before pagination'
    );
    if (process.env.PORTAL_RATING_SCREENSHOT) {
      await page.screenshot({ path: process.env.PORTAL_RATING_SCREENSHOT, fullPage: true });
    }

    await page.locator('[data-rating-note]').first().click();
    assert.match(await page.locator('.rating-note-history').innerText(), /Ответить на негативный отзыв/);
    assert.match(await page.locator('.rating-note-history').innerText(), /Отзыв по артикулу/);
    assert.match(await page.locator('.rating-note-history').innerText(), /Тестовый сотрудник/);
    if (process.env.PORTAL_RATING_DIALOG_SCREENSHOT) {
      await page.screenshot({ path: process.env.PORTAL_RATING_DIALOG_SCREENSHOT, fullPage: true });
    }

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
    console.log('portal-wb-rating-feedback-ux selftest: ok');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
