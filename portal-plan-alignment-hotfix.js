(function () {
  if (window.__ALTEA_PLAN_ALIGNMENT_HOTFIX_20260423A__) return;
  window.__ALTEA_PLAN_ALIGNMENT_HOTFIX_20260423A__ = true;

  function finiteNumberOrNull() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = Number(arguments[index]);
      if (Number.isFinite(value)) return value;
    }
    return null;
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

  if (state?.activeSku) rebuildSkuResultCard(state.activeSku);
})();
