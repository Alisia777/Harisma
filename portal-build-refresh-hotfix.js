(function portalBuildRefreshHotfix() {
  'use strict';

  if (window.__ALTEA_BUILD_REFRESH_HOTFIX__) return;
  window.__ALTEA_BUILD_REFRESH_HOTFIX__ = true;

  var currentBuild = String(window.__ALTEA_PORTAL_BUILD__ || '').trim();
  var bannerId = 'altea-build-refresh-banner';
  var checkInFlight = false;
  var closedForBuild = '';

  function parseBuild(html) {
    var match = String(html || '').match(/__ALTEA_PORTAL_BUILD__\s*=\s*['"]([^'"]+)['"]/);
    return match ? String(match[1] || '').trim() : '';
  }

  function setText(node, text) {
    node.textContent = text;
    return node;
  }

  function showRefreshBanner(remoteBuild) {
    if (!remoteBuild || remoteBuild === closedForBuild || document.getElementById(bannerId)) return;

    var wrap = document.createElement('div');
    wrap.id = bannerId;
    wrap.setAttribute('role', 'status');
    wrap.style.cssText = [
      'position:fixed',
      'top:14px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'gap:12px',
      'max-width:min(720px,calc(100vw - 28px))',
      'padding:10px 12px',
      'border:1px solid rgba(226,197,137,.55)',
      'border-radius:12px',
      'background:linear-gradient(135deg,rgba(28,20,13,.98),rgba(62,43,23,.98))',
      'color:#f8edd4',
      'box-shadow:0 16px 44px rgba(0,0,0,.45)',
      'font:600 13px/1.35 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'letter-spacing:0'
    ].join(';');

    var text = document.createElement('div');
    text.style.cssText = 'min-width:0;flex:1';
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:800;color:#fff6dd';
    setText(title, '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u0430 \u043d\u043e\u0432\u0430\u044f \u0441\u0431\u043e\u0440\u043a\u0430 \u043f\u043e\u0440\u0442\u0430\u043b\u0430');
    var note = document.createElement('div');
    note.style.cssText = 'margin-top:2px;color:rgba(248,237,212,.78);font-size:12px;font-weight:500';
    setText(note, currentBuild + ' -> ' + remoteBuild);
    text.appendChild(title);
    text.appendChild(note);

    var refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.style.cssText = [
      'border:1px solid rgba(244,210,143,.7)',
      'border-radius:999px',
      'background:linear-gradient(180deg,#f7ddb0,#b77d3b)',
      'color:#190f08',
      'font:800 12px/1 Inter,system-ui,sans-serif',
      'padding:9px 12px',
      'cursor:pointer',
      'white-space:nowrap'
    ].join(';');
    setText(refresh, '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c');
    refresh.addEventListener('click', function () {
      var nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('portal-refresh', String(Date.now()));
      window.location.replace(nextUrl.toString());
    });

    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.style.cssText = [
      'width:28px',
      'height:28px',
      'border:1px solid rgba(248,237,212,.24)',
      'border-radius:999px',
      'background:rgba(255,255,255,.06)',
      'color:#f8edd4',
      'font:700 18px/1 Inter,system-ui,sans-serif',
      'cursor:pointer'
    ].join(';');
    setText(close, '\u00d7');
    close.addEventListener('click', function () {
      closedForBuild = remoteBuild;
      wrap.remove();
    });

    wrap.appendChild(text);
    wrap.appendChild(refresh);
    wrap.appendChild(close);
    document.body.appendChild(wrap);
  }

  async function checkBuild() {
    if (checkInFlight || !currentBuild || typeof fetch !== 'function') return;
    checkInFlight = true;
    try {
      var url = new URL('index.html', window.location.href);
      url.searchParams.set('build-check', String(Date.now()));
      var response = await fetch(url.toString(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) return;
      var remoteBuild = parseBuild(await response.text());
      if (remoteBuild && remoteBuild !== currentBuild) {
        showRefreshBanner(remoteBuild);
      }
    } catch (error) {
      if (window.console && console.debug) console.debug('[build-refresh] skipped', error);
    } finally {
      checkInFlight = false;
    }
  }

  window.addEventListener('focus', checkBuild, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) checkBuild();
  });

  window.setTimeout(checkBuild, 5000);
  window.setInterval(checkBuild, 120000);
})();
