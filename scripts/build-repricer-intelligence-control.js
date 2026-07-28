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
  return {
    observedDays: priced.length,
    units: round(units, 2),
    turnoverRub: round(turnoverRub, 2)
  };
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function buildOutcomeRows(receipt = {}, history = {}) {
  if (!Array.isArray(receipt?.actions) || !receipt.actions.length) return [];
  const map = historyMap(history);
  const appliedDate = isoDate(receipt.generatedAt);
  return receipt.actions.map((action) => {
    const record = map.get(`${String(action.platform || '').toLowerCase()}|${normalizeKey(action.articleKey)}`) || {};
    const before = metricWindow(record.observations || [], addDays(appliedDate, -3), addDays(appliedDate, -1));
    const after = metricWindow(record.observations || [], addDays(appliedDate, 3), addDays(appliedDate, 7));
    const ready = before.observedDays >= 2 && after.observedDays >= 3;
    return {
      id: `price-outcome:${String(action.platform || '').toLowerCase()}:${normalizeKey(action.articleKey)}:${appliedDate}`,
      platform: String(action.platform || '').toLowerCase(),
      articleKey: action.articleKey,
      appliedAt: receipt.generatedAt || '',
      evaluateFrom: addDays(appliedDate, 3),
      evaluateTo: addDays(appliedDate, 7),
      status: ready ? 'evaluated' : 'waiting_3_to_7_days',
      before,
      after,
      delta: ready ? {
        units: round(after.units - before.units, 2),
        turnoverRub: round(after.turnoverRub - before.turnoverRub, 2),
        turnoverPct: before.turnoverRub ? round((after.turnoverRub - before.turnoverRub) / before.turnoverRub, 6) : null,
        drrPctPoints: null,
        marginRub: null,
        stockUnits: null
      } : null,
      unavailableMetrics: ['drr_daily_history', 'stock_daily_history', 'historical_unit_economics']
        .filter(() => true),
      learningEligible: ready,
      note: ready
        ? 'Turnover and units evaluated; DRR, stock and historical contribution stay null until their daily histories exist.'
        : 'Evaluation starts on day 3 and closes on day 7; missing metrics are never replaced by zero.'
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
      evaluationWindowDays: [3, 7],
      summary: {
        events: outcomes.length,
        evaluated: outcomes.filter((row) => row.status === 'evaluated').length,
        waiting: outcomes.filter((row) => row.status !== 'evaluated').length
      },
      rows: outcomes
    }
  };
}

function riskForRow(row = {}, quality = {}) {
  const change = Math.abs(finite(row?.recommendation?.change_pct) || 0);
  const margin = finite(row?.recommendation?.margin_pct);
  const minMargin = finite(row?.policy?.min_margin_pct, row?.policy?.target_margin_pct);
  const reasons = [];
  if (!quality.usable) reasons.push('data_quality_blocked');
  if (change >= 0.1) reasons.push('sharp_price_change');
  if (change >= 1) reasons.push('extreme_price_change');
  if (margin !== null && minMargin !== null && margin + 1e-9 < minMargin) reasons.push('margin_below_minimum');
  if (row?.facts?.partial_oos || row?.facts?.oos_risk_status === 'risk') reasons.push('oos_risk');
  const level = reasons.includes('extreme_price_change') || reasons.includes('data_quality_blocked')
    ? 'high'
    : (reasons.length ? 'medium' : 'low');
  return { level, reasons };
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
        status: 'PENDING_ROP'
      },
      applyMode: 'task_then_confirmed_status_change'
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
      const approvalRequired = row?.approval_gate?.required === true
        || row?.recommendation?.status === 'waiting_rop'
        || proposal?.approvalStatus === 'PENDING_ROP';
      const approvalStatus = row?.approval?.status
        || proposal?.approvalStatus
        || (approvalRequired ? 'PENDING_ROP' : 'NOT_REQUIRED');
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
          minimumPct: finite(row?.policy?.min_margin_pct, row?.policy?.target_margin_pct),
          maximumPct: finite(row?.policy?.max_margin_pct),
          marginPriorityApplied: row?.policy?.margin_priority_applied === true
        },
        reasonCodes: row?.recommendation?.reason_codes || [],
        reason: proposal?.action || row?.recommendation?.source || '',
        risk,
        approval: {
          required: approvalRequired,
          role: 'ROP',
          status: approvalStatus,
          actions: ['APPROVE', 'REJECT'],
          approvalId: row?.approval?.id || ''
        },
        decisionKinds: {
          priceRecommendation: row?.recommendation?.status === 'waiting_rop',
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
          && !['blocked'].includes(String(row?.recommendation?.status || '').toLowerCase()),
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
  parseArgs,
  riskForRow,
  sourceState
};
