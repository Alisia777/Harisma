(function () {
  'use strict';

  const VERSION = '20260701-dashboard-ads-dedup1';
  const ROOT_ID = 'view-dashboard';
  const STYLE_ID = 'altea-dashboard-ceo-motion-v1-style';
  window.__ALTEA_DASHBOARD_CEO_MOTION_ACTIVE__ = true;
  const PERIOD_KEY = 'altea.dashboard.ceoMotion.period';
  const METRIC_KEY = 'altea.dashboard.ceoMotion.metric';
  const GLOBAL_MARKET_KEY = 'altea.portal.marketplace';
  const ROUTES = {
    orders: 'product-leaderboard',
    buys: 'product-leaderboard',
    revenue: 'sku-plan-fact',
    margin: 'sku-plan-fact',
    ads: 'iu-drr',
    drr: 'iu-drr',
    oos: 'oos-control',
    price: 'prices'
  };
  const PLATFORM_META = {
    all: { label: 'Все площадки', short: 'Все', color: '#dbc7a3' },
    wb: { label: 'WB', short: 'WB', color: '#a855f7' },
    ozon: { label: 'Ozon', short: 'Ozon', color: '#4f86ff' },
    ya: { label: 'Я.Маркет', short: 'Я.Маркет', color: '#f2c84b' },
    ym: { label: 'Я.Маркет', short: 'Я.Маркет', color: '#f2c84b', alias: 'ya' },
    goldapple: { label: 'ЗЯ', short: 'ЗЯ', color: '#72c86a' },
    ga: { label: 'ЗЯ', short: 'ЗЯ', color: '#72c86a', alias: 'goldapple' },
    letu: { label: "Л'Этуаль", short: "Л'Этуаль", color: '#d96aa9' },
    megamarket: { label: 'Мегамаркет', short: 'Мегамаркет', color: '#f97316' },
    samokat: { label: 'Самокат', short: 'Самокат', color: '#10b981' },
    magnit: { label: 'Магнит', short: 'Магнит', color: '#e85b55' }
  };
  const MARKETPLACE_ORDER = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit'];
  const METRICS = {
    orders: { label: 'Заказы', unit: 'int', chart: 'bars', route: 'product-leaderboard', tone: '#76a9ea' },
    buys: { label: 'Выкупы', unit: 'int', chart: 'bars', route: 'product-leaderboard', tone: '#74c99a' },
    revenue: { label: 'Выручка', unit: 'money', chart: 'bars', route: 'sku-plan-fact', tone: '#dbc7a3' },
    margin: { label: 'Маржа', unit: 'pct', chart: 'bars', route: 'sku-plan-fact', tone: '#e0b760' },
    ads: { label: 'Реклама', unit: 'money', chart: 'bars', route: 'iu-drr', tone: '#a855f7' }
  };
  const FILES = {
    dashboard: 'data/dashboard.json',
    metrics: 'data/portal_dashboard_metrics.json',
    platformTrends: 'data/platform_trends.json',
    platformSkuArticles: 'data/platform_sku_articles.json',
    productLeaderboard: 'data/product_leaderboard.json',
    iuDrr: 'data/iu_drr_summary.json',
    adsSummary: 'data/ads_summary.json'
  };
  const sourceCache = {};
  let loadingPromise = null;
  let sourcesLoaded = false;
  let renderAfterLoadScheduled = false;
  let missingSourceRetries = 0;
  const MAX_MISSING_SOURCE_RETRIES = 3;

  function appState() {
    return window.__alteaAppState || window.state || window.__ALTEA_STATE__ || {};
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function positiveFinite(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
    return 0;
  }

  function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function hasFiniteValue(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function fmtInt(value) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(finite(value));
  }

  function fmtMoney(value) {
    const abs = Math.abs(finite(value));
    if (abs >= 1000000) {
      return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(finite(value) / 1000000)} млн ₽`;
    }
    if (abs >= 1000) {
      return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(finite(value) / 1000)} тыс. ₽`;
    }
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(finite(value))} ₽`;
  }

  function fmtMoneyFull(value) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(finite(value))} ₽`;
  }

  function fmtPct(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return 'нет данных';
    return new Intl.NumberFormat('ru-RU', {
      style: 'percent',
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    }).format(finite(value));
  }

  function fmtMetric(metric, value) {
    const meta = METRICS[metric] || METRICS.revenue;
    if (value === null || value === undefined || value === '') return 'нет данных';
    if (meta.unit === 'money') return fmtMoney(value);
    if (meta.unit === 'pct') return fmtPct(value);
    return fmtInt(value);
  }

  function signedMoney(value) {
    const number = finite(value);
    return `${number >= 0 ? '+' : ''}${fmtMoneyFull(number)}`;
  }

  function signedPct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return 'нет данных';
    return `${finite(value) >= 0 ? '+' : ''}${fmtPct(value)}`;
  }

  function dateKey(value) {
    const text = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function parseDate(value) {
    const key = dateKey(value);
    if (!key) return null;
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDays(date, diff) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + diff);
    return next;
  }

  function iso(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function shortDate(value) {
    const key = dateKey(value);
    return key ? `${key.slice(8, 10)}.${key.slice(5, 7)}` : '—';
  }

  function normalizePlatform(value) {
    const raw = String(value || 'all').trim().toLowerCase().replace(/\s+/g, '');
    if (!raw || raw === 'marketplaces' || raw === 'all') return 'all';
    if (raw === 'yandex' || raw === 'ym' || raw === 'ya') return 'ya';
    if (raw === 'goldapple' || raw === 'gold_apple' || raw === 'gold-apple' || raw === 'goldenapple' || raw === 'ga' || raw === 'goldapple-online') return 'goldapple';
    if (raw === 'megamarket' || raw === 'mega_market' || raw === 'sbermegamarket') return 'megamarket';
    if (raw === 'samokat') return 'samokat';
    if (raw === 'magnitmarket' || raw === 'magnit_market' || raw === 'magnit-market' || raw === 'mm') return 'magnit';
    return PLATFORM_META[raw] ? (PLATFORM_META[raw].alias || raw) : 'all';
  }

  function platformMeta(key) {
    const normalized = normalizePlatform(key);
    return PLATFORM_META[normalized] || PLATFORM_META.all;
  }

  function readStorage(key, fallback) {
    try {
      const value = window.localStorage?.getItem(key);
      return value == null || value === '' ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage?.setItem(key, value);
    } catch {}
  }

  function currentPeriod() {
    const value = String(readStorage(PERIOD_KEY, 'mtd') || 'mtd');
    return ['7', '14', 'mtd'].includes(value) ? value : 'mtd';
  }

  function currentMetric() {
    const value = String(readStorage(METRIC_KEY, 'orders') || 'orders');
    return METRICS[value] ? value : 'orders';
  }

  function currentGlobalPlatform() {
    const state = appState();
    const candidates = [
      document.documentElement?.dataset?.marketplace,
      document.body?.dataset?.marketplace,
      document.documentElement?.dataset?.platform,
      document.body?.dataset?.platform,
      document.documentElement?.dataset?.market,
      document.body?.dataset?.market,
      state.globalMarketplace,
      state.uiHotfix?.globalMarketplace,
      state.uiHotfix?.dashboardPlatform,
      state.filters?.market,
      state.filters?.platform,
      readStorage(GLOBAL_MARKET_KEY, '')
    ];
    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined || String(candidate).trim() === '') continue;
      const normalized = normalizePlatform(candidate);
      if (normalized !== 'all') return normalized;
    }
    return 'all';
  }

  function stateSource(name) {
    const state = appState();
    if (name === 'dashboard') return state.dashboard;
    if (name === 'metrics') return state.portalDashboardMetrics;
    if (name === 'platformTrends') return state.platformTrends;
    if (name === 'platformSkuArticles') return state.platformSkuArticles;
    if (name === 'productLeaderboard') return state.productLeaderboard;
    if (name === 'iuDrr') return state.iuDrrSummary || state.iuDrr;
    if (name === 'adsSummary') return state.adsSummary;
    return null;
  }

  function source(name) {
    const statePayload = stateSource(name);
    const cachedPayload = sourceCache[name] || null;
    if (statePayload && Object.keys(statePayload || {}).length) {
      if (name === 'platformTrends' && cachedPayload) {
        return mergePlatformTrends(statePayload, cachedPayload);
      }
      if (name === 'dashboard' && cachedPayload) {
        return {
          ...cachedPayload,
          ...statePayload,
          companyPlan: statePayload.companyPlan || cachedPayload.companyPlan,
          brandSummary: statePayload.brandSummary || cachedPayload.brandSummary
        };
      }
      return statePayload;
    }
    return cachedPayload;
  }

  function hasUsableSource(name) {
    const payload = source(name);
    if (!payload || !Object.keys(payload || {}).length) return false;
    if (name === 'dashboard') return Boolean(payload?.companyPlan?.activeMonth?.channels || payload?.cards?.length);
    if (name === 'platformTrends') return hasPlatformSeries(payload);
    if (name === 'iuDrr') return Array.isArray(payload?.daily) && payload.daily.length > 0;
    if (name === 'adsSummary') return Array.isArray(payload?.platforms) && payload.platforms.length > 0;
    return true;
  }

  function requiredSourceState() {
    const dashboardSource = source('dashboard') || {};
    return {
      hasPlatformRows: hasPlatformSeries(source('platformTrends')),
      hasDashboardPlan: Boolean(dashboardSource?.companyPlan?.activeMonth?.channels),
      hasIuDrrRows: Array.isArray(source('iuDrr')?.daily) && source('iuDrr').daily.length > 0
    };
  }

  function loadSources(options = {}) {
    const forceMissing = Boolean(options.forceMissing);
    if (loadingPromise && (!forceMissing || !sourcesLoaded)) return loadingPromise;
    const entries = Object.entries(FILES).filter(([name]) => forceMissing ? !hasUsableSource(name) : !sourceCache[name]);
    if (!entries.length) {
      sourcesLoaded = true;
      return Promise.resolve(true);
    }
    loadingPromise = Promise.all(entries.map(([name, path]) => {
      return fetch(`${path}?v=${VERSION}`, { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (payload) sourceCache[name] = payload;
        })
        .catch(() => {});
    })).then(() => {
      sourcesLoaded = true;
      return true;
    });
    return loadingPromise;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} .ceo-motion-v1{--bg:#070706;--surface:#12100d;--surface2:#17140f;--line:#302a22;--line2:#514536;--text:#f4eee4;--muted:#a59c90;--faint:#70685f;--champ:#dbc7a3;--champ2:#f0dfbf;--ok:#74c99a;--warn:#e0b760;--bad:#e7786b;--info:#76a9ea;--platform:${PLATFORM_META.all.color};--metric:var(--platform);--ease:cubic-bezier(.22,.82,.22,1);position:relative;display:grid;gap:13px;color:var(--text);isolation:isolate;animation:ceoPageReveal 280ms var(--ease) both}
      #${ROOT_ID} .ceo-motion-v1 *{box-sizing:border-box}
      #${ROOT_ID} .ceo-motion-v1 button,#${ROOT_ID} .ceo-motion-v1 input{font:inherit;color:inherit}
      #${ROOT_ID} .ceo-motion-v1 button{cursor:pointer}
      .ceo-motion-v1.ceo-drawer-back{--bg:#070706;--surface:#12100d;--surface2:#17140f;--line:#302a22;--line2:#514536;--text:#f4eee4;--muted:#a59c90;--faint:#70685f;--champ:#dbc7a3;--champ2:#f0dfbf;--ok:#74c99a;--warn:#e0b760;--bad:#e7786b;--info:#76a9ea;--platform:${PLATFORM_META.all.color};--metric:var(--platform);--ease:cubic-bezier(.22,.82,.22,1);color:var(--text)}
      .ceo-motion-v1.ceo-drawer-back *{box-sizing:border-box}
      .ceo-motion-v1.ceo-drawer-back button,.ceo-motion-v1.ceo-drawer-back input{font:inherit;color:inherit}
      .ceo-motion-v1.ceo-drawer-back button{cursor:pointer}
      #${ROOT_ID} .ceo-motion-bg{position:absolute;inset:-30px -22px auto -22px;height:360px;z-index:-1;overflow:hidden;pointer-events:none}
      #${ROOT_ID} .ceo-motion-bg::before{content:"";position:absolute;right:4%;top:-210px;width:640px;height:640px;border-radius:50%;background:radial-gradient(circle,rgba(219,199,163,.22),rgba(219,199,163,.08) 42%,transparent 68%);filter:blur(.2px)}
      #${ROOT_ID} .ceo-motion-bg::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(219,199,163,.25),transparent)}
      #${ROOT_ID} .ceo-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;min-height:156px;padding-top:3px}
      #${ROOT_ID} .ceo-kicker{color:var(--champ);font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}
      #${ROOT_ID} .ceo-title{margin:8px 0 5px;font:500 clamp(34px,4vw,58px)/1 Georgia,'Times New Roman',serif;letter-spacing:0;color:#fff7e7}
      #${ROOT_ID} .ceo-lead{max-width:820px;margin:0;color:var(--muted);font-size:13px;line-height:1.55}
      #${ROOT_ID} .ceo-toolbar{display:flex;flex-direction:column;align-items:flex-end;gap:10px;min-width:min(420px,100%)}
      #${ROOT_ID} .ceo-chip-row{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      #${ROOT_ID} .ceo-chip{display:inline-flex;align-items:center;gap:7px;min-height:31px;padding:0 12px;border:1px solid var(--line);border-radius:999px;background:rgba(12,10,8,.86);color:var(--muted);font-size:11px;font-weight:800;white-space:nowrap}
      #${ROOT_ID} .ceo-chip::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--pc,var(--champ));box-shadow:0 0 12px var(--pc,var(--champ))}
      #${ROOT_ID} .ceo-periods{display:flex;gap:5px;padding:5px;border:1px solid var(--line);border-radius:999px;background:#0f0d0b}
      #${ROOT_ID} .ceo-period,.ceo-motion-v1.ceo-drawer-back .ceo-period{height:34px;padding:0 15px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--muted);font-size:11px;font-weight:900;transition:background 180ms var(--ease),border-color 180ms var(--ease),color 180ms var(--ease)}
      #${ROOT_ID} .ceo-period.active,.ceo-motion-v1.ceo-drawer-back .ceo-period.active{background:var(--champ2);border-color:var(--champ2);color:#18120a}
      #${ROOT_ID} .ceo-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}
      #${ROOT_ID} .ceo-kpi{--pc:var(--champ);position:relative;min-height:116px;padding:15px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.012));text-align:left;overflow:hidden;contain:layout paint;transition:transform 180ms var(--ease),border-color 180ms var(--ease),background 180ms var(--ease)}
      #${ROOT_ID} .ceo-kpi::before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:var(--pc);opacity:.78}
      #${ROOT_ID} .ceo-kpi::after{content:"";position:absolute;inset:-70% -20%;background:linear-gradient(112deg,transparent 38%,rgba(255,255,255,.08),transparent 62%);transform:translateX(-70%);opacity:0}
      #${ROOT_ID} .ceo-kpi:hover,#${ROOT_ID} .ceo-kpi:focus-visible{transform:translateY(-2px);border-color:color-mix(in srgb,var(--pc) 58%,var(--line))}
      #${ROOT_ID} .ceo-kpi.active{border-color:color-mix(in srgb,var(--pc) 72%,var(--line));background:linear-gradient(135deg,color-mix(in srgb,var(--pc) 10%,transparent),rgba(255,255,255,.014))}
      #${ROOT_ID} .ceo-kpi.active::after{animation:ceoSweep 620ms var(--ease) both}
      #${ROOT_ID} .ceo-kpi small{display:block;color:var(--muted);font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
      #${ROOT_ID} .ceo-kpi strong{display:block;margin-top:16px;font-size:30px;line-height:1.02;color:#fff8eb}
      #${ROOT_ID} .ceo-kpi p{margin:8px 0 0;color:var(--faint);font-size:11px;line-height:1.35}
      #${ROOT_ID} .ceo-kpi em{position:absolute;right:13px;top:13px;font-style:normal;font-size:12px;font-weight:900}
      #${ROOT_ID} .is-up{color:var(--ok)!important}#${ROOT_ID} .is-down{color:var(--bad)!important}#${ROOT_ID} .is-warn{color:var(--warn)!important}
      #${ROOT_ID} .ceo-main-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(360px,.65fr);gap:11px}
      #${ROOT_ID} .ceo-panel{position:relative;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.028),rgba(255,255,255,.011));box-shadow:inset 0 1px rgba(255,255,255,.02);contain:layout paint}
      #${ROOT_ID} .ceo-panel-head{display:flex;align-items:flex-start;gap:12px;padding:16px 17px 8px}
      #${ROOT_ID} .ceo-panel-head h2{margin:0;font:500 22px Georgia,'Times New Roman',serif;color:#fff4e1}
      #${ROOT_ID} .ceo-panel-head p{margin:4px 0 0;color:var(--faint);font-size:11px;line-height:1.4}
      #${ROOT_ID} .ceo-spacer{flex:1}
      #${ROOT_ID} .ceo-legend{display:flex;gap:13px;align-items:center;color:var(--muted);font-size:10px;white-space:nowrap}
      #${ROOT_ID} .ceo-legend i{display:inline-block;width:13px;height:6px;border-radius:999px;margin-right:5px;vertical-align:middle}
      #${ROOT_ID} .ceo-legend .current{background:var(--platform)}#${ROOT_ID} .ceo-legend .previous{background:#5d554a}#${ROOT_ID} .ceo-legend .plan{height:3px;background:linear-gradient(90deg,#fff8d6,#f5c76b)}
      #${ROOT_ID} .ceo-chart{height:392px;padding:0 18px 17px}
      #${ROOT_ID} .ceo-chart svg{width:100%;height:100%;overflow:visible}
      #${ROOT_ID} .ceo-chart svg *{vector-effect:non-scaling-stroke}
      #${ROOT_ID} .ceo-grid-line{stroke:rgba(255,255,255,.13);stroke-width:1}
      #${ROOT_ID} .ceo-bar-current{fill:var(--platform);opacity:.86;transform-origin:bottom;animation:ceoBarGrow 620ms var(--ease) both;animation-delay:calc(var(--i)*32ms)}
      #${ROOT_ID} .ceo-bar-prev{fill:#6e6253;opacity:.62;transform-origin:bottom;animation:ceoBarGrow 520ms var(--ease) both;animation-delay:calc(var(--i)*22ms)}
      #${ROOT_ID} .ceo-plan-line{fill:none;stroke:#fff1bf;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:9 7;filter:drop-shadow(0 0 9px rgba(255,235,177,.72));animation:ceoLineDraw 800ms var(--ease) both}
      #${ROOT_ID} .ceo-plan-line-bars{stroke-width:3.8}
      #${ROOT_ID} .ceo-plan-dot{fill:#fff7d0;stroke:#20160a;stroke-width:1.5;filter:drop-shadow(0 0 8px rgba(255,229,153,.75))}
      #${ROOT_ID} .ceo-plan-label{fill:#fff2bd;font-size:11px;font-weight:950;paint-order:stroke;stroke:rgba(0,0,0,.82);stroke-width:3px;stroke-linejoin:round}
      #${ROOT_ID} .ceo-axis-label{fill:#d6c6b2;font-size:10px;font-weight:850;paint-order:stroke;stroke:rgba(0,0,0,.72);stroke-width:2px;stroke-linejoin:round}
      #${ROOT_ID} .ceo-rate-line{fill:none;stroke:var(--metric,var(--platform));stroke-width:5.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1500;opacity:1;filter:drop-shadow(0 0 12px rgba(224,183,96,.58));animation:ceoLineDraw 800ms var(--ease) both}
      #${ROOT_ID} .ceo-rate-prev{fill:none;stroke:#b8aa9a;stroke-width:2.6;opacity:.88;stroke-dasharray:5 8}
      #${ROOT_ID} .ceo-rate-area{fill:var(--metric,var(--platform));opacity:.18}
      #${ROOT_ID} .ceo-rate-dot{fill:var(--metric,var(--platform));stroke:#fff5df;stroke-width:1.7;filter:drop-shadow(0 0 8px color-mix(in srgb,var(--metric,var(--platform)) 55%,transparent))}
      #${ROOT_ID} .ceo-hit{fill:transparent;cursor:pointer}
      #${ROOT_ID} .ceo-verdict{padding-bottom:14px}
      #${ROOT_ID} .ceo-verdict-card{margin:0 16px 11px;padding:15px;border:1px solid rgba(116,201,154,.35);border-radius:13px;background:linear-gradient(135deg,rgba(116,201,154,.08),transparent)}
      #${ROOT_ID} .ceo-verdict-card small{display:block;color:var(--muted);font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
      #${ROOT_ID} .ceo-verdict-card strong{display:block;margin-top:9px;font:500 32px Georgia,'Times New Roman',serif}
      #${ROOT_ID} .ceo-verdict-card p{margin:8px 0 0;color:var(--muted);font-size:12px;line-height:1.45}
      #${ROOT_ID} .ceo-driver-list{padding:0 16px}
      #${ROOT_ID} .ceo-driver{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;padding:11px 0;border:0;border-top:1px solid var(--line);background:transparent;text-align:left}
      #${ROOT_ID} .ceo-driver-index{display:grid;place-items:center;width:28px;height:28px;border:1px solid var(--line);border-radius:8px;color:var(--faint);font-size:11px}
      #${ROOT_ID} .ceo-driver b{display:block;font-size:12px}
      #${ROOT_ID} .ceo-driver span span{display:block;margin-top:3px;color:var(--faint);font-size:10px}
      #${ROOT_ID} .ceo-driver em{font-style:normal;font-size:12px;font-weight:900;white-space:nowrap}
      #${ROOT_ID} .ceo-platform-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}
      #${ROOT_ID} .ceo-platform{--pc:var(--champ);padding:13px;border:1px solid var(--line);border-radius:13px;background:#11100d;text-align:left;transition:transform 160ms var(--ease),border-color 160ms var(--ease);contain:layout paint}
      #${ROOT_ID} .ceo-platform:hover,#${ROOT_ID} .ceo-platform:focus-visible{transform:translateY(-2px);border-color:var(--pc)}
      #${ROOT_ID} .ceo-platform small{display:block;color:var(--faint);font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      #${ROOT_ID} .ceo-platform strong{display:block;margin-top:10px;font-size:18px;color:#fff7e9}
      #${ROOT_ID} .ceo-platform p{margin:7px 0 0;color:var(--muted);font-size:10px;line-height:1.35}
      #${ROOT_ID} .ceo-progress{height:4px;margin-top:11px;border-radius:999px;background:#28231e;overflow:hidden}
      #${ROOT_ID} .ceo-progress i{display:block;height:100%;border-radius:inherit;background:var(--pc);animation:ceoGrowX 650ms var(--ease) both}
      #${ROOT_ID} .ceo-lower-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(360px,.75fr);gap:11px}
      #${ROOT_ID} .ceo-waterfall{height:310px;padding:0 17px 14px}
      #${ROOT_ID} .ceo-waterfall svg{width:100%;height:100%;overflow:visible}
      #${ROOT_ID} .ceo-waterfall-grid{stroke:rgba(255,255,255,.13);stroke-width:1}
      #${ROOT_ID} .ceo-waterfall-base{stroke:rgba(255,241,191,.36);stroke-width:1.4}
      #${ROOT_ID} .ceo-waterfall-bar{opacity:.96;filter:drop-shadow(0 0 10px rgba(0,0,0,.55))}
      #${ROOT_ID} .ceo-waterfall-bar.is-up{fill:var(--ok)}
      #${ROOT_ID} .ceo-waterfall-bar.is-down{fill:var(--bad)}
      #${ROOT_ID} .ceo-waterfall-label{font-size:12px;font-weight:950;paint-order:stroke;stroke:rgba(0,0,0,.82);stroke-width:3px;stroke-linejoin:round}
      #${ROOT_ID} .ceo-waterfall-label.is-up{fill:var(--ok)}
      #${ROOT_ID} .ceo-waterfall-label.is-down{fill:var(--bad)}
      #${ROOT_ID} .ceo-waterfall-x{fill:#d8cbb9;font-size:10px;font-weight:900;paint-order:stroke;stroke:rgba(0,0,0,.75);stroke-width:2px;stroke-linejoin:round}
      #${ROOT_ID} .ceo-waterfall-connector{stroke:rgba(255,241,191,.34);stroke-width:1.4;stroke-dasharray:4 5}
      #${ROOT_ID} .ceo-risk-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 16px 16px}
      #${ROOT_ID} .ceo-risk{--pc:var(--warn);min-height:96px;padding:13px;border:1px solid var(--line);border-radius:12px;background:#11100d;text-align:left;transition:transform 160ms var(--ease),border-color 160ms var(--ease)}
      #${ROOT_ID} .ceo-risk:hover{transform:translateY(-2px);border-color:var(--pc)}
      #${ROOT_ID} .ceo-risk small{display:block;color:var(--faint);font-size:10px;font-weight:900;text-transform:uppercase}
      #${ROOT_ID} .ceo-risk strong{display:block;margin-top:9px;font-size:20px;color:var(--pc)}
      #${ROOT_ID} .ceo-risk p{margin:7px 0 0;color:var(--muted);font-size:10px;line-height:1.35}
      #${ROOT_ID} .ceo-contrib{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      #${ROOT_ID} .ceo-contrib-col{padding:13px;border:1px solid var(--line);border-radius:13px;background:#11100d}
      #${ROOT_ID} .ceo-contrib-col h3{margin:0 0 8px;font:500 17px Georgia,'Times New Roman',serif}
      #${ROOT_ID} .ceo-sku-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;width:100%;padding:10px 0;border:0;border-top:1px solid var(--line);background:transparent;text-align:left}
      #${ROOT_ID} .ceo-sku-row b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${ROOT_ID} .ceo-sku-row span span{display:block;margin-top:4px;color:var(--faint);font-size:10px}
      #${ROOT_ID} .ceo-sku-row em{font-style:normal;font-size:12px;font-weight:900;white-space:nowrap}
      #${ROOT_ID} .ceo-drawer-back,.ceo-motion-v1.ceo-drawer-back{position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,.62);display:flex;justify-content:flex-end;align-items:flex-start;padding:72px 16px 16px;opacity:0;pointer-events:none;transition:opacity 260ms var(--ease)}
      #${ROOT_ID} .ceo-drawer-back.open,.ceo-motion-v1.ceo-drawer-back.open{opacity:1;pointer-events:auto}
      #${ROOT_ID} .ceo-drawer,.ceo-motion-v1.ceo-drawer-back .ceo-drawer{position:relative;width:min(720px,94vw);height:min(760px,calc(100vh - 96px));max-height:calc(100vh - 96px);padding:24px;background:#0e0d0b;border:1px solid var(--line);border-radius:18px 0 0 18px;box-shadow:0 26px 90px rgba(0,0,0,.56);transform:translateX(110%);transition:transform 260ms var(--ease);overflow:auto;outline:none}
      #${ROOT_ID} .ceo-drawer-back.open .ceo-drawer,.ceo-motion-v1.ceo-drawer-back.open .ceo-drawer{transform:none}
      #${ROOT_ID} .ceo-drawer h2,.ceo-motion-v1.ceo-drawer-back .ceo-drawer h2{margin:0;font:500 30px Georgia,'Times New Roman',serif}
      #${ROOT_ID} .ceo-drawer p,.ceo-motion-v1.ceo-drawer-back .ceo-drawer p{color:var(--muted);font-size:12px;line-height:1.5}
      #${ROOT_ID} .ceo-drawer-grid,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
      #${ROOT_ID} .ceo-drawer-metric,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-metric{padding:12px;border:1px solid var(--line);border-radius:11px;background:#12100d}
      #${ROOT_ID} .ceo-drawer-metric small,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-metric small{display:block;color:var(--faint);font-size:10px}
      #${ROOT_ID} .ceo-drawer-metric strong,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-metric strong{display:block;margin-top:8px;font-size:16px}
      #${ROOT_ID} .ceo-drawer-search,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-search{display:grid;gap:6px;margin-top:15px}
      #${ROOT_ID} .ceo-drawer-search span,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-search span{color:var(--faint);font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
      #${ROOT_ID} .ceo-drawer-search input,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-search input{width:100%;height:38px;border:1px solid var(--line);border-radius:10px;background:#090807;color:var(--text);padding:0 12px;outline:none}
      #${ROOT_ID} .ceo-drawer-search input:focus,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-search input:focus{border-color:var(--champ)}
      #${ROOT_ID} .ceo-drawer-list,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-list{margin-top:15px;border-top:1px solid var(--line)}
      #${ROOT_ID} .ceo-drawer-row,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,auto);gap:10px;width:100%;padding:11px 0;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left}
      #${ROOT_ID} .ceo-drawer-row:hover,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-row:hover{color:#fff7e8}
      #${ROOT_ID} .ceo-drawer-row b,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-row b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${ROOT_ID} .ceo-drawer-row span,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-row span{color:var(--muted);font-size:11px}
      #${ROOT_ID} .ceo-drawer-row small,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-row small{display:block;margin-top:4px;color:var(--faint);font-size:10px;line-height:1.35}
      #${ROOT_ID} .ceo-drawer-row em,.ceo-motion-v1.ceo-drawer-back .ceo-drawer-row em{font-style:normal;font-size:12px;font-weight:900;white-space:nowrap}
      #${ROOT_ID} .ceo-empty,.ceo-motion-v1.ceo-drawer-back .ceo-empty{padding:22px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);background:rgba(255,255,255,.018)}
      #${ROOT_ID} .ceo-sku-table{display:grid;gap:0}
      #${ROOT_ID} .ceo-sku-head{display:grid;grid-template-columns:minmax(0,1fr) minmax(82px,auto) minmax(82px,auto) minmax(56px,auto);gap:10px;padding:0 0 6px;color:var(--faint);font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      #${ROOT_ID} .ceo-sku-row{grid-template-columns:minmax(0,1fr) minmax(82px,auto) minmax(82px,auto) minmax(56px,auto);align-items:center}
      #${ROOT_ID} .ceo-sku-row .ceo-sku-cell{display:grid;gap:3px;text-align:right}
      #${ROOT_ID} .ceo-sku-row .ceo-sku-cell small{color:var(--faint);font-size:9px;text-transform:uppercase}
      #${ROOT_ID} .ceo-sku-row .ceo-sku-cell strong{font-size:12px;color:#fff4e1}
      @keyframes ceoPageReveal{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      @keyframes ceoSweep{0%{opacity:0;transform:translateX(-70%)}36%{opacity:1}100%{opacity:0;transform:translateX(70%)}}
      @keyframes ceoBarGrow{from{transform:scaleY(.04);opacity:.16}to{transform:scaleY(1)}}
      @keyframes ceoLineDraw{from{stroke-dashoffset:1500}to{stroke-dashoffset:0}}
      @keyframes ceoGrowX{from{transform:scaleX(.04);transform-origin:left;opacity:.2}to{transform:scaleX(1);transform-origin:left}}
      @media(max-width:1380px){#${ROOT_ID} .ceo-main-grid,#${ROOT_ID} .ceo-lower-grid{grid-template-columns:1fr}#${ROOT_ID} .ceo-platform-grid{grid-template-columns:repeat(3,1fr)}#${ROOT_ID} .ceo-kpis{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:860px){#${ROOT_ID} .ceo-top{flex-direction:column;min-height:0}#${ROOT_ID} .ceo-toolbar{align-items:flex-start}#${ROOT_ID} .ceo-kpis,#${ROOT_ID} .ceo-platform-grid,#${ROOT_ID} .ceo-risk-grid,#${ROOT_ID} .ceo-contrib{grid-template-columns:1fr}#${ROOT_ID} .ceo-chart{height:330px}#${ROOT_ID} .ceo-legend{display:none}}
      @media(prefers-reduced-motion:reduce){#${ROOT_ID} .ceo-motion-v1 *,#${ROOT_ID} .ceo-motion-v1 *::before,#${ROOT_ID} .ceo-motion-v1 *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    `;
    document.head.appendChild(style);
  }

  function platformRows(platformTrends) {
    return Array.isArray(platformTrends?.platforms) ? platformTrends.platforms : [];
  }

  function platformSeriesCount(platformTrends) {
    return platformRows(platformTrends).reduce((sum, platform) => (
      sum + (Array.isArray(platform?.series) ? platform.series.length : 0)
    ), 0);
  }

  function hasPlatformSeries(platformTrends) {
    return platformSeriesCount(platformTrends) > 0;
  }

  function latestSeriesDate(platformTrends) {
    const dates = [];
    platformRows(platformTrends).forEach((platform) => {
      (platform.series || []).forEach((row) => {
        const key = dateKey(row.date || row.label);
        if (key) dates.push(key);
      });
    });
    return dates.sort().pop() || '';
  }

  function latestPlatformSeriesDate(platform) {
    return (Array.isArray(platform?.series) ? platform.series : [])
      .map((row) => dateKey(row.date || row.label))
      .filter(Boolean)
      .sort()
      .pop() || '';
  }

  function platformSeriesSignal(platform) {
    return (Array.isArray(platform?.series) ? platform.series : [])
      .reduce((sum, row) => sum
        + Math.abs(finite(row.revenue))
        + Math.abs(finite(row.ordersUnits, finite(row.orderUnits, finite(row.units))))
        + Math.abs(finite(row.estimatedMargin, finite(row.financialResult))), 0);
  }

  function choosePlatformRow(primary, fallback) {
    if (!primary) return fallback || {};
    if (!fallback) return primary;
    const primarySeries = Array.isArray(primary.series) ? primary.series : [];
    const fallbackSeries = Array.isArray(fallback.series) ? fallback.series : [];
    if (!primarySeries.length && fallbackSeries.length) return { ...primary, ...fallback, label: primary.label || fallback.label };
    if (primarySeries.length && !fallbackSeries.length) return primary;

    const primarySignal = platformSeriesSignal(primary);
    const fallbackSignal = platformSeriesSignal(fallback);
    if (fallbackSignal > 0 && primarySignal === 0) return { ...primary, ...fallback, label: primary.label || fallback.label };
    if (primarySignal > 0 && fallbackSignal === 0) return primary;

    const primaryLatest = latestPlatformSeriesDate(primary);
    const fallbackLatest = latestPlatformSeriesDate(fallback);
    if (fallbackLatest > primaryLatest) return { ...primary, ...fallback, label: primary.label || fallback.label };
    if (primaryLatest > fallbackLatest) return primary;
    if (fallbackSeries.length > primarySeries.length) return { ...primary, ...fallback, label: primary.label || fallback.label };
    return primary;
  }

  function mergePlatformTrends(statePayload, cachedPayload) {
    const stateCount = platformSeriesCount(statePayload);
    const cachedCount = platformSeriesCount(cachedPayload);
    if (!stateCount && cachedCount) return cachedPayload;
    if (!cachedCount) return statePayload;

    const byKey = new Map();
    platformRows(cachedPayload).forEach((row) => {
      byKey.set(normalizePlatform(row.key), row);
    });
    platformRows(statePayload).forEach((row) => {
      const key = normalizePlatform(row.key);
      const cached = byKey.get(key) || {};
      const rowHasSeries = Array.isArray(row.series) && row.series.length > 0;
      const merged = rowHasSeries
        ? choosePlatformRow(row, cached)
        : { ...cached, ...row, series: cached.series || [] };
      byKey.set(key, merged);
    });

    const merged = {
      ...cachedPayload,
      ...statePayload,
      platforms: Array.from(byKey.values())
    };
    const latest = latestSeriesDate(merged) || dateKey(cachedPayload.latestMarketplaceDate) || dateKey(statePayload.latestMarketplaceDate);
    if (latest) merged.latestMarketplaceDate = latest;
    return merged;
  }

  function findPlatform(platformTrends, key) {
    const normalized = normalizePlatform(key);
    return platformRows(platformTrends).find((item) => normalizePlatform(item.key) === normalized)
      || (normalized === 'all' ? platformRows(platformTrends).find((item) => normalizePlatform(item.key) === 'all') : null)
      || null;
  }

  function latestDate(platformTrends, dashboard) {
    const latestMarketplaceRow = latestSeriesDate(platformTrends);
    if (latestMarketplaceRow) return latestMarketplaceRow;
    const marketplaceExplicit = dateKey(
      platformTrends?.latestMarketplaceDate
      || dashboard?.dataFreshness?.latestMarketplaceDate
      || dashboard?.latestMarketplaceDate
    );
    if (marketplaceExplicit) return marketplaceExplicit;
    const explicit = dateKey(
      platformTrends?.latestMarketplaceDate
      || dashboard?.dataFreshness?.asOfDate
      || dashboard?.asOfDate
      || dashboard?.latestMarketplaceDate
    );
    if (explicit) return explicit;
    return '';
  }

  function currentRange(asOfKey, periodKey) {
    const end = parseDate(asOfKey) || new Date();
    let start;
    if (periodKey === '7') start = addDays(end, -6);
    else if (periodKey === '14') start = addDays(end, -13);
    else start = new Date(end.getFullYear(), end.getMonth(), 1);
    const length = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const prevEnd = addDays(start, -1);
    const prevStart = addDays(prevEnd, -(length - 1));
    return { start: iso(start), end: iso(end), prevStart: iso(prevStart), prevEnd: iso(prevEnd), length };
  }

  function rowsInRange(series, start, end) {
    return (Array.isArray(series) ? series : [])
      .filter((row) => {
        const key = dateKey(row.date || row.label);
        return key && key >= start && key <= end;
      })
      .sort((left, right) => dateKey(left.date || left.label).localeCompare(dateKey(right.date || right.label)));
  }

  function explicitNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function firstExplicitNumber(...values) {
    for (const value of values) {
      const number = explicitNumber(value);
      if (number !== null) return number;
    }
    return null;
  }

  function orderUnitsForRow(row) {
    return firstExplicitNumber(row?.ordersUnits, row?.orderUnits, row?.units) ?? 0;
  }

  function buyoutUnitsForRow(row) {
    return firstExplicitNumber(
      row?.deliveredUnits,
      row?.buyoutUnits,
      row?.boughtUnits,
      row?.buys,
      row?.wbSellerSummaryBuyoutUnits,
      row?.wbSellerSummary?.buyoutUnits
    );
  }

  function emptyTotal() {
    return { orders: 0, buys: 0, revenue: 0, marginRub: 0, orderRows: 0, buyoutRows: 0, buyoutOrders: 0 };
  }

  function sumRows(rows) {
    return rows.reduce((acc, row) => {
      const orders = orderUnitsForRow(row);
      const buys = buyoutUnitsForRow(row);
      acc.orders += orders;
      if (orders > 0) acc.orderRows += 1;
      if (buys !== null) {
        acc.buys += buys;
        acc.buyoutRows += 1;
        acc.buyoutOrders += orders;
      }
      acc.revenue += finite(row.revenue);
      acc.marginRub += finite(row.estimatedMargin, finite(row.financialResult));
      return acc;
    }, emptyTotal());
  }

  function addTotals(left, right) {
    const result = emptyTotal();
    Object.keys(result).forEach((key) => {
      result[key] = finite(left?.[key]) + finite(right?.[key]);
    });
    return result;
  }

  function platformTotalsInRange(platformTrends, start, end) {
    return platformRows(platformTrends)
      .filter((platform) => normalizePlatform(platform.key) !== 'all')
      .map((platform) => sumRows(rowsInRange(platform.series, start, end)))
      .reduce((acc, total) => addTotals(acc, total), emptyTotal());
  }

  function hasBuyoutSource(total) {
    return finite(total?.buyoutRows) > 0;
  }

  function buyoutBase(total) {
    return finite(total?.buyoutOrders) > 0 ? finite(total.buyoutOrders) : finite(total?.orders);
  }

  function buyoutRate(total) {
    if (!hasBuyoutSource(total)) return null;
    const base = buyoutBase(total);
    return base > 0 ? finite(total?.buys) / base : null;
  }

  function buyoutDisplay(total) {
    return hasBuyoutSource(total) ? fmtInt(total?.buys) : 'нет источника';
  }

  function buyoutHint(total) {
    const rate = buyoutRate(total);
    if (rate === null) return 'выкуп не опубликован';
    const suffix = buyoutBase(total) < finite(total?.orders) ? ' по источникам' : '';
    return `выкуп ${fmtPct(rate)}${suffix}`;
  }

  function fillBuyoutFromSource(target, source) {
    if (!target || hasBuyoutSource(target) || !hasBuyoutSource(source)) return target;
    target.buys = finite(source.buys);
    target.buyoutRows = finite(source.buyoutRows);
    target.buyoutOrders = finite(source.buyoutOrders);
    return target;
  }

  function rawRevenueMetrics(metrics) {
    const map = {};
    (metrics?.metrics || []).forEach((item) => {
      if (item?.metric_id !== 'sales.raw_revenue') return;
      const key = normalizePlatform(item.scope?.platform);
      const drill = item.drilldown?.[0] || {};
      map[key] = {
        revenue: finite(item.displayed_value, finite(item.raw_value)),
        units: finite(drill.units),
        status: item.data_status || '',
        confidence: item.confidence || '',
        periodFrom: item.period_from || '',
        periodTo: item.period_to || ''
      };
    });
    return map;
  }

  function applyRawRevenueFallback(total, rawMetric, rows = []) {
    if (!total || !rawMetric) return total;
    if (Array.isArray(rows) && rows.length && finite(total.revenue) > 0) return total;
    const revenue = numberOrNull(rawMetric.revenue);
    const units = numberOrNull(rawMetric.units);
    if (revenue !== null && revenue > 0 && finite(total.revenue) <= 0) {
      total.revenue = revenue;
      total.rawRevenueFallback = true;
    }
    if (units !== null && units > 0 && finite(total.orders) <= 0) {
      total.orders = units;
      total.orderRows = 1;
      total.rawRevenueFallback = true;
    }
    return total;
  }

  function emptyAdsBreakdown() {
    return {
      total: 0,
      internal: 0,
      media: 0,
      external: 0,
      kz: 0,
      ozon: 0,
      yandex: 0,
      other: 0
    };
  }

  function mergeAdsBreakdown(left, right) {
    const merged = emptyAdsBreakdown();
    Object.keys(merged).forEach((key) => {
      merged[key] = finite(left?.[key]) + finite(right?.[key]);
    });
    return merged;
  }

  function isCoreAdsPlatform(platform) {
    return ['all', 'wb', 'ozon', 'ya'].includes(normalizePlatform(platform));
  }

  function adsSummaryPlatforms(adsSummary) {
    if (Array.isArray(adsSummary?.platforms)) return adsSummary.platforms;
    if (adsSummary?.platforms && typeof adsSummary.platforms === 'object') return Object.values(adsSummary.platforms);
    return [];
  }

  function adsSummaryPlatformKey(row) {
    return normalizePlatform(row?.platformKey || row?.platform || row?.key || row?.id || row?.label);
  }

  function adsSummaryPointDate(row) {
    return dateKey(row?.date || row?.day || row?.dateKey || row?.label);
  }

  function normalizeAdsSummaryPoint(row, platform) {
    const key = normalizePlatform(platform || row?.platformKey || row?.platform || row?.key);
    return {
      ...row,
      date: adsSummaryPointDate(row),
      label: adsSummaryPointDate(row) || row?.label || '',
      platformKey: key,
      __adsSummary: true
    };
  }

  function aggregateAdsSummarySeries(platforms) {
    const byDate = new Map();
    (Array.isArray(platforms) ? platforms : []).forEach((platform) => {
      const key = adsSummaryPlatformKey(platform);
      if (!key || key === 'all') return;
      (Array.isArray(platform?.series) ? platform.series : []).forEach((point) => {
        const day = adsSummaryPointDate(point);
        if (!day) return;
        const current = byDate.get(day) || { date: day, label: day, spend: 0, views: 0, clicks: 0, orders: 0, revenue: 0, platformKey: 'all', __adsSummary: true };
        current.spend += finite(point?.spend ?? point?.adsSpend);
        current.views += finite(point?.views ?? point?.adsImpressions ?? point?.shows);
        current.clicks += finite(point?.clicks ?? point?.adsClicks);
        current.orders += finite(point?.orders ?? point?.ordersUnits);
        current.revenue += finite(point?.revenue ?? point?.ordersRevenue ?? point?.deliveredRevenue);
        byDate.set(day, current);
      });
    });
    return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
  }

  function adsSummarySeriesForPlatform(adsSummary, platform) {
    const key = normalizePlatform(platform);
    const platforms = adsSummaryPlatforms(adsSummary);
    const direct = platforms.find((item) => adsSummaryPlatformKey(item) === key);
    if (direct && Array.isArray(direct.series)) {
      return direct.series.map((point) => normalizeAdsSummaryPoint(point, key));
    }
    if (key === 'all') return aggregateAdsSummarySeries(platforms);
    return [];
  }

  function adsSummaryHasPlatform(adsSummary, platform) {
    const key = normalizePlatform(platform);
    if (!key || key === 'all') return false;
    return adsSummaryPlatforms(adsSummary).some((item) => adsSummaryPlatformKey(item) === key);
  }

  function adsSummaryRowsInRange(adsSummary, platform, start, end) {
    return adsSummarySeriesForPlatform(adsSummary, platform)
      .filter((row) => row.date && row.date >= start && row.date <= end)
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  function latestAdsSummaryDate(adsSummary, platform) {
    return adsSummarySeriesForPlatform(adsSummary, platform)
      .map((row) => row.date)
      .filter(Boolean)
      .sort()
      .pop() || '';
  }

  function adsSummaryRowsForRangeOrLatest(adsSummary, platform, range, periodKey) {
    const exactRows = adsSummaryRowsInRange(adsSummary, platform, range.start, range.end);
    if (exactRows.length) {
      return {
        rows: exactRows,
        previousRows: adsSummaryRowsInRange(adsSummary, platform, range.prevStart, range.prevEnd),
        range,
        fallback: false,
        source: 'ads_summary'
      };
    }
    const latest = latestAdsSummaryDate(adsSummary, platform);
    if (!latest) {
      return { rows: [], previousRows: [], range, fallback: false, source: 'ads_summary' };
    }
    const fallbackRange = currentRange(latest, periodKey);
    return {
      rows: adsSummaryRowsInRange(adsSummary, platform, fallbackRange.start, fallbackRange.end),
      previousRows: adsSummaryRowsInRange(adsSummary, platform, fallbackRange.prevStart, fallbackRange.prevEnd),
      range: fallbackRange,
      fallback: true,
      source: 'ads_summary'
    };
  }

  function adsSummaryPointBreakdown(row, platform) {
    const requested = normalizePlatform(platform);
    const rowPlatform = normalizePlatform(row?.platformKey || row?.platform || requested);
    if (requested !== 'all' && rowPlatform !== requested) return emptyAdsBreakdown();
    const total = finite(row?.spend ?? row?.adsSpend);
    const breakdown = {
      ...emptyAdsBreakdown(),
      total,
      internal: total
    };
    if (rowPlatform === 'ozon') breakdown.ozon = total;
    else if (rowPlatform === 'ya') breakdown.yandex = total;
    else if (!['all', 'wb'].includes(rowPlatform)) breakdown.other = total;
    return breakdown;
  }

  function wbAdsBreakdown(row) {
    const media = positiveFinite(row.wbMedia, row.wbMediaFinanceDeduction);
    const external = finite(row.externalAds) + finite(row.pvzAds) + finite(row.brandZoneAds) + finite(row.overviewsAds);
    const kz = positiveFinite(row.reviewPoints, row.wbReviewDeduction, row.contentFactoryAds, row.reviewPointsCashbackControl);
    const explicitInternal = positiveFinite(
      row.wbPromotion,
      row.wbPromotionFromAds,
      row.wbPromotionFinanceDeduction,
      row.wbAds,
      row.internalAds
    );
    const baseSpend = positiveFinite(
      row.wbIuFactAdsGross,
      row.wbApiSpendFact,
      row.spendFact,
      row.spendFactDrr,
      row.spendFactTotal,
      row.wbRawApiSpendFact
    );
    let internal = explicitInternal || Math.max(0, baseSpend - media);
    const subtotal = internal + media + external + kz;
    const total = Math.max(baseSpend + external + kz, subtotal);
    const other = Math.max(0, total - subtotal);
    internal += other;
    return {
      total,
      internal,
      media,
      external,
      kz,
      ozon: 0,
      yandex: 0,
      other
    };
  }

  function nearlyEqualMoney(left, right) {
    const first = Number(left);
    const second = Number(right);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return false;
    return Math.abs(first - second) <= Math.max(1, Math.abs(second) * 0.001);
  }

  function ozonFinanceNetSpend(row) {
    const gross = numberOrNull(row?.ozonDrrSpendGross);
    if (gross === null) return null;
    const excluded = finite(row?.ozonDrrExcludedTotal);
    return Math.max(0, gross - excluded);
  }

  function dedupeOzonFactSpend(value, row) {
    const spend = numberOrNull(value);
    if (spend === null) return null;
    const plan = numberOrNull(row?.planSpendOzon);
    const financeNet = ozonFinanceNetSpend(row);
    if (spend > 0 && plan !== null && plan > 0 && financeNet !== null && nearlyEqualMoney(spend, financeNet + plan)) {
      return financeNet;
    }
    return Math.max(0, spend);
  }

  function ozonAdSpendFact(row) {
    const spendFact = numberOrNull(row?.spendFactOzon);
    if (spendFact !== null) return dedupeOzonFactSpend(spendFact, row);
    const alternateFact = positiveFinite(row?.ozonSpendFact, row?.ozonAdsFact, row?.adsFactOzon);
    if (alternateFact > 0) return dedupeOzonFactSpend(alternateFact, row);
    const ambiguous = numberOrNull(row?.ozonAds);
    const plan = numberOrNull(row?.planSpendOzon);
    if (ambiguous !== null && ambiguous > 0 && (plan === null || Math.abs(ambiguous - plan) > 0.01)) {
      return dedupeOzonFactSpend(ambiguous, row);
    }
    return 0;
  }

  function ozonAdsBreakdown(row) {
    const internal = ozonAdSpendFact(row || {});
    return {
      ...emptyAdsBreakdown(),
      total: internal,
      internal,
      ozon: internal
    };
  }

  function yandexAdsBreakdown(row) {
    const internal = positiveFinite(row.spendFactYandex, row.yandexSpendFact, row.yaAds);
    return {
      ...emptyAdsBreakdown(),
      total: internal,
      internal,
      yandex: internal
    };
  }

  function adsDailyBreakdown(row, platform) {
    const key = normalizePlatform(platform);
    if (row?.__adsSummary) return adsSummaryPointBreakdown(row, key);
    if (key === 'wb') return wbAdsBreakdown(row || {});
    if (key === 'ozon') return ozonAdsBreakdown(row || {});
    if (key === 'ya') return yandexAdsBreakdown(row || {});
    if (key !== 'all') return emptyAdsBreakdown();
    return [wbAdsBreakdown(row || {}), ozonAdsBreakdown(row || {}), yandexAdsBreakdown(row || {})]
      .reduce((acc, item) => mergeAdsBreakdown(acc, item), emptyAdsBreakdown());
  }

  function adsRowsBreakdown(rows, platform) {
    return (Array.isArray(rows) ? rows : [])
      .reduce((acc, row) => mergeAdsBreakdown(acc, adsDailyBreakdown(row, platform)), emptyAdsBreakdown());
  }

  function latestFactDate(rows, platform) {
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => adsDailyValue(row, platform) > 0)
      .map((row) => dateKey(row?.date || row?.label))
      .filter(Boolean)
      .sort()
      .pop() || '';
  }

  function latestRowDate(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => dateKey(row?.date || row?.label))
      .filter(Boolean)
      .sort()
      .pop() || '';
  }

  function adsFreshnessRow(model) {
    const platform = normalizePlatform(model?.platform);
    if (!['ozon', 'wb', 'ya'].includes(platform)) return null;
    const rows = Array.isArray(model?.adRows) ? model.adRows : [];
    const latestFact = latestFactDate(rows, platform);
    const latestRow = latestRowDate(rows);
    const fallback = model?.adsFromFallback ? ' · fallback' : '';
    if (platform === 'ozon') {
      const sourceRows = rows.reduce((sum, row) => sum + finite(row?.ozonFinanceSourceRows, finite(row?.sourceRows)), 0);
      const excluded = rows.reduce((sum, row) => sum + finite(row?.ozonDrrExcludedTotal), 0);
      const value = latestFact ? `факт до ${shortDate(latestFact)}` : (latestRow ? `нет рекламного факта до ${shortDate(latestRow)}` : 'нет строк');
      const detail = [
        `Ozon Finance API${fallback}`,
        sourceRows ? `строк ${fmtInt(sourceRows)}` : '',
        excluded ? `исключено ${fmtMoneyFull(excluded)}` : ''
      ].filter(Boolean).join(' · ');
      return { label: 'Актуальность Ozon', value, detail };
    }
    const value = latestFact ? `факт до ${shortDate(latestFact)}` : (latestRow ? `нет рекламного факта до ${shortDate(latestRow)}` : 'нет строк');
    return { label: 'Актуальность рекламы', value, detail: `${model?.adsSource || 'iu_drr'}${fallback}` };
  }

  function adsDailyValue(row, platform) {
    return adsDailyBreakdown(row, platform).total;
  }

  function adsPlanDailyValue(row, platform) {
    const key = normalizePlatform(platform);
    if (key === 'wb') return finite(row.planSpendWb, finite(row.controlPlanSpendWb));
    if (key === 'ozon') return finite(row.planSpendOzon);
    if (key === 'ya') return finite(row.planSpendYandex);
    if (key !== 'all') return 0;
    return finite(row.planSpendWb, finite(row.controlPlanSpendWb))
      + finite(row.planSpendOzon)
      + finite(row.planSpendYandex);
  }

  function revenueDailyValue(row, platform) {
    const key = normalizePlatform(platform);
    if (key === 'wb') return finite(row.revenueWb, finite(row.wbRawApiRevenue));
    if (key === 'ozon') return finite(row.revenueOzon, finite(row.revenueOzonApiRaw));
    if (key === 'ya') return finite(row.revenueYandex);
    return finite(row.revenueWb, finite(row.wbRawApiRevenue))
      + finite(row.revenueOzon, finite(row.revenueOzonApiRaw))
      + finite(row.revenueYandex);
  }

  function iuRowsInRange(iu, start, end) {
    return (Array.isArray(iu?.daily) ? iu.daily : [])
      .filter((row) => {
        const day = dateKey(row?.date || row?.label || row?.period);
        return day && day >= start && day <= end;
      })
      .sort((left, right) => dateKey(left?.date || left?.label || left?.period).localeCompare(dateKey(right?.date || right?.label || right?.period)));
  }

  function latestIuDate(iu) {
    return (Array.isArray(iu?.daily) ? iu.daily : [])
      .map((row) => dateKey(row?.date || row?.label || row?.period))
      .filter(Boolean)
      .sort()
      .pop() || '';
  }

  function iuRowsForRangeOrLatest(iu, range, periodKey) {
    const exactRows = iuRowsInRange(iu, range.start, range.end);
    if (exactRows.length) {
      return {
        rows: exactRows,
        previousRows: iuRowsInRange(iu, range.prevStart, range.prevEnd),
        range,
        fallback: false
      };
    }
    const latest = latestIuDate(iu);
    if (!latest) {
      return {
        rows: exactRows,
        previousRows: [],
        range,
        fallback: false
      };
    }
    const fallbackRange = currentRange(latest, periodKey);
    return {
      rows: iuRowsInRange(iu, fallbackRange.start, fallbackRange.end),
      previousRows: iuRowsInRange(iu, fallbackRange.prevStart, fallbackRange.prevEnd),
      range: fallbackRange,
      fallback: true
    };
  }

  function monthlyPlanChannel(dashboard, platform) {
    const key = normalizePlatform(platform);
    const active = dashboard?.companyPlan?.activeMonth || {};
    const channels = active.channels || dashboard?.companyPlan?.months?.[active.monthKey]?.channels || {};
    if (key === 'all') {
      return {
        revenue: finite(active.planRevenueMonth, finite(active.revenue)),
        dailyRevenue: finite(active.planRevenueMonth, finite(active.revenue)) / Math.max(1, finite(active.days, 30)),
        label: active.label || dashboard?.company_plan_month_label || ''
      };
    }
    const channel = channels[key] || {};
    return {
      revenue: finite(channel.revenue),
      dailyRevenue: finite(channel.dailyRevenue, finite(channel.revenue) / Math.max(1, finite(active.days, 30))),
      label: channel.label || platformMeta(key).label
    };
  }

  function buildSeries(model, metricKey) {
    const meta = METRICS[metricKey] || METRICS.revenue;
    const rows = metricKey === 'ads' ? (model.adRows || model.iuRows || []) : model.currentRows;
    const prev = metricKey === 'ads' ? (model.previousAdRows || model.prevIuRows || []) : model.previousRows;
    const planChannel = monthlyPlanChannel(model.dashboard, model.platform);
    const planUnitsPerDay = finite(model.dashboard?.brandSummary?.[0]?.plan_units) / Math.max(1, finite(model.dashboard?.companyPlan?.activeMonth?.days, 30));
    const platformShare = model.total.revenue > 0 && model.allTotal.revenue > 0 ? model.total.revenue / model.allTotal.revenue : 1;
    const buyoutTarget = buyoutRate(model.total);
    const marginTarget = model.plan.marginPct;
    const rangeLength = Math.max(1, finite(model.range?.length, rows.length || 1));
    const planRevenueDaily = finite(planChannel.dailyRevenue) || (finite(model.plan?.revenue) > 0 ? finite(model.plan.revenue) / rangeLength : 0);
    const avgCheck = model.total.orders > 0 ? model.total.revenue / model.total.orders : 0;
    const planOrdersByRevenue = avgCheck > 0 && planRevenueDaily > 0 ? planRevenueDaily / avgCheck : 0;
    const planOrdersDailyRaw = planUnitsPerDay * platformShare;
    const planOrdersDaily = planOrdersDailyRaw > 0 ? planOrdersDailyRaw : planOrdersByRevenue;
    const make = (row, index, current) => {
      if (metricKey === 'ads') {
        const prevIu = prev[index] || {};
        return {
          date: dateKey(row.date || row.label) || model.adRange?.start || model.range.start,
          value: adsDailyValue(row, model.platform),
          plan: adsPlanDailyValue(row, model.platform),
          prev: adsDailyValue(prevIu, model.platform)
        };
      }
      const fallbackPrev = prev[index] || {};
      const base = current ? row : fallbackPrev;
      const revenue = finite(base.revenue);
      const orders = orderUnitsForRow(base);
      const buys = buyoutUnitsForRow(base);
      const previousOrders = orderUnitsForRow(fallbackPrev);
      const previousBuys = buyoutUnitsForRow(fallbackPrev);
      const marginRub = finite(base.estimatedMargin, finite(base.financialResult));
      const day = dateKey(row.date || row.label || base.date || base.label) || model.range.start;
      const iuRow = model.iuRowsByDate[day] || {};
      if (metricKey === 'orders') return { date: day, value: orders, plan: planOrdersDaily || orders, prev: previousOrders };
      if (metricKey === 'buys') return { date: day, value: buys, plan: buyoutTarget === null ? null : (planOrdersDaily || orders) * buyoutTarget, prev: previousBuys };
      if (metricKey === 'revenue') return { date: day, value: revenue, plan: planRevenueDaily || revenue, prev: finite(fallbackPrev.revenue) };
      if (metricKey === 'margin') {
        const prevRevenue = finite(fallbackPrev.revenue);
        const prevMargin = finite(fallbackPrev.estimatedMargin, finite(fallbackPrev.financialResult));
        return { date: day, value: revenue ? marginRub / revenue : null, plan: marginTarget, prev: prevRevenue ? prevMargin / prevRevenue : null };
      }
      const adsValue = adsDailyValue(iuRow, model.platform);
      const prevIu = model.prevIuRows[index] || {};
      return { date: day, value: adsValue, plan: adsPlanDailyValue(iuRow, model.platform), prev: adsDailyValue(prevIu, model.platform) };
    };
    return {
      chart: meta.chart,
      points: rows.map((row, index) => make(row, index, true)),
      title: `${meta.label} по дням`,
      caption: meta.chart === 'bars'
        ? 'Текущий период, предыдущий период и плановая линия. Клик по дню откроет drill-down.'
        : 'Ставка показана линией: текущая, предыдущая и целевой ориентир.'
    };
  }

  function buildPlatformCards(model) {
    const raw = rawRevenueMetrics(model.metrics);
    const allRevenue = model.allTotal.revenue || Object.values(raw).reduce((sum, row) => sum + finite(row.revenue), 0);
    const trendByKey = new Map();
    platformRows(model.platformTrends).forEach((platform) => {
      const key = normalizePlatform(platform.key);
      if (key && key !== 'all' && !trendByKey.has(key)) trendByKey.set(key, platform);
    });
    return MARKETPLACE_ORDER
      .map((key) => {
        const platform = trendByKey.get(key) || { key, label: platformMeta(key).label, series: [] };
        let rows = rowsInRange(platform.series, model.range.start, model.range.end);
        let prevRows = rowsInRange(platform.series, model.range.prevStart, model.range.prevEnd);
        if (!rows.length) {
          const platformLatest = latestPlatformSeriesDate(platform);
          if (platformLatest) {
            const platformRange = currentRange(platformLatest, model.period || '14');
            rows = rowsInRange(platform.series, platformRange.start, platformRange.end);
            prevRows = rowsInRange(platform.series, platformRange.prevStart, platformRange.prevEnd);
          }
        }
        const total = sumRows(rows);
        const previous = sumRows(prevRows);
        applyRawRevenueFallback(total, raw[key], rows);
        const adsRows = !isCoreAdsPlatform(key)
          ? adsSummaryRowsInRange(model.adsSummary, key, model.range.start, model.range.end)
          : (model.coreAdRows || model.iuRows || []);
        const ads = adsRows.reduce((sum, row) => sum + adsDailyValue(row, key), 0);
        return {
          key,
          label: platform.label || platformMeta(key).label,
          color: platformMeta(key).color,
          total,
          previous,
          ads,
          drr: total.revenue > 0 ? ads / total.revenue : null,
          marginPct: total.revenue > 0 ? total.marginRub / total.revenue : null,
          share: allRevenue > 0 ? total.revenue / allRevenue : 0,
          sourceStatus: raw[key]?.status || (rows.length ? '' : 'no_daily')
        };
      });
  }

  function buildSkuRows(model) {
    const items = Array.isArray(model.productLeaderboard?.items) ? model.productLeaderboard.items : [];
    const positive = items
      .filter((item) => finite(item.revenue) > 0 || finite(item.orders) > 0)
      .sort((left, right) => finite(right.revenue) - finite(left.revenue))
      .slice(0, 6)
      .map((item) => ({
        key: item.articleKey || item.article || item.id,
        name: item.name || item.title || item.article || 'SKU',
        owner: item.owner || 'Без owner',
        revenue: finite(item.revenue),
        orders: finite(item.orders),
        buys: finite(item.buys),
        marginPct: finite(item.income) && finite(item.revenue) ? finite(item.income) / finite(item.revenue) : null,
        delta: finite(item.orders),
        driver: item.traffic || item.category || 'контент'
      }));
    const focus = (model.dashboard?.focusTop || model.dashboard?.underPlan || [])
      .slice(0, 6)
      .map((item) => ({
        key: item.article || item.articleKey || item.id,
        name: item.product_name_final || item.name || item.article || 'SKU',
        owner: item.owner_name || item.owner || 'Без owner',
        revenue: finite(item.orders_value),
        orders: finite(item.fact_feb26_units),
        buys: 0,
        marginPct: null,
        delta: -finite(item.focus_score, 1),
        driver: item.focus_reasons || 'риск'
      }));
    return { positive, focus };
  }

  function articleKeyOf(item) {
    return String(item?.articleKey || item?.article || item?.id || '').trim();
  }

  function textOf(item) {
    return [
      item?.platform,
      item?.marketplace,
      item?.channel,
      item?.traffic,
      item?.category,
      item?.focus_reasons,
      item?.signal?.title,
      item?.signal?.label,
      item?.revenueProvenance,
      item?.incomeProvenance
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function explicitPlatformSet(item) {
    const text = textOf(item);
    const set = new Set();
    if (/\bwb\b|wildberries|\bвб\b/.test(text)) set.add('wb');
    if (/ozon|озон/.test(text)) set.add('ozon');
    if (/yandex|\bya\b|янд|маркет/.test(text)) set.add('ya');
    if (/goldapple|золот|з\W?я/.test(text)) set.add('goldapple');
    if (/letu|лэту|лету/.test(text)) set.add('letu');
    if (/megamarket|мегамаркет/.test(text)) set.add('megamarket');
    if (/samokat|самокат/.test(text)) set.add('samokat');
    if (/magnit|магнит/.test(text)) set.add('magnit');
    return set;
  }

  function itemMatchesPlatform(item, platform, allowPriceFallback = false) {
    const key = normalizePlatform(platform);
    if (key === 'all') return true;
    const explicit = explicitPlatformSet(item);
    if (explicit.size) return explicit.has(key);
    if (!allowPriceFallback) return false;
    if (key === 'wb') return finite(item?.priceWb) > 0;
    if (key === 'ozon') return finite(item?.priceOzon) > 0;
    return false;
  }

  function platformUnitPrice(item, platform) {
    const key = normalizePlatform(platform);
    if (key === 'wb') return finite(item?.priceWb, finite(item?.price));
    if (key === 'ozon') return finite(item?.priceOzon, finite(item?.price));
    return finite(item?.price);
  }

  function dashboardSkuLookup(dashboard) {
    const lookup = {};
    ['focusTop', 'underPlan', 'toWork', 'lowStock', 'topReturns', 'unassigned'].forEach((name) => {
      (Array.isArray(dashboard?.[name]) ? dashboard[name] : []).forEach((item) => {
        const key = articleKeyOf(item);
        if (key && !lookup[key]) lookup[key] = item;
      });
    });
    return lookup;
  }

  function fallbackPlanRevenue(revenue, completionPct, planUnits, unitPrice) {
    if (finite(revenue) > 0 && Number.isFinite(Number(completionPct)) && finite(completionPct) > 0) return finite(revenue) / finite(completionPct);
    if (finite(planUnits) > 0 && finite(unitPrice) > 0) return finite(planUnits) * finite(unitPrice);
    return 0;
  }

  function allocatedPlanRevenue(model, revenue) {
    const platform = normalizePlatform(model?.platform);
    const platformCard = (model?.platformCards || []).find((item) => item.key === platform);
    const totalRevenue = finite(model?.total?.revenue) || finite(platformCard?.total?.revenue) || finite(model?.allTotal?.revenue);
    const planChannel = monthlyPlanChannel(model?.dashboard, platform);
    const rangeLength = finite(model?.range?.length, 0);
    const activeDays = Math.max(1, finite(model?.dashboard?.companyPlan?.activeMonth?.days, 30));
    const planRevenue = finite(model?.plan?.revenue)
      || finite(planChannel?.revenueToDate)
      || (finite(planChannel?.dailyRevenue) > 0 && rangeLength > 0 ? finite(planChannel.dailyRevenue) * rangeLength : 0)
      || (finite(planChannel?.revenue) > 0 && rangeLength > 0 ? finite(planChannel.revenue) * rangeLength / activeDays : 0);
    return totalRevenue > 0 && planRevenue > 0 && finite(revenue) > 0 ? planRevenue * finite(revenue) / totalRevenue : 0;
  }

  function skuRowValue(item, platform, share = 1) {
    const key = normalizePlatform(platform);
    const orders = finite(item?.orders, finite(item?.fact_feb26_units));
    const unitPrice = platformUnitPrice(item, key);
    if (key !== 'all' && orders > 0 && unitPrice > 0) return orders * unitPrice;
    const revenue = finite(item?.revenue, finite(item?.orders_value, finite(item?.content_revenue)));
    return key === 'all' ? revenue : revenue * (share || 1);
  }

  function usesSharedSkuFallback(platform) {
    return ['all', 'wb', 'ozon', 'ya'].includes(normalizePlatform(platform));
  }

  function platformArticlePlatforms(payload) {
    if (Array.isArray(payload?.platforms)) return payload.platforms;
    if (payload?.platforms && typeof payload.platforms === 'object') return Object.values(payload.platforms);
    return [];
  }

  function platformArticleSource(platformTrends, platformSkuArticles, platform) {
    const key = normalizePlatform(platform);
    if (!key || key === 'all') return null;
    const external = platformArticlePlatforms(platformSkuArticles).find((item) => normalizePlatform(item.key || item.platformKey) === key);
    if (external && Array.isArray(external.articles) && external.articles.length) return external;
    const row = findPlatform(platformTrends, key);
    const articles = Array.isArray(row?.articles) ? row.articles : [];
    return articles.length ? row : null;
  }

  function normalizedArticleDailyRow(row) {
    if (Array.isArray(row)) {
      return {
        date: row[0],
        label: row[0],
        units: finite(row[1]),
        ordersUnits: finite(row[2], finite(row[1])),
        revenue: finite(row[3]),
        estimatedMargin: finite(row[4]),
        price: finite(row[5])
      };
    }
    return row || {};
  }

  function articleRowsInPeriod(article, range) {
    const rows = (Array.isArray(article?.daily) ? article.daily : []).map(normalizedArticleDailyRow);
    return rowsInRange(rows, range.start, range.end);
  }

  function articleTotalForRange(article, range) {
    return sumRows(articleRowsInPeriod(article, range));
  }

  function buildPlatformArticleSkuRows(model, platform) {
    const source = platformArticleSource(model.platformTrends, model.platformSkuArticles, platform);
    if (!source) return null;
    const articleRows = (source.articles || [])
      .map((article) => {
        const current = articleTotalForRange(article, model.range);
        const previous = articleTotalForRange(article, {
          start: model.range.prevStart,
          end: model.range.prevEnd
        });
        const key = articleKeyOf(article) || article?.sourceArticleKey || article?.name;
        const previousRevenue = finite(previous.revenue);
        const currentRevenue = finite(current.revenue);
        return {
          key,
          name: article.name || article.title || article.article || key || 'SKU',
          owner: article.owner || 'Без owner',
          revenue: currentRevenue,
          planRevenue: previousRevenue,
          orders: finite(current.orders),
          planUnits: finite(previous.orders),
          buys: finite(current.buys),
          completionPct: previousRevenue > 0 ? currentRevenue / previousRevenue : null,
          marginPct: currentRevenue > 0 ? finite(current.marginRub) / currentRevenue : numberOrNull(article.marginPct ?? article.estimatedMarginPct),
          delta: currentRevenue - previousRevenue,
          driver: `${platformMeta(platform).short} · SKU сети`,
          fallback: false,
          sourcePlatform: normalizePlatform(platform)
        };
      })
      .filter((item) => item.key && (finite(item.revenue) > 0 || finite(item.planRevenue) > 0 || finite(item.orders) > 0 || finite(item.planUnits) > 0));
    const positive = articleRows
      .filter((item) => finite(item.revenue) > 0 || finite(item.orders) > 0)
      .sort((left, right) => finite(right.revenue) - finite(left.revenue))
      .slice(0, 6);
    const focus = articleRows
      .filter((item) => finite(item.planRevenue) > finite(item.revenue))
      .sort((left, right) => (finite(right.planRevenue) - finite(right.revenue)) - (finite(left.planRevenue) - finite(left.revenue)))
      .slice(0, 6)
      .map((item) => ({
        ...item,
        delta: -Math.abs(finite(item.planRevenue) - finite(item.revenue)),
        driver: `${platformMeta(platform).short} · падение к прошлому периоду`
      }));
    return { positive, focus };
  }

  function buildSkuRows(model) {
    const platform = normalizePlatform(model.platform);
    if (!usesSharedSkuFallback(platform)) {
      return buildPlatformArticleSkuRows(model, platform) || { positive: [], focus: [] };
    }
    const platformCard = (model.platformCards || []).find((item) => item.key === platform);
    const platformShare = platform === 'all'
      ? 1
      : finite(platformCard?.share, model.allTotal?.revenue > 0 ? finite(model.total?.revenue) / finite(model.allTotal.revenue) : 0);
    const lookup = dashboardSkuLookup(model.dashboard);
    const items = Array.isArray(model.productLeaderboard?.items) ? model.productLeaderboard.items : [];
    const positiveSource = items
      .filter((item) => finite(item.revenue) > 0 || finite(item.orders) > 0)
      .filter((item) => itemMatchesPlatform(item, platform, true));
    const positiveBase = positiveSource.length ? positiveSource : items.filter((item) => finite(item.revenue) > 0 || finite(item.orders) > 0);
    const positive = positiveBase
      .map((item) => {
        const key = articleKeyOf(item);
        const planSource = lookup[key] || {};
        const completionPct = numberOrNull(planSource.plan_completion_feb26_pct);
        const unitPrice = platformUnitPrice(item, platform);
        const revenue = skuRowValue(item, platform, platformShare);
        const planUnits = finite(planSource.plan_feb26_units);
        let planRevenue = fallbackPlanRevenue(revenue, completionPct, planUnits, unitPrice);
        if (!planRevenue) planRevenue = allocatedPlanRevenue(model, revenue);
        return {
          key,
          name: item.name || item.title || item.article || 'SKU',
          owner: item.owner || planSource.owner_name || 'Р‘РµР· owner',
          revenue,
          planRevenue,
          orders: finite(item.orders),
          planUnits,
          buys: finite(item.buys),
          completionPct: planRevenue > 0 ? revenue / planRevenue : completionPct,
          marginPct: finite(item.income) && finite(item.revenue) ? finite(item.income) / finite(item.revenue) : null,
          delta: finite(item.orders),
          driver: `${platformMeta(platform).short} В· ${item.traffic || item.category || 'РєРѕРЅС‚РµРЅС‚'}${positiveSource.length ? '' : ' В· РѕР±С‰РёР№ СЃСЂРµР·'}`,
          fallback: !positiveSource.length && platform !== 'all'
        };
      })
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 6);
    const focusRaw = model.dashboard?.focusTop || model.dashboard?.underPlan || [];
    const focusSource = focusRaw.filter((item) => itemMatchesPlatform(item, platform, false) || platform === 'all');
    const focusBase = focusSource.length || usesSharedSkuFallback(platform) ? (focusSource.length ? focusSource : focusRaw) : [];
    const focus = focusBase
      .slice(0, 6)
      .map((item) => {
        const revenue = finite(item.orders_value) * (platform === 'all' ? 1 : platformShare || 1);
        const completionPct = numberOrNull(item.plan_completion_feb26_pct);
        let planRevenue = fallbackPlanRevenue(revenue, completionPct, item.plan_feb26_units, 0);
        if (!planRevenue) planRevenue = allocatedPlanRevenue(model, revenue);
        return {
          key: item.article || item.articleKey || item.id,
          name: item.product_name_final || item.name || item.article || 'SKU',
          owner: item.owner_name || item.owner || 'Р‘РµР· owner',
          revenue,
          planRevenue,
          orders: finite(item.fact_feb26_units),
          planUnits: finite(item.plan_feb26_units),
          buys: 0,
          completionPct,
          marginPct: platform === 'wb' ? numberOrNull(item.wb_margin_pct) : platform === 'ozon' ? numberOrNull(item.ozon_margin_pct) : null,
          delta: -finite(item.focus_score, 1),
          driver: item.focus_reasons || 'СЂРёСЃРє',
          fallback: !focusSource.length && platform !== 'all'
        };
      });
    return { positive, focus };
  }

  function buildDrivers(model) {
    const current = model.total;
    const previous = model.previousTotal;
    if (current.rawRevenueFallback && !finite(previous.revenue) && !finite(previous.orders)) {
      return [
        { key: 'traffic', label: 'Факт сети', value: current.revenue, detail: 'месячный факт без дневной декомпозиции', route: 'sku-plan-fact' },
        { key: 'conversion', label: 'Выкуп / конверсия', value: 0, detail: 'источник выкупа не опубликован', route: 'product-leaderboard' },
        { key: 'price', label: 'Цена / чек', value: 0, detail: 'дневной чек по сети не опубликован', route: 'prices' },
        { key: 'oos', label: 'OOS', value: 0, detail: 'риски доступности не разбиты по сети', route: 'oos-control' },
        { key: 'ads', label: 'Эффективность рекламы', value: -finite(current.ads), detail: 'рекламные расходы по сети не опубликованы', route: 'iu-drr' }
      ];
    }
    const prevAvgCheck = previous.orders > 0 ? previous.revenue / previous.orders : (current.orders > 0 ? current.revenue / current.orders : 0);
    const currentAvgCheck = current.orders > 0 ? current.revenue / current.orders : prevAvgCheck;
    const traffic = (current.orders - previous.orders) * prevAvgCheck;
    const price = (currentAvgCheck - prevAvgCheck) * current.orders;
    const currentBuyoutRate = buyoutRate(current);
    const previousBuyoutRate = buyoutRate(previous);
    const prevBuyout = previousBuyoutRate ?? currentBuyoutRate;
    const conversion = prevBuyout === null ? 0 : (current.buys - buyoutBase(current) * prevBuyout) * currentAvgCheck;
    const oos = -Math.abs((model.dashboard?.lowStock || []).slice(0, 8).reduce((sum, row) => sum + finite(row.orders_value), 0));
    const adsDelta = -(current.ads - previous.ads);
    const returns = -Math.abs((model.dashboard?.topReturns || []).slice(0, 8).reduce((sum, row) => sum + finite(row.orders_value), 0));
    return [
      { key: 'traffic', label: 'Трафик / спрос', value: traffic, detail: 'изменение заказов к прошлому периоду', route: 'product-leaderboard' },
      { key: 'conversion', label: 'Выкуп / конверсия', value: conversion, detail: prevBuyout === null ? 'источник выкупа не пришёл' : 'разница между заказами и выкупами', route: 'product-leaderboard' },
      { key: 'price', label: 'Цена / чек', value: price, detail: 'эффект среднего чека', route: 'prices' },
      { key: 'oos', label: 'OOS', value: oos, detail: 'товары с риском доступности', route: 'oos-control' },
      { key: 'ads', label: 'Эффективность рекламы', value: adsDelta, detail: 'изменение рекламных расходов', route: 'iu-drr' },
      { key: 'returns', label: 'Возвраты', value: returns, detail: 'сигнал из блока возвратов', route: 'sku-plan-fact' }
    ];
  }

  function buildRisks(model) {
    const lowStockLoss = (model.dashboard?.lowStock || []).slice(0, 12).reduce((sum, row) => sum + finite(row.orders_value), 0);
    const negativeMargin = finite(model.dashboard?.brandSummary?.[0]?.negative_margin_sku);
    const underPlanCount = Array.isArray(model.dashboard?.underPlan) ? model.dashboard.underPlan.length : 0;
    const adsOverPlan = model.total.ads - model.plan.ads;
    return [
      { key: 'oos', label: 'OOS / доступность', value: lowStockLoss > 0 ? fmtMoney(lowStockLoss) : `${(model.dashboard?.lowStock || []).length} SKU`, note: 'потенциальная потеря оборота', tone: '#e7786b', route: 'oos-control' },
      { key: 'price', label: 'Цена / переток', value: `${underPlanCount} SKU`, note: 'ниже плана или в фокусе', tone: '#e0b760', route: 'prices' },
      { key: 'ads', label: 'Реклама', value: adsOverPlan > 0 ? signedMoney(adsOverPlan) : 'в плане', note: 'факт против плана периода', tone: adsOverPlan > 0 ? '#e7786b' : '#74c99a', route: 'iu-drr' },
      { key: 'margin', label: 'Маржа', value: `${fmtInt(negativeMargin)} SKU`, note: 'ниже целевого уровня', tone: '#e7786b', route: 'sku-plan-fact' }
    ];
  }

  function buildModel() {
    const dashboard = source('dashboard') || { cards: [] };
    const metrics = source('metrics') || { metrics: [] };
    const platformTrends = source('platformTrends') || { platforms: [] };
    const platformSkuArticles = source('platformSkuArticles') || { platforms: [] };
    const productLeaderboard = source('productLeaderboard') || {};
    const iuDrr = source('iuDrr') || {};
    const adsSummary = source('adsSummary') || {};
    const platform = currentGlobalPlatform();
    const selectedPlatform = findPlatform(platformTrends, platform) || { key: platform, label: platformMeta(platform).label, series: [] };
    const allPlatform = findPlatform(platformTrends, 'all') || selectedPlatform;
    let asOf = platform === 'all'
      ? latestDate(platformTrends, dashboard) || dateKey(dashboard?.dataFreshness?.asOfDate)
      : latestPlatformSeriesDate(selectedPlatform) || latestDate(platformTrends, dashboard) || dateKey(dashboard?.dataFreshness?.asOfDate);
    const period = currentPeriod();
    const metric = currentMetric();
    let range = currentRange(asOf, period);
    let currentRows = rowsInRange(selectedPlatform.series, range.start, range.end);
    let previousRows = rowsInRange(selectedPlatform.series, range.prevStart, range.prevEnd);
    if (platform !== 'all' && !currentRows.length) {
      const platformLatest = latestPlatformSeriesDate(selectedPlatform);
      if (platformLatest && platformLatest !== asOf) {
        asOf = platformLatest;
        range = currentRange(asOf, period);
        currentRows = rowsInRange(selectedPlatform.series, range.start, range.end);
        previousRows = rowsInRange(selectedPlatform.series, range.prevStart, range.prevEnd);
      }
    }
    const allRows = rowsInRange(allPlatform.series, range.start, range.end);
    const total = sumRows(currentRows);
    const previousTotal = sumRows(previousRows);
    const allTotal = sumRows(allRows);
    const rawRevenue = rawRevenueMetrics(metrics);
    if (platform !== 'all') applyRawRevenueFallback(total, rawRevenue[platform], currentRows);
    const platformRangeTotal = platformTotalsInRange(platformTrends, range.start, range.end);
    const platformPreviousRangeTotal = platformTotalsInRange(platformTrends, range.prevStart, range.prevEnd);
    if (platform === 'all') {
      fillBuyoutFromSource(total, platformRangeTotal);
      fillBuyoutFromSource(previousTotal, platformPreviousRangeTotal);
    }
    fillBuyoutFromSource(allTotal, platformRangeTotal);
    const iuRows = iuRowsInRange(iuDrr, range.start, range.end);
    const prevIuRows = iuRowsInRange(iuDrr, range.prevStart, range.prevEnd);
    const coreAdWindow = iuRowsForRangeOrLatest(iuDrr, range, period);
    let coreAdRows = coreAdWindow.rows;
    let corePreviousAdRows = coreAdWindow.previousRows;
    let adRows = coreAdWindow.rows;
    let previousAdRows = coreAdWindow.previousRows;
    let adRange = coreAdWindow.range;
    let adsFromFallback = coreAdWindow.fallback;
    let adsSource = 'iu_drr';
    if (!isCoreAdsPlatform(platform)) {
      const adsSummaryWindow = adsSummaryRowsForRangeOrLatest(adsSummary, platform, range, period);
      adRows = adsSummaryWindow.rows;
      previousAdRows = adsSummaryWindow.previousRows;
      adRange = adsSummaryWindow.range;
      adsFromFallback = adsSummaryWindow.fallback;
      adsSource = 'ads_summary';
    }
    const iuRowsByDate = {};
    iuRows.forEach((row) => { iuRowsByDate[row.date] = row; });
    let adsBreakdown = adsRowsBreakdown(adRows, platform);
    let previousAdsBreakdown = adsRowsBreakdown(previousAdRows, platform);
    if (isCoreAdsPlatform(platform) && !adsBreakdown.total && Array.isArray(iuDrr?.daily) && iuDrr.daily.length) {
      const latest = latestIuDate(iuDrr);
      if (latest) {
        const fallbackRange = currentRange(latest, period);
        adRows = iuRowsInRange(iuDrr, fallbackRange.start, fallbackRange.end);
        previousAdRows = iuRowsInRange(iuDrr, fallbackRange.prevStart, fallbackRange.prevEnd);
        coreAdRows = adRows;
        corePreviousAdRows = previousAdRows;
        adRange = fallbackRange;
        adsFromFallback = true;
        adsSource = 'iu_drr';
        adsBreakdown = adsRowsBreakdown(adRows, platform);
        previousAdsBreakdown = adsRowsBreakdown(previousAdRows, platform);
      }
    }
    total.ads = adsBreakdown.total;
    previousTotal.ads = previousAdsBreakdown.total;
    total.drr = total.revenue > 0 ? total.ads / total.revenue : null;
    previousTotal.drr = previousTotal.revenue > 0 ? previousTotal.ads / previousTotal.revenue : null;
    total.marginPct = total.revenue > 0 ? total.marginRub / total.revenue : null;
    previousTotal.marginPct = previousTotal.revenue > 0 ? previousTotal.marginRub / previousTotal.revenue : null;
    const planChannel = monthlyPlanChannel(dashboard, platform);
    const planRevenue = planChannel.dailyRevenue * range.length;
    const active = dashboard?.companyPlan?.activeMonth || {};
    if (platform === 'all' && period === 'mtd' && finite(active.planRevenueToDate) > 0) {
      // Keep the existing company plan formula for the default CEO view.
      planChannel.revenueToDate = finite(active.planRevenueToDate);
    }
    const planOrders = finite(dashboard?.brandSummary?.[0]?.plan_units) / Math.max(1, finite(active.days, 30)) * range.length * (allTotal.revenue > 0 ? total.revenue / allTotal.revenue : 1);
    const planAds = adRows.reduce((sum, row) => sum + adsPlanDailyValue(row, platform), 0);
    const planBuyoutRate = buyoutRate(total);
    const plan = {
      revenue: planChannel.revenueToDate || planRevenue,
      orders: planOrders,
      buys: planBuyoutRate === null ? null : planOrders * planBuyoutRate,
      ads: planAds,
      marginPct: total.marginPct ?? .43,
      drr: total.revenue > 0 ? planAds / total.revenue : null
    };
    const platformCards = buildPlatformCards({ dashboard, metrics, platformTrends, iuRows, adRows, coreAdRows, range, total, allTotal, adsSummary });
    const skuRows = buildSkuRows({ dashboard, productLeaderboard, platformTrends, platformSkuArticles, platform, platformCards, total, allTotal, plan, range });
    const model = {
      dashboard,
      metrics,
      platformTrends,
      platformSkuArticles,
      productLeaderboard,
      iuDrr,
      adsSummary,
      platform,
      period,
      metric,
      asOf,
      range,
      adRange,
      currentRows,
      previousRows,
      iuRows,
      prevIuRows,
      adRows,
      previousAdRows,
      coreAdRows,
      corePreviousAdRows,
      adsFromFallback,
      adsSource,
      iuRowsByDate,
      adsBreakdown,
      previousAdsBreakdown,
      total,
      previousTotal,
      allTotal,
      plan,
      platformCards,
      skuRows
    };
    model.series = buildSeries(model, metric);
    model.drivers = buildDrivers(model);
    model.risks = buildRisks(model);
    return model;
  }

  function metricValueFor(model, metric) {
    if (metric === 'orders') return model.total.orders;
    if (metric === 'buys') return hasBuyoutSource(model.total) ? model.total.buys : null;
    if (metric === 'revenue') return model.total.revenue;
    if (metric === 'margin') return model.total.marginPct;
    if (metric === 'ads') return model.total.ads;
    return model.total.revenue;
  }

  function previousMetricValueFor(model, metric) {
    if (metric === 'orders') return model.previousTotal.orders;
    if (metric === 'buys') return hasBuyoutSource(model.previousTotal) ? model.previousTotal.buys : null;
    if (metric === 'revenue') return model.previousTotal.revenue;
    if (metric === 'margin') return model.previousTotal.marginPct;
    if (metric === 'ads') return model.previousTotal.ads;
    return model.previousTotal.revenue;
  }

  function planMetricValueFor(model, metric) {
    if (metric === 'orders') return model.plan.orders;
    if (metric === 'buys') return model.plan.buys;
    if (metric === 'revenue') return model.plan.revenue;
    if (metric === 'margin') return model.plan.marginPct;
    if (metric === 'ads') return model.plan.ads;
    return model.plan.revenue;
  }

  function metricDelta(model, metric) {
    const current = metricValueFor(model, metric);
    const prev = previousMetricValueFor(model, metric);
    if (current == null || prev == null) return null;
    if (metric === 'margin') return current == null || prev == null ? null : current - prev;
    return prev ? current / prev - 1 : null;
  }

  function metricHint(model, metric) {
    const plan = planMetricValueFor(model, metric);
    const current = metricValueFor(model, metric);
    if (metric === 'orders') return `план ${fmtInt(plan)} шт.`;
    if (metric === 'buys') return buyoutHint(model.total);
    if (metric === 'revenue') return `к плану ${plan > 0 ? fmtPct(current / plan) : 'нет плана'}`;
    if (metric === 'margin') return `план ${fmtPct(plan)}`;
    if (metric === 'ads') return model.total.revenue ? `ДРР ${fmtPct(model.total.ads / model.total.revenue)}` : 'нет базы ДРР';
    return '';
  }

  function kpiHtml(model) {
    return Object.keys(METRICS).map((key) => {
      const meta = METRICS[key];
      const value = metricValueFor(model, key);
      const delta = metricDelta(model, key);
      const tone = delta == null ? '' : delta >= 0 ? 'is-up' : 'is-down';
      return `
        <button type="button" class="ceo-kpi ${model.metric === key ? 'active' : ''}" data-ceo-metric="${key}" style="--pc:${meta.tone}" aria-pressed="${model.metric === key ? 'true' : 'false'}">
          <small>${escapeHtml(meta.label)}</small>
          <strong>${fmtMetric(key, value)}</strong>
          <em class="${tone}">${delta == null ? '—' : signedPct(delta)}</em>
          <p>${escapeHtml(metricHint(model, key))}</p>
        </button>
      `;
    }).join('');
  }

  function pointY(value, min, max, height, top) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return top + height;
    return top + height - ((finite(value) - min) / (max - min || 1)) * height;
  }

  function chartHtml(model) {
    const series = model.series;
    const metric = model.metric;
    const W = 1120;
    const H = 360;
    const pad = { l: 52, r: 28, t: 24, b: 44 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;
    const points = series.points.length ? series.points : [];
    const values = [];
    points.forEach((point) => {
      [point.value, point.prev, point.plan].forEach((value) => {
        if (hasFiniteValue(value)) values.push(Number(value));
      });
    });
    if (!values.length) {
      if (metric === 'ads') {
        const platform = platformMeta(model.platform);
        return `<div class="ceo-empty">Рекламные расходы по ${escapeHtml(platform.short)} за период не опубликованы. Продажи по сети доступны ниже.</div>`;
      }
      return '<div class="ceo-empty">Нет дневного источника для выбранного среза.</div>';
    }
    const isLine = series.chart === 'line';
    const metricTone = METRICS[metric]?.tone || '#dbc7a3';
    const min = isLine ? Math.min(...values) * .92 : 0;
    const max = Math.max(...values) * 1.08 || 1;
    const x = (index) => pad.l + (index + .5) * cw / Math.max(1, points.length);
    const y = (value) => pointY(value, min, max, ch, pad.t);
    let grid = '';
    for (let i = 0; i < 5; i += 1) {
      const yy = pad.t + i * ch / 4;
      grid += `<line class="ceo-grid-line" x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}"/>`;
    }
    const labels = points.map((point, index) => {
      const every = Math.max(1, Math.ceil(points.length / 7));
      return index % every === 0
        ? `<text class="ceo-axis-label" x="${x(index)}" y="${H - 14}" text-anchor="middle">${shortDate(point.date)}</text>`
        : '';
    }).join('');
    const planMarkers = '';
    let body = '';
    if (isLine) {
      const currentLine = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
      const prevLine = points.map((point, index) => `${x(index)},${y(point.prev)}`).join(' ');
      const planLine = points.map((point, index) => `${x(index)},${y(point.plan)}`).join(' ');
      const area = points.length
        ? `M ${x(0)} ${pad.t + ch} L ${points.map((point, index) => `${x(index)} ${y(point.value)}`).join(' L ')} L ${x(points.length - 1)} ${pad.t + ch} Z`
        : '';
      if (area) body += `<path class="ceo-rate-area" fill="${metricTone}" opacity=".18" d="${area}"/>`;
      body += `<polyline class="ceo-rate-prev" fill="none" stroke="#b8aa9a" stroke-width="2.6" style="fill:none!important;stroke:#b8aa9a!important;stroke-width:2.6px!important" points="${prevLine}"/><polyline class="ceo-plan-line" fill="none" stroke="#fff1bf" stroke-width="3.4" style="fill:none!important;stroke:#fff1bf!important;stroke-width:3.4px!important" points="${planLine}"/><polyline class="ceo-rate-line" fill="none" stroke="${metricTone}" stroke-width="5.2" stroke-opacity="1" style="fill:none!important;stroke:${metricTone}!important;stroke-width:5.2px!important;stroke-opacity:1!important" points="${currentLine}"/>${planMarkers}`;
      points.forEach((point, index) => {
        body += `<rect class="ceo-hit" data-ceo-day="${escapeHtml(point.date)}" x="${x(index) - cw / Math.max(1, points.length) / 2}" y="${pad.t}" width="${cw / Math.max(1, points.length)}" height="${ch}"/>`;
      });
    } else {
      const step = cw / Math.max(1, points.length);
      const bw = Math.min(18, step * .28);
      points.forEach((point, index) => {
        const currentHeight = pad.t + ch - y(point.value);
        const prevHeight = pad.t + ch - y(point.prev);
        body += `<rect class="ceo-bar-prev" style="--i:${index}" x="${x(index) - bw - 3}" y="${y(point.prev)}" width="${bw}" height="${Math.max(1, prevHeight)}" rx="4"/>`;
        body += `<rect class="ceo-bar-current" style="--i:${index}" x="${x(index) + 3}" y="${y(point.value)}" width="${bw}" height="${Math.max(1, currentHeight)}" rx="4"/>`;
        body += `<rect class="ceo-hit" data-ceo-day="${escapeHtml(point.date)}" x="${x(index) - step / 2}" y="${pad.t}" width="${step}" height="${ch}"/>`;
      });
      const planLine = points.map((point, index) => `${x(index)},${y(point.plan)}`).join(' ');
      body += `<polyline class="ceo-plan-line ceo-plan-line-bars" stroke="#fff1bf" style="stroke:#fff1bf" points="${planLine}"/>${planMarkers}`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${body}${labels}</svg>`;
  }

  function verdictHtml(model) {
    const revenueDelta = model.previousTotal.revenue ? model.total.revenue / model.previousTotal.revenue - 1 : null;
    const planCompletion = model.plan.revenue ? model.total.revenue / model.plan.revenue : null;
    const title = revenueDelta == null
      ? 'Тренд собирается'
      : revenueDelta >= 0 ? `Рост ${signedPct(revenueDelta)}` : `Снижение ${signedPct(revenueDelta)}`;
    const text = planCompletion == null
      ? 'Факт есть, но план для этого среза не опубликован.'
      : planCompletion >= 1
        ? 'Факт выше линейного плана. Смотрим, какие площадки и SKU дали вклад.'
        : 'Факт ниже линейного плана. В приоритете причины просадки и денежные риски.';
    return `
      <div class="ceo-verdict-card">
        <small>Итог среза</small>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
      </div>
      <div class="ceo-driver-list">
        ${model.drivers.slice(0, 5).map((driver, index) => `
          <button type="button" class="ceo-driver" data-ceo-driver="${escapeHtml(driver.key)}">
            <span class="ceo-driver-index">${index + 1}</span>
            <span><b>${escapeHtml(driver.label)}</b><span>${escapeHtml(driver.detail)}</span></span>
            <em class="${driver.value >= 0 ? 'is-up' : 'is-down'}">${signedMoney(driver.value)}</em>
          </button>
        `).join('')}
      </div>
    `;
  }

  function platformCardsHtml(model) {
    return model.platformCards.map((item) => `
      <button type="button" class="ceo-platform" data-ceo-platform="${escapeHtml(item.key)}" style="--pc:${item.color}">
        <small>${escapeHtml(item.label)}</small>
        <strong>${fmtMoney(item.total.revenue)}</strong>
        <p>${fmtInt(item.total.orders)} заказов · маржа ${item.marginPct == null ? 'нет данных' : fmtPct(item.marginPct)}</p>
        <div class="ceo-progress"><i style="width:${item.share > 0 ? clamp(item.share * 100, 3, 100).toFixed(1) : 0}%"></i></div>
      </button>
    `).join('');
  }

  function waterfallHtml(model) {
    const W = 900;
    const H = 300;
    const pad = 32;
    const baseline = 228;
    const maxAbs = Math.max(1, ...model.drivers.map((item) => Math.abs(finite(item.value)))) * 1.35;
    const step = (W - pad * 2) / model.drivers.length;
    let cumulative = 0;
    let body = '';
    [0, .25, .5, .75, 1].forEach((part) => {
      const yy = baseline - 150 + part * 150;
      body += `<line class="ceo-waterfall-grid" x1="${pad}" y1="${yy}" x2="${W - pad}" y2="${yy}"/>`;
    });
    body += `<line class="ceo-waterfall-base" x1="${pad}" y1="${baseline}" x2="${W - pad}" y2="${baseline}"/>`;
    model.drivers.forEach((driver, index) => {
      const before = cumulative;
      cumulative += finite(driver.value);
      const x = pad + index * step + step * .15;
      const w = step * .7;
      const y1 = baseline - before / maxAbs * 150;
      const y2 = baseline - cumulative / maxAbs * 150;
      const top = Math.min(y1, y2);
      const h = Math.max(5, Math.abs(y2 - y1));
      const tone = driver.value >= 0 ? 'is-up' : 'is-down';
      body += `<rect class="ceo-waterfall-bar ${tone}" data-ceo-driver="${escapeHtml(driver.key)}" x="${x}" y="${top}" width="${w}" height="${h}" rx="7" style="animation:ceoBarGrow 520ms var(--ease) both;animation-delay:${index * 55}ms"/>`;
      body += `<text class="ceo-waterfall-x" x="${x + w / 2}" y="${H - 18}" text-anchor="middle">${escapeHtml(driver.label)}</text>`;
      if (index < model.drivers.length - 1) body += `<line class="ceo-waterfall-connector" x1="${x + w}" y1="${y2}" x2="${x + step}" y2="${y2}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}">${body}</svg>`;
  }

  function risksHtml(model) {
    return model.risks.map((risk) => `
      <button type="button" class="ceo-risk" data-ceo-route="${escapeHtml(risk.route)}" style="--pc:${risk.tone}">
        <small>${escapeHtml(risk.label)}</small>
        <strong>${escapeHtml(risk.value)}</strong>
        <p>${escapeHtml(risk.note)}</p>
      </button>
    `).join('');
  }

  function skuRowsHtml(rows, toneClass) {
    if (!rows.length) return '<div class="ceo-empty">Нет источника SKU для этого блока.</div>';
    return rows.map((row) => `
      <button type="button" class="ceo-sku-row" data-ceo-sku="${escapeHtml(row.key)}">
        <span><b>${escapeHtml(row.name)}</b><span>${escapeHtml(row.owner)} · ${escapeHtml(row.driver)}</span></span>
        <em class="${toneClass}">${toneClass === 'is-down' ? escapeHtml(row.driver === 'риск' ? 'риск' : fmtMoney(row.revenue)) : fmtMoney(row.revenue)}</em>
      </button>
    `).join('');
  }

  function risksHtml(model) {
    return model.risks.map((risk) => `
      <button type="button" class="ceo-risk" data-ceo-risk="${escapeHtml(risk.key)}" style="--pc:${risk.tone}">
        <small>${escapeHtml(risk.label)}</small>
        <strong>${escapeHtml(risk.value)}</strong>
        <p>${escapeHtml(risk.note)}</p>
      </button>
    `).join('');
  }

  function planLabel(value) {
    return finite(value) > 0 ? fmtMoney(value) : '—';
  }

  function completionLabel(value) {
    return Number.isFinite(Number(value)) ? fmtPct(value) : '—';
  }

  function skuRowsHtml(rows, toneClass) {
    if (!rows.length) return '<div class="ceo-empty">Нет источника SKU для этого блока.</div>';
    return `
      <div class="ceo-sku-table">
        <div class="ceo-sku-head"><span>SKU</span><span>Факт</span><span>План</span><span>%</span></div>
        ${rows.map((row) => `
          <button type="button" class="ceo-sku-row" data-ceo-sku="${escapeHtml(row.key)}">
            <span><b>${escapeHtml(row.name)}</b><span>${escapeHtml(row.owner)} · ${escapeHtml(row.driver)}</span></span>
            <span class="ceo-sku-cell"><strong>${fmtMoney(row.revenue)}</strong><small>${fmtInt(row.orders)} шт.</small></span>
            <span class="ceo-sku-cell"><strong>${planLabel(row.planRevenue)}</strong><small>${row.planUnits ? `${fmtInt(row.planUnits)} шт.` : 'план'}</small></span>
            <em class="${toneClass}">${completionLabel(row.completionPct)}</em>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderShell(model) {
    const periodLabels = { '7': '7 дней', '14': '14 дней', mtd: 'Месяц к дате' };
    const platform = platformMeta(model.platform);
    return `
      <section class="ceo-motion-v1" data-dashboard-ceo-motion-version="${VERSION}" style="--platform:${platform.color};--metric:${METRICS[model.metric]?.tone || platform.color}">
        <div class="ceo-motion-bg"></div>
        <header class="ceo-top">
          <div>
            <div class="ceo-kicker">CEO обзор · от общего к частному</div>
            <h1 class="ceo-title">Растём или падаем?</h1>
            <p class="ceo-lead">За 15 секунд: динамика, причины, площадки и SKU. На главной нет задач, сотрудников и канбана — только бизнес-пульс бренда.</p>
          </div>
          <div class="ceo-toolbar">
            <div class="ceo-chip-row">
              <span class="ceo-chip" style="--pc:${platform.color}">глобально: ${escapeHtml(platform.short)}</span>
              <span class="ceo-chip" style="--pc:var(--ok)">факт до ${shortDate(model.asOf)} · готов</span>
            </div>
            <div class="ceo-periods" role="tablist" aria-label="Период дашборда">
              ${Object.entries(periodLabels).map(([key, label]) => `<button type="button" class="ceo-period ${model.period === key ? 'active' : ''}" data-ceo-period="${key}" aria-selected="${model.period === key ? 'true' : 'false'}">${label}</button>`).join('')}
            </div>
          </div>
        </header>
        <div class="ceo-kpis">${kpiHtml(model)}</div>
        <div class="ceo-main-grid">
          <article class="ceo-panel">
            <div class="ceo-panel-head">
              <div><h2>${escapeHtml(model.series.title)}</h2><p>${escapeHtml(model.series.caption)}</p></div>
              <div class="ceo-spacer"></div>
              <div class="ceo-legend"><span><i class="current"></i>текущий</span><span><i class="previous"></i>предыдущий</span><span><i class="plan"></i>план</span></div>
            </div>
            <div class="ceo-chart">${chartHtml(model)}</div>
          </article>
          <article class="ceo-panel ceo-verdict">
            <div class="ceo-panel-head"><div><h2>CEO-вывод</h2><p>Что произошло и почему.</p></div></div>
            ${verdictHtml(model)}
          </article>
        </div>
        <section class="ceo-panel">
          <div class="ceo-panel-head"><div><h2>Вклад площадок</h2><p>Клик по площадке открывает drawer, а не включает второй фильтр.</p></div></div>
          <div class="ceo-platform-grid" style="padding:0 16px 16px">${platformCardsHtml(model)}</div>
        </section>
        <div class="ceo-lower-grid">
          <article class="ceo-panel">
            <div class="ceo-panel-head"><div><h2>Почему изменился результат</h2><p>Waterfall факторов, млн ₽.</p></div></div>
            <div class="ceo-waterfall">${waterfallHtml(model)}</div>
          </article>
          <article class="ceo-panel">
            <div class="ceo-panel-head"><div><h2>Риски к результату</h2><p>Экономические сигналы, не операционная очередь.</p></div></div>
            <div class="ceo-risk-grid">${risksHtml(model)}</div>
          </article>
        </div>
        <section class="ceo-panel" style="padding:16px">
          <div class="ceo-panel-head" style="padding:0 0 10px"><div><h2>SKU-вклад</h2><p>Рост и рисковые позиции для drill-down.</p></div></div>
          <div class="ceo-contrib">
            <div class="ceo-contrib-col"><h3>Драйверы роста</h3>${skuRowsHtml(model.skuRows.positive, 'is-up')}</div>
            <div class="ceo-contrib-col"><h3>Что тянет вниз</h3>${skuRowsHtml(model.skuRows.focus, 'is-down')}</div>
          </div>
        </section>
      </section>
    `;
  }

  function drawerMetrics(items) {
    return `<div class="ceo-drawer-grid">${items.map((item) => `<div class="ceo-drawer-metric"><small>${escapeHtml(item[0])}</small><strong>${escapeHtml(item[1])}</strong></div>`).join('')}</div>`;
  }

  function openDrawer(root, title, subtitle, metrics, rows) {
    const back = root.querySelector('[data-ceo-drawer-back]');
    const drawer = root.querySelector('[data-ceo-drawer]');
    if (!back || !drawer) return;
    drawer.innerHTML = `
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(subtitle)}</p>
      ${drawerMetrics(metrics)}
      ${rows?.length ? `<div class="ceo-drawer-list">${rows.map((row) => `<button type="button" class="ceo-drawer-row" ${row.route ? `data-ceo-route="${escapeHtml(row.route)}"` : ''} ${row.sku ? `data-ceo-sku="${escapeHtml(row.sku)}"` : ''}><b>${escapeHtml(row.label)}</b><span>${escapeHtml(row.value)}</span></button>`).join('')}</div>` : ''}
      <div style="display:flex;justify-content:flex-end;margin-top:18px"><button type="button" class="ceo-period active" data-ceo-close>Закрыть</button></div>
    `;
    back.classList.add('open');
  }

  function closeDrawer(rootOrOptions) {
    const options = rootOrOptions && rootOrOptions.nodeType ? {} : (rootOrOptions || {});
    const root = rootOrOptions && rootOrOptions.nodeType ? rootOrOptions : document.getElementById(ROOT_ID);
    document.querySelector('[data-ceo-global-drawer-back]')?.classList.remove('open');
    root?.querySelector('[data-ceo-drawer-back]')?.classList.remove('open');
    document.querySelectorAll('[data-ceo-drawer-back].open').forEach((node) => node.classList.remove('open'));
    if (options.restore !== false) restoreDashboardDrawerScroll();
  }

  function openDay(root, model, day) {
    const row = model.currentRows.find((item) => dateKey(item.date || item.label) === day) || {};
    const point = model.series.points.find((item) => item.date === day) || {};
    const platformRows = model.platformCards.map((item) => ({
      label: item.label,
      value: `${fmtMoney(item.total.revenue)} · ${fmtPct(item.share)}`,
      route: null
    }));
    openDrawer(root, shortDate(day), `День в выбранном периоде. Сохраняем текущий KPI: ${METRICS[model.metric].label}.`, [
      ['Факт KPI', fmtMetric(model.metric, point.value)],
      ['План дня', fmtMetric(model.metric, point.plan)],
      ['Выручка', fmtMoneyFull(row.revenue)],
      ['Маржа', row.revenue ? fmtPct(finite(row.estimatedMargin, row.financialResult) / finite(row.revenue)) : 'нет факта']
    ], platformRows);
  }

  function openPlatform(root, model, key) {
    const item = model.platformCards.find((row) => row.key === normalizePlatform(key));
    if (!item) return;
    openDrawer(root, item.label, 'Площадка как drill-down: фильтр портала не меняется.', [
      ['Выручка', fmtMoneyFull(item.total.revenue)],
      ['Заказы', fmtInt(item.total.orders)],
      ['Выкупы', buyoutDisplay(item.total)],
      ['ДРР', item.drr == null ? 'нет источника' : fmtPct(item.drr)],
      ['Маржа', item.marginPct == null ? 'нет источника' : fmtPct(item.marginPct)],
      ['Доля', fmtPct(item.share)]
    ], [
      { label: 'Открыть лидерборд', value: 'позиции и трафик', route: 'product-leaderboard' },
      { label: 'Открыть план-факт SKU', value: 'артикулы и маржа', route: 'sku-plan-fact' },
      { label: 'Открыть ИУ / ДРР', value: 'воронка рекламы', route: 'iu-drr' }
    ]);
  }

  function openDriver(root, model, key) {
    const item = model.drivers.find((row) => row.key === key);
    if (!item) return;
    openDrawer(root, item.label, item.detail, [
      ['Вклад', signedMoney(item.value)],
      ['Маршрут', item.route],
      ['Период', `${shortDate(model.range.start)} - ${shortDate(model.range.end)}`],
      ['Площадка', platformMeta(model.platform).short]
    ], [
      { label: 'Перейти в детализацию', value: item.route, route: item.route }
    ]);
  }

  function openSku(root, model, key) {
    const rows = [...model.skuRows.positive, ...model.skuRows.focus];
    const item = rows.find((row) => String(row.key) === String(key));
    if (!item) return;
    openDrawer(root, item.name, `${item.owner} · ${item.driver}`, [
      ['Выручка', fmtMoneyFull(item.revenue)],
      ['Заказы', fmtInt(item.orders)],
      ['Выкупы', item.buys ? fmtInt(item.buys) : 'нет источника'],
      ['Маржа', item.marginPct == null ? 'нет источника' : fmtPct(item.marginPct)]
    ], [
      { label: 'Лидерборд', value: 'контент и трафик', route: 'product-leaderboard' },
      { label: 'План-факт SKU', value: 'план, факт, маржа', route: 'sku-plan-fact' },
      { label: 'Цены', value: 'цена и заказы', route: 'prices' }
    ]);
  }

  function drawerRowFilter(row) {
    return [row.label, row.value, row.detail, row.route, row.sku].filter(Boolean).join(' ').toLowerCase();
  }

  function skuDrawerRows(rows, route = 'sku-plan-fact') {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      label: row.name || row.key || 'SKU',
      value: `${fmtMoney(row.revenue)} · план ${planLabel(row.planRevenue)} · ${completionLabel(row.completionPct)}`,
      detail: `${row.owner || 'Без owner'} · ${row.driver || 'источник'}${row.fallback ? ' · общий срез, нет SKU-разбивки площадки' : ''}`,
      sku: row.key,
      route
    }));
  }

  function dashboardRowsToDrawer(rows, options = {}) {
    const route = options.route || 'sku-plan-fact';
    return (Array.isArray(rows) ? rows : []).map((item) => {
      const name = item.product_name_final || item.name || item.article || item.articleKey || 'SKU';
      const value = options.value
        ? options.value(item)
        : item.orders_value
          ? fmtMoney(item.orders_value)
          : item.plan_completion_feb26_pct
            ? completionLabel(item.plan_completion_feb26_pct)
            : item.total_mp_stock != null
              ? `${fmtInt(item.total_mp_stock)} шт.`
              : 'детали';
      const detail = options.detail
        ? options.detail(item)
        : [item.owner_name || item.owner, item.focus_reasons || item.top_return_reason].filter(Boolean).join(' · ');
      return {
        label: name,
        value,
        detail,
        sku: item.article || item.articleKey || item.id,
        route
      };
    });
  }

  function scopedDashboardRows(model, listName) {
    const platform = normalizePlatform(model.platform);
    const rows = Array.isArray(model.dashboard?.[listName]) ? model.dashboard[listName] : [];
    if (platform === 'all') return rows;
    const filtered = rows.filter((item) => itemMatchesPlatform(item, platform, false));
    return filtered.length || usesSharedSkuFallback(platform) ? (filtered.length ? filtered : rows) : [];
  }

  function rowsForDriver(model, key) {
    if (key === 'traffic' || key === 'conversion') return skuDrawerRows(model.skuRows.positive, 'product-leaderboard');
    if (key === 'price') {
      return dashboardRowsToDrawer(scopedDashboardRows(model, 'toWork').concat(scopedDashboardRows(model, 'focusTop')).slice(0, 10), {
        route: 'prices',
        value: (item) => completionLabel(item.plan_completion_feb26_pct),
        detail: (item) => [item.owner_name || item.owner, item.focus_reasons || 'цена / план'].filter(Boolean).join(' · ')
      });
    }
    if (key === 'oos') {
      const rows = scopedDashboardRows(model, 'lowStock');
      const fallbackRows = rows.length
        ? rows
        : (Array.isArray(model.dashboard?.lowStock) && model.dashboard.lowStock.length
          ? model.dashboard.lowStock
          : scopedDashboardRows(model, 'focusTop'));
      return dashboardRowsToDrawer(fallbackRows.slice(0, 12), {
        route: 'oos-control',
        value: (item) => item.orders_value ? fmtMoney(item.orders_value) : `${fmtInt(item.total_mp_stock)} шт.`,
        detail: (item) => `${item.owner_name || item.owner || 'Без owner'} · WB ${fmtInt(item.wb_stock)} · Ozon ${fmtInt(item.ozon_stock_final)}`
      });
    }
    if (key === 'ads') {
      return model.iuRows
        .map((row) => {
          const fact = adsDailyValue(row, model.platform);
          const plan = adsPlanDailyValue(row, model.platform);
          return {
            label: shortDate(row.date),
            value: `${fmtMoneyFull(fact)} · план ${fmtMoneyFull(plan)}`,
            detail: `отклонение ${signedMoney(fact - plan)}`,
            route: 'iu-drr'
          };
        })
        .slice(0, 10);
    }
    if (key === 'returns') {
      return dashboardRowsToDrawer(scopedDashboardRows(model, 'topReturns').slice(0, 12), {
        route: 'sku-plan-fact',
        value: (item) => `${fmtInt(item.returns_units || item.returns_count)} шт.`,
        detail: (item) => [item.owner_name || item.owner, item.top_return_reason].filter(Boolean).join(' · ')
      });
    }
    return [];
  }

  function rowsForRisk(model, key) {
    if (key === 'oos') return rowsForDriver(model, 'oos');
    if (key === 'price') return rowsForDriver(model, 'price');
    if (key === 'ads') return rowsForDriver(model, 'ads');
    if (key === 'margin') {
      return dashboardRowsToDrawer(scopedDashboardRows(model, 'focusTop').concat(scopedDashboardRows(model, 'toWork')).slice(0, 12), {
        route: 'sku-plan-fact',
        value: (item) => item.wb_margin_pct != null || item.ozon_margin_pct != null
          ? `WB ${completionLabel(item.wb_margin_pct)} · Ozon ${completionLabel(item.ozon_margin_pct)}`
          : completionLabel(item.plan_completion_feb26_pct),
        detail: (item) => [item.owner_name || item.owner, item.focus_reasons || 'маржа / план'].filter(Boolean).join(' · ')
      });
    }
    return [];
  }

  function openDrawer(root, title, subtitle, metrics, rows) {
    const back = root.querySelector('[data-ceo-drawer-back]');
    const drawer = root.querySelector('[data-ceo-drawer]');
    if (!back || !drawer) return;
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const listHtml = list.length
      ? `
        <label class="ceo-drawer-search">
          <span>Фильтр внутри окна</span>
          <input type="search" data-ceo-drawer-filter placeholder="SKU, owner, причина, площадка...">
        </label>
        <div class="ceo-drawer-list">
          ${list.map((row) => `<button type="button" class="ceo-drawer-row" data-ceo-drawer-row data-filter="${escapeHtml(drawerRowFilter(row))}" ${row.route ? `data-ceo-route="${escapeHtml(row.route)}"` : ''} ${row.sku ? `data-ceo-sku="${escapeHtml(row.sku)}"` : ''}><span><b>${escapeHtml(row.label)}</b>${row.detail ? `<small>${escapeHtml(row.detail)}</small>` : ''}</span><em>${escapeHtml(row.value)}</em></button>`).join('')}
        </div>
      `
      : '<div class="ceo-empty" style="margin-top:15px">Детали для этого среза не найдены. Проверь фильтр площадки или обнови командные данные.</div>';
    drawer.innerHTML = `
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(subtitle)}</p>
      ${drawerMetrics(metrics || [])}
      ${listHtml}
      <div style="display:flex;justify-content:flex-end;margin-top:18px"><button type="button" class="ceo-period active" data-ceo-close>Закрыть</button></div>
    `;
    back.classList.add('open');
  }

  function openPlatform(root, model, key) {
    const normalized = normalizePlatform(key);
    const item = model.platformCards.find((row) => row.key === normalized);
    if (!item) return;
    const scopedSku = buildSkuRows({ ...model, platform: normalized });
    const rows = skuDrawerRows([...scopedSku.positive, ...scopedSku.focus].slice(0, 12), 'sku-plan-fact');
    rows.push(
      { label: 'Открыть лидерборд', value: 'позиции и трафик', detail: 'полный список и недельная динамика', route: 'product-leaderboard' },
      { label: 'Открыть ИУ / ДРР', value: 'воронка рекламы', detail: 'дневная матрица расходов', route: 'iu-drr' }
    );
    openDrawer(root, item.label, 'Площадка как drill-down: цифры, план и SKU внутри выбранного контура.', [
      ['Выручка', fmtMoneyFull(item.total.revenue)],
      ['План', planLabel(monthlyPlanChannel(model.dashboard, normalized).revenue)],
      ['Заказы', fmtInt(item.total.orders)],
      ['Выкупы', buyoutDisplay(item.total)],
      ['ДРР', item.drr == null ? 'нет источника' : fmtPct(item.drr)],
      ['Маржа', item.marginPct == null ? 'нет источника' : fmtPct(item.marginPct)]
    ], rows);
  }

  function openDriver(root, model, key) {
    const item = model.drivers.find((row) => row.key === key);
    if (!item) return;
    const rows = rowsForDriver(model, key);
    rows.push({ label: 'Перейти в детальную вкладку', value: item.route, detail: 'откроет полный рабочий экран', route: item.route });
    openDrawer(root, item.label, item.detail, [
      ['Вклад', signedMoney(item.value)],
      ['Период', `${shortDate(model.range.start)} - ${shortDate(model.range.end)}`],
      ['Площадка', platformMeta(model.platform).short],
      ['Деталей', fmtInt(rows.length)]
    ], rows);
  }

  function openRisk(root, model, key) {
    const risk = model.risks.find((row) => row.key === key);
    if (!risk) return;
    const rows = rowsForRisk(model, key);
    rows.push({ label: 'Открыть рабочую вкладку', value: risk.route, detail: 'полная таблица и действия', route: risk.route });
    openDrawer(root, risk.label, risk.note, [
      ['Риск', risk.value],
      ['Период', `${shortDate(model.range.start)} - ${shortDate(model.range.end)}`],
      ['Площадка', platformMeta(model.platform).short],
      ['Строк', fmtInt(rows.length)]
    ], rows);
  }

  function openSku(root, model, key) {
    const rows = [...model.skuRows.positive, ...model.skuRows.focus];
    const item = rows.find((row) => String(row.key) === String(key));
    if (!item) {
      openDrawer(root, 'SKU-вклад', 'По выбранному SKU нет строки в текущем срезе. Ниже ближайшие позиции по выбранной площадке.', [
        ['Площадка', platformMeta(model.platform).short],
        ['Период', `${shortDate(model.range.start)} - ${shortDate(model.range.end)}`]
      ], skuDrawerRows(rows.slice(0, 12), 'sku-plan-fact'));
      return;
    }
    openDrawer(root, item.name, `${item.owner} · ${item.driver}`, [
      ['Факт', fmtMoneyFull(item.revenue)],
      ['План', planLabel(item.planRevenue)],
      ['Выполнение', completionLabel(item.completionPct)],
      ['Заказы', fmtInt(item.orders)],
      ['Выкупы', item.buys ? fmtInt(item.buys) : 'нет источника'],
      ['Маржа', item.marginPct == null ? 'нет источника' : fmtPct(item.marginPct)]
    ], [
      { label: 'План-факт SKU', value: 'план, факт, маржа', detail: 'открыть детальную таблицу', route: 'sku-plan-fact' },
      { label: 'Лидерборд', value: 'контент и трафик', detail: 'контентная динамика SKU', route: 'product-leaderboard' },
      { label: 'Цены', value: 'цена и заказы', detail: 'дневная динамика цены', route: 'prices' }
    ]);
  }

  function skuNeedle(value) {
    return String(value || '').trim().toLowerCase();
  }

  function skuKeys(row) {
    return [
      row?.key,
      row?.sku,
      row?.article,
      row?.articleKey,
      row?.id,
      row?.nmId,
      row?.articleName,
      row?.product_name_final,
      row?.name
    ].map(skuNeedle).filter(Boolean);
  }

  function rowMatchesSku(row, key) {
    const target = skuNeedle(key);
    if (!target) return false;
    return skuKeys(row).some((candidate) => (
      candidate === target
      || (candidate.length > 4 && target.length > 4 && (candidate.includes(target) || target.includes(candidate)))
    ));
  }

  function dashboardRowsForSku(model, key) {
    const sources = [
      ['План-факт', scopedDashboardRows(model, 'focusTop')],
      ['В работе', scopedDashboardRows(model, 'toWork')],
      ['OOS', scopedDashboardRows(model, 'lowStock')],
      ['Возвраты', scopedDashboardRows(model, 'topReturns')],
      ['Без owner', scopedDashboardRows(model, 'unassigned')]
    ];
    const result = [];
    sources.forEach(([sourceLabel, list]) => {
      (Array.isArray(list) ? list : [])
        .filter((item) => rowMatchesSku(item, key))
        .slice(0, 3)
        .forEach((item) => {
          const completion = item.plan_completion_feb26_pct != null ? completionLabel(item.plan_completion_feb26_pct) : '';
          const revenue = finite(item.orders_value) > 0 ? fmtMoneyFull(item.orders_value) : '';
          const stock = item.total_mp_stock != null ? `${fmtInt(item.total_mp_stock)} шт.` : '';
          result.push({
            label: `${sourceLabel}: ${item.product_name_final || item.name || item.article || item.articleKey || key}`,
            value: revenue || completion || stock || 'есть строка',
            detail: [
              item.owner_name || item.owner,
              item.focus_reasons || item.top_return_reason || item.article || item.articleKey,
              completion ? `выполнение ${completion}` : ''
            ].filter(Boolean).join(' · ')
          });
        });
    });
    return result;
  }

  function fallbackSkuRows(model, limit = 12) {
    const skuRows = [...(model.skuRows?.positive || []), ...(model.skuRows?.focus || [])];
    if (skuRows.length) return skuDrawerRows(skuRows.slice(0, limit), 'sku-plan-fact');
    const dashboardRows = []
      .concat(scopedDashboardRows(model, 'focusTop'))
      .concat(scopedDashboardRows(model, 'toWork'))
      .concat(scopedDashboardRows(model, 'lowStock'))
      .filter(Boolean)
      .slice(0, limit);
    return dashboardRowsToDrawer(dashboardRows, { route: 'sku-plan-fact' });
  }

  function skuDetailRows(model, item) {
    const rows = [
      {
        label: 'Факт / план',
        value: `${fmtMoneyFull(item.revenue)} / ${planLabel(item.planRevenue)}`,
        detail: `выполнение ${completionLabel(item.completionPct)} · ${platformMeta(model.platform).short}`
      },
      {
        label: 'Заказы / план',
        value: `${fmtInt(item.orders)} шт.`,
        detail: item.planUnits ? `план ${fmtInt(item.planUnits)} шт.` : 'план по штукам не найден'
      },
      {
        label: 'Маржа',
        value: item.marginPct == null ? 'нет источника' : fmtPct(item.marginPct),
        detail: item.buys ? `выкупы ${fmtInt(item.buys)} шт.` : 'выкуп не пришёл в текущий срез'
      },
      {
        label: 'Ответственный',
        value: item.owner || 'Без owner',
        detail: item.key || 'SKU без ключа'
      },
      {
        label: 'Причина / сигнал',
        value: item.driver || 'сигнал',
        detail: item.fallback ? 'общий срез, нет SKU-разбивки выбранной площадки' : 'из текущего среза дашборда'
      }
    ];
    dashboardRowsForSku(model, item.key).forEach((row) => rows.push(row));
    rows.push(
      { label: 'Открыть План-факт SKU', value: 'таблица по артикулам', detail: 'план, факт, маржа, статусы и фильтры', route: 'sku-plan-fact' },
      { label: 'Открыть Цены', value: 'цена и заказы', detail: 'дневная динамика цены по SKU', route: 'prices' },
      { label: 'Открыть Лидерборд', value: 'контент и трафик', detail: 'недельная динамика и вклад SKU', route: 'product-leaderboard' }
    );
    return rows;
  }

  function dashboardScrollTarget() {
    const nodes = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      document.querySelector('main'),
      document.querySelector('.app-main'),
      document.querySelector('.app-content'),
      document.querySelector('.content'),
      document.getElementById(ROOT_ID)
    ].filter(Boolean);
    const visibleScrollable = nodes.find((node) => {
      if (!node || node === document.body || node === document.documentElement || node === document.scrollingElement) return false;
      return node.scrollHeight > node.clientHeight + 8 && node.scrollTop > 0;
    });
    return visibleScrollable || document.scrollingElement || document.documentElement || document.body;
  }

  function saveDashboardDrawerScroll() {
    const target = dashboardScrollTarget();
    window.__ALTEA_DASHBOARD_DRAWER_SCROLL__ = {
      winX: window.scrollX || 0,
      winY: window.scrollY || 0,
      target,
      top: target?.scrollTop || 0,
      left: target?.scrollLeft || 0
    };
  }

  function restoreDashboardDrawerScroll() {
    const saved = window.__ALTEA_DASHBOARD_DRAWER_SCROLL__;
    if (!saved) return;
    requestAnimationFrame(() => {
      if (saved.target && saved.target.isConnected) {
        saved.target.scrollTop = saved.top || 0;
        saved.target.scrollLeft = saved.left || 0;
      }
      window.scrollTo(saved.winX || 0, saved.winY || 0);
    });
  }

  function filterDashboardDrawer(scope, input) {
    const query = String(input?.value || '').trim().toLowerCase();
    scope?.querySelectorAll('[data-ceo-drawer-row]').forEach((row) => {
      const haystack = String(row.getAttribute('data-filter') || '').toLowerCase();
      row.hidden = Boolean(query && !haystack.includes(query));
    });
  }

  function ensureDashboardDrawer(root) {
    document.querySelectorAll('[data-ceo-drawer-back]:not([data-ceo-global-drawer-back])').forEach((node) => node.remove());
    let back = document.querySelector('[data-ceo-global-drawer-back]');
    if (!back) {
      back = document.createElement('div');
      back.className = 'ceo-motion-v1 ceo-drawer-back';
      back.setAttribute('data-ceo-drawer-back', '');
      back.setAttribute('data-ceo-global-drawer-back', '');
      back.innerHTML = '<aside class="ceo-drawer" data-ceo-drawer tabindex="-1"></aside>';
      back.addEventListener('click', (event) => {
        const target = event.target;
        if (target === back || target.closest?.('[data-ceo-close]')) {
          closeDrawer();
          return;
        }
        const route = target.closest?.('[data-ceo-route]');
        if (route) {
          closeDrawer({ restore: false });
          navigate(route.getAttribute('data-ceo-route'));
          return;
        }
        const sku = target.closest?.('[data-ceo-sku]');
        if (sku) {
          const dashboardRoot = document.getElementById(ROOT_ID);
          if (dashboardRoot) openSku(dashboardRoot, buildModel(), sku.getAttribute('data-ceo-sku'));
        }
      });
      back.addEventListener('input', (event) => {
        const input = event.target?.closest?.('[data-ceo-drawer-filter]');
        if (input) filterDashboardDrawer(back, input);
      });
      document.body.appendChild(back);
    }
    return {
      back,
      drawer: back.querySelector('[data-ceo-drawer]') || root?.querySelector('[data-ceo-drawer]')
    };
  }

  function openDrawer(root, title, subtitle, metrics, rows) {
    saveDashboardDrawerScroll();
    const { back, drawer } = ensureDashboardDrawer(root);
    if (!back || !drawer) return;
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const listHtml = list.length
      ? `
        <label class="ceo-drawer-search">
          <span>Фильтр внутри окна</span>
          <input type="search" data-ceo-drawer-filter placeholder="SKU, owner, причина, площадка...">
        </label>
        <div class="ceo-drawer-list">
          ${list.map((row) => {
            const routeAttr = row.route ? `data-ceo-route="${escapeHtml(row.route)}"` : '';
            const skuAttr = row.sku && !row.route ? `data-ceo-sku="${escapeHtml(row.sku)}"` : '';
            const actionClass = row.route || row.sku ? '' : ' is-static';
            return `<button type="button" class="ceo-drawer-row${actionClass}" data-ceo-drawer-row data-filter="${escapeHtml(drawerRowFilter(row))}" ${routeAttr} ${skuAttr}><span><b>${escapeHtml(row.label)}</b>${row.detail ? `<small>${escapeHtml(row.detail)}</small>` : ''}</span><em>${escapeHtml(row.value)}</em></button>`;
          }).join('')}
        </div>
      `
      : '<div class="ceo-empty" style="margin-top:15px">Детали для этого среза не найдены. Проверь фильтр площадки или обнови командные данные.</div>';
    drawer.innerHTML = `
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(subtitle)}</p>
      ${drawerMetrics(metrics || [])}
      ${listHtml}
      <div style="display:flex;justify-content:flex-end;margin-top:18px"><button type="button" class="ceo-period active" data-ceo-close>Закрыть</button></div>
    `;
    drawer.scrollTop = 0;
    back.classList.add('open');
    requestAnimationFrame(() => drawer.focus?.({ preventScroll: true }));
  }

  function openSku(root, model, key) {
    const rows = [...(model.skuRows?.positive || []), ...(model.skuRows?.focus || [])];
    const item = rows.find((row) => rowMatchesSku(row, key));
    if (!item) {
      const fallback = fallbackSkuRows(model);
      openDrawer(root, 'SKU-вклад', 'По выбранному SKU нет строки в текущем срезе. Ниже ближайшие позиции по выбранной площадке.', [
        ['Площадка', platformMeta(model.platform).short],
        ['Период', `${shortDate(model.range.start)} - ${shortDate(model.range.end)}`],
        ['Доступно строк', fmtInt(fallback.length)]
      ], fallback);
      return;
    }
    openDrawer(root, item.name, `${item.owner} · ${item.driver}`, [
      ['Факт', fmtMoneyFull(item.revenue)],
      ['План', planLabel(item.planRevenue)],
      ['Выполнение', completionLabel(item.completionPct)],
      ['Заказы', fmtInt(item.orders)],
      ['Выкупы', item.buys ? fmtInt(item.buys) : 'нет источника'],
      ['Маржа', item.marginPct == null ? 'нет источника' : fmtPct(item.marginPct)]
    ], skuDetailRows(model, item));
  }

  function openAds(root, model) {
    const breakdown = model.adsBreakdown || adsRowsBreakdown(model.adRows || model.iuRows, model.platform);
    const platform = platformMeta(model.platform);
    const shownRange = model.adRange || model.range;
    const drr = model.total.revenue > 0 ? breakdown.total / model.total.revenue : null;
    const freshness = adsFreshnessRow(model);
    const detailRows = [
      ['Внутренняя реклама', breakdown.internal, 'WB promotion / performance, Ozon / Yandex performance'],
      ['Медийка', breakdown.media, 'Медийные размещения WB и ручные media-расходы'],
      ['Промо внешняя', breakdown.external, 'Внешнее промо, PVZ, brand zone и внешние каналы'],
      ['КЗ реклама', breakdown.kz, 'Контент-завод, review points и поддержка карточек'],
      ['Ozon-реклама', breakdown.ozon, 'Отдельный контроль Ozon в общем срезе'],
      ['Яндекс-реклама', breakdown.yandex, 'Отдельный контроль Яндекс.Маркет в общем срезе']
    ]
      .filter((item) => item[1] > 0 || ['Внутренняя реклама', 'Медийка', 'Промо внешняя', 'КЗ реклама'].includes(item[0]))
      .map(([label, value, detail]) => ({ label, value: fmtMoneyFull(value), detail }));
    const dayRows = (Array.isArray(model.adRows) ? model.adRows : (model.iuRows || [])).map((row) => {
      const day = adsDailyBreakdown(row, model.platform);
      return {
        label: shortDate(row.date),
        value: fmtMoneyFull(day.total),
        detail: `внутр. ${fmtMoneyFull(day.internal)} · медийка ${fmtMoneyFull(day.media)} · внешняя ${fmtMoneyFull(day.external)} · КЗ ${fmtMoneyFull(day.kz)}`,
        route: 'iu-drr'
      };
    });
    openDrawer(root, 'Реклама по выбранному срезу', `${platform.label} · ${shortDate(shownRange.start)} - ${shortDate(shownRange.end)} · внутренняя, медийка, внешняя и КЗ`, [
      ['Всего реклама', fmtMoneyFull(breakdown.total)],
      ['Внутренняя', fmtMoneyFull(breakdown.internal)],
      ['Медийка', fmtMoneyFull(breakdown.media)],
      ['Промо внешняя', fmtMoneyFull(breakdown.external)],
      ['КЗ реклама', fmtMoneyFull(breakdown.kz)],
      ['ДРР', drr == null ? 'нет выручки' : fmtPct(drr)]
    ], [
      ...(freshness ? [freshness] : []),
      ...detailRows,
      { label: 'Открыть ИУ / ДРР', value: 'дневная матрица', detail: 'полная таблица рекламы, расходов и выполнения', route: 'iu-drr' },
      ...dayRows
    ]);
  }

  function navigate(route) {
    const normalized = String(route || '').replace(/^#/, '');
    if (!normalized) return;
    if (typeof window.setView === 'function') {
      window.setView(normalized);
    } else {
      window.location.hash = normalized;
    }
  }

  function attachHandlers(root) {
    root.onclick = (event) => {
      const target = event.target;
      const metric = target.closest?.('[data-ceo-metric]');
      if (metric) {
        const metricKey = metric.getAttribute('data-ceo-metric') || 'orders';
        writeStorage(METRIC_KEY, metricKey);
        renderDashboardCeoMotion();
        if (metricKey === 'ads') {
          requestAnimationFrame(() => {
            const nextRoot = document.getElementById(ROOT_ID);
            if (nextRoot) openAds(nextRoot, buildModel());
          });
        }
        return;
      }
      const period = target.closest?.('[data-ceo-period]');
      if (period && period.hasAttribute('data-ceo-period')) {
        writeStorage(PERIOD_KEY, period.getAttribute('data-ceo-period') || 'mtd');
        renderDashboardCeoMotion();
        return;
      }
      const model = buildModel();
      const day = target.closest?.('[data-ceo-day]');
      if (day) {
        openDay(root, model, day.getAttribute('data-ceo-day'));
        return;
      }
      const platform = target.closest?.('[data-ceo-platform]');
      if (platform) {
        openPlatform(root, model, platform.getAttribute('data-ceo-platform'));
        return;
      }
      const driver = target.closest?.('[data-ceo-driver]');
      if (driver) {
        openDriver(root, model, driver.getAttribute('data-ceo-driver'));
        return;
      }
      const sku = target.closest?.('[data-ceo-sku]');
      if (sku) {
        openSku(root, model, sku.getAttribute('data-ceo-sku'));
        return;
      }
      const risk = target.closest?.('[data-ceo-risk]');
      if (risk) {
        openRisk(root, model, risk.getAttribute('data-ceo-risk'));
        return;
      }
      const route = target.closest?.('[data-ceo-route]');
      if (route) {
        navigate(route.getAttribute('data-ceo-route'));
        return;
      }
      if (target.closest?.('[data-ceo-close]')) {
        closeDrawer(root);
        return;
      }
      const back = target.closest?.('[data-ceo-drawer-back]');
      if (back && target === back) closeDrawer(root);
    };
    root.oninput = (event) => {
      const input = event.target?.closest?.('[data-ceo-drawer-filter]');
      if (!input) return;
      filterDashboardDrawer(document.querySelector('[data-ceo-global-drawer-back]') || root, input);
    };
  }

  function renderLoading(root) {
    root.dataset.dashboardCeoMotion = VERSION;
    window.__ALTEA_DASHBOARD_CEO_MOTION_ACTIVE__ = true;
    root.innerHTML = `
      <section class="ceo-motion-v1">
        <div class="ceo-empty">Собираем CEO dashboard: факты, план, площадки и рекламный контур.</div>
      </section>
    `;
  }

  function scheduleRenderAfterSources(forceMissing = false) {
    if ((!forceMissing && sourcesLoaded) || renderAfterLoadScheduled) return;
    if (forceMissing && sourcesLoaded && missingSourceRetries >= MAX_MISSING_SOURCE_RETRIES) return;
    if (forceMissing) missingSourceRetries += 1;
    renderAfterLoadScheduled = true;
    loadSources({ forceMissing }).then(() => {
      renderAfterLoadScheduled = false;
      if (dashboardRouteActive()) renderDashboardCeoMotion();
    });
  }

  function renderDashboardCeoMotion() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    window.__ALTEA_DASHBOARD_CEO_MOTION_ACTIVE__ = true;
    const oldModal = document.getElementById('portalDashboardExecutiveModal');
    if (oldModal) oldModal.remove();
    ensureStyle();
    const { hasPlatformRows, hasDashboardPlan, hasIuDrrRows } = requiredSourceState();
    const missingCoreSource = !hasPlatformRows || !hasDashboardPlan || !hasIuDrrRows;
    if (missingCoreSource && (!sourcesLoaded || missingSourceRetries < MAX_MISSING_SOURCE_RETRIES)) {
      renderLoading(root);
      scheduleRenderAfterSources(true);
      return;
    }
    if (!missingCoreSource) missingSourceRetries = 0;
    if (!sourcesLoaded) scheduleRenderAfterSources();
    const model = buildModel();
    const waitingForAdsSource = model.metric === 'ads'
      && isCoreAdsPlatform(model.platform)
      && model.adsSource !== 'ads_summary'
      && model.total.ads <= 0
      && !(Array.isArray(model.adRows) && model.adRows.length)
      && missingSourceRetries < MAX_MISSING_SOURCE_RETRIES;
    if (waitingForAdsSource) {
      renderLoading(root);
      scheduleRenderAfterSources(true);
      return;
    }
    root.dataset.dashboardCeoMotion = VERSION;
    root.dataset.premiumRoute = 'dashboard';
    root.innerHTML = renderShell(model);
    attachHandlers(root);
    if (window.AlteaPremiumPresentation?.scheduleRender) window.AlteaPremiumPresentation.scheduleRender(0);
  }

  function dashboardRouteActive() {
    const raw = appState().activeView || location.hash.replace(/^#\/?/, '') || 'dashboard';
    const normalized = typeof normalizePortalView === 'function'
      ? normalizePortalView(raw)
      : String(raw || 'dashboard').replace(/^\/+/, '') || 'dashboard';
    return normalized === 'dashboard';
  }

  renderDashboardCeoMotion.__dashboardCeoMotionV1 = true;
  renderDashboardCeoMotion.__dashboardInteractiveWrapped = true;
  renderDashboardCeoMotion.__alteaPremiumWrapped = true;

  window.renderDashboard = renderDashboardCeoMotion;
  globalThis.renderDashboard = renderDashboardCeoMotion;
  window.__ALTEA_DASHBOARD_CEO_MOTION_V1__ = {
    version: VERSION,
    render: renderDashboardCeoMotion,
    buildModel
  };

  function syncDashboardMarketplaceEvent(event) {
    const detail = event?.detail || {};
    const next = normalizePlatform(detail.internalPlatform || detail.platform || detail.marketplace || detail.market || readStorage(GLOBAL_MARKET_KEY, 'all'));
    writeStorage(GLOBAL_MARKET_KEY, next);
    if (dashboardRouteActive()) renderDashboardCeoMotion();
  }

  if (!window.__ALTEA_DASHBOARD_CEO_MOTION_MARKET_EVENTS__) {
    window.__ALTEA_DASHBOARD_CEO_MOTION_MARKET_EVENTS__ = true;
    window.addEventListener('altea:marketplacechange', syncDashboardMarketplaceEvent);
    document.addEventListener('altea:marketplacechange', syncDashboardMarketplaceEvent);
    window.addEventListener('altea:platformchange', syncDashboardMarketplaceEvent);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (dashboardRouteActive()) renderDashboardCeoMotion();
    }, { once: true });
  } else if (dashboardRouteActive()) {
    renderDashboardCeoMotion();
  }
})();
