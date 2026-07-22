(function () {
  'use strict';

  if (window.__ALTEA_PORTAL_AUTH_GATE__) return;
  window.__ALTEA_PORTAL_AUTH_GATE__ = true;

  var STORAGE_KEY = 'altea-portal-auth-v1';
  var THROTTLE_KEY = 'altea-portal-auth-throttle-v2';
  var DELAYED_SCRIPT_ATTR = 'data-auth-src';
  var DELAYED_SCRIPT_TYPE = 'application/x-altea-auth-delayed';
  var DELAYED_SCRIPT_TIMEOUT_MS = 30000;
  var LOGIN_REQUEST_TIMEOUT_MS = 15000;
  var LOGIN_MIN_RESPONSE_MS = 700;
  var LOGIN_JITTER_MS = 450;
  var MAX_EMAIL_LENGTH = 254;
  var MAX_PASSWORD_LENGTH = 1024;
  var GUEST_EMAIL = 'guest@qeep.life';
  var GUEST_PASSWORD = 'NihsS%Hn_uE#kXBfcX!e';
  var GUEST_NAME = '\u0413\u043e\u0441\u0442\u0435\u0432\u043e\u0439 \u0432\u0445\u043e\u0434';
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
    'iu-drr',
    'wb-rating',
    'product-leaderboard',
    'meetings',
    'documents',
    'designers'
  ];
  var SHARED_AUTHENTICATED_VIEWS = ['documents', 'designers'];
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
  var pendingMfaChallenge = null;
  var loginFlowActive = false;
  var passwordSetupFlow = (function () {
    var hash = String((window.location && window.location.hash) || '');
    var match = /(?:^|[&#])type=(invite|recovery)(?:&|$)/i.exec(hash);
    return match ? String(match[1]).toLowerCase() : '';
  }());

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

  function appendSharedAuthenticatedViews(views, email, configured) {
    var normalized = uniqueViews(views || []);
    if (!email) return normalized;
    if (!configured && !normalized.length) return normalized;
    return uniqueViews(normalized.concat(SHARED_AUTHENTICATED_VIEWS));
  }

  function accessWithSharedAuthenticatedViews(access) {
    var normalized = access || { allowedViews: [], email: '', roles: [] };
    if (normalized.email && normalized.allowedViews && normalized.allowedViews.length) {
      normalized.allowedViews = appendSharedAuthenticatedViews(normalized.allowedViews, normalized.email, true);
    }
    return normalized;
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

    var configured = !!userConfig || source.indexOf('metadata') === 0 || source === 'roles';

    return {
      email: email,
      name: String((userConfig && userConfig.name) || metadata.name || user.email || '').replace(/^\s+|\s+$/g, ''),
      roles: uniqueStrings(roles),
      allowedViews: appendSharedAuthenticatedViews(views, email, configured),
      source: source,
      configured: configured
    };
  }

  function isViewAllowed(view) {
    var normalized = normalizeView(view);
    var access = currentAccess || window.__ALTEA_PORTAL_ACCESS__;
    if (normalized === 'documents' && access && access.email && access.allowedViews && access.allowedViews.length) return true;
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
    currentAccess = accessWithSharedAuthenticatedViews(access || { allowedViews: ['dashboard'], email: '', roles: [] });
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

  function accessRoleText(access) {
    return access && access.roles && access.roles.length ? access.roles.join(',') : '';
  }

  function accessAuditMetadata(access, extra) {
    return assign({
      accessSource: access && access.source ? access.source : '',
      allowedViewsCount: access && access.allowedViews ? access.allowedViews.length : 0,
      roles: access && access.roles ? access.roles : []
    }, extra || {});
  }

  function emitSecurityAudit(eventType, payload) {
    try {
      if (window.alteaSecurityAudit && typeof window.alteaSecurityAudit.emit === 'function') {
        window.alteaSecurityAudit.emit(eventType, payload || {});
      }
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
    if (protocol === 'https:' || protocol === 'file:' || isLocalHost()) return true;
    return window.isSecureContext === true;
  }

  function secureCanonicalUrl() {
    var location = window.location || {};
    var host = String(location.host || '').replace(/^\s+|\s+$/g, '');
    if (!host) return '';
    return 'https://' + host + String(location.pathname || '/') + String(location.search || '') + String(location.hash || '');
  }

  function redirectToStrongTransport() {
    var protocol = String(window.location.protocol || '').toLowerCase();
    var target;
    if (hasStrongTransport()) return false;
    if (protocol !== 'http:' || isLocalHost()) return false;
    target = secureCanonicalUrl();
    if (!target) return false;
    try {
      window.location.replace(target);
      return true;
    } catch (_) {
      try {
        window.location.href = target;
        return true;
      } catch (__) {}
    }
    return false;
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

  function createLogo(className, variant, alt) {
    var image = document.createElement('img');
    image.className = className;
    image.src = variant === 'black' ? 'assets/altea-logo-exact-black.png' : 'assets/altea-logo-exact-white.png';
    image.alt = alt || '';
    image.decoding = 'async';
    return image;
  }

  function iconMarkup(name) {
    if (name === 'mail') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>';
    }
    if (name === 'eye') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.6"></circle></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>';
  }

  function appendIcon(parent, className, name) {
    var icon = append(parent, 'span', className);
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iconMarkup(name);
    return icon;
  }

  function appendSource(video, src, type) {
    var source = document.createElement('source');
    source.src = src;
    source.type = type;
    video.appendChild(source);
  }

  function appendVideoBackground(screen) {
    var video = append(screen, 'video', 'portal-auth-motion');
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.tabIndex = -1;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    appendSource(video, 'assets/altea-login-luxury-motion.webm', 'video/webm');
    appendSource(video, 'assets/altea-login-luxury-motion.mp4', 'video/mp4');
    try {
      var playPromise = video.play && video.play();
      if (playPromise && playPromise.catch) playPromise.catch(function () {});
    } catch (_) {}
    return video;
  }

  function buildField(form, id, name, type, autocomplete, labelText, placeholder, iconName) {
    var field = append(form, 'div', 'portal-auth-field');
    var label = append(field, 'label', '', labelText);
    var shell = append(field, 'div', 'portal-auth-field-shell');
    var input = createInput(id, name, type, autocomplete);
    label.setAttribute('for', id);
    input.placeholder = placeholder || '';
    input.setAttribute('aria-describedby', 'portalAuthStatus');
    shell.appendChild(input);
    if (iconName) appendIcon(shell, 'portal-auth-field-icon', iconName);
    return { field: field, shell: shell, input: input };
  }

  function initPasswordToggle(passwordInput) {
    var toggle = document.getElementById('portalAuthTogglePassword');
    if (!toggle || !passwordInput) return;
    toggle.addEventListener('click', function () {
      var show = passwordInput.type === 'password';
      passwordInput.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-label', show ? '\u0421\u043a\u0440\u044b\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c' : '\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c');
    });
  }

  function initLuxuryMotion(screen) {
    var canvas;
    var ctx;
    var reduced = false;
    var raf = window.requestAnimationFrame || function (callback) {
      return window.setTimeout(function () { callback(now()); }, 16);
    };
    var w = 0;
    var h = 0;
    var dpr = 1;
    var t0 = now();
    var pearls = [];
    var index;

    if (!screen || screen.getAttribute('data-luxury-motion-ready') === '1') return;
    screen.setAttribute('data-luxury-motion-ready', '1');

    try {
      reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {}

    screen.addEventListener('pointermove', function (event) {
      var x = ((event.clientX || 0) / Math.max(1, window.innerWidth) - 0.5) * 2;
      var y = ((event.clientY || 0) / Math.max(1, window.innerHeight) - 0.5) * 2;
      screen.style.setProperty('--mx', x.toFixed(3));
      screen.style.setProperty('--my', y.toFixed(3));
    }, { passive: true });

    var intro = document.getElementById('portalAuthIntro');
    if (intro) {
      intro.addEventListener('click', function () {
        intro.style.display = 'none';
      });
    }

    canvas = document.getElementById('portalAuthSilk');
    if (!canvas || !canvas.getContext) return;

    try {
      ctx = canvas.getContext('2d', { alpha: false });
    } catch (_) {
      ctx = canvas.getContext('2d');
    }
    if (!ctx) return;

    for (index = 0; index < 38; index += 1) {
      pearls.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.5 + Math.random() * 1.9,
        phase: Math.random() * Math.PI * 2,
        speed: 0.1 + Math.random() * 0.22,
        drift: (Math.random() - 0.5) * 0.015,
        a: 0.08 + Math.random() * 0.24
      });
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
      h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function addColorStop(gradient, stop, value) {
      try {
        gradient.addColorStop(stop, value);
      } catch (_) {}
    }

    function ribbon(time, baseY, amp, width, phase, alpha, warm) {
      var points = [];
      var steps = 42;
      var i;
      var u;
      var x;
      var y;
      var gradient;
      for (i = 0; i <= steps; i += 1) {
        u = i / steps;
        x = -w * 0.12 + (w * 1.24) * u;
        y = baseY + Math.sin(u * 6.1 + time * 0.31 + phase) * amp + Math.sin(u * 13.7 - time * 0.18 + phase * 0.7) * amp * 0.28 + (u - 0.5) * h * 0.06;
        points.push([x, y]);
      }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1] - width / 2);
      for (i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1] - width / 2);
      for (i = points.length - 1; i >= 0; i -= 1) ctx.lineTo(points[i][0], points[i][1] + width / 2);
      ctx.closePath();
      gradient = ctx.createLinearGradient(0, baseY - width, w, baseY + width);
      if (warm) {
        addColorStop(gradient, 0, 'rgba(89,78,65,0)');
        addColorStop(gradient, 0.28, 'rgba(203,185,156,' + (alpha * 0.28) + ')');
        addColorStop(gradient, 0.5, 'rgba(255,250,239,' + alpha + ')');
        addColorStop(gradient, 0.72, 'rgba(163,145,121,' + (alpha * 0.23) + ')');
        addColorStop(gradient, 1, 'rgba(20,18,16,0)');
      } else {
        addColorStop(gradient, 0, 'rgba(80,86,92,0)');
        addColorStop(gradient, 0.3, 'rgba(188,196,202,' + (alpha * 0.2) + ')');
        addColorStop(gradient, 0.5, 'rgba(245,247,248,' + alpha + ')');
        addColorStop(gradient, 0.7, 'rgba(142,150,157,' + (alpha * 0.18) + ')');
        addColorStop(gradient, 1, 'rgba(20,22,24,0)');
      }
      ctx.fillStyle = gradient;
      if ('filter' in ctx) ctx.filter = 'blur(' + Math.max(18, width * 0.18) + 'px)';
      ctx.fill();
      if ('filter' in ctx) ctx.filter = 'none';
      ctx.restore();
    }

    function drawFrame(timestamp) {
      var t = (timestamp - t0) / 1000;
      var bg = ctx.createRadialGradient(w * 0.26, h * 0.43, 0, w * 0.26, h * 0.43, Math.max(w, h) * 0.86);
      var light = ctx.createLinearGradient(0, 0, w, 0);
      var scale = Math.max(0.75, Math.min(1.2, w / 1600));
      var i;
      var p;
      var px;
      var py;
      var pulse;

      addColorStop(bg, 0, '#1a1918');
      addColorStop(bg, 0.37, '#101010');
      addColorStop(bg, 1, '#050505');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      addColorStop(light, 0, 'rgba(255,255,255,0)');
      addColorStop(light, 0.28, 'rgba(255,255,255,.025)');
      addColorStop(light, 0.48, 'rgba(203,185,156,.038)');
      addColorStop(light, 0.72, 'rgba(255,255,255,0)');
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, w, h);

      ribbon(t, h * 0.28, 45 * scale, 130 * scale, 0.4, 0.11, true);
      ribbon(t, h * 0.54, 64 * scale, 185 * scale, 2.1, 0.09, false);
      ribbon(t, h * 0.76, 38 * scale, 105 * scale, 4.0, 0.075, true);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (i = 0; i < pearls.length; i += 1) {
        p = pearls[i];
        px = (p.x + Math.sin(t * p.speed + p.phase) * 0.02 + p.drift * t) % 1;
        py = (p.y + Math.cos(t * p.speed * 0.8 + p.phase) * 0.025 + 1) % 1;
        if (px < 0) px += 1;
        if (py < 0) py += 1;
        pulse = 0.55 + 0.45 * Math.sin(t * 0.7 + p.phase);
        ctx.beginPath();
        ctx.arc(px * w, py * h, p.r * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + (i % 5 === 0 ? '220,200,169' : '235,239,241') + ',' + (p.a * pulse) + ')';
        ctx.fill();
      }
      ctx.restore();

      if (!reduced && screen.parentNode) raf(drawFrame);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });
    drawFrame(now());
  }

  function renderGate() {
    document.body.classList.add('portal-auth-locked');
    var screen = document.getElementById('portalAuthScreen');
    if (screen) {
      screen.hidden = false;
      initLuxuryMotion(screen);
      return screen;
    }

    screen = append(document.body, 'div', 'portal-auth-screen portal-auth-luxury');
    screen.id = 'portalAuthScreen';
    screen.style.setProperty('--mx', '0');
    screen.style.setProperty('--my', '0');

    var intro = append(screen, 'div', 'portal-auth-intro');
    intro.id = 'portalAuthIntro';
    intro.setAttribute('aria-hidden', 'true');
    var introInner = append(intro, 'div', 'portal-auth-intro-inner');
    introInner.appendChild(createLogo('portal-auth-intro-logo', 'white', '\u0410\u043b\u0442\u0435\u044f'));
    append(introInner, 'div', 'portal-auth-intro-kicker', 'PRIVATE WORKSPACE');
    append(introInner, 'div', 'portal-auth-intro-line');

    appendVideoBackground(screen);
    var canvas = append(screen, 'canvas', 'portal-auth-silk');
    canvas.id = 'portalAuthSilk';
    canvas.setAttribute('aria-hidden', 'true');
    append(screen, 'div', 'portal-auth-noise').setAttribute('aria-hidden', 'true');
    append(screen, 'div', 'portal-auth-vignette').setAttribute('aria-hidden', 'true');
    var giantMark = createLogo('portal-auth-giant-mark', 'white', '');
    giantMark.setAttribute('aria-hidden', 'true');
    screen.appendChild(giantMark);
    append(screen, 'div', 'portal-auth-orbital').setAttribute('aria-hidden', 'true');

    var topbar = append(screen, 'header', 'portal-auth-topbar');
    var lockup = append(topbar, 'div', 'portal-auth-brand-lockup');
    lockup.appendChild(createLogo('portal-auth-brand-logo', 'white', '\u0410\u043b\u0442\u0435\u044f'));
    append(lockup, 'div', 'portal-auth-hairline');
    append(lockup, 'div', 'portal-auth-brand-meta', '\u0412\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u0438\u0439 \u043f\u043e\u0440\u0442\u0430\u043b\u000a\u043a\u043e\u043c\u0430\u043d\u0434\u044b \u0431\u0440\u0435\u043d\u0434\u0430');
    var systemPill = append(topbar, 'div', 'portal-auth-system-pill');
    append(systemPill, 'i');
    append(systemPill, 'span', '', '\u0421\u0438\u0441\u0442\u0435\u043c\u044b \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b');

    var layout = append(screen, 'main', 'portal-auth-layout');
    var story = append(layout, 'section', 'portal-auth-story');
    append(story, 'div', 'portal-auth-eyebrow', 'ALTEA PRIVATE WORKSPACE');
    var heroTitle = append(story, 'h1', 'portal-auth-hero-title');
    heroTitle.appendChild(document.createTextNode('\u041f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0430\u0435\u043c \u0432\u0430\u0448\u0443 '));
    append(heroTitle, 'em', '', '\u0438\u043d\u0434\u0438\u0432\u0438\u0434\u0443\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c');
    append(story, 'p', 'portal-auth-lead', '\u0415\u0434\u0438\u043d\u043e\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u043a\u043e\u043c\u0430\u043d\u0434\u044b \u0410\u043b\u0442\u0435\u044f: \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u044b, \u043f\u0440\u043e\u0434\u0430\u0436\u0438, \u0437\u0430\u043f\u0443\u0441\u043a\u0438, \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u0438 \u0440\u0435\u0448\u0435\u043d\u0438\u044f \u2014 \u0432 \u043e\u0434\u043d\u043e\u043c \u0441\u043e\u0431\u0440\u0430\u043d\u043d\u043e\u043c \u043a\u043e\u043d\u0442\u0443\u0440\u0435.');
    append(story, 'div', 'portal-auth-signature', 'BEAUTY \u00b7 INTELLIGENCE \u00b7 PRECISION');

    var cardWrap = append(layout, 'div', 'portal-auth-card-wrap');
    append(cardWrap, 'div', 'portal-auth-card-aura').setAttribute('aria-hidden', 'true');
    var card = append(cardWrap, 'section', 'portal-auth-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'portalAuthTitle');

    var cardTop = append(card, 'div', 'portal-auth-card-top');
    cardTop.appendChild(createLogo('portal-auth-card-logo', 'black', '\u0410\u043b\u0442\u0435\u044f'));
    append(cardTop, 'span', 'portal-auth-private-tag', 'PRIVATE ACCESS');
    append(card, 'div', 'portal-auth-welcome-kicker', '\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c');
    var title = append(card, 'h2', 'portal-auth-title', passwordSetupFlow ? '\u0421\u043e\u0437\u0434\u0430\u0439\u0442\u0435 \u043f\u0430\u0440\u043e\u043b\u044c' : '\u0412\u0445\u043e\u0434 \u0432 \u043f\u043e\u0440\u0442\u0430\u043b');
    title.id = 'portalAuthTitle';
    append(card, 'p', 'portal-auth-card-copy', passwordSetupFlow
      ? '\u041f\u0440\u0438\u0434\u0443\u043c\u0430\u0439\u0442\u0435 \u043d\u0430\u0434\u0451\u0436\u043d\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c \u0434\u043b\u044f \u0432\u0445\u043e\u0434\u0430 \u0432 \u043f\u043e\u0440\u0442\u0430\u043b. \u041c\u0438\u043d\u0438\u043c\u0443\u043c 12 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432.'
      : '\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u043a\u043e\u0440\u043f\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u0434\u043b\u044f \u0432\u0445\u043e\u0434\u0430 \u0432 \u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e.');

    var form = append(card, 'form', 'portal-auth-form');
    form.id = 'portalAuthForm';
    form.noValidate = true;

    var emailField = buildField(form, 'portalAuthEmail', 'email', 'email', 'username', '\u041a\u043e\u0440\u043f\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u0430\u044f \u043f\u043e\u0447\u0442\u0430', 'name@qeep.life', 'mail');
    var emailInput = emailField.input;
    emailInput.inputMode = 'email';
    emailInput.maxLength = MAX_EMAIL_LENGTH;

    var passwordField = buildField(form, 'portalAuthPassword', 'password', 'password', 'current-password', '\u041f\u0430\u0440\u043e\u043b\u044c', '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043f\u0430\u0440\u043e\u043b\u044c', '');
    var passwordInput = passwordField.input;
    passwordInput.maxLength = MAX_PASSWORD_LENGTH;
    if (passwordSetupFlow) {
      emailField.field.hidden = true;
      emailInput.required = false;
      passwordField.field.querySelector('label').textContent = '\u041d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c';
      passwordInput.autocomplete = 'new-password';
      passwordInput.placeholder = '\u041c\u0438\u043d\u0438\u043c\u0443\u043c 12 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432';
    }
    var toggle = append(passwordField.shell, 'button', 'portal-auth-eye');
    toggle.id = 'portalAuthTogglePassword';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', '\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c');
    toggle.innerHTML = iconMarkup('eye');

    var confirmField = buildField(form, 'portalAuthPasswordConfirm', 'passwordConfirm', 'password', 'new-password', '\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u043f\u0430\u0440\u043e\u043b\u044c', '\u0415\u0449\u0451 \u0440\u0430\u0437 \u0442\u043e\u0442 \u0436\u0435 \u043f\u0430\u0440\u043e\u043b\u044c', '');
    var confirmInput = confirmField.input;
    confirmInput.maxLength = MAX_PASSWORD_LENGTH;
    confirmField.field.hidden = !passwordSetupFlow;
    confirmInput.required = !!passwordSetupFlow;

    var mfaField = buildField(form, 'portalAuthMfaCode', 'mfaCode', 'text', 'one-time-code', '\u041a\u043e\u0434 2FA', '000000', '');
    var mfaInput = mfaField.input;
    mfaField.field.id = 'portalAuthMfaField';
    mfaField.field.hidden = true;
    mfaInput.required = false;
    mfaInput.inputMode = 'numeric';
    mfaInput.maxLength = 12;
    mfaInput.pattern = '[0-9 ]{6,12}';

    var honey = document.createElement('input');
    honey.id = 'portalAuthWebsite';
    honey.name = 'website';
    honey.type = 'text';
    honey.tabIndex = -1;
    honey.autocomplete = 'off';
    honey.className = 'portal-auth-hp';
    honey.setAttribute('aria-hidden', 'true');
    form.appendChild(honey);

    var options = append(form, 'div', 'portal-auth-options');
    if (passwordSetupFlow) options.hidden = true;
    var remember = append(options, 'label', 'portal-auth-remember');
    var rememberInput = document.createElement('input');
    rememberInput.type = 'checkbox';
    rememberInput.checked = true;
    rememberInput.tabIndex = -1;
    rememberInput.setAttribute('aria-hidden', 'true');
    remember.appendChild(rememberInput);
    append(remember, 'span', '', '\u0417\u0430\u043f\u043e\u043c\u043d\u0438\u0442\u044c \u043c\u0435\u043d\u044f');
    append(options, 'span', 'portal-auth-muted-link', '\u041f\u0430\u0440\u043e\u043b\u044c \u0432\u044b\u0434\u0430\u0435\u0442 \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440');

    var submit = append(form, 'button', 'portal-auth-submit');
    submit.id = 'portalAuthSubmit';
    submit.type = 'submit';
    append(submit, 'span', '', passwordSetupFlow ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c' : '\u0412\u043e\u0439\u0442\u0438 \u0432 \u043f\u043e\u0440\u0442\u0430\u043b');
    appendIcon(submit, 'portal-auth-submit-icon', 'arrow');

    var status = append(form, 'div', 'portal-auth-status', passwordSetupFlow
      ? '\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0437\u0430\u0449\u0438\u0449\u0451\u043d\u043d\u0443\u044e \u0441\u0441\u044b\u043b\u043a\u0443 \u0438\u0437 \u043f\u0438\u0441\u044c\u043c\u0430...'
      : DEFAULT_STATUS);
    status.id = 'portalAuthStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    var divider = append(form, 'div', 'portal-auth-divider', '\u0438\u043b\u0438');
    if (passwordSetupFlow) divider.hidden = true;
    var sso = append(form, 'button', 'portal-auth-sso', '\u041a\u043e\u0440\u043f\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u044b\u0439 \u0432\u0445\u043e\u0434 SSO');
    sso.type = 'button';
    sso.disabled = true;
    sso.setAttribute('aria-disabled', 'true');
    if (passwordSetupFlow) sso.hidden = true;

    var cardBottom = append(card, 'div', 'portal-auth-card-bottom');
    var secure = append(cardBottom, 'span', 'portal-auth-secure');
    append(secure, 'i');
    append(secure, 'span', '', '\u0417\u0430\u0449\u0438\u0449\u0435\u043d\u043d\u043e\u0435 \u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u0435');
    append(cardBottom, 'span', 'portal-auth-powered', 'QHARISMA WORKSPACE');

    form.addEventListener('submit', passwordSetupFlow ? handlePasswordSetup : handleLogin);
    initPasswordToggle(passwordInput);
    initLuxuryMotion(screen);
    window.setTimeout(function () { (passwordSetupFlow ? passwordInput : emailInput).focus(); }, 80);
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

  function isGuestCredentials(credentials) {
    return !!credentials
      && credentials.email === GUEST_EMAIL
      && credentials.password === GUEST_PASSWORD;
  }

  function buildGuestSession(session) {
    var base = session || {};
    var user = assign({}, base.user || {}, {
      email: GUEST_EMAIL,
      user_metadata: assign({}, (base.user && base.user.user_metadata) || {}, {
        name: GUEST_NAME,
        portal_role: 'guest'
      }),
      app_metadata: assign({}, (base.user && base.user.app_metadata) || {}, {
        portal_role: 'guest'
      })
    });
    return assign({}, base, {
      access_token: base.access_token || 'guest-local-session',
      token_type: base.token_type || 'bearer',
      user: user
    });
  }

  function signInGuest(authClient) {
    var auth = authClient && authClient.auth;
    if (!auth || !auth.signInAnonymously) {
      return Promise.resolve({ data: { session: buildGuestSession(null) } });
    }
    return auth.signInAnonymously({
      options: {
        data: {
          name: GUEST_NAME,
          portal_role: 'guest'
        }
      }
    }).then(function (result) {
      if (result && result.error) throw result.error;
      return {
        data: {
          session: buildGuestSession(result && result.data && result.data.session)
        }
      };
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, Math.max(0, ms));
    });
  }

  function withTimeout(promise, timeoutMs, errorCode) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(errorCode || 'timeout'));
      }, Math.max(1, timeoutMs));

      Promise.resolve(promise).then(function (value) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      }, function (error) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      });
    });
  }

  function minimumResponseDelay(startedAt) {
    var elapsed = now() - startedAt;
    var target = LOGIN_MIN_RESPONSE_MS + Math.floor(Math.random() * LOGIN_JITTER_MS);
    return delay(Math.max(0, target - elapsed));
  }

  function setSubmitText(text) {
    var submit = document.getElementById('portalAuthSubmit');
    var label = submit && submit.querySelector ? submit.querySelector('span') : null;
    if (label) setText(label, text);
  }

  function setMfaMode(active, email) {
    var emailNode = document.getElementById('portalAuthEmail');
    var passwordNode = document.getElementById('portalAuthPassword');
    var toggle = document.getElementById('portalAuthTogglePassword');
    var field = document.getElementById('portalAuthMfaField');
    var codeNode = document.getElementById('portalAuthMfaCode');
    if (field) field.hidden = !active;
    if (codeNode) {
      codeNode.required = !!active;
      if (!active) codeNode.value = '';
    }
    if (emailNode) emailNode.disabled = !!active;
    if (passwordNode) passwordNode.disabled = !!active;
    if (toggle) toggle.disabled = !!active;
    setSubmitText(active ? '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u0432\u0445\u043e\u0434' : '\u0412\u043e\u0439\u0442\u0438 \u0432 \u043f\u043e\u0440\u0442\u0430\u043b');
    if (active) {
      setStatus('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434 2FA \u0438\u0437 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u044f' + (email ? ' \u0434\u043b\u044f ' + email : '') + '.', '');
      window.setTimeout(function () {
        if (codeNode) codeNode.focus();
      }, 60);
    }
  }

  function readMfaCode(form) {
    var node = (form && form.elements && form.elements.mfaCode) || document.getElementById('portalAuthMfaCode');
    var code = String((node && node.value) || '').replace(/\s+/g, '');
    if (!/^[0-9]{6,10}$/.test(code)) return '';
    return code;
  }

  function firstVerifiedTotpFactor(data) {
    var factors = [];
    var index;
    if (data && data.totp && Object.prototype.toString.call(data.totp) === '[object Array]') factors = data.totp;
    for (index = 0; index < factors.length; index += 1) {
      if (factors[index] && factors[index].status === 'verified') return factors[index];
    }
    return factors[0] || null;
  }

  function maybeStartMfaChallenge(authClient, session, access, credentials) {
    var mfa = authClient && authClient.auth && authClient.auth.mfa;
    if (!mfa || !mfa.getAuthenticatorAssuranceLevel || !mfa.listFactors || !mfa.challenge) {
      return Promise.resolve({ pending: false });
    }
    return mfa.getAuthenticatorAssuranceLevel()
      .then(function (aalResult) {
        var aal = (aalResult && aalResult.data) || {};
        var needsAal2 = aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2';
        if (aalResult && aalResult.error) throw aalResult.error;
        if (!needsAal2) return { pending: false };
        return mfa.listFactors()
          .then(function (factorsResult) {
            var factor;
            if (factorsResult && factorsResult.error) throw factorsResult.error;
            factor = firstVerifiedTotpFactor((factorsResult && factorsResult.data) || {});
            if (!factor || !factor.id) {
              emitSecurityAudit('mfa_missing', {
                outcome: 'warning',
                severity: 'warning',
                actorEmail: access.email || credentials.email,
                actorRole: accessRoleText(access),
                targetType: 'portal',
                targetName: 'auth-gate',
                metadata: accessAuditMetadata(access, { method: 'totp', reason: 'aal2_without_verified_factor' })
              });
              return { pending: false };
            }
            return mfa.challenge({ factorId: factor.id })
              .then(function (challengeResult) {
                var challengeId;
                if (challengeResult && challengeResult.error) throw challengeResult.error;
                challengeId = challengeResult && challengeResult.data && challengeResult.data.id;
                if (!challengeId) throw new Error('mfa-challenge-empty');
                pendingMfaChallenge = {
                  authClient: authClient,
                  session: session,
                  access: access,
                  email: access.email || credentials.email,
                  factorId: factor.id,
                  challengeId: challengeId
                };
                setMfaMode(true, access.email || credentials.email);
                emitSecurityAudit('mfa_challenge', {
                  outcome: 'ok',
                  severity: 'notice',
                  actorEmail: access.email || credentials.email,
                  actorRole: accessRoleText(access),
                  targetType: 'portal',
                  targetName: 'auth-gate',
                  metadata: accessAuditMetadata(access, { method: 'totp' })
                });
                return { pending: true };
              });
          });
      });
  }

  function verifyPendingMfa(form, submit, startedAt) {
    var pending = pendingMfaChallenge;
    var code = readMfaCode(form);
    var node = document.getElementById('portalAuthMfaCode');
    if (!pending) {
      setMfaMode(false);
      return;
    }
    if (!code) {
      setStatus('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 6-\u0437\u043d\u0430\u0447\u043d\u044b\u0439 \u043a\u043e\u0434 2FA.', 'danger');
      return;
    }
    if (submit) submit.disabled = true;
    setStatus('\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0432\u0442\u043e\u0440\u043e\u0439 \u0444\u0430\u043a\u0442\u043e\u0440...', '');
    pending.authClient.auth.mfa.verify({
      factorId: pending.factorId,
      challengeId: pending.challengeId,
      code: code
    })
      .then(function (result) {
        if (result && result.error) throw result.error;
        return pending.authClient.auth.getSession()
          .then(function (sessionResult) {
            return (sessionResult && sessionResult.data && sessionResult.data.session)
              || (result && result.data && result.data.session)
              || pending.session;
          });
      })
      .then(function (session) {
        currentSession = session;
        window.__ALTEA_AUTH_SESSION__ = session;
        pendingMfaChallenge = null;
        setMfaMode(false);
        return minimumResponseDelay(startedAt).then(function () {
          setStatus('\u0412\u0445\u043e\u0434 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d.', 'ok');
          emitSecurityAudit('mfa_verified', {
            outcome: 'ok',
            severity: 'notice',
            actorEmail: pending.email,
            actorRole: accessRoleText(pending.access),
            targetType: 'portal',
            targetName: 'auth-gate',
            metadata: accessAuditMetadata(pending.access, { method: 'totp' })
          });
          emitSecurityAudit('login_success', {
            outcome: 'ok',
            severity: 'info',
            actorEmail: pending.email,
            actorRole: accessRoleText(pending.access),
            targetType: 'portal',
            targetName: 'auth-gate',
            metadata: accessAuditMetadata(pending.access, { method: 'email_password_totp' })
          });
          loginFlowActive = false;
          resolveAuth(session);
        });
      })
      .catch(function (error) {
        emitSecurityAudit('mfa_failed', {
          outcome: 'failure',
          severity: 'warning',
          actorEmail: pending.email,
          actorRole: accessRoleText(pending.access),
          targetType: 'portal',
          targetName: 'auth-gate',
          metadata: accessAuditMetadata(pending.access, { method: 'totp', reason: error && error.message ? error.message : 'verify_failed' })
        });
        setStatus('\u041a\u043e\u0434 2FA \u043d\u0435 \u043f\u043e\u0434\u043e\u0448\u0435\u043b. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043a\u043e\u0434 \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435.', 'danger');
        if (node) {
          node.value = '';
          node.focus();
        }
        if (submit) submit.disabled = false;
      });
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
      var settled = false;
      var timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        placeholder.setAttribute('data-auth-timeout', '1');
        if (window.console && window.console.warn) window.console.warn('[portal-auth:scripts] delayed script timeout', src);
        resolve();
      }, DELAYED_SCRIPT_TIMEOUT_MS);
      function done(attr) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        placeholder.setAttribute(attr, '1');
        resolve();
      }
      script.src = src;
      script.async = false;
      copyScriptAttrs(placeholder, script);
      script.onload = function () {
        done('data-auth-loaded');
      };
      script.onerror = function () {
        if (window.console && window.console.warn) window.console.warn('[portal-auth:scripts] delayed script failed');
        done('data-auth-error');
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

  function isStrongNewPassword(password) {
    var groups = 0;
    if (/[a-z\u0430-\u044f\u0451]/.test(password)) groups += 1;
    if (/[A-Z\u0410-\u042f\u0401]/.test(password)) groups += 1;
    if (/[0-9]/.test(password)) groups += 1;
    if (/[^A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u04510-9]/.test(password)) groups += 1;
    return password.length >= 12 && password.length <= MAX_PASSWORD_LENGTH && groups >= 3 && !hasControlChars(password);
  }

  function handlePasswordSetup(event) {
    var form = event.currentTarget;
    var passwordInput = form.elements.password;
    var confirmInput = form.elements.passwordConfirm;
    var password = String((passwordInput && passwordInput.value) || '');
    var confirmation = String((confirmInput && confirmInput.value) || '');
    var completedSession = null;

    event.preventDefault();
    if (!passwordSetupFlow) return;
    if (!isStrongNewPassword(password)) {
      setStatus('\u041f\u0430\u0440\u043e\u043b\u044c: \u043c\u0438\u043d\u0438\u043c\u0443\u043c 12 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432 \u0438 \u043d\u0435 \u043c\u0435\u043d\u0435\u0435 \u0442\u0440\u0451\u0445 \u0442\u0438\u043f\u043e\u0432: \u0441\u0442\u0440\u043e\u0447\u043d\u044b\u0435, \u0437\u0430\u0433\u043b\u0430\u0432\u043d\u044b\u0435, \u0446\u0438\u0444\u0440\u044b, \u0437\u043d\u0430\u043a\u0438.', 'danger');
      return;
    }
    if (password !== confirmation) {
      setStatus('\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442. \u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u0432\u0432\u043e\u0434.', 'danger');
      return;
    }

    lockSubmit(true);
    setStatus('\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c \u043f\u0430\u0440\u043e\u043b\u044c...', '');
    getClient()
      .then(function (authClient) {
        return authClient.auth.getSession().then(function (result) {
          var session = result && result.data && result.data.session;
          if (!session || !session.access_token) throw new Error('invite-session-missing');
          applySession(session);
          return withTimeout(
            authClient.auth.updateUser({ password: password }),
            LOGIN_REQUEST_TIMEOUT_MS,
            'password-timeout'
          );
        }).then(function (result) {
          if (result && result.error) throw new Error(result.error.message || 'password-update-failed');
          return authClient.auth.getSession();
        });
      })
      .then(function (result) {
        completedSession = result && result.data && result.data.session;
        if (!completedSession || !completedSession.access_token) throw new Error('password-session-missing');
        if (!resolveAccessForSession(completedSession).allowedViews.length) throw new Error('access-denied');
        passwordSetupFlow = '';
        try {
          window.history.replaceState(null, '', window.location.pathname + window.location.search + '#designers');
        } catch (_) {}
        if (passwordInput) passwordInput.value = '';
        if (confirmInput) confirmInput.value = '';
        setStatus('\u041f\u0430\u0440\u043e\u043b\u044c \u0441\u043e\u0437\u0434\u0430\u043d. \u041e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u043c \u0440\u0430\u0437\u0434\u0435\u043b \u00ab\u0414\u0438\u0437\u0430\u0439\u043d\u0435\u0440\u044b\u00bb...', 'ok');
        emitSecurityAudit('password_setup_completed', {
          outcome: 'ok',
          severity: 'info',
          actorEmail: normalizeEmail(completedSession.user && completedSession.user.email),
          targetType: 'portal',
          targetName: 'auth-gate',
          metadata: { method: 'invite_or_recovery' }
        });
        resolveAuth(completedSession);
      })
      .catch(function (error) {
        if (window.console && window.console.warn) window.console.warn('[portal-auth] password setup failed');
        setStatus(error && error.message === 'invite-session-missing'
          ? '\u0421\u0441\u044b\u043b\u043a\u0430 \u0443\u0441\u0442\u0430\u0440\u0435\u043b\u0430 \u0438\u043b\u0438 \u0443\u0436\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0430. \u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u0435 \u0443 \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430 \u043d\u043e\u0432\u043e\u0435 \u043f\u0438\u0441\u044c\u043c\u043e.'
          : (error && error.message === 'access-denied'
            ? ACCESS_DENIED_ERROR
            : '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0441\u0435\u0442\u044c \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435.'), 'danger');
        lockSubmit(false);
      });
  }

  function handleLogin(event) {
    var form;
    var submit;
    var password;
    var credentials;
    var startedAt;
    var failedAsAuth = false;
    var accessDeniedLogged = false;
    var guestLogin = false;

    event.preventDefault();
    if (updateThrottleUi()) return;
    if (!hasStrongTransport()) {
      if (redirectToStrongTransport()) {
        setStatus('\u041f\u0435\u0440\u0435\u043d\u0430\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c \u043d\u0430 \u0437\u0430\u0449\u0438\u0449\u0435\u043d\u043d\u0443\u044e \u0432\u0435\u0440\u0441\u0438\u044e \u043f\u043e\u0440\u0442\u0430\u043b\u0430...', '');
        lockSubmit(true);
        return;
      }
      setStatus('\u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u044b\u0439 \u0432\u0445\u043e\u0434 \u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u043f\u043e \u0430\u0434\u0440\u0435\u0441\u0443 https://\u0445\u0430\u0440\u0438\u0437\u043c\u043e\u0439.\u0440\u0444.', 'danger');
      lockSubmit(true);
      return;
    }

    form = event.currentTarget;
    submit = document.getElementById('portalAuthSubmit');
    password = document.getElementById('portalAuthPassword');
    startedAt = now();

    if (pendingMfaChallenge) {
      verifyPendingMfa(form, submit, startedAt);
      return;
    }

    credentials = readCredentials(form);
    if (!credentials) {
      setStatus('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 email \u0438 \u043f\u0430\u0440\u043e\u043b\u044c.', 'danger');
      return;
    }
    if (credentials.trapped) {
      emitSecurityAudit('login_trapped', {
        outcome: 'failure',
        severity: 'warning',
        targetType: 'portal',
        targetName: 'auth-gate',
        metadata: { reason: 'honeypot' }
      });
      lockSubmit(true);
      delay(LOGIN_MIN_RESPONSE_MS + LOGIN_JITTER_MS).then(function () {
        setStatus(GENERIC_LOGIN_ERROR, 'danger');
        lockSubmit(false);
      });
      return;
    }
    guestLogin = isGuestCredentials(credentials);

    if (submit) submit.disabled = true;
    loginFlowActive = true;
    setStatus('\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0434\u043e\u0441\u0442\u0443\u043f...', '');

    getClient()
      .then(function (authClient) {
        if (guestLogin) return signInGuest(authClient);
        return withTimeout(
          authClient.auth.signInWithPassword({ email: credentials.email, password: credentials.password }),
          LOGIN_REQUEST_TIMEOUT_MS,
          'auth-timeout'
        );
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
        currentSession = session;
        window.__ALTEA_AUTH_SESSION__ = session;
        access = resolveAccessForSession(session);
        if (!access.allowedViews.length) {
          accessDeniedLogged = true;
          emitSecurityAudit('access_denied', {
            outcome: 'denied',
            severity: 'warning',
            actorEmail: access.email || credentials.email,
            actorRole: accessRoleText(access),
            targetType: 'portal',
            targetName: 'auth-gate',
            metadata: accessAuditMetadata(access, { reason: 'no_allowed_views' })
          });
          return getClient()
            .then(function (authClient) { return authClient.auth.signOut(); })
            .catch(function () {})
            .then(function () {
              clearSessionState();
              throw new Error('access-denied');
            });
        }
        if (guestLogin) {
          return minimumResponseDelay(startedAt).then(function () {
            setStatus('\u0412\u0445\u043e\u0434 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d.', 'ok');
            emitSecurityAudit('login_success', {
              outcome: 'ok',
              severity: 'info',
              actorEmail: access.email || credentials.email,
              actorRole: accessRoleText(access),
              targetType: 'portal',
              targetName: 'auth-gate',
              metadata: accessAuditMetadata(access, { method: 'guest_password' })
            });
            loginFlowActive = false;
            resolveAuth(session);
          });
        }
        return getClient()
          .then(function (authClient) {
            return maybeStartMfaChallenge(authClient, session, access, credentials);
          })
          .then(function (mfaState) {
            if (mfaState && mfaState.pending) {
              return minimumResponseDelay(startedAt).then(function () {
                if (password) password.value = '';
                if (submit) submit.disabled = false;
              });
            }
            return minimumResponseDelay(startedAt).then(function () {
              setStatus('\u0412\u0445\u043e\u0434 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d.', 'ok');
              emitSecurityAudit('login_success', {
                outcome: 'ok',
                severity: 'info',
                actorEmail: access.email || credentials.email,
                actorRole: accessRoleText(access),
                targetType: 'portal',
                targetName: 'auth-gate',
                metadata: accessAuditMetadata(access, { method: 'email_password' })
              });
              loginFlowActive = false;
              resolveAuth(session);
            });
          });
      })
      .catch(function (error) {
        return minimumResponseDelay(startedAt).then(function () {
          var isAccessDenied = error && error.message === 'access-denied';
          var isAuthTimeout = error && error.message === 'auth-timeout';
          if (failedAsAuth) registerFailure();
          if (failedAsAuth) {
            emitSecurityAudit('login_failed', {
              outcome: 'failure',
              severity: 'warning',
              actorEmail: credentials && credentials.email,
              targetType: 'portal',
              targetName: 'auth-gate',
              metadata: { method: 'email_password', reason: 'auth_failed' }
            });
          } else if (isAccessDenied && !accessDeniedLogged) {
            emitSecurityAudit('access_denied', {
              outcome: 'denied',
              severity: 'warning',
              actorEmail: credentials && credentials.email,
              targetType: 'portal',
              targetName: 'auth-gate',
              metadata: { method: 'email_password', reason: 'allowlist_or_role_denied' }
            });
          } else if (!isAccessDenied) {
            emitSecurityAudit('login_error', {
              outcome: 'failure',
              severity: 'error',
              actorEmail: credentials && credentials.email,
              targetType: 'portal',
              targetName: 'auth-gate',
              metadata: { method: 'email_password', reason: error && error.message ? error.message : 'unknown' }
            });
            if (currentSession) {
              getClient().then(function (authClient) {
                return authClient.auth.signOut();
              }).catch(function () {});
              clearSessionState();
              pendingMfaChallenge = null;
              setMfaMode(false);
            }
          }
          if (!pendingMfaChallenge) loginFlowActive = false;
          if (window.console && window.console.warn) window.console.warn('[portal-auth] login check failed');
          setStatus(failedAsAuth ? GENERIC_LOGIN_ERROR : (isAccessDenied ? ACCESS_DENIED_ERROR : (isAuthTimeout ? '\u0421\u0435\u0440\u0432\u0435\u0440 \u0432\u0445\u043e\u0434\u0430 \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b \u0437\u0430 15 \u0441\u0435\u043a\u0443\u043d\u0434. \u041a\u043d\u043e\u043f\u043a\u0430 \u0441\u043d\u043e\u0432\u0430 \u0430\u043a\u0442\u0438\u0432\u043d\u0430 \u2014 \u043f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442 \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435.' : '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0434\u043e\u0441\u0442\u0443\u043f. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0441\u0435\u0442\u044c \u0438 Supabase.')), 'danger');
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
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session && session.access_token) {
        if (passwordSetupFlow) {
          applySession(session);
          setStatus('\u041f\u0440\u0438\u0434\u0443\u043c\u0430\u0439\u0442\u0435 \u0438 \u0434\u0432\u0430\u0436\u0434\u044b \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c.', '');
          return;
        }
        if (loginFlowActive || pendingMfaChallenge) {
          applySession(session);
          return;
        }
        resolveAuth(session);
      }
      if (event === 'TOKEN_REFRESHED' && session && session.access_token) applySession(session);
      if (event === 'SIGNED_OUT' && currentSession) {
        clearSessionState();
        document.body.classList.add('portal-auth-locked');
        window.location.reload();
      }
    });
  }

  function signOut() {
    var access = currentAccess || window.__ALTEA_PORTAL_ACCESS__ || {};
    emitSecurityAudit('logout', {
      outcome: 'ok',
      severity: 'info',
      actorEmail: access.email || '',
      actorRole: accessRoleText(access),
      targetType: 'portal',
      targetName: 'auth-gate',
      metadata: accessAuditMetadata(access, { method: 'manual' })
    });
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
    if (redirectToStrongTransport()) return Promise.resolve(null);
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
          var access;
          if (session && session.access_token) {
            currentSession = session;
            window.__ALTEA_AUTH_SESSION__ = session;
            access = resolveAccessForSession(session);
            if (!access.allowedViews.length) {
              emitSecurityAudit('access_denied', {
                outcome: 'denied',
                severity: 'warning',
                actorEmail: access.email || '',
                actorRole: accessRoleText(access),
                targetType: 'portal',
                targetName: 'auth-gate',
                metadata: accessAuditMetadata(access, { reason: 'restored_session_denied' })
              });
              setStatus(ACCESS_DENIED_ERROR, 'danger');
              return authClient.auth.signOut().catch(function () {});
            }
            if (passwordSetupFlow) {
              applySession(session);
              setStatus('\u041f\u0440\u0438\u0434\u0443\u043c\u0430\u0439\u0442\u0435 \u0438 \u0434\u0432\u0430\u0436\u0434\u044b \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c.', '');
              return;
            }
            emitSecurityAudit('session_restored', {
              outcome: 'ok',
              severity: 'info',
              actorEmail: access.email || '',
              actorRole: accessRoleText(access),
              targetType: 'portal',
              targetName: 'auth-gate',
              metadata: accessAuditMetadata(access, { method: 'stored_session' })
            });
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
