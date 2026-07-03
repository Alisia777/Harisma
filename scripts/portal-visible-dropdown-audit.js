#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DEFAULT_URL = 'http://127.0.0.1:4187/index.html';
const GUEST_EMAIL = 'guest@qeep.life';
const GUEST_PASSWORD = 'NihsS%Hn_uE#kXBfcX!e';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function statusIsInactive(value = '') {
  return /\u0432\u044b\u0432\u043e\u0434|archive|archived|inactive|exit|stop/i.test(String(value || ''));
}

function uniqueSorted(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ru'));
}

function activeMatrixOwners(dataDir) {
  const skus = readJson(path.join(dataDir, 'skus.json'), []);
  const active = (Array.isArray(skus) ? skus : []).filter((sku) => (
    sku
    && sku.matrixActive !== false
    && !statusIsInactive(sku.status || sku.registryStatus || sku.sheetStatus || sku.owner?.registryStatus)
  ));
  return uniqueSorted(active.flatMap((sku) => {
    const maps = [
      sku.ownerByPlatform,
      sku.owner?.byPlatform,
      sku.ownersByPlatform
    ].filter((map) => map && typeof map === 'object');
    return maps.flatMap((map) => Object.values(map));
  }));
}

async function authenticateIfNeeded(page) {
  const emailInput = page.locator('#portalAuthEmail').first();
  const needsAuth = await emailInput.count().then(Boolean).catch(() => false);
  if (!needsAuth) return false;

  await emailInput.fill(GUEST_EMAIL);
  await page.locator('#portalAuthPassword').fill(GUEST_PASSWORD);
  await page.locator('#portalAuthSubmit').click();
  await page.waitForFunction(() => !document.body.classList.contains('portal-auth-locked'), undefined, { timeout: 30000 });
  return true;
}

async function clickView(page, view) {
  const selector = `.nav-btn[data-view="${view}"], [data-premium-nav="${view}"]`;
  const locator = page.locator(selector).first();
  if (!await locator.count().then(Boolean).catch(() => false)) {
    throw new Error(`Navigation target not found: ${view}`);
  }
  await locator.evaluate((button) => button.click()).catch(async () => {
    await locator.click({ force: true });
  });
  await page.waitForTimeout(1800);
}

async function selectOptions(page, selector) {
  await page.waitForSelector(selector, { state: 'attached', timeout: 30000 });
  return page.locator(selector).first().evaluate((select) => (
    Array.from(select.querySelectorAll('option')).map((option) => (
      (option.textContent || '').replace(/\s+/g, ' ').trim()
    ))
  ));
}

async function waitForOwnerOptions(page, selector, expectedOwners = []) {
  await page.waitForSelector(selector, { state: 'attached', timeout: 30000 });
  await page.waitForFunction(({ targetSelector, owners }) => {
    const select = document.querySelector(targetSelector);
    if (!select) return false;
    const options = Array.from(select.querySelectorAll('option')).map((option) => (
      (option.textContent || '').replace(/\s+/g, ' ').trim()
    ));
    return owners.every((owner) => options.includes(owner));
  }, { targetSelector: selector, owners: expectedOwners }, { timeout: 45000 });
}

function missingOptions(expected, actual) {
  const actualSet = new Set(actual);
  return expected.filter((value) => !actualSet.has(value));
}

async function main() {
  const args = parseArgs(process.argv);
  const dataDir = path.resolve(args['data-dir'] || 'data');
  const url = args.url || process.env.PORTAL_DROPDOWN_AUDIT_URL || DEFAULT_URL;
  const expectedOwners = activeMatrixOwners(dataDir);
  const failures = [];
  const checks = [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(30000);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const authenticated = await authenticateIfNeeded(page);
    await page.waitForFunction(() => (
      window.__alteaAppState?.boot?.dataReady === true
      && Array.isArray(window.__alteaAppState?.skus)
      && window.__alteaAppState.skus.length > 0
    ), undefined, { timeout: 90000 });

    async function expectOwners(view, selector) {
      await clickView(page, view);
      await waitForOwnerOptions(page, selector, expectedOwners);
      const options = await selectOptions(page, selector);
      const missing = missingOptions(expectedOwners, options);
      checks.push({ view, selector, options, missing });
      if (missing.length) failures.push(`${view} owner dropdown missing: ${missing.join(', ')}`);
    }

    await expectOwners('executive', '#altea-premium-stage-executive [data-executive-funnel-owner]');
    await expectOwners('sku-contour', '#view-sku-contour #skuV1Owner');
    await expectOwners('prices', '#view-prices #pwOwnerFilter');
    await expectOwners('sku-plan-fact', '#view-sku-plan-fact #skuPlanFactOwner');

    await clickView(page, 'oos-control');
    const oos = await page.evaluate(() => {
      const rows = Array.isArray(window.__alteaAppState?.oosControl?.rows)
        ? window.__alteaAppState.oosControl.rows
        : [];
      const owners = [...new Set(rows.map((row) => {
        const raw = row.owner || '';
        return typeof window.activeOwnerName === 'function' ? window.activeOwnerName(raw) : raw;
      }).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'ru'));
      const select = document.querySelector('#view-oos-control [data-oos-filter="owner"]');
      const options = select
        ? Array.from(select.querySelectorAll('option')).map((option) => (option.textContent || '').replace(/\s+/g, ' ').trim())
        : [];
      return { owners, options };
    });
    const missingOosOwners = missingOptions(oos.owners, oos.options);
    checks.push({ view: 'oos-control', selector: '[data-oos-filter="owner"]', options: oos.options, expected: oos.owners, missing: missingOosOwners });
    if (missingOosOwners.length) failures.push(`oos-control owner dropdown missing: ${missingOosOwners.join(', ')}`);

    await clickView(page, 'sku-contour');
    const skuWorkspaceText = await page.locator('#view-sku-contour').first().innerText({ timeout: 30000 }).catch(() => '');
    if (/qeep|zarli|harly|harley/i.test(skuWorkspaceText)) {
      failures.push('sku-contour visible text contains external warehouse brand');
    }

    await clickView(page, 'repricer');
    await page.waitForFunction(() => (
      typeof window.buildRepricerRows === 'function'
      && typeof window.repricerTemplateStats === 'function'
      && typeof window.repricerIssueBatchCounts === 'function'
      && window.buildRepricerRows().length > 0
    ), undefined, { timeout: 45000 });
    const repricerAudit = await page.evaluate(() => {
      const rows = window.buildRepricerRows();
      const wb = window.repricerTemplateStats(rows, 'wb');
      const ozon = window.repricerTemplateStats(rows, 'ozon');
      const batches = window.repricerIssueBatchCounts(rows);
      return {
        rows: rows.length,
        missingMin: Number(wb.missingMin || 0) + Number(ozon.missingMin || 0),
        missingCost: Number(wb.missingCost || 0) + Number(ozon.missingCost || 0),
        batchMissingMin: Number(batches.missing_min || 0),
        batchMissingCost: Number(batches.missing_cost || 0),
        safe: Number(wb.safe || 0) + Number(ozon.safe || 0)
      };
    });
    const noMinIsZero = repricerAudit.missingMin === 0 && repricerAudit.batchMissingMin === 0;
    const noCostIsZero = repricerAudit.missingCost === 0 && repricerAudit.batchMissingCost === 0;
    checks.push({ view: 'repricer', noMinIsZero, noCostIsZero, ...repricerAudit });
    if (!noMinIsZero) failures.push('repricer visible audit does not show "no MIN" as 0');
    if (!noCostIsZero) failures.push('repricer visible audit does not show "no cost" as 0');

    const report = {
      ok: failures.length === 0,
      url,
      authenticated,
      expectedOwners,
      checks,
      failures
    };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
