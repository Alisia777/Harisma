#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function serve() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const relative = decodeURIComponent(url.pathname || '/') === '/'
      ? 'live-index.html'
      : decodeURIComponent(url.pathname || '/').replace(/^\/+/, '');
    const filePath = path.join(ROOT, relative);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function auditMarketplace(page, market) {
  await page.evaluate((marketKey) => {
    if (window.AlteaPremiumPresentation?.applyMarketplace) {
      window.AlteaPremiumPresentation.applyMarketplace(marketKey, {
        persist: true,
        rerender: false,
        silent: true
      });
    } else {
      localStorage.setItem('altea.portal.marketplace', marketKey);
      document.documentElement.dataset.marketplace = marketKey;
      document.body.dataset.marketplace = marketKey;
    }
    window.renderPriceWorkbench?.();
  }, market);
  await page.waitForFunction((marketKey) => (
    document.querySelector('#view-prices')?.dataset.priceActiveMarket === marketKey
    && document.querySelectorAll('#view-prices .prices-v1-table tbody .prices-v1-row').length > 0
  ), market, { timeout: 30000 });
  await page.waitForTimeout(150);

  return page.evaluate((marketKey) => {
    const state = window.__alteaPriceWorkbenchState || {};
    const root = document.getElementById('view-prices');
    const iso = (value) => {
      const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
      return match ? match[0] : '';
    };
    const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
    const pointHasFact = (item) => Boolean(item && (
      positive(item.price)
      || positive(item.clientPrice)
      || Number.isFinite(Number(item.ordersUnits))
      || Number.isFinite(Number(item.deliveredUnits))
      || Number.isFinite(Number(item.revenue))
    ));
    const priceDate = (row) => {
      const dates = [];
      if (positive(row?.currentFillPrice)) {
        [row?.currentPriceDate, row?.valueDate].map(iso).filter(Boolean).forEach((date) => dates.push(date));
      }
      if (positive(row?.listPrice)) {
        [row?.listPriceDate, row?.valueDate].map(iso).filter(Boolean).forEach((date) => dates.push(date));
      }
      (row?.timeline || []).filter(pointHasFact).forEach((item) => {
        if (positive(item?.price)) dates.push(iso(item.date));
      });
      return dates.filter(Boolean).sort().pop() || '';
    };
    const pool = (state.rows || []).filter((row) => row.market === marketKey);
    const sourceCounts = pool.reduce((result, row) => {
      const source = String(row?.currentFillPriceSource || 'none');
      result[source] = (result[source] || 0) + 1;
      return result;
    }, {});
    const businessParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date()).reduce((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value;
      return result;
    }, {});
    return {
      market: root?.dataset.priceActiveMarket || '',
      poolRows: pool.length,
      visibleRows: root?.querySelectorAll('.prices-v1-table tbody .prices-v1-row').length || 0,
      expectedFactDate: pool.map(priceDate).filter(Boolean).sort().pop() || '',
      dateTo: root?.querySelector('#pwTo')?.value || '',
      freshnessText: root?.querySelector('.prices-v1-freshness')?.textContent || '',
      poolQualityText: root?.querySelector('[data-prices-v1-pool-quality]')?.textContent || '',
      cabinetLiveRows: pool.filter((row) => row.currentFillPriceSource === 'live').length,
      sourceCounts,
      sourceNote: state.sourceNote || '',
      businessDate: [businessParts.year, businessParts.month, businessParts.day].join('-')
    };
  }, market);
}

async function run() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('altea-portal-active-view-v1', JSON.stringify({
        activeView: 'prices',
        updatedAt: new Date().toISOString()
      }));
      localStorage.setItem('altea.portal.marketplace', 'wb');
    });
    await page.goto(`http://127.0.0.1:${port}/live-index.html?prices-correctness=${Date.now()}#prices`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForFunction(() => (
      window.__alteaPriceWorkbenchState?.loaded
      && document.querySelector('#view-prices .prices-v1-shell')
      && document.querySelector('[data-prices-v1-pool-quality]')
    ), null, { timeout: 120000 });

    const marketplaceAudits = [];
    for (const [market, label] of [['wb', 'WB'], ['ozon', 'Ozon'], ['ym', 'Я.Маркет']]) {
      const marketAudit = await auditMarketplace(page, market);
      marketplaceAudits.push({ ...marketAudit, label });
      assert.strictEqual(marketAudit.market, market, `${label}: должен открыться выбранный пул`);
      assert.ok(marketAudit.poolRows > 0, `${label}: кабинетный пул не должен быть пустым`);
      assert.ok(marketAudit.visibleRows > 0, `${label}: последний фактический период не должен быть пустым`);
      assert.ok(marketAudit.expectedFactDate, `${label}: дата факта должна быть определена`);
      assert.ok(
        marketAudit.expectedFactDate <= marketAudit.businessDate,
        `${label}: дата факта кабинета не должна быть позже московского бизнес-дня`
      );
      assert.strictEqual(
        marketAudit.dateTo,
        marketAudit.expectedFactDate,
        `${label}: период должен открываться на последнем факте площадки`
      );
      assert.match(
        marketAudit.freshnessText,
        new RegExp(`Факт цены до ${marketAudit.expectedFactDate}`),
        `${label}: индикатор актуальности должен показывать реальную дату кабинетной цены`
      );
      assert.ok(
        marketAudit.cabinetLiveRows > 0,
        `${label}: текущие цены должны читаться из live snapshot кабинета (${JSON.stringify({
          sourceCounts: marketAudit.sourceCounts,
          sourceNote: marketAudit.sourceNote
        })})`
      );
      assert.match(
        marketAudit.poolQualityText,
        new RegExp(`цена \\d+\\/${marketAudit.poolRows}.*дата цены \\d+\\/${marketAudit.poolRows}`),
        `${label}: аудит пула должен считать покрытие цены и даты по полному пулу`
      );
    }
    await auditMarketplace(page, 'wb');

    const audit = await page.evaluate(() => {
      const state = window.__alteaPriceWorkbenchState || {};
      const root = document.getElementById('view-prices');
      const iso = (value) => {
        const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
        return match ? match[0] : '';
      };
      const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
      const pointHasFact = (item) => Boolean(item && (
        positive(item.price)
        || positive(item.clientPrice)
        || Number.isFinite(Number(item.ordersUnits))
        || Number.isFinite(Number(item.deliveredUnits))
        || Number.isFinite(Number(item.revenue))
      ));
      const priceDate = (row) => {
        const dates = [];
        if (positive(row?.currentFillPrice)) {
          [row?.currentPriceDate, row?.valueDate].map(iso).filter(Boolean).forEach((date) => dates.push(date));
        }
        if (positive(row?.listPrice)) {
          [row?.listPriceDate, row?.valueDate].map(iso).filter(Boolean).forEach((date) => dates.push(date));
        }
        (row?.timeline || []).filter(pointHasFact).forEach((item) => {
          if (positive(item?.price)) dates.push(iso(item.date));
        });
        return dates.filter(Boolean).sort().pop() || '';
      };
      const expectedLatestFactDate = (state.rows || []).map(priceDate).filter(Boolean).sort().pop() || '';
      const wbRows = (state.rows || []).filter((row) => row.market === 'wb');
      const expectedMarketFactDate = wbRows.map(priceDate).filter(Boolean).sort().pop() || '';
      const canonicalStatusByArticle = new Map((window.state?.skuMatrix?.items || []).map((row) => [
        String(row?.articleKey || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-zа-я0-9_-]+/gi, ''),
        String(row?.registryStatus || row?.status || '').trim()
      ]));
      const statusMismatches = (state.rows || []).filter((row) => {
        const key = String(row?.articleKey || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-zа-я0-9_-]+/gi, '');
        const canonicalStatus = canonicalStatusByArticle.get(key);
        return canonicalStatus && String(row?.status || '').trim() !== canonicalStatus;
      });
      const businessDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date()).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
      }, {});
      let missingPrice = wbRows.find((row) => !positive(row.currentFillPrice));
      let missingClientPrice = wbRows.find((row) => positive(row.currentFillPrice) && !positive(row.currentClientPrice));
      let fixtureChanged = false;
      if (!missingPrice) {
        missingPrice = wbRows.find((row) => positive(row.currentFillPrice));
        if (missingPrice) {
          missingPrice.currentFillPrice = null;
          (missingPrice.timeline || []).forEach((point) => {
            point.price = null;
          });
          fixtureChanged = true;
        }
      }
      if (!missingClientPrice) {
        missingClientPrice = wbRows.find((row) => (
          row !== missingPrice
          && positive(row.currentFillPrice)
          && positive(row.currentClientPrice)
        ));
        if (missingClientPrice) {
          missingClientPrice.currentClientPrice = null;
          missingClientPrice.currentSppPct = null;
          (missingClientPrice.timeline || []).forEach((point) => {
            point.clientPrice = null;
            point.sppPct = null;
          });
          fixtureChanged = true;
        }
      }
      if (fixtureChanged && typeof window.renderPriceWorkbench === 'function') {
        window.renderPriceWorkbench();
      }
      return {
        stateLatestFactDate: state.latestFactDate || '',
        expectedLatestFactDate,
        expectedMarketFactDate,
        stateLagDays: state.dataLagDays,
        sourceNote: state.sourceNote || '',
        activeMarket: root?.dataset.priceActiveMarket || '',
        dateTo: root?.querySelector('#pwTo')?.value || '',
        dateMax: root?.querySelector('#pwTo')?.max || '',
        businessDate: [businessDate.year, businessDate.month, businessDate.day].join('-'),
        visibleRows: root?.querySelectorAll('.prices-v1-table tbody .prices-v1-row').length || 0,
        poolRows: wbRows.length,
        freshnessText: root?.querySelector('.prices-v1-freshness')?.textContent || '',
        qualityText: root?.querySelector('[data-prices-v1-quality]')?.textContent || '',
        poolQualityText: root?.querySelector('[data-prices-v1-pool-quality]')?.textContent || '',
        cabinetLiveRows: wbRows.filter((row) => row.currentFillPriceSource === 'live').length,
        cabinetLiveListRows: wbRows.filter((row) => row.listPriceSource === 'live').length,
        statusMismatchCount: statusMismatches.length,
        statusMismatchExamples: statusMismatches.slice(0, 5).map((row) => row.articleKey),
        missingPriceArticle: missingPrice?.articleKey || '',
        missingClientPriceArticle: missingClientPrice?.articleKey || ''
      };
    });

    assert.strictEqual(audit.activeMarket, 'wb', 'Тест должен проверять пул WB');
    assert.ok(audit.poolRows > 0, 'Пул WB не должен быть пустым');
    assert.strictEqual(
      audit.stateLatestFactDate,
      audit.expectedLatestFactDate,
      'Дата факта должна вычисляться по фактическим ценовым точкам, а не по generatedAt/asOfDate оболочки'
    );
    assert.match(audit.freshnessText, new RegExp(`Факт цены до ${audit.expectedMarketFactDate}`));
    assert.strictEqual(audit.dateMax, audit.businessDate, 'Максимальная дата периода должна использовать бизнес-день Europe/Moscow');
    assert.ok(audit.expectedMarketFactDate <= audit.businessDate, 'Дата факта кабинета не должна быть позже московского бизнес-дня');
    assert.strictEqual(audit.dateTo, audit.expectedMarketFactDate, 'Период должен открываться на последнем факте выбранной площадки');
    assert.ok(audit.visibleRows > 0, 'Последний фактический период площадки не должен открываться пустым');
    assert.match(audit.sourceNote, /факт цен до/);
    assert.match(audit.sourceNote, /data\/repricer_live_prices\.json/);
    assert.ok(audit.cabinetLiveRows > 0, 'Текущая цена должна читаться из свежего кабинетного snapshot');
    assert.ok(audit.cabinetLiveListRows > 0, 'Цена до скидки должна читать currentListPrice из кабинетного snapshot');
    assert.deepStrictEqual(
      [audit.statusMismatchCount, audit.statusMismatchExamples],
      [0, []],
      'Статус товара во вкладке Цены должен совпадать с каноническим SKU-реестром'
    );
    assert.match(audit.qualityText, /^Срез:/);
    assert.match(
      audit.poolQualityText,
      new RegExp(`Пул WB:.*цена \\d+\\/${audit.poolRows}.*дата цены \\d+\\/${audit.poolRows}.*маржа \\d+\\/${audit.poolRows}.*MIN/MAX \\d+\\/${audit.poolRows}.*owner \\d+\\/${audit.poolRows}.*daily \\d+\\/${audit.poolRows}`)
    );
    assert.ok(audit.missingPriceArticle, 'Тест должен подготовить SKU без фактической цены');

    const search = page.locator('#pwSearch');
    await search.fill(audit.missingPriceArticle);
    await search.dispatchEvent('input');
    await page.waitForFunction((articleKey) => {
      const row = document.querySelector('#view-prices .prices-v1-table tbody .prices-v1-row');
      return row && row.textContent.includes(articleKey);
    }, audit.missingPriceArticle, { timeout: 30000 });
    const missingRowText = await page.locator('#view-prices .prices-v1-table tbody .prices-v1-row').first().innerText();
    assert.match(missingRowText, /нет цены/i, 'Строка без цены должна явно показывать отсутствие цены');
    assert.doesNotMatch(missingRowText, /в коридоре/i, 'Строка без цены не должна считаться находящейся в коридоре');
    assert.match(missingRowText, /Нет цены \/ заполнить/i, 'Решение должно требовать заполнить цену');

    assert.ok(audit.missingClientPriceArticle, 'Тест должен подготовить SKU без клиентской цены');
    await search.fill(audit.missingClientPriceArticle);
    await search.dispatchEvent('input');
    await page.waitForFunction((articleKey) => {
      const row = document.querySelector('#view-prices .prices-v1-table tbody .prices-v1-row');
      return row && row.textContent.includes(articleKey);
    }, audit.missingClientPriceArticle, { timeout: 30000 });
    const missingClientRowText = await page.locator('#view-prices .prices-v1-table tbody .prices-v1-row').first().innerText();
    assert.match(missingClientRowText, /клиент — · СПП —/i, 'Неизвестный СПП должен показываться как «—»');
    assert.doesNotMatch(missingClientRowText, /СПП 0[.,]0%/i, 'Пустой СПП не должен превращаться в 0%');

    const renderer = fs.readFileSync(path.join(ROOT, 'portal-price-workbench-simple-live.js'), 'utf8');
    const impactStart = renderer.indexOf('  function rowPriceImpact(');
    const impactEnd = renderer.indexOf('\n\n  function buildDisplayRow(', impactStart);
    assert.ok(impactStart >= 0 && impactEnd > impactStart, 'Формула эффекта цены должна оставаться доступной для unit-проверки');
    const createImpact = new Function(
      `"use strict";
      function num(value) {
        if (value === null || value === undefined || value === "") return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      function moneyRound(value) {
        const parsed = num(value);
        return parsed === null ? null : Math.round(parsed * 100) / 100;
      }
      function isoDate(value) {
        const match = String(value || "").match(/^\\d{4}-\\d{2}-\\d{2}/);
        return match ? match[0] : "";
      }
      function historyItemsForRow(row) { return row.items || []; }
      function sumHistoryMetric(items, key) {
        let total = 0;
        let found = false;
        (items || []).forEach((item) => {
          const value = num(item && item[key]);
          if (value === null) return;
          total += value;
          found = true;
        });
        return found ? total : null;
      }
      function countHistoryMetric(items, key) {
        return (items || []).reduce((count, item) => num(item && item[key]) === null ? count : count + 1, 0);
      }
      function roundedHistoryPrice(item) {
        const price = num(item && item.price);
        return price === null ? null : moneyRound(price);
      }
      ${renderer.slice(impactStart, impactEnd)}
      return rowPriceImpact;`
    );
    const impactFormula = createImpact();
    const normalizedImpact = impactFormula({
      items: [
        { date: '2026-07-01', price: 100, ordersUnits: 10, revenue: 1000 },
        { date: '2026-07-02', price: 100, ordersUnits: 12, revenue: 1200 },
        { date: '2026-07-03', price: 120, ordersUnits: 14, revenue: 1680 },
        { date: '2026-07-04', price: 120, ordersUnits: null, revenue: null }
      ]
    });
    assert.strictEqual(normalizedImpact.beforeDays, 2);
    assert.strictEqual(normalizedImpact.afterDays, 1, 'Пустой snapshot не должен считаться днем с нулевыми заказами');
    assert.strictEqual(normalizedImpact.beforeOrdersPerDay, 11);
    assert.strictEqual(normalizedImpact.afterOrdersPerDay, 14);
    assert.strictEqual(normalizedImpact.orderDelta, 3, 'Эффект цены должен сравнивать заказы в день, а не несопоставимые суммы');
    assert.match(renderer, /function priceCorridorState/);
    assert.match(renderer, /function priceDataAudit/);
    assert.match(renderer, /function priceFactFreshnessOfPayload/);
    assert.match(renderer, /snapshotFactFreshness !== localFactFreshness/);
    assert.match(renderer, /url === CABINET_LIVE_DATA_URL[\s\S]*?CABINET_SNAPSHOT_WAIT_MS/);
    assert.match(renderer, /orders_delta_after_change_per_day/);
    assert.match(renderer, /state\.latestFactDate = latestPriceFactDate\(rows\) \|\| last/);
    assert.doesNotMatch(renderer, /state\.latestFactDate = isoDate\(\(overlayPayload/);

    const payloadFreshnessStart = renderer.indexOf('  function freshnessOfPayload(');
    const payloadFreshnessEnd = renderer.indexOf('\n\n  function resetStateForReload(', payloadFreshnessStart);
    assert.ok(
      payloadFreshnessStart >= 0 && payloadFreshnessEnd > payloadFreshnessStart,
      'Выбор свежего snapshot должен оставаться доступным для unit-проверки'
    );
    const createPayloadChooser = new Function(
      `"use strict";
      function parseFreshStamp(value) {
        if (!value) return 0;
        var raw = String(value || "").trim();
        var normalized = /^\\d{4}-\\d{2}$/.test(raw)
          ? raw + "-01T00:00:00Z"
          : /^\\d{4}-\\d{2}-\\d{2}$/.test(raw)
            ? raw + "T00:00:00Z"
            : raw;
        var stamp = Date.parse(normalized);
        return Number.isFinite(stamp) ? stamp : 0;
      }
      function positiveNum(value) {
        var parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      }
      function isoDate(value) {
        var match = String(value || "").match(/^\\d{4}-\\d{2}-\\d{2}/);
        return match ? match[0] : "";
      }
      function normalizeRows(rows) {
        if (Array.isArray(rows)) return rows;
        if (rows && typeof rows === "object") return Object.values(rows);
        return [];
      }
      ${renderer.slice(payloadFreshnessStart, payloadFreshnessEnd)}
      return chooseFreshestPayload;`
    );
    const choosePayload = createPayloadChooser();
    const oldSnapshot = {
      generatedAt: '2026-07-24T02:51:00Z',
      asOfDate: '2026-07-22',
      platforms: {
        wb: {
          rows: [{
            articleKey: 'sku',
            currentPrice: 100,
            valueDate: '2026-06-21',
            daily: [{ date: '2026-06-21', price: 100 }]
          }]
        }
      }
    };
    const freshLocal = {
      generatedAt: '2026-07-23T12:56:00Z',
      asOfDate: '2026-07-22',
      platforms: {
        wb: {
          rows: [{
            articleKey: 'sku',
            currentPrice: 110,
            valueDate: '2026-07-22',
            daily: [{ date: '2026-07-22', price: 110 }]
          }]
        }
      }
    };
    assert.strictEqual(
      choosePayload(oldSnapshot, freshLocal).source,
      'local',
      'Более новый generatedAt не должен перекрывать источник с более свежим фактом цены'
    );

    const preferCabinetStart = renderer.indexOf('  function shouldPreferCabinetPrice(');
    const preferCabinetEnd = renderer.indexOf('\n\n  function buildRow(', preferCabinetStart);
    assert.ok(
      preferCabinetStart >= 0 && preferCabinetEnd > preferCabinetStart,
      'Приоритет кабинетной цены должен оставаться доступным для unit-проверки'
    );
    const createCabinetPreference = new Function(
      `"use strict";
      function positiveNum(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      }
      function isoDate(value) {
        const match = String(value || "").match(/^\\d{4}-\\d{2}-\\d{2}/);
        return match ? match[0] : "";
      }
      ${renderer.slice(preferCabinetStart, preferCabinetEnd)}
      return shouldPreferCabinetPrice;`
    );
    const preferCabinetPrice = createCabinetPreference();
    assert.strictEqual(preferCabinetPrice(120, '2026-07-24', 100, '2026-07-24'), true);
    assert.strictEqual(preferCabinetPrice(120, '2026-07-25', 100, '2026-07-24'), true);
    assert.strictEqual(preferCabinetPrice(120, '2026-07-23', 100, '2026-07-24'), false);
    assert.strictEqual(preferCabinetPrice(120, '', 100, '2026-07-24'), false);
    assert.strictEqual(preferCabinetPrice(120, '2026-07-24', null, ''), true);
    assert.strictEqual(preferCabinetPrice(null, '2026-07-24', 100, '2026-07-24'), false);

    ['index.html', 'live-index.html', 'docs/index.html'].forEach((fileName) => {
      const html = fs.readFileSync(path.join(ROOT, fileName), 'utf8');
      assert.ok(
        html.includes('portal-price-workbench-simple-live.js?v=20260726cabinetwait1'),
        `${fileName} должен обновить кэш загрузчика кабинетных цен`
      );
    });

    assert.deepStrictEqual(pageErrors, []);
    console.log(
      `portal-prices-correctness selftest: ok (${marketplaceAudits.map((item) => (
        `${item.poolRows} ${item.label} SKU, факт до ${item.expectedFactDate}`
      )).join('; ')})`
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
