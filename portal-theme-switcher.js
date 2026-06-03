(function () {
  var STORAGE_KEY = 'altea.portal.theme';
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
  var guardTimer = 0;

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
    var buttons = document.querySelectorAll('[data-portal-theme-option]');
    buttons.forEach(function (button) {
      var active = button.dataset.portalThemeOption === currentTheme;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function guardSandDarkClass() {
    if (!document.body) return;
    if (currentTheme === 'dark') {
      document.body.classList.add('theme-sand-dark');
      return;
    }
    document.body.classList.remove('theme-sand-dark');
  }

  function scheduleGuard() {
    if (guardTimer) return;
    guardTimer = window.requestAnimationFrame(function () {
      guardTimer = 0;
      guardSandDarkClass();
    });
  }

  function applyTheme(theme, persist) {
    if (!document.body) return;
    currentTheme = normalizeTheme(theme);
    document.documentElement.dataset.portalTheme = currentTheme;
    document.body.dataset.portalTheme = currentTheme;
    guardSandDarkClass();
    syncButtons();
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, currentTheme);
      } catch (error) {}
    }
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
    });

    return button;
  }

  function mountSwitcher() {
    if (!document.body || document.querySelector('[data-portal-theme-switcher]')) return;

    var switcher = document.createElement('div');
    switcher.className = 'portal-theme-switcher';
    switcher.dataset.portalThemeSwitcher = 'true';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', '\u041f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0430\u0442\u0435\u043b\u044c \u0442\u0435\u043c\u044b');

    var label = document.createElement('span');
    label.className = 'portal-theme-switcher__label';
    label.textContent = '\u0422\u0435\u043c\u0430';
    switcher.appendChild(label);

    themes.forEach(function (theme) {
      switcher.appendChild(createButton(theme));
    });

    document.body.appendChild(switcher);
    syncButtons();
  }

  function boot() {
    currentTheme = readTheme();
    applyTheme(currentTheme, false);
    mountSwitcher();

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
