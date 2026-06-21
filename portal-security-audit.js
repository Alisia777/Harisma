(function () {
  'use strict';

  if (window.__ALTEA_SECURITY_AUDIT__) return;
  window.__ALTEA_SECURITY_AUDIT__ = true;

  var DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';
  var DEFAULT_SUPABASE_KEY = 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw';
  var DEFAULT_BRAND = '\u0410\u043b\u0442\u0435\u044f';
  var MAX_META_DEPTH = 4;
  var MAX_META_KEYS = 40;
  var MAX_META_STRING = 700;
  var TAB_ID = 'portal-tab-' + Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);

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

  function compactText(value, maxLength) {
    return String(value || '')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .slice(0, maxLength || 500);
  }

  function appConfig() {
    try {
      if (typeof currentConfig === 'function') return currentConfig();
    } catch (_) {}
    return window.APP_CONFIG || {};
  }

  function auditConfig() {
    var raw = appConfig() || {};
    var supabase = raw.supabase || {};
    var audit = raw.securityAudit || {};
    return {
      enabled: audit.enabled !== false,
      brand: compactText(raw.brand || DEFAULT_BRAND, 100) || DEFAULT_BRAND,
      supabaseUrl: compactText(audit.supabaseUrl || supabase.url || DEFAULT_SUPABASE_URL, 500),
      supabaseKey: compactText(audit.supabaseKey || supabase.anonKey || DEFAULT_SUPABASE_KEY, 1000)
    };
  }

  function currentSession() {
    try {
      if (window.alteaPortalAuthGate && window.alteaPortalAuthGate.getSession) {
        return window.alteaPortalAuthGate.getSession();
      }
    } catch (_) {}
    return window.__ALTEA_AUTH_SESSION__ || null;
  }

  function currentAccess() {
    try {
      if (window.alteaPortalAccess && window.alteaPortalAccess.get) return window.alteaPortalAccess.get();
    } catch (_) {}
    return window.__ALTEA_PORTAL_ACCESS__ || null;
  }

  function isSecretKey(key) {
    return /(password|passwd|token|secret|apikey|api_key|authorization|access[_-]?token|refresh[_-]?token|bearer)/i.test(String(key || ''));
  }

  function scrubMetadata(value, depth, keyName) {
    var output;
    var keys;
    var index;
    var key;

    if (isSecretKey(keyName)) return '[redacted]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return compactText(value, MAX_META_STRING);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth >= MAX_META_DEPTH) return '[truncated]';
    if (Object.prototype.toString.call(value) === '[object Array]') {
      output = [];
      for (index = 0; index < value.length && index < 25; index += 1) {
        output.push(scrubMetadata(value[index], depth + 1, keyName));
      }
      if (value.length > output.length) output.push('[truncated]');
      return output;
    }
    if (typeof value === 'object') {
      output = {};
      keys = Object.keys(value);
      for (index = 0; index < keys.length && index < MAX_META_KEYS; index += 1) {
        key = keys[index];
        output[compactText(key, 80)] = scrubMetadata(value[key], depth + 1, key);
      }
      if (keys.length > MAX_META_KEYS) output.truncatedKeys = keys.length - MAX_META_KEYS;
      return output;
    }
    return compactText(value, MAX_META_STRING);
  }

  function browserMetadata(extra) {
    return scrubMetadata(assign({
      path: window.location ? compactText(window.location.pathname || '/', 240) : '/',
      hash: window.location ? compactText(window.location.hash || '', 120) : '',
      referrer: document.referrer ? compactText(document.referrer, 500) : '',
      viewport: {
        width: window.innerWidth || 0,
        height: window.innerHeight || 0
      },
      tabId: TAB_ID
    }, extra || {}), 0, '');
  }

  function emit(eventType, payload) {
    var cfg = auditConfig();
    var session = currentSession();
    var access = currentAccess();
    var body;
    var token;
    var url;

    payload = payload || {};
    if (!cfg.enabled || !cfg.supabaseUrl || !cfg.supabaseKey || typeof fetch !== 'function') {
      return Promise.resolve({ skipped: true });
    }

    token = (session && session.access_token) || cfg.supabaseKey;
    url = cfg.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/rpc/portal_audit_write';
    body = {
      p_event_type: compactText(eventType, 80),
      p_outcome: compactText(payload.outcome || 'ok', 24),
      p_severity: compactText(payload.severity || 'info', 24),
      p_actor_email: compactText(payload.actorEmail || (access && access.email) || '', 254),
      p_actor_role: compactText(payload.actorRole || ((access && access.roles && access.roles.join(',')) || ''), 120),
      p_source: compactText(payload.source || 'portal-browser', 80),
      p_session_id: compactText(payload.sessionId || TAB_ID, 120),
      p_target_type: compactText(payload.targetType || '', 80),
      p_target_id: compactText(payload.targetId || '', 200),
      p_target_name: compactText(payload.targetName || '', 240),
      p_metadata: browserMetadata(assign({ brand: cfg.brand }, payload.metadata || {}))
    };

    return fetch(url, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseKey,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      keepalive: JSON.stringify(body).length < 60000
    }).then(function (response) {
      if (!response.ok && window.console && window.console.warn) {
        window.console.warn('[portal-security-audit] write failed: HTTP ' + response.status);
      }
      return { ok: response.ok, status: response.status };
    }).catch(function (error) {
      if (window.console && window.console.warn) window.console.warn('[portal-security-audit] write failed');
      return { ok: false, error: error && error.message ? error.message : String(error || '') };
    });
  }

  window.alteaSecurityAudit = {
    emit: emit,
    tabId: TAB_ID
  };
})();
