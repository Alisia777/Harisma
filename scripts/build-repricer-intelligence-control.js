#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  dateAgeDays,
  normalizeKey
} = require('./repricer-market-intelligence');
const { calendarDateFactors, isoDate } = require('./repricer-calendar-intelligence');

function parseArgs(argv = process.argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    const key = token.slice(2, separator >= 0 ? separator : undefined);
    if (separator >= 0) {
      args[key] = token.slice(separator + 1);
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

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function finite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function round(value, digits = 6) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function dateFromText(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  const match = text.match(/20\d{2}[-_.](?:0[1-9]|1[0-2])[-_.](?:0[1-9]|[12]\d|3[01])/);
  return match ? match[0].replace(/[_.]/g, '-') : '';
}

function sourceState({
  key,
  value,
  asOf,
  referenceDate,
  maxAgeDays,
  status = '',
  validFrom = '',
  validTo = '',
  required = true
}) {
  const date = isoDate(asOf);
  const ageDays = date ? dateAgeDays(date, referenceDate) : null;
  const activeContract = validFrom && validTo
    ? referenceDate >= isoDate(validFrom) && referenceDate <= isoDate(validTo)
    : false;
  const normalizedStatus = String(status || '').trim().toLowerCase();
  let state = 'fresh';
  let usable = true;
  let reason = '';
  if (value === null || value === undefined || value === '') {
    state = 'missing';
    usable = !required;
    reason = `${key}_missing`;
  } else if (['stale', 'blocked', 'missing', 'failed', 'error'].includes(normalizedStatus)) {
    state = normalizedStatus === 'stale' ? 'stale' : 'blocked';
    usable = false;
    reason = `${key}_${state}`;
  } else if (activeContract) {
    state = 'fresh';
  } else if (ageDays === null || ageDays < 0) {
    state = 'unknown';
    usable = false;
    reason = `${key}_date_unknown`;
  } else if (ageDays > maxAgeDays) {
    state = 'stale';
    usable = false;
    reason = `${key}_stale`;
  }
  return {
    key,
    state,
    usable,
    asOf: date,
    ageDays: ageDays === null ? null : round(ageDays, 2),
    maxAgeDays,
    sourceStatus: normalizedStatus,
    valuePresent: value !== null && value !== undefined && value !== '',
    contractValidTo: isoDate(validTo),
    reason
  };
}

function dataQualityForRow(row = {}, context = {}) {
  const facts = row.facts || {};
  const economics = row.economics || {};
  const policy = context.economicsPolicy?.dataFreshness || {};
  const referenceDate = isoDate(context.referenceDate || context.canonical?.freshness_reference_date || new Date());
  const costAsOf = isoDate(
    context.workbench?.costImportAppliedAt
    || context.skuMatrix?.generatedAt
    || dateFromText(economics?.sources?.cost)
  );
  const commissionContract = economics.commission_contract || {};
  const commissionAsOf = isoDate(
    commissionContract.asOf
    || commissionContract.validFrom
    || dateFromText(commissionContract.source)
    || context.economicsPolicy?.version
  );
  const sources = [
    sourceState({
      key: 'price',
      value: facts.seller_price,
      asOf: facts.as_of,
      referenceDate,
      maxAgeDays: finite(policy.priceMaxAgeDays) ?? 2,
      status: facts.price_freshness
    }),
    sourceState({
      key: 'commission',
      value: economics.commission_pct,
      asOf: commissionAsOf,
      referenceDate,
      maxAgeDays: finite(policy.commissionMaxAgeDays) ?? 31,
      validFrom: commissionContract.validFrom,
      validTo: commissionContract.validTo
    }),
    sourceState({
      key: 'advertising',
      value: economics.internal_advertising_pct ?? economics.internal_advertising_per_unit,
      asOf: economics.internal_advertising_as_of,
      referenceDate,
      maxAgeDays: finite(policy.advertisingMaxAgeDays) ?? 3,
      status: economics.internal_advertising_status
    }),
    sourceState({
      key: 'cost',
      value: economics.cost,
      asOf: costAsOf,
      referenceDate,
      maxAgeDays: finite(policy.costMaxAgeDays) ?? 90
    }),
    sourceState({
      key: 'stock',
      value: facts.stock,
      asOf: facts?.sources?.stock?.as_of || facts.as_of,
      referenceDate,
      maxAgeDays: finite(policy.stockMaxAgeDays) ?? 2,
      status: facts.stock_source_status
    })
  ];
  const unusable = sources.filter((source) => !source.usable);
  return {
    status: unusable.length ? 'blocked' : 'fresh',
    usable: unusable.length === 0,
    rule: 'stale_or_missing_source_is_excluded_never_zero',
    blockers: unusable.map((source) => source.reason),
    sources
  };
}

function contributionAt(price, economics = {}) {
  const value = finite(price);
  if (value === null || value <= 0) return null;
  const commission = finite(economics.commission_pct) ?? 0;
  const advertisingPct = finite(economics.internal_advertising_pct) ?? 0;
  const tax = finite(economics.tax_pct) ?? 0;
  const cost = finite(economics.cost);
  const platformCosts = finite(economics.platform_costs_per_unit, economics.fixed_costs_per_unit);
  const advertisingRub = finite(economics.internal_advertising_per_unit) ?? 0;
  if (cost === null || platformCosts === null) return null;
  return value * (1 - commission - advertisingPct - tax) - cost - platformCosts - advertisingRub;
}

function historyMap(history = {}) {
  const map = new Map();
  (history?.rows || []).forEach((row) => {
    const key = `${String(row.platform || '').toLowerCase()}|${normalizeKey(row.article_key || row.articleKey)}`;
    map.set(key, row);
  });
  return map;
}

function backtestRow(row = {}, historyRecord = {}, options = {}) {
  const recommendation = row.recommendation || {};
  const targetPrice = finite(recommendation.price);
  const currentPrice = finite(row?.facts?.client_price, row?.facts?.seller_price);
  const elasticitySignal = row?.demand_intelligence?.market_intelligence?.elasticity || {};
  const elasticity = finite(elasticitySignal.value, -0.9);
  const asOf = isoDate(options.asOf || new Date());
  const cutoff = new Date(Date.parse(`${asOf}T00:00:00Z`) - (Number(options.days || 60) - 1) * 86400000)
    .toISOString().slice(0, 10);
  const observations = (historyRecord?.observations || [])
    .filter((item) => item.date >= cutoff && item.date <= asOf)
    .filter((item) => finite(item.units) !== null && finite(item.client_price, item.seller_price) > 0);
  if (targetPrice === null || targetPrice <= 0 || currentPrice === null || observations.length < 28) {
    return {
      status: 'insufficient',
      observedDays: observations.length,
      reason: targetPrice === null ? 'recommendation_missing' : 'history_below_28_days'
    };
  }
  let baselineRevenue = 0;
  let scenarioRevenue = 0;
  let baselineContribution = 0;
  let scenarioContribution = 0;
  let baselineUnits = 0;
  let scenarioUnits = 0;
  let exceptionalDaysExcluded = 0;
  let unusableEconomics = false;
  observations.forEach((item) => {
    const factors = calendarDateFactors(item.date, item, options.calendarPolicy || {});
    if (factors.exceptional) {
      exceptionalDaysExcluded += 1;
      return;
    }
    const units = Math.max(0, finite(item.units) ?? 0);
    const actualPrice = finite(item.client_price, item.seller_price);
    const quantityMultiplier = Math.max(0.5, Math.min(1.75, (targetPrice / actualPrice) ** elasticity));
    const counterfactualUnits = units * quantityMultiplier;
    const actualContribution = contributionAt(actualPrice, row.economics);
    const targetContribution = contributionAt(targetPrice, row.economics);
    if (actualContribution === null || targetContribution === null) unusableEconomics = true;
    baselineUnits += units;
    scenarioUnits += counterfactualUnits;
    baselineRevenue += units * actualPrice;
    scenarioRevenue += counterfactualUnits * targetPrice;
    if (actualContribution !== null) baselineContribution += units * actualContribution;
    if (targetContribution !== null) scenarioContribution += counterfactualUnits * targetContribution;
  });
  if (unusableEconomics) {
    return {
      status: 'insufficient',
      observedDays: observations.length,
      reason: 'economics_incomplete'
    };
  }
  const revenueDelta = scenarioRevenue - baselineRevenue;
  const contributionDelta = scenarioContribution - baselineContribution;
  return {
    status: elasticitySignal.usable ? 'modelled' : 'modelled_low_confidence',
    model: '60d_counterfactual_constant_target_price_v1',
    causalClaim: false,
    observedDays: observations.length,
    exceptionalDaysExcluded,
    targetPrice: round(targetPrice, 2),
    elasticity: round(elasticity, 4),
    elasticitySource: elasticitySignal.source || 'policy_fallback',
    baseline: {
      units: round(baselineUnits, 2),
      turnoverRub: round(baselineRevenue, 2),
      contributionRub: round(baselineContribution, 2)
    },
    scenario: {
      units: round(scenarioUnits, 2),
      turnoverRub: round(scenarioRevenue, 2),
      contributionRub: round(scenarioContribution, 2)
    },
    delta: {
      units: round(scenarioUnits - baselineUnits, 2),
      turnoverRub: round(revenueDelta, 2),
      turnoverPct: baselineRevenue ? round(revenueDelta / baselineRevenue, 6) : null,
      contributionRub: round(contributionDelta, 2),
      contributionPct: baselineContribution ? round(contributionDelta / Math.abs(baselineContribution), 6) : null
    }
  };
}

function metricWindow(observations = [], fromDate = '', toDate = '') {
  const rows = observations.filter((row) => row.date >= fromDate && row.date <= toDate);
  const priced = rows.filter((row) => finite(row.units) !== null && finite(row.client_price, row.seller_price) > 0);
  const units = priced.reduce((sum, row) => sum + Math.max(0, finite(row.units) || 0), 0);
  const turnoverRub = priced.reduce(
    (sum, row) => sum + Math.max(0, finite(row.units) || 0) * finite(row.client_price, row.seller_price),
    0
  );
  const average = (values = []) => {
    const available = values.filter((value) => finite(value) !== null).map((value) => finite(value));
    return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
  };
  const sumAvailable = (values = []) => {
    const available = values.filter((value) => finite(value) !== null).map((value) => finite(value));
    return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
  };
  const drrValues = rows.map((row) => finite(
    row.drr_pct,
    row.drrPct,
    row.internal_advertising_pct,
    row.advertising_pct
  ));
  const marginPctValues = rows.map((row) => finite(
    row.margin_pct,
    row.marginPct,
    row.contribution_pct,
    row.contributionPct
  ));
  const marginRub = sumAvailable(rows.map((row) => finite(
    row.margin_rub,
    row.marginRub,
    row.contribution_rub,
    row.contributionRub
  )));
  const stockValues = rows.map((row) => finite(
    row.stock,
    row.stock_units,
    row.stockUnits,
    row.available
  ));
  const availableStock = stockValues.filter((value) => value !== null);
  const clientPrice = average(rows.map((row) => finite(row.client_price, row.clientPrice)));
  const sellerPrice = average(rows.map((row) => finite(row.seller_price, row.sellerPrice)));
  return {
    observedDays: priced.length,
    units: round(units, 2),
    turnoverRub: round(turnoverRub, 2),
    sellerPrice: round(sellerPrice, 2),
    clientPrice: round(clientPrice, 2),
    marginPct: round(average(marginPctValues), 6),
    marginRub: round(marginRub, 2),
    drrPct: round(average(drrValues), 6),
    stockUnits: availableStock.length ? round(availableStock.at(-1), 2) : null
  };
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function outcomeDelta(before = {}, after = {}) {
  const delta = (left, right, digits = 2) => (
    finite(left) === null || finite(right) === null ? null : round(finite(right) - finite(left), digits)
  );
  return {
    units: delta(before.units, after.units),
    turnoverRub: delta(before.turnoverRub, after.turnoverRub),
    turnoverPct: finite(before.turnoverRub) > 0 && finite(after.turnoverRub) !== null
      ? round((finite(after.turnoverRub) - finite(before.turnoverRub)) / finite(before.turnoverRub), 6)
      : null,
    marginPctPoints: delta(before.marginPct, after.marginPct, 6),
    marginRub: delta(before.marginRub, after.marginRub),
    drrPctPoints: delta(before.drrPct, after.drrPct, 6),
    stockUnits: delta(before.stockUnits, after.stockUnits)
  };
}

function outcomeForecast(action = {}, checkpointDays = 0) {
  const forecast = action.forecast || action.backtest || {};
  const target = forecast?.checkpoints?.[checkpointDays] || forecast?.checkpoints?.[String(checkpointDays)] || {};
  return {
    sellerPrice: finite(action.expectedSellerPrice, action.requestedSellerPrice),
    clientPrice: finite(action.expectedClientPriceAfter),
    units: finite(target.units, forecast.units),
    turnoverRub: finite(target.turnoverRub, forecast.turnoverRub),
    marginPct: finite(target.marginPct, action.expectedMarginPct, action.marginPct),
    marginRub: finite(target.marginRub, forecast.marginRub),
    drrPct: finite(target.drrPct, forecast.drrPct),
    stockUnits: finite(target.stockUnits, forecast.stockUnits)
  };
}

function forecastVsActual(forecast = {}, actual = {}) {
  const difference = (expected, observed, digits = 2) => (
    finite(expected) === null || finite(observed) === null
      ? null
      : round(finite(observed) - finite(expected), digits)
  );
  return {
    units: difference(forecast.units, actual.units),
    turnoverRub: difference(forecast.turnoverRub, actual.turnoverRub),
    marginPctPoints: difference(forecast.marginPct, actual.marginPct, 6),
    marginRub: difference(forecast.marginRub, actual.marginRub),
    drrPctPoints: difference(forecast.drrPct, actual.drrPct, 6),
    stockUnits: difference(forecast.stockUnits, actual.stockUnits)
  };
}

function buildOutcomeRows(receipt = {}, history = {}, checkpointDays = [3, 7, 14, 30]) {
  if (!Array.isArray(receipt?.actions) || !receipt.actions.length) return [];
  const map = historyMap(history);
  const appliedDate = isoDate(receipt.generatedAt);
  return receipt.actions.map((action) => {
    const record = map.get(`${String(action.platform || '').toLowerCase()}|${normalizeKey(action.articleKey)}`) || {};
    const observations = record.observations || [];
    const checkpoints = checkpointDays.map((days) => {
      const before = metricWindow(observations, addDays(appliedDate, -days), addDays(appliedDate, -1));
      const after = metricWindow(observations, addDays(appliedDate, 1), addDays(appliedDate, days));
      const minimumObservedDays = Math.max(2, Math.ceil(days * 0.6));
      const ready = before.observedDays >= minimumObservedDays && after.observedDays >= minimumObservedDays;
      const forecast = outcomeForecast(action, days);
      return {
        day: days,
        evaluateFrom: addDays(appliedDate, 1),
        evaluateTo: addDays(appliedDate, days),
        status: ready ? 'evaluated' : `waiting_day_${days}`,
        before,
        after,
        delta: ready ? outcomeDelta(before, after) : null,
        forecast,
        forecastVsActual: ready ? forecastVsActual(forecast, after) : null,
        unavailableMetrics: [
          before.drrPct === null || after.drrPct === null ? 'drr_daily_history' : '',
          before.stockUnits === null || after.stockUnits === null ? 'stock_daily_history' : '',
          before.marginPct === null || after.marginPct === null ? 'historical_unit_economics' : ''
        ].filter(Boolean)
      };
    });
    const evaluated = checkpoints.filter((checkpoint) => checkpoint.status === 'evaluated');
    const latest = evaluated.at(-1) || checkpoints[0];
    return {
      id: `price-outcome:${String(action.platform || '').toLowerCase()}:${normalizeKey(action.articleKey)}:${appliedDate}`,
      platform: String(action.platform || '').toLowerCase(),
      articleKey: action.articleKey,
      appliedAt: receipt.generatedAt || '',
      price: {
        sellerBefore: finite(action.currentSellerPrice),
        sellerAfter: finite(action.expectedSellerPrice, action.requestedSellerPrice),
        clientBefore: finite(action.currentClientPrice),
        clientAfter: finite(action.expectedClientPriceAfter)
      },
      checkpointDays,
      checkpoints,
      status: evaluated.length
        ? (evaluated.length === checkpoints.length ? 'evaluated_all_checkpoints' : 'evaluating')
        : 'waiting_day_3',
      before: latest.before,
      after: latest.after,
      delta: latest.status === 'evaluated' ? latest.delta : null,
      unavailableMetrics: [...new Set(checkpoints.flatMap((checkpoint) => checkpoint.unavailableMetrics))],
      learningEligible: evaluated.length > 0,
      note: 'Checkpoints 3/7/14/30 compare equal before/after windows. Missing DRR, margin or stock history remains null and is never replaced by zero.'
    };
  });
}

function buildCalendarSnapshot({ asOf, days = 60, history = {}, economicsPolicy = {} } = {}) {
  const reference = isoDate(asOf || new Date());
  const calendarPolicy = economicsPolicy?.marketIntelligence?.calendarEvents || {};
  const byDate = new Map();
  for (let offset = -days + 1; offset <= 14; offset += 1) {
    const date = addDays(reference, offset);
    byDate.set(date, calendarDateFactors(date, {}, calendarPolicy));
  }
  const skuEvents = [];
  (history?.rows || []).forEach((row) => {
    (row.observations || []).forEach((observation) => {
      const factors = calendarDateFactors(observation.date, observation, calendarPolicy);
      if (!factors.exceptional) return;
      skuEvents.push({
        platform: row.platform,
        articleKey: row.article_key,
        date: factors.date,
        reasons: factors.reasons
      });
    });
  });
  const dates = [...byDate.values()];
  return {
    schema: 'repricer-calendar-factors-v1',
    generatedAt: new Date().toISOString(),
    asOfDate: reference,
    model: 'ru_holidays_salary_windows_marketplace_events_v1',
    policy: {
      salaryDayRanges: calendarPolicy.salaryDayRanges || [[5, 10], [20, 25]],
      holidayDemandPct: finite(calendarPolicy.holidayDemandPct) ?? 0.08,
      salaryWindowDemandPct: finite(calendarPolicy.salaryWindowDemandPct) ?? 0.05,
      promotionsExcludedFromElasticity: true,
      advertisingChangesExcludedFromElasticity: true
    },
    summary: {
      dates: dates.length,
      holidays: dates.filter((row) => row.holiday).length,
      salaryWindowDays: dates.filter((row) => row.salaryWindow).length,
      skuExceptionalEvents: skuEvents.length
    },
    dates,
    skuEvents
  };
}

function buildLearningReport({
  canonical = {},
  history = {},
  receipt = {},
  economicsPolicy = {},
  asOf = '',
  lookbackDays = 60
} = {}) {
  const reference = isoDate(asOf || canonical.freshness_reference_date || new Date());
  const map = historyMap(history);
  const rows = (canonical.rows || [])
    .filter((row) => ['wb', 'ozon'].includes(String(row.platform || '').toLowerCase()))
    .map((row) => {
      const result = backtestRow(
        row,
        map.get(`${String(row.platform).toLowerCase()}|${normalizeKey(row.article_key)}`),
        {
          asOf: reference,
          days: lookbackDays,
          calendarPolicy: economicsPolicy?.marketIntelligence?.calendarEvents || {}
        }
      );
      return {
        platform: row.platform,
        articleKey: row.article_key,
        lifecycle: row?.facts?.lifecycle_key || '',
        currentPrice: finite(row?.facts?.client_price, row?.facts?.seller_price),
        proposedPrice: finite(row?.recommendation?.expected_client_price_after, row?.recommendation?.price),
        ...result
      };
    });
  const modelled = rows.filter((row) => /^modelled/.test(row.status));
  const totals = modelled.reduce((acc, row) => {
    acc.baselineTurnoverRub += finite(row?.baseline?.turnoverRub) || 0;
    acc.scenarioTurnoverRub += finite(row?.scenario?.turnoverRub) || 0;
    acc.baselineContributionRub += finite(row?.baseline?.contributionRub) || 0;
    acc.scenarioContributionRub += finite(row?.scenario?.contributionRub) || 0;
    return acc;
  }, {
    baselineTurnoverRub: 0,
    scenarioTurnoverRub: 0,
    baselineContributionRub: 0,
    scenarioContributionRub: 0
  });
  const outcomes = buildOutcomeRows(receipt, history);
  const checkpointSummary = Object.fromEntries([3, 7, 14, 30].map((day) => {
    const checkpoints = outcomes
      .map((row) => (row.checkpoints || []).find((checkpoint) => checkpoint.day === day))
      .filter(Boolean);
    return [day, {
      events: checkpoints.length,
      evaluated: checkpoints.filter((checkpoint) => checkpoint.status === 'evaluated').length,
      waiting: checkpoints.filter((checkpoint) => checkpoint.status !== 'evaluated').length
    }];
  }));
  return {
    schema: 'repricer-learning-report-v1',
    generatedAt: new Date().toISOString(),
    asOfDate: reference,
    lookbackDays,
    status: modelled.length ? 'ready_for_calibration' : 'insufficient_history',
    disclaimer: 'Counterfactual replay is a calibration aid, not a causal promise. Only verified applied-price events enter outcome learning.',
    backtest: {
      model: '60d_counterfactual_constant_target_price_v1',
      causalClaim: false,
      summary: {
        rows: rows.length,
        modelledRows: modelled.length,
        highConfidenceRows: modelled.filter((row) => row.status === 'modelled').length,
        insufficientRows: rows.length - modelled.length,
        baselineTurnoverRub: round(totals.baselineTurnoverRub, 2),
        scenarioTurnoverRub: round(totals.scenarioTurnoverRub, 2),
        turnoverDeltaRub: round(totals.scenarioTurnoverRub - totals.baselineTurnoverRub, 2),
        turnoverDeltaPct: totals.baselineTurnoverRub
          ? round((totals.scenarioTurnoverRub - totals.baselineTurnoverRub) / totals.baselineTurnoverRub, 6)
          : null,
        baselineContributionRub: round(totals.baselineContributionRub, 2),
        scenarioContributionRub: round(totals.scenarioContributionRub, 2),
        contributionDeltaRub: round(totals.scenarioContributionRub - totals.baselineContributionRub, 2),
        contributionDeltaPct: totals.baselineContributionRub
          ? round((totals.scenarioContributionRub - totals.baselineContributionRub) / Math.abs(totals.baselineContributionRub), 6)
          : null
      },
      rows
    },
    outcomes: {
      evaluationWindowDays: [3, 7, 14, 30],
      summary: {
        events: outcomes.length,
        evaluated: outcomes.filter((row) => row.learningEligible).length,
        fullyEvaluated: outcomes.filter((row) => row.status === 'evaluated_all_checkpoints').length,
        waiting: outcomes.filter((row) => !row.learningEligible).length,
        checkpoints: checkpointSummary
      },
      rows: outcomes
    }
  };
}

function riskForRow(row = {}, quality = {}) {
  const change = Math.abs(finite(row?.recommendation?.change_pct) || 0);
  const margin = finite(row?.recommendation?.margin_pct);
  const lifecycle = String(row?.facts?.lifecycle_key || '').toLowerCase();
  const minMargin = lifecycle === 'exit'
    ? finite(row?.policy?.liquidation_min_margin_pct, 0)
    : finite(row?.policy?.min_margin_pct, row?.policy?.target_margin_pct);
  const reasons = [];
  if (!quality.usable) reasons.push('data_quality_blocked');
  if (change > 0.1 + 1e-9) reasons.push('sharp_price_change');
  if (change >= 1) reasons.push('extreme_price_change');
  if (margin !== null && minMargin !== null && margin + 1e-9 < minMargin) reasons.push('margin_below_minimum');
  if (row?.facts?.partial_oos || row?.facts?.oos_risk_status === 'risk') reasons.push('oos_risk');
  const level = reasons.includes('extreme_price_change') || reasons.includes('data_quality_blocked')
    ? 'high'
    : (reasons.length ? 'medium' : 'low');
  return { level, reasons };
}

function automationPolicyForRow(row = {}, quality = {}) {
  const currentPrice = finite(row?.facts?.seller_price);
  const proposedPrice = finite(row?.recommendation?.seller_price_to_upload, row?.recommendation?.price);
  const signedChangePct = currentPrice > 0 && proposedPrice !== null
    ? (proposedPrice - currentPrice) / currentPrice
    : finite(row?.recommendation?.change_pct);
  const absoluteChangePct = Math.abs(signedChangePct || 0);
  const currentMargin = finite(row?.recommendation?.current_margin_pct);
  const proposedMargin = finite(row?.recommendation?.margin_pct);
  const marginDrop = currentMargin !== null
    && proposedMargin !== null
    && proposedMargin + 1e-9 < currentMargin;
  const statusChange = String(row?.approval_gate?.type || '').toUpperCase() === 'PRODUCT_STATUS_CHANGE';
  const policyApproval = String(row?.approval_gate?.type || '').toUpperCase() === 'MARGIN_POLICY_REVIEW';
  let tier = 'automatic';
  let confirmationsRequired = 0;
  let taskRequired = false;
  let reason = 'change_within_3pct_all_sources_fresh';
  if (!quality.usable) {
    tier = 'blocked';
    reason = 'source_data_not_fully_fresh';
  } else if (absoluteChangePct > 0.1 + 1e-9 || marginDrop || statusChange) {
    tier = 'double_confirmation';
    confirmationsRequired = 2;
    taskRequired = true;
    reason = statusChange
      ? 'status_change_requires_task_and_double_confirmation'
      : (marginDrop
        ? 'margin_drop_requires_task_and_double_confirmation'
        : 'price_change_above_10pct_requires_task_and_double_confirmation');
  } else if (absoluteChangePct > 0.03 + 1e-9 || policyApproval || row?.approval_gate?.required === true) {
    tier = 'rop_approval';
    confirmationsRequired = 1;
    taskRequired = true;
    reason = policyApproval
      ? 'margin_policy_requires_rop'
      : 'price_change_between_3_and_10pct_requires_rop';
  }
  return {
    tier,
    signedChangePct: round(signedChangePct, 6),
    absoluteChangePct: round(absoluteChangePct, 6),
    fullyFresh: quality.usable === true,
    marginDrop,
    statusChange,
    taskRequired,
    confirmationsRequired,
    confirmationStages: tier === 'double_confirmation'
      ? ['ROP_TASK', 'API_APPLY_PREVIEW']
      : (tier === 'rop_approval' ? ['ROP_TASK'] : []),
    autoApplyEligible: tier === 'automatic',
    reason
  };
}

function priceExplanation(row = {}, quality = {}, automation = {}) {
  const currentPrice = finite(row?.facts?.seller_price);
  const proposedPrice = finite(row?.recommendation?.seller_price_to_upload, row?.recommendation?.price);
  const changePct = currentPrice > 0 && proposedPrice !== null
    ? (proposedPrice - currentPrice) / currentPrice
    : finite(row?.recommendation?.change_pct);
  const reasonCodes = row?.recommendation?.reason_codes || [];
  const oos = row?.facts?.partial_oos
    || row?.facts?.oos_risk_status === 'risk'
    || finite(row?.facts?.stock) === 0;
  const marginReason = reasonCodes.some((reason) => /margin|floor|below_min/i.test(String(reason)));
  const insufficientCompetitors = row?.demand_intelligence?.market_intelligence?.competitors?.usable !== true
    || row?.demand_intelligence?.market_intelligence?.competitor_history?.usable !== true;
  const percent = Number.isFinite(changePct) ? Math.round(Math.abs(changePct) * 1000) / 10 : null;
  let headline = 'Цена оставлена без изменения.';
  if (oos && !(changePct < -1e-9)) {
    headline = 'Не снизили цену из-за OOS или риска дефицита.';
  } else if (changePct > 1e-9) {
    headline = `Подняли цену на ${percent}%${marginReason ? ' из-за защиты маржи' : ' по расчёту спроса и коридора'}.`;
  } else if (changePct < -1e-9) {
    headline = `Снизили цену на ${percent}%${marginReason ? ', сохранив MIN-маржу' : ' по сигналу спроса'}.`;
  }
  const details = [];
  const lifecycle = String(row?.facts?.lifecycle_key || '').toLowerCase();
  const minimum = lifecycle === 'exit'
    ? finite(row?.policy?.liquidation_min_margin_pct, 0)
    : finite(row?.policy?.min_margin_pct, row?.policy?.target_margin_pct);
  const after = finite(row?.recommendation?.margin_pct);
  if (minimum !== null && after !== null) {
    details.push(`Маржа после изменения ${(after * 100).toFixed(1)}%; минимальный порог ${(minimum * 100).toFixed(1)}%.`);
  }
  if (automation.tier === 'automatic') details.push('Изменение до 3% и все обязательные источники свежие.');
  if (automation.tier === 'rop_approval') details.push('Нужно подтверждение РОП.');
  if (automation.tier === 'double_confirmation') details.push('Нужны задача РОП и повторное подтверждение перед API-загрузкой.');
  if (!quality.usable) details.push(`Расчёт заблокирован: ${(quality.blockers || []).join(', ')}.`);
  const competitorNote = insufficientCompetitors
    ? 'Конкуренты не учтены в цене — недостаточно надёжной текущей выборки или истории.'
    : 'Конкурентный сигнал учтён в пределах защитного лимита.';
  return {
    headline,
    details,
    competitorNote,
    reasonCodes,
    humanReadable: [headline, ...details, competitorNote].join(' ')
  };
}

function summarizeDataFreshness(rows = []) {
  const sourceKeys = ['price', 'commission', 'advertising', 'cost', 'stock'];
  const summaries = Object.fromEntries(sourceKeys.map((key) => {
    const sources = rows
      .map((row) => (row?.dataQuality?.sources || []).find((source) => source.key === key))
      .filter(Boolean);
    const dates = sources.map((source) => source.asOf).filter(Boolean).sort();
    const usableRows = sources.filter((source) => source.usable).length;
    const state = !sources.length
      ? 'missing'
      : (usableRows === sources.length ? 'fresh' : 'blocked');
    return [key, {
      key,
      state,
      usableRows,
      totalRows: sources.length,
      asOf: dates.at(-1) || '',
      oldestAsOf: dates[0] || '',
      refreshMode: key === 'commission' ? 'contract_or_finance_source_revalidated' : 'source_snapshot'
    }];
  }));
  const competitorDates = rows
    .map((row) => row?.market?.competitorIngestion?.observedAt || row?.market?.competitors?.observedAt || '')
    .filter(Boolean)
    .sort();
  const competitorOffers = rows.reduce(
    (sum, row) => sum + Math.max(0, finite(row?.market?.competitorIngestion?.offers) || 0),
    0
  );
  const usableCompetitorRows = rows.filter((row) => row?.market?.competitors?.usable === true).length;
  summaries.competitors = {
    key: 'competitors',
    state: usableCompetitorRows > 0 ? 'fresh' : (competitorDates.length ? 'advisory' : 'missing'),
    usableRows: usableCompetitorRows,
    totalRows: rows.length,
    offers: competitorOffers,
    asOf: competitorDates.at(-1) || '',
    oldestAsOf: competitorDates[0] || '',
    refreshMode: 'competitor_snapshot_and_history'
  };
  summaries.client_price = {
    ...summaries.price,
    key: 'client_price',
    refreshMode: 'marketplace_client_price_with_current_discount'
  };
  summaries.oos = {
    ...summaries.stock,
    key: 'oos',
    refreshMode: 'direct_stock_snapshot'
  };
  return {
    rule: 'each_source_has_its_own_timestamp_and_missing_never_becomes_zero',
    allRequiredFresh: ['price', 'commission', 'advertising', 'cost', 'stock']
      .every((key) => summaries[key].state === 'fresh'),
    sources: summaries
  };
}

function buildStatusTasks(canonical = {}, skuMatrix = {}) {
  const nameMap = new Map((skuMatrix?.items || []).map((item) => [
    normalizeKey(item.articleKey || item.article),
    item
  ]));
  const groups = new Map();
  (canonical?.rows || [])
    .filter((row) => ['wb', 'ozon'].includes(String(row.platform || '').toLowerCase()))
    .forEach((row) => {
      const key = normalizeKey(row.article_key);
      const group = groups.get(key) || { articleKey: row.article_key, rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    });
  const tasks = [];
  groups.forEach((group, key) => {
    const matrix = nameMap.get(key) || {};
    const lifecycle = String(group.rows[0]?.facts?.lifecycle_key || '').toLowerCase();
    const currentStatus = String(group.rows[0]?.facts?.product_status || matrix.status || '').trim();
    const totalStock = group.rows.reduce((sum, row) => sum + Math.max(0, finite(row?.facts?.stock) || 0), 0);
    const totalInbound = group.rows.reduce((sum, row) => sum + Math.max(0, finite(row?.facts?.inbound) || 0), 0);
    const sales28 = group.rows.reduce((sum, row) => sum + Math.max(0, finite(row?.demand_intelligence?.sales_28d_units) || 0), 0);
    let proposedStatus = currentStatus;
    let reason = '';
    let strategy = '';
    if (lifecycle === 'exit' && totalStock <= 0 && totalInbound <= 0) {
      proposedStatus = 'Стоп';
      reason = 'exit_stock_exhausted';
    } else if (lifecycle === 'exit' && totalStock > 0) {
      proposedStatus = 'Вывод';
      reason = 'exit_liquidation_active';
      strategy = 'liquidate_without_negative_margin';
    } else if (lifecycle === 'new' && sales28 >= 10 && totalStock > 0) {
      proposedStatus = 'Активный';
      reason = 'new_sku_has_repeatable_demand';
    }
    if (!reason) return;
    tasks.push({
      id: `sku-status:${key}:${normalizeKey(proposedStatus)}`,
      articleKey: group.articleKey,
      name: matrix.name || '',
      currentStatus,
      proposedStatus,
      reason,
      strategy,
      metrics: {
        stock: round(totalStock, 2),
        inbound: round(totalInbound, 2),
        sales28Units: round(sales28, 2),
        platformRows: group.rows.length
      },
      approval: {
        required: true,
        role: 'ROP',
        status: 'PENDING_ROP',
        taskRequired: true,
        confirmationsRequired: 2,
        confirmationStages: ['ROP_TASK', 'STATUS_APPLY_PREVIEW']
      },
      automation: {
        tier: 'double_confirmation',
        autoApplyEligible: false,
        reason: 'status_change_requires_task_and_double_confirmation'
      },
      applyMode: 'task_then_double_confirmed_status_change'
    });
  });
  return tasks;
}

function buildDecisionCenter({
  canonical = {},
  proposals = {},
  competitorPrices = {},
  learningReport = {},
  economicsPolicy = {},
  skuMatrix = {},
  workbench = {}
} = {}) {
  const proposalMap = new Map((proposals?.rows || []).map((row) => [
    `${String(row.platform || '').toLowerCase()}|${normalizeKey(row.articleKey)}`,
    row
  ]));
  const backtestMap = new Map((learningReport?.backtest?.rows || []).map((row) => [
    `${String(row.platform || '').toLowerCase()}|${normalizeKey(row.articleKey)}`,
    row
  ]));
  const competitorMap = new Map((competitorPrices?.rows || []).map((row) => [
    `${String(row.platform || '').toLowerCase()}|${normalizeKey(row.article_key || row.articleKey)}`,
    row
  ]));
  const nameMap = new Map((skuMatrix?.items || []).map((item) => [
    normalizeKey(item.articleKey || item.article),
    item
  ]));
  const rows = (canonical?.rows || [])
    .filter((row) => ['wb', 'ozon'].includes(String(row.platform || '').toLowerCase()))
    .map((row) => {
      const key = `${String(row.platform).toLowerCase()}|${normalizeKey(row.article_key)}`;
      const proposal = proposalMap.get(key) || {};
      const quality = dataQualityForRow(row, {
        canonical,
        economicsPolicy,
        skuMatrix,
        workbench,
        referenceDate: canonical.freshness_reference_date
      });
      const risk = riskForRow(row, quality);
      const automation = automationPolicyForRow(row, quality);
      const explanation = priceExplanation(row, quality, automation);
      const market = row?.demand_intelligence?.market_intelligence || {};
      const seasonality = market.seasonality || {};
      const elasticity = market.elasticity || {};
      const competitorSignal = market.competitors || {};
      const competitorHistorySignal = market.competitor_history || market.competitorHistory || {};
      const crossPlatform = market.cross_platform || market.crossPlatform || {};
      const competitorRecord = competitorMap.get(key) || {};
      const backtest = backtestMap.get(key) || { status: 'insufficient' };
      const currentSellerPrice = finite(row?.facts?.seller_price);
      const currentClientPrice = finite(row?.facts?.client_price, row?.facts?.seller_price);
      const proposedSellerPrice = finite(row?.recommendation?.seller_price_to_upload, row?.recommendation?.price);
      const proposedClientPrice = finite(row?.recommendation?.expected_client_price_after);
      const approvalRequired = automation.taskRequired
        || row?.approval_gate?.required === true
        || row?.recommendation?.status === 'waiting_rop'
        || proposal?.approvalStatus === 'PENDING_ROP';
      const approvalStatus = row?.approval
        ? 'APPROVED'
        : (
          proposal?.approvalStatus
          || (approvalRequired ? 'PENDING_ROP' : 'NOT_REQUIRED')
        );
      const approved = ['APPROVED', 'ACTIVE', 'VERIFIED'].includes(String(approvalStatus || '').toUpperCase());
      const decisionGroup = !quality.usable
        ? 'no_data'
        : (risk.reasons.includes('margin_below_minimum')
          ? 'below_margin'
          : (automation.absoluteChangePct > 0.1 + 1e-9
            ? 'sharp_change'
            : (String(row?.facts?.lifecycle_key || '').toLowerCase() === 'exit' ? 'exit' : 'safe')));
      return {
        id: `repricer-decision:${key}`,
        platform: row.platform,
        articleKey: row.article_key,
        name: nameMap.get(normalizeKey(row.article_key))?.name || '',
        lifecycle: row?.facts?.lifecycle_key || '',
        productStatus: row?.facts?.product_status || '',
        price: {
          sellerBefore: currentSellerPrice,
          sellerAfter: proposedSellerPrice,
          clientBefore: currentClientPrice,
          clientAfter: proposedClientPrice,
          buyerDiscountPct: finite(row?.facts?.effective_buyer_discount_pct, row?.facts?.spp_pct),
          projectionSource: row?.recommendation?.client_price_projection_source || ''
        },
        margin: {
          beforePct: finite(row?.recommendation?.current_margin_pct),
          afterPct: finite(row?.recommendation?.margin_pct),
          minimumPct: String(row?.facts?.lifecycle_key || '').toLowerCase() === 'exit'
            ? finite(row?.policy?.liquidation_min_margin_pct, 0)
            : finite(row?.policy?.min_margin_pct, row?.policy?.target_margin_pct),
          maximumPct: finite(row?.policy?.max_margin_pct),
          marginPriorityApplied: row?.policy?.margin_priority_applied === true
        },
        reasonCodes: row?.recommendation?.reason_codes || [],
        reason: proposal?.action || row?.recommendation?.source || '',
        explanation,
        decisionGroup,
        risk,
        automation,
        approval: {
          required: approvalRequired,
          role: 'ROP',
          status: approvalStatus,
          actions: ['APPROVE', 'REJECT'],
          approvalId: row?.approval?.id || '',
          taskRequired: automation.taskRequired,
          confirmationsRequired: automation.confirmationsRequired,
          confirmationsRecorded: approved ? 1 : 0,
          confirmationStages: automation.confirmationStages
        },
        decisionKinds: {
          priceRecommendation: proposedSellerPrice !== null
            && currentSellerPrice !== null
            && Math.abs(proposedSellerPrice - currentSellerPrice) >= 0.01
            && (
              automation.taskRequired
              || row?.recommendation?.status === 'waiting_rop'
            ),
          marginOrCorridorPolicy: proposal?.approvalStatus === 'PENDING_ROP'
        },
        dataQuality: quality,
        market: {
          seasonality: {
            usable: seasonality.usable === true,
            index: finite(seasonality.index),
            confidence: seasonality.confidence || '',
            reason: seasonality.reason || '',
            historyAsOf: seasonality.history_as_of || '',
            calendarEvents: seasonality.calendar_events || []
          },
          elasticity: {
            usable: elasticity.usable === true,
            value: finite(elasticity.value),
            confidence: elasticity.confidence || '',
            reason: elasticity.reason || '',
            observations: finite(elasticity.observations),
            r2: finite(elasticity.r2),
            exceptionalDaysExcluded: finite(elasticity.exceptional_days_excluded) || 0
          },
          competitors: {
            usable: competitorSignal.usable === true,
            benchmarkClientPrice: finite(competitorSignal.benchmark_client_price),
            ownPriceGapPct: finite(competitorSignal.own_price_gap_pct),
            trustedOffers: finite(competitorSignal.trusted_offers) || 0,
            totalOffers: finite(competitorSignal.total_offers) || 0,
            confidence: competitorSignal.confidence || '',
            reason: competitorSignal.reason || '',
            observedAt: competitorSignal.observed_at || ''
          },
          competitorHistory: {
            usable: competitorHistorySignal.usable === true,
            structurallyUsable: competitorHistorySignal.structurally_usable === true,
            trustedDays: finite(competitorHistorySignal.trusted_days) || 0,
            calendarSpanDays: finite(competitorHistorySignal.calendar_span_days) || 0,
            firstDate: competitorHistorySignal.first_date || '',
            lastDate: competitorHistorySignal.last_date || '',
            trendPct: finite(competitorHistorySignal.trend_pct),
            volatilityPct: finite(competitorHistorySignal.median_volatility_pct),
            confidence: competitorHistorySignal.confidence || '',
            reason: competitorHistorySignal.reason || '',
            suggestedInfluencePct: finite(competitorHistorySignal.suggested_influence_pct) || 0,
            currentSnapshotRequired: competitorHistorySignal.current_snapshot_required !== false
          },
          competitorIngestion: {
            observedAt: competitorRecord.observed_at || '',
            offers: (competitorRecord.offers || []).length,
            source: competitorRecord.source || ''
          },
          crossPlatform: {
            usable: crossPlatform.usable === true,
            siblingClientPrice: finite(crossPlatform.sibling_client_price),
            ownPriceGapPct: finite(crossPlatform.own_price_gap_pct),
            comparablePlatforms: crossPlatform.comparable_platforms || [],
            reason: crossPlatform.reason || ''
          }
        },
        backtest: {
          status: backtest.status || 'insufficient',
          observedDays: finite(backtest.observedDays) || 0,
          targetPrice: finite(backtest.targetPrice),
          elasticity: finite(backtest.elasticity),
          delta: backtest.delta || null,
          reason: backtest.reason || ''
        },
        safeToPlan: quality.usable
          && proposedSellerPrice !== null
          && !['blocked'].includes(String(row?.recommendation?.status || '').toLowerCase())
          && (automation.autoApplyEligible || !approvalRequired || approved),
        applyMode: 'preview_confirm_api_readback'
      };
    })
    .filter((row) => row.price.sellerAfter !== null || row.approval.required);
  const statusTasks = buildStatusTasks(canonical, skuMatrix);
  const pending = rows.filter((row) => (
    row.approval.status === 'PENDING_ROP' && row.decisionKinds.priceRecommendation
  )).length;
  const policyPending = rows.filter((row) => (
    row.approval.status === 'PENDING_ROP' && row.decisionKinds.marginOrCorridorPolicy
  )).length;
  const totalPending = rows.filter((row) => row.approval.status === 'PENDING_ROP').length;
  const dataFreshness = summarizeDataFreshness(rows);
  return {
    schema: 'repricer-decision-center-v1',
    generatedAt: new Date().toISOString(),
    asOfDate: canonical.freshness_reference_date || '',
    status: rows.length ? 'ready' : 'empty',
    workflow: ['preview', 'rop_approval', 'api_apply', 'api_readback', 'rollback_or_task'],
    summary: {
      rows: rows.length,
      pendingRop: pending,
      policyPendingRop: policyPending,
      totalPendingRopDecisions: totalPending,
      safeToPlan: rows.filter((row) => row.safeToPlan).length,
      dataBlocked: rows.filter((row) => !row.dataQuality.usable).length,
      highRisk: rows.filter((row) => row.risk.level === 'high').length,
      trustedCompetitorRows: rows.filter((row) => row.market.competitors?.usable === true).length,
      competitorHistoryReadyRows: rows.filter((row) => row.market.competitorHistory?.usable === true).length,
      competitorHistoryObservedRows: rows.filter((row) => row.market.competitorHistory?.trustedDays > 0).length,
      statusTasks: statusTasks.length,
      statusTasksPendingRop: statusTasks.filter((task) => task.approval.status === 'PENDING_ROP').length
    },
    automation: {
      thresholds: {
        automaticMaxChangePct: 0.03,
        ropMaxChangePct: 0.1
      },
      rules: {
        automatic: 'absolute change <= 3%, all required sources fresh, no margin drop and no status change',
        ropApproval: 'absolute change > 3% and <= 10%',
        doubleConfirmation: 'absolute change > 10%, margin drop or status change'
      },
      summary: {
        automatic: rows.filter((row) => row.automation.tier === 'automatic').length,
        ropApproval: rows.filter((row) => row.automation.tier === 'rop_approval').length,
        doubleConfirmation: rows.filter((row) => row.automation.tier === 'double_confirmation').length,
        blocked: rows.filter((row) => row.automation.tier === 'blocked').length
      }
    },
    groups: Object.fromEntries(['below_margin', 'sharp_change', 'exit', 'no_data', 'safe'].map((group) => [
      group,
      rows.filter((row) => row.decisionGroup === group).length
    ])),
    dataFreshness,
    rows,
    statusTasks
  };
}

function main() {
  const args = parseArgs();
  const inputDir = path.resolve(args['input-dir'] || 'data');
  const outputDir = path.resolve(args['output-dir'] || inputDir);
  const canonical = readJson(path.join(inputDir, 'canonical_repricer.json'), {});
  const economicsPolicy = readJson(path.join(inputDir, 'repricer_economics_policy.json'), {});
  const history = readJson(path.join(inputDir, 'repricer_market_observation_history.json'), {});
  const receipt = readJson(path.join(inputDir, 'repricer_price_apply_receipt.json'), {});
  const skuMatrix = readJson(path.join(inputDir, 'sku_matrix.json'), {});
  const workbench = readJson(path.join(inputDir, 'smart_price_workbench.json'), {});
  const learningReport = buildLearningReport({
    canonical,
    history,
    receipt,
    economicsPolicy,
    asOf: args['as-of-date'] || canonical.freshness_reference_date,
    lookbackDays: Math.max(28, Number(args['lookback-days'] || 60))
  });
  const calendarSnapshot = buildCalendarSnapshot({
    asOf: args['as-of-date'] || canonical.freshness_reference_date,
    days: Math.max(28, Number(args['lookback-days'] || 60)),
    history,
    economicsPolicy
  });
  const decisionCenter = buildDecisionCenter({
    canonical,
    proposals: readJson(path.join(inputDir, 'repricer_team_policy_proposals.json'), {}),
    competitorPrices: readJson(path.join(inputDir, 'repricer_competitor_prices.json'), {}),
    learningReport,
    economicsPolicy,
    skuMatrix,
    workbench
  });
  const decisionPath = path.join(outputDir, 'repricer_decision_center.json');
  const learningPath = path.join(outputDir, 'repricer_learning_report.json');
  const calendarPath = path.join(outputDir, 'repricer_calendar_factors.json');
  writeJson(decisionPath, decisionCenter);
  writeJson(learningPath, learningReport);
  writeJson(calendarPath, calendarSnapshot);
  console.log(JSON.stringify({
    decisionCenter: decisionPath,
    learningReport: learningPath,
    calendar: calendarPath,
    summary: {
      decisions: decisionCenter.summary,
      backtest: learningReport.backtest.summary,
      outcomes: learningReport.outcomes.summary,
      calendar: calendarSnapshot.summary
    }
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[repricer-intelligence-control] ${error?.stack || error}`);
    process.exitCode = 1;
  }
}

module.exports = {
  automationPolicyForRow,
  backtestRow,
  buildCalendarSnapshot,
  buildDecisionCenter,
  buildLearningReport,
  buildOutcomeRows,
  buildStatusTasks,
  contributionAt,
  dataQualityForRow,
  dateFromText,
  metricWindow,
  outcomeDelta,
  parseArgs,
  priceExplanation,
  riskForRow,
  sourceState,
  summarizeDataFreshness
};
