(function () {
  if (window.__ALTEA_PRICE_CALENDAR_UX_HOTFIX_20260425I__) return;
  window.__ALTEA_PRICE_CALENDAR_UX_HOTFIX_20260425I__ = true;

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
    input.title = "Нажмите, чтобы открыть календарь, или введите дату вручную.";
    input.addEventListener("pointerdown", function () {
      openNativePicker(input);
    });
    input.addEventListener("click", function () {
      openNativePicker(input);
    });
    input.addEventListener("focus", function () {
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
      return "Текущая цена и текущая оборачиваемость подтянуты из smart_price_overlay до " + overlayAsOf + ". Диапазон можно ставить на сегодня: если свежей дневной точки еще нет, таблица честно остается на последнем опубликованном срезе.";
    }
    if (latestSeed) {
      return "Сейчас вкладка работает по последнему срезу из smart_price_workbench до " + latestSeed + ". Кнопка \"Сегодня\" нужна, чтобы быстро проверить тот же контур на текущую дату без ручного ввода.";
    }
    return "Вкладка Цены показывает последний доступный срез цен. Если свежий daily-факт еще не доехал, это не ошибка календаря: таблица остается на последней опубликованной дате.";
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
        '<button type="button" class="quick-chip" data-price-date-anchor="today" title="Ставит правую границу на сегодняшнюю дату. Если сегодня еще нет публикации, останется последний доступный срез внутри диапазона.">Сегодня</button>',
        '<button type="button" class="quick-chip" data-price-date-anchor="latest" title="Возвращает правую границу на последний опубликованный ценовой срез из текущего контура.">Последний ценовой срез</button>'
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
      button.title = "Фильтрует рабочий список по площадке. Источник данных кнопка не меняет.";
    });

    toolbar.querySelectorAll("[data-price-preset]").forEach(function (button) {
      if (button.dataset.pricePresetTooltipBound === "true") return;
      button.dataset.pricePresetTooltipBound = "true";
      button.title = "Быстро перестраивает только календарный диапазон относительно правой границы периода.";
    });

    var search = toolbar.querySelector("#priceSearch");
    if (search) {
      search.title = "Ищет по SKU, названию, owner и логике решения.";
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
        '<summary>Что делают кнопки и фильтры наверху</summary>',
        '<ul>',
        '<li><strong>WB / Ozon / Я.Маркет</strong> переключают только рабочий список по площадке. Новый источник данных они не подгружают.</li>',
        '<li><strong>7 / 14 / 30 дней, текущий месяц, прошлый месяц, весь период</strong> быстро меняют календарный диапазон. Это не пересчет Smart, а только другой срез уже загруженных данных.</li>',
        '<li><strong>Сегодня</strong> ставит правую границу на текущую дату. Если на сегодня еще нет опубликованной точки, таблица покажет последний доступный срез внутри диапазона.</li>',
        '<li><strong>Последний ценовой срез</strong> возвращает правую границу на последнюю дату, которая реально приехала в слой цен.</li>',
        '<li><strong>Поиск, Owner, Статус, Сортировка, Только проблемные позиции</strong> фильтруют и переупорядочивают список SKU, но не меняют сами цены.</li>',
        '<li><strong>Клик по строке SKU</strong> открывает карточку артикула, где видно текущие KPI, коридор цены, историю, решение и задачи.</li>',
        '</ul>',
        '</details>',
        '<details>',
        '<summary>Что означают кнопки внутри карточки SKU</summary>',
        '<ul>',
        '<li><strong>Сохранить решение</strong> сохраняет статус, owner, срок, эскалацию, новую цену MP, новую цену клиента, ручную допустимую маржу, флаг “нужна задача”, логику решения и комментарий. После сохранения запись попадает в историю решений.</li>',
        '<li><strong>Создать / обновить задачу</strong> создает или обновляет задачу по этой позиции на основании текущих полей карточки. Кнопка не публикует цену на маркетплейс сама по себе.</li>',
        '<li><strong>История периода</strong> показывает дневные точки цен, клиента, СПП, оборачиваемости, факта и выручки внутри выбранного диапазона.</li>',
        '<li><strong>История решений</strong> показывает, кто и когда менял допустимую маржу, цену и статус по SKU.</li>',
        '<li><strong>Обе истории</strong> можно свернуть. Портал запоминает их открытое или закрытое состояние в этом браузере, чтобы при следующем открытии карточки не приходилось раскрывать их заново.</li>',
        '</ul>',
        '</details>',
        '<details>',
        '<summary>Как работает сохранение и почему история не пропадает</summary>',
        '<ul>',
        '<li><strong>Сначала запись сохраняется локально</strong> в этом браузере, чтобы решение не исчезло после перезагрузки страницы.</li>',
        '<li><strong>Если командное хранилище доступно</strong>, локальная запись затем синхронизируется в общую командную базу.</li>',
        '<li><strong>Если хранилище недоступно</strong>, запись не теряется: она остается на этой машине и в этом браузере, пока не появится возможность синхронизации.</li>',
        '<li><strong>История решений</strong> строится по сохраненным записям, поэтому после сохранения карточка сразу показывает новый шаг и причину решения.</li>',
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
      return "Изменения по кнопке «Сохранить решение» пишутся локально сразу и затем синхронизируются в командное хранилище. Если сеть или team-store недоступны, запись не теряется: она остается локально в этом браузере и позже может досинхронизироваться.";
    }
    return "Сейчас изменения по цене сохраняются локально в этом браузере: после перезагрузки на этой машине они останутся, но другим пользователям автоматически не разойдутся, пока командное хранилище недоступно.";
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
      "<strong>Что именно сохраняется из этой карточки</strong>",
      "<div>" + saveScopeCopy() + "</div>",
      "<div><strong>Сохранить решение</strong> фиксирует статус, owner, срок, эскалацию, новую цену MP, новую цену клиента, ручную допустимую маржу, флаг «нужна задача», логику решения и комментарий.</div>",
      "<div><strong>Создать / обновить задачу</strong> создает или обновляет задачу по SKU на базе текущей карточки, но не отправляет цену на площадку автоматически.</div>"
    ].join("");
    formSection.insertBefore(note, formSection.firstChild);

    var saveButton = formSection.querySelector('button[type="submit"]');
    if (saveButton) {
      saveButton.title = "Сохраняет решение по цене и пишет его в историю изменений по SKU.";
    }
    var taskButton = formSection.querySelector("[data-price-task]");
    if (taskButton) {
      taskButton.title = "Создает или обновляет задачу по этому SKU на основании текущих полей карточки.";
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
      if (text.indexOf("История периода") !== -1) {
        wrapHistorySection(section, "period-history", "История периода");
      } else if (text.indexOf("История решений") !== -1) {
        wrapHistorySection(section, "decision-history", "История решений и допустимой маржи");
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
