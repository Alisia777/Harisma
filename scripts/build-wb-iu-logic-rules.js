#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WB_PLAN_RATE_OVERRIDES = Object.freeze({
  '2026-06': 0.1147
});

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const value = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = value;
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function sumRows(rows, key) {
  return rows.reduce((sum, row) => sum + numberOrZero(row[key]), 0);
}

function buildRules(reportPath) {
  const report = readJson(reportPath);
  const daily = Array.isArray(report.daily) ? report.daily : [];
  const totals = {
    targetRevenue: sumRows(daily, 'targetRevenue'),
    revenue: sumRows(daily, 'revenue'),
    cabinetPlanSpend: sumRows(daily, 'planSpend'),
    spendFact: sumRows(daily, 'spendFact'),
    portalPlanSpendAtOverride: sumRows(daily, 'revenue') * WB_PLAN_RATE_OVERRIDES['2026-06']
  };

  const required = {
    wbPlanRateOverrideJune1147: WB_PLAN_RATE_OVERRIDES['2026-06'] === 0.1147,
    fixedRateReportPresent: daily.length > 0,
    fixedRatePeriodPresent: Boolean(report.period?.from && report.period?.to),
    fixedRateSourceWorkbookPresent: Boolean(report.sourceWorkbook),
    fixedRateUsesCabinetRevenue: daily.every((row) => numberOrZero(row.revenue) > 0),
    fixedRateUsesCabinetSpendFact: daily.every((row) => numberOrZero(row.spendFact) >= 0),
    fixedRateUsesCabinetTargetRevenue: daily.every((row) => numberOrZero(row.targetRevenue) > 0),
    fixedRateFactPriorityFirst: true,
    wbRateDoesNotApplyToOzon: true
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`WB IU logic report is missing required markers: ${missing.join(', ')}`);
  }

  return {
    generatedAt: new Date().toISOString(),
    version: '20260701-wb-iu-fixed-rate-logic-v1',
    source: {
      reportFile: path.basename(reportPath),
      reportSha256: sha256(reportPath),
      sourceWorkbook: report.sourceWorkbook || '',
      sourceArchive: report.sourceArchive || '',
      sourceSheet: report.sourceSheet || '',
      generatedAt: report.generatedAt || ''
    },
    required,
    canonical: {
      planRateOverrides: WB_PLAN_RATE_OVERRIDES,
      planRateRule: 'WB plan spend uses month-specific WB-only override first; June 2026 WB override is 11.47%.',
      factPriority: [
        'wb_fixed_rate_cabinet_report',
        'wb_iu_control_workbook',
        'wb_api_calibrated_to_iu_control',
        'platform_api_raw'
      ],
      fixedRateRule: 'For dates covered by the WB fixed-rate cabinet report, target revenue, factual revenue and factual ad spend must come from that report.',
      fixedRatePeriod: {
        from: report.period?.from || '',
        to: report.period?.to || '',
        days: daily.length
      },
      fixedRateTotals: totals,
      nonApplicability: 'WB rate overrides are WB-only and must not be used for Ozon plan rate, Ozon GMV or Ozon DRR.'
    }
  };
}

function main() {
  const args = parseArgs(process.argv);
  const reportPath = path.resolve(args.report || path.join(process.cwd(), 'data', 'wb_fixed_rate_reports.json'));
  const outputPath = path.resolve(args.output || path.join(process.cwd(), 'data', 'wb_iu_logic_rules.json'));
  const rules = buildRules(reportPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(rules, null, 2) + '\n');
  console.log(JSON.stringify({
    output: outputPath,
    sourceWorkbook: rules.source.sourceWorkbook,
    reportSha256: rules.source.reportSha256,
    fixedRatePeriod: rules.canonical.fixedRatePeriod,
    fixedRateTotals: rules.canonical.fixedRateTotals,
    required: rules.required
  }, null, 2));
}

main();
