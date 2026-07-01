'use strict';

const IU_DRR_RULES = Object.freeze({
  version: '20260701-wb-ozon-hardcoded-v1',
  history: Object.freeze({
    defaultLookbackDays: 31,
    rule: 'Build current month plus lookback history so 7/14-day cross-month views keep previous-month rows.'
  }),
  wb: Object.freeze({
    platform: 'wb',
    planRateOverrides: Object.freeze({
      '2026-06': 0.1147
    }),
    planRule: 'WB plan rate uses month-specific WB overrides first, then WB contract marketing rate.',
    factPriority: Object.freeze([
      'wb_fixed_rate_cabinet_report',
      'wb_iu_control_workbook',
      'wb_api_calibrated_to_iu_control',
      'platform_api_raw'
    ]),
    fixedRateRule: 'When a WB fixed-rate cabinet report has a day, revenue, target and ad spend facts must come from that report.'
  }),
  ozon: Object.freeze({
    platform: 'ozon',
    factMode: 'ozon_finance_balance_gmv_drr_excluding_premium_plus_original_badge',
    gmvRule: 'GMV = sales/revenue minus returns from Ozon Finance/realization balance.',
    drrSpendRule: 'DRR numerator = Ozon promotion/expense balance spend minus excluded Premium Plus and Original Badge rows.',
    drrExclusionFields: Object.freeze([
      'drrExcludedPremiumPlus',
      'drrExcludedOriginalBadge'
    ]),
    drrExclusionLabels: Object.freeze([
      'Premium Plus',
      'Original Badge'
    ]),
    planRule: 'Ozon plan rate comes from Ozon IU/account benchmark logic and must never inherit a WB plan-rate override.',
    fallbackRule: 'Use Ozon seller analytics revenue/ad facts only when Ozon finance balance data is missing for the day.'
  })
});

module.exports = Object.freeze({
  IU_DRR_RULES,
  IU_DRR_HISTORY_LOOKBACK_DAYS: IU_DRR_RULES.history.defaultLookbackDays,
  OZON_FINANCE_GMV_DRR_MODE: IU_DRR_RULES.ozon.factMode,
  OZON_FINANCE_DRR_EXCLUSION_FIELDS: IU_DRR_RULES.ozon.drrExclusionFields,
  WB_PLAN_RATE_OVERRIDES: IU_DRR_RULES.wb.planRateOverrides
});
