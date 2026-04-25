(function () {
  if (window.__ALTEA_ORDER_LOGISTICS_HOTFIX_20260425A__) return;
  window.__ALTEA_ORDER_LOGISTICS_HOTFIX_20260425A__ = true;

  const VERSION = '20260425a';
  const STYLE_ID = 'altea-order-logistics-hotfix-20260425a';
  const cache = {
    logistics: null,
    warehouse: null
  };

  function ensureState() {
    if (typeof state !== 'object' || !state) return { platform: 'wb', days: 30 };
    state.orderProcurement = state.orderProcurement || {};
    if (!state.orderProcurement.platform) state.orderProcurement.platform = 'wb';
    if (!state.orderProcurement.days) state.orderProcurement.days = 30;
    return state.orderProcurement;
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function clamp(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function escape(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtInt(value) {
    if (typeof fmt === 'object' && fmt && typeof fmt.int === 'function') return fmt.int(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(toNumber(value)));
  }

  function fmtNum(value, digits) {
    if (typeof fmt === 'object' && fmt && typeof fmt.num === 'function') return fmt.num(value, digits);
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(toNumber(value));
  }

  function badgeHtml(text, tone) {
    if (typeof badge === 'function') return badge(text, tone || '');
    return `<span class="quick-chip ${tone ? `is-${tone}` : ''}">${escape(text)}</span>`;
  }

  function turnoverBadge(days) {
    if (days === null || days === undefined || !Number.isFinite(Number(days))) return badgeHtml('n/a', 'info');
    const value = Number(days);
    if (value < 7) return badgeHtml(`${fmtNum(value, 1)} РґРЅ.`, 'danger');
    if (value < 14) return badgeHtml(`${fmtNum(value, 1)} РґРЅ.`, 'warn');
    return badgeHtml(`${fmtNum(value, 1)} РґРЅ.`, 'ok');
  }

  function uniq(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function normalizeArticleKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_-]+/gu, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function parseFreshStamp(value) {
    if (!value) return 0;
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const normalized = /^\d{4}-\d{2}$/.test(raw)
      ? `${raw}-01T00:00:00Z`
      : /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T00:00:00Z`
        : raw;
    const stamp = Date.parse(normalized);
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function freshnessOfPayload(payload) {
    if (!payload || typeof payload !== 'object') return 0;
    return Math.max(
      parseFreshStamp(payload.generatedAt),
      parseFreshStamp(payload.updatedAt),
      parseFreshStamp(payload.updated_at),
      parseFreshStamp(payload.asOfDate)
    );
  }

  function chooseFreshestPayload(snapshotPayload, localPayload) {
    if (snapshotPayload && localPayload) {
      return freshnessOfPayload(localPayload) >= freshnessOfPayload(snapshotPayload)
        ? localPayload
        : snapshotPayload;
    }
    return localPayload || snapshotPayload || null;
  }

  function resetCache() {
    cache.logistics = null;
    cache.warehouse = null;
  }

  async function fetchLocalJson(path) {
    const resolved = path.includes('?') ? path : `${path}?v=${VERSION}`;
    const response = await fetch(resolved, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    const raw = await response.text();
    return typeof sanitizeLooseJson === 'function' ? JSON.parse(sanitizeLooseJson(raw)) : JSON.parse(raw);
  }

  async function loadJson(path, key, force) {
    if (!force && cache[key]) return cache[key];

    let snapshotPayload = null;
    if (typeof window.__alteaLoadPortalSnapshot === 'function') {
      try {
        snapshotPayload = await window.__alteaLoadPortalSnapshot(path, { force: Boolean(force) });
      } catch (error) {
        console.warn('[order-logistics-hotfix] snapshot', path, error);
      }
    }

    let localPayload = null;
    try {
      localPayload = await fetchLocalJson(path);
    } catch (error) {
      if (!snapshotPayload) throw error;
      console.warn('[order-logistics-hotfix] local', path, error);
    }

    const chosen = chooseFreshestPayload(snapshotPayload, localPayload);
    if (!chosen) throw new Error(`Failed to load ${path}`);

    cache[key] = chosen;
    return chosen;
  }

  async function ensureSources(force) {
    await Promise.all([
      loadJson('data/logistics.json', 'logistics', force),
      loadJson('data/warehouse_stock_overlay.json', 'warehouse', force).catch(() => ({ rows: [] }))
    ]);
  }

  function buildSkuLookup() {
    const rows = Array.isArray(state?.skus) ? state.skus : [];
    const lookup = new Map();
    rows.forEach((row) => {
      const byArticle = normalizeArticleKey(row?.article);
      const byKey = normalizeArticleKey(row?.articleKey);
      if (byArticle && !lookup.has(byArticle)) lookup.set(byArticle, row);
      if (byKey && !lookup.has(byKey)) lookup.set(byKey, row);
    });
    return lookup;
  }

  function buildWarehouseSupportMap() {
    const rows = Array.isArray(cache.warehouse?.rows) ? cache.warehouse.rows : [];
    const supportMap = new Map();
    rows.forEach((row) => {
      const key = normalizeArticleKey(row?.articleKey || row?.article || row?.sku || '');
      if (!key) return;
      supportMap.set(key, {
        stockWarehouse: toNumber(row?.stockWarehouse),
        inboundWarehouse: toNumber(row?.inboundWarehouse),
        accepted: toNumber(row?.accepted),
        shippedOzon: toNumber(row?.shippedOzon),
        shippedWB: toNumber(row?.shippedWB)
      });
    });
    return supportMap;
  }

  function getOrdersForPeriod(row, targetDays) {
    const exact = toNumber(row?.[`sales${targetDays}`]);
    if (exact > 0) return Math.ceil(exact);
    const avgDaily = toNumber(row?.avgDaily ?? row?.avgDailyUnits28 ?? row?.avgDailyUnits);
    return Math.ceil(Math.max(0, avgDaily * targetDays));
  }

  function getClusterNeedForTarget(row, targetDays) {
    const exactNeed = toNumber(row?.[`targetNeed${targetDays}`]);
    if (exactNeed > 0) return Math.ceil(exactNeed);
    const demand = getOrdersForPeriod(row, targetDays);
    const stock = toNumber(row?.inStock ?? row?.available ?? row?.stock);
    const transit = toNumber(row?.inTransit) + toNumber(row?.inRequest);
    return Math.max(0, Math.ceil(demand - stock - transit));
  }

  function platformLabel(platform) {
    return platform === 'ozon' ? 'OZ' : 'WB';
  }

  function buildModel() {
    const orderState = ensureState();
    const platform = orderState.platform === 'ozon' ? 'ozon' : 'wb';
    const targetDays = clamp(orderState.days, 1, 180, 30);
    const data = cache.logistics || {};
    const sourceRows = (data.allRows || []).filter((row) => String(row?.platform || '').trim().toLowerCase() === platform);
    const skuLookup = buildSkuLookup();
    const warehouseSupport = buildWarehouseSupportMap();
    const platformPlaces = platform === 'ozon'
      ? (data.ozonClusters || []).map((row) => String(row?.name || '').trim()).filter(Boolean)
      : (data.wbWarehouses || []).map((row) => String(row?.name || '').trim()).filter(Boolean);
    const discoveredPlaces = sourceRows.map((row) => String(row?.place || '').trim()).filter(Boolean);
    const placeNames = uniq([...platformPlaces, ...discoveredPlaces]);
    const rowMap = new Map();

    sourceRows.forEach((row) => {
      const article = String(row?.article || '').trim();
      const articleKey = normalizeArticleKey(article);
      if (!articleKey) return;

      const sku = skuLookup.get(articleKey) || {};
      const support = warehouseSupport.get(articleKey) || {};
      const place = String(row?.place || '').trim();
      const entry = rowMap.get(articleKey) || {
        articleKey,
        article,
        name: sku?.name || row?.name || article,
        owner: sku?.owner?.name || row?.owner || '',
        warehouseStock: toNumber(support.stockWarehouse),
        inboundWarehouse: toNumber(support.inboundWarehouse),
        totalNeed: 0,
        totalOrders: 0,
        clusters: {}
      };

      const orders = getOrdersForPeriod(row, targetDays);
      const need = getClusterNeedForTarget(row, targetDays);
      entry.totalNeed += need;
      entry.totalOrders += orders;
      entry.clusters[place] = {
        mpStock: toNumber(row?.inStock ?? row?.available ?? row?.stock),
        orders,
        turnover: row?.turnoverDays == null ? null : toNumber(row.turnoverDays),
        need
      };

      rowMap.set(articleKey, entry);
    });

    const rows = [...rowMap.values()].sort((left, right) => {
      if (right.totalNeed !== left.totalNeed) return right.totalNeed - left.totalNeed;
      if (right.totalOrders !== left.totalOrders) return right.totalOrders - left.totalOrders;
      return String(left.article).localeCompare(String(right.article), 'ru');
    });

    const totals = rows.reduce((acc, row) => {
      acc.warehouseStock += toNumber(row.warehouseStock);
      acc.inboundWarehouse += toNumber(row.inboundWarehouse);
      acc.totalNeed += toNumber(row.totalNeed);
      return acc;
    }, { warehouseStock: 0, inboundWarehouse: 0, totalNeed: 0 });

    return {
      platform,
      platformLabel: platformLabel(platform),
      targetDays,
      placeNames,
      rows,
      totals,
      generatedAt: data.generatedAt || null,
      warehouseOverlayReady: Array.isArray(cache.warehouse?.rows) && cache.warehouse.rows.length > 0
    };
  }

  function exportCell(value) {
    return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
  }

  function downloadExport(model) {
    const headers = ['SKU / РЅРѕРјРµРЅРєР»Р°С‚СѓСЂР°', 'РђСЂС‚РёРєСѓР»', 'РћСЃС‚Р°С‚РѕРє РјРѕР№ СЃРєР»Р°Рґ', 'Р’ РїСѓС‚Рё РЅР° СЃРєР»Р°Рґ', 'РС‚РѕРіРѕ Рє Р·Р°РєР°Р·Сѓ'];
    model.placeNames.forEach((name) => {
      headers.push(`${name} В· РћСЃС‚Р°С‚РѕРє MP`, `${name} В· Р—Р°РєР°Р·С‹`, `${name} В· РћР±РѕСЂР°С‡РёРІР°РµРјРѕСЃС‚СЊ`, `${name} В· Р РµРє. Рє Р·Р°РєР°Р·Сѓ`);
    });

    const lines = [headers.map(exportCell).join(';')];
    model.rows.forEach((row) => {
      const cells = [row.name || row.articleKey || row.article, row.article, row.warehouseStock, row.inboundWarehouse, row.totalNeed];
      model.placeNames.forEach((place) => {
        const cluster = row.clusters[place] || {};
        cells.push(cluster.mpStock ?? 0, cluster.orders ?? 0, cluster.turnover == null ? '' : Number(cluster.turnover).toFixed(1), cluster.need ?? 0);
      });
      lines.push(cells.map(exportCell).join(';'));
    });

    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `zakaz-tovara-${model.platform}-${model.targetDays}d-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderTable(model) {
    const headerGroups = model.placeNames.map((place) => `<th class="altea-order-logistics__group" colspan="4">${escape(place)}</th>`).join('');
    const headerMetrics = model.placeNames.map(() => '<th>РћСЃС‚Р°С‚РѕРє MP</th><th>Р—Р°РєР°Р·С‹</th><th>РћР±РѕСЂР°С‡РёРІР°РµРјРѕСЃС‚СЊ</th><th>Р РµРє. Рє Р·Р°РєР°Р·Сѓ</th>').join('');

    const body = model.rows.length
      ? model.rows.map((row) => {
          const clusterCells = model.placeNames.map((place) => {
            const cluster = row.clusters[place] || {};
            const needTone = toNumber(cluster.need) > 0 ? 'warn' : 'ok';
            return `
              <td class="altea-order-logistics__num">${fmtInt(cluster.mpStock)}</td>
              <td class="altea-order-logistics__num">${fmtInt(cluster.orders)}</td>
              <td>${turnoverBadge(cluster.turnover)}</td>
              <td>${badgeHtml(fmtInt(cluster.need), needTone)}</td>
            `;
          }).join('');
          return `
            <tr>
              <td class="altea-order-logistics__sku">
                <strong>${escape(row.name || row.article)}</strong>
                <div class="altea-order-logistics__meta">${escape(row.articleKey || row.article)} В· ${escape(row.owner || 'Р‘РµР· owner')}</div>
              </td>
              <td>${typeof linkToSku === 'function' ? linkToSku(row.article, row.article) : escape(row.article)}</td>
              <td class="altea-order-logistics__num">${fmtInt(row.warehouseStock)}</td>
              <td class="altea-order-logistics__num">${fmtInt(row.inboundWarehouse)}</td>
              <td>${badgeHtml(fmtInt(row.totalNeed), row.totalNeed > 0 ? 'warn' : 'ok')}</td>
              ${clusterCells}
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="${5 + model.placeNames.length * 4}" class="altea-order-logistics__empty">РќРµС‚ SKU РїРѕ РІС‹Р±СЂР°РЅРЅРѕР№ РїР»РѕС‰Р°РґРєРµ Рё РґРѕСЃС‚СѓРїРЅС‹Рј РєР»Р°СЃС‚РµСЂРЅС‹Рј РґР°РЅРЅС‹Рј.</td></tr>`;

    return `
      <div class="altea-order-logistics__table-wrap imperial-table-wrap">
        <table class="altea-order-logistics__table">
          <thead>
            <tr>
              <th rowspan="2">SKU</th>
              <th rowspan="2">РђСЂС‚РёРєСѓР»</th>
              <th rowspan="2">РћСЃС‚Р°С‚РѕРє РјРѕР№ СЃРєР»Р°Рґ</th>
              <th rowspan="2">Р’ РїСѓС‚Рё РЅР° СЃРєР»Р°Рґ</th>
              <th rowspan="2">РС‚РѕРіРѕ Рє Р·Р°РєР°Р·Сѓ</th>
              ${headerGroups}
            </tr>
            <tr>${headerMetrics}</tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function render(model) {
    const periodNote = model.generatedAt && typeof fmt?.date === 'function' ? fmt.date(model.generatedAt) : 'РїРѕСЃР»РµРґРЅРёР№ РґРѕСЃС‚СѓРїРЅС‹Р№ СЃСЂРµР·';
    const warehouseCaption = model.warehouseOverlayReady
      ? 'РљРѕР»РѕРЅРєР° "РћСЃС‚Р°С‚РѕРє РјРѕР№ СЃРєР»Р°Рґ" СѓР¶Рµ РїРѕРґС…РІР°С‡РµРЅР° РёР· С„Р°Р№Р»Р° СЂРµР°Р»СЊРЅС‹С… РѕСЃС‚Р°С‚РєРѕРІ. РљРѕР»РѕРЅРєР° "Р’ РїСѓС‚Рё РЅР° СЃРєР»Р°Рґ" РїРѕРєР° РѕСЃС‚Р°РІР»РµРЅР° РѕС‚РґРµР»СЊРЅС‹Рј Р±СѓРґСѓС‰РёРј СЃР»РѕРµРј, РїРѕС‚РѕРјСѓ С‡С‚Рѕ РёСЃС‚РѕС‡РЅРёРєР° РµС‰С‘ РЅРµС‚.'
      : 'РљРѕР»РѕРЅРєРё "РћСЃС‚Р°С‚РѕРє РјРѕР№ СЃРєР»Р°Рґ" Рё "Р’ РїСѓС‚Рё РЅР° СЃРєР»Р°Рґ" СѓР¶Рµ Р·Р°Р»РѕР¶РµРЅС‹ РІ С„РѕСЂРјСѓ. РџРѕРєР° РІРЅРµС€РЅРёР№ Excel РёР»Рё 1РЎ РЅРµ РїРѕРґРєР»СЋС‡С‘РЅ, РѕРЅРё Р·Р°РїРѕР»РЅСЏСЋС‚СЃСЏ С‚РѕР»СЊРєРѕ С‚Р°Рј, РіРґРµ РёСЃС‚РѕС‡РЅРёРє СѓР¶Рµ РѕС‚РґР°Р» РїРѕР»СЏ.';

    return `
      <section class="imperial-section altea-order-logistics" data-altea-order-logistics>
        <div class="section-title">
          <div>
            <h2>Р—Р°РєР°Р· С‚РѕРІР°СЂР° РїРѕ РєР»Р°СЃС‚РµСЂР°Рј</h2>
            <p>Р­РєСЂР°РЅ Р·Р°РєСѓРїС‰РёРєР°: РІС‹Р±РёСЂР°РµРј РїР»РѕС‰Р°РґРєСѓ Рё С†РµР»РµРІСѓСЋ РѕР±РѕСЂР°С‡РёРІР°РµРјРѕСЃС‚СЊ, РґР°Р»СЊС€Рµ РІРёРґРёРј, СЃРєРѕР»СЊРєРѕ РЅСѓР¶РЅРѕ РѕС‚РїСЂР°РІРёС‚СЊ РІ РєР°Р¶РґС‹Р№ РєР»Р°СЃС‚РµСЂ Рё СЃРєРѕР»СЊРєРѕ РїРѕР»СѓС‡Р°РµС‚СЃСЏ РІ СЃСѓРјРјРµ РїРѕ SKU.</p>
          </div>
          <div class="badge-stack">
            ${badgeHtml(`РџР»РѕС‰Р°РґРєР°: ${model.platformLabel}`, model.platform === 'wb' ? 'ok' : 'info')}
            ${badgeHtml(`Р¦РµР»СЊ: ${model.targetDays} РґРЅ.`, 'info')}
            ${badgeHtml(`SKU: ${fmtInt(model.rows.length)}`, model.rows.length ? 'ok' : 'warn')}
          </div>
        </div>
        <div class="card">
          <div class="altea-order-logistics__controls">
            <label class="altea-order-logistics__field">
              <span>Р¦РµР»РµРІР°СЏ РѕР±РѕСЂР°С‡РёРІР°РµРјРѕСЃС‚СЊ, РґРЅРµР№</span>
              <input id="alteaOrderLogisticsDays" type="number" min="1" max="180" step="1" value="${escape(model.targetDays)}">
            </label>
            <div class="altea-order-logistics__field">
              <span>РџР»РѕС‰Р°РґРєР°</span>
              <div class="altea-order-logistics__platforms">
                <button class="quick-chip ${model.platform === 'wb' ? 'active' : ''}" type="button" data-altea-order-platform="wb">WB</button>
                <button class="quick-chip ${model.platform === 'ozon' ? 'active' : ''}" type="button" data-altea-order-platform="ozon">OZ</button>
              </div>
            </div>
            <div class="badge-stack">
              ${badgeHtml(`РљР»Р°СЃС‚РµСЂС‹: ${fmtInt(model.placeNames.length)}`, model.placeNames.length ? 'ok' : 'warn')}
              ${badgeHtml(`РЎСЂРµР·: ${periodNote}`, 'info')}
            </div>
            <div class="altea-order-logistics__actions">
              <button class="btn" type="button" data-altea-order-export>Р’С‹РіСЂСѓР·РёС‚СЊ РІ Excel</button>
            </div>
          </div>
          <div class="altea-order-logistics__summary">
            <div class="mini-kpi"><span>SKU РІ СЂР°СЃС‡С‘С‚Рµ</span><strong>${fmtInt(model.rows.length)}</strong><span>РїРѕ РїР»РѕС‰Р°РґРєРµ ${escape(model.platformLabel)}</span></div>
            <div class="mini-kpi"><span>РњРѕР№ СЃРєР»Р°Рґ</span><strong>${fmtInt(model.totals.warehouseStock)}</strong><span>СЃСѓРјРјР° РїРѕ С„Р°Р№Р»Сѓ СЂРµР°Р»СЊРЅС‹С… РѕСЃС‚Р°С‚РєРѕРІ</span></div>
            <div class="mini-kpi"><span>Р’ РїСѓС‚Рё РЅР° СЃРєР»Р°Рґ</span><strong>${fmtInt(model.totals.inboundWarehouse)}</strong><span>Р±СѓРґРµС‚ С‚РѕС‡РЅРµРµ РїРѕСЃР»Рµ Excel / 1РЎ</span></div>
            <div class="mini-kpi warn"><span>РС‚РѕРіРѕ Рє Р·Р°РєР°Р·Сѓ</span><strong>${fmtInt(model.totals.totalNeed)}</strong><span>СЃСѓРјРјР° СЂРµРєРѕРјРµРЅРґРѕРІР°РЅРЅРѕРіРѕ Р·Р°РєР°Р·Р° РїРѕ РІСЃРµРј РєР»Р°СЃС‚РµСЂР°Рј</span></div>
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="section-subhead">
            <div>
              <h3>РўР°Р±Р»РёС†Р° Р·Р°РєР°Р·Р°</h3>
              <p class="small muted">РЎР»РµРІР° SKU Рё С†РµРЅС‚СЂР°Р»СЊРЅС‹Р№ СЃРєР»Р°Рґ, СЃРїСЂР°РІР° РїРѕ РєР°Р¶РґРѕРјСѓ РєР»Р°СЃС‚РµСЂСѓ РѕСЃС‚Р°С‚РѕРє MP, Р·Р°РєР°Р·С‹, РѕР±РѕСЂР°С‡РёРІР°РµРјРѕСЃС‚СЊ Рё СЂРµРєРѕРјРµРЅРґР°С†РёСЏ Рє Р·Р°РєР°Р·Сѓ.</p>
            </div>
            <div class="badge-stack">
              ${badgeHtml(`РџРµСЂРёРѕРґ: ${model.targetDays} РґРЅ.`, 'info')}
              ${badgeHtml('Р’ РїСѓС‚Рё РЅР° СЃРєР»Р°Рґ РїРѕРєР° 0', 'warn')}
            </div>
          </div>
          ${renderTable(model)}
          <div class="altea-order-logistics__caption">${escape(warehouseCaption)}</div>
        </div>
      </section>
    `;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .altea-order-logistics {
        margin-top: 18px;
      }
      .altea-order-logistics__controls {
        display: grid;
        grid-template-columns: minmax(180px, 220px) auto 1fr auto;
        gap: 12px;
        align-items: end;
      }
      .altea-order-logistics__field span {
        display: block;
        color: rgba(255, 244, 229, 0.64);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 6px;
      }
      .altea-order-logistics__field input {
        width: 100%;
        border-radius: 14px;
        border: 1px solid rgba(212, 164, 74, 0.18);
        background: rgba(17, 14, 11, 0.96);
        color: #fff1dd;
        padding: 10px 12px;
      }
      .altea-order-logistics__platforms,
      .altea-order-logistics__actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      .altea-order-logistics__actions {
        justify-content: flex-end;
      }
      .altea-order-logistics__summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .altea-order-logistics__table-wrap {
        margin-top: 14px;
        overflow: auto;
        height: 64vh;
        min-height: 520px;
        max-height: calc(100vh - 248px);
      }
      .altea-order-logistics__table {
        width: 100%;
        min-width: 1280px;
        border-collapse: collapse;
      }
      .altea-order-logistics__table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: rgba(18, 14, 11, 0.98);
        white-space: nowrap;
      }
      .altea-order-logistics__table thead tr:first-child th {
        z-index: 3;
        border-bottom: 1px solid rgba(212, 164, 74, 0.22);
      }
      .altea-order-logistics__table thead tr:last-child th {
        top: 38px;
      }
      .altea-order-logistics__table td:first-child,
      .altea-order-logistics__table th:first-child {
        min-width: 260px;
      }
      .altea-order-logistics__table td:nth-child(2),
      .altea-order-logistics__table th:nth-child(2) {
        min-width: 140px;
      }
      .altea-order-logistics__table td:nth-child(3),
      .altea-order-logistics__table td:nth-child(4),
      .altea-order-logistics__table td:nth-child(5) {
        min-width: 110px;
      }
      .altea-order-logistics__sku strong {
        display: block;
        margin-bottom: 4px;
      }
      .altea-order-logistics__meta {
        color: rgba(255, 244, 229, 0.58);
        font-size: 12px;
        line-height: 1.4;
      }
      .altea-order-logistics__num {
        text-align: right;
        white-space: nowrap;
      }
      .altea-order-logistics__group {
        text-align: center;
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      .altea-order-logistics__empty {
        text-align: center;
        color: rgba(255, 244, 229, 0.68);
        padding: 18px 12px;
      }
      .altea-order-logistics__caption {
        margin-top: 10px;
        color: rgba(255, 244, 229, 0.58);
        font-size: 12px;
      }
      .altea-order-logistics .card {
        border-radius: 18px;
      }
      @media (max-width: 1320px) {
        .altea-order-logistics__controls,
        .altea-order-logistics__summary {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .altea-order-logistics__actions {
          justify-content: flex-start;
        }
        .altea-order-logistics__table-wrap {
          height: 60vh;
          min-height: 460px;
          max-height: calc(100vh - 220px);
        }
      }
      @media (max-width: 900px) {
        .altea-order-logistics__controls,
        .altea-order-logistics__summary {
          grid-template-columns: 1fr;
        }
        .altea-order-logistics__table-wrap {
          height: 56vh;
          min-height: 380px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function bind(root) {
    root.querySelectorAll('[data-altea-order-platform]').forEach((button) => {
      button.addEventListener('click', async () => {
        ensureState().platform = button.dataset.alteaOrderPlatform === 'ozon' ? 'ozon' : 'wb';
        await renderCurrent();
      });
    });

    root.querySelector('#alteaOrderLogisticsDays')?.addEventListener('change', async (event) => {
      ensureState().days = clamp(event.target.value, 1, 180, 30);
      await renderCurrent();
    });

    root.querySelector('[data-altea-order-export]')?.addEventListener('click', () => {
      try {
        downloadExport(buildModel());
      } catch (error) {
        console.error('[order-logistics-hotfix] export', error);
      }
    });
  }

  async function renderCurrent(force = false) {
    const root = document.getElementById('view-order');
    if (!root) return;
    if (!force && !root.classList.contains('active')) return;
    if (force) {
      resetCache();
      if (typeof window.__alteaResetPortalSnapshotState === 'function') {
        window.__alteaResetPortalSnapshotState();
      }
    }
    injectStyles();
    try {
      await ensureSources(force);
      root.innerHTML = render(buildModel());
      bind(root);
    } catch (error) {
      console.error('[order-logistics-hotfix] render', error);
      root.innerHTML = `
        <section class="imperial-section altea-order-logistics">
          <div class="card">
            <h3>Р—Р°РєР°Р· С‚РѕРІР°СЂР° РїРѕРєР° РЅРµ Р·Р°РіСЂСѓР·РёР»СЃСЏ</h3>
            <p class="small muted">РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ <code>data/logistics.json</code> РёР»Рё <code>data/warehouse_stock_overlay.json</code>.</p>
          </div>
        </section>
      `;
    }
  }

  window.__alteaRefreshOrderLogistics = function refreshOrderLogistics(force) {
    return renderCurrent(force !== false);
  };

  function wrapRenderOrderCalculator() {
    if (typeof renderOrderCalculator !== 'function' || renderOrderCalculator.__alteaOrderLogisticsWrapped) return false;
    const original = renderOrderCalculator;
    const wrapped = function alteaOrderLogisticsWrapper() {
      const result = original.apply(this, arguments);
      if (document.getElementById('view-order')?.classList.contains('active')) renderCurrent(true);
      return result;
    };
    wrapped.__alteaOrderLogisticsWrapped = true;
    renderOrderCalculator = wrapped;
    return true;
  }

  function wrapRerenderCurrentView() {
    if (typeof rerenderCurrentView !== 'function' || rerenderCurrentView.__alteaOrderLogisticsWrapped) return false;
    const original = rerenderCurrentView;
    const wrapped = function alteaOrderLogisticsRerenderWrapper() {
      const result = original.apply(this, arguments);
      setTimeout(() => {
        if (document.getElementById('view-order')?.classList.contains('active')) renderCurrent();
      }, 40);
      return result;
    };
    wrapped.__alteaOrderLogisticsWrapped = true;
    rerenderCurrentView = wrapped;
    return true;
  }

  function boot() {
    const ready = wrapRenderOrderCalculator() | wrapRerenderCurrentView();
    if (!ready) {
      setTimeout(boot, 250);
      return;
    }
    if (document.getElementById('view-order')?.classList.contains('active')) renderCurrent(true);
  }

  document.getElementById('pullRemoteBtn')?.addEventListener('click', () => {
    setTimeout(() => {
      if (document.getElementById('view-order')?.classList.contains('active')) renderCurrent(true);
    }, 180);
  });

  boot();
})();
