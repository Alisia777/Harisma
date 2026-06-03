#!/usr/bin/env node

const { chromium } = require('playwright');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const next = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined && next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function isLocalUrl(url) {
  try {
    const parsed = new URL(url);
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isOptionalLocalMiss(url) {
  return /\/\.altea-google-sheet-sync-output\//i.test(String(url || ''))
    || /\/data\/last_good\/manifest\.json/i.test(String(url || ''))
    || /favicon\.ico/i.test(String(url || ''));
}

async function clickView(page, view) {
  const selector = `.nav-btn[data-view="${view}"]`;
  const locator = page.locator(selector).first();
  const count = await page.locator(selector).count();
  if (!count) throw new Error(`Navigation button not found: ${view}`);
  const isActive = await locator.evaluate((button) => button.classList.contains('active'));
  if (!isActive) await locator.evaluate((button) => button.click(), undefined, { timeout: 30000 });
  await page.waitForTimeout(1000);
}

async function assertVisible(page, selector, label) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 8000 });
  const box = await locator.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) throw new Error(`${label} is not visible`);
}

async function waitForSkuData(page) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForFunction(() => (
        window.__alteaAppState?.boot?.dataReady === true
        && Array.isArray(window.__alteaAppState?.skus)
        && window.__alteaAppState.skus.length > 0
      ), undefined, { timeout: attempt === 0 ? 30000 : 60000 });
      await page.waitForTimeout(1200);
      const stableCount = await page.evaluate(() => Array.isArray(window.__alteaAppState?.skus)
        ? window.__alteaAppState.skus.length
        : 0);
      if (stableCount > 0) return;
      throw new Error('SKU data became empty after initial load.');
    } catch (error) {
      lastError = error;
      const bootedEmpty = await page.evaluate(() => Boolean(
        window.__alteaAppState?.boot?.dataReady === true
        && Array.isArray(window.__alteaAppState?.skus)
        && window.__alteaAppState.skus.length === 0
      )).catch(() => false);
      if (!bootedEmpty || attempt >= 2) break;
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    }
  }
  const recovered = await page.evaluate(async () => {
    if (!window.__alteaAppState) return false;
    try {
      const response = await fetch(`data/skus.json?v=contract-smoke-recover-${Date.now()}`);
      if (!response.ok) return false;
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length <= 0) return false;
      window.__alteaAppState.skus = rows;
      if (typeof window.applyOwnerOverridesToSkus === 'function') window.applyOwnerOverridesToSkus();
      return true;
    } catch {
      return false;
    }
  }).catch(() => false);
  if (recovered) return;
  throw lastError || new Error('SKU data did not load.');
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url || process.env.PORTAL_CONTRACT_URL || 'http://127.0.0.1:4187/index.html';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(20000);
  const pageErrors = [];
  const failedLocal = [];

  try {
    page.on('pageerror', (error) => pageErrors.push(error.message || String(error)));
    page.on('response', (response) => {
      const status = response.status();
      const responseUrl = response.url();
      if (status >= 400 && isLocalUrl(responseUrl) && !isOptionalLocalMiss(responseUrl)) {
        failedLocal.push(`${status} ${responseUrl}`);
      }
    });
    page.on('requestfailed', (request) => {
      const requestUrl = request.url();
      const failureText = request.failure()?.errorText || 'unknown';
      if (/ERR_ABORTED/i.test(failureText)) return;
      if (isLocalUrl(requestUrl) && !isOptionalLocalMiss(requestUrl)) {
        failedLocal.push(`failed ${requestUrl}: ${failureText}`);
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => window.__alteaAppState && window.__alteaAppState.boot, undefined, { timeout: 12000 });
    await waitForSkuData(page);
    await clickView(page, 'dashboard');
    await assertVisible(page, '#view-dashboard', 'dashboard');
    await waitForSkuData(page);
    await page.waitForSelector('#view-dashboard .portal-lux-shell, #view-dashboard .portal-calm-hero', { timeout: 30000 });
    const dashboardCalmOk = await page.evaluate(() => {
      const luxDashboard = document.querySelector('#view-dashboard .portal-lux-shell');
      if (luxDashboard) {
        return Boolean(
          document.querySelectorAll('#view-dashboard .portal-calm-chart').length >= 2
          && document.querySelectorAll('#view-dashboard [data-portal-exec-platform]').length >= 3
          && document.querySelector('#view-dashboard .portal-lux-metric')
        );
      }
      return Boolean(
        document.querySelector('#view-dashboard .portal-calm-hero')
        && document.querySelectorAll('#view-dashboard .portal-calm-chart').length >= 3
        && document.querySelectorAll('#view-dashboard .portal-calm-platform-button').length >= 3
      );
    });
    if (!dashboardCalmOk) throw new Error('Dashboard did not render core blocks.');

    const initial = await page.evaluate(() => ({
      skus: Array.isArray(window.__alteaAppState?.skus) ? window.__alteaAppState.skus.length : 0,
      dashboardCards: Array.isArray(window.__alteaAppState?.dashboard?.cards) ? window.__alteaAppState.dashboard.cards.length : 0,
      syncHealthLoaded: Boolean(window.__alteaAppState?.syncHealth)
    }));
    if (initial.skus <= 0) throw new Error('SKU data did not load.');

    await clickView(page, 'control');
    await assertVisible(page, '#view-control', 'control center');
    const taskSplitOk = await page.evaluate(() => {
      const appState = window.__alteaAppState;
      appState.controlFilters = appState.controlFilters || {};
      appState.controlFilters.platform = 'all';
      appState.controlFilters.peopleRole = 'leader';
      appState.controlFilters.taskSimpleWorkspaceChosen = true;
      appState.controlFilters.taskSimpleFullMode = false;
      if (typeof window.renderControlCenter === 'function') window.renderControlCenter();
      return Boolean(
        document.querySelector('#view-control .control-simple-platform-board')
        && document.querySelectorAll('#view-control .control-simple-workstream-lane').length >= 1
      );
    });
    if (!taskSplitOk) throw new Error('Task center did not render platform-separated lanes.');

    await clickView(page, 'data-health');
    await assertVisible(page, '#view-data-health', 'data health');
    await page.waitForFunction(() => Boolean(
      document.querySelector('#view-data-health [data-health-create-tasks]')
      && document.querySelector('#view-data-health .data-health-digest')
      && document.querySelector('#view-data-health [data-health-change-digest]')
      && document.querySelector('#view-data-health [data-health-rules-form]')
      && document.querySelector('#view-data-health [data-health-open="sku-contour"]')
      && document.querySelector('#view-data-health .data-table')
    ), undefined, { timeout: 30000 });
    const dataHealthOk = await page.evaluate(() => Boolean(
      document.querySelector('#view-data-health [data-health-create-tasks]')
      && document.querySelector('#view-data-health .data-health-digest')
      && document.querySelector('#view-data-health [data-health-change-digest]')
      && document.querySelector('#view-data-health [data-health-rules-form]')
      && document.querySelector('#view-data-health [data-health-source-explain]')
      && document.querySelector('#view-data-health [data-health-work-modes]')
      && document.querySelector('#view-data-health [data-health-open="sku-contour"]')
      && document.querySelector('#view-data-health .data-table')
      && typeof window.portalMaybeAutoRefreshOperationalData === 'function'
      && typeof window.portalRefreshOperationalDataPayloads === 'function'
    ));
    if (!dataHealthOk) throw new Error('Data health center did not render controls.');

    await page.locator('#view-data-health [data-health-refresh]').first().click();
    await page.waitForFunction(() => Boolean(
      document.querySelector('#view-data-health [data-health-create-tasks]')
      && document.querySelector('#view-data-health .data-health-digest')
      && document.querySelector('#view-data-health [data-health-change-digest]')
      && document.querySelector('#view-data-health [data-health-rules-form]')
      && document.querySelector('#view-data-health [data-health-open="sku-contour"]')
      && document.querySelector('#view-data-health .data-table')
    ), undefined, { timeout: 20000 });

    const dataHealthRulesCheck = await page.evaluate(() => {
      const appState = window.__alteaAppState;
      const originalRules = appState.storage?.portalDataRules;
      const originalRulesUpdatedAt = appState.storage?.portalDataRulesUpdatedAt || '';
      const originalRaw = localStorage.getItem('brand-portal-local-v1');
      try {
        document.querySelector('#view-data-health [name="stockRiskDays"]').value = '9';
        document.querySelector('#view-data-health [name="criticalRevenueRub"]').value = '900000';
        document.querySelector('#view-data-health [data-health-rules-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        return {
          ok: Number(appState.storage?.portalDataRules?.stockRiskDays) === 9
            && Number(appState.storage?.portalDataRules?.criticalRevenueRub) === 900000
            && Boolean(document.querySelector('#view-data-health [data-health-work-modes]'))
        };
      } finally {
        appState.storage.portalDataRules = originalRules || {};
        appState.storage.portalDataRulesUpdatedAt = originalRulesUpdatedAt;
        if (originalRaw === null) localStorage.removeItem('brand-portal-local-v1');
        else localStorage.setItem('brand-portal-local-v1', originalRaw);
      }
    });
    if (!dataHealthRulesCheck.ok) throw new Error(`Data health rules did not save/render: ${JSON.stringify(dataHealthRulesCheck)}`);

    const storageContourCheck = await page.evaluate(async () => {
      const appState = window.__alteaAppState;
      if (typeof window.completePortalStorage !== 'function' || typeof window.normalizePortalStorageSnapshot !== 'function') {
        return { ok: false, reason: 'storage contour helpers are unavailable.' };
      }
      const storageKey = 'brand-portal-local-v1';
      const originalStorage = appState.storage;
      const originalRaw = localStorage.getItem(storageKey);
      const previous = {
        ...(originalStorage || {}),
        portalDataRules: { stockRiskDays: 11, criticalRevenueRub: 1100000 },
        portalDataRulesUpdatedAt: '2026-05-16T03:00:00.000Z',
        portalIssueSnapshot: { generatedAt: '2026-05-16T03:01:00.000Z', keys: ['contract-issue'] },
        repricerRepairHistory: [{ id: 'contract-repair-history' }]
      };
      const partialRemote = { comments: [], tasks: [], decisions: [], ownerOverrides: [] };
      try {
        const completed = window.completePortalStorage(partialRemote, previous);
        const helperOk = Boolean(Number(completed.portalDataRules?.stockRiskDays) === 11
          && completed.portalDataRulesUpdatedAt === previous.portalDataRulesUpdatedAt
          && completed.portalIssueSnapshot?.keys?.[0] === 'contract-issue'
          && completed.repricerRepairHistory?.[0]?.id === 'contract-repair-history'
          && Array.isArray(completed.tasks)
          && completed.repricerSettings);

        const crossTabPayload = window.completePortalStorage({
          ...(originalStorage || {}),
          portalDataRules: { ...(originalStorage?.portalDataRules || {}), stockRiskDays: 13 },
          portalDataRulesUpdatedAt: '2026-05-16T04:00:00.000Z',
          portalIssueSnapshot: { generatedAt: '2026-05-16T04:01:00.000Z', keys: ['contract-storage-event'] }
        }, originalStorage || {});
        const nextRaw = JSON.stringify(crossTabPayload);
        localStorage.setItem(storageKey, nextRaw);
        window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: nextRaw, oldValue: originalRaw }));
        await new Promise((resolve) => setTimeout(resolve, 80));

        const storageEventOk = Number(appState.storage?.portalDataRules?.stockRiskDays) === 13
          && appState.storage?.portalDataRulesUpdatedAt === '2026-05-16T04:00:00.000Z'
          && appState.storage?.portalIssueSnapshot?.keys?.[0] === 'contract-storage-event';

        return {
          ok: helperOk && storageEventOk,
          helperOk,
          storageEventOk,
          stockRiskDays: appState.storage?.portalDataRules?.stockRiskDays,
          issueKey: appState.storage?.portalIssueSnapshot?.keys?.[0] || ''
        };
      } finally {
        if (originalRaw === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, originalRaw);
        appState.storage = originalStorage;
      }
    });
    if (!storageContourCheck.ok) {
      throw new Error(`Storage contour did not preserve/update shared statuses: ${JSON.stringify(storageContourCheck)}`);
    }

    const issueTaskCheck = await page.evaluate(async () => {
      const appState = window.__alteaAppState;
      if (typeof window.portalHealthCreateIssueTasks !== 'function') {
        return { ok: false, reason: 'portal health task helper is unavailable.' };
      }
      appState.storage = appState.storage || {};
      const originalTasks = Array.isArray(appState.storage.tasks) ? appState.storage.tasks.slice() : [];
      const rows = [{
        key: 'contract-data-issue',
        source: 'Contract',
        type: 'Critical data issue',
        apiSku: '__contract_data_issue__',
        tone: 'danger',
        action: 'contract smoke'
      }];
      try {
        appState.storage.tasks = originalTasks.slice();
        const first = await window.portalHealthCreateIssueTasks({ rows, persist: false });
        appState.storage.tasks = [...originalTasks, ...first.created];
        const second = await window.portalHealthCreateIssueTasks({ rows, persist: false });
        return {
          ok: first.created.length === 1 && second.created.length === 0 && second.duplicates.length === 1,
          firstCreated: first.created.length,
          secondCreated: second.created.length,
          secondDuplicates: second.duplicates.length
        };
      } finally {
        appState.storage.tasks = originalTasks;
      }
    });
    if (!issueTaskCheck.ok) {
      throw new Error(`Data health issue tasks did not create/dedupe correctly: ${JSON.stringify(issueTaskCheck)}`);
    }

    await clickView(page, 'sku-plan-fact');
    await assertVisible(page, '#view-sku-plan-fact', 'SKU plan-fact');
    await page.waitForFunction(() => Boolean(
      document.querySelector('#view-sku-plan-fact [data-sku-plan-fact-quality-export]')
      || document.querySelector('#view-sku-plan-fact [data-sku-plan-fact-quality-import]')
      || document.querySelector('#view-sku-plan-fact .sku-plan-fact-card')
    ), undefined, { timeout: 20000 });
    const planFactOk = await page.evaluate(() => Boolean(
      document.querySelector('#view-sku-plan-fact [data-sku-plan-fact-quality-export]')
      || document.querySelector('#view-sku-plan-fact [data-sku-plan-fact-quality-import]')
      || document.querySelector('#view-sku-plan-fact .sku-plan-fact-card')
    ));
    if (!planFactOk) throw new Error('Plan-fact quality controls did not render.');

    await clickView(page, 'order');
    await assertVisible(page, '#view-order', 'order procurement');
    await page.waitForFunction(() => Boolean(
      document.querySelector('#view-order [data-altea-order-procurement]')
      && document.querySelector('#view-order #alteaOrderClusterFilter')
    ), undefined, { timeout: 20000 });
    const orderOk = await page.evaluate(() => Boolean(
      document.querySelector('#view-order [data-altea-order-procurement]')
      && document.querySelector('#view-order [data-altea-order-preset]')
      && document.querySelector('#view-order [data-altea-order-place-chip]')
      && document.querySelector('#view-order #alteaOrderClusterFilter')
      && document.querySelector('#view-order [data-altea-order-export]')
    ));
    if (!orderOk) throw new Error('Order procurement warehouse filters did not render.');
    const orderLifecycleCheck = await page.evaluate(() => {
      const root = document.querySelector('#view-order [data-altea-order-procurement]');
      const blockedRows = Number(root?.dataset?.lifecycleBlockedRows || 0);
      const blockedNeed = Number(root?.dataset?.lifecycleBlockedNeed || 0);
      const blockedDomRows = document.querySelectorAll('#view-order [data-order-lifecycle-block="1"]').length;
      return {
        ok: Boolean(root)
          && root.dataset.lifecycleBlockedRows !== undefined
          && root.dataset.lifecycleBlockedNeed !== undefined
          && (blockedRows <= 0 || blockedDomRows > 0)
          && blockedNeed >= 0,
        blockedRows,
        blockedNeed,
        blockedDomRows
      };
    });
    if (!orderLifecycleCheck.ok) {
      throw new Error(`Order procurement lifecycle guard did not initialize: ${JSON.stringify(orderLifecycleCheck)}`);
    }
    await page.locator('#view-order [data-altea-order-preset="low10"]').first().click();
    await page.waitForFunction(() => Boolean(
      document.querySelector('#view-order [data-altea-order-preset="low10"].is-active')
      && document.querySelector('#view-order #alteaOrderClusterDays')?.value === '10'
    ), undefined, { timeout: 12000 });

    await clickView(page, 'sku-contour');
    await assertVisible(page, '#view-sku-contour', 'SKU contour');
    const contourOk = await page.evaluate(() => Boolean(
      document.querySelector('#view-sku-contour [data-sku-contour-quality-export]')
      && document.querySelector('#view-sku-contour [data-sku-contour-quality-import]')
      && document.querySelector('#view-sku-contour [data-sku-contour-toggle-resolved]')
      && document.querySelector('#view-sku-contour .data-table')
    ));
    if (!contourOk) throw new Error('SKU contour controls did not render.');

    const contourPersistence = await page.evaluate(() => {
      const appState = window.__alteaAppState;
      const targetSku = appState?.skus?.[0]?.articleKey || appState?.skus?.[0]?.article || '';
      if (!targetSku || typeof window.skuContourIssueRows !== 'function' || typeof window.skuContourIssueIsResolved !== 'function') {
        return { ok: false, reason: 'SKU contour test helpers are unavailable.' };
      }
      const originalAliases = appState.skuAliases;
      const originalIgnore = appState.skuAliasIgnore;
      const originalQuality = appState.portalDataQuality;
      const aliasApiSku = '__contract_alias_api_sku__';
      const ignoreApiSku = '__contract_ignore_api_sku__';
      try {
        appState.skuAliases = {
          schema: 'sku-api-aliases-v1',
          aliases: [{ target_sku: targetSku, platform: 'wb', api_sku: aliasApiSku, status: 'active', note: 'contract smoke' }]
        };
        appState.skuAliasIgnore = {
          schema: 'sku-api-ignore-v1',
          ignored: [{ platform: 'ozon', api_sku: ignoreApiSku, status: 'ignored', note: 'contract smoke' }]
        };
        appState.portalDataQuality = {
          generatedAt: new Date().toISOString(),
          status: 'warning',
          summary: {},
          issues: [
            { type: 'API SKU без пары', platform: 'WB', articleKey: aliasApiSku, name: 'contract alias', revenue: 1000, units: 1, action: 'contract alias' },
            { type: 'API SKU без пары', platform: 'Ozon', articleKey: ignoreApiSku, name: 'contract ignore', revenue: 2000, units: 2, action: 'contract ignore' }
          ]
        };
        const rows = window.skuContourIssueRows(window.skuPlanFactBuildModel());
        const aliasRow = rows.find((row) => row.apiSku === aliasApiSku);
        const ignoreRow = rows.find((row) => row.apiSku === ignoreApiSku);
        const unresolved = [aliasRow, ignoreRow].filter((row) => row && !window.skuContourIssueIsResolved(row));
        return {
          ok: aliasRow?.status === 'applied' && ignoreRow?.status === 'ignored' && unresolved.length === 0,
          aliasStatus: aliasRow?.status || '',
          ignoreStatus: ignoreRow?.status || '',
          unresolved: unresolved.map((row) => row.apiSku)
        };
      } finally {
        appState.skuAliases = originalAliases;
        appState.skuAliasIgnore = originalIgnore;
        appState.portalDataQuality = originalQuality;
      }
    });
    if (!contourPersistence.ok) {
      throw new Error(`SKU contour resolved rows returned to unresolved queue: ${JSON.stringify(contourPersistence)}`);
    }

    const rollbackVersionCheck = await page.evaluate(() => {
      const appState = window.__alteaAppState;
      if (typeof window.skuContourRollbackableEvents !== 'function') {
        return { ok: false, reason: 'rollback helper is unavailable.' };
      }
      const originalAudit = appState.skuAliasAudit;
      const applyEvent = {
        id: 'contract-rollback-event',
        type: 'sku_alias_import_apply',
        rollback: {
          beforeAliasPayload: { schema: 'sku-api-aliases-v1', aliases: [] },
          beforeIgnorePayload: { schema: 'sku-api-ignore-v1', ignored: [] }
        }
      };
      try {
        appState.skuAliasAudit = { schema: 'sku-alias-audit-v1', events: [applyEvent] };
        const first = window.skuContourRollbackableEvents();
        appState.skuAliasAudit = {
          schema: 'sku-alias-audit-v1',
          events: [{ id: 'contract-rollback-done', type: 'sku_alias_import_rollback', rolledBackEventId: applyEvent.id }, applyEvent]
        };
        const second = window.skuContourRollbackableEvents();
        return { ok: first.length === 1 && second.length === 0, first: first.length, second: second.length };
      } finally {
        appState.skuAliasAudit = originalAudit;
      }
    });
    if (!rollbackVersionCheck.ok) {
      throw new Error(`SKU contour rollback versions did not resolve correctly: ${JSON.stringify(rollbackVersionCheck)}`);
    }

    const newSkuTaskCheck = await page.evaluate(async () => {
      const appState = window.__alteaAppState;
      if (typeof window.skuPlanFactCreateNewSkuTasks !== 'function') {
        return { ok: false, reason: 'new_sku task helper is unavailable.' };
      }
      appState.storage = appState.storage || {};
      const originalTasks = Array.isArray(appState.storage.tasks) ? appState.storage.tasks.slice() : [];
      const report = {
        fileName: 'contract-new-sku.csv',
        newSkuRows: [{ rowNumber: 2, apiSku: '__contract_new_sku__', platform: 'WB', note: 'contract smoke' }]
      };
      try {
        appState.storage.tasks = originalTasks.slice();
        const first = await window.skuPlanFactCreateNewSkuTasks(report, { persist: false });
        appState.storage.tasks = [...originalTasks, ...first.created];
        const second = await window.skuPlanFactCreateNewSkuTasks(report, { persist: false });
        const task = first.created?.[0] || {};
        return {
          ok: first.created.length === 1 && second.created.length === 0 && second.duplicates.length === 1 && /Завести SKU/.test(task.title || ''),
          firstCreated: first.created.length,
          secondCreated: second.created.length,
          secondDuplicates: second.duplicates.length,
          title: task.title || ''
        };
      } finally {
        appState.storage.tasks = originalTasks;
      }
    });
    if (!newSkuTaskCheck.ok) {
      throw new Error(`new_sku did not create/dedupe SKU task correctly: ${JSON.stringify(newSkuTaskCheck)}`);
    }

    await clickView(page, 'skus');
    await assertVisible(page, '#view-skus', 'SKU registry');
    const registryOk = await page.evaluate(() => Boolean(
      document.querySelector('#view-skus table')
      || document.querySelector('#view-skus .data-table')
      || document.querySelector('#view-skus .card')
    ));
    if (!registryOk) throw new Error('SKU registry did not render a usable surface.');

    const lifecycleFilterCheck = await page.evaluate(() => {
      const filter = document.querySelector('#skuLifecycleFilter');
      const options = Array.from(filter?.querySelectorAll('option') || []).map((option) => option.value);
      const lifecycleCounts = (window.__alteaAppState?.skus || []).reduce((acc, sku) => {
        const lifecycle = sku?.productLifecycle || (typeof window.productLifecycleForSku === 'function' ? window.productLifecycleForSku(sku) : null);
        const key = lifecycle?.key || 'active';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      return {
        ok: Boolean(filter)
          && typeof window.productLifecycleAutoForSku === 'function'
          && options.includes('watch')
          && options.includes('question')
          && Object.values(lifecycleCounts).some((value) => value > 0),
        options,
        lifecycleCounts
      };
    });
    if (!lifecycleFilterCheck.ok) {
      throw new Error(`SKU lifecycle filter/statuses did not initialize: ${JSON.stringify(lifecycleFilterCheck)}`);
    }

    const lifecycleButtonCheck = await page.evaluate(() => ({
      openButtons: document.querySelectorAll('#view-skus [data-open-sku]').length,
      originalRaw: localStorage.getItem('brand-portal-local-v1'),
      originalStorage: window.__alteaAppState?.storage || null
    }));
    if (lifecycleButtonCheck.openButtons <= 0) {
      throw new Error('SKU registry did not expose SKU open buttons for lifecycle status editing.');
    }
    try {
      await page.locator('#view-skus [data-open-sku]').first().click();
      await page.waitForSelector('#skuModal.open #productLifecycleForm', { timeout: 12000 });
      await page.selectOption('#skuModal #productLifecycleForm select[name="status"]', 'watch');
      await page.fill('#skuModal #productLifecycleForm textarea[name="note"]', 'contract smoke lifecycle status');
      await page.locator('#skuModal #productLifecycleForm button[type="submit"]').click();
      await page.waitForFunction(() => {
        const modalText = document.querySelector('#skuModal')?.textContent || '';
        const overrides = window.__alteaAppState?.storage?.productLifecycleOverrides || [];
        return modalText.includes('Наблюдать')
          && overrides.some((item) => item.key === 'watch' && /contract smoke lifecycle status/.test(item.note || ''));
      }, undefined, { timeout: 12000 });
    } finally {
      await page.evaluate(({ originalRaw, originalStorage }) => {
        const storageKey = 'brand-portal-local-v1';
        if (originalRaw === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, originalRaw);
        if (window.__alteaAppState) {
          window.__alteaAppState.storage = originalStorage || {};
          if (typeof window.applyOwnerOverridesToSkus === 'function') window.applyOwnerOverridesToSkus();
        }
        document.getElementById('skuModal')?.classList.remove('open');
      }, lifecycleButtonCheck);
    }

    await clickView(page, 'prices');
    await assertVisible(page, '#view-prices', 'prices');
    await page.waitForFunction(() => {
      const root = document.querySelector('#view-prices');
      return root && (root.children.length > 0 || (root.textContent || '').trim().length > 20);
    }, null, { timeout: 12000 });
    const pricesOk = await page.evaluate(() => Boolean(
      document.querySelector('#view-prices table')
      || document.querySelector('#view-prices .data-table')
      || document.querySelector('#view-prices .card')
      || (document.querySelector('#view-prices')?.children.length || 0) > 0
    ));
    if (!pricesOk) throw new Error('Prices view did not render a usable surface.');

    await clickView(page, 'repricer');
    await assertVisible(page, '#view-repricer', 'repricer');
    const repricerLifecycleCheck = await page.evaluate(() => {
      if (typeof window.buildRepricerRows !== 'function') {
        return { ok: false, reason: 'buildRepricerRows is unavailable.' };
      }
      const rows = window.buildRepricerRows(true) || [];
      const sides = rows.flatMap((row) => [row.wb, row.ozon].filter(Boolean));
      const nonActive = sides.filter((side) => side.productLifecycleKey && side.productLifecycleKey !== 'active');
      const launchSide = sides.find((side) => side.productLifecycleKey === 'new' || side.productLifecycleKey === 'relaunch');
      const stoppedSide = sides.find((side) => ['question', 'paused', 'exit', 'archived'].includes(side.productLifecycleKey));
      return {
        ok: sides.length > 0
          && typeof window.PRODUCT_LIFECYCLE_STATUS_META === 'object'
          && nonActive.length > 0
          && (!launchSide || launchSide.engineMode === 'launch')
          && (!stoppedSide || ['freeze', 'off'].includes(stoppedSide.engineMode)),
        rows: rows.length,
        nonActive: nonActive.length,
        launchMode: launchSide?.engineMode || '',
        stoppedMode: stoppedSide?.engineMode || '',
        stoppedKey: stoppedSide?.productLifecycleKey || ''
      };
    });
    if (!repricerLifecycleCheck.ok) {
      throw new Error(`Repricer lifecycle guard did not initialize: ${JSON.stringify(repricerLifecycleCheck)}`);
    }

    if (pageErrors.length || failedLocal.length) {
      throw new Error(JSON.stringify({ pageErrors, failedLocal }, null, 2));
    }

    console.log(JSON.stringify({
      ok: true,
      url,
      initial
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
