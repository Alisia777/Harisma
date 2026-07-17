(function () {
  if (window.__ALTEA_DATA_GUARD_20260603A__) return;
  window.__ALTEA_DATA_GUARD_20260603A__ = true;

  var VERSION = "20260717-hydration-aware1";
  var SKU_PLAN_SCOPE = "sku-plan-fact";
  var MIN_TRUSTED_PLAN_FACT_ROWS = 170;
  var MAX_ISSUES = 80;
  var MAX_QUARANTINE_ROWS = 120;
  var AUTO_AUDIT_KEY = "altea.dataGuard.lastAuditDate";
  var AUDIT_INTERVAL_MS = 24 * 60 * 60 * 1000;
  var IMPORTANT_VIEWS = [
    "dashboard",
    "executive",
    "sku-plan-fact",
    "data-health",
    "control",
    "repricer",
    "prices",
    "order",
    "oos-control",
    "sku-contour",
    "launches",
    "iu-drr",
    "wb-rating",
    "product-leaderboard"
  ];

  var guard = window.__alteaDataGuardState || {
    version: VERSION,
    status: "pending",
    generatedAt: "",
    metrics: {},
    issues: [],
    quarantineRows: [],
    audit: null,
    lastGood: {},
    wrappers: {}
  };
  guard.version = VERSION;
  window.__alteaDataGuardState = guard;

  function nowIso() {
    return new Date().toISOString();
  }

  function todayKey() {
    return nowIso().slice(0, 10);
  }

  function appState() {
    return window.state || window.__alteaAppState || {};
  }

  function activeViewName() {
    var stateView = String(appState().activeView || "").trim();
    var hashView = String(window.location && window.location.hash || "").replace(/^#\/?/, "").trim();
    return stateView || hashView || "";
  }

  function planFactAuditAllowed() {
    return ["sku-plan-fact", "data-health", "sku-contour", "iu-drr", "executive"].indexOf(activeViewName()) >= 0;
  }

  function planFactHydrationPending(model) {
    var boot = appState().boot || {};
    return Boolean(
      model && model.deferred
      || boot.dataReady !== true
      || boot.lazyReady && boot.lazyReady.skuPlanFact !== true
      || boot.lazyLoads && boot.lazyLoads.skuPlanFact
    );
  }

  function numberOrZero(value) {
    var numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function roundMoney(value) {
    return Math.round(numberOrZero(value));
  }

  function dateKey(value) {
    var raw = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  }

  function monthDays(monthKey) {
    var match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) return 31;
    return new Date(Number(match[1]), Number(match[2]), 0).getDate();
  }

  function monthEnd(monthKey) {
    return monthKey ? monthKey + "-" + String(monthDays(monthKey)).padStart(2, "0") : "";
  }

  function textIncludesBadMonthEnd(text, monthKey, allowedDate) {
    var end = monthEnd(monthKey);
    return Boolean(end && end !== allowedDate && String(text || "").includes(end));
  }

  function stableIssueKey(issue) {
    return [
      issue.scope || "",
      issue.code || "",
      issue.source || "",
      issue.metric || "",
      issue.periodTo || "",
      issue.message || ""
    ].join("|");
  }

  function setStatus() {
    var blocking = guard.issues.filter(function (issue) { return issue.severity === "block"; }).length;
    var warnings = guard.issues.filter(function (issue) { return issue.severity === "warn"; }).length;
    guard.status = blocking ? "blocked" : (warnings ? "warn" : "ok");
    guard.generatedAt = nowIso();
    syncPortalQualityState();
    paintDataGuardPanel();
    return guard.status;
  }

  function addIssue(issue) {
    var next = Object.assign({
      id: "",
      scope: "portal",
      source: "data-guard",
      severity: "warn",
      code: "guard_warning",
      message: "",
      generatedAt: nowIso()
    }, issue || {});
    next.id = next.id || stableIssueKey(next);
    guard.issues = guard.issues.filter(function (item) { return item.id !== next.id; });
    guard.issues.unshift(next);
    if (guard.issues.length > MAX_ISSUES) guard.issues.length = MAX_ISSUES;
    if (next.severity === "block") addQuarantine(next);
    setStatus();
    return next;
  }

  function clearScope(scope) {
    guard.issues = guard.issues.filter(function (issue) { return issue.scope !== scope; });
    guard.quarantineRows = guard.quarantineRows.filter(function (row) { return row.scope !== scope; });
    setStatus();
  }

  function addQuarantine(issue) {
    var row = {
      id: issue.id || stableIssueKey(issue),
      scope: issue.scope || "portal",
      source: issue.source || "data-guard",
      code: issue.code || "guard_block",
      severity: issue.severity || "block",
      message: issue.message || "",
      metric: issue.metric || "",
      period_from: issue.periodFrom || "",
      period_to: issue.periodTo || "",
      value: issue.value,
      generatedAt: issue.generatedAt || nowIso()
    };
    guard.quarantineRows = guard.quarantineRows.filter(function (item) { return item.id !== row.id; });
    guard.quarantineRows.unshift(row);
    if (guard.quarantineRows.length > MAX_QUARANTINE_ROWS) guard.quarantineRows.length = MAX_QUARANTINE_ROWS;
  }

  function metricPassport(key, value, context) {
    var issueCount = guard.issues.filter(function (issue) {
      return issue.metric === key || issue.scope === (context && context.scope);
    }).length;
    var blockingCount = guard.issues.filter(function (issue) {
      return issue.severity === "block" && (issue.metric === key || issue.scope === (context && context.scope));
    }).length;
    var passport = {
      key: key,
      value: value,
      periodFrom: context && context.periodFrom || "",
      periodTo: context && context.periodTo || "",
      source: context && context.source || "unknown",
      updatedAt: context && context.updatedAt || nowIso(),
      confidence: blockingCount ? "blocked" : (issueCount ? "warn" : "ok"),
      warnings: guard.issues
        .filter(function (issue) { return issue.metric === key || issue.scope === (context && context.scope); })
        .slice(0, 8)
        .map(function (issue) { return issue.message; })
    };
    guard.metrics[key] = passport;
    return passport;
  }

  function modelTotals(model) {
    return model && model.totals && typeof model.totals === "object" ? model.totals : {};
  }

  function defaultPlanFactFilters() {
    return {
      search: "",
      owner: "all",
      status: "all",
      platform: "all",
      month: "latest",
      date: "",
      dateFrom: "",
      dateTo: "",
      dateMode: "latest",
      sort: "gap",
      sortDir: "asc"
    };
  }

  function platformApiSum(model) {
    var totals = modelTotals(model);
    var sources = [
      totals.platforms,
      totals.payrollPlatforms,
      model && model.platformTotals,
      model && model.platformsTotals
    ].filter(Boolean);
    for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      var source = sources[sourceIndex];
      var sum = 0;
      var found = false;
      Object.keys(source || {}).forEach(function (key) {
        var metric = source[key] || {};
        var value = metric.apiFactRevenue;
        if (value === undefined) value = metric.kpiFactRevenue;
        if (value === undefined) value = metric.factRevenue;
        if (Number.isFinite(Number(value))) {
          found = true;
          sum += Number(value);
        }
      });
      if (found) return Math.round(sum);
    }
    return null;
  }

  function validatePlanFactModel(model, options) {
    var scope = (options && options.scope) || SKU_PLAN_SCOPE;
    clearScope(scope);
    if (!model || typeof model !== "object") {
      addIssue({
        scope: scope,
        severity: "block",
        code: "model_missing",
        message: "Plan-fact model is missing.",
        source: "skuPlanFactBuildModel"
      });
      return { ok: false, status: guard.status, issues: guard.issues.filter(function (issue) { return issue.scope === scope; }) };
    }

    var totals = modelTotals(model);
    var periodFrom = dateKey(model.periodStart || model.dateMin);
    var periodTo = dateKey(model.periodEnd || model.selectedDate || model.maxFactDate);
    var planMonth = String(model.monthKey || (periodTo ? periodTo.slice(0, 7) : "") || "");
    var monthLastDate = monthEnd(planMonth);
    var rowCount = Array.isArray(model.rows) ? model.rows.length : 0;
    var allRowsCount = Array.isArray(model.allRows) ? model.allRows.length : rowCount;
    var kpiFact = roundMoney(totals.kpiFactRevenue !== undefined ? totals.kpiFactRevenue : totals.factRevenue);
    var apiFact = roundMoney(totals.apiFactRevenue);
    var delta = roundMoney(totals.kpiFactDelta !== undefined ? totals.kpiFactDelta : kpiFact - apiFact);
    var source = options && options.source || "skuPlanFactBuildModel";

    metricPassport("skuPlanFact.kpiFactRevenue", kpiFact, { scope: scope, periodFrom: periodFrom, periodTo: periodTo, source: source });
    metricPassport("skuPlanFact.apiFactRevenue", apiFact, { scope: scope, periodFrom: periodFrom, periodTo: periodTo, source: source });
    metricPassport("skuPlanFact.kpiApiDelta", delta, { scope: scope, periodFrom: periodFrom, periodTo: periodTo, source: source });
    metricPassport("skuPlanFact.rowCount", rowCount, { scope: scope, periodFrom: periodFrom, periodTo: periodTo, source: source });

    if (!periodFrom || !periodTo) {
      addIssue({
        scope: scope,
        severity: "block",
        code: "period_missing",
        source: source,
        periodFrom: periodFrom,
        periodTo: periodTo,
        message: "Plan-fact period is not defined."
      });
    }
    if (periodFrom && periodTo && periodFrom > periodTo) {
      addIssue({
        scope: scope,
        severity: "block",
        code: "period_reversed",
        source: source,
        periodFrom: periodFrom,
        periodTo: periodTo,
        message: "Plan-fact period start is later than period end."
      });
    }
    if (monthLastDate && periodTo === monthLastDate && kpiFact > 0 && apiFact <= 0) {
      addIssue({
        scope: scope,
        severity: "block",
        code: "month_end_without_api",
        source: source,
        metric: "skuPlanFact.apiFactRevenue",
        periodFrom: periodFrom,
        periodTo: periodTo,
        value: apiFact,
        message: "Plan-fact uses month end while API fact is empty."
      });
    }
    if (kpiFact > 0 && apiFact <= 0) {
      addIssue({
        scope: scope,
        severity: "block",
        code: "api_fact_empty",
        source: source,
        metric: "skuPlanFact.apiFactRevenue",
        periodFrom: periodFrom,
        periodTo: periodTo,
        value: apiFact,
        message: "KPI fact is positive, but API fact is empty."
      });
    }
    var filters = model.filters || {};
    var unfilteredScope = Boolean(
      !filters.search
      && (!filters.owner || filters.owner === "all")
      && (!filters.platform || filters.platform === "all")
      && (!filters.status || filters.status === "all")
    );
    if (unfilteredScope && kpiFact > 0 && rowCount > 0 && rowCount < MIN_TRUSTED_PLAN_FACT_ROWS && !planFactHydrationPending(model)) {
      addIssue({
        scope: scope,
        severity: "block",
        code: "row_count_incomplete",
        source: source,
        periodFrom: periodFrom,
        periodTo: periodTo,
        value: rowCount,
        message: "Plan-fact row count is below the trusted hydrated contour."
      });
    } else if (unfilteredScope && rowCount > 0 && allRowsCount > 0 && rowCount < Math.min(120, Math.round(allRowsCount * 0.65))) {
      addIssue({
        scope: scope,
        severity: "warn",
        code: "row_count_drop",
        source: source,
        periodFrom: periodFrom,
        periodTo: periodTo,
        value: rowCount,
        message: "Filtered plan-fact row count is unexpectedly low."
      });
    }
    var pSum = platformApiSum(model);
    if (pSum !== null && apiFact > 0 && Math.abs(pSum - apiFact) > 1000) {
      addIssue({
        scope: scope,
        severity: "warn",
        code: "platform_sum_mismatch",
        source: source,
        metric: "skuPlanFact.apiFactRevenue",
        periodFrom: periodFrom,
        periodTo: periodTo,
        value: apiFact,
        message: "Platform API sum does not match total API fact."
      });
    }

    var scopeIssues = guard.issues.filter(function (issue) { return issue.scope === scope; });
    ["skuPlanFact.kpiFactRevenue", "skuPlanFact.apiFactRevenue", "skuPlanFact.kpiApiDelta", "skuPlanFact.rowCount"].forEach(function (key) {
      var currentPassport = guard.metrics[key];
      if (!currentPassport) return;
      metricPassport(key, currentPassport.value, {
        scope: scope,
        periodFrom: currentPassport.periodFrom,
        periodTo: currentPassport.periodTo,
        source: currentPassport.source,
        updatedAt: currentPassport.updatedAt
      });
    });
    scopeIssues = guard.issues.filter(function (issue) { return issue.scope === scope; });
    if (!scopeIssues.some(function (issue) { return issue.severity === "block"; })) {
      guard.lastGood[scope] = {
        periodFrom: periodFrom,
        periodTo: periodTo,
        rowCount: rowCount,
        kpiFactRevenue: kpiFact,
        apiFactRevenue: apiFact,
        kpiApiDelta: delta,
        savedAt: nowIso()
      };
      if (scope === SKU_PLAN_SCOPE) guard.lastTrustedPlanFactModel = model;
    }
    setStatus();
    try {
      Object.defineProperty(model, "__dataGuard", {
        configurable: true,
        enumerable: false,
        value: {
          status: guard.status,
          issues: scopeIssues,
          passports: {
            kpiFactRevenue: guard.metrics["skuPlanFact.kpiFactRevenue"],
            apiFactRevenue: guard.metrics["skuPlanFact.apiFactRevenue"],
            kpiApiDelta: guard.metrics["skuPlanFact.kpiApiDelta"]
          }
        }
      });
    } catch (error) {
      model.__dataGuard = { status: guard.status, issues: scopeIssues };
    }
    return {
      ok: !scopeIssues.some(function (issue) { return issue.severity === "block"; }),
      status: guard.status,
      issues: scopeIssues
    };
  }

  function validateExportRows(filename, columns, rows) {
    var name = String(filename || "");
    if (!/^sku-plan-fact/i.test(name)) return { ok: true, issues: [] };
    var text = JSON.stringify(rows || []);
    var hasMonthEnd = textIncludesBadMonthEnd(text, "2026-06", "2026-06-02");
    var first = Array.isArray(rows) && rows.length ? rows[0] : {};
    var apiFact = roundMoney(first.api_fact_total_revenue);
    var kpiFact = roundMoney(first.kpi_fact_total_revenue);
    var issues = [];
    if (hasMonthEnd) {
      issues.push(addIssue({
        scope: "export",
        severity: "block",
        code: "export_bad_period",
        source: "downloadLaunchesHtmlTable",
        periodTo: first.period_to || first.fact_to || "",
        message: "SKU plan-fact export contains a month-end fact date."
      }));
    }
    if (kpiFact > 0 && apiFact <= 0) {
      issues.push(addIssue({
        scope: "export",
        severity: "block",
        code: "export_api_fact_empty",
        source: "downloadLaunchesHtmlTable",
        metric: "skuPlanFact.apiFactRevenue",
        periodFrom: first.period_from || "",
        periodTo: first.period_to || "",
        value: apiFact,
        message: "SKU plan-fact export has KPI fact but empty API fact."
      }));
    }
    return { ok: !issues.some(function (issue) { return issue.severity === "block"; }), issues: issues };
  }

  function validateSnapshotPayload(path, payload) {
    var key = String(path || "");
    if (!key || payload == null) return { ok: true, issues: [] };
    var issues = [];
    if (/product_leaderboard_history/.test(key) && !Array.isArray(payload)) {
      issues.push(addIssue({
        scope: "snapshot",
        severity: "block",
        code: "snapshot_shape",
        source: key,
        message: "Product leaderboard history snapshot is not an array."
      }));
    }
    if (/portal_data_quality/.test(key) && (!payload || typeof payload.summary !== "object")) {
      issues.push(addIssue({
        scope: "snapshot",
        severity: "warn",
        code: "quality_shape",
        source: key,
        message: "Data quality snapshot has no summary."
      }));
    }
    if (/portal_data_quarantine/.test(key) && payload && !Array.isArray(payload.rows)) {
      issues.push(addIssue({
        scope: "snapshot",
        severity: "warn",
        code: "quarantine_shape",
        source: key,
        message: "Data quarantine snapshot has no rows array."
      }));
    }
    return { ok: !issues.some(function (issue) { return issue.severity === "block"; }), issues: issues };
  }

  function syncPortalQualityState() {
    var state = appState();
    if (!state || typeof state !== "object") return;
    var blocking = guard.issues.filter(function (issue) { return issue.severity === "block"; }).length;
    var warnings = guard.issues.filter(function (issue) { return issue.severity === "warn"; }).length;
    state.portalDataQuality = state.portalDataQuality && typeof state.portalDataQuality === "object"
      ? state.portalDataQuality
      : { schema: "portal-data-quality-v1", summary: {}, issues: [] };
    state.portalDataQuality.summary = state.portalDataQuality.summary && typeof state.portalDataQuality.summary === "object"
      ? state.portalDataQuality.summary
      : {};
    state.portalDataQuality.dataGuard = {
      version: VERSION,
      status: guard.status,
      generatedAt: guard.generatedAt,
      blockingIssues: blocking,
      warnings: warnings,
      metrics: guard.metrics,
      lastGood: guard.lastGood
    };
    state.portalDataQuality.summary.dataGuardBlockingIssues = blocking;
    state.portalDataQuality.summary.dataGuardWarnings = warnings;

    state.portalDataQuarantine = state.portalDataQuarantine && typeof state.portalDataQuarantine === "object"
      ? state.portalDataQuarantine
      : { schema: "portal-data-quarantine-v1", summary: {}, rows: [] };
    var existing = Array.isArray(state.portalDataQuarantine.rows) ? state.portalDataQuarantine.rows : [];
    var nonGuardRows = existing.filter(function (row) { return row && row.source !== "data-guard"; });
    state.portalDataQuarantine.rows = nonGuardRows.concat(guard.quarantineRows).slice(0, MAX_QUARANTINE_ROWS);
    state.portalDataQuarantine.summary = Object.assign({}, state.portalDataQuarantine.summary || {}, {
      dataGuardRows: guard.quarantineRows.length,
      dataGuardBlockingIssues: blocking
    });
  }

  function paintDataGuardPanel() {
    var host = document.getElementById("view-data-health");
    if (!host) return;
    if (!guard.lastTrustedPlanFactModel && !guard.planFactHydrationPromise && typeof window.skuPlanFactBuildModel === "function" && (guard.panelHydrationRetries || 0) < 5) {
      guard.panelHydrationRetries = (guard.panelHydrationRetries || 0) + 1;
      hydrateTrustedPlanFactMetrics("dataHealthPanel");
    }
    var panel = host.querySelector("[data-portal-data-guard-panel]");
    if (panel) panel.remove();
    if (!window.__ALTEA_SHOW_DATA_GUARD_PANEL__) return;
    var ready = host.classList.contains("active") || (appState().activeView === "data-health");
    if (!ready) return;
    panel = host.querySelector("[data-portal-data-guard-panel]");
    if (!panel) {
      panel = document.createElement("div");
      panel.setAttribute("data-portal-data-guard-panel", "true");
      panel.className = "card portal-data-guard-panel";
      host.insertBefore(panel, host.firstChild || null);
    }
    var statusText = guard.status === "ok" ? "OK" : (guard.status === "blocked" ? "BLOCKED" : "WARN");
    var blocking = guard.issues.filter(function (issue) { return issue.severity === "block"; }).length;
    var warnings = guard.issues.filter(function (issue) { return issue.severity === "warn"; }).length;
    var metrics = guard.metrics || {};
    var kpi = metrics["skuPlanFact.kpiFactRevenue"];
    var api = metrics["skuPlanFact.apiFactRevenue"];
    var delta = metrics["skuPlanFact.kpiApiDelta"];
    var issueHtml = guard.issues.slice(0, 5).map(function (issue) {
      return "<li><strong>" + escapeHtml(issue.code || "") + "</strong> " + escapeHtml(issue.message || "") + "</li>";
    }).join("");
    panel.innerHTML = [
      "<div class=\"section-title\"><div><h3>Data Guard</h3><p>Metric passports, invariants, quarantine and audit guardrails.</p></div>",
      "<div class=\"badge " + (guard.status === "ok" ? "ok" : (guard.status === "blocked" ? "danger" : "warn")) + "\">" + statusText + "</div></div>",
      "<div class=\"kpi-grid compact\">",
      metricMiniHtml("KPI fact", kpi && kpi.value, kpi && kpi.confidence),
      metricMiniHtml("API fact", api && api.value, api && api.confidence),
      metricMiniHtml("Delta", delta && delta.value, delta && delta.confidence),
      metricMiniHtml("Issues", blocking + warnings, blocking ? "blocked" : (warnings ? "warn" : "ok")),
      "</div>",
      issueHtml ? "<ul class=\"small muted\">" + issueHtml + "</ul>" : "<div class=\"small muted\">No active data guard issues.</div>"
    ].join("");
  }

  function metricMiniHtml(label, value, confidence) {
    var tone = confidence === "blocked" ? "danger" : (confidence === "warn" ? "warn" : "ok");
    var display = confidence === "blocked" ? "blocked" : (value === null || value === undefined || value === "" ? "n/a" : String(value));
    return "<div class=\"mini-kpi\"><span>" + escapeHtml(label) + "</span><strong class=\"" + tone + "\">" + escapeHtml(display) + "</strong></div>";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function installStyles() {
    if (document.getElementById("portal-data-guard-style")) return;
    var style = document.createElement("style");
    style.id = "portal-data-guard-style";
    style.textContent = [
      ".portal-data-guard-panel{margin:0 0 16px 0;border:1px solid rgba(255,255,255,.12);background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.025));}",
      ".portal-data-guard-panel .kpi-grid.compact{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0;}",
      ".portal-data-guard-panel .mini-kpi{min-height:72px;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(0,0,0,.18);}",
      ".portal-data-guard-panel .mini-kpi span{display:block;font-size:11px;opacity:.72;text-transform:uppercase;}",
      ".portal-data-guard-panel .mini-kpi strong{display:block;margin-top:8px;font-size:18px;}",
      ".portal-data-guard-panel .mini-kpi strong.ok{color:#9be7b2;}",
      ".portal-data-guard-panel .mini-kpi strong.warn{color:#f3c969;}",
      ".portal-data-guard-panel .mini-kpi strong.danger{color:#ff9a9a;}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function wrapBuildModel() {
    if (typeof window.skuPlanFactBuildModel !== "function") return false;
    if (window.skuPlanFactBuildModel.__dataGuardWrapped) return true;
    var original = window.skuPlanFactBuildModel;
    var wrapped = function guardedSkuPlanFactBuildModel() {
      var model = original.apply(this, arguments);
      if (model && model.deferred) return model;
      validatePlanFactModel(model, { scope: SKU_PLAN_SCOPE, source: "skuPlanFactBuildModel" });
      return model;
    };
    wrapped.__dataGuardWrapped = true;
    wrapped.__dataGuardOriginal = original;
    window.skuPlanFactBuildModel = wrapped;
    guard.wrappers.skuPlanFactBuildModel = true;
    return true;
  }

  function wrapDownloadTable() {
    if (typeof window.downloadLaunchesHtmlTable !== "function") return false;
    if (window.downloadLaunchesHtmlTable.__dataGuardWrapped) return true;
    var original = window.downloadLaunchesHtmlTable;
    var wrapped = function guardedDownloadLaunchesHtmlTable(columns, rows, filename) {
      var validation = validateExportRows(filename, columns, rows);
      if (!validation.ok) {
        if (typeof window.alert === "function") window.alert("Data Guard blocked export: metrics are not trusted yet.");
        return null;
      }
      return original.apply(this, arguments);
    };
    wrapped.__dataGuardWrapped = true;
    wrapped.__dataGuardOriginal = original;
    window.downloadLaunchesHtmlTable = wrapped;
    guard.wrappers.downloadLaunchesHtmlTable = true;
    return true;
  }

  function wrapSnapshotLoader() {
    if (typeof window.__alteaLoadPortalSnapshot !== "function") return false;
    if (window.__alteaLoadPortalSnapshot.__dataGuardWrapped) return true;
    var original = window.__alteaLoadPortalSnapshot;
    var wrapped = async function guardedLoadPortalSnapshot(path, options) {
      var payload = await original.apply(this, arguments);
      validateSnapshotPayload(path, payload);
      return payload;
    };
    wrapped.__dataGuardWrapped = true;
    wrapped.__dataGuardOriginal = original;
    window.__alteaLoadPortalSnapshot = wrapped;
    guard.wrappers.snapshotLoader = true;
    return true;
  }

  function wrapDataHealthRender() {
    if (typeof window.renderPortalDataHealth !== "function") return false;
    if (window.renderPortalDataHealth.__dataGuardWrapped) return true;
    var original = window.renderPortalDataHealth;
    var wrapped = function guardedRenderPortalDataHealth() {
      var result = original.apply(this, arguments);
      window.setTimeout(paintDataGuardPanel, 0);
      return result;
    };
    wrapped.__dataGuardWrapped = true;
    wrapped.__dataGuardOriginal = original;
    window.renderPortalDataHealth = wrapped;
    guard.wrappers.renderPortalDataHealth = true;
    return true;
  }

  async function hydrateTrustedPlanFactMetrics(reason) {
    if (!planFactAuditAllowed() && reason !== "manual") return null;
    if (guard.planFactHydrationPromise) return guard.planFactHydrationPromise;
    guard.planFactHydrationPromise = (async function () {
      if (typeof window.skuPlanFactBuildModel !== "function") return null;
      var model = window.skuPlanFactBuildModel(defaultPlanFactFilters(), { persistFilters: false });
      if (typeof window.skuPlanFactHydratedExportModel === "function") {
        model = await window.skuPlanFactHydratedExportModel(model);
      }
      validatePlanFactModel(model, { scope: SKU_PLAN_SCOPE, source: reason || "dataGuardHydration" });
      return model;
    })().catch(function (error) {
      addIssue({
        scope: SKU_PLAN_SCOPE,
        severity: "warn",
        code: "hydration_failed",
        source: reason || "dataGuardHydration",
        message: error && error.message || String(error)
      });
      return null;
    }).finally(function () {
      guard.planFactHydrationPromise = null;
      paintDataGuardPanel();
    });
    return guard.planFactHydrationPromise;
  }

  function installWrappers() {
    installStyles();
    var complete = [
      wrapBuildModel(),
      wrapDownloadTable(),
      wrapSnapshotLoader(),
      wrapDataHealthRender()
    ].every(Boolean);
    return complete;
  }

  function runMetricAudit() {
    if (!planFactAuditAllowed()) return guard.audit;
    var startedAt = nowIso();
    var model = null;
    var validation = null;
    clearScope("audit");
    var viewResults = IMPORTANT_VIEWS.map(function (view) {
      var el = document.getElementById("view-" + view);
      var text = el ? String(el.innerText || el.textContent || "").replace(/\u00a0/g, " ") : "";
      return {
        view: view,
        mounted: Boolean(el),
        hasDatabaseTimeout: /DatabaseTimeout|database timed out/i.test(text),
        hasBadJune30: text.includes("2026-06-30")
      };
    });
    try {
      if (guard.lastTrustedPlanFactModel) {
        model = guard.lastTrustedPlanFactModel;
        validation = validatePlanFactModel(model, { scope: SKU_PLAN_SCOPE, source: "dataGuardAuditTrusted" });
      } else if (typeof window.skuPlanFactBuildModel === "function") {
        model = window.skuPlanFactBuildModel(defaultPlanFactFilters(), { persistFilters: false });
        validation = validatePlanFactModel(model, { scope: SKU_PLAN_SCOPE, source: "dataGuardAudit" });
      }
    } catch (error) {
      addIssue({
        scope: "audit",
        severity: "block",
        code: "audit_exception",
        source: "runMetricAudit",
        message: error && error.message || String(error)
      });
    }
    viewResults.forEach(function (result) {
      if (result.hasDatabaseTimeout) {
        addIssue({
          scope: "audit",
          severity: "block",
          code: "view_database_timeout",
          source: result.view,
          message: "View contains DatabaseTimeout."
        });
      }
      if (result.hasBadJune30) {
        addIssue({
          scope: "audit",
          severity: "block",
          code: "view_bad_period",
          source: result.view,
          message: "View contains 2026-06-30."
        });
      }
    });
    guard.audit = {
      version: VERSION,
      startedAt: startedAt,
      finishedAt: nowIso(),
      status: guard.status,
      validation: validation,
      views: viewResults,
      metrics: guard.metrics,
      issues: guard.issues.slice()
    };
    setStatus();
    return guard.audit;
  }

  function maybeRunDailyAudit() {
    if (!planFactAuditAllowed()) return;
    try {
      var last = window.localStorage && window.localStorage.getItem(AUTO_AUDIT_KEY);
      if (last === todayKey()) return;
      var lastAt = guard.audit && Date.parse(guard.audit.finishedAt || guard.audit.startedAt || "");
      if (lastAt && Date.now() - lastAt < AUDIT_INTERVAL_MS) return;
      if (typeof window.skuPlanFactBuildModel === "function") {
        var probe = window.skuPlanFactBuildModel(defaultPlanFactFilters(), { persistFilters: false });
        if (skuPlanFactModelNeedsAuditHydration(probe)) {
          guard.autoAuditRetries = (guard.autoAuditRetries || 0) + 1;
          if (guard.autoAuditRetries <= 8) {
            hydrateTrustedPlanFactMetrics("autoAuditHydration").then(function () {
              window.setTimeout(maybeRunDailyAudit, 500);
            });
          }
          return;
        }
      }
      var audit = runMetricAudit();
      if (window.localStorage && audit) window.localStorage.setItem(AUTO_AUDIT_KEY, todayKey());
    } catch (error) {
      addIssue({
        scope: "audit",
        severity: "warn",
        code: "daily_audit_failed",
        source: "maybeRunDailyAudit",
        message: error && error.message || String(error)
      });
    }
  }

  function skuPlanFactModelNeedsAuditHydration(model) {
    if (!model || typeof model !== "object") return true;
    var totals = modelTotals(model);
    var apiFact = roundMoney(totals.apiFactRevenue);
    var kpiFact = roundMoney(totals.kpiFactRevenue !== undefined ? totals.kpiFactRevenue : totals.factRevenue);
    var end = dateKey(model.periodEnd || model.selectedDate || model.maxFactDate);
    var last = monthEnd(model.monthKey || (end ? end.slice(0, 7) : ""));
    var rowCount = Array.isArray(model.rows) ? model.rows.length : 0;
    return Boolean(
      (kpiFact > 0 && apiFact <= 0 && end && last && end === last)
      || (kpiFact > 0 && rowCount > 0 && rowCount < MIN_TRUSTED_PLAN_FACT_ROWS)
    );
  }

  function installWithRetry() {
    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      var done = installWrappers();
      if (done || tries > 40) {
        window.clearInterval(timer);
        if (typeof window.skuPlanFactBuildModel === "function") {
          window.setTimeout(function () {
            if (planFactAuditAllowed()) hydrateTrustedPlanFactMetrics("startup").then(maybeRunDailyAudit);
          }, 1200);
        }
      }
    }, 250);
    installWrappers();
  }

  function installDeferredAuditHooks() {
    if (guard.deferredAuditHooksInstalled) return;
    guard.deferredAuditHooksInstalled = true;
    ["altea:viewchange", "hashchange"].forEach(function (eventName) {
      window.addEventListener(eventName, function () {
        if (!planFactAuditAllowed() || typeof window.skuPlanFactBuildModel !== "function") return;
        window.setTimeout(function () {
          hydrateTrustedPlanFactMetrics("route").then(maybeRunDailyAudit);
        }, 350);
      });
    });
  }

  window.__alteaDataGuard = {
    version: VERSION,
    state: guard,
    validatePlanFactModel: validatePlanFactModel,
    validateExportRows: validateExportRows,
    validateSnapshotPayload: validateSnapshotPayload,
    metricPassport: metricPassport,
    runAudit: runMetricAudit,
    install: installWrappers,
    status: function () { return guard.status; },
    getMetric: function (key) { return guard.metrics[key] || null; },
    allMetrics: function () { return Object.assign({}, guard.metrics); },
    issues: function () { return guard.issues.slice(); },
    quarantine: function () { return guard.quarantineRows.slice(); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installWithRetry, { once: true });
  } else {
    installWithRetry();
  }
  installDeferredAuditHooks();
})();
