#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const coreCss = fs.readFileSync(path.join(ROOT, 'portal-interface-optimization-core.css'), 'utf8');
const entryCss = fs.readFileSync(path.join(ROOT, 'portal-interface-optimization.css'), 'utf8');
const VERSION = '20260729reviewlayout1';

assert.match(
  entryCss,
  new RegExp(`portal-interface-optimization-core\\.css\\?v=${VERSION}`),
  'entrypoint должен загружать новую single-scroll версию core CSS'
);

for (const file of ['index.html', 'live-index.html', 'docs/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.match(
    html,
    new RegExp(`portal-interface-optimization\\.css\\?v=${VERSION}`),
    `${file} должен сбросить кеш интерфейсного слоя`
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.setContent(`<!doctype html>
      <html lang="ru" data-theme="porcelain-day">
        <head>
          <style>${coreCss}</style>
          <style>
            #view-prices .prices-v1-table-wrap {
              max-height: 72vh;
              overflow: auto;
            }
            #view-product-leaderboard .plb-v2-table-wrap {
              max-height: 560px;
              overflow: auto;
            }
            #view-order .altea-order-procurement__table-wrap {
              min-height: min(620px, calc(100vh - 260px));
              max-height: calc(100vh - 210px);
              overflow: auto;
            }
            #view-wb-rating .rating-work-table {
              height: 58vh !important;
              min-height: 360px;
              overflow: scroll !important;
            }
            .fixture-table {
              width: 1600px;
              height: 1200px;
            }
          </style>
        </head>
        <body class="v87-imperial altea-premium-shell" data-theme="light">
          <main class="altea-premium-shell-content">
            <section id="view-prices" class="view active">
              <div class="prices-v1-table-wrap"><div class="fixture-table">Цены</div></div>
            </section>
            <section id="view-product-leaderboard" class="view active">
              <div class="plb-v2-table-wrap"><div class="fixture-table">Лидерборд</div></div>
            </section>
            <section id="view-order" class="view active">
              <div class="altea-order-procurement__table-wrap"><div class="fixture-table">Заказ</div></div>
            </section>
            <section id="view-wb-rating" class="view active">
              <div class="rating-work-table"><div class="fixture-table">Отзывы</div></div>
            </section>
          </main>
        </body>
      </html>`);

    const result = await page.evaluate(() => {
      const selectors = [
        '#view-prices .prices-v1-table-wrap',
        '#view-product-leaderboard .plb-v2-table-wrap',
        '#view-order .altea-order-procurement__table-wrap',
        '#view-wb-rating .rating-work-table'
      ];
      return {
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        wrappers: selectors.map((selector) => {
          const element = document.querySelector(selector);
          const style = getComputedStyle(element);
          return {
            selector,
            maxHeight: style.maxHeight,
            minHeight: style.minHeight,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth
          };
        })
      };
    });

    assert.equal(result.documentOverflowX, 0, 'широкие таблицы не должны расширять документ');
    result.wrappers.forEach((wrapper) => {
      assert.equal(wrapper.maxHeight, 'none', `${wrapper.selector}: fixed max-height запрещён`);
      assert.equal(wrapper.minHeight, '0px', `${wrapper.selector}: пустая минимальная высота запрещена`);
      assert.equal(wrapper.overflowX, 'auto', `${wrapper.selector}: горизонтальный скролл должен сохраниться`);
      assert.equal(wrapper.overflowY, 'hidden', `${wrapper.selector}: отдельный вертикальный скролл запрещён`);
      assert.equal(wrapper.clientHeight, wrapper.scrollHeight, `${wrapper.selector}: контейнер должен вырасти по данным`);
      assert.ok(
        wrapper.scrollWidth > wrapper.clientWidth,
        `${wrapper.selector}: широкая таблица остаётся горизонтально доступной`
      );
    });

    console.log('portal single-scroll routes selftest: ok');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
