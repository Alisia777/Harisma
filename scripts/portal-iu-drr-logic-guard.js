#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  IU_DRR_RULES,
  OZON_FINANCE_GMV_DRR_MODE,
  WB_PLAN_RATE_OVERRIDES
} = require('./iu-drr-rules');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const [rawKey, inlineValue] = String(token || '').split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const value = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = value;
  }
  return args;
}

function readJson(filePath, fallback = {}) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function roundRate(value) {
  return Math.round(numberOrZero(value) * 1000000) / 1000000;
}

function isoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function monthKey(dateKey) {
  return String(dateKey || '').slice(0, 7);
}

function almostEqual(left, right, tolerance = 0.000001) {
  return Math.abs(numberOrZero(left) - numberOrZero(right)) <= tolerance;
}

function fixedRateMap(report) {
  const map = new Map();
  for (const row of Array.isArray(report?.daily) ? report.daily : []) {
    const date = isoDate(row.date);
    if (!date) continue;
    map.set(date, {
      revenue: numberOrZero(row.revenue),
      targetRevenue: numberOrZero(row.targetRevenue),
      spendFact: numberOrZero(row.spendFact)
    });
  }
  return map;
}

function validate(summary, fixedReport) {
  const errors = [];
  const warnings = [];
  const rows = Array.isArray(summary?.daily) ? summary.daily : [];
  const rowsByDate = new Map(rows.map((row) => [isoDate(row.date), row]));
  const fixedMap = fixedRateMap(fixedReport);

  if (summary?.iuDrrRules?.version !== IU_DRR_RULES.version) {
    errors.push(`IU/DRR rules version mismatch: summary=${summary?.iuDrrRules?.version || 'empty'} expected=${IU_DRR_RULES.version}.`);
  }

  if (summary?.planRateOverrides) {
    errors.push('Generic planRateOverrides is present; WB rate overrides must stay in wbPlanRateOverrides.');
  }

  for (const [month, rate] of Object.entries(WB_PLAN_RATE_OVERRIDES)) {
    if (!almostEqual(summary?.wbPlanRateOverrides?.[month], rate)) {
      errors.push(`Missing wbPlanRateOverrides.${month}=${rate}.`);
    }
  }

  for (const [date, fixed] of fixedMap.entries()) {
    const row = rowsByDate.get(date);
    if (!row) continue;
    if (!row.wbFixedRateApplied) errors.push(`${date}: wbFixedRateApplied is false.`);
    if (row.wbIuFactMode !== 'wb_fixed_rate_cabinet_reconciled') {
      errors.push(`${date}: wbIuFactMode=${row.wbIuFactMode || 'empty'}.`);
    }
    if (!almostEqual(row.revenueWb, fixed.revenue, 1)) {
      errors.push(`${date}: revenueWb ${roundMoney(row.revenueWb)} != fixed report ${roundMoney(fixed.revenue)}.`);
    }
    if (!almostEqual(row.spendFact, fixed.spendFact, 1)) {
      errors.push(`${date}: spendFact ${roundMoney(row.spendFact)} != fixed report ${roundMoney(fixed.spendFact)}.`);
    }
    if (!almostEqual(row.targetRevenueWb, fixed.targetRevenue, 1)) {
      errors.push(`${date}: targetRevenueWb ${roundMoney(row.targetRevenueWb)} != fixed report ${roundMoney(fixed.targetRevenue)}.`);
    }
  }

  for (const row of rows) {
    const date = isoDate(row.date);
    const month = row.monthKey || monthKey(date);
    const wbOverride = numberOrZero(WB_PLAN_RATE_OVERRIDES[month]);
    if (wbOverride > 0 && numberOrZero(row.revenueWb) > 0) {
      const wbPlanRate = numberOrZero(row.planSpendWb) / numberOrZero(row.revenueWb);
      if (!almostEqual(wbPlanRate, wbOverride, 0.0001)) {
        errors.push(`${date}: WB plan rate ${roundRate(wbPlanRate)} != ${wbOverride}.`);
      }
      if (almostEqual(row.planPctOzon, wbOverride, 0.0001)) {
        errors.push(`${date}: Ozon plan rate equals WB override ${wbOverride}.`);
      }
    }

    const hasOzonFinance = numberOrZero(row.ozonFinanceSourceRows) > 0 || row.ozonAdsFactMode === OZON_FINANCE_GMV_DRR_MODE;
    if (!hasOzonFinance) continue;
    if (row.ozonAdsFactMode !== OZON_FINANCE_GMV_DRR_MODE) {
      errors.push(`${date}: Ozon mode is ${row.ozonAdsFactMode || 'empty'}.`);
    }
    if (!almostEqual(row.revenueOzon, row.ozonGmv, 1)) {
      errors.push(`${date}: revenueOzon ${roundMoney(row.revenueOzon)} must equal ozonGmv ${roundMoney(row.ozonGmv)}.`);
    }
    const excluded = numberOrZero(row.ozonDrrExcludedPremiumPlus) + numberOrZero(row.ozonDrrExcludedOriginalBadge);
    if (!almostEqual(row.ozonDrrExcludedTotal, excluded, 1)) {
      errors.push(`${date}: Ozon excluded total ${roundMoney(row.ozonDrrExcludedTotal)} != ${roundMoney(excluded)}.`);
    }
    const expectedSpend = numberOrZero(row.ozonDrrSpendGross) - numberOrZero(row.ozonDrrExcludedTotal);
    if (!almostEqual(row.spendFactOzon, expectedSpend, 1)) {
      errors.push(`${date}: spendFactOzon ${roundMoney(row.spendFactOzon)} != gross minus exclusions ${roundMoney(expectedSpend)}.`);
    }
  }

  if (!rows.length) warnings.push('No IU/DRR daily rows found.');
  const currentMonth = summary?.kpis?.monthKey || '';
  const currentWbOverride = numberOrZero(WB_PLAN_RATE_OVERRIDES[currentMonth]);
  if (currentWbOverride > 0 && almostEqual(summary?.kpis?.planPctOzon, currentWbOverride, 0.0001)) {
    errors.push(`${currentMonth}: KPI planPctOzon equals WB override ${currentWbOverride}.`);
  }

  return {
    status: errors.length ? 'fail' : 'ok',
    rulesVersion: IU_DRR_RULES.version,
    checkedRows: rows.length,
    fixedRateDatesInWindow: Array.from(fixedMap.keys()).filter((date) => rowsByDate.has(date)).length,
    ozonFinanceRows: rows.filter((row) => numberOrZero(row.ozonFinanceSourceRows) > 0 || row.ozonAdsFactMode === OZON_FINANCE_GMV_DRR_MODE).length,
    warnings,
    errors
  };
}

function main() {
  const args = parseArgs(process.argv);
  const inputDir = path.resolve(args['input-dir'] || path.join(process.cwd(), 'data'));
  const summaryPath = path.resolve(args.summary || path.join(inputDir, 'iu_drr_summary.json'));
  const fixedPath = path.resolve(args['fixed-rate-report'] || path.join(inputDir, 'wb_fixed_rate_reports.json'));
  const result = validate(readJson(summaryPath), readJson(fixedPath, { daily: [] }));

  if (result.errors.length) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
