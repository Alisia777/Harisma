function renderControlWorkstreamSection(summary) {
  const pool = summary.tasks.filter(isTaskActive).length ? summary.tasks.filter(isTaskActive) : summary.tasks;
  const tasksHtml = pool.length
    ? pool.slice(0, 10).map(renderTaskCard).join('')
    : '<div class="empty">Нет задач под текущий срез</div>';
  const ownerLine = summary.ownerPreview.length
    ? `Ключевые owner: ${summary.ownerPreview.join(' · ')}`
    : 'Owner пока не закреплены или контур заполнен только авто-сигналами.';
  return `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>${escapeHtml(summary.meta.label)}</h3>
          <p class="small muted">${escapeHtml(summary.meta.description)}</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(summary.activeCount)} активн.`, summary.activeCount ? summary.meta.kind : '')}
          ${summary.overdueCount ? badge(`${fmt.int(summary.overdueCount)} проср.`, 'danger') : ''}
          ${summary.criticalCount ? badge(`${fmt.int(summary.criticalCount)} крит.`, 'warn') : ''}
        </div>
      </div>
      <div class="muted small" style="margin-top:6px">${escapeHtml(ownerLine)}</div>
      <div class="stack" style="margin-top:12px">${tasksHtml}</div>
    </div>
  `;

  root.querySelector('[data-dashboard-export]')?.addEventListener('click', () => {
    downloadDashboardExcel(model);
  });
}

function skuOperationalStatusMetaLegacy(sku) {
  return skuOperationalStatusMeta(sku);
  const resolvedLabel = skuRegistryStatusLabel(sku);
  const statusRaw = normalizePortalText([
    resolvedLabel,
    sku?.status,
    sku?.registryStatus,
    sku?.owner?.registryStatus,
    sku?.sheetStatus
  ].filter(Boolean).join(' ')).toLowerCase();

  if (rawStatus.includes('вывод') || registryStatus.includes('вывод')) return { label: 'На вывод', tone: '' };
  if (rawStatus.includes('нов') || registryStatus.includes('нов')) return { label: 'Новинка', tone: 'info' };
  if (rawStatus.includes('вопрос') || registryStatus.includes('вопрос')) return { label: 'Под вопросом', tone: 'warn' };
  if (rawStatus.includes('специф') || registryStatus.includes('специф')) return { label: 'Нет в спецификации', tone: 'warn' };
  if (!sku?.flags?.assigned) return { label: 'Без owner', tone: 'warn' };
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) return { label: 'В работу WB + Ozon', tone: 'danger' };
  if (sku?.flags?.toWorkWB) return { label: 'В работу WB', tone: 'danger' };
  if (sku?.flags?.toWorkOzon) return { label: 'В работу Ozon', tone: 'danger' };
  if (sku?.flags?.negativeMargin) return { label: 'Маржа в риске', tone: 'danger' };
  if (sku?.flags?.lowStock) return { label: 'Низкий остаток', tone: 'warn' };
  if (sku?.flags?.underPlan) return { label: 'Ниже плана', tone: 'warn' };
  if ((sku?.focusScore || 0) >= 4) return { label: 'Наблюдать', tone: 'warn' };
  if (registryStatus) return { label: sku.owner.registryStatus, tone: 'ok' };
  if (sku?.status) return { label: sku.status, tone: 'ok' };
  return { label: 'Актуальный', tone: 'ok' };
}

function skuOperationalStatus(sku) {
  const meta = skuOperationalStatusMeta(sku);
  return badge(meta.label, meta.tone);
}

// Canonical status resolver: keeps SKU status in one source chain for all views.
function skuOperationalStatusMeta(sku) {
  const resolvedLabel = skuRegistryStatusLabel(sku);
  const statusRaw = normalizePortalText([
    resolvedLabel,
    sku?.status,
    sku?.registryStatus,
    sku?.owner?.registryStatus,
    sku?.sheetStatus
  ].filter(Boolean).join(' ')).toLowerCase();

  if (statusRaw.includes('вывод')) return { label: 'На вывод', tone: '' };
  if (statusRaw.includes('нов')) return { label: 'Новинка', tone: 'info' };
  if (statusRaw.includes('вопрос')) return { label: 'Под вопросом', tone: 'warn' };
  if (statusRaw.includes('специф')) return { label: 'Нет в спецификации', tone: 'warn' };
  if (!sku?.flags?.assigned) return { label: 'Без owner', tone: 'warn' };
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) return { label: 'В работу WB + Ozon', tone: 'danger' };
  if (sku?.flags?.toWorkWB) return { label: 'В работу WB', tone: 'danger' };
  if (sku?.flags?.toWorkOzon) return { label: 'В работу Ozon', tone: 'danger' };
  if (sku?.flags?.negativeMargin) return { label: 'Маржа в риске', tone: 'danger' };
  if (sku?.flags?.lowStock) return { label: 'Низкий остаток', tone: 'warn' };
  if (sku?.flags?.underPlan) return { label: 'Ниже плана', tone: 'warn' };
  if ((sku?.focusScore || 0) >= 4) return { label: 'Наблюдать', tone: 'warn' };
  if (resolvedLabel) return { label: resolvedLabel, tone: 'ok' };
  return { label: 'Актуальный', tone: 'ok' };
}

function renderSkuTaskSummary(sku, task = nextTaskForSku(sku.articleKey)) {
  if (!task) return `<div class="muted small">Нет активной задачи</div>`;
  return `
    <div><strong>${escapeHtml(task.title)}</strong></div>
    <div class="muted small">${escapeHtml(task.nextAction || task.reason || 'Нужен апдейт')}</div>
    <div class="badge-stack" style="margin-top:6px">${taskStatusBadge(task)}${taskPriorityBadge(task)}</div>
  `;
}


function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function avg(values) {
  const clean = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (!clean.length) return null;
  return clean.reduce((acc, value) => acc + value, 0) / clean.length;
}

function bestTurnoverDays(sku) {
  const values = [sku?.wb?.turnoverDays, sku?.ozon?.turnoverDays]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  return values.length ? Math.min(...values) : null;
}

function totalSkuStock(sku) {
  return numberOrZero(sku?.wb?.stock) + numberOrZero(sku?.ozon?.stockProducts ?? sku?.ozon?.stock);
}

function finiteNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstFiniteValue(...values) {
  for (const value of values) {
    const parsed = finiteNumberOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstPositiveValue(...values) {
  for (const value of values) {
    const parsed = finiteNumberOrNull(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function dashboardBrandSummary() {
  return Array.isArray(state.dashboard?.brandSummary) && state.dashboard.brandSummary.length
    ? state.dashboard.brandSummary[0]
    : null;
}

function parseDashboardDate(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dashboardAsOfDate() {
  return parseDashboardDate(
    state.dashboard?.asOfDate
    ?? state.dashboard?.dataFreshness?.asOfDate
    ?? dashboardBrandSummary()?.asOfDate
  );
}

function dashboardAsOfLabel() {
  const asOfDate = dashboardAsOfDate();
  return asOfDate ? asOfDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : null;
}

function currentMonthDayCount() {
  const asOfDate = dashboardAsOfDate();
  return asOfDate ? Math.max(1, asOfDate.getDate()) : null;
}

function buildBrandPlanSnapshot() {
  const summary = dashboardBrandSummary();
  const monthPlanRevenue = firstPositiveValue(
    summary?.apr_plan_revenue,
    state.dashboard?.apr_plan_revenue
  );
  const factRevenue = firstPositiveValue(
    summary?.apr_fact_revenue_to_date,
    state.dashboard?.apr_fact_revenue_to_date,
    summary?.fact_revenue_to_date,
    state.dashboard?.fact_revenue_to_date
  );
  const planToDateRevenue = firstPositiveValue(
    summary?.apr_plan_to_date_revenue,
    state.dashboard?.apr_plan_to_date_revenue
  );
  const forecastRevenue = firstPositiveValue(
    summary?.apr_forecast_revenue,
    state.dashboard?.apr_forecast_revenue
  );

  const monthCompletionRaw = firstFiniteValue(
    summary?.apr_plan_completion_month_pct,
    state.dashboard?.apr_plan_completion_month_pct
  );
  const toDateCompletionRaw = firstFiniteValue(
    summary?.apr_plan_completion_to_date_pct,
    state.dashboard?.apr_plan_completion_to_date_pct,
    summary?.plan_completion_to_date_pct,
    state.dashboard?.plan_completion_to_date_pct
  );
  const forecastPctRaw = firstFiniteValue(
    summary?.apr_forecast_pct,
    state.dashboard?.apr_forecast_pct,
    summary?.forecast_pct,
    state.dashboard?.forecast_pct
  );

  const monthCompletionPct = monthCompletionRaw !== null
    ? monthCompletionRaw
    : (monthPlanRevenue && factRevenue ? factRevenue / monthPlanRevenue : null);
  const toDateCompletionPct = toDateCompletionRaw !== null
    ? toDateCompletionRaw
    : (planToDateRevenue && factRevenue ? factRevenue / planToDateRevenue : null);
  const forecastPct = forecastPctRaw !== null
    ? forecastPctRaw
    : (forecastRevenue && monthPlanRevenue ? forecastRevenue / monthPlanRevenue : null);

  return {
    monthPlanRevenue,
    factRevenue,
    planToDateRevenue,
    forecastRevenue,
    monthCompletionPct,
    toDateCompletionPct,
    forecastPct,
    asOfLabel: dashboardAsOfLabel(),
    hasWorkbookPlan: monthPlanRevenue !== null || monthCompletionPct !== null || toDateCompletionPct !== null
  };
}

function alignedDashboardCards() {
  const cards = Array.isArray(state.dashboard?.cards) ? state.dashboard.cards : [];
  const brandPlan = buildBrandPlanSnapshot();
  if (!brandPlan.hasWorkbookPlan) return cards;

  const preservedCards = cards.slice(0, Math.min(cards.length, 10));
  const asOfLabel = brandPlan.asOfLabel || 'дату файла';
  const planCards = [
    {
      label: `Факт на ${asOfLabel}, ₽`,
      value: brandPlan.factRevenue,
      format: 'money',
      hint: 'Smart = Altea по файлу выполнения плана.'
    },
    {
      label: 'План апреля, ₽',
      value: brandPlan.monthPlanRevenue,
      format: 'money',
      hint: 'Qharisma v5 план месяца для Smart = Altea.'
    },
    {
      label: 'Выполнение плана',
      value: brandPlan.monthCompletionPct,
      format: 'pct',
      hint: 'Факт / полный план месяца.'
    },
    {
      label: 'План к дате, ₽',
      value: brandPlan.planToDateRevenue,
      format: 'money',
      hint: `Линейный план к ${asOfLabel} из файла.`
    },
    {
      label: 'Прогноз / план',
      value: brandPlan.forecastPct,
      format: 'pct',
      hint: brandPlan.forecastRevenue !== null
        ? `Базовый прогноз ${fmt.money(brandPlan.forecastRevenue)} к концу месяца.`
        : 'Прогноз по текущему темпу.'
    }
  ].filter((card) => card.value !== null && card.value !== undefined);

  return [...preservedCards, ...planCards];
}

function currentCompletionSnapshot(sku) {
  const monthPct = firstFiniteValue(
    sku?.planFact?.completionAprMonthPct,
    sku?.planFact?.completionMonthPct
  );
  const toDatePct = firstFiniteValue(
    sku?.planFact?.completionAprToDatePct,
    sku?.planFact?.completionToDatePct
  );
  const legacyPct = firstFiniteValue(sku?.planFact?.completionFeb26Pct);
  return {
    monthPct,
    toDatePct,
    legacyPct,
    primaryPct: monthPct ?? toDatePct ?? legacyPct
  };
}

function currentCompletionPct(sku) {
  return numberOrZero(currentCompletionSnapshot(sku).primaryPct);
}

function currentPlanDailyUnits(sku) {
  const aprPlan = firstPositiveValue(sku?.planFact?.planApr26Units);
  if (aprPlan !== null) return aprPlan / 30;
  const marPlan = firstPositiveValue(sku?.planFact?.planMar26Units);
  if (marPlan !== null) return marPlan / 31;
  const febPlan = firstPositiveValue(sku?.planFact?.planFeb26Units);
  if (febPlan !== null) return febPlan / 29;
  return 0;
}

function currentFactDailyUnits(sku) {
  const currentMonthDays = currentMonthDayCount();
  const aprFact = firstPositiveValue(
    sku?.planFact?.factApr16Units,
    sku?.planFact?.factAprToDateUnits
  );
  if (aprFact !== null && currentMonthDays) return aprFact / currentMonthDays;
  const febFact = firstPositiveValue(sku?.planFact?.factFeb26Units);
  return febFact !== null ? febFact / 29 : 0;
}

function currentMarginPct(sku) {
  const direct = sku?.planFact?.factApr16MarginPct ?? sku?.planFact?.factFeb26MarginPct;
  if (direct !== undefined && direct !== null && direct !== '') return numberOrZero(direct);
  const wb = sku?.wb?.marginPct;
  const oz = sku?.ozon?.marginPct;
  const values = [wb, oz].filter(v => v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v))).map(Number);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function monthRevenue(sku) {
  return numberOrZero(
    sku?.planFact?.factApr16Revenue
    ?? sku?.planFact?.factFeb26Revenue
    ?? sku?.orders?.value
    ?? sku?.planFact?.factTotalRevenue
  );
}

function monthNetRevenue(sku) {
  return numberOrZero(
    sku?.planFact?.factApr16NetRevenue
    ?? sku?.planFact?.factFeb26NetRevenue
    ?? sku?.orders?.value
    ?? sku?.planFact?.factApr16Revenue
  );
}

function monthUnits(sku) {
  return numberOrZero(
    sku?.planFact?.factApr16Units
    ?? sku?.planFact?.factFeb26Units
    ?? sku?.orders?.units
  );
}

function externalTrafficLabel(sku) {
  const parts = [];
  if (sku?.flags?.hasKZ) parts.push('🚀 КЗ');
  if (sku?.flags?.hasVK) parts.push('📣 VK');
  return parts.join(' · ') || 'без внешнего трафика';
}

function renderLeaderRow(item, index, maxValue, metricLabel, metaHtml = '') {
  const width = maxValue > 0 ? Math.max(6, Math.round((numberOrZero(item.metricValue) / maxValue) * 100)) : 12;
  return `
    <div class="leader-row interactive-row" data-open-sku="${escapeHtml(item.articleKey)}">
      <div class="leader-rank">${index + 1}</div>
      <div class="leader-main">
        <div class="leader-headline">
          <div>
            <strong>${linkToSku(item.articleKey, item.article || item.articleKey)}</strong>
            <div class="muted small">${escapeHtml(item.title || 'Без названия')}</div>
          </div>
          <div class="leader-value">${escapeHtml(metricLabel(item.metricValue))}</div>
        </div>
        <div class="leader-bar"><span style="width:${width}%"></span></div>
        <div class="leader-meta">${metaHtml}</div>
      </div>
    </div>
  `;
}

function renderInverseLeaderRow(item, index, maxValue, metricLabel, metaHtml = '') {
  const rawValue = numberOrZero(item.metricValue);
  const width = maxValue > 0 ? Math.max(8, Math.round((1 - rawValue / maxValue) * 100)) : 12;
  return `
    <div class="leader-row interactive-row" data-open-sku="${escapeHtml(item.articleKey)}">
      <div class="leader-rank">${index + 1}</div>
      <div class="leader-main">
        <div class="leader-headline">
          <div>
            <strong>${linkToSku(item.articleKey, item.article || item.articleKey)}</strong>
            <div class="muted small">${escapeHtml(item.title || 'Без названия')}</div>
          </div>
          <div class="leader-value">${escapeHtml(metricLabel(item.metricValue))}</div>
        </div>
        <div class="leader-bar inverse"><span style="width:${width}%"></span></div>
        <div class="leader-meta">${metaHtml}</div>
      </div>
    </div>
  `;
}

function buildVisualDashboardModel() {
  const control = getControlSnapshot();
  const activeSkus = state.skus.filter((sku) => !skuStatusSearchValue(sku).includes('вывод'));
  const revenueTotal = activeSkus.reduce((acc, sku) => acc + monthRevenue(sku), 0);
  const netRevenueTotal = activeSkus.reduce((acc, sku) => acc + monthNetRevenue(sku), 0);
  const unitsTotal = activeSkus.reduce((acc, sku) => acc + monthUnits(sku), 0);
  const avgCompletion = avg(activeSkus.map((sku) => currentCompletionPct(sku)));
  const avgMargin = avg(activeSkus.map((sku) => currentMarginPct(sku)));
  const trafficCount = activeSkus.filter((sku) => sku?.flags?.hasExternalTraffic).length;
  const leadersSales = [...activeSkus]
    .filter((sku) => monthRevenue(sku) > 0)
    .sort((a, b) => monthRevenue(b) - monthRevenue(a))
    .slice(0, 8)
    .map((sku) => ({
      articleKey: sku.articleKey,
      article: sku.article,
      title: sku.name,
      metricValue: monthRevenue(sku),
      owner: ownerName(sku),
      marginPct: currentMarginPct(sku),
      units: monthUnits(sku),
      traffic: externalTrafficLabel(sku)
    }));
  const turnoverCandidates = [...activeSkus]
    .map((sku) => ({
      sku,
      metricValue: bestTurnoverDays(sku)
    }))
    .filter((row) => row.metricValue && row.metricValue > 0 && totalSkuStock(row.sku) > 0)
    .sort((a, b) => a.metricValue - b.metricValue)
    .slice(0, 8)
    .map((row) => ({
      articleKey: row.sku.articleKey,
      article: row.sku.article,
      title: row.sku.name,
      metricValue: row.metricValue,
      stock: totalSkuStock(row.sku),
      target: avg([row.sku?.wb?.targetTurnoverDays, row.sku?.ozon?.targetTurnoverDays]),
      owner: ownerName(row.sku)
    }));
  const romiLeaders = [...activeSkus]
    .filter((sku) => numberOrZero(sku?.content?.romi) > 0)
    .sort((a, b) => numberOrZero(b?.content?.romi) - numberOrZero(a?.content?.romi))
    .slice(0, 6)
    .map((sku) => ({
      articleKey: sku.articleKey,
      article: sku.article,
      title: sku.name,
      metricValue: numberOrZero(sku?.content?.romi),
      posts: numberOrZero(sku?.content?.posts),
      clicks: numberOrZero(sku?.content?.clicks),
      orders: numberOrZero(sku?.content?.orders)
    }));
  const worklist = [...state.skus]
    .filter((sku) => sku?.flags?.toWork)
    .sort((a, b) => numberOrZero(b?.focusScore) - numberOrZero(a?.focusScore) || monthRevenue(b) - monthRevenue(a))
    .slice(0, 6);
  const freshness = state.dashboard?.dataFreshness || {};
  const brandPlan = buildBrandPlanSnapshot();
  return {
    control,
    revenueTotal,
    netRevenueTotal,
    unitsTotal,
    avgCompletion,
    avgMargin,
    trafficCount,
    leadersSales,
    turnoverCandidates,
    romiLeaders,
    worklist,
    freshness,
    brandPlan
  };
}

function dashboardExportRows(model) {
  const heroCards = alignedDashboardCards().map((card) => ({
    section: 'Общие KPI',
    block: card.label || '',
    sku: '',
    owner: '',
    value: typeof card.value === 'string' ? card.value : card.value ?? '',
    note: card.hint || ''
  }));
  const leaderRows = model.leadersSales.map((item) => ({
    section: 'Лидеры продаж',
    block: item.article || item.articleKey || item.name || '',
    sku: item.articleKey || '',
    owner: item.owner || '',
    value: numberOrZero(item.metricValue),
    note: item.name || ''
  }));
  const turnoverRows = model.turnoverCandidates.map((item) => ({
    section: 'Оборачиваемость',
    block: item.article || item.articleKey || item.name || '',
    sku: item.articleKey || '',
    owner: item.owner || '',
    value: numberOrZero(item.metricValue),
    note: item.name || ''
  }));
  const romiRows = model.romiLeaders.map((item) => ({
    section: 'Контент / ROMI',
    block: item.article || item.articleKey || item.name || '',
    sku: item.articleKey || '',
    owner: item.owner || '',
    value: numberOrZero(item.metricValue),
    note: item.name || ''
  }));
  const workRows = model.worklist.map((item) => ({
    section: 'Красные зоны',
    block: item.article || item.articleKey || item.name || '',
    sku: item.articleKey || '',
    owner: ownerName(item) || '',
    value: item.focusScore || 0,
    note: item.focusReasons || ''
  }));
  return [...heroCards, ...leaderRows, ...turnoverRows, ...romiRows, ...workRows];
}

function downloadDashboardExcel(model) {
  const rows = dashboardExportRows(model);
  if (!rows.length) {
    window.alert('Для выгрузки дашборда пока нет строк.');
    return;
  }
  const columns = [
    ['section', 'Раздел'],
    ['block', 'Блок / показатель'],
    ['sku', 'SKU'],
    ['owner', 'Owner'],
    ['value', 'Значение'],
    ['note', 'Комментарий']
  ];
  const head = `<tr>${columns.map((column) => `<th>${escapeHtml(column[1])}</th>`).join('')}</tr>`;
  const body = rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column[0]])}</td>`).join('')}</tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
  const blob = new Blob(['\uFEFF', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `dashboard-${todayIso()}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderDashboard() {
  const root = document.getElementById('view-dashboard');
  const model = buildVisualDashboardModel();
  const control = model.control;
  const brandPlan = model.brandPlan;
  const salesMax = Math.max(1, ...model.leadersSales.map((item) => numberOrZero(item.metricValue)));
  const turnoverMax = Math.max(1, ...model.turnoverCandidates.map((item) => numberOrZero(item.metricValue)));
  const romiMax = Math.max(1, ...model.romiLeaders.map((item) => numberOrZero(item.metricValue)));

  const fallbackHeroCards = [
    { label: 'Выручка за срез', value: fmt.money(model.revenueTotal), hint: 'Сумма факта / order value по активным SKU.' },
    { label: 'Net revenue', value: fmt.money(model.netRevenueTotal), hint: 'Чистая выручка по доступному срезу.' },
    { label: 'Продано единиц', value: fmt.int(model.unitsTotal), hint: 'Факт units по SKU в текущем портале.' },
    { label: 'Среднее выполнение', value: fmt.pct(model.avgCompletion), hint: 'Средний completion по SKU с планом.' },
    { label: 'Средняя маржа', value: fmt.pct(model.avgMargin), hint: 'Средняя маржа по текущему месячному срезу.' },
    { label: 'SKU с внешним трафиком', value: fmt.int(model.trafficCount), hint: 'КЗ / VK уже отмечены в рабочем контуре.' }
  ];

  const heroSourceCards = brandPlan.hasWorkbookPlan
    ? [
        {
          label: `Факт на ${brandPlan.asOfLabel || 'дату файла'}`,
          value: brandPlan.factRevenue !== null ? fmt.money(brandPlan.factRevenue) : '—',
          hint: 'Smart = Altea по файлу выполнения плана.'
        },
        {
          label: 'План апреля',
          value: brandPlan.monthPlanRevenue !== null ? fmt.money(brandPlan.monthPlanRevenue) : '—',
          hint: 'Qharisma v5 план месяца.'
        },
        {
          label: 'Выполнение плана',
          value: brandPlan.monthCompletionPct !== null ? fmt.pct(brandPlan.monthCompletionPct) : '—',
          hint: 'Факт / полный план месяца.'
        },
        {
          label: 'К плану на дату',
          value: brandPlan.toDateCompletionPct !== null ? fmt.pct(brandPlan.toDateCompletionPct) : '—',
          hint: brandPlan.planToDateRevenue !== null
            ? `План к ${brandPlan.asOfLabel || 'доступной дате'} из файла.`
            : 'Линейный план к доступной дате.'
        },
        {
          label: 'Прогноз / план',
          value: brandPlan.forecastPct !== null ? fmt.pct(brandPlan.forecastPct) : '—',
          hint: brandPlan.forecastRevenue !== null
            ? `Базовый прогноз ${fmt.money(brandPlan.forecastRevenue)} к концу месяца.`
            : 'Прогноз по текущему темпу.'
        },
        {
          label: 'Средняя маржа',
          value: fmt.pct(model.avgMargin),
          hint: 'Средняя маржа по текущему месячному срезу.'
        }
      ]
    : fallbackHeroCards;

  const heroCards = heroSourceCards.map((card) => `
    <div class="hero-kpi">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.hint)}</small>
    </div>
  `).join('');

  const formatCardValue = (card) => {
    if (typeof card?.value === 'string') return escapeHtml(card.value);
    if (card?.format === 'money') return escapeHtml(fmt.money(card.value));
    if (card?.format === 'pct') return escapeHtml(fmt.pct(card.value));
    return escapeHtml(fmt.int(card?.value));
  };

  const dashboardCards = alignedDashboardCards();
  const baseCards = dashboardCards.map((card) => `
    <div class="card kpi">
      <div class="label">${escapeHtml(card.label)}</div>
      <div class="value">${formatCardValue(card)}</div>
      <div class="hint">${escapeHtml(card.hint)}</div>
    </div>
  `).join('');

  const salesRows = model.leadersSales.map((item, index) => renderLeaderRow(
    item,
    index,
    salesMax,
    (value) => fmt.money(value),
    `${badge(item.owner || 'Без owner', item.owner ? 'ok' : 'warn')}${marginBadge('Маржа', item.marginPct)}${badge(`${fmt.int(item.units)} шт.`)}${badge(item.traffic, item.traffic.includes('без') ? '' : 'info')}`
  )).join('');

  const turnoverRows = model.turnoverCandidates.map((item, index) => renderInverseLeaderRow(
    item,
    index,
    turnoverMax,
    (value) => `${fmt.num(value, 1)} дн.`,
    `${badge(`Цель ${fmt.num(item.target, 0)} дн.`, 'info')}${badge(`Остаток ${fmt.int(item.stock)} шт.`)}${badge(item.owner || 'Без owner', item.owner ? 'ok' : 'warn')}`
  )).join('');

  const romiRows = model.romiLeaders.map((item, index) => renderLeaderRow(
    item,
    index,
    romiMax,
    (value) => fmt.num(value, 1),
    `${badge(`${fmt.int(item.posts)} постов`)}${badge(`${fmt.int(item.clicks)} кликов`)}${badge(`${fmt.int(item.orders)} заказов`, 'info')}`
  )).join('');

  const workRows = model.worklist.map((sku) => `
    <div class="alert-row">
      <div>
        <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
        <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
      </div>
      <div class="badge-stack">
        ${skuOperationalStatus(sku)}
        ${marginBadge('WB', sku?.wb?.marginPct)}
        ${marginBadge('Ozon', sku?.ozon?.marginPct)}
      </div>
      <div class="muted small">${escapeHtml(sku.focusReasons || 'Ниже плана и отрицательная маржа')}</div>
    </div>
  `).join('');

  root.innerHTML = `
    <section class="hero-panel">
      <div class="hero-copy">
        <div class="eyebrow">ALTEA · brand pulse</div>
        <h2>Красивый дашборд бренда</h2>
        <p>Отдельный визуальный слой для общего состояния бренда: сверху pulse, ниже лидеры продаж и оборачиваемости, а внизу — красные зоны, которые нельзя потерять.</p>
        <div class="badge-stack" style="margin-top:12px">
          ${badge(`План/факт: ${model.freshness.planFactMonth || '—'}`)}
          ${badge(`Лидерборд: ${(model.freshness.contentPeriods || []).join(' / ') || '—'}`, 'info')}
          ${badge(`Новинки: ${model.freshness.launchPlanHorizon || '—'}`)}
        </div>
      </div>
      <div class="hero-grid">${heroCards}</div>
    </section>

    <div class="section-title" style="margin-top:18px">
      <div>
        <h2>Общее состояние бренда</h2>
        <p>Крупные KPI, чтобы за минуту понять, где мы стоим по Алтея.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" data-dashboard-export>Excel</button>
        <button class="quick-chip" data-view-control>Открыть задачи</button>
        <button class="quick-chip" data-control-preset="overdue">Просрочено</button>
        <button class="quick-chip" data-view-executive>Свод руководителя</button>
      </div>
    </div>

    <div class="grid cards">${baseCards}</div>

    <div class="dashboard-grid-3" style="margin-top:14px">
      <div class="card visual-card">
        <div class="section-subhead">
          <div>
            <h3>Лидеры продаж</h3>
            <p class="small muted">Берём текущую выручку по срезу и показываем сильнейшие SKU.</p>
          </div>
          ${badge(`${fmt.int(model.leadersSales.length)} SKU`, 'ok')}
        </div>
        <div class="leader-list">${salesRows || '<div class="empty">Нет данных по продажам</div>'}</div>
      </div>

      <div class="card visual-card">
        <div class="section-subhead">
          <div>
            <h3>Лидеры по оборачиваемости</h3>
            <p class="small muted">Чем меньше дней оборота, тем быстрее крутится SKU.</p>
          </div>
          ${badge('быстрее = лучше', 'info')}
        </div>
        <div class="leader-list">${turnoverRows || '<div class="empty">Нет данных по оборачиваемости</div>'}</div>
      </div>

      <div class="card visual-card">
        <div class="section-subhead">
          <div>
            <h3>Лидеры по контенту / ROMI</h3>
            <p class="small muted">Кого уже тащит контент и где есть наглядный сигнал для масштабирования.</p>
          </div>
          ${badge('контент-потенциал', 'info')}
        </div>
        <div class="leader-list">${romiRows || '<div class="empty">Нет ROMI в текущем срезе</div>'}</div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Красные зоны</h3>
            <p class="small muted">SKU, которые уже просятся в работу из-за плана и маржи.</p>
          </div>
          ${badge(`${fmt.int(model.worklist.length)} в фокусе`, model.worklist.length ? 'danger' : 'ok')}
        </div>
        <div class="alert-stack">${workRows || '<div class="empty">Сейчас нет критичных SKU</div>'}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Операционный чек на сегодня</h3>
            <p class="small muted">Сразу видно, что показать на утреннем / weekly созвоне.</p>
          </div>
          ${badge(`${fmt.int(control.todayList.length)} в short-list`, 'warn')}
        </div>
        <div class="task-mini-grid">${control.todayList.slice(0, 8).map(renderMiniTask).join('') || '<div class="empty">Нет задач для экспресс-чека</div>'}</div>
      </div>
    </div>

    <div class="footer-note">Последняя генерация данных: ${escapeHtml(state.dashboard.generatedAt || '—')}. Этот экран теперь отвечает за визуальный pulse бренда, а не за канбан задач.</div>
  `;
}
