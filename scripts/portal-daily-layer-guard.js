#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPORT_FILE = 'portal_daily_guard.json';
const RECONCILIATION_FILE = 'portal_metric_reconciliation.json';
const PHASE3_REQUIRED_REPORTS = [
  'portal_repricing_reconciliation.json',
  'portal_dashboard_reconciliation.json',
  'portal_plan_reconciliation.json',
  'portal_indicator_audit.json',
  'portal_upload_apply_e2e.json',
  'portal_minmax_upload_reconciliation.json',
  'portal_cost_upload_reconciliation.json',
  'portal_runtime_wiring_reconciliation.json',
  'portal_feature_readiness.json'
];
const DEFAULT_MANIFEST = path.join(__dirname, 'portal-truth-manifest.json');
const MOJIBAKE_MARKERS = ['Рџ', 'РЎ', 'Р°С', 'РµС', 'РёС', 'Р»С', 'РЅС', 'Р”', 'Рќ', 'Р’', '���', '\uFFFD'];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const equalIndex = token.indexOf('=');
    const key = token.slice(2, equalIndex >= 0 ? equalIndex : undefined);
    if (equalIndex >= 0) {
      args[key] = token.slice(equalIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function dateKey(value) {
  if (!value) return '';
  const raw = String(value);
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function getPathValue(object, dottedPath) {
  return String(dottedPath || '').split('.').filter(Boolean).reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return Object.prototype.hasOwnProperty.call(Object(current), key) ? current[key] : undefined;
  }, object);
}

function firstDate(payload, paths = []) {
  for (const dottedPath of paths) {
    const value = getPathValue(payload, dottedPath);
    const parsed = dateKey(value);
    if (parsed) return { date: parsed, path: dottedPath, raw: value };
  }
  return { date: '', path: '', raw: '' };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value));
}

function sizeOf(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  if (typeof value === 'string') return value.trim() ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return 0;
}

function normalizedText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function worstStatus(statuses) {
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('warning')) return 'warning';
  if (statuses.includes('missing')) return 'missing';
  return 'ok';
}

function moneyMatches(left, right, policy) {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  if (a === null || b === null) return false;
  const delta = Math.abs(a - b);
  const relativeBase = Math.max(Math.abs(a), Math.abs(b), 1);
  return delta <= Number(policy.moneyToleranceAbsolute || 0)
    || delta / relativeBase <= Number(policy.moneyToleranceRelative || 0);
}

function resolveOptions(args) {
  const root = process.cwd();
  const inputDir = path.resolve(args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output'));
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(root, 'data'));
  return {
    inputDir,
    baseDataDir,
    outputDir: path.resolve(args['output-dir'] || inputDir),
    manifestPath: path.resolve(args.manifest || DEFAULT_MANIFEST),
    syncIssuesPath: path.resolve(args['sync-issues'] || path.join(inputDir, 'portal_sync_issues.json')),
    expectedDate: dateKey(args['expected-date']),
    expectedRunDate: dateKey(args['expected-run-date']) || (dateKey(args['expected-date']) ? localDateKey(0) : ''),
    explicitExpectedDate: Boolean(dateKey(args['expected-date'])),
    noFail: Boolean(args['no-fail']),
    noWrite: Boolean(args['no-write']),
    mirrorLocalFallback: Boolean(args['mirror-local-fallback'])
  };
}

function resolveSourceFile(source, options) {
  const inputPath = path.join(options.inputDir, source.file);
  const basePath = path.join(options.baseDataDir, source.file);
  if (path.basename(options.inputDir) === '.portal-truth-output') {
    if (fs.existsSync(basePath)) return { filePath: basePath, origin: 'base-data' };
    if (fs.existsSync(inputPath)) return { filePath: inputPath, origin: 'truth-output-fallback' };
  }
  if (fs.existsSync(inputPath)) return { filePath: inputPath, origin: 'input' };
  if (fs.existsSync(basePath)) return { filePath: basePath, origin: 'base-fallback' };
  return { filePath: inputPath, origin: 'missing' };
}

function isExcluded(value, manifest) {
  const text = normalizedText(value).replace(/_/g, '-');
  return (manifest.policy.excludedScopes || []).some((scope) => {
    const needle = normalizedText(scope).replace(/_/g, '-');
    return text === needle || text.startsWith(`${needle}-`) || text.includes(`/${needle}`);
  });
}

function loadSources(manifest, options) {
  const loaded = new Map();
  const checks = [];
  for (const source of manifest.sources || []) {
    if (isExcluded(source.key, manifest)) continue;
    const resolved = resolveSourceFile(source, options);
    const check = {
      id: `source:${source.key}`,
      scope: 'source',
      source: source.key,
      file: source.file,
      kind: source.kind,
      status: 'ok',
      warnings: [],
      blockingReasons: [],
      origin: resolved.origin
    };
    let payload = null;
    if (!fs.existsSync(resolved.filePath)) {
      check.status = source.required ? 'blocked' : 'missing';
      const message = `${source.key}: missing ${source.file}`;
      if (source.required) check.blockingReasons.push(message);
      else check.warnings.push(message);
      checks.push(check);
      loaded.set(source.key, { source, check, payload: null, filePath: resolved.filePath });
      continue;
    }
    try {
      const stats = fs.statSync(resolved.filePath);
      check.bytes = stats.size;
      check.mtime = stats.mtime.toISOString();
      check.sha256 = sha256(resolved.filePath);
      if (stats.size <= 2) throw new Error('file is empty');
      payload = readJson(resolved.filePath);
      const freshness = firstDate(payload, source.datePaths || []);
      check.dataDate = freshness.date;
      check.dataDatePath = freshness.path;
      check.generatedAt = payload?.generatedAt || payload?.meta?.generatedAt || '';
      if (source.required && sizeOf(payload) === 0) check.blockingReasons.push(`${source.key}: JSON payload is empty`);
      const stagedRun = path.resolve(options.inputDir) !== path.resolve(options.baseDataDir);
      const reportOutputRun = path.basename(options.inputDir) === '.portal-truth-output';
      if (stagedRun && !reportOutputRun && resolved.origin === 'base-fallback' && source.required && ['daily', 'daily-build'].includes(source.freshness)) {
        check.blockingReasons.push(`${source.key}: staged output is missing; only the previous base snapshot is available`);
      }
      if (options.explicitExpectedDate && source.freshness === 'daily' && (!freshness.date || freshness.date < options.expectedDate)) {
        check.blockingReasons.push(`${source.key}: data date ${freshness.date || 'unknown'} is older than expected ${options.expectedDate}`);
      }
      if (options.expectedRunDate && source.freshness === 'daily-build') {
        const runDate = dateKey(check.generatedAt);
        if (!runDate || runDate < options.expectedRunDate) {
          check.blockingReasons.push(`${source.key}: build date ${runDate || 'unknown'} is older than expected run date ${options.expectedRunDate}`);
        }
      }
      const maxAgeMatch = String(source.freshness || '').match(/^max-age-(\d+)d$/);
      if (maxAgeMatch && freshness.date) {
        const reference = new Date(`${options.expectedRunDate || localDateKey(0)}T00:00:00Z`);
        const sourceDate = new Date(`${freshness.date}T00:00:00Z`);
        const ageDays = Math.floor((reference - sourceDate) / 86400000);
        check.ageDays = ageDays;
        if (ageDays > Number(maxAgeMatch[1])) check.blockingReasons.push(`${source.key}: snapshot age ${ageDays} days exceeds ${maxAgeMatch[1]} days`);
      }
    } catch (error) {
      check.blockingReasons.push(`${source.key}: cannot read ${source.file}: ${error.message}`);
    }
    check.status = check.blockingReasons.length ? 'blocked' : (check.warnings.length ? 'warning' : 'ok');
    checks.push(check);
    loaded.set(source.key, { source, check, payload, filePath: resolved.filePath });
  }
  return { loaded, checks };
}

function inferExpectedDate(loaded, explicit) {
  if (explicit) return explicit;
  const candidates = ['platform_fact', 'dashboard_projection', 'ads_fact', 'warehouse_fact', 'data_quality']
    .map((key) => loaded.get(key)?.check?.dataDate)
    .filter(Boolean)
    .sort();
  return candidates[candidates.length - 1] || localDateKey(-1);
}

function addCheck(checks, check) {
  check.warnings = check.warnings || [];
  check.blockingReasons = check.blockingReasons || [];
  check.status = check.blockingReasons.length ? 'blocked' : (check.warnings.length ? 'warning' : 'ok');
  checks.push(check);
  return check;
}

function currentMonthPlan(companyPlan, expectedDate) {
  const monthKey = String(expectedDate || companyPlan?.activeMonthKey || '').slice(0, 7);
  const months = companyPlan?.months || {};
  const resolvedMonth = months[monthKey]
    ? monthKey
    : (companyPlan?.activeMonthKey && months[companyPlan.activeMonthKey]
      ? companyPlan.activeMonthKey
      : Object.keys(months).sort().pop());
  return { monthKey: resolvedMonth || monthKey, month: months[resolvedMonth] || null };
}

function dashboardCompanyPlan(dashboard) {
  return dashboard?.companyPlan || dashboard?.plan?.companyPlan || dashboard?.data?.companyPlan || null;
}

function dashboardPlanMonth(dashboard, monthKey) {
  const embedded = dashboardCompanyPlan(dashboard);
  if (embedded) {
    const resolved = currentMonthPlan(embedded, monthKey);
    if (resolved.month) return resolved.month;
  }
  const control = dashboard?.dataFreshness?.salaryPlanControlTotals?.[monthKey];
  if (!control) return null;
  return {
    revenue: control.revenue,
    channels: {
      wb: { revenue: control.wb },
      ozon: { revenue: control.ozon },
      ya: { revenue: control.ya }
    }
  };
}

function inspectCompanyPlan(loaded, policy, expectedDate, checks, passports) {
  const companyPlan = loaded.get('company_plan')?.payload;
  const dashboard = loaded.get('dashboard_projection')?.payload;
  const check = { id: 'contract:company-plan', scope: 'plan', source: 'company_plan', warnings: [], blockingReasons: [] };
  if (!companyPlan) return addCheck(checks, { ...check, blockingReasons: ['company_plan: payload is unavailable'] });
  const { monthKey, month } = currentMonthPlan(companyPlan, expectedDate);
  check.monthKey = monthKey;
  if (!month) {
    check.blockingReasons.push(`company_plan: no plan for ${monthKey || 'selected month'}`);
    return addCheck(checks, check);
  }
  const total = roundMoney(month.revenue);
  const channelValues = ['wb', 'ozon', 'ya'].map((key) => roundMoney(month.channels?.[key]?.revenue));
  const channelSum = channelValues.reduce((sum, value) => sum + value, 0);
  check.totalRevenue = total;
  check.channelRevenueSum = channelSum;
  check.channels = { wb: channelValues[0], ozon: channelValues[1], ya: channelValues[2] };
  if (!moneyMatches(total, channelSum, policy)) {
    check.blockingReasons.push(`company_plan: month total ${total} does not equal WB+Ozon+Yandex ${channelSum}`);
  }
  passports.push(
    { key: 'plan.marketplace.revenue', source: 'company_plan.json', period: monthKey, value: total, formula: 'months[month].revenue' },
    { key: 'plan.marketplace.revenue.wb', source: 'company_plan.json', period: monthKey, value: channelValues[0], formula: 'months[month].channels.wb.revenue' },
    { key: 'plan.marketplace.revenue.ozon', source: 'company_plan.json', period: monthKey, value: channelValues[1], formula: 'months[month].channels.ozon.revenue' },
    { key: 'plan.marketplace.revenue.ya', source: 'company_plan.json', period: monthKey, value: channelValues[2], formula: 'months[month].channels.ya.revenue' }
  );

  const embeddedMonth = dashboardPlanMonth(dashboard, monthKey);
  if (!embeddedMonth) {
    check.warnings.push(`dashboard: embedded/control plan was not found for ${monthKey}; projection cannot be cross-checked`);
  } else {
    const embeddedTotal = roundMoney(embeddedMonth.revenue);
    check.dashboardEmbeddedRevenue = embeddedTotal;
    if (!moneyMatches(total, embeddedTotal, policy)) {
      check.blockingReasons.push(`dashboard: embedded plan ${embeddedTotal} differs from company_plan ${total}`);
    }
    for (const key of ['wb', 'ozon', 'ya']) {
      const master = roundMoney(month.channels?.[key]?.revenue);
      const projection = roundMoney(embeddedMonth.channels?.[key]?.revenue);
      if (!moneyMatches(master, projection, policy)) {
        check.blockingReasons.push(`dashboard: embedded ${key} plan ${projection} differs from company_plan ${master}`);
      }
    }
  }
  return addCheck(checks, check);
}

function platformCollection(payload) {
  const platforms = payload?.platforms;
  if (Array.isArray(platforms)) {
    return Object.fromEntries(platforms.map((item) => [normalizedText(item?.key || item?.platformKey || item?.platform), item]));
  }
  return platforms && typeof platforms === 'object' ? platforms : {};
}

function pointDate(point) {
  return dateKey(point?.date || point?.label || point?.day || point?.period);
}

function pointRevenue(point) {
  const paths = ['revenue', 'factRevenue', 'gmv', 'sales', 'ordersRevenue', 'amount', 'value', 'turnover'];
  for (const key of paths) {
    const value = numberOrNull(point?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function latestPoint(platform, expectedDate) {
  const series = Array.isArray(platform?.series) ? platform.series : (Array.isArray(platform?.daily) ? platform.daily : []);
  const candidates = series
    .map((point) => ({ point, date: pointDate(point), revenue: pointRevenue(point) }))
    .filter((item) => item.date && item.revenue !== null && (!expectedDate || item.date <= expectedDate))
    .sort((left, right) => left.date.localeCompare(right.date));
  return candidates[candidates.length - 1] || null;
}

function inspectPlatformFact(loaded, policy, expectedDate, checks, passports) {
  const payload = loaded.get('platform_fact')?.payload;
  const check = { id: 'contract:platform-fact', scope: 'fact', source: 'platform_trends', warnings: [], blockingReasons: [] };
  if (!payload) return addCheck(checks, { ...check, blockingReasons: ['platform_trends: payload is unavailable'] });
  const platforms = platformCollection(payload);
  const points = {};
  for (const key of ['wb', 'ozon', 'ya', 'all']) {
    points[key] = latestPoint(platforms[key], expectedDate);
    if (key !== 'all' && !points[key]) check.blockingReasons.push(`platform_trends: ${key} has no numeric series point up to ${expectedDate}`);
  }
  const componentDates = ['wb', 'ozon', 'ya'].map((key) => points[key]?.date).filter(Boolean);
  const commonDate = componentDates.length === 3 && new Set(componentDates).size === 1 ? componentDates[0] : '';
  check.expectedDate = expectedDate;
  check.componentDates = Object.fromEntries(['wb', 'ozon', 'ya'].map((key) => [key, points[key]?.date || '']));
  if (!commonDate) {
    check.blockingReasons.push(`platform_trends: WB/Ozon/Yandex do not share one cutoff date (${componentDates.join(', ') || 'none'})`);
  }
  const componentSum = ['wb', 'ozon', 'ya'].reduce((sum, key) => sum + numberOrZero(points[key]?.revenue), 0);
  check.componentRevenue = Object.fromEntries(['wb', 'ozon', 'ya'].map((key) => [key, roundMoney(points[key]?.revenue)]));
  check.componentRevenueSum = roundMoney(componentSum);
  if (points.all && commonDate && points.all.date === commonDate) {
    check.allRevenue = roundMoney(points.all.revenue);
    if (!moneyMatches(componentSum, points.all.revenue, policy)) {
      check.blockingReasons.push(`platform_trends: all=${roundMoney(points.all.revenue)} differs from WB+Ozon+Yandex=${roundMoney(componentSum)}`);
    }
  } else if (points.all) {
    check.warnings.push(`platform_trends: all series date ${points.all.date} differs from component cutoff ${commonDate || 'mixed'}`);
  } else {
    check.warnings.push('platform_trends: all series is absent; total is computed from WB+Ozon+Yandex');
  }
  passports.push(
    { key: 'fact.marketplace.revenue', source: 'platform_trends.json', period: commonDate || expectedDate, value: roundMoney(componentSum), formula: 'WB + Ozon + Yandex on one common cutoff date' },
    ...['wb', 'ozon', 'ya'].map((key) => ({
      key: `fact.marketplace.revenue.${key}`,
      source: 'platform_trends.json',
      period: points[key]?.date || '',
      value: roundMoney(points[key]?.revenue),
      formula: `platforms.${key}.series[cutoff].revenue`
    }))
  );
  return addCheck(checks, check);
}

function cardLabel(card) {
  return card?.id || card?.key || card?.label || card?.title || card?.name || '';
}

function cardSignature(card) {
  return stableStringify({
    id: normalizedText(card?.id || card?.key || ''),
    label: normalizedText(cardLabel(card)),
    value: card?.value ?? card?.amount ?? card?.number ?? null,
    format: normalizedText(card?.format || card?.type || ''),
    period: normalizedText(card?.period || card?.date || '')
  });
}

function countMojibake(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return MOJIBAKE_MARKERS.reduce((sum, marker) => sum + (text.split(marker).length - 1), 0);
}

function inspectDashboard(loaded, policy, checks, passports) {
  const payload = loaded.get('dashboard_projection')?.payload;
  const check = { id: 'contract:dashboard', scope: 'dashboard', source: 'dashboard', warnings: [], blockingReasons: [] };
  if (!payload) return addCheck(checks, { ...check, blockingReasons: ['dashboard: payload is unavailable'] });
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const signatures = new Map();
  const labels = new Map();
  for (const card of cards) {
    const signature = cardSignature(card);
    signatures.set(signature, (signatures.get(signature) || 0) + 1);
    const semanticKey = normalizedText(card?.id || card?.key || cardLabel(card));
    if (!labels.has(semanticKey)) labels.set(semanticKey, { count: 0, values: new Set() });
    const group = labels.get(semanticKey);
    group.count += 1;
    group.values.add(stableStringify(card?.value ?? card?.amount ?? card?.number ?? null));
  }
  const exactDuplicateRows = [...signatures.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const semanticDuplicateRows = [...labels.values()].reduce((sum, group) => sum + Math.max(0, group.count - 1), 0);
  const conflictingLabels = [...labels.entries()]
    .filter(([, group]) => group.values.size > 1)
    .map(([label, group]) => ({ label, variants: group.values.size, rows: group.count }));
  const duplicateRatio = cards.length ? semanticDuplicateRows / cards.length : 0;
  const mojibakeCount = countMojibake(cards.map((card) => cardLabel(card)));
  check.cardsCount = cards.length;
  check.uniqueCardSignatures = signatures.size;
  check.uniqueSemanticCards = labels.size;
  check.exactDuplicateRows = exactDuplicateRows;
  check.semanticDuplicateRows = semanticDuplicateRows;
  check.duplicateRows = semanticDuplicateRows;
  check.duplicateRatio = Number(duplicateRatio.toFixed(4));
  check.conflictingLabelCount = conflictingLabels.length;
  check.conflictingLabelSample = conflictingLabels.slice(0, 20);
  check.mojibakeCount = mojibakeCount;
  if (!cards.length) check.blockingReasons.push('dashboard: cards are empty');
  if (cards.length > Number(policy.dashboardCardHardLimit || 160)) {
    check.blockingReasons.push(`dashboard: ${cards.length} cards exceeds hard limit ${policy.dashboardCardHardLimit}`);
  } else if (cards.length > Number(policy.dashboardCardSoftLimit || 80)) {
    check.warnings.push(`dashboard: ${cards.length} cards exceeds soft limit ${policy.dashboardCardSoftLimit}`);
  }
  if (duplicateRatio >= Number(policy.dashboardDuplicateRatioBlock || 0.1)) {
    check.blockingReasons.push(`dashboard: duplicate card ratio ${(duplicateRatio * 100).toFixed(1)}% exceeds allowed threshold`);
  } else if (semanticDuplicateRows > 0) {
    check.warnings.push(`dashboard: ${semanticDuplicateRows} repeated semantic card rows detected`);
  }
  if (conflictingLabels.length) {
    check.blockingReasons.push(`dashboard: ${conflictingLabels.length} card labels contain conflicting values`);
  }
  if (mojibakeCount > Number(policy.mojibakeBlockCount || 5)) {
    check.blockingReasons.push(`dashboard: ${mojibakeCount} mojibake markers detected in card labels`);
  } else if (mojibakeCount > 0) {
    check.warnings.push(`dashboard: ${mojibakeCount} mojibake markers detected`);
  }
  passports.push({
    key: 'dashboard.cards',
    source: 'dashboard.json',
    period: loaded.get('dashboard_projection')?.check?.dataDate || '',
    value: cards.length,
    formula: 'count(unique presentation cards); exact duplicates are forbidden',
    diagnostics: { exactDuplicateRows, semanticDuplicateRows, duplicateRatio, conflictingLabelCount: conflictingLabels.length, mojibakeCount }
  });
  return addCheck(checks, check);
}

function skuRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['skus', 'rows', 'items', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function ownerAssignments(row) {
  const assignments = [];
  const add = (scope, value) => {
    const text = typeof value === 'object' ? value?.name : value;
    const name = String(text || '').trim();
    if (name && !['без owner', 'не в реестре', 'unknown', '—', '-'].includes(normalizedText(name))) {
      assignments.push({ scope: normalizedText(scope || 'default') || 'default', name });
    }
  };
  add('default', row?.owner);
  for (const [platform, value] of Object.entries(row?.ownersByPlatform || {})) add(platform, value);
  for (const [platform, value] of Object.entries(row?.owner?.byPlatform || {})) add(platform, value);
  const unique = new Map(assignments.map((item) => [`${item.scope}|${item.name}`, item]));
  return [...unique.values()];
}

function ownerNames(row) {
  return [...new Set(ownerAssignments(row).map((item) => item.name))];
}

function skuKey(row) {
  return String(row?.articleKey || row?.article || row?.vendorCode || row?.sellerArticle || row?.sku || row?.nmId || '').trim();
}

function inspectOwners(loaded, policy, checks, passports) {
  const payload = loaded.get('sku_registry')?.payload;
  const check = { id: 'contract:owners', scope: 'executive', source: 'skus', warnings: [], blockingReasons: [] };
  if (!payload) return addCheck(checks, { ...check, blockingReasons: ['skus: payload is unavailable'] });
  const rows = skuRows(payload);
  const active = rows.filter((row) => !['archived', 'inactive', 'deleted'].includes(normalizedText(row?.status || row?.lifecycleStatus)));
  const denominator = active.length || rows.length;
  const assigned = active.filter((row) => ownerNames(row).length > 0).length;
  const coverage = denominator ? assigned / denominator : 0;
  const ownerSet = new Set(active.flatMap(ownerNames));
  const conflictingOwners = [];
  const ownerBySkuScope = new Map();
  for (const row of active) {
    const key = skuKey(row);
    if (!key) continue;
    for (const assignment of ownerAssignments(row)) {
      const scopedKey = `${key}|${assignment.scope}`;
      if (!ownerBySkuScope.has(scopedKey)) ownerBySkuScope.set(scopedKey, new Set());
      ownerBySkuScope.get(scopedKey).add(assignment.name);
    }
  }
  for (const [scopedKey, names] of ownerBySkuScope.entries()) {
    if (names.size > 1) {
      const splitAt = scopedKey.lastIndexOf('|');
      conflictingOwners.push({ sku: scopedKey.slice(0, splitAt), scope: scopedKey.slice(splitAt + 1), owners: [...names].sort() });
    }
  }
  const suspicious = [...ownerSet].filter((name) => countMojibake(name) > 0 || normalizedText(name).length < 2);
  check.rows = rows.length;
  check.activeRows = denominator;
  check.assignedRows = assigned;
  check.coverage = Number(coverage.toFixed(4));
  check.ownerCount = ownerSet.size;
  check.conflictingSkuCount = conflictingOwners.length;
  check.conflictingSkuSample = conflictingOwners.slice(0, 20);
  check.suspiciousOwners = suspicious;
  if (!denominator) check.blockingReasons.push('skus: no active SKU rows found');
  if (coverage < Number(policy.ownerCoverageBlock || 0.65)) {
    check.blockingReasons.push(`owners: coverage ${(coverage * 100).toFixed(1)}% is below blocking threshold`);
  } else if (coverage < Number(policy.ownerCoverageWarn || 0.9)) {
    check.warnings.push(`owners: coverage ${(coverage * 100).toFixed(1)}% is below target`);
  }
  if (conflictingOwners.length) {
    check.blockingReasons.push(`owners: ${conflictingOwners.length} SKU keys have conflicting canonical owners`);
  }
  if (suspicious.length) check.blockingReasons.push(`owners: suspicious or mojibake owner names: ${suspicious.slice(0, 8).join(', ')}`);
  passports.push({
    key: 'owner.coverage',
    source: 'skus.json',
    period: loaded.get('sku_registry')?.check?.dataDate || '',
    value: coverage,
    formula: 'active SKU with canonical owner / active SKU',
    diagnostics: { activeRows: denominator, assignedRows: assigned, ownerCount: ownerSet.size, conflictingSkuCount: conflictingOwners.length }
  });
  return addCheck(checks, check);
}

function inspectDataQuality(loaded, policy, checks, passports) {
  const payload = loaded.get('data_quality')?.payload;
  const check = { id: 'contract:data-quality', scope: 'quality', source: 'portal_data_quality', warnings: [], blockingReasons: [] };
  if (!payload) return addCheck(checks, { ...check, blockingReasons: ['portal_data_quality: payload is unavailable'] });
  const summary = payload.summary || {};
  const status = normalizedText(payload.status || summary.status || '');
  const critical = numberOrZero(summary.criticalCount ?? summary.criticalIssues ?? summary.blockingIssues ?? payload.criticalIssues);
  const platformRows = Object.values(payload.platformSummary || {});
  const inferredTotalFact = platformRows.reduce((sum, item) => sum + numberOrZero(item?.directRevenue), 0);
  const totalFact = numberOrZero(summary.totalApiRevenue ?? summary.apiRevenue ?? summary.directRevenue) || inferredTotalFact;
  const unmapped = numberOrZero(summary.apiUnmappedRevenue ?? summary.unmappedRevenue);
  const knownOutsideRegistry = numberOrZero(summary.apiKnownOutsideRegistryRevenue ?? summary.knownOutsideRegistryRevenue);
  const unmappedRatio = totalFact > 0 ? unmapped / totalFact : 0;
  check.reportStatus = status;
  check.criticalIssues = critical;
  check.unmappedRevenue = roundMoney(unmapped);
  check.knownOutsideRegistryRevenue = roundMoney(knownOutsideRegistry);
  check.unmappedRevenueRatio = Number(unmappedRatio.toFixed(6));
  if (status === 'critical' || status === 'blocked' || critical > 0) {
    check.blockingReasons.push(`portal_data_quality: blocking status ${status || 'unknown'}, critical issues ${critical}`);
  } else if (status === 'warning' || numberOrZero(summary.issueCount) > 0) {
    check.warnings.push(`portal_data_quality: status ${status || 'warning'}, ${numberOrZero(summary.issueCount)} recorded issues`);
  }
  if (unmappedRatio >= Number(policy.unmappedRevenueBlockRatio || 0.02)) {
    check.blockingReasons.push(`portal_data_quality: unmapped revenue ${(unmappedRatio * 100).toFixed(2)}% exceeds blocking threshold`);
  } else if (unmappedRatio >= Number(policy.unmappedRevenueWarnRatio || 0.005)) {
    check.warnings.push(`portal_data_quality: unmapped revenue ${(unmappedRatio * 100).toFixed(2)}% exceeds warning threshold`);
  }
  passports.push({
    key: 'quality.unmappedRevenue',
    source: 'portal_data_quality.json',
    period: dateKey(payload.summary?.maxDate || payload.maxDate || payload.generatedAt),
    value: roundMoney(unmapped),
    formula: 'API fact that has no canonical registry mapping',
    diagnostics: { totalFact: roundMoney(totalFact), ratio: unmappedRatio, knownOutsideRegistryRevenue: roundMoney(knownOutsideRegistry) }
  });
  return addCheck(checks, check);
}

function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['rows', 'items', 'skus', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function platformKey(value = '') {
  const raw = normalizedText(value).replace(/[^a-zа-я0-9]+/gi, '');
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['ozon', 'oz'].includes(raw)) return 'ozon';
  if (['ym', 'ya', 'yandex', 'yandexmarket', 'яндекс', 'ямаркет'].includes(raw)) return 'ym';
  return raw || 'all';
}

function inspectOrderProcurement(loaded, policy, checks, passports) {
  const payload = loaded.get('order_procurement')?.payload;
  const wbPayload = loaded.get('order_procurement_wb')?.payload;
  const ozonPayload = loaded.get('order_procurement_ozon')?.payload;
  const ymPayload = loaded.get('order_procurement_ym')?.payload;
  const check = { id: 'contract:order-procurement-phase2', scope: 'order', source: 'order_procurement', warnings: [], blockingReasons: [] };
  if (!payload) return addCheck(checks, { ...check, blockingReasons: ['order_procurement: payload is unavailable'] });
  const rows = rowsOf(payload);
  const samples = [];
  const platformCounts = { wb: 0, ozon: 0, ym: 0 };
  let formulaErrors = 0;
  let horizonErrors = 0;
  let availableErrors = 0;
  let transitRows = 0;
  rows.forEach((row, index) => {
    const key = platformKey(row.platformKey || row.platform);
    if (Object.prototype.hasOwnProperty.call(platformCounts, key)) platformCounts[key] += 1;
    const inStock = numberOrZero(row.inStock);
    const inTransit = numberOrZero(row.inTransit);
    const inRequest = numberOrZero(row.inRequest);
    const available = inStock + inTransit + inRequest;
    const avgDaily = numberOrZero(row.avgDaily);
    const safetyStock = numberOrZero(row.safetyStock);
    const expectedRawNeed30 = avgDaily > 0 ? Math.ceil(avgDaily * 30 + safetyStock - available) : 0;
    const expectedTargetNeed30 = row.needSuppressedByLifecycle ? 0 : Math.max(0, expectedRawNeed30);
    if (inTransit > 0 || inRequest > 0) transitRows += 1;
    if (numberOrZero(row.available) !== available) {
      availableErrors += 1;
      if (samples.length < 10) samples.push({ index, article: row.article || row.articleKey, type: 'available', actual: row.available, expected: available });
    }
    if (numberOrZero(row.targetHorizonDays) !== 30 || row.targetNeed30 === undefined || row.rawNeed30 === undefined) {
      horizonErrors += 1;
      if (samples.length < 10) samples.push({ index, article: row.article || row.articleKey, type: 'horizon30', targetHorizonDays: row.targetHorizonDays });
    }
    if (numberOrZero(row.rawNeed30) !== expectedRawNeed30 || numberOrZero(row.targetNeed30) !== expectedTargetNeed30) {
      formulaErrors += 1;
      if (samples.length < 10) {
        samples.push({
          index,
          article: row.article || row.articleKey,
          type: 'need30',
          rawNeed30: row.rawNeed30,
          targetNeed30: row.targetNeed30,
          expectedRawNeed30,
          expectedTargetNeed30
        });
      }
    }
  });
  const ymRows = rowsOf(ymPayload);
  check.rows = rows.length;
  check.platformCounts = platformCounts;
  check.detailRows = {
    wb: rowsOf(wbPayload).length,
    ozon: rowsOf(ozonPayload).length,
    ym: ymRows.length
  };
  const detailHorizonErrors = [
    ...rowsOf(wbPayload),
    ...rowsOf(ozonPayload),
    ...ymRows
  ].filter((row) => row.targetNeed30 === undefined || row.rawNeed30 === undefined || numberOrZero(row.targetHorizonDays) !== 30);
  check.detailHorizonErrors = detailHorizonErrors.length;
  check.transitOrRequestRows = transitRows;
  check.availableErrors = availableErrors;
  check.horizonErrors = horizonErrors;
  check.formulaErrors = formulaErrors;
  check.sample = samples;
  if (!rows.length) check.blockingReasons.push('order_procurement: rows are empty');
  if (availableErrors) check.blockingReasons.push(`order_procurement: ${availableErrors} rows do not use available=inStock+inTransit+inRequest`);
  if (horizonErrors) check.blockingReasons.push(`order_procurement: ${horizonErrors} rows are missing canonical 30-day targetNeed30/rawNeed30`);
  if (formulaErrors) check.blockingReasons.push(`order_procurement: ${formulaErrors} rows fail need30 formula`);
  if (detailHorizonErrors.length) check.blockingReasons.push(`order_procurement: ${detailHorizonErrors.length} detail rows are missing canonical 30-day target fields`);
  if (ymRows.length && platformCounts.ym < ymRows.length) {
    check.blockingReasons.push(`order_procurement: combined layer has ${platformCounts.ym} Yandex rows, detail layer has ${ymRows.length}`);
  } else if (!ymRows.length) {
    check.warnings.push('order_procurement: Yandex detail layer has no rows to reconcile');
  }
  if (!transitRows) check.warnings.push('order_procurement: no rows with inTransit/inRequest were available for live fallback coverage');
  passports.push({
    key: 'order.targetNeed30',
    source: 'order_procurement.json',
    period: loaded.get('order_procurement')?.check?.dataDate || '',
    value: rows.reduce((sum, row) => sum + numberOrZero(row.targetNeed30), 0),
    formula: 'max(0, ceil(avgDaily * 30 + safetyStock - (inStock + inTransit + inRequest)))',
    diagnostics: { rows: rows.length, platformCounts, transitOrRequestRows: transitRows, formulaErrors, availableErrors }
  });
  return addCheck(checks, check);
}

function inspectOosControl(loaded, policy, checks, passports) {
  const payload = loaded.get('oos_control')?.payload;
  const check = { id: 'contract:oos-control-phase2', scope: 'oos', source: 'oos_control', warnings: [], blockingReasons: [] };
  if (!payload) return addCheck(checks, { ...check, blockingReasons: ['oos_control: payload is unavailable'] });
  const rows = rowsOf(payload);
  const badRows = rows.filter((row) => row.targetNeed30 === undefined || numberOrZero(row.targetHorizonDays || 30) !== 30);
  check.rows = rows.length;
  check.watchDays = numberOrZero(payload.rules?.watchDays);
  check.badRows = badRows.slice(0, 10).map((row) => ({ article: row.article || row.articleKey, targetHorizonDays: row.targetHorizonDays }));
  if (check.watchDays !== 30) check.blockingReasons.push(`oos_control: watchDays=${check.watchDays || 'unknown'}, expected 30`);
  if (badRows.length) check.blockingReasons.push(`oos_control: ${badRows.length} rows are missing 30-day target fields`);
  passports.push({
    key: 'oos.watchDays',
    source: 'oos_control.json',
    period: loaded.get('oos_control')?.check?.dataDate || '',
    value: check.watchDays,
    formula: 'OOS watch horizon must match order target horizon: 30 days',
    diagnostics: { rows: rows.length, badRows: badRows.length }
  });
  return addCheck(checks, check);
}

function embeddedAliasCountFromSkus(rows = []) {
  return rows.reduce((sum, sku) => {
    const aliases = Array.isArray(sku.aliases) ? sku.aliases.length : 0;
    const platformAliases = Object.values(sku.platformAliases || {}).reduce((count, value) => count + (Array.isArray(value) ? value.length : (value ? 1 : 0)), 0);
    return sum + aliases + platformAliases;
  }, 0);
}

function inspectSkuMatrix(loaded, policy, checks, passports) {
  const payload = loaded.get('sku_matrix')?.payload;
  const skuPayload = loaded.get('sku_registry')?.payload;
  const check = { id: 'contract:sku-matrix-phase2', scope: 'mapping', source: 'sku_matrix', warnings: [], blockingReasons: [] };
  if (!payload) return addCheck(checks, { ...check, blockingReasons: ['sku_matrix: payload is unavailable'] });
  const items = rowsOf(payload);
  const skus = skuRows(skuPayload);
  const byArticle = new Map(items.map((item) => [skuKey(item), item]).filter(([key]) => key));
  const platformOwnerErrors = [];
  skus.forEach((sku) => {
    const article = skuKey(sku);
    if (!article) return;
    const expectedOwners = { ...(sku.owner?.byPlatform || {}), ...(sku.ownersByPlatform || {}) };
    const matrixItem = byArticle.get(article);
    if (!matrixItem) return;
    for (const [platform, owner] of Object.entries(expectedOwners)) {
      const key = platformKey(platform);
      const actual = String(matrixItem.platformOwners?.[key] || matrixItem.platformOwners?.[platform] || '').trim();
      if (owner && actual !== String(owner).trim() && platformOwnerErrors.length < 20) {
        platformOwnerErrors.push({ article, platform: key, expected: owner, actual });
      }
    }
  });
  const embeddedAliasCount = embeddedAliasCountFromSkus(skus);
  const aliasCount = numberOrZero(payload.summary?.aliasCount);
  const aliasConflicts = Array.isArray(payload.aliasConflicts) ? payload.aliasConflicts : [];
  const skuTokenConflicts = Array.isArray(payload.skuTokenConflicts) ? payload.skuTokenConflicts : [];
  const ownerConflictItems = items.filter((item) => (item.ownerConflicts || []).length);
  const ownerConflictStateMissing = ownerConflictItems.filter((item) => !(item.problemStates || []).includes('owner_platform_conflict'));
  check.rows = items.length;
  check.embeddedAliasCount = embeddedAliasCount;
  check.aliasCount = aliasCount;
  check.aliasConflictCount = aliasConflicts.length;
  check.skuTokenConflictCount = skuTokenConflicts.length;
  check.ownerConflictCount = ownerConflictItems.length;
  check.platformOwnerErrors = platformOwnerErrors;
  if (embeddedAliasCount > 0 && aliasCount <= 0) check.blockingReasons.push(`sku_matrix: embedded aliases exist (${embeddedAliasCount}) but matrix aliasCount=${aliasCount}`);
  if (aliasConflicts.length) check.blockingReasons.push(`sku_matrix: ${aliasConflicts.length} alias collisions detected`);
  if (skuTokenConflicts.length) check.blockingReasons.push(`sku_matrix: ${skuTokenConflicts.length} SKU token collisions detected`);
  if (platformOwnerErrors.length) check.blockingReasons.push(`sku_matrix: platform owner fields do not match canonical SKU registry (${platformOwnerErrors.length} sampled)`);
  if (ownerConflictStateMissing.length) {
    check.blockingReasons.push(`sku_matrix: ${ownerConflictStateMissing.length} owner conflicts are not surfaced in problemStates`);
  } else if (ownerConflictItems.length) {
    check.warnings.push(`sku_matrix: ${ownerConflictItems.length} platform owner conflicts are visible and require registry decision`);
  }
  passports.push({
    key: 'sku_matrix.aliases',
    source: 'sku_matrix.json',
    period: loaded.get('sku_matrix')?.check?.dataDate || '',
    value: aliasCount,
    formula: 'deduped aliases from sku_aliases.json plus skus[].aliases/platformAliases',
    diagnostics: { embeddedAliasCount, aliasConflictCount: aliasConflicts.length, skuTokenConflictCount: skuTokenConflicts.length, ownerConflictCount: ownerConflictItems.length }
  });
  return addCheck(checks, check);
}

function inspectExecutiveTruthCode(loaded, policy, checks, passports) {
  const sourceFile = 'portal-executive-direct-fact-guard.js';
  const check = { id: 'contract:executive-direct-fact', scope: 'executive-code', source: sourceFile, warnings: [], blockingReasons: [] };
  const filePath = path.resolve(__dirname, '..', sourceFile);
  const indexPath = path.resolve(__dirname, '..', 'index.html');
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const indexText = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    const scalePlanCalls = (text.match(/executiveFunnelScalePlanBucket\(/g) || []).length;
    const scaleFinancialCalls = (text.match(/executiveFunnelScaleBucketFinancials\(/g) || []).length;
    const appCoreIndex = indexText.indexOf('app-core-10.js');
    const guardIndex = indexText.indexOf(sourceFile);
    check.modeMarkers = {
      directFactOnly: text.includes('direct_fact_only'),
      scalePlanCalls,
      scaleFinancialCalls,
      loadedAfterProtectedCore: appCoreIndex >= 0 && guardIndex > appCoreIndex
    };
    if (/payrollFactAllocationBasis\s*=\s*['"]plan_share['"]/.test(text) || /payrollFactAllocated\s*=\s*true/.test(text)) {
      check.blockingReasons.push('executive: plan_share employee fact allocation is still present');
    }
    if (/payrollControlScaled\s*=\s*true/.test(text)) {
      check.blockingReasons.push('executive: payroll control scaling mutation is still present');
    }
    if (scalePlanCalls > 1) check.blockingReasons.push('executive: executiveFunnelScalePlanBucket is called outside its guarded definition');
    if (scaleFinancialCalls > 1) check.blockingReasons.push('executive: executiveFunnelScaleBucketFinancials is called outside its guarded definition');
    if (!text.includes('direct_fact_only')) check.blockingReasons.push('executive: direct_fact_only marker is absent');
    if (!check.modeMarkers.loadedAfterProtectedCore) check.blockingReasons.push('executive: direct fact guard is not loaded after protected executive core');
  } catch (error) {
    check.blockingReasons.push(`executive: cannot inspect ${sourceFile}: ${error.message}`);
  }
  passports.push({
    key: 'executive.factAllocationMode',
    source: sourceFile,
    period: '',
    value: check.modeMarkers?.directFactOnly ? 'direct_fact_only' : 'unknown',
    formula: 'employee facts must remain direct; control deltas stay unallocated'
  });
  return addCheck(checks, check);
}

function inspectOosTaskCode(loaded, policy, checks, passports) {
  const check = { id: 'contract:oos-auto-task-code', scope: 'oos', source: 'app-core-11.js', warnings: [], blockingReasons: [] };
  const filePath = path.resolve(__dirname, '..', 'app-core-11.js');
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const saveStart = text.indexOf('async function oosControlSaveTask');
    const saveEnd = text.indexOf('function oosControlRiskAmount', saveStart);
    const taskForStart = text.indexOf('function oosControlTaskFor');
    const taskForEnd = text.indexOf('function oosControlTaskStatusLabel', taskForStart);
    const storageStart = fs.existsSync(path.resolve(__dirname, '..', 'app-core-02.js'))
      ? fs.readFileSync(path.resolve(__dirname, '..', 'app-core-02.js'), 'utf8')
      : '';
    const saveBlock = saveStart >= 0 && saveEnd > saveStart ? text.slice(saveStart, saveEnd) : '';
    const taskForBlock = taskForStart >= 0 && taskForEnd > taskForStart ? text.slice(taskForStart, taskForEnd) : '';
    check.markers = {
      hasStableIssueKey: text.includes('function oosControlStableIssueKey'),
      hasStableMarker: saveBlock.includes('[oos-stable:'),
      hasLegacyMarker: saveBlock.includes('[oos:'),
      taskSourceAuto: /source:\s*['"]auto['"]/.test(saveBlock),
      taskNormalizeAuto: /normalizeTask\([^]*,\s*['"]auto['"]\)/.test(saveBlock),
      taskForStableMarker: taskForBlock.includes('oosControlTaskMarkers'),
      localAutoOosPersistent: storageStart.includes("autoCode || '').trim().toLowerCase() === 'oos_control'")
    };
    if (!check.markers.hasStableIssueKey || !check.markers.hasStableMarker) {
      check.blockingReasons.push('oos task: stable platform+article marker is absent');
    }
    if (!check.markers.hasLegacyMarker) check.blockingReasons.push('oos task: legacy issue marker is absent for backward compatibility');
    if (!check.markers.taskSourceAuto || !check.markers.taskNormalizeAuto) {
      check.blockingReasons.push('oos task: task must be created as source=auto');
    }
    if (/id:\s*row\.taskId\s*\|\|/.test(saveBlock)) {
      check.blockingReasons.push('oos task: legacy row.taskId is used before stable/existing id');
    }
    if (!check.markers.taskForStableMarker) check.blockingReasons.push('oos task: lookup does not check stable markers');
    if (!check.markers.localAutoOosPersistent) {
      check.blockingReasons.push('oos task: local storage normalization would drop auto OOS tasks');
    }
  } catch (error) {
    check.blockingReasons.push(`oos task: cannot inspect runtime code: ${error.message}`);
  }
  passports.push({
    key: 'oos.autoTaskContract',
    source: 'app-core-11.js',
    period: '',
    value: check.blockingReasons.length ? 'blocked' : 'ok',
    formula: 'OOS task identity is stable by platform+article; task source is auto; local fallback keeps OOS auto tasks'
  });
  return addCheck(checks, check);
}

function inspectCrossDates(loaded, expectedDate, checks) {
  const check = { id: 'contract:cutoff-date', scope: 'period', source: 'cross-layer', warnings: [], blockingReasons: [] };
  const keyDates = ['platform_fact', 'dashboard_projection', 'ads_fact', 'warehouse_fact', 'data_quality']
    .map((key) => ({ key, date: loaded.get(key)?.check?.dataDate || '' }))
    .filter((item) => item.date);
  check.expectedDate = expectedDate;
  check.sourceDates = Object.fromEntries(keyDates.map((item) => [item.key, item.date]));
  const primaryDate = loaded.get('platform_fact')?.check?.dataDate || expectedDate;
  for (const item of keyDates) {
    if (item.key === 'warehouse_fact' || item.key === 'data_quality') continue;
    if (item.date !== primaryDate) check.blockingReasons.push(`cutoff date: ${item.key}=${item.date}, platform_fact=${primaryDate}`);
  }
  return addCheck(checks, check);
}

function inspectSyncIssues(options, manifest, checks) {
  if (!fs.existsSync(options.syncIssuesPath)) return null;
  const check = { id: 'contract:sync-issues', scope: 'pipeline', source: path.basename(options.syncIssuesPath), warnings: [], blockingReasons: [] };
  try {
    const payload = readJson(options.syncIssuesPath);
    const issues = Array.isArray(payload?.issues) ? payload.issues : (Array.isArray(payload) ? payload : []);
    const relevant = issues.filter((issue) => !isExcluded(issue?.id || issue?.name || issue?.step || '', manifest));
    check.issueCount = relevant.length;
    check.issues = relevant.slice(0, 25);
    relevant.forEach((issue) => {
      const severity = normalizedText(issue?.severity || issue?.status || 'error');
      const message = String(issue?.message || issue?.reason || issue?.name || issue?.id || 'sync issue');
      if (['warn', 'warning', 'partial'].includes(severity)) check.warnings.push(message);
      else check.blockingReasons.push(message);
    });
  } catch (error) {
    check.blockingReasons.push(`cannot read sync issues: ${error.message}`);
  }
  return addCheck(checks, check);
}

function resolvePhase3ReportPath(options, fileName) {
  const candidates = [
    path.join(options.inputDir, fileName),
    path.join(options.outputDir, fileName),
    path.join(options.baseDataDir, fileName)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function inspectPhase3Reports(options, checks, passports) {
  const check = { id: 'contract:phase3-publish-reports', scope: 'phase3', source: 'phase3-reconciliation', warnings: [], blockingReasons: [], reports: [] };
  PHASE3_REQUIRED_REPORTS.forEach((fileName) => {
    const reportPath = resolvePhase3ReportPath(options, fileName);
    const item = { file: fileName, path: path.relative(process.cwd(), reportPath), status: 'missing' };
    if (!fs.existsSync(reportPath)) {
      check.blockingReasons.push(`phase3: required report is missing: ${fileName}`);
      check.reports.push(item);
      return;
    }
    try {
      const payload = readJson(reportPath);
      const reportStatus = normalizedText(payload?.status || (payload?.publish_allowed === false ? 'blocked' : 'ok'));
      item.status = reportStatus || 'ok';
      item.publish_allowed = payload?.publish_allowed !== false;
      item.business_fingerprint = payload?.business_fingerprint || payload?.snapshot_id || '';
      item.summary = payload?.summary || {};
      if (reportStatus === 'blocked' || payload?.publish_allowed === false) {
        const reasons = Array.isArray(payload?.blockingReasons) && payload.blockingReasons.length
          ? payload.blockingReasons
          : [`${fileName}: status=${reportStatus || 'blocked'}`];
        reasons.forEach((reason) => check.blockingReasons.push(`phase3:${fileName}: ${reason}`));
      } else if (reportStatus === 'warning') {
        const warnings = Array.isArray(payload?.warnings) && payload.warnings.length
          ? payload.warnings
          : [`${fileName}: warning`];
        warnings.forEach((warning) => check.warnings.push(`phase3:${fileName}: ${warning}`));
      }
      passports.push({
        key: `phase3.${fileName.replace(/\.json$/, '')}`,
        source: fileName,
        period: payload?.cutoffDate || payload?.snapshot_id || '',
        value: reportStatus || 'ok',
        formula: 'required phase 3 publish-gate reconciliation report',
        diagnostics: { publish_allowed: item.publish_allowed, business_fingerprint: item.business_fingerprint }
      });
    } catch (error) {
      check.blockingReasons.push(`phase3:${fileName}: cannot read report: ${error.message}`);
      item.status = 'blocked';
    }
    check.reports.push(item);
  });
  check.businessFingerprint = crypto.createHash('sha256').update(stableStringify(check.reports.map((item) => ({
    file: item.file,
    status: item.status,
    publish_allowed: item.publish_allowed,
    business_fingerprint: item.business_fingerprint || ''
  })))).digest('hex');
  return addCheck(checks, check);
}

function viewStatuses(manifest, sourceChecks, contractChecks) {
  const sourceStatus = new Map(sourceChecks.map((check) => [check.source, check.status]));
  const globalContracts = contractChecks.filter((check) => check.status === 'blocked');
  const result = {};
  for (const [view, config] of Object.entries(manifest.views || {})) {
    if (isExcluded(view, manifest)) continue;
    const sourceDetails = (config.sources || []).map((key) => ({ source: key, status: sourceStatus.get(key) || 'missing' }));
    const statuses = sourceDetails.map((item) => item.status);
    const relevantContracts = contractChecks.filter((check) => {
      if (check.scope === 'dashboard') return view === 'dashboard';
      if (check.scope === 'executive') return ['executive', 'sku-plan-fact', 'sku-contour', 'skus'].includes(view);
      if (check.scope === 'executive-code') return view === 'executive';
      if (check.scope === 'mapping') return ['executive', 'control', 'data-health', 'sku-plan-fact', 'sku-contour', 'skus', 'launch-control'].includes(view);
      if (check.scope === 'order') return view === 'order';
      if (check.scope === 'oos') return view === 'oos-control';
      if (check.scope === 'phase3') return ['dashboard', 'executive', 'sku-plan-fact', 'repricer', 'prices'].includes(view);
      if (check.scope === 'plan' || check.scope === 'fact' || check.scope === 'period') return ['dashboard', 'executive', 'sku-plan-fact', 'ads-funnel', 'order', 'oos-control', 'product-leaderboard'].includes(view);
      if (check.scope === 'quality') return Boolean(config.critical);
      if (check.scope === 'pipeline') return Boolean(config.critical);
      return false;
    });
    statuses.push(...relevantContracts.map((check) => check.status));
    result[view] = {
      status: worstStatus(statuses),
      critical: Boolean(config.critical),
      sources: sourceDetails,
      blockingContracts: relevantContracts.filter((check) => check.status === 'blocked').map((check) => check.id)
    };
  }
  result.__globalBlockingContracts = globalContracts.map((check) => check.id);
  return result;
}

function repairSteps(manifest, sourceChecks, contractChecks) {
  const sourceByKey = new Map((manifest.sources || []).map((source) => [source.key, source]));
  const repairs = new Map();
  const add = (id, reason, source = '') => {
    if (!id || isExcluded(id, manifest)) return;
    if (!repairs.has(id)) repairs.set(id, { id, name: id.replace(/-/g, ' '), reason, source });
  };
  sourceChecks.filter((check) => check.status === 'blocked').forEach((check) => {
    const source = sourceByKey.get(check.source);
    add(source?.repairStep || 'full-sync', check.blockingReasons[0] || `${check.source} failed`, check.source);
  });
  contractChecks.filter((check) => check.status === 'blocked').forEach((check) => {
    if (check.scope === 'dashboard' || check.scope === 'plan') add('google-sheet-build', check.blockingReasons[0], check.source);
    else if (check.scope === 'fact' || check.scope === 'period') add('marketplace-api', check.blockingReasons[0], check.source);
    else if (check.scope === 'executive') add('wb-owner-distribution', check.blockingReasons[0], check.source);
    else if (check.scope === 'executive-code') add('executive-direct-fact', check.blockingReasons[0], check.source);
    else if (check.scope === 'mapping') add('sku-matrix', check.blockingReasons[0], check.source);
    else if (check.scope === 'order') add('order-procurement', check.blockingReasons[0], check.source);
    else if (check.scope === 'oos') add('oos-control', check.blockingReasons[0], check.source);
    else if (check.scope === 'phase3') add('repricer-dashboard-plan-audit', check.blockingReasons[0], check.source);
    else if (check.scope === 'quality') add('data-quality', check.blockingReasons[0], check.source);
    else if (check.scope === 'pipeline') add('retry-failed-sync-steps', check.blockingReasons[0], check.source);
  });
  return [...repairs.values()];
}

function buildReconciliation(manifest, expectedDate, sourceChecks, contractChecks, passports, views, fingerprint) {
  const blocking = [...sourceChecks, ...contractChecks].filter((check) => check.status === 'blocked');
  const warnings = [...sourceChecks, ...contractChecks].filter((check) => check.status === 'warning');
  return {
    schema: 'portal-metric-reconciliation-v1',
    generatedAt: new Date().toISOString(),
    manifestVersion: manifest.version,
    scope: { included: 'all portal views and layers', excluded: manifest.policy.excludedScopes },
    cutoffDate: expectedDate,
    status: blocking.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    business_fingerprint: fingerprint,
    summary: {
      sourceCount: sourceChecks.length,
      contractCount: contractChecks.length,
      metricPassportCount: passports.length,
      blockingChecks: blocking.length,
      warningChecks: warnings.length,
      fingerprint
    },
    metricPassports: passports,
    views,
    checks: contractChecks
  };
}

function run(options) {
  const manifest = readJson(options.manifestPath);
  manifest.policy = manifest.policy || {};
  const { loaded, checks: sourceChecks } = loadSources(manifest, options);
  const expectedDate = inferExpectedDate(loaded, options.expectedDate);
  const passports = [];
  const contractChecks = [];
  inspectCompanyPlan(loaded, manifest.policy, expectedDate, contractChecks, passports);
  inspectPlatformFact(loaded, manifest.policy, expectedDate, contractChecks, passports);
  inspectDashboard(loaded, manifest.policy, contractChecks, passports);
  inspectOwners(loaded, manifest.policy, contractChecks, passports);
  inspectDataQuality(loaded, manifest.policy, contractChecks, passports);
  inspectOrderProcurement(loaded, manifest.policy, contractChecks, passports);
  inspectOosControl(loaded, manifest.policy, contractChecks, passports);
  inspectOosTaskCode(loaded, manifest.policy, contractChecks, passports);
  inspectSkuMatrix(loaded, manifest.policy, contractChecks, passports);
  inspectExecutiveTruthCode(loaded, manifest.policy, contractChecks, passports);
  inspectCrossDates(loaded, expectedDate, contractChecks);
  inspectSyncIssues(options, manifest, contractChecks);
  inspectPhase3Reports(options, contractChecks, passports);

  const views = viewStatuses(manifest, sourceChecks, contractChecks);
  const repairs = repairSteps(manifest, sourceChecks, contractChecks);
  const allChecks = [...sourceChecks, ...contractChecks];
  const blockingReasons = allChecks.flatMap((check) => check.blockingReasons || []);
  const warningReasons = allChecks.flatMap((check) => check.warnings || []);
  const allowed = blockingReasons.length === 0;
  const fingerprintSeed = [
    ...sourceChecks.map((check) => `${check.source}:${check.sha256 || 'missing'}`).sort(),
    ...contractChecks
      .filter((check) => check.scope === 'phase3')
      .map((check) => `${check.source}:${check.businessFingerprint || check.status || 'unknown'}`)
      .sort()
  ];
  const fingerprint = crypto.createHash('sha256').update(fingerprintSeed.join('|')).digest('hex');
  const reconciliation = buildReconciliation(manifest, expectedDate, sourceChecks, contractChecks, passports, views, fingerprint);
  const report = {
    schema: 'portal-daily-guard-v2',
    generatedAt: new Date().toISOString(),
    manifest: { file: path.relative(process.cwd(), options.manifestPath), version: manifest.version, sha256: sha256(options.manifestPath) },
    scope: { included: Object.keys(manifest.views || {}).filter((view) => !isExcluded(view, manifest)), excluded: manifest.policy.excludedScopes },
    expectedDate,
    expectedRunDate: options.expectedRunDate || '',
    status: allowed ? (warningReasons.length ? 'warning' : 'ok') : 'blocked',
    publish: {
      allowed,
      blockingReasons,
      warningReasons,
      rule: 'Publish only when every required source and every cross-layer invariant is trusted. IU is explicitly outside this guard.'
    },
    summary: {
      sources: sourceChecks.length,
      contracts: contractChecks.length,
      views: Object.keys(manifest.views || {}).filter((view) => !isExcluded(view, manifest)).length,
      blockingChecks: allChecks.filter((check) => check.status === 'blocked').length,
      warningChecks: allChecks.filter((check) => check.status === 'warning').length,
      fingerprint
    },
    views,
    checks: allChecks,
    repair: { suggestedSteps: repairs },
    reconciliationFile: RECONCILIATION_FILE
  };

  if (!options.noWrite) {
    const targets = [options.outputDir];
    if (options.mirrorLocalFallback && path.resolve(options.baseDataDir) !== path.resolve(options.outputDir)) targets.push(options.baseDataDir);
    for (const target of [...new Set(targets.map((item) => path.resolve(item)))]) {
      writeJson(path.join(target, REPORT_FILE), report);
      writeJson(path.join(target, RECONCILIATION_FILE), reconciliation);
    }
  }
  return { report, reconciliation };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  try {
    const { report } = run(options);
    const prefix = report.publish.allowed ? '[portal-daily-guard] OK' : '[portal-daily-guard] BLOCKED';
    console.log(`${prefix}: ${report.summary.blockingChecks} blocking, ${report.summary.warningChecks} warning checks; cutoff ${report.expectedDate}`);
    if (!report.publish.allowed) report.publish.blockingReasons.slice(0, 20).forEach((reason) => console.error(`- ${reason}`));
    if (!report.publish.allowed && !options.noFail) process.exitCode = 1;
  } catch (error) {
    console.error(`[portal-daily-guard] fatal: ${error.stack || error.message}`);
    if (!options.noFail) process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  resolveOptions,
  run,
  dateKey,
  moneyMatches,
  cardSignature,
  countMojibake
};
