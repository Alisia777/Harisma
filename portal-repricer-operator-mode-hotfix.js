(function () {
  'use strict';

  if (window.__ALTEA_REPRICER_OPERATOR_MODE_DISABLED_20260516A__) return;
  window.__ALTEA_REPRICER_OPERATOR_MODE_DISABLED_20260516A__ = true;

  [
    '__ALTEA_REPRICER_OPERATOR_MODE_20260515E__',
    '__ALTEA_REPRICER_OPERATOR_MODE_20260515D__',
    '__ALTEA_REPRICER_OPERATOR_MODE_20260515C__',
    '__ALTEA_REPRICER_OPERATOR_MODE_20260515B__',
    '__ALTEA_REPRICER_OPERATOR_MODE_20260515A__'
  ].forEach(function (flag) {
    window[flag] = true;
  });

  function root() {
    return document.getElementById('view-repricer');
  }

  function cleanupOldOperatorShell() {
    var host = root();
    if (!host) return;
    host.classList.remove('repricer-boot-simple');
    host.querySelectorAll('[data-repricer-operator-panel]').forEach(function (panel) {
      if (!panel.classList.contains('repricer-human-panel') && !panel.hasAttribute('data-repricer-native-panel')) {
        panel.remove();
      }
    });
    document.body.classList.remove('repricer-operator-active');
    document.querySelectorAll('.repricer-top-admin-hidden').forEach(function (node) {
      node.classList.remove('repricer-top-admin-hidden');
    });
  }

  window.__ALTEA_REPRICER_OPERATOR_APPLY__ = cleanupOldOperatorShell;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanupOldOperatorShell, { once: true });
  } else {
    cleanupOldOperatorShell();
  }
  window.addEventListener('altea:viewchange', cleanupOldOperatorShell, { passive: true });
  window.addEventListener('hashchange', cleanupOldOperatorShell, { passive: true });
})();
