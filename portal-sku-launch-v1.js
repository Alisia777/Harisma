(function () {
  if (window.__ALTEA_SKU_LAUNCH_V1__) return;
  window.__ALTEA_SKU_LAUNCH_V1__ = true;

  const VERSION = '20260621skulaunchv1';
  const MARKET_LABELS = {
    all: 'Все площадки',
    wb: 'WB',
    ozon: 'Ozon',
    ya: 'Я.Маркет',
    ym: 'Я.Маркет',
    goldapple: 'ЗЯ',
    ga: 'ЗЯ',
    letu: "Л'Этуаль",
    magnit: 'Магнит'
  };
  const MARKET_ALIAS = {
    all: 'all',
    wb: 'wb',
    wildberries: 'wb',
    oz: 'ozon',
    ozon: 'ozon',
    ya: 'ya',
    ym: 'ya',
    yandex: 'ya',
    yandexmarket: 'ya',
    yamarket: 'ya',
    goldapple: 'goldapple',
    goldenapple: 'goldapple',
    ga: 'goldapple',
    zya: 'goldapple',
    letu: 'letu',
    letual: 'letu',
    magnit: 'magnit',
    magnitmarket: 'magnit'
  };
  const SKU_MODE_STORAGE = 'altea:sku-workspace-v1:mode';

  let originalRenderSkuContour = null;
  let originalRenderLaunches = null;
  let originalRenderLaunchControl = null;
  let installAttempts = 0;

  function appState() {
    try {
      return typeof state === 'object' && state ? state : window.state || {};
    } catch {
      return window.state || {};
    }
  }

  function escapeValue(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toNumber(value) {
    if (typeof numberOrZero === 'function') return numberOrZero(value);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatInt(value) {
    if (typeof fmt !== 'undefined' && fmt?.int) return fmt.int(value);
    return Math.round(toNumber(value)).toLocaleString('ru-RU');
  }

  function formatMoney(value) {
    if (typeof fmt !== 'undefined' && fmt?.money) return fmt.money(value);
    return `${Math.round(toNumber(value)).toLocaleString('ru-RU')} ₽`;
  }

  function formatPct(value) {
    if (typeof fmt !== 'undefined' && fmt?.pct) return fmt.pct(value);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    return `${(Math.abs(numeric) > 1 ? numeric : numeric * 100).toFixed(1)}%`;
  }

  function todayKey() {
    if (typeof todayIso === 'function') return todayIso();
    return new Date().toISOString().slice(0, 10);
  }

  function normalizeMarket(value) {
    const key = String(value || 'all').trim().toLowerCase().replace(/[\s_-]+/g, '');
    return MARKET_ALIAS[key] || (MARKET_LABELS[key] ? key : 'all');
  }

  function marketLabel(value) {
    const key = normalizeMarket(value);
    if (typeof skuDataPlatformLabel === 'function') return skuDataPlatformLabel(key);
    return MARKET_LABELS[key] || key.toUpperCase();
  }

  function readGlobalMarket() {
    const candidates = [
      document.documentElement?.dataset?.marketplace,
      document.body?.dataset?.marketplace,
      document.documentElement?.dataset?.platform,
      document.body?.dataset?.platform
    ];
    try {
      candidates.push(window.localStorage?.getItem('altea.portal.marketplace'));
    } catch {
      // localStorage can be unavailable in private contexts.
    }
    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined || String(candidate).trim() === '') continue;
      const normalized = normalizeMarket(candidate);
      if (normalized !== 'all' || String(candidate).trim().toLowerCase() === 'all') return normalized;
    }
    return 'all';
  }

  function setRegistryMarketFromHeader() {
    const stateRef = appState();
    stateRef.filters = stateRef.filters || {};
    const market = readGlobalMarket();
    stateRef.filters.market = market;
    return market;
  }

  function safeBadge(label, tone = '') {
    if (typeof badge === 'function') return badge(label, tone);
    return `<span class="chip ${escapeValue(tone)}">${escapeValue(label)}</span>`;
  }

  function skuBelongsToMarket(sku, market) {
    const key = normalizeMarket(market);
    if (key === 'all') return true;
    if (typeof skuDataSkuBelongsToPlatform === 'function') return skuDataSkuBelongsToPlatform(sku, key);
    if (typeof filterSkuByMarket === 'function') {
      const stateRef = appState();
      const previous = stateRef.filters?.market || 'all';
      stateRef.filters.market = key;
      try {
        return filterSkuByMarket(sku);
      } finally {
        stateRef.filters.market = previous;
      }
    }
    if (key === 'wb') return Boolean(sku?.flags?.hasWB);
    if (key === 'ozon') return Boolean(sku?.flags?.hasOzon);
    return true;
  }

  function skuOwner(sku, market = 'all') {
    if (typeof registryDisplayOwner === 'function') return registryDisplayOwner(sku, market);
    if (typeof ownerName === 'function') return ownerName(sku);
    return String(sku?.owner?.name || sku?.owner || '').trim();
  }

  function skuOwnersForFilter(sku, market = 'all') {
    if (typeof registryOwnersForFilter === 'function') return registryOwnersForFilter(sku, market);
    const owner = skuOwner(sku, market);
    return owner ? [owner] : [];
  }

  function skuLifecycle(sku) {
    if (typeof skuLifecycleMetaForRegistry === 'function') return skuLifecycleMetaForRegistry(sku);
    return sku?.productLifecycle || { key: 'active', label: sku?.status || 'Активный', tone: 'ok' };
  }

  function skuMatrixState(sku) {
    if (typeof skuMatrixProblemState === 'function') return skuMatrixProblemState(sku);
    return 'ok';
  }

  function skuMatrixLabel(stateKey) {
    if (typeof skuMatrixProblemMeta === 'function') return skuMatrixProblemMeta(stateKey)?.label || stateKey;
    return stateKey === 'ok' ? 'ok' : 'матрица';
  }

  function buildSkuTaskMap() {
    if (typeof buildSkuRegistryTaskMap === 'function') return buildSkuRegistryTaskMap();
    const map = new Map();
    if (typeof getAllTasks !== 'function') return map;
    getAllTasks().forEach((task) => {
      const key = String(task?.articleKey || '').trim();
      if (key && !map.has(key)) map.set(key, task);
    });
    return map;
  }

  function workLabel() {
    return typeof currentWorkLabel === 'function' ? currentWorkLabel() : 'в работе';
  }

  function skuReasons(sku, task, market) {
    if (typeof skuRegistryReasonList === 'function') return skuRegistryReasonList(sku, task, market);
    const reasons = [];
    if (!skuOwnersForFilter(sku, market).length) reasons.push({ label: 'нет owner', tone: 'danger', focus: 'unassigned', weight: 60 });
    const matrix = skuMatrixState(sku);
    if (matrix && matrix !== 'ok') reasons.push({ label: skuMatrixLabel(matrix), tone: 'warn', focus: 'matrixIssue', weight: 50 });
    if (sku?.flags?.underPlan) reasons.push({ label: 'ниже плана', tone: 'warn', focus: 'underPlan', weight: 38 });
    if (sku?.flags?.lowStock) reasons.push({ label: 'низкий остаток', tone: 'danger', focus: 'lowStock', weight: 36 });
    if (sku?.flags?.hasExternalTraffic) reasons.push({ label: 'внешний трафик', tone: 'info', focus: 'extAny', weight: 18 });
    if (sku?.flags?.toWork) reasons.push({ label: workLabel(), tone: 'info', focus: 'toWork', weight: 16 });
    return reasons;
  }

  function issueIsResolved(row) {
    return typeof skuContourIssueIsResolved === 'function' ? skuContourIssueIsResolved(row) : Boolean(row?.resolved);
  }

  function issuePlatformMatches(row, market) {
    const key = normalizeMarket(market);
    if (key === 'all') return true;
    if (typeof skuDataIssueMatchesPlatform === 'function') return skuDataIssueMatchesPlatform(row, key);
    return normalizeMarket(row?.platform) === key;
  }

  function issueTypeLabel(row) {
    if (typeof skuContourReadableIssueType === 'function') return skuContourReadableIssueType(row?.type || row?.status || '');
    return row?.type || row?.status || 'API без пары';
  }

  function issueTone(row) {
    const status = String(row?.status || '').toLowerCase();
    if (/block|quarantine|danger|critical/.test(status)) return 'danger';
    if (issueIsResolved(row)) return 'ok';
    if (/new|warn|missing|unmapped/.test(status)) return 'warn';
    return 'info';
  }

  function planModelForWorkspace(market = 'all') {
    if (typeof skuPlanFactBuildModel !== 'function') return {};
    const platform = normalizeMarket(market);
    const platformForPlan = platform === 'all' ? 'all' : platform;
    try {
      const base = typeof skuPlanFactFilters === 'function'
        ? skuPlanFactFilters({ platform: platformForPlan, search: '', owner: 'all', status: 'all' }, { persist: false })
        : { platform: platformForPlan, search: '', owner: 'all', status: 'all' };
      return skuPlanFactBuildModel(base, { persistFilters: false }) || {};
    } catch (error) {
      console.warn('[sku-launch-v1] plan model failed', error);
      return {};
    }
  }

  function displayMetric(row, model) {
    if (!row) return {};
    if (typeof skuPlanFactDisplayMetric === 'function') return skuPlanFactDisplayMetric(row, model);
    return row;
  }

  function buildPlanRowMap(model) {
    const map = new Map();
    const rows = Array.isArray(model?.allRows) ? model.allRows : Array.isArray(model?.rows) ? model.rows : [];
    rows.forEach((row) => {
      const key = String(row?.articleKey || row?.article || '').trim();
      if (key && !map.has(key)) map.set(key, row);
    });
    return map;
  }

  function ownerOptionsForSkus(skus, market) {
    return [...new Set(skus.flatMap((sku) => skuOwnersForFilter(sku, market)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'ru'));
  }

  function segmentOptionsForSkus(skus) {
    return [...new Set(skus.map((sku) => sku.segment || sku.category || '').filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'ru'));
  }

  function lifecycleOptionsForSkus(skus) {
    const map = new Map();
    skus.forEach((sku) => {
      const meta = skuLifecycle(sku);
      const key = meta?.key || 'active';
      if (!map.has(key)) map.set(key, { key, label: meta?.label || key, count: 0, tone: meta?.tone || '' });
      map.get(key).count += 1;
    });
    return [...map.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ru'));
  }

  function filteredRegistrySkus(sourceSkus, taskMap, market) {
    const stateRef = appState();
    const filters = stateRef.filters || {};
    const query = String(filters.search || '').trim().toLowerCase();
    const ownerFilter = String(filters.owner || 'all');
    const segmentFilter = String(filters.segment || 'all');
    const lifecycleFilter = String(filters.lifecycle || 'all');
    const assignment = String(filters.assignment || 'all');
    const traffic = String(filters.traffic || 'all');
    const focus = String(filters.focus || 'all');

    return sourceSkus.filter((sku) => {
      if (!skuBelongsToMarket(sku, market)) return false;
      const lifecycle = skuLifecycle(sku);
      const owners = skuOwnersForFilter(sku, market);
      const matrix = skuMatrixState(sku);
      const task = taskMap.get(String(sku.articleKey || '').trim()) || null;
      const reasons = skuReasons(sku, task, market);
      const haystack = [
        sku.article,
        sku.articleKey,
        sku.name,
        sku.brand,
        sku.category,
        sku.segment,
        sku.status,
        lifecycle?.label,
        skuOwner(sku, market),
        ...owners,
        skuMatrixLabel(matrix)
      ].filter(Boolean).join(' ').toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (ownerFilter !== 'all' && !owners.includes(ownerFilter)) return false;
      if (segmentFilter !== 'all' && sku.segment !== segmentFilter && sku.category !== segmentFilter) return false;
      if (lifecycleFilter !== 'all' && (lifecycle?.key || 'active') !== lifecycleFilter) return false;
      if (assignment === 'assigned' && !owners.length) return false;
      if (assignment === 'unassigned' && owners.length) return false;
      if (traffic === 'any' && !sku?.flags?.hasExternalTraffic) return false;
      if (traffic === 'kz' && !sku?.flags?.hasKZ) return false;
      if (traffic === 'vk' && !sku?.flags?.hasVK) return false;
      if (traffic === 'none' && sku?.flags?.hasExternalTraffic) return false;
      if (focus !== 'all') {
        const reasonMatch = reasons.some((reason) => reason.focus === focus);
        if (!reasonMatch) return false;
      }
      return true;
    }).sort((left, right) => {
      const leftTask = taskMap.get(String(left.articleKey || '').trim()) || null;
      const rightTask = taskMap.get(String(right.articleKey || '').trim()) || null;
      const score = (sku) => {
        const task = taskMap.get(String(sku.articleKey || '').trim()) || null;
        return skuReasons(sku, task, market).reduce((sum, item) => sum + toNumber(item.weight), 0) + toNumber(sku?.focusScore || 0);
      };
      return score(right) - score(left)
        || Number(Boolean(rightTask)) - Number(Boolean(leftTask))
        || String(left.article || left.articleKey || '').localeCompare(String(right.article || right.articleKey || ''), 'ru');
    });
  }

  function skuStatusCards(allSkus, visibleSkus, issueRows, model, market) {
    const assigned = allSkus.filter((sku) => skuOwnersForFilter(sku, market).length).length;
    const ownerCoverage = allSkus.length ? assigned / allSkus.length : null;
    const unresolved = issueRows.filter((row) => !issueIsResolved(row));
    const apiRiskRevenue = unresolved.reduce((sum, row) => sum + toNumber(row.revenue || row.factRevenue || 0), 0);
    const matrixIssues = allSkus.filter((sku) => {
      const matrix = skuMatrixState(sku);
      return matrix && matrix !== 'ok';
    }).length;
    const lowStock = allSkus.filter((sku) => sku?.flags?.lowStock).length;
    const underPlan = allSkus.filter((sku) => sku?.flags?.underPlan).length;
    const inWork = allSkus.filter((sku) => {
      if (typeof filterSkuByWorkLogic === 'function') return filterSkuByWorkLogic(sku);
      return sku?.flags?.toWork || sku?.flags?.toWorkWB || sku?.flags?.toWorkOzon;
    }).length;
    return [
      { label: 'SKU в реестре', value: formatInt(allSkus.length), hint: `${formatInt(visibleSkus.length)} в текущем срезе`, tone: '' },
      { label: 'Owner coverage', value: ownerCoverage === null ? '—' : formatPct(ownerCoverage), hint: `${formatInt(assigned)} закреплено`, tone: ownerCoverage !== null && ownerCoverage >= 0.92 ? 'ok' : 'warn' },
      { label: 'API без пары', value: formatInt(unresolved.length), hint: `${formatMoney(apiRiskRevenue)} риск`, tone: unresolved.length ? 'danger' : 'ok' },
      { label: 'API вне реестра', value: formatInt(issueRows.filter((row) => /unmapped|api/i.test(String(row.type || row.status || ''))).length), hint: 'из контура качества', tone: unresolved.length ? 'warn' : 'ok' },
      { label: 'Ниже плана', value: formatInt(underPlan), hint: 'SKU требуют внимания', tone: underPlan ? 'warn' : 'ok' },
      { label: 'Низкий остаток', value: formatInt(lowStock), hint: 'строки склада', tone: lowStock ? 'danger' : 'ok' },
      { label: 'Матрица', value: formatInt(matrixIssues), hint: 'alias / owner / дубли', tone: matrixIssues ? 'warn' : 'ok' },
      { label: 'В работе', value: formatInt(inWork), hint: workLabel(), tone: inWork ? 'info' : '' }
    ];
  }

  function renderSkuModeSwitch(activeMode) {
    return `
      <div class="sl-v1-segment" role="tablist" aria-label="Режим SKU workspace">
        ${[
          ['registry', 'Реестр'],
          ['api', 'API-контур'],
          ['planfact', 'План-факт']
        ].map(([key, label]) => `
          <button type="button" class="${activeMode === key ? 'active' : ''}" data-sku-v1-mode="${key}" role="tab" aria-selected="${activeMode === key ? 'true' : 'false'}">${escapeValue(label)}</button>
        `).join('')}
      </div>
    `;
  }

  function renderSkuFilters({ owners, segments, lifecycles, activeMode, activeMarket }) {
    const stateRef = appState();
    const filters = stateRef.filters || {};
    return `
      <section class="sl-v1-filter-dock">
        <div class="sl-v1-filter-head">
          <div>
            <span>Фильтры и представления</span>
            <strong>${activeMode === 'api' ? 'API-контур' : 'Реестр SKU'}</strong>
          </div>
          <div class="sl-v1-market-note">
            <i></i>
            <span>Площадка: ${escapeValue(marketLabel(activeMarket))}</span>
          </div>
        </div>
        <div class="sl-v1-filter-grid">
          <label class="sl-v1-control sl-v1-search">
            <span>Поиск</span>
            <input id="skuV1Search" value="${escapeValue(filters.search || '')}" placeholder="Артикул, SKU, owner...">
          </label>
          <label class="sl-v1-control">
            <span>Owner</span>
            <select id="skuV1Owner">
              <option value="all">Все owner</option>
              ${owners.map((owner) => `<option value="${escapeValue(owner)}" ${filters.owner === owner ? 'selected' : ''}>${escapeValue(owner)}</option>`).join('')}
            </select>
          </label>
          <label class="sl-v1-control">
            <span>${activeMode === 'api' ? 'Тип проблемы' : 'Статус товара'}</span>
            <select id="skuV1Lifecycle" ${activeMode === 'api' ? 'disabled' : ''}>
              <option value="all">Все статусы</option>
              ${lifecycles.map((item) => `<option value="${escapeValue(item.key)}" ${filters.lifecycle === item.key ? 'selected' : ''}>${escapeValue(item.label)} · ${formatInt(item.count)}</option>`).join('')}
            </select>
          </label>
          <label class="sl-v1-control">
            <span>Сегмент</span>
            <select id="skuV1Segment">
              <option value="all">Все сегменты</option>
              ${segments.map((segment) => `<option value="${escapeValue(segment)}" ${filters.segment === segment ? 'selected' : ''}>${escapeValue(segment)}</option>`).join('')}
            </select>
          </label>
          <label class="sl-v1-control">
            <span>Фокус</span>
            <select id="skuV1Focus">
              <option value="all" ${filters.focus === 'all' ? 'selected' : ''}>Все SKU</option>
              <option value="unassigned" ${filters.focus === 'unassigned' ? 'selected' : ''}>Без owner</option>
              <option value="matrixIssue" ${filters.focus === 'matrixIssue' ? 'selected' : ''}>Матрица</option>
              <option value="underPlan" ${filters.focus === 'underPlan' ? 'selected' : ''}>Ниже плана</option>
              <option value="lowStock" ${filters.focus === 'lowStock' ? 'selected' : ''}>Низкий остаток</option>
              <option value="toWork" ${filters.focus === 'toWork' ? 'selected' : ''}>${escapeValue(workLabel())}</option>
              <option value="extAny" ${filters.focus === 'extAny' ? 'selected' : ''}>Внешний трафик</option>
            </select>
          </label>
          <label class="sl-v1-control">
            <span>Трафик</span>
            <select id="skuV1Traffic">
              <option value="all" ${filters.traffic === 'all' ? 'selected' : ''}>Весь трафик</option>
              <option value="any" ${filters.traffic === 'any' ? 'selected' : ''}>Есть внешний</option>
              <option value="kz" ${filters.traffic === 'kz' ? 'selected' : ''}>КЗ</option>
              <option value="vk" ${filters.traffic === 'vk' ? 'selected' : ''}>VK</option>
              <option value="none" ${filters.traffic === 'none' ? 'selected' : ''}>Без внешнего</option>
            </select>
          </label>
          <label class="sl-v1-control">
            <span>Закрепление</span>
            <select id="skuV1Assignment">
              <option value="all" ${filters.assignment === 'all' ? 'selected' : ''}>Все</option>
              <option value="assigned" ${filters.assignment === 'assigned' ? 'selected' : ''}>С owner</option>
              <option value="unassigned" ${filters.assignment === 'unassigned' ? 'selected' : ''}>Без owner</option>
            </select>
          </label>
          <div class="sl-v1-filter-actions">
            <button type="button" data-sku-v1-reset>Сброс</button>
            <button type="button" data-sku-v1-columns>Колонки</button>
          </div>
        </div>
        <div class="sl-v1-chip-row" aria-label="Активные фильтры">
          ${activeMarket !== 'all' ? `<button type="button" disabled>Площадка: ${escapeValue(marketLabel(activeMarket))}</button>` : ''}
          ${filters.owner && filters.owner !== 'all' ? `<button type="button" disabled>Owner: ${escapeValue(filters.owner)}</button>` : ''}
          ${filters.focus && filters.focus !== 'all' ? `<button type="button" disabled>Фокус: ${escapeValue(filters.focus)}</button>` : ''}
          ${filters.traffic && filters.traffic !== 'all' ? `<button type="button" disabled>Трафик: ${escapeValue(filters.traffic)}</button>` : ''}
          ${filters.assignment && filters.assignment !== 'all' ? `<button type="button" disabled>${escapeValue(filters.assignment)}</button>` : ''}
        </div>
      </section>
    `;
  }

  function renderSkuAttentionQueue(skus, issueRows, taskMap, planMap, model, market) {
    const issueItems = issueRows
      .filter((row) => !issueIsResolved(row))
      .slice(0, 5)
      .map((row) => ({
        tone: issueTone(row),
        platform: row.platform || market,
        title: row.apiSku || row.articleKey || row.article || 'API SKU',
        subtitle: row.name || issueTypeLabel(row),
        reason: issueTypeLabel(row),
        value: row.revenue ? formatMoney(row.revenue) : `${formatInt(row.units || 0)} шт.`,
        action: row.action || 'связать с каноническим SKU',
        articleKey: row.articleKey || row.targetSku || ''
      }));
    const skuItems = skus
      .map((sku) => {
        const task = taskMap.get(String(sku.articleKey || '').trim()) || null;
        const reasons = skuReasons(sku, task, market);
        const metric = displayMetric(planMap.get(String(sku.articleKey || '').trim()), model);
        return {
          sku,
          reasons,
          score: reasons.reduce((sum, item) => sum + toNumber(item.weight), 0),
          metric
        };
      })
      .filter((item) => item.reasons.length)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(0, 7 - issueItems.length))
      .map((item) => ({
        tone: item.reasons[0]?.tone || 'warn',
        platform: market,
        title: item.sku.article || item.sku.articleKey || 'SKU',
        subtitle: item.sku.name || item.sku.category || 'без названия',
        reason: item.reasons[0]?.label || 'фокус',
        value: item.metric?.gapToDate ? formatMoney(item.metric.gapToDate) : skuOwner(item.sku, market) || 'без owner',
        action: item.metric?.completionToDate !== null && item.metric?.completionToDate !== undefined ? formatPct(item.metric.completionToDate) : 'проверить',
        articleKey: item.sku.articleKey || ''
      }));
    const items = [...issueItems, ...skuItems];
    return `
      <section class="sl-v1-panel sl-v1-queue">
        <div class="sl-v1-panel-head">
          <div>
            <span>Быстрый фокус</span>
            <h3>Очередь на сегодня</h3>
          </div>
          ${safeBadge(`${formatInt(items.length)} приоритетов`, items.length ? 'warn' : 'ok')}
        </div>
        <div class="sl-v1-queue-list">
          ${items.map((item) => `
            <button type="button" class="sl-v1-queue-row ${escapeValue(item.tone)}" ${item.articleKey ? `data-open-sku="${escapeValue(item.articleKey)}"` : ''}>
              <i></i>
              <span>
                <em>${escapeValue(marketLabel(item.platform))} · ${escapeValue(item.reason)}</em>
                <strong>${escapeValue(item.title)}</strong>
                <small>${escapeValue(item.subtitle)}</small>
              </span>
              <b>${escapeValue(item.value || '')}</b>
              <small>${escapeValue(item.action || '')}</small>
            </button>
          `).join('') || '<div class="sl-v1-empty">Критичных SKU по текущему срезу не видно.</div>'}
        </div>
      </section>
    `;
  }

  function renderSkuQualityContour(cards, issueRows, model) {
    const quality = appState().portalDataQuality?.summary || model?.quality || {};
    const sourceReady = appState().syncHealth?.status || appState().syncHealth?.publish?.status || '';
    const checks = [
      { label: 'Источник', value: sourceReady ? 'готово' : 'нет статуса', tone: sourceReady ? 'ok' : 'warn', hint: 'данные синхронизации' },
      { label: 'Канонический SKU', value: issueRows.filter((row) => !issueIsResolved(row)).length ? `${formatInt(issueRows.filter((row) => !issueIsResolved(row)).length)} без пары` : 'чисто', tone: issueRows.some((row) => !issueIsResolved(row)) ? 'danger' : 'ok', hint: 'alias / ignore' },
      { label: 'Реестр / owner', value: cards[1]?.value || '—', tone: cards[1]?.tone || '', hint: 'покрытие ответственных' },
      { label: 'Матрица', value: cards.find((item) => item.label === 'Матрица')?.value || '—', tone: cards.find((item) => item.label === 'Матрица')?.tone || '', hint: 'дубли и связи' },
      { label: 'План-факт', value: cards.find((item) => item.label === 'Ниже плана')?.value || '—', tone: cards.find((item) => item.label === 'Ниже плана')?.tone || '', hint: 'позиции ниже темпа' },
      { label: 'Свежесть', value: quality.maxDate || appState().dashboard?.dataFreshness?.asOfDate || '—', tone: quality.maxDate ? 'ok' : '', hint: 'факт/API' }
    ];
    return `
      <section class="sl-v1-panel sl-v1-quality">
        <div class="sl-v1-panel-head">
          <div>
            <span>Контур качества данных</span>
            <h3>Без технического шума</h3>
          </div>
        </div>
        <div class="sl-v1-quality-list">
          ${checks.map((item, index) => `
            <div class="sl-v1-quality-row ${escapeValue(item.tone || '')}">
              <span>${index + 1}. ${escapeValue(item.label)}</span>
              <strong>${escapeValue(item.value)}</strong>
              <em>${escapeValue(item.hint)}</em>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderSkuTableRows(skus, taskMap, planMap, model, market) {
    return skus.map((sku) => {
      const articleKey = String(sku.articleKey || sku.article || '').trim();
      const lifecycle = skuLifecycle(sku);
      const owner = skuOwner(sku, market) || 'без owner';
      const task = taskMap.get(articleKey) || null;
      const planRow = planMap.get(articleKey);
      const metric = displayMetric(planRow, model);
      const matrix = skuMatrixState(sku);
      const stock = typeof totalSkuStock === 'function' ? totalSkuStock(sku) : sku?.stock ?? sku?.stockTotal ?? null;
      const platforms = [
        sku?.flags?.hasWB ? 'WB' : '',
        sku?.flags?.hasOzon ? 'Ozon' : '',
        sku?.ownersByPlatform?.ym || sku?.ownersByPlatform?.ya ? 'Я.Маркет' : '',
        sku?.ownersByPlatform?.ga ? 'ЗЯ' : '',
        sku?.ownersByPlatform?.letu ? "Л'Этуаль" : '',
        sku?.ownersByPlatform?.mm ? 'Магнит' : ''
      ].filter(Boolean);
      const reasons = skuReasons(sku, task, market);
      return `
        <tr class="sl-v1-table-row" data-open-sku="${escapeValue(articleKey)}">
          <td>
            <button type="button" class="sl-v1-link" data-open-sku="${escapeValue(articleKey)}">${escapeValue(sku.article || articleKey || 'SKU')}</button>
            <small>${escapeValue(articleKey)}</small>
          </td>
          <td><strong>${escapeValue(sku.name || 'Без названия')}</strong><small>${escapeValue(sku.category || sku.segment || '—')}</small></td>
          <td>${escapeValue(owner)}<small>${escapeValue(lifecycle?.label || sku.status || '—')}</small></td>
          <td><div class="sl-v1-platform-tags">${platforms.slice(0, 5).map((item) => `<span>${escapeValue(item)}</span>`).join('') || '<span>—</span>'}</div></td>
          <td>${metric?.completionToDate !== null && metric?.completionToDate !== undefined ? formatPct(metric.completionToDate) : '—'}<small>${metric?.factRevenue ? formatMoney(metric.factRevenue) : 'факт —'}</small></td>
          <td>${metric?.marginPct !== null && metric?.marginPct !== undefined ? formatPct(metric.marginPct) : '—'}<small>${metric?.marginRub ? formatMoney(metric.marginRub) : 'маржа —'}</small></td>
          <td>${stock !== null && stock !== undefined ? formatInt(stock) : '—'}<small>${metric?.turnoverDays ? `${formatInt(metric.turnoverDays)} дн.` : 'остаток'}</small></td>
          <td>${matrix && matrix !== 'ok' ? safeBadge(skuMatrixLabel(matrix), 'warn') : safeBadge('ok', 'ok')}<small>${reasons.slice(0, 2).map((item) => escapeValue(item.label)).join(' · ') || 'без сигнала'}</small></td>
          <td>${task ? escapeValue(task.title || task.nextAction || 'задача') : '—'}<small>${escapeValue(task?.due || '')}</small></td>
        </tr>
      `;
    }).join('');
  }

  function renderSkuRegistryV1(root, context) {
    const { activeMarket, sourceSkus, visibleSkus, issueRows, taskMap, planMap, model } = context;
    const cards = skuStatusCards(sourceSkus, visibleSkus, issueRows, model, activeMarket);
    return `
      ${renderSkuFilters(context)}
      <section class="sl-v1-kpis">
        ${cards.slice(0, 6).map((item) => `
          <article class="sl-v1-kpi ${escapeValue(item.tone || '')}">
            <span>${escapeValue(item.label)}</span>
            <strong>${escapeValue(item.value)}</strong>
            <em>${escapeValue(item.hint || '')}</em>
          </article>
        `).join('')}
      </section>
      <section class="sl-v1-focus-grid">
        <section class="sl-v1-panel sl-v1-buckets">
          <div class="sl-v1-panel-head">
            <div><span>Быстрый фокус</span><h3>Что держит контур</h3></div>
          </div>
          <div class="sl-v1-bucket-grid">
            ${cards.slice(2).map((item) => `
              <button type="button" class="sl-v1-bucket ${escapeValue(item.tone || '')}" data-sku-v1-focus="${escapeValue(item.label === 'API без пары' ? 'api' : item.label === 'Матрица' ? 'matrixIssue' : item.label === 'Ниже плана' ? 'underPlan' : item.label === 'Низкий остаток' ? 'lowStock' : item.label === 'В работе' ? 'toWork' : 'all')}">
                <strong>${escapeValue(item.value)}</strong>
                <span>${escapeValue(item.label)}</span>
                <em>${escapeValue(item.hint)}</em>
              </button>
            `).join('')}
          </div>
        </section>
        ${renderSkuAttentionQueue(visibleSkus, issueRows, taskMap, planMap, model, activeMarket)}
        ${renderSkuQualityContour(cards, issueRows, model)}
      </section>
      <section class="sl-v1-panel sl-v1-table-panel">
        <div class="sl-v1-panel-head">
          <div>
            <span>Полная таблица</span>
            <h3>Рабочие строки SKU</h3>
          </div>
          ${safeBadge(`${formatInt(visibleSkus.length)} строк`, visibleSkus.length ? 'info' : 'warn')}
        </div>
        <div class="sl-v1-table-wrap">
          <table class="sl-v1-table">
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Карточка</th>
                <th>Owner / статус</th>
                <th>Площадки</th>
                <th>План-факт</th>
                <th>Маржа</th>
                <th>Остаток</th>
                <th>Качество</th>
                <th>Следующее действие</th>
              </tr>
            </thead>
            <tbody>${renderSkuTableRows(visibleSkus, taskMap, planMap, model, activeMarket) || '<tr><td colspan="9"><div class="sl-v1-empty">По текущему срезу SKU не найдены.</div></td></tr>'}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderApiContourV1(root, context) {
    const { activeMarket, issueRows, model, sourceSkus } = context;
    const showResolved = Boolean(appState().skuContourShowResolved);
    const onlyNew = Boolean(appState().skuContourOnlyNew);
    let rows = showResolved ? issueRows : issueRows.filter((row) => !issueIsResolved(row));
    if (onlyNew) rows = rows.filter((row) => String(row.status || '').toLowerCase() === 'new');
    const unresolved = issueRows.filter((row) => !issueIsResolved(row));
    const byType = new Map();
    issueRows.forEach((row) => {
      const key = issueTypeLabel(row);
      byType.set(key, (byType.get(key) || 0) + 1);
    });
    const cards = [
      { label: 'Нерешенные', value: unresolved.length, tone: unresolved.length ? 'danger' : 'ok', hint: 'alias / ignore / связка' },
      { label: 'Новые', value: issueRows.filter((row) => String(row.status || '').toLowerCase() === 'new').length, tone: 'warn', hint: 'требуют решения' },
      { label: 'Выручка риска', value: formatMoney(unresolved.reduce((sum, row) => sum + toNumber(row.revenue), 0)), tone: unresolved.length ? 'danger' : 'ok', hint: 'неразобранная API-сумма' },
      { label: 'SKU в реестре', value: sourceSkus.length, tone: '', hint: marketLabel(activeMarket) },
      { label: 'Типов проблем', value: byType.size, tone: byType.size ? 'warn' : 'ok', hint: 'без дублей в первом экране' }
    ];
    return `
      ${renderSkuFilters(context)}
      <section class="sl-v1-kpis">
        ${cards.map((item) => `
          <article class="sl-v1-kpi ${escapeValue(item.tone || '')}">
            <span>${escapeValue(item.label)}</span>
            <strong>${escapeValue(item.value)}</strong>
            <em>${escapeValue(item.hint || '')}</em>
          </article>
        `).join('')}
      </section>
      <section class="sl-v1-panel sl-v1-api-panel">
        <div class="sl-v1-panel-head">
          <div>
            <span>Очередь API</span>
            <h3>Разбор без витринного шума</h3>
          </div>
          <div class="sl-v1-inline-actions">
            <button type="button" class="${onlyNew ? 'active' : ''}" data-sku-v1-toggle-new>Только новые</button>
            <button type="button" class="${showResolved ? 'active' : ''}" data-sku-v1-toggle-resolved>С решенными</button>
            <button type="button" data-sku-v1-quality-export>Форма разбора</button>
          </div>
        </div>
        <div class="sl-v1-table-wrap">
          <table class="sl-v1-table sl-v1-api-table">
            <thead>
              <tr>
                <th>Статус</th>
                <th>Проблема</th>
                <th>Площадка</th>
                <th>API / SKU</th>
                <th>Сумма</th>
                <th>Следующий шаг</th>
              </tr>
            </thead>
            <tbody>
              ${rows.slice(0, 220).map((row) => {
                const history = typeof skuContourAuditForRow === 'function' && typeof skuContourAuditIndex === 'function'
                  ? skuContourAuditForRow(row, skuContourAuditIndex())
                  : null;
                const nextAction = typeof skuContourRowNextActionHtml === 'function'
                  ? skuContourRowNextActionHtml(row, history)
                  : escapeValue(row.action || 'разобрать');
                return `
                  <tr>
                    <td>${safeBadge(row.status || 'new', issueTone(row))}</td>
                    <td><strong>${escapeValue(issueTypeLabel(row))}</strong><small>${escapeValue(row.action || row.type || '')}</small></td>
                    <td>${escapeValue(marketLabel(row.platform || activeMarket))}</td>
                    <td><strong>${escapeValue(row.apiSku || row.articleKey || '—')}</strong><small>${escapeValue(row.name || row.targetSku || '')}</small></td>
                    <td>${formatMoney(row.revenue || 0)}<small>${formatInt(row.units || 0)} шт.</small></td>
                    <td>${nextAction}</td>
                  </tr>
                `;
              }).join('') || '<tr><td colspan="6"><div class="sl-v1-empty">API-контур по текущему срезу чист.</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
      ${renderSkuQualityContour(skuStatusCards(sourceSkus, sourceSkus, issueRows, model, activeMarket), issueRows, model)}
    `;
  }

  function currentSkuMode() {
    const stateRef = appState();
    if (stateRef.skuWorkspaceMode === 'registry') return 'registry';
    if (stateRef.skuWorkspaceMode === 'contour') return 'api';
    try {
      const stored = sessionStorage.getItem(SKU_MODE_STORAGE);
      if (stored === 'registry' || stored === 'api') return stored;
    } catch {
      // ignored
    }
    return 'registry';
  }

  function setSkuMode(mode) {
    const stateRef = appState();
    const next = mode === 'api' ? 'api' : 'registry';
    stateRef.skuWorkspaceMode = next === 'api' ? 'contour' : 'registry';
    try {
      sessionStorage.setItem(SKU_MODE_STORAGE, next);
    } catch {
      // ignored
    }
  }

  function renderSkuWorkspaceV1(rootId = 'view-sku-contour') {
    const root = document.getElementById(rootId);
    if (!root) return;
    const activeMarket = setRegistryMarketFromHeader();
    const stateRef = appState();
    stateRef.filters = stateRef.filters || {};
    stateRef.filters.lifecycle = stateRef.filters.lifecycle || 'all';
    stateRef.filters.owner = stateRef.filters.owner || 'all';
    stateRef.filters.segment = stateRef.filters.segment || 'all';
    stateRef.filters.focus = stateRef.filters.focus || 'all';
    stateRef.filters.traffic = stateRef.filters.traffic || 'all';
    stateRef.filters.assignment = stateRef.filters.assignment || 'all';
    const activeMode = currentSkuMode();
    const taskMap = buildSkuTaskMap();
    const sourceSkus = (stateRef.skus || []).filter((sku) => skuBelongsToMarket(sku, activeMarket));
    const model = planModelForWorkspace(activeMarket);
    const planMap = buildPlanRowMap(model);
    const rawIssueRows = typeof skuContourIssueRows === 'function' ? skuContourIssueRows(model) : [];
    const issueRows = rawIssueRows.filter((row) => issuePlatformMatches(row, activeMarket));
    const visibleSkus = filteredRegistrySkus(stateRef.skus || [], taskMap, activeMarket);
    const owners = ownerOptionsForSkus(sourceSkus, activeMarket);
    const segments = segmentOptionsForSkus(sourceSkus);
    const lifecycles = lifecycleOptionsForSkus(sourceSkus);
    const context = { activeMarket, sourceSkus, visibleSkus, issueRows, taskMap, planMap, model, owners, segments, lifecycles, activeMode };

    root.innerHTML = `
      <div class="sku-launch-v1-shell sku-v1-shell" data-sku-launch-version="${VERSION}">
        <header class="sl-v1-hero">
          <div>
            <span>Единый контур SKU</span>
            <h2>SKU workspace без витринного шума</h2>
            <p>Реестр, API-пары и план-факт остаются одной рабочей системой, но каждый режим отвечает на свой вопрос.</p>
          </div>
          ${renderSkuModeSwitch(activeMode)}
        </header>
        <div class="sl-v1-body" data-sku-v1-body>
          ${activeMode === 'api' ? renderApiContourV1(root, context) : renderSkuRegistryV1(root, context)}
        </div>
      </div>
    `;
    bindSkuWorkspaceV1(root);
  }

  function debounce(callback, delay = 110) {
    let timeout = null;
    return function debounced() {
      const args = arguments;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => callback.apply(this, args), delay);
    };
  }

  function bindSkuWorkspaceV1(root) {
    const stateRef = appState();
    const rerender = () => renderSkuWorkspaceV1(root.id || 'view-sku-contour');
    const debouncedSearch = debounce((value) => {
      stateRef.filters.search = value;
      rerender();
    }, 100);
    root.querySelector('#skuV1Search')?.addEventListener('input', (event) => debouncedSearch(event.target.value));
    [
      ['#skuV1Owner', 'owner'],
      ['#skuV1Lifecycle', 'lifecycle'],
      ['#skuV1Segment', 'segment'],
      ['#skuV1Focus', 'focus'],
      ['#skuV1Traffic', 'traffic'],
      ['#skuV1Assignment', 'assignment']
    ].forEach(([selector, key]) => {
      root.querySelector(selector)?.addEventListener('change', (event) => {
        stateRef.filters[key] = event.target.value;
        rerender();
      });
    });
    root.querySelectorAll('[data-sku-v1-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.skuV1Mode || 'registry';
        if (mode === 'planfact') {
          if (typeof setView === 'function') setView('sku-plan-fact');
          else document.querySelector('.nav-btn[data-view="sku-plan-fact"]')?.click();
          return;
        }
        setSkuMode(mode);
        rerender();
      });
    });
    root.querySelectorAll('[data-sku-v1-focus]').forEach((button) => {
      button.addEventListener('click', () => {
        const focus = button.dataset.skuV1Focus || 'all';
        if (focus === 'api') {
          setSkuMode('api');
        } else {
          stateRef.filters.focus = focus;
          if (focus === 'unassigned') stateRef.filters.assignment = 'unassigned';
          else if (focus === 'all') stateRef.filters.assignment = 'all';
        }
        rerender();
      });
    });
    root.querySelector('[data-sku-v1-reset]')?.addEventListener('click', () => {
      Object.assign(stateRef.filters, {
        search: '',
        owner: 'all',
        lifecycle: 'all',
        segment: 'all',
        focus: 'all',
        traffic: 'all',
        assignment: 'all'
      });
      rerender();
    });
    root.querySelector('[data-sku-v1-columns]')?.addEventListener('click', () => {
      window.alert('Колонки оставлены рабочими: Артикул, карточка, owner, площадки, план-факт, маржа, остаток, качество, действие.');
    });
    root.querySelector('[data-sku-v1-toggle-new]')?.addEventListener('click', () => {
      stateRef.skuContourOnlyNew = !stateRef.skuContourOnlyNew;
      rerender();
    });
    root.querySelector('[data-sku-v1-toggle-resolved]')?.addEventListener('click', () => {
      stateRef.skuContourShowResolved = !stateRef.skuContourShowResolved;
      rerender();
    });
    root.querySelector('[data-sku-v1-quality-export]')?.addEventListener('click', () => {
      const model = planModelForWorkspace(readGlobalMarket());
      if (typeof downloadSkuPlanFactQualityExcel === 'function') downloadSkuPlanFactQualityExcel(model);
    });
  }

  function launchId(item) {
    if (typeof launchStableId === 'function') return launchStableId(item);
    return String(item?.id || item?.articleKey || item?.name || Math.random()).trim();
  }

  function launchOwner(item) {
    if (typeof launchCurrentOwner === 'function') return launchCurrentOwner(item);
    return String(item?.owner || item?.responsible || '').trim();
  }

  function launchDue(item) {
    if (typeof launchDueDateKey === 'function') return launchDueDateKey(item);
    return String(item?.launchDate || item?.date || '').slice(0, 10);
  }

  function launchDueText(item) {
    if (typeof launchDueDateLabel === 'function') return launchDueDateLabel(item);
    return launchDue(item) || 'Без даты';
  }

  function launchMonthKey(dateKey = '') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return `${dateKey.slice(0, 7)}-01`;
    return `${todayKey().slice(0, 7)}-01`;
  }

  function launchMonthLabel(monthKey = '') {
    if (typeof launchCalendarMonthLabel === 'function') return launchCalendarMonthLabel(monthKey);
    return new Date(`${monthKey || launchMonthKey()}T00:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  }

  function launchMonthDays(monthKey = '') {
    if (typeof launchCalendarMonthDays === 'function') return launchCalendarMonthDays(monthKey);
    const first = new Date(`${monthKey || launchMonthKey()}T00:00:00`);
    const start = new Date(first);
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day.toISOString().slice(0, 10);
    });
  }

  function addMonths(monthKey, delta) {
    if (typeof launchCalendarAddMonths === 'function') return launchCalendarAddMonths(monthKey, delta);
    const date = new Date(`${monthKey || launchMonthKey()}T00:00:00`);
    date.setMonth(date.getMonth() + delta);
    return `${date.toISOString().slice(0, 7)}-01`;
  }

  function stageEntries(item) {
    if (typeof launchStageEntries === 'function') return launchStageEntries(item);
    return [
      ['Переговоры', 'negotiationStatus', 'negotiationDue', 'negotiationOwner', 'negotiationComment'],
      ['Образец', 'sampleStatus', 'sampleDue', 'sampleOwner', 'sampleComment'],
      ['Производство', 'productionStatus', 'productionDue', 'productionOwner', 'productionComment'],
      ['Упаковка', 'packagingStatus', 'packagingDue', 'packagingOwner', 'packagingComment'],
      ['Контент / карточка', 'contentStatus', 'contentDue', 'contentOwner', 'contentComment'],
      ['Готовность', 'launchReadinessStatus', 'launchReadinessDue', 'launchReadinessOwner', 'launchReadinessComment']
    ].map(([title, status, due, owner, comment]) => ({
      config: { title, status, due, owner, comment },
      status: item?.[status] || '',
      due: item?.[due] || '',
      owner: item?.[owner] || launchOwner(item),
      comment: item?.[comment] || '',
      done: /готов|done|ok/i.test(String(item?.[status] || '')),
      column: { key: /блок|stop|риск/i.test(String(item?.[status] || '')) ? 'blocked' : 'work' }
    }));
  }

  function readiness(item) {
    if (typeof launchReadinessState === 'function') return launchReadinessState(item);
    const entries = stageEntries(item);
    const missing = entries.filter((entry) => !entry.done);
    return { ready: missing.length === 0, missing, checks: entries, pct: entries.length ? (entries.length - missing.length) / entries.length : 0 };
  }

  function currentStage(item) {
    if (typeof launchCurrentStageEntry === 'function') return launchCurrentStageEntry(item);
    return stageEntries(item).find((entry) => !entry.done) || stageEntries(item).at(-1);
  }

  function launchFilters() {
    const stateRef = appState();
    stateRef.launchV1Filters = stateRef.launchV1Filters || {
      search: '',
      month: '',
      owner: 'all',
      category: 'all',
      status: 'all',
      readiness: 'all',
      viewMode: 'month',
      advancedOpen: false
    };
    return stateRef.launchV1Filters;
  }

  function launchItemsV1() {
    const items = typeof getLaunchItems === 'function' ? getLaunchItems({ skipTaskLookup: true }) : (appState().launches || []);
    const taskCounts = typeof launchTaskCountMap === 'function' ? launchTaskCountMap() : new Map();
    return items.map((item) => {
      const normalized = typeof launchWithTaskCount === 'function' ? launchWithTaskCount(item, taskCounts) : item;
      return { ...normalized, id: launchId(normalized) };
    });
  }

  function launchText(item) {
    return [
      item.name,
      item.title,
      item.articleKey,
      item.article,
      item.reportGroup,
      item.category,
      item.subCategory,
      item.status,
      launchOwner(item),
      item.marketplaces,
      item.productComment,
      item.notes
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function launchFilteredItems(items) {
    const filters = launchFilters();
    const search = String(filters.search || '').trim().toLowerCase();
    return items.filter((item) => {
      const due = launchDue(item);
      const owner = launchOwner(item) || '';
      const category = item.reportGroup || item.category || item.subCategory || '';
      const itemReady = readiness(item);
      if (search && !launchText(item).includes(search)) return false;
      if (filters.month && filters.month !== 'all' && due && launchMonthKey(due) !== filters.month) return false;
      if (filters.month && filters.month !== 'all' && !due) return false;
      if (filters.owner !== 'all' && owner !== filters.owner) return false;
      if (filters.category !== 'all' && category !== filters.category) return false;
      if (filters.status !== 'all' && String(item.status || '') !== filters.status) return false;
      if (filters.readiness === 'ready' && !itemReady.ready) return false;
      if (filters.readiness === 'blocked' && !(item.blockers || []).length && !stageEntries(item).some((entry) => entry.column?.key === 'blocked')) return false;
      if (filters.readiness === 'missing-owner' && owner) return false;
      if (filters.readiness === 'missing-date' && due) return false;
      return true;
    });
  }

  function launchOptionValues(items, getter) {
    return [...new Set(items.map(getter).filter(Boolean))]
      .sort((left, right) => String(left).localeCompare(String(right), 'ru'));
  }

  function renderStageStrip(item) {
    return `<span class="sl-v1-stage-strip">${stageEntries(item).map((entry) => {
      const tone = entry.done ? 'ok' : entry.column?.key === 'blocked' || entry.stale ? 'danger' : entry.status ? 'warn' : '';
      return `<i class="${escapeValue(tone)}" title="${escapeValue(entry.config?.title || '')}"></i>`;
    }).join('')}</span>`;
  }

  function renderLaunchFilters(allItems, monthOptions) {
    const filters = launchFilters();
    const ownerOptions = launchOptionValues(allItems, launchOwner);
    const categoryOptions = launchOptionValues(allItems, (item) => item.reportGroup || item.category || item.subCategory || '');
    const statusOptions = launchOptionValues(allItems, (item) => item.status || '');
    return `
      <section class="sl-v1-filter-dock launch-v1-filter-dock">
        <div class="sl-v1-filter-head">
          <div>
            <span>Фильтры календаря</span>
            <strong>Запуск новинок</strong>
          </div>
          <div class="sl-v1-market-note"><i></i><span>Площадка из шапки: ${escapeValue(marketLabel(readGlobalMarket()))}</span></div>
        </div>
        <div class="sl-v1-filter-grid launch-v1-filter-grid">
          <label class="sl-v1-control sl-v1-search">
            <span>Поиск</span>
            <input id="launchV1Search" value="${escapeValue(filters.search || '')}" placeholder="Новинка, категория, owner...">
          </label>
          <label class="sl-v1-control">
            <span>Месяц</span>
            <select id="launchV1Month">
              ${monthOptions.map((item) => `<option value="${escapeValue(item.key)}" ${filters.month === item.key ? 'selected' : ''}>${escapeValue(item.label)} · ${formatInt(item.count)}</option>`).join('')}
            </select>
          </label>
          <label class="sl-v1-control">
            <span>Owner</span>
            <select id="launchV1Owner"><option value="all">Все owner</option>${ownerOptions.map((owner) => `<option value="${escapeValue(owner)}" ${filters.owner === owner ? 'selected' : ''}>${escapeValue(owner)}</option>`).join('')}</select>
          </label>
          <label class="sl-v1-control">
            <span>Категория</span>
            <select id="launchV1Category"><option value="all">Все категории</option>${categoryOptions.map((category) => `<option value="${escapeValue(category)}" ${filters.category === category ? 'selected' : ''}>${escapeValue(category)}</option>`).join('')}</select>
          </label>
          <label class="sl-v1-control">
            <span>Статус / фаза</span>
            <select id="launchV1Status"><option value="all">Все этапы</option>${statusOptions.map((status) => `<option value="${escapeValue(status)}" ${filters.status === status ? 'selected' : ''}>${escapeValue(status)}</option>`).join('')}</select>
          </label>
          <label class="sl-v1-control">
            <span>Готовность</span>
            <select id="launchV1Readiness">
              <option value="all" ${filters.readiness === 'all' ? 'selected' : ''}>Все карточки</option>
              <option value="ready" ${filters.readiness === 'ready' ? 'selected' : ''}>Готово</option>
              <option value="blocked" ${filters.readiness === 'blocked' ? 'selected' : ''}>Есть блокеры</option>
              <option value="missing-owner" ${filters.readiness === 'missing-owner' ? 'selected' : ''}>Без owner</option>
              <option value="missing-date" ${filters.readiness === 'missing-date' ? 'selected' : ''}>Без даты</option>
            </select>
          </label>
          <div class="sl-v1-filter-actions">
            <button type="button" data-launch-v1-advanced>Фильтры</button>
            <button type="button" data-launch-v1-add>+ Новинка</button>
          </div>
        </div>
        <div class="sl-v1-chip-row">
          ${['month', 'owner', 'category', 'status', 'readiness'].filter((key) => filters[key] && filters[key] !== 'all').map((key) => `<button type="button" disabled>${escapeValue(key)}: ${escapeValue(filters[key])}</button>`).join('')}
          <button type="button" data-launch-v1-reset>Сброс</button>
          <span class="launch-v1-view-mode">
            <button type="button" class="${filters.viewMode !== 'list' ? 'active' : ''}" data-launch-v1-view-mode="month">Месяц</button>
            <button type="button" class="${filters.viewMode === 'list' ? 'active' : ''}" data-launch-v1-view-mode="list">Список</button>
          </span>
        </div>
      </section>
    `;
  }

  function launchMonthOptions(items) {
    const map = new Map();
    items.forEach((item) => {
      const due = launchDue(item);
      const key = due ? launchMonthKey(due) : 'missing';
      const label = key === 'missing' ? 'Без даты' : launchMonthLabel(key);
      if (!map.has(key)) map.set(key, { key, label, count: 0 });
      map.get(key).count += 1;
    });
    const values = [...map.values()].sort((left, right) => {
      if (left.key === 'missing') return 1;
      if (right.key === 'missing') return -1;
      return left.key.localeCompare(right.key);
    });
    return [{ key: 'all', label: 'Все месяцы', count: items.length }, ...values];
  }

  function renderLaunchKpis(items, filtered) {
    const activeMonth = launchFilters().month;
    const visibleMonthItems = activeMonth && activeMonth !== 'all'
      ? filtered
      : filtered.filter((item) => launchDue(item) && launchMonthKey(launchDue(item)) === launchMonthKey(todayKey()));
    const blockers = filtered.filter((item) => (item.blockers || []).length || stageEntries(item).some((entry) => entry.column?.key === 'blocked')).length;
    const noOwner = filtered.filter((item) => !launchOwner(item)).length;
    const contentRisk = filtered.filter((item) => {
      const content = stageEntries(item).find((entry) => entry.config?.status === 'contentStatus');
      return content && !content.done;
    }).length;
    return `
      <section class="sl-v1-kpis launch-v1-kpis">
        ${[
          ['В запуске', filtered.length, 'все активные новинки', filtered.length ? 'info' : 'warn'],
          ['В месяце', visibleMonthItems.length, activeMonth === 'all' ? 'текущий месяц' : 'по фильтру', 'info'],
          ['С блокерами', blockers, 'требуют решения', blockers ? 'danger' : 'ok'],
          ['Без owner', noOwner, 'нужно закрепить', noOwner ? 'warn' : 'ok'],
          ['Контент не готов', contentRisk, 'риск задержки рекламы', contentRisk ? 'warn' : 'ok']
        ].map(([label, value, hint, tone]) => `
          <article class="sl-v1-kpi ${escapeValue(tone || '')}">
            <span>${escapeValue(label)}</span>
            <strong>${formatInt(value)}</strong>
            <em>${escapeValue(hint)}</em>
          </article>
        `).join('')}
      </section>
    `;
  }

  function renderLaunchCard(item, selectedId) {
    const id = launchId(item);
    const entry = currentStage(item);
    const ready = readiness(item);
    const blockers = (item.blockers || []).length + stageEntries(item).filter((stage) => stage.column?.key === 'blocked').length;
    return `
      <button type="button" class="launch-v1-card ${id === selectedId ? 'active' : ''}" data-launch-v1-select="${escapeValue(id)}">
        <strong>${escapeValue(item.name || item.title || item.articleKey || 'Новинка')}</strong>
        <span>${escapeValue(item.reportGroup || item.category || 'категория —')} · ${escapeValue(entry?.config?.title || item.status || 'этап —')}</span>
        <em>${blockers ? `${formatInt(blockers)} блокера` : `${formatPct(ready.pct || 0)} готовность`}</em>
        ${renderStageStrip(item)}
      </button>
    `;
  }

  function renderLaunchCalendar(filtered, selectedId) {
    const filters = launchFilters();
    const month = filters.month && filters.month !== 'all' && filters.month !== 'missing'
      ? filters.month
      : launchMonthKey(todayKey());
    const dayItems = new Map();
    filtered.forEach((item) => {
      const due = launchDue(item);
      if (!due || launchMonthKey(due) !== month) return;
      if (!dayItems.has(due)) dayItems.set(due, []);
      dayItems.get(due).push(item);
    });
    const noDate = filtered.filter((item) => !launchDue(item));
    return `
      <section class="launch-v1-calendar-card">
        <div class="launch-v1-calendar-head">
          <button type="button" data-launch-v1-month-delta="-1">‹</button>
          <h3>${escapeValue(launchMonthLabel(month))}</h3>
          <button type="button" data-launch-v1-month-delta="1">›</button>
        </div>
        <div class="launch-v1-weekdays">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => `<span>${day}</span>`).join('')}</div>
        <div class="launch-v1-month-grid">
          ${launchMonthDays(month).map((day) => {
            const inMonth = launchMonthKey(day) === month;
            const items = (dayItems.get(day) || []).sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ru'));
            return `
              <div class="launch-v1-day ${inMonth ? '' : 'muted'} ${day === todayKey() ? 'today' : ''}" data-launch-v1-day="${escapeValue(day)}">
                <span>${Number(day.slice(8, 10))}</span>
                <div>${items.slice(0, 3).map((item) => renderLaunchCard(item, selectedId)).join('')}${items.length > 3 ? `<small>+${items.length - 3}</small>` : ''}</div>
              </div>
            `;
          }).join('')}
        </div>
        ${noDate.length ? `
          <div class="launch-v1-no-date">
            <strong>Без даты</strong>
            <div>${noDate.slice(0, 8).map((item) => renderLaunchCard(item, selectedId)).join('')}</div>
          </div>
        ` : ''}
      </section>
    `;
  }

  function renderLaunchList(filtered, selectedId) {
    return `
      <section class="launch-v1-calendar-card launch-v1-list-card">
        <div class="launch-v1-list">
          ${filtered.map((item) => renderLaunchCard(item, selectedId)).join('') || '<div class="sl-v1-empty">Новинок по фильтру не найдено.</div>'}
        </div>
      </section>
    `;
  }

  function renderReadinessGate(item) {
    const entries = stageEntries(item);
    const checks = [
      ['Заказ / поставка', ['negotiationStatus', 'sampleStatus', 'productionStatus']],
      ['Карточка / контент', ['contentStatus']],
      ['Реклама к старту', ['launchReadinessStatus']],
      ['Цена / экономика', ['packagingStatus', 'launchReadinessStatus']]
    ];
    return `
      <div class="launch-v1-gate">
        ${checks.map(([label, keys]) => {
          const ok = keys.some((key) => entries.find((entry) => entry.config?.status === key)?.done);
          return `<span class="${ok ? 'ok' : 'warn'}"><i></i>${escapeValue(label)}<em>${ok ? 'готово' : 'не готово'}</em></span>`;
        }).join('')}
      </div>
    `;
  }

  function renderSelectedLaunch(item) {
    if (!item) {
      return `
        <aside class="launch-v1-detail">
          <div class="sl-v1-empty">Выберите новинку в календаре, чтобы увидеть встроенный канбан.</div>
        </aside>
      `;
    }
    const ready = readiness(item);
    const owner = launchOwner(item) || 'Без owner';
    const current = currentStage(item);
    const blockers = (item.blockers || []).length + stageEntries(item).filter((stage) => stage.column?.key === 'blocked').length;
    return `
      <aside class="launch-v1-detail">
        <div class="launch-v1-detail-head">
          <span>Выбранная новинка</span>
          <h3>${escapeValue(item.name || item.title || item.articleKey || 'Новинка')}</h3>
          <p>${escapeValue(item.reportGroup || item.category || 'категория —')} · ${escapeValue(launchDueText(item))}</p>
          ${safeBadge(current?.config?.title || item.status || 'этап —', current?.column?.tone || 'info')}
        </div>
        <div class="launch-v1-facts">
          <span><em>Owner</em><strong>${escapeValue(owner)}</strong></span>
          <span><em>Текущая фаза</em><strong>${escapeValue(current?.config?.title || 'нет данных')}</strong></span>
          <span><em>Готовность</em><strong>${formatPct(ready.pct || 0)}</strong></span>
          <span><em>Блокеры</em><strong>${blockers ? `${formatInt(blockers)} блокера` : 'нет'}</strong></span>
          <span><em>План запуска</em><strong>${escapeValue(item.planRevenue ? formatMoney(item.planRevenue) : item.launchPlan || 'нет данных')}</strong></span>
          <span><em>Трафик</em><strong>${escapeValue(item.trafficPlan || item.adPlan || 'нет данных')}</strong></span>
        </div>
        ${renderReadinessGate(item)}
        <div class="launch-v1-stage-list">
          <strong>Канбан внутри карточки</strong>
          ${stageEntries(item).map((entry) => {
            const tone = entry.done ? 'ok' : entry.column?.key === 'blocked' || entry.stale ? 'danger' : entry.status ? 'warn' : '';
            return `
              <article class="launch-v1-stage ${escapeValue(tone)}">
                <i></i>
                <span>
                  <strong>${escapeValue(entry.config?.title || 'Этап')}</strong>
                  <em>${escapeValue(entry.status || 'нет данных')}</em>
                  <small>${escapeValue(entry.owner || 'без owner')} · ${escapeValue(entry.due || 'без даты')}</small>
                  ${entry.comment ? `<small>${escapeValue(entry.comment)}</small>` : ''}
                </span>
              </article>
            `;
          }).join('')}
        </div>
        <div class="launch-v1-detail-actions">
          <button type="button" data-launch-v1-edit="${escapeValue(launchId(item))}">Редактировать</button>
          <button type="button" data-launch-v1-kanban="${escapeValue(launchId(item))}">Открыть полный канбан</button>
        </div>
      </aside>
    `;
  }

  function renderFullLaunchKanban(selected) {
    if (!selected) return '';
    return `
      <section class="launch-v1-full-kanban">
        <div class="launch-v1-full-head">
          <div>
            <span>Карточка новинки · полный канбан</span>
            <h3>${escapeValue(selected.name || selected.title || selected.articleKey || 'Новинка')}</h3>
          </div>
          <div>
            <button type="button" data-launch-v1-back>Вернуться в календарь</button>
            <button type="button" data-launch-v1-edit="${escapeValue(launchId(selected))}">Редактировать</button>
          </div>
        </div>
        ${renderReadinessGate(selected)}
        <div class="launch-v1-kanban-columns">
          ${stageEntries(selected).map((entry) => {
            const tone = entry.done ? 'ok' : entry.column?.key === 'blocked' || entry.stale ? 'danger' : entry.status ? 'warn' : '';
            return `
              <section class="launch-v1-kanban-col ${escapeValue(tone)}">
                <header>
                  <strong>${escapeValue(entry.config?.title || 'Этап')}</strong>
                  ${safeBadge(entry.status || 'нет данных', tone || 'warn')}
                </header>
                <article>
                  <span>${escapeValue(entry.config?.hint || entry.comment || 'Следующий шаг не описан')}</span>
                  <em>${escapeValue(entry.owner || 'без owner')}</em>
                  <b>${escapeValue(entry.due || 'без даты')}</b>
                  ${entry.comment ? `<p>${escapeValue(entry.comment)}</p>` : ''}
                </article>
              </section>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderLaunchesV1(rootId = 'view-launches') {
    const root = document.getElementById(rootId);
    if (!root) return;
    const allItems = launchItemsV1();
    const filters = launchFilters();
    if (!filters.month) {
      const future = allItems.map(launchDue).filter(Boolean).sort().find((date) => date >= todayKey()) || allItems.map(launchDue).filter(Boolean).sort()[0] || todayKey();
      filters.month = launchMonthKey(future);
    }
    const monthOptions = launchMonthOptions(allItems);
    const filtered = launchFilteredItems(allItems);
    const selectedId = appState().launchV1SelectedId && filtered.some((item) => launchId(item) === appState().launchV1SelectedId)
      ? appState().launchV1SelectedId
      : launchId(filtered[0] || allItems[0] || {});
    appState().launchV1SelectedId = selectedId;
    const selected = filtered.find((item) => launchId(item) === selectedId) || allItems.find((item) => launchId(item) === selectedId) || null;
    const fullKanban = appState().launchV1FullKanban === true;
    root.innerHTML = `
      <div class="sku-launch-v1-shell launch-v1-shell" data-sku-launch-version="${VERSION}">
        <header class="sl-v1-hero launch-v1-hero">
          <div>
            <span>Календарь новинок</span>
            <h2>Дата запуска с канбаном внутри карточки</h2>
            <p>Календарь отвечает “когда”, встроенный pipeline показывает, что именно тормозит запуск.</p>
          </div>
          ${safeBadge(`${formatInt(filtered.length)} в фокусе`, filtered.length ? 'info' : 'warn')}
        </header>
        ${renderLaunchFilters(allItems, monthOptions)}
        ${renderLaunchKpis(allItems, filtered)}
        ${fullKanban ? renderFullLaunchKanban(selected) : `
          <section class="launch-v1-workspace">
            ${filters.viewMode === 'list' ? renderLaunchList(filtered, selectedId) : renderLaunchCalendar(filtered, selectedId)}
            ${renderSelectedLaunch(selected)}
          </section>
        `}
      </div>
    `;
    bindLaunchesV1(root);
  }

  function bindLaunchesV1(root) {
    const filters = launchFilters();
    const rerender = () => renderLaunchesV1(root.id || 'view-launches');
    const debouncedSearch = debounce((value) => {
      filters.search = value;
      rerender();
    }, 100);
    root.querySelector('#launchV1Search')?.addEventListener('input', (event) => debouncedSearch(event.target.value));
    [
      ['#launchV1Month', 'month'],
      ['#launchV1Owner', 'owner'],
      ['#launchV1Category', 'category'],
      ['#launchV1Status', 'status'],
      ['#launchV1Readiness', 'readiness']
    ].forEach(([selector, key]) => {
      root.querySelector(selector)?.addEventListener('change', (event) => {
        filters[key] = event.target.value;
        rerender();
      });
    });
    root.querySelectorAll('[data-launch-v1-view-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        filters.viewMode = button.dataset.launchV1ViewMode || 'month';
        rerender();
      });
    });
    root.querySelectorAll('[data-launch-v1-month-delta]').forEach((button) => {
      button.addEventListener('click', () => {
        const delta = Number(button.dataset.launchV1MonthDelta || 0);
        filters.month = addMonths(filters.month && filters.month !== 'all' && filters.month !== 'missing' ? filters.month : launchMonthKey(todayKey()), delta);
        rerender();
      });
    });
    root.querySelector('[data-launch-v1-reset]')?.addEventListener('click', () => {
      Object.assign(filters, { search: '', owner: 'all', category: 'all', status: 'all', readiness: 'all', viewMode: 'month' });
      rerender();
    });
    root.querySelector('[data-launch-v1-advanced]')?.addEventListener('click', () => {
      window.alert('Расширенные фильтры учтены в готовности: без owner, без даты, с блокерами и неготовые этапы. Данные не подменяются нулями.');
    });
    root.querySelector('[data-launch-v1-add]')?.addEventListener('click', () => {
      if (typeof openLaunchEditor === 'function') openLaunchEditor('', {});
    });
    root.querySelectorAll('[data-launch-v1-select]').forEach((button) => {
      button.addEventListener('click', () => {
        appState().launchV1SelectedId = button.dataset.launchV1Select || '';
        appState().launchV1FullKanban = false;
        rerender();
      });
    });
    root.querySelectorAll('[data-launch-v1-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        if (typeof openLaunchEditor === 'function') openLaunchEditor(button.dataset.launchV1Edit || '');
      });
    });
    root.querySelectorAll('[data-launch-v1-kanban]').forEach((button) => {
      button.addEventListener('click', () => {
        appState().launchV1SelectedId = button.dataset.launchV1Kanban || appState().launchV1SelectedId;
        appState().launchV1FullKanban = true;
        rerender();
      });
    });
    root.querySelector('[data-launch-v1-back]')?.addEventListener('click', () => {
      appState().launchV1FullKanban = false;
      rerender();
    });
  }

  function injectStyles() {
    if (document.getElementById('sku-launch-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'sku-launch-v1-style';
    style.textContent = `
      .sku-launch-v1-shell{--sl-bg:#070706;--sl-panel:#11100e;--sl-panel-2:#16130f;--sl-line:rgba(224,190,126,.18);--sl-line-strong:rgba(240,215,165,.42);--sl-text:#f7f1e8;--sl-muted:rgba(247,241,232,.62);--sl-gold:#f0d49a;--sl-aqua:#58d6ca;position:relative;display:grid;gap:16px;color:var(--sl-text);min-width:0;isolation:isolate}
      .sku-launch-v1-shell *{box-sizing:border-box}
      .sl-v1-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(330px,520px);gap:18px;align-items:end;padding:6px 0 4px;border-bottom:1px solid rgba(224,190,126,.13)}
      .sl-v1-hero span,.sl-v1-filter-head span,.sl-v1-panel-head span{display:block;color:#d8c08a;font-size:11px;font-weight:850;letter-spacing:.24em;text-transform:uppercase}
      .sl-v1-hero h2{margin:6px 0 4px;font-size:clamp(34px,3.9vw,56px);line-height:.98;letter-spacing:0;font-family:inherit}
      .sl-v1-hero p{margin:0;color:var(--sl-muted);font-size:14px;max-width:820px}
      .sl-v1-segment{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border:1px solid var(--sl-line);border-radius:10px;background:rgba(6,5,4,.72)}
      .sl-v1-segment button,.sl-v1-filter-actions button,.sl-v1-inline-actions button,.launch-v1-detail-actions button,.launch-v1-full-head button,.launch-v1-view-mode button{height:40px;border:1px solid transparent;border-radius:8px;background:transparent;color:rgba(247,241,232,.72);font:inherit;font-size:12px;font-weight:850;cursor:pointer}
      .sl-v1-segment button.active,.sl-v1-filter-actions button:first-child,.sl-v1-inline-actions button.active,.launch-v1-detail-actions button:first-child,.launch-v1-full-head button:last-child,.launch-v1-view-mode button.active{background:linear-gradient(180deg,#f5dfad,#b98b47);color:#120d07;border-color:rgba(255,235,190,.48);box-shadow:0 12px 26px rgba(184,139,71,.16)}
      .sl-v1-filter-dock,.sl-v1-panel,.launch-v1-calendar-card,.launch-v1-detail,.launch-v1-full-kanban{border:1px solid var(--sl-line);border-radius:10px;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.012));box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
      .sl-v1-filter-dock{position:sticky;top:8px;z-index:80;display:grid;gap:10px;padding:14px;background:linear-gradient(135deg,rgba(22,18,13,.96),rgba(8,7,6,.96));backdrop-filter:blur(18px)}
      .sl-v1-filter-head,.sl-v1-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .sl-v1-filter-head strong,.sl-v1-panel-head h3{display:block;margin:3px 0 0;font-size:18px;line-height:1.12;color:#fff8e9}
      .sl-v1-market-note{display:inline-flex;align-items:center;gap:8px;min-height:34px;border:1px solid rgba(224,190,126,.2);border-radius:999px;padding:0 12px;background:rgba(0,0,0,.18);color:var(--sl-muted);font-size:12px;font-weight:800;white-space:nowrap}
      .sl-v1-market-note i{width:8px;height:8px;border-radius:50%;background:#67d59a;box-shadow:0 0 0 5px rgba(103,213,154,.1)}
      .sl-v1-filter-grid{display:grid;grid-template-columns:minmax(260px,1.4fr) repeat(6,minmax(140px,.8fr)) minmax(150px,.7fr);gap:10px;align-items:end}
      .sl-v1-control{display:grid;gap:6px;min-width:0}
      .sl-v1-control>span{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:rgba(235,216,174,.62);font-weight:850}
      .sl-v1-control input,.sl-v1-control select{width:100%;height:42px;border:1px solid rgba(224,190,126,.22);border-radius:8px;background:rgba(5,4,3,.78);color:var(--sl-text);padding:0 12px;font:inherit;font-size:13px;outline:none}
      .sl-v1-control input:focus,.sl-v1-control select:focus{border-color:rgba(245,218,165,.75);box-shadow:0 0 0 3px rgba(214,169,85,.12)}
      .sl-v1-filter-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .sl-v1-filter-actions button{border-color:rgba(224,190,126,.2);background:rgba(255,255,255,.035)}
      .sl-v1-chip-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:30px}
      .sl-v1-chip-row button,.sl-v1-chip-row span{border:1px solid rgba(224,190,126,.24);border-radius:999px;background:rgba(255,255,255,.032);color:rgba(247,241,232,.78);padding:7px 11px;font:inherit;font-size:11px;font-weight:800}
      .sl-v1-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
      .sl-v1-kpi{min-height:106px;border:1px solid var(--sl-line);border-radius:10px;background:linear-gradient(150deg,rgba(255,255,255,.045),rgba(255,255,255,.012));padding:16px;display:grid;align-content:space-between;gap:8px}
      .sl-v1-kpi span{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:rgba(235,216,174,.62);font-weight:850}
      .sl-v1-kpi strong{font-size:clamp(24px,2.2vw,34px);line-height:1;font-weight:950;font-variant-numeric:tabular-nums}
      .sl-v1-kpi em{font-style:normal;color:var(--sl-muted);font-size:12px}
      .sl-v1-kpi.ok{border-color:rgba(103,213,154,.30)}.sl-v1-kpi.warn{border-color:rgba(240,196,105,.36)}.sl-v1-kpi.danger{border-color:rgba(255,116,105,.42);background:linear-gradient(150deg,rgba(120,34,28,.22),rgba(255,255,255,.012))}.sl-v1-kpi.info{border-color:rgba(96,166,255,.34)}
      .sl-v1-focus-grid{display:grid;grid-template-columns:minmax(260px,.9fr) minmax(420px,1.6fr) minmax(300px,.9fr);gap:12px;align-items:start}
      .sl-v1-panel{padding:16px;min-width:0}
      .sl-v1-bucket-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .sl-v1-bucket,.sl-v1-queue-row,.launch-v1-card{border:1px solid var(--sl-line);border-radius:9px;background:rgba(6,5,4,.36);color:var(--sl-text);text-align:left;cursor:pointer}
      .sl-v1-bucket{min-height:86px;padding:12px;display:grid;gap:4px}.sl-v1-bucket strong{font-size:26px}.sl-v1-bucket span{font-weight:900}.sl-v1-bucket em{font-style:normal;color:var(--sl-muted);font-size:11px}
      .sl-v1-bucket.ok,.sl-v1-queue-row.ok,.sl-v1-quality-row.ok,.launch-v1-stage.ok,.launch-v1-kanban-col.ok{border-color:rgba(103,213,154,.34)}.sl-v1-bucket.warn,.sl-v1-queue-row.warn,.sl-v1-quality-row.warn,.launch-v1-stage.warn,.launch-v1-kanban-col.warn{border-color:rgba(240,196,105,.38)}.sl-v1-bucket.danger,.sl-v1-queue-row.danger,.sl-v1-quality-row.danger,.launch-v1-stage.danger,.launch-v1-kanban-col.danger{border-color:rgba(255,116,105,.42)}.sl-v1-bucket.info,.sl-v1-queue-row.info{border-color:rgba(96,166,255,.38)}
      .sl-v1-queue-list,.sl-v1-quality-list,.launch-v1-stage-list{display:grid;gap:8px;margin-top:12px}
      .sl-v1-queue-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:12px;align-items:center;min-height:68px;padding:10px 12px}.sl-v1-queue-row i{width:8px;height:8px;border-radius:50%;background:#f0d49a}.sl-v1-queue-row span{display:grid;gap:2px}.sl-v1-queue-row em,.sl-v1-queue-row small{font-style:normal;color:var(--sl-muted);font-size:11px}.sl-v1-queue-row strong{font-size:13px}.sl-v1-queue-row b{font-size:13px;color:#ffd98d}
      .sl-v1-quality-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 10px;border:1px solid var(--sl-line);border-radius:9px;padding:12px;background:rgba(0,0,0,.16)}.sl-v1-quality-row span{font-weight:850}.sl-v1-quality-row strong{font-size:12px}.sl-v1-quality-row em{grid-column:1/-1;color:var(--sl-muted);font-style:normal;font-size:11px}
      .sl-v1-table-panel{overflow:hidden}.sl-v1-table-wrap{overflow:auto;max-width:100%;border:1px solid rgba(224,190,126,.14);border-radius:9px;background:rgba(5,4,3,.62);margin-top:12px}.sl-v1-table{min-width:1380px;width:100%;border-collapse:separate;border-spacing:0}.sl-v1-table th,.sl-v1-table td{border-bottom:1px solid rgba(224,190,126,.09);padding:11px 12px;text-align:left;vertical-align:top;background:rgba(10,9,7,.94);font-size:12px;line-height:1.35}.sl-v1-table th{position:sticky;top:0;z-index:4;color:rgba(247,241,232,.68);font-size:10px;text-transform:uppercase;letter-spacing:.12em;background:rgba(18,15,11,.98)}.sl-v1-table th:nth-child(1),.sl-v1-table td:nth-child(1){position:sticky;left:0;z-index:5;width:190px;background:linear-gradient(90deg,rgba(16,14,11,.99),rgba(11,9,7,.97))}.sl-v1-table th:nth-child(2),.sl-v1-table td:nth-child(2){position:sticky;left:190px;z-index:5;width:310px;background:linear-gradient(90deg,rgba(15,13,10,.99),rgba(10,9,7,.97));box-shadow:10px 0 18px rgba(0,0,0,.22)}.sl-v1-table small{display:block;margin-top:4px;color:var(--sl-muted)}.sl-v1-link{border:0;background:transparent;color:#fff4d8;padding:0;font:inherit;font-weight:950;text-align:left;cursor:pointer}.sl-v1-platform-tags{display:flex;flex-wrap:wrap;gap:5px}.sl-v1-platform-tags span{border:1px solid rgba(224,190,126,.2);border-radius:999px;padding:4px 7px;background:rgba(255,255,255,.035);font-size:10px}
      .sl-v1-inline-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sl-v1-inline-actions button{border-color:rgba(224,190,126,.22);background:rgba(255,255,255,.035);padding:0 12px}
      .sl-v1-empty{padding:18px;border:1px dashed rgba(224,190,126,.2);border-radius:9px;color:var(--sl-muted);background:rgba(255,255,255,.018)}
      .launch-v1-filter-grid{grid-template-columns:minmax(260px,1.2fr) repeat(5,minmax(140px,.8fr)) minmax(210px,.8fr)}
      .launch-v1-kpis{grid-template-columns:repeat(5,minmax(0,1fr))}
      .launch-v1-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(330px,480px);gap:14px;align-items:start}
      .launch-v1-calendar-card,.launch-v1-detail,.launch-v1-full-kanban{padding:16px}
      .launch-v1-calendar-head{display:grid;grid-template-columns:40px 1fr 40px;align-items:center;gap:8px}.launch-v1-calendar-head h3{text-align:center;margin:0;font-size:18px}.launch-v1-calendar-head button{height:36px;border:1px solid var(--sl-line);border-radius:50%;background:rgba(255,255,255,.03);color:var(--sl-text);cursor:pointer}
      .launch-v1-weekdays,.launch-v1-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.launch-v1-weekdays{margin-top:12px;color:var(--sl-muted);font-size:11px;text-transform:uppercase;letter-spacing:.12em}.launch-v1-weekdays span{text-align:center;padding:8px}
      .launch-v1-month-grid{border-top:1px solid rgba(224,190,126,.12);border-left:1px solid rgba(224,190,126,.12)}.launch-v1-day{min-height:138px;border-right:1px solid rgba(224,190,126,.12);border-bottom:1px solid rgba(224,190,126,.12);padding:9px;display:grid;grid-template-rows:auto minmax(0,1fr);gap:8px;background:rgba(0,0,0,.13)}.launch-v1-day.muted{opacity:.48}.launch-v1-day.today>span{display:inline-grid;place-items:center;width:28px;height:28px;border:1px solid #f0d49a;border-radius:50%;color:#f0d49a}
      .launch-v1-card{width:100%;display:grid;gap:4px;padding:9px;margin-bottom:6px}.launch-v1-card.active{border-color:var(--sl-aqua);box-shadow:0 0 0 1px rgba(88,214,202,.22)}.launch-v1-card strong{font-size:12px}.launch-v1-card span,.launch-v1-card em{color:var(--sl-muted);font-style:normal;font-size:10px}.launch-v1-card em{color:#ffcc7e}
      .sl-v1-stage-strip{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.sl-v1-stage-strip i{height:5px;border-radius:999px;background:rgba(255,255,255,.12)}.sl-v1-stage-strip i.ok{background:#61d89a}.sl-v1-stage-strip i.warn{background:#f0c469}.sl-v1-stage-strip i.danger{background:#ff7469}
      .launch-v1-no-date{margin-top:12px;border:1px dashed rgba(224,190,126,.2);border-radius:9px;padding:12px}.launch-v1-no-date>div{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:8px}
      .launch-v1-detail{position:sticky;top:96px;display:grid;gap:14px}.launch-v1-detail-head h3{margin:6px 0 4px;font-size:24px;line-height:1.05}.launch-v1-detail-head p{margin:0;color:var(--sl-muted)}
      .launch-v1-facts{display:grid;gap:1px;border:1px solid rgba(224,190,126,.12);border-radius:9px;overflow:hidden}.launch-v1-facts span{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:10px 12px;background:rgba(0,0,0,.16)}.launch-v1-facts em{color:var(--sl-muted);font-style:normal}.launch-v1-facts strong{font-size:12px;text-align:right}
      .launch-v1-gate{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.launch-v1-gate span{border:1px solid rgba(224,190,126,.18);border-radius:9px;padding:10px;display:grid;gap:4px;font-size:12px;font-weight:850}.launch-v1-gate span.ok{border-color:rgba(103,213,154,.36)}.launch-v1-gate span.warn{border-color:rgba(255,116,105,.38)}.launch-v1-gate i{width:8px;height:8px;border-radius:50%;background:#f0c469}.launch-v1-gate .ok i{background:#61d89a}.launch-v1-gate em{font-style:normal;color:var(--sl-muted);font-size:10px}
      .launch-v1-stage{display:grid;grid-template-columns:8px minmax(0,1fr);gap:10px;border:1px solid var(--sl-line);border-radius:9px;padding:10px;background:rgba(0,0,0,.14)}.launch-v1-stage i{width:8px;height:100%;min-height:34px;border-radius:999px;background:#f0c469}.launch-v1-stage.ok i{background:#61d89a}.launch-v1-stage.danger i{background:#ff7469}.launch-v1-stage span{display:grid;gap:3px}.launch-v1-stage em,.launch-v1-stage small{font-style:normal;color:var(--sl-muted);font-size:11px}
      .launch-v1-detail-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.launch-v1-detail-actions button{border-color:rgba(224,190,126,.22);background:rgba(255,255,255,.035)}
      .launch-v1-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}
      .launch-v1-full-kanban{display:grid;gap:14px}.launch-v1-full-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.launch-v1-full-head h3{margin:4px 0 0;font-size:32px}.launch-v1-full-head>div:last-child{display:flex;gap:8px}.launch-v1-full-head button{border-color:rgba(224,190,126,.22);background:rgba(255,255,255,.035);padding:0 14px}
      .launch-v1-kanban-columns{display:grid;grid-template-columns:repeat(6,minmax(190px,1fr));gap:10px;overflow:auto}.launch-v1-kanban-col{min-height:520px;border:1px solid var(--sl-line);border-radius:10px;background:rgba(255,255,255,.018);padding:10px;display:grid;grid-template-rows:auto minmax(0,1fr);gap:10px}.launch-v1-kanban-col header{display:grid;gap:8px}.launch-v1-kanban-col article{border:1px solid rgba(224,190,126,.14);border-radius:9px;padding:12px;background:rgba(0,0,0,.16);display:grid;align-content:start;gap:8px}.launch-v1-kanban-col em,.launch-v1-kanban-col p{color:var(--sl-muted);font-style:normal}.launch-v1-kanban-col b{color:#f0d49a}
      @media (max-width:1200px){.sl-v1-hero,.launch-v1-workspace,.sl-v1-focus-grid{grid-template-columns:1fr}.sl-v1-kpis,.launch-v1-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sl-v1-filter-grid,.launch-v1-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.launch-v1-detail{position:relative;top:auto}.launch-v1-kanban-columns{grid-template-columns:repeat(3,minmax(220px,1fr))}}
      @media (max-width:720px){.sl-v1-hero h2{font-size:34px}.sl-v1-filter-grid,.launch-v1-filter-grid,.sl-v1-kpis,.launch-v1-kpis,.launch-v1-gate{grid-template-columns:1fr}.sl-v1-segment{grid-template-columns:1fr}.launch-v1-month-grid,.launch-v1-weekdays{min-width:760px}.launch-v1-calendar-card{overflow:auto}.launch-v1-detail-actions,.launch-v1-full-head{display:grid}.launch-v1-kanban-columns{grid-template-columns:repeat(6,220px)}}
      @media (prefers-reduced-motion:reduce){.sku-launch-v1-shell *{transition:none!important;animation:none!important}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function install() {
    installAttempts += 1;
    if (typeof window.renderSkuContour !== 'function' || typeof window.getLaunchItems !== 'function') {
      if (installAttempts < 80) window.setTimeout(install, 50);
      return;
    }
    injectStyles();
    originalRenderSkuContour = originalRenderSkuContour || window.renderSkuContour;
    originalRenderLaunches = originalRenderLaunches || window.renderLaunches;
    originalRenderLaunchControl = originalRenderLaunchControl || window.renderLaunchControl;
    window.renderSkuContour = renderSkuWorkspaceV1;
    window.renderLaunches = renderLaunchesV1;
    window.renderLaunchControl = renderLaunchesV1;
    try { renderSkuContour = renderSkuWorkspaceV1; } catch {}
    try { renderLaunches = renderLaunchesV1; } catch {}
    try { renderLaunchControl = renderLaunchesV1; } catch {}
    if (appState().activeView === 'sku-contour') renderSkuWorkspaceV1('view-sku-contour');
    if (appState().activeView === 'launches') renderLaunchesV1('view-launches');
  }

  window.addEventListener('altea:marketplacechange', () => {
    const activeView = appState().activeView || '';
    if (activeView === 'sku-contour') renderSkuWorkspaceV1('view-sku-contour');
    if (activeView === 'launches') renderLaunchesV1('view-launches');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
