#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const VERSION = '20260724-planfact-correctness-v2';
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
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
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function readSource(fileName) {
  return fs.readFileSync(path.join(ROOT, fileName), 'utf8');
}

async function snapshot(page) {
  return page.evaluate(() => {
    const root = document.getElementById('view-sku-plan-fact');
    const parseNumber = (value = '') => {
      const normalized = String(value).replace(/\u2212/g, '-').replace(/[^\d-]/g, '');
      return normalized && normalized !== '-' ? Number(normalized) : 0;
    };
    const parsePct = (value = '') => {
      const normalized = String(value).replace(/\u2212/g, '-').replace(',', '.').replace(/[^\d.-]/g, '');
      return normalized && normalized !== '-' ? Number(normalized) : null;
    };
    const kpi = Array.from(root?.querySelectorAll('.pf-v4-kpi') || [])
      .find((node) => node.querySelector('span')?.textContent?.trim() === 'Факт выручки');
    const rows = Array.from(root?.querySelectorAll('.pf-v1-table tbody .sku-plan-fact-row') || []);
    const filterText = root?.querySelector('.pf-v4-filter-actions em')?.textContent || '';
    const filterNumbers = filterText.match(/\d[\d\s\u00a0]*/g) || [];
    const tableBadgeText = root?.querySelector('.pf-v1-table-card .badge-stack')?.textContent || '';
    const status = root?.querySelector('[data-pf-v4-filter="status"]')?.value || '';
    const platform = root?.querySelector('[data-pf-v4-filter="platform"]')?.value || '';
    return {
      version: root?.querySelector('[data-planfact-v4]')?.getAttribute('data-planfact-v4') || '',
      status,
      platform,
      topFact: parseNumber(kpi?.querySelector('strong')?.textContent || ''),
      tableFact: parseNumber(tableBadgeText.replace(/^\s*\d[\d\s\u00a0]*\s+SKU\s*·?/u, '')),
      rowFact: rows.reduce((sum, row) => sum + parseNumber(row.children[5]?.textContent || ''), 0),
      rowCount: rows.length,
      filterVisible: parseNumber(filterNumbers[0] || ''),
      filterTotal: parseNumber(filterNumbers[1] || ''),
      dailyDays: new Set(Array.from(
        root?.querySelectorAll('[data-pf-v4-chart="revenue"] [data-pf-v4-day]') || [],
        (node) => node.getAttribute('data-pf-v4-day')
      ).filter(Boolean)).size,
      freshnessStatus: root?.querySelector('[data-pf-v4-freshness]')?.getAttribute('data-pf-v4-freshness') || '',
      freshnessText: root?.querySelector('[data-pf-v4-freshness]')?.textContent?.trim() || '',
      selectedDate: root?.querySelector('[data-pf-v4-filter="dateTo"]')?.value || '',
      actualFactDate: (() => {
        try {
          return window.skuPlanFactBuildModel?.(null, { noCache: true })?.actualFactDate || '';
        } catch (_) {
          return '';
        }
      })(),
      qualityText: root?.querySelector('[data-pf-v4-quality]')?.textContent?.trim() || '',
      adAttributionText: root?.querySelector('[data-pf-v4-ad-attribution]')?.textContent?.trim() || '',
      payrollText: root?.querySelector('[data-pf-v4-payroll-scope]')?.textContent?.trim() || '',
      statusOptions: Array.from(root?.querySelectorAll('[data-pf-v4-filter="status"] option') || [], (option) => option.value),
      rowAudit: rows.map((row) => {
        const cells = row.children;
        const unitParts = String(cells[15]?.textContent || '').split('/');
        return {
          article: String(cells[0]?.textContent || '').trim().split('\n')[0],
          completionPct: parsePct(cells[3]?.querySelector('strong')?.textContent || cells[3]?.textContent || ''),
          planToDate: parseNumber(cells[4]?.textContent || ''),
          fact: parseNumber(cells[5]?.textContent || ''),
          gap: parseNumber(cells[6]?.textContent || ''),
          marginPct: parsePct(cells[9]?.querySelector('strong')?.textContent || cells[9]?.textContent || ''),
          marginRub: parseNumber(cells[10]?.textContent || ''),
          adSpend: parseNumber(cells[12]?.textContent || ''),
          drrPct: parsePct(cells[14]?.querySelector('strong')?.textContent || cells[14]?.textContent || ''),
          factUnits: parseNumber(unitParts[1] || ''),
          avgCheck: parseNumber(cells[16]?.textContent || '')
        };
      })
    };
  });
}

function assertScope(snapshotValue, label, options = {}) {
  const tolerance = Math.max(snapshotValue.rowCount, 1);
  assert.strictEqual(snapshotValue.topFact, snapshotValue.tableFact, `${label}: верхний KPI и итог таблицы должны совпадать`);
  assert.ok(
    Math.abs(snapshotValue.topFact - snapshotValue.rowFact) <= tolerance,
    `${label}: KPI должен равняться сумме видимых строк (допуск только на округление по строкам)`
  );
  assert.strictEqual(snapshotValue.rowCount, snapshotValue.filterVisible, `${label}: счетчик фильтра должен совпадать с числом строк`);
  if (options.expectRows !== false) assert.ok(snapshotValue.rowCount > 0, `${label}: срез не должен быть пустым`);
}

function assertRowPool(snapshotValue, label) {
  assert.strictEqual(snapshotValue.rowAudit.length, snapshotValue.rowCount, `${label}: в проверку должны попасть все видимые SKU`);
  snapshotValue.rowAudit.forEach((row) => {
    const rowLabel = `${label} / ${row.article || 'SKU'}`;
    assert.ok(
      Math.abs((row.fact - row.planToDate) - row.gap) <= 2,
      `${rowLabel}: разрыв должен равняться факту минус план к дате`
    );
    if (row.planToDate > 0 && row.completionPct !== null) {
      const expectedCompletion = row.fact / row.planToDate * 100;
      const completionBounds = [
        (row.fact - 0.5) / (row.planToDate - 0.5) * 100,
        (row.fact - 0.5) / (row.planToDate + 0.5) * 100,
        (row.fact + 0.5) / (row.planToDate - 0.5) * 100,
        (row.fact + 0.5) / (row.planToDate + 0.5) * 100
      ];
      const completionMin = Math.min(...completionBounds);
      const completionMax = Math.max(...completionBounds);
      assert.ok(
        row.completionPct >= completionMin - 0.1 && row.completionPct <= completionMax + 0.1,
        `${rowLabel}: процент выполнения ${row.completionPct}% должен соответствовать плану ${row.planToDate}, факту ${row.fact} и расчету ${expectedCompletion.toFixed(2)}%`
      );
    }
    if (row.fact > 0 && row.drrPct !== null) {
      const expectedDrr = row.adSpend / row.fact * 100;
      assert.ok(
        Math.abs(row.drrPct - expectedDrr) <= 0.2,
        `${rowLabel}: ДРР должен равняться рекламным расходам / факту`
      );
    }
    if (row.fact > 0 && row.marginPct !== null && row.marginRub) {
      const expectedMarginRub = row.fact * row.marginPct / 100;
      const tolerance = Math.max(10, row.fact * 0.001);
      assert.ok(
        Math.abs(row.marginRub - expectedMarginRub) <= tolerance,
        `${rowLabel}: маржа в рублях должна соответствовать факту и проценту маржи`
      );
    }
    if (row.fact > 0 && row.factUnits > 0 && row.avgCheck > 0) {
      const expectedAvgCheck = row.fact / row.factUnits;
      const tolerance = Math.max(5, expectedAvgCheck * 0.03);
      assert.ok(
        Math.abs(row.avgCheck - expectedAvgCheck) <= tolerance,
        `${rowLabel}: средний чек должен соответствовать факту и количеству`
      );
    }
  });
}

async function selectFilter(page, key, value) {
  const selector = `#view-sku-plan-fact [data-pf-v4-filter="${key}"]`;
  await page.locator(selector).selectOption(value);
  await page.waitForFunction(
    ({ selector: currentSelector, expected, version }) => (
      document.querySelector(currentSelector)?.value === expected
      && document.querySelector('#view-sku-plan-fact [data-planfact-v4]')?.getAttribute('data-planfact-v4') === version
    ),
    { selector, expected: value, version: VERSION },
    { timeout: 30000 }
  );
  await page.waitForTimeout(150);
}

async function run() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  const blockedWbSnapshotRoutes = [];
  let blockedWbSnapshotRequests = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.route('**/rest/v1/portal_data_snapshots**', async (route) => {
      const url = new URL(route.request().url());
      const snapshotFilter = url.searchParams.get('snapshot_key') || '';
      if (!snapshotFilter.includes('wb_substitution_traffic')) {
        await route.continue();
        return;
      }
      blockedWbSnapshotRequests += 1;
      await new Promise((resolve) => {
        blockedWbSnapshotRoutes.push(async () => {
          try {
            await route.abort('timedout');
          } catch (_) {
            // The page may already be closed after the independent Plan-Fact render.
          }
          resolve();
        });
      });
    });
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('altea-portal-active-view-v1', JSON.stringify({
        activeView: 'sku-plan-fact',
        updatedAt: new Date().toISOString()
      }));
      localStorage.setItem('altea.portal.marketplace', 'all');
    });
    await page.goto(`http://127.0.0.1:${port}/live-index.html?planfact-correctness=${Date.now()}#sku-plan-fact`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForFunction((version) => (
      document.querySelector('#view-sku-plan-fact [data-planfact-v4]')?.getAttribute('data-planfact-v4') === version
      && document.querySelectorAll('#view-sku-plan-fact .pf-v1-table tbody .sku-plan-fact-row').length > 0
    ), VERSION, { timeout: 120000 });
    await page.waitForTimeout(250);
    assert.ok(
      blockedWbSnapshotRequests > 0,
      'Тест должен действительно удерживать тяжёлый WB substitution snapshot во время первичной отрисовки'
    );
    await Promise.all(blockedWbSnapshotRoutes.splice(0).map((release) => release()));
    await page.waitForFunction(() => (
      typeof state === 'object'
      && Array.isArray(state?.wbSubstitutionTraffic?.articles)
      && state.wbSubstitutionTraffic.articles.length > 0
    ), null, { timeout: 30000 });
    const substitutionWarmup = await page.evaluate(() => ({
      asOfDate: typeof state === 'object' ? state?.wbSubstitutionTraffic?.asOfDate || '' : '',
      articleCount: typeof state === 'object' ? state?.wbSubstitutionTraffic?.articles?.length || 0 : 0
    }));
    assert.ok(substitutionWarmup.asOfDate, 'Фоновый WB substitution должен сохранить дату среза');
    assert.ok(substitutionWarmup.articleCount > 0, 'Фоновый WB substitution должен обогатить строки после первой отрисовки');

    const reset = page.locator('#view-sku-plan-fact [data-pf-v4-filter-reset]');
    assert.strictEqual(await reset.count(), 1, 'Панель Plan-Fact должна содержать единый сброс фильтров');
    await reset.click();
    await page.waitForFunction(() => (
      document.querySelector('#view-sku-plan-fact [data-pf-v4-filter="status"]')?.value === 'actual'
      && document.querySelector('#view-sku-plan-fact [data-pf-v4-filter="platform"]')?.value === 'all'
    ), null, { timeout: 30000 });

    const actual = await snapshot(page);
    assert.strictEqual(actual.version, VERSION);
    assertScope(actual, 'Актуальные SKU');
    assertRowPool(actual, 'Актуальные SKU');
    assert.ok(actual.dailyDays > 1, 'Дневной график должен строиться из factDaily, а не схлопываться в snapshot');
    assert.notStrictEqual(actual.freshnessStatus, 'unknown', 'Дата факта должна быть определена');
    assert.match(actual.freshnessText, /Факт до \d{4}-\d{2}-\d{2}/);
    assert.ok(
      actual.actualFactDate && actual.freshnessText.includes(`Факт до ${actual.actualFactDate}`),
      'Индикатор актуальности должен показывать последнюю реальную дату факта'
    );
    assert.ok(
      !actual.selectedDate || actual.actualFactDate <= actual.selectedDate,
      'Дата реального факта не должна выходить за выбранный расчетный период'
    );
    assert.match(actual.qualityText, /API без пары/);
    assert.match(actual.adAttributionText, /Атрибуция рекламы/);
    assert.match(actual.payrollText, /не подменяет сумму таблицы|основной экран считается по строкам/);
    assert.ok(actual.statusOptions.includes('unmapped'), 'Должен быть отдельный фильтр API без пары');
    assert.ok(actual.statusOptions.includes('unallocated'), 'Должен быть отдельный фильтр агрегата без SKU');

    await selectFilter(page, 'status', 'all');
    const all = await snapshot(page);
    assertScope(all, 'Все SKU');
    assertRowPool(all, 'Все SKU');
    assert.ok(all.rowCount >= actual.rowCount, 'Полный срез не должен быть меньше актуального');
    assert.ok(all.topFact >= actual.topFact, 'Факт полного среза не должен быть меньше факта актуальных SKU');

    for (const [platform, label] of [['wb', 'WB'], ['ozon', 'Ozon'], ['ya', 'Я.Маркет'], ['goldapple', 'ЗЯ']]) {
      await selectFilter(page, 'platform', platform);
      const platformSnapshot = await snapshot(page);
      assertScope(platformSnapshot, label);
      assertRowPool(platformSnapshot, label);
      assert.ok(platformSnapshot.rowCount <= all.rowCount, `${label}: фильтр площадки должен сужать строки`);
      if (platform === 'wb' || platform === 'ozon') {
        const adAudit = await page.evaluate((platformKey) => {
          const model = window.skuPlanFactBuildModel?.(null, { noCache: true });
          const rowSpend = (model?.rows || []).reduce((sum, row) => (
            sum + Number(row?.platforms?.[platformKey]?.adSpend || 0)
          ), 0);
          return {
            rowSpend,
            attribution: model?.adAttribution?.[platformKey] || null
          };
        }, platform);
        assert.ok(adAudit.attribution?.sourceSpend > 0, `${label}: должен быть источник рекламных расходов`);
        assert.ok(
          Math.abs(adAudit.rowSpend - adAudit.attribution.sourceSpend) <= Math.max(1, adAudit.attribution.sourceSpend * 0.000001),
          `${label}: сумма рекламы по SKU должна сходиться с источником (${JSON.stringify(adAudit)})`
        );
        if (platform === 'wb') {
          assert.ok(
            adAudit.attribution.directSpend / adAudit.attribution.sourceSpend >= 0.8,
            `${label}: не менее 80% расходов должны атрибутироваться напрямую по SKU`
          );
        }
      }
    }

    await selectFilter(page, 'platform', 'all');
    await selectFilter(page, 'status', 'unmapped');
    const unmapped = await snapshot(page);
    assertScope(unmapped, 'API без пары');
    assertRowPool(unmapped, 'API без пары');
    assert.ok(unmapped.rowCount < all.rowCount, 'API без пары должны быть отдельным качественным срезом');

    await selectFilter(page, 'status', 'unallocated');
    const unallocated = await snapshot(page);
    assertScope(unallocated, 'Агрегат без SKU', { expectRows: false });
    assertRowPool(unallocated, 'Агрегат без SKU');
    const supportedAggregatePlatforms = ['WB', 'Ozon', 'Я.Маркет'];
    const aggregatePlatforms = unallocated.rowAudit.map((row) => (
      supportedAggregatePlatforms.find((platform) => row.article.includes(`Неразнесено ${platform}`)) || ''
    ));
    assert.ok(
      aggregatePlatforms.every(Boolean),
      `Строка сверки должна относиться к поддерживаемой площадке: ${JSON.stringify(unallocated.rowAudit)}`
    );
    assert.strictEqual(
      new Set(aggregatePlatforms).size,
      aggregatePlatforms.length,
      'Для каждой площадки должна быть не более одной строки сверки агрегата'
    );

    const coreSource = readSource('app-core-11.js');
    const bootstrapSource = readSource('app-core-01.js');
    const refreshSource = readSource('portal-snapshot-refresh-hotfix.js');
    const supabaseRefreshSource = readSource('portal-supabase-snapshot-hotfix.js');
    const v4Source = readSource('portal-planfact-general-to-detail-v4.js');
    assert.match(bootstrapSource, /void warmSkuPlanFactWbSubstitutionTraffic\(\);/);
    assert.doesNotMatch(
      bootstrapSource.match(/skuPlanFact: async \(\) => \{[\s\S]*?\n  \},\n  productLeaderboard:/)?.[0] || '',
      /wbSubstitutionTraffic\] = await Promise\.all/,
      'WB substitution не должен блокировать обязательный Promise.all План-факта'
    );
    assert.doesNotMatch(
      refreshSource.match(/var LIGHT_REFRESH_KEYS = \[[\s\S]*?\n  \];/)?.[0] || '',
      /wb_substitution_traffic/,
      'Light refresh не должен загружать тяжёлый WB substitution без запроса профильного экрана'
    );
    assert.doesNotMatch(
      supabaseRefreshSource.match(/const BOOT_SNAPSHOT_KEYS = \[[\s\S]*?\n  \];/)?.[0] || '',
      /wb_substitution_traffic/,
      'Boot refresh не должен загружать тяжёлый WB substitution'
    );
    assert.match(coreSource, /SKU_PLAN_FACT_INCLUDE_DERIVED_ROWS/);
    assert.match(coreSource, /payrollReference/);
    assert.match(coreSource, /function skuPlanFactPayrollPlatforms/);
    assert.match(coreSource, /payrollKpiPolicy\?\.includedChannels/);
    assert.match(coreSource, /syntheticUnmapped && !row\.syntheticUnallocated/);
    assert.match(coreSource, /negativeFactCount/);
    assert.match(coreSource, /wb_promotion_api_unmapped_residual/);
    assert.match(coreSource, /planAvailability = 'not_set'/);
    assert.match(coreSource, /const actualFactDate = skuPlanFactLatestActualDate\(indexes, monthKey, filters\.platform\)/);
    assert.match(coreSource, /freshness: skuPlanFactRuntimeFreshness\(actualFactDate\)/);
    assert.doesNotMatch(coreSource, /skuPlanFactRuntimeFreshness\(maxAvailableDate\)/);
    assert.match(v4Source, /metric\.factDaily/);
    assert.match(v4Source, /data-pf-v4-ad-attribution/);
    const wbAdsSyncSource = readSource('scripts/portal-wb-ads-sync.js');
    assert.match(wbAdsSyncSource, /readSubstitutionNmMap/);
    assert.match(v4Source, /function applyPlanFactFilterPatch[\s\S]*?lastShellSignature = '';\s*renderBase\(\);/);
    assert.doesNotMatch(v4Source, /needsBaseRender/);

    ['index.html', 'live-index.html', 'docs/index.html'].forEach((fileName) => {
      const html = readSource(fileName);
      assert.ok(
        html.includes('app-core-01.js?v=20260724allstatuses2ooscorrectness2planfactlazywb1'),
        `${fileName} должен обновить кэш неблокирующей загрузки WB substitution`
      );
      assert.ok(
        html.includes('portal-snapshot-refresh-hotfix.js?v=20260724ooscorrectness3ui23planfactlazywb1'),
        `${fileName} должен обновить кэш лёгкого refresh`
      );
      assert.ok(
        html.includes('app-core-11.js?v=20260724planfactcorrectness4oosforecast1scenario1planscope1'),
        `${fileName} должен обновить кэш расчетной модели, сохранив OOS-версию`
      );
      assert.ok(
        html.includes('portal-live-lazy-hotfixes.js?v=20260724planfact5allstatuses2'),
        `${fileName} должен обновить кэш Plan-Fact V4`
      );
    });

    assert.deepStrictEqual(pageErrors, []);
    console.log(`portal-planfact-correctness selftest: ok (${all.rowCount} SKU, ${all.rowAudit.length} строковых формул)`);
  } finally {
    await Promise.all(blockedWbSnapshotRoutes.splice(0).map((release) => release()));
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
