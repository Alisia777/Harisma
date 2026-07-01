'use strict';

const fs = require('fs');
const path = require('path');

const OZON_IU_LOGIC_RULES_PATH = path.resolve(__dirname, '..', 'data', 'ozon_iu_logic_rules.json');
const WB_IU_LOGIC_RULES_PATH = path.resolve(__dirname, '..', 'data', 'wb_iu_logic_rules.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertOzonIuWorkbookRules(rules) {
  const required = rules?.required || {};
  const missing = [
    'gmvUsesBuyouts',
    'gmvFormulaSalesMinusReturns',
    'gmvIncludesOzonMarketplaceBuyouts',
    'drrSourceBalanceReport',
    'drrExcludesPremiumPlus',
    'drrExcludesOriginalBadge',
    'drrFormulaPromotionExpenseOverSalesMinusReturns'
  ].filter((key) => !required[key]);

  if (missing.length) {
    throw new Error(`Ozon IU workbook logic rules are incomplete: ${missing.join(', ')}`);
  }
  if (!rules?.source?.sha256 || !rules?.source?.workbook) {
    throw new Error('Ozon IU workbook logic rules must include source workbook and sha256.');
  }
}

function assertWbIuRules(rules) {
  const required = rules?.required || {};
  const missing = [
    'wbPlanRateOverrideJune1147',
    'fixedRateReportPresent',
    'fixedRatePeriodPresent',
    'fixedRateSourceWorkbookPresent',
    'fixedRateUsesCabinetRevenue',
    'fixedRateUsesCabinetSpendFact',
    'fixedRateUsesCabinetTargetRevenue',
    'fixedRateFactPriorityFirst',
    'wbRateDoesNotApplyToOzon'
  ].filter((key) => !required[key]);

  if (missing.length) {
    throw new Error(`WB IU logic rules are incomplete: ${missing.join(', ')}`);
  }
  if (!rules?.source?.reportSha256 || !rules?.source?.sourceWorkbook) {
    throw new Error('WB IU logic rules must include fixed-rate report source workbook and sha256.');
  }
}

const WB_IU_LOGIC_RULES = readJson(WB_IU_LOGIC_RULES_PATH);
assertWbIuRules(WB_IU_LOGIC_RULES);
const OZON_IU_LOGIC_RULES = readJson(OZON_IU_LOGIC_RULES_PATH);
assertOzonIuWorkbookRules(OZON_IU_LOGIC_RULES);

const IU_DRR_RULES = Object.freeze({
  version: '20260701-wb-ozon-source-rules-v3',
  history: Object.freeze({
    defaultLookbackDays: 31,
    rule: 'Build current month plus lookback history so 7/14-day cross-month views keep previous-month rows.'
  }),
  wb: Object.freeze({
    platform: 'wb',
    sourceLogic: Object.freeze({
      reportFile: WB_IU_LOGIC_RULES.source.reportFile,
      reportSha256: WB_IU_LOGIC_RULES.source.reportSha256,
      sourceWorkbook: WB_IU_LOGIC_RULES.source.sourceWorkbook,
      sourceArchive: WB_IU_LOGIC_RULES.source.sourceArchive,
      version: WB_IU_LOGIC_RULES.version,
      required: Object.freeze({ ...(WB_IU_LOGIC_RULES.required || {}) })
    }),
    planRateOverrides: Object.freeze({ ...(WB_IU_LOGIC_RULES.canonical.planRateOverrides || {}) }),
    planRule: WB_IU_LOGIC_RULES.canonical.planRateRule,
    factPriority: Object.freeze([...(WB_IU_LOGIC_RULES.canonical.factPriority || [])]),
    fixedRateRule: WB_IU_LOGIC_RULES.canonical.fixedRateRule,
    fixedRatePeriod: Object.freeze({ ...(WB_IU_LOGIC_RULES.canonical.fixedRatePeriod || {}) }),
    fixedRateTotals: Object.freeze({ ...(WB_IU_LOGIC_RULES.canonical.fixedRateTotals || {}) }),
    nonApplicability: WB_IU_LOGIC_RULES.canonical.nonApplicability
  }),
  ozon: Object.freeze({
    platform: 'ozon',
    factMode: 'ozon_finance_balance_gmv_drr_excluding_premium_plus_original_badge',
    sourceLogic: Object.freeze({
      workbook: OZON_IU_LOGIC_RULES.source.workbook,
      sha256: OZON_IU_LOGIC_RULES.source.sha256,
      version: OZON_IU_LOGIC_RULES.version,
      sheets: Object.freeze([...(OZON_IU_LOGIC_RULES.source.sheets || [])]),
      required: Object.freeze({ ...(OZON_IU_LOGIC_RULES.required || {}) })
    }),
    gmvRule: OZON_IU_LOGIC_RULES.canonical.gmvRule,
    drrSourceRule: OZON_IU_LOGIC_RULES.canonical.drrSourceRule,
    drrSpendRule: OZON_IU_LOGIC_RULES.canonical.drrSpendRule,
    drrFormula: OZON_IU_LOGIC_RULES.canonical.formula,
    drrExclusionFields: Object.freeze([
      'drrExcludedPremiumPlus',
      'drrExcludedOriginalBadge'
    ]),
    drrExclusionLabels: Object.freeze([...(OZON_IU_LOGIC_RULES.canonical.exclusions || [])]),
    planRule: 'Ozon plan rate comes from Ozon IU/account benchmark logic and must never inherit a WB plan-rate override.',
    fallbackRule: 'Use Ozon seller analytics revenue/ad facts only when Ozon finance balance data is missing for the day.'
  })
});

module.exports = Object.freeze({
  IU_DRR_RULES,
  IU_DRR_HISTORY_LOOKBACK_DAYS: IU_DRR_RULES.history.defaultLookbackDays,
  OZON_IU_LOGIC_RULES,
  WB_IU_LOGIC_RULES,
  OZON_FINANCE_GMV_DRR_MODE: IU_DRR_RULES.ozon.factMode,
  OZON_FINANCE_DRR_EXCLUSION_FIELDS: IU_DRR_RULES.ozon.drrExclusionFields,
  WB_PLAN_RATE_OVERRIDES: IU_DRR_RULES.wb.planRateOverrides
});
