(function () {
  if (window.__ALTEA_ORDER_LOGISTICS_HOTFIX_20260428B__) return;
  window.__ALTEA_ORDER_LOGISTICS_HOTFIX_20260428B__ = true;
  window.__ALTEA_ORDER_LOGISTICS_HOTFIX_20260425A__ = true;

  const VERSION = '20260428b';
  const STYLE_ID = 'altea-order-logistics-hotfix-20260428b';
  const SNAPSHOT_TABLE = 'portal_data_snapshots';
  const SNAPSHOT_CFG = {
    url: 'https://iyckwryrucqrxwlowxow.supabase.co',
    anonKey: 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw'
  };
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
    if (value < 7) return badgeHtml(`${fmtNum(value, 1)} дн.`, 'danger');
    if (value < 14) return badgeHtml(`${fmtNum(value, 1)} дн.`, 'warn');
    return badgeHtml(`${fmtNum(value, 1)} дн.`, 'ok');
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

  function logisticsPayloadUsable(payload) {
    return Array.isArray(payload?.allRows) && payload.allRows.length > 0
      || Array.isArray(payload?.ozonClusters) && payload.ozonClusters.length > 0
      || Array.isArray(payload?.wbWarehouses) && payload.wbWarehouses.length > 0;
  }

  function expandCompactLogisticsPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (Array.isArray(payload.allRows) && payload.allRows.length) return payload;
    if (!Array.isArray(payload.allRowsCompact) || !payload.allRowsCompact.length) return payload;

    payload.allRows = payload.allRowsCompact.map((row) => ({
      platform: row?.[0] === 'w' ? 'wb' : 'ozon',
      place: row?.[1] || '',
      article: row?.[2] || '',
      inStock: toNumber(row?.[3]),
      inTransit: toNumber(row?.[4]),
      inRequest: toNumber(row?.[5]),
      avgDaily: toNumber(row?.[6]),
      turnoverDays: row?.[7] == null || row?.[7] === '' ? null : toNumber(row?.[7]),
      sales7: toNumber(row?.[8]),
      sales14: toNumber(row?.[9]),
      sales28: toNumber(row?.[10]),
      targetNeed7: toNumber(row?.[11]),
      targetNeed14: toNumber(row?.[12]),
      targetNeed28: toNumber(row?.[13])
    }));
    return payload;
  }

  function chooseFreshestPayload(snapshotPayload, localPayload) {
    const snapshotUsable = logisticsPayloadUsable(snapshotPayload);
    const localUsable = logisticsPayloadUsable(localPayload);
    if (snapshotUsable !== localUsable) {
      return snapshotUsable ? snapshotPayload : localPayload;
    }
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

  function activeFetch() {
    if (typeof window.__ALTEA_BASE_FETCH__ === 'function') return window.__ALTEA_BASE_FETCH__.bind(window);
    if (typeof window.fetch === 'function') return window.fetch.bind(window);
    return null;
  }

  function snapshotBrand() {
    try {
      if (typeof currentBrand === 'function') return currentBrand() || 'Алтея';
    } catch (error) {
      console.warn('[order-logistics-hotfix] brand', error);
    }
    return 'Алтея';
  }

  function decodeChunkedSnapshotPayload(snapshotKey, rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    const main = rows.find((row) => String(row?.snapshot_key || '').trim() === snapshotKey);
    const payload = main?.payload || null;
    if (!payload) return null;
    if (!payload.chunked) return payload;

    const chunkCount = Number(payload.chunk_count || payload.chunkCount || 0);
    if (!chunkCount) return null;

    const prefix = `${snapshotKey}__part__`;
    const chunkRows = rows
      .filter((row) => String(row?.snapshot_key || '').startsWith(prefix))
      .sort((left, right) => String(left?.snapshot_key || '').localeCompare(String(right?.snapshot_key || '')));

    if (chunkRows.length < chunkCount) return null;

    const text = chunkRows
      .slice(0, chunkCount)
      .map((row) => String(row?.payload?.data || ''))
      .join('');

    if (!text) return null;
    return JSON.parse(text);
  }

  async function fetchDirectSnapshotPayload(snapshotKey) {
    const fetchImpl = activeFetch();
    if (!fetchImpl || !snapshotKey) return null;

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), 12000) : null;
    try {
      const url = new URL(`${SNAPSHOT_CFG.url}/rest/v1/${SNAPSHOT_TABLE}`);
      url.searchParams.set('select', 'snapshot_key,payload,generated_at,updated_at');
      url.searchParams.set('brand', `eq.${snapshotBrand()}`);
      url.searchParams.set('snapshot_key', `like.${snapshotKey}*`);
      url.searchParams.set('order', 'snapshot_key.asc');

      const response = await fetchImpl(url.toString(), {
        headers: {
          apikey: SNAPSHOT_CFG.anonKey,
          Authorization: `Bearer ${SNAPSHOT_CFG.anonKey}`,
          Accept: 'application/json'
        },
        cache: 'no-store',
        signal: controller?.signal
      });

      if (!response.ok) throw new Error(`Snapshot ${snapshotKey} HTTP ${response.status}`);
      const rows = await response.json();
      return decodeChunkedSnapshotPayload(snapshotKey, rows);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function fetchLocalJson(path) {
    const resolved = path.includes('?') ? path : `${path}?v=${VERSION}`;
    const fetchImpl = activeFetch();
    if (!fetchImpl) throw new Error(`Fetch is not available for ${path}`);
    const response = await fetchImpl(resolved, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    const raw = await response.text();
    const parsed = typeof sanitizeLooseJson === 'function' ? JSON.parse(sanitizeLooseJson(raw)) : JSON.parse(raw);
    return path === 'data/logistics.json' ? expandCompactLogisticsPayload(parsed) : parsed;
  }

  async function loadJson(path, key, force) {
    if (!force && cache[key]) return cache[key];

    let localPayload = null;
    try {
      localPayload = await fetchLocalJson(path);
    } catch (error) {
      console.warn('[order-logistics-hotfix] local', path, error);
    }

    if (path !== 'data/logistics.json') {
      if (!localPayload) throw new Error(`Failed to load ${path}`);
      cache[key] = localPayload;
      return localPayload;
    }

    if (logisticsPayloadUsable(localPayload)) {
      cache[key] = localPayload;
      return localPayload;
    }

    let snapshotPayload = null;
    const snapshotKey = path === 'data/logistics.json' ? 'logistics' : null;
    if (snapshotKey) {
      try {
        snapshotPayload = expandCompactLogisticsPayload(await fetchDirectSnapshotPayload(snapshotKey));
      } catch (error) {
        console.warn('[order-logistics-hotfix] direct-snapshot', path, error);
      }
    }
    if (!snapshotPayload && typeof window.__alteaLoadPortalSnapshot === 'function') {
      try {
        snapshotPayload = expandCompactLogisticsPayload(await window.__alteaLoadPortalSnapshot(path, { force: Boolean(force) }));
      } catch (error) {
        console.warn('[order-logistics-hotfix] snapshot', path, error);
      }
    }

    if (!localPayload && !snapshotPayload) throw new Error(`Failed to load ${path}`);

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
    const headers = ['SKU / номенклатура', 'Артикул', 'Остаток мой склад', 'В пути на склад', 'Итого к заказу'];
    model.placeNames.forEach((name) => {
      headers.push(`${name} · Остаток MP`, `${name} · Заказы`, `${name} · Оборачиваемость`, `${name} · Рек. к заказу`);
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
    const headerMetrics = model.placeNames.map(() => '<th>Остаток MP</th><th>Заказы</th><th>Оборачиваемость</th><th>Рек. к заказу</th>').join('');

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
                <div class="altea-order-logistics__meta">${escape(row.articleKey || row.article)} · ${escape(row.owner || 'Без owner')}</div>
              </td>
              <td>${typeof linkToSku === 'function' ? linkToSku(row.article, row.article) : escape(row.article)}</td>
              <td class="altea-order-logistics__num">${fmtInt(row.warehouseStock)}</td>
              <td class="altea-order-logistics__num">${fmtInt(row.inboundWarehouse)}</td>
              <td>${badgeHtml(fmtInt(row.totalNeed), row.totalNeed > 0 ? 'warn' : 'ok')}</td>
              ${clusterCells}
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="${5 + model.placeNames.length * 4}" class="altea-order-logistics__empty">Нет SKU по выбранной площадке и доступным кластерным данным.</td></tr>`;

    return `
      <div class="altea-order-logistics__table-wrap imperial-table-wrap">
        <table class="altea-order-logistics__table">
          <thead>
            <tr>
              <th rowspan="2">SKU</th>
              <th rowspan="2">Артикул</th>
              <th rowspan="2">Остаток мой склад</th>
              <th rowspan="2">В пути на склад</th>
              <th rowspan="2">Итого к заказу</th>
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
    const periodNote = model.generatedAt && typeof fmt?.date === 'function' ? fmt.date(model.generatedAt) : 'последний доступный срез';
    const warehouseCaption = model.warehouseOverlayReady
      ? 'Колонка "Остаток мой склад" уже подхвачена из файла реальных остатков. Колонка "В пути на склад" пока оставлена отдельным будущим слоем, потому что источника ещё нет.'
      : 'Колонки "Остаток мой склад" и "В пути на склад" уже заложены в форму. Пока внешний Excel или 1С не подключён, они заполняются только там, где источник уже отдал поля.';

    return `
      <section class="imperial-section altea-order-logistics" data-altea-order-logistics>
        <div class="section-title">
          <div>
            <h2>Заказ товара по кластерам</h2>
            <p>Экран закупщика: выбираем площадку и целевую оборачиваемость, дальше видим, сколько нужно отправить в каждый кластер и сколько получается в сумме по SKU.</p>
          </div>
          <div class="badge-stack">
            ${badgeHtml(`Площадка: ${model.platformLabel}`, model.platform === 'wb' ? 'ok' : 'info')}
            ${badgeHtml(`Цель: ${model.targetDays} дн.`, 'info')}
            ${badgeHtml(`SKU: ${fmtInt(model.rows.length)}`, model.rows.length ? 'ok' : 'warn')}
          </div>
        </div>
        <div class="card">
          <div class="altea-order-logistics__controls">
            <label class="altea-order-logistics__field">
              <span>Целевая оборачиваемость, дней</span>
              <input id="alteaOrderLogisticsDays" type="number" min="1" max="180" step="1" value="${escape(model.targetDays)}">
            </label>
            <div class="altea-order-logistics__field">
              <span>Площадка</span>
              <div class="altea-order-logistics__platforms">
                <button class="quick-chip ${model.platform === 'wb' ? 'active' : ''}" type="button" data-altea-order-platform="wb">WB</button>
                <button class="quick-chip ${model.platform === 'ozon' ? 'active' : ''}" type="button" data-altea-order-platform="ozon">OZ</button>
              </div>
            </div>
            <div class="badge-stack">
              ${badgeHtml(`Кластеры: ${fmtInt(model.placeNames.length)}`, model.placeNames.length ? 'ok' : 'warn')}
              ${badgeHtml(`Срез: ${periodNote}`, 'info')}
            </div>
            <div class="altea-order-logistics__actions">
              <button class="btn" type="button" data-altea-order-export>Выгрузить в Excel</button>
            </div>
          </div>
          <div class="altea-order-logistics__summary">
            <div class="mini-kpi"><span>SKU в расчёте</span><strong>${fmtInt(model.rows.length)}</strong><span>по площадке ${escape(model.platformLabel)}</span></div>
            <div class="mini-kpi"><span>Мой склад</span><strong>${fmtInt(model.totals.warehouseStock)}</strong><span>сумма по файлу реальных остатков</span></div>
            <div class="mini-kpi"><span>В пути на склад</span><strong>${fmtInt(model.totals.inboundWarehouse)}</strong><span>будет точнее после Excel / 1С</span></div>
            <div class="mini-kpi warn"><span>Итого к заказу</span><strong>${fmtInt(model.totals.totalNeed)}</strong><span>сумма рекомендованного заказа по всем кластерам</span></div>
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="section-subhead">
            <div>
              <h3>Таблица заказа</h3>
              <p class="small muted">Слева SKU и центральный склад, справа по каждому кластеру остаток MP, заказы, оборачиваемость и рекомендация к заказу.</p>
            </div>
            <div class="badge-stack">
              ${badgeHtml(`Период: ${model.targetDays} дн.`, 'info')}
              ${badgeHtml('В пути на склад пока 0', 'warn')}
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
            <h3>Заказ товара пока не загрузился</h3>
            <p class="small muted">Не удалось прочитать <code>data/logistics.json</code> или <code>data/warehouse_stock_overlay.json</code>.</p>
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
