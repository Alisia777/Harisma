(function () {
  if (window.__ALTEA_PLAN_ALIGNMENT_HOTFIX_20260423A__) return;
  window.__ALTEA_PLAN_ALIGNMENT_HOTFIX_20260423A__ = true;

  const WORKBOOK_PLAN_SNAPSHOT = Object.freeze({
    generatedAt: '2026-04-23T12:00:00',
    asOfDate: '2026-04-21',
    asOfLabel: '21.04',
    factRevenueToDate: 152956664.96,
    planRevenueMonth: 304896023,
    planCompletionMonthPct: 0.5017,
    planRevenueToDate: 223590416.87,
    planCompletionToDatePct: 0.6841,
    forecastRevenue: 208577270.4,
    forecastPct: 0.6841
  });
  const PLAN_CARD_PATTERNS = [
    /^План апреля/i,
    /^Факт 01.?16\.04/i,
    /^Выполнение к плану на дату/i,
    /^Прогноз апреля/i,
    /^Факт на /i,
    /^Выполнение плана$/i,
    /^План к дате/i,
    /^Прогноз \/ план/i
  ];

  function finiteNumberOrNull() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = Number(arguments[index]);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  function matchesPlanCardLabel(label) {
    const text = String(label || '').trim();
    return PLAN_CARD_PATTERNS.some((pattern) => pattern.test(text));
  }

  function workbookDashboardCards(existingCards) {
    const preservedCards = Array.isArray(existingCards)
      ? existingCards.filter((card) => !matchesPlanCardLabel(card?.label))
      : [];
    return preservedCards.concat([
      {
        label: `Факт на ${WORKBOOK_PLAN_SNAPSHOT.asOfLabel}, ₽`,
        value: WORKBOOK_PLAN_SNAPSHOT.factRevenueToDate,
        format: 'money',
        hint: 'Выручка по файлу Выполнение плана.xlsx на дату среза.'
      },
      {
        label: 'План апреля, ₽',
        value: WORKBOOK_PLAN_SNAPSHOT.planRevenueMonth,
        format: 'money',
        hint: 'QHarisma v5 план на апрель из файла.'
      },
      {
        label: 'Выполнение плана',
        value: WORKBOOK_PLAN_SNAPSHOT.planCompletionMonthPct,
        format: 'pct',
        hint: 'Факт / полный план месяца.'
      },
      {
        label: 'План к дате, ₽',
        value: WORKBOOK_PLAN_SNAPSHOT.planRevenueToDate,
        format: 'money',
        hint: 'План на текущую дату из файла.'
      },
      {
        label: 'Прогноз / план',
        value: WORKBOOK_PLAN_SNAPSHOT.forecastPct,
        format: 'pct',
        hint: 'Прогноз месяца по текущему темпу / план месяца.'
      }
    ]);
  }

  function dashboardPlanAlreadyAligned() {
    const labels = Array.isArray(state?.dashboard?.cards)
      ? state.dashboard.cards.map((card) => String(card?.label || '').trim())
      : [];
    return String(state?.dashboard?.dataFreshness?.asOfDate || state?.dashboard?.asOfDate || '') === WORKBOOK_PLAN_SNAPSHOT.asOfDate
      && labels.includes(`Факт на ${WORKBOOK_PLAN_SNAPSHOT.asOfLabel}, ₽`)
      && labels.includes('Выполнение плана')
      && labels.includes('План к дате, ₽')
      && labels.includes('Прогноз / план');
  }

  function alignDashboardPlanSnapshot() {
    if (typeof state !== 'object' || !state || !state.dashboard) return false;
    if (dashboardPlanAlreadyAligned()) return false;

    const existingFreshness = state.dashboard.dataFreshness || {};
    const existingSources = existingFreshness.sources || {};
    state.dashboard.generatedAt = WORKBOOK_PLAN_SNAPSHOT.generatedAt;
    state.dashboard.asOfDate = WORKBOOK_PLAN_SNAPSHOT.asOfDate;
    state.dashboard.dataFreshness = {
      ...existingFreshness,
      asOfDate: WORKBOOK_PLAN_SNAPSHOT.asOfDate,
      planFactMonth: 'Апрель 2026 · факт на 21.04',
      sources: {
        ...existingSources,
        workbook: 'Выполнение плана.xlsx · Апрель 26 | Altea'
      }
    };
    state.dashboard.cards = workbookDashboardCards(state.dashboard.cards);

    if (Array.isArray(state.dashboard.brandSummary)) {
      state.dashboard.brandSummary = state.dashboard.brandSummary.map((item, index) => {
        if (index !== 0 && String(item?.brand || '').trim() !== 'Алтея') return item;
        return {
          ...item,
          asOfDate: WORKBOOK_PLAN_SNAPSHOT.asOfDate,
          apr_plan_revenue: WORKBOOK_PLAN_SNAPSHOT.planRevenueMonth,
          apr_fact_revenue_to_date: WORKBOOK_PLAN_SNAPSHOT.factRevenueToDate,
          apr_plan_revenue_to_date: WORKBOOK_PLAN_SNAPSHOT.planRevenueToDate,
          apr_plan_completion_month_pct: WORKBOOK_PLAN_SNAPSHOT.planCompletionMonthPct,
          apr_plan_completion_to_date_pct: WORKBOOK_PLAN_SNAPSHOT.planCompletionToDatePct,
          apr_forecast_revenue: WORKBOOK_PLAN_SNAPSHOT.forecastRevenue,
          apr_forecast_pct: WORKBOOK_PLAN_SNAPSHOT.forecastPct
        };
      });
    }

    return true;
  }

  function applyDashboardPlanAlignment() {
    if (!alignDashboardPlanSnapshot()) return;
    try {
      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      if (state.activeSku && typeof renderSkuModal === 'function') renderSkuModal(state.activeSku);
    } catch (error) {
      console.warn('[portal-plan-alignment-hotfix] dashboard rerender', error);
    }
  }

  function workbookMoney(value) {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function workbookPct(value) {
    return `${((Number(value) || 0) * 100).toFixed(1)}%`;
  }

  function workbookPlanCardHtml() {
    const progressWidth = Math.max(6, Math.min(100, Math.round((WORKBOOK_PLAN_SNAPSHOT.planCompletionMonthPct || 0) * 100)));
    return `
      <article class="portal-exec-card is-${WORKBOOK_PLAN_SNAPSHOT.planCompletionMonthPct < 0.8 ? 'warn' : 'ok'}" data-workbook-plan-card="1">
        <div class="portal-exec-card-head">
          <span class="portal-exec-card-label">План месяца по файлу</span>
          <span class="chip info">файл 21.04</span>
        </div>
        <div class="portal-exec-card-value compact">${workbookPct(WORKBOOK_PLAN_SNAPSHOT.planCompletionMonthPct)}</div>
        <div class="portal-exec-sub">План ${workbookMoney(WORKBOOK_PLAN_SNAPSHOT.planRevenueMonth)} · факт ${workbookMoney(WORKBOOK_PLAN_SNAPSHOT.factRevenueToDate)} · к дате ${workbookPct(WORKBOOK_PLAN_SNAPSHOT.planCompletionToDatePct)}</div>
        <div class="portal-exec-progress is-${WORKBOOK_PLAN_SNAPSHOT.planCompletionMonthPct < 0.8 ? 'warn' : 'ok'}"><span style="width:${progressWidth}%"></span></div>
        <div class="portal-exec-axis"><span>Апрель 2026</span><span>Факт на ${WORKBOOK_PLAN_SNAPSHOT.asOfLabel}</span></div>
      </article>
    `;
  }

  function patchInteractiveDashboardPlanView() {
    const strip = document.querySelector('#view-dashboard .portal-exec-metric-strip');
    if (!strip) return false;

    const periodCard = strip.querySelector('[data-portal-exec-open="completion"]:not([data-workbook-plan-card])');
    if (periodCard) {
      const labelNode = periodCard.querySelector('.portal-exec-card-label');
      if (labelNode) labelNode.textContent = 'План периода';
      const subNode = periodCard.querySelector('.portal-exec-sub');
      if (subNode) {
        subNode.textContent = 'Выбранный диапазон считает план линейно по дням. Месячный план из файла показан отдельной карточкой рядом.';
      }
    }

    const workbookCard = strip.querySelector('[data-workbook-plan-card]');
    if (workbookCard) {
      workbookCard.outerHTML = workbookPlanCardHtml();
      return true;
    }

    if (periodCard) {
      periodCard.insertAdjacentHTML('afterend', workbookPlanCardHtml());
      return true;
    }

    strip.insertAdjacentHTML('beforeend', workbookPlanCardHtml());
    return true;
  }

  function currentCompletionSnapshotHotfix(sku) {
    const monthPct = finiteNumberOrNull(
      sku?.planFact?.completionAprMonthPct,
      sku?.planFact?.completionMonthPct
    );
    const toDatePct = finiteNumberOrNull(
      sku?.planFact?.completionAprToDatePct,
      sku?.planFact?.completionToDatePct
    );
    const legacyPct = finiteNumberOrNull(sku?.planFact?.completionFeb26Pct);
    return {
      monthPct,
      toDatePct,
      legacyPct,
      primaryPct: monthPct ?? toDatePct ?? legacyPct
    };
  }

  function dashboardAsOfDay() {
    const value = String(state?.dashboard?.asOfDate || state?.dashboard?.dataFreshness?.asOfDate || '').trim();
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return Number(match[3]) || 0;
    return 0;
  }

  function currentPlanDailyUnitsHotfix(sku) {
    const aprPlan = finiteNumberOrNull(sku?.planFact?.planApr26Units);
    if (aprPlan !== null && aprPlan > 0) return aprPlan / 30;
    const marPlan = finiteNumberOrNull(sku?.planFact?.planMar26Units);
    if (marPlan !== null && marPlan > 0) return marPlan / 31;
    const febPlan = finiteNumberOrNull(sku?.planFact?.planFeb26Units);
    if (febPlan !== null && febPlan > 0) return febPlan / 29;
    return 0;
  }

  function currentFactDailyUnitsHotfix(sku) {
    const aprFact = finiteNumberOrNull(
      sku?.planFact?.factApr16Units,
      sku?.planFact?.factAprToDateUnits
    );
    const dayCount = dashboardAsOfDay();
    if (aprFact !== null && aprFact > 0 && dayCount > 0) return aprFact / dayCount;
    const febFact = finiteNumberOrNull(sku?.planFact?.factFeb26Units);
    if (febFact !== null && febFact > 0) return febFact / 29;
    return 0;
  }

  function rebuildSkuResultCard(articleKey) {
    const sku = typeof getSku === 'function' ? getSku(articleKey) : null;
    const body = document.getElementById('skuModalBody');
    const resultCard = body?.querySelector('.kv-3 .card.subtle');
    if (!sku || !resultCard || typeof metricRow !== 'function') return;

    const completion = currentCompletionSnapshotHotfix(sku);
    const currentPlanUnits = finiteNumberOrNull(sku?.planFact?.planApr26Units);
    const currentFactUnits = finiteNumberOrNull(
      sku?.planFact?.factApr16Units,
      sku?.planFact?.factAprToDateUnits
    );
    const rows = [
      currentPlanUnits !== null
        ? metricRow('\u041f\u043b\u0430\u043d Apr 26', fmt.int(currentPlanUnits))
        : metricRow('\u041f\u043b\u0430\u043d Feb 26', fmt.int(sku?.planFact?.planFeb26Units)),
      currentFactUnits !== null
        ? metricRow('\u0424\u0430\u043a\u0442 Apr to date', fmt.int(currentFactUnits))
        : metricRow('\u0424\u0430\u043a\u0442 Feb 26', fmt.int(sku?.planFact?.factFeb26Units))
    ];

    if (completion.monthPct !== null) {
      rows.push(metricRow('\u0412\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435 \u043c\u0435\u0441\u044f\u0446\u0430', fmt.pct(completion.monthPct), completion.monthPct < 0.8 ? 'danger-text' : ''));
    } else if (completion.legacyPct !== null) {
      rows.push(metricRow('\u0412\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435 Feb 26', fmt.pct(completion.legacyPct), completion.legacyPct < 0.8 ? 'danger-text' : ''));
    }

    if (completion.toDatePct !== null) {
      rows.push(metricRow('\u041a \u043f\u043b\u0430\u043d\u0443 \u043d\u0430 \u0434\u0430\u0442\u0443', fmt.pct(completion.toDatePct), completion.toDatePct < 0.85 ? 'warn-text' : ''));
    }

    resultCard.innerHTML = [
      '<h3>\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442</h3>',
      rows.join(''),
      metricRow('WB \u043c\u0430\u0440\u0436\u0430', fmt.pct(sku?.wb?.marginPct), (sku?.wb?.marginPct || 0) < 0 ? 'danger-text' : ''),
      metricRow('Ozon \u043c\u0430\u0440\u0436\u0430', fmt.pct(sku?.ozon?.marginPct), (sku?.ozon?.marginPct || 0) < 0 ? 'danger-text' : '')
    ].join('');
  }

  const originalRenderSkuModal = typeof window.renderSkuModal === 'function' ? window.renderSkuModal : null;
  if (originalRenderSkuModal) {
    window.renderSkuModal = function renderSkuModalAligned(articleKey) {
      const result = originalRenderSkuModal(articleKey);
      rebuildSkuResultCard(articleKey);
      return result;
    };
  }

  const originalGetOrderCalcBase = typeof window.getOrderCalcBase === 'function' ? window.getOrderCalcBase : null;
  if (originalGetOrderCalcBase) {
    window.getOrderCalcBase = function getOrderCalcBaseAligned() {
      const base = originalGetOrderCalcBase();
      if (!base || !base.sku) return base;

      const ordersDaily = numberOrZero(base.ordersDaily);
      const planDaily = currentPlanDailyUnitsHotfix(base.sku);
      const factDaily = currentFactDailyUnitsHotfix(base.sku);
      let dailySales = Math.max(ordersDaily, planDaily, factDaily);

      if (state.orderCalc.salesSource === 'orders') dailySales = ordersDaily;
      if (state.orderCalc.salesSource === 'plan') dailySales = planDaily || factDaily || ordersDaily;
      if (state.orderCalc.salesSource === 'manual') dailySales = numberOrZero(state.orderCalc.manualDailySales);

      const totalHorizon = numberOrZero(base.daysToNextReceipt) + numberOrZero(base.targetCoverAfter) + numberOrZero(base.safetyDays);
      const demandUnits = dailySales * totalHorizon;
      const rawOrderQty = Math.max(0, demandUnits - numberOrZero(base.availableNow) - numberOrZero(base.inbound));
      const moq = Math.max(0, numberOrZero(state.orderCalc.moq));
      const packSize = Math.max(1, numberOrZero(state.orderCalc.packSize));
      let finalQty = rawOrderQty;

      if (finalQty > 0 && moq > 0) finalQty = Math.max(finalQty, moq);
      if (finalQty > 0) finalQty = Math.ceil(finalQty / packSize) * packSize;

      const coverageNowDays = dailySales > 0 ? numberOrZero(base.availableNow) / dailySales : null;
      const stockoutRisk = coverageNowDays !== null && coverageNowDays < numberOrZero(base.daysToNextReceipt);
      const skuLabel = base.sku.article || base.sku.articleKey || 'SKU';

      return {
        ...base,
        dailySales,
        planDaily,
        factDaily,
        totalHorizon,
        demandUnits,
        rawOrderQty,
        finalQty,
        coverageNowDays,
        stockoutRisk,
        summaryText: `${skuLabel}: \u043f\u0440\u0438 \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u0438 ${fmt.num(dailySales, 1)} \u0448\u0442./\u0434\u0435\u043d\u044c, \u0433\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0435 ${fmt.int(totalHorizon)} \u0434\u043d., \u043d\u0430\u043b\u0438\u0447\u0438\u0438 ${fmt.int(base.availableNow)} \u0448\u0442. \u0438 \u0432\u0445\u043e\u0434\u044f\u0449\u0435\u043c \u0437\u0430\u043f\u0430\u0441\u0435 ${fmt.int(base.inbound)} \u0448\u0442. \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u043e\u0432\u0430\u043d\u043d\u044b\u0439 \u0437\u0430\u043a\u0430\u0437 = ${fmt.int(finalQty)} \u0448\u0442.`
      };
    };
  }

  [0, 250, 1200, 3600, 9000, 18000].forEach((delay) => {
    window.setTimeout(() => {
      applyDashboardPlanAlignment();
      patchInteractiveDashboardPlanView();
    }, delay);
  });
  applyDashboardPlanAlignment();
  patchInteractiveDashboardPlanView();

  if (state?.activeSku) rebuildSkuResultCard(state.activeSku);
})();
