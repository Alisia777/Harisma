(function () {
  'use strict';
  var themeKey = 'altea.portal.theme.v1';
  var oldThemeKey = 'altea.portal.theme';
  var sidebarKey = 'altea.portal.sidebar.v1';
  var oldSidebarKey = 'altea.sidebarCollapsed';
  var backgroundKey = 'altea.portal.background.v1';
  var legacyThemeMap = {
    dark: 'noir-pearl',
    light: 'porcelain-day',
    gray: 'graphite-frost',
    emerald: 'emerald-atelier',
    hellforge: 'garnet-velvet',
    terminal: 'emerald-atelier',
    redalert: 'red-alert-2'
  };
  var themes = {
    'noir-pearl': 'dark',
    'amethyst-night': 'dark',
    'sapphire-ink': 'dark',
    'emerald-atelier': 'dark',
    'garnet-velvet': 'dark',
    'bronze-smoke': 'dark',
    'graphite-frost': 'dark',
    'porcelain-day': 'light',
    'red-alert-2': 'dark',
    'warcraft-2': 'dark'
  };
  var backgrounds = {
    motion: true,
    static: true,
    theme: true,
    clean: true
  };
  function read(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  }
  function theme(value) {
    if (themes[value]) return value;
    if (legacyThemeMap[value]) return legacyThemeMap[value];
    return 'noir-pearl';
  }
  function sidebar(value) {
    if (value === 'expanded' || value === 'compact' || value === 'hidden') return value;
    if (read(oldSidebarKey) === '1') return 'hidden';
    return window.innerWidth < 780 ? 'hidden' : 'expanded';
  }
  function background(value) {
    return backgrounds[value] ? value : 'motion';
  }

  function installTaskRouteGate() {
    if (window.__ALTEA_TASK_ROUTE_GATE__) return window.__ALTEA_TASK_ROUTE_GATE__.install();

    var TASK_FILTER_TOUCHED_KEY = '__ALTEA_TASK_FILTERS_TOUCHED_THIS_SESSION__';
    var TASK_LOADING_MIN_MS = 900;
    var baseRender = typeof window.renderControlCenter === 'function' ? window.renderControlCenter : null;
    var installing = false;
    var styleInstalled = false;
    var observer = null;
    var renderTimer = 0;
    var loadingReleaseTimer = 0;
    var lastMotionHideAt = 0;
    var taskLoadingStartedAt = 0;

    function appState() {
      return window.__alteaAppState || window.__ALTEA_STATE__ || window.state || {};
    }

    function routeName() {
      var hash = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
      if (hash === 'tasks' || hash === 'task') return 'control';
      if (hash) return hash;
      var active = document.querySelector('.view.active[id^="view-"]');
      if (active && active.id) return active.id.replace(/^view-/, '');
      return String(appState().activeView || '').trim().toLowerCase();
    }

    function isControlRoute() {
      return routeName() === 'control';
    }

    function ensureStyle() {
      if (styleInstalled || !document.head) return;
      styleInstalled = true;
      var style = document.createElement('style');
      style.id = 'altea-task-route-gate-style';
      style.textContent = [
        'body.altea-task-route-gate .altea-motion-stage[data-scene="transition"],',
        'body.altea-task-route-gate .route-loader,',
        'body.altea-task-route-gate .portal-loader{opacity:0!important;visibility:hidden!important;display:none!important;pointer-events:none!important;}',
        '#view-control.active{contain:layout paint style;isolation:isolate;}',
        '#view-control.active>[data-task-calendar-design-v1]{position:relative;z-index:1;}',
        '#view-control [data-task-route-gate-placeholder]{min-height:520px;display:grid;gap:18px;align-content:center;padding:34px;border:1px solid rgba(219,199,163,.22);border-radius:12px;background:linear-gradient(135deg,rgba(219,199,163,.1),rgba(255,255,255,.025) 42%,rgba(0,0,0,.18)),#11100d;color:#f7f1e7;box-shadow:0 28px 80px rgba(0,0,0,.28);}',
        '#view-control [data-task-route-gate-placeholder] .task-gate-kicker{color:#dbc7a3;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.16em;}',
        '#view-control [data-task-route-gate-placeholder] h2{margin:8px 0 0;font:500 42px/1.02 Georgia,serif;}',
        '#view-control [data-task-route-gate-placeholder] p{max-width:760px;margin:8px 0 0;color:rgba(247,241,231,.7);font-size:13px;line-height:1.5;}',
        '#view-control [data-task-route-gate-placeholder] .task-gate-loader{width:min(560px,100%);height:10px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.07);border:1px solid rgba(219,199,163,.18);}',
        '#view-control [data-task-route-gate-placeholder] .task-gate-loader i{display:block;width:46%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#8b6a35,#ead8b7,#8b6a35);animation:taskGateLoading 1.05s ease-in-out infinite;}',
        '@keyframes taskGateLoading{0%{transform:translateX(-110%)}100%{transform:translateX(235%)}}'
      ].join('\n');
      document.head.appendChild(style);
    }

    function hideMotionHard() {
      if (!isControlRoute()) return;
      ensureStyle();
      if (document.body) document.body.classList.add('altea-task-route-gate');

      var stage = document.querySelector('.altea-motion-stage');
      var stageNeedsHide = !!(stage && (!stage.hidden || stage.classList.contains('is-visible') || stage.style.display !== 'none'));
      var now = Date.now();
      if (!stageNeedsHide && now - lastMotionHideAt < 180) return;
      lastMotionHideAt = now;

      try {
        if (window.AlteaMotion && typeof window.AlteaMotion.hide === 'function') window.AlteaMotion.hide();
      } catch (error) {}

      if (stage) {
        stage.classList.remove('is-visible', 'is-complete');
        stage.hidden = true;
        stage.style.setProperty('display', 'none', 'important');
        stage.style.setProperty('visibility', 'hidden', 'important');
        stage.style.setProperty('pointer-events', 'none', 'important');
      }
      document.querySelectorAll('.route-loader,.portal-loader').forEach(function (node) {
        node.style.setProperty('display', 'none', 'important');
        node.style.setProperty('visibility', 'hidden', 'important');
        node.style.setProperty('pointer-events', 'none', 'important');
      });
    }

    function clearMotionGateIfNeeded() {
      if (isControlRoute()) return;
      if (document.body) document.body.classList.remove('altea-task-route-gate');
      taskLoadingStartedAt = 0;
      window.clearTimeout(loadingReleaseTimer);
      var stage = document.querySelector('.altea-motion-stage');
      if (stage) {
        stage.style.removeProperty('display');
        stage.style.removeProperty('visibility');
      }
    }

    function controlRoot() {
      return document.getElementById('view-control');
    }

    function placeholderShell(root) {
      return root ? root.querySelector('[data-task-route-gate-placeholder]') : null;
    }

    function realTaskShell(root) {
      if (!root) return null;
      return root.querySelector('[data-task-calendar-design-v1]:not([data-task-route-gate-placeholder])');
    }

    function markTaskFiltersTouched(event) {
      var target = event && event.target && event.target.closest ? event.target.closest('[data-task-filter],[data-task-preset],[data-task-reset]') : null;
      if (target) window[TASK_FILTER_TOUCHED_KEY] = true;
    }

    function resetInitialTaskFilters() {
      if (!isControlRoute() || window[TASK_FILTER_TOUCHED_KEY]) return;
      var state = appState();
      state.controlFilters = state.controlFilters && typeof state.controlFilters === 'object' ? state.controlFilters : {};
      var filters = state.controlFilters;
      var defaults = {
        search: '',
        owner: 'all',
        status: 'active',
        type: 'all',
        priority: 'all',
        horizon: 'all',
        source: 'all',
        platform: 'all'
      };
      Object.keys(defaults).forEach(function (key) {
        filters[key] = defaults[key];
      });
      delete filters.peopleRole;
      delete filters.lazyQueue;
      delete filters.taskFullMode;
      try {
        if (typeof window.invalidateControlTaskCache === 'function') window.invalidateControlTaskCache();
      } catch (error) {}
    }

    function cleanupLegacyTaskLayers(root) {
      var shell = realTaskShell(root);
      if (!root || !shell) return;
      Array.from(root.children).forEach(function (child) {
        if (child === shell || child.contains(shell)) return;
        child.remove();
      });
      root.querySelectorAll('.control-simple-panel,[data-task-lazy-panel],.task-center-queues,.task-center-hotfix,[data-control-simple-root],.section-title.control-simple-title,.control-simple-title').forEach(function (node) {
        if (!node.closest('[data-task-calendar-design-v1]')) node.remove();
      });
    }

    function renderPlaceholder() {
      var root = controlRoot();
      if (!root) return null;
      if (!taskLoadingStartedAt) taskLoadingStartedAt = Date.now();
      try { appState().activeView = 'control'; } catch (error) {}
      document.querySelectorAll('.view').forEach(function (view) {
        view.classList.toggle('active', view === root);
      });
      document.querySelectorAll('.nav-btn').forEach(function (button) {
        button.classList.toggle('active', button.dataset && button.dataset.view === 'control');
      });
      if (!root.querySelector('[data-task-calendar-design-v1]')) {
        root.innerHTML = [
          '<section class="task-design-v1 is-loading" data-task-calendar-design-v1 data-task-kanban-v1 data-task-route-gate-placeholder>',
          '<div><span class="task-gate-kicker">ALTEA · TASKS</span><h2>Загружаем задачи команды</h2><p>Сначала подтягиваем задачи и сбрасываем служебные фильтры, чтобы не показывать пустой экран до готовности канбана.</p></div>',
          '<div class="task-gate-loader" aria-hidden="true"><i></i></div>',
          '<p>Это короткий защитный экран: он должен исчезнуть сам, без кнопки «Сбросить».</p>',
          '</section>'
        ].join('');
      }
      return root;
    }

    function releaseLoadingAfterMinDelay() {
      var elapsed = taskLoadingStartedAt ? Date.now() - taskLoadingStartedAt : TASK_LOADING_MIN_MS;
      if (elapsed >= TASK_LOADING_MIN_MS) return true;
      window.clearTimeout(loadingReleaseTimer);
      loadingReleaseTimer = window.setTimeout(scheduleTaskRender, Math.max(80, TASK_LOADING_MIN_MS - elapsed));
      return false;
    }

    function renderTaskLayer() {
      hideMotionHard();
      resetInitialTaskFilters();
      var root = controlRoot();
      if (realTaskShell(root)) {
        taskLoadingStartedAt = 0;
        cleanupLegacyTaskLayers(root);
        return root;
      }

      var api = window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__;
      if (api && typeof api.renderControl === 'function') {
        if (!taskLoadingStartedAt) taskLoadingStartedAt = Date.now();
        if (!releaseLoadingAfterMinDelay()) return renderPlaceholder();
        var placeholder = placeholderShell(root);
        if (placeholder) placeholder.remove();
        try { return api.renderControl({ skipReady: true }); } catch (error) { console.warn('[task-route-gate]', error); }
      }
      return renderPlaceholder();
    }

    function controlGate() {
      if (isControlRoute()) return renderTaskLayer();
      if (typeof baseRender === 'function') return baseRender.apply(this, arguments);
      return null;
    }
    controlGate.__taskDesignV1Wrapped = true;
    controlGate.__taskRouteGate = true;

    function install() {
      if (installing) return;
      var descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(window, 'renderControlCenter'); } catch (error) {}
      if (descriptor && descriptor.get && descriptor.get.__taskRouteGateGetter) return;
      if (descriptor && typeof descriptor.value === 'function' && !descriptor.value.__taskRouteGate) baseRender = descriptor.value;
      if (!descriptor && typeof window.renderControlCenter === 'function' && !window.renderControlCenter.__taskRouteGate) baseRender = window.renderControlCenter;
      installing = true;
      var getter = function () { return controlGate; };
      getter.__taskRouteGateGetter = true;
      try {
        Object.defineProperty(window, 'renderControlCenter', {
          configurable: true,
          get: getter,
          set: function (fn) {
            if (typeof fn === 'function' && !fn.__taskRouteGate) baseRender = fn;
          }
        });
      } catch (error) {}
      installing = false;
    }

    function scheduleTaskRender() {
      if (!isControlRoute()) {
        clearMotionGateIfNeeded();
        return;
      }
      window.clearTimeout(renderTimer);
      renderTimer = window.setTimeout(function () {
        install();
        renderTaskLayer();
      }, 60);
    }

    function scheduleTaskBurst() {
      scheduleTaskRender();
      [260, 900].forEach(function (delay) {
        window.setTimeout(scheduleTaskRender, delay);
      });
    }

    function watchMotion() {
      if (!window.MutationObserver || observer) return;
      var target = document.body;
      if (!target) {
        window.setTimeout(watchMotion, 60);
        return;
      }
      observer = new MutationObserver(function () {
        if (isControlRoute()) hideMotionHard();
      });
      observer.observe(target, { childList: true, subtree: false });
    }

    install();
    ensureStyle();
    watchMotion();

    window.__ALTEA_TASK_ROUTE_GATE__ = {
      install: install,
      render: renderTaskLayer,
      hideMotion: hideMotionHard,
      resetFilters: resetInitialTaskFilters,
      base: function () { return baseRender; }
    };

    [0, 120, 420, 1200].forEach(function (delay) {
      window.setTimeout(function () {
        install();
        if (isControlRoute()) renderTaskLayer();
      }, delay);
    });

    ['DOMContentLoaded', 'hashchange', 'altea:viewchange', 'altea:app-ready', 'altea:data-ready', 'altea:marketplacechange'].forEach(function (eventName) {
      window.addEventListener(eventName, scheduleTaskBurst, true);
    });
    window.addEventListener('altea:portal-storage-updated', scheduleTaskRender, true);

    document.addEventListener('input', markTaskFiltersTouched, true);
    document.addEventListener('change', markTaskFiltersTouched, true);
    document.addEventListener('click', function (event) {
      markTaskFiltersTouched(event);
      var target = event.target && event.target.closest ? event.target.closest('[data-view="control"],[href$="#control"],[href*="#control"]') : null;
      if (!target) return;
      if (document.body) document.body.classList.add('altea-task-route-gate');
      taskLoadingStartedAt = 0;
      scheduleTaskBurst();
    }, true);
  }

  var selectedTheme = theme(read(themeKey) || read(oldThemeKey) || document.documentElement.dataset.theme);
  document.documentElement.dataset.theme = selectedTheme;
  document.documentElement.dataset.themeMode = themes[selectedTheme] || 'dark';
  document.documentElement.dataset.sidebar = sidebar(read(sidebarKey));
  document.documentElement.dataset.portalBackground = background(read(backgroundKey) || document.documentElement.dataset.portalBackground);
  installTaskRouteGate();
})();
