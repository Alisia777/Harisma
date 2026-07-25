(function () {
  'use strict';

  if (window.__ALTEA_SHELL_CUSTOMIZER_V2__) return;
  window.__ALTEA_SHELL_CUSTOMIZER_V2__ = true;

  var THEME_KEY = 'altea.portal.theme.v1';
  var OLD_THEME_KEY = 'altea.portal.theme';
  var SIDEBAR_KEY = 'altea.portal.sidebar.v1';
  var OLD_SIDEBAR_KEY = 'altea.sidebarCollapsed';
  var LAST_VISIBLE_KEY = 'altea.portal.sidebar.lastVisible';
  var BACKGROUND_KEY = 'altea.portal.background.v1';
  var BACKGROUND_POSTER = 'assets/altea-portal-all-themes/altea_portal_all_themes/motion/altea-theme-route-motion-poster.jpg';
  var BACKGROUND_WEBM = 'assets/altea-portal-all-themes/altea_portal_all_themes/motion/altea-theme-route-motion-source.webm';
  var BACKGROUND_MP4 = 'assets/altea-portal-all-themes/altea_portal_all_themes/motion/altea-theme-route-motion.mp4';
  var VALID_SIDEBARS = { expanded: true, compact: true, hidden: true };
  var VALID_BACKGROUNDS = { motion: true, static: true, theme: true, clean: true };
  var LEGACY_THEME_MAP = {
    dark: 'noir-pearl',
    light: 'porcelain-day',
    gray: 'graphite-frost',
    emerald: 'emerald-atelier',
    hellforge: 'garnet-velvet',
    terminal: 'emerald-atelier',
    redalert: 'red-alert-2'
  };
  var THEMES = [
    { id: 'noir-pearl', name: 'Noir Pearl', caption: 'Фирменный черный и шампань', group: 'portal', mode: 'dark', motif: 'none', badge: '', bg: '#070706', surface: '#12100d', line: '#302a22', accent: '#dbc7a3', accent3: '#f0dfbf', text: '#f4eee4' },
    { id: 'amethyst-night', name: 'Amethyst Night', caption: 'Глубокий сливовый и аметист', group: 'portal', mode: 'dark', motif: 'none', badge: '', bg: '#080611', surface: '#151020', line: '#362744', accent: '#ae82ff', accent3: '#d7c3ff', text: '#f7f1ff' },
    { id: 'sapphire-ink', name: 'Sapphire Ink', caption: 'Чернильный синий и сапфир', group: 'portal', mode: 'dark', motif: 'none', badge: '', bg: '#05090f', surface: '#0d1825', line: '#243a4e', accent: '#65a9ff', accent3: '#b6d9ff', text: '#eef7ff' },
    { id: 'emerald-atelier', name: 'Emerald Atelier', caption: 'Темный нефрит и зеленое стекло', group: 'portal', mode: 'dark', motif: 'none', badge: '', bg: '#050b09', surface: '#0d1915', line: '#244138', accent: '#68d0a0', accent3: '#bfead6', text: '#effbf6' },
    { id: 'garnet-velvet', name: 'Garnet Velvet', caption: 'Бархатный гранат и пудровый свет', group: 'portal', mode: 'dark', motif: 'none', badge: '', bg: '#0d0608', surface: '#1b0f13', line: '#4b2931', accent: '#e27788', accent3: '#ffc1cb', text: '#fff2f5' },
    { id: 'bronze-smoke', name: 'Bronze Smoke', caption: 'Дымчатая бронза и теплое золото', group: 'portal', mode: 'dark', motif: 'none', badge: '', bg: '#0b0805', surface: '#19120b', line: '#4a3823', accent: '#d69b56', accent3: '#f0c98f', text: '#fff5e8' },
    { id: 'graphite-frost', name: 'Graphite Frost', caption: 'Холодный графит и серебристый лед', group: 'portal', mode: 'dark', motif: 'none', badge: '', bg: '#08090b', surface: '#15181d', line: '#353b44', accent: '#94a8c7', accent3: '#d4deef', text: '#f3f6fb' },
    { id: 'porcelain-day', name: 'Porcelain Day', caption: 'Светлая слоновая кость и теплая бронза', group: 'portal', mode: 'light', motif: 'paper', badge: 'СВЕТЛАЯ', bg: '#f3efe7', surface: '#fffdf9', line: '#d6cab9', accent: '#9b7953', accent3: '#617c91', text: '#241f1a' },
    { id: 'red-alert-2', name: 'Red Alert 2 · Command', caption: 'Красная тревога, сталь и предупреждения', group: 'game', mode: 'dark', motif: 'industrial-alert', badge: 'COMMAND', bg: '#08090b', surface: '#15171a', line: '#3b3f45', accent: '#d72b39', accent3: '#f0c24b', text: '#f3f0e7' },
    { id: 'warcraft-2', name: 'Warcraft II · Tides', caption: 'Камень, королевский синий и золото', group: 'game', mode: 'dark', motif: 'stone-rune', badge: 'TIDES', bg: '#0d1317', surface: '#182126', line: '#4b5755', accent: '#3678c8', accent3: '#dfb64a', text: '#f1e5c5' }
  ];
  var BACKGROUNDS = [
    { id: 'motion', name: 'Движение', caption: 'Премиальный живой фон из motion-kit' },
    { id: 'static', name: 'Статика', caption: 'Тот же стиль без видео и лишней нагрузки' },
    { id: 'theme', name: 'По теме', caption: 'Фон меняется только палитрой выбранной темы' },
    { id: 'clean', name: 'Чистый', caption: 'Минимум подсветок для тяжелых таблиц' }
  ];
  var root = document.documentElement;
  var themeFrame = 0;
  var themeFrameTwo = 0;
  var themeTransitionTimer = 0;
  var chromeTransitionTimer = 0;

  function qs(selector, parent) {
    return (parent || document).querySelector(selector);
  }

  function qsa(selector, parent) {
    return Array.prototype.slice.call((parent || document).querySelectorAll(selector));
  }

  function refreshPremiumShell() {
    var shell = qs('#altea-premium-app');
    if (!shell && window.AlteaPremiumPresentation && typeof window.AlteaPremiumPresentation.renderActive === 'function') {
      try {
        window.AlteaPremiumPresentation.renderActive();
      } catch (error) {}
      shell = qs('#altea-premium-app');
    }
    return shell;
  }

  function premiumTopbar() {
    var shell = refreshPremiumShell();
    return shell ? qs('.altea-premium-shell-topbar', shell) : null;
  }

  function premiumSidebar() {
    var shell = refreshPremiumShell();
    return shell ? qs('.altea-premium-shell-sidebar', shell) : null;
  }

  function read(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {}
  }

  function themeById(id) {
    return THEMES.find(function (theme) { return theme.id === id; }) || null;
  }

  function normalizeTheme(id) {
    if (themeById(id)) return id;
    if (LEGACY_THEME_MAP[id]) return LEGACY_THEME_MAP[id];
    return 'noir-pearl';
  }

  function normalizeSidebar(value) {
    return VALID_SIDEBARS[value] ? value : '';
  }

  function normalizeBackground(value) {
    return VALID_BACKGROUNDS[value] ? value : 'motion';
  }

  function initialTheme() {
    return normalizeTheme(read(THEME_KEY, '') || read(OLD_THEME_KEY, '') || root.dataset.theme || 'noir-pearl');
  }

  function initialSidebar() {
    var stored = normalizeSidebar(read(SIDEBAR_KEY, ''));
    if (stored) return stored;
    if (read(OLD_SIDEBAR_KEY, '0') === '1') return 'hidden';
    return window.innerWidth < 780 ? 'hidden' : 'expanded';
  }

  function initialBackground() {
    return normalizeBackground(read(BACKGROUND_KEY, '') || root.dataset.portalBackground || 'motion');
  }

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function legacyTheme(id) {
    if (id === 'porcelain-day') return 'light';
    if (id === 'emerald-atelier') return 'emerald';
    if (id === 'graphite-frost') return 'gray';
    if (id === 'red-alert-2') return 'redalert';
    if (id === 'garnet-velvet') return 'hellforge';
    return 'dark';
  }

  function setThemeChrome(id, persist) {
    var theme = themeById(id) || THEMES[0];
    var legacy = legacyTheme(theme.id);
    root.dataset.theme = theme.id;
    root.dataset.themeMode = theme.mode || 'dark';
    root.dataset.themeMotif = theme.motif || 'none';
    root.dataset.portalTheme = legacy;
    if (document.body) {
      document.body.dataset.theme = theme.id;
      document.body.dataset.portalTheme = legacy;
      document.body.dataset.portalThemeLegacy = legacy;
      document.body.dataset.shellTheme = theme.id;
      document.body.classList.add('altea-premium-shell');
    }
    var meta = qs('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme.bg;
    qsa('[data-shell-theme-id]').forEach(function (node) {
      var active = node.dataset.shellThemeId === theme.id;
      node.classList.toggle('active', active);
      node.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    qsa('[data-current-shell-theme]').forEach(function (node) {
      node.textContent = theme.name;
    });
    if (persist) {
      write(THEME_KEY, theme.id);
      write(OLD_THEME_KEY, legacy);
    }
    try {
      window.dispatchEvent(new CustomEvent('altea:themechange', { detail: { theme: theme.id, legacyTheme: legacy } }));
    } catch (error) {}
  }

  function backgroundById(id) {
    var normalized = normalizeBackground(id);
    return BACKGROUNDS.find(function (background) { return background.id === normalized; }) || BACKGROUNDS[0];
  }

  function setBackgroundControls(id) {
    var background = backgroundById(id);
    qsa('[data-shell-background-id]').forEach(function (node) {
      var active = node.dataset.shellBackgroundId === background.id;
      node.classList.toggle('active', active);
      node.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    qsa('[data-current-shell-background]').forEach(function (node) {
      node.textContent = background.name;
    });
  }

  function ensureBackgroundStage() {
    if (!document.body) return null;
    var stage = qs('[data-shell-background-stage]');
    if (stage) return stage;
    stage = document.createElement('div');
    stage.className = 'shell-background-stage';
    stage.setAttribute('data-shell-background-stage', '');
    stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML = [
      '<video class="shell-background-video" data-shell-background-video muted loop playsinline preload="metadata" poster="', BACKGROUND_POSTER, '">',
        '<source src="', BACKGROUND_WEBM, '" type="video/webm">',
        '<source src="', BACKGROUND_MP4, '" type="video/mp4">',
      '</video>'
    ].join('');
    document.body.insertBefore(stage, document.body.firstChild || null);
    return stage;
  }

  function syncBackgroundVideos(id) {
    var motion = normalizeBackground(id) === 'motion' && !reducedMotion();
    qsa('[data-shell-background-video], [data-premium-ambient-video]').forEach(function (video) {
      try {
        if (!motion) {
          if (video.pause) video.pause();
          return;
        }
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        var play = video.play && video.play();
        if (play && typeof play.catch === 'function') play.catch(function () {});
      } catch (error) {}
    });
  }

  function applyBackground(id, options) {
    var next = normalizeBackground(id);
    root.dataset.portalBackground = next;
    if (document.body) {
      document.body.dataset.portalBackground = next;
      ensureBackgroundStage();
    }
    setBackgroundControls(next);
    syncBackgroundVideos(next);
    if (!options || options.persist !== false) write(BACKGROUND_KEY, next);
    try {
      window.dispatchEvent(new CustomEvent('altea:backgroundchange', { detail: { background: next } }));
    } catch (error) {}
  }

  function flashTheme() {
    if (!document.body || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    if (themeFrame) window.cancelAnimationFrame(themeFrame);
    if (themeFrameTwo) window.cancelAnimationFrame(themeFrameTwo);
    if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
    document.body.classList.remove('shell-theme-switching');
    themeFrame = window.requestAnimationFrame(function () {
      themeFrameTwo = window.requestAnimationFrame(function () {
        if (!document.body) return;
        document.body.classList.add('shell-theme-switching');
        themeTransitionTimer = window.setTimeout(function () {
          if (document.body) document.body.classList.remove('shell-theme-switching');
          themeTransitionTimer = 0;
        }, 720);
      });
    });
  }

  function flashChromeTransition() {
    if (!document.body || reducedMotion()) return;
    if (chromeTransitionTimer) window.clearTimeout(chromeTransitionTimer);
    document.body.classList.add('shell-chrome-transitioning');
    chromeTransitionTimer = window.setTimeout(function () {
      if (document.body) document.body.classList.remove('shell-chrome-transitioning');
      chromeTransitionTimer = 0;
    }, 430);
  }

  function applyTheme(id, options) {
    var next = normalizeTheme(id);
    setThemeChrome(next, !options || options.persist !== false);
    if (!options || options.animate !== false) flashTheme();
  }

  function setSidebarControls(state) {
    var hidden = state === 'hidden';
    var premium = mountPremiumSidebarToggle();
    var activeSidebar = premiumSidebar() || qs('.sidebar');
    var activeTopbar = premiumTopbar();
    if (activeSidebar && !activeSidebar.id) activeSidebar.id = premium ? 'portalPremiumSidebar' : 'portalSidebar';
    if (activeTopbar && !activeTopbar.id) activeTopbar.id = 'portalPremiumTopbar';
    qsa('[data-sidebar-toggle]').forEach(function (toggle) {
      if (premium && toggle !== premium && toggle.id === 'sidebarToggle') toggle.removeAttribute('id');
      if (premium && toggle === premium) toggle.id = 'sidebarToggle';
      if (!premium && !qs('#sidebarToggle')) toggle.id = 'sidebarToggle';
      toggle.dataset.tooltip = hidden ? 'Показать панели · Alt+M' : 'Скрыть панели · Alt+M';
      toggle.setAttribute(
        'aria-controls',
        [
          activeSidebar ? activeSidebar.id : 'portalSidebar',
          activeTopbar ? activeTopbar.id : ''
        ].filter(Boolean).join(' ')
      );
      toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      toggle.setAttribute('aria-label', hidden ? 'Показать панели' : 'Скрыть панели');
      toggle.title = hidden ? 'Показать панели' : 'Скрыть панели';
    });
    var activeCompact = qs('[data-shell-compact-switch]');
    if (activeCompact) {
      activeCompact.classList.toggle('on', state === 'compact');
      activeCompact.setAttribute('aria-pressed', state === 'compact' ? 'true' : 'false');
    }
    return;
    var toggle = qs('[data-sidebar-toggle]');
    var sidebar = qs('.sidebar');
    if (toggle) {
      toggle.id = toggle.id || 'sidebarToggle';
      toggle.dataset.tooltip = hidden ? 'Показать меню · Alt+M' : 'Скрыть меню · Alt+M';
      toggle.setAttribute('aria-controls', sidebar ? (sidebar.id || 'portalSidebar') : 'portalSidebar');
      toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      toggle.setAttribute('aria-label', hidden ? 'Показать меню' : 'Скрыть меню');
      toggle.title = hidden ? 'Показать меню' : 'Скрыть меню';
    }
    if (sidebar && !sidebar.id) sidebar.id = 'portalSidebar';
    var compact = qs('[data-shell-compact-switch]');
    if (compact) {
      compact.classList.toggle('on', state === 'compact');
      compact.setAttribute('aria-pressed', state === 'compact' ? 'true' : 'false');
    }
  }

  function applySidebar(value, options) {
    var state = normalizeSidebar(value) || 'expanded';
    var shell = qs('.app-shell');
    var premium = refreshPremiumShell();
    if (!options || options.animate !== false) flashChromeTransition();
    root.dataset.sidebar = state;
    root.dataset.chrome = state === 'hidden' ? 'hidden' : 'visible';
    if (document.body) document.body.dataset.chrome = root.dataset.chrome;
    if (shell) shell.classList.toggle('sidebar-collapsed', state === 'hidden');
    if (premium) {
      premium.dataset.sidebar = state;
      premium.dataset.chrome = root.dataset.chrome;
      premium.classList.toggle('is-sidebar-hidden', state === 'hidden');
      premium.classList.toggle('is-chrome-hidden', state === 'hidden');
      premium.classList.toggle('is-sidebar-compact', state === 'compact');
      premium.style.removeProperty('--premium-sidebar');
    }
    setSidebarControls(state);
    if (!options || options.persist !== false) {
      write(SIDEBAR_KEY, state);
      write(OLD_SIDEBAR_KEY, state === 'hidden' ? '1' : '0');
      if (state !== 'hidden') write(LAST_VISIBLE_KEY, state);
    }
    try {
      window.dispatchEvent(new CustomEvent('altea:chromechange', {
        detail: { sidebar: state, chrome: root.dataset.chrome }
      }));
    } catch (error) {}
  }

  function toggleSidebarHidden() {
    var current = normalizeSidebar(root.dataset.sidebar) || 'expanded';
    if (current === 'hidden') {
      applySidebar(normalizeSidebar(read(LAST_VISIBLE_KEY, 'expanded')) || 'expanded');
    } else {
      write(LAST_VISIBLE_KEY, current);
      applySidebar('hidden');
    }
  }

  function toggleCompact() {
    var current = normalizeSidebar(root.dataset.sidebar) || 'expanded';
    applySidebar(current === 'compact' ? 'expanded' : 'compact');
  }

  function openAppearance(open) {
    var back = qs('#appearanceBack');
    var button = qs('#appearanceButton');
    if (!back) return;
    back.classList.toggle('open', Boolean(open));
    back.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var active = qs('.shell-theme-card.active', back) || qs('.shell-theme-card', back);
      if (active) active.focus();
    }
  }

  function createThemeCard(theme) {
    return [
      '<button type="button" class="shell-theme-card" data-shell-theme-id="', theme.id, '" data-motif="', theme.motif || 'none', '" aria-pressed="false" style="--tb:', theme.bg, ';--ts:', theme.surface, ';--tl:', theme.line, ';--ta:', theme.accent, ';--ta3:', theme.accent3, ';--tt:', theme.text, '">',
        '<div class="shell-theme-preview" aria-hidden="true">',
          '<i class="shell-theme-badge">', theme.badge || '', '</i>',
          '<div class="shell-theme-mini-top"></div>',
          '<div class="shell-theme-mini-layout"><div class="shell-theme-mini-side"></div><div class="shell-theme-mini-body"><div class="shell-theme-mini-kpis"><i></i><i></i><i></i></div><div class="shell-theme-mini-chart"></div></div></div>',
        '</div>',
        '<div class="shell-theme-copy"><i class="shell-theme-swatch" aria-hidden="true"></i><span><b>', theme.name, '</b><span>', theme.caption, '</span></span></div>',
        '<i class="shell-check" aria-hidden="true">✓</i>',
      '</button>'
    ].join('');
  }

  function createThemeSection(group, title, caption) {
    var cards = THEMES.filter(function (theme) { return theme.group === group; }).map(createThemeCard).join('');
    return [
      '<section class="shell-theme-section">',
        '<div class="shell-theme-section-head"><h3>', title, '</h3><span>', caption, '</span></div>',
        '<div class="shell-theme-section-grid">', cards, '</div>',
      '</section>'
    ].join('');
  }

  function createBackgroundCard(background) {
    return [
      '<button type="button" class="shell-background-card" data-shell-background-id="', background.id, '" aria-pressed="false">',
        '<i aria-hidden="true"></i>',
        '<span><b>', background.name, '</b><em>', background.caption, '</em></span>',
      '</button>'
    ].join('');
  }

  function createBackgroundSection() {
    return [
      '<section class="shell-background-section">',
        '<div class="shell-theme-section-head"><h3>Фон портала</h3><span data-current-shell-background>Движение</span></div>',
        '<div class="shell-background-grid">', BACKGROUNDS.map(createBackgroundCard).join(''), '</div>',
      '</section>'
    ].join('');
  }

  function drawerMarkup() {
    return [
      '<div id="appearanceBack" class="shell-appearance-back" aria-hidden="true">',
        '<aside class="shell-appearance-drawer" role="dialog" aria-modal="true" aria-labelledby="appearanceTitle">',
          '<div class="shell-drawer-head">',
            '<div><h2 id="appearanceTitle">Внешний вид</h2><p>Цветовая тема, компактное меню и быстрый возврат к фирменному виду.</p></div>',
            '<button type="button" class="shell-close" id="closeAppearance" aria-label="Закрыть">×</button>',
          '</div>',
          '<div class="shell-theme-grid">',
            createThemeSection('portal', 'Темы портала', '8 вариантов'),
            createThemeSection('game', 'Игровые темы', '2 UI-настроения'),
            createBackgroundSection(),
          '</div>',
          '<div class="shell-appearance-options">',
            '<div class="shell-option-row"><span><b>Компактное меню</b><span>Оставляет иконки и освобождает рабочее поле.</span></span><button type="button" class="shell-switch" data-shell-compact-switch aria-pressed="false" aria-label="Компактное меню"><i></i></button></div>',
            '<button type="button" class="shell-reset-theme" id="resetAppearance">Вернуть Noir Pearl и полное меню</button>',
            '<p class="shell-theme-legal-note">Игровые темы используют только оригинальные палитры и мотивы интерфейса. Логотипы, арты и чужие ассеты не подключаются.</p>',
          '</div>',
        '</aside>',
      '</div>',
      '<div class="shell-theme-flash" aria-hidden="true"></div>'
    ].join('');
  }

  function mountAppearanceButton() {
    var actions = premiumTopbar() || qs('.top-actions') || qs('.top-actions-wrap') || qs('.topbar');
    if (!actions) return;
    var current = qs('#appearanceButton');
    if (!current) {
      current = document.createElement('button');
      current.type = 'button';
      current.id = 'appearanceButton';
      current.className = 'shell-appearance-button';
      current.setAttribute('aria-haspopup', 'dialog');
      current.setAttribute('aria-expanded', 'false');
      current.innerHTML = '<span class="shell-appearance-dot" aria-hidden="true"></span><span data-current-shell-theme>Appearance</span>';
    }
    var before = qs('[data-altea-marketplace-selector]', actions) || qs('[data-premium-proxy="syncStatusBadge"]', actions) || actions.firstChild;
    if (current.parentNode !== actions || current.nextSibling !== before) actions.insertBefore(current, before);
    return;
    if (qs('#appearanceButton')) return;
    var actions = qs('.top-actions') || qs('.top-actions-wrap') || qs('.topbar');
    if (!actions) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'appearanceButton';
    button.className = 'shell-appearance-button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span class="shell-appearance-dot" aria-hidden="true"></span><span data-current-shell-theme>Внешний вид</span>';
    actions.insertBefore(button, actions.firstChild);
  }

  function mountDrawer() {
    if (qs('#appearanceBack')) return;
    var host = document.createElement('div');
    host.innerHTML = drawerMarkup();
    while (host.firstChild) document.body.appendChild(host.firstChild);
  }

  function mountPremiumSidebarToggle() {
    var shell = refreshPremiumShell();
    if (!shell) return null;
    var toggle = qs('.shell-premium-sidebar-toggle', shell);
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'shell-premium-sidebar-toggle';
      toggle.setAttribute('data-sidebar-toggle', 'premium');
      toggle.innerHTML = '<span class="sidebar-toggle-mark" aria-hidden="true"></span>';
      shell.appendChild(toggle);
    }
    return toggle;
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var sidebarToggle = event.target.closest && event.target.closest('[data-sidebar-toggle]');
      if (sidebarToggle) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleSidebarHidden();
        return;
      }
      var themeButton = event.target.closest && event.target.closest('[data-shell-theme-id]');
      if (themeButton) {
        applyTheme(themeButton.dataset.shellThemeId);
        return;
      }
      var backgroundButton = event.target.closest && event.target.closest('[data-shell-background-id]');
      if (backgroundButton) {
        applyBackground(backgroundButton.dataset.shellBackgroundId);
        return;
      }
      if (event.target.closest && event.target.closest('#appearanceButton')) {
        mountAppearanceButton();
        openAppearance(true);
        return;
      }
      if (event.target.closest && event.target.closest('#closeAppearance')) {
        openAppearance(false);
        return;
      }
      if (event.target.closest && event.target.closest('[data-shell-compact-switch]')) {
        toggleCompact();
        return;
      }
      if (event.target.closest && event.target.closest('#resetAppearance')) {
        applyTheme('noir-pearl');
        applyBackground('motion');
        applySidebar('expanded');
        return;
      }
      if (event.target === qs('#appearanceBack')) openAppearance(false);
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.altKey && String(event.key || '').toLowerCase() === 'm') {
        event.preventDefault();
        toggleSidebarHidden();
      }
      if (event.key === 'Escape') openAppearance(false);
    });

    window.addEventListener('storage', function (event) {
      if (event.key === THEME_KEY && event.newValue) applyTheme(event.newValue, { persist: false, animate: false });
      if (event.key === SIDEBAR_KEY && event.newValue) applySidebar(event.newValue, { persist: false });
      if (event.key === BACKGROUND_KEY && event.newValue) applyBackground(event.newValue, { persist: false });
    });
    window.addEventListener('altea:themechange', function () {
      applyBackground(root.dataset.portalBackground || initialBackground(), { persist: false });
    });
    window.addEventListener('altea:backgroundchange', function (event) {
      syncBackgroundVideos(event && event.detail ? event.detail.background : root.dataset.portalBackground);
    });
  }

  function boot() {
    if (!document.body) return;
    document.body.classList.add('altea-shell-customizer-v2');
    refreshPremiumShell();
    mountAppearanceButton();
    mountDrawer();
    applyTheme(initialTheme(), { persist: false, animate: false });
    applyBackground(initialBackground(), { persist: false });
    applySidebar(initialSidebar(), { persist: false, animate: false });
    bindEvents();
  }

  root.dataset.theme = normalizeTheme(root.dataset.theme || initialTheme());
  root.dataset.sidebar = normalizeSidebar(root.dataset.sidebar) || initialSidebar();
  root.dataset.portalBackground = normalizeBackground(root.dataset.portalBackground || initialBackground());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
