#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const CHANNELS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'd2c', 'b2b'];
const MONEY_TOLERANCE = 0.02;

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!String(token || '').startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}

function readLayer(options, fileName, fallback = {}) {
  return readJson(path.join(options.inputDir, fileName), readJson(path.join(options.baseDataDir, fileName), fallback));
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return Math.round(num(value) * 100) / 100;
}

function sameMoney(left, right, tolerance = MONEY_TOLERANCE) {
  return Math.abs(money(left) - money(right)) <= tolerance;
}

function companyChannel(companyPlan, monthKey, channel) {
  const month = companyPlan?.months?.[monthKey] || {};
  return Math.max(
    num(month.channels?.[channel]?.revenue),
    num(companyPlan?.rules?.controlTotals?.[monthKey]?.[channel])
  );
}

function companyTotal(companyPlan, monthKey) {
  const month = companyPlan?.months?.[monthKey] || {};
  return num(month.revenue) || Object.values(month.channels || {}).reduce((sum, item) => sum + num(item?.revenue), 0);
}

function expectedSource(corporatePlan, iuPlan, corporateSource, iuSource) {
  if (corporatePlan > iuPlan + MONEY_TOLERANCE) return corporateSource;
  if (iuPlan > corporatePlan + MONEY_TOLERANCE) return iuSource;
  return 'either';
}

function sourceMatches(actual, expected, allowedEither = []) {
  if (expected === 'either') return allowedEither.includes(actual);
  return actual === expected;
}

function addCheck(checks, name, expected, actual, details = {}) {
  const ok = sameMoney(expected, actual);
  checks.push({
    ok,
    name,
    expected: money(expected),
    actual: money(actual),
    delta: money(num(actual) - num(expected)),
    ...details
  });
}

function addSourceCheck(checks, name, expected, actual, details = {}) {
  const ok = sourceMatches(actual, expected, details.allowedEither || []);
  checks.push({
    ok,
    name,
    expected,
    actual,
    ...details
  });
}

function buildExpectedMonths(companyPlan, iuPlan) {
  const monthKeys = new Set([
    ...Object.keys(companyPlan?.months || {}),
    ...Object.keys(iuPlan?.months || {})
  ]);
  return [...monthKeys].sort().map((monthKey) => {
    const iuMonth = iuPlan?.months?.[monthKey] || {};
    const wbCorporate = money(companyChannel(companyPlan, monthKey, 'wb'));
    const wbIu = money(iuMonth.iuRevenueWb);
    const ozonCorporate = money(companyChannel(companyPlan, monthKey, 'ozon'));
    const ozonIu40 = money(iuMonth.iuRevenueOzon);
    return {
      monthKey,
      wbCorporate,
      wbIu,
      wbSelected: Math.max(wbCorporate, wbIu),
      wbSource: expectedSource(wbCorporate, wbIu, 'corporate_plan', 'iu_contract'),
      ozonCorporate,
      ozonIu40,
      ozonSelected: Math.max(ozonCorporate, ozonIu40),
      ozonSource: expectedSource(ozonCorporate, ozonIu40, 'corporate_plan', 'iu_contract_40pct'),
      corporateTotal: money(companyTotal(companyPlan, monthKey)),
      otherChannels: Object.fromEntries(CHANNELS
        .filter((channel) => !['wb', 'ozon'].includes(channel))
        .map((channel) => [channel, money(companyChannel(companyPlan, monthKey, channel))]))
    };
  });
}

function auditCompanyDashboard(checks, companyPlan, dashboard) {
  const dashboardPlan = dashboard?.companyPlan || {};
  for (const monthKey of Object.keys(companyPlan?.months || {}).sort()) {
    addCheck(checks, `dashboard.companyPlan.months.${monthKey}.revenue`, companyTotal(companyPlan, monthKey), dashboardPlan.months?.[monthKey]?.revenue, { area: 'dashboard', monthKey });
    for (const channel of CHANNELS) {
      addCheck(
        checks,
        `dashboard.companyPlan.months.${monthKey}.${channel}`,
        companyChannel(companyPlan, monthKey, channel),
        dashboardPlan.months?.[monthKey]?.channels?.[channel]?.revenue,
        { area: 'dashboard', monthKey, channel }
      );
    }
  }

  const activeMonthKey = dashboardPlan.activeMonth?.monthKey;
  if (activeMonthKey) {
    addCheck(checks, `dashboard.companyPlan.activeMonth.${activeMonthKey}.revenue`, companyTotal(companyPlan, activeMonthKey), dashboardPlan.activeMonth?.planRevenueMonth, { area: 'dashboard-active', monthKey: activeMonthKey });
    for (const channel of CHANNELS) {
      addCheck(
        checks,
        `dashboard.companyPlan.activeMonth.${activeMonthKey}.${channel}`,
        companyChannel(companyPlan, activeMonthKey, channel),
        dashboardPlan.activeMonth?.channels?.[channel]?.revenue,
        { area: 'dashboard-active', monthKey: activeMonthKey, channel }
      );
    }
  }
}

function auditPlanTruth(checks, expectedMonths, iuDrrSummary) {
  const rows = Array.isArray(iuDrrSummary?.planTruth?.months) ? iuDrrSummary.planTruth.months : [];
  const byMonth = new Map(rows.map((row) => [row.monthKey, row]));
  for (const expected of expectedMonths) {
    const row = byMonth.get(expected.monthKey);
    if (!row) {
      checks.push({ ok: false, name: `planTruth.${expected.monthKey}.exists`, expected: true, actual: false, area: 'planTruth', monthKey: expected.monthKey });
      continue;
    }
    addCheck(checks, `planTruth.${expected.monthKey}.wb.selected`, expected.wbSelected, row.wb?.selectedRevenue, { area: 'planTruth', monthKey: expected.monthKey, platform: 'wb' });
    addCheck(checks, `planTruth.${expected.monthKey}.wb.corporate`, expected.wbCorporate, row.wb?.corporatePlan, { area: 'planTruth', monthKey: expected.monthKey, platform: 'wb' });
    addCheck(checks, `planTruth.${expected.monthKey}.wb.iu`, expected.wbIu, row.wb?.iuPlan, { area: 'planTruth', monthKey: expected.monthKey, platform: 'wb' });
    addSourceCheck(checks, `planTruth.${expected.monthKey}.wb.source`, expected.wbSource, row.wb?.source, { area: 'planTruth', monthKey: expected.monthKey, platform: 'wb', allowedEither: ['corporate_plan', 'iu_contract'] });

    addCheck(checks, `planTruth.${expected.monthKey}.ozon.selected`, expected.ozonSelected, row.ozon?.selectedRevenue, { area: 'planTruth', monthKey: expected.monthKey, platform: 'ozon' });
    addCheck(checks, `planTruth.${expected.monthKey}.ozon.corporate`, expected.ozonCorporate, row.ozon?.corporatePlan, { area: 'planTruth', monthKey: expected.monthKey, platform: 'ozon' });
    addCheck(checks, `planTruth.${expected.monthKey}.ozon.iu40`, expected.ozonIu40, row.ozon?.iuPlan40, { area: 'planTruth', monthKey: expected.monthKey, platform: 'ozon' });
    addSourceCheck(checks, `planTruth.${expected.monthKey}.ozon.source`, expected.ozonSource, row.ozon?.source, { area: 'planTruth', monthKey: expected.monthKey, platform: 'ozon', allowedEither: ['corporate_plan', 'iu_contract_40pct'] });

    for (const [channel, value] of Object.entries(expected.otherChannels)) {
      addCheck(checks, `planTruth.${expected.monthKey}.${channel}`, value, row.otherChannels?.[channel], { area: 'planTruth', monthKey: expected.monthKey, channel });
    }
  }
}

function auditSummaryMonths(checks, expectedMonths, iuDrrSummary) {
  const expectedByMonth = new Map(expectedMonths.map((row) => [row.monthKey, row]));
  const daily = Array.isArray(iuDrrSummary?.daily) ? iuDrrSummary.daily : [];
  for (const month of iuDrrSummary?.months || []) {
    const expected = expectedByMonth.get(month.monthKey);
    if (!expected) continue;
    addCheck(checks, `iuDrr.months.${month.monthKey}.wb.selected`, expected.wbSelected, month.iuRevenueWbPlan, { area: 'iuDrrSummary', monthKey: month.monthKey, platform: 'wb' });
    addCheck(checks, `iuDrr.months.${month.monthKey}.wb.iu`, expected.wbIu, month.iuRevenueWbIuMin, { area: 'iuDrrSummary', monthKey: month.monthKey, platform: 'wb' });
    addCheck(checks, `iuDrr.months.${month.monthKey}.wb.corporate`, expected.wbCorporate, month.iuRevenueWbCorporatePlan, { area: 'iuDrrSummary', monthKey: month.monthKey, platform: 'wb' });
    addSourceCheck(checks, `iuDrr.months.${month.monthKey}.wb.source`, expected.wbSource, month.iuRevenueWbPlanSource, { area: 'iuDrrSummary', monthKey: month.monthKey, platform: 'wb', allowedEither: ['corporate_plan', 'iu_contract'] });
    addCheck(checks, `iuDrr.months.${month.monthKey}.ozon.selected`, expected.ozonSelected, month.iuRevenueOzonPlan, { area: 'iuDrrSummary', monthKey: month.monthKey, platform: 'ozon' });
    addCheck(checks, `iuDrr.months.${month.monthKey}.ozon.iu40`, expected.ozonIu40, month.iuRevenueOzonContractMin, { area: 'iuDrrSummary', monthKey: month.monthKey, platform: 'ozon' });
    addCheck(checks, `iuDrr.months.${month.monthKey}.ozon.corporate`, expected.ozonCorporate, month.iuRevenueOzonCorporatePlan, { area: 'iuDrrSummary', monthKey: month.monthKey, platform: 'ozon' });
    addSourceCheck(checks, `iuDrr.months.${month.monthKey}.ozon.source`, expected.ozonSource, month.iuRevenueOzonPlanSource, { area: 'iuDrrSummary', monthKey: month.monthKey, platform: 'ozon', allowedEither: ['corporate_plan', 'iu_contract_40pct'] });
    addCheck(checks, `iuDrr.months.${month.monthKey}.total`, expected.wbSelected + expected.ozonSelected, month.iuRevenuePlan, { area: 'iuDrrSummary', monthKey: month.monthKey });

    const rows = daily.filter((row) => row.monthKey === month.monthKey);
    const sum = (field) => rows.reduce((total, row) => total + num(row[field]), 0);
    addCheck(checks, `iuDrr.months.${month.monthKey}.wb.toDateDailySum`, sum('targetRevenueWb'), month.iuRevenueWbPlanToDate, { area: 'iuDrrDaily', monthKey: month.monthKey, platform: 'wb' });
    addCheck(checks, `iuDrr.months.${month.monthKey}.wb.adsToDateDailySum`, sum('planSpendWb'), month.iuAdsPlanToDate, { area: 'iuDrrDaily', monthKey: month.monthKey, platform: 'wb' });
    addCheck(checks, `iuDrr.months.${month.monthKey}.ozon.toDateDailySum`, sum('targetRevenueOzon'), month.iuRevenueOzonPlanToDate, { area: 'iuDrrDaily', monthKey: month.monthKey, platform: 'ozon' });
    addCheck(checks, `iuDrr.months.${month.monthKey}.ozon.adsToDateDailySum`, sum('planSpendOzon'), month.iuAdsOzonPlanToDate, { area: 'iuDrrDaily', monthKey: month.monthKey, platform: 'ozon' });
  }
}

function main() {
  const args = parseArgs(process.argv);
  const options = {
    inputDir: path.resolve(args['input-dir'] || path.join(process.cwd(), 'data')),
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(process.cwd(), 'data'))
  };
  const companyPlan = readLayer(options, 'company_plan.json', { months: {} });
  const iuPlan = readLayer(options, 'iu_plan.json', { months: {} });
  const dashboard = readLayer(options, 'dashboard.json', {});
  const iuDrrSummary = readLayer(options, 'iu_drr_summary.json', { months: [], daily: [] });

  const checks = [];
  const expectedMonths = buildExpectedMonths(companyPlan, iuPlan);
  auditCompanyDashboard(checks, companyPlan, dashboard);
  auditPlanTruth(checks, expectedMonths, iuDrrSummary);
  auditSummaryMonths(checks, expectedMonths, iuDrrSummary);

  const failures = checks.filter((check) => !check.ok);
  const monthSummary = expectedMonths.map((row) => ({
    monthKey: row.monthKey,
    wbCorporate: row.wbCorporate,
    wbIu: row.wbIu,
    wbSelected: row.wbSelected,
    wbSource: row.wbSource,
    ozonCorporate: row.ozonCorporate,
    ozonIu40: row.ozonIu40,
    ozonSelected: row.ozonSelected,
    ozonSource: row.ozonSource,
    ya: row.otherChannels.ya,
    corporateTotal: row.corporateTotal
  }));

  console.log(JSON.stringify({
    ok: failures.length === 0,
    inputDir: options.inputDir,
    baseDataDir: options.baseDataDir,
    checkedMonths: expectedMonths.length,
    checks: checks.length,
    failures: failures.slice(0, 50),
    monthSummary
  }, null, 2));

  if (failures.length) process.exitCode = 1;
}

main();
