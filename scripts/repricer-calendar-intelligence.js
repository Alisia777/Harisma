#!/usr/bin/env node
'use strict';

const FIXED_RU_HOLIDAYS = new Set([
  '01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08',
  '02-23', '03-08', '05-01', '05-09', '06-12', '11-04'
]);

function isoDate(value) {
  const stamp = Date.parse(String(value || ''));
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function boolean(value) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'да', 'active', 'активно'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'нет', 'inactive', 'неактивно'].includes(normalized)) return false;
  return false;
}

function calendarDateFactors(value, observation = {}, policy = {}) {
  const date = isoDate(value);
  if (!date) {
    return {
      date: '',
      holiday: false,
      salaryWindow: false,
      promotion: false,
      promotionStart: false,
      promotionEnd: false,
      advertisingChange: false,
      advertisingStart: false,
      advertisingEnd: false,
      exceptional: false,
      demandFactor: 1,
      reasons: []
    };
  }
  const monthDay = date.slice(5);
  const day = Number(date.slice(8, 10));
  const holiday = FIXED_RU_HOLIDAYS.has(monthDay)
    || (Array.isArray(policy.holidays) && policy.holidays.map(isoDate).includes(date));
  const salaryWindows = Array.isArray(policy.salaryDayRanges) && policy.salaryDayRanges.length
    ? policy.salaryDayRanges
    : [[5, 10], [20, 25]];
  const salaryWindow = salaryWindows.some((range) => (
    Array.isArray(range)
    && Number.isFinite(Number(range[0]))
    && Number.isFinite(Number(range[1]))
    && day >= Number(range[0])
    && day <= Number(range[1])
  ));
  const promotion = boolean(
    observation.promoActive
    ?? observation.promotionActive
    ?? observation.promo_active
    ?? observation.promotion_active
  );
  const eventType = String(
    observation.eventType
    || observation.event_type
    || observation.factor
    || ''
  ).trim().toLowerCase();
  const promotionStart = boolean(observation.promotionStart ?? observation.promoStart)
    || ['promotion_start', 'promo_start'].includes(eventType);
  const promotionEnd = boolean(observation.promotionEnd ?? observation.promoEnd)
    || ['promotion_end', 'promo_end'].includes(eventType);
  const advertisingStart = boolean(observation.advertisingStart ?? observation.adStart)
    || ['advertising_start', 'ad_start'].includes(eventType);
  const advertisingEnd = boolean(observation.advertisingEnd ?? observation.adEnd)
    || ['advertising_end', 'ad_end'].includes(eventType);
  const advertisingChange = boolean(
    observation.advertisingChange
    ?? observation.adChange
    ?? observation.advertising_change
  ) || advertisingStart || advertisingEnd;
  const exceptional = promotion
    || promotionStart
    || promotionEnd
    || advertisingChange;
  const holidayDemandPct = Number(policy.holidayDemandPct ?? 0.08);
  const salaryDemandPct = Number(policy.salaryWindowDemandPct ?? 0.05);
  const demandFactor = Math.max(0.5, Math.min(1.5,
    (holiday ? 1 + holidayDemandPct : 1)
    * (salaryWindow ? 1 + salaryDemandPct : 1)
  ));
  return {
    date,
    holiday,
    salaryWindow,
    promotion,
    promotionStart,
    promotionEnd,
    advertisingChange,
    advertisingStart,
    advertisingEnd,
    exceptional,
    demandFactor: Number(demandFactor.toFixed(4)),
    reasons: [
      ...(holiday ? ['ru_holiday'] : []),
      ...(salaryWindow ? ['salary_window'] : []),
      ...(promotion ? ['marketplace_promotion'] : []),
      ...(promotionStart ? ['promotion_start'] : []),
      ...(promotionEnd ? ['promotion_end'] : []),
      ...(advertisingStart ? ['advertising_start'] : []),
      ...(advertisingEnd ? ['advertising_end'] : []),
      ...(advertisingChange && !advertisingStart && !advertisingEnd ? ['advertising_change'] : [])
    ]
  };
}

function calendarRegressionFeatures(factors = {}) {
  return [
    factors.holiday ? 1 : 0,
    factors.salaryWindow ? 1 : 0,
    factors.promotion ? 1 : 0,
    factors.promotionStart ? 1 : 0,
    factors.promotionEnd ? 1 : 0,
    factors.advertisingChange ? 1 : 0
  ];
}

module.exports = {
  FIXED_RU_HOLIDAYS,
  calendarDateFactors,
  calendarRegressionFeatures,
  isoDate
};
