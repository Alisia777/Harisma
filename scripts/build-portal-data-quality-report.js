#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_ISSUE_LIMIT = 250;
const PLATFORM_LABELS = {
  wb: 'WB',
  ozon: 'Ozon',
  ya: 'Я.Маркет',
  goldapple: 'ЗЯ',
  letu: 'Лэтуаль',
  magnit: 'Магнит Маркет'
};

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const hasValue = inlineValue !== undefined || (argv[index + 1] && !String(argv[index + 1]).startsWith('--'));
    if (!hasValue) {
      args[key] = true;
      continue;
    }
    args[key] = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return args;
}

function resolveOptions(args) {
  const root = process.cwd();
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    mirrorLocalFallback: Boolean(args['mirror-local-fallback']),
    issueLimit: Math.max(20, Math.min(1000, Number(args['issue-limit'] || DEFAULT_ISSUE_LIMIT)))
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readSnapshot(options, name, fallback = null) {
  return readJsonIfExists(path.join(options.inputDir, `${name}.json`))
    ?? readJsonIfExists(path.join(options.baseDataDir, `${name}.json`))
    ?? fallback;
}

function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dateKey(value) {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function monthKeyFromDate(value) {
  const raw = dateKey(value);
  return raw ? raw.slice(0, 7) : '';
}

function parseDateStamp(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const stamp = Date.parse(normalized);
  return Number.isFinite(stamp) ? stamp : 0;
}

function daysBetween(older, newer) {
  const olderStamp = parseDateStamp(older);
  const newerStamp = parseDateStamp(newer);
  if (!olderStamp || !newerStamp || newerStamp <= olderStamp) return 0;
  return Math.round((newerStamp - olderStamp) / 86400000);
}

function latestDate(values) {
  return (values || []).map(dateKey).filter(Boolean).sort().pop() || '';
}

function platformKey(value) {
  const raw = normalizeToken(value);
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['oz', 'ozon'].includes(raw)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'yandexmarket', 'ямаркет'].includes(raw)) return 'ya';
  if (['ga', 'goldapple', 'зя', 'золотоеяблоко'].includes(raw)) return 'goldapple';
  if (['letu', 'letual', 'летуаль'].includes(raw)) return 'letu';
  if (['mm', 'magnit', 'magnitmarket', 'магнитмаркет'].includes(raw)) return 'magnit';
  return raw;
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
  return values.map(normalizeToken).filter(Boolean);
}

function buildKnownSkuSet(skus = []) {
  const set = new Set();
  skus.forEach((sku) => skuLookupTokens(sku).forEach((token) => set.add(token)));
  return set;
}

function ownerText(sku = {}) {
  if (typeof sku.owner === 'string') return sku.owner.trim();
  return String(sku.owner?.name || '').trim();
}

function extraPlatformRows(platformPayload = {}) {
  const raw = platformPayload.articles || platformPayload.rows || [];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([key, row]) => ({ articleKey: row?.articleKey || row?.article || key, ...(row || {}) }));
  }
  return [];
}

function rowMonthFact(row = {}, monthKey = '', maxDate = '') {
  const daily = Array.isArray(row.daily) ? row.daily : [];
  return daily.reduce((acc, point) => {
    const currentDate = dateKey(point?.date || point?.label);
    if (!currentDate || !currentDate.startsWith(monthKey)) return acc;
    if (maxDate && currentDate > maxDate) return acc;
    acc.revenue += numberOrZero(point.revenue ?? point.ordersRevenue ?? point.factRevenue);
    acc.units += numberOrZero(point.units ?? point.ordersUnits ?? point.factUnits);
    if (!acc.firstDate || currentDate < acc.firstDate) acc.firstDate = currentDate;
    if (!acc.lastDate || currentDate > acc.lastDate) acc.lastDate = currentDate;
    return acc;
  }, { revenue: 0, units: 0, firstDate: '', lastDate: '' });
}

function platformMonthAggregate(platformTrends = {}, platform = '', monthKey = '', maxDate = '') {
  const item = (platformTrends.platforms || []).find((row) => platformKey(row?.key || row?.platform || row?.label) === platform);
  const series = Array.isArray(item?.series) ? item.series : [];
  return series.reduce((acc, point) => {
    const currentDate = dateKey(point?.date || point?.label);
    if (!currentDate || !currentDate.startsWith(monthKey)) return acc;
    if (maxDate && currentDate > maxDate) return acc;
    acc.date = !acc.date || currentDate > acc.date ? currentDate : acc.date;
    acc.revenue += numberOrZero(point?.revenue);
    acc.units += numberOrZero(point?.units);
    return acc;
  }, { date: '', revenue: 0, units: 0 });
}

function buildApiSkuQuality(platformTrends = {}, skus = [], monthKey = '', maxDate = '') {
  const known = buildKnownSkuSet(skus);
  const issues = [];
  const platformSummary = {};

  Object.entries(platformTrends.extraMarketplace?.platforms || {}).forEach(([rawPlatform, payload]) => {
    const platform = platformKey(rawPlatform);
    if (!platform) return;
    const rows = extraPlatformRows(payload);
    const aggregate = platformMonthAggregate(platformTrends, platform, monthKey, maxDate);
    let directRevenue = 0;
    let directUnits = 0;
    let unmappedRevenue = 0;
    let unmappedUnits = 0;
    let unmappedCount = 0;

    rows.forEach((row) => {
      const articleKey = String(row?.articleKey || row?.article || row?.sku || '').trim();
      const token = normalizeToken(articleKey);
      if (!token) return;
      const fact = rowMonthFact(row, monthKey, maxDate);
      if (fact.revenue <= 0 && fact.units <= 0) return;
      directRevenue += fact.revenue;
      directUnits += fact.units;
      if (!known.has(token)) {
        unmappedCount += 1;
        unmappedRevenue += fact.revenue;
        unmappedUnits += fact.units;
        issues.push({
          severity: fact.revenue >= 100000 ? 'critical' : 'warning',
          type: 'api_sku_unmapped',
          dataset: 'platform_trends.extraMarketplace',
          platform,
          platformLabel: PLATFORM_LABELS[platform] || platform,
          articleKey,
          name: row?.name || row?.article || articleKey,
          revenue: Math.round(fact.revenue),
          units: Math.round(fact.units),
          firstDate: fact.firstDate,
          lastDate: fact.lastDate,
          message: 'API SKU не найден в skus.json/алиасах'
        });
      }
    });

    const overage = aggregate.revenue > 0 ? directRevenue - aggregate.revenue : 0;
    if (aggregate.revenue > 0 && directRevenue > aggregate.revenue * 1.15 && overage > 10000) {
      issues.push({
        severity: 'critical',
        type: 'api_sum_above_aggregate',
        dataset: 'platform_trends',
        platform,
        platformLabel: PLATFORM_LABELS[platform] || platform,
        revenue: Math.round(directRevenue),
        aggregateRevenue: Math.round(aggregate.revenue),
        overage: Math.round(overage),
        message: 'Сумма SKU по API выше агрегата площадки'
      });
    }

    platformSummary[platform] = {
      label: PLATFORM_LABELS[platform] || platform,
      rows: rows.length,
      directRevenue: Math.round(directRevenue),
      directUnits: Math.round(directUnits),
      aggregateRevenue: Math.round(aggregate.revenue),
      aggregateDate: aggregate.date,
      unmappedCount,
      unmappedRevenue: Math.round(unmappedRevenue),
      unmappedUnits: Math.round(unmappedUnits)
    };
  });

  return { issues, platformSummary };
}

function buildOrderQuality(orderProcurement = {}) {
  const rows = Array.isArray(orderProcurement.rows) ? orderProcurement.rows : [];
  const issues = [];
  const summary = {
    rows: rows.length,
    noStockNeedRows: 0,
    lowTurnoverRows: 0,
    totalNeed7: 0,
    totalNeed14: 0,
    totalNeed28: 0
  };

  rows.forEach((row) => {
    const stock = numberOrZero(row?.inStock);
    const need7 = numberOrZero(row?.targetNeed7);
    const need14 = numberOrZero(row?.targetNeed14);
    const need28 = numberOrZero(row?.targetNeed28);
    const turnover = Number(row?.turnoverDays);
    summary.totalNeed7 += need7;
    summary.totalNeed14 += need14;
    summary.totalNeed28 += need28;
    if (stock <= 0 && (need7 > 0 || need14 > 0 || need28 > 0 || numberOrZero(row?.sales7) > 0)) {
      summary.noStockNeedRows += 1;
      issues.push({
        severity: 'critical',
        type: 'order_no_stock_need',
        dataset: 'order_procurement',
        platform: platformKey(row?.platform),
        place: row?.place || '',
        articleKey: row?.article || '',
        name: row?.name || row?.article || '',
        need7,
        need14,
        need28,
        message: 'По складу нет остатка, но есть продажи/потребность'
      });
    } else if (Number.isFinite(turnover) && turnover > 0 && turnover <= 10) {
      summary.lowTurnoverRows += 1;
    }
  });

  summary.totalNeed7 = Math.round(summary.totalNeed7);
  summary.totalNeed14 = Math.round(summary.totalNeed14);
  summary.totalNeed28 = Math.round(summary.totalNeed28);
  return { issues, summary };
}

function buildFreshnessQuality(files = {}) {
  const freshness = [
    {
      dataset: 'dashboard',
      asOfDate: dateKey(files.dashboard?.dataFreshness?.asOfDate || files.dashboard?.latestMarketplaceDate),
      generatedAt: files.dashboard?.generatedAt || '',
      rows: Array.isArray(files.dashboard?.cards) ? files.dashboard.cards.length : 0
    },
    {
      dataset: 'platform_trends',
      asOfDate: dateKey(files.platformTrends?.latestMarketplaceDate),
      generatedAt: files.platformTrends?.generatedAt || '',
      rows: Array.isArray(files.platformTrends?.platforms) ? files.platformTrends.platforms.length : 0
    },
    {
      dataset: 'order_procurement',
      asOfDate: dateKey(files.orderProcurement?.window?.to),
      generatedAt: files.orderProcurement?.generatedAt || '',
      rows: Array.isArray(files.orderProcurement?.rows) ? files.orderProcurement.rows.length : 0
    },
    {
      dataset: 'warehouse_stock_overlay',
      asOfDate: dateKey(files.warehouse?.generatedAt),
      generatedAt: files.warehouse?.generatedAt || '',
      rows: Array.isArray(files.warehouse?.rows) ? files.warehouse.rows.length : 0,
      matchedRows: files.warehouse?.matchedRowCount || files.warehouse?.matchedSkuCount || 0,
      unmatchedRows: Array.isArray(files.warehouse?.unmatchedSourceKeys) ? files.warehouse.unmatchedSourceKeys.length : 0
    },
    {
      dataset: 'ads_summary',
      asOfDate: dateKey(files.adsSummary?.asOfDate || files.adsSummary?.window?.to),
      generatedAt: files.adsSummary?.generatedAt || '',
      rows: Array.isArray(files.adsSummary?.platforms) ? files.adsSummary.platforms.length : 0
    },
    {
      dataset: 'iu_drr_summary',
      asOfDate: dateKey(files.iuDrr?.asOfDate || files.iuDrr?.window?.to),
      generatedAt: files.iuDrr?.generatedAt || '',
      rows: Array.isArray(files.iuDrr?.daily) ? files.iuDrr.daily.length : 0
    }
  ];
  const referenceDate = latestDate(freshness.map((row) => row.asOfDate));
  const issues = [];
  freshness.forEach((row) => {
    const lagDays = daysBetween(row.asOfDate, referenceDate);
    row.referenceDate = referenceDate;
    row.lagDays = lagDays;
    row.status = !row.asOfDate || lagDays > 1 ? 'warning' : 'ok';
    if (row.status !== 'ok') {
      issues.push({
        severity: 'warning',
        type: 'dataset_stale_or_empty',
        dataset: row.dataset,
        asOfDate: row.asOfDate,
        referenceDate,
        lagDays,
        message: row.asOfDate ? `Данные отстают на ${lagDays} дн.` : 'Не найдена дата свежести'
      });
    }
  });
  return { freshness, issues, referenceDate };
}

function buildOwnerQuality(skus = []) {
  const issues = [];
  let missingOwner = 0;
  skus.forEach((sku) => {
    const owner = ownerText(sku);
    if (!owner || /^не в реестре$/i.test(owner)) {
      missingOwner += 1;
      issues.push({
        severity: 'warning',
        type: 'sku_missing_owner',
        dataset: 'skus',
        articleKey: sku?.articleKey || sku?.article || '',
        name: sku?.name || sku?.article || '',
        message: owner ? 'SKU помечен как не в реестре' : 'SKU без owner'
      });
    }
  });
  return { issues, summary: { totalSku: skus.length, missingOwner } };
}

function buildWarehouseQuality(warehouse = {}) {
  const unmatched = Array.isArray(warehouse?.unmatchedSourceKeys) ? warehouse.unmatchedSourceKeys : [];
  return {
    issues: unmatched.slice(0, 100).map((key) => ({
      severity: 'warning',
      type: 'warehouse_unmatched_source_key',
      dataset: 'warehouse_stock_overlay',
      articleKey: String(key || ''),
      message: 'Строка складского файла не сопоставилась с SKU'
    })),
    summary: {
      sourceRows: numberOrZero(warehouse?.sheetRowCount),
      matchedRows: numberOrZero(warehouse?.matchedRowCount || warehouse?.matchedSkuCount),
      unmatchedRows: unmatched.length
    }
  };
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function writeCsv(filePath, issues = []) {
  const columns = ['severity', 'type', 'dataset', 'platform', 'place', 'articleKey', 'name', 'revenue', 'units', 'message'];
  const lines = [
    `\uFEFF${columns.join(';')}`,
    ...issues.map((issue) => columns.map((column) => csvCell(issue[column])).join(';'))
  ];
  fs.writeFileSync(filePath, lines.join('\r\n'), 'utf8');
}

function skuSuggestionScore(apiSku = '', sku = {}) {
  const apiToken = normalizeToken(apiSku);
  if (!apiToken) return 0;
  const skuTokens = skuLookupTokens(sku);
  if (skuTokens.includes(apiToken)) return 100;
  const articleToken = normalizeToken(sku?.articleKey || sku?.article || '');
  const nameToken = normalizeToken(sku?.name || '');
  if (articleToken && apiToken.length >= 5 && (articleToken.includes(apiToken) || apiToken.includes(articleToken))) return 80;

  const parts = String(apiSku || '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .split(/[^a-zа-я0-9]+/gi)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && !/^\d+$/.test(part));
  if (!parts.length) return 0;
  const hits = parts.filter((part) => {
    const token = normalizeToken(part);
    return token && (articleToken.includes(token) || nameToken.includes(token));
  }).length;
  return Math.min(70, hits * 20);
}

function buildSkuSuggestion(skus = [], apiSku = '') {
  return skus
    .map((sku) => ({
      articleKey: sku?.articleKey || sku?.article || '',
      name: sku?.name || '',
      score: skuSuggestionScore(apiSku, sku)
    }))
    .filter((item) => item.articleKey && item.score >= 70)
    .sort((a, b) => b.score - a.score || String(a.articleKey).localeCompare(String(b.articleKey)))[0]
    || { articleKey: '', name: '', score: 0 };
}

function writeAliasReviewCsv(filePath, issues = [], skus = []) {
  const grouped = new Map();
  issues
    .filter((issue) => issue.type === 'api_sku_unmapped')
    .forEach((issue) => {
      const key = `${issue.platform || ''}|${issue.articleKey || ''}`;
      const current = grouped.get(key) || {
        action: '',
        target_sku: '',
        platform: issue.platform || '',
        api_sku: issue.articleKey || '',
        status: 'active',
        note: 'API SKU without registry pair',
        api_revenue: 0,
        api_units: 0,
        api_name: issue.name || issue.articleKey || '',
        all_platforms: new Set(),
        first_date: issue.firstDate || '',
        last_date: issue.lastDate || ''
      };
      current.api_revenue += numberOrZero(issue.revenue);
      current.api_units += numberOrZero(issue.units);
      if (issue.platform) current.all_platforms.add(issue.platform);
      if (issue.firstDate && (!current.first_date || issue.firstDate < current.first_date)) current.first_date = issue.firstDate;
      if (issue.lastDate && (!current.last_date || issue.lastDate > current.last_date)) current.last_date = issue.lastDate;
      grouped.set(key, current);
    });

  const rows = [...grouped.values()]
    .sort((a, b) => numberOrZero(b.api_revenue) - numberOrZero(a.api_revenue))
    .map((row) => {
      const suggestion = buildSkuSuggestion(skus, row.api_sku);
      return {
        ...row,
        api_revenue: Math.round(row.api_revenue),
        api_units: Math.round(row.api_units),
        all_platforms: [...row.all_platforms].join(','),
        suggested_target_sku: suggestion.articleKey,
        suggested_confidence: suggestion.score || '',
        suggested_name: suggestion.name || '',
        decision_comment: ''
      };
    });

  const columns = [
    'action',
    'target_sku',
    'platform',
    'api_sku',
    'status',
    'note',
    'api_revenue',
    'api_units',
    'api_name',
    'all_platforms',
    'first_date',
    'last_date',
    'suggested_target_sku',
    'suggested_confidence',
    'suggested_name',
    'decision_comment'
  ];
  const lines = [
    `\uFEFF${columns.join(';')}`,
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(';'))
  ];
  fs.writeFileSync(filePath, lines.join('\r\n'), 'utf8');
  return rows.length;
}

function buildReport(options) {
  const files = {
    dashboard: readSnapshot(options, 'dashboard', {}),
    skus: readSnapshot(options, 'skus', []),
    platformTrends: readSnapshot(options, 'platform_trends', {}),
    orderProcurement: readSnapshot(options, 'order_procurement', {}),
    warehouse: readSnapshot(options, 'warehouse_stock_overlay', {}),
    adsSummary: readSnapshot(options, 'ads_summary', {}),
    iuDrr: readSnapshot(options, 'iu_drr_summary', {})
  };

  const maxDate = dateKey(files.platformTrends?.latestMarketplaceDate)
    || latestDate((files.platformTrends?.platforms || []).flatMap((platform) => (platform.series || []).map((point) => point.date || point.label)));
  const monthKey = monthKeyFromDate(maxDate);
  const apiQuality = buildApiSkuQuality(files.platformTrends, Array.isArray(files.skus) ? files.skus : [], monthKey, maxDate);
  const orderQuality = buildOrderQuality(files.orderProcurement);
  const freshnessQuality = buildFreshnessQuality(files);
  const ownerQuality = buildOwnerQuality(Array.isArray(files.skus) ? files.skus : []);
  const warehouseQuality = buildWarehouseQuality(files.warehouse);

  const allIssues = [
    ...apiQuality.issues,
    ...orderQuality.issues,
    ...freshnessQuality.issues,
    ...ownerQuality.issues,
    ...warehouseQuality.issues
  ].sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 };
    return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || numberOrZero(b.revenue) - numberOrZero(a.revenue);
  });

  const apiUnmappedIssues = apiQuality.issues.filter((issue) => issue.type === 'api_sku_unmapped');
  const summary = {
    issueCount: allIssues.length,
    criticalCount: allIssues.filter((issue) => issue.severity === 'critical').length,
    warningCount: allIssues.filter((issue) => issue.severity === 'warning').length,
    monthKey,
    maxDate,
    apiUnmappedPlatformRows: apiUnmappedIssues.length,
    apiUnmappedUniqueSku: new Set(apiUnmappedIssues.map((issue) => normalizeToken(issue.articleKey))).size,
    apiUnmappedRevenue: Math.round(apiUnmappedIssues.reduce((acc, issue) => acc + numberOrZero(issue.revenue), 0)),
    orderNoStockNeedRows: orderQuality.summary.noStockNeedRows,
    skuMissingOwner: ownerQuality.summary.missingOwner,
    warehouseUnmatchedRows: warehouseQuality.summary.unmatchedRows
  };

  return {
    generatedAt: new Date().toISOString(),
    status: summary.criticalCount ? 'critical' : (summary.warningCount ? 'warning' : 'ok'),
    summary,
    freshness: freshnessQuality.freshness,
    platformSummary: apiQuality.platformSummary,
    orderSummary: orderQuality.summary,
    ownerSummary: ownerQuality.summary,
    warehouseSummary: warehouseQuality.summary,
    _sourceSkus: Array.isArray(files.skus) ? files.skus : [],
    issues: allIssues.slice(0, options.issueLimit)
  };
}

function writeReport(options, report) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const jsonPath = path.join(options.outputDir, 'portal_data_quality.json');
  const csvPath = path.join(options.outputDir, 'portal_data_quality_issues.csv');
  const aliasReviewPath = path.join(options.outputDir, 'api_sku_alias_review.csv');
  const { _sourceSkus, ...publicReport } = report;
  fs.writeFileSync(jsonPath, JSON.stringify(publicReport, null, 2), 'utf8');
  writeCsv(csvPath, report.issues || []);
  const aliasReviewRows = writeAliasReviewCsv(aliasReviewPath, report.issues || [], _sourceSkus || []);

  const mirrored = [];
  if (options.mirrorLocalFallback) {
    fs.mkdirSync(options.baseDataDir, { recursive: true });
    const mirrorJson = path.join(options.baseDataDir, 'portal_data_quality.json');
    const mirrorCsv = path.join(options.baseDataDir, 'portal_data_quality_issues.csv');
    const mirrorAliasReview = path.join(options.baseDataDir, 'api_sku_alias_review.csv');
    fs.copyFileSync(jsonPath, mirrorJson);
    fs.copyFileSync(csvPath, mirrorCsv);
    fs.copyFileSync(aliasReviewPath, mirrorAliasReview);
    mirrored.push(mirrorJson, mirrorCsv, mirrorAliasReview);
  }

  return { jsonPath, csvPath, aliasReviewPath, aliasReviewRows, mirrored };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const report = buildReport(options);
  const written = writeReport(options, report);
  console.log(JSON.stringify({
    status: report.status,
    summary: report.summary,
    output: written
  }, null, 2));
}

main();
