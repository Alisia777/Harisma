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

    var baseRender = typeof window.renderControlCenter === 'function' ? window.renderControlCenter : null;
    var installing = false;
    var styleInstalled = false;
    var observer = null;

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
        '#view-control.active>[data-task-calendar-design-v1]{position:relative;z-index:1;}'
      ].join('\n');
      document.head.appendChild(style);
    }

    function hideMotionHard() {
      if (!isControlRoute()) return;
      ensureStyle();
      if (document.body) document.body.classList.add('altea-task-route-gate');
      try {
        if (window.AlteaMotion && typeof window.AlteaMotion.hide === 'function') window.AlteaMotion.hide();
      } catch (error) {}
      var stage = document.querySelector('.altea-motion-stage');
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
      var stage = document.querySelector('.altea-motion-stage');
      if (stage) {
        stage.style.removeProperty('display');
        stage.style.removeProperty('visibility');
      }
    }

    function controlRoot() {
      return document.getElementById('view-control');
    }

    function renderPlaceholder() {
      var root = controlRoot();
      if (!root) return null;
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
          '<div class="task-design-toolbar"><div><span class="task-design-kicker">ALTEA · TASKS V1</span><h2>Задачи команды</h2><p>Поднимаем рабочий слой задач без старого контура.</p></div></div>',
          '<div class="task-design-skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span></div>',
          '</section>'
        ].join('');
      }
      return root;
    }

    function renderTaskLayer() {
      hideMotionHard();
      var api = window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__;
      if (api && typeof api.renderControl === 'function') {
        try { return api.renderControl({ skipReady: false }); } catch (error) { console.warn('[task-route-gate]', error); }
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
      [0, 40, 120, 320, 900, 1800].forEach(function (delay) {
        window.setTimeout(function () {
          install();
          renderTaskLayer();
        }, delay);
      });
    }

    function watchMotion() {
      if (!window.MutationObserver || observer || !document.documentElement) return;
      observer = new MutationObserver(function () {
        if (isControlRoute()) hideMotionHard();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-scene'] });
    }

    install();
    ensureStyle();
    watchMotion();

    window.__ALTEA_TASK_ROUTE_GATE__ = {
      install: install,
      render: renderTaskLayer,
      hideMotion: hideMotionHard,
      base: function () { return baseRender; }
    };

    var ticks = 0;
    var timer = window.setInterval(function () {
      install();
      if (isControlRoute()) hideMotionHard();
      ticks += 1;
      if (ticks > 500 && window.__ALTEA_TASKS_CALENDAR_DESIGN_V1_API__) window.clearInterval(timer);
    }, 40);

    ['DOMContentLoaded', 'hashchange', 'altea:viewchange', 'altea:app-ready', 'altea:data-ready', 'altea:portal-storage-updated', 'altea:marketplacechange'].forEach(function (eventName) {
      window.addEventListener(eventName, scheduleTaskRender, true);
    });
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-view="control"],[href$="#control"],[href*="#control"]') : null;
      if (!target) return;
      if (document.body) document.body.classList.add('altea-task-route-gate');
      scheduleTaskRender();
    }, true);
  }

  var selectedTheme = theme(read(themeKey) || read(oldThemeKey) || document.documentElement.dataset.theme);
  document.documentElement.dataset.theme = selectedTheme;
  document.documentElement.dataset.themeMode = themes[selectedTheme] || 'dark';
  document.documentElement.dataset.sidebar = sidebar(read(sidebarKey));
  document.documentElement.dataset.portalBackground = background(read(backgroundKey) || document.documentElement.dataset.portalBackground);
  installTaskRouteGate();
})();
