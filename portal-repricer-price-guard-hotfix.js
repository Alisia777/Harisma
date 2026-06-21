(function () {
  if (window.__ALTEA_REPRICER_PRICE_GUARD_20260515A__) return;
  window.__ALTEA_REPRICER_PRICE_GUARD_20260515A__ = true;

  const MAX_SAFE_MULTIPLIER = 5;
  const MAX_SAFE_ABSOLUTE = 10000;
  let wrappedSource = null;

  function readBinding(name) {
    try {
      if (typeof window[name] !== "undefined") return window[name];
    } catch {}
    try {
      return Function(`return typeof ${name} === "undefined" ? undefined : ${name}`)();
    } catch {
      return undefined;
    }
  }

  function numberOrZero(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function appendReason(side, reason) {
    const current = String(side.reason || "").trim();
    if (current.includes(reason)) return;
    side.reason = [current, reason].filter(Boolean).join(" · ");
  }

  function quarantineSide(side, limit, reasons) {
    const current = numberOrZero(side.currentPrice);
    side.priceGuardQuarantine = true;
    side.quarantine = true;
    side.priceGuardAudit = {
      code: "GUARD_OUTLIER",
      limit,
      reasons,
      original: {
        currentPrice: current,
        economicFloor: side.economicFloor ?? null,
        effectiveFloor: side.effectiveFloor ?? null,
        recommendedPrice: side.recommendedPrice ?? null,
        finalPrice: side.finalPrice ?? null,
        preAlignPrice: side.preAlignPrice ?? null,
        cappedPrice: side.cappedPrice ?? null
      }
    };
    side.finalReasonCode = "GUARD_OUTLIER";
    appendReason(side, "аномальный fallback-floor отключён");
  }

  function guardSide(side) {
    if (!side || typeof side !== "object") return false;
    const current = numberOrZero(side.currentPrice);
    const finalPrice = numberOrZero(side.finalPrice ?? side.recommendedPrice);
    const hardFloor = Math.max(
      numberOrZero(side.hardFloor),
      numberOrZero(side.b2bFloor),
      numberOrZero(side.skuMinPrice),
      numberOrZero(side.override?.floorPrice)
    );
    const basis = Math.max(current, hardFloor, 1);
    const limit = Math.max(MAX_SAFE_ABSOLUTE, basis * MAX_SAFE_MULTIPLIER);
    const fallbackFloorOutlier = String(side.economicFloorSource || "") === "snapshot_fallback"
      && numberOrZero(side.economicFloor) > limit
      && numberOrZero(side.economicFloorByFee) <= 0
      && !side.rawCostPresent;
    const finalPriceOutlier = finalPrice > limit && !side.promoActive && !side.hasOverride;
    if (!fallbackFloorOutlier && !finalPriceOutlier) return false;

    const reasons = [];
    if (fallbackFloorOutlier) reasons.push("snapshot_fallback_floor_outlier");
    if (finalPriceOutlier) reasons.push("final_price_outlier");
    quarantineSide(side, limit, reasons);
    return true;
  }

  function sanitizeRows(rows) {
    if (!Array.isArray(rows)) return rows;
    rows.forEach(function (row) {
      const wbGuarded = guardSide(row?.wb);
      const ozonGuarded = guardSide(row?.ozon);
      if (!wbGuarded && !ozonGuarded) return;
      row.alignmentChanged = false;
      row.alignmentEligible = false;
      row.alignmentScenario = "GUARD_OUTLIER";
      row.alignmentReason = "fallback-floor guard";
      row.priceGuardQuarantine = true;
      row.priceGuardAudit = {
        wb: row.wb?.priceGuardAudit || null,
        ozon: row.ozon?.priceGuardAudit || null
      };
      row.changed = Boolean(row.wb?.changed || row.ozon?.changed);
      row.belowFloorNow = Boolean(row.wb?.belowFloorNow || row.ozon?.belowFloorNow);
      row.maxAbsDelta = Math.max(Math.abs(numberOrZero(row.wb?.changeRub)), Math.abs(numberOrZero(row.ozon?.changeRub)));
    });
    return rows;
  }

  function installWrapper() {
    const buildRows = readBinding("buildRepricerRows");
    if (typeof buildRows !== "function" || buildRows === wrappedSource || buildRows.__alteaPriceGuardWrapped) return false;
    const wrapped = function () {
      return sanitizeRows(buildRows.apply(this, arguments));
    };
    wrapped.__alteaPriceGuardWrapped = true;
    wrappedSource = wrapped;
    try {
      window.buildRepricerRows = wrapped;
    } catch {}
    return true;
  }

  function rerenderIfNeeded() {
    if (String(readBinding("state")?.activeView || "") !== "repricer") return;
    try {
      const rerender = readBinding("rerenderCurrentView");
      if (typeof rerender === "function") window.setTimeout(rerender, 0);
    } catch {}
  }

  function pass() {
    if (installWrapper()) rerenderIfNeeded();
  }

  function boot() {
    pass();
    [120, 400, 1200, 2500, 5000, 9000].forEach(function (delay) {
      window.setTimeout(pass, delay);
    });
  }

  document.addEventListener("click", function (event) {
    if (!event.target?.closest?.('[data-view="repricer"]')) return;
    window.setTimeout(boot, 120);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("load", boot, { once: true });
})();
