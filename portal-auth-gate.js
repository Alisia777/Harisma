(function () {
  'use strict';

  if (window.__ALTEA_PORTAL_AUTH_GATE__) return;
  window.__ALTEA_PORTAL_AUTH_GATE__ = true;

  var STORAGE_KEY = 'altea-portal-auth-v1';
  var THROTTLE_KEY = 'altea-portal-auth-throttle-v2';
  var DELAYED_SCRIPT_ATTR = 'data-auth-src';
  var DELAYED_SCRIPT_TYPE = 'application/x-altea-auth-delayed';
  var LOGIN_MIN_RESPONSE_MS = 700;
  var LOGIN_JITTER_MS = 450;
  var MAX_EMAIL_LENGTH = 254;
  var MAX_PASSWORD_LENGTH = 1024;
  var DEFAULT_STATUS = '\u041f\u043e\u0440\u0442\u0430\u043b \u0437\u0430\u043a\u0440\u044b\u0442: \u0432\u043e\u0439\u0434\u0438\u0442\u0435 \u043f\u043e email \u0438 \u043f\u0430\u0440\u043e\u043b\u044e.';
  var GENERIC_LOGIN_ERROR = '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0439\u0442\u0438. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 email \u0438 \u043f\u0430\u0440\u043e\u043b\u044c \u0438\u043b\u0438 \u043e\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044c \u043a \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0443.';
  var ACCESS_DENIED_ERROR = '\u0414\u043b\u044f \u044d\u0442\u043e\u0439 \u0443\u0447\u0435\u0442\u043d\u043e\u0439 \u0437\u0430\u043f\u0438\u0441\u0438 \u043d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d \u0434\u043e\u0441\u0442\u0443\u043f \u043a \u043f\u043e\u0440\u0442\u0430\u043b\u0443.';
  var DEFAULT_ALL_VIEWS = [
    'dashboard',
    'data-health',
    'control',
    'executive',
    'sku-plan-fact',
    'repricer',
    'prices',
    'order',
    'oos-control',
    'sku-contour',
    'skus',
    'launches',
    'launch-control',
    'iu-drr',
    'wb-rating',
    'product-leaderboard',
    'meetings',
    'documents'
  ];
  var FALLBACK_CONFIG = {
    brand: '\u0410\u043b\u0442\u0435\u044f',
    teamMode: 'supabase',
    teamMember: { name: '', role: '\u041a\u043e\u043c\u0430\u043d\u0434\u0430' },
    supabase: {
      url: 'https://iyckwryrucqrxwlowxow.supabase.co',
      anonKey: 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw',
      auth: 'email_password'
    }
  };

  var client = null;
  var currentSession = null;
  var authPromise = null;
  var pendingResolve = null;
  var authListenerReady = false;
  var delayedScriptsPromise = null;
  var throttleTimer = null;
  var memoryStore = {};
  var currentAccess = null;
  var accessObserverStarted = false;

  function assign(target) {
    var output = target || {};
    for (var index = 1; index < arguments.length; index += 1) {
      var source = arguments[index] || {};
      var key;
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) output[key] = source[key];
      }
    }
    return output;
  }

  function now() {
    return Date.now ? Date.now() : new Date().getTime();
  }

  function safeStorage() {
    try {
      var store = window.localStorage;
      var probe = '__altea_auth_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return store;
    } catch (_) {
      return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null; },
        setItem: function (key, value) { memoryStore[key] = String(value); },
        removeItem: function (key) { delete memoryStore[key]; }
      };
    }
  }

  function readJson(key, fallback) {
    try {
      var raw = safeStorage().getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      safeStorage().setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function removeStored(key) {
    try {
      safeStorage().removeItem(key);
    } catch (_) {}
  }

  function appConfig() {
    try {
      if (typeof currentConfig === 'function') return currentConfig();
    } catch (_) {}
    return window.APP_CONFIG || {};
  }

  function isAuthRequired() {
    return !window.APP_CONFIG || window.APP_CONFIG.portalAuthRequired !== false;
  }

  function authConfig() {
    var raw = appConfig() || {};
    var rawSupabase = raw.supabase || {};
    var supabase = assign({}, FALLBACK_CONFIG.supabase, rawSupabase, { auth: 'email_password' });
    if (!supabase.url || !supabase.anonKey) supabase = assign({}, FALLBACK_CONFIG.supabase);

    var cfg = assign({}, FALLBACK_CONFIG, raw, {
      teamMode: 'supabase',
      teamMember: assign({}, FALLBACK_CONFIG.teamMember, raw.teamMember || {}),
      supabase: supabase
    });
    window.__ALTEA_AUTH_REMOTE_CONFIG__ = cfg;
    return cfg;
  }

  function normalizeEmail(value) {
    return String(value || '').replace(/^\s+|\s+$/g, '').toLowerCase();
  }

  function normalizeView(value) {
    return String(value || '').replace(/^#/, '').replace(/^\s+|\s+$/g, '');
  }

  function accessRules() {
    var rules = window.ALTEA_PORTAL_ACCESS_RULES || {};
    if (!rules.allViews || !rules.allViews.length) rules.allViews = DEFAULT_ALL_VIEWS;
    return rules;
  }

  function contains(list, value) {
    var index;
    for (index = 0; index < list.length; index += 1) {
      if (list[index] === value) return true;
    }
    return false;
  }

  function uniqueViews(list) {
    var rules = accessRules();
    var allViews = normalizeViews(rules.allViews || DEFAULT_ALL_VIEWS, false);
    var output = [];
    var index;
    var view;
    for (index = 0; index < list.length; index += 1) {
      view = normalizeView(list[index]);
      if (!view || contains(output, view)) continue;
      if (allViews.length && !contains(allViews, view)) continue;
      output.push(view);
    }
    return output;
  }

  function uniqueStrings(list) {
    var output = [];
    var index;
    var value;
    for (index = 0; index < list.length; index += 1) {
      value = String(list[index] || '').replace(/^\s+|\s+$/g, '').toLowerCase();
      if (value && !contains(output, value)) output.push(value);
    }
    return output;
  }

  function normalizeViews(value, expandStar) {
    var output = [];
    var index;
    if (value === '*') return expandStar === false ? ['*'] : uniqueViews(accessRules().allViews || DEFAULT_ALL_VIEWS);
    if (!value) return output;
    if (typeof value === 'string') value = value.split(',');
    if (Object.prototype.toString.call(value) !== '[object Array]') return output;
    for (index = 0; index < value.length; index += 1) output.push(normalizeView(value[index]));
    return expandStar === false ? output : uniqueViews(output);
  }

  function normalizeRoles(value) {
    var output = [];
    var index;
    var role;
    if (!value) return output;
    if (typeof value === 'string') value = value.split(',');
    if (Object.prototype.toString.call(value) !== '[object Array]') value = [value];
    for (index = 0; index < value.length; index += 1) {
      role = String(value[index] || '').replace(/^\s+|\s+$/g, '').toLowerCase();
      if (role && !contains(output, role)) output.push(role);
    }
    return output;
  }

  function getUserConfig(email) {
    var users = accessRules().users || {};
    return users[email] || users[email.toLowerCase()] || null;
  }

  function mergeRoleViews(roles) {
    var rules = accessRules();
    var roleConfig = rules.roles || {};
    var views = [];
    var index;
    var role;
    var configured;
    for (index = 0; index < roles.length; index += 1) {
      role = roles[index];
      configured = roleConfig[role];
      if (!configured) continue;
      views = views.concat(normalizeViews(configured.views || configured));
    }
    return uniqueViews(views);
  }

  function sessionMetadata(session) {
    var user = (session && session.user) || {};
    return assign({}, user.user_metadata || {}, user.app_metadata || {});
  }

  function resolveAccessForSession(session) {
    var rules = accessRules();
    var user = (session && session.user) || {};
    var email = normalizeEmail(user.email);
    var metadata = sessionMetadata(session);
    var userConfig = email ? getUserConfig(email) : null;
    var roles = [];
    var views = [];
    var source = 'default';

    if (metadata.portal_admin === true || metadata.portal_role === 'owner' || metadata.role === 'owner') {
      views = normalizeViews('*');
      source = 'metadata-admin';
    }

    if (!views.length) {
      views = normalizeViews(metadata.portal_views || metadata.portalViews || metadata.allowed_views || metadata.allowedViews);
      if (views.length) source = 'metadata-views';
    }

    if (!views.length) {
      roles = roles.concat(normalizeRoles(metadata.portal_roles || metadata.portalRoles || metadata.portal_role || metadata.portalRole || metadata.role));
      if (userConfig) roles = roles.concat(normalizeRoles(userConfig.roles || userConfig.role));
      views = mergeRoleViews(roles);
      if (views.length) source = 'roles';
    }

    if (!views.length && userConfig) {
      views = normalizeViews(userConfig.views || userConfig.allowedViews);
      if (views.length) source = 'user-config';
    }

    if (!views.length && rules.enforceUserAllowlist !== true) {
      views = normalizeViews(rules.defaultViews || ['dashboard']);
      source = 'default';
    }

    return {
      email: email,
      name: String((userConfig && userConfig.name) || metadata.name || user.email || '').replace(/^\s+|\s+$/g, ''),
      roles: uniqueStrings(roles),
      allowedViews: uniqueViews(views),
      source: source,
      configured: !!userConfig || source.indexOf('metadata') === 0 || source === 'roles'
    };
  }

  function isViewAllowed(view) {
    var normalized = normalizeView(view);
    var access = currentAccess || window.__ALTEA_PORTAL_ACCESS__;
    if (!access || !access.allowedViews || !access.allowedViews.length) return true;
    return contains(access.allowedViews, normalized);
  }

  function firstAllowedView() {
    var access = currentAccess || window.__ALTEA_PORTAL_ACCESS__;
    if (access && access.allowedViews && access.allowedViews.length) return access.allowedViews[0];
    return 'dashboard';
  }

  function closestNavButton(node) {
    while (node && node !== document) {
      if (node.getAttribute && node.getAttribute('data-view') && /\bnav-btn\b/.test(node.className || '')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function setViewAccessVisibility(button) {
    var view = normalizeView(button && button.getAttribute && button.getAttribute('data-view'));
    var allowed = !view || isViewAllowed(view);
    if (!button) return;
    if (!button.getAttribute('data-access-original-hidden')) {
      if (button.hidden || button.getAttribute('aria-hidden') === 'true') button.setAttribute('data-access-original-hidden', '1');
      else button.setAttribute('data-access-original-hidden', '0');
    }
    if (!allowed) {
      button.classList.add('portal-access-hidden');
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
      button.setAttribute('tabindex', '-1');
      return;
    }
    if (button.getAttribute('data-access-original-hidden') === '1') return;
    button.classList.remove('portal-access-hidden');
    button.hidden = false;
    button.removeAttribute('aria-hidden');
    button.removeAttribute('tabindex');
  }

  function applyAccessToDom() {
    var buttons = document.querySelectorAll ? document.querySelectorAll('.nav-btn[data-view]') : [];
    var sections = document.querySelectorAll ? document.querySelectorAll('.view[id^="view-"]') : [];
    var index;
    var view;
    var activeView;
    var fallback = firstAllowedView();
    for (index = 0; index < buttons.length; index += 1) setViewAccessVisibility(buttons[index]);
    for (index = 0; index < sections.length; index += 1) {
      view = normalizeView(String(sections[index].id || '').replace(/^view-/, ''));
      sections[index].classList.toggle('portal-access-hidden', !!view && !isViewAllowed(view));
    }
    activeView = normalizeView(String(window.location.hash || '').replace(/^#/, ''));
    if (activeView && !isViewAllowed(activeView) && fallback && window.history && window.location) {
      window.history.replaceState(window.history.state || null, '', window.location.pathname + window.location.search + '#' + fallback);
    }
  }

  function startAccessObserver() {
    if (accessObserverStarted) return;
    accessObserverStarted = true;
    document.addEventListener('click', function (event) {
      var button = closestNavButton(event.target);
      var fallback;
      if (!button || isViewAllowed(button.getAttribute('data-view'))) return;
      event.preventDefault();
      event.stopPropagation();
      fallback = firstAllowedView();
      if (fallback && window.location.hash !== '#' + fallback) window.location.hash = fallback;
      applyAccessToDom();
    }, true);
    window.addEventListener('hashchange', function () {
      var view = normalizeView(String(window.location.hash || '').replace(/^#/, ''));
      var fallback = firstAllowedView();
      if (view && !isViewAllowed(view) && fallback) window.location.hash = fallback;
      applyAccessToDom();
    });
    if (window.MutationObserver) {
      new window.MutationObserver(applyAccessToDom).observe(document.documentElement, { childList: true, subtree: true });
    } else {
      window.setInterval(applyAccessToDom, 1500);
    }
  }

  function publishAccess(access) {
    currentAccess = access || { allowedViews: ['dashboard'], email: '', roles: [] };
    window.__ALTEA_PORTAL_ACCESS__ = currentAccess;
    window.alteaPortalAccess = {
      get: function () { return currentAccess; },
      isViewAllowed: isViewAllowed,
      firstView: firstAllowedView,
      apply: applyAccessToDom
    };
    startAccessObserver();
    applyAccessToDom();
    try {
      window.dispatchEvent(new CustomEvent('altea:accesschange', { detail: currentAccess }));
    } catch (_) {}
  }

  function setText(node, text) {
    if (!node) return;
    if ('textContent' in node) node.textContent = text;
    else node.innerText = text;
  }

  function append(parent, tagName, className, text) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (typeof text === 'string') setText(node, text);
    parent.appendChild(node);
    return node;
  }

  function setStatus(message, kind) {
    var status = document.getElementById('portalAuthStatus');
    if (!status) return;
    status.className = ('portal-auth-status ' + (kind || '')).replace(/\s+$/, '');
    setText(status, message);
  }

  function isLocalHost() {
    var host = String(window.location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  }

  function hasStrongTransport() {
    var protocol = String(window.location.protocol || '').toLowerCase();
    return protocol === 'https:' || protocol === 'file:' || isLocalHost();
  }

  function hasBasicBrowserSupport() {
    return !!(window.Promise && document.addEventListener && document.querySelector && Object.prototype.hasOwnProperty);
  }

  function lockSubmit(disabled) {
    var submit = document.getElementById('portalAuthSubmit');
    if (submit) submit.disabled = !!disabled;
  }

  function createInput(id, name, type, autocomplete) {
    var input = document.createElement('input');
    input.id = id;
    input.name = name;
    input.type = type;
    input.autocomplete = autocomplete;
    input.required = true;
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('data-lpignore', 'false');
    return input;
  }

  function renderGate() {
    document.body.classList.add('portal-auth-locked');
    var screen = document.getElementById('portalAuthScreen');
    if (screen) {
      screen.hidden = false;
      return screen;
    }

    screen = append(document.body, 'div', 'portal-auth-screen');
    screen.id = 'portalAuthScreen';

    var card = append(screen, 'div', 'portal-auth-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'portalAuthTitle');

    var brand = append(card, 'div', 'portal-auth-brand');
    var mark = document.createElement('img');
    mark.src = 'assets/altea-imperial-mark.svg';
    mark.alt = '';
    brand.appendChild(mark);
    var brandText = append(brand, 'div');
    var title = append(brandText, 'strong', '', '\u0412\u0445\u043e\u0434 \u0432 \u043f\u043e\u0440\u0442\u0430\u043b');
    title.id = 'portalAuthTitle';
    append(brandText, 'span', '', '\u0414\u043e\u043c \u0431\u0440\u0435\u043d\u0434\u0430 \u0410\u043b\u0442\u0435\u044f');

    var form = append(card, 'form', 'portal-auth-form');
    form.id = 'portalAuthForm';
    form.noValidate = true;

    var emailLabel = append(form, 'label', '', '\u0420\u0430\u0431\u043e\u0447\u0430\u044f \u043f\u043e\u0447\u0442\u0430');
    var emailInput = createInput('portalAuthEmail', 'email', 'email', 'username');
    emailInput.inputMode = 'email';
    emailInput.maxLength = MAX_EMAIL_LENGTH;
    emailLabel.appendChild(emailInput);

    var passwordLabel = append(form, 'label', '', '\u041f\u0430\u0440\u043e\u043b\u044c');
    var passwordInput = createInput('portalAuthPassword', 'password', 'password', 'current-password');
    passwordInput.maxLength = MAX_PASSWORD_LENGTH;
    passwordLabel.appendChild(passwordInput);

    var honey = document.createElement('input');
    honey.id = 'portalAuthWebsite';
    honey.name = 'website';
    honey.type = 'text';
    honey.tabIndex = -1;
    honey.autocomplete = 'off';
    honey.className = 'portal-auth-hp';
    honey.setAttribute('aria-hidden', 'true');
    form.appendChild(honey);

    var submit = append(form, 'button', 'portal-auth-submit', '\u0412\u043e\u0439\u0442\u0438');
    submit.id = 'portalAuthSubmit';
    submit.type = 'submit';

    var status = append(form, 'div', 'portal-auth-status', DEFAULT_STATUS);
    status.id = 'portalAuthStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    form.addEventListener('submit', handleLogin);
    window.setTimeout(function () { emailInput.focus(); }, 80);
    return screen;
  }

  function readThrottle() {
    var state = readJson(THROTTLE_KEY, {});
    return state && typeof state === 'object' ? state : {};
  }

  function lockMsForFailures(failures) {
    if (failures < 3) return 0;
    if (failures === 3) return 15000;
    if (failures === 4) return 30000;
    if (failures === 5) return 60000;
    if (failures === 6) return 120000;
    if (failures === 7) return 300000;
    return 900000;
  }

  function throttleWaitMs() {
    var state = readThrottle();
    var waitMs = Math.max(0, Number(state.lockUntil || 0) - now());
    return waitMs > 0 ? waitMs : 0;
  }

  function clearThrottle() {
    removeStored(THROTTLE_KEY);
    if (throttleTimer) {
      window.clearInterval(throttleTimer);
      throttleTimer = null;
    }
  }

  function registerFailure() {
    var state = readThrottle();
    var failures = Math.min(Number(state.failures || 0) + 1, 20);
    var waitMs = lockMsForFailures(failures);
    writeJson(THROTTLE_KEY, {
      failures: failures,
      lockUntil: waitMs ? now() + waitMs : 0,
      lastFailureAt: now()
    });
    return waitMs;
  }

  function formatWait(waitMs) {
    var seconds = Math.max(1, Math.ceil(waitMs / 1000));
    if (seconds < 60) return seconds + ' \u0441\u0435\u043a.';
    return Math.ceil(seconds / 60) + ' \u043c\u0438\u043d.';
  }

  function updateThrottleUi() {
    var waitMs = throttleWaitMs();
    if (!waitMs) {
      lockSubmit(false);
      if (throttleTimer) {
        window.clearInterval(throttleTimer);
        throttleTimer = null;
      }
      return false;
    }
    lockSubmit(true);
    setStatus('\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u043d\u043e\u0433\u043e \u043f\u043e\u043f\u044b\u0442\u043e\u043a. \u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 ' + formatWait(waitMs) + '.', 'danger');
    if (!throttleTimer) {
      throttleTimer = window.setInterval(updateThrottleUi, 1000);
    }
    return true;
  }

  function hasControlChars(value) {
    return /[\u0000-\u001f\u007f]/.test(String(value || ''));
  }

  function isValidEmailShape(email) {
    return /^[^\s@]{1,128}@[^\s@]{1,190}\.[^\s@]{2,}$/i.test(email);
  }

  function readCredentials(form) {
    var emailNode = form.elements.email;
    var passwordNode = form.elements.password;
    var trapNode = form.elements.website;
    var email = normalizeEmail(emailNode && emailNode.value);
    var password = String((passwordNode && passwordNode.value) || '');
    var trap = String((trapNode && trapNode.value) || '');

    if (trap) return { trapped: true };
    if (!email || !password) return null;
    if (email.length > MAX_EMAIL_LENGTH || password.length > MAX_PASSWORD_LENGTH) return null;
    if (hasControlChars(email) || hasControlChars(password)) return null;
    if (!isValidEmailShape(email)) return null;
    return { email: email, password: password };
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, Math.max(0, ms));
    });
  }

  function minimumResponseDelay(startedAt) {
    var elapsed = now() - startedAt;
    var target = LOGIN_MIN_RESPONSE_MS + Math.floor(Math.random() * LOGIN_JITTER_MS);
    return delay(Math.max(0, target - elapsed));
  }

  function waitForSupabase(timeoutMs) {
    var timeout = timeoutMs || 9000;
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var started = now();
      var timer = window.setInterval(function () {
        if (window.supabase && window.supabase.createClient) {
          window.clearInterval(timer);
          resolve();
          return;
        }
        if (now() - started > timeout) {
          window.clearInterval(timer);
          reject(new Error('supabase-unavailable'));
        }
      }, 80);
    });
  }

  function getClient() {
    if (client) return Promise.resolve(client);
    return waitForSupabase().then(function () {
      var cfg = authConfig();
      client = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: STORAGE_KEY
        }
      });
      return client;
    });
  }

  function applySession(session) {
    var email;
    var appState;
    currentSession = session || null;
    window.__ALTEA_AUTH_SESSION__ = currentSession;
    authConfig();
    appState = typeof state === 'object' && state ? state : null;
    if (appState && appState.team && currentSession && currentSession.access_token) {
      email = String((currentSession.user && currentSession.user.email) || '').replace(/^\s+|\s+$/g, '');
      appState.team.accessToken = currentSession.access_token;
      appState.team.userId = String((currentSession.user && currentSession.user.id) || '').replace(/^\s+|\s+$/g, '');
      if (email) appState.team.member = assign({}, appState.team.member || {}, { name: email });
    }
  }

  function clearSessionState() {
    currentSession = null;
    currentAccess = null;
    window.__ALTEA_AUTH_SESSION__ = null;
    window.__ALTEA_PORTAL_ACCESS__ = null;
  }

  function findAuthScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    for (var index = 0; index < scripts.length; index += 1) {
      if (String(scripts[index].src || '').indexOf('portal-auth-gate.js') !== -1) return scripts[index];
    }
    return null;
  }

  function holdFollowingScripts() {
    var authScript = findAuthScript();
    if (!authScript || !authScript.parentNode) return;
    var scripts = authScript.parentNode.getElementsByTagName('script');
    var afterAuth = false;
    for (var index = 0; index < scripts.length; index += 1) {
      var script = scripts[index];
      var src = script.getAttribute('src');
      if (script === authScript) {
        afterAuth = true;
        continue;
      }
      if (!afterAuth || !src || script.getAttribute(DELAYED_SCRIPT_ATTR)) continue;
      if (src.indexOf('portal-auth-gate.js') !== -1 || src.indexOf('@supabase/supabase-js') !== -1) continue;
      script.setAttribute(DELAYED_SCRIPT_ATTR, src);
      script.setAttribute('type', DELAYED_SCRIPT_TYPE);
      script.removeAttribute('src');
      script.removeAttribute('defer');
      script.removeAttribute('async');
    }
  }

  function copyScriptAttrs(from, to) {
    var attrs = ['crossorigin', 'integrity', 'referrerpolicy', 'nomodule'];
    var index;
    for (index = 0; index < attrs.length; index += 1) {
      var name = attrs[index];
      var value = from.getAttribute(name);
      if (value !== null) to.setAttribute(name, value);
    }
  }

  function loadOneDelayedScript(placeholder) {
    var src = placeholder.getAttribute(DELAYED_SCRIPT_ATTR);
    if (!src || placeholder.getAttribute('data-auth-loaded') === '1') return Promise.resolve();
    return new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      copyScriptAttrs(placeholder, script);
      script.onload = function () {
        placeholder.setAttribute('data-auth-loaded', '1');
        resolve();
      };
      script.onerror = function () {
        placeholder.setAttribute('data-auth-error', '1');
        if (window.console && window.console.warn) window.console.warn('[portal-auth:scripts] delayed script failed');
        resolve();
      };
      placeholder.parentNode.insertBefore(script, placeholder.nextSibling);
    });
  }

  function whenDomReady() {
    if (document.readyState && document.readyState !== 'loading') return Promise.resolve();
    return new Promise(function (resolve) {
      document.addEventListener('DOMContentLoaded', function onReady() {
        document.removeEventListener('DOMContentLoaded', onReady);
        resolve();
      });
    });
  }

  function loadDelayedScripts() {
    if (delayedScriptsPromise) return delayedScriptsPromise;
    delayedScriptsPromise = whenDomReady().then(function () {
      var placeholders = document.querySelectorAll('script[' + DELAYED_SCRIPT_ATTR + ']');
      var chain = Promise.resolve();
      var index;
      for (index = 0; index < placeholders.length; index += 1) {
        chain = (function (placeholder, previous) {
          return previous.then(function () {
            return loadOneDelayedScript(placeholder);
          });
        }(placeholders[index], chain));
      }
      return chain;
    });
    return delayedScriptsPromise;
  }

  function installLogoutButton() {
    var actions = document.querySelector('.top-actions');
    var button;
    var label;
    if (!actions || document.getElementById('portalAuthLogoutBtn')) return;
    if (currentAccess && currentAccess.email && !document.getElementById('portalAuthUserBadge')) {
      label = document.createElement('span');
      label.id = 'portalAuthUserBadge';
      label.className = 'portal-auth-user';
      label.title = currentAccess.email;
      setText(label, currentAccess.email);
      actions.appendChild(label);
    }
    button = document.createElement('button');
    button.id = 'portalAuthLogoutBtn';
    button.className = 'btn ghost';
    button.type = 'button';
    setText(button, '\u0412\u044b\u0439\u0442\u0438');
    button.addEventListener('click', signOut);
    actions.appendChild(button);
  }

  function unlockPortal(session) {
    var screen;
    var access = resolveAccessForSession(session);
    if (!access.allowedViews.length) throw new Error('access-denied');
    applySession(session);
    publishAccess(access);
    clearThrottle();
    screen = document.getElementById('portalAuthScreen');
    if (screen) screen.parentNode.removeChild(screen);
    document.body.classList.remove('portal-auth-locked');
    installLogoutButton();
    loadDelayedScripts();
  }

  function resolveAuth(session) {
    unlockPortal(session);
    if (pendingResolve) {
      var resolve = pendingResolve;
      pendingResolve = null;
      resolve(session);
    }
  }

  function handleLogin(event) {
    var form;
    var submit;
    var password;
    var credentials;
    var startedAt;
    var failedAsAuth = false;

    event.preventDefault();
    if (updateThrottleUi()) return;
    if (!hasStrongTransport()) {
      setStatus('\u0412\u0445\u043e\u0434 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e HTTPS \u0438\u043b\u0438 \u043d\u0430 localhost.', 'danger');
      lockSubmit(true);
      return;
    }

    form = event.currentTarget;
    submit = document.getElementById('portalAuthSubmit');
    password = document.getElementById('portalAuthPassword');
    credentials = readCredentials(form);
    startedAt = now();

    if (!credentials) {
      setStatus('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 email \u0438 \u043f\u0430\u0440\u043e\u043b\u044c.', 'danger');
      return;
    }
    if (credentials.trapped) {
      lockSubmit(true);
      delay(LOGIN_MIN_RESPONSE_MS + LOGIN_JITTER_MS).then(function () {
        setStatus(GENERIC_LOGIN_ERROR, 'danger');
        lockSubmit(false);
      });
      return;
    }

    if (submit) submit.disabled = true;
    setStatus('\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0434\u043e\u0441\u0442\u0443\u043f...', '');

    getClient()
      .then(function (authClient) {
        return authClient.auth.signInWithPassword({ email: credentials.email, password: credentials.password });
      })
      .then(function (result) {
        var session;
        var access;
        if (result && result.error) {
          failedAsAuth = true;
          throw new Error('auth-failed');
        }
        session = result && result.data && result.data.session;
        if (!session || !session.access_token) {
          failedAsAuth = true;
          throw new Error('auth-empty');
        }
        access = resolveAccessForSession(session);
        if (!access.allowedViews.length) {
          return getClient()
            .then(function (authClient) { return authClient.auth.signOut(); })
            .catch(function () {})
            .then(function () {
              throw new Error('access-denied');
            });
        }
        return minimumResponseDelay(startedAt).then(function () {
          setStatus('\u0412\u0445\u043e\u0434 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d.', 'ok');
          resolveAuth(session);
        });
      })
      .catch(function (error) {
        return minimumResponseDelay(startedAt).then(function () {
          var isAccessDenied = error && error.message === 'access-denied';
          if (failedAsAuth) registerFailure();
          if (window.console && window.console.warn) window.console.warn('[portal-auth] login check failed');
          setStatus(failedAsAuth ? GENERIC_LOGIN_ERROR : (isAccessDenied ? ACCESS_DENIED_ERROR : '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0434\u043e\u0441\u0442\u0443\u043f. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0441\u0435\u0442\u044c \u0438 Supabase.'), 'danger');
          if (password) password.value = '';
          updateThrottleUi();
        });
      })
      .then(function () {
        if (!currentSession && !throttleWaitMs() && submit) submit.disabled = false;
      });
  }

  function installAuthListener(authClient) {
    if (authListenerReady || !authClient || !authClient.auth || !authClient.auth.onAuthStateChange) return;
    authListenerReady = true;
    authClient.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_IN' && session && session.access_token) resolveAuth(session);
      if (event === 'TOKEN_REFRESHED' && session && session.access_token) applySession(session);
      if (event === 'SIGNED_OUT' && currentSession) {
        clearSessionState();
        document.body.classList.add('portal-auth-locked');
        window.location.reload();
      }
    });
  }

  function signOut() {
    return getClient()
      .then(function (authClient) {
        return authClient.auth.signOut();
      })
      .catch(function () {
        if (window.console && window.console.warn) window.console.warn('[portal-auth] sign out failed');
      })
      .then(function () {
        clearSessionState();
        document.body.classList.add('portal-auth-locked');
        window.location.reload();
      });
  }

  function ensureAuthenticated() {
    authConfig();
    if (!isAuthRequired()) {
      document.body.classList.remove('portal-auth-locked');
      loadDelayedScripts();
      return Promise.resolve(null);
    }
    if (authPromise) return authPromise;
    authPromise = new Promise(function (resolve) {
      pendingResolve = resolve;
      renderGate();
      if (!hasBasicBrowserSupport()) {
        setStatus('\u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u0443\u0441\u0442\u0430\u0440\u0435\u043b \u0434\u043b\u044f \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0433\u043e \u0432\u0445\u043e\u0434\u0430. \u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u043f\u043e\u0440\u0442\u0430\u043b \u0432 \u0430\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u043e\u043c Chrome, Edge, Safari \u0438\u043b\u0438 Firefox.', 'danger');
        lockSubmit(true);
        return;
      }
      if (!hasStrongTransport()) {
        setStatus('\u0412\u0445\u043e\u0434 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e HTTPS \u0438\u043b\u0438 \u043d\u0430 localhost.', 'danger');
        lockSubmit(true);
        return;
      }
      updateThrottleUi();
      getClient()
        .then(function (authClient) {
          installAuthListener(authClient);
          return authClient.auth.getSession();
        })
        .then(function (result) {
          var session = result && result.data && result.data.session;
          if (session && session.access_token) {
            if (!resolveAccessForSession(session).allowedViews.length) {
              setStatus(ACCESS_DENIED_ERROR, 'danger');
              return authClient.auth.signOut().catch(function () {});
            }
            resolveAuth(session);
          }
        })
        .catch(function () {
          if (window.console && window.console.warn) window.console.warn('[portal-auth] init failed');
          setStatus('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0432\u0445\u043e\u0434. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 Supabase \u0438 \u0441\u0435\u0442\u044c.', 'danger');
        });
    });
    return authPromise;
  }

  window.alteaPortalAuthGate = {
    ensureAuthenticated: ensureAuthenticated,
    getClient: getClient,
    getSession: function () { return currentSession || window.__ALTEA_AUTH_SESSION__ || null; },
    loadDelayedScripts: loadDelayedScripts,
    signOut: signOut
  };

  holdFollowingScripts();

  if (document.body) {
    ensureAuthenticated();
  } else {
    window.addEventListener('DOMContentLoaded', function onReady() {
      window.removeEventListener('DOMContentLoaded', onReady);
      ensureAuthenticated();
    });
  }
})();
