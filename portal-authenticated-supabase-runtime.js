(function () {
  'use strict';

  if (window.__ALTEA_AUTHENTICATED_SUPABASE_RUNTIME__) return;
  window.__ALTEA_AUTHENTICATED_SUPABASE_RUNTIME__ = true;

  var originalFetch = window.fetch && window.fetch.bind(window);
  if (!originalFetch) return;

  var PRIVATE_BUCKET = 'portal-task-files';
  var DEFAULT_SIGNED_URL_TTL = 10 * 60;
  var PUBLIC_STORAGE_MARKER = '/storage/v1/object/public/';
  var signedUrlCache = Object.create(null);
  var observer = null;

  function session() {
    try {
      if (window.alteaPortalAuthGate && typeof window.alteaPortalAuthGate.getSession === 'function') {
        var current = window.alteaPortalAuthGate.getSession();
        if (current && current.access_token) return current;
      }
    } catch (_) {}
    return window.__ALTEA_AUTH_SESSION__ || null;
  }

  function remoteConfig() {
    var cfg = window.__ALTEA_AUTH_REMOTE_CONFIG__ || window.APP_CONFIG || {};
    var supabase = cfg.supabase || {};
    return {
      baseUrl: String(supabase.url || 'https://iyckwryrucqrxwlowxow.supabase.co').replace(/\/+$/, ''),
      anonKey: String(supabase.anonKey || 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw')
    };
  }

  function accessToken() {
    var current = session();
    var cfg = remoteConfig();
    var token = String((current && current.access_token) || '').trim();
    if (!token || token === cfg.anonKey || token === 'guest-local-session') return '';
    return token;
  }

  function requestUrl(input) {
    try {
      if (typeof input === 'string') return input;
      if (input && typeof input.url === 'string') return input.url;
      return String(input || '');
    } catch (_) {
      return '';
    }
  }

  function shouldUseAuthenticatedToken(rawUrl) {
    var cfg = remoteConfig();
    try {
      var url = new URL(String(rawUrl || ''), window.location.href);
      var project = new URL(cfg.baseUrl);
      if (url.origin !== project.origin) return false;
      return url.pathname.indexOf('/rest/v1/') === 0
        || url.pathname.indexOf('/storage/v1/object/') === 0;
    } catch (_) {
      return false;
    }
  }

  function authenticatedHeaders(sourceHeaders) {
    var cfg = remoteConfig();
    var token = accessToken();
    var headers = new Headers(sourceHeaders || {});
    if (cfg.anonKey && !headers.has('apikey')) headers.set('apikey', cfg.anonKey);
    if (token) headers.set('Authorization', 'Bearer ' + token);
    return headers;
  }

  window.fetch = function authenticatedSupabaseFetch(input, init) {
    var rawUrl = requestUrl(input);
    var options = init || {};
    if (!shouldUseAuthenticatedToken(rawUrl)) return originalFetch(input, init);

    var inheritedHeaders = options.headers;
    if (!inheritedHeaders && typeof Request === 'function' && input instanceof Request) {
      inheritedHeaders = input.headers;
    }
    var nextOptions = Object.assign({}, options, {
      headers: authenticatedHeaders(inheritedHeaders)
    });

    if (typeof Request === 'function' && input instanceof Request) {
      try {
        return originalFetch(new Request(input, nextOptions));
      } catch (_) {}
    }
    return originalFetch(input, nextOptions);
  };

  function encodeObjectPath(path) {
    return String(path || '')
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
  }

  function normalizeSignedUrl(baseUrl, value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return baseUrl + (raw.charAt(0) === '/' ? raw : '/' + raw);
  }

  async function createSignedUrl(bucket, objectPath, expiresIn) {
    var cfg = remoteConfig();
    var token = accessToken();
    var cleanBucket = String(bucket || PRIVATE_BUCKET).trim();
    var cleanPath = String(objectPath || '').replace(/^\/+/, '').trim();
    var ttl = Math.max(60, Math.min(Number(expiresIn || DEFAULT_SIGNED_URL_TTL), 3600));
    if (!token) throw new Error('Для файла нужна активная корпоративная сессия.');
    if (!cleanBucket || !cleanPath) throw new Error('Не указан путь к закрытому файлу.');

    var cacheKey = cleanBucket + '|' + cleanPath + '|' + ttl;
    var cached = signedUrlCache[cacheKey];
    if (cached && cached.expiresAt > Date.now() + 30000) return cached.url;

    var endpoint = cfg.baseUrl
      + '/storage/v1/object/sign/'
      + encodeURIComponent(cleanBucket)
      + '/'
      + encodeObjectPath(cleanPath);
    var response = await originalFetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ expiresIn: ttl })
    });
    var text = await response.text();
    var payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) {
      throw new Error('Не удалось подписать закрытый файл: ' + (payload.message || payload.error || text || response.status));
    }
    var signed = normalizeSignedUrl(
      cfg.baseUrl,
      payload.signedURL || payload.signedUrl || payload.signed_url || payload.url
    );
    if (!signed) throw new Error('Supabase не вернул signed URL.');
    signedUrlCache[cacheKey] = {
      url: signed,
      expiresAt: Date.now() + ttl * 1000
    };
    return signed;
  }

  function parsePrivateStorageUrl(rawUrl) {
    var cfg = remoteConfig();
    try {
      var url = new URL(String(rawUrl || ''), window.location.href);
      var project = new URL(cfg.baseUrl);
      if (url.origin !== project.origin) return null;
      var index = url.pathname.indexOf(PUBLIC_STORAGE_MARKER);
      if (index < 0) return null;
      var tail = url.pathname.slice(index + PUBLIC_STORAGE_MARKER.length);
      var parts = tail.split('/').filter(Boolean).map(function (part) {
        try { return decodeURIComponent(part); } catch (_) { return part; }
      });
      if (parts.length < 2) return null;
      return { bucket: parts.shift(), objectPath: parts.join('/') };
    } catch (_) {
      return null;
    }
  }

  async function signLegacyPublicUrl(rawUrl, expiresIn) {
    var parsed = parsePrivateStorageUrl(rawUrl);
    if (!parsed || parsed.bucket !== PRIVATE_BUCKET) return String(rawUrl || '');
    return createSignedUrl(parsed.bucket, parsed.objectPath, expiresIn);
  }

  function bindPrivateAnchor(anchor) {
    if (!anchor || anchor.dataset.alteaPrivateStorageBound === '1') return;
    var parsed = parsePrivateStorageUrl(anchor.getAttribute('href'));
    if (!parsed || parsed.bucket !== PRIVATE_BUCKET) return;
    anchor.dataset.alteaPrivateStorageBound = '1';
    anchor.dataset.alteaPrivateStorageHref = anchor.getAttribute('href') || '';
    anchor.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var source = anchor.dataset.alteaPrivateStorageHref || anchor.getAttribute('href') || '';
      signLegacyPublicUrl(source, DEFAULT_SIGNED_URL_TTL)
        .then(function (signed) {
          var opened = window.open(signed, anchor.target === '_self' ? '_self' : '_blank', 'noopener');
          if (!opened && anchor.target === '_self') window.location.href = signed;
        })
        .catch(function (error) {
          console.warn('[private-storage] open failed', error);
          try {
            window.dispatchEvent(new CustomEvent('altea:private-storage-error', {
              detail: { message: error && error.message ? error.message : String(error) }
            }));
          } catch (_) {}
        });
    }, true);
  }

  function refreshPrivateMedia(node, attributeName) {
    if (!node || !node.getAttribute) return;
    var source = node.dataset.alteaPrivateStorageSource || node.getAttribute(attributeName) || '';
    var parsed = parsePrivateStorageUrl(source);
    if (!parsed || parsed.bucket !== PRIVATE_BUCKET) return;
    node.dataset.alteaPrivateStorageSource = source;
    if (node.dataset.alteaPrivateStorageLoading === '1') return;
    node.dataset.alteaPrivateStorageLoading = '1';
    signLegacyPublicUrl(source, DEFAULT_SIGNED_URL_TTL)
      .then(function (signed) {
        node.setAttribute(attributeName, signed);
        node.dataset.alteaPrivateStorageReady = '1';
      })
      .catch(function (error) {
        console.warn('[private-storage] media failed', error);
      })
      .finally(function () {
        delete node.dataset.alteaPrivateStorageLoading;
      });
  }

  function refreshPrivateStyle(node) {
    if (!node || !node.getAttribute) return;
    var style = node.getAttribute('style') || '';
    var match = style.match(/url\(["']?([^"')]+\/storage\/v1\/object\/public\/portal-task-files\/[^"')]+)["']?\)/i);
    if (!match) return;
    var source = node.dataset.alteaPrivateStorageStyleSource || match[1];
    node.dataset.alteaPrivateStorageStyleSource = source;
    if (node.dataset.alteaPrivateStorageStyleLoading === '1') return;
    node.dataset.alteaPrivateStorageStyleLoading = '1';
    signLegacyPublicUrl(source, DEFAULT_SIGNED_URL_TTL)
      .then(function (signed) {
        node.setAttribute('style', style.replace(match[1], signed));
      })
      .catch(function (error) {
        console.warn('[private-storage] background failed', error);
      })
      .finally(function () {
        delete node.dataset.alteaPrivateStorageStyleLoading;
      });
  }

  function scan(root) {
    var scope = root && root.querySelectorAll ? root : document;
    if (root && root.matches) {
      if (root.matches('a[href]')) bindPrivateAnchor(root);
      if (root.matches('img[src], source[src], video[poster]')) {
        refreshPrivateMedia(root, root.matches('video[poster]') ? 'poster' : 'src');
      }
      if (root.hasAttribute('style')) refreshPrivateStyle(root);
    }
    scope.querySelectorAll('a[href*="/storage/v1/object/public/portal-task-files/"]').forEach(bindPrivateAnchor);
    scope.querySelectorAll('img[src*="/storage/v1/object/public/portal-task-files/"], source[src*="/storage/v1/object/public/portal-task-files/"]').forEach(function (node) {
      refreshPrivateMedia(node, 'src');
    });
    scope.querySelectorAll('video[poster*="/storage/v1/object/public/portal-task-files/"]').forEach(function (node) {
      refreshPrivateMedia(node, 'poster');
    });
    scope.querySelectorAll('[style*="/storage/v1/object/public/portal-task-files/"]').forEach(refreshPrivateStyle);
  }

  function startObserver() {
    if (observer || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === 'attributes') scan(mutation.target);
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          if (node && node.nodeType === 1) scan(node);
        });
      });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'src', 'poster', 'style']
    });
  }

  window.alteaPrivateStorage = {
    bucket: PRIVATE_BUCKET,
    createSignedUrl: createSignedUrl,
    signLegacyPublicUrl: signLegacyPublicUrl,
    parseUrl: parsePrivateStorageUrl,
    scan: scan
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scan(document);
      startObserver();
    }, { once: true });
  } else {
    scan(document);
    startObserver();
  }
})();
