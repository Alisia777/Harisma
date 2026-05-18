(function () {
  if (window.__ALTEA_SKU_REGISTRY_NOTE_CLEANUP_20260515__) return;
  window.__ALTEA_SKU_REGISTRY_NOTE_CLEANUP_20260515__ = true;

  function run() {
    document.querySelectorAll("[data-sku-live-note]").forEach(function (node) {
      node.remove();
    });
  }

  function installSkuContourImportFix() {
    if (window.__ALTEA_SKU_CONTOUR_IMPORT_FIX_20260518__) return;
    window.__ALTEA_SKU_CONTOUR_IMPORT_FIX_20260518__ = true;

    var baseToken = window.skuLookupToken;
    function token(value) {
      if (typeof baseToken === "function") return baseToken(value);
      return String(value == null ? "" : value).trim().toLowerCase().replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/gi, "");
    }

    var baseNormalizePlatform = window.skuPlanFactNormalizePlatform || (typeof skuPlanFactNormalizePlatform === "function" ? skuPlanFactNormalizePlatform : null);
    var baseHeaderKey = window.skuPlanFactImportHeaderKey || (typeof skuPlanFactImportHeaderKey === "function" ? skuPlanFactImportHeaderKey : null);
    var baseNormalizeAction = window.skuPlanFactNormalizeReviewAction || (typeof skuPlanFactNormalizeReviewAction === "function" ? skuPlanFactNormalizeReviewAction : null);

    function normalizePlatform(value) {
      var text = String(value == null ? "" : value).trim();
      var lower = text.toLowerCase().replaceAll("ё", "е");
      var found = [];
      if (/\bwb\b|wildberries|вб|вайлдбер/i.test(lower)) found.push("wb");
      if (/\boz\b|\bozon\b|озон/i.test(lower)) found.push("ozon");
      if (/\bya\b|\bym\b|yandex|яндекс|я\.?маркет|ямаркет/i.test(lower)) found.push("ya");
      if (/gold\s*apple|золотое\s*яблоко|\bзя\b/i.test(lower)) found.push("goldapple");
      if (/letu|letual|летуаль/i.test(lower)) found.push("letu");
      if (/magnit|магнит/i.test(lower)) found.push("magnit");
      found = found.filter(function (item, index) { return found.indexOf(item) === index; });
      if (found.length > 1) return "all";
      if (found.length === 1) return found[0];
      return baseNormalizePlatform ? baseNormalizePlatform(value) : (token(value) || "all");
    }

    function headerKey(header) {
      var mapped = baseHeaderKey ? baseHeaderKey(header) : "";
      if (["action", "target_sku", "platform", "api_sku", "article_key", "status", "note"].indexOf(mapped) >= 0) return mapped;
      var raw = token(header);
      if (!raw) return "";
      if (["action", "decision"].indexOf(raw) >= 0 || raw.indexOf("решение") === 0 || (raw.indexOf("alias") >= 0 && raw.indexOf("ignore") >= 0)) return "action";
      if (["targetsku", "target", "portalsku", "mainsku"].indexOf(raw) >= 0 || raw.indexOf("реестре") >= 0 || (raw.indexOf("sku") === 0 && raw.indexOf("alias") >= 0)) return "target_sku";
      if (["platform", "marketplace", "sourceplatform"].indexOf(raw) >= 0 || raw.indexOf("площадка") >= 0) return "platform";
      if (["apisku", "apiarticle", "api", "sourcesku", "marketplacesku"].indexOf(raw) >= 0) return "api_sku";
      if (["articlekey", "article", "skuapi"].indexOf(raw) >= 0) return "article_key";
      if (["status", "active"].indexOf(raw) >= 0 || raw.indexOf("статус") >= 0 || raw.indexOf("active") >= 0) return "status";
      if (["note", "comment", "decisioncomment"].indexOf(raw) >= 0 || raw.indexOf("комментар") >= 0) return "note";
      return mapped || raw;
    }

    function normalizeAction(action, targetSku) {
      if (baseNormalizeAction) return baseNormalizeAction(action, targetSku);
      var raw = token(action);
      if (["alias", "map", "mapping", "apply", "active", "алиас", "связать"].indexOf(raw) >= 0) return "alias";
      if (["ignore", "ignored", "skip", "hide", "mute", "exclude", "игнор", "игнорировать", "скрыть"].indexOf(raw) >= 0) return "ignore";
      if (["newsku", "new", "createsku", "create", "sku", "newproduct"].indexOf(raw) >= 0) return "new_sku";
      if (["needcheck", "check", "review", "manual", "question", "later", "todo"].indexOf(raw) >= 0) return "need_check";
      if (!raw && targetSku) return "alias";
      return raw || "empty";
    }

    function looksLikeReviewForm(matrix, headers) {
      var rawHeaders = matrix[0] || [];
      var headerTokens = rawHeaders.map(token);
      var hasHeaderHints = headerTokens.some(function (raw) { return raw.indexOf("alias") >= 0 && raw.indexOf("ignore") >= 0; })
        || headerTokens.indexOf("skuapi") >= 0
        || headerTokens.some(function (raw) { return raw.indexOf("apisku") >= 0; });
      var hasBodyHints = matrix.slice(1, 20).some(function (row) {
        return ["alias", "ignore", "new_sku", "need_check"].indexOf(normalizeAction(row && row[0], row && row[2])) >= 0;
      });
      var recognized = {};
      headers.forEach(function (header) { if (header) recognized[header] = true; });
      return (!recognized.action || !recognized.target_sku || !recognized.platform || (!recognized.api_sku && !recognized.article_key))
        && rawHeaders.length >= 5
        && (hasHeaderHints || hasBodyHints);
    }

    function rowsFromMatrix(matrix) {
      var headers = (matrix[0] || []).map(headerKey);
      var fallback = ["action", "decision_hint", "target_sku", "platform", "api_sku", "status", "note", "month", "fact_to", "severity", "type", "article_key", "name", "revenue", "units", "recommended_action"];
      if (looksLikeReviewForm(matrix, headers)) {
        headers = headers.map(function (header, index) { return fallback[index] || header; });
      }
      return matrix.slice(1).map(function (values) {
        var row = {};
        headers.forEach(function (header, index) {
          if (header) row[header] = String(values[index] == null ? "" : values[index]).trim();
        });
        return row;
      }).filter(function (row) {
        return Object.keys(row).some(function (key) { return String(row[key] || "").trim(); });
      });
    }

    window.skuPlanFactNormalizePlatform = normalizePlatform;
    window.skuPlanFactImportHeaderKey = headerKey;
    window.skuPlanFactRowsFromMatrix = rowsFromMatrix;
    try { skuPlanFactNormalizePlatform = normalizePlatform; } catch (error) {}
    try { skuPlanFactImportHeaderKey = headerKey; } catch (error) {}
    try { skuPlanFactRowsFromMatrix = rowsFromMatrix; } catch (error) {}
  }

  installSkuContourImportFix();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  window.addEventListener("altea:viewchange", run);
  window.setInterval(run, 1500);
})();
