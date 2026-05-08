const SKU_PLAN_FACT_PLATFORMS = ['wb', 'ozon'];
const SKU_PLAN_FACT_PLATFORM_LABELS = { wb: 'WB', ozon: 'Ozon' };

function skuPlanFactFilters() {
  state.skuPlanFactFilters = {
    search: '',
    owner: 'all',
    status: 'active',
    platform: 'all',
    month: 'latest',
    sort: 'gap',
    ...(state.skuPlanFactFilters || {})
  };
  return state.skuPlanFactFilters;
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

function skuPlanFactRowsForPlatform(payload = {}, platform = '') {
  const rawRows = payload?.platforms?.[platform]?.rows;
  if (Array.isArray(rawRows)) return rawRows;
  if (rawRows && typeof rawRows === 'object') {
    return Object.entries(rawRows).map(([key, row]) => ({
      articleKey: row?.articleKey || key,
      article: row?.article || key,
      ...(row || {})
    }));
  }
  return [];
}

function skuPlanFactToken(value = '') {
  if (typeof skuLookupToken === 'function') return skuLookupToken(value);
  return String(value ?? '').trim().toLowerCase().replaceAll('ё', 'е').replace(/[^a-zа-я0-9]+/gi, '');
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

function skuPlanFactBuildIndexes() {
  const smart = {};
  const overlay = {};
  const support = {};
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    smart[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.smartPriceWorkbench || {}, platform));
    overlay[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.smartPriceOverlay || {}, platform));
    support[platform] = skuPlanFactIndexRows(skuPlanFactRowsForPlatform(state.priceWorkbenchSupport || {}, platform));
  });
  return { smart, overlay, support };
}

function skuPlanFactAvailableMonths(indexes) {
  const months = new Set();
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    [indexes.smart?.[platform], indexes.overlay?.[platform], indexes.support?.[platform]].forEach((map) => {
      (map ? [...map.values()].flat() : []).forEach((row) => {
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
  (state.iuDrrSummary?.daily || []).forEach((item) => {
    const monthKey = skuPlanFactMonthFromDate(item?.date);
    if (monthKey) months.add(monthKey);
  });
  return [...months].filter(Boolean).sort().reverse();
}

function skuPlanFactLatestMonth(months = []) {
  const sourceMonth = skuPlanFactMonthFromDate(
    state.smartPriceOverlay?.asOfDate
    || state.adsSummary?.asOfDate
    || state.iuDrrSummary?.asOfDate
    || todayIso()
  );
  return months.includes(sourceMonth) ? sourceMonth : (months[0] || sourceMonth || todayIso().slice(0, 7));
}

function skuPlanFactSelectedMonth(months = []) {
  const filters = skuPlanFactFilters();
  if (filters.month && filters.month !== 'latest' && months.includes(filters.month)) return filters.month;
  return skuPlanFactLatestMonth(months);
}

function skuPlanFactMaxFactDate(indexes, monthKey) {
  let maxDate = '';
  SKU_PLAN_FACT_PLATFORMS.forEach((platform) => {
    [indexes.overlay?.[platform], indexes.smart?.[platform]].forEach((map) => {
      (map ? [...map.values()].flat() : []).forEach((row) => {
        (row.daily || row.monthly || []).forEach((item) => {
          const date = String(item?.date || '').slice(0, 10);
          if (date.slice(0, 7) === monthKey && date > maxDate) maxDate = date;
        });
      });
    });
  });
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    const date = String(item?.date || '').slice(0, 10);
    if (date.slice(0, 7) === monthKey && date > maxDate) maxDate = date;
  });
  return maxDate || `${monthKey}-${String(skuPlanFactMonthDays(monthKey)).padStart(2, '0')}`;
}

function skuPlanFactElapsedDays(monthKey, maxFactDate) {
  const days = skuPlanFactMonthDays(monthKey);
  const factMonth = skuPlanFactMonthFromDate(maxFactDate);
  if (factMonth === monthKey) return Math.min(days, Math.max(1, Number(String(maxFactDate).slice(8, 10)) || 1));
  return days;
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

function skuPlanFactFactFromRows(rows = [], monthKey = '') {
  const result = { units: 0, revenue: 0, avgCheck: null, source: '' };
  const seenDaily = new Set();
  rows.forEach((row, rowIndex) => {
    const daily = [...(row.daily || []), ...(row.monthly || [])];
    daily.forEach((item, itemIndex) => {
      const date = String(item?.date || '').slice(0, 10);
      if (date.slice(0, 7) !== monthKey) return;
      const dedupeKey = `${row.articleKey || row.article || rowIndex}|${date}|${itemIndex}|${item.revenue}|${item.ordersUnits}`;
      if (seenDaily.has(dedupeKey)) return;
      seenDaily.add(dedupeKey);
      const units = numberOrZero(item.ordersUnits ?? item.deliveredUnits);
      const revenue = numberOrZero(item.revenue);
      result.units += units;
      result.revenue += revenue;
    });
    (row.actualMonths || []).forEach((item) => {
      if (String(item?.monthKey || '').slice(0, 7) !== monthKey) return;
      if (result.revenue > 0 || result.units > 0) return;
      result.units += numberOrZero(item.units);
      result.revenue += numberOrZero(item.revenue);
      if (!result.source && item.source) result.source = item.source;
    });
    if (!result.source && row.sourceMode) result.source = row.sourceMode;
  });
  result.avgCheck = result.units > 0 ? result.revenue / result.units : null;
  return result;
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

function skuPlanFactAdIndex(monthKey) {
  const map = new Map();
  (state.adsSummary?.itemSeries || []).forEach((item) => {
    if (skuPlanFactMonthFromDate(item?.date) !== monthKey) return;
    const platform = String(item.platformKey || item.platform || 'wb').toLowerCase();
    const token = skuPlanFactArticleToken(item);
    if (!token) return;
    const key = `${platform}|${token}`;
    const row = map.get(key) || { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
    row.spend += numberOrZero(item.spend);
    row.views += numberOrZero(item.views);
    row.clicks += numberOrZero(item.clicks);
    row.orders += numberOrZero(item.orders);
    row.revenue += numberOrZero(item.revenue);
    map.set(key, row);
  });
  return map;
}

function skuPlanFactPlatformMetrics(sku, platform, monthKey, indexes, adIndex, elapsedDays) {
  const token = skuPlanFactArticleToken(sku);
  const smartRows = indexes.smart?.[platform]?.get(token) || [];
  const overlayRows = indexes.overlay?.[platform]?.get(token) || [];
  const supportRows = indexes.support?.[platform]?.get(token) || [];
  const sourceRows = overlayRows.length ? overlayRows : smartRows;
  const planRows = skuPlanFactRowsHavePlan(supportRows, monthKey) ? supportRows : smartRows;
  const factRows = skuPlanFactRowsHaveFact(overlayRows, monthKey)
    ? overlayRows
    : (skuPlanFactRowsHaveFact(smartRows, monthKey) ? smartRows : supportRows);
  const plan = skuPlanFactPlanFromRows(planRows, monthKey);
  const fact = skuPlanFactFactFromRows(factRows, monthKey);
  const ad = adIndex.get(`${platform}|${token}`) || { spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0 };
  const planToDateRevenue = plan.revenue > 0 ? plan.revenue * elapsedDays / Math.max(1, plan.days) : 0;
  const planToDateUnits = plan.units > 0 ? plan.units * elapsedDays / Math.max(1, plan.days) : 0;
  const fallbackSide = sku?.[platform] || {};
  const turnoverDays = skuPlanFactLatestMetric(sourceRows, ['turnoverCurrentDays', 'turnoverDays'])
    ?? (Number.isFinite(Number(fallbackSide.turnoverDays)) ? Number(fallbackSide.turnoverDays) : null);
  const stock = skuPlanFactLatestMetric(sourceRows, ['stock', 'stockRepricer'])
    ?? (Number.isFinite(Number(fallbackSide.stock)) ? Number(fallbackSide.stock) : null);
  const marginPct = skuPlanFactLatestMetric(sourceRows, ['avgMargin7dPct', 'marginTotalPct', 'marginPct'])
    ?? (Number.isFinite(Number(fallbackSide.marginPct)) ? Number(fallbackSide.marginPct) : null);

  return {
    platform,
    planUnits: plan.units,
    planRevenue: plan.revenue,
    planAvgCheck: plan.avgCheck,
    planToDateUnits,
    planToDateRevenue,
    factUnits: fact.units,
    factRevenue: fact.revenue,
    factAvgCheck: fact.avgCheck,
    completionToDate: planToDateRevenue > 0 ? fact.revenue / planToDateRevenue : null,
    completionMonth: plan.revenue > 0 ? fact.revenue / plan.revenue : null,
    gapToDate: fact.revenue - planToDateRevenue,
    adSpend: ad.spend,
    adViews: ad.views,
    adClicks: ad.clicks,
    adOrders: ad.orders,
    adRevenue: ad.revenue,
    drr: fact.revenue > 0 ? ad.spend / fact.revenue : null,
    adsDrr: ad.revenue > 0 ? ad.spend / ad.revenue : null,
    turnoverDays,
    stock,
    marginPct,
    source: fact.source || plan.source || ''
  };
}

function skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays) {
  const wb = skuPlanFactPlatformMetrics(sku, 'wb', monthKey, indexes, adIndex, elapsedDays);
  const ozon = skuPlanFactPlatformMetrics(sku, 'ozon', monthKey, indexes, adIndex, elapsedDays);
  const planRevenue = wb.planRevenue + ozon.planRevenue;
  const planUnits = wb.planUnits + ozon.planUnits;
  const planToDateRevenue = wb.planToDateRevenue + ozon.planToDateRevenue;
  const factRevenue = wb.factRevenue + ozon.factRevenue;
  const factUnits = wb.factUnits + ozon.factUnits;
  const adSpend = wb.adSpend + ozon.adSpend;
  return {
    sku,
    articleKey: skuPrimaryKey(sku),
    article: sku.article || sku.articleKey || '',
    name: sku.name || '',
    owner: ownerName(sku) || 'Без owner',
    status: skuOperationalStatusMeta(sku).label,
    wb,
    ozon,
    planUnits,
    planRevenue,
    planToDateRevenue,
    factUnits,
    factRevenue,
    avgCheck: factUnits > 0 ? factRevenue / factUnits : null,
    completionToDate: planToDateRevenue > 0 ? factRevenue / planToDateRevenue : null,
    completionMonth: planRevenue > 0 ? factRevenue / planRevenue : null,
    gapToDate: factRevenue - planToDateRevenue,
    adSpend,
    drr: factRevenue > 0 ? adSpend / factRevenue : null,
    hasPlanOrFact: planRevenue > 0 || factRevenue > 0 || wb.adSpend > 0 || ozon.adSpend > 0
  };
}

function skuPlanFactSortRows(rows, sort) {
  const sorters = {
    gap: (a, b) => a.gapToDate - b.gapToDate,
    completion: (a, b) => numberOrZero(a.completionToDate ?? 9) - numberOrZero(b.completionToDate ?? 9),
    fact: (a, b) => b.factRevenue - a.factRevenue,
    plan: (a, b) => b.planRevenue - a.planRevenue,
    drr: (a, b) => numberOrZero(b.drr) - numberOrZero(a.drr),
    article: (a, b) => String(a.article).localeCompare(String(b.article), 'ru')
  };
  return [...rows].sort(sorters[sort] || sorters.gap);
}

function skuPlanFactBuildModel() {
  const filters = skuPlanFactFilters();
  const indexes = skuPlanFactBuildIndexes();
  const months = skuPlanFactAvailableMonths(indexes);
  const monthKey = skuPlanFactSelectedMonth(months);
  const maxFactDate = skuPlanFactMaxFactDate(indexes, monthKey);
  const elapsedDays = skuPlanFactElapsedDays(monthKey, maxFactDate);
  const adIndex = skuPlanFactAdIndex(monthKey);
  const rows = (state.skus || []).map((sku) => skuPlanFactBuildRow(sku, monthKey, indexes, adIndex, elapsedDays));
  const owners = [...new Set(rows.map((row) => row.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const search = String(filters.search || '').trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
    if (filters.status === 'active' && String(row.status || '').toLowerCase().includes('вывод')) return false;
    if (filters.status === 'with_plan' && row.planRevenue <= 0) return false;
    if (filters.status === 'under_plan' && !(row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue)) return false;
    if (filters.status === 'no_fact' && !(row.planRevenue > 0 && row.factRevenue <= 0)) return false;
    if (filters.platform === 'wb' && !(row.wb.planRevenue > 0 || row.wb.factRevenue > 0 || row.wb.adSpend > 0)) return false;
    if (filters.platform === 'ozon' && !(row.ozon.planRevenue > 0 || row.ozon.factRevenue > 0 || row.ozon.adSpend > 0)) return false;
    if (!search) return true;
    return [row.articleKey, row.article, row.name, row.owner, row.status]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search);
  });
  const sortedRows = skuPlanFactSortRows(filteredRows, filters.sort);
  const totals = sortedRows.reduce((acc, row) => {
    acc.planRevenue += row.planRevenue;
    acc.planToDateRevenue += row.planToDateRevenue;
    acc.factRevenue += row.factRevenue;
    acc.planUnits += row.planUnits;
    acc.factUnits += row.factUnits;
    acc.adSpend += row.adSpend;
    if (row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue) acc.underPlan += 1;
    if (row.planRevenue > 0 && row.factRevenue <= 0) acc.noFact += 1;
    return acc;
  }, { planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, planUnits: 0, factUnits: 0, adSpend: 0, underPlan: 0, noFact: 0 });
  totals.completionToDate = totals.planToDateRevenue > 0 ? totals.factRevenue / totals.planToDateRevenue : null;
  totals.completionMonth = totals.planRevenue > 0 ? totals.factRevenue / totals.planRevenue : null;
  totals.gapToDate = totals.factRevenue - totals.planToDateRevenue;
  totals.avgCheck = totals.factUnits > 0 ? totals.factRevenue / totals.factUnits : null;
  totals.drr = totals.factRevenue > 0 ? totals.adSpend / totals.factRevenue : null;
  return {
    filters,
    months,
    monthKey,
    monthLabel: skuPlanFactMonthLabel(monthKey),
    maxFactDate,
    elapsedDays,
    rows: sortedRows,
    allRows: rows,
    owners,
    totals,
    planDrrWb: Number.isFinite(Number(state.iuDrrSummary?.planPctDefault)) ? Number(state.iuDrrSummary.planPctDefault) : 0.08,
    planDrrOzon: Number.isFinite(Number(state.iuDrrSummary?.ozonPlanPctDefault)) ? Number(state.iuDrrSummary.ozonPlanPctDefault) : 0.25
  };
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

function skuPlanFactPlatformCell(metric, planDrr = null) {
  const drrTone = metric.drr !== null && planDrr !== null && metric.drr > planDrr ? 'danger-text' : '';
  return `
    <div><strong>${fmt.money(metric.factRevenue)}</strong> <span class="muted small">/ ${fmt.money(metric.planToDateRevenue)}</span></div>
    <div class="muted small">${fmt.int(metric.factUnits)} шт. / план ${fmt.int(metric.planToDateUnits)} шт.</div>
    <div class="badge-stack" style="margin-top:6px">
      ${badge(fmt.pct(metric.completionToDate), skuPlanFactTone(metric.completionToDate))}
      ${metric.drr !== null ? `<span class="chip ${drrTone ? 'danger' : ''}">ДРР ${fmt.pct(metric.drr)}</span>` : ''}
    </div>
  `;
}

function skuPlanFactRowHtml(row, model) {
  const totalTone = skuPlanFactTone(row.completionToDate);
  return `
    <tr class="sku-plan-fact-row" data-open-sku="${escapeHtml(row.articleKey)}">
      <td>${linkToSku(row.articleKey, row.article || row.articleKey)}<div class="muted small">${escapeHtml(row.name)}</div></td>
      <td><strong>${escapeHtml(row.owner)}</strong><div class="muted small">${escapeHtml(row.status)}</div></td>
      <td>${skuPlanFactPlatformCell(row.wb, model.planDrrWb)}</td>
      <td>${skuPlanFactPlatformCell(row.ozon, model.planDrrOzon)}</td>
      <td>
        <strong>${fmt.money(row.factRevenue)}</strong>
        <div class="muted small">план к дате ${fmt.money(row.planToDateRevenue)}</div>
        <div class="badge-stack" style="margin-top:6px">${badge(fmt.pct(row.completionToDate), totalTone)}<span class="chip ${row.gapToDate < 0 ? 'danger' : 'ok'}">${fmt.money(row.gapToDate)}</span></div>
      </td>
      <td>
        <div>WB: <strong>${fmt.money(row.wb.factAvgCheck)}</strong> <span class="muted small">план ${fmt.money(row.wb.planAvgCheck)}</span></div>
        <div>Ozon: <strong>${fmt.money(row.ozon.factAvgCheck)}</strong> <span class="muted small">план ${fmt.money(row.ozon.planAvgCheck)}</span></div>
      </td>
      <td>
        <div>WB: <strong>${fmt.num(row.wb.turnoverDays, 1)}</strong> дн. <span class="muted small">${fmt.int(row.wb.stock)} шт.</span></div>
        <div>Ozon: <strong>${fmt.num(row.ozon.turnoverDays, 1)}</strong> дн. <span class="muted small">${fmt.int(row.ozon.stock)} шт.</span></div>
      </td>
      <td>
        <strong>${fmt.money(row.adSpend)}</strong>
        <div class="muted small">WB ${fmt.money(row.wb.adSpend)} · Ozon ${fmt.money(row.ozon.adSpend)}</div>
        <div class="${row.drr !== null && row.drr > model.planDrrWb ? 'danger-text' : ''}">ДРР total ${fmt.pct(row.drr)}</div>
      </td>
    </tr>
  `;
}

function skuPlanFactExportRows(rows, model) {
  return rows.map((row) => ({
    month: model.monthKey,
    fact_to: model.maxFactDate,
    article_key: row.articleKey,
    article: row.article,
    name: row.name,
    owner: row.owner,
    status: row.status,
    plan_wb_revenue: Math.round(row.wb.planRevenue),
    plan_wb_to_date_revenue: Math.round(row.wb.planToDateRevenue),
    fact_wb_revenue: Math.round(row.wb.factRevenue),
    plan_wb_units: Math.round(row.wb.planUnits),
    fact_wb_units: Math.round(row.wb.factUnits),
    completion_wb_to_date_pct: row.wb.completionToDate === null ? '' : row.wb.completionToDate,
    avg_check_wb_fact: row.wb.factAvgCheck === null ? '' : Math.round(row.wb.factAvgCheck),
    avg_check_wb_plan: row.wb.planAvgCheck === null ? '' : Math.round(row.wb.planAvgCheck),
    drr_wb: row.wb.drr === null ? '' : row.wb.drr,
    ad_spend_wb: Math.round(row.wb.adSpend),
    turnover_wb_days: row.wb.turnoverDays === null ? '' : row.wb.turnoverDays,
    stock_wb: row.wb.stock === null ? '' : Math.round(row.wb.stock),
    plan_ozon_revenue: Math.round(row.ozon.planRevenue),
    plan_ozon_to_date_revenue: Math.round(row.ozon.planToDateRevenue),
    fact_ozon_revenue: Math.round(row.ozon.factRevenue),
    plan_ozon_units: Math.round(row.ozon.planUnits),
    fact_ozon_units: Math.round(row.ozon.factUnits),
    completion_ozon_to_date_pct: row.ozon.completionToDate === null ? '' : row.ozon.completionToDate,
    avg_check_ozon_fact: row.ozon.factAvgCheck === null ? '' : Math.round(row.ozon.factAvgCheck),
    avg_check_ozon_plan: row.ozon.planAvgCheck === null ? '' : Math.round(row.ozon.planAvgCheck),
    drr_ozon: row.ozon.drr === null ? '' : row.ozon.drr,
    ad_spend_ozon: Math.round(row.ozon.adSpend),
    turnover_ozon_days: row.ozon.turnoverDays === null ? '' : row.ozon.turnoverDays,
    stock_ozon: row.ozon.stock === null ? '' : Math.round(row.ozon.stock),
    plan_total_revenue: Math.round(row.planRevenue),
    plan_total_to_date_revenue: Math.round(row.planToDateRevenue),
    fact_total_revenue: Math.round(row.factRevenue),
    completion_total_to_date_pct: row.completionToDate === null ? '' : row.completionToDate,
    gap_total_to_date: Math.round(row.gapToDate),
    drr_total: row.drr === null ? '' : row.drr
  }));
}

function downloadSkuPlanFactExcel(model) {
  if (!model.rows.length) {
    window.alert('По текущим фильтрам нет строк для выгрузки.');
    return;
  }
  downloadLaunchesHtmlTable([
    ['month', 'Месяц'],
    ['fact_to', 'Факт по дату'],
    ['article_key', 'Article key'],
    ['article', 'Артикул'],
    ['name', 'Товар'],
    ['owner', 'Owner'],
    ['status', 'Статус'],
    ['plan_wb_revenue', 'План WB, ₽'],
    ['plan_wb_to_date_revenue', 'План WB к дате, ₽'],
    ['fact_wb_revenue', 'Факт WB, ₽'],
    ['plan_wb_units', 'План WB, шт'],
    ['fact_wb_units', 'Факт WB, шт'],
    ['completion_wb_to_date_pct', 'Выполнение WB к дате, %'],
    ['avg_check_wb_fact', 'Средний чек WB факт'],
    ['avg_check_wb_plan', 'Средний чек WB план'],
    ['drr_wb', 'ДРР WB'],
    ['ad_spend_wb', 'Реклама WB, ₽'],
    ['turnover_wb_days', 'Оборачиваемость WB, дн'],
    ['stock_wb', 'Остаток WB'],
    ['plan_ozon_revenue', 'План Ozon, ₽'],
    ['plan_ozon_to_date_revenue', 'План Ozon к дате, ₽'],
    ['fact_ozon_revenue', 'Факт Ozon, ₽'],
    ['plan_ozon_units', 'План Ozon, шт'],
    ['fact_ozon_units', 'Факт Ozon, шт'],
    ['completion_ozon_to_date_pct', 'Выполнение Ozon к дате, %'],
    ['avg_check_ozon_fact', 'Средний чек Ozon факт'],
    ['avg_check_ozon_plan', 'Средний чек Ozon план'],
    ['drr_ozon', 'ДРР Ozon'],
    ['ad_spend_ozon', 'Реклама Ozon, ₽'],
    ['turnover_ozon_days', 'Оборачиваемость Ozon, дн'],
    ['stock_ozon', 'Остаток Ozon'],
    ['plan_total_revenue', 'План всего, ₽'],
    ['plan_total_to_date_revenue', 'План всего к дате, ₽'],
    ['fact_total_revenue', 'Факт всего, ₽'],
    ['completion_total_to_date_pct', 'Выполнение всего к дате, %'],
    ['gap_total_to_date', 'Отклонение к дате, ₽'],
    ['drr_total', 'ДРР total']
  ], skuPlanFactExportRows(model.rows, model), `sku-plan-fact-${model.monthKey}.xls`);
}

function renderSkuPlanFact(rootId = 'view-sku-plan-fact') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const model = skuPlanFactBuildModel();
  const filters = model.filters;
  const totals = model.totals;
  const monthOptions = model.months.map((monthKey) => `<option value="${escapeHtml(monthKey)}" ${filters.month === monthKey ? 'selected' : ''}>${escapeHtml(skuPlanFactMonthLabel(monthKey))}</option>`).join('');
  const ownerOptions = model.owners.map((owner) => `<option value="${escapeHtml(owner)}" ${filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('');
  const rowsHtml = model.rows.length
    ? model.rows.map((row) => skuPlanFactRowHtml(row, model)).join('')
    : '<tr><td colspan="8"><div class="empty">По текущим фильтрам нет SKU.</div></td></tr>';

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>План-факт SKU</h2>
        <p>Все позиции в одном разрезе: план, факт, средний чек WB/Ozon, оборачиваемость, реклама и ДРР.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(model.rows.length)} SKU`, 'info')}
        ${badge(`факт до ${model.maxFactDate || '—'}`, 'ok')}
        ${badge(`план ДРР WB ${fmt.pct(model.planDrrWb)}`)}
      </div>
    </div>

    <div class="grid cards">
      ${skuPlanFactMetricHtml('Факт оборота', fmt.money(totals.factRevenue), `план к дате ${fmt.money(totals.planToDateRevenue)}`)}
      ${skuPlanFactMetricHtml('Выполнение к дате', fmt.pct(totals.completionToDate), `месячный план: ${fmt.pct(totals.completionMonth)}`, skuPlanFactDeltaClass(totals.completionToDate - 1))}
      ${skuPlanFactMetricHtml('Отклонение к дате', fmt.money(totals.gapToDate), `${fmt.int(totals.underPlan)} SKU ниже плана`, skuPlanFactDeltaClass(totals.gapToDate))}
      ${skuPlanFactMetricHtml('Средний чек', fmt.money(totals.avgCheck), `${fmt.int(totals.factUnits)} шт. факт`)}
      ${skuPlanFactMetricHtml('Реклама / ДРР', `${fmt.money(totals.adSpend)} · ${fmt.pct(totals.drr)}`, 'по SKU из ads_summary')}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Таблица по позициям</h3>
          <p class="small muted">План берём из ценового планового слоя, факт WB/Ozon из ежедневного marketplace-среза, рекламу из API/таблицы рекламы.</p>
        </div>
        <div class="badge-stack">
          <button class="quick-chip" type="button" data-sku-plan-fact-export>Выгрузить в Excel</button>
        </div>
      </div>
      <div class="control-filters sku-plan-fact-filters">
        <input id="skuPlanFactSearch" placeholder="Поиск по SKU, названию, owner…" value="${escapeHtml(filters.search)}">
        <select id="skuPlanFactMonth">
          <option value="latest" ${filters.month === 'latest' ? 'selected' : ''}>Текущий месяц: ${escapeHtml(model.monthLabel)}</option>
          ${monthOptions}
        </select>
        <select id="skuPlanFactOwner">
          <option value="all" ${filters.owner === 'all' ? 'selected' : ''}>Все owner</option>
          ${ownerOptions}
        </select>
        <select id="skuPlanFactStatus">
          <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Без вывода</option>
          <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Все SKU</option>
          <option value="with_plan" ${filters.status === 'with_plan' ? 'selected' : ''}>Есть план</option>
          <option value="under_plan" ${filters.status === 'under_plan' ? 'selected' : ''}>Ниже плана</option>
          <option value="no_fact" ${filters.status === 'no_fact' ? 'selected' : ''}>План есть, факта нет</option>
        </select>
        <select id="skuPlanFactPlatform">
          <option value="all" ${filters.platform === 'all' ? 'selected' : ''}>WB + Ozon</option>
          <option value="wb" ${filters.platform === 'wb' ? 'selected' : ''}>Только WB</option>
          <option value="ozon" ${filters.platform === 'ozon' ? 'selected' : ''}>Только Ozon</option>
        </select>
        <select id="skuPlanFactSort">
          <option value="gap" ${filters.sort === 'gap' ? 'selected' : ''}>Сортировка: провал к плану</option>
          <option value="completion" ${filters.sort === 'completion' ? 'selected' : ''}>Сортировка: выполнение</option>
          <option value="fact" ${filters.sort === 'fact' ? 'selected' : ''}>Сортировка: факт оборота</option>
          <option value="plan" ${filters.sort === 'plan' ? 'selected' : ''}>Сортировка: план</option>
          <option value="drr" ${filters.sort === 'drr' ? 'selected' : ''}>Сортировка: ДРР</option>
          <option value="article" ${filters.sort === 'article' ? 'selected' : ''}>Сортировка: артикул</option>
        </select>
      </div>
      <div class="table-wrap sku-plan-fact-table">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Owner</th>
              <th>WB факт / план</th>
              <th>Ozon факт / план</th>
              <th>Итого</th>
              <th>Средний чек</th>
              <th>Оборачиваемость</th>
              <th>Реклама / ДРР</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="footer-note">Клик по строке открывает карточку SKU для смены owner и рабочих комментариев.</div>
    </div>
  `;

  root.querySelector('#skuPlanFactSearch')?.addEventListener('input', (event) => { filters.search = event.target.value; renderSkuPlanFact(rootId); });
  root.querySelector('#skuPlanFactMonth')?.addEventListener('change', (event) => { filters.month = event.target.value; renderSkuPlanFact(rootId); });
  root.querySelector('#skuPlanFactOwner')?.addEventListener('change', (event) => { filters.owner = event.target.value; renderSkuPlanFact(rootId); });
  root.querySelector('#skuPlanFactStatus')?.addEventListener('change', (event) => { filters.status = event.target.value; renderSkuPlanFact(rootId); });
  root.querySelector('#skuPlanFactPlatform')?.addEventListener('change', (event) => { filters.platform = event.target.value; renderSkuPlanFact(rootId); });
  root.querySelector('#skuPlanFactSort')?.addEventListener('change', (event) => { filters.sort = event.target.value; renderSkuPlanFact(rootId); });
  root.querySelector('[data-sku-plan-fact-export]')?.addEventListener('click', () => downloadSkuPlanFactExcel(model));
}

window.renderSkuPlanFact = renderSkuPlanFact;
