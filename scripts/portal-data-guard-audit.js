#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const DEFAULT_URL = process.env.PORTAL_URL || 'http://127.0.0.1:4179/';
const VIEWS = [
  'dashboard',
  'executive',
  'sku-plan-fact',
  'data-health',
  'control',
  'repricer',
  'prices',
  'order',
  'oos-control',
  'sku-contour',
  'launches',
  'iu-drr',
  'wb-rating',
  'product-leaderboard'
];

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function normalizeBaseUrl(value) {
  const raw = String(value || DEFAULT_URL).trim();
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function issue(severity, code, message, extra = {}) {
  return {
    severity,
    code,
    message,
    ...extra
  };
}

async function readView(page, view, expectedPeriodTo) {
  const logs = [];
  page.removeAllListeners('console');
  page.on('console', (msg) => {
    if (['error', 'warning', 'warn'].includes(msg.type())) {
      logs.push({
        type: msg.type(),
        text: msg.text().slice(0, 500)
      });
    }
  });

  await page.goto(`${normalizeBaseUrl(argValue('url', DEFAULT_URL))}#${view}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });

  await page.waitForFunction(() => typeof window.skuPlanFactBuildModel === 'function', null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => window.__alteaDataGuard && typeof window.__alteaDataGuard.runAudit === 'function', null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => {
    if (typeof window.skuPlanFactBuildModel !== 'function') return false;
    try {
      const model = window.skuPlanFactBuildModel({
        search: '',
        owner: 'all',
        status: 'all',
        platform: 'all',
        month: 'latest',
        date: '',
        dateFrom: '',
        dateTo: '',
        dateMode: 'latest',
        sort: 'gap',
        sortDir: 'asc'
      }, { persistFilters: false });
      const totals = model && model.totals || {};
      const api = Math.round(Number(totals.apiFactRevenue || 0));
      const kpi = Math.round(Number((totals.kpiFactRevenue ?? totals.factRevenue) || 0));
      return model && Array.isArray(model.rows) && model.rows.length >= 170 && kpi > 0 && api > 0 && model.periodEnd !== '2026-06-30';
    } catch (error) {
      return false;
    }
  }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);

  const data = await page.evaluate(async (params) => {
    const viewName = params.viewName;
    const expectedTo = params.expectedTo;
    const state = window.state || window.__alteaAppState || {};
    const viewEl = document.querySelector(`#view-${viewName}`) || document.body;
    const text = String(viewEl?.innerText || viewEl?.textContent || '').replace(/\u00a0/g, ' ');
    let model = null;
    let modelError = '';
    try {
      if (viewName === 'sku-plan-fact' && typeof window.skuPlanFactBuildModel === 'function') {
        model = window.skuPlanFactBuildModel({
          search: '',
          owner: 'all',
          status: 'all',
          platform: 'all',
          month: 'latest',
          date: '',
          dateFrom: '',
          dateTo: '',
          dateMode: 'latest',
          sort: 'gap',
          sortDir: 'asc'
        }, { persistFilters: false });
        if (typeof window.skuPlanFactHydratedExportModel === 'function') {
          model = await window.skuPlanFactHydratedExportModel(model);
        }
      }
    } catch (error) {
      modelError = error?.stack || error?.message || String(error);
    }

    const totals = model?.totals || {};
    const firstExportRow = (() => {
      try {
        if (viewName !== 'sku-plan-fact' || typeof window.skuPlanFactExportRows !== 'function' || !model) return null;
        const rows = window.skuPlanFactExportRows(model.rows || [], model);
        return rows && rows[0] ? {
          periodFrom: rows[0].period_from || '',
          periodTo: rows[0].period_to || '',
          factTo: rows[0].fact_to || '',
          kpiFact: Math.round(Number(rows[0].kpi_fact_total_revenue || 0)),
          apiFact: Math.round(Number(rows[0].api_fact_total_revenue || 0)),
          delta: Math.round(Number(rows[0].kpi_api_delta_total || 0)),
          hasBadJune30: JSON.stringify(rows).includes('2026-06-30')
        } : null;
      } catch (error) {
        return { error: error?.message || String(error) };
      }
    })();

    return {
      activeView: state.activeView || '',
      appError: state.appError || '',
      guardInstalled: Boolean(window.__alteaDataGuard),
      guardStatus: window.__alteaDataGuard?.status ? window.__alteaDataGuard.status() : '',
      guardIssues: window.__alteaDataGuard?.issues ? window.__alteaDataGuard.issues() : [],
      hasDatabaseTimeout: /DatabaseTimeout|database timed out/i.test(text),
      hasBadJune30: text.includes('2026-06-30'),
      hasExpectedPeriodTo: expectedTo ? text.includes(expectedTo) : null,
      modelError,
      model: model ? {
        periodStart: model.periodStart || '',
        periodEnd: model.periodEnd || '',
        monthKey: model.monthKey || '',
        rowCount: Array.isArray(model.rows) ? model.rows.length : 0,
        factRevenue: Math.round(Number(totals.factRevenue || 0)),
        apiFactRevenue: Math.round(Number(totals.apiFactRevenue || 0)),
        kpiFactRevenue: Math.round(Number(totals.kpiFactRevenue || totals.factRevenue || 0)),
        kpiFactDelta: Math.round(Number(totals.kpiFactDelta || 0))
      } : null,
      firstExportRow
    };
  }, { viewName: view, expectedTo: expectedPeriodTo || '' });

  return {
    view,
    logs,
    ...data
  };
}

function collectIssues(result, expectedPeriodTo) {
  const issues = [];
  if (!result.guardInstalled) {
    issues.push(issue('block', 'guard_missing', 'Data Guard is not installed.', { view: result.view }));
  }
  if (result.appError) {
    issues.push(issue('block', 'app_error', result.appError, { view: result.view }));
  }
  if (result.hasDatabaseTimeout) {
    issues.push(issue('block', 'database_timeout', 'View contains DatabaseTimeout.', { view: result.view }));
  }
  if (result.hasBadJune30) {
    issues.push(issue('block', 'bad_visible_period', 'View contains 2026-06-30.', { view: result.view }));
  }
  if (result.modelError) {
    issues.push(issue('block', 'model_error', result.modelError.slice(0, 300), { view: result.view }));
  }
  if (result.view === 'sku-plan-fact' && !result.model) {
    issues.push(issue('block', 'model_missing', 'Plan-fact model is missing.', { view: result.view }));
  } else if (result.model) {
    if (result.model.kpiFactRevenue > 0 && result.model.apiFactRevenue <= 0) {
      issues.push(issue('block', 'api_fact_empty', 'KPI fact is positive, but API fact is empty.', { view: result.view }));
    }
    if (result.model.periodEnd === '2026-06-30') {
      issues.push(issue('block', 'bad_model_period', 'Model period ends at 2026-06-30.', { view: result.view }));
    }
    if (expectedPeriodTo && result.model.periodEnd !== expectedPeriodTo) {
      issues.push(issue('block', 'unexpected_period_to', `Expected period end ${expectedPeriodTo}, got ${result.model.periodEnd}.`, { view: result.view }));
    }
  }
  if (result.firstExportRow) {
    if (result.firstExportRow.error) {
      issues.push(issue('block', 'export_row_error', result.firstExportRow.error, { view: result.view }));
    }
    if (result.firstExportRow.hasBadJune30) {
      issues.push(issue('block', 'bad_export_period', 'Export rows contain 2026-06-30.', { view: result.view }));
    }
    if (result.firstExportRow.kpiFact > 0 && result.firstExportRow.apiFact <= 0) {
      issues.push(issue('block', 'bad_export_api_fact', 'Export rows have KPI fact but empty API fact.', { view: result.view }));
    }
  }
  const consoleErrors = (result.logs || []).filter((log) => log.type === 'error');
  consoleErrors.forEach((log) => {
    issues.push(issue('warn', 'console_error', log.text, { view: result.view }));
  });
  (result.guardIssues || []).forEach((guardIssue) => {
    if (guardIssue.severity === 'block') {
      issues.push(issue('block', `guard_${guardIssue.code || 'issue'}`, guardIssue.message || 'Data Guard issue.', { view: result.view }));
    }
  });
  return issues;
}

async function main() {
  const url = normalizeBaseUrl(argValue('url', DEFAULT_URL));
  const expectedPeriodTo = argValue('expected-period-to', process.env.EXPECTED_PERIOD_TO || '');
  const writeReport = hasFlag('write');
  const verbose = hasFlag('verbose') || process.env.DEBUG_DATA_GUARD_AUDIT === '1';
  if (verbose) console.error('[portal-data-guard-audit] launch browser');
  const startedAt = new Date().toISOString();
  const results = [];
  const issues = [];
  const browser = await chromium.launch({ headless: true });
  let page = null;
  try {
    if (verbose) console.error('[portal-data-guard-audit] new page');
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    for (const view of VIEWS) {
      if (verbose) console.error(`[portal-data-guard-audit] view ${view}`);
      const result = await readView(page, view, expectedPeriodTo);
      if (verbose) console.error(`[portal-data-guard-audit] view ${view} done`);
      results.push(result);
      issues.push(...collectIssues(result, expectedPeriodTo));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const blocking = issues.filter((item) => item.severity === 'block').length;
  const warnings = issues.filter((item) => item.severity === 'warn').length;
  const report = {
    schema: 'portal-data-guard-audit-v1',
    url,
    expectedPeriodTo,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: blocking ? 'blocked' : (warnings ? 'warn' : 'ok'),
    summary: {
      views: results.length,
      blocking,
      warnings
    },
    issues,
    results
  };

  if (writeReport) {
    const outDir = path.join(ROOT, 'exports');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `portal-data-guard-audit-${report.finishedAt.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
    report.reportPath = outFile;
  }

  console.log(JSON.stringify(report, null, 2));
  if (blocking) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
