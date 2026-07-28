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
      const body = relative === 'index.html'
        ? Buffer.from(data.toString('utf8').replace(
          '<head>',
          '<head><script>window.APP_CONFIG={portalAuthRequired:false};window.__ALTEA_AUTH_SESSION__={access_token:"repricer-selftest-token",user:{id:"repricer-selftest-user",email:"repricer-selftest@example.com",user_metadata:{name:"Repricer selftest"}}};window.__ALTEA_PORTAL_ACCESS__={name:"Repricer selftest",email:"repricer-selftest@example.com",role:"admin"};</script>'
        ), 'utf8')
        : data;
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
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}/index.html?academy=off`
      });
    });
  });
}

async function openView(page, view) {
  const premium = page.locator(`[data-premium-nav="${view}"]`).first();
  if (await premium.count() && await premium.isVisible().catch(() => false)) {
    await premium.click();
    return;
  }
  await page.evaluate((targetView) => {
    const target = document.querySelector(`[data-premium-nav="${targetView}"], .nav-btn[data-view="${targetView}"]`);
    if (!target) throw new Error(`Navigation target is missing: ${targetView}`);
    target.click();
  }, view);
}

async function run() {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.setDefaultTimeout(90000);
  await page.route('https://iyckwryrucqrxwlowxow.supabase.co/**', async (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'content-type': 'application/json; charset=utf-8'
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }
    await route.fulfill({ status: 200, headers, body: '[]' });
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('dialog', (dialog) => dialog.accept());

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__alteaAppState?.boot?.dataReady && Array.isArray(window.__alteaAppState?.skus), null, { timeout: 90000 });
    await page.evaluate(() => window.setView('repricer'));
    await page.waitForFunction(
      () => window.__alteaAppState?.boot?.lazyReady?.repricer
        && Array.isArray(window.__alteaAppState?.canonicalRepricer?.rows)
        && window.__alteaAppState.canonicalRepricer.rows.length > 0,
      null,
      { timeout: 90000 }
    );
    await page.addScriptTag({ url: new URL('portal-sku-launch-v1.js', url).toString() });
    await page.waitForFunction(() => window.__ALTEA_SKU_LAUNCH_V1__ === true);
    await page.evaluate(() => {
      window.setView('sku-contour');
      window.renderSkuContour('view-sku-contour');
    });
    await page.waitForSelector('[data-sku-launch-version="20260724sku-rop-approval-v1"]', { timeout: 90000 });
    await page.waitForSelector('[data-sku-v1-product-status]:not([disabled])', { timeout: 90000 });

    const iuMarginAudit = await page.evaluate(() => {
      const articleKey = 'retiderm_50ml';
      const rows = (window.__alteaAppState.canonicalRepricer?.rows || [])
        .filter((row) => row.article_key === articleKey && ['wb', 'ozon'].includes(row.platform));
      return {
        articleKey,
        expected: Math.min(...rows.map((row) => Number(row.recommendation?.current_margin_pct)).filter(Number.isFinite)),
        rowCount: rows.length
      };
    });
    assert.strictEqual(iuMarginAudit.rowCount, 2, JSON.stringify(iuMarginAudit));
    await page.evaluate((articleKey) => {
      window.__alteaAppState.filters.search = articleKey;
      window.renderSkuContour('view-sku-contour');
    }, iuMarginAudit.articleKey);
    const iuStatusSelect = page.locator(`[data-sku-v1-product-status="${iuMarginAudit.articleKey}"]:not([disabled])`);
    await iuStatusSelect.waitFor({ timeout: 30000 });
    const iuCurrentStatus = await iuStatusSelect.inputValue();
    await iuStatusSelect.selectOption(iuCurrentStatus === 'exit' ? 'active' : 'exit');
    await page.waitForSelector('[data-sku-status-decision-backdrop]');
    const iuMarginCard = page.locator('.sl-v1-decision-metric').filter({ hasText: 'Маржа ИУ' });
    const iuMarginText = await iuMarginCard.innerText();
    assert(iuMarginText.includes((iuMarginAudit.expected * 100).toFixed(1)), `IU margin mismatch: ${iuMarginText}`);
    assert(!iuMarginText.includes('93.2'), `legacy gross margin leaked into status decision: ${iuMarginText}`);
    assert(iuMarginText.includes('минимум площадок'), `conservative platform rule missing: ${iuMarginText}`);
    await page.locator('[data-sku-status-decision-close]').first().click();
    await page.evaluate(() => {
      window.__alteaAppState.filters.search = '';
      window.renderSkuContour('view-sku-contour');
    });
    await page.waitForSelector('[data-sku-v1-product-status]:not([disabled])', { timeout: 30000 });

    const target = await page.locator('[data-sku-v1-product-status]:not([disabled])').first().evaluate((select) => ({
      articleKey: select.dataset.skuV1ProductStatus,
      current: select.value
    }));
    const proposed = target.current === 'exit' ? 'active' : 'exit';
    await page.locator(`[data-sku-v1-product-status="${target.articleKey}"]`).selectOption(proposed);
    await page.waitForSelector('[data-sku-status-decision-backdrop]');

    const metricsVisible = await page.locator('.sl-v1-decision-metric').count();
    assert.strictEqual(metricsVisible, 4, 'status decision must show plan/margin/stock/fact metrics');
    await page.fill('[data-sku-status-decision-form] textarea[name="reason"]', 'План ниже темпа, остаток высокий; предлагаем управляемый вывод SKU.');
    await page.click('[data-sku-status-decision-form] button[type="submit"]');
    await page.waitForFunction((articleKey) => (window.__alteaAppState.storage.skuDecisionApprovals || [])
      .some((item) => item.articleKey === articleKey && item.type === 'PRODUCT_STATUS_CHANGE'), target.articleKey, { timeout: 30000 });

    const pendingStatus = await page.evaluate((articleKey) => {
      const state = window.__alteaAppState;
      const decision = (state.storage.skuDecisionApprovals || [])
        .find((item) => item.articleKey === articleKey && item.type === 'PRODUCT_STATUS_CHANGE');
      const task = (state.storage.tasks || []).find((item) => item.id === decision.taskId);
      const lifecycle = window.productLifecycleForSku(state.skus.find((item) => item.articleKey === articleKey), articleKey);
      return {
        decision,
        taskStatus: task?.status,
        lifecycleKey: lifecycle?.key,
        overrideKey: (state.storage.productLifecycleOverrides || []).find((item) => item.articleKey === articleKey)?.key || ''
      };
    }, target.articleKey);
    assert.strictEqual(
      pendingStatus.decision.status,
      'waiting_rop',
      `status request failed: ${pendingStatus.decision.error || JSON.stringify(pendingStatus.decision)}`
    );
    assert(pendingStatus.decision.taskId, 'status approval decision must reference an auto-created task');
    assert.strictEqual(pendingStatus.taskStatus, 'waiting_rop');
    assert.strictEqual(pendingStatus.lifecycleKey, target.current, 'status must remain unchanged before ROP approval');
    assert.notStrictEqual(pendingStatus.overrideKey, proposed, 'pending status must not be written to lifecycle overrides');

    await page.evaluate(async (taskId) => {
      await window.approveTaskByRop(taskId, 'Согласовано по цифрам.');
    }, pendingStatus.decision.taskId);
    const approvedStatus = await page.evaluate(({ articleKey }) => {
      const state = window.__alteaAppState;
      const decision = (state.storage.skuDecisionApprovals || [])
        .find((item) => item.articleKey === articleKey && item.type === 'PRODUCT_STATUS_CHANGE');
      const override = (state.storage.productLifecycleOverrides || [])
        .find((item) => item.articleKey === articleKey);
      const task = (state.storage.tasks || []).find((item) => item.id === decision?.taskId);
      const lifecycle = window.productLifecycleForSku(
        state.skus.find((item) => item.articleKey === articleKey),
        articleKey
      );
      return { decision, override, taskStatus: task?.status || '', lifecycleKey: lifecycle?.key || '' };
    }, { articleKey: target.articleKey });
    assert.strictEqual(approvedStatus.decision?.status, 'applied', JSON.stringify(approvedStatus));
    assert.strictEqual(approvedStatus.override?.key, proposed, JSON.stringify(approvedStatus));
    assert.strictEqual(approvedStatus.lifecycleKey, proposed, JSON.stringify(approvedStatus));
    assert.strictEqual(approvedStatus.taskStatus, 'done', JSON.stringify(approvedStatus));

    await page.evaluate(() => window.setView('repricer'));
    await page.waitForFunction(
      () => window.__alteaAppState?.boot?.lazyReady?.repricer
        && typeof window.buildRepricerRows === 'function'
        && window.buildRepricerRows().length > 0,
      null,
      { timeout: 90000 }
    );
    await page.waitForSelector('[data-repricer-price-sync]', { state: 'attached', timeout: 30000 });
    assert.strictEqual(
      await page.locator('[data-repricer-price-sync]').first().innerText(),
      'Получить актуальные цены',
      'repricer must expose the protected live-price refresh button'
    );
    const priceTarget = await page.evaluate(() => {
      const rows = window.buildRepricerRows();
      for (const row of rows) {
        for (const platform of ['wb', 'ozon']) {
          const side = row?.[platform];
          if (Number(side?.currentPrice) > 0) {
            return {
              articleKey: row.articleKey,
              platform,
              currentPrice: Number(side.currentPrice),
              proposedPrice: Math.round(Number(side.currentPrice) * 1.2)
            };
          }
        }
      }
      return null;
    });
    assert(priceTarget, 'repricer fixture must contain a side with current price');

    const priceRequest = await page.evaluate(async (targetPrice) => {
      const before = (window.__alteaAppState.storage.repricerOverrides || []).map((item) => ({ ...item }));
      const form = document.createElement('form');
      form.setAttribute('data-article-key', targetPrice.articleKey);
      form.setAttribute('data-platform', targetPrice.platform);
      form.innerHTML = `
        <select name="mode"><option value="force" selected>force</option></select>
        <input name="floorPrice" value="">
        <input name="capPrice" value="">
        <input name="forcePrice" value="${targetPrice.proposedPrice}">
        <input type="checkbox" name="promoActive">
        <input name="promoPrice" value="">
        <input name="promoLabel" value="">
        <input name="promoFrom" value="">
        <input name="promoTo" value="">
        <input type="checkbox" name="disableAlignment">
        <textarea name="note">Ручная корректировка выше 10% из-за изменения экономики.</textarea>
      `;
      await window.saveRepricerOverride(form);
      const decision = (window.__alteaAppState.storage.skuDecisionApprovals || [])
        .find((item) => item.articleKey === targetPrice.articleKey
          && item.platform === targetPrice.platform
          && item.type === 'SHARP_PRICE_CHANGE'
          && item.status === 'waiting_rop');
      const after = window.__alteaAppState.storage.repricerOverrides || [];
      return {
        beforeCount: before.length,
        afterCount: after.length,
        decision
      };
    }, priceTarget);
    assert(priceRequest.decision?.taskId, 'sharp price must create a waiting_rop decision task');
    assert.strictEqual(priceRequest.afterCount, priceRequest.beforeCount, 'sharp price must not change overrides before approval');
    assert(Math.abs(Number(priceRequest.decision.payload.deltaPct)) >= 0.10);

    await page.evaluate(async (taskId) => {
      await window.approveTaskByRop(taskId, 'Цена подтверждена РОПом.');
    }, priceRequest.decision.taskId);
    await page.waitForFunction(({ articleKey, platform, proposedPrice }) => {
      const decision = (window.__alteaAppState.storage.skuDecisionApprovals || [])
        .find((item) => item.articleKey === articleKey && item.platform === platform && item.type === 'SHARP_PRICE_CHANGE');
      const override = (window.__alteaAppState.storage.repricerOverrides || [])
        .find((item) => item.articleKey === articleKey && item.platform === platform);
      const task = (window.__alteaAppState.storage.tasks || []).find((item) => item.id === decision?.taskId);
      return decision?.status === 'applied'
        && task?.status === 'done'
        && Number(override?.forcePrice) === proposedPrice
        && override?.approvalStatus === 'approved'
        && override?.sourceStore === 'portal_task_approval'
        && override?.approvedBy;
    }, priceTarget);

    const automaticSharp = await page.evaluate(async () => {
      const articleKey = 'auto_rop_price_selftest';
      const side = {
        articleKey,
        platform: 'wb',
        currentPrice: 1000,
        finalPrice: 1200,
        recommendedPrice: 1200,
        changePct: 0.2,
        changed: true,
        confidence: 'green',
        criticalGate: '',
        currentPriceStale: false,
        sharpPriceApprovalRequired: true,
        sharpPriceApprovalPending: false,
        sharpPriceAutoTaskEligible: true,
        safeToExport: false,
        promoSafeToExport: false,
        reason: 'Свежий автоматический расчёт вышел за порог 10%.'
      };
      const rows = [{ articleKey, article: articleKey, wb: side, ozon: null }];
      const first = await window.syncRepricerAutomaticSharpPriceApprovals(rows);
      const beforeRepeat = (window.__alteaAppState.storage.skuDecisionApprovals || [])
        .filter((item) => item.articleKey === articleKey && item.type === 'SHARP_PRICE_CHANGE');
      const second = await window.syncRepricerAutomaticSharpPriceApprovals(rows);
      const decisions = (window.__alteaAppState.storage.skuDecisionApprovals || [])
        .filter((item) => item.articleKey === articleKey && item.type === 'SHARP_PRICE_CHANGE');
      const decision = decisions[0];
      const task = (window.__alteaAppState.storage.tasks || []).find((item) => item.id === decision?.taskId);
      return {
        first,
        second,
        beforeRepeat: beforeRepeat.length,
        afterRepeat: decisions.length,
        decision,
        task
      };
    });
    assert.strictEqual(automaticSharp.first.created, 1, JSON.stringify(automaticSharp));
    assert.strictEqual(automaticSharp.beforeRepeat, 1, JSON.stringify(automaticSharp));
    assert.strictEqual(automaticSharp.afterRepeat, 1, 'automatic sharp-price tasks must be deduplicated');
    assert.strictEqual(automaticSharp.decision?.status, 'waiting_rop', JSON.stringify(automaticSharp));
    assert.strictEqual(automaticSharp.decision?.payload?.autoGenerated, true, JSON.stringify(automaticSharp));
    assert.strictEqual(automaticSharp.task?.status, 'waiting_rop', JSON.stringify(automaticSharp));
    assert.strictEqual(automaticSharp.task?.source, 'auto', JSON.stringify(automaticSharp));

    await page.evaluate(async (taskId) => {
      await window.approveTaskByRop(taskId, 'Автопредложение подтверждено РОПом.');
    }, automaticSharp.decision.taskId);
    const automaticApplied = await page.evaluate(() => {
      const articleKey = 'auto_rop_price_selftest';
      const decision = (window.__alteaAppState.storage.skuDecisionApprovals || [])
        .find((item) => item.articleKey === articleKey && item.type === 'SHARP_PRICE_CHANGE');
      const override = (window.__alteaAppState.storage.repricerOverrides || [])
        .find((item) => item.articleKey === articleKey && item.platform === 'wb');
      const task = (window.__alteaAppState.storage.tasks || []).find((item) => item.id === decision?.taskId);
      return { decision, override, task };
    });
    assert.strictEqual(automaticApplied.decision?.status, 'applied', JSON.stringify(automaticApplied));
    assert.strictEqual(Number(automaticApplied.override?.forcePrice), 1200, JSON.stringify(automaticApplied));
    assert.strictEqual(automaticApplied.override?.approvalStatus, 'approved', JSON.stringify(automaticApplied));
    assert.strictEqual(automaticApplied.task?.status, 'done', JSON.stringify(automaticApplied));

    const automaticDemand = await page.evaluate(async () => {
      const articleKey = 'auto_demand_price_selftest';
      const side = {
        articleKey,
        platform: 'wb',
        currentPrice: 1000,
        finalPrice: 970,
        recommendedPrice: 970,
        changePct: -0.03,
        changed: true,
        confidence: 'yellow',
        criticalGate: '',
        currentPriceStale: false,
        demandPriceReviewRequired: true,
        demandPriceApprovalPending: false,
        demandPriceAutoTaskEligible: true,
        safeToExport: false,
        promoSafeToExport: false,
        turnoverDays: 120,
        targetTurnoverDays: 30,
        avgDailyUnits: 1,
        sales28Units: 28,
        stock: 120,
        marginPct: 0.3,
        requiredMarginPct: 0.25,
        maximumMarginPct: 0.4,
        demandIntelligence: {
          action: 'decrease',
          current_turnover_days: 120,
          target_turnover_days: 30,
          turnover_ratio: 4,
          avg_daily_units: 1,
          sales_28d_units: 28,
          step_pct: 0.03,
          reasons: ['demand_overstock_price_decrease']
        },
        reason: 'Избыток запаса: 120 дней при цели 30; снижение 3% внутри маржинального коридора.'
      };
      const rows = [{ articleKey, article: articleKey, wb: side, ozon: null }];
      const first = await window.syncRepricerAutomaticSharpPriceApprovals(rows);
      const second = await window.syncRepricerAutomaticSharpPriceApprovals(rows);
      const decisions = (window.__alteaAppState.storage.skuDecisionApprovals || [])
        .filter((item) => item.articleKey === articleKey && item.type === 'DEMAND_PRICE_REVIEW');
      const decision = decisions[0];
      const task = (window.__alteaAppState.storage.tasks || []).find((item) => item.id === decision?.taskId);
      return { first, second, decisions, decision, task };
    });
    assert.strictEqual(automaticDemand.first.created, 1, JSON.stringify(automaticDemand));
    assert.strictEqual(automaticDemand.decisions.length, 1, 'automatic demand-price tasks must be deduplicated');
    assert.strictEqual(automaticDemand.decision?.status, 'waiting_rop', JSON.stringify(automaticDemand));
    assert.strictEqual(automaticDemand.decision?.payload?.autoGenerated, true, JSON.stringify(automaticDemand));
    assert.strictEqual(automaticDemand.decision?.payload?.demandIntelligence?.turnover_ratio, 4, JSON.stringify(automaticDemand));
    assert.strictEqual(automaticDemand.task?.status, 'waiting_rop', JSON.stringify(automaticDemand));
    assert(String(automaticDemand.task?.title || '').includes('умную цену'), JSON.stringify(automaticDemand));

    await page.evaluate(async (taskId) => {
      await window.approveTaskByRop(taskId, 'Умная цена подтверждена по оборачиваемости.');
    }, automaticDemand.decision.taskId);
    const demandApplied = await page.evaluate(() => {
      const articleKey = 'auto_demand_price_selftest';
      const decision = (window.__alteaAppState.storage.skuDecisionApprovals || [])
        .find((item) => item.articleKey === articleKey && item.type === 'DEMAND_PRICE_REVIEW');
      const override = (window.__alteaAppState.storage.repricerOverrides || [])
        .find((item) => item.articleKey === articleKey && item.platform === 'wb');
      const task = (window.__alteaAppState.storage.tasks || []).find((item) => item.id === decision?.taskId);
      return { decision, override, task };
    });
    assert.strictEqual(demandApplied.decision?.status, 'applied', JSON.stringify(demandApplied));
    assert.strictEqual(Number(demandApplied.override?.forcePrice), 970, JSON.stringify(demandApplied));
    assert.strictEqual(demandApplied.override?.approvalStatus, 'approved', JSON.stringify(demandApplied));
    assert(
      Date.parse(demandApplied.override?.expiresAt || '') > Date.now() + 71 * 60 * 60 * 1000,
      `demand approval must expire after the cooldown window: ${JSON.stringify(demandApplied)}`
    );
    assert.strictEqual(demandApplied.task?.status, 'done', JSON.stringify(demandApplied));

    const marginPolicyRequest = await page.evaluate(async () => {
      const payload = {
        type: 'MARGIN_POLICY_CHANGE',
        articleKey: 'margin_policy_selftest',
        platform: 'wb',
        currentValue: 'маржа —; MIN —; MAX —',
        proposedValue: 'маржа 25–40%; MIN 900 ₽; MAX 1 300 ₽',
        reason: 'Команда согласовала пороги по полной экономике ИУ.',
        payload: {
          lifecycleKey: 'active',
          minMarginPct: 0.25,
          maxMarginPct: 0.4,
          minPrice: 900,
          maxPrice: 1300
        },
        metrics: {
          currentSellerPrice: 850,
          proposedSellerPrice: 900,
          currentClientPrice: 800,
          proposedClientPrice: 847,
          currentMarginPct: 0.2,
          proposedMarginPct: 0.25,
          costRub: 300,
          commissionPct: 0.3203,
          internalAdvertisingPct: 0.0877,
          platformCostsRub: 90
        }
      };
      const beforeProfile = (window.__alteaAppState.storage.repricerSkuProfiles || [])
        .find((item) => item.articleKey === payload.articleKey);
      const beforeCorridor = (window.__alteaAppState.storage.repricerCorridors || [])
        .find((item) => item.articleKey === payload.articleKey && item.platform === payload.platform);
      const first = await window.requestSkuDecisionApproval(payload);
      const duplicate = await window.requestSkuDecisionApproval(payload);
      return { beforeProfile, beforeCorridor, first, duplicate };
    });
    assert.strictEqual(marginPolicyRequest.beforeProfile, undefined);
    assert.strictEqual(marginPolicyRequest.beforeCorridor, undefined);
    assert.strictEqual(marginPolicyRequest.first?.status, 'waiting_rop', JSON.stringify(marginPolicyRequest));
    assert.strictEqual(marginPolicyRequest.first?.taskId, marginPolicyRequest.duplicate?.taskId, 'same margin policy must be deduplicated');
    assert.strictEqual(marginPolicyRequest.duplicate?.duplicate, true, JSON.stringify(marginPolicyRequest));

    await page.evaluate(async (taskId) => {
      await window.approveTaskByRop(taskId, 'Пороги и экономика проверены.');
    }, marginPolicyRequest.first.taskId);
    const marginPolicyApplied = await page.evaluate(() => {
      const articleKey = 'margin_policy_selftest';
      const state = window.__alteaAppState;
      const decision = (state.storage.skuDecisionApprovals || [])
        .find((item) => item.articleKey === articleKey && item.type === 'MARGIN_POLICY_CHANGE');
      const profile = (state.storage.repricerSkuProfiles || [])
        .find((item) => item.articleKey === articleKey);
      const corridor = (state.storage.repricerCorridors || [])
        .find((item) => item.articleKey === articleKey && item.platform === 'wb');
      const tasks = (state.storage.repricerPendingApiTasks || [])
        .filter((item) => item.articleKey === articleKey);
      const task = (state.storage.tasks || []).find((item) => item.id === decision?.taskId);
      return { decision, profile, corridor, tasks, task };
    });
    assert.strictEqual(marginPolicyApplied.decision?.status, 'applied', JSON.stringify(marginPolicyApplied));
    assert.strictEqual(Number(marginPolicyApplied.profile?.minMarginPct), 0.25, JSON.stringify(marginPolicyApplied));
    assert.strictEqual(Number(marginPolicyApplied.profile?.maxMarginPct), 0.4, JSON.stringify(marginPolicyApplied));
    assert.strictEqual(Number(marginPolicyApplied.corridor?.hardFloor), 900, JSON.stringify(marginPolicyApplied));
    assert.strictEqual(Number(marginPolicyApplied.corridor?.stretchCap), 1300, JSON.stringify(marginPolicyApplied));
    assert.strictEqual(marginPolicyApplied.corridor?.approvalStatus, 'approved', JSON.stringify(marginPolicyApplied));
    assert.strictEqual(marginPolicyApplied.corridor?.sourceStore, 'portal_task_approval', JSON.stringify(marginPolicyApplied));
    assert.strictEqual(marginPolicyApplied.task?.status, 'done', JSON.stringify(marginPolicyApplied));

    const liquidationPolicy = await page.evaluate(async () => {
      const decision = await window.requestSkuDecisionApproval({
        type: 'MARGIN_POLICY_CHANGE',
        articleKey: 'liquidation_policy_selftest',
        platform: 'ozon',
        currentValue: 'вывод без отдельного порога',
        proposedValue: 'вывод ≥ 0%; MIN 500 ₽; MAX 800 ₽',
        reason: 'Не продавать товар на вывод в отрицательную маржу.',
        payload: {
          lifecycleKey: 'exit',
          liquidationMinMarginPct: 0,
          minPrice: 500,
          maxPrice: 800
        }
      });
      return decision;
    });
    await page.evaluate(async (taskId) => {
      await window.approveTaskByRop(taskId, 'Безубыточность подтверждена.');
    }, liquidationPolicy.taskId);
    const liquidationApplied = await page.evaluate(() => {
      const articleKey = 'liquidation_policy_selftest';
      const storage = window.__alteaAppState.storage;
      const profile = (storage.repricerSkuProfiles || []).find((item) => item.articleKey === articleKey);
      const apiTask = (storage.repricerPendingApiTasks || []).find((item) => (
        item.articleKey === articleKey
        && item.platform === 'ozon'
        && item.field === 'liquidation_margin_pct'
      ));
      return { profile, apiTask };
    });
    assert.strictEqual(Number(liquidationApplied.profile?.liquidationMinMarginPct), 0, JSON.stringify(liquidationApplied));
    assert.strictEqual(Number(liquidationApplied.apiTask?.liquidationMinMarginPct), 0, JSON.stringify(liquidationApplied));

    const concurrentDuplicate = await page.evaluate(async () => {
      const payload = {
        type: 'SHARP_PRICE_CHANGE',
        articleKey: 'concurrent_rop_price_selftest',
        platform: 'ozon',
        currentValue: 1000,
        proposedValue: 1200,
        reason: 'Параллельный запрос не должен создавать две задачи.',
        payload: {
          currentPrice: 1000,
          requestedPrice: 1200,
          deltaPct: 0.2,
          autoGenerated: false,
          override: {
            articleKey: 'concurrent_rop_price_selftest',
            platform: 'ozon',
            mode: 'force',
            forcePrice: 1200
          }
        }
      };
      const [first, second] = await Promise.all([
        window.requestSkuDecisionApproval(payload),
        window.requestSkuDecisionApproval(payload)
      ]);
      const decisions = (window.__alteaAppState.storage.skuDecisionApprovals || [])
        .filter((item) => item.articleKey === payload.articleKey && item.type === payload.type);
      const tasks = (window.__alteaAppState.storage.tasks || [])
        .filter((item) => decisions.some((decision) => decision.taskId === item.id));
      return { first, second, decisions, tasks };
    });
    assert.strictEqual(concurrentDuplicate.decisions.length, 1, JSON.stringify(concurrentDuplicate));
    assert.strictEqual(concurrentDuplicate.tasks.length, 1, JSON.stringify(concurrentDuplicate));
    assert.strictEqual(concurrentDuplicate.first?.taskId, concurrentDuplicate.second?.taskId, JSON.stringify(concurrentDuplicate));
    assert.strictEqual(concurrentDuplicate.decisions[0]?.status, 'waiting_rop', JSON.stringify(concurrentDuplicate));

    const unexpectedErrors = errors.filter((message) => !(
      /Failed to load resource/i.test(message)
      || /Репрайсер controls превысил 8 сек/i.test(message)
      || /supabase query .* превысил 8 сек/i.test(message)
      || /portal_(?:tasks|comments).*row-level security/i.test(message)
      || /\[task-workflow-resilient\].*persist/i.test(message)
    ));
    assert.strictEqual(unexpectedErrors.length, 0, `browser errors: ${unexpectedErrors.join(' | ')}`);
    console.log('[sku-rop-approval-workflow-selftest] OK: status, price and margin-policy tasks, concurrent deduplication and ROP-only application');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
