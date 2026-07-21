const EXECUTIVE_MARKETPLACE_KEYS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'];
const EXECUTIVE_SUPPORT_KEYS = ['cross', 'product'];
const EXECUTIVE_WORKSTREAM_KEYS = [...EXECUTIVE_MARKETPLACE_KEYS, ...EXECUTIVE_SUPPORT_KEYS];
const EXECUTIVE_FUNNEL_PLATFORMS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'];
const EXECUTIVE_FUNNEL_SUPPORT_KEYS = { wb: 'wb', ozon: 'ozon', ya: 'ym', goldapple: 'ga', letu: 'letu', magnit: 'mm' };
const EXECUTIVE_OWNER_PRIMARY_PLATFORMS = {
  'Мария Васильева': 'wb',
  'Максим Лапыгин': 'wb',
  'Молодякова Дария': 'ozon',
  'Питайкин Артём': 'ozon',
  'Анна Пирогова': 'ya',
  'Екатерина Доможирова': 'goldapple'
};
const EXECUTIVE_FUNNEL_DEFAULT_FILTERS = {
  platform: 'all',
  status: 'all',
  owner: 'all',
  search: '',
  sort: 'completionAsc'
};
const executiveFunnelFilters = window.__ALTEA_EXECUTIVE_FUNNEL_FILTERS__ || { ...EXECUTIVE_FUNNEL_DEFAULT_FILTERS };
window.__ALTEA_EXECUTIVE_FUNNEL_FILTERS__ = executiveFunnelFilters;

function executiveFunnelNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function executiveFunnelDateKey(value = '') {
  return String(value || '').slice(0, 10);
}

function executiveFunnelRatio(value) {
  if (typeof skuPlanFactNormalizeRatio === 'function') return skuPlanFactNormalizeRatio(value);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

function executiveFunnelTone(value, warn = 0.8, ok = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  if (Number(value) >= ok) return 'ok';
  if (Number(value) >= warn) return 'warn';
  return 'danger';
}

function executiveFunnelScoreTone(score = 0) {
  if (score >= 75) return 'ok';
  if (score >= 55) return 'info';
  if (score >= 35) return 'warn';
  return 'danger';
}

function executiveFunnelPlatformLabel(platform = '') {
  return typeof skuPlanFactPlatformLabel === 'function'
    ? skuPlanFactPlatformLabel(platform)
    : ({ wb: 'WB', ozon: 'Ozon', ya: 'Я.Маркет' }[platform] || platform);
}

function executiveFunnelOwner(row = {}, platform = '') {
  const sku = row.sku || row || {};
  const supportKey = EXECUTIVE_FUNNEL_SUPPORT_KEYS[platform] || platform;
  const raw = sku?.ownersByPlatform?.[supportKey]
    || sku?.owner?.byPlatform?.[supportKey]
    || row.owner
    || sku?.owner?.name
    || '';
  const owner = typeof canonicalOwnerName === 'function' ? canonicalOwnerName(raw) : String(raw || '').trim();
  return owner || 'Без owner';
}

function executiveFunnelCanonicalOwner(owner = '') {
  return typeof canonicalOwnerName === 'function'
    ? canonicalOwnerName(owner)
    : String(owner || '').trim();
}

function executiveFunnelActiveOwner(owner = '', platform = 'all') {
  if (typeof activeOwnerName === 'function') return activeOwnerName(owner, platform);
  return executiveFunnelCanonicalOwner(owner);
}

function executiveFunnelActiveOwnerList(platform = 'all') {
  return typeof activeOwnerList === 'function' ? activeOwnerList(platform) : [];
}

function executiveFunnelOwnerPrimaryPlatform(owner = '', selectedPlatform = 'all') {
  if (EXECUTIVE_FUNNEL_PLATFORMS.includes(selectedPlatform)) return selectedPlatform;
  const canonical = executiveFunnelCanonicalOwner(owner);
  return EXECUTIVE_OWNER_PRIMARY_PLATFORMS[canonical] || 'all';
}

function executiveFunnelExplicitOwnerForSku(sku = {}, platform = '') {
  const supportKey = EXECUTIVE_FUNNEL_SUPPORT_KEYS[platform] || platform;
  const sources = [sku?.ownersByPlatform, sku?.owner?.byPlatform];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const candidate = supportKey === 'ym'
      ? (source.ym || source.ya || '')
      : source[supportKey];
    const owner = executiveFunnelCanonicalOwner(candidate || '');
    if (owner) return owner;
  }
  return '';
}

function executiveFunnelAllowedOwnersForPlatform(platform = '') {
  const key = String(platform || '').toLowerCase();
  const sourceOwners = executiveFunnelActiveOwnerList(key);
  if (sourceOwners.length && key && key !== 'all') return new Set(sourceOwners);
  const owners = new Set();
  if (key === 'wb') {
    const ownerCounts = state.wbOwnerDistributionAudit?.summary?.ownerCounts || {};
    Object.keys(ownerCounts).forEach((owner) => {
      const normalized = executiveFunnelActiveOwner(owner, key);
      if (normalized) owners.add(normalized);
    });
  }
  (state.skus || []).forEach((sku) => {
    const owner = executiveFunnelActiveOwner(executiveFunnelExplicitOwnerForSku(sku, key), key);
    if (owner) owners.add(owner);
  });
  if (owners.size) return owners;
  const activeOwners = executiveFunnelActiveOwnerList(key);
  return activeOwners.length ? new Set(activeOwners) : null;
}

function executiveFunnelOwnerAllowedForPlatform(owner = '', platform = '') {
  const allowedOwners = executiveFunnelAllowedOwnersForPlatform(platform);
  if (!allowedOwners) return true;
  return allowedOwners.has(executiveFunnelActiveOwner(owner, platform));
}

function executiveFunnelDateRange(start = '', end = '') {
  const from = executiveFunnelDateKey(start);
  const to = executiveFunnelDateKey(end);
  if (!from || !to || from > to) return [];
  const result = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const finish = new Date(`${to}T00:00:00Z`);
  while (cursor <= finish && result.length < 45) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function executiveFunnelTrafficBucket() {
  return { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
}

function executiveFunnelDailyBucket(date = '') {
  return {
    date,
    revenue: 0,
    units: 0,
    marginRub: 0,
    internal: executiveFunnelTrafficBucket(),
    external: executiveFunnelTrafficBucket(),
    externalApiRevenue: 0,
    externalApiUnits: 0
  };
}

function executiveFunnelOwnerBucket(owner = 'Без owner') {
  return {
    owner,
    skuKeys: new Set(),
    platforms: new Set(),
    articleMap: new Map(),
    daily: new Map(),
    planToDateRevenue: 0,
    revenue: 0,
    units: 0,
    marginRub: 0,
    marginWeight: 0,
    internal: executiveFunnelTrafficBucket(),
    external: executiveFunnelTrafficBucket(),
    externalApiRevenue: 0,
    externalApiUnits: 0
  };
}

function executiveFunnelEnsureOwner(map, owner = '') {
  const key = owner || 'Без owner';
  if (!map.has(key)) map.set(key, executiveFunnelOwnerBucket(key));
  return map.get(key);
}

function executiveFunnelEnsureDay(bucket, date = '') {
  const key = executiveFunnelDateKey(date);
  if (!key) return null;
  if (!bucket.daily.has(key)) bucket.daily.set(key, executiveFunnelDailyBucket(key));
  return bucket.daily.get(key);
}

function executiveFunnelAddTraffic(target, source = {}) {
  target.spend += executiveFunnelNumber(source.spend);
  target.views += executiveFunnelNumber(source.views);
  target.clicks += executiveFunnelNumber(source.clicks);
  target.orders += executiveFunnelNumber(source.orders);
  target.revenue += executiveFunnelNumber(source.revenue);
}

function executiveFunnelAddArticle(bucket, row = {}, platform = '', revenue = 0) {
  const articleKey = row.articleKey || row.article || row.sku?.articleKey || '';
  if (!articleKey) return;
  bucket.skuKeys.add(`${platform}:${articleKey}`);
  const current = bucket.articleMap.get(articleKey) || {
    articleKey,
    article: row.article || articleKey,
    name: row.name || row.sku?.name || '',
    revenue: 0
  };
  current.revenue += executiveFunnelNumber(revenue);
  bucket.articleMap.set(articleKey, current);
}

function executiveFunnelMetricActive(metric = {}) {
  return Boolean(metric && (
    executiveFunnelNumber(metric.factRevenue) > 0
    || executiveFunnelNumber(metric.factUnits) > 0
    || executiveFunnelNumber(metric.planToDateRevenue) > 0
    || executiveFunnelNumber(metric.adSpend) > 0
  ));
}

function executiveFunnelMetricMarginRub(metric = {}) {
  const direct = Number(metric.marginRub);
  if (Number.isFinite(direct)) return direct;
  const marginPct = executiveFunnelRatio(metric.marginPct);
  return marginPct === null ? 0 : executiveFunnelNumber(metric.factRevenue) * marginPct;
}

function executiveFunnelMoney(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—'
    : fmt.money(value);
}

function executiveFunnelPct(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—'
    : fmt.pct(value);
}

function executiveFunnelCompletionLevel(value) {
  if (typeof skuPlanFactTone === 'function') {
    const tone = skuPlanFactTone(value);
    if (tone) return tone;
  }
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'empty';
  if (Number(value) >= 1) return 'ok';
  if (Number(value) >= 0.9) return 'warn';
  return 'danger';
}

function executiveFunnelCardStyle(platform = '', completion = null) {
  if (typeof skuPlanFactCardStyle === 'function') return skuPlanFactCardStyle(platform, completion);
  const hue = { wb: 275, ozon: 212, ya: 42, all: 205 }[platform] ?? 205;
  const ratio = completion === null || completion === undefined || !Number.isFinite(Number(completion))
    ? 0.12
    : Math.min(1.35, Math.max(0.05, Number(completion)));
  return `--pf-hue:${hue};--pf-fill:${(0.08 + Math.min(0.34, ratio * 0.24)).toFixed(3)};--pf-border:${(0.18 + Math.min(0.5, ratio * 0.3)).toFixed(3)};--pf-glow:${(0.04 + Math.min(0.18, ratio * 0.12)).toFixed(3)};--pf-progress:${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%`;
}

function executiveFunnelOwnerIsNoise(owner = '', row = {}) {
  const normalized = String(owner || '').trim().toLowerCase();
  return Boolean(
    row.syntheticUnmapped
    || row.syntheticUnallocated
    || !normalized
    || typeof isActiveOwnerName === 'function' && !isActiveOwnerName(owner)
    || normalized === 'без owner'
    || normalized === 'без владельца'
    || normalized === 'не в реестре'
    || normalized.includes('не в реестре')
  );
}

function executiveFunnelMetricPlanMarginRub(metric = {}) {
  const direct = Number(metric.planMarginRub);
  if (Number.isFinite(direct)) return direct;
  const planMarginPct = executiveFunnelRatio(metric.planMarginPct);
  return planMarginPct === null ? null : executiveFunnelNumber(metric.planToDateRevenue) * planMarginPct;
}

function executiveFunnelMetricFactWeight(metric = {}) {
  return executiveFunnelNumber(metric.factRevenue)
    || executiveFunnelNumber(metric.latestFactRevenue)
    || executiveFunnelNumber(metric.factUnits) * (executiveFunnelNumber(metric.factAvgCheck) || executiveFunnelNumber(metric.currentClientPrice) || executiveFunnelNumber(metric.currentPrice))
    || 0;
}

function executiveFunnelOwnerPlanBucket(owner = '') {
  return {
    owner,
    skuKeys: new Set(),
    items: new Map(),
    platforms: new Map(),
    planRevenue: 0,
    planToDateRevenue: 0,
    factRevenue: 0,
    planUnits: 0,
    factUnits: 0,
    marginRub: 0,
    marginWeight: 0,
    planMarginRub: 0,
    planMarginValue: 0,
    planMarginWeight: 0,
    adSpend: 0,
    planAdSpend: 0,
    hasPlanAdSpend: false,
    hasSkuFactSignal: false,
    factWeightRevenue: 0,
    externalExcludedSpend: 0,
    externalExcludedOrders: 0
  };
}

function executiveFunnelOwnerPlatformBucket(platform = '') {
  return {
    platform,
    label: executiveFunnelPlatformLabel(platform),
    skuKeys: new Set(),
    items: new Map(),
    planRevenue: 0,
    planToDateRevenue: 0,
    factRevenue: 0,
    planUnits: 0,
    factUnits: 0,
    marginRub: 0,
    marginWeight: 0,
    planMarginRub: 0,
    planMarginValue: 0,
    planMarginWeight: 0,
    adSpend: 0,
    planAdSpend: 0,
    hasPlanAdSpend: false,
    hasSkuFactSignal: false,
    factWeightRevenue: 0
  };
}

function executiveFunnelEnsureOwnerPlan(map, owner = '') {
  const key = owner || 'Без owner';
  if (!map.has(key)) map.set(key, executiveFunnelOwnerPlanBucket(key));
  return map.get(key);
}

function executiveFunnelEnsureOwnerPlatform(bucket, platform = '') {
  if (!bucket.platforms.has(platform)) bucket.platforms.set(platform, executiveFunnelOwnerPlatformBucket(platform));
  return bucket.platforms.get(platform);
}

function executiveFunnelPlanMetricActive(metric = {}) {
  return Boolean(metric && (
    executiveFunnelNumber(metric.factRevenue) > 0
    || executiveFunnelNumber(metric.factUnits) > 0
    || executiveFunnelNumber(metric.planToDateRevenue) > 0
    || executiveFunnelNumber(metric.planRevenue) > 0
    || executiveFunnelNumber(metric.adSpend) > 0
    || metric.planAdSpend !== null && metric.planAdSpend !== undefined
  ));
}

function executiveFunnelAddPlanMetricItem(target, metric = {}, platform = '', row = {}, values = {}) {
  const articleKey = String(row.articleKey || row.article || row.sku?.articleKey || row.sku?.article || '').trim();
  if (!articleKey || !(target.items instanceof Map)) return;
  const key = `${platform}:${articleKey}`;
  let item = target.items.get(key);
  if (!item) {
    item = {
      key,
      sku: articleKey,
      articleKey,
      title: String(row.name || row.title || row.sku?.name || row.sku?.title || '').trim(),
      platform,
      planRevenue: 0,
      planToDateRevenue: 0,
      factRevenue: 0,
      planUnits: 0,
      factUnits: 0,
      marginRub: 0,
      marginWeight: 0,
      planMarginRub: 0,
      adSpend: 0,
      planAdSpend: 0,
      hasPlanAdSpend: false,
      hasSkuFactSignal: false,
      factWeightRevenue: 0
    };
    target.items.set(key, item);
  }
  item.planRevenue += executiveFunnelNumber(values.planRevenue ?? metric.planRevenue);
  item.planToDateRevenue += executiveFunnelNumber(values.planToDateRevenue ?? metric.planToDateRevenue);
  item.factRevenue += executiveFunnelNumber(values.factRevenue ?? metric.factRevenue);
  item.planUnits += executiveFunnelNumber(metric.planUnits);
  item.factUnits += executiveFunnelNumber(metric.factUnits);
  item.adSpend += executiveFunnelNumber(metric.adSpend);
  if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
    item.planAdSpend += executiveFunnelNumber(metric.planAdSpend);
    item.hasPlanAdSpend = true;
  }
  if (executiveFunnelNumber(values.factRevenue ?? metric.factRevenue) > 0
    || executiveFunnelNumber(metric.factUnits) > 0
    || Array.isArray(metric.factDaily) && metric.factDaily.length > 0) {
    item.hasSkuFactSignal = true;
  }
  item.factWeightRevenue += executiveFunnelMetricFactWeight(metric);
  item.marginRub += executiveFunnelNumber(values.marginRub ?? executiveFunnelMetricMarginRub(metric));
  if (values.marginPct !== null && values.marginPct !== undefined && executiveFunnelNumber(values.factRevenue ?? metric.factRevenue) > 0) {
    item.marginWeight += executiveFunnelNumber(values.factRevenue ?? metric.factRevenue);
  }
  item.planMarginRub += executiveFunnelNumber(values.planMarginRub ?? executiveFunnelMetricPlanMarginRub(metric));
}

function executiveFunnelAddPlanMetric(target, metric = {}, platform = '', row = {}) {
  const factRevenue = executiveFunnelNumber(metric.factRevenue);
  const planToDateRevenue = executiveFunnelNumber(metric.planToDateRevenue);
  const planRevenue = executiveFunnelNumber(metric.planRevenue);
  const marginPct = executiveFunnelRatio(metric.marginPct);
  const marginRub = executiveFunnelMetricMarginRub(metric);
  const planMarginPct = executiveFunnelRatio(metric.planMarginPct);
  const planMarginRub = executiveFunnelMetricPlanMarginRub(metric);
  const articleKey = row.articleKey || row.article || '';

  target.planRevenue += planRevenue;
  target.planToDateRevenue += planToDateRevenue;
  target.factRevenue += factRevenue;
  target.planUnits += executiveFunnelNumber(metric.planUnits);
  target.factUnits += executiveFunnelNumber(metric.factUnits);
  target.adSpend += executiveFunnelNumber(metric.adSpend);
  if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
    target.planAdSpend += executiveFunnelNumber(metric.planAdSpend);
    target.hasPlanAdSpend = true;
  }
  if (factRevenue > 0
    || executiveFunnelNumber(metric.factUnits) > 0
    || Array.isArray(metric.factDaily) && metric.factDaily.length > 0) {
    target.hasSkuFactSignal = true;
  }
  target.factWeightRevenue += executiveFunnelMetricFactWeight(metric);
  target.marginRub += marginRub;
  if (marginPct !== null && factRevenue > 0) target.marginWeight += factRevenue;
  if (planMarginPct !== null) {
    const planWeight = planToDateRevenue || planRevenue || factRevenue;
    if (planWeight > 0) {
      target.planMarginValue += planMarginPct * planWeight;
      target.planMarginWeight += planWeight;
    }
  }
  if (planMarginRub !== null) target.planMarginRub += planMarginRub;
  if (articleKey && target.skuKeys) target.skuKeys.add(`${platform}:${articleKey}`);
  executiveFunnelAddPlanMetricItem(target, metric, platform, row, {
    factRevenue,
    planToDateRevenue,
    planRevenue,
    marginPct,
    marginRub,
    planMarginRub
  });
}

function executiveFunnelScalePlanBucketItems(bucket = {}, ratios = {}) {
  if (!(bucket.items instanceof Map)) return;
  const revenueRatio = Number.isFinite(Number(ratios.revenue)) ? Number(ratios.revenue) : 1;
  const planToDateRatio = Number.isFinite(Number(ratios.planToDate)) ? Number(ratios.planToDate) : 1;
  const planRatio = Number.isFinite(Number(ratios.plan)) ? Number(ratios.plan) : planToDateRatio;
  const adRatio = Number.isFinite(Number(ratios.ad)) ? Number(ratios.ad) : 1;
  const planAdRatio = Number.isFinite(Number(ratios.planAd)) ? Number(ratios.planAd) : 1;
  const marginRatio = Number.isFinite(Number(ratios.margin)) ? Number(ratios.margin) : revenueRatio;
  const planMarginRatio = Number.isFinite(Number(ratios.planMargin)) ? Number(ratios.planMargin) : planToDateRatio;
  bucket.items.forEach((item) => {
    item.factRevenue = executiveFunnelNumber(item.factRevenue) * revenueRatio;
    item.factUnits = executiveFunnelNumber(item.factUnits) * revenueRatio;
    item.planToDateRevenue = executiveFunnelNumber(item.planToDateRevenue) * planToDateRatio;
    item.planRevenue = executiveFunnelNumber(item.planRevenue) * planRatio;
    item.planUnits = executiveFunnelNumber(item.planUnits) * planRatio;
    item.adSpend = executiveFunnelNumber(item.adSpend) * adRatio;
    if (item.hasPlanAdSpend || item.planAdSpend !== null && item.planAdSpend !== undefined) {
      item.planAdSpend = executiveFunnelNumber(item.planAdSpend) * planAdRatio;
      item.hasPlanAdSpend = true;
    }
    item.marginRub = executiveFunnelNumber(item.marginRub) * marginRatio;
    item.marginWeight = executiveFunnelNumber(item.marginWeight) * revenueRatio;
    item.planMarginRub = executiveFunnelNumber(item.planMarginRub) * planMarginRatio;
  });
}

function executiveFunnelFinalizePlanItem(item = {}) {
  const planToDateRevenue = executiveFunnelNumber(item.planToDateRevenue);
  const factRevenue = executiveFunnelNumber(item.factRevenue);
  return {
    ...item,
    planAdSpend: item.hasPlanAdSpend ? executiveFunnelNumber(item.planAdSpend) : null,
    completionToDate: planToDateRevenue > 0 ? factRevenue / planToDateRevenue : null,
    gapToDate: factRevenue - planToDateRevenue,
    marginPct: executiveFunnelNumber(item.marginWeight) > 0 ? executiveFunnelNumber(item.marginRub) / executiveFunnelNumber(item.marginWeight) : null,
    drr: factRevenue > 0 ? executiveFunnelNumber(item.adSpend) / factRevenue : null
  };
}

function executiveFunnelFinalizePlanBucket(row) {
  row.articleCount = row.skuKeys?.size || 0;
  row.itemRows = row.items instanceof Map
    ? [...row.items.values()].map(executiveFunnelFinalizePlanItem).sort((left, right) => {
      const statusWeight = (item) => {
        if (executiveFunnelNumber(item.planToDateRevenue) <= 0 && executiveFunnelNumber(item.factRevenue) > 0) return 1;
        return item.completionToDate !== null && item.completionToDate < 1 ? 0 : 2;
      };
      return statusWeight(left) - statusWeight(right)
        || executiveFunnelNumber(left.gapToDate) - executiveFunnelNumber(right.gapToDate)
        || executiveFunnelNumber(right.factRevenue) - executiveFunnelNumber(left.factRevenue);
    })
    : [];
  row.completionToDate = row.planToDateRevenue > 0 ? row.factRevenue / row.planToDateRevenue : null;
  row.completionMonth = row.planRevenue > 0 ? row.factRevenue / row.planRevenue : null;
  row.gapToDate = row.factRevenue - row.planToDateRevenue;
  row.marginPct = row.marginWeight > 0 ? row.marginRub / row.marginWeight : null;
  row.planMarginPct = row.planMarginWeight > 0 ? row.planMarginValue / row.planMarginWeight : null;
  row.planMarginRub = row.planMarginPct === null ? null : row.planToDateRevenue * row.planMarginPct;
  row.planAdSpend = row.hasPlanAdSpend ? row.planAdSpend : null;
  row.drr = row.factRevenue > 0 ? row.adSpend / row.factRevenue : null;
  row.planDrr = row.planToDateRevenue > 0 && row.planAdSpend !== null ? row.planAdSpend / row.planToDateRevenue : null;
  row.level = executiveFunnelCompletionLevel(row.completionToDate);
  return row;
}

function executiveFunnelCloneItemMap(items) {
  if (!(items instanceof Map)) return new Map();
  return new Map([...items.entries()].map(([key, item]) => [key, { ...item }]));
}

function executiveFunnelClonePlanBucket(bucket = {}) {
  const clone = bucket.platform !== undefined
    ? executiveFunnelOwnerPlatformBucket(bucket.platform)
    : executiveFunnelOwnerPlanBucket(bucket.owner || '');
  [
    'planRevenue',
    'planToDateRevenue',
    'factRevenue',
    'planUnits',
    'factUnits',
    'marginRub',
    'marginWeight',
    'planMarginRub',
    'planMarginValue',
    'planMarginWeight',
    'adSpend',
    'planAdSpend',
    'factWeightRevenue',
    'externalExcludedSpend',
    'externalExcludedOrders'
  ].forEach((key) => {
    if (bucket[key] !== undefined) clone[key] = executiveFunnelNumber(bucket[key]);
  });
  clone.owner = bucket.owner || clone.owner;
  clone.platform = bucket.platform || clone.platform;
  clone.label = bucket.label || clone.label;
  clone.hasPlanAdSpend = Boolean(bucket.hasPlanAdSpend);
  clone.hasSkuFactSignal = Boolean(bucket.hasSkuFactSignal);
  clone.skuKeys = new Set(bucket.skuKeys || []);
  clone.items = executiveFunnelCloneItemMap(bucket.items);
  return executiveFunnelFinalizePlanBucket(clone);
}

function executiveFunnelSnapshotOwnerSkuMetrics(ownerMap = new Map()) {
  const snapshot = new Map();
  ownerMap.forEach((ownerBucket, owner) => {
    const platforms = new Map();
    if (ownerBucket.platforms instanceof Map) {
      ownerBucket.platforms.forEach((metric, platform) => {
        platforms.set(platform, executiveFunnelClonePlanBucket(metric));
      });
    }
    snapshot.set(owner, {
      owner,
      aggregate: executiveFunnelClonePlanBucket(ownerBucket),
      platforms
    });
  });
  return snapshot;
}

function executiveFunnelOwnerSkuMetricForDisplay(snapshot = new Map(), owner = '', selectedPlatform = 'all') {
  const ownerSnapshot = snapshot.get(owner);
  if (!ownerSnapshot) return null;
  if (EXECUTIVE_FUNNEL_PLATFORMS.includes(selectedPlatform)) {
    return ownerSnapshot.platforms.get(selectedPlatform) || null;
  }
  return ownerSnapshot.aggregate || null;
}

function executiveFunnelAllocationWeight(row = {}) {
  const skuCount = row.skuKeys instanceof Set ? row.skuKeys.size : 0;
  const itemCount = row.items instanceof Map ? row.items.size : 0;
  return executiveFunnelNumber(row.factWeightRevenue)
    || executiveFunnelNumber(row.adSpend)
    || skuCount
    || itemCount
    || executiveFunnelNumber(row.articleCount)
    || executiveFunnelNumber(row.planUnits)
    || executiveFunnelNumber(row.planToDateRevenue)
    || executiveFunnelNumber(row.planRevenue)
    || 1;
}

function executiveFunnelApplyAllocatedFactToItems(row = {}, factRevenue = 0, factUnits = 0) {
  if (!(row.items instanceof Map) || !(factRevenue > 0)) return;
  const items = [...row.items.values()].filter((item) => executiveFunnelPlanBucketHasSignal(item));
  if (!items.length) return;
  const weights = items.map(executiveFunnelAllocationWeight);
  const hasDirectedWeight = weights.some((value) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) !== 1);
  const weightSum = hasDirectedWeight
    ? weights.reduce((sum, value) => sum + (value > 0 ? value : 0), 0) || items.length
    : items.length;
  items.forEach((item, index) => {
    const weight = hasDirectedWeight ? Math.max(0, weights[index]) : 1;
    const share = weight / weightSum;
    item.factRevenue = factRevenue * share;
    if (factUnits > 0) item.factUnits = factUnits * share;
    item.payrollFactAllocated = true;
    item.payrollFactAllocationBasis = 'sku_latest_fact_weight';
  });
}

function executiveFunnelApplyOwnerSkuMetric(row = {}, metric = null) {
  if (!row || !metric || !executiveFunnelPlanBucketHasSignal(metric)) return row;
  const controlledFactRevenue = executiveFunnelNumber(row.factRevenue);
  const controlledFactUnits = executiveFunnelNumber(row.factUnits);
  row.payrollControlledMetric = {
    factRevenue: row.factRevenue,
    factUnits: row.factUnits,
    planToDateRevenue: row.planToDateRevenue,
    completionToDate: row.completionToDate,
    gapToDate: row.gapToDate,
    marginRub: row.marginRub,
    marginWeight: row.marginWeight
  };
  if (!executiveFunnelNumber(row.factWeightRevenue) && metric.factWeightRevenue !== undefined) {
    row.factWeightRevenue = executiveFunnelNumber(metric.factWeightRevenue);
  }
  row.hasSkuFactSignal = Boolean(row.hasSkuFactSignal || metric.hasSkuFactSignal);
  const metricSkuKeys = new Set(metric.skuKeys || []);
  if (metricSkuKeys.size) row.skuKeys = metricSkuKeys;
  if (!(row.items instanceof Map) || !row.items.size) row.items = executiveFunnelCloneItemMap(metric.items);
  row.ownerMetricSource = row.payrollFactAllocated ? 'payroll_fact_by_sku_weight' : 'payroll_owner_sum';
  if (!row.hasSkuFactSignal && controlledFactRevenue > 0) {
    row.factRevenue = controlledFactRevenue;
    if (controlledFactUnits > 0) row.factUnits = controlledFactUnits;
    row.marginRub = executiveFunnelNumber(row.payrollControlledMetric?.marginRub);
    row.marginWeight = executiveFunnelNumber(row.payrollControlledMetric?.marginWeight);
    row.ownerMetricSource = 'payroll_fact_by_sku_weight';
    row.ownerSkuFactFallback = true;
    executiveFunnelApplyAllocatedFactToItems(row, controlledFactRevenue, controlledFactUnits);
  }
  const finalized = executiveFunnelFinalizePlanBucket(row);
  if (!finalized.hasSkuFactSignal
    && executiveFunnelNumber(finalized.planToDateRevenue) > 0
    && controlledFactRevenue <= 0) {
    finalized.ownerSkuFactMissing = true;
    finalized.completionToDate = null;
    finalized.completionMonth = null;
    finalized.gapToDate = null;
    finalized.level = executiveFunnelCompletionLevel(null);
  }
  return finalized;
}

function executiveFunnelPlanStatusCounts(rows = []) {
  const counts = {
    okCount: 0,
    underPlanCount: 0,
    riskBandCount: 0,
    criticalCount: 0
  };
  (rows || []).forEach((row) => {
    const planToDate = executiveFunnelNumber(row?.planToDateRevenue);
    const completion = row?.completionToDate === null || row?.completionToDate === undefined || !Number.isFinite(Number(row.completionToDate))
      ? null
      : Number(row.completionToDate);
    if (completion !== null && completion >= 1) counts.okCount += 1;
    if (planToDate <= 0 || completion === null || completion >= 1) return;
    counts.underPlanCount += 1;
    if (completion < 0.8) counts.criticalCount += 1;
    else counts.riskBandCount += 1;
  });
  return counts;
}

function executiveFunnelPlanBucketHasSignal(row = {}) {
  const planAdSpend = row.planAdSpend === null || row.planAdSpend === undefined ? 0 : executiveFunnelNumber(row.planAdSpend);
  return executiveFunnelNumber(row.factRevenue) > 0
    || executiveFunnelNumber(row.planToDateRevenue) > 0
    || executiveFunnelNumber(row.planRevenue) > 0
    || executiveFunnelNumber(row.adSpend) > 0
    || planAdSpend > 0
    || executiveFunnelNumber(row.externalExcludedSpend) > 0;
}

function executiveFunnelSortRows(rows = [], sort = 'completionAsc') {
  const list = [...rows];
  const cmpNum = (getter, dir = 'desc') => (left, right) => {
    const a = getter(left);
    const b = getter(right);
    const na = a === null || a === undefined || !Number.isFinite(Number(a)) ? (dir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : Number(a);
    const nb = b === null || b === undefined || !Number.isFinite(Number(b)) ? (dir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : Number(b);
    return dir === 'asc' ? na - nb : nb - na;
  };
  if (sort === 'revenueDesc') return list.sort(cmpNum((row) => row.factRevenue, 'desc'));
  if (sort === 'gapAsc') return list.sort(cmpNum((row) => row.gapToDate, 'asc'));
  if (sort === 'adDesc') return list.sort(cmpNum((row) => row.adSpend, 'desc'));
  if (sort === 'marginAsc') return list.sort(cmpNum((row) => row.marginPct, 'asc'));
  return list.sort(cmpNum((row) => row.completionToDate, 'asc'));
}

function executiveFunnelBuildPlanModel(selectedPlatform = 'all') {
  if (typeof skuPlanFactBuildModel !== 'function') return null;
  const previous = { ...(state.skuPlanFactFilters || {}) };
  const platform = EXECUTIVE_FUNNEL_PLATFORMS.includes(selectedPlatform) ? selectedPlatform : 'all';
  try {
    state.skuPlanFactFilters = {
      ...previous,
      search: '',
      owner: 'all',
      status: 'all',
      platform,
      month: 'latest',
      date: '',
      dateFrom: '',
      dateTo: '',
      sort: 'gap',
      sortDir: 'asc'
    };
    return skuPlanFactBuildModel();
  } catch (error) {
    console.warn('[executive-funnel] plan-fact model failed', error);
    return null;
  } finally {
    state.skuPlanFactFilters = previous;
  }
}

function executiveFunnelApplyPayrollPlatformMetric(row = {}, metric = {}) {
  if (!row || !metric) return row;
  const nullableNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const copyNumber = (key) => {
    if (metric[key] === undefined) return;
    row[key] = executiveFunnelNumber(metric[key]);
  };

  row.payrollKpi = true;
  row.salaryIncluded = metric.salaryIncluded !== false;
  row.truthSource = 'company_plan';
  copyNumber('planRevenue');
  copyNumber('planToDateRevenue');
  copyNumber('factRevenue');
  copyNumber('planUnits');
  copyNumber('factUnits');
  copyNumber('adSpend');

  const planAdSpend = metric.planAdSpend ?? metric.planAdSpendToDate;
  if (planAdSpend !== undefined && planAdSpend !== null) {
    row.planAdSpend = executiveFunnelNumber(planAdSpend);
    row.hasPlanAdSpend = true;
  }

  const marginPct = nullableNumber(metric.marginPct);
  if (marginPct !== null && executiveFunnelNumber(metric.factRevenue) > 0) {
    row.marginRub = metric.marginRub !== undefined
      ? executiveFunnelNumber(metric.marginRub)
      : executiveFunnelNumber(metric.factRevenue) * marginPct;
    row.marginWeight = executiveFunnelNumber(metric.factRevenue);
  }

  const planMarginPct = nullableNumber(metric.planMarginPct);
  const planMarginWeight = executiveFunnelNumber(metric.planToDateRevenue || metric.planRevenue);
  if (planMarginPct !== null && planMarginWeight > 0) {
    row.planMarginValue = planMarginPct * planMarginWeight;
    row.planMarginWeight = planMarginWeight;
  }

  return executiveFunnelFinalizePlanBucket(row);
}

function executiveFunnelPayrollMetricForPlatform(planModel = {}, platform = 'all') {
  const payroll = planModel?.payrollKpi;
  if (!payroll || !payroll.payrollKpi && !payroll.isPayrollCritical) return null;
  const key = String(platform || 'all').toLowerCase();
  if (key === 'all') {
    return {
      ...payroll,
      platform: 'all',
      label: payroll.label || payroll.displayTitle || executiveFunnelPlatformLabel('all'),
      payrollKpi: true
    };
  }
  const aliases = [
    key,
    EXECUTIVE_FUNNEL_SUPPORT_KEYS[key],
    key === 'ya' ? 'ym' : '',
    key === 'ym' ? 'ya' : ''
  ].filter(Boolean);
  const direct = aliases
    .map((alias) => payroll.platforms?.[alias])
    .find(Boolean);
  if (direct) {
    return {
      ...direct,
      platform: key,
      label: direct.label || executiveFunnelPlatformLabel(key),
      payrollKpi: true
    };
  }
  if (typeof skuPlanFactPlatformSummary === 'function') {
    const summary = skuPlanFactPlatformSummary(planModel, key, { scope: 'allRows', includePayroll: true });
    if (summary?.payrollKpi) return summary;
  }
  return null;
}

function executiveFunnelApplyPayrollPlatformRows(platformRows = [], planModel = {}, selectedPlatform = 'all') {
  if (!planModel?.payrollKpi?.platforms) return platformRows;
  Object.keys(planModel.payrollKpi.platforms || {}).forEach((platform) => {
    if (!EXECUTIVE_FUNNEL_PLATFORMS.includes(platform)) return;
    if (selectedPlatform !== 'all' && selectedPlatform !== platform) return;
    const metric = executiveFunnelPayrollMetricForPlatform(planModel, platform);
    if (!metric?.payrollKpi || metric.salaryIncluded === false) return;

    let row = platformRows.find((item) => item.platform === platform);
    if (!row) {
      row = executiveFunnelFinalizePlanBucket(executiveFunnelOwnerPlatformBucket(platform));
      platformRows.push(row);
    }
    const previousArticleCount = row.articleCount || 0;
    executiveFunnelApplyPayrollPlatformMetric(row, metric);
    row.label = metric.label || row.label;
    row.articleCount = previousArticleCount || metric.rows || row.articleCount || 0;
  });
  return platformRows;
}

function executiveFunnelRatioForControl(target = 0, raw = 0) {
  const targetValue = executiveFunnelNumber(target);
  const rawValue = executiveFunnelNumber(raw);
  if (rawValue > 0 && targetValue > 0) return targetValue / rawValue;
  return 1;
}

function executiveFunnelPlanControlWeight(metric = {}) {
  return executiveFunnelNumber(metric.planToDateRevenue)
    || executiveFunnelNumber(metric.planRevenue)
    || executiveFunnelNumber(metric.planAdSpend)
    || 1;
}

function executiveFunnelApplyMissingPayrollFacts(ownerMap = new Map(), platform = '', target = {}, raw = {}) {
  const targetRevenue = executiveFunnelNumber(target.factRevenue);
  const targetUnits = executiveFunnelNumber(target.factUnits);
  const targetAdSpend = executiveFunnelNumber(target.adSpend);
  const targetMarginRub = executiveFunnelNumber(target.marginRub);
  const targetMarginPct = executiveFunnelRatio(target.marginPct);
  const allocateRevenue = targetRevenue > 0 && executiveFunnelNumber(raw.factRevenue) <= 0;
  const allocateAdSpend = targetAdSpend > 0 && executiveFunnelNumber(raw.adSpend) <= 0;
  const allocateMargin = allocateRevenue && (targetMarginRub > 0 || targetMarginPct !== null);
  if (!allocateRevenue && !allocateAdSpend && !allocateMargin) return null;

  const entries = [...ownerMap.values()]
    .map((ownerBucket) => ({
      owner: ownerBucket.owner,
      metric: ownerBucket.platforms?.get(platform) || null
    }))
    .filter(({ metric }) => metric && executiveFunnelPlanBucketHasSignal(metric));
  if (!entries.length) return null;

  const revenueWeightSum = entries.reduce((sum, { metric }) => sum + executiveFunnelAllocationWeight(metric), 0) || entries.length;
  const adWeightSum = entries.reduce((sum, { metric }) => sum + (executiveFunnelNumber(metric.planAdSpend) || executiveFunnelPlanControlWeight(metric)), 0) || revenueWeightSum;
  entries.forEach(({ metric }) => {
    const revenueWeight = executiveFunnelAllocationWeight(metric);
    const revenueShare = revenueWeightSum > entries.length ? Math.max(0, revenueWeight) / revenueWeightSum : 1 / entries.length;
    if (allocateRevenue) {
      metric.factRevenue = targetRevenue * revenueShare;
      if (targetUnits > 0) metric.factUnits = targetUnits * revenueShare;
    }
    if (allocateAdSpend) {
      const adWeight = executiveFunnelNumber(metric.planAdSpend) || executiveFunnelPlanControlWeight(metric);
      metric.adSpend = targetAdSpend * adWeight / adWeightSum;
    }
    if (allocateMargin) {
      metric.marginRub = targetMarginRub > 0
        ? targetMarginRub * revenueShare
        : executiveFunnelNumber(metric.factRevenue) * targetMarginPct;
      metric.marginWeight = executiveFunnelNumber(metric.factRevenue);
    }
    metric.payrollFactAllocated = true;
    metric.payrollFactAllocationBasis = 'sku_latest_fact_weight';
    executiveFunnelFinalizePlanBucket(metric);
  });
  return {
    basis: 'sku_latest_fact_weight',
    owners: entries.length,
    revenue: allocateRevenue,
    adSpend: allocateAdSpend,
    margin: allocateMargin
  };
}

function executiveFunnelScalePlanBucket(bucket = {}, ratios = {}) {
  if (!bucket) return bucket;
  const revenueRatio = Number.isFinite(Number(ratios.revenue)) ? Number(ratios.revenue) : 1;
  const planToDateRatio = Number.isFinite(Number(ratios.planToDate)) ? Number(ratios.planToDate) : 1;
  const planRatio = Number.isFinite(Number(ratios.plan)) ? Number(ratios.plan) : planToDateRatio;
  const adRatio = Number.isFinite(Number(ratios.ad)) ? Number(ratios.ad) : 1;
  const planAdRatio = Number.isFinite(Number(ratios.planAd)) ? Number(ratios.planAd) : 1;
  const marginRatio = Number.isFinite(Number(ratios.margin)) ? Number(ratios.margin) : revenueRatio;
  const planMarginRatio = Number.isFinite(Number(ratios.planMargin)) ? Number(ratios.planMargin) : planToDateRatio;

  bucket.factRevenue = executiveFunnelNumber(bucket.factRevenue) * revenueRatio;
  bucket.factUnits = executiveFunnelNumber(bucket.factUnits) * revenueRatio;
  bucket.planToDateRevenue = executiveFunnelNumber(bucket.planToDateRevenue) * planToDateRatio;
  bucket.planRevenue = executiveFunnelNumber(bucket.planRevenue) * planRatio;
  bucket.planUnits = executiveFunnelNumber(bucket.planUnits) * planRatio;
  bucket.adSpend = executiveFunnelNumber(bucket.adSpend) * adRatio;
  if (bucket.hasPlanAdSpend || bucket.planAdSpend !== null && bucket.planAdSpend !== undefined) {
    bucket.planAdSpend = executiveFunnelNumber(bucket.planAdSpend) * planAdRatio;
    bucket.hasPlanAdSpend = true;
  }
  bucket.marginRub = executiveFunnelNumber(bucket.marginRub) * marginRatio;
  bucket.marginWeight = executiveFunnelNumber(bucket.marginWeight) * revenueRatio;
  bucket.planMarginValue = executiveFunnelNumber(bucket.planMarginValue) * planMarginRatio;
  bucket.planMarginWeight = executiveFunnelNumber(bucket.planMarginWeight) * planToDateRatio;
  bucket.planMarginRub = executiveFunnelNumber(bucket.planMarginRub) * planMarginRatio;
  executiveFunnelScalePlanBucketItems(bucket, ratios);
  bucket.payrollControlScaled = true;
  return executiveFunnelFinalizePlanBucket(bucket);
}

function executiveFunnelRebuildOwnerFromPlatforms(bucket = {}) {
  const platforms = bucket.platforms instanceof Map ? bucket.platforms : new Map();
  const externalExcludedSpend = executiveFunnelNumber(bucket.externalExcludedSpend);
  const externalExcludedOrders = executiveFunnelNumber(bucket.externalExcludedOrders);
  const owner = bucket.owner || 'Без owner';
  Object.assign(bucket, executiveFunnelOwnerPlanBucket(owner));
  bucket.externalExcludedSpend = externalExcludedSpend;
  bucket.externalExcludedOrders = externalExcludedOrders;
  bucket.platforms = platforms;
  platforms.forEach((platformBucket) => {
    const metric = executiveFunnelFinalizePlanBucket(platformBucket);
    bucket.planRevenue += executiveFunnelNumber(metric.planRevenue);
    bucket.planToDateRevenue += executiveFunnelNumber(metric.planToDateRevenue);
    bucket.factRevenue += executiveFunnelNumber(metric.factRevenue);
    bucket.planUnits += executiveFunnelNumber(metric.planUnits);
    bucket.factUnits += executiveFunnelNumber(metric.factUnits);
    bucket.marginRub += executiveFunnelNumber(metric.marginRub);
    bucket.marginWeight += executiveFunnelNumber(metric.marginWeight);
    bucket.planMarginRub += executiveFunnelNumber(metric.planMarginRub);
    bucket.planMarginValue += executiveFunnelNumber(metric.planMarginValue);
    bucket.planMarginWeight += executiveFunnelNumber(metric.planMarginWeight);
    bucket.adSpend += executiveFunnelNumber(metric.adSpend);
    bucket.factWeightRevenue += executiveFunnelNumber(metric.factWeightRevenue);
    if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
      bucket.planAdSpend += executiveFunnelNumber(metric.planAdSpend);
      bucket.hasPlanAdSpend = true;
    }
    if (metric.hasSkuFactSignal) bucket.hasSkuFactSignal = true;
    (metric.skuKeys || new Set()).forEach((key) => bucket.skuKeys.add(key));
    if (bucket.items instanceof Map && metric.items instanceof Map) {
      metric.items.forEach((item, key) => bucket.items.set(key, { ...item }));
    }
  });
  return executiveFunnelFinalizePlanBucket(bucket);
}

function executiveFunnelApplyPayrollOwnerControls(ownerMap = new Map(), planModel = {}, selectedPlatform = 'all') {
  if (!planModel?.payrollKpi?.platforms) return null;
  const controls = {};
  EXECUTIVE_FUNNEL_PLATFORMS.forEach((platform) => {
    if (selectedPlatform !== 'all' && selectedPlatform !== platform) return;
    const target = executiveFunnelPayrollMetricForPlatform(planModel, platform);
    if (!target?.payrollKpi || target.salaryIncluded === false) return;
    const raw = [...ownerMap.values()].reduce((acc, ownerBucket) => {
      const metric = ownerBucket.platforms?.get(platform);
      if (!metric) return acc;
      acc.planRevenue += executiveFunnelNumber(metric.planRevenue);
      acc.planToDateRevenue += executiveFunnelNumber(metric.planToDateRevenue);
      acc.factRevenue += executiveFunnelNumber(metric.factRevenue);
      acc.adSpend += executiveFunnelNumber(metric.adSpend);
      acc.planAdSpend += metric.planAdSpend !== null && metric.planAdSpend !== undefined ? executiveFunnelNumber(metric.planAdSpend) : 0;
      acc.marginRub += executiveFunnelNumber(metric.marginRub);
      acc.planMarginRub += executiveFunnelNumber(metric.planMarginRub);
      return acc;
    }, { planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, adSpend: 0, planAdSpend: 0, marginRub: 0, planMarginRub: 0 });
    const ratios = {
      revenue: executiveFunnelRatioForControl(target.factRevenue, raw.factRevenue),
      planToDate: executiveFunnelRatioForControl(target.planToDateRevenue, raw.planToDateRevenue),
      plan: executiveFunnelRatioForControl(target.planRevenue, raw.planRevenue),
      ad: executiveFunnelRatioForControl(target.adSpend, raw.adSpend),
      planAd: executiveFunnelRatioForControl(target.planAdSpend, raw.planAdSpend),
      margin: executiveFunnelRatioForControl(target.marginRub, raw.marginRub),
      planMargin: executiveFunnelRatioForControl(target.planMarginRub, raw.planMarginRub)
    };
    ownerMap.forEach((ownerBucket) => {
      const metric = ownerBucket.platforms?.get(platform);
      if (metric) executiveFunnelScalePlanBucket(metric, ratios);
    });
    const allocation = executiveFunnelApplyMissingPayrollFacts(ownerMap, platform, target, raw);
    controls[platform] = { raw, target, ratios, allocation };
  });
  ownerMap.forEach((ownerBucket) => executiveFunnelRebuildOwnerFromPlatforms(ownerBucket));
  return controls;
}

function executiveFunnelBuildOwnerPlanFact(funnel = {}) {
  const filters = { ...EXECUTIVE_FUNNEL_DEFAULT_FILTERS, ...executiveFunnelFilters };
  const selectedPlatform = EXECUTIVE_FUNNEL_PLATFORMS.includes(filters.platform) ? filters.platform : 'all';
  const planModel = funnel.planModel || executiveFunnelBuildPlanModel(selectedPlatform);
  if (!planModel) return null;
  const periodStart = executiveFunnelDateKey(planModel.periodStart || funnel.periodStart || `${planModel.monthKey || ''}-01`);
  const periodEnd = executiveFunnelDateKey(planModel.periodEnd || funnel.periodEnd || planModel.selectedDate || planModel.maxFactDate);
  const ownerMap = new Map();
  const platformTotals = new Map(EXECUTIVE_FUNNEL_PLATFORMS.map((platform) => [platform, executiveFunnelOwnerPlatformBucket(platform)]));
  const sourceRows = Array.isArray(planModel.allRows) ? planModel.allRows : [];
  const excluded = { rows: 0, revenue: 0, planToDateRevenue: 0 };
  const activeOwners = executiveFunnelActiveOwnerList(selectedPlatform);
  activeOwners.forEach((owner) => executiveFunnelEnsureOwnerPlan(ownerMap, owner));

  sourceRows.forEach((row) => {
    EXECUTIVE_FUNNEL_PLATFORMS.forEach((platform) => {
      if (selectedPlatform !== 'all' && selectedPlatform !== platform) return;
      const metric = row.platforms?.[platform] || row[platform] || null;
      if (!executiveFunnelPlanMetricActive(metric)) return;
      if (platformTotals.has(platform)) executiveFunnelAddPlanMetric(platformTotals.get(platform), metric, platform, row);
      const owner = executiveFunnelActiveOwner(executiveFunnelOwner(row, platform), platform);
      if (executiveFunnelOwnerIsNoise(owner, row) || !executiveFunnelOwnerAllowedForPlatform(owner, platform)) {
        excluded.rows += 1;
        excluded.revenue += executiveFunnelNumber(metric.factRevenue);
        excluded.planToDateRevenue += executiveFunnelNumber(metric.planToDateRevenue);
        return;
      }

      const ownerBucket = executiveFunnelEnsureOwnerPlan(ownerMap, owner);
      const ownerPlatform = executiveFunnelEnsureOwnerPlatform(ownerBucket, platform);
      executiveFunnelAddPlanMetric(ownerBucket, metric, platform, row);
      executiveFunnelAddPlanMetric(ownerPlatform, metric, platform, row);
    });
  });

  (state.adsSummary?.itemSeries || []).forEach((item) => {
    if (!executiveFunnelIsExternalAd(item)) return;
    const date = executiveFunnelDateKey(item.date);
    if (!date || (periodStart && date < periodStart) || (periodEnd && date > periodEnd)) return;
    const platform = String(item.platformKey || item.platform || '').toLowerCase();
    if (!EXECUTIVE_FUNNEL_PLATFORMS.includes(platform)) return;
    if (selectedPlatform !== 'all' && selectedPlatform !== platform) return;
    const sku = executiveFunnelSkuForArticle(item.articleKey || item.article || item.sku || item.nmId);
    const owner = executiveFunnelActiveOwner(sku
      ? executiveFunnelOwner({ sku, owner: item.owner || '' }, platform)
      : (typeof canonicalOwnerName === 'function' ? canonicalOwnerName(item.owner || '') : String(item.owner || '').trim()), platform);
    if (executiveFunnelOwnerIsNoise(owner, { syntheticUnmapped: !sku }) || !executiveFunnelOwnerAllowedForPlatform(owner, platform)) return;
    const bucket = executiveFunnelEnsureOwnerPlan(ownerMap, owner);
    bucket.externalExcludedSpend += executiveFunnelNumber(item.spend);
    bucket.externalExcludedOrders += executiveFunnelNumber(item.orders);
  });

  const ownerSkuMetricSnapshot = executiveFunnelSnapshotOwnerSkuMetrics(ownerMap);
  const payrollOwnerControls = executiveFunnelApplyPayrollOwnerControls(ownerMap, planModel, selectedPlatform);

  const ownerRows = [...ownerMap.values()]
    .map((row) => {
      row.platformRows = [...row.platforms.values()]
        .map(executiveFunnelFinalizePlanBucket)
        .filter(executiveFunnelPlanBucketHasSignal)
        .sort((left, right) => right.factRevenue - left.factRevenue);
      row.primaryPlatform = row.platformRows[0]?.platform || executiveFunnelOwnerPrimaryPlatform(row.owner, selectedPlatform);
      const ownerSkuMetric = executiveFunnelOwnerSkuMetricForDisplay(ownerSkuMetricSnapshot, row.owner, selectedPlatform);
      return executiveFunnelApplyOwnerSkuMetric(executiveFunnelFinalizePlanBucket(row), ownerSkuMetric);
    })
    .filter((row) => activeOwners.includes(row.owner) || executiveFunnelPlanBucketHasSignal(row));

  const platformRows = [...platformTotals.values()]
    .map((row) => {
      const finalized = executiveFunnelFinalizePlanBucket(row);
      finalized.articleCount = finalized.skuKeys?.size || 0;
      return finalized;
    })
    .filter((row) => selectedPlatform === 'all' || row.platform === selectedPlatform)
    .filter((row) => row.factRevenue > 0 || row.planToDateRevenue > 0 || row.adSpend > 0 || row.hasPlanAdSpend);

  executiveFunnelApplyPayrollPlatformRows(platformRows, planModel, selectedPlatform);

  const totals = executiveFunnelFinalizePlanBucket(platformRows.reduce((acc, row) => {
    acc.planRevenue += row.planRevenue;
    acc.planToDateRevenue += row.planToDateRevenue;
    acc.factRevenue += row.factRevenue;
    acc.planUnits += row.planUnits;
    acc.factUnits += row.factUnits;
    acc.marginRub += row.marginRub;
    acc.marginWeight += row.marginWeight;
    acc.planMarginValue += row.planMarginValue;
    acc.planMarginWeight += row.planMarginWeight;
    acc.adSpend += row.adSpend;
    if (row.planAdSpend !== null && row.planAdSpend !== undefined) {
      acc.planAdSpend += executiveFunnelNumber(row.planAdSpend);
      acc.hasPlanAdSpend = true;
    }
    acc.externalExcludedSpend += row.externalExcludedSpend;
    acc.externalExcludedOrders += row.externalExcludedOrders;
    row.skuKeys.forEach((key) => acc.skuKeys.add(key));
    return acc;
  }, executiveFunnelOwnerPlanBucket('Итого')));
  const payrollTotalMetric = selectedPlatform === 'all'
    ? executiveFunnelPayrollMetricForPlatform(planModel, 'all')
    : null;
  if (payrollTotalMetric?.payrollKpi) {
    executiveFunnelApplyPayrollPlatformMetric(totals, payrollTotalMetric || planModel.payrollKpi);
  }

  const statusCounts = executiveFunnelPlanStatusCounts(ownerRows);
  totals.employeeCount = ownerRows.length;
  totals.underPlanCount = statusCounts.underPlanCount;
  totals.riskBandCount = statusCounts.riskBandCount;
  totals.criticalCount = statusCounts.criticalCount;
  totals.okCount = statusCounts.okCount;
  const ownerOptions = [...new Set((activeOwners.length ? activeOwners : ownerRows.map((row) => String(row.owner || '').trim())).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ru'));

  const search = String(filters.search || '').trim().toLowerCase();
  let visibleRows = ownerRows.filter((row) => {
    if (filters.owner && filters.owner !== 'all' && String(row.owner || '') !== String(filters.owner)) return false;
    if (search && !String(row.owner || '').toLowerCase().includes(search)) return false;
    if (filters.status === 'danger' && !(row.completionToDate !== null && row.completionToDate < 0.9)) return false;
    if (filters.status === 'watch' && !(row.completionToDate !== null && row.completionToDate >= 0.9 && row.completionToDate < 1)) return false;
    if (filters.status === 'ok' && !(row.completionToDate !== null && row.completionToDate >= 1)) return false;
    if (filters.status === 'noPlan' && row.planToDateRevenue > 0) return false;
    return true;
  });
  visibleRows = executiveFunnelSortRows(visibleRows, filters.sort);

  return {
    ready: true,
    filters,
    selectedPlatform,
    periodStart,
    periodEnd,
    monthLabel: planModel.monthLabel || funnel.monthLabel || '',
    ownerOptions,
    ownerRows: visibleRows,
    allOwnerRows: executiveFunnelSortRows(ownerRows, filters.sort),
    platformRows,
    totals,
    excluded,
    payrollOwnerControls,
    planModel
  };
}

function executiveFunnelIsExternalAd(item = {}) {
  const channel = String(item.channel || '').toLowerCase();
  const campaignId = String(item.campaignId || '').toLowerCase();
  const campaignName = String(item.campaignName || '').toLowerCase();
  return campaignId.startsWith('external-sheet:')
    || channel.includes('внеш')
    || channel.includes('external')
    || campaignName.includes('внеш')
    || campaignName.includes('external');
}

function executiveFunnelSkuForArticle(articleKey = '') {
  if (!articleKey || typeof getSku !== 'function') return null;
  return getSku(articleKey);
}

function executiveFunnelAddAdItem(ownerMap, item = {}, periodStart = '', periodEnd = '') {
  const date = executiveFunnelDateKey(item.date);
  if (!date || date < periodStart || date > periodEnd) return;
  const platform = String(item.platformKey || item.platform || '').toLowerCase();
  if (!EXECUTIVE_FUNNEL_PLATFORMS.includes(platform)) return;
  const sku = executiveFunnelSkuForArticle(item.articleKey || item.article || item.sku || item.nmId);
  const owner = executiveFunnelActiveOwner(sku
    ? executiveFunnelOwner({ sku, owner: item.owner || '' }, platform)
    : (typeof canonicalOwnerName === 'function' ? canonicalOwnerName(item.owner || '') : String(item.owner || '').trim()), platform);
  if (executiveFunnelOwnerIsNoise(owner, { syntheticUnmapped: !sku })) return;
  const bucket = executiveFunnelEnsureOwner(ownerMap, owner);
  const target = executiveFunnelIsExternalAd(item) ? bucket.external : bucket.internal;
  const traffic = {
    spend: item.spend,
    views: item.views,
    clicks: item.clicks,
    orders: item.orders,
    revenue: item.revenue
  };
  executiveFunnelAddTraffic(target, traffic);
  bucket.platforms.add(platform);
  if (sku) executiveFunnelAddArticle(bucket, { ...sku, sku, articleKey: sku.articleKey, article: sku.article, name: sku.name }, platform, 0);
  const day = executiveFunnelEnsureDay(bucket, date);
  if (!day) return;
  executiveFunnelAddTraffic(executiveFunnelIsExternalAd(item) ? day.external : day.internal, traffic);
}

function executiveFunnelLooksLikeSubstitutionArticle(article = {}) {
  const values = [
    article.articleKey,
    article.article,
    article.sourceArticleKey,
    ...(Array.isArray(article.sourceArticleKeys) ? article.sourceArticleKeys : [])
  ].map((value) => String(value || '').toLowerCase());
  return values.some((value) => (
    value.startsWith('otz_')
    || value.includes('_fbs')
    || value.includes('fbs_')
    || value.includes('wb-nm-')
    || value.includes('подмен')
    || value.includes('substitut')
  ));
}

function executiveFunnelAddExternalApi(ownerMap, periodStart = '', periodEnd = '') {
  const wb = state.platformTrends?.extraMarketplace?.platforms?.wb || {};
  const rows = [];
  (wb.articles || []).forEach((article) => {
    if (!executiveFunnelLooksLikeSubstitutionArticle(article)) return;
    const sku = executiveFunnelSkuForArticle(article.articleKey || article.article)
      || executiveFunnelSkuForArticle((article.sourceArticleKeys || [])[0]);
    const owner = executiveFunnelActiveOwner(sku ? executiveFunnelOwner({ sku }, 'wb') : '', 'wb');
    if (executiveFunnelOwnerIsNoise(owner, { syntheticUnmapped: !sku })) return;
    const bucket = executiveFunnelEnsureOwner(ownerMap, owner);
    const row = {
      articleKey: article.articleKey || article.article || '',
      canonicalArticle: sku?.articleKey || '',
      owner,
      revenue: 0,
      units: 0,
      matched: Boolean(sku)
    };
    (article.daily || []).forEach((item) => {
      const date = executiveFunnelDateKey(item.date);
      if (!date || date < periodStart || date > periodEnd) return;
      const revenue = executiveFunnelNumber(item.revenue);
      const units = executiveFunnelNumber(item.ordersUnits ?? item.units ?? item.deliveredUnits);
      row.revenue += revenue;
      row.units += units;
      bucket.externalApiRevenue += revenue;
      bucket.externalApiUnits += units;
      bucket.platforms.add('wb');
      executiveFunnelAddArticle(bucket, sku || article, 'wb', 0);
      const day = executiveFunnelEnsureDay(bucket, date);
      if (day) {
        day.externalApiRevenue += revenue;
        day.externalApiUnits += units;
      }
    });
    if (row.revenue > 0 || row.units > 0) rows.push(row);
  });
  return {
    source: wb.source || '',
    sourceMode: wb.sourceMode || '',
    from: wb.from || '',
    to: wb.to || '',
    detectedCount: rows.length,
    detectedRevenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    detectedUnits: rows.reduce((sum, row) => sum + row.units, 0),
    unmatchedCount: rows.filter((row) => !row.matched).length,
    rows: rows.sort((left, right) => right.revenue - left.revenue)
  };
}

function executiveFunnelScore(row = {}, totals = {}) {
  const revenueShare = totals.revenue > 0 ? row.revenue / totals.revenue : 0;
  const completion = row.planToDateRevenue > 0 ? row.revenue / row.planToDateRevenue : null;
  const marginPct = row.marginPct;
  const internalDrr = row.revenue > 0 ? row.internal.spend / row.revenue : null;
  const revenuePoints = Math.min(32, revenueShare * 140);
  const completionPoints = completion === null ? 10 : Math.min(26, Math.max(0, completion) * 22);
  const marginPoints = marginPct === null ? 8 : Math.max(0, Math.min(18, (marginPct - 0.12) / 0.28 * 18));
  const drrPoints = internalDrr === null ? 10 : (internalDrr <= 0.12 ? 14 : internalDrr <= 0.22 ? 10 : internalDrr <= 0.35 ? 6 : 2);
  const externalPoints = row.externalApiRevenue > 0 ? 10 : (row.external.orders > 0 ? 5 : 0);
  return Math.round(Math.max(0, Math.min(100, revenuePoints + completionPoints + marginPoints + drrPoints + externalPoints)));
}

function executiveFunnelFinalizeBucket(bucket, totals) {
  bucket.articleCount = bucket.skuKeys.size;
  bucket.platformCount = bucket.platforms.size;
  bucket.marginPct = bucket.marginWeight > 0 ? bucket.marginRub / bucket.marginWeight : null;
  bucket.completionToDate = bucket.planToDateRevenue > 0 ? bucket.revenue / bucket.planToDateRevenue : null;
  bucket.internalDrr = bucket.revenue > 0 ? bucket.internal.spend / bucket.revenue : null;
  bucket.score = executiveFunnelScore(bucket, totals);
  bucket.tone = executiveFunnelScoreTone(bucket.score);
  bucket.topArticles = [...bucket.articleMap.values()]
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 3);
  return bucket;
}

function executiveFunnelScaleBucketFinancials(bucket, revenueRatio = 1, planRatio = 1, marginRatio = 1) {
  bucket.revenue *= revenueRatio;
  bucket.planToDateRevenue *= planRatio;
  bucket.marginRub *= marginRatio;
  bucket.marginWeight *= revenueRatio;
  bucket.articleMap?.forEach((item) => { item.revenue *= revenueRatio; });
  bucket.daily?.forEach((day) => {
    day.revenue *= revenueRatio;
    day.marginRub *= marginRatio;
  });
}

function executiveFunnelApplyControlScale(ownerMap, platformTotals, planModel = {}) {
  const rawTotals = [...ownerMap.values()].reduce((acc, row) => {
    acc.revenue += row.revenue;
    acc.planToDateRevenue += row.planToDateRevenue;
    acc.marginRub += row.marginRub;
    return acc;
  }, { revenue: 0, planToDateRevenue: 0, marginRub: 0 });
  const controlTotals = planModel.totals || {};
  const revenueRatio = rawTotals.revenue > 0 && executiveFunnelNumber(controlTotals.factRevenue) > 0
    ? executiveFunnelNumber(controlTotals.factRevenue) / rawTotals.revenue
    : 1;
  const planRatio = rawTotals.planToDateRevenue > 0 && executiveFunnelNumber(controlTotals.planToDateRevenue) > 0
    ? executiveFunnelNumber(controlTotals.planToDateRevenue) / rawTotals.planToDateRevenue
    : 1;
  const marginRatio = rawTotals.marginRub > 0 && executiveFunnelNumber(controlTotals.marginRub) > 0
    ? executiveFunnelNumber(controlTotals.marginRub) / rawTotals.marginRub
    : revenueRatio;
  if (Math.abs(revenueRatio - 1) < 0.0001 && Math.abs(planRatio - 1) < 0.0001 && Math.abs(marginRatio - 1) < 0.0001) {
    return { revenueRatio, planRatio, marginRatio, applied: false };
  }
  ownerMap.forEach((bucket) => executiveFunnelScaleBucketFinancials(bucket, revenueRatio, planRatio, marginRatio));
  platformTotals.forEach((row) => {
    row.revenue *= revenueRatio;
    row.planToDateRevenue *= planRatio;
    row.marginRub *= marginRatio;
    row.marginWeight *= revenueRatio;
  });
  return { revenueRatio, planRatio, marginRatio, applied: true };
}

function executiveFunnelBuildModel() {
  const hasSalesSource = Boolean(
    state.platformTrends?.platforms?.length
    || Object.keys(state.platformTrends?.extraMarketplace?.platforms || {}).length
  );
  if (!hasSalesSource) {
    return {
      ready: false,
      reason: !state.boot?.lazyReady?.skuPlanFact || state.boot?.lazyLoads?.skuPlanFact
        ? 'Загружаем API продажи, рекламу и алиасы для управленческой сводки'
        : 'План-факт SKU не отдал продажи по площадкам'
    };
  }
  const planModel = executiveFunnelBuildPlanModel();
  if (!planModel) {
    return { ready: false, reason: 'План-факт SKU ещё не загружен' };
  }
  const periodStart = executiveFunnelDateKey(planModel.periodStart || `${planModel.monthKey}-01`);
  const periodEnd = executiveFunnelDateKey(planModel.periodEnd || planModel.selectedDate || planModel.maxFactDate);
  const ownerMap = new Map();
  const platformTotals = new Map(EXECUTIVE_FUNNEL_PLATFORMS.map((platform) => [platform, {
    platform,
    label: executiveFunnelPlatformLabel(platform),
    revenue: 0,
    units: 0,
    planToDateRevenue: 0,
    marginRub: 0,
    marginWeight: 0,
    internal: executiveFunnelTrafficBucket(),
    external: executiveFunnelTrafficBucket(),
    articles: new Set()
  }]));

  (planModel.allRows || []).forEach((row) => {
    EXECUTIVE_FUNNEL_PLATFORMS.forEach((platform) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      if (!executiveFunnelMetricActive(metric)) return;
      const owner = executiveFunnelActiveOwner(executiveFunnelOwner(row, platform), platform);
      if (executiveFunnelOwnerIsNoise(owner, row)) return;
      const bucket = executiveFunnelEnsureOwner(ownerMap, owner);
      const revenue = executiveFunnelNumber(metric.factRevenue);
      const units = executiveFunnelNumber(metric.factUnits);
      const planToDateRevenue = executiveFunnelNumber(metric.planToDateRevenue);
      const marginPct = executiveFunnelRatio(metric.marginPct);
      const marginRub = executiveFunnelMetricMarginRub(metric);
      bucket.revenue += revenue;
      bucket.units += units;
      bucket.planToDateRevenue += planToDateRevenue;
      bucket.marginRub += marginRub;
      if (marginPct !== null && revenue > 0) bucket.marginWeight += revenue;
      bucket.platforms.add(platform);
      executiveFunnelAddArticle(bucket, row, platform, revenue);

      const platformRow = platformTotals.get(platform);
      platformRow.revenue += revenue;
      platformRow.units += units;
      platformRow.planToDateRevenue += planToDateRevenue;
      platformRow.marginRub += marginRub;
      if (marginPct !== null && revenue > 0) platformRow.marginWeight += revenue;
      platformRow.articles.add(row.articleKey || row.article || '');

      (metric.factDaily || []).forEach((item) => {
        const date = executiveFunnelDateKey(item.date);
        if (!date || date < periodStart || date > periodEnd) return;
        const dayRevenue = executiveFunnelNumber(item.revenue);
        const dayUnits = executiveFunnelNumber(item.units);
        const day = executiveFunnelEnsureDay(bucket, date);
        if (!day) return;
        day.revenue += dayRevenue;
        day.units += dayUnits;
        day.marginRub += marginPct === null ? 0 : dayRevenue * marginPct;
      });
    });
  });

  (state.adsSummary?.itemSeries || []).forEach((item) => {
    executiveFunnelAddAdItem(ownerMap, item, periodStart, periodEnd);
    const platform = String(item.platformKey || item.platform || '').toLowerCase();
    if (!platformTotals.has(platform)) return;
    const date = executiveFunnelDateKey(item.date);
    if (!date || date < periodStart || date > periodEnd) return;
    const target = executiveFunnelIsExternalAd(item) ? platformTotals.get(platform).external : platformTotals.get(platform).internal;
    executiveFunnelAddTraffic(target, item);
  });

  const apiCheck = executiveFunnelAddExternalApi(ownerMap, periodStart, periodEnd);
  const controlScale = executiveFunnelApplyControlScale(ownerMap, platformTotals, planModel);
  const totals = [...ownerMap.values()].reduce((acc, row) => {
    acc.revenue += row.revenue;
    acc.units += row.units;
    acc.planToDateRevenue += row.planToDateRevenue;
    acc.marginRub += row.marginRub;
    acc.marginWeight += row.marginWeight;
    executiveFunnelAddTraffic(acc.internal, row.internal);
    executiveFunnelAddTraffic(acc.external, row.external);
    acc.externalApiRevenue += row.externalApiRevenue;
    acc.externalApiUnits += row.externalApiUnits;
    row.skuKeys.forEach((key) => acc.articleKeys.add(key));
    return acc;
  }, {
    revenue: 0,
    units: 0,
    planToDateRevenue: 0,
    marginRub: 0,
    marginWeight: 0,
    internal: executiveFunnelTrafficBucket(),
    external: executiveFunnelTrafficBucket(),
    externalApiRevenue: 0,
    externalApiUnits: 0,
    articleKeys: new Set()
  });
  totals.articleCount = totals.articleKeys.size;
  totals.marginPct = totals.marginWeight > 0 ? totals.marginRub / totals.marginWeight : null;
  totals.completionToDate = totals.planToDateRevenue > 0 ? totals.revenue / totals.planToDateRevenue : null;
  totals.internalDrr = totals.revenue > 0 ? totals.internal.spend / totals.revenue : null;

  const ownerRows = [...ownerMap.values()]
    .map((row) => executiveFunnelFinalizeBucket(row, totals))
    .sort((left, right) => right.score - left.score || right.revenue - left.revenue);
  const ownerByName = new Map(ownerRows.map((row) => [row.owner, row]));
  const dates = executiveFunnelDateRange(periodStart, periodEnd);
  const dailyRows = dates.map((date) => {
    const owners = ownerRows.map((row) => ({ owner: row.owner, ...(row.daily.get(date) || executiveFunnelDailyBucket(date)) }));
    return {
      date,
      revenue: owners.reduce((sum, row) => sum + row.revenue, 0),
      internalSpend: owners.reduce((sum, row) => sum + row.internal.spend, 0),
      externalSpend: owners.reduce((sum, row) => sum + row.external.spend, 0),
      externalApiRevenue: owners.reduce((sum, row) => sum + row.externalApiRevenue, 0),
      owners
    };
  });
  const maxDailyOwnerRevenue = dailyRows.reduce((max, day) => Math.max(max, ...day.owners.map((row) => row.revenue)), 0);
  const platformRows = [...platformTotals.values()].map((row) => ({
    ...row,
    articleCount: [...row.articles].filter(Boolean).length,
    marginPct: row.marginWeight > 0 ? row.marginRub / row.marginWeight : null,
    completionToDate: row.planToDateRevenue > 0 ? row.revenue / row.planToDateRevenue : null,
    drr: row.revenue > 0 ? row.internal.spend / row.revenue : null
  }));

  return {
    ready: true,
    periodStart,
    periodEnd,
    monthLabel: planModel.monthLabel,
    ownerRows,
    ownerByName,
    dailyRows,
    maxDailyOwnerRevenue,
    platformRows,
    totals,
    apiCheck,
    controlScale,
    planModel,
    source: {
      sales: state.platformTrends?.extraMarketplace?.generatedAt || state.platformTrends?.generatedAt || '',
      ads: state.adsSummary?.generatedAt || '',
      adsAsOf: state.adsSummary?.asOfDate || '',
      planFactAsOf: planModel.maxFactDate || periodEnd
    }
  };
}

function buildExecutiveWorkstreamSummary(active, key) {
  const tasks = sortTasks(active.filter((task) => controlWorkstreamKey(task, getSku(task.articleKey)) === key));
  const waitingRop = sortTasks(tasks.filter((task) => task.status === 'waiting_rop'));
  const waitingDirector = sortTasks(tasks.filter((task) => task.status === 'waiting_decision'));
  const overdue = tasks.filter(isTaskOverdue);
  const critical = tasks.filter((task) => task.priority === 'critical');
  const noOwner = tasks.filter((task) => !task.owner);
  const hotTasks = sortTasks(tasks.filter((task) => (
    task.status === 'waiting_decision'
    || task.status === 'waiting_rop'
    || isTaskOverdue(task)
    || task.priority === 'critical'
    || !task.owner
  ))).slice(0, 4);
  return {
    key,
    meta: controlWorkstreamMeta(key),
    tasks,
    activeCount: tasks.length,
    waitingRop,
    waitingRopCount: waitingRop.length,
    waitingDirector,
    waitingDirectorCount: waitingDirector.length,
    overdueCount: overdue.length,
    criticalCount: critical.length,
    noOwnerCount: noOwner.length,
    hotTasks,
    ownerPreview: [...new Set(tasks.map((task) => task.owner).filter(Boolean))].slice(0, 3)
  };
}

function buildExecutiveModel() {
  const control = getControlSnapshot();
  const active = sortTasks(control.active);
  const workstreams = EXECUTIVE_WORKSTREAM_KEYS.map((key) => buildExecutiveWorkstreamSummary(active, key));
  const waitingRop = sortTasks(active.filter((task) => task.status === 'waiting_rop'));
  const waitingDirector = sortTasks(active.filter((task) => task.status === 'waiting_decision'));
  const overdue = active.filter(isTaskOverdue);
  const critical = sortTasks(active.filter((task) => task.priority === 'critical'));
  const noOwnerTasks = sortTasks(active.filter((task) => !task.owner));
  const launchFocus = getLaunchItems().slice(0, 4);
  const unassignedSkus = state.skus.filter((sku) => !sku?.flags?.assigned).slice(0, 6);
  const escalations = sortTasks(active.filter((task) => (
    task.status === 'waiting_decision'
    || task.status === 'waiting_rop'
    || isTaskOverdue(task)
    || task.priority === 'critical'
    || !task.owner
  )));
  return {
    funnel: executiveFunnelBuildModel(),
    control,
    active,
    workstreams,
    marketplaceRows: workstreams.filter((row) => EXECUTIVE_MARKETPLACE_KEYS.includes(row.key)),
    supportRows: workstreams.filter((row) => EXECUTIVE_SUPPORT_KEYS.includes(row.key)),
    waitingRop,
    waitingRopCount: waitingRop.length,
    waitingDirector,
    waitingDirectorCount: waitingDirector.length,
    overdue,
    critical,
    criticalCount: critical.length,
    noOwnerTasks: noOwnerTasks.slice(0, 8),
    noOwnerCount: noOwnerTasks.length,
    launchFocus,
    unassignedSkus,
    escalations: escalations.slice(0, 12),
    riskWorkstreamCount: workstreams.filter((row) => row.overdueCount || row.criticalCount || row.noOwnerCount || row.waitingRopCount || row.waitingDirectorCount).length
  };
}

function renderExecutiveWorkstreamCard(row) {
  const hasRisk = row.overdueCount || row.criticalCount || row.noOwnerCount || row.waitingRopCount || row.waitingDirectorCount;
  const ownerText = row.ownerPreview.length ? row.ownerPreview.join(' · ') : 'owner не выделен';
  return `
    <div class="card executive-market-card ${hasRisk ? 'has-risk' : ''}">
      <div class="section-subhead">
        <div>
          <h3>${escapeHtml(row.meta.label)}</h3>
          <p class="small muted">${escapeHtml(ownerText)}</p>
        </div>
        ${badge(`${fmt.int(row.activeCount)} активных`, row.activeCount ? row.meta.kind : 'ok')}
      </div>
      <div class="badge-stack">
        ${badge(`РОП ${fmt.int(row.waitingRopCount)}`, row.waitingRopCount ? 'warn' : 'ok')}
        ${badge(`финал ${fmt.int(row.waitingDirectorCount)}`, row.waitingDirectorCount ? 'danger' : 'ok')}
        ${badge(`проср. ${fmt.int(row.overdueCount)}`, row.overdueCount ? 'danger' : '')}
        ${badge(`без owner ${fmt.int(row.noOwnerCount)}`, row.noOwnerCount ? 'warn' : '')}
      </div>
      <div class="task-mini-grid" style="margin-top:12px">
        ${row.hotTasks.length ? row.hotTasks.map(renderMiniTask).join('') : '<div class="empty">Срочных задач нет</div>'}
      </div>
      <button class="btn small-btn" type="button" data-executive-open-workstream="${escapeHtml(row.key)}">Открыть задачи ${escapeHtml(row.meta.chip)}</button>
    </div>
  `;
}

function renderExecutiveWorkstreamRow(row) {
  return `
    <div class="executive-market-row">
      <div>
        <strong>${escapeHtml(row.meta.label)}</strong>
        <div class="muted small">${escapeHtml(row.ownerPreview.length ? row.ownerPreview.join(' · ') : 'Ответственные появятся из задач')}</div>
      </div>
      <div class="badge-stack">
        ${badge(`активно ${fmt.int(row.activeCount)}`, row.activeCount ? row.meta.kind : '')}
        ${badge(`РОП ${fmt.int(row.waitingRopCount)}`, row.waitingRopCount ? 'warn' : 'ok')}
        ${badge(`финал ${fmt.int(row.waitingDirectorCount)}`, row.waitingDirectorCount ? 'danger' : 'ok')}
        ${badge(`проср. ${fmt.int(row.overdueCount)}`, row.overdueCount ? 'danger' : 'ok')}
        ${badge(`без owner ${fmt.int(row.noOwnerCount)}`, row.noOwnerCount ? 'warn' : 'ok')}
      </div>
      <button class="btn ghost small-btn" type="button" data-executive-open-workstream="${escapeHtml(row.key)}">Показать</button>
    </div>
  `;
}

function renderExecutiveFunnelKpi(label, value, hint = '', tone = '') {
  return `
    <div class="mini-kpi ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
      <span>${escapeHtml(hint)}</span>
    </div>
  `;
}

function renderExecutiveFunnelPlatformCard(row) {
  return `
    <div class="executive-funnel-platform">
      <div class="section-subhead">
        <div>
          <h3>${escapeHtml(row.label)}</h3>
          <p class="small muted">${fmt.int(row.articleCount)} артикулов в KPI-контуре</p>
        </div>
        ${badge(fmt.pct(row.completionToDate), executiveFunnelTone(row.completionToDate, 0.9, 1))}
      </div>
      <div class="executive-funnel-platform-metrics">
        <span><b>${fmt.money(row.revenue)}</b><em>оборот</em></span>
        <span><b>${fmt.money(row.marginRub)}</b><em>маржа</em></span>
        <span><b>${fmt.money(row.internal.spend)}</b><em>внутр. реклама</em></span>
        <span><b>${fmt.money(row.external.spend)}</b><em>внешний spend</em></span>
      </div>
    </div>
  `;
}

function renderExecutiveFunnelTopArticles(row = {}) {
  if (!row.topArticles?.length) return '<span class="muted small">нет продаж</span>';
  return row.topArticles.map((item) => {
    const label = item.article || item.articleKey;
    return typeof linkToSku === 'function'
      ? linkToSku(item.articleKey, label)
      : `<span>${escapeHtml(label)}</span>`;
  }).join(' ');
}

function renderExecutiveFunnelOwnerRow(row, index, maxRevenue) {
  const width = maxRevenue > 0 ? Math.max(3, Math.min(100, row.revenue / maxRevenue * 100)) : 0;
  return `
    <tr class="executive-funnel-owner-row tone-${escapeHtml(row.tone)}" style="--funnel-share:${width}%">
      <td><strong>${index + 1}</strong></td>
      <td>
        <div class="executive-funnel-owner">
          <strong>${escapeHtml(row.owner)}</strong>
          <span>${renderExecutiveFunnelTopArticles(row)}</span>
        </div>
      </td>
      <td>${fmt.int(row.articleCount)}</td>
      <td>
        <strong>${fmt.money(row.revenue)}</strong>
        <div class="muted small">план-дата ${fmt.money(row.planToDateRevenue)} · ${fmt.pct(row.completionToDate)}</div>
      </td>
      <td>
        <strong>${fmt.money(row.marginRub)}</strong>
        <div class="muted small">${fmt.pct(row.marginPct)}</div>
      </td>
      <td>
        <strong>${fmt.money(row.internal.spend)}</strong>
        <div class="muted small">ДРР ${fmt.pct(row.internalDrr)}</div>
      </td>
      <td>
        <strong>${fmt.int(row.internal.clicks)} кликов</strong>
        <div class="muted small">${fmt.int(row.internal.orders)} заказов · ${fmt.money(row.internal.revenue)}</div>
      </td>
      <td>
        <strong>${fmt.money(row.external.spend)}</strong>
        <div class="muted small">${fmt.int(row.external.orders)} заказов · API ${fmt.money(row.externalApiRevenue)}</div>
      </td>
      <td>${badge(`${fmt.int(row.score)} очков`, row.tone)}</td>
    </tr>
  `;
}

function renderExecutiveFunnelDailyTable(funnel) {
  const owners = funnel.ownerRows.slice(0, 8);
  const ownerHeaders = owners.map((row) => `<th>${escapeHtml(row.owner)}</th>`).join('');
  const rows = funnel.dailyRows.map((day) => {
    const ownerCells = owners.map((ownerRow) => {
      const point = day.owners.find((item) => item.owner === ownerRow.owner) || executiveFunnelDailyBucket(day.date);
      const alpha = funnel.maxDailyOwnerRevenue > 0 ? Math.max(0.03, Math.min(0.82, point.revenue / funnel.maxDailyOwnerRevenue * 0.82)) : 0.03;
      const meta = [
        point.internal.spend > 0 ? `РК ${fmt.money(point.internal.spend)}` : '',
        point.external.spend > 0 ? `внеш ${fmt.money(point.external.spend)}` : '',
        point.externalApiRevenue > 0 ? `API ${fmt.money(point.externalApiRevenue)}` : ''
      ].filter(Boolean).join(' · ');
      return `
        <td class="executive-funnel-heat-cell" style="--heat:${alpha.toFixed(3)}">
          <strong>${fmt.money(point.revenue)}</strong>
          <span>${escapeHtml(meta || 'без сигнала')}</span>
        </td>
      `;
    }).join('');
    return `
      <tr>
        <td class="executive-funnel-date">${escapeHtml(day.date)}</td>
        <td><strong>${fmt.money(day.revenue)}</strong></td>
        <td>${fmt.money(day.internalSpend)}</td>
        <td>${fmt.money(day.externalSpend)}<div class="muted small">API ${fmt.money(day.externalApiRevenue)}</div></td>
        ${ownerCells}
      </tr>
    `;
  }).join('');

  return `
    <div class="card executive-funnel-card">
      <div class="section-subhead">
        <div>
          <h3>Воронка по дням и сотрудникам</h3>
          <p class="small muted">Оборот берём из API площадок; внутренняя реклама и внешка идут отдельными слоями, чтобы вклад сотрудника не смешивался с закупленным трафиком.</p>
        </div>
        ${badge(`${fmt.int(funnel.dailyRows.length)} дней`, 'info')}
      </div>
      <div class="table-wrap executive-funnel-daily">
        <table>
          <thead>
            <tr>
              <th>День</th>
              <th>Оборот</th>
              <th>Внутр. реклама</th>
              <th>Внешний трафик</th>
              ${ownerHeaders}
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="12">Нет дневных данных</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderExecutiveFunnelApiCheck(funnel) {
  const api = funnel.apiCheck || {};
  const rows = (api.rows || []).slice(0, 5).map((row) => `
    <div class="executive-funnel-api-row">
      <strong>${escapeHtml(row.articleKey)}</strong>
      <span>${escapeHtml(row.canonicalArticle || 'не сматчено')}</span>
      <span>${fmt.int(row.units)} шт.</span>
      <span>${fmt.money(row.revenue)}</span>
    </div>
  `).join('');
  const tone = api.detectedCount ? (api.unmatchedCount ? 'warn' : 'ok') : 'warn';
  return `
    <div class="card executive-funnel-card executive-funnel-api">
      <div class="section-subhead">
        <div>
          <h3>Внешний трафик и подменные артикулы WB</h3>
          <p class="small muted">Проверка локального WB API-слоя: ${escapeHtml(api.source || 'источник не указан')} · ${escapeHtml(api.from || funnel.periodStart)}-${escapeHtml(api.to || funnel.periodEnd)}.</p>
        </div>
        ${badge(api.detectedCount ? `API пришёл: ${fmt.int(api.detectedCount)}` : 'API подмен не дал', tone)}
      </div>
      <div class="executive-funnel-api-grid">
        <div><span>Внешний spend</span><strong>${fmt.money(funnel.totals.external.spend)}</strong></div>
        <div><span>Внешние заказы</span><strong>${fmt.int(funnel.totals.external.orders)}</strong></div>
        <div><span>Выручка подмен API</span><strong>${fmt.money(api.detectedRevenue || 0)}</strong></div>
        <div><span>Штуки подмен API</span><strong>${fmt.int(api.detectedUnits || 0)}</strong></div>
      </div>
      <div class="executive-funnel-api-list">${rows || '<div class="empty">В WB API за период нет продаж по подменным артикулам. Внешку считаем только как spend / клики / заказы из таблицы.</div>'}</div>
    </div>
  `;
}

function executiveFunnelMetricRatio(factValue, planValue) {
  const fact = Number(factValue);
  const plan = Number(planValue);
  if (!Number.isFinite(fact) || !Number.isFinite(plan) || plan <= 0) return null;
  return fact / plan;
}

function executiveFunnelMarginCompletion(row = {}) {
  const rubRatio = executiveFunnelMetricRatio(row.marginRub, row.planMarginRub);
  if (rubRatio !== null) return rubRatio;
  return executiveFunnelMetricRatio(row.marginPct, row.planMarginPct);
}

function executiveFunnelAdPlanTone(ratio) {
  if (ratio === null || ratio === undefined || !Number.isFinite(Number(ratio))) return 'empty';
  const value = Number(ratio);
  if (value >= 0.9 && value <= 1.1) return 'ok';
  if (value >= 0.75 && value <= 1.25) return 'warn';
  return 'danger';
}

function executiveFunnelTeamTone(ratio) {
  if (ratio === null || ratio === undefined || !Number.isFinite(Number(ratio))) return 'empty';
  if (Number(ratio) >= 0.75) return 'ok';
  if (Number(ratio) >= 0.5) return 'warn';
  return 'danger';
}

function executiveFunnelOwnerStatus(level = 'empty') {
  if (level === 'ok') return 'в плане';
  if (level === 'warn') return 'на грани';
  if (level === 'danger') return 'догнать';
  return 'без плана';
}

function renderExecutivePlanFactBar(options = {}) {
  const ratio = options.ratio === null || options.ratio === undefined || !Number.isFinite(Number(options.ratio))
    ? null
    : Math.max(0, Number(options.ratio));
  const tone = options.tone || executiveFunnelCompletionLevel(ratio);
  const style = `${executiveFunnelCardStyle(options.platform || 'all', ratio)};--pf-metric-progress:${ratio === null ? '0' : Math.min(100, ratio * 100).toFixed(1)}%`;
  const valueText = options.valueText || (ratio === null ? '—' : executiveFunnelPct(ratio));
  return `
    <div class="executive-owner-metric ${escapeHtml(tone)}" style="${style}">
      <div class="executive-owner-metric-top">
        <span>${escapeHtml(options.label || '')}</span>
        <strong>${escapeHtml(valueText)}</strong>
      </div>
      <div class="executive-owner-metric-values">
        <em>${escapeHtml(options.planText || 'план —')}</em>
        <b>${escapeHtml(options.factText || 'факт —')}</b>
      </div>
      <i class="executive-owner-metric-track"><b></b></i>
      ${options.hint ? `<small>${escapeHtml(options.hint)}</small>` : ''}
    </div>
  `;
}

function renderExecutiveOwnerMetricBars(row = {}) {
  const platform = row.primaryPlatform || 'all';
  const revenueRatio = row.completionToDate;
  const marginRatio = executiveFunnelMarginCompletion(row);
  const adRatio = executiveFunnelMetricRatio(row.adSpend, row.planAdSpend);
  const adTone = row.planAdSpend === null || row.planAdSpend === undefined
    ? 'empty'
    : executiveFunnelAdPlanTone(adRatio);
  return `
    ${renderExecutivePlanFactBar({
      label: 'Оборот',
      platform,
      ratio: revenueRatio,
      tone: executiveFunnelCompletionLevel(revenueRatio),
      planText: `план ${fmt.money(row.planToDateRevenue)}`,
      factText: `факт ${fmt.money(row.factRevenue)}`
    })}
    ${renderExecutivePlanFactBar({
      label: 'Маржа',
      platform,
      ratio: marginRatio,
      tone: executiveFunnelCompletionLevel(marginRatio),
      valueText: row.marginPct === null || row.marginPct === undefined ? '—' : executiveFunnelPct(row.marginPct),
      planText: `план ${executiveFunnelPct(row.planMarginPct)} · ${executiveFunnelMoney(row.planMarginRub)}`,
      factText: `факт ${executiveFunnelPct(row.marginPct)} · ${executiveFunnelMoney(row.marginRub)}`
    })}
    ${renderExecutivePlanFactBar({
      label: 'Реклама',
      platform,
      ratio: adRatio,
      tone: adTone,
      valueText: adRatio === null ? '—' : executiveFunnelPct(adRatio),
      planText: `план ${executiveFunnelMoney(row.planAdSpend)}`,
      factText: `факт ${fmt.money(row.adSpend)}`,
      hint: `ДРР план ${executiveFunnelPct(row.planDrr)} · факт ${executiveFunnelPct(row.drr)}`
    })}
  `;
}

function renderExecutiveHeroKpi(options = {}) {
  const ratio = options.ratio === null || options.ratio === undefined || !Number.isFinite(Number(options.ratio))
    ? null
    : Math.max(0, Number(options.ratio));
  const tone = options.tone || executiveFunnelCompletionLevel(ratio);
  const style = `${executiveFunnelCardStyle(options.platform || 'all', ratio)};--pf-metric-progress:${ratio === null ? '0' : Math.min(100, ratio * 100).toFixed(1)}%`;
  return `
    <div class="executive-owner-hero-kpi ${escapeHtml(tone)}" style="${style}">
      <span>${escapeHtml(options.label || '')}</span>
      <strong>${escapeHtml(options.value || '—')}</strong>
      <i class="executive-owner-metric-track"><b></b></i>
      <em>${escapeHtml(options.detail || '')}</em>
    </div>
  `;
}

function renderExecutiveOwnerCard(row = {}, index = 0) {
  const level = executiveFunnelCompletionLevel(row.completionToDate);
  const style = executiveFunnelCardStyle(row.primaryPlatform || 'all', row.completionToDate);
  const gapTone = row.gapToDate >= 0 ? 'ok-text' : 'danger-text';
  return `
    <article class="executive-owner-card level-${level}" data-platform="${escapeHtml(row.primaryPlatform || 'all')}" style="${style}">
      <div class="executive-owner-card-head">
        <div>
          <span class="executive-owner-rank">#${fmt.int(index + 1)}</span>
          <h3>${escapeHtml(row.owner)}</h3>
        </div>
        <strong class="executive-owner-percent">${executiveFunnelPct(row.completionToDate)}</strong>
      </div>
      <div class="executive-owner-subline">
        <span>${fmt.int(row.articleCount)} SKU в KPI</span>
        <span class="${gapTone}">${fmt.money(row.gapToDate)}</span>
      </div>
      <span class="executive-owner-progress"><i></i></span>
      <div class="executive-owner-scoreline">
        <span class="executive-owner-score level-${level}">${escapeHtml(executiveFunnelOwnerStatus(level))}</span>
        <span>разрыв ${fmt.money(row.gapToDate)}</span>
      </div>
      <div class="executive-owner-metrics">
        ${renderExecutiveOwnerMetricBars(row)}
      </div>
    </article>
  `;
}

function renderExecutivePlatformPlanCard(row = {}) {
  const level = executiveFunnelCompletionLevel(row.completionToDate);
  return `
    <div class="executive-platform-plan-card level-${level}" data-platform="${escapeHtml(row.platform)}" style="${executiveFunnelCardStyle(row.platform, row.completionToDate)}">
      <div>
        <span>${escapeHtml(row.label || executiveFunnelPlatformLabel(row.platform))}</span>
        <strong>${executiveFunnelPct(row.completionToDate)}</strong>
      </div>
      <i><b></b></i>
      <div class="executive-platform-plan-grid">
        <span><b>${fmt.money(row.planToDateRevenue)}</b><em>план оборота</em></span>
        <span><b>${fmt.money(row.factRevenue)}</b><em>факт оборота</em></span>
        <span><b>${executiveFunnelMoney(row.planAdSpend)}</b><em>план рекламы</em></span>
        <span><b>${fmt.money(row.adSpend)}</b><em>факт рекламы</em></span>
      </div>
    </div>
  `;
}

function renderExecutiveOwnerFilterButton(kind, value, label, active) {
  return `
    <button class="${active ? 'is-active' : ''}" type="button" data-executive-funnel-${escapeHtml(kind)}="${escapeHtml(value)}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderExecutiveOwnerFilters(model = {}) {
  const filters = model.filters || EXECUTIVE_FUNNEL_DEFAULT_FILTERS;
  const platformButtons = [
    ['all', 'Все'],
    ['wb', 'WB'],
    ['ozon', 'Ozon'],
    ['ya', 'Яндекс'],
    ['goldapple', 'ЗЯ'],
    ['letu', 'Лэтуаль'],
    ['magnit', 'Магнит']
  ].map(([value, label]) => renderExecutiveOwnerFilterButton('platform', value, label, filters.platform === value)).join('');
  const statusButtons = [
    ['all', 'Все'],
    ['danger', '< 90%'],
    ['watch', '90-100%'],
    ['ok', 'OK'],
    ['noPlan', 'Без плана']
  ].map(([value, label]) => renderExecutiveOwnerFilterButton('status', value, label, filters.status === value)).join('');
  return `
    <div class="executive-owner-toolbar">
      <div class="executive-owner-segment" aria-label="Площадка">${platformButtons}</div>
      <div class="executive-owner-segment" aria-label="Выполнение">${statusButtons}</div>
      <label class="executive-owner-search">
        <span>Поиск сотрудника</span>
        <input type="search" value="${escapeHtml(filters.search || '')}" placeholder="Имя" data-executive-funnel-search>
      </label>
      <label class="executive-owner-sort">
        <span>Сортировка</span>
        <select data-executive-funnel-sort>
          <option value="completionAsc" ${filters.sort === 'completionAsc' ? 'selected' : ''}>сначала ниже плана</option>
          <option value="gapAsc" ${filters.sort === 'gapAsc' ? 'selected' : ''}>по отставанию</option>
          <option value="revenueDesc" ${filters.sort === 'revenueDesc' ? 'selected' : ''}>по обороту</option>
          <option value="marginAsc" ${filters.sort === 'marginAsc' ? 'selected' : ''}>по марже</option>
          <option value="adDesc" ${filters.sort === 'adDesc' ? 'selected' : ''}>по рекламе</option>
        </select>
      </label>
    </div>
  `;
}

function renderExecutiveFunnel(funnel) {
  const ownerPlanModel = executiveFunnelBuildOwnerPlanFact(funnel || {});
  if (!funnel?.ready && !ownerPlanModel?.ready) {
    return `
      <div class="card executive-funnel-card">
        <div class="section-subhead">
          <div>
            <h3>Сводная воронка продаж</h3>
            <p class="small muted">${escapeHtml(funnel?.reason || 'План-факт SKU ещё не готов для управленческого среза.')}</p>
          </div>
          ${badge('нужна загрузка', 'warn')}
        </div>
      </div>
    `;
  }
  const model = ownerPlanModel;
  if (!model?.ready) {
    return `
      <div class="card executive-funnel-card">
        <div class="section-subhead">
          <div>
            <h3>План-факт по сотрудникам</h3>
            <p class="small muted">План-факт SKU ещё не отдал данные для зарплатного контура.</p>
          </div>
          ${badge('нужна загрузка', 'warn')}
        </div>
      </div>
    `;
  }
  const totals = model.totals || {};
  const ownerCards = model.ownerRows.map((row, index) => renderExecutiveOwnerCard(row, index)).join('');
  const platform = model.selectedPlatform || 'all';
  const marginCompletion = executiveFunnelMarginCompletion(totals);
  const adCompletion = executiveFunnelMetricRatio(totals.adSpend, totals.planAdSpend);
  const teamCompletion = totals.employeeCount > 0 ? (totals.okCount || 0) / totals.employeeCount : null;
  return `
    <div class="executive-funnel-shell executive-owner-plan-shell">
      <div class="card executive-owner-hero" style="${executiveFunnelCardStyle(platform, totals.completionToDate)}">
        <div class="section-subhead">
          <div>
            <h3>План-факт по сотрудникам</h3>
            <p class="small muted">Период ${escapeHtml(model.periodStart)}-${escapeHtml(model.periodEnd)} · зарплатный KPI WB / Ozon / Яндекс / ЗЯ / Лэтуаль / Магнит.</p>
          </div>
          <div class="badge-stack">
            ${badge(`выполнение ${executiveFunnelPct(totals.completionToDate)}`, executiveFunnelTone(totals.completionToDate, 0.9, 1))}
            ${badge(`${fmt.int(totals.underPlanCount || 0)} ниже плана`, totals.underPlanCount ? 'danger' : 'ok')}
          </div>
        </div>
        <div class="executive-owner-hero-grid">
          ${renderExecutiveHeroKpi({
            label: 'Оборот',
            platform,
            ratio: totals.completionToDate,
            tone: executiveFunnelCompletionLevel(totals.completionToDate),
            value: executiveFunnelPct(totals.completionToDate),
            detail: `план ${fmt.money(totals.planToDateRevenue)} · факт ${fmt.money(totals.factRevenue)}`
          })}
          ${renderExecutiveHeroKpi({
            label: 'Маржа',
            platform,
            ratio: marginCompletion,
            tone: executiveFunnelCompletionLevel(marginCompletion),
            value: `${executiveFunnelPct(totals.planMarginPct)} / ${executiveFunnelPct(totals.marginPct)}`,
            detail: `план ${executiveFunnelMoney(totals.planMarginRub)} · факт ${executiveFunnelMoney(totals.marginRub)}`
          })}
          ${renderExecutiveHeroKpi({
            label: 'Реклама',
            platform,
            ratio: adCompletion,
            tone: totals.planAdSpend === null || totals.planAdSpend === undefined ? 'empty' : executiveFunnelAdPlanTone(adCompletion),
            value: adCompletion === null ? '—' : executiveFunnelPct(adCompletion),
            detail: `план ${executiveFunnelMoney(totals.planAdSpend)} · факт ${fmt.money(totals.adSpend)} · ДРР ${executiveFunnelPct(totals.planDrr)} / ${executiveFunnelPct(totals.drr)}`
          })}
          ${renderExecutiveHeroKpi({
            label: 'Команда',
            platform,
            ratio: teamCompletion,
            tone: executiveFunnelTeamTone(teamCompletion),
            value: `${fmt.int(totals.okCount || 0)} / ${fmt.int(totals.employeeCount || 0)}`,
            detail: 'в плане / всего сотрудников'
          })}
        </div>
      </div>

      ${renderExecutiveOwnerFilters(model)}

      <div class="executive-platform-plan-board">
        ${model.platformRows.map(renderExecutivePlatformPlanCard).join('')}
      </div>

      <div class="card executive-owner-board">
        <div class="section-subhead">
          <div>
            <h3>Сотрудники</h3>
            <p class="small muted">Срез по ответственным за период: план, факт, маржа и реклама.</p>
          </div>
          ${badge(`${fmt.int(model.ownerRows.length)} показано`, 'info')}
        </div>
        <div class="executive-owner-card-grid">
          ${ownerCards || '<div class="empty">Нет сотрудников под выбранный фильтр</div>'}
        </div>
      </div>
    </div>
  `;
}

function executiveFunnelForceRender() {
  if (typeof window.__ALTEA_INVALIDATE_EXECUTIVE_PRESENTATION__ === 'function') {
    window.__ALTEA_INVALIDATE_EXECUTIVE_PRESENTATION__();
  }
  const root = document.getElementById('view-executive');
  if (root) root.dataset.executiveSignature = '';
  if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
  else if (typeof window.renderExecutive === 'function') window.renderExecutive();
}

function executiveFunnelSetFilter(key, value) {
  if (!Object.prototype.hasOwnProperty.call(EXECUTIVE_FUNNEL_DEFAULT_FILTERS, key)) return;
  executiveFunnelFilters[key] = String(value ?? EXECUTIVE_FUNNEL_DEFAULT_FILTERS[key]);
  window.__ALTEA_EXECUTIVE_FUNNEL_FILTERS__ = executiveFunnelFilters;
  executiveFunnelForceRender();
}

function executiveFunnelInstallFilterEvents() {
  if (window.__ALTEA_EXECUTIVE_FUNNEL_FILTER_EVENTS__) return;
  window.__ALTEA_EXECUTIVE_FUNNEL_FILTER_EVENTS__ = true;
  document.addEventListener('click', (event) => {
    const platformButton = event.target.closest?.('[data-executive-funnel-platform]');
    if (platformButton) {
      executiveFunnelSetFilter('platform', platformButton.getAttribute('data-executive-funnel-platform') || 'all');
      return;
    }
    const statusButton = event.target.closest?.('[data-executive-funnel-status]');
    if (statusButton) {
      executiveFunnelSetFilter('status', statusButton.getAttribute('data-executive-funnel-status') || 'all');
    }
  });
  document.addEventListener('input', (event) => {
    const input = event.target?.matches?.('[data-executive-funnel-search]') ? event.target : null;
    if (!input) return;
    executiveFunnelSetFilter('search', input.value || '');
  });
  document.addEventListener('change', (event) => {
    const ownerSelect = event.target?.matches?.('[data-executive-funnel-owner]') ? event.target : null;
    if (ownerSelect) {
      executiveFunnelSetFilter('owner', ownerSelect.value || 'all');
      return;
    }
    const select = event.target?.matches?.('[data-executive-funnel-sort]') ? event.target : null;
    if (!select) return;
    executiveFunnelSetFilter('sort', select.value || 'completionAsc');
  });
}

executiveFunnelInstallFilterEvents();
window.executiveFunnelBuildModel = executiveFunnelBuildModel;
window.executiveFunnelBuildOwnerPlanFact = executiveFunnelBuildOwnerPlanFact;
window.renderExecutiveFunnel = renderExecutiveFunnel;

function renderExecutive() {
  const root = document.getElementById('view-executive');
  const model = buildExecutiveModel();
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Руководителю</h2>
        <p>Свод по РОПам и маркетплейсам: каждый контур видит свои задачи, руководитель видит риски, просрочки и финальные согласования.</p>
      </div>
      <div class="badge-stack">${badge(`${fmt.int(model.waitingDirectorCount)} ждут финала`, model.waitingDirectorCount ? 'danger' : 'ok')}${badge(`${fmt.int(model.waitingRopCount)} ждут РОПа`, model.waitingRopCount ? 'warn' : 'ok')}</div>
    </div>

    ${renderExecutiveFunnel(model.funnel)}

    <div class="kpi-strip">
      <div class="mini-kpi danger"><span>Финал</span><strong>${fmt.int(model.waitingDirectorCount)}</strong><span>управленческое решение</span></div>
      <div class="mini-kpi warn"><span>У РОПов</span><strong>${fmt.int(model.waitingRopCount)}</strong><span>согласование площадки</span></div>
      <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(model.overdue.length)}</strong><span>нужен апдейт срока</span></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(model.noOwnerCount)}</strong><span>нужно закрепить</span></div>
      <div class="mini-kpi"><span>Активно</span><strong>${fmt.int(model.active.length)}</strong><span>все задачи</span></div>
      <div class="mini-kpi"><span>Контуры с риском</span><strong>${fmt.int(model.riskWorkstreamCount)}</strong><span>площадки и блоки</span></div>
    </div>

    <div class="executive-market-grid" style="margin-top:14px">
      ${model.marketplaceRows.map(renderExecutiveWorkstreamCard).join('')}
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>У РОПов на согласовании</h3>
            <p class="small muted">Задачи уже сданы исполнителем и ждут решения конкретной площадки.</p>
          </div>
          ${badge(`${fmt.int(model.waitingRopCount)} шт.`, model.waitingRopCount ? 'warn' : 'ok')}
        </div>
        <div class="task-mini-grid">${model.waitingRop.slice(0, 8).map(renderMiniTask).join('') || '<div class="empty">Нет задач на согласовании у РОПов</div>'}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Финал руководителя</h3>
            <p class="small muted">РОП уже согласовал, осталось зафиксировать итог или вернуть задачу обратно.</p>
          </div>
          ${badge(`${fmt.int(model.waitingDirectorCount)} шт.`, model.waitingDirectorCount ? 'danger' : 'ok')}
        </div>
        <div class="task-mini-grid">${model.waitingDirector.slice(0, 8).map(renderMiniTask).join('') || '<div class="empty">Нет задач на финальном согласовании</div>'}</div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Матрица ответственности</h3>
          <p class="small muted">Одна строка — один контур. Нажмите “Показать”, чтобы перейти в задачи уже с фильтром этой площадки.</p>
        </div>
        ${badge(`${fmt.int(model.workstreams.length)} контуров`, 'info')}
      </div>
      <div class="executive-market-table">${model.workstreams.map(renderExecutiveWorkstreamRow).join('')}</div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Сквозные и продуктовые</h3>
            <p class="small muted">Общие вопросы и продуктовые запуски отдельно от WB/Ozon.</p>
          </div>
        </div>
        <div class="executive-market-table">${model.supportRows.map(renderExecutiveWorkstreamRow).join('')}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Что требует решения сегодня</h3>
            <p class="small muted">Просрочки, критичные задачи и всё, что зависло без owner.</p>
          </div>
          ${badge(`${fmt.int(model.escalations.length)} в short-list`, model.escalations.length ? 'danger' : 'ok')}
        </div>
        <div class="task-mini-grid">${model.escalations.map(renderMiniTask).join('') || '<div class="empty">Нет срочных эскалаций</div>'}</div>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-executive-open-workstream]').forEach((button) => button.addEventListener('click', () => {
    state.controlFilters.platform = button.dataset.executiveOpenWorkstream || 'all';
    state.controlFilters.status = 'active';
    state.controlFilters.horizon = 'all';
    state.controlFilters.source = 'all';
    state.controlFilters.lazyQueue = 'mine';
    setView('control');
  }));
}

async function createComment(payload) {
  const comment = normalizeComment({
    id: uid('comment'),
    articleKey: payload.articleKey,
    author: String(payload.author || state.team.member.name || 'Команда').trim() || 'Команда',
    team: String(payload.team || teamMemberLabel()).trim() || 'Команда',
    createdAt: new Date().toISOString(),
    text: String(payload.text || '').trim(),
    type: String(payload.type || 'signal')
  });
  if (!comment.text) return;
  state.storage.comments.unshift(comment);
  saveLocalStorage();
  try {
    await persistComment(comment);
  } catch (error) {
    console.error(error);
  }
  return comment;
}

async function createTaskHistoryEntry(taskId, kind, text, payload = {}) {
  const task = getTask(taskId);
  if (!task || !String(text || '').trim()) return;
  return createComment({
    articleKey: task.articleKey || '',
    author: payload.author || state.team.member.name || task.owner || 'Команда',
    team: payload.team || teamMemberLabel(),
    type: 'task_log',
    text: `[[task:${taskId}]] [[kind:${kind}]] ${String(text || '').trim()}`
  });
}

async function removeOwnerAssignment(articleKey) {
  const normalizedArticleKey = String(articleKey || '').trim();
  if (!normalizedArticleKey) return;
  const clearedOverride = normalizeOwnerOverride({
    articleKey: normalizedArticleKey,
    ownerName: '',
    ownerRole: '',
    note: '',
    updatedAt: new Date().toISOString(),
    assignedBy: state.team.member.name || 'Команда'
  });
  state.storage.ownerOverrides = (state.storage.ownerOverrides || []).filter((item) => item.articleKey !== normalizedArticleKey);
  state.storage.ownerOverrides.unshift(clearedOverride);
  applyOwnerOverridesToSkus();
  saveLocalStorage();
  try {
    await persistOwnerOverride(clearedOverride);
  } catch (error) {
    console.error(error);
  }
}

async function upsertProductLifecycleStatus(payload = {}) {
  const override = normalizeProductLifecycleOverride({
    articleKey: payload.articleKey,
    status: payload.status,
    key: payload.key,
    note: payload.note,
    updatedAt: new Date().toISOString(),
    updatedBy: state.team.member.name || 'Команда'
  });
  if (!override.articleKey) return;

  const previous = productLifecycleOverrideForArticle(override.articleKey);
  state.storage.productLifecycleOverrides = (state.storage.productLifecycleOverrides || [])
    .filter((item) => item.articleKey !== override.articleKey);
  state.storage.productLifecycleOverrides.unshift(override);
  applyOwnerOverridesToSkus();
  if (typeof invalidateRepricerRowsCache === 'function') invalidateRepricerRowsCache();
  saveLocalStorage();

  const changed = !previous || previous.key !== override.key || String(previous.note || '') !== override.note;
  if (changed) {
    await createComment({
      articleKey: override.articleKey,
      author: state.team.member.name || 'Команда',
      team: teamMemberLabel(),
      type: productLifecycleIsExit(override.key) ? 'risk' : 'signal',
      text: `Статус товара: ${override.status}${override.note ? `. ${override.note}` : ''}`
    });
  }
}

async function removeProductLifecycleStatus(articleKey) {
  const normalizedArticleKey = String(articleKey || '').trim();
  if (!normalizedArticleKey) return;
  const previous = productLifecycleOverrideForArticle(normalizedArticleKey);
  state.storage.productLifecycleOverrides = (state.storage.productLifecycleOverrides || [])
    .filter((item) => item.articleKey !== normalizedArticleKey);
  applyOwnerOverridesToSkus();
  if (typeof invalidateRepricerRowsCache === 'function') invalidateRepricerRowsCache();
  saveLocalStorage();
  if (previous) {
    await createComment({
      articleKey: normalizedArticleKey,
      author: state.team.member.name || 'Команда',
      team: teamMemberLabel(),
      type: 'signal',
      text: `Ручной статус товара снят. Было: ${previous.status}.`
    });
  }
}

function buildTaskUpdateMessage(before, after) {
  const changes = [];
  if (before.title !== after.title) changes.push(`заголовок → ${after.title}`);
  if ((before.owner || '') !== (after.owner || '')) changes.push(`owner → ${after.owner || 'Без owner'}`);
  if ((before.coOwner || '') !== (after.coOwner || '')) changes.push(`соисполнитель → ${after.coOwner || '—'}`);
  if ((before.due || '') !== (after.due || '')) changes.push(`срок → ${after.due || '—'}`);
  if (before.status !== after.status) changes.push(`статус → ${(TASK_STATUS_META[after.status] || TASK_STATUS_META.new).label}`);
  if (before.priority !== after.priority) changes.push(`приоритет → ${(PRIORITY_META[after.priority] || PRIORITY_META.medium).label}`);
  if (before.type !== after.type) changes.push(`тип → ${TASK_TYPE_META[after.type] || TASK_TYPE_META.general}`);
  if (before.platform !== after.platform) changes.push(`контур → ${controlWorkstreamMeta(controlWorkstreamKey(after, getSku(after.articleKey))).label}`);
  if ((before.nextAction || '') !== (after.nextAction || '')) changes.push('обновлён следующий шаг');
  if ((before.reason || '') !== (after.reason || '')) changes.push('обновлён контекст');
  if ((before.entityLabel || '') !== (after.entityLabel || '')) changes.push(`тема → ${after.entityLabel || '—'}`);
  return changes.length ? `Изменения по задаче: ${changes.join('; ')}.` : '';
}

async function upsertOwnerAssignment(payload) {
  const normalizedOwnerName = canonicalOwnerName(payload?.ownerName || '');
  const override = normalizeOwnerOverride({
    articleKey: payload.articleKey,
    ownerName: normalizedOwnerName,
    ownerRole: payload.ownerRole,
    note: payload.note,
    updatedAt: new Date().toISOString(),
    assignedBy: state.team.member.name || 'Команда'
  });
  state.storage.ownerOverrides = (state.storage.ownerOverrides || []).filter((item) => item.articleKey !== override.articleKey);
  state.storage.ownerOverrides.unshift(override);
  applyOwnerOverridesToSkus();
  saveLocalStorage();
  try {
    await persistOwnerOverride(override);
  } catch (error) {
    console.error(error);
  }
}

async function createDecision(payload) {
  const decision = normalizeDecision({
    id: uid('decision'),
    articleKey: payload.articleKey,
    title: payload.title,
    decision: payload.decision,
    owner: payload.owner,
    status: payload.status,
    due: payload.due,
    createdAt: new Date().toISOString(),
    createdBy: state.team.member.name || 'Команда'
  });
  if (!decision.decision) return;
  state.storage.decisions.unshift(decision);
  saveLocalStorage();
  try {
    await persistDecision(decision);
  } catch (error) {
    console.error(error);
  }
}

async function createManualTask(payload) {
  const skipRerender = Boolean(payload?.skipRerender);
  const now = new Date().toISOString();
  const task = normalizeTask({
    id: uid('task'),
    source: 'manual',
    articleKey: payload.articleKey,
    entityLabel: payload.entityLabel,
    title: String(payload.title || '').trim() || 'Новая задача',
    type: payload.type,
    priority: payload.priority,
    platform: payload.platform,
    owner: String(payload.owner || '').trim(),
    coOwner: String(payload.coOwner || payload.co_owner || '').trim(),
    due: payload.due || plusDays(3),
    status: 'new',
    nextAction: String(payload.nextAction || '').trim(),
    reason: String(payload.reason || '').trim(),
    createdAt: now,
    updatedAt: now
  }, 'manual');
  state.storage.tasks.unshift(task);
  saveLocalStorage();
  try {
    await persistTask(task);
  } catch (error) {
    console.error(error);
  }
  await createTaskHistoryEntry(task.id, 'created', `Задача создана${task.owner ? ` · owner ${task.owner}` : ''}${task.coOwner ? ` · соисполнитель ${task.coOwner}` : ''}${task.due ? ` · срок ${task.due}` : ''}.`);
  if (!skipRerender) {
    rerenderCurrentView();
    if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
  }
  return task;
}

async function takeAutoTask(taskId) {
  const task = getAllTasks().find((item) => item.id === taskId);
  if (!task || task.source !== 'auto') return;
  const manual = normalizeTask({
    ...task,
    id: uid('task'),
    source: 'manual',
    status: 'in_progress',
    owner: task.owner || ownerName(getSku(task.articleKey)) || '',
    updatedAt: new Date().toISOString()
  }, 'manual');
  state.storage.tasks.unshift(manual);
  saveLocalStorage();
  try {
    await persistTask(manual);
  } catch (error) {
    console.error(error);
  }
  await createTaskHistoryEntry(manual.id, 'created', 'Авто-сигнал взят в ручную работу и переведён в контур команды.');
  rerenderCurrentView();
  if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
  openTaskModal(manual.id);
}

async function ensureTaskRecordForUpdate(taskId) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return null;

  const existing = state.storage.tasks.find((item) => item.id === normalizedTaskId);
  if (existing) return existing;

  const sourceTask = getAllTasks().find((item) => item.id === normalizedTaskId);
  if (!sourceTask) return null;

  const materialized = normalizeTask({
    ...sourceTask,
    id: normalizedTaskId,
    source: 'manual',
    createdAt: sourceTask.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, 'manual');

  state.storage.tasks.unshift(materialized);
  saveLocalStorage();
  try {
    await persistTask(materialized);
  } catch (error) {
    console.error(error);
  }
  return materialized;
}

async function updateTaskRecord(taskId, patch = {}) {
  const current = await ensureTaskRecordForUpdate(taskId);
  if (!current) return null;

  const before = { ...current };
  const updated = normalizeTask({
    ...current,
    ...patch,
    id: current.id,
    source: current.source,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    articleKey: patch.articleKey !== undefined ? patch.articleKey : current.articleKey
  }, current.source || 'manual');

  Object.assign(current, updated);
  saveLocalStorage();
  try {
    await persistTask(current);
  } catch (error) {
    console.error(error);
  }

  const historyMessage = buildTaskUpdateMessage(before, current);
  if (historyMessage) await createTaskHistoryEntry(taskId, current.status !== before.status ? 'status' : 'updated', historyMessage);

  rerenderCurrentView();
  if (state.activeSku === current.articleKey) renderSkuModal(current.articleKey);
  return current;
}

async function updateTaskStatus(taskId, status) {
  return updateTaskRecord(taskId, { status });
}

async function closeTaskWithReport(taskId, report) {
  const task = await updateTaskRecord(taskId, { status: 'done' });
  if (!task) return null;
  await createTaskHistoryEntry(taskId, 'report', `Задача закрыта с отчётом: ${report}`);
  return task;
}

function exportStorage() {
  const blob = new Blob([JSON.stringify(state.storage, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `altea-portal-storage-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importStorage(file) {
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  mergeImportedStorage(data);
  rerenderCurrentView();
  if (state.activeSku) renderSkuModal(state.activeSku);
}

function applyControlPreset(preset) {
  state.controlFilters.status = 'active';
  state.controlFilters.horizon = 'all';
  state.controlFilters.type = 'all';

  if (preset === 'overdue') {
    state.controlFilters.horizon = 'overdue';
  } else if (preset === 'no_owner') {
    state.controlFilters.horizon = 'no_owner';
  } else if (preset === 'critical') {
    state.controlFilters.type = 'price_margin';
  }
}

function closeSkuModal() {
  document.getElementById('skuModal').classList.remove('open');
  state.activeSku = null;
}

function openSkuModal(articleKey) {
  const rawKey = String(articleKey ?? '').trim();
  const sku = getSku(rawKey);

  if (!sku) {
    if (rawKey) {
      state.filters.search = rawKey;
      state.filters.market = 'all';
      state.filters.focus = 'all';
      state.filters.assignment = 'all';
      if (typeof skuJourneyApplyRegistryFocus === 'function') skuJourneyApplyRegistryFocus('all', rawKey);
      else setView('skus');
    }
    setAppError(rawKey
      ? `SKU ${rawKey} не найден в реестре. Открыла Реестр SKU и поставила поиск по артикулу.`
      : 'Не удалось открыть SKU: в кнопке нет артикула.');
    window.setTimeout(() => {
      if (!(state.runtimeErrors || []).length) setAppError('');
    }, 2400);
    return false;
  }

  renderSkuModal(skuPrimaryKey(sku, rawKey));
  return true;
}

const ACTIVE_VIEW_STORAGE_KEY = 'altea-portal-active-view-v1';

function normalizeViewName(view) {
  return typeof normalizePortalView === 'function' ? normalizePortalView(view) : view;
}

function readViewFromHash() {
  const raw = String(window.location.hash || '').replace(/^#/, '').trim();
  if (!raw) return '';
  return normalizeViewName(raw);
}

function readPersistedView() {
  try {
    const raw = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    const candidate = typeof parsed === 'string' ? parsed : parsed?.activeView;
    return candidate ? normalizeViewName(candidate) : '';
  } catch (error) {
    return '';
  }
}

function persistActiveView(view) {
  try {
    localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, JSON.stringify({
      activeView: view,
      updatedAt: new Date().toISOString()
    }));
  } catch (error) {
    // LocalStorage может быть недоступен в приватном режиме.
  }
}

function syncHashWithView(view) {
  if (!window?.history || !window?.location) return;
  const targetHash = `#${view}`;
  if (window.location.hash === targetHash) return;
  const nextUrl = `${window.location.pathname}${window.location.search}${targetHash}`;
  window.history.replaceState(window.history.state || null, '', nextUrl);
}

function resolveInitialView() {
  const candidate = readViewFromHash() || readPersistedView() || normalizeViewName(state.activeView || 'dashboard');
  return isPortalViewAllowed(candidate) ? candidate : firstAllowedPortalView();
}

function portalAccessApi() {
  return window.alteaPortalAccess || null;
}

function isPortalViewAllowed(view) {
  const normalized = normalizeViewName(view || 'dashboard');
  const api = portalAccessApi();
  if (api?.isViewAllowed) return api.isViewAllowed(normalized);
  const access = window.__ALTEA_PORTAL_ACCESS__;
  if (!Array.isArray(access?.allowedViews) || !access.allowedViews.length) return true;
  return access.allowedViews.includes(normalized);
}

function firstAllowedPortalView() {
  const api = portalAccessApi();
  if (api?.firstView) return normalizeViewName(api.firstView() || 'dashboard');
  const access = window.__ALTEA_PORTAL_ACCESS__;
  if (Array.isArray(access?.allowedViews) && access.allowedViews.length) return normalizeViewName(access.allowedViews[0]);
  return 'dashboard';
}

function applyPortalAccessToNavigation() {
  const api = portalAccessApi();
  if (api?.apply) api.apply();
}

let scheduledViewRenderToken = 0;

function scheduleViewRender(view) {
  const targetView = normalizeViewName(view || state.activeView || 'dashboard');
  const token = ++scheduledViewRenderToken;
  const run = () => {
    if (token !== scheduledViewRenderToken) return;
    const activeView = normalizeViewName(state.activeView || 'dashboard');
    if (activeView !== targetView) return;
    rerenderCurrentView();
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.setTimeout(run, 0));
    return;
  }
  window.setTimeout(run, 0);
}

function setView(view, options = {}) {
  view = normalizeViewName(view);
  if (!isPortalViewAllowed(view)) view = firstAllowedPortalView();
  const persist = options.persist !== false;
  const syncHash = options.syncHash !== false;
  state.activeView = view;
  if (view === 'sku-contour' && options.preserveSkuWorkspaceMode !== true) state.skuWorkspaceMode = options.skuWorkspaceMode || 'registry';
  if (persist) persistActiveView(view);
  if (syncHash) syncHashWithView(view);
  applyPortalAccessToNavigation();
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  if (view === 'control' && window.__ALTEA_TASK_KANBAN_PRIMARY__ !== false) {
    document.getElementById('view-control')?.classList.add('task-route-locked');
  }
  window.dispatchEvent(new CustomEvent('altea:viewchange', { detail: { view } }));
  void prepareView(view);
}

function viewHasReusableShell(view) {
  const root = document.getElementById(`view-${view}`);
  if (!root) return false;
  if (view === 'control') {
    return Boolean(root.querySelector('[data-task-calendar-design-v1][data-task-kanban-v1],[data-task-route-boot]'));
  }
  return false;
}

async function prepareView(view) {
  view = typeof normalizePortalView === 'function' ? normalizePortalView(view) : view;
  if (!state.boot.dataReady) {
    scheduleViewRender(view);
    return;
  }

  const lazyKey = VIEW_DATA_REQUIREMENTS[view];
  const lazyReady = !lazyKey || state.boot.lazyReady?.[lazyKey];
  const lazyPending = lazyKey && state.boot.lazyLoads?.[lazyKey];
  if (view === 'sku-contour' && lazyPending && Array.isArray(state.skus) && state.skus.length) {
    scheduleViewRender(view);
  }
  if (view !== 'control' && lazyKey && !lazyReady && !lazyPending && !viewHasReusableShell(view)) {
    renderViewLoading(`view-${view}`, VIEW_TITLES[view] || 'Экран');
  }

  try {
    await ensureViewData(view);
  } catch (error) {
    console.error(error);
    renderViewFailure(`view-${view}`, VIEW_TITLES[view] || 'Экран', error);
    setAppError(`Портал не смог подгрузить ${VIEW_TITLES[view] || 'экран'}: ${error.message}`);
    return;
  }

  if (state.activeView !== view) return;
  scheduleViewRender(view);
}

function renderViewFailure(rootId, title, error) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = `
    <div class="card">
      <div class="head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <div class="muted small">Экран не удалось отрисовать полностью</div>
        </div>
        ${badge('ошибка', 'danger')}
      </div>
      <div class="muted" style="margin-top:10px">${escapeHtml(error?.message || 'Неизвестная ошибка')}</div>
      <div class="muted small" style="margin-top:8px">Обнови страницу после фикса или синка. Остальные разделы портала продолжают работать.</div>
    </div>
  `;
}

function renderDashboardView() {
  const interactiveApi = window.__ALTEA_DASHBOARD_INTERACTIVE_API__;
  if (interactiveApi && typeof interactiveApi.prime === 'function') {
    interactiveApi.prime(false);
    return;
  }
  renderDashboard();
}

function initSidebarToggle() {
  const shell = document.querySelector('.app-shell');
  const toggle = document.querySelector('[data-sidebar-toggle]');
  if (!shell || !toggle || toggle.dataset.ready === '1') return;
  toggle.dataset.ready = '1';
  const storageKey = 'altea.sidebarCollapsed';
  const readCollapsed = () => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  };
  const writeCollapsed = (collapsed) => {
    try {
      localStorage.setItem(storageKey, collapsed ? '1' : '0');
    } catch {
      // В приватном режиме localStorage может быть недоступен; визуальный toggle все равно работает.
    }
  };
  const applyCollapsed = (collapsed) => {
    shell.classList.toggle('sidebar-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute('aria-label', collapsed ? 'Показать меню' : 'Скрыть меню');
    toggle.title = collapsed ? 'Показать меню' : 'Скрыть меню';
  };
  applyCollapsed(readCollapsed());
  toggle.addEventListener('click', () => {
    const collapsed = !shell.classList.contains('sidebar-collapsed');
    applyCollapsed(collapsed);
    writeCollapsed(collapsed);
  });
}

function ensureSkuContourShell() {
  const nav = document.querySelector('.nav');
  if (nav && !document.querySelector('.nav-btn[data-view="data-health"]')) {
    const button = document.createElement('button');
    button.className = 'nav-btn';
    button.type = 'button';
    button.dataset.view = 'data-health';
    button.innerHTML = '<span>Календарь</span><small>акции · события · SKU</small>';
    const dashboardButton = nav.querySelector('.nav-btn[data-view="dashboard"]');
    nav.insertBefore(button, dashboardButton?.nextSibling || nav.firstChild);
  }
  if (nav && !document.querySelector('.nav-btn[data-view="sku-contour"]')) {
    const button = document.createElement('button');
    button.className = 'nav-btn';
    button.type = 'button';
    button.dataset.view = 'sku-contour';
    button.innerHTML = '<span>SKU workspace</span><small>&#1056;&#1077;&#1077;&#1089;&#1090;&#1088; &middot; API-&#1082;&#1086;&#1085;&#1090;&#1091;&#1088; &middot; &#1087;&#1083;&#1072;&#1085;-&#1092;&#1072;&#1082;&#1090;</small>';
    const planButton = nav.querySelector('.nav-btn[data-view="sku-plan-fact"]');
    nav.insertBefore(button, planButton?.nextSibling || nav.firstChild);
  }

  const main = document.querySelector('.main');
  if (main && !document.getElementById('view-data-health')) {
    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-data-health';
    const dashboardSection = document.getElementById('view-dashboard');
    main.insertBefore(section, dashboardSection?.nextSibling || main.querySelector('.view') || null);
  }
  if (main && !document.getElementById('view-sku-contour')) {
    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-sku-contour';
    const planSection = document.getElementById('view-sku-plan-fact');
    main.insertBefore(section, planSection?.nextSibling || main.querySelector('.view') || null);
  }
  applyPortalAccessToNavigation();
}

function portalAttrSelector(name, value) {
  return `[${name}="${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

function capturePortalScrollState() {
  const scrollRoot = document.scrollingElement || document.documentElement;
  const activeView = typeof normalizePortalView === 'function'
    ? normalizePortalView(state.activeView || 'dashboard')
    : (state.activeView || 'dashboard');
  const viewRoot = document.getElementById(`view-${activeView}`);
  const snapshot = {
    view: activeView,
    x: window.scrollX || scrollRoot?.scrollLeft || 0,
    y: window.scrollY || scrollRoot?.scrollTop || 0,
    tableWraps: [],
    anchor: null,
    modal: null
  };
  if (viewRoot) {
    snapshot.tableWraps = Array.from(viewRoot.querySelectorAll('.table-wrap')).map((element, index) => ({
      index,
      left: element.scrollLeft || 0,
      top: element.scrollTop || 0
    }));
  }
  if (activeView === 'product-leaderboard' && viewRoot) {
    const primaryCandidates = Array.from(viewRoot.querySelectorAll('[data-product-row], [data-open-sku]'));
    const fallbackCandidates = Array.from(viewRoot.querySelectorAll('.card, .section-title'));
    const candidates = primaryCandidates.length ? primaryCandidates : fallbackCandidates;
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= 80 || rect.top >= window.innerHeight - 80) continue;
      const row = element.closest('[data-product-row]');
      const skuLink = element.closest('[data-open-sku]');
      if (row?.dataset.productRow) {
        snapshot.anchor = {
          selector: portalAttrSelector('data-product-row', row.dataset.productRow),
          top: row.getBoundingClientRect().top
        };
      } else if (skuLink?.dataset.openSku) {
        snapshot.anchor = {
          selector: portalAttrSelector('data-open-sku', skuLink.dataset.openSku),
          top: skuLink.getBoundingClientRect().top
        };
      } else {
        const index = candidates.indexOf(element);
        if (index >= 0) {
          element.setAttribute('data-portal-scroll-anchor', String(index));
          snapshot.anchor = {
            selector: portalAttrSelector('data-portal-scroll-anchor', index),
            top: rect.top
          };
        }
      }
      break;
    }
  }
  const modal = document.getElementById('skuModal');
  const modalBody = document.getElementById('skuModalBody');
  if (modal?.classList.contains('open')) {
    snapshot.modal = {
      articleKey: state.activeSku || '',
      modalTop: modal.scrollTop || 0,
      bodyTop: modalBody?.scrollTop || 0
    };
  }
  return snapshot;
}

function restorePortalScrollState(snapshot) {
  if (!snapshot) return;
  const restore = () => {
    const activeView = typeof normalizePortalView === 'function'
      ? normalizePortalView(state.activeView || 'dashboard')
      : (state.activeView || 'dashboard');
    if (activeView === snapshot.view) {
      let restoredByAnchor = false;
      if (snapshot.anchor?.selector) {
        const target = document.querySelector(snapshot.anchor.selector);
        if (target) {
          const delta = target.getBoundingClientRect().top - snapshot.anchor.top;
          if (Math.abs(delta) > 1) window.scrollTo(snapshot.x, (window.scrollY || 0) + delta);
          restoredByAnchor = true;
        }
      }
      if (!restoredByAnchor) window.scrollTo(snapshot.x, snapshot.y);
      const viewRoot = document.getElementById(`view-${activeView}`);
      if (viewRoot && Array.isArray(snapshot.tableWraps)) {
        const wraps = Array.from(viewRoot.querySelectorAll('.table-wrap'));
        snapshot.tableWraps.forEach((item) => {
          const element = wraps[item.index];
          if (!element) return;
          element.scrollLeft = item.left || 0;
          element.scrollTop = item.top || 0;
        });
      }
    }
    if (snapshot.modal) {
      const modal = document.getElementById('skuModal');
      const modalBody = document.getElementById('skuModalBody');
      if (modal?.classList.contains('open') && (!snapshot.modal.articleKey || snapshot.modal.articleKey === state.activeSku)) {
        modal.scrollTop = snapshot.modal.modalTop || 0;
        if (modalBody) modalBody.scrollTop = snapshot.modal.bodyTop || 0;
      }
    }
  };
  window.requestAnimationFrame(() => {
    restore();
    window.setTimeout(restore, 80);
  });
}

function rerenderCurrentView() {
  const scrollSnapshot = capturePortalScrollState();
  applyOwnerOverridesToSkus();
  function renderControlRoute() {
    const root = document.getElementById('view-control');
    if (root && window.__ALTEA_TASK_KANBAN_PRIMARY__ !== false) root.classList.add('task-route-locked');
    if (typeof window.__ALTEA_TASK_KANBAN_RENDER__ === 'function') {
      return window.__ALTEA_TASK_KANBAN_RENDER__();
    }
    if (window.__ALTEA_TASK_KANBAN_PRIMARY__ !== false) {
      if (typeof window.__ALTEA_RENDER_TASK_BOOT_SHELL__ === 'function') {
        return window.__ALTEA_RENDER_TASK_BOOT_SHELL__(root, 'app-core-10');
      }
      if (root) {
        root.innerHTML = '<section class="task-route-boot" data-task-route-boot data-task-calendar-design-v1 data-task-loading="boot"><h2>Tasks</h2><p>Preparing task workspace...</p></section>';
      }
      return root;
    }
    return renderControlCenter();
  }
  const renderPlan = [
    ['view-data-health', 'Календарь', () => { if (typeof renderPortalDataHealth === 'function') renderPortalDataHealth('view-data-health'); }],
    ['view-oos-control', 'OOS контроль', () => { if (typeof renderOosControl === 'function') renderOosControl('view-oos-control'); }],
    ['view-sku-contour', 'SKU workspace', () => renderSkuContour('view-sku-contour')],
    ['view-sku-plan-fact', 'План-факт SKU', () => renderSkuPlanFact('view-sku-plan-fact')],
    ['view-wb-rating', 'Рейтинг карточек', () => renderWbCardRating('view-wb-rating')],
    ['view-iu-drr', 'Показатели площадок', () => renderIuDrr('view-iu-drr')],
    ['view-dashboard', 'Дашборд', renderDashboardView],
    ['view-documents', 'Хранилище', renderDocuments],
    ['view-repricer', 'Репрайсер', renderRepricer],
    ['view-prices', 'Цены', () => { if (typeof window.renderPriceWorkbench === 'function') window.renderPriceWorkbench(); }],
    ['view-order', 'Логистика и заказ', () => { if (typeof renderOrderCalculator === 'function') renderOrderCalculator(); }],
    ['view-control', 'Задачи', renderControlRoute],
    ['view-skus', 'Реестр SKU', renderSkuRegistry],
    ['view-launches', 'Продукт / новинки', renderLaunches],
    ['view-product-leaderboard', 'Продуктовый лидерборд', renderProductLeaderboard],
    ['view-launch-control', 'Запуск новинок', renderLaunchControl],
    ['view-meetings', 'Ритм работы', renderMeetings],
    ['view-executive', 'Руководителю', renderExecutive]
  ];
  const errors = [];
  const activeView = typeof normalizePortalView === 'function'
    ? normalizePortalView(state.activeView || 'dashboard')
    : (state.activeView || 'dashboard');
  if (!isPortalViewAllowed(activeView)) {
    setView(firstAllowedPortalView());
    return;
  }
  if (state.activeView !== activeView) state.activeView = activeView;
  const activeRootId = `view-${activeView}`;
  const activeEntry = renderPlan.find(([rootId]) => rootId === activeRootId) || renderPlan[0];
  if (activeEntry) {
    const [rootId, title, renderer] = activeEntry;
    try {
      renderer();
    } catch (error) {
      console.error(error);
      errors.push(`${title}: ${error.message}`);
      renderViewFailure(rootId, title, error);
    }
  }
  state.runtimeErrors = errors;
  updateSyncBadge();
  if (errors.length) setAppError(`Портал загрузил не всё: ${errors[0]}`);
  else if (Array.isArray(state.boot?.dataWarnings) && state.boot.dataWarnings.length) setAppError(`Предупреждение по данным: ${state.boot.dataWarnings[0]}`);
  else setAppError('');
  restorePortalScrollState(scrollSnapshot);
}

function setAppError(message = '') {
  const banner = document.getElementById('appError');
  if (!message) {
    banner.classList.add('hidden');
    banner.textContent = '';
    return;
  }
  banner.textContent = message;
  banner.classList.remove('hidden');
}

function attachGlobalListeners() {
  if (state.boot.listenersAttached) return;
  state.boot.listenersAttached = true;
  initSidebarToggle();
  ensureTaskModal();
  applyPortalAccessToNavigation();
  window.addEventListener('altea:accesschange', () => {
    applyPortalAccessToNavigation();
    if (!isPortalViewAllowed(state.activeView || 'dashboard')) setView(firstAllowedPortalView());
  });
  window.addEventListener('hashchange', () => {
    const hashView = readViewFromHash();
    if (!hashView || hashView === state.activeView) return;
    setView(hashView, { syncHash: false, persist: true });
  });

  document.body.addEventListener('click', (event) => {
    const navButton = event.target.closest('.nav-btn[data-view]');
    if (navButton) {
      event.preventDefault();
      setView(navButton.dataset.view);
      return;
    }
    const openBtn = event.target.closest('[data-open-sku]');
    if (openBtn) {
      event.preventDefault();
      event.stopPropagation();
      const planFactNode = openBtn.closest('[data-sku-plan-context]');
      if (planFactNode && typeof window.skuPlanFactSetActiveContextFromElement === 'function') {
        window.skuPlanFactSetActiveContextFromElement(planFactNode);
      } else {
        state.activeSkuPlanFactContext = null;
      }
      const opened = openSkuModal(openBtn.dataset.openSku || openBtn.getAttribute('data-open-sku'));
      if (opened && document.getElementById('taskModal')?.classList.contains('open')) closeTaskModal();
      return;
    }

    const openTaskBtn = event.target.closest('[data-open-task]');
    if (openTaskBtn) {
      openTaskModal(openTaskBtn.dataset.openTask);
      return;
    }

    const closeBtn = event.target.closest('[data-close-modal]');
    if (closeBtn) {
      closeSkuModal();
      return;
    }

    const presetBtn = event.target.closest('[data-control-preset]');
    if (presetBtn) {
      applyControlPreset(presetBtn.dataset.controlPreset);
      setView('control');
      return;
    }

    if (event.target.closest('[data-view-control]')) {
      setView('control');
      return;
    }

    if (event.target.closest('[data-view-executive]')) {
      setView('executive');
      return;
    }

    const takeBtn = event.target.closest('[data-take-task]');
    if (takeBtn) {
      takeAutoTask(takeBtn.dataset.takeTask);
      return;
    }
  });

  document.getElementById('skuModal').addEventListener('click', (event) => {
    if (event.target.id === 'skuModal') closeSkuModal();
  });

  document.getElementById('exportStorageBtn').addEventListener('click', exportStorage);
  document.getElementById('pullRemoteBtn').addEventListener('click', async () => { await pullRemoteState(true); });
  document.getElementById('pushRemoteBtn').addEventListener('click', async () => { await pushStateToRemote(); });
  document.getElementById('importStorageInput').addEventListener('change', async (event) => {
    try {
      await importStorage(event.target.files?.[0]);
      event.target.value = '';
    } catch (error) {
      setAppError(`Не удалось импортировать JSON: ${error.message}`);
    }
  });
}

async function init() {
  if (window.alteaPortalAuthGate?.ensureAuthenticated) {
    await window.alteaPortalAuthGate.ensureAuthenticated();
  }
  ensureSkuContourShell();
  attachGlobalListeners();
  state.boot.dataWarnings = [];
  window.__ALTEA_PRIMARY_INIT_PENDING__ = true;
  // Критично: попытка подключения к Supabase не должна зависеть от первого рендера.
  // Иначе любой сбой данных/экрана создает ложное ощущение, что портал даже не пытался подключиться.
  const teamInitPromise = initTeamStore()
    .then(() => {
      if (!state.boot.dataReady) return;
      try {
        rerenderCurrentView();
        if (state.activeSku) renderSkuModal(state.activeSku);
      } catch (error) {
        console.error(error);
        setAppError(`Командная база подключена, но экран не удалось перерисовать: ${error.message}`);
      }
    })
    .catch((error) => {
      console.error(error);
      setAppError(`Портал открылся локально: ${error.message || 'ошибка подключения к командной базе'}`);
    });

  try {
    const cloneBootFallback = (value) => {
      if (value === null || value === undefined) return value;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return value;
      }
    };
    const loadBootJsonOrFallback = async (path, fallback, label = path) => {
      if (!state.boot.dataReady && (
        path === 'data/predictive_risk_snapshot.json'
        || path === 'data/auto_task_signals.json'
        || path === 'data/predictive_risk_outcome_audit.json'
      )) {
        return cloneBootFallback(fallback);
      }
      try {
        if (typeof loadJsonOrFallback === 'function') return await loadJsonOrFallback(path, fallback, label);
        if (typeof loadJson === 'function') return await loadJson(path);
        return cloneBootFallback(fallback);
      } catch (error) {
        console.error(error);
        if (typeof registerDataWarning === 'function') {
          registerDataWarning(`${label}: ${error.message || 'Не удалось загрузить данные'}`);
        } else if (Array.isArray(state.boot.dataWarnings)) {
          state.boot.dataWarnings.push(`${label}: ${error.message || 'Не удалось загрузить данные'}`);
        }
        return cloneBootFallback(fallback);
      }
    };
    const predictiveRiskFallback = { schema: 'qharisma-predictive-risk-v1', generatedAt: '', summary: {}, risks: [], autoTaskSignals: [] };
    const autoTaskSignalsFallback = { schema: 'qharisma-auto-task-signals-v1', generatedAt: '', summary: {}, signals: [] };
    const predictiveRiskOutcomeAuditFallback = { schema: 'qharisma-predictive-risk-outcome-audit-v1', generatedAt: '', asOfDate: '', windowDays: 14, signalsCreated: 0, risksDetected: 0 };
    const schedulePostBootTaskSignalLoad = () => {
      const run = async () => {
        try {
          const [predictiveRiskPayload, autoTaskSignalsPayload, predictiveRiskOutcomeAuditPayload] = await Promise.all([
            loadBootJsonOrFallback('data/predictive_risk_snapshot.json', predictiveRiskFallback, 'Predictive risks'),
            loadBootJsonOrFallback('data/auto_task_signals.json', autoTaskSignalsFallback, 'Auto task signals'),
            loadBootJsonOrFallback('data/predictive_risk_outcome_audit.json', predictiveRiskOutcomeAuditFallback, 'Predictive risk audit')
          ]);
          state.predictiveRisk = predictiveRiskPayload && typeof predictiveRiskPayload === 'object'
            ? predictiveRiskPayload
            : cloneBootFallback(predictiveRiskFallback);
          state.autoTaskSignals = autoTaskSignalsPayload && typeof autoTaskSignalsPayload === 'object'
            ? autoTaskSignalsPayload
            : cloneBootFallback(autoTaskSignalsFallback);
          state.predictiveRiskOutcomeAudit = predictiveRiskOutcomeAuditPayload && typeof predictiveRiskOutcomeAuditPayload === 'object'
            ? predictiveRiskOutcomeAuditPayload
            : cloneBootFallback(predictiveRiskOutcomeAuditFallback);
          try {
            if (typeof window.__ALTEA_TASK_KANBAN_INVALIDATE__ === 'function') window.__ALTEA_TASK_KANBAN_INVALIDATE__();
          } catch (_) {}
          try {
            window.dispatchEvent(new CustomEvent('altea:task-signals-ready'));
          } catch (_) {}
          if (state.activeView === 'control') {
            if (typeof window.__ALTEA_TASK_KANBAN_RENDER__ === 'function') window.__ALTEA_TASK_KANBAN_RENDER__();
            else rerenderCurrentView();
          }
        } catch (error) {
          console.warn('[portal-boot]', 'task signals lazy load failed', error);
        }
      };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 3500 });
        return;
      }
      window.setTimeout(run, 900);
    };
    const local = loadLocalStorage();
    const [dashboard, skus, seed, productLeaderboard, skuAliases, skuAliasIgnore, skuAliasAudit, skuMatrix, syncHealth, portalDataQuality, portalDataQuarantine, predictiveRisk, autoTaskSignals, predictiveRiskOutcomeAudit] = await Promise.all([
      loadBootJsonOrFallback('data/dashboard.json', { cards: [], generatedAt: '' }, 'Дашборд'),
      loadBootJsonOrFallback('data/skus.json', [], 'SKU'),
      loadBootJsonOrFallback('data/seed_comments.json', { comments: [], tasks: [] }, 'Seed comments'),
      loadBootJsonOrFallback('data/product_leaderboard.json', { generatedAt: '', items: [], summary: {} }, 'Продуктовый лидерборд'),
      loadBootJsonOrFallback('data/sku_aliases.json', { schema: 'sku-api-aliases-v1', aliases: [] }, 'SKU aliases'),
      loadBootJsonOrFallback('data/sku_alias_ignore.json', { schema: 'sku-api-ignore-v1', ignored: [] }, 'SKU alias ignore'),
      loadBootJsonOrFallback('data/sku_alias_audit.json', { schema: 'sku-alias-audit-v1', events: [] }, 'SKU alias audit'),
      loadBootJsonOrFallback('data/sku_matrix.json', { schema: 'portal-sku-matrix-v1', summary: {}, items: [], apiUnmapped: [], ignoredApiSku: [], indexes: { byArticleKey: {}, aliasToArticleKey: {} } }, 'SKU matrix'),
      loadBootJsonOrFallback('data/portal_sync_health.json', { schema: 'portal-sync-health-v1', status: '', publish: { allowed: true, blockingReasons: [], warnings: [] }, sources: {}, quality: {} }, 'Состояние sync'),
      loadBootJsonOrFallback('data/portal_data_quality.json', { generatedAt: '', status: '', summary: {}, issues: [] }, 'Контроль данных'),
      loadBootJsonOrFallback('data/portal_data_quarantine.json', { schema: 'portal-data-quarantine-v1', summary: {}, rows: [] }, 'Карантин данных'),
      loadBootJsonOrFallback('data/predictive_risk_snapshot.json', { schema: 'qharisma-predictive-risk-v1', generatedAt: '', summary: {}, risks: [], autoTaskSignals: [] }, 'Прогнозные риски'),
      loadBootJsonOrFallback('data/auto_task_signals.json', { schema: 'qharisma-auto-task-signals-v1', generatedAt: '', summary: {}, signals: [] }, 'Прогнозные автосигналы'),
      loadBootJsonOrFallback('data/predictive_risk_outcome_audit.json', { schema: 'qharisma-predictive-risk-outcome-audit-v1', generatedAt: '', asOfDate: '', windowDays: 14, signalsCreated: 0, risksDetected: 0 }, 'Аудит прогнозов')
    ]);

    state.dashboard = dashboard || { cards: [] };
    state.skus = Array.isArray(skus) ? skus : [];
    state.launches = [];
    state.meetings = [];
    state.documents = { groups: [] };
    state.productLeaderboard = typeof normalizeProductLeaderboardPayload === 'function'
      ? normalizeProductLeaderboardPayload(productLeaderboard)
      : (productLeaderboard || { generatedAt: '', items: [], summary: {} });
    state.productLeaderboardHistory = [];
    state.skuAliases = skuAliases && typeof skuAliases === 'object'
      ? skuAliases
      : { schema: 'sku-api-aliases-v1', aliases: [] };
    state.skuAliasIgnore = skuAliasIgnore && typeof skuAliasIgnore === 'object'
      ? skuAliasIgnore
      : { schema: 'sku-api-ignore-v1', ignored: [] };
    state.skuAliasAudit = skuAliasAudit && typeof skuAliasAudit === 'object'
      ? skuAliasAudit
      : { schema: 'sku-alias-audit-v1', events: [] };
    state.skuMatrix = skuMatrix && typeof skuMatrix === 'object'
      ? skuMatrix
      : { schema: 'portal-sku-matrix-v1', summary: {}, items: [], apiUnmapped: [], ignoredApiSku: [], indexes: { byArticleKey: {}, aliasToArticleKey: {} } };
    state.syncHealth = syncHealth && typeof syncHealth === 'object'
      ? syncHealth
      : { schema: 'portal-sync-health-v1', status: '', publish: { allowed: true, blockingReasons: [], warnings: [] }, sources: {}, quality: {} };
    state.portalDataQuality = portalDataQuality && typeof portalDataQuality === 'object'
      ? portalDataQuality
      : { generatedAt: '', status: '', summary: {}, issues: [] };
    state.portalDataQuarantine = portalDataQuarantine && typeof portalDataQuarantine === 'object'
      ? portalDataQuarantine
      : { schema: 'portal-data-quarantine-v1', summary: {}, rows: [] };
    state.predictiveRisk = predictiveRisk && typeof predictiveRisk === 'object'
      ? predictiveRisk
      : { schema: 'qharisma-predictive-risk-v1', generatedAt: '', summary: {}, risks: [], autoTaskSignals: [] };
    state.autoTaskSignals = autoTaskSignals && typeof autoTaskSignals === 'object'
      ? autoTaskSignals
      : { schema: 'qharisma-auto-task-signals-v1', generatedAt: '', summary: {}, signals: [] };
    state.predictiveRiskOutcomeAudit = predictiveRiskOutcomeAudit && typeof predictiveRiskOutcomeAudit === 'object'
      ? predictiveRiskOutcomeAudit
      : { schema: 'qharisma-predictive-risk-outcome-audit-v1', generatedAt: '', asOfDate: '', windowDays: 14, signalsCreated: 0, risksDetected: 0 };
    state.boot.lazyReady.productLeaderboard = false;
    state.repricer = { generatedAt: '', summary: {}, rows: [] };
    if (!state.orderCalc.articleKey) state.orderCalc.articleKey = state.skus[0]?.articleKey || '';
    if (!state.orderCalc.daysToNextReceipt) state.orderCalc.daysToNextReceipt = String(Math.round(numberOrZero(state.skus[0]?.leadTimeDays) || 30));
    const localStorageSnapshot = {
      comments: Array.isArray(local.comments) ? local.comments : [],
      tasks: Array.isArray(local.tasks) ? local.tasks : [],
      decisions: Array.isArray(local.decisions) ? local.decisions : [],
      ownerOverrides: Array.isArray(local.ownerOverrides) ? local.ownerOverrides : [],
      resourceLinks: Array.isArray(local.resourceLinks) ? local.resourceLinks : [],
      repricerSettings: normalizeRepricerSettings(local.repricerSettings || {}),
      repricerSettingsUpdatedAt: String(local.repricerSettingsUpdatedAt || '').trim(),
      repricerOverrides: Array.isArray(local.repricerOverrides) ? local.repricerOverrides.map(normalizeRepricerOverride).filter((item) => item.articleKey) : [],
      repricerSkuProfiles: Array.isArray(local.repricerSkuProfiles) ? local.repricerSkuProfiles.map(normalizeRepricerSkuProfile).filter((item) => item.articleKey) : [],
      repricerCorridors: Array.isArray(local.repricerCorridors) ? local.repricerCorridors.map(normalizeRepricerCorridor).filter((item) => item.articleKey) : [],
      repricerOverrideDeletes: Array.isArray(local.repricerOverrideDeletes) ? local.repricerOverrideDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey) : [],
      repricerSkuProfileDeletes: Array.isArray(local.repricerSkuProfileDeletes) ? local.repricerSkuProfileDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey) : [],
      repricerCorridorDeletes: Array.isArray(local.repricerCorridorDeletes) ? local.repricerCorridorDeletes.map(normalizeRepricerDeleteTombstone).filter((item) => item.articleKey) : [],
      repricerPendingApiAdds: Array.isArray(local.repricerPendingApiAdds) ? local.repricerPendingApiAdds.filter((item) => item && typeof item === 'object') : [],
      repricerPendingApiDeletes: Array.isArray(local.repricerPendingApiDeletes) ? local.repricerPendingApiDeletes.filter((item) => item && typeof item === 'object') : [],
      repricerPendingCostFixes: Array.isArray(local.repricerPendingCostFixes) ? local.repricerPendingCostFixes.filter((item) => item && typeof item === 'object') : [],
      repricerPendingApiTasks: Array.isArray(local.repricerPendingApiTasks) ? local.repricerPendingApiTasks.filter((item) => item && typeof item === 'object') : [],
      repricerRepairHistory: Array.isArray(local.repricerRepairHistory) ? local.repricerRepairHistory.filter((item) => item && typeof item === 'object').slice(0, 400) : [],
      repricerRepairSnapshots: Array.isArray(local.repricerRepairSnapshots) ? local.repricerRepairSnapshots.filter((item) => item && typeof item === 'object').slice(0, 10) : [],
      repricerApiReconcileHistory: Array.isArray(local.repricerApiReconcileHistory) ? local.repricerApiReconcileHistory.filter((item) => item && typeof item === 'object').slice(0, 100) : [],
      repricerLastAuditImport: local.repricerLastAuditImport && typeof local.repricerLastAuditImport === 'object' ? local.repricerLastAuditImport : null,
      repricerLastAutoFix: local.repricerLastAutoFix && typeof local.repricerLastAutoFix === 'object' ? local.repricerLastAutoFix : null,
      repricerLastImportValidation: local.repricerLastImportValidation && typeof local.repricerLastImportValidation === 'object' ? local.repricerLastImportValidation : null,
      repricerLastApiReconcile: local.repricerLastApiReconcile && typeof local.repricerLastApiReconcile === 'object' ? local.repricerLastApiReconcile : null,
      portalDataRules: local.portalDataRules && typeof local.portalDataRules === 'object' ? local.portalDataRules : {},
      portalDataRulesUpdatedAt: String(local.portalDataRulesUpdatedAt || '').trim(),
      portalIssueSnapshot: local.portalIssueSnapshot && typeof local.portalIssueSnapshot === 'object' ? local.portalIssueSnapshot : null
    };
    state.storage = typeof completePortalStorage === 'function'
      ? completePortalStorage(localStorageSnapshot, local)
      : localStorageSnapshot;
    applyOwnerOverridesToSkus();
    mergeSeedStorage(seed || {});
    state.boot.dataReady = true;
    setView(resolveInitialView(), { persist: true, syncHash: true });
    schedulePostBootTaskSignalLoad();
    if (typeof window.portalStartOperationalAutoRefresh === 'function') window.portalStartOperationalAutoRefresh();
    window.setTimeout(() => {
      const runPrefetch = () => {
        if (typeof ensureViewData !== 'function' || document.hidden || state.activeView !== 'dashboard') return;
        ensureViewData('oos-control').catch((error) => console.warn('[portal-prefetch]', 'oos-control', error));
      };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(runPrefetch, { timeout: 12000 });
        return;
      }
      window.setTimeout(runPrefetch, 4500);
    }, 4500);
    if (state.boot.dataWarnings.length) setAppError(`Часть данных загружена с исправлениями: ${state.boot.dataWarnings[0]}`);
    else setAppError('');
  } catch (error) {
    console.error(error);
    setAppError(`Портал не смог загрузить данные: ${error.message}`);
  } finally {
    window.__ALTEA_PRIMARY_INIT_PENDING__ = false;
    window.__ALTEA_PRIMARY_INIT_FINISHED__ = true;
  }

  return teamInitPromise;
}

init();
