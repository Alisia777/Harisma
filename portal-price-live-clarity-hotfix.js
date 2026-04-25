(function () {
  if (window.__ALTEA_PRICE_LIVE_CLARITY_HOTFIX_20260425A__) return;
  window.__ALTEA_PRICE_LIVE_CLARITY_HOTFIX_20260425A__ = true;

  var VIEW_ID = "view-prices";
  var MODAL_BODY_ID = "skuModalBody";
  var PANEL_STATE_KEY = "altea-price-live-clarity-panels-20260425a";
  var STYLE_ID = "alteaPriceLiveClarityStyles";
  var INPUT_SELECTOR = "#priceDateFrom, #priceDateTo, #pwFrom, #pwTo";
  var SUPABASE_URL = "https://iyckwryrucqrxwlowxow.supabase.co";
  var SUPABASE_KEY = "sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw";
  var overlayPromise = null;
  var enhanceTimer = 0;
  var viewObserver = null;
  var modalObserver = null;

  function rootState() {
    if (typeof state !== "undefined" && state) return state;
    if (typeof window !== "undefined" && window.state) return window.state;
    return null;
  }

  function priceState() {
    var root = rootState();
    return root && root.priceWorkbench ? root.priceWorkbench : null;
  }

  function activeView() {
    var root = rootState();
    if (root && root.activeView) return String(root.activeView);
    var active = document.querySelector(".view.active");
    return active ? String(active.id || "").replace(/^view-/, "") : "";
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function todayKey() {
    var now = new Date();
    return [now.getFullYear(), pad2(now.getMonth() + 1), pad2(now.getDate())].join("-");
  }

  function isoDate(value) {
    return value ? String(value).slice(0, 10) : "";
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function lower(value) {
    return String(value || "").trim().toLowerCase();
  }

  function currentBrand() {
    try {
      if (typeof window.currentBrand === "function") return window.currentBrand();
    } catch {}
    try {
      if (typeof window.currentConfig === "function") {
        var config = window.currentConfig();
        if (config && config.brand) return String(config.brand);
      }
    } catch {}
    if (window.APP_CONFIG && window.APP_CONFIG.brand) return String(window.APP_CONFIG.brand);
    return "Алтея";
  }

  function supabaseConfig() {
    try {
      if (typeof window.currentConfig === "function") {
        var config = window.currentConfig();
        if (config && config.supabase && config.supabase.url && config.supabase.anonKey) {
          return {
            url: String(config.supabase.url).replace(/\/+$/, ""),
            anonKey: String(config.supabase.anonKey)
          };
        }
      }
    } catch {}
    return { url: SUPABASE_URL, anonKey: SUPABASE_KEY };
  }

  function readPanelState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(PANEL_STATE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function panelOpen(key, fallbackValue) {
    var stateMap = readPanelState();
    if (Object.prototype.hasOwnProperty.call(stateMap, key)) return stateMap[key] === true;
    return fallbackValue === true;
  }

  function setPanelOpen(key, value) {
    var stateMap = readPanelState();
    stateMap[key] = value === true;
    localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(stateMap));
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#view-prices .price-live-banner{margin-top:12px;padding:12px 14px;border-radius:16px;border:1px solid rgba(212,164,74,.16);background:rgba(15,12,9,.76);color:rgba(255,244,222,.84);font-size:13px;line-height:1.5;}",
      "#view-prices .price-live-banner.warn{border-color:rgba(255,171,92,.28);background:rgba(73,41,12,.28);}",
      "#view-prices .price-live-guide{display:grid;gap:10px;margin-top:12px;}",
      "#view-prices .price-live-guide details{padding:12px 14px;border:1px solid rgba(212,164,74,.14);border-radius:16px;background:rgba(14,11,8,.72);}",
      "#view-prices .price-live-guide summary{cursor:pointer;font-weight:700;color:#fff1d4;}",
      "#view-prices .price-live-guide ul{margin:10px 0 0;padding-left:18px;display:grid;gap:8px;color:rgba(255,244,222,.82);}",
      "#view-prices .price-live-guide li{line-height:1.45;}",
      "#view-prices .price-live-anchor-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}",
      ".price-live-note{display:grid;gap:8px;padding:14px 16px;border-radius:18px;border:1px solid rgba(212,164,74,.14);background:rgba(14,11,8,.74);color:rgba(255,244,222,.82);font-size:13px;line-height:1.5;}",
      ".price-live-history summary{cursor:pointer;font-weight:700;color:#fff3d6;list-style:none;}",
      ".price-live-history summary::-webkit-details-marker{display:none;}",
      ".price-live-history-body{display:grid;gap:10px;padding-top:8px;}"
    ].join("");
    document.head.appendChild(style);
  }

  function baseForRow(row) {
    if (!row) return null;
    if (!row.__priceLiveClarityBase) {
      row.__priceLiveClarityBase = {
        monthly: clone(Array.isArray(row.monthly) ? row.monthly : []),
        currentFillPrice: row.currentFillPrice,
        currentPrice: row.currentPrice,
        currentClientPrice: row.currentClientPrice,
        currentSppPct: row.currentSppPct,
        currentTurnoverDays: row.currentTurnoverDays,
        turnoverCurrentDays: row.turnoverCurrentDays,
        owner: row.owner,
        status: row.status,
        historyNote: row.historyNote
      };
    }
    return row.__priceLiveClarityBase;
  }

  function resetRow(row) {
    var base = baseForRow(row);
    if (!base) return;
    row.monthly = clone(base.monthly);
    row.currentFillPrice = base.currentFillPrice;
    row.currentPrice = base.currentPrice;
    row.currentClientPrice = base.currentClientPrice;
    row.currentSppPct = base.currentSppPct;
    row.currentTurnoverDays = base.currentTurnoverDays;
    row.turnoverCurrentDays = base.turnoverCurrentDays;
    row.owner = base.owner;
    row.status = base.status;
    row.historyNote = base.historyNote;
  }

  function overlayRowsByPlatform(payload) {
    var maps = { wb: {}, ozon: {}, ym: {}, ya: {} };
    ["wb", "ozon", "ym", "ya"].forEach(function (platform) {
      var container = ((((payload || {}).platforms || {})[platform] || {}).rows) || {};
      if (Array.isArray(container)) {
        container.forEach(function (item) {
          var key = lower(item && (item.articleKey || item.article || item.sku));
          if (key) maps[platform][key] = item;
        });
        return;
      }
      Object.keys(container).forEach(function (key) {
        var item = container[key];
        var articleKey = lower(item && (item.articleKey || item.article || item.sku || key));
        if (articleKey) maps[platform][articleKey] = item;
      });
    });
    return maps;
  }

  function mergeOverlayPoint(row, overlayRow, overlayDate) {
    var monthly = clone(Array.isArray((row.__priceLiveClarityBase || {}).monthly) ? row.__priceLiveClarityBase.monthly : []);
    if (!overlayDate) return monthly;
    var point = null;
    monthly.forEach(function (item) {
      if (isoDate(item && item.date) === overlayDate) point = item;
    });
    if (!point) {
      point = { date: overlayDate };
      monthly.push(point);
    }
    if (overlayRow.currentFillPrice != null) point.price = overlayRow.currentFillPrice;
    else if (overlayRow.currentPrice != null) point.price = overlayRow.currentPrice;
    if (overlayRow.currentClientPrice != null) point.clientPrice = overlayRow.currentClientPrice;
    if (overlayRow.currentSppPct != null) point.sppPct = overlayRow.currentSppPct;
    if (overlayRow.currentTurnoverDays != null) point.turnoverDays = overlayRow.currentTurnoverDays;
    monthly.sort(function (left, right) {
      return String((left && left.date) || "").localeCompare(String((right && right.date) || ""));
    });
    return monthly;
  }

  function applyOverlayToSeed(payload) {
    var stateRef = priceState();
    if (!stateRef || !stateRef.seed || !payload || !payload.platforms) return false;
    var overlayDate = isoDate(payload.asOfDate || payload.generatedAt);
    if (!overlayDate) return false;
    var maps = overlayRowsByPlatform(payload);
    Object.keys((stateRef.seed || {}).platforms || {}).forEach(function (platform) {
      var rows = ((((stateRef.seed || {}).platforms || {})[platform] || {}).rows) || [];
      rows.forEach(function (row) {
        resetRow(row);
        var key = lower(row && (row.articleKey || row.article || row.sku));
        var overlayRow = key ? (maps[platform] && maps[platform][key]) || (maps[platform === "ya" ? "ym" : platform] && maps[platform === "ya" ? "ym" : platform][key]) : null;
        if (!overlayRow) return;
        row.monthly = mergeOverlayPoint(row, overlayRow, overlayDate);
        if (overlayRow.currentFillPrice != null) row.currentFillPrice = overlayRow.currentFillPrice;
        else if (overlayRow.currentPrice != null) row.currentFillPrice = overlayRow.currentPrice;
        row.currentPrice = row.currentFillPrice;
        if (overlayRow.currentClientPrice != null) row.currentClientPrice = overlayRow.currentClientPrice;
        if (overlayRow.currentSppPct != null) row.currentSppPct = overlayRow.currentSppPct;
        if (overlayRow.currentTurnoverDays != null) {
          row.currentTurnoverDays = overlayRow.currentTurnoverDays;
          row.turnoverCurrentDays = overlayRow.currentTurnoverDays;
        }
        if (overlayRow.owner) row.owner = overlayRow.owner;
        if (overlayRow.status) row.status = overlayRow.status;
      });
    });
    stateRef.overlayMeta = {
      available: true,
      asOfDate: overlayDate,
      generatedAt: String(payload.generatedAt || "")
    };
    stateRef.__priceLiveClarityOverlayDate = overlayDate;
    return true;
  }

  function loadOverlayPayload() {
    if (overlayPromise) return overlayPromise;
    overlayPromise = Promise.resolve().then(function () {
      var config = supabaseConfig();
      if (!config.url || !config.anonKey || typeof window.fetch !== "function") return null;
      var brand = encodeURIComponent(currentBrand());
      var url = config.url.replace(/\/+$/, "") + "/rest/v1/portal_data_snapshots"
        + "?select=payload,generated_at,updated_at"
        + "&brand=eq." + brand
        + "&snapshot_key=eq.smart_price_overlay"
        + "&order=updated_at.desc.nullslast"
        + "&limit=1";
      return window.fetch(url, {
        headers: {
          apikey: config.anonKey,
          Authorization: "Bearer " + config.anonKey,
          Accept: "application/json"
        },
        cache: "no-store"
      }).then(function (response) {
        if (!response || !response.ok) return null;
        return response.json();
      }).then(function (rows) {
        var item = Array.isArray(rows) && rows.length ? rows[0] : null;
        if (!item || !item.payload) return null;
        var payload = clone(item.payload);
        if (!payload.generatedAt) payload.generatedAt = item.generated_at || item.updated_at || "";
        return payload;
      });
    }).catch(function (error) {
      console.warn("[price-live-clarity] overlay", error);
      overlayPromise = null;
      return null;
    });
    return overlayPromise;
  }

  function rerenderPricesSoon() {
    window.clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(function () {
      if (activeView() === "prices" && typeof window.renderPriceWorkbench === "function") {
        try {
          window.renderPriceWorkbench();
        } catch (error) {
          console.warn("[price-live-clarity] rerender", error);
        }
      } else {
        enhanceUi();
      }
    }, 40);
  }

  function warmOverlay() {
    var stateRef = priceState();
    if (!stateRef || !stateRef.seed) return Promise.resolve(false);
    return loadOverlayPayload().then(function (payload) {
      if (!payload) return false;
      var applied = applyOverlayToSeed(payload);
      if (applied) rerenderPricesSoon();
      return applied;
    });
  }

  function bindDateInputs(root) {
    root.querySelectorAll(INPUT_SELECTOR).forEach(function (input) {
      if (!input || input.dataset.priceLiveCalendarBound === "true") return;
      input.dataset.priceLiveCalendarBound = "true";
      input.max = todayKey();
      input.title = "Можно выбирать и сегодняшнюю дату. Если за сегодня еще нет публикации, таблица покажет последний доступный срез внутри диапазона.";
      input.addEventListener("click", function () {
        try {
          if (typeof input.showPicker === "function") input.showPicker();
        } catch {}
      });
    });
  }

  function dispatchChange(input) {
    if (!input) return;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function latestSeedDate() {
    var stateRef = priceState();
    if (!stateRef || !stateRef.seed) return "";
    var latest = "";
    Object.keys((stateRef.seed || {}).platforms || {}).forEach(function (platform) {
      var rows = ((((stateRef.seed || {}).platforms || {})[platform] || {}).rows) || [];
      rows.forEach(function (row) {
        (Array.isArray(row && row.monthly) ? row.monthly : []).forEach(function (item) {
          var date = isoDate(item && item.date);
          if (date && (!latest || date > latest)) latest = date;
        });
      });
    });
    return latest;
  }

  function ensureToolbar(root) {
    var toolbar = root.querySelector(".price-toolbar, .pw-toolbar, .pw-shell, .price-workbench-shell");
    if (!toolbar) return;
    var toInput = root.querySelector("#priceDateTo, #pwTo");
    var rangeHost = root.querySelector(".price-range-row, .pw-range, .pw-toolbar") || toolbar;
    if (!rangeHost.querySelector("[data-price-live-anchor-row]")) {
      var row = document.createElement("div");
      row.className = "price-live-anchor-row";
      row.dataset.priceLiveAnchorRow = "true";
      row.innerHTML = [
        '<button type="button" class="quick-chip pw-chip" data-price-live-anchor="today" title="Ставит правую границу диапазона на сегодняшнюю дату.">Сегодня</button>',
        '<button type="button" class="quick-chip pw-chip" data-price-live-anchor="latest" title="Возвращает правую границу на последний опубликованный ценовой срез.">Последний ценовой срез</button>'
      ].join("");
      rangeHost.appendChild(row);
    }
    rangeHost.querySelectorAll("[data-price-live-anchor]").forEach(function (button) {
      if (button.dataset.priceLiveAnchorBound === "true") return;
      button.dataset.priceLiveAnchorBound = "true";
      button.addEventListener("click", function () {
        var latest = latestSeedDate() || todayKey();
        var value = button.getAttribute("data-price-live-anchor") === "today" ? todayKey() : latest;
        if (toInput) {
          toInput.value = value;
          dispatchChange(toInput);
        }
      });
    });

    var banner = toolbar.querySelector("[data-price-live-banner]");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "price-live-banner";
      banner.dataset.priceLiveBanner = "true";
      toolbar.appendChild(banner);
    }
    var overlayMeta = priceState() && priceState().overlayMeta || null;
    var overlayDate = isoDate(overlayMeta && (overlayMeta.asOfDate || overlayMeta.generatedAt));
    var lag = overlayDate ? Math.max(0, Math.round((new Date(todayKey() + "T12:00:00").getTime() - new Date(overlayDate + "T12:00:00").getTime()) / 86400000)) : null;
    banner.className = "price-live-banner" + (lag != null && lag > 1 ? " warn" : "");
    banner.innerHTML = overlayDate
      ? "<strong>Свежесть ценового слоя</strong><div>Текущая цена и текущая оборачиваемость подтянуты из свежего overlay до " + overlayDate + ". Если в календаре выбрана сегодняшняя дата, а публикации за сегодня еще нет, таблица честно остается на последнем опубликованном срезе" + (lag ? " с лагом " + lag + " дн." : "") + ".</div>"
      : "<strong>Свежесть ценового слоя</strong><div>Портал показывает последний доступный ценовой срез. Кнопка «Сегодня» теперь разрешает выбрать текущую дату, но сама дата не выдумывает новый факт, если он еще не опубликован.</div>";

    if (!toolbar.querySelector("[data-price-live-guide]")) {
      var guide = document.createElement("div");
      guide.className = "price-live-guide";
      guide.dataset.priceLiveGuide = "true";
      guide.innerHTML = [
        "<details open>",
        "<summary>Что делают кнопки и фильтры наверху</summary>",
        "<ul>",
        "<li><strong>WB / Ozon / Я.Маркет</strong> переключают рабочий список по площадке, но не создают новый источник данных сами по себе.</li>",
        "<li><strong>Пресеты 7 / 14 / 30 дней, месяц, весь период</strong> меняют только календарный диапазон уже загруженного ценового слоя.</li>",
        "<li><strong>Сегодня</strong> ставит правую границу диапазона на текущую дату, чтобы не искать ее в календаре вручную.</li>",
        "<li><strong>Последний ценовой срез</strong> возвращает правую границу на дату, которая реально доехала в слой цен.</li>",
        "<li><strong>Поиск, owner, статус, сортировка и проблемные SKU</strong> фильтруют и переупорядочивают список, но не меняют сами цены.</li>",
        "</ul>",
        "</details>",
        "<details>",
        "<summary>Что означают кнопки внутри карточки SKU</summary>",
        "<ul>",
        "<li><strong>Сохранить решение</strong> фиксирует статус, owner, срок, новые цены, допустимую маржу, логику решения и комментарий.</li>",
        "<li><strong>Создать / обновить задачу</strong> оформляет задачу по SKU на основе текущей карточки, но не публикует цену на площадку автоматически.</li>",
        "<li><strong>История периода</strong> показывает дневные точки внутри выбранного диапазона.</li>",
        "<li><strong>История решений</strong> показывает, кто и когда менял допустимую маржу, статус и ценовое решение по SKU.</li>",
        "</ul>",
        "</details>",
        "<details>",
        "<summary>Как работает сохранение</summary>",
        "<ul>",
        "<li><strong>Изменения не должны пропадать после перезагрузки</strong>: сначала они пишутся локально в этом браузере.</li>",
        "<li><strong>Если командное хранилище доступно</strong>, локальная запись затем синхронизируется в общую командную базу.</li>",
        "<li><strong>Если сеть или remote-store недоступны</strong>, решение остается на этой машине и в этом браузере, пока не появится возможность синхронизации.</li>",
        "</ul>",
        "</details>"
      ].join("");
      toolbar.appendChild(guide);
    }
  }

  function ensureModalNote(body) {
    var formSection = Array.from(body.querySelectorAll(".price-modal-section, .pw-modal-section")).find(function (section) {
      return section.querySelector("[data-price-form], form");
    });
    if (!formSection || formSection.dataset.priceLiveNote === "true") return;
    formSection.dataset.priceLiveNote = "true";
    var note = document.createElement("div");
    note.className = "price-live-note";
    note.innerHTML = [
      "<strong>Что сохраняют кнопки в этой карточке</strong>",
      "<div><strong>Сохранить решение</strong> фиксирует статус, owner, срок, новые цены MP и клиента, допустимую маржу, комментарий и логику решения.</div>",
      "<div><strong>Создать / обновить задачу</strong> заводит или обновляет задачу по текущему SKU, но не отправляет цену на маркетплейс автоматически.</div>",
      "<div><strong>Истории ниже можно свернуть</strong>. Портал запоминает их открытое или закрытое состояние в этом браузере.</div>"
    ].join("");
    formSection.insertBefore(note, formSection.firstChild);
  }

  function wrapHistorySection(section, key, label) {
    if (!section || section.dataset.priceLiveHistoryWrapped === "true") return;
    section.dataset.priceLiveHistoryWrapped = "true";
    var details = document.createElement("details");
    details.className = "price-live-history";
    details.open = panelOpen(key, false);
    var summary = document.createElement("summary");
    summary.textContent = label;
    var body = document.createElement("div");
    body.className = "price-live-history-body";
    Array.from(section.childNodes).forEach(function (node) {
      body.appendChild(node);
    });
    section.innerHTML = "";
    details.appendChild(summary);
    details.appendChild(body);
    details.addEventListener("toggle", function () {
      setPanelOpen(key, details.open);
    });
    section.appendChild(details);
  }

  function ensureModalHistory(body) {
    Array.from(body.querySelectorAll(".price-modal-section")).forEach(function (section) {
      var title = section.querySelector(".price-section-title");
      var text = title ? String(title.textContent || "").trim() : "";
      if (!text) return;
      if (text.indexOf("История периода") !== -1) {
        wrapHistorySection(section, "period-history", "История периода");
      } else if (text.indexOf("История решений") !== -1) {
        wrapHistorySection(section, "decision-history", "История решений и допустимой маржи");
      }
    });
    body.querySelectorAll(".pw-history-wrap").forEach(function (wrap, index) {
      if (wrap.closest("[data-price-live-pw-history]")) return;
      var host = document.createElement("div");
      host.dataset.priceLivePwHistory = "true";
      wrap.parentNode.insertBefore(host, wrap);
      host.appendChild(wrap);
      wrapHistorySection(host, "legacy-history-" + index, "История периода");
    });
  }

  function enhanceUi() {
    ensureStyles();
    var root = document.getElementById(VIEW_ID);
    if (root) {
      bindDateInputs(root);
      ensureToolbar(root);
    }
    var body = document.getElementById(MODAL_BODY_ID);
    if (body) {
      ensureModalNote(body);
      ensureModalHistory(body);
    }
  }

  function installObservers() {
    var root = document.getElementById(VIEW_ID);
    if (root && !viewObserver) {
      viewObserver = new MutationObserver(enhanceUi);
      viewObserver.observe(root, { childList: true, subtree: true });
    }
    var body = document.getElementById(MODAL_BODY_ID);
    if (body && !modalObserver) {
      modalObserver = new MutationObserver(enhanceUi);
      modalObserver.observe(body, { childList: true, subtree: true });
    }
  }

  function installRenderPatch() {
    if (typeof window.renderPriceWorkbench !== "function" || window.renderPriceWorkbench.__ALTEA_PRICE_LIVE_CLARITY_PATCHED__) return false;
    var original = window.renderPriceWorkbench;
    window.renderPriceWorkbench = function patchedRenderPriceWorkbench() {
      warmOverlay().catch(function (error) {
        console.warn("[price-live-clarity] warm", error);
      });
      var result = original.apply(this, arguments);
      enhanceUi();
      installObservers();
      return result;
    };
    window.renderPriceWorkbench.__ALTEA_PRICE_LIVE_CLARITY_PATCHED__ = true;
    return true;
  }

  function scheduleBurst() {
    [0, 120, 420, 1200].forEach(function (delay) {
      window.setTimeout(function () {
        warmOverlay().catch(function () {});
        enhanceUi();
        installObservers();
      }, delay);
    });
  }

  if (installRenderPatch()) scheduleBurst();
  document.addEventListener("DOMContentLoaded", function () {
    installRenderPatch();
    scheduleBurst();
  }, { once: true });
  window.addEventListener("load", function () {
    installRenderPatch();
    scheduleBurst();
  }, { once: true });
  window.addEventListener("altea:viewchange", function (event) {
    if (!event || !event.detail || event.detail.view !== "prices") return;
    installRenderPatch();
    scheduleBurst();
  });
  scheduleBurst();
})();
