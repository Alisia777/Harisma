(function () {
  if (window.__ALTEA_WB_RATING_REPORT_HOTFIX__) return;
  window.__ALTEA_WB_RATING_REPORT_HOTFIX__ = true;

  const VERSION = '20260602ratingreport17';
  const STYLE_ID = 'altea-wb-rating-report-hotfix-style';
  const auxCache = {
    trends: null,
    leaderboardHistory: null,
    ozonFeedbacks: null,
    pending: null
  };
  const workbenchState = {
    mode: 'summary',
    search: '',
    sort: 'revenue',
    status: 'all'
  };
  const structuredState = {
    platform: 'wb',
    view: 'history',
    statsPeriod: 'all',
    statsMetric: 'all'
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
      .rating-structured-shell { display:grid; grid-template-columns:minmax(0,1fr); gap:16px; max-width:100%; overflow:hidden; }
      .rating-planfact-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .rating-platform-selector { display:flex; gap:8px; flex-wrap:wrap; }
      .rating-platform-selector button { border:1px solid rgba(255,255,255,.12); border-radius:999px; background:rgba(255,255,255,.04); color:var(--text); padding:10px 14px; font:inherit; font-size:13px; font-weight:800; cursor:pointer; }
      .rating-platform-selector button.active { border-color:rgba(215,166,76,.72); background:rgba(215,166,76,.18); color:#ffe6ae; }
      .rating-planfact-board.sku-plan-platform-board { grid-template-columns:repeat(4,minmax(0,1fr)); width:100%; min-width:0; margin:0; }
      .rating-planfact-board .sku-plan-platform-card { min-width:0; }
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
      .rating-metric-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
      .rating-metric-grid .sku-plan-platform-card { width:100%; min-height:138px; }
      .rating-planfact-card.is-empty { opacity:.76; }
      .rating-planfact-card .sku-plan-platform-card__value { white-space:normal; overflow-wrap:anywhere; }
      .rating-planfact-card .sku-plan-platform-card__meta { min-height:32px; }
      .rating-planfact-card .sku-plan-platform-card__foot .wb-rating-trend { margin-top:0; }
      .rating-work-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:2px 0 0; }
      .rating-work-tabs button { border:1px solid rgba(255,255,255,.1); border-radius:999px; background:rgba(255,255,255,.04); color:var(--text); padding:10px 14px; font:inherit; font-size:13px; cursor:pointer; }
      .rating-work-tabs button.active { border-color:rgba(215,166,76,.7); background:rgba(215,166,76,.18); color:#ffe6ae; }
      .rating-detail-panel { border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.018); padding:16px; }
      .rating-detail-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; }
      .rating-detail-head h3 { margin:0; font-size:20px; line-height:1.15; }
      .rating-detail-head p { margin:5px 0 0; color:var(--muted); line-height:1.35; }
      .rating-work-card { padding:0; overflow:hidden; }
      .rating-work-card .rating-detail-head { margin:0; padding:14px 16px; border-bottom:1px solid var(--line); }
      .rating-work-actions { display:flex; align-items:flex-start; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .rating-sort-control { display:flex; align-items:center; justify-content:flex-end; gap:6px; flex-wrap:wrap; max-width:100%; }
      .rating-sort-control span { color:var(--muted); font-size:12px; font-weight:800; line-height:1; margin-right:2px; }
      .rating-sort-control button { border:1px solid rgba(255,255,255,.1); border-radius:999px; background:rgba(255,255,255,.035); color:var(--text); padding:8px 10px; font:inherit; font-size:12px; font-weight:800; line-height:1; cursor:pointer; white-space:nowrap; }
      .rating-sort-control button.active { border-color:rgba(215,166,76,.72); background:rgba(215,166,76,.18); color:#ffe6ae; }
      .rating-sort-control button:hover { border-color:rgba(215,166,76,.46); background:rgba(215,166,76,.1); }
      .rating-queue-controls { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,.07); background:rgba(255,255,255,.018); }
      .rating-queue-controls .rating-sort-control { justify-content:flex-start; }
      .rating-work-table { max-height:640px; overflow:auto; }
      .rating-work-table table { width:100%; min-width:2060px; border-collapse:separate; border-spacing:0; table-layout:fixed; }
      .rating-work-table thead th { position:sticky; top:0; z-index:4; padding:10px 12px; border-bottom:1px solid var(--line); background:rgba(12,8,7,.96); color:#f8e9c7; font-size:11px; text-align:left; text-transform:uppercase; letter-spacing:0; }
      .rating-work-table td { padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.06); vertical-align:top; overflow:hidden; background:linear-gradient(90deg,hsl(var(--pf-hue,205) 74% 34% / var(--pf-row-fill,.025)),rgba(255,255,255,.012)); }
      .rating-work-table tr:hover td { background:hsl(var(--pf-hue,205) 72% 42% / .08); }
      .rating-work-table .article-cell { min-width:0; }
      .rating-work-table .article-cell .link-btn { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .rating-work-table .cell-main { display:block; font-size:15px; line-height:1.15; font-weight:900; color:#fff7e6; }
      .rating-work-table .cell-muted { display:block; margin-top:4px; color:var(--muted); font-size:11px; line-height:1.25; }
      .rating-work-table .cell-text { display:block; color:#efe5d6; font-size:12px; line-height:1.35; max-height:48px; overflow:hidden; }
      .rating-work-table .wb-rating-trend { margin-top:5px; max-width:100%; white-space:normal; line-height:1.15; padding:5px 7px; }
      .rating-th-sort { display:inline-flex; align-items:center; gap:4px; border:0; background:transparent; color:inherit; padding:0; font:inherit; font-size:inherit; font-weight:inherit; text-transform:inherit; letter-spacing:inherit; cursor:pointer; text-align:left; }
      .rating-th-sort.active { color:#ffe6ae; text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:3px; }
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
        .rating-planfact-board.sku-plan-platform-board { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .rating-metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .rating-history-card { grid-template-columns:1fr; }
        .rating-history-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
      }
      @media (max-width: 640px) {
        .rating-planfact-board.sku-plan-platform-board { grid-template-columns:1fr; }
        .rating-metric-grid, .rating-history-metrics { grid-template-columns:1fr; }
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

    if (st.ozonFeedbacks && typeof st.ozonFeedbacks === 'object' && Array.isArray(st.ozonFeedbacks.cards)) {
      auxCache.ozonFeedbacks = st.ozonFeedbacks;
    } else if (!auxCache.ozonFeedbacks) {
      tasks.push(fetchJson('data/ozon_feedbacks_summary.json').then((payload) => {
        auxCache.ozonFeedbacks = payload && typeof payload === 'object' ? payload : { cards: [], summary: {} };
        st.ozonFeedbacks = auxCache.ozonFeedbacks;
      }));
    }

    if (!tasks.length || auxCache.pending) return;
    auxCache.pending = Promise.allSettled(tasks).finally(() => {
      auxCache.pending = null;
      const activeView = appState().activeView || '';
      if (activeView === 'wb-rating') {
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
        else renderWbCardRatingStructured('view-wb-rating');
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

  function planFactHue(platform = '') {
    return { wb: 275, ozon: 212, all: 205 }[platform] ?? 205;
  }

  function planFactLevel(ratio = null) {
    if (!hasNumber(ratio)) return 'warn';
    const value = Number(ratio);
    if (value >= 0.95) return 'ok';
    if (value >= 0.7) return 'warn';
    return 'danger';
  }

  function planFactStyle(platform = 'all', ratio = null) {
    const value = hasNumber(ratio) ? Math.min(1.35, Math.max(0.05, Number(ratio))) : 0.12;
    const fill = 0.08 + Math.min(0.34, value * 0.24);
    const rowFill = Math.min(0.12, fill * 0.32);
    const border = 0.18 + Math.min(0.5, value * 0.3);
    const glow = 0.04 + Math.min(0.18, value * 0.12);
    const progress = Math.min(100, Math.max(0, value * 100));
    return `--pf-hue:${planFactHue(platform)};--pf-fill:${fill.toFixed(3)};--pf-row-fill:${rowFill.toFixed(3)};--pf-border:${border.toFixed(3)};--pf-glow:${glow.toFixed(3)};--pf-progress:${progress.toFixed(1)}%;--pf-level:${planFactLevel(value)}`;
  }

  function metricRatio(label = '', value = '', options = {}) {
    if (hasNumber(options.ratio)) return Number(options.ratio);
    const raw = String(value || '').replace(/\s/g, '').replace(',', '.');
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    if (!match) return options.empty ? 0.08 : 0.55;
    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed)) return options.empty ? 0.08 : 0.55;
    if (String(value).includes('%')) return parsed / 100;
    if (/оценк|rating/i.test(String(label))) return parsed / 5;
    return Math.min(1.25, Math.max(0.08, Math.log10(Math.abs(parsed) + 1) / 4));
  }

  function renderMetricCard(label, value, trendHtml = '', note = '', options = {}) {
    const metricText = `${label || ''} ${note || ''}`.toLowerCase();
    const platform = options.platform || (
      /ozon/i.test(metricText)
      || metricText.includes('\u0438\u0441\u0442\u043e\u0440\u0438\u044f \u0440\u0435\u0439\u0442\u0438\u043d\u0433\u0430')
      || metricText.includes('\u0441\u0442\u0430\u0442\u0443\u0441 \u0431\u043b\u043e\u043a\u0430')
      || metricText.includes('\u0440\u0435\u0439\u0442\u0438\u043d\u0433\u0438 / \u043e\u0442\u0437\u044b\u0432\u044b / \u0432\u043e\u043f\u0440\u043e\u0441\u044b')
      ? 'ozon'
      : 'wb'
    );
    const ratio = metricRatio(label, value, options);
    const level = options.empty ? 'danger' : planFactLevel(ratio);
    const side = options.side || (platform === 'ozon' ? 'Ozon' : 'WB');
    return `
      <button class="sku-plan-platform-card rating-planfact-card level-${level} ${options.empty ? 'is-empty' : ''}" type="button" data-rating-platform="${esc(platform)}" style="${planFactStyle(platform, ratio)}">
        <span class="sku-plan-platform-card__top">
          <strong>${esc(label)}</strong>
          <em>${esc(side)}</em>
        </span>
        <span class="sku-plan-platform-card__value">${esc(value)}</span>
        <span class="sku-plan-platform-card__meta">${esc(note || '')}</span>
        <span class="sku-plan-platform-card__bar"><i></i></span>
        <span class="sku-plan-platform-card__foot">
          <b>${trendHtml || '&nbsp;'}</b>
          <span><em>${esc(options.footer || '')}</em></span>
        </span>
      </button>
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
    const tabs = [['history', 'История'], ['reviews', 'Отзывы'], ['questions', 'Вопросы'], ['stats', 'Статистика']];
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

  function ozonPayload() {
    const st = appState();
    return st.ozonFeedbacks && typeof st.ozonFeedbacks === 'object'
      ? st.ozonFeedbacks
      : (auxCache.ozonFeedbacks || { generatedAt: '', summary: {}, cards: [], history: [], reviewAccess: {} });
  }

  function ozonSnapshotMap(snapshot) {
    const map = new Map();
    (Array.isArray(snapshot?.cards) ? snapshot.cards : []).forEach((card) => {
      [card.offerId, card.articleKey, card.sku, card.productId].map(normalizeKey).filter(Boolean).forEach((key) => {
        if (!map.has(key)) map.set(key, card);
      });
    });
    return map;
  }

  function ozonCardKey(card) {
    return normalizeKey(card?.offerId || card?.articleKey || card?.sku || card?.productId);
  }

  function ozonTone(row) {
    if (row.reviewApiLocked) return 'risk';
    if (!hasNumber(row.contentRating)) return 'warn';
    if (Number(row.contentRating) < 70) return 'risk';
    if (Number(row.contentRating) < 90 || !row.hasStock) return 'warn';
    return 'good';
  }

  function ozonStatus(row) {
    if (row.reviewApiLocked) return 'Отзывы API закрыты';
    if (!hasNumber(row.contentRating)) return 'Нет рейтинга';
    if (Number(row.contentRating) < 70) return 'Низкий рейтинг';
    if (Number(row.contentRating) < 90) return 'Доработать';
    if (!row.hasStock) return 'Нет остатка';
    return 'Норма';
  }

  function buildOzonModel(wbModel = null) {
    const payload = ozonPayload();
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    const history = Array.isArray(payload.history) ? payload.history : [];
    const latest = history.length ? history[history.length - 1] : { date: payload.window?.to || '', cards };
    const previous = history.length > 1 ? history[history.length - 2] : null;
    const previousMap = ozonSnapshotMap(previous);
    const reviewApiLocked = (payload.summary?.reviewApiStatus || payload.reviewAccess?.status || '') === 'permission_denied';
    const rows = cards.map((card, index) => {
      const key = ozonCardKey(card);
      const prev = previousMap.get(key);
      const contentRating = hasNumber(card.contentRating) ? Number(card.contentRating) : null;
      const contentDelta = hasNumber(contentRating) && hasNumber(prev?.contentRating) ? Number(contentRating) - Number(prev.contentRating) : null;
      const groups = card.contentRatingGroups || {};
      const row = {
        index: index + 1,
        key,
        platform: 'ozon',
        label: card.offerId || card.label || card.title || String(card.sku || card.productId || ''),
        title: card.title || '',
        offerId: card.offerId || '',
        sku: card.sku || '',
        productId: card.productId || '',
        contentRating,
        contentDelta,
        mediaRating: groups.media?.rating ?? null,
        textRating: groups.text?.rating ?? null,
        attributesRating: groups.other_attributes?.rating ?? null,
        improve: Array.isArray(card.contentRatingImprove) ? card.contentRatingImprove : [],
        price: card.price,
        oldPrice: card.oldPrice,
        stockPresent: card.stockPresent,
        stockReserved: card.stockReserved,
        hasStock: Boolean(card.hasStock),
        reviewPromoEnabled: Boolean(card.reviewPromoEnabled),
        status: card.status || '',
        statusDescription: card.statusDescription || '',
        updatedAt: card.updatedAt || '',
        reviewApiLocked,
        comment: card.comment || ''
      };
      row.tone = ozonTone(row);
      return row;
    });
    const totals = {
      ...payload.summary,
      products: num(payload.summary?.products || rows.length),
      cards: num(payload.summary?.cards || rows.length),
      contentRated: num(payload.summary?.contentRated || rows.filter((row) => hasNumber(row.contentRating)).length),
      avgContentRating: hasNumber(payload.summary?.avgContentRating)
        ? Number(payload.summary.avgContentRating)
        : (rows.length ? rows.reduce((sum, row) => sum + num(row.contentRating), 0) / rows.length : null),
      contentBelow70: num(payload.summary?.contentBelow70 || rows.filter((row) => hasNumber(row.contentRating) && Number(row.contentRating) < 70).length),
      contentBelow90: num(payload.summary?.contentBelow90 || rows.filter((row) => hasNumber(row.contentRating) && Number(row.contentRating) < 90).length),
      hasStock: num(payload.summary?.hasStock || rows.filter((row) => row.hasStock).length),
      stockPresent: num(payload.summary?.stockPresent || rows.reduce((sum, row) => sum + num(row.stockPresent), 0)),
      reviewPromoEnabled: num(payload.summary?.reviewPromoEnabled || rows.filter((row) => row.reviewPromoEnabled).length),
      reviewCount: num(payload.summary?.feedbacks?.count),
      questions: num(payload.summary?.questions?.count)
    };
    return {
      payload,
      rows,
      totals,
      latest,
      history,
      reviewApiLocked,
      reviewApiMessage: payload.summary?.reviewApiMessage || payload.reviewAccess?.message || '',
      generatedAt: payload.generatedAt || '',
      ozonWindow7: wbModel?.ozonWindow7 || { revenue: 0, units: 0, latestDate: '' }
    };
  }

  function filterOzonRows(rows) {
    const status = workbenchState.status || 'all';
    let next = [...rows];
    if (status === 'contentLow') next = next.filter((row) => hasNumber(row.contentRating) && Number(row.contentRating) < 70);
    else if (status === 'contentWarn') next = next.filter((row) => hasNumber(row.contentRating) && Number(row.contentRating) < 90);
    else if (status === 'stock') next = next.filter((row) => row.hasStock);
    else if (status === 'noStock') next = next.filter((row) => !row.hasStock);
    else if (status === 'apiLocked') next = next.filter((row) => row.reviewApiLocked);
    return next;
  }

  function sortOzonRows(rows) {
    const sort = workbenchState.sort || 'contentRating';
    const next = [...rows];
    next.sort((a, b) => {
      if (sort === 'contentRating') return num(a.contentRating ?? 999) - num(b.contentRating ?? 999);
      if (sort === 'contentRatingDesc') return num(b.contentRating) - num(a.contentRating);
      if (sort === 'stock') return num(b.stockPresent) - num(a.stockPresent);
      if (sort === 'price') return num(b.price) - num(a.price);
      if (sort === 'media') return num(a.mediaRating ?? 999) - num(b.mediaRating ?? 999);
      if (sort === 'text') return num(a.textRating ?? 999) - num(b.textRating ?? 999);
      if (sort === 'attrs') return num(a.attributesRating ?? 999) - num(b.attributesRating ?? 999);
      return String(a.label || '').localeCompare(String(b.label || ''), 'ru');
    });
    return next;
  }

  function renderOzonControls(items, visible) {
    const status = workbenchState.status || 'all';
    const sort = workbenchState.sort || 'contentRating';
    const statuses = [
      ['all', 'Все'],
      ['contentLow', 'Рейтинг <70'],
      ['contentWarn', 'Рейтинг <90'],
      ['stock', 'Есть остаток'],
      ['noStock', 'Нет остатка'],
      ['apiLocked', 'Отзывы API']
    ];
    const sorts = [
      ['contentRating', 'Рейтинг ↑'],
      ['contentRatingDesc', 'Рейтинг ↓'],
      ['media', 'Медиа'],
      ['text', 'Текст'],
      ['attrs', 'Атрибуты'],
      ['stock', 'Остаток'],
      ['price', 'Цена']
    ];
    return `
      <div class="rating-queue-controls">
        <div class="rating-sort-control" aria-label="Фильтр Ozon">
          <span>Фильтр</span>
          ${statuses.map(([value, label]) => `<button type="button" class="${status === value ? 'active' : ''}" data-rating-status="${esc(value)}">${esc(label)}</button>`).join('')}
        </div>
        <div class="rating-sort-control" aria-label="Сортировка Ozon">
          <span>Сортировка</span>
          ${sorts.map(([value, label]) => `<button type="button" class="${sort === value ? 'active' : ''}" data-rating-sort="${esc(value)}">${esc(label)}</button>`).join('')}
        </div>
        <div class="badge-stack">${chip(`${fmtInt(visible.length)} из ${fmtInt(items.length)}`, 'info')}</div>
      </div>
    `;
  }

  function renderOzonApiNotice(ozon) {
    if (!ozon.reviewApiLocked) return '';
    return `
      <div class="notice warn" style="margin:0 16px 12px">
        <strong>Отзывы Ozon API не отдает по текущей подписке.</strong>
        <div class="small muted">${esc(ozon.reviewApiMessage || 'Методы /v1/review/list и /v1/review/count вернули PermissionDenied.')}</div>
      </div>
    `;
  }

  function renderOzonHistoryCards(model) {
    const ozon = buildOzonModel(model);
    const filtered = filterOzonRows(ozon.rows);
    const rows = sortOzonRows(filtered).slice(0, 160).map((row) => {
      const ratio = hasNumber(row.contentRating) ? Number(row.contentRating) / 100 : 0.1;
      const improve = row.improve.length ? row.improve.slice(0, 2).join(', ') : (row.comment || row.statusDescription || 'ок');
      return `
        <tr class="sku-plan-fact-row rating-work-row" style="${planFactStyle('ozon', ratio)}">
          <td class="article-cell">
            <strong>${esc(row.label)}</strong>
            <span class="cell-muted">Ozon SKU ${esc(row.sku || '—')} · product ${esc(row.productId || '—')}</span>
          </td>
          <td><span class="cell-main">${esc(ozonStatus(row))}</span>${simpleBadge(row.tone === 'risk' ? 'внимание' : row.tone === 'good' ? 'ок' : 'доработать', row.tone === 'risk' ? 'down' : row.tone === 'good' ? 'up' : 'flat')}</td>
          <td><span class="cell-main">${fmtNum(row.contentRating, 1)}</span><span class="cell-muted">из 100</span>${hasNumber(row.contentDelta) ? trendBadge(row.contentDelta, 0) : ''}</td>
          <td><span class="cell-main">${fmtNum(row.mediaRating, 0)}</span><span class="cell-muted">медиа</span></td>
          <td><span class="cell-main">${fmtNum(row.textRating, 0)}</span><span class="cell-muted">текст</span></td>
          <td><span class="cell-main">${fmtNum(row.attributesRating, 0)}</span><span class="cell-muted">атрибуты</span></td>
          <td><span class="cell-main">${fmtMoney(row.price)}</span><span class="cell-muted">цена Ozon</span></td>
          <td><span class="cell-main">${fmtInt(row.stockPresent)}</span><span class="cell-muted">${row.hasStock ? 'есть остаток' : 'нет остатка'}</span></td>
          <td><span class="cell-main">${row.reviewApiLocked ? 'закрыто' : 'доступно'}</span>${row.reviewApiLocked ? simpleBadge('403 подписка', 'down') : simpleBadge('API ок', 'up')}</td>
          <td><span class="cell-text">${esc(improve)}</span></td>
        </tr>
      `;
    }).join('');
    return `
      <div class="sku-plan-fact-card rating-work-card">
        <div class="rating-detail-head">
          <div>
            <h3>Ozon · история карточек</h3>
            <p>Данные из Ozon Seller API: товары, SKU, рейтинг контента, группы рейтинга, цена, остаток и статус доступа к отзывам.</p>
          </div>
          <div class="badge-stack">${chip(`${fmtInt(ozon.rows.length)} карточек`, 'info')}${chip(`срез ${fullDate(ozon.latest?.date || ozon.payload.window?.to || '')}`, 'info')}</div>
        </div>
        ${renderOzonControls(ozon.rows, filtered)}
        ${renderOzonApiNotice(ozon)}
        <div class="rating-work-table">
          <table>
            <colgroup>
              <col style="width:230px"><col style="width:130px"><col style="width:110px"><col style="width:92px"><col style="width:92px"><col style="width:100px"><col style="width:116px"><col style="width:110px"><col style="width:120px"><col style="width:260px">
            </colgroup>
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Статус</th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'contentRating' ? 'active' : ''}" data-rating-sort="contentRating">Рейтинг</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'media' ? 'active' : ''}" data-rating-sort="media">Медиа</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'text' ? 'active' : ''}" data-rating-sort="text">Текст</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'attrs' ? 'active' : ''}" data-rating-sort="attrs">Атрибуты</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'price' ? 'active' : ''}" data-rating-sort="price">Цена</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'stock' ? 'active' : ''}" data-rating-sort="stock">Остаток</button></th>
                <th>Отзывы API</th>
                <th>Что сделать</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="10" class="center">Нет карточек Ozon по текущему фильтру.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderOzonQueue(model, kind) {
    const ozon = buildOzonModel(model);
    const lowRows = sortOzonRows(filterOzonRows(ozon.rows)).slice(0, 120);
    const title = kind === 'reviews' ? 'Ozon · отзывы' : 'Ozon · вопросы';
    const text = kind === 'reviews'
      ? 'Текст отзывов и звездность отзывов Ozon API не отдает по текущей подписке. Ниже показываем доступный API-срез по карточкам и явный статус доступа.'
      : 'Отдельный API-вопросов Ozon в текущем источнике не подключен. Ниже остается доступный API-срез по карточкам, чтобы блок не был пустым.';
    return `
      <div class="sku-plan-fact-card rating-work-card">
        <div class="rating-detail-head">
          <div>
            <h3>${esc(title)}</h3>
            <p>${esc(text)}</p>
          </div>
          <div class="badge-stack">${chip(`${fmtInt(ozon.rows.length)} карточек Ozon`, 'info')}${chip(ozon.reviewApiLocked ? 'review API 403' : 'review API ok', ozon.reviewApiLocked ? 'warn' : 'ok')}</div>
        </div>
        ${renderOzonControls(ozon.rows, lowRows)}
        ${renderOzonApiNotice(ozon)}
        <div class="rating-history-list" style="padding:0 16px 16px">
          ${lowRows.slice(0, 36).map((row) => `
            <article class="rating-history-card">
              <div class="rating-history-main">
                <strong>${esc(row.label)}</strong>
                <div class="meta">Ozon SKU ${esc(row.sku || '—')} · ${esc(row.status || '')}</div>
              </div>
              <div class="rating-history-metrics">
                ${renderMiniMetric('Рейтинг контента', fmtNum(row.contentRating, 1), row.contentRating < 70 ? simpleBadge('низкий', 'down') : simpleBadge('ок', 'up'))}
                ${renderMiniMetric('Медиа', fmtNum(row.mediaRating, 0))}
                ${renderMiniMetric('Текст', fmtNum(row.textRating, 0))}
                ${renderMiniMetric('Атрибуты', fmtNum(row.attributesRating, 0))}
                ${renderMiniMetric('Остаток', fmtInt(row.stockPresent), row.hasStock ? simpleBadge('есть', 'up') : simpleBadge('нет', 'down'))}
                ${renderMiniMetric('Отзывы API', ozon.reviewApiLocked ? 'закрыто' : 'доступно', ozon.reviewApiLocked ? simpleBadge('403 подписка', 'down') : simpleBadge('ок', 'up'))}
              </div>
            </article>
          `).join('') || '<div class="empty">Нет строк Ozon.</div>'}
        </div>
      </div>
    `;
  }

  function renderOzonStats(model) {
    const ozon = buildOzonModel(model);
    const ozon7 = ozon.ozonWindow7 || { revenue: 0, units: 0, latestDate: '' };
    return `
      <div class="rating-detail-head">
        <div>
          <h3>Ozon · статистика</h3>
          <p>Сводка из Ozon Seller API: рейтинг контента карточек, товары, остатки и статус доступа к отзывам.</p>
        </div>
      </div>
      ${renderOzonApiNotice(ozon)}
      <div class="rating-metric-grid">
        ${renderMetricCard('Ozon карточки API', fmtInt(ozon.totals.cards), simpleBadge(`${fmtInt(ozon.totals.contentRated)} с рейтингом`, 'up'), `товаров в API ${fmtInt(ozon.totals.products)}`, { platform: 'ozon', ratio: 1 })}
        ${renderMetricCard('Рейтинг контента', fmtNum(ozon.totals.avgContentRating, 1), simpleBadge(`${fmtInt(ozon.totals.contentBelow70)} ниже 70`, ozon.totals.contentBelow70 ? 'down' : 'up'), `${fmtInt(ozon.totals.contentBelow90)} ниже 90`, { platform: 'ozon', ratio: hasNumber(ozon.totals.avgContentRating) ? Number(ozon.totals.avgContentRating) / 100 : 0.1 })}
        ${renderMetricCard('Остатки Ozon', fmtInt(ozon.totals.stockPresent), simpleBadge(`${fmtInt(ozon.totals.hasStock)} карточек с остатком`, 'up'), 'из API product/info/list', { platform: 'ozon' })}
        ${renderMetricCard('Отзывы Ozon API', ozon.reviewApiLocked ? 'закрыто' : fmtInt(ozon.totals.reviewCount), ozon.reviewApiLocked ? simpleBadge('403 подписка', 'down') : simpleBadge('API ок', 'up'), ozon.reviewApiLocked ? 'review/list и review/count недоступны' : 'отзывы доступны', { platform: 'ozon', ratio: ozon.reviewApiLocked ? 0.18 : 1 })}
        ${renderMetricCard('Отзывы за баллы', fmtInt(ozon.totals.reviewPromoEnabled), simpleBadge('REVIEWS_PROMO', 'flat'), 'активных промо по карточкам', { platform: 'ozon' })}
        ${renderMetricCard('Выручка Ozon 7д', fmtMoney(ozon7.revenue), simpleBadge(`${fmtInt(ozon7.units)} шт.`, ozon7.units ? 'up' : 'flat'), ozon7.latestDate ? `срез ${fullDate(ozon7.latestDate)}` : '', { platform: 'ozon', ratio: ozon7.revenue ? 1 : 0.1 })}
      </div>
    `;
  }

  function renderStructuredPlatforms(model) {
    const ozon = buildOzonModel(model);
    const latestRating = model.totals.avgRating;
    const prevRating = avgSnapshotRating(model.baseline1);
    const reviewDailyBase = model.totals.reviews3 ? model.totals.reviews3 / 3 : null;
    const questionDailyBase = model.totals.questions3 ? model.totals.questions3 / 3 : null;
    const unansweredTotal = model.totals.unanswered + model.totals.unansweredQuestions;
    const ozon7 = model.ozonWindow7 || { revenue: 0, units: 0, latestDate: '' };
    const cards = [
      renderMetricCard('WB рейтинг', fmtNum(latestRating, 2), ratingTrendBadge(latestRating, prevRating), `${fmtInt(model.totals.leaders)} карточек 4,8+`, { platform: 'wb', ratio: hasNumber(latestRating) ? Number(latestRating) / 5 : 0.5 }),
      renderMetricCard('WB отзывы 7д', fmtInt(model.totals.reviews7), trendBadge(model.totals.reviews1, reviewDailyBase), `вчера ${fmtInt(model.totals.reviews1)}`, { platform: 'wb' }),
      renderMetricCard('WB негатив 7д', fmtPct(model.totals.neg7), trendBadge(model.totals.neg1, model.totals.neg3, { lowerIsBetter: true, percent: true, threshold: 0.01 }), `${fmtInt(model.totals.low7)} негативных`, { platform: 'wb', ratio: model.totals.neg7 === null ? 0.5 : Math.max(0.08, 1 - Number(model.totals.neg7)) }),
      renderMetricCard('WB вопросы', fmtInt(model.totals.questions), trendBadge(model.totals.questions1, questionDailyBase), `+${fmtInt(model.totals.questions7)} за 7 дней`, { platform: 'wb' }),
      renderMetricCard('WB без ответа', fmtInt(unansweredTotal), unansweredTotal ? simpleBadge('закрыть', 'down') : simpleBadge('ок', 'up'), `${fmtInt(model.totals.unanswered)} отзывов / ${fmtInt(model.totals.unansweredQuestions)} вопросов`, { platform: 'wb', ratio: unansweredTotal ? 0.35 : 1 }),
      renderMetricCard('Ozon рейтинг контента', fmtNum(ozon.totals.avgContentRating, 1), simpleBadge(`${fmtInt(ozon.totals.contentBelow70)} ниже 70`, ozon.totals.contentBelow70 ? 'down' : 'up'), `${fmtInt(ozon.totals.contentRated)} карточек из API`, { platform: 'ozon', ratio: hasNumber(ozon.totals.avgContentRating) ? Number(ozon.totals.avgContentRating) / 100 : 0.08 }),
      renderMetricCard('Ozon отзывы API', ozon.reviewApiLocked ? 'закрыто' : fmtInt(ozon.totals.reviewCount), ozon.reviewApiLocked ? simpleBadge('403 подписка', 'down') : simpleBadge('API ок', 'up'), ozon.reviewApiLocked ? 'методы review/list и review/count недоступны' : 'данные отзывов загружены', { platform: 'ozon', ratio: ozon.reviewApiLocked ? 0.18 : 1 }),
      renderMetricCard('Ozon выручка 7д', fmtMoney(ozon7.revenue), simpleBadge('продажи есть', 'up'), `${fmtInt(ozon7.units)} шт. за 7 дней`, { platform: 'ozon', ratio: ozon7.revenue ? 1 : 0.1 })
    ].join('');
    return `
      <div class="rating-planfact-toolbar">
        <div class="rating-platform-selector">
          <button class="${structuredState.platform === 'wb' ? 'active' : ''}" type="button" data-rating-platform="wb">WB · история / отзывы / вопросы</button>
          <button class="${structuredState.platform === 'ozon' ? 'active' : ''}" type="button" data-rating-platform="ozon">Ozon · что есть / что подключить</button>
        </div>
        <div class="badge-stack">${chip(`${fmtInt(model.rows.length)} карточек`, 'info')}${chip(`${fmtInt(model.snapshots.length)} срезов`, 'info')}</div>
      </div>
      <div class="sku-plan-platform-board rating-planfact-board">${cards}</div>
    `;
  }

  function nullableNumber(value) {
    return hasNumber(value) ? Number(value) : null;
  }

  function ozonReviewApiLocked(payload) {
    const status = payload?.summary?.reviewApiStatus || payload?.summary?.counters?.reviewApiStatus || payload?.reviewAccess?.status || '';
    return status === 'permission_denied';
  }

  function ozonReviewApiMessage(payload) {
    return payload?.summary?.reviewApiMessage || payload?.summary?.counters?.reviewApiMessage || payload?.reviewAccess?.message || '';
  }

  function ozonPeriod(card, days) {
    return {
      reviews: nullableNumber(card?.[`reviews${days}`]),
      rating: nullableNumber(card?.[`rating${days}`]),
      low: nullableNumber(card?.[`negative${days}`]),
      negativePct: nullableNumber(card?.[`negativePct${days}`])
    };
  }

  function ozonQuestionPeriod(card, days) {
    return {
      questions: num(card?.[`questions${days}`]),
      unanswered: num(card?.[`unansweredQuestions${days}`])
    };
  }

  function ozonRowStatus(row) {
    if (row.unansweredQuestions > 0) return 'Нужен ответ';
    if (row.q1.questions > 0) return 'Новые вопросы';
    if (!row.hasStock) return 'Нет остатка';
    if (row.reviewApiLocked) return 'Отзывы API закрыты';
    return 'Норма';
  }

  function ozonStatusBadge(row) {
    if (row.unansweredQuestions > 0) return simpleBadge('ответить', 'down');
    if (row.q1.questions > 0) return simpleBadge('вчера +' + fmtInt(row.q1.questions), 'flat');
    if (!row.hasStock) return simpleBadge('нет остатка', 'down');
    if (row.reviewApiLocked) return simpleBadge('API 403', 'down');
    return simpleBadge('норма', 'up');
  }

  function ozonRowComment(row) {
    const comments = [];
    if (row.unansweredQuestions > 0) comments.push(`Ответить на вопросы: ${fmtInt(row.unansweredQuestions)}`);
    if (row.q1.questions > 0) comments.push(`Вчера вопросов: ${fmtInt(row.q1.questions)}`);
    if (hasNumber(row.registryRating)) comments.push(`Ориентир рейтинга: ${fmtNum(row.registryRating, 1)} из реестра`);
    if (row.reviewApiLocked) comments.push('Отзывы, рейтинг и негатив закрыты подпиской Ozon API');
    if (hasNumber(row.contentRating) && Number(row.contentRating) < 70) comments.push('Служебный контент-рейтинг <70, не звезды товара');
    if (!row.hasStock) comments.push('Нет остатка');
    return comments.join(' · ') || row.comment || 'Ок';
  }

  function buildOzonModel(wbModel = null) {
    const payload = ozonPayload();
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    const history = Array.isArray(payload.history) ? payload.history : [];
    const latest = history.length ? history[history.length - 1] : { date: payload.window?.to || '', cards };
    const reviewApiLocked = ozonReviewApiLocked(payload);
    const skuMap = buildSkuMap(appState());
    const rows = cards.map((card, index) => {
      const p7 = ozonPeriod(card, 7);
      const p3 = ozonPeriod(card, 3);
      const p1 = ozonPeriod(card, 1);
      const q7 = ozonQuestionPeriod(card, 7);
      const q3 = ozonQuestionPeriod(card, 3);
      const q1 = ozonQuestionPeriod(card, 1);
      const key = ozonCardKey(card);
      const registrySku = skuMap.get(key)
        || skuMap.get(normalizeKey(card.offerId))
        || skuMap.get(normalizeKey(card.articleKey))
        || skuMap.get(normalizeKey(card.label));
      const row = {
        index: index + 1,
        key,
        platform: 'ozon',
        label: card.offerId || card.label || card.title || String(card.sku || card.productId || ''),
        title: card.title || '',
        offerId: card.offerId || '',
        sku: card.sku || '',
        productId: card.productId || '',
        contentRating: nullableNumber(card.contentRating),
        rating: nullableNumber(card.reviewRating),
        registryRating: nullableNumber(registrySku?.rating),
        registryReviews: nullableNumber(registrySku?.reviews),
        ratingDelta1: null,
        ratingDelta7: null,
        historyRating: null,
        feedbackCount: nullableNumber(card.feedbackCount),
        unanswered: nullableNumber(card.unansweredFeedbackCount),
        unansweredQuestions: num(card.unansweredQuestionCount),
        questionCount: num(card.questionCount),
        p7,
        p3,
        p1,
        q7,
        q3,
        q1,
        revenue: {
          revenue7: nullableNumber(card.revenue7),
          revenue3: nullableNumber(card.revenue3),
          revenue1: nullableNumber(card.revenue1),
          units7: nullableNumber(card.units7),
          units3: nullableNumber(card.units3),
          units1: nullableNumber(card.units1),
          source: card.revenueSource || 'Ozon API'
        },
        stockPresent: num(card.stockPresent),
        hasStock: Boolean(card.hasStock),
        status: card.status || '',
        statusDescription: card.statusDescription || '',
        lastQuestionDate: isoDate(card.lastQuestionDate),
        reviewApiLocked,
        comment: card.comment || ''
      };
      row.tone = row.unansweredQuestions > 0 ? 'risk' : (row.q1.questions > 0 || !row.hasStock ? 'warn' : 'good');
      row.gameScore = Math.max(1, Math.round(
        Math.min(24, num(row.revenue.revenue7) / 60000)
        + Math.min(20, row.questionCount / 4)
        + Math.min(18, row.q7.questions * 2)
        - Math.min(16, row.unansweredQuestions * 6)
      ));
      return row;
    });
    const summary = payload.summary || {};
    const questionSummary = typeof summary.questions === 'object' ? summary.questions : {};
    const totals = {
      ...summary,
      products: num(summary.products || rows.length),
      cards: num(summary.cards || rows.length),
      revenue7: nullableNumber(summary.revenue7) ?? rows.reduce((sum, row) => sum + num(row.revenue.revenue7), 0),
      revenue3: nullableNumber(summary.revenue3) ?? rows.reduce((sum, row) => sum + num(row.revenue.revenue3), 0),
      revenue1: nullableNumber(summary.revenue1) ?? rows.reduce((sum, row) => sum + num(row.revenue.revenue1), 0),
      units7: nullableNumber(summary.units7) ?? rows.reduce((sum, row) => sum + num(row.revenue.units7), 0),
      units3: nullableNumber(summary.units3) ?? rows.reduce((sum, row) => sum + num(row.revenue.units3), 0),
      units1: nullableNumber(summary.units1) ?? rows.reduce((sum, row) => sum + num(row.revenue.units1), 0),
      reviews7: nullableNumber(summary.reviews7),
      reviews3: nullableNumber(summary.reviews3),
      reviews1: nullableNumber(summary.reviews1),
      rating7: nullableNumber(summary.rating7),
      rating3: nullableNumber(summary.rating3),
      rating1: nullableNumber(summary.rating1),
      negative7: nullableNumber(summary.negative7),
      negative3: nullableNumber(summary.negative3),
      negative1: nullableNumber(summary.negative1),
      questions: nullableNumber(questionSummary.count ?? summary.questionsTotal) ?? rows.reduce((sum, row) => sum + row.questionCount, 0),
      questions7: nullableNumber(summary.questions7) ?? rows.reduce((sum, row) => sum + row.q7.questions, 0),
      questions3: nullableNumber(summary.questions3) ?? rows.reduce((sum, row) => sum + row.q3.questions, 0),
      questions1: nullableNumber(summary.questions1) ?? rows.reduce((sum, row) => sum + row.q1.questions, 0),
      unansweredQuestions: nullableNumber(questionSummary.unanswered ?? summary.unansweredQuestions) ?? rows.reduce((sum, row) => sum + row.unansweredQuestions, 0),
      contentRated: num(summary.contentRated || rows.filter((row) => hasNumber(row.contentRating)).length),
      avgContentRating: nullableNumber(summary.avgContentRating),
      contentBelow70: num(summary.contentBelow70 || rows.filter((row) => hasNumber(row.contentRating) && Number(row.contentRating) < 70).length),
      registryRatingCount: rows.filter((row) => hasNumber(row.registryRating)).length,
      avgRegistryRating: (() => {
        const rated = rows.filter((row) => hasNumber(row.registryRating));
        return rated.length ? rated.reduce((sum, row) => sum + Number(row.registryRating), 0) / rated.length : null;
      })(),
      registryReviews: rows.reduce((sum, row) => sum + num(row.registryReviews), 0)
    };
    return {
      payload,
      rows,
      totals,
      latest,
      history,
      reviewApiLocked,
      reviewApiMessage: ozonReviewApiMessage(payload),
      generatedAt: payload.generatedAt || '',
      ozonWindow7: wbModel?.ozonWindow7 || { revenue: totals.revenue7, units: totals.units7, latestDate: latest?.date || payload.window?.to || '' }
    };
  }

  function filterOzonRows(rows) {
    const status = workbenchState.status || 'all';
    return [...rows].filter((row) => historyRowMatches(row, status));
  }

  function sortOzonRows(rows) {
    return sortRatingRows(rows);
  }

  function renderOzonUnavailableCell(note = 'API 403') {
    return `<span class="cell-main">—</span><span class="cell-muted">${esc(note)}</span>`;
  }

  function renderOzonRegistryRatingCell(row) {
    if (!hasNumber(row.registryRating)) return renderOzonUnavailableCell('звезды API 403');
    return `<span class="cell-main">${fmtNum(row.registryRating, 1)}</span><span class="cell-muted">ориентир из реестра · не API</span>`;
  }

  function renderOzonCountCell(value, note = '') {
    return `<span class="cell-main">${fmtInt(value)}</span>${note ? `<span class="cell-muted">${esc(note)}</span>` : ''}`;
  }

  function renderOzonHistoryCards(model) {
    const ozon = buildOzonModel(model);
    const filteredRows = filterOzonRows(ozon.rows);
    const sortedRows = sortOzonRows(filteredRows);
    const rows = sortedRows.slice(0, 160).map((row) => {
      const link = typeof linkToSku === 'function' ? linkToSku(row.key || row.label, row.label) : `<strong>${esc(row.label)}</strong>`;
      const unanswered = num(row.unanswered) + num(row.unansweredQuestions);
      const ratio = row.unansweredQuestions ? 0.22 : row.q1.questions ? 0.55 : row.revenue.revenue7 ? 0.92 : 0.46;
      return `
        <tr class="sku-plan-fact-row rating-work-row" style="${planFactStyle('ozon', ratio)}">
          <td class="article-cell">
            ${link}
            <span class="cell-muted">Ozon SKU ${esc(row.sku || '—')} · product ${esc(row.productId || '—')}</span>
          </td>
          <td><span class="cell-main">${esc(ozonRowStatus(row))}</span>${ozonStatusBadge(row)}</td>
          <td><span class="cell-main">${fmtMoney(row.revenue.revenue7)}</span><span class="cell-muted">${fmtInt(row.revenue.units7)} шт. · ${esc(row.revenue.source || 'Ozon API')}</span></td>
          <td>${renderOzonUnavailableCell(ozon.reviewApiLocked ? 'API отзывов 403' : '')}</td>
          <td>${renderOzonUnavailableCell(ozon.reviewApiLocked ? 'API отзывов 403' : '')}</td>
          <td>${renderOzonUnavailableCell(ozon.reviewApiLocked ? 'API отзывов 403' : '')}</td>
          <td>${renderOzonUnavailableCell(ozon.reviewApiLocked ? 'звезды API 403' : '')}</td>
          <td>${renderOzonUnavailableCell(ozon.reviewApiLocked ? 'звезды API 403' : '')}</td>
          <td>${renderOzonRegistryRatingCell(row)}</td>
          <td>${renderOzonUnavailableCell(ozon.reviewApiLocked ? 'API негатива 403' : '')}</td>
          <td>${renderOzonUnavailableCell(ozon.reviewApiLocked ? 'API негатива 403' : '')}</td>
          <td>${renderOzonUnavailableCell(ozon.reviewApiLocked ? 'API негатива 403' : '')}</td>
          <td>${renderOzonCountCell(row.questionCount, 'всего')}</td>
          <td>${renderOzonCountCell(row.q7.questions, 'за 7 дней')}</td>
          <td>${renderOzonCountCell(row.q3.questions, 'за 3 дня')}</td>
          <td>${renderOzonCountCell(row.q1.questions, 'вчера')}</td>
          <td><span class="cell-main">${fmtInt(unanswered)}</span><span class="cell-muted">${ozon.reviewApiLocked ? 'отзывы API 403' : `${fmtInt(row.unanswered)} отзывов`} · ${fmtInt(row.unansweredQuestions)} вопросов</span></td>
          <td><span class="cell-text">${esc(ozonRowComment(row))}</span></td>
        </tr>
      `;
    }).join('');
    return `
      <div class="sku-plan-fact-card rating-work-card">
        <div class="rating-detail-head">
          <div>
            <h3>Ozon · рабочая таблица карточек</h3>
            <p>Те же поля, что у WB. Выручка и вопросы приходят из Ozon API; звезды товара, отзывы и негатив закрыты review API. Контент-рейтинг не подменяет рейтинг товара.</p>
          </div>
          <div class="badge-stack">${chip(`${fmtInt(ozon.rows.length)} карточек`, 'info')}${chip(`${fmtInt(ozon.totals.questions7)} вопросов за 7д`, 'info')}${chip(ozon.reviewApiLocked ? 'отзывы API 403' : 'отзывы API ок', ozon.reviewApiLocked ? 'warn' : 'ok')}</div>
        </div>
        ${renderHistoryControls(ozon.rows, filteredRows)}
        ${renderOzonApiNotice(ozon)}
        <div class="rating-work-table">
          <table>
            <colgroup>
              <col style="width:230px"><col style="width:120px"><col style="width:118px"><col style="width:86px"><col style="width:86px"><col style="width:92px"><col style="width:96px"><col style="width:96px"><col style="width:120px"><col style="width:98px"><col style="width:98px"><col style="width:104px"><col style="width:94px"><col style="width:92px"><col style="width:92px"><col style="width:92px"><col style="width:112px"><col style="width:160px">
            </colgroup>
            <thead>
              <tr>
                <th>Артикул</th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'risk' ? 'active' : ''}" data-rating-sort="risk">Статус</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'revenue' ? 'active' : ''}" data-rating-sort="revenue">Выручка 7д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'reviews7' ? 'active' : ''}" data-rating-sort="reviews7">Отзывы 7д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'reviews3' ? 'active' : ''}" data-rating-sort="reviews3">Отзывы 3д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'reviews1' ? 'active' : ''}" data-rating-sort="reviews1">Отзывы вчера</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'rating7' ? 'active' : ''}" data-rating-sort="rating7">Рейтинг 7д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'rating3' ? 'active' : ''}" data-rating-sort="rating3">Рейтинг 3д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'rating1' ? 'active' : ''}" data-rating-sort="rating1">Рейтинг вчера</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'negative7' ? 'active' : ''}" data-rating-sort="negative7">Негатив 7д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'negative3' ? 'active' : ''}" data-rating-sort="negative3">Негатив 3д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'negative1' ? 'active' : ''}" data-rating-sort="negative1">Негатив вчера</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'questions' ? 'active' : ''}" data-rating-sort="questions">Вопросы всего</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'questions7' ? 'active' : ''}" data-rating-sort="questions7">Вопросы 7д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'questions3' ? 'active' : ''}" data-rating-sort="questions3">Вопросы 3д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'questions1' ? 'active' : ''}" data-rating-sort="questions1">Вопросы вчера</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'unanswered' ? 'active' : ''}" data-rating-sort="unanswered">Без ответа</button></th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="18" class="center">Нет карточек Ozon по текущему фильтру.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function ozonQuestionItems(ozon) {
    const bySku = new Map((ozon.rows || []).map((row) => [String(row.sku || ''), row]));
    return (Array.isArray(ozon.payload.questions) ? ozon.payload.questions : []).map((question, index) => {
      const row = bySku.get(String(question.sku || '')) || {};
      const unanswered = question.answered === false || num(question.answersCount) === 0;
      return {
        id: question.id || `ozon-question-${index}`,
        kind: 'question',
        key: row.key || String(question.sku || ''),
        label: row.label || String(question.sku || 'Ozon'),
        sku: question.sku || '',
        date: isoDate(question.date || question.publishedAt),
        text: question.text || '—',
        unanswered: unanswered ? 1 : 0,
        answered: !unanswered,
        questionCount: 1,
        priority: (unanswered ? 20 : 0) + (dateValue(question.date) || 0) / 100000000000
      };
    });
  }

  function renderOzonReviewsUnavailable(model) {
    const ozon = buildOzonModel(model);
    return `
      <div class="sku-plan-fact-card rating-work-card">
        <div class="rating-detail-head">
          <div>
            <h3>Ozon · отзывы</h3>
            <p>Колонки отзывов оставлены в отчете, но Ozon API сейчас не отдает сами отзывы, рейтинги и негатив.</p>
          </div>
          <div class="badge-stack">${chip('review/list 403', 'warn')}${chip('review/count 403', 'warn')}</div>
        </div>
        ${renderOzonApiNotice(ozon)}
        <div class="rating-work-table">
          <table>
            <colgroup><col style="width:240px"><col style="width:110px"><col style="width:140px"><col style="width:110px"><col style="width:120px"><col style="width:420px"></colgroup>
            <thead><tr><th>Артикул</th><th>Дата</th><th>Статус</th><th>Оценка</th><th>Негатив</th><th>Текст / суть</th></tr></thead>
            <tbody><tr><td colspan="6" class="center">Отзывы Ozon недоступны по API подписке: в истории выше эти поля показаны как API 403.</td></tr></tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderOzonQuestions(model) {
    const ozon = buildOzonModel(model);
    const items = ozonQuestionItems(ozon);
    const visible = sortStructuredQueueItems(filterStructuredQueueItems(items, 'questions'), 'questions');
    const activeSort = queueSortKey('questions');
    const rows = visible.slice(0, 160).map((item) => `
      <tr class="sku-plan-fact-row rating-work-row" style="${planFactStyle('ozon', item.unanswered ? 0.3 : 0.85)}">
        <td class="article-cell">
          ${typeof linkToSku === 'function' ? linkToSku(item.key || item.label, item.label) : esc(item.label)}
          <span class="cell-muted">Ozon SKU ${esc(item.sku || '—')}</span>
        </td>
        <td><span class="cell-main">${esc(item.date ? shortDate(item.date) : 'без даты')}</span></td>
        <td><span class="cell-main">${item.unanswered ? 'Нужен ответ' : 'Закрыто'}</span>${item.unanswered ? simpleBadge('ответить', 'down') : simpleBadge('ок', 'up')}</td>
        <td><span class="cell-main">1</span><span class="cell-muted">вопрос</span></td>
        <td><span class="cell-main">${fmtInt(item.unanswered)}</span><span class="cell-muted">без ответа</span></td>
        <td><span class="cell-text">${esc(item.text || '—')}</span></td>
      </tr>
    `).join('');
    return `
      <div class="sku-plan-fact-card rating-work-card">
        <div class="rating-detail-head">
          <div>
            <h3>Ozon · вопросы</h3>
            <p>Реальный список вопросов из Ozon API: дата, статус, без ответа и суть вопроса.</p>
          </div>
          <div class="badge-stack">${chip(`${fmtInt(items.length)} строк`, 'info')}${chip(`${fmtInt(ozon.totals.unansweredQuestions)} без ответа`, ozon.totals.unansweredQuestions ? 'warn' : 'ok')}</div>
        </div>
        ${renderQueueControls('questions', items, visible)}
        <div class="rating-work-table">
          <table>
            <colgroup>
              <col style="width:240px"><col style="width:110px"><col style="width:140px"><col style="width:110px"><col style="width:120px"><col style="width:420px">
            </colgroup>
            <thead>
              <tr>
                <th><button type="button" class="rating-th-sort ${activeSort === 'questionArticle' ? 'active' : ''}" data-rating-sort="questionArticle">Артикул</button></th>
                <th><button type="button" class="rating-th-sort ${activeSort === 'questionDate' ? 'active' : ''}" data-rating-sort="questionDate">Дата</button></th>
                <th><button type="button" class="rating-th-sort ${activeSort === 'questionStatus' ? 'active' : ''}" data-rating-sort="questionStatus">Статус</button></th>
                <th><button type="button" class="rating-th-sort ${activeSort === 'questionCount' ? 'active' : ''}" data-rating-sort="questionCount">Вопросы</button></th>
                <th><button type="button" class="rating-th-sort ${activeSort === 'questionStatus' ? 'active' : ''}" data-rating-sort="questionStatus">Без ответа</button></th>
                <th>Текст / суть</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6" class="center">Нет вопросов Ozon по текущему фильтру.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderOzonQueue(model, kind) {
    return kind === 'reviews' ? renderOzonReviewsUnavailable(model) : renderOzonQuestions(model);
  }

  function renderOzonStats(model) {
    const ozon = buildOzonModel(model);
    const questionDailyBase = ozon.totals.questions3 ? ozon.totals.questions3 / 3 : null;
    return `
      <div class="rating-detail-head">
        <div>
          <h3>Ozon · статистика</h3>
          <p>Сводка в тех же метриках: выручка, отзывы, рейтинг, негатив, вопросы и хвост без ответа.</p>
        </div>
      </div>
      ${renderOzonApiNotice(ozon)}
      <div class="rating-metric-grid">
        ${renderMetricCard('Ozon выручка 7д', fmtMoney(ozon.totals.revenue7), simpleBadge(`${fmtInt(ozon.totals.units7)} шт.`, 'up'), `3д ${fmtMoney(ozon.totals.revenue3)} · вчера ${fmtMoney(ozon.totals.revenue1)}`, { platform: 'ozon', ratio: ozon.totals.revenue7 ? 1 : 0.1 })}
        ${renderMetricCard('Ozon вопросы всего', fmtInt(ozon.totals.questions), trendBadge(ozon.totals.questions1, questionDailyBase), `7д ${fmtInt(ozon.totals.questions7)} · 3д ${fmtInt(ozon.totals.questions3)} · вчера ${fmtInt(ozon.totals.questions1)}`, { platform: 'ozon' })}
        ${renderMetricCard('Ozon без ответа', fmtInt(ozon.totals.unansweredQuestions), ozon.totals.unansweredQuestions ? simpleBadge('закрыть', 'down') : simpleBadge('ок', 'up'), 'вопросы без ответа', { platform: 'ozon', ratio: ozon.totals.unansweredQuestions ? 0.35 : 1 })}
        ${renderMetricCard('Ozon отзывы 7 / 3 / вчера', '— / — / —', simpleBadge('API 403', 'down'), 'review/list и review/count закрыты подпиской', { platform: 'ozon', ratio: 0.18 })}
        ${renderMetricCard('Ozon рейтинг ориентир', fmtNum(ozon.totals.avgRegistryRating, 1), simpleBadge('реестр, не API', 'flat'), `звезды Ozon API 403 · ${fmtInt(ozon.totals.registryRatingCount)} карточек`, { platform: 'ozon', ratio: hasNumber(ozon.totals.avgRegistryRating) ? Number(ozon.totals.avgRegistryRating) / 5 : 0.18 })}
        ${renderMetricCard('Ozon негатив 7 / 3 / вчера', '— / — / —', simpleBadge('API 403', 'down'), 'негатив считается из отзывов', { platform: 'ozon', ratio: 0.18 })}
      </div>
    `;
  }

  function renderStructuredPlatforms(model) {
    const ozon = buildOzonModel(model);
    const latestRating = model.totals.avgRating;
    const prevRating = avgSnapshotRating(model.baseline1);
    const reviewDailyBase = model.totals.reviews3 ? model.totals.reviews3 / 3 : null;
    const questionDailyBase = model.totals.questions3 ? model.totals.questions3 / 3 : null;
    const ozonQuestionDailyBase = ozon.totals.questions3 ? ozon.totals.questions3 / 3 : null;
    const unansweredTotal = model.totals.unanswered + model.totals.unansweredQuestions;
    const cards = [
      renderMetricCard('WB рейтинг', fmtNum(latestRating, 2), ratingTrendBadge(latestRating, prevRating), `${fmtInt(model.totals.leaders)} карточек 4,8+`, { platform: 'wb', ratio: hasNumber(latestRating) ? Number(latestRating) / 5 : 0.5 }),
      renderMetricCard('WB отзывы 7д', fmtInt(model.totals.reviews7), trendBadge(model.totals.reviews1, reviewDailyBase), `вчера ${fmtInt(model.totals.reviews1)}`, { platform: 'wb' }),
      renderMetricCard('WB негатив 7д', fmtPct(model.totals.neg7), trendBadge(model.totals.neg1, model.totals.neg3, { lowerIsBetter: true, percent: true, threshold: 0.01 }), `${fmtInt(model.totals.low7)} негативных`, { platform: 'wb', ratio: model.totals.neg7 === null ? 0.5 : Math.max(0.08, 1 - Number(model.totals.neg7)) }),
      renderMetricCard('WB вопросы', fmtInt(model.totals.questions), trendBadge(model.totals.questions1, questionDailyBase), `+${fmtInt(model.totals.questions7)} за 7 дней`, { platform: 'wb' }),
      renderMetricCard('WB без ответа', fmtInt(unansweredTotal), unansweredTotal ? simpleBadge('закрыть', 'down') : simpleBadge('ок', 'up'), `${fmtInt(model.totals.unanswered)} отзывов / ${fmtInt(model.totals.unansweredQuestions)} вопросов`, { platform: 'wb', ratio: unansweredTotal ? 0.35 : 1 }),
      renderMetricCard('Ozon выручка 7д', fmtMoney(ozon.totals.revenue7), simpleBadge(`${fmtInt(ozon.totals.units7)} шт.`, 'up'), `вчера ${fmtMoney(ozon.totals.revenue1)}`, { platform: 'ozon', ratio: ozon.totals.revenue7 ? 1 : 0.1 }),
      renderMetricCard('Ozon вопросы 7д', fmtInt(ozon.totals.questions7), trendBadge(ozon.totals.questions1, ozonQuestionDailyBase), `${fmtInt(ozon.totals.questions)} всего`, { platform: 'ozon' }),
      renderMetricCard('Ozon без ответа', fmtInt(ozon.totals.unansweredQuestions), ozon.totals.unansweredQuestions ? simpleBadge('закрыть', 'down') : simpleBadge('ок', 'up'), 'вопросы', { platform: 'ozon', ratio: ozon.totals.unansweredQuestions ? 0.35 : 1 }),
      renderMetricCard('Ozon рейтинг ориентир', fmtNum(ozon.totals.avgRegistryRating, 1), simpleBadge('реестр, не API', 'flat'), `звезды API 403 · ${fmtInt(ozon.totals.registryReviews)} отзывов в реестре`, { platform: 'ozon', ratio: hasNumber(ozon.totals.avgRegistryRating) ? Number(ozon.totals.avgRegistryRating) / 5 : 0.18 }),
      renderMetricCard('Ozon контент служебно', fmtInt(ozon.totals.cards), simpleBadge(`${fmtInt(ozon.totals.contentBelow70)} <70`, ozon.totals.contentBelow70 ? 'down' : 'up'), 'это не рейтинг товара', { platform: 'ozon', ratio: 0.9 })
    ].join('');
    return `
      <div class="rating-planfact-toolbar">
        <div class="rating-platform-selector">
          <button class="${structuredState.platform === 'wb' ? 'active' : ''}" type="button" data-rating-platform="wb">WB · история / отзывы / вопросы</button>
          <button class="${structuredState.platform === 'ozon' ? 'active' : ''}" type="button" data-rating-platform="ozon">Ozon · история / отзывы / вопросы</button>
        </div>
        <div class="badge-stack">${chip(`${fmtInt(model.rows.length)} WB`, 'info')}${chip(`${fmtInt(ozon.rows.length)} Ozon`, 'info')}</div>
      </div>
      <div class="sku-plan-platform-board rating-planfact-board">${cards}</div>
    `;
  }

  function sortRatingRows(rows = []) {
    const sort = workbenchState.sort || 'revenue';
    const list = [...rows];
    const riskRank = (row) => (row.tone === 'risk' ? 3 : row.tone === 'warn' ? 2 : 1);
    const ratingAsc = (left, right, field) => {
      const a = num(left?.[field]?.rating || left?.rating || 5);
      const b = num(right?.[field]?.rating || right?.rating || 5);
      return a - b || riskRank(right) - riskRank(left);
    };
    return list.sort((a, b) => {
      if (sort === 'revenue') return num(b.revenue?.revenue7) - num(a.revenue?.revenue7) || riskRank(b) - riskRank(a);
      if (sort === 'ratingDrop') return a.ratingDelta1 - b.ratingDelta1 || riskRank(b) - riskRank(a);
      if (sort === 'rating7') return ratingAsc(a, b, 'p7');
      if (sort === 'rating3') return ratingAsc(a, b, 'p3');
      if (sort === 'rating1') return ratingAsc(a, b, 'p1');
      if (sort === 'negative' || sort === 'negative7') return num(b.p7?.negativePct) - num(a.p7?.negativePct) || num(b.p7?.low) - num(a.p7?.low);
      if (sort === 'negative3') return num(b.p3?.negativePct) - num(a.p3?.negativePct) || num(b.p3?.low) - num(a.p3?.low);
      if (sort === 'negative1') return num(b.p1?.negativePct) - num(a.p1?.negativePct) || num(b.p1?.low) - num(a.p1?.low);
      if (sort === 'reviews' || sort === 'reviews7') return num(b.p7?.reviews) - num(a.p7?.reviews);
      if (sort === 'reviews3') return num(b.p3?.reviews) - num(a.p3?.reviews);
      if (sort === 'reviews1') return num(b.p1?.reviews) - num(a.p1?.reviews);
      if (sort === 'questions7') return num(b.q7?.questions) - num(a.q7?.questions);
      if (sort === 'questions3') return num(b.q3?.questions) - num(a.q3?.questions);
      if (sort === 'questions1') return num(b.q1?.questions) - num(a.q1?.questions);
      if (sort === 'questions') return num(b.questionCount) - num(a.questionCount);
      if (sort === 'unanswered') return (num(b.unanswered) + num(b.unansweredQuestions)) - (num(a.unanswered) + num(a.unansweredQuestions));
      return riskRank(b) - riskRank(a) || b.gameScore - a.gameScore || num(b.p7?.reviews) - num(a.p7?.reviews);
    });
  }

  function renderRatingSortControl() {
    const current = workbenchState.sort || 'revenue';
    const options = [
      ['revenue', 'Выручка 7д'],
      ['risk', 'Риски'],
      ['reviews7', 'Отзывы 7д'],
      ['reviews3', 'Отзывы 3д'],
      ['reviews1', 'Отзывы вчера'],
      ['ratingDrop', 'Рейтинг просел'],
      ['negative7', 'Негатив 7д'],
      ['negative3', 'Негатив 3д'],
      ['negative1', 'Негатив вчера'],
      ['questions', 'Вопросы'],
      ['unanswered', 'Без ответа']
    ];
    return `
      <div class="rating-sort-control" aria-label="Сортировка таблицы рейтингов">
        <span>Сортировка</span>
        ${options.map(([value, label]) => `<button type="button" class="${current === value ? 'active' : ''}" data-rating-sort="${esc(value)}">${esc(label)}</button>`).join('')}
      </div>
    `;
  }

  function historyRowMatches(row, status) {
    if (!status || status === 'all') return true;
    const unanswered = num(row.unanswered) + num(row.unansweredQuestions);
    const lowTotal = num(row.p7?.low) + num(row.p3?.low) + num(row.p1?.low);
    const hasQuestions = num(row.questionCount) + num(row.q7?.questions) + num(row.q3?.questions) + num(row.q1?.questions) + num(row.unansweredQuestions);
    if (status === 'unanswered') return unanswered > 0;
    if (status === 'negative') return lowTotal > 0 || num(row.p7?.negativePct) >= 0.04 || num(row.p1?.negativePct) > 0;
    if (status === 'ratingDrop') return num(row.ratingDelta1) <= -0.03 || num(row.ratingDelta7) <= -0.05;
    if (status === 'questions') return hasQuestions > 0;
    if (status === 'fresh') return num(row.p1?.reviews) > 0 || num(row.q1?.questions) > 0 || num(row.p1?.low) > 0;
    return true;
  }

  function filterRatingRows(rows) {
    const status = workbenchState.status || 'all';
    return [...rows].filter((row) => historyRowMatches(row, status));
  }

  function renderHistoryControls(items, visible) {
    const status = workbenchState.status || 'all';
    const statusOptions = [
      ['all', 'Все'],
      ['unanswered', 'Нужен ответ'],
      ['negative', 'Негатив'],
      ['ratingDrop', 'Рейтинг просел'],
      ['questions', 'Есть вопросы'],
      ['fresh', 'Свежие']
    ];
    return `
      <div class="rating-queue-controls">
        <div class="rating-sort-control" aria-label="Фильтр карточек">
          <span>Фильтр</span>
          ${statusOptions.map(([value, label]) => `<button type="button" class="${status === value ? 'active' : ''}" data-rating-status="${esc(value)}">${esc(label)}</button>`).join('')}
        </div>
        ${renderRatingSortControl()}
        <div class="badge-stack">${chip(`${fmtInt(visible.length)} из ${fmtInt(items.length)}`, 'info')}</div>
      </div>
    `;
  }

  function queueSortKey(kind) {
    const current = workbenchState.sort || '';
    const allowed = kind === 'reviews'
      ? ['reviewDate', 'reviewStatus', 'reviewRating', 'reviewNegative', 'reviewArticle']
      : ['questionDate', 'questionStatus', 'questionCount', 'questionArticle'];
    return allowed.includes(current) ? current : allowed[0];
  }

  function renderQueueControls(kind, items, visible) {
    const status = workbenchState.status || 'all';
    const activeSort = queueSortKey(kind);
    const statusOptions = kind === 'reviews'
      ? [
        ['all', 'Все'],
        ['unanswered', 'Без ответа'],
        ['negative', 'Негатив'],
        ['fresh', 'Свежие']
      ]
      : [
        ['all', 'Все'],
        ['unanswered', 'Без ответа'],
        ['fresh', 'Свежие']
      ];
    const sortOptions = kind === 'reviews'
      ? [
        ['reviewDate', 'Дата'],
        ['reviewStatus', 'Статус'],
        ['reviewRating', 'Оценка'],
        ['reviewNegative', 'Негатив'],
        ['reviewArticle', 'Артикул']
      ]
      : [
        ['questionDate', 'Дата'],
        ['questionStatus', 'Статус'],
        ['questionCount', 'Вопросы'],
        ['questionArticle', 'Артикул']
      ];
    return `
      <div class="rating-queue-controls">
        <div class="rating-sort-control" aria-label="Фильтр строк">
          <span>Фильтр</span>
          ${statusOptions.map(([value, label]) => `<button type="button" class="${status === value ? 'active' : ''}" data-rating-status="${esc(value)}">${esc(label)}</button>`).join('')}
        </div>
        <div class="rating-sort-control" aria-label="Сортировка строк">
          <span>Сортировка</span>
          ${sortOptions.map(([value, label]) => `<button type="button" class="${activeSort === value ? 'active' : ''}" data-rating-sort="${esc(value)}">${esc(label)}</button>`).join('')}
        </div>
        <div class="badge-stack">${chip(`${fmtInt(visible.length)} из ${fmtInt(items.length)}`, 'info')}</div>
      </div>
    `;
  }

  function filterStructuredQueueItems(items, kind) {
    const status = workbenchState.status || 'all';
    let next = [...items];
    if (status === 'unanswered') {
      next = next.filter((item) => num(item.unanswered) > 0 || item.answered === false);
    } else if (status === 'negative' && kind === 'reviews') {
      next = next.filter((item) => num(item.low || item.low7) > 0 || (hasNumber(item.valuation || item.rating) && num(item.valuation || item.rating) <= 3));
    } else if (status === 'fresh') {
      const newest = next.reduce((latest, item) => Math.max(latest, dateValue(item.date)), 0);
      next = next.filter((item) => dateValue(item.date) === newest);
    }
    return next;
  }

  function sortStructuredQueueItems(items, kind) {
    const sort = queueSortKey(kind);
    const next = [...items];
    next.sort((a, b) => {
      if (sort === 'reviewDate' || sort === 'questionDate') return dateValue(b.date) - dateValue(a.date) || num(b.priority) - num(a.priority);
      if (sort === 'reviewStatus' || sort === 'questionStatus') return num(b.unanswered) - num(a.unanswered) || num(b.priority) - num(a.priority);
      if (sort === 'reviewRating') return num(a.valuation || a.rating || 5) - num(b.valuation || b.rating || 5) || num(b.priority) - num(a.priority);
      if (sort === 'reviewNegative') return num(b.low || b.low7) - num(a.low || a.low7) || num(b.priority) - num(a.priority);
      if (sort === 'questionCount') return num(b.questionCount) - num(a.questionCount) || num(b.priority) - num(a.priority);
      if (sort === 'reviewArticle' || sort === 'questionArticle') return String(a.label || '').localeCompare(String(b.label || ''), 'ru');
      return num(b.priority) - num(a.priority);
    });
    return next;
  }

  function renderHistoryCards(model) {
    const filteredRows = filterRatingRows(model.rows);
    const sortedRows = sortRatingRows(filteredRows);
    const rows = sortedRows.slice(0, 120).map((row) => {
      const link = typeof linkToSku === 'function' ? linkToSku(row.key || row.label, row.label) : `<strong>${esc(row.label)}</strong>`;
      const unanswered = row.unanswered + row.unansweredQuestions;
      const ratingRatio = hasNumber(row.rating) ? Number(row.rating) / 5 : 0.5;
      const statusBadge = unanswered
        ? simpleBadge('ответить', 'down')
        : row.p1.low
          ? simpleBadge('негатив', 'down')
          : row.ratingDelta1 <= -0.03
            ? simpleBadge('падает', 'down')
            : simpleBadge('норма', 'up');
      return `
        <tr class="sku-plan-fact-row rating-work-row" style="${planFactStyle('wb', ratingRatio)}">
          <td class="article-cell">
            ${link}
            <span class="cell-muted">WB nm ${esc(row.card?.nmId || '—')} · история отзывов ${signed(row.historyDelta)}</span>
            <div class="wb-rating-chipline">${signalPills(row)}</div>
          </td>
          <td><span class="cell-main">${esc(gameLabel(row))}</span>${statusBadge}</td>
          <td><span class="cell-main">${fmtMoney(row.revenue.revenue7)}</span><span class="cell-muted">${esc(row.revenue.source || 'выручка')}</span></td>
          <td><span class="cell-main">${fmtInt(row.p7.reviews)}</span><span class="cell-muted">за 7 дней</span></td>
          <td><span class="cell-main">${fmtInt(row.p3.reviews)}</span><span class="cell-muted">за 3 дня</span></td>
          <td><span class="cell-main">${fmtInt(row.p1.reviews)}</span><span class="cell-muted">вчера</span></td>
          <td><span class="cell-main">${fmtNum(row.p7.rating, 2)}</span><span class="cell-muted">7 дней</span></td>
          <td><span class="cell-main">${fmtNum(row.p3.rating, 2)}</span><span class="cell-muted">3 дня</span></td>
          <td><span class="cell-main">${fmtNum(row.p1.rating, 2)}</span><span class="cell-muted">вчера · текущая ${fmtNum(row.rating, 2)}</span>${ratingTrendBadge(row.rating, row.historyRating)}</td>
          <td><span class="cell-main">${fmtPct(row.p7.negativePct)}</span><span class="cell-muted">${fmtInt(row.p7.low)} шт.</span></td>
          <td><span class="cell-main">${fmtPct(row.p3.negativePct)}</span><span class="cell-muted">${fmtInt(row.p3.low)} шт.</span></td>
          <td><span class="cell-main">${fmtPct(row.p1.negativePct)}</span><span class="cell-muted">${fmtInt(row.p1.low)} шт.</span></td>
          <td><span class="cell-main">${fmtInt(row.questionCount)}</span><span class="cell-muted">всего</span></td>
          <td><span class="cell-main">${fmtInt(row.q7.questions)}</span><span class="cell-muted">за 7 дней</span></td>
          <td><span class="cell-main">${fmtInt(row.q3.questions)}</span><span class="cell-muted">за 3 дня</span></td>
          <td><span class="cell-main">${fmtInt(row.q1.questions)}</span><span class="cell-muted">вчера</span></td>
          <td><span class="cell-main">${fmtInt(unanswered)}</span><span class="cell-muted">${fmtInt(row.unanswered)} отзывов · ${fmtInt(row.unansweredQuestions)} вопросов</span></td>
          <td><span class="cell-text">${esc(row.comment || '—')}</span></td>
        </tr>
      `;
    }).join('');
    return `
      <div class="sku-plan-fact-card rating-work-card">
        <div class="rating-detail-head">
          <div>
            <h3>WB · рабочая таблица карточек</h3>
            <p>Одна строка = один товар. Сначала статус, затем отзывы, оценка, негатив, вопросы и хвост без ответа.</p>
          </div>
          <div class="rating-work-actions">
            <div class="badge-stack">${chip(`${fmtInt(model.rows.length)} карточек`, 'info')}${chip(`${fmtInt(model.snapshots.length)} срезов`, 'info')}</div>
          </div>
        </div>
        ${renderHistoryControls(model.rows, filteredRows)}
        <div class="rating-work-table">
          <table>
            <colgroup>
              <col style="width:230px"><col style="width:120px"><col style="width:118px"><col style="width:86px"><col style="width:86px"><col style="width:92px"><col style="width:96px"><col style="width:96px"><col style="width:120px"><col style="width:98px"><col style="width:98px"><col style="width:104px"><col style="width:94px"><col style="width:92px"><col style="width:92px"><col style="width:92px"><col style="width:112px"><col style="width:138px">
            </colgroup>
            <thead>
              <tr>
                <th>Артикул</th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'risk' ? 'active' : ''}" data-rating-sort="risk">Статус</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'revenue' ? 'active' : ''}" data-rating-sort="revenue">Выручка 7д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'reviews7' ? 'active' : ''}" data-rating-sort="reviews7">Отзывы 7д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'reviews3' ? 'active' : ''}" data-rating-sort="reviews3">Отзывы 3д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'reviews1' ? 'active' : ''}" data-rating-sort="reviews1">Отзывы вчера</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'rating7' ? 'active' : ''}" data-rating-sort="rating7">Рейтинг 7д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'rating3' ? 'active' : ''}" data-rating-sort="rating3">Рейтинг 3д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'rating1' ? 'active' : ''}" data-rating-sort="rating1">Рейтинг вчера</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'negative7' ? 'active' : ''}" data-rating-sort="negative7">Негатив 7д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'negative3' ? 'active' : ''}" data-rating-sort="negative3">Негатив 3д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'negative1' ? 'active' : ''}" data-rating-sort="negative1">Негатив вчера</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'questions' ? 'active' : ''}" data-rating-sort="questions">Вопросы всего</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'questions7' ? 'active' : ''}" data-rating-sort="questions7">Вопросы 7д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'questions3' ? 'active' : ''}" data-rating-sort="questions3">Вопросы 3д</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'questions1' ? 'active' : ''}" data-rating-sort="questions1">Вопросы вчера</button></th>
                <th><button type="button" class="rating-th-sort ${workbenchState.sort === 'unanswered' ? 'active' : ''}" data-rating-sort="unanswered">Без ответа</button></th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="18" class="center">Нет карточек в истории WB.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderStructuredQueue(model, payload, kind) {
    const items = kind === 'reviews' ? feedbackItems(payload, model) : questionItems(payload, model);
    const visible = sortStructuredQueueItems(filterStructuredQueueItems(items, kind), kind);
    const title = kind === 'reviews' ? 'WB · отзывы' : 'WB · вопросы';
    const activeSort = queueSortKey(kind);
    const rows = visible.slice(0, 120).map((item) => {
      const ratio = kind === 'reviews' && hasNumber(item.valuation || item.rating) ? Number(item.valuation || item.rating) / 5 : (item.unanswered ? 0.35 : 0.85);
      return `
        <tr class="sku-plan-fact-row rating-work-row" style="${planFactStyle('wb', ratio)}">
          <td class="article-cell">
            ${typeof linkToSku === 'function' ? linkToSku(item.key || item.label, item.label) : esc(item.label)}
            <span class="cell-muted">WB nm ${esc(item.nmId || '—')}</span>
          </td>
          <td><span class="cell-main">${esc(item.date ? shortDate(item.date) : 'без даты')}</span></td>
          <td><span class="cell-main">${item.unanswered ? 'Нужен ответ' : 'Закрыто'}</span>${item.unanswered ? simpleBadge('закрыть', 'down') : simpleBadge('ок', 'up')}</td>
          <td><span class="cell-main">${kind === 'reviews' ? fmtNum(item.valuation || item.rating, 2) : fmtInt(item.questionCount)}</span><span class="cell-muted">${kind === 'reviews' ? 'оценка' : 'вопросов'}</span></td>
          <td><span class="cell-main">${kind === 'reviews' ? fmtInt(item.low || item.low7) : fmtInt(item.unanswered)}</span><span class="cell-muted">${kind === 'reviews' ? 'негатив' : 'без ответа'}</span></td>
          <td><span class="cell-text">${esc(item.text || '—')}</span></td>
        </tr>
      `;
    }).join('');
    return `
      <div class="sku-plan-fact-card rating-work-card">
        <div class="rating-detail-head">
          <div>
            <h3>${title}</h3>
            <p>${kind === 'reviews' ? 'Отдельный список отзывов: статус, оценка, негатив и текст.' : 'Отдельный список вопросов: статус, количество и текст.'}</p>
          </div>
          <div class="badge-stack">${chip(`${fmtInt(items.length)} строк`, 'info')}</div>
        </div>
        ${renderQueueControls(kind, items, visible)}
        <div class="rating-work-table">
          <table>
            <colgroup>
              <col style="width:240px"><col style="width:110px"><col style="width:140px"><col style="width:110px"><col style="width:120px"><col style="width:420px">
            </colgroup>
            <thead>
              <tr>
                <th><button type="button" class="rating-th-sort ${activeSort === (kind === 'reviews' ? 'reviewArticle' : 'questionArticle') ? 'active' : ''}" data-rating-sort="${kind === 'reviews' ? 'reviewArticle' : 'questionArticle'}">Артикул</button></th>
                <th><button type="button" class="rating-th-sort ${activeSort === (kind === 'reviews' ? 'reviewDate' : 'questionDate') ? 'active' : ''}" data-rating-sort="${kind === 'reviews' ? 'reviewDate' : 'questionDate'}">Дата</button></th>
                <th><button type="button" class="rating-th-sort ${activeSort === (kind === 'reviews' ? 'reviewStatus' : 'questionStatus') ? 'active' : ''}" data-rating-sort="${kind === 'reviews' ? 'reviewStatus' : 'questionStatus'}">Статус</button></th>
                <th><button type="button" class="rating-th-sort ${activeSort === (kind === 'reviews' ? 'reviewRating' : 'questionCount') ? 'active' : ''}" data-rating-sort="${kind === 'reviews' ? 'reviewRating' : 'questionCount'}">${kind === 'reviews' ? 'Оценка' : 'Вопросы'}</button></th>
                <th><button type="button" class="rating-th-sort ${activeSort === (kind === 'reviews' ? 'reviewNegative' : 'questionStatus') ? 'active' : ''}" data-rating-sort="${kind === 'reviews' ? 'reviewNegative' : 'questionStatus'}">${kind === 'reviews' ? 'Негатив' : 'Без ответа'}</button></th>
                <th>Текст / суть</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6" class="center">Нет строк по текущему срезу.</td></tr>'}</tbody>
          </table>
        </div>
        ${visible.length > 120 ? `<div class="wb-rating-source-note" style="padding:0 16px 14px">Показаны первые 120 строк из ${fmtInt(visible.length)}. Сузьте фильтр, если нужен короткий список.</div>` : ''}
      </div>
    `;
  }

  function renderStatsControls() {
    const period = structuredState.statsPeriod || 'all';
    const metric = structuredState.statsMetric || 'all';
    const periodOptions = [
      ['all', 'Все окна'],
      ['p7', '7 дней'],
      ['p3', '3 дня'],
      ['p1', 'Вчера']
    ];
    const metricOptions = [
      ['all', 'Все метрики'],
      ['reviews', 'Отзывы'],
      ['negative', 'Негатив'],
      ['questions', 'Вопросы'],
      ['unanswered', 'Без ответа'],
      ['history', 'История'],
      ['rating', 'Оценка']
    ];
    return `
      <div class="rating-queue-controls rating-stat-controls">
        <div class="rating-sort-control" aria-label="Период статистики">
          <span>Период</span>
          ${periodOptions.map(([value, label]) => `<button type="button" class="${period === value ? 'active' : ''}" data-rating-stats-period="${esc(value)}">${esc(label)}</button>`).join('')}
        </div>
        <div class="rating-sort-control" aria-label="Метрика статистики">
          <span>Метрика</span>
          ${metricOptions.map(([value, label]) => `<button type="button" class="${metric === value ? 'active' : ''}" data-rating-stats-metric="${esc(value)}">${esc(label)}</button>`).join('')}
        </div>
      </div>
    `;
  }

  function statsPeriodValues(model) {
    const period = structuredState.statsPeriod || 'all';
    const map = {
      p7: { label: '7 дней', reviews: model.totals.reviews7, low: model.totals.low7, neg: model.totals.neg7, questions: model.totals.questions7, revenue: model.totals.revenue7 },
      p3: { label: '3 дня', reviews: model.totals.reviews3, low: model.totals.low3, neg: model.totals.neg3, questions: model.totals.questions3, revenue: model.totals.revenue3 },
      p1: { label: 'вчера', reviews: model.totals.reviews1, low: model.totals.low1, neg: model.totals.neg1, questions: model.totals.questions1, revenue: model.totals.revenue1 }
    };
    return map[period] || null;
  }

  function renderStatsMetricCards(model) {
    const metric = structuredState.statsMetric || 'all';
    const reviewDailyBase = model.totals.reviews3 ? model.totals.reviews3 / 3 : null;
    const questionDailyBase = model.totals.questions3 ? model.totals.questions3 / 3 : null;
    const periodData = statsPeriodValues(model);
    const cards = periodData ? [
      ['reviews', renderMetricCard(`Отзывы ${periodData.label}`, fmtInt(periodData.reviews), trendBadge(model.totals.reviews1, reviewDailyBase), `выручка ${fmtMoney(periodData.revenue)}`)],
      ['negative', renderMetricCard(`Негатив ${periodData.label}`, fmtPct(periodData.neg), trendBadge(model.totals.neg1, model.totals.neg3, { lowerIsBetter: true, percent: true, threshold: 0.01 }), `${fmtInt(periodData.low)} негативных отзывов`, { ratio: periodData.neg === null ? 0.5 : Math.max(0.08, 1 - Number(periodData.neg)) })],
      ['questions', renderMetricCard(`Вопросы ${periodData.label}`, fmtInt(periodData.questions), trendBadge(model.totals.questions1, questionDailyBase), `${fmtInt(model.totals.questions)} всего в базе`)],
      ['unanswered', renderMetricCard('Без ответа сейчас', `${fmtInt(model.totals.unanswered)} отзывов / ${fmtInt(model.totals.unansweredQuestions)} вопросов`, (model.totals.unanswered + model.totals.unansweredQuestions) ? simpleBadge('закрыть', 'down') : simpleBadge('ок', 'up'))],
      ['history', renderMetricCard('История карточек', `${fmtInt(model.snapshots.length)} срезов`, simpleBadge(`${fmtInt(model.rows.length)} карточек`, 'flat'), `срез ${fullDate(model.active.date)}`)],
      ['rating', renderMetricCard('Средняя оценка', fmtNum(model.totals.avgRating, 2), ratingTrendBadge(model.totals.avgRating, avgSnapshotRating(model.baseline1)), `${fmtInt(model.totals.leaders)} карточек 4,8+`)]
    ] : [
      ['reviews', renderMetricCard('Отзывы 7 / 3 / вчера', `${fmtInt(model.totals.reviews7)} / ${fmtInt(model.totals.reviews3)} / ${fmtInt(model.totals.reviews1)}`)],
      ['negative', renderMetricCard('Негатив 7 / 3 / вчера', `${fmtPct(model.totals.neg7)} / ${fmtPct(model.totals.neg3)} / ${fmtPct(model.totals.neg1)}`, trendBadge(model.totals.neg1, model.totals.neg3, { lowerIsBetter: true, percent: true, threshold: 0.01 }))],
      ['questions', renderMetricCard('Вопросы 7 / 3 / вчера', `${fmtInt(model.totals.questions7)} / ${fmtInt(model.totals.questions3)} / ${fmtInt(model.totals.questions1)}`)],
      ['unanswered', renderMetricCard('Без ответа', `${fmtInt(model.totals.unanswered)} отзывов / ${fmtInt(model.totals.unansweredQuestions)} вопросов`, (model.totals.unanswered + model.totals.unansweredQuestions) ? simpleBadge('нужно закрыть', 'down') : simpleBadge('закрыто', 'up'))],
      ['history', renderMetricCard('История', `${fmtInt(model.snapshots.length)} срезов`, '', `${fmtInt(model.rows.length)} карточек`)],
      ['rating', renderMetricCard('Средняя оценка', fmtNum(model.totals.avgRating, 2), ratingTrendBadge(model.totals.avgRating, avgSnapshotRating(model.baseline1)))]
    ];
    return cards
      .filter(([id]) => metric === 'all' || metric === id)
      .map(([, html]) => html)
      .join('');
  }

  function renderStructuredStats(model) {
    return `
      <div class="rating-detail-head">
        <div>
          <h3>WB · статистика</h3>
          <p>Сводка по тем же окнам, что в отчете: 7 дней, 3 дня, вчера.</p>
        </div>
      </div>
      ${renderStatsControls()}
      <div class="rating-metric-grid">
        ${renderStatsMetricCards(model)}
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
    if (structuredState.platform === 'ozon') {
      if (structuredState.view === 'reviews') return renderOzonQueue(model, 'reviews');
      if (structuredState.view === 'questions') return renderOzonQueue(model, 'questions');
      if (structuredState.view === 'stats') return renderOzonStats(model);
      return renderOzonHistoryCards(model);
    }
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
        structuredState.view = 'history';
        workbenchState.status = 'all';
        workbenchState.sort = 'revenue';
        renderWbCardRatingStructured(rootId);
      });
    });
    root.querySelectorAll('[data-rating-view]').forEach((button) => {
      button.addEventListener('click', () => {
        structuredState.view = button.dataset.ratingView || 'history';
        workbenchState.status = 'all';
        renderWbCardRatingStructured(rootId);
      });
    });
    root.querySelectorAll('[data-rating-status]').forEach((control) => {
      control.addEventListener('click', () => {
        workbenchState.status = control.dataset.ratingStatus || 'all';
        renderWbCardRatingStructured(rootId);
      });
    });
    root.querySelectorAll('[data-rating-sort]').forEach((control) => {
      const applySort = () => {
        workbenchState.sort = control.dataset.ratingSort || control.value || 'revenue';
        renderWbCardRatingStructured(rootId);
      };
      if (control.tagName === 'SELECT') control.addEventListener('change', applySort);
      else control.addEventListener('click', applySort);
    });
    root.querySelectorAll('[data-rating-stats-period]').forEach((control) => {
      control.addEventListener('click', () => {
        structuredState.statsPeriod = control.dataset.ratingStatsPeriod || 'all';
        renderWbCardRatingStructured(rootId);
      });
    });
    root.querySelectorAll('[data-rating-stats-metric]').forEach((control) => {
      control.addEventListener('click', () => {
        structuredState.statsMetric = control.dataset.ratingStatsMetric || 'all';
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
    const ozonModel = buildOzonModel(model);

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Рейтинг карточек WB/Ozon</h2>
          <p>Крупные блоки по площадкам: рейтинги, отзывы, вопросы, история и рост/падение.</p>
        </div>
        <div class="badge-stack">
          ${chip(`WB ${fullDate(model.active.date)}`, 'ok')}
          ${chip(`Ozon API ${fmtInt(ozonModel.totals.cards)} карточек`, 'info')}
          ${chip(`Ozon выручка ${fmtMoney(ozonModel.totals.revenue7)}`, 'ok')}
          ${chip(`Ozon вопросы ${fmtInt(ozonModel.totals.questions)}`, 'info')}
          ${chip(ozonModel.reviewApiLocked ? 'Ozon отзывы 403' : 'Ozon отзывы API ok', ozonModel.reviewApiLocked ? 'warn' : 'ok')}
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
    return renderWbCardRatingStructured(rootId);
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
