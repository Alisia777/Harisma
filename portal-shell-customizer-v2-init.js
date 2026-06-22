(function () {
  'use strict';
  var themeKey = 'altea.portal.theme.v1';
  var oldThemeKey = 'altea.portal.theme';
  var sidebarKey = 'altea.portal.sidebar.v1';
  var oldSidebarKey = 'altea.sidebarCollapsed';
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
  var selectedTheme = theme(read(themeKey) || read(oldThemeKey) || document.documentElement.dataset.theme);
  document.documentElement.dataset.theme = selectedTheme;
  document.documentElement.dataset.themeMode = themes[selectedTheme] || 'dark';
  document.documentElement.dataset.sidebar = sidebar(read(sidebarKey));
})();
