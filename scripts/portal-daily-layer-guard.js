#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_EXPECTED_PLATFORM_SERIES = ['wb', 'ozon', 'ya', 'all'];
const DEFAULT_EXPECTED_EXTRA_PLATFORMS = ['letu'];
const DEFAULT_CRITICAL_SYNC_STEPS = new Set([
  'sku-alias-snapshots',
  'yandex-market',
  'extra-marketplace-merge',
  'wb-owner-distribution',
  'smart-price',
  'oos-control',
  'wb-ads',
  'ozon-ads-finance',
  'iu-drr',
  'iu-drr-with-feedbacks',
  'wb-feedbacks',
  'data-quality',
  'sku-matrix',
  'full-sync'
]);

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

function localDateKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function dateKey(value) {
  if (!value) return '';
  const raw = String(value);
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function csv(value, fallback = []) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function resolveOptions(args) {
  const root = process.cwd();
  const inputDir = path.resolve(args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output'));
  return {
    inputDir,
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || inputDir),
    syncIssuesPath: path.resolve(args['sync-issues'] || path.join(inputDir, 'portal_sync_issues.json')),
    expectedDate: dateKey(args['expected-date']) || localDateKey(-1),
    expectedRunDate: dateKey(args['expected-run-date']) || localDateKey(0),
    expectedPlatformSeries: csv(args['expected-platform-series'], DEFAULT_EXPECTED_PLATFORM_SERIES),
    expectedExtraPlatforms: csv(args['expected-extra-platforms'], DEFAULT_EXPECTED_EXTRA_PLATFORMS),
    noFail: Boolean(args['no-fail']),
    mirrorLocalFallback: Boolean(args['mirror-local-fallback'])
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readJsonIfExists(filePath, fallback = null) {
  try {
    return fs.existsSync(filePath) ? readJson(filePath) : fallback;
  } catch (error) {
    return { __readError: error.message };
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function getPathValue(object, dottedPath) {
  if (!object || !dottedPath) return undefined;
  return String(dottedPath)
    .split('.')
    .reduce((current, key) => (current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined), object);
}

function sizeOf(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  if (typeof value === 'string') return value.trim() ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  return 0;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstDate(payload, paths) {
  for (const freshnessPath of paths) {
    const value = getPathValue(payload, freshnessPath);
    const key = dateKey(value);
    if (key) return { date: key, path: freshnessPath, value };
  }
  return { date: '', path: '', value: '' };
}

function platformByKey(payload, key) {
  const platforms = payload?.platforms;
  if (Array.isArray(platforms)) {
    return platforms.find((platform) => String(platform?.key || platform?.platformKey || '').toLowerCase() === key);
  }
  if (platforms && typeof platforms === 'object') {
    return platforms[key] || null;
  }
  return null;
}

function platformSeriesHasDate(payload, key, expectedDate) {
  const platform = platformByKey(payload, key);
  const series = Array.isArray(platform?.series) ? platform.series : [];
  return series.some((point) => dateKey(point?.date || point?.label) === expectedDate);
}

function checkFile(options, name, fileName) {
  const filePath = path.join(options.inputDir, fileName);
  const check = {
    name,
    file: fileName,
    status: 'ok',
    warnings: [],
    blockingReasons: []
  };

  if (!fs.existsSync(filePath)) {
    check.status = 'blocked';
    check.blockingReasons.push(`${name}: missing ${fileName}`);
    return { check, payload: null };
  }

  const stats = fs.statSync(filePath);
  check.bytes = stats.size;
  check.mtime = stats.mtime.toISOString();
  if (stats.size <= 2) {
    check.status = 'blocked';
    check.blockingReasons.push(`${name}: ${fileName} is empty`);
    return { check, payload: null };
  }

  let payload = null;
  try {
    payload = readJson(filePath);
  } catch (error) {
    check.status = 'blocked';
    check.blockingReasons.push(`${name}: invalid JSON in ${fileName}: ${error.message}`);
    return { check, payload: null };
  }

  check.generatedAt = payload?.generatedAt || payload?.meta?.generatedAt || '';
  return { check, payload };
}

function requireDataDate(check, payload, options, paths) {
  const freshness = firstDate(payload, paths);
  check.dataDate = freshness.date;
  check.dataDatePath = freshness.path;
  if (!freshness.date || freshness.date < options.expectedDate) {
    check.blockingReasons.push(`${check.name}: data date ${freshness.date || 'unknown'} is older than expected ${options.expectedDate}`);
  }
}

function requireRunDate(check, payload, options, paths = ['generatedAt', 'meta.generatedAt']) {
  const freshness = firstDate(payload, paths);
  check.runDate = freshness.date;
  check.runDatePath = freshness.path;
  if (!freshness.date || freshness.date < options.expectedRunDate) {
    check.blockingReasons.push(`${check.name}: build date ${freshness.date || 'unknown'} is older than expected run date ${options.expectedRunDate}`);
  }
}

function requireSize(check, payload, dottedPath, minSize = 1, label = dottedPath) {
  const size = sizeOf(getPathValue(payload, dottedPath));
  check[`${label.replace(/[^A-Za-z0-9]+/g, '_')}Count`] = size;
  if (size < minSize) {
    check.blockingReasons.push(`${check.name}: ${label} has ${size}, expected at least ${minSize}`);
  }
}

function finishCheck(check) {
  check.status = check.blockingReasons.length ? 'blocked' : (check.warnings.length ? 'warning' : 'ok');
  return check;
}

function checkDashboard(options) {
  const { check, payload } = checkFile(options, 'dashboard', 'dashboard.json');
  if (payload) {
    requireDataDate(check, payload, options, ['latestMarketplaceDate', 'dataFreshness.asOfDate', 'asOfDate']);
    requireRunDate(check, payload, options);
    requireSize(check, payload, 'cards', 1, 'cards');
  }
  return finishCheck(check);
}

function checkPlatformTrends(options) {
  const { check, payload } = checkFile(options, 'platform_trends', 'platform_trends.json');
  if (payload) {
    requireDataDate(check, payload, options, ['latestMarketplaceDate', 'asOfDate']);
    requireRunDate(check, payload, options);
    requireSize(check, payload, 'platforms', 3, 'platforms');
    for (const platformKey of options.expectedPlatformSeries) {
      const ok = platformSeriesHasDate(payload, platformKey, options.expectedDate);
      check[`series_${platformKey}`] = ok;
      if (!ok) {
        check.blockingReasons.push(`platform_trends: ${platformKey} series is missing expected date ${options.expectedDate}`);
      }
    }
  }
  return finishCheck(check);
}

function checkExtraMarketplace(options) {
  const { check, payload } = checkFile(options, 'extra_marketplace', 'platform_trends.json');
  if (payload) {
    const extra = payload.extraMarketplace || {};
    requireDataDate(check, extra, options, ['asOfDate']);
    requireRunDate(check, extra, options, ['generatedAt']);
    requireSize(check, extra, 'platforms', 1, 'extraMarketplace.platforms');
    for (const platformKey of options.expectedExtraPlatforms) {
      const platform = extra.platforms?.[platformKey] || null;
      const articleCount = sizeOf(platform?.articles) || numberOrZero(platform?.diagnostics?.articleCount);
      check[`extra_${platformKey}_articleCount`] = articleCount;
      if (articleCount <= 0) {
        check.blockingReasons.push(`extra_marketplace: ${platformKey} has no articles; dashboard extra layer was not merged`);
      }
    }
  }
  return finishCheck(check);
}

function checkLogistics(options) {
  const { check, payload } = checkFile(options, 'logistics', 'logistics.json');
  if (payload) {
    requireRunDate(check, payload, options);
    requireSize(check, payload, 'summaryCards', 1, 'summaryCards');
    requireSize(check, payload, 'statusCards', 1, 'statusCards');
  }
  return finishCheck(check);
}

function checkWarehouseStock(options) {
  const { check, payload } = checkFile(options, 'warehouse_stock_overlay', 'warehouse_stock_overlay.json');
  if (payload) {
    requireRunDate(check, payload, options);
    const matchedSkuCount = numberOrZero(payload.matchedSkuCount);
    check.matchedSkuCount = matchedSkuCount;
    if (matchedSkuCount <= 0) {
      check.blockingReasons.push('warehouse_stock_overlay: matchedSkuCount is empty');
    }
    requireSize(check, payload, 'rows', 1, 'rows');
  }
  return finishCheck(check);
}

function checkAdsSummary(options) {
  const { check, payload } = checkFile(options, 'ads_summary', 'ads_summary.json');
  if (payload) {
    requireDataDate(check, payload, options, ['window.to', 'asOfDate']);
    requireRunDate(check, payload, options);
    requireSize(check, payload, 'platforms', 2, 'platforms');
    requireSize(check, payload, 'itemSeries', 1, 'itemSeries');
  }
  return finishCheck(check);
}

function checkIuPlan(options) {
  const { check, payload } = checkFile(options, 'iu_plan', 'iu_plan.json');
  if (payload) {
    requireRunDate(check, payload, options);
    const planRows = sizeOf(payload.wbDailyPlan?.rows || payload.wbDailyPlan?.daily || payload.wbDailyPlan);
    check.wbDailyPlanCount = planRows;
    if (planRows <= 0) {
      check.warnings.push('iu_plan: WB daily plan rows were not detected');
    }
  }
  return finishCheck(check);
}

function checkIuDrr(options) {
  const { check, payload } = checkFile(options, 'iu_drr_summary', 'iu_drr_summary.json');
  if (payload) {
    requireDataDate(check, payload, options, ['asOfDate', 'window.to', 'latest_date']);
    requireRunDate(check, payload, options);
    const daily = Array.isArray(payload.daily) ? payload.daily : [];
    check.dailyRows = daily.length;
    const hasExpectedDate = daily.some((row) => dateKey(row?.date || row?.label) === options.expectedDate);
    check.expectedDateRow = hasExpectedDate;
    if (!hasExpectedDate) {
      check.blockingReasons.push(`iu_drr_summary: daily row for ${options.expectedDate} is missing`);
    }
  }
  return finishCheck(check);
}

function checkWbFeedbacks(options) {
  const { check, payload } = checkFile(options, 'wb_feedbacks_summary', 'wb_feedbacks_summary.json');
  if (payload) {
    requireDataDate(check, payload, options, ['window.to', 'asOfDate', 'currentMonth.to']);
    requireRunDate(check, payload, options);
    requireSize(check, payload, 'daily', 1, 'daily');
  }
  return finishCheck(check);
}

function checkPrices(options) {
  const { check, payload } = checkFile(options, 'prices', 'prices.json');
  if (payload) {
    requireRunDate(check, payload, options);
    requireSize(check, payload, 'platforms', 2, 'platforms');
  }
  return finishCheck(check);
}

function checkRepricer(options) {
  const { check, payload } = checkFile(options, 'repricer', 'repricer.json');
  if (payload) {
    requireRunDate(check, payload, options);
    requireSize(check, payload, 'rows', 1, 'rows');
  }
  return finishCheck(check);
}

function checkSmartPrice(options) {
  const { check, payload } = checkFile(options, 'smart_price_overlay', 'smart_price_overlay.json');
  if (payload) {
    requireDataDate(check, payload, options, ['asOfDate']);
    requireRunDate(check, payload, options);
    requireSize(check, payload, 'platforms', 2, 'platforms');
    const extraDate = dateKey(payload.extraMarketplace?.asOfDate);
    check.extraMarketplaceDate = extraDate;
    if (!extraDate || extraDate < options.expectedDate) {
      check.blockingReasons.push(`smart_price_overlay: extraMarketplace date ${extraDate || 'unknown'} is older than expected ${options.expectedDate}`);
    }
  }
  return finishCheck(check);
}

function checkOos(options) {
  const { check, payload } = checkFile(options, 'oos_control', 'oos_control.json');
  if (payload) {
    requireRunDate(check, payload, options);
    requireSize(check, payload, 'rows', 1, 'rows');
  }
  return finishCheck(check);
}

function checkGeneratedLayer(options, name, fileName) {
  const { check, payload } = checkFile(options, name, fileName);
  if (payload) {
    requireRunDate(check, payload, options);
  }
  return finishCheck(check);
}

function checkGoogleSheetMeta(options) {
  const { check, payload } = checkFile(options, 'google_sheet_sync_meta', 'google_sheet_sync_meta.json');
  if (payload) {
    requireRunDate(check, payload, options);
    const latest = dateKey(payload.dashboard?.latest_marketplace_date || payload.platformTrends?.latest_marketplace_date);
    check.dashboardLatestMarketplaceDate = latest;
    if (!latest || latest < options.expectedDate) {
      check.blockingReasons.push(`google_sheet_sync_meta: dashboard latest date ${latest || 'unknown'} is older than expected ${options.expectedDate}`);
    }
  }
  return finishCheck(check);
}

function checkSyncIssues(options) {
  const payload = readJsonIfExists(options.syncIssuesPath, { issues: [] });
  const check = {
    name: 'sync_issues',
    file: path.basename(options.syncIssuesPath),
    status: 'ok',
    warnings: [],
    blockingReasons: [],
    issueCount: 0,
    criticalIssueCount: 0,
    issues: []
  };
  if (payload?.__readError) {
    check.blockingReasons.push(`sync_issues: invalid JSON in ${options.syncIssuesPath}: ${payload.__readError}`);
    return finishCheck(check);
  }
  const issues = Array.isArray(payload?.issues) ? payload.issues : [];
  check.issueCount = issues.length;
  for (const issue of issues) {
    const id = String(issue?.id || '').trim();
    const message = issue?.message ? `: ${issue.message}` : '';
    const item = {
      id,
      name: issue?.name || id,
      message: issue?.message || '',
      failedAt: issue?.failedAt || ''
    };
    check.issues.push(item);
    const isCritical = DEFAULT_CRITICAL_SYNC_STEPS.has(id) || id.startsWith('repricer-minmax-') || id.startsWith('team-repricer-inputs');
    if (isCritical) {
      check.criticalIssueCount += 1;
      check.blockingReasons.push(`sync_issues: critical step failed: ${item.name || id}${message}`);
    } else {
      check.warnings.push(`sync_issues: non-critical step failed: ${item.name || id}${message}`);
    }
  }
  return finishCheck(check);
}

function buildGuard(options) {
  const checks = [
    checkDashboard(options),
    checkPlatformTrends(options),
    checkExtraMarketplace(options),
    checkLogistics(options),
    checkWarehouseStock(options),
    checkAdsSummary(options),
    checkIuPlan(options),
    checkIuDrr(options),
    checkWbFeedbacks(options),
    checkPrices(options),
    checkRepricer(options),
    checkSmartPrice(options),
    checkOos(options),
    checkGeneratedLayer(options, 'portal_data_quality', 'portal_data_quality.json'),
    checkGeneratedLayer(options, 'portal_data_quarantine', 'portal_data_quarantine.json'),
    checkGeneratedLayer(options, 'sku_matrix', 'sku_matrix.json'),
    checkGeneratedLayer(options, 'wb_owner_distribution_audit', 'wb_owner_distribution_audit.json'),
    checkGoogleSheetMeta(options),
    checkSyncIssues(options)
  ];

  const blockingReasons = checks.flatMap((check) => check.blockingReasons || []);
  const warnings = checks.flatMap((check) => check.warnings || []);
  return {
    schema: 'portal-daily-layer-guard-v1',
    generatedAt: new Date().toISOString(),
    expectedDate: options.expectedDate,
    expectedRunDate: options.expectedRunDate,
    publish: {
      allowed: blockingReasons.length === 0,
      blockingReasons,
      warnings
    },
    summary: {
      checkCount: checks.length,
      okCount: checks.filter((check) => check.status === 'ok').length,
      warningCount: checks.filter((check) => check.status === 'warning').length,
      blockedCount: checks.filter((check) => check.status === 'blocked').length
    },
    checks
  };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const guard = buildGuard(options);
  const outputPath = path.join(options.outputDir, 'portal_daily_guard.json');
  writeJson(outputPath, guard);
  if (options.mirrorLocalFallback) {
    writeJson(path.join(options.baseDataDir, 'portal_daily_guard.json'), guard);
  }
  console.log(JSON.stringify({
    outputPath,
    publishAllowed: guard.publish.allowed,
    expectedDate: guard.expectedDate,
    blockedCount: guard.summary.blockedCount,
    blockingReasons: guard.publish.blockingReasons,
    warnings: guard.publish.warnings
  }, null, 2));
  if (!options.noFail && !guard.publish.allowed) {
    process.exitCode = 1;
  }
}

main();
