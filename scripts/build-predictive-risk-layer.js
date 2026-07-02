#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA = 'qharisma-predictive-risk-v1';
const SIGNAL_SCHEMA = 'qharisma-auto-task-signals-v1';
const DEFAULT_TOTAL_LIMIT = 320;
const DEFAULT_RULE_LIMIT = 80;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const RISK_RULES = {
  forecast_iu_miss_risk: {
    type: 'traffic',
    criticalForecastCompletionLt: 0.9,
    highForecastCompletionLt: 0.97,
    watchForecastCompletionLt: 1
  },
  stockout_forecast_risk: {
    type: 'supply',
    criticalTurnoverDaysLte: 7,
    highTurnoverDaysLte: 14,
    watchTurnoverDaysLte: 30
  },
  demand_slowdown_early_warning: {
    type: 'traffic',
    highMetricDropPctLte: -0.3,
    criticalMetricDropPctLte: -0.45,
    highRevenueDropPctLte: -0.25,
    criticalRevenueDropPctLte: -0.4,
    highRevenueAbsDropRubGte: 100000,
    criticalRevenueAbsDropRubGte: 250000
  },
  ads_delivery_risk: {
    type: 'traffic',
    highSpendDropPctLte: -0.4,
    highSpendGrowthPctGte: 0.3,
    criticalDrrOverPlanPctGte: 0.2
  },
  price_position_risk: {
    type: 'price_margin',
    highCrossMarketGapPctGte: 0.07,
    criticalCrossMarketGapPctGte: 0.12,
    highPriceIncreasePctGte: 0.08,
    conversionDropPctLte: -0.15
  },
  launch_readiness_forecast: {
    type: 'launch'
  },
  data_freshness_predictive_blocker: {
    type: 'data_quality',
    maxStaleDays: 1
  }
};

const OWNER_ALIASES = new Map([
  ['максим', 'Лапыгин Максим'],
  ['лапыгин максим', 'Лапыгин Максим'],
  ['мария', 'Васильева Мария'],
  ['васильева мария', 'Васильева Мария'],
  ['даша', 'Молодякова Дария'],
  ['дария', 'Молодякова Дария'],
  ['дарья', 'Молодякова Дария'],
  ['молодякова дария', 'Молодякова Дария'],
  ['молодякова дарья', 'Молодякова Дария'],
  ['анна', 'Пирогова Анна'],
  ['анна пирогова', 'Пирогова Анна'],
  ['пирогова анна', 'Пирогова Анна'],
  ['александр', 'Питайкин Артём'],
  ['александр озон', 'Питайкин Артём'],
  ['артем', 'Питайкин Артём'],
  ['артём', 'Питайкин Артём'],
  ['питайкин артем', 'Питайкин Артём'],
  ['питайкин артём', 'Питайкин Артём'],
  ['кирилл', 'Кирилл']
]);

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!String(token).startsWith('--')) continue;
    const [rawKey, inlineValue] = String(token).split('=');
    const key = rawKey.replace(/^--/, '');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function resolveOptions(args = {}) {
  const root = process.cwd();
  const inputDir = path.resolve(args['input-dir'] || path.join(root, 'data'));
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(root, 'data'));
  const outputDir = path.resolve(args['output-dir'] || inputDir);
  return {
    inputDir,
    baseDataDir,
    outputDir,
    mirrorLocalFallback: Boolean(args['mirror-local-fallback']),
    now: args.now ? new Date(args.now) : new Date(),
    totalLimit: positiveInt(args['total-limit'], DEFAULT_TOTAL_LIMIT),
    ruleLimit: positiveInt(args['rule-limit'], DEFAULT_RULE_LIMIT)
  };
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readLayer(options, fileName, fallback) {
  const primaryPath = path.join(options.inputDir, fileName);
  const basePath = path.join(options.baseDataDir, fileName);
  const primary = readJsonIfExists(primaryPath);
  if (primary !== null) return { payload: primary, sourcePath: primaryPath, missing: false };
  const base = readJsonIfExists(basePath);
  if (base !== null) return { payload: base, sourcePath: basePath, missing: false };
  return { payload: fallback, sourcePath: '', missing: true };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function mirrorOutput(options, filePath) {
  if (!options.mirrorLocalFallback) return '';
  const target = path.join(options.baseDataDir, path.basename(filePath));
  if (path.resolve(target) === path.resolve(filePath)) return target;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(filePath, target);
  return target;
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finiteOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dateKey(value) {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function dateStamp(value) {
  const key = dateKey(value);
  if (!key) return 0;
  const stamp = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(stamp) ? stamp : 0;
}

function addDays(value, days) {
  const stamp = dateStamp(value);
  if (!stamp) return '';
  return new Date(stamp + Number(days || 0) * MS_PER_DAY).toISOString().slice(0, 10);
}

function daysBetween(older, newer) {
  const olderStamp = dateStamp(older);
  const newerStamp = dateStamp(newer);
  if (!olderStamp || !newerStamp) return 0;
  return Math.round((newerStamp - olderStamp) / MS_PER_DAY);
}

function expectedFactDate(now) {
  const date = new Date(now.getTime());
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function todayKey(now) {
  const date = new Date(now.getTime());
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function latestDate(values) {
  return (values || []).map(dateKey).filter(Boolean).sort().pop() || '';
}

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizePlatform(value = '') {
  const key = normalizeToken(value);
  if (['wb', 'wildberries', 'вб'].includes(key)) return 'wb';
  if (['ozon', 'oz', 'озон'].includes(key)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'yandex_market', 'яндекс', 'я_маркет', 'ям'].includes(key)) return 'ya';
  if (['goldapple', 'goldenapple', 'ga', 'золотое_яблоко', 'зя'].includes(key)) return 'goldapple';
  if (['letu', 'letual', 'letoile', 'летуаль', 'л_этуаль'].includes(key)) return 'letu';
  if (['magnit', 'magnitmarket', 'mm', 'магнит', 'магнит_маркет'].includes(key)) return 'magnit';
  if (['product', 'launch'].includes(key)) return 'product';
  if (['cross', 'all', 'common', 'general'].includes(key)) return key === 'all' ? 'all' : 'cross';
  return key || 'all';
}

function platformLabel(value) {
  const key = normalizePlatform(value);
  if (key === 'wb') return 'WB';
  if (key === 'ozon') return 'Ozon';
  if (key === 'ya') return 'Я.Маркет';
  if (key === 'goldapple') return 'ЗЯ';
  if (key === 'letu') return "Л'Этуаль";
  if (key === 'magnit') return 'Магнит';
  if (key === 'product') return 'Продукт';
  return 'Общий контур';
}

function ownerKey(value) {
  return String(value || '').trim().toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ');
}

function canonicalOwner(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = ownerKey(raw);
  if (OWNER_ALIASES.has(key)) return OWNER_ALIASES.get(key);
  const first = key.split(' ')[0] || '';
  return OWNER_ALIASES.get(first) || raw;
}

function platformOwnerKey(platform) {
  const key = normalizePlatform(platform);
  if (key === 'ya') return 'ym';
  if (key === 'goldapple') return 'ga';
  if (key === 'magnit') return 'mm';
  return key;
}

function skuLookupTokens(sku = {}) {
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.nmId,
    sku.nmID,
    sku.barcode
  ];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') values.push(alias);
      else values.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.vendorCode, alias?.nmId);
    });
  }
  Object.values(sku.platformAliases || {}).forEach((aliases) => {
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });
  return values.map((value) => normalizeToken(value)).filter(Boolean);
}

function buildSkuLookup(skus = []) {
  const lookup = new Map();
  skus.forEach((sku) => {
    skuLookupTokens(sku).forEach((token) => {
      if (token && !lookup.has(token)) lookup.set(token, sku);
    });
  });
  return lookup;
}

function findSku(lookup, articleKey) {
  const token = normalizeToken(articleKey);
  return token ? lookup.get(token) || null : null;
}

function defaultOwnerForSku(sku = {}) {
  return canonicalOwner(sku?.owner?.name || sku?.ownerName || sku?.owner || '');
}

function ownerFor(sku, platform, fallback = '') {
  if (!sku) return canonicalOwner(fallback);
  const key = platformOwnerKey(platform);
  const sources = [sku?.owner?.byPlatform, sku?.ownersByPlatform];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const value = key === 'ym' ? (source.ym || source.ya || '') : source[key];
    const owner = canonicalOwner(value);
    if (owner) return owner;
  }
  return canonicalOwner(fallback) || defaultOwnerForSku(sku);
}

function articleKeyOf(row = {}) {
  return String(row.articleKey || row.article || row.sku || row.sourceArticleKey || '').trim();
}

function hashShort(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function riskId(parts) {
  return `risk-${parts.map((part) => normalizeToken(part)).filter(Boolean).join('-')}`.slice(0, 180);
}

function autoCode(parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join('|');
}

function periodObject(rows = []) {
  const dates = rows.map((row) => dateKey(row.date)).filter(Boolean).sort();
  return {
    from: dates[0] || '',
    to: dates[dates.length - 1] || '',
    days: dates.length
  };
}

function sumRows(rows = [], key) {
  return rows.reduce((sum, row) => sum + finite(row?.[key], 0), 0);
}

function averageRows(rows = [], key) {
  const values = rows.map((row) => finiteOrNull(row?.[key])).filter((value) => value !== null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pctDelta(current, expected) {
  const base = finite(expected, 0);
  if (base <= 0) return null;
  return (finite(current, 0) - base) / base;
}

function fmtNumber(value, digits = 0) {
  const number = finite(value, 0);
  return number.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtMoney(value) {
  return `${fmtNumber(value, 0)} ₽`;
}

function fmtPct(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'нет данных';
  return `${(number * 100).toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

function priorityFromScore(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function bandFromScore(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'watch';
}

function horizonFor(rule) {
  if (rule === 'data_freshness_predictive_blocker') return 'H0';
  if (rule === 'demand_slowdown_early_warning' || rule === 'ads_delivery_risk') return 'H1';
  if (rule === 'stockout_forecast_risk') return 'H3';
  if (rule === 'forecast_iu_miss_risk' || rule === 'price_position_risk') return 'H4';
  if (rule === 'launch_readiness_forecast') return 'H5';
  return 'H2';
}

function isBusinessTaskSuppressedByFreshness(rule, dataFreshnessStatus) {
  if (dataFreshnessStatus !== 'stale') return false;
  return rule !== 'data_freshness_predictive_blocker';
}

function shouldCreateTask(risk, dataFreshnessStatus) {
  if (risk.riskScore < 60) return false;
  if (risk.confidence === 'low' && !['data_freshness_predictive_blocker', 'stockout_forecast_risk', 'forecast_iu_miss_risk'].includes(risk.rule)) return false;
  if (isBusinessTaskSuppressedByFreshness(risk.rule, dataFreshnessStatus)) return false;
  return true;
}

function recommendedChecks(rule, probableCause) {
  if (rule === 'stockout_forecast_risk') {
    return ['подтвердить остаток и транзит по кластерам', 'поставить дату поставки/перемещения', 'проверить, не нужен ли временный лимит продаж'];
  }
  if (rule === 'forecast_iu_miss_risk') {
    return ['сверить факт ИУ и план до конца месяца', 'понять, какой канал недодает темп', 'согласовать добор оборота или корректировку плана'];
  }
  if (rule === 'ads_delivery_risk') {
    return ['проверить статус РК, дневные лимиты и ставки', 'сверить показы, клики, CTR/CR и ДРР', 'решить: вернуть открутку, остановить или перераспределить бюджет'];
  }
  if (rule === 'price_position_risk') {
    return ['сверить WB/Ozon/Я.Маркет цены и СПП', 'проверить min/max коридор и маржу', 'зафиксировать решение по цене или промо'];
  }
  if (rule === 'data_freshness_predictive_blocker') {
    return ['проверить источник/API и дату последнего факта', 'перезапустить синхронизацию слоя', 'после восстановления пересобрать прогнозные сигналы'];
  }
  if (probableCause === 'card_or_offer_conversion') {
    return ['проверить цену, первый экран и доставку', 'сверить остатки и конкурентные предложения', 'зафиксировать гипотезу просадки конверсии'];
  }
  return ['проверить источник трафика и выдачу', 'сверить РК/ставки/лимиты и остатки', 'зафиксировать причину и действие в комментарии'];
}

function buildTaskReason(risk) {
  const forecast = risk.forecast || {};
  const metric = forecast.metricLabel || forecast.metric || 'метрика';
  const current = forecast.currentValueLabel || fmtNumber(forecast.currentValue, 1);
  const expected = forecast.expectedValueLabel || fmtNumber(forecast.expectedValue, 1);
  const delta = forecast.deltaPct === null || forecast.deltaPct === undefined ? 'нет данных' : fmtPct(forecast.deltaPct, 1);
  const period = forecast.period?.from && forecast.period?.to
    ? `${forecast.period.from} - ${forecast.period.to}`
    : 'текущий период';
  const checks = (risk.checklist || recommendedChecks(risk.rule, risk.probableCause))
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
  return [
    `Что видно заранее: ${metric} отклоняется от нормального уровня: ожидалось ${expected}, стало ${current}, отклонение ${delta}, период ${period}.`,
    `Прогноз: ${risk.forecastText || 'если темп сохранится, риск перейдет в операционную проблему в указанном горизонте.'}`,
    `Вероятная причина: ${risk.probableCause || 'needs_check'}, confidence=${risk.confidence || 'medium'}.`,
    'Что проверить:',
    checks,
    'Критерий закрытия: причина зафиксирована, действие выполнено, метрика восстановилась или РОП согласовал решение.'
  ].join('\n');
}

const DEFAULT_CLOSE_CRITERIA = 'Причина зафиксирована, действие выполнено, метрика восстановилась или РОП согласовал решение.';

function taskContractFromRisk(risk) {
  const forecast = risk.forecast || {};
  return {
    whatChanged: `${forecast.metricLabel || forecast.metric || 'метрика'} отклоняется от нормального уровня`,
    baseline: forecast.expectedValueLabel || fmtNumber(forecast.expectedValue, 1),
    current: forecast.currentValueLabel || fmtNumber(forecast.currentValue, 1),
    deltaPct: forecast.deltaPct ?? null,
    forecastText: risk.forecastText || 'если темп сохранится, риск перейдет в операционную проблему в указанном горизонте.',
    probableCause: risk.probableCause || 'needs_check',
    confidence: risk.confidence || 'medium',
    recommendedAction: risk.recommendedAction || 'Проверить прогнозный риск и зафиксировать решение.',
    closeCriteria: DEFAULT_CLOSE_CRITERIA
  };
}

function truncateText(value, limit = 180) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  const sliced = text.slice(0, Math.max(1, limit - 1)).trimEnd();
  const cut = sliced.replace(/\s+\S*$/, '').trimEnd();
  return `${cut && cut.length >= limit * 0.65 ? cut : sliced}…`;
}

function signalEntityTitle(risk) {
  const platform = platformLabel(risk.platform);
  const entity = String(risk.articleKey || risk.entityLabel || risk.rule || '').trim();
  if (!entity) return platform;
  if (entity.toLowerCase().startsWith(platform.toLowerCase())) return entity;
  return `${platform} · ${entity}`;
}

function signalTitleFromRisk(risk) {
  if (risk.rule === 'data_freshness_predictive_blocker') {
    return `${risk.entityLabel} — данные устарели`;
  }
  const entity = signalEntityTitle(risk);
  const forecast = risk.forecast || {};
  const metric = forecast.metricLabel || forecast.metric || 'метрика';
  const current = forecast.currentValueLabel || fmtNumber(forecast.currentValue, 1);
  const expected = forecast.expectedValueLabel || fmtNumber(forecast.expectedValue, 1);
  if (risk.rule === 'stockout_forecast_risk') {
    return `${entity} — прогноз OOS: ${current} против нормы ${expected}`;
  }
  if (risk.rule === 'demand_slowdown_early_warning') {
    return `${entity} — упали ${metric}: ${current} против ${expected}`;
  }
  if (risk.rule === 'ads_delivery_risk') {
    return `${entity} — риск РК: ${metric} ${current} против ${expected}`;
  }
  if (risk.rule === 'price_position_risk') {
    return `${entity} — риск цены: ${metric} ${current} против ${expected}`;
  }
  if (risk.rule === 'forecast_iu_miss_risk') {
    return `${entity} — прогноз невыполнения ИУ`;
  }
  if (risk.rule === 'launch_readiness_forecast') {
    return `${entity} — риск готовности запуска`;
  }
  return `${entity} — ${risk.recommendedAction || risk.subRule || risk.rule}`;
}

function createRisk(raw, context) {
  const score = clamp(Math.round(finite(raw.riskScore, 0)), 0, 100);
  const risk = {
    id: raw.id || riskId([raw.rule, raw.platform || 'all', raw.articleKey || raw.entityLabel || raw.subRule, raw.asOfDate || context.asOfDate]),
    rule: raw.rule,
    subRule: raw.subRule || '',
    platform: normalizePlatform(raw.platform || 'all'),
    articleKey: raw.articleKey || '',
    entityLabel: raw.entityLabel || [platformLabel(raw.platform), raw.articleKey].filter(Boolean).join(' · '),
    owner: canonicalOwner(raw.owner || ''),
    horizon: raw.horizon || horizonFor(raw.rule),
    riskScore: score,
    riskBand: bandFromScore(score),
    priority: raw.priority || priorityFromScore(score),
    confidence: raw.confidence || 'medium',
    forecast: raw.forecast || {},
    drivers: Array.isArray(raw.drivers) ? raw.drivers : [],
    probableCause: raw.probableCause || 'needs_check',
    moneyAtRiskRub: Math.max(0, finite(raw.moneyAtRiskRub, 0)),
    recommendedAction: raw.recommendedAction || '',
    forecastText: raw.forecastText || '',
    checklist: raw.checklist || null,
    createdAt: context.generatedAt,
    asOfDate: raw.asOfDate || context.asOfDate
  };
  const taskAllowed = shouldCreateTask(risk, context.dataFreshnessStatus);
  if (taskAllowed) {
    const code = raw.autoCode || autoCode([risk.rule, risk.platform, risk.articleKey || normalizeToken(risk.entityLabel), risk.subRule || risk.forecast?.metric, risk.asOfDate]);
    risk.autoTask = {
      autoCode: code,
      type: raw.type || RISK_RULES[risk.rule]?.type || 'general',
      source: 'auto',
      duePolicy: risk.priority === 'critical' ? 'same_day' : 'next_day'
    };
  }
  return risk;
}

function signalFromRisk(risk, options) {
  if (!risk.autoTask) return null;
  const due = risk.autoTask.duePolicy === 'same_day'
    ? todayKey(options.now)
    : addDays(todayKey(options.now), 1);
  const title = signalTitleFromRisk(risk);
  const contract = taskContractFromRisk(risk);
  return {
    id: `auto-predictive-${hashShort(risk.autoTask.autoCode)}`,
    source: 'auto',
    autoCode: risk.autoTask.autoCode,
    articleKey: risk.articleKey || '',
    title: truncateText(title, 180),
    nextAction: risk.recommendedAction || 'Проверить прогнозный риск и зафиксировать решение.',
    reason: buildTaskReason(risk),
    owner: risk.owner || '',
    due,
    status: 'new',
    type: risk.autoTask.type || 'general',
    priority: risk.priority,
    platform: risk.platform === 'all' ? 'cross' : risk.platform,
    entityLabel: risk.entityLabel,
    riskScore: risk.riskScore,
    horizon: risk.horizon,
    whatChanged: contract.whatChanged,
    baseline: contract.baseline,
    current: contract.current,
    deltaPct: contract.deltaPct,
    forecastText: contract.forecastText,
    probableCause: contract.probableCause,
    confidence: contract.confidence,
    recommendedAction: contract.recommendedAction,
    closeCriteria: contract.closeCriteria,
    deadline: due,
    predictiveRiskId: risk.id,
    forecast: risk.forecast,
    drivers: risk.drivers
  };
}

function normalizeDailyPoint(row = {}) {
  const date = dateKey(row.date || row.label);
  if (!date) return null;
  return {
    date,
    views: finite(row.views ?? row.adsImpressions ?? row.impressions ?? row.shows, 0),
    clicks: finite(row.clicks ?? row.adsClicks, 0),
    carts: finite(row.carts ?? row.addToCart ?? row.toCart, 0),
    ordersUnits: finite(row.ordersUnits ?? row.orders ?? row.units, 0),
    ordersRevenue: finite(row.ordersRevenue ?? row.revenue ?? row.deliveredRevenue, 0),
    adsSpend: finite(row.adsSpend ?? row.spend, 0),
    price: finite(row.price ?? row.currentPrice ?? row.currentClientPrice, 0)
  };
}

function addArticleSeries(seriesMap, platform, row, skuLookup) {
  const articleKey = articleKeyOf(row);
  const daily = Array.isArray(row.daily) ? row.daily.map(normalizeDailyPoint).filter(Boolean) : [];
  if (!articleKey || daily.length < 3) return;
  const platformKey = normalizePlatform(platform || row.platformKey || row.marketplace || row.platform);
  const mapKey = `${platformKey}|${normalizeToken(articleKey)}`;
  const sku = findSku(skuLookup, articleKey);
  const current = seriesMap.get(mapKey) || {
    platform: platformKey,
    articleKey,
    entityLabel: [platformLabel(platformKey), articleKey].join(' · '),
    name: row.name || row.title || sku?.name || articleKey,
    owner: ownerFor(sku, platformKey, row.owner || ''),
    daily: []
  };
  current.daily.push(...daily);
  if (!current.owner) current.owner = ownerFor(sku, platformKey, row.owner || '');
  seriesMap.set(mapKey, current);
}

function compactSeries(series) {
  const byDate = new Map();
  for (const point of series.daily || []) {
    const date = dateKey(point.date);
    if (!date) continue;
    const current = byDate.get(date) || { date, views: 0, clicks: 0, carts: 0, ordersUnits: 0, ordersRevenue: 0, adsSpend: 0, priceValues: [] };
    current.views += finite(point.views, 0);
    current.clicks += finite(point.clicks, 0);
    current.carts += finite(point.carts, 0);
    current.ordersUnits += finite(point.ordersUnits, 0);
    current.ordersRevenue += finite(point.ordersRevenue, 0);
    current.adsSpend += finite(point.adsSpend, 0);
    if (finite(point.price, 0) > 0) current.priceValues.push(finite(point.price, 0));
    byDate.set(date, current);
  }
  const daily = [...byDate.values()]
    .map((point) => ({
      date: point.date,
      views: point.views,
      clicks: point.clicks,
      carts: point.carts,
      ordersUnits: point.ordersUnits,
      ordersRevenue: point.ordersRevenue,
      adsSpend: point.adsSpend,
      price: point.priceValues.length ? point.priceValues.reduce((sum, value) => sum + value, 0) / point.priceValues.length : 0
    }))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  return { ...series, daily };
}

function buildArticleSeries(layers, skuLookup) {
  const map = new Map();
  const extraPlatforms = layers.platformTrends?.extraMarketplace?.platforms || {};
  Object.entries(extraPlatforms).forEach(([platform, payload]) => {
    (payload?.articles || []).forEach((row) => addArticleSeries(map, platform, row, skuLookup));
  });
  const wbFunnelItems = Array.isArray(layers.wbSalesFunnel?.items) ? layers.wbSalesFunnel.items : [];
  wbFunnelItems.forEach((row) => addArticleSeries(map, 'wb', row, skuLookup));
  const overlayPlatforms = layers.smartPriceOverlay?.platforms || {};
  Object.entries(overlayPlatforms).forEach(([platform, payload]) => {
    const rows = Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload?.items) ? payload.items : [];
    rows.forEach((row) => addArticleSeries(map, platform, row, skuLookup));
  });
  return [...map.values()].map(compactSeries).filter((series) => series.daily.length >= 7);
}

function windowStats(series, metric, days = 7) {
  const rows = [...(series.daily || [])].filter((row) => dateKey(row.date)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (rows.length < days * 2) return null;
  const recent = rows.slice(-days);
  const previous = rows.slice(-days * 2, -days);
  const currentValue = metric === 'price' ? averageRows(recent, metric) : sumRows(recent, metric);
  const expectedValue = metric === 'price' ? averageRows(previous, metric) : sumRows(previous, metric);
  const deltaPct = pctDelta(currentValue, expectedValue);
  if (deltaPct === null) return null;
  return {
    metric,
    currentValue,
    expectedValue,
    deltaPct,
    period: periodObject(recent),
    previousPeriod: periodObject(previous)
  };
}

function stockRiskIndex(oosControl = {}) {
  const map = new Map();
  (Array.isArray(oosControl.rows) ? oosControl.rows : []).forEach((row) => {
    const key = `${normalizePlatform(row.platform)}|${normalizeToken(row.articleKey || row.article)}`;
    if (!key.includes('|')) return;
    const current = map.get(key);
    if (!current || finite(row.revenueAtRiskDay, 0) > finite(current.revenueAtRiskDay, 0)) map.set(key, row);
  });
  return map;
}

function buildStockoutRisks(layers, context) {
  const rows = Array.isArray(layers.oosControl?.rows) ? layers.oosControl.rows : [];
  return rows
    .map((row) => {
      const turnoverDays = finite(row.turnoverDays, Number.POSITIVE_INFINITY);
      if (!Number.isFinite(turnoverDays) || turnoverDays > RISK_RULES.stockout_forecast_risk.watchTurnoverDaysLte) return null;
      const riskDay = finite(row.revenueAtRiskDay, 0);
      const riskScore = turnoverDays <= 7
        ? 88 + Math.min(10, riskDay / 500000)
        : turnoverDays <= 14
          ? 68 + Math.min(10, riskDay / 700000)
          : 42 + Math.min(10, riskDay / 1000000);
      const platform = normalizePlatform(row.platform);
      return createRisk({
        rule: 'stockout_forecast_risk',
        subRule: turnoverDays <= 7 ? 'stockout_lte_7d' : turnoverDays <= 14 ? 'stockout_lte_14d' : 'stockout_lte_30d',
        platform,
        articleKey: articleKeyOf(row),
        entityLabel: row.name || [platformLabel(platform), articleKeyOf(row)].join(' · '),
        owner: row.owner,
        riskScore,
        confidence: row.status === 'risk' || row.severity === 'high' ? 'high' : 'medium',
        forecast: {
          metric: 'turnoverDays',
          metricLabel: 'покрытие остатком',
          currentValue: turnoverDays,
          expectedValue: 30,
          deltaPct: (turnoverDays - 30) / 30,
          period: { from: layers.oosControl?.dataFreshness?.dataDate || context.asOfDate, to: layers.oosControl?.dataFreshness?.dataDate || context.asOfDate, days: 1 },
          previousPeriod: { from: '', to: '', days: 0 },
          currentValueLabel: `${fmtNumber(turnoverDays, 1)} д.`,
          expectedValueLabel: '30 д.'
        },
        drivers: [
          { key: 'stock_coverage', label: `Запас закончится примерно через ${fmtNumber(turnoverDays, 1)} д.`, weight: 0.6 },
          riskDay ? { key: 'revenue_at_risk', label: `Выручка под риском ${fmtMoney(riskDay)}/день`, weight: 0.4 } : null
        ].filter(Boolean),
        probableCause: 'future_oos_or_cluster_stock',
        moneyAtRiskRub: riskDay * Math.max(1, Math.min(30, 30 - turnoverDays)),
        recommendedAction: row.recommendation || 'Проверить поставку и закрыть риск OOS до потери продаж.',
        forecastText: `если темп продаж сохранится, через ${fmtNumber(turnoverDays, 1)} д. карточка уйдет в OOS/дефицит.`,
        autoCode: autoCode(['stockout_forecast_risk', platform, articleKeyOf(row), row.place || 'all', context.asOfDate]),
        type: 'supply'
      }, context);
    })
    .filter(Boolean);
}

function metricConfig(metric) {
  const configs = {
    views: { label: 'показы', minBase: 100, type: 'traffic' },
    clicks: { label: 'клики', minBase: 30, type: 'traffic' },
    carts: { label: 'корзины', minBase: 10, type: 'traffic' },
    ordersUnits: { label: 'заказы', minBase: 5, type: 'traffic' },
    ordersRevenue: { label: 'выручка', minBase: 30000, type: 'traffic' }
  };
  return configs[metric] || { label: metric, minBase: 1, type: 'traffic' };
}

function buildDemandRisks(articleSeries, stockIndex, context) {
  const risks = [];
  const metrics = ['views', 'clicks', 'carts', 'ordersUnits', 'ordersRevenue'];
  for (const series of articleSeries) {
    for (const metric of metrics) {
      const config = metricConfig(metric);
      const stats = windowStats(series, metric, 7);
      if (!stats || finite(stats.expectedValue, 0) < config.minBase) continue;
      const isRevenue = metric === 'ordersRevenue';
      const absLoss = Math.max(0, finite(stats.expectedValue, 0) - finite(stats.currentValue, 0));
      const critical = isRevenue
        ? stats.deltaPct <= RISK_RULES.demand_slowdown_early_warning.criticalRevenueDropPctLte && absLoss >= RISK_RULES.demand_slowdown_early_warning.criticalRevenueAbsDropRubGte
        : stats.deltaPct <= RISK_RULES.demand_slowdown_early_warning.criticalMetricDropPctLte;
      const high = isRevenue
        ? stats.deltaPct <= RISK_RULES.demand_slowdown_early_warning.highRevenueDropPctLte && absLoss >= RISK_RULES.demand_slowdown_early_warning.highRevenueAbsDropRubGte
        : stats.deltaPct <= RISK_RULES.demand_slowdown_early_warning.highMetricDropPctLte;
      if (!critical && !high) continue;

      const stockKey = `${series.platform}|${normalizeToken(series.articleKey)}`;
      const stockRisk = stockIndex.get(stockKey);
      const coupledBonus = stockRisk ? 10 : 0;
      const moneyAtRisk = isRevenue ? absLoss * 4 : 0;
      const scoreBase = critical ? 80 : 62;
      const score = scoreBase
        + Math.min(12, Math.abs(stats.deltaPct) * 22)
        + Math.min(12, moneyAtRisk / 150000)
        + coupledBonus;
      const probableCause = stockRisk
        ? 'stock_or_oos'
        : ['views', 'clicks'].includes(metric)
          ? 'ads_or_search_visibility'
          : ['carts', 'ordersUnits'].includes(metric)
            ? 'card_or_offer_conversion'
            : 'sales_slowdown_needs_check';
      risks.push(createRisk({
        rule: 'demand_slowdown_early_warning',
        subRule: `${metric}_drop`,
        platform: series.platform,
        articleKey: series.articleKey,
        entityLabel: series.name || series.entityLabel,
        owner: series.owner,
        riskScore: score,
        confidence: stats.period.days >= 7 && stats.previousPeriod.days >= 7 ? 'medium' : 'low',
        forecast: {
          metric,
          metricLabel: config.label,
          currentValue: stats.currentValue,
          expectedValue: stats.expectedValue,
          deltaPct: stats.deltaPct,
          period: stats.period,
          previousPeriod: stats.previousPeriod,
          currentValueLabel: isRevenue ? fmtMoney(stats.currentValue) : fmtNumber(stats.currentValue, 0),
          expectedValueLabel: isRevenue ? fmtMoney(stats.expectedValue) : fmtNumber(stats.expectedValue, 0)
        },
        drivers: [
          { key: `${metric}_drop`, label: `${config.label} просели на ${fmtPct(stats.deltaPct, 1)}`, weight: 0.55 },
          stockRisk ? { key: 'stockout_forecast_risk', label: 'Одновременно есть риск OOS/дефицита', weight: 0.25 } : null,
          moneyAtRisk ? { key: 'money_at_risk', label: `Оценка денег под риском ${fmtMoney(moneyAtRisk)}`, weight: 0.2 } : null
        ].filter(Boolean),
        probableCause,
        moneyAtRiskRub: moneyAtRisk,
        recommendedAction: metric === 'ordersRevenue'
          ? 'Проверить, почему выручка уже идет ниже базового темпа.'
          : `Проверить раннее отклонение: ${config.label}.`,
        forecastText: isRevenue
          ? `при сохранении темпа за 30 дней риск недовыручки около ${fmtMoney(moneyAtRisk)}.`
          : `если отклонение сохранится, через 7-14 дней оно может перейти в падение заказов/выручки.`,
        autoCode: autoCode(['demand_slowdown_early_warning', series.platform, series.articleKey, metric, stats.period.to]),
        type: config.type
      }, context));
    }
  }
  return risks;
}

function buildAdsBuckets(adsSummary = {}, skuLookup) {
  const rows = Array.isArray(adsSummary.itemSeries) ? adsSummary.itemSeries : [];
  const buckets = new Map();
  rows.forEach((row) => {
    const articleKey = articleKeyOf(row);
    const platform = normalizePlatform(row.platformKey || row.platform || row.marketplace);
    const date = dateKey(row.date);
    if (!articleKey || !date || platform === 'all') return;
    const key = `${platform}|${normalizeToken(articleKey)}`;
    const sku = findSku(skuLookup, articleKey);
    const bucket = buckets.get(key) || {
      platform,
      articleKey,
      name: row.name || sku?.name || articleKey,
      owner: ownerFor(sku, platform, row.owner || ''),
      daily: new Map()
    };
    const point = bucket.daily.get(date) || { date, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 };
    point.views += finite(row.views, 0);
    point.clicks += finite(row.clicks, 0);
    point.spend += finite(row.spend, 0);
    point.orders += finite(row.orders ?? row.ordersUnits, 0);
    point.revenue += finite(row.revenue ?? row.ordersRevenue, 0);
    bucket.daily.set(date, point);
    buckets.set(key, bucket);
  });
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    daily: [...bucket.daily.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  })).filter((bucket) => bucket.daily.length >= 7);
}

function statsForRows(rows, key) {
  return {
    currentValue: sumRows(rows.recent, key),
    expectedValue: sumRows(rows.previous, key),
    deltaPct: pctDelta(sumRows(rows.recent, key), sumRows(rows.previous, key))
  };
}

function twoWindowRows(daily, days = 7) {
  const rows = [...daily].filter((row) => dateKey(row.date)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (rows.length < days * 2) return null;
  return {
    recent: rows.slice(-days),
    previous: rows.slice(-days * 2, -days)
  };
}

function buildAdsRisks(layers, skuLookup, context) {
  const risks = [];
  for (const bucket of buildAdsBuckets(layers.adsSummary, skuLookup)) {
    const windows = twoWindowRows(bucket.daily, 7);
    if (!windows) continue;
    const spend = statsForRows(windows, 'spend');
    const revenue = statsForRows(windows, 'revenue');
    const clicks = statsForRows(windows, 'clicks');
    const views = statsForRows(windows, 'views');
    const currentDrr = spend.currentValue / Math.max(1, revenue.currentValue);
    const previousDrr = spend.expectedValue / Math.max(1, revenue.expectedValue);
    const drrGrowth = pctDelta(currentDrr, previousDrr);
    const recentOrders = sumRows(windows.recent, 'orders');
    const previousOrders = sumRows(windows.previous, 'orders');
    const period = periodObject(windows.recent);
    const previousPeriod = periodObject(windows.previous);

    let subRule = '';
    let score = 0;
    let probableCause = 'ads_delivery';
    let metricLabel = 'расход РК';
    let currentValue = spend.currentValue;
    let expectedValue = spend.expectedValue;
    let deltaPct = spend.deltaPct;
    let recommendedAction = 'Проверить открутку, ставки, лимиты и экономику РК.';

    if (spend.expectedValue >= 1000 && spend.currentValue <= 0 && (previousOrders > 0 || revenue.expectedValue >= 20000)) {
      subRule = 'zero_spend_active_card';
      score = 84;
      probableCause = 'campaign_stopped_or_budget_empty';
      recommendedAction = 'РК остановилась или не тратит бюджет: проверить статус, лимит и ставки.';
    } else if (spend.expectedValue >= 5000 && spend.deltaPct !== null && spend.deltaPct <= RISK_RULES.ads_delivery_risk.highSpendDropPctLte) {
      subRule = 'spend_drop';
      score = 66 + Math.min(14, Math.abs(spend.deltaPct) * 20) + (views.deltaPct !== null && views.deltaPct < -0.25 ? 8 : 0);
      probableCause = 'ads_visibility_drop';
      recommendedAction = 'Расход РК резко снизился: проверить лимиты, ставки и статус кампаний.';
    } else if (spend.expectedValue >= 5000 && spend.deltaPct !== null && spend.deltaPct >= RISK_RULES.ads_delivery_risk.highSpendGrowthPctGte && revenue.deltaPct !== null && revenue.deltaPct < 0.05) {
      subRule = 'spend_growth_without_revenue';
      score = 70 + Math.min(12, spend.deltaPct * 16) + (currentDrr > 0.35 ? 8 : 0);
      probableCause = 'budget_burn_without_sales';
      recommendedAction = 'РК тратит больше, но выручка не растет: проверить запросы, ставки, карточку и ДРР.';
    } else if (Number.isFinite(drrGrowth) && drrGrowth >= RISK_RULES.ads_delivery_risk.criticalDrrOverPlanPctGte && spend.currentValue >= 5000 && recentOrders <= previousOrders) {
      subRule = 'drr_growth_conversion_drop';
      score = 82 + Math.min(10, drrGrowth * 20);
      probableCause = 'drr_burn_and_conversion_drop';
      metricLabel = 'ДРР';
      currentValue = currentDrr;
      expectedValue = previousDrr;
      deltaPct = drrGrowth;
      recommendedAction = 'ДРР растет при слабых заказах: проверить качество трафика, ставки и карточку.';
    }

    if (!subRule || score < 60) continue;
    const moneyAtRisk = Math.max(0, spend.currentValue - revenue.currentValue * 0.15);
    risks.push(createRisk({
      rule: 'ads_delivery_risk',
      subRule,
      platform: bucket.platform,
      articleKey: bucket.articleKey,
      entityLabel: bucket.name || bucket.articleKey,
      owner: bucket.owner,
      riskScore: score,
      confidence: spend.expectedValue >= 5000 || clicks.expectedValue >= 50 ? 'medium' : 'low',
      forecast: {
        metric: subRule === 'drr_growth_conversion_drop' ? 'drr' : 'adSpend',
        metricLabel,
        currentValue,
        expectedValue,
        deltaPct,
        period,
        previousPeriod,
        currentValueLabel: subRule === 'drr_growth_conversion_drop' ? fmtPct(currentValue, 1) : fmtMoney(currentValue),
        expectedValueLabel: subRule === 'drr_growth_conversion_drop' ? fmtPct(expectedValue, 1) : fmtMoney(expectedValue)
      },
      drivers: [
        { key: subRule, label: `${metricLabel}: ${fmtPct(deltaPct, 1)}`, weight: 0.45 },
        views.deltaPct !== null ? { key: 'views_context', label: `Показы: ${fmtPct(views.deltaPct, 1)}`, weight: 0.15 } : null,
        revenue.deltaPct !== null ? { key: 'revenue_context', label: `Выручка РК: ${fmtPct(revenue.deltaPct, 1)}`, weight: 0.25 } : null
      ].filter(Boolean),
      probableCause,
      moneyAtRiskRub: moneyAtRisk,
      recommendedAction,
      forecastText: 'если РК останется в этом режиме, бюджет или видимость продолжат отклоняться уже в ближайшие 1-3 дня.',
      autoCode: autoCode(['ads_delivery_risk', bucket.platform, bucket.articleKey, period.to]),
      type: 'traffic'
    }, context));
  }
  return risks;
}

function platformKpiConfig(platform) {
  if (platform === 'wb') return { label: 'WB', plan: 'iuRevenueWbPlan', fact: 'iuRevenueWbFactToDate' };
  if (platform === 'ozon') return { label: 'Ozon', plan: 'iuRevenueOzonPlan', fact: 'iuRevenueOzonFactToDate' };
  return { label: 'Я.Маркет', plan: 'iuRevenueYandexPlan', fact: 'iuRevenueYandexFactToDate' };
}

function buildIuRisks(layers, context) {
  const kpis = layers.iuDrrSummary?.kpis || {};
  const daysInPlan = finite(kpis.daysInPlan, 0);
  const daysInSummary = Math.max(1, finite(kpis.daysInSummary, 0));
  if (!daysInPlan || !daysInSummary) return [];
  const monthKey = kpis.monthKey || String(context.asOfDate || '').slice(0, 7);
  const daysLeft = Math.max(0, daysInPlan - daysInSummary);
  return ['wb', 'ozon', 'ya'].map((platform) => {
    const cfg = platformKpiConfig(platform);
    const plan = finite(kpis[cfg.plan], 0);
    const fact = finite(kpis[cfg.fact], 0);
    if (plan <= 0 || fact <= 0) return null;
    const avgDaily = fact / daysInSummary;
    const forecastRevenue = fact + avgDaily * daysLeft;
    const completion = forecastRevenue / plan;
    if (completion >= RISK_RULES.forecast_iu_miss_risk.watchForecastCompletionLt) return null;
    const riskScore = completion < 0.9
      ? 88 + Math.min(8, (0.9 - completion) * 100)
      : completion < 0.97
        ? 66 + Math.min(12, (0.97 - completion) * 100)
        : 45;
    const gap = Math.max(0, plan - forecastRevenue);
    return createRisk({
      rule: 'forecast_iu_miss_risk',
      subRule: 'month_completion_forecast',
      platform,
      articleKey: '',
      entityLabel: `${cfg.label} · ИУ ${monthKey}`,
      owner: '',
      riskScore,
      confidence: daysInSummary >= 7 ? 'medium' : 'low',
      forecast: {
        metric: 'forecastCompletion',
        metricLabel: 'прогноз выполнения ИУ',
        currentValue: completion,
        expectedValue: 1,
        deltaPct: completion - 1,
        period: { from: `${monthKey}-01`, to: context.asOfDate, days: daysInSummary },
        previousPeriod: { from: '', to: '', days: 0 },
        currentValueLabel: fmtPct(completion, 1),
        expectedValueLabel: '100%'
      },
      drivers: [
        { key: 'fact_to_date', label: `Факт ${fmtMoney(fact)} из плана ${fmtMoney(plan)}`, weight: 0.4 },
        { key: 'forecast_gap', label: `Прогнозный разрыв ${fmtMoney(gap)}`, weight: 0.45 }
      ],
      probableCause: 'iu_month_plan_miss',
      moneyAtRiskRub: gap,
      recommendedAction: `Проверить прогноз выполнения ИУ ${cfg.label} до конца месяца.`,
      forecastText: `при текущем темпе выполнение месяца будет ${fmtPct(completion, 1)}, разрыв к плану около ${fmtMoney(gap)}.`,
      autoCode: autoCode(['forecast_iu_miss_risk', platform, monthKey]),
      type: 'traffic'
    }, context);
  }).filter(Boolean);
}

function buildPriceRows(layers) {
  const result = {};
  const platforms = layers.smartPriceOverlay?.platforms || {};
  Object.entries(platforms).forEach(([platform, payload]) => {
    const platformKey = normalizePlatform(platform);
    const rows = Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload?.items) ? payload.items : [];
    result[platformKey] = new Map();
    rows.forEach((row) => {
      const articleKey = articleKeyOf(row);
      if (!articleKey) return;
      result[platformKey].set(normalizeToken(articleKey), row);
    });
  });
  return result;
}

function buildPriceRisks(layers, skuLookup, articleSeries, context) {
  const risks = [];
  const rowsByPlatform = buildPriceRows(layers);
  const wbRows = rowsByPlatform.wb || new Map();
  const ozonRows = rowsByPlatform.ozon || new Map();
  const seriesByKey = new Map(articleSeries.map((series) => [`${series.platform}|${normalizeToken(series.articleKey)}`, series]));
  wbRows.forEach((wbRow, token) => {
    const ozonRow = ozonRows.get(token);
    if (!ozonRow) return;
    const articleKey = articleKeyOf(wbRow) || articleKeyOf(ozonRow);
    const wbPrice = finite(wbRow.currentClientPrice ?? wbRow.currentFillPrice ?? wbRow.currentPrice, 0);
    const ozonPrice = finite(ozonRow.currentClientPrice ?? ozonRow.currentFillPrice ?? ozonRow.currentPrice, 0);
    if (wbPrice <= 0 || ozonPrice <= 0 || ozonPrice >= wbPrice) return;
    const gap = (wbPrice - ozonPrice) / wbPrice;
    if (gap < RISK_RULES.price_position_risk.highCrossMarketGapPctGte) return;
    const wbSeries = seriesByKey.get(`wb|${token}`);
    const revenueStats = wbSeries ? windowStats(wbSeries, 'ordersRevenue', 7) : null;
    const wbDrop = revenueStats?.deltaPct ?? 0;
    const sku = findSku(skuLookup, articleKey);
    const critical = gap >= RISK_RULES.price_position_risk.criticalCrossMarketGapPctGte;
    const score = (critical ? 82 : 64)
      + Math.min(10, gap * 40)
      + (wbDrop <= -0.2 ? 8 : 0);
    risks.push(createRisk({
      rule: 'price_position_risk',
      subRule: 'ozon_cheaper_than_wb',
      platform: 'cross',
      articleKey,
      entityLabel: sku?.name || articleKey,
      owner: ownerFor(sku, 'wb', wbRow.owner || ozonRow.owner || ''),
      riskScore: score,
      confidence: wbDrop <= -0.2 ? 'high' : 'medium',
      forecast: {
        metric: 'crossMarketPriceGap',
        metricLabel: 'разрыв цены Ozon дешевле WB',
        currentValue: gap,
        expectedValue: 0.07,
        deltaPct: (gap - 0.07) / 0.07,
        period: { from: context.asOfDate, to: context.asOfDate, days: 1 },
        previousPeriod: { from: '', to: '', days: 0 },
        currentValueLabel: fmtPct(gap, 1),
        expectedValueLabel: 'до 7%'
      },
      drivers: [
        { key: 'ozon_cheaper', label: `Ozon дешевле WB на ${fmtPct(gap, 1)}`, weight: 0.55 },
        wbDrop <= -0.2 ? { key: 'wb_sales_drop', label: `WB выручка просела на ${fmtPct(wbDrop, 1)}`, weight: 0.25 } : null
      ].filter(Boolean),
      probableCause: 'cross_market_price_leakage',
      moneyAtRiskRub: revenueStats ? Math.max(0, finite(revenueStats.expectedValue, 0) - finite(revenueStats.currentValue, 0)) : 0,
      recommendedAction: 'Сверить цену WB/Ozon и решить, где исправлять цену, СПП или промо.',
      forecastText: 'если разрыв сохранится, часть спроса может перетекать между площадками и ломать план WB/Ozon.',
      autoCode: autoCode(['price_position_risk', articleKey, 'wb_ozon', context.asOfDate]),
      type: 'price_margin'
    }, context));
  });
  return risks;
}

function dataDateForLayer(name, payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (name === 'platform_trends.json') return dateKey(payload.latestMarketplaceDate || payload.asOfDate || payload.generatedAt);
  if (name === 'ads_summary.json') return dateKey(payload.asOfDate || payload.window?.to || payload.generatedAt);
  if (name === 'iu_drr_summary.json') return dateKey(payload.asOfDate || payload.window?.to || payload.generatedAt);
  if (name === 'oos_control.json') return dateKey(payload.dataFreshness?.dataDate || payload.summary?.dataDate || payload.generatedAt);
  if (name === 'order_procurement.json') return dateKey(payload.window?.to || payload.generatedAt);
  if (name === 'smart_price_overlay.json') return dateKey(payload.asOfDate || payload.generatedAt);
  if (name === 'wb_sales_funnel_report.json') return dateKey(payload.period?.to || payload.generatedAt);
  if (name === 'product_leaderboard.json') return dateKey(payload.sourceWeekTo || payload.generatedAt);
  if (name === 'wb_feedbacks_summary.json' || name === 'ozon_feedbacks_summary.json') return dateKey(payload.asOfDate || payload.window?.to || payload.generatedAt);
  return dateKey(payload.asOfDate || payload.generatedAt);
}

function buildFreshnessRisks(layerReads, context) {
  const expected = expectedFactDate(context.now);
  const required = [
    ['platform_trends.json', 'Marketplace trends'],
    ['ads_summary.json', 'Ads summary'],
    ['iu_drr_summary.json', 'IU/DRR summary'],
    ['oos_control.json', 'OOS control'],
    ['smart_price_overlay.json', 'Smart price overlay'],
    ['skus.json', 'SKU registry']
  ];
  const risks = [];
  const statuses = [];
  required.forEach(([fileName, label]) => {
    const read = layerReads[fileName];
    if (!read || read.missing) {
      statuses.push({ fileName, label, status: 'missing', dataDate: '', staleDays: 999 });
      risks.push(createRisk({
        rule: 'data_freshness_predictive_blocker',
        subRule: 'missing_layer',
        platform: 'all',
        entityLabel: label,
        owner: '',
        riskScore: 90,
        confidence: 'high',
        forecast: {
          metric: 'freshness',
          metricLabel: 'свежесть данных',
          currentValue: 0,
          expectedValue: 1,
          deltaPct: -1,
          period: { from: expected, to: expected, days: 1 },
          previousPeriod: { from: '', to: '', days: 0 },
          currentValueLabel: 'нет файла',
          expectedValueLabel: expected
        },
        drivers: [{ key: 'missing_layer', label: `${fileName} не найден`, weight: 1 }],
        probableCause: 'data_layer_missing',
        recommendedAction: `Восстановить слой ${fileName} и пересобрать прогноз.`,
        forecastText: 'пока слоя нет, бизнес-сигналы могут быть ложными или неполными.',
        autoCode: autoCode(['data_freshness_predictive_blocker', fileName.replace(/\.json$/, ''), expected]),
        type: 'data_quality'
      }, context));
      return;
    }
    const dataDate = dataDateForLayer(fileName, read.payload);
    const staleDays = dataDate ? Math.max(0, daysBetween(dataDate, expected)) : 999;
    const stale = !dataDate || dataDate < expected;
    statuses.push({ fileName, label, status: stale ? 'stale' : 'fresh', dataDate, expected, staleDays });
    if (!stale) return;
    const score = staleDays > 1 ? 84 : 66;
    risks.push(createRisk({
      rule: 'data_freshness_predictive_blocker',
      subRule: 'stale_layer',
      platform: 'all',
      entityLabel: label,
      owner: '',
      riskScore: score,
      confidence: 'high',
      forecast: {
        metric: 'freshness',
        metricLabel: 'свежесть данных',
        currentValue: dataDate ? daysBetween(dataDate, expected) : 999,
        expectedValue: 0,
        deltaPct: dataDate ? -1 : -1,
        period: { from: dataDate || '', to: expected, days: staleDays },
        previousPeriod: { from: '', to: '', days: 0 },
        currentValueLabel: dataDate || 'нет даты',
        expectedValueLabel: expected
      },
      drivers: [{ key: 'stale_layer', label: `${fileName}: факт до ${dataDate || 'нет даты'}, ожидался ${expected}`, weight: 1 }],
      probableCause: 'data_layer_stale',
      recommendedAction: `Проверить источник ${fileName} и перезапустить синхронизацию.`,
      forecastText: 'пока источник отстает, бизнес-сигналы по этим данным лучше не создавать.',
      autoCode: autoCode(['data_freshness_predictive_blocker', fileName.replace(/\.json$/, ''), expected]),
      type: 'data_quality'
    }, context));
  });
  return { risks, statuses };
}

function buildLaunchRisks(layers, skuLookup, context) {
  const launches = Array.isArray(layers.launches) ? layers.launches : [];
  const risks = [];
  launches.forEach((item) => {
    const launchDate = dateKey(item.launchDate || item.dueDate || item.date || item.launchMonth);
    if (!launchDate) return;
    const daysToLaunch = daysBetween(context.asOfDate, launchDate);
    if (daysToLaunch < -7 || daysToLaunch > 30) return;
    const blockers = [
      item.owner ? '' : 'нет owner',
      item.articleKey ? '' : 'нет SKU',
      item.presentationUrl || item.briefUrl ? '' : 'нет презентации/брифа'
    ].filter(Boolean);
    if (!blockers.length) return;
    const checkpoint = daysToLaunch <= 7 ? 'D-7' : daysToLaunch <= 14 ? 'D-14' : daysToLaunch <= 21 ? 'D-21' : 'D-30';
    const sku = findSku(skuLookup, item.articleKey);
    risks.push(createRisk({
      rule: 'launch_readiness_forecast',
      subRule: checkpoint,
      platform: 'product',
      articleKey: item.articleKey || '',
      entityLabel: item.name || item.title || item.articleKey || 'Новинка',
      owner: item.owner || defaultOwnerForSku(sku),
      riskScore: daysToLaunch <= 7 ? 78 : 62,
      confidence: 'medium',
      forecast: {
        metric: 'launchReadiness',
        metricLabel: 'готовность запуска',
        currentValue: blockers.length,
        expectedValue: 0,
        deltaPct: 1,
        period: { from: context.asOfDate, to: launchDate, days: Math.max(0, daysToLaunch) },
        previousPeriod: { from: '', to: '', days: 0 },
        currentValueLabel: `${blockers.length} блокер(а)`,
        expectedValueLabel: '0 блокеров'
      },
      drivers: blockers.map((blocker) => ({ key: normalizeToken(blocker), label: blocker, weight: 0.3 })),
      probableCause: 'launch_readiness_blocker',
      recommendedAction: 'Закрыть запусковый блокер до контрольной даты.',
      forecastText: `до запуска осталось ${Math.max(0, daysToLaunch)} д.; блокеры могут сорвать старт карточки.`,
      autoCode: autoCode(['launch_readiness_forecast', item.articleKey || hashShort(item.name || item.title), checkpoint, launchDate]),
      type: 'launch'
    }, context));
  });
  return risks;
}

function sortAndLimitRisks(risks, options) {
  const perRule = new Map();
  const selected = [];
  [...risks]
    .sort((left, right) => right.riskScore - left.riskScore || finite(right.moneyAtRiskRub, 0) - finite(left.moneyAtRiskRub, 0) || String(left.id).localeCompare(String(right.id)))
    .forEach((risk) => {
      const count = perRule.get(risk.rule) || 0;
      if (count >= options.ruleLimit) return;
      if (selected.length >= options.totalLimit) return;
      perRule.set(risk.rule, count + 1);
      selected.push(risk);
    });
  return selected;
}

function summarize(risks, signals) {
  const byRule = {};
  const byPriority = {};
  const byPlatform = {};
  risks.forEach((risk) => {
    byRule[risk.rule] = (byRule[risk.rule] || 0) + 1;
    byPriority[risk.priority] = (byPriority[risk.priority] || 0) + 1;
    byPlatform[risk.platform] = (byPlatform[risk.platform] || 0) + 1;
  });
  return {
    totalRisks: risks.length,
    autoTaskSignals: signals.length,
    critical: risks.filter((risk) => risk.priority === 'critical').length,
    high: risks.filter((risk) => risk.priority === 'high').length,
    medium: risks.filter((risk) => risk.priority === 'medium').length,
    watch: risks.filter((risk) => risk.riskBand === 'watch').length,
    byRule,
    byPriority,
    byPlatform
  };
}

function loadLayers(options) {
  const layerNames = [
    'platform_trends.json',
    'wb_sales_funnel_report.json',
    'ads_summary.json',
    'iu_drr_summary.json',
    'oos_control.json',
    'order_procurement.json',
    'order_procurement_wb.json',
    'order_procurement_ozon.json',
    'smart_price_overlay.json',
    'smart_price_workbench.json',
    'product_leaderboard.json',
    'product_leaderboard_history.json',
    'wb_feedbacks_summary.json',
    'ozon_feedbacks_summary.json',
    'skus.json',
    'sku_matrix.json',
    'launches.json'
  ];
  const reads = {};
  layerNames.forEach((name) => {
    reads[name] = readLayer(options, name, name === 'skus.json' || name === 'launches.json' ? [] : {});
  });
  return {
    reads,
    layers: {
      platformTrends: reads['platform_trends.json'].payload || {},
      wbSalesFunnel: reads['wb_sales_funnel_report.json'].payload || {},
      adsSummary: reads['ads_summary.json'].payload || {},
      iuDrrSummary: reads['iu_drr_summary.json'].payload || {},
      oosControl: reads['oos_control.json'].payload || {},
      smartPriceOverlay: reads['smart_price_overlay.json'].payload || {},
      smartPriceWorkbench: reads['smart_price_workbench.json'].payload || {},
      productLeaderboard: reads['product_leaderboard.json'].payload || {},
      productLeaderboardHistory: reads['product_leaderboard_history.json'].payload || [],
      skus: Array.isArray(reads['skus.json'].payload) ? reads['skus.json'].payload : [],
      skuMatrix: reads['sku_matrix.json'].payload || {},
      launches: Array.isArray(reads['launches.json'].payload) ? reads['launches.json'].payload : []
    }
  };
}

function buildPredictiveRiskSnapshot(options) {
  const { reads, layers } = loadLayers(options);
  const generatedAt = options.now.toISOString();
  const asOfDate = expectedFactDate(options.now);
  const baseContext = {
    generatedAt,
    asOfDate,
    now: options.now,
    dataFreshnessStatus: 'fresh'
  };
  const skuLookup = buildSkuLookup(layers.skus);
  const freshness = buildFreshnessRisks(reads, baseContext);
  const staleBusinessSources = freshness.statuses.some((status) => status.status === 'stale' && status.fileName !== 'skus.json');
  const context = { ...baseContext, dataFreshnessStatus: staleBusinessSources ? 'stale' : 'fresh' };
  const articleSeries = buildArticleSeries(layers, skuLookup);
  const stockIndex = stockRiskIndex(layers.oosControl);
  const risks = [
    ...freshness.risks,
    ...buildStockoutRisks(layers, context),
    ...buildIuRisks(layers, context),
    ...buildDemandRisks(articleSeries, stockIndex, context),
    ...buildAdsRisks(layers, skuLookup, context),
    ...buildPriceRisks(layers, skuLookup, articleSeries, context),
    ...buildLaunchRisks(layers, skuLookup, context)
  ];
  const limitedRisks = sortAndLimitRisks(risks, options);
  const signals = limitedRisks.map((risk) => signalFromRisk(risk, options)).filter(Boolean);
  const summary = summarize(limitedRisks, signals);
  const snapshot = {
    schema: SCHEMA,
    generatedAt,
    asOfDate,
    expectedFactDate: expectedFactDate(options.now),
    rulesVersion: 'predictive-rules-seed-v1',
    summary,
    dataFreshness: {
      status: context.dataFreshnessStatus,
      expectedFactDate: expectedFactDate(options.now),
      sources: freshness.statuses
    },
    risks: limitedRisks,
    autoTaskSignals: signals,
    diagnostics: {
      articleSeries: articleSeries.length,
      stockIndex: stockIndex.size,
      missingLayers: Object.entries(reads).filter(([, read]) => read.missing).map(([name]) => name),
      suppressBusinessTasksWhenDataStale: true
    }
  };
  const autoTaskSignals = {
    schema: SIGNAL_SCHEMA,
    generatedAt,
    asOfDate,
    source: 'predictive_risk_snapshot',
    sourceFile: 'predictive_risk_snapshot.json',
    summary,
    signals
  };
  return { snapshot, autoTaskSignals };
}

function runBuild(options) {
  const result = buildPredictiveRiskSnapshot(options);
  const snapshotPath = path.join(options.outputDir, 'predictive_risk_snapshot.json');
  const signalsPath = path.join(options.outputDir, 'auto_task_signals.json');
  writeJson(snapshotPath, result.snapshot);
  writeJson(signalsPath, result.autoTaskSignals);
  const mirrored = [mirrorOutput(options, snapshotPath), mirrorOutput(options, signalsPath)].filter(Boolean);
  return { ...result, paths: { snapshotPath, signalsPath, mirrored } };
}

if (require.main === module) {
  const options = resolveOptions(parseArgs(process.argv));
  const result = runBuild(options);
  const summary = result.snapshot.summary;
  console.log([
    `[predictive-risk] wrote ${path.relative(process.cwd(), result.paths.snapshotPath)}`,
    `[predictive-risk] wrote ${path.relative(process.cwd(), result.paths.signalsPath)}`,
    `[predictive-risk] risks=${summary.totalRisks} autoTaskSignals=${summary.autoTaskSignals} critical=${summary.critical} high=${summary.high}`
  ].join('\n'));
}

module.exports = {
  buildPredictiveRiskSnapshot,
  runBuild,
  resolveOptions,
  parseArgs,
  helpers: {
    dateKey,
    expectedFactDate,
    normalizePlatform,
    buildArticleSeries,
    buildDemandRisks,
    buildStockoutRisks,
    buildIuRisks,
    buildAdsRisks,
    buildPriceRisks
  }
};
