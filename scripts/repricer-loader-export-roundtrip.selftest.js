#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = process.cwd();

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm'
};

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(ROOT, relative);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403);
      response.end('forbidden');
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500);
        response.end(error.code || 'read_error');
        return;
      }
      let body = data;
      if (relative === 'index.html') {
        body = Buffer.from(
          data.toString('utf8').replace(
            '<head>',
            '<head><script>window.APP_CONFIG={portalAuthRequired:false};window.__ALTEA_AUTH_SESSION__={access_token:"repricer-selftest-token",user:{id:"repricer-selftest-user",email:"repricer-selftest@example.com",user_metadata:{name:"Repricer selftest"}}};window.__ALTEA_PORTAL_ACCESS__={name:"Repricer selftest",email:"repricer-selftest@example.com",role:"admin"};</script>'
          ),
          'utf8'
        );
      }
      response.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/index.html`
      });
    });
  });
}

function workbookMatrix(filePath) {
  const html = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const decode = (value) => String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .trim();
  const matrix = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) => [...rowMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map((cellMatch) => decode(cellMatch[1])));
  assert(matrix.length >= 1, `workbook must contain a header row: ${filePath}`);
  return matrix;
}

function assertHeaders(matrix, expected) {
  const headers = matrix[0].map((value) => String(value || '').trim());
  expected.forEach((header) => assert(headers.includes(header), `missing export header: ${header}`));
  assert.strictEqual(new Set(headers).size, headers.length, 'export must not contain duplicate headers');
  return headers;
}

function assertTemplateRows(matrix, expectedRows, actionHeader) {
  const headers = matrix[0].map((value) => String(value || '').trim());
  const records = matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
  assert.strictEqual(records.length, expectedRows.length, 'downloaded template row count must match the repricer safe-export selection');
  records.forEach((actual, index) => {
    const expected = expectedRows[index];
    assert.strictEqual(String(actual.sku_code || '').trim(), String(expected.sku_code || '').trim());
    assert.strictEqual(Number(String(actual.final_price || '').replace(',', '.')), Number(String(expected.final_price || '').replace(',', '.')));
    assert.strictEqual(String(actual[actionHeader] || '').trim(), String(expected.action || '').trim());
    assert.strictEqual(String(actual.confidence || '').trim(), String(expected.confidence || '').trim());
    assert.strictEqual(Number(String(actual.confidence_score || '').replace(',', '.')), Number(String(expected.confidence_score || '').replace(',', '.')));
    assert.strictEqual(String(actual.decision_text || '').trim(), String(expected.decision_text || '').trim());
    assert.strictEqual(String(actual.reason_code || '').trim(), String(expected.reason_code || '').trim());
    assert.strictEqual(String(actual.comment || '').trim(), String(expected.comment || '').trim());
    assert.match(
      String(actual.load_ts || '').trim(),
      /^(?:\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?|\d{1,2}\/\d{1,2}\/\d{2,4})$/,
      'load_ts must remain a recognizable spreadsheet date'
    );
  });
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function writeEditedCsv(filePath, headers, sourceRow) {
  const values = headers.map((header, index) => {
    if (header === 'Команда') return 'FIX';
    if (header === 'Новая маржа SKU, %') return '35';
    if (header === 'Комментарий для импорта') return 'round-trip browser selftest';
    return sourceRow[index] ?? '';
  });
  fs.writeFileSync(filePath, `\uFEFF${headers.map(csvCell).join(',')}\n${values.map(csvCell).join(',')}\n`, 'utf8');
}

function writeEditedTsv(filePath, headers, sourceRow) {
  const clean = (value) => String(value ?? '').replace(/[\t\r\n]+/g, ' ');
  const values = headers.map((header, index) => {
    if (header === 'Команда') return 'FIX';
    if (header === 'Новая маржа SKU, %') return '36%';
    if (header === 'Комментарий для импорта') return 'round-trip TSV browser selftest';
    return sourceRow[index] ?? '';
  });
  fs.writeFileSync(filePath, `\uFEFF${headers.map(clean).join('\t')}\n${values.map(clean).join('\t')}\n`, 'utf8');
}

function writeEditedPriceCsv(filePath, headers, sourceRow, price) {
  const values = headers.map((header, index) => {
    if (header === 'Команда') return 'FORCE';
    if (header === 'Новая цена, ₽') return String(price);
    if (header === 'Комментарий для импорта') return 'round-trip sharp price import selftest';
    return sourceRow[index] ?? '';
  });
  fs.writeFileSync(filePath, `\uFEFF${headers.map(csvCell).join(',')}\n${values.map(csvCell).join(',')}\n`, 'utf8');
}

function writeEditedStatusCsv(filePath, headers, sourceRow, status) {
  const values = headers.map((header, index) => {
    if (header === 'Команда') return 'FIX';
    if (header === 'Новый статус') return status;
    if (header === 'Комментарий для импорта') return 'round-trip status approval selftest';
    return sourceRow[index] ?? '';
  });
  fs.writeFileSync(filePath, `\uFEFF${headers.map(csvCell).join(',')}\n${values.map(csvCell).join(',')}\n`, 'utf8');
}

async function captureExport(page, mode, targetPath) {
  const button = page.locator(`[data-repricer-export="${mode}"]`).first();
  await button.waitFor({ state: 'visible', timeout: 30000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await button.click();
  const download = await downloadPromise;
  await download.saveAs(targetPath);
  const failure = await download.failure();
  assert.strictEqual(failure, null, `download failed for ${mode}: ${failure}`);
  assert(fs.statSync(targetPath).size > 100, `download is unexpectedly small for ${mode}`);
  return download.suggestedFilename();
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repricer-file-roundtrip-'));
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  await page.addInitScript(() => {
    window.__REPRICER_TEST_DISABLE_AUTO_APPROVAL_SYNC__ = true;
  });
  await page.route('https://iyckwryrucqrxwlowxow.supabase.co/**', async (route) => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'content-type': 'application/json; charset=utf-8'
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }
    const isRead = request.method() === 'GET';
    await route.fulfill({
      status: isRead ? 200 : 201,
      headers,
      body: isRead ? '[]' : '{}'
    });
  });
  page.setDefaultTimeout(30000);
  const pageErrors = [];
  const dialogs = [];
  let approveNextImport = false;

  page.on('pageerror', (error) => pageErrors.push(error.message || String(error)));
  page.on('dialog', async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (dialog.type() === 'confirm') {
      if (approveNextImport) await dialog.accept();
      else await dialog.dismiss();
      return;
    }
    await dialog.accept();
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.__alteaAppState?.boot, undefined, { timeout: 30000 });
    await page.waitForFunction(() => Array.isArray(window.__alteaAppState?.skus) && window.__alteaAppState.skus.length > 0, undefined, { timeout: 45000 });
    const premiumNav = page.locator('[data-premium-nav="repricer"]').first();
    if (await premiumNav.count() && await premiumNav.isVisible().catch(() => false)) {
      await premiumNav.click();
    } else {
      await page.evaluate(() => {
        const target = document.querySelector('[data-premium-nav="repricer"], .nav-btn[data-view="repricer"]');
        if (!target) throw new Error('Repricer navigation target is missing');
        target.click();
      });
    }
    await page.waitForSelector('#view-repricer.active [data-repricer-export="all"]', { timeout: 90000 });
    await page.waitForFunction(
      () => window.__alteaAppState?.boot?.dataReady
        && window.__alteaAppState?.boot?.lazyReady?.repricer
        && !window.__alteaAppState?.boot?.lazyLoads?.repricer,
      undefined,
      { timeout: 45000 }
    );
    const iuEconomics = await page.evaluate(() => {
      const defaults = defaultRepricerSettings();
      const migrated = normalizeRepricerSettings({
        feeRules: {
          wb: { commissionPct: 19, logisticsRub: 72, storageRub: 6, adRub: 35, returnsRub: 12, otherRub: 0 },
          ozon: { commissionPct: 18, logisticsRub: 68, storageRub: 5, adRub: 30, returnsRub: 10, otherRub: 0 }
        }
      });
      return {
        defaults,
        migrated,
        wbMarginRub: repricerMarginAtPrice(1000, 1, 0.3203, 0.0877, 90, 0, 100),
        ozonVariableRate: defaults.feeRules.ozon.commissionPct + defaults.feeRules.ozon.adPct
      };
    });
    assert.strictEqual(iuEconomics.defaults.feeRules.wb.commissionPct, 32.03);
    assert.strictEqual(iuEconomics.defaults.feeRules.wb.adPct, 8.77);
    assert.strictEqual(iuEconomics.migrated.feeRules.wb.commissionPct, 32.03);
    assert.strictEqual(iuEconomics.migrated.feeRules.wb.adPct, 8.77);
    assert.strictEqual(iuEconomics.migrated.feeRules.ozon.commissionPct, 31.3499);
    assert.strictEqual(iuEconomics.migrated.feeRules.ozon.adPct, 24.878);
    assert(Math.abs(iuEconomics.wbMarginRub - 402) < 1e-9);
    assert(Math.abs(iuEconomics.ozonVariableRate - 56.2279) < 1e-9);
    const staleGate = await page.evaluate(() => {
      const rows = buildRepricerRows(true);
      const sides = rows.flatMap((row) => [row.wb, row.ozon].filter(Boolean));
      return {
        staleSides: sides.filter((side) => side.currentPriceStale || side.currentPriceFreshnessMissing).length,
        safeRows: repricerExportTemplateRows('wb', { rows }).length + repricerExportTemplateRows('ozon', { rows }).length
      };
    });
    assert(staleGate.staleSides > 0, 'fixture must expose stale current prices before the fresh-snapshot simulation');
    assert.strictEqual(staleGate.safeRows, 0, 'stale current prices must never reach marketplace exports');

    await page.evaluate(() => {
      window.__REPRICER_TEST_FORCE_CURRENT_PRICE_FRESH__ = true;
      const now = new Date().toISOString();
      const date = now.slice(0, 10);
      const platforms = window.__alteaAppState?.smartPriceWorkbench?.platforms || {};
      ['wb', 'ozon'].forEach((platform) => {
        (platforms?.[platform]?.rows || []).forEach((row) => {
          row.currentPriceDate = date;
          row.historyFreshnessDate = date;
          row.valueDate = date;
        });
      });
      window.__alteaAppState.smartPriceWorkbench.generatedAt = now;
      invalidateRepricerRowsCache();
      const root = document.getElementById('view-repricer');
      if (root) root.dataset.repricerRenderSignature = '';
      renderRepricer();
    });
    const expectedExports = await page.evaluate(() => {
      const rows = buildRepricerRows();
      const sides = rows.flatMap((row) => [row.wb, row.ozon].filter(Boolean));
      const canonicalSides = sides.filter((side) => side.canonicalSource);
      const marginGapSides = sides.filter((side) => side.marginPolicyMissing);
      const shadow = window.__alteaAppState?.repricerShadowReport || {};
      const key = (articleKey, platform) => `${String(platform || '').trim().toLowerCase()}|${String(articleKey || '').trim().toLowerCase().replace(/[^a-zа-я0-9]+/gi, '')}`;
      const requiredMarginGapKeys = (window.__alteaAppState?.repricerMarginMinMaxGaps?.rows || [])
        .filter((row) => !Array.isArray(row?.missing) || row.missing.includes('margin'))
        .map((row) => key(row.articleKey || row.article || row.sku, row.platform));
      const blockedMarginGapKeys = marginGapSides.map((side) => key(side.articleKey, side.platform));
      return {
        auditRows: repricerExportRows('all', rows).length,
        skuRows: rows.length,
        wb: repricerExportTemplateRows('wb', { rows }),
        ozon: repricerExportTemplateRows('ozon', { rows }),
        runtime: {
          shadowLoaded: shadow.schema === 'repricer-shadow-report-v1',
          cutoverAllowed: shadow.cutover_allowed === true,
          canonicalSides: canonicalSides.length,
          requiredMarginGaps: Number(window.__alteaAppState?.repricerMarginMinMaxGaps?.summary?.blockedRows) || 0,
          marginGapSides: marginGapSides.length,
          uncoveredRequiredMarginGaps: requiredMarginGapKeys.filter((requiredKey) => !blockedMarginGapKeys.includes(requiredKey)),
          unsafeMarginExports: marginGapSides.filter((side) => side.safeToExport || side.promoSafeToExport).length
        }
      };
    });
    assert.strictEqual(expectedExports.runtime.shadowLoaded, true, 'browser must load the repricer shadow report');
    assert(
      expectedExports.runtime.marginGapSides >= expectedExports.runtime.requiredMarginGaps,
      'browser must expose at least every required margin gap as a blocked side'
    );
    assert.deepStrictEqual(
      expectedExports.runtime.uncoveredRequiredMarginGaps,
      [],
      'every required margin-gap identity must be blocked in the browser'
    );
    assert.strictEqual(expectedExports.runtime.unsafeMarginExports, 0, 'required margin gaps must never reach marketplace exports');
    if (expectedExports.runtime.cutoverAllowed) {
      assert(expectedExports.runtime.canonicalSides > 0, 'approved cutover must activate canonical rows');
      await page.locator('#view-repricer.active .chip:visible', { hasText: 'CANONICAL ACTIVE' }).first().waitFor({ state: 'visible' });
    } else {
      assert(expectedExports.runtime.canonicalSides > 0, 'blocked cutover must still expose canonical prices for operator audit');
      assert.strictEqual(
        await page.locator('#view-repricer').getAttribute('data-repricer-data-source'),
        'canonical-audit',
        'blocked cutover must label canonical rows as audit-only'
      );
      await page.locator('#view-repricer.active .chip:visible', { hasText: 'CANONICAL AUDIT' }).first().waitFor({ state: 'visible' });
    }

    let downloadExpectations = expectedExports;
    if (!expectedExports.runtime.cutoverAllowed) {
      await page.evaluate(() => {
        window.__alteaAppState.repricerShadowReport = {
          ...(window.__alteaAppState.repricerShadowReport || {}),
          schema: 'repricer-shadow-report-v1',
          cutover_allowed: true
        };
        invalidateRepricerRowsCache();
        const root = document.getElementById('view-repricer');
        if (root) root.dataset.repricerRenderSignature = '';
        renderRepricer();
      });
      await page.waitForFunction(
        () => document.querySelector('#view-repricer')?.dataset?.repricerDataSource === 'canonical-active',
        null,
        { timeout: 30000 }
      );
      downloadExpectations = await page.evaluate(() => {
        const rows = buildRepricerRows();
        return {
          auditRows: repricerExportRows('all', rows).length,
          skuRows: rows.length,
          wb: repricerExportTemplateRows('wb', { rows }),
          ozon: repricerExportTemplateRows('ozon', { rows })
        };
      });
      assert(
        downloadExpectations.wb.length + downloadExpectations.ozon.length > 0,
        'simulated approved cutover must expose at least one verified export row for round-trip testing'
      );
    }

    const auditPath = path.join(tempDir, 'repricer-audit.xls');
    const marginPath = path.join(tempDir, 'repricer-sku-margin.xls');
    const wbTemplatePath = path.join(tempDir, 'repricer-wb-template.xls');
    const ozonTemplatePath = path.join(tempDir, 'repricer-ozon-template.xls');
    const auditName = await captureExport(page, 'all', auditPath);
    const marginName = await captureExport(page, 'margin:sku', marginPath);
    const wbTemplateName = await captureExport(page, 'template:wb', wbTemplatePath);
    const ozonTemplateName = await captureExport(page, 'template:ozon', ozonTemplatePath);

    const audit = workbookMatrix(auditPath);
    const auditHeaders = assertHeaders(audit, [
      'Команда',
      'Новая маржа SKU, %',
      'Новый MIN, ₽',
      'Новый MAX, ₽',
      'Новая себестоимость, ₽',
      'Новый статус',
      'Новая роль',
      'Новый launch ready',
      'Комментарий для импорта',
      'Площадка',
      'Артикул',
      'Маржа, %',
      'Порог маржи, %',
      'Floor маржи, ₽',
      'Источник маржи',
      'Маржа обязательна',
      'Маржа приоритетна',
      'MAX поднят маржой'
    ]);
    assert.strictEqual(auditHeaders[0], 'Новая маржа SKU, %', 'SKU margin input must be the leftmost audit column');
    assert(audit.length > 1, 'audit export must contain data rows');
    assert.strictEqual(audit.length - 1, downloadExpectations.auditRows, 'downloaded audit row count must match the repricer');
    const inputColumns = [
      'Команда',
      'Новая цена, ₽',
      'Новая маржа SKU, %',
      'Новый MIN, ₽',
      'Новый MAX, ₽',
      'Новая себестоимость, ₽',
      'Новый статус',
      'Новая роль',
      'Новый launch ready',
      'Комментарий для импорта'
    ].map((header) => auditHeaders.indexOf(header));
    audit.slice(1).forEach((row) => {
      inputColumns.forEach((index) => assert.strictEqual(String(row[index] || '').trim(), '', `editable export column must be blank: ${auditHeaders[index]}`));
      row.forEach((value, index) => {
        assert(!String(value || '').includes('[object Object]'), `audit export must serialize source labels as text: ${auditHeaders[index]}`);
      });
    });

    const marginWorkbook = workbookMatrix(marginPath);
    const marginHeaders = assertHeaders(marginWorkbook, [
      'article_key',
      'Артикул',
      'Название',
      'Статус товара',
      'Текущая маржа SKU, %',
      'Новая маржа SKU, %',
      'Маржа обязательна',
      'Что сделать',
      'Площадки',
      'Комментарий для импорта',
      'Как заполнить'
    ]);
    assert.strictEqual(marginHeaders[0], 'Новая маржа SKU, %', 'SKU margin input must be the leftmost margin-workbook column');
    assert.match(marginName, /^repricer-sku-margin-\d{4}-\d{2}-\d{2}\.xls$/);
    assert.strictEqual(marginWorkbook.length - 1, downloadExpectations.skuRows, 'margin workbook must contain exactly one row per SKU');
    const marginArticleIndex = marginHeaders.indexOf('article_key');
    const newMarginIndex = marginHeaders.indexOf('Новая маржа SKU, %');
    const marginArticles = marginWorkbook.slice(1).map((row) => String(row[marginArticleIndex] || '').trim()).filter(Boolean);
    assert.strictEqual(new Set(marginArticles).size, marginArticles.length, 'margin workbook must not duplicate SKU rows');
    marginWorkbook.slice(1).forEach((row) => {
      assert.strictEqual(String(row[newMarginIndex] || '').trim(), '', 'new SKU margin input must be blank by default');
    });

    const wbTemplate = workbookMatrix(wbTemplatePath);
    const wbHeaders = assertHeaders(wbTemplate, ['sku_code', 'final_price', 'discount_flag', 'confidence', 'reason_code', 'load_ts', 'comment']);
    const ozonTemplate = workbookMatrix(ozonTemplatePath);
    const ozonHeaders = assertHeaders(ozonTemplate, ['sku_code', 'final_price', 'auto_action', 'confidence', 'reason_code', 'load_ts', 'comment']);
    assert.strictEqual(wbHeaders.length, 9);
    assert.strictEqual(ozonHeaders.length, 9);
    assertTemplateRows(wbTemplate, downloadExpectations.wb, 'discount_flag');
    assertTemplateRows(ozonTemplate, downloadExpectations.ozon, 'auto_action');

    const input = page.locator('[data-repricer-audit-import]').first();
    await input.setInputFiles(auditPath);
    await page.waitForFunction((fileName) => window.__alteaAppState?.storage?.repricerLastImportValidation?.fileName === fileName, path.basename(auditPath), { timeout: 30000 });
    const unchangedValidation = await page.evaluate(() => window.__alteaAppState.storage.repricerLastImportValidation);
    assert.strictEqual(unchangedValidation.errors, 0);
    assert.strictEqual(unchangedValidation.actionable, 0, 'unchanged exported audit must not create import actions');
    assert.strictEqual(unchangedValidation.skipped, unchangedValidation.rows);

    const firstDataRow = audit.slice(1).find((row) => String(row[auditHeaders.indexOf('Артикул')] || '').trim());
    assert(firstDataRow, 'audit export must contain at least one SKU row');
    const article = String(firstDataRow[auditHeaders.indexOf('article_key')] || firstDataRow[auditHeaders.indexOf('Артикул')] || '').trim();
    const editedCsvPath = path.join(tempDir, 'repricer-audit-edited.csv');
    writeEditedCsv(editedCsvPath, auditHeaders, firstDataRow);
    approveNextImport = true;
    await page.locator('[data-repricer-audit-import]').first().setInputFiles(editedCsvPath);
    await page.waitForFunction((fileName) => window.__alteaAppState?.storage?.repricerLastAuditImport?.fileName === fileName, path.basename(editedCsvPath), { timeout: 30000 });

    const applied = await page.evaluate((articleKey) => {
      const storage = window.__alteaAppState.storage;
      const profile = (storage.repricerSkuProfiles || []).find((item) => String(item.articleKey || '') === articleKey);
      const task = (storage.repricerPendingApiTasks || []).find((item) => String(item.articleKey || '') === articleKey && String(item.type || item.action || '') === 'UPDATE_SKU_MARGIN');
      return {
        summary: storage.repricerLastAuditImport,
        profile,
        task
      };
    }, article);
    assert.strictEqual(applied.summary.errors, 0);
    assert.strictEqual(applied.summary.applied, 1);
    assert.strictEqual(applied.summary.pendingTasks, 1);
    assert(applied.profile, 'edited margin import must update the SKU profile');
    assert(Math.abs(Number(applied.profile.targetMarginPct) - 0.35) < 0.0001);
    assert(applied.task, 'edited margin import must create UPDATE_SKU_MARGIN API task');
    assert(Math.abs(Number(applied.task.targetMarginPct ?? applied.task.value) - 0.35) < 0.0001);

    const editedTsvPath = path.join(tempDir, 'repricer-audit-edited.tsv');
    writeEditedTsv(editedTsvPath, auditHeaders, firstDataRow);
    await page.locator('[data-repricer-audit-import]').first().setInputFiles(editedTsvPath);
    await page.waitForFunction((fileName) => window.__alteaAppState?.storage?.repricerLastAuditImport?.fileName === fileName, path.basename(editedTsvPath), { timeout: 30000 });
    const tsvApplied = await page.evaluate((articleKey) => {
      const storage = window.__alteaAppState.storage;
      const profile = (storage.repricerSkuProfiles || []).find((item) => String(item.articleKey || '') === articleKey);
      const task = (storage.repricerPendingApiTasks || []).find((item) => String(item.articleKey || '') === articleKey && String(item.type || item.action || '') === 'UPDATE_SKU_MARGIN');
      return {
        summary: storage.repricerLastAuditImport,
        profile,
        task
      };
    }, article);
    assert.strictEqual(tsvApplied.summary.errors, 0);
    assert.strictEqual(tsvApplied.summary.applied, 1);
    assert(tsvApplied.profile, 'edited TSV margin import must update the SKU profile');
    assert(Math.abs(Number(tsvApplied.profile.targetMarginPct) - 0.36) < 0.0001);
    assert(tsvApplied.task, 'edited TSV margin import must update the margin API task');
    assert(Math.abs(Number(tsvApplied.task.targetMarginPct ?? tsvApplied.task.value) - 0.36) < 0.0001);

    const currentStatusKey = await page.evaluate((articleKey) => {
      const sku = window.__alteaAppState.skus.find((item) => item.articleKey === articleKey);
      return window.productLifecycleForSku(sku || { articleKey }, articleKey)?.key || 'active';
    }, article);
    const importedStatus = currentStatusKey === 'exit' ? 'Актуальный' : 'Вывод';
    const statusCsvPath = path.join(tempDir, 'repricer-audit-status.csv');
    writeEditedStatusCsv(statusCsvPath, auditHeaders, firstDataRow, importedStatus);
    approveNextImport = true;
    await page.locator('[data-repricer-audit-import]').first().setInputFiles(statusCsvPath);
    await page.waitForFunction(
      (fileName) => window.__alteaAppState?.storage?.repricerLastAuditImport?.fileName === fileName,
      path.basename(statusCsvPath),
      { timeout: 30000 }
    );
    const pendingStatus = await page.evaluate((articleKey) => {
      const storage = window.__alteaAppState.storage;
      const decisions = (storage.skuDecisionApprovals || [])
        .filter((item) => item.articleKey === articleKey && item.type === 'PRODUCT_STATUS_CHANGE');
      const decision = decisions[0] || null;
      const profile = (storage.repricerSkuProfiles || []).find((item) => item.articleKey === articleKey) || null;
      const override = (storage.productLifecycleOverrides || []).find((item) => item.articleKey === articleKey) || null;
      const task = (storage.tasks || []).find((item) => item.id === decision?.taskId) || null;
      return { decision, profile, override, task };
    }, article);
    assert.strictEqual(pendingStatus.decision?.status, 'waiting_rop', JSON.stringify(pendingStatus));
    assert.strictEqual(pendingStatus.task?.status, 'waiting_rop', JSON.stringify(pendingStatus));
    assert.notStrictEqual(pendingStatus.profile?.status, importedStatus, 'imported status must not enter the repricer profile before ROP approval');
    assert.strictEqual(pendingStatus.override, null, 'imported status must not alter lifecycle before ROP approval');
    await page.evaluate(async (taskId) => {
      await window.approveTaskByRop(taskId, 'Импортированный статус подтверждён.');
    }, pendingStatus.decision.taskId);
    const approvedStatus = await page.evaluate((articleKey) => {
      const storage = window.__alteaAppState.storage;
      const decision = (storage.skuDecisionApprovals || [])
        .find((item) => item.articleKey === articleKey && item.type === 'PRODUCT_STATUS_CHANGE');
      const override = (storage.productLifecycleOverrides || []).find((item) => item.articleKey === articleKey) || null;
      const controls = window.buildRepricerControlsPayload();
      const controlsOverride = (controls.productLifecycleOverrides || []).find((item) => item.articleKey === articleKey) || null;
      return { decision, override, controlsOverride };
    }, article);
    assert.strictEqual(approvedStatus.decision?.status, 'applied', JSON.stringify(approvedStatus));
    assert(approvedStatus.override?.key, JSON.stringify(approvedStatus));
    assert.strictEqual(approvedStatus.controlsOverride?.key, approvedStatus.override.key, 'approved lifecycle must enter the remote repricer controls payload');

    const articleIndex = auditHeaders.indexOf('article_key') >= 0
      ? auditHeaders.indexOf('article_key')
      : auditHeaders.indexOf('Артикул');
    const platformIndex = auditHeaders.indexOf('Площадка');
    const currentPriceIndex = auditHeaders.indexOf('Текущая цена, ₽');
    const safeExportIndex = auditHeaders.indexOf('В безопасной выгрузке');
    const priceDataRow = audit.slice(1).find((row) => {
      const platform = String(row[platformIndex] || '').trim().toLowerCase();
      const currentPrice = Number(String(row[currentPriceIndex] || '').replace(',', '.'));
      const safeExport = String(row[safeExportIndex] || '').trim().toLowerCase();
      return String(row[articleIndex] || '').trim()
        && ['wb', 'ozon'].includes(platform)
        && Number.isFinite(currentPrice)
        && currentPrice > 0
        && safeExport === 'yes';
    });
    assert(priceDataRow, 'audit export must contain a safe side with current price for price import');
    const priceArticle = String(priceDataRow[articleIndex] || '').trim();
    const pricePlatform = String(priceDataRow[platformIndex] || '').trim().toLowerCase();
    const sourceCurrentPrice = Number(String(priceDataRow[currentPriceIndex] || '').replace(',', '.'));
    const importedPrice = Math.max(1, Math.round(sourceCurrentPrice * 1.2));
    const priceCsvPath = path.join(tempDir, 'repricer-audit-price.csv');
    writeEditedPriceCsv(priceCsvPath, auditHeaders, priceDataRow, importedPrice);
    const priorOverride = await page.evaluate(({ articleKey, platform }) => {
      const item = (window.__alteaAppState.storage.repricerOverrides || [])
        .find((row) => row.articleKey === articleKey && row.platform === platform);
      return item ? { ...item } : null;
    }, { articleKey: priceArticle, platform: pricePlatform });
    approveNextImport = true;
    await page.locator('[data-repricer-audit-import]').first().setInputFiles(priceCsvPath);
    await page.waitForFunction(
      (fileName) => window.__alteaAppState?.storage?.repricerLastAuditImport?.fileName === fileName,
      path.basename(priceCsvPath),
      { timeout: 30000 }
    );
    const pendingPrice = await page.evaluate(({ articleKey, platform, price }) => {
      const storage = window.__alteaAppState.storage;
      const decision = (storage.skuDecisionApprovals || [])
        .find((item) => item.articleKey === articleKey
          && item.platform === platform
          && item.type === 'SHARP_PRICE_CHANGE'
          && Number(item.proposedValue) === price);
      const task = (storage.tasks || []).find((item) => item.id === decision?.taskId);
      const override = (storage.repricerOverrides || [])
        .find((item) => item.articleKey === articleKey && item.platform === platform);
      return {
        summary: storage.repricerLastAuditImport,
        decision,
        taskStatus: task?.status || '',
        override: override ? { ...override } : null
      };
    }, { articleKey: priceArticle, platform: pricePlatform, price: importedPrice });
    assert.strictEqual(pendingPrice.summary.errors, 0);
    assert.strictEqual(pendingPrice.summary.applied, 1);
    assert.strictEqual(pendingPrice.decision?.status, 'waiting_rop', JSON.stringify(pendingPrice));
    assert(pendingPrice.decision?.taskId, 'sharp imported price must create a ROP task');
    assert.strictEqual(pendingPrice.taskStatus, 'waiting_rop');
    assert.notStrictEqual(
      Number(pendingPrice.override?.forcePrice),
      importedPrice,
      'imported sharp price must not change the working override before ROP approval'
    );
    if (priorOverride) {
      assert.strictEqual(Number(pendingPrice.override?.forcePrice || 0), Number(priorOverride.forcePrice || 0));
    }

    await page.evaluate(async (taskId) => {
      await window.approveTaskByRop(taskId, 'Цена из файла подтверждена РОПом.');
    }, pendingPrice.decision.taskId);
    await page.waitForFunction(({ articleKey, platform, price }) => {
      const storage = window.__alteaAppState.storage;
      const decision = (storage.skuDecisionApprovals || [])
        .find((item) => item.articleKey === articleKey
          && item.platform === platform
          && item.type === 'SHARP_PRICE_CHANGE'
          && Number(item.proposedValue) === price);
      const task = (storage.tasks || []).find((item) => item.id === decision?.taskId);
      const override = (storage.repricerOverrides || [])
        .find((item) => item.articleKey === articleKey && item.platform === platform);
      return decision?.status === 'applied'
        && task?.status === 'done'
        && Number(override?.forcePrice) === price
        && override?.approvalStatus === 'approved';
    }, { articleKey: priceArticle, platform: pricePlatform, price: importedPrice });
    const appliedPrice = await page.evaluate(({ articleKey, platform, price }) => {
      const rows = window.buildRepricerRows();
      const row = rows.find((item) => item.articleKey === articleKey);
      const side = row?.[platform] || null;
      const template = window.repricerExportTemplateRows(platform, { rows })
        .find((item) => String(item.sku_code || '').trim() === articleKey);
      const controls = window.buildRepricerControlsPayload();
      const controlsOverride = (controls.overrides || [])
        .find((item) => item.articleKey === articleKey && item.platform === platform);
      return {
        overridePrice: Number(side?.override?.forcePrice),
        finalPrice: Number(side?.finalPrice),
        templatePrice: template ? Number(template.final_price) : null,
        approvalStatus: side?.override?.approvalStatus || '',
        controlsOverridePrice: Number(controlsOverride?.forcePrice),
        requestedPrice: price
      };
    }, { articleKey: priceArticle, platform: pricePlatform, price: importedPrice });
    assert.strictEqual(appliedPrice.overridePrice, importedPrice, JSON.stringify(appliedPrice));
    assert.strictEqual(appliedPrice.approvalStatus, 'approved', JSON.stringify(appliedPrice));
    assert.strictEqual(appliedPrice.controlsOverridePrice, importedPrice, 'approved price must enter the remote repricer controls payload');
    assert(Number.isFinite(appliedPrice.finalPrice) && appliedPrice.finalPrice > 0, JSON.stringify(appliedPrice));
    assert.strictEqual(appliedPrice.templatePrice, appliedPrice.finalPrice, JSON.stringify(appliedPrice));
    assert.strictEqual(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);

    console.log(JSON.stringify({
      status: 'ok',
      audit: {
        file: auditName,
        rows: audit.length - 1,
        columns: auditHeaders.length,
        unchangedRoundTrip: {
          actionable: unchangedValidation.actionable,
          skipped: unchangedValidation.skipped,
          errors: unchangedValidation.errors
        }
      },
      marginWorkbook: {
        file: marginName,
        rows: marginWorkbook.length - 1,
        columns: marginHeaders.length
      },
      marketplaceTemplates: {
        wb: { file: wbTemplateName, rows: wbTemplate.length - 1, columns: wbHeaders.length },
        ozon: { file: ozonTemplateName, rows: ozonTemplate.length - 1, columns: ozonHeaders.length }
      },
      runtime: expectedExports.runtime,
    editedImport: {
        article,
        csv: {
          applied: applied.summary.applied,
          errors: applied.summary.errors,
          targetMarginPct: applied.profile.targetMarginPct
        },
      tsv: {
        applied: tsvApplied.summary.applied,
        errors: tsvApplied.summary.errors,
        targetMarginPct: tsvApplied.profile.targetMarginPct
      },
      status: {
        approvalStatus: approvedStatus.decision?.status,
        lifecycleKey: approvedStatus.override?.key
      },
        price: {
          article: priceArticle,
          platform: pricePlatform,
          uploadedPrice: importedPrice,
          appliedOverridePrice: appliedPrice.overridePrice,
          exportedFinalPrice: appliedPrice.templatePrice,
          approvalStatus: appliedPrice.approvalStatus
        },
        apiTask: tsvApplied.task.type || tsvApplied.task.action
      },
      dialogs: dialogs.length,
      pageErrors: pageErrors.length
    }, null, 2));
    console.log('[repricer-file-roundtrip-selftest] OK: browser audit export, CSV/TSV imports, sharp-price ROP task, approved price, and WB/Ozon templates passed');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
