(function () {
  'use strict';

  if (window.__ALTEA_STORAGE_NAV_PIN_20260629_STORAGE4__) return;
  window.__ALTEA_STORAGE_NAV_PIN_20260629_STORAGE4__ = true;

  var VIEW = 'documents';
  var TITLE = '\u0425\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435';
  var SUBTITLE = '\u0444\u0430\u0439\u043b\u044b \u00b7 \u0441\u0441\u044b\u043b\u043a\u0438 \u00b7 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u044f';
  var queued = false;
  var observerStarted = false;

  function includes(list, value) {
    return Array.isArray(list) && list.indexOf(value) !== -1;
  }

  function appendUnique(list, value) {
    if (!Array.isArray(list) || includes(list, value)) return list;
    list.push(value);
    return list;
  }

  function ensureRulesAllowStorage() {
    var rules = window.ALTEA_PORTAL_ACCESS_RULES;
    if (!rules || typeof rules !== 'object') return;
    appendUnique(rules.allViews, VIEW);
    appendUnique(rules.defaultViews, VIEW);
    Object.keys(rules.roles || {}).forEach(function (key) {
      var role = rules.roles[key];
      if (!role || role.views === '*') return;
      if (Array.isArray(role)) appendUnique(role, VIEW);
      else appendUnique(role.views, VIEW);
    });
  }

  function ensureAccessAllowsStorage() {
    ensureRulesAllowStorage();
    var access = window.__ALTEA_PORTAL_ACCESS__;
    if (access && Array.isArray(access.allowedViews)) appendUnique(access.allowedViews, VIEW);
  }

  function iconMarkup() {
    return [
      '<span class="nav-icon" aria-hidden="true">',
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path d="M7 3h7l5 5v13H7z"></path>',
      '<path d="M14 3v5h5"></path>',
      '<path d="M10 13h6"></path>',
      '<path d="M10 17h6"></path>',
      '</svg>',
      '</span>'
    ].join('');
  }

  function buttonMarkup() {
    return [
      iconMarkup(),
      '<span class="nav-copy">',
      '<span class="nav-title">' + TITLE + '</span>',
      '<small class="nav-subtitle">' + SUBTITLE + '</small>',
      '</span>'
    ].join('');
  }

  function navRoot() {
    return document.querySelector('.sidebar .nav') || document.querySelector('.nav');
  }

  function revealButton(button) {
    if (!button) return;
    button.hidden = false;
    button.classList.remove('portal-access-hidden');
    button.classList.remove('nav-btn-legacy-hidden');
    button.removeAttribute('hidden');
    button.removeAttribute('aria-hidden');
    button.removeAttribute('tabindex');
    button.setAttribute('data-access-original-hidden', '0');
    button.setAttribute('aria-label', TITLE);
    button.title = TITLE + ' - ' + SUBTITLE;
  }

  function ensureButton() {
    var nav = navRoot();
    if (!nav) return false;

    var button = nav.querySelector('.nav-btn[data-view="' + VIEW + '"]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'nav-btn';
      button.type = 'button';
      button.dataset.view = VIEW;
      button.innerHTML = buttonMarkup();
    } else if (!button.querySelector('.nav-title')) {
      button.innerHTML = buttonMarkup();
    }

    revealButton(button);

    var control = nav.querySelector('.nav-btn[data-view="control"]');
    var dataHealth = nav.querySelector('.nav-btn[data-view="data-health"]');
    if (control && control.nextSibling !== button) {
      nav.insertBefore(button, control.nextSibling);
    } else if (!control && dataHealth && dataHealth.previousSibling !== button) {
      nav.insertBefore(button, dataHealth);
    } else if (!button.parentNode) {
      nav.appendChild(button);
    }

    return true;
  }

  function ensureSection() {
    var main = document.querySelector('.main');
    if (!main || document.getElementById('view-documents')) return;
    var section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-documents';
    var control = document.getElementById('view-control');
    main.insertBefore(section, control ? control.nextSibling : (main.querySelector('.view') || null));
  }

  function applyAccess() {
    if (window.alteaPortalAccess && typeof window.alteaPortalAccess.apply === 'function') {
      try {
        window.alteaPortalAccess.apply();
      } catch (error) {
        console.warn('[storage-nav-pin] access apply', error);
      }
    }
  }

  function run() {
    ensureAccessAllowsStorage();
    ensureSection();
    ensureButton();
    applyAccess();
    ensureButton();
  }

  function scheduleRun(delay) {
    if (queued) return;
    queued = true;
    window.setTimeout(function () {
      queued = false;
      run();
    }, delay || 0);
  }

  function startObserver() {
    if (observerStarted || typeof MutationObserver !== 'function') return;
    observerStarted = true;
    var target = document.querySelector('.sidebar') || document.body || document.documentElement;
    if (!target) return;
    new MutationObserver(function () {
      scheduleRun(20);
    }).observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden', 'style'] });
  }

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('.nav-btn[data-view="' + VIEW + '"]') : null;
    if (!target) return;
    ensureAccessAllowsStorage();
    revealButton(target);
    if (typeof window.setView === 'function') {
      event.preventDefault();
      event.stopPropagation();
      window.setView(VIEW);
    }
  }, true);

  ['DOMContentLoaded', 'load', 'altea:accesschange', 'altea:viewchange', 'altea:app-ready', 'altea:data-ready', 'hashchange'].forEach(function (eventName) {
    window.addEventListener(eventName, function () {
      scheduleRun(0);
    });
  });

  [0, 80, 240, 600, 1200, 2400, 5000, 10000, 20000].forEach(function (delay) {
    window.setTimeout(run, delay);
  });

  startObserver();
  run();

  window.__ALTEA_STORAGE_NAV_PIN__ = {
    ensure: run,
    version: '20260629-storage4'
  };
})();
