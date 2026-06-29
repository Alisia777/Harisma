(function () {
  'use strict';

  if (window.__ALTEA_STORAGE_FINAL_GUARD_20260629__) return;
  window.__ALTEA_STORAGE_FINAL_GUARD_20260629__ = true;

  var VIEW = 'documents';
  var TITLE = '\u0425\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435';
  var SUBTITLE = '\u0444\u0430\u0439\u043b\u044b \u00b7 \u0441\u0441\u044b\u043b\u043a\u0438 \u00b7 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u044f';
  var queued = false;

  function addUnique(list, value) {
    if (!Array.isArray(list) || list.indexOf(value) !== -1) return;
    list.push(value);
  }

  function allowStorageView() {
    var rules = window.ALTEA_PORTAL_ACCESS_RULES;
    if (rules && typeof rules === 'object') {
      addUnique(rules.allViews, VIEW);
      addUnique(rules.defaultViews, VIEW);
      Object.keys(rules.roles || {}).forEach(function (key) {
        var role = rules.roles[key];
        if (!role || role.views === '*') return;
        if (Array.isArray(role)) addUnique(role, VIEW);
        else addUnique(role.views, VIEW);
      });
    }

    var access = window.__ALTEA_PORTAL_ACCESS__;
    if (access && Array.isArray(access.allowedViews) && access.allowedViews.length) addUnique(access.allowedViews, VIEW);
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

  function navMarkup() {
    return [
      iconMarkup(),
      '<span class="nav-copy">',
      '<span class="nav-title">' + TITLE + '</span>',
      '<small class="nav-subtitle">' + SUBTITLE + '</small>',
      '</span>'
    ].join('');
  }

  function revealButton(button) {
    if (!button) return;
    button.type = 'button';
    button.dataset.view = VIEW;
    button.dataset.navGroup = 'daily';
    button.hidden = false;
    button.classList.remove('portal-access-hidden', 'nav-btn-legacy-hidden', 'hidden');
    button.removeAttribute('hidden');
    button.removeAttribute('aria-hidden');
    button.removeAttribute('tabindex');
    button.setAttribute('data-access-original-hidden', '0');
    button.setAttribute('aria-label', TITLE);
    button.title = TITLE + ' - ' + SUBTITLE;
    button.style.setProperty('display', 'grid', 'important');
    button.style.setProperty('visibility', 'visible', 'important');

    if (!button.querySelector('.nav-title') || !button.querySelector('.nav-subtitle')) button.innerHTML = navMarkup();
    var title = button.querySelector('.nav-title');
    var subtitle = button.querySelector('.nav-subtitle');
    if (title) title.textContent = TITLE;
    if (subtitle) subtitle.textContent = SUBTITLE;
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

  function ensureButton() {
    var nav = document.querySelector('.sidebar .nav') || document.querySelector('.nav');
    if (!nav) return false;

    var button = nav.querySelector('.nav-btn[data-view="' + VIEW + '"]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'nav-btn';
      button.type = 'button';
      button.dataset.view = VIEW;
      button.innerHTML = navMarkup();
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

    if (button.dataset.storageFinalGuardBound !== '1') {
      button.dataset.storageFinalGuardBound = '1';
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        allowStorageView();
        revealButton(button);
        if (typeof window.setView === 'function') window.setView(VIEW);
        else window.location.hash = '#' + VIEW;
      }, true);
    }

    return true;
  }

  function run() {
    allowStorageView();
    ensureSection();
    if (window.alteaPortalAccess && typeof window.alteaPortalAccess.apply === 'function') {
      try {
        window.alteaPortalAccess.apply();
      } catch (error) {
        console.warn('[storage-final-guard] access apply', error);
      }
    }
    ensureButton();
  }

  function scheduleRun() {
    if (queued) return;
    queued = true;
    window.setTimeout(function () {
      queued = false;
      run();
    }, 30);
  }

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('.nav-btn[data-view="' + VIEW + '"]') : null;
    if (!button) return;
    allowStorageView();
    revealButton(button);
  }, true);

  ['DOMContentLoaded', 'load', 'altea:accesschange', 'altea:app-ready', 'altea:data-ready', 'altea:viewchange', 'hashchange'].forEach(function (eventName) {
    window.addEventListener(eventName, scheduleRun);
  });

  if (typeof MutationObserver === 'function') {
    var observerTarget = document.querySelector('.sidebar') || document.body || document.documentElement;
    if (observerTarget) {
      new MutationObserver(scheduleRun).observe(observerTarget, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'class', 'aria-hidden', 'style']
      });
    }
  }

  [0, 80, 240, 600, 1200, 2500, 5000, 10000, 20000, 30000].forEach(function (delay) {
    window.setTimeout(run, delay);
  });
  run();
})();
