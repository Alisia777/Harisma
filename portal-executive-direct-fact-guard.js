(function applyExecutiveDirectFactGuard() {
  const marker = 'direct_fact_only';
  if (typeof window === 'undefined') return;
  if (typeof executiveFunnelNumber !== 'function' || typeof executiveFunnelFinalizePlanBucket !== 'function') return;
  const nativeApplyMissingPayrollFacts = typeof window.executiveFunnelApplyMissingPayrollFacts === 'function'
    ? window.executiveFunnelApplyMissingPayrollFacts
    : (typeof executiveFunnelApplyMissingPayrollFacts === 'function' ? executiveFunnelApplyMissingPayrollFacts : null);
  const nativeScalePlanBucket = typeof window.executiveFunnelScalePlanBucket === 'function'
    ? window.executiveFunnelScalePlanBucket
    : (typeof executiveFunnelScalePlanBucket === 'function' ? executiveFunnelScalePlanBucket : null);

  function directFactBucketHasKpiPlan(metric = {}) {
    return Boolean(metric && (
      executiveFunnelNumber(metric.planToDateRevenue) > 0
      || executiveFunnelNumber(metric.planRevenue) > 0
      || executiveFunnelNumber(metric.planUnits) > 0
      || executiveFunnelNumber(metric.planMarginRub) > 0
      || metric.planAdSpend !== null && metric.planAdSpend !== undefined
    ));
  }

  function directFactMissingPayrollFacts(ownerMap = new Map(), platform = '', target = {}, raw = {}) {
    const targetRevenue = executiveFunnelNumber(target.factRevenue);
    const targetUnits = executiveFunnelNumber(target.factUnits);
    const targetAdSpend = executiveFunnelNumber(target.adSpend);
    const targetMarginRub = executiveFunnelNumber(target.marginRub);
    const targetMarginPct = typeof executiveFunnelRatio === 'function' ? executiveFunnelRatio(target.marginPct) : null;
    const allocateRevenue = targetRevenue > 0 && executiveFunnelNumber(raw.factRevenue) <= 0;
    const allocateAdSpend = targetAdSpend > 0 && executiveFunnelNumber(raw.adSpend) <= 0;
    const allocateMargin = allocateRevenue && (targetMarginRub > 0 || targetMarginPct !== null);
    if (!allocateRevenue && !allocateAdSpend && !allocateMargin) return null;

    const entries = [...ownerMap.values()]
      .map((ownerBucket) => ({
        owner: ownerBucket.owner,
        metric: ownerBucket.platforms?.get(platform) || null
      }))
      .filter(({ metric }) => metric && directFactBucketHasKpiPlan(metric));
    if (!entries.length) return null;

    return {
      basis: marker,
      blockedSyntheticAllocation: true,
      owners: entries.length,
      revenue: allocateRevenue,
      adSpend: allocateAdSpend,
      margin: allocateMargin,
      unallocated: {
        factRevenue: allocateRevenue ? targetRevenue : 0,
        factUnits: allocateRevenue && targetUnits > 0 ? targetUnits : 0,
        adSpend: allocateAdSpend ? targetAdSpend : 0,
        marginRub: allocateMargin ? targetMarginRub : 0
      }
    };
  }

  function directFactScalePlanBucket(bucket = {}, ratios = {}) {
    if (!bucket) return bucket;
    const apiFactRevenue = executiveFunnelNumber(bucket.apiFactRevenue || bucket.factRevenue);
    const apiPlanToDateRevenue = executiveFunnelNumber(bucket.apiPlanToDateRevenue || bucket.planToDateRevenue);
    const apiMarginRub = executiveFunnelNumber(bucket.apiMarginRub || bucket.marginRub);
    bucket.payrollControlScaleBlocked = true;
    bucket.payrollControlScaleMode = marker;
    bucket.payrollControlScaleRatios = ratios;
    bucket.payrollKpi = true;
    bucket.apiFactRevenue = apiFactRevenue;
    bucket.apiPlanToDateRevenue = apiPlanToDateRevenue;
    bucket.apiMarginRub = apiMarginRub;
    bucket.kpiFactRevenue = bucket.factRevenue;
    bucket.kpiFactDelta = bucket.apiFactRevenue > 0 ? bucket.factRevenue - bucket.apiFactRevenue : 0;
    return executiveFunnelFinalizePlanBucket(bucket);
  }

  window.executiveFunnelApplyMissingPayrollFacts = executiveFunnelApplyMissingPayrollFacts = function guardedMissingPayrollFacts(ownerMap, platform, target, raw) {
    const allocation = nativeApplyMissingPayrollFacts
      ? nativeApplyMissingPayrollFacts(ownerMap, platform, target, raw)
      : directFactMissingPayrollFacts(ownerMap, platform, target, raw);
    if (allocation && typeof allocation === 'object') allocation.guard = marker;
    return allocation;
  };
  window.executiveFunnelScalePlanBucket = executiveFunnelScalePlanBucket = function guardedScalePlanBucket(bucket, ratios) {
    const scaled = nativeScalePlanBucket
      ? nativeScalePlanBucket(bucket, ratios)
      : directFactScalePlanBucket(bucket, ratios);
    if (scaled && typeof scaled === 'object') scaled.guard = marker;
    return scaled;
  };
  window.__ALTEA_EXECUTIVE_DIRECT_FACT_GUARD__ = {
    mode: marker,
    syntheticAllocationBlocked: false,
    payrollControlScalingBlocked: false
  };

  window.setTimeout(() => {
    if (window.state?.currentView !== 'executive') return;
    if (typeof renderExecutiveView === 'function') renderExecutiveView();
  }, 0);
})();
