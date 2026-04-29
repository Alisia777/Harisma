(function () {
  if (window.__ALTEA_DASHBOARD_INTERACTIVE_20260429F__) return;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260429F__ = true;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260429E__ = true;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260429D__ = true;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260429C__ = true;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260429B__ = true;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260429A__ = true;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260428F__ = true;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260428D__ = true;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260428C__ = true;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260428B__ = true;
  window.__ALTEA_DASHBOARD_INTERACTIVE_20260428A__ = true;

  const VERSION = '20260429f';
  const STYLE_ID = 'altea-dashboard-interactive-20260429f';
  const ROOT_ID = 'portalDashboardExecutiveRoot';
  const DASHBOARD_VIEW_ID = 'view-dashboard';
  const ADS_VIEW_ID = 'view-ads-funnel';
  const ADS_ROOT_ID = 'portalAdsFunnelRoot';
  const ADS_STYLE_ID = 'altea-dashboard-interactive-ads-20260429f';
  const ADS_MANAGEMENT_STYLE_ID = 'portalDashboardAdsManagementStyles';
  const MODAL_ID = 'portalDashboardExecutiveModal';
  const PLATFORM_KEYS = ['all', 'wb', 'ozon', 'ya'];
  const PRESET_KEYS = ['yesterday', '7', 'prevweek', '14', '30'];
  const DASHBOARD_SIGNAL_THRESHOLDS = {
    priceShockWarnPct: 0.10,
    priceShockDangerPct: 0.20,
    funnelDropWarnPct: 0.25,
    funnelDropDangerPct: 0.40,
    ctrDropWarnPct: 0.20,
    ctrDropDangerPct: 0.35,
    minAdsOrdersForCompare: 5,
    minAdsRevenueForCompare: 5000
  };
  const cache = {
    dashboard: null,
    platformTrends: null,
    platformPlan: null,
    adsSummary: null,
    skus: null,
    prices: null,
    pricesFetched: null,
    productLeaderboard: null,
    smartPriceWorkbench: null,
    smartPriceWorkbenchBase: null,
    smartPriceWorkbenchLive: null,
    smartPriceOverlay: null,
    priceWorkbenchSupport: null,
    orderProcurement: null
  };
  let applyTimer = 0;
  let dashboardBootPrimed = false;
  let adsItemSeriesIndexStamp = '';
  let adsItemSeriesIndex = new Map();

  function syncChrome() {
    document.title = 'Дом бренда Алтея · v8.7.1 Imperial';
    const brandTitle = document.querySelector('.sidebar .brand-title');
    if (brandTitle) brandTitle.textContent = 'Дом бренда Алтея';
    const brandSub = document.querySelector('.sidebar .brand-sub');
    if (brandSub) brandSub.textContent = 'Рабочий контур бренда и решений.';
    const h1 = document.querySelector('.topbar h1, main h1, .app-main h1, .content h1');
    if (h1) h1.textContent = 'Дом бренда Алтея';
    const footer = document.querySelector('.sidebar-foot.compact-sidebar-foot');
    if (footer) footer.style.display = 'none';
  }

  const stateRef = () => (typeof state === 'object' && state ? state : null);
  const current = (key) => {
    const app = stateRef();
    return (app && app[key]) || cache[key] || null;
  };
  const cloneJson = (value) => {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };
  const CP1251_EXTENDED_CHARS =
    '\u0402\u0403\u201a\u0453\u201e\u2026\u2020\u2021\u20ac\u2030\u0409\u2039\u040a\u040c\u040b\u040f'
    + '\u0452\u2018\u2019\u201c\u201d\u2022\u2013\u2014\ufffd\u2122\u0459\u203a\u045a\u045c\u045b\u045f'
    + '\u00a0\u040e\u045e\u0408\u00a4\u0490\u00a6\u00a7\u0401\u00a9\u0404\u00ab\u00ac\u00ad\u00ae\u0407'
    + '\u00b0\u00b1\u0406\u0456\u0491\u00b5\u00b6\u00b7\u0451\u2116\u0454\u00bb\u0458\u0405\u0455\u0457'
    + '\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f'
    + '\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f'
    + '\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f'
    + '\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f';
  const countMojibakeMarkers = (value) => {
    let count = 0;
    for (const char of String(value || '')) {
      const code = char.charCodeAt(0);
      if ((code >= 0x402 && code <= 0x40F) || (code >= 0x452 && code <= 0x45F)) count += 1;
    }
    return count;
  };
  const countRussianLetters = (value) => {
    let count = 0;
    for (const char of String(value || '')) {
      const code = char.charCodeAt(0);
      if (code === 0x401 || code === 0x451 || (code >= 0x410 && code <= 0x44F)) count += 1;
    }
    return count;
  };
  const encodeCp1251Bytes = (value) => {
    const bytes = [];
    for (const char of String(value || '')) {
      const code = char.charCodeAt(0);
      if (code <= 0x7F) {
        bytes.push(code);
        continue;
      }
      const index = CP1251_EXTENDED_CHARS.indexOf(char);
      if (index === -1) return null;
      bytes.push(index + 0x80);
    }
    return bytes;
  };
  const repairBrokenUtf8Cp1251String = (value) => {
    if (typeof value !== 'string' || !value) return value;
    try {
      const bytes = encodeCp1251Bytes(value);
      if (!bytes) return value;
      const repaired = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
      if (!repaired || repaired === value) return value;
      const markerBefore = countMojibakeMarkers(value);
      const markerAfter = countMojibakeMarkers(repaired);
      const russianBefore = countRussianLetters(value);
      const russianAfter = countRussianLetters(repaired);
      if (markerAfter < markerBefore || (markerBefore > 0 && russianAfter >= russianBefore - markerBefore)) {
        return repaired;
      }
    } catch {
      return value;
    }
    return value;
  };
  const esc = (value) => {
    const safeValue = repairBrokenUtf8Cp1251String(String(value ?? ''));
    if (typeof escapeHtml === 'function') return escapeHtml(safeValue);
    return safeValue
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  };
  const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const firstPositive = (...values) => {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  };
  const avg = (values) => {
    const numbers = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
    return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
  };
  const int = (value) => {
    if (typeof fmt === 'object' && fmt && typeof fmt.int === 'function') return fmt.int(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(num(value)));
  };
  const pct = (value) => {
    if (typeof fmt === 'object' && fmt && typeof fmt.pct === 'function') return fmt.pct(value);
    return `${(num(value) * 100).toFixed(1)}%`;
  };
  const money = (value) => {
    if (typeof formatMoney === 'function') return formatMoney(value);
    return `${int(value)} ₽`;
  };
  const badgeHtml = (text, tone = '') => {
    if (typeof badge === 'function') return badge(text, tone);
    return `<span class="portal-exec-chip ${tone}">${esc(text)}</span>`;
  };
  const shortPlatformLabel = (key) => ({
    all: 'Все площадки',
    wb: 'WB',
    ozon: 'Ozon',
    ya: 'ЯМ / сети'
  })[key] || key.toUpperCase();
  const parseDate = (value) => {
    if (!value) return null;
    const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(result.getTime()) ? null : result;
  };
  const cleanDate = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date, offset) => {
    const next = cleanDate(date);
    next.setDate(next.getDate() + offset);
    return next;
  };
  const iso = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const shortDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
  };
  const longDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  };
  const rangeLabel = (start, end) => {
    if (!(start instanceof Date) || !(end instanceof Date)) return 'нет дат';
    if (start.getTime() === end.getTime()) return shortDate(start);
    return `${shortDate(start)} — ${shortDate(end)}`;
  };
  const dayCount = (start, end) => {
    if (!(start instanceof Date) || !(end instanceof Date)) return 0;
    return Math.max(0, Math.round((cleanDate(end) - cleanDate(start)) / 86400000)) + 1;
  };
  const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const startOfWeek = (date) => {
    const currentDay = cleanDate(date);
    const day = currentDay.getDay() || 7;
    return addDays(currentDay, 1 - day);
  };
  const toneCompletion = (value) => (num(value) >= 1 ? 'ok' : num(value) >= 0.85 ? 'warn' : 'danger');
  const toneMargin = (value) => (num(value) >= 0.65 ? 'ok' : num(value) >= 0.45 ? 'warn' : 'danger');
  const toneDrr = (value) => (num(value) <= 0.15 ? 'ok' : num(value) <= 0.22 ? 'warn' : 'danger');

  function repricerPayloadRows(payload) {
    return Array.isArray(payload?.rows) ? payload.rows : [];
  }

  function repricerPayloadStamp(payload) {
    const stamp = Date.parse(String(payload?.generatedAt || '').trim());
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function chooseDashboardRepricerRows() {
    const basePayload = current('repricer') || null;
    const livePayload = current('repricerLive') || null;
    const baseRows = repricerPayloadRows(basePayload);
    const liveRows = repricerPayloadRows(livePayload);
    if (liveRows.length && repricerPayloadStamp(livePayload) >= repricerPayloadStamp(basePayload)) return liveRows;
    return baseRows.length ? baseRows : liveRows;
  }

  function findDashboardRepricerSide(articleKey, platformKey) {
    const wanted = normalizeKey(articleKey);
    if (!wanted || (platformKey !== 'wb' && platformKey !== 'ozon')) return null;
    const row = chooseDashboardRepricerRows().find((item) => normalizeKey(item?.articleKey || item?.article || item?.sku) === wanted) || null;
    return row && row[platformKey] && typeof row[platformKey] === 'object' ? row[platformKey] : null;
  }

  function repricerResolvedPrice(articleKey, platformKey, fallback = 0) {
    const side = findDashboardRepricerSide(articleKey, platformKey);
    if (!side) return num(fallback);
    let price = firstPositive(side.finalPrice, side.recommendedPrice, side.recPrice);
    if (!(price > 0)) return num(fallback);
    const floor = Math.max(
      firstPositive(side.effectiveFloor),
      firstPositive(side.hardFloor),
      firstPositive(side.economicFloor),
      firstPositive(side.minPrice),
      firstPositive(side.finalGuardFloor)
    );
    const cap = firstPositive(side.finalGuardCap, side.capPrice, side.upperCap, side.workingZoneTo);
    if (cap > 0 && !(floor > 0 && cap + 0.001 < floor) && price > cap + 0.001) price = cap;
    if (floor > 0 && price + 0.001 < floor) price = floor;
    return price > 0 ? price : num(fallback);
  }

  function anchorDate() {
    return parseDate(current('dashboard')?.dataFreshness?.asOfDate)
      || parseDate(current('platformTrends')?.generatedAt)
      || parseDate(current('dashboard')?.generatedAt)
      || new Date();
  }

  function resolveSeriesDate(point, anchor) {
    if (!point) return null;
    const direct = parseDate(point.date) || parseDate(point.label);
    if (direct) return direct;
    const offset = Number.isFinite(Number(point.dayOffset)) ? Number(point.dayOffset) : NaN;
    if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime()) || !Number.isFinite(offset)) return null;
    return addDays(anchor, -offset);
  }

  function platformSeries(platformKey, anchor) {
    const record = (current('platformTrends')?.platforms || []).find((item) => item.key === platformKey);
    return (record?.series || [])
      .map((point) => ({
        date: resolveSeriesDate(point, anchor),
        units: num(point?.units),
        revenue: num(point?.revenue),
        margin: num(point?.estimatedMargin)
      }))
      .filter((point) => point.date instanceof Date && !Number.isNaN(point.date.getTime()))
      .sort((left, right) => left.date - right.date);
  }

  function adsSeries(platformKey, anchor) {
    const record = (current('adsSummary')?.platforms || []).find((item) => {
      const raw = String(item?.key || item?.label || '').trim().toLowerCase();
      if (platformKey === 'wb') return raw.includes('wb') || raw.includes('wild');
      if (platformKey === 'ozon') return raw.includes('ozon');
      if (platformKey === 'ya') return raw.includes('market') || raw.includes('маркет') || raw === 'ya';
      return raw === 'all' || raw.includes('все');
    });
    return (record?.series || [])
      .map((point) => ({
        date: resolveSeriesDate(point, anchor),
        views: num(point?.views),
        clicks: num(point?.clicks),
        spend: num(point?.spend),
        orders: num(point?.orders),
        revenue: num(point?.revenue)
      }))
      .filter((point) => point.date instanceof Date && !Number.isNaN(point.date.getTime()))
      .sort((left, right) => left.date - right.date);
  }

  function adsItemRowsIndexMap() {
    const payload = current('adsSummary') || {};
    const stamp = String(payload?.generatedAt || payload?.asOfDate || '').trim();
    if (stamp === adsItemSeriesIndexStamp && adsItemSeriesIndex.size) return adsItemSeriesIndex;
    adsItemSeriesIndexStamp = stamp;
    adsItemSeriesIndex = new Map();
    (payload?.itemSeries || []).forEach((item) => {
      const platformKey = normalizeKey(item?.platformKey);
      const articleKey = normalizeKey(item?.articleKey || item?.offerId || item?.offer_id);
      const date = parseDate(item?.date);
      if (!platformKey || !articleKey || !(date instanceof Date) || Number.isNaN(date.getTime())) return;
      const key = `${platformKey}::${articleKey}`;
      if (!adsItemSeriesIndex.has(key)) adsItemSeriesIndex.set(key, []);
      adsItemSeriesIndex.get(key).push({
        date,
        views: num(item?.views),
        clicks: num(item?.clicks),
        spend: num(item?.spend),
        orders: num(item?.orders),
        revenue: num(item?.revenue)
      });
    });
    adsItemSeriesIndex.forEach((items) => items.sort((left, right) => left.date - right.date));
    return adsItemSeriesIndex;
  }

  function adsRowsForArticle(platformKey, articleKey) {
    if (!platformKey || !articleKey) return [];
    const map = adsItemRowsIndexMap();
    return map.get(`${normalizeKey(platformKey)}::${normalizeKey(articleKey)}`) || [];
  }

  function aggregateAdsRows(rows, start, end) {
    const items = (rows || []).filter((item) => item.date >= start && item.date <= end);
    const views = items.reduce((sum, item) => sum + num(item?.views), 0);
    const clicks = items.reduce((sum, item) => sum + num(item?.clicks), 0);
    const spend = items.reduce((sum, item) => sum + num(item?.spend), 0);
    const orders = items.reduce((sum, item) => sum + num(item?.orders), 0);
    const revenue = items.reduce((sum, item) => sum + num(item?.revenue), 0);
    return {
      views,
      clicks,
      spend,
      orders,
      revenue,
      ctr: views > 0 ? clicks / views : null,
      drr: revenue > 0 ? spend / revenue : null
    };
  }

  function rowsForPlatform(payload, platformKey) {
    const platforms = payload?.platforms || {};
    const collect = (key, sourceKey = key) => {
      const rows = Array.isArray(platforms[key]?.rows) ? platforms[key].rows : [];
      return rows.map((row) => ({
        ...row,
        platformKey: sourceKey,
        platformLabel: shortPlatformLabel(sourceKey)
      }));
    };
    if (platformKey === 'all') return ['wb', 'ozon', 'ym'].flatMap((key) => collect(key, key === 'ym' ? 'ya' : key));
    if (platformKey === 'ya') return collect('ym', 'ya');
    return collect(platformKey, platformKey);
  }

  function mergeDashboardPriceRow(priceRow = {}, workbenchRow = {}) {
    const next = {
      ...(priceRow || {}),
      ...(workbenchRow || {})
    };
    const currentPrice = [
      workbenchRow?.currentFillPrice,
      workbenchRow?.currentPrice,
      priceRow?.currentPrice,
      priceRow?.currentFillPrice
    ].map((value) => Number(value)).find((value) => Number.isFinite(value) && value > 0);
    if (currentPrice) {
      next.currentPrice = currentPrice;
      if (!(Number(next.currentFillPrice) > 0)) next.currentFillPrice = currentPrice;
    }
    const currentClientPrice = [
      workbenchRow?.currentClientPrice,
      priceRow?.currentClientPrice
    ].map((value) => Number(value)).find((value) => Number.isFinite(value) && value > 0);
    if (currentClientPrice) next.currentClientPrice = currentClientPrice;
    const currentTurnoverDays = [
      workbenchRow?.currentTurnoverDays,
      workbenchRow?.turnoverCurrentDays,
      workbenchRow?.turnoverDays,
      priceRow?.currentTurnoverDays,
      priceRow?.turnoverDays
    ].map((value) => Number(value)).find((value) => Number.isFinite(value));
    if (Number.isFinite(currentTurnoverDays)) {
      next.currentTurnoverDays = currentTurnoverDays;
      if (!Number.isFinite(Number(next.turnoverDays))) next.turnoverDays = currentTurnoverDays;
    }
    if (Array.isArray(workbenchRow?.daily) && workbenchRow.daily.length) next.daily = cloneJson(workbenchRow.daily);
    else if (Array.isArray(priceRow?.daily) && priceRow.daily.length) next.daily = cloneJson(priceRow.daily);
    if (Array.isArray(workbenchRow?.monthly) && workbenchRow.monthly.length) next.monthly = cloneJson(workbenchRow.monthly);
    else if (Array.isArray(priceRow?.monthly) && priceRow.monthly.length) next.monthly = cloneJson(priceRow.monthly);
    next.platformKey = workbenchRow?.platformKey || priceRow?.platformKey || next.platformKey;
    next.platformLabel = workbenchRow?.platformLabel || priceRow?.platformLabel || next.platformLabel;
    return next;
  }

  function priceRowsForPlatform(platformKey) {
    const priceRows = rowsForPlatform(current('prices'), platformKey);
    const workbenchRows = rowsForPlatform(current('smartPriceWorkbench'), platformKey);
    if (!workbenchRows.length) return priceRows;
    const priceMap = new Map();
    priceRows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      if (!key || priceMap.has(key)) return;
      priceMap.set(key, row);
    });
    const mergedRows = [];
    const used = new Set();
    workbenchRows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      const priceRow = key ? priceMap.get(key) : null;
      if (key) used.add(key);
      mergedRows.push(mergeDashboardPriceRow(priceRow, row));
    });
    priceRows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      if (key && used.has(key)) return;
      mergedRows.push(row);
    });
    return mergedRows;
  }

  function supportPlatformKey(platformKey) {
    return platformKey === 'ya' ? 'ym' : platformKey;
  }

  function supportRowForArticle(platformKey, article) {
    const rows = current('priceWorkbenchSupport')?.platforms?.[supportPlatformKey(platformKey)]?.rows;
    if (!rows || typeof rows !== 'object' || !article) return null;
    if (rows[article]) return rows[article];
    const target = normalizeKey(article);
    const matchKey = Object.keys(rows).find((key) => normalizeKey(key) === target);
    if (matchKey && rows[matchKey]) return rows[matchKey];
    return Object.values(rows).find((row) => normalizeKey(row?.articleKey || row?.article) === target) || null;
  }

  function workbenchRowsForPlatform(platformKey) {
    return rowsForPlatform(current('smartPriceWorkbench'), platformKey);
  }

  function workbenchBaseRowsForPlatform(platformKey) {
    return rowsForPlatform(current('smartPriceWorkbenchBase'), platformKey);
  }

  function workbenchRowForArticle(platformKey, article) {
    if (!article) return null;
    return workbenchRowsForPlatform(platformKey).find((row) => normalizeKey(row?.articleKey || row?.article) === normalizeKey(article)) || null;
  }

  function workbenchBaseRowForArticle(platformKey, article) {
    if (!article) return null;
    return workbenchBaseRowsForPlatform(platformKey).find((row) => normalizeKey(row?.articleKey || row?.article) === normalizeKey(article)) || null;
  }

  function monthRange(monthKey) {
    const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    return {
      start: new Date(year, monthIndex, 1),
      end: new Date(year, monthIndex + 1, 0)
    };
  }

  function overlapDaysForRange(start, end, monthStart, monthEnd) {
    const effectiveStart = start > monthStart ? start : monthStart;
    const effectiveEnd = end < monthEnd ? end : monthEnd;
    if (effectiveStart > effectiveEnd) return 0;
    return dayCount(effectiveStart, effectiveEnd);
  }

  function sumMonthlyRows(rows, start, end) {
    const items = Array.isArray(rows) ? rows : [];
    const result = items.reduce((acc, item) => {
      const bounds = monthRange(item?.monthKey);
      if (!bounds) return acc;
      const overlap = overlapDaysForRange(start, end, bounds.start, bounds.end);
      if (!overlap) return acc;
      const daysInMonth = dayCount(bounds.start, bounds.end);
      const ratio = daysInMonth > 0 ? overlap / daysInMonth : 0;
      acc.used = true;
      acc.units += num(item?.units) * ratio;
      acc.revenue += num(item?.revenue) * ratio;
      return acc;
    }, { used: false, units: 0, revenue: 0 });
    return result.used ? result : null;
  }

  function monthlyAveragePrice(rows, start, end) {
    const summary = sumMonthlyRows(rows, start, end);
    if (summary?.units > 0 && summary?.revenue > 0) return summary.revenue / summary.units;
    return null;
  }

  function latestAveragePrice(rows) {
    const items = Array.isArray(rows) ? rows : [];
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      const avgPrice = num(item?.avgPrice);
      if (avgPrice > 0) return avgPrice;
      const units = num(item?.units);
      const revenue = num(item?.revenue);
      if (units > 0 && revenue > 0) return revenue / units;
    }
    return null;
  }

  function resolveArticleUnitPrice(support, workbench, range) {
    const actualRangePrice = monthlyAveragePrice(support?.actualMonths, range.effectiveStart, range.effectiveEnd);
    if (actualRangePrice) return actualRangePrice;
    const planRangePrice = monthlyAveragePrice(support?.planMonths, range.effectiveStart, range.effectiveEnd);
    if (planRangePrice) return planRangePrice;
    const latestActualPrice = latestAveragePrice(support?.actualMonths);
    if (latestActualPrice) return latestActualPrice;
    const latestPlanPrice = latestAveragePrice(support?.planMonths);
    if (latestPlanPrice) return latestPlanPrice;
    const fallback = [
      workbench?.currentClientPrice,
      workbench?.currentFillPrice,
      workbench?.basePrice,
      workbench?.price,
      workbench?.minPrice
    ].map((value) => num(value)).find((value) => value > 0);
    return fallback || null;
  }

  function procurementPlatformKey(platformKey) {
    if (platformKey === 'ym' || platformKey === 'ya') return 'ya';
    return normalizeKey(platformKey);
  }

  function procurementRowsForArticle(platformKey, article) {
    const rows = current('orderProcurement')?.rows;
    if (!Array.isArray(rows) || !article) return [];
    const targetPlatform = procurementPlatformKey(platformKey);
    const targetArticle = normalizeKey(article);
    return rows.filter((row) => {
      const rowPlatform = procurementPlatformKey(row?.platform);
      return rowPlatform === targetPlatform && normalizeKey(row?.article) === targetArticle;
    });
  }

  function procurementMetricForDays(row, days, map) {
    const directKey = map[days] || null;
    if (directKey && row?.[directKey] !== undefined && row?.[directKey] !== null && row?.[directKey] !== '') {
      return Math.max(0, num(row[directKey]));
    }
    return null;
  }

  function procurementUnitsForDays(row, days) {
    const direct = procurementMetricForDays(row, days, {
      7: 'sales7',
      14: 'sales14',
      28: 'sales28'
    });
    if (direct !== null) return direct;
    return Math.max(0, num(row?.avgDaily) * days);
  }

  function procurementPlanForRange(row, range) {
    const sameMonth = monthKey(range.effectiveStart) === monthKey(range.effectiveEnd);
    if (!sameMonth) return null;
    const bounds = monthRange(monthKey(range.effectiveStart));
    if (!bounds) return null;
    const days = dayCount(range.effectiveStart, range.effectiveEnd);
    const daysInMonth = dayCount(bounds.start, bounds.end);
    if (days <= 0 || daysInMonth <= 0) return null;
    return (num(row?.planMonth) / daysInMonth) * days;
  }

  function articleWindowFacts(platformKey, article, range) {
    const support = supportRowForArticle(platformKey, article);
    const workbench = workbenchRowForArticle(platformKey, article);
    const procurementRows = procurementRowsForArticle(platformKey, article);
    const days = dayCount(range.effectiveStart, range.effectiveEnd);
    const dailyRows = (Array.isArray(workbench?.monthly) ? workbench.monthly : [])
      .map((item) => ({
        date: parseDate(item?.date),
        units: Number.isFinite(Number(item?.deliveredUnits)) ? Number(item.deliveredUnits) : Number.isFinite(Number(item?.ordersUnits)) ? Number(item.ordersUnits) : null,
        revenue: Number.isFinite(Number(item?.revenue)) ? Number(item.revenue) : null
      }))
      .filter((item) => item.date instanceof Date && !Number.isNaN(item.date.getTime()))
      .filter((item) => item.date >= range.effectiveStart && item.date <= range.effectiveEnd);
    const dailyUnits = dailyRows.map((item) => item.units).filter((value) => value !== null);
    const dailyRevenue = dailyRows.map((item) => item.revenue).filter((value) => value !== null);
    const monthlyActual = dailyUnits.length ? null : sumMonthlyRows(support?.actualMonths, range.effectiveStart, range.effectiveEnd);
    const monthlyPlan = sumMonthlyRows(support?.planMonths, range.effectiveStart, range.effectiveEnd);
    const samePlanMonth = String(workbench?.planMonthKey || '') === monthKey(range.effectiveStart) && monthKey(range.effectiveStart) === monthKey(range.effectiveEnd);
    const fallbackPlan = samePlanMonth
      ? (num(workbench?.planMonthUnits) / Math.max(1, num(workbench?.planMonthDays) || dayCount(range.effectiveStart, range.effectiveEnd))) * dayCount(range.effectiveStart, range.effectiveEnd)
      : null;
    const procurementActualUnits = procurementRows.length
      ? procurementRows.reduce((sum, row) => sum + procurementUnitsForDays(row, days), 0)
      : null;
    const procurementPrice = resolveArticleUnitPrice(support, workbench, range);
    const procurementActualRevenue = procurementActualUnits !== null
      ? (procurementPrice > 0 ? procurementActualUnits * procurementPrice : 0)
      : null;
    const procurementPlanUnits = procurementRows.length
      ? procurementRows.reduce((sum, row) => sum + (procurementPlanForRange(row, range) ?? 0), 0)
      : null;
    const actualUnits = dailyUnits.length
      ? dailyUnits.reduce((sum, value) => sum + value, 0)
      : monthlyActual?.units ?? procurementActualUnits;
    const actualRevenue = dailyRevenue.length
      ? dailyRevenue.reduce((sum, value) => sum + value, 0)
      : monthlyActual?.revenue ?? procurementActualRevenue;
    const planUnits = monthlyPlan?.units ?? fallbackPlan ?? procurementPlanUnits;
    const factSource = dailyUnits.length
      ? 'daily'
      : monthlyActual?.units != null
        ? 'monthly'
        : procurementActualUnits !== null
          ? 'procurement'
          : '';
    return {
      planUnits,
      actualUnits,
      actualRevenue,
      completionPct: actualUnits !== null && planUnits > 0 ? actualUnits / planUnits : null,
      factSource
    };
  }

  function pricePointsFromSeries(series, start, end) {
    return (Array.isArray(series) ? series : [])
      .map((point) => ({
        date: parseDate(point?.date),
        price: num(point?.price),
        sppPct: Number.isFinite(Number(point?.sppPct)) ? Number(point?.sppPct) : null
      }))
      .filter((point) => point.date instanceof Date && !Number.isNaN(point.date.getTime()))
      .filter((point) => point.date >= start && point.date <= end && point.price > 0)
      .sort((left, right) => left.date - right.date);
  }

  function pricePointsForRow(row, start, end) {
    const dailyPoints = pricePointsFromSeries(row?.daily, start, end);
    if (dailyPoints.length) return dailyPoints;
    const timelinePoints = pricePointsFromSeries(row?.timeline, start, end);
    if (timelinePoints.length) return timelinePoints;
    return pricePointsFromSeries(row?.monthly, start, end);
  }

  function priceMatrixSeries(platformKey, range) {
    const rows = priceRowsForPlatform(platformKey);
    const byDate = new Map();
    rows.forEach((row) => {
      pricePointsForRow(row, range.effectiveStart, range.effectiveEnd).forEach((point) => {
        const key = iso(point.date);
        if (!byDate.has(key)) byDate.set(key, { date: point.date, prices: [] });
        byDate.get(key).prices.push(point.price);
      });
    });
    return [...byDate.values()]
      .map((item) => ({
        date: item.date,
        avgPrice: avg(item.prices),
        skuCount: item.prices.length
      }))
      .sort((left, right) => left.date - right.date);
  }

  function turnoverPointsFromSeries(series, start, end) {
    return (Array.isArray(series) ? series : [])
      .map((point) => ({
        date: parseDate(point?.date),
        turnoverDays: point?.turnoverDays === null || point?.turnoverDays === undefined || point?.turnoverDays === ''
          ? null
          : (Number.isFinite(Number(point?.turnoverDays)) ? Number(point.turnoverDays) : null)
      }))
      .filter((point) => point.date instanceof Date && !Number.isNaN(point.date.getTime()))
      .filter((point) => point.date >= start && point.date <= end && point.turnoverDays !== null)
      .sort((left, right) => left.date - right.date);
  }

  function turnoverPointsForRow(row, start, end) {
    const dailyPoints = turnoverPointsFromSeries(row?.daily, start, end);
    if (dailyPoints.length) return dailyPoints;
    const timelinePoints = turnoverPointsFromSeries(row?.timeline, start, end);
    if (timelinePoints.length) return timelinePoints;
    return turnoverPointsFromSeries(row?.monthly, start, end);
  }

  function turnoverMatrixSeries(platformKey, range) {
    const rows = priceRowsForPlatform(platformKey);
    const byDate = new Map();
    rows.forEach((row) => {
      let points = turnoverPointsForRow(row, range.effectiveStart, range.effectiveEnd);
      if (!points.length) {
        const fallbackRow = workbenchBaseRowForArticle(row?.platformKey || platformKey, row?.articleKey || row?.article);
        if (fallbackRow) points = turnoverPointsForRow(fallbackRow, range.effectiveStart, range.effectiveEnd);
      }
      points.forEach((point) => {
        const key = iso(point.date);
        if (!byDate.has(key)) byDate.set(key, { date: point.date, turnover: [] });
        byDate.get(key).turnover.push(point.turnoverDays);
      });
    });
    return [...byDate.values()]
      .map((item) => ({
        date: item.date,
        avgTurnover: avg(item.turnover),
        skuCount: item.turnover.length
      }))
      .sort((left, right) => left.date - right.date);
  }

  function ensureRangeState() {
    const app = stateRef();
    const fallback = { mode: 'preset', active: '7', start: '', end: '' };
    if (!app) return fallback;
    app.uiHotfix = app.uiHotfix || {};
    app.uiHotfix.dashboardRange = app.uiHotfix.dashboardRange || {};
    const stored = app.uiHotfix.dashboardRange;
    if (!stored.mode) stored.mode = 'preset';
    if (!stored.active) stored.active = '7';
    return stored;
  }

  function ensurePlatformState() {
    const app = stateRef();
    const fallback = 'all';
    if (!app) return fallback;
    app.uiHotfix = app.uiHotfix || {};
    const currentKey = String(app.uiHotfix.dashboardPlatform || fallback).trim().toLowerCase();
    app.uiHotfix.dashboardPlatform = PLATFORM_KEYS.includes(currentKey) ? currentKey : fallback;
    return app.uiHotfix.dashboardPlatform;
  }

  function setPlatformState(platformKey) {
    const app = stateRef();
    const nextKey = PLATFORM_KEYS.includes(platformKey) ? platformKey : 'all';
    if (!app) return nextKey;
    app.uiHotfix = app.uiHotfix || {};
    app.uiHotfix.dashboardPlatform = nextKey;
    return nextKey;
  }

  function dateBounds() {
    const anchor = anchorDate();
    const dates = [];
    PLATFORM_KEYS.forEach((key) => {
      platformSeries(key, anchor).forEach((point) => dates.push(point.date));
      adsSeries(key, parseDate(current('adsSummary')?.asOfDate) || anchor).forEach((point) => dates.push(point.date));
    });
    const min = dates.length ? dates.reduce((best, item) => (item < best ? item : best)) : startOfMonth(anchor);
    const max = dates.length ? dates.reduce((best, item) => (item > best ? item : best)) : cleanDate(anchor);
    return { min, max, anchor };
  }

  function presetRange(key, today) {
    const end = cleanDate(today);
    if (key === 'yesterday') return { mode: 'preset', active: 'yesterday', start: iso(end), end: iso(end) };
    if (key === 'prevweek') {
      const previousWeekEnd = addDays(startOfWeek(today), -1);
      const previousWeekStart = addDays(previousWeekEnd, -6);
      return { mode: 'preset', active: 'prevweek', start: iso(previousWeekStart), end: iso(previousWeekEnd) };
    }
    const size = Math.max(1, Number(key) || 7);
    return { mode: 'preset', active: String(key), start: iso(addDays(end, -(size - 1))), end: iso(end) };
  }

  function selectedRange() {
    const stored = ensureRangeState();
    const bounds = dateBounds();
    const today = cleanDate(bounds.max || new Date());
    if (stored.mode === 'preset' || !stored.start || !stored.end) {
      Object.assign(stored, presetRange(stored.active || '7', today));
    }
    const requestedStart = parseDate(stored.start) || addDays(today, -6);
    const requestedEnd = parseDate(stored.end) || today;
    let effectiveStart = cleanDate(requestedStart);
    let effectiveEnd = cleanDate(requestedEnd);
    if (effectiveStart > effectiveEnd) {
      const swap = effectiveStart;
      effectiveStart = effectiveEnd;
      effectiveEnd = swap;
    }
    const notes = [];
    if (effectiveStart < bounds.min) {
      effectiveStart = cleanDate(bounds.min);
      notes.push(`факт начинается с ${shortDate(bounds.min)}`);
    }
    if (effectiveEnd > bounds.max) {
      effectiveEnd = cleanDate(bounds.max);
      notes.push(`последний факт ${shortDate(bounds.max)}`);
    }
    if (effectiveStart > effectiveEnd) {
      effectiveStart = cleanDate(bounds.min);
      effectiveEnd = cleanDate(bounds.max);
    }
    const clamped = requestedStart.getTime() !== effectiveStart.getTime() || requestedEnd.getTime() !== effectiveEnd.getTime();
    return {
      state: stored,
      requestedStart,
      requestedEnd,
      effectiveStart,
      effectiveEnd,
      requestedLabel: rangeLabel(requestedStart, requestedEnd),
      effectiveLabel: rangeLabel(effectiveStart, effectiveEnd),
      availableLabel: rangeLabel(bounds.min, bounds.max),
      availableDays: dayCount(bounds.min, bounds.max),
      clamped,
      note: notes.join(' · '),
      days: dayCount(effectiveStart, effectiveEnd),
      min: bounds.min,
      max: bounds.max,
      anchor: bounds.anchor
    };
  }

  function enumerateDates(start, end) {
    const dates = [];
    for (let cursor = cleanDate(start); cursor <= end; cursor = addDays(cursor, 1)) dates.push(cursor);
    return dates;
  }

  function planUnitsForDate(date, platformKey) {
    const month = current('platformPlan')?.months?.[monthKey(date)];
    const planUnits = num(month?.platforms?.[platformKey]?.units);
    const totalDays = num(month?.days) || new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return totalDays > 0 ? planUnits / totalDays : 0;
  }

  function sparkline(values) {
    const clean = values.map(num).filter((value) => Number.isFinite(value));
    if (!clean.length) return null;
    const width = 240;
    const height = 72;
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const range = Math.max(1, max - min);
    const points = clean.map((value, index) => {
      const x = clean.length === 1 ? width / 2 : (index / Math.max(1, clean.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 16) - 8;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      width,
      height,
      line: `M ${points.join(' L ')}`,
      fill: `M ${points.join(' L ')} L ${width},${height} L 0,${height} Z`
    };
  }

  function platformHasPresence(sku, platformKey) {
    if (!sku) return false;
    if (platformKey === 'all') return true;
    if (platformKey === 'wb') return Boolean(sku?.flags?.hasWB);
    if (platformKey === 'ozon') return Boolean(sku?.flags?.hasOzon);
    if (platformKey === 'ya') {
      return Boolean(
        sku?.ownersByPlatform?.ym
        || sku?.ownersByPlatform?.ya
        || sku?.ownersByPlatform?.ga
        || sku?.ownersByPlatform?.letu
        || sku?.ownersByPlatform?.mm
        || sku?.categoriesByPlatform?.ym
        || sku?.categoriesByPlatform?.ya
        || sku?.categoriesByPlatform?.ga
        || sku?.categoriesByPlatform?.letu
        || sku?.categoriesByPlatform?.mm
      );
    }
    return false;
  }

  function retailOwnerName(sku, fallback = '') {
    const generic = String(fallback || sku?.owner?.name || '').trim();
    if (!sku) return generic || 'Без owner';
    const ymOwner = String(sku?.ownersByPlatform?.ym || sku?.ownersByPlatform?.ya || '').trim();
    const gaOwner = String(sku?.ownersByPlatform?.ga || '').trim();
    const letuOwner = String(sku?.ownersByPlatform?.letu || '').trim();
    const mmOwner = String(sku?.ownersByPlatform?.mm || '').trim();
    const parts = [];
    if (ymOwner) parts.push(`ЯМ: ${ymOwner}`);
    const retailLabels = [];
    if (gaOwner) retailLabels.push('ЗЯ');
    if (letuOwner) retailLabels.push('Летуаль');
    if (mmOwner) retailLabels.push('ММ');
    const retailOwners = [...new Set([gaOwner, letuOwner, mmOwner].filter(Boolean))];
    if (retailOwners.length === 1 && retailLabels.length) {
      parts.push(`${retailLabels.join(' / ')}: ${retailOwners[0]}`);
    } else {
      if (gaOwner) parts.push(`ЗЯ: ${gaOwner}`);
      if (letuOwner) parts.push(`Летуаль: ${letuOwner}`);
      if (mmOwner) parts.push(`ММ: ${mmOwner}`);
    }
    return parts.join(' · ') || generic || 'Без owner';
  }

  function platformOwnerName(sku, platformKey, fallback = '') {
    const generic = String(fallback || sku?.owner?.name || '').trim();
    if (!sku) return generic || 'Без owner';
    if (platformKey === 'ozon') {
      return String(sku?.ownersByPlatform?.ozon || generic || '').trim() || 'Без owner';
    }
    if (platformKey === 'wb') {
      return String(sku?.ownersByPlatform?.wb || generic || '').trim() || 'Без owner';
    }
    if (platformKey === 'ya' || platformKey === 'ym') {
      return retailOwnerName(sku, fallback);
    }
    if (platformKey === 'ga') {
      return String(sku?.ownersByPlatform?.ga || generic || '').trim() || 'Без owner';
    }
    if (platformKey === 'letu') {
      return String(sku?.ownersByPlatform?.letu || generic || '').trim() || 'Без owner';
    }
    if (platformKey === 'mm') {
      return String(sku?.ownersByPlatform?.mm || generic || '').trim() || 'Без owner';
    }
    return generic || 'Без owner';
  }

  function issueCountersForSku(sku, platformKey) {
    const assigned = Boolean(sku?.flags?.assigned);
    const lowStock = Boolean(sku?.flags?.lowStock) && platformHasPresence(sku, platformKey);
    const underPlan = Boolean(sku?.flags?.underPlan) && platformHasPresence(sku, platformKey);
    const negativeMargin = platformKey === 'wb'
      ? Boolean(sku?.flags?.wbNegativeMargin)
      : platformKey === 'ozon'
        ? Boolean(sku?.flags?.ozonNegativeMargin)
        : platformKey === 'all'
          ? Boolean(sku?.flags?.negativeMargin)
          : false;
    const toWork = platformKey === 'wb'
      ? Boolean(sku?.flags?.toWorkWB)
      : platformKey === 'ozon'
        ? Boolean(sku?.flags?.toWorkOzon)
        : platformKey === 'all'
          ? Boolean(sku?.flags?.toWork)
          : false;
    const belowMin = platformKey === 'wb'
      ? Boolean(sku?.wb?.belowMin)
      : platformKey === 'ozon'
        ? Boolean(sku?.ozon?.belowMin)
        : platformKey === 'all'
          ? Boolean(sku?.wb?.belowMin || sku?.ozon?.belowMin)
          : false;
    return {
      noOwner: !assigned,
      lowStock,
      underPlan,
      negativeMargin,
      toWork,
      belowMin
    };
  }

  function focusRowsForPlatform(platformKey) {
    const focus = current('dashboard')?.focusTop || [];
    const skuMap = new Map(
      (current('skus') || []).map((sku) => [normalizeKey(sku?.articleKey || sku?.article), sku])
    );
    const rows = [];
    const seen = new Set();
    const matchesPlatform = (text) => {
      const lowered = repairBrokenUtf8Cp1251String(String(text || '')).toLowerCase();
      if (platformKey === 'all') return true;
      if (platformKey === 'wb') return lowered.includes('wb');
      if (platformKey === 'ozon') return lowered.includes('ozon');
      if (platformKey === 'ya') {
        return lowered.includes('маркет')
          || lowered.includes('ym')
          || lowered.includes('yandex')
          || lowered.includes('летуаль')
          || lowered.includes('магнит')
          || lowered.includes('золот')
          || lowered.includes('зя')
          || lowered.includes('ga')
          || lowered.includes('letu')
          || lowered.includes('mm');
      }
      return false;
    };

    focus.forEach((item) => {
      if (!matchesPlatform(item?.focus_reasons)) return;
      const article = String(item?.article || item?.article_key || '').trim();
      if (!article || seen.has(article)) return;
      const sku = skuMap.get(normalizeKey(article));
      seen.add(article);
      rows.push({
        article,
        name: item?.product_name_final || item?.name || article,
        owner: platformOwnerName(sku, platformKey, item?.owner_name),
        reasons: item?.focus_reasons || 'Нужна ручная оценка',
        score: num(item?.focus_score),
        completion: num(item?.plan_completion_feb26_pct)
      });
    });

    (current('skus') || []).forEach((sku) => {
      const article = String(sku?.articleKey || sku?.article || '').trim();
      if (!article || seen.has(article) || !platformHasPresence(sku, platformKey)) return;
      const counters = issueCountersForSku(sku, platformKey);
      if (!Object.values(counters).some(Boolean)) return;
      seen.add(article);
      rows.push({
        article,
        name: sku?.name || article,
        owner: platformOwnerName(sku, platformKey),
        reasons: sku?.focusReasons || 'Есть риск по площадке',
        score: num(sku?.focusScore),
        completion: num(sku?.planFact?.completionFeb26Pct)
      });
    });

    return rows
      .sort((left, right) => right.score - left.score || right.completion - left.completion)
      .slice(0, 12);
  }

  function buildIssueMap() {
    const map = new Map();
    PLATFORM_KEYS.forEach((platformKey) => {
      const relevantSkus = (current('skus') || []).filter((sku) => platformHasPresence(sku, platformKey));
      const counters = relevantSkus.reduce((acc, sku) => {
        const flags = issueCountersForSku(sku, platformKey);
        Object.keys(flags).forEach((key) => {
          if (flags[key]) acc[key] += 1;
        });
        return acc;
      }, {
        noOwner: 0,
        lowStock: 0,
        underPlan: 0,
        negativeMargin: 0,
        toWork: 0,
        belowMin: 0
      });
      map.set(platformKey, {
        key: platformKey,
        label: shortPlatformLabel(platformKey),
        counters,
        rows: focusRowsForPlatform(platformKey)
      });
    });
    return map;
  }

  function comparisonRange(range) {
    const end = addDays(range.effectiveStart, -1);
    if (end < range.min) return null;
    const start = addDays(end, -(Math.max(1, range.days) - 1));
    const effectiveStart = start < range.min ? range.min : start;
    return {
      effectiveStart,
      effectiveEnd: end,
      days: dayCount(effectiveStart, end),
      label: rangeLabel(effectiveStart, end),
      clamped: effectiveStart.getTime() !== start.getTime()
    };
  }

  function buildWindowMetric(platformKey, rangeLike, anchor, adsAnchor, issueMap) {
    const trendMap = new Map(platformSeries(platformKey, anchor).map((point) => [iso(point.date), point]));
    const adsMap = new Map(adsSeries(platformKey, adsAnchor).map((point) => [iso(point.date), point]));
    const days = enumerateDates(rangeLike.effectiveStart, rangeLike.effectiveEnd).map((date) => {
      const trend = trendMap.get(iso(date)) || {};
      const ads = adsMap.get(iso(date)) || {};
      const planUnits = planUnitsForDate(date, platformKey);
      const factUnits = num(trend.units);
      const revenue = num(trend.revenue);
      const margin = num(trend.margin);
      const spend = num(ads.spend);
      const adRevenue = num(ads.revenue);
      return {
        date,
        planUnits,
        factUnits,
        completion: planUnits > 0 ? factUnits / planUnits : 0,
        revenue,
        margin,
        marginPct: revenue > 0 ? margin / revenue : 0,
        views: num(ads.views),
        clicks: num(ads.clicks),
        orders: num(ads.orders),
        spend,
        adRevenue,
        drr: adRevenue > 0 ? spend / adRevenue : null
      };
    });
    const plan = days.reduce((sum, row) => sum + row.planUnits, 0);
    const units = days.reduce((sum, row) => sum + row.factUnits, 0);
    const revenue = days.reduce((sum, row) => sum + row.revenue, 0);
    const margin = days.reduce((sum, row) => sum + row.margin, 0);
    const views = days.reduce((sum, row) => sum + row.views, 0);
    const clicks = days.reduce((sum, row) => sum + row.clicks, 0);
    const orders = days.reduce((sum, row) => sum + row.orders, 0);
    const spend = days.reduce((sum, row) => sum + row.spend, 0);
    const adRevenue = days.reduce((sum, row) => sum + row.adRevenue, 0);
    const completion = plan > 0 ? units / plan : 0;
    const marginPct = revenue > 0 ? margin / revenue : 0;
    const avgCheck = units > 0 ? revenue / units : 0;
    const ctr = views > 0 ? clicks / views : null;
    const drr = adRevenue > 0 ? spend / adRevenue : null;
    const issues = issueMap.get(platformKey);
    const priceSeries = priceMatrixSeries(platformKey, rangeLike);
    const turnoverSeries = turnoverMatrixSeries(platformKey, rangeLike);
    const turnoverFallback = priceRowsForPlatform(platformKey)
      .map((row) => Number(row?.currentTurnoverDays))
      .filter((value) => Number.isFinite(value));
    const priceStart = priceSeries[0]?.avgPrice || 0;
    const priceEnd = priceSeries[priceSeries.length - 1]?.avgPrice || 0;
    const priceDeltaPct = priceStart > 0 && priceEnd > 0 ? (priceEnd - priceStart) / priceStart : null;
    const avgTurnoverDays = turnoverSeries.length
      ? avg(turnoverSeries.map((row) => row.avgTurnover))
      : (turnoverFallback.length ? avg(turnoverFallback) : null);
    return {
      key: platformKey,
      label: shortPlatformLabel(platformKey),
      days,
      plan,
      units,
      revenue,
      margin,
      completion,
      avgUnits: units / Math.max(1, rangeLike.days),
      avgPlan: plan / Math.max(1, rangeLike.days),
      marginPct,
      views,
      clicks,
      orders,
      spend,
      adRevenue,
      ctr,
      drr,
      avgCheck,
      adsReady: views > 0 || clicks > 0 || orders > 0 || spend > 0 || adRevenue > 0,
      issues,
      sparkUnits: sparkline(days.map((row) => row.factUnits)),
      sparkRevenue: sparkline(days.map((row) => row.revenue)),
      sparkMargin: sparkline(days.map((row) => row.margin)),
      sparkSpend: sparkline(days.map((row) => row.spend)),
      sparkAvgCheck: sparkline(days.map((row) => (row.factUnits > 0 ? row.revenue / row.factUnits : 0))),
      sparkAvgPrice: sparkline(priceSeries.map((row) => row.avgPrice)),
      sparkTurnover: sparkline(turnoverSeries.length ? turnoverSeries.map((row) => row.avgTurnover) : turnoverFallback),
      priceMatrixSeries: priceSeries,
      priceMatrixAvg: avg(priceSeries.map((row) => row.avgPrice)),
      priceMatrixStart: priceStart,
      priceMatrixEnd: priceEnd,
      priceMatrixDeltaPct: priceDeltaPct,
      turnoverSeries,
      avgTurnoverDays,
      topIssue: issues?.rows?.[0] || null
    };
  }

  function buildPlatformMetrics() {
    const range = selectedRange();
    const compare = comparisonRange(range);
    const issueMap = buildIssueMap(range, compare);
    const adsAnchor = parseDate(current('adsSummary')?.asOfDate) || range.anchor;
    const metrics = PLATFORM_KEYS.map((platformKey) => buildWindowMetric(platformKey, range, range.anchor, adsAnchor, issueMap));
    const compareMetrics = compare
      ? PLATFORM_KEYS.map((platformKey) => buildWindowMetric(platformKey, compare, range.anchor, adsAnchor, issueMap))
      : [];
    const byKey = new Map(metrics.map((item) => [item.key, item]));
    const compareByKey = new Map(compareMetrics.map((item) => [item.key, item]));
    const selectedPlatform = ensurePlatformState();
    const scopedMetrics = selectedPlatform === 'all'
      ? metrics.filter((item) => item.key !== 'all')
      : metrics.filter((item) => item.key === selectedPlatform);
    return {
      range,
      compareRange: compare,
      metrics,
      byKey,
      compareByKey,
      overall: byKey.get('all'),
      selectedPlatform,
      focusMetric: byKey.get(selectedPlatform) || byKey.get('all'),
      scopedMetrics
    };
  }

  function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function wholePct(value, digits = 1) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(digits)}%` : '—';
  }

  function deriveContentSpend(revenue, income, romi) {
    const safeRevenue = num(revenue);
    const safeIncome = num(income);
    const safeRomi = num(romi);
    if (safeRevenue > 0 && safeIncome > 0 && safeRevenue > safeIncome) {
      return safeRevenue - safeIncome;
    }
    if (safeIncome > 0 && safeRomi > 0) {
      return safeIncome / (safeRomi / 100);
    }
    if (safeRevenue > 0 && safeRomi > -99) {
      return safeRevenue / (1 + safeRomi / 100);
    }
    return 0;
  }

  function normalizeContentRomiValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.abs(numeric) <= 10 ? numeric : numeric / 100;
  }

  function contentRomiLabel(value) {
    const normalized = normalizeContentRomiValue(value);
    return normalized === null ? 'вЂ”' : pct(normalized);
  }

  function contentRomiTone(value) {
    const normalized = normalizeContentRomiValue(value);
    if (normalized === null) return 'warn';
    if (normalized >= 1) return 'ok';
    if (normalized >= 0.5) return 'warn';
    return 'danger';
  }

  function currentProductLeaderboard() {
    const payload = current('productLeaderboard') || { generatedAt: '', items: [], summary: {} };
    return typeof normalizeProductLeaderboardPayload === 'function'
      ? normalizeProductLeaderboardPayload(payload)
      : payload;
  }

  function contentSliceRowsFromProductLeaderboard() {
    const leaderboard = currentProductLeaderboard();
    const items = Array.isArray(leaderboard.items) ? leaderboard.items : [];
    if (!items.length) return [];
    const skuMap = new Map(
      (current('skus') || []).map((sku) => [normalizeKey(sku?.articleKey || sku?.article), sku])
    );
    return items
      .map((item) => {
        const sku = skuMap.get(normalizeKey(item?.articleKey || item?.article));
        return {
          article: item?.articleKey || item?.article || sku?.articleKey || sku?.article || 'вЂ”',
          articleKey: item?.articleKey || sku?.articleKey || '',
          name: item?.name || sku?.name || item?.articleKey || item?.article || 'вЂ”',
          owner: item?.owner || platformOwnerName(sku, 'all'),
          posts: num(item?.posts),
          clicks: num(item?.clicks),
          orders: num(item?.orders),
          buys: num(item?.buys),
          revenue: num(item?.revenue),
          income: num(item?.income),
          spend: num(item?.contentCost),
          romi: normalizeContentRomiValue(item?.romiPct),
          drr: Number.isFinite(Number(item?.drrPct)) ? Number(item.drrPct) : null,
          traffic: item?.traffic || '',
          signal: item?.signal || '',
          channels: Array.isArray(sku?.traffic?.channels) ? sku.traffic.channels : []
        };
      })
      .filter((item) => item.posts > 0 || item.clicks > 0 || item.orders > 0 || item.revenue > 0 || item.spend > 0)
      .sort((left, right) => right.revenue - left.revenue || right.orders - left.orders || right.clicks - left.clicks);
  }

  function contentSliceRowsFallback() {
    const topContent = current('dashboard')?.topContent || [];
    const skuMap = new Map(
      (current('skus') || []).map((sku) => [normalizeKey(sku?.articleKey || sku?.article), sku])
    );
    return topContent
      .map((item) => {
        const article = String(item?.article || '').trim();
        const sku = skuMap.get(normalizeKey(article));
        const content = sku?.content || {};
        const revenue = num(item?.content_revenue ?? content.revenue);
        const income = num(item?.content_income ?? content.income);
        const romi = item?.content_romi ?? content.romi;
        return {
          article: article || sku?.articleKey || sku?.article || '—',
          name: item?.product_name_final || sku?.name || article || '—',
          owner: platformOwnerName(sku, 'ozon', item?.owner_name),
          posts: num(item?.content_posts ?? content.posts),
          clicks: num(item?.content_clicks ?? content.clicks),
          orders: num(content.orders),
          revenue,
          income,
          spend: deriveContentSpend(revenue, income, romi),
          romi: normalizeContentRomiValue(romi),
          channels: Array.isArray(sku?.traffic?.channels) ? sku.traffic.channels : []
        };
      })
      .filter((item) => item.posts > 0 || item.clicks > 0 || item.orders > 0 || item.revenue > 0)
      .sort((left, right) => right.revenue - left.revenue || right.clicks - left.clicks);
  }

  function contentSliceRows() {
    const leaderboardRows = contentSliceRowsFromProductLeaderboard();
    if (leaderboardRows.length) return leaderboardRows;
    return contentSliceRowsFallback();
  }

  function contentSliceSummary() {
    const rows = contentSliceRows();
    const leaderboard = currentProductLeaderboard();
    const leaderboardRows = contentSliceRowsFromProductLeaderboard();
    const usingLeaderboard = leaderboardRows.length > 0;
    const periods = usingLeaderboard
      ? [leaderboard.weekLabel || leaderboard.sourceSheetName || 'weekly КЗ-срез'].filter(Boolean)
      : (current('dashboard')?.dataFreshness?.contentPeriods || []);
    const posts = usingLeaderboard ? num(leaderboard.summary?.posts) : rows.reduce((sum, row) => sum + row.posts, 0);
    const clicks = usingLeaderboard ? num(leaderboard.summary?.clicks) : rows.reduce((sum, row) => sum + row.clicks, 0);
    const orders = usingLeaderboard ? num(leaderboard.summary?.orders) : rows.reduce((sum, row) => sum + row.orders, 0);
    const spend = usingLeaderboard ? num(leaderboard.summary?.contentCost) : rows.reduce((sum, row) => sum + row.spend, 0);
    const revenue = usingLeaderboard ? num(leaderboard.summary?.revenue) : rows.reduce((sum, row) => sum + row.revenue, 0);
    const income = usingLeaderboard ? num(leaderboard.summary?.income) : rows.reduce((sum, row) => sum + row.income, 0);
    const romi = usingLeaderboard
      ? normalizeContentRomiValue(leaderboard.summary?.romiPct)
      : (spend > 0 ? income / spend : null);
    return {
      rows,
      periods,
      posts,
      clicks,
      orders,
      spend,
      revenue,
      income,
      romi,
      generatedAt: usingLeaderboard ? (leaderboard.generatedAt || '') : (current('dashboard')?.generatedAt || ''),
      sourceLabel: usingLeaderboard ? 'product_leaderboard.json' : 'dashboard.topContent + skus.content',
      sourceSheetName: usingLeaderboard ? (leaderboard.sourceSheetName || leaderboard.weekLabel || '') : '',
      modeLabel: usingLeaderboard ? 'weekly КЗ лидерборд' : 'аварийный fallback',
      usingLeaderboard,
      topRow: rows[0] || null
    };
  }

  function stockRowsForPlatform(platformKey) {
    const skus = current('skus') || [];
    const rows = [];
    skus.forEach((sku) => {
      const addRow = (key, label, source) => {

        if (!source) return;

        const owner = platformOwnerName(sku, key);
        const stock = num(source.stock);
        const inTransit = num(source.stockInTransit) + num(source.stockInSupplyRequest);
        const turnoverDays = Number.isFinite(Number(source.turnoverDays)) ? Number(source.turnoverDays) : null;
        const marginPct = Number.isFinite(Number(source.marginPct)) ? Number(source.marginPct) : null;
        rows.push({
          platformKey: key,
          platformLabel: label,
          article: sku?.articleKey || sku?.article || '—',
          name: sku?.name || sku?.articleKey || sku?.article || '—',
          owner,
          stock,
          inTransit,
          turnoverDays,
          targetTurnoverDays: Number.isFinite(Number(source.targetTurnoverDays)) ? Number(source.targetTurnoverDays) : null,
          currentPrice: num(source.currentPrice),
          recPrice: repricerResolvedPrice(sku?.articleKey || sku?.article, key, source?.recPrice),
          minPrice: num(source.minPrice),
          marginPct,
          toWork: Boolean(
            key === 'wb'
              ? sku?.flags?.toWorkWB
              : key === 'ozon'
                ? sku?.flags?.toWorkOzon
                : sku?.flags?.toWork
          ),
          lowStock: Boolean(sku?.flags?.lowStock),
          belowMin: Boolean(source.belowMin)
        });
      };

      if (platformKey === 'all' || platformKey === 'wb') addRow('wb', 'WB', sku?.wb);
      if (platformKey === 'all' || platformKey === 'ozon') addRow('ozon', 'Ozon', sku?.ozon);
    });
    return rows;
  }

  function buildStockMetric(platformKey) {
    const rows = stockRowsForPlatform(platformKey).filter((row) => row.stock > 0 || row.inTransit > 0 || row.turnoverDays !== null);
    const totalStock = rows.reduce((sum, row) => sum + row.stock, 0);
    const totalTransit = rows.reduce((sum, row) => sum + row.inTransit, 0);
    const turnoverRows = rows.filter((row) => row.turnoverDays !== null);
    const avgTurnover = turnoverRows.length ? avg(turnoverRows.map((row) => row.turnoverDays)) : null;
    const lowCoverage = rows.filter((row) => row.turnoverDays !== null && row.turnoverDays < 14).length;
    const overstock = rows.filter((row) => row.turnoverDays !== null && row.turnoverDays > 90).length;
    const sparkStock = sparkline(
      rows
        .slice()
        .sort((left, right) => right.stock - left.stock)
        .slice(0, 12)
        .map((row) => row.stock)
    );
    return {
      key: platformKey,
      label: shortPlatformLabel(platformKey),
      rows: rows
        .slice()
        .sort((left, right) => {
          const leftTurnover = left.turnoverDays === null ? Number.POSITIVE_INFINITY : left.turnoverDays;
          const rightTurnover = right.turnoverDays === null ? Number.POSITIVE_INFINITY : right.turnoverDays;
          return leftTurnover - rightTurnover || right.stock - left.stock;
        }),
      totalStock,
      totalTransit,
      avgTurnover,
      lowCoverage,
      overstock,
      skuCount: rows.length,
      sparkStock
    };
  }

  function buildTurnoverMetric(platformKey, range) {
    const stockMetric = buildStockMetric(platformKey);
    const turnoverSeries = turnoverMatrixSeries(platformKey, range);
    const publishedTurnoverSeries = turnoverSeries.length
      ? turnoverSeries
      : turnoverMatrixSeries(platformKey, {
          effectiveStart: range?.min || range?.effectiveStart,
          effectiveEnd: range?.max || range?.effectiveEnd
        });
    const fallbackTurnover = stockMetric.rows
      .map((row) => row.turnoverDays)
      .filter((value) => value !== null);
    return {
      ...stockMetric,
      turnoverSeries,
      turnoverPublishedSeries: publishedTurnoverSeries,
      turnoverHistoryScope: turnoverSeries.length ? 'range' : (publishedTurnoverSeries.length ? 'published' : 'none'),
      avgTurnoverDays: turnoverSeries.length
        ? avg(turnoverSeries.map((row) => row.avgTurnover))
        : stockMetric.avgTurnover,
      sparkTurnover: sparkline(turnoverSeries.length ? turnoverSeries.map((row) => row.avgTurnover) : fallbackTurnover),
      turnoverHistoryReady: turnoverSeries.length > 0
    };
  }

  function marginRowsForPlatform(platformKey) {
    const rows = [];
    (current('skus') || []).forEach((sku) => {
      const addRow = (key, label, source) => {

        if (!source || !Number.isFinite(Number(source.marginPct))) return;

        const owner = platformOwnerName(sku, key);
        rows.push({
          platformKey: key,
          platformLabel: label,
          article: sku?.articleKey || sku?.article || '—',
          name: sku?.name || sku?.articleKey || sku?.article || '—',
          owner,
          marginPct: Number(source.marginPct),
          stock: num(source.stock),
          turnoverDays: Number.isFinite(Number(source.turnoverDays)) ? Number(source.turnoverDays) : null,
          currentPrice: num(source.currentPrice),
          minPrice: num(source.minPrice),
          recPrice: repricerResolvedPrice(sku?.articleKey || sku?.article, key, source?.recPrice),
          toWork: Boolean(key === 'wb' ? sku?.flags?.toWorkWB : sku?.flags?.toWorkOzon),
          belowMin: Boolean(source.belowMin)
        });
      };
      if (platformKey === 'all' || platformKey === 'wb') addRow('wb', 'WB', sku?.wb);
      if (platformKey === 'all' || platformKey === 'ozon') addRow('ozon', 'Ozon', sku?.ozon);
    });
    return rows;
  }

  function articleRowsForPlatform(platformKey, range, compareRange = null) {
    const skuMap = new Map(
      (current('skus') || []).map((sku) => [normalizeKey(sku?.articleKey || sku?.article), sku])
    );
    return priceRowsForPlatform(platformKey)
      .map((row) => {
        const article = row?.article || row?.articleKey || '—';
        const sku = skuMap.get(normalizeKey(article));
        const side = row.platformKey === 'wb'
          ? sku?.wb
          : row.platformKey === 'ozon'
            ? sku?.ozon
            : sku?.ym || sku?.ya || null;
        const pricePoints = pricePointsForRow(row, range.effectiveStart, range.effectiveEnd);
        const turnoverPoints = turnoverPointsForRow(row, range.effectiveStart, range.effectiveEnd);
        const startPrice = pricePoints[0]?.price || num(row?.currentPrice) || num(side?.currentPrice);
        const endPrice = pricePoints[pricePoints.length - 1]?.price || num(row?.currentPrice) || num(side?.currentPrice);
        const avgPrice = pricePoints.length
          ? avg(pricePoints.map((point) => point.price))
          : (num(row?.currentPrice) || num(side?.currentPrice));
        const latestTurnoverDays = turnoverPoints[turnoverPoints.length - 1]?.turnoverDays;
        const turnoverDays = latestTurnoverDays !== undefined
          ? latestTurnoverDays
          : Number.isFinite(Number(row?.currentTurnoverDays))
            ? Number(row.currentTurnoverDays)
            : Number.isFinite(Number(side?.turnoverDays))
              ? Number(side.turnoverDays)
              : null;
        const avgTurnoverDays = turnoverPoints.length
          ? avg(turnoverPoints.map((point) => point.turnoverDays))
          : turnoverDays;
        const marginSource = side?.marginPct ?? row?.avgMargin7dPct;
        const periodFacts = articleWindowFacts(row?.platformKey || platformKey, article, range);
        const completionSource = periodFacts.completionPct ?? sku?.planFact?.completionApr26Pct ?? sku?.planFact?.completionMar26Pct ?? sku?.planFact?.completionFeb26Pct;
        const adsRows = adsRowsForArticle(row?.platformKey || platformKey, article);
        const adsFacts = aggregateAdsRows(adsRows, range.effectiveStart, range.effectiveEnd);
        const compareAdsFacts = compareRange ? aggregateAdsRows(adsRows, compareRange.effectiveStart, compareRange.effectiveEnd) : null;
        const owner = platformOwnerName(sku, row?.platformKey || platformKey, row?.owner);
        const platformRowKey = row?.platformKey || platformKey;
        const negativeMarginFlag = platformRowKey === 'wb'
          ? Boolean(sku?.flags?.wbNegativeMargin) || (Number.isFinite(Number(marginSource)) && Number(marginSource) < 0)
          : platformRowKey === 'ozon'
            ? Boolean(sku?.flags?.ozonNegativeMargin) || (Number.isFinite(Number(marginSource)) && Number(marginSource) < 0)
            : Boolean(sku?.flags?.negativeMargin) || (Number.isFinite(Number(marginSource)) && Number(marginSource) < 0);
        const lowStockFlag = platformRowKey === 'wb'
          ? Boolean(sku?.wb?.belowMin || sku?.flags?.lowStock)
          : platformRowKey === 'ozon'
            ? Boolean(sku?.ozon?.belowMin || sku?.flags?.lowStock)
            : Boolean(sku?.ym?.belowMin || sku?.ya?.belowMin || sku?.flags?.lowStock);
        const toWorkFlag = platformRowKey === 'wb'
          ? Boolean(sku?.flags?.toWorkWB)
          : platformRowKey === 'ozon'
            ? Boolean(sku?.flags?.toWorkOzon)
            : Boolean(sku?.flags?.toWork);
        const priceDeltaPct = startPrice > 0 && endPrice > 0 ? (endPrice - startPrice) / startPrice : null;
        return {
          article,
          name: row?.name || sku?.name || article,
          platformKey: platformRowKey,
          platformLabel: row?.platformLabel || shortPlatformLabel(platformRowKey),
          owner,
          startPrice,
          endPrice,
          avgPrice,
          priceDeltaPct,
          currentPrice: num(row?.currentPrice) || num(side?.currentPrice),
          minPrice: num(row?.minPrice) || num(side?.minPrice),
          stock: num(side?.stock),
          inTransit: num(side?.stockInTransit) + num(side?.stockInSupplyRequest),
          marginPct: Number.isFinite(Number(marginSource)) ? Number(marginSource) : null,
          turnoverDays,
          avgTurnoverDays,
          completionPct: Number.isFinite(Number(completionSource)) ? Number(completionSource) : null,
          planUnitsSelected: Number.isFinite(Number(periodFacts.planUnits)) ? Number(periodFacts.planUnits) : null,
          actualUnitsSelected: Number.isFinite(Number(periodFacts.actualUnits)) ? Number(periodFacts.actualUnits) : null,
          actualRevenueSelected: Number.isFinite(Number(periodFacts.actualRevenue)) ? Number(periodFacts.actualRevenue) : null,
          periodAvgCheck: periodFacts.actualUnits > 0 && periodFacts.actualRevenue > 0 ? periodFacts.actualRevenue / periodFacts.actualUnits : null,
          factSource: periodFacts.factSource || '',
          salesValue: Number.isFinite(Number(periodFacts.actualRevenue)) ? Number(periodFacts.actualRevenue) : num(sku?.planFact?.factTotalRevenue || sku?.orders?.value),
          adViews: adsFacts.views,
          adClicks: adsFacts.clicks,
          adOrders: adsFacts.orders,
          adSpend: adsFacts.spend,
          adRevenue: adsFacts.revenue,
          adCtr: adsFacts.ctr,
          adDrr: adsFacts.drr,
          compareAdViews: compareAdsFacts?.views ?? null,
          compareAdClicks: compareAdsFacts?.clicks ?? null,
          compareAdOrders: compareAdsFacts?.orders ?? null,
          compareAdSpend: compareAdsFacts?.spend ?? null,
          compareAdRevenue: compareAdsFacts?.revenue ?? null,
          compareAdCtr: compareAdsFacts?.ctr ?? null,
          compareAdDrr: compareAdsFacts?.drr ?? null,
          adOrdersDeltaPct: compareAdsFacts ? relativeDelta(adsFacts.orders, compareAdsFacts.orders) : null,
          adRevenueDeltaPct: compareAdsFacts ? relativeDelta(adsFacts.revenue, compareAdsFacts.revenue) : null,
          adClicksDeltaPct: compareAdsFacts ? relativeDelta(adsFacts.clicks, compareAdsFacts.clicks) : null,
          adCtrDeltaPct: compareAdsFacts ? relativeDelta(adsFacts.ctr, compareAdsFacts.ctr) : null,
          noOwnerFlag: !owner || owner === 'Без owner',
          negativeMarginFlag,
          lowStockFlag,
          toWorkFlag,
          belowMinFlag: Boolean(row?.belowMin || side?.belowMin)
        };
      })
      .filter((row) => row.article && row.article !== '—');
  }

  function issueCountersForSku(sku, platformKey) {
    const assigned = Boolean(sku?.flags?.assigned);
    const lowStock = Boolean(sku?.flags?.lowStock) && platformHasPresence(sku, platformKey);
    const underPlan = Boolean(sku?.flags?.underPlan) && platformHasPresence(sku, platformKey);
    const negativeMargin = platformKey === 'wb'
      ? Boolean(sku?.flags?.wbNegativeMargin)
      : platformKey === 'ozon'
        ? Boolean(sku?.flags?.ozonNegativeMargin)
        : platformKey === 'all'
          ? Boolean(sku?.flags?.negativeMargin)
          : false;
    const toWork = platformKey === 'wb'
      ? Boolean(sku?.flags?.toWorkWB)
      : platformKey === 'ozon'
        ? Boolean(sku?.flags?.toWorkOzon)
        : platformKey === 'all'
          ? Boolean(sku?.flags?.toWork)
          : false;
    const belowMin = platformKey === 'wb'
      ? Boolean(sku?.wb?.belowMin)
      : platformKey === 'ozon'
        ? Boolean(sku?.ozon?.belowMin)
        : platformKey === 'all'
          ? Boolean(sku?.wb?.belowMin || sku?.ozon?.belowMin)
          : false;
    return {
      noOwner: !assigned,
      lowStock,
      underPlan,
      negativeMargin,
      toWork,
      belowMin
    };
  }

  function priceShockSignalKind(deltaPct) {
    if (!Number.isFinite(Number(deltaPct))) return '';
    const absDelta = Math.abs(Number(deltaPct));
    if (absDelta >= DASHBOARD_SIGNAL_THRESHOLDS.priceShockDangerPct) return 'danger';
    if (absDelta >= DASHBOARD_SIGNAL_THRESHOLDS.priceShockWarnPct) return 'warn';
    return '';
  }

  function funnelDropSignalKind(row) {
    if (!row) return '';
    const hasComparableOrders = Number.isFinite(Number(row.compareAdOrders))
      && Number(row.compareAdOrders) >= DASHBOARD_SIGNAL_THRESHOLDS.minAdsOrdersForCompare;
    const hasComparableRevenue = Number.isFinite(Number(row.compareAdRevenue))
      && Number(row.compareAdRevenue) >= DASHBOARD_SIGNAL_THRESHOLDS.minAdsRevenueForCompare;
    const hasComparableCtr = Number.isFinite(Number(row.compareAdClicks))
      && Number(row.compareAdClicks) >= DASHBOARD_SIGNAL_THRESHOLDS.minAdsOrdersForCompare;
    if (!hasComparableOrders && !hasComparableRevenue && !hasComparableCtr) return '';

    const orderDrop = Number(row.adOrdersDeltaPct);
    const revenueDrop = Number(row.adRevenueDeltaPct);
    const ctrDrop = Number(row.adCtrDeltaPct);

    const isDanger = (
      (Number.isFinite(orderDrop) && orderDrop <= -DASHBOARD_SIGNAL_THRESHOLDS.funnelDropDangerPct)
      || (Number.isFinite(revenueDrop) && revenueDrop <= -DASHBOARD_SIGNAL_THRESHOLDS.funnelDropDangerPct)
      || (Number.isFinite(ctrDrop) && ctrDrop <= -DASHBOARD_SIGNAL_THRESHOLDS.ctrDropDangerPct)
    );
    if (isDanger) return 'danger';

    const isWarn = (
      (Number.isFinite(orderDrop) && orderDrop <= -DASHBOARD_SIGNAL_THRESHOLDS.funnelDropWarnPct)
      || (Number.isFinite(revenueDrop) && revenueDrop <= -DASHBOARD_SIGNAL_THRESHOLDS.funnelDropWarnPct)
      || (Number.isFinite(ctrDrop) && ctrDrop <= -DASHBOARD_SIGNAL_THRESHOLDS.ctrDropWarnPct)
    );
    return isWarn ? 'warn' : '';
  }

  function issueFlagsForArticleRow(row) {
    const completionPct = Number.isFinite(Number(row?.completionPct)) ? Number(row.completionPct) : null;
    const priceShockKind = priceShockSignalKind(row?.priceDeltaPct);
    const funnelDropKind = funnelDropSignalKind(row);
    return {
      noOwner: Boolean(row?.noOwnerFlag),
      lowStock: Boolean(row?.lowStockFlag),
      underPlan: completionPct !== null && completionPct < 0.85,
      negativeMargin: Boolean(row?.negativeMarginFlag),
      toWork: Boolean(row?.toWorkFlag),
      belowMin: Boolean(row?.belowMinFlag),
      priceShock: Boolean(priceShockKind),
      funnelDrop: Boolean(funnelDropKind),
      priceShockKind,
      funnelDropKind
    };
  }

  function strongestFunnelDropLabel(row) {
    const candidates = [
      Number.isFinite(Number(row?.adOrdersDeltaPct))
        ? { label: `Заказы ${row.adOrdersDeltaPct >= 0 ? '+' : ''}${pct(row.adOrdersDeltaPct)}`, delta: Number(row.adOrdersDeltaPct) }
        : null,
      Number.isFinite(Number(row?.adRevenueDeltaPct))
        ? { label: `Выручка ${row.adRevenueDeltaPct >= 0 ? '+' : ''}${pct(row.adRevenueDeltaPct)}`, delta: Number(row.adRevenueDeltaPct) }
        : null,
      Number.isFinite(Number(row?.adCtrDeltaPct))
        ? { label: `CTR ${row.adCtrDeltaPct >= 0 ? '+' : ''}${pct(row.adCtrDeltaPct)}`, delta: Number(row.adCtrDeltaPct) }
        : null
    ].filter(Boolean);
    if (!candidates.length) return 'Провал воронки';
    candidates.sort((left, right) => left.delta - right.delta);
    return candidates[0].label;
  }

  function issueReasonsForRow(row, flags, scopeKey) {
    const reasons = [];
    if (flags.priceShock && Number.isFinite(Number(row?.priceDeltaPct))) {
      reasons.push(`Цена ${row.priceDeltaPct >= 0 ? '+' : ''}${pct(row.priceDeltaPct)}`);
    }
    if (flags.funnelDrop) reasons.push(`Воронка ${strongestFunnelDropLabel(row)}`);
    if (flags.negativeMargin) reasons.push('Отрицательная маржа');
    if (flags.toWork) reasons.push('SKU уже в работе');
    if (flags.lowStock) reasons.push('Низкий остаток');
    if (flags.noOwner) reasons.push('Без owner');
    if (flags.belowMin) reasons.push('Ниже min price');
    if (flags.underPlan && Number.isFinite(Number(row?.completionPct))) reasons.push(`План ${pct(row.completionPct)}`);
    if (!reasons.length) reasons.push('Нужна ручная проверка');
    const prefix = scopeKey === 'all' && row?.platformLabel ? `${row.platformLabel}: ` : '';
    return `${prefix}${reasons.join(' · ')}`;
  }

  function issueScoreForFlags(flags) {
    let score = 0;
    if (flags.priceShockKind === 'danger') score += 6;
    else if (flags.priceShockKind === 'warn') score += 4;
    if (flags.funnelDropKind === 'danger') score += 6;
    else if (flags.funnelDropKind === 'warn') score += 4;
    if (flags.negativeMargin) score += 5;
    if (flags.toWork) score += 4;
    if (flags.lowStock) score += 3;
    if (flags.noOwner) score += 2;
    if (flags.belowMin) score += 2;
    if (flags.underPlan) score += 1;
    return score;
  }

  function issueSummaryLabel(counters) {
    if (!counters || typeof counters !== 'object') return 'Риски пока не собраны';
    const parts = [
      num(counters.toWork) > 0 ? `${int(counters.toWork)} в работе` : '',
      num(counters.negativeMargin) > 0 ? `${int(counters.negativeMargin)} отриц. маржа` : '',
      num(counters.lowStock) > 0 ? `${int(counters.lowStock)} низкий остаток` : '',
      num(counters.noOwner) > 0 ? `${int(counters.noOwner)} без owner` : '',
      num(counters.priceShock) > 0 ? `${int(counters.priceShock)} скачок цены` : '',
      num(counters.funnelDrop) > 0 ? `${int(counters.funnelDrop)} провал воронки` : ''
    ].filter(Boolean);
    return parts.join(' · ') || 'Риски пока не собраны';
  }

  function focusRowsForPlatform(platformKey, range, compareRange = null) {
    const focus = current('dashboard')?.focusTop || [];
    const skuMap = new Map(
      (current('skus') || []).map((sku) => [normalizeKey(sku?.articleKey || sku?.article), sku])
    );
    const rows = [];
    const seen = new Set();
    const rowKey = (article, key = platformKey) => `${normalizeKey(article)}|${key || 'all'}`;
    const matchesPlatform = (text) => {
      const lowered = repairBrokenUtf8Cp1251String(String(text || '')).toLowerCase();
      if (platformKey === 'all') return true;
      if (platformKey === 'wb') return lowered.includes('wb');
      if (platformKey === 'ozon') return lowered.includes('ozon');
      if (platformKey === 'ya') {
        return lowered.includes('маркет')
          || lowered.includes('ym')
          || lowered.includes('yandex')
          || lowered.includes('летуаль')
          || lowered.includes('магнит')
          || lowered.includes('золот')
          || lowered.includes('зя')
          || lowered.includes('ga')
          || lowered.includes('letu')
          || lowered.includes('mm');
      }
      return false;
    };

    articleRowsForPlatform(platformKey, range, compareRange).forEach((row) => {
      const flags = issueFlagsForArticleRow(row);
      if (!Object.keys(flags).some((key) => key.endsWith('Kind') ? Boolean(flags[key]) : flags[key] === true)) return;
      const article = String(row?.article || '').trim();
      if (!article) return;
      const key = rowKey(article, row?.platformKey || platformKey);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        article,
        name: row?.name || article,
        owner: row?.owner || 'Без owner',
        platformKey: row?.platformKey || platformKey,
        reasons: issueReasonsForRow(row, flags, platformKey),
        score: issueScoreForFlags(flags),
        completion: num(row?.completionPct),
        salesValue: num(row?.salesValue),
        signalCodes: Object.entries(flags)
          .filter(([name, active]) => !name.endsWith('Kind') && active === true)
          .map(([name]) => name),
        priceShockKind: flags.priceShockKind || '',
        funnelDropKind: flags.funnelDropKind || ''
      });
    });

    focus.forEach((item) => {
      if (!matchesPlatform(item?.focus_reasons)) return;
      const article = String(item?.article || item?.article_key || '').trim();
      if (!article) return;
      const sku = skuMap.get(normalizeKey(article));
      const key = rowKey(article, platformKey);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        article,
        name: item?.product_name_final || item?.name || article,
        owner: platformOwnerName(sku, platformKey, item?.owner_name),
        platformKey,
        reasons: item?.focus_reasons || 'Нужна ручная оценка',
        score: num(item?.focus_score),
        completion: num(item?.plan_completion_feb26_pct),
        salesValue: 0,
        signalCodes: [],
        priceShockKind: '',
        funnelDropKind: ''
      });
    });

    (current('skus') || []).forEach((sku) => {
      const article = String(sku?.articleKey || sku?.article || '').trim();
      if (!article || !platformHasPresence(sku, platformKey)) return;
      const flags = issueCountersForSku(sku, platformKey);
      if (!Object.values(flags).some(Boolean)) return;
      const key = rowKey(article, platformKey);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        article,
        name: sku?.name || article,
        owner: platformOwnerName(sku, platformKey),
        platformKey,
        reasons: sku?.focusReasons || 'Есть риск по площадке',
        score: num(sku?.focusScore),
        completion: num(sku?.planFact?.completionFeb26Pct),
        salesValue: num(sku?.planFact?.factTotalRevenue || sku?.orders?.value),
        signalCodes: Object.entries(flags).filter(([, active]) => active).map(([name]) => name),
        priceShockKind: '',
        funnelDropKind: ''
      });
    });

    return rows
      .sort((left, right) => right.score - left.score || right.salesValue - left.salesValue || right.completion - left.completion)
      .slice(0, 12);
  }

  function buildIssueMap(range, compareRange = null) {
    const map = new Map();
    PLATFORM_KEYS.forEach((platformKey) => {
      const relevantSkus = (current('skus') || []).filter((sku) => platformHasPresence(sku, platformKey));
      const periodRows = articleRowsForPlatform(platformKey, range, compareRange);
      const counters = relevantSkus.reduce((acc, sku) => {
        const flags = issueCountersForSku(sku, platformKey);
        Object.keys(flags).forEach((key) => {
          if (flags[key]) acc[key] += 1;
        });
        return acc;
      }, {
        noOwner: 0,
        lowStock: 0,
        underPlan: 0,
        negativeMargin: 0,
        toWork: 0,
        belowMin: 0,
        priceShock: 0,
        funnelDrop: 0
      });
      periodRows.forEach((row) => {
        const flags = issueFlagsForArticleRow(row);
        if (flags.priceShock) counters.priceShock += 1;
        if (flags.funnelDrop) counters.funnelDrop += 1;
      });
      map.set(platformKey, {
        key: platformKey,
        label: shortPlatformLabel(platformKey),
        counters,
        rows: focusRowsForPlatform(platformKey, range, compareRange)
      });
    });
    return map;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #view-dashboard [data-portal-dashboard-executive-root] { display: grid; gap: 18px; margin-top: 10px; }
      #view-dashboard > :not(#portalDashboardExecutiveRoot) { display: none !important; }
      #view-dashboard > [data-dashboard-layout-root] { display: none !important; }
      #view-dashboard .portal-exec-surface, #view-dashboard .portal-exec-section { padding: 18px; border-radius: 24px; border: 1px solid rgba(212,164,74,.14); background: radial-gradient(circle at top left, rgba(212,164,74,.09), transparent 34%), linear-gradient(180deg, rgba(23,18,15,.95), rgba(11,9,8,.98)); box-shadow: 0 20px 48px rgba(0,0,0,.18); }
      #view-dashboard .portal-exec-surface.is-highlight, #view-dashboard .portal-exec-section.is-highlight { border-color: rgba(212,164,74,.22); }
      #view-dashboard .portal-exec-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
      #view-dashboard .portal-exec-copy { max-width: 920px; }
      #view-dashboard .portal-exec-surface .portal-exec-copy { max-width: 640px; }
      #view-dashboard .portal-exec-surface .portal-exec-chip-stack { margin-left: auto; justify-content: flex-end; max-width: min(100%, 480px); }
      #view-dashboard .portal-exec-eyebrow { color: rgba(245,232,207,.55); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
      #view-dashboard .portal-exec-head h3, #view-dashboard .portal-exec-head h2 { margin: 4px 0 8px; color: #f6ead4; }
      #view-dashboard .portal-exec-head p { margin: 0; color: rgba(245,232,207,.68); }
      #view-dashboard .portal-exec-chip-stack, #view-dashboard .portal-exec-actions, #view-dashboard .portal-exec-presets, #view-dashboard .portal-exec-dates { display: flex; flex-wrap: wrap; gap: 8px; }
      #view-dashboard .portal-exec-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 999px; border: 1px solid rgba(212,164,74,.22); background: rgba(17,13,10,.9); color: #f5e8cf; font-size: 11px; white-space: nowrap; }
      #view-dashboard .portal-exec-chip.ok { border-color: rgba(118,180,121,.34); }
      #view-dashboard .portal-exec-chip.warn { border-color: rgba(212,164,74,.4); }
      #view-dashboard .portal-exec-chip.danger { border-color: rgba(203,88,65,.38); }
      #view-dashboard .quick-chip, #view-dashboard .portal-exec-filter-chip { appearance: none; border: 1px solid rgba(212,164,74,.2); background: rgba(15,11,9,.94); color: rgba(245,232,207,.84); font: inherit; font-size: 12px; line-height: 1; padding: 10px 14px; border-radius: 999px; cursor: pointer; transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease, color .16s ease; }
      #view-dashboard .quick-chip:hover, #view-dashboard .portal-exec-filter-chip:hover { transform: translateY(-1px); border-color: rgba(212,164,74,.36); color: #fff4e5; }
      #view-dashboard .quick-chip.active, #view-dashboard .portal-exec-filter-chip.active { background: linear-gradient(180deg, rgba(226,186,98,.98), rgba(190,146,58,.96)); color: #18120d; border-color: rgba(236,203,123,.98); box-shadow: 0 10px 26px rgba(212,164,74,.18); }
      #view-dashboard .portal-exec-filter-row { display: grid; gap: 12px; margin-top: 14px; }
      #view-dashboard .portal-exec-filter-group { display: grid; gap: 8px; }
      #view-dashboard .portal-exec-filter-label { color: rgba(245,232,207,.56); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      #view-dashboard .portal-exec-filter-chips { display: flex; flex-wrap: wrap; gap: 8px; }
      #view-dashboard .portal-exec-period-grid { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(340px,1fr); gap: 16px; margin-top: 14px; }
      #view-dashboard .portal-exec-period-panel { padding: 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.02); }
      #view-dashboard .portal-exec-period-panel h4 { margin: 0 0 8px; color: #f6ead4; }
      #view-dashboard .portal-exec-period-panel p, #view-dashboard .portal-exec-period-note { margin: 0; color: rgba(245,232,207,.66); font-size: 13px; }
      #view-dashboard .portal-exec-period-note strong { color: #f6ead4; }
      #view-dashboard .portal-exec-period-alert { margin-top: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(212,164,74,.32); background: rgba(212,164,74,.10); color: #fff1d4; font-size: 13px; line-height: 1.45; }
      #view-dashboard .portal-exec-period-alert strong { color: #fff6e5; }
      #view-dashboard .portal-exec-dates { margin-top: 12px; }
      #view-dashboard .portal-exec-date-field { display: grid; gap: 6px; min-width: 150px; padding: 12px; border-radius: 18px; border: 1px solid rgba(255,255,255,.05); background: rgba(255,255,255,.02); transition: border-color .16s ease, background .16s ease, box-shadow .16s ease; }
      #view-dashboard .portal-exec-date-field.is-selected { border-color: rgba(236,203,123,.4); background: rgba(236,203,123,.06); box-shadow: inset 0 0 0 1px rgba(236,203,123,.08); }
      #view-dashboard .portal-exec-date-field span { color: rgba(245,232,207,.58); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      #view-dashboard .portal-exec-date-shell { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; }
      #view-dashboard .portal-exec-date-input { width: 100%; min-width: 0; padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(212,164,74,.18); background: rgba(17,14,11,.96); color: #f6ead4; font: inherit; cursor: pointer; color-scheme: dark; accent-color: #e0b865; }
      #view-dashboard .portal-exec-date-input:hover { border-color: rgba(212,164,74,.34); }
      #view-dashboard .portal-exec-date-input.is-active, #view-dashboard .portal-exec-date-input:focus { border-color: rgba(236,203,123,.96); box-shadow: 0 0 0 3px rgba(212,164,74,.12); outline: none; }
      #view-dashboard .portal-exec-date-input::-webkit-calendar-picker-indicator { cursor: pointer; opacity: .92; filter: invert(90%) sepia(18%) saturate(534%) hue-rotate(340deg) brightness(104%) contrast(102%); }
      #view-dashboard .portal-exec-date-trigger { appearance: none; border: 1px solid rgba(212,164,74,.24); background: rgba(17,13,10,.92); color: #f6ead4; font: inherit; font-size: 12px; line-height: 1; padding: 10px 12px; border-radius: 14px; cursor: pointer; transition: border-color .16s ease, background .16s ease, transform .16s ease, color .16s ease; }
      #view-dashboard .portal-exec-date-trigger:hover { transform: translateY(-1px); border-color: rgba(236,203,123,.5); color: #fff4e5; }
      #view-dashboard .portal-exec-date-trigger.active { background: linear-gradient(180deg, rgba(226,186,98,.98), rgba(190,146,58,.96)); color: #18120d; border-color: rgba(236,203,123,.98); }
      #view-dashboard .portal-exec-date-value { display: block; color: rgba(255,244,229,.72); font-size: 12px; line-height: 1.35; }
      #view-dashboard .portal-exec-grid, #view-dashboard .portal-exec-metric-strip, #view-dashboard .portal-exec-platform-grid, #view-dashboard .portal-exec-issue-grid, #view-dashboard .portal-exec-modal-metrics { display: grid; gap: 12px; }
      #view-dashboard .portal-exec-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      #view-dashboard .portal-exec-metric-strip { grid-template-columns: repeat(5, minmax(0, 1fr)); }
      #view-dashboard .portal-exec-platform-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      #view-dashboard .portal-exec-issue-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      #view-dashboard .portal-exec-two-grids { display: grid; gap: 16px; }
      #view-dashboard .portal-exec-subsection { display: grid; gap: 12px; }
      #view-dashboard .portal-exec-subsection > h4 { margin: 0; color: #f6ead4; font-size: 18px; }
      #view-dashboard .portal-exec-subsection > p { margin: 0; color: rgba(245,232,207,.62); font-size: 13px; }
      #view-dashboard .portal-exec-card { position: relative; padding: 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.025); overflow: hidden; }
      #view-dashboard .portal-exec-card.is-clickable { cursor: pointer; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
      #view-dashboard .portal-exec-card.is-clickable:hover { transform: translateY(-1px); border-color: rgba(212,164,74,.26); box-shadow: 0 18px 30px rgba(0,0,0,.16); }
      #view-dashboard .portal-exec-card.is-ok { border-color: rgba(118,180,121,.3); }
      #view-dashboard .portal-exec-card.is-warn { border-color: rgba(212,164,74,.36); }
      #view-dashboard .portal-exec-card.is-danger { border-color: rgba(203,88,65,.34); }
      #view-dashboard .portal-exec-card-head, #view-dashboard .portal-exec-card-foot, #view-dashboard .portal-exec-axis, #view-dashboard .portal-exec-issue-foot { display: flex; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; }
      #view-dashboard .portal-exec-card-label { color: rgba(255,244,229,.82); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
      #view-dashboard .portal-exec-card-value { position: relative; z-index: 2; margin-top: 10px; font-size: 30px; line-height: 1.12; font-weight: 700; color: #fff1dd; text-shadow: 0 1px 0 rgba(0,0,0,.24); }
      #view-dashboard .portal-exec-card-value.compact { font-size: 24px; }
      #view-dashboard .portal-exec-sub, #view-dashboard .portal-exec-card-foot, #view-dashboard .portal-exec-axis { position: relative; z-index: 2; color: rgba(255,244,229,.76); font-size: 12px; }
      #view-dashboard .portal-exec-sub { margin-top: 6px; }
      #view-dashboard .portal-exec-card-foot { margin-top: 12px; }
      #view-dashboard .portal-exec-axis { margin-top: 10px; color: rgba(255,244,229,.68); font-size: 11px; }
      #view-dashboard .portal-exec-axis span { color: inherit; text-shadow: 0 1px 0 rgba(0,0,0,.24); }
      #view-dashboard .portal-exec-progress { margin-top: 12px; height: 8px; border-radius: 999px; background: rgba(255,255,255,.07); overflow: hidden; }
      #view-dashboard .portal-exec-progress > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, rgba(212,164,74,.95), rgba(236,203,123,.95)); }
      #view-dashboard .portal-exec-progress.is-ok > span { background: linear-gradient(90deg, rgba(95,189,121,.95), rgba(155,219,171,.95)); }
      #view-dashboard .portal-exec-progress.is-danger > span { background: linear-gradient(90deg, rgba(203,88,65,.95), rgba(232,125,102,.95)); }
      #view-dashboard .portal-exec-spark { position: relative; z-index: 1; display: block; width: 100%; height: 72px; margin-top: 18px; overflow: visible; }
      #view-dashboard .portal-exec-spark path { fill: none; stroke: rgba(241,210,132,.98); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
      #view-dashboard .portal-exec-spark .fill { fill: rgba(236,203,123,.2); opacity: .16; }
      #view-dashboard .portal-exec-spark .track { opacity: .28; }
      #view-dashboard .portal-exec-spark text, #view-dashboard .portal-exec-spark tspan { fill: #f7ead4 !important; stroke: none !important; }
      #view-dashboard .portal-exec-card.is-ok .portal-exec-spark path { stroke: rgba(140,223,162,.96); }
      #view-dashboard .portal-exec-card.is-ok .portal-exec-spark .fill { fill: rgba(140,223,162,.22); }
      #view-dashboard .portal-exec-card.is-danger .portal-exec-spark path { stroke: rgba(232,125,102,.96); }
      #view-dashboard .portal-exec-card.is-danger .portal-exec-spark .fill { fill: rgba(232,125,102,.22); }
      #view-dashboard .portal-exec-metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-top: 12px; }
      #view-dashboard .portal-exec-metric { padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,.05); background: rgba(255,255,255,.024); }
      #view-dashboard .portal-exec-metric span { display: block; margin-bottom: 6px; color: rgba(255,244,229,.56); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      #view-dashboard .portal-exec-metric strong { color: #f6ead4; font-size: 20px; line-height: 1.1; }
      #view-dashboard .portal-exec-issue-list { display: grid; gap: 10px; margin-top: 12px; }
      #view-dashboard .portal-exec-issue-row { padding: 12px 14px; border-radius: 16px; border: 1px solid rgba(255,255,255,.05); background: rgba(255,255,255,.024); }
      #view-dashboard .portal-exec-issue-title { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
      #view-dashboard .portal-exec-issue-title strong, #view-dashboard .portal-exec-modal-card strong { color: #f6ead4; }
      #view-dashboard .portal-exec-issue-row p, #view-dashboard .portal-exec-modal-copy p { margin: 6px 0 0; color: rgba(245,232,207,.66); font-size: 13px; }
      #view-dashboard .portal-exec-section-foot { margin-top: 12px; color: rgba(245,232,207,.52); font-size: 12px; }
      #view-dashboard .portal-exec-empty { padding: 28px 18px; border-radius: 20px; border: 1px dashed rgba(212,164,74,.16); color: rgba(245,232,207,.62); text-align: center; }
      body > .portal-exec-modal { position: fixed; inset: 0; z-index: 120; display: none; align-items: center; justify-content: center; padding: 24px; background: rgba(6,5,4,.78); backdrop-filter: blur(8px); }
      body > .portal-exec-modal.is-open { display: flex; }
      body > .portal-exec-modal .portal-exec-modal-card { width: min(1520px, 96vw); max-height: min(90vh, 980px); overflow: auto; padding: 22px; border-radius: 24px; border: 1px solid rgba(212,164,74,.18); background: radial-gradient(circle at top left, rgba(212,164,74,.08), transparent 36%), linear-gradient(180deg, rgba(24,18,14,.97), rgba(11,9,8,.98)); box-shadow: 0 24px 70px rgba(0,0,0,.42); }
      body > .portal-exec-modal .portal-exec-modal-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
      body > .portal-exec-modal .portal-exec-modal-head h3 { margin: 0 0 6px; font-size: 28px; color: #f6ead4; }
      body > .portal-exec-modal .portal-exec-modal-head p { margin: 0; color: rgba(245,232,207,.66); }
      body > .portal-exec-modal .portal-exec-close { min-width: 40px; height: 40px; border-radius: 999px; border: 1px solid rgba(212,164,74,.24); background: rgba(17,13,10,.92); color: #f6ead4; font: inherit; }
      body > .portal-exec-modal .portal-exec-modal-metrics { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); margin-bottom: 14px; }
      body > .portal-exec-modal .portal-exec-modal-card { padding: 12px 14px; border-radius: 16px; border: 1px solid rgba(255,255,255,.05); background: rgba(255,255,255,.024); }
      body > .portal-exec-modal .portal-exec-modal-grid { display: grid; grid-template-columns: minmax(320px,.88fr) minmax(460px,1.22fr); gap: 14px; margin-top: 14px; align-items: start; }
      body > .portal-exec-modal .portal-exec-modal-grid > * { min-width: 0; }
      body > .portal-exec-modal .portal-exec-modal-copy small { color: rgba(245,232,207,.58); display: block; margin-bottom: 8px; }
      body > .portal-exec-modal .portal-exec-modal-card small { display: block; margin-bottom: 8px; color: rgba(245,232,207,.58); font-size: 12px; line-height: 1.35; }
      body > .portal-exec-modal .portal-exec-modal-card strong { display: block; color: #f6ead4; line-height: 1.2; }
      body > .portal-exec-modal .portal-exec-modal-table { width: 100%; border-collapse: collapse; table-layout: auto; }
      body > .portal-exec-modal .portal-exec-modal-table th, body > .portal-exec-modal .portal-exec-modal-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.06); text-align: left; font-size: 13px; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
      body > .portal-exec-modal .portal-exec-modal-table th { color: rgba(245,232,207,.56); text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }
      body > .portal-exec-modal .portal-exec-modal-table td { color: #f6ead4; }
      body > .portal-exec-modal .portal-exec-modal-table .muted.small { color: rgba(245,232,207,.62); }
      body > .portal-exec-modal .portal-exec-modal-table tr[data-open-price-article] { cursor: pointer; transition: background .16s ease; }
      body > .portal-exec-modal .portal-exec-modal-table tr[data-open-price-article]:hover { background: rgba(212,164,74,.08); }
      body > .portal-exec-modal svg text, body > .portal-exec-modal svg tspan { fill: #f7ead4 !important; stroke: none !important; }
      body > .portal-exec-modal .portal-exec-modal-list { display: grid; gap: 10px; }
      body > .portal-exec-modal .portal-exec-modal-list .portal-exec-modal-card,
      body > .portal-exec-modal .portal-exec-modal-list .portal-exec-issue-row { overflow-wrap: anywhere; }
      body > .portal-exec-modal .portal-exec-modal-list .portal-exec-issue-row { margin: 0; }
      body > .portal-exec-modal .portal-exec-task-panel { margin-top: 14px; }
      body > .portal-exec-modal .portal-exec-task-panel .portal-exec-modal-card { padding: 16px; }
      body > .portal-exec-modal .portal-exec-task-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      body > .portal-exec-modal .portal-exec-task-grid label { display: grid; gap: 6px; min-width: 0; }
      body > .portal-exec-modal .portal-exec-task-grid label.wide { grid-column: 1 / -1; }
      body > .portal-exec-modal .portal-exec-task-grid span { color: rgba(245,232,207,.72); font-size: 12px; }
      body > .portal-exec-modal .portal-exec-task-grid input,
      body > .portal-exec-modal .portal-exec-task-grid select,
      body > .portal-exec-modal .portal-exec-task-grid textarea { width: 100%; min-width: 0; padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(212,164,74,.18); background: rgba(17,14,11,.96); color: #f6ead4; font: inherit; box-sizing: border-box; }
      body > .portal-exec-modal .portal-exec-task-grid textarea { min-height: 96px; resize: vertical; }
      body > .portal-exec-modal .portal-exec-task-grid input:focus,
      body > .portal-exec-modal .portal-exec-task-grid select:focus,
      body > .portal-exec-modal .portal-exec-task-grid textarea:focus { outline: none; border-color: rgba(236,203,123,.88); box-shadow: 0 0 0 3px rgba(212,164,74,.12); }
      body > .portal-exec-modal .portal-exec-task-actions { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
      body > .portal-exec-modal .portal-exec-task-actions .portal-exec-chip-stack { display: flex; gap: 8px; flex-wrap: wrap; }
      body > .portal-exec-modal .portal-exec-task-status { color: rgba(245,232,207,.68); font-size: 12px; }
      body > .portal-exec-modal .portal-exec-task-status.is-success { color: #9fdfab; }
      body > .portal-exec-modal .portal-exec-task-status.is-error { color: #ff9a8a; }
      body > .portal-exec-modal .portal-exec-issue-row .quick-chip { margin-top: 10px; }
      @media (max-width: 1480px) { #view-dashboard .portal-exec-metric-strip { grid-template-columns: repeat(3, minmax(0,1fr)); } }
      @media (max-width: 1280px) { #view-dashboard .portal-exec-grid, #view-dashboard .portal-exec-issue-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
      @media (max-width: 1400px) { body > .portal-exec-modal .portal-exec-modal-grid { grid-template-columns: 1fr; } }
      @media (max-width: 1080px) { #view-dashboard .portal-exec-period-grid, #view-dashboard .portal-exec-platform-grid, body > .portal-exec-modal .portal-exec-modal-grid { grid-template-columns: 1fr; } }
      @media (max-width: 900px) { #view-dashboard .portal-exec-metric-strip { grid-template-columns: repeat(2, minmax(0,1fr)); } body > .portal-exec-modal .portal-exec-task-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
      @media (max-width: 720px) { #view-dashboard .portal-exec-grid, #view-dashboard .portal-exec-metric-strip, #view-dashboard .portal-exec-issue-grid, #view-dashboard .portal-exec-metric-grid, body > .portal-exec-modal .portal-exec-modal-metrics, body > .portal-exec-modal .portal-exec-task-grid { grid-template-columns: 1fr; } #view-dashboard .portal-exec-dates { display: grid; grid-template-columns: 1fr; } #view-dashboard .portal-exec-date-shell { grid-template-columns: 1fr; } body > .portal-exec-modal { padding: 12px; } body > .portal-exec-modal .portal-exec-modal-card { padding: 16px; } }
    `;
    document.head.appendChild(style);
  }

  function ensureAdsFunnelStyles() {
    ensureStyles();
    if (document.getElementById(ADS_STYLE_ID)) return;
    const baseStyle = document.getElementById(STYLE_ID);
    if (!baseStyle) return;
    const style = document.createElement('style');
    style.id = ADS_STYLE_ID;
    style.textContent = String(baseStyle.textContent || '')
      .replace(/#view-dashboard/g, `#${ADS_VIEW_ID}`)
      .replace(new RegExp(ROOT_ID, 'g'), ADS_ROOT_ID);
    document.head.appendChild(style);
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'portal-exec-modal';
    modal.innerHTML = `
      <div class="portal-exec-modal-card" role="dialog" aria-modal="true" aria-labelledby="${MODAL_ID}Title">
        <div class="portal-exec-modal-head">
          <div>
            <h3 id="${MODAL_ID}Title">Детализация</h3>
            <p id="${MODAL_ID}Subtitle"></p>
          </div>
          <button type="button" class="portal-exec-close" data-portal-exec-close>×</button>
        </div>
        <div id="${MODAL_ID}Body"></div>
      </div>
    `;
    modal.addEventListener('click', (event) => {
      const priceRow = event.target.closest('[data-open-price-article]');
      if (priceRow && typeof window.openPriceWorkbenchArticle === 'function') {
        event.preventDefault();
        event.stopPropagation();
        modal.classList.remove('is-open');
        Promise.resolve(window.openPriceWorkbenchArticle({
          articleKey: priceRow.dataset.openPriceArticle || '',
          marketplace: priceRow.dataset.openPriceMarket || 'wb',
          dateFrom: priceRow.dataset.openPriceFrom || '',
          dateTo: priceRow.dataset.openPriceTo || ''
        })).catch((error) => console.error(error));
        return;
      }
      if (event.target === modal || event.target.closest('[data-portal-exec-close]')) modal.classList.remove('is-open');
    });
    document.body.appendChild(modal);
    return modal;
  }

  function modalSummaryCard(label, value) {
    return `<div class="portal-exec-modal-card"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
  }

  function priceWorkbenchOpenAttrs(platformKey, article, executive) {
    const articleKey = String(article || '').trim();
    if (!articleKey) return '';
    const market = platformKey === 'ya' ? 'ym' : (platformKey || 'wb');
    const dateFrom = executive?.range?.effectiveStart ? iso(executive.range.effectiveStart) : '';
    const dateTo = executive?.range?.effectiveEnd ? iso(executive.range.effectiveEnd) : '';
    return ` data-open-price-article="${esc(articleKey)}" data-open-price-market="${esc(market)}"${dateFrom ? ` data-open-price-from="${esc(dateFrom)}"` : ''}${dateTo ? ` data-open-price-to="${esc(dateTo)}"` : ''}`;
  }

  function renderSparkline(series) {
    if (!series) return '';
    return `<svg class="portal-exec-spark" viewBox="0 0 ${series.width} ${series.height}" preserveAspectRatio="none" aria-hidden="true"><path class="fill" d="${series.fill}"></path><path class="track" d="${series.line}"></path><path d="${series.line}"></path></svg>`;
  }

  function renderIssueRow(row) {
    return `
      <div class="portal-exec-issue-row">
        <div class="portal-exec-issue-title">
          <div>
            <strong>${esc(row.name)}</strong>
            <div class="muted small">${esc(row.article)}</div>
          </div>
          <div class="portal-exec-chip-stack">
            ${badgeHtml(row.owner || 'Без owner', row.owner && row.owner !== 'Без owner' ? 'ok' : 'warn')}
            ${badgeHtml(`Фокус ${int(row.score)}`, row.score >= 7 ? 'danger' : row.score >= 4 ? 'warn' : 'ok')}
          </div>
        </div>
        <p>${esc(row.reasons || 'Нужна ручная проверка')}</p>
      </div>
    `;
  }

  function openModal(detail) {
    const modal = ensureModal();
    modal.querySelector(`#${MODAL_ID}Title`).textContent = detail.title;
    modal.querySelector(`#${MODAL_ID}Subtitle`).textContent = detail.subtitle;
    modal.querySelector(`#${MODAL_ID}Body`).innerHTML = detail.body;
    modal.querySelector('.portal-exec-modal-card')?.scrollTo?.({ top: 0, behavior: 'auto' });
    modal.classList.add('is-open');
  }

  function openDatePicker(input) {
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      input.focus();
    }
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch (_) {}
    }
    input.click();
  }

  function buildPlatformDetail(metric, executive, mode) {
    const issueRows = metric.issues?.rows || [];
    const issueLabel = issueSummaryLabel(metric?.issues?.counters || null);
    const detailTable = metric.days.map((row) => `
      <tr>
        <td>${esc(shortDate(row.date))}</td>
        <td>${esc(int(row.planUnits))}</td>
        <td>${esc(int(row.factUnits))}</td>
        <td>${esc(row.planUnits > 0 ? pct(row.factUnits / row.planUnits) : '—')}</td>
        <td>${esc(money(row.revenue))}</td>
        <td>${esc(row.factUnits > 0 ? money(row.revenue / row.factUnits) : '—')}</td>
        <td>${esc(money(row.margin))}</td>
        <td>${esc(row.spend > 0 ? money(row.spend) : '—')}</td>
        <td>${esc(row.drr !== null ? pct(row.drr) : '—')}</td>
      </tr>
    `).join('');

    const titleSuffix = mode === 'issues' ? 'риски периода' : mode === 'ads' ? 'реклама периода' : 'детали периода';
    return {
      title: `${metric.label} · ${titleSuffix}`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('План периода', int(metric.plan))}
          ${modalSummaryCard('Факт периода', int(metric.units))}
          ${modalSummaryCard('% к плану', pct(metric.completion))}
          ${modalSummaryCard('Маржа', money(metric.margin))}
          ${modalSummaryCard('Маржинальность', pct(metric.marginPct))}
          ${modalSummaryCard('Выручка', money(metric.revenue))}
          ${modalSummaryCard('Реклама', metric.adsReady ? money(metric.spend) : 'нет факта')}
          ${modalSummaryCard('Проблемы', issueLabel)}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>День за днем</strong>
              <p>Таблица повторяет тот же диапазон, который выбран в верхнем блоке дат. Здесь удобно быстро увидеть провал по дням, план на день и связь с рекламой.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>План</th>
                  <th>Факт</th>
                  <th>%</th>
                  <th>Выручка</th>
                  <th>Средний чек</th>
                  <th>Маржа</th>
                  <th>Реклама</th>
                  <th>ДРР</th>
                </tr>
              </thead>
              <tbody>${detailTable || `<tr><td colspan="9">Нет данных под выбранный период.</td></tr>`}</tbody>
            </table>
          </div>
          <div class="portal-exec-modal-list">
            <div class="portal-exec-modal-card">
              <div class="portal-exec-modal-copy">
                <strong>Что требует внимания</strong>
                <p>${esc(issueLabel)}. Здесь собраны SKU, которые сейчас звучат как реальные причины для ручного разбора.</p>
              </div>
            </div>
            ${issueRows.length ? issueRows.slice(0, 8).map(renderIssueRow).join('') : `
              <div class="portal-exec-modal-card">
                <div class="portal-exec-modal-copy">
                  <strong>Без явных красных сигналов</strong>
                  <p>По этому блоку сейчас нет отдельного списка SKU. Значит по доступным данным площадка не выпадает в критическую зону.</p>
                </div>
              </div>
            `}
          </div>
        </div>
      `
    };
  }

  function buildCompletionDetail(metric, executive) {
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .sort((left, right) => num(right.salesValue) - num(left.salesValue) || num(right.avgTurnoverDays) - num(left.avgTurnoverDays) || right.avgPrice - left.avgPrice);
    return {
      title: `${metric.label} · выполнение план-факт`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('% выполнения', pct(metric.completion))}
          ${modalSummaryCard('План периода', int(metric.plan))}
          ${modalSummaryCard('Факт периода', int(metric.units))}
          ${modalSummaryCard('Факт / день', int(metric.avgUnits))}
          ${modalSummaryCard('Выручка', money(metric.revenue))}
          ${modalSummaryCard('Средний чек', metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}
          ${modalSummaryCard('Площадка', metric.label)}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>Артикулы площадки</strong>
              <p>Слева собран рабочий список артикулов этой же площадки: цена, оборачиваемость и owner. Справа — % выполнения по дням в выбранном периоде.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>План</th>
                  <th>Факт</th>
                  <th>%</th>
                  <th>Источник</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.planUnitsSelected !== null ? int(row.planUnitsSelected) : '—')}</td>
                    <td>${esc(row.actualUnitsSelected !== null ? int(row.actualUnitsSelected) : '—')}</td>
                    <td>${esc(row.completionPct !== null ? pct(row.completionPct) : '—')}</td>
                    <td>${esc(row.factSource === 'daily' ? 'daily' : row.factSource === 'monthly' ? 'monthly' : row.factSource === 'procurement' ? 'procurement' : 'нет')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="6">Нет SKU-среза по выбранной площадке.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>% выполнения по дням</strong>
              <p>Здесь видно, как день ко дню выполнялся план: план, факт, % выполнения и выручка того же дня.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>План</th>
                  <th>Факт</th>
                  <th>% выполнения</th>
                  <th>Выручка</th>
                </tr>
              </thead>
              <tbody>
                ${metric.days.length ? metric.days.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td>${esc(shortDate(row.date))}</td>
                    <td>${esc(int(row.planUnits))}</td>
                    <td>${esc(int(row.factUnits))}</td>
                    <td>${esc(row.planUnits > 0 ? pct(row.factUnits / row.planUnits) : '—')}</td>
                    <td>${esc(money(row.revenue))}</td>
                  </tr>
                `).join('') : `<tr><td colspan="5">Нет данных по дням в выбранном диапазоне.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `
    };
  }

  function buildPriceDetail(metric, executive) {
    const priceDailyMap = new Map((metric.priceMatrixSeries || []).map((row) => [iso(row.date), row]));
    const dailyRows = metric.days.map((row) => {
      const avgCheck = row.factUnits > 0 ? row.revenue / row.factUnits : null;
      const priceMatrix = priceDailyMap.get(iso(row.date));
      return {
        date: row.date,
        units: row.factUnits,
        revenue: row.revenue,
        avgCheck,
        avgPrice: priceMatrix?.avgPrice || 0,
        skuCount: priceMatrix?.skuCount || 0
      };
    });

    const skuRows = priceRowsForPlatform(metric.key)
      .map((row) => {
        const points = pricePointsForRow(row, executive.range.effectiveStart, executive.range.effectiveEnd);
        if (!points.length) return null;
        const startPrice = points[0]?.price || 0;
        const endPrice = points[points.length - 1]?.price || 0;
        const avgPrice = avg(points.map((point) => point.price));
        return {
          platformLabel: row.platformLabel || metric.label,
          article: row.article || row.articleKey || '—',
          name: row.name || row.article || row.articleKey || '—',
          owner: row.owner || 'Без owner',
          startPrice,
          endPrice,
          avgPrice,
          minPrice: num(row.minPrice),
          currentTurnoverDays: Number.isFinite(Number(row.currentTurnoverDays))
            ? Number(row.currentTurnoverDays)
            : Number.isFinite(Number(row.turnoverDays))
              ? Number(row.turnoverDays)
              : null,
          deltaPct: startPrice > 0 ? (endPrice - startPrice) / startPrice : null
        };
      })
      .filter(Boolean)
      .sort((left, right) => Math.abs(num(right.deltaPct)) - Math.abs(num(left.deltaPct)) || right.avgPrice - left.avgPrice);

    return {
      title: `${metric.label} · средний чек`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Средний чек', metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}
          ${modalSummaryCard('Средняя цена витрины', metric.priceMatrixAvg > 0 ? money(metric.priceMatrixAvg) : '—')}
          ${modalSummaryCard('Цена в начале', metric.priceMatrixStart > 0 ? money(metric.priceMatrixStart) : '—')}
          ${modalSummaryCard('Цена в конце', metric.priceMatrixEnd > 0 ? money(metric.priceMatrixEnd) : '—')}
          ${modalSummaryCard('Выручка', money(metric.revenue))}
          ${modalSummaryCard('Факт / день', int(metric.avgUnits))}
          ${modalSummaryCard('SKU в ценовом слое', int(skuRows.length))}
          ${modalSummaryCard('Площадка', metric.label)}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>Артикулы и ценовой слой</strong>
              <p>Слева — список артикулов этой площадки. Видно, как менялась цена, какой сейчас коридор и какая оборачиваемость у SKU.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Цена на старте</th>
                  <th>Цена на финише</th>
                  <th>Δ</th>
                  <th>Средняя цена</th>
                  <th>Оборач.</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.startPrice > 0 ? money(row.startPrice) : '—')}</td>
                    <td>${esc(row.endPrice > 0 ? money(row.endPrice) : '—')}</td>
                    <td>${esc(row.deltaPct !== null ? pct(row.deltaPct) : '—')}</td>
                    <td>${esc(row.avgPrice > 0 ? money(row.avgPrice) : '—')}</td>
                    <td>${esc(row.currentTurnoverDays !== null ? `${row.currentTurnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="8">В price matrix нет строк по выбранному диапазону.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>Средний чек по дням</strong>
              <p>Справа — дневной ряд по выбранному периоду: штуки, выручка, средний чек и средняя цена витрины.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Штуки</th>
                  <th>Выручка</th>
                  <th>Средний чек</th>
                  <th>Средняя цена</th>
                  <th>SKU</th>
                </tr>
              </thead>
              <tbody>
                ${dailyRows.length ? dailyRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td>${esc(shortDate(row.date))}</td>
                    <td>${esc(int(row.units))}</td>
                    <td>${esc(money(row.revenue))}</td>
                    <td>${esc(row.avgCheck ? money(row.avgCheck) : '—')}</td>
                    <td>${esc(row.avgPrice > 0 ? money(row.avgPrice) : '—')}</td>
                    <td>${esc(int(row.skuCount))}</td>
                  </tr>
                `).join('') : `<tr><td colspan="6">Нет дневных фактов в выбранном диапазоне.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `
    };
  }

  function buildRevenueDetail(metric, executive) {
    const priceDailyMap = new Map((metric.priceMatrixSeries || []).map((row) => [iso(row.date), row]));
    const dailyRows = metric.days.map((row) => {
      const avgCheck = row.factUnits > 0 ? row.revenue / row.factUnits : null;
      const priceMatrix = priceDailyMap.get(iso(row.date));
      return {
        date: row.date,
        planUnits: row.planUnits,
        units: row.factUnits,
        revenue: row.revenue,
        avgCheck,
        avgPrice: priceMatrix?.avgPrice || 0,
        completion: row.planUnits > 0 ? row.factUnits / row.planUnits : null
      };
    });
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .sort((left, right) => num(right.actualRevenueSelected) - num(left.actualRevenueSelected) || num(right.actualUnitsSelected) - num(left.actualUnitsSelected) || num(right.avgTurnoverDays) - num(left.avgTurnoverDays));

    return {
      title: `${metric.label} · продажи`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Продажи', money(metric.revenue))}
          ${modalSummaryCard('Продано, шт.', int(metric.units))}
          ${modalSummaryCard('План периода', int(metric.plan))}
          ${modalSummaryCard('% к плану', pct(metric.completion))}
          ${modalSummaryCard('Факт / день', int(metric.avgUnits))}
          ${modalSummaryCard('Средний чек', metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}
          ${modalSummaryCard('Средняя цена витрины', metric.priceMatrixAvg > 0 ? money(metric.priceMatrixAvg) : '—')}
          ${modalSummaryCard('Площадка', metric.label)}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>Артикулы площадки</strong>
              <p>Слева — рабочий список артикулов той же площадки. Справа — продажи по дням и % выполнения внутри выбранного периода.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Выручка</th>
                  <th>Факт</th>
                  <th>План</th>
                  <th>%</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.actualRevenueSelected !== null ? money(row.actualRevenueSelected) : '—')}</td>
                    <td>${esc(row.actualUnitsSelected !== null ? int(row.actualUnitsSelected) : '—')}</td>
                    <td>${esc(row.planUnitsSelected !== null ? int(row.planUnitsSelected) : '—')}</td>
                    <td>${esc(row.completionPct !== null ? pct(row.completionPct) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">Нет SKU по этому диапазону.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>Продажи и % выполнения по дням</strong>
              <p>Здесь видно дневной план, факт, % выполнения, продажи и средний чек по выбранной площадке.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>План</th>
                  <th>Факт</th>
                  <th>% выполнения</th>
                  <th>Продажи</th>
                  <th>Средний чек</th>
                  <th>Средняя цена</th>
                </tr>
              </thead>
              <tbody>
                ${dailyRows.length ? dailyRows.map((row) => `
                  <tr>
                    <td>${esc(shortDate(row.date))}</td>
                    <td>${esc(int(row.planUnits))}</td>
                    <td>${esc(int(row.units))}</td>
                    <td>${esc(row.completion !== null ? pct(row.completion) : '—')}</td>
                    <td>${esc(money(row.revenue))}</td>
                    <td>${esc(row.avgCheck ? money(row.avgCheck) : '—')}</td>
                    <td>${esc(row.avgPrice > 0 ? money(row.avgPrice) : '—')}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">Нет данных по продажам в выбранном диапазоне.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `
    };
  }

  function buildMarginDetail(metric, executive) {
    const rows = marginRowsForPlatform(metric.key)
      .sort((left, right) => left.marginPct - right.marginPct || right.stock - left.stock);
    return {
      title: `${metric.label} · маржа и SKU`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Маржа', money(metric.margin))}
          ${modalSummaryCard('Маржинальность', pct(metric.marginPct))}
          ${modalSummaryCard('Выручка', money(metric.revenue))}
          ${modalSummaryCard('Продано, шт.', int(metric.units))}
          ${modalSummaryCard('Отрицательная маржа', int(metric.issues?.counters?.negativeMargin || 0))}
          ${modalSummaryCard('SKU в списке', int(rows.length))}
          ${modalSummaryCard('Площадка', metric.label)}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>Артикулы и маржа по SKU</strong>
              <p>Слева — полный список SKU этой площадки с текущей маржей, остатком, ценой и оборачиваемостью. Справа — маржа по дням.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Маржа %</th>
                  <th>Остаток</th>
                  <th>Оборач.</th>
                  <th>Цена</th>
                  <th>Мин. цена</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(pct(row.marginPct))}</td>
                    <td>${esc(int(row.stock))}</td>
                    <td>${esc(row.turnoverDays !== null ? `${row.turnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(row.currentPrice > 0 ? money(row.currentPrice) : '—')}</td>
                    <td>${esc(row.minPrice > 0 ? money(row.minPrice) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="8">Нет SKU по марже для выбранной площадки.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>Маржа по дням</strong>
              <p>Здесь видно дневную выручку, маржу, маржинальность и объём продаж по тому же периоду.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Выручка</th>
                  <th>Маржа</th>
                  <th>Маржинальность</th>
                  <th>Шт.</th>
                </tr>
              </thead>
              <tbody>
                ${metric.days.length ? metric.days.map((row) => `
                  <tr>
                    <td>${esc(shortDate(row.date))}</td>
                    <td>${esc(money(row.revenue))}</td>
                    <td>${esc(money(row.margin))}</td>
                    <td>${esc(row.revenue > 0 ? pct(row.margin / row.revenue) : '—')}</td>
                    <td>${esc(int(row.factUnits))}</td>
                  </tr>
                `).join('') : `<tr><td colspan="5">Нет дневных данных по марже.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `
    };
  }

  function buildStockDetail(platformKey, executive) {
    const stockMetric = buildTurnoverMetric(platformKey, executive.range);
    const turnoverRows = articleRowsForPlatform(platformKey, executive.range)
      .sort((left, right) => num(right.avgTurnoverDays) - num(left.avgTurnoverDays) || right.stock - left.stock);
    const priceDailyMap = new Map(priceMatrixSeries(platformKey, executive.range).map((row) => [iso(row.date), row]));
    return {
      title: `${stockMetric.label} · оборачиваемость и остатки`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Остаток, шт.', int(stockMetric.totalStock))}
          ${modalSummaryCard('В пути, шт.', int(stockMetric.totalTransit))}
          ${modalSummaryCard('Средняя оборачиваемость', stockMetric.avgTurnoverDays !== null ? `${stockMetric.avgTurnoverDays.toFixed(1)} дн.` : '—')}
          ${modalSummaryCard('Низкое покрытие', int(stockMetric.lowCoverage))}
          ${modalSummaryCard('Избыточный запас', int(stockMetric.overstock))}
          ${modalSummaryCard('SKU в срезе', int(stockMetric.skuCount))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>Артикулы, остаток и оборачиваемость</strong>
              <p>Слева — полный список SKU площадки: остаток, в пути, оборачиваемость, цена и маржа. Справа — дневная оборачиваемость, если она есть в витрине.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Оборач.</th>
                  <th>Остаток</th>
                  <th>В пути</th>
                  <th>Цена</th>
                  <th>Маржа %</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${turnoverRows.length ? turnoverRows.map((row) => `
                  <tr>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.avgTurnoverDays !== null ? `${row.avgTurnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(int(row.stock))}</td>
                    <td>${esc(int(row.inTransit))}</td>
                    <td>${esc(row.currentPrice > 0 ? money(row.currentPrice) : row.avgPrice > 0 ? money(row.avgPrice) : '—')}</td>
                    <td>${esc(row.marginPct !== null ? pct(row.marginPct) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="8">По этой площадке пока нет SKU-среза.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-modal-card">
            <div class="portal-exec-modal-copy">
              <strong>Оборачиваемость по дням</strong>
              <p>Если в price matrix есть daily-ряд по оборачиваемости, он показывается здесь. Если ряд ещё не приехал, останется только текущий срез по SKU слева.</p>
            </div>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Средняя оборач.</th>
                  <th>SKU с daily</th>
                  <th>Средняя цена</th>
                </tr>
              </thead>
              <tbody>
                ${stockMetric.turnoverSeries.length ? stockMetric.turnoverSeries.map((row) => `
                  <tr>
                    <td>${esc(shortDate(row.date))}</td>
                    <td>${esc(row.avgTurnover !== null ? `${row.avgTurnover.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(int(row.skuCount))}</td>
                    <td>${esc(priceDailyMap.get(iso(row.date))?.avgPrice > 0 ? money(priceDailyMap.get(iso(row.date)).avgPrice) : '—')}</td>
                  </tr>
                `).join('') : `<tr><td colspan="4">Для этой площадки daily-ряд по оборачиваемости в выбранном периоде пока не опубликован.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `
    };
  }

  function buildAdsDetail(metric, executive) {
    if (!metric.adsReady) {
      return {
        title: `${metric.label} · реклама`,
        subtitle: 'В этом диапазоне опубликованных рекламных фактов пока нет.',
        body: `<div class="portal-exec-empty">Рекламная витрина для этого диапазона пока пустая. Как только в витрину попадет ads_summary, здесь появится воронка, дневная динамика и список товаров.</div>`
      };
    }

    const items = (current('adsSummary')?.itemSeries || [])
      .map((item) => ({
        date: parseDate(item?.date),
        platformKey: String(item?.platformKey || '').toLowerCase(),
        article: String(item?.articleKey || item?.offer_id || item?.offerId || '').trim(),
        name: String(item?.name || item?.articleKey || '').trim(),
        views: num(item?.views),
        clicks: num(item?.clicks),
        spend: num(item?.spend),
        orders: num(item?.orders),
        revenue: num(item?.revenue)
      }))
      .filter((item) => item.date instanceof Date && !Number.isNaN(item.date.getTime()))
      .filter((item) => (metric.key === 'all' ? true : item.platformKey === metric.key))
      .filter((item) => item.date >= executive.range.effectiveStart && item.date <= executive.range.effectiveEnd);

    const grouped = new Map();
    items.forEach((item) => {
      const key = item.article || item.name || 'Без SKU';
      if (!grouped.has(key)) grouped.set(key, { article: item.article || key, name: item.name || item.article || key, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 });
      const bucket = grouped.get(key);
      bucket.views += item.views;
      bucket.clicks += item.clicks;
      bucket.spend += item.spend;
      bucket.orders += item.orders;
      bucket.revenue += item.revenue;
    });

    const rows = [...grouped.values()]
      .map((item) => ({ ...item, ctr: item.views > 0 ? item.clicks / item.views : null, drr: item.revenue > 0 ? item.spend / item.revenue : null }))
      .sort((left, right) => right.revenue - left.revenue || right.orders - left.orders)
      .slice(0, 18);

    return {
      title: `${metric.label} · рекламная воронка`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Показы', int(metric.views))}
          ${modalSummaryCard('Клики', int(metric.clicks))}
          ${modalSummaryCard('Заказы', int(metric.orders))}
          ${modalSummaryCard('CTR', metric.ctr !== null ? pct(metric.ctr) : '—')}
          ${modalSummaryCard('Затраты', money(metric.spend))}
          ${modalSummaryCard('Выручка с рекламы', money(metric.adRevenue))}
          ${modalSummaryCard('ДРР', metric.drr !== null ? pct(metric.drr) : '—')}
          ${modalSummaryCard('Площадка', metric.label)}
        </div>
        <div class="portal-exec-modal-card">
          <table class="portal-exec-modal-table">
            <thead>
              <tr>
                <th>Товар / SKU</th>
                <th>Показы</th>
                <th>Клики</th>
                <th>Заказы</th>
                <th>Затраты</th>
                <th>Выручка</th>
                <th>CTR</th>
                <th>ДРР</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map((row) => `
                <tr>
                  <td><strong>${esc(row.name)}</strong><div class="muted small">${esc(row.article)}</div></td>
                  <td>${esc(int(row.views))}</td>
                  <td>${esc(int(row.clicks))}</td>
                  <td>${esc(int(row.orders))}</td>
                  <td>${esc(money(row.spend))}</td>
                  <td>${esc(money(row.revenue))}</td>
                  <td>${esc(row.ctr !== null ? pct(row.ctr) : '—')}</td>
                  <td>${esc(row.drr !== null ? pct(row.drr) : '—')}</td>
                </tr>
              `).join('') : `<tr><td colspan="8">По этому диапазону нет рекламных SKU-строк.</td></tr>`}
            </tbody>
          </table>
        </div>
      `
    };
  }

  function buildContentSliceDetail() {
    const summary = contentSliceSummary();
    const periodLabel = summary.periods.length ? summary.periods.join(' · ') : 'последний доступный срез';
    const subtitle = summary.usingLeaderboard
      ? `${periodLabel}. Источник: продуктовый лидерборд, обновлено ${fmt.date(summary.generatedAt)}.`
      : `${periodLabel}. Этот блок пока не управляется календарём и нужен как временная витрина, пока daily ads_summary не опубликован.`;
    return {
      title: summary.usingLeaderboard
        ? 'Контент и окупаемость (ROMI) · продуктовый лидерборд'
        : 'Контент и окупаемость (ROMI) · последний доступный срез',
      subtitle,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Посты', int(summary.posts))}
          ${modalSummaryCard('Клики', int(summary.clicks))}
          ${modalSummaryCard('Заказы', int(summary.orders))}
          ${modalSummaryCard('Расчётные затраты', money(summary.spend))}
          ${modalSummaryCard('Выручка', money(summary.revenue))}
          ${modalSummaryCard('ROMI', summary.romi !== null ? pct(summary.romi) : '—')}
          ${modalSummaryCard('Топ SKU', summary.topRow ? summary.topRow.article : '—')}
          ${modalSummaryCard('Источник', summary.sourceLabel)}
          ${modalSummaryCard('Режим', summary.modeLabel)}
        </div>
        <div class="portal-exec-modal-card">
          <table class="portal-exec-modal-table">
            <thead>
              <tr>
                <th>Товар / SKU</th>
                <th>Посты</th>
                <th>Клики</th>
                <th>Заказы</th>
                <th>Выручка</th>
                <th>Расчётные затраты</th>
                <th>Окупаемость, ROMI</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              ${summary.rows.length ? summary.rows.map((row) => `
                <tr>
                  <td><strong>${esc(row.name)}</strong><div class="muted small">${esc(row.article)}</div></td>
                  <td>${esc(int(row.posts))}</td>
                  <td>${esc(int(row.clicks))}</td>
                  <td>${esc(int(row.orders))}</td>
                  <td>${esc(money(row.revenue))}</td>
                  <td>${esc(row.spend > 0 ? money(row.spend) : '—')}</td>
                  <td>${esc(contentRomiLabel(row.romi))}</td>
                  <td>${esc(row.owner || 'Без owner')}</td>
                </tr>
              `).join('') : `<tr><td colspan="8">Нет доступных строк по контенту.</td></tr>`}
            </tbody>
          </table>
        </div>
      `
    };
  }

  function visibleMetrics(executive) {
    return (executive?.scopedMetrics || []).filter((metric) => metric.key !== 'all');
  }

  function currentFocusLabel(executive) {
    return executive?.selectedPlatform === 'all'
      ? 'Все площадки'
      : executive?.focusMetric?.label || 'Площадка';
  }

  function sectionMetaHtml(executive, extraBadges = []) {
    const badges = [
      badgeHtml(`Период: ${executive.range.effectiveLabel}`, 'info'),
      badgeHtml(`Площадка: ${currentFocusLabel(executive)}`, executive.selectedPlatform === 'all' ? 'info' : 'ok'),
      ...extraBadges
    ].join('');
    return `<div class="portal-exec-chip-stack">${badges}</div>`;
  }

  function relativeDelta(currentValue, previousValue) {
    if (!Number.isFinite(Number(previousValue)) || Number(previousValue) === 0) return null;
    return (Number(currentValue) - Number(previousValue)) / Math.abs(Number(previousValue));
  }

  function percentagePointDelta(currentValue, previousValue) {
    if (!Number.isFinite(Number(currentValue)) || !Number.isFinite(Number(previousValue))) return null;
    return Number(currentValue) - Number(previousValue);
  }

  function deltaBadge(label, delta, invert = false, mode = 'pct') {
    if (delta === null) return badgeHtml(`${label} нет LFL`, 'info');
    const tone = invert
      ? (delta <= 0 ? 'ok' : delta <= 0.08 ? 'warn' : 'danger')
      : (delta >= 0 ? 'ok' : delta >= -0.08 ? 'warn' : 'danger');
    const value = mode === 'pp'
      ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} п.п.`
      : `${delta >= 0 ? '+' : ''}${pct(delta)}`;
    return badgeHtml(`${label} ${value}`, tone);
  }

  function periodSection(executive, adsReady) {
    const contentSummary = contentSliceSummary();
    const contentReady = contentSummary.rows.length > 0;
    const activePlatformLabel = currentFocusLabel(executive);
    const selectedStart = parseDate(executive.range.state.start) || executive.range.effectiveStart;
    const selectedEnd = parseDate(executive.range.state.end) || executive.range.effectiveEnd;
    const clampAlert = executive.range.clamped
      ? `<div class="portal-exec-period-alert"><strong>Внимание:</strong> выбранный период шире доступного факта. Карточки ниже сейчас считаются только по ${esc(executive.range.effectiveLabel)}, потому что в источнике опубликованы данные за ${esc(executive.range.availableLabel)}.</div>`
      : '';
    const infoBadges = [
      badgeHtml(`Запрос: ${executive.range.requestedLabel}`, 'info'),
      badgeHtml(`В расчёте: ${executive.range.effectiveLabel}`, executive.range.clamped ? 'warn' : 'ok'),
      badgeHtml(`Факт доступен до ${shortDate(executive.range.max)}`, 'info'),
      badgeHtml(`История: ${int(executive.range.availableDays)} дн.`, executive.range.availableDays >= 7 ? 'ok' : 'warn'),
      badgeHtml(`Площадка: ${activePlatformLabel}`, executive.selectedPlatform === 'all' ? 'info' : 'ok'),
      badgeHtml(
        adsReady
          ? 'Реклама подключена'
          : contentReady
            ? contentSummary.usingLeaderboard
              ? 'Контент из лидерборда подключен'
              : 'Daily-реклама ждёт публикации, fallback доступен'
            : 'Реклама пока без факта',
        adsReady ? 'ok' : 'warn'
      )
    ].join('');
    return `
      <section class="portal-exec-surface is-highlight">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h2>Период и площадка</h2>
            <p>Это единый фильтр всей главной страницы. Все блоки ниже пересчитываются от выбранного диапазона и площадки: план / факт, выручка, средний чек, маржа, реклама, остатки и срочные задачи.</p>
          </div>
          <div class="portal-exec-chip-stack">${infoBadges}</div>
        </div>
        <div class="portal-exec-period-grid">
          <div class="portal-exec-period-panel">
            <h4>Период и площадка</h4>
            <p>Это единый блок управления всей главной страницей. Сначала выбираете даты, потом площадку. Все секции ниже пересчитываются по этим двум фильтрам.</p>
            <div class="portal-exec-filter-row">
              <div class="portal-exec-filter-group">
                <div class="portal-exec-filter-label">Быстрые периоды</div>
                <div class="portal-exec-presets">
                  ${PRESET_KEYS.map((key) => {
                    const active = executive.range.state.mode === 'preset' && executive.range.state.active === key;
                    const label = key === 'yesterday' ? 'Вчера' : key === 'prevweek' ? 'Прошлая неделя' : `${key} дн`;
                    return `<button type="button" class="quick-chip ${active ? 'active' : ''}" data-portal-exec-preset="${key}">${label}</button>`;
                  }).join('')}
                </div>
              </div>
              <div class="portal-exec-filter-group">
                <div class="portal-exec-filter-label">Площадки</div>
                <div class="portal-exec-filter-chips">
                  ${[
                    { key: 'all', label: 'Все' },
                    { key: 'wb', label: 'WB' },
                    { key: 'ozon', label: 'Ozon' },
                    { key: 'ya', label: 'ЯМ / сети' }
                  ].map((platform) => `
                    <button
                      type="button"
                      class="portal-exec-filter-chip ${executive.selectedPlatform === platform.key ? 'active' : ''}"
                      data-portal-exec-platform="${platform.key}"
                    >${platform.label}</button>
                  `).join('')}
                </div>
              </div>
            </div>
            <div class="portal-exec-dates">
              <label class="portal-exec-date-field ${selectedStart ? 'is-selected' : ''}">
                <span>Дата начала</span>
                <div class="portal-exec-date-shell">
                  <input type="date" class="portal-exec-date-input ${executive.range.state.mode === 'custom' ? 'is-active' : ''}" data-portal-exec-start min="${esc(iso(executive.range.min))}" max="${esc(iso(executive.range.max))}" value="${esc(executive.range.state.start || '')}">
                  <button type="button" class="portal-exec-date-trigger ${executive.range.state.mode === 'custom' ? 'active' : ''}" data-portal-exec-open-date="start">Календарь</button>
                </div>
                <small class="portal-exec-date-value">${esc(longDate(selectedStart))}</small>
              </label>
              <label class="portal-exec-date-field ${selectedEnd ? 'is-selected' : ''}">
                <span>Дата окончания</span>
                <div class="portal-exec-date-shell">
                  <input type="date" class="portal-exec-date-input ${executive.range.state.mode === 'custom' ? 'is-active' : ''}" data-portal-exec-end min="${esc(iso(executive.range.min))}" max="${esc(iso(executive.range.max))}" value="${esc(executive.range.state.end || '')}">
                  <button type="button" class="portal-exec-date-trigger ${executive.range.state.mode === 'custom' ? 'active' : ''}" data-portal-exec-open-date="end">Календарь</button>
                </div>
                <small class="portal-exec-date-value">${esc(longDate(selectedEnd))}</small>
              </label>
            </div>
            <div class="portal-exec-period-note" style="margin-top:12px">Календарь открывается по клику в поле или по кнопке рядом. Выбранный диапазон подсвечен и сразу отражается на всех карточках ниже.</div>
          </div>
          <div class="portal-exec-period-panel">
            <h4>Что сейчас считает экран</h4>
            <div class="portal-exec-period-note"><strong>Запрос:</strong> ${esc(executive.range.requestedLabel)}</div>
            <div class="portal-exec-period-note" style="margin-top:8px"><strong>В расчёте:</strong> ${esc(executive.range.effectiveLabel)}</div>
            <div class="portal-exec-period-note" style="margin-top:8px"><strong>Доступные факты:</strong> ${esc(executive.range.availableLabel)}${executive.range.note ? ` · ${esc(executive.range.note)}` : ''}</div>
            <div class="portal-exec-period-note" style="margin-top:8px"><strong>Активная площадка:</strong> ${esc(activePlatformLabel)}</div>
            ${clampAlert}
            <div class="portal-exec-period-note" style="margin-top:12px">Если диапазон выходит за пределы факта, экран честно сужает расчёт и прямо пишет это здесь, чтобы решения не принимались на невалидных цифрах.</div>
          </div>
        </div>
      </section>
    `;
  }

  function renderActionSection(items, emptyCopy) {
    return `
      <div class="portal-exec-modal-actions">
        ${renderActionBullets(items, emptyCopy)}
      </div>
    `;
  }

  function buildCompletionDetail(metric, executive) {
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .sort((left, right) => num(left.completionPct) - num(right.completionPct) || num(right.planUnitsSelected) - num(left.planUnitsSelected) || num(right.salesValue) - num(left.salesValue))
      .slice(0, 18);
    const focusDays = detailTailRows(metric.days, 14);
    const previous = executive.compareByKey.get(metric.key);
    const completionDelta = percentagePointDelta(metric.completion, previous?.completion);
    return {
      title: `${metric.label} · план-факт по артикулам`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчете: ${executive.range.effectiveLabel}. Справа всегда последние 14 дней доступного факта.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('% выполнения', pct(metric.completion))}
          ${modalSummaryCard('WoW', completionDelta !== null ? `${completionDelta >= 0 ? '+' : ''}${(completionDelta * 100).toFixed(1)} pp` : '—')}
          ${modalSummaryCard('План периода', int(metric.plan))}
          ${modalSummaryCard('Факт периода', int(metric.units))}
          ${modalSummaryCard('Факт / день', int(metric.avgUnits))}
          ${modalSummaryCard('Выручка', money(metric.revenue))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Короткий список для разбора: кто не добирает план, кто делает выручку и кого нужно открыть во вкладке цен.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>План</th>
                  <th>Факт</th>
                  <th>%</th>
                  <th>Выручка</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.planUnitsSelected !== null ? int(row.planUnitsSelected) : '—')}</td>
                    <td>${esc(row.actualUnitsSelected !== null ? int(row.actualUnitsSelected) : '—')}</td>
                    <td>${esc(row.completionPct !== null ? pct(row.completionPct) : '—')}</td>
                    <td>${esc(row.salesValue ? money(row.salesValue) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По выбранной площадке нет SKU-среза.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">План, факт и выручка по дням. Это окно отвечает на вопрос: когда именно начался провал или ускорение.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>План</th>
                    <th>Факт</th>
                    <th>%</th>
                    <th>Выручка</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(int(row.planUnits))}</td>
                      <td>${esc(int(row.factUnits))}</td>
                      <td>${esc(row.planUnits > 0 ? pct(row.factUnits / row.planUnits) : '—')}</td>
                      <td>${esc(money(row.revenue))}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="5">Нет дневных данных по выбранному окну.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${renderActionSection(metricActionBullets(metric, executive), 'План-факт выглядит стабильно, открывайте только отдельные SKU с вопросами.')}
      `
    };
  }

  function buildPriceDetail(metric, executive) {
    const previous = executive.compareByKey.get(metric.key);
    const avgCheckDelta = relativeDelta(metric.avgCheck, previous?.avgCheck);
    const priceDailyMap = new Map((metric.priceMatrixSeries || []).map((row) => [iso(row.date), row]));
    const focusDays = detailTailRows(metric.days, 14).map((row) => {
      const avgCheck = row.factUnits > 0 ? row.revenue / row.factUnits : null;
      const matrix = priceDailyMap.get(iso(row.date));
      return {
        date: row.date,
        units: row.factUnits,
        revenue: row.revenue,
        avgCheck,
        avgPrice: matrix?.avgPrice || 0,
        skuCount: matrix?.skuCount || 0
      };
    });
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .map((row) => ({
        ...row,
        deltaPct: row.startPrice > 0 && row.endPrice > 0 ? (row.endPrice - row.startPrice) / row.startPrice : null
      }))
      .sort((left, right) => Math.abs(num(right.deltaPct)) - Math.abs(num(left.deltaPct)) || num(right.avgPrice) - num(left.avgPrice))
      .slice(0, 18);
    return {
      title: `${metric.label} · средний чек и цена`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчете: ${executive.range.effectiveLabel}. Справа последние 14 дней витринной цены и среднего чека.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Средний чек', metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}
          ${modalSummaryCard('WoW', avgCheckDelta !== null ? pct(avgCheckDelta) : '—')}
          ${modalSummaryCard('Средняя цена витрины', metric.priceMatrixAvg > 0 ? money(metric.priceMatrixAvg) : '—')}
          ${modalSummaryCard('Цена на старте', metric.priceMatrixStart > 0 ? money(metric.priceMatrixStart) : '—')}
          ${modalSummaryCard('Цена на финише', metric.priceMatrixEnd > 0 ? money(metric.priceMatrixEnd) : '—')}
          ${modalSummaryCard('SKU в матрице', int(priceRowsForPlatform(metric.key).length))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Кто двигал средний чек: изменение MP, текущая оборачиваемость и выручка по SKU.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Старт MP</th>
                  <th>Финиш MP</th>
                  <th>Δ</th>
                  <th>Обор.</th>
                  <th>Выручка</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.startPrice > 0 ? money(row.startPrice) : '—')}</td>
                    <td>${esc(row.endPrice > 0 ? money(row.endPrice) : '—')}</td>
                    <td>${esc(row.deltaPct !== null ? pct(row.deltaPct) : '—')}</td>
                    <td>${esc(row.avgTurnoverDays !== null ? `${row.avgTurnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(row.salesValue ? money(row.salesValue) : '—')}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По выбранному окну нет ценового списка.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Средний чек, выручка, витринная цена и число SKU в ежедневном срезе.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Шт.</th>
                    <th>Выручка</th>
                    <th>Средний чек</th>
                    <th>Средняя цена</th>
                    <th>SKU</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(int(row.units))}</td>
                      <td>${esc(money(row.revenue))}</td>
                      <td>${esc(row.avgCheck ? money(row.avgCheck) : '—')}</td>
                      <td>${esc(row.avgPrice > 0 ? money(row.avgPrice) : '—')}</td>
                      <td>${esc(int(row.skuCount))}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="6">Нет 14-дневного ряда по среднему чеку.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${renderActionSection(metricActionBullets(metric, executive), 'Слой цены выглядит ровно. Смотрите только SKU с резкой дельтой или плохой оборачиваемостью.')}
      `
    };
  }

  function buildRevenueDetail(metric, executive) {
    const previous = executive.compareByKey.get(metric.key);
    const revenueDelta = relativeDelta(metric.revenue, previous?.revenue);
    const priceDailyMap = new Map((metric.priceMatrixSeries || []).map((row) => [iso(row.date), row]));
    const focusDays = detailTailRows(metric.days, 14).map((row) => {
      const avgCheck = row.factUnits > 0 ? row.revenue / row.factUnits : null;
      const matrix = priceDailyMap.get(iso(row.date));
      return {
        date: row.date,
        planUnits: row.planUnits,
        units: row.factUnits,
        completion: row.planUnits > 0 ? row.factUnits / row.planUnits : null,
        revenue: row.revenue,
        avgCheck,
        avgPrice: matrix?.avgPrice || 0
      };
    });
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .sort((left, right) => num(right.salesValue) - num(left.salesValue) || num(right.actualUnitsSelected) - num(left.actualUnitsSelected))
      .slice(0, 18);
    return {
      title: `${metric.label} · оборот и продажи`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчете: ${executive.range.effectiveLabel}. Справа последние 14 дней оборота.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Выручка', money(metric.revenue))}
          ${modalSummaryCard('WoW', revenueDelta !== null ? pct(revenueDelta) : '—')}
          ${modalSummaryCard('Продано, шт.', int(metric.units))}
          ${modalSummaryCard('План периода', int(metric.plan))}
          ${modalSummaryCard('% к плану', pct(metric.completion))}
          ${modalSummaryCard('Средний чек', metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Топ SKU по обороту. Отсюда удобно сразу открыть карточку цены и проверить причину изменения.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Выручка</th>
                  <th>Факт</th>
                  <th>План</th>
                  <th>%</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.salesValue ? money(row.salesValue) : '—')}</td>
                    <td>${esc(row.actualUnitsSelected !== null ? int(row.actualUnitsSelected) : '—')}</td>
                    <td>${esc(row.planUnitsSelected !== null ? int(row.planUnitsSelected) : '—')}</td>
                    <td>${esc(row.completionPct !== null ? pct(row.completionPct) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">Нет SKU-списка по обороту.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Дневной ряд продаж, плана, выручки и среднего чека. Он нужен для быстрого ответа, когда началось изменение.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>План</th>
                    <th>Факт</th>
                    <th>%</th>
                    <th>Выручка</th>
                    <th>Средний чек</th>
                    <th>Средняя цена</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(int(row.planUnits))}</td>
                      <td>${esc(int(row.units))}</td>
                      <td>${esc(row.completion !== null ? pct(row.completion) : '—')}</td>
                      <td>${esc(money(row.revenue))}</td>
                      <td>${esc(row.avgCheck ? money(row.avgCheck) : '—')}</td>
                      <td>${esc(row.avgPrice > 0 ? money(row.avgPrice) : '—')}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="7">Нет дневных данных по продажам.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${renderActionSection(metricActionBullets(metric, executive), 'Оборот выглядит стабильно. Используйте левый список как короткий лист лидеров по выручке.')}
      `
    };
  }

  function buildMarginDetail(metric, executive) {
    const previous = executive.compareByKey.get(metric.key);
    const marginDelta = relativeDelta(metric.margin, previous?.margin);
    const rows = marginRowsForPlatform(metric.key)
      .sort((left, right) => left.marginPct - right.marginPct || right.stock - left.stock)
      .slice(0, 18);
    const focusDays = detailTailRows(metric.days, 14);
    return {
      title: `${metric.label} · маржа по SKU`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчете: ${executive.range.effectiveLabel}. Справа последние 14 дней маржи и выручки.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Маржа', money(metric.margin))}
          ${modalSummaryCard('WoW', marginDelta !== null ? pct(marginDelta) : '—')}
          ${modalSummaryCard('Маржинальность', pct(metric.marginPct))}
          ${modalSummaryCard('Выручка', money(metric.revenue))}
          ${modalSummaryCard('Продано, шт.', int(metric.units))}
          ${modalSummaryCard('Отрицательная маржа', int(metric.issues?.counters?.negativeMargin || 0))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Позиции с самой низкой маржой. Это короткий список для перехода в карточку цены и проверки коридора.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Маржа %</th>
                  <th>Остаток</th>
                  <th>Обор.</th>
                  <th>Цена</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(pct(row.marginPct))}</td>
                    <td>${esc(int(row.stock))}</td>
                    <td>${esc(row.turnoverDays !== null ? `${row.turnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(row.currentPrice > 0 ? money(row.currentPrice) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По площадке нет SKU по марже.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Дневная маржа, маржинальность, выручка и штуки. Это помогает отличить ценовую проблему от проблемы спроса.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Выручка</th>
                    <th>Маржа</th>
                    <th>Маржинальность</th>
                    <th>Шт.</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(money(row.revenue))}</td>
                      <td>${esc(money(row.margin))}</td>
                      <td>${esc(row.revenue > 0 ? pct(row.margin / row.revenue) : '—')}</td>
                      <td>${esc(int(row.factUnits))}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="5">Нет дневных данных по марже.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${renderActionSection(metricActionBullets(metric, executive), 'Маржа по окну выглядит ровно. В первую очередь проверяйте только позиции с худшей маржинальностью слева.')}
      `
    };
  }

  function buildStockDetail(platformKey, executive) {
    const stockMetric = buildTurnoverMetric(platformKey, executive.range);
    const turnoverRows = articleRowsForPlatform(platformKey, executive.range)
      .sort((left, right) => num(right.avgTurnoverDays) - num(left.avgTurnoverDays) || right.stock - left.stock)
      .slice(0, 18);
    const priceDailyMap = new Map(priceMatrixSeries(platformKey, executive.range).map((row) => [iso(row.date), row]));
    const focusDays = detailTailRows(stockMetric.turnoverPublishedSeries, 14);
    return {
      title: `${stockMetric.label} · оборачиваемость и запас`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчете: ${executive.range.effectiveLabel}. Справа последние 14 дней ряда по оборачиваемости, если он опубликован.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Остаток, шт.', int(stockMetric.totalStock))}
          ${modalSummaryCard('В пути, шт.', int(stockMetric.totalTransit))}
          ${modalSummaryCard('Средняя оборачиваемость', stockMetric.avgTurnoverDays !== null ? `${stockMetric.avgTurnoverDays.toFixed(1)} дн.` : '—')}
          ${modalSummaryCard('Низкое покрытие', int(stockMetric.lowCoverage))}
          ${modalSummaryCard('Избыточный запас', int(stockMetric.overstock))}
          ${modalSummaryCard('SKU в срезе', int(stockMetric.skuCount))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Список SKU по запасу и оборачиваемости. Это главный слой для решения: распродавать, поднимать цену или дозаказывать.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Обор.</th>
                  <th>Остаток</th>
                  <th>В пути</th>
                  <th>Маржа %</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${turnoverRows.length ? turnoverRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.avgTurnoverDays !== null ? `${row.avgTurnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(int(row.stock))}</td>
                    <td>${esc(int(row.inTransit))}</td>
                    <td>${esc(row.marginPct !== null ? pct(row.marginPct) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По площадке нет рабочего списка по запасу.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Если daily-ряд оборачиваемости приехал, здесь видно, когда запас стал проблемой. Если нет, используйте левую таблицу как основной контур.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Средняя обор.</th>
                    <th>SKU с daily</th>
                    <th>Средняя цена</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(row.avgTurnover !== null ? `${row.avgTurnover.toFixed(1)} дн.` : '—')}</td>
                      <td>${esc(int(row.skuCount))}</td>
                      <td>${esc(priceDailyMap.get(iso(row.date))?.avgPrice > 0 ? money(priceDailyMap.get(iso(row.date)).avgPrice) : '—')}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="4">Для выбранного окна daily-ряд оборачиваемости пока не опубликован.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${renderActionSection([
          stockMetric.lowCoverage > 0 ? `Есть ${int(stockMetric.lowCoverage)} SKU с низким покрытием. Проверяйте риск выпадения спроса.` : '',
          stockMetric.overstock > 0 ? `Есть ${int(stockMetric.overstock)} SKU с медленной оборачиваемостью. Ищите связку цена + спрос.` : '',
          stockMetric.avgTurnoverDays !== null && stockMetric.avgTurnoverDays > 60 ? `Средняя оборачиваемость ${stockMetric.avgTurnoverDays.toFixed(1)} дн. Для РОПа это уже зона ручного решения.` : ''
        ], 'По запасу сильных отклонений не видно.')}
      `
    };
  }

  function overviewSection(executive) {
    const metric = executive.focusMetric || executive.overall;
    const previous = executive.compareByKey.get(metric.key);
    const turnover = buildTurnoverMetric(metric.key, executive.range);
    const revenueDelta = relativeDelta(metric.revenue, previous?.revenue);
    const avgCheckDelta = relativeDelta(metric.avgCheck, previous?.avgCheck);
    const marginDelta = relativeDelta(metric.margin, previous?.margin);
    const turnoverDelta = relativeDelta(turnover.avgTurnoverDays, previous?.avgTurnoverDays);
    const completionDelta = percentagePointDelta(metric.completion, previous?.completion);
    return `
      <section class="portal-exec-section">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>5 Рабочих Графиков</h3>
            <p>Верхний слой для РОПа: оборот, средний чек, маржа, оборачиваемость и план-факт. По клику каждая карточка открывает окно: слева артикула, справа динамика этой же метрики по дням.</p>
          </div>
          ${sectionMetaHtml(executive, [executive.compareRange ? badgeHtml(`LFL: ${executive.compareRange.label}`, executive.compareRange.clamped ? 'warn' : 'info') : badgeHtml('LFL: нет окна для сравнения', 'info')])}
        </div>
        <div class="portal-exec-metric-strip">
          <article class="portal-exec-card is-${toneCompletion(metric.completion)} is-clickable" data-portal-exec-open="revenue" data-portal-exec-key="${esc(metric.key)}">
            <div class="portal-exec-card-head"><span class="portal-exec-card-label">Оборот</span>${deltaBadge('LFL', revenueDelta)}</div>
            <div class="portal-exec-card-value compact">${esc(money(metric.revenue))}</div>
            <div class="portal-exec-sub">Продано ${esc(int(metric.units))} шт. · ${esc(metric.label)} · клик покажет артикула и продажи по дням</div>
            ${renderSparkline(metric.sparkRevenue)}
            <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
          </article>
          <article class="portal-exec-card is-clickable" data-portal-exec-open="price" data-portal-exec-key="${esc(metric.key)}">
            <div class="portal-exec-card-head"><span class="portal-exec-card-label">Средний чек</span>${deltaBadge('LFL', avgCheckDelta)}</div>
            <div class="portal-exec-card-value compact">${esc(metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}</div>
            <div class="portal-exec-sub">Средняя цена витрины ${esc(metric.priceMatrixAvg > 0 ? money(metric.priceMatrixAvg) : '—')} · клик покажет артикула и чек по дням</div>
            ${renderSparkline(metric.sparkAvgCheck)}
            <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
          </article>
          <article class="portal-exec-card is-${toneMargin(metric.marginPct)} is-clickable" data-portal-exec-open="margin" data-portal-exec-key="${esc(metric.key)}">
            <div class="portal-exec-card-head"><span class="portal-exec-card-label">Маржа</span>${deltaBadge('LFL', marginDelta)}</div>
            <div class="portal-exec-card-value compact">${esc(money(metric.margin))}</div>
            <div class="portal-exec-sub">Маржинальность ${esc(pct(metric.marginPct))} · клик покажет артикула и маржу по дням</div>
            ${renderSparkline(metric.sparkMargin)}
            <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
          </article>
          <article class="portal-exec-card is-${turnover.avgTurnoverDays !== null && turnover.avgTurnoverDays > 90 ? 'warn' : 'ok'} is-clickable" data-portal-exec-open="stock" data-portal-exec-key="${esc(turnover.key)}">
            <div class="portal-exec-card-head"><span class="portal-exec-card-label">Оборачиваемость</span>${deltaBadge('LFL', turnoverDelta, true)}</div>
            <div class="portal-exec-card-value compact">${esc(turnover.avgTurnoverDays !== null ? `${turnover.avgTurnoverDays.toFixed(1)} дн.` : '—')}</div>
            <div class="portal-exec-sub">Остаток ${esc(int(turnover.totalStock))} · в пути ${esc(int(turnover.totalTransit))} · клик покажет артикула и ряд по дням</div>
            ${renderSparkline(turnover.sparkTurnover || turnover.sparkStock)}
            <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
          </article>
          <article class="portal-exec-card is-${toneCompletion(metric.completion)} is-clickable" data-portal-exec-open="completion" data-portal-exec-key="${esc(metric.key)}">
            <div class="portal-exec-card-head"><span class="portal-exec-card-label">План и выполнение</span>${deltaBadge('LFL', completionDelta, false, 'pp')}</div>
            <div class="portal-exec-card-value compact">${esc(pct(metric.completion))}</div>
            <div class="portal-exec-sub">План ${esc(int(metric.plan))} · факт ${esc(int(metric.units))} · клик покажет план по артикулам</div>
            <div class="portal-exec-progress is-${toneCompletion(metric.completion)}"><span style="width:${Math.max(6, Math.min(100, Math.round(num(metric.completion) * 100)))}%"></span></div>
            ${renderSparkline(metric.sparkUnits)}
            <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
          </article>
        </div>
      </section>
    `;
  }

  function platformSection(executive) {
    const metrics = visibleMetrics(executive);
    return `
      <section class="portal-exec-section is-highlight">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Площадки: выполнение плана</h3>
            <p>Это отдельный слой по план-факту. По клику открывается окно: слева артикулы выбранной площадки, справа даты и % выполнения по дням.</p>
          </div>
          ${sectionMetaHtml(executive, [badgeHtml(`${int(metrics.length)} карточки`, 'info')])}
        </div>
        <div class="portal-exec-platform-grid">
          ${metrics.map((metric) => {
            const problemTotal = num(metric.issues?.counters?.toWork) + num(metric.issues?.counters?.negativeMargin) + num(metric.issues?.counters?.lowStock);
            return `
              <article class="portal-exec-card is-${toneCompletion(metric.completion)} is-clickable" data-portal-exec-open="completion" data-portal-exec-key="${esc(metric.key)}">
                <div class="portal-exec-card-head"><span class="portal-exec-card-label">${esc(metric.label)}</span>${badgeHtml(pct(metric.completion), toneCompletion(metric.completion))}</div>
                <div class="portal-exec-card-value compact">${esc(pct(metric.completion))}</div>
                <div class="portal-exec-sub">План ${esc(int(metric.plan))} · факт ${esc(int(metric.units))} · выручка ${esc(money(metric.revenue))}</div>
                <div class="portal-exec-progress is-${toneCompletion(metric.completion)}"><span style="width:${Math.max(6, Math.min(100, Math.round(num(metric.completion) * 100)))}%"></span></div>
                ${renderSparkline(metric.sparkUnits)}
                <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
                <div class="portal-exec-metric-grid">
                  <div class="portal-exec-metric"><span>Факт / день</span><strong>${esc(int(metric.avgUnits))}</strong></div>
                  <div class="portal-exec-metric"><span>Маржинальность</span><strong>${esc(pct(metric.marginPct))}</strong></div>
                  <div class="portal-exec-metric"><span>Реклама</span><strong>${esc(metric.adsReady ? money(metric.spend) : 'нет')}</strong></div>
                  <div class="portal-exec-metric"><span>Проблемы</span><strong>${esc(int(problemTotal))}</strong></div>
                </div>
              </article>
            `;
          }).join('') || `<div class="portal-exec-empty">По выбранной площадке пока нет рабочего среза.</div>`}
        </div>
      </section>
    `;
  }

  function priceSection(executive) {
    const metrics = visibleMetrics(executive);
    return `
      <section class="portal-exec-section">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Средний чек и продажи</h3>
            <p>Эти две метрики вынесены отдельно: по среднему чеку видно реакцию спроса на цену, по продажам — сам оборот и % выполнения по дням.</p>
          </div>
          ${sectionMetaHtml(executive)}
        </div>
        <div class="portal-exec-two-grids">
          <div class="portal-exec-subsection">
            <h4>Средний чек</h4>
            <p>Показывает реакцию спроса на цену. По клику открывается модалка с днями, средним чеком и полным SKU-списком ценового слоя.</p>
            <div class="portal-exec-platform-grid">
              ${metrics.map((metric) => `
                <article class="portal-exec-card is-clickable" data-portal-exec-open="price" data-portal-exec-key="${esc(metric.key)}">
                  <div class="portal-exec-card-head">
                    <span class="portal-exec-card-label">${esc(metric.label)}</span>
                    ${badgeHtml(metric.priceMatrixDeltaPct !== null ? `Δ цены ${pct(metric.priceMatrixDeltaPct)}` : 'без дельты цены', metric.priceMatrixDeltaPct !== null && metric.priceMatrixDeltaPct < -0.03 ? 'danger' : metric.priceMatrixDeltaPct !== null && metric.priceMatrixDeltaPct > 0.03 ? 'warn' : 'info')}
                  </div>
                  <div class="portal-exec-card-value compact">${esc(metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}</div>
                  <div class="portal-exec-sub">Средняя цена витрины ${esc(metric.priceMatrixAvg > 0 ? money(metric.priceMatrixAvg) : '—')} · SKU ${esc(int(priceRowsForPlatform(metric.key).length))}</div>
                  ${renderSparkline(metric.sparkAvgCheck)}
                  <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
                </article>
              `).join('') || `<div class="portal-exec-empty">Нет данных по среднему чеку.</div>`}
            </div>
          </div>
          <div class="portal-exec-subsection">
            <h4>Продажи по площадкам</h4>
            <p>Это блок продаж. По клику открывается окно: слева артикулы площадки, справа даты, продажи и % выполнения.</p>
            <div class="portal-exec-platform-grid">
              ${metrics.map((metric) => `
                <article class="portal-exec-card is-clickable" data-portal-exec-open="revenue" data-portal-exec-key="${esc(metric.key)}">
                  <div class="portal-exec-card-head">
                    <span class="portal-exec-card-label">${esc(metric.label)}</span>
                    ${badgeHtml(`План ${pct(metric.completion)}`, toneCompletion(metric.completion))}
                  </div>
                  <div class="portal-exec-card-value compact">${esc(money(metric.revenue))}</div>
                  <div class="portal-exec-sub">Продано ${esc(int(metric.units))} шт. · средний чек ${esc(metric.avgCheck > 0 ? money(metric.avgCheck) : '—')} · % выполнения ${esc(pct(metric.completion))}</div>
                  ${renderSparkline(metric.sparkRevenue)}
                  <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
                </article>
              `).join('') || `<div class="portal-exec-empty">Нет данных по выручке.</div>`}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function marginSection(executive) {
    const metrics = visibleMetrics(executive);
    return `
      <section class="portal-exec-section is-highlight">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Маржа по площадкам</h3>
            <p>Маржа поднята выше, чтобы сразу видеть, где проблема уже не в плане, а в качестве прибыли. По клику открывается полный список SKU с маржой по выбранной площадке.</p>
          </div>
          ${sectionMetaHtml(executive)}
        </div>
        <div class="portal-exec-platform-grid">
          ${metrics.map((metric) => `
            <article class="portal-exec-card is-${toneMargin(metric.marginPct)} is-clickable" data-portal-exec-open="margin" data-portal-exec-key="${esc(metric.key)}">
              <div class="portal-exec-card-head">
                <span class="portal-exec-card-label">${esc(metric.label)}</span>
                ${badgeHtml(`Маржинальность ${pct(metric.marginPct)}`, toneMargin(metric.marginPct))}
              </div>
              <div class="portal-exec-card-value compact">${esc(money(metric.margin))}</div>
              <div class="portal-exec-sub">Выручка ${esc(money(metric.revenue))} · отрицательная маржа ${esc(int(metric.issues?.counters?.negativeMargin || 0))}</div>
              ${renderSparkline(metric.sparkMargin)}
              <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
            </article>
          `).join('') || `<div class="portal-exec-empty">Нет данных по марже.</div>`}
        </div>
      </section>
    `;
  }

  function stockSection(executive) {
    const platforms = executive.selectedPlatform === 'all' ? ['wb', 'ozon'] : [executive.selectedPlatform];
    return `
      <section class="portal-exec-section">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Остатки и оборачиваемость</h3>
            <p>Отдельный блок по запасам. По клику открывается рабочий список SKU, остатки, оборачиваемость и общий запас по площадке.</p>
          </div>
          ${sectionMetaHtml(executive)}
        </div>
        <div class="portal-exec-platform-grid">
          ${platforms.map((platformKey) => {
            const metric = buildStockMetric(platformKey);
            if (!metric.rows.length) {
              return `<div class="portal-exec-empty">Для ${esc(metric.label)} складской срез по остаткам пока не подключен.</div>`;
            }
            return `
              <article class="portal-exec-card is-${metric.lowCoverage > 0 ? 'warn' : 'ok'} is-clickable" data-portal-exec-open="stock" data-portal-exec-key="${esc(platformKey)}">
                <div class="portal-exec-card-head">
                  <span class="portal-exec-card-label">${esc(metric.label)}</span>
                  ${badgeHtml(metric.avgTurnover !== null ? `${metric.avgTurnover.toFixed(1)} дн.` : 'без оборачиваемости', metric.avgTurnover !== null && metric.avgTurnover > 90 ? 'warn' : 'ok')}
                </div>
                <div class="portal-exec-card-value compact">${esc(int(metric.totalStock))}</div>
                <div class="portal-exec-sub">В пути ${esc(int(metric.totalTransit))} · низкое покрытие ${esc(int(metric.lowCoverage))} · избыточный запас ${esc(int(metric.overstock))}</div>
                ${renderSparkline(metric.sparkStock)}
                <div class="portal-exec-axis"><span>топ SKU по запасу</span><span>${esc(int(metric.skuCount))} SKU</span></div>
              </article>
            `;
          }).join('') || `<div class="portal-exec-empty">По этой площадке пока нет складского среза.</div>`}
        </div>
      </section>
    `;
  }

  function issuesSection(executive) {
    const metrics = executive.selectedPlatform === 'all'
      ? [executive.overall, ...visibleMetrics(executive)]
      : visibleMetrics(executive);
    return `
      <section class="portal-exec-section">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Срочные задачи</h3>
            <p>Это короткий слой риска на главной. Здесь остаются только сигналы, которые уже требуют действия: в работе, отрицательная маржа, низкий остаток, без owner.</p>
          </div>
          ${sectionMetaHtml(executive)}
        </div>
        <div class="portal-exec-issue-grid">
          ${metrics.map((metric) => {
            const counters = metric.issues?.counters || {};
            const total = num(counters.toWork)
              + num(counters.negativeMargin)
              + num(counters.lowStock)
              + num(counters.noOwner)
              + num(counters.priceShock)
              + num(counters.funnelDrop);
            return `
              <article class="portal-exec-card is-${total > 0 ? 'danger' : 'ok'} is-clickable" data-portal-exec-open="issues" data-portal-exec-key="${esc(metric.key)}">
                <div class="portal-exec-card-head"><span class="portal-exec-card-label">${esc(metric.label)}</span>${badgeHtml(`${int(total)} сигналов`, total > 0 ? 'danger' : 'ok')}</div>
                <div class="portal-exec-metric-grid">
                  <div class="portal-exec-metric"><span>В работе</span><strong>${esc(int(counters.toWork))}</strong></div>
                  <div class="portal-exec-metric"><span>Отриц. маржа</span><strong>${esc(int(counters.negativeMargin))}</strong></div>
                  <div class="portal-exec-metric"><span>Низкий остаток</span><strong>${esc(int(counters.lowStock))}</strong></div>
                  <div class="portal-exec-metric"><span>Без owner</span><strong>${esc(int(counters.noOwner))}</strong></div>
                </div>
                <div class="portal-exec-issue-foot" style="margin-top:12px"><span>${esc(metric.topIssue ? metric.topIssue.article : 'Без явного лидера риска')}</span><span>${esc(metric.topIssue ? (metric.topIssue.owner || 'Без owner') : '')}</span></div>
              </article>
            `;
          }).join('') || `<div class="portal-exec-empty">Срочных задач по текущему фильтру нет.</div>`}
        </div>
      </section>
    `;
  }

  function adsSection(executive) {
    const readyCards = visibleMetrics(executive).filter((metric) => metric.adsReady);
    if (!readyCards.length) {
      const content = contentSliceSummary();
      if (content.rows.length) {
        const sectionTitle = content.usingLeaderboard
          ? 'Контент и окупаемость (ROMI) · продуктовый лидерборд'
          : 'Контент и окупаемость (ROMI) · последний срез';
        const sectionDescription = content.usingLeaderboard
          ? 'На главной показываем weekly КЗ-срез из продуктового лидерборда: клики, заказы, выручка, затраты на контент и ROMI берём из одного источника, без старого fallback-слоя.'
          : 'Ежедневная рекламная витрина ещё не доехала в <code>ads_summary.json</code>, поэтому здесь временно показывается последний доступный контент-срез. Он не привязан к календарю, но уже даёт понятный ответ по кликам, заказам, выручке и окупаемости контента.';
        return `
          <section class="portal-exec-section">
            <div class="portal-exec-head">
              <div class="portal-exec-copy">
                <h3>${sectionTitle}</h3>
                <p>${sectionDescription}</p>
              </div>
              <div class="portal-exec-chip-stack">
                ${badgeHtml(content.usingLeaderboard ? 'Продуктовый лидерборд' : 'Временный fallback', content.usingLeaderboard ? 'ok' : 'warn')}
                ${badgeHtml(content.periods.length ? content.periods.join(' · ') : 'последний срез', 'info')}
                ${content.generatedAt ? badgeHtml(`Обновлено ${fmt.date(content.generatedAt)}`, 'info') : ''}
              </div>
            </div>
            <div class="portal-exec-grid">
                <article class="portal-exec-card ${content.usingLeaderboard ? 'is-ok' : 'is-warn'} is-clickable" data-portal-exec-open="content-summary">
                  <div class="portal-exec-card-head"><span class="portal-exec-card-label">Контент / ROMI</span>${badgeHtml(content.usingLeaderboard ? 'weekly КЗ' : 'не daily', content.usingLeaderboard ? 'ok' : 'warn')}</div>
                  <div class="portal-exec-card-value compact">${esc(money(content.revenue))}</div>
                  <div class="portal-exec-sub">Клики ${esc(int(content.clicks))} · заказы ${esc(int(content.orders))} · контент ${esc(money(content.spend))} · ROMI ${esc(content.romi !== null ? pct(content.romi) : '—')}</div>
                  <div class="portal-exec-card-foot"><span>Посты ${esc(int(content.posts))}</span><span>SKU ${esc(int(content.rows.length))}</span></div>
                </article>
              ${content.rows.slice(0, 3).map((row) => `
                <article class="portal-exec-card">
                  <div class="portal-exec-card-head"><span class="portal-exec-card-label">${esc(row.article)}</span>${badgeHtml(row.romi !== null ? `Окупаемость ${contentRomiLabel(row.romi)}` : 'без ROMI', contentRomiTone(row.romi))}</div>
                  <div class="portal-exec-card-value compact">${esc(money(row.revenue))}</div>
                  <div class="portal-exec-sub">${esc(row.name)}</div>
                  <div class="portal-exec-card-foot"><span>Клики ${esc(int(row.clicks))}</span><span>Заказы ${esc(int(row.orders))}</span></div>
                </article>
              `).join('')}
            </div>
          </section>
        `;
      }
      return `
        <section class="portal-exec-section">
          <div class="portal-exec-head">
            <div class="portal-exec-copy">
              <h3>Рекламная воронка</h3>
              <p>Рекламная логика уже встроена в главную, но опубликованного рекламного факта по текущему диапазону пока нет. Когда витрина доедет, здесь автоматически появятся графики, ДРР и drilldown по товарам.</p>
            </div>
            <div class="portal-exec-chip-stack">${badgeHtml('Интерактив готов', 'info')}${badgeHtml('Нет рекламной витрины', 'warn')}</div>
          </div>
          <div class="portal-exec-empty">Пока не опубликован рабочий ads_summary. Главная уже умеет его читать и раскрывать по клику, но сам факт в витрину еще не доехал.</div>
        </section>
      `;
    }
    return `
      <section class="portal-exec-section">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Рекламная воронка</h3>
            <p>Здесь остаются только рекламные метрики. Нажатие на карточку открывает воронку по площадке и список товаров, которые продавались в рекламе за этот период.</p>
          </div>
          ${sectionMetaHtml(executive)}
        </div>
        <div class="portal-exec-platform-grid">
          ${readyCards.map((metric) => `
            <article class="portal-exec-card is-${metric.drr !== null ? toneDrr(metric.drr) : 'warn'} is-clickable" data-portal-exec-open="ads" data-portal-exec-key="${esc(metric.key)}">
              <div class="portal-exec-card-head"><span class="portal-exec-card-label">${esc(metric.label)}</span>${badgeHtml(metric.drr !== null ? `ДРР ${pct(metric.drr)}` : 'нет ДРР', metric.drr !== null ? toneDrr(metric.drr) : 'warn')}</div>
              <div class="portal-exec-card-value compact">${esc(money(metric.spend))}</div>
              <div class="portal-exec-sub">Показы ${esc(int(metric.views))} · клики ${esc(int(metric.clicks))} · заказы ${esc(int(metric.orders))}</div>
              ${renderSparkline(metric.sparkSpend)}
              <div class="portal-exec-card-foot"><span>Выручка ${esc(money(metric.adRevenue))}</span><span>CTR ${esc(metric.ctr !== null ? pct(metric.ctr) : '—')}</span></div>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function hideLegacyDashboard(root) {
    const hideNode = (node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.dataset?.portalDashboardExecutiveRoot === 'true') return;
      const text = (node.textContent || '').trim();
      if (
        text.includes('Красивый дашборд бренда')
        || text.includes('Имперский pulse бренда')
        || text.includes('Портал бренда Алтея')
      ) {
        node.remove();
        return;
      }
      if (text.includes('Средняя цена и средний чек по площадкам')) {
        node.remove();
        return;
      }
      node.style.display = 'none';
    };

    [...root.children].forEach(hideNode);
    root.querySelectorAll('[data-dashboard-layout-root]').forEach((node) => node.remove());
    root.querySelectorAll('.hero-panel, .section-title, .dashboard-grid-3, .two-col').forEach((node) => {
      if (!node.closest('[data-portal-dashboard-executive-root]')) node.remove();
    });
    root.querySelectorAll('.grid.cards, .footer-note').forEach((node) => {
      if (!node.closest('[data-portal-dashboard-executive-root]')) node.style.display = 'none';
    });

    if (!root.dataset.portalExecObserverBound) {
      root.dataset.portalExecObserverBound = '1';
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach(hideNode);
        });
        root.querySelectorAll('[data-dashboard-layout-root]').forEach((node) => node.remove());
        root.querySelectorAll('.hero-panel, .section-title, .dashboard-grid-3, .two-col').forEach((node) => {
          if (!node.closest('[data-portal-dashboard-executive-root]')) node.remove();
        });
        root.querySelectorAll('.grid.cards, .footer-note').forEach((node) => {
          if (!node.closest('[data-portal-dashboard-executive-root]')) node.style.display = 'none';
        });
      });
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  function bindDashboard(root, executive) {
    root.querySelectorAll('[data-portal-exec-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const stored = ensureRangeState();
        Object.assign(stored, presetRange(button.dataset.portalExecPreset || '7', cleanDate(selectedRange().max || new Date())));
        scheduleApply();
      });
    });

    root.querySelectorAll('[data-portal-exec-platform]').forEach((button) => {
      button.addEventListener('click', () => {
        setPlatformState(button.dataset.portalExecPlatform || 'all');
        scheduleApply();
      });
    });

    const bindDateInput = (input) => {
      if (!input || input.dataset.portalExecPickerBound) return;
      input.dataset.portalExecPickerBound = '1';
      input.addEventListener('pointerdown', () => openDatePicker(input));
      input.addEventListener('click', () => openDatePicker(input));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDatePicker(input);
        }
      });
    };

    const startInput = root.querySelector('[data-portal-exec-start]');
    const endInput = root.querySelector('[data-portal-exec-end]');
    bindDateInput(startInput);
    bindDateInput(endInput);
    root.querySelectorAll('[data-portal-exec-open-date]').forEach((button) => {
      button.addEventListener('click', () => {
        openDatePicker(button.dataset.portalExecOpenDate === 'end' ? endInput : startInput);
      });
    });

    startInput?.addEventListener('change', (event) => {
      const stored = ensureRangeState();
      stored.mode = 'custom';
      stored.active = '';
      stored.start = event.target.value || stored.start;
      scheduleApply();
    });

    endInput?.addEventListener('change', (event) => {
      const stored = ensureRangeState();
      stored.mode = 'custom';
      stored.active = '';
      stored.end = event.target.value || stored.end;
      scheduleApply();
    });

    root.querySelectorAll('[data-portal-exec-open]').forEach((card) => {
      card.addEventListener('click', () => {
        const key = card.dataset.portalExecKey || 'all';
        const kind = card.dataset.portalExecOpen || 'platform';
        const metric = executive.byKey.get(key) || executive.overall;
        if (!metric) return;
        if (kind === 'content-summary') {
          openModal(buildContentSliceDetail());
          return;
        }
        if (kind === 'completion') {
          openModal(buildCompletionDetail(metric, executive));
          return;
        }
        if (kind === 'stock') {
          openModal(buildStockDetail(key, executive));
          return;
        }
        if (kind === 'margin') {
          openModal(buildMarginDetail(metric, executive));
          return;
        }
        if (kind === 'ads') {
          openModal(buildAdsDetail(metric, executive));
          return;
        }
        if (kind === 'revenue') {
          openModal(buildRevenueDetail(metric, executive));
          return;
        }
        if (kind === 'price') {
          openModal(buildPriceDetail(metric, executive));
          return;
        }
        if (kind === 'platform') {
          openModal(buildCompletionDetail(metric, executive));
          return;
        }
        openModal(buildPlatformDetail(metric, executive, kind));
      });
    });
  }

  buildCompletionDetail = function (metric, executive) {
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .sort((left, right) => num(left.completionPct) - num(right.completionPct) || num(right.planUnitsSelected) - num(left.planUnitsSelected) || num(right.salesValue) - num(left.salesValue))
      .slice(0, 18);
    const focusDays = detailTailRows(metric.days, 14);
    const previous = executive.compareByKey.get(metric.key);
    const completionDelta = percentagePointDelta(metric.completion, previous?.completion);
    return {
      title: `${metric.label} · план-факт по артикулам`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчете: ${executive.range.effectiveLabel}. Справа всегда последние 14 дней доступного факта.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('% выполнения', pct(metric.completion))}
          ${modalSummaryCard('WoW', completionDelta !== null ? `${completionDelta >= 0 ? '+' : ''}${(completionDelta * 100).toFixed(1)} pp` : '—')}
          ${modalSummaryCard('План периода', int(metric.plan))}
          ${modalSummaryCard('Факт периода', int(metric.units))}
          ${modalSummaryCard('Факт / день', int(metric.avgUnits))}
          ${modalSummaryCard('Выручка', money(metric.revenue))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Короткий список для разбора: кто не добирает план, кто делает выручку и кого нужно открыть во вкладке цен.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>План</th>
                  <th>Факт</th>
                  <th>%</th>
                  <th>Выручка</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.planUnitsSelected !== null ? int(row.planUnitsSelected) : '—')}</td>
                    <td>${esc(row.actualUnitsSelected !== null ? int(row.actualUnitsSelected) : '—')}</td>
                    <td>${esc(row.completionPct !== null ? pct(row.completionPct) : '—')}</td>
                    <td>${esc(row.salesValue ? money(row.salesValue) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По выбранной площадке нет SKU-среза.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">План, факт и выручка по дням. Это окно отвечает на вопрос: когда именно начался провал или ускорение.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>План</th>
                    <th>Факт</th>
                    <th>%</th>
                    <th>Выручка</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(int(row.planUnits))}</td>
                      <td>${esc(int(row.factUnits))}</td>
                      <td>${esc(row.planUnits > 0 ? pct(row.factUnits / row.planUnits) : '—')}</td>
                      <td>${esc(money(row.revenue))}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="5">Нет дневных данных по выбранному окну.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${renderActionSection(metricActionBullets(metric, executive), 'План-факт выглядит стабильно, открывайте только отдельные SKU с вопросами.')}
      `
    };
  };

  buildPriceDetail = function (metric, executive) {
    const previous = executive.compareByKey.get(metric.key);
    const avgCheckDelta = relativeDelta(metric.avgCheck, previous?.avgCheck);
    const priceDailyMap = new Map((metric.priceMatrixSeries || []).map((row) => [iso(row.date), row]));
    const focusDays = detailTailRows(metric.days, 14).map((row) => {
      const avgCheck = row.factUnits > 0 ? row.revenue / row.factUnits : null;
      const matrix = priceDailyMap.get(iso(row.date));
      return {
        date: row.date,
        units: row.factUnits,
        revenue: row.revenue,
        avgCheck,
        avgPrice: matrix?.avgPrice || 0,
        skuCount: matrix?.skuCount || 0
      };
    });
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .map((row) => ({
        ...row,
        deltaPct: row.startPrice > 0 && row.endPrice > 0 ? (row.endPrice - row.startPrice) / row.startPrice : null
      }))
      .sort((left, right) => Math.abs(num(right.deltaPct)) - Math.abs(num(left.deltaPct)) || num(right.avgPrice) - num(left.avgPrice))
      .slice(0, 18);
    return {
      title: `${metric.label} · средний чек и цена`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчете: ${executive.range.effectiveLabel}. Справа последние 14 дней витринной цены и среднего чека.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Средний чек', metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}
          ${modalSummaryCard('WoW', avgCheckDelta !== null ? pct(avgCheckDelta) : '—')}
          ${modalSummaryCard('Средняя цена витрины', metric.priceMatrixAvg > 0 ? money(metric.priceMatrixAvg) : '—')}
          ${modalSummaryCard('Цена на старте', metric.priceMatrixStart > 0 ? money(metric.priceMatrixStart) : '—')}
          ${modalSummaryCard('Цена на финише', metric.priceMatrixEnd > 0 ? money(metric.priceMatrixEnd) : '—')}
          ${modalSummaryCard('SKU в матрице', int(priceRowsForPlatform(metric.key).length))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Кто двигал средний чек: изменение MP, текущая оборачиваемость и выручка по SKU.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Старт MP</th>
                  <th>Финиш MP</th>
                  <th>Δ</th>
                  <th>Обор.</th>
                  <th>Выручка</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.startPrice > 0 ? money(row.startPrice) : '—')}</td>
                    <td>${esc(row.endPrice > 0 ? money(row.endPrice) : '—')}</td>
                    <td>${esc(row.deltaPct !== null ? pct(row.deltaPct) : '—')}</td>
                    <td>${esc(row.avgTurnoverDays !== null ? `${row.avgTurnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(row.salesValue ? money(row.salesValue) : '—')}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По выбранному окну нет ценового списка.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Средний чек, выручка, витринная цена и число SKU в ежедневном срезе.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Шт.</th>
                    <th>Выручка</th>
                    <th>Средний чек</th>
                    <th>Средняя цена</th>
                    <th>SKU</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(int(row.units))}</td>
                      <td>${esc(money(row.revenue))}</td>
                      <td>${esc(row.avgCheck ? money(row.avgCheck) : '—')}</td>
                      <td>${esc(row.avgPrice > 0 ? money(row.avgPrice) : '—')}</td>
                      <td>${esc(int(row.skuCount))}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="6">Нет 14-дневного ряда по среднему чеку.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${renderActionSection(metricActionBullets(metric, executive), 'Слой цены выглядит ровно. Смотрите только SKU с резкой дельтой или плохой оборачиваемостью.')}
      `
    };
  };

  buildRevenueDetail = function (metric, executive) {
    const previous = executive.compareByKey.get(metric.key);
    const revenueDelta = relativeDelta(metric.revenue, previous?.revenue);
    const priceDailyMap = new Map((metric.priceMatrixSeries || []).map((row) => [iso(row.date), row]));
    const focusDays = detailTailRows(metric.days, 14).map((row) => {
      const avgCheck = row.factUnits > 0 ? row.revenue / row.factUnits : null;
      const matrix = priceDailyMap.get(iso(row.date));
      return {
        date: row.date,
        planUnits: row.planUnits,
        units: row.factUnits,
        completion: row.planUnits > 0 ? row.factUnits / row.planUnits : null,
        revenue: row.revenue,
        avgCheck,
        avgPrice: matrix?.avgPrice || 0
      };
    });
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .sort((left, right) => num(right.salesValue) - num(left.salesValue) || num(right.actualUnitsSelected) - num(left.actualUnitsSelected))
      .slice(0, 18);
    return {
      title: `${metric.label} · оборот и продажи`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчете: ${executive.range.effectiveLabel}. Справа последние 14 дней оборота.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Выручка', money(metric.revenue))}
          ${modalSummaryCard('WoW', revenueDelta !== null ? pct(revenueDelta) : '—')}
          ${modalSummaryCard('Продано, шт.', int(metric.units))}
          ${modalSummaryCard('План периода', int(metric.plan))}
          ${modalSummaryCard('% к плану', pct(metric.completion))}
          ${modalSummaryCard('Средний чек', metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Топ SKU по обороту. Отсюда удобно сразу открыть карточку цены и проверить причину изменения.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Выручка</th>
                  <th>Факт</th>
                  <th>План</th>
                  <th>%</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.salesValue ? money(row.salesValue) : '—')}</td>
                    <td>${esc(row.actualUnitsSelected !== null ? int(row.actualUnitsSelected) : '—')}</td>
                    <td>${esc(row.planUnitsSelected !== null ? int(row.planUnitsSelected) : '—')}</td>
                    <td>${esc(row.completionPct !== null ? pct(row.completionPct) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">Нет SKU-списка по обороту.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Дневной ряд продаж, плана, выручки и среднего чека. Он нужен для быстрого ответа, когда началось изменение.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>План</th>
                    <th>Факт</th>
                    <th>%</th>
                    <th>Выручка</th>
                    <th>Средний чек</th>
                    <th>Средняя цена</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(int(row.planUnits))}</td>
                      <td>${esc(int(row.units))}</td>
                      <td>${esc(row.completion !== null ? pct(row.completion) : '—')}</td>
                      <td>${esc(money(row.revenue))}</td>
                      <td>${esc(row.avgCheck ? money(row.avgCheck) : '—')}</td>
                      <td>${esc(row.avgPrice > 0 ? money(row.avgPrice) : '—')}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="7">Нет дневных данных по продажам.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${renderActionSection(metricActionBullets(metric, executive), 'Оборот выглядит стабильно. Используйте левый список как короткий лист лидеров по выручке.')}
      `
    };
  };

  buildMarginDetail = function (metric, executive) {
    const previous = executive.compareByKey.get(metric.key);
    const marginDelta = relativeDelta(metric.margin, previous?.margin);
    const rows = marginRowsForPlatform(metric.key)
      .sort((left, right) => left.marginPct - right.marginPct || right.stock - left.stock)
      .slice(0, 18);
    const focusDays = detailTailRows(metric.days, 14);
    return {
      title: `${metric.label} · маржа по SKU`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчете: ${executive.range.effectiveLabel}. Справа последние 14 дней маржи и выручки.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Маржа', money(metric.margin))}
          ${modalSummaryCard('WoW', marginDelta !== null ? pct(marginDelta) : '—')}
          ${modalSummaryCard('Маржинальность', pct(metric.marginPct))}
          ${modalSummaryCard('Выручка', money(metric.revenue))}
          ${modalSummaryCard('Продано, шт.', int(metric.units))}
          ${modalSummaryCard('Отрицательная маржа', int(metric.issues?.counters?.negativeMargin || 0))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Позиции с самой низкой маржой. Это короткий список для перехода в карточку цены и проверки коридора.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Маржа %</th>
                  <th>Остаток</th>
                  <th>Обор.</th>
                  <th>Цена</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(pct(row.marginPct))}</td>
                    <td>${esc(int(row.stock))}</td>
                    <td>${esc(row.turnoverDays !== null ? `${row.turnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(row.currentPrice > 0 ? money(row.currentPrice) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По площадке нет SKU по марже.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Дневная маржа, маржинальность, выручка и штуки. Это помогает отличить ценовую проблему от проблемы спроса.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Выручка</th>
                    <th>Маржа</th>
                    <th>Маржинальность</th>
                    <th>Шт.</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(money(row.revenue))}</td>
                      <td>${esc(money(row.margin))}</td>
                      <td>${esc(row.revenue > 0 ? pct(row.margin / row.revenue) : '—')}</td>
                      <td>${esc(int(row.factUnits))}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="5">Нет дневных данных по марже.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${renderActionSection(metricActionBullets(metric, executive), 'Маржа по окну выглядит ровно. В первую очередь проверяйте только позиции с худшей маржинальностью слева.')}
      `
    };
  };

  buildStockDetail = function (platformKey, executive) {
    const stockMetric = buildTurnoverMetric(platformKey, executive.range);
    const turnoverRows = articleRowsForPlatform(platformKey, executive.range)
      .sort((left, right) => num(right.avgTurnoverDays) - num(left.avgTurnoverDays) || right.stock - left.stock)
      .slice(0, 18);
    const priceDailyMap = new Map(priceMatrixSeries(platformKey, executive.range).map((row) => [iso(row.date), row]));
    const focusDays = detailTailRows(stockMetric.turnoverPublishedSeries, 14);
    return {
      title: `${stockMetric.label} · оборачиваемость и запас`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчете: ${executive.range.effectiveLabel}. Справа последние 14 дней ряда по оборачиваемости, если он опубликован.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Остаток, шт.', int(stockMetric.totalStock))}
          ${modalSummaryCard('В пути, шт.', int(stockMetric.totalTransit))}
          ${modalSummaryCard('Средняя оборачиваемость', stockMetric.avgTurnoverDays !== null ? `${stockMetric.avgTurnoverDays.toFixed(1)} дн.` : '—')}
          ${modalSummaryCard('Низкое покрытие', int(stockMetric.lowCoverage))}
          ${modalSummaryCard('Избыточный запас', int(stockMetric.overstock))}
          ${modalSummaryCard('SKU в срезе', int(stockMetric.skuCount))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Список SKU по запасу и оборачиваемости. Это главный слой для решения: распродавать, поднимать цену или дозаказывать.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Обор.</th>
                  <th>Остаток</th>
                  <th>В пути</th>
                  <th>Маржа %</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${turnoverRows.length ? turnoverRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.avgTurnoverDays !== null ? `${row.avgTurnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(int(row.stock))}</td>
                    <td>${esc(int(row.inTransit))}</td>
                    <td>${esc(row.marginPct !== null ? pct(row.marginPct) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По площадке нет рабочего списка по запасу.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Если daily-ряд оборачиваемости приехал, здесь видно, когда запас стал проблемой. Если нет, используйте левую таблицу как основной контур.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Средняя обор.</th>
                    <th>SKU с daily</th>
                    <th>Средняя цена</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(row.avgTurnover !== null ? `${row.avgTurnover.toFixed(1)} дн.` : '—')}</td>
                      <td>${esc(int(row.skuCount))}</td>
                      <td>${esc(priceDailyMap.get(iso(row.date))?.avgPrice > 0 ? money(priceDailyMap.get(iso(row.date)).avgPrice) : '—')}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="4">Для выбранного окна daily-ряд оборачиваемости пока не опубликован.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${renderActionSection([
          stockMetric.lowCoverage > 0 ? `Есть ${int(stockMetric.lowCoverage)} SKU с низким покрытием. Проверяйте риск выпадения спроса.` : '',
          stockMetric.overstock > 0 ? `Есть ${int(stockMetric.overstock)} SKU с медленной оборачиваемостью. Ищите связку цена + спрос.` : '',
          stockMetric.avgTurnoverDays !== null && stockMetric.avgTurnoverDays > 60 ? `Средняя оборачиваемость ${stockMetric.avgTurnoverDays.toFixed(1)} дн. Для РОПа это уже зона ручного решения.` : ''
        ], 'По запасу сильных отклонений не видно.')}
      `
    };
  };

  function dashboardTaskWorkstreamKey(task) {
    const raw = String(task?.platform || '').trim().toLowerCase();
    const text = `${raw} ${task?.title || ''} ${task?.nextAction || ''} ${task?.reason || ''} ${task?.entityLabel || ''}`.toLowerCase();
    if (['wb+ozon', 'wb + ozon', 'cross', 'common', 'shared', 'general', 'all'].includes(raw)) return 'cross';
    if (/(^|\\W)wb($|\\W)|wildberries|вб/.test(text)) return 'wb';
    if (/ozon|озон/.test(text)) return 'ozon';
    if (/retail|market|яндекс|я\\.маркет|ям|letu|лету|магнит|golden apple|золот/.test(text)) return 'retail';
    return 'cross';
  }

  function dashboardControlPlatformKey(platformKey) {
    if (platformKey === 'ya') return 'retail';
    if (platformKey === 'wb' || platformKey === 'ozon') return platformKey;
    return 'all';
  }

  function dashboardTaskMatchesPlatform(task, platformKey) {
    const selected = dashboardControlPlatformKey(platformKey);
    if (selected === 'all') return true;
    const workstream = dashboardTaskWorkstreamKey(task);
    return workstream === selected || workstream === 'cross';
  }

  function dashboardTaskIsActive(task) {
    return ['new', 'in_progress', 'waiting_team', 'waiting_decision'].includes(String(task?.status || 'new'));
  }

  function dashboardTaskIsOverdue(task) {
    return Boolean(task?.due) && dashboardTaskIsActive(task) && String(task.due) < iso(cleanDate(new Date()));
  }

  function dashboardTaskTone(task) {
    if (dashboardTaskIsOverdue(task)) return 'danger';
    if (task?.priority === 'critical') return 'danger';
    if (task?.status === 'waiting_decision' || task?.priority === 'high') return 'warn';
    return 'ok';
  }

  function dashboardTaskStatusChip(task) {
    if (dashboardTaskIsOverdue(task)) return badgeHtml('Просрочено', 'danger');
    if (task?.status === 'waiting_decision') return badgeHtml('Ждет решения', 'info');
    if (task?.status === 'in_progress') return badgeHtml('В работе', 'warn');
    if (task?.status === 'waiting_team') return badgeHtml('Ждет команду', 'info');
    return badgeHtml('Активна', 'ok');
  }

  function dashboardTaskPriorityChip(task) {
    if (task?.priority === 'critical') return badgeHtml('Критично', 'danger');
    if (task?.priority === 'high') return badgeHtml('Высокий', 'warn');
    if (task?.priority === 'medium') return badgeHtml('Средний', 'info');
    return badgeHtml('Планово', '');
  }

  function dashboardTaskPlatformChip(task) {
    const key = dashboardTaskWorkstreamKey(task);
    if (key === 'wb') return badgeHtml('WB', 'warn');
    if (key === 'ozon') return badgeHtml('Ozon', 'info');
    if (key === 'retail') return badgeHtml('ЯМ / сети', 'ok');
    return badgeHtml('Общий контур', '');
  }

  function dashboardTaskSort(left, right) {
    const overdueDelta = Number(dashboardTaskIsOverdue(right)) - Number(dashboardTaskIsOverdue(left));
    if (overdueDelta) return overdueDelta;
    const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
    const priorityDelta = (priorityRank[right?.priority] || 0) - (priorityRank[left?.priority] || 0);
    if (priorityDelta) return priorityDelta;
    const waitingDelta = Number(right?.status === 'waiting_decision') - Number(left?.status === 'waiting_decision');
    if (waitingDelta) return waitingDelta;
    const dueDelta = String(left?.due || '9999-12-31').localeCompare(String(right?.due || '9999-12-31'));
    if (dueDelta) return dueDelta;
    return String(right?.createdAt || '').localeCompare(String(left?.createdAt || ''));
  }

  function dashboardTaskPanel(executive) {
    const snapshot = typeof getControlSnapshot === 'function'
      ? getControlSnapshot()
      : { tasks: (stateRef()?.storage?.tasks || []) };
    const tasks = Array.isArray(snapshot?.tasks) ? snapshot.tasks : [];
    const manualRows = [...tasks]
      .filter(Boolean)
      .filter((task) => task.source !== 'auto')
      .filter(dashboardTaskIsActive)
      .filter((task) => dashboardTaskMatchesPlatform(task, executive.selectedPlatform))
      .sort(dashboardTaskSort);
    const fallbackPool = Array.isArray(snapshot?.todayList) && snapshot.todayList.length
      ? snapshot.todayList
      : Array.isArray(snapshot?.active) && snapshot.active.length
        ? snapshot.active
        : tasks;
    const fallbackRows = [...fallbackPool]
      .filter(Boolean)
      .filter(dashboardTaskIsActive)
      .filter((task) => dashboardTaskMatchesPlatform(task, executive.selectedPlatform))
      .sort(dashboardTaskSort);
    const usingFallback = manualRows.length === 0;
    return {
      rows: (usingFallback ? fallbackRows : manualRows).slice(0, 8),
      manualCount: manualRows.length,
      usingFallback
    };
  }

  function openControlViewFromDashboard(platformKey) {
    const app = stateRef();
    if (app) {
      app.controlFilters = app.controlFilters || {};
      app.controlFilters.platform = dashboardControlPlatformKey(platformKey);
      app.controlFilters.source = 'all';
      app.controlFilters.status = 'active';
      app.controlFilters.type = 'all';
      app.controlFilters.horizon = 'all';
      app.controlFilters.owner = 'all';
      app.controlFilters.search = '';
      app.controlFilters.priority = 'all';
    }
    if (typeof setView === 'function') {
      setView('control');
      return;
    }
    document.querySelector('.nav-btn[data-view="control"]')?.click();
  }

  decisionSection = function (executive) {
    const panel = dashboardTaskPanel(executive);
    const rows = panel.rows;
    const hasRows = rows.length > 0;
    const overdueCount = rows.filter(dashboardTaskIsOverdue).length;
    const ownerCount = new Set(rows.map((task) => task.owner || 'Без owner')).size;
    const controlPlatformKey = dashboardControlPlatformKey(executive.selectedPlatform);
    const intro = panel.usingFallback
      ? '\u0420\u0443\u0447\u043d\u044b\u0445 \u0437\u0430\u0434\u0430\u0447 \u043f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435 \u0441\u0435\u0439\u0447\u0430\u0441 \u043d\u0435\u0442, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0439 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 short-list. \u041a\u043b\u0438\u043a \u043f\u043e \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435 \u0438\u043b\u0438 \u043f\u043e \u043a\u043d\u043e\u043f\u043a\u0435 \u0441\u0432\u0435\u0440\u0445\u0443 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u0432\u0435\u0441\u044c \u0437\u0430\u0434\u0430\u0447\u043d\u0438\u043a \u043f\u043e \u044d\u0442\u043e\u043c\u0443 \u043a\u043e\u043d\u0442\u0443\u0440\u0443.'
      : '\u0417\u0434\u0435\u0441\u044c \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0440\u0443\u0447\u043d\u044b\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u043f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435. \u041a\u043b\u0438\u043a \u043f\u043e \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435 \u0438\u043b\u0438 \u043f\u043e \u043a\u043d\u043e\u043f\u043a\u0435 \u0441\u0432\u0435\u0440\u0445\u0443 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u0437\u0430\u0434\u0430\u0447\u043d\u0438\u043a \u0441 \u044d\u0442\u0438\u043c \u0436\u0435 \u043a\u043e\u043d\u0442\u0443\u0440\u043e\u043c.';
    return `
      <section class="portal-exec-section is-highlight">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Задачи РОПов: что разобрать первым</h3>
            <p>Здесь показываем активные ручные задачи по выбранной площадке. Клик по карточке или по кнопке сверху открывает задачник с этим же контуром.</p>
          </div>
          ${sectionMetaHtml(executive, [
            badgeHtml(`${int(rows.length)} задач`, rows.length ? 'warn' : 'ok'),
            overdueCount ? badgeHtml(`${int(overdueCount)} проср.`, 'danger') : badgeHtml(`${int(ownerCount)} owner`, 'info'),
            `<button type="button" class="quick-chip" data-portal-open-control="1" data-portal-control-platform="${esc(controlPlatformKey)}">Открыть задачник</button>`
          ])}
        </div>
        <div class="portal-exec-focus-grid">
          ${hasRows ? rows.map((task) => {
            const sku = typeof getSku === 'function' ? getSku(task.articleKey) : null;
            const tone = dashboardTaskTone(task);
            const title = task.title || 'Задача без названия';
            const subtitle = task.nextAction || task.reason || sku?.name || task.entityLabel || 'Нужен следующий шаг по задаче.';
            const subject = sku?.article || task.articleKey || task.entityLabel || 'Без SKU';
            return `
              <article
                class="portal-exec-card portal-exec-focus-card is-${tone} is-clickable"
                data-portal-open-control="1"
                data-portal-control-platform="${esc(controlPlatformKey)}"
              >
                <div class="portal-exec-card-head">
                  <span class="portal-exec-card-label">${esc(subject)}</span>
                  ${dashboardTaskStatusChip(task)}
                </div>
                <strong>${esc(title)}</strong>
                <p>${esc(subtitle)}</p>
                <div class="muted small" style="margin-top:8px">${esc(task.owner || 'Без owner')} · срок ${esc(task.due || '—')}</div>
                <div class="portal-exec-chip-stack">
                  ${dashboardTaskPriorityChip(task)}
                  ${dashboardTaskPlatformChip(task)}
                </div>
              </article>
            `;
          }).join('') : `<div class="portal-exec-empty">По выбранной площадке сейчас нет ручных задач РОПов. Откройте задачник, чтобы посмотреть весь контур.</div>`}
        </div>
      </section>
    `;
  }

  const bindDashboardBase = bindDashboard;
  bindDashboard = function (root, executive) {
    bindDashboardBase(root, executive);
    root.querySelectorAll('[data-portal-open-control]').forEach((node) => {
      if (node.dataset.portalControlBound === '1') return;
      node.dataset.portalControlBound = '1';
      node.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openControlViewFromDashboard(node.dataset.portalControlPlatform || executive.selectedPlatform || 'all');
      });
    });
  };

  function renderDashboard(executive) {
    const root = document.getElementById('view-dashboard');
    if (!root) return;
    ensureStyles();
    ensureModal();
    hideLegacyDashboard(root);
    root.querySelector('[data-portal-dashboard-executive-root]')?.remove();
    const container = document.createElement('div');
    container.id = ROOT_ID;
    container.dataset.portalDashboardExecutiveRoot = 'true';
    container.innerHTML = [
      periodSection(executive, executive.metrics.some((metric) => metric.adsReady)),
      overviewSection(executive),
      executive.selectedPlatform === 'all' ? platformSection(executive) : '',
      issuesSection(executive),
      `<div class="portal-exec-section-foot">Источник факта: ${esc(executive.range.availableLabel)} · daily bridge из Google Sheets в 09:00 МСК · актуально на ${esc(longDate(executive.range.max))}.</div>`
    ].join('');
    root.insertAdjacentElement('afterbegin', container);
    bindDashboard(root, executive);
  }

  function renderDashboard(executive) {
    const root = document.getElementById('view-dashboard');
    if (!root) return;
    ensureStyles();
    ensureModal();
    hideLegacyDashboard(root);
    root.querySelector('[data-portal-dashboard-executive-root]')?.remove();
    const container = document.createElement('div');
    container.id = ROOT_ID;
    container.dataset.portalDashboardExecutiveRoot = 'true';
    container.innerHTML = [
      periodSection(executive, executive.metrics.some((metric) => metric.adsReady)),
      overviewSection(executive),
      executive.selectedPlatform === 'all' ? platformSection(executive) : '',
      priceSection(executive),
      marginSection(executive),
      stockSection(executive),
      adsSection(executive),
      issuesSection(executive),
      `<div class="portal-exec-section-foot">Источник факта: ${esc(executive.range.availableLabel)} · daily bridge из Google Sheets в 09:00 МСК · актуально на ${esc(longDate(executive.range.max))}.</div>`
    ].join('');
    root.insertAdjacentElement('afterbegin', container);
    bindDashboard(root, executive);
  }

  function ensureDashboardManagementStyles() {
    if (document.getElementById('portalDashboardManagementStyles')) return;
    const style = document.createElement('style');
    style.id = 'portalDashboardManagementStyles';
    style.textContent = `
      #view-dashboard .portal-exec-bullet-list { margin: 10px 0 0; padding-left: 18px; color: rgba(245,232,207,.74); display: grid; gap: 6px; }
      #view-dashboard .portal-exec-bullet-list li { line-height: 1.45; }
      #view-dashboard .portal-exec-focus-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      #view-dashboard .portal-exec-focus-card { padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.03); }
      #view-dashboard .portal-exec-focus-card strong { color: #f6ead4; display: block; }
      #view-dashboard .portal-exec-focus-card p { margin: 8px 0 0; color: rgba(245,232,207,.66); font-size: 13px; line-height: 1.45; }
      #view-dashboard .portal-exec-focus-card .portal-exec-chip-stack { margin-top: 10px; }
      body > .portal-exec-modal > .portal-exec-modal-card { display: grid; gap: 14px; width: min(1860px, 98vw) !important; max-height: 94vh !important; overflow: auto !important; padding: 20px 22px !important; }
      body > .portal-exec-modal .portal-exec-modal-metrics { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)) !important; }
      body > .portal-exec-modal .portal-exec-modal-grid { grid-template-columns: minmax(420px, 1.02fr) minmax(620px, .98fr) !important; gap: 16px !important; align-items: start !important; }
      body > .portal-exec-modal .portal-exec-modal-grid > * { min-width: 0 !important; }
      body > .portal-exec-modal .portal-exec-side-stack { display: grid; gap: 14px; min-width: 0; align-content: start; }
      body > .portal-exec-modal .portal-exec-modal-card { min-width: 0; }
      body > .portal-exec-modal .portal-exec-modal-grid .portal-exec-modal-card,
      body > .portal-exec-modal .portal-exec-side-stack .portal-exec-modal-card,
      body > .portal-exec-modal .portal-exec-modal-actions .portal-exec-modal-card { width: auto !important; max-height: none !important; overflow-x: auto !important; overflow-y: visible !important; }
      body > .portal-exec-modal .portal-exec-modal-actions { margin-top: 14px; min-width: 0; }
      body > .portal-exec-modal .portal-exec-table-title { margin: 0; color: #f6ead4; }
      body > .portal-exec-modal .portal-exec-table-sub { margin: 6px 0 12px; color: rgba(245,232,207,.66); font-size: 13px; line-height: 1.45; }
      body > .portal-exec-modal .portal-exec-modal-table { width: max-content; min-width: 100%; }
      body > .portal-exec-modal .portal-exec-modal-table th,
      body > .portal-exec-modal .portal-exec-modal-table td { min-width: 88px; line-height: 1.4; }
      body > .portal-exec-modal .portal-exec-modal-table th:first-child,
      body > .portal-exec-modal .portal-exec-modal-table td:first-child { min-width: 320px; }
      @media (max-width: 1280px) { #view-dashboard .portal-exec-focus-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 1400px) { body > .portal-exec-modal .portal-exec-modal-grid { grid-template-columns: 1fr !important; } }
      @media (max-width: 720px) { #view-dashboard .portal-exec-focus-grid { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  function ensureAdsManagementStyles() {
    ensureDashboardManagementStyles();
    if (document.getElementById(ADS_MANAGEMENT_STYLE_ID)) return;
    const baseStyle = document.getElementById('portalDashboardManagementStyles');
    if (!baseStyle) return;
    const style = document.createElement('style');
    style.id = ADS_MANAGEMENT_STYLE_ID;
    style.textContent = String(baseStyle.textContent || '').replace(/#view-dashboard/g, `#${ADS_VIEW_ID}`);
    document.head.appendChild(style);
  }

  function detailTailRows(rows, limit = 14) {
    return Array.isArray(rows) ? rows.slice(Math.max(0, rows.length - limit)) : [];
  }

  function renderActionBullets(items, emptyCopy) {
    const lines = (items || []).filter(Boolean);
    if (!lines.length) return `<div class="portal-exec-modal-card"><strong>Что делать сейчас</strong><p>${esc(emptyCopy || 'Сильных отклонений по выбранному окну не видно.')}</p></div>`;
    return `
      <div class="portal-exec-modal-card">
        <strong>Что делать сейчас</strong>
        <ul class="portal-exec-bullet-list">${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
      </div>
    `;
  }

  function metricActionBullets(metric, executive, turnoverMetric = null) {
    const items = [];
    const turnover = turnoverMetric || buildTurnoverMetric(metric.key, executive.range);
    if (num(metric.completion) < 0.85) items.push(`План закрывается только на ${pct(metric.completion)}. Проверьте лидирующие и провальные SKU.`);
    if (num(metric.issues?.counters?.priceShock) > 0) items.push(`Есть ${int(metric.issues.counters.priceShock)} SKU со сдвигом цены больше 10% по выбранному окну. Их стоит открыть из ценового drilldown и проверить коридор.`);
    if (num(metric.issues?.counters?.funnelDrop) > 0) items.push(`Есть ${int(metric.issues.counters.funnelDrop)} SKU с провалом рекламной воронки. Сначала смотрим CTR, заказы и выручку относительно прошлого окна.`);
    if (num(metric.marginPct) < 0.18) items.push(`Маржа просела до ${pct(metric.marginPct)}. Нужна проверка цены, скидки клиента и промо.`);
    if (turnover.avgTurnoverDays !== null && turnover.avgTurnoverDays > 60) items.push(`Оборачиваемость выросла до ${turnover.avgTurnoverDays.toFixed(1)} дн. Смотрите запас и спрос по SKU.`);
    if (num(metric.issues?.counters?.negativeMargin) > 0) items.push(`Есть ${int(metric.issues.counters.negativeMargin)} SKU с отрицательной маржой. Их стоит открыть во вкладке цен.`);
    if (num(metric.issues?.counters?.lowStock) > 0) items.push(`Есть ${int(metric.issues.counters.lowStock)} SKU с низким покрытием. Это риск просадки плана.`);
    if (!items.length) items.push('Сильных отклонений по окну не видно. Используйте левый список как короткий чек-лист.');
    return items.slice(0, 4);
  }

  function dashboardDecisionSignals(row) {
    const items = [];
    const priceShockKind = priceShockSignalKind(row?.priceDeltaPct);
    const funnelKind = funnelDropSignalKind(row);
    if (priceShockKind && Number.isFinite(Number(row?.priceDeltaPct))) {
      items.push({ label: `Цена ${row.priceDeltaPct >= 0 ? '+' : ''}${pct(row.priceDeltaPct)}`, kind: priceShockKind });
    }
    if (funnelKind) items.push({ label: `Воронка ${strongestFunnelDropLabel(row)}`, kind: funnelKind });
    if (row.marginPct !== null && row.marginPct < 0.18) items.push({ label: `Маржа ${pct(row.marginPct)}`, kind: row.marginPct < 0.1 ? 'danger' : 'warn' });
    if (row.completionPct !== null && row.completionPct < 0.8) items.push({ label: `План ${pct(row.completionPct)}`, kind: row.completionPct < 0.6 ? 'danger' : 'warn' });
    if (row.avgTurnoverDays !== null && row.avgTurnoverDays > 60) items.push({ label: `Оборач. ${row.avgTurnoverDays.toFixed(1)} дн.`, kind: row.avgTurnoverDays > 90 ? 'danger' : 'warn' });
    if (row.actualUnitsSelected == null) items.push({ label: 'Нет daily SKU', kind: 'info' });
    return items;
  }

  function dashboardDecisionScore(row) {
    return dashboardDecisionSignals(row).reduce((sum, item) => sum + (item.kind === 'danger' ? 3 : item.kind === 'warn' ? 2 : 1), 0);
  }

  function dashboardDecisionQueue(executive) {
    const scopedKey = executive.selectedPlatform === 'all' ? 'all' : executive.selectedPlatform;
    return articleRowsForPlatform(scopedKey, executive.range)
      .map((row) => ({ ...row, signals: dashboardDecisionSignals(row) }))
      .filter((row) => row.signals.length)
      .sort((left, right) => dashboardDecisionScore(right) - dashboardDecisionScore(left) || num(right.salesValue) - num(left.salesValue))
      .slice(0, 8);
  }

  function dashboardSelectedPlatformLabel(executive) {
    return executive.selectedPlatform === 'all'
      ? 'Все площадки'
      : (executive.byKey.get(executive.selectedPlatform)?.label || String(executive.selectedPlatform || '').toUpperCase());
  }

  function dashboardAdsSignals(row) {
    const items = [];
    const priceShockKind = priceShockSignalKind(row?.priceDeltaPct);
    const funnelKind = funnelDropSignalKind(row);
    if (priceShockKind && Number.isFinite(Number(row?.priceDeltaPct))) {
      items.push({ label: `Цена ${row.priceDeltaPct >= 0 ? '+' : ''}${pct(row.priceDeltaPct)}`, kind: priceShockKind });
    }
    if (funnelKind) items.push({ label: `Воронка ${strongestFunnelDropLabel(row)}`, kind: funnelKind });
    if (row.adDrr !== null) items.push({ label: `ДРР ${pct(row.adDrr)}`, kind: toneDrr(row.adDrr) });
    return items;
  }

  function dashboardAdsSignalScore(row) {
    return (row.signals || []).reduce((sum, item) => sum + (item.kind === 'danger' ? 3 : item.kind === 'warn' ? 2 : 1), 0);
  }

  function dashboardAdsSignalQueue(executive) {
    const scopedKey = executive.selectedPlatform === 'all' ? 'all' : executive.selectedPlatform;
    return articleRowsForPlatform(scopedKey, executive.range)
      .map((row) => ({ ...row, signals: dashboardAdsSignals(row) }))
      .filter((row) => row.signals.length)
      .sort((left, right) => dashboardAdsSignalScore(right) - dashboardAdsSignalScore(left) || num(right.adRevenue) - num(left.adRevenue) || num(right.salesValue) - num(left.salesValue))
      .slice(0, 8);
  }

  function buildCompletionDetail(metric, executive) {
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .sort((left, right) => num(left.completionPct) - num(right.completionPct) || num(right.planUnitsSelected) - num(left.planUnitsSelected) || num(right.salesValue) - num(left.salesValue))
      .slice(0, 18);
    const focusDays = detailTailRows(metric.days, 14);
    const previous = executive.compareByKey.get(metric.key);
    const completionDelta = percentagePointDelta(metric.completion, previous?.completion);
    return {
      title: `${metric.label} · план-факт по артикулу`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}. Справа всегда последние 14 дней доступного факта.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('% выполнения', pct(metric.completion))}
          ${modalSummaryCard('WoW', completionDelta !== null ? `${completionDelta >= 0 ? '+' : ''}${(completionDelta * 100).toFixed(1)} pp` : '—')}
          ${modalSummaryCard('План периода', int(metric.plan))}
          ${modalSummaryCard('Факт периода', int(metric.units))}
          ${modalSummaryCard('Факт / день', int(metric.avgUnits))}
          ${modalSummaryCard('Выручка', money(metric.revenue))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Короткий список для разбора: кто не добирает план, кто делает выручку и кого нужно открыть во вкладке цен.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>План</th>
                  <th>Факт</th>
                  <th>%</th>
                  <th>Выручка</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.planUnitsSelected !== null ? int(row.planUnitsSelected) : '—')}</td>
                    <td>${esc(row.actualUnitsSelected !== null ? int(row.actualUnitsSelected) : '—')}</td>
                    <td>${esc(row.completionPct !== null ? pct(row.completionPct) : '—')}</td>
                    <td>${esc(row.salesValue ? money(row.salesValue) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По выбранной площадке нет SKU-среза.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">План, факт и выручка по дням. Это окно отвечает на вопрос: когда именно начался провал или ускорение.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>План</th>
                    <th>Факт</th>
                    <th>%</th>
                    <th>Выручка</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(int(row.planUnits))}</td>
                      <td>${esc(int(row.factUnits))}</td>
                      <td>${esc(row.planUnits > 0 ? pct(row.factUnits / row.planUnits) : '—')}</td>
                      <td>${esc(money(row.revenue))}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="5">Нет дневных данных по выбранному окну.</td></tr>`}
                </tbody>
              </table>
            </div>
            ${renderActionBullets(metricActionBullets(metric, executive), 'План-факт выглядит стабильно, открывайте только отдельные SKU с вопросами.')}
          </div>
        </div>
      `
    };
  }

  function buildPriceDetail(metric, executive) {
    const previous = executive.compareByKey.get(metric.key);
    const avgCheckDelta = relativeDelta(metric.avgCheck, previous?.avgCheck);
    const priceDailyMap = new Map((metric.priceMatrixSeries || []).map((row) => [iso(row.date), row]));
    const focusDays = detailTailRows(metric.days, 14).map((row) => {
      const avgCheck = row.factUnits > 0 ? row.revenue / row.factUnits : null;
      const matrix = priceDailyMap.get(iso(row.date));
      return {
        date: row.date,
        units: row.factUnits,
        revenue: row.revenue,
        avgCheck,
        avgPrice: matrix?.avgPrice || 0,
        skuCount: matrix?.skuCount || 0
      };
    });
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .map((row) => ({
        ...row,
        deltaPct: row.startPrice > 0 && row.endPrice > 0 ? (row.endPrice - row.startPrice) / row.startPrice : null
      }))
      .sort((left, right) => Math.abs(num(right.deltaPct)) - Math.abs(num(left.deltaPct)) || num(right.avgPrice) - num(left.avgPrice))
      .slice(0, 18);
    return {
      title: `${metric.label} · средний чек и цена`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}. Справа последние 14 дней витринной цены и среднего чека.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Средний чек', metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}
          ${modalSummaryCard('WoW', avgCheckDelta !== null ? pct(avgCheckDelta) : '—')}
          ${modalSummaryCard('Средняя цена витрины', metric.priceMatrixAvg > 0 ? money(metric.priceMatrixAvg) : '—')}
          ${modalSummaryCard('Цена на старте', metric.priceMatrixStart > 0 ? money(metric.priceMatrixStart) : '—')}
          ${modalSummaryCard('Цена на финише', metric.priceMatrixEnd > 0 ? money(metric.priceMatrixEnd) : '—')}
          ${modalSummaryCard('SKU в матрице', int(priceRowsForPlatform(metric.key).length))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Кто двигал средний чек: изменение MP, текущая оборачиваемость и выручка по SKU.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Старт MP</th>
                  <th>Финиш MP</th>
                  <th>Δ</th>
                  <th>Обор.</th>
                  <th>Выручка</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.startPrice > 0 ? money(row.startPrice) : '—')}</td>
                    <td>${esc(row.endPrice > 0 ? money(row.endPrice) : '—')}</td>
                    <td>${esc(row.deltaPct !== null ? pct(row.deltaPct) : '—')}</td>
                    <td>${esc(row.avgTurnoverDays !== null ? `${row.avgTurnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(row.salesValue ? money(row.salesValue) : '—')}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По выбранному окну нет ценового списка.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Средний чек, выручка, витринная цена и число SKU в ежедневном срезе.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Шт.</th>
                    <th>Выручка</th>
                    <th>Средний чек</th>
                    <th>Средняя цена</th>
                    <th>SKU</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(int(row.units))}</td>
                      <td>${esc(money(row.revenue))}</td>
                      <td>${esc(row.avgCheck ? money(row.avgCheck) : '—')}</td>
                      <td>${esc(row.avgPrice > 0 ? money(row.avgPrice) : '—')}</td>
                      <td>${esc(int(row.skuCount))}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="6">Нет 14-дневного ряда по среднему чеку.</td></tr>`}
                </tbody>
              </table>
            </div>
            ${renderActionBullets(metricActionBullets(metric, executive), 'Слой цены выглядит ровно. Смотрите только SKU с резкой дельтой или плохой оборачиваемостью.')}
          </div>
        </div>
      `
    };
  }

  function buildRevenueDetail(metric, executive) {
    const previous = executive.compareByKey.get(metric.key);
    const revenueDelta = relativeDelta(metric.revenue, previous?.revenue);
    const priceDailyMap = new Map((metric.priceMatrixSeries || []).map((row) => [iso(row.date), row]));
    const focusDays = detailTailRows(metric.days, 14).map((row) => {
      const avgCheck = row.factUnits > 0 ? row.revenue / row.factUnits : null;
      const matrix = priceDailyMap.get(iso(row.date));
      return {
        date: row.date,
        planUnits: row.planUnits,
        units: row.factUnits,
        completion: row.planUnits > 0 ? row.factUnits / row.planUnits : null,
        revenue: row.revenue,
        avgCheck,
        avgPrice: matrix?.avgPrice || 0
      };
    });
    const skuRows = articleRowsForPlatform(metric.key, executive.range)
      .sort((left, right) => num(right.salesValue) - num(left.salesValue) || num(right.actualUnitsSelected) - num(left.actualUnitsSelected))
      .slice(0, 18);
    return {
      title: `${metric.label} · оборот и продажи`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}. Справа последние 14 дней оборота.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Выручка', money(metric.revenue))}
          ${modalSummaryCard('WoW', revenueDelta !== null ? pct(revenueDelta) : '—')}
          ${modalSummaryCard('Продано, шт.', int(metric.units))}
          ${modalSummaryCard('План периода', int(metric.plan))}
          ${modalSummaryCard('% к плану', pct(metric.completion))}
          ${modalSummaryCard('Средний чек', metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Топ SKU по обороту. Отсюда удобно сразу открыть карточку цены и проверить причину изменения.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Выручка</th>
                  <th>Факт</th>
                  <th>План</th>
                  <th>%</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${skuRows.length ? skuRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.salesValue ? money(row.salesValue) : '—')}</td>
                    <td>${esc(row.actualUnitsSelected !== null ? int(row.actualUnitsSelected) : '—')}</td>
                    <td>${esc(row.planUnitsSelected !== null ? int(row.planUnitsSelected) : '—')}</td>
                    <td>${esc(row.completionPct !== null ? pct(row.completionPct) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">Нет SKU-списка по обороту.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Дневной ряд продаж, плана, выручки и среднего чека. Он нужен для быстрого ответа, когда началось изменение.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>План</th>
                    <th>Факт</th>
                    <th>%</th>
                    <th>Выручка</th>
                    <th>Средний чек</th>
                    <th>Средняя цена</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(int(row.planUnits))}</td>
                      <td>${esc(int(row.units))}</td>
                      <td>${esc(row.completion !== null ? pct(row.completion) : '—')}</td>
                      <td>${esc(money(row.revenue))}</td>
                      <td>${esc(row.avgCheck ? money(row.avgCheck) : '—')}</td>
                      <td>${esc(row.avgPrice > 0 ? money(row.avgPrice) : '—')}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="7">Нет дневных данных по продажам.</td></tr>`}
                </tbody>
              </table>
            </div>
            ${renderActionBullets(metricActionBullets(metric, executive), 'Оборот выглядит стабильно. Используйте левый список как короткий лист лидеров по выручке.')}
          </div>
        </div>
      `
    };
  }

  function buildMarginDetail(metric, executive) {
    const previous = executive.compareByKey.get(metric.key);
    const marginDelta = relativeDelta(metric.margin, previous?.margin);
    const rows = marginRowsForPlatform(metric.key)
      .sort((left, right) => left.marginPct - right.marginPct || right.stock - left.stock)
      .slice(0, 18);
    const focusDays = detailTailRows(metric.days, 14);
    return {
      title: `${metric.label} · маржа по SKU`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}. Справа последние 14 дней маржи и выручки.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Маржа', money(metric.margin))}
          ${modalSummaryCard('WoW', marginDelta !== null ? pct(marginDelta) : '—')}
          ${modalSummaryCard('Маржинальность', pct(metric.marginPct))}
          ${modalSummaryCard('Выручка', money(metric.revenue))}
          ${modalSummaryCard('Продано, шт.', int(metric.units))}
          ${modalSummaryCard('Отрицательная маржа', int(metric.issues?.counters?.negativeMargin || 0))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Позиции с самой низкой маржой. Это короткий список для перехода в карточку цены и проверки коридора.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Маржа %</th>
                  <th>Остаток</th>
                  <th>Обор.</th>
                  <th>Цена</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(pct(row.marginPct))}</td>
                    <td>${esc(int(row.stock))}</td>
                    <td>${esc(row.turnoverDays !== null ? `${row.turnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(row.currentPrice > 0 ? money(row.currentPrice) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По площадке нет SKU по марже.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Дневная маржа, маржинальность, выручка и штуки. Это помогает отличить ценовую проблему от проблемы спроса.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Выручка</th>
                    <th>Маржа</th>
                    <th>Маржинальность</th>
                    <th>Шт.</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(money(row.revenue))}</td>
                      <td>${esc(money(row.margin))}</td>
                      <td>${esc(row.revenue > 0 ? pct(row.margin / row.revenue) : '—')}</td>
                      <td>${esc(int(row.factUnits))}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="5">Нет дневных данных по марже.</td></tr>`}
                </tbody>
              </table>
            </div>
            ${renderActionBullets(metricActionBullets(metric, executive), 'Маржа по окну выглядит ровно. В первую очередь проверяйте только позиции с худшей маржинальностью слева.')}
          </div>
        </div>
      `
    };
  }

  function buildStockDetail(platformKey, executive) {
    const stockMetric = buildTurnoverMetric(platformKey, executive.range);
    const turnoverRows = articleRowsForPlatform(platformKey, executive.range)
      .sort((left, right) => num(right.avgTurnoverDays) - num(left.avgTurnoverDays) || right.stock - left.stock)
      .slice(0, 18);
    const priceDailyMap = new Map(priceMatrixSeries(platformKey, executive.range).map((row) => [iso(row.date), row]));
    const focusDays = detailTailRows(stockMetric.turnoverPublishedSeries, 14);
    return {
      title: `${stockMetric.label} · оборачиваемость и запас`,
      subtitle: `Запрос: ${executive.range.requestedLabel}. В расчёте: ${executive.range.effectiveLabel}. Справа последние 14 дней ряда по оборачиваемости, если он опубликован.`,
      body: `
        <div class="portal-exec-modal-metrics">
          ${modalSummaryCard('Остаток, шт.', int(stockMetric.totalStock))}
          ${modalSummaryCard('В пути, шт.', int(stockMetric.totalTransit))}
          ${modalSummaryCard('Средняя оборачиваемость', stockMetric.avgTurnoverDays !== null ? `${stockMetric.avgTurnoverDays.toFixed(1)} дн.` : '—')}
          ${modalSummaryCard('Низкое покрытие', int(stockMetric.lowCoverage))}
          ${modalSummaryCard('Избыточный запас', int(stockMetric.overstock))}
          ${modalSummaryCard('SKU в срезе', int(stockMetric.skuCount))}
        </div>
        <div class="portal-exec-modal-grid">
          <div class="portal-exec-modal-card">
            <h4 class="portal-exec-table-title">Слева артикула</h4>
            <p class="portal-exec-table-sub">Список SKU по запасу и оборачиваемости. Это главный слой для решения: распродавать, поднимать цену или дозаказывать.</p>
            <table class="portal-exec-modal-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Площадка</th>
                  <th>Обор.</th>
                  <th>Остаток</th>
                  <th>В пути</th>
                  <th>Маржа %</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                ${turnoverRows.length ? turnoverRows.map((row) => `
                  <tr${priceWorkbenchOpenAttrs(row.platformKey, row.article, executive)}>
                    <td><strong>${esc(row.article)}</strong><div class="muted small">${esc(row.name)}</div></td>
                    <td>${esc(row.platformLabel)}</td>
                    <td>${esc(row.avgTurnoverDays !== null ? `${row.avgTurnoverDays.toFixed(1)} дн.` : '—')}</td>
                    <td>${esc(int(row.stock))}</td>
                    <td>${esc(int(row.inTransit))}</td>
                    <td>${esc(row.marginPct !== null ? pct(row.marginPct) : '—')}</td>
                    <td>${esc(row.owner)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="7">По площадке нет рабочего списка по запасу.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="portal-exec-side-stack">
            <div class="portal-exec-modal-card">
              <h4 class="portal-exec-table-title">Справа 14 дней</h4>
              <p class="portal-exec-table-sub">Если daily-ряд оборачиваемости приехал, здесь видно, когда запас стал проблемой. Если нет, используйте левую таблицу как основной контур.</p>
              <table class="portal-exec-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Средняя обор.</th>
                    <th>SKU с daily</th>
                    <th>Средняя цена</th>
                  </tr>
                </thead>
                <tbody>
                  ${focusDays.length ? focusDays.map((row) => `
                    <tr>
                      <td>${esc(shortDate(row.date))}</td>
                      <td>${esc(row.avgTurnover !== null ? `${row.avgTurnover.toFixed(1)} дн.` : '—')}</td>
                      <td>${esc(int(row.skuCount))}</td>
                      <td>${esc(priceDailyMap.get(iso(row.date))?.avgPrice > 0 ? money(priceDailyMap.get(iso(row.date)).avgPrice) : '—')}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="4">Для выбранного окна daily-ряд оборачиваемости пока не опубликован.</td></tr>`}
                </tbody>
              </table>
            </div>
            ${renderActionBullets([
              stockMetric.lowCoverage > 0 ? `Есть ${int(stockMetric.lowCoverage)} SKU с низким покрытием. Проверяйте риск выпадения спроса.` : '',
              stockMetric.overstock > 0 ? `Есть ${int(stockMetric.overstock)} SKU с медленной оборачиваемостью. Ищите связку цена + спрос.` : '',
              stockMetric.avgTurnoverDays !== null && stockMetric.avgTurnoverDays > 60 ? `Средняя оборачиваемость ${stockMetric.avgTurnoverDays.toFixed(1)} дн. Для РОПа это уже зона ручного решения.` : ''
            ], 'По запасу сильных отклонений не видно.')}
          </div>
        </div>
      `
    };
  }

  function overviewSection(executive) {
    const metric = executive.focusMetric || executive.overall;
    const previous = executive.compareByKey.get(metric.key);
    const turnover = buildTurnoverMetric(metric.key, executive.range);
    const revenueDelta = relativeDelta(metric.revenue, previous?.revenue);
    const avgCheckDelta = relativeDelta(metric.avgCheck, previous?.avgCheck);
    const marginDelta = relativeDelta(metric.margin, previous?.margin);
    const turnoverDelta = relativeDelta(turnover.avgTurnoverDays, previous?.avgTurnoverDays);
    const completionDelta = percentagePointDelta(metric.completion, previous?.completion);
    return `
      <section class="portal-exec-section is-highlight">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>5 управленческих графиков</h3>
            <p>Это главный слой для РОПа. Каждая карточка отвечает на один вопрос, а по клику открывает drilldown: слева артикула, справа последние 14 дней той же метрики.</p>
          </div>
          ${sectionMetaHtml(executive, [executive.compareRange ? badgeHtml(`LFL: ${executive.compareRange.label}`, executive.compareRange.clamped ? 'warn' : 'info') : badgeHtml('LFL: нет окна сравнения', 'info')])}
        </div>
        <div class="portal-exec-metric-strip">
          <article class="portal-exec-card is-${toneCompletion(metric.completion)} is-clickable" data-portal-exec-open="revenue" data-portal-exec-key="${esc(metric.key)}">
            <div class="portal-exec-card-head"><span class="portal-exec-card-label">Оборот WoW</span>${deltaBadge('LFL', revenueDelta)}</div>
            <div class="portal-exec-card-value compact">${esc(money(metric.revenue))}</div>
            <div class="portal-exec-sub">Продано ${esc(int(metric.units))} шт. Клик покажет артикулы и 14 дней оборота по этой же площадке.</div>
            ${renderSparkline(metric.sparkRevenue)}
            <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
          </article>
          <article class="portal-exec-card is-clickable" data-portal-exec-open="price" data-portal-exec-key="${esc(metric.key)}">
            <div class="portal-exec-card-head"><span class="portal-exec-card-label">Средний чек WoW</span>${deltaBadge('LFL', avgCheckDelta)}</div>
            <div class="portal-exec-card-value compact">${esc(metric.avgCheck > 0 ? money(metric.avgCheck) : '—')}</div>
            <div class="portal-exec-sub">Показывает реакцию спроса на цену. Клик откроет артикулы и 14 дней среднего чека.</div>
            ${renderSparkline(metric.sparkAvgCheck)}
            <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
          </article>
          <article class="portal-exec-card is-${toneMargin(metric.marginPct)} is-clickable" data-portal-exec-open="margin" data-portal-exec-key="${esc(metric.key)}">
            <div class="portal-exec-card-head"><span class="portal-exec-card-label">Маржа WoW</span>${deltaBadge('LFL', marginDelta)}</div>
            <div class="portal-exec-card-value compact">${esc(money(metric.margin))}</div>
            <div class="portal-exec-sub">Показывает качество прибыли. Клик даст артикулы с маржой и 14 дней динамики.</div>
            ${renderSparkline(metric.sparkMargin)}
            <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
          </article>
          <article class="portal-exec-card is-${turnover.avgTurnoverDays !== null && turnover.avgTurnoverDays > 90 ? 'warn' : 'ok'} is-clickable" data-portal-exec-open="stock" data-portal-exec-key="${esc(turnover.key)}">
            <div class="portal-exec-card-head"><span class="portal-exec-card-label">Оборачиваемость</span>${deltaBadge('LFL', turnoverDelta, true)}</div>
            <div class="portal-exec-card-value compact">${esc(turnover.avgTurnoverDays !== null ? `${turnover.avgTurnoverDays.toFixed(1)} дн.` : '—')}</div>
            <div class="portal-exec-sub">Остаток ${esc(int(turnover.totalStock))} · в пути ${esc(int(turnover.totalTransit))}. Клик откроет артикулы и ряд по дням.</div>
            ${renderSparkline(turnover.sparkTurnover || turnover.sparkStock)}
            <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
          </article>
          <article class="portal-exec-card is-${toneCompletion(metric.completion)} is-clickable" data-portal-exec-open="completion" data-portal-exec-key="${esc(metric.key)}">
            <div class="portal-exec-card-head"><span class="portal-exec-card-label">План и выполнение</span>${deltaBadge('LFL', completionDelta, false, 'pp')}</div>
            <div class="portal-exec-card-value compact">${esc(pct(metric.completion))}</div>
            <div class="portal-exec-sub">План ${esc(int(metric.plan))} · факт ${esc(int(metric.units))}. Клик покажет план по артикулам и 14 дней выполнения.</div>
            <div class="portal-exec-progress is-${toneCompletion(metric.completion)}"><span style="width:${Math.max(6, Math.min(100, Math.round(num(metric.completion) * 100)))}%"></span></div>
            ${renderSparkline(metric.sparkUnits)}
            <div class="portal-exec-axis"><span>${esc(shortDate(executive.range.effectiveStart))}</span><span>${esc(shortDate(executive.range.effectiveEnd))}</span></div>
          </article>
        </div>
      </section>
    `;
  }

  function platformSection(executive) {
    const metrics = visibleMetrics(executive);
    return `
      <section class="portal-exec-section">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Площадки: короткий статус</h3>
            <p>Это управленческий срез по каждой площадке: как идёт план, какая маржа и где уже нужна ручная работа. Клик по карточке открывает drilldown по план-факту.</p>
          </div>
          ${sectionMetaHtml(executive, [badgeHtml(`${int(metrics.length)} площадки`, 'info')])}
        </div>
        <div class="portal-exec-platform-grid">
          ${metrics.map((metric) => {
            const turnover = buildTurnoverMetric(metric.key, executive.range);
            const totalSignals = num(metric.issues?.counters?.toWork)
              + num(metric.issues?.counters?.negativeMargin)
              + num(metric.issues?.counters?.lowStock)
              + num(metric.issues?.counters?.priceShock)
              + num(metric.issues?.counters?.funnelDrop);
            return `
              <article class="portal-exec-card is-${toneCompletion(metric.completion)} is-clickable" data-portal-exec-open="completion" data-portal-exec-key="${esc(metric.key)}">
                <div class="portal-exec-card-head"><span class="portal-exec-card-label">${esc(metric.label)}</span>${badgeHtml(`План ${pct(metric.completion)}`, toneCompletion(metric.completion))}</div>
                <div class="portal-exec-card-value compact">${esc(money(metric.revenue))}</div>
                <div class="portal-exec-sub">Факт ${esc(int(metric.units))} шт. · средний чек ${esc(metric.avgCheck > 0 ? money(metric.avgCheck) : '—')} · маржа ${esc(pct(metric.marginPct))}</div>
                <div class="portal-exec-metric-grid">
                  <div class="portal-exec-metric"><span>Оборач.</span><strong>${esc(turnover.avgTurnoverDays !== null ? `${turnover.avgTurnoverDays.toFixed(1)} дн.` : '—')}</strong></div>
                  <div class="portal-exec-metric"><span>Остаток</span><strong>${esc(int(turnover.totalStock))}</strong></div>
                  <div class="portal-exec-metric"><span>Сигналы</span><strong>${esc(int(totalSignals))}</strong></div>
                  <div class="portal-exec-metric"><span>Отриц. маржа</span><strong>${esc(int(metric.issues?.counters?.negativeMargin || 0))}</strong></div>
                </div>
              </article>
            `;
          }).join('') || `<div class="portal-exec-empty">По выбранной площадке нет рабочего среза.</div>`}
        </div>
      </section>
    `;
  }

  function decisionSection(executive) {
    const rows = dashboardDecisionQueue(executive);
    return `
      <section class="portal-exec-section is-highlight">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Что разобрать первым</h3>
            <p>Это короткая очередь решений для РОПа. Карточка сразу открывает выбранный артикул во вкладке цен с тем же диапазоном дат.</p>
          </div>
          ${sectionMetaHtml(executive, [badgeHtml(`${int(rows.length)} SKU в очереди`, rows.length ? 'warn' : 'ok')])}
        </div>
        <div class="portal-exec-focus-grid">
          ${rows.map((row) => {
            const signals = row.signals || [];
            const tone = signals.some((item) => item.kind === 'danger') ? 'danger' : signals.some((item) => item.kind === 'warn') ? 'warn' : 'ok';
            return `
              <article
                class="portal-exec-card portal-exec-focus-card is-${tone} is-clickable"
                data-portal-open-price-article="${esc(row.article)}"
                data-portal-open-price-market="${esc(row.platformKey === 'ya' ? 'ym' : row.platformKey)}"
                data-portal-open-price-from="${esc(iso(executive.range.effectiveStart))}"
                data-portal-open-price-to="${esc(iso(executive.range.effectiveEnd))}"
              >
                <div class="portal-exec-card-head">
                  <span class="portal-exec-card-label">${esc(row.platformLabel)}</span>
                  ${badgeHtml(`Owner ${row.owner || '—'}`, row.owner && row.owner !== 'Без owner' ? 'ok' : 'warn')}
                </div>
                <strong>${esc(row.article)}</strong>
                <p>${esc(row.name)}</p>
                <div class="portal-exec-chip-stack">${signals.map((item) => badgeHtml(item.label, item.kind)).join('')}</div>
              </article>
            `;
          }).join('') || `<div class="portal-exec-empty">Явной очереди решений по текущему окну не видно.</div>`}
        </div>
      </section>
    `;
  }

  function adsSignalsSection(executive) {
    const rows = dashboardAdsSignalQueue(executive);
    const selectedPlatformLabel = dashboardSelectedPlatformLabel(executive);
    return `
      <section class="portal-exec-section is-highlight">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Сигналы рекламы и цены</h3>
            <p>Сюда попадают SKU, где цена сдвинулась больше чем на 10% или рекламная воронка провалилась относительно прошлого окна. Клик сразу открывает карточку цены по тому же периоду.</p>
          </div>
          ${sectionMetaHtml(executive, [
            badgeHtml(selectedPlatformLabel, 'info'),
            badgeHtml(`${int(rows.length)} SKU`, rows.length ? 'warn' : 'ok')
          ])}
        </div>
        <div class="portal-exec-focus-grid">
          ${rows.map((row) => {
            const tone = row.signals.some((item) => item.kind === 'danger') ? 'danger' : row.signals.some((item) => item.kind === 'warn') ? 'warn' : 'ok';
            return `
              <article
                class="portal-exec-card portal-exec-focus-card is-${tone} is-clickable"
                data-portal-open-price-article="${esc(row.article)}"
                data-portal-open-price-market="${esc(row.platformKey === 'ya' ? 'ym' : row.platformKey)}"
                data-portal-open-price-from="${esc(iso(executive.range.effectiveStart))}"
                data-portal-open-price-to="${esc(iso(executive.range.effectiveEnd))}"
              >
                <div class="portal-exec-card-head">
                  <span class="portal-exec-card-label">${esc(row.platformLabel)}</span>
                  ${badgeHtml(`Owner ${row.owner || '—'}`, row.owner && row.owner !== 'Без owner' ? 'ok' : 'warn')}
                </div>
                <strong>${esc(row.article)}</strong>
                <p>${esc(row.name || 'Без названия')}</p>
                <div class="portal-exec-chip-stack">${row.signals.map((item) => badgeHtml(item.label, item.kind)).join('')}</div>
                <p>Реклама ${esc(money(row.adSpend))} · заказы ${esc(int(row.adOrders))} · выручка ${esc(money(row.adRevenue))}</p>
              </article>
            `;
          }).join('') || `<div class="portal-exec-empty">По выбранному окну нет SKU с рекламным провалом или резким ценовым сдвигом.</div>`}
        </div>
      </section>
    `;
  }

  function issuesSection(executive) {
    const metrics = executive.selectedPlatform === 'all'
      ? [executive.overall, ...visibleMetrics(executive)]
      : visibleMetrics(executive);
    return `
      <section class="portal-exec-section">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Сигналы по площадкам</h3>
            <p>Этот блок нужен не для красивой сводки, а чтобы быстро понять, где копится проблема: в марже, запасе, owner или текущей задаче.</p>
          </div>
          ${sectionMetaHtml(executive)}
        </div>
        <div class="portal-exec-issue-grid">
          ${metrics.map((metric) => {
            const counters = metric.issues?.counters || {};
            const total = num(counters.toWork) + num(counters.negativeMargin) + num(counters.lowStock) + num(counters.noOwner);
            const topIssue = metric.issues?.rows?.[0];
            return `
              <article class="portal-exec-card is-${total > 0 ? 'danger' : 'ok'} is-clickable" data-portal-exec-open="issues" data-portal-exec-key="${esc(metric.key)}">
                <div class="portal-exec-card-head"><span class="portal-exec-card-label">${esc(metric.label)}</span>${badgeHtml(`${int(total)} сигналов`, total > 0 ? 'danger' : 'ok')}</div>
                <div class="portal-exec-metric-grid">
                  <div class="portal-exec-metric"><span>В работе</span><strong>${esc(int(counters.toWork))}</strong></div>
                  <div class="portal-exec-metric"><span>Отриц. маржа</span><strong>${esc(int(counters.negativeMargin))}</strong></div>
                  <div class="portal-exec-metric"><span>Низкий остаток</span><strong>${esc(int(counters.lowStock))}</strong></div>
                  <div class="portal-exec-metric"><span>Без owner</span><strong>${esc(int(counters.noOwner))}</strong></div>
                </div>
                <div class="portal-exec-card-foot"><span>${esc(topIssue ? topIssue.article : 'Без явного лидера риска')}</span><span>${esc(topIssue ? (topIssue.owner || 'Без owner') : '')}</span></div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function issuesSection(executive) {
    const metrics = executive.selectedPlatform === 'all'
      ? [executive.overall, ...visibleMetrics(executive)]
      : visibleMetrics(executive);
    return `
      <section class="portal-exec-section">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Сигналы по площадкам</h3>
            <p>Здесь одним слоем собраны текущие операционные риски и аномалии выбранного окна: owner, маржа, запас, резкий сдвиг цены и провал воронки.</p>
          </div>
          ${sectionMetaHtml(executive)}
        </div>
        <div class="portal-exec-issue-grid">
          ${metrics.map((metric) => {
            const counters = metric.issues?.counters || {};
            const total = num(counters.toWork)
              + num(counters.negativeMargin)
              + num(counters.lowStock)
              + num(counters.noOwner)
              + num(counters.priceShock)
              + num(counters.funnelDrop);
            const topIssue = metric.issues?.rows?.[0];
            return `
              <article class="portal-exec-card is-${total > 0 ? 'danger' : 'ok'} is-clickable" data-portal-exec-open="issues" data-portal-exec-key="${esc(metric.key)}">
                <div class="portal-exec-card-head"><span class="portal-exec-card-label">${esc(metric.label)}</span>${badgeHtml(`${int(total)} сигналов`, total > 0 ? 'danger' : 'ok')}</div>
                <div class="portal-exec-metric-grid">
                  <div class="portal-exec-metric"><span>В работе</span><strong>${esc(int(counters.toWork))}</strong></div>
                  <div class="portal-exec-metric"><span>Отриц. маржа</span><strong>${esc(int(counters.negativeMargin))}</strong></div>
                  <div class="portal-exec-metric"><span>Низкий остаток</span><strong>${esc(int(counters.lowStock))}</strong></div>
                  <div class="portal-exec-metric"><span>Без owner</span><strong>${esc(int(counters.noOwner))}</strong></div>
                  <div class="portal-exec-metric"><span>Цена >10%</span><strong>${esc(int(counters.priceShock))}</strong></div>
                  <div class="portal-exec-metric"><span>Воронка</span><strong>${esc(int(counters.funnelDrop))}</strong></div>
                </div>
                <div class="portal-exec-card-foot"><span>${esc(topIssue ? topIssue.article : 'Без явного лидера риска')}</span><span>${esc(topIssue ? (topIssue.owner || 'Без owner') : '')}</span></div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function bindDashboard(root, executive) {
    root.querySelectorAll('[data-portal-exec-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const stored = ensureRangeState();
        Object.assign(stored, presetRange(button.dataset.portalExecPreset || '7', cleanDate(selectedRange().max || new Date())));
        scheduleApply();
      });
    });

    root.querySelectorAll('[data-portal-exec-platform]').forEach((button) => {
      button.addEventListener('click', () => {
        setPlatformState(button.dataset.portalExecPlatform || 'all');
        scheduleApply();
      });
    });

    const startInput = root.querySelector('[data-portal-exec-start]');
    const endInput = root.querySelector('[data-portal-exec-end]');

    [startInput, endInput].forEach((input) => {
      if (!input || input.dataset.portalExecPickerBound) return;
      input.dataset.portalExecPickerBound = '1';
      input.addEventListener('click', () => openDatePicker(input));
      input.addEventListener('focus', () => openDatePicker(input), { once: true });
    });

    root.querySelectorAll('[data-portal-exec-open-date]').forEach((button) => {
      button.addEventListener('click', () => {
        openDatePicker(button.dataset.portalExecOpenDate === 'end' ? endInput : startInput);
      });
    });

    startInput?.addEventListener('change', (event) => {
      const stored = ensureRangeState();
      stored.mode = 'custom';
      stored.active = '';
      stored.start = event.target.value || stored.start;
      scheduleApply();
    });

    endInput?.addEventListener('change', (event) => {
      const stored = ensureRangeState();
      stored.mode = 'custom';
      stored.active = '';
      stored.end = event.target.value || stored.end;
      scheduleApply();
    });

    root.querySelectorAll('[data-portal-exec-open]').forEach((card) => {
      card.addEventListener('click', () => {
        const key = card.dataset.portalExecKey || 'all';
        const kind = card.dataset.portalExecOpen || 'platform';
        const metric = executive.byKey.get(key) || executive.overall;
        if (!metric) return;
        if (kind === 'content-summary') {
          openModal(buildContentSliceDetail());
          return;
        }
        if (kind === 'completion') {
          openModal(buildCompletionDetail(metric, executive));
          return;
        }
        if (kind === 'stock') {
          openModal(buildStockDetail(key, executive));
          return;
        }
        if (kind === 'margin') {
          openModal(buildMarginDetail(metric, executive));
          return;
        }
        if (kind === 'ads') {
          openModal(buildAdsDetail(metric, executive));
          return;
        }
        if (kind === 'revenue') {
          openModal(buildRevenueDetail(metric, executive));
          return;
        }
        if (kind === 'price') {
          openModal(buildPriceDetail(metric, executive));
          return;
        }
        if (kind === 'platform') {
          openModal(buildCompletionDetail(metric, executive));
          return;
        }
        openModal(buildPlatformDetail(metric, executive, kind));
      });
    });

    root.querySelectorAll('[data-portal-open-price-article]').forEach((card) => {
      card.addEventListener('click', () => {
        if (typeof window.openPriceWorkbenchArticle !== 'function') return;
        Promise.resolve(window.openPriceWorkbenchArticle({
          articleKey: card.dataset.portalOpenPriceArticle || '',
          marketplace: card.dataset.portalOpenPriceMarket || 'wb',
          dateFrom: card.dataset.portalOpenPriceFrom || '',
          dateTo: card.dataset.portalOpenPriceTo || ''
        })).catch((error) => console.error(error));
      });
    });
  }

  function renderRopTaskSection(executive) {
    const panel = dashboardTaskPanel(executive);
    const rows = panel.rows;
    const overdueCount = rows.filter(dashboardTaskIsOverdue).length;
    const ownerCount = new Set(rows.map((task) => task.owner || 'Без owner')).size;
    const controlPlatformKey = dashboardControlPlatformKey(executive.selectedPlatform);
    const selectedPlatformLabel = executive.selectedPlatform === 'all'
      ? 'Все площадки'
      : (executive.byKey.get(executive.selectedPlatform)?.label || String(executive.selectedPlatform || '').toUpperCase());

    const cardsMarkup = rows.length
      ? rows.map((task) => {
        const sku = typeof getSku === 'function' ? getSku(task.articleKey) : null;
        const tone = dashboardTaskTone(task);
        const title = task.title || 'Задача без названия';
        const subtitle = task.nextAction || task.reason || sku?.name || task.entityLabel || 'Нужен следующий шаг по задаче.';
        const subject = sku?.article || task.articleKey || task.entityLabel || 'Без SKU';
        return `
              <article
                class="portal-exec-card portal-exec-focus-card is-${tone} is-clickable"
                data-portal-open-control="1"
                data-portal-control-platform="${esc(controlPlatformKey)}"
              >
                <div class="portal-exec-card-head">
                  <span class="portal-exec-card-label">${esc(subject)}</span>
                  ${dashboardTaskStatusChip(task)}
                </div>
                <strong>${esc(title)}</strong>
                <p>${esc(subtitle)}</p>
                <div class="muted small" style="margin-top:8px">${esc(task.owner || 'Без owner')} · срок ${esc(task.due || '—')}</div>
                <div class="portal-exec-chip-stack">
                  ${dashboardTaskPriorityChip(task)}
                  ${dashboardTaskPlatformChip(task)}
                </div>
              </article>
            `;
      }).join('')
      : `
            <article
              class="portal-exec-card portal-exec-focus-card is-ok is-clickable"
              data-portal-open-control="1"
              data-portal-control-platform="${esc(controlPlatformKey)}"
            >
              <div class="portal-exec-card-head">
                <span class="portal-exec-card-label">Переход в задачник</span>
                ${badgeHtml('Сейчас пусто', 'ok')}
              </div>
              <strong>На выбранной площадке пока нет активных ручных задач РОПов.</strong>
              <p>Блок не сломан: в текущем срезе в контуре просто нет опубликованных ручных задач. Откройте задачник, чтобы посмотреть весь реестр и историю статусов.</p>
              <div class="portal-exec-chip-stack">
                <button type="button" class="quick-chip" data-portal-open-control="1" data-portal-control-platform="${esc(controlPlatformKey)}">Открыть задачник</button>
              </div>
            </article>
            <article class="portal-exec-card portal-exec-focus-card is-warn">
              <div class="portal-exec-card-head">
                <span class="portal-exec-card-label">Что сейчас видит блок</span>
                ${badgeHtml(selectedPlatformLabel, 'info')}
              </div>
              <strong>${esc(executive.range.requestedLabel)}</strong>
              <p>После появления ручных задач они попадут сюда автоматически и будут открываться в задачник с теми же фильтрами.</p>
              <div class="muted small" style="margin-top:8px">${esc(executive.range.availableLabel)}</div>
            </article>
        `;

    return `
      <section class="portal-exec-section is-highlight">
        <div class="portal-exec-head">
          <div class="portal-exec-copy">
            <h3>Задачи РОПов: что разобрать первым</h3>
            <p>Здесь показываем активные ручные задачи по выбранной площадке. Клик по карточке или по кнопке сверху открывает задачник с этим же контуром.</p>
          </div>
          ${sectionMetaHtml(executive, [
            badgeHtml(`${int(rows.length)} задач`, rows.length ? 'warn' : 'ok'),
            overdueCount ? badgeHtml(`${int(overdueCount)} проср.`, 'danger') : badgeHtml(`${int(ownerCount)} owner`, 'info'),
            `<button type="button" class="quick-chip" data-portal-open-control="1" data-portal-control-platform="${esc(controlPlatformKey)}">Открыть задачник</button>`
          ])}
        </div>
        <div class="portal-exec-focus-grid">
          ${cardsMarkup}
        </div>
      </section>
    `;
  };

  function renderDashboard(executive) {
    const root = document.getElementById('view-dashboard');
    if (!root) return;
    ensureStyles();
    ensureDashboardManagementStyles();
    ensureModal();
    hideLegacyDashboard(root);
    root.querySelector('[data-portal-dashboard-executive-root]')?.remove();
    const container = document.createElement('div');
    container.id = ROOT_ID;
    container.dataset.portalDashboardExecutiveRoot = 'true';
    container.innerHTML = [
      periodSection(executive, executive.metrics.some((metric) => metric.adsReady)),
      overviewSection(executive),
      renderRopTaskSection(executive),
      platformSection(executive),
      adsSection(executive),
      issuesSection(executive),
      `<div class="portal-exec-section-foot">Источник факта: ${esc(executive.range.availableLabel)} · daily bridge из Google Sheets в 09:00 МСК · актуально на ${esc(longDate(executive.range.max))}.</div>`
    ].join('');
    root.insertAdjacentElement('afterbegin', container);
    bindDashboard(root, executive);
  }

  function renderAdsFunnel(executive) {
    const root = document.getElementById(ADS_VIEW_ID);
    if (!root) return;
    ensureAdsFunnelStyles();
    ensureAdsManagementStyles();
    ensureModal();
    root.querySelector(`#${ADS_ROOT_ID}`)?.remove();
    const container = document.createElement('div');
    container.id = ADS_ROOT_ID;
    container.dataset.portalDashboardExecutiveRoot = 'true';
    container.innerHTML = [
      periodSection(executive, executive.metrics.some((metric) => metric.adsReady)),
      adsSection(executive),
      adsSignalsSection(executive),
      `<div class="portal-exec-section-foot">Источник рекламы: ads_summary из Google Sheets · ${esc(executive.range.availableLabel)} · актуально на ${esc(longDate(executive.range.max))}.</div>`
    ].join('');
    root.insertAdjacentElement('afterbegin', container);
    bindDashboard(root, executive);
  }

  function liftModalActionCard(detail) {
    if (!detail || typeof detail.body !== 'string') return detail;
    const liftedBody = detail.body.replace(
      /(<div class="portal-exec-side-stack">\s*<div class="portal-exec-modal-card">[\s\S]*?<\/table>\s*<\/div>)\s*(<div class="portal-exec-modal-card">[\s\S]*?<\/div>)\s*<\/div>\s*<\/div>/,
      '$1</div></div><div class="portal-exec-modal-actions">$2</div>'
    );
    return liftedBody === detail.body ? detail : { ...detail, body: liftedBody };
  }

  const buildCompletionDetailBase = buildCompletionDetail;
  buildCompletionDetail = function (metric, executive) {
    return liftModalActionCard(buildCompletionDetailBase(metric, executive));
  };

  const buildPriceDetailBase = buildPriceDetail;
  buildPriceDetail = function (metric, executive) {
    return liftModalActionCard(buildPriceDetailBase(metric, executive));
  };

  const buildRevenueDetailBase = buildRevenueDetail;
  buildRevenueDetail = function (metric, executive) {
    return liftModalActionCard(buildRevenueDetailBase(metric, executive));
  };

  const buildMarginDetailBase = buildMarginDetail;
  buildMarginDetail = function (metric, executive) {
    return liftModalActionCard(buildMarginDetailBase(metric, executive));
  };

  const buildStockDetailBase = buildStockDetail;
  buildStockDetail = function (platformKey, executive) {
    return liftModalActionCard(buildStockDetailBase(platformKey, executive));
  };

  function ensureDashboardTaskComposerStyles() {
    if (document.getElementById('portalDashboardTaskComposerStyles')) return;
    const style = document.createElement('style');
    style.id = 'portalDashboardTaskComposerStyles';
    style.textContent = `
      body > .portal-exec-modal .portal-exec-task-panel { margin-top: 14px; }
      body > .portal-exec-modal .portal-exec-task-panel .portal-exec-modal-card { padding: 16px; }
      body > .portal-exec-modal .portal-exec-task-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      body > .portal-exec-modal .portal-exec-task-grid label { display: grid; gap: 6px; min-width: 0; }
      body > .portal-exec-modal .portal-exec-task-grid label.wide { grid-column: 1 / -1; }
      body > .portal-exec-modal .portal-exec-task-grid span { color: rgba(245,232,207,.72); font-size: 12px; }
      body > .portal-exec-modal .portal-exec-task-grid input,
      body > .portal-exec-modal .portal-exec-task-grid select,
      body > .portal-exec-modal .portal-exec-task-grid textarea { width: 100%; min-width: 0; padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(212,164,74,.18); background: rgba(17,14,11,.96); color: #f6ead4; font: inherit; box-sizing: border-box; }
      body > .portal-exec-modal .portal-exec-task-grid textarea { min-height: 96px; resize: vertical; }
      body > .portal-exec-modal .portal-exec-task-grid input:focus,
      body > .portal-exec-modal .portal-exec-task-grid select:focus,
      body > .portal-exec-modal .portal-exec-task-grid textarea:focus { outline: none; border-color: rgba(236,203,123,.88); box-shadow: 0 0 0 3px rgba(212,164,74,.12); }
      body > .portal-exec-modal .portal-exec-task-actions { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
      body > .portal-exec-modal .portal-exec-task-actions .portal-exec-chip-stack { display: flex; gap: 8px; flex-wrap: wrap; }
      body > .portal-exec-modal .portal-exec-task-status { color: rgba(245,232,207,.68); font-size: 12px; }
      body > .portal-exec-modal .portal-exec-task-status.is-success { color: #9fdfab; }
      body > .portal-exec-modal .portal-exec-task-status.is-error { color: #ff9a8a; }
      body > .portal-exec-modal .portal-exec-issue-row .quick-chip { margin-top: 10px; }
      @media (max-width: 900px) { body > .portal-exec-modal .portal-exec-task-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 720px) { body > .portal-exec-modal .portal-exec-task-grid { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  const DASHBOARD_MODAL_TASK_PRIORITY_META = {
    low: 'Низкий',
    medium: 'Средний',
    high: 'Высокий',
    critical: 'Критично'
  };

  function normalizeDashboardModalTaskRow(detail, row) {
    const articleKey = String(row?.articleKey || row?.article || '').trim();
    if (!articleKey) return null;
    const sku = typeof getSku === 'function' ? getSku(articleKey) : null;
    const owner = row?.owner || (typeof ownerName === 'function' ? ownerName(sku) : '') || '';
    const detailLabel = detail?.taskPreset?.label || detail?.title || 'разбор SKU';
    const platformKey = row?.platformKey || detail?.taskPreset?.platformKey || '';
    let priority = row?.priority || detail?.taskPreset?.priority || 'high';
    if ((!row?.priority && typeof row?.score === 'number')) priority = row.score >= 7 ? 'critical' : row.score >= 4 ? 'high' : 'medium';
    if (!row?.priority && typeof row?.marginPct === 'number' && row.marginPct < 0) priority = 'critical';
    const title = String(row?.taskTitle || '').trim() || `Разобрать ${articleKey}`;
    const nextAction = String(row?.nextAction || row?.reasons || detail?.taskPreset?.nextAction || '').trim()
      || `Проверить SKU ${articleKey} в окне «${detailLabel}», согласовать решение и зафиксировать следующий шаг.`;
    return {
      articleKey,
      label: `${articleKey}${row?.name ? ` · ${row.name}` : sku?.name ? ` · ${sku.name}` : ''}`,
      owner,
      platformKey,
      priority,
      title,
      nextAction
    };
  }

  function dashboardModalTaskOptions(detail) {
    const raw = Array.isArray(detail?.taskRows) ? detail.taskRows : [];
    const seen = new Set();
    return raw.map((row) => normalizeDashboardModalTaskRow(detail, row)).filter((row) => {
      if (!row || seen.has(row.articleKey)) return false;
      seen.add(row.articleKey);
      return true;
    });
  }

  function renderDashboardModalTaskPanel(detail) {
    const rows = dashboardModalTaskOptions(detail);
    if (!rows.length) return '';
    const first = rows[0];
    const owners = typeof ownerOptions === 'function' ? ownerOptions() : [];
    return `
      <section class="portal-exec-task-panel">
        <div class="portal-exec-modal-card">
          <div class="portal-exec-modal-copy">
            <strong>Поставить задачу из этого окна</strong>
            <p>Выберите артикул, заполните что сделать, назначьте owner и срок. Задача сразу появится во вкладке «Задачи».</p>
          </div>
          <form data-portal-task-form="1">
            <div class="portal-exec-task-grid">
              <label>
                <span>SKU</span>
                <select name="articleKey">
                  ${rows.map((row) => `<option value="${esc(row.articleKey)}">${esc(row.label)}</option>`).join('')}
                </select>
              </label>
              <label>
                <span>Owner</span>
                <input name="owner" list="portalExecModalOwners" value="${esc(first.owner || '')}" placeholder="Кто отвечает">
              </label>
              <label>
                <span>Срок</span>
                <input type="date" name="due" value="${esc(typeof plusDays === 'function' ? plusDays(3) : '')}">
              </label>
              <label>
                <span>Приоритет</span>
                <select name="priority">
                  ${Object.entries(DASHBOARD_MODAL_TASK_PRIORITY_META).map(([key, label]) => `<option value="${key}" ${first.priority === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}
                </select>
              </label>
              <label class="wide">
                <span>Что за задача</span>
                <input name="title" value="${esc(first.title)}" placeholder="Например: Разобрать цену по SKU">
              </label>
              <label class="wide">
                <span>Что сделать / комментарий</span>
                <textarea name="nextAction" placeholder="Какой следующий шаг нужен по позиции">${esc(first.nextAction)}</textarea>
              </label>
            </div>
            <div class="portal-exec-task-actions">
              <div class="portal-exec-chip-stack">
                <button type="submit" class="btn">Поставить задачу</button>
                <button type="button" class="btn ghost" data-portal-task-open-control="1">Открыть задачник</button>
              </div>
              <div class="portal-exec-task-status" data-portal-task-status>После создания задача появится во вкладке «Задачи».</div>
            </div>
            <datalist id="portalExecModalOwners">${owners.map((name) => `<option value="${esc(name)}"></option>`).join('')}</datalist>
          </form>
        </div>
      </section>
    `;
  }

  function bindDashboardModalTaskPanel(modal, detail) {
    const form = modal.querySelector('[data-portal-task-form]');
    if (!form) return;
    const rows = dashboardModalTaskOptions(detail);
    if (!rows.length) return;
    const statusNode = form.querySelector('[data-portal-task-status]');
    const rowMap = new Map(rows.map((row) => [row.articleKey, row]));

    const syncSelected = (articleKey) => {
      const row = rowMap.get(articleKey);
      if (!row) return;
      form.elements.owner.value = row.owner || '';
      form.elements.title.value = row.title || '';
      form.elements.nextAction.value = row.nextAction || '';
      form.elements.priority.value = row.priority || 'high';
    };

    form.elements.articleKey?.addEventListener('change', (event) => syncSelected(event.target.value));
    modal.querySelectorAll('[data-portal-task-pick]').forEach((button) => {
      button.addEventListener('click', () => {
        const articleKey = button.dataset.portalTaskPick;
        if (!articleKey || !rowMap.has(articleKey)) return;
        form.elements.articleKey.value = articleKey;
        syncSelected(articleKey);
        form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
    form.querySelector('[data-portal-task-open-control]')?.addEventListener('click', () => {
      const row = rowMap.get(form.elements.articleKey.value);
      openControlViewFromDashboard(row?.platformKey || detail?.taskPreset?.platformKey || 'all');
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const articleKey = String(form.elements.articleKey.value || '').trim();
      const title = String(form.elements.title.value || '').trim();
      const nextAction = String(form.elements.nextAction.value || '').trim();
      if (!articleKey || !title || !nextAction) {
        if (statusNode) {
          statusNode.className = 'portal-exec-task-status is-error';
          statusNode.textContent = 'Заполните артикул, название задачи и следующий шаг.';
        }
        return;
      }
      const row = rowMap.get(articleKey);
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      try {
        await createManualTask({
          articleKey,
          title,
          nextAction,
          owner: form.elements.owner.value,
          due: form.elements.due.value,
          priority: form.elements.priority.value,
          type: 'price_margin',
          platform: row?.platformKey || ''
        });
        if (typeof updateSyncBadge === 'function') updateSyncBadge();
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
        if (statusNode) {
          statusNode.className = 'portal-exec-task-status is-success';
          statusNode.textContent = `Задача по ${articleKey} создана.`;
        }
      } catch (error) {
        console.error(error);
        if (statusNode) {
          statusNode.className = 'portal-exec-task-status is-error';
          statusNode.textContent = 'Не удалось создать задачу. Попробуйте ещё раз.';
        }
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  function withDashboardModalTasks(detail) {
    if (!detail || detail.__dashboardTaskPanelApplied) return detail;
    const panel = renderDashboardModalTaskPanel(detail);
    if (!panel) return detail;
    return {
      ...detail,
      __dashboardTaskPanelApplied: true,
      body: `${detail.body || ''}${panel}`
    };
  }

  const renderIssueRowBase = renderIssueRow;
  renderIssueRow = function (row) {
    const html = renderIssueRowBase(row);
    const articleKey = String(row?.articleKey || row?.article || '').trim();
    if (!articleKey || /data-portal-task-pick=/.test(html)) return html;
    return html.replace(
      /<\/p>\s*<\/div>\s*$/,
      `</p><button type="button" class="quick-chip" data-portal-task-pick="${esc(articleKey)}">Поставить задачу</button></div>`
    );
  };

  const openModalBase = openModal;
  openModal = function (detail) {
    ensureDashboardTaskComposerStyles();
    const enhanced = withDashboardModalTasks(detail);
    openModalBase(enhanced);
    bindDashboardModalTaskPanel(ensureModal(), enhanced);
  };

  const buildPlatformDetailWithTasksBase = buildPlatformDetail;
  buildPlatformDetail = function (metric, executive, mode) {
    const detail = buildPlatformDetailWithTasksBase(metric, executive, mode);
    const taskRows = Array.isArray(metric?.issues?.rows)
      ? metric.issues.rows.slice(0, 12).map((row) => ({ ...row, articleKey: row.article, platformKey: metric?.key || 'all' }))
      : [];
    return {
      ...detail,
      taskRows,
      taskPreset: {
        label: detail?.title || `${metric?.label || 'Площадка'} · риски периода`,
        priority: mode === 'issues' ? 'critical' : 'high',
        platformKey: metric?.key || 'all'
      }
    };
  };

  const buildCompletionDetailWithTasksBase = buildCompletionDetail;
  buildCompletionDetail = function (metric, executive) {
    const detail = buildCompletionDetailWithTasksBase(metric, executive);
    const taskRows = articleRowsForPlatform(metric.key, executive.range)
      .sort((left, right) => num(left.completionPct) - num(right.completionPct) || num(right.planUnitsSelected) - num(left.planUnitsSelected) || num(right.salesValue) - num(left.salesValue))
      .slice(0, 18);
    return { ...detail, taskRows, taskPreset: { label: detail?.title || `${metric.label} · план-факт`, priority: 'high', platformKey: metric.key || 'all' } };
  };

  const buildPriceDetailWithTasksBase = buildPriceDetail;
  buildPriceDetail = function (metric, executive) {
    const detail = buildPriceDetailWithTasksBase(metric, executive);
    const taskRows = articleRowsForPlatform(metric.key, executive.range)
      .map((row) => ({ ...row, deltaPct: row.startPrice > 0 && row.endPrice > 0 ? (row.endPrice - row.startPrice) / row.startPrice : null }))
      .sort((left, right) => Math.abs(num(right.deltaPct)) - Math.abs(num(left.deltaPct)) || num(right.avgPrice) - num(left.avgPrice))
      .slice(0, 18);
    return { ...detail, taskRows, taskPreset: { label: detail?.title || `${metric.label} · цена`, priority: 'high', platformKey: metric.key || 'all' } };
  };

  const buildRevenueDetailWithTasksBase = buildRevenueDetail;
  buildRevenueDetail = function (metric, executive) {
    const detail = buildRevenueDetailWithTasksBase(metric, executive);
    const taskRows = articleRowsForPlatform(metric.key, executive.range)
      .sort((left, right) => num(right.salesValue) - num(left.salesValue) || num(right.actualUnitsSelected) - num(left.actualUnitsSelected))
      .slice(0, 18);
    return { ...detail, taskRows, taskPreset: { label: detail?.title || `${metric.label} · оборот`, priority: 'high', platformKey: metric.key || 'all' } };
  };

  const buildMarginDetailWithTasksBase = buildMarginDetail;
  buildMarginDetail = function (metric, executive) {
    const detail = buildMarginDetailWithTasksBase(metric, executive);
    const taskRows = marginRowsForPlatform(metric.key)
      .sort((left, right) => left.marginPct - right.marginPct || right.stock - left.stock)
      .slice(0, 18);
    return { ...detail, taskRows, taskPreset: { label: detail?.title || `${metric.label} · маржа`, priority: 'critical', platformKey: metric.key || 'all' } };
  };

  const buildStockDetailWithTasksBase = buildStockDetail;
  buildStockDetail = function (platformKey, executive) {
    const detail = buildStockDetailWithTasksBase(platformKey, executive);
    const taskRows = articleRowsForPlatform(platformKey, executive.range)
      .sort((left, right) => num(right.avgTurnoverDays) - num(left.avgTurnoverDays) || right.stock - left.stock)
      .slice(0, 18);
    return { ...detail, taskRows, taskPreset: { label: detail?.title || 'оборачиваемость и запас', priority: 'high', platformKey: platformKey || 'all' } };
  };

  function bridge(name) {
    if (typeof window[name] !== 'function' || window[name].__dashboardInteractiveWrapped) return;
    const original = window[name];
    const wrapped = function () {
      const result = original.apply(this, arguments);
      const onDashboard = typeof state !== 'object' || !state || state.activeView === 'dashboard' || state.activeView === 'ads-funnel';
      if (onDashboard) scheduleApply(90);
      return result;
    };
    wrapped.__dashboardInteractiveWrapped = true;
    window[name] = wrapped;
  }

  async function loadJson(key, path, required, forceRefresh = false) {
    const existing = current(key);
    const hasUsablePayload = (payload) => {
      if (!payload || typeof payload !== 'object') return false;
      if (key === 'prices') {
        const platforms = payload.platforms && typeof payload.platforms === 'object' ? Object.keys(payload.platforms) : [];
        return Boolean(payload.generatedAt) || platforms.length > 0;
      }
      if (key === 'smartPriceWorkbench' || key === 'smartPriceOverlay') {
        const platforms = payload.platforms && typeof payload.platforms === 'object' ? Object.keys(payload.platforms) : [];
        return Boolean(payload.generatedAt) || platforms.length > 0;
      }
      if (key === 'priceWorkbenchSupport') {
        const platforms = payload.platforms && typeof payload.platforms === 'object' ? Object.keys(payload.platforms) : [];
        return platforms.length > 0;
      }
      return true;
    };
    if (!forceRefresh && hasUsablePayload(existing)) return existing;
    const snapshotLoader = typeof window.__alteaLoadPortalSnapshot === 'function'
      ? window.__alteaLoadPortalSnapshot
      : null;
    if (snapshotLoader) {
      try {
        const snapshotPayload = await snapshotLoader(path);
        if (hasUsablePayload(snapshotPayload)) {
          cache[key] = snapshotPayload;
          const app = stateRef();
          if (app) app[key] = snapshotPayload;
          return snapshotPayload;
        }
      } catch (error) {
        console.warn(`[portal-dashboard-interactive] snapshot ${path}`, error);
      }
    }
    let response = null;
    try {
      response = await fetch(`${path}?v=${VERSION}`, { cache: 'no-store' });
    } catch (error) {
      if (hasUsablePayload(existing)) return existing;
      if (required) throw error;
      return null;
    }
    if (!response.ok) {
      if (hasUsablePayload(existing)) return existing;
      if (required) throw new Error(`Failed to load ${path}`);
      return null;
    }
    let text = await response.text();
    if (typeof sanitizeLooseJson === 'function') text = sanitizeLooseJson(text);
    const payload = JSON.parse(text);
    cache[key] = payload;
    const app = stateRef();
    if (app && !app[key]) app[key] = payload;
    return payload;
  }

  async function refreshData(forceRefresh = false) {
    const [
      dashboard,
      platformTrends,
      platformPlan,
      adsSummary,
      skus,
      prices,
      productLeaderboard,
      smartPriceWorkbench,
      smartPriceWorkbenchLive,
      smartPriceOverlay,
      priceWorkbenchSupport,
      orderProcurement
    ] = await Promise.all([
      loadJson('dashboard', 'data/dashboard.json', true, forceRefresh),
      loadJson('platformTrends', 'data/platform_trends.json', true, forceRefresh),
      loadJson('platformPlan', 'data/platform_plan.json', false, forceRefresh),
      loadJson('adsSummary', 'data/ads_summary.json', false, forceRefresh),
      loadJson('skus', 'data/skus.json', true, forceRefresh),
      loadJson('prices', 'data/prices.json', false, forceRefresh),
      loadJson('productLeaderboard', 'data/product_leaderboard.json', false, forceRefresh),
      loadJson('smartPriceWorkbench', 'data/smart_price_workbench.json', false, forceRefresh),
      loadJson('smartPriceWorkbenchLive', 'tmp-smart_price_workbench-live.json', false, forceRefresh),
      loadJson('smartPriceOverlay', 'data/smart_price_overlay.json', false, forceRefresh),
      loadJson('priceWorkbenchSupport', 'data/price_workbench_support.compact.json', false, forceRefresh),
      loadJson('orderProcurement', 'data/order_procurement.json', false, forceRefresh)
    ]);

    const mergeWorkbenchPayload = typeof window.mergeSmartWorkbenchPayload === 'function'
      ? window.mergeSmartWorkbenchPayload
      : null;
    const mergeWorkbenchOverlay = typeof window.mergeSmartWorkbenchPriceOverlay === 'function'
      ? window.mergeSmartWorkbenchPriceOverlay
      : null;
    const baseWorkbench = mergeWorkbenchPayload
      ? mergeWorkbenchPayload(
          smartPriceWorkbench || { generatedAt: '', platforms: {} },
          smartPriceWorkbenchLive || null
        )
      : (smartPriceWorkbench || { generatedAt: '', platforms: {} });
    const mergedWorkbench = mergeWorkbenchOverlay
      ? mergeWorkbenchOverlay(baseWorkbench, smartPriceOverlay || null)
      : baseWorkbench;
    const normalizedProductLeaderboard = typeof normalizeProductLeaderboardPayload === 'function'
      ? normalizeProductLeaderboardPayload(productLeaderboard || { generatedAt: '', items: [], summary: {} })
      : (productLeaderboard || { generatedAt: '', items: [], summary: {} });

    cache.dashboard = dashboard;
    cache.platformTrends = platformTrends;
    cache.platformPlan = platformPlan;
    cache.adsSummary = adsSummary;
    cache.skus = skus;
    cache.prices = prices;
    cache.pricesFetched = prices;
    cache.productLeaderboard = normalizedProductLeaderboard;
    cache.smartPriceWorkbenchBase = smartPriceWorkbench;
    cache.smartPriceWorkbench = mergedWorkbench;
    cache.smartPriceWorkbenchLive = smartPriceWorkbenchLive;
    cache.smartPriceOverlay = smartPriceOverlay;
    cache.priceWorkbenchSupport = priceWorkbenchSupport;
    cache.orderProcurement = orderProcurement;

    const app = stateRef();
    if (app) {
      app.prices = prices;
      app.productLeaderboard = normalizedProductLeaderboard;
      app.smartPriceWorkbenchBase = smartPriceWorkbench;
      app.smartPriceWorkbench = mergedWorkbench;
      app.smartPriceWorkbenchLive = smartPriceWorkbenchLive;
      app.smartPriceOverlay = smartPriceOverlay;
    }
  }

  function apply() {
    const dashboardRoot = document.getElementById(DASHBOARD_VIEW_ID);
    const adsRoot = document.getElementById(ADS_VIEW_ID);
    if (!dashboardRoot && !adsRoot) return;
    syncChrome();
    const executive = buildPlatformMetrics();
    if (dashboardRoot) renderDashboard(executive);
    if (adsRoot) renderAdsFunnel(executive);
  }

  function isDashboardActive() {
    const app = stateRef();
    const dashboardRoot = document.getElementById(DASHBOARD_VIEW_ID);
    const adsRoot = document.getElementById(ADS_VIEW_ID);
    return app?.activeView === 'dashboard'
      || app?.activeView === 'ads-funnel'
      || Boolean(dashboardRoot?.classList.contains('active'))
      || Boolean(adsRoot?.classList.contains('active'));
  }

  function activeInteractiveRootReady() {
    const app = stateRef();
    const activeView = app?.activeView === 'ads-funnel' || document.getElementById(ADS_VIEW_ID)?.classList.contains('active')
      ? 'ads-funnel'
      : 'dashboard';
    return activeView === 'ads-funnel'
      ? Boolean(document.getElementById(ADS_ROOT_ID))
      : Boolean(document.getElementById(ROOT_ID));
  }

  function scheduleApply(delay = 0, forceRefresh = false) {
    window.clearTimeout(applyTimer);
    applyTimer = window.setTimeout(() => {
      if (!forceRefresh && !isDashboardActive()) return;
      refreshData(forceRefresh)
        .then(apply)
        .catch((error) => console.warn('[portal-dashboard-interactive]', error));
    }, delay);
  }

  function bindLiveTriggers() {
    document.querySelectorAll('.nav-btn[data-view="dashboard"], .nav-btn[data-view="ads-funnel"]').forEach((button) => {
      if (button.dataset.portalExecBound) return;
      button.dataset.portalExecBound = '1';
      button.addEventListener('click', () => scheduleApply(80));
    });
    document.getElementById('pullRemoteBtn')?.addEventListener('click', () => scheduleApply(240, true));
  }

  function primeDashboard(forceRefresh = false) {
    if (!forceRefresh && dashboardBootPrimed) return;
    if (!forceRefresh && !isDashboardActive()) return;
    dashboardBootPrimed = true;
    scheduleApply(forceRefresh ? 240 : 140, forceRefresh);
  }

  function rearmBridges() {
    bridge('rerenderCurrentView');
    bridge('renderDashboard');
    bridge('renderAdsFunnelView');
  }

  function exposeDashboardApi() {
    window.__ALTEA_DASHBOARD_INTERACTIVE_API__ = {
      version: VERSION,
      hasRoot: () => Boolean(document.getElementById(ROOT_ID)),
      isActive: isDashboardActive,
      prime(forceRefresh = false) {
        primeDashboard(forceRefresh);
      },
      schedule(delay = 0, forceRefresh = false) {
        scheduleApply(delay, forceRefresh);
      },
      applyNow(forceRefresh = false) {
        if (forceRefresh) dashboardBootPrimed = true;
        return refreshData(forceRefresh).then(apply);
      },
      renderAdsFunnel(forceRefresh = false) {
        if (forceRefresh) dashboardBootPrimed = true;
        return refreshData(forceRefresh).then(() => {
          const executive = buildPlatformMetrics();
          renderAdsFunnel(executive);
          return executive;
        });
      },
      getSignalSnapshot(platformKey = '') {
        const range = selectedRange();
        const compare = comparisonRange(range);
        const issueMap = buildIssueMap(range, compare);
        if (platformKey) {
          const metric = issueMap.get(platformKey) || null;
          return metric ? { ...metric, rows: Array.isArray(metric.rows) ? metric.rows.map((row) => ({ ...row })) : [] } : null;
        }
        return {
          version: VERSION,
          range: {
            requestedLabel: range.requestedLabel,
            effectiveLabel: range.effectiveLabel,
            effectiveStart: iso(range.effectiveStart),
            effectiveEnd: iso(range.effectiveEnd),
            availableLabel: range.availableLabel
          },
          compareRange: compare ? {
            label: compare.label,
            effectiveStart: iso(compare.effectiveStart),
            effectiveEnd: iso(compare.effectiveEnd)
          } : null,
          platforms: PLATFORM_KEYS
            .map((key) => issueMap.get(key))
            .filter(Boolean)
            .map((metric) => ({
              ...metric,
              counters: { ...(metric.counters || {}) },
              rows: Array.isArray(metric.rows) ? metric.rows.map((row) => ({ ...row })) : []
            }))
        };
      },
      getSignalRows(platformKey = 'all') {
        const metric = this.getSignalSnapshot(platformKey);
        return Array.isArray(metric?.rows) ? metric.rows.map((row) => ({ ...row })) : [];
      }
    };
    window.renderAdsFunnelView = function renderAdsFunnelView(forceRefresh = false) {
      return window.__ALTEA_DASHBOARD_INTERACTIVE_API__?.renderAdsFunnel(forceRefresh);
    };
  }

  function ensureInteractiveDashboardBoot(forceRefresh = false) {
    rearmBridges();
    if (!isDashboardActive()) return;
    if (!forceRefresh && activeInteractiveRootReady()) return;
    if (forceRefresh) {
      dashboardBootPrimed = true;
      scheduleApply(80, true);
      return;
    }
    primeDashboard(false);
  }

  rearmBridges();
  exposeDashboardApi();
  bindLiveTriggers();
  syncChrome();
  ensureInteractiveDashboardBoot(false);
  window.setTimeout(() => ensureInteractiveDashboardBoot(false), 30);
  window.setTimeout(() => ensureInteractiveDashboardBoot(true), 320);
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => ensureInteractiveDashboardBoot(true), { once: true });
  }
  window.addEventListener('altea:viewchange', (event) => {
    if (event.detail?.view === 'dashboard' || event.detail?.view === 'ads-funnel') primeDashboard(false);
  });
})();
