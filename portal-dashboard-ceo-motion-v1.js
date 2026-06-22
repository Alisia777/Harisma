(function () {
  'use strict';

  const VERSION = '20260621-dashboard-ceo-motion-v1';
  const ROOT_ID = 'view-dashboard';
  const STYLE_ID = 'altea-dashboard-ceo-motion-v1-style';
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
    magnit: { label: 'Магнит', short: 'Магнит', color: '#e85b55' }
  };
  const METRICS = {
    orders: { label: 'Заказы', unit: 'int', chart: 'bars', route: 'product-leaderboard', tone: '#76a9ea' },
    buys: { label: 'Выкупы', unit: 'int', chart: 'bars', route: 'product-leaderboard', tone: '#74c99a' },
    revenue: { label: 'Выручка', unit: 'money', chart: 'bars', route: 'sku-plan-fact', tone: '#dbc7a3' },
    margin: { label: 'Маржа', unit: 'pct', chart: 'line', route: 'sku-plan-fact', tone: '#e0b760' },
    ads: { label: 'Реклама', unit: 'money', chart: 'bars', route: 'iu-drr', tone: '#a855f7' }
  };
  const FILES = {
    dashboard: 'data/dashboard.json',
    metrics: 'data/portal_dashboard_metrics.json',
    platformTrends: 'data/platform_trends.json',
    productLeaderboard: 'data/product_leaderboard.json',
    iuDrr: 'data/iu_drr_summary.json'
  };
  const sourceCache = {};
  let loadingPromise = null;

  function appState() {
    return window.__alteaAppState || window.state || window.__ALTEA_STATE__ || {};
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
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
    const raw = String(value || 'all').trim().toLowerCase();
    if (!raw || raw === 'marketplaces' || raw === 'all') return 'all';
    if (raw === 'yandex' || raw === 'ym' || raw === 'ya') return 'ya';
    if (raw === 'goldapple' || raw === 'gold_apple' || raw === 'ga' || raw === 'goldapple-online') return 'goldapple';
    if (raw === 'magnitmarket' || raw === 'magnit_market') return 'magnit';
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
    return normalizePlatform(
      readStorage(GLOBAL_MARKET_KEY, '')
      || state.globalMarketplace
      || state.uiHotfix?.globalMarketplace
      || state.uiHotfix?.dashboardPlatform
      || document.body?.dataset?.market
      || 'all'
    );
  }

  function stateSource(name) {
    const state = appState();
    if (name === 'dashboard') return state.dashboard;
    if (name === 'metrics') return state.portalDashboardMetrics;
    if (name === 'platformTrends') return state.platformTrends;
    if (name === 'productLeaderboard') return state.productLeaderboard;
    if (name === 'iuDrr') return state.iuDrrSummary || state.iuDrr;
    return null;
  }

  function source(name) {
    const statePayload = stateSource(name);
    if (statePayload && Object.keys(statePayload || {}).length) return statePayload;
    return sourceCache[name] || null;
  }

  function loadSources() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = Promise.all(Object.entries(FILES).map(([name, path]) => {
      if (source(name)) return Promise.resolve();
      return fetch(`${path}?v=${VERSION}`, { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (payload) sourceCache[name] = payload;
        })
        .catch(() => {});
    })).then(() => true);
    return loadingPromise;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} .ceo-motion-v1{--bg:#070706;--surface:#12100d;--surface2:#17140f;--line:#302a22;--line2:#514536;--text:#f4eee4;--muted:#a59c90;--faint:#70685f;--champ:#dbc7a3;--champ2:#f0dfbf;--ok:#74c99a;--warn:#e0b760;--bad:#e7786b;--info:#76a9ea;--platform:${PLATFORM_META.all.color};--ease:cubic-bezier(.22,.82,.22,1);position:relative;display:grid;gap:13px;color:var(--text);isolation:isolate;animation:ceoPageReveal 280ms var(--ease) both}
      #${ROOT_ID} .ceo-motion-v1 *{box-sizing:border-box}
      #${ROOT_ID} .ceo-motion-v1 button,#${ROOT_ID} .ceo-motion-v1 input{font:inherit;color:inherit}
      #${ROOT_ID} .ceo-motion-v1 button{cursor:pointer}
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
      #${ROOT_ID} .ceo-period{height:34px;padding:0 15px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--muted);font-size:11px;font-weight:900;transition:background 180ms var(--ease),border-color 180ms var(--ease),color 180ms var(--ease)}
      #${ROOT_ID} .ceo-period.active{background:var(--champ2);border-color:var(--champ2);color:#18120a}
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
      #${ROOT_ID} .ceo-legend .current{background:var(--platform)}#${ROOT_ID} .ceo-legend .previous{background:#5d554a}#${ROOT_ID} .ceo-legend .plan{height:2px;background:var(--champ2)}
      #${ROOT_ID} .ceo-chart{height:392px;padding:0 18px 17px}
      #${ROOT_ID} .ceo-chart svg{width:100%;height:100%;overflow:visible}
      #${ROOT_ID} .ceo-grid-line{stroke:rgba(255,255,255,.07);stroke-width:1}
      #${ROOT_ID} .ceo-bar-current{fill:var(--platform);opacity:.86;transform-origin:bottom;animation:ceoBarGrow 620ms var(--ease) both;animation-delay:calc(var(--i)*32ms)}
      #${ROOT_ID} .ceo-bar-prev{fill:#5f564a;opacity:.42;transform-origin:bottom;animation:ceoBarGrow 520ms var(--ease) both;animation-delay:calc(var(--i)*22ms)}
      #${ROOT_ID} .ceo-plan-line{fill:none;stroke:var(--champ2);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1500;animation:ceoLineDraw 800ms var(--ease) both}
      #${ROOT_ID} .ceo-rate-line{fill:none;stroke:var(--platform);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1500;animation:ceoLineDraw 800ms var(--ease) both}
      #${ROOT_ID} .ceo-rate-prev{fill:none;stroke:#70665a;stroke-width:2;opacity:.62}
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
      #${ROOT_ID} .ceo-platform-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
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
      #${ROOT_ID} .ceo-drawer-back{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity 260ms var(--ease)}
      #${ROOT_ID} .ceo-drawer-back.open{opacity:1;pointer-events:auto}
      #${ROOT_ID} .ceo-drawer{position:absolute;right:0;top:0;width:min(620px,94vw);height:100%;padding:24px;background:#0e0d0b;border-left:1px solid var(--line);transform:translateX(100%);transition:transform 260ms var(--ease);overflow:auto}
      #${ROOT_ID} .ceo-drawer-back.open .ceo-drawer{transform:none}
      #${ROOT_ID} .ceo-drawer h2{margin:0;font:500 30px Georgia,'Times New Roman',serif}
      #${ROOT_ID} .ceo-drawer p{color:var(--muted);font-size:12px;line-height:1.5}
      #${ROOT_ID} .ceo-drawer-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
      #${ROOT_ID} .ceo-drawer-metric{padding:12px;border:1px solid var(--line);border-radius:11px;background:#12100d}
      #${ROOT_ID} .ceo-drawer-metric small{display:block;color:var(--faint);font-size:10px}
      #${ROOT_ID} .ceo-drawer-metric strong{display:block;margin-top:8px;font-size:16px}
      #${ROOT_ID} .ceo-drawer-list{margin-top:15px;border-top:1px solid var(--line)}
      #${ROOT_ID} .ceo-drawer-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;width:100%;padding:10px 0;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left}
      #${ROOT_ID} .ceo-drawer-row b{font-size:12px}#${ROOT_ID} .ceo-drawer-row span{color:var(--muted);font-size:11px}
      #${ROOT_ID} .ceo-empty{padding:22px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);background:rgba(255,255,255,.018)}
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

  function findPlatform(platformTrends, key) {
    const normalized = normalizePlatform(key);
    return platformRows(platformTrends).find((item) => normalizePlatform(item.key) === normalized)
      || (normalized === 'all' ? platformRows(platformTrends).find((item) => normalizePlatform(item.key) === 'all') : null)
      || null;
  }

  function latestDate(platformTrends, dashboard) {
    const explicit = dateKey(
      platformTrends?.latestMarketplaceDate
      || dashboard?.dataFreshness?.asOfDate
      || dashboard?.asOfDate
      || dashboard?.latestMarketplaceDate
    );
    if (explicit) return explicit;
    const dates = [];
    platformRows(platformTrends).forEach((platform) => {
      (platform.series || []).forEach((row) => {
        const key = dateKey(row.date || row.label);
        if (key) dates.push(key);
      });
    });
    return dates.sort().pop() || '';
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

  function sumRows(rows) {
    return rows.reduce((acc, row) => {
      acc.orders += finite(row.ordersUnits, finite(row.units));
      acc.buys += finite(row.deliveredUnits, finite(row.units));
      acc.revenue += finite(row.revenue);
      acc.marginRub += finite(row.estimatedMargin, finite(row.financialResult));
      return acc;
    }, { orders: 0, buys: 0, revenue: 0, marginRub: 0 });
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

  function adsDailyValue(row, platform) {
    const key = normalizePlatform(platform);
    if (key === 'wb') return finite(row.spendFact, finite(row.spendFactDrr, finite(row.spendFactTotalIu)));
    if (key === 'ozon') return finite(row.spendFactOzon);
    if (key === 'ya') return finite(row.spendFactYandex);
    return finite(row.spendFact, finite(row.spendFactDrr))
      + finite(row.spendFactOzon)
      + finite(row.spendFactYandex);
  }

  function adsPlanDailyValue(row, platform) {
    const key = normalizePlatform(platform);
    if (key === 'wb') return finite(row.planSpendWb, finite(row.controlPlanSpendWb));
    if (key === 'ozon') return finite(row.planSpendOzon);
    if (key === 'ya') return finite(row.planSpendYandex);
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
      .filter((row) => row.date >= start && row.date <= end)
      .sort((left, right) => left.date.localeCompare(right.date));
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
    const rows = model.currentRows;
    const prev = model.previousRows;
    const planChannel = monthlyPlanChannel(model.dashboard, model.platform);
    const planUnitsPerDay = finite(model.dashboard?.brandSummary?.[0]?.plan_units) / Math.max(1, finite(model.dashboard?.companyPlan?.activeMonth?.days, 30));
    const platformShare = model.total.revenue > 0 && model.allTotal.revenue > 0 ? model.total.revenue / model.allTotal.revenue : 1;
    const buyoutTarget = model.total.orders > 0 ? model.total.buys / model.total.orders : .92;
    const marginTarget = model.plan.marginPct;
    const make = (row, index, current) => {
      const fallbackPrev = prev[index] || {};
      const base = current ? row : fallbackPrev;
      const revenue = finite(base.revenue);
      const orders = finite(base.ordersUnits, finite(base.units));
      const buys = finite(base.deliveredUnits, finite(base.units));
      const marginRub = finite(base.estimatedMargin, finite(base.financialResult));
      const day = dateKey(row.date || row.label || base.date || base.label) || model.range.start;
      const iuRow = model.iuRowsByDate[day] || {};
      if (metricKey === 'orders') return { date: day, value: orders, plan: planUnitsPerDay * platformShare, prev: finite(fallbackPrev.ordersUnits, finite(fallbackPrev.units)) };
      if (metricKey === 'buys') return { date: day, value: buys, plan: planUnitsPerDay * platformShare * buyoutTarget, prev: finite(fallbackPrev.deliveredUnits, finite(fallbackPrev.units)) };
      if (metricKey === 'revenue') return { date: day, value: revenue, plan: planChannel.dailyRevenue || revenue, prev: finite(fallbackPrev.revenue) };
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
    return platformRows(model.platformTrends)
      .filter((platform) => normalizePlatform(platform.key) !== 'all')
      .map((platform) => {
        const key = normalizePlatform(platform.key);
        const rows = rowsInRange(platform.series, model.range.start, model.range.end);
        const prevRows = rowsInRange(platform.series, model.range.prevStart, model.range.prevEnd);
        const total = sumRows(rows);
        const previous = sumRows(prevRows);
        const iuRows = model.iuRows;
        const ads = iuRows.reduce((sum, row) => sum + adsDailyValue(row, key), 0);
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
          sourceStatus: raw[key]?.status || ''
        };
      })
      .filter((item) => item.total.revenue > 0 || item.total.orders > 0)
      .sort((left, right) => right.total.revenue - left.total.revenue)
      .slice(0, 6);
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

  function buildDrivers(model) {
    const current = model.total;
    const previous = model.previousTotal;
    const prevAvgCheck = previous.orders > 0 ? previous.revenue / previous.orders : (current.orders > 0 ? current.revenue / current.orders : 0);
    const currentAvgCheck = current.orders > 0 ? current.revenue / current.orders : prevAvgCheck;
    const traffic = (current.orders - previous.orders) * prevAvgCheck;
    const price = (currentAvgCheck - prevAvgCheck) * current.orders;
    const prevBuyout = previous.orders > 0 ? previous.buys / previous.orders : (current.orders > 0 ? current.buys / current.orders : 0);
    const conversion = (current.buys - current.orders * prevBuyout) * currentAvgCheck;
    const oos = -Math.abs((model.dashboard?.lowStock || []).slice(0, 8).reduce((sum, row) => sum + finite(row.orders_value), 0));
    const adsDelta = -(current.ads - previous.ads);
    const returns = -Math.abs((model.dashboard?.topReturns || []).slice(0, 8).reduce((sum, row) => sum + finite(row.orders_value), 0));
    return [
      { key: 'traffic', label: 'Трафик / спрос', value: traffic, detail: 'изменение заказов к прошлому периоду', route: 'product-leaderboard' },
      { key: 'conversion', label: 'Выкуп / конверсия', value: conversion, detail: 'разница между заказами и выкупами', route: 'product-leaderboard' },
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
    const productLeaderboard = source('productLeaderboard') || {};
    const iuDrr = source('iuDrr') || {};
    const platform = currentGlobalPlatform();
    const asOf = latestDate(platformTrends, dashboard) || dateKey(dashboard?.dataFreshness?.asOfDate);
    const period = currentPeriod();
    const metric = currentMetric();
    const range = currentRange(asOf, period);
    const selectedPlatform = findPlatform(platformTrends, platform) || findPlatform(platformTrends, 'all') || { key: platform, series: [] };
    const allPlatform = findPlatform(platformTrends, 'all') || selectedPlatform;
    const currentRows = rowsInRange(selectedPlatform.series, range.start, range.end);
    const previousRows = rowsInRange(selectedPlatform.series, range.prevStart, range.prevEnd);
    const allRows = rowsInRange(allPlatform.series, range.start, range.end);
    const total = sumRows(currentRows);
    const previousTotal = sumRows(previousRows);
    const allTotal = sumRows(allRows);
    const iuRows = iuRowsInRange(iuDrr, range.start, range.end);
    const prevIuRows = iuRowsInRange(iuDrr, range.prevStart, range.prevEnd);
    const iuRowsByDate = {};
    iuRows.forEach((row) => { iuRowsByDate[row.date] = row; });
    total.ads = iuRows.reduce((sum, row) => sum + adsDailyValue(row, platform), 0);
    previousTotal.ads = prevIuRows.reduce((sum, row) => sum + adsDailyValue(row, platform), 0);
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
    const planAds = iuRows.reduce((sum, row) => sum + adsPlanDailyValue(row, platform), 0);
    const plan = {
      revenue: planChannel.revenueToDate || planRevenue,
      orders: planOrders,
      buys: planOrders * (total.orders > 0 ? total.buys / total.orders : .92),
      ads: planAds,
      marginPct: total.marginPct ?? .43,
      drr: total.revenue > 0 ? planAds / total.revenue : null
    };
    const platformCards = buildPlatformCards({ dashboard, metrics, platformTrends, iuRows, range, total, allTotal });
    const skuRows = buildSkuRows({ dashboard, productLeaderboard });
    const model = {
      dashboard,
      metrics,
      platformTrends,
      productLeaderboard,
      iuDrr,
      platform,
      period,
      metric,
      asOf,
      range,
      currentRows,
      previousRows,
      iuRows,
      prevIuRows,
      iuRowsByDate,
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
    if (metric === 'buys') return model.total.buys;
    if (metric === 'revenue') return model.total.revenue;
    if (metric === 'margin') return model.total.marginPct;
    if (metric === 'ads') return model.total.ads;
    return model.total.revenue;
  }

  function previousMetricValueFor(model, metric) {
    if (metric === 'orders') return model.previousTotal.orders;
    if (metric === 'buys') return model.previousTotal.buys;
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
    if (metric === 'margin') return current == null || prev == null ? null : current - prev;
    return prev ? current / prev - 1 : null;
  }

  function metricHint(model, metric) {
    const plan = planMetricValueFor(model, metric);
    const current = metricValueFor(model, metric);
    if (metric === 'orders') return `план ${fmtInt(plan)} шт.`;
    if (metric === 'buys') return model.total.orders ? `выкуп ${fmtPct(model.total.buys / model.total.orders)}` : 'нет факта выкупа';
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
        if (Number.isFinite(Number(value))) values.push(Number(value));
      });
    });
    if (!values.length) {
      return '<div class="ceo-empty">Нет дневного источника для выбранного среза.</div>';
    }
    const isLine = series.chart === 'line';
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
        ? `<text x="${x(index)}" y="${H - 14}" fill="var(--faint)" font-size="10" text-anchor="middle">${shortDate(point.date)}</text>`
        : '';
    }).join('');
    let body = '';
    if (isLine) {
      const currentLine = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
      const prevLine = points.map((point, index) => `${x(index)},${y(point.prev)}`).join(' ');
      const planLine = points.map((point, index) => `${x(index)},${y(point.plan)}`).join(' ');
      body += `<polyline class="ceo-rate-prev" points="${prevLine}"/><polyline class="ceo-plan-line" points="${planLine}"/><polyline class="ceo-rate-line" points="${currentLine}"/>`;
      points.forEach((point, index) => {
        body += `<circle cx="${x(index)}" cy="${y(point.value)}" r="4" fill="var(--platform)"/><rect class="ceo-hit" data-ceo-day="${escapeHtml(point.date)}" x="${x(index) - cw / Math.max(1, points.length) / 2}" y="${pad.t}" width="${cw / Math.max(1, points.length)}" height="${ch}"/>`;
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
      body += `<polyline class="ceo-plan-line" points="${planLine}"/>`;
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
        <div class="ceo-progress"><i style="width:${clamp(item.share * 100, 3, 100).toFixed(1)}%"></i></div>
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
    let body = `<line x1="${pad}" y1="${baseline}" x2="${W - pad}" y2="${baseline}" stroke="rgba(255,255,255,.12)"/>`;
    model.drivers.forEach((driver, index) => {
      const before = cumulative;
      cumulative += finite(driver.value);
      const x = pad + index * step + step * .15;
      const w = step * .7;
      const y1 = baseline - before / maxAbs * 150;
      const y2 = baseline - cumulative / maxAbs * 150;
      const top = Math.min(y1, y2);
      const h = Math.max(5, Math.abs(y2 - y1));
      const color = driver.value >= 0 ? 'var(--ok)' : 'var(--bad)';
      body += `<rect data-ceo-driver="${escapeHtml(driver.key)}" x="${x}" y="${top}" width="${w}" height="${h}" rx="7" fill="${color}" opacity=".82" style="animation:ceoBarGrow 520ms var(--ease) both;animation-delay:${index * 55}ms"/>`;
      body += `<text x="${x + w / 2}" y="${top - 8}" fill="${color}" font-size="10" font-weight="800" text-anchor="middle">${escapeHtml(driver.value >= 0 ? `+${fmtMoney(driver.value)}` : fmtMoney(driver.value))}</text>`;
      body += `<text x="${x + w / 2}" y="${H - 18}" fill="var(--faint)" font-size="10" text-anchor="middle">${escapeHtml(driver.label)}</text>`;
      if (index < model.drivers.length - 1) body += `<line x1="${x + w}" y1="${y2}" x2="${x + step}" y2="${y2}" stroke="rgba(255,255,255,.18)" stroke-dasharray="3 4"/>`;
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

  function renderShell(model) {
    const periodLabels = { '7': '7 дней', '14': '14 дней', mtd: 'Месяц к дате' };
    const platform = platformMeta(model.platform);
    return `
      <section class="ceo-motion-v1" data-dashboard-ceo-motion-version="${VERSION}" style="--platform:${platform.color}">
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
        <div class="ceo-drawer-back" data-ceo-drawer-back><aside class="ceo-drawer" data-ceo-drawer></aside></div>
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

  function closeDrawer(root) {
    root.querySelector('[data-ceo-drawer-back]')?.classList.remove('open');
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
      ['Выкупы', fmtInt(item.total.buys)],
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
        writeStorage(METRIC_KEY, metric.getAttribute('data-ceo-metric') || 'orders');
        renderDashboardCeoMotion();
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
  }

  function renderLoading(root) {
    root.innerHTML = `
      <section class="ceo-motion-v1">
        <div class="ceo-empty">Собираем CEO dashboard: факты, план, площадки и рекламный контур.</div>
      </section>
    `;
  }

  function renderDashboardCeoMotion() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    ensureStyle();
    const hasPlatformRows = platformRows(source('platformTrends')).length > 0;
    if (!hasPlatformRows) {
      renderLoading(root);
      loadSources().then(() => renderDashboardCeoMotion());
      return;
    }
    const model = buildModel();
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (dashboardRouteActive()) renderDashboardCeoMotion();
    }, { once: true });
  } else if (dashboardRouteActive()) {
    renderDashboardCeoMotion();
  }
})();
