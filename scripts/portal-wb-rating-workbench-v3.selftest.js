const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CSS_FILES = [
  'portal-wb-rating-workbench-v3-01-shell.css',
  'portal-wb-rating-workbench-v3-02-sync.css',
  'portal-wb-rating-workbench-v3-03-workspace.css',
  'portal-wb-rating-workbench-v3-04-table.css',
  'portal-wb-rating-workbench-v3-05-responsive.css'
];
const css = CSS_FILES.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');

const headers = Array.from({ length: 19 }, (_, i) => {
  const label = i === 0 ? 'Артикул' : i === 1 ? 'Комментарий команде' : `Метрика ${i}`;
  const content = i < 2
    ? `<span>${label}</span>`
    : `<button class="rating-th-sort${i === 3 ? ' active' : ''}">${label}</button>`;
  return `<th${i === 1 ? ' class="rating-team-comment-head"' : ''}>${content}<button class="altea-th-filter-btn">⌄</button></th>`;
}).join('');
const rows = Array.from({ length: 35 }, (_, r) => `<tr class="rating-work-row">${Array.from({ length: 19 }, (_, i) => {
  if (i === 0) return `<td class="article-cell"><strong>article_${r}</strong><span class="cell-muted">WB nm ${1000 + r}</span><div class="rating-row-actions"><button class="rating-copy-button">Копировать артикул</button></div></td>`;
  if (i === 1) return '<td class="rating-team-comment-cell"><div class="rating-team-comment-box"><button class="rating-note-button">+ Добавить комментарий</button><span class="rating-team-comment-placeholder">Заметка для коллег.</span></div></td>';
  return `<td><span class="cell-main">${r * 100 + i}</span><span class="cell-muted">метрика</span></td>`;
}).join('')}</tr>`).join('');

function html() {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
    :root{--text:#fff7e6;--muted:#aaa0a6;--line:rgba(255,255,255,.1)}
    *{box-sizing:border-box}html,body{margin:0;background:#09080a;color:var(--text);font-family:Arial,sans-serif;overflow-x:hidden}
    .altea-premium-route-stage--legacy{padding:22px 24px 64px}.badge-stack,.rating-team-sync{display:flex;gap:6px}.chip{border:1px solid var(--line);border-radius:999px;padding:5px 8px}.rating-team-sync:before{content:"";border-radius:50%;background:#61c99b}.rating-smart-board,.rating-smart-kpis{display:grid}.rating-smart-kpi{color:inherit;background:#18151a;border:1px solid var(--line)}.rating-detail-panel,.rating-work-card{border:1px solid var(--line);background:#0f1013}.rating-work-table table{min-width:2200px}.rating-work-table th,.rating-work-table td{border-right:1px solid rgba(255,255,255,.05)}button,select,input{font:inherit}.cell-main,.cell-muted{display:block}
    ${css}
  </style></head><body class="v87-imperial altea-premium-shell"><main class="altea-premium-route-stage--legacy"><section id="view-wb-rating" class="active" data-rating-density="compact" data-rating-data-stale="1">
    <div class="section-title"><div><h2>Рейтинг карточек WB/Ozon</h2><p>Отзывы, вопросы, история и рост/падение.</p></div><div class="badge-stack"><span class="chip">API</span><span class="chip">179 карточек</span></div></div>
    <div class="rating-feedback-toolbar"><div class="rating-feedback-toolbar__main">
      <div class="rating-density-switch"><button class="active">Компактно</button><button>Все показатели</button></div>
      <label class="rating-workflow-filter"><span>Работа команды</span><select class="rating-ux-select"><option>Все статусы</option></select></label>
      <div class="rating-api-truth"><strong>Ozon:</strong> отзывы и негатив недоступны по API (403).</div><span class="rating-team-sync">Комментарии синхронизируются</span>
      <div class="rating-data-refresh"><button aria-busy="true" disabled>Обновляем · 3/45</button><div class="rating-data-refresh__meta" data-tone="warn">Последнее обновление: ещё не было</div><div class="rating-data-refresh__status" data-tone="info">Ждём новый снимок · проверка 3/45.</div></div>
    </div><div class="rating-action-guide"><strong>Действия по артикулу:</strong> артикул и комментарий остаются рядом.</div></div>
    <section class="rating-smart-board"><div class="rating-smart-board__copy"><span class="rating-smart-board__eyebrow">ALTEA REVIEW INTELLIGENCE</span><h3>Приоритет команды на сегодня</h3><p class="rating-smart-board__summary"><strong>Снимок устарел.</strong> Обновите отзывы.</p></div><div class="rating-smart-kpis">${Array.from({ length: 5 }, (_, i) => `<button class="rating-smart-kpi"><span class="rating-smart-kpi__label">Очередь</span><strong class="rating-smart-kpi__value">${i}</strong><span class="rating-smart-kpi__hint">подсказка</span></button>`).join('')}</div></section>
    <div class="rating-detail-panel"><div class="rating-work-card"><div class="rating-detail-head"><div><h3>WB · рабочая таблица</h3><p>Одна строка = один товар.</p></div></div><div class="rating-queue-controls"><input class="rating-inline-search" placeholder="Поиск"><select class="rating-ux-select"><option>Все</option></select><select class="rating-ux-select"><option>Выручка 7д</option></select><div class="badge-stack"><span class="chip">40 из 179</span></div></div><div class="rating-work-table"><table class="rating-ux-wide-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div></div></div>
  </section></main></body></html>`;
}

async function metrics(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const cs = (s, p) => getComputedStyle(q(s), p);
    const table = q('.rating-work-table');
    const visibleHeaders = [...document.querySelectorAll('thead th')].filter((n) => getComputedStyle(n).display !== 'none').length;
    return {
      pageWidth: document.documentElement.scrollWidth,
      gutter: parseFloat(cs('.altea-premium-route-stage--legacy').paddingLeft),
      toolbar: cs('.rating-feedback-toolbar').position,
      progressHeight: parseFloat(cs('.rating-data-refresh', '::before').height),
      progressAnimation: cs('.rating-data-refresh', '::after').animationName,
      overflowX: cs('.rating-work-table').overflowX,
      overflowY: cs('.rating-work-table').overflowY,
      vertical: table.scrollHeight > table.clientHeight,
      horizontal: table.scrollWidth > table.clientWidth,
      header: cs('thead th').position,
      first: cs('tbody td:nth-child(1)').position,
      second: cs('tbody td:nth-child(2)').position,
      firstLeft: parseFloat(cs('tbody td:nth-child(1)').left),
      secondLeft: parseFloat(cs('tbody td:nth-child(2)').left),
      visibleHeaders
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[1600, 900], [1280, 800], [920, 800]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.setContent(html());
      await page.waitForTimeout(60);
      const m = await metrics(page);
      assert.ok(m.pageWidth <= width + 1, `${width}: no page-wide horizontal overflow`);
      assert.ok(m.gutter <= 10, `${width}: route gutter reduced`);
      assert.equal(m.toolbar, 'relative', `${width}: toolbar must not float`);
      assert.equal(m.progressHeight, 5, `${width}: progress track visible`);
      assert.equal(m.progressAnimation, 'ratingWorkbenchSyncSweep', `${width}: busy progress animates`);
      assert.equal(m.overflowX, 'scroll');
      assert.equal(m.overflowY, 'scroll');
      assert.ok(m.vertical, `${width}: vertical table scroll works`);
      assert.equal(m.header, 'sticky');
      assert.equal(m.first, 'sticky');
      assert.equal(m.second, 'sticky');
      assert.equal(m.firstLeft, 0);
      assert.equal(m.secondLeft, 224);
      assert.equal(m.visibleHeaders, 8, `${width}: compact has eight working columns`);
      if (width <= 920) assert.ok(m.horizontal, `${width}: narrow view scrolls horizontally`);

      await page.locator('#view-wb-rating').evaluate((n) => { n.dataset.ratingDensity = 'full'; });
      await page.waitForTimeout(20);
      const full = await page.evaluate(() => ({
        headers: [...document.querySelectorAll('thead th')].filter((n) => getComputedStyle(n).display !== 'none').length,
        horizontal: document.querySelector('.rating-work-table').scrollWidth > document.querySelector('.rating-work-table').clientWidth
      }));
      assert.equal(full.headers, 19, `${width}: full mode preserves every column`);
      assert.ok(full.horizontal, `${width}: full mode scrolls horizontally`);

      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'porcelain-day';
        document.documentElement.style.setProperty('--text', '#241f1a');
        document.documentElement.style.setProperty('--muted', '#6e645a');
        document.querySelector('#view-wb-rating').dataset.ratingDensity = 'compact';
      });
      await page.waitForTimeout(20);
      const light = await page.evaluate(() => {
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        const queueColumns = style('.rating-queue-controls').gridTemplateColumns
          .split(' ')
          .filter(Boolean).length;
        return {
          smartTitle: style('.rating-smart-board h3').color,
          smartBackground: style('.rating-smart-board').backgroundImage,
          smartValue: style('.rating-smart-kpi__value').color,
          density: style('.rating-density-switch button.active').color,
          note: style('.rating-note-button').color,
          sort: style('.rating-th-sort.active').color,
          table: style('.rating-work-table').backgroundColor,
          headerHeight: document.querySelector('thead th').getBoundingClientRect().height,
          filterPosition: style('.altea-th-filter-btn').position,
          queueColumns
        };
      });
      assert.equal(light.smartTitle, 'rgb(36, 31, 26)', `${width}: light smart-board title is readable`);
      assert.doesNotMatch(light.smartBackground, /rgba\(27, 20, 26/, `${width}: light smart-board is not dark`);
      assert.equal(light.smartValue, 'rgb(101, 69, 21)', `${width}: light KPI value is readable`);
      assert.equal(light.density, 'rgb(101, 69, 21)', `${width}: active density is readable`);
      assert.equal(light.note, 'rgb(101, 69, 21)', `${width}: comment action is readable`);
      assert.equal(light.sort, 'rgb(118, 80, 26)', `${width}: active sort is readable`);
      assert.equal(light.table, 'rgb(251, 248, 242)', `${width}: table canvas follows the light theme`);
      assert.ok(light.headerHeight <= 50, `${width}: filter buttons stay inside the header row`);
      assert.equal(light.filterPosition, 'absolute', `${width}: filter buttons do not create a second row`);
      assert.equal(light.queueColumns, width <= 920 ? 1 : 4, `${width}: queue controls stay in their frame`);

      await page.locator('.rating-data-refresh button').evaluate((b) => { b.setAttribute('aria-busy', 'false'); b.disabled = false; });
      await page.locator('.rating-data-refresh__status').evaluate((n) => { n.dataset.tone = 'ok'; });
      await page.waitForTimeout(280);
      const done = await page.evaluate(() => {
        const card = document.querySelector('.rating-data-refresh');
        const p = getComputedStyle(card, '::after');
        return { animation: p.animationName, width: parseFloat(p.width), card: card.clientWidth };
      });
      assert.equal(done.animation, 'none', `${width}: success stops animation`);
      assert.ok(done.width > done.card * .85, `${width}: success fills progress bar`);
      assert.deepEqual(errors, [], `${width}: no page errors`);
      await page.close();
    }
    console.log('portal-wb-rating-workbench-v3 selftest: ok');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
