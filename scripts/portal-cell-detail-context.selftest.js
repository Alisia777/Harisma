#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'portal-table-header-filters.js'), 'utf8');
const SCRIPT_VERSION = '20260728cellcontext1';

for (const file of ['index.html', 'live-index.html', 'docs/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.match(
    html,
    new RegExp(`portal-table-header-filters\\.js\\?v=${SCRIPT_VERSION}`),
    `${file} должен загружать исправленную версию карточки детали`
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  try {
    await page.setContent(`<!doctype html>
      <html lang="ru">
        <body>
          <main>
            <section class="view active">
              <article class="analytics-card">
                <header><h3>WB · рабочая таблица по дням</h3></header>
                <div class="altea-table-statebar">
                  <h3>Показано 29 из 29 Сбросить фильтры Сбросить сортировку</h3>
                </div>
                <table>
                  <thead>
                    <tr><th>Дата / источник</th><th>Факт оборота</th><th>Выполнение</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>01.07 · источник</td><td>8 211 295 ₽</td><td>85,5%</td></tr>
                  </tbody>
                </table>
              </article>
            </section>
          </main>
        </body>
      </html>`);
    await page.addScriptTag({ content: source });
    await page.locator('tbody td:nth-child(2)').click();

    const detail = await page.evaluate(() => {
      const popover = document.querySelector('.altea-cell-detail-popover:not([hidden])');
      return {
        title: popover?.querySelector('h3')?.textContent?.trim() || '',
        context: popover?.querySelector('p')?.textContent?.trim() || '',
        column: popover?.querySelector('dd')?.textContent?.trim() || '',
        value: popover?.querySelector('.altea-cell-detail-popover__value')?.textContent?.trim() || ''
      };
    });

    assert.equal(detail.title, 'Факт оборота', 'заголовок должен называться по показателю ячейки');
    assert.equal(detail.context, 'WB · рабочая таблица по дням', 'подзаголовок должен называться по рабочему разделу');
    assert.equal(detail.column, 'Факт оборота');
    assert.equal(detail.value, '8 211 295 ₽');
    assert.doesNotMatch(detail.title, /Показано|Сбросить/);
    assert.doesNotMatch(detail.context, /Показано|Сбросить/);
    assert.deepEqual(errors, []);
    console.log('portal cell detail context selftest: ok');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
