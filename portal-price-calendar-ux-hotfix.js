(function () {
  if (window.__ALTEA_PRICE_CALENDAR_UX_HOTFIX_20260425H__) return;
  window.__ALTEA_PRICE_CALENDAR_UX_HOTFIX_20260425H__ = true;

  var VIEW_ID = "view-prices";
  var MODAL_BODY_ID = "skuModalBody";
  var INPUT_SELECTOR = "#priceDateFrom, #priceDateTo, #pwFrom, #pwTo";
  var PATCH_FLAG = "alteaPriceCalendarPatched";
  var PANEL_STATE_KEY = "altea-price-ui-panels-20260425e";
  var TOOLBAR_GUIDE_FLAG = "alteaPriceToolbarGuide";
  var MODAL_NOTE_FLAG = "alteaPriceModalNote";
  var HISTORY_WRAP_FLAG = "alteaPriceHistoryWrapped";
  var toolbarObserver = null;
  var modalObserver = null;
  var enhanceTimer = 0;
  var seedKickoff = null;

  function rootState() {
    if (typeof state !== "undefined" && state) return state;
    if (typeof window !== "undefined" && window.state) return window.state;
    return null;
  }

  function priceState() {
    var root = rootState();
    return root && root.priceWorkbench ? root.priceWorkbench : null;
  }

  function activeViewName() {
    var root = rootState();
    return root && root.activeView ? String(root.activeView) : "";
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

  function latestSeedDate() {
    var stateRef = priceState();
    var market = stateRef && stateRef.filters && stateRef.filters.market || "wb";
    var platforms = stateRef && stateRef.seed && stateRef.seed.platforms || {};
    var rows = platforms[market] && platforms[market].rows || [];
    var latest = "";
    rows.forEach(function (row) {
      (Array.isArray(row && row.monthly) ? row.monthly : []).forEach(function (item) {
        var date = isoDate(item && item.date);
        if (date && (!latest || date > latest)) latest = date;
      });
    });
    return latest;
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

  function openNativePicker(input) {
    if (!input || input.type !== "date") return;
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {}
    try {
      input.focus({ preventScroll: true });
    } catch {
      try { input.focus(); } catch {}
    }
  }

  function dispatchChange(input) {
    if (!input) return;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function bindPicker(input) {
    if (!input || input.dataset[PATCH_FLAG] === "true") return;
    input.dataset[PATCH_FLAG] = "true";
    input.max = todayKey();
    input.title = "РќР°Р¶РјРёС‚Рµ, С‡С‚РѕР±С‹ РѕС‚РєСЂС‹С‚СЊ РєР°Р»РµРЅРґР°СЂСЊ, РёР»Рё РІРІРµРґРёС‚Рµ РґР°С‚Сѓ РІСЂСѓС‡РЅСѓСЋ.";
    input.addEventListener("click", function () {
      openNativePicker(input);
    });
    input.addEventListener("keydown", function (event) {
      if (!event) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openNativePicker(input);
      }
    });
  }

  function ensureStyles() {
    if (document.getElementById("alteaPriceCalendarUxStyles")) return;
    var style = document.createElement("style");
    style.id = "alteaPriceCalendarUxStyles";
    style.textContent = [
      "#view-prices .price-ux-guide{display:grid;gap:10px;margin-top:12px;}",
      "#view-prices .price-ux-guide details{padding:12px 14px;border:1px solid rgba(212,164,74,.14);border-radius:16px;background:rgba(14,11,8,.72);}",
      "#view-prices .price-ux-guide summary{cursor:pointer;font-weight:700;color:#fff1d4;}",
      "#view-prices .price-ux-guide ul{margin:10px 0 0;padding-left:18px;display:grid;gap:8px;color:rgba(255,244,222,.82);}",
      "#view-prices .price-ux-guide li{line-height:1.45;}",
      "#view-prices .price-anchor-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}",
      "#view-prices .price-ux-freshness{margin-top:10px;padding:12px 14px;border-radius:16px;border:1px solid rgba(212,164,74,.16);background:rgba(15,12,9,.74);color:rgba(255,244,222,.82);font-size:13px;line-height:1.45;}",
      ".price-save-note{display:grid;gap:8px;padding:14px 16px;border-radius:18px;border:1px solid rgba(212,164,74,.14);background:rgba(14,11,8,.74);color:rgba(255,244,222,.82);font-size:13px;line-height:1.5;}",
      ".price-history-toggle{display:grid;gap:10px;}",
      ".price-history-toggle summary{cursor:pointer;font-weight:700;color:#fff3d6;list-style:none;}",
      ".price-history-toggle summary::-webkit-details-marker{display:none;}",
      ".price-history-toggle-body{display:grid;gap:10px;padding-top:8px;}"
    ].join("");
    document.head.appendChild(style);
  }

  function freshnessCopy() {
    var stateRef = priceState();
    var overlayMeta = stateRef && stateRef.overlayMeta || null;
    var overlayAsOf = isoDate(overlayMeta && (overlayMeta.asOfDate || overlayMeta.generatedAt));
    var latestSeed = latestSeedDate();
    if (overlayAsOf) {
      return "РўРµРєСѓС‰Р°СЏ С†РµРЅР° Рё С‚РµРєСѓС‰Р°СЏ РѕР±РѕСЂР°С‡РёРІР°РµРјРѕСЃС‚СЊ РїРѕРґС‚СЏРЅСѓС‚С‹ РёР· smart_price_overlay РґРѕ " + overlayAsOf + ". Р”РёР°РїР°Р·РѕРЅ РјРѕР¶РЅРѕ СЃС‚Р°РІРёС‚СЊ РЅР° СЃРµРіРѕРґРЅСЏ: РµСЃР»Рё СЃРІРµР¶РµР№ РґРЅРµРІРЅРѕР№ С‚РѕС‡РєРё РµС‰Рµ РЅРµС‚, С‚Р°Р±Р»РёС†Р° С‡РµСЃС‚РЅРѕ РѕСЃС‚Р°РµС‚СЃСЏ РЅР° РїРѕСЃР»РµРґРЅРµРј РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅРѕРј СЃСЂРµР·Рµ.";
    }
    if (latestSeed) {
      return "РЎРµР№С‡Р°СЃ РІРєР»Р°РґРєР° СЂР°Р±РѕС‚Р°РµС‚ РїРѕ РїРѕСЃР»РµРґРЅРµРјСѓ СЃСЂРµР·Сѓ РёР· smart_price_workbench РґРѕ " + latestSeed + ". РљРЅРѕРїРєР° \"РЎРµРіРѕРґРЅСЏ\" РЅСѓР¶РЅР°, С‡С‚РѕР±С‹ Р±С‹СЃС‚СЂРѕ РїСЂРѕРІРµСЂРёС‚СЊ С‚РѕС‚ Р¶Рµ РєРѕРЅС‚СѓСЂ РЅР° С‚РµРєСѓС‰СѓСЋ РґР°С‚Сѓ Р±РµР· СЂСѓС‡РЅРѕРіРѕ РІРІРѕРґР°.";
    }
    return "Р’РєР»Р°РґРєР° Р¦РµРЅС‹ РїРѕРєР°Р·С‹РІР°РµС‚ РїРѕСЃР»РµРґРЅРёР№ РґРѕСЃС‚СѓРїРЅС‹Р№ СЃСЂРµР· С†РµРЅ. Р•СЃР»Рё СЃРІРµР¶РёР№ daily-С„Р°РєС‚ РµС‰Рµ РЅРµ РґРѕРµС…Р°Р», СЌС‚Рѕ РЅРµ РѕС€РёР±РєР° РєР°Р»РµРЅРґР°СЂСЏ: С‚Р°Р±Р»РёС†Р° РѕСЃС‚Р°РµС‚СЃСЏ РЅР° РїРѕСЃР»РµРґРЅРµР№ РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅРѕР№ РґР°С‚Рµ.";
  }

  function ensureToolbarGuide(root) {
    if (!root) return;
    root.querySelectorAll(INPUT_SELECTOR).forEach(bindPicker);

    var toolbar = root.querySelector(".price-toolbar");
    var rangeRow = root.querySelector(".price-range-row");
    var presetRow = root.querySelector(".price-preset-row");
    if (!toolbar || !rangeRow || !presetRow) return;

    var fromInput = root.querySelector("#priceDateFrom, #pwFrom");
    var toInput = root.querySelector("#priceDateTo, #pwTo");
    var latestDate = latestSeedDate() || todayKey();

    if (!toolbar.querySelector("[data-price-date-anchor-row]")) {
      var anchorRow = document.createElement("div");
      anchorRow.className = "price-anchor-row";
      anchorRow.dataset.priceDateAnchorRow = "true";
      anchorRow.innerHTML = [
        '<button type="button" class="quick-chip" data-price-date-anchor="today" title="РЎС‚Р°РІРёС‚ РїСЂР°РІСѓСЋ РіСЂР°РЅРёС†Сѓ РЅР° СЃРµРіРѕРґРЅСЏС€РЅСЋСЋ РґР°С‚Сѓ. Р•СЃР»Рё СЃРµРіРѕРґРЅСЏ РµС‰Рµ РЅРµС‚ РїСѓР±Р»РёРєР°С†РёРё, РѕСЃС‚Р°РЅРµС‚СЃСЏ РїРѕСЃР»РµРґРЅРёР№ РґРѕСЃС‚СѓРїРЅС‹Р№ СЃСЂРµР· РІРЅСѓС‚СЂРё РґРёР°РїР°Р·РѕРЅР°.">РЎРµРіРѕРґРЅСЏ</button>',
        '<button type="button" class="quick-chip" data-price-date-anchor="latest" title="Р’РѕР·РІСЂР°С‰Р°РµС‚ РїСЂР°РІСѓСЋ РіСЂР°РЅРёС†Сѓ РЅР° РїРѕСЃР»РµРґРЅРёР№ РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅС‹Р№ С†РµРЅРѕРІРѕР№ СЃСЂРµР· РёР· С‚РµРєСѓС‰РµРіРѕ РєРѕРЅС‚СѓСЂР°.">РџРѕСЃР»РµРґРЅРёР№ С†РµРЅРѕРІРѕР№ СЃСЂРµР·</button>'
      ].join("");
      rangeRow.appendChild(anchorRow);
    }

    toolbar.querySelectorAll("[data-price-date-anchor]").forEach(function (button) {
      if (button.dataset.priceDateAnchorBound === "true") return;
      button.dataset.priceDateAnchorBound = "true";
      button.addEventListener("click", function () {
        var mode = button.getAttribute("data-price-date-anchor") || "today";
        var target = mode === "today" ? todayKey() : latestDate;
        if (toInput) {
          toInput.value = target;
          dispatchChange(toInput);
        }
      });
    });

    toolbar.querySelectorAll("[data-price-market]").forEach(function (button) {
      if (button.dataset.priceTooltipBound === "true") return;
      button.dataset.priceTooltipBound = "true";
      button.title = "Р¤РёР»СЊС‚СЂСѓРµС‚ СЂР°Р±РѕС‡РёР№ СЃРїРёСЃРѕРє РїРѕ РїР»РѕС‰Р°РґРєРµ. РСЃС‚РѕС‡РЅРёРє РґР°РЅРЅС‹С… РєРЅРѕРїРєР° РЅРµ РјРµРЅСЏРµС‚.";
    });

    toolbar.querySelectorAll("[data-price-preset]").forEach(function (button) {
      if (button.dataset.pricePresetTooltipBound === "true") return;
      button.dataset.pricePresetTooltipBound = "true";
      button.title = "Р‘С‹СЃС‚СЂРѕ РїРµСЂРµСЃС‚СЂР°РёРІР°РµС‚ С‚РѕР»СЊРєРѕ РєР°Р»РµРЅРґР°СЂРЅС‹Р№ РґРёР°РїР°Р·РѕРЅ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РїСЂР°РІРѕР№ РіСЂР°РЅРёС†С‹ РїРµСЂРёРѕРґР°.";
    });

    var search = toolbar.querySelector("#priceSearch");
    if (search) {
      search.title = "РС‰РµС‚ РїРѕ SKU, РЅР°Р·РІР°РЅРёСЋ, owner Рё Р»РѕРіРёРєРµ СЂРµС€РµРЅРёСЏ.";
    }

    var freshness = toolbar.querySelector("[data-price-ux-freshness]");
    if (!freshness) {
      freshness = document.createElement("div");
      freshness.className = "price-ux-freshness";
      freshness.dataset.priceUxFreshness = "true";
      toolbar.appendChild(freshness);
    }
    freshness.textContent = freshnessCopy();

    var guide = toolbar.querySelector("[data-price-ux-guide]");
    if (!guide) {
      guide = document.createElement("div");
      guide.className = "price-ux-guide";
      guide.dataset.priceUxGuide = "true";
      guide.innerHTML = [
        '<details open>',
        '<summary>Р§С‚Рѕ РґРµР»Р°СЋС‚ РєРЅРѕРїРєРё Рё С„РёР»СЊС‚СЂС‹ РЅР°РІРµСЂС…Сѓ</summary>',
        '<ul>',
        '<li><strong>WB / Ozon / РЇ.РњР°СЂРєРµС‚</strong> РїРµСЂРµРєР»СЋС‡Р°СЋС‚ С‚РѕР»СЊРєРѕ СЂР°Р±РѕС‡РёР№ СЃРїРёСЃРѕРє РїРѕ РїР»РѕС‰Р°РґРєРµ. РќРѕРІС‹Р№ РёСЃС‚РѕС‡РЅРёРє РґР°РЅРЅС‹С… РѕРЅРё РЅРµ РїРѕРґРіСЂСѓР¶Р°СЋС‚.</li>',
        '<li><strong>7 / 14 / 30 РґРЅРµР№, С‚РµРєСѓС‰РёР№ РјРµСЃСЏС†, РїСЂРѕС€Р»С‹Р№ РјРµСЃСЏС†, РІРµСЃСЊ РїРµСЂРёРѕРґ</strong> Р±С‹СЃС‚СЂРѕ РјРµРЅСЏСЋС‚ РєР°Р»РµРЅРґР°СЂРЅС‹Р№ РґРёР°РїР°Р·РѕРЅ. Р­С‚Рѕ РЅРµ РїРµСЂРµСЃС‡РµС‚ Smart, Р° С‚РѕР»СЊРєРѕ РґСЂСѓРіРѕР№ СЃСЂРµР· СѓР¶Рµ Р·Р°РіСЂСѓР¶РµРЅРЅС‹С… РґР°РЅРЅС‹С…. </li>',
        '<li><strong>РЎРµРіРѕРґРЅСЏ</strong> СЃС‚Р°РІРёС‚ РїСЂР°РІСѓСЋ РіСЂР°РЅРёС†Сѓ РЅР° С‚РµРєСѓС‰СѓСЋ РґР°С‚Сѓ. Р•СЃР»Рё РЅР° СЃРµРіРѕРґРЅСЏ РµС‰Рµ РЅРµС‚ РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅРѕР№ С‚РѕС‡РєРё, С‚Р°Р±Р»РёС†Р° РїРѕРєР°Р¶РµС‚ РїРѕСЃР»РµРґРЅРёР№ РґРѕСЃС‚СѓРїРЅС‹Р№ СЃСЂРµР· РІРЅСѓС‚СЂРё РґРёР°РїР°Р·РѕРЅР°.</li>',
        '<li><strong>РџРѕСЃР»РµРґРЅРёР№ С†РµРЅРѕРІРѕР№ СЃСЂРµР·</strong> РІРѕР·РІСЂР°С‰Р°РµС‚ РїСЂР°РІСѓСЋ РіСЂР°РЅРёС†Сѓ РЅР° РїРѕСЃР»РµРґРЅСЋСЋ РґР°С‚Сѓ, РєРѕС‚РѕСЂР°СЏ СЂРµР°Р»СЊРЅРѕ РїСЂРёРµС…Р°Р»Р° РІ СЃР»РѕР№ С†РµРЅ.</li>',
        '<li><strong>РџРѕРёСЃРє, Owner, РЎС‚Р°С‚СѓСЃ, РЎРѕСЂС‚РёСЂРѕРІРєР°, РўРѕР»СЊРєРѕ РїСЂРѕР±Р»РµРјРЅС‹Рµ РїРѕР·РёС†РёРё</strong> С„РёР»СЊС‚СЂСѓСЋС‚ Рё РїРµСЂРµСѓРїРѕСЂСЏРґРѕС‡РёРІР°СЋС‚ СЃРїРёСЃРѕРє SKU, РЅРѕ РЅРµ РјРµРЅСЏСЋС‚ СЃР°РјРё С†РµРЅС‹.</li>',
        '<li><strong>РљР»РёРє РїРѕ СЃС‚СЂРѕРєРµ SKU</strong> РѕС‚РєСЂС‹РІР°РµС‚ РєР°СЂС‚РѕС‡РєСѓ Р°СЂС‚РёРєСѓР»Р°, РіРґРµ РІРёРґРЅРѕ С‚РµРєСѓС‰РёРµ KPI, РєРѕСЂРёРґРѕСЂ С†РµРЅС‹, РёСЃС‚РѕСЂРёСЋ, СЂРµС€РµРЅРёРµ Рё Р·Р°РґР°С‡Рё.</li>',
        '</ul>',
        '</details>',
        '<details>',
        '<summary>Р§С‚Рѕ РѕР·РЅР°С‡Р°СЋС‚ РєРЅРѕРїРєРё РІРЅСѓС‚СЂРё РєР°СЂС‚РѕС‡РєРё SKU</summary>',
        '<ul>',
        '<li><strong>РЎРѕС…СЂР°РЅРёС‚СЊ СЂРµС€РµРЅРёРµ</strong> СЃРѕС…СЂР°РЅСЏРµС‚ СЃС‚Р°С‚СѓСЃ, owner, СЃСЂРѕРє, СЌСЃРєР°Р»Р°С†РёСЋ, РЅРѕРІСѓСЋ С†РµРЅСѓ MP, РЅРѕРІСѓСЋ С†РµРЅСѓ РєР»РёРµРЅС‚Р°, СЂСѓС‡РЅСѓСЋ РґРѕРїСѓСЃС‚РёРјСѓСЋ РјР°СЂР¶Сѓ, С„Р»Р°Рі вЂњРЅСѓР¶РЅР° Р·Р°РґР°С‡Р°вЂќ, Р»РѕРіРёРєСѓ СЂРµС€РµРЅРёСЏ Рё РєРѕРјРјРµРЅС‚Р°СЂРёР№. РџРѕСЃР»Рµ СЃРѕС…СЂР°РЅРµРЅРёСЏ Р·Р°РїРёСЃСЊ РїРѕРїР°РґР°РµС‚ РІ РёСЃС‚РѕСЂРёСЋ СЂРµС€РµРЅРёР№.</li>',
        '<li><strong>РЎРѕР·РґР°С‚СЊ / РѕР±РЅРѕРІРёС‚СЊ Р·Р°РґР°С‡Сѓ</strong> СЃРѕР·РґР°РµС‚ РёР»Рё РѕР±РЅРѕРІР»СЏРµС‚ Р·Р°РґР°С‡Сѓ РїРѕ СЌС‚РѕР№ РїРѕР·РёС†РёРё РЅР° РѕСЃРЅРѕРІР°РЅРёРё С‚РµРєСѓС‰РёС… РїРѕР»РµР№ РєР°СЂС‚РѕС‡РєРё. РљРЅРѕРїРєР° РЅРµ РїСѓР±Р»РёРєСѓРµС‚ С†РµРЅСѓ РЅР° РјР°СЂРєРµС‚РїР»РµР№СЃ СЃР°РјР° РїРѕ СЃРµР±Рµ.</li>',
        '<li><strong>РСЃС‚РѕСЂРёСЏ РїРµСЂРёРѕРґР°</strong> РїРѕРєР°Р·С‹РІР°РµС‚ РґРЅРµРІРЅС‹Рµ С‚РѕС‡РєРё С†РµРЅ, РєР»РёРµРЅС‚Р°, РЎРџРџ, РѕР±РѕСЂР°С‡РёРІР°РµРјРѕСЃС‚Рё, С„Р°РєС‚Р° Рё РІС‹СЂСѓС‡РєРё РІРЅСѓС‚СЂРё РІС‹Р±СЂР°РЅРЅРѕРіРѕ РґРёР°РїР°Р·РѕРЅР°.</li>',
        '<li><strong>РСЃС‚РѕСЂРёСЏ СЂРµС€РµРЅРёР№</strong> РїРѕРєР°Р·С‹РІР°РµС‚, РєС‚Рѕ Рё РєРѕРіРґР° РјРµРЅСЏР» РґРѕРїСѓСЃС‚РёРјСѓСЋ РјР°СЂР¶Сѓ, С†РµРЅСѓ Рё СЃС‚Р°С‚СѓСЃ РїРѕ SKU.</li>',
        '<li><strong>РћР±Рµ РёСЃС‚РѕСЂРёРё</strong> РјРѕР¶РЅРѕ СЃРІРµСЂРЅСѓС‚СЊ. РџРѕСЂС‚Р°Р» Р·Р°РїРѕРјРёРЅР°РµС‚ РёС… РѕС‚РєСЂС‹С‚РѕРµ РёР»Рё Р·Р°РєСЂС‹С‚РѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ РІ СЌС‚РѕРј Р±СЂР°СѓР·РµСЂРµ, С‡С‚РѕР±С‹ РїСЂРё СЃР»РµРґСѓСЋС‰РµРј РѕС‚РєСЂС‹С‚РёРё РєР°СЂС‚РѕС‡РєРё РЅРµ РїСЂРёС…РѕРґРёР»РѕСЃСЊ СЂР°СЃРєСЂС‹РІР°С‚СЊ РёС… Р·Р°РЅРѕРІРѕ.</li>',
        '</ul>',
        '</details>',
        '<details>',
        '<summary>РљР°Рє СЂР°Р±РѕС‚Р°РµС‚ СЃРѕС…СЂР°РЅРµРЅРёРµ Рё РїРѕС‡РµРјСѓ РёСЃС‚РѕСЂРёСЏ РЅРµ РїСЂРѕРїР°РґР°РµС‚</summary>',
        '<ul>',
        '<li><strong>РЎРЅР°С‡Р°Р»Р° Р·Р°РїРёСЃСЊ СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ Р»РѕРєР°Р»СЊРЅРѕ</strong> РІ СЌС‚РѕРј Р±СЂР°СѓР·РµСЂРµ, С‡С‚РѕР±С‹ СЂРµС€РµРЅРёРµ РЅРµ РёСЃС‡РµР·Р»Рѕ РїРѕСЃР»Рµ РїРµСЂРµР·Р°РіСЂСѓР·РєРё СЃС‚СЂР°РЅРёС†С‹.</li>',
        '<li><strong>Р•СЃР»Рё РєРѕРјР°РЅРґРЅРѕРµ С…СЂР°РЅРёР»РёС‰Рµ РґРѕСЃС‚СѓРїРЅРѕ</strong>, Р»РѕРєР°Р»СЊРЅР°СЏ Р·Р°РїРёСЃСЊ Р·Р°С‚РµРј СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµС‚СЃСЏ РІ РѕР±С‰СѓСЋ РєРѕРјР°РЅРґРЅСѓСЋ Р±Р°Р·Сѓ.</li>',
        '<li><strong>Р•СЃР»Рё С…СЂР°РЅРёР»РёС‰Рµ РЅРµРґРѕСЃС‚СѓРїРЅРѕ</strong>, Р·Р°РїРёСЃСЊ РЅРµ С‚РµСЂСЏРµС‚СЃСЏ: РѕРЅР° РѕСЃС‚Р°РµС‚СЃСЏ РЅР° СЌС‚РѕР№ РјР°С€РёРЅРµ Рё РІ СЌС‚РѕРј Р±СЂР°СѓР·РµСЂРµ, РїРѕРєР° РЅРµ РїРѕСЏРІРёС‚СЃСЏ РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё.</li>',
        '<li><strong>РСЃС‚РѕСЂРёСЏ СЂРµС€РµРЅРёР№</strong> СЃС‚СЂРѕРёС‚СЃСЏ РїРѕ СЃРѕС…СЂР°РЅРµРЅРЅС‹Рј Р·Р°РїРёСЃСЏРј, РїРѕСЌС‚РѕРјСѓ РїРѕСЃР»Рµ СЃРѕС…СЂР°РЅРµРЅРёСЏ РєР°СЂС‚РѕС‡РєР° СЃСЂР°Р·Сѓ РїРѕРєР°Р·С‹РІР°РµС‚ РЅРѕРІС‹Р№ С€Р°Рі Рё РїСЂРёС‡РёРЅСѓ СЂРµС€РµРЅРёСЏ.</li>',
        '</ul>',
        '</details>'
      ].join("");
      toolbar.appendChild(guide);
    }
  }

  function saveScopeCopy() {
    var stateRef = priceState();
    var hasTeamClient = Boolean(rootState() && rootState().team && rootState().team.client);
    var remoteDisabled = Boolean(stateRef && stateRef.remoteDisabled);
    if (hasTeamClient && !remoteDisabled) {
      return "РР·РјРµРЅРµРЅРёСЏ РїРѕ РєРЅРѕРїРєРµ В«РЎРѕС…СЂР°РЅРёС‚СЊ СЂРµС€РµРЅРёРµВ» РїРёС€СѓС‚СЃСЏ Р»РѕРєР°Р»СЊРЅРѕ СЃСЂР°Р·Сѓ Рё Р·Р°С‚РµРј СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓСЋС‚СЃСЏ РІ РєРѕРјР°РЅРґРЅРѕРµ С…СЂР°РЅРёР»РёС‰Рµ. Р•СЃР»Рё СЃРµС‚СЊ РёР»Рё team-store РЅРµРґРѕСЃС‚СѓРїРЅС‹, Р·Р°РїРёСЃСЊ РЅРµ С‚РµСЂСЏРµС‚СЃСЏ: РѕРЅР° РѕСЃС‚Р°РµС‚СЃСЏ Р»РѕРєР°Р»СЊРЅРѕ РІ СЌС‚РѕРј Р±СЂР°СѓР·РµСЂРµ Рё РїРѕР·Р¶Рµ РјРѕР¶РµС‚ РґРѕСЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊСЃСЏ.";
    }
    return "РЎРµР№С‡Р°СЃ РёР·РјРµРЅРµРЅРёСЏ РїРѕ С†РµРЅРµ СЃРѕС…СЂР°РЅСЏСЋС‚СЃСЏ Р»РѕРєР°Р»СЊРЅРѕ РІ СЌС‚РѕРј Р±СЂР°СѓР·РµСЂРµ: РїРѕСЃР»Рµ РїРµСЂРµР·Р°РіСЂСѓР·РєРё РЅР° СЌС‚РѕР№ РјР°С€РёРЅРµ РѕРЅРё РѕСЃС‚Р°РЅСѓС‚СЃСЏ, РЅРѕ РґСЂСѓРіРёРј РїРѕР»СЊР·РѕРІР°С‚РµР»СЏРј Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РЅРµ СЂР°Р·РѕР№РґСѓС‚СЃСЏ, РїРѕРєР° РєРѕРјР°РЅРґРЅРѕРµ С…СЂР°РЅРёР»РёС‰Рµ РЅРµРґРѕСЃС‚СѓРїРЅРѕ.";
  }

  function ensureModalNote(body) {
    if (!body) return;
    var formSection = Array.from(body.querySelectorAll(".price-modal-section")).find(function (section) {
      return section.querySelector("[data-price-form]");
    });
    if (!formSection || formSection.dataset[MODAL_NOTE_FLAG] === "true") return;
    formSection.dataset[MODAL_NOTE_FLAG] = "true";

    var note = document.createElement("div");
    note.className = "price-save-note";
    note.innerHTML = [
      "<strong>Р§С‚Рѕ РёРјРµРЅРЅРѕ СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ РёР· СЌС‚РѕР№ РєР°СЂС‚РѕС‡РєРё</strong>",
      "<div>" + saveScopeCopy() + "</div>",
      "<div><strong>РЎРѕС…СЂР°РЅРёС‚СЊ СЂРµС€РµРЅРёРµ</strong> С„РёРєСЃРёСЂСѓРµС‚ СЃС‚Р°С‚СѓСЃ, owner, СЃСЂРѕРє, СЌСЃРєР°Р»Р°С†РёСЋ, РЅРѕРІСѓСЋ С†РµРЅСѓ MP, РЅРѕРІСѓСЋ С†РµРЅСѓ РєР»РёРµРЅС‚Р°, СЂСѓС‡РЅСѓСЋ РґРѕРїСѓСЃС‚РёРјСѓСЋ РјР°СЂР¶Сѓ, С„Р»Р°Рі В«РЅСѓР¶РЅР° Р·Р°РґР°С‡Р°В», Р»РѕРіРёРєСѓ СЂРµС€РµРЅРёСЏ Рё РєРѕРјРјРµРЅС‚Р°СЂРёР№.</div>",
      "<div><strong>РЎРѕР·РґР°С‚СЊ / РѕР±РЅРѕРІРёС‚СЊ Р·Р°РґР°С‡Сѓ</strong> СЃРѕР·РґР°РµС‚ РёР»Рё РѕР±РЅРѕРІР»СЏРµС‚ Р·Р°РґР°С‡Сѓ РїРѕ SKU РЅР° Р±Р°Р·Рµ С‚РµРєСѓС‰РµР№ РєР°СЂС‚РѕС‡РєРё, РЅРѕ РЅРµ РѕС‚РїСЂР°РІР»СЏРµС‚ С†РµРЅСѓ РЅР° РїР»РѕС‰Р°РґРєСѓ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.</div>"
    ].join("");
    formSection.insertBefore(note, formSection.firstChild);

    var saveButton = formSection.querySelector('button[type="submit"]');
    if (saveButton) {
      saveButton.title = "РЎРѕС…СЂР°РЅСЏРµС‚ СЂРµС€РµРЅРёРµ РїРѕ С†РµРЅРµ Рё РїРёС€РµС‚ РµРіРѕ РІ РёСЃС‚РѕСЂРёСЋ РёР·РјРµРЅРµРЅРёР№ РїРѕ SKU.";
    }
    var taskButton = formSection.querySelector("[data-price-task]");
    if (taskButton) {
      taskButton.title = "РЎРѕР·РґР°РµС‚ РёР»Рё РѕР±РЅРѕРІР»СЏРµС‚ Р·Р°РґР°С‡Сѓ РїРѕ СЌС‚РѕРјСѓ SKU РЅР° РѕСЃРЅРѕРІР°РЅРёРё С‚РµРєСѓС‰РёС… РїРѕР»РµР№ РєР°СЂС‚РѕС‡РєРё.";
    }
  }

  function wrapHistorySection(section, panelKey, summaryText) {
    if (!section || section.dataset[HISTORY_WRAP_FLAG] === "true") return;
    section.dataset[HISTORY_WRAP_FLAG] = "true";

    var nodes = Array.from(section.childNodes);
    var details = document.createElement("details");
    details.className = "price-history-toggle";
    details.dataset.pricePanel = panelKey;
    details.open = panelOpen(panelKey, false);

    var summary = document.createElement("summary");
    summary.textContent = summaryText;
    details.appendChild(summary);

    var body = document.createElement("div");
    body.className = "price-history-toggle-body";

    nodes.forEach(function (node) {
      body.appendChild(node);
    });

    section.innerHTML = "";
    details.appendChild(body);
    section.appendChild(details);
    details.addEventListener("toggle", function () {
      setPanelOpen(panelKey, details.open);
    });
  }

  function ensureModalHistory(body) {
    if (!body) return;
    Array.from(body.querySelectorAll(".price-modal-section")).forEach(function (section) {
      var title = section.querySelector(".price-section-title");
      var text = title ? String(title.textContent || "").trim() : "";
      if (!text) return;
      if (text.indexOf("РСЃС‚РѕСЂРёСЏ РїРµСЂРёРѕРґР°") !== -1) {
        wrapHistorySection(section, "period-history", "РСЃС‚РѕСЂРёСЏ РїРµСЂРёРѕРґР°");
      } else if (text.indexOf("РСЃС‚РѕСЂРёСЏ СЂРµС€РµРЅРёР№") !== -1) {
        wrapHistorySection(section, "decision-history", "РСЃС‚РѕСЂРёСЏ СЂРµС€РµРЅРёР№ Рё РґРѕРїСѓСЃС‚РёРјРѕР№ РјР°СЂР¶Рё");
      }
    });
  }

  function enhanceModal() {
    var body = document.getElementById(MODAL_BODY_ID);
    if (!body) return;
    ensureModalNote(body);
    ensureModalHistory(body);
  }

  function ensureSeedHydrated() {
    var stateRef = priceState();
    if (!stateRef || stateRef.seed || stateRef.loading) return;
    if (typeof window.ensurePriceWorkbenchSeedLoaded !== "function") return;
    if (seedKickoff) return;
    seedKickoff = Promise.resolve()
      .then(function () {
        return window.ensurePriceWorkbenchSeedLoaded();
      })
      .then(function () {
        seedKickoff = null;
        if (activeViewName() !== "prices") return;
        if (typeof window.renderPriceWorkbench === "function") {
          try {
            window.renderPriceWorkbench();
          } catch {}
        }
      })
      .catch(function () {
        seedKickoff = null;
      });
  }

  function enhanceToolbar() {
    var root = document.getElementById(VIEW_ID);
    if (!root) return;
    ensureSeedHydrated();
    ensureToolbarGuide(root);
  }

  function enhance() {
    window.clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(function () {
      ensureStyles();
      enhanceToolbar();
      enhanceModal();
    }, 40);
  }

  function scheduleEnhanceBurst() {
    [0, 120, 420, 1200].forEach(function (delay) {
      window.setTimeout(enhance, delay);
    });
  }

  function installObserver() {
    var root = document.getElementById(VIEW_ID);
    if (root && !toolbarObserver) {
      toolbarObserver = new MutationObserver(enhance);
      toolbarObserver.observe(root, { childList: true, subtree: true });
    }
    var body = document.getElementById(MODAL_BODY_ID);
    if (body && !modalObserver) {
      modalObserver = new MutationObserver(enhance);
      modalObserver.observe(body, { childList: true, subtree: true });
    }
    scheduleEnhanceBurst();
  }

  if (typeof window.renderPriceWorkbench === "function" && !window.renderPriceWorkbench.__ALTEA_PRICE_CALENDAR_PATCHED__) {
    var previous = window.renderPriceWorkbench;
    var wrapped = function patchedPriceWorkbenchRender() {
      var result = previous.apply(this, arguments);
      enhance();
      installObserver();
      return result;
    };
    wrapped.__ALTEA_PRICE_CALENDAR_PATCHED__ = true;
    window.renderPriceWorkbench = wrapped;
  }

  document.addEventListener("DOMContentLoaded", installObserver, { once: true });
  window.addEventListener("load", installObserver, { once: true });
  window.addEventListener("altea:viewchange", function (event) {
    if (!event || !event.detail || event.detail.view !== "prices") return;
    ensureSeedHydrated();
    installObserver();
    scheduleEnhanceBurst();
  });
  installObserver();
  scheduleEnhanceBurst();
})();
