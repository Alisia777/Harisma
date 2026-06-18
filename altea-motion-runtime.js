(function () {
  if (window.__ALTEA_MOTION_RUNTIME__) return;
  window.__ALTEA_MOTION_RUNTIME__ = true;

  var BOOT_MIN_MS = 1200;
  var BOOT_MAX_MS = 6800;
  var ROUTE_MS = 980;
  var stage = null;
  var hideTimer = 0;
  var bootTimer = 0;
  var bootStartedAt = 0;
  var statusPoll = 0;
  var bootOverlayShown = false;
  var bootOverlayDone = false;

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

  function ensureStage() {
    if (stage) return stage;
    stage = document.createElement("div");
    stage.className = "altea-motion-stage";
    stage.hidden = true;
    stage.setAttribute("data-scene", "workspace");
    stage.setAttribute("aria-live", "polite");
    stage.innerHTML = [
      '<div class="altea-motion-vignette" aria-hidden="true"></div>',
      '<div class="altea-motion-grain" aria-hidden="true"></div>',
      '<span class="altea-motion-sr" data-altea-motion-label>Загружаем рабочее пространство</span>'
    ].join("");
    document.body.appendChild(stage);
    return stage;
  }

  function setLabel(text) {
    var label = stage && stage.querySelector("[data-altea-motion-label]");
    if (label) label.textContent = text || "";
  }

  function show(scene, options) {
    options = options || {};
    if (document.body.classList.contains("portal-auth-locked")) return;
    if (motionReduced() && !options.force) return;
    var node = ensureStage();
    window.clearTimeout(hideTimer);
    node.hidden = false;
    node.setAttribute("data-scene", scene || "workspace");
    setLabel(options.label || "Загружаем рабочее пространство");
    requestAnimationFrame(function () {
      node.classList.add("is-visible");
    });
    if (options.duration) {
      hideTimer = window.setTimeout(hide, options.duration);
    }
  }

  function hide() {
    if (!stage) return;
    window.clearTimeout(hideTimer);
    stage.classList.remove("is-visible");
    hideTimer = window.setTimeout(function () {
      if (stage && !stage.classList.contains("is-visible")) stage.hidden = true;
    }, 680);
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
    if (!bootOverlayShown) return;
    var elapsed = Date.now() - bootStartedAt;
    if (elapsed < BOOT_MIN_MS) return;
    if (statusReady()) {
      completeBoot();
    }
  }

  function forceHideBoot() {
    if (!bootOverlayShown) return;
    completeBoot();
  }

  function completeBoot() {
    hide();
    stopStatusPoll();
    window.clearTimeout(bootTimer);
    bootTimer = 0;
    bootOverlayShown = false;
    bootOverlayDone = true;
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
    bootStartedAt = Date.now();
    show("workspace", { label: "Собираем рабочее пространство" });
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
    boot: function () { show("boot", { duration: 1800, label: "Загрузка бренда" }); },
    workspace: function () { show("workspace", { label: "Собираем рабочее пространство" }); },
    skeleton: function () { show("skeleton", { label: "Обновляем аналитику" }); },
    transition: function () { show("transition", { duration: ROUTE_MS, label: "Открываем раздел" }); },
    importing: function () { show("import", { label: "Обрабатываем данные" }); },
    success: function () { show("success", { duration: 1600, label: "Все обновлено" }); },
    empty: function () { show("empty", { label: "Раздел пока пустой" }); },
    reconnect: function () { show("reconnect", { force: true, label: "Возвращаем соединение" }); },
    toast: toast,
    setButtonLoading: setButtonLoading
  };

  ready(boot);
})();
