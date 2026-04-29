(function () {
  if (window.__ALTEA_PRICE_REPRICER_SYNC_HOTFIX_20260425C__) return;
  window.__ALTEA_PRICE_REPRICER_SYNC_HOTFIX_20260425C__ = true;

  var PORTAL_LOCAL_KEY = "brand-portal-local-v1";
  var PRICE_ENTRIES_KEY = "brand-portal-price-workbench-v20260419-entries";
  var LEGACY_BRIDGE_WRITER = "repricer-bridge";
  var PRICES_BRIDGE_WRITER = "prices-bridge";
  var STYLE_ID = "altea-repricer-price-column-style";
  var INFO_NOTE_ID = "altea-repricer-price-note";
  var storageWriteDepth = 0;
  var rerenderTimer = 0;
  var viewObserver = null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function parseJson(raw, fallback) {
    if (raw == null || raw === "") return clone(fallback);
    try {
      var parsed = JSON.parse(raw);
      return parsed == null ? clone(fallback) : parsed;
    } catch {
      return clone(fallback);
    }
  }

  function readJson(key, fallback) {
    try {
      return parseJson(localStorage.getItem(key), fallback);
    } catch {
      return clone(fallback);
    }
  }

  function writeJson(key, value) {
    storageWriteDepth += 1;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } finally {
      storageWriteDepth = Math.max(0, storageWriteDepth - 1);
    }
  }

  function globalState() {
    try {
      if (typeof state !== "undefined") return state;
    } catch {}
    return window.state || null;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isoDate(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  }

  function stamp(value) {
    if (!value) return 0;
    var direct = Date.parse(value);
    if (Number.isFinite(direct)) return direct;
    var dateKey = isoDate(value);
    if (!dateKey) return 0;
    var parsed = Date.parse(dateKey + "T23:59:59Z");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    var parsed = Number(String(value).replace(/\s+/g, "").replace(",", ".").replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function moneyRound(value) {
    var numeric = toNumber(value);
    if (numeric == null) return null;
    return Math.round(numeric * 100) / 100;
  }

  function moneyText(value) {
    var numeric = toNumber(value);
    if (numeric == null) return "\u2014";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(numeric) + " \u20bd";
  }

  function normalizeMarket(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (raw === "ya") return "ym";
    return raw === "wb" || raw === "ozon" || raw === "ym" ? raw : "";
  }

  function normalizeArticleKey(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9\u0400-\u04ff]+/g, "");
  }

  function entryKey(market, articleKey) {
    return normalizeMarket(market) + "|" + normalizeArticleKey(articleKey);
  }

  function readPortalLocal() {
    var payload = readJson(PORTAL_LOCAL_KEY, {});
    return payload && typeof payload === "object" ? payload : {};
  }

  function writePortalLocal(payload) {
    writeJson(PORTAL_LOCAL_KEY, payload && typeof payload === "object" ? payload : {});
  }

  function isLegacyBridgeEntry(entry) {
    return String(entry && (entry.updatedBy || entry.updated_by) || "").trim() === LEGACY_BRIDGE_WRITER;
  }

  function stripLegacyBridgeEntries(entries) {
    return (Array.isArray(entries) ? entries : []).filter(function (entry) {
      return !isLegacyBridgeEntry(entry);
    });
  }

  function sanitizePriceEntriesPayload(rawValue) {
    var parsed = parseJson(rawValue, null);
    if (!Array.isArray(parsed)) return rawValue;
    return JSON.stringify(stripLegacyBridgeEntries(parsed));
  }

  function normalizePriceEntry(entry) {
    var marketplace = normalizeMarket(entry && (entry.marketplace || entry.marketplace_key)) || "wb";
    return {
      marketplace: marketplace,
      articleKey: String(entry && (entry.articleKey || entry.article_key) || "").trim(),
      decisionStatus: String(entry && (entry.decisionStatus || entry.decision_status) || "draft").trim() || "draft",
      targetFillPrice: moneyRound(entry && (entry.targetFillPrice != null ? entry.targetFillPrice : entry.target_fill_price)),
      targetClientPrice: moneyRound(entry && (entry.targetClientPrice != null ? entry.targetClientPrice : entry.target_client_price)),
      allowedMarginManualPct: toNumber(entry && (entry.allowedMarginManualPct != null ? entry.allowedMarginManualPct : entry.allowed_margin_manual_pct)),
      reason: String(entry && entry.reason || "").trim(),
      owner: String(entry && (entry.owner || entry.owner_name) || "").trim(),
      dueDate: isoDate(entry && (entry.dueDate || entry.due_date)),
      needsTask: Boolean(entry && (entry.needsTask != null ? entry.needsTask : entry.needs_task)),
      escalation: String(entry && (entry.escalation || entry.escalation_code) || "none").trim() || "none",
      comment: String(entry && entry.comment || "").trim(),
      updatedBy: String(entry && (entry.updatedBy || entry.updated_by) || "").trim(),
      updatedAt: String(entry && (entry.updatedAt || entry.updated_at) || "").trim() || nowIso(),
      createdAt: String(entry && (entry.createdAt || entry.created_at) || "").trim() || nowIso()
    };
  }

  function normalizeRepricerOverride(entry) {
    var platform = normalizeMarket(entry && entry.platform);
    if (!platform || platform === "ym") platform = "all";
    return {
      articleKey: String(entry && (entry.articleKey || entry.article) || "").trim(),
      platform: platform,
      mode: String(entry && entry.mode || "auto").trim().toLowerCase() || "auto",
      floorPrice: moneyRound(entry && (entry.floorPrice != null ? entry.floorPrice : entry.floorOverride)),
      capPrice: moneyRound(entry && (entry.capPrice != null ? entry.capPrice : entry.capOverride)),
      forcePrice: moneyRound(entry && entry.forcePrice),
      promoActive: entry ? (entry.promoActive === true || entry.promoActive === "true" || entry.promoActive === 1 || entry.promoActive === "1") : false,
      promoPrice: moneyRound(entry && entry.promoPrice),
      promoLabel: String(entry && entry.promoLabel || "").trim(),
      promoFrom: isoDate(entry && entry.promoFrom),
      promoTo: isoDate(entry && entry.promoTo),
      disableAlignment: Boolean(entry && entry.disableAlignment),
      note: String(entry && entry.note || "").trim(),
      updatedBy: String(entry && entry.updatedBy || "").trim(),
      updatedAt: String(entry && entry.updatedAt || "").trim() || nowIso()
    };
  }

  function promoWindowActive(override) {
    var today = isoDate(new Date().toISOString());
    var from = isoDate(override && override.promoFrom);
    var to = isoDate(override && override.promoTo);
    if (from && to && from > to) return false;
    if (from && today < from) return false;
    if (to && today > to) return false;
    return true;
  }

  function repricerExplicitTarget(override) {
    var normalized = normalizeRepricerOverride(override);
    var promoPrice = moneyRound(normalized.promoPrice);
    if (normalized.promoActive && promoPrice != null && promoPrice > 0 && promoWindowActive(normalized)) {
      return {
        price: promoPrice,
        label: normalized.promoLabel || "\u041f\u0440\u043e\u043c\u043e",
        hint: normalized.note || "",
        updatedAt: normalized.updatedAt || nowIso()
      };
    }
    var forcePrice = moneyRound(normalized.forcePrice);
    if (normalized.mode === "force" && forcePrice != null && forcePrice > 0) {
      return {
        price: forcePrice,
        label: "\u0424\u0438\u043a\u0441",
        hint: normalized.note || "",
        updatedAt: normalized.updatedAt || nowIso()
      };
    }
    return null;
  }

  function readBucketRows(bucket) {
    if (!bucket) return [];
    if (Array.isArray(bucket.rows)) return bucket.rows;
    if (Array.isArray(bucket)) return bucket;
    if (bucket.rows && typeof bucket.rows === "object") return Object.values(bucket.rows);
    return [];
  }

  function rowTimelineLatest(row) {
    var series = Array.isArray(row && row.monthly) ? row.monthly : [];
    if (!series.length) return null;
    var sorted = series.slice().sort(function (left, right) {
      return String(left && left.date || "").localeCompare(String(right && right.date || ""));
    });
    return sorted[sorted.length - 1] || null;
  }

  function lookupCurrentPriceMetrics(marketplace, articleKey) {
    var stateRef = globalState() || {};
    var targetMarket = normalizeMarket(marketplace);
    var normalizedArticle = normalizeArticleKey(articleKey);
    if (!targetMarket || !normalizedArticle) return null;

    function findInRows(rows) {
      return (rows || []).find(function (row) {
        return normalizedArticle === normalizeArticleKey(row && (row.articleKey || row.article || row.sku));
      }) || null;
    }

    var sources = [
      stateRef.priceWorkbench && stateRef.priceWorkbench.seed && stateRef.priceWorkbench.seed.platforms && stateRef.priceWorkbench.seed.platforms[targetMarket],
      stateRef.smartPriceWorkbench && stateRef.smartPriceWorkbench.platforms && stateRef.smartPriceWorkbench.platforms[targetMarket],
      stateRef.prices && stateRef.prices.platforms && stateRef.prices.platforms[targetMarket]
    ];

    for (var index = 0; index < sources.length; index += 1) {
      var row = findInRows(readBucketRows(sources[index]));
      if (!row) continue;
      var latest = rowTimelineLatest(row);
      var fill = toNumber(
        row.currentFillPrice != null ? row.currentFillPrice
          : row.currentPrice != null ? row.currentPrice
          : latest && latest.price != null ? latest.price
          : null
      );
      var client = toNumber(
        row.currentClientPrice != null ? row.currentClientPrice
          : latest && latest.clientPrice != null ? latest.clientPrice
          : null
      );
      if (fill != null || client != null) {
        return { fill: fill, client: client };
      }
    }

    return null;
  }

  function deriveFillPriceFromClient(marketplace, articleKey, clientPrice) {
    var targetClient = moneyRound(clientPrice);
    if (targetClient == null || targetClient <= 0) return null;
    var metrics = lookupCurrentPriceMetrics(marketplace, articleKey);
    var fill = metrics && toNumber(metrics.fill);
    var client = metrics && toNumber(metrics.client);
    if (fill != null && fill > 0 && client != null && client > 0) {
      return moneyRound(targetClient / (client / fill));
    }
    return null;
  }

  function repricerHasNonPriceControls(override) {
    return moneyRound(override.floorPrice) != null
      || moneyRound(override.capPrice) != null
      || Boolean(override.disableAlignment)
      || Boolean(String(override.note || "").trim());
  }

  function clearExactPriceFromOverride(override) {
    var next = normalizeRepricerOverride(override);
    next.forcePrice = null;
    next.promoActive = false;
    next.promoPrice = null;
    next.promoLabel = "";
    next.promoFrom = "";
    next.promoTo = "";
    if (next.mode === "force") next.mode = "auto";
    return next;
  }

  function syncPricesToRepricer(options) {
    options = options || {};
    var respectTimestamps = options.respectTimestamps !== false;
    var portal = readPortalLocal();
    var overrides = Array.isArray(portal.repricerOverrides) ? portal.repricerOverrides.map(normalizeRepricerOverride) : [];
    var manualEntries = stripLegacyBridgeEntries(readJson(PRICE_ENTRIES_KEY, []));
    var changed = false;

    function findOverrideIndex(articleKey, marketplace) {
      var wanted = entryKey(marketplace, articleKey);
      for (var index = 0; index < overrides.length; index += 1) {
        if (entryKey(overrides[index] && overrides[index].platform, overrides[index] && overrides[index].articleKey) === wanted) {
          return index;
        }
      }
      return -1;
    }

    manualEntries.forEach(function (rawEntry) {
      var entry = normalizePriceEntry(rawEntry);
      var marketplace = normalizeMarket(entry.marketplace);
      if (marketplace !== "wb" && marketplace !== "ozon") return;
      if (!entry.articleKey) return;

      var existingIndex = findOverrideIndex(entry.articleKey, marketplace);
      var existing = existingIndex >= 0 ? overrides[existingIndex] : null;
      var targetFillPrice = moneyRound(entry.targetFillPrice);
      if (targetFillPrice == null && entry.targetClientPrice != null) {
        targetFillPrice = deriveFillPriceFromClient(marketplace, entry.articleKey, entry.targetClientPrice);
      }

      if (targetFillPrice != null && targetFillPrice > 0) {
        if (respectTimestamps && existing && stamp(existing.updatedAt) > stamp(entry.updatedAt)) return;
        var next = normalizeRepricerOverride(existing || {
          articleKey: entry.articleKey,
          platform: marketplace
        });
        next.articleKey = entry.articleKey;
        next.platform = marketplace;
        next.mode = "force";
        next.forcePrice = Math.round(targetFillPrice);
        next.promoActive = false;
        next.promoPrice = null;
        next.promoLabel = "";
        next.promoFrom = "";
        next.promoTo = "";
        next.updatedAt = entry.updatedAt || nowIso();
        next.updatedBy = PRICES_BRIDGE_WRITER;

        if (!existing) {
          overrides.unshift(next);
          changed = true;
          return;
        }

        var same =
          next.mode === existing.mode
          && moneyRound(next.forcePrice) === moneyRound(existing.forcePrice)
          && Boolean(next.promoActive) === Boolean(existing.promoActive)
          && moneyRound(next.promoPrice) === moneyRound(existing.promoPrice)
          && String(next.promoLabel || "") === String(existing.promoLabel || "")
          && String(next.promoFrom || "") === String(existing.promoFrom || "")
          && String(next.promoTo || "") === String(existing.promoTo || "")
          && String(next.updatedBy || "") === String(existing.updatedBy || "");

        if (!same) {
          overrides[existingIndex] = next;
          changed = true;
        }
        return;
      }

      if (!existing) return;
      if (respectTimestamps && stamp(existing.updatedAt) > stamp(entry.updatedAt)) return;

      var cleared = clearExactPriceFromOverride(existing);
      if (repricerHasNonPriceControls(cleared)) {
        var clearChanged =
          moneyRound(existing.forcePrice) != null
          || Boolean(existing.promoActive)
          || moneyRound(existing.promoPrice) != null
          || String(existing.promoLabel || "").trim()
          || String(existing.promoFrom || "").trim()
          || String(existing.promoTo || "").trim()
          || String(existing.mode || "").trim().toLowerCase() === "force";
        if (clearChanged) {
          cleared.updatedAt = entry.updatedAt || nowIso();
          cleared.updatedBy = PRICES_BRIDGE_WRITER;
          overrides[existingIndex] = cleared;
          changed = true;
        }
      } else {
        overrides.splice(existingIndex, 1);
        changed = true;
      }
    });

    if (!changed) return false;

    portal.repricerOverrides = overrides;
    writePortalLocal(portal);

    var stateRef = globalState();
    if (stateRef && stateRef.storage) {
      stateRef.storage.repricerOverrides = clone(overrides);
    }
    scheduleViewRefresh("repricer");
    schedulePriceEnhance();
    return true;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#view-prices .altea-repricer-note{margin:12px 0 0;padding:12px 14px;border-radius:16px;border:1px solid rgba(214,175,85,.16);background:rgba(214,175,85,.05);color:#e9dac0;line-height:1.5;}",
      "#view-prices .altea-repricer-note strong{display:block;margin-bottom:4px;color:#fff1d1;}",
      "#view-prices .altea-repricer-price-cell{display:grid;gap:4px;min-width:112px;}",
      "#view-prices .altea-repricer-price-cell strong{color:#fff2cc;font-weight:700;}",
      "#view-prices .altea-repricer-price-cell small{color:#cdb58b;line-height:1.3;}",
      "#view-prices td[data-repricer-price-cell],#view-prices th[data-repricer-price-col]{white-space:nowrap;}"
    ].join("");
    document.head.appendChild(style);
  }

  function chooseRepricerRows() {
    var stateRef = globalState() || {};
    var baseRows = Array.isArray(stateRef.repricer && stateRef.repricer.rows) ? stateRef.repricer.rows : [];
    var liveRows = Array.isArray(stateRef.repricerLive && stateRef.repricerLive.rows) ? stateRef.repricerLive.rows : [];
    var baseStamp = stamp(stateRef.repricer && stateRef.repricer.generatedAt);
    var liveStamp = stamp(stateRef.repricerLive && stateRef.repricerLive.generatedAt);
    if (liveRows.length && liveStamp >= baseStamp) return liveRows;
    return baseRows.length ? baseRows : liveRows;
  }

  function buildExplicitOverrideMap() {
    var map = new Map();
    var overrides = Array.isArray(readPortalLocal().repricerOverrides) ? readPortalLocal().repricerOverrides : [];
    overrides.forEach(function (rawOverride) {
      var override = normalizeRepricerOverride(rawOverride);
      var explicit = repricerExplicitTarget(override);
      if (!explicit || !override.articleKey) return;
      var markets = override.platform === "all" ? ["wb", "ozon"] : [override.platform];
      markets.forEach(function (market) {
        if (market !== "wb" && market !== "ozon") return;
        map.set(entryKey(market, override.articleKey), {
          price: explicit.price,
          label: explicit.label,
          hint: explicit.hint || "",
          updatedAt: explicit.updatedAt || override.updatedAt || ""
        });
      });
    });
    return map;
  }

  function findRepricerRow(articleKey) {
    var wanted = normalizeArticleKey(articleKey);
    if (!wanted) return null;
    var rows = chooseRepricerRows();
    return rows.find(function (row) {
      return wanted === normalizeArticleKey(row && (row.articleKey || row.article));
    }) || null;
  }

  function firstPositive() {
    for (var index = 0; index < arguments.length; index += 1) {
      var parsed = Number(arguments[index]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }

  function resolvedRepricerSidePrice(side) {
    var price = moneyRound(side && (side.finalPrice != null ? side.finalPrice : (side.recommendedPrice != null ? side.recommendedPrice : side.recPrice)));
    if (price == null || price <= 0) return null;
    var floor = Math.max(
      firstPositive(side && side.effectiveFloor),
      firstPositive(side && side.hardFloor),
      firstPositive(side && side.economicFloor),
      firstPositive(side && side.minPrice),
      firstPositive(side && side.finalGuardFloor)
    );
    var cap = firstPositive(side && side.finalGuardCap, side && side.capPrice, side && side.upperCap, side && side.workingZoneTo);
    if (cap > 0 && !(floor > 0 && cap + 0.001 < floor) && price > cap + 0.001) price = moneyRound(cap);
    if (floor > 0 && price + 0.001 < floor) price = moneyRound(floor);
    return price > 0 ? price : null;
  }

  function buildRepricerDisplay(market, articleKey) {
    var normalizedMarket = normalizeMarket(market);
    var key = entryKey(normalizedMarket, articleKey);
    if (!normalizedMarket || !articleKey || key === "|") return null;

    var explicitMap = buildExplicitOverrideMap();
    if (explicitMap.has(key)) {
      var explicit = explicitMap.get(key);
      return {
        price: explicit.price,
        label: explicit.label || "\u0420\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440",
        hint: explicit.hint || ""
      };
    }

    var repricerRow = findRepricerRow(articleKey);
    if (!repricerRow) return null;
    var side = normalizedMarket === "wb"
      ? repricerRow.wb
      : normalizedMarket === "ozon"
        ? repricerRow.ozon
        : null;
    var recPrice = resolvedRepricerSidePrice(side);
    if (recPrice == null || recPrice <= 0) return null;
    return {
      price: recPrice,
      label: String(side && side.strategy || "\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u044f").trim(),
      hint: String(side && side.reason || "").trim()
    };
  }

  function currentPricesMarket(root) {
    var stateRef = globalState();
    var fromState = normalizeMarket(stateRef && stateRef.priceWorkbench && stateRef.priceWorkbench.filters && stateRef.priceWorkbench.filters.market);
    if (fromState) return fromState;
    var activeChip = root && root.querySelector("[data-price-market].active");
    return normalizeMarket(activeChip && activeChip.getAttribute("data-price-market")) || "wb";
  }

  function tableLooksLikePrices(table) {
    if (!table) return false;
    var headerTexts = Array.from(table.querySelectorAll("thead th")).map(function (cell) {
      return String(cell.textContent || "").trim().toLowerCase();
    });
    if (!headerTexts.length) return false;
    return headerTexts.some(function (text) { return text.indexOf("\u0446\u0435\u043d\u0430 mp") >= 0 || text.indexOf("price mp") >= 0; })
      && headerTexts.some(function (text) { return text.indexOf("\u0446\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430") >= 0 || text.indexOf("\u043a\u043b\u0438\u0435\u043d\u0442") >= 0; });
  }

  function detectRowInfo(row, root) {
    var token = row.getAttribute("data-price-open")
      || row.getAttribute("data-open-price")
      || (row.querySelector("[data-price-open]") && row.querySelector("[data-price-open]").getAttribute("data-price-open"))
      || (row.querySelector("[data-open-price]") && row.querySelector("[data-open-price]").getAttribute("data-open-price"))
      || "";
    var market = normalizeMarket(row.getAttribute("data-price-market"));
    var articleKey = "";
    if (token.indexOf("|") >= 0) {
      var parts = token.split("|");
      market = normalizeMarket(parts[0]);
      articleKey = parts.slice(1).join("|");
    } else {
      articleKey = token;
    }
    if (!articleKey) {
      var skuNode = row.querySelector(".pw-sku");
      if (skuNode) articleKey = String(skuNode.textContent || "").trim();
    }
    if (!articleKey) {
      var firstCell = row.querySelector("td");
      if (firstCell) {
        articleKey = String(firstCell.textContent || "").trim().split(/\s+/)[0];
      }
    }
    if (!market) market = currentPricesMarket(root);
    return {
      market: market,
      articleKey: articleKey
    };
  }

  function ensureInfoNote(root) {
    if (!root || root.querySelector("#" + INFO_NOTE_ID)) return;
    var anchor = root.querySelector(".pw-card .pw-sub") || root.querySelector(".price-toolbar") || root.firstElementChild;
    if (!anchor || !anchor.parentNode) return;
    var note = document.createElement("div");
    note.id = INFO_NOTE_ID;
    note.className = "altea-repricer-note";
    note.innerHTML = "<strong>\u041b\u043e\u0433\u0438\u043a\u0430 \u0446\u0435\u043d</strong>\u0426\u0435\u043d\u0430 MP, \u0446\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430, SPP \u0438 \u043e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c \u043e\u0441\u0442\u0430\u044e\u0442\u0441\u044f \u0444\u0430\u043a\u0442\u043e\u043c \u0438\u0437 \u0432\u044b\u0433\u0440\u0443\u0437\u043a\u0438 \u043d\u0430 \u0434\u0430\u0442\u0443 \u0441\u0440\u0435\u0437\u0430. \u0426\u0435\u043d\u0430 \u0440\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440\u0430 \u043f\u043e\u043a\u0430\u0437\u0430\u043d\u0430 \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u043e \u0438 \u043d\u0435 \u043f\u043e\u0434\u043c\u0435\u043d\u044f\u0435\u0442 \u044d\u0442\u0438 \u043f\u043e\u043b\u044f.";
    anchor.parentNode.insertBefore(note, anchor.nextSibling);
  }

  function decorateTable(table, root) {
    if (!tableLooksLikePrices(table)) return;
    var headerRow = table.querySelector("thead tr");
    if (!headerRow) return;
    var headerCells = Array.from(headerRow.children);
    var mpIndex = headerCells.findIndex(function (cell) {
      var text = String(cell.textContent || "").trim().toLowerCase();
      return text.indexOf("\u0446\u0435\u043d\u0430 mp") >= 0 || text.indexOf("price mp") >= 0;
    });
    if (mpIndex < 0) return;

    var headerCell = table.querySelector("th[data-repricer-price-col]");
    if (!headerCell) {
      headerCell = document.createElement("th");
      headerCell.dataset.repricerPriceCol = "true";
      headerCell.textContent = "\u0426\u0435\u043d\u0430 \u0440\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440\u0430";
      var mpHeader = headerCells[mpIndex];
      if (mpHeader && mpHeader.nextSibling) headerRow.insertBefore(headerCell, mpHeader.nextSibling);
      else headerRow.appendChild(headerCell);
    } else {
      headerCell.textContent = "\u0426\u0435\u043d\u0430 \u0440\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440\u0430";
    }

    Array.from(table.querySelectorAll("tbody tr")).forEach(function (row) {
      var info = detectRowInfo(row, root);
      var display = buildRepricerDisplay(info.market, info.articleKey);
      var cell = row.querySelector("td[data-repricer-price-cell]");
      if (!cell) {
        cell = document.createElement("td");
        cell.dataset.repricerPriceCell = "true";
        var children = Array.from(row.children);
        var mpCell = children[mpIndex];
        if (mpCell && mpCell.nextSibling) row.insertBefore(cell, mpCell.nextSibling);
        else row.appendChild(cell);
      }
      if (!display) {
        cell.innerHTML = "\u2014";
        cell.removeAttribute("title");
        return;
      }
      cell.innerHTML = [
        '<div class="altea-repricer-price-cell">',
        "<strong>", moneyText(display.price), "</strong>",
        "<small>", String(display.label || "\u0420\u0435\u043f\u0440\u0430\u0439\u0441\u0435\u0440"), "</small>",
        "</div>"
      ].join("");
      if (display.hint) cell.title = display.hint;
      else cell.removeAttribute("title");
    });
  }

  function cleanupLegacyBridgeEntries() {
    var stored = readJson(PRICE_ENTRIES_KEY, []);
    if (Array.isArray(stored)) {
      var sanitized = stripLegacyBridgeEntries(stored);
      if (sanitized.length !== stored.length) {
        writeJson(PRICE_ENTRIES_KEY, sanitized);
      }
    }
    var stateRef = globalState();
    if (stateRef && stateRef.priceWorkbench && Array.isArray(stateRef.priceWorkbench.localEntries)) {
      stateRef.priceWorkbench.localEntries = stripLegacyBridgeEntries(stateRef.priceWorkbench.localEntries);
    }
  }

  function enhancePricesView() {
    var root = document.getElementById("view-prices");
    if (!root) return;
    ensureStyles();
    cleanupLegacyBridgeEntries();
    ensureInfoNote(root);
    Array.from(root.querySelectorAll("table")).forEach(function (table) {
      decorateTable(table, root);
    });
  }

  function schedulePriceEnhance() {
    window.clearTimeout(rerenderTimer);
    rerenderTimer = window.setTimeout(function () {
      try {
        enhancePricesView();
      } catch (error) {
        console.warn("[portal-price-repricer-sync-hotfix] enhance failed", error);
      }
    }, 60);
  }

  function scheduleViewRefresh(viewName) {
    window.setTimeout(function () {
      try {
        var stateRef = globalState();
        if ((stateRef && stateRef.activeView) === viewName) {
          if (viewName === "repricer" && typeof window.renderRepricer === "function") {
            window.renderRepricer();
            return;
          }
          if (viewName === "prices" && typeof window.renderPriceWorkbench === "function") {
            window.renderPriceWorkbench();
            return;
          }
        }
        if (viewName === "prices") schedulePriceEnhance();
      } catch (error) {
        console.warn("[portal-price-repricer-sync-hotfix] refresh failed", error);
      }
    }, 80);
  }

  function patchPriceWorkbenchRenderer() {
    if (typeof window.renderPriceWorkbench !== "function") return false;
    if (window.renderPriceWorkbench.__alteaRepricerPriceColumnPatched) return true;
    var previous = window.renderPriceWorkbench;
    var wrapped = function patchedPriceWorkbenchRender() {
      var result = previous.apply(this, arguments);
      schedulePriceEnhance();
      return result;
    };
    wrapped.__alteaRepricerPriceColumnPatched = true;
    window.renderPriceWorkbench = wrapped;
    return true;
  }

  function observeView() {
    var root = document.getElementById("view-prices");
    if (!root || viewObserver) return;
    viewObserver = new MutationObserver(function () {
      schedulePriceEnhance();
    });
    viewObserver.observe(root, { childList: true, subtree: true });
  }

  function afterLocalStorageWrite(key) {
    if (key === PRICE_ENTRIES_KEY) {
      syncPricesToRepricer({ respectTimestamps: false });
      schedulePriceEnhance();
      return;
    }
    if (key === PORTAL_LOCAL_KEY) {
      schedulePriceEnhance();
    }
  }

  if (!Storage.prototype.__alteaPriceRepricerBridgePatched) {
    var originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedBridgeSetItem(key, value) {
      var nextKey = String(key || "");
      var nextValue = value;
      if (this === window.localStorage && !storageWriteDepth && nextKey === PRICE_ENTRIES_KEY) {
        nextValue = sanitizePriceEntriesPayload(value);
      }
      var result = originalSetItem.call(this, key, nextValue);
      if (this === window.localStorage && !storageWriteDepth) {
        try {
          afterLocalStorageWrite(nextKey);
        } catch (error) {
          console.warn("[portal-price-repricer-sync-hotfix] storage", error);
        }
      }
      return result;
    };
    Storage.prototype.__alteaPriceRepricerBridgePatched = true;
  }

  [0, 300, 1200, 3000].forEach(function (delay) {
    window.setTimeout(function () {
      patchPriceWorkbenchRenderer();
      observeView();
      schedulePriceEnhance();
    }, delay);
  });

  window.addEventListener("storage", function (event) {
    if (!event || !event.key) return;
    if (event.key === PORTAL_LOCAL_KEY || event.key === PRICE_ENTRIES_KEY) {
      schedulePriceEnhance();
    }
  });

  window.addEventListener("altea:viewchange", function (event) {
    if (!event || !event.detail || event.detail.view !== "prices") return;
    patchPriceWorkbenchRenderer();
    observeView();
    schedulePriceEnhance();
  });

  cleanupLegacyBridgeEntries();
  syncPricesToRepricer({ respectTimestamps: true });
  patchPriceWorkbenchRenderer();
  observeView();
  schedulePriceEnhance();
})();
