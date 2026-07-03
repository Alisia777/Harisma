const SKU_PLAN_FACT_PLATFORMS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'megamarket', 'samokat'];
const SKU_PLAN_FACT_PAYROLL_PLATFORMS = ['wb', 'ozon', 'ya'];
const SKU_PLAN_FACT_PAYROLL_ALIGNMENT_PLATFORMS = new Set(['wb', 'ozon']);
const SKU_PLAN_FACT_PLATFORM_LABELS = {
  wb: 'WB',
  ozon: 'Ozon',
  ya: 'Я.Маркет',
  goldapple: 'ЗЯ',
  letu: 'Лэтуаль',
  magnit: 'Магнит Маркет',
  megamarket: 'МегаМаркет',
  samokat: 'Самокат'
};
const SKU_PLAN_FACT_PLATFORM_SUPPORT_KEYS = {
  wb: 'wb',
  ozon: 'ozon',
  ya: 'ym',
  goldapple: 'ga',
  letu: 'letu',
  magnit: 'mm',
  megamarket: 'megamarket',
  samokat: 'samokat'
};
const SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS = new Set(['wb', 'ozon']);
const SKU_PLAN_FACT_AD_PLAN_PLATFORMS = new Set(['wb', 'ozon']);
const SKU_PLAN_FACT_CORPORATE_AD_RATES = { wb: 0.08, ozon: 0.24878 };
const SKU_PLAN_FACT_MARGIN_PLAN_FIELDS = ['planMarginPct', 'plannedMarginPct', 'allowedMarginPct', 'avgMargin7dPct', 'marginTotalPct', 'marginPct'];
const SKU_PLAN_FACT_RECONCILE_OVERAGE_THRESHOLD = 1.15;
const SKU_PLAN_FACT_RECONCILE_MIN_REVENUE = 10000;
const SKU_PLAN_FACT_UNMAPPED_OWNER = 'Не в реестре';
const SKU_PLAN_FACT_UNMAPPED_STATUS = 'API SKU без пары';
const SKU_PLAN_FACT_UNALLOCATED_STATUS = 'Агрегат без SKU';
const SKU_PLAN_FACT_FILTER_VERSION = '20260623-status-top-filters-v1';
let skuPlanFactSearchTimer = 0;
let skuPlanFactExcelDownloadLockUntil = 0;
let skuPlanFactTruthWarmupPromise = null;
let skuPlanFactWbSubstitutionIndexCache = { payload: null, index: null };
let skuPlanFactLazyRenderPromise = null;
let skuPlanFactWbOwnerAuditMapCache = { source: null, map: null };

function skuPlanFactPlatformLabel(platform = '') {
  return SKU_PLAN_FACT_PLATFORM_LABELS[platform] || String(platform || '').toUpperCase();
}

function skuPlanFactPlatformSupportKey(platform = '') {
  return SKU_PLAN_FACT_PLATFORM_SUPPORT_KEYS[platform] || platform;
}

function skuPlanFactCanonicalOwner(value = '') {
  return typeof canonicalOwnerName === 'function'
    ? canonicalOwnerName(value)
    : String(value || '').trim();
}

function skuPlanFactArticleKeysForSku(sku = {}) {
  const values = [
    typeof skuPrimaryKey === 'function' ? skuPrimaryKey(sku) : '',
    sku.articleKey,
    sku.article,
    sku.vendorCode,
    sku.sku,
    sku.nmId,
    sku.wb?.article,
    sku.wb?.sku,
    sku.sku?.articleKey,
    sku.sku?.article
  ];
  return [...new Set(values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean))];
}

function skuPlanFactWbOwnerAuditMap() {
  const source = state?.wbOwnerDistributionAudit;
  if (skuPlanFactWbOwnerAuditMapCache.source === source && skuPlanFactWbOwnerAuditMapCache.map) {
    return skuPlanFactWbOwnerAuditMapCache.map;
  }
  const map = new Map();
  const matched = Array.isArray(source?.matched) ? source.matched : [];
  matched.forEach((item) => {
    const owner = skuPlanFactCanonicalOwner(item.ownerWb || item.owner || '');
    if (!owner) return;
    [item.articleKey, item.article, item.sourceArticle]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
      .forEach((key) => map.set(key, owner));
  });
  skuPlanFactWbOwnerAuditMapCache = { source, map };
  return map;
}

function skuPlanFactWbAuditOwner(sku = {}) {
  const auditMap = skuPlanFactWbOwnerAuditMap();
  for (const key of skuPlanFactArticleKeysForSku(sku)) {
    const owner = auditMap.get(key);
    if (owner) return owner;
  }
  return '';
}

function skuPlanFactIsStaleWbOwner(owner = '') {
  const normalized = skuPlanFactCanonicalOwner(owner);
  return normalized === '\u041a\u0438\u0440\u0438\u043b\u043b'
    || String(owner || '').trim().toLowerCase() === '\u043a\u0438\u0440\u0438\u043b\u043b';
}

function skuPlanFactPlatformOwner(sku = {}, platform = '') {
  const normalizedPlatform = String(platform || '').toLowerCase();
  const supportKey = skuPlanFactPlatformSupportKey(normalizedPlatform);
  const ownerSources = [
    sku?.ownerByPlatform,
    sku?.ownersByPlatform,
    sku?.owner?.byPlatform
  ];
  const keys = [...new Set([
    normalizedPlatform,
    supportKey,
    normalizedPlatform === 'ya' ? 'ym' : '',
    normalizedPlatform === 'ym' ? 'ya' : '',
    normalizedPlatform === 'goldapple' ? 'ga' : '',
    normalizedPlatform === 'ga' ? 'goldapple' : '',
    normalizedPlatform === 'magnit' ? 'mm' : '',
    normalizedPlatform === 'mm' ? 'magnit' : ''
  ].filter(Boolean))];
  for (const source of ownerSources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) {
      const owner = skuPlanFactCanonicalOwner(source[key] || '');
      if (normalizedPlatform === 'wb' && skuPlanFactIsStaleWbOwner(owner)) continue;
      if (owner) return owner;
    }
  }
  if (normalizedPlatform === 'wb') {
    const auditOwner = skuPlanFactWbAuditOwner(sku);
    if (auditOwner && !skuPlanFactIsStaleWbOwner(auditOwner)) return auditOwner;
  }
  if (normalizedPlatform === 'wb') {
    const baseOwner = skuPlanFactCanonicalOwner(
      sku?.owner?.name
      || sku?.productOwner
      || sku?.ownerName
      || (typeof sku?.owner === 'string' ? sku.owner : '')
      || ''
    );
    if (baseOwner && !skuPlanFactIsStaleWbOwner(baseOwner)) return baseOwner;
  }
  return '';
}

function skuPlanFactOwnerMapForSku(sku = {}) {
  const result = {};
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const owner = skuPlanFactPlatformOwner(sku, platform);
    if (!owner) return;
    result[platform] = owner;
    result[skuPlanFactPlatformSupportKey(platform)] = owner;
  });
  return result;
}

function skuPlanFactScopedOwner(row = {}, platform = 'all') {
  const normalizedPlatform = String(platform || 'all').toLowerCase();
  if (SKU_PLAN_FACT_PLATFORMS.includes(normalizedPlatform)) {
    const supportKey = skuPlanFactPlatformSupportKey(normalizedPlatform);
    const platformOwner = skuPlanFactCanonicalOwner(
      row.ownerByPlatform?.[normalizedPlatform]
      || row.ownerByPlatform?.[supportKey]
      || row.ownersByPlatform?.[normalizedPlatform]
      || row.ownersByPlatform?.[supportKey]
      || ''
    );
    if (platformOwner) return platformOwner;
    if (!row.syntheticUnmapped && !row.syntheticUnallocated) return 'Без owner';
  }
  return skuPlanFactCanonicalOwner(row.ownerBase || row.owner || '') || 'Без owner';
}

function skuPlanFactApplyOwnerScope(rows = [], platform = 'all') {
  rows.forEach((row) => {
    row.owner = skuPlanFactScopedOwner(row, platform);
  });
  return rows;
}

function skuPlanFactOwnerIsFilterOption(owner = '') {
  const normalized = skuPlanFactCanonicalOwner(owner);
  return Boolean(normalized && normalized !== 'Без owner' && normalized !== SKU_PLAN_FACT_UNMAPPED_OWNER);
}

function skuPlanFactKpiStatusText(row = {}) {
  const sku = row?.sku && typeof row.sku === 'object' ? row.sku : row;
  return [
    row?.status,
    row?.matrixStatus,
    row?.registryStatus,
    row?.matrixEntry?.status,
    row?.matrixEntry?.registryStatus,
    sku?.status,
    sku?.registryStatus,
    sku?.matrixStatus,
    sku?.owner?.registryStatus,
    sku?.productLifecycle?.status,
    sku?.productLifecycle?.label,
    sku?.lifecycleStatus
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function skuPlanFactKpiEligible(row = {}) {
  const sku = row?.sku && typeof row.sku === 'object' ? row.sku : row;
  if (row?.syntheticUnmapped || row?.syntheticUnallocated || sku?.__skuPlanFactUnmapped || sku?.__skuPlanFactUnallocated) return false;
  const status = skuPlanFactKpiStatusText(row);
  if (!status) return true;
  return !(
    status.includes('\u0432\u044b\u0432\u043e\u0434')
    || status.includes('\u043f\u043e\u0434 \u0432\u043e\u043f\u0440\u043e\u0441')
    || status.includes('\u043d\u0435\u0442 \u0432 \u0441\u043f\u0435\u0446')
    || status.includes('\u0430\u0440\u0445\u0438\u0432')
    || /\b(exit|archive|archived|inactive|question)\b/i.test(status)
  );
}

function skuPlanFactIsOutput(row = {}) {
  const status = skuPlanFactKpiStatusText(row);
  return Boolean(
    status.includes('\u0432\u044b\u0432\u043e\u0434')
    || status.includes('\u043d\u0435\u0442 \u0432 \u0441\u043f\u0435\u0446')
    || status.includes('\u0430\u0440\u0445\u0438\u0432')
    || /\b(exit|archive|archived|inactive)\b/i.test(status)
  );
}

function skuPlanFactIsQuestion(row = {}) {
  const status = skuPlanFactKpiStatusText(row);
  return Boolean(
    status.includes('\u043f\u043e\u0434 \u0432\u043e\u043f\u0440\u043e\u0441')
    || /\bquestion\b/i.test(status)
  );
}

function skuPlanFactOwnerOptionsFromRows(rows = []) {
  const owners = new Set();
  const addOwner = (value) => {
    const owner = skuPlanFactCanonicalOwner(value);
    if (skuPlanFactOwnerIsFilterOption(owner)) owners.add(owner);
  };
  (rows || []).forEach((row) => {
    addOwner(row.ownerBase);
    addOwner(row.owner);
    Object.values(row.ownerByPlatform || row.ownersByPlatform || {}).forEach(addOwner);
  });
  return [...owners].sort((a, b) => a.localeCompare(b, 'ru'));
}

function skuPlanFactOwnerOptionHasMetricSignal(row = {}, platform = 'all') {
  if (!skuPlanFactKpiEligible(row)) return false;
  const metric = SKU_PLAN_FACT_PLATFORMS.includes(platform)
    ? (row.platforms?.[platform] || row[platform] || {})
    : row;
  if (Boolean(
    numberOrZero(metric.factRevenue) > 0
    || numberOrZero(metric.factUnits) > 0
    || numberOrZero(metric.planToDateRevenue) > 0
    || numberOrZero(metric.planRevenue) > 0
    || numberOrZero(metric.adSpend) > 0
    || numberOrZero(metric.planAdSpend) > 0
    || numberOrZero(metric.planAdSpendToDate) > 0
  )) return true;
  if (!SKU_PLAN_FACT_PLATFORMS.includes(platform)) return false;
  return Boolean(
    (metric.hasSource || metric.companyPlanZeroApplied)
    && skuPlanFactPlatformOwner(row, platform)
    && (
      numberOrZero(row.factRevenue) > 0
      || numberOrZero(row.factUnits) > 0
      || numberOrZero(row.planToDateRevenue) > 0
      || numberOrZero(row.planRevenue) > 0
      || numberOrZero(row.adSpend) > 0
      || numberOrZero(row.planAdSpend) > 0
      || numberOrZero(row.planAdSpendToDate) > 0
    )
  );
}

function skuPlanFactPlatformSignalOwners(rows = [], platform = 'all') {
  if (!SKU_PLAN_FACT_PLATFORMS.includes(platform)) return [];
  const owners = new Set();
  rows.forEach((row) => {
    if (!skuPlanFactOwnerOptionHasMetricSignal(row, platform)) return;
    const owner = skuPlanFactCanonicalOwner(row.owner || '');
    if (skuPlanFactOwnerIsFilterOption(owner)) owners.add(owner);
  });
  return [...owners];
}

function skuPlanFactApplySingleOwnerFallback(rows = [], platform = 'all') {
  if (!SKU_PLAN_FACT_PLATFORMS.includes(platform)) return rows;
  const owners = skuPlanFactPlatformSignalOwners(rows, platform);
  if (owners.length !== 1) return rows;
  const fallbackOwner = owners[0];
  rows.forEach((row) => {
    if (!skuPlanFactOwnerOptionHasMetricSignal(row, platform)) return;
    if (skuPlanFactOwnerIsFilterOption(row.owner)) return;
    row.owner = fallbackOwner;
    row.ownerSinglePlatformFallback = true;
  });
  return rows;
}

function skuPlanFactRedistributePayrollPlansToOwners(rows = [], selectedPlatform = 'all') {
  const platforms = SKU_PLAN_FACT_PAYROLL_PLATFORMS
    .filter((platform) => selectedPlatform === 'all' || selectedPlatform === platform);
  platforms.forEach((platform) => {
    const entries = (rows || [])
      .map((row) => ({ row, metric: row?.platforms?.[platform] || row?.[platform] || null }))
      .filter(({ row, metric }) => metric && skuPlanFactKpiEligible(row) && skuPlanFactPlatformHasActivity(metric));
    if (!entries.length) return;
    const planKeys = ['planRevenue', 'planToDateRevenue', 'planUnits', 'planToDateUnits', 'planAdSpend', 'planMonthAdSpend', 'planPeriodAdSpend'];
    const validEntries = entries.filter(({ row }) => skuPlanFactOwnerIsFilterOption(skuPlanFactScopedOwner(row, platform)));
    if (!validEntries.length || validEntries.length === entries.length) return;
    const total = {};
    const validTotal = {};
    planKeys.forEach((key) => {
      total[key] = entries.reduce((sum, { metric }) => sum + numberOrZero(metric[key]), 0);
      validTotal[key] = validEntries.reduce((sum, { metric }) => sum + numberOrZero(metric[key]), 0);
    });
    if (!planKeys.some((key) => total[key] > validTotal[key] && validTotal[key] > 0)) return;
    validEntries.forEach(({ metric }) => {
      planKeys.forEach((key) => {
        if (!(validTotal[key] > 0) || !(total[key] > 0)) return;
        if (metric[key] === null || metric[key] === undefined) return;
        metric[key] = numberOrZero(metric[key]) * total[key] / validTotal[key];
      });
      metric.ownerPlanRedistributed = true;
    });
    entries
      .filter(({ row }) => !skuPlanFactOwnerIsFilterOption(skuPlanFactScopedOwner(row, platform)))
      .forEach(({ metric }) => {
        planKeys.forEach((key) => {
          if (metric[key] !== null && metric[key] !== undefined) metric[key] = 0;
        });
        metric.ownerPlanRedistributed = true;
      });
  });
  return rows;
}

function skuPlanFactPlatformNameLines(row = {}, model = null) {
  return SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const metric = row?.platforms?.[platform] || row?.[platform] || null;
    const label = skuPlanFactPlatformLabel(platform);
    const factAvgCheck = metric?.factAvgCheck;
    const planAvgCheck = metric?.planAvgCheck;
    return `
      <div>${escapeHtml(label)}: <strong>${fmt.money(factAvgCheck)}</strong> <span class="muted small">план ${fmt.money(planAvgCheck)}</span></div>
    `;
  }).join('');
}

function skuPlanFactPlatformTurnoverLines(row = {}) {
  return SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const metric = row?.platforms?.[platform] || row?.[platform] || null;
    const label = skuPlanFactPlatformLabel(platform);
    return `
      <div>${escapeHtml(label)}: <strong>${fmt.num(metric?.turnoverDays, 1)}</strong> дн. <span class="muted small">${fmt.int(metric?.stock)} шт.</span></div>
    `;
  }).join('');
}

function skuPlanFactPlatformAdLines(row = {}) {
  return SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const metric = row?.platforms?.[platform] || row?.[platform] || null;
    const label = skuPlanFactPlatformLabel(platform);
    const planToDate = metric?.planAdSpendToDate ?? metric?.planAdSpend;
    return `<div>${escapeHtml(label)} ${fmt.money(metric?.adSpend)} <span class="muted small">/ план к дате ${fmt.money(planToDate)}</span></div>`;
  }).join(' · ');
}

function skuPlanFactFilters(overrides = null, options = {}) {
  const nextFilters = {
    search: '',
    owner: 'all',
    status: 'actual',
    platform: 'all',
    month: 'latest',
    date: '',
    dateFrom: '',
    dateTo: '',
    dateMode: 'latest',
    sort: 'gap',
    sortDir: 'asc',
    ...(state.skuPlanFactFilters || {}),
    ...(overrides || {})
  };
  if (nextFilters.__truthFilterVersion !== SKU_PLAN_FACT_FILTER_VERSION) {
    if (!nextFilters.status || nextFilters.status === 'active' || nextFilters.status === 'all') nextFilters.status = 'actual';
    if (!nextFilters.dateMode || nextFilters.dateMode === 'latest') {
      nextFilters.date = '';
      nextFilters.dateFrom = '';
      nextFilters.dateTo = '';
      nextFilters.month = 'latest';
      nextFilters.dateMode = 'latest';
    }
    nextFilters.__truthFilterVersion = SKU_PLAN_FACT_FILTER_VERSION;
  }
  if (!['asc', 'desc'].includes(nextFilters.sortDir)) {
    nextFilters.sortDir = skuPlanFactDefaultSortDir(nextFilters.sort);
  }
  if (options.persist === false) return nextFilters;
  state.skuPlanFactFilters = nextFilters;
  return state.skuPlanFactFilters;
}

function skuPlanFactDateKey(value = '') {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function skuPlanFactMonthStart(monthKey = '') {
  return monthKey ? `${monthKey}-01` : '';
}

function skuPlanFactMonthEnd(monthKey = '') {
  return monthKey ? `${monthKey}-${String(skuPlanFactMonthDays(monthKey)).padStart(2, '0')}` : '';
}

function skuPlanFactDateSerial(date = '') {
  const key = skuPlanFactDateKey(date);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function skuPlanFactInclusiveDays(dateFrom = '', dateTo = '') {
  const fromSerial = skuPlanFactDateSerial(dateFrom);
  const toSerial = skuPlanFactDateSerial(dateTo);
  if (fromSerial === null || toSerial === null) return 0;
  return Math.max(1, toSerial - fromSerial + 1);
}

function skuPlanFactClampDateToRange(date = '', minDate = '', maxDate = '') {
  let next = skuPlanFactDateKey(date);
  if (!next) return '';
  if (minDate && next < minDate) next = minDate;
  if (maxDate && next > maxDate) next = maxDate;
  return next;
}

function skuPlanFactMonthLabel(monthKey = '') {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return '—';
  return new Date(year, month - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function skuPlanFactMonthDays(monthKey = '') {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return 30;
  return new Date(year, month, 0).getDate();
}

function skuPlanFactMonthFromDate(value = '') {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}/.test(raw) ? raw.slice(0, 7) : '';
}

function skuPlanFactHasIuDrrTruth() {
  return false;
}

function skuPlanFactWarmupTruth(rootId = 'view-sku-plan-fact') {
  return;
}

function skuPlanFactRowsForPlatform(payload = {}, platform = '') {
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  const platformBuckets = payload?.platforms || {};
  const bucketKeys = [...new Set([platform, supportKey])];
  for (const key of bucketKeys) {
    const bucket = platformBuckets?.[key];
    const rawRows = bucket?.rows ?? bucket?.articles;
    if (Array.isArray(rawRows)) return rawRows;
    if (rawRows && typeof rawRows === 'object') {
      return Object.entries(rawRows).map(([rowKey, row]) => ({
        articleKey: row?.articleKey || row?.article || rowKey,
        article: row?.article || row?.articleKey || rowKey,
        ...(row || {})
      }));
    }
  }
  const extraRows = payload?.extraMarketplace?.platforms?.[platform]?.articles;
  if (Array.isArray(extraRows)) return extraRows;
  return [];
}

function skuPlanFactToken(value = '') {
  if (typeof skuLookupToken === 'function') return skuLookupToken(value);
  return String(value ?? '').trim().toLowerCase().replaceAll('ё', 'е').replace(/[^a-zа-я0-9]+/gi, '');
}

function skuPlanFactNormalizePlatform(value = '') {
  const text = String(value ?? '').trim();
  const lower = text.toLowerCase().replaceAll('ё', 'е');
  const detected = [];
  if (/\bwb\b|wildberries|вб|вайлдбер/i.test(lower)) detected.push('wb');
  if (/\boz\b|\bozon\b|озон/i.test(lower)) detected.push('ozon');
  if (/\bya\b|\bym\b|yandex|яндекс|я\.?маркет|ямаркет/i.test(lower)) detected.push('ya');
  if (/gold\s*apple|золотое\s*яблоко|\bзя\b/i.test(lower)) detected.push('goldapple');
  if (/letu|letual|летуаль/i.test(lower)) detected.push('letu');
  if (/magnit|магнит/i.test(lower)) detected.push('magnit');
  if (/mega\s*market|megamarket|мега\s*маркет|мегамаркет/i.test(lower)) detected.push('megamarket');
  if (/samokat|самокат/i.test(lower)) detected.push('samokat');
  const uniqueDetected = [...new Set(detected)];
  if (uniqueDetected.length > 1) return 'all';
  if (uniqueDetected.length === 1) return uniqueDetected[0];
  const raw = skuPlanFactToken(value);
  if (!raw || raw === 'all' || raw === 'все') return 'all';
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['oz', 'ozon'].includes(raw)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'yandexmarket', 'ямаркет'].includes(raw)) return 'ya';
  if (['ga', 'goldapple', 'зя', 'золотоеяблоко'].includes(raw)) return 'goldapple';
  if (['letu', 'letual', 'летуаль'].includes(raw)) return 'letu';
  if (['mm', 'magnit', 'magnitmarket', 'магнитмаркет'].includes(raw)) return 'magnit';
  if (['megamarket', 'mega_market', 'mega', 'мегамаркет'].includes(raw)) return 'megamarket';
  if (['samokat', 'самокат'].includes(raw)) return 'samokat';
  return raw;
}

function skuPlanFactIgnoreRows() {
  const payload = state.skuAliasIgnore || {};
  return skuPlanFactIgnorePayloadRows(payload);
}

function skuPlanFactIgnorePayloadRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.ignored)) return payload.ignored;
  if (Array.isArray(payload.ignores)) return payload.ignores;
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function skuPlanFactIgnoreKey(platform = '', apiSku = '') {
  return `${skuPlanFactNormalizePlatform(platform) || 'all'}|${skuPlanFactToken(apiSku)}`;
}

function skuPlanFactIgnoredSet() {
  const set = new Set();
  skuPlanFactIgnoreRows().forEach((row) => {
    const status = skuPlanFactToken(row?.status ?? row?.active ?? 'active');
    if (['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove'].includes(status)) return;
    const apiSku = row?.api_sku ?? row?.apiSku ?? row?.api ?? row?.articleKey ?? row?.article ?? row?.source_sku ?? row?.marketplace_sku ?? '';
    const token = skuPlanFactToken(apiSku);
    if (!token) return;
    const platform = skuPlanFactNormalizePlatform(row?.platform ?? row?.marketplace ?? row?.source_platform ?? 'all') || 'all';
    set.add(skuPlanFactIgnoreKey(platform, token));
  });
  return set;
}

function skuPlanFactIsIgnored(platform = '', apiSku = '', ignored = null) {
  const token = skuPlanFactToken(apiSku);
  if (!token) return false;
  const set = ignored || skuPlanFactIgnoredSet();
  const normalizedPlatform = skuPlanFactNormalizePlatform(platform) || 'all';
  return set.has(skuPlanFactIgnoreKey(normalizedPlatform, token))
    || set.has(skuPlanFactIgnoreKey('all', token));
}

function skuPlanFactArticleToken(item = {}) {
  return skuPlanFactToken(item.articleKey || item.article || item.sku || item.vendorCode || '');
}

function skuPlanFactIndexRows(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const token = skuPlanFactArticleToken(row);
    if (!token) return;
    if (!map.has(token)) map.set(token, []);
    map.get(token).push(row);
  });
  return map;
}

function skuPlanFactRowsFromIndexMap(map = null) {
  return map ? [...map.values()].flat() : [];
}

function skuPlanFactSkuLookupTokens(sku = {}, platform = '') {
  const values = typeof skuLookupValues === 'function'
    ? skuLookupValues(sku)
    : [sku?.articleKey, sku?.article, sku?.sku, sku?.vendorCode, sku?.barcode, sku?.nmId];
  const platformAliases = sku?.platformAliases || {};
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  [platform, supportKey, platform === 'ya' ? 'ym' : '', platform === 'ym' ? 'ya' : '']
    .filter(Boolean)
    .forEach((key) => {
      const aliases = platformAliases[key];
      if (Array.isArray(aliases)) values.push(...aliases);
      else if (aliases) values.push(aliases);
    });
  const tokens = [];
  const seen = new Set();
  values.forEach((value) => {
    const token = skuPlanFactToken(value);
    if (!token || seen.has(token)) return;
    seen.add(token);
    tokens.push(token);
  });
  return tokens;
}

function skuPlanFactRowsForSkuIndex(map = null, sku = {}, platform = '') {
  if (!map) return [];
  const rows = [];
  const seen = new Set();
  skuPlanFactSkuLookupTokens(sku, platform).forEach((token) => {
    (map.get(token) || []).forEach((row, index) => {
      const key = `${token}|${index}|${row?.articleKey || row?.article || ''}|${row?.sourceMode || row?.source || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(row);
    });
  });
  return rows;
}

function skuPlanFactRowsForSkuArray(rows = [], sku = {}, platform = '') {
  const tokens = new Set(skuPlanFactSkuLookupTokens(sku, platform));
  if (!tokens.size) return [];
  return rows.filter((row) => tokens.has(skuPlanFactArticleToken(row)));
}

function skuPlanFactWbSubstitutionPayload() {
  const payload = state.wbSubstitutionTraffic && typeof state.wbSubstitutionTraffic === 'object'
    ? state.wbSubstitutionTraffic
    : {};
  return {
    generatedAt: payload.generatedAt || '',
    asOfDate: payload.asOfDate || '',
    summary: payload.summary || {},
    articles: Array.isArray(payload.articles) ? payload.articles : [],
    rows: Array.isArray(payload.rows) ? payload.rows : []
  };
}

function skuPlanFactWbSubstitutionIndex() {
  const payload = skuPlanFactWbSubstitutionPayload();
  if (skuPlanFactWbSubstitutionIndexCache.payload === state.wbSubstitutionTraffic && skuPlanFactWbSubstitutionIndexCache.index) {
    return skuPlanFactWbSubstitutionIndexCache.index;
  }
  const index = new Map();
  const add = (tokenValue, row) => {
    const token = skuPlanFactToken(tokenValue);
    if (!token) return;
    if (!index.has(token)) index.set(token, []);
    index.get(token).push(row);
  };
  payload.articles.forEach((row) => {
    add(row.articleKey, row);
    add(row.article, row);
    add(row.sellerArticle, row);
    add(row.productId, row);
  });
  skuPlanFactWbSubstitutionIndexCache = { payload: state.wbSubstitutionTraffic, index };
  return index;
}

function skuPlanFactWbSubstitutionForSku(sku = {}) {
  const index = skuPlanFactWbSubstitutionIndex();
  if (!index.size) return null;
  const tokens = new Set([
    ...skuPlanFactSkuLookupTokens(sku, 'wb'),
    skuPlanFactToken(sku?.wb?.productId),
    skuPlanFactToken(sku?.wb?.nmId),
    skuPlanFactToken(sku?.wb?.supplierArticle)
  ].filter(Boolean));
  const rows = [];
  const seen = new Set();
  tokens.forEach((token) => {
    (index.get(token) || []).forEach((row) => {
      const key = row.articleKey || row.sellerArticle || row.productId || token;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(row);
    });
  });
  if (!rows.length) return null;
  const topSubstitutions = [];
  const result = rows.reduce((acc, row) => {
    acc.views += numberOrZero(row.views);
    acc.carts += numberOrZero(row.carts);
    acc.orders += numberOrZero(row.orders);
    acc.favorites += numberOrZero(row.favorites);
    acc.substitutionCount += numberOrZero(row.substitutionCount);
    acc.campaignCount += numberOrZero(row.campaignCount);
    (Array.isArray(row.topSubstitutions) ? row.topSubstitutions : []).forEach((item) => topSubstitutions.push(item));
    return acc;
  }, { views: 0, carts: 0, orders: 0, favorites: 0, substitutionCount: 0, campaignCount: 0 });
  result.cartRate = result.views > 0 ? result.carts / result.views : null;
  result.orderRate = result.views > 0 ? result.orders / result.views : null;
  result.topSubstitutions = topSubstitutions
    .sort((left, right) => (
      numberOrZero(right.orders) - numberOrZero(left.orders)
      || numberOrZero(right.views) - numberOrZero(left.views)
      || String(left.label || left.key || '').localeCompare(String(right.label || right.key || ''), 'ru')
    ))
    .slice(0, 6);
  result.source = skuPlanFactWbSubstitutionPayload().generatedAt || skuPlanFactWbSubstitutionPayload().asOfDate || '';
  return result;
}

function skuPlanFactKnownSkuTokens() {
  const tokens = new Set();
  (state.skus || []).forEach((sku) => {
    const values = typeof skuLookupValues === 'function'
      ? skuLookupValues(sku)
      : [sku?.articleKey, sku?.article, sku?.sku, sku?.vendorCode, sku?.barcode, sku?.nmId];
    values.forEach((value) => {
      const token = skuPlanFactToken(value);
      if (token) tokens.add(token);
    });
  });
  return tokens;
}

function skuPlanFactBuildIndexes() {
  const smart = {};
  const overlay = {};
  const support = {};
  const prices = {};
  const extra = {};
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    smart[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.smartPriceWorkbench || {}, platform));
    overlay[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.smartPriceOverlay || {}, platform));
    support[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.priceWorkbenchSupport || {}, platform));
    prices[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.prices || {}, platform));
    extra[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.platformTrends || {}, platform));
  });
  return { smart, overlay, support, prices, extra };
}

function skuPlanFactUnmappedSkuFromRow(row = {}, token = '') {
  const articleKey = String(row.articleKey || row.article || row.sku || row.offerId || row.offer_id || row.vendorCode || token || '').trim();
  const name = String(row.name || row.offerName || row.productName || row.title || articleKey || token || '').trim();
  return {
    articleKey,
    article: String(row.article || row.articleKey || articleKey).trim(),
    name,
    owner: {
      name: SKU_PLAN_FACT_UNMAPPED_OWNER,
      registryStatus: SKU_PLAN_FACT_UNMAPPED_STATUS,
      source: row.sourceMode || row.source || 'platform_trends.extraMarketplace'
    },
    ownersByPlatform: {},
    status: SKU_PLAN_FACT_UNMAPPED_STATUS,
    flags: { assigned: true },
    __skuPlanFactUnmapped: true
  };
}

function skuPlanFactUnmappedSkus(indexes = {}, monthKey = '', maxFactDate = '', minFactDate = '') {
  const knownTokens = skuPlanFactKnownSkuTokens();
  const ignoredTokens = skuPlanFactIgnoredSet();
  const result = new Map();
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    skuPlanFactRowsFromIndexMap(indexes.extra?.[platform]).forEach((row) => {
      const token = skuPlanFactArticleToken(row);
      if (!token || knownTokens.has(token) || result.has(token)) return;
      if (skuPlanFactIsIgnored(platform, row.articleKey || row.article || token, ignoredTokens)) return;
      const fact = skuPlanFactFactFromRows([row], monthKey, maxFactDate, minFactDate);
      if (!(numberOrZero(fact.revenue) > 0 || numberOrZero(fact.units) > 0)) return;
      result.set(token, skuPlanFactUnmappedSkuFromRow(row, token));
    });
  });
  return [...result.values()].sort((left, right) => String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru'));
}

function skuPlanFactAvailableMonths(indexes) {
  const months = new Set();
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    [indexes.smart?.[platform], indexes.overlay?.[platform], indexes.support?.[platform], indexes.prices?.[platform], indexes.extra?.[platform]].forEach((map) => {
      skuPlanFactRowsFromIndexMap(map).forEach((row) => {
        if (row.planMonthKey) months.add(String(row.planMonthKey).slice(0, 7));
        (row.planMonths || []).forEach((item) => item?.monthKey && months.add(String(item.monthKey).slice(0, 7)));
        (row.actualMonths || []).forEach((item) => item?.monthKey && months.add(String(item.monthKey).slice(0, 7)));
        (row.monthly || row.daily || []).forEach((item) => {
          const monthKey = skuPlanFactMonthFromDate(item?.date);
          if (monthKey) months.add(monthKey);
        });
      });
    });
  });
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    const monthKey = skuPlanFactMonthFromDate(item?.date);
    if (monthKey) months.add(monthKey);
  });
  Object.keys(state.platformPlan?.months || {}).forEach((monthKey) => {
    if (monthKey) months.add(String(monthKey).slice(0, 7));
  });
  Object.keys(state.dashboard?.companyPlan?.months || {}).forEach((monthKey) => {
    if (monthKey) months.add(String(monthKey).slice(0, 7));
  });
  Object.keys(state.companyPlan?.months || {}).forEach((monthKey) => {
    if (monthKey) months.add(String(monthKey).slice(0, 7));
  });
  return [...months].filter(Boolean).sort().reverse();
}

function skuPlanFactLatestMonth(months = []) {
  const sourceMonth = [
    state.dashboard?.dataFreshness?.googleSheetsMonth,
    state.dashboard?.dataFreshness?.asOfDate,
    state.dashboard?.asOfDate,
    state.platformTrends?.asOfDate,
    state.smartPriceOverlay?.asOfDate,
    state.adsSummary?.asOfDate
  ].map((value) => {
    const raw = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}$/.test(raw) ? raw : skuPlanFactMonthFromDate(raw);
  }).find((monthKey) => monthKey && (!months.length || months.includes(monthKey)));
  return months.includes(sourceMonth) ? sourceMonth : (months[0] || sourceMonth || todayIso().slice(0, 7));
}

function skuPlanFactSelectedMonth(months = [], filtersOverride = null) {
  const filters = filtersOverride || skuPlanFactFilters();
  if (filters.month && filters.month !== 'latest' && months.includes(filters.month)) return filters.month;
  if (filters.dateMode === 'manual') {
    const dateMonth = skuPlanFactMonthFromDate(filters.dateTo || filters.date || filters.dateFrom);
    if (dateMonth && (!months.length || months.includes(dateMonth))) return dateMonth;
  }
  return skuPlanFactLatestMonth(months);
}

function skuPlanFactDailyHasSalesSignal(item = {}) {
  return [
    item.revenue,
    item.ordersRevenue,
    item.financeTurnover,
    item.salesRevenue,
    item.turnover,
    item.ordersUnits,
    item.deliveredUnits,
    item.units,
    item.orders
  ].some((value) => Math.abs(numberOrZero(value)) > 0);
}

function skuPlanFactLatestActualDate(indexes, monthKey = '') {
  let maxDate = '';
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    [indexes.overlay?.[platform], indexes.smart?.[platform], indexes.support?.[platform], indexes.prices?.[platform], indexes.extra?.[platform]].forEach((map) => {
      skuPlanFactRowsFromIndexMap(map).forEach((row) => {
        (row.daily || row.monthly || []).forEach((item) => {
          const date = String(item?.date || '').slice(0, 10);
          if (!skuPlanFactDailyHasSalesSignal(item)) return;
          if ((!monthKey || date.slice(0, 7) === monthKey) && date > maxDate) maxDate = date;
        });
      });
    });
  });
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    const date = String(item?.date || '').slice(0, 10);
    if (!skuPlanFactDailyHasSalesSignal(item)) return;
    if ((!monthKey || date.slice(0, 7) === monthKey) && date > maxDate) maxDate = date;
  });
  (state.platformTrends?.platforms || []).forEach((platform) => {
    (platform?.series || []).forEach((item) => {
      const date = String(item?.date || item?.label || '').slice(0, 10);
      if (!skuPlanFactDailyHasSalesSignal(item)) return;
      if ((!monthKey || date.slice(0, 7) === monthKey) && date > maxDate) maxDate = date;
    });
  });
  return maxDate;
}

function skuPlanFactMaxFactDate(indexes, monthKey) {
  const maxDate = skuPlanFactLatestActualDate(indexes, monthKey);
  return maxDate || `${monthKey}-${String(skuPlanFactMonthDays(monthKey)).padStart(2, '0')}`;
}

function skuPlanFactDateBounds(indexes, months = [], selectedMonth = '') {
  const safeMonths = months.length ? months : [todayIso().slice(0, 7)];
  if (selectedMonth) {
    return {
      min: `${selectedMonth}-01`,
      max: skuPlanFactMaxFactDate(indexes, selectedMonth) || skuPlanFactMonthEnd(selectedMonth)
    };
  }
  const minMonth = safeMonths[safeMonths.length - 1];
  const actualMaxDate = skuPlanFactLatestActualDate(indexes);
  const defaultMaxDate = skuPlanFactMaxFactDate(indexes, safeMonths[0]);
  const maxDate = [actualMaxDate, defaultMaxDate].filter(Boolean).sort().at(-1) || '';
  return {
    min: minMonth ? `${minMonth}-01` : '',
    max: maxDate
  };
}

function skuPlanFactSelectedDate(indexes, monthKey, maxFactDate = '', filtersOverride = null) {
  const filters = filtersOverride || skuPlanFactFilters();
  const maxDate = maxFactDate || skuPlanFactMaxFactDate(indexes, monthKey);
  const selected = skuPlanFactDateKey(filters.dateTo || filters.date);
  const monthStart = skuPlanFactMonthStart(monthKey);
  if (selected && skuPlanFactMonthFromDate(selected) === monthKey) {
    if (monthStart && selected < monthStart) return monthStart;
    if (maxDate && selected > maxDate) return maxDate;
    return selected;
  }
  filters.date = maxDate;
  filters.dateTo = maxDate;
  return maxDate;
}

function skuPlanFactElapsedDays(monthKey, maxFactDate) {
  const days = skuPlanFactMonthDays(monthKey);
  const factMonth = skuPlanFactMonthFromDate(maxFactDate);
  if (factMonth === monthKey) return Math.min(days, Math.max(1, Number(String(maxFactDate).slice(8, 10)) || 1));
  return days;
}

function skuPlanFactSelectedPeriod(indexes, monthKey, maxFactDate = '', filtersOverride = null) {
  const filters = filtersOverride || skuPlanFactFilters();
  const monthStart = skuPlanFactMonthStart(monthKey);
  const maxDate = maxFactDate || skuPlanFactMaxFactDate(indexes, monthKey);
  const monthMode = filters.dateMode === 'month';
  let dateTo = monthMode ? maxDate : skuPlanFactSelectedDate(indexes, monthKey, maxDate, filters);
  let dateFrom = monthMode ? monthStart : skuPlanFactDateKey(filters.dateFrom);
  if (!dateFrom || skuPlanFactMonthFromDate(dateFrom) !== monthKey) {
    dateFrom = monthStart;
  }
  dateFrom = skuPlanFactClampDateToRange(dateFrom, monthStart, dateTo || maxDate);
  dateTo = skuPlanFactClampDateToRange(dateTo, dateFrom || monthStart, maxDate);
  if (dateFrom && dateTo && dateFrom > dateTo) dateFrom = dateTo;
  filters.dateFrom = dateFrom;
  filters.dateTo = dateTo;
  filters.date = dateTo;
  filters.month = monthKey || (dateTo ? dateTo.slice(0, 7) : filters.month);
  return {
    start: dateFrom,
    end: dateTo,
    days: skuPlanFactInclusiveDays(dateFrom, dateTo) || skuPlanFactElapsedDays(monthKey, dateTo)
  };
}

function skuPlanFactPlanFromRows(rows = [], monthKey = '') {
  const result = { units: 0, revenue: 0, avgCheck: null, days: skuPlanFactMonthDays(monthKey), source: '' };
  rows.forEach((row) => {
    let month = (row.planMonths || []).find((item) => String(item?.monthKey || '').slice(0, 7) === monthKey);
    if (!month && String(row.planMonthKey || '').slice(0, 7) === monthKey) {
      month = {
        units: row.planMonthUnits,
        revenue: row.planMonthRevenue,
        avgPrice: row.planMonthCheck,
        days: row.planMonthDays,
        source: row.planMonthLabel || 'smart_price_workbench'
      };
    }
    if (!month) return;
    const units = numberOrZero(month.units);
    const avgPrice = Number.isFinite(Number(month.avgPrice)) ? Number(month.avgPrice) : null;
    const revenue = numberOrZero(month.revenue || (avgPrice !== null ? units * avgPrice : 0));
    result.units += units;
    result.revenue += revenue;
    result.days = Number.isFinite(Number(month.days)) ? Number(month.days) : result.days;
    if (!result.source && month.source) result.source = month.source;
  });
  result.avgCheck = result.units > 0 ? result.revenue / result.units : null;
  return result;
}

function skuPlanFactDailyArrayFromMap(map = new Map()) {
  return [...map.entries()]
    .map(([date, value]) => ({
      date,
      revenue: numberOrZero(value?.revenue),
      units: numberOrZero(value?.units)
    }))
    .filter((item) => item.date && (item.revenue > 0 || item.units > 0))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function skuPlanFactFactFromRows(rows = [], monthKey = '', maxFactDate = '', minFactDate = '') {
  const result = { units: 0, revenue: 0, avgCheck: null, source: '', daily: [] };
  const seenDaily = new Set();
  const dailyMap = new Map();
  const monthStart = skuPlanFactMonthStart(monthKey);
  const monthEnd = skuPlanFactMonthEnd(monthKey);
  const allowMonthlyFallback = (!maxFactDate || maxFactDate >= monthEnd) && (!minFactDate || minFactDate <= monthStart);
  rows.forEach((row, rowIndex) => {
    const daily = [...(row.daily || []), ...(row.monthly || [])];
    daily.forEach((item, itemIndex) => {
      const date = String(item?.date || '').slice(0, 10);
      if (date.slice(0, 7) !== monthKey) return;
      if (minFactDate && date < minFactDate) return;
      if (maxFactDate && date > maxFactDate) return;
      const dedupeKey = `${row.articleKey || row.article || rowIndex}|${date}|${itemIndex}|${item.revenue}|${item.ordersUnits}`;
      if (seenDaily.has(dedupeKey)) return;
      seenDaily.add(dedupeKey);
      const units = numberOrZero(item.ordersUnits ?? item.deliveredUnits);
      const revenue = numberOrZero(item.revenue);
      result.units += units;
      result.revenue += revenue;
      const dailyRow = dailyMap.get(date) || { units: 0, revenue: 0 };
      dailyRow.units += units;
      dailyRow.revenue += revenue;
      dailyMap.set(date, dailyRow);
    });
    (row.actualMonths || []).forEach((item) => {
      if (String(item?.monthKey || '').slice(0, 7) !== monthKey) return;
      if (!allowMonthlyFallback) return;
      if (result.revenue > 0 || result.units > 0) return;
      const units = numberOrZero(item.units);
      const revenue = numberOrZero(item.revenue);
      result.units += units;
      result.revenue += revenue;
      const fallbackDate = maxFactDate || monthEnd;
      const dailyRow = dailyMap.get(fallbackDate) || { units: 0, revenue: 0 };
      dailyRow.units += units;
      dailyRow.revenue += revenue;
      dailyMap.set(fallbackDate, dailyRow);
      if (!result.source && item.source) result.source = item.source;
    });
    if (!result.source && row.sourceMode) result.source = row.sourceMode;
  });
  result.avgCheck = result.units > 0 ? result.revenue / result.units : null;
  result.daily = skuPlanFactDailyArrayFromMap(dailyMap);
  return result;
}

function skuPlanFactPlatformTrend(platform = '') {
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  return (state.platformTrends?.platforms || []).find((item) => {
    const key = String(item?.key || '').trim();
    return key === platform || key === supportKey;
  }) || null;
}

function skuPlanFactPlatformAggregateFact(platform = '', monthKey = '', maxFactDate = '', minFactDate = '') {
  const result = { units: 0, revenue: 0 };
  const platformTrend = skuPlanFactPlatformTrend(platform);
  (platformTrend?.series || []).forEach((item) => {
    const date = String(item?.date || item?.label || '').slice(0, 10);
    if (skuPlanFactMonthFromDate(date) !== monthKey) return;
    if (minFactDate && date < minFactDate) return;
    if (maxFactDate && date > maxFactDate) return;
    result.units += numberOrZero(item.ordersUnits ?? item.units);
    result.revenue += numberOrZero(item.ordersRevenue ?? item.revenue ?? item.financeTurnover);
  });
  return result;
}

function skuPlanFactScaleMetricFact(metric = null, ratio = 1, reconciliation = null) {
  if (!metric || !Number.isFinite(Number(ratio)) || ratio >= 1 || ratio <= 0) return;
  const rawFactRevenue = numberOrZero(metric.factRevenue);
  const rawFactUnits = numberOrZero(metric.factUnits);
  metric.rawFactRevenue = rawFactRevenue;
  metric.rawFactUnits = rawFactUnits;
  metric.factRevenue = rawFactRevenue * ratio;
  metric.factUnits = rawFactUnits * ratio;
  metric.factAvgCheck = metric.factUnits > 0 ? metric.factRevenue / metric.factUnits : null;
  if (Array.isArray(metric.factDaily)) {
    metric.factDaily = metric.factDaily.map((item) => ({
      ...item,
      revenue: numberOrZero(item.revenue) * ratio,
      units: numberOrZero(item.units) * ratio
    }));
  }
  metric.reconciledFact = true;
  metric.reconciliationRatio = ratio;
  metric.reconciliation = reconciliation;
  if (!String(metric.source || '').includes('platform-reconciled')) {
    metric.source = [metric.source, 'platform-reconciled'].filter(Boolean).join('+');
  }
}

function skuPlanFactReconcilePlatformFacts(rows = [], monthKey = '', maxFactDate = '', minFactDate = '') {
  const reconciliations = [];
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const aggregate = skuPlanFactPlatformAggregateFact(platform, monthKey, maxFactDate, minFactDate);
    const raw = rows.reduce((acc, row) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      acc.units += numberOrZero(metric?.factUnits);
      acc.revenue += numberOrZero(metric?.factRevenue);
      return acc;
    }, { units: 0, revenue: 0 });
    if (!(aggregate.revenue >= SKU_PLAN_FACT_RECONCILE_MIN_REVENUE && raw.revenue > aggregate.revenue * SKU_PLAN_FACT_RECONCILE_OVERAGE_THRESHOLD)) {
      return;
    }
    const ratio = aggregate.revenue / raw.revenue;
    const reconciliation = {
      platform,
      label: skuPlanFactPlatformLabel(platform),
      rawRevenue: raw.revenue,
      aggregateRevenue: aggregate.revenue,
      rawUnits: raw.units,
      aggregateUnits: aggregate.units,
      ratio
    };
    rows.forEach((row) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      skuPlanFactScaleMetricFact(metric, ratio, reconciliation);
    });
    reconciliations.push(reconciliation);
  });
  return reconciliations;
}

function skuPlanFactBlankMetric(platform = '') {
  return {
    platform,
    label: skuPlanFactPlatformLabel(platform),
    planUnits: 0,
    planRevenue: 0,
    planAvgCheck: null,
    planToDateUnits: 0,
    planToDateRevenue: 0,
    factUnits: 0,
    factRevenue: 0,
    factAvgCheck: null,
    completionToDate: null,
    completionMonth: null,
    gapToDate: 0,
    adSpend: 0,
    adViews: 0,
    adClicks: 0,
    adOrders: 0,
    adRevenue: 0,
    substitutionViews: 0,
    substitutionCarts: 0,
    substitutionOrders: 0,
    substitutionFavorites: 0,
    substitutionCount: 0,
    substitutionCampaignCount: 0,
    substitutionCartRate: null,
    substitutionOrderRate: null,
    substitutionTop: [],
    substitutionSource: '',
    drr: null,
    adsDrr: null,
    planAdSpend: null,
    planAdSpendToDate: null,
    planMonthAdSpend: null,
    planPeriodAdSpend: null,
    adForecastSpend: null,
    adCompletionToDate: null,
    adForecastCompletion: null,
    adGapToDate: null,
    adForecastGap: null,
    adElapsedDays: 0,
    adForecastDays: 0,
    planDrr: null,
    planMonthDrr: null,
    planAdSource: '',
    turnoverDays: null,
    stock: null,
    marginPct: null,
    marginRub: null,
    factMarginPct: null,
    planMarginPct: null,
    planMarginRub: null,
    marginIsPlanFallback: false,
    marginSource: '',
    planMarginSource: '',
    factDaily: [],
    scoreHistory: [],
    completionDelta: null,
    currentPrice: null,
    currentClientPrice: null,
    currentFillPrice: null,
    hasSource: false,
    planPriceProxy: 0,
    hasDirectPlan: false,
    source: ''
  };
}

function skuPlanFactAppendUnallocatedAggregateRows(rows = [], monthKey = '', maxFactDate = '', minFactDate = '') {
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const aggregate = skuPlanFactPlatformAggregateFact(platform, monthKey, maxFactDate, minFactDate);
    const raw = rows.reduce((acc, row) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      acc.units += numberOrZero(metric?.factUnits);
      acc.revenue += numberOrZero(metric?.factRevenue);
      return acc;
    }, { units: 0, revenue: 0 });
    const revenueDelta = aggregate.revenue - raw.revenue;
    if (!(aggregate.revenue >= SKU_PLAN_FACT_RECONCILE_MIN_REVENUE && revenueDelta > SKU_PLAN_FACT_RECONCILE_MIN_REVENUE && raw.revenue < aggregate.revenue * 0.98)) {
      return;
    }
    const unitsDelta = Math.max(0, aggregate.units - raw.units);
    const articleKey = `__unallocated_${platform}_${monthKey}`;
    const platforms = {};
    SKU_PLAN_FACT_PLATFORMS.forEach((key) => {
      platforms[key] = skuPlanFactBlankMetric(key);
    });
    const metric = platforms[platform];
    metric.factUnits = unitsDelta;
    metric.factRevenue = revenueDelta;
    metric.factAvgCheck = unitsDelta > 0 ? revenueDelta / unitsDelta : null;
    metric.hasSource = true;
    metric.source = 'platform-aggregate-unallocated';
    metric.gapToDate = revenueDelta;
    const row = {
      sku: {
        articleKey,
        article: `Неразнесено ${skuPlanFactPlatformLabel(platform)}`,
        name: 'Разница между агрегатом площадки и строками SKU',
        owner: {
          name: SKU_PLAN_FACT_UNMAPPED_OWNER,
          registryStatus: SKU_PLAN_FACT_UNALLOCATED_STATUS
        },
        flags: { assigned: true },
        __skuPlanFactUnmapped: true,
        __skuPlanFactUnallocated: true
      },
      articleKey,
      article: `Неразнесено ${skuPlanFactPlatformLabel(platform)}`,
      name: 'Разница между агрегатом площадки и строками SKU',
      owner: SKU_PLAN_FACT_UNMAPPED_OWNER,
      status: SKU_PLAN_FACT_UNALLOCATED_STATUS,
      syntheticUnmapped: true,
      syntheticUnallocated: true,
      platforms
    };
    SKU_PLAN_FACT_PLATFORMS.forEach((key) => {
      row[key] = platforms[key];
    });
    rows.push(row);
  });
  return rows;
}

function skuPlanFactRowsHavePlan(rows = [], monthKey = '') {
  return rows.some((row) => {
    if (String(row.planMonthKey || '').slice(0, 7) === monthKey) return true;
    return (row.planMonths || []).some((item) => String(item?.monthKey || '').slice(0, 7) === monthKey);
  });
}

function skuPlanFactRowsHaveFact(rows = [], monthKey = '') {
  return rows.some((row) => {
    if ((row.actualMonths || []).some((item) => String(item?.monthKey || '').slice(0, 7) === monthKey)) return true;
    return (row.daily || row.monthly || []).some((item) => skuPlanFactMonthFromDate(item?.date) === monthKey);
  });
}

function skuPlanFactLatestMetric(rows = [], fieldNames = []) {
  for (const row of rows) {
    for (const fieldName of fieldNames) {
      const value = row?.[fieldName];
      if (Number.isFinite(Number(value))) return Number(value);
    }
  }
  return null;
}

function skuPlanFactRatioOrNull(value) {
  const ratio = skuPlanFactNormalizeRatio(value);
  return ratio === null || !Number.isFinite(Number(ratio)) ? null : ratio;
}

function skuPlanFactPositiveRatioOrNull(value) {
  const ratio = skuPlanFactRatioOrNull(value);
  return ratio !== null && ratio > 0 ? ratio : null;
}

function skuPlanFactFirstRatioFromRows(rows = [], fieldNames = SKU_PLAN_FACT_MARGIN_PLAN_FIELDS) {
  for (const row of rows || []) {
    for (const fieldName of fieldNames) {
      const ratio = skuPlanFactPositiveRatioOrNull(row?.[fieldName]);
      if (ratio !== null) return ratio;
    }
  }
  return null;
}

function skuPlanFactSkuMarginFallback(sku = {}, platform = '') {
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  const direct = skuPlanFactPositiveRatioOrNull(sku?.[platform]?.marginPct)
    ?? skuPlanFactPositiveRatioOrNull(sku?.[supportKey]?.marginPct);
  if (direct !== null) return { value: direct, source: 'sku-platform' };

  const sides = ['wb', 'ozon']
    .map((key) => skuPlanFactPositiveRatioOrNull(sku?.[key]?.marginPct))
    .filter((value) => value !== null && value > 0);
  if (sides.length) {
    return {
      value: sides.reduce((sum, value) => sum + value, 0) / sides.length,
      source: 'sku-marketplace-average'
    };
  }

  const planFactMargin = skuPlanFactPositiveRatioOrNull(sku?.planFact?.factFeb26MarginPct);
  if (planFactMargin !== null) return { value: planFactMargin, source: 'sku-plan-fact-history' };
  return { value: null, source: '' };
}

function skuPlanFactPlanMarginForSku(sku = {}, platform = '', rows = {}) {
  const rowMargin = skuPlanFactFirstRatioFromRows([
    ...(rows.sourceRows || []),
    ...(rows.supportRows || []),
    ...(rows.pricesRows || []),
    ...(rows.overlayRows || []),
    ...(rows.smartRows || [])
  ]);
  if (rowMargin !== null) return { value: rowMargin, source: 'price-economics' };
  return skuPlanFactSkuMarginFallback(sku, platform);
}

function skuPlanFactEffectiveMargin(platform = '', factMargin = null, planMargin = null) {
  const fact = skuPlanFactRatioOrNull(factMargin);
  const plan = skuPlanFactRatioOrNull(planMargin);
  if (fact !== null && (fact > 0 || platform === 'wb' || platform === 'ozon')) {
    return { value: fact, isPlanFallback: false };
  }
  if (plan !== null) return { value: plan, isPlanFallback: true };
  return { value: fact, isPlanFallback: false };
}

function skuPlanFactPlatformSourceRows(indexes = {}, platform = '') {
  if (platform === 'wb' || platform === 'ozon') {
    const overlayRows = skuPlanFactRowsFromIndexMap(indexes.overlay?.[platform]);
    if (overlayRows.length) return overlayRows;
    const smartRows = skuPlanFactRowsFromIndexMap(indexes.smart?.[platform]);
    if (smartRows.length) return smartRows;
    return skuPlanFactRowsFromIndexMap(indexes.support?.[platform]);
  }
  if (platform === 'ya') {
    const priceRows = skuPlanFactRowsFromIndexMap(indexes.prices?.[platform]);
    if (priceRows.length) return priceRows;
    return skuPlanFactRowsFromIndexMap(indexes.extra?.[platform]);
  }
  const extraRows = skuPlanFactRowsFromIndexMap(indexes.extra?.[platform]);
  if (extraRows.length) return extraRows;
  return skuPlanFactRowsFromIndexMap(indexes.prices?.[platform]);
}

function skuPlanFactPlatformPlanRows(indexes = {}, platform = '', monthKey = '') {
  if (!SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS.has(platform)) return [];
  const smartRows = skuPlanFactRowsFromIndexMap(indexes.smart?.[platform]);
  const supportRows = skuPlanFactRowsFromIndexMap(indexes.support?.[platform]);
  return skuPlanFactRowsHavePlan(supportRows, monthKey) ? supportRows : smartRows;
}

function skuPlanFactPlatformHasDirectApiFact(indexes = {}, platform = '') {
  if (platform !== 'ozon' && platform !== 'wb' && platform !== 'ya') return false;
  return skuPlanFactRowsFromIndexMap(indexes.extra?.[platform])
    .some((row) => String(row?.sourceMode || row?.source || '').includes('api-direct-sku'));
}

function skuPlanFactPlatformPlanUnits(monthKey = '', platform = '') {
  return numberOrZero(
    state.platformPlan?.months?.[monthKey]?.platforms?.[platform]?.units
    || state.platformPlan?.months?.[monthKey]?.platforms?.[skuPlanFactPlatformSupportKey(platform)]?.units
  );
}

function skuPlanFactPayrollCompanyPlan() {
  const plan = state.dashboard?.companyPlan || null;
  if (!plan) return null;
  if (plan.payrollKpiPolicy?.isPayrollCritical) return plan;
  if (plan.planType === 'marketplace_salary_revenue') return plan;
  return null;
}

function skuPlanFactPayrollControlTotals(monthKey = '') {
  const plan = skuPlanFactPayrollCompanyPlan();
  if (!plan || !monthKey) return null;
  const explicit = plan.payrollKpiPolicy?.controlTotals?.[monthKey];
  if (explicit) return explicit;
  const month = plan.months?.[monthKey];
  if (!month) return null;
  return {
    revenue: numberOrZero(month.revenue),
    wb: numberOrZero(month.channels?.wb?.revenue),
    ozon: numberOrZero(month.channels?.ozon?.revenue),
    ya: numberOrZero(month.channels?.ya?.revenue)
  };
}

function skuPlanFactPayrollPlanRevenue(monthKey = '', platform = 'all') {
  const totals = skuPlanFactPayrollControlTotals(monthKey);
  if (!totals) return null;
  if (!platform || platform === 'all') return numberOrZero(totals.revenue);
  if (!SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(platform)) return 0;
  return numberOrZero(totals[platform]);
}

function skuPlanFactCorporateAdRate(platform = '', monthKey = '') {
  const plan = skuPlanFactPayrollCompanyPlan();
  const month = plan?.months?.[monthKey || plan.activeMonthKey || ''] || plan?.activeMonth || {};
  const configured = month.channels?.[platform]?.adRate
    ?? month.channels?.[platform]?.planDrr
    ?? plan?.adRates?.[platform]
    ?? SKU_PLAN_FACT_CORPORATE_AD_RATES[platform];
  const rate = skuPlanFactNormalizeRatio(configured);
  return rate !== null && rate > 0 ? rate : null;
}

function skuPlanFactCorporatePlanAdTotals(platform = '', monthKey = '', periodStart = '', periodEnd = '', fullMonth = false) {
  if (!SKU_PLAN_FACT_AD_PLAN_PLATFORMS.has(platform)) {
    return { spend: null, revenue: null, drr: null, source: '' };
  }
  const monthRevenue = skuPlanFactPayrollPlanRevenue(monthKey, platform);
  const rate = skuPlanFactCorporateAdRate(platform, monthKey);
  if (!(monthRevenue > 0) || !(rate > 0)) {
    return { spend: null, revenue: null, drr: null, source: '' };
  }
  const monthStart = skuPlanFactMonthStart(monthKey);
  const monthEnd = skuPlanFactMonthEnd(monthKey);
  const start = fullMonth ? monthStart : skuPlanFactClampDateToRange(periodStart || monthStart, monthStart, monthEnd);
  const end = fullMonth ? monthEnd : skuPlanFactClampDateToRange(periodEnd || monthEnd, monthStart, monthEnd);
  const monthDays = skuPlanFactMonthDays(monthKey);
  const days = fullMonth ? monthDays : skuPlanFactInclusiveDays(start, end);
  const factor = monthDays > 0 ? Math.min(1, Math.max(0, days / monthDays)) : 1;
  const revenue = monthRevenue * factor;
  return {
    spend: monthRevenue * rate * factor,
    revenue,
    drr: rate,
    source: 'company_plan.ad_budget'
  };
}

function skuPlanFactPayrollLatestFactDate(monthKey = '') {
  let maxDate = '';
  SKU_PLAN_FACT_PAYROLL_PLATFORMS.forEach((platformKey) => {
    const platform = skuPlanFactPlatformTrend(platformKey);
    (platform?.series || []).forEach((item) => {
      const date = String(item?.date || item?.label || '').slice(0, 10);
      if ((!monthKey || skuPlanFactMonthFromDate(date) === monthKey) && date > maxDate) maxDate = date;
    });
  });
  const activeMonth = skuPlanFactPayrollCompanyPlan()?.activeMonth;
  const activeDate = state.dashboard?.dataFreshness?.asOfDate || state.dashboard?.asOfDate || '';
  if (activeMonth?.monthKey === monthKey && skuPlanFactMonthFromDate(activeDate) === monthKey && activeDate > maxDate) {
    maxDate = activeDate;
  }
  return maxDate;
}

function skuPlanFactPayrollEffectiveEndDate(monthKey = '', periodEnd = '') {
  const selected = skuPlanFactDateKey(periodEnd);
  const latest = skuPlanFactPayrollLatestFactDate(monthKey);
  if (selected && latest) return selected < latest ? selected : latest;
  return selected || latest || skuPlanFactMonthEnd(monthKey);
}

function skuPlanFactPayrollRawFactRevenue(monthKey = '', platform = 'all', periodStart = '', periodEnd = '') {
  const platforms = platform === 'all' || !platform ? SKU_PLAN_FACT_PAYROLL_PLATFORMS : [platform];
  return platforms
    .filter((item) => SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(item))
    .reduce((sum, item) => sum + numberOrZero(skuPlanFactPlatformAggregateFact(item, monthKey, periodEnd, periodStart).revenue), 0);
}

function skuPlanFactPayrollPlanShareFactRevenue(monthKey = '', platform = 'all', periodStart = '', periodEnd = '') {
  const control = skuPlanFactPayrollFactControl(monthKey, periodStart, periodEnd);
  if (!(control > 0)) return null;
  const rawAll = skuPlanFactPayrollRawFactRevenue(monthKey, 'all', periodStart, periodEnd);
  if (rawAll > 0) return null;
  if (!platform || platform === 'all') return control;
  if (!SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(platform)) return 0;
  const totals = skuPlanFactPayrollControlTotals(monthKey) || {};
  const totalPlan = numberOrZero(totals.revenue)
    || SKU_PLAN_FACT_PAYROLL_PLATFORMS.reduce((sum, key) => sum + numberOrZero(totals[key]), 0);
  const platformPlan = numberOrZero(totals[platform]);
  if (!(totalPlan > 0) || !(platformPlan > 0)) return 0;
  return control * platformPlan / totalPlan;
}

function skuPlanFactPayrollFactControl(monthKey = '', periodStart = '', periodEnd = '') {
  const plan = skuPlanFactPayrollCompanyPlan();
  const activeMonth = plan?.activeMonth;
  if (!activeMonth || activeMonth.monthKey !== monthKey) return null;
  const monthStart = skuPlanFactMonthStart(monthKey);
  const activeDate = skuPlanFactDateKey(state.dashboard?.dataFreshness?.asOfDate || state.dashboard?.asOfDate || '');
  const endDate = skuPlanFactDateKey(periodEnd);
  const startDate = skuPlanFactDateKey(periodStart);
  if (startDate !== monthStart || !activeDate || endDate !== activeDate) return null;
  const fact = numberOrZero(activeMonth.factRevenueToDate);
  return fact > 0 ? fact : null;
}

function skuPlanFactPayrollFactScale(monthKey = '', periodStart = '', periodEnd = '') {
  const control = skuPlanFactPayrollFactControl(monthKey, periodStart, periodEnd);
  if (!control) return null;
  const raw = skuPlanFactPayrollRawFactRevenue(monthKey, 'all', periodStart, periodEnd);
  if (raw <= 0) return null;
  return control / raw;
}

function skuPlanFactPayrollFactRevenue(monthKey = '', platform = 'all', periodStart = '', periodEnd = '') {
  const planShareFact = skuPlanFactPayrollPlanShareFactRevenue(monthKey, platform, periodStart, periodEnd);
  if (planShareFact !== null) return planShareFact;
  const control = skuPlanFactPayrollFactControl(monthKey, periodStart, periodEnd);
  if ((!platform || platform === 'all') && control) return control;
  const raw = skuPlanFactPayrollRawFactRevenue(monthKey, platform, periodStart, periodEnd);
  const scale = skuPlanFactPayrollFactScale(monthKey, periodStart, periodEnd);
  return scale ? raw * scale : raw;
}

function skuPlanFactPayrollKpiForModel(model = {}) {
  const monthKey = model.monthKey || '';
  const plan = skuPlanFactPayrollCompanyPlan();
  const totals = skuPlanFactPayrollControlTotals(monthKey);
  if (!plan || !totals) return null;
  const selectedPlatform = model.filters?.platform || 'all';
  const salaryIncluded = selectedPlatform === 'all' || SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(selectedPlatform);
  const periodEnd = skuPlanFactPayrollEffectiveEndDate(monthKey, model.periodEnd || model.selectedDate || '');
  const periodStart = skuPlanFactClampDateToRange(model.periodStart || skuPlanFactMonthStart(monthKey), skuPlanFactMonthStart(monthKey), periodEnd);
  const elapsedDays = skuPlanFactInclusiveDays(periodStart, periodEnd) || skuPlanFactElapsedDays(monthKey, periodEnd);
  const monthDays = Math.max(1, skuPlanFactMonthDays(monthKey));
  const platformItems = {};
  SKU_PLAN_FACT_PAYROLL_PLATFORMS.forEach((platform) => {
    const planRevenue = skuPlanFactPayrollPlanRevenue(monthKey, platform);
    const factRevenue = skuPlanFactPayrollFactRevenue(monthKey, platform, periodStart, periodEnd);
    const planToDateRevenue = planRevenue > 0 ? planRevenue * elapsedDays / monthDays : 0;
    platformItems[platform] = {
      platform,
      label: skuPlanFactPlatformLabel(platform),
      salaryIncluded: true,
      planRevenue,
      planToDateRevenue,
      factRevenue,
      completionToDate: planToDateRevenue > 0 ? factRevenue / planToDateRevenue : null,
      completionMonth: planRevenue > 0 ? factRevenue / planRevenue : null,
      gapToDate: factRevenue - planToDateRevenue
    };
  });
  const planRevenue = skuPlanFactPayrollPlanRevenue(monthKey, selectedPlatform);
  const factRevenue = salaryIncluded ? skuPlanFactPayrollFactRevenue(monthKey, selectedPlatform, periodStart, periodEnd) : 0;
  const planToDateRevenue = planRevenue > 0 ? planRevenue * elapsedDays / monthDays : 0;
  return {
    purpose: plan.payrollKpiPolicy?.purpose || 'kpi_salary_calculation',
    isPayrollCritical: true,
    monthKey,
    selectedPlatform,
    salaryIncluded,
    periodStart,
    periodEnd,
    elapsedDays,
    monthDays,
    planRevenue,
    planToDateRevenue,
    factRevenue,
    completionToDate: planToDateRevenue > 0 ? factRevenue / planToDateRevenue : null,
    completionMonth: planRevenue > 0 ? factRevenue / planRevenue : null,
    gapToDate: factRevenue - planToDateRevenue,
    platforms: platformItems,
    excludedPlatforms: SKU_PLAN_FACT_PLATFORMS.filter((platform) => !SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(platform)),
    warning: plan.payrollKpiPolicy?.warning || ''
  };
}

function skuPlanFactMetricMatchesOwner(row = {}, platform = '', owner = 'all') {
  const target = skuPlanFactCanonicalOwner(owner);
  if (!target || target === 'all') return true;
  const directOwner = skuPlanFactCanonicalOwner(row.owner || '');
  const baseOwner = skuPlanFactCanonicalOwner(row.ownerBase || '');
  if (!SKU_PLAN_FACT_PLATFORMS.includes(platform)) {
    return directOwner === target || baseOwner === target;
  }
  const scopedOwner = skuPlanFactCanonicalOwner(skuPlanFactScopedOwner(row, platform));
  if (scopedOwner === target) return true;
  return (!scopedOwner || scopedOwner === 'Без owner') && (directOwner === target || baseOwner === target);
}

function skuPlanFactMetricScopeRows(model = {}, rowsOverride = null) {
  if (Array.isArray(rowsOverride)) return rowsOverride;
  const sourceRows = Array.isArray(model.allRows) ? model.allRows : [];
  const filters = model.filters || {};
  return sourceRows.filter((row) => skuPlanFactRowMatchesFilters(row, {
    ...filters,
    owner: 'all',
    platform: 'all'
  }, { platform: false }));
}

function skuPlanFactPayrollMetricTotals(model = {}, selectedPlatform = 'all', rowsOverride = null, options = {}) {
  const rows = skuPlanFactMetricScopeRows(model, rowsOverride);
  const ownerFilter = options.owner !== undefined ? options.owner : (model.filters?.owner || 'all');
  const totals = { planRevenue: 0, planToDateRevenue: 0, planUnits: 0, planToDateUnits: 0, factRevenue: 0, factUnits: 0, adSpend: 0, planAdSpend: 0, planMonthAdSpend: 0, planPeriodAdSpend: 0, adForecastSpend: 0, hasPlanAdSpend: false, hasPlanMonthAdSpend: false, hasPlanPeriodAdSpend: false, hasAdForecastSpend: false, marginValue: 0, marginWeight: 0, planMarginValue: 0, planMarginWeight: 0 };
  const platforms = selectedPlatform && selectedPlatform !== 'all'
    ? [selectedPlatform].filter((platform) => SKU_PLAN_FACT_PLATFORMS.includes(platform))
    : SKU_PLAN_FACT_PAYROLL_PLATFORMS;
  rows.forEach((row) => {
    platforms.forEach((platform) => {
      if (!skuPlanFactMetricMatchesOwner(row, platform, ownerFilter)) return;
      const metric = row.platforms?.[platform] || row[platform] || null;
      if (!metric) return;
      totals.planRevenue += numberOrZero(metric.planRevenue);
      totals.planToDateRevenue += numberOrZero(metric.planToDateRevenue);
      totals.planUnits += numberOrZero(metric.planUnits);
      totals.planToDateUnits += numberOrZero(metric.planToDateUnits);
      totals.factRevenue += numberOrZero(metric.factRevenue);
      totals.factUnits += numberOrZero(metric.factUnits);
      totals.adSpend += numberOrZero(metric.adSpend);
      if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
        totals.planAdSpend += numberOrZero(metric.planAdSpend);
        totals.hasPlanAdSpend = true;
      }
      if (metric.planMonthAdSpend !== null && metric.planMonthAdSpend !== undefined) {
        totals.planMonthAdSpend += numberOrZero(metric.planMonthAdSpend);
        totals.hasPlanMonthAdSpend = true;
      }
      if (metric.planPeriodAdSpend !== null && metric.planPeriodAdSpend !== undefined) {
        totals.planPeriodAdSpend += numberOrZero(metric.planPeriodAdSpend);
        totals.hasPlanPeriodAdSpend = true;
      }
      if (metric.adForecastSpend !== null && metric.adForecastSpend !== undefined) {
        totals.adForecastSpend += numberOrZero(metric.adForecastSpend);
        totals.hasAdForecastSpend = true;
      }
      const marginPct = skuPlanFactNormalizeRatio(metric.marginPct);
      const marginWeight = numberOrZero(metric.factRevenue)
        || numberOrZero(metric.planToDateRevenue)
        || numberOrZero(metric.planRevenue);
      if (marginPct !== null && marginWeight > 0) {
        totals.marginValue += marginPct * marginWeight;
        totals.marginWeight += marginWeight;
      }
      const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
      const planMarginWeight = numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue);
      if (planMarginPct !== null && planMarginWeight > 0) {
        totals.planMarginValue += planMarginPct * planMarginWeight;
        totals.planMarginWeight += planMarginWeight;
      }
    });
  });
  totals.completionToDate = totals.planToDateRevenue > 0 ? totals.factRevenue / totals.planToDateRevenue : null;
  totals.completionMonth = totals.planRevenue > 0 ? totals.factRevenue / totals.planRevenue : null;
  totals.gapToDate = totals.factRevenue - totals.planToDateRevenue;
  totals.avgCheck = totals.factUnits > 0 ? totals.factRevenue / totals.factUnits : null;
  totals.drr = totals.factRevenue > 0 ? totals.adSpend / totals.factRevenue : null;
  totals.marginPct = totals.marginWeight > 0 ? totals.marginValue / totals.marginWeight : null;
  totals.planAdSpend = totals.hasPlanAdSpend ? totals.planAdSpend : null;
  totals.planAdSpendToDate = totals.planAdSpend;
  totals.planMonthAdSpend = totals.hasPlanMonthAdSpend ? totals.planMonthAdSpend : null;
  totals.planPeriodAdSpend = totals.hasPlanPeriodAdSpend ? totals.planPeriodAdSpend : null;
  totals.adForecastSpend = totals.hasAdForecastSpend ? totals.adForecastSpend : null;
  skuPlanFactFinalizeAdPace(totals, model.monthKey || '', model.elapsedDays || model.periodDays || 0, model.periodStart || '');
  totals.planMarginPct = totals.planMarginWeight > 0 ? totals.planMarginValue / totals.planMarginWeight : null;
  return totals;
}

function skuPlanFactApplyScopedPayrollValues(model = {}, scopedTotals = {}, options = {}) {
  if (!model.payrollKpi) return;
  if (options.truthSource === 'sku_scope') {
    model.totals.apiFactRevenue = 0;
    model.totals.kpiFactDelta = 0;
  }
  model.payrollKpi = {
    ...model.payrollKpi,
    truthSource: options.truthSource || 'sku_scope',
    ownerScoped: options.ownerScoped === true || model.payrollKpi.ownerScoped,
    salaryIncluded: options.salaryIncluded !== undefined ? options.salaryIncluded : model.payrollKpi.salaryIncluded,
    planRevenue: scopedTotals.planRevenue,
    planToDateRevenue: scopedTotals.planToDateRevenue,
    factRevenue: scopedTotals.factRevenue,
    completionToDate: scopedTotals.completionToDate,
    completionMonth: scopedTotals.completionMonth,
    gapToDate: scopedTotals.gapToDate,
    adSpend: scopedTotals.adSpend,
    planAdSpend: scopedTotals.planAdSpend,
    planAdSpendToDate: scopedTotals.planAdSpendToDate,
    planMonthAdSpend: scopedTotals.planMonthAdSpend,
    planPeriodAdSpend: scopedTotals.planPeriodAdSpend,
    adForecastSpend: scopedTotals.adForecastSpend
  };
}

function skuPlanFactApplyPayrollKpiToModel(model = {}) {
  const payroll = skuPlanFactPayrollKpiForModel(model);
  if (!payroll) return model;
  const selectedPlatform = String(payroll.selectedPlatform || model.filters?.platform || 'all').toLowerCase();
  const skipPayrollAlignment = selectedPlatform !== 'all' && !SKU_PLAN_FACT_PAYROLL_ALIGNMENT_PLATFORMS.has(selectedPlatform);
  model.payrollKpi = {
    ...payroll,
    salaryIncluded: skipPayrollAlignment ? false : payroll.salaryIncluded,
    sourceAlignmentSkipped: skipPayrollAlignment,
    truthSource: 'company_plan',
    displayTitle: 'Месячный план и KPI',
    displayNote: 'Корпоративный план: оборот, заказы и рекламный бюджет по зарплатному контуру.'
  };
  if (skipPayrollAlignment || !payroll.salaryIncluded) {
    const scopedTotals = skuPlanFactPayrollMetricTotals(model, payroll.selectedPlatform || 'all');
    model.totals.payrollOriginal = {
      planRevenue: model.totals.planRevenue,
      planToDateRevenue: model.totals.planToDateRevenue,
      factRevenue: model.totals.factRevenue,
      adSpend: model.totals.adSpend,
      planAdSpend: model.totals.planAdSpend,
      planDrr: model.totals.planDrr,
      drr: model.totals.drr,
      marginPct: model.totals.marginPct,
      marginRub: model.totals.marginRub,
      planMarginPct: model.totals.planMarginPct,
      planMarginRub: model.totals.planMarginRub,
      completionToDate: model.totals.completionToDate,
      completionMonth: model.totals.completionMonth,
      gapToDate: model.totals.gapToDate
    };
    model.totals.sourceAlignmentSkipped = skipPayrollAlignment;
    model.totals.planRevenue = scopedTotals.planRevenue;
    model.totals.planToDateRevenue = scopedTotals.planToDateRevenue;
    model.totals.planUnits = scopedTotals.planUnits;
    model.totals.planToDateUnits = scopedTotals.planToDateUnits;
    model.totals.factRevenue = scopedTotals.factRevenue;
    model.totals.factUnits = scopedTotals.factUnits;
    model.totals.avgCheck = scopedTotals.avgCheck;
    model.totals.completionToDate = scopedTotals.completionToDate;
    model.totals.completionMonth = scopedTotals.completionMonth;
    model.totals.gapToDate = scopedTotals.gapToDate;
    model.totals.adSpend = scopedTotals.adSpend;
    model.totals.planAdSpend = scopedTotals.planAdSpend;
    model.totals.planAdSpendToDate = scopedTotals.planAdSpendToDate;
    model.totals.planMonthAdSpend = scopedTotals.planMonthAdSpend;
    model.totals.planPeriodAdSpend = scopedTotals.planPeriodAdSpend;
    model.totals.adForecastSpend = scopedTotals.adForecastSpend;
    model.totals.marginPct = scopedTotals.marginPct;
    model.totals.marginRub = scopedTotals.marginPct === null ? null : model.totals.factRevenue * scopedTotals.marginPct;
    model.totals.planMarginPct = scopedTotals.planMarginPct;
    model.totals.planMarginRub = scopedTotals.planMarginPct === null ? null : model.totals.planToDateRevenue * scopedTotals.planMarginPct;
    model.totals.drr = scopedTotals.drr;
    skuPlanFactFinalizeAdPace(model.totals, model.monthKey || payroll.monthKey || '', model.elapsedDays || payroll.elapsedDays || 0, model.periodStart || payroll.periodStart || '');
    model.totals.planDrr = model.totals.planToDateRevenue > 0 && model.totals.planAdSpend !== null && model.totals.planAdSpend !== undefined
      ? numberOrZero(model.totals.planAdSpend) / model.totals.planToDateRevenue
      : null;
    skuPlanFactApplyScopedPayrollValues(model, scopedTotals, {
      salaryIncluded: false,
      truthSource: 'sku_scope'
    });
    return model;
  }
  const ownerScoped = Boolean(model.filters?.owner && model.filters.owner !== 'all');
  if (ownerScoped) {
    const scopedTotals = skuPlanFactPayrollMetricTotals(model, payroll.selectedPlatform || 'all');
    model.payrollKpi.ownerScoped = true;
    model.totals.payrollOriginal = {
      planRevenue: model.totals.planRevenue,
      planToDateRevenue: model.totals.planToDateRevenue,
      factRevenue: model.totals.factRevenue,
      adSpend: model.totals.adSpend,
      planAdSpend: model.totals.planAdSpend,
      planDrr: model.totals.planDrr,
      drr: model.totals.drr,
      marginPct: model.totals.marginPct,
      marginRub: model.totals.marginRub,
      planMarginPct: model.totals.planMarginPct,
      planMarginRub: model.totals.planMarginRub,
      completionToDate: model.totals.completionToDate,
      completionMonth: model.totals.completionMonth,
      gapToDate: model.totals.gapToDate
    };
    model.totals.planRevenue = scopedTotals.planRevenue;
    model.totals.planToDateRevenue = scopedTotals.planToDateRevenue;
    model.totals.planUnits = scopedTotals.planUnits;
    model.totals.planToDateUnits = scopedTotals.planToDateUnits;
    model.totals.factRevenue = scopedTotals.factRevenue;
    model.totals.factUnits = scopedTotals.factUnits;
    model.totals.avgCheck = scopedTotals.avgCheck;
    model.totals.completionToDate = scopedTotals.completionToDate;
    model.totals.completionMonth = scopedTotals.completionMonth;
    model.totals.gapToDate = scopedTotals.gapToDate;
    model.totals.adSpend = scopedTotals.adSpend;
    model.totals.planAdSpend = scopedTotals.planAdSpend;
    model.totals.planAdSpendToDate = scopedTotals.planAdSpendToDate;
    model.totals.planMonthAdSpend = scopedTotals.planMonthAdSpend;
    model.totals.planPeriodAdSpend = scopedTotals.planPeriodAdSpend;
    model.totals.adForecastSpend = scopedTotals.adForecastSpend;
    model.totals.marginPct = scopedTotals.marginPct;
    model.totals.marginRub = scopedTotals.marginPct === null ? null : model.totals.factRevenue * scopedTotals.marginPct;
    model.totals.planMarginPct = scopedTotals.planMarginPct;
    model.totals.planMarginRub = scopedTotals.planMarginPct === null ? null : model.totals.planToDateRevenue * scopedTotals.planMarginPct;
    model.totals.drr = scopedTotals.drr;
    skuPlanFactFinalizeAdPace(model.totals, model.monthKey || payroll.monthKey || '', model.elapsedDays || payroll.elapsedDays || 0, model.periodStart || payroll.periodStart || '');
    model.totals.planDrr = model.totals.planToDateRevenue > 0 && model.totals.planAdSpend !== null && model.totals.planAdSpend !== undefined
      ? numberOrZero(model.totals.planAdSpend) / model.totals.planToDateRevenue
      : null;
    skuPlanFactApplyScopedPayrollValues(model, scopedTotals, {
      ownerScoped: true,
      truthSource: 'sku_scope'
    });
    return model;
  }
  const rawFactRevenue = numberOrZero(model.totals.factRevenue);
  const rawMarginRub = numberOrZero(model.totals.marginRub);
  const factScale = rawFactRevenue > 0 && payroll.factRevenue > 0 ? payroll.factRevenue / rawFactRevenue : 1;
  const payrollMetricTotals = skuPlanFactPayrollMetricTotals(model, payroll.selectedPlatform || 'all');
  const adSourceTotals = skuPlanFactAdSourceTotals(
    model.monthKey || payroll.monthKey || '',
    payroll.periodEnd || model.periodEnd || model.selectedDate || '',
    payroll.periodStart || model.periodStart || '',
    payroll.selectedPlatform || 'all'
  );
  model.totals.payrollOriginal = {
    planRevenue: model.totals.planRevenue,
    planToDateRevenue: model.totals.planToDateRevenue,
    factRevenue: model.totals.factRevenue,
    adSpend: model.totals.adSpend,
    planAdSpend: model.totals.planAdSpend,
    planDrr: model.totals.planDrr,
    drr: model.totals.drr,
    marginPct: model.totals.marginPct,
    marginRub: model.totals.marginRub,
    planMarginPct: model.totals.planMarginPct,
    planMarginRub: model.totals.planMarginRub,
    completionToDate: model.totals.completionToDate,
    completionMonth: model.totals.completionMonth,
    gapToDate: model.totals.gapToDate
  };
  model.totals.planRevenue = payroll.planRevenue;
  model.totals.planToDateRevenue = payroll.planToDateRevenue;
  model.totals.factRevenue = payroll.factRevenue;
  model.totals.apiFactRevenue = rawFactRevenue;
  model.totals.apiMarginRub = rawMarginRub || null;
  model.totals.apiMarginPct = model.totals.payrollOriginal?.marginPct ?? null;
  model.totals.apiCompletionToDate = model.totals.payrollOriginal?.completionToDate ?? null;
  model.totals.kpiFactRevenue = payroll.factRevenue;
  model.totals.kpiFactDelta = rawFactRevenue > 0 ? payroll.factRevenue - rawFactRevenue : 0;
  model.totals.completionToDate = payroll.completionToDate;
  model.totals.completionMonth = payroll.completionMonth;
  model.totals.gapToDate = payroll.gapToDate;
  if (payroll.selectedPlatform && payroll.selectedPlatform !== 'all') {
    model.totals.adSpend = (adSourceTotals.rows > 0 || adSourceTotals.spend > 0)
      ? adSourceTotals.spend
      : payrollMetricTotals.adSpend;
    model.totals.planAdSpend = payrollMetricTotals.planAdSpend;
    model.totals.planMonthAdSpend = payrollMetricTotals.planMonthAdSpend;
    model.totals.planPeriodAdSpend = payrollMetricTotals.planPeriodAdSpend;
  } else if (adSourceTotals.rows > 0 || adSourceTotals.spend > 0) {
    model.totals.adSpend = adSourceTotals.spend;
    if (payrollMetricTotals.planAdSpend !== null) {
      model.totals.planAdSpend = payrollMetricTotals.planAdSpend;
      model.totals.planMonthAdSpend = payrollMetricTotals.planMonthAdSpend;
      model.totals.planPeriodAdSpend = payrollMetricTotals.planPeriodAdSpend;
    }
  }
  if (payrollMetricTotals.marginPct !== null) {
    model.totals.marginPct = payrollMetricTotals.marginPct;
    model.totals.marginRub = model.totals.factRevenue > 0 ? model.totals.factRevenue * payrollMetricTotals.marginPct : null;
  } else if (rawMarginRub > 0 && factScale > 0) {
    model.totals.marginRub = rawMarginRub * factScale;
    model.totals.marginPct = model.totals.factRevenue > 0 ? model.totals.marginRub / model.totals.factRevenue : model.totals.marginPct;
  }
  if (payrollMetricTotals.planMarginPct !== null) {
    model.totals.planMarginPct = payrollMetricTotals.planMarginPct;
    model.totals.planMarginRub = model.totals.planToDateRevenue > 0 ? model.totals.planToDateRevenue * payrollMetricTotals.planMarginPct : null;
  }
  model.totals.drr = model.totals.factRevenue > 0 ? numberOrZero(model.totals.adSpend) / model.totals.factRevenue : null;
  skuPlanFactFinalizeAdPace(model.totals, model.monthKey || payroll.monthKey || '', model.elapsedDays || payroll.elapsedDays || 0, model.periodStart || payroll.periodStart || '');
  model.totals.planDrr = model.totals.planToDateRevenue > 0 && model.totals.planAdSpend !== null && model.totals.planAdSpend !== undefined
    ? numberOrZero(model.totals.planAdSpend) / model.totals.planToDateRevenue
    : null;
  model.totals.payrollSourceTotals = {
    adSpend: adSourceTotals.spend,
    externalAdSpend: adSourceTotals.externalSpend,
    adRows: adSourceTotals.rows,
    planAdSpend: model.totals.planAdSpend,
    planAdSpendToDate: model.totals.planAdSpendToDate,
    planPeriodAdSpend: model.totals.planPeriodAdSpend,
    adForecastSpend: model.totals.adForecastSpend,
    adForecastCompletion: model.totals.adForecastCompletion,
    planDrr: model.totals.planDrr,
    marginPct: payrollMetricTotals.marginPct,
    planMarginPct: payrollMetricTotals.planMarginPct,
    marginWeight: payrollMetricTotals.marginWeight,
    factRevenue: payrollMetricTotals.factRevenue
  };
  return model;
}

function skuPlanFactAdItemIsExternal(item = {}) {
  const channel = String(item.channel || '').toLowerCase();
  const campaignId = String(item.campaignId || '').toLowerCase();
  const campaignName = String(item.campaignName || '').toLowerCase();
  const externalRu = '\u0432\u043d\u0435\u0448';
  return campaignId.startsWith('external-sheet:')
    || channel.includes(externalRu)
    || channel.includes('external')
    || campaignName.includes(externalRu)
    || campaignName.includes('external');
}

function skuPlanFactAdSourceTotals(monthKey = '', maxFactDate = '', minFactDate = '', platformFilter = 'all') {
  const totals = { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0, rows: 0, externalSpend: 0, externalRows: 0 };
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    const date = String(item?.date || '').slice(0, 10);
    if (skuPlanFactMonthFromDate(date) !== monthKey) return;
    if (minFactDate && date < minFactDate) return;
    if (maxFactDate && date > maxFactDate) return;
    const platform = String(item.platformKey || item.platform || 'wb').toLowerCase();
    const normalizedFilter = String(platformFilter || 'all').toLowerCase();
    const supportFilter = skuPlanFactPlatformSupportKey(normalizedFilter);
    if (normalizedFilter && normalizedFilter !== 'all' && platform !== normalizedFilter && platform !== supportFilter) return;
    const spend = numberOrZero(item.spend);
    if (skuPlanFactAdItemIsExternal(item)) {
      totals.externalSpend += spend;
      totals.externalRows += 1;
      return;
    }
    totals.rows += 1;
    totals.spend += spend;
    totals.views += numberOrZero(item.views);
    totals.clicks += numberOrZero(item.clicks);
    totals.orders += numberOrZero(item.orders);
    totals.revenue += numberOrZero(item.revenue);
  });
  return totals;
}

function skuPlanFactAdIndex(monthKey, maxFactDate = '', minFactDate = '') {
  const map = new Map();
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    if (skuPlanFactAdItemIsExternal(item)) return;
    const date = String(item?.date || '').slice(0, 10);
    if (skuPlanFactMonthFromDate(date) !== monthKey) return;
    if (minFactDate && date < minFactDate) return;
    if (maxFactDate && date > maxFactDate) return;
    const platform = String(item.platformKey || item.platform || 'wb').toLowerCase();
    const token = skuPlanFactArticleToken(item);
    if (!token) return;
    const key = `${platform}|${token}`;
    const row = map.get(key) || { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0, daily: new Map() };
    row.spend += numberOrZero(item.spend);
    row.views += numberOrZero(item.views);
    row.clicks += numberOrZero(item.clicks);
    row.orders += numberOrZero(item.orders);
    row.revenue += numberOrZero(item.revenue);
    const dailyRow = row.daily.get(date) || { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
    dailyRow.spend += numberOrZero(item.spend);
    dailyRow.views += numberOrZero(item.views);
    dailyRow.clicks += numberOrZero(item.clicks);
    dailyRow.orders += numberOrZero(item.orders);
    dailyRow.revenue += numberOrZero(item.revenue);
    row.daily.set(date, dailyRow);
    map.set(key, row);
  });
  return map;
}

function skuPlanFactAdForSku(adIndex, platform = '', sku = {}) {
  const result = { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0, daily: [] };
  const dailyMap = new Map();
  skuPlanFactSkuLookupTokens(sku, platform).forEach((token) => {
    const item = adIndex.get(`${platform}|${token}`);
    if (!item) return;
    result.spend += numberOrZero(item.spend);
    result.views += numberOrZero(item.views);
    result.clicks += numberOrZero(item.clicks);
    result.orders += numberOrZero(item.orders);
    result.revenue += numberOrZero(item.revenue);
    (item.daily instanceof Map ? [...item.daily.entries()] : []).forEach(([date, value]) => {
      const dailyRow = dailyMap.get(date) || { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
      dailyRow.spend += numberOrZero(value?.spend);
      dailyRow.views += numberOrZero(value?.views);
      dailyRow.clicks += numberOrZero(value?.clicks);
      dailyRow.orders += numberOrZero(value?.orders);
      dailyRow.revenue += numberOrZero(value?.revenue);
      dailyMap.set(date, dailyRow);
    });
  });
  result.daily = [...dailyMap.entries()]
    .map(([date, value]) => ({ date, ...value }))
    .sort((left, right) => left.date.localeCompare(right.date));
  return result;
}

function skuPlanFactDailyPlanAdValue(item = {}, platform = '') {
  if (platform === 'wb') {
    return numberOrZero(item.planSpendWb ?? item.iuPlanSpendWb ?? item.managementPlanSpendWb ?? item.contractMarketingPlanWb);
  }
  if (platform === 'ozon') {
    return numberOrZero(item.planSpendOzon ?? item.iuPlanSpendOzon ?? item.iuAdsOzonPlan);
  }
  return 0;
}

function skuPlanFactDailyPlanRevenueValue(item = {}, platform = '') {
  if (platform === 'wb') {
    return numberOrZero(item.targetRevenueWb ?? item.iuRevenueWbPlan ?? item.managementTargetRevenueWb ?? item.contractTargetRevenueWb);
  }
  if (platform === 'ozon') {
    return numberOrZero(item.targetRevenueOzon ?? item.iuRevenueOzonPlan);
  }
  return 0;
}

function skuPlanFactKpiPlanAdValue(kpis = {}, platform = '', period = false) {
  if (platform === 'wb') {
    return numberOrZero(period ? (kpis.planSpendWb ?? kpis.iuAdsPlanToDate) : (kpis.iuAdsPlan ?? kpis.planSpendWb));
  }
  if (platform === 'ozon') {
    return numberOrZero(period ? (kpis.planSpendOzon ?? kpis.iuAdsOzonPlanToDate) : (kpis.iuAdsOzonPlan ?? kpis.planSpendOzon));
  }
  return 0;
}

function skuPlanFactKpiPlanRevenueValue(kpis = {}, platform = '', period = false) {
  if (platform === 'wb') {
    return numberOrZero(period ? (kpis.targetRevenueWb ?? kpis.iuRevenueWbPlanToDate) : kpis.iuRevenueWbPlan);
  }
  if (platform === 'ozon') {
    return numberOrZero(period ? (kpis.targetRevenueOzon ?? kpis.iuRevenueOzonPlanToDate) : kpis.iuRevenueOzonPlan);
  }
  return 0;
}

function skuPlanFactPlatformPlanAdTotals(platform = '', monthKey = '', periodStart = '', periodEnd = '', fullMonth = false) {
  return skuPlanFactCorporatePlanAdTotals(platform, monthKey, periodStart, periodEnd, fullMonth);
}

function skuPlanFactIuDrrDailyValue(item = {}, platform = '', field = '') {
  if (platform === 'wb') {
    if (field === 'planRevenue') return numberOrZero(item.targetRevenueWb ?? item.iuTargetRevenueWb ?? item.iuRevenueWbPlan);
    if (field === 'factRevenue') return numberOrZero(item.iuRevenueWb ?? item.revenueWb);
    if (field === 'planAds') return numberOrZero(item.planSpendWb ?? item.iuPlanSpendWb ?? item.managementPlanSpendWb ?? item.contractMarketingPlanWb);
    if (field === 'factAds') return numberOrZero(item.spendFact ?? item.spendFactDrr);
  }
  if (platform === 'ozon') {
    if (field === 'planRevenue') return numberOrZero(item.targetRevenueOzon ?? item.iuRevenueOzonPlan);
    if (field === 'factRevenue') return numberOrZero(item.revenueOzon);
    if (field === 'planAds') return numberOrZero(item.planSpendOzon ?? item.iuAdsOzonPlan);
    if (field === 'factAds') return numberOrZero(item.spendFactOzon);
  }
  return 0;
}

function skuPlanFactIuDrrControlTotals(platform = '', monthKey = '', periodStart = '', periodEnd = '', fullMonth = false) {
  return null;
}

function skuPlanFactScaleControlledMetric(metric = null, scale = {}, source = '') {
  if (!metric || typeof metric !== 'object') return;
  const factRatio = Number.isFinite(scale.factRevenue) ? scale.factRevenue : 1;
  const planRatio = Number.isFinite(scale.planRevenue) ? scale.planRevenue : 1;
  const periodPlanRatio = Number.isFinite(scale.planToDateRevenue) ? scale.planToDateRevenue : planRatio;
  const adRatio = Number.isFinite(scale.adSpend) ? scale.adSpend : 1;
  const planAdRatio = Number.isFinite(scale.planAdSpend) ? scale.planAdSpend : 1;
  metric.factRevenue = numberOrZero(metric.factRevenue) * factRatio;
  metric.factUnits = numberOrZero(metric.factUnits) * factRatio;
  metric.planRevenue = numberOrZero(metric.planRevenue) * planRatio;
  metric.planUnits = numberOrZero(metric.planUnits) * planRatio;
  metric.iuControlPlanToDateRevenue = numberOrZero(metric.planToDateRevenue) * periodPlanRatio;
  metric.iuControlPlanToDateUnits = numberOrZero(metric.planToDateUnits) * periodPlanRatio;
  metric.adSpend = numberOrZero(metric.adSpend) * adRatio;
  metric.planAdSpend = metric.planAdSpend === null || metric.planAdSpend === undefined
    ? metric.planAdSpend
    : numberOrZero(metric.planAdSpend) * planAdRatio;
  metric.planMonthAdSpend = metric.planMonthAdSpend === null || metric.planMonthAdSpend === undefined
    ? metric.planMonthAdSpend
    : numberOrZero(metric.planMonthAdSpend) * planAdRatio;
  metric.planAdSpendToDate = null;
  metric.planPeriodAdSpend = null;
  metric.adForecastSpend = null;
  metric.adCompletionToDate = null;
  metric.adForecastCompletion = null;
  metric.adGapToDate = null;
  metric.adForecastGap = null;
  if (Array.isArray(metric.factDaily)) {
    metric.factDaily = metric.factDaily.map((item) => ({
      ...item,
      revenue: numberOrZero(item.revenue) * factRatio,
      units: numberOrZero(item.units) * factRatio
    }));
  }
  metric.factAvgCheck = metric.factUnits > 0 ? metric.factRevenue / metric.factUnits : metric.factAvgCheck;
  metric.iuDrrControlApplied = true;
  metric.iuDrrControlSource = source;
}

function skuPlanFactApplyIuDrrControl(rows = [], monthKey = '', periodStart = '', periodEnd = '') {
  return { applied: false, platforms: {}, source: 'company_plan_scope' };
}

function skuPlanFactPlanAdTotalsByPlatform(monthKey = '', periodStart = '', periodEnd = '') {
  return SKU_PLAN_FACT_PLATFORMS.reduce((acc, platform) => {
    acc[platform] = skuPlanFactPlatformPlanAdTotals(platform, monthKey, periodStart, periodEnd, false);
    return acc;
  }, {});
}

function skuPlanFactApplyIuRevenueFloors(rows = [], monthKey = '', periodStart = '', periodEnd = '') {
  return;
}

function skuPlanFactApplyCorporateRevenuePlan(rows = [], monthKey = '', periodStart = '', periodEnd = '') {
  SKU_PLAN_FACT_PAYROLL_PLATFORMS.forEach((platform) => {
    const monthPlan = skuPlanFactPayrollPlanRevenue(monthKey, platform);
    if (!(monthPlan > 0)) return;
    const monthDays = skuPlanFactMonthDays(monthKey);
    const monthStart = skuPlanFactMonthStart(monthKey);
    const monthEnd = skuPlanFactMonthEnd(monthKey);
    const start = skuPlanFactClampDateToRange(periodStart || monthStart, monthStart, monthEnd);
    const end = skuPlanFactClampDateToRange(periodEnd || monthEnd, monthStart, monthEnd);
    const elapsedDays = skuPlanFactInclusiveDays(start, end);
    const periodPlan = monthDays > 0 ? monthPlan * elapsedDays / monthDays : monthPlan;
    const allMetricEntries = (rows || [])
      .map((row) => ({ row, metric: row?.platforms?.[platform] || row?.[platform] || null }))
      .filter((item) => item.metric && skuPlanFactKpiEligible(item.row));
    const activeMetricEntries = allMetricEntries.filter(({ metric }) => skuPlanFactPlatformHasActivity(metric));
    const metricEntries = activeMetricEntries.length
      ? activeMetricEntries
      : allMetricEntries.filter(({ row }) => skuPlanFactOwnerIsFilterOption(skuPlanFactScopedOwner(row, platform)));
    const metrics = metricEntries.map((item) => item.metric);
    if (!metrics.length) return;
    const currentMonth = metrics.reduce((sum, metric) => sum + numberOrZero(metric.planRevenue), 0);
    const currentPeriod = metrics.reduce((sum, metric) => sum + numberOrZero(metric.planToDateRevenue), 0);
    if (currentMonth <= 0 && currentPeriod <= 0) {
      const priceProxies = metrics
        .map((metric) => skuPlanFactPlatformPriceProxy(metric))
        .filter((value) => Number.isFinite(value) && value > 0);
      const platformPriceProxy = priceProxies.length
        ? priceProxies.reduce((sum, value) => sum + value, 0) / priceProxies.length
        : 0;
      const items = metrics.map((metric) => {
        const priceProxy = skuPlanFactPlatformPriceProxy(metric) || platformPriceProxy || 0;
        const weight = skuPlanFactPlatformAllocationWeight(metric, platformPriceProxy);
        return { metric, priceProxy, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 };
      });
      const weightSum = items.reduce((sum, item) => sum + item.weight, 0) || Math.max(1, items.length);
      items.forEach((item) => {
        const metric = item.metric;
        const share = item.weight / weightSum;
        metric.planRevenue = monthPlan * share;
        metric.planToDateRevenue = periodPlan * share;
        if (item.priceProxy > 0) {
          metric.planUnits = metric.planRevenue / item.priceProxy;
          metric.planToDateUnits = metric.planToDateRevenue / item.priceProxy;
          metric.planAvgCheck = item.priceProxy;
        }
        metric.corporatePlanApplied = true;
        metric.corporatePlanAllocated = true;
        metric.corporatePlanSource = 'company_plan';
        metric.completionToDate = metric.planToDateRevenue > 0 ? numberOrZero(metric.factRevenue) / metric.planToDateRevenue : null;
        metric.completionMonth = metric.planRevenue > 0 ? numberOrZero(metric.factRevenue) / metric.planRevenue : null;
        metric.gapToDate = numberOrZero(metric.factRevenue) - metric.planToDateRevenue;
        const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
        metric.planMarginRub = planMarginPct === null ? null : metric.planToDateRevenue * planMarginPct;
      });
      return;
    }
    const monthScale = currentMonth > 0 ? monthPlan / currentMonth : 1;
    const periodScale = currentPeriod > 0 ? periodPlan / currentPeriod : monthScale;
    const hasMonthScale = Number.isFinite(monthScale) && Math.abs(monthScale - 1) > 0.0001;
    const hasPeriodScale = Number.isFinite(periodScale) && Math.abs(periodScale - 1) > 0.0001;
    if (!hasMonthScale && !hasPeriodScale) return;
    metrics.forEach((metric) => {
      if (Number.isFinite(monthScale)) {
        metric.planRevenue = numberOrZero(metric.planRevenue) * monthScale;
        metric.planUnits = numberOrZero(metric.planUnits) * monthScale;
      }
      if (Number.isFinite(periodScale)) {
        metric.planToDateRevenue = numberOrZero(metric.planToDateRevenue) * periodScale;
        metric.planToDateUnits = numberOrZero(metric.planToDateUnits) * periodScale;
      }
      metric.corporatePlanApplied = true;
      metric.corporatePlanSource = 'company_plan';
      metric.completionToDate = metric.planToDateRevenue > 0 ? numberOrZero(metric.factRevenue) / metric.planToDateRevenue : null;
      metric.completionMonth = metric.planRevenue > 0 ? numberOrZero(metric.factRevenue) / metric.planRevenue : null;
      metric.gapToDate = numberOrZero(metric.factRevenue) - metric.planToDateRevenue;
      const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
      metric.planMarginRub = planMarginPct === null ? null : metric.planToDateRevenue * planMarginPct;
    });
  });
}

function skuPlanFactCompanyPlanChannel(monthKey = '', platform = '') {
  const plan = skuPlanFactPayrollCompanyPlan() || state.companyPlan || state.dashboard?.companyPlan || null;
  const channels = plan?.months?.[monthKey]?.channels || {};
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  return channels[platform] || channels[supportKey] || null;
}

function skuPlanFactApplyCompanyPlanZeroChannels(rows = [], monthKey = '') {
  if (!monthKey) return;
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    if (SKU_PLAN_FACT_PAYROLL_PLATFORMS.includes(platform)) return;
    const channel = skuPlanFactCompanyPlanChannel(monthKey, platform);
    if (!channel || channel.salaryIncluded !== false || numberOrZero(channel.revenue) > 0) return;
    (rows || []).forEach((row) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      if (!metric) return;
      metric.planRevenue = 0;
      metric.planUnits = 0;
      metric.planToDateRevenue = 0;
      metric.planToDateUnits = 0;
      metric.planAvgCheck = null;
      metric.planAdSpend = null;
      metric.planMonthAdSpend = null;
      metric.planPeriodAdSpend = null;
      metric.planDrr = null;
      metric.planMonthDrr = null;
      metric.completionToDate = null;
      metric.completionMonth = null;
      metric.gapToDate = numberOrZero(metric.factRevenue);
      metric.planMarginRub = 0;
      metric.companyPlanZeroApplied = true;
      metric.companyPlanZeroSource = 'company_plan';
    });
  });
}

function skuPlanFactAdForecastDays(monthKey = '', elapsedDays = 0, periodStart = '') {
  const observedDays = Math.max(1, Math.round(numberOrZero(elapsedDays)) || 1);
  const monthDays = Math.max(1, skuPlanFactMonthDays(monthKey));
  const start = skuPlanFactDateKey(periodStart);
  if (start && start !== skuPlanFactMonthStart(monthKey)) return observedDays;
  return monthDays;
}

function skuPlanFactFinalizeAdPace(metric = {}, monthKey = '', elapsedDays = 0, periodStart = '') {
  if (!metric || typeof metric !== 'object') return metric;
  const observedDays = Math.max(1, Math.round(numberOrZero(elapsedDays)) || 1);
  const forecastDays = skuPlanFactAdForecastDays(monthKey, observedDays, periodStart);
  const hasPlanToDate = metric.planAdSpend !== null && metric.planAdSpend !== undefined;
  const hasMonthPlan = metric.planMonthAdSpend !== null && metric.planMonthAdSpend !== undefined;
  const hasPeriodPlan = metric.planPeriodAdSpend !== null && metric.planPeriodAdSpend !== undefined;
  const planToDate = hasPlanToDate ? numberOrZero(metric.planAdSpend) : null;
  const monthPlan = hasMonthPlan ? numberOrZero(metric.planMonthAdSpend) : null;
  const existingPeriodPlan = hasPeriodPlan ? numberOrZero(metric.planPeriodAdSpend) : null;
  const derivedPeriodPlan = planToDate !== null && observedDays > 0
    ? planToDate * forecastDays / observedDays
    : null;
  const planPeriod = existingPeriodPlan !== null
    ? existingPeriodPlan
    : (monthPlan !== null ? monthPlan : (forecastDays > observedDays ? derivedPeriodPlan : planToDate));
  const adSpend = numberOrZero(metric.adSpend);
  const hasAdContext = adSpend > 0 || planToDate !== null || planPeriod !== null;
  const forecastSpend = hasAdContext ? adSpend * forecastDays / observedDays : null;

  metric.planAdSpendToDate = planToDate;
  metric.planPeriodAdSpend = planPeriod;
  metric.adElapsedDays = hasAdContext ? observedDays : 0;
  metric.adForecastDays = hasAdContext ? forecastDays : 0;
  metric.adForecastSpend = forecastSpend;
  metric.adCompletionToDate = planToDate !== null && planToDate > 0 ? adSpend / planToDate : null;
  metric.adForecastCompletion = planPeriod !== null && planPeriod > 0 && forecastSpend !== null ? forecastSpend / planPeriod : null;
  metric.adGapToDate = planToDate !== null ? adSpend - planToDate : null;
  metric.adForecastGap = planPeriod !== null && forecastSpend !== null ? forecastSpend - planPeriod : null;
  return metric;
}

function skuPlanFactApplyPlannedAdSpend(rows = [], monthKey = '', periodStart = '', periodEnd = '') {
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const periodPlan = skuPlanFactPlatformPlanAdTotals(platform, monthKey, periodStart, periodEnd, false);
    const monthPlan = skuPlanFactPlatformPlanAdTotals(platform, monthKey, periodStart, periodEnd, true);
    const hasPeriodPlan = periodPlan.spend !== null || periodPlan.drr !== null;
    const hasMonthPlan = monthPlan.spend !== null || monthPlan.drr !== null;
    const metrics = (rows || [])
      .map((row) => ({ row, metric: row.platforms?.[platform] || row[platform] || null }))
      .filter(({ row, metric }) => metric && skuPlanFactKpiEligible(row) && skuPlanFactPlatformHasActivity(metric))
      .map(({ metric }) => metric);

    const periodWeightSum = metrics.reduce((sum, metric) => (
      sum + (numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue) || numberOrZero(metric.factRevenue))
    ), 0);
    const monthWeightSum = metrics.reduce((sum, metric) => (
      sum + (numberOrZero(metric.planRevenue) || numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.factRevenue))
    ), 0);

    metrics.forEach((metric) => {
      const periodWeight = numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue) || numberOrZero(metric.factRevenue);
      const monthWeight = numberOrZero(metric.planRevenue) || numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.factRevenue);
      metric.planAdSpend = hasPeriodPlan && periodPlan.spend !== null && periodWeightSum > 0
        ? periodPlan.spend * periodWeight / periodWeightSum
        : null;
      metric.planMonthAdSpend = hasMonthPlan && monthPlan.spend !== null && monthWeightSum > 0
        ? monthPlan.spend * monthWeight / monthWeightSum
        : null;
      metric.planDrr = periodPlan.drr !== null ? periodPlan.drr : null;
      metric.planMonthDrr = monthPlan.drr !== null ? monthPlan.drr : null;
      metric.planAdSource = periodPlan.source || monthPlan.source || '';
    });
  });
}

function skuPlanFactApplyAggregateAdSpend(rows = [], monthKey = '', platform = '', elapsedDays = 0, periodStart = '', periodEnd = '') {
  if (platform !== 'ozon') return;
  const sourceTotals = skuPlanFactAdSourceTotals(monthKey, periodEnd, periodStart, platform);
  const sourceSpend = numberOrZero(sourceTotals.spend);
  if (!(sourceSpend > 0)) return;
  const metrics = (rows || [])
    .map((row) => ({ row, metric: row.platforms?.[platform] || row[platform] || null }))
    .filter(({ row, metric }) => metric && skuPlanFactKpiEligible(row) && skuPlanFactPlatformHasActivity(metric))
    .map(({ metric }) => metric);
  if (!metrics.length) return;
  const rowSpend = metrics.reduce((sum, metric) => sum + numberOrZero(metric.adSpend), 0);
  if (rowSpend > sourceSpend * 0.05) return;
  const weights = metrics.map((metric) => (
    numberOrZero(metric.factRevenue)
    || numberOrZero(metric.planToDateRevenue)
    || numberOrZero(metric.planRevenue)
    || numberOrZero(metric.factUnits)
    || numberOrZero(metric.planUnits)
    || 0
  ));
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  if (!(weightSum > 0)) return;
  metrics.forEach((metric, index) => {
    const allocated = sourceSpend * weights[index] / weightSum;
    metric.adSpend = allocated;
    metric.aggregateAdSpendAllocated = true;
    metric.aggregateAdSpendSource = 'ozon_seller_finance_api';
    metric.drr = numberOrZero(metric.factRevenue) > 0 ? metric.adSpend / numberOrZero(metric.factRevenue) : null;
    skuPlanFactFinalizePlatformMetric(metric, monthKey, elapsedDays, periodStart, periodEnd);
  });
}

function skuPlanFactPlatformPriceProxy(metric = {}) {
  const values = [
    metric.planAvgCheck,
    metric.factAvgCheck,
    metric.currentClientPrice,
    metric.currentPrice,
    metric.currentFillPrice,
    metric.price
  ];
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function skuPlanFactPlatformHasActivity(metric = {}) {
  return Boolean(
    metric?.hasSource
    || Number(metric?.factRevenue) > 0
    || Number(metric?.factUnits) > 0
    || Number(metric?.adSpend) > 0
    || Number(metric?.substitutionViews) > 0
    || Number(metric?.substitutionOrders) > 0
    || Number(metric?.planRevenue) > 0
    || Number(metric?.planUnits) > 0
    || Number(metric?.currentPrice) > 0
    || Number(metric?.currentClientPrice) > 0
    || Number(metric?.stock) > 0
  );
}

function skuPlanFactPlatformAllocationWeight(metric = {}, platformPriceProxy = 0) {
  if (!skuPlanFactPlatformHasActivity(metric)) return 0;
  const priceProxy = skuPlanFactPlatformPriceProxy(metric) || platformPriceProxy || 0;
  const factRevenue = numberOrZero(metric.factRevenue);
  if (factRevenue > 0) return factRevenue;
  const factUnits = numberOrZero(metric.factUnits);
  if (factUnits > 0 && priceProxy > 0) return factUnits * priceProxy;
  if (priceProxy > 0) return priceProxy;
  return 1;
}

function skuPlanFactPeriodDayIndex(date = '', monthKey = '', periodStart = '') {
  const start = skuPlanFactDateKey(periodStart);
  const key = skuPlanFactDateKey(date);
  if (start && key && skuPlanFactMonthFromDate(start) === monthKey && skuPlanFactMonthFromDate(key) === monthKey) {
    return skuPlanFactInclusiveDays(start, key);
  }
  const monthDays = Math.max(1, skuPlanFactMonthDays(monthKey));
  return Math.min(monthDays, Math.max(1, Number(String(key || date || '').slice(8, 10)) || 1));
}

function skuPlanFactBuildScoreHistory(metric = {}, monthKey = '', periodStart = '', periodEnd = '') {
  const start = skuPlanFactDateKey(periodStart);
  const end = skuPlanFactDateKey(periodEnd);
  const daily = (Array.isArray(metric.factDaily) ? metric.factDaily : [])
    .filter((item) => {
      const date = skuPlanFactDateKey(item?.date);
      if (!date) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  if (!daily.length) {
    return metric.factRevenue > 0 || metric.planToDateRevenue > 0
      ? [{
        date: end || (monthKey ? `${monthKey}-${String(Math.max(1, Math.round(metric.planToDateRevenue > 0 && metric.planRevenue > 0 ? metric.planToDateRevenue / metric.planRevenue * skuPlanFactMonthDays(monthKey) : 1))).padStart(2, '0')}` : ''),
        revenue: numberOrZero(metric.factRevenue),
        units: numberOrZero(metric.factUnits),
        planToDateRevenue: numberOrZero(metric.planToDateRevenue),
        completionToDate: metric.completionToDate ?? null
      }]
      : [];
  }
  const monthDays = Math.max(1, skuPlanFactMonthDays(monthKey));
  let revenue = 0;
  let units = 0;
  return daily.map((item) => {
    revenue += numberOrZero(item.revenue);
    units += numberOrZero(item.units);
    const day = skuPlanFactPeriodDayIndex(item.date || '', monthKey, start);
    const planToDateRevenue = numberOrZero(metric.planRevenue) > 0 ? numberOrZero(metric.planRevenue) * day / monthDays : 0;
    return {
      date: item.date || '',
      revenue,
      units,
      planToDateRevenue,
      completionToDate: planToDateRevenue > 0 ? revenue / planToDateRevenue : null
    };
  });
}

function skuPlanFactCompletionDelta(history = []) {
  const points = (history || []).filter((item) => item.completionToDate !== null && item.completionToDate !== undefined);
  if (points.length < 2) return null;
  return points[points.length - 1].completionToDate - points[points.length - 2].completionToDate;
}

function skuPlanFactMergeDailyIntoMap(map = new Map(), daily = [], scale = 1) {
  (daily || []).forEach((item) => {
    const date = String(item?.date || '').slice(0, 10);
    if (!date) return;
    const row = map.get(date) || { units: 0, revenue: 0 };
    row.units += numberOrZero(item.units) * scale;
    row.revenue += numberOrZero(item.revenue) * scale;
    map.set(date, row);
  });
  return map;
}

function skuPlanFactFinalizePlatformMetric(metric = {}, monthKey = '', elapsedDays = 0, periodStart = '', periodEnd = '') {
  if (!metric || typeof metric !== 'object') return metric;
  const days = Math.max(1, skuPlanFactMonthDays(monthKey));
  const planAvgCheck = Number(metric.planAvgCheck);
  if (!Number.isFinite(planAvgCheck) || planAvgCheck <= 0) {
    const proxy = skuPlanFactPlatformPriceProxy(metric) || numberOrZero(metric.factAvgCheck);
    metric.planAvgCheck = proxy > 0 ? proxy : null;
  } else {
    metric.planAvgCheck = planAvgCheck;
  }
  metric.planUnits = numberOrZero(metric.planUnits);
  metric.planRevenue = numberOrZero(metric.planRevenue);
  if (metric.planUnits > 0 && metric.planRevenue <= 0 && Number.isFinite(Number(metric.planAvgCheck)) && Number(metric.planAvgCheck) > 0) {
    metric.planRevenue = metric.planUnits * Number(metric.planAvgCheck);
  }
  const controlledPlanToDateRevenue = Number(metric.iuControlPlanToDateRevenue);
  const controlledPlanToDateUnits = Number(metric.iuControlPlanToDateUnits);
  metric.planToDateUnits = Number.isFinite(controlledPlanToDateUnits)
    ? controlledPlanToDateUnits
    : (metric.planUnits > 0 ? metric.planUnits * elapsedDays / days : 0);
  metric.planToDateRevenue = Number.isFinite(controlledPlanToDateRevenue)
    ? controlledPlanToDateRevenue
    : (metric.planRevenue > 0 ? metric.planRevenue * elapsedDays / days : 0);
  metric.completionToDate = metric.planToDateRevenue > 0 ? metric.factRevenue / metric.planToDateRevenue : null;
  metric.completionMonth = metric.planRevenue > 0 ? metric.factRevenue / metric.planRevenue : null;
  metric.gapToDate = metric.factRevenue - metric.planToDateRevenue;
  metric.drr = metric.factRevenue > 0 ? metric.adSpend / metric.factRevenue : null;
  metric.adsDrr = metric.adRevenue > 0 ? metric.adSpend / metric.adRevenue : null;
  metric.substitutionViews = numberOrZero(metric.substitutionViews);
  metric.substitutionCarts = numberOrZero(metric.substitutionCarts);
  metric.substitutionOrders = numberOrZero(metric.substitutionOrders);
  metric.substitutionFavorites = numberOrZero(metric.substitutionFavorites);
  metric.substitutionCount = numberOrZero(metric.substitutionCount);
  metric.substitutionCampaignCount = numberOrZero(metric.substitutionCampaignCount);
  metric.substitutionCartRate = metric.substitutionViews > 0 ? metric.substitutionCarts / metric.substitutionViews : null;
  metric.substitutionOrderRate = metric.substitutionViews > 0 ? metric.substitutionOrders / metric.substitutionViews : null;
  metric.substitutionTop = Array.isArray(metric.substitutionTop) ? metric.substitutionTop : [];
  metric.marginPct = skuPlanFactNormalizeRatio(metric.marginPct);
  metric.marginRub = metric.marginPct === null ? null : metric.factRevenue * metric.marginPct;
  metric.factMarginPct = skuPlanFactNormalizeRatio(metric.factMarginPct);
  metric.planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
  metric.planMarginRub = metric.planMarginPct === null ? null : metric.planToDateRevenue * metric.planMarginPct;
  metric.planAdSpend = metric.planAdSpend === null || metric.planAdSpend === undefined ? null : numberOrZero(metric.planAdSpend);
  metric.planMonthAdSpend = metric.planMonthAdSpend === null || metric.planMonthAdSpend === undefined ? null : numberOrZero(metric.planMonthAdSpend);
  skuPlanFactFinalizeAdPace(metric, monthKey, elapsedDays, periodStart);
  metric.planDrr = skuPlanFactNormalizeRatio(metric.planDrr);
  metric.planMonthDrr = skuPlanFactNormalizeRatio(metric.planMonthDrr);
  metric.scoreHistory = skuPlanFactBuildScoreHistory(metric, monthKey, periodStart, periodEnd);
  metric.completionDelta = skuPlanFactCompletionDelta(metric.scoreHistory);
  return metric;
}

function skuPlanFactAllocatePlatformPlan(rows = [], monthKey = '', platform = '', elapsedDays = 0, periodStart = '', periodEnd = '') {
  if (SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS.has(platform)) return;
  const totalUnits = skuPlanFactPlatformPlanUnits(monthKey, platform);
  if (!Number.isFinite(totalUnits) || totalUnits <= 0) return;

  const candidates = (rows || [])
    .map((row) => ({ row, metric: row?.platforms?.[platform] || row?.[platform] || null }))
    .filter(({ row, metric }) => skuPlanFactKpiEligible(row) && skuPlanFactPlatformHasActivity(metric))
    .map(({ metric }) => metric);
  if (!candidates.length) return;

  const priceProxies = candidates
    .map((metric) => skuPlanFactPlatformPriceProxy(metric))
    .filter((value) => Number.isFinite(value) && value > 0);
  const platformPriceProxy = priceProxies.length
    ? priceProxies.reduce((sum, value) => sum + value, 0) / priceProxies.length
    : 0;
  const roundedTotalUnits = Math.max(0, Math.round(totalUnits));
  const items = candidates.map((metric) => {
    const priceProxy = skuPlanFactPlatformPriceProxy(metric) || platformPriceProxy || 0;
    const weight = skuPlanFactPlatformAllocationWeight(metric, platformPriceProxy);
    return { metric, priceProxy, weight };
  });
  const weightSum = items.reduce((sum, item) => sum + (Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 0), 0);
  const fallbackWeight = weightSum > 0 ? 0 : 1;
  const distributable = items.map((item, index) => {
    const weight = fallbackWeight ? 1 : item.weight;
    const rawUnits = weightSum > 0
      ? roundedTotalUnits * (weight > 0 ? weight : 0) / weightSum
      : roundedTotalUnits / Math.max(1, items.length);
    const floorUnits = Math.floor(rawUnits);
    return {
      ...item,
      index,
      rawUnits,
      floorUnits,
      fraction: rawUnits - floorUnits,
      units: floorUnits
    };
  });
  let assignedUnits = distributable.reduce((sum, item) => sum + item.units, 0);
  let remainder = Math.max(0, roundedTotalUnits - assignedUnits);
  distributable
    .sort((left, right) => right.fraction - left.fraction || right.weight - left.weight || left.index - right.index)
    .slice(0, remainder)
    .forEach((item) => { item.units += 1; });

  distributable.forEach((item) => {
    const metric = item.metric;
    const fallbackPrice = platformPriceProxy || numberOrZero(metric.factAvgCheck) || 0;
    const priceProxy = item.priceProxy || fallbackPrice;
    metric.planUnits = item.units;
    metric.planAvgCheck = priceProxy > 0 ? priceProxy : null;
    metric.planRevenue = metric.planUnits > 0 && priceProxy > 0 ? metric.planUnits * priceProxy : 0;
    metric.hasDirectPlan = false;
    skuPlanFactFinalizePlatformMetric(metric, monthKey, elapsedDays, periodStart, periodEnd);
  });
}

function skuPlanFactPlatformMetrics(sku, platform, monthKey, indexes, adIndex, elapsedDays, maxFactDate = '', minFactDate = '') {
  const smartRows = skuPlanFactRowsForSkuIndex(indexes.smart?.[platform], sku, platform);
  const overlayRows = skuPlanFactRowsForSkuIndex(indexes.overlay?.[platform], sku, platform);
  const supportRows = skuPlanFactRowsForSkuIndex(indexes.support?.[platform], sku, platform);
  const pricesRows = skuPlanFactRowsForSkuIndex(indexes.prices?.[platform], sku, platform);
  const extraRows = skuPlanFactRowsForSkuIndex(indexes.extra?.[platform], sku, platform);
  const sourceRows = skuPlanFactRowsForSkuArray(skuPlanFactPlatformSourceRows(indexes, platform), sku, platform);
  const planRows = skuPlanFactRowsForSkuArray(skuPlanFactPlatformPlanRows(indexes, platform, monthKey), sku, platform);
  const hasDirectApiFact = skuPlanFactPlatformHasDirectApiFact(indexes, platform);
  const apiFactRows = hasDirectApiFact ? extraRows : [];
  const factRows = hasDirectApiFact ? apiFactRows : (sourceRows.length ? sourceRows : (overlayRows.length ? overlayRows : (smartRows.length ? smartRows : (pricesRows.length ? pricesRows : extraRows))));
  const plan = SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS.has(platform)
    ? skuPlanFactPlanFromRows(planRows, monthKey)
    : { units: 0, revenue: 0, avgCheck: null, days: skuPlanFactMonthDays(monthKey), source: '' };
  const fact = skuPlanFactFactFromRows(factRows, monthKey, maxFactDate, minFactDate);
  const ad = skuPlanFactAdForSku(adIndex, platform, sku);
  const wbSubstitution = platform === 'wb' ? skuPlanFactWbSubstitutionForSku(sku) : null;
  const planToDateRevenue = plan.revenue > 0 ? plan.revenue * elapsedDays / Math.max(1, plan.days) : 0;
  const planToDateUnits = plan.units > 0 ? plan.units * elapsedDays / Math.max(1, plan.days) : 0;
  const supportKey = skuPlanFactPlatformSupportKey(platform);
  const fallbackSide = sku?.[platform] || sku?.[supportKey] || {};
  const turnoverDays = skuPlanFactLatestMetric(sourceRows, ['turnoverCurrentDays', 'turnoverDays'])
    ?? (Number.isFinite(Number(fallbackSide.turnoverDays)) ? Number(fallbackSide.turnoverDays) : null);
  const stock = skuPlanFactLatestMetric(sourceRows, ['stock', 'stockRepricer'])
    ?? (Number.isFinite(Number(fallbackSide.stock)) ? Number(fallbackSide.stock) : null);
  const factMarginPct = skuPlanFactLatestMetric(sourceRows, ['avgMargin7dPct', 'marginTotalPct', 'marginPct'])
    ?? (Number.isFinite(Number(fallbackSide.marginPct)) ? Number(fallbackSide.marginPct) : null);
  const planMargin = skuPlanFactPlanMarginForSku(sku, platform, { sourceRows, supportRows, pricesRows, overlayRows, smartRows });
  if (planMargin.value === null) {
    const siblingPriceRows = SKU_PLAN_FACT_PLATFORMS
      .filter((item) => item !== platform)
      .flatMap((item) => skuPlanFactRowsForSkuIndex(indexes.prices?.[item], sku, item));
    const siblingMargin = skuPlanFactFirstRatioFromRows(siblingPriceRows);
    if (siblingMargin !== null) {
      planMargin.value = siblingMargin;
      planMargin.source = 'cross-platform-price-economics';
    }
  }
  const effectiveMargin = skuPlanFactEffectiveMargin(platform, factMarginPct, planMargin.value);
  const currentPrice = skuPlanFactLatestMetric(sourceRows, ['currentFillPrice', 'currentPrice', 'currentClientPrice', 'price'])
    ?? (Number.isFinite(Number(fallbackSide.currentPrice)) ? Number(fallbackSide.currentPrice) : null);
  const currentClientPrice = skuPlanFactLatestMetric(sourceRows, ['currentClientPrice', 'currentPrice', 'price'])
    ?? (Number.isFinite(Number(fallbackSide.currentClientPrice)) ? Number(fallbackSide.currentClientPrice) : currentPrice);
  const priceProxy = plan.avgCheck
    || currentClientPrice
    || currentPrice
    || (fact.avgCheck > 0 ? fact.avgCheck : null);

  return {
    platform,
    label: skuPlanFactPlatformLabel(platform),
    planUnits: plan.units,
    planRevenue: plan.revenue,
    planAvgCheck: plan.avgCheck || priceProxy || null,
    planToDateUnits,
    planToDateRevenue,
    factUnits: fact.units,
    factRevenue: fact.revenue,
    factAvgCheck: fact.avgCheck,
    factDaily: fact.daily || [],
    completionToDate: planToDateRevenue > 0 ? fact.revenue / planToDateRevenue : null,
    completionMonth: plan.revenue > 0 ? fact.revenue / plan.revenue : null,
    gapToDate: fact.revenue - planToDateRevenue,
    adSpend: ad.spend,
    adViews: ad.views,
    adClicks: ad.clicks,
    adOrders: ad.orders,
    adRevenue: ad.revenue,
    adDaily: ad.daily || [],
    substitutionViews: wbSubstitution?.views || 0,
    substitutionCarts: wbSubstitution?.carts || 0,
    substitutionOrders: wbSubstitution?.orders || 0,
    substitutionFavorites: wbSubstitution?.favorites || 0,
    substitutionCount: wbSubstitution?.substitutionCount || 0,
    substitutionCampaignCount: wbSubstitution?.campaignCount || 0,
    substitutionCartRate: wbSubstitution?.cartRate ?? null,
    substitutionOrderRate: wbSubstitution?.orderRate ?? null,
    substitutionTop: wbSubstitution?.topSubstitutions || [],
    substitutionSource: wbSubstitution?.source || '',
    drr: fact.revenue > 0 ? ad.spend / fact.revenue : null,
    adsDrr: ad.revenue > 0 ? ad.spend / ad.revenue : null,
    turnoverDays,
    stock,
    factMarginPct: skuPlanFactRatioOrNull(factMarginPct),
    marginPct: effectiveMargin.value,
    planMarginPct: planMargin.value,
    planMarginRub: planMargin.value === null ? null : planToDateRevenue * planMargin.value,
    marginIsPlanFallback: effectiveMargin.isPlanFallback,
    marginSource: effectiveMargin.isPlanFallback ? (planMargin.source || 'plan-margin') : 'fact-margin',
    planMarginSource: planMargin.source || '',
    currentPrice,
    currentClientPrice,
    currentFillPrice: currentPrice,
    hasSource: Boolean(sourceRows.length || factRows.length || planRows.length || Number(currentPrice) > 0 || Number(currentClientPrice) > 0 || Number(stock) > 0 || Number(ad.spend) > 0 || Number(wbSubstitution?.views) > 0 || Number(wbSubstitution?.orders) > 0),
    planPriceProxy: priceProxy,
    hasDirectPlan: Boolean(SKU_PLAN_FACT_DIRECT_PLAN_PLATFORMS.has(platform) && (plan.units > 0 || plan.revenue > 0)),
    source: [fact.source || plan.source || '', wbSubstitution ? 'wb-substitution-traffic' : ''].filter(Boolean).join('+')
  };
}

function skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays, maxFactDate = '', minFactDate = '') {
  const platforms = {};
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    platforms[platform] = skuPlanFactFinalizePlatformMetric(
      skuPlanFactPlatformMetrics(sku, platform, monthKey, indexes, adIndex, elapsedDays, maxFactDate, minFactDate),
      monthKey,
      elapsedDays,
      minFactDate,
      maxFactDate
    );
  });
  const matrixEntry = typeof skuMatrixEntryForSku === 'function' ? skuMatrixEntryForSku(sku) : null;
  const matrixProblemState = typeof skuMatrixProblemState === 'function' ? skuMatrixProblemState(sku) : (sku?.__skuPlanFactUnmapped ? 'api_unmapped' : 'ok');
  const matrixProblemMeta = typeof skuMatrixProblemMeta === 'function'
    ? skuMatrixProblemMeta(matrixProblemState)
    : { label: matrixProblemState, tone: '' };
  const statusMeta = skuOperationalStatusMeta(sku);
  const matrixStatus = typeof skuMatrixStatusLabel === 'function' ? skuMatrixStatusLabel(sku, '') : '';
  const ownerBase = ownerName(sku) || 'Без owner';
  const ownerByPlatform = skuPlanFactOwnerMapForSku(sku);
  const costPrice = [
    sku?.costPrice,
    sku?.cost,
    sku?.costRub,
    sku?.wb?.costPrice,
    sku?.wb?.cost,
    sku?.wb?.costRub,
    sku?.ozon?.costPrice,
    sku?.ozon?.cost,
    sku?.ozon?.costRub,
    sku?.ym?.costPrice,
    sku?.ym?.cost,
    sku?.ym?.costRub
  ].map((value) => numberOrZero(value)).find((value) => value > 0) || null;
  const row = {
    sku,
    articleKey: skuPrimaryKey(sku),
    article: sku.article || sku.articleKey || '',
    name: sku.name || '',
    owner: ownerBase,
    ownerBase,
    ownerByPlatform,
    ownersByPlatform: ownerByPlatform,
    status: statusMeta.label || matrixStatus || '',
    matrixEntry,
    matrixProblemState,
    matrixProblemMeta,
    matrixStatus,
    costPrice,
    cost: costPrice,
    costRub: costPrice,
    syntheticUnmapped: Boolean(sku.__skuPlanFactUnmapped),
    platforms
  };
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    row[platform] = platforms[platform];
  });
  return skuPlanFactFinalizeRow(row, monthKey, elapsedDays, minFactDate, maxFactDate);
}

function skuPlanFactFinalizeRow(row = {}, monthKey = '', elapsedDays = 0, periodStart = '', periodEnd = '') {
  const platforms = SKU_PLAN_FACT_PLATFORMS.map((platform) => row.platforms?.[platform] || row[platform]).filter(Boolean);
  platforms.forEach((metric) => skuPlanFactFinalizePlatformMetric(metric, monthKey, elapsedDays, periodStart, periodEnd));
  const totals = platforms.reduce((acc, metric) => {
    acc.planUnits += numberOrZero(metric.planUnits);
    acc.planRevenue += numberOrZero(metric.planRevenue);
    acc.planToDateRevenue += numberOrZero(metric.planToDateRevenue);
    acc.factUnits += numberOrZero(metric.factUnits);
    acc.factRevenue += numberOrZero(metric.factRevenue);
    acc.adSpend += numberOrZero(metric.adSpend);
    acc.substitutionViews += numberOrZero(metric.substitutionViews);
    acc.substitutionCarts += numberOrZero(metric.substitutionCarts);
    acc.substitutionOrders += numberOrZero(metric.substitutionOrders);
    acc.substitutionFavorites += numberOrZero(metric.substitutionFavorites);
    acc.substitutionCount += numberOrZero(metric.substitutionCount);
    acc.substitutionCampaignCount += numberOrZero(metric.substitutionCampaignCount);
    (Array.isArray(metric.substitutionTop) ? metric.substitutionTop : []).forEach((item) => acc.substitutionTop.push(item));
    if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
      acc.planAdSpend += numberOrZero(metric.planAdSpend);
      acc.hasPlanAdSpend = true;
    }
    if (metric.planMonthAdSpend !== null && metric.planMonthAdSpend !== undefined) {
      acc.planMonthAdSpend += numberOrZero(metric.planMonthAdSpend);
      acc.hasPlanMonthAdSpend = true;
    }
    if (metric.planPeriodAdSpend !== null && metric.planPeriodAdSpend !== undefined) {
      acc.planPeriodAdSpend += numberOrZero(metric.planPeriodAdSpend);
      acc.hasPlanPeriodAdSpend = true;
    }
    if (metric.adForecastSpend !== null && metric.adForecastSpend !== undefined) {
      acc.adForecastSpend += numberOrZero(metric.adForecastSpend);
      acc.hasAdForecastSpend = true;
    }
    skuPlanFactMergeDailyIntoMap(acc.dailyMap, metric.factDaily);
    const marginPct = skuPlanFactNormalizeRatio(metric.marginPct);
    const marginWeight = numberOrZero(metric.factRevenue) || numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue);
    if (marginPct !== null && marginWeight > 0) {
      acc.marginValue += marginPct * marginWeight;
      acc.marginWeight += marginWeight;
    }
    const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
    const planMarginWeight = numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue);
    if (planMarginPct !== null && planMarginWeight > 0) {
      acc.planMarginValue += planMarginPct * planMarginWeight;
      acc.planMarginWeight += planMarginWeight;
    }
    if (skuPlanFactPlatformHasActivity(metric)) acc.activePlatforms += 1;
    acc.hasPlanOrFact = acc.hasPlanOrFact || Boolean(
      metric?.hasSource
      || numberOrZero(metric.planUnits) > 0
      || numberOrZero(metric.planRevenue) > 0
      || numberOrZero(metric.factUnits) > 0
      || numberOrZero(metric.factRevenue) > 0
      || numberOrZero(metric.adSpend) > 0
      || numberOrZero(metric.substitutionViews) > 0
      || numberOrZero(metric.substitutionOrders) > 0
    );
    return acc;
  }, { planUnits: 0, planRevenue: 0, planToDateRevenue: 0, factUnits: 0, factRevenue: 0, adSpend: 0, substitutionViews: 0, substitutionCarts: 0, substitutionOrders: 0, substitutionFavorites: 0, substitutionCount: 0, substitutionCampaignCount: 0, substitutionTop: [], planAdSpend: 0, planMonthAdSpend: 0, planPeriodAdSpend: 0, adForecastSpend: 0, hasPlanAdSpend: false, hasPlanMonthAdSpend: false, hasPlanPeriodAdSpend: false, hasAdForecastSpend: false, marginValue: 0, marginWeight: 0, planMarginValue: 0, planMarginWeight: 0, activePlatforms: 0, dailyMap: new Map(), hasPlanOrFact: false });
  row.planUnits = totals.planUnits;
  row.planRevenue = totals.planRevenue;
  row.planToDateRevenue = totals.planToDateRevenue;
  row.factUnits = totals.factUnits;
  row.factRevenue = totals.factRevenue;
  row.avgCheck = row.factUnits > 0 ? row.factRevenue / row.factUnits : null;
  row.completionToDate = row.planToDateRevenue > 0 ? row.factRevenue / row.planToDateRevenue : null;
  row.completionMonth = row.planRevenue > 0 ? row.factRevenue / row.planRevenue : null;
  row.gapToDate = row.factRevenue - row.planToDateRevenue;
  row.adSpend = totals.adSpend;
  row.drr = row.factRevenue > 0 ? row.adSpend / row.factRevenue : null;
  row.substitutionViews = totals.substitutionViews;
  row.substitutionCarts = totals.substitutionCarts;
  row.substitutionOrders = totals.substitutionOrders;
  row.substitutionFavorites = totals.substitutionFavorites;
  row.substitutionCount = totals.substitutionCount;
  row.substitutionCampaignCount = totals.substitutionCampaignCount;
  row.substitutionCartRate = row.substitutionViews > 0 ? row.substitutionCarts / row.substitutionViews : null;
  row.substitutionOrderRate = row.substitutionViews > 0 ? row.substitutionOrders / row.substitutionViews : null;
  row.substitutionTop = totals.substitutionTop
    .sort((left, right) => numberOrZero(right.orders) - numberOrZero(left.orders) || numberOrZero(right.views) - numberOrZero(left.views))
    .slice(0, 6);
  row.planAdSpend = totals.hasPlanAdSpend ? totals.planAdSpend : null;
  row.planAdSpendToDate = row.planAdSpend;
  row.planMonthAdSpend = totals.hasPlanMonthAdSpend ? totals.planMonthAdSpend : null;
  row.planPeriodAdSpend = totals.hasPlanPeriodAdSpend ? totals.planPeriodAdSpend : null;
  row.adForecastSpend = totals.hasAdForecastSpend ? totals.adForecastSpend : null;
  skuPlanFactFinalizeAdPace(row, monthKey, elapsedDays, periodStart);
  row.planDrr = row.planToDateRevenue > 0 && row.planAdSpend !== null ? row.planAdSpend / row.planToDateRevenue : null;
  row.marginPct = totals.marginWeight > 0 ? totals.marginValue / totals.marginWeight : null;
  row.marginRub = row.marginPct === null ? null : row.factRevenue * row.marginPct;
  row.planMarginPct = totals.planMarginWeight > 0 ? totals.planMarginValue / totals.planMarginWeight : null;
  row.planMarginRub = row.planMarginPct === null ? null : row.planToDateRevenue * row.planMarginPct;
  row.activePlatformCount = totals.activePlatforms;
  row.factDaily = skuPlanFactDailyArrayFromMap(totals.dailyMap);
  row.scoreHistory = skuPlanFactBuildScoreHistory(row, monthKey, periodStart, periodEnd);
  row.completionDelta = skuPlanFactCompletionDelta(row.scoreHistory);
  row.hasPlanOrFact = totals.hasPlanOrFact;
  return row;
}

function skuPlanFactMarkDuplicateRiskRows(rows = []) {
  rows.forEach((row) => {
    row.duplicateRisk = SKU_PLAN_FACT_PLATFORMS.some((platform) => {
      const metric = row.platforms?.[platform] || row[platform] || null;
      return Boolean(metric?.reconciledFact);
    });
    if (row.duplicateRisk) {
      row.matrixProblemState = 'duplicate_risk';
      row.matrixProblemMeta = typeof skuMatrixProblemMeta === 'function'
        ? skuMatrixProblemMeta('duplicate_risk')
        : { label: 'Риск дубля выручки', tone: 'danger' };
    }
  });
}

function skuPlanFactDefaultSortDir(sort = '') {
  const numericSorts = new Set(['fact', 'plan', 'drr', 'avgCheck', 'turnover', 'ad', 'substitution', 'margin', 'platform', 'action', ...SKU_PLAN_FACT_PLATFORMS]);
  return numericSorts.has(sort) ? 'desc' : 'asc';
}

function skuPlanFactSortValue(row, sort = '') {
  if (sort === 'article') return row.article || row.articleKey || '';
  if (sort === 'owner') return row.owner || '';
  if (sort === 'platform') return row.activePlatformCount || 0;
  if (sort === 'completion') return row.completionToDate;
  if (sort === 'fact') return row.factRevenue;
  if (sort === 'plan') return row.planRevenue;
  if (sort === 'margin') return row.marginPct;
  if (sort === 'drr') return row.drr;
  if (SKU_PLAN_FACT_PLATFORMS.includes(sort)) return row.platforms?.[sort]?.factRevenue ?? row[sort]?.factRevenue;
  if (sort === 'avgCheck') return row.factUnits > 0 ? row.factRevenue / row.factUnits : null;
  if (sort === 'turnover') {
    const values = SKU_PLAN_FACT_PLATFORMS
      .map((platform) => row.platforms?.[platform]?.turnoverDays ?? row[platform]?.turnoverDays)
      .filter((value) => Number.isFinite(Number(value)));
    return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
  }
  if (sort === 'ad') return row.adSpend;
  if (sort === 'substitution') return numberOrZero(row.substitutionOrders) || numberOrZero(row.substitutionViews);
  if (sort === 'action') return skuPlanFactAttentionScore(row);
  return row.gapToDate;
}

function skuPlanFactCompareValues(leftValue, rightValue) {
  const leftEmpty = leftValue === null || leftValue === undefined || leftValue === '';
  const rightEmpty = rightValue === null || rightValue === undefined || rightValue === '';
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;

  return String(leftValue).localeCompare(String(rightValue), 'ru', { numeric: true, sensitivity: 'base' });
}

function skuPlanFactSortRows(rows, sort, sortDir) {
  const key = sort || 'gap';
  const direction = sortDir || skuPlanFactDefaultSortDir(key);
  return [...rows].sort((left, right) => {
    const result = skuPlanFactCompareValues(skuPlanFactSortValue(left, key), skuPlanFactSortValue(right, key));
    return direction === 'desc' ? -result : result;
  });
}

function skuPlanFactRowMatchesFilters(row = {}, filters = {}, options = {}) {
  const checkPlatform = options.platform !== false;
  if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
  if ((filters.status === 'actual' || filters.status === 'active') && !skuPlanFactKpiEligible(row)) return false;
  if (filters.status === 'output' && !skuPlanFactIsOutput(row)) return false;
  if (filters.status === 'question' && !skuPlanFactIsQuestion(row)) return false;
  if (filters.status === 'with_plan' && row.planRevenue <= 0) return false;
  if (filters.status === 'under_plan' && !(row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue)) return false;
  if (filters.status === 'no_fact' && !(row.planRevenue > 0 && row.factRevenue <= 0)) return false;
  if (filters.status === 'unmapped' && !row.syntheticUnmapped) return false;
  if (filters.status === 'matrix_problem' && (row.matrixProblemState === 'ok' || !row.matrixProblemState)) return false;
  if (filters.status === 'missing_owner' && row.matrixProblemState !== 'missing_owner' && row.owner !== 'Без owner') return false;
  if (filters.status === 'duplicate_risk' && !row.duplicateRisk) return false;
  if (checkPlatform && filters.platform !== 'all' && !skuPlanFactPlatformHasActivity(row.platforms?.[filters.platform] || row[filters.platform])) return false;
  const search = String(filters.search || '').trim().toLowerCase();
  if (!search) return true;
  return [row.articleKey, row.article, row.name, row.owner, row.status, row.matrixProblemMeta?.label]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(search);
}

function skuPlanFactBuildModel(filterOverrides = null, options = {}) {
  const persistFilters = options.persistFilters !== false;
  const filters = skuPlanFactFilters(filterOverrides, { persist: persistFilters });
  const indexes = skuPlanFactBuildIndexes();
  const months = skuPlanFactAvailableMonths(indexes);
  const monthKey = skuPlanFactSelectedMonth(months, filters);
  const dateBounds = skuPlanFactDateBounds(indexes, months, monthKey);
  const maxAvailableDate = skuPlanFactMaxFactDate(indexes, monthKey);
  const selectedPeriod = skuPlanFactSelectedPeriod(indexes, monthKey, maxAvailableDate, filters);
  const periodStart = selectedPeriod.start;
  const selectedDate = selectedPeriod.end;
  const elapsedDays = selectedPeriod.days;
  const adIndex = skuPlanFactAdIndex(monthKey, selectedDate, periodStart);
  const modelSkus = [
    ...(state.skus || []),
    ...skuPlanFactUnmappedSkus(indexes, monthKey, selectedDate, periodStart)
  ];
  const rows = modelSkus.map((sku) => skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays, selectedDate, periodStart));
  const selectedOwnerPlatform = SKU_PLAN_FACT_PLATFORMS.includes(filters.platform) ? filters.platform : 'all';
  skuPlanFactApplyOwnerScope(rows, selectedOwnerPlatform);
  skuPlanFactAppendUnallocatedAggregateRows(rows, monthKey, selectedDate, periodStart);
  skuPlanFactApplyOwnerScope(rows, selectedOwnerPlatform);
  const reconciliation = skuPlanFactReconcilePlatformFacts(rows, monthKey, selectedDate, periodStart);
  skuPlanFactMarkDuplicateRiskRows(rows);
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => skuPlanFactAllocatePlatformPlan(rows, monthKey, platform, elapsedDays, periodStart, selectedDate));
  skuPlanFactApplyCorporateRevenuePlan(rows, monthKey, periodStart, selectedDate);
  skuPlanFactApplyCompanyPlanZeroChannels(rows, monthKey);
  skuPlanFactApplyPlannedAdSpend(rows, monthKey, periodStart, selectedDate);
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    skuPlanFactApplyAggregateAdSpend(rows, monthKey, platform, elapsedDays, periodStart, selectedDate);
  });
  skuPlanFactRedistributePayrollPlansToOwners(rows, selectedOwnerPlatform);
  const iuDrrControl = { applied: false, platforms: {}, source: 'company_plan_scope' };
  rows.forEach((row) => skuPlanFactFinalizeRow(row, monthKey, elapsedDays, periodStart, selectedDate));
  skuPlanFactApplySingleOwnerFallback(rows, selectedOwnerPlatform);
  const ownerFilterRows = rows.filter((row) => skuPlanFactRowMatchesFilters(row, {
    ...filters,
    owner: 'all',
    status: 'all',
    search: '',
    platform: 'all'
  }));
  const owners = skuPlanFactOwnerOptionsFromRows(ownerFilterRows);
  if (filters.owner !== 'all' && skuPlanFactOwnerIsFilterOption(filters.owner) && !owners.includes(filters.owner)) {
    owners.push(filters.owner);
    owners.sort((a, b) => a.localeCompare(b, 'ru'));
  }
  const platformBaseRows = rows.filter((row) => skuPlanFactRowMatchesFilters(row, filters, { platform: false }));
  const filteredRows = platformBaseRows.filter((row) => skuPlanFactRowMatchesFilters(row, filters));
  const sortedRows = skuPlanFactSortRows(filteredRows, filters.sort, filters.sortDir);
  const unmappedRows = rows.filter((row) => row.syntheticUnmapped);
  const unmappedRevenue = unmappedRows.reduce((sum, row) => sum + numberOrZero(row.factRevenue), 0);
  const quality = skuPlanFactBuildDataQuality(rows, reconciliation, monthKey, selectedDate);
  const totals = sortedRows.reduce((acc, row) => {
    acc.planRevenue += row.planRevenue;
    acc.planToDateRevenue += row.planToDateRevenue;
    acc.factRevenue += row.factRevenue;
    acc.planUnits += row.planUnits;
    acc.factUnits += row.factUnits;
    acc.adSpend += row.adSpend;
    acc.substitutionViews += numberOrZero(row.substitutionViews);
    acc.substitutionCarts += numberOrZero(row.substitutionCarts);
    acc.substitutionOrders += numberOrZero(row.substitutionOrders);
    acc.substitutionFavorites += numberOrZero(row.substitutionFavorites);
    acc.substitutionCount += numberOrZero(row.substitutionCount);
    acc.substitutionCampaignCount += numberOrZero(row.substitutionCampaignCount);
    if (row.planAdSpend !== null && row.planAdSpend !== undefined) {
      acc.planAdSpend += numberOrZero(row.planAdSpend);
      acc.hasPlanAdSpend = true;
    }
    if (row.planMonthAdSpend !== null && row.planMonthAdSpend !== undefined) {
      acc.planMonthAdSpend += numberOrZero(row.planMonthAdSpend);
      acc.hasPlanMonthAdSpend = true;
    }
    if (row.planPeriodAdSpend !== null && row.planPeriodAdSpend !== undefined) {
      acc.planPeriodAdSpend += numberOrZero(row.planPeriodAdSpend);
      acc.hasPlanPeriodAdSpend = true;
    }
    if (row.adForecastSpend !== null && row.adForecastSpend !== undefined) {
      acc.adForecastSpend += numberOrZero(row.adForecastSpend);
      acc.hasAdForecastSpend = true;
    }
    const marginPct = skuPlanFactNormalizeRatio(row.marginPct);
    const marginWeight = numberOrZero(row.factRevenue) || numberOrZero(row.planToDateRevenue) || numberOrZero(row.planRevenue);
    if (marginPct !== null && marginWeight > 0) {
      acc.marginValue += marginPct * marginWeight;
      acc.marginWeight += marginWeight;
    }
    const planMarginPct = skuPlanFactNormalizeRatio(row.planMarginPct);
    const planMarginWeight = numberOrZero(row.planToDateRevenue) || numberOrZero(row.planRevenue);
    if (planMarginPct !== null && planMarginWeight > 0) {
      acc.planMarginValue += planMarginPct * planMarginWeight;
      acc.planMarginWeight += planMarginWeight;
    }
    if (row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue) acc.underPlan += 1;
    if (row.planRevenue > 0 && row.factRevenue <= 0) acc.noFact += 1;
    return acc;
  }, { planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, planUnits: 0, factUnits: 0, adSpend: 0, substitutionViews: 0, substitutionCarts: 0, substitutionOrders: 0, substitutionFavorites: 0, substitutionCount: 0, substitutionCampaignCount: 0, planAdSpend: 0, planMonthAdSpend: 0, planPeriodAdSpend: 0, adForecastSpend: 0, hasPlanAdSpend: false, hasPlanMonthAdSpend: false, hasPlanPeriodAdSpend: false, hasAdForecastSpend: false, marginValue: 0, marginWeight: 0, planMarginValue: 0, planMarginWeight: 0, underPlan: 0, noFact: 0 });
  totals.completionToDate = totals.planToDateRevenue > 0 ? totals.factRevenue / totals.planToDateRevenue : null;
  totals.completionMonth = totals.planRevenue > 0 ? totals.factRevenue / totals.planRevenue : null;
  totals.gapToDate = totals.factRevenue - totals.planToDateRevenue;
  totals.avgCheck = totals.factUnits > 0 ? totals.factRevenue / totals.factUnits : null;
  totals.drr = totals.factRevenue > 0 ? totals.adSpend / totals.factRevenue : null;
  totals.substitutionCartRate = totals.substitutionViews > 0 ? totals.substitutionCarts / totals.substitutionViews : null;
  totals.substitutionOrderRate = totals.substitutionViews > 0 ? totals.substitutionOrders / totals.substitutionViews : null;
  totals.planAdSpend = totals.hasPlanAdSpend ? totals.planAdSpend : null;
  totals.planAdSpendToDate = totals.planAdSpend;
  totals.planMonthAdSpend = totals.hasPlanMonthAdSpend ? totals.planMonthAdSpend : null;
  totals.planPeriodAdSpend = totals.hasPlanPeriodAdSpend ? totals.planPeriodAdSpend : null;
  totals.adForecastSpend = totals.hasAdForecastSpend ? totals.adForecastSpend : null;
  skuPlanFactFinalizeAdPace(totals, monthKey, elapsedDays, periodStart);
  totals.planDrr = totals.planToDateRevenue > 0 && totals.planAdSpend !== null ? totals.planAdSpend / totals.planToDateRevenue : null;
  totals.marginPct = totals.marginWeight > 0 ? totals.marginValue / totals.marginWeight : null;
  totals.marginRub = totals.marginPct === null ? null : totals.factRevenue * totals.marginPct;
  totals.planMarginPct = totals.planMarginWeight > 0 ? totals.planMarginValue / totals.planMarginWeight : null;
  totals.planMarginRub = totals.planMarginPct === null ? null : totals.planToDateRevenue * totals.planMarginPct;
  const planAdTotalsByPlatform = skuPlanFactPlanAdTotalsByPlatform(monthKey, periodStart, selectedDate);
  const planDrrByPlatform = SKU_PLAN_FACT_PLATFORMS.reduce((acc, platform) => {
    acc[platform] = planAdTotalsByPlatform[platform]?.drr ?? null;
    return acc;
  }, {});
  const model = {
    filters,
    months,
    monthKey,
    monthLabel: skuPlanFactMonthLabel(monthKey),
    maxFactDate: selectedDate,
    selectedDate,
    periodStart,
    periodEnd: selectedDate,
    periodDays: elapsedDays,
    maxAvailableDate,
    dateMin: dateBounds.min,
    dateMax: dateBounds.max,
    elapsedDays,
    rows: sortedRows,
    allRows: rows,
    platformBaseRows,
    owners,
    platforms: SKU_PLAN_FACT_PLATFORMS,
    platformLabels: SKU_PLAN_FACT_PLATFORM_LABELS,
    reconciliation,
    unmappedCount: unmappedRows.length,
    unmappedRevenue,
    quality,
    iuDrrControl,
    planAdTotalsByPlatform,
    planDrrByPlatform,
    totals,
    planDrrWb: planDrrByPlatform.wb,
    planDrrOzon: planDrrByPlatform.ozon
  };
  return skuPlanFactApplyPayrollKpiToModel(model);
}

function skuPlanFactTone(value) {
  if (value === null || value === undefined) return '';
  if (value >= 1) return 'ok';
  if (value >= 0.9) return 'warn';
  return 'danger';
}

function skuPlanFactDeltaClass(value) {
  if (value > 0) return 'ok-text';
  if (value < 0) return 'danger-text';
  return '';
}

function skuPlanFactMetricHtml(label, value, hint = '', tone = '') {
  return `
    <div class="card kpi">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value ${tone}">${value}</div>
      <div class="hint">${escapeHtml(hint)}</div>
    </div>
  `;
}

function skuPlanFactBuildDataQuality(rows = [], reconciliation = [], monthKey = '', maxFactDate = '') {
  const issues = [];
  const addIssue = (issue) => {
    const revenue = numberOrZero(issue.revenue);
    issues.push({
      severity: issue.severity || (revenue >= 100000 ? 'danger' : 'warn'),
      type: issue.type || '',
      platform: issue.platform || '',
      articleKey: issue.articleKey || '',
      name: issue.name || '',
      revenue,
      units: numberOrZero(issue.units),
      action: issue.action || '',
      monthKey,
      factTo: maxFactDate
    });
  };

  rows.filter((row) => row.syntheticUnallocated).forEach((row) => {
    const platform = SKU_PLAN_FACT_PLATFORMS.find((key) => numberOrZero(row.platforms?.[key]?.factRevenue) > 0) || '';
    addIssue({
      severity: 'danger',
      type: 'Агрегат без SKU',
      platform: skuPlanFactPlatformLabel(platform),
      articleKey: row.articleKey,
      name: row.name,
      revenue: row.factRevenue,
      units: row.factUnits,
      action: 'Проверить API-детализацию и добавить недостающие SKU/алиасы'
    });
  });

  rows.filter((row) => row.syntheticUnmapped && !row.syntheticUnallocated).forEach((row) => {
    const platformList = SKU_PLAN_FACT_PLATFORMS
      .filter((key) => numberOrZero(row.platforms?.[key]?.factRevenue) > 0 || numberOrZero(row.platforms?.[key]?.factUnits) > 0)
      .map((key) => skuPlanFactPlatformLabel(key))
      .join(', ');
    addIssue({
      type: 'API SKU без пары',
      platform: platformList,
      articleKey: row.articleKey,
      name: row.name,
      revenue: row.factRevenue,
      units: row.factUnits,
      action: 'Добавить строку в dim_sku_aliases или завести SKU в реестре'
    });
  });

  (reconciliation || []).forEach((item) => {
    addIssue({
      severity: 'warn',
      type: 'SKU выше агрегата',
      platform: item.label || '',
      articleKey: '',
      name: 'Сверка суммы SKU с итогом площадки',
      revenue: Math.max(0, numberOrZero(item.rawRevenue) - numberOrZero(item.aggregateRevenue)),
      units: Math.max(0, numberOrZero(item.rawUnits) - numberOrZero(item.aggregateUnits)),
      action: 'Проверить дубли в источнике SKU-факта'
    });
  });

  const noOwnerRows = rows.filter((row) => !row.syntheticUnmapped && (!row.owner || row.owner === 'Без owner'));
  noOwnerRows.slice(0, 20).forEach((row) => {
    addIssue({
      severity: numberOrZero(row.factRevenue) > 0 ? 'warn' : 'info',
      type: 'Нет owner',
      platform: '',
      articleKey: row.articleKey,
      name: row.name,
      revenue: row.factRevenue,
      units: row.factUnits,
      action: 'Заполнить owner в dim_sku'
    });
  });

  const sorted = issues.sort((left, right) => {
    const severityWeight = { danger: 3, warn: 2, info: 1 };
    return (severityWeight[right.severity] || 0) - (severityWeight[left.severity] || 0)
      || numberOrZero(right.revenue) - numberOrZero(left.revenue);
  });
  return {
    issues: sorted,
    topIssues: sorted.slice(0, 10),
    issueCount: sorted.length,
    dangerCount: sorted.filter((item) => item.severity === 'danger').length,
    warnCount: sorted.filter((item) => item.severity === 'warn').length,
    unmappedCount: rows.filter((row) => row.syntheticUnmapped && !row.syntheticUnallocated).length,
    unallocatedCount: rows.filter((row) => row.syntheticUnallocated).length,
    noOwnerCount: noOwnerRows.length,
    unresolvedRevenue: sorted.reduce((sum, item) => sum + numberOrZero(item.revenue), 0)
  };
}

function skuPlanFactAliasImportReportHtml(report = null) {
  if (!report) return '';
  const errors = report.errorRows || [];
  const warnings = report.validationWarnings || [];
  const duplicates = report.duplicateRows || [];
  const skipped = report.skippedRows || [];
  const newSkuRows = report.newSkuRows || [];
  const needCheckRows = report.needCheckRows || [];
  const newSkuTaskResult = report.newSkuTaskResult || {};
  const details = errors.length ? errors.slice(0, 8)
    : warnings.length ? warnings.slice(0, 8)
      : duplicates.length ? duplicates.slice(0, 8)
        : skipped.length ? skipped.slice(0, 8)
          : newSkuRows.length ? newSkuRows.slice(0, 8)
            : needCheckRows.slice(0, 8);
  const canApply = !report.appliedAt && !errors.length && Boolean(
    ((report.aliases || []).length && report.aliasPayload)
    || ((report.ignores || []).length && report.ignorePayload)
    || (report.newSkuRows || []).length
  );
  const detailRows = details.map((row) => `
    <tr>
      <td>${escapeHtml(row.rowNumber || '—')}</td>
      <td>${escapeHtml(row.apiSku || row.api_sku || '—')}</td>
      <td>${escapeHtml(row.platform || '—')}</td>
      <td>${escapeHtml(row.targetSku || row.target_sku || '—')}</td>
      <td>${escapeHtml(row.reason || row.action || '—')}</td>
    </tr>
  `).join('');
  const outcomeRows = [
    {
      label: 'Исчезнет после sync',
      count: (report.aliases || []).length + (report.ignores || []).length,
      tone: 'ok',
      text: 'alias и ignore сохранятся в общий контур, матрица SKU пересоберётся, эти API SKU уйдут из нерешённой очереди.'
    },
    {
      label: 'Останется как new_sku',
      count: newSkuRows.length,
      tone: 'warn',
      text: 'при применении портал создаст задачу “Завести SKU”; после заведения нужно связать API SKU через alias.'
    },
    {
      label: 'Останется как need_check',
      count: needCheckRows.length,
      tone: 'warn',
      text: 'портал ничего не применяет, строка остаётся на ручную проверку.'
    },
    {
      label: 'Не применится из-за ошибки',
      count: errors.length,
      tone: 'danger',
      text: 'исправьте target_sku/API SKU/площадку и загрузите файл повторно.'
    }
  ].filter((row) => row.count > 0);
  const outcomeHtml = outcomeRows.map((row) => `
    <tr>
      <td>${badge(row.label, row.tone)}</td>
      <td><strong>${fmt.int(row.count)}</strong></td>
      <td>${escapeHtml(row.text)}</td>
    </tr>
  `).join('');
  return `
    <div class="notice ${errors.length || warnings.length ? 'warn' : 'ok'}" style="margin-top:10px">
      <div class="section-subhead">
        <div>
          <strong>Отчёт импорта${report.fileName ? `: ${escapeHtml(report.fileName)}` : ''}</strong>
          <div class="small muted">Строк: ${fmt.int(report.sourceRows || 0)} · alias: ${fmt.int(report.candidateAliases || 0)} · ignore: ${fmt.int(report.candidateIgnores || 0)} · new_sku: ${fmt.int(report.candidateNewSkus || 0)} · need_check: ${fmt.int(report.candidateNeedCheck || 0)} · дубли: ${fmt.int(duplicates.length)} · пропущено: ${fmt.int(skipped.length)} · ошибок: ${fmt.int(errors.length)}</div>
          ${report.appliedAt ? `<div class="small muted">Применено: ${escapeHtml(fmt.date(report.appliedAt))} · задач new_sku создано: ${fmt.int((newSkuTaskResult.created || []).length)} · дублей задач: ${fmt.int((newSkuTaskResult.duplicates || []).length)}</div>` : ''}
        </div>
        <div class="badge-stack">
          ${canApply ? '<button class="quick-chip" type="button" data-sku-plan-fact-apply-import>Применить в портал</button>' : ''}
          ${(report.aliases || []).length && report.aliasPayload ? '<button class="quick-chip" type="button" data-sku-plan-fact-download-aliases>Скачать sku_aliases.json</button>' : ''}
          ${(report.ignores || []).length && report.ignorePayload ? '<button class="quick-chip" type="button" data-sku-plan-fact-download-ignore>Скачать sku_alias_ignore.json</button>' : ''}
          <button class="quick-chip" type="button" data-sku-plan-fact-download-import-report>Скачать отчёт</button>
        </div>
      </div>
      ${outcomeHtml ? `
        <div class="table-scroll" style="margin-top:10px">
          <table class="data-table compact">
            <thead><tr><th>Что будет</th><th>Строк</th><th>Пояснение</th></tr></thead>
            <tbody>${outcomeHtml}</tbody>
          </table>
        </div>
      ` : ''}
      ${detailRows ? `
        <div class="table-scroll" style="margin-top:10px">
          <table class="data-table compact">
            <thead><tr><th>Строка</th><th>API SKU</th><th>Площадка</th><th>target_sku</th><th>Статус</th></tr></thead>
            <tbody>${detailRows}</tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `;
}

function skuPlanFactQualityToolsHtml() {
  return `
    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Разбор API SKU</h3>
          <p class="small muted">Загрузите заполненный файл проблем: decision=alias связывает API SKU с SKU реестра, decision=ignore скрывает осознанное исключение, decision=new_sku/need_check остаётся в разборе без применения.</p>
        </div>
        <div class="badge-stack">
          <button class="quick-chip" type="button" data-sku-plan-fact-quality-import>Загрузить заполненный файл</button>
          <input type="file" accept=".csv,.xls,.html,.txt" data-sku-plan-fact-quality-file hidden>
        </div>
      </div>
      ${skuPlanFactAliasImportReportHtml(state.skuPlanFactAliasImportReport || null)}
      <div class="footer-note">Кнопка применения обновляет общий справочник алиасов/ignore и матрицу SKU в снапшотах портала; следующий sync подтянет эти изменения в локальные JSON.</div>
    </div>
  `;
}

function skuPlanFactDataQualityHtml(model) {
  const quality = model.quality || {};
  const issues = quality.topIssues || [];
  if (!quality.issueCount) {
    return `
      <div class="notice ok" style="margin-top:14px">
        <strong>Контроль данных:</strong> критичных расхождений по текущему месяцу не найдено.
      </div>
      ${skuPlanFactQualityToolsHtml()}
    `;
  }
  const rowsHtml = issues.map((issue) => `
    <tr>
      <td>${badge(issue.severity === 'danger' ? 'Критично' : issue.severity === 'warn' ? 'Проверить' : 'Инфо', issue.severity === 'danger' ? 'danger' : issue.severity === 'warn' ? 'warn' : 'info')}</td>
      <td><strong>${escapeHtml(issue.type)}</strong><div class="muted small">${escapeHtml(issue.action)}</div></td>
      <td>${escapeHtml(issue.platform || 'Все')}</td>
      <td>${escapeHtml(issue.articleKey || '—')}<div class="muted small">${escapeHtml(issue.name || '')}</div></td>
      <td><strong>${fmt.money(issue.revenue)}</strong><div class="muted small">${fmt.int(issue.units)} шт.</div></td>
    </tr>
  `).join('');
  return `
    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Контроль данных</h3>
          <p class="small muted">Очередь расхождений, которые мешают план-факту полностью разложиться по SKU и owner.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(quality.unmappedCount || 0)} API SKU`, quality.unmappedCount ? 'warn' : 'ok')}
          ${badge(`${fmt.int(quality.unallocatedCount || 0)} агрегат`, quality.unallocatedCount ? 'danger' : 'ok')}
          ${badge(fmt.money(quality.unresolvedRevenue || 0), quality.dangerCount ? 'danger' : 'warn')}
          <button class="quick-chip" type="button" data-sku-plan-fact-quality-export>Выгрузить проблемы</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead>
            <tr>
              <th>Уровень</th>
              <th>Проблема</th>
              <th>Площадка</th>
              <th>SKU/API</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
    ${skuPlanFactQualityToolsHtml()}
  `;
}

function skuContourDecisionCardsHtml() {
  const cards = [
    {
      title: 'Это тот же товар',
      decision: 'alias',
      text: 'API SKU на площадке — это уже существующий товар из реестра.',
      fill: 'В Excel: decision = alias, target_sku = SKU из реестра.',
      tone: 'ok'
    },
    {
      title: 'Это новый товар',
      decision: 'new_sku',
      text: 'Товара ещё нет в реестре, но его нужно завести.',
      fill: 'В Excel: decision = new_sku. Портал создаст задачу.',
      tone: 'warn'
    },
    {
      title: 'Это не надо маппить',
      decision: 'ignore',
      text: 'Тестовая, служебная или осознанно исключённая строка.',
      fill: 'В Excel: decision = ignore, в note коротко причина.',
      tone: 'ok'
    },
    {
      title: 'Не уверены',
      decision: 'need_check',
      text: 'Нужна проверка категории, API, склада или источника.',
      fill: 'В Excel: decision = need_check, в note вопрос.',
      tone: 'info'
    }
  ];
  return `
    <div class="grid cards" style="margin-top:12px" data-sku-contour-decision-cards>
      ${cards.map((card) => `
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>${escapeHtml(card.title)}</h3>
              <p class="small muted">${escapeHtml(card.text)}</p>
            </div>
            ${badge(card.decision, card.tone)}
          </div>
          <div class="small" style="margin-top:8px">${escapeHtml(card.fill)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function skuPlanFactNormalizeRatio(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.abs(numeric) > 2 ? numeric / 100 : numeric;
}

function skuPlanFactMarginTone(value) {
  const ratio = skuPlanFactNormalizeRatio(value);
  if (ratio === null) return '';
  if (ratio < 0.15) return 'danger';
  if (ratio < 0.28) return 'warn';
  return 'ok';
}

function skuPlanFactAttentionScore(row = {}) {
  let score = 0;
  if (row.matrixProblemState && row.matrixProblemState !== 'ok') score += 10;
  if (row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue) score += 5;
  if (row.completionToDate !== null && row.completionToDate > 1.2) score += 3;
  if (skuPlanFactNormalizeRatio(row.marginPct) !== null && skuPlanFactNormalizeRatio(row.marginPct) < 0.15) score += 4;
  if (row.drr !== null && row.drr > 0.25) score += 2;
  return score;
}

function skuContourGuideHtml() {
  const decisionRows = [
    {
      decision: 'alias',
      use: 'API SKU оказался тем же товаром, который уже есть в реестре.',
      fill: 'В decision пишем alias, в target_sku пишем точный SKU/артикул из реестра. platform и api_sku не меняем.',
      result: 'После загрузки и применения выручка и штуки этого API SKU начнут попадать в один общий SKU во всех контурах.'
    },
    {
      decision: 'ignore',
      use: 'Это не товар для матрицы: тест, дубль мусорного источника, сервисная строка или строка, которую сознательно не надо маппить.',
      fill: 'В decision пишем ignore, target_sku оставляем пустым, в note коротко пишем причину.',
      result: 'Строка уйдет в справочник исключений и перестанет висеть как нерешенная ошибка, но останется в аудите.'
    },
    {
      decision: 'new_sku',
      use: 'Это реальный новый товар, которого еще нет в реестре SKU.',
      fill: 'В decision пишем new_sku, в note пишем что завести. target_sku можно оставить пустым или указать будущий код.',
      result: 'Портал не создает SKU автоматически. Строка попадет в отчет импорта как задача на заведение SKU, затем ее надо связать через alias.'
    },
    {
      decision: 'need_check',
      use: 'Непонятно, что это: нужна проверка у категории, API, склада или источника.',
      fill: 'Оставляем decision=need_check и пишем вопрос/наблюдение в note.',
      result: 'Ничего не применится. Строка останется в очереди, чтобы ее не спрятать случайно.'
    }
  ].map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.decision)}</strong></td>
      <td>${escapeHtml(row.use)}</td>
      <td>${escapeHtml(row.fill)}</td>
      <td>${escapeHtml(row.result)}</td>
    </tr>
  `).join('');

  const statusRows = [
    ['Блокер sync', 'Синхронизация увидела риск в данных. Сначала проверяем источник/API или дубли, потом применяем alias/ignore.'],
    ['Карантин', 'Строка уже изолирована защитой данных. Ее можно разобрать через форму, но в расчетах она не должна тихо смешиваться с нормальными SKU.'],
    ['Новая', 'По этой строке еще нет решения в общем alias/ignore. Это главный рабочий список.'],
    ['Проверить', 'Предупреждение: не всегда блокирует работу, но требует ручной проверки.'],
    ['Применено', 'Для API SKU уже есть alias, строка должна уйти из проблем после обновления данных.'],
    ['Ignore', 'Строка сознательно исключена, она не должна требовать маппинга.']
  ].map(([status, description]) => `
    <tr><td><strong>${escapeHtml(status)}</strong></td><td>${escapeHtml(description)}</td></tr>
  `).join('');

  return `
    <details class="card sku-plan-fact-card" style="margin-top:14px" open data-sku-contour-guide>
      <summary style="cursor:pointer;font-weight:800">Как работать с ошибками SKU и колонкой decision в Excel</summary>
      <div class="notice info" style="margin-top:12px">
        <strong>Коротко: таблица в портале справочная, строки в ней не редактируются.</strong>
        <div class="small muted">Ошибки приходят из утреннего API/sync: портал сравнивает факт продаж площадок, реестр SKU, alias/ignore, карантин и health-снимок. Исправление делается через “Выгрузить форму” → заполнить Excel/CSV → “Загрузить заполненный файл” → “Применить в портал”.</div>
      </div>
      <div class="notice ok" style="margin-top:12px">
        <strong>Что сохранится и не должно возвращаться каждый день</strong>
        <div class="small muted">decision=alias сохраняется в общий sku_aliases, decision=ignore сохраняется в sku_alias_ignore. Утренний sync подтягивает эти справочники и пересобирает матрицу, поэтому тот же API SKU с той же площадки больше не должен попадать в нерешённую очередь.</div>
        <div class="small muted">decision=new_sku и decision=need_check ничего не скрывают: это честный сигнал “завести SKU” или “проверить вручную”. Они останутся в рабочем списке, пока не появится реальный alias или ignore.</div>
      </div>
      ${skuContourDecisionCardsHtml()}
      <div class="table-scroll" style="margin-top:12px">
        <table class="data-table compact">
          <thead><tr><th>decision</th><th>Когда ставить</th><th>Что заполнить</th><th>Что произойдет</th></tr></thead>
          <tbody>${decisionRows}</tbody>
        </table>
      </div>
      <div class="table-scroll" style="margin-top:12px">
        <table class="data-table compact">
          <thead><tr><th>Статус в портале</th><th>Что значит</th></tr></thead>
          <tbody>${statusRows}</tbody>
        </table>
      </div>
      <div class="footer-note">В Excel обычно трогаем только decision, target_sku и note. Колонки platform/api_sku/status нужны порталу, их лучше не менять без причины.</div>
    </details>
  `;
}

function skuContourStatusMeta(status = '') {
  const key = String(status || '').trim();
  const map = {
    applied: { label: 'Применено', tone: 'ok' },
    ignored: { label: 'Ignore', tone: 'ok' },
    quarantine: { label: 'Карантин', tone: 'danger' },
    blocked: { label: 'Блокер sync', tone: 'danger' },
    warning: { label: 'Проверить', tone: 'warn' },
    new: { label: 'Новая', tone: 'warn' }
  };
  return map[key] || map.new;
}

function skuContourReadableIssueType(type = '') {
  const key = String(type || '').toLowerCase();
  if (key.includes('warehouse_unmatched_source_key')) return 'Склад без SKU';
  if (key.includes('api_sku_known_outside_registry')) return 'API SKU вне реестра';
  if (key.includes('aggregate') || key.includes('агрегат')) return 'Агрегат без SKU';
  if (key.includes('owner')) return 'Owner / ответственный';
  if (key.includes('unmapped')) return 'Не сматчено';
  return type || 'Проблема SKU';
}

function skuContourIssueWords(value = '') {
  const stop = new Set(['sku', 'api', 'bad', 'alteya', 'alteia', 'altey', 'alteja', 'алтея']);
  return String(value || '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .split(/[^a-zа-я0-9]+/gi)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stop.has(word));
}

function skuContourPackagingWord(word = '') {
  return /\d+(caps|cap|tabl|tabs|ml|gr|g|капс|табл|мл|г)$/i.test(String(word || ''));
}

function skuContourCloseWord(left = '', right = '') {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b.slice(0, 5)) || b.includes(a.slice(0, 5)))) return true;
  return false;
}

function skuContourCandidateCorpus() {
  const matrixByKey = new Map((state.skuMatrix?.items || []).map((item) => [String(item.articleKey || item.article || '').trim(), item]));
  const seen = new Set();
  const rows = [];
  const add = (source = {}, matrixItem = null) => {
    const articleKey = String(source.articleKey || source.article || matrixItem?.articleKey || matrixItem?.article || '').trim();
    if (!articleKey || seen.has(articleKey)) return;
    seen.add(articleKey);
    const merged = { ...(matrixItem || {}), ...(source || {}) };
    const aliasText = (merged.aliases || []).map((alias) => `${alias.platform || ''} ${alias.api_sku || alias.apiSku || alias.alias || ''}`).join(' ');
    const text = [merged.articleKey, merged.article, merged.sku, merged.name, merged.category, merged.type, aliasText].filter(Boolean).join(' ');
    rows.push({
      ...merged,
      articleKey,
      displayArticle: merged.article || articleKey,
      displayName: merged.name || '',
      displayStatus: merged.registryStatus || merged.status || merged.owner?.registryStatus || '',
      displayOwner: merged.owner?.name || merged.owner || '',
      token: skuPlanFactToken(text),
      words: skuContourIssueWords(text)
    });
  };
  (state.skus || []).forEach((sku) => add(sku, matrixByKey.get(String(sku.articleKey || sku.article || '').trim())));
  (state.skuMatrix?.items || []).forEach((item) => add(item, item));
  return rows;
}

function skuContourCandidateScore(issue = {}, candidate = {}) {
  const issueText = [issue.apiSku, issue.articleKey, issue.name].filter(Boolean).join(' ');
  const issueToken = skuPlanFactToken(issueText);
  const candidateArticleToken = skuPlanFactToken(candidate.articleKey || candidate.displayArticle || '');
  if (!issueToken || !candidateArticleToken) return 0;
  if (issueToken === candidateArticleToken) return 1;
  if (issueToken.length >= 6 && candidate.token?.includes(issueToken)) return 0.95;
  if (candidateArticleToken.length >= 6 && issueToken.includes(candidateArticleToken)) return 0.9;

  const issueWords = skuContourIssueWords(issueText);
  const strongIssueWords = issueWords.filter((word) => !skuContourPackagingWord(word));
  const candidateWords = candidate.words || [];
  const exactStrong = strongIssueWords.filter((word) => candidateWords.some((item) => skuContourCloseWord(word, item))).length;
  const packageOverlap = issueWords.filter((word) => skuContourPackagingWord(word) && candidateWords.includes(word)).length;
  const strongBase = Math.max(1, strongIssueWords.length);
  const packageBase = Math.max(1, issueWords.filter(skuContourPackagingWord).length);
  return Math.min(0.89, exactStrong / strongBase * 0.82 + packageOverlap / packageBase * 0.08);
}

function skuContourLikeForLikeCandidates(issue = {}, limit = 3) {
  return skuContourCandidateCorpus()
    .map((candidate) => ({ ...candidate, matchScore: skuContourCandidateScore(issue, candidate) }))
    .filter((candidate) => candidate.matchScore >= 0.34)
    .sort((left, right) => right.matchScore - left.matchScore || String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru'))
    .slice(0, limit);
}

function skuContourRecommendedDecision(issue = {}, candidates = null) {
  const type = String(issue.type || '').toLowerCase();
  const list = candidates || skuContourLikeForLikeCandidates(issue, 1);
  const best = list[0] || null;
  if (issue.status === 'applied') return { decision: 'alias', tone: 'ok', text: 'Уже связано с SKU', targetSku: best?.articleKey || '' };
  if (issue.status === 'ignored') return { decision: 'ignore', tone: 'ok', text: 'Уже исключено из очереди', targetSku: '' };
  if (issue.status === 'blocked') return { decision: 'need_check', tone: 'danger', text: 'Сначала проверить API-детализацию', targetSku: '' };
  if (best?.matchScore >= 0.74) return { decision: 'alias', tone: 'ok', text: `Похоже на ${best.articleKey}`, targetSku: best.articleKey };
  if (best?.matchScore >= 0.48) return { decision: 'need_check', tone: 'warn', text: `Есть кандидат ${best.articleKey}`, targetSku: best.articleKey };
  if (type.includes('warehouse_unmatched_source_key')) return { decision: 'new_sku', tone: 'warn', text: 'Пары в реестре не видно: завести SKU или ignore', targetSku: '' };
  return { decision: 'need_check', tone: 'warn', text: 'Нужна ручная сверка', targetSku: best?.articleKey || '' };
}

function skuContourDecisionBadgeLabel(decision = '') {
  const key = String(decision || '').toLowerCase();
  if (key === 'alias') return 'Связать SKU';
  if (key === 'ignore') return 'Исключить';
  if (key === 'new_sku') return 'Новый SKU';
  if (key === 'need_check') return 'Проверить';
  return key || 'Решение';
}

function skuContourCandidateHtml(candidates = []) {
  if (!candidates.length) return '<div class="sku-contour-candidate-empty">Пары в реестре не видно</div>';
  return `
    <div class="sku-contour-candidates">
      ${candidates.map((candidate) => `
        <span class="sku-contour-candidate" title="${escapeHtml(candidate.displayName || candidate.articleKey || '')}">
          <b>${escapeHtml(candidate.articleKey || '')}</b>
          <em>${fmt.pct(candidate.matchScore || 0)}</em>
          <small>${escapeHtml(candidate.displayStatus || candidate.category || '')}</small>
        </span>
      `).join('')}
    </div>
  `;
}

function skuContourRowNextActionHtml(row = {}, history = null) {
  if (history) {
    return `<strong>${escapeHtml(history.kind)}</strong><div class="muted small">${escapeHtml(fmt.date(history.appliedAt))} · ${escapeHtml(history.actor)}</div>`;
  }
  const candidates = skuContourLikeForLikeCandidates(row, 3);
  const decision = skuContourRecommendedDecision(row, candidates);
  return `
    <div class="sku-contour-next-action">
      ${badge(skuContourDecisionBadgeLabel(decision.decision), decision.tone)}
      <span>${escapeHtml(decision.text)}</span>
    </div>
    ${skuContourCandidateHtml(candidates)}
  `;
}

function skuContourHealthMeta(health = {}) {
  const status = String(health.status || '').toLowerCase();
  const contourStatus = String(health.skuContour?.status || '').toLowerCase();
  if (contourStatus === 'blocked') {
    return { label: 'контур SKU не применился', tone: 'danger', notice: 'warn' };
  }
  if (contourStatus === 'warning') {
    return { label: 'контур SKU требует проверки', tone: 'warn', notice: 'warn' };
  }
  if (health?.publish?.allowed === false || status === 'blocked' || status === 'critical') {
    return { label: 'публикация остановлена', tone: 'danger', notice: 'warn' };
  }
  if (status === 'warning' || (health?.publish?.warnings || []).length) {
    return { label: 'есть предупреждения', tone: 'warn', notice: 'warn' };
  }
  return { label: 'в норме', tone: 'ok', notice: 'ok' };
}

function skuContourIssueKey(platform = '', apiSku = '') {
  return skuPlanFactIgnoreKey(platform || 'all', apiSku || '');
}

function skuContourOutOfScopeText(...values) {
  return values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .some((value) => /qeep|zarli|harly|harley|харли/.test(value));
}

function skuContourRegistryTokenSet() {
  const set = new Set();
  (state.skus || []).forEach((sku) => {
    [
      sku?.articleKey,
      sku?.article,
      sku?.sku,
      sku?.vendorCode,
      ...(Array.isArray(sku?.aliases) ? sku.aliases.map((item) => typeof item === 'string' ? item : (item?.value || item?.alias || '')) : [])
    ].forEach((value) => {
      const token = skuPlanFactToken(value || '');
      if (token) set.add(token);
    });
  });
  return set;
}

function skuContourAuditRowInScope(row = {}, registryTokens = null) {
  if (skuContourOutOfScopeText(row.apiSku, row.targetSku, row.fileName)) return false;
  const tokens = registryTokens || skuContourRegistryTokenSet();
  const targetToken = skuPlanFactToken(row.targetSku || '');
  const apiToken = skuPlanFactToken(row.apiSku || '');
  if (targetToken && tokens.has(targetToken)) return true;
  if (apiToken && tokens.has(apiToken)) return true;
  return row.kind === 'ignore' && !targetToken;
}

function skuContourPlatformKeys(rawPlatform = '') {
  const raw = String(rawPlatform || '').split(',').map((part) => part.trim()).filter(Boolean);
  const keys = raw.map((item) => skuPlanFactNormalizePlatform(item)).filter(Boolean);
  return keys.length ? keys : ['all'];
}

function skuContourKnownKeysFromIssue(issue = {}) {
  const apiSku = issue.articleKey || issue.api_sku || issue.apiSku || '';
  return skuContourPlatformKeys(issue.platform).map((platform) => skuContourIssueKey(platform, apiSku));
}

function skuContourIssueRows(model = {}) {
  const aliasKeys = new Set(
    skuPlanFactAliasRows(state.skuAliases || {})
      .filter(skuPlanFactAliasIsActive)
      .map((row) => skuContourIssueKey(row.platform || 'all', row.api_sku || row.apiSku || row.alias || row.value || ''))
  );
  const ignoredKeys = new Set(
    skuPlanFactActiveIgnoreRowsFromPayload(state.skuAliasIgnore || {})
      .map((row) => skuContourIssueKey(row.platform || 'all', row.api_sku || row.apiSku || row.alias || row.value || ''))
  );
  const quarantineKeys = new Set((state.portalDataQuarantine?.rows || []).map((row) => skuContourIssueKey(row.platform || 'all', row.articleKey || row.api_sku || row.apiSku || '')));
  const combined = [
    ...(state.portalDataQuality?.issues || []),
    ...(model.quality?.issues || [])
  ];
  const seen = new Set();
  return combined
    .map((issue) => {
      const apiSku = issue.articleKey || issue.api_sku || issue.apiSku || '';
      if (skuContourOutOfScopeText(apiSku, issue.name, issue.action, issue.type)) return null;
      const keys = skuContourKnownKeysFromIssue(issue);
      const type = String(issue.type || '').toLowerCase();
      let status = 'new';
      if (keys.some((key) => ignoredKeys.has(key))) status = 'ignored';
      else if (keys.some((key) => aliasKeys.has(key))) status = 'applied';
      else if (keys.some((key) => quarantineKeys.has(key))) status = 'quarantine';
      else if (type.includes('api_sku_known_outside_registry')) status = 'known';
      else if (type.includes('aggregate') || type.includes('агрегат') || type.includes('выше')) status = 'blocked';
      else if (type.includes('wb_owner_distribution')) status = 'new';
      else if (issue.severity === 'warning' || issue.severity === 'warn') status = 'warning';
      return {
        key: `${issue.type || ''}|${issue.platform || ''}|${apiSku}|${Math.round(numberOrZero(issue.revenue))}`,
        keys,
        status,
        type: issue.type || '',
        platform: issue.platform || '',
        apiSku,
        name: issue.name || '',
        revenue: numberOrZero(issue.revenue),
        units: numberOrZero(issue.units),
        action: issue.action || issue.message || ''
      };
    })
    .filter((row) => {
      if (!row) return false;
      if (!row.apiSku && !row.type) return false;
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    })
    .sort((left, right) => {
      const rank = { blocked: 0, quarantine: 1, new: 2, warning: 3, applied: 4, ignored: 5 };
      return (rank[left.status] ?? 9) - (rank[right.status] ?? 9) || numberOrZero(right.revenue) - numberOrZero(left.revenue);
    });
}

function skuContourIssueIsResolved(row = {}) {
  return row.status === 'applied' || row.status === 'ignored' || row.status === 'known';
}

function skuContourShowResolved() {
  return state.skuContourShowResolved === true;
}

function skuContourOnlyNew() {
  return state.skuContourOnlyNew === true;
}

function skuContourStatusCounts(rows = []) {
  return rows.reduce((acc, row) => {
    const key = row.status || 'new';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function skuContourFocusQueueHtml(rows = []) {
  if (!rows.length) return '<div class="sku-data-focus-empty">Очередь по текущей площадке пустая</div>';
  return rows.slice(0, 6).map((row) => {
    const meta = skuContourStatusMeta(row.status);
    const candidates = skuContourLikeForLikeCandidates(row, 1);
    const decision = skuContourRecommendedDecision(row, candidates);
    const platformLabel = typeof skuDataPlatformLabel === 'function'
      ? skuDataPlatformLabel(row.platform || 'all')
      : (row.platform || 'all');
    return `
      <button class="sku-data-focus-row" type="button" data-sku-contour-open-registry="${escapeHtml(row.apiSku || '')}">
        <span>
          <strong>${escapeHtml(row.apiSku || row.type || 'API SKU')}</strong>
          <em>${escapeHtml(decision.text || row.name || row.action || row.type || 'Нужен разбор')}</em>
          <small>
            ${badge(meta.label, meta.tone)}
            <span class="chip">${escapeHtml(platformLabel)}</span>
            ${badge(skuContourDecisionBadgeLabel(decision.decision), decision.tone)}
          </small>
        </span>
        <b>${fmt.money(row.revenue || 0)}</b>
      </button>
    `;
  }).join('');
}

function skuContourFocusBoardHtml({
  health = {},
  healthMeta = {},
  quality = {},
  quarantine = {},
  activeMarket = 'all',
  scopedIssueRows = [],
  issueRows = [],
  onlyNew = false,
  showResolved = false,
  hiddenResolvedCount = 0,
  hiddenByCurrentFilterCount = 0,
  wbMissingInDistribution = 0,
  wbMissingInPortal = 0
} = {}) {
  const statusCounts = skuContourStatusCounts(scopedIssueRows);
  const unresolvedRows = scopedIssueRows.filter((row) => !skuContourIssueIsResolved(row));
  const resolvedRows = scopedIssueRows.filter(skuContourIssueIsResolved);
  const progressRatio = scopedIssueRows.length ? resolvedRows.length / scopedIssueRows.length : 1;
  const blockerCount = numberOrZero(statusCounts.blocked || 0) + numberOrZero(statusCounts.quarantine || 0);
  const warningCount = numberOrZero(statusCounts.warning || 0);
  const newCount = numberOrZero(statusCounts.new || 0);
  const candidateCount = unresolvedRows.filter((row) => skuContourLikeForLikeCandidates(row, 1)[0]?.matchScore >= 0.48).length;
  const marketSkus = (state.skus || []).filter((sku) => typeof skuDataSkuBelongsToPlatform === 'function'
    ? skuDataSkuBelongsToPlatform(sku, activeMarket)
    : true);
  const workCount = marketSkus.filter((sku) => typeof skuDataWorkFlag === 'function'
    ? skuDataWorkFlag(sku, activeMarket)
    : Boolean(sku?.flags?.toWork)).length;
  const apiRiskRevenue = scopedIssueRows.reduce((sum, row) => sum + numberOrZero(row.revenue || 0), 0);
  const matrixIssueCount = unresolvedRows.length;
  const journeyStats = [
    { action: 'only-new-contour', label: 'В очереди', value: fmt.int(unresolvedRows.length), tone: unresolvedRows.length ? 'warn' : 'ok' },
    { action: 'open-contour', label: 'Кандидаты like-for-like', value: fmt.int(candidateCount), tone: candidateCount ? 'info' : '' },
    { action: 'open-contour', label: 'Блокеры', value: fmt.int(blockerCount), tone: blockerCount ? 'danger' : 'ok' },
    { action: 'planfact', label: 'SKU в работе', value: fmt.int(workCount), tone: workCount ? 'info' : '' }
  ];
  const actionBuckets = [
    { label: 'Новые', count: newCount, help: 'решить alias / ignore / new_sku', tone: newCount ? 'warn' : 'ok' },
    { label: 'Блокеры', count: numberOrZero(statusCounts.blocked || 0), help: 'сначала источник или дубль', tone: statusCounts.blocked ? 'danger' : 'ok' },
    { label: 'Карантин', count: numberOrZero(statusCounts.quarantine || quarantine.rows || 0), help: 'изолированные строки', tone: (statusCounts.quarantine || quarantine.rows) ? 'danger' : 'ok' },
    { label: 'Кандидаты', count: candidateCount, help: 'похоже на SKU в реестре', tone: candidateCount ? 'info' : '' },
    { label: 'Проверить', count: warningCount, help: 'ручной контроль', tone: warningCount ? 'warn' : '' },
    { label: 'Решено', count: resolvedRows.length, help: showResolved ? 'показаны в таблице' : 'скрыты из очереди', tone: resolvedRows.length ? 'ok' : '' },
    { label: 'WB owner', count: numberOrZero(wbMissingInDistribution) + numberOrZero(wbMissingInPortal), help: 'сверка распределения', tone: (wbMissingInDistribution || wbMissingInPortal) ? 'info' : '' }
  ];
  return `
    ${skuJourneyPanelHtml({ source: 'contour', activeMarket, contourProgress: progressRatio, unresolvedCount: unresolvedRows.length, blockerCount, matrixIssueCount, workCount, apiRiskRevenue, journeyStats })}
    <div class="sku-data-focus-board sku-data-focus-board--compact sku-contour-focus-board">
      <section class="sku-data-focus-panel">
        <div class="sku-data-focus-head">
          <h3>Действия по API-контуре</h3>
          <button class="quick-chip" type="button" data-sku-contour-refresh>Обновить</button>
        </div>
        <div class="sku-data-focus-actions">
          <button class="quick-chip primary" type="button" data-sku-contour-quality-export>Выгрузить форму</button>
          <button class="quick-chip" type="button" data-sku-contour-quality-import>Загрузить файл</button>
          <button class="quick-chip ${onlyNew ? 'active' : ''}" type="button" data-sku-contour-toggle-new>${onlyNew ? 'Все нерешённые' : 'Только новые'}</button>
          <button class="quick-chip ${showResolved ? 'active' : ''}" type="button" data-sku-contour-toggle-resolved>${showResolved ? 'Скрыть решённые' : `Показать решённые${hiddenResolvedCount ? ` (${fmt.int(hiddenResolvedCount)})` : ''}`}</button>
        </div>
        <div class="sku-data-bucket-grid sku-data-bucket-grid--compact">
          ${actionBuckets.map((item) => `
            <div class="sku-data-bucket ${escapeHtml(item.tone || '')}">
              <strong>${fmt.int(item.count)}</strong>
              <span>${escapeHtml(item.label)}</span>
              <em>${escapeHtml(item.help)}</em>
            </div>
          `).join('')}
        </div>
      </section>
      <section class="sku-data-focus-panel">
        <div class="sku-data-focus-head">
          <h3>Первым разобрать</h3>
          <button class="quick-chip" type="button" data-sku-contour-open-planfact>План-факт</button>
        </div>
        <div class="sku-data-focus-list">
          ${skuContourFocusQueueHtml(issueRows)}
        </div>
        ${hiddenByCurrentFilterCount ? `<div class="sku-data-focus-note">${fmt.int(hiddenByCurrentFilterCount)} строк скрыто текущими переключателями</div>` : ''}
      </section>
    </div>
  `;
}

function skuContourAuditIndex() {
  const map = new Map();
  const add = (key, event, kind, targetSku = '') => {
    if (!key || map.has(key)) return;
    map.set(key, {
      kind,
      targetSku,
      appliedAt: event.appliedAt || event.generatedAt || '',
      actor: event.actor || 'portal-user',
      fileName: event.fileName || '',
      eventId: event.id || ''
    });
  };
  skuPlanFactAuditEvents(state.skuAliasAudit || {}).forEach((event) => {
    (event.aliasKeys || []).forEach((rawKey) => {
      const parts = String(rawKey || '').split('|');
      if (parts.length >= 3) add(`${parts[1]}|${parts[2]}`, event, 'alias', parts[0] || '');
    });
    (event.ignoreKeys || []).forEach((rawKey) => add(String(rawKey || ''), event, 'ignore'));
  });
  return map;
}

function skuContourAuditForRow(row = {}, auditIndex = null) {
  const index = auditIndex || skuContourAuditIndex();
  for (const key of (row.keys || [])) {
    const event = index.get(key);
    if (event) return event;
  }
  return null;
}

function skuContourAuditJournalRows(limit = 24) {
  const rows = [];
  const registryTokens = skuContourRegistryTokenSet();
  skuPlanFactAuditEvents(state.skuAliasAudit || {}).forEach((event) => {
    (event.aliasKeys || []).forEach((rawKey) => {
      const parts = String(rawKey || '').split('|');
      rows.push({
        appliedAt: event.appliedAt || event.generatedAt || '',
        actor: event.actor || 'portal-user',
        fileName: event.fileName || '',
        kind: 'alias',
        targetSku: parts[0] || '',
        platform: parts[1] || '',
        apiSku: parts[2] || ''
      });
    });
    (event.ignoreKeys || []).forEach((rawKey) => {
      const parts = String(rawKey || '').split('|');
      rows.push({
        appliedAt: event.appliedAt || event.generatedAt || '',
        actor: event.actor || 'portal-user',
        fileName: event.fileName || '',
        kind: 'ignore',
        targetSku: '',
        platform: parts[0] || '',
        apiSku: parts[1] || ''
      });
    });
  });
  return rows
    .filter((row) => skuContourAuditRowInScope(row, registryTokens))
    .slice(0, limit);
}

function skuContourDownloadPayload() {
  skuPlanFactDownloadJson(`sku-contour-${todayIso()}.json`, {
    generatedAt: new Date().toISOString(),
    skuAliases: state.skuAliases || { aliases: [] },
    skuAliasIgnore: state.skuAliasIgnore || { ignored: [] },
    skuAliasAudit: state.skuAliasAudit || { events: [] },
    skuMatrix: state.skuMatrix || {},
    syncHealth: state.syncHealth || {},
    portalDataQuality: state.portalDataQuality || {},
    portalDataQuarantine: state.portalDataQuarantine || {},
    predictiveRisk: state.predictiveRisk || {},
    autoTaskSignals: state.autoTaskSignals || {},
    predictiveRiskOutcomeAudit: state.predictiveRiskOutcomeAudit || {}
  });
}

async function portalRefreshOperationalDataPayloads() {
  if (typeof loadJsonOrFallback !== 'function') return;
  const [skuMatrix, syncHealth, portalDataQuality, portalDataQuarantine, predictiveRisk, autoTaskSignals, predictiveRiskOutcomeAudit, lastGoodManifest] = await Promise.all([
    loadJsonOrFallback(
      'data/sku_matrix.json',
      { schema: 'portal-sku-matrix-v1', summary: {}, items: [], apiUnmapped: [], ignoredApiSku: [], indexes: { byArticleKey: {}, aliasToArticleKey: {} } },
      'SKU matrix'
    ),
    loadJsonOrFallback(
      'data/portal_sync_health.json',
      { schema: 'portal-sync-health-v1', status: '', publish: { allowed: true, blockingReasons: [], warnings: [] }, sources: {}, quality: {} },
      'Состояние sync'
    ),
    loadJsonOrFallback(
      'data/portal_data_quality.json',
      { generatedAt: '', status: '', summary: {}, issues: [] },
      'Контроль данных'
    ),
    loadJsonOrFallback(
      'data/portal_data_quarantine.json',
      { schema: 'portal-data-quarantine-v1', summary: {}, rows: [] },
      'Карантин данных'
    ),
    loadJsonOrFallback(
      'data/predictive_risk_snapshot.json',
      { schema: 'qharisma-predictive-risk-v1', generatedAt: '', summary: {}, risks: [], autoTaskSignals: [] },
      'Прогнозные риски'
    ),
    loadJsonOrFallback(
      'data/auto_task_signals.json',
      { schema: 'qharisma-auto-task-signals-v1', generatedAt: '', summary: {}, signals: [] },
      'Прогнозные автосигналы'
    ),
    loadJsonOrFallback(
      'data/predictive_risk_outcome_audit.json',
      { schema: 'qharisma-predictive-risk-outcome-audit-v1', generatedAt: '', asOfDate: '', windowDays: 14, signalsCreated: 0, risksDetected: 0 },
      'Аудит прогнозов'
    ),
    loadJsonOrFallback(
      'data/last_good/manifest.json',
      { generatedAt: '', files: [] },
      'last good manifest'
    )
  ]);
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
  state.portalLastGoodManifest = lastGoodManifest && typeof lastGoodManifest === 'object'
    ? lastGoodManifest
    : { generatedAt: '', files: [] };
}

function portalHealthSourceRows() {
  const seen = new Set();
  const rows = [];
  const add = (row = {}) => {
    const key = String(row.dataset || row.key || row.name || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    const lagDays = Number.isFinite(Number(row.lagDays)) ? Number(row.lagDays) : null;
    const exists = row.exists !== false;
    const rowsCount = Number(row.rows || 0);
    const status = String(row.status || '').toLowerCase();
    let tone = 'ok';
    if (!exists || status === 'critical' || status === 'blocked') tone = 'danger';
    else if (status === 'warning' || status === 'warn' || (lagDays !== null && lagDays > portalDataRuleNumber('staleSourceDays'))) tone = 'warn';
    else if (!rowsCount && key !== 'loyalty_system') tone = 'warn';
    rows.push({
      key,
      label: String(row.label || key).replaceAll('_', ' '),
      rows: rowsCount,
      generatedAt: row.generatedAt || '',
      asOfDate: row.asOfDate || '',
      lagDays,
      status: status || (tone === 'ok' ? 'ok' : 'warning'),
      tone,
      revenue: numberOrZero(row.revenue)
    });
  };
  (state.portalDataQuality?.freshness || []).forEach(add);
  Object.entries(state.syncHealth?.sources || {}).forEach(([key, value]) => add({ key, dataset: key, ...(value || {}) }));
  return rows.sort((left, right) => {
    const rank = { danger: 0, warn: 1, ok: 2 };
    return (rank[left.tone] ?? 9) - (rank[right.tone] ?? 9) || String(left.label).localeCompare(String(right.label));
  });
}

function portalHealthIssueTone(issue = {}) {
  const severity = String(issue.severity || issue.status || '').toLowerCase();
  if (['critical', 'danger', 'blocked', 'quarantine'].some((token) => severity.includes(token))) return 'danger';
  if (['warning', 'warn', 'new', 'need_check'].some((token) => severity.includes(token))) return 'warn';
  return issue.amount > 0 ? 'warn' : '';
}

const PORTAL_DATA_RULE_DEFAULTS = {
  stockRiskDays: 10,
  criticalRevenueRub: 1000000,
  staleSourceDays: 1,
  autoTaskLimit: 10
};

const PORTAL_DATA_RULE_LIMITS = {
  stockRiskDays: { min: 1, max: 180 },
  criticalRevenueRub: { min: 0 },
  staleSourceDays: { min: 0, max: 14 },
  autoTaskLimit: { min: 1, max: 50 }
};

function portalNormalizeDataRuleValue(key, value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return fallback;
  const limits = PORTAL_DATA_RULE_LIMITS[key] || {};
  const min = Number.isFinite(Number(limits.min)) ? Number(limits.min) : 0;
  const max = Number.isFinite(Number(limits.max)) ? Number(limits.max) : null;
  let next = Math.round(parsed);
  if (next < min) next = min;
  if (max !== null && next > max) next = max;
  return next;
}

function portalDataRules() {
  const raw = state.storage?.portalDataRules && typeof state.storage.portalDataRules === 'object'
    ? state.storage.portalDataRules
    : {};
  const next = { ...PORTAL_DATA_RULE_DEFAULTS };
  Object.keys(next).forEach((key) => {
    next[key] = portalNormalizeDataRuleValue(key, raw[key], next[key]);
  });
  return next;
}

function portalDataRuleNumber(key) {
  return Number(portalDataRules()[key] ?? PORTAL_DATA_RULE_DEFAULTS[key] ?? 0);
}

function portalPredictiveContourHtml() {
  const snapshot = state.predictiveRisk || {};
  const signalsPayload = state.autoTaskSignals || {};
  const audit = state.predictiveRiskOutcomeAudit || {};
  const summary = snapshot.summary || signalsPayload.summary || {};
  const signals = Array.isArray(signalsPayload.signals)
    ? signalsPayload.signals
    : (Array.isArray(snapshot.autoTaskSignals) ? snapshot.autoTaskSignals : []);
  const sources = Array.isArray(snapshot.dataFreshness?.sources) ? snapshot.dataFreshness.sources : [];
  const staleSources = sources.filter((source) => ['stale', 'missing'].includes(String(source.status || '').toLowerCase()));
  const generatedAt = snapshot.generatedAt || signalsPayload.generatedAt || audit.generatedAt || '';
  const riskCount = numberOrZero(summary.totalRisks || audit.risksDetected || snapshot.risks?.length || 0);
  const signalCount = numberOrZero(summary.autoTaskSignals || audit.signalsCreated || signals.length || 0);
  const criticalCount = numberOrZero(summary.critical || signals.filter((signal) => signal.priority === 'critical').length);
  const highCount = numberOrZero(summary.high || signals.filter((signal) => signal.priority === 'high').length);
  const tone = staleSources.length ? 'warn' : (criticalCount ? 'danger' : 'ok');
  const qualityText = audit.generatedAt
    ? `TP ${fmt.int(audit.confirmedTruePositive || 0)} · FP ${fmt.int(audit.falsePositive || 0)} · закрыто ${fmt.int(audit.tasksClosed || 0)} · игнор ${fmt.int(audit.ignoredByOwner || 0)}`
    : 'аудит ещё не собран';
  const avgAction = Number.isFinite(Number(audit.avgTimeToActionHours))
    ? `${Number(audit.avgTimeToActionHours).toFixed(1)} ч`
    : '—';
  return `
    <section class="data-health-digest" data-health-predictive-contour>
      <div class="section-subhead">
        <div>
          <h3>Прогнозный контур</h3>
          <p class="small muted">Ранние риски, авто-задачи и качество прогноза.</p>
        </div>
        ${badge(staleSources.length ? `${fmt.int(staleSources.length)} stale source` : 'источники свежие', tone)}
      </div>
      <div class="data-health-digest-grid">
        <div class="data-health-digest-card ${riskCount ? 'info' : 'ok'}"><span>рисков найдено</span><strong>${fmt.int(riskCount)}</strong></div>
        <div class="data-health-digest-card ${signalCount ? 'warn' : 'ok'}"><span>задач создано</span><strong>${fmt.int(signalCount)}</strong></div>
        <div class="data-health-digest-card ${criticalCount ? 'danger' : highCount ? 'warn' : 'ok'}"><span>critical / high</span><strong>${fmt.int(criticalCount)} / ${fmt.int(highCount)}</strong></div>
        <div class="data-health-digest-card ${staleSources.length ? 'warn' : 'ok'}"><span>свежесть</span><strong>${fmt.int(sources.length - staleSources.length)} / ${fmt.int(sources.length || 0)}</strong></div>
        <div class="data-health-digest-card info"><span>последняя сборка</span><strong>${escapeHtml(fmt.date(generatedAt || ''))}</strong></div>
        <div class="data-health-digest-card info"><span>${fmt.int(audit.windowDays || 14)} дней качества</span><strong>${escapeHtml(qualityText)}</strong></div>
        <div class="data-health-digest-card info"><span>реакция</span><strong>${escapeHtml(avgAction)}</strong></div>
        <div class="data-health-digest-card ${snapshot.dataFreshness?.status === 'stale' ? 'warn' : 'ok'}"><span>режим stale</span><strong>${escapeHtml(snapshot.dataFreshness?.status || '—')}</strong></div>
      </div>
    </section>
  `;
}

function portalSaveDataRules(raw = {}) {
  const current = portalDataRules();
  const next = { ...current };
  Object.keys(PORTAL_DATA_RULE_DEFAULTS).forEach((key) => {
    next[key] = portalNormalizeDataRuleValue(key, raw[key], current[key]);
  });
  state.storage = state.storage || {};
  state.storage.portalDataRules = next;
  state.storage.portalDataRulesUpdatedAt = new Date().toISOString();
  if (typeof saveLocalStorage === 'function') saveLocalStorage();
  return next;
}

function portalHealthIssueSnapshot(issues = []) {
  const rows = (issues || []).map((row) => ({
    key: row.key || [row.source, row.type, row.platform, row.apiSku || row.name].join('|'),
    title: [row.source, row.type, row.apiSku || row.name].filter(Boolean).join(' · '),
    tone: row.tone || '',
    amount: numberOrZero(row.amount)
  })).filter((row) => row.key);
  return {
    generatedAt: new Date().toISOString(),
    healthGeneratedAt: state.syncHealth?.generatedAt || state.portalDataQuality?.generatedAt || '',
    keys: rows.map((row) => row.key),
    rows
  };
}

function portalHealthSnapshotDiff(issues = []) {
  const current = portalHealthIssueSnapshot(issues);
  const previous = state.storage?.portalIssueSnapshot && typeof state.storage.portalIssueSnapshot === 'object'
    ? state.storage.portalIssueSnapshot
    : null;
  const previousKeys = new Set(Array.isArray(previous?.keys) ? previous.keys : []);
  const currentKeys = new Set(current.keys);
  const previousRows = Array.isArray(previous?.rows) ? previous.rows : [];
  const newRows = current.rows.filter((row) => !previousKeys.has(row.key));
  const closedRows = previousRows.filter((row) => !currentKeys.has(row.key));
  return {
    current,
    previous,
    newRows,
    closedRows,
    unchangedCount: current.rows.length - newRows.length
  };
}

function portalHealthCommitIssueSnapshot(issues = []) {
  state.storage = state.storage || {};
  state.storage.portalIssueSnapshot = portalHealthIssueSnapshot(issues);
  if (typeof saveLocalStorage === 'function') saveLocalStorage();
  return state.storage.portalIssueSnapshot;
}

function portalHealthSavedViews() {
  const rules = portalDataRules();
  return [
    {
      id: 'warehouse-risk',
      title: `Склад: закончится до ${fmt.int(rules.stockRiskDays)} дней`,
      text: 'Открывает Заказ товара с проблемными складами и нужным порогом дней.',
      view: 'order',
      tone: 'warn'
    },
    {
      id: 'api-unmapped',
      title: 'API без пары по выручке',
      text: 'Открывает Контур SKU, где можно выгрузить форму, загрузить решения и закрепить alias/ignore.',
      view: 'sku-contour',
      tone: 'danger'
    },
    {
      id: 'plan-fact-gaps',
      title: 'План-факт: нет плана или факта',
      text: 'Открывает план-факт SKU, чтобы проверить owner, план и потерянные API SKU.',
      view: 'sku-plan-fact',
      tone: 'warn'
    },
    {
      id: 'price-safety',
      title: 'Цены и репрайсер',
      text: 'Переход к ценовому контуру: MIN/MAX, safe export, ручные решения и аудит.',
      view: 'repricer',
      tone: 'info'
    }
  ];
}

function portalHealthApplySavedView(id = '') {
  const rules = portalDataRules();
  if (id === 'warehouse-risk') {
    state.orderProcurementUi = state.orderProcurementUi || {};
    state.orderProcurementUi.clusterFilter = 'low_stock';
    state.orderProcurementUi.clusterDays = rules.stockRiskDays;
    state.orderProcurementUi.mode = 'all';
    if (typeof setView === 'function') setView('order');
    return;
  }
  const target = portalHealthSavedViews().find((item) => item.id === id)?.view || 'data-health';
  if (typeof setView === 'function') setView(target);
}

function portalHealthIssueRows(limit = 240) {
  const rows = [];
  const seen = new Set();
  const add = (row = {}) => {
    const key = [
      row.source || '',
      row.type || '',
      row.platform || '',
      row.apiSku || row.articleKey || row.name || ''
    ].map((value) => String(value || '').toLowerCase()).join('|');
    if (!key.replace(/\|/g, '') || seen.has(key)) return;
    seen.add(key);
    const amount = numberOrZero(row.amount ?? row.revenue);
    const criticalRevenueRub = portalDataRuleNumber('criticalRevenueRub');
    const tone = row.tone || (criticalRevenueRub > 0 && amount >= criticalRevenueRub
      ? 'danger'
      : portalHealthIssueTone({ ...row, amount }));
    rows.push({
      key,
      source: row.source || 'Данные',
      type: row.type || 'Проверить',
      platform: row.platform || '',
      apiSku: row.apiSku || row.articleKey || '',
      name: row.name || '',
      status: row.status || row.severity || '',
      tone,
      amount,
      units: numberOrZero(row.units),
      action: row.action || row.message || '',
      view: row.view || 'data-health'
    });
  };

  const model = typeof skuPlanFactBuildModel === 'function' ? skuPlanFactBuildModel() : {};
  if (typeof skuContourIssueRows === 'function') {
    skuContourIssueRows(model)
      .filter((row) => !(typeof skuContourIssueIsResolved === 'function' && skuContourIssueIsResolved(row)))
      .forEach((row) => add({
        source: 'Контур SKU',
        type: row.type || 'API SKU без пары',
        platform: row.platform,
        apiSku: row.apiSku,
        name: row.name,
        status: row.status,
        amount: row.revenue,
        units: row.units,
        action: row.action || 'Разобрать через alias / ignore / new_sku / need_check',
        view: 'sku-contour'
      }));
  }

  (model.allRows || []).filter((row) => !row.syntheticUnmapped && row.factRevenue > 0 && row.planRevenue <= 0).slice(0, 40).forEach((row) => add({
    source: 'План-факт SKU',
    type: 'Есть факт, нет плана',
    platform: '',
    apiSku: row.articleKey || row.article,
    name: row.name,
    status: 'warning',
    amount: row.factRevenue,
    units: row.factUnits,
    action: 'Проверить, должен ли SKU быть в плане. Если да — добавить план/owner; если нет — подтвердить статус вывода.',
    view: 'sku-plan-fact'
  }));

  (model.allRows || []).filter((row) => row.planRevenue > 0 && row.factRevenue <= 0).slice(0, 40).forEach((row) => add({
    source: 'План-факт SKU',
    type: 'План есть, факта нет',
    platform: '',
    apiSku: row.articleKey || row.article,
    name: row.name,
    status: 'warning',
    amount: row.planToDateRevenue || row.planRevenue,
    units: row.planUnits,
    action: 'Проверить наличие, карточку, цену и маппинг факта. Это может быть реальная остановка продаж или потерянный API SKU.',
    view: 'sku-plan-fact'
  }));

  const stockRiskDays = Math.max(1, portalDataRuleNumber('stockRiskDays') || PORTAL_DATA_RULE_DEFAULTS.stockRiskDays);
  (model.allRows || [])
    .filter((row) => (row.platforms ? Object.values(row.platforms) : [])
      .some((metric) => metric && Number.isFinite(Number(metric.turnoverDays)) && Number(metric.turnoverDays) > 0 && Number(metric.turnoverDays) <= stockRiskDays))
    .slice(0, 40)
    .forEach((row) => add({
      source: 'Заказ товара',
      type: `Закончится до ${fmt.int(stockRiskDays)} дней`,
      platform: '',
      apiSku: row.articleKey || row.article,
      name: row.name,
      status: 'warning',
      amount: row.factRevenue,
      units: row.factUnits,
      action: `Открыть заказ товара, включить проблемные склады и проверить поставку по складам. Порог настраивается в правилах: ${fmt.int(stockRiskDays)} дней.`,
      view: 'order'
    }));

  (state.syncHealth?.publish?.blockingReasons || []).forEach((message, index) => add({
    source: 'Sync',
    type: 'Блокер публикации',
    status: 'blocked',
    name: `sync-blocker-${index + 1}`,
    action: message,
    view: 'data-health'
  }));
  (state.syncHealth?.publish?.warnings || []).forEach((message, index) => add({
    source: 'Sync',
    type: 'Предупреждение sync',
    status: 'warning',
    name: `sync-warning-${index + 1}`,
    action: message,
    view: 'data-health'
  }));

  (state.skuMatrix?.duplicateRisks || []).forEach((row) => add({
    source: 'Факты API',
    type: 'Риск дубля выручки',
    platform: row.platform,
    apiSku: row.api_sku || row.apiSku || row.articleKey,
    name: row.name,
    status: 'critical',
    amount: row.overage || row.revenue,
    units: row.units,
    action: row.action || 'Проверить ключ уникальности факта и карантин дублей',
    view: 'data-health'
  }));

  const missingOwner = (state.skuMatrix?.items || []).filter((item) => !item.owner || item.problemState === 'missing_owner').slice(0, 30);
  missingOwner.forEach((item) => add({
    source: 'Матрица SKU',
    type: 'SKU без owner',
    apiSku: item.articleKey || item.article,
    name: item.name,
    status: 'warning',
    action: 'Назначить owner в реестре SKU, чтобы планы и задачи не висели без ответственного',
    view: 'skus'
  }));

  (state.portalDataQuarantine?.rows || []).slice(0, 80).forEach((row) => add({
    source: 'Карантин данных',
    type: row.type || row.reason || 'Строка в карантине',
    platform: row.platform,
    apiSku: row.articleKey || row.api_sku || row.apiSku,
    name: row.name,
    status: 'quarantine',
    amount: row.revenue,
    units: row.units,
    action: row.action || row.message || 'Разобрать причину карантина до попадания в расчёты',
    view: 'sku-contour'
  }));

  return rows
    .sort((left, right) => {
      const rank = { danger: 0, warn: 1, ok: 2, '': 3 };
      return (rank[left.tone] ?? 9) - (rank[right.tone] ?? 9) || numberOrZero(right.amount) - numberOrZero(left.amount);
    })
    .slice(0, limit);
}

function portalHealthIssueTaskId(issue = {}) {
  const raw = `portal-data-issue|${issue.key || ''}|${issue.source || ''}|${issue.type || ''}|${issue.platform || ''}|${issue.apiSku || issue.name || ''}`;
  return typeof stableId === 'function' ? stableId('task', raw) : `task-${raw}`;
}

function portalHealthBuildIssueTask(issue = {}) {
  const titleKey = issue.apiSku || issue.name || issue.platform || 'контур';
  const taskPayload = {
    id: portalHealthIssueTaskId(issue),
    source: 'auto',
    autoCode: 'portal_data_issue',
    articleKey: issue.apiSku || '',
    entityLabel: titleKey,
    title: `${issue.type}: ${titleKey}`,
    nextAction: issue.action || 'Разобрать проблему данных и закрыть причину, чтобы она не возвращалась после sync.',
    reason: [
      issue.source ? `контур: ${issue.source}` : '',
      issue.platform ? `площадка: ${issue.platform}` : '',
      issue.amount ? `влияние: ${fmt.money(issue.amount)}` : ''
    ].filter(Boolean).join(' · '),
    owner: '',
    due: typeof plusDays === 'function' ? plusDays(issue.tone === 'danger' ? 1 : 2) : '',
    status: 'new',
    type: issue.type && /owner/i.test(issue.type) ? 'assignment' : 'general',
    priority: issue.tone === 'danger' ? 'critical' : 'high',
    platform: skuPlanFactNormalizePlatform(issue.platform || 'all') || 'all'
  };
  return typeof normalizeTask === 'function' ? normalizeTask(taskPayload, 'auto') : taskPayload;
}

function portalHealthTodayDigestRows({ issues = [], sources = [], summary = {}, dangerCount = 0, warnCount = 0 } = {}) {
  const rows = [];
  const add = (title, text, tone = '') => rows.push({ title, text, tone });
  const staleSources = sources.filter((row) => row.tone !== 'ok').slice(0, 3);
  const topIssue = issues[0] || null;
  const todayKey = todayIso();
  const todayAuditEvents = skuPlanFactAuditEvents(state.skuAliasAudit || {})
    .filter((event) => String(event.appliedAt || event.generatedAt || '').slice(0, 10) === todayKey);
  const appliedToday = todayAuditEvents.reduce((acc, event) => {
    acc.alias += numberOrZero(event.aliasesAdded);
    acc.ignore += numberOrZero(event.ignoresAdded);
    acc.rollback += event.type === 'sku_alias_import_rollback' ? 1 : 0;
    return acc;
  }, { alias: 0, ignore: 0, rollback: 0 });

  add(
    dangerCount ? 'Сначала критичное' : 'Критичных блокеров нет',
    dangerCount
      ? `${fmt.int(dangerCount)} строк нужно разобрать первыми. Самая крупная: ${topIssue ? `${topIssue.type} · ${fmt.money(topIssue.amount)}` : 'см. очередь ниже'}.`
      : 'Можно работать по обычной очереди: сначала предупреждения, потом хвосты без owner и плана.',
    dangerCount ? 'danger' : 'ok'
  );
  add(
    staleSources.length ? 'Проверить источники' : 'Источники свежие',
    staleSources.length
      ? staleSources.map((row) => `${row.label}: ${row.asOfDate || 'нет даты'}`).join(' · ')
      : `Данные актуальны до ${state.syncHealth?.freshness?.maxDate || summary.maxDate || 'текущего среза'}.`,
    staleSources.length ? 'warn' : 'ok'
  );
  add(
    'Что закрепили сегодня',
    appliedToday.alias || appliedToday.ignore || appliedToday.rollback
      ? `${fmt.int(appliedToday.alias)} alias · ${fmt.int(appliedToday.ignore)} ignore · ${fmt.int(appliedToday.rollback)} откатов.`
      : 'Сегодня ещё не применяли alias/ignore через портал.',
    appliedToday.rollback ? 'warn' : 'info'
  );
  add(
    summary.apiUnmappedRevenue ? 'API без пары влияет на деньги' : 'API без пары под контролем',
    summary.apiUnmappedRevenue
      ? `${fmt.money(summary.apiUnmappedRevenue)} пока не привязано к матрице. Разбирать лучше сверху вниз по сумме.`
      : 'Нет значимого оборота без пары по текущему health-срезу.',
    summary.apiUnmappedRevenue ? 'warn' : 'ok'
  );
  return rows;
}

function portalHealthLastGoodHtml() {
  const manifest = state.portalLastGoodManifest || {};
  const publish = state.syncHealth?.publish || {};
  const allowed = publish.allowed !== false;
  const generatedAt = manifest.generatedAt || manifest.createdAt || manifest.updatedAt || '';
  const files = Array.isArray(manifest.files) ? manifest.files.length : numberOrZero(manifest.fileCount);
  const tone = allowed ? 'ok' : 'danger';
  const title = allowed ? 'Текущий срез разрешён' : 'Публикация заблокирована';
  const text = allowed
    ? 'Портал показывает свежий опубликованный срез. Если sync завтра приедет криво, здесь будет видно, что надо смотреть последний хороший.'
    : `Портал должен показывать последний хороший срез${generatedAt ? ` от ${fmt.date(generatedAt)}` : ''}, пока блокеры sync не закрыты.`;
  return `
    <div class="notice ${allowed ? 'ok' : 'warn'}" data-health-last-good>
      <div class="section-subhead">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <div class="small muted">${escapeHtml(text)}</div>
        </div>
        <div class="badge-stack">
          ${badge(allowed ? 'можно доверять' : 'последний хороший', tone)}
          ${generatedAt ? badge(`last good ${fmt.date(generatedAt)}`, 'info') : ''}
          ${files ? badge(`${fmt.int(files)} файлов`, 'info') : ''}
        </div>
      </div>
    </div>
  `;
}

function portalHealthChangesHtml(diff = {}) {
  const previousAt = diff.previous?.generatedAt || '';
  const newPreview = (diff.newRows || []).slice(0, 5).map((row) => `
    <div class="alert-row">
      <div><strong>${escapeHtml(row.title || row.key)}</strong><div class="muted small">${fmt.money(row.amount)}</div></div>
      ${badge('новая', row.tone || 'warn')}
    </div>
  `).join('');
  const closedPreview = (diff.closedRows || []).slice(0, 5).map((row) => `
    <div class="alert-row">
      <div><strong>${escapeHtml(row.title || row.key)}</strong><div class="muted small">${fmt.money(row.amount)}</div></div>
      ${badge('закрыта', 'ok')}
    </div>
  `).join('');
  return `
    <div class="card sku-plan-fact-card" data-health-change-digest>
      <div class="section-subhead">
        <div>
          <h3>Что изменилось с прошлого контроля</h3>
          <p class="small muted">${previousAt ? `Сравнение с отметкой ${escapeHtml(fmt.date(previousAt))}.` : 'Пока нет сохранённой отметки: нажмите “зафиксировать срез”, и дальше портал будет показывать только изменения.'}</p>
        </div>
        <div class="badge-stack">
          ${badge(`новых ${fmt.int((diff.newRows || []).length)}`, (diff.newRows || []).length ? 'warn' : 'ok')}
          ${badge(`закрыто ${fmt.int((diff.closedRows || []).length)}`, (diff.closedRows || []).length ? 'ok' : 'info')}
          ${badge(`без изменений ${fmt.int(diff.unchangedCount || 0)}`, 'info')}
          <button class="quick-chip" type="button" data-health-save-snapshot>Зафиксировать текущий срез</button>
        </div>
      </div>
      <div class="two-col" style="margin-top:12px">
        <div>
          <div class="muted small" style="margin-bottom:6px">Новые проблемы</div>
          <div class="alert-stack">${newPreview || '<div class="empty">Новых проблем нет</div>'}</div>
        </div>
        <div>
          <div class="muted small" style="margin-bottom:6px">Закрылись после прошлого контроля</div>
          <div class="alert-stack">${closedPreview || '<div class="empty">Пока ничего не закрылось</div>'}</div>
        </div>
      </div>
    </div>
  `;
}

function portalHealthRulesHtml(rules = portalDataRules()) {
  return `
    <details class="card sku-plan-fact-card" data-health-rules open>
      <summary style="cursor:pointer;font-weight:800">Правила тревог и автозадач</summary>
      <form class="data-health-rules-form" data-health-rules-form novalidate>
        <label class="mini-kpi data-health-rule-field">
          <span>Товар закончится, дней</span>
          <input name="stockRiskDays" type="text" inputmode="numeric" pattern="[0-9\\s,.]*" autocomplete="off" value="${escapeHtml(rules.stockRiskDays)}">
          <span>для “Заказа товара” и общей очереди</span>
        </label>
        <label class="mini-kpi data-health-rule-field">
          <span>Критичная сумма, ₽</span>
          <input name="criticalRevenueRub" type="text" inputmode="numeric" pattern="[0-9\\s,.]*" autocomplete="off" value="${escapeHtml(rules.criticalRevenueRub)}">
          <span>выше этой суммы проблема становится критичной</span>
        </label>
        <label class="mini-kpi data-health-rule-field">
          <span>Просрочка источника, дней</span>
          <input name="staleSourceDays" type="text" inputmode="numeric" pattern="[0-9\\s,.]*" autocomplete="off" value="${escapeHtml(rules.staleSourceDays)}">
          <span>порог для утренней проверки свежести</span>
        </label>
        <label class="mini-kpi data-health-rule-field">
          <span>Автозадач за раз</span>
          <input name="autoTaskLimit" type="text" inputmode="numeric" pattern="[0-9\\s,.]*" autocomplete="off" value="${escapeHtml(rules.autoTaskLimit)}">
          <span>чтобы не плодить лишнее</span>
        </label>
        <div class="quick-actions data-health-rules-actions">
          <button class="quick-chip" type="submit">Сохранить правила</button>
        </div>
      </form>
    </details>
  `;
}

function portalHealthSourceExplanationHtml(summary = {}) {
  const cards = [
    {
      key: 'revenue',
      title: 'Выручка и факт',
      text: 'Берём fact/API продажи по площадкам, затем проверяем дубли, карантин и связь API SKU с матрицей.',
      value: fmt.money(summary.totalRevenue || summary.revenue || 0)
    },
    {
      key: 'api-unmapped',
      title: 'API без пары',
      text: 'Это продажи, где площадка отдала API SKU, но он ещё не связан с реестром SKU через alias и не занесён в ignore.',
      value: fmt.money(summary.apiUnmappedRevenue || 0)
    },
    {
      key: 'freshness',
      title: 'Свежесть источников',
      text: 'Смотрим дату данных, дату сборки, количество строк и лаг относительно максимальной даты текущего sync.',
      value: state.syncHealth?.freshness?.maxDate || summary.maxDate || '—'
    },
    {
      key: 'quarantine',
      title: 'Карантин',
      text: 'Строки, которые не должны тихо попадать в расчёты: дубли, блокеры sync, подозрительные агрегаты и ошибки источников.',
      value: fmt.int(state.portalDataQuarantine?.summary?.rows || state.portalDataQuarantine?.rows?.length || 0)
    }
  ];
  return `
    <div class="card sku-plan-fact-card" data-health-source-explain>
      <div class="section-subhead">
        <div>
          <h3>Откуда берутся цифры</h3>
          <p class="small muted">Короткая расшифровка, чтобы у каждой ключевой цифры был понятный источник и смысл.</p>
        </div>
        ${badge('прозрачность расчёта', 'info')}
      </div>
      <div class="grid cards" style="margin-top:12px">
        ${cards.map((card) => `
          <div class="mini-kpi">
            <span>${escapeHtml(card.title)}</span>
            <strong>${escapeHtml(card.value)}</strong>
            <span>${escapeHtml(card.text)}</span>
            <button class="quick-chip" type="button" data-health-explain="${escapeHtml(card.key)}">Подробнее</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function portalHealthWorkModesHtml() {
  const roles = [
    ['warehouse-risk', 'Склад', 'Заканчивается, к заказу, в пути, проблемные склады.', 'warn'],
    ['api-unmapped', 'Категория / SKU', 'API без пары, owner, новые SKU, alias и ignore.', 'danger'],
    ['price-safety', 'Коммерция', 'Цены, репрайсер, маржа, safe export и стоп-листы.', 'info'],
    ['plan-fact-gaps', 'Руководитель', 'План-факт, крупные отклонения, открытые проблемы.', 'ok']
  ];
  const saved = portalHealthSavedViews();
  return `
    <div class="card sku-plan-fact-card" data-health-work-modes>
      <div class="section-subhead">
        <div>
          <h3>Рабочие режимы без лишнего</h3>
          <p class="small muted">Не заставляем людей собирать фильтры заново: каждый открывает свой готовый срез.</p>
        </div>
        ${badge(`${fmt.int(saved.length)} представления`, 'info')}
      </div>
      <div class="grid cards" style="margin-top:12px">
        ${roles.map(([id, title, text, tone]) => `
          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>${escapeHtml(title)}</h3>
                <p class="small muted">${escapeHtml(text)}</p>
              </div>
              ${badge('открыть', tone)}
            </div>
            <button class="quick-chip" type="button" data-health-saved-view="${escapeHtml(id)}">Перейти в режим</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function portalHealthUploadWizardHtml() {
  return `
    <div class="card sku-plan-fact-card" data-health-upload-wizard>
      <div class="section-subhead">
        <div>
          <h3>Загрузка файлов без страха</h3>
          <p class="small muted">Правило простое: сначала выгрузить форму, заполнить только рабочие колонки, загрузить обратно, посмотреть отчёт, потом применить.</p>
        </div>
        ${badge('есть откат', 'ok')}
      </div>
      <div class="kpi-strip" style="margin-top:12px">
        <div class="mini-kpi"><span>1</span><strong>Выгрузить форму</strong><span>из Контура SKU или План-факта</span></div>
        <div class="mini-kpi"><span>2</span><strong>Заполнить решение</strong><span>alias / ignore / new_sku / need_check</span></div>
        <div class="mini-kpi"><span>3</span><strong>Проверить отчёт</strong><span>сколько применится и что пропущено</span></div>
        <div class="mini-kpi"><span>4</span><strong>Применить или откатить</strong><span>журнал сохранит кто, когда и что поменял</span></div>
      </div>
      <div class="quick-actions" style="margin-top:12px">
        <button class="quick-chip" type="button" data-health-open="sku-contour">Открыть Контур SKU</button>
        <button class="quick-chip" type="button" data-health-open="sku-plan-fact">Открыть План-факт</button>
      </div>
    </div>
  `;
}

function portalHealthHistoryHtml() {
  const auditRows = skuContourAuditJournalRows(8);
  const taskRows = (state.storage?.tasks || []).slice(0, 8).map((task) => ({
    date: task.updatedAt || task.createdAt || '',
    title: task.title || task.name || task.articleKey || '',
    status: task.status || ''
  }));
  const auditHtml = auditRows.map((row) => `
    <div class="alert-row">
      <div><strong>${escapeHtml(row.kind)} · ${escapeHtml(row.apiSku || row.targetSku || '')}</strong><div class="muted small">${escapeHtml(row.platform || '')} · ${escapeHtml(row.actor || '')}</div></div>
      ${badge(fmt.date(row.appliedAt), 'info')}
    </div>
  `).join('');
  const taskHtml = taskRows.map((row) => `
    <div class="alert-row">
      <div><strong>${escapeHtml(row.title)}</strong><div class="muted small">${escapeHtml(row.status || '')}</div></div>
      ${badge(row.date ? fmt.date(row.date) : 'без даты', 'info')}
    </div>
  `).join('');
  return `
    <div class="card sku-plan-fact-card" data-health-history>
      <div class="section-subhead">
        <div>
          <h3>История изменений</h3>
          <p class="small muted">Видно, что уже применяли в справочниках и какие задачи появились. Это снижает страх “куда делась ошибка”.</p>
        </div>
        ${badge('журнал', 'info')}
      </div>
      <div class="two-col" style="margin-top:12px">
        <div><div class="muted small" style="margin-bottom:6px">Alias / ignore / откаты</div>${auditHtml || '<div class="empty">Пока нет применений через портал</div>'}</div>
        <div><div class="muted small" style="margin-bottom:6px">Последние задачи</div>${taskHtml || '<div class="empty">Задач пока нет</div>'}</div>
      </div>
    </div>
  `;
}

function portalHealthSkuPassportHtml() {
  const sku = (state.skus || []).find((item) => item?.articleKey) || null;
  return `
    <div class="card sku-plan-fact-card" data-health-sku-passport>
      <div class="section-subhead">
        <div>
          <h3>Единая карточка SKU</h3>
          <p class="small muted">Из любого раздела SKU открывается как паспорт товара: owner, задачи, решения, комментарии и рабочие сигналы. Следующий шаг — постепенно добавить туда цены, alias/API и репрайсерные причины.</p>
        </div>
        ${badge('единая точка', 'ok')}
      </div>
      <div class="quick-actions" style="margin-top:12px">
        ${sku ? `<button class="quick-chip" type="button" data-open-sku="${escapeHtml(sku.articleKey)}">Открыть пример SKU</button>` : ''}
        <button class="quick-chip" type="button" data-health-open="sku-contour">Открыть SKU workspace</button>
      </div>
    </div>
  `;
}

async function portalHealthCreateIssueTasks(options = {}) {
  const sourceRows = Array.isArray(options.rows) ? options.rows : portalHealthIssueRows(120);
  const rows = sourceRows.filter((row) => row.tone === 'danger' || row.tone === 'warn').slice(0, options.limit || 10);
  const result = { created: [], duplicates: [] };
  state.storage = state.storage || {};
  state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
  const existingIds = new Set(state.storage.tasks.map((task) => task.id).filter(Boolean));
  rows.forEach((row) => {
    const task = portalHealthBuildIssueTask(row);
    if (!task.id || existingIds.has(task.id)) {
      result.duplicates.push({ issue: row.key, taskId: task.id || '' });
      return;
    }
    existingIds.add(task.id);
    result.created.push(task);
  });
  if (options.persist === false || !result.created.length) return result;
  state.storage.tasks.unshift(...result.created);
  if (typeof saveLocalStorage === 'function') saveLocalStorage();
  for (const task of result.created) {
    try {
      if (typeof persistTask === 'function') await persistTask(task);
      if (typeof createTaskHistoryEntry === 'function') {
        await createTaskHistoryEntry(task.id, 'created', 'Задача создана из Центра здоровья данных.');
      }
    } catch (error) {
      console.error('[portal-health-issue-task]', error);
    }
  }
  return result;
}

function portalHealthGameModel({ issues = [], sources = [], summary = {}, meta = {}, dangerCount = 0, warnCount = 0 } = {}) {
  const blocked = state.syncHealth?.publish?.allowed === false || String(state.syncHealth?.status || '').toLowerCase() === 'blocked';
  const staleCount = sources.filter((row) => row.tone !== 'ok').length;
  const quarantineCount = numberOrZero(state.portalDataQuarantine?.summary?.rows || state.portalDataQuarantine?.rows?.length || 0);
  const apiUnmapped = numberOrZero(summary.apiUnmappedUniqueSku || state.skuMatrix?.summary?.apiUnmappedCount || 0);
  let score = 100;
  score -= blocked ? 30 : 0;
  score -= dangerCount * 14;
  score -= warnCount * 3;
  score -= staleCount * 7;
  score -= quarantineCount > 0 ? Math.min(18, 4 + quarantineCount) : 0;
  score -= apiUnmapped > 0 ? Math.min(12, Math.ceil(apiUnmapped / 4)) : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const tone = blocked || dangerCount || score < 65 ? 'danger' : (warnCount || staleCount || score < 88 ? 'warn' : 'ok');
  const hue = tone === 'danger' ? 5 : (tone === 'warn' ? 42 : 145);
  const level = tone === 'danger' ? 'STOP' : (tone === 'warn' ? 'CHECK' : 'GO');
  const title = tone === 'danger'
    ? 'Сначала чинить данные'
    : (tone === 'warn' ? 'Работать можно, но есть хвосты' : 'Цифрам можно доверять');
  const nextAction = tone === 'danger'
    ? 'Разобрать красные сигналы и блокеры sync.'
    : (tone === 'warn' ? 'Закрыть верхние предупреждения по очереди.' : 'Открыть рабочие вкладки и продолжать план-факт.');
  return {
    score,
    tone,
    hue,
    level,
    title,
    nextAction,
    checkedAt: state.syncHealth?.generatedAt || state.syncHealth?.publish?.checkedAt || state.portalDataQuality?.generatedAt || '',
    dataTo: state.syncHealth?.freshness?.maxDate || summary.maxDate || '',
    statusLabel: meta.label || state.syncHealth?.status || 'Sync',
    blocked,
    staleCount,
    quarantineCount,
    apiUnmapped
  };
}

function portalHealthActionCardsHtml(issues = []) {
  const focusGroups = [];
  const bySignal = new Map();
  (issues || []).filter((row) => row.tone === 'danger' || row.tone === 'warn').forEach((row) => {
    const signalName = String(row.apiSku || row.name || row.source || 'Контур данных').trim();
    const signalType = String(row.type || 'Проверить').trim();
    const key = `${signalType.toLowerCase()}|${signalName.toLowerCase()}|${row.view || ''}`;
    const current = bySignal.get(key);
    if (current) {
      current.count += 1;
      current.amount += numberOrZero(row.amount);
      current.units += numberOrZero(row.units);
      if (row.tone === 'danger') current.tone = 'danger';
      if (row.platform && !current.platforms.includes(row.platform)) current.platforms.push(row.platform);
      if (!current.action && row.action) current.action = row.action;
      return;
    }
    const group = {
      ...row,
      name: signalName,
      type: signalType,
      amount: numberOrZero(row.amount),
      units: numberOrZero(row.units),
      count: 1,
      platforms: row.platform ? [row.platform] : []
    };
    bySignal.set(key, group);
    focusGroups.push(group);
  });
  const focusRows = focusGroups.sort((a, b) => {
    const toneDelta = (a.tone === 'danger' ? 0 : 1) - (b.tone === 'danger' ? 0 : 1);
    if (toneDelta) return toneDelta;
    return (numberOrZero(b.amount) + numberOrZero(b.units)) - (numberOrZero(a.amount) + numberOrZero(a.units));
  }).slice(0, 4);
  if (!focusRows.length) {
    return `
      <div class="data-health-action-card ok">
        <span class="data-health-action-index">OK</span>
        <div>
          <strong>Нет срочных разборов</strong>
          <p>Критичные сигналы не найдены. Можно идти в план-факт, репрайсер или заказы.</p>
        </div>
        <button class="quick-chip" type="button" data-health-open="dashboard">Дашборд</button>
      </div>
    `;
  }
  return focusRows.map((row, index) => `
    <div class="data-health-action-card ${row.tone || 'warn'}">
      <span class="data-health-action-index">${fmt.int(index + 1)}</span>
      <div>
        <strong>${escapeHtml(row.type || 'Проверить')}</strong>
        <p>${escapeHtml(row.name || row.apiSku || row.source || 'Контур данных')}${row.count > 1 ? ` · ${fmt.int(row.count)} сигнала` : ''}</p>
        <em>${escapeHtml(row.platforms?.length ? row.platforms.join(', ') : (row.action || row.source || ''))}</em>
      </div>
      <div class="data-health-action-side">
        ${row.amount ? `<b>${fmt.money(row.amount)}</b>` : badge(row.source || 'данные', row.tone || 'warn')}
        <button class="quick-chip" type="button" data-health-open="${escapeHtml(row.view || 'data-health')}">Открыть</button>
      </div>
    </div>
  `).join('');
}

function portalHealthIssueExportRows(issues = []) {
  const factTo = state.syncHealth?.freshness?.maxDate || state.portalDataQuality?.summary?.maxDate || todayIso();
  const monthKey = String(factTo || todayIso()).slice(0, 7);
  return (issues || []).map((issue) => ({
    decision: 'need_check',
    decision_hint: issue.apiSku ? 'alias / ignore / new_sku / need_check' : 'служебный сигнал, решать в профильной вкладке',
    target_sku: '',
    platform: issue.platform || '',
    api_sku: issue.apiSku || '',
    status: issue.status || 'active',
    note: '',
    month: monthKey,
    fact_to: factTo,
    severity: issue.tone || issue.severity || '',
    type: issue.type || '',
    article_key: issue.articleKey || issue.apiSku || issue.name || '',
    name: issue.name || issue.source || '',
    revenue: Math.round(numberOrZero(issue.amount || issue.revenue)),
    units: Math.round(numberOrZero(issue.units)),
    recommended_action: issue.action || issue.source || ''
  }));
}

function downloadPortalHealthIssuesExcel(issues = []) {
  const rows = portalHealthIssueExportRows(issues);
  if (!rows.length) {
    window.alert('Сигналов для выгрузки нет.');
    return;
  }
  if (typeof downloadLaunchesHtmlTable === 'function' && typeof skuPlanFactQualityExportColumns === 'function') {
    downloadLaunchesHtmlTable(skuPlanFactQualityExportColumns(), rows, `portal-data-health-issues-${todayIso()}.xls`);
    return;
  }
  skuPlanFactDownloadJson(`portal-data-health-issues-${todayIso()}.json`, rows);
}

function portalHealthContourCardHtml(card = {}) {
  const ratio = Math.max(0, Math.min(1, Number(card.ratio) || 0));
  const hue = card.tone === 'danger' ? 5 : (card.tone === 'warn' ? 42 : (card.tone === 'info' ? 212 : 145));
  return `
    <button class="data-health-contour-card ${card.tone || 'ok'}" type="button" data-health-open="${escapeHtml(card.view || 'data-health')}" style="--dh-hue:${hue};--dh-fill:${(ratio * 100).toFixed(1)}%">
      <span>
        <strong>${escapeHtml(card.title || '')}</strong>
        <em>${escapeHtml(card.caption || '')}</em>
      </span>
      <b>${escapeHtml(card.value || '')}</b>
      <i><small></small></i>
    </button>
  `;
}

function portalHealthContourCardsHtml({ issues = [], sources = [], summary = {}, matrixSummary = {}, game = {} } = {}) {
  const staleCount = sources.filter((row) => row.tone !== 'ok').length;
  const quarantineCount = numberOrZero(state.portalDataQuarantine?.summary?.rows || state.portalDataQuarantine?.rows?.length || 0);
  const apiUnmapped = numberOrZero(summary.apiUnmappedUniqueSku || matrixSummary.apiUnmappedCount || 0);
  const apiRegistryGap = numberOrZero(summary.apiKnownOutsideRegistryUniqueSku || 0);
  const missingOwner = numberOrZero(summary.skuMissingOwner || matrixSummary.missingOwnerCount || 0);
  const planIssues = issues.filter((row) => row.view === 'sku-plan-fact').length;
  const cards = [
    {
      title: 'Sync',
      caption: staleCount ? 'есть несвежие источники' : 'источники в норме',
      value: staleCount ? `${fmt.int(staleCount)} проверить` : 'OK',
      ratio: staleCount ? 0.55 : 1,
      tone: staleCount || game.blocked ? (game.blocked ? 'danger' : 'warn') : 'ok',
      view: 'data-health'
    },
    {
      title: 'SKU пары',
      caption: apiUnmapped ? 'API без связи с матрицей' : (apiRegistryGap ? 'покрыто командным min/max' : 'alias/ignore под контролем'),
      value: apiUnmapped ? fmt.int(apiUnmapped) : (apiRegistryGap ? `${fmt.int(apiRegistryGap)} min/max` : 'OK'),
      ratio: apiUnmapped ? Math.max(0.15, 1 - apiUnmapped / 80) : (apiRegistryGap ? Math.max(0.45, 1 - apiRegistryGap / 120) : 1),
      tone: apiUnmapped ? 'warn' : (apiRegistryGap ? 'info' : 'ok'),
      view: 'sku-contour'
    },
    {
      title: 'План-факт',
      caption: planIssues ? 'есть строки к разбору' : 'без срочных разрывов',
      value: planIssues ? fmt.int(planIssues) : 'OK',
      ratio: planIssues ? Math.max(0.2, 1 - planIssues / 80) : 1,
      tone: planIssues ? 'warn' : 'ok',
      view: 'sku-plan-fact'
    },
    {
      title: 'Owner',
      caption: missingOwner ? 'нет ответственного' : 'ответственные назначены',
      value: missingOwner ? fmt.int(missingOwner) : 'OK',
      ratio: missingOwner ? Math.max(0.25, 1 - missingOwner / 60) : 1,
      tone: missingOwner ? 'warn' : 'ok',
      view: 'skus'
    },
    {
      title: 'Карантин',
      caption: quarantineCount ? 'строки не в расчётах' : 'чисто',
      value: quarantineCount ? fmt.int(quarantineCount) : '0',
      ratio: quarantineCount ? Math.max(0.2, 1 - quarantineCount / 50) : 1,
      tone: quarantineCount ? 'danger' : 'ok',
      view: 'sku-contour'
    }
  ];
  return cards.map(portalHealthContourCardHtml).join('');
}

function portalHealthBindActions(root, rootId, rules, issues) {
  root.querySelector('[data-health-refresh]')?.addEventListener('click', (event) => refreshSkuPlanFactData(event.currentTarget, rootId));
  root.querySelector('[data-health-export]')?.addEventListener('click', () => downloadPortalHealthIssuesExcel(issues));
  root.querySelector('[data-health-import]')?.addEventListener('click', () => root.querySelector('[data-health-quality-file]')?.click());
  root.querySelector('[data-health-quality-file]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    await handleSkuPlanFactAliasImport(file, rootId);
    window.requestAnimationFrame(() => {
      document.querySelector(`#${rootId} [data-health-import-report]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  root.querySelector('[data-health-create-tasks]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    try {
      button.disabled = true;
      button.textContent = 'Создаём...';
      const result = await portalHealthCreateIssueTasks({ limit: rules.autoTaskLimit || 10 });
      renderPortalDataHealth(rootId);
      if (typeof setAppError === 'function') setAppError(`Создано задач: ${fmt.int(result.created.length)} · уже были: ${fmt.int(result.duplicates.length)}.`);
    } finally {
      button.disabled = false;
      button.textContent = originalText || 'Создать задачи';
    }
  });
  root.querySelectorAll('[data-health-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = String(button.dataset.healthJump || 'queue');
      let targetEl = null;
      if (target === 'sources') {
        const tech = root.querySelector('.data-health-tech');
        if (tech) tech.open = true;
        targetEl = root.querySelector('.data-health-source-table') || tech;
      } else if (target === 'report') {
        targetEl = root.querySelector('[data-health-import-report]');
      } else {
        const queue = root.querySelector('.data-health-queue');
        if (queue) queue.open = true;
        targetEl = queue;
      }
      targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  root.querySelectorAll('[data-health-open]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof setView === 'function') setView(button.dataset.healthOpen || 'data-health');
    });
  });
  root.querySelector('[data-health-save-snapshot]')?.addEventListener('click', () => {
    portalHealthCommitIssueSnapshot(issues);
    renderPortalDataHealth(rootId);
    if (typeof setAppError === 'function') setAppError('Текущий срез проблем зафиксирован. Завтра портал покажет только новые и закрытые изменения.');
  });
  root.querySelector('[data-health-rules-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    portalSaveDataRules({
      stockRiskDays: form.get('stockRiskDays'),
      criticalRevenueRub: form.get('criticalRevenueRub'),
      staleSourceDays: form.get('staleSourceDays'),
      autoTaskLimit: form.get('autoTaskLimit')
    });
    renderPortalDataHealth(rootId);
    if (typeof setAppError === 'function') setAppError('Правила сохранены. Очередь проблем и складской порог пересчитаны.');
  });
  root.querySelectorAll('[data-health-saved-view]').forEach((button) => {
    button.addEventListener('click', () => portalHealthApplySavedView(button.dataset.healthSavedView || ''));
  });
  root.querySelectorAll('[data-health-explain]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = String(button.dataset.healthExplain || '');
      const text = {
        revenue: 'Выручка собирается из fact/API строк площадок. До попадания в портал строки проверяются на дубли, карантин и связь с матрицей SKU.',
        'api-unmapped': 'API без пары означает: площадка прислала SKU/offer_id, но портал не знает, к какому SKU реестра его отнести. Решение закрепляется через alias или ignore.',
        freshness: 'Свежесть считается по asOfDate/generatedAt каждого источника. Если лаг больше правила в настройках, источник подсвечивается.',
        quarantine: 'Карантин нужен, чтобы подозрительные строки не смешивались с нормальным расчётом. Их надо разбирать отдельно, а не молча считать.'
      }[key] || 'Для этой цифры пока нет отдельной расшифровки.';
      window.alert(text);
    });
  });
  root.querySelector('[data-sku-plan-fact-apply-import]')?.addEventListener('click', async (event) => {
    await handleSkuPlanFactApplyAliasImport(event.currentTarget, rootId);
  });
  root.querySelector('[data-sku-plan-fact-download-aliases]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    if (report.aliasPayload) skuPlanFactDownloadJson('sku_aliases.updated.json', report.aliasPayload);
  });
  root.querySelector('[data-sku-plan-fact-download-ignore]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    if (report.ignorePayload) skuPlanFactDownloadJson('sku_alias_ignore.updated.json', report.ignorePayload);
  });
  root.querySelector('[data-sku-plan-fact-download-import-report]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    const { aliasPayload, ignorePayload, ...publicReport } = report;
    skuPlanFactDownloadJson(`sku-alias-import-report-${todayIso()}.json`, publicReport);
  });
}

function renderPortalDataHealth(rootId = 'view-data-health') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const health = state.syncHealth || {};
  const quality = state.portalDataQuality || {};
  const rawSummary = quality.summary || {};
  const summary = {
    ...rawSummary,
    apiUnmappedPlatformRows: numberOrZero(rawSummary.apiUnmappedActionRows || 0),
    apiUnmappedUniqueSku: numberOrZero(rawSummary.apiUnmappedActionUniqueSku || 0),
    apiUnmappedRevenue: numberOrZero(rawSummary.apiUnmappedActionRevenue || 0)
  };
  const matrixSummary = {
    ...(state.skuMatrix?.summary || {}),
    apiUnmappedCount: numberOrZero(rawSummary.apiUnmappedActionRows || 0)
  };
  const sources = portalHealthSourceRows();
  const issues = portalHealthIssueRows();
  const rules = portalDataRules();
  const issueDiff = portalHealthSnapshotDiff(issues);
  const meta = typeof syncHealthStatusMeta === 'function'
    ? syncHealthStatusMeta(health)
    : { label: health.status || 'sync', tone: health.status === 'warning' ? 'warn' : 'ok', notice: health.status === 'warning' ? 'warn' : 'ok' };
  const dangerCount = issues.filter((row) => row.tone === 'danger').length;
  const warnCount = issues.filter((row) => row.tone === 'warn').length;
  const game = portalHealthGameModel({ issues, sources, summary, meta, dangerCount, warnCount });
  const actionCardsHtml = portalHealthActionCardsHtml(issues);
  const contourCardsHtml = portalHealthContourCardsHtml({ issues, sources, summary, matrixSummary, game });
  const compactIssueRows = issues.slice(0, 36).map((row) => `
    <tr>
      <td>${badge(row.tone === 'danger' ? 'стоп' : row.tone === 'warn' ? 'проверить' : 'ok', row.tone)}</td>
      <td><strong>${escapeHtml(row.type)}</strong><div class="muted small">${escapeHtml(row.source || '')}</div></td>
      <td><strong>${escapeHtml(row.apiSku || row.name || '—')}</strong><div class="muted small">${escapeHtml(row.name || '')}</div></td>
      <td>${row.amount ? fmt.money(row.amount) : '—'}</td>
      <td><button class="quick-chip" type="button" data-health-open="${escapeHtml(row.view || 'data-health')}">Открыть</button></td>
    </tr>
  `).join('');
  const sourceRowsCompact = sources.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.label)}</strong></td>
      <td>${badge(row.status || 'ok', row.tone)}</td>
      <td>${escapeHtml(row.asOfDate || '—')}</td>
      <td>${escapeHtml(fmt.date(row.generatedAt || ''))}</td>
      <td>${fmt.int(row.rows)}</td>
      <td>${row.lagDays === null ? '—' : `${fmt.int(row.lagDays)} дн.`}</td>
    </tr>
  `).join('');
  const digestCardsHtml = portalHealthTodayDigestRows({ issues, sources, summary, dangerCount, warnCount })
    .map((row) => `
      <div class="data-health-digest-card ${row.tone || ''}">
        <span>${escapeHtml(row.title)}</span>
        <strong>${escapeHtml(row.text)}</strong>
      </div>
    `).join('');
  const changeHtmlNew = portalHealthChangesHtml(issueDiff);
  const rulesHtmlNew = portalHealthRulesHtml(rules);
  const sourceExplainHtmlNew = portalHealthSourceExplanationHtml(summary);
  const workModesHtmlNew = portalHealthWorkModesHtml();
  const uploadWizardHtmlNew = portalHealthUploadWizardHtml();
  const historyHtmlNew = portalHealthHistoryHtml();
  const importReportHtmlNew = skuPlanFactAliasImportReportHtml(state.skuPlanFactAliasImportReport || null);
  root.innerHTML = `
    <div class="data-health-shell">
      <div class="section-title sku-data-title">
        <div>
          <h2>Здоровье данных</h2>
          <p>Пульт доверия к цифрам: можно ли сегодня работать с планами, KPI и задачами.</p>
        </div>
        <div class="quick-actions">
          <button class="quick-chip" type="button" data-health-open="sku-contour">Контур SKU</button>
          <button class="quick-chip" type="button" data-health-open="control">Задачи</button>
        </div>
      </div>

      <section class="data-health-hero data-health-hero-wide ${game.tone}" style="--dh-hue:${game.hue};--dh-score:${game.score}%">
        <div class="data-health-hero-top">
          <div class="data-health-score">
            <span>уровень доверия</span>
            <strong>${fmt.int(game.score)}</strong>
            <em>${escapeHtml(game.level)}</em>
          </div>
          <div class="data-health-hero-copy">
            <div class="data-health-hero-head">
              <h3>${escapeHtml(game.title)}</h3>
              <p>${escapeHtml(game.nextAction)}</p>
            </div>
            <div class="badge-stack">
              ${badge(game.statusLabel, game.tone)}
              ${badge(`данные до ${game.dataTo || '—'}`, game.staleCount ? 'warn' : 'ok')}
              ${badge(`${fmt.int(issues.length)} сигналов`, issues.length ? 'warn' : 'ok')}
            </div>
          </div>
          <div class="data-health-hero-tools">
            <button class="quick-chip" type="button" data-health-jump="queue">К проблемам</button>
            <button class="quick-chip" type="button" data-health-export>Выгрузить проблемы</button>
            <button class="quick-chip primary" type="button" data-health-import>Загрузить решение</button>
            <button class="quick-chip" type="button" data-health-create-tasks>Создать задачи</button>
            <button class="quick-chip" type="button" data-health-refresh>Обновить</button>
            <input type="file" accept=".csv,.xls,.html,.txt" data-health-quality-file hidden>
          </div>
        </div>
        <button class="data-health-xp-track data-health-xp-button" type="button" data-health-jump="queue" title="Открыть очередь проблем">
          <i></i><span>80</span><span>90</span><span>100</span>
        </button>
        <div class="data-health-hero-stats data-health-problem-strip">
          <button class="data-health-stat-pill danger" type="button" data-health-jump="queue"><em>красные</em><b>${fmt.int(dangerCount)}</b><small>разобрать первыми</small></button>
          <button class="data-health-stat-pill warn" type="button" data-health-jump="queue"><em>проверить</em><b>${fmt.int(warnCount)}</b><small>не тянуть в KPI</small></button>
          <button class="data-health-stat-pill ${game.staleCount ? 'warn' : 'ok'}" type="button" data-health-jump="sources"><em>источники</em><b>${fmt.int(sources.length - game.staleCount)} / ${fmt.int(sources.length)}</b><small>свежесть sync</small></button>
          <button class="data-health-stat-pill ${game.quarantineCount ? 'danger' : 'ok'}" type="button" data-health-jump="queue"><em>карантин</em><b>${fmt.int(game.quarantineCount)}</b><small>не в расчётах</small></button>
        </div>
      </section>

      ${importReportHtmlNew ? `<section class="data-health-import-report" data-health-import-report>${importReportHtmlNew}</section>` : ''}

      ${portalPredictiveContourHtml()}

      <section class="data-health-focus">
        <div class="section-subhead">
          <div>
            <h3>Что делать первым</h3>
            <p class="small muted">Только верхушка очереди. Остальное ниже и в профильных вкладках.</p>
          </div>
          ${badge(`${fmt.int(issues.length)} сигналов`, issues.length ? 'warn' : 'ok')}
        </div>
        <div class="data-health-action-grid">${actionCardsHtml}</div>
      </section>

      <section class="data-health-contours">
        <div class="section-subhead">
          <div>
            <h3>Контуры</h3>
            <p class="small muted">Пять зон, где обычно ломается доверие к цифрам.</p>
          </div>
          ${badge('нажми, чтобы перейти', 'info')}
        </div>
        <div class="data-health-contour-grid">${contourCardsHtml}</div>
      </section>

      <section class="data-health-digest" data-health-morning-digest>
        <div class="section-subhead">
          <div>
            <h3>Утренний срез</h3>
            <p class="small muted">Коротко: что изменилось, где деньги и что уже закрепили.</p>
          </div>
        </div>
        <div class="data-health-digest-grid">${digestCardsHtml}</div>
      </section>

      <details class="data-health-queue">
        <summary>Очередь сигналов</summary>
        <div class="table-scroll">
          <table class="data-table compact">
            <thead><tr><th>Уровень</th><th>Проблема</th><th>SKU/API</th><th>Влияние</th><th></th></tr></thead>
            <tbody>${compactIssueRows || '<tr><td colspan="5"><div class="empty">Срочных сигналов нет</div></td></tr>'}</tbody>
          </table>
        </div>
      </details>

      <details class="data-health-tech">
        <summary>Технические детали и правила</summary>
        <div class="data-health-tech-grid">
          ${changeHtmlNew}
          ${rulesHtmlNew}
          ${sourceExplainHtmlNew}
          ${workModesHtmlNew}
          ${uploadWizardHtmlNew}
          ${historyHtmlNew}
          <div class="card sku-plan-fact-card data-health-source-table">
            <div class="section-subhead">
              <div>
                <h3>Свежесть источников</h3>
                <p class="small muted">Таблица для проверки API/sync, дат и объёма строк.</p>
              </div>
              ${badge(`${fmt.int(game.staleCount)} не в норме`, game.staleCount ? 'warn' : 'ok')}
            </div>
            <div class="table-scroll">
              <table class="data-table compact">
                <thead><tr><th>Источник</th><th>Статус</th><th>Дата данных</th><th>Собрано</th><th>Строк</th><th>Лаг</th></tr></thead>
                <tbody>${sourceRowsCompact || '<tr><td colspan="6"><div class="empty">Нет данных по источникам</div></td></tr>'}</tbody>
              </table>
            </div>
          </div>
        </div>
      </details>
    </div>
  `;
  portalHealthBindActions(root, rootId, rules, issues);
  return;
  const digestRows = portalHealthTodayDigestRows({ issues, sources, summary, dangerCount, warnCount });
  const changeHtml = portalHealthChangesHtml(issueDiff);
  const rulesHtml = portalHealthRulesHtml(rules);
  const sourceExplainHtml = portalHealthSourceExplanationHtml(summary);
  const workModesHtml = portalHealthWorkModesHtml();
  const uploadWizardHtml = portalHealthUploadWizardHtml();
  const historyHtml = portalHealthHistoryHtml();
  const skuPassportHtml = portalHealthSkuPassportHtml();
  const sourceRows = sources.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.label)}</strong></td>
      <td>${badge(row.status || 'ok', row.tone)}</td>
      <td>${escapeHtml(row.asOfDate || '—')}</td>
      <td>${escapeHtml(fmt.date(row.generatedAt || ''))}</td>
      <td>${fmt.int(row.rows)}</td>
      <td>${row.lagDays === null ? '—' : `${fmt.int(row.lagDays)} дн.`}</td>
    </tr>
  `).join('');
  const issueRows = issues.slice(0, 120).map((row) => `
    <tr>
      <td>${badge(row.tone === 'danger' ? 'критично' : row.tone === 'warn' ? 'внимание' : 'ok', row.tone)}</td>
      <td><strong>${escapeHtml(row.source)}</strong><div class="muted small">${escapeHtml(row.status || '')}</div></td>
      <td><strong>${escapeHtml(row.type)}</strong><div class="muted small">${escapeHtml(row.action || '')}</div></td>
      <td>${escapeHtml(row.platform || 'Все')}</td>
      <td><strong>${escapeHtml(row.apiSku || row.name || '—')}</strong><div class="muted small">${escapeHtml(row.name || '')}</div></td>
      <td><strong>${fmt.money(row.amount)}</strong><div class="muted small">${fmt.int(row.units)} шт.</div></td>
      <td><button class="quick-chip" type="button" data-health-open="${escapeHtml(row.view || 'data-health')}">Открыть</button></td>
    </tr>
  `).join('');
  const digestHtml = digestRows.map((row) => `
    <div class="mini-kpi ${row.tone || ''}">
      <span>${escapeHtml(row.title)}</span>
      <strong style="font-size:16px;line-height:1.25">${escapeHtml(row.text)}</strong>
      <span>утренний рабочий срез</span>
    </div>
  `).join('');

  root.innerHTML = `
    <div class="section-title sku-data-title">
      <div>
        <h2>Здоровье данных</h2>
        <p>Короткий контроль утреннего sync, качества данных и проблем, которые уже влияют на расчёты.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" type="button" data-health-refresh>Обновить</button>
        <button class="quick-chip" type="button" data-health-create-tasks>Создать задачи по топ-проблемам</button>
        <button class="quick-chip" type="button" data-health-open="sku-contour">Контур SKU</button>
        <button class="quick-chip" type="button" data-health-open="control">Задачи</button>
      </div>
    </div>

    <div class="notice ${meta.notice || (meta.tone === 'danger' ? 'warn' : 'ok')}">
      <div class="section-subhead">
        <div>
          <strong>${escapeHtml(meta.label || 'Sync')}</strong>
          <div class="small muted">Проверено: ${escapeHtml(fmt.date(health.generatedAt || health.publish?.checkedAt || quality.generatedAt || ''))} · данные до ${escapeHtml(health.freshness?.maxDate || summary.maxDate || '—')}</div>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(sources.length)} источников`, sources.some((row) => row.tone !== 'ok') ? 'warn' : 'ok')}
          ${badge(`${fmt.int(dangerCount)} критично`, dangerCount ? 'danger' : 'ok')}
          ${badge(`${fmt.int(warnCount)} внимание`, warnCount ? 'warn' : 'ok')}
          ${badge(fmt.money(summary.apiUnmappedRevenue || 0), summary.apiUnmappedRevenue ? 'warn' : 'ok')}
        </div>
      </div>
    </div>

    ${portalHealthLastGoodHtml()}

    <div class="kpi-strip" style="margin-top:14px">
      <div class="mini-kpi ${dangerCount ? 'danger' : ''}"><span>Проблемы</span><strong>${fmt.int(issues.length)}</strong><span>в единой очереди</span></div>
      <div class="mini-kpi ${summary.apiUnmappedRevenue || summary.apiUnmappedUniqueSku || matrixSummary.apiUnmappedCount ? 'warn' : ''}"><span>API без пары</span><strong>${fmt.int(summary.apiUnmappedUniqueSku || matrixSummary.apiUnmappedCount || 0)}</strong><span>${fmt.money(summary.apiUnmappedRevenue || 0)}</span></div>
      <div class="mini-kpi"><span>Карантин</span><strong>${fmt.int(state.portalDataQuarantine?.summary?.rows || state.portalDataQuarantine?.rows?.length || 0)}</strong><span>не в расчётах</span></div>
      <div class="mini-kpi ${summary.skuMissingOwner || matrixSummary.missingOwnerCount ? 'warn' : ''}"><span>Без owner</span><strong>${fmt.int(summary.skuMissingOwner || matrixSummary.missingOwnerCount || 0)}</strong><span>нужны ответственные</span></div>
      <div class="mini-kpi"><span>Alias</span><strong>${fmt.int(matrixSummary.aliasCount || skuPlanFactAliasRows(state.skuAliases || {}).length)}</strong><span>общий контур</span></div>
      <div class="mini-kpi"><span>Ignore</span><strong>${fmt.int(matrixSummary.ignoredApiSkuCount || skuPlanFactIgnorePayloadRows(state.skuAliasIgnore || {}).length)}</strong><span>закреплено</span></div>
    </div>

    <div class="dashboard-grid-3" style="margin-top:14px">
      ${changeHtml}
      ${rulesHtml}
    </div>

    <div class="card sku-plan-fact-card" style="margin-top:14px" data-health-morning-digest>
      <div class="section-subhead">
        <div>
          <h3>Утро: что проверить первым</h3>
          <p class="small muted">Короткая выжимка без лишней аналитики: свежесть, крупные проблемы, что уже закрепили и где деньги могут быть не в матрице.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(digestRows.length)} пункта`, 'info')}</div>
      </div>
      <div class="kpi-strip">${digestHtml}</div>
    </div>

    <div class="two-col" style="margin-top:14px">
      ${sourceExplainHtml}
      ${workModesHtml}
    </div>

    <div class="two-col" style="margin-top:14px">
      ${uploadWizardHtml}
      ${skuPassportHtml}
    </div>

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Что требует внимания</h3>
          <p class="small muted">Сюда сведены SKU-контур, карантин, предупреждения sync, риски дублей и строки без owner. Это не заменяет вкладки, а даёт один утренний список.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(issues.length)} строк`, issues.length ? 'warn' : 'ok')}</div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Уровень</th><th>Контур</th><th>Проблема</th><th>Площадка</th><th>SKU/API</th><th>Влияние</th><th></th></tr></thead>
          <tbody>${issueRows || '<tr><td colspan="7"><div class="empty">Критичных проблем по текущему срезу нет</div></td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:14px">
      ${historyHtml}
    </div>

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Свежесть источников</h3>
          <p class="small muted">Проверка, что утренний API/sync реально подгрузил данные, а не оставил старый или пустой источник.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(sources.filter((row) => row.tone !== 'ok').length)} не в норме`, sources.some((row) => row.tone !== 'ok') ? 'warn' : 'ok')}</div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Источник</th><th>Статус</th><th>Дата данных</th><th>Собрано</th><th>Строк</th><th>Лаг</th></tr></thead>
          <tbody>${sourceRows || '<tr><td colspan="6"><div class="empty">Нет данных по источникам</div></td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  root.querySelector('[data-health-refresh]')?.addEventListener('click', (event) => refreshSkuPlanFactData(event.currentTarget, rootId));
  root.querySelector('[data-health-create-tasks]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    try {
      button.disabled = true;
      button.textContent = 'Создаём...';
      const result = await portalHealthCreateIssueTasks({ limit: rules.autoTaskLimit || 10 });
      renderPortalDataHealth(rootId);
      if (typeof setAppError === 'function') setAppError(`Создано задач: ${fmt.int(result.created.length)} · уже были: ${fmt.int(result.duplicates.length)}.`);
    } finally {
      button.disabled = false;
      button.textContent = originalText || 'Создать задачи по топ-проблемам';
    }
  });
  root.querySelectorAll('[data-health-open]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof setView === 'function') setView(button.dataset.healthOpen || 'data-health');
    });
  });
  root.querySelector('[data-health-save-snapshot]')?.addEventListener('click', () => {
    portalHealthCommitIssueSnapshot(issues);
    renderPortalDataHealth(rootId);
    if (typeof setAppError === 'function') setAppError('Текущий срез проблем зафиксирован. Завтра портал покажет только новые и закрытые изменения.');
  });
  root.querySelector('[data-health-rules-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    portalSaveDataRules({
      stockRiskDays: form.get('stockRiskDays'),
      criticalRevenueRub: form.get('criticalRevenueRub'),
      staleSourceDays: form.get('staleSourceDays'),
      autoTaskLimit: form.get('autoTaskLimit')
    });
    renderPortalDataHealth(rootId);
    if (typeof setAppError === 'function') setAppError('Правила сохранены. Очередь проблем и складской порог пересчитаны.');
  });
  root.querySelectorAll('[data-health-saved-view]').forEach((button) => {
    button.addEventListener('click', () => portalHealthApplySavedView(button.dataset.healthSavedView || ''));
  });
  root.querySelectorAll('[data-health-explain]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = String(button.dataset.healthExplain || '');
      const text = {
        revenue: 'Выручка собирается из fact/API строк площадок. До попадания в портал строки проверяются на дубли, карантин и связь с матрицей SKU.',
        'api-unmapped': 'API без пары означает: площадка прислала SKU/offer_id, но портал не знает, к какому SKU реестра его отнести. Решение закрепляется через alias или ignore.',
        freshness: 'Свежесть считается по asOfDate/generatedAt каждого источника. Если лаг больше правила в настройках, источник подсвечивается.',
        quarantine: 'Карантин нужен, чтобы подозрительные строки не смешивались с нормальным расчётом. Их надо разбирать отдельно, а не молча считать.'
      }[key] || 'Для этой цифры пока нет отдельной расшифровки.';
      window.alert(text);
    });
  });
}

function renderSkuContour(rootId = 'view-sku-contour') {
  const root = document.getElementById(rootId);
  if (!root) return;
  if (rootId === 'view-sku-contour' && state.skuWorkspaceMode === 'registry' && typeof renderSkuRegistry === 'function') {
    renderSkuRegistry(rootId);
    return;
  }
  if (rootId === 'view-sku-contour') state.skuWorkspaceMode = 'contour';
  const model = skuPlanFactBuildModel();
  const health = state.syncHealth || {};
  const matrix = state.skuMatrix || {};
  const rawQuality = state.portalDataQuality?.summary || model.quality || {};
  const matrixSummary = {
    ...(matrix.summary || {}),
    apiUnmappedCount: numberOrZero(rawQuality.apiUnmappedActionRows || 0)
  };
  const healthMeta = skuContourHealthMeta(health);
  const skuHealth = health.skuContour || {};
  const skuHealthProblems = (skuHealth.checks || []).filter((check) => check.status && check.status !== 'ok');
  const quality = {
    ...rawQuality,
    apiUnmappedPlatformRows: numberOrZero(rawQuality.apiUnmappedActionRows || 0),
    apiUnmappedUniqueSku: numberOrZero(rawQuality.apiUnmappedActionUniqueSku || 0),
    apiUnmappedRevenue: numberOrZero(rawQuality.apiUnmappedActionRevenue || 0)
  };
  const quarantine = state.portalDataQuarantine?.summary || {};
  const wbMissingInDistribution = numberOrZero(quality.wbOwnerMissingInDistribution || state.portalDataQuality?.wbOwnerDistributionSummary?.missingInDistributionCount || 0);
  const wbMissingInPortal = numberOrZero(quality.wbOwnerMissingInPortal || state.portalDataQuality?.wbOwnerDistributionSummary?.missingInPortalCount || 0);
  const auditEvents = skuPlanFactAuditEvents(state.skuAliasAudit || {}).slice(0, 8);
  const latestRollbackEvent = skuContourLatestRollbackableEvent();
  const allIssueRows = skuContourIssueRows(model);
  const activeMarket = skuDataActiveMarket();
  const scopedIssueRows = activeMarket === 'all'
    ? allIssueRows
    : allIssueRows.filter((row) => skuDataIssueMatchesPlatform(row, activeMarket));
  const showResolved = skuContourShowResolved();
  const onlyNew = skuContourOnlyNew();
  const resolvedIssueCount = scopedIssueRows.filter(skuContourIssueIsResolved).length;
  const newIssueCount = scopedIssueRows.filter((row) => row.status === 'new').length;
  let issueRows = showResolved ? scopedIssueRows : scopedIssueRows.filter((row) => !skuContourIssueIsResolved(row));
  if (onlyNew) issueRows = issueRows.filter((row) => row.status === 'new');
  const hiddenResolvedCount = resolvedIssueCount;
  const hiddenByCurrentFilterCount = scopedIssueRows.length - issueRows.length;
  const auditIndex = skuContourAuditIndex();
  const issueHtml = issueRows.slice(0, 120).map((row) => {
    const meta = skuContourStatusMeta(row.status);
    const history = skuContourAuditForRow(row, auditIndex);
    const readableType = skuContourReadableIssueType(row.type);
    return `
      <tr>
        <td>${badge(meta.label, meta.tone)}</td>
        <td><strong>${escapeHtml(readableType)}</strong><div class="muted small">${escapeHtml(row.action || row.type || '')}</div></td>
        <td>${escapeHtml(row.platform || 'Все')}</td>
        <td><strong>${escapeHtml(row.apiSku || '—')}</strong><div class="muted small">${escapeHtml(row.name || '')}</div></td>
        <td><strong>${fmt.money(row.revenue)}</strong><div class="muted small">${fmt.int(row.units)} шт.</div></td>
        <td class="sku-contour-next-cell">${skuContourRowNextActionHtml(row, history)}</td>
      </tr>
    `;
  }).join('');
  const journalHtml = skuContourAuditJournalRows().map((row) => `
    <tr>
      <td>${escapeHtml(fmt.date(row.appliedAt))}</td>
      <td>${badge(row.kind, row.kind === 'ignore' ? 'ok' : 'info')}</td>
      <td>${escapeHtml(row.platform || 'all')}</td>
      <td><strong>${escapeHtml(row.apiSku || '—')}</strong></td>
      <td>${escapeHtml(row.targetSku || '—')}</td>
      <td>${escapeHtml(row.actor || 'portal-user')}<div class="muted small">${escapeHtml(row.fileName || '')}</div></td>
    </tr>
  `).join('');
  const auditHtml = auditEvents.map((event) => `
    <tr>
      <td>${escapeHtml(fmt.date(event.appliedAt || event.generatedAt || ''))}</td>
      <td>${escapeHtml(event.actor || 'portal-user')}</td>
      <td>${escapeHtml(event.fileName || '—')}</td>
      <td>${fmt.int(event.aliasesAdded || 0)} alias / ${fmt.int(event.ignoresAdded || 0)} ignore</td>
      <td>${fmt.int(event.validationWarnings || 0)} warn</td>
      <td>${event.type === 'sku_alias_import_rollback' ? badge('откат', 'info') : event.rollback ? badge('версия', 'warn') : '<span class="muted">—</span>'}</td>
    </tr>
  `).join('');
  const contourPlatformBoardHtml = skuDataPlatformBoardHtml(model, { activeMarket, issueRows: allIssueRows });
  const contourGameCardsHtml = skuDataGameCardsHtml(skuDataSharedCards(
    model,
    activeMarket,
    (state.skus || []).filter((sku) => skuDataSkuBelongsToPlatform(sku, activeMarket)),
    scopedIssueRows
  ));

  root.innerHTML = `
    <div class="section-title sku-data-title">
      <div>
        <h2>Контур SKU</h2>
        <p>Единое место для API SKU без пары, alias/ignore, аудита и статуса утреннего sync.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" type="button" data-sku-contour-refresh>Обновить</button>
        <button class="quick-chip ${onlyNew ? 'active' : ''}" type="button" data-sku-contour-toggle-new>${onlyNew ? 'Все нерешённые' : `Только новые${newIssueCount ? ` (${fmt.int(newIssueCount)})` : ''}`}</button>
        <button class="quick-chip" type="button" data-sku-contour-toggle-resolved>${showResolved ? 'Скрыть решённые' : `Показать решённые${hiddenResolvedCount ? ` (${fmt.int(hiddenResolvedCount)})` : ''}`}</button>
        <button class="quick-chip" type="button" data-sku-contour-open-planfact>План-факт</button>
      </div>
    </div>

    ${skuContourFocusBoardHtml({ health, healthMeta, quality, quarantine, activeMarket, scopedIssueRows, issueRows, onlyNew, showResolved, hiddenResolvedCount, hiddenByCurrentFilterCount, wbMissingInDistribution, wbMissingInPortal })}
    <details class="sku-data-technical sku-data-metrics-drawer">
      <summary class="sku-data-technical-summary">Подробные метрики площадок</summary>
      <div class="sku-data-technical-body">
        ${contourPlatformBoardHtml}
        ${contourGameCardsHtml}
      </div>
    </details>

    <div class="notice ${healthMeta.notice} sku-data-muted-noise">
      <div class="section-subhead">
        <div>
          <strong>Sync: ${escapeHtml(healthMeta.label)}</strong>
          <div class="small muted">Проверено: ${escapeHtml(fmt.date(health.generatedAt || health.publish?.checkedAt || ''))} · данные до ${escapeHtml(health.freshness?.maxDate || quality.maxDate || '—')}</div>
          ${(health.publish?.blockingReasons || health.publish?.warnings || []).slice(0, 3).map((item) => `<div class="small muted">${escapeHtml(item)}</div>`).join('')}
          ${skuHealthProblems.slice(0, 3).map((item) => `<div class="small muted">${escapeHtml(item.message || item.name || '')}</div>`).join('')}
        </div>
        <div class="badge-stack">
          ${badge(healthMeta.label, healthMeta.tone)}
          ${skuHealth.status ? badge(`SKU contour: ${skuHealth.status}`, skuHealth.status === 'ok' ? 'ok' : skuHealth.status === 'blocked' ? 'danger' : 'warn') : ''}
          ${badge(`${fmt.int(quality.apiUnmappedUniqueSku || matrixSummary.apiUnmappedCount || 0)} API без пары`, (quality.apiUnmappedUniqueSku || matrixSummary.apiUnmappedCount) ? 'warn' : 'ok')}
          ${badge(`${fmt.int(wbMissingInDistribution)} WB вне распределения`, wbMissingInDistribution ? 'info' : 'ok')}
          ${badge(`${fmt.int(quarantine.rows || 0)} в карантине`, quarantine.rows ? 'danger' : 'ok')}
          ${badge(fmt.money(quality.apiUnmappedRevenue || 0), quality.apiUnmappedRevenue ? 'warn' : 'ok')}
        </div>
      </div>
    </div>

    <div class="kpi-strip sku-data-muted-noise" style="margin-top:14px">
      <div class="mini-kpi"><span>SKU</span><strong>${fmt.int(matrixSummary.skuCount || (state.skus || []).length)}</strong><span>в матрице</span></div>
      <div class="mini-kpi"><span>Alias</span><strong>${fmt.int(matrixSummary.aliasCount || skuPlanFactAliasRows(state.skuAliases || {}).length)}</strong><span>общий справочник</span></div>
      <div class="mini-kpi"><span>Ignore</span><strong>${fmt.int(matrixSummary.ignoredApiSkuCount || skuPlanFactIgnorePayloadRows(state.skuAliasIgnore || {}).length)}</strong><span>осознанно не маппим</span></div>
      <div class="mini-kpi ${matrixSummary.apiUnmappedCount || quality.apiUnmappedPlatformRows ? 'warn' : ''}"><span>API без пары</span><strong>${fmt.int(matrixSummary.apiUnmappedCount || quality.apiUnmappedPlatformRows || 0)}</strong><span>из API источников</span></div>
      <div class="mini-kpi"><span>WB контур</span><strong>${fmt.int(wbMissingInDistribution)}</strong><span>есть в портале, нет в распределении</span></div>
      <div class="mini-kpi"><span>WB распределение</span><strong>${fmt.int(wbMissingInPortal)}</strong><span>есть в файле, нет в реестре</span></div>
      <div class="mini-kpi ${matrixSummary.missingOwnerCount || quality.skuMissingOwner ? 'warn' : ''}"><span>Без owner</span><strong>${fmt.int(matrixSummary.missingOwnerCount || quality.skuMissingOwner || 0)}</strong><span>реестр / матрица</span></div>
      <div class="mini-kpi"><span>Аудит</span><strong>${fmt.int(auditEvents.length)}</strong><span>последние применения</span></div>
    </div>

    <details class="card sku-plan-fact-card sku-data-technical" style="margin-top:14px" data-sku-contour-guide>
      <summary class="sku-data-technical-summary">Разбор API SKU</summary>
      <div class="sku-data-technical-body">
      <div class="section-subhead">
        <div>
          <h3>Форма разбора API SKU</h3>
          <p class="small muted">Выгрузите форму, заполните decision: alias, ignore, new_sku или need_check, затем загрузите обратно. Те же кнопки остаются и в План-факте.</p>
        </div>
        <div class="badge-stack">
          <button class="quick-chip" type="button" data-sku-contour-quality-export>Выгрузить форму</button>
          <button class="quick-chip" type="button" data-sku-contour-quality-import>Загрузить заполненный файл</button>
          <button class="quick-chip" type="button" data-sku-contour-download-json>Скачать контур JSON</button>
          <input type="file" accept=".csv,.xls,.html,.txt" data-sku-contour-quality-file hidden>
        </div>
      </div>
      ${skuPlanFactAliasImportReportHtml(state.skuPlanFactAliasImportReport || null)}
      </div>
    </details>

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Рабочая очередь SKU</h3>
          <p class="small muted sku-data-muted-noise">По умолчанию показаны только нерешённые строки. Alias и ignore сохраняются в общий контур и скрываются из рабочей очереди после применения.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(issueRows.length)} в работе`, issueRows.length ? 'warn' : 'ok')}
          ${onlyNew ? badge('только новые', 'info') : ''}
          ${resolvedIssueCount ? badge(`${fmt.int(resolvedIssueCount)} решено`, 'ok') : ''}
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Статус</th><th>Проблема</th><th>Площадка</th><th>API / SKU</th><th>Сумма</th><th>Журнал / следующий шаг</th></tr></thead>
          <tbody>${issueHtml || `<tr><td colspan="6"><div class="empty">${hiddenByCurrentFilterCount ? 'По текущему фильтру строк нет. Решённые или не новые строки скрыты кнопками сверху.' : 'Очередь ошибок пуста'}</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <details class="card sku-plan-fact-card sku-data-technical" style="margin-top:14px">
      <summary class="sku-data-technical-summary">Журнал API SKU</summary>
      <div class="sku-data-technical-body">
      <div class="section-subhead">
        <div>
          <h3>Журнал по API SKU</h3>
          <p class="small muted">Последние решения по конкретным API SKU: что связали alias, что отправили в ignore, кто и каким файлом применил.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(skuContourAuditJournalRows().length)} записей`, journalHtml ? 'info' : '')}</div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Дата</th><th>Решение</th><th>Площадка</th><th>API SKU</th><th>target_sku</th><th>Кто / файл</th></tr></thead>
          <tbody>${journalHtml || '<tr><td colspan="6"><div class="empty">Журнал пока пуст: alias/ignore ещё не применяли через портал</div></td></tr>'}</tbody>
        </table>
      </div>
      </div>
    </details>

    <details class="card sku-plan-fact-card sku-data-technical" style="margin-top:14px">
      <summary class="sku-data-technical-summary">Аудит применений</summary>
      <div class="sku-data-technical-body">
      <div class="section-subhead">
        <div>
          <h3>Аудит применений</h3>
          <p class="small muted">Кто и каким файлом менял alias/ignore. Хранится в общем snapshot sku_alias_audit.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(skuPlanFactAuditEvents(state.skuAliasAudit || {}).length)} событий`, auditEvents.length ? 'info' : '')}
          ${latestRollbackEvent ? '<button class="quick-chip" type="button" data-sku-contour-rollback-latest>Откатить последнее</button>' : ''}
          <button class="quick-chip" type="button" data-sku-contour-download-audit>Скачать аудит</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table compact">
          <thead><tr><th>Дата</th><th>Пользователь</th><th>Файл</th><th>Применено</th><th>Warnings</th><th>Версия</th></tr></thead>
          <tbody>${auditHtml || '<tr><td colspan="6"><div class="empty">Применений пока не было</div></td></tr>'}</tbody>
        </table>
      </div>
      </div>
    </details>
  `;

  root.querySelector('.section-title h2')?.replaceChildren(document.createTextNode('API-контур SKU'));
  if (root.dataset.skuJourneyDelegated !== '1') {
    root.dataset.skuJourneyDelegated = '1';
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-sku-journey-action]');
      if (!button || !root.contains(button) || event.__skuJourneyHandled) return;
      event.__skuJourneyHandled = true;
      skuJourneyHandleAction(button.dataset.skuJourneyAction || '', { rootId });
    });
  }
  root.querySelectorAll('[data-sku-contour-refresh]').forEach((button) => {
    button.addEventListener('click', (event) => refreshSkuPlanFactData(event.currentTarget, rootId));
  });
  root.querySelectorAll('[data-market-filter]').forEach((button) => button.addEventListener('click', (event) => {
    state.filters.market = event.currentTarget.dataset.marketFilter || 'all';
    state.filters.owner = 'all';
    renderSkuContour(rootId);
  }));
  root.querySelectorAll('[data-sku-contour-toggle-new]').forEach((button) => {
    button.addEventListener('click', () => {
      state.skuContourOnlyNew = !skuContourOnlyNew();
      renderSkuContour(rootId);
    });
  });
  root.querySelectorAll('[data-sku-contour-toggle-resolved]').forEach((button) => {
    button.addEventListener('click', () => {
      state.skuContourShowResolved = !skuContourShowResolved();
      renderSkuContour(rootId);
    });
  });
  root.querySelectorAll('[data-sku-contour-open-planfact]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof setView === 'function') setView('sku-plan-fact');
      else document.querySelector('.nav-btn[data-view="sku-plan-fact"]')?.click();
    });
  });
  root.querySelectorAll('[data-sku-journey-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (event.__skuJourneyHandled) return;
      event.__skuJourneyHandled = true;
      skuJourneyHandleAction(event.currentTarget.dataset.skuJourneyAction || '', { rootId });
    });
  });
  root.querySelectorAll('[data-sku-contour-open-registry]').forEach((button) => {
    button.addEventListener('click', (event) => {
      skuJourneyHandleAction('registry-matrix', { search: event.currentTarget.dataset.skuContourOpenRegistry || '', rootId });
    });
  });
  root.querySelectorAll('[data-sku-contour-quality-export]').forEach((button) => {
    button.addEventListener('click', () => downloadSkuPlanFactQualityExcel(model));
  });
  root.querySelectorAll('[data-sku-contour-quality-import]').forEach((button) => {
    button.addEventListener('click', () => root.querySelector('[data-sku-contour-quality-file]')?.click());
  });
  root.querySelector('[data-sku-contour-quality-file]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    await handleSkuPlanFactAliasImport(file, rootId);
  });
  root.querySelector('[data-sku-contour-download-json]')?.addEventListener('click', skuContourDownloadPayload);
  root.querySelector('[data-sku-contour-download-audit]')?.addEventListener('click', () => skuPlanFactDownloadJson(`sku-alias-audit-${todayIso()}.json`, state.skuAliasAudit || { events: [] }));
  root.querySelector('[data-sku-contour-rollback-latest]')?.addEventListener('click', async (event) => {
    const latest = skuContourLatestRollbackableEvent();
    if (!latest) return;
    if (!window.confirm('Откатить последнее применение alias/ignore? Это вернёт общий контур к состоянию до этой загрузки.')) return;
    await skuContourRollbackAliasImport(latest.id, event.currentTarget, rootId);
  });
  root.querySelector('[data-sku-plan-fact-apply-import]')?.addEventListener('click', async (event) => {
    await handleSkuPlanFactApplyAliasImport(event.currentTarget, rootId);
  });
  root.querySelector('[data-sku-plan-fact-download-aliases]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    if (report.aliasPayload) skuPlanFactDownloadJson('sku_aliases.updated.json', report.aliasPayload);
  });
  root.querySelector('[data-sku-plan-fact-download-ignore]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    if (report.ignorePayload) skuPlanFactDownloadJson('sku_alias_ignore.updated.json', report.ignorePayload);
  });
  root.querySelector('[data-sku-plan-fact-download-import-report]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    const { aliasPayload, ignorePayload, ...publicReport } = report;
    skuPlanFactDownloadJson(`sku-alias-import-report-${todayIso()}.json`, publicReport);
  });
}

function skuPlanFactReconciliationHtml(items = []) {
  if (!items.length) return '';
  const text = items.map((item) => (
    `${item.label}: SKU ${fmt.money(item.rawRevenue)} -> итог площадки ${fmt.money(item.aggregateRevenue)}`
  )).join(' · ');
  return `
    <div class="notice warn" style="margin-top:14px">
      <strong>Сверка источников:</strong> ${escapeHtml(text)}. Факт по SKU скорректирован до агрегата площадки.
    </div>
  `;
}

function skuPlanFactPlatformCell(metric, planDrr = null) {
  if (!metric) return '<div class="muted small">—</div>';
  const planLimit = metric.planDrr ?? planDrr;
  const drrTone = metric.drr !== null && planLimit !== null && planLimit !== undefined && metric.drr > planLimit ? 'danger-text' : '';
  return `
    <div><strong>${fmt.money(metric.factRevenue)}</strong> <span class="muted small">/ ${fmt.money(metric.planToDateRevenue)}</span></div>
    <div class="muted small">${fmt.int(metric.factUnits)} шт. / план ${fmt.int(metric.planToDateUnits)} шт.</div>
    <div class="badge-stack" style="margin-top:6px">
      ${badge(fmt.pct(metric.completionToDate), skuPlanFactTone(metric.completionToDate))}
      ${metric.drr !== null ? `<span class="chip ${drrTone ? 'danger' : ''}">ДРР ${fmt.pct(metric.drr)}</span>` : ''}
      ${metric.planDrr !== null && metric.planDrr !== undefined ? `<span class="chip info">план ${fmt.pct(metric.planDrr)}</span>` : ''}
    </div>
  `;
}

function skuPlanFactPlatformAvgCheckLines(row = {}) {
  return SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const metric = row?.platforms?.[platform] || row?.[platform] || null;
    const label = skuPlanFactPlatformLabel(platform);
    return `
      <div>${escapeHtml(label)}: <strong>${fmt.money(metric?.factAvgCheck)}</strong> <span class="muted small">план ${fmt.money(metric?.planAvgCheck)}</span></div>
    `;
  }).join('');
}

function skuPlanFactCompletionLevel(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 0;
  const ratio = Number(value);
  if (ratio >= 1.2) return 5;
  if (ratio >= 1) return 4;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.5) return 2;
  return ratio > 0 ? 1 : 0;
}

function skuPlanFactPlatformHue(platform = '') {
  return {
    wb: 275,
    ozon: 212,
    ya: 42,
    goldapple: 146,
    letu: 330,
    magnit: 4
  }[platform] ?? 205;
}

function skuPlanFactCardStyle(platform = '', completion = null) {
  const level = skuPlanFactCompletionLevel(completion);
  const ratio = completion === null || completion === undefined || !Number.isFinite(Number(completion))
    ? 0.12
    : Math.min(1.35, Math.max(0.05, Number(completion)));
  const fill = 0.08 + Math.min(0.34, ratio * 0.24);
  const rowFill = Math.min(0.12, fill * 0.32);
  const border = 0.18 + Math.min(0.5, ratio * 0.3);
  const glow = 0.04 + Math.min(0.18, ratio * 0.12);
  const progress = Math.min(100, Math.max(0, ratio * 100));
  return `--pf-hue:${skuPlanFactPlatformHue(platform)};--pf-fill:${fill.toFixed(3)};--pf-row-fill:${rowFill.toFixed(3)};--pf-border:${border.toFixed(3)};--pf-glow:${glow.toFixed(3)};--pf-progress:${progress.toFixed(1)}%;--pf-level:${level}`;
}

function skuPlanFactPlatformSummary(model = {}, platform = '', options = {}) {
  const includePayroll = options.includePayroll === true;
  const respectFilters = options.respectFilters === true;
  const kpiOnly = options.kpiOnly === true;
  const normalizedPlatform = String(platform || 'all').toLowerCase();
  const payrollAllScope = includePayroll && normalizedPlatform === 'all' && model.payrollKpi;
  const aggregatePlatforms = normalizedPlatform === 'all'
    ? (payrollAllScope ? SKU_PLAN_FACT_PAYROLL_PLATFORMS : SKU_PLAN_FACT_PLATFORMS)
    : [normalizedPlatform].filter((item) => SKU_PLAN_FACT_PLATFORMS.includes(item));
  const sourceRows = options.scope === 'allRows'
    ? (model.allRows || [])
    : (model.platformBaseRows || model.allRows || []);
  const filters = model.filters || {};
  const ownerFilter = respectFilters ? (filters.owner || 'all') : (options.owner || 'all');
  const filteredRows = respectFilters
    ? sourceRows.filter((row) => skuPlanFactRowMatchesFilters(row, {
        ...filters,
        owner: 'all',
        platform: 'all'
      }, { platform: false }))
    : sourceRows;
  const rows = kpiOnly ? filteredRows.filter((row) => skuPlanFactKpiEligible(row)) : filteredRows;
  const summary = rows.reduce((acc, row) => {
    let rowHasSignal = false;
    let rowFactRevenue = 0;
    let rowPlanToDateRevenue = 0;
    aggregatePlatforms.forEach((currentPlatform) => {
      if (!skuPlanFactMetricMatchesOwner(row, currentPlatform, ownerFilter)) return;
      const metric = row.platforms?.[currentPlatform] || row[currentPlatform] || null;
      if (!skuPlanFactPlatformHasActivity(metric)) return;
      rowHasSignal = true;
      rowFactRevenue += numberOrZero(metric.factRevenue);
      rowPlanToDateRevenue += numberOrZero(metric.planToDateRevenue);
      acc.planRevenue += numberOrZero(metric.planRevenue);
      acc.planToDateRevenue += numberOrZero(metric.planToDateRevenue);
      acc.factRevenue += numberOrZero(metric.factRevenue);
      acc.planUnits += numberOrZero(metric.planUnits);
      acc.factUnits += numberOrZero(metric.factUnits);
      acc.adSpend += numberOrZero(metric.adSpend);
      if (metric.planAdSpend !== null && metric.planAdSpend !== undefined) {
        acc.planAdSpend += numberOrZero(metric.planAdSpend);
        acc.hasPlanAdSpend = true;
      }
      if (metric.planMonthAdSpend !== null && metric.planMonthAdSpend !== undefined) {
        acc.planMonthAdSpend += numberOrZero(metric.planMonthAdSpend);
        acc.hasPlanMonthAdSpend = true;
      }
      if (metric.planPeriodAdSpend !== null && metric.planPeriodAdSpend !== undefined) {
        acc.planPeriodAdSpend += numberOrZero(metric.planPeriodAdSpend);
        acc.hasPlanPeriodAdSpend = true;
      }
      if (metric.adForecastSpend !== null && metric.adForecastSpend !== undefined) {
        acc.adForecastSpend += numberOrZero(metric.adForecastSpend);
        acc.hasAdForecastSpend = true;
      }
      skuPlanFactMergeDailyIntoMap(acc.dailyMap, metric.factDaily);
      const marginPct = skuPlanFactNormalizeRatio(metric.marginPct);
      const marginWeight = numberOrZero(metric.factRevenue) || numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue);
      if (marginPct !== null && marginWeight > 0) {
        acc.marginValue += marginPct * marginWeight;
        acc.marginWeight += marginWeight;
      }
      const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
      const planMarginWeight = numberOrZero(metric.planToDateRevenue) || numberOrZero(metric.planRevenue);
      if (planMarginPct !== null && planMarginWeight > 0) {
        acc.planMarginValue += planMarginPct * planMarginWeight;
        acc.planMarginWeight += planMarginWeight;
      }
    });
    if (rowHasSignal) {
      acc.rows += 1;
      if (rowPlanToDateRevenue > 0 && rowFactRevenue < rowPlanToDateRevenue) acc.underPlan += 1;
    }
    return acc;
  }, { platform: normalizedPlatform, rows: 0, underPlan: 0, planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, planUnits: 0, factUnits: 0, adSpend: 0, planAdSpend: 0, planMonthAdSpend: 0, planPeriodAdSpend: 0, adForecastSpend: 0, hasPlanAdSpend: false, hasPlanMonthAdSpend: false, hasPlanPeriodAdSpend: false, hasAdForecastSpend: false, marginValue: 0, marginWeight: 0, planMarginValue: 0, planMarginWeight: 0, dailyMap: new Map() });
  summary.label = normalizedPlatform === 'all' ? 'Все площадки' : skuPlanFactPlatformLabel(normalizedPlatform);
  summary.completionToDate = summary.planToDateRevenue > 0 ? summary.factRevenue / summary.planToDateRevenue : null;
  summary.completionMonth = summary.planRevenue > 0 ? summary.factRevenue / summary.planRevenue : null;
  summary.gapToDate = summary.factRevenue - summary.planToDateRevenue;
  summary.drr = summary.factRevenue > 0 ? summary.adSpend / summary.factRevenue : null;
  summary.planAdSpend = summary.hasPlanAdSpend ? summary.planAdSpend : null;
  summary.planAdSpendToDate = summary.planAdSpend;
  summary.planMonthAdSpend = summary.hasPlanMonthAdSpend ? summary.planMonthAdSpend : null;
  summary.planPeriodAdSpend = summary.hasPlanPeriodAdSpend ? summary.planPeriodAdSpend : null;
  summary.adForecastSpend = summary.hasAdForecastSpend ? summary.adForecastSpend : null;
  skuPlanFactFinalizeAdPace(summary, model.monthKey || '', model.elapsedDays || model.periodDays || 0, model.periodStart || '');
  summary.planDrr = summary.planToDateRevenue > 0 && summary.planAdSpend !== null ? summary.planAdSpend / summary.planToDateRevenue : null;
  summary.marginPct = summary.marginWeight > 0 ? summary.marginValue / summary.marginWeight : null;
  summary.marginRub = summary.marginPct === null ? null : summary.factRevenue * summary.marginPct;
  summary.planMarginPct = summary.planMarginWeight > 0 ? summary.planMarginValue / summary.planMarginWeight : null;
  summary.planMarginRub = summary.planMarginPct === null ? null : summary.planToDateRevenue * summary.planMarginPct;
  summary.factDaily = skuPlanFactDailyArrayFromMap(summary.dailyMap);
  summary.scoreHistory = skuPlanFactBuildScoreHistory(summary, model.monthKey || '', model.periodStart || '', model.periodEnd || model.selectedDate || '');
  summary.completionDelta = skuPlanFactCompletionDelta(summary.scoreHistory);
  summary.apiFactRevenue = summary.factRevenue;
  summary.apiPlanToDateRevenue = summary.planToDateRevenue;
  summary.apiCompletionToDate = summary.completionToDate;
  summary.apiMarginPct = summary.marginPct;
  summary.apiMarginRub = summary.marginRub;
  summary.apiAdSpend = summary.adSpend;
  const payrollAlignmentAllowed = normalizedPlatform === 'all' || SKU_PLAN_FACT_PAYROLL_ALIGNMENT_PLATFORMS.has(normalizedPlatform);
  const payrollMetric = payrollAlignmentAllowed
    ? (normalizedPlatform === 'all' ? model.payrollKpi : model.payrollKpi?.platforms?.[normalizedPlatform])
    : null;
  if (includePayroll && payrollMetric && !model.payrollKpi?.ownerScoped) {
    summary.payrollKpi = true;
    summary.salaryIncluded = true;
    if (platform === 'all') {
      summary.rows = model.allRows?.length || summary.rows;
      summary.underPlan = numberOrZero(model.totals?.underPlan);
      summary.planUnits = numberOrZero(model.totals?.planUnits);
      summary.factUnits = numberOrZero(model.totals?.factUnits);
      summary.adSpend = numberOrZero(model.totals?.adSpend);
      summary.planAdSpend = model.totals?.planAdSpend ?? summary.planAdSpend;
      summary.planAdSpendToDate = model.totals?.planAdSpendToDate ?? summary.planAdSpendToDate;
      summary.planMonthAdSpend = model.totals?.planMonthAdSpend ?? summary.planMonthAdSpend;
      summary.planPeriodAdSpend = model.totals?.planPeriodAdSpend ?? summary.planPeriodAdSpend;
      summary.adForecastSpend = model.totals?.adForecastSpend ?? summary.adForecastSpend;
      summary.adCompletionToDate = model.totals?.adCompletionToDate ?? summary.adCompletionToDate;
      summary.adForecastCompletion = model.totals?.adForecastCompletion ?? summary.adForecastCompletion;
      summary.adGapToDate = model.totals?.adGapToDate ?? summary.adGapToDate;
      summary.adForecastGap = model.totals?.adForecastGap ?? summary.adForecastGap;
      summary.planDrr = model.totals?.planDrr ?? summary.planDrr;
      summary.marginPct = model.totals?.marginPct ?? summary.marginPct;
      summary.marginRub = model.totals?.marginRub ?? summary.marginRub;
      summary.planMarginPct = model.totals?.planMarginPct ?? summary.planMarginPct;
      summary.planMarginRub = model.totals?.planMarginRub ?? summary.planMarginRub;
      summary.drr = model.totals?.drr ?? summary.drr;
    }
    summary.planRevenue = payrollMetric.planRevenue;
    summary.planToDateRevenue = payrollMetric.planToDateRevenue;
    summary.factRevenue = payrollMetric.factRevenue;
    summary.completionToDate = payrollMetric.completionToDate;
    summary.completionMonth = payrollMetric.completionMonth;
    summary.gapToDate = payrollMetric.gapToDate;
    if (payrollMetric.adSpend !== undefined) summary.adSpend = numberOrZero(payrollMetric.adSpend);
    if (payrollMetric.planAdSpend !== undefined) summary.planAdSpend = payrollMetric.planAdSpend;
    if (payrollMetric.planAdSpendToDate !== undefined) summary.planAdSpendToDate = payrollMetric.planAdSpendToDate;
    if (payrollMetric.planPeriodAdSpend !== undefined) summary.planPeriodAdSpend = payrollMetric.planPeriodAdSpend;
    if (payrollMetric.adForecastSpend !== undefined) summary.adForecastSpend = payrollMetric.adForecastSpend;
    if (payrollMetric.adCompletionToDate !== undefined) summary.adCompletionToDate = payrollMetric.adCompletionToDate;
    if (payrollMetric.adForecastCompletion !== undefined) summary.adForecastCompletion = payrollMetric.adForecastCompletion;
    if (payrollMetric.adGapToDate !== undefined) summary.adGapToDate = payrollMetric.adGapToDate;
    if (payrollMetric.adForecastGap !== undefined) summary.adForecastGap = payrollMetric.adForecastGap;
    const adSourcePlatform = normalizedPlatform === 'all' ? (model.payrollKpi?.selectedPlatform || 'all') : normalizedPlatform;
    const adSource = skuPlanFactAdSourceTotals(
      model.monthKey || payrollMetric.monthKey || '',
      model.payrollKpi?.periodEnd || model.periodEnd || model.selectedDate || '',
      model.payrollKpi?.periodStart || model.periodStart || '',
      adSourcePlatform
    );
    if (adSource.rows > 0 || adSource.spend > 0) {
      summary.adSpend = numberOrZero(adSource.spend);
      summary.payrollSourceAdSpend = summary.adSpend;
      summary.externalAdSpend = numberOrZero(adSource.externalSpend);
    }
    skuPlanFactFinalizeAdPace(
      summary,
      model.monthKey || payrollMetric.monthKey || '',
      model.elapsedDays || model.periodDays || payrollMetric.elapsedDays || 0,
      model.payrollKpi?.periodStart || model.periodStart || ''
    );
    summary.drr = summary.factRevenue > 0 ? numberOrZero(summary.adSpend) / summary.factRevenue : null;
    summary.planDrr = summary.planToDateRevenue > 0 && summary.planAdSpend !== null && summary.planAdSpend !== undefined
      ? numberOrZero(summary.planAdSpend) / summary.planToDateRevenue
      : null;
    summary.scoreHistory = skuPlanFactBuildScoreHistory(summary, model.monthKey || '', model.payrollKpi?.periodStart || model.periodStart || '', model.payrollKpi?.periodEnd || model.periodEnd || '');
    summary.completionDelta = skuPlanFactCompletionDelta(summary.scoreHistory);
    summary.kpiFactRevenue = summary.factRevenue;
    summary.kpiFactDelta = summary.apiFactRevenue > 0 ? summary.factRevenue - summary.apiFactRevenue : 0;
  } else if (includePayroll && model.payrollKpi?.excludedPlatforms?.includes(normalizedPlatform)) {
    summary.payrollKpi = true;
    summary.salaryIncluded = false;
    summary.planRevenue = 0;
    summary.planToDateRevenue = 0;
    summary.completionToDate = null;
    summary.completionMonth = null;
    summary.gapToDate = summary.factRevenue;
  }
  return summary;
}

function skuPlanFactHistoryTapeHtml(history = [], platform = '', options = {}) {
  const points = (history || [])
    .filter((item) => item.completionToDate !== null && item.completionToDate !== undefined)
    .slice(options.compact ? -4 : -5);
  if (!points.length) return '';
  return `
    <span class="sku-score-tape ${options.compact ? 'compact' : ''}" style="${skuPlanFactCardStyle(platform, points[points.length - 1]?.completionToDate)}">
      ${points.map((item) => {
        const day = String(item.date || '').slice(8, 10) || '•';
        return `<span title="${escapeHtml(item.date || '')}"><b>${escapeHtml(day)}</b><em>${fmt.pct(item.completionToDate)}</em></span>`;
      }).join('')}
    </span>
  `;
}

function skuPlanFactDeltaHtml(delta = null) {
  if (delta === null || delta === undefined || !Number.isFinite(Number(delta))) return '';
  const value = Number(delta);
  const sign = value > 0 ? '+' : '';
  const tone = value > 0 ? 'ok-text' : (value < 0 ? 'danger-text' : 'muted');
  return `<em class="${tone}">Δ ${sign}${(value * 100).toFixed(1)} п.п.</em>`;
}

function skuPlanFactDominantPlatform(row = {}) {
  const item = SKU_PLAN_FACT_PLATFORMS
    .map((platform) => ({ platform, metric: row.platforms?.[platform] || row[platform] || null }))
    .filter((entry) => skuPlanFactPlatformHasActivity(entry.metric))
    .sort((left, right) => numberOrZero(right.metric?.factRevenue) - numberOrZero(left.metric?.factRevenue))[0];
  return item?.platform || 'all';
}

function skuPlanFactHealthBarHtml(config = {}) {
  const platform = config.platform || 'all';
  const rawValue = Number(config.valueRatio);
  const ratio = Number.isFinite(rawValue) ? rawValue : 0;
  const width = Math.min(100, Math.max(0, ratio * 100));
  const tone = config.tone || '';
  return `
    <div class="sku-health ${tone}" style="${skuPlanFactCardStyle(platform, ratio)}">
      <div class="sku-health__head">
        <span>${escapeHtml(config.label || '')}</span>
        <strong>${config.valueHtml || escapeHtml(config.valueText || '')}</strong>
      </div>
      <span class="sku-health__bar"><i style="width:${width.toFixed(1)}%"></i><em>${escapeHtml(config.barText || config.valueText || '')}</em></span>
      ${config.historyHtml || ''}
      ${(config.metaHtml || config.subText) ? `<div class="sku-health__meta">${config.metaHtml || `<em>${escapeHtml(config.subText || '')}</em>`}</div>` : ''}
    </div>
  `;
}

function skuPlanFactPlatformBoardHtml(model = {}) {
  const activePlatform = model.filters?.platform || 'all';
  return `
    <div class="sku-plan-platform-board">
      ${(model.platforms || SKU_PLAN_FACT_PLATFORMS).map((platform) => {
        const summary = skuPlanFactPlatformSummary(model, platform, { scope: 'allRows', respectFilters: true });
        const level = skuPlanFactCompletionLevel(summary.completionToDate);
        const active = activePlatform === platform;
        return `
          <button class="sku-plan-platform-card level-${level} ${active ? 'active' : ''}" type="button" data-sku-plan-fact-platform-card="${escapeHtml(platform)}" aria-pressed="${active ? 'true' : 'false'}" style="${skuPlanFactCardStyle(platform, summary.completionToDate)}">
            <span class="sku-plan-platform-card__top">
              <strong>${escapeHtml(summary.label)}</strong>
              <em>${fmt.int(summary.rows)} SKU</em>
            </span>
            <span class="sku-plan-platform-card__value">${fmt.pct(summary.completionToDate)}</span>
            <span class="sku-plan-platform-card__meta">${fmt.money(summary.factRevenue)} / ${fmt.money(summary.planToDateRevenue)}</span>
            <span class="sku-plan-platform-card__bar"><i></i></span>
            ${skuPlanFactHistoryTapeHtml(summary.scoreHistory, platform, { compact: true })}
            <span class="sku-plan-platform-card__foot">
              <b class="${skuPlanFactDeltaClass(summary.gapToDate)}">${fmt.money(summary.gapToDate)}</b>
              <span>${skuPlanFactDeltaHtml(summary.completionDelta) || `<em>${fmt.int(summary.underPlan)} ниже плана</em>`}</span>
            </span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function skuDataActiveMarket() {
  state.filters = state.filters || {};
  if (!state.filters.market) state.filters.market = 'all';
  const market = String(state.filters.market || 'all').toLowerCase();
  return market === 'ym' ? 'ya' : market;
}

function skuDataPlatformLabel(platform = 'all') {
  return platform === 'all' ? 'Все площадки' : skuPlanFactPlatformLabel(platform);
}

function skuDataSkuBelongsToPlatform(sku = {}, platform = 'all') {
  const key = String(platform || 'all').toLowerCase();
  if (key === 'all') return true;
  if (key === 'wb') return Boolean(sku?.flags?.hasWB || registryOwnerByMarket(sku, key));
  if (key === 'ozon') return Boolean(sku?.flags?.hasOzon || registryOwnerByMarket(sku, key));
  return Boolean(registryOwnerByMarket(sku, key));
}

function skuDataIssueMatchesPlatform(row = {}, platform = 'all') {
  const key = String(platform || 'all').toLowerCase();
  if (key === 'all') return true;
  const keys = skuContourPlatformKeys(row.platform || 'all');
  return keys.includes(key) || keys.includes('all');
}

function skuDataWorkFlag(sku = {}, platform = 'all') {
  const key = String(platform || 'all').toLowerCase();
  if (key === 'wb') return Boolean(sku?.flags?.toWorkWB || sku?.flags?.toWork);
  if (key === 'ozon') return Boolean(sku?.flags?.toWorkOzon || sku?.flags?.toWork);
  if (key === 'all') return Boolean(sku?.flags?.toWork || sku?.flags?.toWorkWB || sku?.flags?.toWorkOzon);
  return Boolean(registryOwnerByMarket(sku, key) || sku?.flags?.toWork);
}

function skuDataPlatformStats(model = {}, platform = 'all', issueRows = []) {
  const key = String(platform || 'all').toLowerCase();
  const skus = (state.skus || []).filter((sku) => skuDataSkuBelongsToPlatform(sku, key));
  const ownerCount = skus.filter((sku) => registryOwnersForFilter(sku, key).length > 0).length;
  const workCount = skus.filter((sku) => skuDataWorkFlag(sku, key)).length;
  const issues = (issueRows || []).filter((row) => skuDataIssueMatchesPlatform(row, key));
  const summary = key === 'all'
    ? {
        platform: 'all',
        label: skuDataPlatformLabel('all'),
        rows: model.allRows?.length || skus.length,
        completionToDate: model.totals?.completionToDate ?? null,
        factRevenue: numberOrZero(model.totals?.factRevenue),
        planToDateRevenue: numberOrZero(model.totals?.planToDateRevenue),
        gapToDate: numberOrZero(model.totals?.gapToDate)
      }
    : skuPlanFactPlatformSummary(model, key, { scope: 'allRows' });
  const ownerCoverage = skus.length ? ownerCount / skus.length : null;
  const issueLoad = skus.length ? Math.min(1, issues.length / Math.max(1, skus.length)) : (issues.length ? 1 : 0);
  const contourHealth = issues.length ? Math.max(0, 1 - issueLoad) : 1;
  return {
    platform: key,
    label: skuDataPlatformLabel(key),
    skuCount: skus.length,
    ownerCount,
    workCount,
    issueCount: issues.length,
    ownerCoverage,
    contourHealth,
    summary
  };
}

function skuDataPlatformBoardHtml(model = {}, options = {}) {
  const activeMarket = options.activeMarket || skuDataActiveMarket();
  const issueRows = options.issueRows || [];
  const platforms = ['all', ...SKU_PLAN_FACT_PLATFORMS];
  return `
    <div class="sku-data-platform-board">
      ${platforms.map((platform) => {
        const stats = skuDataPlatformStats(model, platform, issueRows);
        const summary = stats.summary || {};
        const completion = summary.completionToDate ?? stats.ownerCoverage;
        const active = activeMarket === platform;
        const level = skuPlanFactCompletionLevel(completion);
        const value = summary.completionToDate !== null && summary.completionToDate !== undefined
          ? fmt.pct(summary.completionToDate)
          : `${fmt.int(stats.skuCount)} SKU`;
        const meta = summary.planToDateRevenue > 0
          ? `${fmt.money(summary.factRevenue)} / ${fmt.money(summary.planToDateRevenue)}`
          : `${fmt.int(stats.ownerCount)} / ${fmt.int(stats.skuCount)} owner`;
        return `
          <button class="sku-plan-platform-card sku-data-platform-card level-${level} ${active ? 'active' : ''}" type="button" data-market-filter="${escapeHtml(platform)}" aria-pressed="${active ? 'true' : 'false'}" style="${skuPlanFactCardStyle(platform, completion)}">
            <span class="sku-plan-platform-card__top">
              <strong>${escapeHtml(stats.label)}</strong>
              <em>${fmt.int(stats.skuCount)} SKU</em>
            </span>
            <span class="sku-plan-platform-card__value">${value}</span>
            <span class="sku-plan-platform-card__meta">${meta}</span>
            <span class="sku-plan-platform-card__bar"><i></i></span>
            <span class="sku-plan-platform-card__foot">
              <b class="${stats.issueCount ? 'danger-text' : 'ok-text'}">${stats.issueCount ? `${fmt.int(stats.issueCount)} сигналов` : 'чисто'}</b>
              <span><em>${fmt.int(stats.workCount)} в работе</em></span>
            </span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function skuDataToneForRatio(ratio = null, reverse = false) {
  if (ratio === null || ratio === undefined || !Number.isFinite(Number(ratio))) return '';
  const value = Number(ratio);
  if (reverse) {
    if (value <= 0.05) return 'ok';
    if (value <= 0.18) return 'warn';
    return 'danger';
  }
  if (value >= 0.9) return 'ok';
  if (value >= 0.75) return 'warn';
  return 'danger';
}

function skuDataGameCardsHtml(cards = []) {
  if (!cards.length) return '';
  return `
    <div class="sku-data-game-cards" data-sku-contour-decision-cards>
      ${cards.map((card) => skuPlanFactHealthBarHtml(card)).join('')}
    </div>
  `;
}

function skuDataSharedCards(model = {}, activeMarket = 'all', items = [], issueRows = []) {
  const stats = skuDataPlatformStats(model, activeMarket, issueRows);
  const ownerCoverage = items.length ? items.filter((sku) => registryOwnersForFilter(sku, activeMarket).length > 0).length / items.length : stats.ownerCoverage;
  const workRatio = items.length ? items.filter((sku) => skuDataWorkFlag(sku, activeMarket)).length / items.length : null;
  const externalRatio = items.length ? items.filter((sku) => sku?.flags?.hasExternalTraffic).length / items.length : null;
  const issueRatio = items.length ? Math.min(1, stats.issueCount / Math.max(1, items.length)) : (stats.issueCount ? 1 : 0);
  const summary = stats.summary || {};
  return [
    {
      label: 'План-факт',
      valueRatio: summary.completionToDate ?? null,
      valueText: summary.completionToDate == null ? '—' : fmt.pct(summary.completionToDate),
      barText: summary.completionToDate == null ? 'нет плана' : fmt.pct(summary.completionToDate),
      subText: `${fmt.money(summary.factRevenue || 0)} / ${fmt.money(summary.planToDateRevenue || 0)}`,
      platform: activeMarket,
      tone: skuDataToneForRatio(summary.completionToDate)
    },
    {
      label: 'Owner',
      valueRatio: ownerCoverage,
      valueText: ownerCoverage == null ? '—' : fmt.pct(ownerCoverage),
      barText: ownerCoverage == null ? '—' : fmt.pct(ownerCoverage),
      subText: `${fmt.int(stats.ownerCount)} / ${fmt.int(stats.skuCount)} SKU`,
      platform: activeMarket,
      tone: skuDataToneForRatio(ownerCoverage)
    },
    {
      label: 'Контур данных',
      valueRatio: 1 - issueRatio,
      valueText: stats.issueCount ? `${fmt.int(stats.issueCount)} сигналов` : 'чисто',
      barText: stats.issueCount ? `${fmt.int(Math.max(0, Math.round((1 - issueRatio) * 100)))}%` : '100%',
      subText: 'alias / API / owner',
      platform: activeMarket,
      tone: skuDataToneForRatio(issueRatio, true)
    },
    {
      label: 'В работе',
      valueRatio: workRatio,
      valueText: `${fmt.int(stats.workCount)} SKU`,
      barText: workRatio == null ? '—' : fmt.pct(workRatio),
      subText: 'фокус по выбранной площадке',
      platform: activeMarket,
      tone: stats.workCount ? 'warn' : 'ok'
    },
    {
      label: 'Внешний трафик',
      valueRatio: externalRatio,
      valueText: externalRatio == null ? '—' : fmt.pct(externalRatio),
      barText: externalRatio == null ? '—' : fmt.pct(externalRatio),
      subText: `${fmt.int(items.filter((sku) => sku?.flags?.hasKZ).length)} КЗ / ${fmt.int(items.filter((sku) => sku?.flags?.hasVK).length)} VK`,
      platform: activeMarket,
      tone: externalRatio ? 'warn' : 'ok'
    }
  ];
}

function skuPlanFactIuDrrPayrollMetric(model = {}, platform = '', fallback = {}) {
  return {
    ...(fallback || {}),
    platform,
    label: skuPlanFactPlatformLabel(platform),
    truthSource: 'company_plan'
  };
}

function skuPlanFactPayrollDisplayModel(model = {}) {
  const payroll = model.payrollKpi;
  if (!payroll) return null;
  return {
    ...payroll,
    apiFactRevenue: model.totals?.apiFactRevenue ?? model.totals?.payrollOriginal?.factRevenue ?? null,
    kpiFactDelta: model.totals?.kpiFactDelta ?? null,
    truthSource: payroll.truthSource || 'company_plan',
    displayTitle: payroll.displayTitle || 'Месячный план и KPI',
    displayNote: payroll.displayNote || 'Корпоративный план: оборот, заказы и рекламный бюджет по зарплатному контуру.'
  };
}

function skuPlanFactPayrollXpLevel(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 0;
  const ratio = Number(value);
  if (ratio >= 1.05) return 4;
  if (ratio >= 1) return 3;
  if (ratio >= 0.9) return 2;
  return 1;
}

function skuPlanFactPayrollXpHue(value) {
  const level = skuPlanFactPayrollXpLevel(value);
  if (level >= 3) return 145;
  if (level === 2) return 42;
  if (level === 1) return 5;
  return 212;
}

function skuPlanFactPayrollForecast(payroll = {}) {
  const elapsedDays = numberOrZero(payroll.elapsedDays);
  const monthDays = numberOrZero(payroll.monthDays) || skuPlanFactMonthDays(payroll.monthKey || '');
  const factRevenue = numberOrZero(payroll.factRevenue);
  const planRevenue = numberOrZero(payroll.planRevenue);
  if (elapsedDays <= 0 || monthDays <= 0 || factRevenue <= 0 || planRevenue <= 0) {
    return { revenue: null, ratio: null, gap: null };
  }
  const revenue = factRevenue / elapsedDays * monthDays;
  return {
    revenue,
    ratio: revenue / planRevenue,
    gap: revenue - planRevenue
  };
}

function skuPlanFactPayrollKpiHtml(model = {}) {
  const payroll = skuPlanFactPayrollDisplayModel(model);
  if (!payroll) return '';
  const ratio = Number(payroll.completionToDate);
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, ratio) : 0;
  const progress = Math.min(100, safeRatio * 100);
  const forecast = skuPlanFactPayrollForecast(payroll);
  const forecastRatio = Number(forecast.ratio);
  const forecastProgress = Number.isFinite(forecastRatio) ? Math.min(100, Math.max(0, forecastRatio * 100)) : progress;
  const hue = skuPlanFactPayrollXpHue(payroll.completionToDate);
  const brightness = (0.3 + Math.min(0.7, safeRatio * 0.5)).toFixed(3);
  const level = skuPlanFactPayrollXpLevel(payroll.completionToDate);
  const gapText = payroll.gapToDate >= 0 ? `перевыполнение ${fmt.money(payroll.gapToDate)}` : `разрыв ${fmt.money(Math.abs(payroll.gapToDate))}`;
  const statusText = level >= 3 ? 'в плане на дату' : (level === 2 ? 'почти в плане' : 'нужно догнать');
  const title = [
    `KPI-факт: ${fmt.money(payroll.factRevenue)}`,
    payroll.apiFactRevenue ? `API-факт: ${fmt.money(payroll.apiFactRevenue)}` : '',
    payroll.kpiFactDelta ? `Дельта KPI к API: ${fmt.money(payroll.kpiFactDelta)}` : '',
    `План к дате: ${fmt.money(payroll.planToDateRevenue)}`,
    `Разница к дате: ${fmt.money(payroll.gapToDate)}`,
    `Месячный план: ${fmt.money(payroll.planRevenue)}`,
    forecast.revenue !== null ? `Прогноз месяца: ${fmt.money(forecast.revenue)} (${fmt.pct(forecast.ratio)})` : ''
  ].filter(Boolean).join('');
  return `
    <div class="card sku-plan-fact-card salary-plan-kpi-card level-${level}" style="margin-top:14px;--xp-hue:${hue};--xp-progress:${progress.toFixed(1)}%;--xp-forecast:${forecastProgress.toFixed(1)}%;--xp-bright:${brightness}" title="${escapeHtml(title)}">
      <div class="sku-salary-xp-head">
        <div>
          <h3>${escapeHtml(payroll.displayTitle || 'Общее выполнение')}</h3>
          <p class="small muted">${escapeHtml(payroll.displayNote || 'Корпоративный план: оборот, заказы и рекламный бюджет по зарплатному контуру.')}</p>
        </div>
        <div class="badge-stack">
          ${badge(payroll.truthSource === 'company_plan' ? 'Корп план' : 'KPI', 'info')}
        </div>
      </div>
      <div class="sku-salary-xp-main">
        <div class="sku-salary-xp-score">
          <span>уровень выполнения</span>
          <strong>${fmt.pct(payroll.completionToDate)}</strong>
          <em>${escapeHtml(statusText)}</em>
        </div>
        <div class="sku-salary-xp-track" aria-label="Общее выполнение" title="${escapeHtml(title)}">
          <i></i>
          <span class="sku-salary-xp-forecast-mark" style="left:var(--xp-forecast)" title="Прогноз месяца"></span>
        </div>
        <div class="sku-salary-xp-delta ${payroll.gapToDate >= 0 ? 'ok' : 'danger'}">
          <span>разница к плану на дату</span>
          <strong>${escapeHtml(gapText)}</strong>
        </div>
      </div>
      <div class="sku-salary-xp-stats">
        <span><em>KPI-факт</em><b>${fmt.money(payroll.factRevenue)}</b></span>
        ${payroll.apiFactRevenue ? `<span><em>API-факт</em><b>${fmt.money(payroll.apiFactRevenue)}</b></span>` : ''}
        <span><em>план к дате</em><b>${fmt.money(payroll.planToDateRevenue)}</b></span>
        <span><em>месячный план</em><b>${fmt.money(payroll.planRevenue)}</b></span>
        <span><em>прогноз месяца</em><b>${forecast.revenue === null ? '—' : fmt.money(forecast.revenue)}</b></span>
      </div>
    </div>
  `;
}

function skuPlanFactDisplayMetric(row = {}, model = {}) {
  const platform = model.filters?.platform || 'all';
  if (platform !== 'all') {
    const metric = row.platforms?.[platform] || row[platform] || {};
    return {
      platform,
      label: skuPlanFactPlatformLabel(platform),
      planRevenue: numberOrZero(metric.planRevenue),
      planToDateRevenue: numberOrZero(metric.planToDateRevenue),
      factRevenue: numberOrZero(metric.factRevenue),
      planUnits: numberOrZero(metric.planUnits),
      planToDateUnits: numberOrZero(metric.planToDateUnits),
      factUnits: numberOrZero(metric.factUnits),
      completionToDate: metric.completionToDate ?? null,
      gapToDate: numberOrZero(metric.gapToDate),
      adSpend: numberOrZero(metric.adSpend),
      drr: metric.drr ?? null,
      planAdSpend: metric.planAdSpend ?? null,
      planAdSpendToDate: metric.planAdSpendToDate ?? metric.planAdSpend ?? null,
      planMonthAdSpend: metric.planMonthAdSpend ?? null,
      planPeriodAdSpend: metric.planPeriodAdSpend ?? metric.planMonthAdSpend ?? metric.planAdSpend ?? null,
      adForecastSpend: metric.adForecastSpend ?? null,
      adCompletionToDate: metric.adCompletionToDate ?? null,
      adForecastCompletion: metric.adForecastCompletion ?? null,
      adGapToDate: metric.adGapToDate ?? null,
      adForecastGap: metric.adForecastGap ?? null,
      adElapsedDays: metric.adElapsedDays || model.elapsedDays || model.periodDays || 0,
      adForecastDays: metric.adForecastDays || skuPlanFactAdForecastDays(model.monthKey || '', model.elapsedDays || model.periodDays || 0, model.periodStart || ''),
      planDrr: metric.planDrr ?? null,
      planAdSource: metric.planAdSource || '',
      substitutionViews: numberOrZero(metric.substitutionViews),
      substitutionCarts: numberOrZero(metric.substitutionCarts),
      substitutionOrders: numberOrZero(metric.substitutionOrders),
      substitutionFavorites: numberOrZero(metric.substitutionFavorites),
      substitutionCount: numberOrZero(metric.substitutionCount),
      substitutionCampaignCount: numberOrZero(metric.substitutionCampaignCount),
      substitutionCartRate: metric.substitutionCartRate ?? null,
      substitutionOrderRate: metric.substitutionOrderRate ?? null,
      substitutionTop: Array.isArray(metric.substitutionTop) ? metric.substitutionTop : [],
      substitutionSource: metric.substitutionSource || '',
      marginPct: skuPlanFactNormalizeRatio(metric.marginPct),
      marginRub: metric.marginRub ?? (skuPlanFactNormalizeRatio(metric.marginPct) === null ? null : numberOrZero(metric.factRevenue) * skuPlanFactNormalizeRatio(metric.marginPct)),
      factMarginPct: skuPlanFactNormalizeRatio(metric.factMarginPct),
      planMarginPct: skuPlanFactNormalizeRatio(metric.planMarginPct),
      planMarginRub: metric.planMarginRub ?? (skuPlanFactNormalizeRatio(metric.planMarginPct) === null ? null : numberOrZero(metric.planToDateRevenue) * skuPlanFactNormalizeRatio(metric.planMarginPct)),
      marginIsPlanFallback: Boolean(metric.marginIsPlanFallback),
      marginSource: metric.marginSource || '',
      planMarginSource: metric.planMarginSource || '',
      scoreHistory: metric.scoreHistory || [],
      completionDelta: metric.completionDelta ?? null,
      stock: metric.stock ?? null,
      turnoverDays: metric.turnoverDays ?? null,
      tonePlatform: platform
    };
  }
  const dominantPlatform = skuPlanFactDominantPlatform(row);
  return {
    platform: 'all',
    label: 'Итого',
    planRevenue: row.planRevenue,
    planToDateRevenue: row.planToDateRevenue,
    factRevenue: row.factRevenue,
    planUnits: row.planUnits,
    planToDateUnits: row.planUnits > 0 && row.planRevenue > 0 ? row.planUnits * row.planToDateRevenue / row.planRevenue : 0,
    factUnits: row.factUnits,
    completionToDate: row.completionToDate,
    gapToDate: row.gapToDate,
    adSpend: row.adSpend,
    drr: row.drr,
    planAdSpend: row.planAdSpend ?? null,
    planAdSpendToDate: row.planAdSpendToDate ?? row.planAdSpend ?? null,
    planMonthAdSpend: row.planMonthAdSpend ?? null,
    planPeriodAdSpend: row.planPeriodAdSpend ?? row.planMonthAdSpend ?? row.planAdSpend ?? null,
    adForecastSpend: row.adForecastSpend ?? null,
    adCompletionToDate: row.adCompletionToDate ?? null,
    adForecastCompletion: row.adForecastCompletion ?? null,
    adGapToDate: row.adGapToDate ?? null,
    adForecastGap: row.adForecastGap ?? null,
    adElapsedDays: row.adElapsedDays || model.elapsedDays || model.periodDays || 0,
    adForecastDays: row.adForecastDays || skuPlanFactAdForecastDays(model.monthKey || '', model.elapsedDays || model.periodDays || 0, model.periodStart || ''),
    planDrr: row.planDrr ?? null,
    planAdSource: '',
    substitutionViews: numberOrZero(row.substitutionViews),
    substitutionCarts: numberOrZero(row.substitutionCarts),
    substitutionOrders: numberOrZero(row.substitutionOrders),
    substitutionFavorites: numberOrZero(row.substitutionFavorites),
    substitutionCount: numberOrZero(row.substitutionCount),
    substitutionCampaignCount: numberOrZero(row.substitutionCampaignCount),
    substitutionCartRate: row.substitutionCartRate ?? null,
    substitutionOrderRate: row.substitutionOrderRate ?? null,
    substitutionTop: Array.isArray(row.substitutionTop) ? row.substitutionTop : [],
    substitutionSource: row.platforms?.wb?.substitutionSource || '',
    marginPct: skuPlanFactNormalizeRatio(row.marginPct),
    marginRub: row.marginRub,
    factMarginPct: null,
    planMarginPct: skuPlanFactNormalizeRatio(row.planMarginPct),
    planMarginRub: row.planMarginRub,
    marginIsPlanFallback: false,
    marginSource: '',
    planMarginSource: '',
    scoreHistory: row.scoreHistory || [],
    completionDelta: row.completionDelta ?? null,
    stock: null,
    turnoverDays: null,
    tonePlatform: dominantPlatform
  };
}

function skuPlanFactProgressHtml(value) {
  const ratio = value === null || value === undefined || !Number.isFinite(Number(value)) ? 0 : Number(value);
  const width = Math.min(100, Math.max(0, ratio * 100));
  return `<span class="sku-plan-fact-progress"><i style="width:${width.toFixed(1)}%"></i></span>`;
}

function skuPlanFactCompletionHtml(metric = {}) {
  const platform = metric.tonePlatform || metric.platform || 'all';
  return skuPlanFactHealthBarHtml({
    platform,
    label: 'Выполнение',
    valueRatio: metric.completionToDate,
    valueText: fmt.pct(metric.completionToDate),
    barText: fmt.pct(metric.completionToDate),
    tone: skuPlanFactTone(metric.completionToDate),
    historyHtml: skuPlanFactHistoryTapeHtml(metric.scoreHistory, platform, { compact: true }),
    metaHtml: `
      <b class="${skuPlanFactDeltaClass(metric.gapToDate)}">${fmt.money(metric.gapToDate)}</b>
      ${skuPlanFactDeltaHtml(metric.completionDelta)}
    `
  });
}

function skuPlanFactPlatformScopeHtml(row = {}, model = {}) {
  const activePlatform = model.filters?.platform || 'all';
  if (activePlatform !== 'all') {
    const metric = row.platforms?.[activePlatform] || row[activePlatform] || {};
    return `
      <div class="sku-plan-platform-scope">
        <span class="chip info">${escapeHtml(skuPlanFactPlatformLabel(activePlatform))}</span>
        <div class="muted small">${fmt.int(metric.factUnits)} шт. факт · остаток ${fmt.int(metric.stock)}</div>
        <div class="muted small">оборач. ${fmt.num(metric.turnoverDays, 1)} дн.</div>
      </div>
    `;
  }
  const chips = SKU_PLAN_FACT_PLATFORMS
    .map((platform) => ({ platform, metric: row.platforms?.[platform] || row[platform] || null }))
    .filter((item) => skuPlanFactPlatformHasActivity(item.metric))
    .sort((left, right) => numberOrZero(right.metric?.factRevenue) - numberOrZero(left.metric?.factRevenue))
    .slice(0, 4);
  return `
    <div class="sku-plan-platform-minis">
      ${chips.length ? chips.map(({ platform, metric }) => `
        <span class="sku-plan-platform-mini level-${skuPlanFactCompletionLevel(metric.completionToDate)}" style="${skuPlanFactCardStyle(platform, metric.completionToDate)}">
          <b>${escapeHtml(skuPlanFactPlatformLabel(platform))}</b>
          <em>${fmt.pct(metric.completionToDate)}</em>
        </span>
      `).join('') : '<span class="muted small">нет активности</span>'}
    </div>
  `;
}

function skuPlanFactFactPlanHtml(metric = {}) {
  const platform = metric.tonePlatform || metric.platform || 'all';
  return skuPlanFactHealthBarHtml({
    platform,
    label: 'Факт / план',
    valueRatio: metric.completionToDate,
    valueText: fmt.pct(metric.completionToDate),
    barText: fmt.pct(metric.completionToDate),
    tone: skuPlanFactTone(metric.completionToDate),
    metaHtml: `
      <b>${fmt.money(metric.factRevenue)}</b>
      <em>план ${fmt.money(metric.planToDateRevenue)}</em>
      <em>${fmt.int(metric.factUnits)} / ${fmt.int(metric.planToDateUnits)} шт.</em>
    `
  });
}

function skuPlanFactMarginHtml(metric = {}) {
  const marginPct = skuPlanFactNormalizeRatio(metric.marginPct);
  const planMarginPct = skuPlanFactNormalizeRatio(metric.planMarginPct);
  const tone = skuPlanFactMarginTone(marginPct);
  const target = planMarginPct ?? 0.3;
  const metaHtml = [
    `<b>${fmt.money(metric.marginRub)}</b>`,
    planMarginPct !== null ? `<em>план ${fmt.pct(planMarginPct)} · ${fmt.money(metric.planMarginRub)}</em>` : '<em>план —</em>',
    metric.marginIsPlanFallback ? '<em>факт маржи не пришёл, показана экономика SKU</em>' : ''
  ].filter(Boolean).join(' · ');
  return skuPlanFactHealthBarHtml({
    platform: metric.tonePlatform || metric.platform || 'all',
    label: 'Маржа',
    valueRatio: marginPct === null ? 0 : marginPct / target,
    valueText: fmt.pct(marginPct),
    barText: fmt.pct(marginPct),
    tone,
    metaHtml
  });
}

function skuPlanFactAdHtml(metric = {}, model = {}) {
  const platform = metric.platform || 'all';
  const tonePlatform = metric.tonePlatform || platform || 'all';
  const limit = metric.planDrr ?? (platform !== 'all' ? model.planDrrByPlatform?.[platform] : model.totals?.planDrr) ?? null;
  const drrDanger = metric.drr !== null && metric.drr !== undefined && limit !== null && limit !== undefined && metric.drr > limit;
  const drrTone = metric.drr === null || metric.drr === undefined
    ? ''
    : (drrDanger ? 'danger-text' : (metric.drr > 0.2 ? 'warn-text' : 'ok-text'));
  const planToDate = metric.planAdSpendToDate ?? metric.planAdSpend ?? (platform === 'all' ? model.totals?.planAdSpendToDate ?? model.totals?.planAdSpend : null);
  const planPeriod = metric.planPeriodAdSpend ?? metric.planMonthAdSpend ?? planToDate;
  const forecastSpend = metric.adForecastSpend ?? null;
  const completion = metric.adForecastCompletion ?? metric.adCompletionToDate ?? null;
  const tone = drrDanger ? 'danger' : skuPlanFactTone(completion);
  const valueRatio = completion === null || completion === undefined || !Number.isFinite(Number(completion))
    ? 0
    : Math.max(0, Number(completion));
  const forecastLabel = metric.adForecastDays && metric.adElapsedDays && metric.adForecastDays > metric.adElapsedDays
    ? 'прогноз месяца'
    : 'прогноз периода';
  const planMetaRows = [
    planToDate !== null && planToDate !== undefined ? `план к дате ${fmt.money(planToDate)}` : 'план к дате —',
    forecastSpend !== null && forecastSpend !== undefined && planPeriod !== null && planPeriod !== undefined
      ? `${forecastLabel} ${fmt.money(forecastSpend)} / ${fmt.money(planPeriod)}`
      : '',
    metric.drr !== null && metric.drr !== undefined
      ? `ДРР ${fmt.pct(metric.drr)}${limit !== null && limit !== undefined ? ` · план ${fmt.pct(limit)}` : ''}`
      : ''
  ].filter(Boolean);
  return skuPlanFactHealthBarHtml({
    platform: tonePlatform,
    label: 'Реклама',
    valueRatio,
    valueText: completion === null || completion === undefined ? '—' : fmt.pct(completion),
    barText: completion === null || completion === undefined ? '—' : fmt.pct(completion),
    tone,
    metaHtml: `<b>${fmt.money(metric.adSpend)}</b>${planMetaRows.map((item) => `<em>${item}</em>`).join('')}${drrTone ? `<em class="${drrTone}">${drrDanger ? 'ДРР выше плана' : 'ДРР под контролем'}</em>` : ''}`
  });
}

function skuPlanFactSubstitutionHtml(metric = {}) {
  const views = numberOrZero(metric.substitutionViews);
  const carts = numberOrZero(metric.substitutionCarts);
  const orders = numberOrZero(metric.substitutionOrders);
  const favorites = numberOrZero(metric.substitutionFavorites);
  const count = numberOrZero(metric.substitutionCount);
  const campaigns = numberOrZero(metric.substitutionCampaignCount);
  const orderRate = metric.substitutionOrderRate ?? (views > 0 ? orders / views : null);
  const cartRate = metric.substitutionCartRate ?? (views > 0 ? carts / views : null);
  const top = Array.isArray(metric.substitutionTop) ? metric.substitutionTop[0] : null;
  const hasTraffic = views > 0 || orders > 0 || carts > 0;
  if (!hasTraffic) {
    return skuPlanFactHealthBarHtml({
      platform: 'wb',
      label: 'WB подмены',
      valueRatio: 0,
      valueText: '—',
      barText: '—',
      tone: '',
      metaHtml: '<em>нет трафика подмен</em>'
    });
  }
  const tone = orderRate === null ? 'info' : (orderRate >= 0.06 ? 'ok' : (orderRate >= 0.03 ? 'warn' : 'danger'));
  const metaRows = [
    `<b>${fmt.int(orders)} заказов</b>`,
    `<em>${fmt.int(views)} просмотров</em>`,
    `<em>${fmt.int(carts)} корзин · ${fmt.int(favorites)} избранное</em>`,
    `<em>${fmt.int(count)} подмен · ${fmt.int(campaigns)} кампаний</em>`,
    top ? `<em>топ: ${escapeHtml(top.label || top.key || '')} · ${fmt.int(top.orders)} заказов</em>` : ''
  ].filter(Boolean).join('');
  return skuPlanFactHealthBarHtml({
    platform: 'wb',
    label: 'WB подмены',
    valueRatio: orderRate,
    valueText: fmt.pct(orderRate),
    barText: `корзина ${fmt.pct(cartRate)}`,
    tone,
    metaHtml: metaRows
  });
}

function skuPlanFactContextNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function skuPlanFactContextAttr(name, value) {
  if (value === null || value === undefined || value === '') return '';
  return ` ${name}="${escapeHtml(String(value))}"`;
}

function skuPlanFactContextPeriodLabel(periodStart = '', periodEnd = '', monthKey = '') {
  if (periodStart && periodEnd && periodStart !== periodEnd) return `${periodStart} - ${periodEnd}`;
  if (periodEnd) return `по ${periodEnd}`;
  return monthKey || '';
}

function skuPlanFactArticleMatches(row = {}, articleKey = '') {
  const target = skuPlanFactToken(articleKey);
  if (!target) return false;
  return [
    row.articleKey,
    row.article,
    row.sku,
    row.vendorCode,
    row.offerId,
    row.offer_id,
    row.nmId
  ].some((value) => skuPlanFactToken(value) === target);
}

function skuPlanFactMetricContext(row = {}, model = {}, metric = null) {
  const displayMetric = metric || skuPlanFactDisplayMetric(row, model);
  const platform = displayMetric.platform || model.filters?.platform || 'all';
  const periodStart = model.periodStart || model.dateMin || '';
  const periodEnd = model.periodEnd || model.maxFactDate || model.selectedDate || '';
  return {
    source: 'sku-plan-fact',
    articleKey: row.articleKey || row.article || '',
    article: row.article || row.articleKey || '',
    name: row.name || '',
    owner: row.owner || '',
    platform,
    platformLabel: displayMetric.label || skuPlanFactPlatformLabel(platform),
    monthKey: model.monthKey || '',
    monthLabel: model.monthLabel || model.monthKey || '',
    periodStart,
    periodEnd,
    periodLabel: skuPlanFactContextPeriodLabel(periodStart, periodEnd, model.monthKey || ''),
    planRevenue: numberOrZero(displayMetric.planRevenue),
    planToDateRevenue: numberOrZero(displayMetric.planToDateRevenue),
    factRevenue: numberOrZero(displayMetric.factRevenue),
    planUnits: numberOrZero(displayMetric.planUnits),
    planToDateUnits: numberOrZero(displayMetric.planToDateUnits),
    factUnits: numberOrZero(displayMetric.factUnits),
    completionToDate: skuPlanFactContextNumber(displayMetric.completionToDate),
    gapToDate: numberOrZero(displayMetric.gapToDate),
    marginPct: skuPlanFactNormalizeRatio(displayMetric.marginPct),
    marginRub: displayMetric.marginRub ?? null,
    drr: displayMetric.drr ?? null,
    adSpend: numberOrZero(displayMetric.adSpend),
    tonePlatform: displayMetric.tonePlatform || platform
  };
}

function skuPlanFactContextAttrs(context = {}) {
  if (!context.articleKey) return '';
  return [
    skuPlanFactContextAttr('data-open-sku', context.articleKey),
    ' data-sku-plan-context="1"',
    skuPlanFactContextAttr('data-sku-plan-article', context.articleKey),
    skuPlanFactContextAttr('data-sku-plan-platform', context.platform),
    skuPlanFactContextAttr('data-sku-plan-platform-label', context.platformLabel),
    skuPlanFactContextAttr('data-sku-plan-month', context.monthKey),
    skuPlanFactContextAttr('data-sku-plan-month-label', context.monthLabel),
    skuPlanFactContextAttr('data-sku-plan-period-start', context.periodStart),
    skuPlanFactContextAttr('data-sku-plan-period-end', context.periodEnd),
    skuPlanFactContextAttr('data-sku-plan-period-label', context.periodLabel),
    skuPlanFactContextAttr('data-sku-plan-plan-revenue', context.planRevenue),
    skuPlanFactContextAttr('data-sku-plan-plan-to-date-revenue', context.planToDateRevenue),
    skuPlanFactContextAttr('data-sku-plan-fact-revenue', context.factRevenue),
    skuPlanFactContextAttr('data-sku-plan-plan-units', context.planUnits),
    skuPlanFactContextAttr('data-sku-plan-plan-to-date-units', context.planToDateUnits),
    skuPlanFactContextAttr('data-sku-plan-fact-units', context.factUnits),
    skuPlanFactContextAttr('data-sku-plan-completion-to-date', context.completionToDate),
    skuPlanFactContextAttr('data-sku-plan-gap-to-date', context.gapToDate),
    skuPlanFactContextAttr('data-sku-plan-margin-pct', context.marginPct),
    skuPlanFactContextAttr('data-sku-plan-margin-rub', context.marginRub),
    skuPlanFactContextAttr('data-sku-plan-drr', context.drr),
    skuPlanFactContextAttr('data-sku-plan-ad-spend', context.adSpend)
  ].join('');
}

function skuPlanFactOpenAttrs(row = {}, model = {}, metric = null) {
  if (row.syntheticUnmapped) return '';
  return skuPlanFactContextAttrs(skuPlanFactMetricContext(row, model, metric));
}

function skuPlanFactDatasetContext(element = null) {
  const data = element?.dataset || {};
  const articleKey = String(data.skuPlanArticle || data.openSku || '').trim();
  if (!articleKey || data.skuPlanContext !== '1') return null;
  return {
    source: 'sku-plan-fact',
    articleKey,
    article: articleKey,
    platform: data.skuPlanPlatform || 'all',
    platformLabel: data.skuPlanPlatformLabel || skuPlanFactPlatformLabel(data.skuPlanPlatform || 'all'),
    monthKey: data.skuPlanMonth || '',
    monthLabel: data.skuPlanMonthLabel || data.skuPlanMonth || '',
    periodStart: data.skuPlanPeriodStart || '',
    periodEnd: data.skuPlanPeriodEnd || '',
    periodLabel: data.skuPlanPeriodLabel || skuPlanFactContextPeriodLabel(data.skuPlanPeriodStart || '', data.skuPlanPeriodEnd || '', data.skuPlanMonth || ''),
    planRevenue: numberOrZero(data.skuPlanPlanRevenue),
    planToDateRevenue: numberOrZero(data.skuPlanPlanToDateRevenue),
    factRevenue: numberOrZero(data.skuPlanFactRevenue),
    planUnits: numberOrZero(data.skuPlanPlanUnits),
    planToDateUnits: numberOrZero(data.skuPlanPlanToDateUnits),
    factUnits: numberOrZero(data.skuPlanFactUnits),
    completionToDate: skuPlanFactContextNumber(data.skuPlanCompletionToDate),
    gapToDate: numberOrZero(data.skuPlanGapToDate),
    marginPct: skuPlanFactNormalizeRatio(data.skuPlanMarginPct),
    marginRub: skuPlanFactContextNumber(data.skuPlanMarginRub),
    drr: skuPlanFactContextNumber(data.skuPlanDrr),
    adSpend: numberOrZero(data.skuPlanAdSpend),
    tonePlatform: data.skuPlanPlatform || 'all'
  };
}

function skuPlanFactSetActiveContextFromElement(element = null) {
  const context = skuPlanFactDatasetContext(element);
  state.activeSkuPlanFactContext = context || null;
  return context;
}

function skuPlanFactContextForArticle(articleKey = '', preferredContext = null) {
  if (preferredContext?.articleKey && skuPlanFactToken(preferredContext.articleKey) === skuPlanFactToken(articleKey)) {
    return preferredContext;
  }
  if (!articleKey) return null;
  const model = skuPlanFactBuildModel();
  const rows = Array.isArray(model.allRows) ? model.allRows : (model.rows || []);
  const row = rows.find((item) => !item.syntheticUnmapped && skuPlanFactArticleMatches(item, articleKey));
  return row ? skuPlanFactMetricContext(row, model, skuPlanFactDisplayMetric(row, model)) : null;
}

function skuPlanFactRowHtml(row, model) {
  const metric = skuPlanFactDisplayMetric(row, model);
  const totalTone = skuPlanFactTone(metric.completionToDate);
  const articleTitle = row.article || row.articleKey;
  const openAttrs = skuPlanFactOpenAttrs(row, model, metric);
  const problemMeta = row.matrixProblemMeta || (typeof skuMatrixProblemMeta === 'function' ? skuMatrixProblemMeta(row.matrixProblemState || 'ok') : null);
  const problemBadge = problemMeta && row.matrixProblemState && row.matrixProblemState !== 'ok'
    ? badge(problemMeta.label, problemMeta.tone || 'warn')
    : '';
  const articleHtml = row.syntheticUnmapped
    ? `<strong>${escapeHtml(articleTitle)}</strong><div class="badge-stack" style="margin-top:6px">${badge(row.status || SKU_PLAN_FACT_UNMAPPED_STATUS, 'warn')}</div>`
    : `<button class="link-btn" type="button"${openAttrs}>${escapeHtml(articleTitle)}</button>`;
  const attention = skuPlanFactAttentionScore(row) > 0 || (metric.completionToDate !== null && (metric.completionToDate < 0.9 || metric.completionToDate > 1.2));
  return `
    <tr class="sku-plan-fact-row ${row.syntheticUnmapped ? 'is-unmapped' : ''} ${attention ? 'is-attention' : ''}" style="${skuPlanFactCardStyle(metric.tonePlatform || metric.platform, metric.completionToDate)}"${openAttrs}>
      <td>${articleHtml}<div class="muted small">${escapeHtml(row.name)}</div></td>
      <td><strong>${escapeHtml(row.owner)}</strong><div class="muted small">${escapeHtml(row.status)}</div>${problemBadge ? `<div class="badge-stack" style="margin-top:6px">${problemBadge}</div>` : ''}</td>
      <td>${skuPlanFactPlatformScopeHtml(row, model)}</td>
      <td>${skuPlanFactCompletionHtml(metric)}</td>
      <td>${skuPlanFactFactPlanHtml(metric)}</td>
      <td>${skuPlanFactMarginHtml(metric)}</td>
      <td>${skuPlanFactAdHtml(metric, model)}</td>
      <td>${skuPlanFactSubstitutionHtml(metric)}</td>
      <td>
        ${row.syntheticUnmapped
          ? '<span class="muted small">нет карточки</span>'
          : `<button class="sku-plan-open-card ${attention ? 'danger' : ''}" type="button"${openAttrs} title="Открыть карточку SKU" aria-label="Открыть карточку SKU"><span aria-hidden="true">→</span></button>`}
      </td>
    </tr>
  `;
}

function skuPlanFactExportColumns() {
  const columns = [
    ['period_from', 'Период с'],
    ['period_to', 'Период по'],
    ['month', 'Месяц'],
    ['fact_to', 'Факт по дату'],
    ['kpi_fact_total_revenue', 'KPI-факт всего, ₽'],
    ['api_fact_total_revenue', 'API-факт всего, ₽'],
    ['kpi_api_delta_total', 'Дельта KPI/API всего, ₽'],
    ['fact_source_note', 'Источник факта'],
    ['article_key', 'Article key'],
    ['article', 'Артикул'],
    ['name', 'Товар'],
    ['owner', 'Owner'],
    ['status', 'Статус'],
    ['matrix_problem', 'Проблема матрицы']
  ];
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    const label = skuPlanFactPlatformLabel(platform);
    const suffix = platform;
    columns.push(
      [`plan_${suffix}_revenue`, `План ${label}, ₽`],
      [`plan_${suffix}_to_date_revenue`, `План ${label} за период, ₽`],
      [`fact_${suffix}_revenue`, `Факт ${label}, ₽`],
      [`plan_${suffix}_units`, `План ${label}, шт`],
      [`fact_${suffix}_units`, `Факт ${label}, шт`],
      [`completion_${suffix}_to_date_pct`, `Выполнение ${label} за период, %`],
      [`avg_check_${suffix}_fact`, `Средний чек ${label} факт`],
      [`avg_check_${suffix}_plan`, `Средний чек ${label} план`],
      [`margin_${suffix}_pct`, `Маржа ${label}, %`],
      [`margin_${suffix}_rub`, `Маржа ${label}, ₽`],
      [`plan_margin_${suffix}_pct`, `План маржи ${label}, %`],
      [`plan_margin_${suffix}_rub`, `План маржи ${label}, ₽`],
      [`drr_${suffix}`, `ДРР ${label}`],
      [`ad_spend_${suffix}`, `Реклама ${label}, ₽`],
      [`plan_drr_${suffix}`, `План ДРР ${label}`],
      [`plan_ad_spend_${suffix}`, `План рекламы ${label} за период, ₽`],
      [`plan_ad_spend_${suffix}_to_date`, `План рекламы ${label} к дате, ₽`],
      [`ad_forecast_${suffix}`, `Прогноз рекламы ${label}, ₽`],
      [`ad_completion_${suffix}_to_date_pct`, `Выполнение рекламы ${label} к дате, %`],
      [`ad_completion_${suffix}_forecast_pct`, `Прогноз выполнения рекламы ${label}, %`],
      [`turnover_${suffix}_days`, `Оборачиваемость ${label}, дн`],
      [`stock_${suffix}`, `Остаток ${label}`]
    );
    if (platform === 'wb') {
      columns.push(
        ['substitution_wb_views', 'WB подмены: просмотры'],
        ['substitution_wb_carts', 'WB подмены: корзины'],
        ['substitution_wb_orders', 'WB подмены: заказы'],
        ['substitution_wb_favorites', 'WB подмены: избранное'],
        ['substitution_wb_articles', 'WB подмены: артикулы'],
        ['substitution_wb_campaigns', 'WB подмены: кампании'],
        ['substitution_wb_cart_rate_pct', 'WB подмены: конверсия в корзину'],
        ['substitution_wb_order_rate_pct', 'WB подмены: конверсия в заказ']
      );
    }
  });
  columns.push(
    ['plan_total_revenue', 'План всего, ₽'],
    ['plan_total_to_date_revenue', 'План всего за период, ₽'],
    ['fact_total_revenue', 'Факт всего, ₽'],
    ['completion_total_to_date_pct', 'Выполнение всего за период, %'],
    ['gap_total_to_date', 'Отклонение за период, ₽'],
    ['margin_total_pct', 'Маржа всего, %'],
    ['margin_total_rub', 'Маржа всего, ₽'],
    ['plan_margin_total_pct', 'План маржи всего, %'],
    ['plan_margin_total_rub', 'План маржи всего, ₽'],
    ['drr_total', 'ДРР total'],
    ['plan_drr_total', 'План ДРР total'],
    ['ad_spend_total', 'Реклама total, ₽'],
    ['plan_ad_spend_total', 'План рекламы total за период, ₽'],
    ['plan_ad_spend_total_to_date', 'План рекламы total к дате, ₽'],
    ['ad_forecast_total', 'Прогноз рекламы total, ₽'],
    ['ad_completion_total_to_date_pct', 'Выполнение рекламы total к дате, %'],
    ['ad_completion_total_forecast_pct', 'Прогноз выполнения рекламы total, %'],
    ['substitution_total_views', 'WB подмены total: просмотры'],
    ['substitution_total_carts', 'WB подмены total: корзины'],
    ['substitution_total_orders', 'WB подмены total: заказы'],
    ['substitution_total_favorites', 'WB подмены total: избранное'],
    ['substitution_total_articles', 'WB подмены total: артикулы'],
    ['substitution_total_campaigns', 'WB подмены total: кампании'],
    ['substitution_total_cart_rate_pct', 'WB подмены total: конверсия в корзину'],
    ['substitution_total_order_rate_pct', 'WB подмены total: конверсия в заказ']
  );
  return columns;
}

function skuPlanFactExportRows(rows, model) {
  const kpiTotal = Number(model.totals?.kpiFactRevenue);
  const apiTotal = Number(model.totals?.apiFactRevenue ?? model.totals?.payrollOriginal?.factRevenue);
  const kpiApiDelta = Number(model.totals?.kpiFactDelta);
  const hasKpiApiContext = Number.isFinite(kpiTotal) && kpiTotal > 0 && Number.isFinite(apiTotal) && apiTotal > 0;
  return rows.map((row) => {
    const payload = {
      period_from: model.periodStart || model.dateMin || '',
      period_to: model.periodEnd || model.maxFactDate || '',
      month: model.monthKey,
      fact_to: model.maxFactDate,
      kpi_fact_total_revenue: hasKpiApiContext ? Math.round(kpiTotal) : '',
      api_fact_total_revenue: hasKpiApiContext ? Math.round(apiTotal) : '',
      kpi_api_delta_total: hasKpiApiContext ? Math.round(Number.isFinite(kpiApiDelta) ? kpiApiDelta : kpiTotal - apiTotal) : '',
      fact_source_note: hasKpiApiContext ? 'KPI-факт из company_plan; API-факт из SKU/API слоя' : 'SKU/API слой',
      article_key: row.articleKey,
      article: row.article,
      name: row.name,
      owner: row.owner,
      status: row.status,
      matrix_problem: row.matrixProblemMeta?.label || row.matrixProblemState || ''
    };
    SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
      const metric = row.platforms?.[platform] || row[platform] || {};
      const suffix = platform;
      payload[`plan_${suffix}_revenue`] = Math.round(metric.planRevenue || 0);
      payload[`plan_${suffix}_to_date_revenue`] = Math.round(metric.planToDateRevenue || 0);
      payload[`fact_${suffix}_revenue`] = Math.round(metric.factRevenue || 0);
      payload[`plan_${suffix}_units`] = Math.round(metric.planUnits || 0);
      payload[`fact_${suffix}_units`] = Math.round(metric.factUnits || 0);
      payload[`completion_${suffix}_to_date_pct`] = metric.completionToDate === null ? '' : metric.completionToDate;
      payload[`avg_check_${suffix}_fact`] = metric.factAvgCheck === null ? '' : Math.round(metric.factAvgCheck);
      payload[`avg_check_${suffix}_plan`] = metric.planAvgCheck === null ? '' : Math.round(metric.planAvgCheck);
      payload[`margin_${suffix}_pct`] = skuPlanFactNormalizeRatio(metric.marginPct) === null ? '' : skuPlanFactNormalizeRatio(metric.marginPct);
      payload[`margin_${suffix}_rub`] = metric.marginRub === null || metric.marginRub === undefined ? '' : Math.round(metric.marginRub);
      payload[`plan_margin_${suffix}_pct`] = skuPlanFactNormalizeRatio(metric.planMarginPct) === null ? '' : skuPlanFactNormalizeRatio(metric.planMarginPct);
      payload[`plan_margin_${suffix}_rub`] = metric.planMarginRub === null || metric.planMarginRub === undefined ? '' : Math.round(metric.planMarginRub);
      payload[`drr_${suffix}`] = metric.drr === null ? '' : metric.drr;
      payload[`ad_spend_${suffix}`] = Math.round(metric.adSpend || 0);
      payload[`plan_drr_${suffix}`] = metric.planDrr === null || metric.planDrr === undefined ? '' : metric.planDrr;
      payload[`plan_ad_spend_${suffix}`] = metric.planAdSpend === null || metric.planAdSpend === undefined ? '' : Math.round(metric.planAdSpend);
      payload[`plan_ad_spend_${suffix}_to_date`] = metric.planAdSpendToDate === null || metric.planAdSpendToDate === undefined ? '' : Math.round(metric.planAdSpendToDate);
      payload[`ad_forecast_${suffix}`] = metric.adForecastSpend === null || metric.adForecastSpend === undefined ? '' : Math.round(metric.adForecastSpend);
      payload[`ad_completion_${suffix}_to_date_pct`] = metric.adCompletionToDate === null || metric.adCompletionToDate === undefined ? '' : metric.adCompletionToDate;
      payload[`ad_completion_${suffix}_forecast_pct`] = metric.adForecastCompletion === null || metric.adForecastCompletion === undefined ? '' : metric.adForecastCompletion;
      payload[`turnover_${suffix}_days`] = metric.turnoverDays === null ? '' : metric.turnoverDays;
      payload[`stock_${suffix}`] = metric.stock === null ? '' : Math.round(metric.stock);
      if (platform === 'wb') {
        payload.substitution_wb_views = Math.round(metric.substitutionViews || 0);
        payload.substitution_wb_carts = Math.round(metric.substitutionCarts || 0);
        payload.substitution_wb_orders = Math.round(metric.substitutionOrders || 0);
        payload.substitution_wb_favorites = Math.round(metric.substitutionFavorites || 0);
        payload.substitution_wb_articles = Math.round(metric.substitutionCount || 0);
        payload.substitution_wb_campaigns = Math.round(metric.substitutionCampaignCount || 0);
        payload.substitution_wb_cart_rate_pct = metric.substitutionCartRate === null || metric.substitutionCartRate === undefined ? '' : metric.substitutionCartRate;
        payload.substitution_wb_order_rate_pct = metric.substitutionOrderRate === null || metric.substitutionOrderRate === undefined ? '' : metric.substitutionOrderRate;
      }
    });
    payload.plan_total_revenue = Math.round(row.planRevenue || 0);
    payload.plan_total_to_date_revenue = Math.round(row.planToDateRevenue || 0);
    payload.fact_total_revenue = Math.round(row.factRevenue || 0);
    payload.completion_total_to_date_pct = row.completionToDate === null ? '' : row.completionToDate;
    payload.gap_total_to_date = Math.round(row.gapToDate || 0);
    payload.margin_total_pct = row.marginPct === null ? '' : row.marginPct;
    payload.margin_total_rub = row.marginRub === null ? '' : Math.round(row.marginRub || 0);
    payload.plan_margin_total_pct = row.planMarginPct === null || row.planMarginPct === undefined ? '' : row.planMarginPct;
    payload.plan_margin_total_rub = row.planMarginRub === null || row.planMarginRub === undefined ? '' : Math.round(row.planMarginRub || 0);
    payload.drr_total = row.drr === null ? '' : row.drr;
    payload.plan_drr_total = row.planDrr === null || row.planDrr === undefined ? '' : row.planDrr;
    payload.ad_spend_total = Math.round(row.adSpend || 0);
    payload.plan_ad_spend_total = row.planAdSpend === null || row.planAdSpend === undefined ? '' : Math.round(row.planAdSpend || 0);
    payload.plan_ad_spend_total_to_date = row.planAdSpendToDate === null || row.planAdSpendToDate === undefined ? '' : Math.round(row.planAdSpendToDate || 0);
    payload.ad_forecast_total = row.adForecastSpend === null || row.adForecastSpend === undefined ? '' : Math.round(row.adForecastSpend || 0);
    payload.ad_completion_total_to_date_pct = row.adCompletionToDate === null || row.adCompletionToDate === undefined ? '' : row.adCompletionToDate;
    payload.ad_completion_total_forecast_pct = row.adForecastCompletion === null || row.adForecastCompletion === undefined ? '' : row.adForecastCompletion;
    payload.substitution_total_views = Math.round(row.substitutionViews || 0);
    payload.substitution_total_carts = Math.round(row.substitutionCarts || 0);
    payload.substitution_total_orders = Math.round(row.substitutionOrders || 0);
    payload.substitution_total_favorites = Math.round(row.substitutionFavorites || 0);
    payload.substitution_total_articles = Math.round(row.substitutionCount || 0);
    payload.substitution_total_campaigns = Math.round(row.substitutionCampaignCount || 0);
    payload.substitution_total_cart_rate_pct = row.substitutionCartRate === null || row.substitutionCartRate === undefined ? '' : row.substitutionCartRate;
    payload.substitution_total_order_rate_pct = row.substitutionOrderRate === null || row.substitutionOrderRate === undefined ? '' : row.substitutionOrderRate;
    return payload;
  });
}

function skuPlanFactModelNeedsExportHydration(model = {}) {
  const monthEnd = model.monthKey ? skuPlanFactMonthEnd(model.monthKey) : '';
  const apiFact = Number(model.totals?.apiFactRevenue || 0);
  const kpiFact = Number(model.totals?.kpiFactRevenue ?? model.totals?.factRevenue ?? 0);
  const rowCount = Array.isArray(model.rows) ? model.rows.length : 0;
  const filters = model.filters || {};
  const unfilteredScope = !filters.search && (!filters.owner || filters.owner === 'all') && (!filters.platform || filters.platform === 'all');
  return Boolean(
    (monthEnd && model.periodEnd === monthEnd && kpiFact > 0 && apiFact <= 0)
    || (unfilteredScope && kpiFact > 0 && rowCount > 0 && rowCount < 170)
  );
}

async function skuPlanFactHydratedExportModel(model = null) {
  let current = model || skuPlanFactBuildModel();
  if (!skuPlanFactModelNeedsExportHydration(current)) return current;
  try {
    if (typeof ensureViewData === 'function') await ensureViewData('sku-plan-fact');
    if (typeof portalRefreshOperationalDataPayloads === 'function') await portalRefreshOperationalDataPayloads();
  } catch (error) {
    console.warn('[sku-plan-fact-export-hydration]', error);
  }
  const refreshed = skuPlanFactBuildModel();
  return skuPlanFactModelNeedsExportHydration(refreshed) ? current : refreshed;
}

async function downloadSkuPlanFactExcel(model) {
  const now = Date.now();
  if (skuPlanFactExcelDownloadLockUntil && now < skuPlanFactExcelDownloadLockUntil) return;
  skuPlanFactExcelDownloadLockUntil = now + 1500;
  model = await skuPlanFactHydratedExportModel(model);
  if (!model.rows.length) {
    window.alert('По текущим фильтрам нет строк для выгрузки.');
    skuPlanFactExcelDownloadLockUntil = 0;
    return;
  }
  const from = String(model.periodStart || model.dateMin || model.monthKey || '').replace(/[^0-9-]/g, '');
  const to = String(model.periodEnd || model.maxFactDate || model.monthKey || '').replace(/[^0-9-]/g, '');
  const periodSuffix = from && to ? `${from}_${to}` : (model.monthKey || 'latest');
  downloadLaunchesHtmlTable(skuPlanFactExportColumns(), skuPlanFactExportRows(model.rows, model), `sku-plan-fact-${periodSuffix}.xls`);
}

function skuPlanFactQualityExportColumns() {
  return [
    ['decision', 'Решение: alias / new_sku / ignore / need_check'],
    ['decision_hint', 'Подсказка по решению'],
    ['target_sku', 'SKU в реестре (заполнять для alias)'],
    ['suggested_decision', 'Подсказка портала'],
    ['suggested_target_sku', 'Кандидат SKU'],
    ['candidate_1', 'Like-for-like кандидат 1'],
    ['candidate_1_match', 'Сходство 1'],
    ['candidate_1_status', 'Статус 1'],
    ['candidate_2', 'Like-for-like кандидат 2'],
    ['candidate_2_match', 'Сходство 2'],
    ['candidate_2_status', 'Статус 2'],
    ['platform', 'Площадка'],
    ['api_sku', 'API SKU'],
    ['status', 'Статус записи (обычно active)'],
    ['note', 'Комментарий'],
    ['month', 'Месяц'],
    ['fact_to', 'Факт до'],
    ['severity', 'Уровень'],
    ['type', 'Проблема'],
    ['article_key', 'SKU/API'],
    ['name', 'Название'],
    ['revenue', 'Сумма'],
    ['units', 'Шт'],
    ['recommended_action', 'Что сделать']
  ];
}

function skuPlanFactDecisionHint(issue = {}) {
  const type = String(issue.type || '').toLowerCase();
  const action = String(issue.action || '').toLowerCase();
  if (type.includes('owner') || action.includes('owner')) {
    return 'Поставьте need_check и заполните owner в реестре SKU; alias тут обычно не нужен.';
  }
  if (type.includes('агрегат') || action.includes('детал')) {
    return 'Сначала проверьте API-детализацию. Если нашли товар в реестре - alias; если это новый товар - new_sku; если мусор источника - ignore.';
  }
  if (type.includes('api sku') || action.includes('alias') || action.includes('dim_sku_aliases')) {
    return 'Если это существующий товар - alias + target_sku. Если товара нет в реестре - new_sku. Если маппить не нужно - ignore.';
  }
  return 'Если уверены в паре - alias + target_sku; если не уверены - need_check; если строку не надо маппить - ignore.';
}

function skuPlanFactQualityIssuesForExport(model = {}) {
  const rows = [
    ...(model.quality?.issues || []),
    ...(state.portalDataQuality?.issues || [])
  ];
  const seen = new Set();
  return rows.filter((issue) => {
    const key = [
      issue.type || '',
      issue.platform || '',
      issue.articleKey || issue.api_sku || issue.apiSku || '',
      Math.round(numberOrZero(issue.revenue || 0))
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function skuPlanFactQualityExportRows(model) {
  return skuPlanFactQualityIssuesForExport(model).map((issue) => {
    const contourRow = {
      ...issue,
      apiSku: issue.articleKey || issue.api_sku || issue.apiSku || '',
      status: 'new'
    };
    const candidates = skuContourLikeForLikeCandidates(contourRow, 2);
    const suggestion = skuContourRecommendedDecision(contourRow, candidates);
    return {
      decision: suggestion.decision,
      decision_hint: skuPlanFactDecisionHint(issue),
      target_sku: suggestion.decision === 'alias' ? suggestion.targetSku : '',
      suggested_decision: suggestion.decision,
      suggested_target_sku: suggestion.targetSku || '',
      candidate_1: candidates[0]?.articleKey || '',
      candidate_1_match: candidates[0] ? Math.round((candidates[0].matchScore || 0) * 100) : '',
      candidate_1_status: candidates[0]?.displayStatus || candidates[0]?.category || '',
      candidate_2: candidates[1]?.articleKey || '',
      candidate_2_match: candidates[1] ? Math.round((candidates[1].matchScore || 0) * 100) : '',
      candidate_2_status: candidates[1]?.displayStatus || candidates[1]?.category || '',
      platform: issue.platform || 'all',
      api_sku: contourRow.apiSku,
      status: 'active',
      note: issue.action || suggestion.text || '',
      month: model.monthKey,
      fact_to: model.maxFactDate || state.portalDataQuality?.summary?.maxDate || '',
      severity: issue.severity,
      type: skuContourReadableIssueType(issue.type),
      article_key: contourRow.apiSku,
      name: issue.name,
      revenue: Math.round(issue.revenue || 0),
      units: Math.round(issue.units || 0),
      recommended_action: suggestion.text || issue.action
    };
  });
}

async function downloadSkuPlanFactQualityExcel(model) {
  model = await skuPlanFactHydratedExportModel(model);
  const rows = skuPlanFactQualityExportRows(model);
  if (!rows.length) {
    window.alert('Проблем качества данных по текущему срезу нет.');
    return;
  }
  downloadLaunchesHtmlTable(skuPlanFactQualityExportColumns(), rows, `sku-plan-fact-data-quality-${model.monthKey}.xls`);
}

const OOS_CONTROL_STATUS_META = {
  oos: { label: 'OOS', tone: 'danger', priority: 'critical' },
  critical: { label: 'Критично', tone: 'danger', priority: 'critical' },
  risk: { label: 'OOS скоро <5 д', tone: 'warn', priority: 'high' },
  watch: { label: 'Наблюдать', tone: 'info', priority: 'medium' }
};

const OOS_CONTROL_TASK_STATUSES = ['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision', 'done'];
const OOS_CONTROL_RISK_HORIZON_DAYS = 14;
const OOS_CONTROL_PLATFORM_META = {
  all: { label: 'Все площадки', shortLabel: 'Все', color: '#d8c6a4' },
  wb: { label: 'Wildberries', shortLabel: 'WB', color: '#a855f7' },
  ozon: { label: 'Ozon', shortLabel: 'Ozon', color: '#4f86ff' },
  ya: { label: 'Яндекс Маркет', shortLabel: 'Я.Маркет', color: '#f2c84b' },
  goldapple: { label: 'Золотое Яблоко', shortLabel: 'ЗЯ', color: '#72c86a' },
  letu: { label: 'Л’Этуаль', shortLabel: 'Л’Этуаль', color: '#d96aa9' },
  magnit: { label: 'Магнит Маркет', shortLabel: 'Магнит', color: '#e85b55' }
};

function oosControlPayload() {
  return state.oosControl && typeof state.oosControl === 'object'
    ? state.oosControl
    : { schema: 'portal-oos-control-v2', generatedAt: '', summary: {}, rows: [], history: { days: [] } };
}

function oosControlNormalizePlatform(value = 'all') {
  let key = String(value || 'all').trim().toLowerCase();
  if (!key || key === 'undefined' || key === 'null') key = 'all';
  if (['ym', 'yandex', 'yandexmarket', 'yamarket'].includes(key)) key = 'ya';
  if (['goldenapple', 'gold-apple', 'gold_apple', 'зя'].includes(key)) key = 'goldapple';
  if (['letual', 'letuall', 'летуаль'].includes(key)) key = 'letu';
  if (['magnitmarket', 'magnit-market'].includes(key)) key = 'magnit';
  return OOS_CONTROL_PLATFORM_META[key] ? key : 'all';
}

function oosControlGlobalPlatformFilter(fallback = 'all') {
  let sawAll = false;
  const candidates = [
    typeof document !== 'undefined' ? document.documentElement?.dataset?.marketplace : '',
    typeof document !== 'undefined' ? document.body?.dataset?.marketplace : '',
    typeof document !== 'undefined' ? document.documentElement?.dataset?.platform : '',
    typeof document !== 'undefined' ? document.body?.dataset?.platform : '',
    state.filters?.platform,
    state.filters?.market
  ];
  try {
    candidates.push(window.localStorage?.getItem('altea.portal.marketplace'));
  } catch {
    candidates.push('');
  }
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || String(candidate).trim() === '') continue;
    const normalized = oosControlNormalizePlatform(candidate);
    if (normalized && normalized !== 'all') return normalized;
    if (normalized === 'all') sawAll = true;
  }
  return sawAll ? 'all' : oosControlNormalizePlatform(fallback);
}

function oosControlOwnerForRow(row = {}) {
  const fallback = skuPlanFactCanonicalOwner(row.owner || '');
  const articleKey = row.articleKey || row.article || '';
  if (articleKey && typeof getSku === 'function') {
    try {
      const sku = getSku(articleKey);
      const platformOwner = sku && typeof skuPlanFactPlatformOwner === 'function'
        ? skuPlanFactPlatformOwner(sku, row.platform || '')
        : '';
      if (platformOwner) return platformOwner;
    } catch (error) {
      console.warn('OOS owner lookup failed', error);
    }
  }
  return fallback || 'Без owner';
}

function oosControlRows() {
  const payload = oosControlPayload();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  return rows.map((row) => {
    const owner = oosControlOwnerForRow(row);
    return owner && owner !== row.owner ? { ...row, owner } : row;
  });
}

function oosControlFilters() {
  state.oosControlFilters = state.oosControlFilters && typeof state.oosControlFilters === 'object'
    ? state.oosControlFilters
    : {};
  const ownerFilter = String(state.oosControlFilters.owner || 'all');
  return {
    search: String(state.oosControlFilters.search || '').trim(),
    platform: oosControlGlobalPlatformFilter(state.oosControlFilters.platform || 'all'),
    owner: ownerFilter === 'all' ? 'all' : (skuPlanFactCanonicalOwner(ownerFilter) || ownerFilter),
    department: String(state.oosControlFilters.department || 'all'),
    status: String(state.oosControlFilters.status || 'active'),
    cluster: String(state.oosControlFilters.cluster || 'all'),
    days: String(state.oosControlFilters.days || 'all')
  };
}

function oosControlStableIssueKey(row = {}) {
  const platform = String(row.platform || row.platformKey || '').trim().toLowerCase() || 'all';
  const article = String(row.articleKey || row.article || row.sku || '').trim().toLowerCase();
  const fallback = String(row.issueKey || '').trim().toLowerCase();
  return [platform, article].filter(Boolean).join('|') || fallback;
}

function oosControlTaskId(row = {}) {
  const stableKey = oosControlStableIssueKey(row);
  if (!stableKey) return String(row.taskId || '').trim();
  return typeof stableId === 'function'
    ? stableId('task', `oos_control|${stableKey}`)
    : `task-oos-${stableKey.replace(/[^\w-]+/g, '-')}`;
}

function oosControlTaskMarkers(row = {}) {
  return [
    oosControlStableIssueKey(row) ? `[oos-stable:${oosControlStableIssueKey(row)}]` : '',
    String(row.issueKey || '').trim() ? `[oos:${String(row.issueKey || '').trim()}]` : ''
  ].filter(Boolean);
}

function oosControlTaskFor(row = {}) {
  const tasks = Array.isArray(state.storage?.tasks) ? state.storage.tasks : [];
  const stableTaskId = oosControlTaskId(row);
  if (stableTaskId) {
    const byStableId = tasks.find((task) => task.id === stableTaskId);
    if (byStableId) return byStableId;
  }
  const taskId = String(row.taskId || '').trim();
  if (taskId) {
    const byId = tasks.find((task) => task.id === taskId);
    if (byId) return byId;
  }
  const markers = oosControlTaskMarkers(row);
  if (!markers.length) return null;
  return tasks
    .filter((task) => task?.autoCode === 'oos_control' && markers.some((marker) => String(task.reason || '').includes(marker)))
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || '') || 0;
      const rightTime = Date.parse(right.updatedAt || right.createdAt || '') || 0;
      return rightTime - leftTime;
    })[0] || null;
}

function oosControlTaskStatusLabel(task) {
  if (!task) return 'Нет задачи';
  const meta = TASK_STATUS_META[task.status] || TASK_STATUS_META.new;
  return meta.label || task.status || 'Задача';
}

function oosControlStatusTone(status = '') {
  return OOS_CONTROL_STATUS_META[status]?.tone || '';
}

function oosControlPriority(row = {}) {
  return OOS_CONTROL_STATUS_META[row.status]?.priority || (row.severity === 'critical' ? 'critical' : 'high');
}

function oosControlDue(row = {}) {
  if (row.status === 'oos' || row.status === 'critical') return plusDays(1);
  if (row.status === 'risk') return plusDays(2);
  return plusDays(5);
}

function oosControlUnique(rows, key) {
  return [...new Set(rows.map((row) => String(row?.[key] || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ru'));
}

function oosControlRowPlaces(row = {}) {
  const places = Array.isArray(row.placesAtRisk) && row.placesAtRisk.length
    ? row.placesAtRisk.map((place) => String(place?.place || '').trim()).filter(Boolean)
    : [String(row.place || '').trim()].filter(Boolean);
  return [...new Set(places)].sort((left, right) => left.localeCompare(right, 'ru'));
}

function oosControlUniquePlaces(rows = []) {
  return [...new Set(rows.flatMap(oosControlRowPlaces))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'ru'));
}

function oosControlOptions(values, selected, allLabel) {
  return [
    `<option value="all" ${selected === 'all' ? 'selected' : ''}>${escapeHtml(allLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(value)}</option>`)
  ].join('');
}

function oosControlTaskStatusOptions(selected) {
  return OOS_CONTROL_TASK_STATUSES
    .map((status) => {
      const meta = TASK_STATUS_META[status] || { label: status };
      return `<option value="${escapeHtml(status)}" ${selected === status ? 'selected' : ''}>${escapeHtml(meta.label || status)}</option>`;
    })
    .join('');
}

function oosControlHasRemoteStore() {
  if (typeof hasRemoteStore === 'function') return hasRemoteStore();
  return Boolean(state.team?.ready && (state.team.accessToken || state.team.client));
}

function oosControlCanUseRemote() {
  try {
    const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
    return Boolean(cfg?.teamMode === 'supabase' && cfg?.supabase?.url && cfg?.supabase?.anonKey);
  } catch {
    return false;
  }
}

async function oosControlEnsureRemoteReady() {
  if (oosControlHasRemoteStore()) return true;
  if (!oosControlCanUseRemote() || typeof initTeamStore !== 'function') return false;
  await initTeamStore();
  return oosControlHasRemoteStore();
}

function oosControlTeamNotice() {
  const remoteReady = oosControlHasRemoteStore();
  const canUseRemote = oosControlCanUseRemote();
  const note = String(state.team?.note || '').trim();
  if (remoteReady) {
    return `
      <div class="notice ok">
        <strong>Командная база подключена.</strong>
        <div class="muted small" style="margin-top:4px">${escapeHtml(note || 'OOS-задачи и контрмеры сохраняются для всей команды.')}</div>
      </div>
    `;
  }
  return `
    <div class="notice danger">
      <strong>Командная база задач не подключена.</strong>
      <div class="muted small" style="margin-top:4px">${escapeHtml(canUseRemote ? (note || 'Портал попробует переподключиться перед сохранением OOS-задачи.') : 'Сейчас сохранение останется только в этом браузере.')}</div>
      ${canUseRemote ? '<div class="actions" style="margin-top:8px;justify-content:flex-start"><button class="quick-chip" type="button" data-oos-reconnect-team>Подключить командную базу</button></div>' : ''}
    </div>
  `;
}

function oosControlFilteredRows() {
  const rows = oosControlRows();
  const filters = oosControlFilters();
  const search = filters.search.toLowerCase();
  const cluster = String(filters.cluster || 'all').trim();
  return rows.filter((row) => {
    const task = oosControlTaskFor(row);
    if (filters.platform !== 'all' && row.platform !== filters.platform) return false;
    if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
    if (filters.department !== 'all' && row.department !== filters.department) return false;
    const rowPlaces = oosControlRowPlaces(row);
    if (cluster !== 'all' && !rowPlaces.includes(cluster)) return false;
    if (filters.status === 'has_task' && !task) return false;
    if (filters.status === 'no_task' && task) return false;
    if (!['active', 'all', 'has_task', 'no_task'].includes(filters.status) && row.status !== filters.status) return false;
    if (search) {
      const haystack = [
        row.article,
        row.name,
        row.platformLabel,
        row.place,
        ...rowPlaces,
        row.owner,
        row.department,
        row.statusLabel,
        task?.title,
        task?.reason,
        task?.nextAction
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function oosControlFreshnessNotice(payload) {
  const freshness = payload.dataFreshness || {};
  const status = freshness.status || payload.summary?.dataStatus || 'unknown';
  const tone = status === 'ok' ? 'ok' : status === 'stale' ? 'danger' : 'warn';
  const text = freshness.message || (status === 'ok' ? 'Данные свежие.' : 'Свежесть данных нужно проверить.');
  const details = [
    freshness.dataDate ? `факт до ${freshness.dataDate}` : '',
    freshness.expectedFactDate ? `ожидается ${freshness.expectedFactDate}` : '',
    payload.generatedAt ? `сборка ${fmt.date(payload.generatedAt)}` : ''
  ].filter(Boolean).join(' · ');
  return `
    <div class="notice ${tone}">
      <strong>${escapeHtml(text)}</strong>
      <div class="muted small" style="margin-top:4px">${escapeHtml(details || 'Дата факта не определена')}</div>
    </div>
  `;
}

function renderOosControlKpis(summary = {}) {
  return `
    <div class="dashboard-grid-4" style="margin-top:14px">
      <div class="mini-kpi danger"><span>OOS сейчас</span><strong>${fmt.int(summary.oosCount || 0)}</strong><span>нулевой остаток</span></div>
      <div class="mini-kpi warn"><span>OOS скоро &lt;5 д</span><strong>${fmt.int(summary.oosSoonCount || summary.riskCount || 0)}</strong><span>активные / новинки</span></div>
      <div class="mini-kpi"><span>SKU в очереди</span><strong>${fmt.int(summary.skuCount || 0)}</strong><span>только активные статусы</span></div>
      <div class="mini-kpi"><span>Выручка под риском / день</span><strong>${fmt.money(summary.revenueAtRiskDay || 0)}</strong><span>по текущему темпу</span></div>
    </div>
  `;
}

function renderOosControlFilters(rows, filters) {
  const platformMap = new Map([
    ['wb', { key: 'wb', label: 'WB' }],
    ['ozon', { key: 'ozon', label: 'Ozon' }]
  ]);
  summarizeOosControlPlatforms(rows).forEach((item) => platformMap.set(item.key, item));
  const platformOptions = [
    `<option value="all" ${filters.platform === 'all' ? 'selected' : ''}>Все площадки</option>`,
    ...[...platformMap.values()].map((item) => (
      `<option value="${escapeHtml(item.key)}" ${filters.platform === item.key ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
    ))
  ].join('');
  const ownerOptions = oosControlOptions(oosControlUnique(rows, 'owner'), filters.owner, 'Все owner');
  const departmentOptions = oosControlOptions(oosControlUnique(rows, 'department'), filters.department, 'Все отделы');
  return `
    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="grid sku-plan-fact-filters" style="grid-template-columns:1.4fr repeat(4,minmax(0,180px));gap:10px">
        <label><span class="label">Поиск</span><input data-oos-filter="search" value="${escapeHtml(filters.search)}" placeholder="SKU, склад, owner, мера"></label>
        <label><span class="label">Сигнал</span>
          <select data-oos-filter="status">
            <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Все активные</option>
            <option value="oos" ${filters.status === 'oos' ? 'selected' : ''}>Только OOS</option>
            <option value="critical" ${filters.status === 'critical' ? 'selected' : ''}>Критично</option>
            <option value="risk" ${filters.status === 'risk' ? 'selected' : ''}>OOS скоро &lt;5 д</option>
            <option value="watch" ${filters.status === 'watch' ? 'selected' : ''}>Наблюдать</option>
            <option value="has_task" ${filters.status === 'has_task' ? 'selected' : ''}>С задачей</option>
            <option value="no_task" ${filters.status === 'no_task' ? 'selected' : ''}>Без задачи</option>
          </select>
        </label>
        <label><span class="label">Площадка</span><select data-oos-filter="platform">${platformOptions}</select></label>
        <label><span class="label">Owner</span><select data-oos-filter="owner">${ownerOptions}</select></label>
        <label><span class="label">Отдел</span><select data-oos-filter="department">${departmentOptions}</select></label>
      </div>
    </div>
  `;
}

function summarizeOosControlPlatforms(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row.platform) return;
    if (!map.has(row.platform)) map.set(row.platform, { key: row.platform, label: row.platformLabel || row.platform });
  });
  return [...map.values()].sort((left, right) => left.label.localeCompare(right.label, 'ru'));
}

function renderOosControlGroupSummary(payload = {}) {
  const byPlatform = Array.isArray(payload.byPlatform) ? payload.byPlatform.slice(0, 6) : [];
  const byOwner = Array.isArray(payload.byOwner) ? payload.byOwner.slice(0, 6) : [];
  const byDepartment = Array.isArray(payload.byDepartment) ? payload.byDepartment.slice(0, 6) : [];
  const renderLine = (item) => `
    <div class="alert-row">
      <div>
        <strong>${escapeHtml(item.label || item.key || '—')}</strong>
        <div class="muted small">${fmt.int(item.total || 0)} строк · риск ${fmt.money(item.revenueAtRiskDay || 0)}</div>
      </div>
      <div class="badge-stack">${item.oos ? badge(`${fmt.int(item.oos)} OOS`, 'danger') : ''}${item.risk ? badge(`${fmt.int(item.risk)} скоро`, 'warn') : ''}</div>
    </div>
  `;
  return `
    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead"><h3>По площадкам</h3>${badge(`${fmt.int(byPlatform.length)} контуров`)}</div>
        <div class="alert-stack">${byPlatform.map(renderLine).join('') || '<div class="empty">Нет сигналов</div>'}</div>
      </div>
      <div class="card">
        <div class="section-subhead"><h3>По owner</h3>${badge(`${fmt.int(byOwner.length)} owner`)}</div>
        <div class="alert-stack">${byOwner.map(renderLine).join('') || '<div class="empty">Нет сигналов</div>'}</div>
      </div>
    </div>
  `;
}

function renderOosControlGroupSummary(payload = {}) {
  const byPlatform = Array.isArray(payload.byPlatform) ? payload.byPlatform.slice(0, 6) : [];
  const byDepartment = Array.isArray(payload.byDepartment) ? payload.byDepartment.slice(0, 6) : [];
  const byOwner = Array.isArray(payload.byOwner) ? payload.byOwner.slice(0, 6) : [];
  const renderLine = (item) => `
    <div class="alert-row">
      <div>
        <strong>${escapeHtml(item.label || item.key || '-')}</strong>
        <div class="muted small">${fmt.int(item.total || 0)} строк · риск ${fmt.money(item.revenueAtRiskDay || 0)}</div>
      </div>
      <div class="badge-stack">${item.oos ? badge(`${fmt.int(item.oos)} OOS`, 'danger') : ''}${item.risk ? badge(`${fmt.int(item.risk)} скоро`, 'warn') : ''}</div>
    </div>
  `;
  const renderCard = (title, items, chip) => `
    <div class="card">
      <div class="section-subhead"><h3>${escapeHtml(title)}</h3>${badge(chip)}</div>
      <div class="alert-stack">${items.map(renderLine).join('') || '<div class="empty">Нет сигналов</div>'}</div>
    </div>
  `;
  return `
    <div class="dashboard-grid-3" style="margin-top:14px">
      ${renderCard('По площадкам', byPlatform, `${fmt.int(byPlatform.length)} контуров`)}
      ${renderCard('По отделам', byDepartment, `${fmt.int(byDepartment.length)} отделов`)}
      ${renderCard('По owner', byOwner, `${fmt.int(byOwner.length)} owner`)}
    </div>
  `;
}

function renderOosControlMonthlyHistory(payload = {}) {
  const summary = payload.summary || {};
  const monthKey = String(summary.monthKey || '').trim();
  const days = (Array.isArray(payload.history?.days) ? payload.history.days : [])
    .filter((item) => !monthKey || String(item?.date || '').startsWith(monthKey))
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))
    .slice(0, 14);
  const taskRows = oosControlRows().map((row) => ({ row, task: oosControlTaskFor(row) }));
  const taskCount = taskRows.filter((item) => item.task).length;
  const noTaskCount = Math.max(0, taskRows.length - taskCount);
  const noReasonCount = taskRows.filter((item) => item.task && !/Причина:|РџСЂРёС‡РёРЅР°:/i.test(String(item.task.reason || ''))).length;
  const noActionCount = taskRows.filter((item) => item.task && !String(item.task.nextAction || '').trim()).length;
  return `
    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <h3>Месяц OOS</h3>
          <div class="badge-stack">${badge(monthKey || 'месяц')}${badge(`${fmt.int(days.length)} дн.`)}</div>
        </div>
        <div class="dashboard-grid-3" style="margin-top:10px">
          <div class="mini-kpi danger"><span>Потеря OOS за месяц</span><strong>${fmt.money(summary.lostRevenueMonth || 0)}</strong><span>фактический аут</span></div>
          <div class="mini-kpi warn"><span>Риск выручки за месяц</span><strong>${fmt.money(summary.revenueAtRiskMonth || 0)}</strong><span>аут + скоро аут</span></div>
          <div class="mini-kpi"><span>Новых сигналов</span><strong>${fmt.int(summary.newIssues || 0)}</strong><span>за сегодня</span></div>
        </div>
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead><tr><th>Дата</th><th>OOS</th><th>Риск</th><th>Потеря / день</th><th>Риск / день</th></tr></thead>
            <tbody>
              ${days.map((day) => `
                <tr>
                  <td><strong>${escapeHtml(day.date || '')}</strong></td>
                  <td>${fmt.int(day.oosCount || 0)}</td>
                  <td>${fmt.int(day.oosSoonCount || day.riskCount || 0)}</td>
                  <td>${fmt.money(day.lostRevenueDay || 0)}</td>
                  <td>${fmt.money(day.revenueAtRiskDay || 0)}</td>
                </tr>
              `).join('') || '<tr><td colspan="5"><div class="empty">История начнет накапливаться после ежедневных синхронизаций</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="section-subhead"><h3>Дисциплина контура</h3>${badge(`${fmt.int(taskCount)} с задачей`)}</div>
        <div class="alert-stack">
          <div class="alert-row"><div><strong>Без задачи</strong><div class="muted small">Нужно назначить отдел и контрмеру</div></div>${badge(fmt.int(noTaskCount), noTaskCount ? 'warn' : 'ok')}</div>
          <div class="alert-row"><div><strong>Без причины</strong><div class="muted small">Закрывать нельзя без комментария отдела</div></div>${badge(fmt.int(noReasonCount), noReasonCount ? 'warn' : 'ok')}</div>
          <div class="alert-row"><div><strong>Без контрмеры</strong><div class="muted small">Должен быть следующий шаг</div></div>${badge(fmt.int(noActionCount), noActionCount ? 'warn' : 'ok')}</div>
        </div>
      </div>
    </div>
  `;
}

function renderOosControlRow(row) {
  const task = oosControlTaskFor(row);
  const taskStatus = task?.status || 'new';
  const reasonValue = task?.reason || '';
  const actionValue = task?.nextAction || row.recommendation || '';
  const dueValue = task?.due || oosControlDue(row);
  const taskBadge = task
    ? badge(oosControlTaskStatusLabel(task), TASK_STATUS_META[task.status]?.kind || '')
    : badge('нет задачи', 'warn');
  return `
    <tr>
      <td>
        <div><strong>${linkToSku(row.articleKey || row.article, row.article || row.articleKey)}</strong></div>
        <div class="muted small">${escapeHtml(row.name || '')}</div>
        <div class="badge-stack" style="margin-top:6px">${badge(row.platformLabel || row.platform)}${badge(row.place || 'склад')}</div>
      </td>
      <td>
        <div class="badge-stack">${badge(row.statusLabel || row.status, oosControlStatusTone(row.status))}${row.lifecycleLabel ? badge(row.lifecycleLabel, row.lifecycleStatus === 'new' ? 'info' : 'ok') : ''}${taskBadge}</div>
        <div class="muted small" style="margin-top:6px">с ${escapeHtml(row.firstSeenDate || 'сегодня')} · ${fmt.int(row.daysOpen || 1)} дн.</div>
      </td>
      <td>
        <strong>${fmt.int(row.inStock)}</strong>
        <div class="muted small">транзит ${fmt.int(row.inTransit)} · заявка ${fmt.int(row.inRequest)}</div>
      </td>
      <td>
        <strong>${row.turnoverDays === null || row.turnoverDays === undefined ? '—' : fmt.num(row.turnoverDays, 1)}</strong>
        <div class="muted small">шт/день ${fmt.num(row.avgDaily || 0, 1)}</div>
      </td>
      <td>
        <strong>${fmt.money(row.revenueAtRiskDay || 0)}</strong>
        <div class="muted small">потеря OOS ${fmt.money(row.lostRevenueDay || 0)}</div>
      </td>
      <td>
        <strong>${escapeHtml(row.owner || 'Без owner')}</strong>
        <div class="muted small">${escapeHtml(row.department || 'Команда')}</div>
      </td>
      <td style="min-width:420px">
        <div class="grid" style="grid-template-columns:minmax(0,140px) minmax(0,1fr);gap:8px" data-oos-task-form="${escapeHtml(row.issueKey)}">
          <select data-oos-department>
            ${['Закуп', 'Логистика', 'Производство', 'Команда MP', 'Маркетплейс / логистика', 'Реклама', 'Цены'].map((item) => (
              `<option value="${escapeHtml(item)}" ${item === row.department ? 'selected' : ''}>${escapeHtml(item)}</option>`
            )).join('')}
          </select>
          <input data-oos-reason value="${escapeHtml(reasonValue)}" placeholder="Причина / комментарий">
          <select data-oos-status>${oosControlTaskStatusOptions(taskStatus)}</select>
          <input data-oos-action value="${escapeHtml(actionValue)}" placeholder="Контрмера / следующий шаг">
          <input type="date" data-oos-due value="${escapeHtml(dueValue)}">
          <div class="actions" style="justify-content:flex-start">
            <button class="quick-chip" type="button" data-oos-save="${escapeHtml(row.issueKey)}">Сохранить</button>
            ${task ? `<button class="quick-chip" type="button" data-open-task="${escapeHtml(task.id)}">Открыть</button>` : ''}
          </div>
        </div>
      </td>
    </tr>
  `;
}

function oosControlExportColumns() {
  return [
    ['data_date', 'Дата среза'],
    ['generated_at', 'Сборка данных'],
    ['issue_key', 'OOS key'],
    ['article', 'Артикул'],
    ['article_key', 'SKU'],
    ['name', 'Название'],
    ['platform', 'Площадка'],
    ['warehouse', 'Склад'],
    ['signal', 'Сигнал'],
    ['lifecycle', 'Состояние'],
    ['in_stock', 'Остаток'],
    ['in_transit', 'Транзит'],
    ['in_request', 'Заявка'],
    ['turnover_days', 'Покрытие, дней'],
    ['avg_daily', 'Средние продажи/день'],
    ['revenue_at_risk_day', 'Риск выручки/день'],
    ['lost_revenue_day', 'Потеря OOS/день'],
    ['owner', 'Owner'],
    ['department', 'Отдел'],
    ['task_status', 'Статус задачи'],
    ['task_priority', 'Приоритет задачи'],
    ['comment_reason', 'Комментарий / причина'],
    ['next_action', 'Контрмера / следующий шаг'],
    ['due', 'Срок'],
    ['task_id', 'ID задачи'],
    ['task_created_at', 'Создано/обновлено'],
    ['recommendation', 'Рекомендация из OOS']
  ];
}

function oosControlExportRows(rows = oosControlFilteredRows()) {
  const payload = oosControlPayload();
  const summary = payload.summary || {};
  const dataDate = summary.dataDate || payload.dataFreshness?.dataDate || '';
  return (rows || []).map((row) => {
    const task = oosControlTaskFor(row);
    return {
      data_date: dataDate,
      generated_at: payload.generatedAt || '',
      issue_key: row.issueKey || '',
      article: row.article || row.articleKey || '',
      article_key: row.articleKey || '',
      name: row.name || '',
      platform: row.platformLabel || row.platform || '',
      warehouse: row.place || '',
      signal: row.statusLabel || row.status || '',
      lifecycle: row.lifecycleLabel || '',
      in_stock: row.inStock ?? '',
      in_transit: row.inTransit ?? '',
      in_request: row.inRequest ?? '',
      turnover_days: row.turnoverDays ?? '',
      avg_daily: row.avgDaily ?? '',
      revenue_at_risk_day: Math.round(Number(row.revenueAtRiskDay || 0)),
      lost_revenue_day: Math.round(Number(row.lostRevenueDay || 0)),
      owner: row.owner || '',
      department: row.department || '',
      task_status: task ? oosControlTaskStatusLabel(task) : '',
      task_priority: task ? (PRIORITY_META[task.priority]?.label || task.priority || '') : '',
      comment_reason: task?.reason || '',
      next_action: task?.nextAction || '',
      due: task?.due || '',
      task_id: task?.id || row.taskId || '',
      task_created_at: task?.updatedAt || task?.createdAt || '',
      recommendation: row.recommendation || ''
    };
  });
}

function downloadOosControlExcel(rows = oosControlFilteredRows()) {
  const exportRows = oosControlExportRows(rows);
  if (!exportRows.length) {
    window.alert('По текущим фильтрам нет строк OOS для выгрузки.');
    return;
  }
  const dateKey = todayIso();
  if (typeof downloadLaunchesHtmlTable === 'function') {
    downloadLaunchesHtmlTable(oosControlExportColumns(), exportRows, `oos-control-comments-${dateKey}.xls`);
    return;
  }
  skuPlanFactDownloadJson(`oos-control-comments-${dateKey}.json`, exportRows);
}

async function oosControlSaveTask(issueKey, rootId) {
  const row = oosControlRows().find((item) => item.issueKey === issueKey);
  if (!row) return null;
  const form = document.querySelector(`[data-oos-task-form="${CSS.escape(issueKey)}"]`);
  const department = String(form?.querySelector('[data-oos-department]')?.value || row.department || 'Закуп').trim();
  const reasonInput = String(form?.querySelector('[data-oos-reason]')?.value || '').trim();
  const actionInput = String(form?.querySelector('[data-oos-action]')?.value || row.recommendation || '').trim();
  const statusInput = String(form?.querySelector('[data-oos-status]')?.value || 'new').trim();
  const dueInput = String(form?.querySelector('[data-oos-due]')?.value || oosControlDue(row)).trim();
  if (statusInput === 'done' && (!reasonInput || !actionInput)) {
    window.alert('Чтобы закрыть OOS, заполни причину отдела и контрмеру.');
    return null;
  }
  const existing = oosControlTaskFor(row);
  const now = new Date().toISOString();
  const stableIssueKey = oosControlStableIssueKey(row);
  const reason = [
    `OOS сигнал: ${row.statusLabel || row.status}`,
    `Отдел: ${department}`,
    reasonInput ? `Причина: ${reasonInput}` : '',
    `SKU/склад: ${row.platformLabel || row.platform} / ${row.place}`,
    `Остаток ${fmt.int(row.inStock)}, покрытие ${row.turnoverDays === null || row.turnoverDays === undefined ? '—' : fmt.num(row.turnoverDays, 1)} дн., риск ${fmt.money(row.revenueAtRiskDay || 0)}/день`,
    stableIssueKey ? `[oos-stable:${stableIssueKey}]` : '',
    `[oos:${row.issueKey}]`
  ].filter(Boolean).join('. ');
  const task = normalizeTask({
    id: existing?.id || oosControlTaskId(row) || row.taskId || uid('task-oos'),
    source: 'auto',
    autoCode: 'oos_control',
    articleKey: row.articleKey || row.article || '',
    entityLabel: `${row.platformLabel || row.platform} / ${row.place} / ${row.name || row.article}`,
    title: `${row.status === 'oos' ? 'OOS' : 'Риск OOS'}: ${row.platformLabel || row.platform} · ${row.article || row.articleKey}`,
    type: 'supply',
    priority: oosControlPriority(row),
    platform: row.platform || 'cross',
    owner: row.owner === 'Без owner' ? '' : row.owner,
    due: dueInput,
    status: statusInput,
    nextAction: actionInput,
    reason,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }, 'auto');
  task.oosIssueKey = stableIssueKey;
  task.oosSignalIssueKey = String(row.issueKey || '').trim();
  task.autoCode = 'oos_control';
  state.storage = state.storage || {};
  state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
  const index = state.storage.tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) state.storage.tasks.splice(index, 1, task);
  else state.storage.tasks.unshift(task);
  if (typeof saveLocalStorage === 'function') saveLocalStorage();
  let remoteReady = false;
  try {
    remoteReady = await oosControlEnsureRemoteReady();
  } catch (error) {
    console.error(error);
    remoteReady = false;
  }
  try {
    if (remoteReady && typeof persistTask === 'function') await persistTask(task);
    if (typeof createTaskHistoryEntry === 'function') {
      await createTaskHistoryEntry(task.id, existing ? 'updated' : 'created', existing ? 'OOS-контрмера обновлена.' : 'Задача создана из OOS контроля.');
    }
    if (!remoteReady && typeof setAppError === 'function') {
      setAppError('OOS-задача сохранена локально. Командная база не подключилась, поэтому коллеги увидят ее после синхронизации JSON или восстановления Supabase.');
    }
  } catch (error) {
    console.error(error);
    if (typeof setAppError === 'function') setAppError(`OOS задача сохранена локально, но Supabase не ответил: ${error.message}`);
  }
  renderOosControl(rootId);
  if (!remoteReady) return task;
  if (typeof setAppError === 'function') setAppError(`OOS задача сохранена: ${task.title}`);
  return task;
}

function oosControlRiskAmount(row = {}) {
  return numberOrZero(row.revenueAtRiskDay || 0) + numberOrZero(row.lostRevenueDay || 0);
}

function oosControlPlaceCount(row = {}) {
  if (Array.isArray(row.placesAtRisk) && row.placesAtRisk.length) return row.placesAtRisk.length;
  return numberOrZero(row.clusterCount || 0) || (row.place ? 1 : 0);
}

function oosControlBarPercent(value, maxValue, minWhenPositive = 4) {
  const valueNumber = Math.max(0, numberOrZero(value));
  const maxNumber = Math.max(0, numberOrZero(maxValue));
  if (!valueNumber || !maxNumber) return 0;
  return Math.max(minWhenPositive, Math.min(100, (valueNumber / maxNumber) * 100));
}

function oosControlSummarizeRows(rows = [], fallback = {}) {
  const ownerSet = new Set();
  const skuSet = new Set();
  const summary = {
    totalIssues: rows.length,
    oosCount: 0,
    criticalCount: 0,
    riskCount: 0,
    oosSoonCount: 0,
    watchCount: 0,
    lostRevenueDay: 0,
    revenueAtRiskDay: 0,
    owners: 0,
    skuCount: 0,
    placeCount: 0,
    newIssues: fallback.newIssues || 0,
    resolvedToday: fallback.resolvedToday || 0,
    dataStatus: fallback.dataStatus || '',
    dataDate: fallback.dataDate || '',
    expectedFactDate: fallback.expectedFactDate || '',
    monthKey: fallback.monthKey || ''
  };
  rows.forEach((row) => {
    const status = String(row.status || '').toLowerCase();
    if (status === 'oos') summary.oosCount += 1;
    if (status === 'critical') summary.criticalCount += 1;
    if (status === 'risk') {
      summary.riskCount += 1;
      summary.oosSoonCount += 1;
    }
    if (status === 'watch') summary.watchCount += 1;
    summary.lostRevenueDay += numberOrZero(row.lostRevenueDay || 0);
    summary.revenueAtRiskDay += numberOrZero(row.revenueAtRiskDay || 0);
    summary.placeCount += oosControlPlaceCount(row);
    const owner = skuPlanFactCanonicalOwner(row.owner || '');
    if (owner && owner !== 'Без owner') ownerSet.add(owner);
    const skuKey = String(row.articleKey || row.article || '').trim();
    if (skuKey) skuSet.add(skuKey);
  });
  summary.owners = ownerSet.size;
  summary.skuCount = skuSet.size;
  return summary;
}

function oosControlGroupBy(rows = [], keyFn, labelFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = String(keyFn(row) || '').trim();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: String(labelFn(row) || key),
        total: 0,
        placeCount: 0,
        lostRevenueDay: 0,
        revenueAtRiskDay: 0,
        riskAmount: 0
      });
    }
    const item = map.get(key);
    item.total += 1;
    item.placeCount += oosControlPlaceCount(row);
    item.lostRevenueDay += numberOrZero(row.lostRevenueDay || 0);
    item.revenueAtRiskDay += numberOrZero(row.revenueAtRiskDay || 0);
    item.riskAmount += oosControlRiskAmount(row);
  });
  return [...map.values()].sort((left, right) => right.riskAmount - left.riskAmount);
}

function oosControlTopPlaces(rows = [], limit = 8) {
  const places = [];
  rows.forEach((row) => {
    const rowPlaces = Array.isArray(row.placesAtRisk) && row.placesAtRisk.length
      ? row.placesAtRisk
      : [{
          place: row.place,
          inStock: row.inStock,
          avgDaily: row.avgDaily,
          turnoverDays: row.turnoverDays,
          revenueAtRiskDay: row.revenueAtRiskDay,
          lostRevenueDay: row.lostRevenueDay
        }];
    rowPlaces.forEach((place) => {
      places.push({
        place: place.place || row.place || 'Склад',
        platform: row.platform || '',
        platformLabel: row.platformLabel || row.platform || '',
        article: row.article || row.articleKey || '',
        owner: row.owner || '',
        inStock: numberOrZero(place.inStock ?? row.inStock),
        avgDaily: numberOrZero(place.avgDaily ?? row.avgDaily),
        turnoverDays: place.turnoverDays ?? row.turnoverDays,
        revenueAtRiskDay: numberOrZero(place.revenueAtRiskDay ?? row.revenueAtRiskDay),
        lostRevenueDay: numberOrZero(place.lostRevenueDay ?? row.lostRevenueDay)
      });
    });
  });
  return places
    .map((place) => ({ ...place, riskAmount: place.revenueAtRiskDay + place.lostRevenueDay }))
    .sort((left, right) => right.riskAmount - left.riskAmount)
    .slice(0, limit);
}

function oosControlSignalSlug(value = '') {
  const source = String(value || '').trim().toLowerCase();
  const safe = source.replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
  return safe || 'cluster';
}

function oosControlParseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const source = String(value).trim();
  const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const ru = source.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
  if (ru) {
    const now = new Date();
    return new Date(Number(ru[3] || now.getFullYear()), Number(ru[2]) - 1, Number(ru[1]));
  }
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function oosControlAddDays(date, days = 0) {
  const base = oosControlParseDate(date) || new Date();
  return new Date(base.getTime() + numberOrZero(days) * 24 * 60 * 60 * 1000);
}

function oosControlDiffDays(later, earlier) {
  const end = oosControlParseDate(later);
  const start = oosControlParseDate(earlier);
  if (!end || !start) return 0;
  return (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
}

function oosControlFormatDate(value, fallback = '—') {
  const date = oosControlParseDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function oosControlSignalAsOfDate(payload = {}) {
  return oosControlParseDate(
    payload.dataFreshness?.dataDate
    || payload.summary?.dataDate
    || payload.summary?.date
    || payload.generatedAt
  ) || new Date();
}

function oosControlInboundDate(row = {}, place = {}) {
  const candidates = [
    place.inboundEta,
    place.inboundDate,
    place.nextSupplyDate,
    place.deliveryDate,
    place.supplyDate,
    row.inboundEta,
    row.inboundDate,
    row.nextSupplyDate,
    row.deliveryDate,
    row.supplyDate
  ];
  for (const candidate of candidates) {
    const date = oosControlParseDate(candidate);
    if (date) return { date, confirmed: true };
  }
  return { date: null, confirmed: false };
}

function oosControlPlatformMeta(platform = 'all') {
  return OOS_CONTROL_PLATFORM_META[oosControlNormalizePlatform(platform)] || OOS_CONTROL_PLATFORM_META.all;
}

function oosControlSignalTone(signal = {}) {
  if (signal.alreadyOos || numberOrZero(signal.daysToOos) < 5) return 'critical';
  if (numberOrZero(signal.daysToOos) < 10 || numberOrZero(signal.oosGapDays) > 0) return 'high';
  return 'watch';
}

function oosControlSignalToneLabel(tone = '') {
  if (tone === 'critical') return 'критично';
  if (tone === 'high') return 'высокий риск';
  return 'под наблюдением';
}

function oosControlSignalFromPlace(row = {}, place = {}, index = 0, payload = {}) {
  const platform = oosControlNormalizePlatform(row.platform || 'all');
  const platformMeta = oosControlPlatformMeta(platform);
  const articleKey = String(row.articleKey || row.article || '').trim() || 'sku';
  const clusterName = String(place.place || row.place || 'Кластер').trim();
  const stockUnits = numberOrZero(place.inStock ?? row.inStock);
  const avgDailyUnits = numberOrZero(place.avgDaily ?? row.avgDaily);
  const explicitDays = oosControlFiniteOrNull(place.turnoverDays ?? row.turnoverDays);
  const daysToOos = explicitDays !== null
    ? explicitDays
    : avgDailyUnits > 0
      ? stockUnits / avgDailyUnits
      : stockUnits <= 0
        ? 0
        : null;
  const avgDailyTurnover = numberOrZero(place.revenueAtRiskDay ?? row.revenueAtRiskDay)
    || numberOrZero(place.lostRevenueDay ?? row.lostRevenueDay)
    || avgDailyUnits * numberOrZero(row.averagePrice || 0);
  const asOfDate = oosControlSignalAsOfDate(payload);
  const forecastDate = daysToOos === null ? null : oosControlAddDays(asOfDate, daysToOos);
  const inbound = oosControlInboundDate(row, place);
  const effectiveInboundDate = inbound.date || oosControlAddDays(asOfDate, OOS_CONTROL_RISK_HORIZON_DAYS);
  const oosGapDays = forecastDate ? Math.max(0, oosControlDiffDays(effectiveInboundDate, forecastDate)) : 0;
  const projectedLostTurnover = Math.max(0, oosGapDays * avgDailyTurnover);
  const alreadyOos = String(row.status || '').toLowerCase() === 'oos' || stockUnits <= 0;
  const isRisk = alreadyOos
    || (daysToOos !== null && daysToOos < 10)
    || oosGapDays > 0
    || (!inbound.confirmed && daysToOos !== null && daysToOos < OOS_CONTROL_RISK_HORIZON_DAYS);
  if (!isRisk) return null;
  const recommendedReplenishment = Math.max(
    0,
    Math.ceil(avgDailyUnits * OOS_CONTROL_RISK_HORIZON_DAYS - stockUnits - numberOrZero(place.inTransit ?? row.inTransit) - numberOrZero(place.inRequest ?? row.inRequest))
  );
  const signal = {
    key: `${platform}|${oosControlSignalSlug(clusterName)}|${oosControlSignalSlug(articleKey)}|${index}`,
    row,
    platform,
    platformLabel: row.platformLabel || platformMeta.shortLabel,
    platformLongLabel: platformMeta.label,
    platformColor: platformMeta.color,
    skuId: articleKey,
    skuName: row.name || row.article || articleKey,
    clusterId: oosControlSignalSlug(clusterName),
    clusterName,
    stockUnits,
    avgDailyUnits,
    avgDailyTurnover,
    daysToOos,
    forecastDate,
    inboundDate: inbound.date,
    inboundConfirmed: inbound.confirmed,
    effectiveInboundDate,
    oosGapDays,
    projectedLostTurnover,
    recommendedReplenishment,
    nextAction: row.recommendation || 'Подтвердить поставку, перемещение или лимит продаж.',
    owner: row.owner || 'Без owner',
    department: row.department || '',
    status: row.status || 'risk',
    statusLabel: row.statusLabel || row.status || 'OOS риск',
    alreadyOos
  };
  signal.tone = oosControlSignalTone(signal);
  return signal;
}

function oosControlVisibleSignals(rows = oosControlFilteredRows(), payload = oosControlPayload()) {
  const signals = [];
  const filters = oosControlFilters();
  const clusterFilter = String(filters.cluster || 'all').trim();
  const maxDays = filters.days === 'oos'
    ? 0
    : filters.days === 'under5'
      ? 5
      : filters.days === 'under10'
        ? 10
        : filters.days === 'under14'
          ? 14
          : null;
  rows.forEach((row) => {
    const places = Array.isArray(row.placesAtRisk) && row.placesAtRisk.length
      ? row.placesAtRisk
      : [{
          place: row.place,
          inStock: row.inStock,
          inTransit: row.inTransit,
          inRequest: row.inRequest,
          avgDaily: row.avgDaily,
          turnoverDays: row.turnoverDays,
          revenueAtRiskDay: row.revenueAtRiskDay,
          lostRevenueDay: row.lostRevenueDay
        }];
    places.forEach((place, placeIndex) => {
      const signal = oosControlSignalFromPlace(row, place, placeIndex, payload);
      if (!signal) return;
      if (clusterFilter !== 'all' && signal.clusterName !== clusterFilter) return;
      if (maxDays !== null) {
        const days = numberOrZero(signal.daysToOos);
        if (filters.days === 'oos') {
          if (days > 0 || signal.status !== 'oos') return;
        } else if (!days || days >= maxDays) {
          return;
        }
      }
      if (signal) signals.push(signal);
    });
  });
  return signals.sort((left, right) => (
    numberOrZero(right.projectedLostTurnover) - numberOrZero(left.projectedLostTurnover)
    || numberOrZero(left.daysToOos ?? 999) - numberOrZero(right.daysToOos ?? 999)
    || String(left.clusterName).localeCompare(String(right.clusterName), 'ru')
  ));
}

function oosControlSignalSummary(signals = []) {
  const skuSet = new Set();
  const platformSet = new Set();
  let projectedLostTurnover = 0;
  let avgDailyTurnover = 0;
  let unconfirmedInbound = 0;
  let critical = 0;
  signals.forEach((signal) => {
    projectedLostTurnover += numberOrZero(signal.projectedLostTurnover);
    avgDailyTurnover += numberOrZero(signal.avgDailyTurnover);
    if (signal.skuId) skuSet.add(signal.skuId);
    if (signal.platform) platformSet.add(signal.platform);
    if (!signal.inboundConfirmed) unconfirmedInbound += 1;
    if (signal.tone === 'critical') critical += 1;
  });
  const nearest = signals
    .filter((signal) => signal.daysToOos !== null && signal.daysToOos !== undefined)
    .sort((left, right) => numberOrZero(left.daysToOos) - numberOrZero(right.daysToOos))[0] || null;
  return {
    projectedLostTurnover,
    avgDailyTurnover,
    signalCount: signals.length,
    skuCount: skuSet.size,
    platformCount: platformSet.size,
    unconfirmedInbound,
    critical,
    nearest
  };
}

function renderOosControlCommand(signals = [], filters = oosControlFilters()) {
  const summary = oosControlSignalSummary(signals);
  const platformMeta = oosControlPlatformMeta(filters.platform);
  const nearestText = summary.nearest
    ? `${fmt.num(summary.nearest.daysToOos, 1)} д`
    : '—';
  const nearestMeta = summary.nearest
    ? `${summary.nearest.platformLabel} · ${summary.nearest.clusterName}`
    : 'сигналов нет';
  return `
    <section class="oos-command" style="--pc:${escapeHtml(platformMeta.color)}">
      <div>
        <span>Под угрозой оборота</span>
        <strong>${fmt.money(summary.projectedLostTurnover)}</strong>
        <small>сумма прогнозных потерь по видимым SKU × кластер</small>
      </div>
      <div>
        <span>Критические сигналы</span>
        <strong>${fmt.int(summary.signalCount)}</strong>
        <small>${fmt.int(summary.skuCount)} SKU · ${fmt.int(summary.platformCount)} площадок</small>
      </div>
      <div>
        <span>Ближайший OOS</span>
        <strong>${escapeHtml(nearestText)}</strong>
        <small>${escapeHtml(nearestMeta)}</small>
      </div>
      <div>
        <span>Фильтр шапки</span>
        <strong>${escapeHtml(platformMeta.shortLabel)}</strong>
        <small>${summary.unconfirmedInbound ? `${fmt.int(summary.unconfirmedInbound)} без подтвержденной поставки` : 'поставки подтверждены или риска нет'}</small>
      </div>
    </section>
  `;
}

function renderOosControlSignalFocus(signal) {
  if (!signal) {
    return `
      <div class="oos-empty">
        <strong>По выбранной площадке критических сигналов нет</strong>
        <span>Глобальный фильтр сети сохранен; выберите в шапке «Все», чтобы увидеть весь контур риска.</span>
      </div>
    `;
  }
  const daysText = signal.daysToOos === null || signal.daysToOos === undefined ? '—' : `${fmt.num(signal.daysToOos, 1)} д`;
  const forecastText = oosControlFormatDate(signal.forecastDate);
  const inboundText = signal.inboundConfirmed
    ? oosControlFormatDate(signal.inboundDate)
    : `не подтверждена, горизонт ${OOS_CONTROL_RISK_HORIZON_DAYS} д`;
  const gapText = `${fmt.num(signal.oosGapDays, signal.oosGapDays % 1 ? 1 : 0)} д`;
  return `
    <div class="oos-focus-copy" style="--pc:${escapeHtml(signal.platformColor)}">
      <div class="oos-focus-top">
        <span class="oos-platform"><i></i>${escapeHtml(signal.platformLongLabel)}</span>
        <span class="oos-severity ${escapeHtml(signal.tone)}">${escapeHtml(oosControlSignalToneLabel(signal.tone))}</span>
      </div>
      <div class="oos-focus-title">
        <div>
          <span>Позиция</span>
          <h2>${escapeHtml(signal.skuName)}</h2>
          <code>${escapeHtml(signal.skuId)}</code>
        </div>
        <div class="oos-focus-arrow">→</div>
        <div>
          <span>Кластер</span>
          <h3>${escapeHtml(signal.clusterName)}</h3>
          <small>здесь закончится раньше поставки</small>
        </div>
      </div>
      <div class="oos-sentence">
        Запас вылетит через <strong>${escapeHtml(daysText)}</strong> · прогноз OOS <strong>${escapeHtml(forecastText)}</strong> · поставка <strong>${escapeHtml(inboundText)}</strong>.
      </div>
      <div class="oos-focus-meta">
        <span>Остаток <b>${fmt.int(signal.stockUnits)} шт.</b></span>
        <span>Продажи <b>${fmt.num(signal.avgDailyUnits, 1)} шт./день</b></span>
        <span>Разрыв <b>${escapeHtml(gapText)} без товара</b></span>
        <span>Довезти <b>${fmt.int(signal.recommendedReplenishment)} шт.</b></span>
      </div>
    </div>
    <div class="oos-focus-loss" style="--pc:${escapeHtml(signal.platformColor)}">
      <span>Потеря оборота</span>
      <strong>${fmt.money(signal.projectedLostTurnover)}</strong>
      <small>${fmt.money(signal.avgDailyTurnover)} в день × ${escapeHtml(gapText)} OOS</small>
      <div class="oos-next-action">${escapeHtml(signal.nextAction)}</div>
    </div>
  `;
}

function renderOosControlSignalRow(signal, index = 0, selectedKey = '') {
  const isActive = signal.key === selectedKey;
  const daysText = signal.daysToOos === null || signal.daysToOos === undefined ? '—' : `${fmt.num(signal.daysToOos, 1)} д`;
  return `
    <button type="button" class="oos-signal ${isActive ? 'active' : ''}" data-oos-signal="${escapeHtml(signal.key)}" aria-selected="${isActive ? 'true' : 'false'}" style="--pc:${escapeHtml(signal.platformColor)}">
      <span class="oos-rank">${String(index + 1).padStart(2, '0')}</span>
      <span class="oos-product"><i></i><b>${escapeHtml(signal.skuName)}</b><small>${escapeHtml(signal.platformLabel)} · ${escapeHtml(signal.skuId)}</small></span>
      <span class="oos-cluster"><small>кластер</small><b>${escapeHtml(signal.clusterName)}</b></span>
      <span class="oos-when"><small>вылетит</small><b>${escapeHtml(daysText)}</b><em>${escapeHtml(oosControlFormatDate(signal.forecastDate))}</em></span>
      <span class="oos-row-loss"><small>потеря оборота</small><b>${fmt.money(signal.projectedLostTurnover)}</b></span>
      <span class="oos-row-arrow">↗</span>
    </button>
  `;
}

function renderOosControlSignalFilters(rows = [], signals = [], filters = oosControlFilters()) {
  const ownerOptions = oosControlOptions(oosControlUnique(rows, 'owner'), filters.owner, 'Все owner');
  const clusterOptions = oosControlOptions(oosControlUniquePlaces(rows), filters.cluster, 'Все кластеры');
  return `
    <div class="oos-signal-tools">
      <label>
        <span>Поиск по риску</span>
        <input data-oos-filter="search" value="${escapeHtml(filters.search)}" placeholder="SKU, товар, кластер, owner">
      </label>
      <label>
        <span>Кластер / склад</span>
        <select data-oos-filter="cluster">${clusterOptions}</select>
      </label>
      <label>
        <span>Сигнал</span>
        <select data-oos-filter="status">
          <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Все активные</option>
          <option value="oos" ${filters.status === 'oos' ? 'selected' : ''}>Только OOS</option>
          <option value="critical" ${filters.status === 'critical' ? 'selected' : ''}>Критично</option>
          <option value="risk" ${filters.status === 'risk' ? 'selected' : ''}>OOS скоро</option>
          <option value="watch" ${filters.status === 'watch' ? 'selected' : ''}>Наблюдать</option>
          <option value="has_task" ${filters.status === 'has_task' ? 'selected' : ''}>С задачей</option>
          <option value="no_task" ${filters.status === 'no_task' ? 'selected' : ''}>Без задачи</option>
        </select>
      </label>
      <label>
        <span>Горизонт</span>
        <select data-oos-filter="days">
          <option value="all" ${filters.days === 'all' ? 'selected' : ''}>Любой срок</option>
          <option value="oos" ${filters.days === 'oos' ? 'selected' : ''}>Уже OOS</option>
          <option value="under5" ${filters.days === 'under5' ? 'selected' : ''}>До 5 дней</option>
          <option value="under10" ${filters.days === 'under10' ? 'selected' : ''}>До 10 дней</option>
          <option value="under14" ${filters.days === 'under14' ? 'selected' : ''}>До 14 дней</option>
        </select>
      </label>
      <label>
        <span>Ответственный</span>
        <select data-oos-filter="owner">${ownerOptions}</select>
      </label>
      <button type="button" class="quick-chip" data-oos-reset-filters>Сбросить</button>
      <div class="oos-signal-tools__meta">
        ${badge(`${fmt.int(signals.length)} кластеров`, signals.length ? 'warn' : 'ok')}
        ${filters.cluster !== 'all' ? badge(filters.cluster, 'info') : ''}
        ${filters.days !== 'all' ? badge('срок отфильтрован', 'info') : ''}
      </div>
    </div>
  `;
}

function oosControlLocalizationHistory(payload = {}, rows = []) {
  const days = Array.isArray(payload.history?.days) ? [...payload.history.days] : [];
  const summary = payload.summary || {};
  const rowPlaceCount = rows.reduce((sum, row) => sum + oosControlPlaceCount(row), 0);
  const fallbackDenominator = Math.max(
    numberOrZero(summary.localizationDenominator || 0),
    numberOrZero(summary.placeCount || 0),
    rowPlaceCount,
    ...days.map((day) => numberOrZero(day.placeCount || day.totalPlaces || day.totalIssuePlaces || day.totalIssues || 0)),
    0
  );
  return days
    .filter((day) => day?.date)
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')))
    .slice(-21)
    .map((day) => {
      const denominator = Math.max(
        numberOrZero(day.localizationDenominator || 0),
        numberOrZero(day.placeCount || day.totalPlaces || day.totalIssuePlaces || 0),
        fallbackDenominator
      );
      const activeRisk = Math.max(0, numberOrZero(day.placeCountAtRisk || day.totalIssuePlaces || day.totalIssues || 0));
      const localizedPct = denominator > 0
        ? Math.max(0, Math.min(100, ((denominator - activeRisk) / denominator) * 100))
        : 0;
      return {
        date: String(day.date || ''),
        activeRisk,
        denominator,
        localizedPct,
        oosCount: numberOrZero(day.oosCount || 0),
        riskCount: numberOrZero(day.oosSoonCount || day.riskCount || 0),
        revenueAtRiskDay: numberOrZero(day.revenueAtRiskDay || 0)
      };
    });
}

function renderOosControlLocalizationTrend(payload = {}, rows = [], signals = []) {
  const points = oosControlLocalizationHistory(payload, rows);
  if (!points.length) {
    return `
      <section class="card oos-localization-card">
        <div class="section-subhead">
          <div>
            <h3>Локализация по дням</h3>
            <p class="small muted">История начнет строиться после ежедневных OOS-синхронизаций.</p>
          </div>
        </div>
      </section>
    `;
  }
  const latest = points[points.length - 1];
  const avgPct = points.reduce((sum, point) => sum + point.localizedPct, 0) / points.length;
  const minPoint = [...points].sort((left, right) => left.localizedPct - right.localizedPct)[0] || latest;
  return `
    <section class="card oos-localization-card">
      <div class="section-subhead">
        <div>
          <h3>Локализация по дням</h3>
          <p class="small muted">Доля складского контура без активного OOS/риска. Если дневной контур не сохранен, берется текущий контур OOS.</p>
        </div>
        <div class="badge-stack">
          ${badge(`сейчас ${fmt.num(latest.localizedPct, 1)}%`, latest.localizedPct >= 85 ? 'ok' : latest.localizedPct >= 70 ? 'warn' : 'danger')}
          ${badge(`${fmt.int(signals.length)} активных кластеров`, signals.length ? 'warn' : 'ok')}
        </div>
      </div>
      <div class="oos-localization-metrics">
        <span><b>${fmt.num(latest.localizedPct, 1)}%</b><em>последний день</em></span>
        <span><b>${fmt.num(avgPct, 1)}%</b><em>среднее за ${fmt.int(points.length)} дн.</em></span>
        <span><b>${fmt.num(minPoint.localizedPct, 1)}%</b><em>минимум ${escapeHtml(minPoint.date.slice(5))}</em></span>
        <span><b>${fmt.int(latest.denominator)}</b><em>контур SKU × склад</em></span>
      </div>
      <div class="oos-localization-chart" aria-label="Процент локализации по дням">
        ${points.map((point) => {
          const tone = point.localizedPct >= 85 ? 'ok' : point.localizedPct >= 70 ? 'warn' : 'danger';
          const title = `${point.date}: локализация ${fmt.num(point.localizedPct, 1)}%, активный риск ${fmt.int(point.activeRisk)} из ${fmt.int(point.denominator)}`;
          return `
            <span class="oos-localization-day ${tone}" style="--pct:${point.localizedPct}" title="${escapeHtml(title)}">
              <i></i>
              <b>${fmt.num(point.localizedPct, 0)}%</b>
              <small>${escapeHtml(point.date.slice(5))}</small>
            </span>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderOosControlSignalList(signals = [], selectedKey = '', rows = [], filters = oosControlFilters()) {
  return `
    <section class="card oos-risk-queue">
      <div class="section-subhead">
        <div>
          <h3>Где и сколько оборота потеряем</h3>
          <p class="small muted">Показываются только кластеры, где OOS наступит раньше пополнения или запас ниже 5 дней.</p>
        </div>
        ${badge(`${fmt.int(signals.length)} SKU × кластер`, signals.length ? 'warn' : 'ok')}
      </div>
      ${renderOosControlSignalFilters(rows, signals, filters)}
      <div class="oos-signal-list" role="listbox" aria-label="OOS сигналы по кластерам">
        ${signals.map((signal, index) => renderOosControlSignalRow(signal, index, selectedKey)).join('') || renderOosControlSignalFocus(null)}
      </div>
    </section>
  `;
}

function renderOosControlFormulaNote() {
  return `
    <section class="oos-formula">
      <span>Расчет</span>
      <code>потеря оборота = max(0, дата поставки − дата OOS) × средний дневной оборот SKU в кластере</code>
      <small>Данные считаются строго на уровне SKU × площадка × кластер. Общий остаток по сети не скрывает локальный OOS.</small>
    </section>
  `;
}

function renderOosControlFiltersV4(rows, filters) {
  const ownerOptions = oosControlOptions(oosControlUnique(rows, 'owner'), filters.owner, 'Все owner');
  const departmentOptions = oosControlOptions(oosControlUnique(rows, 'department'), filters.department, 'Все отделы');
  const clusterOptions = oosControlOptions(oosControlUniquePlaces(rows), filters.cluster, 'Все кластеры');
  return `
    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="grid sku-plan-fact-filters oos-v4-filters" style="grid-template-columns:1.3fr repeat(5,minmax(0,170px));gap:10px">
        <label><span class="label">Поиск</span><input data-oos-filter="search" value="${escapeHtml(filters.search)}" placeholder="SKU, кластер, owner, мера"></label>
        <label><span class="label">Сигнал</span>
          <select data-oos-filter="status">
            <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Все активные</option>
            <option value="oos" ${filters.status === 'oos' ? 'selected' : ''}>Только OOS</option>
            <option value="critical" ${filters.status === 'critical' ? 'selected' : ''}>Критично</option>
            <option value="risk" ${filters.status === 'risk' ? 'selected' : ''}>OOS скоро &lt;5 д</option>
            <option value="watch" ${filters.status === 'watch' ? 'selected' : ''}>Наблюдать</option>
            <option value="has_task" ${filters.status === 'has_task' ? 'selected' : ''}>С задачей</option>
            <option value="no_task" ${filters.status === 'no_task' ? 'selected' : ''}>Без задачи</option>
          </select>
        </label>
        <label><span class="label">Горизонт</span>
          <select data-oos-filter="days">
            <option value="all" ${filters.days === 'all' ? 'selected' : ''}>Любой срок</option>
            <option value="oos" ${filters.days === 'oos' ? 'selected' : ''}>Уже OOS</option>
            <option value="under5" ${filters.days === 'under5' ? 'selected' : ''}>До 5 дней</option>
            <option value="under10" ${filters.days === 'under10' ? 'selected' : ''}>До 10 дней</option>
            <option value="under14" ${filters.days === 'under14' ? 'selected' : ''}>До 14 дней</option>
          </select>
        </label>
        <label><span class="label">Кластер</span><select data-oos-filter="cluster">${clusterOptions}</select></label>
        <label><span class="label">Owner</span><select data-oos-filter="owner">${ownerOptions}</select></label>
        <label><span class="label">Отдел</span><select data-oos-filter="department">${departmentOptions}</select></label>
      </div>
    </div>
  `;
}

function oosControlFocusSignal(root, signalKey) {
  if (!root) return;
  const payload = oosControlPayload();
  const signals = oosControlVisibleSignals(oosControlFilteredRows(), payload);
  const signal = signals.find((item) => item.key === signalKey) || signals[0] || null;
  if (!signal) return;
  state.oosControlSelectedSignal = signal.key;
  root.querySelectorAll('[data-oos-signal]').forEach((button) => {
    const isActive = button.dataset.oosSignal === signal.key;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  const focus = root.querySelector('[data-oos-focus]');
  if (!focus) return;
  focus.innerHTML = renderOosControlSignalFocus(signal);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!reducedMotion) {
    focus.classList.remove('oos-focus-pulse');
    window.requestAnimationFrame?.(() => focus.classList.add('oos-focus-pulse'));
  }
}

function oosControlCoverageTone(days) {
  const value = numberOrZero(days);
  if (!value) return 'danger';
  if (value < 5) return 'danger';
  if (value < 10) return 'warn';
  return 'ok';
}

function renderOosControlBarRow(item = {}, maxValue = 0, options = {}) {
  const value = numberOrZero(item.value || 0);
  const percent = oosControlBarPercent(value, maxValue, options.minWhenPositive || 4);
  const tone = options.tone || item.tone || 'warn';
  return `
    <div class="oos-bar-row">
      <div class="oos-bar-row__head">
        <strong>${escapeHtml(item.label || '')}</strong>
        <span>${escapeHtml(item.valueLabel || fmt.money(value))}</span>
      </div>
      <div class="oos-bar-track"><i class="oos-bar-fill ${escapeHtml(tone)}" style="--oos-bar:${percent}%"></i></div>
      ${item.meta ? `<div class="muted small">${escapeHtml(item.meta)}</div>` : ''}
    </div>
  `;
}

function renderOosControlHero(payload = {}, rows = [], allRows = rows) {
  const fallback = payload.summary || {};
  const summary = oosControlSummarizeRows(rows, fallback);
  const allCount = Array.isArray(allRows) ? allRows.length : rows.length;
  const statusTone = summary.oosCount || summary.criticalCount ? 'danger' : summary.riskCount ? 'warn' : 'ok';
  const statusTitle = summary.oosCount || summary.criticalCount
    ? 'Есть OOS'
    : summary.riskCount
      ? 'Скоро закончится'
      : 'Запасы в порядке';
  const dataDate = summary.dataDate || payload.dataFreshness?.dataDate || '';
  const expectedDate = summary.expectedFactDate || payload.dataFreshness?.expectedFactDate || '';
  const staleText = summary.dataStatus === 'stale' && expectedDate
    ? `факт до ${dataDate || '—'}, нужен ${expectedDate}`
    : `факт до ${dataDate || '—'}`;
  return `
    <section class="oos-hero ${statusTone}">
      <div class="oos-hero__main">
        <span class="eyebrow">OOS контроль</span>
        <h2>${escapeHtml(statusTitle)}</h2>
        <p>Под риском ${fmt.money(summary.revenueAtRiskDay || 0)} в день: ${fmt.int(summary.totalIssues)} сигнал(а), ${fmt.int(summary.skuCount)} SKU, ${fmt.int(summary.placeCount)} складов.</p>
        <div class="badge-stack">
          ${badge(staleText, summary.dataStatus === 'ok' ? 'ok' : 'warn')}
          ${badge(`${fmt.int(rows.length)} из ${fmt.int(allCount)} строк`)}
          ${summary.owners ? badge(`${fmt.int(summary.owners)} owner`) : badge('owner не назначен', 'warn')}
        </div>
      </div>
      <div class="oos-hero__metrics">
        <div class="oos-hero-metric ${summary.oosCount ? 'danger' : 'ok'}">
          <span>OOS сейчас</span>
          <strong>${fmt.int(summary.oosCount || summary.criticalCount || 0)}</strong>
          <small>${fmt.money(summary.lostRevenueDay || 0)} / день</small>
        </div>
        <div class="oos-hero-metric warn">
          <span>Скоро OOS</span>
          <strong>${fmt.int(summary.oosSoonCount || summary.riskCount || 0)}</strong>
          <small>покрытие меньше 5 дней</small>
        </div>
        <div class="oos-hero-metric info">
          <span>Выручка под риском</span>
          <strong>${fmt.money(summary.revenueAtRiskDay || 0)}</strong>
          <small>по текущему темпу</small>
        </div>
      </div>
    </section>
  `;
}

function oosControlRowSignals(row = {}) {
  const status = String(row.status || '').toLowerCase();
  const days = numberOrZero(row.turnoverDays || 0);
  const need14 = numberOrZero(row.targetNeed14 || 0);
  const transit = numberOrZero(row.inTransit || 0) + numberOrZero(row.inRequest || 0);
  const places = oosControlPlaceCount(row);
  const task = oosControlTaskFor(row);
  const signals = [];
  const hasStockValue = row.inStock !== null && row.inStock !== undefined && String(row.inStock).trim() !== '';
  if (status === 'oos' || status === 'critical' || (hasStockValue && numberOrZero(row.inStock || 0) <= 0)) {
    signals.push({ key: 'zero-stock', label: 'нулевой или критичный остаток', tone: 'danger' });
  }
  if (days && days < 5) {
    signals.push({ key: 'coverage-5', label: 'покрытие меньше 5 дней', tone: 'danger' });
  }
  if (need14 > 0) {
    signals.push({ key: 'need-14', label: 'не хватает до 14 дней', tone: 'warn' });
  }
  if (need14 > 0 && transit <= 0) {
    signals.push({ key: 'no-supply-road', label: 'нет запаса в пути или заявке', tone: 'danger' });
  }
  if (places >= 10) {
    signals.push({ key: 'many-places', label: 'риск размазан по складам', tone: 'info' });
  }
  if (!task) {
    signals.push({ key: 'no-task', label: 'нет закрепленной контрмеры', tone: 'warn' });
  }
  return signals.length ? signals : [{ key: 'manual-check', label: 'нужна ручная проверка', tone: 'info' }];
}

function oosControlRowTriggerTags(row = {}) {
  const days = numberOrZero(row.turnoverDays || 0);
  const need14 = numberOrZero(row.targetNeed14 || 0);
  const transit = numberOrZero(row.inTransit || 0) + numberOrZero(row.inRequest || 0);
  const tags = [];
  oosControlRowSignals(row).slice(0, 3).forEach((signal) => tags.push(signal));
  if (days) tags.push({ label: `${fmt.num(days, 1)} д покрытия`, tone: oosControlCoverageTone(days) });
  if (need14 > 0) tags.push({ label: `+${fmt.int(need14)} шт до 14 д`, tone: 'warn' });
  if (need14 > 0 && transit <= 0) tags.push({ label: '0 в пути/заявке', tone: 'danger' });
  return tags.slice(0, 5);
}

function oosControlCauseGroups(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const riskAmount = oosControlRiskAmount(row);
    const days = numberOrZero(row.turnoverDays || 0);
    const placeCount = oosControlPlaceCount(row);
    const example = row.article || row.articleKey || row.platformLabel || row.platform || '';
    oosControlRowSignals(row).forEach((signal) => {
      if (!map.has(signal.key)) {
        map.set(signal.key, {
          key: signal.key,
          label: signal.label,
          tone: signal.tone || 'warn',
          total: 0,
          riskAmount: 0,
          placeCount: 0,
          minDays: null,
          examples: new Set()
        });
      }
      const group = map.get(signal.key);
      group.total += 1;
      group.riskAmount += riskAmount;
      group.placeCount += placeCount;
      if (days > 0) group.minDays = group.minDays === null ? days : Math.min(group.minDays, days);
      if (example) group.examples.add(example);
    });
  });
  return [...map.values()]
    .map((group) => ({ ...group, examples: [...group.examples].slice(0, 3) }))
    .sort((left, right) => right.riskAmount - left.riskAmount || right.total - left.total);
}

function oosControlCriticalRows(rows = [], limit = 5) {
  const statusWeight = { oos: 4, critical: 4, risk: 3, watch: 1 };
  return [...rows]
    .sort((left, right) => {
      const leftStatus = statusWeight[String(left.status || '').toLowerCase()] || 0;
      const rightStatus = statusWeight[String(right.status || '').toLowerCase()] || 0;
      if (rightStatus !== leftStatus) return rightStatus - leftStatus;
      const riskDiff = oosControlRiskAmount(right) - oosControlRiskAmount(left);
      if (riskDiff) return riskDiff;
      return numberOrZero(left.turnoverDays || 0) - numberOrZero(right.turnoverDays || 0);
    })
    .slice(0, limit);
}

function renderOosControlPlaceRow(place = {}, index = 0) {
  const days = numberOrZero(place.turnoverDays || 0);
  return `
    <div class="oos-place-row">
      <span class="oos-place-rank">${index + 1}</span>
      <div>
        <strong>${escapeHtml(place.place || 'Склад')}</strong>
        <small>${escapeHtml(place.platformLabel || place.platform || '')} · ${escapeHtml(place.article || '')} · ${days ? `${fmt.num(days, 1)} д` : 'покрытие не задано'}</small>
      </div>
      <b>${fmt.money(place.riskAmount || 0)}</b>
    </div>
  `;
}

function renderOosControlCriticalRow(row = {}, index = 0) {
  const days = numberOrZero(row.turnoverDays || 0);
  const need14 = numberOrZero(row.targetNeed14 || 0);
  const tone = oosControlCoverageTone(days);
  const placeCount = oosControlPlaceCount(row);
  return `
    <div class="oos-critical-row ${tone}">
      <span class="oos-critical-rank">${index + 1}</span>
      <div class="oos-critical-main">
        <strong>${linkToSku(row.articleKey || row.article, row.article || row.articleKey || 'SKU')}</strong>
        <small>${escapeHtml(row.platformLabel || row.platform || '')} · ${escapeHtml(row.owner || 'Без owner')} · ${fmt.int(placeCount)} складов</small>
        <div class="oos-trigger-tags">
          ${oosControlRowTriggerTags(row).map((tag) => `<span class="oos-trigger-tag ${escapeHtml(tag.tone || '')}">${escapeHtml(tag.label)}</span>`).join('')}
        </div>
      </div>
      <div class="oos-critical-metrics">
        <b>${fmt.money(oosControlRiskAmount(row))}</b>
        <span>${days ? `${fmt.num(days, 1)} д` : '0 д'} · ${need14 > 0 ? `+${fmt.int(need14)} шт` : 'проверить поставку'}</span>
      </div>
    </div>
  `;
}

function renderOosControlCauseRow(group = {}, maxRisk = 1) {
  const percent = oosControlBarPercent(group.riskAmount || 0, maxRisk, 6);
  const details = [
    `${fmt.int(group.total || 0)} сигнал(а)`,
    `${fmt.int(group.placeCount || 0)} складов`,
    group.minDays ? `минимум ${fmt.num(group.minDays, 1)} д` : '',
    group.examples?.length ? `SKU: ${group.examples.join(', ')}` : ''
  ].filter(Boolean).join(' · ');
  return `
    <div class="oos-cause-row ${escapeHtml(group.tone || '')}">
      <div class="oos-cause-row__head">
        <strong>${escapeHtml(group.label || 'Причина')}</strong>
        <span>${fmt.money(group.riskAmount || 0)}</span>
      </div>
      <div class="oos-bar-track"><i class="oos-bar-fill ${escapeHtml(group.tone || 'warn')}" style="--oos-bar:${percent}%"></i></div>
      <small>${escapeHtml(details)}</small>
    </div>
  `;
}

function oosControlSalesMomentum(row = {}) {
  const sales7 = numberOrZero(row.sales7 || 0);
  const sales14 = numberOrZero(row.sales14 || 0);
  const sales28 = numberOrZero(row.sales28 || 0);
  const currentDaily = sales7 > 0 ? sales7 / 7 : numberOrZero(row.avgDaily || 0);
  const prev7Raw = Math.max(0, sales14 - sales7);
  const prev21Raw = Math.max(0, sales28 - sales7);
  const baselineDaily = prev7Raw > 0
    ? prev7Raw / 7
    : prev21Raw > 0
      ? prev21Raw / 21
      : numberOrZero(row.avgDaily || 0);
  const changePct = baselineDaily > 0
    ? ((currentDaily - baselineDaily) / baselineDaily) * 100
    : 0;
  const tone = changePct >= 25 ? 'ok' : changePct <= -25 ? 'danger' : 'info';
  const sign = changePct > 0 ? '+' : '';
  return {
    currentDaily,
    baselineDaily,
    changePct,
    absChangePct: Math.abs(changePct),
    label: `${sign}${fmt.num(changePct, 0)}%`,
    tone
  };
}

function oosControlPulseModel(rows = []) {
  const withMomentum = rows.map((row) => ({ row, momentum: oosControlSalesMomentum(row) }));
  const isOosRow = (row) => {
    const status = String(row.status || '').toLowerCase();
    const hasStockValue = row.inStock !== null && row.inStock !== undefined && String(row.inStock).trim() !== '';
    return status === 'oos' || status === 'critical' || (hasStockValue && numberOrZero(row.inStock || 0) <= 0);
  };
  const isRiskRow = (row) => {
    const status = String(row.status || '').toLowerCase();
    const days = numberOrZero(row.turnoverDays || 0);
    return !isOosRow(row) && (status === 'risk' || status === 'watch' || (days > 0 && days < 10));
  };
  const byRisk = (left, right) => oosControlRiskAmount(right) - oosControlRiskAmount(left)
    || numberOrZero(left.turnoverDays || 0) - numberOrZero(right.turnoverDays || 0);
  return {
    oosRows: rows.filter(isOosRow).sort(byRisk),
    riskRows: rows.filter(isRiskRow).sort(byRisk),
    growthRows: withMomentum
      .filter((item) => item.momentum.changePct >= 25)
      .sort((left, right) => right.momentum.changePct - left.momentum.changePct || oosControlRiskAmount(right.row) - oosControlRiskAmount(left.row)),
    slowRows: withMomentum
      .filter((item) => item.momentum.changePct <= -25)
      .sort((left, right) => left.momentum.changePct - right.momentum.changePct || oosControlRiskAmount(right.row) - oosControlRiskAmount(left.row))
  };
}

function renderOosPulseRow(item = {}, mode = 'risk') {
  const row = item.row || item;
  const momentum = item.momentum || oosControlSalesMomentum(row);
  const days = numberOrZero(row.turnoverDays || 0);
  const need14 = numberOrZero(row.targetNeed14 || 0);
  const places = oosControlPlaceCount(row);
  const riskAmount = oosControlRiskAmount(row);
  const coverageTone = oosControlCoverageTone(days);
  const progress = mode === 'growth' || mode === 'slow'
    ? Math.min(100, Math.max(8, momentum.absChangePct))
    : oosControlBarPercent(days, 10, riskAmount ? 8 : 0);
  const tone = mode === 'growth'
    ? 'ok'
    : mode === 'slow'
      ? 'danger'
      : mode === 'oos'
        ? 'danger'
        : coverageTone;
  const value = mode === 'growth' || mode === 'slow'
    ? momentum.label
    : mode === 'oos'
      ? fmt.money(row.lostRevenueDay || riskAmount || 0)
      : `${days ? fmt.num(days, 1) : '0'} д`;
  const detail = mode === 'growth' || mode === 'slow'
    ? `${fmt.num(momentum.currentDaily, 1)} шт/день сейчас · было ${fmt.num(momentum.baselineDaily, 1)}`
    : need14 > 0
      ? `нужно +${fmt.int(need14)} шт до 14 д`
      : `${fmt.money(riskAmount)} / день`;
  return `
    <div class="oos-pulse-row ${tone}">
      <div class="oos-pulse-row__head">
        <div>
          <strong>${linkToSku(row.articleKey || row.article, row.article || row.articleKey || 'SKU')}</strong>
          <small>${escapeHtml(row.platformLabel || row.platform || '')} · ${escapeHtml(row.owner || 'Без owner')} · ${fmt.int(places)} складов</small>
        </div>
        <b>${escapeHtml(value)}</b>
      </div>
      <div class="oos-pulse-track"><i class="${tone}" style="--oos-bar:${progress}%"></i></div>
      <div class="oos-pulse-row__foot">
        <span>${escapeHtml(detail)}</span>
        <span>${escapeHtml(row.statusLabel || row.status || 'контроль')}</span>
      </div>
      <div class="oos-trigger-tags">
        ${oosControlRowTriggerTags(row).slice(0, 3).map((tag) => `<span class="oos-trigger-tag ${escapeHtml(tag.tone || '')}">${escapeHtml(tag.label)}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderOosPulseCard(config = {}) {
  const rows = Array.isArray(config.rows) ? config.rows.slice(0, config.limit || 4) : [];
  const totalRisk = (config.rawRows || rows).reduce((sum, item) => sum + oosControlRiskAmount(item.row || item), 0);
  return `
    <article class="oos-pulse-card ${escapeHtml(config.tone || '')}">
      <div class="oos-pulse-card__top">
        <div>
          <span>${escapeHtml(config.kicker || 'контроль')}</span>
          <h3>${escapeHtml(config.title || '')}</h3>
        </div>
        <strong>${fmt.int(config.count ?? rows.length)}</strong>
      </div>
      <div class="oos-pulse-card__meta">
        <span>${escapeHtml(config.subtitle || '')}</span>
        <b>${fmt.money(totalRisk)} / день</b>
      </div>
      <div class="oos-pulse-list">
        ${rows.map((row) => renderOosPulseRow(row, config.mode)).join('') || `<div class="oos-pulse-empty">${escapeHtml(config.empty || 'Нет позиций')}</div>`}
      </div>
    </article>
  `;
}

function oosControlFiniteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function oosControlSkuRiskGroups(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const article = String(row.articleKey || row.article || '').trim();
    if (!article) return;
    if (!map.has(article)) {
      map.set(article, {
        article,
        label: row.article || row.articleKey || article,
        riskAmount: 0,
        placeCount: 0,
        minDays: null,
        platforms: new Set(),
        owners: new Set(),
        oosCount: 0,
        riskCount: 0,
        watchCount: 0,
        targetNeed14: 0,
        targetNeed28: 0,
        inStock: 0,
        inTransit: 0,
        inRequest: 0,
        avgDaily: 0,
        clusters: []
      });
    }
    const item = map.get(article);
    const days = numberOrZero(row.turnoverDays || 0);
    item.riskAmount += oosControlRiskAmount(row);
    item.placeCount += oosControlPlaceCount(row);
    if (days > 0) item.minDays = item.minDays === null ? days : Math.min(item.minDays, days);
    if (row.platformLabel || row.platform) item.platforms.add(row.platformLabel || row.platform);
    if (row.owner) item.owners.add(row.owner);
    if (row.status === 'oos' || row.status === 'critical') item.oosCount += 1;
    else if (row.status === 'risk') item.riskCount += 1;
    else item.watchCount += 1;
    item.inStock += numberOrZero(row.inStock || 0);
    item.inTransit += numberOrZero(row.inTransit || 0);
    item.inRequest += numberOrZero(row.inRequest || 0);
    item.avgDaily += numberOrZero(row.avgDaily || 0);
    item.targetNeed14 += numberOrZero(row.targetNeed14 || 0);
    item.targetNeed28 += numberOrZero(row.targetNeed28 || 0);
    const rowPlaces = Array.isArray(row.placesAtRisk) && row.placesAtRisk.length
      ? row.placesAtRisk
      : [{
          place: row.place,
          inStock: row.inStock,
          inTransit: row.inTransit,
          inRequest: row.inRequest,
          avgDaily: row.avgDaily,
          turnoverDays: row.turnoverDays,
          revenueAtRiskDay: row.revenueAtRiskDay,
          lostRevenueDay: row.lostRevenueDay
    }];
    rowPlaces.forEach((place) => {
      const placeDays = oosControlFiniteOrNull(place.turnoverDays ?? row.turnoverDays);
      item.clusters.push({
        place: place.place || row.place || 'Склад',
        platform: row.platform || '',
        platformLabel: row.platformLabel || row.platform || '',
        status: row.status || '',
        inStock: numberOrZero(place.inStock ?? row.inStock),
        inTransit: numberOrZero(place.inTransit ?? row.inTransit),
        inRequest: numberOrZero(place.inRequest ?? row.inRequest),
        avgDaily: numberOrZero(place.avgDaily ?? row.avgDaily),
        turnoverDays: placeDays,
        revenueAtRiskDay: numberOrZero(place.revenueAtRiskDay ?? row.revenueAtRiskDay),
        lostRevenueDay: numberOrZero(place.lostRevenueDay ?? row.lostRevenueDay)
      });
    });
  });
  return [...map.values()]
    .map((item) => ({
      ...item,
      platforms: [...item.platforms],
      owners: [...item.owners],
      clusters: item.clusters
        .map((cluster) => ({ ...cluster, riskAmount: numberOrZero(cluster.revenueAtRiskDay || 0) + numberOrZero(cluster.lostRevenueDay || 0) }))
        .sort((left, right) => right.riskAmount - left.riskAmount || numberOrZero(left.turnoverDays || 999) - numberOrZero(right.turnoverDays || 999))
    }))
    .sort((left, right) => right.riskAmount - left.riskAmount || numberOrZero(left.minDays || 999) - numberOrZero(right.minDays || 999));
}

function renderOosSkuClusterRow(cluster = {}) {
  const days = oosControlFiniteOrNull(cluster.turnoverDays);
  const tone = oosControlCoverageTone(days);
  return `
    <div class="oos-cluster-row ${tone}">
      <div class="oos-cluster-row__place">
        <strong>${escapeHtml(cluster.place || 'Склад')}</strong>
        <small>${escapeHtml(cluster.platformLabel || cluster.platform || '')} · ${days ? `закончится через ${fmt.num(days, 1)} д` : 'срок не рассчитан'}</small>
      </div>
      <div class="oos-cluster-row__metric">
        <b>${fmt.int(cluster.inStock || 0)}</b>
        <span>остаток</span>
      </div>
      <div class="oos-cluster-row__metric">
        <b>${fmt.num(cluster.avgDaily || 0, 1)}</b>
        <span>шт/день</span>
      </div>
      <div class="oos-cluster-row__metric">
        <b>${fmt.money(cluster.riskAmount || 0)}</b>
        <span>${cluster.lostRevenueDay ? 'потери/день' : 'риск/день'}</span>
      </div>
    </div>
  `;
}

function renderOosSkuRiskShelf(rows = []) {
  const groups = oosControlSkuRiskGroups(rows);
  const maxRisk = Math.max(1, ...groups.map((item) => item.riskAmount));
  return `
    <section class="oos-sku-board">
      <div class="section-subhead">
        <div>
          <h3>Артикулы под контролем</h3>
          <p class="small muted">карточка показывает, когда закончится запас; клик раскрывает кластера, остатки и риск</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(groups.length)} SKU`, groups.length ? 'warn' : 'ok')}
          ${badge(`${fmt.int(rows.reduce((sum, row) => sum + oosControlPlaceCount(row), 0))} складов`)}
        </div>
      </div>
      <div class="oos-sku-board__grid">
        ${groups.map((item, index) => {
          const tone = item.oosCount ? 'danger' : item.riskCount ? 'warn' : 'info';
          const riskPercent = oosControlBarPercent(item.riskAmount, maxRisk, 8);
          const runwayPercent = oosControlBarPercent(item.minDays || 0, 28, item.minDays ? 6 : 0);
          const daysText = item.minDays ? `закончится через ${fmt.num(item.minDays, 1)} д` : 'срок не рассчитан';
          const platformText = item.platforms.slice(0, 3).join(' · ');
          const statusText = item.oosCount ? 'OOS' : item.riskCount ? 'риск <5 д' : 'контроль до 28 д';
          const visibleClusters = item.clusters.slice(0, 10);
          return `
            <details class="oos-sku-card ${tone}" ${index === 0 ? 'open' : ''}>
              <summary class="oos-sku-card__summary">
                <div class="oos-sku-card__head">
                  <div>
                    <span>${escapeHtml(statusText)} · ${escapeHtml(platformText || 'площадка')}</span>
                    <strong>${escapeHtml(item.label)}</strong>
                  </div>
                  ${badge(daysText, oosControlCoverageTone(item.minDays))}
                </div>
                <div class="oos-sku-card__metrics">
                  <span><b>${fmt.money(item.riskAmount)}</b><em>риск выручки/день</em></span>
                  <span><b>${fmt.int(item.placeCount)}</b><em>кластеров</em></span>
                  <span><b>${fmt.int(item.inStock)}</b><em>остаток</em></span>
                  <span><b>+${fmt.int(item.targetNeed28)}</b><em>нужно до 28 д</em></span>
                </div>
                <div class="oos-runway">
                  <div>
                    <span>когда закончится</span>
                    <b>${escapeHtml(daysText)}</b>
                  </div>
                  <i><b class="${tone}" style="--oos-bar:${runwayPercent}%"></b></i>
                </div>
                <div class="oos-sku-card__riskbar">
                  <span>вес риска среди артикулов</span>
                  <i><b class="${tone}" style="--oos-bar:${riskPercent}%"></b></i>
                </div>
              </summary>
              <div class="oos-sku-card__body">
                <div class="oos-sku-card__totals">
                  <span><b>${fmt.num(item.avgDaily, 1)}</b><em>шт/день</em></span>
                  <span><b>${fmt.int(item.inTransit)}</b><em>в пути</em></span>
                  <span><b>${fmt.int(item.inRequest)}</b><em>в заявке</em></span>
                  <span><b>+${fmt.int(item.targetNeed14)}</b><em>до 14 д</em></span>
                </div>
                <div class="oos-cluster-list">
                  ${visibleClusters.map(renderOosSkuClusterRow).join('')}
                  ${item.clusters.length > visibleClusters.length ? `<div class="oos-cluster-more">Еще ${fmt.int(item.clusters.length - visibleClusters.length)} кластеров ниже по риску</div>` : ''}
                </div>
              </div>
            </details>
          `;
        }).join('') || '<div class="oos-pulse-empty">Артикулов под контролем нет</div>'}
      </div>
    </section>
  `;
}

function renderOosPlatformSwitch(allRows = [], filters = oosControlFilters()) {
  const selected = filters.platform || 'all';
  const platformMap = new Map([
    ['wb', { key: 'wb', label: 'WB' }],
    ['ozon', { key: 'ozon', label: 'Ozon' }]
  ]);
  summarizeOosControlPlatforms(allRows).forEach((platform) => platformMap.set(platform.key, platform));
  const platforms = [...platformMap.values()];
  const items = [
    { key: 'all', label: 'Все площадки', caption: 'WB + Ozon + остальные', rows: allRows },
    ...platforms.map((platform) => ({
      key: platform.key,
      label: platform.label || platform.key,
      caption: platform.key === 'wb' ? 'Wildberries' : platform.key === 'ozon' ? 'Ozon' : (platform.label || platform.key),
      rows: allRows.filter((row) => row.platform === platform.key)
    }))
  ];
  return `
    <section class="oos-platform-switch" aria-label="Фильтр по площадке">
      <div>
        <span>Площадка</span>
        <strong>${escapeHtml(selected === 'all' ? 'Все площадки' : (items.find((item) => item.key === selected)?.label || selected))}</strong>
      </div>
      <div class="oos-platform-switch__buttons">
        ${items.map((item) => {
          const summary = oosControlSummarizeRows(item.rows, {});
          const isActive = selected === item.key;
          return `
            <button class="oos-platform-chip ${isActive ? 'is-active' : ''}" type="button" data-oos-platform-chip="${escapeHtml(item.key)}" aria-pressed="${isActive ? 'true' : 'false'}">
              <span>${escapeHtml(item.caption)}</span>
              <strong>${escapeHtml(item.label)}</strong>
              <em>${fmt.int(summary.totalIssues || 0)} сигналов · ${fmt.int(summary.skuCount || 0)} SKU · ${fmt.int(summary.placeCount || 0)} складов</em>
              <b>${fmt.money(summary.revenueAtRiskDay || 0)} / день</b>
            </button>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderOosStatusStrip(payload = {}, rows = [], allRows = rows) {
  const summary = oosControlSummarizeRows(rows, payload.summary || {});
  const pulse = oosControlPulseModel(rows);
  const allCount = Array.isArray(allRows) ? allRows.length : rows.length;
  const watchOnly = Math.max(0, summary.watchCount || 0);
  return `
    <section class="oos-simple-strip">
      <div class="oos-simple-strip__item danger">
        <span>В OOS</span>
        <strong>${fmt.int((summary.oosCount || 0) + (summary.criticalCount || 0))}</strong>
        <small>нулевой или критичный остаток</small>
      </div>
      <div class="oos-simple-strip__item warn">
        <span>Риск &lt;5 д</span>
        <strong>${fmt.int(summary.riskCount || 0)}</strong>
        <small>закончится скоро</small>
      </div>
      <div class="oos-simple-strip__item ok">
        <span>Резко выросли</span>
        <strong>${fmt.int(pulse.growthRows.length)}</strong>
        <small>темп продаж выше на 25%+</small>
      </div>
      <div class="oos-simple-strip__item info">
        <span>Замедлились</span>
        <strong>${fmt.int(pulse.slowRows.length)}</strong>
        <small>темп продаж ниже на 25%+</small>
      </div>
      <div class="oos-simple-strip__item info">
        <span>Контроль до 28 д</span>
        <strong>${fmt.int(watchOnly)}</strong>
        <small>заранее держим на виду</small>
      </div>
      <div class="oos-simple-strip__item">
        <span>Риск / день</span>
        <strong>${fmt.money(summary.revenueAtRiskDay || 0)}</strong>
        <small>${fmt.int(rows.length)} из ${fmt.int(allCount)} сигналов</small>
      </div>
    </section>
  `;
}

function renderOosControlOperationalBriefing(payload = {}, rows = [], allRows = rows, filters = oosControlFilters()) {
  return `
    ${renderOosPlatformSwitch(allRows, filters)}
    ${renderOosSkuRiskShelf(rows)}
  `;
}

function renderOosControlPlatformChart(rows = []) {
  const groups = oosControlGroupBy(rows, (row) => row.platform || '', (row) => row.platformLabel || row.platform || '');
  const maxRisk = Math.max(1, ...groups.map((item) => item.riskAmount));
  return `
    <div class="oos-chart-card">
      <div class="section-subhead">
        <div><h3>Риск по площадкам</h3><p class="small muted">Где деньги заканчиваются быстрее всего</p></div>
        ${badge(`${fmt.int(groups.length)} площадки`)}
      </div>
      <div class="oos-bar-list">
        ${groups.map((item) => renderOosControlBarRow({
          label: item.label,
          value: item.riskAmount,
          valueLabel: fmt.money(item.riskAmount),
          meta: `${fmt.int(item.total)} сигнал(а) · ${fmt.int(item.placeCount)} складов`,
          tone: item.key === 'wb' ? 'purple' : item.key === 'ozon' ? 'info' : 'warn'
        }, maxRisk)).join('') || '<div class="empty">Нет активных сигналов</div>'}
      </div>
    </div>
  `;
}

function renderOosControlTopPlacesChart(rows = []) {
  const places = oosControlTopPlaces(rows, 8);
  const maxRisk = Math.max(1, ...places.map((item) => item.riskAmount));
  return `
    <div class="oos-chart-card">
      <div class="section-subhead">
        <div><h3>Топ складов</h3><p class="small muted">Сначала закрываем самый дорогой риск</p></div>
        ${badge(`${fmt.int(places.length)} точек`)}
      </div>
      <div class="oos-bar-list">
        ${places.map((item) => renderOosControlBarRow({
          label: item.place,
          value: item.riskAmount,
          valueLabel: fmt.money(item.riskAmount),
          meta: `${item.platformLabel || item.platform} · ${item.article} · ${fmt.num(item.turnoverDays, 1)} д`,
          tone: 'warn'
        }, maxRisk, { minWhenPositive: 3 })).join('') || '<div class="empty">Нет складов под риском</div>'}
      </div>
    </div>
  `;
}

function renderOosControlCoverageChart(rows = []) {
  const sortedRows = [...rows].sort((left, right) => numberOrZero(left.turnoverDays) - numberOrZero(right.turnoverDays)).slice(0, 8);
  return `
    <div class="oos-chart-card">
      <div class="section-subhead">
        <div><h3>Покрытие</h3><p class="small muted">Цель: не ниже 5 дней</p></div>
        ${badge('5 д')}
      </div>
      <div class="oos-bar-list">
        ${sortedRows.map((row) => {
          const days = numberOrZero(row.turnoverDays || 0);
          const tone = oosControlCoverageTone(days);
          return renderOosControlBarRow({
            label: `${row.platformLabel || row.platform} · ${row.article || row.articleKey}`,
            value: days,
            valueLabel: `${fmt.num(days, 1)} д`,
            meta: `${fmt.int(oosControlPlaceCount(row))} складов · нужно до 14 д: ${fmt.int(row.targetNeed14 || 0)} шт`,
            tone
          }, 10, { minWhenPositive: 5 });
        }).join('') || '<div class="empty">Нет SKU под риском</div>'}
      </div>
    </div>
  `;
}

function oosControlTaskSummary(rows = []) {
  const taskRows = rows.map((row) => ({ row, task: oosControlTaskFor(row) }));
  const taskCount = taskRows.filter((item) => item.task).length;
  const noTaskCount = Math.max(0, taskRows.length - taskCount);
  const noReasonCount = taskRows.filter((item) => item.task && !/Причина:|РџСЂРёС‡РёРЅР°:/i.test(String(item.task.reason || ''))).length;
  const noActionCount = taskRows.filter((item) => item.task && !String(item.task.nextAction || '').trim()).length;
  return { taskRows, taskCount, noTaskCount, noReasonCount, noActionCount };
}

function renderOosControlTaskChart(rows = []) {
  const { taskRows, taskCount, noTaskCount, noReasonCount, noActionCount } = oosControlTaskSummary(rows);
  const maxValue = Math.max(1, taskRows.length, noTaskCount, noReasonCount, noActionCount);
  const items = [
    { label: 'Без задачи', value: noTaskCount, valueLabel: fmt.int(noTaskCount), tone: noTaskCount ? 'warn' : 'ok' },
    { label: 'Без причины', value: noReasonCount, valueLabel: fmt.int(noReasonCount), tone: noReasonCount ? 'warn' : 'ok' },
    { label: 'Без контрмеры', value: noActionCount, valueLabel: fmt.int(noActionCount), tone: noActionCount ? 'warn' : 'ok' }
  ];
  return `
    <div class="oos-chart-card">
      <div class="section-subhead">
        <div><h3>Задачи</h3><p class="small muted">Сигнал должен иметь владельца и следующий шаг</p></div>
        ${badge(`${fmt.int(taskCount)} с задачей`, taskCount === rows.length ? 'ok' : 'warn')}
      </div>
      <div class="oos-bar-list">
        ${items.map((item) => renderOosControlBarRow(item, maxValue, { minWhenPositive: 7 })).join('')}
      </div>
    </div>
  `;
}

function oosControlNoOosStreak(payload = {}) {
  const days = Array.isArray(payload.history?.days) ? [...payload.history.days] : [];
  const sortedDays = days
    .filter((day) => day?.date)
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
  let streak = 0;
  for (const day of sortedDays) {
    if (numberOrZero(day.oosCount || 0) > 0 || numberOrZero(day.criticalCount || 0) > 0) break;
    streak += 1;
  }
  return streak;
}

function oosControlGameModel(payload = {}, rows = []) {
  const summary = oosControlSummarizeRows(rows, payload.summary || {});
  const tasks = oosControlTaskSummary(rows);
  const coverValues = rows.map((row) => numberOrZero(row.turnoverDays || 0)).filter((value) => value > 0);
  const minCover = coverValues.length ? Math.min(...coverValues) : 0;
  const avgCover = coverValues.length
    ? coverValues.reduce((sum, value) => sum + value, 0) / coverValues.length
    : 0;
  const coveragePenalty = Math.max(0, 10 - Math.min(avgCover || 0, 10)) * 4;
  const score = Math.max(0, Math.min(100, Math.round(
    100
    - (summary.oosCount || 0) * 28
    - (summary.riskCount || 0) * 10
    - tasks.noTaskCount * 12
    - (summary.dataStatus === 'stale' ? 8 : 0)
    - coveragePenalty
  )));
  const league = score >= 90
    ? { title: 'Лига A', label: 'контур под контролем', tone: 'ok' }
    : score >= 70
      ? { title: 'Лига B', label: 'нужно удержать темп', tone: 'info' }
      : score >= 45
        ? { title: 'Лига C', label: 'бой за покрытие', tone: 'warn' }
        : { title: 'Лига D', label: 'режим спасения выручки', tone: 'danger' };
  const topRow = [...rows].sort((left, right) => oosControlRiskAmount(right) - oosControlRiskAmount(left))[0] || null;
  const missions = [
    {
      title: 'Нулевой фактический OOS',
      reward: 15,
      tone: summary.oosCount ? 'danger' : 'ok',
      done: !summary.oosCount && !summary.criticalCount,
      metric: summary.oosCount ? `${fmt.int(summary.oosCount)} OOS` : '0 OOS'
    },
    {
      title: 'Назначить контрмеры',
      reward: 20,
      tone: tasks.noTaskCount ? 'warn' : 'ok',
      done: !tasks.noTaskCount,
      metric: tasks.noTaskCount ? `${fmt.int(tasks.noTaskCount)} без задачи` : 'готово'
    },
    {
      title: 'Дотянуть покрытие до 5 дней',
      reward: 25,
      tone: minCover && minCover < 5 ? 'warn' : 'ok',
      done: Boolean(minCover && minCover >= 5),
      metric: minCover ? `${fmt.num(minCover, 1)} д минимум` : 'нет риска'
    },
    {
      title: 'Закрыть самый дорогой риск',
      reward: 30,
      tone: topRow ? oosControlCoverageTone(topRow.turnoverDays) : 'ok',
      done: !topRow,
      metric: topRow ? `${topRow.platformLabel || topRow.platform} · ${fmt.money(topRow.revenueAtRiskDay || 0)}` : 'готово'
    },
    {
      title: 'Освежить факт',
      reward: 10,
      tone: summary.dataStatus === 'stale' ? 'warn' : 'ok',
      done: summary.dataStatus !== 'stale',
      metric: summary.dataStatus === 'stale' ? `до ${summary.dataDate || '—'}` : 'свежо'
    }
  ];
  const earnedXp = missions.filter((mission) => mission.done).reduce((sum, mission) => sum + mission.reward, 0);
  const totalXp = missions.reduce((sum, mission) => sum + mission.reward, 0);
  const streak = oosControlNoOosStreak(payload);
  return { summary, tasks, minCover, score, league, missions, earnedXp, totalXp, streak };
}

function renderOosControlMission(mission = {}) {
  const tone = mission.done ? 'ok' : (mission.tone || 'warn');
  return `
    <div class="oos-mission ${tone}">
      <div>
        <strong>${escapeHtml(mission.title || '')}</strong>
        <span>${escapeHtml(mission.metric || '')}</span>
      </div>
      <b>${mission.done ? 'закрыто' : `+${fmt.int(mission.reward || 0)} XP`}</b>
    </div>
  `;
}

function renderOosControlOwnerRace(rows = []) {
  const owners = oosControlGroupBy(
    rows,
    (row) => row.owner || 'Без owner',
    (row) => row.owner || 'Без owner'
  ).slice(0, 5);
  const maxRisk = Math.max(1, ...owners.map((item) => item.riskAmount));
  return `
    <div class="oos-game-card">
      <div class="section-subhead">
        <div><h3>Owner-лига</h3><p class="small muted">Рейтинг по выручке, которую надо защитить</p></div>
        ${badge(`${fmt.int(owners.length)} owner`)}
      </div>
      <div class="oos-race-list">
        ${owners.map((owner, index) => `
          <div class="oos-race-row">
            <span class="oos-race-rank">${index + 1}</span>
            <div>
              <strong>${escapeHtml(owner.label)}</strong>
              <small>${fmt.int(owner.total)} сигнал(а) · ${fmt.int(owner.placeCount)} складов</small>
              <i><b style="--oos-bar:${oosControlBarPercent(owner.riskAmount, maxRisk, 8)}%"></b></i>
            </div>
            <em>${fmt.money(owner.riskAmount)}</em>
          </div>
        `).join('') || '<div class="empty">Нет owner в фокусе</div>'}
      </div>
    </div>
  `;
}

function renderOosControlGame(payload = {}, rows = []) {
  const game = oosControlGameModel(payload, rows);
  const xpPercent = oosControlBarPercent(game.earnedXp, game.totalXp, 0);
  return `
    <section class="oos-game-grid">
      <div class="oos-game-card oos-game-score ${game.league.tone}">
        <div class="oos-game-score__head">
          <div>
            <span class="eyebrow">OOS game</span>
            <h3>${escapeHtml(game.league.title)} · ${escapeHtml(game.league.label)}</h3>
          </div>
          <strong>${fmt.int(game.score)}</strong>
        </div>
        <div class="oos-game-xp">
          <div><span>XP дня</span><b>${fmt.int(game.earnedXp)} / ${fmt.int(game.totalXp)}</b></div>
          <i><b style="--oos-bar:${xpPercent}%"></b></i>
        </div>
        <div class="oos-game-badges">
          ${badge(`${fmt.int(game.streak)} д без OOS`, game.streak ? 'ok' : 'warn')}
          ${badge(`${fmt.int(game.summary.placeCount)} складов в фокусе`, game.summary.placeCount ? 'warn' : 'ok')}
          ${badge(`${fmt.int(game.tasks.taskCount)} задач`, game.tasks.taskCount === rows.length ? 'ok' : 'warn')}
        </div>
      </div>
      <div class="oos-game-card">
        <div class="section-subhead">
          <div><h3>Миссии дня</h3><p class="small muted">Закрытые миссии дают XP и поднимают лигу</p></div>
          ${badge(`${fmt.int(game.missions.filter((mission) => mission.done).length)} / ${fmt.int(game.missions.length)}`)}
        </div>
        <div class="oos-mission-list">
          ${game.missions.map(renderOosControlMission).join('')}
        </div>
      </div>
      ${renderOosControlOwnerRace(rows)}
    </section>
  `;
}

function renderOosControlCharts(payload = {}, rows = []) {
  return `
    <section class="oos-chart-grid">
      ${renderOosControlPlatformChart(rows)}
      ${renderOosControlTopPlacesChart(rows)}
      ${renderOosControlCoverageChart(rows)}
      ${renderOosControlTaskChart(rows)}
    </section>
  `;
}

function renderOosControlActionCards(rows = []) {
  const sortedRows = [...rows]
    .sort((left, right) => oosControlRiskAmount(right) - oosControlRiskAmount(left))
    .slice(0, 6);
  return `
    <section class="oos-section">
      <div class="section-subhead">
        <div>
          <h3>Что сделать сейчас</h3>
          <p class="small muted">Короткий список действий перед полной детализацией</p>
        </div>
        ${badge(`${fmt.int(sortedRows.length)} фокус`)}
      </div>
      <div class="oos-action-grid">
        ${sortedRows.map(renderOosControlActionCard).join('') || '<div class="empty">Нет активных OOS-сигналов</div>'}
      </div>
    </section>
  `;
}

function renderOosControlActionCard(row = {}) {
  const task = oosControlTaskFor(row);
  const days = numberOrZero(row.turnoverDays || 0);
  const tone = oosControlCoverageTone(days);
  const places = oosControlTopPlaces([row], 3).map((item) => item.place).filter(Boolean);
  const need14 = numberOrZero(row.targetNeed14 || 0);
  const need28 = numberOrZero(row.targetNeed28 || 0);
  const actionText = need14 > 0
    ? `Довести до 14 дней: +${fmt.int(need14)} шт или перераспределить между складами.`
    : need28 > 0
      ? `Проверить поставку до 28 дней: ориентир +${fmt.int(need28)} шт.`
      : 'Проверить поставку, перемещение и лимит продаж по складам.';
  return `
    <article class="oos-action-card ${tone}">
      <div class="oos-action-card__head">
        <div>
          <strong>${linkToSku(row.articleKey || row.article, row.article || row.articleKey)}</strong>
          <span>${escapeHtml(row.platformLabel || row.platform || '')} · ${escapeHtml(row.owner || 'Без owner')}</span>
        </div>
        ${badge(row.statusLabel || row.status || 'OOS', oosControlStatusTone(row.status))}
      </div>
      <div class="oos-action-card__metrics">
        <span><b>${fmt.num(days, 1)} д</b><em>покрытие</em></span>
        <span><b>${fmt.money(row.revenueAtRiskDay || 0)}</b><em>риск / день</em></span>
        <span><b>${fmt.int(oosControlPlaceCount(row))}</b><em>складов</em></span>
      </div>
      <div class="oos-coverage-track"><i class="${tone}" style="--oos-bar:${oosControlBarPercent(days, 10, 5)}%"></i></div>
      <p>${escapeHtml(actionText)}</p>
      <div class="badge-stack">
        ${places.map((place) => badge(place)).join('')}
        ${task ? badge(oosControlTaskStatusLabel(task), TASK_STATUS_META[task.status]?.kind || '') : badge('нет задачи', 'warn')}
      </div>
    </article>
  `;
}

function bindOosControl(root, rootId) {
  root.querySelectorAll('[data-oos-platform-chip]').forEach((button) => {
    button.addEventListener('click', () => {
      state.oosControlFilters = state.oosControlFilters || {};
      state.oosControlFilters.platform = button.dataset.oosPlatformChip || 'all';
      renderOosControl(rootId);
    });
  });
  root.querySelectorAll('[data-oos-signal]').forEach((button) => {
    button.addEventListener('click', () => {
      oosControlFocusSignal(root, button.dataset.oosSignal || '');
    });
  });
  root.querySelectorAll('[data-oos-filter]').forEach((control) => {
    const eventName = control.tagName === 'INPUT' ? 'input' : 'change';
    control.addEventListener(eventName, () => {
      state.oosControlFilters = state.oosControlFilters || {};
      state.oosControlFilters[control.dataset.oosFilter] = control.value;
      renderOosControl(rootId);
    });
  });
  root.querySelectorAll('[data-oos-reset-filters]').forEach((button) => {
    button.addEventListener('click', () => {
      state.oosControlFilters = {
        ...(state.oosControlFilters || {}),
        search: '',
        owner: 'all',
        department: 'all',
        status: 'active',
        cluster: 'all',
        days: 'all'
      };
      renderOosControl(rootId);
    });
  });
  root.querySelectorAll('[data-oos-save]').forEach((button) => {
    button.addEventListener('click', async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Сохраняем...';
      try {
        await oosControlSaveTask(button.dataset.oosSave, rootId);
      } finally {
        button.disabled = false;
        button.textContent = original || 'Сохранить';
      }
    });
  });
  root.querySelector('[data-oos-reload]')?.addEventListener('click', async () => {
    state.boot.lazyReady.oosControl = false;
    await ensureViewData('oos-control');
    renderOosControl(rootId);
  });
  root.querySelector('[data-oos-export]')?.addEventListener('click', () => {
    downloadOosControlExcel(oosControlFilteredRows());
  });
  root.querySelector('[data-oos-reconnect-team]')?.addEventListener('click', async () => {
    try {
      if (typeof setAppError === 'function') setAppError('Подключаем командную базу для OOS...');
      await oosControlEnsureRemoteReady();
      if (typeof pullRemoteState === 'function' && oosControlHasRemoteStore()) await pullRemoteState(false);
    } catch (error) {
      console.error(error);
      if (typeof setAppError === 'function') setAppError(`Командная база не подключилась: ${error.message || error}`);
    }
    renderOosControl(rootId);
  });
}

function renderOosControlLegacy(rootId = 'view-oos-control') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const payload = oosControlPayload();
  const rows = oosControlRows();
  const filters = oosControlFilters();
  const filteredRows = oosControlFilteredRows();
  const summary = payload.summary || {};
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>OOS контроль</h1>
        <p>Ежедневная очередь рисков аута: SKU, площадка, склад, owner, причина, контрмера и командная задача.</p>
      </div>
      <div class="actions">
        ${badge(`факт до ${escapeHtml(summary.dataDate || payload.dataFreshness?.dataDate || '—')}`, summary.dataStatus === 'ok' ? 'ok' : 'warn')}
        ${badge(`${fmt.int(filteredRows.length)} из ${fmt.int(rows.length)} строк`)}
        <button class="quick-chip" type="button" data-oos-export>Выгрузить OOS + комментарии</button>
        <button class="quick-chip" type="button" data-oos-reload>Обновить экран</button>
      </div>
    </div>
    ${oosControlFreshnessNotice(payload)}
    ${oosControlTeamNotice()}
    ${renderOosControlKpis(summary)}
    ${renderOosControlGroupSummary(payload)}
    ${renderOosControlMonthlyHistory(payload)}
    ${renderOosControlFilters(rows, filters)}
    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Очередь OOS / риск аута</h3>
          <p class="small muted">Сохраняй причину и контрмеру прямо в строке: портал создаст или обновит задачу в командной базе.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(summary.newIssues || 0)} новых`, (summary.newIssues || 0) ? 'warn' : '')}
          ${badge(`${fmt.int(summary.resolvedToday || 0)} закрылись`, (summary.resolvedToday || 0) ? 'ok' : '')}
        </div>
      </div>
      <div class="table-wrap sku-plan-fact-table" style="margin-top:12px">
        <table>
          <thead>
            <tr>
              <th>SKU / склад</th>
              <th>Сигнал</th>
              <th>Остаток</th>
              <th>Покрытие</th>
              <th>Риск выручки</th>
              <th>Owner / отдел</th>
              <th>Причина и контрмера</th>
            </tr>
          </thead>
          <tbody>
            ${filteredRows.map(renderOosControlRow).join('') || '<tr><td colspan="7"><div class="empty">Нет строк под текущие фильтры</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
  bindOosControl(root, rootId);
}

function renderOosControl(rootId = 'view-oos-control') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const payload = oosControlPayload();
  const rows = oosControlRows();
  const filters = oosControlFilters();
  const filteredRows = oosControlFilteredRows();
  const summary = oosControlSummarizeRows(filteredRows, payload.summary || {});
  const signals = oosControlVisibleSignals(filteredRows, payload);
  const selectedSignal = signals.find((signal) => signal.key === state.oosControlSelectedSignal) || signals[0] || null;
  state.oosControlSelectedSignal = selectedSignal?.key || '';
  root.dataset.oosPlatform = filters.platform === 'wb' || filters.platform === 'ozon'
    ? filters.platform
    : filters.platform === 'all'
      ? 'all'
      : 'market';
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>OOS контроль</h1>
        <p>Какая позиция в каком кластере закончится раньше поставки и сколько оборота будет потеряно.</p>
      </div>
      <div class="actions">
        ${badge(`факт до ${escapeHtml(summary.dataDate || payload.dataFreshness?.dataDate || '—')}`, summary.dataStatus === 'ok' ? 'ok' : 'warn')}
        ${badge(`${fmt.int(signals.length)} SKU × кластер`, signals.length ? 'warn' : 'ok')}
        <button class="quick-chip" type="button" data-oos-export>Выгрузить риски</button>
        <button class="quick-chip" type="button" data-oos-reload>Обновить экран</button>
      </div>
    </div>
    ${renderOosControlCommand(signals, filters)}
    <section class="card oos-focus" data-oos-focus>${renderOosControlSignalFocus(selectedSignal)}</section>
    ${renderOosControlLocalizationTrend(payload, filteredRows, signals)}
    ${renderOosControlSignalList(signals, selectedSignal?.key || '', rows, filters)}
    ${renderOosControlFormulaNote()}
    <details class="oos-advanced-panel">
      <summary>
        <span>Фильтры, комментарии и служебная таблица</span>
        ${badge(`${fmt.int(filteredRows.length)} агрегированных строк`)}
      </summary>
      ${renderOosControlFiltersV4(rows, filters)}
      ${oosControlTeamNotice()}
      <div class="card sku-plan-fact-card oos-detail-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Служебная детализация</h3>
          <p class="small muted">Комментарии и контрмеры сохраняются к исходной OOS-строке. Первый экран выше всегда считает риски по кластерам.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(summary.newIssues || 0)} новых`, (summary.newIssues || 0) ? 'warn' : '')}
          ${badge(`${fmt.int(summary.resolvedToday || 0)} закрылись`, (summary.resolvedToday || 0) ? 'ok' : '')}
        </div>
      </div>
      <div class="table-wrap sku-plan-fact-table" style="margin-top:12px">
        <table>
          <thead>
            <tr>
              <th>SKU / склад</th>
              <th>Сигнал</th>
              <th>Остаток</th>
              <th>Покрытие</th>
              <th>Риск выручки</th>
              <th>Owner / отдел</th>
              <th>Причина и контрмера</th>
            </tr>
          </thead>
          <tbody>
            ${filteredRows.map(renderOosControlRow).join('') || '<tr><td colspan="7"><div class="empty">Нет строк под текущие фильтры</div></td></tr>'}
          </tbody>
        </table>
      </div>
      </div>
    </details>
  `;
  bindOosControl(root, rootId);
}

function skuPlanFactDownloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function skuPlanFactParseDelimited(text = '', delimiter = ';') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => String(value || '').trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => String(value || '').trim())) rows.push(row);
  return rows;
}

function skuPlanFactDetectDelimiter(text = '') {
  const firstLine = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim()) || '';
  const candidates = [';', '\t', ','];
  return candidates
    .map((delimiter) => ({ delimiter, count: (firstLine.match(new RegExp(delimiter === '\t' ? '\\t' : `\\${delimiter}`, 'g')) || []).length }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter || ';';
}

function skuPlanFactImportHeaderKey(header = '') {
  const token = skuPlanFactToken(header);
  if (!token) return '';
  if (['action', 'decision'].includes(token) || token.startsWith('решение') || (token.includes('alias') && token.includes('ignore'))) return 'action';
  if (['targetsku', 'target', 'portalsku', 'mainsku'].includes(token) || token.includes('реестре') || (token.startsWith('sku') && token.includes('alias'))) return 'target_sku';
  if (['platform', 'marketplace', 'sourceplatform'].includes(token) || token.includes('площадка')) return 'platform';
  if (['apisku', 'apiarticle', 'api', 'sourcesku', 'marketplacesku'].includes(token)) return 'api_sku';
  if (['articlekey', 'article', 'skuapi'].includes(token)) return 'article_key';
  if (['status', 'active'].includes(token) || token.includes('статус') || token.includes('active')) return 'status';
  if (['note', 'comment', 'decisioncomment'].includes(token) || token.includes('комментар')) return 'note';
  return token;
}

function skuPlanFactLooksLikeReviewForm(matrix = [], headers = []) {
  const rawHeaders = matrix[0] || [];
  const headerTokens = rawHeaders.map((value) => skuPlanFactToken(value));
  const hasReviewHeaderHints = headerTokens.some((token) => token.includes('alias') && token.includes('ignore'))
    || headerTokens.includes('skuapi')
    || headerTokens.some((token) => token.includes('apisku'));
  const hasReviewBodyHints = matrix.slice(1, 20).some((row) => {
    const action = skuPlanFactNormalizeReviewAction(row?.[0] || '', row?.[2] || '');
    return ['alias', 'ignore', 'new_sku', 'need_check'].includes(action);
  });
  const recognized = new Set(headers.filter(Boolean));
  const missingCore = !recognized.has('action')
    || !recognized.has('target_sku')
    || !recognized.has('platform')
    || (!recognized.has('api_sku') && !recognized.has('article_key'));
  return missingCore && rawHeaders.length >= 5 && (hasReviewHeaderHints || hasReviewBodyHints);
}

function skuPlanFactReviewFallbackHeaders(headers = []) {
  const fallback = [
    'action',
    'decision_hint',
    'target_sku',
    'platform',
    'api_sku',
    'status',
    'note',
    'month',
    'fact_to',
    'severity',
    'type',
    'article_key',
    'name',
    'revenue',
    'units',
    'recommended_action'
  ];
  return headers.map((header, index) => fallback[index] || header);
}

function skuPlanFactRowsFromMatrix(matrix = []) {
  let headers = (matrix[0] || []).map((value) => skuPlanFactImportHeaderKey(value));
  if (skuPlanFactLooksLikeReviewForm(matrix, headers)) {
    headers = skuPlanFactReviewFallbackHeaders(headers);
  }
  return matrix.slice(1).map((values) => {
    const row = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = String(values[index] ?? '').trim();
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => String(value || '').trim()));
}

function skuPlanFactRowsFromHtml(text = '') {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  const matrix = [...table.querySelectorAll('tr')].map((tr) => (
    [...tr.querySelectorAll('th,td')].map((cell) => cell.textContent || '')
  ));
  return skuPlanFactRowsFromMatrix(matrix);
}

async function skuPlanFactRowsFromReviewFile(file) {
  const text = await file.text();
  if (/^\s*PK/.test(text) || /\.xlsx$/i.test(file.name || '')) {
    throw new Error('XLSX напрямую браузер не читает. Загрузите CSV или XLS, который портал выгружает из кнопки "Выгрузить проблемы".');
  }
  if (/<table[\s>]/i.test(text) || /<html[\s>]/i.test(text)) return skuPlanFactRowsFromHtml(text);
  return skuPlanFactRowsFromMatrix(skuPlanFactParseDelimited(text, skuPlanFactDetectDelimiter(text)));
}

async function skuPlanFactLoadJsonFile(path, fallback, label) {
  if (typeof loadJsonOrFallback === 'function') return loadJsonOrFallback(path, fallback, label || path);
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) return fallback;
  return response.json();
}

function skuPlanFactAliasRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.aliases) ? payload.aliases : [];
}

function skuPlanFactAliasKey(alias = {}) {
  return [
    skuPlanFactToken(alias.target_sku || alias.targetSku || alias.target || ''),
    skuPlanFactNormalizePlatform(alias.platform || 'all'),
    skuPlanFactToken(alias.api_sku || alias.apiSku || alias.alias || alias.value || '')
  ].join('|');
}

function skuPlanFactAliasApiKey(platform = 'all', apiSku = '') {
  return skuPlanFactIgnoreKey(platform || 'all', apiSku || '');
}

function skuPlanFactOwnerTextForSku(sku = {}) {
  if (typeof ownerName === 'function') return ownerName(sku) || '';
  if (typeof sku?.owner === 'string') return sku.owner.trim();
  return String(sku?.owner?.name || '').trim();
}

function skuPlanFactRegistryStatusText(sku = {}) {
  return String(
    sku?.owner?.registryStatus
    || sku?.registryStatus
    || sku?.status
    || ''
  ).trim();
}

function skuPlanFactAuditEvents(payload = {}) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.events) ? payload.events : [];
}

function skuPlanFactBuildAuditPayload(event = {}) {
  const previous = state.skuAliasAudit && typeof state.skuAliasAudit === 'object'
    ? state.skuAliasAudit
    : { schema: 'sku-alias-audit-v1', events: [] };
  const previousEvents = skuPlanFactAuditEvents(previous);
  return {
    ...previous,
    schema: previous.schema || 'sku-alias-audit-v1',
    generatedAt: event.appliedAt || new Date().toISOString(),
    events: [event, ...previousEvents].slice(0, 500)
  };
}

function skuPlanFactBuildSkuLookup() {
  const lookup = new Map();
  (state.skus || []).forEach((sku) => {
    skuPlanFactSkuLookupTokens(sku).forEach((token) => {
      if (token && !lookup.has(token)) lookup.set(token, sku);
    });
  });
  return lookup;
}

function skuPlanFactReviewValue(row = {}, aliases = []) {
  for (const alias of aliases) {
    const key = skuPlanFactImportHeaderKey(alias);
    if (row[key] !== undefined) return String(row[key] ?? '').trim();
  }
  return '';
}

function skuPlanFactNormalizeReviewAction(action = '', targetSku = '') {
  const token = skuPlanFactToken(action);
  if (['alias', 'map', 'mapping', 'apply', 'active', 'алиас', 'связать'].includes(token)) return 'alias';
  if (['ignore', 'ignored', 'skip', 'hide', 'mute', 'exclude', 'игнор', 'игнорировать', 'скрыть'].includes(token)) return 'ignore';
  if (['newsku', 'new', 'createsku', 'create', 'sku', 'newproduct'].includes(token)) return 'new_sku';
  if (['needcheck', 'check', 'review', 'manual', 'question', 'later', 'todo'].includes(token)) return 'need_check';
  if (!token && targetSku) return 'alias';
  if (!token) return 'empty';
  return token;
}

function skuPlanFactPrepareAliasImport(rows = [], currentAliases = {}, currentIgnore = {}) {
  const skuLookup = skuPlanFactBuildSkuLookup();
  const aliasPayload = Array.isArray(currentAliases)
    ? { schema: 'sku-api-aliases-v1', aliases: currentAliases }
    : { schema: 'sku-api-aliases-v1', columns: ['target_sku', 'platform', 'api_sku', 'status', 'note'], aliases: skuPlanFactAliasRows(currentAliases) };
  const ignorePayload = Array.isArray(currentIgnore)
    ? { schema: 'sku-api-ignore-v1', columns: ['platform', 'api_sku', 'status', 'note'], ignored: currentIgnore }
    : { schema: 'sku-api-ignore-v1', columns: ['platform', 'api_sku', 'status', 'note'], ignored: skuPlanFactIgnorePayloadRows(currentIgnore) };
  ignorePayload.ignored = skuPlanFactIgnorePayloadRows(currentIgnore).slice();
  const existingAliases = new Set(skuPlanFactAliasRows(aliasPayload).map(skuPlanFactAliasKey));
  const existingIgnores = new Set(ignorePayload.ignored.map((row) => skuPlanFactIgnoreKey(row.platform || 'all', row.api_sku || row.apiSku || row.alias || row.value || '')));
  const existingApiTargets = new Map();
  const existingTargetAliasCounts = new Map();
  skuPlanFactAliasRows(aliasPayload).filter(skuPlanFactAliasIsActive).forEach((alias) => {
    const platform = skuPlanFactNormalizePlatform(alias.platform || 'all') || 'all';
    const apiSku = alias.api_sku || alias.apiSku || alias.alias || alias.value || '';
    const targetToken = skuPlanFactToken(alias.target_sku || alias.targetSku || alias.target || '');
    if (!apiSku || !targetToken) return;
    const target = skuLookup.get(targetToken);
    const targetSku = target?.articleKey || target?.article || alias.target_sku || alias.targetSku || alias.target || '';
    const canonicalTargetToken = skuPlanFactToken(targetSku);
    if (!canonicalTargetToken) return;
    existingApiTargets.set(skuPlanFactAliasApiKey(platform, apiSku), { targetToken: canonicalTargetToken, targetSku });
    existingTargetAliasCounts.set(canonicalTargetToken, (existingTargetAliasCounts.get(canonicalTargetToken) || 0) + 1);
  });
  const uploadApiTargets = new Map();
  const aliases = [];
  const ignores = [];
  const newSkuRows = [];
  const needCheckRows = [];
  const skippedRows = [];
  const errorRows = [];
  const duplicateRows = [];
  const validationWarnings = [];
  const findExistingApiConflict = (platform, apiSku, targetToken) => {
    const apiToken = skuPlanFactToken(apiSku);
    const candidates = [
      existingApiTargets.get(skuPlanFactAliasApiKey(platform, apiSku)),
      existingApiTargets.get(skuPlanFactAliasApiKey('all', apiSku))
    ].filter(Boolean);
    if (platform === 'all') {
      existingApiTargets.forEach((value, key) => {
        if (String(key || '').endsWith(`|${apiToken}`)) candidates.push(value);
      });
    }
    return candidates.find((item) => item.targetToken && item.targetToken !== targetToken) || null;
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const targetSku = skuPlanFactReviewValue(row, ['target_sku', 'target', 'portal_sku', 'main_sku']);
    const apiSku = skuPlanFactReviewValue(row, ['api_sku', 'api_article', 'api', 'article_key', 'article']);
    const platformRaw = skuPlanFactReviewValue(row, ['platform', 'marketplace', 'source_platform']);
    const platform = skuPlanFactNormalizePlatform(platformRaw || 'all');
    const status = skuPlanFactReviewValue(row, ['status']) || 'active';
    const note = skuPlanFactReviewValue(row, ['note', 'comment', 'decision_comment']) || 'Imported from portal review';
    const action = skuPlanFactNormalizeReviewAction(skuPlanFactReviewValue(row, ['action', 'decision', 'решение']), targetSku);

    if (!apiSku) {
      skippedRows.push({ rowNumber, reason: 'empty api_sku' });
      return;
    }
    if (!platformRaw) {
      validationWarnings.push({ rowNumber, apiSku, platform, targetSku, reason: 'platform is empty, import will use all platforms' });
    }
    if (action === 'ignore') {
      const ignore = { platform, api_sku: apiSku, status: 'ignored', note, updatedAt: new Date().toISOString() };
      const key = skuPlanFactIgnoreKey(platform, apiSku);
      if (existingIgnores.has(key)) duplicateRows.push({ rowNumber, apiSku, platform, reason: 'ignore duplicate' });
      else {
        existingIgnores.add(key);
        ignores.push(ignore);
      }
      return;
    }
    if (action === 'new_sku') {
      const item = {
        rowNumber,
        apiSku,
        platform,
        targetSku,
        note,
        action,
        reason: 'new_sku: сначала заведите SKU в реестре, затем загрузите эту строку как alias'
      };
      newSkuRows.push(item);
      skippedRows.push(item);
      return;
    }
    if (action === 'need_check') {
      const item = {
        rowNumber,
        apiSku,
        platform,
        targetSku,
        note,
        action,
        reason: 'need_check: строка оставлена на ручную проверку, портал ничего не применяет'
      };
      needCheckRows.push(item);
      skippedRows.push(item);
      return;
    }
    if (action !== 'alias') {
      skippedRows.push({ rowNumber, apiSku, action, reason: 'not an alias action' });
      return;
    }
    if (!targetSku) {
      errorRows.push({ rowNumber, apiSku, platform, reason: 'target_sku is required for alias' });
      return;
    }
    const target = skuLookup.get(skuPlanFactToken(targetSku));
    if (!target) {
      errorRows.push({ rowNumber, apiSku, platform, targetSku, reason: 'target_sku not found in skus.json' });
      return;
    }
    const canonicalTargetSku = target.articleKey || target.article || targetSku;
    const canonicalTargetToken = skuPlanFactToken(canonicalTargetSku);
    const uploadApiKey = skuPlanFactAliasApiKey(platform, apiSku);
    const uploadConflict = uploadApiTargets.get(uploadApiKey);
    if (uploadConflict && uploadConflict.targetToken !== canonicalTargetToken) {
      errorRows.push({ rowNumber, apiSku, platform, targetSku: canonicalTargetSku, reason: `same upload maps API SKU to ${uploadConflict.targetSku}` });
      return;
    }
    const existingConflict = findExistingApiConflict(platform, apiSku, canonicalTargetToken);
    if (existingConflict) {
      errorRows.push({ rowNumber, apiSku, platform, targetSku: canonicalTargetSku, reason: `existing alias already maps API SKU to ${existingConflict.targetSku}` });
      return;
    }
    uploadApiTargets.set(uploadApiKey, { targetToken: canonicalTargetToken, targetSku: canonicalTargetSku });

    const owner = skuPlanFactOwnerTextForSku(target);
    const registryStatus = skuPlanFactRegistryStatusText(target);
    if (!owner || /^без owner$/i.test(owner) || /не\s*в\s*реестре/i.test(registryStatus)) {
      validationWarnings.push({ rowNumber, apiSku, platform, targetSku: canonicalTargetSku, reason: 'target_sku has no owner or is not in registry' });
    }
    const nextAliasCount = (existingTargetAliasCounts.get(canonicalTargetToken) || 0) + 1;
    if (nextAliasCount > 50 && (nextAliasCount === 51 || nextAliasCount % 25 === 0)) {
      validationWarnings.push({ rowNumber, apiSku, platform, targetSku: canonicalTargetSku, reason: `target_sku has ${nextAliasCount} active aliases` });
    }

    const alias = { target_sku: canonicalTargetSku, platform, api_sku: apiSku, status, note };
    const key = skuPlanFactAliasKey(alias);
    if (existingAliases.has(key)) duplicateRows.push({ rowNumber, apiSku, platform, targetSku: alias.target_sku, reason: 'alias duplicate' });
    else {
      existingAliases.add(key);
      existingTargetAliasCounts.set(canonicalTargetToken, nextAliasCount);
      aliases.push(alias);
    }
  });

  const nextAliasPayload = { ...aliasPayload, aliases: [...skuPlanFactAliasRows(aliasPayload), ...aliases], updatedAt: new Date().toISOString() };
  const nextIgnorePayload = { ...ignorePayload, ignored: [...ignorePayload.ignored, ...ignores], updatedAt: new Date().toISOString() };
  return {
    generatedAt: new Date().toISOString(),
    sourceRows: rows.length,
    candidateAliases: aliases.length,
    candidateIgnores: ignores.length,
    candidateNewSkus: newSkuRows.length,
    candidateNeedCheck: needCheckRows.length,
    validationWarnings,
    duplicateRows,
    skippedRows,
    errorRows,
    newSkuRows,
    needCheckRows,
    aliases,
    ignores,
    aliasPayload: nextAliasPayload,
    ignorePayload: nextIgnorePayload
  };
}

function skuPlanFactAliasIsActive(row = {}) {
  const status = skuPlanFactToken(row?.status ?? row?.active ?? 'active');
  return !['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove'].includes(status);
}

function skuPlanFactApplyAliasesToStateSkus(aliasRows = []) {
  const lookup = skuPlanFactBuildSkuLookup();
  let applied = 0;
  (aliasRows || []).filter(skuPlanFactAliasIsActive).forEach((alias) => {
    const targetToken = skuPlanFactToken(alias.target_sku || alias.targetSku || alias.target || '');
    const apiSku = String(alias.api_sku || alias.apiSku || alias.alias || alias.value || '').trim();
    if (!targetToken || !apiSku) return;
    const sku = lookup.get(targetToken);
    if (!sku) return;
    const platform = skuPlanFactNormalizePlatform(alias.platform || 'all') || 'all';
    sku.platformAliases = sku.platformAliases && typeof sku.platformAliases === 'object' ? sku.platformAliases : {};
    if (!Array.isArray(sku.platformAliases[platform])) sku.platformAliases[platform] = sku.platformAliases[platform] ? [sku.platformAliases[platform]] : [];
    const platformTokens = new Set(sku.platformAliases[platform].map((value) => skuPlanFactToken(value)));
    if (!platformTokens.has(skuPlanFactToken(apiSku))) sku.platformAliases[platform].push(apiSku);
    sku.aliases = Array.isArray(sku.aliases) ? sku.aliases : [];
    const aliasTokens = new Set(sku.aliases.map((value) => skuPlanFactToken(typeof value === 'string' ? value : (value?.value || value?.alias || value?.api_sku || ''))));
    if (!aliasTokens.has(skuPlanFactToken(apiSku))) {
      sku.aliases.push({ value: apiSku, platform, source: 'portal-import' });
    }
    applied += 1;
  });
  return applied;
}

function skuPlanFactActiveIgnoreRowsFromPayload(payload = {}) {
  return skuPlanFactIgnorePayloadRows(payload).filter((row) => {
    const status = skuPlanFactToken(row?.status ?? row?.active ?? 'active');
    return !['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove'].includes(status);
  });
}

function skuPlanFactBuildRuntimeSkuMatrix(aliasPayload = {}, ignorePayload = {}) {
  const aliases = skuPlanFactAliasRows(aliasPayload).filter(skuPlanFactAliasIsActive);
  const ignored = skuPlanFactActiveIgnoreRowsFromPayload(ignorePayload);
  const lookup = skuPlanFactBuildSkuLookup();
  const aliasesByTarget = new Map();
  const aliasToArticleKey = {};
  aliases.forEach((alias) => {
    const targetToken = skuPlanFactToken(alias.target_sku || alias.targetSku || alias.target || '');
    const apiSku = String(alias.api_sku || alias.apiSku || alias.alias || alias.value || '').trim();
    if (!targetToken || !apiSku) return;
    const target = lookup.get(targetToken);
    const articleKey = target?.articleKey || target?.article || alias.target_sku || '';
    if (!articleKey) return;
    if (!aliasesByTarget.has(articleKey)) aliasesByTarget.set(articleKey, []);
    const platform = skuPlanFactNormalizePlatform(alias.platform || 'all') || 'all';
    aliasesByTarget.get(articleKey).push({
      platform,
      api_sku: apiSku,
      status: alias.status || 'active',
      note: alias.note || '',
      source: alias.source || 'portal-import'
    });
    aliasToArticleKey[skuPlanFactIgnoreKey(platform, apiSku)] = articleKey;
  });

  const previous = state.skuMatrix || {};
  const previousByToken = new Map((previous.items || []).map((item) => [skuPlanFactToken(item.articleKey || item.article || ''), item]));
  const items = (state.skus || []).map((sku, index) => {
    const articleKey = sku.articleKey || sku.article || '';
    const previousItem = previousByToken.get(skuPlanFactToken(articleKey)) || {};
    const owner = ownerName(sku) || previousItem.owner || '';
    let problemStates = Array.isArray(previousItem.problemStates) && previousItem.problemStates.length
      ? previousItem.problemStates.filter((stateKey) => stateKey !== 'missing_owner')
      : ['ok'];
    if (!owner) problemStates = ['missing_owner', ...problemStates.filter((stateKey) => stateKey !== 'ok')];
    if (!problemStates.length) problemStates = ['ok'];
    return {
      ...previousItem,
      articleKey,
      article: sku.article || articleKey,
      name: sku.name || previousItem.name || '',
      owner,
      status: sku.status || previousItem.status || '',
      registryStatus: sku.owner?.registryStatus || previousItem.registryStatus || sku.status || '',
      brand: sku.brand || previousItem.brand || '',
      category: sku.category || previousItem.category || '',
      aliases: aliasesByTarget.get(articleKey) || [],
      problemStates,
      problemState: problemStates[0] || 'ok',
      problemLabel: typeof skuMatrixProblemMeta === 'function' ? skuMatrixProblemMeta(problemStates[0] || 'ok').label : '',
      problemTone: typeof skuMatrixProblemMeta === 'function' ? skuMatrixProblemMeta(problemStates[0] || 'ok').tone : '',
      _index: index
    };
  }).map(({ _index, ...item }) => item);

  const ignoredKeys = new Set(ignored.map((row) => skuPlanFactIgnoreKey(row.platform || 'all', row.api_sku || row.apiSku || row.alias || row.value || '')));
  const activeAliasKeys = new Set(Object.keys(aliasToArticleKey));
  const apiUnmapped = (previous.apiUnmapped || []).filter((row) => {
    const platform = row.platform || 'all';
    const apiSku = row.api_sku || row.apiSku || row.articleKey || '';
    return !ignoredKeys.has(skuPlanFactIgnoreKey(platform, apiSku))
      && !ignoredKeys.has(skuPlanFactIgnoreKey('all', apiSku))
      && !activeAliasKeys.has(skuPlanFactIgnoreKey(platform, apiSku))
      && !activeAliasKeys.has(skuPlanFactIgnoreKey('all', apiSku));
  });
  const byArticleKey = {};
  items.forEach((item, index) => { if (item.articleKey) byArticleKey[item.articleKey] = index; });
  const problemStateCounts = items.reduce((acc, item) => {
    (item.problemStates || ['ok']).forEach((stateKey) => {
      acc[stateKey] = (acc[stateKey] || 0) + 1;
    });
    return acc;
  }, {});
  if (apiUnmapped.length) problemStateCounts.api_unmapped = apiUnmapped.length;
  if ((previous.duplicateRisks || []).length) problemStateCounts.duplicate_risk = previous.duplicateRisks.length;

  return {
    schema: 'portal-sku-matrix-v1',
    generatedAt: new Date().toISOString(),
    source: {
      ...(previous.source || {}),
      skus: items.length,
      aliases: aliases.length,
      ignored: ignored.length,
      runtimeApplied: true
    },
    summary: {
      ...(previous.summary || {}),
      skuCount: items.length,
      aliasCount: aliases.length,
      ignoredApiSkuCount: ignored.length,
      apiUnmappedCount: apiUnmapped.length,
      missingOwnerCount: items.filter((item) => !item.owner || item.owner === 'Без owner').length,
      problemStateCounts
    },
    problemStates: previous.problemStates || (state.skuMatrix?.problemStates || {}),
    items,
    apiUnmapped,
    duplicateRisks: previous.duplicateRisks || [],
    ignoredApiSku: ignored.map((row) => ({
      platform: skuPlanFactNormalizePlatform(row.platform || 'all') || 'all',
      api_sku: row.api_sku || row.apiSku || row.alias || row.value || '',
      status: row.status || 'ignored',
      note: row.note || ''
    })),
    indexes: {
      byArticleKey,
      aliasToArticleKey
    }
  };
}

async function skuPlanFactSnapshotHash(text = '') {
  if (window.crypto?.subtle && window.TextEncoder) {
    const buffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `fallback-${Math.abs(hash)}`;
}

async function skuPlanFactPostSnapshotRow(row, cfg, brand) {
  const url = `${String(cfg.supabase.url || '').replace(/\/+$/, '')}/rest/v1/portal_data_snapshots?on_conflict=brand,snapshot_key`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: cfg.supabase.anonKey,
      Authorization: `Bearer ${cfg.supabase.anonKey}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify([{ ...row, brand }])
  });
  if (!response.ok) throw new Error(`Supabase ${row.snapshot_key}: HTTP ${response.status} ${await response.text()}`);
}

async function skuPlanFactUpsertSnapshot(snapshotKey, payload) {
  const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
  if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey) throw new Error('Supabase config is not available');
  const brand = typeof currentBrand === 'function' ? currentBrand() : (cfg.brand || 'Алтея');
  const generatedAt = payload?.generatedAt || payload?.updatedAt || new Date().toISOString();
  const payloadText = JSON.stringify(payload);
  const payloadHash = await skuPlanFactSnapshotHash(payloadText);
  const baseRow = {
    snapshot_key: snapshotKey,
    payload,
    payload_hash: payloadHash,
    source: 'portal-ui-sku-alias-import',
    generated_at: generatedAt
  };
  if (JSON.stringify([{ ...baseRow, brand }]).length <= 18000) {
    await skuPlanFactPostSnapshotRow(baseRow, cfg, brand);
    return payloadHash;
  }
  const chunkSize = 12000;
  const chunks = [];
  for (let index = 0; index < payloadText.length; index += chunkSize) chunks.push(payloadText.slice(index, index + chunkSize));
  await skuPlanFactPostSnapshotRow({
    snapshot_key: snapshotKey,
    payload: { chunked: true, encoding: 'utf8-json', chunk_count: chunks.length, generatedAt, payload_hash: payloadHash },
    payload_hash: payloadHash,
    source: 'portal-ui-sku-alias-import',
    generated_at: generatedAt
  }, cfg, brand);
  for (let index = 0; index < chunks.length; index += 1) {
    await skuPlanFactPostSnapshotRow({
      snapshot_key: `${snapshotKey}__part__${String(index + 1).padStart(4, '0')}`,
      payload: chunks[index],
      payload_hash: await skuPlanFactSnapshotHash(`${payloadHash}:${index + 1}:${chunks[index]}`),
      source: 'portal-ui-sku-alias-import',
      generated_at: generatedAt
    }, cfg, brand);
  }
  return payloadHash;
}

function skuPlanFactClonePayload(payload, fallback = {}) {
  try {
    if (typeof cloneJsonValue === 'function') return cloneJsonValue(payload ?? fallback);
  } catch {}
  try {
    return JSON.parse(JSON.stringify(payload ?? fallback));
  } catch {
    return fallback;
  }
}

function skuContourRollbackEventIds() {
  return new Set(
    skuPlanFactAuditEvents(state.skuAliasAudit || {})
      .filter((event) => event.type === 'sku_alias_import_rollback')
      .map((event) => event.rolledBackEventId || event.rollbackOf || '')
      .filter(Boolean)
  );
}

function skuContourRollbackableEvents() {
  const rolledBack = skuContourRollbackEventIds();
  return skuPlanFactAuditEvents(state.skuAliasAudit || {}).filter((event) => (
    event?.id
    && event.type === 'sku_alias_import_apply'
    && event.rollback?.beforeAliasPayload
    && event.rollback?.beforeIgnorePayload
    && !rolledBack.has(event.id)
  ));
}

function skuContourLatestRollbackableEvent() {
  return skuContourRollbackableEvents()[0] || null;
}

async function skuContourRollbackAliasImport(eventId = '', button = null, rootId = 'view-sku-contour') {
  const event = skuPlanFactAuditEvents(state.skuAliasAudit || {}).find((item) => item.id === eventId);
  if (!event?.rollback?.beforeAliasPayload || !event?.rollback?.beforeIgnorePayload) {
    if (typeof setAppError === 'function') setAppError('Для этого изменения нет сохранённой версии для отката.');
    return;
  }
  if (skuContourRollbackEventIds().has(event.id)) {
    if (typeof setAppError === 'function') setAppError('Это изменение уже откатывали.');
    return;
  }
  const originalText = button?.textContent || '';
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Откатываем...';
    }
    const aliasPayload = skuPlanFactClonePayload(event.rollback.beforeAliasPayload, { schema: 'sku-api-aliases-v1', aliases: [] });
    const ignorePayload = skuPlanFactClonePayload(event.rollback.beforeIgnorePayload, { schema: 'sku-api-ignore-v1', ignored: [] });
    state.skuAliases = aliasPayload;
    state.skuAliasIgnore = ignorePayload;
    const matrixPayload = skuPlanFactBuildRuntimeSkuMatrix(aliasPayload, ignorePayload);
    state.skuMatrix = matrixPayload;
    const appliedAt = new Date().toISOString();
    const actor = state.team?.member?.name || state.team?.userId || 'portal-user';
    const rollbackEvent = {
      id: `sku-alias-rollback-${Date.now()}`,
      type: 'sku_alias_import_rollback',
      appliedAt,
      actor,
      fileName: event.fileName || '',
      rolledBackEventId: event.id,
      aliasesRestored: skuPlanFactAliasRows(aliasPayload).length,
      ignoresRestored: skuPlanFactIgnorePayloadRows(ignorePayload).length,
      reason: 'Откат последнего применения alias/ignore из портала'
    };
    const auditPayload = skuPlanFactBuildAuditPayload(rollbackEvent);
    state.skuAliasAudit = auditPayload;
    await skuPlanFactUpsertSnapshot('sku_aliases', aliasPayload);
    await skuPlanFactUpsertSnapshot('sku_alias_ignore', ignorePayload);
    await skuPlanFactUpsertSnapshot('sku_matrix', matrixPayload);
    await skuPlanFactUpsertSnapshot('sku_alias_audit', auditPayload);
    if (typeof window.__alteaResetPortalSnapshotState === 'function') window.__alteaResetPortalSnapshotState();
    skuPlanFactRenderImportTarget(rootId);
    if (typeof setAppError === 'function') setAppError(`Откат применён: alias ${fmt.int(rollbackEvent.aliasesRestored)}, ignore ${fmt.int(rollbackEvent.ignoresRestored)}.`);
  } catch (error) {
    console.error('[sku-contour-rollback]', error);
    if (typeof setAppError === 'function') setAppError(`Не удалось откатить изменение: ${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || 'Откатить последнее';
    }
  }
}

function skuPlanFactRenderImportTarget(rootId = 'view-sku-plan-fact') {
  if (rootId === 'view-data-health' && typeof renderPortalDataHealth === 'function') {
    renderPortalDataHealth(rootId);
    return;
  }
  if (rootId === 'view-sku-contour' && typeof renderSkuContour === 'function') {
    renderSkuContour(rootId);
    return;
  }
  renderSkuPlanFact(rootId);
}

function skuPlanFactNewSkuTaskKey(row = {}) {
  const apiSku = row.apiSku || row.api_sku || '';
  const platform = skuPlanFactNormalizePlatform(row.platform || 'all') || 'all';
  return `sku-new-sku|${platform}|${skuPlanFactToken(apiSku)}`;
}

function skuPlanFactNewSkuTaskId(row = {}) {
  const raw = skuPlanFactNewSkuTaskKey(row);
  return typeof stableId === 'function' ? stableId('task', raw) : `task-${raw}`;
}

function skuPlanFactBuildNewSkuTask(row = {}, report = {}) {
  const apiSku = String(row.apiSku || row.api_sku || '').trim();
  const platform = skuPlanFactNormalizePlatform(row.platform || 'all') || 'all';
  const platformLabel = skuPlanFactPlatformLabel(platform);
  const titleSku = apiSku || row.targetSku || row.target_sku || 'API SKU';
  const taskPayload = {
    id: skuPlanFactNewSkuTaskId(row),
    source: 'manual',
    autoCode: 'sku_new_sku',
    articleKey: '',
    entityLabel: titleSku,
    title: `Завести SKU в реестре: ${titleSku}`,
    nextAction: 'Завести SKU в реестре, назначить owner, затем повторно загрузить строку как alias с target_sku.',
    reason: [
      'decision=new_sku',
      apiSku ? `API SKU: ${apiSku}` : '',
      platformLabel ? `площадка: ${platformLabel}` : '',
      row.note ? `комментарий: ${row.note}` : '',
      report.fileName ? `файл: ${report.fileName}` : ''
    ].filter(Boolean).join(' · '),
    owner: '',
    due: typeof plusDays === 'function' ? plusDays(2) : '',
    status: 'new',
    type: 'assignment',
    priority: 'high',
    platform
  };
  return typeof normalizeTask === 'function' ? normalizeTask(taskPayload, 'manual') : taskPayload;
}

async function skuPlanFactCreateNewSkuTasks(report = {}, options = {}) {
  const rows = report.newSkuRows || [];
  const result = { created: [], duplicates: [] };
  if (!rows.length) return result;
  state.storage = state.storage || {};
  state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
  const existingIds = new Set((state.storage.tasks || []).map((task) => task.id).filter(Boolean));
  const tasksToCreate = [];
  rows.forEach((row) => {
    const task = skuPlanFactBuildNewSkuTask(row, report);
    if (!task.id || existingIds.has(task.id)) {
      result.duplicates.push({ rowNumber: row.rowNumber, apiSku: row.apiSku || row.api_sku || '', platform: row.platform || 'all', taskId: task.id || '' });
      return;
    }
    existingIds.add(task.id);
    tasksToCreate.push(task);
  });
  result.created = tasksToCreate;
  if (options.persist === false || !tasksToCreate.length) return result;
  state.storage.tasks.unshift(...tasksToCreate);
  if (typeof saveLocalStorage === 'function') saveLocalStorage();
  for (const task of tasksToCreate) {
    try {
      if (typeof persistTask === 'function') await persistTask(task);
      if (typeof createTaskHistoryEntry === 'function') {
        await createTaskHistoryEntry(task.id, 'created', 'Задача создана из decision=new_sku в Контуре SKU.');
      }
    } catch (error) {
      console.error('[sku-plan-fact-new-sku-task]', error);
    }
  }
  return result;
}

async function handleSkuPlanFactApplyAliasImport(button = null, rootId = 'view-sku-plan-fact') {
  const report = state.skuPlanFactAliasImportReport || {};
  if ((report.errorRows || []).length) {
    if (typeof setAppError === 'function') setAppError('В импорте есть ошибки, применение остановлено.');
    return;
  }
  if (!report.aliasPayload && !report.ignorePayload && !(report.newSkuRows || []).length) return;
  const originalText = button?.textContent || '';
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Применяем...';
    }
    const beforeAliasPayload = skuPlanFactClonePayload(state.skuAliases || { schema: 'sku-api-aliases-v1', aliases: [] });
    const beforeIgnorePayload = skuPlanFactClonePayload(state.skuAliasIgnore || { schema: 'sku-api-ignore-v1', ignored: [] });
    const aliasPayload = report.aliasPayload || state.skuAliases || { schema: 'sku-api-aliases-v1', aliases: [] };
    const ignorePayload = report.ignorePayload || state.skuAliasIgnore || { schema: 'sku-api-ignore-v1', ignored: [] };
    state.skuAliases = aliasPayload;
    state.skuAliasIgnore = ignorePayload;
    const appliedAliases = skuPlanFactApplyAliasesToStateSkus(report.aliases || []);
    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    const newSkuTaskResult = await skuPlanFactCreateNewSkuTasks(report);
    const matrixPayload = skuPlanFactBuildRuntimeSkuMatrix(aliasPayload, ignorePayload);
    state.skuMatrix = matrixPayload;
    const appliedAt = new Date().toISOString();
    const actor = state.team?.member?.name || state.team?.userId || 'portal-user';
    const auditEvent = {
      id: `sku-alias-import-${Date.now()}`,
      type: 'sku_alias_import_apply',
      appliedAt,
      actor,
      fileName: report.fileName || '',
      sourceRows: report.sourceRows || 0,
      aliasesAdded: (report.aliases || []).length,
      ignoresAdded: (report.ignores || []).length,
      newSkuTasksCreated: newSkuTaskResult.created.length,
      newSkuTaskDuplicates: newSkuTaskResult.duplicates.length,
      duplicateRows: (report.duplicateRows || []).length,
      skippedRows: (report.skippedRows || []).length,
      errorRows: (report.errorRows || []).length,
      validationWarnings: (report.validationWarnings || []).length,
      aliasKeys: (report.aliases || []).slice(0, 50).map((row) => skuPlanFactAliasKey(row)),
      ignoreKeys: (report.ignores || []).slice(0, 50).map((row) => skuPlanFactIgnoreKey(row.platform || 'all', row.api_sku || row.apiSku || '')),
      rollback: {
        beforeAliasPayload,
        beforeIgnorePayload,
        beforeAliasCount: skuPlanFactAliasRows(beforeAliasPayload).length,
        beforeIgnoreCount: skuPlanFactIgnorePayloadRows(beforeIgnorePayload).length
      }
    };
    const auditPayload = skuPlanFactBuildAuditPayload(auditEvent);
    state.skuAliasAudit = auditPayload;
    await skuPlanFactUpsertSnapshot('sku_aliases', aliasPayload);
    await skuPlanFactUpsertSnapshot('sku_alias_ignore', ignorePayload);
    await skuPlanFactUpsertSnapshot('sku_matrix', matrixPayload);
    await skuPlanFactUpsertSnapshot('sku_alias_audit', auditPayload);
    if (typeof window.__alteaResetPortalSnapshotState === 'function') window.__alteaResetPortalSnapshotState();
    state.skuPlanFactAliasImportReport = { ...report, appliedAt, appliedAliases, newSkuTaskResult, auditEventId: auditEvent.id };
    skuPlanFactRenderImportTarget(rootId);
    if (typeof setAppError === 'function') {
      setAppError(`Импорт применён: ${fmt.int(report.aliases?.length || 0)} alias, ${fmt.int(report.ignores?.length || 0)} ignore, ${fmt.int(newSkuTaskResult.created.length)} задач new_sku. Матрица обновлена.`);
    }
  } catch (error) {
    console.error('[sku-plan-fact-apply-alias-import]', error);
    if (typeof setAppError === 'function') setAppError(`Не удалось применить импорт: ${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || 'Применить в портал';
    }
  }
}

async function handleSkuPlanFactAliasImport(file, rootId = 'view-sku-plan-fact') {
  if (!file) return;
  try {
    const rows = await skuPlanFactRowsFromReviewFile(file);
    const [currentAliases, currentIgnore] = await Promise.all([
      skuPlanFactLoadJsonFile('data/sku_aliases.json', { schema: 'sku-api-aliases-v1', aliases: [] }, 'SKU aliases'),
      skuPlanFactLoadJsonFile('data/sku_alias_ignore.json', { schema: 'sku-api-ignore-v1', ignored: [] }, 'SKU alias ignore')
    ]);
    const report = skuPlanFactPrepareAliasImport(rows, currentAliases, currentIgnore);
    report.fileName = file.name || '';
    state.skuPlanFactAliasImportReport = report;
    skuPlanFactRenderImportTarget(rootId);
    if (typeof setAppError === 'function') {
      setAppError(report.errorRows.length ? `Импорт проверен: ${report.errorRows.length} ошибок.` : 'Импорт проверен, можно применить в портал или скачать JSON.');
    }
  } catch (error) {
    console.error('[sku-plan-fact-alias-import]', error);
    state.skuPlanFactAliasImportReport = {
      generatedAt: new Date().toISOString(),
      fileName: file.name || '',
      sourceRows: 0,
      candidateAliases: 0,
      candidateIgnores: 0,
      candidateNewSkus: 0,
      candidateNeedCheck: 0,
      validationWarnings: [],
      duplicateRows: [],
      skippedRows: [],
      errorRows: [{ rowNumber: 0, reason: error.message || 'import failed' }],
      newSkuRows: [],
      needCheckRows: [],
      aliases: [],
      ignores: []
    };
    skuPlanFactRenderImportTarget(rootId);
    if (typeof setAppError === 'function') setAppError(`Не удалось разобрать файл: ${error.message}`);
  }
}

function skuPlanFactFocusState(target) {
  if (!target?.id) return null;
  const focusState = { id: target.id };
  if (typeof target.selectionStart === 'number') {
    focusState.start = target.selectionStart;
    focusState.end = target.selectionEnd;
  }
  return focusState;
}

function skuPlanFactRestoreFocus(focusState) {
  if (!focusState?.id) return;
  window.requestAnimationFrame(() => {
    const input = document.getElementById(focusState.id);
    if (!input) return;
    input.focus({ preventScroll: true });
    if (typeof focusState.start === 'number' && typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(focusState.start, focusState.end ?? focusState.start);
    }
  });
}

function skuPlanFactSetFilter(rootId, key, value, options = {}) {
  const filters = skuPlanFactFilters();
  let nextValue = value;
  if (key === 'date' || key === 'dateTo') {
    nextValue = skuPlanFactDateKey(value);
    filters.month = nextValue ? nextValue.slice(0, 7) : 'latest';
    filters.date = nextValue;
    filters.dateTo = nextValue;
    filters.dateMode = nextValue ? 'manual' : 'latest';
    if (filters.dateFrom && nextValue && skuPlanFactMonthFromDate(filters.dateFrom) !== skuPlanFactMonthFromDate(nextValue)) {
      filters.dateFrom = `${nextValue.slice(0, 7)}-01`;
    }
    if (filters.dateFrom && nextValue && filters.dateFrom > nextValue) {
      filters.dateFrom = nextValue;
    }
    key = 'dateTo';
  }
  if (key === 'dateFrom') {
    nextValue = skuPlanFactDateKey(value);
    filters.month = nextValue ? nextValue.slice(0, 7) : filters.month;
    filters.dateMode = nextValue ? 'manual' : 'latest';
    if (filters.dateTo && nextValue && skuPlanFactMonthFromDate(filters.dateTo) !== skuPlanFactMonthFromDate(nextValue)) {
      filters.dateTo = '';
      filters.date = '';
    }
    if (filters.dateTo && nextValue && filters.dateTo < nextValue) {
      filters.dateTo = nextValue;
      filters.date = nextValue;
    }
  }
  if (key === 'month') {
    const monthValue = String(value || '').slice(0, 7);
    nextValue = /^\d{4}-\d{2}$/.test(monthValue) ? monthValue : 'latest';
    filters.date = '';
    filters.dateFrom = '';
    filters.dateTo = '';
    filters.dateMode = nextValue === 'latest' ? 'latest' : 'month';
  }
  if (key === 'sort') {
    filters.sortDir = skuPlanFactDefaultSortDir(nextValue);
  }
  if (filters[key] === nextValue && !options.force && key !== 'dateTo' && key !== 'dateFrom') return;
  filters[key] = nextValue;

  const render = () => renderSkuPlanFact(rootId, { focusState: options.focusState || null });
  window.clearTimeout(skuPlanFactSearchTimer);
  if (options.debounce) {
    skuPlanFactSearchTimer = window.setTimeout(render, options.debounce);
  } else {
    render();
  }
}

function skuPlanFactToggleSort(rootId, sortKey) {
  const filters = skuPlanFactFilters();
  if (filters.sort === sortKey) {
    filters.sortDir = filters.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    filters.sort = sortKey;
    filters.sortDir = skuPlanFactDefaultSortDir(sortKey);
  }
  renderSkuPlanFact(rootId);
}

function skuPlanFactSortHeader(key, label) {
  const filters = skuPlanFactFilters();
  const active = filters.sort === key;
  const mark = active ? (filters.sortDir === 'asc' ? '↑' : '↓') : '';
  const ariaSort = active ? (filters.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return `
    <th class="${active ? 'is-sorted' : ''}" aria-sort="${ariaSort}">
      <button class="table-sort-btn" type="button" data-sku-plan-fact-sort="${escapeHtml(key)}">
        <span>${escapeHtml(label)}</span><span class="sort-mark">${mark}</span>
      </button>
    </th>
  `;
}

async function refreshSkuPlanFactData(button = null, rootId = 'view-sku-plan-fact') {
  const originalText = button?.textContent || '';
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Обновляем...';
    }
    if (typeof window.__alteaResetPortalSnapshotState === 'function') window.__alteaResetPortalSnapshotState();
    if (state.boot?.lazyReady) state.boot.lazyReady.skuPlanFact = false;
    if (state.boot?.lazyLoads) delete state.boot.lazyLoads.skuPlanFact;
    await Promise.all([
      typeof ensureViewData === 'function'
        ? ensureViewData('sku-plan-fact')
        : (LAZY_DATA_LOADERS?.skuPlanFact ? LAZY_DATA_LOADERS.skuPlanFact() : Promise.resolve()),
      portalRefreshOperationalDataPayloads()
    ]);
    skuPlanFactRenderImportTarget(rootId);
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  } catch (error) {
    console.warn('[sku-plan-fact-refresh]', error);
    if (typeof setAppError === 'function') setAppError(`План-факт SKU не смог обновить данные: ${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || 'Обновить данные';
    }
  }
}

let portalOperationalAutoRefreshStarted = false;
let portalOperationalAutoRefreshRunning = false;
let portalOperationalAutoRefreshLastAttemptAt = 0;
const PORTAL_OPERATIONAL_AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

function portalOperationalLatestDate() {
  return String(
    state.syncHealth?.freshness?.maxDate
    || state.portalDataQuality?.summary?.maxDate
    || state.portalDataQuality?.generatedAt
    || state.syncHealth?.generatedAt
    || ''
  ).slice(0, 10);
}

function portalOperationalRootIdForActiveView() {
  const view = String(state.activeView || '').trim();
  if (['data-health', 'sku-contour', 'sku-plan-fact'].includes(view)) return `view-${view}`;
  return 'view-data-health';
}

function portalOperationalNeedsDailyRefresh(force = false) {
  if (!state.boot?.dataReady) return false;
  if (force) return true;
  const latestDate = portalOperationalLatestDate();
  const today = todayIso();
  if (latestDate === today) return false;
  const now = Date.now();
  return now - portalOperationalAutoRefreshLastAttemptAt >= PORTAL_OPERATIONAL_AUTO_REFRESH_INTERVAL_MS;
}

async function portalMaybeAutoRefreshOperationalData(reason = 'auto', options = {}) {
  if (portalOperationalAutoRefreshRunning) return false;
  if (!portalOperationalNeedsDailyRefresh(options.force === true)) return false;
  portalOperationalAutoRefreshRunning = true;
  portalOperationalAutoRefreshLastAttemptAt = Date.now();
  try {
    await refreshSkuPlanFactData(null, portalOperationalRootIdForActiveView());
    return true;
  } catch (error) {
    console.warn('[portal-operational-auto-refresh]', reason, error);
    return false;
  } finally {
    portalOperationalAutoRefreshRunning = false;
  }
}

function portalStartOperationalAutoRefresh() {
  if (portalOperationalAutoRefreshStarted) return;
  portalOperationalAutoRefreshStarted = true;
}

function skuPlanFactLazyDataReady() {
  return Boolean(state.boot?.dataReady && state.boot?.lazyReady?.skuPlanFact);
}

function skuPlanFactRenderLoading(rootId = 'view-sku-plan-fact') {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = `
    <div class="sku-plan-fact-v1" data-plan-fact-design="v1" data-plan-fact-loading="true">
      <div class="pf-v1-head">
        <div>
          <div class="pf-v1-kicker">SKU · план · факт · маржа · реклама</div>
          <h2>План-факт собирает рабочие цифры</h2>
          <p>Держим новый слой на экране, пока подтягиваются матрица, факт и рекламные расходы. Старый loading-card больше не подставляется.</p>
        </div>
        <div class="pf-v1-head__actions">
          ${typeof badge === 'function' ? badge('загрузка данных', 'info') : ''}
        </div>
      </div>
      <div class="sku-plan-fact-toolbar pf-v1-filter-dock">
        <div class="pf-v1-filter-grid">
          <label class="pf-v1-control pf-v1-search"><span>Поиск</span><input disabled placeholder="SKU, название, owner..."></label>
          <div class="pf-v1-control"><span>Период</span><div class="pf-v1-segmented" role="group" aria-label="Режим периода"><button type="button" class="active" disabled>На дату</button><button type="button" disabled>Период</button><button type="button" disabled>Месяц</button></div></div>
          <label class="pf-v1-control"><span>Owner</span><select disabled><option>Все сотрудники</option></select></label>
          <label class="pf-v1-control"><span>Статус</span><select disabled><option>Актуальные</option></select></label>
          <div class="pf-v1-filter-actions"><button type="button" disabled>Фильтры</button><button type="button" disabled>Сбросить</button></div>
        </div>
        <div class="pf-v1-active-chips"><span class="muted small">Фильтры появятся сразу после загрузки фактических данных.</span></div>
      </div>
      <div class="pf-v1-kpis" aria-hidden="true">
        <article class="pf-v1-kpi"><span>План</span><strong>...</strong><em>ждем матрицу</em></article>
        <article class="pf-v1-kpi"><span>Факт</span><strong>...</strong><em>ждем API</em></article>
        <article class="pf-v1-kpi"><span>Маржа</span><strong>...</strong><em>ждем расчет</em></article>
        <article class="pf-v1-kpi"><span>Реклама</span><strong>...</strong><em>ждем расходы</em></article>
        <article class="pf-v1-kpi"><span>Таблица</span><strong>...</strong><em>готовим строки SKU</em></article>
      </div>
      <div class="sku-plan-fact-card pf-v1-table-card">
        <div class="section-subhead">
          <div>
            <h3>Таблица по артикулам</h3>
            <div class="muted small">Сейчас поднимаем источник, но маршрут уже занят новым интерфейсом.</div>
          </div>
        </div>
        <div class="empty">Подгружаем данные без отката на старый слой.</div>
      </div>
    </div>
  `;
  if (!state.boot?.dataReady || typeof ensureViewData !== 'function') return;
  if (!skuPlanFactLazyRenderPromise) {
    skuPlanFactLazyRenderPromise = Promise.resolve(ensureViewData('sku-plan-fact'))
      .catch((error) => {
        console.warn('[sku-plan-fact-lazy-render]', error);
        if (typeof renderViewFailure === 'function') {
          renderViewFailure(rootId, 'План-факт SKU', error);
        }
      })
      .finally(() => {
        skuPlanFactLazyRenderPromise = null;
      });
  }
  skuPlanFactLazyRenderPromise.then(() => {
    if (state.activeView === 'sku-plan-fact' && typeof rerenderCurrentView === 'function') {
      rerenderCurrentView();
    }
  });
}

function renderSkuPlanFact(rootId = 'view-sku-plan-fact', options = {}) {
  const root = document.getElementById(rootId);
  if (!root) return;
  if (options.force !== true && !skuPlanFactLazyDataReady()) {
    skuPlanFactRenderLoading(rootId);
    return;
  }
  const model = skuPlanFactBuildModel();
  const filters = model.filters;
  const totals = model.totals;
  const ownerOptions = model.owners.map((owner) => `<option value="${escapeHtml(owner)}" ${filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('');
  const monthOptions = model.months.map((monthKey) => (
    `<option value="${escapeHtml(monthKey)}" ${model.monthKey === monthKey ? 'selected' : ''}>${escapeHtml(skuPlanFactMonthLabel(monthKey))}</option>`
  )).join('');
  const platformOptions = SKU_PLAN_FACT_PLATFORMS.map((platform) => {
    const label = skuPlanFactPlatformLabel(platform);
    const valueLabel = platform === 'wb' ? 'Только WB'
      : platform === 'ozon' ? 'Только Ozon'
      : `Только ${label}`;
    return `<option value="${escapeHtml(platform)}" ${filters.platform === platform ? 'selected' : ''}>${escapeHtml(valueLabel)}</option>`;
  }).join('');
  const dateAttrs = [
    model.dateMin ? `min="${escapeHtml(model.dateMin)}"` : '',
    model.dateMax ? `max="${escapeHtml(model.dateMax)}"` : ''
  ].filter(Boolean).join(' ');
  const tableColspan = 9;
  const rowsHtml = model.rows.length
    ? model.rows.map((row) => skuPlanFactRowHtml(row, model)).join('')
    : `<tr><td colspan="${tableColspan}"><div class="empty">По текущим фильтрам нет SKU.</div></td></tr>`;
  const matrixSummary = typeof skuMatrixSummary === 'function' ? skuMatrixSummary() : {};
  const matrixGeneratedAt = state.skuMatrix?.generatedAt || state.skuMatrix?.updatedAt || '';
  const activePlatform = filters.platform !== 'all' ? filters.platform : '';
  const shellStyle = activePlatform ? skuPlanFactCardStyle(activePlatform, totals.completionToDate) : '';

  root.innerHTML = `
    <div class="sku-plan-fact-shell ${activePlatform ? 'is-platform-drill' : ''}" data-sku-plan-active-platform="${escapeHtml(activePlatform || 'all')}" style="${shellStyle}">
    <div class="section-title">
      <div>
        <h2>План-факт SKU</h2>
        <p>Рабочий срез по площадкам и артикулам: выполнение, маржа, реклама и карточка SKU в одном месте.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(model.rows.length)} SKU`, 'info')}
        ${badge(`${fmt.int(model.unmappedCount || 0)} API без пары`, model.unmappedCount ? 'warn' : 'ok')}
        ${badge(`маржа ${fmt.pct(totals.marginPct)}`, skuPlanFactMarginTone(totals.marginPct))}
        ${matrixSummary.duplicateRiskCount ? badge(`${fmt.int(matrixSummary.duplicateRiskCount)} риск дубля`, 'danger') : ''}
        ${badge(`матрица ${matrixGeneratedAt ? fmt.date(matrixGeneratedAt) : '—'}`, matrixGeneratedAt ? 'ok' : 'warn')}
        ${badge(`период ${model.periodStart || '—'} - ${model.periodEnd || model.maxFactDate || '—'}`, 'ok')}
      </div>
    </div>

    <div class="sku-plan-fact-toolbar">
      <div class="control-filters sku-plan-fact-filters">
        <input id="skuPlanFactSearch" placeholder="Поиск по SKU, названию, owner…" value="${escapeHtml(filters.search)}">
        <select id="skuPlanFactMonth" title="Месяц плана" aria-label="Месяц плана">
          ${monthOptions}
        </select>
        <input id="skuPlanFactDateFrom" type="date" title="Период с" aria-label="Период с" value="${escapeHtml(model.periodStart || '')}" ${dateAttrs}>
        <input id="skuPlanFactDateTo" type="date" title="Период по" aria-label="Период по" value="${escapeHtml(model.periodEnd || model.selectedDate || '')}" ${dateAttrs}>
        <select id="skuPlanFactOwner">
          <option value="all" ${filters.owner === 'all' ? 'selected' : ''}>Все owner</option>
          ${ownerOptions}
        </select>
        <select id="skuPlanFactStatus">
          <option value="actual" ${filters.status === 'actual' || filters.status === 'active' ? 'selected' : ''}>Актуальные</option>
          <option value="output" ${filters.status === 'output' ? 'selected' : ''}>Вывод</option>
          <option value="question" ${filters.status === 'question' ? 'selected' : ''}>Под вопросом</option>
          <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Все SKU</option>
          <option value="with_plan" ${filters.status === 'with_plan' ? 'selected' : ''}>Есть план</option>
          <option value="under_plan" ${filters.status === 'under_plan' ? 'selected' : ''}>Ниже плана</option>
          <option value="no_fact" ${filters.status === 'no_fact' ? 'selected' : ''}>План есть, факта нет</option>
          <option value="unmapped" ${filters.status === 'unmapped' ? 'selected' : ''}>API без пары в реестре</option>
          <option value="matrix_problem" ${filters.status === 'matrix_problem' ? 'selected' : ''}>Проблемы матрицы</option>
          <option value="missing_owner" ${filters.status === 'missing_owner' ? 'selected' : ''}>Матрица: без owner</option>
          <option value="duplicate_risk" ${filters.status === 'duplicate_risk' ? 'selected' : ''}>Риск дубля выручки</option>
        </select>
        <select id="skuPlanFactPlatform">
          <option value="all" ${filters.platform === 'all' ? 'selected' : ''}>Все площадки</option>
          ${platformOptions}
        </select>
        <select id="skuPlanFactSort">
          <option value="gap" ${filters.sort === 'gap' ? 'selected' : ''}>Сортировка: провал к плану</option>
          <option value="completion" ${filters.sort === 'completion' ? 'selected' : ''}>Сортировка: выполнение</option>
          <option value="margin" ${filters.sort === 'margin' ? 'selected' : ''}>Сортировка: маржа</option>
          <option value="fact" ${filters.sort === 'fact' ? 'selected' : ''}>Сортировка: факт оборота</option>
          <option value="plan" ${filters.sort === 'plan' ? 'selected' : ''}>Сортировка: план</option>
          <option value="drr" ${filters.sort === 'drr' ? 'selected' : ''}>Сортировка: ДРР</option>
          <option value="ad" ${filters.sort === 'ad' ? 'selected' : ''}>Сортировка: реклама</option>
          <option value="substitution" ${filters.sort === 'substitution' ? 'selected' : ''}>Сортировка: WB подмены</option>
          <option value="article" ${filters.sort === 'article' ? 'selected' : ''}>Сортировка: артикул</option>
          <option value="owner" ${filters.sort === 'owner' ? 'selected' : ''}>Сортировка: owner</option>
        </select>
      </div>
      <div class="badge-stack sku-plan-fact-actions">
        <button class="quick-chip" type="button" data-sku-plan-fact-refresh>Обновить данные</button>
        <button class="quick-chip" type="button" data-sku-plan-fact-export>Выгрузить в Excel</button>
      </div>
    </div>

    ${skuPlanFactPayrollKpiHtml(model)}

    ${skuPlanFactPlatformBoardHtml(model)}

    <div class="card sku-plan-fact-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Таблица по позициям</h3>
        </div>
        <div class="badge-stack">
          ${badge(`факт ${fmt.money(totals.factRevenue)}`, 'info')}
        </div>
      </div>
      <div class="table-wrap sku-plan-fact-table">
        <table>
          <thead>
            <tr>
              ${skuPlanFactSortHeader('article', 'SKU')}
              ${skuPlanFactSortHeader('owner', 'Owner')}
              ${skuPlanFactSortHeader('platform', 'Площадка')}
              ${skuPlanFactSortHeader('completion', 'Выполнение')}
              ${skuPlanFactSortHeader('gap', 'Факт / план')}
              ${skuPlanFactSortHeader('margin', 'Маржа')}
              ${skuPlanFactSortHeader('ad', 'Реклама / план')}
              ${skuPlanFactSortHeader('substitution', 'WB подмены')}
              ${skuPlanFactSortHeader('action', 'Карточка')}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="footer-note">Клик по строке открывает карточку SKU для смены owner и рабочих комментариев.</div>
    </div>
    </div>
  `;

  root.querySelector('#skuPlanFactSearch')?.addEventListener('input', (event) => {
    skuPlanFactSetFilter(rootId, 'search', event.target.value, { debounce: 140, focusState: skuPlanFactFocusState(event.target) });
  });
  root.querySelector('#skuPlanFactMonth')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'month', event.target.value); });
  root.querySelector('#skuPlanFactDateFrom')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'dateFrom', event.target.value); });
  root.querySelector('#skuPlanFactDateTo')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'dateTo', event.target.value); });
  root.querySelector('#skuPlanFactOwner')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'owner', event.target.value); });
  root.querySelector('#skuPlanFactStatus')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'status', event.target.value); });
  root.querySelector('#skuPlanFactPlatform')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'platform', event.target.value); });
  root.querySelector('#skuPlanFactSort')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'sort', event.target.value); });
  root.querySelectorAll('[data-sku-plan-fact-sort]').forEach((button) => {
    button.addEventListener('click', () => skuPlanFactToggleSort(rootId, button.dataset.skuPlanFactSort));
  });
  root.querySelectorAll('[data-sku-plan-fact-platform-card]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const platform = button.dataset.skuPlanFactPlatformCard || 'all';
      const next = skuPlanFactFilters().platform === platform ? 'all' : platform;
      skuPlanFactSetFilter(rootId, 'platform', next);
    });
  });
  root.querySelector('[data-sku-plan-fact-refresh]')?.addEventListener('click', (event) => { refreshSkuPlanFactData(event.currentTarget, rootId); });
  root.querySelector('[data-sku-plan-fact-export]')?.addEventListener('click', () => downloadSkuPlanFactExcel(model));
  root.querySelector('[data-sku-plan-fact-quality-export]')?.addEventListener('click', () => downloadSkuPlanFactQualityExcel(model));
  root.querySelector('[data-sku-plan-fact-quality-import]')?.addEventListener('click', () => {
    root.querySelector('[data-sku-plan-fact-quality-file]')?.click();
  });
  root.querySelector('[data-sku-plan-fact-quality-file]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    await handleSkuPlanFactAliasImport(file, rootId);
  });
  root.querySelector('[data-sku-plan-fact-apply-import]')?.addEventListener('click', async (event) => {
    await handleSkuPlanFactApplyAliasImport(event.currentTarget, rootId);
  });
  root.querySelector('[data-sku-plan-fact-download-aliases]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    if (report.aliasPayload) skuPlanFactDownloadJson('sku_aliases.updated.json', report.aliasPayload);
  });
  root.querySelector('[data-sku-plan-fact-download-ignore]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    if (report.ignorePayload) skuPlanFactDownloadJson('sku_alias_ignore.updated.json', report.ignorePayload);
  });
  root.querySelector('[data-sku-plan-fact-download-import-report]')?.addEventListener('click', () => {
    const report = state.skuPlanFactAliasImportReport || {};
    const { aliasPayload, ignorePayload, ...publicReport } = report;
    skuPlanFactDownloadJson(`sku-alias-import-report-${todayIso()}.json`, publicReport);
  });
  skuPlanFactRestoreFocus(options.focusState);
}

window.__ALTEA_SKU_PLAN_FACT_DESIGN_V1__ = true;

function skuPlanFactV1NormalizePlatform(value = 'all') {
  let key = String(value || 'all').trim().toLowerCase();
  if (!key || key === 'undefined' || key === 'null') key = 'all';
  if (['ym', 'yandex', 'yandexmarket', 'yamarket'].includes(key)) key = 'ya';
  if (['ga', 'goldenapple', 'gold-apple', 'gold_apple'].includes(key)) key = 'goldapple';
  if (['mm', 'magnitmarket', 'magnit-market'].includes(key)) key = 'magnit';
  if (['letual', 'letuall'].includes(key)) key = 'letu';
  return key === 'all' || SKU_PLAN_FACT_PLATFORMS.includes(key) ? key : 'all';
}

function skuPlanFactV1GlobalPlatformFilter(fallback = 'all') {
  const candidates = [
    document.documentElement?.dataset?.marketplace,
    document.body?.dataset?.marketplace,
    document.documentElement?.dataset?.platform,
    document.body?.dataset?.platform,
    state.filters?.platform,
    state.filters?.market
  ];
  try {
    candidates.push(window.localStorage?.getItem('altea.portal.marketplace'));
  } catch {
    candidates.push('');
  }
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || String(candidate).trim() === '') continue;
    const normalized = skuPlanFactV1NormalizePlatform(candidate);
    if (normalized !== 'all') return normalized;
    if (String(candidate).trim().toLowerCase() === 'all') return 'all';
  }
  return skuPlanFactV1NormalizePlatform(fallback);
}

function skuPlanFactV1SyncGlobalPlatform() {
  const platform = skuPlanFactV1GlobalPlatformFilter('all');
  const filters = skuPlanFactFilters();
  if (filters.platform !== platform) filters.platform = platform;
  return platform;
}

function skuPlanFactV1AdvancedFilters() {
  state.skuPlanFactAdvancedFiltersV1 = state.skuPlanFactAdvancedFiltersV1 || {};
  return state.skuPlanFactAdvancedFiltersV1;
}

function skuPlanFactV1AdvancedDefinitions() {
  return [
    { key: 'belowPlan', label: 'Ниже плана' },
    { key: 'marginRisk', label: 'Риск маржи' },
    { key: 'adsAbovePlan', label: 'Реклама выше плана' },
    { key: 'noOwner', label: 'Без owner' },
    { key: 'apiWithoutPair', label: 'API без пары' },
    { key: 'missingPlan', label: 'План не задан' }
  ];
}

function skuPlanFactV1AdvancedCount() {
  const advanced = skuPlanFactV1AdvancedFilters();
  return skuPlanFactV1AdvancedDefinitions().filter((item) => advanced[item.key]).length;
}

function skuPlanFactV1RowMatchesAdvanced(row = {}, model = {}, advanced = {}) {
  const metric = skuPlanFactDisplayMetric(row, model);
  const hasPlan = numberOrZero(metric.planRevenue) > 0 || numberOrZero(metric.planToDateRevenue) > 0;
  if (advanced.belowPlan && !(metric.planToDateRevenue > 0 && metric.factRevenue < metric.planToDateRevenue)) return false;
  if (advanced.marginRisk) {
    const margin = skuPlanFactNormalizeRatio(metric.marginPct);
    const planMargin = skuPlanFactNormalizeRatio(metric.planMarginPct);
    if (!(margin !== null && ((planMargin !== null && margin < planMargin) || margin < 0.28))) return false;
  }
  if (advanced.adsAbovePlan && !(metric.planDrr !== null && metric.drr !== null && metric.drr > metric.planDrr)) return false;
  if (advanced.noOwner && String(row.owner || '').trim()) return false;
  if (advanced.apiWithoutPair && !row.syntheticUnmapped) return false;
  if (advanced.missingPlan && hasPlan) return false;
  return true;
}

function skuPlanFactV1Rows(model = {}) {
  const rows = Array.isArray(model.rows) ? model.rows : [];
  const advanced = skuPlanFactV1AdvancedFilters();
  if (!skuPlanFactV1AdvancedCount()) return rows;
  return rows.filter((row) => skuPlanFactV1RowMatchesAdvanced(row, model, advanced));
}

function skuPlanFactV1DateMode(filters = {}, model = {}) {
  if (filters.dateMode === 'month') return 'month';
  if (filters.dateFrom && filters.dateTo && filters.dateFrom !== filters.dateTo) return 'range';
  if (model.periodStart && model.periodEnd && model.periodStart !== model.periodEnd && filters.dateMode !== 'manual') return 'range';
  return 'date';
}

function skuPlanFactV1ApplyDateMode(rootId, mode, model = {}) {
  const filters = skuPlanFactFilters();
  const date = model.periodEnd || model.selectedDate || model.maxFactDate || '';
  if (mode === 'month') {
    filters.month = model.monthKey || (date ? date.slice(0, 7) : 'latest');
    filters.date = '';
    filters.dateFrom = '';
    filters.dateTo = '';
    filters.dateMode = 'month';
  } else if (mode === 'range') {
    filters.dateFrom = filters.dateFrom || model.periodStart || (date ? `${date.slice(0, 7)}-01` : '');
    filters.dateTo = filters.dateTo || date;
    filters.date = filters.dateTo;
    filters.month = filters.dateTo ? filters.dateTo.slice(0, 7) : (model.monthKey || 'latest');
    filters.dateMode = 'manual';
  } else {
    filters.date = date;
    filters.dateFrom = '';
    filters.dateTo = date;
    filters.month = date ? date.slice(0, 7) : (model.monthKey || 'latest');
    filters.dateMode = date ? 'manual' : 'latest';
  }
  renderSkuPlanFact(rootId);
}

function skuPlanFactV1Reset(rootId) {
  state.skuPlanFactFilters = {
    search: '',
    owner: 'all',
    status: 'actual',
    platform: skuPlanFactV1GlobalPlatformFilter('all'),
    month: 'latest',
    date: '',
    dateFrom: '',
    dateTo: '',
    dateMode: 'latest',
    sort: 'gap',
    sortDir: 'asc',
    __truthFilterVersion: SKU_PLAN_FACT_FILTER_VERSION
  };
  state.skuPlanFactAdvancedFiltersV1 = {};
  renderSkuPlanFact(rootId);
}

function skuPlanFactV1MetricText(value, formatter, fallback = '—') {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return fallback;
  return formatter(value);
}

function skuPlanFactV1Progress(value, platform = 'all') {
  const ratio = value === null || value === undefined || !Number.isFinite(Number(value)) ? 0 : Math.max(0, Number(value));
  const width = Math.min(100, ratio * 100);
  return `<span class="pf-v1-progress" style="${skuPlanFactCardStyle(platform, ratio)}"><i style="width:${width.toFixed(1)}%"></i></span>`;
}

function skuPlanFactV1PlatformPills(row = {}) {
  const active = SKU_PLAN_FACT_PLATFORMS
    .map((platform) => ({ platform, metric: row.platforms?.[platform] || row[platform] || null }))
    .filter((entry) => skuPlanFactPlatformHasActivity(entry.metric));
  if (!active.length) return '<span class="pf-v1-platform muted">—</span>';
  return active.map(({ platform, metric }) => `
    <span class="pf-v1-platform" style="${skuPlanFactCardStyle(platform, metric.completionToDate)}">
      <b>${escapeHtml(skuPlanFactPlatformLabel(platform))}</b>
      <em>${skuPlanFactV1MetricText(metric.completionToDate, fmt.pct)}</em>
    </span>
  `).join('');
}

function skuPlanFactV1Status(row = {}, metric = {}) {
  if (row.syntheticUnmapped) return { label: 'API без пары', tone: 'warn' };
  if (!(numberOrZero(metric.planRevenue) > 0 || numberOrZero(metric.planToDateRevenue) > 0)) return { label: 'План не задан', tone: 'warn' };
  if (metric.planDrr !== null && metric.drr !== null && metric.drr > metric.planDrr) return { label: 'Риск рекламы', tone: 'danger' };
  const margin = skuPlanFactNormalizeRatio(metric.marginPct);
  const planMargin = skuPlanFactNormalizeRatio(metric.planMarginPct);
  if (margin !== null && planMargin !== null && margin < planMargin) return { label: 'Риск маржи', tone: 'danger' };
  if (metric.completionToDate !== null && metric.completionToDate < 0.9) return { label: 'Ниже плана', tone: 'warn' };
  return { label: 'OK', tone: 'ok' };
}

function skuPlanFactStatusLabel(value = '') {
  return {
    actual: 'Актуальные',
    active: 'Актуальные',
    output: 'Вывод',
    question: 'Под вопросом',
    all: 'Все SKU',
    with_plan: 'Есть план',
    under_plan: 'Ниже плана',
    no_fact: 'План есть, факта нет',
    unmapped: 'API без пары',
    matrix_problem: 'Проблемы матрицы',
    missing_owner: 'Без owner',
    duplicate_risk: 'Риск дубля'
  }[value] || value;
}

function skuPlanFactSortLabel(value = '') {
  return {
    gap: 'Разрыв: хуже сверху',
    completion: 'Выполнение',
    margin: 'Маржа',
    fact: 'Факт оборота',
    plan: 'План',
    drr: 'ДРР',
    ad: 'Реклама',
    substitution: 'WB подмены',
    article: 'Артикул',
    owner: 'Owner'
  }[value] || value;
}

function skuPlanFactV1ActiveChipsHtml(model = {}) {
  const filters = model.filters || {};
  const chips = [];
  if (filters.search) chips.push({ key: 'search', label: `Поиск: ${filters.search}` });
  if (filters.owner && filters.owner !== 'all') chips.push({ key: 'owner', label: filters.owner });
  if (filters.status && filters.status !== 'all') chips.push({ key: 'status', label: skuPlanFactStatusLabel(filters.status) });
  if (filters.sort && filters.sort !== 'gap') chips.push({ key: 'sort', label: `Сортировка: ${skuPlanFactSortLabel(filters.sort)}` });
  if (model.periodStart || model.periodEnd) chips.push({ key: 'period', label: `Период: ${model.periodStart || '—'} · ${model.periodEnd || model.selectedDate || '—'}` });
  const advanced = skuPlanFactV1AdvancedFilters();
  skuPlanFactV1AdvancedDefinitions().forEach((item) => {
    if (advanced[item.key]) chips.push({ key: `adv:${item.key}`, label: item.label });
  });
  if (!chips.length) return '<div class="pf-v1-active-chips"><span class="muted small">Фильтры не мешают цифрам.</span></div>';
  return `
    <div class="pf-v1-active-chips">
      ${chips.map((chip) => `<button type="button" data-sku-plan-fact-clear="${escapeHtml(chip.key)}">${escapeHtml(chip.label)} <span>×</span></button>`).join('')}
    </div>
  `;
}

function skuPlanFactV1PlatformBoardHtml(model = {}) {
  return `
    <div class="pf-v1-platform-board" aria-label="Статус площадок">
      ${(model.platforms || SKU_PLAN_FACT_PLATFORMS).map((platform) => {
        const summary = skuPlanFactPlatformSummary(model, platform, { scope: 'allRows', respectFilters: true });
        const level = skuPlanFactCompletionLevel(summary.completionToDate);
        return `
          <article class="sku-plan-platform-card pf-v1-platform-card level-${level}" style="${skuPlanFactCardStyle(platform, summary.completionToDate)}">
            <span class="sku-plan-platform-card__top">
              <strong>${escapeHtml(summary.label)}</strong>
              <em>${fmt.int(summary.rows)} SKU</em>
            </span>
            <span class="sku-plan-platform-card__value">${skuPlanFactV1MetricText(summary.completionToDate, fmt.pct)}</span>
            <span class="sku-plan-platform-card__meta">${fmt.money(summary.factRevenue)} / ${fmt.money(summary.planToDateRevenue)}</span>
            <span class="sku-plan-platform-card__bar"><i></i></span>
            <span class="sku-plan-platform-card__foot">
              <b class="${skuPlanFactDeltaClass(summary.gapToDate)}">${fmt.money(summary.gapToDate)}</b>
              <span><em>${fmt.int(summary.underPlan)} ниже плана</em></span>
            </span>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function skuPlanFactV1KpiHtml(model = {}, rows = []) {
  const totals = model.totals || {};
  const underPlan = rows.filter((row) => {
    const metric = skuPlanFactDisplayMetric(row, model);
    return metric.planToDateRevenue > 0 && metric.factRevenue < metric.planToDateRevenue;
  }).length;
  const cards = [
    { title: 'KPI-факт оборота', value: fmt.money(totals.factRevenue), hint: `план к дате ${fmt.money(totals.planToDateRevenue)}`, tone: skuPlanFactDeltaClass(totals.gapToDate) },
    { title: 'Выполнение к дате', value: skuPlanFactV1MetricText(totals.completionToDate, fmt.pct), hint: `месячный план ${skuPlanFactV1MetricText(totals.completionMonth, fmt.pct)}`, tone: skuPlanFactTone(totals.completionToDate) },
    { title: 'SKU ниже плана', value: `${fmt.int(underPlan)} / ${fmt.int(rows.length)}`, hint: `в фокусе ${fmt.int(totals.underPlan || 0)} SKU`, tone: underPlan ? 'warn' : 'ok' },
    { title: 'Маржа', value: skuPlanFactV1MetricText(totals.marginPct, fmt.pct), hint: `план ${skuPlanFactV1MetricText(totals.planMarginPct, fmt.pct)}`, tone: skuPlanFactMarginTone(totals.marginPct) },
    { title: 'Реклама / ДРР', value: `${fmt.money(totals.adSpend)} · ${skuPlanFactV1MetricText(totals.drr, fmt.pct)}`, hint: `план ${fmt.money(totals.planAdSpend)} · ${skuPlanFactV1MetricText(totals.planDrr, fmt.pct)}`, tone: totals.drr !== null && totals.planDrr !== null && totals.drr > totals.planDrr ? 'warn' : 'ok' }
  ];
  return `<div class="pf-v1-kpis">${cards.map((card) => `
    <article class="pf-v1-kpi ${escapeHtml(card.tone || '')}">
      <span>${escapeHtml(card.title)}</span>
      <strong>${card.value}</strong>
      <em>${escapeHtml(card.hint)}</em>
    </article>
  `).join('')}</div>`;
}

function skuPlanFactV1DrawerHtml(model = {}) {
  const advanced = skuPlanFactV1AdvancedFilters();
  const open = Boolean(state.skuPlanFactDrawerOpenV1);
  return `
    <aside class="pf-v1-drawer ${open ? 'is-open' : ''}" aria-hidden="${open ? 'false' : 'true'}">
      <div class="pf-v1-drawer__head">
        <div>
          <h3>Расширенные фильтры</h3>
          <p>Фильтруют строки, но не меняют план-факт и формулы.</p>
        </div>
        <button type="button" class="pf-v1-icon-btn" data-sku-plan-fact-drawer-close aria-label="Закрыть">×</button>
      </div>
      <div class="pf-v1-drawer__group">
        <strong>Качество данных и фокус</strong>
        ${skuPlanFactV1AdvancedDefinitions().map((item) => `
          <label class="pf-v1-check">
            <input type="checkbox" data-sku-plan-fact-advanced="${escapeHtml(item.key)}" ${advanced[item.key] ? 'checked' : ''}>
            <span>${escapeHtml(item.label)}</span>
          </label>
        `).join('')}
      </div>
      <div class="pf-v1-drawer__actions">
        <button type="button" data-sku-plan-fact-advanced-reset>Сбросить всё</button>
        <button type="button" data-sku-plan-fact-drawer-close>Применить · ${fmt.int(skuPlanFactV1Rows(model).length)} SKU</button>
      </div>
    </aside>
  `;
}

function skuPlanFactV1RowHtml(row = {}, model = {}) {
  const metric = skuPlanFactDisplayMetric(row, model);
  const openAttrs = skuPlanFactOpenAttrs(row, model, metric);
  const status = skuPlanFactV1Status(row, metric);
  const attention = status.tone === 'danger' || (metric.completionToDate !== null && metric.completionToDate < 0.9);
  const platform = metric.tonePlatform || metric.platform || 'all';
  const planToDateUnits = metric.planToDateUnits ?? metric.planUnits;
  const avgCheck = metric.factUnits > 0 ? metric.factRevenue / metric.factUnits : null;
  return `
    <tr class="pf-v1-row sku-plan-fact-row ${attention ? 'is-attention' : ''}" style="${skuPlanFactCardStyle(platform, metric.completionToDate)}"${openAttrs}>
      <td>${row.syntheticUnmapped ? `<strong>${escapeHtml(row.article || row.articleKey || 'API без пары')}</strong>` : `<button class="link-btn" type="button"${openAttrs}>${escapeHtml(row.article || row.articleKey || '')}</button>`}<div class="muted small">${escapeHtml(row.name || '')}</div></td>
      <td><strong>${escapeHtml(row.owner || '—')}</strong><div class="muted small">${escapeHtml(row.status || '')}</div></td>
      <td><div class="pf-v1-platforms">${skuPlanFactV1PlatformPills(row)}</div></td>
      <td><strong>${skuPlanFactV1MetricText(metric.completionToDate, fmt.pct)}</strong>${skuPlanFactV1Progress(metric.completionToDate, platform)}</td>
      <td>${fmt.money(metric.planToDateRevenue)}</td>
      <td><strong>${fmt.money(metric.factRevenue)}</strong></td>
      <td class="${skuPlanFactDeltaClass(metric.gapToDate)}">${fmt.money(metric.gapToDate)}</td>
      <td>${fmt.money(metric.planRevenue)}</td>
      <td>${skuPlanFactV1MetricText(metric.planMarginPct, fmt.pct)}</td>
      <td><strong>${skuPlanFactV1MetricText(metric.marginPct, fmt.pct)}</strong></td>
      <td>${skuPlanFactV1MetricText(metric.marginRub, fmt.money)}</td>
      <td>${skuPlanFactV1MetricText(metric.planAdSpendToDate, fmt.money)}</td>
      <td><strong>${fmt.money(metric.adSpend)}</strong></td>
      <td>${skuPlanFactV1MetricText(metric.planDrr, fmt.pct)}</td>
      <td><strong>${skuPlanFactV1MetricText(metric.drr, fmt.pct)}</strong></td>
      <td>${fmt.int(planToDateUnits)} / ${fmt.int(metric.factUnits)}</td>
      <td>${skuPlanFactV1MetricText(avgCheck, fmt.money)}</td>
      <td><span class="pf-v1-status ${escapeHtml(status.tone)}">${escapeHtml(status.label)}</span></td>
      <td>${row.syntheticUnmapped ? '<span class="muted small">—</span>' : `<button class="sku-plan-open-card" type="button"${openAttrs} aria-label="Открыть карточку SKU">→</button>`}</td>
    </tr>
  `;
}

function renderSkuPlanFactV1(rootId = 'view-sku-plan-fact', options = {}) {
  const root = document.getElementById(rootId);
  if (!root) return;
  if (options.force !== true && !skuPlanFactLazyDataReady()) {
    skuPlanFactRenderLoading(rootId);
    return;
  }
  skuPlanFactV1SyncGlobalPlatform();
  const model = skuPlanFactBuildModel();
  const filters = model.filters;
  const totals = model.totals || {};
  const visibleRows = skuPlanFactV1Rows(model);
  const ownerOptions = model.owners.map((owner) => `<option value="${escapeHtml(owner)}" ${filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('');
  const monthOptions = model.months.map((monthKey) => `<option value="${escapeHtml(monthKey)}" ${model.monthKey === monthKey ? 'selected' : ''}>${escapeHtml(skuPlanFactMonthLabel(monthKey))}</option>`).join('');
  const dateAttrs = [model.dateMin ? `min="${escapeHtml(model.dateMin)}"` : '', model.dateMax ? `max="${escapeHtml(model.dateMax)}"` : ''].filter(Boolean).join(' ');
  const dateMode = skuPlanFactV1DateMode(filters, model);
  const rowsHtml = visibleRows.length ? visibleRows.map((row) => skuPlanFactV1RowHtml(row, model)).join('') : '<tr><td colspan="19"><div class="empty">По текущим фильтрам нет SKU.</div></td></tr>';
  const matrixSummary = typeof skuMatrixSummary === 'function' ? skuMatrixSummary() : {};
  const matrixGeneratedAt = state.skuMatrix?.generatedAt || state.skuMatrix?.updatedAt || '';

  root.innerHTML = `
    <div class="sku-plan-fact-v1" data-plan-fact-design="v1" data-sku-plan-active-platform="${escapeHtml(filters.platform || 'all')}">
      <div class="pf-v1-head">
        <div>
          <div class="pf-v1-kicker">SKU · план · факт · маржа · реклама</div>
          <h2>План-факт без потери рабочих цифр</h2>
          <p>Сначала фильтр и итог, затем площадки и подробная таблица по каждому артикулу.</p>
        </div>
        <div class="pf-v1-head__actions">
          ${badge(`${fmt.int(visibleRows.length)} из ${fmt.int(model.rows.length)} SKU`, 'info')}
          ${badge(`${fmt.int(model.unmappedCount || 0)} API без пары`, model.unmappedCount ? 'warn' : 'ok')}
          ${matrixSummary.duplicateRiskCount ? badge(`${fmt.int(matrixSummary.duplicateRiskCount)} риск дубля`, 'danger') : ''}
          ${badge(`матрица ${matrixGeneratedAt ? fmt.date(matrixGeneratedAt) : '—'}`, matrixGeneratedAt ? 'ok' : 'warn')}
          <button class="quick-chip" type="button" data-sku-plan-fact-refresh>Обновить</button>
          <button class="quick-chip primary" type="button" data-sku-plan-fact-export>Выгрузить в Excel</button>
        </div>
      </div>

      <div class="sku-plan-fact-toolbar pf-v1-filter-dock">
        <div class="pf-v1-filter-grid">
          <label class="pf-v1-control pf-v1-search"><span>Поиск</span><input id="skuPlanFactSearch" placeholder="SKU, название, owner..." value="${escapeHtml(filters.search)}"></label>
          <div class="pf-v1-control"><span>Период</span><div class="pf-v1-segmented" role="group" aria-label="Режим периода">
            <button type="button" data-sku-plan-fact-date-mode="date" class="${dateMode === 'date' ? 'active' : ''}">На дату</button>
            <button type="button" data-sku-plan-fact-date-mode="range" class="${dateMode === 'range' ? 'active' : ''}">Период</button>
            <button type="button" data-sku-plan-fact-date-mode="month" class="${dateMode === 'month' ? 'active' : ''}">Месяц</button>
          </div></div>
          <label class="pf-v1-control ${dateMode === 'month' ? 'is-hidden' : ''}"><span>${dateMode === 'range' ? 'Дата с' : 'Дата'}</span><input id="skuPlanFactDateFrom" type="date" value="${escapeHtml(dateMode === 'range' ? (model.periodStart || '') : (model.periodEnd || model.selectedDate || ''))}" ${dateAttrs}></label>
          <label class="pf-v1-control ${dateMode === 'range' ? '' : 'is-hidden'}"><span>Дата по</span><input id="skuPlanFactDateTo" type="date" value="${escapeHtml(model.periodEnd || model.selectedDate || '')}" ${dateAttrs}></label>
          <label class="pf-v1-control ${dateMode === 'month' ? '' : 'is-hidden'}"><span>Месяц</span><select id="skuPlanFactMonth">${monthOptions}</select></label>
          <label class="pf-v1-control"><span>Owner</span><select id="skuPlanFactOwner"><option value="all" ${filters.owner === 'all' ? 'selected' : ''}>Все сотрудники</option>${ownerOptions}</select></label>
          <label class="pf-v1-control"><span>Статус</span><select id="skuPlanFactStatus">
            <option value="actual" ${filters.status === 'actual' || filters.status === 'active' ? 'selected' : ''}>Актуальные</option>
            <option value="output" ${filters.status === 'output' ? 'selected' : ''}>Вывод</option>
            <option value="question" ${filters.status === 'question' ? 'selected' : ''}>Под вопросом</option>
            <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Все SKU</option>
            <option value="with_plan" ${filters.status === 'with_plan' ? 'selected' : ''}>Есть план</option>
            <option value="under_plan" ${filters.status === 'under_plan' ? 'selected' : ''}>Ниже плана</option>
            <option value="no_fact" ${filters.status === 'no_fact' ? 'selected' : ''}>План есть, факта нет</option>
            <option value="unmapped" ${filters.status === 'unmapped' ? 'selected' : ''}>API без пары</option>
            <option value="matrix_problem" ${filters.status === 'matrix_problem' ? 'selected' : ''}>Проблемы матрицы</option>
            <option value="missing_owner" ${filters.status === 'missing_owner' ? 'selected' : ''}>Без owner</option>
            <option value="duplicate_risk" ${filters.status === 'duplicate_risk' ? 'selected' : ''}>Риск дубля</option>
          </select></label>
          <label class="pf-v1-control"><span>Сортировка</span><select id="skuPlanFactSort">
            <option value="gap" ${filters.sort === 'gap' ? 'selected' : ''}>Разрыв: хуже сверху</option>
            <option value="completion" ${filters.sort === 'completion' ? 'selected' : ''}>Выполнение</option>
            <option value="margin" ${filters.sort === 'margin' ? 'selected' : ''}>Маржа</option>
            <option value="fact" ${filters.sort === 'fact' ? 'selected' : ''}>Факт оборота</option>
            <option value="plan" ${filters.sort === 'plan' ? 'selected' : ''}>План</option>
            <option value="drr" ${filters.sort === 'drr' ? 'selected' : ''}>ДРР</option>
            <option value="ad" ${filters.sort === 'ad' ? 'selected' : ''}>Реклама</option>
            <option value="substitution" ${filters.sort === 'substitution' ? 'selected' : ''}>WB подмены</option>
            <option value="article" ${filters.sort === 'article' ? 'selected' : ''}>Артикул</option>
            <option value="owner" ${filters.sort === 'owner' ? 'selected' : ''}>Owner</option>
          </select></label>
          <div class="pf-v1-filter-actions">
            <button type="button" data-sku-plan-fact-drawer-open>Фильтры · ${skuPlanFactV1AdvancedCount()}</button>
            <button type="button" data-sku-plan-fact-reset>Сбросить</button>
            <button type="button" data-sku-plan-fact-scroll-table>Колонки</button>
          </div>
        </div>
        ${skuPlanFactV1ActiveChipsHtml(model)}
      </div>

      ${skuPlanFactV1KpiHtml(model, visibleRows)}
      ${skuPlanFactV1PlatformBoardHtml(model)}

      <div class="sku-plan-fact-card pf-v1-table-card">
        <div class="section-subhead">
          <div>
            <h3>Таблица по артикулам</h3>
            <div class="muted small">Первые колонки закреплены; полный набор метрик доступен горизонтальным скроллом.</div>
          </div>
          <div class="badge-stack">${badge(`${fmt.int(visibleRows.length)} SKU · ${fmt.money(totals.factRevenue)}`, 'info')}</div>
        </div>
        <div class="table-wrap sku-plan-fact-table pf-v1-table-wrap">
          <table class="pf-v1-table">
            <thead>
              <tr class="pf-v1-groups"><th colspan="3">Идентификация</th><th colspan="5">Оборот</th><th colspan="3">Маржа</th><th colspan="4">Реклама</th><th colspan="4">Операции</th></tr>
              <tr>
                ${skuPlanFactSortHeader('article', 'SKU')}
                ${skuPlanFactSortHeader('owner', 'Owner')}
                ${skuPlanFactSortHeader('platform', 'Площадки')}
                ${skuPlanFactSortHeader('completion', 'Вып.')}
                <th>План к дате</th>
                ${skuPlanFactSortHeader('fact', 'Факт')}
                ${skuPlanFactSortHeader('gap', 'Разрыв')}
                ${skuPlanFactSortHeader('plan', 'План мес.')}
                <th>Маржа план</th>
                ${skuPlanFactSortHeader('margin', 'Маржа факт')}
                <th>Маржа ₽</th>
                <th>Реклама план</th>
                ${skuPlanFactSortHeader('ad', 'Реклама факт')}
                <th>ДРР план</th>
                ${skuPlanFactSortHeader('drr', 'ДРР факт')}
                <th>Шт. план / факт</th>
                <th>Средний чек</th>
                ${skuPlanFactSortHeader('action', 'Статус')}
                <th>Карточка</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
      ${skuPlanFactV1DrawerHtml(model)}
    </div>
  `;

  root.querySelector('#skuPlanFactSearch')?.addEventListener('input', (event) => {
    skuPlanFactSetFilter(rootId, 'search', event.target.value, { debounce: 100, focusState: skuPlanFactFocusState(event.target) });
  });
  root.querySelectorAll('[data-sku-plan-fact-date-mode]').forEach((button) => {
    button.addEventListener('click', () => skuPlanFactV1ApplyDateMode(rootId, button.dataset.skuPlanFactDateMode, model));
  });
  root.querySelector('#skuPlanFactMonth')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'month', event.target.value); });
  root.querySelector('#skuPlanFactDateFrom')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, dateMode === 'range' ? 'dateFrom' : 'date', event.target.value); });
  root.querySelector('#skuPlanFactDateTo')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'dateTo', event.target.value); });
  root.querySelector('#skuPlanFactOwner')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'owner', event.target.value); });
  root.querySelector('#skuPlanFactStatus')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'status', event.target.value); });
  root.querySelector('#skuPlanFactSort')?.addEventListener('change', (event) => { skuPlanFactSetFilter(rootId, 'sort', event.target.value); });
  root.querySelectorAll('[data-sku-plan-fact-sort]').forEach((button) => {
    button.addEventListener('click', () => skuPlanFactToggleSort(rootId, button.dataset.skuPlanFactSort));
  });
  root.querySelector('[data-sku-plan-fact-reset]')?.addEventListener('click', () => skuPlanFactV1Reset(rootId));
  root.querySelector('[data-sku-plan-fact-scroll-table]')?.addEventListener('click', () => {
    root.querySelector('.pf-v1-table-wrap')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  root.querySelector('[data-sku-plan-fact-drawer-open]')?.addEventListener('click', () => {
    state.skuPlanFactDrawerOpenV1 = true;
    renderSkuPlanFact(rootId);
  });
  root.querySelectorAll('[data-sku-plan-fact-drawer-close]').forEach((button) => {
    button.addEventListener('click', () => {
      state.skuPlanFactDrawerOpenV1 = false;
      renderSkuPlanFact(rootId);
    });
  });
  root.querySelectorAll('[data-sku-plan-fact-advanced]').forEach((input) => {
    input.addEventListener('change', () => {
      const advanced = skuPlanFactV1AdvancedFilters();
      advanced[input.dataset.skuPlanFactAdvanced] = input.checked;
      renderSkuPlanFact(rootId);
    });
  });
  root.querySelector('[data-sku-plan-fact-advanced-reset]')?.addEventListener('click', () => {
    state.skuPlanFactAdvancedFiltersV1 = {};
    renderSkuPlanFact(rootId);
  });
  root.querySelectorAll('[data-sku-plan-fact-clear]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.skuPlanFactClear;
      const filters = skuPlanFactFilters();
      if (key === 'search') filters.search = '';
      else if (key === 'owner') filters.owner = 'all';
      else if (key === 'status') filters.status = 'all';
      else if (key === 'sort') {
        filters.sort = 'gap';
        filters.sortDir = skuPlanFactDefaultSortDir('gap');
      } else if (key === 'period') {
        filters.month = 'latest';
        filters.date = '';
        filters.dateFrom = '';
        filters.dateTo = '';
        filters.dateMode = 'latest';
      } else if (key?.startsWith('adv:')) {
        const advanced = skuPlanFactV1AdvancedFilters();
        delete advanced[key.slice(4)];
      }
      renderSkuPlanFact(rootId);
    });
  });
  root.querySelector('[data-sku-plan-fact-refresh]')?.addEventListener('click', (event) => { refreshSkuPlanFactData(event.currentTarget, rootId); });
  root.querySelector('[data-sku-plan-fact-export]')?.addEventListener('click', () => downloadSkuPlanFactExcel(model));
  skuPlanFactRestoreFocus(options.focusState);
}

window.renderSkuPlanFact = renderSkuPlanFactV1;
try { renderSkuPlanFact = renderSkuPlanFactV1; } catch {}
window.renderSkuContour = renderSkuContour;
window.renderPortalDataHealth = renderPortalDataHealth;
window.renderOosControl = renderOosControl;
window.skuContourIssueRows = skuContourIssueRows;
window.skuContourIssueIsResolved = skuContourIssueIsResolved;
window.portalHealthIssueRows = portalHealthIssueRows;
window.portalHealthCreateIssueTasks = portalHealthCreateIssueTasks;
window.portalRefreshOperationalDataPayloads = portalRefreshOperationalDataPayloads;
window.portalMaybeAutoRefreshOperationalData = portalMaybeAutoRefreshOperationalData;
window.portalStartOperationalAutoRefresh = portalStartOperationalAutoRefresh;
window.skuContourRollbackableEvents = skuContourRollbackableEvents;
window.skuPlanFactCreateNewSkuTasks = skuPlanFactCreateNewSkuTasks;
window.skuPlanFactBuildNewSkuTask = skuPlanFactBuildNewSkuTask;
window.skuPlanFactBuildModel = skuPlanFactBuildModel;
window.skuPlanFactKpiEligible = skuPlanFactKpiEligible;
window.skuPlanFactDisplayMetric = skuPlanFactDisplayMetric;
window.skuPlanFactContextForArticle = skuPlanFactContextForArticle;
window.skuPlanFactSetActiveContextFromElement = skuPlanFactSetActiveContextFromElement;
window.skuPlanFactExportRows = skuPlanFactExportRows;
window.skuPlanFactExportColumns = skuPlanFactExportColumns;
window.skuPlanFactQualityExportRows = skuPlanFactQualityExportRows;
window.skuPlanFactQualityExportColumns = skuPlanFactQualityExportColumns;
window.skuPlanFactRowsFromReviewFile = skuPlanFactRowsFromReviewFile;
window.skuPlanFactPrepareAliasImport = skuPlanFactPrepareAliasImport;
window.SKU_PLAN_FACT_PLATFORMS = SKU_PLAN_FACT_PLATFORMS;
window.SKU_PLAN_FACT_PLATFORM_LABELS = SKU_PLAN_FACT_PLATFORM_LABELS;
window.SKU_PLAN_FACT_PLATFORM_SUPPORT_KEYS = SKU_PLAN_FACT_PLATFORM_SUPPORT_KEYS;
