(function () {
  if (window.__ALTEA_TEAM_RECONNECT_HOTFIX_20260420B__) return;
  window.__ALTEA_TEAM_RECONNECT_HOTFIX_20260420B__ = true;

  let reconnectInFlight = false;
  let bootRecoveryInFlight = false;

  function fallbackSetView(view) {
    if (!view) return;
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach((section) => {
      section.classList.toggle('active', section.id === `view-${view}`);
    });
    if (typeof rerenderCurrentView === 'function') {
      try {
        rerenderCurrentView();
      } catch (error) {
        console.warn('[portal-team-reconnect-hotfix] nav rerender', error);
      }
    }
  }

  function openViewFromSidebar(view) {
    if (!view) return;
    if (typeof setView === 'function') {
      try {
        setView(view);
        return;
      } catch (error) {
        console.warn('[portal-team-reconnect-hotfix] setView', error);
      }
    }
    fallbackSetView(view);
  }

  function bindSidebarNavRescue() {
    if (document.body?.dataset.portalNavRescueBound === '1') return;
    if (!document.querySelector('.nav-btn[data-view]')) return;
    document.body.dataset.portalNavRescueBound = '1';
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.nav-btn[data-view]');
      if (!button) return;
      openViewFromSidebar(button.dataset.view);
    }, true);
  }

  function appState() {
    return typeof state === 'object' && state ? state : null;
  }

  function canUseRemote() {
    try {
      const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
      return Boolean(cfg?.teamMode === 'supabase' && cfg?.supabase?.url && cfg?.supabase?.anonKey);
    } catch {
      return false;
    }
  }

  function shouldReconnect() {
    const app = appState();
    if (!app?.team || !app?.boot) return false;
    if (!canUseRemote()) return false;
    if (!app.boot.dataReady) return false;
    if (app.team.mode === 'ready') return false;
    if (app.team.mode === 'pending' && !app.team.error && (app.team.accessToken || app.team.client)) return false;
    return true;
  }

  async function retryTeam(reason = '') {
    const app = appState();
    if (!app?.team || reconnectInFlight || !shouldReconnect()) return;
    reconnectInFlight = true;
    try {
      app.team.error = '';
      app.team.mode = 'pending';
      app.team.note = reason || 'Повторно подключаем командную базу…';
      if (typeof updateSyncBadge === 'function') updateSyncBadge();

      if ((app.team.accessToken || app.team.client) && typeof pullRemoteState === 'function') {
        await pullRemoteState(true);
      } else if (typeof initTeamStore === 'function') {
        await initTeamStore();
        if (app.boot.dataReady && typeof rerenderCurrentView === 'function') {
          rerenderCurrentView();
          if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
        }
      }
    } catch (error) {
      console.warn('[portal-team-reconnect-hotfix] reconnect', error);
    } finally {
      reconnectInFlight = false;
    }
  }

  function cloneFallback(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function isLooseJsonTokenBoundary(char) {
    return char === undefined || /[\s,\]\[}{:]/.test(char);
  }

  function sanitizeLooseJsonHotfix(text) {
    if (!text || typeof text !== 'string') return text;
    const replacements = [
      ['-Infinity', 'null'],
      ['Infinity', 'null'],
      ['NaN', 'null'],
      ['undefined', 'null']
    ];
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        result += char;
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        result += char;
        continue;
      }
      let matched = false;
      for (const [token, replacement] of replacements) {
        if (
          text.startsWith(token, i) &&
          isLooseJsonTokenBoundary(text[i - 1]) &&
          isLooseJsonTokenBoundary(text[i + token.length])
        ) {
          result += replacement;
          i += token.length - 1;
          matched = true;
          break;
        }
      }
      if (!matched) result += char;
    }

    return result;
  }

  async function safeLoadJson(path, fallback) {
    try {
      const resolved = path.includes('?') ? path : `${path}?v=20260420b`;
      const response = await fetch(resolved, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (error) {
        const sanitized = sanitizeLooseJsonHotfix(text);
        if (sanitized === text) throw error;
        return JSON.parse(sanitized);
      }
    } catch (error) {
      console.warn('[portal-team-reconnect-hotfix] loadJson', path, error);
      return cloneFallback(fallback);
    }
  }

  async function rescueBootData(reason = '') {
    const app = appState();
    if (!app?.boot || bootRecoveryInFlight || app.boot.dataReady) return false;
    bootRecoveryInFlight = true;
    try {
      const local = typeof loadLocalStorage === 'function'
        ? loadLocalStorage()
        : { comments: [], tasks: [], decisions: [], ownerOverrides: [] };
      const [
        dashboard,
        skus,
        launches,
        meetings,
        documents,
        repricer,
        seed
      ] = await Promise.all([
        safeLoadJson('data/dashboard.json', { cards: [], generatedAt: '' }),
        safeLoadJson('data/skus.json', []),
        safeLoadJson('data/launches.json', []),
        safeLoadJson('data/meetings.json', []),
        safeLoadJson('data/documents.json', { groups: [] }),
        safeLoadJson('data/repricer.json', { generatedAt: '', summary: {}, rows: [] }),
        safeLoadJson('data/seed_comments.json', { comments: [], tasks: [] })
      ]);

      app.dashboard = dashboard || { cards: [] };
      app.skus = Array.isArray(skus) ? skus : [];
      app.launches = Array.isArray(launches) ? launches : [];
      app.meetings = Array.isArray(meetings) ? meetings : [];
      app.documents = documents || { groups: [] };
      app.repricer = repricer || { generatedAt: '', summary: {}, rows: [] };
      app.storage = {
        comments: Array.isArray(local.comments) ? local.comments : [],
        tasks: Array.isArray(local.tasks) ? local.tasks : [],
        decisions: Array.isArray(local.decisions) ? local.decisions : [],
        ownerOverrides: Array.isArray(local.ownerOverrides) ? local.ownerOverrides : []
      };

      if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
      if (typeof mergeSeedStorage === 'function') mergeSeedStorage(seed || {});
      if (!app.orderCalc.articleKey) app.orderCalc.articleKey = app.skus[0]?.articleKey || '';
      if (!app.orderCalc.daysToNextReceipt && typeof numberOrZero === 'function') {
        app.orderCalc.daysToNextReceipt = String(Math.round(numberOrZero(app.skus[0]?.leadTimeDays) || 30));
      }

      if (!Array.isArray(app.boot.dataWarnings)) app.boot.dataWarnings = [];
      if (reason && !app.boot.dataWarnings.includes(reason)) app.boot.dataWarnings.push(reason);
      app.boot.dataReady = true;

      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      if (app.activeView === 'dashboard' && typeof renderDashboard === 'function') {
        try {
          renderDashboard();
        } catch (error) {
          console.warn('[portal-team-reconnect-hotfix] dashboard render', error);
        }
      }
      if (app.activeSku && typeof renderSkuModal === 'function') renderSkuModal(app.activeSku);
      window.dispatchEvent(new Event('resize'));
      window.setTimeout(() => {
        if (typeof rerenderCurrentView === 'function') {
          try {
            rerenderCurrentView();
          } catch (error) {
            console.warn('[portal-team-reconnect-hotfix] rerender after recovery', error);
          }
        }
      }, 160);
      if (typeof updateSyncBadge === 'function') updateSyncBadge();
      return true;
    } catch (error) {
      console.warn('[portal-team-reconnect-hotfix] boot recovery', error);
      return false;
    } finally {
      bootRecoveryInFlight = false;
    }
  }

  async function ensureBootAndReconnect(reason = '') {
    const app = appState();
    if (!app?.boot) return;
    if (!app.boot.dataReady) {
      const recovered = await rescueBootData(reason || 'recovery');
      if (!recovered) return;
    }
    await retryTeam(reason || 'Повторно загружаем командные данные…');
  }

  [2500, 7000, 14000, 24000, 36000].forEach((delay, index) => {
    window.setTimeout(() => {
      ensureBootAndReconnect(index === 0 ? 'Восстанавливаем экран и командные данные…' : 'Повторно загружаем командные данные…');
    }, delay);
  });

  bindSidebarNavRescue();
  [600, 2200, 6000].forEach((delay) => {
    window.setTimeout(bindSidebarNavRescue, delay);
  });
})();
