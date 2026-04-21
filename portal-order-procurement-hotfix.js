(function () {
  const VERSION = '20260421b';
  if (window.__ALTEA_ORDER_PROCUREMENT_HOTFIX_VERSION__ === VERSION) return;

  window.__ALTEA_ORDER_PROCUREMENT_HOTFIX_VERSION__ = VERSION;
  window.__ALTEA_ORDER_PROCUREMENT_ENABLED__ = true;

  const STYLE_ID = `altea-order-procurement-hotfix-${VERSION}`;
  const cache = {
    skus: null,
    warehouse: null,
    wb: null,
    ozon: null
  };

  function ensureState() {
    if (typeof state !== 'object' || !state) return { platform: 'wb', days: 30 };
    state.orderProcurement = state.orderProcurement || {};
    if (!['wb', 'ozon'].includes(state.orderProcurement.platform)) state.orderProcurement.platform = 'wb';
    state.orderProcurement.days = clamp(state.orderProcurement.days, 1, 180, 30);
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
    return Math.max(min, Math.min(max, Math.round(parsed)));
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

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_-]+/gu, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function uniq(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function fmtInt(value) {
    if (typeof fmt === 'object' && fmt && typeof fmt.int === 'function') return fmt.int(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(toNumber(value)));
  }

  function fmtNum(value, digits = 1) {
    if (typeof fmt === 'object' && fmt && typeof fmt.num === 'function') return fmt.num(value, digits);
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(toNumber(value));
  }

  function fmtDateTime(value) {
    if (!value) return 'последний доступныщ срез';
    try {
      return new Date(value).toLocaleString('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch {
      return String(value);
    }
  }

  function badgeHtml(text, tone) {
    if (typeof badge === 'function') return badge(text, tone || '');
    return `<span class="quick-chip ${tone ? `is-${tone}` : ''}">${escape(text)}</span>`;
  }

  function turnoverTone(value) {
    if (!Number.isFinite(Number(value))) return 'info';
    if (Number(value) < 7) return 'danger';
    if (Number(value) < 14) return 'warn';
    return 'ok';
  }

  function turnoverBadge(value) {
    if (!Number.isFinite(Number(value))) return badgeHtml('n/a', 'info');
    return badgeHtml(`${fmtNum(value, 1)} дн.`, turnoverTone(value));
  }

  async function decodeJsonResponse(response, path) {
    if (!response.ok) throw new Error(`Failed to load ${path}`);

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const isGzip =
      path.endsWith('.gz') ||
      contentType.includes('application/gzip') ||
      contentType.includes('application/x-gzip') ||
      contentType.includes('gzip');

    let text = '';
    if (isGzip) {
      if (typeof DecompressionStream !== 'function') {
        throw new Error(`Browser does not support gzip decompression for ${path}`);
      }
      const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(stream).text();
    } else {
      text = await response.text();
    }

    return typeof sanitizeLooseJson === 'function'
      ? JSON.parse(sanitizeLooseJson(text))
      : JSON.parse(text);
  }

  async function loadJson(path, key) {
    if (cache[key]) return cache[key];

    const resolved = path.includes('?') ? path : `${path}?v=${VERSION}`;
    const response = await fetch(resolved, { cache: 'no-store' });
    const parsed = await decodeJsonResponse(response, path);

    cache[key] = parsed;
    return parsed;
  }

  async function loadJsonWithFallback*paths, key) {
    if (cache[key]) return cache[key];

    const attempts = Array.isArray(paths) ? paths : [paths];
    let lastError = null;

    for (const path of attempts) {
      try {
        return await loadJson(path, key);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error(`Failed to load ${key}`);
  }

  async function ensureSources(platform) {
    const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
    const jobs = [
      loadJson('data/skus.json', 'skus'),
      loadJsonWithFallback(['data/warehouse_stock_overlay.json.gz', 'data/warehouse_stock_overlay.json'], 'warehouse')
    ];

    if (normalizedPlatform === 'wb') jobs.push(loadJsonWithFallback(['data/order_procurement_wb.json.gz', 'data/order_procurement_wb.json'], 'wb'));
    if (normalizedPlatform === 'ozon') jobs.push(loadJsonWithFallback(['data/order_procurement_ozon.json.gz', 'data/order_procurement_ozon.json'], 'ozon'));
    await Promise.all(jobs);
  }

  function buildSkuLookup() {
    const rows = Array.isArray(cache.skus) ? cache.skus : [];
    const lookup = new Map();

    rows.forEach((row) => {
      uniq([
        normalizeKey(row?.articleKey),
        normalizeKey(row?.article),
        normalizeKey(row?.sku)
      ]).forEach((key) => {
        if (key && !lookup.has(key)) lookup.set(key, row);
      });
    });

    return lookup;
  }

  function buildWarehouseMap() {
    const rows = Array.isArray(cache.warehouse?.rows) ? cache.warehouse.rows : [];
    const lookup = new Map();

    rows.forEach((row) => {
      const key = normalizeKey(row?.articleKey || row?.article);
      if (!key) return;
      lookup.set(key, {
        stockWarehouse: toNumber(row?.stockWarehouse),
        inboundWarehouse: 0,
        accepted: toNumber(row?.accepted),
        shippedWB: toNumber(row?.shippedWB),
        shippedOzon: toNumber(row?.shippedOzon)
      });
    });

    return lookup;
  }

  function currentPayload(platform) {
    return platform === 'ozon' ? cache.ozon : cache.wb;
  }

  function platformLabel(platform) {
    return platform === 'ozon' ? 'OZ' : 'WB';
  }

  function readDirectMetric(row, days, keys) {
    const key = keys[days] || null;
    if (!key) return null;
    const value = Math.ceil(toNumber(row?.[key]));
    return value > 0 ? value : 0;
  }

  function ordersForDays(row, days) {
    const direct = readDirectMetric(row, days, {
      7: 'sales7',
      14: 'sales14',
      28: 'sales28'
    });
    if (direct !== null) return direct;
    return Math.ceil(Math.max(0, toNumber(row?.avgDaily) * days));
  }

  function needForDays(row, days) {
    const direct = readDirectMetric(row, days, {
      7: 'targetNeed7',
      14: 'targetNeed14',
      28: 'targetNeed28'
    });
    if (direct !== null && direct > 0) return direct;

    const orders = ordersForDays(row, days);
    const stock = toNumber(row?.inStock);
    const inFlight = toNumber(row?.inTransit) + toNumber(row?.inRequest);
    return Math.max(0, Math.ceil(orders - stock - inFlight));
  }

  function safeTurnover(row) {
    if (row?.turnoverDays !== null && row?.turnoverDays !== undefined && row?.turnoverDays !== '') {
      const value = Number(row.turnoverDays);
      return Number.isFinite(value) ? value : null;
    }

    const avgDaily = toNumber(row?.avgDaily);
    if (avgDaily <= 0) return null;
    return toNumber(row?.inStock) / avgDaily;
  }

  function buildModel() {
    const orderState = ensureState();
    const platform = orderState.platform === 'ozon' ? 'ozon' : 'wb';
    const days = clamp(orderState.days, 1, 180, 30);
    const payload = currentPayload(platform) || { rows: [] };
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const skuLookup = buildSkuLookup();
    const warehouseLookup = buildWarehouseMap();
    const rowMap = new Map();
    const placeOrder = [];
    const placeSeen = new Set();
    const clusterTotalsMap = new Map();

    rows.forEach((row) => {
      const article = String(row?.article || '').trim();
      const articleKey = normalizeKey(row?.articleKey || article);
      if (!articleKey) return;

      const place = String(row?.place || '').trim() || 'Без кластера';
      if (!placeSeen.has(place)) {
        placeSeen.add(place);
        placeOrder.push(place);
      }

      const sku = skuLookup.get(articleKey) || skuLookup.get(normalizeKey(article)) || {};
      const warehouse = warehouseLookup.get(articleKey) || warehouseLookup.get(normalizeKey(article)) || {};
      const current = rowMap.get(articleKey) || {
        article,
        articleKey,
        name: sku?.name || row?.name || article,
        owner: sku?.owner?.name || row?.owner || '',
        warehouseStock: toNumber(warehouse.stockWarehouse),
        inboundWarehouse: toNumber(warehouse.inboundWarehouse),
        totalNeed: 0,
        totalOrders: 0,
        clusters: {}
      };

      const clusterOrders = ordersForDays(row, days);
      const clusterNeed = needForDays(row, days);
      const cluster = {
        mpStock: toNumber(row?.inStock),
        orders: clusterOrders,
        turnover: safeTurnover(row),
        need: clusterNeed
      };

      current.totalNeed += clusterNeed;
      current.totalOrders += clusterOrders;
      current.clusters[place] = cluster;
      rowMap.set(articleKey, current);

      const clusterTotal = clusterTotalsMap.get(place) || { mpStock: 0, orders: 0, need: 0 };
      clusterTotal.mpStock += cluster.mpStock;
      clusterTotal.orders += cluster.orders;
      clusterTotal.need += cluster.need;
      clusterTotalsMap.set(place, clusterTotal);
    });

    const list = [...rowMap.values()].sort((left, right) => {
      if (right.totalNeed !== left.totalNeed) return right.totalNeed - left.totalNeed;
      if (right.totalOrders !== left.totalOrders) return right.totalOrders - left.totalOrders;
      return String(left.article).localeCompare(String(right.article), 'ru');
    });

    const totals = list.reduce((acc, row) => {
      acc.warehouseStock += toNumber(row.warehouseStock);
      acc.inboundWarehouse += toNumber(row.inboundWarehouse);
      acc.totalNeed += toNumber(row.totalNeed);
      return acc;
    }, { warehouseStock: 0, inboundWarehouse: 0, totalNeed: 0 });

    return {
      platform,
      platformLabel: platformLabel(platform),
      days,
      generatedAt: payload.generatedAt || cache.warehouse?.generatedAt || null,
      window: payload.window || null,
      places: placeOrder,
      rows: list,
      totals,
      clusterTotals: placeOrder.map((place) => ({
        place,
        ...(clusterTotalsMap.get(place) || { mpStock: 0, orders: 0, need: 0 })
      }))
    };
  }

  function exportCell(value) {
    return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
  }

  function exportModel(model) {
    const headers = [
      'SKU / Номенклатура',
      'Артикул',
      'Остаток мой склад',
      'В пути на склад',
      'Итого заказ товара'
    ];

    model.places.forEach((place) => {
      headers.push(
        `${place} · Остаток MP`,
        `${place} · Заказы`,
        `${place} · Оборачиваемость`,
        `${place} · Рек. к заказу`
      );
    });

    const lines = [headers.map(exportCell).join(';')];

    model.rows.forEach((row) => {
      const cells = [
        row.name,
        row.article,
        row.warehouseStock,
        row.inboundWarehouse,
        row.totalNeed
      ];

      model.places.forEach((place) => {
        const cluster = row.clusters[place] || {};
        cells.push(
          cluster.mpStock || 0,
          cluster.orders || 0,
          cluster.turnover == null ? '' : Number(cluster.turnover).toFixed(1),
          cluster.need || 0
        );
      });

      lines.push(cells.map(exportCell).join(';'));
    });

    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `zakaz-tovara-${model.platform}-${model.days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderClusterSummary(model) {
    if (!model.clusterTotals.length) return '';
    return `
      <div class="altea-order-procurement__cluster-strip">
        ${model.clusterTotals.map((cluster) => `
          <div class="altea-order-procurement__cluster-card">
            <span>${escape(cluster.place)}</span>
            <strong>${fmtInt(cluster.need)}</strong>
            <small>к заказу · ${fmtInt(cluster.mpStock)} на MP</small>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderTable(model) {
    const headGroups = model.places
      .map((place) => `<th colspan="4" class="altea-order-procurement__cluster-head">${escape(place)}</th>`)
      .join('');

    const headMetrics = model.places
      .map(() => `
        <th>Остаток MP</th>
        <th>Заказы</th>
        <th>Оборачиваемость</th>
        <th>Рек. к заказу</th>
      `)
      .join('');

    const columnCount = 5 + (model.places.length * 4);
    const body = model.rows.length
      ? model.rows.map((row) => {
          const clusterCells = model.places.map((place) => {
            const cluster = row.clusters[place] || {};
            return `
              <td class="altea-order-procurement__num">${fmtInt(cluster.mpStock)}</td>
              <td class="altea-order-procurement__num">${fmtInt(cluster.orders)}</td>
              <td>${turnoverBadge(cluster.turnover)}</td>
              <td>${badgeHtml(fmtInt(cluster.need), cluster.need > 0 ? 'warn' : 'ok')}</td>
            `;
          }).join('');

          return `
            <tr>
              <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--sku">
                <strong>${escape(row.name || row.article)}</strong>
                <div class="altea-order-procurement__meta">${escape(row.owner || 'Без owner')}</div>
              </td>
              <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--article">
                ${typeof linkToSku === 'function' ? linkToSku(row.article, row.article) : escape(row.article)}
              </td>
              <td c��-�G����ƭy�: ${model.platformLabel}`, model.platform === 'wb' ? 'ok' : 'info')}
              ${badgeHtml(`Оборачиваемость: ${model.days} дн.`, 'info')}
              ${badgeHtml(`Срез: ${range}`, 'info')}
            </div>
          </div>

          <div class="altea-order-procurement__toolbar">
            <label class="altea-order-procurement__field">
              <span>Оборачиваемость, дней</span>
              <input id="alteaOrderTargetDays" type="number" min="1" max="180" step="1" value="${escape(model.days)}">
            </label>

            <div class="altea-order-procurement__field">
              <span>Площадка</span>
              <div class="altea-order-procurement__platforms">
                <button type="button" class="altea-order-procurement__platform-btn ${model.platform === 'wb' ? 'is-active' : ''}" data-altea-order-platform="wb">WB</button>
                <button type="button" class="altea-order-procurement__platform-btn ${model.platform === 'ozon' ? 'is-active' : ''}" data-altea-order-platform="ozon">OZ</button>
              </div>
            </div>

            <div class="badge-stack">
              ${badgeHtml(`SKU: ${fmtInt(model.rows.length)}`, model.rows.length ? 'ok' : 'warn')}
              ${badgeHtml(`Кластеры: ${fmtInt(model.places.length)}`, model.places.length ? 'ok' : 'warn')}
              ${badgeHtml(`Обновлено: ${fmtDateTime(model.generatedAt)}`, 'info')}
            </div>

            <div class="altea-order-procurement__actions">
              <button type="button" class="btn" data-altea-order-export>Выгрузить в Excel</button>
            </div>
          </div>
        </div>

        <div class="altea-order-procurement__summary">
          <div class="mini-kpi">
            <span>SKU в расчёте</span>
            <strong>${fmtInt(model.rows.length)}</strong>
            <span>${model.platformLabel}</span>
          </div>
          <div class="mini-kpi">
            <span>Остаток мой склад</span>
            <strong>${fmtInt(model.totals.warehouseStock)}</strong>
            <span>из файла реальных остатков</span>
          </div>
          <div class="mini-kpi">
            <span>В пути на склад</span>
            <strong>${fmtInt(model.totals.inboundWarehouse)}</strong>
            <span>источник пока не подключён</span>
          </div>
          <div class="mini-kpi warn">
            <span>Итого к заказу</span>
            <strong>${fmtInt(model.totals.totalNeed)}</strong>
            <span>сумма по всем кластерам</span>
          </div>
        </div>

        ${renderClusterSummary(model)}

        <div class="card altea-order-procurement__table-card">
          <div class="section-subhead">
            <div>
              <h3>Таблица заказа</h3>
              <p class="small muted">Слева фиксированные колонки по SKU и складу, справа блоки кластеров выбранной площадки: остатки MP, заказы, оборачиваемость и рекомендованный заказ.</p>
            </div>
            <div class="badge-stack">
              ${badgeHtml(`Период расчёта: ${model.days} дн.`, 'info')}
              ${badgeHtml('Колонка "В пути" пока = 0', 'warn')}
            </div>
          </div>

          ${renderTable(model)}

          <div class="altea-order-procurement__caption">
            Колонка "Остатки мой склад" уже берётся из файла реальных остатков. Колонку "В пути на склад" оставили отдельной, но пока не заполняем, потому что источник ещё не подключён.
          </div>
        </div>
      </section>
    `;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .altea-order-procurement {
        --col-sku: 320px;
        --col-article: 170px;
        --col-warehouse: 150px;
        --col-inbound: 150px;
        --col-total: 170px;
        display: grid;
        gap: 14px;
        width: 100%;
        margin-top: 18px;
      }

      .altea-order-procurement__toolbar {
        display: grid;
        grid-template-columns: minmax(180px, 220px) auto 1fr auto;
        gap: 12px;
        align-items: end;
        margin-top: 12px;
      }

      .altea-order-procurement__field span {
        display: block;
        margin-bottom: 6px;
        color: rgba(255, 244, 229, 0.64);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .altea-order-procurement__field input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(212, 164, 74, 0.18);
        background: rgba(17, 14, 11, 0.96);
        color: #fff1dd;
      }

      .altea-order-procurement__platforms,
      .altea-order-procurement__actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }

      .altea-order-procurement__actions {
        justify-content: flex-end;
      }

      .altea-order-procurement__platform-btn {
        min-width: 70px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(212, 164, 74, 0.22);
        background: rgba(18, 14, 10, 0.92);
        color: #fff1dd;
        font: inherit;
        cursor: pointer;
        transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
      }

      .altea-order-procurement__platform-btn:hover {
        transform: translateY(-1px);
        border-color: rgba(212, 164, 74, 0.44);
      }

      .altea-order-procurement__platform-btn.is-active {
        background: linear-gradient(135deg, rgba(212, 164, 74, 0.30), rgba(101, 67, 33, 0.56));
        border-color: rgba(240, 196, 101, 0.60);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
      }

      .altea-order-procurement__summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .altea-order-procurement__cluster-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }

      .altea-order-procurement__cluster-card {
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(212, 164, 74, 0.14);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01)),
          rgba(17, 14, 11, 0.96);
      }

      .altea-order-procurement__cluster-card span,
      .altea-order-procurement__cluster-card small {
        display: block;
      }

      .altea-order-procurement__cluster-card span {
        color: rgba(255, 244, 229, 0.72);
        font-size: 12px;
        line-height: 1.4;
      }

      .altea-order-procurement__cluster-card strong {
        display: block;
        margin: 8px 0 4px;
        font-size: 22px;
        line-height: 1;
      }

      .altea-order-procurement__cluster-card small {
        color: rgba(255, 244, 229, 0.56);
      }

      .altea-order-procurement__table-card {
        overflow: hidden;
      }

      .altea-order-procurement__table-wrap {
        margin-top: 14px;
        overflow: auto;
        max-width: 100%;
      }

      .altea-order-procurement__table {
        width: max-content;
        min-width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }

      .altea-order-procurement__table th,
      .altea-order-procurement__table td {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(212, 164, 74, 0.10);
        vertical-align: top;
      }

      .altea-order-procurement__table thead th {
        position: sticky;
        top: 0;
        z-index: 5;
        background: rgba(18, 14, 11, 0.98);
        white-space: nowrap;
      }

      .altea-order-procurement__table thead tr:nth-child(2) th {
        top: 49px;
        z-index: 6;
      }

      .altea-order-procurement__cluster-head {
        text-align: center;
        font-size: 12px;
        letter-spacing: 0.04em;
      }

      .altea-order-procurement__sticky-head,
      .altea-order-procurement__sticky-cell {
        position: sticky;
        z-index: 7;
        background: rgba(17, 14, 11, 0.985);
        box-shadow: 1px 0 0 rgba(212, 164, 74, 0.08);
      }

      .altea-order-procurement__sticky-head {
        z-index: 8;
      }

      .altea-order-procurement__sticky-head--sku,
      .altea-order-procurement__sticky-cell--sku {
        left: 0;
        min-width: var(--col-sku);
        width: var(--col-sku);
      }

      .altea-order-procurement__sticky-head--article,
      .altea-order-procurement__sticky-cell--article {
        left: var(--col-sku);
        min-width: var(--col-article);
        width: var(--col-article);
      }

      .altea-order-procurement__sticky-head--warehouse,
      .altea-order-procurement__sticky-cell--warehouse {
        left: calc(var(--col-sku) + var(--col-article));
        min-width: var(--col-warehouse);
        width: var(--col-warehouse);
      }

      .altea-order-procurement__sticky-head--inbound,
      .altea-order-procurement__sticky-cell--inbound {
        left: calc(var(--col-sku) + var(--col-article) + var(--col-warehouse));
        min-width: var(--col-inbound);
        width: var(--col-inbound);
      }

      .altea-order-procurement__sticky-head--total,
      .altea-order-procurement__sticky-cell--total {
        left: calc(var(--col-sku) + var(--col-article) + var(--col-warehouse) + var(--col-inbound));
        min-width: var(--col-total);
        width: var(--col-total);
      }

      .altea-order-procurement__sticky-cell strong {
        display: block;
        margin-bottom: 4px;
      }

      .altea-order-procurement__meta {
        color: rgba(255, 244, 229, 0.58);
        font-size: 12px;
        line-height: 1.4;
      }

      .altea-order-procurement__num {
        text-align: right;
        white-space: nowrap;
      }

      .altea-order-procurement__table tbody tr:hover td {
        background: rgba(255, 244, 229, 0.03);
      }

      .altea-order-procurement__table tbody tr:hover .altea-order-procurement__sticky-cell {
        background: rgba(28, 22, 16, 0.98);
      }

      .altea-order-procurement__empty {
        padding: 22px 14px;
        text-align: center;
        color: rgba(255, 244, 229, 0.64);
      }

      .altea-order-procurement__caption {
        margin-top: 10px;
        color: rgba(255, 244, 229, 0.58);
        font-size: 12px;
      }

      @media (max-width: 1400px) {
        .altea-order-procurement__toolbar,
        .altea-order-procurement__summary {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .altea-order-procurement__actions {
          justify-content: flex-start;
        }
      }

      @media (max-width: 900px) {
        .altea-order-procurement {
          --col-sku: 240px;
          --col-article: 140px;
          --col-warehouse: 120px;
          --col-inbound: 120px;
          --col-total: 140px;
        }

        .altea-order-procurement__toolbar,
        .altea-order-procurement__summary {
          grid-template-columns: 1fr;
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

    root.querySelector('#alteaOrderTargetDays')?.addEventListener('change', async (event) => {
      ensureState().days = clamp(event.target.value, 1, 180, 30);
      await renderCurrent();
    });

    root.querySelector('[data-altea-order-export]')?.addEventListener('click', () => {
      try {
        exportModel(buildModel());
      } catch (error) {
        console.error('[order-procurement-hotfix] export', error);
        if (typeof setAppError === 'function') {
          setAppError('Не удалось выгрузить таблицу заказа. Попробуйте ещё раз.');
        }
      }
    });
  }

  async function renderCurrent() {
    const root = document.getElementById('view-order');
    if (!root) return;

    injectStyles();
    try {
      await ensureSources(ensureState().platform);
      root.innerHTML = render(buildModel());
      bind(root);
    } catch (error) {
      console.error('[order-procurement-hotfix] render', error);
      root.innerHTML = `
        <section class="imperial-section altea-order-procurement">
          <div class="card">
            <h3>Заказ товара пока не загрузился</h3>
            <p class="small muted">Не удалось прочитать order-файлы. Проверьте, что доступны <code>data/order_procurement_wb.json</code>, <code>data/order_procurement_ozon.json</code> и <code>data/warehouse_stock_overlay.json</code>.</p>
          </div>
        </section>
      `;
    }
  }

  function wrapRenderOrderCalculator() {
    if (typeof renderOrderCalculator !== 'function' || renderOrderCalculator.__alteaOrderProcurementWrapped) return false;

    const original = renderOrderCalculator;
    const wrapped = function alteaOrderProcurementRenderWrapper() {
      const result = original.apply(this, arguments);
      renderCurrent();
      return result;
    };

    wrapped.__alteaOrderProcurementWrapped = true;
    renderOrderCalculator = wrapped;
    return true;
  }

  function wrapRerenderCurrentView() {
    if (typeof rerenderCurrentView !== 'function' || rerenderCurrentView.__alteaOrderProcurementWrapped) return false;

    const original = rerenderCurrentView;
    const wrapped = function alteaOrderProcurementRerenderWrapper() {
      const result = original.apply(this, arguments);
      [60, 320].forEach((delay) => {
        window.setTimeout(() => {
          if (document.getElementById('view-order')?.classList.contains('active')) renderCurrent();
        }, delay);
      });
      return result;
    };

    wrapped.__alteaOrderProcurementWrapped = true;
    rerenderCurrentView = wrapped;
    return true;
  }

  function boot() {
    const ready = wrapRenderOrderCalculator() | wrapRerenderCurrentView();
    if (!ready) {
      window.setTimeout(boot, 250);
      return;
    }

    [120, 700, 1800].forEach((delay) => {
      window.setTimeout(() => {
        if (document.getElementById('view-order')?.classList.contains('active')) renderCurrent();
      }, delay);
    });
  }

  boot();
})();
