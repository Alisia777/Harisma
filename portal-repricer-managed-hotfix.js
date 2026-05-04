(function () {
  if (window.__ALTEA_REPRICER_MANAGED_HOTFIX_LOADER_20260502A__) return;
  window.__ALTEA_REPRICER_MANAGED_HOTFIX_LOADER_20260502A__ = true;
  window.__ALTEA_REPRICER_MANAGED_HOTFIX_LOADER_20260425C__ = true;

  const VERSION = '20260502a';
  const SNAPSHOT_TABLE = 'portal_data_snapshots';
  const SNAPSHOT_KEY = 'repricer_runtime_hotfix_20260424b';
  const LOCAL_RUNTIME_MANIFEST = `${SNAPSHOT_KEY}.json`;
  const RUNTIME_FETCH_TIMEOUT_MS = 4500;
  const FALLBACK_CONFIG = {
    brand: '\u0410\u043b\u0442\u0435\u044f',
    supabase: {
      url: 'https://iyckwryrucqrxwlowxow.supabase.co',
      anonKey: 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw'
    }
  };

  function cfg() {
    const raw = typeof currentConfig === 'function'
      ? (currentConfig() || {})
      : (window.APP_CONFIG || {});
    const rawSupabase = raw.supabase || {};
    return {
      ...FALLBACK_CONFIG,
      ...raw,
      supabase: {
        ...FALLBACK_CONFIG.supabase,
        ...rawSupabase,
        url: rawSupabase.url || FALLBACK_CONFIG.supabase.url,
        anonKey: rawSupabase.anonKey || FALLBACK_CONFIG.supabase.anonKey
      }
    };
  }

  function brand() {
    if (typeof currentBrand === 'function') return currentBrand();
    return cfg().brand || FALLBACK_CONFIG.brand;
  }

  function escapeFallbackHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function emergencyCard(title, message) {
    return `
      <div class="card">
        <div class="head">
          <div>
            <h3>${escapeFallbackHtml(title)}</h3>
            <div class="muted small">Emergency fallback is active</div>
          </div>
          <span class="badge badge-warn">recovery</span>
        </div>
        <div class="muted" style="margin-top:10px">${escapeFallbackHtml(message)}</div>
        <div class="muted small" style="margin-top:8px">The main production bundle did not load completely. Other sections stay available while the missing tail of the file is being restored.</div>
      </div>
    `;
  }

  function installFallbackRenderer(name, rootId, title, message) {
    if (typeof window[name] === 'function') return false;
    window[name] = function emergencyViewRenderer() {
      const root = document.getElementById(rootId);
      if (!root) return;
      root.innerHTML = emergencyCard(title, message);
    };
    return true;
  }

  function installAppErrorFallback() {
    if (typeof window.setAppError === 'function') return false;
    window.setAppError = function setAppErrorFallback(message = '') {
      const banner = document.getElementById('appError');
      if (!banner) return;
      if (!message) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
      }
      banner.textContent = String(message || '');
      banner.classList.remove('hidden');
    };
    return true;
  }

  function installSyncBadgeFallback() {
    if (typeof window.updateSyncBadge === 'function') return false;
    window.updateSyncBadge = function updateSyncBadgeFallback() {
      const badge = document.getElementById('syncStatusBadge');
      if (!badge) return;
      const errors = Array.isArray(window.state?.runtimeErrors) ? window.state.runtimeErrors : [];
      const runtimeSuffix = errors.length ? ' | emergency mode' : '';
      badge.className = `sync-status ${errors.length ? 'pending' : 'local'}`;
      badge.textContent = `${window.state?.team?.note || 'Local mode'}${runtimeSuffix}`;
    };
    return true;
  }

  function installViewFailureFallback() {
    if (typeof window.renderViewFailure === 'function') return false;
    window.renderViewFailure = function renderViewFailureFallback(rootId, title, error) {
      const root = document.getElementById(rootId);
      if (!root) return;
      root.innerHTML = emergencyCard(title, error?.message || 'This screen is temporarily unavailable');
    };
    return true;
  }

  function installOwnerOverrideFallback() {
    if (typeof window.applyOwnerOverridesToSkus === 'function') return false;
    window.applyOwnerOverridesToSkus = function applyOwnerOverridesToSkusFallback() {};
    return true;
  }

  function installRepricerSettingsFallbacks() {
    const installed = [];

    if (typeof window.defaultRepricerSettings !== 'function') {
      window.defaultRepricerSettings = function defaultRepricerSettingsFallback() {
        return {
          global: {
            minMarginPct: 15,
            defaultTargetDays: 30,
            launchTargetDays: 45,
            oosDays: 5,
            alignmentEnabled: true,
            deadbandPct: 3,
            deadbandRub: 50
          },
          brandRules: {
            '\u0410\u043b\u0442\u0435\u044f': { defaultTargetDays: 30, launchTargetDays: 45, oosDays: 5, minMarginPct: 15, alignmentEnabled: true },
            Altea: { defaultTargetDays: 30, launchTargetDays: 45, oosDays: 5, minMarginPct: 15, alignmentEnabled: true },
            Harly: { defaultTargetDays: 30, launchTargetDays: 45, oosDays: 5, minMarginPct: 15, alignmentEnabled: true },
            CPA: { defaultTargetDays: 30, launchTargetDays: 45, oosDays: 5, minMarginPct: 15, alignmentEnabled: true }
          },
          statusRules: {
            '\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u043e': { mode: 'auto', allowAutoprice: true, allowLaunch: false, allowAlignment: true },
            '\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439': { mode: 'auto', allowAutoprice: true, allowLaunch: false, allowAlignment: true },
            '\u041d\u043e\u0432\u0438\u043d\u043a\u0430': { mode: 'launch', allowAutoprice: true, allowLaunch: true, allowAlignment: false },
            '\u041f\u0435\u0440\u0435\u0437\u0430\u043f\u0443\u0441\u043a': { mode: 'launch', allowAutoprice: true, allowLaunch: true, allowAlignment: false },
            '\u041f\u043e\u0434 \u0432\u043e\u043f\u0440\u043e\u0441\u043e\u043c': { mode: 'freeze', allowAutoprice: false, allowLaunch: false, allowAlignment: false },
            '\u041f\u0435\u0440\u0435\u0440\u0430\u0431\u0430\u0442\u044b\u0432\u0430\u0435\u043c': { mode: 'freeze', allowAutoprice: false, allowLaunch: false, allowAlignment: false },
            '\u0412\u044b\u0432\u043e\u0434': { mode: 'off', allowAutoprice: false, allowLaunch: false, allowAlignment: false }
          },
          roleRules: {
            Hero: { targetDays: 28, minLiftPct: 2, stretchMultiplier: 1.2, allowVolumePush: true, elasticityDefault: -1.3 },
            Traffic: { targetDays: 29, minLiftPct: 2, stretchMultiplier: 1.15, allowVolumePush: true, elasticityDefault: -1.15 },
            Margin: { targetDays: 30, minLiftPct: 3, stretchMultiplier: 1.1, allowVolumePush: false, elasticityDefault: -0.9 },
            Launch: { targetDays: 45, minLiftPct: 0, stretchMultiplier: 1.15, allowVolumePush: false, elasticityDefault: -0.5 },
            Exit: { targetDays: 30, minLiftPct: 0, stretchMultiplier: 1, allowVolumePush: false, elasticityDefault: -1 },
            Freeze: { targetDays: 30, minLiftPct: 0, stretchMultiplier: 1, allowVolumePush: false, elasticityDefault: -0.8 }
          },
          feeRules: {
            wb: { commissionPct: 19, logisticsRub: 72, storageRub: 6, adRub: 35, returnsRub: 12, otherRub: 0 },
            ozon: { commissionPct: 18, logisticsRub: 68, storageRub: 5, adRub: 30, returnsRub: 10, otherRub: 0 },
            yandex: { commissionPct: 17, logisticsRub: 75, storageRub: 6, adRub: 28, returnsRub: 11, otherRub: 0 }
          }
        };
      };
      installed.push('defaultRepricerSettings');
    }

    if (typeof window.normalizeRepricerMode !== 'function') {
      window.normalizeRepricerMode = function normalizeRepricerModeFallback(mode) {
        const raw = String(mode || '').trim().toLowerCase();
        if (['freeze', 'hold', 'force'].includes(raw)) return raw;
        return 'auto';
      };
      installed.push('normalizeRepricerMode');
    }

    if (typeof window.normalizeRepricerEngineMode !== 'function') {
      window.normalizeRepricerEngineMode = function normalizeRepricerEngineModeFallback(mode) {
        const raw = String(mode || '').trim().toLowerCase();
        if (raw === 'hold') return 'launch';
        if (raw === 'force') return 'freeze';
        if (['launch', 'freeze', 'off'].includes(raw)) return raw;
        return 'auto';
      };
      installed.push('normalizeRepricerEngineMode');
    }

    if (typeof window.repricerNumberOrBlank !== 'function') {
      window.repricerNumberOrBlank = function repricerNumberOrBlankFallback(value) {
        if (value === null || value === undefined || value === '') return '';
        const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
      };
      installed.push('repricerNumberOrBlank');
    }

    if (typeof window.repricerSignedNumberOrBlank !== 'function') {
      window.repricerSignedNumberOrBlank = function repricerSignedNumberOrBlankFallback(value) {
        if (value === null || value === undefined || value === '') return '';
        const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : '';
      };
      installed.push('repricerSignedNumberOrBlank');
    }

    if (typeof window.repricerBool !== 'function') {
      window.repricerBool = function repricerBoolFallback(value, fallback = false) {
        if (value === null || value === undefined || value === '') return fallback;
        const raw = String(value).trim().toLowerCase();
        if (['y', 'yes', 'true', '1', '\u0434\u0430'].includes(raw)) return true;
        if (['n', 'no', 'false', '0', '\u043d\u0435\u0442'].includes(raw)) return false;
        return Boolean(value);
      };
      installed.push('repricerBool');
    }

    if (typeof window.repricerDateKey !== 'function') {
      window.repricerDateKey = function repricerDateKeyFallback(value) {
        if (!value) return '';
        const raw = String(value).trim();
        if (!raw) return '';
        const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (directMatch) return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return '';
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      installed.push('repricerDateKey');
    }

    if (typeof window.normalizeRepricerStatusRule !== 'function') {
      window.normalizeRepricerStatusRule = function normalizeRepricerStatusRuleFallback(item = {}, fallback = {}) {
        const source = typeof item === 'string' ? { mode: item } : (item || {});
        const base = typeof fallback === 'string' ? { mode: fallback } : (fallback || {});
        return {
          mode: window.normalizeRepricerEngineMode(source.mode ?? base.mode),
          allowAutoprice: window.repricerBool(source.allowAutoprice, window.repricerBool(base.allowAutoprice, true)),
          allowLaunch: window.repricerBool(source.allowLaunch, window.repricerBool(base.allowLaunch, false)),
          allowAlignment: window.repricerBool(source.allowAlignment, window.repricerBool(base.allowAlignment, true))
        };
      };
      installed.push('normalizeRepricerStatusRule');
    }

    if (typeof window.normalizeRepricerRoleRule !== 'function') {
      window.normalizeRepricerRoleRule = function normalizeRepricerRoleRuleFallback(item = {}, fallback = {}) {
        const source = item || {};
        const base = fallback || {};
        const next = {
          targetDays: Number(source.targetDays ?? base.targetDays),
          minLiftPct: Number(source.minLiftPct ?? base.minLiftPct),
          stretchMultiplier: Number(source.stretchMultiplier ?? base.stretchMultiplier),
          allowVolumePush: window.repricerBool(source.allowVolumePush, window.repricerBool(base.allowVolumePush, true)),
          elasticityDefault: Number(source.elasticityDefault ?? base.elasticityDefault)
        };
        if (!Number.isFinite(next.targetDays)) next.targetDays = Number(base.targetDays) || 30;
        if (!Number.isFinite(next.minLiftPct)) next.minLiftPct = Number(base.minLiftPct) || 0;
        if (!Number.isFinite(next.stretchMultiplier)) next.stretchMultiplier = Number(base.stretchMultiplier) || 1;
        if (!Number.isFinite(next.elasticityDefault)) next.elasticityDefault = Number(base.elasticityDefault) || -1;
        return next;
      };
      installed.push('normalizeRepricerRoleRule');
    }

    if (typeof window.normalizeRepricerBrandRule !== 'function') {
      window.normalizeRepricerBrandRule = function normalizeRepricerBrandRuleFallback(item = {}, fallback = {}) {
        const source = item || {};
        const base = fallback || {};
        const next = {
          defaultTargetDays: Number(source.defaultTargetDays ?? base.defaultTargetDays),
          launchTargetDays: Number(source.launchTargetDays ?? base.launchTargetDays),
          oosDays: Number(source.oosDays ?? base.oosDays),
          minMarginPct: Number(source.minMarginPct ?? base.minMarginPct),
          alignmentEnabled: window.repricerBool(source.alignmentEnabled, window.repricerBool(base.alignmentEnabled, true))
        };
        if (!Number.isFinite(next.defaultTargetDays)) next.defaultTargetDays = Number(base.defaultTargetDays) || 30;
        if (!Number.isFinite(next.launchTargetDays)) next.launchTargetDays = Number(base.launchTargetDays) || 45;
        if (!Number.isFinite(next.oosDays)) next.oosDays = Number(base.oosDays) || 5;
        if (!Number.isFinite(next.minMarginPct)) next.minMarginPct = Number(base.minMarginPct) || 15;
        return next;
      };
      installed.push('normalizeRepricerBrandRule');
    }

    if (typeof window.normalizeRepricerFeeRule !== 'function') {
      window.normalizeRepricerFeeRule = function normalizeRepricerFeeRuleFallback(item = {}, fallback = {}) {
        const source = item || {};
        const base = fallback || {};
        const next = {
          commissionPct: Number(source.commissionPct ?? base.commissionPct),
          logisticsRub: Number(source.logisticsRub ?? base.logisticsRub),
          storageRub: Number(source.storageRub ?? base.storageRub),
          adRub: Number(source.adRub ?? base.adRub),
          returnsRub: Number(source.returnsRub ?? base.returnsRub),
          otherRub: Number(source.otherRub ?? base.otherRub)
        };
        Object.keys(next).forEach((key) => {
          if (!Number.isFinite(next[key])) next[key] = Number(base[key]) || 0;
        });
        return next;
      };
      installed.push('normalizeRepricerFeeRule');
    }

    if (typeof window.normalizeRepricerSettings !== 'function') {
      window.normalizeRepricerSettings = function normalizeRepricerSettingsFallback(item = {}) {
        const defaults = window.defaultRepricerSettings();
        const rawGlobal = typeof item?.global === 'object' && item.global !== null ? item.global : {};
        const rawBrandRules = typeof item?.brandRules === 'object' && item.brandRules !== null ? item.brandRules : {};
        const rawStatusRules = typeof item?.statusRules === 'object' && item.statusRules !== null ? item.statusRules : {};
        const rawRoleRules = typeof item?.roleRules === 'object' && item.roleRules !== null ? item.roleRules : {};
        const rawFeeRules = typeof item?.feeRules === 'object' && item.feeRules !== null ? item.feeRules : {};
        const next = {
          global: {
            minMarginPct: Number(rawGlobal.minMarginPct),
            defaultTargetDays: Number(rawGlobal.defaultTargetDays),
            launchTargetDays: Number(rawGlobal.launchTargetDays),
            oosDays: Number(rawGlobal.oosDays),
            alignmentEnabled: rawGlobal.alignmentEnabled === undefined ? defaults.global.alignmentEnabled : Boolean(rawGlobal.alignmentEnabled),
            deadbandPct: Number(rawGlobal.deadbandPct),
            deadbandRub: Number(rawGlobal.deadbandRub)
          },
          brandRules: {},
          statusRules: {},
          roleRules: {},
          feeRules: {}
        };

        Object.keys(next.global).forEach((key) => {
          if (typeof defaults.global[key] === 'number' && !Number.isFinite(next.global[key])) next.global[key] = defaults.global[key];
        });

        const brandKeys = new Set([...Object.keys(defaults.brandRules || {}), ...Object.keys(rawBrandRules)]);
        brandKeys.forEach((brand) => {
          const normalizedBrand = String(brand || '').trim();
          if (!normalizedBrand) return;
          next.brandRules[normalizedBrand] = window.normalizeRepricerBrandRule(rawBrandRules[normalizedBrand], defaults.brandRules?.[normalizedBrand] || defaults.global);
        });

        const statusKeys = new Set([...Object.keys(defaults.statusRules), ...Object.keys(rawStatusRules)]);
        statusKeys.forEach((status) => {
          const normalizedStatus = String(status || '').trim();
          if (!normalizedStatus) return;
          next.statusRules[normalizedStatus] = window.normalizeRepricerStatusRule(rawStatusRules[normalizedStatus], defaults.statusRules[normalizedStatus] || {});
        });

        const roleKeys = new Set([...Object.keys(defaults.roleRules), ...Object.keys(rawRoleRules)]);
        roleKeys.forEach((role) => {
          const normalizedRole = String(role || '').trim();
          if (!normalizedRole) return;
          next.roleRules[normalizedRole] = window.normalizeRepricerRoleRule(rawRoleRules[normalizedRole], defaults.roleRules[normalizedRole] || {});
        });

        const feeKeys = new Set([...Object.keys(defaults.feeRules), ...Object.keys(rawFeeRules)]);
        feeKeys.forEach((platform) => {
          const normalizedPlatform = String(platform || '').trim().toLowerCase();
          if (!normalizedPlatform) return;
          next.feeRules[normalizedPlatform] = window.normalizeRepricerFeeRule(rawFeeRules[normalizedPlatform], defaults.feeRules[normalizedPlatform] || {});
        });

        return next;
      };
      installed.push('normalizeRepricerSettings');
    }

    if (typeof window.normalizeRepricerLaunchReady !== 'function') {
      window.normalizeRepricerLaunchReady = function normalizeRepricerLaunchReadyFallback(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (!raw) return '';
        if (['READY', 'GO', 'LIVE'].includes(raw)) return 'READY';
        if (['HOLD', 'WAIT', 'BLOCK', 'NOT_READY', 'NOT READY', 'DRAFT'].includes(raw)) return 'HOLD';
        return raw;
      };
      installed.push('normalizeRepricerLaunchReady');
    }

    return installed;
  }

  function installRerenderFallback() {
    if (typeof window.rerenderCurrentView === 'function') return false;

    window.rerenderCurrentView = function rerenderCurrentViewFallback() {
      try {
        window.applyOwnerOverridesToSkus?.();
      } catch (error) {
        console.warn('[portal-emergency-rerender] applyOwnerOverridesToSkus failed', error);
      }

      const renderPlan = [
        ['dashboard', 'view-dashboard', 'Dashboard', window.renderDashboard],
        ['documents', 'view-documents', 'Documents', window.renderDocuments],
        ['repricer', 'view-repricer', 'Repricer', window.renderRepricer],
        ['prices', 'view-prices', 'Prices', () => window.renderPriceWorkbench?.()],
        ['order', 'view-order', 'Order', window.renderOrderCalculator],
        ['control', 'view-control', 'Tasks', window.renderControlCenter],
        ['skus', 'view-skus', 'SKU registry', window.renderSkuRegistry],
        ['launches', 'view-launches', 'Product / Ksenia', window.renderLaunches],
        ['launch-control', 'view-launch-control', 'Launch control', window.renderLaunchControl],
        ['meetings', 'view-meetings', 'Work rhythm', window.renderMeetings],
        ['executive', 'view-executive', 'Executive', window.renderExecutive]
      ];

      const activeView = String(window.state?.activeView || 'dashboard');
      const target = renderPlan.find(([view]) => view === activeView) || renderPlan[0];
      const [, rootId, title, renderer] = target;
      const errors = [];

      try {
        if (typeof renderer === 'function') renderer();
        else throw new Error(`Renderer ${title} is not available`);
      } catch (error) {
        console.error(error);
        errors.push(`${title}: ${error.message}`);
        window.renderViewFailure?.(rootId, title, error);
      }

      if (window.state) window.state.runtimeErrors = errors;
      window.updateSyncBadge?.();
      window.setAppError?.(errors.length ? `Portal loaded with gaps: ${errors[0]}` : '');
    };

    return true;
  }

  function installEmergencyAppCoreFallbacks() {
    const installed = [];

    installed.push(...installRepricerSettingsFallbacks());
    if (installAppErrorFallback()) installed.push('setAppError');
    if (installSyncBadgeFallback()) installed.push('updateSyncBadge');
    if (installViewFailureFallback()) installed.push('renderViewFailure');
    if (installOwnerOverrideFallback()) installed.push('applyOwnerOverridesToSkus');

    const renderers = [
      ['renderDashboard', 'view-dashboard', 'Dashboard', 'The main screen is still recovering after an incomplete app-core publish.'],
      ['renderDocuments', 'view-documents', 'Documents', 'The documents section is temporarily served in a safe fallback mode.'],
      ['renderRepricer', 'view-repricer', 'Repricer', 'The repricer section is temporarily served through an emergency fallback.'],
      ['renderOrderCalculator', 'view-order', 'Order', 'The order and logistics block did not make it into the published bundle and is temporarily hidden.'],
      ['renderControlCenter', 'view-control', 'Tasks', 'The task control section is temporarily served in a safe fallback mode.'],
      ['renderSkuRegistry', 'view-skus', 'SKU registry', 'The SKU registry is temporarily unavailable until the full file is restored.'],
      ['renderLaunches', 'view-launches', 'Product / Ksenia', 'The product screen is temporarily unavailable until the full file is restored.'],
      ['renderLaunchControl', 'view-launch-control', 'Launch control', 'The launch-control screen is temporarily unavailable until the full file is restored.'],
      ['renderMeetings', 'view-meetings', 'Work rhythm', 'The meetings screen is temporarily served in a safe fallback mode.'],
      ['renderExecutive', 'view-executive', 'Executive', 'The executive summary is temporarily unavailable until the full file is restored.']
    ];

    for (const [name, rootId, title, message] of renderers) {
      if (installFallbackRenderer(name, rootId, title, message)) installed.push(name);
    }

    if (installRerenderFallback()) installed.push('rerenderCurrentView');

    if (installed.length) {
      console.warn('[portal-repricer-managed-hotfix-loader] app-core emergency fallbacks installed', installed);
    }

    return installed.length > 0;
  }

  function scheduleRecoveryRerender() {
    [40, 180, 700, 1600].forEach((delay) => {
      window.setTimeout(() => {
        if (typeof window.rerenderCurrentView !== 'function') return;
        try {
          window.rerenderCurrentView();
        } catch (error) {
          console.warn('[portal-repricer-managed-hotfix-loader] recovery rerender failed', error);
        }
      }, delay);
    });
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error(label)), ms);
      })
    ]);
  }

  function parseChunkFragment(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : String(parsed ?? '');
    } catch (error) {
      return raw.replace(/^"+/, '').replace(/"+$/, '');
    }
  }

  async function fetchSupabasePayload() {
    const activeCfg = cfg();
    if (!activeCfg.supabase?.url || !activeCfg.supabase?.anonKey) {
      throw new Error('Supabase runtime is not configured');
    }

    const baseUrl = String(activeCfg.supabase.url || '').replace(/\/+$/, '');
    const url = new URL(`${baseUrl}/rest/v1/${SNAPSHOT_TABLE}`);
    url.searchParams.set('select', 'snapshot_key,payload,updated_at');
    url.searchParams.set('brand', `eq.${brand()}`);
    url.searchParams.set('snapshot_key', `like.${SNAPSHOT_KEY}*`);
    url.searchParams.set('order', 'snapshot_key.asc');

    const response = await withTimeout(fetch(url.toString(), {
      cache: 'no-store',
      headers: {
        apikey: activeCfg.supabase.anonKey,
        Authorization: `Bearer ${activeCfg.supabase.anonKey}`,
        Accept: 'application/json'
      }
    }), RUNTIME_FETCH_TIMEOUT_MS, 'Supabase runtime timed out');

    if (!response.ok) throw new Error(`Supabase runtime ${response.status}`);

    const rows = await withTimeout(
      response.json(),
      RUNTIME_FETCH_TIMEOUT_MS,
      'Supabase runtime body timed out'
    );

    const main = rows.find((row) => row?.snapshot_key === SNAPSHOT_KEY);
    if (!main) throw new Error(`Runtime snapshot ${SNAPSHOT_KEY} is missing`);

    if (main.payload?.chunked) {
      const partPattern = new RegExp(`^${SNAPSHOT_KEY}__part__(\\d{4})$`);
      const parts = rows
        .map((row) => {
          const match = String(row?.snapshot_key || '').match(partPattern);
          if (!match) return null;
          return {
            index: Number(match[1]),
            data: row?.payload?.data || ''
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.index - right.index);
      const expectedParts = Number(main.payload.chunk_count || 0);
      if (expectedParts && parts.length < expectedParts) {
        throw new Error(`Runtime snapshot is incomplete: ${parts.length}/${expectedParts}`);
      }
      return parts
        .slice(0, expectedParts > 0 ? expectedParts : parts.length)
        .map((row) => parseChunkFragment(row.data || ''))
        .join('');
    }

    return main.payload;
  }

  function parseLocalChunk(text) {
    return parseChunkFragment(text);
  }

  async function fetchLocalPayload() {
    const manifestResponse = await withTimeout(
      fetch(`${LOCAL_RUNTIME_MANIFEST}?v=${VERSION}`, { cache: 'no-store' }),
      RUNTIME_FETCH_TIMEOUT_MS,
      'Local runtime manifest timed out'
    );

    if (!manifestResponse.ok) {
      throw new Error(`Local runtime manifest ${manifestResponse.status}`);
    }

    const manifest = await withTimeout(
      manifestResponse.json(),
      RUNTIME_FETCH_TIMEOUT_MS,
      'Local runtime manifest body timed out'
    );

    if (manifest?.chunked) {
      const expectedParts = Number(manifest.chunk_count || 0);
      if (expectedParts <= 0) {
        throw new Error('Local runtime manifest does not declare chunk_count');
      }

      const chunks = await Promise.all(Array.from({ length: expectedParts }, (_, index) => {
        const partUrl = `${SNAPSHOT_KEY}.part${index + 1}.txt?v=${VERSION}`;
        return withTimeout(
          fetch(partUrl, { cache: 'no-store' }),
          RUNTIME_FETCH_TIMEOUT_MS,
          `Local runtime part ${index + 1} timed out`
        ).then((response) => {
          if (!response.ok) throw new Error(`Local runtime part ${index + 1} ${response.status}`);
          return withTimeout(
            response.text(),
            RUNTIME_FETCH_TIMEOUT_MS,
            `Local runtime part ${index + 1} body timed out`
          );
        });
      }));

      return chunks.map((chunk) => parseLocalChunk(chunk)).join('');
    }

    if (typeof manifest?.payload === 'string' && manifest.payload) return manifest.payload;
    throw new Error('Local runtime payload is missing');
  }

  async function fetchPayload() {
    try {
      return await fetchSupabasePayload();
    } catch (error) {
      console.warn('[portal-repricer-managed-hotfix-loader] supabase runtime fallback', error);
    }
    return await fetchLocalPayload();
  }

  async function inflateSource() {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('DecompressionStream is not available in this browser');
    }

    const binary = atob(await fetchPayload());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }

  let bootPromise = null;

  async function boot() {
    if (bootPromise) return bootPromise;

    bootPromise = (async () => {
      const source = await inflateSource();
      const blob = new Blob(
        [source + '\n//# sourceURL=portal-repricer-managed-hotfix-' + VERSION + '.js'],
        { type: 'text/javascript' }
      );
      const scriptUrl = URL.createObjectURL(blob);

      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = scriptUrl;
          script.async = false;
          script.onload = () => {
            script.remove();
            resolve();
          };
          script.onerror = (error) => {
            script.remove();
            reject(error || new Error('Failed to execute repricer hotfix runtime'));
          };
          document.head.appendChild(script);
        });
      } finally {
        URL.revokeObjectURL(scriptUrl);
      }

      if (typeof window.rerenderCurrentView === 'function' && window.state?.activeView === 'repricer') {
        window.rerenderCurrentView();
      }
    })().catch((error) => {
      console.warn('[portal-repricer-managed-hotfix-loader]', error);
      bootPromise = null;
      throw error;
    });

    return bootPromise;
  }

  function repricerViewRequested() {
    if (window.state?.activeView === 'repricer') return true;
    if (document.querySelector('#view-repricer.view.active')) return true;
    if (document.querySelector('.nav-btn.active[data-view="repricer"]')) return true;
    return false;
  }

  function start(forceBoot = false) {
    const installedEmergencyFallbacks = installEmergencyAppCoreFallbacks();
    if (installedEmergencyFallbacks) scheduleRecoveryRerender();

    if (window.__ALTEA_REPRICER_MANAGED_HOTFIX_20260424B__) {
      if (typeof window.rerenderCurrentView === 'function' && window.state?.activeView === 'repricer') {
        window.rerenderCurrentView();
      }
      return;
    }

    if (!forceBoot && !repricerViewRequested()) {
      return;
    }

    boot().catch(() => {});
  }

  installEmergencyAppCoreFallbacks();

  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-view="repricer"]');
    if (!target) return;
    window.setTimeout(() => start(true), 0);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(start, 120), { once: true });
  } else {
    window.setTimeout(start, 120);
  }

  window.addEventListener('load', () => window.setTimeout(start, 120), { once: true });
  window.setTimeout(start, 1200);
})();
