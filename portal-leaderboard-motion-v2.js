(function () {
  'use strict';

  const VERSION = '20260622-leaderboard-motion-v5-substitute-sales';
  const MODE_KEY = 'altea.leaderboard.mode.v2';
  const LFL_CLASS_KEY = 'altea.leaderboard.lflClass.v2';

  const SOURCE_FILES = {
    productLeaderboard: 'data/product_leaderboard.json',
    productLeaderboardHistory: 'data/product_leaderboard_history.json',
    productLeaderboardHistoryFallback: 'data/last_good/product_leaderboard_history.json',
    wbSubstitutionTraffic: 'data/wb_substitution_traffic.json',
    wbSubstitutionTrafficHistory: 'data/wb_substitution_traffic_history.json'
  };

  const MODE_META = {
    metrics: { label: 'Метрики КЗ', number: '01', tone: '#e5c16f' },
    substitutes: { label: 'WB подменные артикулы', number: '02', tone: '#8ab7ff' },
    lfl: { label: 'Изменение по сопоставимым SKU', number: '03', tone: '#72e6a0' }
  };

  const ruInt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const ruMoney = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const ruPct = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

  let searchDebounce = 0;

  function appState() {
    window.state = window.state || {};
    return window.state;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function numberOrZero(value) {
    return numberOrNull(value) ?? 0;
  }

  function fmtInt(value) {
    const num = numberOrNull(value);
    return num === null ? '—' : ruInt.format(Math.round(num));
  }

  function fmtMoney(value) {
    const num = numberOrNull(value);
    return num === null ? '—' : `${ruMoney.format(Math.round(num))} ₽`;
  }

  function fmtPct(value) {
    const num = numberOrNull(value);
    return num === null ? '—' : `${ruPct.format(num * 100)}%`;
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + numberOrZero(row?.[key]), 0);
  }

  function ratio(a, b) {
    const left = numberOrNull(a);
    const right = numberOrNull(b);
    if (left === null || right === null || right === 0) return null;
    return left / right;
  }

  function readStorage(key, fallback = '') {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, String(value || ''));
    } catch (_) {
      // Non-critical UI persistence.
    }
  }

  function getFilters() {
    const state = appState();
    state.productLeaderboardFilters = state.productLeaderboardFilters || {};
    const filters = state.productLeaderboardFilters;
    filters.search = filters.search || '';
    filters.owner = filters.owner || 'all';
    filters.category = filters.category || 'all';
    filters.traffic = filters.traffic || 'all';
    filters.signal = filters.signal || 'all';
    filters.sort = filters.sort && filters.sort !== 'gameScore' ? filters.sort : 'orderDeltaAbs';
    filters.sortDir = filters.sortDir === 'asc' ? 'asc' : 'desc';
    filters.snapshot = filters.snapshot || 'latest';
    filters.lflCurrentSnapshot = filters.lflCurrentSnapshot || filters.snapshot || 'latest';
    filters.lflCompareSnapshot = filters.lflCompareSnapshot || '';
    filters.expandedPanel = filters.expandedPanel || readStorage(MODE_KEY, 'metrics') || 'metrics';
    filters.weeklyMetric = filters.weeklyMetric || 'orders';
    filters.lflClass = filters.lflClass || readStorage(LFL_CLASS_KEY, 'all') || 'all';
    return filters;
  }

  function getGlobalMarketplace() {
    const raw = String(
      document.documentElement?.dataset?.marketplace ||
      document.body?.dataset?.marketplace ||
      appState().portalMarketplace ||
      readStorage('altea.portal.marketplace', 'all') ||
      'all'
    ).toLowerCase();
    if (raw === 'ym' || raw === 'ya' || raw.includes('yandex')) return 'Я.Маркет';
    if (raw === 'wb' || raw.includes('wild')) return 'WB';
    if (raw === 'ozon' || raw === 'oz') return 'Ozon';
    return 'Все площадки';
  }

  function normalizeItem(item = {}) {
    const diagnostics = item.diagnostics || {};
    return {
      ...item,
      articleKey: String(item.articleKey || item.article || item.id || '').trim(),
      article: String(item.article || item.articleKey || '').trim(),
      name: String(item.name || item.title || item.articleKey || item.article || 'SKU').trim(),
      owner: String(item.owner || 'Без owner').trim(),
      category: String(item.category || item.subject || 'Без категории').trim(),
      traffic: String(item.traffic || item.source || 'КЗ').trim(),
      reach: numberOrZero(item.reach),
      clicks: numberOrZero(item.clicks),
      carts: numberOrZero(item.carts),
      orders: numberOrZero(item.orders),
      buys: numberOrZero(item.buys),
      revenue: numberOrZero(item.revenue),
      income: numberOrZero(item.income),
      contentCost: numberOrZero(item.contentCost),
      ctrPct: numberOrNull(item.ctrPct) ?? ratio(item.clicks, item.reach),
      cartRatePct: numberOrNull(item.cartRatePct) ?? ratio(item.carts, item.clicks),
      orderRatePct: numberOrNull(item.orderRatePct) ?? ratio(item.orders, item.clicks),
      buyoutPct: numberOrNull(item.buyoutPct) ?? ratio(item.buys, item.orders),
      romiPct: numberOrNull(item.romiPct),
      drrPct: numberOrNull(item.drrPct),
      diagnosticCause: diagnostics.summary || diagnostics.alerts?.[0]?.label || diagnostics.highestSeverity || ''
    };
  }

  function summarizeItems(items = []) {
    const reach = sum(items, 'reach');
    const clicks = sum(items, 'clicks');
    const carts = sum(items, 'carts');
    const orders = sum(items, 'orders');
    const buys = sum(items, 'buys');
    const revenue = sum(items, 'revenue');
    const contentCost = sum(items, 'contentCost');
    const income = sum(items, 'income');
    const owners = new Set(items.map((item) => item.owner).filter(Boolean));
    return {
      skuCount: items.length,
      ownerCount: owners.size,
      reach,
      clicks,
      carts,
      orders,
      buys,
      revenue,
      contentCost,
      income,
      ctrPct: ratio(clicks, reach),
      cartRatePct: ratio(carts, clicks),
      orderRatePct: ratio(orders, clicks),
      buyRatePct: ratio(buys, clicks),
      buyoutPct: ratio(buys, orders),
      romiPct: contentCost ? income / contentCost : null,
      drrPct: revenue ? contentCost / revenue : null
    };
  }

  function normalizeSnapshot(snapshot = {}, source = 'history') {
    const rawItems = Array.isArray(snapshot.items) ? snapshot.items : [];
    const items = rawItems.map(normalizeItem).filter((item) => item.articleKey);
    const summary = { ...summarizeItems(items), ...(snapshot.summary || {}) };
    return {
      ...snapshot,
      source,
      weekLabel: snapshot.weekLabel || snapshot.sourceSheetName || snapshot.label || 'Срез',
      generatedAt: snapshot.generatedAt || '',
      items,
      summary
    };
  }

  function sourcePayload(name) {
    const state = appState();
    if (state.leaderboardMotionV2Sources?.[name]) return state.leaderboardMotionV2Sources[name];
    return state[name];
  }

  function sourceArray(name) {
    const payload = sourcePayload(name);
    return Array.isArray(payload) ? payload : [];
  }

  function snapshotStamp(snapshot = {}) {
    return String(snapshot.generatedAt || snapshot.weekLabel || snapshot.sourceSheetName || '');
  }

  function snapshotWeekKey(snapshot = {}) {
    return String(snapshot.weekLabel || snapshot.sourceSheetName || snapshot.generatedAt || '').trim().toLowerCase();
  }

  function snapshotSortStamp(snapshot = {}) {
    const stamp = String(snapshot.generatedAt || '').trim();
    const time = Date.parse(stamp);
    if (Number.isFinite(time)) return time;
    const label = String(snapshot.weekLabel || snapshot.sourceSheetName || '');
    const match = label.match(/(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})/);
    if (match) return Date.parse(`${match[6]}-${match[5]}-${match[4]}T12:00:00`);
    return 0;
  }

  function buildSnapshots() {
    const state = appState();
    const current = sourcePayload('productLeaderboard') || state.productLeaderboard || {};
    const primary = sourceArray('productLeaderboardHistory').length
      ? sourceArray('productLeaderboardHistory')
      : (Array.isArray(state.productLeaderboardHistory) ? state.productLeaderboardHistory : []);
    const fallback = sourceArray('productLeaderboardHistoryFallback');
    const candidates = [
      normalizeSnapshot(current, 'current'),
      ...primary.map((item) => normalizeSnapshot(item, 'primary_history'))
    ].filter((item) => item.items.length || item.weekLabel || item.generatedAt);
    if (candidates.filter((item) => item.items.length).length < 2) {
      fallback.forEach((item) => candidates.push(normalizeSnapshot(item, 'last_good_fallback')));
    }

    const byWeek = new Map();
    candidates.forEach((snapshot) => {
      const key = snapshotWeekKey(snapshot) || snapshotStamp(snapshot) || `snapshot-${byWeek.size}`;
      const existing = byWeek.get(key);
      if (!existing || snapshot.items.length > existing.items.length || snapshot.source === 'primary_history') {
        byWeek.set(key, snapshot);
      }
    });

    const sorted = Array.from(byWeek.values())
      .filter((snapshot) => snapshot.items.length)
      .sort((a, b) => snapshotSortStamp(b) - snapshotSortStamp(a));
    return sorted.map((snapshot, index) => ({
      ...snapshot,
      key: index === 0 ? 'latest' : snapshotStamp(snapshot) || snapshot.weekLabel || `snapshot-${index}`,
      label: snapshot.weekLabel || `Срез ${index + 1}`
    }));
  }

  function findSnapshot(snapshots, key, fallbackIndex = 0) {
    if (!snapshots.length) return null;
    if (!key || key === 'latest') return snapshots[0];
    return snapshots.find((snapshot) => snapshot.key === key || snapshotStamp(snapshot) === key || snapshot.weekLabel === key) || snapshots[fallbackIndex] || snapshots[0];
  }

  function defaultCompareKey(snapshots, current) {
    if (!snapshots.length) return '';
    const currentIndex = snapshots.findIndex((snapshot) => snapshot === current || snapshot.key === current?.key);
    const compare = snapshots[currentIndex + 1] || snapshots.find((snapshot) => snapshot.key !== current?.key);
    return compare?.key || '';
  }

  function signalForItem(item = {}, previous = null) {
    if (!item.owner || /без owner/i.test(item.owner)) return 'no_owner';
    if (numberOrZero(item.orders) <= 0 && numberOrZero(item.buys) <= 0) return 'no_sales';
    const delta = previous ? numberOrZero(item.orders) - numberOrZero(previous.orders) : 0;
    const severity = String(item.diagnostics?.highestSeverity || '').toLowerCase();
    if (severity === 'critical' || severity === 'high') return 'risk';
    if (delta > 0) return 'growth';
    if (numberOrZero(item.romiPct) >= 3 || numberOrZero(item.revenue) >= 1000000) return 'leader';
    return 'steady';
  }

  function compareRows(currentSnapshot, compareSnapshot) {
    const previousMap = new Map((compareSnapshot?.items || []).map((item) => [item.articleKey, item]));
    return (currentSnapshot?.items || []).map((item) => {
      const previous = previousMap.get(item.articleKey) || null;
      const orderDelta = numberOrZero(item.orders) - numberOrZero(previous?.orders);
      const revenueDelta = numberOrZero(item.revenue) - numberOrZero(previous?.revenue);
      return {
        ...item,
        currentItem: item,
        previousItem: previous,
        orderDelta,
        orderDeltaAbs: Math.abs(orderDelta),
        revenueDelta,
        signalKey: signalForItem(item, previous),
        cause: item.diagnosticCause || (orderDelta >= 0 ? 'Рост заказов / спроса' : 'Просадка заказов')
      };
    });
  }

  function filterRows(rows, filters) {
    const search = String(filters.search || '').trim().toLowerCase();
    return rows.filter((row) => {
      if (search && ![row.articleKey, row.article, row.name, row.owner, row.category, row.traffic].some((value) => String(value || '').toLowerCase().includes(search))) return false;
      if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
      if (filters.category !== 'all' && row.category !== filters.category) return false;
      if (filters.traffic !== 'all' && row.traffic !== filters.traffic) return false;
      if (filters.signal !== 'all' && row.signalKey !== filters.signal) return false;
      return true;
    });
  }

  function sortRows(rows, filters) {
    const key = filters.sort || 'orderDeltaAbs';
    const dir = filters.sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = key === 'name' ? String(a.name || '') : numberOrZero(a[key]);
      const bv = key === 'name' ? String(b.name || '') : numberOrZero(b[key]);
      if (typeof av === 'string') return av.localeCompare(String(bv), 'ru') * dir;
      return (av - bv) * dir;
    });
  }

  function uniqueValues(rows, key) {
    return Array.from(new Set(rows.map((row) => String(row[key] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'));
  }

  function signalLabel(key) {
    return {
      all: 'Все сигналы',
      leader: 'Лидеры',
      growth: 'Рост',
      steady: 'Стабильно',
      risk: 'Риск',
      no_owner: 'Без owner',
      no_sales: 'Без продаж'
    }[key] || key;
  }

  function mode() {
    const filters = getFilters();
    return ['metrics', 'substitutes', 'lfl'].includes(filters.expandedPanel) ? filters.expandedPanel : 'metrics';
  }

  function setMode(nextMode) {
    const filters = getFilters();
    filters.expandedPanel = ['metrics', 'substitutes', 'lfl'].includes(nextMode) ? nextMode : 'metrics';
    writeStorage(MODE_KEY, filters.expandedPanel);
  }

  function lflClass() {
    const value = getFilters().lflClass || readStorage(LFL_CLASS_KEY, 'all') || 'all';
    return ['all', 'comparable', 'new', 'discontinued'].includes(value) ? value : 'all';
  }

  function setLflClass(value) {
    const next = ['all', 'comparable', 'new', 'discontinued'].includes(value) ? value : 'all';
    getFilters().lflClass = next;
    writeStorage(LFL_CLASS_KEY, next);
  }

  function buildModel() {
    const snapshots = buildSnapshots();
    const filters = getFilters();
    const current = findSnapshot(snapshots, filters.snapshot, 0);
    if (current && filters.snapshot !== 'latest' && !snapshots.some((snapshot) => snapshot.key === filters.snapshot)) filters.snapshot = current.key;
    if (!filters.lflCurrentSnapshot) filters.lflCurrentSnapshot = filters.snapshot || 'latest';
    let compare = findSnapshot(snapshots, filters.lflCompareSnapshot, 1);
    if (!compare || compare.key === current?.key) {
      const nextKey = defaultCompareKey(snapshots, current);
      filters.lflCompareSnapshot = nextKey;
      compare = findSnapshot(snapshots, nextKey, 1);
    }
    const allRows = compareRows(current, compare);
    const filtered = sortRows(filterRows(allRows, filters), filters);
    const summary = summarizeItems(filtered);
    return {
      snapshots,
      filters,
      current,
      compare,
      allRows,
      rows: filtered,
      currentSummary: current?.summary || summarizeItems(current?.items || []),
      compareSummary: compare?.summary || summarizeItems(compare?.items || []),
      filteredSummary: summary,
      hasComparison: Boolean(current && compare && current.key !== compare.key),
      mode: mode(),
      marketplace: getGlobalMarketplace()
    };
  }

  function ensureStyle() {
    if (document.getElementById('altea-leaderboard-motion-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'altea-leaderboard-motion-v2-style';
    style.textContent = `
      .plb-motion-v2{--line:rgba(224,183,96,.17);--line2:rgba(255,255,255,.12);--surface:rgba(17,15,13,.76);--text:#fff6e2;--muted:rgba(255,246,226,.70);--faint:rgba(255,246,226,.48);--champ:#e5c16f;--ok:#72e6a0;--bad:#ff746f;--info:#69b9ff;--wb:#8ab7ff;color:var(--text);animation:plbV2Scene 240ms cubic-bezier(.2,.8,.2,1) both}
      .plb-motion-v2 *{box-sizing:border-box}
      .plb-v2-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:12px}
      .plb-v2-kicker{margin:0 0 7px;color:var(--champ);font-size:10px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}
      .plb-v2-title{margin:0;font:500 clamp(27px,3vw,42px)/1.04 Georgia,serif;letter-spacing:0}
      .plb-v2-lead{max-width:920px;margin:8px 0 0;color:var(--muted);font-size:12px;line-height:1.45}
      .plb-v2-head-side{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
      .plb-v2-head-actions{display:flex;justify-content:flex-end;gap:8px}
      .plb-v2-export-btn{min-width:126px}
      .plb-v2-badges{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}
      .plb-v2-badge{display:inline-flex;align-items:center;gap:7px;min-height:28px;padding:0 10px;border:1px solid var(--line);border-radius:999px;background:rgba(13,11,9,.82);color:var(--muted);font-size:10px;font-weight:850;white-space:nowrap}
      .plb-v2-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--champ);box-shadow:0 0 12px rgba(229,193,111,.45)}
      .plb-v2-weekbar{display:grid;grid-template-columns:minmax(340px,1fr) minmax(330px,.7fr);gap:10px;margin-bottom:10px}
      .plb-v2-week-compare,.plb-v2-week-tools{display:grid;grid-template-columns:minmax(140px,1fr) 28px minmax(140px,1fr);gap:7px;align-items:end;padding:12px;border:1px solid var(--line);border-radius:15px;background:rgba(15,13,11,.86)}
      .plb-v2-week-tools{grid-template-columns:repeat(3,minmax(0,1fr))}
      .plb-v2-field label{display:block;margin:0 0 6px;color:var(--faint);font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
      .plb-v2-control{width:100%;height:36px;border:1px solid var(--line);border-radius:10px;background:#0d0b09;color:var(--text);padding:0 10px;font-size:11px;outline:none}
      .plb-v2-versus{display:grid;place-items:center;height:36px;color:var(--champ);font:500 14px Georgia,serif}
      .plb-v2-mode-rail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:10px}
      .plb-v2-mode-card{--pc:var(--champ);position:relative;min-height:106px;padding:15px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.032),rgba(255,255,255,.012));overflow:hidden;text-align:left;color:var(--text);cursor:pointer;contain:layout paint;transition:transform 160ms cubic-bezier(.2,.8,.2,1),border-color 160ms,background 160ms}
      .plb-v2-mode-card::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--pc);opacity:.7}
      .plb-v2-mode-card::after{content:"";position:absolute;inset:-70% -15%;background:linear-gradient(110deg,transparent 38%,rgba(255,255,255,.075),transparent 62%);transform:translateX(-60%);opacity:0}
      .plb-v2-mode-card:hover,.plb-v2-mode-card:focus-visible{transform:translateY(-2px);border-color:var(--pc)}
      .plb-v2-mode-card.active{border-color:var(--pc);background:linear-gradient(135deg,rgba(229,193,111,.08),rgba(255,255,255,.014))}
      .plb-v2-mode-card.active::after{animation:plbV2Sweep 620ms cubic-bezier(.16,1,.3,1) both}
      .plb-v2-mode-card small{display:block;color:var(--muted);font-size:10px;font-weight:850;letter-spacing:.11em;text-transform:uppercase}
      .plb-v2-mode-card strong{display:block;margin-top:10px;font-size:24px;line-height:1.05}
      .plb-v2-mode-card p{margin:8px 0 0;color:var(--faint);font-size:11px;line-height:1.35}
      .plb-v2-mode-card .arrow{position:absolute;right:14px;top:13px;color:var(--pc);font-size:16px;transition:transform 160ms}
      .plb-v2-mode-card.active .arrow{transform:translateX(2px)}
      .plb-v2-toolbar{position:sticky;top:0;z-index:18;display:grid;grid-template-columns:minmax(260px,1.4fr) repeat(5,minmax(130px,.75fr)) auto;gap:8px;align-items:end;margin-bottom:10px;padding:12px;border:1px solid var(--line);border-radius:15px;background:rgba(13,11,9,.94);backdrop-filter:blur(16px)}
      .plb-v2-btn{height:36px;border:1px solid var(--line);border-radius:10px;background:#11100d;color:var(--muted);padding:0 12px;font-size:10px;font-weight:850;cursor:pointer}
      .plb-v2-btn.accent{background:linear-gradient(180deg,#f6dc9f,#bb8f42);color:#15100a;border-color:transparent}
      .plb-v2-stage{animation:plbV2Scene 240ms cubic-bezier(.2,.8,.2,1) both}
      .plb-v2-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(360px,.72fr);gap:10px}
      .plb-v2-panel{border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.012));box-shadow:inset 0 1px rgba(255,255,255,.025),0 18px 42px rgba(0,0,0,.14);overflow:hidden}
      .plb-v2-panel-head{display:flex;align-items:center;gap:10px;padding:14px 15px;border-bottom:1px solid var(--line)}
      .plb-v2-panel-head h3{margin:0;font:500 19px Georgia,serif;letter-spacing:0}
      .plb-v2-panel-head p{margin:4px 0 0;color:var(--faint);font-size:11px}
      .plb-v2-spacer{flex:1}
      .plb-v2-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:12px 15px}
      .plb-v2-mini{padding:12px;border:1px solid var(--line);border-radius:12px;background:#11100d}
      .plb-v2-mini small,.plb-v2-funnel-stage small{display:block;color:var(--faint);font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}
      .plb-v2-mini strong{display:block;margin-top:8px;font-size:19px}
      .plb-v2-mini span{display:block;margin-top:6px;color:var(--muted);font-size:10px}
      .plb-v2-chart{height:330px;padding:0 15px 12px}
      .plb-v2-chart svg{width:100%;height:100%;overflow:visible}
      .plb-v2-chart-hit{cursor:pointer;outline:none}
      .plb-v2-chart-hotspot{fill:transparent}
      .plb-v2-week-bar{transform-origin:bottom;animation:plbV2Bar 650ms cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--i)*48ms)}
      .plb-v2-chart-hit:hover .plb-v2-week-bar,.plb-v2-chart-hit:focus-visible .plb-v2-week-bar,.plb-v2-chart-hit.active .plb-v2-week-bar{filter:drop-shadow(0 0 11px rgba(229,193,111,.42))}
      .plb-v2-chart-hit:hover .plb-v2-chart-value,.plb-v2-chart-hit:focus-visible .plb-v2-chart-value{fill:#fff6e2}
      .plb-v2-chart-hit:focus-visible .plb-v2-chart-label{fill:#fff6e2}
      .plb-v2-chart-line{stroke:rgba(255,255,255,.08);stroke-width:1}
      .plb-v2-chart-label{fill:var(--faint);font-size:9px}
      .plb-v2-chart-value{fill:var(--text);font-size:10px;font-weight:800}
      .plb-v2-funnel{display:grid;grid-template-columns:repeat(6,minmax(94px,1fr));gap:8px;padding:0 15px 15px}
      .plb-v2-funnel-stage{--pc:var(--champ);position:relative;min-height:92px;padding:11px;border:1px solid var(--line);border-radius:12px;background:#11100d;overflow:hidden;animation:plbV2Funnel 520ms cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--i)*55ms)}
      .plb-v2-funnel-stage::after{content:"";position:absolute;left:0;bottom:0;width:var(--fill);height:3px;background:var(--pc);box-shadow:0 0 12px rgba(229,193,111,.35)}
      .plb-v2-funnel-stage strong{display:block;margin-top:10px;font-size:16px}
      .plb-v2-funnel-stage span{display:block;margin-top:7px;color:var(--muted);font-size:10px;line-height:1.25}
      .plb-v2-causes{padding:0 15px 14px}
      .plb-v2-cause{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 0;border-top:1px solid var(--line)}
      .plb-v2-cause i{display:grid;place-items:center;width:27px;height:27px;border:1px solid var(--line);border-radius:8px;color:var(--faint);font-style:normal;font-size:10px}
      .plb-v2-cause b{display:block;font-size:12px}.plb-v2-cause span{display:block;margin-top:4px;color:var(--faint);font-size:10px}
      .plb-v2-table-card{margin-top:10px}
      .plb-v2-table-wrap{overflow:auto;max-height:560px;border-top:1px solid var(--line);scrollbar-width:thin}
      .plb-v2-table{width:100%;min-width:1260px;border-collapse:collapse;font-size:11px}
      .plb-v2-table th,.plb-v2-table td{padding:10px 11px;border-bottom:1px solid var(--line);text-align:right;vertical-align:top;white-space:nowrap}
      .plb-v2-table th{position:sticky;top:0;z-index:4;background:#15120f;color:var(--faint);font-size:9px;letter-spacing:.06em;text-transform:uppercase}
      .plb-v2-table th:first-child,.plb-v2-table td:first-child{position:sticky;left:0;z-index:5;text-align:left;background:#15120f;max-width:310px;white-space:normal}
      .plb-v2-table tbody tr{content-visibility:auto;contain-intrinsic-size:54px;cursor:pointer}
      .plb-v2-table tbody tr:hover td{background:rgba(229,193,111,.055)}
      .plb-v2-row-title{display:block;font-weight:850;font-size:12px}.plb-v2-row-sub{display:block;margin-top:4px;color:var(--faint);font-size:10px}
      .plb-v2-delta-pos{color:var(--ok)!important}.plb-v2-delta-neg{color:var(--bad)!important}
      .plb-v2-sub-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.58fr);gap:10px}
      .plb-v2-sub-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:14px}
      .plb-v2-map{padding:14px}.plb-v2-map-node{padding:12px;border:1px solid var(--line);border-radius:12px;background:#11100d}.plb-v2-map-arrow{text-align:center;color:var(--champ);margin:8px 0}
      .plb-v2-lfl-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}
      .plb-v2-lfl-tile{--pc:var(--champ);padding:14px;border:1px solid var(--line);border-radius:15px;background:#11100d;color:var(--text);text-align:left;cursor:pointer;transition:transform 160ms,border 160ms}
      .plb-v2-lfl-tile:hover{transform:translateY(-2px)}.plb-v2-lfl-tile.active{border-color:var(--pc);box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}
      .plb-v2-lfl-tile small{display:block;color:var(--faint);font-size:9px;font-weight:850;text-transform:uppercase}.plb-v2-lfl-tile strong{display:block;margin-top:8px;color:var(--pc);font-size:23px}.plb-v2-lfl-tile p{margin:6px 0 0;color:var(--muted);font-size:10px}
      .plb-v2-drawer-back{position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.62);display:flex;justify-content:flex-end;align-items:flex-start;padding:72px 16px 16px;opacity:0;pointer-events:none;transition:opacity 240ms cubic-bezier(.2,.8,.2,1)}
      .plb-v2-drawer-back.open{opacity:1;pointer-events:auto}
      .plb-v2-drawer{position:relative;width:min(590px,94vw);height:min(760px,calc(100vh - 96px));max-height:calc(100vh - 96px);padding:22px;background:#0e0d0b;border:1px solid var(--line);border-radius:18px 0 0 18px;box-shadow:0 26px 90px rgba(0,0,0,.56);transform:translateX(110%);transition:transform 240ms cubic-bezier(.16,1,.3,1);overflow:auto}
      .plb-v2-drawer-back.open .plb-v2-drawer{transform:none}
      .plb-v2-drawer h2{font:500 27px Georgia,serif;margin:0}.plb-v2-drawer p{color:var(--muted);font-size:12px;line-height:1.45}
      .plb-v2-drawer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}
      .plb-v2-empty{padding:18px;border:1px dashed var(--line2);border-radius:15px;background:rgba(255,255,255,.02);color:var(--muted);font-size:12px;line-height:1.45}
      @keyframes plbV2Scene{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @keyframes plbV2Sweep{0%{opacity:0;transform:translateX(-58%)}30%{opacity:1}100%{opacity:0;transform:translateX(58%)}}
      @keyframes plbV2Bar{from{transform:scaleY(.05);opacity:.12}to{transform:scaleY(1);opacity:1}}
      @keyframes plbV2Funnel{from{opacity:0;transform:translateY(7px) scaleX(.96)}to{opacity:1;transform:none}}
      @media(max-width:1350px){.plb-v2-weekbar,.plb-v2-grid,.plb-v2-sub-grid{grid-template-columns:1fr}.plb-v2-toolbar{grid-template-columns:1fr 1fr 1fr}.plb-v2-funnel{grid-template-columns:repeat(3,1fr)}.plb-v2-lfl-tiles{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:920px){.plb-v2-head{align-items:flex-start;flex-direction:column}.plb-v2-head-side{align-items:flex-start}.plb-v2-mode-rail{grid-template-columns:1fr}.plb-v2-week-compare,.plb-v2-week-tools,.plb-v2-toolbar{position:static;grid-template-columns:1fr}.plb-v2-versus{display:none}.plb-v2-funnel{grid-template-columns:repeat(2,1fr)}.plb-v2-sub-summary,.plb-v2-kpis,.plb-v2-lfl-tiles{grid-template-columns:1fr}.plb-v2-table th:first-child,.plb-v2-table td:first-child{position:static}}
      @media(prefers-reduced-motion:reduce){.plb-motion-v2 *,.plb-motion-v2 *::before,.plb-motion-v2 *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    `;
    document.head.appendChild(style);
  }

  function loadSources(rootId) {
    const state = appState();
    if (state.leaderboardMotionV2Promise) return state.leaderboardMotionV2Promise;
    const fetchJson = (url) => fetch(`${url}?v=${encodeURIComponent(VERSION)}`, { cache: 'no-cache' })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    state.leaderboardMotionV2Promise = Promise.all(Object.entries(SOURCE_FILES).map(([key, url]) => fetchJson(url).then((data) => [key, data])))
      .then((entries) => {
        state.leaderboardMotionV2Sources = Object.fromEntries(entries.filter(([, data]) => data));
        if (!state.productLeaderboard && state.leaderboardMotionV2Sources.productLeaderboard) state.productLeaderboard = state.leaderboardMotionV2Sources.productLeaderboard;
        if (!state.productLeaderboardHistory && Array.isArray(state.leaderboardMotionV2Sources.productLeaderboardHistory)) state.productLeaderboardHistory = state.leaderboardMotionV2Sources.productLeaderboardHistory;
        if (!state.wbSubstitutionTraffic && state.leaderboardMotionV2Sources.wbSubstitutionTraffic) state.wbSubstitutionTraffic = state.leaderboardMotionV2Sources.wbSubstitutionTraffic;
        if (!state.wbSubstitutionTrafficHistory && Array.isArray(state.leaderboardMotionV2Sources.wbSubstitutionTrafficHistory)) state.wbSubstitutionTrafficHistory = state.leaderboardMotionV2Sources.wbSubstitutionTrafficHistory;
        const root = document.getElementById(rootId);
        if (root?.dataset.leaderboardMotionV2 === 'loading') renderProductLeaderboardV2(rootId);
      });
    return state.leaderboardMotionV2Promise;
  }

  function optionsHtml(options, selected, allLabel = null) {
    const all = allLabel === null ? '' : `<option value="all" ${selected === 'all' ? 'selected' : ''}>${escapeHtml(allLabel)}</option>`;
    return `${all}${options.map((option) => `<option value="${escapeHtml(option.key ?? option)}" ${(option.key ?? option) === selected ? 'selected' : ''}>${escapeHtml(option.label ?? option)}</option>`).join('')}`;
  }

  function snapshotOptionsHtml(snapshots, selected) {
    return snapshots.map((snapshot) => `<option value="${escapeHtml(snapshot.key)}" ${snapshot.key === selected || (selected === 'latest' && snapshot.key === 'latest') ? 'selected' : ''}>${escapeHtml(snapshot.label)}</option>`).join('');
  }

  function buildModeRail(model) {
    const sub = substitutionPayload();
    const lfl = lflModel(model);
    const values = {
      metrics: fmtMoney(model.currentSummary.revenue),
      substitutes: fmtInt(sub.summary.orders),
      lfl: `${lfl.total >= 0 ? '+' : ''}${fmtInt(lfl.total)}`
    };
    const hints = {
      metrics: `${fmtInt(model.rows.length)} позиций · воронка · причины`,
      substitutes: `${fmtInt(sub.articles.length)} SKU · кто и что наторговал`,
      lfl: 'сопоставимые + новые − выбывшие'
    };
    return `
      <div class="plb-v2-mode-rail" role="tablist" aria-label="Режим лидерборда">
        ${Object.entries(MODE_META).map(([key, meta]) => `
          <button type="button" class="plb-v2-mode-card ${model.mode === key ? 'active' : ''}" data-plb-v2-mode="${key}" role="tab" aria-selected="${model.mode === key ? 'true' : 'false'}" style="--pc:${meta.tone}">
            <span class="arrow">→</span>
            <small>${meta.number} · ${escapeHtml(meta.label)}</small>
            <strong>${escapeHtml(values[key])}</strong>
            <p>${escapeHtml(hints[key])}</p>
          </button>
        `).join('')}
      </div>
    `;
  }

  function buildToolbar(model) {
    const allRows = model.allRows;
    const owners = uniqueValues(allRows, 'owner');
    const categories = uniqueValues(allRows, 'category');
    const traffic = uniqueValues(allRows, 'traffic');
    const signalOptions = ['leader', 'growth', 'steady', 'risk', 'no_owner', 'no_sales'].map((key) => ({ key, label: signalLabel(key) }));
    const sortOptions = [
      ['orderDeltaAbs', 'Вклад в изменение'],
      ['orders', 'Заказы'],
      ['reach', 'Охваты'],
      ['clicks', 'Клики'],
      ['carts', 'Корзины'],
      ['buys', 'Выкупы'],
      ['revenue', 'Выручка'],
      ['romiPct', 'ROMI'],
      ['drrPct', 'ДРР']
    ].map(([key, label]) => ({ key, label }));
    return `
      <div class="plb-v2-toolbar">
        <div class="plb-v2-field"><label>Поиск по всем позициям</label><input id="plbV2Search" class="plb-v2-control" data-plb-v2-filter="search" value="${escapeHtml(model.filters.search)}" placeholder="SKU, товар, owner..."></div>
        <div class="plb-v2-field"><label>Owner</label><select id="plbV2Owner" class="plb-v2-control" data-plb-v2-filter="owner">${optionsHtml(owners, model.filters.owner, 'Все owner')}</select></div>
        <div class="plb-v2-field"><label>Категория</label><select id="plbV2Category" class="plb-v2-control" data-plb-v2-filter="category">${optionsHtml(categories, model.filters.category, 'Все категории')}</select></div>
        <div class="plb-v2-field"><label>Источник</label><select id="plbV2Traffic" class="plb-v2-control" data-plb-v2-filter="traffic">${optionsHtml(traffic, model.filters.traffic, 'Все источники')}</select></div>
        <div class="plb-v2-field"><label>Сигнал</label><select id="plbV2Signal" class="plb-v2-control" data-plb-v2-filter="signal">${optionsHtml(signalOptions, model.filters.signal, 'Все сигналы')}</select></div>
        <div class="plb-v2-field"><label>Сортировка</label><select id="plbV2Sort" class="plb-v2-control" data-plb-v2-filter="sort">${optionsHtml(sortOptions, model.filters.sort)}</select></div>
        <button type="button" class="plb-v2-btn accent" data-plb-v2-reset>Сбросить</button>
      </div>
    `;
  }

  function buildWeekControls(model) {
    return `
      <div class="plb-v2-weekbar">
        <div class="plb-v2-week-compare">
          <div class="plb-v2-field"><label>Текущая неделя</label><select id="plbV2CurrentWeek" class="plb-v2-control" data-plb-v2-week-control="current">${snapshotOptionsHtml(model.snapshots, model.current?.key || 'latest')}</select></div>
          <div class="plb-v2-versus">к</div>
          <div class="plb-v2-field"><label>Сравнить с</label><select id="plbV2CompareWeek" class="plb-v2-control" data-plb-v2-week-control="compare">${snapshotOptionsHtml(model.snapshots, model.compare?.key || '')}</select></div>
        </div>
        <div class="plb-v2-week-tools">
          ${[
            ['orders', 'Заказы'],
            ['revenue', 'Выручка'],
            ['reach', 'Охваты']
          ].map(([key, label]) => `<button class="plb-v2-btn ${model.filters.weeklyMetric === key ? 'accent' : ''}" type="button" data-plb-v2-weekly="${key}">${escapeHtml(label)}</button>`).join('')}
        </div>
      </div>
    `;
  }

  function metricValue(snapshot, metric) {
    const summary = snapshot?.summary || {};
    return numberOrZero(summary[metric]);
  }

  function chartHtml(model) {
    const metric = model.filters.weeklyMetric || 'orders';
    const values = model.snapshots.slice().reverse().map((snapshot) => ({
      snapshot,
      value: metricValue(snapshot, metric)
    }));
    const max = Math.max(...values.map((item) => item.value), 1);
    const width = 780;
    const height = 300;
    const padX = 36;
    const padY = 34;
    const step = values.length > 1 ? (width - padX * 2) / values.length : width - padX * 2;
    const metricFmt = metric === 'revenue' ? fmtMoney : fmtInt;
    const bars = values.map((item, index) => {
      const barH = Math.max(4, (item.value / max) * (height - padY * 2));
      const x = padX + index * step + step * 0.24;
      const y = height - padY - barH;
      const barW = step * 0.52;
      const barCenter = x + barW / 2;
      const hitX = Math.max(padX, x - step * 0.12);
      const hitW = Math.min(step * 0.76, width - padX - hitX);
      const active = item.snapshot.key === model.current?.key;
      const snapshotKey = String(item.snapshot.key || '');
      const weekLabel = shortWeek(item.snapshot.label);
      return `
        <g class="plb-v2-chart-hit ${active ? 'active' : ''}" role="button" tabindex="0" aria-pressed="${active ? 'true' : 'false'}" aria-label="Select week ${escapeHtml(weekLabel)}" data-plb-v2-week-snapshot="${escapeHtml(snapshotKey)}">
          <rect class="plb-v2-chart-hotspot" x="${hitX.toFixed(1)}" y="${padY}" width="${hitW.toFixed(1)}" height="${(height - padY * 1.2).toFixed(1)}" rx="12"></rect>
          <rect class="plb-v2-week-bar" style="--i:${index}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="9" fill="${active ? '#e5c16f' : 'rgba(229,193,111,.42)'}"></rect>
          <text class="plb-v2-chart-value" x="${barCenter.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle">${escapeHtml(metricFmt(item.value))}</text>
          <text class="plb-v2-chart-label" x="${barCenter.toFixed(1)}" y="${height - 9}" text-anchor="middle">${escapeHtml(weekLabel)}</text>
        </g>
      `;
    }).join('');
    return `
      <div class="plb-v2-chart">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Недельная динамика">
          ${[0, 1, 2, 3].map((i) => `<line class="plb-v2-chart-line" x1="${padX}" x2="${width - padX}" y1="${padY + i * 58}" y2="${padY + i * 58}"></line>`).join('')}
          ${bars}
        </svg>
      </div>
    `;
  }

  function selectSnapshotFromChart(snapshotKey, rootId) {
    const key = String(snapshotKey || '');
    if (!key) return;
    const filters = getFilters();
    filters.snapshot = key;
    filters.lflCurrentSnapshot = key;
    if (filters.lflCompareSnapshot === key) filters.lflCompareSnapshot = '';
    renderProductLeaderboardV2(rootId);
  }

  function shortWeek(label = '') {
    const match = String(label).match(/(\d{2}\.\d{2}).*?(\d{2}\.\d{2})/);
    return match ? `${match[1]}–${match[2]}` : String(label).slice(0, 12);
  }

  function funnelHtml(summary) {
    const stages = [
      ['Охваты', summary.reach, null, '#e5c16f'],
      ['Клики', summary.clicks, summary.ctrPct, '#69b9ff'],
      ['Корзины', summary.carts, summary.cartRatePct, '#72e6a0'],
      ['Заказы', summary.orders, summary.orderRatePct, '#ffd45f'],
      ['Выкупы', summary.buys, summary.buyoutPct, '#ff93bf'],
      ['Выручка', summary.revenue, summary.drrPct, '#b889ff']
    ];
    const max = Math.max(...stages.map(([, value]) => Math.abs(numberOrZero(value))), 1);
    return `
      <div class="plb-v2-funnel">
        ${stages.map(([label, value, pct, tone], index) => `
          <div class="plb-v2-funnel-stage" style="--i:${index};--pc:${tone};--fill:${Math.max(4, Math.min(100, Math.abs(numberOrZero(value)) / max * 100)).toFixed(2)}%">
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(label === 'Выручка' ? fmtMoney(value) : fmtInt(value))}</strong>
            <span>${pct === null ? 'верх воронки' : fmtPct(pct)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function causesHtml(rows) {
    return `
      <div class="plb-v2-causes">
        ${rows.slice(0, 6).map((row, index) => `
          <div class="plb-v2-cause">
            <i>${index + 1}</i>
            <div><b>${escapeHtml(row.name)}</b><span>${escapeHtml(row.cause)} · ${escapeHtml(row.owner)} · ${escapeHtml(row.traffic)}</span></div>
            <strong class="${row.orderDelta >= 0 ? 'plb-v2-delta-pos' : 'plb-v2-delta-neg'}">${row.orderDelta >= 0 ? '+' : ''}${fmtInt(row.orderDelta)}</strong>
          </div>
        `).join('') || '<div class="plb-v2-empty">Нет строк после фильтров.</div>'}
      </div>
    `;
  }

  function deltaText(value, type = 'int') {
    const prefix = numberOrZero(value) >= 0 ? '+' : '';
    const formatted = type === 'money' ? fmtMoney(value) : fmtInt(value);
    return `${prefix}${formatted}`;
  }

  function positionRowsTable(rows, title, subtitle = '') {
    return `
      <article class="plb-v2-panel plb-v2-table-card">
        <div class="plb-v2-panel-head">
          <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle || 'Полный отфильтрованный список, не top-N.')}</p></div>
          <div class="plb-v2-spacer"></div>
          <span class="plb-v2-badge">${fmtInt(rows.length)} строк</span>
        </div>
        <div class="plb-v2-table-wrap">
          <table class="plb-v2-table">
            <thead><tr><th>SKU</th><th>Owner</th><th>Охваты</th><th>Клики</th><th>Корзины</th><th>Заказы</th><th>Δ заказов</th><th>Выкупы</th><th>Выручка</th><th>ROMI</th><th>ДРР</th><th>Причина</th></tr></thead>
            <tbody>
              ${rows.map((row) => `
                <tr data-plb-v2-row="${escapeHtml(row.articleKey)}">
                  <td><span class="plb-v2-row-title">${escapeHtml(row.name)}</span><span class="plb-v2-row-sub">${escapeHtml(row.articleKey)} · ${escapeHtml(row.category)}</span></td>
                  <td>${escapeHtml(row.owner)}</td>
                  <td>${fmtInt(row.reach)}</td>
                  <td>${fmtInt(row.clicks)}<span class="plb-v2-row-sub">CTR ${fmtPct(row.ctrPct)}</span></td>
                  <td>${fmtInt(row.carts)}<span class="plb-v2-row-sub">${fmtPct(row.cartRatePct)}</span></td>
                  <td>${fmtInt(row.orders)}<span class="plb-v2-row-sub">${fmtPct(row.orderRatePct)}</span></td>
                  <td class="${row.orderDelta >= 0 ? 'plb-v2-delta-pos' : 'plb-v2-delta-neg'}">${row.orderDelta >= 0 ? '+' : ''}${fmtInt(row.orderDelta)}</td>
                  <td>${fmtInt(row.buys)}<span class="plb-v2-row-sub">${fmtPct(row.buyoutPct)}</span></td>
                  <td>${fmtMoney(row.revenue)}</td>
                  <td>${fmtPct(row.romiPct)}</td>
                  <td>${fmtPct(row.drrPct)}</td>
                  <td>${escapeHtml(row.cause || signalLabel(row.signalKey))}</td>
                </tr>
              `).join('') || '<tr><td colspan="12">Нет строк после фильтров</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  function excelCell(value) {
    return escapeHtml(value ?? '').replace(/\n/g, '<br>');
  }

  function exportDateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function downloadHtmlTable(filename, title, headers, rows) {
    const table = `
      <html>
        <head><meta charset="utf-8"></head>
        <body>
          <table border="1">
            <caption>${excelCell(title)}</caption>
            <thead><tr>${headers.map((header) => `<th>${excelCell(header)}</th>`).join('')}</tr></thead>
            <tbody>
              ${rows.map((row) => `<tr>${row.map((cell) => `<td>${excelCell(cell)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([`\ufeff${table}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function exportMetricRows(model) {
    const headers = ['SKU', 'Артикул', 'Owner', 'Категория', 'Источник', 'Охваты', 'Клики', 'CTR', 'Корзины', 'Заказы', 'Δ заказов', 'Выкупы', 'Выручка', 'ROMI', 'ДРР', 'Сигнал', 'Причина'];
    const rows = model.rows.map((row) => [
      row.name,
      row.articleKey,
      row.owner,
      row.category,
      row.traffic,
      numberOrZero(row.reach),
      numberOrZero(row.clicks),
      fmtPct(row.ctrPct),
      numberOrZero(row.carts),
      numberOrZero(row.orders),
      numberOrZero(row.orderDelta),
      numberOrZero(row.buys),
      numberOrZero(row.revenue),
      fmtPct(row.romiPct),
      fmtPct(row.drrPct),
      signalLabel(row.signalKey),
      row.cause || ''
    ]);
    return { headers, rows, title: 'Продуктовый лидерборд - все позиции' };
  }

  function exportSubstitutionRows(model) {
    const sub = substitutionPayload();
    const articleIndex = currentArticleMetricIndex(model);
    const rows = filterSubstitutions(model, sub.articles).map((row) => {
      const sales = canonicalSalesMetrics(row, articleIndex);
      return [
        row.articleKey,
        row.title || row.name || row.article,
        row.owner || 'Без owner',
        numberOrZero(row.views),
        numberOrZero(row.carts),
        numberOrZero(row.orders),
        numberOrZero(row.favorites),
        numberOrZero(sales.buys),
        numberOrZero(sales.revenue),
        fmtPct(row.cartRate),
        fmtPct(row.orderRate),
        numberOrZero(row.campaignCount),
        (row.topSubstitutions || []).slice(0, 8).map((item) => `${item.label || item.key}: ${fmtInt(item.orders)}`).join(' | ')
      ];
    });
    return {
      headers: ['SKU', 'Название', 'Owner', 'Просмотры', 'Корзины', 'Заказы', 'Избранное', 'Выкупы', 'Выручка', 'Cart CR', 'Order CR', 'Кампании', 'Top подменники'],
      rows,
      title: 'Продуктовый лидерборд - WB подменники'
    };
  }

  function exportLflRows(model) {
    const lfl = lflModel(model);
    const currentClass = lflClass();
    let rows = lfl.available ? (currentClass === 'all' ? lfl.rows : lfl.groups[currentClass] || []) : [];
    rows = sortRows(filterRows(rows, model.filters), model.filters);
    return {
      headers: ['SKU', 'Артикул', 'Owner', 'Класс', 'Категория', 'Источник', 'Заказы сейчас', 'Заказы было', 'Δ заказов', 'Охваты Δ', 'Клики Δ', 'Корзины Δ', 'Выкупы Δ', 'Выручка Δ', 'Причина'],
      rows: rows.map((row) => [
        row.name,
        row.articleKey,
        row.owner,
        row.lflClass,
        row.category,
        row.traffic,
        numberOrZero(row.currentItem?.orders ?? (row.lflClass === 'discontinued' ? 0 : row.orders)),
        numberOrZero(row.previousItem?.orders),
        numberOrZero(row.orderDelta),
        numberOrZero(lflMetricDelta(row, 'reach')),
        numberOrZero(lflMetricDelta(row, 'clicks')),
        numberOrZero(lflMetricDelta(row, 'carts')),
        numberOrZero(lflMetricDelta(row, 'buys')),
        numberOrZero(lflMetricDelta(row, 'revenue')),
        row.cause || ''
      ]),
      title: 'Продуктовый лидерборд - изменение по сопоставимым SKU'
    };
  }

  function exportProductLeaderboard(model) {
    const exportData = model.mode === 'substitutes'
      ? exportSubstitutionRows(model)
      : model.mode === 'lfl'
        ? exportLflRows(model)
        : exportMetricRows(model);
    const modeName = model.mode || 'metrics';
    downloadHtmlTable(`product-leaderboard-${modeName}-${exportDateStamp()}.xls`, exportData.title, exportData.headers, exportData.rows);
  }

  function renderMetrics(model) {
    return `
      <div class="plb-v2-stage">
        <div class="plb-v2-grid">
          <article class="plb-v2-panel">
            <div class="plb-v2-panel-head">
              <div><h3>Недельная динамика</h3><p>${escapeHtml(model.current?.label || 'текущая неделя')} к ${escapeHtml(model.compare?.label || 'сравнение недоступно')}</p></div>
              <div class="plb-v2-spacer"></div>
              <span class="plb-v2-badge">${model.hasComparison ? 'сравнение активно' : 'сравнение недоступно'}</span>
            </div>
            ${chartHtml(model)}
          </article>
          <article class="plb-v2-panel">
            <div class="plb-v2-panel-head"><div><h3>Причины изменения</h3><p>Сортировка по вкладу SKU в изменение заказов.</p></div></div>
            ${causesHtml(model.rows)}
          </article>
        </div>
        <article class="plb-v2-panel" style="margin-top:10px">
          <div class="plb-v2-panel-head"><div><h3>Полная воронка</h3><p>Reach → clicks → carts → orders → buys → revenue.</p></div></div>
          ${funnelHtml(model.filteredSummary)}
        </article>
        ${positionRowsTable(model.rows, 'Все позиции', 'Все отфильтрованные SKU доступны в таблице и в detail drawer.')}
      </div>
    `;
  }

  function substitutionPayload() {
    const payload = sourcePayload('wbSubstitutionTraffic') || appState().wbSubstitutionTraffic || {};
    const articles = Array.isArray(payload.articles) ? payload.articles : [];
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const summary = payload.summary || {
      articleCount: articles.length,
      rowCount: rows.length,
      views: sum(articles, 'views'),
      carts: sum(articles, 'carts'),
      orders: sum(articles, 'orders'),
      favorites: sum(articles, 'favorites'),
      orderRate: ratio(sum(articles, 'orders'), sum(articles, 'views')),
      cartRate: ratio(sum(articles, 'carts'), sum(articles, 'views'))
    };
    return { payload, articles, rows, summary };
  }

  function filterSubstitutions(model, articles) {
    const filters = model.filters;
    const search = String(filters.search || '').trim().toLowerCase();
    return articles.filter((row) => {
      if (search && ![row.articleKey, row.article, row.title, row.name, row.owner, ...(row.topSubstitutions || []).map((item) => item.label || item.key)].some((value) => String(value || '').toLowerCase().includes(search))) return false;
      if (filters.owner !== 'all' && row.owner !== filters.owner) return false;
      return true;
    }).sort((a, b) => numberOrZero(b.orders) - numberOrZero(a.orders));
  }

  function currentArticleMetricIndex(model) {
    const rows = model.current?.items || model.allRows || [];
    return new Map(rows.map((row) => [String(row.articleKey || row.article || '').toLowerCase(), row]).filter(([key]) => key));
  }

  function canonicalSalesMetrics(row, articleIndex) {
    const key = String(row.articleKey || row.article || row.sellerArticle || '').toLowerCase();
    const current = articleIndex.get(key) || null;
    return current
      ? { buys: current.buys, revenue: current.revenue, source: 'product_leaderboard' }
      : { buys: null, revenue: null, source: 'нет источника' };
  }

  function sourcedMetricCell(value, type, source) {
    const formatter = type === 'money' ? fmtMoney : fmtInt;
    const text = numberOrNull(value) === null ? '—' : formatter(value);
    return `${escapeHtml(text)}<span class="plb-v2-row-sub">${escapeHtml(source || 'нет источника')}</span>`;
  }

  function renderSubstitutes(model) {
    const sub = substitutionPayload();
    const rows = filterSubstitutions(model, sub.articles);
    const articleIndex = currentArticleMetricIndex(model);
    return `
      <div class="plb-v2-stage">
        <div class="plb-v2-sub-grid">
          <article class="plb-v2-panel">
            <div class="plb-v2-panel-head"><div><h3>WB подменные артикулы</h3><p>Каноническая позиция, owner и главный подменный артикул.</p></div></div>
            <div class="plb-v2-sub-summary">
              <div class="plb-v2-mini"><small>SKU</small><strong>${fmtInt(sub.summary.articleCount || rows.length)}</strong><span>канонических</span></div>
              <div class="plb-v2-mini"><small>Подменников</small><strong>${fmtInt(sub.summary.substitutionArticleCount || sub.summary.rowCount)}</strong><span>строк источника</span></div>
              <div class="plb-v2-mini"><small>Просмотры</small><strong>${fmtInt(sub.summary.views)}</strong><span>cart ${fmtPct(sub.summary.cartRate)}</span></div>
              <div class="plb-v2-mini"><small>Заказы</small><strong>${fmtInt(sub.summary.orders)}</strong><span>CR ${fmtPct(sub.summary.orderRate)}</span></div>
            </div>
          </article>
          <article class="plb-v2-panel plb-v2-map">
            <h3>Как читается связь</h3>
            <div class="plb-v2-map-node"><small>Подменный артикул WB</small><strong>WW / nm / campaign row</strong></div>
            <div class="plb-v2-map-arrow">↓</div>
            <div class="plb-v2-map-node"><small>Каноническая позиция</small><strong>articleKey + owner</strong></div>
            <div class="plb-v2-map-arrow">↓</div>
            <div class="plb-v2-map-node"><small>Результат</small><strong>просмотры · корзины · заказы · CR</strong></div>
          </article>
        </div>
        <article class="plb-v2-panel plb-v2-table-card">
          <div class="plb-v2-panel-head">
            <div><h3>Все подменники</h3><p>Полная таблица 61 канонического SKU. Выкупы и выручка подтягиваются по каноническому articleKey из текущего product_leaderboard.</p></div>
            <div class="plb-v2-spacer"></div><span class="plb-v2-badge">${fmtInt(rows.length)} строк</span>
          </div>
          <div class="plb-v2-table-wrap">
            <table class="plb-v2-table">
              <thead><tr><th>Подменник → SKU</th><th>Owner</th><th>Просмотры</th><th>Корзины</th><th>Заказы</th><th>Избранное</th><th>Выкупы</th><th>Выручка</th><th>Cart CR</th><th>Order CR</th><th>Кампании</th><th>Связь</th></tr></thead>
              <tbody>
                ${rows.map((row) => {
                  const top = (row.topSubstitutions || [])[0] || {};
                  const topLabel = top.label || top.key || 'нет top';
                  const sales = canonicalSalesMetrics(row, articleIndex);
                  return `
                    <tr data-plb-v2-sub="${escapeHtml(row.articleKey)}">
                      <td><span class="plb-v2-row-title">${escapeHtml(topLabel)} → ${escapeHtml(row.articleKey)}</span><span class="plb-v2-row-sub">${escapeHtml(row.title || row.name || row.article)}</span></td>
                      <td>${escapeHtml(row.owner || 'Без owner')}</td>
                      <td>${fmtInt(row.views)}</td>
                      <td>${fmtInt(row.carts)}</td>
                      <td>${fmtInt(row.orders)}</td>
                      <td>${fmtInt(row.favorites)}</td>
                      <td>${sourcedMetricCell(sales.buys, 'int', sales.source)}</td>
                      <td>${sourcedMetricCell(sales.revenue, 'money', sales.source)}</td>
                      <td>${fmtPct(row.cartRate)}</td>
                      <td>${fmtPct(row.orderRate)}</td>
                      <td>${fmtInt(row.campaignCount)}</td>
                      <td>${escapeHtml((row.topSubstitutions || []).slice(0, 3).map((item) => `${item.label || item.key}: ${fmtInt(item.orders)}`).join(' · ') || 'нет трафика')}</td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="12">Нет строк после фильтров</td></tr>'}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    `;
  }

  function lflModel(model) {
    const current = model.current || findSnapshot(model.snapshots, model.filters.lflCurrentSnapshot || model.filters.snapshot, 0);
    const compare = model.compare || findSnapshot(model.snapshots, model.filters.lflCompareSnapshot, 1);
    if (!current || !compare || current.key === compare.key) {
      return { available: false, rows: [], groups: { comparable: [], new: [], discontinued: [] }, values: { comparable: 0, new: 0, discontinued: 0 }, total: 0 };
    }
    const currentMap = new Map(current.items.map((item) => [item.articleKey, item]));
    const compareMap = new Map(compare.items.map((item) => [item.articleKey, item]));
    const rows = [];
    current.items.forEach((item) => {
      const previous = compareMap.get(item.articleKey);
      if (previous) {
        const orderDelta = numberOrZero(item.orders) - numberOrZero(previous.orders);
        rows.push({ ...item, previousItem: previous, lflClass: 'comparable', orderDelta, orderDeltaAbs: Math.abs(orderDelta), cause: orderDelta >= 0 ? 'Сопоставимый SKU вырос' : 'Сопоставимый SKU просел', signalKey: signalForItem(item, previous) });
      } else {
        rows.push({ ...item, previousItem: null, lflClass: 'new', orderDelta: numberOrZero(item.orders), orderDeltaAbs: Math.abs(numberOrZero(item.orders)), cause: 'Новый SKU в текущей неделе', signalKey: 'growth' });
      }
    });
    compare.items.forEach((item) => {
      if (currentMap.has(item.articleKey)) return;
      rows.push({ ...item, currentItem: null, previousItem: item, lflClass: 'discontinued', orderDelta: -numberOrZero(item.orders), orderDeltaAbs: Math.abs(numberOrZero(item.orders)), cause: 'SKU был в сравнительной неделе и выбыл', signalKey: 'risk' });
    });
    const groups = {
      comparable: rows.filter((row) => row.lflClass === 'comparable'),
      new: rows.filter((row) => row.lflClass === 'new'),
      discontinued: rows.filter((row) => row.lflClass === 'discontinued')
    };
    const values = {
      comparable: sum(groups.comparable, 'orderDelta'),
      new: sum(groups.new, 'orders'),
      discontinued: sum(groups.discontinued, 'orderDelta')
    };
    const total = values.comparable + values.new + values.discontinued;
    return { available: true, current, compare, rows, groups, values, total };
  }

  function lflMetricDelta(row = {}, key) {
    const current = row.currentItem || (row.lflClass === 'discontinued' ? null : row);
    const previous = row.previousItem || null;
    return numberOrZero(current?.[key]) - numberOrZero(previous?.[key]);
  }

  function summarizeLflDeltas(rows = []) {
    const summary = {};
    ['reach', 'clicks', 'carts', 'orders', 'buys', 'revenue', 'contentCost', 'income'].forEach((key) => {
      summary[key] = rows.reduce((total, row) => total + lflMetricDelta(row, key), 0);
    });
    return {
      ...summary,
      ctrPct: null,
      cartRatePct: null,
      orderRatePct: null,
      buyoutPct: null,
      drrPct: null
    };
  }

  function renderLfl(model) {
    const lfl = lflModel(model);
    if (!lfl.available) {
      return `<div class="plb-v2-empty">Сравнение недоступно: нет двух полных недельных снимков. Медиана портала не используется как фальшивая предыдущая неделя.</div>`;
    }
    const currentClass = lflClass();
    let rows = currentClass === 'all' ? lfl.rows : lfl.groups[currentClass] || [];
    rows = filterRows(rows, model.filters);
    rows = sortRows(rows, model.filters);
    const bridgeSummary = summarizeLflDeltas(rows);
    const tiles = [
      ['all', 'Итого', lfl.total, lfl.rows.length, '#e5c16f'],
      ['comparable', 'Сопоставимые SKU', lfl.values.comparable, lfl.groups.comparable.length, '#72e6a0'],
      ['new', 'Новые SKU', lfl.values.new, lfl.groups.new.length, '#69b9ff'],
      ['discontinued', 'Выбывшие SKU', lfl.values.discontinued, lfl.groups.discontinued.length, '#ff746f']
    ];
    return `
      <div class="plb-v2-stage">
        <div class="plb-v2-lfl-tiles">
          ${tiles.map(([key, label, value, count, tone]) => `
            <button type="button" class="plb-v2-lfl-tile ${currentClass === key ? 'active' : ''}" data-plb-v2-lfl="${key}" style="--pc:${tone}">
              <small>${escapeHtml(label)}</small>
              <strong>${numberOrZero(value) >= 0 ? '+' : ''}${fmtInt(value)}</strong>
              <p>${fmtInt(count)} позиций</p>
            </button>
          `).join('')}
        </div>
        <article class="plb-v2-panel">
          <div class="plb-v2-panel-head">
            <div><h3>Мост изменения заказов</h3><p>Общее изменение = сопоставимые SKU + новые SKU − выбывшие SKU.</p></div>
            <div class="plb-v2-spacer"></div>
            <span class="plb-v2-badge">${escapeHtml(lfl.current.label)} к ${escapeHtml(lfl.compare.label)}</span>
          </div>
          ${funnelHtml(bridgeSummary)}
        </article>
        ${positionRowsTable(rows, 'Все позиции Like-for-like', 'Фильтрованные comparable/new/discontinued строки.')}
      </div>
    `;
  }

  function renderStage(model) {
    if (model.mode === 'substitutes') return renderSubstitutes(model);
    if (model.mode === 'lfl') return renderLfl(model);
    return renderMetrics(model);
  }

  function drawerHtml() {
    return '';
  }

  function ensureDrawer() {
    document.querySelectorAll('[data-plb-v2-drawer-back]:not([data-plb-v2-global-drawer-back])').forEach((node) => node.remove());
    let drawerBack = document.querySelector('[data-plb-v2-global-drawer-back]');
    if (!drawerBack) {
      drawerBack = document.createElement('div');
      drawerBack.className = 'plb-motion-v2 plb-v2-drawer-back';
      drawerBack.setAttribute('data-plb-v2-drawer-back', '');
      drawerBack.setAttribute('data-plb-v2-global-drawer-back', '');
      drawerBack.innerHTML = '<aside class="plb-v2-drawer" data-plb-v2-drawer tabindex="-1"></aside>';
      drawerBack.addEventListener('click', (event) => {
        const target = event.target;
        if (target === drawerBack || target.closest?.('[data-plb-v2-close-drawer]')) closeDrawer();
      });
      document.body.appendChild(drawerBack);
    }
    return {
      drawerBack,
      drawer: drawerBack.querySelector('[data-plb-v2-drawer]')
    };
  }

  function closeDrawer() {
    const drawerBack = document.querySelector('[data-plb-v2-global-drawer-back]');
    drawerBack?.classList.remove('open');
    const savedScroll = Number(window.__plbV2DrawerScrollY);
    if (Number.isFinite(savedScroll) && Math.abs((window.scrollY || 0) - savedScroll) > 2) {
      window.scrollTo({ top: savedScroll, behavior: 'auto' });
    }
  }

  function openDrawerWithContent(content) {
    window.__plbV2DrawerScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const { drawerBack, drawer } = ensureDrawer();
    if (!drawerBack || !drawer) return;
    drawer.innerHTML = content;
    drawer.scrollTop = 0;
    drawerBack.classList.add('open');
    requestAnimationFrame(() => drawer.focus({ preventScroll: true }));
  }

  function detailMetrics(row) {
    return [
      ['Охваты', fmtInt(row.reach)],
      ['Клики', fmtInt(row.clicks)],
      ['Корзины', fmtInt(row.carts)],
      ['Заказы', fmtInt(row.orders)],
      ['Δ заказов', `${row.orderDelta >= 0 ? '+' : ''}${fmtInt(row.orderDelta)}`],
      ['Выкупы', fmtInt(row.buys)],
      ['Выручка', fmtMoney(row.revenue)],
      ['CTR', fmtPct(row.ctrPct)],
      ['Cart CR', fmtPct(row.cartRatePct)],
      ['Order CR', fmtPct(row.orderRatePct)],
      ['Buyout', fmtPct(row.buyoutPct)],
      ['ROMI', fmtPct(row.romiPct)],
      ['ДРР', fmtPct(row.drrPct)],
      ['Контент', fmtMoney(row.contentCost)]
    ];
  }

  function openSkuDrawer(root, model, articleKey) {
    const row = [...model.allRows, ...lflModel(model).rows].find((item) => item.articleKey === articleKey);
    if (!row) return;
    openDrawerWithContent(`
      <h2>${escapeHtml(row.name)}</h2>
      <p>${escapeHtml(row.articleKey)} · ${escapeHtml(row.owner)} · ${escapeHtml(row.category)} · ${escapeHtml(row.traffic)}</p>
      <div class="plb-v2-drawer-grid">
        ${detailMetrics(row).map(([label, value]) => `<div class="plb-v2-mini"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('')}
      </div>
      <p><b>Неделя к неделе:</b> ${row.orderDelta >= 0 ? '+' : ''}${fmtInt(row.orderDelta)} заказов. Причина: ${escapeHtml(row.cause || 'сигнал не указан')}. Предыдущая неделя: ${fmtInt(row.previousItem?.orders)} заказов.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="plb-v2-btn accent" type="button" data-plb-v2-close-drawer>Закрыть</button></div>
    `);
  }

  function openSubDrawer(root, articleKey) {
    const sub = substitutionPayload();
    const row = sub.articles.find((item) => item.articleKey === articleKey);
    if (!row) return;
    const sales = canonicalSalesMetrics(row, currentArticleMetricIndex(buildModel()));
    openDrawerWithContent(`
      <h2>${escapeHtml(row.title || row.name || row.articleKey)}</h2>
      <p>${escapeHtml(row.articleKey)} · ${escapeHtml(row.owner || 'Без owner')} · ${fmtInt(row.substitutionCount)} подменников</p>
      <div class="plb-v2-drawer-grid">
        ${[
          ['Просмотры', fmtInt(row.views)],
          ['Корзины', fmtInt(row.carts)],
          ['Заказы', fmtInt(row.orders)],
          ['Избранное', fmtInt(row.favorites)],
          ['Выкупы', fmtInt(sales.buys)],
          ['Выручка', fmtMoney(sales.revenue)],
          ['Cart CR', fmtPct(row.cartRate)],
          ['Order CR', fmtPct(row.orderRate)],
          ['Кампании', fmtInt(row.campaignCount)],
          ['Источники трафика', fmtInt(row.trafficSourceCount)]
        ].map(([label, value]) => `<div class="plb-v2-mini"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('')}
      </div>
      <p><b>Top подменники:</b> ${escapeHtml((row.topSubstitutions || []).slice(0, 8).map((item) => `${item.label || item.key}: ${fmtInt(item.orders)} заказов`).join(' · ') || 'нет трафика')}.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="plb-v2-btn accent" type="button" data-plb-v2-close-drawer>Закрыть</button></div>
    `);
  }

  function renderSkeleton(root) {
    root.dataset.leaderboardMotionV2 = 'loading';
    root.innerHTML = `<section class="plb-motion-v2"><div class="plb-v2-empty">Подключаю фактические источники лидерборда v2. Демо-цифры из макета не используются.</div></section>`;
  }

  function renderProductLeaderboardV2(rootId = 'view-product-leaderboard') {
    if (rootId === 'view-ads-funnel' && typeof window.renderAdsFunnel === 'function') {
      window.renderAdsFunnel(rootId);
      return;
    }
    const root = document.getElementById(rootId);
    if (!root) return;
    ensureStyle();
    const state = appState();
    const hasProduct = state.productLeaderboard || sourcePayload('productLeaderboard') || (Array.isArray(state.productLeaderboardHistory) && state.productLeaderboardHistory.length);
    const hasSub = state.wbSubstitutionTraffic || sourcePayload('wbSubstitutionTraffic');
    if (!hasProduct || !hasSub) {
      renderSkeleton(root);
      loadSources(rootId);
      return;
    }
    const model = buildModel();
    if (!model.current) {
      renderSkeleton(root);
      loadSources(rootId);
      return;
    }
    const warnings = [];
    if (model.snapshots.length < 2) warnings.push('сравнение недоступно: нет двух полных недельных снимков');
    if (model.snapshots.length < 8) warnings.push(`истории ${fmtInt(model.snapshots.length)} недель; контракт просит 8–12 для надежной динамики`);

    root.dataset.leaderboardMotionV2 = 'ready';
    root.dataset.productLeaderboardVersion = 'motion-v2';
    root.innerHTML = `
      <section class="plb-motion-v2" data-leaderboard-motion-version="${escapeHtml(VERSION)}">
        <div class="plb-v2-head">
          <div>
            <p class="plb-v2-kicker">ALTEA · LEADERBOARD MOTION V2</p>
            <h2 class="plb-v2-title">Продуктовый лидерборд</h2>
            <p class="plb-v2-lead">КЗ, подменники WB и изменение по сопоставимым SKU. Фильтры, текущая/сравнительная недели и полные таблицы сохранены.</p>
          </div>
          <div class="plb-v2-head-side">
            <div class="plb-v2-head-actions">
              <button type="button" class="plb-v2-btn accent plb-v2-export-btn" data-plb-v2-export>Выгрузить Excel</button>
            </div>
            <div class="plb-v2-badges">
              <span class="plb-v2-badge">площадка из шапки: ${escapeHtml(model.marketplace)}</span>
              <span class="plb-v2-badge">${fmtInt(model.snapshots.length)} недель</span>
              <span class="plb-v2-badge">${fmtInt(model.rows.length)} строк</span>
            </div>
          </div>
        </div>
        ${buildWeekControls(model)}
        ${buildModeRail(model)}
        ${buildToolbar(model)}
        ${warnings.length ? `<div class="plb-v2-empty" style="margin-bottom:10px">${warnings.map(escapeHtml).join(' · ')}</div>` : ''}
        <div data-plb-v2-stage>${renderStage(model)}</div>
        ${drawerHtml()}
      </section>
    `;
    bindEvents(root, rootId);
  }

  function applyWeekControl(control, rootId) {
    const kind = control?.getAttribute?.('data-plb-v2-week-control') || '';
    if (!kind) return false;
    const filters = getFilters();
    if (kind === 'current') {
      filters.snapshot = control.value || 'latest';
      filters.lflCurrentSnapshot = filters.snapshot;
      if (filters.lflCompareSnapshot === filters.snapshot) filters.lflCompareSnapshot = '';
    } else if (kind === 'compare') {
      filters.lflCompareSnapshot = control.value || '';
    } else {
      return false;
    }
    renderProductLeaderboardV2(rootId);
    return true;
  }

  function applyFilterControl(control, rootId) {
    const key = control?.getAttribute?.('data-plb-v2-filter') || '';
    if (!key) return false;
    const filters = getFilters();
    if (key === 'search') {
      filters.search = control.value || '';
    } else if (key === 'sort') {
      filters.sort = control.value || 'orderDeltaAbs';
    } else {
      filters[key] = control.value || 'all';
    }
    renderProductLeaderboardV2(rootId);
    return true;
  }

  function bindDirectControls(root, rootId) {
    root.querySelectorAll('[data-plb-v2-filter]').forEach((control) => {
      const key = control.getAttribute('data-plb-v2-filter');
      if (key === 'search') {
        control.oninput = (event) => {
          event.stopPropagation();
          clearTimeout(searchDebounce);
          searchDebounce = setTimeout(() => applyFilterControl(control, rootId), 90);
        };
      } else {
        control.onchange = (event) => {
          event.stopPropagation();
          applyFilterControl(control, rootId);
        };
      }
    });
    root.querySelectorAll('[data-plb-v2-week-control]').forEach((control) => {
      control.onchange = (event) => {
        event.stopPropagation();
        applyWeekControl(control, rootId);
      };
    });
  }

  function bindEvents(root, rootId) {
    root.onclick = (event) => {
      const target = event.target;
      const modeButton = target.closest?.('[data-plb-v2-mode]');
      if (modeButton) {
        setMode(modeButton.getAttribute('data-plb-v2-mode'));
        renderProductLeaderboardV2(rootId);
        return;
      }
      const weeklyButton = target.closest?.('[data-plb-v2-weekly]');
      if (weeklyButton) {
        getFilters().weeklyMetric = weeklyButton.getAttribute('data-plb-v2-weekly') || 'orders';
        renderProductLeaderboardV2(rootId);
        return;
      }
      const weekBar = target.closest?.('[data-plb-v2-week-snapshot]');
      if (weekBar) {
        selectSnapshotFromChart(weekBar.getAttribute('data-plb-v2-week-snapshot'), rootId);
        return;
      }
      const exportButton = target.closest?.('[data-plb-v2-export]');
      if (exportButton) {
        exportProductLeaderboard(buildModel());
        return;
      }
      const resetButton = target.closest?.('[data-plb-v2-reset]');
      if (resetButton) {
        const filters = getFilters();
        Object.assign(filters, { search: '', owner: 'all', category: 'all', traffic: 'all', signal: 'all', lflClass: 'all' });
        writeStorage(LFL_CLASS_KEY, 'all');
        renderProductLeaderboardV2(rootId);
        return;
      }
      const lflButton = target.closest?.('[data-plb-v2-lfl]');
      if (lflButton) {
        setLflClass(lflButton.getAttribute('data-plb-v2-lfl'));
        renderProductLeaderboardV2(rootId);
        return;
      }
      const row = target.closest?.('[data-plb-v2-row]');
      if (row) {
        openSkuDrawer(root, buildModel(), row.getAttribute('data-plb-v2-row'));
        return;
      }
      const subRow = target.closest?.('[data-plb-v2-sub]');
      if (subRow) {
        openSubDrawer(root, subRow.getAttribute('data-plb-v2-sub'));
        return;
      }
      const close = target.closest?.('[data-plb-v2-close-drawer]');
      if (close) {
        closeDrawer();
        return;
      }
      const back = target.closest?.('[data-plb-v2-drawer-back]');
      if (back && target === back) {
        closeDrawer();
      }
    };

    root.onkeydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target;
      const weekBar = target.closest?.('[data-plb-v2-week-snapshot]');
      if (!weekBar) return;
      event.preventDefault();
      selectSnapshotFromChart(weekBar.getAttribute('data-plb-v2-week-snapshot'), rootId);
    };

    root.onchange = (event) => {
      const target = event.target;
      if (applyWeekControl(target, rootId)) return;
      applyFilterControl(target, rootId);
    };

    root.oninput = (event) => {
      const target = event.target;
      if (target.getAttribute?.('data-plb-v2-filter') !== 'search') return;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        applyFilterControl(target, rootId);
      }, 90);
    };

    bindDirectControls(root, rootId);
  }

  function rerenderIfActive() {
    const root = document.getElementById('view-product-leaderboard');
    const routeActive = (location.hash || '').includes('product-leaderboard') || root?.offsetParent !== null;
    if (root && routeActive) renderProductLeaderboardV2('view-product-leaderboard');
  }

  window.renderProductLeaderboard = renderProductLeaderboardV2;
  try { globalThis.renderProductLeaderboard = renderProductLeaderboardV2; } catch (_) {}
  window.AlteaLeaderboardMotionV2 = { render: renderProductLeaderboardV2, version: VERSION };

  document.addEventListener('altea:marketplacechange', rerenderIfActive);
  window.addEventListener('hashchange', rerenderIfActive);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rerenderIfActive, { once: true });
  } else {
    rerenderIfActive();
  }
})();
