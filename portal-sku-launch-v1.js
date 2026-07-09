(function () {
  if (window.__ALTEA_SKU_LAUNCH_V1__) return;
  window.__ALTEA_SKU_LAUNCH_V1__ = true;

  const VERSION = '20260709launch-board-dnd-v1';
  const MARKET_LABELS = {
    all: 'Все площадки',
    wb: 'WB',
    ozon: 'Ozon',
    ya: 'Я.Маркет',
    ym: 'Я.Маркет',
    goldapple: 'ЗЯ',
    ga: 'ЗЯ',
    letu: "Л'Этуаль",
    megamarket: 'Мегамаркет',
    samokat: 'Самокат',
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
    ям: 'ya',
    ямаркет: 'ya',
    яндекс: 'ya',
    яндексмаркет: 'ya',
    yandex: 'ya',
    yandexmarket: 'ya',
    yamarket: 'ya',
    goldapple: 'goldapple',
    goldenapple: 'goldapple',
    ga: 'goldapple',
    zya: 'goldapple',
    зя: 'goldapple',
    золотоеяблоко: 'goldapple',
    letu: 'letu',
    letual: 'letu',
    летуаль: 'letu',
    лэтуаль: 'letu',
    megamarket: 'megamarket',
    мегамаркет: 'megamarket',
    sbermegamarket: 'megamarket',
    samokat: 'samokat',
    самокат: 'samokat',
    magnit: 'magnit',
    магнит: 'magnit',
    магнитмаркет: 'magnit',
    magnitmarket: 'magnit'
  };
  const SKU_MODE_STORAGE = 'altea:sku-workspace-v1:mode';
  const SKU_DECISION_STORAGE = 'altea:sku-workspace-v1:decisions';

  let originalRenderSkuContour = null;
  let originalRenderLaunches = null;
  let originalRenderLaunchControl = null;
  let installAttempts = 0;
  let skuV1RenderCache = null;
  let launchV1RenderMemo = null;
  const SKU_REGISTRY_RENDER_LIMIT = 360;
  const SKU_ATTENTION_SCAN_LIMIT = 180;

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

  function safeUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^(https?:\/\/|mailto:|\/|#)/i.test(url)) return url;
    return '';
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

  function launchMemo() {
    if (!launchV1RenderMemo) {
      launchV1RenderMemo = {
        stageEntries: new WeakMap(),
        readiness: new WeakMap(),
        currentStage: new WeakMap(),
        text: new WeakMap()
      };
    }
    return launchV1RenderMemo;
  }

  function normalizeMarket(value) {
    const key = String(value || 'all').trim().toLowerCase().replace(/[\s._'`"\u2019-]+/g, '');
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

  function launchMarketplaceValues(value) {
    if (Array.isArray(value)) return value.flatMap(launchMarketplaceValues);
    if (value && typeof value === 'object') {
      return ['key', 'id', 'name', 'label', 'marketplace', 'platform', 'network']
        .flatMap((field) => launchMarketplaceValues(value[field]));
    }
    const text = String(value || '').trim();
    return text ? [text] : [];
  }

  function launchMarketplaceKeys(item = {}) {
    const keys = new Set();
    const values = [
      item.marketplaces,
      item.marketplace,
      item.platforms,
      item.platform,
      item.marketplaceKey,
      item.network,
      item.networks,
      item.retailer,
      item.channel,
      item.market,
      item.salesChannel,
      item.launchPlatform
    ].flatMap(launchMarketplaceValues);
    values.forEach((value) => {
      String(value || '')
        .split(/[,+;/|]+|\s+\+\s+|\s+и\s+/i)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          const normalized = normalizeMarket(part);
          if (normalized && normalized !== 'all') keys.add(normalized);
        });
    });
    return [...keys];
  }

  function launchMatchesMarket(item = {}, market = readGlobalMarket()) {
    const selected = normalizeMarket(market);
    if (!selected || selected === 'all') return true;
    const keys = launchMarketplaceKeys(item);
    if (!keys.length) return true;
    return keys.includes(selected);
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

  function skuLifecycleOptions(currentKey = '') {
    const order = Array.isArray(window.PRODUCT_LIFECYCLE_STATUS_ORDER)
      ? window.PRODUCT_LIFECYCLE_STATUS_ORDER
      : ['active', 'new', 'relaunch', 'watch', 'question', 'paused', 'exit', 'archived'];
    const metaSource = window.PRODUCT_LIFECYCLE_STATUS_META || {};
    const current = String(currentKey || '').trim() || 'active';
    return order.map((key) => {
      const meta = typeof productLifecycleMeta === 'function'
        ? productLifecycleMeta(key)
        : { key, label: metaSource[key]?.label || key };
      return { key, label: meta?.label || key, selected: key === current };
    });
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

  function resetSkuV1RenderCache() {
    skuV1RenderCache = {
      skuLookup: null,
      issueCandidates: new WeakMap(),
      issueSuggestions: new WeakMap(),
      skuReasons: new WeakMap()
    };
  }

  function skuV1Cache() {
    if (!skuV1RenderCache) resetSkuV1RenderCache();
    return skuV1RenderCache;
  }

  function skuReasons(sku, task, market) {
    if (sku && typeof sku === 'object') {
      const cache = skuV1Cache();
      let skuMap = cache.skuReasons.get(sku);
      if (!skuMap) {
        skuMap = new Map();
        cache.skuReasons.set(sku, skuMap);
      }
      const cacheKey = `${normalizeMarket(market || 'all')}|${task?.id || ''}|${sku?.status || ''}|${sku?.productStatus || ''}`;
      if (skuMap.has(cacheKey)) return skuMap.get(cacheKey);
      const result = skuReasonsUncached(sku, task, market);
      skuMap.set(cacheKey, result);
      return result;
    }
    return skuReasonsUncached(sku, task, market);
  }

  function skuReasonsUncached(sku, task, market) {
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
    const decision = issueDecisionForRow(row);
    if (decision?.status) return ['applied', 'ignored', 'known'].includes(String(decision.status || '').toLowerCase());
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
    const status = String(issueDecisionForRow(row)?.status || row?.status || '').toLowerCase();
    if (/block|quarantine|danger|critical/.test(status)) return 'danger';
    if (issueIsResolved(row)) return 'ok';
    if (/new|warn|missing|unmapped|need_check/.test(status)) return 'warn';
    return 'info';
  }

  function stableIssueFallbackKey(row = {}) {
    const direct = row.id || row.key || row.issueKey || row.problemKey || row.sku || row.api || row.value || row.alias || '';
    if (direct) return String(direct).trim();
    const raw = [
      row.platform,
      row.marketplace,
      row.type,
      row.action,
      row.name,
      row.targetSku || row.target_sku,
      row.revenue,
      row.units
    ].filter((value) => String(value ?? '').trim()).join('|');
    if (!raw) return '';
    let hash = 0;
    for (let index = 0; index < raw.length; index += 1) {
      hash = ((hash << 5) - hash + raw.charCodeAt(index)) | 0;
    }
    return `issue-${Math.abs(hash)}`;
  }

  function issueApiSku(row = {}) {
    return String(
      row.apiSku
      || row.api_sku
      || row.apiArticle
      || row.api_article
      || row.articleKey
      || row.article
      || row.sku
      || stableIssueFallbackKey(row)
      || ''
    ).trim();
  }

  function issuePlatform(row = {}, fallback = 'all') {
    return normalizeMarket(row.platform || row.marketplace || fallback || 'all');
  }

  function issueDecisionKey(platform = 'all', apiSku = '') {
    const sku = String(apiSku || '').trim().toLowerCase();
    if (!sku) return '';
    return `${normalizeMarket(platform || 'all')}|${sku}`;
  }

  function issueDecisionKeys(row = {}) {
    const apiSku = issueApiSku(row);
    const platforms = Array.isArray(row.keys) && row.keys.length
      ? row.keys.map((key) => String(key || '').split('|')[0]).filter(Boolean)
      : [issuePlatform(row, 'all')];
    return [...new Set([...platforms, 'all'].map((platform) => issueDecisionKey(platform, apiSku)).filter(Boolean))];
  }

  function loadIssueDecisions() {
    const stateRef = appState();
    if (stateRef.skuV1IssueDecisions && typeof stateRef.skuV1IssueDecisions === 'object') return stateRef.skuV1IssueDecisions;
    try {
      const parsed = JSON.parse(localStorage.getItem(SKU_DECISION_STORAGE) || '{}');
      stateRef.skuV1IssueDecisions = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      stateRef.skuV1IssueDecisions = {};
    }
    return stateRef.skuV1IssueDecisions;
  }

  function saveIssueDecisions() {
    const decisions = loadIssueDecisions();
    try {
      localStorage.setItem(SKU_DECISION_STORAGE, JSON.stringify(decisions));
    } catch {
      // ignored
    }
  }

  function issueDecisionForRow(row = {}) {
    const decisions = loadIssueDecisions();
    return issueDecisionKeys(row).map((key) => decisions[key]).find(Boolean) || null;
  }

  function setIssueDecision({ platform = 'all', apiSku = '', status = '', kind = '', targetSku = '', note = '' } = {}) {
    const key = issueDecisionKey(platform, apiSku);
    if (!key) return null;
    const decisions = loadIssueDecisions();
    if (!status) delete decisions[key];
    else {
      decisions[key] = {
        platform: normalizeMarket(platform || 'all'),
        apiSku,
        status,
        kind: kind || status,
        targetSku,
        note,
        appliedAt: new Date().toISOString(),
        actor: appState().team?.member?.name || appState().team?.userId || 'portal-user'
      };
    }
    saveIssueDecisions();
    try {
      if (typeof saveLocalStorage === 'function') saveLocalStorage();
    } catch {
      // ignored
    }
    return decisions[key] || null;
  }

  function applyIssueDecision(row = {}) {
    const decision = issueDecisionForRow(row);
    if (!decision) return row;
    return {
      ...row,
      status: decision.status || row.status,
      targetSku: decision.targetSku || row.targetSku || row.target_sku || '',
      target_sku: decision.targetSku || row.target_sku || row.targetSku || '',
      _skuV1Decision: decision
    };
  }

  function issueStatusLabel(status = '') {
    const key = String(status || 'new').trim().toLowerCase();
    if (key === 'applied') return 'связано';
    if (key === 'ignored') return 'игнор';
    if (key === 'need_check') return 'проверка';
    if (key === 'blocked') return 'blocked';
    if (key === 'quarantine') return 'quarantine';
    if (key === 'known') return 'known';
    if (key === 'warning') return 'warning';
    return key || 'new';
  }

  function findSkuByArticle(articleKey = '') {
    const key = String(articleKey || '').trim().toLowerCase();
    if (!key) return null;
    const cache = skuV1Cache();
    if (!cache.skuLookup) {
      cache.skuLookup = new Map();
      (appState().skus || []).forEach((sku) => {
        [sku.articleKey, sku.article, sku.sku].forEach((value) => {
          const token = String(value || '').trim().toLowerCase();
          if (token && !cache.skuLookup.has(token)) cache.skuLookup.set(token, sku);
        });
      });
    }
    return cache.skuLookup.get(key) || null;
  }

  function issueCandidates(row = {}, limit = 3) {
    const cache = row && typeof row === 'object' ? skuV1Cache() : null;
    const cacheLimit = Math.max(3, Number(limit) || 3);
    let rowMap = null;
    if (cache) {
      rowMap = cache.issueCandidates.get(row);
      if (!rowMap) {
        rowMap = new Map();
        cache.issueCandidates.set(row, rowMap);
      }
      if (rowMap.has(cacheLimit)) return rowMap.get(cacheLimit).slice(0, limit);
    }
    let candidates = [];
    if (typeof skuContourLikeForLikeCandidates === 'function') {
      try {
        candidates = skuContourLikeForLikeCandidates(row, cacheLimit) || [];
        if (rowMap) rowMap.set(cacheLimit, candidates);
        return candidates.slice(0, limit);
      } catch (error) {
        console.warn('[sku-launch-v1] candidates failed', error);
      }
    }
    const target = row.targetSku || row.target_sku || row.target || '';
    const sku = findSkuByArticle(target);
    candidates = sku ? [{ ...sku, articleKey: sku.articleKey || sku.article || target, matchScore: 1 }] : [];
    if (rowMap) rowMap.set(cacheLimit, candidates);
    return candidates.slice(0, limit);
  }

  function issueSuggestion(row = {}, candidates = null) {
    if (!candidates && row && typeof row === 'object') {
      const cached = skuV1Cache().issueSuggestions.get(row);
      if (cached) return cached;
    }
    const list = candidates || issueCandidates(row, 3);
    let suggestion = null;
    if (typeof skuContourRecommendedDecision === 'function') {
      try {
        suggestion = skuContourRecommendedDecision(row, list) || {};
        if (!candidates && row && typeof row === 'object') skuV1Cache().issueSuggestions.set(row, suggestion);
        return suggestion;
      } catch (error) {
        console.warn('[sku-launch-v1] suggestion failed', error);
      }
    }
    const best = list[0] || null;
    suggestion = best
      ? { decision: 'alias', tone: 'ok', text: `Похоже на ${best.articleKey || best.article}`, targetSku: best.articleKey || best.article || '' }
      : { decision: 'need_check', tone: 'warn', text: row.action || 'Нужна ручная сверка', targetSku: '' };
    if (!candidates && row && typeof row === 'object') skuV1Cache().issueSuggestions.set(row, suggestion);
    return suggestion;
  }

  function issueTargetSku(row = {}) {
    const candidates = issueCandidates(row, 1);
    const suggestion = issueSuggestion(row, candidates);
    return String(suggestion.targetSku || row.targetSku || row.target_sku || candidates[0]?.articleKey || candidates[0]?.article || '').trim();
  }

  function issueTargetSkuObject(row = {}) {
    return findSkuByArticle(issueTargetSku(row));
  }

  function issueTypeOptions(issueRows = []) {
    const counts = new Map();
    issueRows.forEach((row) => {
      const label = issueTypeLabel(row);
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ru'))
      .map(([label, count]) => ({ key: label, label, count }));
  }

  function ownerOptionsForIssues(issueRows = [], market = 'all') {
    return [...new Set(issueRows.flatMap((row) => {
      const sku = issueTargetSkuObject(row);
      return sku ? skuOwnersForFilter(sku, market) : [];
    }).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'ru'));
  }

  function segmentOptionsForIssues(issueRows = []) {
    return [...new Set(issueRows.map((row) => {
      const sku = issueTargetSkuObject(row);
      return sku?.segment || sku?.category || '';
    }).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'ru'));
  }

  function apiIssueMatchesFilter(row = {}, context = {}) {
    const stateRef = appState();
    const filters = stateRef.filters || {};
    const activeMarket = context.activeMarket || 'all';
    const query = String(filters.search || '').trim().toLowerCase();
    const typeFilter = String(filters.lifecycle || 'all');
    const ownerFilter = String(filters.owner || 'all');
    const segmentFilter = String(filters.segment || 'all');
    const assignment = String(filters.assignment || 'all');
    const traffic = String(filters.traffic || 'all');
    const focus = String(filters.focus || 'all');
    const candidates = issueCandidates(row, 3);
    const suggestion = issueSuggestion(row, candidates);
    const targetSku = String(suggestion.targetSku || candidates[0]?.articleKey || candidates[0]?.article || '').trim();
    const target = findSkuByArticle(targetSku);
    const owners = target ? skuOwnersForFilter(target, activeMarket) : [];
    const typeLabel = issueTypeLabel(row);
    const rowText = [
      issueApiSku(row),
      row.name,
      row.action,
      row.type,
      row.status,
      typeLabel,
      suggestion.text,
      targetSku,
      target?.name,
      target?.category,
      target?.segment,
      ...owners,
      ...candidates.map((candidate) => [candidate.articleKey, candidate.article, candidate.displayName, candidate.name].filter(Boolean).join(' '))
    ].filter(Boolean).join(' ').toLowerCase();

    if (query && !rowText.includes(query)) return false;
    if (typeFilter !== 'all' && typeLabel !== typeFilter && String(row.type || '') !== typeFilter && String(row.status || '') !== typeFilter) return false;
    if (ownerFilter !== 'all' && !owners.includes(ownerFilter)) return false;
    if (segmentFilter !== 'all' && target?.segment !== segmentFilter && target?.category !== segmentFilter) return false;
    if (assignment === 'assigned' && !owners.length) return false;
    if (assignment === 'unassigned' && owners.length) return false;
    if (traffic === 'any' && !target?.flags?.hasExternalTraffic) return false;
    if (traffic === 'kz' && !target?.flags?.hasKZ) return false;
    if (traffic === 'vk' && !target?.flags?.hasVK) return false;
    if (traffic === 'none' && target?.flags?.hasExternalTraffic) return false;
    if (focus !== 'all') {
      if (focus === 'unassigned' && owners.length) return false;
      if (focus === 'matrixIssue' && !/block|quarantine|aggregate|unmapped|outside|matrix|known/i.test([row.status, row.type, row.action].join(' '))) return false;
      if (focus === 'underPlan' && !target?.flags?.underPlan) return false;
      if (focus === 'lowStock' && !target?.flags?.lowStock) return false;
      if (focus === 'toWork' && !(target?.flags?.toWork || target?.flags?.toWorkWB || target?.flags?.toWorkOzon)) return false;
      if (focus === 'extAny' && !target?.flags?.hasExternalTraffic) return false;
    }
    return true;
  }

  function filteredApiIssues(rows = [], context = {}) {
    return rows.filter((row) => apiIssueMatchesFilter(row, context));
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

  function renderSkuColumnsPanel(activeMode = 'registry') {
    const labels = activeMode === 'api'
      ? ['Статус', 'Проблема', 'Площадка', 'API / SKU', 'Сумма', 'Следующий шаг']
      : activeMode === 'planfact'
        ? ['Артикул', 'Owner / статус', 'Факт / план', 'Выполнение', 'Разрыв', 'Маржа', 'Реклама', 'Остаток', 'Действие']
        : ['Артикул', 'Карточка', 'Owner / статус', 'Площадки', 'План-факт', 'Маржа', 'Остаток', 'Качество', 'Следующее действие'];
    return `
      <div class="sl-v1-column-panel" data-sku-v1-column-panel>
        <strong>Быстрый переход по колонкам</strong>
        <div>
          ${labels.map((label, index) => `<button type="button" data-sku-v1-column-jump="${index}">${escapeValue(label)}</button>`).join('')}
        </div>
      </div>
    `;
  }

  function renderSkuFilters({ owners, segments, lifecycles, activeMode, activeMarket }) {
    const stateRef = appState();
    const filters = stateRef.filters || {};
    const columnsOpen = Boolean(stateRef.skuV1ColumnsOpen);
    const title = activeMode === 'api' ? 'API-контур' : activeMode === 'planfact' ? 'План-факт' : 'Реестр SKU';
    return `
      <section class="sl-v1-filter-dock">
        <div class="sl-v1-filter-head">
          <div>
            <span>Фильтры и представления</span>
            <strong>${escapeValue(title)}</strong>
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
            <select id="skuV1Lifecycle">
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
        ${columnsOpen ? renderSkuColumnsPanel(activeMode) : ''}
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
      .slice(0, SKU_ATTENTION_SCAN_LIMIT)
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

  function renderSkuLifecycleSelect(sku = {}) {
    const articleKey = sku.articleKey || sku.article || sku.sku || '';
    const lifecycle = skuLifecycle(sku);
    const current = lifecycle?.key || 'active';
    return `
      <select class="sl-v1-inline-select" data-sku-v1-product-status="${escapeValue(articleKey)}" aria-label="Статус товара">
        ${skuLifecycleOptions(current).map((item) => `<option value="${escapeValue(item.key)}" ${item.selected ? 'selected' : ''}>${escapeValue(item.label)}</option>`).join('')}
      </select>
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
          <td>${escapeValue(owner)}<small>${escapeValue(lifecycle?.label || sku.status || '—')}</small>${renderSkuLifecycleSelect(sku)}</td>
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

  function renderApiStatusCell(row = {}) {
    const status = String(row.status || 'new').trim().toLowerCase() || 'new';
    const apiSku = issueApiSku(row);
    const platform = issuePlatform(row, 'all');
    const options = [
      ['new', 'new'],
      ['need_check', 'проверка'],
      ['blocked', 'blocked'],
      ['ignored', 'игнор']
    ];
    if (status === 'applied') options.push(['applied', 'связано']);
    if (!options.some(([value]) => value === status)) options.push([status, issueStatusLabel(status)]);
    return `
      <div class="sl-v1-status-cell">
        ${safeBadge(issueStatusLabel(status), issueTone(row))}
        <select class="sl-v1-inline-select"
          data-sku-v1-row-status
          data-sku-v1-api-sku="${escapeValue(apiSku)}"
          data-sku-v1-platform="${escapeValue(platform)}">
          ${options.map(([value, label]) => `<option value="${escapeValue(value)}" ${value === status ? 'selected' : ''}>${escapeValue(label)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  function issueHistoryForRow(row = {}) {
    const local = issueDecisionForRow(row);
    if (local) {
      return {
        kind: local.kind || local.status || 'decision',
        targetSku: local.targetSku || '',
        fileName: local.note || '',
        appliedAt: local.appliedAt || '',
        actor: local.actor || ''
      };
    }
    if (typeof skuContourAuditForRow === 'function' && typeof skuContourAuditIndex === 'function') {
      return skuContourAuditForRow(row, skuContourAuditIndex());
    }
    return null;
  }

  function renderApiNextActionV1(row = {}, history = null) {
    if (history) {
      return `
        <div class="sl-v1-api-action">
          ${safeBadge(history.kind || 'решено', history.kind === 'ignore' ? 'ok' : 'info')}
          <span>${escapeValue(history.targetSku || history.fileName || '')}</span>
          <small>${escapeValue(history.appliedAt ? new Date(history.appliedAt).toLocaleString('ru-RU') : '')}</small>
        </div>
      `;
    }
    const candidates = issueCandidates(row, 3);
    const suggestion = issueSuggestion(row, candidates);
    const apiSku = issueApiSku(row);
    const platform = issuePlatform(row, 'all');
    const targetSku = String(suggestion.targetSku || candidates[0]?.articleKey || candidates[0]?.article || '').trim();
    const canAlias = Boolean(apiSku && targetSku);
    const primaryDecision = canAlias && suggestion.decision === 'alias' ? 'alias' : 'need_check';
    const primaryLabel = primaryDecision === 'alias' ? 'Связать SKU' : 'Проверить';
    return `
      <div class="sl-v1-api-action">
        <div class="sl-v1-api-action-main">
          ${safeBadge(primaryLabel, suggestion.tone || (primaryDecision === 'alias' ? 'ok' : 'warn'))}
          <span>${escapeValue(suggestion.text || row.action || 'Нужна ручная сверка')}</span>
        </div>
        <div class="sl-v1-api-action-buttons">
          <button type="button"
            data-sku-v1-quick-decision="${escapeValue(primaryDecision)}"
            data-sku-v1-api-sku="${escapeValue(apiSku)}"
            data-sku-v1-platform="${escapeValue(platform)}"
            data-sku-v1-target-sku="${escapeValue(targetSku)}">${escapeValue(primaryLabel)}</button>
          <button type="button"
            data-sku-v1-quick-decision="ignore"
            data-sku-v1-api-sku="${escapeValue(apiSku)}"
            data-sku-v1-platform="${escapeValue(platform)}"
            data-sku-v1-target-sku="">Игнорировать</button>
        </div>
        ${candidates.length ? `
          <div class="sl-v1-candidate-list">
            ${candidates.map((candidate) => {
              const articleKey = candidate.articleKey || candidate.article || '';
              return `
                <span class="sl-v1-candidate">
                  <button type="button" data-open-sku="${escapeValue(articleKey)}">
                    <b>${escapeValue(articleKey)}</b>
                    <em>${formatPct(candidate.matchScore || 0)}</em>
                    <small>${escapeValue(candidate.displayStatus || candidate.category || '')}</small>
                  </button>
                  <button type="button"
                    data-sku-v1-quick-decision="alias"
                    data-sku-v1-api-sku="${escapeValue(apiSku)}"
                    data-sku-v1-platform="${escapeValue(platform)}"
                    data-sku-v1-target-sku="${escapeValue(articleKey)}">Связать</button>
                </span>
              `;
            }).join('')}
          </div>
        ` : '<div class="sl-v1-candidate-empty">Кандидатов в реестре не видно</div>'}
      </div>
    `;
  }

  function renderSkuRegistryV1(root, context) {
    const { activeMarket, sourceSkus, visibleSkus, issueRows, taskMap, planMap, model } = context;
    const tableSkus = visibleSkus.slice(0, SKU_REGISTRY_RENDER_LIMIT);
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
          ${safeBadge(`${formatInt(tableSkus.length)} / ${formatInt(visibleSkus.length)} строк`, visibleSkus.length ? 'info' : 'warn')}
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
            <tbody>${renderSkuTableRows(tableSkus, taskMap, planMap, model, activeMarket) || '<tr><td colspan="9"><div class="sl-v1-empty">По текущему срезу SKU не найдены.</div></td></tr>'}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderApiContourV1(root, context) {
    const { activeMarket, issueRows, model, sourceSkus } = context;
    const showResolved = Boolean(appState().skuContourShowResolved);
    const onlyNew = Boolean(appState().skuContourOnlyNew);
    let baseRows = showResolved ? issueRows : issueRows.filter((row) => !issueIsResolved(row));
    if (onlyNew) baseRows = baseRows.filter((row) => String(row.status || '').toLowerCase() === 'new');
    const rows = filteredApiIssues(baseRows, context);
    const unresolved = filteredApiIssues(issueRows.filter((row) => !issueIsResolved(row)), context);
    const byType = new Map();
    rows.forEach((row) => {
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
            <button type="button" data-sku-v1-review-form>Форма разбора</button>
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
                const history = issueHistoryForRow(row);
                const nextAction = renderApiNextActionV1(row, history);
                return `
                  <tr>
                    <td>${renderApiStatusCell(row)}</td>
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

  function planFactRowSku(row = {}) {
    return findSkuByArticle(row.articleKey || row.article || '') || {};
  }

  function planFactWorkspaceRows(model = {}, context = {}) {
    const stateRef = appState();
    const filters = stateRef.filters || {};
    const activeMarket = context.activeMarket || 'all';
    const rows = Array.isArray(model.rows) ? model.rows : (Array.isArray(model.allRows) ? model.allRows : []);
    const query = String(filters.search || '').trim().toLowerCase();
    const ownerFilter = String(filters.owner || 'all');
    const segmentFilter = String(filters.segment || 'all');
    const lifecycleFilter = String(filters.lifecycle || 'all');
    const assignment = String(filters.assignment || 'all');
    const traffic = String(filters.traffic || 'all');
    const focus = String(filters.focus || 'all');

    return rows.filter((row) => {
      const sku = planFactRowSku(row);
      if (sku.articleKey && !skuBelongsToMarket(sku, activeMarket)) return false;
      const lifecycle = sku.articleKey ? skuLifecycle(sku) : { key: row.status || 'active', label: row.status || '' };
      const owners = sku.articleKey ? skuOwnersForFilter(sku, activeMarket) : [row.owner].filter(Boolean);
      const segment = sku.segment || sku.category || row.segment || row.category || '';
      const metric = displayMetric(row, model);
      const matrix = row.matrixProblemState || skuMatrixState(sku);
      const haystack = [
        row.article,
        row.articleKey,
        row.name,
        row.owner,
        row.status,
        lifecycle?.label,
        segment,
        matrix,
        sku.name,
        sku.brand
      ].filter(Boolean).join(' ').toLowerCase();

      if (query && !haystack.includes(query)) return false;
      if (ownerFilter !== 'all' && !owners.includes(ownerFilter) && row.owner !== ownerFilter) return false;
      if (segmentFilter !== 'all' && segment !== segmentFilter) return false;
      if (lifecycleFilter !== 'all' && (lifecycle?.key || 'active') !== lifecycleFilter) return false;
      if (assignment === 'assigned' && !owners.length && !row.owner) return false;
      if (assignment === 'unassigned' && (owners.length || row.owner)) return false;
      if (traffic === 'any' && !sku?.flags?.hasExternalTraffic) return false;
      if (traffic === 'kz' && !sku?.flags?.hasKZ) return false;
      if (traffic === 'vk' && !sku?.flags?.hasVK) return false;
      if (traffic === 'none' && sku?.flags?.hasExternalTraffic) return false;
      if (focus === 'unassigned' && (owners.length || row.owner)) return false;
      if (focus === 'matrixIssue' && (!matrix || matrix === 'ok')) return false;
      if (focus === 'underPlan' && !(metric?.completionToDate !== null && metric?.completionToDate !== undefined && metric.completionToDate < 0.9)) return false;
      if (focus === 'lowStock' && !sku?.flags?.lowStock) return false;
      if (focus === 'toWork' && !(sku?.flags?.toWork || sku?.flags?.toWorkWB || sku?.flags?.toWorkOzon)) return false;
      if (focus === 'extAny' && !sku?.flags?.hasExternalTraffic) return false;
      return true;
    }).sort((left, right) => {
      const leftMetric = displayMetric(left, model);
      const rightMetric = displayMetric(right, model);
      const leftGap = Number(leftMetric?.gapToDate ?? left.gapToDate);
      const rightGap = Number(rightMetric?.gapToDate ?? right.gapToDate);
      const leftCompletion = Number(leftMetric?.completionToDate ?? left.completionToDate);
      const rightCompletion = Number(rightMetric?.completionToDate ?? right.completionToDate);
      const safeLeftGap = Number.isFinite(leftGap) ? leftGap : Number.POSITIVE_INFINITY;
      const safeRightGap = Number.isFinite(rightGap) ? rightGap : Number.POSITIVE_INFINITY;
      const safeLeftCompletion = Number.isFinite(leftCompletion) ? leftCompletion : Number.POSITIVE_INFINITY;
      const safeRightCompletion = Number.isFinite(rightCompletion) ? rightCompletion : Number.POSITIVE_INFINITY;
      return safeLeftGap - safeRightGap
        || safeLeftCompletion - safeRightCompletion
        || String(left.article || left.articleKey || '').localeCompare(String(right.article || right.articleKey || ''), 'ru');
    });
  }

  function planFactWorkspaceCards(rows = [], model = {}) {
    const totals = rows.reduce((acc, row) => {
      const metric = displayMetric(row, model);
      const fact = toNumber(metric?.factRevenue ?? row.factRevenue);
      const plan = toNumber(metric?.planToDateRevenue ?? row.planToDateRevenue);
      const monthPlan = toNumber(metric?.planRevenue ?? row.planRevenue);
      const adSpend = toNumber(metric?.adSpend ?? row.adSpend);
      const marginPct = Number(metric?.marginPct ?? row.marginPct);
      const marginWeight = fact || plan || monthPlan;
      acc.fact += fact;
      acc.plan += plan;
      acc.monthPlan += monthPlan;
      acc.ads += adSpend;
      if (Number.isFinite(marginPct) && marginWeight > 0) {
        acc.marginWeighted += marginPct * marginWeight;
        acc.marginWeight += marginWeight;
      }
      if (plan > 0 && fact < plan) acc.underPlan += 1;
      if (metric?.completionToDate !== null && metric?.completionToDate !== undefined && metric.completionToDate < 0.9) acc.red += 1;
      return acc;
    }, { fact: 0, plan: 0, monthPlan: 0, ads: 0, marginWeighted: 0, marginWeight: 0, underPlan: 0, red: 0 });
    const completion = totals.plan > 0 ? totals.fact / totals.plan : null;
    const margin = totals.marginWeight > 0 ? totals.marginWeighted / totals.marginWeight : null;
    return [
      { label: 'Факт', value: formatMoney(totals.fact), hint: `план к дате ${formatMoney(totals.plan)}`, tone: completion !== null && completion >= 1 ? 'ok' : completion !== null && completion >= 0.9 ? 'warn' : 'danger' },
      { label: 'Выполнение', value: completion === null ? '—' : formatPct(completion), hint: `месячный план ${formatMoney(totals.monthPlan)}`, tone: completion !== null && completion >= 1 ? 'ok' : completion !== null && completion >= 0.9 ? 'warn' : 'danger' },
      { label: 'Разрыв', value: formatMoney(totals.fact - totals.plan), hint: `${formatInt(totals.underPlan)} ниже плана`, tone: totals.fact >= totals.plan ? 'ok' : 'danger' },
      { label: 'Маржа', value: margin === null ? '—' : formatPct(margin), hint: 'вес по обороту', tone: margin !== null && margin >= 0.35 ? 'ok' : 'warn' },
      { label: 'Реклама', value: formatMoney(totals.ads), hint: totals.fact > 0 ? `ДРР ${formatPct(totals.ads / totals.fact)}` : 'нет базы', tone: totals.ads > 0 ? 'info' : '' },
      { label: 'Строк', value: formatInt(rows.length), hint: `${formatInt(totals.red)} красных`, tone: totals.red ? 'warn' : 'ok' }
    ];
  }

  function renderPlanFactWorkspaceRows(rows = [], model = {}) {
    return rows.map((row) => {
      const metric = displayMetric(row, model);
      const articleKey = String(row.articleKey || row.article || '').trim();
      const sku = planFactRowSku(row);
      const lifecycle = sku.articleKey ? skuLifecycle(sku) : null;
      const matrix = row.matrixProblemState || skuMatrixState(sku);
      const stock = typeof totalSkuStock === 'function' && sku.articleKey ? totalSkuStock(sku) : row.stock ?? row.totalStock ?? null;
      const turnover = metric?.turnoverDays ?? row.turnoverDays ?? row.avgTurnoverDays;
      const completion = metric?.completionToDate ?? row.completionToDate;
      const gap = metric?.gapToDate ?? row.gapToDate;
      const tone = completion !== null && completion !== undefined && completion >= 1 ? 'ok' : completion !== null && completion !== undefined && completion >= 0.9 ? 'warn' : 'danger';
      return `
        <tr class="sl-v1-table-row ${row.syntheticUnmapped ? 'is-unmapped' : ''}" ${articleKey ? `data-open-sku="${escapeValue(articleKey)}"` : ''}>
          <td>
            ${articleKey && !row.syntheticUnmapped ? `<button type="button" class="sl-v1-link" data-open-sku="${escapeValue(articleKey)}">${escapeValue(row.article || articleKey)}</button>` : `<strong>${escapeValue(row.article || articleKey || '—')}</strong>`}
            <small>${escapeValue(row.name || sku.name || '')}</small>
          </td>
          <td>
            ${escapeValue(row.owner || skuOwner(sku) || 'без owner')}
            <small>${escapeValue(lifecycle?.label || row.status || '—')}</small>
            ${articleKey && !row.syntheticUnmapped ? renderSkuLifecycleSelect({ ...sku, articleKey, article: row.article || articleKey }) : ''}
          </td>
          <td><strong>${formatMoney(metric?.factRevenue ?? row.factRevenue)}</strong><small>план ${formatMoney(metric?.planToDateRevenue ?? row.planToDateRevenue)}</small></td>
          <td>${safeBadge(completion === null || completion === undefined ? '—' : formatPct(completion), tone)}<small>${formatMoney(gap || 0)}</small></td>
          <td>${formatMoney(gap || 0)}<small>месяц ${formatMoney(metric?.planRevenue ?? row.planRevenue)}</small></td>
          <td>${metric?.marginPct !== null && metric?.marginPct !== undefined ? formatPct(metric.marginPct) : '—'}<small>${metric?.marginRub ? formatMoney(metric.marginRub) : 'маржа'}</small></td>
          <td>${formatMoney(metric?.adSpend ?? row.adSpend)}<small>${(metric?.factRevenue ?? row.factRevenue) > 0 ? `ДРР ${formatPct((metric?.adSpend ?? row.adSpend) / (metric?.factRevenue ?? row.factRevenue))}` : 'реклама'}</small></td>
          <td>${stock !== null && stock !== undefined ? formatInt(stock) : '—'}<small>${turnover ? `${formatInt(turnover)} дн.` : 'остаток'}</small></td>
          <td>${matrix && matrix !== 'ok' ? safeBadge(skuMatrixLabel(matrix), 'warn') : safeBadge('ok', 'ok')}<small>${escapeValue(row.nextAction || row.action || '')}</small></td>
        </tr>
      `;
    }).join('');
  }

  function renderPlanFactWorkspaceV1(root, context) {
    const rows = planFactWorkspaceRows(context.model, context);
    const tableRows = rows.slice(0, SKU_REGISTRY_RENDER_LIMIT);
    const cards = planFactWorkspaceCards(rows, context.model);
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
      <section class="sl-v1-panel sl-v1-table-panel">
        <div class="sl-v1-panel-head">
          <div>
            <span>План-факт внутри SKU workspace</span>
            <h3>Факт, план, маржа и статус товара</h3>
          </div>
          ${safeBadge(`${formatInt(tableRows.length)} / ${formatInt(rows.length)} строк`, rows.length ? 'info' : 'warn')}
        </div>
        <div class="sl-v1-table-wrap">
          <table class="sl-v1-table sl-v1-planfact-table">
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Owner / статус</th>
                <th>Факт / план</th>
                <th>Выполнение</th>
                <th>Разрыв</th>
                <th>Маржа</th>
                <th>Реклама</th>
                <th>Остаток</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>${renderPlanFactWorkspaceRows(tableRows, context.model) || '<tr><td colspan="9"><div class="sl-v1-empty">План-факт по текущему срезу пуст.</div></td></tr>'}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function currentSkuMode() {
    const stateRef = appState();
    if (stateRef.skuWorkspaceMode === 'registry') return 'registry';
    if (stateRef.skuWorkspaceMode === 'contour') return 'api';
    if (stateRef.skuWorkspaceMode === 'planfact') return 'planfact';
    try {
      const stored = sessionStorage.getItem(SKU_MODE_STORAGE);
      if (stored === 'registry' || stored === 'api' || stored === 'planfact') return stored;
    } catch {
      // ignored
    }
    return 'registry';
  }

  function setSkuMode(mode) {
    const stateRef = appState();
    const next = mode === 'api' ? 'api' : mode === 'planfact' ? 'planfact' : 'registry';
    stateRef.skuWorkspaceMode = next === 'api' ? 'contour' : next;
    try {
      sessionStorage.setItem(SKU_MODE_STORAGE, next);
    } catch {
      // ignored
    }
  }

  function renderSkuWorkspaceV1(rootId = 'view-sku-contour') {
    const root = document.getElementById(rootId);
    if (!root) return;
    resetSkuV1RenderCache();
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
    const isApiMode = activeMode === 'api';
    const isPlanFactMode = activeMode === 'planfact';
    const taskMap = isApiMode ? new Map() : buildSkuTaskMap();
    const sourceSkus = (stateRef.skus || []).filter((sku) => skuBelongsToMarket(sku, activeMarket));
    const model = planModelForWorkspace(activeMarket);
    const planMap = isApiMode ? new Map() : buildPlanRowMap(model);
    const rawIssueRows = typeof skuContourIssueRows === 'function' ? skuContourIssueRows(model) : [];
    const issueRows = rawIssueRows
      .filter((row) => issuePlatformMatches(row, activeMarket))
      .map(applyIssueDecision);
    const visibleSkus = isApiMode || isPlanFactMode ? sourceSkus : filteredRegistrySkus(sourceSkus, taskMap, activeMarket);
    const owners = activeMode === 'api' ? ownerOptionsForIssues(issueRows, activeMarket) : ownerOptionsForSkus(sourceSkus, activeMarket);
    const segments = activeMode === 'api' ? segmentOptionsForIssues(issueRows) : segmentOptionsForSkus(sourceSkus);
    const lifecycles = activeMode === 'api' ? issueTypeOptions(issueRows) : lifecycleOptionsForSkus(sourceSkus);
    if (stateRef.filters.owner !== 'all' && !owners.includes(stateRef.filters.owner)) stateRef.filters.owner = 'all';
    if (stateRef.filters.segment !== 'all' && !segments.includes(stateRef.filters.segment)) stateRef.filters.segment = 'all';
    if (stateRef.filters.lifecycle !== 'all' && !lifecycles.some((item) => item.key === stateRef.filters.lifecycle)) stateRef.filters.lifecycle = 'all';
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
          ${activeMode === 'api' ? renderApiContourV1(root, context) : activeMode === 'planfact' ? renderPlanFactWorkspaceV1(root, context) : renderSkuRegistryV1(root, context)}
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

  function clonePlain(value, fallback) {
    try {
      if (typeof cloneJsonValue === 'function') return cloneJsonValue(value ?? fallback);
    } catch {
      // ignored
    }
    try {
      return JSON.parse(JSON.stringify(value ?? fallback));
    } catch {
      return fallback;
    }
  }

  function aliasRowsFromPayload(payload = {}) {
    if (typeof skuPlanFactAliasRows === 'function') return skuPlanFactAliasRows(payload);
    if (Array.isArray(payload)) return payload;
    return Array.isArray(payload?.aliases) ? payload.aliases : [];
  }

  function ignoreRowsFromPayload(payload = {}) {
    if (typeof skuPlanFactIgnorePayloadRows === 'function') return skuPlanFactIgnorePayloadRows(payload);
    if (Array.isArray(payload)) return payload;
    return Array.isArray(payload?.ignored) ? payload.ignored : [];
  }

  function normalizeAliasPlatform(value = '') {
    if (typeof skuPlanFactNormalizePlatform === 'function') return skuPlanFactNormalizePlatform(value || 'all') || 'all';
    return normalizeMarket(value || 'all') || 'all';
  }

  function aliasToken(value = '') {
    if (typeof skuPlanFactToken === 'function') return skuPlanFactToken(value);
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '');
  }

  function aliasKey(row = {}) {
    if (typeof skuPlanFactAliasKey === 'function') return skuPlanFactAliasKey(row);
    return [
      normalizeAliasPlatform(row.platform || 'all'),
      aliasToken(row.api_sku || row.apiSku || ''),
      aliasToken(row.target_sku || row.targetSku || row.target || '')
    ].join('|');
  }

  function ignoreKey(platform = 'all', apiSku = '') {
    if (typeof skuPlanFactIgnoreKey === 'function') return skuPlanFactIgnoreKey(platform, apiSku);
    return `${normalizeAliasPlatform(platform || 'all')}|${aliasToken(apiSku)}`;
  }

  function fallbackAliasReport(row = {}) {
    const stateRef = appState();
    const generatedAt = new Date().toISOString();
    const platform = normalizeAliasPlatform(row.platform || 'all');
    const apiSku = String(row.api_sku || row.apiSku || '').trim();
    const targetSku = String(row.target_sku || row.targetSku || '').trim();
    const note = String(row.note || `Quick action from SKU workspace ${todayKey()}`).trim();
    const currentAliases = stateRef.skuAliases || { schema: 'sku-api-aliases-v1', aliases: [] };
    const currentIgnore = stateRef.skuAliasIgnore || { schema: 'sku-api-ignore-v1', ignored: [] };
    const aliasPayload = Array.isArray(currentAliases)
      ? { schema: 'sku-api-aliases-v1', columns: ['target_sku', 'platform', 'api_sku', 'status', 'note'], aliases: clonePlain(currentAliases, []) }
      : {
        schema: 'sku-api-aliases-v1',
        columns: currentAliases.columns || ['target_sku', 'platform', 'api_sku', 'status', 'note'],
        ...clonePlain(currentAliases, {}),
        aliases: clonePlain(aliasRowsFromPayload(currentAliases), [])
      };
    const ignorePayload = Array.isArray(currentIgnore)
      ? { schema: 'sku-api-ignore-v1', columns: ['platform', 'api_sku', 'status', 'note'], ignored: clonePlain(currentIgnore, []) }
      : {
        schema: 'sku-api-ignore-v1',
        columns: currentIgnore.columns || ['platform', 'api_sku', 'status', 'note'],
        ...clonePlain(currentIgnore, {}),
        ignored: clonePlain(ignoreRowsFromPayload(currentIgnore), [])
      };
    const action = String(row.decision || row.action || '').toLowerCase();
    const aliases = [];
    const ignores = [];
    const errorRows = [];
    const duplicateRows = [];

    if (!apiSku) {
      errorRows.push({ rowNumber: 2, reason: 'api_sku is required' });
    } else if (action === 'ignore') {
      const ignore = { platform, api_sku: apiSku, status: 'ignored', note, updatedAt: generatedAt };
      const key = ignoreKey(platform, apiSku);
      const existing = new Set(ignorePayload.ignored.map((item) => ignoreKey(item.platform || 'all', item.api_sku || item.apiSku || item.alias || item.value || '')));
      if (existing.has(key)) duplicateRows.push({ rowNumber: 2, apiSku, platform, reason: 'ignore duplicate' });
      else {
        ignorePayload.ignored.push(ignore);
        ignores.push(ignore);
      }
    } else if (!targetSku) {
      errorRows.push({ rowNumber: 2, apiSku, platform, reason: 'target_sku is required for alias' });
    } else {
      const alias = { target_sku: targetSku, platform, api_sku: apiSku, status: row.status || 'active', note };
      const key = aliasKey(alias);
      const existing = new Set(aliasPayload.aliases.map(aliasKey));
      if (existing.has(key)) duplicateRows.push({ rowNumber: 2, apiSku, platform, targetSku, reason: 'alias duplicate' });
      else {
        aliasPayload.aliases.push(alias);
        aliases.push(alias);
      }
    }

    aliasPayload.updatedAt = generatedAt;
    ignorePayload.updatedAt = generatedAt;
    return {
      generatedAt,
      sourceRows: 1,
      candidateAliases: aliases.length,
      candidateIgnores: ignores.length,
      validationWarnings: [],
      duplicateRows,
      skippedRows: [],
      errorRows,
      newSkuRows: [],
      needCheckRows: [],
      aliases,
      ignores,
      aliasPayload,
      ignorePayload
    };
  }

  function applySkuV1AliasReportToState(report = {}) {
    const stateRef = appState();
    if (!report || typeof report !== 'object') return;
    if (report.aliasPayload) stateRef.skuAliases = report.aliasPayload;
    if (report.ignorePayload) stateRef.skuAliasIgnore = report.ignorePayload;
    try {
      if (typeof skuPlanFactApplyAliasesToStateSkus === 'function') {
        skuPlanFactApplyAliasesToStateSkus(report.aliases || []);
      } else {
        (report.aliases || []).forEach((alias) => {
          const targetSku = alias.target_sku || alias.targetSku || alias.target || '';
          const apiSku = alias.api_sku || alias.apiSku || alias.alias || alias.value || '';
          const sku = findSkuByArticle(targetSku);
          if (!sku || !apiSku) return;
          const platform = normalizeAliasPlatform(alias.platform || 'all');
          sku.platformAliases = sku.platformAliases && typeof sku.platformAliases === 'object' ? sku.platformAliases : {};
          const values = Array.isArray(sku.platformAliases[platform]) ? sku.platformAliases[platform] : [];
          if (!values.some((value) => aliasToken(value) === aliasToken(apiSku))) values.push(apiSku);
          sku.platformAliases[platform] = values;
          sku.aliases = Array.isArray(sku.aliases) ? sku.aliases : [];
          if (!sku.aliases.some((value) => aliasToken(typeof value === 'string' ? value : (value?.value || value?.alias || '')) === aliasToken(apiSku))) {
            sku.aliases.push({ value: apiSku, platform, source: 'sku-workspace' });
          }
        });
      }
      if (typeof skuPlanFactBuildRuntimeSkuMatrix === 'function') {
        stateRef.skuMatrix = skuPlanFactBuildRuntimeSkuMatrix(stateRef.skuAliases || {}, stateRef.skuAliasIgnore || {});
      }
      if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
      if (typeof saveLocalStorage === 'function') saveLocalStorage();
      window.dispatchEvent(new CustomEvent('altea:sku-workspace-updated', { detail: { source: 'sku-launch-v1' } }));
    } catch (error) {
      console.warn('[sku-launch-v1] local alias apply failed', error);
    }
  }

  async function handleSkuV1QuickDecision(button, rootId = 'view-sku-contour') {
    const stateRef = appState();
    const decision = button?.dataset?.skuV1QuickDecision || 'need_check';
    const apiSku = String(button?.dataset?.skuV1ApiSku || '').trim();
    const platform = String(button?.dataset?.skuV1Platform || 'all').trim() || 'all';
    const targetSku = String(button?.dataset?.skuV1TargetSku || '').trim();
    if (!apiSku) {
      launchV1Toast('Не вижу API SKU для действия.');
      return;
    }
    if (decision === 'need_check') {
      setIssueDecision({
        platform,
        apiSku,
        status: 'need_check',
        kind: 'need_check',
        targetSku,
        note: `Manual check from SKU workspace ${todayKey()}`
      });
      stateRef.skuContourOnlyNew = false;
      launchV1Toast('Строка переведена в ручную проверку.');
      renderSkuWorkspaceV1(rootId);
      return;
      stateRef.filters = stateRef.filters || {};
      stateRef.filters.search = apiSku;
      stateRef.skuContourOnlyNew = false;
      launchV1Toast('Строка в фокусе: проверьте кандидата и выберите связь.');
      renderSkuWorkspaceV1(rootId);
      return;
    }
    if (decision === 'alias' && !targetSku) {
      launchV1Toast('Для связи нужен SKU из реестра.');
      return;
    }
    const prepare = typeof skuPlanFactPrepareAliasImport === 'function'
      ? skuPlanFactPrepareAliasImport
      : window.skuPlanFactPrepareAliasImport;
    const apply = typeof handleSkuPlanFactApplyAliasImport === 'function'
      ? handleSkuPlanFactApplyAliasImport
      : window.handleSkuPlanFactApplyAliasImport;
    if (false && (typeof prepare !== 'function' || typeof apply !== 'function')) {
      launchV1Toast('Механизм связи SKU еще не загружен.');
      return;
    }
    const row = {
      platform,
      api_sku: apiSku,
      target_sku: decision === 'alias' ? targetSku : '',
      decision: decision === 'ignore' ? 'ignore' : 'alias',
      action: decision === 'ignore' ? 'ignore' : 'alias',
      status: decision === 'ignore' ? 'ignored' : 'active',
      note: `Quick action from SKU workspace ${todayKey()}`
    };
    const report = typeof prepare === 'function'
      ? prepare([row], stateRef.skuAliases || {}, stateRef.skuAliasIgnore || {})
      : fallbackAliasReport(row);
    stateRef.skuPlanFactAliasImportReport = { ...report, fileName: `quick-sku-workspace-${todayKey()}.json` };
    if ((report.errorRows || []).length) {
      const message = report.errorRows[0]?.reason || 'Не удалось подготовить связь SKU.';
      if (typeof setAppError === 'function') setAppError(message);
      launchV1Toast(message);
      renderSkuWorkspaceV1(rootId);
      return;
    }
    const originalText = button.textContent;
    try {
      button.disabled = true;
      button.textContent = decision === 'ignore' ? 'Исключаем...' : 'Связываем...';
      applySkuV1AliasReportToState(report);
      setIssueDecision({
        platform,
        apiSku,
        status: decision === 'ignore' ? 'ignored' : 'applied',
        kind: decision === 'ignore' ? 'ignore' : 'alias',
        targetSku: decision === 'alias' ? targetSku : '',
        note: row.note
      });
      if (typeof apply === 'function') {
        try {
          await apply(button, rootId);
        } catch (error) {
          console.warn('[sku-launch-v1] external alias apply failed', error);
        }
      }
      launchV1Toast(decision === 'ignore' ? 'API SKU исключен.' : 'SKU связан.');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      renderSkuWorkspaceV1(rootId);
    }
  }

  async function handleSkuV1RowStatusChange(select, rootId = 'view-sku-contour') {
    const stateRef = appState();
    const apiSku = String(select?.dataset?.skuV1ApiSku || '').trim();
    const platform = String(select?.dataset?.skuV1Platform || 'all').trim() || 'all';
    const status = String(select?.value || 'new').trim();
    if (!apiSku) {
      launchV1Toast('Не вижу API SKU для смены статуса.');
      return;
    }
    if (status === 'new') {
      setIssueDecision({ platform, apiSku, status: '' });
      launchV1Toast('Строка возвращена в новые.');
      renderSkuWorkspaceV1(rootId);
      return;
    }
    if (status === 'ignored') {
      const row = {
        platform,
        api_sku: apiSku,
        decision: 'ignore',
        action: 'ignore',
        status: 'ignored',
        note: `Status changed from SKU workspace ${todayKey()}`
      };
      const prepare = typeof skuPlanFactPrepareAliasImport === 'function'
        ? skuPlanFactPrepareAliasImport
        : window.skuPlanFactPrepareAliasImport;
      const report = typeof prepare === 'function'
        ? prepare([row], stateRef.skuAliases || {}, stateRef.skuAliasIgnore || {})
        : fallbackAliasReport(row);
      stateRef.skuPlanFactAliasImportReport = { ...report, fileName: `status-sku-workspace-${todayKey()}.json` };
      if (!(report.errorRows || []).length) applySkuV1AliasReportToState(report);
      setIssueDecision({ platform, apiSku, status: 'ignored', kind: 'ignore', note: row.note });
      launchV1Toast('API SKU исключен из очереди.');
      renderSkuWorkspaceV1(rootId);
      return;
    }
    setIssueDecision({
      platform,
      apiSku,
      status,
      kind: status,
      note: `Status changed from SKU workspace ${todayKey()}`
    });
    stateRef.skuContourOnlyNew = false;
    launchV1Toast('Статус строки обновлен.');
    renderSkuWorkspaceV1(rootId);
  }

  function applySkuV1ProductStatusLocal(articleKey = '', meta = {}, status = '') {
    const stateRef = appState();
    stateRef.storage = stateRef.storage || {};
    stateRef.storage.productLifecycleOverrides = Array.isArray(stateRef.storage.productLifecycleOverrides)
      ? stateRef.storage.productLifecycleOverrides.filter((item) => String(item?.articleKey || '') !== articleKey)
      : [];
    stateRef.storage.productLifecycleOverrides.unshift({
      articleKey,
      key: meta.key || status,
      status: meta.label || status,
      note: 'Quick status from SKU workspace',
      updatedAt: new Date().toISOString(),
      updatedBy: stateRef.team?.member?.name || stateRef.team?.userId || 'portal-user'
    });
    const sku = findSkuByArticle(articleKey);
    if (sku) {
      sku.productLifecycle = {
        ...(sku.productLifecycle || {}),
        ...meta,
        key: meta.key || status,
        label: meta.label || status,
        status: meta.label || status,
        source: 'sku-workspace'
      };
      sku.status = meta.label || status;
    }
    try {
      if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
      if (typeof invalidateRepricerRowsCache === 'function') invalidateRepricerRowsCache();
      if (typeof saveLocalStorage === 'function') saveLocalStorage();
    } catch (error) {
      console.warn('[sku-launch-v1] local product status save failed', error);
    }
  }

  async function handleSkuV1ProductStatusChange(select, rootId = 'view-sku-contour') {
    const articleKey = String(select?.dataset?.skuV1ProductStatus || '').trim();
    const status = String(select?.value || 'active').trim();
    if (!articleKey) {
      launchV1Toast('Не вижу артикул для смены статуса.');
      return;
    }
    const meta = typeof productLifecycleMeta === 'function'
      ? productLifecycleMeta(status)
      : { key: status, label: status };
    applySkuV1ProductStatusLocal(articleKey, meta, status);
    launchV1Toast('Статус товара обновлен.');
    renderSkuWorkspaceV1(rootId);
    if (typeof upsertProductLifecycleStatus === 'function') {
      Promise.resolve(upsertProductLifecycleStatus({
        articleKey,
        status: meta.label || status,
        key: meta.key || status,
        note: 'Quick status from SKU workspace'
      })).catch((error) => {
        console.warn('[sku-launch-v1] product status background sync failed', error);
        launchV1Toast('Статус сохранен локально, синхронизация позже.');
      });
    }
  }

  function reviewFormRowsCsv(rows = []) {
    const cells = [
      ['platform', 'api_sku', 'problem', 'target_sku', 'candidate', 'revenue', 'units', 'status', 'action']
    ];
    rows.forEach((row) => {
      const candidates = issueCandidates(row, 1);
      const suggestion = issueSuggestion(row, candidates);
      cells.push([
        issuePlatform(row, 'all'),
        issueApiSku(row),
        issueTypeLabel(row),
        suggestion.targetSku || row.targetSku || row.target_sku || '',
        candidates[0]?.articleKey || candidates[0]?.article || '',
        row.revenue || 0,
        row.units || 0,
        row.status || 'new',
        suggestion.text || row.action || ''
      ]);
    });
    return cells.map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  }

  function downloadReviewFormCsv(rows = []) {
    const blob = new Blob(['\uFEFF', reviewFormRowsCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sku-api-review-${todayKey()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openSkuV1ReviewForm(rootId = 'view-sku-contour') {
    const previous = document.querySelector('[data-sku-v1-review-backdrop]');
    if (previous) previous.remove();
    const activeMarket = readGlobalMarket();
    const model = planModelForWorkspace(activeMarket);
    const sourceSkus = (appState().skus || []).filter((sku) => skuBelongsToMarket(sku, activeMarket));
    const rawIssueRows = typeof skuContourIssueRows === 'function' ? skuContourIssueRows(model) : [];
    const issueRows = rawIssueRows
      .filter((row) => issuePlatformMatches(row, activeMarket))
      .map(applyIssueDecision);
    const context = { activeMarket, sourceSkus, issueRows, model };
    const rows = filteredApiIssues(issueRows.filter((row) => !issueIsResolved(row)), context).slice(0, 120);
    const backdrop = document.createElement('div');
    backdrop.className = 'launch-v1-editor-backdrop sl-v1-review-backdrop';
    backdrop.setAttribute('data-sku-v1-review-backdrop', '');
    backdrop.innerHTML = `
      <div class="launch-v1-editor sl-v1-review-dialog" role="dialog" aria-modal="true" aria-label="Форма разбора API SKU">
        <header>
          <div>
            <span>Форма разбора</span>
            <h3>API SKU без пары</h3>
            <p>${escapeValue(marketLabel(activeMarket))} · ${formatInt(rows.length)} строк в работе</p>
          </div>
          <button type="button" data-sku-v1-review-close aria-label="Закрыть">×</button>
        </header>
        <div class="sl-v1-review-tools">
          <button type="button" data-sku-v1-review-csv>CSV</button>
          <button type="button" data-sku-v1-review-close>Готово</button>
        </div>
        <div class="sl-v1-review-list">
          ${rows.map((row) => {
            const candidates = issueCandidates(row, 3);
            const suggestion = issueSuggestion(row, candidates);
            const apiSku = issueApiSku(row);
            const platform = issuePlatform(row, activeMarket);
            const targetSku = String(suggestion.targetSku || candidates[0]?.articleKey || candidates[0]?.article || '').trim();
            return `
              <article class="sl-v1-review-row">
                <div>
                  ${safeBadge(issueStatusLabel(row.status || 'new'), issueTone(row))}
                  <strong>${escapeValue(apiSku || 'API SKU')}</strong>
                  <span>${escapeValue(issueTypeLabel(row))} · ${escapeValue(marketLabel(platform))}</span>
                  <small>${formatMoney(row.revenue || 0)} · ${formatInt(row.units || 0)} шт.</small>
                </div>
                <select class="sl-v1-inline-select"
                  data-sku-v1-row-status
                  data-sku-v1-api-sku="${escapeValue(apiSku)}"
                  data-sku-v1-platform="${escapeValue(platform)}">
                  ${[
                    ['new', 'new'],
                    ['need_check', 'проверка'],
                    ['blocked', 'blocked'],
                    ['ignored', 'игнор']
                  ].map(([value, label]) => `<option value="${escapeValue(value)}" ${String(row.status || 'new').toLowerCase() === value ? 'selected' : ''}>${escapeValue(label)}</option>`).join('')}
                </select>
                <div class="sl-v1-review-candidates">
                  ${candidates.map((candidate) => {
                    const articleKey = candidate.articleKey || candidate.article || '';
                    return `
                      <button type="button"
                        data-sku-v1-quick-decision="alias"
                        data-sku-v1-api-sku="${escapeValue(apiSku)}"
                        data-sku-v1-platform="${escapeValue(platform)}"
                        data-sku-v1-target-sku="${escapeValue(articleKey)}">
                        <b>${escapeValue(articleKey)}</b>
                        <span>${formatPct(candidate.matchScore || 0)}</span>
                      </button>
                    `;
                  }).join('') || '<em>Кандидатов нет</em>'}
                </div>
                <div class="sl-v1-review-actions">
                  <button type="button"
                    data-sku-v1-quick-decision="${targetSku ? 'alias' : 'need_check'}"
                    data-sku-v1-api-sku="${escapeValue(apiSku)}"
                    data-sku-v1-platform="${escapeValue(platform)}"
                    data-sku-v1-target-sku="${escapeValue(targetSku)}">${targetSku ? 'Связать SKU' : 'Проверить'}</button>
                  <button type="button"
                    data-sku-v1-quick-decision="ignore"
                    data-sku-v1-api-sku="${escapeValue(apiSku)}"
                    data-sku-v1-platform="${escapeValue(platform)}"
                    data-sku-v1-target-sku="">Игнорировать</button>
                </div>
              </article>
            `;
          }).join('') || '<div class="sl-v1-empty">Неразобранных API SKU по текущему срезу нет.</div>'}
        </div>
      </div>
    `;
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop || event.target.closest('[data-sku-v1-review-close]')) close();
    });
    backdrop.querySelector('[data-sku-v1-review-csv]')?.addEventListener('click', () => downloadReviewFormCsv(rows));
    backdrop.querySelectorAll('[data-sku-v1-row-status]').forEach((select) => {
      select.addEventListener('click', (event) => event.stopPropagation());
      select.addEventListener('change', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await handleSkuV1RowStatusChange(event.currentTarget, rootId);
        close();
      });
    });
    backdrop.querySelectorAll('[data-sku-v1-quick-decision]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await handleSkuV1QuickDecision(event.currentTarget, rootId);
        close();
      });
    });
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.querySelector('[data-sku-v1-review-close]')?.focus?.());
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
      stateRef.skuV1ColumnsOpen = !stateRef.skuV1ColumnsOpen;
      rerender();
    });
    root.querySelectorAll('[data-sku-v1-column-jump]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.skuV1ColumnJump || 0);
        const wrap = root.querySelector('.sl-v1-table-wrap');
        const header = wrap?.querySelector(`.sl-v1-table thead th:nth-child(${index + 1})`);
        if (!wrap || !header) return;
        wrap.scrollLeft = Math.max(0, header.offsetLeft - 24);
        header.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    });
    root.querySelectorAll('[data-sku-v1-quick-decision]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await handleSkuV1QuickDecision(event.currentTarget, root.id || 'view-sku-contour');
      });
    });
    root.querySelectorAll('[data-sku-v1-row-status]').forEach((select) => {
      select.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      select.addEventListener('change', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await handleSkuV1RowStatusChange(event.currentTarget, root.id || 'view-sku-contour');
      });
    });
    root.querySelectorAll('[data-sku-v1-product-status]').forEach((select) => {
      select.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      select.addEventListener('change', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await handleSkuV1ProductStatusChange(event.currentTarget, root.id || 'view-sku-contour');
      });
    });
    root.querySelector('[data-sku-v1-toggle-new]')?.addEventListener('click', () => {
      stateRef.skuContourOnlyNew = !stateRef.skuContourOnlyNew;
      rerender();
    });
    root.querySelector('[data-sku-v1-toggle-resolved]')?.addEventListener('click', () => {
      stateRef.skuContourShowResolved = !stateRef.skuContourShowResolved;
      rerender();
    });
    root.querySelector('[data-sku-v1-review-form]')?.addEventListener('click', () => openSkuV1ReviewForm(root.id || 'view-sku-contour'));
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
    return launchNormalizeDateKey(item?.launchDate || item?.dueDate || item?.date || '') || '';
  }

  function launchNormalizeDateKey(value = '', fallbackYear = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const numeric = raw.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
    if (numeric) {
      const year = numeric[3]
        ? (numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
        : (fallbackYear || String(new Date().getFullYear()));
      return `${year}-${String(Number(numeric[2])).padStart(2, '0')}-${String(Number(numeric[1])).padStart(2, '0')}`;
    }
    return '';
  }

  function launchExactDue(item) {
    return launchNormalizeDateKey(item?.launchDate || item?.dueDate || item?.date || item?.launchDateKey || '');
  }

  function launchDateField(item, fields = []) {
    const fallbackYear = String(launchItemMonthKey(item) || '').slice(0, 4);
    for (const field of fields) {
      const value = launchNormalizeDateKey(item?.[field], fallbackYear);
      if (value) return value;
    }
    return '';
  }

  function launchFirstStockDate(item) {
    return launchDateField(item, ['firstStockDate', 'firstWarehouseDate', 'warehouseDate', 'supplyDate', 'stockDate']);
  }

  function launchDueText(item) {
    if (typeof launchDueDateLabel === 'function') return launchDueDateLabel(item);
    return launchDue(item) || 'Без даты';
  }

  function launchMonthKey(dateKey = '') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return `${dateKey.slice(0, 7)}-01`;
    return `${todayKey().slice(0, 7)}-01`;
  }

  function launchDateKey(date) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return todayKey();
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0')
    ].join('-');
  }

  function launchMonthLabel(monthKey = '') {
    if (typeof launchCalendarMonthLabel === 'function') return launchCalendarMonthLabel(monthKey);
    return new Date(`${monthKey || launchMonthKey()}T00:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  }

  function launchMonthKeyFromLabel(label = '') {
    if (typeof launchMonthDateKey === 'function') {
      const key = launchMonthDateKey(label);
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return launchMonthKey(key);
    }
    const match = String(label || '').trim().toLowerCase().match(/([а-яё]+)\s+(\d{4})/i);
    if (!match) return '';
    const monthMap = {
      январь: '01',
      января: '01',
      февраль: '02',
      февраля: '02',
      март: '03',
      марта: '03',
      апрель: '04',
      апреля: '04',
      май: '05',
      мая: '05',
      июнь: '06',
      июня: '06',
      июль: '07',
      июля: '07',
      август: '08',
      августа: '08',
      сентябрь: '09',
      сентября: '09',
      октябрь: '10',
      октября: '10',
      ноябрь: '11',
      ноября: '11',
      декабрь: '12',
      декабря: '12'
    };
    const month = monthMap[match[1]];
    return month ? `${match[2]}-${month}-01` : '';
  }

  function launchItemMonthKey(item) {
    const exact = launchExactDue(item);
    if (exact) return launchMonthKey(exact);
    const due = launchDue(item);
    if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return launchMonthKey(due);
    return launchMonthKeyFromLabel(item?.launchMonth || item?.month || '');
  }

  function launchCalendarDay(item, monthKey = '') {
    const month = /^\d{4}-\d{2}-\d{2}$/.test(monthKey) ? monthKey : '';
    const candidates = [
      launchExactDue(item),
      launchFirstStockDate(item)
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (!month || launchMonthKey(candidate) === month) return candidate;
    }
    const itemMonth = launchItemMonthKey(item);
    if (itemMonth && (!month || itemMonth === month)) return itemMonth;
    return '';
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
      return launchDateKey(day);
    });
  }

  function addMonths(monthKey, delta) {
    if (typeof launchCalendarAddMonths === 'function') return launchCalendarAddMonths(monthKey, delta);
    const date = new Date(`${monthKey || launchMonthKey()}T00:00:00`);
    date.setMonth(date.getMonth() + delta);
    return `${launchDateKey(date).slice(0, 7)}-01`;
  }

  function stageEntries(item) {
    const memo = item && typeof item === 'object' ? launchMemo().stageEntries : null;
    if (memo?.has(item)) return memo.get(item);
    const entries = typeof launchStageEntries === 'function' ? launchStageEntries(item) : [
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
    memo?.set(item, entries);
    return entries;
  }

  const LAUNCH_V1_STAGE_STATUSES = [
    { key: 'empty', label: 'не начато', value: '' },
    { key: 'work', label: 'в работе', value: 'в работе' },
    { key: 'done', label: 'готово', value: 'готово' },
    { key: 'blocked', label: 'блокер', value: 'блокер' }
  ];
  const LAUNCH_BOARD_STATUS_ORDER = [
    { key: 'blocked', label: 'Блокеры' },
    { key: 'negotiation', label: 'Переговоры' },
    { key: 'sample', label: 'Пробный образец' },
    { key: 'production', label: 'Производство' },
    { key: 'packaging', label: 'Упаковка' },
    { key: 'content', label: 'Карточка / контент' },
    { key: 'readiness', label: 'Готовность к запуску' },
    { key: 'done', label: 'Готово' },
    { key: 'other', label: 'Другое' }
  ];
  const LAUNCH_BOARD_STAGE_FLOW = [
    { key: 'negotiation', field: 'negotiationStatus', label: 'Переговоры' },
    { key: 'sample', field: 'sampleStatus', label: 'Пробный образец' },
    { key: 'production', field: 'productionStatus', label: 'Производство' },
    { key: 'packaging', field: 'packagingStatus', label: 'Упаковка' },
    { key: 'content', field: 'contentStatus', label: 'Карточка / контент' },
    { key: 'readiness', field: 'launchReadinessStatus', label: 'Готовность к запуску' }
  ];

  function launchV1StatusTone(value = '') {
    const text = String(value || '').toLowerCase();
    if (/готов|done|ok|закрыт/.test(text)) return 'ok';
    if (/блок|стоп|stop|риск|проср/.test(text)) return 'danger';
    if (/работ|процесс|ждем|ждём|соглас/.test(text)) return 'warn';
    return '';
  }

  function launchV1StatusOptions(current = '') {
    const normalized = String(current || '').trim().toLowerCase();
    const base = ['', 'в работе', 'готово', 'блокер', 'переговоры', 'пробный образец', 'производство'];
    const values = [...new Set([...base, current].filter((value) => value !== undefined))];
    return values.map((value) => {
      const label = value || 'не начато';
      return `<option value="${escapeValue(value)}"${String(value || '').trim().toLowerCase() === normalized ? ' selected' : ''}>${escapeValue(label)}</option>`;
    }).join('');
  }

  function launchV1FindItem(id = '') {
    const key = String(id || '').trim();
    return launchItemsV1().find((item) => launchId(item) === key) || null;
  }

  function launchV1DraftId() {
    return `launch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function launchV1DefaultDraft(defaults = {}) {
    const date = defaults.launchDate || defaults.dueDate || todayKey();
    return {
      id: defaults.id || launchV1DraftId(),
      name: defaults.name || 'Новая новинка',
      articleKey: defaults.articleKey || '',
      owner: defaults.owner || '',
      productFileUrl: defaults.productFileUrl || defaults.productFile || defaults.briefUrl || defaults.presentationUrl || defaults.fileUrl || '',
      firstStockDate: defaults.firstStockDate || defaults.firstWarehouseDate || defaults.warehouseDate || defaults.supplyDate || defaults.stockDate || date,
      mpStockDate: defaults.mpStockDate || defaults.marketplaceStockDate || defaults.marketplaceWarehouseDate || defaults.mpWarehouseDate || '',
      repeatOrderDate: defaults.repeatOrderDate || defaults.nextOrderDate || defaults.plannedReorderDate || defaults.reorderDate || '',
      marketingLead: defaults.marketingLead || defaults.marketingManager || defaults.leadOwner || '',
      marketingOwner: defaults.marketingOwner || defaults.marketer || '',
      prOwner: defaults.prOwner || defaults.smmOwner || defaults.contentOwner || '',
      logistOwner: defaults.logistOwner || defaults.logisticsOwner || defaults.supplyOwner || '',
      kzOwner: defaults.kzOwner || defaults.selfBuyOwner || defaults.buyoutOwner || '',
      ropOwner: defaults.ropOwner || defaults.salesOwner || defaults.commercialOwner || '',
      reportGroup: defaults.reportGroup || defaults.category || 'Продукт',
      status: defaults.status || 'в работе',
      marketplaces: defaults.marketplaces || (typeof currentMarketplace === 'function' ? currentMarketplace() : 'WB'),
      launchDate: date,
      dueDate: date,
      launchMonth: typeof launchMonthLabel === 'function' ? launchMonthLabel(launchMonthKey(date)) : date.slice(0, 7),
      productComment: defaults.productComment || defaults.notes || '',
      negotiationStatus: defaults.negotiationStatus || 'в работе',
      sampleStatus: defaults.sampleStatus || '',
      productionStatus: defaults.productionStatus || '',
      packagingStatus: defaults.packagingStatus || '',
      contentStatus: defaults.contentStatus || '',
      launchReadinessStatus: defaults.launchReadinessStatus || ''
    };
  }

  function launchV1SaveDraft(item = {}) {
    const draft = { ...item, id: item.id || launchId(item) || launchV1DraftId() };
    let saved = draft;
    if (typeof upsertLaunchDraft === 'function') {
      saved = upsertLaunchDraft(draft) || draft;
    } else {
      const stateRef = appState();
      stateRef.storage = stateRef.storage || {};
      const list = Array.isArray(stateRef.storage.launchOverrides) ? stateRef.storage.launchOverrides : [];
      stateRef.storage.launchOverrides = [draft, ...list.filter((entry) => launchId(entry) !== draft.id)];
      if (Array.isArray(stateRef.storage.launchDeletedIds)) {
        stateRef.storage.launchDeletedIds = stateRef.storage.launchDeletedIds.filter((entry) => String(entry) !== draft.id);
      }
      try { if (typeof saveLocalStorage === 'function') saveLocalStorage(); } catch {}
    }
    try { window.dispatchEvent(new CustomEvent('altea:portal-storage-updated', { detail: { source: 'launch-v1' } })); } catch {}
    return saved;
  }

  function launchV1DeleteDraft(id = '') {
    const key = String(id || '').trim();
    if (!key) return;
    if (typeof deleteLaunchDraft === 'function') {
      deleteLaunchDraft(key);
    } else {
      const stateRef = appState();
      stateRef.storage = stateRef.storage || {};
      stateRef.storage.launchOverrides = (stateRef.storage.launchOverrides || []).filter((entry) => launchId(entry) !== key);
      stateRef.storage.launchDeletedIds = [...new Set([...(stateRef.storage.launchDeletedIds || []), key])];
      try { if (typeof saveLocalStorage === 'function') saveLocalStorage(); } catch {}
    }
    try { window.dispatchEvent(new CustomEvent('altea:portal-storage-updated', { detail: { source: 'launch-v1' } })); } catch {}
  }

  function launchV1Toast(text = '') {
    const toast = document.createElement('div');
    toast.className = 'launch-v1-toast';
    toast.textContent = text || 'Сохранено';
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2200);
  }

  function launchV1StageActions(item, entry) {
    const field = entry?.config?.status || '';
    if (!field) return '';
    const itemId = launchId(item);
    const current = String(entry.status || '').trim().toLowerCase();
    return `
      <div class="launch-v1-stage-actions" role="group" aria-label="Статус этапа">
        ${LAUNCH_V1_STAGE_STATUSES.map((status) => {
          const active = String(status.value || '').trim().toLowerCase() === current;
          return `<button type="button" class="${active ? 'active' : ''}" data-launch-v1-stage-status="${escapeValue(status.value)}" data-launch-v1-stage="${escapeValue(field)}" data-launch-v1-id="${escapeValue(itemId)}">${escapeValue(status.label)}</button>`;
        }).join('')}
      </div>
    `;
  }

  function launchV1SetStageStatus(itemId = '', stageField = '', status = '') {
    const item = launchV1FindItem(itemId);
    if (!item || !stageField) return;
    const draft = { ...item, id: launchId(item), [stageField]: status };
    const entry = stageEntries(item).find((stage) => stage.config?.status === stageField);
    if (entry?.config?.comment && status && !draft[entry.config.comment]) draft[entry.config.comment] = status === 'блокер' ? 'нужна проверка' : '';
    if (status) draft.status = status === 'готово' ? 'в работе' : status;
    launchV1SaveDraft(draft);
    appState().launchV1SelectedId = draft.id;
    launchV1Toast('Статус этапа сохранен');
    renderLaunchesV1('view-launches');
  }

  function launchV1MoveToDate(itemId = '', dateKey = '') {
    const targetDate = launchNormalizeDateKey(dateKey);
    if (!itemId || !targetDate) return;
    const item = launchV1FindItem(itemId);
    if (!item) return;
    const monthKey = launchMonthKey(targetDate);
    const draft = {
      ...item,
      id: launchId(item),
      launchDate: targetDate,
      dueDate: targetDate,
      firstStockDate: targetDate,
      launchMonth: typeof launchMonthLabel === 'function' ? launchMonthLabel(monthKey) : monthKey.slice(0, 7)
    };
    if (item.firstWarehouseDate) draft.firstWarehouseDate = targetDate;
    if (item.warehouseDate) draft.warehouseDate = targetDate;
    if (item.supplyDate) draft.supplyDate = targetDate;
    if (item.stockDate) draft.stockDate = targetDate;
    launchV1SaveDraft(draft);
    const filters = launchFilters();
    if (filters.month && filters.month !== 'all') filters.month = monthKey;
    appState().launchV1SelectedId = draft.id;
    appState().launchV1FullKanban = false;
    launchV1Toast('Дата новинки обновлена');
    renderLaunchesV1('view-launches');
  }

  function launchV1MoveToBoardStatus(itemId = '', statusKey = '') {
    const key = String(statusKey || '').trim();
    if (!itemId || !key) return;
    const item = launchV1FindItem(itemId);
    if (!item) return;
    const draft = { ...item, id: launchId(item), blockers: [] };
    const stageIndex = LAUNCH_BOARD_STAGE_FLOW.findIndex((stage) => stage.key === key);
    if (key === 'blocked') {
      const current = currentStage(item);
      const field = current?.config?.status || LAUNCH_BOARD_STAGE_FLOW[0].field;
      draft[field] = 'блокер';
      draft.status = 'блокер';
    } else if (key === 'done') {
      LAUNCH_BOARD_STAGE_FLOW.forEach((stage) => {
        draft[stage.field] = 'готово';
      });
      draft.status = 'готово';
    } else if (stageIndex >= 0) {
      LAUNCH_BOARD_STAGE_FLOW.forEach((stage, index) => {
        const currentValue = String(draft[stage.field] || '').trim();
        if (index < stageIndex) {
          draft[stage.field] = 'готово';
        } else if (index === stageIndex) {
          draft[stage.field] = /готов|блок|stop|риск/i.test(currentValue) || !currentValue ? 'в работе' : currentValue;
        } else if (/блок|stop|риск/i.test(currentValue)) {
          draft[stage.field] = '';
        }
      });
      draft.status = LAUNCH_BOARD_STAGE_FLOW[stageIndex].label;
    } else {
      draft.status = 'в работе';
    }
    launchV1SaveDraft(draft);
    appState().launchV1SelectedId = draft.id;
    appState().launchV1FullKanban = false;
    launchV1Toast('Статус новинки обновлен');
    renderLaunchesV1('view-launches');
  }

  function openLaunchV1Editor(id = '', defaults = {}) {
    closeLaunchV1Editor();
    const existing = id ? launchV1FindItem(id) : null;
    const base = existing ? { ...existing, id: launchId(existing) } : launchV1DefaultDraft(defaults);
    const entries = stageEntries(base);
    const backdrop = document.createElement('div');
    backdrop.className = 'launch-v1-editor-backdrop';
    backdrop.setAttribute('data-launch-v1-editor-backdrop', '');
    backdrop.innerHTML = `
      <section class="launch-v1-editor" role="dialog" aria-modal="true" aria-label="Карточка новинки">
        <form data-launch-v1-editor-form>
          <input type="hidden" name="id" value="${escapeValue(base.id || launchId(base) || '')}">
          <header>
            <div>
              <span>Новинка</span>
              <h3>${escapeValue(existing ? 'Редактировать карточку' : 'Новая карточка')}</h3>
            </div>
            <button type="button" data-launch-v1-close-editor aria-label="Закрыть">×</button>
          </header>
          <div class="launch-v1-editor-grid">
            <label><span>Название</span><input name="name" required value="${escapeValue(base.name || base.title || '')}"></label>
            <label><span>Артикул / SKU</span><input name="articleKey" value="${escapeValue(base.articleKey || base.article || '')}"></label>
            <label><span>Owner</span><input name="owner" value="${escapeValue(launchOwner(base) || '')}"></label>
            <label><span>Категория</span><input name="reportGroup" value="${escapeValue(base.reportGroup || base.category || '')}"></label>
            <label><span>Дата запуска</span><input type="date" name="launchDate" value="${escapeValue(launchDue(base) || todayKey())}"></label>
            <label><span>Площадка</span><input name="marketplaces" value="${escapeValue(base.marketplaces || base.marketplace || 'WB')}"></label>
            <label><span>Первый склад</span><input type="date" name="firstStockDate" value="${escapeValue(base.firstStockDate || base.firstWarehouseDate || base.warehouseDate || base.supplyDate || base.stockDate || launchDue(base) || '')}"></label>
            <label><span>Склад МП</span><input type="date" name="mpStockDate" value="${escapeValue(base.mpStockDate || base.marketplaceStockDate || base.marketplaceWarehouseDate || base.mpWarehouseDate || '')}"></label>
            <label><span>Повторный заказ</span><input type="date" name="repeatOrderDate" value="${escapeValue(base.repeatOrderDate || base.nextOrderDate || base.plannedReorderDate || base.reorderDate || '')}"></label>
            <label><span>Статус</span><select name="status">${launchV1StatusOptions(base.status || '')}</select></label>
            <label><span>Маркетолог рук</span><input name="marketingLead" value="${escapeValue(base.marketingLead || base.marketingManager || base.leadOwner || '')}"></label>
            <label><span>Маркетолог</span><input name="marketingOwner" value="${escapeValue(base.marketingOwner || base.marketer || '')}"></label>
            <label><span>PR / SMM</span><input name="prOwner" value="${escapeValue(base.prOwner || base.smmOwner || base.contentOwner || '')}"></label>
            <label><span>Логист</span><input name="logistOwner" value="${escapeValue(base.logistOwner || base.logisticsOwner || base.supplyOwner || '')}"></label>
            <label><span>КЗ</span><input name="kzOwner" value="${escapeValue(base.kzOwner || base.selfBuyOwner || base.buyoutOwner || '')}"></label>
            <label><span>РОП</span><input name="ropOwner" value="${escapeValue(base.ropOwner || base.salesOwner || base.commercialOwner || '')}"></label>
            <label class="wide"><span>Продакт-файл / ссылка</span><input name="productFileUrl" value="${escapeValue(base.productFileUrl || base.productFile || base.briefUrl || base.presentationUrl || base.fileUrl || '')}" placeholder="https://..."></label>
            <label class="wide"><span>Комментарий</span><textarea name="productComment" rows="3">${escapeValue(base.productComment || base.notes || '')}</textarea></label>
          </div>
          <div class="launch-v1-editor-stages">
            <strong>Этапы карточки</strong>
            ${entries.map((entry) => `
              <fieldset>
                <legend>${escapeValue(entry.config?.title || 'Этап')}</legend>
                <label><span>Статус</span><select name="${escapeValue(entry.config?.status || '')}">${launchV1StatusOptions(entry.status || '')}</select></label>
                <label><span>Дата</span><input type="date" name="${escapeValue(entry.config?.due || '')}" value="${escapeValue(entry.due || '')}"></label>
                <label><span>Ответственный</span><input name="${escapeValue(entry.config?.owner || '')}" value="${escapeValue(entry.owner || '')}"></label>
                <label class="wide"><span>Комментарий</span><input name="${escapeValue(entry.config?.comment || '')}" value="${escapeValue(entry.comment || '')}"></label>
              </fieldset>
            `).join('')}
          </div>
          <footer>
            ${existing ? '<button type="button" class="danger" data-launch-v1-delete-editor>Удалить</button>' : '<span></span>'}
            <div>
              <button type="button" data-launch-v1-close-editor>Отмена</button>
              <button type="submit">Сохранить</button>
            </div>
          </footer>
        </form>
      </section>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop || event.target.closest('[data-launch-v1-close-editor]')) closeLaunchV1Editor();
    });
    backdrop.querySelector('[data-launch-v1-delete-editor]')?.addEventListener('click', () => {
      const key = String(backdrop.querySelector('input[name="id"]')?.value || '').trim();
      if (!key) return;
      launchV1DeleteDraft(key);
      closeLaunchV1Editor();
      appState().launchV1SelectedId = '';
      launchV1Toast('Карточка удалена');
      renderLaunchesV1('view-launches');
    });
    backdrop.querySelector('[data-launch-v1-editor-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const draft = readLaunchV1EditorForm(event.currentTarget);
      const saved = launchV1SaveDraft(draft);
      appState().launchV1SelectedId = launchId(saved) || draft.id;
      launchFilters().month = launchMonthKey(draft.launchDate || draft.dueDate || todayKey());
      appState().launchV1FullKanban = false;
      closeLaunchV1Editor();
      launchV1Toast('Карточка сохранена');
      renderLaunchesV1('view-launches');
    });
    backdrop.querySelector('input[name="name"]')?.focus();
  }

  function closeLaunchV1Editor() {
    document.querySelectorAll('[data-launch-v1-editor-backdrop]').forEach((node) => node.remove());
  }

  function readLaunchV1EditorForm(form) {
    const data = new FormData(form);
    const id = String(data.get('id') || '').trim() || launchV1DraftId();
    const firstStockDate = String(data.get('firstStockDate') || '').trim();
    const launchDate = String(data.get('launchDate') || '').trim() || firstStockDate || todayKey();
    const existing = launchV1FindItem(id);
    const draft = {
      ...(existing || {}),
      id,
      name: String(data.get('name') || '').trim() || 'Новая новинка',
      articleKey: String(data.get('articleKey') || '').trim(),
      owner: String(data.get('owner') || '').trim(),
      productFileUrl: String(data.get('productFileUrl') || '').trim(),
      firstStockDate: firstStockDate || launchDate,
      mpStockDate: String(data.get('mpStockDate') || '').trim(),
      repeatOrderDate: String(data.get('repeatOrderDate') || '').trim(),
      marketingLead: String(data.get('marketingLead') || '').trim(),
      marketingOwner: String(data.get('marketingOwner') || '').trim(),
      prOwner: String(data.get('prOwner') || '').trim(),
      logistOwner: String(data.get('logistOwner') || '').trim(),
      kzOwner: String(data.get('kzOwner') || '').trim(),
      ropOwner: String(data.get('ropOwner') || '').trim(),
      reportGroup: String(data.get('reportGroup') || '').trim(),
      category: String(data.get('reportGroup') || '').trim(),
      launchDate,
      dueDate: launchDate,
      launchMonth: typeof launchMonthLabel === 'function' ? launchMonthLabel(launchMonthKey(launchDate)) : launchDate.slice(0, 7),
      marketplaces: String(data.get('marketplaces') || '').trim(),
      status: String(data.get('status') || '').trim(),
      productComment: String(data.get('productComment') || '').trim()
    };
    ['negotiation', 'sample', 'production', 'packaging', 'content', 'launchReadiness'].forEach((prefix) => {
      ['Status', 'Due', 'Owner', 'Comment'].forEach((suffix) => {
        const key = `${prefix}${suffix}`;
        const value = String(data.get(key) || '').trim();
        draft[key] = value;
      });
    });
    return draft;
  }

  function readiness(item) {
    const memo = item && typeof item === 'object' ? launchMemo().readiness : null;
    if (memo?.has(item)) return memo.get(item);
    if (typeof launchReadinessState === 'function') {
      const value = launchReadinessState(item);
      memo?.set(item, value);
      return value;
    }
    const entries = stageEntries(item);
    const missing = entries.filter((entry) => !entry.done);
    const value = { ready: missing.length === 0, missing, checks: entries, pct: entries.length ? (entries.length - missing.length) / entries.length : 0 };
    memo?.set(item, value);
    return value;
  }

  function currentStage(item) {
    const memo = item && typeof item === 'object' ? launchMemo().currentStage : null;
    if (memo?.has(item)) return memo.get(item);
    const value = typeof launchCurrentStageEntry === 'function'
      ? launchCurrentStageEntry(item)
      : stageEntries(item).find((entry) => !entry.done) || stageEntries(item).at(-1);
    memo?.set(item, value);
    return value;
  }

  function launchFilters() {
    const stateRef = appState();
    stateRef.launchV1Filters = stateRef.launchV1Filters || {
      search: '',
      month: 'all',
      owner: 'all',
      category: 'all',
      status: 'all',
      readiness: 'all',
      viewMode: 'month',
      advancedOpen: false
    };
    if (!stateRef.launchV1Filters.month) stateRef.launchV1Filters.month = 'all';
    if (!['month', 'list', 'board'].includes(stateRef.launchV1Filters.viewMode)) stateRef.launchV1Filters.viewMode = 'month';
    return stateRef.launchV1Filters;
  }

  function launchItemsV1() {
    const items = typeof getLaunchItems === 'function' ? getLaunchItems({ skipTaskLookup: true }) : (appState().launches || []);
    const includeTaskCounts = window.__ALTEA_LAUNCH_V1_INCLUDE_TASK_COUNTS__ === true
      && typeof launchTaskCountMap === 'function'
      && typeof launchWithTaskCount === 'function';
    const taskCounts = includeTaskCounts ? launchTaskCountMap() : null;
    return items.map((item) => {
      const normalized = includeTaskCounts ? launchWithTaskCount(item, taskCounts) : item;
      return { ...normalized, id: launchId(normalized) };
    });
  }

  function launchText(item) {
    const memo = item && typeof item === 'object' ? launchMemo().text : null;
    if (memo?.has(item)) return memo.get(item);
    const value = [
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
      item.productFileUrl,
      item.productFile,
      item.briefUrl,
      item.presentationUrl,
      item.firstStockDate,
      item.mpStockDate,
      item.repeatOrderDate,
      item.marketingLead,
      item.marketingOwner,
      item.prOwner,
      item.logistOwner,
      item.kzOwner,
      item.ropOwner,
      item.productComment,
      item.notes
    ].filter(Boolean).join(' ').toLowerCase();
    memo?.set(item, value);
    return value;
  }

  function launchFilteredItems(items) {
    const filters = launchFilters();
    const search = String(filters.search || '').trim().toLowerCase();
    const activeMarket = readGlobalMarket();
    return items.filter((item) => {
      const monthKey = launchItemMonthKey(item);
      const owner = launchOwner(item) || '';
      const category = item.reportGroup || item.category || item.subCategory || '';
      const itemReady = readiness(item);
      if (!launchMatchesMarket(item, activeMarket)) return false;
      if (search && !launchText(item).includes(search)) return false;
      if (filters.month && filters.month !== 'all' && filters.month === 'missing' && monthKey) return false;
      if (filters.month && filters.month !== 'all' && filters.month !== 'missing' && monthKey !== filters.month) return false;
      if (filters.owner !== 'all' && owner !== filters.owner) return false;
      if (filters.category !== 'all' && category !== filters.category) return false;
      if (filters.status !== 'all' && String(item.status || '') !== filters.status) return false;
      if (filters.readiness === 'ready' && !itemReady.ready) return false;
      if (filters.readiness === 'blocked' && !(item.blockers || []).length && !stageEntries(item).some((entry) => entry.column?.key === 'blocked')) return false;
      if (filters.readiness === 'missing-owner' && owner) return false;
      if (filters.readiness === 'missing-date' && launchExactDue(item)) return false;
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
            <button type="button" class="${filters.viewMode === 'month' ? 'active' : ''}" data-launch-v1-view-mode="month">Месяц</button>
            <button type="button" class="${filters.viewMode === 'list' ? 'active' : ''}" data-launch-v1-view-mode="list">Список</button>
            <button type="button" class="${filters.viewMode === 'board' ? 'active' : ''}" data-launch-v1-view-mode="board">Доска</button>
          </span>
        </div>
      </section>
    `;
  }

  function launchMonthOptions(items) {
    const map = new Map();
    items.forEach((item) => {
      const key = launchItemMonthKey(item) || 'missing';
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
      : filtered.filter((item) => launchItemMonthKey(item) === launchMonthKey(todayKey()));
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
      <button type="button" class="launch-v1-card ${id === selectedId ? 'active' : ''}" data-launch-v1-select="${escapeValue(id)}" data-launch-v1-card="${escapeValue(id)}">
        <strong>${escapeValue(item.name || item.title || item.articleKey || 'Новинка')}</strong>
        <span>${escapeValue(item.reportGroup || item.category || 'категория —')} · ${escapeValue(entry?.config?.title || item.status || 'этап —')}</span>
        <em>${blockers ? `${formatInt(blockers)} блокера` : `${formatPct(ready.pct || 0)} готовность`}</em>
        ${renderStageStrip(item)}
      </button>
    `;
  }

  function renderLaunchCalendarItem(item, selectedId) {
    const id = launchId(item);
    const entry = currentStage(item);
    const ready = readiness(item);
    const blockers = (item.blockers || []).length + stageEntries(item).filter((stage) => stage.column?.key === 'blocked').length;
    const title = item.name || item.title || item.articleKey || 'Новинка';
    const stage = entry?.config?.title || item.status || 'этап —';
    const tone = blockers ? 'danger' : ready.ready ? 'ok' : 'warn';
    const meta = `${item.reportGroup || item.category || 'категория —'} · ${stage}`;
    return `
      <button type="button" class="launch-v1-calendar-item ${escapeValue(tone)} ${id === selectedId ? 'active' : ''}" draggable="true" data-launch-v1-drag="${escapeValue(id)}" data-launch-v1-select="${escapeValue(id)}" data-launch-v1-card="${escapeValue(id)}" title="${escapeValue(`${title} · ${meta}`)}">
        <i></i>
        <span>
          <strong>${escapeValue(title)}</strong>
          <em>${escapeValue(stage)}</em>
        </span>
        <b>${blockers ? `${formatInt(blockers)} бл.` : formatPct(ready.pct || 0)}</b>
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
      const due = launchCalendarDay(item, month);
      if (!due) return;
      if (!dayItems.has(due)) dayItems.set(due, []);
      dayItems.get(due).push(item);
    });
    const noDate = filtered.filter((item) => !launchCalendarDay(item));
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
              <div class="launch-v1-day ${inMonth ? '' : 'muted'} ${day === todayKey() ? 'today' : ''}" data-launch-v1-day="${escapeValue(day)}" role="button" tabindex="0" aria-label="${escapeValue(`Создать или перенести новинку на ${day}`)}">
                <span>${Number(day.slice(8, 10))}</span>
                <div class="launch-v1-day-stack">${items.slice(0, 4).map((item) => renderLaunchCalendarItem(item, selectedId)).join('')}${items.length > 4 ? `<small>+${items.length - 4}</small>` : ''}</div>
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

  function launchBoardStatus(item) {
    const entries = stageEntries(item);
    const hasBlocker = (item.blockers || []).length || entries.some((entry) => entry.column?.key === 'blocked');
    if (hasBlocker) return 'blocked';
    if (readiness(item).ready) return 'done';
    const current = currentStage(item) || {};
    const field = current.config?.status || '';
    if (field === 'negotiationStatus') return 'negotiation';
    if (field === 'sampleStatus') return 'sample';
    if (field === 'productionStatus') return 'production';
    if (field === 'packagingStatus') return 'packaging';
    if (field === 'contentStatus') return 'content';
    if (field === 'launchReadinessStatus') return 'readiness';
    return 'other';
  }

  function renderLaunchBoardRow(item, selectedId) {
    const id = launchId(item);
    const ready = readiness(item);
    const current = currentStage(item);
    const owner = launchOwner(item) || 'без owner';
    const tone = current?.column?.key === 'blocked' || (item.blockers || []).length ? 'danger' : ready.ready ? 'ok' : 'warn';
    return `
      <button type="button" class="launch-v1-board-row ${escapeValue(tone)} ${id === selectedId ? 'active' : ''}" draggable="true" data-launch-v1-drag="${escapeValue(id)}" data-launch-v1-select="${escapeValue(id)}" data-launch-v1-card="${escapeValue(id)}">
        <i></i>
        <span>
          <strong>${escapeValue(item.name || item.title || item.articleKey || 'Новинка')}</strong>
          <em>${escapeValue(item.reportGroup || item.category || 'категория —')} · ${escapeValue(owner)} · ${escapeValue(current?.config?.title || item.status || 'этап —')}</em>
        </span>
        <b>${escapeValue(launchDueText(item))}</b>
        <small>${formatPct(ready.pct || 0)}</small>
      </button>
    `;
  }

  function renderLaunchBoard(filtered, selectedId) {
    const groups = new Map(LAUNCH_BOARD_STATUS_ORDER.map((group) => [group.key, []]));
    filtered.forEach((item) => {
      const key = launchBoardStatus(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return `
      <section class="launch-v1-calendar-card launch-v1-board-card">
        <div class="launch-v1-board-tree">
          ${LAUNCH_BOARD_STATUS_ORDER.map((group, index) => {
            const items = (groups.get(group.key) || []).sort((left, right) => String(launchDue(left) || '9999-12-31').localeCompare(String(launchDue(right) || '9999-12-31')) || String(left.name || '').localeCompare(String(right.name || ''), 'ru'));
            return `
              <section class="launch-v1-board-group ${items.length ? '' : 'empty'}" data-launch-v1-board-status="${escapeValue(group.key)}" aria-label="${escapeValue(`Перенести в статус ${group.label}`)}">
                <header>
                  <i>${index + 1}</i>
                  <strong>${escapeValue(group.label)}</strong>
                  <em>${formatInt(items.length)}</em>
                </header>
                <div>
                  ${items.map((item) => renderLaunchBoardRow(item, selectedId)).join('') || '<p>Нет карточек в этом статусе.</p>'}
                </div>
              </section>
            `;
          }).join('')}
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
    const productFileUrl = safeUrl(item.productFileUrl || item.productFile || item.briefUrl || item.presentationUrl || item.fileUrl || '');
    return `
      <aside class="launch-v1-detail">
        <div class="launch-v1-detail-head">
          <span>Выбранная новинка</span>
          <h3>${escapeValue(item.name || item.title || item.articleKey || 'Новинка')}</h3>
          <p>${escapeValue(item.reportGroup || item.category || 'категория —')} · ${escapeValue(launchDueText(item))}</p>
          ${safeBadge(current?.config?.title || item.status || 'этап —', current?.column?.tone || 'info')}
        </div>
        <div class="launch-v1-detail-controls">
          <label>
            <span>Статус новинки</span>
            <select data-launch-v1-status-select="${escapeValue(launchId(item))}">
              ${launchV1StatusOptions(item.status || '')}
            </select>
          </label>
          <button type="button" data-launch-v1-edit="${escapeValue(launchId(item))}">Открыть карточку</button>
        </div>
        <div class="launch-v1-facts">
          <span><em>Owner</em><strong>${escapeValue(owner)}</strong></span>
          <span><em>Первый склад</em><strong>${escapeValue(item.firstStockDate || item.firstWarehouseDate || item.warehouseDate || item.supplyDate || item.stockDate || launchDue(item) || 'нет данных')}</strong></span>
          <span><em>Склад МП</em><strong>${escapeValue(item.mpStockDate || item.marketplaceStockDate || item.marketplaceWarehouseDate || item.mpWarehouseDate || 'нет данных')}</strong></span>
          <span><em>Повторный заказ</em><strong>${escapeValue(item.repeatOrderDate || item.nextOrderDate || item.plannedReorderDate || item.reorderDate || 'нет данных')}</strong></span>
          <span><em>Маркетолог</em><strong>${escapeValue(item.marketingOwner || item.marketer || 'не назначен')}</strong></span>
          <span><em>Логист</em><strong>${escapeValue(item.logistOwner || item.logisticsOwner || item.supplyOwner || 'не назначен')}</strong></span>
          <span><em>Продакт-файл</em><strong>${productFileUrl ? `<a href="${escapeValue(productFileUrl)}" target="_blank" rel="noopener">открыть</a>` : 'нет ссылки'}</strong></span>
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
                  ${launchV1StageActions(item, entry)}
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
                  ${launchV1StageActions(selected, entry)}
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
    launchV1RenderMemo = null;
    const allItems = launchItemsV1();
    const activeMarket = readGlobalMarket();
    const scopedItems = allItems.filter((item) => launchMatchesMarket(item, activeMarket));
    const filters = launchFilters();
    const monthOptions = launchMonthOptions(scopedItems);
    const validMonths = new Set(monthOptions.map((item) => item.key));
    if (!filters.month || (filters.month !== 'all' && !validMonths.has(filters.month))) {
      filters.month = 'all';
    }
    const filtered = launchFilteredItems(scopedItems);
    const selectedId = appState().launchV1SelectedId && scopedItems.some((item) => launchId(item) === appState().launchV1SelectedId)
      ? appState().launchV1SelectedId
      : launchId(filtered[0] || scopedItems[0] || {});
    appState().launchV1SelectedId = selectedId || '';
    const selected = selectedId ? (scopedItems.find((item) => launchId(item) === selectedId) || null) : null;
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
        ${renderLaunchFilters(scopedItems, monthOptions)}
        ${renderLaunchKpis(scopedItems, filtered)}
        ${fullKanban ? renderFullLaunchKanban(selected) : `
          <section class="launch-v1-workspace">
            ${filters.viewMode === 'list' ? renderLaunchList(filtered, selectedId) : filters.viewMode === 'board' ? renderLaunchBoard(filtered, selectedId) : renderLaunchCalendar(filtered, selectedId)}
            ${renderSelectedLaunch(selected)}
          </section>
        `}
      </div>
    `;
    bindLaunchesV1(root);
    try {
      window.dispatchEvent(new CustomEvent('altea:launches-rendered', {
        detail: { rootId, selectedId, source: VERSION }
      }));
    } catch {}
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
      Object.assign(filters, { search: '', month: 'all', owner: 'all', category: 'all', status: 'all', readiness: 'all', viewMode: 'month' });
      rerender();
    });
    root.querySelector('[data-launch-v1-advanced]')?.addEventListener('click', () => {
      window.alert('Расширенные фильтры учтены в готовности: без owner, без даты, с блокерами и неготовые этапы. Данные не подменяются нулями.');
    });
    root.querySelector('[data-launch-v1-add]')?.addEventListener('click', () => {
      openLaunchV1Editor('', { launchDate: todayKey() });
    });
    root.querySelectorAll('[data-launch-v1-select]').forEach((button) => {
      button.addEventListener('click', () => {
        appState().launchV1SelectedId = button.dataset.launchV1Select || '';
        appState().launchV1FullKanban = false;
        rerender();
      });
    });
    root.querySelectorAll('[data-launch-v1-drag]').forEach((button) => {
      button.addEventListener('dragstart', (event) => {
        const id = button.dataset.launchV1Drag || button.dataset.launchV1Select || '';
        if (!id) return;
        event.dataTransfer?.setData('text/plain', id);
        event.dataTransfer?.setData('application/x-altea-launch-id', id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        button.classList.add('dragging');
      });
      button.addEventListener('dragend', () => {
        button.classList.remove('dragging');
        root.querySelectorAll('.launch-v1-day.drop-target,.launch-v1-board-group.drop-target').forEach((node) => node.classList.remove('drop-target'));
      });
    });
    root.querySelectorAll('[data-launch-v1-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        openLaunchV1Editor(button.dataset.launchV1Edit || '');
      });
    });
    root.querySelectorAll('[data-launch-v1-stage-status]').forEach((button) => {
      button.addEventListener('click', () => {
        launchV1SetStageStatus(button.dataset.launchV1Id || appState().launchV1SelectedId || '', button.dataset.launchV1Stage || '', button.dataset.launchV1StageStatus || '');
      });
    });
    root.querySelectorAll('[data-launch-v1-status-select]').forEach((select) => {
      select.addEventListener('change', () => {
        const item = launchV1FindItem(select.dataset.launchV1StatusSelect || '');
        if (!item) return;
        const draft = { ...item, id: launchId(item), status: select.value || '' };
        launchV1SaveDraft(draft);
        appState().launchV1SelectedId = draft.id;
        launchV1Toast('Статус новинки сохранен');
        rerender();
      });
    });
    root.querySelectorAll('[data-launch-v1-day]').forEach((day) => {
      day.addEventListener('click', (event) => {
        if (event.target.closest('[data-launch-v1-select]')) return;
        openLaunchV1Editor('', { launchDate: day.dataset.launchV1Day || todayKey() });
      });
      day.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openLaunchV1Editor('', { launchDate: day.dataset.launchV1Day || todayKey() });
      });
      day.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        day.classList.add('drop-target');
      });
      day.addEventListener('dragleave', (event) => {
        if (event.relatedTarget && day.contains(event.relatedTarget)) return;
        day.classList.remove('drop-target');
      });
      day.addEventListener('drop', (event) => {
        const id = event.dataTransfer?.getData('application/x-altea-launch-id') || event.dataTransfer?.getData('text/plain') || '';
        if (!id) return;
        event.preventDefault();
        day.classList.remove('drop-target');
        launchV1MoveToDate(id, day.dataset.launchV1Day || '');
      });
    });
    root.querySelectorAll('[data-launch-v1-board-status]').forEach((group) => {
      group.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        group.classList.add('drop-target');
      });
      group.addEventListener('dragleave', (event) => {
        if (event.relatedTarget && group.contains(event.relatedTarget)) return;
        group.classList.remove('drop-target');
      });
      group.addEventListener('drop', (event) => {
        const id = event.dataTransfer?.getData('application/x-altea-launch-id') || event.dataTransfer?.getData('text/plain') || '';
        if (!id) return;
        event.preventDefault();
        group.classList.remove('drop-target');
        launchV1MoveToBoardStatus(id, group.dataset.launchV1BoardStatus || '');
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
      .sl-v1-column-panel{display:grid;gap:8px;border:1px solid rgba(224,190,126,.16);border-radius:9px;background:rgba(0,0,0,.18);padding:10px}.sl-v1-column-panel strong{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:rgba(235,216,174,.68)}.sl-v1-column-panel div{display:flex;flex-wrap:wrap;gap:7px}.sl-v1-column-panel button{min-height:30px;border:1px solid rgba(224,190,126,.22);border-radius:999px;background:rgba(255,255,255,.035);color:rgba(247,241,232,.82);padding:0 10px;font:inherit;font-size:11px;font-weight:850;cursor:pointer}
      .sl-v1-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
      .sl-v1-kpi{min-height:106px;border:1px solid var(--sl-line);border-radius:10px;background:linear-gradient(150deg,rgba(255,255,255,.045),rgba(255,255,255,.012));padding:16px;display:grid;align-content:space-between;gap:8px}
      .sl-v1-kpi span{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:rgba(235,216,174,.62);font-weight:850}
      .sl-v1-kpi strong{font-size:clamp(24px,2.2vw,34px);line-height:1;font-weight:950;font-variant-numeric:tabular-nums}
      .sl-v1-kpi em{font-style:normal;color:var(--sl-muted);font-size:12px}
      .sl-v1-kpi.ok{border-color:rgba(103,213,154,.30)}.sl-v1-kpi.warn{border-color:rgba(240,196,105,.36)}.sl-v1-kpi.danger{border-color:rgba(255,116,105,.42);background:linear-gradient(150deg,rgba(120,34,28,.22),rgba(255,255,255,.012))}.sl-v1-kpi.info{border-color:rgba(96,166,255,.34)}
      .sl-v1-focus-grid{display:grid;grid-template-columns:minmax(260px,.9fr) minmax(420px,1.6fr) minmax(300px,.9fr);gap:12px;align-items:start}
      .sl-v1-panel{padding:16px;min-width:0}
      .sl-v1-bucket-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .sl-v1-bucket,.sl-v1-queue-row,.launch-v1-card,.launch-v1-calendar-item{border:1px solid var(--sl-line);border-radius:9px;background:rgba(6,5,4,.36);color:var(--sl-text);text-align:left;cursor:pointer}
      .sl-v1-bucket{min-height:86px;padding:12px;display:grid;gap:4px}.sl-v1-bucket strong{font-size:26px}.sl-v1-bucket span{font-weight:900}.sl-v1-bucket em{font-style:normal;color:var(--sl-muted);font-size:11px}
      .sl-v1-bucket.ok,.sl-v1-queue-row.ok,.sl-v1-quality-row.ok,.launch-v1-stage.ok,.launch-v1-kanban-col.ok{border-color:rgba(103,213,154,.34)}.sl-v1-bucket.warn,.sl-v1-queue-row.warn,.sl-v1-quality-row.warn,.launch-v1-stage.warn,.launch-v1-kanban-col.warn{border-color:rgba(240,196,105,.38)}.sl-v1-bucket.danger,.sl-v1-queue-row.danger,.sl-v1-quality-row.danger,.launch-v1-stage.danger,.launch-v1-kanban-col.danger{border-color:rgba(255,116,105,.42)}.sl-v1-bucket.info,.sl-v1-queue-row.info{border-color:rgba(96,166,255,.38)}
      .sl-v1-queue-list,.sl-v1-quality-list,.launch-v1-stage-list{display:grid;gap:8px;margin-top:12px}
      .sl-v1-queue-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:12px;align-items:center;min-height:68px;padding:10px 12px}.sl-v1-queue-row i{width:8px;height:8px;border-radius:50%;background:#f0d49a}.sl-v1-queue-row span{display:grid;gap:2px}.sl-v1-queue-row em,.sl-v1-queue-row small{font-style:normal;color:var(--sl-muted);font-size:11px}.sl-v1-queue-row strong{font-size:13px}.sl-v1-queue-row b{font-size:13px;color:#ffd98d}
      .sl-v1-quality-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 10px;border:1px solid var(--sl-line);border-radius:9px;padding:12px;background:rgba(0,0,0,.16)}.sl-v1-quality-row span{font-weight:850}.sl-v1-quality-row strong{font-size:12px}.sl-v1-quality-row em{grid-column:1/-1;color:var(--sl-muted);font-style:normal;font-size:11px}
      .sl-v1-table-panel{overflow:hidden}.sl-v1-table-wrap{overflow:auto;max-width:100%;border:1px solid rgba(224,190,126,.14);border-radius:9px;background:rgba(5,4,3,.62);margin-top:12px}.sl-v1-table{min-width:1380px;width:100%;border-collapse:separate;border-spacing:0}.sl-v1-table th,.sl-v1-table td{border-bottom:1px solid rgba(224,190,126,.09);padding:11px 12px;text-align:left;vertical-align:top;background:rgba(10,9,7,.94);font-size:12px;line-height:1.35}.sl-v1-table th{position:sticky;top:0;z-index:4;color:rgba(247,241,232,.68);font-size:10px;text-transform:uppercase;letter-spacing:.12em;background:rgba(18,15,11,.98)}.sl-v1-table th:nth-child(1),.sl-v1-table td:nth-child(1){position:sticky;left:0;z-index:5;width:190px;background:linear-gradient(90deg,rgba(16,14,11,.99),rgba(11,9,7,.97))}.sl-v1-table th:nth-child(2),.sl-v1-table td:nth-child(2){position:sticky;left:190px;z-index:5;width:310px;background:linear-gradient(90deg,rgba(15,13,10,.99),rgba(10,9,7,.97));box-shadow:10px 0 18px rgba(0,0,0,.22)}.sl-v1-table small{display:block;margin-top:4px;color:var(--sl-muted)}.sl-v1-link{border:0;background:transparent;color:#fff4d8;padding:0;font:inherit;font-weight:950;text-align:left;cursor:pointer}.sl-v1-platform-tags{display:flex;flex-wrap:wrap;gap:5px}.sl-v1-platform-tags span{border:1px solid rgba(224,190,126,.2);border-radius:999px;padding:4px 7px;background:rgba(255,255,255,.035);font-size:10px}
      .sl-v1-api-action{display:grid;gap:8px;min-width:300px}.sl-v1-api-action-main{display:grid;gap:5px}.sl-v1-api-action-main span{color:rgba(247,241,232,.78)}.sl-v1-api-action-buttons{display:flex;flex-wrap:wrap;gap:7px}.sl-v1-api-action-buttons button,.sl-v1-candidate>button:last-child{height:30px;border:1px solid rgba(224,190,126,.22);border-radius:999px;background:rgba(255,255,255,.035);color:#fff4d8;padding:0 10px;font:inherit;font-size:11px;font-weight:900;cursor:pointer}.sl-v1-api-action-buttons button:first-child,.sl-v1-candidate>button:last-child{background:linear-gradient(180deg,rgba(245,223,173,.26),rgba(185,139,71,.16));border-color:rgba(245,218,165,.44)}.sl-v1-candidate-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:7px}.sl-v1-candidate{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:stretch}.sl-v1-candidate>button:first-child{min-width:0;border:1px solid rgba(224,190,126,.16);border-radius:8px;background:rgba(255,255,255,.03);color:var(--sl-text);padding:8px;text-align:left;cursor:pointer;display:grid;gap:2px}.sl-v1-candidate b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sl-v1-candidate em{font-style:normal;color:#ffd98d;font-size:11px}.sl-v1-candidate small,.sl-v1-candidate-empty{color:var(--sl-muted);font-size:11px}
      .sl-v1-planfact-table{min-width:1480px}.sl-v1-planfact-table .chip{display:inline-flex;margin-bottom:4px}.sl-v1-review-dialog{padding:18px;display:grid;gap:14px}.sl-v1-review-dialog header{padding:0}.sl-v1-review-dialog header p{margin:4px 0 0;color:var(--sl-muted)}.sl-v1-review-tools{display:flex;justify-content:flex-end;gap:8px}.sl-v1-review-tools button{height:34px;border:1px solid rgba(224,190,126,.24);border-radius:8px;background:rgba(255,255,255,.04);color:#f7f1e8;padding:0 12px;font:inherit;font-size:12px;font-weight:850;cursor:pointer}.sl-v1-review-tools button:first-child{background:linear-gradient(180deg,rgba(245,223,173,.24),rgba(185,139,71,.14));border-color:rgba(245,218,165,.42)}.sl-v1-review-list{display:grid;gap:10px;max-height:62vh;overflow:auto;padding-right:4px}.sl-v1-review-row{display:grid;grid-template-columns:minmax(220px,1.1fr) 140px minmax(240px,1.2fr) auto;gap:10px;align-items:start;border:1px solid rgba(224,190,126,.16);border-radius:12px;background:rgba(0,0,0,.18);padding:12px}.sl-v1-review-row>div:first-child{display:grid;gap:4px}.sl-v1-review-row strong{color:#fff4d8}.sl-v1-review-row span,.sl-v1-review-row small,.sl-v1-review-candidates em{color:var(--sl-muted);font-style:normal}.sl-v1-review-candidates{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px}.sl-v1-review-candidates button{min-height:42px;border:1px solid rgba(224,190,126,.18);border-radius:8px;background:rgba(255,255,255,.035);color:#f7f1e8;padding:7px 9px;text-align:left;cursor:pointer;display:grid;gap:2px}.sl-v1-review-candidates b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sl-v1-review-candidates span{font-size:10px;color:#ffd98d}.sl-v1-review-actions{display:grid;gap:6px}.sl-v1-review-actions button{height:32px;border:1px solid rgba(224,190,126,.24);border-radius:999px;background:rgba(255,255,255,.04);color:#fff4d8;padding:0 10px;font:inherit;font-size:11px;font-weight:900;cursor:pointer}.sl-v1-review-actions button:first-child{background:linear-gradient(180deg,rgba(245,223,173,.26),rgba(185,139,71,.16));border-color:rgba(245,218,165,.44)}
      .sl-v1-status-cell{display:grid;gap:6px;align-items:start}.sl-v1-inline-select{width:100%;max-width:170px;height:28px;border:1px solid rgba(224,190,126,.24);border-radius:7px;background:rgba(5,4,3,.86);color:var(--sl-text);padding:0 8px;font:inherit;font-size:11px;font-weight:800;outline:none}.sl-v1-inline-select:focus{border-color:rgba(245,218,165,.75);box-shadow:0 0 0 3px rgba(214,169,85,.12)}.sl-v1-table td .sl-v1-inline-select{margin-top:6px}
      .sl-v1-inline-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sl-v1-inline-actions button{border-color:rgba(224,190,126,.22);background:rgba(255,255,255,.035);padding:0 12px}
      .sl-v1-empty{padding:18px;border:1px dashed rgba(224,190,126,.2);border-radius:9px;color:var(--sl-muted);background:rgba(255,255,255,.018)}
      .launch-v1-filter-grid{grid-template-columns:minmax(260px,1.2fr) repeat(5,minmax(140px,.8fr)) minmax(210px,.8fr)}
      .launch-v1-kpis{grid-template-columns:repeat(5,minmax(0,1fr))}
      .launch-v1-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(330px,480px);gap:14px;align-items:start}
      .launch-v1-calendar-card,.launch-v1-detail,.launch-v1-full-kanban{padding:16px}
      .launch-v1-calendar-head{display:grid;grid-template-columns:40px 1fr 40px;align-items:center;gap:8px}.launch-v1-calendar-head h3{text-align:center;margin:0;font-size:18px}.launch-v1-calendar-head button{height:36px;border:1px solid var(--sl-line);border-radius:50%;background:rgba(255,255,255,.03);color:var(--sl-text);cursor:pointer}
      .launch-v1-weekdays,.launch-v1-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.launch-v1-weekdays{margin-top:12px;color:var(--sl-muted);font-size:11px;text-transform:uppercase;letter-spacing:.12em}.launch-v1-weekdays span{text-align:center;padding:8px}
      .launch-v1-month-grid{border-top:1px solid rgba(224,190,126,.12);border-left:1px solid rgba(224,190,126,.12)}.launch-v1-day{min-height:148px;border-right:1px solid rgba(224,190,126,.12);border-bottom:1px solid rgba(224,190,126,.12);padding:8px;display:grid;grid-template-rows:28px minmax(0,1fr);gap:6px;background:rgba(0,0,0,.13);min-width:0;overflow:hidden;cursor:pointer;outline:none}.launch-v1-day:hover,.launch-v1-day:focus-visible{background:rgba(240,212,154,.045);box-shadow:inset 0 0 0 1px rgba(240,212,154,.18)}.launch-v1-day.drop-target{background:rgba(88,214,202,.10);box-shadow:inset 0 0 0 2px rgba(88,214,202,.52)}.launch-v1-day.muted{opacity:.48}.launch-v1-day.today>span{display:inline-grid;place-items:center;width:28px;height:28px;border:1px solid #f0d49a;border-radius:50%;color:#f0d49a}
      .launch-v1-card{width:100%;display:grid;gap:4px;padding:9px;margin-bottom:6px}.launch-v1-card.active{border-color:var(--sl-aqua);box-shadow:0 0 0 1px rgba(88,214,202,.22)}.launch-v1-card strong{font-size:12px}.launch-v1-card span,.launch-v1-card em{color:var(--sl-muted);font-style:normal;font-size:10px}.launch-v1-card em{color:#ffcc7e}
      .launch-v1-day-stack{display:grid;gap:5px;align-content:start;min-width:0;min-height:0;overflow:hidden}.launch-v1-day-stack>small{display:inline-flex;align-items:center;min-height:18px;color:#f0d49a;font-size:11px;font-weight:900}
      .launch-v1-calendar-item{width:100%;min-width:0;height:34px;display:grid;grid-template-columns:6px minmax(0,1fr) auto;gap:6px;align-items:center;padding:5px 7px;margin:0;border-radius:8px;background:linear-gradient(180deg,rgba(14,13,11,.88),rgba(6,5,4,.72));box-shadow:inset 0 1px 0 rgba(255,255,255,.035);cursor:grab}.launch-v1-calendar-item:active{cursor:grabbing}.launch-v1-calendar-item.dragging{opacity:.48}.launch-v1-calendar-item.active{border-color:var(--sl-aqua);box-shadow:0 0 0 1px rgba(88,214,202,.22),inset 0 1px 0 rgba(255,255,255,.035)}.launch-v1-calendar-item>i{width:6px;height:22px;border-radius:999px;background:#f0c469}.launch-v1-calendar-item.ok>i{background:#61d89a}.launch-v1-calendar-item.danger>i{background:#ff7469}.launch-v1-calendar-item span{display:grid;gap:1px;min-width:0}.launch-v1-calendar-item strong,.launch-v1-calendar-item em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.launch-v1-calendar-item strong{font-size:11px;line-height:1.1;color:#fff4d8}.launch-v1-calendar-item em{font-style:normal;color:rgba(247,241,232,.52);font-size:9px;line-height:1.1}.launch-v1-calendar-item b{color:#ffd98d;font-size:9px;font-weight:950;white-space:nowrap}
      .sl-v1-stage-strip{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.sl-v1-stage-strip i{height:5px;border-radius:999px;background:rgba(255,255,255,.12)}.sl-v1-stage-strip i.ok{background:#61d89a}.sl-v1-stage-strip i.warn{background:#f0c469}.sl-v1-stage-strip i.danger{background:#ff7469}
      .launch-v1-no-date{margin-top:12px;border:1px dashed rgba(224,190,126,.2);border-radius:9px;padding:12px}.launch-v1-no-date>div{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:8px}
      .launch-v1-detail{position:sticky;top:96px;display:grid;gap:14px}.launch-v1-detail-head h3{margin:6px 0 4px;font-size:24px;line-height:1.05}.launch-v1-detail-head p{margin:0;color:var(--sl-muted)}
      .launch-v1-detail-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.launch-v1-detail-controls label{display:grid;gap:6px}.launch-v1-detail-controls span{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:rgba(235,216,174,.62);font-weight:850}.launch-v1-detail-controls select,.launch-v1-detail-controls button{height:38px;border:1px solid rgba(224,190,126,.22);border-radius:8px;background:rgba(5,4,3,.82);color:var(--sl-text);font:inherit;font-size:12px;font-weight:850;padding:0 10px}.launch-v1-detail-controls button{cursor:pointer;background:linear-gradient(180deg,rgba(245,223,173,.22),rgba(185,139,71,.12))}
      .launch-v1-facts{display:grid;gap:1px;border:1px solid rgba(224,190,126,.12);border-radius:9px;overflow:hidden}.launch-v1-facts span{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:10px 12px;background:rgba(0,0,0,.16)}.launch-v1-facts em{color:var(--sl-muted);font-style:normal}.launch-v1-facts strong{font-size:12px;text-align:right}.launch-v1-facts a{color:#f0d49a;text-decoration:none;border-bottom:1px solid rgba(240,212,154,.42)}
      .launch-v1-gate{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.launch-v1-gate span{border:1px solid rgba(224,190,126,.18);border-radius:9px;padding:10px;display:grid;gap:4px;font-size:12px;font-weight:850}.launch-v1-gate span.ok{border-color:rgba(103,213,154,.36)}.launch-v1-gate span.warn{border-color:rgba(255,116,105,.38)}.launch-v1-gate i{width:8px;height:8px;border-radius:50%;background:#f0c469}.launch-v1-gate .ok i{background:#61d89a}.launch-v1-gate em{font-style:normal;color:var(--sl-muted);font-size:10px}
      .launch-v1-stage{display:grid;grid-template-columns:8px minmax(0,1fr);gap:10px;border:1px solid var(--sl-line);border-radius:9px;padding:10px;background:rgba(0,0,0,.14)}.launch-v1-stage i{width:8px;height:100%;min-height:34px;border-radius:999px;background:#f0c469}.launch-v1-stage.ok i{background:#61d89a}.launch-v1-stage.danger i{background:#ff7469}.launch-v1-stage span{display:grid;gap:3px}.launch-v1-stage em,.launch-v1-stage small{font-style:normal;color:var(--sl-muted);font-size:11px}
      .launch-v1-stage-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.launch-v1-stage-actions button{height:26px;border:1px solid rgba(224,190,126,.20);border-radius:999px;background:rgba(255,255,255,.035);color:rgba(247,241,232,.72);padding:0 8px;font:inherit;font-size:10px;font-weight:850;cursor:pointer}.launch-v1-stage-actions button.active{border-color:rgba(245,218,165,.75);background:linear-gradient(180deg,#f5dfad,#b98b47);color:#120d07}
      .launch-v1-detail-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.launch-v1-detail-actions button{border-color:rgba(224,190,126,.22);background:rgba(255,255,255,.035)}
      .launch-v1-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}
      .launch-v1-view-mode{display:inline-flex;gap:4px;padding:3px!important;border-radius:999px!important}.launch-v1-view-mode button{min-width:82px;padding:0 12px}
      .launch-v1-board-card{overflow:auto}.launch-v1-board-tree{display:grid;gap:10px;min-width:660px}.launch-v1-board-group{display:grid;grid-template-columns:230px minmax(0,1fr);gap:10px;align-items:start;border:1px solid rgba(224,190,126,.12);border-radius:9px;background:rgba(0,0,0,.12);padding:10px}.launch-v1-board-group.empty{opacity:.58}.launch-v1-board-group.drop-target{border-color:rgba(88,214,202,.56);background:rgba(88,214,202,.08);box-shadow:inset 0 0 0 1px rgba(88,214,202,.28)}.launch-v1-board-group header{position:sticky;top:0;display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:9px;align-items:center;color:#fff4d8}.launch-v1-board-group header i{display:grid;place-items:center;width:30px;height:30px;border:1px solid rgba(224,190,126,.28);border-radius:50%;font-style:normal;color:#f0d49a;background:rgba(240,212,154,.06)}.launch-v1-board-group header strong{font-size:13px}.launch-v1-board-group header em{font-style:normal;color:#f0d49a;font-weight:900}.launch-v1-board-group>div{display:grid;gap:7px}.launch-v1-board-group p{margin:0;color:var(--sl-muted);font-size:12px}
      .launch-v1-board-row{width:100%;display:grid;grid-template-columns:8px minmax(0,1fr) minmax(92px,auto) 54px;gap:10px;align-items:center;min-height:58px;border:1px solid rgba(224,190,126,.16);border-radius:8px;background:rgba(6,5,4,.34);color:var(--sl-text);padding:9px 10px;text-align:left;cursor:grab}.launch-v1-board-row:active{cursor:grabbing}.launch-v1-board-row.dragging{opacity:.48}.launch-v1-board-row.active{border-color:var(--sl-aqua);box-shadow:0 0 0 1px rgba(88,214,202,.22)}.launch-v1-board-row>i{width:8px;height:34px;border-radius:999px;background:#f0c469}.launch-v1-board-row.ok>i{background:#61d89a}.launch-v1-board-row.danger>i{background:#ff7469}.launch-v1-board-row span{display:grid;gap:3px;min-width:0}.launch-v1-board-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.launch-v1-board-row em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--sl-muted);font-style:normal;font-size:11px}.launch-v1-board-row b{color:#f0d49a;font-size:11px;text-align:right;white-space:nowrap}.launch-v1-board-row small{color:var(--sl-muted);font-size:11px;text-align:right;font-weight:900}
      .launch-v1-full-kanban{display:grid;gap:14px}.launch-v1-full-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.launch-v1-full-head h3{margin:4px 0 0;font-size:32px}.launch-v1-full-head>div:last-child{display:flex;gap:8px}.launch-v1-full-head button{border-color:rgba(224,190,126,.22);background:rgba(255,255,255,.035);padding:0 14px}
      .launch-v1-kanban-columns{display:grid;grid-template-columns:repeat(6,minmax(190px,1fr));gap:10px;overflow:auto}.launch-v1-kanban-col{min-height:520px;border:1px solid var(--sl-line);border-radius:10px;background:rgba(255,255,255,.018);padding:10px;display:grid;grid-template-rows:auto minmax(0,1fr);gap:10px}.launch-v1-kanban-col header{display:grid;gap:8px}.launch-v1-kanban-col article{border:1px solid rgba(224,190,126,.14);border-radius:9px;padding:12px;background:rgba(0,0,0,.16);display:grid;align-content:start;gap:8px}.launch-v1-kanban-col em,.launch-v1-kanban-col p{color:var(--sl-muted);font-style:normal}.launch-v1-kanban-col b{color:#f0d49a}
      .launch-v1-editor-backdrop{position:fixed;inset:0;z-index:9998;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.62);backdrop-filter:blur(16px)}.launch-v1-editor{width:min(1080px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;border:1px solid rgba(224,190,126,.28);border-radius:16px;background:linear-gradient(145deg,rgba(25,22,18,.98),rgba(8,7,6,.98));box-shadow:0 24px 80px rgba(0,0,0,.58);color:#f7f1e8}.launch-v1-editor form{display:grid;gap:16px;padding:18px}.launch-v1-editor header,.launch-v1-editor footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.launch-v1-editor header span{display:block;color:#d8c08a;font-size:11px;font-weight:850;letter-spacing:.22em;text-transform:uppercase}.launch-v1-editor h3{margin:4px 0 0;font-size:28px}.launch-v1-editor header button{width:38px;height:38px;border:1px solid rgba(224,190,126,.26);border-radius:50%;background:rgba(255,255,255,.04);color:#f7f1e8;font-size:24px;cursor:pointer}.launch-v1-editor-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.launch-v1-editor label{display:grid;gap:6px}.launch-v1-editor label.wide{grid-column:1/-1}.launch-v1-editor label span,.launch-v1-editor-stages strong{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:rgba(235,216,174,.64);font-weight:850}.launch-v1-editor input,.launch-v1-editor select,.launch-v1-editor textarea{min-width:0;width:100%;border:1px solid rgba(224,190,126,.22);border-radius:9px;background:rgba(5,4,3,.82);color:#f7f1e8;padding:10px 12px;font:inherit;outline:none}.launch-v1-editor textarea{resize:vertical}.launch-v1-editor-stages{display:grid;gap:10px}.launch-v1-editor-stages fieldset{display:grid;grid-template-columns:1fr 170px 1fr;gap:10px;border:1px solid rgba(224,190,126,.14);border-radius:12px;margin:0;padding:12px;background:rgba(0,0,0,.16)}.launch-v1-editor-stages legend{padding:0 8px;color:#f0d49a;font-weight:900}.launch-v1-editor footer button{height:40px;border:1px solid rgba(224,190,126,.26);border-radius:9px;background:rgba(255,255,255,.04);color:#f7f1e8;padding:0 16px;font:inherit;font-weight:850;cursor:pointer}.launch-v1-editor footer button[type="submit"]{background:linear-gradient(180deg,#f5dfad,#b98b47);color:#120d07}.launch-v1-editor footer button.danger{border-color:rgba(255,116,105,.45);color:#ff8a80}
      .launch-v1-toast{position:fixed;right:22px;bottom:22px;z-index:10000;border:1px solid rgba(103,213,154,.36);border-radius:999px;background:rgba(10,22,16,.94);color:#dfffe9;padding:10px 14px;font-weight:850;box-shadow:0 14px 44px rgba(0,0,0,.35)}
      @media (max-width:1200px){.sl-v1-hero,.launch-v1-workspace,.sl-v1-focus-grid{grid-template-columns:1fr}.sl-v1-kpis,.launch-v1-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sl-v1-filter-grid,.launch-v1-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.launch-v1-detail{position:relative;top:auto}.launch-v1-kanban-columns{grid-template-columns:repeat(3,minmax(220px,1fr))}.sl-v1-review-row{grid-template-columns:1fr}}
      @media (max-width:720px){.sl-v1-hero h2{font-size:34px}.sl-v1-filter-grid,.launch-v1-filter-grid,.sl-v1-kpis,.launch-v1-kpis,.launch-v1-gate{grid-template-columns:1fr}.sl-v1-segment{grid-template-columns:1fr}.launch-v1-month-grid,.launch-v1-weekdays{min-width:760px}.launch-v1-calendar-card{overflow:auto}.launch-v1-detail-actions,.launch-v1-full-head{display:grid}.launch-v1-kanban-columns{grid-template-columns:repeat(6,220px)}.launch-v1-board-tree{min-width:620px}.launch-v1-board-group{grid-template-columns:1fr}.launch-v1-board-group header{position:relative}.launch-v1-view-mode{width:100%;justify-content:space-between}.launch-v1-view-mode button{min-width:0;flex:1}}
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
