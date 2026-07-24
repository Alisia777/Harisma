#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'data', 'wb_fixed_rate_reports.json');
const DEFAULT_RECONCILIATION = path.resolve(process.cwd(), 'data', 'wb_fixed_rate_reconciliation.json');
const RECENT_CANDIDATE_LIMIT = 50;

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (['--dry-run', '--optional', '--no-reconciliation'].includes(token)) {
      args[token === '--dry-run' ? 'dryRun' : token.slice(2)] = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const value = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = value;
  }
  return args;
}

function numberOrZero(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^0-9.+-]/g, '');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function roundRate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 1000000) / 1000000 : null;
}

function normalizeRate(value) {
  const numeric = numberOrZero(value);
  if (!numeric) return 0;
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
}

function reconciliationRate(value, fallback) {
  const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
  return roundRate(hasValue ? normalizeRate(value) : fallback);
}

function isoDateFromYearPeriod(yearValue, periodValue) {
  const year = String(yearValue ?? '').trim();
  const period = String(periodValue ?? '').trim();
  const match = period.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (!match) return '';
  const resolvedYear = match[3]
    ? (match[3].length === 2 ? `20${match[3]}` : match[3])
    : year;
  if (!/^\d{4}$/.test(resolvedYear)) return '';
  return `${resolvedYear}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function isoDate(value, yearHint = '') {
  const raw = String(value ?? '').trim();
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  return isoDateFromYearPeriod(yearHint || raw.slice(0, 4), raw);
}

function isoDateFromWorkbookValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  return isoDate(value);
}

function normalizedHeader(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е');
}

function directHistoryHeaderMap(row = []) {
  const aliases = {
    date: ['дата', 'date'],
    masterId: ['master_id', 'master id', 'кабинет'],
    revenue: ['продажи со скидкой продавца', 'продажи', 'фактический оборот'],
    targetRevenue: ['план gmv', 'целевой оборот', 'план продаж'],
    revenueCompletionPct: ['выполнение плана по gmv', 'выполнение продаж в %'],
    spendFact: ['рекламные затраты', 'реклама факт'],
    planSpend: ['план по рекламе', 'маркетинговый план'],
    adsCompletionPct: ['выполнение плана по рекламе', 'выполнение рекламы в %']
  };
  const normalized = row.map(normalizedHeader);
  const map = {};
  Object.entries(aliases).forEach(([key, values]) => {
    map[key] = normalized.findIndex((header) => values.includes(header));
  });
  const required = ['date', 'masterId', 'revenue', 'targetRevenue', 'spendFact', 'planSpend'];
  return required.every((key) => map[key] >= 0) ? map : null;
}

function directHistoryRows(rows, source) {
  const headerIndex = rows.findIndex((row) => directHistoryHeaderMap(row));
  if (headerIndex < 0) return { daily: [], masterIds: [] };
  const columns = directHistoryHeaderMap(rows[headerIndex]);
  const masterIds = new Set();
  const daily = rows.slice(headerIndex + 1).map((row) => {
    const date = isoDateFromWorkbookValue(row[columns.date]);
    const masterId = String(row[columns.masterId] ?? '').trim();
    const revenue = roundMoney(row[columns.revenue]);
    const targetRevenue = roundMoney(row[columns.targetRevenue]);
    const spendFact = roundMoney(row[columns.spendFact]);
    const planSpend = roundMoney(row[columns.planSpend]);
    if (!date || !masterId || revenue <= 0 || targetRevenue <= 0 || planSpend < 0 || spendFact < 0) return null;
    masterIds.add(masterId);
    const revenueDelta = roundMoney(revenue - targetRevenue);
    const spendDelta = roundMoney(spendFact - planSpend);
    return {
      date,
      period: dateForFileName(date).slice(0, 5),
      masterId,
      targetRevenue,
      revenue,
      revenueDelta,
      revenueDeltaPct: roundRate(revenueDelta / targetRevenue),
      planSpend,
      planPct: roundRate(revenue > 0 ? planSpend / revenue : 0),
      spendFact,
      factPct: roundRate(revenue > 0 ? spendFact / revenue : 0),
      spendDelta,
      spendDeltaPct: roundRate(planSpend > 0 ? spendDelta / planSpend : 0),
      revenueCompletionPct: roundRate(revenue / targetRevenue),
      adsCompletionPct: roundRate(planSpend > 0 ? spendFact / planSpend : 0),
      source
    };
  }).filter(Boolean);
  return { daily, masterIds: Array.from(masterIds).sort() };
}

function dateForFileName(dateKey) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath, fallback = null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function rowToReportItem(row, source) {
  const date = isoDateFromYearPeriod(row[0], row[1]);
  if (!date) return null;
  const item = {
    date,
    period: String(row[1] ?? '').trim(),
    targetRevenue: roundMoney(row[2]),
    revenue: roundMoney(row[3]),
    revenueDelta: roundMoney(row[4]),
    revenueDeltaPct: roundRate(normalizeRate(row[5])),
    planSpend: roundMoney(row[6]),
    planPct: roundRate(normalizeRate(row[7])),
    spendFact: roundMoney(row[8]),
    factPct: roundRate(normalizeRate(row[9])),
    spendDelta: roundMoney(row[10]),
    spendDeltaPct: roundRate(normalizeRate(row[11])),
    revenueCompletionPct: roundRate(normalizeRate(row[12])),
    adsCompletionPct: roundRate(normalizeRate(row[13])),
    source
  };

  if (item.targetRevenue <= 0 || item.revenue <= 0 || item.planSpend < 0 || item.spendFact < 0) {
    return null;
  }
  return item;
}

function reportItemFromReconciliation(row, fallbackSource) {
  const date = isoDate(row.date || row.period, row.year || String(row.date || '').slice(0, 4));
  if (!date) return null;
  const revenue = roundMoney(row.revenue);
  const targetRevenue = roundMoney(row.targetRevenue);
  const planSpend = roundMoney(row.planSpend);
  const spendFact = roundMoney(row.spendFact);
  const revenueDelta = roundMoney(row.revenueDelta ?? (revenue - targetRevenue));
  const spendDelta = roundMoney(row.spendDelta ?? (spendFact - planSpend));
  const planPct = reconciliationRate(row.planPct, revenue > 0 ? planSpend / revenue : 0);
  const factPct = reconciliationRate(row.factPct, revenue > 0 ? spendFact / revenue : 0);
  return {
    date,
    period: row.period || dateForFileName(date).slice(0, 5),
    targetRevenue,
    revenue,
    revenueDelta,
    revenueDeltaPct: reconciliationRate(row.revenueDeltaPct, targetRevenue > 0 ? revenueDelta / targetRevenue : 0),
    planSpend,
    planPct,
    spendFact,
    factPct,
    spendDelta,
    spendDeltaPct: reconciliationRate(row.spendDeltaPct, planSpend > 0 ? spendDelta / planSpend : 0),
    revenueCompletionPct: reconciliationRate(row.revenueCompletionPct, targetRevenue > 0 ? revenue / targetRevenue : 0),
    adsCompletionPct: reconciliationRate(row.adsCompletionPct, planSpend > 0 ? spendFact / planSpend : 0),
    source: row.source || fallbackSource || 'WB fixed-rate reconciliation'
  };
}

function validateDailyRows(daily) {
  const errors = [];
  const warnings = [];
  const moneyTolerance = 1.5;
  const rateTolerance = 0.00025;

  for (const row of daily) {
    const checks = [
      ['revenueDelta', row.revenue - row.targetRevenue, row.revenueDelta, moneyTolerance],
      ['planSpend', row.revenue * row.planPct, row.planSpend, moneyTolerance],
      ['spendDelta', row.spendFact - row.planSpend, row.spendDelta, moneyTolerance],
      ['revenueDeltaPct', row.revenueDelta / row.targetRevenue, row.revenueDeltaPct, rateTolerance],
      ['factPct', row.spendFact / row.revenue, row.factPct, rateTolerance],
      ['spendDeltaPct', row.planSpend ? row.spendDelta / row.planSpend : 0, row.spendDeltaPct, rateTolerance],
      ['revenueCompletionPct', row.revenue / row.targetRevenue, row.revenueCompletionPct, rateTolerance],
      ['adsCompletionPct', row.planSpend ? row.spendFact / row.planSpend : 0, row.adsCompletionPct, rateTolerance]
    ];

    for (const [field, expected, actual, tolerance] of checks) {
      if (Math.abs(numberOrZero(actual) - numberOrZero(expected)) > tolerance) {
        errors.push(`${row.date}: ${field} mismatch, expected ${roundRate(expected)}, got ${actual}.`);
      }
    }

    if (row.planPct <= 0 || row.planPct > 0.5) {
      warnings.push(`${row.date}: unusual WB fixed-rate plan percentage ${row.planPct}.`);
    }
    if (row.factPct > 0.5) {
      warnings.push(`${row.date}: unusually high WB fixed-rate fact percentage ${row.factPct}.`);
    }
  }

  if (!daily.length) errors.push('No fixed-rate daily rows were parsed.');
  return { errors, warnings };
}

function dateToUtc(dateKey) {
  const timestamp = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function addDays(dateKey, days) {
  const timestamp = dateToUtc(dateKey);
  if (timestamp === null) return '';
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(from, to) {
  const dates = [];
  for (let cursor = from; cursor && to && cursor <= to;) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function sumDailyRows(daily, from, to, key) {
  return daily
    .filter((row) => row.date >= from && row.date <= to)
    .reduce((sum, row) => sum + numberOrZero(row[key]), 0);
}

function validateControlWindows(daily, windows = []) {
  const errors = [];
  const warnings = [];
  const moneyTolerance = 2;
  for (const window of windows || []) {
    const from = isoDate(window.from);
    const to = isoDate(window.to);
    if (!from || !to) continue;
    const dates = enumerateDates(from, to);
    const present = new Set(daily.map((row) => row.date));
    const missing = dates.filter((date) => !present.has(date));
    if (missing.length) {
      warnings.push(`${from}..${to}: control window has missing dates: ${missing.join(', ')}.`);
      continue;
    }
    for (const key of ['targetRevenue', 'revenue', 'planSpend', 'spendFact']) {
      if (window[key] === undefined || window[key] === null) continue;
      const actual = roundMoney(sumDailyRows(daily, from, to, key));
      const expected = roundMoney(window[key]);
      if (Math.abs(actual - expected) > moneyTolerance) {
        errors.push(`${from}..${to}: ${key} total mismatch, expected ${expected}, got ${actual}.`);
      }
    }
  }
  return { errors, warnings };
}

function applyReconciliation(daily, reconciliation) {
  const sourceFile = reconciliation?.sourceFile || 'wb_fixed_rate_reconciliation.json';
  const sourceRows = Array.isArray(reconciliation?.daily) ? reconciliation.daily : [];
  const byDate = new Map(daily.map((row) => [row.date, { ...row }]));
  const applied = [];
  const skipped = [];
  for (const sourceRow of sourceRows) {
    const item = reportItemFromReconciliation(sourceRow, `${sourceFile} :: missing cabinet day`);
    if (!item) {
      skipped.push({ reason: 'invalid_date', sourceRow });
      continue;
    }
    if (byDate.has(item.date)) {
      skipped.push({ date: item.date, reason: 'covered_by_workbook' });
      continue;
    }
    byDate.set(item.date, item);
    applied.push({ date: item.date, source: item.source });
  }
  const merged = Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
  return {
    daily: merged,
    diagnostics: {
      sourceFile,
      applied,
      skipped,
      controlWindows: Array.isArray(reconciliation?.controlWindows) ? reconciliation.controlWindows : []
    }
  };
}

function parseWorkbook(workbookPath) {
  const workbook = XLSX.readFile(workbookPath, { cellDates: false });
  let selected = null;
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true });
    const directHistory = directHistoryRows(rows, path.basename(workbookPath));
    const daily = directHistory.daily.length
      ? directHistory.daily
      : rows
        .map((row) => rowToReportItem(row, path.basename(workbookPath)))
        .filter(Boolean);
    if (!selected || daily.length > selected.daily.length) {
      selected = {
        sheetName,
        daily,
        format: directHistory.daily.length ? 'iu_history_export' : 'fixed_rate_detail',
        masterIds: directHistory.masterIds
      };
    }
  }
  if (!selected || !selected.daily.length) {
    throw new Error(`No WB fixed-rate rows found in ${workbookPath}.`);
  }
  const daily = selected.daily.sort((left, right) => left.date.localeCompare(right.date));
  const validation = validateDailyRows(daily);
  if (validation.errors.length) {
    throw new Error(`WB fixed-rate report validation failed:\n- ${validation.errors.join('\n- ')}`);
  }
  return {
    sheetName: selected.sheetName,
    daily,
    format: selected.format,
    masterIds: selected.masterIds || [],
    warnings: validation.warnings
  };
}

function listCandidateFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(xlsx|xlsm|xls)$/i.test(entry.name)) continue;
      const filePath = path.join(dir, entry.name);
      const stat = fs.statSync(filePath);
      files.push({ filePath, mtimeMs: stat.mtimeMs, size: stat.size });
    }
  }
  return files.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

function findNewestFixedRateWorkbook(options = {}) {
  if (options.source) {
    const source = path.resolve(options.source);
    if (!fs.existsSync(source)) throw new Error(`Fixed-rate workbook not found: ${source}`);
    return source;
  }

  const envSource = process.env.ALTEA_WB_FIXED_RATE_REPORT_XLSX || process.env.ALTEA_WB_FIXED_RATE_REPORT || '';
  if (envSource) {
    const source = path.resolve(envSource);
    if (!fs.existsSync(source)) throw new Error(`Fixed-rate workbook not found: ${source}`);
    return source;
  }

  const downloadsDir = path.resolve(options.downloadsDir || path.join(os.homedir(), 'Downloads'));
  const dirs = [
    downloadsDir,
    path.join(downloadsDir, 'Telegram Desktop')
  ];
  const candidates = listCandidateFiles(dirs).slice(0, RECENT_CANDIDATE_LIMIT);
  const failures = [];
  for (const candidate of candidates) {
    try {
      const parsed = parseWorkbook(candidate.filePath);
      if (parsed.format === 'iu_history_export') {
        failures.push(`${path.basename(candidate.filePath)}: account-scoped IU history requires explicit --source and a dedicated output`);
        continue;
      }
      if (parsed.daily.length) return candidate.filePath;
    } catch (error) {
      failures.push(`${path.basename(candidate.filePath)}: ${error.message}`);
    }
  }
  const suffix = failures.length ? ` Recent parse failures: ${failures.slice(0, 5).join(' | ')}` : '';
  throw new Error(`No recent WB fixed-rate workbook was found in ${dirs.join(', ')}.${suffix}`);
}

function findSourceArchive(options, period) {
  if (options.sourceArchive) return path.resolve(options.sourceArchive);
  const downloadsDir = path.resolve(options.downloadsDir || path.join(os.homedir(), 'Downloads'));
  const fromToken = dateForFileName(period.from);
  const toToken = dateForFileName(period.to);
  if (!fromToken || !toToken || !fs.existsSync(downloadsDir)) return '';
  const match = fs.readdirSync(downloadsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.zip$/i.test(entry.name))
    .filter((entry) => entry.name.includes(fromToken) && entry.name.includes(toToken))
    .map((entry) => {
      const filePath = path.join(downloadsDir, entry.name);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  return match?.filePath || '';
}

function buildReport(options = {}) {
  const workbookPath = findNewestFixedRateWorkbook(options);
  const parsed = parseWorkbook(workbookPath);
  const reconciliationPath = options.reconciliation === false
    ? ''
    : path.resolve(options.reconciliation || DEFAULT_RECONCILIATION);
  const reconciliation = readJson(reconciliationPath, null);
  const reconciliationMasterId = String(reconciliation?.masterId ?? '').trim();
  const workbookMasterIds = parsed.masterIds || [];
  const reconciliationMatchesScope = !workbookMasterIds.length
    || (reconciliationMasterId && workbookMasterIds.includes(reconciliationMasterId));
  const reconciled = reconciliation && reconciliationMatchesScope
    ? applyReconciliation(parsed.daily, {
      ...reconciliation,
      sourceFile: path.basename(reconciliationPath)
    })
    : {
      daily: parsed.daily,
      diagnostics: reconciliation
        ? {
          sourceFile: path.basename(reconciliationPath),
          applied: [],
          skipped: [{ reason: 'account_scope_mismatch', workbookMasterIds, reconciliationMasterId }],
          controlWindows: []
        }
        : null
    };
  const daily = reconciled.daily;
  const validation = validateDailyRows(daily);
  if (validation.errors.length) {
    throw new Error(`WB fixed-rate report validation failed after reconciliation:\n- ${validation.errors.join('\n- ')}`);
  }
  const controlValidation = validateControlWindows(daily, reconciled.diagnostics?.controlWindows || []);
  if (controlValidation.errors.length) {
    throw new Error(`WB fixed-rate reconciliation control totals failed:\n- ${controlValidation.errors.join('\n- ')}`);
  }
  const period = {
    from: daily[0]?.date || '',
    to: daily[daily.length - 1]?.date || ''
  };
  const archivePath = findSourceArchive(options, period);
  return {
    generatedAt: new Date().toISOString(),
    sourceWorkbook: path.basename(workbookPath),
    sourceWorkbookSha256: sha256(workbookPath),
    sourceArchive: archivePath ? path.basename(archivePath) : '',
    sourceSheet: parsed.sheetName,
    sourceFormat: parsed.format,
    accountScope: workbookMasterIds.length ? { masterIds: workbookMasterIds } : null,
    period,
    notes: [
      'WB cabinet fixed-rate report. Used as cabinet-comparable factual turnover and factual marketing spend for IU/DRR reconciliation.',
      'Rows are parsed from the WB fixed-rate workbook and validated against the workbook delta/rate columns before publication.',
      'When the cabinet export misses a day that is visible in a separate WB reconciliation, the missing date is filled from data/wb_fixed_rate_reconciliation.json and marked at row source level.',
      'IU history exports are account-scoped by master_id. Reconciliation rows from another or unspecified account are never mixed into that history.'
    ],
    diagnostics: {
      warnings: parsed.warnings.concat(validation.warnings, controlValidation.warnings),
      rows: daily.length,
      workbookRows: parsed.daily.length,
      reconciliation: reconciled.diagnostics
    },
    daily: daily.map((row) => ({
      ...row,
      source: row.source || path.basename(workbookPath)
    }))
  };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  let report;
  try {
    report = buildReport({
      source: args.source || args.input || args.workbook,
      sourceArchive: args['source-archive'],
      downloadsDir: args['downloads-dir'],
      reconciliation: args['no-reconciliation'] ? false : args.reconciliation
    });
  } catch (error) {
    if (args.optional) {
      console.warn(`[wb-fixed-rate] skipped: ${error.message}`);
      return;
    }
    throw error;
  }

  const outputPath = path.resolve(args.output || DEFAULT_OUTPUT);
  if (!args.dryRun) writeJson(outputPath, report);
  console.log(JSON.stringify({
    dryRun: Boolean(args.dryRun),
    output: outputPath,
    sourceWorkbook: report.sourceWorkbook,
    sourceSheet: report.sourceSheet,
    period: report.period,
    rows: report.daily.length,
    totals: {
      targetRevenue: roundMoney(report.daily.reduce((sum, row) => sum + numberOrZero(row.targetRevenue), 0)),
      revenue: roundMoney(report.daily.reduce((sum, row) => sum + numberOrZero(row.revenue), 0)),
      planSpend: roundMoney(report.daily.reduce((sum, row) => sum + numberOrZero(row.planSpend), 0)),
      spendFact: roundMoney(report.daily.reduce((sum, row) => sum + numberOrZero(row.spendFact), 0))
    },
    reconciliation: report.diagnostics.reconciliation,
    warnings: report.diagnostics.warnings
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  buildReport,
  findNewestFixedRateWorkbook,
  normalizeRate,
  parseWorkbook,
  directHistoryRows,
  applyReconciliation,
  validateControlWindows,
  validateDailyRows
};
