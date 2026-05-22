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

function orderProcurementAverage(values) {
  const clean = (values || []).map(Number).filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((acc, value) => acc + value, 0) / clean.length;
}

function orderProcurementClusterFlags(cluster, thresholdDays) {
  const threshold = clampOrderProcurementDays(thresholdDays || 30);
  const turnover = Number(cluster?.turnover);
  const hasTurnover = Number.isFinite(turnover) && turnover > 0;
  const mpStock = orderProcurementNumber(cluster?.mpStock);
  const orders = orderProcurementNumber(cluster?.orders);
  const need = orderProcurementNumber(cluster?.need);
  const inTransit = orderProcurementNumber(cluster?.inTransit);
  const inRequest = orderProcurementNumber(cluster?.inRequest);
  const noStock = mpStock <= 0 && (orders > 0 || need > 0);
  const shortTurnover = hasTurnover && turnover < threshold;
  const nearEmpty = mpStock > 0 && orders > 0 && mpStock <= orders;
  const lowStock = noStock || nearEmpty || shortTurnover;
  const hasNeed = need > 0;
  const inMotion = inTransit > 0 || inRequest > 0;

  return {
    threshold,
    noStock,
    shortTurnover,
    nearEmpty,
    lowStock,
    need: hasNeed,
    inMotion,
    risk: noStock || lowStock || hasNeed,
    label: noStock
      ? 'нет остатка'
      : (hasNeed ? 'к заказу' : (shortTurnover ? `< ${threshold} дн.` : (inMotion ? 'едет' : 'ок')))
  };
}

function orderProcurementClusterMatchesFilter(cluster, filter, thresholdDays) {
  const flags = cluster?.flags || orderProcurementClusterFlags(cluster, thresholdDays);
  switch (filter) {
    case 'risk':
      return flags.risk;
    case 'turnover_lt':
      return flags.shortTurnover;
    case 'low_stock':
      return flags.lowStock;
    case 'need':
      return flags.need;
    case 'no_stock':
      return flags.noStock;
    case 'in_motion':
      return flags.inMotion;
    case 'all':
    default:
      return true;
  }
}

function orderProcurementClusterTone(cluster, clusterFilter = 'all') {
  const flags = cluster?.flags || orderProcurementClusterFlags(cluster, 30);
  if (flags.noStock) return 'danger';
  if (flags.need || flags.lowStock || flags.shortTurnover) return 'warn';
  if (clusterFilter !== 'all' && flags.inMotion) return 'info';
  return '';
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

function orderProcurementReadWarehouseInbound(row) {
  const candidates = [
    row?.inboundWarehouse,
    row?.inbound,
    row?.warehouseInbound,
    row?.inTransitWarehouse,
    row?.inboundUnits
  ];

  for (const candidate of candidates) {
    const value = orderProcurementNumber(candidate);
    if (value > 0) return value;
  }

  return 0;
}

function orderProcurementBuildSkuSignals(sku, platform) {
  const side = sku?.[platform] || {};
  const channelText = Array.isArray(sku?.traffic?.channels) ? sku.traffic.channels.join(' ') : '';
  const text = [
    sku?.focusReasons,
    side?.strategy,
    side?.reason,
    channelText
  ].filter(Boolean).join(' ');
  const signals = [];
  const recPrice = orderProcurementNumber(side?.recPrice);
  const currentPrice = orderProcurementNumber(side?.currentPrice);

  if (sku?.traffic?.kz || sku?.flags?.hasKZ || /(^|\s|[,;])кз($|\s|[,;])/i.test(channelText)) {
    signals.push({ code: 'kz', label: 'КЗ работает', tone: 'info' });
  }
  if (/акци|promo|промо|скид/i.test(text)) {
    signals.push({ code: 'promo', label: 'Акция / скидка', tone: 'warn' });
  }
  if ((recPrice > 0 && currentPrice > 0 && recPrice < currentPrice) || /сниж|понижа|опуска/i.test(text)) {
    signals.push({ code: 'price-down', label: 'Снижение цены', tone: 'danger' });
  }

  return signals;
}

function orderProcurementLifecycleForSku(sku = {}, row = {}, articleKey = '') {
  const fallbackStatus = String(
    sku?.productLifecycleStatus ||
    sku?.lifecycleStatus ||
    sku?.productStatus ||
    sku?.sheetStatus ||
    sku?.registryStatus ||
    row?.productStatus ||
    row?.status ||
    sku?.status ||
    ''
  ).trim();
  let lifecycle = sku?.productLifecycle && typeof sku.productLifecycle === 'object'
    ? sku.productLifecycle
    : null;

  if (!lifecycle && typeof productLifecycleForSku === 'function') {
    try {
      lifecycle = productLifecycleForSku({
        ...sku,
        articleKey,
        article: row?.article || sku?.article || articleKey,
        productStatus: sku?.productStatus || row?.productStatus || fallbackStatus,
        status: sku?.status || row?.status || fallbackStatus
      }, articleKey);
    } catch (error) {
      console.warn('[order-procurement] product lifecycle', error);
    }
  }

  const key = typeof normalizeProductLifecycleKey === 'function'
    ? normalizeProductLifecycleKey(lifecycle?.key || lifecycle?.status || lifecycle?.label || fallbackStatus)
    : String(lifecycle?.key || '').trim();
  const meta = window.PRODUCT_LIFECYCLE_STATUS_META?.[key] || {};
  return {
    ...meta,
    ...lifecycle,
    key: key || lifecycle?.key || 'active',
    label: lifecycle?.label || lifecycle?.status || meta.label || fallbackStatus || 'Актуальный',
    status: lifecycle?.status || lifecycle?.label || meta.label || fallbackStatus || 'Актуальный',
    tone: lifecycle?.tone || meta.tone || '',
    taskPolicy: lifecycle?.taskPolicy || meta.taskPolicy || 'normal',
    reason: lifecycle?.reason || lifecycle?.note || meta.description || '',
    source: lifecycle?.source || ''
  };
}

function orderProcurementLifecycleBlocksOrder(lifecycle) {
  return ['question', 'paused', 'exit', 'archived'].includes(String(lifecycle?.key || '').trim());
}

function orderProcurementLifecycleSignal(lifecycle) {
  if (!lifecycle?.key || lifecycle.key === 'active') return null;
  const blocksOrder = orderProcurementLifecycleBlocksOrder(lifecycle);
  return {
    code: `lifecycle-${lifecycle.key}`,
    label: `Статус: ${lifecycle.label || lifecycle.status || lifecycle.key}`,
    tone: blocksOrder ? 'danger' : (lifecycle.tone || 'warn')
  };
}

function orderProcurementMetricValue(row, sortKey) {
  switch (sortKey) {
    case 'warehouse_desc':
    case 'warehouse_asc':
      return orderProcurementNumber(row.warehouseStock);
    case 'turnover_asc':
    case 'turnover_desc':
      return Number.isFinite(Number(row.displayTurnover)) ? Number(row.displayTurnover) : null;
    case 'local_desc':
      return orderProcurementNumber(row.displayInRequest);
    case 'supplier_desc':
      return orderProcurementNumber(row.acceptedFromSupplier);
    case 'inbound_desc':
      return orderProcurementNumber(row.shippedFromWarehouse) + orderProcurementNumber(row.displayInTransit);
    case 'sku_asc':
      return String(row.article || row.articleKey || '');
    case 'recommended_desc':
    default:
      return orderProcurementNumber(row.displayNeed);
  }
}

function orderProcurementSortRows(rows, sortKey) {
  const key = sortKey || 'recommended_desc';
  const direction = key === 'warehouse_asc' || key === 'turnover_asc' || key === 'sku_asc' ? 1 : -1;

  return [...rows].sort((left, right) => {
    if (key === 'sku_asc') {
      return String(orderProcurementMetricValue(left, key)).localeCompare(String(orderProcurementMetricValue(right, key)), 'ru');
    }

    const leftValue = orderProcurementMetricValue(left, key);
    const rightValue = orderProcurementMetricValue(right, key);
    const leftNumeric = Number.isFinite(Number(leftValue)) ? Number(leftValue) : (direction > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    const rightNumeric = Number.isFinite(Number(rightValue)) ? Number(rightValue) : (direction > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    if (rightNumeric !== leftNumeric) return direction * (leftNumeric - rightNumeric);
    if (right.displayNeed !== left.displayNeed) return right.displayNeed - left.displayNeed;
    if (right.displayOrders !== left.displayOrders) return right.displayOrders - left.displayOrders;
    return String(left.article || left.articleKey).localeCompare(String(right.article || right.articleKey), 'ru');
  });
}

function orderProcurementBuildCommentMap() {
  const comments = Array.isArray(state?.storage?.comments) ? state.storage.comments : [];
  const map = new Map();

  comments.forEach((entry) => {
    const articleKey = orderProcurementNormalizeKey(entry?.articleKey || entry?.article || entry?.sku);
    if (!articleKey) return;

    const rawText = typeof entry?.text === 'string'
      ? entry.text
      : (typeof entry?.comment === 'string' ? entry.comment : '');
    const text = rawText.replace(/\s+/g, ' ').trim();
    const author = String(entry?.author || entry?.owner || '').trim();
    const ts = Date.parse(entry?.updatedAt || entry?.createdAt || '') || 0;

    const current = map.get(articleKey) || {
      count: 0,
      latestText: '',
      latestAuthor: '',
      latestTs: -1
    };
    current.count += 1;
    if (ts >= current.latestTs || !current.latestText) {
      current.latestText = text;
      current.latestAuthor = author;
      current.latestTs = ts;
    }
    map.set(articleKey, current);
  });

  return map;
}

function buildOrderProcurementModel() {
  const orderState = ensureOrderProcurementState();
  const platform = ['ozon', 'ym'].includes(orderState.platform) ? orderState.platform : 'wb';
  const days = clampOrderProcurementDays(orderState.days);
  const searchQuery = String(orderState.search || '').trim().toLowerCase();
  const mode = String(orderState.mode || 'all');
  const sort = String(orderState.sort || 'recommended_desc');
  const clusterFilter = String(orderState.clusterFilter || 'all');
  const clusterDays = clampOrderProcurementDays(orderState.clusterDays || 30);
  const payload = orderProcurementCurrentPayload(platform) || { rows: [] };
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const skuLookup = orderProcurementBuildSkuLookup();
  const warehouseLookup = orderProcurementBuildWarehouseMap();
  const commentMap = orderProcurementBuildCommentMap();
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
    const commentMeta = commentMap.get(articleKey) || { count: 0, latestText: '', latestAuthor: '' };
    const productLifecycle = orderProcurementLifecycleForSku(sku, row, articleKey);
    const lifecycleSignal = orderProcurementLifecycleSignal(productLifecycle);
    const orderBlockedByLifecycle = orderProcurementLifecycleBlocksOrder(productLifecycle);
    const baseSignals = orderProcurementBuildSkuSignals(sku, platform);
    const signals = lifecycleSignal ? [lifecycleSignal, ...baseSignals] : baseSignals;
    const current = rowMap.get(articleKey) || {
      article,
      articleKey,
      name: sku?.name || row?.name || article,
      owner: orderProcurementOwnerForPlatform(sku, row, platform),
      productLifecycle,
      orderBlockedByLifecycle,
      warehouseStock: orderProcurementNumber(warehouse.stockWarehouse),
      inboundWarehouse: orderProcurementNumber(warehouse.inboundWarehouse),
      acceptedFromSupplier: orderProcurementNumber(warehouse.accepted),
      shippedFromWarehouse: platform === 'ozon'
        ? orderProcurementNumber(warehouse.shippedOzon)
        : (platform === 'wb' ? orderProcurementNumber(warehouse.shippedWB) : 0),
      hasInboundWarehouse: Boolean(warehouse.hasInboundWarehouse),
      totalNeed: 0,
      rawTotalNeed: 0,
      blockedNeed: 0,
      totalOrders: 0,
      totalInTransit: 0,
      totalInRequest: 0,
      commentCount: orderProcurementNumber(commentMeta.count),
      latestCommentPreview: String(commentMeta.latestText || '').slice(0, 180),
      latestCommentAuthor: String(commentMeta.latestAuthor || ''),
      signals,
      clusters: {}
    };

    const clusterOrders = orderProcurementOrdersForDays(row, days);
    const rawClusterNeed = orderProcurementNeedForDays(row, days);
    const clusterNeed = orderBlockedByLifecycle ? 0 : rawClusterNeed;
    const clusterInTransit = orderProcurementNumber(row?.inTransit);
    const clusterInRequest = orderProcurementNumber(row?.inRequest);
    const cluster = {
      mpStock: orderProcurementNumber(row?.inStock),
      orders: clusterOrders,
      turnover: orderProcurementSafeTurnover(row),
      need: clusterNeed,
      rawNeed: rawClusterNeed,
      blockedNeed: orderBlockedByLifecycle ? rawClusterNeed : 0,
      inTransit: clusterInTransit,
      inRequest: clusterInRequest
    };
    cluster.flags = orderProcurementClusterFlags(cluster, clusterDays);
    cluster.matchesClusterFilter = orderProcurementClusterMatchesFilter(cluster, clusterFilter, clusterDays);

    current.totalNeed += clusterNeed;
    current.rawTotalNeed += rawClusterNeed;
    current.blockedNeed += cluster.blockedNeed;
    current.totalOrders += clusterOrders;
    current.totalInTransit += clusterInTransit;
    current.totalInRequest += clusterInRequest;
    current.clusters[place] = cluster;
    rowMap.set(articleKey, current);

    const clusterTotal = clusterTotalsMap.get(place) || {
      mpStock: 0,
      orders: 0,
      need: 0,
      risk: 0,
      shortTurnover: 0,
      noStock: 0,
      inMotion: 0,
      matched: 0,
      matchedMpStock: 0,
      matchedOrders: 0,
      matchedNeed: 0
    };
    clusterTotal.mpStock += cluster.mpStock;
    clusterTotal.orders += cluster.orders;
    clusterTotal.need += cluster.need;
    if (cluster.flags.risk) clusterTotal.risk += 1;
    if (cluster.flags.shortTurnover) clusterTotal.shortTurnover += 1;
    if (cluster.flags.noStock) clusterTotal.noStock += 1;
    if (cluster.flags.inMotion) clusterTotal.inMotion += 1;
    if (cluster.matchesClusterFilter) {
      clusterTotal.matched += 1;
      clusterTotal.matchedMpStock += cluster.mpStock;
      clusterTotal.matchedOrders += cluster.orders;
      clusterTotal.matchedNeed += cluster.need;
    }
    clusterTotalsMap.set(place, clusterTotal);
  });

  const requestedPlace = String(orderState.place || 'all').trim() || 'all';
  const requestedPlaceSelection = orderProcurementUnique([
    ...(Array.isArray(orderState.placeSelection) ? orderState.placeSelection : []),
    ...(requestedPlace !== 'all' ? [requestedPlace] : [])
  ]
    .map((place) => String(place || '').trim())
    .filter((place) => place && place !== 'all'));
  const selectedPlaces = requestedPlaceSelection.filter((place) => placeSeen.has(place));
  const selectedPlaceSet = new Set(selectedPlaces);
  const selectedPlace = selectedPlaces.length === 1 ? selectedPlaces[0] : 'all';
  const stateForSelection = ensureOrderProcurementState();
  stateForSelection.placeSelection = selectedPlaces;
  stateForSelection.place = selectedPlace;
  const visiblePlaces = placeOrder.filter((place) => {
    if (selectedPlaceSet.size && !selectedPlaceSet.has(place)) return false;
    if (clusterFilter !== 'all') {
      return orderProcurementNumber(clusterTotalsMap.get(place)?.matched) > 0;
    }
    return true;
  });
  const rowsWithMetrics = [...rowMap.values()].map((row) => {
    const activeClusters = visiblePlaces.map((place) => row.clusters[place]).filter(Boolean);
    const matchingClusters = activeClusters.filter((cluster) => orderProcurementClusterMatchesFilter(cluster, clusterFilter, clusterDays));
    const displayClusters = clusterFilter === 'all' ? activeClusters : matchingClusters;
    const displayNeed = displayClusters.reduce((acc, cluster) => acc + orderProcurementNumber(cluster.need), 0);
    const displayRawNeed = displayClusters.reduce((acc, cluster) => acc + orderProcurementNumber(cluster.rawNeed), 0);
    const displayBlockedNeed = displayClusters.reduce((acc, cluster) => acc + orderProcurementNumber(cluster.blockedNeed), 0);
    const displayOrders = displayClusters.reduce((acc, cluster) => acc + orderProcurementNumber(cluster.orders), 0);
    const displayMpStock = displayClusters.reduce((acc, cluster) => acc + orderProcurementNumber(cluster.mpStock), 0);
    const displayInTransit = displayClusters.reduce((acc, cluster) => acc + orderProcurementNumber(cluster.inTransit), 0);
    const displayInRequest = displayClusters.reduce((acc, cluster) => acc + orderProcurementNumber(cluster.inRequest), 0);
    const displayTurnover = orderProcurementAverage(displayClusters.map((cluster) => cluster.turnover));
    return {
      ...row,
      displayNeed,
      displayRawNeed,
      displayBlockedNeed,
      displayOrders,
      displayMpStock,
      displayInTransit,
      displayInRequest,
      displayTurnover,
      clusterMatchCount: matchingClusters.length,
      hasSelectedPlace: !selectedPlaceSet.size || activeClusters.length > 0
    };
  });
  const allRows = rowsWithMetrics.filter((row) => row.hasSelectedPlace);
  const filteredRows = allRows
    .filter((row) => {
      const searchIndex = [
        row.article,
        row.articleKey,
        row.name,
        row.owner,
        row.productLifecycle?.label,
        row.productLifecycle?.reason,
        row.productLifecycle?.source,
        row.latestCommentPreview,
        row.latestCommentAuthor,
        ...(row.signals || []).map((item) => item.label)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return !searchQuery || searchIndex.includes(searchQuery);
    })
    .filter((row) => {
      if (mode === 'recommended') return orderProcurementNumber(row.displayNeed) > 0;
      if (mode === 'local') return orderProcurementNumber(row.displayInRequest) > 0;
      if (mode === 'supplier') return orderProcurementNumber(row.acceptedFromSupplier) > 0;
      if (mode === 'warehouse') {
        return orderProcurementNumber(row.shippedFromWarehouse) > 0 || orderProcurementNumber(row.displayInTransit) > 0;
      }
      if (mode === 'signals') return Array.isArray(row.signals) && row.signals.length > 0;
      return true;
    })
    .filter((row) => {
      if (clusterFilter === 'all') return true;
      return orderProcurementNumber(row.clusterMatchCount) > 0;
    });
  const list = orderProcurementSortRows(filteredRows, sort);
  const hasInboundWarehouse = allRows.some((row) => Boolean(row.hasInboundWarehouse));
  const displayPlaces = clusterFilter === 'all'
    ? visiblePlaces
    : visiblePlaces.filter((place) => list.some((row) => orderProcurementClusterMatchesFilter(row.clusters[place], clusterFilter, clusterDays)));

  const totals = list.reduce((acc, row) => {
    acc.warehouseStock += orderProcurementNumber(row.warehouseStock);
    acc.inboundWarehouse += orderProcurementNumber(row.inboundWarehouse);
    acc.acceptedFromSupplier += orderProcurementNumber(row.acceptedFromSupplier);
    acc.shippedFromWarehouse += orderProcurementNumber(row.shippedFromWarehouse);
    acc.displayInTransit += orderProcurementNumber(row.displayInTransit);
    acc.displayInRequest += orderProcurementNumber(row.displayInRequest);
    acc.totalNeed += orderProcurementNumber(row.displayNeed);
    acc.blockedNeed += orderProcurementNumber(row.displayBlockedNeed);
    return acc;
  }, {
    warehouseStock: 0,
    inboundWarehouse: 0,
    acceptedFromSupplier: 0,
    shippedFromWarehouse: 0,
    displayInTransit: 0,
    displayInRequest: 0,
    totalNeed: 0,
    blockedNeed: 0
  });
  const commentsCount = list.reduce((acc, row) => acc + orderProcurementNumber(row.commentCount), 0);
  const lifecycleBlockedRows = list.filter((row) => Boolean(row.orderBlockedByLifecycle)).length;
  const clusterTotalDefaults = { mpStock: 0, orders: 0, need: 0, risk: 0, shortTurnover: 0, noStock: 0, inMotion: 0, matched: 0, matchedMpStock: 0, matchedOrders: 0, matchedNeed: 0 };
  const displayClusterTotal = (place) => {
    const total = clusterTotalsMap.get(place) || clusterTotalDefaults;
    if (clusterFilter === 'all') return { place, ...clusterTotalDefaults, ...total };
    return {
      place,
      ...clusterTotalDefaults,
      ...total,
      mpStock: orderProcurementNumber(total.matchedMpStock),
      orders: orderProcurementNumber(total.matchedOrders),
      need: orderProcurementNumber(total.matchedNeed),
      risk: orderProcurementNumber(total.matched)
    };
  };

  return {
    platform,
    platformLabel: platform === 'ozon' ? 'OZ' : (platform === 'ym' ? 'YM' : 'WB'),
    days,
    searchQuery,
    mode,
    sort,
    clusterFilter,
    clusterDays,
    selectedPlace,
    generatedAt: payload.generatedAt || ORDER_PROCUREMENT_RUNTIME.cache.warehouse?.generatedAt || null,
    window: payload.window || null,
    places: displayPlaces,
    allPlaces: placeOrder,
    hiddenPlaceCount: Math.max(0, placeOrder.length - displayPlaces.length),
    selectedPlaces,
    rows: list,
    totalRows: allRows.length,
    commentsCount,
    lifecycleBlockedRows,
    lifecycleBlockedNeed: totals.blockedNeed,
    hasInboundWarehouse,
    totals,
    allClusterTotals: placeOrder.map(displayClusterTotal),
    clusterTotals: displayPlaces.map(displayClusterTotal)
  };
}

function exportOrderProcurementCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function exportOrderProcurementModel(model) {
  const headers = [
    'SKU',
    'Остатки мой склад'
  ];
  if (model.hasInboundWarehouse) headers.push('В пути на склад');
  headers.push(
    'Статус товара',
    'Заблокировано статусом',
    'Итого заказ товара',
    'Локальные заказы',
    'Едет от поставщика',
    'Едет от склада',
    'Сигналы'
  );

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
      row.article,
      row.warehouseStock
    ];
    if (model.hasInboundWarehouse) cells.push(row.inboundWarehouse);
    cells.push(
      row.productLifecycle?.label || row.productLifecycle?.status || '',
      row.displayBlockedNeed || 0,
      row.displayNeed,
      row.displayInRequest,
      row.acceptedFromSupplier,
      orderProcurementNumber(row.shippedFromWarehouse) + orderProcurementNumber(row.displayInTransit),
      (row.signals || []).map((item) => item.label).join(', ')
    );

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

const ORDER_PROCUREMENT_MODE_OPTIONS = [
  ['all', 'Все строки'],
  ['recommended', 'Только рекомендовано'],
  ['local', 'Локальные заказы'],
  ['supplier', 'Едет от поставщика'],
  ['warehouse', 'Едет от склада'],
  ['signals', 'КЗ / акция / снижение']
];

const ORDER_PROCUREMENT_SORT_OPTIONS = [
  ['recommended_desc', 'Рекомендовано: больше сверху'],
  ['warehouse_desc', 'Мой склад: больше сверху'],
  ['warehouse_asc', 'Мой склад: меньше сверху'],
  ['turnover_asc', 'Оборачиваемость: ниже сверху'],
  ['turnover_desc', 'Оборачиваемость: выше сверху'],
  ['local_desc', 'Локальные заказы: больше сверху'],
  ['supplier_desc', 'Едет от поставщика: больше сверху'],
  ['inbound_desc', 'Едет от склада: больше сверху'],
  ['sku_asc', 'SKU: А-Я']
];

const ORDER_PROCUREMENT_CLUSTER_FILTER_OPTIONS = [
  ['all', 'Все кластеры'],
  ['risk', 'Проблемные кластеры'],
  ['turnover_lt', 'Оборачиваемость ниже порога'],
  ['low_stock', 'Товар заканчивается'],
  ['need', 'Есть рек. к заказу'],
  ['no_stock', 'Остаток MP = 0'],
  ['in_motion', 'Едет / уже заказано']
];

const ORDER_PROCUREMENT_FILTER_PRESETS = [
  { id: 'all', label: 'Все склады', filter: 'all', days: 30, mode: 'all' },
  { id: 'risk10', label: 'Проблемные до 10 дн.', filter: 'risk', days: 10, mode: 'all' },
  { id: 'low10', label: 'Закончится до 10 дн.', filter: 'low_stock', days: 10, mode: 'all' },
  { id: 'need', label: 'Есть заказ', filter: 'need', days: 30, mode: 'recommended' },
  { id: 'zero', label: 'Остаток MP = 0', filter: 'no_stock', days: 30, mode: 'all' }
];

function renderOrderProcurementOptions(options, selected) {
  return options.map(([value, label]) => (
    `<option value="${orderProcurementEscape(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${orderProcurementEscape(label)}</option>`
  )).join('');
}

function orderProcurementActivePreset(model) {
  return ORDER_PROCUREMENT_FILTER_PRESETS.find((preset) => (
    String(preset.filter) === String(model.clusterFilter || 'all')
    && Number(preset.days) === Number(model.clusterDays || 30)
    && (preset.mode === undefined || String(preset.mode) === String(model.mode || 'all'))
  ))?.id || '';
}

function renderOrderProcurementFilterPresets(model) {
  const active = orderProcurementActivePreset(model);
  return `
    <div class="altea-order-procurement__preset-row" aria-label="Быстрые фильтры складов">
      ${ORDER_PROCUREMENT_FILTER_PRESETS.map((preset) => `
        <button type="button" class="altea-order-procurement__preset ${active === preset.id ? 'is-active' : ''}" data-altea-order-preset="${orderProcurementEscape(preset.id)}">
          ${orderProcurementEscape(preset.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function renderOrderProcurementPlaceOptions(model) {
  const places = Array.isArray(model.allPlaces) ? model.allPlaces : [];
  return [
    `<option value="all" ${model.selectedPlace === 'all' ? 'selected' : ''}>Все склады / кластеры</option>`,
    ...places.map((place) => `<option value="${orderProcurementEscape(place)}" ${place === model.selectedPlace ? 'selected' : ''}>${orderProcurementEscape(place)}</option>`)
  ].join('');
}

function renderOrderProcurementPlaceChips(model) {
  const sourcePlaces = model.clusterFilter === 'all' ? model.allPlaces : model.places;
  const places = Array.isArray(sourcePlaces) ? sourcePlaces : [];
  if (!places.length) return '';
  const selected = new Set(Array.isArray(model.selectedPlaces) ? model.selectedPlaces : []);
  const allActive = selected.size === 0;
  const allLabel = model.clusterFilter === 'all' ? 'Все' : 'Все проблемные';
  const allButton = `
    <button type="button" class="altea-order-procurement__place-chip ${allActive ? 'is-active' : ''}" data-altea-order-place-chip="all">
      ${allLabel}
    </button>
  `;
  const totalsByPlace = new Map((model.allClusterTotals || []).map((cluster) => [cluster.place, cluster]));
  const placeButtons = places.map((place) => {
    const stats = totalsByPlace.get(place) || {};
    const isActive = selected.has(place);
    return `
      <button type="button" class="altea-order-procurement__place-chip ${isActive ? 'is-active' : ''}" data-altea-order-place-chip="${orderProcurementEscape(place)}">
        <span>${orderProcurementEscape(place)}</span>
        <small>${fmt.int(stats.need || 0)}</small>
      </button>
    `;
  }).join('');

  return `
    <div class="altea-order-procurement__place-filter" aria-label="Склады">
      ${allButton}
      ${placeButtons}
    </div>
  `;
}

function renderOrderProcurementClusterSummary(model) {
  if (!model.clusterTotals.length) return '';
  return `
    <div class="altea-order-procurement__cluster-strip">
      ${model.clusterTotals.map((cluster) => `
        <div class="altea-order-procurement__cluster-card ${cluster.matched > 0 && model.clusterFilter !== 'all' ? 'is-match' : ''} ${cluster.noStock > 0 ? 'is-danger' : (cluster.risk > 0 ? 'is-warn' : '')}">
          <span>${orderProcurementEscape(cluster.place)}</span>
          <strong>${fmt.int(cluster.need)}</strong>
          <small>к заказу · ${fmt.int(cluster.mpStock)} на MP</small>
          <div class="altea-order-procurement__cluster-signals">
            ${cluster.risk ? orderProcurementBadge(`${fmt.int(cluster.risk)} проблем`, cluster.noStock ? 'danger' : 'warn') : orderProcurementBadge('без критики', 'ok')}
            ${cluster.shortTurnover ? orderProcurementBadge(`< ${fmt.int(model.clusterDays)} дн.: ${fmt.int(cluster.shortTurnover)}`, 'warn') : ''}
            ${cluster.inMotion ? orderProcurementBadge(`едет: ${fmt.int(cluster.inMotion)}`, 'info') : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderOrderProcurementTable(model) {
  const headGroups = model.places
    .map((place) => {
      const stats = (model.clusterTotals || []).find((cluster) => cluster.place === place) || {};
      const headClass = stats.matched > 0 && model.clusterFilter !== 'all' ? ' is-match' : (stats.risk > 0 ? ' is-warn' : '');
      const hint = model.clusterFilter !== 'all' && stats.matched > 0 ? ` · ${fmt.int(stats.matched)} совп.` : '';
      return `<th colspan="4" class="altea-order-procurement__cluster-head${headClass}">${orderProcurementEscape(place)}${hint}</th>`;
    })
    .join('');

  const headMetrics = model.places
    .map(() => `
      <th>Остаток MP</th>
      <th>Заказы</th>
      <th>Оборачиваемость</th>
      <th>Рек. к заказу</th>
    `)
    .join('');

  const columnCount = (model.hasInboundWarehouse ? 9 : 8) + (model.places.length * 4);
  const body = model.rows.length
    ? model.rows.map((row) => {
        const clusterCells = model.places.map((place) => {
          const cluster = row.clusters[place] || {};
          const isMatch = model.clusterFilter === 'all' || orderProcurementClusterMatchesFilter(cluster, model.clusterFilter, model.clusterDays);
          const tone = orderProcurementClusterTone(cluster, model.clusterFilter);
          const cellClass = [
            'altea-order-procurement__cluster-cell',
            tone ? `is-${tone}` : '',
            isMatch && model.clusterFilter !== 'all' ? 'is-match' : '',
            !isMatch && model.clusterFilter !== 'all' ? 'is-muted' : ''
          ].filter(Boolean).join(' ');
          if (model.clusterFilter !== 'all' && !isMatch) {
            return `
              <td class="${cellClass} altea-order-procurement__num">—</td>
              <td class="${cellClass} altea-order-procurement__num">—</td>
              <td class="${cellClass}">—</td>
              <td class="${cellClass}">—</td>
            `;
          }
          const blockedNote = orderProcurementNumber(cluster.blockedNeed) > 0
            ? `<div class="altea-order-procurement__cluster-note">статус блок: ${fmt.int(cluster.blockedNeed)}</div>`
            : '';
          return `
            <td class="${cellClass} altea-order-procurement__num">${fmt.int(cluster.mpStock)}</td>
            <td class="${cellClass} altea-order-procurement__num">${fmt.int(cluster.orders)}</td>
            <td class="${cellClass}">${orderProcurementTurnoverBadge(cluster.turnover)}${cluster?.flags?.label ? `<div class="altea-order-procurement__cluster-note">${orderProcurementEscape(cluster.flags.label)}</div>` : ''}</td>
            <td class="${cellClass}">${orderProcurementBadge(fmt.int(cluster.need), cluster.need > 0 ? 'warn' : 'ok')}${blockedNote}</td>
          `;
        }).join('');

        const articleLabel = row.article || row.articleKey;
        const skuLink = typeof linkToSku === 'function'
          ? linkToSku(row.articleKey || articleLabel, articleLabel)
          : orderProcurementEscape(articleLabel);
        const inboundCell = model.hasInboundWarehouse
          ? `<td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--inbound altea-order-procurement__num">${fmt.int(row.inboundWarehouse)}</td>`
          : '';
        const commentPreview = row.latestCommentPreview
          ? `${row.latestCommentAuthor ? `${row.latestCommentAuthor}: ` : ''}${row.latestCommentPreview}`
          : 'Комментариев пока нет';
        const movementFromWarehouse = orderProcurementNumber(row.shippedFromWarehouse) + orderProcurementNumber(row.displayInTransit);
        const lifecycleBadge = row.productLifecycle?.key && row.productLifecycle.key !== 'active'
          ? orderProcurementBadge(`Статус: ${row.productLifecycle.label || row.productLifecycle.status || row.productLifecycle.key}`, row.productLifecycle.tone || 'warn')
          : '';
        const lifecycleBlockBadge = orderProcurementNumber(row.displayBlockedNeed) > 0
          ? orderProcurementBadge(`заблокировано ${fmt.int(row.displayBlockedNeed)}`, 'danger')
          : '';
        const signals = Array.isArray(row.signals) && row.signals.length
          ? row.signals.map((item) => orderProcurementBadge(item.label, item.tone || 'info')).join('')
          : orderProcurementBadge('нет', '');

        return `
          <tr data-lifecycle-key="${orderProcurementEscape(row.productLifecycle?.key || 'active')}" data-order-lifecycle-block="${row.orderBlockedByLifecycle ? '1' : '0'}">
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--sku">
              <strong>${skuLink}</strong>
              <div class="altea-order-procurement__meta">${orderProcurementEscape(row.owner || 'Без owner')}</div>
              <div class="altea-order-procurement__meta altea-order-procurement__comment-preview">${orderProcurementEscape(commentPreview)}</div>
              <div class="altea-order-procurement__row-actions">
                <button type="button" class="quick-chip" data-altea-order-comment="${orderProcurementEscape(row.articleKey || articleLabel)}" data-altea-order-comment-title="${orderProcurementEscape(articleLabel)}">Комментарий</button>
                ${orderProcurementBadge(`C: ${fmt.int(row.commentCount)}`, row.commentCount ? 'info' : '')}
                ${lifecycleBadge}
                ${lifecycleBlockBadge}
              </div>
            </td>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--article">${orderProcurementEscape(row.owner || 'Без owner')}</td>
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--warehouse altea-order-procurement__num">${fmt.int(row.warehouseStock)}</td>
            ${inboundCell}
            <td class="altea-order-procurement__sticky-cell altea-order-procurement__sticky-cell--total">${orderProcurementBadge(fmt.int(row.displayNeed), row.displayNeed > 0 ? 'warn' : 'ok')}</td>
            <td class="altea-order-procurement__num">${fmt.int(row.displayInRequest)}</td>
            <td class="altea-order-procurement__num">${fmt.int(row.acceptedFromSupplier)}</td>
            <td class="altea-order-procurement__num">${fmt.int(movementFromWarehouse)}</td>
            <td class="altea-order-procurement__signals">${signals}</td>
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
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--sku">SKU</th>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--article">Owner</th>
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--warehouse">Остатки мой склад</th>
            ${model.hasInboundWarehouse ? '<th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--inbound">В пути на склад</th>' : ''}
            <th rowspan="2" class="altea-order-procurement__sticky-head altea-order-procurement__sticky-head--total">Итого заказ товара</th>
            <th rowspan="2">Локальные заказы</th>
            <th rowspan="2">Едет от поставщика</th>
            <th rowspan="2">Едет от склада</th>
            <th rowspan="2">КЗ / акция / цена</th>
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
  const buildLabel = `ORDER BUILD ${window.__ALTEA_PORTAL_BUILD__ || '20260507g'}`;
  const range = model.window?.from && model.window?.to
    ? `${orderProcurementEscape(model.window.from)} - ${orderProcurementEscape(model.window.to)}`
    : 'последний доступный срез';
  const sectionClass = model.hasInboundWarehouse
    ? 'imperial-section altea-order-procurement'
    : 'imperial-section altea-order-procurement altea-order-procurement--no-inbound';
  const shownRows = model.totalRows > model.rows.length
    ? `${fmt.int(model.rows.length)} / ${fmt.int(model.totalRows)}`
    : `${fmt.int(model.rows.length)}`;
  const inboundSummary = model.hasInboundWarehouse ? `
        <div class="mini-kpi">
          <span>В пути на склад</span>
          <strong>${fmt.int(model.totals.inboundWarehouse)}</strong>
          <span>из входящего слоя склада</span>
        </div>
  ` : '';
  const inboundBadge = model.hasInboundWarehouse
    ? orderProcurementBadge('Входящий слой: учтён', 'ok')
    : orderProcurementBadge('Входящий слой: отдельного поля нет', 'info');
  const inboundCaption = model.hasInboundWarehouse
    ? 'Колонка "В пути на склад" заполняется из входящего слоя склада.'
    : 'Во входящем слое склада сейчас нет отдельного inbound-поля, поэтому таблица показывает остаток центрального склада и расчёт потребности по кластерам.';
  const activeModeLabel = (ORDER_PROCUREMENT_MODE_OPTIONS.find(([value]) => value === model.mode) || ORDER_PROCUREMENT_MODE_OPTIONS[0])[1];
  const activeSortLabel = (ORDER_PROCUREMENT_SORT_OPTIONS.find(([value]) => value === model.sort) || ORDER_PROCUREMENT_SORT_OPTIONS[0])[1];
  const activeClusterFilterLabel = (ORDER_PROCUREMENT_CLUSTER_FILTER_OPTIONS.find(([value]) => value === model.clusterFilter) || ORDER_PROCUREMENT_CLUSTER_FILTER_OPTIONS[0])[1];
  const clusterRiskCount = model.clusterTotals.reduce((acc, cluster) => acc + orderProcurementNumber(cluster.risk), 0);
  const clusterMatchCount = model.clusterTotals.reduce((acc, cluster) => acc + orderProcurementNumber(cluster.matched), 0);
  const visibleClusterSignalCount = model.clusterFilter === 'all' ? clusterRiskCount : clusterMatchCount;
  const selectedPlaceCount = Array.isArray(model.selectedPlaces) ? model.selectedPlaces.length : 0;
  const activePlaceLabel = selectedPlaceCount > 1
    ? `${fmt.int(selectedPlaceCount)} складов`
    : (selectedPlaceCount === 1 ? model.selectedPlaces[0] : 'Все склады');

  return `
    <section class="${sectionClass}" data-altea-order-procurement data-lifecycle-blocked-rows="${orderProcurementEscape(model.lifecycleBlockedRows || 0)}" data-lifecycle-blocked-need="${orderProcurementEscape(model.lifecycleBlockedNeed || 0)}">
      <div class="card">
        <div class="section-title">
          <div>
            <h2>Заказ товара по кластерам</h2>
            <p>Рабочая форма закупщика: слева центральный склад, справа кластеры площадки, ниже готовая рекомендация по заказу на каждый кластер.</p>
          </div>
          <div class="badge-stack">
            ${orderProcurementBadge(buildLabel, 'ok')}
            ${orderProcurementBadge(`Площадка: ${model.platformLabel}`, `platform-badge platform-${model.platform}`)}
            ${orderProcurementBadge(`Оборачиваемость: ${model.days} дн.`, 'info')}
            ${orderProcurementBadge(`Срез: ${range}`, 'info')}
          </div>
        </div>

        <div class="altea-order-procurement__toolbar">
          <label class="altea-order-procurement__field">
            <span>Оборачиваемость, дней</span>
            <input id="alteaOrderTargetDays" type="number" min="1" max="180" step="1" value="${orderProcurementEscape(model.days)}">
          </label>

          <div class="altea-order-procurement__field altea-order-procurement__field--platform">
            <span>Площадка</span>
            <div class="altea-order-procurement__platforms">
              <button type="button" class="altea-order-procurement__platform-btn ${model.platform === 'wb' ? 'is-active' : ''}" data-altea-order-platform="wb">WB</button>
              <button type="button" class="altea-order-procurement__platform-btn ${model.platform === 'ozon' ? 'is-active' : ''}" data-altea-order-platform="ozon">OZ</button>
              <button type="button" class="altea-order-procurement__platform-btn ${model.platform === 'ym' ? 'is-active' : ''}" data-altea-order-platform="ym">YM</button>
            </div>
          </div>

          <label class="altea-order-procurement__field">
            <span>Склад / кластер</span>
            <select id="alteaOrderPlace">${renderOrderProcurementPlaceOptions(model)}</select>
          </label>

          ${renderOrderProcurementPlaceChips(model)}

          <label class="altea-order-procurement__field">
            <span>Фильтр</span>
            <select id="alteaOrderMode">${renderOrderProcurementOptions(ORDER_PROCUREMENT_MODE_OPTIONS, model.mode)}</select>
          </label>

          <label class="altea-order-procurement__field">
            <span>Сортировка</span>
            <select id="alteaOrderSort">${renderOrderProcurementOptions(ORDER_PROCUREMENT_SORT_OPTIONS, model.sort)}</select>
          </label>

          <label class="altea-order-procurement__field">
            <span>Проблема по кластеру</span>
            <select id="alteaOrderClusterFilter">${renderOrderProcurementOptions(ORDER_PROCUREMENT_CLUSTER_FILTER_OPTIONS, model.clusterFilter)}</select>
          </label>

          <label class="altea-order-procurement__field">
            <span>Порог, дней</span>
            <input id="alteaOrderClusterDays" type="number" min="1" max="180" step="1" value="${orderProcurementEscape(model.clusterDays)}">
          </label>

          ${renderOrderProcurementFilterPresets(model)}

          <div class="badge-stack">
            ${model.lifecycleBlockedRows ? orderProcurementBadge(`статус-блок: ${fmt.int(model.lifecycleBlockedRows)}`, 'danger') : ''}
            ${orderProcurementBadge(`SKU: ${fmt.int(model.rows.length)}`, model.rows.length ? 'ok' : 'warn')}
            ${orderProcurementBadge(`Кластеры: ${fmt.int(model.places.length)}`, model.places.length ? 'ok' : 'warn')}
            ${orderProcurementBadge(`сигналы: ${fmt.int(visibleClusterSignalCount)}`, visibleClusterSignalCount ? 'warn' : 'info')}
            ${model.hiddenPlaceCount ? orderProcurementBadge(`скрыто складов: ${fmt.int(model.hiddenPlaceCount)}`, 'warn') : ''}
            ${orderProcurementBadge(`Обновлено: ${orderProcurementFormatDateTime(model.generatedAt)}`, 'info')}
          </div>

          <label class="altea-order-procurement__field altea-order-procurement__field--search">
            <span>Поиск</span>
            <input id="alteaOrderSearch" type="search" placeholder="SKU, артикул, owner, комментарий" value="${orderProcurementEscape(model.searchQuery || '')}">
          </label>

          <div class="altea-order-procurement__actions">
            <button type="button" class="quick-chip" data-altea-order-search-clear>Сброс</button>
            <button type="button" class="btn" data-altea-order-export>Выгрузить в Excel</button>
          </div>
        </div>
      </div>

      <details class="card altea-order-procurement__collapse">
        <summary>
          <span>Сводка и склады</span>
          <span class="badge-stack">
            ${orderProcurementBadge(activePlaceLabel, 'info')}
            ${orderProcurementBadge(activeModeLabel, 'info')}
            ${orderProcurementBadge(activeSortLabel, 'info')}
            ${orderProcurementBadge(`${activeClusterFilterLabel} · ${fmt.int(model.clusterDays)} дн.`, model.clusterFilter === 'all' ? 'info' : 'warn')}
          </span>
        </summary>

        <div class="altea-order-procurement__summary">
          <div class="mini-kpi">
            <span>SKU в расчёте</span>
            <strong>${shownRows}</strong>
            <span>${model.platformLabel}</span>
          </div>
          <div class="mini-kpi">
            <span>Остаток мой склад</span>
            <strong>${fmt.int(model.totals.warehouseStock)}</strong>
            <span>из файла реальных остатков</span>
          </div>
          ${inboundSummary}
          <div class="mini-kpi">
            <span>Локальные заказы</span>
            <strong>${fmt.int(model.totals.displayInRequest)}</strong>
            <span>по текущему фильтру</span>
          </div>
          <div class="mini-kpi">
            <span>Едет от поставщика</span>
            <strong>${fmt.int(model.totals.acceptedFromSupplier)}</strong>
            <span>принято / в пути по складскому слою</span>
          </div>
          <div class="mini-kpi">
            <span>Едет от склада</span>
            <strong>${fmt.int(model.totals.shippedFromWarehouse + model.totals.displayInTransit)}</strong>
            <span>по выбранной площадке</span>
          </div>
          <div class="mini-kpi">
            <span>Комментарии</span>
            <strong>${fmt.int(model.commentsCount)}</strong>
            <span>по текущему фильтру</span>
          </div>
          <div class="mini-kpi ${clusterRiskCount ? 'warn' : ''}">
            <span>Проблемы по кластерам</span>
            <strong>${fmt.int(clusterRiskCount)}</strong>
            <span>${model.clusterFilter === 'all' ? 'все сигнальные ячейки' : `совпало с фильтром: ${fmt.int(clusterMatchCount)}`}</span>
          </div>
          <div class="mini-kpi ${model.lifecycleBlockedNeed ? 'warn' : ''}">
            <span>Блок статуса</span>
            <strong>${fmt.int(model.lifecycleBlockedNeed || 0)}</strong>
            <span>${fmt.int(model.lifecycleBlockedRows || 0)} SKU не идут в автозаказ</span>
          </div>
          <div class="mini-kpi warn">
            <span>Итого к заказу</span>
            <strong>${fmt.int(model.totals.totalNeed)}</strong>
            <span>сумма по выбранному складу / всем кластерам</span>
          </div>
        </div>

        ${renderOrderProcurementClusterSummary(model)}
      </details>

      <div class="card altea-order-procurement__table-card">
        <div class="section-subhead">
          <div>
            <h3>Таблица заказа</h3>
            <p class="small muted">Слева фиксированные колонки по SKU и складу, справа блоки кластеров выбранной площадки: остатки MP, заказы, оборачиваемость и рекомендованный заказ.</p>
          </div>
          <div class="badge-stack">
            ${orderProcurementBadge(`Период расчёта: ${model.days} дн.`, 'info')}
            ${inboundBadge}
          </div>
        </div>

        ${renderOrderProcurementTable(model)}

        <div class="altea-order-procurement__caption">
          ${inboundCaption}
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
      const orderState = ensureOrderProcurementState();
      orderState.platform = ['ozon', 'ym'].includes(button.dataset.alteaOrderPlatform) ? button.dataset.alteaOrderPlatform : 'wb';
      orderState.place = 'all';
      orderState.placeSelection = [];
      renderOrderCalculator();
    });
  });

  root.querySelector('#alteaOrderTargetDays')?.addEventListener('change', (event) => {
    ensureOrderProcurementState().days = clampOrderProcurementDays(event.target.value);
    renderOrderCalculator();
  });

  root.querySelector('#alteaOrderPlace')?.addEventListener('change', (event) => {
    const orderState = ensureOrderProcurementState();
    const place = String(event.target.value || 'all').trim() || 'all';
    orderState.place = place;
    orderState.placeSelection = place === 'all' ? [] : [place];
    renderOrderCalculator();
  });

  root.querySelectorAll('[data-altea-order-place-chip]').forEach((button) => {
    button.addEventListener('click', () => {
      const orderState = ensureOrderProcurementState();
      const place = String(button.dataset.alteaOrderPlaceChip || 'all').trim() || 'all';
      if (place === 'all') {
        orderState.place = 'all';
        orderState.placeSelection = [];
        renderOrderCalculator();
        return;
      }

      const selected = new Set(Array.isArray(orderState.placeSelection) ? orderState.placeSelection : []);
      if (selected.has(place)) selected.delete(place);
      else selected.add(place);
      orderState.placeSelection = [...selected];
      orderState.place = orderState.placeSelection.length === 1 ? orderState.placeSelection[0] : 'all';
      renderOrderCalculator();
    });
  });

  root.querySelector('#alteaOrderMode')?.addEventListener('change', (event) => {
    ensureOrderProcurementState().mode = String(event.target.value || 'all');
    renderOrderCalculator();
  });

  root.querySelector('#alteaOrderSort')?.addEventListener('change', (event) => {
    ensureOrderProcurementState().sort = String(event.target.value || 'recommended_desc');
    renderOrderCalculator();
  });

  root.querySelectorAll('[data-altea-order-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = ORDER_PROCUREMENT_FILTER_PRESETS.find((item) => item.id === String(button.dataset.alteaOrderPreset || ''));
      if (!preset) return;
      const orderState = ensureOrderProcurementState();
      orderState.clusterFilter = preset.filter || 'all';
      orderState.clusterDays = clampOrderProcurementDays(preset.days || 30);
      if (preset.mode) orderState.mode = preset.mode;
      renderOrderCalculator();
    });
  });

  root.querySelector('#alteaOrderClusterFilter')?.addEventListener('change', (event) => {
    ensureOrderProcurementState().clusterFilter = String(event.target.value || 'all');
    renderOrderCalculator();
  });

  root.querySelector('#alteaOrderClusterDays')?.addEventListener('change', (event) => {
    ensureOrderProcurementState().clusterDays = clampOrderProcurementDays(event.target.value || 30);
    renderOrderCalculator();
  });

  root.querySelector('#alteaOrderSearch')?.addEventListener('input', (event) => {
    ensureOrderProcurementState().search = String(event.target.value || '').trim();
    if (ORDER_PROCUREMENT_RUNTIME.searchDebounceTimer) {
      window.clearTimeout(ORDER_PROCUREMENT_RUNTIME.searchDebounceTimer);
    }
    ORDER_PROCUREMENT_RUNTIME.searchDebounceTimer = window.setTimeout(() => {
      ORDER_PROCUREMENT_RUNTIME.searchDebounceTimer = 0;
      renderOrderCalculator();
    }, 130);
  });

  root.querySelector('[data-altea-order-search-clear]')?.addEventListener('click', () => {
    const orderState = ensureOrderProcurementState();
    orderState.search = '';
    orderState.place = 'all';
    orderState.placeSelection = [];
    orderState.mode = 'all';
    orderState.sort = 'recommended_desc';
    orderState.clusterFilter = 'all';
    orderState.clusterDays = 30;
    renderOrderCalculator();
  });

  root.querySelectorAll('[data-altea-order-comment]').forEach((button) => {
    button.addEventListener('click', async () => {
      const articleKeyRaw = String(button.dataset.alteaOrderComment || '').trim();
      const articleTitle = String(button.dataset.alteaOrderCommentTitle || articleKeyRaw || '').trim();
      const articleKey = orderProcurementNormalizeKey(articleKeyRaw);
      if (!articleKey) return;

      const text = window.prompt(`Комментарий по SKU: ${articleTitle}`, '');
      if (!text || !String(text).trim()) return;
      if (typeof createComment !== 'function') {
        setAppError('Контур комментариев сейчас недоступен.');
        window.setTimeout(() => setAppError(''), 1800);
        return;
      }

      try {
        await createComment({
          articleKey,
          author: state?.team?.member?.name || '',
          team: typeof teamMemberLabel === 'function' ? teamMemberLabel() : '',
          type: 'comment',
          text: String(text).trim()
        });
        setAppError('Комментарий сохранен.');
        window.setTimeout(() => setAppError(''), 1400);
        renderOrderCalculator();
      } catch (error) {
        console.error('[order-procurement] comment', error);
        setAppError('Не удалось сохранить комментарий.');
      }
    });
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
      --col-sku: 280px;
      --col-article: 132px;
      --col-warehouse: 132px;
      --col-inbound: 132px;
      --col-total: 148px;
      display: grid;
      gap: 14px;
      width: 100%;
      margin-top: 18px;
    }

    .altea-order-procurement.altea-order-procurement--no-inbound {
      --col-inbound: 0px;
    }

    .altea-order-procurement__toolbar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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

    .altea-order-procurement__field input,
    .altea-order-procurement__field select {
      width: 100%;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(212, 164, 74, 0.18);
      background: rgba(17, 14, 11, 0.96);
      color: #fff1dd;
    }

    .altea-order-procurement__field select {
      min-height: 42px;
      cursor: pointer;
    }

    .altea-order-procurement__field--search input {
      min-width: 220px;
    }

    .altea-order-procurement__preset-row {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .altea-order-procurement__preset {
      min-height: 34px;
      padding: 8px 11px;
      border-radius: 999px;
      border: 1px solid rgba(212, 164, 74, 0.18);
      background: rgba(18, 14, 10, 0.82);
      color: #fff1dd;
      font: inherit;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }

    .altea-order-procurement__preset:hover {
      transform: translateY(-1px);
      border-color: rgba(240, 196, 101, 0.46);
    }

    .altea-order-procurement__preset.is-active {
      border-color: rgba(240, 196, 101, 0.68);
      background: rgba(94, 68, 27, 0.74);
      box-shadow: inset 0 0 0 1px rgba(240, 196, 101, 0.14);
    }

    .altea-order-procurement__place-filter {
      grid-column: 1 / -1;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      max-height: 118px;
      overflow: auto;
      padding: 8px;
      border: 1px solid rgba(212, 164, 74, 0.14);
      border-radius: 14px;
      background: rgba(17, 14, 11, 0.68);
      scrollbar-gutter: stable;
    }

    .altea-order-procurement__place-chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      max-width: 240px;
      min-height: 34px;
      padding: 8px 11px;
      border-radius: 999px;
      border: 1px solid rgba(212, 164, 74, 0.20);
      background: rgba(18, 14, 10, 0.90);
      color: #fff1dd;
      font: inherit;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }

    .altea-order-procurement__place-chip span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .altea-order-procurement__place-chip small {
      flex: 0 0 auto;
      color: rgba(255, 244, 229, 0.58);
      font-size: 11px;
    }

    .altea-order-procurement__place-chip:hover {
      transform: translateY(-1px);
      border-color: rgba(240, 196, 101, 0.45);
    }

    .altea-order-procurement__place-chip.is-active {
      border-color: rgba(240, 196, 101, 0.62);
      background: rgba(94, 68, 27, 0.78);
      box-shadow: inset 0 0 0 1px rgba(240, 196, 101, 0.14);
    }

    .altea-order-procurement__actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }

    .altea-order-procurement__actions {
      justify-content: flex-end;
    }

    .altea-order-procurement__field--platform {
      min-width: 188px;
    }

    .altea-order-procurement__platforms {
      display: grid;
      grid-template-columns: repeat(3, minmax(48px, 1fr));
      gap: 7px;
      align-items: stretch;
      width: min(100%, 188px);
      max-width: 188px;
    }

    .altea-order-procurement__platform-btn {
      --order-platform-rgb: 212, 164, 74;
      display: inline-flex;
      min-width: 0;
      min-height: 40px;
      align-items: center;
      justify-content: center;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid rgba(var(--order-platform-rgb), 0.30);
      background:
        radial-gradient(circle at 28% 0, rgba(var(--order-platform-rgb), 0.16), transparent 34%),
        rgba(18, 14, 10, 0.92) !important;
      color: #fff1dd !important;
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.02em;
      white-space: nowrap;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }

    .altea-order-procurement__platform-btn[data-altea-order-platform="wb"] {
      --order-platform-rgb: 139, 92, 246;
    }

    .altea-order-procurement__platform-btn[data-altea-order-platform="ozon"] {
      --order-platform-rgb: 22, 131, 255;
    }

    .altea-order-procurement__platform-btn[data-altea-order-platform="ym"] {
      --order-platform-rgb: 244, 196, 48;
    }

    .altea-order-procurement__platform-btn:hover {
      transform: translateY(-1px);
      border-color: rgba(var(--order-platform-rgb), 0.58);
      background:
        radial-gradient(circle at 28% 0, rgba(var(--order-platform-rgb), 0.24), transparent 34%),
        rgba(24, 19, 14, 0.94) !important;
    }

    .altea-order-procurement__platform-btn.is-active {
      background:
        radial-gradient(circle at 24% 0, rgba(255, 255, 255, 0.22), transparent 32%),
        linear-gradient(180deg, rgba(var(--order-platform-rgb), 0.82), rgba(var(--order-platform-rgb), 0.40)) !important;
      border-color: rgba(var(--order-platform-rgb), 0.86) !important;
      color: #fff !important;
      text-shadow: 0 1px 10px rgba(0, 0, 0, 0.45);
      box-shadow: 0 14px 30px rgba(var(--order-platform-rgb), 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16);
    }

    body.v87-imperial.theme-sand-dark .altea-order-procurement .altea-order-procurement__platform-btn {
      background:
        radial-gradient(circle at 28% 0, rgba(var(--order-platform-rgb), 0.16), transparent 34%),
        rgba(18, 14, 10, 0.92) !important;
      color: #fff1dd !important;
    }

    body.v87-imperial.theme-sand-dark .altea-order-procurement .altea-order-procurement__platform-btn:hover {
      background:
        radial-gradient(circle at 28% 0, rgba(var(--order-platform-rgb), 0.24), transparent 34%),
        rgba(24, 19, 14, 0.94) !important;
    }

    body.v87-imperial.theme-sand-dark .altea-order-procurement .altea-order-procurement__platform-btn.is-active {
      background:
        radial-gradient(circle at 24% 0, rgba(255, 255, 255, 0.22), transparent 32%),
        linear-gradient(180deg, rgba(var(--order-platform-rgb), 0.82), rgba(var(--order-platform-rgb), 0.40)) !important;
      border-color: rgba(var(--order-platform-rgb), 0.86) !important;
      color: #fff !important;
    }

    body.v87-imperial.theme-sand-dark .altea-order-procurement .altea-order-procurement__platform-btn::before {
      content: none !important;
      display: none !important;
    }

    body.v87-imperial .altea-order-procurement .chip.platform-badge,
    .altea-order-procurement .chip.platform-badge {
      --order-platform-rgb: 212, 164, 74;
      background:
        radial-gradient(circle at 18% 0, rgba(255, 255, 255, 0.16), transparent 30%),
        linear-gradient(180deg, rgba(var(--order-platform-rgb), 0.28), rgba(18, 14, 10, 0.88)) !important;
      border-color: rgba(var(--order-platform-rgb), 0.58) !important;
      color: #fff7e8 !important;
      box-shadow: 0 10px 24px rgba(var(--order-platform-rgb), 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.10);
    }

    body.v87-imperial .altea-order-procurement .chip.platform-wb,
    .altea-order-procurement .chip.platform-wb {
      --order-platform-rgb: 139, 92, 246;
    }

    body.v87-imperial .altea-order-procurement .chip.platform-ozon,
    .altea-order-procurement .chip.platform-ozon {
      --order-platform-rgb: 22, 131, 255;
    }

    body.v87-imperial .altea-order-procurement .chip.platform-ym,
    .altea-order-procurement .chip.platform-ym {
      --order-platform-rgb: 244, 196, 48;
    }

    .altea-order-procurement__summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .altea-order-procurement__collapse {
      padding: 0;
      overflow: hidden;
    }

    .altea-order-procurement__collapse > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      cursor: pointer;
      color: #fff1dd;
      font-weight: 800;
      list-style: none;
    }

    .altea-order-procurement__collapse > summary::-webkit-details-marker {
      display: none;
    }

    .altea-order-procurement__collapse > summary::before {
      content: '+';
      display: inline-grid;
      place-items: center;
      width: 22px;
      height: 22px;
      margin-right: 8px;
      border-radius: 999px;
      border: 1px solid rgba(212, 164, 74, 0.30);
      color: #f0c465;
    }

    .altea-order-procurement__collapse[open] > summary::before {
      content: '−';
    }

    .altea-order-procurement__collapse .altea-order-procurement__summary,
    .altea-order-procurement__collapse .altea-order-procurement__cluster-strip {
      margin: 0 16px 16px;
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

    .altea-order-procurement__cluster-card.is-match,
    .altea-order-procurement__cluster-card.is-warn {
      border-color: rgba(240, 196, 101, 0.46);
      background:
        radial-gradient(circle at top right, rgba(240, 196, 101, 0.16), transparent 46%),
        rgba(25, 19, 12, 0.98);
    }

    .altea-order-procurement__cluster-card.is-danger {
      border-color: rgba(255, 104, 89, 0.50);
      background:
        radial-gradient(circle at top right, rgba(255, 104, 89, 0.16), transparent 46%),
        rgba(25, 14, 12, 0.98);
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

    .altea-order-procurement__cluster-signals {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }

    .altea-order-procurement__table-card {
      margin-left: -10px;
      margin-right: -10px;
      padding: 14px;
      overflow: hidden;
    }

    .altea-order-procurement__table-wrap {
      margin-top: 14px;
      overflow: auto;
      max-width: 100%;
      min-height: min(620px, calc(100vh - 260px));
      max-height: calc(100vh - 210px);
      border-radius: 18px;
      scrollbar-gutter: stable both-edges;
    }

    .altea-order-procurement__table {
      width: max-content;
      min-width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }

    .altea-order-procurement__table th,
    .altea-order-procurement__table td {
      padding: 10px 11px;
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

    .altea-order-procurement__cluster-head.is-match,
    .altea-order-procurement__cluster-head.is-warn {
      color: #ffe2a4;
      box-shadow: inset 0 -2px 0 rgba(240, 196, 101, 0.45);
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

    .altea-order-procurement__comment-preview {
      max-width: 280px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .altea-order-procurement__row-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      flex-wrap: wrap;
    }

    .altea-order-procurement__signals {
      min-width: 150px;
    }

    .altea-order-procurement__signals .chip {
      margin: 0 4px 4px 0;
      white-space: nowrap;
    }

    .altea-order-procurement__num {
      text-align: right;
      white-space: nowrap;
    }

    .altea-order-procurement__cluster-cell {
      min-width: 112px;
      transition: background 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
    }

    .altea-order-procurement__cluster-cell.is-warn,
    .altea-order-procurement__cluster-cell.is-match {
      background: rgba(240, 196, 101, 0.08);
      box-shadow: inset 0 0 0 1px rgba(240, 196, 101, 0.13);
    }

    .altea-order-procurement__cluster-cell.is-danger {
      background: rgba(255, 104, 89, 0.10);
      box-shadow: inset 0 0 0 1px rgba(255, 104, 89, 0.18);
    }

    .altea-order-procurement__cluster-cell.is-muted {
      opacity: 0.42;
    }

    .altea-order-procurement__cluster-note {
      margin-top: 5px;
      color: rgba(255, 244, 229, 0.58);
      font-size: 11px;
      line-height: 1.25;
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
        --col-sku: 230px;
        --col-article: 118px;
        --col-warehouse: 112px;
        --col-inbound: 112px;
        --col-total: 124px;
      }

      .altea-order-procurement__toolbar,
      .altea-order-procurement__summary {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}
