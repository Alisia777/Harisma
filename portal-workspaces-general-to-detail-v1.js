(function () {
  'use strict';

  /*
   * Retired on 2026-06-23.
   *
   * The previous version mounted a common "general-to-detail" panel above many
   * routes and kept remounting it with delayed timers. That made the portal look
   * like two screens were alive at once and caused visible flicker on heavy tabs.
   *
   * Keep this file as a tiny cleanup shim because the HTML entries still load it
   * after auth. Route-specific owners now render their own screens.
   */
  if (window.__ALTEA_WORKSPACES_GTD_V1_RETIRED__) return;
  window.__ALTEA_WORKSPACES_GTD_V1_RETIRED__ = true;

  function cleanup() {
    document.querySelectorAll('[data-workspaces-gtd-v1], .workspace-gtd-v1').forEach((node) => {
      node.remove();
    });
    document.querySelectorAll('[data-workspaces-gtd-focused]').forEach((node) => {
      node.removeAttribute('data-workspaces-gtd-focused');
    });
  }

  function runSoon(delay) {
    window.setTimeout(cleanup, delay);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanup, { once: true });
  } else {
    cleanup();
  }

  [0, 250, 900, 2400].forEach(runSoon);
  ['hashchange', 'altea:viewchange', 'altea:app-ready'].forEach((eventName) => {
    window.addEventListener(eventName, cleanup);
  });
})();
