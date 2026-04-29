function orderProcurementReadMetric(row, days, keys) {
  const key = keys[days] || null;
  if (!key) return null;
  const value = Math.ceil(orderProcurementNumber(row?.[key]));
  return value > 0 ? value : 0;
}

function orderProcurementOrdersForDays(row, days) {
  const direct = orderProcurementReadMetric(row, days, {
    7: 'sales7',
    14: 'sales14',
    28: 'sales28'
  });
  if (direct !== null) return direct;
  return Math.ceil(Math.max(0, orderProcurementNumber(row?.avgDaily) * days));
}

function orderProcurementNeedForDays(row, days) {
  const direct = orderProcurementReadMetric(row, days, {
    7: 'targetNeed7',
    14: 'targetNeed14',
    28: 'targetNeed28'
  });
  if (direct !== null && direct >= 0) return direct;

  const orders = orderProcurementOrdersForDays(row, days);
  const stock = orderProcurementNumber(row?.inStock);
  const inFlight = orderProcurementNumber(row?.inTransit) + orderProcurementNumber(row?.inRequest);
  return Math.max(0, Math.ceil(orders - stock - inFlight));
}

function orderProcurementSafeTurnover(row) {
  if (row?.turnoverDays !== null && row?.turnoverDays !== undefined && row?.turnoverDays !== '') {
    const value = Number(row.turnoverDays);
    return Number.isFinite(value) ? value : null;
  }
  const avgDaily = orderProcurementNumber(row?.avgDaily);
  if (avgDaily <= 0) return null;
  return orderProcurementNumber(row?.inStock) / avgDaily;
}

function orderProcurementOwnerForPlatform(sku, row, platform) {
  const platformOwner = typeof platformOwnerName === 'function'
    ? platformOwnerName(sku, platform)
    : '';
  if (platformOwner) return platformOwner;

  const rowOwner = typeof canonicalOwnerName === 'function'
    ? canonicalOwnerName(row?.owner || '')
    : String(row?.owner || '').trim();
  if (rowOwner) return rowOwner;

  if (typeof ownerName === 'function') return ownerName(sku);
  return typeof canonicalOwnerName === 'function'
    ? canonicalOwnerName(sku?.owner?.name || '')
    : String(sku?.owner?.name || '').trim();
}

function buildOrderProcurementModel() {
  const orderState = ensureOrderProcurementState();
  const platform = orderState.platform === 'ozon' ? 'ozon' : 'wb';
  const days = clampOrderProcurementDays(orderState.days);
  const payload = orderProcurementCurrentPayload(platform) || { rows: [] };
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const skuLookup = orderProcurementBuildSkuLookup();
  const warehouseLookup = orderProcurementBuildWarehouseMap();
  const rowMap = new Map();
  const placeOrder = [];
  const placeSeen = new Set();
  const clusterTotalsMap = new Map();

  rows.forEach((row) => {
    const article = String(row?.article || '').trim();
    const articleKey = orderProcurementNormalizeKey(row?.articleKey || article);
    if (!articleKey) return;

    const place = String(row?.place || '').trim() || 'Без кластера';
    if (!placeSeen.has(place)) {
      placeSeen.add(place);
      placeOrder.push(place);
    }

    const sku = skuLookup.get(articleKey) || skuLookup.get(orderProcurementNormalizeKey(article)) || {};
    const warehouse = warehouseLookup.get(articleKey) || warehouseLookup.get(orderProcurementNormalizeKey(article)) || {};
    const current = rowMap.get(articleKey) || {
      article,
      articleKey,
      name: sku?.name || row?.name || article,
      owner: orderProcurementOwnerForPlatform(sku, row, platform),
      warehouseStock: orderProcurementNumber(warehouse.stockWarehouse),
      inboundWarehouse: orderProcurementNumber(warehouse.inboundWarehouse),
      totalNeed: 0,
      totalOrders: 0,
      clusters: {}
    };

    const clusterOrders = orderProcurementOrdersForDays(row, days);
    const clusterNeed = orderProcurementNeedForDays(row, days);
    const cluster = {
      mpStock: orderProcurementNumber(row?.inStock),
      orders: clusterOrders,
      turnover: orderProcurementSafeTurnover(row),
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
    acc.warehouseStock += orderProcurementNumber(row.warehouseStock);
    acc.inboundWarehouse += orderProcurementNumber(row.inboundWarehouse);
    acc.totalNeed += orderProcurementNumber(row.totalNeed);
    return acc;
  }, { warehouseStock: 0, inboundWarehouse: 0, totalNeed: 0 });

  return {
    platform,
    platformLabel: platform === 'ozon' ? 'OZ' : 'WB',
    days,
    generatedAt: payload.generatedAt || ORDER_PROCUREMENT_RUNTIME.cache.warehouse?.generatedAt || null,
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

function exportOrderProcurementCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function exportOrderProcurementModel(model) {
  const headers = [
    'SKU / Номенклатура',
    'Артикул',
    'Остатки мой склад',
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

  const lines = [headers.map(exportOrderProcurementCell).join(';')];
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

    lines.push(cells.map(exportOrderProcurementCell).join(';'));
  });

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `zakaz-tovara-${model.platform}-${model.days}d-${todayIso()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderOrderProcurementClusterSummary(model) {
  if (!model.clusterTotals.length) return '';
  return `
    <div class="altea-order-procurement__cluster-strip">
      ${model.clusterTotals.map((cluster) => `
        <div class="altea-order-procurement__cluster-card">
          <span>${orderProcurementEscape(cluster.place)}</span>
          <strong>${fmt.int(cluster.need)}</strong>
          <small>к заказу · ${fmt.int(cluster.mpStock)} на MP</small>
        </div>
      `).join('')}
    </div>
  `;
}

function renderOrderProcurementTable(model) {
  const headGroups = model.places
    .map((place) => `<th colspan="4" class="altea-order-procurement__cluster-head">${orderProcurementEscape(place)}</th>`)
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
            <td class="altea-order-procurement__num">${fmt.int(cluster.mpStock)}</td>
            <td class="altea-order-procurement__num">${fmt.int(cluster.orders)}</td>
            <td>${orderProcurementTurnoverBadge(cluster.turnover)}</td>
            <td>${orderProcurementBadge(fmt.int(cluster.need), cluster.need > 0 ? 'warn' : 'ok')}</td>
          `;
        }).join('');

        const articleLabel = row.article || row.articleKey;
        const skuLink = typeof linkToSku === 'function'
          ? linkToSku(row.articleKey || articleLabel, articleLabel)
          : orderProcurementEscape(articleLabel);

        return `
          <tr>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--sku">
              <strong>${orderProcurementEscape(row.name || articleLabel)}</strong>
              <div class="altea-order-procurement__meta">${orderProcurementEscape(row.owner || 'Без owner')}</div>
            </td>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--article">${skuLink}</td>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--warehouse altea-order-procurement__num">${fmt.int(row.warehouseStock)}</td>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--inbound altea-order-procurement__num">${fmt.int(row.inboundWarehouse)}</td>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--total">${orderProcurementBadge(fmt.int(row.totalNeed), row.totalNeed > 0 ? 'warn' : 'ok')}</td>
            ${clusterCells}
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td colspan="${columnCount}" class="altea-order-procurement__empty">По выбранной площадке строки не загрузились.</td>
      </tr>
    `;

  return `
    <div class="altea-order-procurement__table-wrap imperial-table-wrap">
      <table class="altea-order-procurement__table">
        <thead>
          <tr>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--sku">SKU / Номенклатура</th>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--article">Артикул</th>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--warehouse">Остатки мой склад</th>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--inbound">В пути на склад</th>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--total">Итого заказ товара</th>
            ${headGroups}
          </tr>
          <tr>${headMetrics}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderOrderProcurement(model) {
  const range = model.window?.from && model.window?.to
    ? `${orderProcurementEscape(model.window.from)} - ${orderProcurementEscape(model.window.to)}`
    : 'последний доступный срез';

  return `
    <section class="imperial-section altea-order-procurement" data-altea-order-procurement>
      <div class="card">
        <div class="section-title">
          <div>
            <h2>Заказ товара по кластерам</h2>
            <p>Рабочая форма закупщика: слева центральный склад, справа кластеры площадки, ниже готовая рекомендация по заказу на каждый кластер.</p>
          </div>
          <div class="badge-stack">
            ${orderProcurementBadge(`Площадка: ${model.platformLabel}`, model.platform === 'wb' ? 'ok' : 'info')}
            ${orderProcurementBadge(`Оборачиваемость: ${model.days} дн.`, 'info')}
            ${orderProcurementBadge(`Срез: ${range}`, 'info')}
          </div>
        </div>

        <div class="altea-order-procurement__toolbar">
          <label class="altea-order-procurement__field">
            <span>Оборачиваемость, дней</span>
            <input id="alteaOrderTargetDays" type="number" min="1" max="180" step="1" value="${orderProcurementEscape(model.days)}">
          </label>

          <div class="altea-order-procurement__field">
            <span>Площадка</span>
            <div class="altea-order-procurement__platforms">
              <button type="button" class="altea-order-procurement__platform-btn ${model.platform === 'wb' ? 'is-active' : ''}" data-altea-order-platform="wb">WB</button>
              <button type="button" class="altea-order-procurement__platform-btn ${model.platform === 'ozon' ? 'is-active' : ''}" data-altea-order-platform="ozon">OZ</button>
            </div>
          </div>

          <div class="badge-stack">
            ${orderProcurementBadge(`SKU: ${fmt.int(model.rows.length)}`, model.rows.length ? 'ok' : 'warn')}
            ${orderProcurementBadge(`Кластеры: ${fmt.int(model.places.length)}`, model.places.length ? 'ok' : 'warn')}
            ${orderProcurementBadge(`Обновлено: ${orderProcurementFormatDateTime(model.generatedAt)}`, 'info')}
          </div>

          <div class="altea-order-procurement__actions">
            <button type="button" class="btn" data-altea-order-export>Выгрузить в Excel</button>
          </div>
        </div>
      </div>

      <div class="altea-order-procurement__summary">
        <div class="mini-kpi">
          <span>SKU в расчёте</span>
          <strong>${fmt.int(model.rows.length)}</strong>
          <span>${model.platformLabel}</span>
        </div>
        <div class="mini-kpi">
          <span>Остаток мой склад</span>
          <strong>${fmt.int(model.totals.warehouseStock)}</strong>
          <span>из файла реальных остатков</span>
        </div>
        <div class="mini-kpi">
          <span>В пути на склад</span>
          <strong>${fmt.int(model.totals.inboundWarehouse)}</strong>
          <span>источник пока не подключён</span>
        </div>
        <div class="mini-kpi warn">
          <span>Итого к заказу</span>
          <strong>${fmt.int(model.totals.totalNeed)}</strong>
          <span>сумма по всем кластерам</span>
        </div>
      </div>

      ${renderOrderProcurementClusterSummary(model)}

      <div class="card altea-order-procurement__table-card">
        <div class="section-subhead">
          <div>
            <h3>Таблица заказа</h3>
            <p class="small muted">Слева фиксированные колонки по SKU и складу, справа блоки кластеров выбранной площадки: остатки MP, заказы, оборачиваемость и рекомендованный заказ.</p>
          </div>
          <div class="badge-stack">
            ${orderProcurementBadge(`Период расчёта: ${model.days} дн.`, 'info')}
            ${orderProcurementBadge('Колонка "В пути" пока = 0', 'warn')}
          </div>
        </div>

        ${renderOrderProcurementTable(model)}

        <div class="altea-order-procurement__caption">
          Колонка "Остатки мой склад" уже берётся из файла реальных остатков. Колонку "В пути на склад" оставили отдельной, но пока не заполняем, потому что источник ещё не подключён.
        </div>
      </div>
    </section>
  `;
}

function renderOrderProcurementLoading() {
  return `
    <section class="imperial-section altea-order-procurement">
      <div class="card">
        <h2>Заказ товара по кластерам</h2>
        <p class="small muted">Подтягиваю данные по складу и кластерам, чтобы собрать рабочую форму закупщика.</p>
      </div>
    </section>
  `;
}

function renderOrderProcurementError() {
  return `
    <section class="imperial-section altea-order-procurement">
      <div class="card">
        <h3>Заказ товара пока не загрузился</h3>
        <p class="small muted">Не удалось прочитать order-файлы. Проверьте, что доступны <code>data/order_procurement.json</code> и <code>data/warehouse_stock_overlay.json</code>.</p>
      </div>
    </section>
  `;
}

function orderProcurementRenderInto(root) {
  const model = buildOrderProcurementModel();
  root.innerHTML = renderOrderProcurement(model);
  bindOrderProcurement(root);
}

function bindOrderProcurement(root) {
  root.querySelectorAll('[data-altea-order-platform]').forEach((button) => {
    button.addEventListener('click', () => {
      ensureOrderProcurementState().platform = button.dataset.alteaOrderPlatform === 'ozon' ? 'ozon' : 'wb';
      renderOrderCalculator();
    });
  });

  root.querySelector('#alteaOrderTargetDays')?.addEventListener('change', (event) => {
    ensureOrderProcurementState().days = clampOrderProcurementDays(event.target.value);
    renderOrderCalculator();
  });

  root.querySelector('[data-altea-order-export]')?.addEventListener('click', () => {
    try {
      exportOrderProcurementModel(buildOrderProcurementModel());
      setAppError('Выгрузка заказа подготовлена.');
      window.setTimeout(() => setAppError(''), 1600);
    } catch (error) {
      console.error('[order-procurement] export', error);
      setAppError('Не удалось выгрузить таблицу заказа. Попробуйте ещё раз.');
    }
  });
}

function injectOrderProcurementStyles() {
  if (document.getElementById(ORDER_PROCUREMENT_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = ORDER_PROCUREMENT_STYLE_ID;
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
