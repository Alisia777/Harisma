(function () {
  if (window.__ALTEA_MOTION_RUNTIME__) return;
  window.__ALTEA_MOTION_RUNTIME__ = true;

  var BOOT_MIN_MS = 2200;
  var BOOT_MAX_MS = 5600;
  var ROUTE_MS = 980;
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

  function workspaceMarkup() {
    return [
      '<section class="altea-motion-scene altea-workspace-scene dark">',
      '<div class="altea-motion-inner">',
      topLine("white", "Внутренний портал<br>команды бренда", "Системы доступны"),
      '<div class="altea-workspace-grid">',
      '<div class="altea-workspace-copy">',
      '<div class="altea-workspace-kicker">Altea private workspace</div>',
      '<h1 class="serif">Собираем ваше<br><em>рабочее пространство</em></h1>',
      '<p>Загружаем товары, цены, остатки и аналитику. Свет и движение показывают процесс — без ощущения технического экрана.</p>',
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

  function transitionMarkup() {
    return [
      '<section class="altea-motion-scene altea-route-scene dark">',
      '<div class="altea-motion-inner">',
      '<img class="altea-motion-logo altea-route-logo" src="' + logo("white") + '" alt="Алтея">',
      '<div class="altea-route-center">',
      '<div class="altea-route-index">Раздел · Рабочее пространство</div>',
      '<h1 class="altea-route-title serif" data-altea-route-title>Открываем <em>раздел</em></h1>',
      '<div class="altea-route-rule"></div>',
      '<div class="altea-route-sub">Переходим к рабочему пространству</div>',
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
      '<div class="altea-process-row live"><div class="altea-process-icon">03</div><div><div class="altea-process-name">Сверяем изменения</div><div class="altea-process-desc">Цены, остатки и статусы</div></div><div class="altea-process-state">В процессе</div></div>',
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

  function sceneMarkup(scene) {
    if (scene === "transition") return transitionMarkup();
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
    stage.classList.remove("is-complete");
    stage.setAttribute("data-scene", scene || "workspace");
    live.setAttribute("data-theme", theme);
    live.className = "altea-motion-live is-" + (scene || "workspace");
    live.innerHTML = sceneMarkup(scene || "workspace");
    if (scene === "transition") {
      var titleNode = live.querySelector("[data-altea-route-title]");
      if (titleNode) {
        titleNode.textContent = "";
        titleNode.appendChild(document.createTextNode(options.label || "Открываем раздел"));
      }
    }
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
    stage.classList.remove("is-visible");
    stopProgress();
    hideTimer = window.setTimeout(function () {
      if (stage && !stage.classList.contains("is-visible")) {
        stage.hidden = true;
        stage.classList.remove("is-complete");
        stopCanvas();
      }
    }, 720);
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
      if (statusPending() && !statusReady()) return;
      show("transition", { duration: ROUTE_MS, label: routeTitle(button) });
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

  window.AlteaMotion = {
    show: show,
    hide: hide,
    boot: function () { show("workspace", { duration: 1800, label: "Загрузка бренда", progressStart: 12, progressTarget: 76 }); },
    workspace: function () { show("workspace", { label: "Собираем рабочее пространство", progressStart: 12, progressTarget: 92 }); },
    skeleton: function () { show("skeleton", { label: "Обновляем аналитику" }); },
    transition: function (label) { show("transition", { duration: ROUTE_MS, label: label || "Открываем раздел" }); },
    pageTransition: function (label) { show("transition", { duration: ROUTE_MS, label: label || "Открываем раздел" }); },
    importing: function () { show("import", { label: "Обрабатываем данные", progressStart: 24, progressTarget: 78 }); },
    success: function () { show("success", { duration: 1800, label: "Все обновлено" }); },
    empty: function () { show("skeleton", { label: "Раздел пока пустой" }); },
    reconnect: function () { show("reconnect", { force: true, label: "Возвращаем соединение" }); },
    toast: toast,
    setButtonLoading: setButtonLoading
  };

  ready(boot);
})();
