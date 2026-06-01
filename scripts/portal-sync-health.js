#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SNAPSHOT_NAMES = [
  'dashboard',
  'skus',
  'platform_trends',
  'ads_summary',
  'iu_plan',
  'prices',
  'repricer',
  'smart_price_overlay',
  'warehouse_stock_overlay',
  'loyalty_system',
  'product_leaderboard',
  'product_leaderboard_history',
  'order_procurement',
  'order_procurement_wb',
  'order_procurement_ozon',
  'order_procurement_ym',
  'oos_control',
  'iu_drr_summary',
  'wb_feedbacks_summary',
  'portal_data_quality',
  'portal_data_quarantine',
  'sku_aliases',
  'sku_alias_ignore',
  'sku_alias_audit',
  'sku_matrix',
  'portal_sync_health'
];

const REQUIRED_SNAPSHOTS = [
  'dashboard',
  'skus',
  'platform_trends',
  'order_procurement',
  'warehouse_stock_overlay',
  'sku_matrix',
  'portal_data_quality'
];

const LAST_GOOD_MANIFEST = 'manifest.json';
const DEFAULT_MIN_ROWS_RATIO = 0.55;
const DEFAULT_MIN_REVENUE_RATIO = 0.60;
const DEFAULT_COMPLETENESS_MIN_RATIO = 0.55;
const DEFAULT_COMPLETENESS_LOOKBACK_DAYS = 7;
const DEFAULT_COMPLETENESS_MIN_BASELINE_REVENUE = 100000;
const DEFAULT_COMPLETENESS_MIN_BASELINE_UNITS = 50;

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

function resolveOptions(args) {
  const root = process.cwd();
  const inputDir = path.resolve(args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output'));
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(root, 'data'));
  const outputDir = path.resolve(args['output-dir'] || inputDir);
  const settlementHour = Math.max(0, Math.min(23, Math.trunc(numberOrZero(args['settlement-hour'] || process.env.ALTEA_PORTAL_SETTLEMENT_HOUR || 10))));
  const completenessPlatforms = String(args['completeness-platforms'] || process.env.ALTEA_PORTAL_COMPLETENESS_PLATFORMS || 'wb,ozon')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return {
    inputDir,
    baseDataDir,
    outputDir,
    syncIssuesPath: path.resolve(args['sync-issues'] || path.join(inputDir, 'portal_sync_issues.json')),
    lastGoodDir: path.resolve(args['last-good-dir'] || path.join(baseDataDir, 'last_good')),
    mirrorLocalFallback: Boolean(args['mirror-local-fallback']),
    markLastGood: Boolean(args['mark-last-good']),
    minRowsRatio: Number(args['min-rows-ratio'] || DEFAULT_MIN_ROWS_RATIO),
    minRevenueRatio: Number(args['min-revenue-ratio'] || DEFAULT_MIN_REVENUE_RATIO),
    staleWarnDays: Number(args['stale-warn-days'] || 3),
    settlementHour,
    expectedDate: dateKey(args['expected-date'] || ''),
    completenessGuardEnabled: String(args['disable-completeness-guard'] || process.env.ALTEA_PORTAL_DISABLE_COMPLETENESS_GUARD || '').trim() !== '1',
    completenessPlatforms,
    completenessMinRatio: Number(args['completeness-min-ratio'] || process.env.ALTEA_PORTAL_COMPLETENESS_MIN_RATIO || DEFAULT_COMPLETENESS_MIN_RATIO),
    completenessLookbackDays: Math.max(1, Math.trunc(numberOrZero(args['completeness-lookback-days'] || process.env.ALTEA_PORTAL_COMPLETENESS_LOOKBACK_DAYS || DEFAULT_COMPLETENESS_LOOKBACK_DAYS))),
    completenessMinBaselineRevenue: numberOrZero(args['completeness-min-baseline-revenue'] || process.env.ALTEA_PORTAL_COMPLETENESS_MIN_BASELINE_REVENUE || DEFAULT_COMPLETENESS_MIN_BASELINE_REVENUE),
    completenessMinBaselineUnits: numberOrZero(args['completeness-min-baseline-units'] || process.env.ALTEA_PORTAL_COMPLETENESS_MIN_BASELINE_UNITS || DEFAULT_COMPLETENESS_MIN_BASELINE_UNITS),
    now: args.now ? new Date(args.now) : new Date()
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function normalizeSyncIssue(issue) {
  if (!issue || typeof issue !== 'object') return null;
  const id = String(issue.id || issue.stepId || issue.name || 'sync-step').trim();
  const name = String(issue.name || issue.id || id).trim();
  const message = String(issue.message || issue.error || issue.reason || '').trim();
  return {
    id,
    name,
    message,
    failedAt: String(issue.failedAt || issue.generatedAt || '').trim()
  };
}

function loadSyncIssues(options) {
  const payload = readJsonIfExists(options.syncIssuesPath);
  if (!payload) {
    return {
      generatedAt: '',
      issues: []
    };
  }
  const rawIssues = Array.isArray(payload) ? payload : (Array.isArray(payload.issues) ? payload.issues : []);
  return {
    generatedAt: String(payload.generatedAt || '').trim(),
    issues: rawIssues.map(normalizeSyncIssue).filter(Boolean)
  };
}

function readSnapshot(options, name) {
  const outputPath = path.join(options.inputDir, `${name}.json`);
  const basePath = path.join(options.baseDataDir, `${name}.json`);
  const payload = readJsonIfExists(outputPath) ?? readJsonIfExists(basePath);
  return {
    name,
    exists: payload !== null,
    payload,
    sourcePath: payload !== null && fs.existsSync(outputPath) ? outputPath : (payload !== null ? basePath : '')
  };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dateKey(value) {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function parseStamp(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const stamp = Date.parse(normalized);
  return Number.isFinite(stamp) ? stamp : 0;
}

function daysOld(value, now) {
  const stamp = parseStamp(value);
  if (!stamp) return null;
  return Math.max(0, Math.floor((now.getTime() - stamp) / 86400000));
}

function latestDate(values) {
  return (values || []).map(dateKey).filter(Boolean).sort().pop() || '';
}

function localDateKey(offsetDays = 0, now = new Date()) {
  const date = new Date(now.getTime());
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function pointDate(point = {}) {
  return dateKey(point.date || point.label);
}

function pointRevenue(point = {}) {
  return numberOrZero(point.revenue ?? point.ordersRevenue ?? point.salesRevenue ?? point.factRevenue);
}

function pointUnits(point = {}) {
  return numberOrZero(point.units ?? point.ordersUnits ?? point.deliveredUnits ?? point.quantity);
}

function median(values) {
  const sorted = values.map(numberOrZero).filter((value) => value > 0).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function platformByKey(platformTrends = {}, key = '') {
  return (Array.isArray(platformTrends.platforms) ? platformTrends.platforms : [])
    .find((platform) => String(platform?.key || platform?.platformKey || '').trim().toLowerCase() === key);
}

function buildCompletenessGuard(options, snapshots, maxDate) {
  const expectedDate = options.expectedDate || localDateKey(options.now.getHours() < options.settlementHour ? -2 : -1, options.now);
  const guard = {
    enabled: options.completenessGuardEnabled,
    status: 'ok',
    checkedAt: new Date().toISOString(),
    settlementHour: options.settlementHour,
    expectedDate,
    maxDate: maxDate || '',
    minRatio: options.completenessMinRatio,
    lookbackDays: options.completenessLookbackDays,
    minBaselineRevenue: options.completenessMinBaselineRevenue,
    minBaselineUnits: options.completenessMinBaselineUnits,
    platforms: options.completenessPlatforms,
    blockingReasons: [],
    warnings: [],
    checks: []
  };
  if (!guard.enabled) {
    guard.status = 'disabled';
    return guard;
  }
  if (!expectedDate) {
    guard.status = 'warning';
    guard.warnings.push('Freshness completeness guard could not resolve expected marketplace date.');
    return guard;
  }

  if (!maxDate || maxDate < expectedDate) {
    guard.blockingReasons.push(`Marketplace data is behind the expected cutoff date (${maxDate || 'unknown'} < ${expectedDate}).`);
  }

  const platformTrends = snapshots.platform_trends || {};
  for (const key of options.completenessPlatforms) {
    const platform = platformByKey(platformTrends, key);
    const label = platform?.label || key;
    const series = (Array.isArray(platform?.series) ? platform.series : [])
      .map((point) => ({
        date: pointDate(point),
        revenue: pointRevenue(point),
        units: pointUnits(point)
      }))
      .filter((point) => point.date)
      .sort((left, right) => left.date.localeCompare(right.date));
    const latest = latestDate(series.map((point) => point.date));
    const target = series.find((point) => point.date === expectedDate) || null;
    const baselineRows = series
      .filter((point) => point.date < expectedDate && (point.revenue > 0 || point.units > 0))
      .slice(-options.completenessLookbackDays);
    const baselineRevenue = median(baselineRows.map((point) => point.revenue));
    const baselineUnits = median(baselineRows.map((point) => point.units));
    const currentRevenue = target ? target.revenue : 0;
    const currentUnits = target ? target.units : 0;
    const revenueRatio = baselineRevenue > 0 ? currentRevenue / baselineRevenue : null;
    const unitsRatio = baselineUnits > 0 ? currentUnits / baselineUnits : null;
    const check = {
      platform: key,
      label,
      status: 'ok',
      expectedDate,
      latestDate: latest,
      currentRevenue,
      baselineRevenueMedian: Math.round(baselineRevenue * 100) / 100,
      revenueRatio: revenueRatio === null ? null : Number(revenueRatio.toFixed(4)),
      currentUnits,
      baselineUnitsMedian: Math.round(baselineUnits * 100) / 100,
      unitsRatio: unitsRatio === null ? null : Number(unitsRatio.toFixed(4)),
      baselineDays: baselineRows.length
    };

    if (!platform) {
      check.status = 'blocked';
      guard.blockingReasons.push(`Marketplace completeness guard: platform ${key} is missing from platform_trends.`);
    } else if (latest < expectedDate) {
      check.status = 'blocked';
      guard.blockingReasons.push(`Marketplace completeness guard: ${label} has no data for expected date ${expectedDate} (latest ${latest || 'unknown'}).`);
    } else if (!target) {
      check.status = 'blocked';
      guard.blockingReasons.push(`Marketplace completeness guard: ${label} is missing expected date ${expectedDate}.`);
    } else if (baselineRevenue >= options.completenessMinBaselineRevenue) {
      const revenueTooLow = currentRevenue <= 0 || revenueRatio < options.completenessMinRatio;
      const unitsComparable = baselineUnits >= options.completenessMinBaselineUnits;
      const unitsTooLow = !unitsComparable || currentUnits <= 0 || unitsRatio < options.completenessMinRatio;
      if (revenueTooLow && unitsTooLow) {
        check.status = 'blocked';
        guard.blockingReasons.push(`Marketplace completeness guard: ${label} data for ${expectedDate} looks partial (revenue ${Math.round(currentRevenue)} is ${Math.round((revenueRatio || 0) * 100)}% of recent median ${Math.round(baselineRevenue)}).`);
      }
    } else {
      check.status = 'warning';
      guard.warnings.push(`Marketplace completeness guard: not enough ${label} baseline revenue to validate ${expectedDate}.`);
    }
    guard.checks.push(check);
  }

  guard.status = guard.blockingReasons.length ? 'blocked' : (guard.warnings.length ? 'warning' : 'ok');
  return guard;
}

function buildFreshnessDependencyGuard(options, snapshots, expectedDate) {
  const adsSummary = snapshots.ads_summary || {};
  const iuDrr = snapshots.iu_drr_summary || {};
  const adsWindowTo = dateKey(adsSummary.window?.to || adsSummary.asOfDate || adsSummary.diagnostics?.sourceWindow?.to);
  const iuWindowTo = dateKey(iuDrr.window?.to || iuDrr.asOfDate);
  const iuAdsWindowTo = dateKey(iuDrr.diagnostics?.adsDiagnostics?.sourceWindow?.to);
  const iuDailyLatest = latestDate((Array.isArray(iuDrr.daily) ? iuDrr.daily : [])
    .map((row) => dateKey(row?.date))
    .filter(Boolean));
  const guard = {
    status: 'ok',
    checkedAt: new Date().toISOString(),
    expectedDate: expectedDate || '',
    adsSummaryWindowTo: adsWindowTo,
    iuDrrWindowTo: iuWindowTo,
    iuDrrAdsWindowTo: iuAdsWindowTo,
    iuDrrDailyLatest: iuDailyLatest,
    blockingReasons: [],
    warnings: [],
    checks: []
  };

  function addCheck(name, ok, message, details = {}, okMessage = 'Freshness dependency is aligned.') {
    const status = ok ? 'ok' : 'blocked';
    guard.checks.push({ name, status, message: ok ? okMessage : message, ...details });
    if (!ok) guard.blockingReasons.push(message);
  }

  if (adsWindowTo && iuAdsWindowTo) {
    addCheck(
      'iu-drr-ads-window-after-ads-summary',
      iuAdsWindowTo >= adsWindowTo,
      `IU/DRR WB ads window is behind ads_summary (${iuAdsWindowTo} < ${adsWindowTo}); rebuild iu_drr_summary after ads_summary.`,
      { adsWindowTo, iuAdsWindowTo },
      `IU/DRR WB ads window covers ads_summary through ${iuAdsWindowTo}.`
    );
  } else if (adsWindowTo && !iuAdsWindowTo) {
    guard.warnings.push('IU/DRR WB ads source window is missing; dashboard may hide recent advertising days.');
    guard.checks.push({
      name: 'iu-drr-ads-window-present',
      status: 'warning',
      message: 'IU/DRR WB ads source window is missing.',
      adsWindowTo,
      iuAdsWindowTo
    });
  }

  if (expectedDate) {
    addCheck(
      'iu-drr-daily-expected-date',
      Boolean(iuDailyLatest && iuDailyLatest >= expectedDate),
      `IU/DRR daily rows are behind the expected cutoff date (${iuDailyLatest || 'unknown'} < ${expectedDate}).`,
      { iuDailyLatest, expectedDate },
      `IU/DRR daily rows cover expected date ${expectedDate}.`
    );
    if (adsWindowTo && adsWindowTo >= expectedDate) {
      addCheck(
        'iu-drr-ads-window-expected-date',
        Boolean(iuAdsWindowTo && iuAdsWindowTo >= expectedDate),
        `IU/DRR WB ads window is behind the expected cutoff date (${iuAdsWindowTo || 'unknown'} < ${expectedDate}).`,
        { iuAdsWindowTo, expectedDate },
        `IU/DRR WB ads window covers expected date ${expectedDate}.`
      );
    }
  }

  guard.status = guard.blockingReasons.length ? 'blocked' : (guard.warnings.length ? 'warning' : 'ok');
  return guard;
}

function rowCount(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== 'object') return 0;
  if (Array.isArray(payload.rows)) return payload.rows.length;
  if (Array.isArray(payload.items)) return payload.items.length;
  if (Array.isArray(payload.cards)) return payload.cards.length;
  if (Array.isArray(payload.platforms)) return payload.platforms.length;
  if (Array.isArray(payload.daily)) return payload.daily.length;
  if (Array.isArray(payload.aliases)) return payload.aliases.length;
  if (Array.isArray(payload.ignored)) return payload.ignored.length;
  if (Array.isArray(payload.events)) return payload.events.length;
  if (Array.isArray(payload.apiUnmapped)) return payload.apiUnmapped.length;
  if (Array.isArray(payload.allRows)) return payload.allRows.length;
  return Object.keys(payload).length ? 1 : 0;
}

function latestPayloadDate(name, payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (name === 'dashboard') return dateKey(payload.dataFreshness?.asOfDate || payload.latestMarketplaceDate || payload.generatedAt);
  if (name === 'platform_trends') {
    return dateKey(payload.latestMarketplaceDate)
      || latestDate((payload.platforms || []).flatMap((platform) => (platform.series || []).map((point) => point.date || point.label)));
  }
  if (name === 'ads_summary') return dateKey(payload.asOfDate || payload.window?.to || payload.generatedAt);
  if (name === 'iu_drr_summary') return dateKey(payload.asOfDate || payload.window?.to || payload.generatedAt);
  if (name === 'wb_feedbacks_summary') return dateKey(payload.window?.to || payload.asOfDate || payload.generatedAt);
  if (name.startsWith('order_procurement')) return dateKey(payload.window?.to || payload.generatedAt);
  if (name === 'oos_control') return dateKey(payload.dataFreshness?.dataDate || payload.summary?.dataDate || payload.generatedAt);
  if (name === 'warehouse_stock_overlay') return dateKey(payload.asOfDate || payload.generatedAt);
  if (name === 'portal_data_quality') return dateKey(payload.summary?.maxDate || payload.generatedAt);
  if (name === 'portal_sync_health') return dateKey(payload.generatedAt);
  return dateKey(payload.asOfDate || payload.generatedAt || payload.updatedAt);
}

function revenueTotal(name, payload) {
  if (!payload || typeof payload !== 'object') return 0;
  if (name === 'platform_trends') {
    return Math.round((payload.platforms || []).reduce((sum, platform) => (
      sum + (platform.series || []).reduce((inner, point) => inner + numberOrZero(point.revenue), 0)
    ), 0));
  }
  if (name === 'portal_data_quality') return numberOrZero(payload.summary?.apiUnmappedRevenue);
  if (Array.isArray(payload.rows)) {
    return Math.round(payload.rows.reduce((sum, row) => (
      sum + numberOrZero(row.revenue ?? row.factRevenue ?? row.ordersRevenue ?? row.salesRevenue)
    ), 0));
  }
  if (Array.isArray(payload.items)) {
    return Math.round(payload.items.reduce((sum, row) => (
      sum + numberOrZero(row.revenue ?? row.factRevenue ?? row.ordersRevenue ?? row.salesRevenue)
    ), 0));
  }
  return 0;
}

function snapshotMetric(name, payload) {
  return {
    exists: payload !== null && payload !== undefined,
    rows: rowCount(payload),
    generatedAt: payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload.generatedAt || payload.updatedAt || '') : '',
    asOfDate: latestPayloadDate(name, payload),
    revenue: revenueTotal(name, payload)
  };
}

function token(value = '') {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-zа-я0-9]+/gi, '');
}

function aliasRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.aliases) ? payload.aliases : [];
}

function ignoreRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.ignored)) return payload.ignored;
  if (Array.isArray(payload.ignores)) return payload.ignores;
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function activeStatus(row = {}) {
  const status = token(row.status ?? row.active ?? 'active');
  return !['disabled', 'inactive', 'deleted', 'false', '0', 'off'].includes(status);
}

function activeAliasCount(payload = {}) {
  return aliasRows(payload).filter((row) => (
    activeStatus(row)
    && token(row.target_sku || row.targetSku || row.target || '')
    && token(row.api_sku || row.apiSku || row.alias || row.value || '')
  )).length;
}

function activeIgnoreCount(payload = {}) {
  return ignoreRows(payload).filter((row) => (
    activeStatus(row)
    && token(row.api_sku || row.apiSku || row.alias || row.value || '')
  )).length;
}

function loadLastGoodManifest(options) {
  const manifestPath = path.join(options.lastGoodDir, LAST_GOOD_MANIFEST);
  const manifest = readJsonIfExists(manifestPath);
  return {
    exists: Boolean(manifest),
    manifestPath,
    manifest: manifest || null
  };
}

function buildQuarantine(quality) {
  const issues = Array.isArray(quality?.issues) ? quality.issues : [];
  const rows = issues
    .filter((issue) => (
      issue.type === 'api_sum_above_aggregate'
      || (issue.type === 'api_sku_unmapped' && numberOrZero(issue.revenue) >= 100000)
    ))
    .slice(0, 300)
    .map((issue) => ({
      type: issue.type || '',
      severity: issue.severity || '',
      platform: issue.platform || '',
      platformLabel: issue.platformLabel || issue.platform || '',
      articleKey: issue.articleKey || '',
      name: issue.name || '',
      revenue: Math.round(numberOrZero(issue.revenue)),
      aggregateRevenue: Math.round(numberOrZero(issue.aggregateRevenue)),
      overage: Math.round(numberOrZero(issue.overage)),
      units: Math.round(numberOrZero(issue.units)),
      message: issue.message || ''
    }));
  return {
    schema: 'portal-data-quarantine-v1',
    generatedAt: new Date().toISOString(),
    reason: 'Rows that need review before the data contour can be trusted.',
    summary: {
      rows: rows.length,
      revenue: rows.reduce((sum, row) => sum + numberOrZero(row.revenue), 0),
      overage: rows.reduce((sum, row) => sum + numberOrZero(row.overage), 0),
      apiSumAboveAggregateCount: rows.filter((row) => row.type === 'api_sum_above_aggregate').length,
      apiUnmappedHighRevenueCount: rows.filter((row) => row.type === 'api_sku_unmapped').length
    },
    rows
  };
}

function buildHealth(options) {
  const snapshots = Object.fromEntries(SNAPSHOT_NAMES.map((name) => {
    const snapshot = readSnapshot(options, name);
    return [name, snapshot.payload];
  }));
  const sources = Object.fromEntries(SNAPSHOT_NAMES.map((name) => [name, snapshotMetric(name, snapshots[name])]));
  const quality = snapshots.portal_data_quality || {};
  const qualitySummary = quality.summary || {};
  const quarantine = buildQuarantine(quality);
  const blockingReasons = [];
  const warnings = [];
  const checks = [];
  const syncIssues = loadSyncIssues(options);

  syncIssues.issues.forEach((issue) => {
    const label = issue.name || issue.id;
    const suffix = issue.message ? `: ${issue.message}` : '';
    const message = `Non-blocking sync step failed: ${label}${suffix}.`;
    warnings.push(message);
    checks.push({
      name: `sync-step:${issue.id}`,
      status: 'warning',
      message,
      failedAt: issue.failedAt
    });
  });

  REQUIRED_SNAPSHOTS.forEach((name) => {
    const metric = sources[name];
    const ok = metric.exists && metric.rows > 0;
    checks.push({ name: `required:${name}`, status: ok ? 'ok' : 'blocked', rows: metric.rows });
    if (!ok) blockingReasons.push(`Required snapshot ${name} is missing or empty.`);
  });

  const aliasCount = activeAliasCount(snapshots.sku_aliases || {});
  const ignoreCount = activeIgnoreCount(snapshots.sku_alias_ignore || {});
  const matrixAliasCount = numberOrZero(snapshots.sku_matrix?.summary?.aliasCount);
  const matrixIgnoreCount = numberOrZero(snapshots.sku_matrix?.summary?.ignoredApiSkuCount);
  const matrixStamp = parseStamp(sources.sku_matrix?.generatedAt || sources.sku_matrix?.asOfDate);
  const aliasStamp = parseStamp(sources.sku_aliases?.generatedAt || sources.sku_aliases?.asOfDate);
  const ignoreStamp = parseStamp(sources.sku_alias_ignore?.generatedAt || sources.sku_alias_ignore?.asOfDate);
  const qualityStamp = parseStamp(sources.portal_data_quality?.generatedAt || sources.portal_data_quality?.asOfDate);
  const skuContour = {
    status: 'ok',
    aliasCount,
    ignoreCount,
    matrixAliasCount,
    matrixIgnoreCount,
    checks: []
  };
  const addSkuContourCheck = (name, ok, message, severity = 'blocked', extra = {}) => {
    const status = ok ? 'ok' : severity;
    skuContour.checks.push({ name, status, message, ...extra });
    checks.push({ name: `sku-contour:${name}`, status, message, ...extra });
    if (!ok && severity === 'blocked') blockingReasons.push(message);
    if (!ok && severity !== 'blocked') warnings.push(message);
  };
  addSkuContourCheck('aliases-present', Boolean(sources.sku_aliases?.exists), 'SKU alias snapshot is missing; resolved API SKU mappings may return to the queue.');
  addSkuContourCheck('ignore-present', Boolean(sources.sku_alias_ignore?.exists), 'SKU ignore snapshot is missing; ignored API SKU values may return to the queue.');
  addSkuContourCheck('matrix-present', Boolean(sources.sku_matrix?.exists), 'SKU matrix snapshot is missing; alias/ignore decisions cannot be applied to portal views.');
  addSkuContourCheck(
    'matrix-alias-count',
    matrixAliasCount === aliasCount,
    `SKU matrix alias count does not match sku_aliases (${matrixAliasCount}/${aliasCount}).`,
    'blocked',
    { matrixAliasCount, aliasCount }
  );
  addSkuContourCheck(
    'matrix-ignore-count',
    matrixIgnoreCount === ignoreCount,
    `SKU matrix ignore count does not match sku_alias_ignore (${matrixIgnoreCount}/${ignoreCount}).`,
    'blocked',
    { matrixIgnoreCount, ignoreCount }
  );
  if ((aliasCount || ignoreCount) && Math.max(aliasStamp, ignoreStamp) && matrixStamp && matrixStamp < Math.max(aliasStamp, ignoreStamp)) {
    addSkuContourCheck('matrix-after-decisions', false, 'SKU matrix is older than sku_aliases/sku_alias_ignore; applied decisions may not affect today reports.');
  } else {
    addSkuContourCheck('matrix-after-decisions', true, 'SKU matrix is not older than alias/ignore decisions.');
  }
  if (qualityStamp && matrixStamp && matrixStamp + 300000 < qualityStamp) {
    addSkuContourCheck('matrix-after-quality', false, 'SKU matrix is older than portal_data_quality; SKU contour may show stale unresolved issues.', 'warning');
  } else {
    addSkuContourCheck('matrix-after-quality', true, 'SKU matrix is aligned with portal_data_quality.');
  }
  skuContour.status = skuContour.checks.some((check) => check.status === 'blocked')
    ? 'blocked'
    : skuContour.checks.some((check) => check.status === 'warning')
      ? 'warning'
      : 'ok';

  if (numberOrZero(qualitySummary.apiSumAboveAggregateCount) > 0) {
    blockingReasons.push(`API SKU sum is above marketplace aggregate for ${qualitySummary.apiSumAboveAggregateCount} platform(s).`);
  }
  if (numberOrZero(qualitySummary.apiSumAboveAggregateOverage) > 0) {
    warnings.push(`Potential duplicated revenue overage: ${Math.round(numberOrZero(qualitySummary.apiSumAboveAggregateOverage))}.`);
  }
  if (numberOrZero(qualitySummary.apiUnmappedRevenue) > 0) {
    warnings.push(`Unmapped API SKU revenue: ${Math.round(numberOrZero(qualitySummary.apiUnmappedRevenue))}.`);
  }
  if (numberOrZero(qualitySummary.skuMissingOwner) > 0) {
    warnings.push(`SKU without owner or registry mapping: ${Math.round(numberOrZero(qualitySummary.skuMissingOwner))}.`);
  }
  if (!sources.oos_control?.exists || sources.oos_control.rows <= 0) {
    warnings.push('OOS control snapshot is missing or empty; daily OOS queue will not be visible.');
  }

  const maxDate = qualitySummary.maxDate || sources.platform_trends.asOfDate || sources.dashboard.asOfDate;
  const completenessGuard = buildCompletenessGuard(options, snapshots, maxDate);
  for (const reason of completenessGuard.blockingReasons) blockingReasons.push(reason);
  for (const warning of completenessGuard.warnings) warnings.push(warning);
  for (const check of completenessGuard.checks) {
    checks.push({ name: `freshness-completeness:${check.platform}`, status: check.status, ...check });
  }
  const dependencyGuard = buildFreshnessDependencyGuard(options, snapshots, completenessGuard.expectedDate);
  for (const reason of dependencyGuard.blockingReasons) blockingReasons.push(reason);
  for (const warning of dependencyGuard.warnings) warnings.push(warning);
  for (const check of dependencyGuard.checks) {
    checks.push({ name: `freshness-dependency:${check.name}`, status: check.status, ...check });
  }
  const maxDateAge = daysOld(maxDate, options.now);
  if (maxDateAge !== null && maxDateAge > options.staleWarnDays) {
    warnings.push(`Marketplace data looks stale: ${maxDate}, ${maxDateAge} day(s) old.`);
  }

  const lastGood = loadLastGoodManifest(options);
  const comparisons = [];
  if (lastGood.exists && lastGood.manifest?.metrics) {
    ['skus', 'platform_trends', 'order_procurement', 'warehouse_stock_overlay', 'sku_matrix', 'oos_control'].forEach((name) => {
      const current = sources[name] || {};
      const previous = lastGood.manifest.metrics[name] || {};
      const previousRows = numberOrZero(previous.rows);
      const previousRevenue = numberOrZero(previous.revenue);
      const currentRows = numberOrZero(current.rows);
      const currentRevenue = numberOrZero(current.revenue);
      const rowRatio = previousRows > 0 ? currentRows / previousRows : 1;
      const revenueRatio = previousRevenue > 0 ? currentRevenue / previousRevenue : 1;
      const comparison = {
        snapshot: name,
        rows: currentRows,
        previousRows,
        rowRatio,
        revenue: currentRevenue,
        previousRevenue,
        revenueRatio
      };
      comparisons.push(comparison);
      if (previousRows >= 20 && rowRatio < options.minRowsRatio) {
        blockingReasons.push(`Snapshot ${name} row count collapsed vs last good (${currentRows}/${previousRows}).`);
      }
      if (previousRevenue >= 100000 && currentRevenue > 0 && revenueRatio < options.minRevenueRatio) {
        blockingReasons.push(`Snapshot ${name} revenue collapsed vs last good (${currentRevenue}/${previousRevenue}).`);
      }
    });
  }

  const allowed = blockingReasons.length === 0;
  const status = allowed ? (warnings.length ? 'warning' : 'ok') : 'blocked';
  const health = {
    schema: 'portal-sync-health-v1',
    generatedAt: new Date().toISOString(),
    status,
    publish: {
      allowed,
      blockingReasons,
      warnings,
      checkedAt: new Date().toISOString()
    },
    freshness: {
      maxDate,
      maxDateAgeDays: maxDateAge,
      expectedDate: completenessGuard.expectedDate,
      completenessGuard,
      dependencyGuard
    },
    sources,
    syncIssues,
    skuContour,
    quality: qualitySummary,
    apiReconciliation: {
      blocked: numberOrZero(qualitySummary.apiSumAboveAggregateCount) > 0,
      count: numberOrZero(qualitySummary.apiSumAboveAggregateCount),
      overage: Math.round(numberOrZero(qualitySummary.apiSumAboveAggregateOverage))
    },
    quarantine: quarantine.summary,
    lastGood: {
      exists: lastGood.exists,
      generatedAt: lastGood.manifest?.generatedAt || '',
      comparisons
    },
    checks
  };
  return { health, quarantine, snapshots };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeSummary(filePath, health) {
  const lines = [
    `Portal sync health: ${health.status}`,
    `Generated: ${health.generatedAt}`,
    `Publish allowed: ${health.publish.allowed ? 'yes' : 'no'}`,
    `Max data date: ${health.freshness.maxDate || 'unknown'}`,
    '',
    'Blocking reasons:',
    ...(health.publish.blockingReasons.length ? health.publish.blockingReasons.map((item) => `- ${item}`) : ['- none']),
    '',
    'Warnings:',
    ...(health.publish.warnings.length ? health.publish.warnings.map((item) => `- ${item}`) : ['- none'])
  ];
  fs.writeFileSync(filePath, `${lines.join('\r\n')}\r\n`, 'utf8');
}

function mirrorOutput(options, files) {
  if (!options.mirrorLocalFallback) return [];
  fs.mkdirSync(options.baseDataDir, { recursive: true });
  return files.map((filePath) => {
    const target = path.join(options.baseDataDir, path.basename(filePath));
    fs.copyFileSync(filePath, target);
    return target;
  });
}

function markLastGood(options, health) {
  if (!options.markLastGood || !health.publish.allowed) return null;
  fs.mkdirSync(options.lastGoodDir, { recursive: true });
  const copied = [];
  SNAPSHOT_NAMES.forEach((name) => {
    const source = path.join(options.outputDir, `${name}.json`);
    if (!fs.existsSync(source)) return;
    const target = path.join(options.lastGoodDir, `${name}.json`);
    fs.copyFileSync(source, target);
    copied.push(`${name}.json`);
  });
  const metrics = Object.fromEntries(SNAPSHOT_NAMES.map((name) => {
    const payload = readJsonIfExists(path.join(options.outputDir, `${name}.json`));
    return [name, snapshotMetric(name, payload)];
  }));
  const manifest = {
    schema: 'portal-last-good-manifest-v1',
    generatedAt: new Date().toISOString(),
    healthStatus: health.status,
    copied,
    metrics
  };
  writeJson(path.join(options.lastGoodDir, LAST_GOOD_MANIFEST), manifest);
  return manifest;
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const { health, quarantine } = buildHealth(options);
  const healthPath = path.join(options.outputDir, 'portal_sync_health.json');
  const quarantinePath = path.join(options.outputDir, 'portal_data_quarantine.json');
  const summaryPath = path.join(options.outputDir, 'portal_sync_summary.txt');
  const lastGoodManifest = markLastGood(options, health);
  if (lastGoodManifest) {
    health.lastGood.markedAt = lastGoodManifest.generatedAt;
    health.lastGood.copied = lastGoodManifest.copied.length;
  }
  writeJson(healthPath, health);
  writeJson(quarantinePath, quarantine);
  writeSummary(summaryPath, health);
  const mirrored = mirrorOutput(options, [healthPath, quarantinePath, summaryPath]);
  console.log(JSON.stringify({
    status: health.status,
    publishAllowed: health.publish.allowed,
    blockingReasons: health.publish.blockingReasons,
    warnings: health.publish.warnings,
    output: { healthPath, quarantinePath, summaryPath, mirrored },
    lastGoodMarked: Boolean(lastGoodManifest)
  }, null, 2));
}

main();
