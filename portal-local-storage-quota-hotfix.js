(function () {
  if (window.__ALTEA_LOCAL_STORAGE_QUOTA_HOTFIX_20260604__) return;
  window.__ALTEA_LOCAL_STORAGE_QUOTA_HOTFIX_20260604__ = true;

  var STORAGE_KEY = "brand-portal-local-v1";
  var MAX_RAW_CHARS = 3200000;
  var MAX_TEXT_CHARS = 6000;
  var MAX_HISTORY_ITEMS = 60;
  var MAX_REPAIR_ITEMS = 25;
  var MAX_SNAPSHOT_ITEMS = 0;

  function isQuotaError(error) {
    var text = String((error && (error.name || error.message)) || "");
    return /quota|exceed|storage/i.test(text);
  }

  function safeJsonParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function trimText(value, limit) {
    var text = String(value == null ? "" : value);
    return text.length > limit ? text.slice(0, limit) : text;
  }

  function compactPrimitive(value, limit) {
    if (typeof value === "string") return trimText(value, limit || MAX_TEXT_CHARS);
    if (value == null || typeof value === "number" || typeof value === "boolean") return value;
    return undefined;
  }

  function shouldDropKey(key) {
    return /^(file|blob|buffer|bytes|binary|base64|dataUrl|data_url|content|body|html|raw|workbook|worksheet)$/i.test(key)
      || /payload|snapshot|debug|archive/i.test(key);
  }

  function compactValue(value, depth) {
    var primitive = compactPrimitive(value);
    if (primitive !== undefined) return primitive;
    if (depth <= 0) return undefined;
    if (Array.isArray(value)) {
      return value.slice(0, MAX_HISTORY_ITEMS).map(function (item) {
        return compactValue(item, depth - 1);
      }).filter(function (item) {
        return item !== undefined;
      });
    }
    if (value && typeof value === "object") {
      var output = {};
      Object.keys(value).forEach(function (key) {
        if (shouldDropKey(key)) return;
        var next = compactValue(value[key], depth - 1);
        if (next !== undefined) output[key] = next;
      });
      return output;
    }
    return undefined;
  }

  function compactArray(items, limit, depth) {
    return (Array.isArray(items) ? items : [])
      .slice(0, limit)
      .map(function (item) { return compactValue(item, depth || 3); })
      .filter(function (item) { return item && typeof item === "object"; });
  }

  function cleanAttachment(item) {
    item = item && typeof item === "object" ? item : {};
    return {
      id: trimText(item.id || "", 120),
      taskId: trimText(item.taskId || item.task_id || "", 160),
      articleKey: trimText(item.articleKey || item.article_key || "", 120),
      fileName: trimText(item.fileName || item.file_name || item.name || "\u0424\u0430\u0439\u043b", 240),
      mimeType: trimText(item.mimeType || item.mime_type || "", 160),
      size: Number.isFinite(Number(item.size || item.fileSize || item.file_size)) ? Math.max(0, Math.round(Number(item.size || item.fileSize || item.file_size))) : 0,
      bucket: trimText(item.bucket || item.bucketName || item.bucket_name || "portal-task-files", 160),
      objectPath: trimText(item.objectPath || item.object_path || "", 600),
      publicUrl: trimText(item.publicUrl || item.public_url || "", 1200),
      createdAt: trimText(item.createdAt || item.created_at || "", 80),
      createdBy: trimText(item.createdBy || item.created_by || "", 160)
    };
  }

  function compactLastImport(item) {
    if (!item || typeof item !== "object") return null;
    return compactValue(item, 2) || null;
  }

  function compactPortalStorage(source) {
    var parsed = source && typeof source === "object" ? source : {};
    return {
      comments: compactArray(parsed.comments, 2000, 3),
      tasks: compactArray(parsed.tasks, 3000, 3),
      decisions: compactArray(parsed.decisions, 1000, 3),
      ownerOverrides: compactArray(parsed.ownerOverrides, 3000, 3),
      resourceLinks: compactArray(parsed.resourceLinks, 500, 3),
      resourceFolders: compactArray(parsed.resourceFolders, 300, 3),
      productLifecycleOverrides: compactArray(parsed.productLifecycleOverrides, 3000, 3),
      taskAttachments: (Array.isArray(parsed.taskAttachments) ? parsed.taskAttachments : []).slice(0, 2000).map(cleanAttachment).filter(function (item) {
        return item.taskId && item.objectPath;
      }),
      promoEvents: compactArray(parsed.promoEvents, 1000, 3),
      promoEventDeletedIds: compactArray(parsed.promoEventDeletedIds, 1000, 2),
      launchOverrides: compactArray(parsed.launchOverrides, 1000, 3),
      launchDeletedIds: (Array.isArray(parsed.launchDeletedIds) ? parsed.launchDeletedIds : []).slice(0, 1000).map(function (item) {
        return trimText(item, 160);
      }).filter(Boolean),
      repricerSettings: compactValue(parsed.repricerSettings || {}, 3) || {},
      repricerSettingsUpdatedAt: trimText(parsed.repricerSettingsUpdatedAt || "", 80),
      repricerOverrides: compactArray(parsed.repricerOverrides, 6000, 3),
      repricerSkuProfiles: compactArray(parsed.repricerSkuProfiles, 6000, 3),
      repricerCorridors: compactArray(parsed.repricerCorridors, 6000, 3),
      repricerOverrideDeletes: compactArray(parsed.repricerOverrideDeletes, 3000, 2),
      repricerSkuProfileDeletes: compactArray(parsed.repricerSkuProfileDeletes, 3000, 2),
      repricerCorridorDeletes: compactArray(parsed.repricerCorridorDeletes, 3000, 2),
      repricerPendingApiAdds: compactArray(parsed.repricerPendingApiAdds, 300, 2),
      repricerPendingApiDeletes: compactArray(parsed.repricerPendingApiDeletes, 300, 2),
      repricerPendingCostFixes: compactArray(parsed.repricerPendingCostFixes, 300, 2),
      repricerPendingApiTasks: compactArray(parsed.repricerPendingApiTasks, 300, 2),
      repricerRepairHistory: compactArray(parsed.repricerRepairHistory, MAX_REPAIR_ITEMS, 2),
      repricerRepairSnapshots: compactArray(parsed.repricerRepairSnapshots, MAX_SNAPSHOT_ITEMS, 1),
      repricerApiReconcileHistory: compactArray(parsed.repricerApiReconcileHistory, MAX_REPAIR_ITEMS, 2),
      repricerLastAuditImport: compactLastImport(parsed.repricerLastAuditImport),
      repricerLastAutoFix: compactLastImport(parsed.repricerLastAutoFix),
      repricerLastImportValidation: compactLastImport(parsed.repricerLastImportValidation),
      repricerLastApiReconcile: compactLastImport(parsed.repricerLastApiReconcile),
      portalDataRules: compactValue(parsed.portalDataRules || {}, 3) || {},
      portalDataRulesUpdatedAt: trimText(parsed.portalDataRulesUpdatedAt || "", 80),
      portalIssueSnapshot: compactLastImport(parsed.portalIssueSnapshot)
    };
  }

  function compactStorageJson(raw) {
    var parsed = safeJsonParse(raw, null);
    if (!parsed || typeof parsed !== "object") return raw;
    var compacted = compactPortalStorage(parsed);
    var text = JSON.stringify(compacted);
    if (text.length <= MAX_RAW_CHARS) return text;

    compacted.repricerRepairHistory = [];
    compacted.repricerApiReconcileHistory = [];
    compacted.repricerLastAuditImport = null;
    compacted.repricerLastAutoFix = null;
    compacted.repricerLastImportValidation = null;
    compacted.repricerLastApiReconcile = null;
    compacted.portalIssueSnapshot = null;
    text = JSON.stringify(compacted);

    if (text.length <= MAX_RAW_CHARS) return text;
    compacted.repricerOverrides = compacted.repricerOverrides.slice(0, 2500);
    compacted.repricerSkuProfiles = compacted.repricerSkuProfiles.slice(0, 2500);
    compacted.repricerCorridors = compacted.repricerCorridors.slice(0, 2500);
    return JSON.stringify(compacted);
  }

  var originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function alteaQuotaSafeSetItem(key, value) {
    if (this !== window.localStorage || String(key) !== STORAGE_KEY) {
      return originalSetItem.call(this, key, value);
    }

    var raw = String(value == null ? "" : value);
    var nextRaw = raw.length > MAX_RAW_CHARS ? compactStorageJson(raw) : raw;
    try {
      return originalSetItem.call(this, key, nextRaw);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      var compacted = compactStorageJson(raw);
      try {
        originalSetItem.call(this, key, compacted);
        console.warn("[portal-storage-quota] saved compact local state", {
          before: raw.length,
          after: compacted.length
        });
        return undefined;
      } catch (secondError) {
        if (!isQuotaError(secondError)) throw secondError;
        window.localStorage.removeItem(key);
        originalSetItem.call(this, key, compactStorageJson("{}"));
        console.warn("[portal-storage-quota] reset oversized local state", secondError);
        return undefined;
      }
    }
  };

  try {
    var existing = window.localStorage.getItem(STORAGE_KEY) || "";
    if (existing.length > MAX_RAW_CHARS) {
      window.localStorage.setItem(STORAGE_KEY, existing);
    }
  } catch (error) {
    console.warn("[portal-storage-quota] initial repair failed", error);
  }
})();
