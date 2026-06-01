(function () {
  if (window.__ALTEA_WB_RATING_REPORT_HOTFIX__) return;
  window.__ALTEA_WB_RATING_REPORT_HOTFIX__ = true;

  const VERSION = '20260601ratingreport6';
  const STYLE_ID = 'altea-wb-rating-report-hotfix-style';
  const auxCache = {
    trends: null,
    leaderboardHistory: null,
    pending: null
  };
  const workbenchState = {
    mode: 'summary',
    search: '',
    sort: 'risk',
    status: 'all'
  };
  const structuredState = {
    platform: 'wb',
    view: 'history'
  };

  function appState() {
    return window.__alteaAppState || (typeof state !== 'undefined' ? state : {});
  }

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function hasNumber(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function esc(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function chip(text, kind = '') {
    if (typeof badge === 'function') return badge(text, kind);
    return `<span class="chip ${esc(kind)}">${esc(text)}</span>`;
  }

  function fmtInt(value) {
    if (!hasNumber(value)) return '—';
    if (typeof fmt?.int === 'function') return fmt.int(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value));
  }

  function fmtNum(value, digits = 1) {
    if (!hasNumber(value)) return '—';
    if (typeof fmt?.num === 'function') return fmt.num(value, digits);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value));
  }

  function fmtMoney(value) {
    if (!hasNumber(value)) return '—';
    if (typeof fmt?.money === 'function') return fmt.money(value);
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0
    }).format(Number(value));
  }

  function fmtPct(value, digits = 1) {
    if (!hasNumber(value)) return '—';
    return `${(Number(value) * 100).toFixed(digits).replace('.', ',')}%`;
  }

  function isoDate(value) {
    if (!value) return '';
    const text = String(value).trim();
    const match = text.match(/\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const parsed = Date.parse(text);
    if (!Number.isFinite(parsed)) return '';
    return new Date(parsed).toISOString().slice(0, 10);
  }

  function dateValue(iso) {
    const normalized = isoDate(iso);
    if (!normalized) return 0;
    return Date.parse(`${normalized}T00:00:00Z`) || 0;
  }

  function addDays(iso, days) {
    const base = dateValue(iso);
    if (!base) return '';
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
  }

  function shortDate(iso) {
    const normalized = isoDate(iso);
    if (!normalized) return '—';
    const [, month, day] = normalized.split('-');
    return `${day}.${month}`;
  }

  function fullDate(iso) {
    const normalized = isoDate(iso);
    if (!normalized) return '—';
    const [year, month, day] = normalized.split('-');
    return `${day}.${month}.${year}`;
  }

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_-]+/gu, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function cardKey(card) {
    return normalizeKey(card?.articleKey || card?.supplierArticle || card?.article || card?.nmId);
  }

  function articleLabel(card) {
    return card?.articleKey || card?.supplierArticle || card?.article || card?.nmId || 'WB';
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #view-wb-rating.wb-rating-report { --rating-gold: #d7a64c; --rating-rose: #d96b6b; --rating-mint: #61c99b; --rating-blue: #73a7ff; }
      .wb-rating-platforms { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:12px 0 14px; }
      .wb-rating-platform { border:1px solid var(--line); border-radius:8px; padding:14px; background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.018)); min-width:0; }
      .wb-rating-platform.is-wb { border-color:rgba(215,166,76,.42); }
      .wb-rating-platform.is-ozon { border-color:rgba(115,167,255,.36); }
      .wb-rating-platform-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:12px; }
      .wb-rating-platform-code { display:inline-flex; align-items:center; justify-content:center; width:46px; height:30px; border-radius:8px; font-weight:800; letter-spacing:0; color:#0b0707; background:linear-gradient(180deg,#ffe5a2,#c9963f); }
      .wb-rating-platform.is-ozon .wb-rating-platform-code { color:#f8fbff; background:linear-gradient(180deg,#4d91ff,#1762d5); }
      .wb-rating-platform h3 { margin:0; font-size:16px; line-height:1.25; }
      .wb-rating-platform p { margin:4px 0 0; color:var(--muted); font-size:12px; line-height:1.35; }
      .wb-rating-kpis { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
      .wb-rating-kpis div { border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:9px; background:rgba(255,255,255,.025); min-width:0; }
      .wb-rating-kpis span { display:block; color:var(--muted); font-size:11px; line-height:1.25; }
      .wb-rating-kpis strong { display:block; margin-top:4px; font-size:15px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .wb-rating-game-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; margin:12px 0 14px; }
      .wb-rating-game-card { border:1px solid var(--line); border-radius:8px; padding:14px; background:rgba(255,255,255,.022); min-width:0; }
      .wb-rating-game-card > span { display:block; color:var(--muted); font-size:11px; line-height:1.25; }
      .wb-rating-game-card strong { display:block; margin-top:7px; font-size:22px; line-height:1.08; }
      .wb-rating-game-card small { display:block; margin-top:7px; color:var(--muted); line-height:1.35; }
      .wb-rating-trend { display:inline-flex; align-items:center; gap:5px; max-width:100%; margin-top:9px; padding:6px 9px; border-radius:999px; border:1px solid rgba(255,255,255,.1); font-size:12px; font-weight:800; line-height:1; white-space:nowrap; }
      .wb-rating-trend.up { color:#c8f4df; background:rgba(97,201,155,.14); border-color:rgba(97,201,155,.34); }
      .wb-rating-trend.down { color:#ffd0d0; background:rgba(217,107,107,.16); border-color:rgba(217,107,107,.38); }
      .wb-rating-trend.flat { color:#efe5d6; background:rgba(255,255,255,.05); border-color:rgba(255,255,255,.12); }
      .wb-rating-mission-strip { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:0 0 14px; }
      .wb-rating-mission { border:1px solid rgba(255,255,255,.09); border-radius:8px; padding:11px; background:rgba(255,255,255,.02); min-width:0; }
      .wb-rating-mission strong { display:block; font-size:13px; color:#f4ddba; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-rating-mission span { display:block; margin-top:5px; color:var(--muted); font-size:11px; line-height:1.28; }
      .wb-rating-report-table-wrap { overflow:auto; border:1px solid var(--line); border-radius:8px; background:rgba(8,6,10,.72); max-height:72vh; }
      .wb-rating-report-table { min-width:1680px; border-collapse:separate; border-spacing:0; table-layout:fixed; }
      .wb-rating-report-table th, .wb-rating-report-table td { padding:8px 9px; border-bottom:1px solid rgba(255,255,255,.07); border-right:1px solid rgba(255,255,255,.055); vertical-align:middle; }
      .wb-rating-report-table th { position:sticky; top:0; z-index:4; background:#181019; color:#f4ddba; font-size:11px; text-transform:none; letter-spacing:0; text-align:center; }
      .wb-rating-report-table thead tr:first-child th { top:0; background:#211423; }
      .wb-rating-report-table thead tr:nth-child(2) th { top:34px; background:#181019; }
      .wb-rating-report-table th.group-feedback { background:rgba(97,201,155,.14); }
      .wb-rating-report-table th.group-rating { background:rgba(215,166,76,.16); }
      .wb-rating-report-table th.group-revenue { background:rgba(115,167,255,.14); }
      .wb-rating-report-table th.group-negative { background:rgba(217,107,107,.14); }
      .wb-rating-report-table th.group-history { background:rgba(255,255,255,.07); }
      .wb-rating-report-table td { font-size:12px; line-height:1.3; color:var(--text); background:rgba(255,255,255,.012); }
      .wb-rating-report-table tbody tr:hover td { background:rgba(215,166,76,.06); }
      .wb-rating-report-table .sticky-col { position:sticky; left:0; z-index:3; background:#100b11; }
      .wb-rating-report-table .sticky-col-2 { position:sticky; left:54px; z-index:3; background:#100b11; }
      .wb-rating-report-table thead .sticky-col, .wb-rating-report-table thead .sticky-col-2 { z-index:5; background:#211423; }
      .wb-rating-report-table .num { text-align:right; font-variant-numeric:tabular-nums; }
      .wb-rating-report-table .center { text-align:center; }
      .wb-rating-cell-pill { display:inline-flex; align-items:center; justify-content:flex-end; min-width:58px; max-width:100%; padding:4px 7px; border-radius:8px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.026); font-variant-numeric:tabular-nums; line-height:1; }
      .wb-rating-cell-pill.good { color:#c8f4df; background:rgba(97,201,155,.11); border-color:rgba(97,201,155,.28); }
      .wb-rating-cell-pill.warn { color:#f8dfa8; background:rgba(215,166,76,.13); border-color:rgba(215,166,76,.34); }
      .wb-rating-cell-pill.risk { color:#ffd0d0; background:rgba(217,107,107,.14); border-color:rgba(217,107,107,.34); }
      .wb-rating-cell-pill.info { color:#d8e6ff; background:rgba(115,167,255,.11); border-color:rgba(115,167,255,.28); }
      .wb-rating-cell-pill.muted { color:var(--muted); }
      .wb-rating-modebar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:14px 0 12px; }
      .wb-rating-mode-btn { border:1px solid rgba(255,255,255,.1); border-radius:999px; background:rgba(255,255,255,.035); color:var(--text); padding:8px 12px; font:inherit; font-size:12px; line-height:1; cursor:pointer; }
      .wb-rating-mode-btn.active { border-color:rgba(215,166,76,.72); background:rgba(215,166,76,.18); color:#ffe6ae; }
      .wb-rating-workbench-controls { display:grid; grid-template-columns:minmax(220px,1fr) 180px 190px auto; gap:10px; align-items:center; margin:10px 0 12px; }
      .wb-rating-workbench-controls input, .wb-rating-workbench-controls select { width:100%; min-width:0; border:1px solid rgba(255,255,255,.1); border-radius:8px; background:rgba(255,255,255,.04); color:var(--text); padding:9px 10px; font:inherit; font-size:13px; }
      .wb-rating-workbench-controls button { border:1px solid rgba(255,255,255,.1); border-radius:8px; background:rgba(255,255,255,.04); color:var(--text); padding:9px 12px; font:inherit; font-size:13px; cursor:pointer; white-space:nowrap; }
      .wb-rating-queue { display:grid; gap:8px; }
      .wb-rating-queue-row { display:grid; grid-template-columns:230px 106px 1fr 180px; gap:12px; align-items:center; border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.018); padding:11px; }
      .wb-rating-queue-row:hover { background:rgba(215,166,76,.055); }
      .wb-rating-queue-main { min-width:0; }
      .wb-rating-queue-main strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-rating-queue-text { color:#efe5d6; font-size:12px; line-height:1.4; min-width:0; }
      .wb-rating-queue-kpis { display:flex; flex-wrap:wrap; gap:6px; margin-top:7px; }
      .wb-rating-priority { display:inline-flex; justify-content:center; align-items:center; border-radius:8px; border:1px solid rgba(255,255,255,.12); min-width:76px; padding:7px 9px; font-weight:800; line-height:1; }
      .wb-rating-priority.high { color:#ffd0d0; background:rgba(217,107,107,.15); border-color:rgba(217,107,107,.38); }
      .wb-rating-priority.medium { color:#f8dfa8; background:rgba(215,166,76,.15); border-color:rgba(215,166,76,.36); }
      .wb-rating-priority.low { color:#c8f4df; background:rgba(97,201,155,.13); border-color:rgba(97,201,155,.32); }
      .wb-rating-row-title { display:flex; flex-direction:column; gap:4px; min-width:0; }
      .wb-rating-row-title strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-rating-chipline { display:flex; flex-wrap:wrap; gap:5px; margin-top:3px; }
      .wb-rating-pill { display:inline-flex; align-items:center; max-width:100%; padding:6px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.09); background:rgba(255,255,255,.03); color:#efe5d6; font-size:12px; font-weight:700; line-height:1; white-space:nowrap; }
      .wb-rating-pill.good { color:#c8f4df; background:rgba(97,201,155,.12); border-color:rgba(97,201,155,.3); }
      .wb-rating-pill.warn { color:#f8dfa8; background:rgba(215,166,76,.14); border-color:rgba(215,166,76,.34); }
      .wb-rating-pill.risk { color:#ffd0d0; background:rgba(217,107,107,.15); border-color:rgba(217,107,107,.36); }
      .wb-rating-pill.info { color:#d8e6ff; background:rgba(115,167,255,.12); border-color:rgba(115,167,255,.32); }
      .wb-rating-mini-note { color:var(--muted); font-size:11px; }
      .wb-rating-game-badge { display:inline-flex; align-items:center; justify-content:center; min-width:96px; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.1); font-weight:800; line-height:1; }
      .wb-rating-game-badge.good { color:#c8f4df; background:rgba(97,201,155,.13); border-color:rgba(97,201,155,.32); }
      .wb-rating-game-badge.warn { color:#f4d79d; background:rgba(215,166,76,.14); border-color:rgba(215,166,76,.34); }
      .wb-rating-game-badge.risk { color:#ffd0d0; background:rgba(217,107,107,.15); border-color:rgba(217,107,107,.36); }
      .wb-rating-scorebar { height:4px; width:76px; margin:6px auto 0; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden; }
      .wb-rating-scorebar span { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#d96b6b,#d7a64c,#61c99b); }
      .wb-rating-comment { min-width:220px; color:#efe5d6; }
      .wb-rating-source-note { margin-top:10px; color:var(--muted); font-size:12px; line-height:1.45; }
      @media (max-width: 1100px) {
        .wb-rating-platforms, .wb-rating-game-grid, .wb-rating-mission-strip { grid-template-columns:1fr; }
        .wb-rating-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .wb-rating-workbench-controls, .wb-rating-queue-row { grid-template-columns:1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureStructuredStyles() {
    const id = 'altea-wb-rating-structured-v6';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .rating-structured-shell { display:grid; gap:16px; }
      .rating-platform-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
      .rating-platform-panel { border:1px solid var(--line); border-radius:8px; background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.016)); padding:16px; min-width:0; }
      .rating-platform-panel.is-wb { border-color:rgba(215,166,76,.42); }
      .rating-platform-panel.is-ozon { border-color:rgba(115,167,255,.38); }
      .rating-platform-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; }
      .rating-platform-title { display:flex; align-items:center; gap:10px; min-width:0; }
      .rating-platform-logo { display:inline-flex; align-items:center; justify-content:center; width:58px; height:42px; border-radius:8px; font-size:18px; font-weight:900; letter-spacing:0; color:#0b0707; background:linear-gradient(180deg,#ffe8ad,#c9963f); }
      .rating-platform-panel.is-ozon .rating-platform-logo { color:#fff; background:linear-gradient(180deg,#4d91ff,#1762d5); }
      .rating-platform-title h3 { margin:0; font-size:20px; line-height:1.15; }
      .rating-platform-title p { margin:5px 0 0; color:var(--muted); font-size:13px; line-height:1.35; }
      .rating-platform-action { border:1px solid rgba(255,255,255,.12); border-radius:8px; background:rgba(255,255,255,.04); color:var(--text); padding:10px 13px; font:inherit; font-size:13px; cursor:pointer; white-space:nowrap; }
      .rating-platform-action.active { border-color:rgba(215,166,76,.72); background:rgba(215,166,76,.18); color:#ffe6ae; }
      .rating-metric-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .rating-metric-card { border:1px solid rgba(255,255,255,.09); border-radius:8px; background:rgba(255,255,255,.026); padding:16px; min-width:0; min-height:118px; }
      .rating-metric-card.is-empty { opacity:.76; }
      .rating-metric-card span.label { display:block; color:var(--muted); font-size:13px; line-height:1.25; }
      .rating-metric-card strong { display:block; margin-top:8px; font-size:30px; line-height:1.08; white-space:normal; overflow:visible; text-overflow:clip; overflow-wrap:anywhere; }
      .rating-metric-card small { display:block; margin-top:7px; color:var(--muted); line-height:1.35; }
      .rating-work-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:2px 0 0; }
      .rating-work-tabs button { border:1px solid rgba(255,255,255,.1); border-radius:999px; background:rgba(255,255,255,.04); color:var(--text); padding:10px 14px; font:inherit; font-size:13px; cursor:pointer; }
      .rating-work-tabs button.active { border-color:rgba(215,166,76,.7); background:rgba(215,166,76,.18); color:#ffe6ae; }
      .rating-detail-panel { border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.018); padding:16px; }
      .rating-detail-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; }
      .rating-detail-head h3 { margin:0; font-size:20px; line-height:1.15; }
      .rating-detail-head p { margin:5px 0 0; color:var(--muted); line-height:1.35; }
      .rating-history-list { display:grid; gap:10px; }
      .rating-history-card { display:grid; grid-template-columns:minmax(220px,1.1fr) minmax(0,2.4fr); gap:14px; align-items:stretch; border:1px solid rgba(255,255,255,.08); border-radius:8px; background:rgba(255,255,255,.022); padding:12px; }
      .rating-history-main { min-width:0; }
      .rating-history-main strong { display:block; font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .rating-history-main .meta { margin-top:6px; color:var(--muted); font-size:12px; }
      .rating-history-metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }
      .rating-mini-metric { border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:9px; background:rgba(255,255,255,.022); min-width:0; }
      .rating-mini-metric span { display:block; color:var(--muted); font-size:11px; line-height:1.2; }
      .rating-mini-metric strong { display:block; margin-top:5px; font-size:16px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .rating-empty-ozon { display:grid; grid-template-columns:1.1fr 1fr; gap:14px; align-items:stretch; }
      .rating-empty-ozon .box { border:1px solid rgba(255,255,255,.09); border-radius:8px; padding:14px; background:rgba(255,255,255,.024); }
      .rating-empty-ozon h4 { margin:0 0 8px; font-size:16px; }
      .rating-empty-ozon p { margin:0; color:var(--muted); line-height:1.45; }
      .rating-empty-ozon .need-list { display:grid; gap:8px; margin-top:10px; }
      @media (max-width: 1200px) {
        .rating-platform-grid, .rating-empty-ozon { grid-template-columns:1fr; }
        .rating-metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .rating-history-card { grid-template-columns:1fr; }
        .rating-history-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
      }
      @media (max-width: 640px) {
        .rating-metric-grid, .rating-history-metrics { grid-template-columns:1fr; }
        .rating-metric-card strong { font-size:26px; }
        .rating-platform-head, .rating-detail-head { flex-direction:column; }
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchJson(path) {
    const url = path.includes('?') ? path : `${path}?v=${VERSION}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
    return response.json();
  }

  function ensureAuxData() {
    const st = appState();
    const tasks = [];
    if (Array.isArray(st.platformTrends?.platforms) && st.platformTrends.platforms.length) {
      auxCache.trends = st.platformTrends;
    } else if (!auxCache.trends) {
      tasks.push(fetchJson('data/platform_trends.json').then((payload) => {
        auxCache.trends = payload;
        if (!Array.isArray(st.platformTrends?.platforms) || !st.platformTrends.platforms.length) st.platformTrends = payload;
      }));
    }

    if (Array.isArray(st.productLeaderboardHistory) && st.productLeaderboardHistory.length) {
      auxCache.leaderboardHistory = st.productLeaderboardHistory;
    } else if (!auxCache.leaderboardHistory) {
      tasks.push(fetchJson('data/product_leaderboard_history.json').then((payload) => {
        auxCache.leaderboardHistory = Array.isArray(payload) ? payload : [];
        if (!Array.isArray(st.productLeaderboardHistory) || !st.productLeaderboardHistory.length) {
          st.productLeaderboardHistory = auxCache.leaderboardHistory;
        }
      }));
    }

    if (!tasks.length || auxCache.pending) return;
    auxCache.pending = Promise.allSettled(tasks).finally(() => {
      auxCache.pending = null;
      const activeView = appState().activeView || '';
      if (activeView === 'wb-rating') {
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
        else renderWbCardRatingReport('view-wb-rating');
      }
    });
  }

  function getSnapshots(payload) {
    const fromHistory = Array.isArray(payload?.history) ? payload.history : [];
    const snapshots = fromHistory
      .map((snapshot) => ({
        ...snapshot,
        date: isoDate(snapshot.date || snapshot.window?.to || snapshot.generatedAt),
        cards: Array.isArray(snapshot.cards) ? snapshot.cards : []
      }))
      .filter((snapshot) => snapshot.date && snapshot.cards.length)
      .sort((a, b) => dateValue(a.date) - dateValue(b.date));

    const payloadCards = Array.isArray(payload?.cards) ? payload.cards : [];
    const payloadDate = isoDate(payload?.window?.to || payload?.generatedAt);
    if (payloadDate && payloadCards.length) {
      const index = snapshots.findIndex((snapshot) => snapshot.date === payloadDate);
      const liveSnapshot = { ...payload, date: payloadDate, cards: payloadCards };
      if (index >= 0) snapshots[index] = liveSnapshot;
      else snapshots.push(liveSnapshot);
    }

    return snapshots.sort((a, b) => dateValue(a.date) - dateValue(b.date));
  }

  function snapshotMap(snapshot) {
    const map = new Map();
    (snapshot?.cards || []).forEach((card) => {
      const key = cardKey(card);
      if (key) map.set(key, card);
    });
    return map;
  }

  function snapshotAtOrBefore(snapshots, targetDate, latestDate) {
    const target = dateValue(targetDate);
    const latest = dateValue(latestDate);
    let candidate = null;
    snapshots.forEach((snapshot) => {
      const value = dateValue(snapshot.date);
      if (value <= target && value < latest) candidate = snapshot;
    });
    return candidate || snapshots.find((snapshot) => dateValue(snapshot.date) < latest) || snapshots[0] || null;
  }

  function periodRating(active, base) {
    const activeRating = num(active?.avgRating || active?.ratingTrendLatestRating);
    const baseRating = num(base?.avgRating || base?.ratingTrendLatestRating);
    const activeCount = num(active?.ratingFeedbackCount || active?.feedbackCount);
    const baseCount = num(base?.ratingFeedbackCount || base?.feedbackCount);
    const deltaCount = activeCount - baseCount;

    if (deltaCount > 0 && activeRating > 0 && baseRating > 0) {
      const weighted = ((activeRating * activeCount) - (baseRating * baseCount)) / deltaCount;
      if (Number.isFinite(weighted) && weighted >= 1 && weighted <= 5) return weighted;
    }
    return activeRating || baseRating || null;
  }

  function delta(active, base, field) {
    return Math.max(0, num(active?.[field]) - num(base?.[field]));
  }

  function buildSkuMap(st) {
    const map = new Map();
    (Array.isArray(st.skus) ? st.skus : []).forEach((sku) => {
      const keys = [sku?.articleKey, sku?.article, sku?.sku, sku?.wb?.nmId, sku?.ozon?.sku];
      keys.map(normalizeKey).filter(Boolean).forEach((key) => {
        if (!map.has(key)) map.set(key, sku);
      });
    });
    return map;
  }

  function latestLeaderboardMap(st) {
    const history = Array.isArray(st.productLeaderboardHistory) && st.productLeaderboardHistory.length
      ? st.productLeaderboardHistory
      : (auxCache.leaderboardHistory || []);
    const latest = [...history].reverse().find((snapshot) => Array.isArray(snapshot?.items) && snapshot.items.length);
    const directItems = Array.isArray(st.productLeaderboard?.items) ? st.productLeaderboard.items : [];
    const items = latest?.items?.length ? latest.items : directItems;
    const map = new Map();
    items.forEach((item) => {
      [item?.articleKey, item?.article, item?.sku].map(normalizeKey).filter(Boolean).forEach((key) => {
        if (!map.has(key)) map.set(key, item);
      });
    });
    return { map, label: latest?.weekLabel || st.productLeaderboard?.weekLabel || 'последняя неделя' };
  }

  function skuRevenueMonth(sku) {
    return num(
      sku?.planFact?.factApr16Revenue
      ?? sku?.planFact?.factFeb26Revenue
      ?? sku?.planFact?.factTotalRevenue
      ?? sku?.orders?.value
      ?? sku?.revenue
    );
  }

  function revenueModel(key, leaderboard, skuMap) {
    const leader = leaderboard.map.get(key);
    if (leader && hasNumber(leader.revenue)) {
      const week = num(leader.revenue);
      return { revenue7: week, revenue3: week * 3 / 7, revenue1: week / 7, source: 'КЗ' };
    }
    const sku = skuMap.get(key);
    const month = skuRevenueMonth(sku);
    if (month > 0) {
      return { revenue7: month * 7 / 30, revenue3: month * 3 / 30, revenue1: month / 30, source: 'план-факт' };
    }
    return { revenue7: null, revenue3: null, revenue1: null, source: '' };
  }

  function platformPayload(key) {
    const st = appState();
    const trends = Array.isArray(st.platformTrends?.platforms) && st.platformTrends.platforms.length
      ? st.platformTrends
      : auxCache.trends;
    return (trends?.platforms || []).find((platform) => normalizeKey(platform?.key || platform?.label) === key);
  }

  function platformWindow(key, days) {
    const platform = platformPayload(key);
    const rows = (platform?.series || [])
      .map((row) => ({ ...row, date: isoDate(row.date || row.label) }))
      .filter((row) => row.date)
      .sort((a, b) => dateValue(a.date) - dateValue(b.date))
      .slice(-days);
    return {
      revenue: rows.reduce((sum, row) => sum + num(row.revenue || row.ordersRevenue), 0),
      units: rows.reduce((sum, row) => sum + num(row.units || row.ordersUnits), 0),
      latestDate: rows.length ? rows[rows.length - 1].date : ''
    };
  }

  function buildPeriod(active, base) {
    const reviews = delta(active, base, 'feedbackCount');
    const low = delta(active, base, 'lowRatingCount');
    return {
      reviews,
      low,
      rating: periodRating(active, base),
      negativePct: reviews > 0 ? low / reviews : null
    };
  }

  function buildQuestionPeriod(active, base) {
    return {
      questions: delta(active, base, 'questionCount'),
      unanswered: delta(active, base, 'unansweredQuestionCount')
    };
  }

  function rowTone(row) {
    if (row.unanswered > 12 || row.p1.negativePct >= 0.18 || row.ratingDelta1 <= -0.04) return 'risk';
    if (row.p7.reviews >= 10 && (row.p7.negativePct === null || row.p7.negativePct <= 0.05) && row.rating >= 4.75) return 'good';
    return 'warn';
  }

  function gameLabel(row) {
    if (row.unanswered > 0 || row.unansweredQuestions > 0) return 'Нужен ответ';
    if (row.p1.low > 0 || row.p7.negativePct >= 0.12) return 'Негатив';
    if (row.ratingDelta1 <= -0.03) return 'Падение';
    if (row.ratingDelta1 >= 0.03) return 'Рост';
    if (row.p7.reviews >= 10 && (row.p7.negativePct === null || row.p7.negativePct <= 0.05)) return 'Хороший поток';
    return 'Норма';
  }

  function rowComment(row) {
    if (row.unanswered > 0) return `Ответить: ${fmtInt(row.unanswered)}`;
    if (row.p1.low > 0 && row.p1.reviews > 0) return `Негатив вчера: ${fmtInt(row.p1.low)} из ${fmtInt(row.p1.reviews)}`;
    if (row.ratingDelta1 <= -0.04) return `Просадка: ${fmtNum(row.ratingDelta1, 2)}`;
    if (row.p7.reviews >= 12 && (row.p7.negativePct === null || row.p7.negativePct <= 0.05)) return 'сильный поток без негатива';
    if (row.p7.reviews === 0) return 'тихо';
    return 'ок';
  }

  function buildModel(payload) {
    const st = appState();
    const snapshots = getSnapshots(payload);
    const active = snapshots[snapshots.length - 1] || null;
    if (!active) return null;

    const baseline7 = snapshotAtOrBefore(snapshots, addDays(active.date, -7), active.date);
    const baseline3 = snapshotAtOrBefore(snapshots, addDays(active.date, -3), active.date);
    const baseline1 = snapshotAtOrBefore(snapshots, addDays(active.date, -1), active.date);
    const historyNear = snapshotAtOrBefore(snapshots, addDays(active.date, -3), active.date);
    const maps = {
      p7: snapshotMap(baseline7),
      p3: snapshotMap(baseline3),
      p1: snapshotMap(baseline1),
      history: snapshotMap(historyNear)
    };
    const skuMap = buildSkuMap(st);
    const leaderboard = latestLeaderboardMap(st);

    const rows = active.cards.map((card, index) => {
      const key = cardKey(card);
      const base7 = maps.p7.get(key);
      const base3 = maps.p3.get(key);
      const base1 = maps.p1.get(key);
      const historyCard = maps.history.get(key);
      const p7 = buildPeriod(card, base7);
      const p3 = buildPeriod(card, base3);
      const p1 = buildPeriod(card, base1);
      const q7 = buildQuestionPeriod(card, base7);
      const q3 = buildQuestionPeriod(card, base3);
      const q1 = buildQuestionPeriod(card, base1);
      const revenue = revenueModel(key, leaderboard, skuMap);
      const rating = num(card.avgRating || card.ratingTrendLatestRating);
      const ratingDelta1 = rating - num(base1?.avgRating || base1?.ratingTrendLatestRating || rating);
      const unanswered = num(card.unansweredFeedbackCount);
      const negativeTotalPct = num(card.lowRatingCount) / Math.max(1, num(card.feedbackCount));
      const gameScore = Math.max(1, Math.round(
        rating * 13
        + Math.min(18, p7.reviews * 0.7)
        + Math.max(-16, ratingDelta1 * 120)
        - Math.min(20, (p7.negativePct || negativeTotalPct) * 70)
        - Math.min(15, unanswered * 0.55)
      ));
      const row = {
        index: index + 1,
        key,
        card,
        label: articleLabel(card),
        rating,
        ratingDelta1,
        feedbackCount: num(card.feedbackCount),
        lowRatingCount: num(card.lowRatingCount),
        unanswered,
        questionCount: num(card.questionCount),
        unansweredQuestions: num(card.unansweredQuestionCount),
        lastFeedbackDate: isoDate(card.lastFeedbackDate || active.date),
        lastQuestionDate: isoDate(card.lastQuestionDate || active.date),
        p7,
        p3,
        p1,
        q7,
        q3,
        q1,
        revenue,
        historyDelta: historyCard ? num(card.feedbackCount) - num(historyCard.feedbackCount) : null,
        historyRating: historyCard ? num(historyCard.avgRating || historyCard.ratingTrendLatestRating) : null,
        gameScore,
        negativeTotalPct
      };
      row.tone = rowTone(row);
      row.comment = rowComment(row);
      return row;
    }).sort((a, b) => {
      const riskA = a.tone === 'risk' ? 1 : 0;
      const riskB = b.tone === 'risk' ? 1 : 0;
      return riskB - riskA || b.gameScore - a.gameScore || b.p7.reviews - a.p7.reviews || a.label.localeCompare(b.label, 'ru');
    });

    const totals = rows.reduce((acc, row) => {
      acc.reviews7 += row.p7.reviews;
      acc.reviews3 += row.p3.reviews;
      acc.reviews1 += row.p1.reviews;
      acc.low7 += row.p7.low;
      acc.low3 += row.p3.low;
      acc.low1 += row.p1.low;
      acc.unanswered += row.unanswered;
      acc.questions += row.questionCount;
      acc.unansweredQuestions += row.unansweredQuestions;
      acc.questions7 += row.q7.questions;
      acc.questions3 += row.q3.questions;
      acc.questions1 += row.q1.questions;
      acc.unansweredQuestions7 += row.q7.unanswered;
      acc.revenue7 += num(row.revenue.revenue7);
      acc.revenue3 += num(row.revenue.revenue3);
      acc.revenue1 += num(row.revenue.revenue1);
      acc.ratingSum += row.rating;
      acc.ratingCount += row.rating ? 1 : 0;
      acc.leaders += row.rating >= 4.8 ? 1 : 0;
      acc.risks += row.tone === 'risk' ? 1 : 0;
      return acc;
    }, {
      reviews7: 0, reviews3: 0, reviews1: 0,
      low7: 0, low3: 0, low1: 0,
      unanswered: 0, questions: 0, unansweredQuestions: 0,
      questions7: 0, questions3: 0, questions1: 0, unansweredQuestions7: 0,
      revenue7: 0, revenue3: 0, revenue1: 0,
      ratingSum: 0, ratingCount: 0, leaders: 0, risks: 0
    });

    totals.avgRating = totals.ratingCount ? totals.ratingSum / totals.ratingCount : null;
    totals.neg7 = totals.reviews7 ? totals.low7 / totals.reviews7 : null;
    totals.neg3 = totals.reviews3 ? totals.low3 / totals.reviews3 : null;
    totals.neg1 = totals.reviews1 ? totals.low1 / totals.reviews1 : null;

    return {
      snapshots,
      active,
      baseline7,
      baseline3,
      baseline1,
      historyNear,
      rows,
      totals,
      leaderboardLabel: leaderboard.label,
      wbWindow7: platformWindow('wb', 7),
      ozonWindow7: platformWindow('ozon', 7)
    };
  }

  function rowIndex(model) {
    const map = new Map();
    (model?.rows || []).forEach((row) => {
      [row.key, row.label, row.card?.articleKey, row.card?.nmId].map(normalizeKey).filter(Boolean).forEach((key) => {
        if (!map.has(key)) map.set(key, row);
      });
    });
    return map;
  }

  function priorityTone(score) {
    if (score >= 60) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  function priorityText(score) {
    if (score >= 60) return 'Срочно';
    if (score >= 25) return 'Наблюдать';
    return 'Ок';
  }

  function feedbackItems(payload, model) {
    const rows = rowIndex(model);
    const recent = Array.isArray(payload?.recentFeedbacks) ? payload.recentFeedbacks : [];
    if (recent.length) {
      return recent.map((item, index) => {
        const key = normalizeKey(item.articleKey || item.supplierArticle || item.nmId || item.article);
        const row = rows.get(key) || {};
        const valuation = hasNumber(item.valuation) ? num(item.valuation) : null;
        const unanswered = item.answered === false ? 1 : 0;
        const low = valuation !== null && valuation <= 3 ? 1 : 0;
        const priority = unanswered * 45 + low * 35 + Math.max(0, 5 - (valuation || row.rating || 5)) * 7;
        return {
          id: item.id || `feedback-${index}`,
          kind: 'feedback',
          key: key || row.key || `feedback-${index}`,
          label: item.articleKey || item.supplierArticle || row.label || item.nmId || 'WB',
          nmId: item.nmId || row.card?.nmId || '',
          productName: item.productName || row.card?.productName || '',
          date: isoDate(item.date || item.createdDate || item.updatedDate || row.lastFeedbackDate),
          text: item.textSnippet || 'Текст отзыва пока не пришел.',
          valuation,
          answered: item.answered !== false,
          unanswered,
          low,
          reviews7: row.p7?.reviews || 0,
          low7: row.p7?.low || low,
          rating: row.rating || valuation,
          priority,
          aggregate: false
        };
      });
    }

    return model.rows
      .filter((row) => row.unanswered || row.p7.low || row.p7.reviews || row.ratingDelta1 < 0)
      .map((row) => {
        const priority = row.unanswered * 8 + row.p7.low * 5 + row.p1.low * 8 + Math.max(0, -row.ratingDelta1) * 120;
        return {
          id: `feedback-card-${row.key}`,
          kind: 'feedback',
          key: row.key,
          label: row.label,
          nmId: row.card?.nmId || '',
          productName: row.card?.productName || '',
          date: row.lastFeedbackDate || model.active.date,
          text: row.comment,
          valuation: row.p1.rating || row.rating,
          answered: row.unanswered === 0,
          unanswered: row.unanswered,
          low: row.p7.low,
          reviews7: row.p7.reviews,
          reviews3: row.p3.reviews,
          reviews1: row.p1.reviews,
          low7: row.p7.low,
          rating: row.rating,
          priority,
          aggregate: true
        };
      });
  }

  function questionItems(payload, model) {
    const rows = rowIndex(model);
    const recent = Array.isArray(payload?.recentQuestions) ? payload.recentQuestions : [];
    if (recent.length) {
      return recent.map((item, index) => {
        const key = normalizeKey(item.articleKey || item.supplierArticle || item.nmId || item.article);
        const row = rows.get(key) || {};
        const unanswered = item.answered === false ? 1 : 0;
        const priority = unanswered * 50 + (item.wasViewed ? 0 : 8) + num(row.questionCount);
        return {
          id: item.id || `question-${index}`,
          kind: 'question',
          key: key || row.key || `question-${index}`,
          label: item.articleKey || item.supplierArticle || row.label || item.nmId || 'WB',
          nmId: item.nmId || row.card?.nmId || '',
          productName: item.productName || row.card?.productName || '',
          date: isoDate(item.date || item.createdDate || item.updatedDate || row.lastQuestionDate),
          text: item.textSnippet || 'Текст вопроса пока не пришел.',
          answered: item.answered !== false,
          unanswered,
          questionCount: row.questionCount || 1,
          priority,
          aggregate: false
        };
      });
    }

    return model.rows
      .filter((row) => row.questionCount || row.unansweredQuestions)
      .map((row) => {
        const priority = row.unansweredQuestions * 45 + row.questionCount * 1.5;
        return {
          id: `question-card-${row.key}`,
          kind: 'question',
          key: row.key,
          label: row.label,
          nmId: row.card?.nmId || '',
          productName: row.card?.productName || '',
          date: row.lastQuestionDate || model.active.date,
          text: row.unansweredQuestions
            ? `Ответить: ${fmtInt(row.unansweredQuestions)}`
            : `Вопросов: ${fmtInt(row.questionCount)}`,
          answered: row.unansweredQuestions === 0,
          unanswered: row.unansweredQuestions,
          questionCount: row.questionCount,
          priority,
          aggregate: true
        };
      });
  }

  function filterWorkbenchItems(items, kind) {
    const query = normalizeKey(workbenchState.search);
    let next = [...items];
    if (query) {
      next = next.filter((item) => normalizeKey([
        item.label,
        item.productName,
        item.nmId,
        item.text
      ].filter(Boolean).join(' ')).includes(query));
    }

    if (workbenchState.status === 'unanswered') {
      next = next.filter((item) => num(item.unanswered) > 0 || item.answered === false);
    } else if (workbenchState.status === 'negative') {
      next = next.filter((item) => kind === 'feedback' && (num(item.low) > 0 || (hasNumber(item.valuation) && num(item.valuation) <= 3)));
    } else if (workbenchState.status === 'fresh') {
      const newest = next.reduce((latest, item) => Math.max(latest, dateValue(item.date)), 0);
      next = next.filter((item) => dateValue(item.date) === newest);
    }

    const sort = workbenchState.sort;
    next.sort((a, b) => {
      if (sort === 'date') return dateValue(b.date) - dateValue(a.date) || num(b.priority) - num(a.priority);
      if (sort === 'unanswered') return num(b.unanswered) - num(a.unanswered) || num(b.priority) - num(a.priority);
      if (sort === 'rating') return num(a.valuation || a.rating || 5) - num(b.valuation || b.rating || 5) || num(b.priority) - num(a.priority);
      if (sort === 'article') return String(a.label || '').localeCompare(String(b.label || ''), 'ru');
      return num(b.priority) - num(a.priority) || dateValue(b.date) - dateValue(a.date);
    });
    return next;
  }

  function modeCounts(model, payload) {
    return {
      summary: model.rows.length,
      feedback: feedbackItems(payload, model).length,
      questions: questionItems(payload, model).length
    };
  }

  function renderModeNav(model, payload) {
    const counts = modeCounts(model, payload);
    const tabs = [
      ['summary', `Сводка ${fmtInt(counts.summary)}`],
      ['feedback', `Отзывы ${fmtInt(counts.feedback)}`],
      ['questions', `Вопросы ${fmtInt(counts.questions)}`]
    ];
    return `
      <div class="wb-rating-modebar" role="tablist" aria-label="Режим рейтинга карточек">
        ${tabs.map(([mode, label]) => `
          <button class="wb-rating-mode-btn ${workbenchState.mode === mode ? 'active' : ''}" type="button" data-wb-rating-mode="${esc(mode)}">${esc(label)}</button>
        `).join('')}
      </div>
    `;
  }

  function renderWorkbenchControls(kind, total, visible) {
    const statusOptions = kind === 'feedback'
      ? [
        ['all', 'Все отзывы'],
        ['unanswered', 'Без ответа'],
        ['negative', 'Негатив'],
        ['fresh', 'Последний день']
      ]
      : [
        ['all', 'Все вопросы'],
        ['unanswered', 'Без ответа'],
        ['fresh', 'Последний день']
      ];
    if (kind !== 'feedback' && workbenchState.status === 'negative') workbenchState.status = 'all';
    return `
      <div class="section-title" style="margin-top:12px">
        <div>
          <h2>${kind === 'feedback' ? 'Отзывы отдельно' : 'Вопросы отдельно'}</h2>
          <p>${kind === 'feedback' ? 'Очередь для разбора отзывов: негатив, неотвеченные и карточки с новым потоком.' : 'Очередь вопросов по карточкам: где отвечать сейчас и где просто держать под наблюдением.'}</p>
        </div>
        <div class="badge-stack">
          ${chip(`${fmtInt(visible)} из ${fmtInt(total)}`, 'info')}
          ${chip(kind === 'feedback' ? `${fmtInt(modelSafeTotal('unansweredFeedbacks'))} без ответа` : `${fmtInt(modelSafeTotal('unansweredQuestions'))} без ответа`, visible ? 'warn' : 'ok')}
        </div>
      </div>
      <div class="wb-rating-workbench-controls">
        <input id="wbRatingSearchInput" value="${esc(workbenchState.search)}" placeholder="Поиск по артикулу, nmID или тексту">
        <select id="wbRatingSortSelect">
          <option value="risk" ${workbenchState.sort === 'risk' ? 'selected' : ''}>Сначала риск</option>
          <option value="date" ${workbenchState.sort === 'date' ? 'selected' : ''}>Сначала свежие</option>
          <option value="unanswered" ${workbenchState.sort === 'unanswered' ? 'selected' : ''}>Сначала без ответа</option>
          ${kind === 'feedback' ? `<option value="rating" ${workbenchState.sort === 'rating' ? 'selected' : ''}>Сначала низкая оценка</option>` : ''}
          <option value="article" ${workbenchState.sort === 'article' ? 'selected' : ''}>По артикулу</option>
        </select>
        <select id="wbRatingStatusSelect">
          ${statusOptions.map(([value, label]) => `<option value="${esc(value)}" ${workbenchState.status === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select>
        <button id="wbRatingResetSearch" type="button">Сбросить</button>
      </div>
    `;
  }

  function modelSafeTotal(field) {
    const root = document.getElementById('view-wb-rating');
    return num(root?.dataset?.[field] || 0);
  }

  function renderQueueItem(item, kind) {
    const tone = priorityTone(item.priority);
    const link = typeof linkToSku === 'function'
      ? linkToSku(item.key || item.label, item.label)
      : `<strong>${esc(item.label)}</strong>`;
    const kpis = kind === 'feedback'
      ? [
        `оценка ${fmtNum(item.valuation || item.rating, 2)}`,
        `новых 7д ${fmtInt(item.reviews7)}`,
        `негатив ${fmtInt(item.low7 || item.low)}`,
        `без ответа ${fmtInt(item.unanswered)}`
      ]
      : [
        `вопросов ${fmtInt(item.questionCount)}`,
        `без ответа ${fmtInt(item.unanswered)}`,
        item.answered ? 'очередь чистая' : 'ответить'
      ];

    return `
      <div class="wb-rating-queue-row">
        <div class="wb-rating-queue-main">
          <strong>${link}</strong>
          <div class="wb-rating-mini-note">WB nm ${esc(item.nmId || '—')} · ${esc(item.productName || 'карточка WB')}</div>
          <div class="wb-rating-queue-kpis">${kpis.map((text, index) => chip(text, index === kpis.length - 1 && num(item.unanswered) ? 'warn' : '')).join('')}</div>
        </div>
        <div><span class="wb-rating-priority ${esc(tone)}">${esc(priorityText(item.priority))}</span></div>
        <div class="wb-rating-queue-text">${esc(item.text || '')}</div>
        <div class="badge-stack">
          ${chip(item.aggregate ? 'по карточке' : 'отзыв', item.aggregate ? 'info' : 'ok')}
          ${chip(item.date ? shortDate(item.date) : 'без даты')}
        </div>
      </div>
    `;
  }

  function renderWorkbench(model, payload, kind) {
    const items = kind === 'feedback' ? feedbackItems(payload, model) : questionItems(payload, model);
    const visible = filterWorkbenchItems(items, kind);
    const root = document.getElementById('view-wb-rating');
    if (root) {
      root.dataset.unansweredFeedbacks = String(model.totals.unanswered || 0);
      root.dataset.unansweredQuestions = String(model.totals.unansweredQuestions || 0);
    }
    return `
      ${renderWorkbenchControls(kind, items.length, visible.length)}
      <div class="wb-rating-queue">
        ${visible.slice(0, 80).map((item) => renderQueueItem(item, kind)).join('') || '<div class="empty">По текущим фильтрам ничего не найдено.</div>'}
      </div>
      ${visible.length > 80 ? `<div class="wb-rating-source-note">Показаны первые 80 строк из ${fmtInt(visible.length)}. Уточните поиск или фильтр, чтобы сузить очередь.</div>` : ''}
      <div class="wb-rating-source-note">
        ${kind === 'feedback'
          ? 'Сначала красные строки: ответить, снять негатив, потом смотреть поток.'
          : 'Сначала вопросы без ответа, потом карточки с большим количеством вопросов.'}
      </div>
    `;
  }

  function renderModeContent(model, payload) {
    if (workbenchState.mode === 'feedback') return renderWorkbench(model, payload, 'feedback');
    if (workbenchState.mode === 'questions') return renderWorkbench(model, payload, 'questions');
    return renderTable(model);
  }

  function attachWorkbenchEvents(rootId) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.querySelectorAll('[data-wb-rating-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        workbenchState.mode = button.dataset.wbRatingMode || 'summary';
        workbenchState.status = 'all';
        renderWbCardRatingReport(rootId);
      });
    });
    const input = root.querySelector('#wbRatingSearchInput');
    if (input) {
      input.addEventListener('input', (event) => {
        const value = event.target.value;
        workbenchState.search = value;
        renderWbCardRatingReport(rootId);
        window.requestAnimationFrame(() => {
          const nextInput = document.getElementById('wbRatingSearchInput');
          if (nextInput) {
            nextInput.focus();
            try { nextInput.setSelectionRange(value.length, value.length); } catch (error) {}
          }
        });
      });
    }
    const sort = root.querySelector('#wbRatingSortSelect');
    if (sort) {
      sort.addEventListener('change', (event) => {
        workbenchState.sort = event.target.value || 'risk';
        renderWbCardRatingReport(rootId);
      });
    }
    const status = root.querySelector('#wbRatingStatusSelect');
    if (status) {
      status.addEventListener('change', (event) => {
        workbenchState.status = event.target.value || 'all';
        renderWbCardRatingReport(rootId);
      });
    }
    const reset = root.querySelector('#wbRatingResetSearch');
    if (reset) {
      reset.addEventListener('click', () => {
        workbenchState.search = '';
        workbenchState.sort = 'risk';
        workbenchState.status = 'all';
        renderWbCardRatingReport(rootId);
      });
    }
  }

  function renderPlatformCards(model, payload) {
    const currentCardsEmpty = Array.isArray(payload?.cards) && payload.cards.length === 0;
    return `
      <div class="wb-rating-platforms">
        <section class="wb-rating-platform is-wb">
          <div class="wb-rating-platform-head">
            <div>
              <h3>Wildberries · рейтинг карточек</h3>
              <p>${currentCardsEmpty ? 'Последний рабочий срез истории.' : 'Отзывы, вопросы и динамика карточек.'}</p>
            </div>
            <span class="wb-rating-platform-code">ВБ</span>
          </div>
          <div class="wb-rating-kpis">
            <div><span>Срез</span><strong>${esc(fullDate(model.active.date))}</strong></div>
            <div><span>Карточки</span><strong>${fmtInt(model.rows.length)}</strong></div>
            <div><span>Отзывы 7 дней</span><strong>${fmtInt(model.totals.reviews7)}</strong></div>
            <div><span>Сводная оценка</span><strong>${fmtNum(model.totals.avgRating, 2)}</strong></div>
            <div><span>% негатива 7 дней</span><strong>${fmtPct(model.totals.neg7)}</strong></div>
            <div><span>Выручка WB 7 дней</span><strong>${fmtMoney(model.wbWindow7.revenue || model.totals.revenue7)}</strong></div>
          </div>
        </section>
        <section class="wb-rating-platform is-ozon">
          <div class="wb-rating-platform-head">
            <div>
              <h3>Ozon · плашка готова</h3>
              <p>Продажи видим. Отзывы добавим в этот же формат.</p>
            </div>
            <span class="wb-rating-platform-code">ОЗ</span>
          </div>
          <div class="wb-rating-kpis">
            <div><span>Срез продаж</span><strong>${esc(model.ozonWindow7.latestDate ? fullDate(model.ozonWindow7.latestDate) : '—')}</strong></div>
            <div><span>Выручка 7 дней</span><strong>${fmtMoney(model.ozonWindow7.revenue)}</strong></div>
            <div><span>Штук 7 дней</span><strong>${fmtInt(model.ozonWindow7.units)}</strong></div>
            <div><span>Отзывы Ozon</span><strong>ожидаем</strong></div>
            <div><span>Вопросы Ozon</span><strong>ожидаем</strong></div>
            <div><span>Статус</span><strong>готово место</strong></div>
          </div>
        </section>
      </div>
    `;
  }

  function trendBadge(current, reference, options = {}) {
    if (!hasNumber(current) || !hasNumber(reference)) return `<span class="wb-rating-trend flat">без сравнения</span>`;
    const diff = Number(current) - Number(reference);
    const threshold = options.threshold ?? 0.5;
    if (Math.abs(diff) <= threshold) return `<span class="wb-rating-trend flat">без изменений</span>`;
    const improved = options.lowerIsBetter ? diff < 0 : diff > 0;
    const tone = improved ? 'up' : 'down';
    const word = improved ? 'рост' : 'падение';
    const sign = diff > 0 ? '+' : '';
    const value = options.percent ? fmtPct(Math.abs(diff), 1) : `${sign}${fmtInt(diff)}`;
    return `<span class="wb-rating-trend ${tone}">${word} ${value}</span>`;
  }

  function simpleBadge(text, tone = 'flat') {
    return `<span class="wb-rating-trend ${esc(tone)}">${esc(text)}</span>`;
  }

  function ratingTrendBadge(current, reference) {
    if (!hasNumber(current) || !hasNumber(reference)) return simpleBadge('без сравнения', 'flat');
    const diff = Number(current) - Number(reference);
    if (Math.abs(diff) < 0.02) return simpleBadge('без изменений', 'flat');
    return diff > 0
      ? simpleBadge(`рост +${fmtNum(diff, 2)}`, 'up')
      : simpleBadge(`падение ${fmtNum(diff, 2)}`, 'down');
  }

  function renderGameCards(model) {
    const reviewDailyBase = model.totals.reviews3 ? model.totals.reviews3 / 3 : null;
    const questionsDailyBase = model.totals.questions3 ? model.totals.questions3 / 3 : null;
    const unansweredTotal = model.totals.unanswered + model.totals.unansweredQuestions;
    return `
      <div class="wb-rating-game-grid">
        <div class="wb-rating-game-card">
          <span>Отзывы 7 дней</span>
          <strong>${fmtInt(model.totals.reviews7)}</strong>
          ${trendBadge(model.totals.reviews1, reviewDailyBase)}
          <small>вчера ${fmtInt(model.totals.reviews1)}</small>
        </div>
        <div class="wb-rating-game-card">
          <span>Негатив 7 дней</span>
          <strong>${fmtPct(model.totals.neg7)}</strong>
          ${trendBadge(model.totals.neg1, model.totals.neg3, { lowerIsBetter: true, percent: true, threshold: 0.01 })}
          <small>${fmtInt(model.totals.low7)} негативных отзывов</small>
        </div>
        <div class="wb-rating-game-card">
          <span>Вопросы всего</span>
          <strong>${fmtInt(model.totals.questions)}</strong>
          ${trendBadge(model.totals.questions1, questionsDailyBase)}
          <small>+${fmtInt(model.totals.questions7)} за 7 дней</small>
        </div>
        <div class="wb-rating-game-card">
          <span>Без ответа</span>
          <strong>${fmtInt(unansweredTotal)}</strong>
          ${unansweredTotal ? simpleBadge('нужно закрыть', 'down') : simpleBadge('закрыто', 'up')}
          <small>${fmtInt(model.totals.unanswered)} отзывов / ${fmtInt(model.totals.unansweredQuestions)} вопросов</small>
        </div>
        <div class="wb-rating-game-card">
          <span>История</span>
          <strong>${fmtInt(model.snapshots.length)}</strong>
          ${simpleBadge(`${fmtInt(model.rows.length)} карточек`, 'flat')}
          <small>срез ${esc(fullDate(model.active.date))}</small>
        </div>
        <div class="wb-rating-game-card">
          <span>Средняя оценка</span>
          <strong>${fmtNum(model.totals.avgRating, 2)}</strong>
          ${model.totals.avgRating >= 4.75 ? simpleBadge('зеленая зона', 'up') : simpleBadge('наблюдать', 'down')}
          <small>${fmtInt(model.totals.leaders)} карточек 4,8+</small>
        </div>
      </div>
    `;
  }

  function pill(text, tone = '') {
    return `<span class="wb-rating-pill ${esc(tone)}">${esc(text)}</span>`;
  }

  function cellPill(text, tone = '') {
    return `<span class="wb-rating-cell-pill ${esc(tone)}">${esc(text)}</span>`;
  }

  function renderHistoryMissionStrip(model) {
    const drop = [...model.rows].filter((row) => row.ratingDelta1 < 0).sort((a, b) => a.ratingDelta1 - b.ratingDelta1)[0];
    const growth = [...model.rows].filter((row) => row.ratingDelta1 > 0).sort((a, b) => b.ratingDelta1 - a.ratingDelta1)[0];
    const negative = [...model.rows].filter((row) => row.p7.low > 0 || row.p1.low > 0).sort((a, b) => b.p1.low - a.p1.low || b.p7.low - a.p7.low)[0];
    const answer = [...model.rows].filter((row) => row.unanswered > 0).sort((a, b) => b.unanswered - a.unanswered)[0];
    const metrics = [
      {
        title: drop ? `Падение: ${drop.label}` : 'Падение',
        hint: drop ? `${fmtNum(drop.ratingDelta1, 2)} к вчера` : 'нет заметного падения'
      },
      {
        title: growth ? `Рост: ${growth.label}` : 'Рост',
        hint: growth ? `+${fmtNum(growth.ratingDelta1, 2)} к вчера` : 'нет заметного роста'
      },
      {
        title: negative ? `Негатив: ${negative.label}` : 'Негатив',
        hint: negative ? `${fmtInt(negative.p7.low)} за 7 дней` : 'без явного лидера'
      },
      {
        title: answer ? `Ответы: ${answer.label}` : 'Ответы',
        hint: answer ? `${fmtInt(answer.unanswered)} без ответа` : 'хвост закрыт'
      }
    ];
    return `
      <div class="wb-rating-mission-strip">
        ${metrics.map((item) => `
          <div class="wb-rating-mission">
            <strong>${esc(item.title)}</strong>
            <span>${esc(item.hint)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function signalPills(row) {
    const chips = [];
    if (row.unanswered > 0) chips.push(['Ответ ' + fmtInt(row.unanswered), 'risk']);
    if (row.unansweredQuestions > 0) chips.push(['Вопрос ' + fmtInt(row.unansweredQuestions), 'risk']);
    if (row.p1.low > 0) chips.push(['Негатив вчера ' + fmtInt(row.p1.low), 'risk']);
    else if (row.p7.low > 0) chips.push(['Негатив 7д ' + fmtInt(row.p7.low), 'warn']);
    if (row.ratingDelta1 >= 0.03) chips.push(['Рост +' + fmtNum(row.ratingDelta1, 2), 'good']);
    if (row.ratingDelta1 <= -0.03) chips.push(['Просадка ' + fmtNum(row.ratingDelta1, 2), 'risk']);
    if (row.p7.reviews >= 50) chips.push(['Поток ' + fmtInt(row.p7.reviews), 'good']);
    else if (row.p7.reviews >= 10) chips.push(['Поток ' + fmtInt(row.p7.reviews), 'info']);
    if (!chips.length && row.p7.reviews > 0 && (row.p7.negativePct === null || row.p7.negativePct <= 0.03)) chips.push(['Чисто', 'good']);
    return chips.slice(0, 3).map(([text, tone]) => pill(text, tone)).join('');
  }

  function countTone(value) {
    const amount = num(value);
    if (amount >= 30) return 'good';
    if (amount > 0) return 'info';
    return 'muted';
  }

  function ratingTone(value) {
    const amount = num(value);
    if (!amount) return 'muted';
    if (amount >= 4.75) return 'good';
    if (amount >= 4.45) return 'warn';
    return 'risk';
  }

  function negativeTone(value) {
    if (!hasNumber(value)) return 'muted';
    const amount = Number(value);
    if (amount >= 0.12) return 'risk';
    if (amount >= 0.05) return 'warn';
    return 'good';
  }

  function deltaTone(value) {
    if (!hasNumber(value)) return 'muted';
    const amount = Number(value);
    if (amount > 0) return 'good';
    if (amount < 0) return 'risk';
    return 'muted';
  }

  function renderGameCell(row) {
    const metric = row.ratingDelta1 <= -0.03
      ? `<span class="wb-rating-trend down">падение ${fmtNum(row.ratingDelta1, 2)}</span>`
      : row.ratingDelta1 >= 0.03
        ? `<span class="wb-rating-trend up">рост +${fmtNum(row.ratingDelta1, 2)}</span>`
        : `<span class="wb-rating-trend flat">без изменений</span>`;
    return `
      <span class="wb-rating-game-badge ${esc(row.tone)}">${esc(gameLabel(row))}</span>
      ${metric}
    `;
  }

  function signed(value, formatter = fmtInt) {
    if (!hasNumber(value)) return '—';
    const sign = Number(value) > 0 ? '+' : '';
    return `${sign}${formatter(value)}`;
  }

  function renderMoneyCell(value, source) {
    const text = fmtMoney(value);
    return esc(text);
  }

  function renderTable(model) {
    const rowsHtml = model.rows.map((row, visibleIndex) => {
      const rowLink = typeof linkToSku === 'function'
        ? linkToSku(row.key || row.label, row.label)
        : `<strong>${esc(row.label)}</strong>`;
      return `
        <tr>
          <td class="sticky-col center">${fmtInt(visibleIndex + 1)}</td>
          <td class="sticky-col-2">
            <div class="wb-rating-row-title">
              <strong>${rowLink}</strong>
              <span class="wb-rating-mini-note">WB nm ${esc(row.card?.nmId || '—')} · всего ${fmtInt(row.feedbackCount)} отзывов</span>
              <div class="wb-rating-chipline">${signalPills(row)}</div>
            </div>
          </td>
          <td class="center">${renderGameCell(row)}</td>
          <td class="num">${cellPill(fmtInt(row.p7.reviews), countTone(row.p7.reviews))}</td>
          <td class="num">${cellPill(fmtInt(row.p3.reviews), countTone(row.p3.reviews))}</td>
          <td class="num">${cellPill(fmtInt(row.p1.reviews), countTone(row.p1.reviews))}</td>
          <td class="num">${cellPill(fmtNum(row.p7.rating, 2), ratingTone(row.p7.rating))}</td>
          <td class="num">${cellPill(fmtNum(row.p3.rating, 2), ratingTone(row.p3.rating))}</td>
          <td class="num">${cellPill(fmtNum(row.p1.rating, 2), ratingTone(row.p1.rating))}</td>
          <td class="num">${renderMoneyCell(row.revenue.revenue7, row.revenue.source)}</td>
          <td class="num">${renderMoneyCell(row.revenue.revenue3, row.revenue.source)}</td>
          <td class="num">${renderMoneyCell(row.revenue.revenue1, row.revenue.source)}</td>
          <td class="num">${cellPill(fmtPct(row.p7.negativePct), negativeTone(row.p7.negativePct))}</td>
          <td class="num">${cellPill(fmtPct(row.p3.negativePct), negativeTone(row.p3.negativePct))}</td>
          <td class="num">${cellPill(fmtPct(row.p1.negativePct), negativeTone(row.p1.negativePct))}</td>
          <td class="num">${cellPill(signed(row.historyDelta), deltaTone(row.historyDelta))}</td>
          <td class="num">${cellPill(fmtNum(row.rating, 2), ratingTone(row.rating))}</td>
          <td class="wb-rating-comment">
            <div>${esc(row.comment)}</div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="section-title" style="margin-top:16px">
        <div>
          <h2>История и метрики</h2>
          <p>Плашки показывают рост, падение, негатив, ответы и поток отзывов.</p>
        </div>
        <div class="badge-stack">
          ${chip(`7 дней от ${shortDate(model.baseline7?.date)}`, 'info')}
          ${chip(`3 дня от ${shortDate(model.baseline3?.date)}`, 'info')}
          ${chip(`вчера от ${shortDate(model.baseline1?.date)}`, 'info')}
        </div>
      </div>
      <div class="wb-rating-report-table-wrap">
        <table class="wb-rating-report-table">
          <thead>
            <tr>
              <th class="sticky-col" rowspan="2" style="width:54px">№</th>
              <th class="sticky-col-2" rowspan="2" style="width:250px">Артикул продавца</th>
              <th rowspan="2" style="width:136px">Статус</th>
              <th class="group-feedback" colspan="3">Всего отзывов</th>
              <th class="group-rating" colspan="3">Сводная оценка</th>
              <th class="group-revenue" colspan="3">Выручка</th>
              <th class="group-negative" colspan="3">% негатива</th>
              <th class="group-history" colspan="3">История</th>
            </tr>
            <tr>
              <th>7 дней</th>
              <th>3 дня</th>
              <th>Вчера</th>
              <th>7 дней</th>
              <th>3 дня</th>
              <th>Вчера</th>
              <th>7 дней</th>
              <th>3 дня</th>
              <th>Вчера</th>
              <th>7 дней</th>
              <th>3 дня</th>
              <th>Вчера</th>
              <th>Δ к ${esc(shortDate(model.historyNear?.date))}</th>
              <th>${esc(shortDate(model.active.date))}</th>
              <th>Комментарии</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || '<tr><td colspan="18" class="center">Нет карточек в истории WB.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="wb-rating-source-note">Сначала смотрим красные плашки в строках. Остальное — фон для решения.</div>
    `;
  }

  function avgSnapshotRating(snapshot) {
    const cards = Array.isArray(snapshot?.cards) ? snapshot.cards : [];
    const values = cards.map((card) => num(card.avgRating || card.ratingTrendLatestRating)).filter(Boolean);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function renderMetricCard(label, value, trendHtml = '', note = '', options = {}) {
    return `
      <div class="rating-metric-card ${options.empty ? 'is-empty' : ''}">
        <span class="label">${esc(label)}</span>
        <strong>${esc(value)}</strong>
        ${trendHtml || ''}
        ${note ? `<small>${esc(note)}</small>` : ''}
      </div>
    `;
  }

  function renderPlatformPanel(kind, model) {
    const isOzon = kind === 'ozon';
    const latestRating = model.totals.avgRating;
    const prevRating = avgSnapshotRating(model.baseline1);
    const reviewDailyBase = model.totals.reviews3 ? model.totals.reviews3 / 3 : null;
    const questionDailyBase = model.totals.questions3 ? model.totals.questions3 / 3 : null;
    const ozon7 = model.ozonWindow7 || { revenue: 0, units: 0, latestDate: '' };
    const panelClass = isOzon ? 'is-ozon' : 'is-wb';

    const metrics = isOzon ? [
      renderMetricCard('Рейтинг Ozon', 'нет данных', simpleBadge('нужен источник', 'flat'), 'рейтинг карточек пока не приходит', { empty: true }),
      renderMetricCard('Отзывы Ozon', 'нет данных', simpleBadge('нужен источник', 'flat'), 'количество и история отзывов не заведены', { empty: true }),
      renderMetricCard('Вопросы Ozon', 'нет данных', simpleBadge('нужен источник', 'flat'), 'вопросы по карточкам не заведены', { empty: true }),
      renderMetricCard('Выручка Ozon 7 дней', fmtMoney(ozon7.revenue), simpleBadge('продажи есть', 'up'), `${fmtInt(ozon7.units)} шт. за 7 дней`),
      renderMetricCard('История рейтинга', 'нет срезов', simpleBadge('подключить', 'flat'), 'после источника будет как WB', { empty: true }),
      renderMetricCard('Статус блока', 'место готово', simpleBadge('видно отдельно', 'up'), 'Ozon больше не спрятан')
    ].join('') : [
      renderMetricCard('Средняя оценка WB', fmtNum(latestRating, 2), ratingTrendBadge(latestRating, prevRating), `${fmtInt(model.totals.leaders)} карточек 4,8+`),
      renderMetricCard('Отзывы 7 дней', fmtInt(model.totals.reviews7), trendBadge(model.totals.reviews1, reviewDailyBase), `вчера ${fmtInt(model.totals.reviews1)}`),
      renderMetricCard('Негатив 7 дней', fmtPct(model.totals.neg7), trendBadge(model.totals.neg1, model.totals.neg3, { lowerIsBetter: true, percent: true, threshold: 0.01 }), `${fmtInt(model.totals.low7)} негативных отзывов`),
      renderMetricCard('Вопросы всего', fmtInt(model.totals.questions), trendBadge(model.totals.questions1, questionDailyBase), `+${fmtInt(model.totals.questions7)} за 7 дней`),
      renderMetricCard('Без ответа', fmtInt(model.totals.unanswered + model.totals.unansweredQuestions), (model.totals.unanswered + model.totals.unansweredQuestions) ? simpleBadge('нужно закрыть', 'down') : simpleBadge('закрыто', 'up'), `${fmtInt(model.totals.unanswered)} отзывов / ${fmtInt(model.totals.unansweredQuestions)} вопросов`),
      renderMetricCard('История', fmtInt(model.snapshots.length), simpleBadge(`${fmtInt(model.rows.length)} карточек`, 'flat'), `срез ${fullDate(model.active.date)}`)
    ].join('');

    return `
      <section class="rating-platform-panel ${panelClass}">
        <div class="rating-platform-head">
          <div class="rating-platform-title">
            <span class="rating-platform-logo">${isOzon ? 'ОЗ' : 'ВБ'}</span>
            <div>
              <h3>${isOzon ? 'Ozon' : 'Wildberries'}</h3>
              <p>${isOzon ? 'Показываем отдельный блок Ozon. Рейтинги, отзывы и вопросы появятся здесь после подключения источника.' : 'Рейтинги, отзывы, вопросы и история по WB.'}</p>
            </div>
          </div>
          <button class="rating-platform-action ${structuredState.platform === kind ? 'active' : ''}" type="button" data-rating-platform="${kind}">
            ${structuredState.platform === kind ? 'Открыто' : 'Открыть'}
          </button>
        </div>
        <div class="rating-metric-grid">${metrics}</div>
      </section>
    `;
  }

  function renderStructuredPlatforms(model) {
    return `<div class="rating-platform-grid">${renderPlatformPanel('wb', model)}${renderPlatformPanel('ozon', model)}</div>`;
  }

  function renderStructuredTabs() {
    const tabs = structuredState.platform === 'ozon'
      ? [['overview', 'Ozon: что есть'], ['needed', 'Что подключить']]
      : [['history', 'История'], ['reviews', 'Отзывы'], ['questions', 'Вопросы'], ['stats', 'Статистика']];
    if (!tabs.some(([value]) => value === structuredState.view)) structuredState.view = tabs[0][0];
    return `
      <div class="rating-work-tabs">
        ${tabs.map(([value, label]) => `<button type="button" class="${structuredState.view === value ? 'active' : ''}" data-rating-view="${value}">${esc(label)}</button>`).join('')}
      </div>
    `;
  }

  function renderMiniMetric(label, value, trend = '', note = '') {
    return `
      <div class="rating-mini-metric">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
        ${trend || ''}
        ${note ? `<span>${esc(note)}</span>` : ''}
      </div>
    `;
  }

  function renderHistoryCards(model) {
    const rows = model.rows.slice(0, 48).map((row) => {
      const link = typeof linkToSku === 'function' ? linkToSku(row.key || row.label, row.label) : `<strong>${esc(row.label)}</strong>`;
      const unanswered = row.unanswered + row.unansweredQuestions;
      return `
        <article class="rating-history-card">
          <div class="rating-history-main">
            <strong>${link}</strong>
            <div class="meta">WB nm ${esc(row.card?.nmId || '—')} · история Δ отзывов ${signed(row.historyDelta)}</div>
            <div class="wb-rating-chipline">${signalPills(row)}</div>
          </div>
          <div class="rating-history-metrics">
            ${renderMiniMetric('Статус', gameLabel(row), row.ratingDelta1 ? renderGameCell(row) : simpleBadge('без изменений', 'flat'))}
            ${renderMiniMetric('Отзывы 7д', fmtInt(row.p7.reviews), trendBadge(row.p1.reviews, row.p3.reviews ? row.p3.reviews / 3 : null))}
            ${renderMiniMetric('Оценка', fmtNum(row.rating, 2), ratingTrendBadge(row.rating, row.historyRating))}
            ${renderMiniMetric('Негатив 7д', fmtPct(row.p7.negativePct), negativeTone(row.p7.negativePct) === 'risk' ? simpleBadge('внимание', 'down') : simpleBadge('норма', 'up'))}
            ${renderMiniMetric('Вопросы', fmtInt(row.questionCount), row.q7.questions ? simpleBadge(`+${fmtInt(row.q7.questions)} за 7д`, 'flat') : simpleBadge('без роста', 'flat'))}
            ${renderMiniMetric('Без ответа', fmtInt(unanswered), unanswered ? simpleBadge('закрыть', 'down') : simpleBadge('закрыто', 'up'))}
            ${renderMiniMetric('Выручка 7д', fmtMoney(row.revenue.revenue7))}
            ${renderMiniMetric('История', signed(row.historyDelta), deltaTone(row.historyDelta) === 'good' ? simpleBadge('рост отзывов', 'up') : simpleBadge('без прироста', 'flat'))}
            ${renderMiniMetric('Вчера', `${fmtInt(row.p1.reviews)} отзывов`, row.p1.low ? simpleBadge(`${fmtInt(row.p1.low)} негатив`, 'down') : simpleBadge('без негатива', 'up'))}
            ${renderMiniMetric('Комментарий', row.comment)}
          </div>
        </article>
      `;
    }).join('');
    return `
      <div class="rating-detail-head">
        <div>
          <h3>WB · история карточек</h3>
          <p>Карточки крупно: статус, отзывы, рейтинг, негатив, вопросы, без ответа и история.</p>
        </div>
        <div class="badge-stack">${chip(`${fmtInt(model.rows.length)} карточек`, 'info')}${chip(`${fmtInt(model.snapshots.length)} срезов`, 'info')}</div>
      </div>
      <div class="rating-history-list">${rows}</div>
    `;
  }

  function renderStructuredQueue(model, payload, kind) {
    const items = (kind === 'reviews' ? feedbackItems(payload, model) : questionItems(payload, model)).slice(0, 60);
    const title = kind === 'reviews' ? 'WB · отзывы' : 'WB · вопросы';
    const rows = items.map((item) => `
      <article class="rating-history-card">
        <div class="rating-history-main">
          <strong>${typeof linkToSku === 'function' ? linkToSku(item.key || item.label, item.label) : esc(item.label)}</strong>
          <div class="meta">WB nm ${esc(item.nmId || '—')} · ${esc(item.date ? shortDate(item.date) : 'без даты')}</div>
        </div>
        <div class="rating-history-metrics">
          ${renderMiniMetric('Статус', item.unanswered ? 'Нужен ответ' : 'Закрыто', item.unanswered ? simpleBadge('закрыть', 'down') : simpleBadge('ок', 'up'))}
          ${kind === 'reviews' ? renderMiniMetric('Оценка', fmtNum(item.valuation || item.rating, 2)) : renderMiniMetric('Вопросов', fmtInt(item.questionCount))}
          ${kind === 'reviews' ? renderMiniMetric('Негатив', fmtInt(item.low || item.low7), (item.low || item.low7) ? simpleBadge('внимание', 'down') : simpleBadge('норма', 'up')) : renderMiniMetric('Без ответа', fmtInt(item.unanswered))}
          ${renderMiniMetric('Текст / суть', item.text || '—')}
        </div>
      </article>
    `).join('');
    return `
      <div class="rating-detail-head">
        <div>
          <h3>${title}</h3>
          <p>${kind === 'reviews' ? 'Отдельно видно отзывы, негатив и что нужно закрыть.' : 'Отдельно видно вопросы и хвост без ответа.'}</p>
        </div>
        <div class="badge-stack">${chip(`${fmtInt(items.length)} строк`, 'info')}</div>
      </div>
      <div class="rating-history-list">${rows || '<div class="empty">Нет строк по текущему срезу.</div>'}</div>
    `;
  }

  function renderStructuredStats(model) {
    return `
      <div class="rating-detail-head">
        <div>
          <h3>WB · статистика</h3>
          <p>Сводка по тем же окнам, что в отчете: 7 дней, 3 дня, вчера.</p>
        </div>
      </div>
      <div class="rating-metric-grid">
        ${renderMetricCard('Отзывы 7 / 3 / вчера', `${fmtInt(model.totals.reviews7)} / ${fmtInt(model.totals.reviews3)} / ${fmtInt(model.totals.reviews1)}`)}
        ${renderMetricCard('Негатив 7 / 3 / вчера', `${fmtPct(model.totals.neg7)} / ${fmtPct(model.totals.neg3)} / ${fmtPct(model.totals.neg1)}`)}
        ${renderMetricCard('Вопросы 7 / 3 / вчера', `${fmtInt(model.totals.questions7)} / ${fmtInt(model.totals.questions3)} / ${fmtInt(model.totals.questions1)}`)}
        ${renderMetricCard('Без ответа', `${fmtInt(model.totals.unanswered)} отзывов / ${fmtInt(model.totals.unansweredQuestions)} вопросов`)}
        ${renderMetricCard('История', `${fmtInt(model.snapshots.length)} срезов`, '', `${fmtInt(model.rows.length)} карточек`)}
        ${renderMetricCard('Средняя оценка', fmtNum(model.totals.avgRating, 2), ratingTrendBadge(model.totals.avgRating, avgSnapshotRating(model.baseline1)))}
      </div>
    `;
  }

  function renderOzonDetails(model) {
    const ozon7 = model.ozonWindow7 || { revenue: 0, units: 0, latestDate: '' };
    return `
      <div class="rating-detail-head">
        <div>
          <h3>Ozon · отдельный блок</h3>
          <p>Ozon теперь не спрятан. Продажи есть, рейтинги/отзывы/вопросы надо подключить отдельным источником.</p>
        </div>
        <div class="badge-stack">${chip(`срез продаж ${ozon7.latestDate ? fullDate(ozon7.latestDate) : '—'}`, 'info')}</div>
      </div>
      <div class="rating-empty-ozon">
        <div class="box">
          <h4>Что видно сейчас</h4>
          <div class="rating-metric-grid">
            ${renderMetricCard('Выручка Ozon 7 дней', fmtMoney(ozon7.revenue), simpleBadge('продажи есть', 'up'))}
            ${renderMetricCard('Штук Ozon 7 дней', fmtInt(ozon7.units), simpleBadge('продажи есть', 'up'))}
            ${renderMetricCard('Рейтинги / отзывы / вопросы', 'нет данных', simpleBadge('нужен источник', 'flat'), '', { empty: true })}
          </div>
        </div>
        <div class="box">
          <h4>Что нужно, чтобы было как WB</h4>
          <div class="need-list">
            ${pill('Рейтинг карточки', 'info')}
            ${pill('Количество отзывов', 'info')}
            ${pill('Негатив / оценка отзыва', 'info')}
            ${pill('Вопросы и ответы', 'info')}
            ${pill('История по дням', 'info')}
          </div>
          <p style="margin-top:12px">Как только появится файл/API с этими полями, Ozon будет отрисован теми же крупными плашками.</p>
        </div>
      </div>
    `;
  }

  function renderStructuredDetail(model, payload) {
    if (structuredState.platform === 'ozon') return structuredState.view === 'needed' ? renderOzonDetails(model) : renderOzonDetails(model);
    if (structuredState.view === 'reviews') return renderStructuredQueue(model, payload, 'reviews');
    if (structuredState.view === 'questions') return renderStructuredQueue(model, payload, 'questions');
    if (structuredState.view === 'stats') return renderStructuredStats(model);
    return renderHistoryCards(model);
  }

  function attachStructuredEvents(rootId) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.querySelectorAll('[data-rating-platform]').forEach((button) => {
      button.addEventListener('click', () => {
        structuredState.platform = button.dataset.ratingPlatform === 'ozon' ? 'ozon' : 'wb';
        structuredState.view = structuredState.platform === 'ozon' ? 'overview' : 'history';
        renderWbCardRatingStructured(rootId);
      });
    });
    root.querySelectorAll('[data-rating-view]').forEach((button) => {
      button.addEventListener('click', () => {
        structuredState.view = button.dataset.ratingView || 'history';
        renderWbCardRatingStructured(rootId);
      });
    });
  }

  function renderWbCardRatingStructured(rootId = 'view-wb-rating') {
    const root = document.getElementById(rootId);
    if (!root) return;
    ensureStyles();
    ensureStructuredStyles();
    ensureAuxData();
    root.classList.add('wb-rating-report');

    const st = appState();
    const payload = st.wbFeedbacks && typeof st.wbFeedbacks === 'object'
      ? st.wbFeedbacks
      : { generatedAt: '', window: {}, summary: {}, cards: [], daily: [], history: [] };
    const model = buildModel(payload);
    if (!model) {
      renderEmpty(root, payload);
      return;
    }

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Рейтинг карточек WB/Ozon</h2>
          <p>Крупные блоки по площадкам: рейтинги, отзывы, вопросы, история и рост/падение.</p>
        </div>
        <div class="badge-stack">
          ${chip(`WB ${fullDate(model.active.date)}`, 'ok')}
          ${chip(`Ozon отдельно`, 'info')}
          ${chip(`${fmtInt(model.snapshots.length)} срезов истории`, 'info')}
        </div>
      </div>
      <div class="rating-structured-shell">
        ${renderStructuredPlatforms(model)}
        ${renderStructuredTabs()}
        <section class="rating-detail-panel">${renderStructuredDetail(model, payload)}</section>
      </div>
    `;
    attachStructuredEvents(rootId);
  }

  function renderEmpty(root, payload) {
    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Рейтинг карточек WB/OZ</h2>
          <p>Не нашла непустой снимок WB-истории. Как только появятся карточки, отчет соберется автоматически.</p>
        </div>
        <div class="badge-stack">
          ${chip(payload?.generatedAt ? `API ${fullDate(payload.generatedAt)}` : 'API', 'warn')}
          ${chip('нет карточек', 'danger')}
        </div>
      </div>
      <div class="empty">История WB сейчас пустая или еще не загружена.</div>
    `;
  }

  function renderWbCardRatingReport(rootId = 'view-wb-rating') {
    const root = document.getElementById(rootId);
    if (!root) return;
    ensureStyles();
    ensureAuxData();
    root.classList.add('wb-rating-report');

    const st = appState();
    const payload = st.wbFeedbacks && typeof st.wbFeedbacks === 'object'
      ? st.wbFeedbacks
      : { generatedAt: '', window: {}, summary: {}, cards: [], daily: [], history: [] };
    const model = buildModel(payload);
    if (!model) {
      renderEmpty(root, payload);
      return;
    }

    const currentCardsEmpty = Array.isArray(payload.cards) && payload.cards.length === 0;
    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Рейтинг карточек WB/OZ</h2>
          <p>Отзывы, вопросы, история и рост/падение по карточкам в крупных плашках.</p>
        </div>
        <div class="badge-stack">
          ${chip(`WB ${fullDate(model.active.date)}`, currentCardsEmpty ? 'warn' : 'ok')}
          ${chip(`${fmtInt(model.rows.length)} карточек`, 'info')}
          ${chip(`${fmtInt(model.snapshots.length)} срезов истории`, 'info')}
        </div>
      </div>
      ${renderPlatformCards(model, payload)}
      ${renderGameCards(model)}
      ${renderHistoryMissionStrip(model)}
      ${renderModeNav(model, payload)}
      ${renderModeContent(model, payload)}
    `;
    attachWorkbenchEvents(rootId);
  }

  window.renderWbCardRating = renderWbCardRatingStructured;
  try {
    renderWbCardRating = renderWbCardRatingStructured;
  } catch (error) {
    window.renderWbCardRating = renderWbCardRatingStructured;
  }
})();
