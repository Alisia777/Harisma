(function () {
  if (window.__ALTEA_MOTION_RUNTIME__) return;
  window.__ALTEA_MOTION_RUNTIME__ = true;

  var BOOT_MIN_MS = 2200;
  var BOOT_MAX_MS = 5600;
  var ROUTE_MS = 760;
  var stage = null;
  var live = null;
  var canvas = null;
  var ctx = null;
  var hideTimer = 0;
  var bootTimer = 0;
  var bootStartedAt = 0;
  var statusPoll = 0;
  var bootOverlayShown = false;
  var bootOverlayDone = false;
  var finishingBoot = false;
  var progressFrame = 0;
  var progressValue = 0;
  var progressScene = "";
  var canvasFrame = 0;
  var canvasTheme = "dark";
  var canvasReady = false;
  var canvasW = 0;
  var canvasH = 0;
  var canvasDpr = 1;

  var ROUTE_LOADERS = {
    dashboard: {
      index: "01",
      section: "Главное",
      label: "Дашборд",
      kicker: "Пульс портала",
      title: "Собираем <em>картину дня</em>",
      note: "Сводим продажи, планы, остатки и командные сигналы в один спокойный экран.",
      steps: ["Синхронизируем каналы", "Пересчитываем ключевые показатели", "Выстраиваем приоритеты дня"],
      accent: "#d8c6a4",
      accentRgb: "216,198,164",
      art: "dashboard"
    },
    "data-health": {
      index: "02",
      section: "Главное",
      label: "Календарь",
      kicker: "Ритм команды",
      title: "Выстраиваем <em>календарь событий</em>",
      note: "Собираем акции, встречи, дедлайны и привязки SKU в единую временную сетку.",
      steps: ["Загружаем события", "Сверяем даты", "Подсвечиваем активные окна"],
      accent: "#c0cfd3",
      accentRgb: "192,207,211",
      art: "calendar"
    },
    control: {
      index: "03",
      section: "Главное",
      label: "Задачи",
      kicker: "Контроль исполнения",
      title: "Наводим <em>порядок в задачах</em>",
      note: "Подтягиваем владельцев, сроки, статусы и контрольные точки по команде.",
      steps: ["Получаем статусы", "Проверяем сроки", "Собираем рабочую очередь"],
      accent: "#caa795",
      accentRgb: "202,167,149",
      art: "tasks"
    },
    executive: {
      index: "04",
      section: "Главное",
      label: "Руководителю",
      kicker: "Управленческий контур",
      title: "Готовим <em>решение для руководителя</em>",
      note: "Сводим ключевые отклонения, командные KPI и итоги без информационного шума.",
      steps: ["Сверяем план и факт", "Подсвечиваем отклонения", "Формируем сигналы"],
      accent: "#e2cfaf",
      accentRgb: "226,207,175",
      art: "executive"
    },
    "sku-plan-fact": {
      index: "05",
      section: "Деньги и товар",
      label: "План-факт SKU",
      kicker: "Точность планирования",
      title: "Сверяем <em>план и факт SKU</em>",
      note: "Находим разрывы по SKU и показываем вклад каждой позиции в общий результат.",
      steps: ["Подтягиваем продажи", "Сопоставляем план", "Считаем отклонения"],
      accent: "#d3b57c",
      accentRgb: "211,181,124",
      art: "planfact"
    },
    repricer: {
      index: "06",
      section: "Деньги и товар",
      label: "Репрайсер",
      kicker: "Динамическое управление",
      title: "Готовим <em>ценовые решения</em>",
      note: "Проверяем коридоры, маржу и ограничения перед публикацией рекомендаций.",
      steps: ["Получаем срезы маркетплейсов", "Проверяем коридоры", "Готовим рекомендации"],
      accent: "#bba3c6",
      accentRgb: "187,163,198",
      art: "table"
    },
    prices: {
      index: "07",
      section: "Деньги и товар",
      label: "Цены",
      kicker: "Ценовой контур",
      title: "Открываем <em>ценовую матрицу</em>",
      note: "Сверяем РРЦ, скидки, СПП и итоговую маржу в отдельном рабочем разделе.",
      steps: ["Сверяем РРЦ", "Пересчитываем комиссии", "Проверяем итоговую маржу"],
      accent: "#d29880",
      accentRgb: "210,152,128",
      art: "prices"
    },
    order: {
      index: "08",
      section: "Операции",
      label: "Заказ товара",
      kicker: "Поставка и склад",
      title: "Строим <em>маршрут поставки</em>",
      note: "Считаем потребность по кластерам, остатки и будущий план движения товара.",
      steps: ["Считаем потребность", "Сверяем остатки", "Строим план поставки"],
      accent: "#a4b9a0",
      accentRgb: "164,185,160",
      art: "supply"
    },
    "oos-control": {
      index: "09",
      section: "Операции",
      label: "OOS контроль",
      kicker: "Доступность товара",
      title: "Сканируем <em>риски OOS</em>",
      note: "Проверяем остатки, дни до дефицита и риск потерь по ключевым позициям.",
      steps: ["Сканируем остатки", "Считаем дни до OOS", "Подсвечиваем риски"],
      accent: "#cd7e78",
      accentRgb: "205,126,120",
      art: "oos"
    },
    "sku-contour": {
      index: "10",
      section: "Операции",
      label: "SKU workspace",
      kicker: "Единый паспорт SKU",
      title: "Собираем <em>контур SKU</em>",
      note: "Связываем карточки, идентификаторы, API-источники и рабочие статусы.",
      steps: ["Сверяем карточки", "Проверяем источники", "Собираем паспорт SKU"],
      accent: "#81b29e",
      accentRgb: "129,178,158",
      art: "workspace"
    },
    launches: {
      index: "11",
      section: "Продукт",
      label: "Новинки",
      kicker: "Продуктовый портфель",
      title: "Поднимаем <em>витрину новинок</em>",
      note: "Собираем продуктовые гипотезы, готовность карточек и ограничения запуска.",
      steps: ["Получаем гипотезы", "Сверяем готовность", "Оцениваем потенциал"],
      accent: "#e1ccbe",
      accentRgb: "225,204,190",
      art: "cards"
    },
    "launch-control": {
      index: "12",
      section: "Продукт",
      label: "Запуск новинок",
      kicker: "Критический путь",
      title: "Прокладываем <em>путь запуска</em>",
      note: "Собираем чек-листы, фазы и контрольные точки от идеи до старта.",
      steps: ["Сверяем чек-листы", "Проверяем критический путь", "Готовим прогноз старта"],
      accent: "#ddb76f",
      accentRgb: "221,183,111",
      art: "timeline"
    },
    "iu-drr": {
      index: "13",
      section: "Аналитика",
      label: "Показатели площадок",
      kicker: "Эффективность каналов",
      title: "Собираем <em>показатели площадок</em>",
      note: "Нормализуем расходы, выручку, возвраты и эффективность в одном разрезе.",
      steps: ["Подтягиваем расходы", "Нормализуем выручку", "Рассчитываем эффективность"],
      accent: "#c1898b",
      accentRgb: "193,137,139",
      art: "analytics"
    },
    "wb-rating": {
      index: "14",
      section: "Аналитика",
      label: "Рейтинг карточек",
      kicker: "Качество контента",
      title: "Проверяем <em>рейтинг карточек</em>",
      note: "Собираем оценки, отзывы и динамику качества карточек.",
      steps: ["Получаем рейтинг", "Проверяем контент", "Строим динамику"],
      accent: "#b1c4cf",
      accentRgb: "177,196,207",
      art: "rating"
    },
    "product-leaderboard": {
      index: "15",
      section: "Аналитика",
      label: "Продуктовый лидерборд",
      kicker: "Рейтинг результата",
      title: "Формируем <em>лидерборд</em>",
      note: "Сверяем вклад, баллы, воронку и итоговый рейтинг продуктовых направлений.",
      steps: ["Сверяем KPI", "Нормализуем вклад", "Формируем рейтинг"],
      accent: "#dcc495",
      accentRgb: "220,196,149",
      art: "leaderboard"
    }
  };

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function motionReduced() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function logo(kind) {
    var color = kind === "black" ? "black" : kind === "champagne" ? "champagne" : "white";
    return "assets/altea-motion/logos/altea-logo-" + color + ".png";
  }

  function ensureStage() {
    if (stage) return stage;
    stage = document.createElement("div");
    stage.className = "altea-motion-stage";
    stage.hidden = true;
    stage.setAttribute("data-scene", "workspace");
    stage.setAttribute("aria-live", "polite");
    stage.innerHTML = [
      '<canvas class="altea-motion-canvas" data-altea-motion-canvas></canvas>',
      '<div class="altea-motion-vignette" aria-hidden="true"></div>',
      '<div class="altea-motion-grain" aria-hidden="true"></div>',
      '<div class="altea-motion-live" data-altea-motion-live></div>',
      '<span class="altea-motion-sr" data-altea-motion-label>Загружаем рабочее пространство</span>'
    ].join("");
    document.body.appendChild(stage);
    live = stage.querySelector("[data-altea-motion-live]");
    canvas = stage.querySelector("[data-altea-motion-canvas]");
    return stage;
  }

  function setLabel(text) {
    var label = stage && stage.querySelector("[data-altea-motion-label]");
    if (label) label.textContent = text || "";
  }

  function themeForScene(scene) {
    return scene === "import" || scene === "success" || scene === "micro" ? "light" : "dark";
  }

  function topLine(kind, meta, status) {
    return [
      '<div class="altea-motion-topline">',
      '<div class="altea-motion-lockup">',
      '<img class="altea-motion-logo" src="' + logo(kind) + '" alt="Алтея">',
      '<div class="altea-motion-divider"></div>',
      '<div class="altea-motion-micro-label">' + meta + "</div>",
      "</div>",
      status ? '<div class="altea-motion-status-pill"><i class="altea-motion-status-dot"></i>' + status + "</div>" : "",
      "</div>"
    ].join("");
  }

  function routeForView(view, label) {
    var key = String(view || "").trim();
    var route = ROUTE_LOADERS[key] || ROUTE_LOADERS.dashboard;
    if (!route && label) {
      route = {
        index: "00",
        section: "Портал",
        label: label,
        kicker: "Рабочий раздел",
        title: "Открываем <em>раздел</em>",
        note: "Подготавливаем рабочую область портала.",
        steps: ["Собираем данные", "Проверяем доступ", "Открываем экран"],
        accent: "#cfb996",
        accentRgb: "207,185,150",
        art: "dashboard"
      };
    }
    return route || ROUTE_LOADERS.dashboard;
  }

  function routeFromOptions(options) {
    options = options || {};
    if (options.route) return options.route;
    var view = options.view || options.routeId || "";
    return routeForView(view, options.label);
  }

  function routeSidebarOffset() {
    var shell = document.querySelector(".app-shell");
    if (!shell || shell.classList.contains("sidebar-collapsed")) return 0;
    if ((window.innerWidth || document.documentElement.clientWidth || 0) <= 1100) return 0;
    var sidebar = document.querySelector(".sidebar");
    return sidebar ? Math.max(0, Math.round(sidebar.getBoundingClientRect().width)) : 250;
  }

  function applyRouteVars(route, scene) {
    if (!stage) return;
    if (scene === "transition" && route) {
      stage.style.setProperty("--altea-route-left", routeSidebarOffset() + "px");
      stage.style.setProperty("--altea-route-accent", route.accent || "#cfb996");
      stage.style.setProperty("--altea-route-accent-rgb", route.accentRgb || "207,185,150");
      stage.style.setProperty("--altea-route-accent-2", route.accent2 || "#f5efe2");
    } else {
      stage.style.setProperty("--altea-route-left", "0px");
    }
  }

  function routeLine(width, cls) {
    return '<i class="altea-route-line ' + (cls || "") + '" style="--w:' + width + '%"></i>';
  }

  function routeArtMarkup(route) {
    var art = route.art || "dashboard";
    if (art === "dashboard") {
      return [
        '<div class="altea-route-art-card altea-route-art-dashboard">',
        '<div class="altea-route-metrics"><b>57</b><span>level C</span></div>',
        '<svg class="altea-route-chart" viewBox="0 0 420 180" preserveAspectRatio="none" aria-hidden="true">',
        '<path class="area" d="M0 160 C55 148 80 105 128 116 S205 77 252 89 S315 36 356 52 S390 42 420 28 L420 180 L0 180Z"></path>',
        '<path class="line" d="M0 160 C55 148 80 105 128 116 S205 77 252 89 S315 36 356 52 S390 42 420 28"></path>',
        '</svg>',
        '<div class="altea-route-mini-bars">' + [42, 70, 56, 86, 62, 92].map(function (h) { return '<i style="--h:' + h + '%"></i>'; }).join("") + '</div>',
        '</div>'
      ].join("");
    }
    if (art === "executive") {
      return '<div class="altea-route-art-card altea-route-art-grid">' + ["План", "Риски", "Команда", "Итог"].map(function (name, index) {
        return '<div><strong>' + [94, 18, 7, 43][index] + (index === 2 ? "/7" : "%") + '</strong><span>' + name + '</span>' + routeLine(78 - index * 8, index === 1 ? "warn" : "") + '</div>';
      }).join("") + '</div>';
    }
    if (art === "tasks") {
      return '<div class="altea-route-art-card altea-route-art-kanban">' + [4, 3, 2].map(function (count, col) {
        return '<div><b>' + count + '</b>' + Array.from({ length: count }, function (_, i) {
          return '<span>' + routeLine(78 - i * 8, col === 1 ? "warn" : "") + routeLine(54 + i * 4, "small") + '</span>';
        }).join("") + '</div>';
      }).join("") + '</div>';
    }
    if (art === "calendar") {
      return '<div class="altea-route-art-card altea-route-art-calendar">' + Array.from({ length: 28 }, function (_, i) {
        return '<i class="' + (i % 6 === 0 || i % 11 === 0 ? "live" : "") + '">' + String(i + 1).padStart(2, "0") + '</i>';
      }).join("") + '</div>';
    }
    if (art === "planfact" || art === "table") {
      return '<div class="altea-route-art-card altea-route-art-table">' + Array.from({ length: 7 }, function (_, i) {
        return '<div class="altea-route-table-row"><span>' + routeLine(78 - i * 3) + '</span><span>' + routeLine(48 + i * 4, "small") + '</span><span>' + routeLine(38 + i * 5, "accent") + '</span><b>' + (art === "table" ? (i % 2 ? "↘" : "↗") : (i % 2 ? "+" : "-")) + '</b></div>';
      }).join("") + '</div>';
    }
    if (art === "prices") {
      return '<div class="altea-route-art-card altea-route-art-prices"><div class="altea-route-price-ring"><b>₽</b></div><div class="altea-route-price-stack"><span>РРЦ</span><span>СПП</span><span>Маржа</span></div></div>';
    }
    if (art === "supply") {
      return '<div class="altea-route-art-card altea-route-art-supply"><svg viewBox="0 0 420 220" preserveAspectRatio="none"><path d="M42 122 C118 28 253 30 347 82 C433 132 346 213 214 190 C104 171 23 186 42 122"></path></svg>' + [1, 2, 3, 4, 5].map(function (n) { return '<i class="node n' + n + '"></i>'; }).join("") + '</div>';
    }
    if (art === "oos") {
      return '<div class="altea-route-art-card altea-route-art-radar"><div class="radar"></div><div class="risk-list"><span>3 дн.</span><span>5 дн.</span><span>8 дн.</span></div></div>';
    }
    if (art === "workspace") {
      return '<div class="altea-route-art-card altea-route-art-workspace">' + ["a", "b", "c", "d"].map(function (n) { return '<span class="api ' + n + '">' + routeLine(70) + routeLine(46, "small") + '</span>'; }).join("") + '<div class="cube"></div></div>';
    }
    if (art === "cards") {
      return '<div class="altea-route-art-card altea-route-art-cards">' + [1, 2, 3].map(function (_, i) { return '<div><b></b>' + routeLine(82 - i * 6) + routeLine(58 + i * 5, "small") + '</div>'; }).join("") + '</div>';
    }
    if (art === "timeline") {
      return '<div class="altea-route-art-card altea-route-art-timeline">' + ["Идея", "Карточка", "Контент", "Поставка", "Старт"].map(function (step, i) { return '<span><b>' + String(i + 1).padStart(2, "0") + '</b><small>' + step + '</small></span>'; }).join("") + '</div>';
    }
    if (art === "analytics") {
      return '<div class="altea-route-art-card altea-route-art-analytics"><svg viewBox="0 0 430 210" preserveAspectRatio="none"><path class="area" d="M0 185 C58 170 88 116 144 134 S242 66 292 88 S360 36 430 46 L430 210 L0 210Z"></path><path class="line" d="M0 185 C58 170 88 116 144 134 S242 66 292 88 S360 36 430 46"></path><path class="line secondary" d="M0 150 C90 132 130 154 194 98 S282 128 340 76 S388 82 430 62"></path></svg></div>';
    }
    if (art === "rating") {
      return '<div class="altea-route-art-card altea-route-art-rating"><strong>4.86</strong><div class="stars">★★★★★</div>' + [94, 86, 72, 64].map(function (w) { return routeLine(w); }).join("") + '</div>';
    }
    if (art === "leaderboard") {
      return '<div class="altea-route-art-card altea-route-art-leaderboard"><div class="podium"><i class="second">2</i><i class="first">1</i><i class="third">3</i></div>' + [92, 86, 79].map(function (w) { return routeLine(w); }).join("") + '</div>';
    }
    return routeArtMarkup(ROUTE_LOADERS.dashboard);
  }

  function workspaceMarkup() {
    return [
      '<section class="altea-motion-scene altea-workspace-scene dark">',
      '<div class="altea-motion-inner">',
      topLine("white", "Внутренний портал<br>команды бренда", "Системы доступны"),
      '<div class="altea-workspace-grid">',
      '<div class="altea-workspace-copy">',
      '<div class="altea-workspace-kicker">Altea private workspace</div>',
      '<h1 class="serif">Собираем ваше<br><em>рабочее пространство</em></h1>',
      '<p>Загружаем товары, остатки, задачи и аналитику. Свет и движение показывают процесс — без ощущения технического экрана.</p>',
      "</div>",
      '<div class="altea-loader-cluster">',
      '<div class="altea-loader-aura"></div>',
      '<div class="altea-loader-satellite"></div>',
      '<div class="altea-loader-ring" data-altea-motion-ring>',
      '<div class="altea-loader-inside">',
      '<div class="altea-loader-percent"><span data-altea-motion-percent>12</span><small>%</small></div>',
      '<div class="altea-loader-caption">подготовлено</div>',
      "</div>",
      "</div>",
      '<div class="altea-step-card">',
      '<div class="altea-step done"><i></i><div><b>Профиль и доступы</b><span>готово</span></div></div>',
      '<div class="altea-step done"><i></i><div><b>Товары и остатки</b><span>синхронизировано</span></div></div>',
      '<div class="altea-step live"><i></i><div><b>Аналитика продаж</b><span>обновляем показатели</span></div></div>',
      '<div class="altea-step"><i></i><div><b>Персональные виджеты</b><span>следующий этап</span></div></div>',
      "</div>",
      "</div>",
      "</div>",
      "</div>",
      "</section>"
    ].join("");
  }

  function transitionMarkup(options) {
    var route = routeFromOptions(options);
    return [
      '<section class="altea-motion-scene altea-route-scene dark" data-route-art="' + (route.art || "dashboard") + '">',
      '<div class="altea-motion-inner">',
      '<img class="altea-motion-logo altea-route-logo" src="' + logo("white") + '" alt="Алтея">',
      '<div class="altea-route-shell">',
      '<div class="altea-route-copy">',
      '<div class="altea-route-index">' + route.index + ' / ' + route.section + '</div>',
      '<h1 class="altea-route-title serif" data-altea-route-title>' + route.title + '</h1>',
      '<p class="altea-route-note">' + route.note + '</p>',
      '<div class="altea-route-steps">' + route.steps.map(function (step, index) { return '<span class="' + (index === 0 ? "is-live" : "") + '"><i>' + String(index + 1).padStart(2, "0") + '</i>' + step + '</span>'; }).join("") + '</div>',
      '<div class="altea-route-rule"></div>',
      '<div class="altea-route-sub">' + route.kicker + '</div>',
      '</div>',
      '<div class="altea-route-visual" aria-hidden="true">' + routeArtMarkup(route) + '</div>',
      "</div>",
      "</div>",
      "</section>"
    ].join("");
  }

  function importMarkup() {
    return [
      '<section class="altea-motion-scene altea-import-scene light">',
      '<div class="altea-motion-inner">',
      topLine("black", "Private workspace", "Защищенная обработка"),
      '<div class="altea-import-layout">',
      '<div class="altea-import-copy">',
      '<div class="altea-motion-micro-label" style="margin-bottom:26px">Обновление данных</div>',
      '<h1 class="serif">Приводим данные<br><em>в идеальный порядок</em></h1>',
      '<p>Премиальный экран для импорта прайс-листов, остатков, реестров и тяжелых операций, где пользователю важно видеть уверенный прогресс.</p>',
      '<div class="altea-import-ring-wrap">',
      '<div class="altea-import-ring" data-altea-motion-ring></div>',
      '<div class="altea-import-progress"><div><strong><span data-altea-motion-percent>24</span>%</strong><span>обработано</span></div></div>',
      "</div>",
      "</div>",
      '<div class="altea-process-card">',
      '<div class="altea-process-top"><div><h3>Обновление каталога</h3><p>Проверяем структуру и изменения</p></div><span class="altea-file-pill">XLSX · 12,8 MB</span></div>',
      '<div class="altea-process-row done"><div class="altea-process-icon">✓</div><div><div class="altea-process-name">Файл загружен</div><div class="altea-process-desc">Соединение проверено</div></div><div class="altea-process-state">Готово</div></div>',
      '<div class="altea-process-row done"><div class="altea-process-icon">✓</div><div><div class="altea-process-name">Структура распознана</div><div class="altea-process-desc">4 286 товарных строк</div></div><div class="altea-process-state">Готово</div></div>',
      '<div class="altea-process-row live"><div class="altea-process-icon">03</div><div><div class="altea-process-name">Сверяем изменения</div><div class="altea-process-desc">Данные, остатки и статусы</div></div><div class="altea-process-state">В процессе</div></div>',
      '<div class="altea-process-row"><div class="altea-process-icon">04</div><div><div class="altea-process-name">Публикация</div><div class="altea-process-desc">Применим после проверки</div></div><div class="altea-process-state">Ожидает</div></div>',
      '<div class="altea-process-bar"></div>',
      "</div>",
      "</div>",
      "</div>",
      "</section>"
    ].join("");
  }

  function successMarkup() {
    return [
      '<section class="altea-motion-scene altea-success-scene light">',
      '<div class="altea-motion-inner">',
      '<img class="altea-motion-logo altea-success-logo" src="' + logo("black") + '" alt="Алтея">',
      '<div class="altea-success-center">',
      '<div class="altea-success-orb"><div class="altea-check-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.2 4.2L19 7"/></svg></div></div>',
      '<h1 class="serif">Все обновлено</h1>',
      '<p>Изменения сохранены, показатели пересчитаны, команда увидит актуальные данные без перезагрузки страницы.</p>',
      "</div>",
      "</div>",
      "</section>"
    ].join("");
  }

  function reconnectMarkup() {
    return [
      '<section class="altea-motion-scene altea-reconnect-scene dark">',
      '<div class="altea-motion-inner">',
      '<div class="altea-reconnect-card">',
      '<div class="altea-signal"><i></i><i></i><i></i><b></b></div>',
      '<h1 class="serif">Возвращаем соединение</h1>',
      '<p>Не закрывайте страницу. Изменения сохранены локально и будут отправлены сразу после восстановления доступа.</p>',
      '<div class="altea-reconnect-meta"><span>Данные защищены</span><span>Повторная попытка через 4 сек.</span></div>',
      "</div>",
      "</div>",
      "</section>"
    ].join("");
  }

  function skeletonMarkup() {
    return [
      '<section class="altea-motion-scene altea-skeleton-scene dark">',
      '<div class="altea-skeleton-shell">',
      '<aside class="altea-skeleton-side">',
      '<img class="altea-motion-logo" src="' + logo("white") + '" alt="Алтея">',
      '<div class="altea-skeleton-row" style="width:64%;margin-top:42px"></div>',
      '<div class="altea-skeleton-row" style="width:82%"></div>',
      '<div class="altea-skeleton-row" style="width:74%"></div>',
      "</aside>",
      '<main class="altea-skeleton-main">',
      '<div class="altea-motion-topline" style="animation:none;opacity:1">',
      '<div><h2 class="serif" style="font-size:34px;margin:0">Доброе утро</h2><p style="font-size:11px;color:rgba(255,255,255,.39);margin:8px 0 0">Подготавливаем актуальную картину по бренду</p></div>',
      '<div class="altea-motion-status-pill"><i class="altea-motion-status-dot"></i>Обновляем аналитику</div>',
      "</div>",
      '<div class="altea-skeleton-grid">',
      '<div class="altea-skeleton-card"><div class="altea-skeleton-row" style="width:56%"></div><div class="altea-skeleton-row" style="width:82%;height:34px;margin-top:24px"></div><div class="altea-skeleton-row" style="width:45%"></div></div>',
      '<div class="altea-skeleton-card"><div class="altea-skeleton-row" style="width:50%"></div><div class="altea-skeleton-row" style="width:78%;height:34px;margin-top:24px"></div><div class="altea-skeleton-row" style="width:39%"></div></div>',
      '<div class="altea-skeleton-card"><div class="altea-skeleton-row" style="width:58%"></div><div class="altea-skeleton-row" style="width:70%;height:34px;margin-top:24px"></div><div class="altea-skeleton-row" style="width:47%"></div></div>',
      '<div class="altea-skeleton-card"><div class="altea-skeleton-row" style="width:46%"></div><div class="altea-skeleton-row" style="width:76%;height:34px;margin-top:24px"></div><div class="altea-skeleton-row" style="width:43%"></div></div>',
      "</div>",
      "</main>",
      "</div>",
      "</section>"
    ].join("");
  }

  function sceneMarkup(scene, options) {
    if (scene === "transition") return transitionMarkup(options);
    if (scene === "import") return importMarkup();
    if (scene === "success") return successMarkup();
    if (scene === "reconnect") return reconnectMarkup();
    if (scene === "skeleton") return skeletonMarkup();
    return workspaceMarkup();
  }

  function renderScene(scene, options) {
    ensureStage();
    options = options || {};
    var theme = themeForScene(scene);
    var route = scene === "transition" ? routeFromOptions(options) : null;
    stage.classList.remove("is-complete");
    stage.setAttribute("data-scene", scene || "workspace");
    applyRouteVars(route, scene);
    live.setAttribute("data-theme", theme);
    live.className = "altea-motion-live is-" + (scene || "workspace");
    live.innerHTML = sceneMarkup(scene || "workspace", options);
    startCanvas(theme);
  }

  function show(scene, options) {
    options = options || {};
    if (document.body.classList.contains("portal-auth-locked")) return;
    if (motionReduced() && !options.force) return;
    var node = ensureStage();
    window.clearTimeout(hideTimer);
    renderScene(scene || "workspace", options);
    node.hidden = false;
    setLabel(options.label || "Загружаем рабочее пространство");
    requestAnimationFrame(function () {
      node.classList.add("is-visible");
    });
    if (scene === "workspace" || scene === "import") {
      startProgress(scene, options);
    } else {
      stopProgress();
    }
    if (options.duration) {
      hideTimer = window.setTimeout(hide, options.duration);
    }
  }

  function hide() {
    if (!stage) return;
    window.clearTimeout(hideTimer);
    var settleMs = stage.getAttribute("data-scene") === "transition" ? 360 : 720;
    stage.classList.remove("is-visible");
    stopProgress();
    hideTimer = window.setTimeout(function () {
      if (stage && !stage.classList.contains("is-visible")) {
        stage.hidden = true;
        stage.classList.remove("is-complete");
        stopCanvas();
      }
    }, settleMs);
  }

  function statusReady() {
    var status = document.getElementById("syncStatusBadge");
    return !!(status && status.classList && status.classList.contains("ready"));
  }

  function statusPending() {
    var status = document.getElementById("syncStatusBadge");
    return !!(status && status.classList && status.classList.contains("pending"));
  }

  function maybeHideBoot() {
    if (!bootOverlayShown || finishingBoot) return;
    var elapsed = Date.now() - bootStartedAt;
    if (elapsed < BOOT_MIN_MS) return;
    if (statusReady()) {
      finishBoot();
    }
  }

  function forceHideBoot() {
    if (!bootOverlayShown || finishingBoot) return;
    finishBoot();
  }

  function finishBoot() {
    finishingBoot = true;
    stopStatusPoll();
    window.clearTimeout(bootTimer);
    bootTimer = 0;
    if (stage) stage.classList.add("is-complete");
    animateProgressTo(100, 520, completeBoot);
  }

  function completeBoot() {
    finishingBoot = false;
    bootOverlayShown = false;
    bootOverlayDone = true;
    hide();
  }

  function startStatusPoll() {
    stopStatusPoll();
    statusPoll = window.setInterval(maybeHideBoot, 250);
  }

  function stopStatusPoll() {
    if (statusPoll) window.clearInterval(statusPoll);
    statusPoll = 0;
  }

  function showBootOverlay() {
    if (bootOverlayShown || bootOverlayDone || document.body.classList.contains("portal-auth-locked")) return;
    bootOverlayShown = true;
    finishingBoot = false;
    bootStartedAt = Date.now();
    show("workspace", {
      label: "Собираем рабочее пространство",
      progressStart: 12,
      progressTarget: 92
    });
    startStatusPoll();
    window.clearTimeout(bootTimer);
    bootTimer = window.setTimeout(forceHideBoot, BOOT_MAX_MS);
  }

  function bindAuthUnlock() {
    if (!document.body.classList.contains("portal-auth-locked")) {
      showBootOverlay();
      return;
    }
    var observer = new MutationObserver(function () {
      if (!document.body.classList.contains("portal-auth-locked")) {
        showBootOverlay();
      } else {
        bootOverlayShown = false;
        bootOverlayDone = false;
        finishingBoot = false;
        window.clearTimeout(bootTimer);
        stopStatusPoll();
        hide();
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function routeTitle(button) {
    var text = "";
    if (button) {
      var title = button.querySelector(".nav-title, span");
      text = title ? title.textContent : button.textContent;
    }
    return String(text || "Открываем раздел").trim();
  }

  function bindRouteTransitions() {
    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") return;
      var button = target.closest(".nav-btn[data-view]");
      if (!button || document.body.classList.contains("portal-auth-locked")) return;
      show("transition", { duration: ROUTE_MS, label: routeTitle(button), view: button.dataset.view });
    }, true);
  }

  function bindConnectionState() {
    window.addEventListener("offline", function () {
      show("reconnect", { force: true, label: "Возвращаем соединение" });
    });
    window.addEventListener("online", function () {
      hide();
      toast("Соединение восстановлено", "Портал снова получает данные");
    });
  }

  function progressNodes() {
    if (!stage) return {};
    return {
      rings: stage.querySelectorAll("[data-altea-motion-ring]"),
      labels: stage.querySelectorAll("[data-altea-motion-percent]")
    };
  }

  function updateProgress(value) {
    var rounded = Math.max(0, Math.min(100, Math.round(value)));
    progressValue = rounded;
    var nodes = progressNodes();
    for (var i = 0; i < nodes.rings.length; i += 1) {
      nodes.rings[i].style.setProperty("--altea-progress", String(rounded));
    }
    for (var j = 0; j < nodes.labels.length; j += 1) {
      nodes.labels[j].textContent = String(rounded);
    }
  }

  function easeOut(value) {
    return 1 - Math.pow(1 - value, 2.35);
  }

  function startProgress(scene, options) {
    stopProgress();
    options = options || {};
    progressScene = scene || "workspace";
    var start = Number(options.progressStart || (progressScene === "import" ? 24 : 12));
    var target = Number(options.progressTarget || (progressScene === "import" ? 78 : 92));
    var duration = Number(options.progressDuration || BOOT_MAX_MS);
    var startedAt = performance.now();
    updateProgress(start);
    function tick(now) {
      if (!stage || stage.hidden || !stage.classList.contains("is-visible")) return;
      var t = Math.min(1, Math.max(0, (now - startedAt) / duration));
      var next = start + (target - start) * easeOut(t);
      var shimmer = Math.sin(now / 420) * 1.15;
      updateProgress(Math.max(progressValue, next + shimmer));
      progressFrame = window.requestAnimationFrame(tick);
    }
    progressFrame = window.requestAnimationFrame(tick);
  }

  function animateProgressTo(target, duration, done) {
    stopProgress();
    var start = progressValue || 0;
    var startedAt = performance.now();
    function tick(now) {
      var t = Math.min(1, Math.max(0, (now - startedAt) / duration));
      updateProgress(start + (target - start) * easeOut(t));
      if (t < 1) {
        progressFrame = window.requestAnimationFrame(tick);
      } else if (typeof done === "function") {
        done();
      }
    }
    progressFrame = window.requestAnimationFrame(tick);
  }

  function stopProgress() {
    if (progressFrame) window.cancelAnimationFrame(progressFrame);
    progressFrame = 0;
  }

  function initCanvas() {
    if (canvasReady || !canvas) return;
    try {
      ctx = canvas.getContext("2d");
    } catch (error) {
      ctx = null;
    }
    if (!ctx) return;
    canvasReady = true;
    window.addEventListener("resize", resizeCanvas, { passive: true });
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    canvasDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvasW = window.innerWidth || document.documentElement.clientWidth || 1;
    canvasH = window.innerHeight || document.documentElement.clientHeight || 1;
    canvas.width = Math.floor(canvasW * canvasDpr);
    canvas.height = Math.floor(canvasH * canvasDpr);
    canvas.style.width = canvasW + "px";
    canvas.style.height = canvasH + "px";
    ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
  }

  function rgba(hex, alpha) {
    var value = parseInt(hex.slice(1), 16);
    return "rgba(" + (value >> 16) + "," + ((value >> 8) & 255) + "," + (value & 255) + "," + alpha + ")";
  }

  function orb(x, y, radius, color, alpha) {
    var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba(color, alpha));
    gradient.addColorStop(.25, rgba(color, alpha * .48));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawCanvas(tms) {
    if (!stage || stage.hidden || !stage.classList.contains("is-visible") || !ctx) {
      canvasFrame = 0;
      return;
    }
    var t = tms / 1000;
    var theme = canvasTheme || "dark";
    var palette = theme === "dark" ? ["#ffffff", "#cfb996", "#9ca2a5"] : ["#ffffff", "#cfb996", "#b8bdc0"];
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.globalCompositeOperation = theme === "dark" ? "screen" : "multiply";
    orb(canvasW * (.18 + .05 * Math.sin(t * .31)), canvasH * (.22 + .06 * Math.cos(t * .27)), Math.max(canvasW, canvasH) * .34, palette[0], theme === "dark" ? .035 : .018);
    orb(canvasW * (.72 + .08 * Math.cos(t * .22)), canvasH * (.60 + .09 * Math.sin(t * .24)), Math.max(canvasW, canvasH) * .42, palette[1], theme === "dark" ? .060 : .026);
    orb(canvasW * (.52 + .12 * Math.sin(t * .16 + 1.3)), canvasH * (.44 + .08 * Math.cos(t * .19)), Math.max(canvasW, canvasH) * .31, palette[2], theme === "dark" ? .026 : .014);
    ctx.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.lineWidth = .7;
    ctx.strokeStyle = theme === "dark" ? "rgba(255,255,255,.035)" : "rgba(15,15,15,.025)";
    for (var i = 0; i < 3; i += 1) {
      var y = canvasH * (.30 + i * .17);
      ctx.beginPath();
      ctx.moveTo(-canvasW * .05, y);
      ctx.bezierCurveTo(canvasW * .25, y + Math.sin(t * .3 + i) * 60, canvasW * .65, y - 100 + Math.cos(t * .2 + i) * 60, canvasW * 1.05, y + 20);
      ctx.stroke();
    }
    ctx.restore();
    canvasFrame = window.requestAnimationFrame(drawCanvas);
  }

  function startCanvas(theme) {
    canvasTheme = theme || "dark";
    initCanvas();
    if (!ctx || canvasFrame) return;
    resizeCanvas();
    canvasFrame = window.requestAnimationFrame(drawCanvas);
  }

  function stopCanvas() {
    if (canvasFrame) window.cancelAnimationFrame(canvasFrame);
    canvasFrame = 0;
    if (ctx) ctx.clearRect(0, 0, canvasW, canvasH);
  }

  function toast(title, detail) {
    var el = document.createElement("div");
    el.className = "altea-runtime-toast";
    el.innerHTML = '<span class="art-icon">✓</span><span><b></b><small></small></span>';
    el.querySelector("b").textContent = title || "";
    el.querySelector("small").textContent = detail || "";
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add("show");
    });
    window.setTimeout(function () {
      el.classList.remove("show");
      window.setTimeout(function () {
        if (el.parentNode) el.remove();
      }, 450);
    }, 3200);
  }

  function setButtonLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      button.dataset.alteaMotionLabel = button.textContent;
      button.textContent = label || "Сохраняем";
      button.classList.add("altea-is-loading");
      button.disabled = true;
    } else {
      button.textContent = button.dataset.alteaMotionLabel || button.textContent;
      button.classList.remove("altea-is-loading");
      button.disabled = false;
    }
  }

  function boot() {
    ensureStage();
    bindAuthUnlock();
    bindRouteTransitions();
    bindConnectionState();
  }

  function routeTransition(label, view) {
    var options = typeof label === "object" && label ? Object.assign({}, label) : {
      label: label || "Открываем раздел",
      view: view
    };
    options.duration = options.duration || ROUTE_MS;
    show("transition", options);
  }

  window.AlteaMotion = {
    show: show,
    hide: hide,
    boot: function () { show("workspace", { duration: 1800, label: "Загрузка бренда", progressStart: 12, progressTarget: 76 }); },
    workspace: function () { show("workspace", { label: "Собираем рабочее пространство", progressStart: 12, progressTarget: 92 }); },
    skeleton: function () { show("skeleton", { label: "Обновляем аналитику" }); },
    transition: routeTransition,
    pageTransition: routeTransition,
    importing: function () { show("import", { label: "Обрабатываем данные", progressStart: 24, progressTarget: 78 }); },
    success: function () { show("success", { duration: 1800, label: "Все обновлено" }); },
    empty: function () { show("skeleton", { label: "Раздел пока пустой" }); },
    reconnect: function () { show("reconnect", { force: true, label: "Возвращаем соединение" }); },
    toast: toast,
    setButtonLoading: setButtonLoading
  };

  ready(boot);
})();
