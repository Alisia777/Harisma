(function () {
  var STORAGE_KEY = 'altea.portal.theme';
  var PLATFORM_STORAGE_KEY = 'altea.portal.platform';
  var themes = [
    { id: 'dark', label: '\u0422\u0435\u043c\u043d\u0430\u044f', title: '\u0422\u0435\u043c\u043d\u0430\u044f \u0442\u0435\u043a\u0443\u0449\u0430\u044f' },
    { id: 'light', label: '\u0421\u0432\u0435\u0442\u043b\u0430\u044f', title: '\u0421\u0432\u0435\u0442\u043b\u0430\u044f \u0442\u0435\u043c\u0430' },
    { id: 'gray', label: '\u0421\u0435\u0440\u0430\u044f', title: '\u0421\u0435\u0440\u0430\u044f \u0442\u0435\u043c\u0430' },
    { id: 'emerald', label: '\u0418\u0437\u0443\u043c\u0440\u0443\u0434', title: '\u0418\u0437\u0443\u043c\u0440\u0443\u0434\u043d\u0430\u044f \u0442\u0435\u043c\u0430' },
    { id: 'hellforge', label: '\u0410\u0434\u0441\u043a\u0438\u0439', title: '\u0422\u0435\u043c\u043d\u043e\u0435 ARPG: \u043a\u0440\u043e\u0432\u044c, \u043c\u0430\u043d\u0430, \u0437\u043e\u043b\u043e\u0442\u043e' },
    { id: 'terminal', label: '\u0422\u0435\u0440\u043c\u0438\u043d\u0430\u043b', title: '\u0420\u0435\u0442\u0440\u043e-\u0442\u0435\u0440\u043c\u0438\u043d\u0430\u043b \u043a\u0443\u043b\u044c\u0442\u043e\u0432\u043e\u0439 RPG' },
    { id: 'redalert', label: '\u041a\u0438\u0440\u043e\u0432', title: 'Red Alert 2 / Kirov Reporting: \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u044b\u0439 \u043f\u0443\u043b\u044c\u0442' }
  ];
  var ids = themes.reduce(function (memo, theme) {
    memo[theme.id] = true;
    return memo;
  }, {});
  var currentTheme = 'dark';
  var isOpen = false;
  var guardTimer = 0;
  var routeMotionTimer = 0;
  var routeMotionFrame = 0;
  var lastActiveRoute = '';
  var routeObserver = null;

  function normalizeTheme(theme) {
    return ids[theme] ? theme : 'dark';
  }

  function readTheme() {
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY) || document.body.dataset.portalTheme || 'dark');
    } catch (error) {
      return normalizeTheme(document.body.dataset.portalTheme || 'dark');
    }
  }

  function syncButtons() {
    var buttons = document.querySelectorAll('.portal-theme-switcher__panel [data-portal-theme-option]');
    buttons.forEach(function (button) {
      var active = button.dataset.portalThemeOption === currentTheme;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    syncSwitcherUi();
  }

  function syncSwitcherUi() {
    var switcher = document.querySelector('[data-portal-theme-switcher]');
    if (!switcher) return;

    var toggle = switcher.querySelector('[data-portal-theme-toggle]');
    var panel = switcher.querySelector('[data-portal-theme-panel]');
    var toggleLabel = isOpen ? '\u0421\u043a\u0440\u044b\u0442\u044c \u0442\u0435\u043c\u044b' : '\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0442\u0435\u043c\u044b';

    switcher.dataset.portalThemeCurrent = currentTheme;
    switcher.classList.toggle('is-open', isOpen);

    if (toggle) {
      toggle.dataset.portalThemeOption = currentTheme;
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggle.setAttribute('aria-label', toggleLabel);
      toggle.title = toggleLabel;
    }

    if (panel) {
      panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    }
  }

  function setOpen(open) {
    isOpen = Boolean(open);
    syncSwitcherUi();
  }

  function guardSandDarkClass() {
    if (!document.body) return;
    document.body.classList.remove('theme-sand-dark');
  }

  function scheduleGuard() {
    if (guardTimer) return;
    guardTimer = window.requestAnimationFrame(function () {
      guardTimer = 0;
      guardSandDarkClass();
    });
  }

  function readPlatform() {
    try {
      return localStorage.getItem(PLATFORM_STORAGE_KEY) || document.body.dataset.platform || 'all';
    } catch (error) {
      return document.body.dataset.platform || 'all';
    }
  }

  function syncPremiumShellAttributes() {
    if (!document.body) return;
    var platform = readPlatform();
    document.documentElement.dataset.theme = currentTheme;
    document.documentElement.dataset.platform = platform;
    document.body.dataset.theme = currentTheme;
    document.body.dataset.platform = platform;
    document.body.classList.add('altea-premium-shell');
  }

  function emitThemeChange() {
    try {
      window.dispatchEvent(new CustomEvent('altea:themechange', { detail: { theme: currentTheme } }));
    } catch (error) {}
  }

  function applyTheme(theme, persist) {
    if (!document.body) return;
    currentTheme = normalizeTheme(theme);
    document.documentElement.dataset.portalTheme = currentTheme;
    document.body.dataset.portalTheme = currentTheme;
    syncPremiumShellAttributes();
    guardSandDarkClass();
    syncButtons();
    emitThemeChange();
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, currentTheme);
      } catch (error) {}
    }
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function getActiveView() {
    return document.querySelector('.view.active[id^="view-"]');
  }

  function applyRouteMotion(force) {
    if (!document.body) return;
    var activeView = getActiveView();
    if (!activeView) return;

    var route = activeView.id.replace(/^view-/, '');
    document.body.dataset.activeRoute = route;
    if (!force && route === lastActiveRoute) return;
    lastActiveRoute = route;

    if (routeMotionTimer) {
      window.clearTimeout(routeMotionTimer);
      routeMotionTimer = 0;
    }

    activeView.classList.remove('altea-premium-route-enter');
    if (reducedMotion()) return;

    void activeView.offsetWidth;
    activeView.classList.add('altea-premium-route-enter');
    routeMotionTimer = window.setTimeout(function () {
      activeView.classList.remove('altea-premium-route-enter');
      routeMotionTimer = 0;
    }, 940);
  }

  function scheduleRouteMotion(force) {
    if (routeMotionFrame) return;
    routeMotionFrame = window.requestAnimationFrame(function () {
      routeMotionFrame = 0;
      applyRouteMotion(force);
    });
  }

  function bindPremiumRouteMotion() {
    if (routeObserver) return;

    scheduleRouteMotion(true);
    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('[data-view]')) {
        scheduleRouteMotion(false);
      }
    });

    var motionRoot = document.querySelector('.main') || document.body;
    routeObserver = new MutationObserver(function (mutations) {
      var changed = mutations.some(function (mutation) {
        return mutation.type === 'attributes'
          && mutation.attributeName === 'class'
          && mutation.target
          && mutation.target.classList
          && mutation.target.classList.contains('view');
      });
      if (changed) scheduleRouteMotion(false);
    });
    routeObserver.observe(motionRoot, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  function createButton(theme) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'portal-theme-switcher__button';
    button.dataset.portalThemeOption = theme.id;
    button.title = theme.title;
    button.setAttribute('aria-label', theme.title);
    button.setAttribute('aria-pressed', 'false');

    var swatch = document.createElement('span');
    swatch.className = 'portal-theme-switcher__swatch';
    swatch.setAttribute('aria-hidden', 'true');
    button.appendChild(swatch);

    var text = document.createElement('span');
    text.className = 'portal-theme-switcher__sr';
    text.textContent = theme.label;
    button.appendChild(text);

    button.addEventListener('click', function () {
      applyTheme(theme.id, true);
      setOpen(false);
    });

    return button;
  }

  function mountSwitcher() {
    if (!document.body || document.querySelector('[data-portal-theme-switcher]')) return;

    var switcher = document.createElement('div');
    switcher.className = 'portal-theme-switcher';
    switcher.dataset.portalThemeSwitcher = 'true';
    switcher.setAttribute('aria-label', '\u041f\u0430\u043d\u0435\u043b\u044c \u0442\u0435\u043c\u044b');

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'portal-theme-switcher__button portal-theme-switcher__toggle';
    toggle.dataset.portalThemeToggle = 'true';
    toggle.dataset.portalThemeOption = currentTheme;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      setOpen(!isOpen);
    });

    var toggleSwatch = document.createElement('span');
    toggleSwatch.className = 'portal-theme-switcher__swatch';
    toggleSwatch.setAttribute('aria-hidden', 'true');
    toggle.appendChild(toggleSwatch);

    var toggleText = document.createElement('span');
    toggleText.className = 'portal-theme-switcher__sr';
    toggleText.textContent = '\u0422\u0435\u043c\u044b';
    toggle.appendChild(toggleText);
    switcher.appendChild(toggle);

    var panel = document.createElement('div');
    panel.className = 'portal-theme-switcher__panel';
    panel.dataset.portalThemePanel = 'true';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', '\u0412\u044b\u0431\u043e\u0440 \u0442\u0435\u043c\u044b');
    panel.setAttribute('aria-hidden', 'true');

    var label = document.createElement('span');
    label.className = 'portal-theme-switcher__label';
    label.textContent = '\u0422\u0435\u043c\u0430';
    panel.appendChild(label);

    themes.forEach(function (theme) {
      panel.appendChild(createButton(theme));
    });

    switcher.appendChild(panel);
    (document.querySelector('.app-shell') || document.body).appendChild(switcher);
    syncButtons();
  }

  function bindCloseEvents() {
    document.addEventListener('click', function (event) {
      var switcher = document.querySelector('[data-portal-theme-switcher]');
      if (!isOpen || !switcher || switcher.contains(event.target)) return;
      setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setOpen(false);
    });

    var shell = document.querySelector('.app-shell');
    if (shell) {
      var shellObserver = new MutationObserver(function (mutations) {
        var shouldClose = mutations.some(function (mutation) {
          return mutation.type === 'attributes' && mutation.attributeName === 'class';
        });
        if (shouldClose && shell.classList.contains('sidebar-collapsed')) setOpen(false);
      });
      shellObserver.observe(shell, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function boot() {
    currentTheme = readTheme();
    applyTheme(currentTheme, false);
    mountSwitcher();
    bindCloseEvents();
    bindPremiumRouteMotion();

    window.addEventListener('storage', function (event) {
      if (event.key === STORAGE_KEY) applyTheme(event.newValue || 'dark', false);
      if (event.key === PLATFORM_STORAGE_KEY) syncPremiumShellAttributes();
    });

    if (document.body) {
      var observer = new MutationObserver(function (mutations) {
        var shouldGuard = mutations.some(function (mutation) {
          return mutation.type === 'attributes' && mutation.attributeName === 'class';
        });
        if (shouldGuard) scheduleGuard();
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

(function () {
  if (window.__ALTEA_CLOSED_TASK_DEDUPE_LOADER_20260605__) return;
  window.__ALTEA_CLOSED_TASK_DEDUPE_LOADER_20260605__ = true;
  var src = 'portal-control-closed-task-dedupe-hotfix.js?v=20260605closed-auto-signal1';
  var base = src.split('?')[0];
  if (window.__ALTEA_CONTROL_CLOSED_TASK_DEDUPE_20260605__) return;
  var scripts = Array.prototype.slice.call(document.scripts || []);
  if (scripts.some(function (script) { return String(script.src || '').indexOf(base) !== -1; })) return;
  var node = document.createElement('script');
  node.src = src;
  node.async = false;
  (document.head || document.body || document.documentElement).appendChild(node);
})();
