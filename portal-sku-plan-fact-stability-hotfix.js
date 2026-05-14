(function () {
  if (window.__ALTEA_SKU_PLAN_FACT_STABILITY_20260508B__) return;
  window.__ALTEA_SKU_PLAN_FACT_STABILITY_20260508B__ = true;

  const ROOT_ID = 'view-sku-plan-fact';
  const BASE_SORT_KEYS = ['article', 'owner'];
  const TAIL_SORT_KEYS = ['gap', 'avgCheck', 'turnover', 'ad'];
  let baseRenderSkuPlanFact = null;
  let baseRerenderCurrentView = null;
  let searchTimer = 0;
  let forceRender = false;

  function appState() {
    return typeof state === 'object' && state ? state : (window.__alteaAppState || null);
  }

  function activeSkuPlanFact() {
    const app = appState();
    return String(app?.activeView || '').trim() === 'sku-plan-fact';
  }

  function root() {
    return document.getElementById(ROOT_ID);
  }

  function filters() {
    const app = appState();
    if (!app) return {};
    app.skuPlanFactFilters = {
      search: '',
      owner: 'all',
      status: 'active',
      platform: 'all',
      month: 'latest',
      date: '',
      sort: 'gap',
      sortDir: 'asc',
      ...(app.skuPlanFactFilters || {})
    };
    if (!['asc', 'desc'].includes(app.skuPlanFactFilters.sortDir)) {
      app.skuPlanFactFilters.sortDir = defaultSortDir(app.skuPlanFactFilters.sort);
    }
    return app.skuPlanFactFilters;
  }

  function dateKey(value) {
    const raw = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }

  function defaultSortDir(sort) {
    return ['fact', 'plan', 'drr', 'avgCheck', 'ad', ...planFactPlatforms()].includes(sort) ? 'desc' : 'asc';
  }

  function planFactPlatforms() {
    return Array.isArray(window.SKU_PLAN_FACT_PLATFORMS) && window.SKU_PLAN_FACT_PLATFORMS.length
      ? window.SKU_PLAN_FACT_PLATFORMS
      : ['wb', 'ozon'];
  }

  function planFactPlatformLabels() {
    return window.SKU_PLAN_FACT_PLATFORM_LABELS || { wb: 'WB', ozon: 'Ozon' };
  }

  function sortKeys() {
    return [...BASE_SORT_KEYS, ...planFactPlatforms(), ...TAIL_SORT_KEYS];
  }

  function latestDateFromModel(model) {
    const existing = dateKey(filters().date);
    if (existing) return existing;
    return dateKey(model?.selectedDate) || dateKey(model?.maxFactDate) || new Date().toISOString().slice(0, 10);
  }

  function resetAutoDate() {
    const current = filters();
    if (current.dateMode === 'manual') return;
    current.date = '';
    current.month = 'latest';
    current.dateMode = 'latest';
  }

  function buildModel() {
    if (typeof skuPlanFactBuildModel !== 'function') return null;
    return skuPlanFactBuildModel();
  }

  function valueForSort(row, key) {
    if (key === 'article') return row.article || row.articleKey || '';
    if (key === 'owner') return row.owner || '';
    if (key === 'completion') return row.completionToDate;
    if (key === 'fact') return row.factRevenue;
    if (key === 'plan') return row.planRevenue;
    if (key === 'drr') return row.drr;
    if (planFactPlatforms().includes(key)) return row.platforms?.[key]?.factRevenue ?? row?.[key]?.factRevenue;
    if (key === 'avgCheck') return row.factUnits > 0 ? row.factRevenue / row.factUnits : null;
    if (key === 'turnover') {
      const values = planFactPlatforms().map((platform) => row.platforms?.[platform]?.turnoverDays).filter((value) => Number.isFinite(Number(value)));
      return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
    }
    if (key === 'ad') return row.adSpend;
    return row.gapToDate;
  }

  function compareValues(leftValue, rightValue) {
    const leftEmpty = leftValue === null || leftValue === undefined || leftValue === '';
    const rightEmpty = rightValue === null || rightValue === undefined || rightValue === '';
    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;
    const leftNumber = Number(leftValue);
    const rightNumber = Number(rightValue);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
    return String(leftValue).localeCompare(String(rightValue), 'ru', { numeric: true, sensitivity: 'base' });
  }

  function sortRows(rows) {
    const current = filters();
    const sort = current.sort || 'gap';
    const direction = current.sortDir || defaultSortDir(sort);
    return [...(rows || [])].sort((left, right) => {
      const result = compareValues(valueForSort(left, sort), valueForSort(right, sort));
      return direction === 'desc' ? -result : result;
    });
  }

  function kpiHtml(label, value, hint, tone) {
    if (typeof skuPlanFactMetricHtml === 'function') return skuPlanFactMetricHtml(label, value, hint, tone);
    return `
      <div class="card kpi">
        <div class="label">${escapeHtml(label)}</div>
        <div class="value ${tone || ''}">${value}</div>
        <div class="hint">${escapeHtml(hint || '')}</div>
      </div>
    `;
  }

  function renderStableBody() {
    const host = root();
    if (!host) return;
    const model = buildModel();
    if (!model) return;
    const current = filters();
    const rows = sortRows(model.rows);
    model.rows = rows;
    const totals = rows.reduce((acc, row) => {
      acc.planRevenue += row.planRevenue || 0;
      acc.planToDateRevenue += row.planToDateRevenue || 0;
      acc.factRevenue += row.factRevenue || 0;
      acc.planUnits += row.planUnits || 0;
      acc.factUnits += row.factUnits || 0;
      acc.adSpend += row.adSpend || 0;
      if (row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue) acc.underPlan += 1;
      return acc;
    }, { planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, planUnits: 0, factUnits: 0, adSpend: 0, underPlan: 0 });
    totals.completionToDate = totals.planToDateRevenue > 0 ? totals.factRevenue / totals.planToDateRevenue : null;
    totals.completionMonth = totals.planRevenue > 0 ? totals.factRevenue / totals.planRevenue : null;
    totals.avgCheck = totals.factUnits > 0 ? totals.factRevenue / totals.factUnits : null;
    totals.gapToDate = totals.factRevenue - totals.planToDateRevenue;
    totals.drr = totals.factRevenue > 0 ? totals.adSpend / totals.factRevenue : null;

    const body = host.querySelector('.sku-plan-fact-table tbody');
    if (body && typeof skuPlanFactRowHtml === 'function') {
      body.innerHTML = rows.length
        ? rows.map((row) => skuPlanFactRowHtml(row, model)).join('')
        : `<tr><td colspan="${planFactPlatforms().length + 6}"><div class="empty">По текущим фильтрам нет SKU.</div></td></tr>`;
    }

    const cards = host.querySelector('.grid.cards');
    if (cards && typeof fmt === 'object') {
      const deltaClass = typeof skuPlanFactDeltaClass === 'function' ? skuPlanFactDeltaClass : (() => '');
      cards.innerHTML = [
        kpiHtml('Факт оборота', fmt.money(totals.factRevenue), `план к дате ${fmt.money(totals.planToDateRevenue)}`),
        kpiHtml('Выполнение к дате', fmt.pct(totals.completionToDate), `месячный план: ${fmt.pct(totals.completionMonth)}`, deltaClass(totals.completionToDate - 1)),
        kpiHtml('Отклонение к дате', fmt.money(totals.gapToDate), `${fmt.int(totals.underPlan)} SKU ниже плана`, deltaClass(totals.gapToDate)),
        kpiHtml('Средний чек', fmt.money(totals.avgCheck), `${fmt.int(totals.factUnits)} шт. факт`),
        kpiHtml('Реклама / ДРР', `${fmt.money(totals.adSpend)} · ${fmt.pct(totals.drr)}`, 'по SKU из ads_summary')
      ].join('');
    }

    host.querySelector('.section-title .badge-stack .chip')?.replaceWith(badge(`${fmt.int(rows.length)} SKU`, 'info'));
    host.querySelector('#skuPlanFactSort') && (host.querySelector('#skuPlanFactSort').value = current.sort || 'gap');
    updateSortHeaders();
  }

  function replaceWithoutListeners(node) {
    if (!node || node.dataset.skuStablePatched === '1') return node;
    const clone = node.cloneNode(true);
    clone.dataset.skuStablePatched = '1';
    node.replaceWith(clone);
    return clone;
  }

  function forceBaseRender() {
    if (typeof baseRenderSkuPlanFact !== 'function') return;
    forceRender = true;
    try {
      baseRenderSkuPlanFact(ROOT_ID);
    } finally {
      forceRender = false;
    }
    enhance();
  }

  async function refreshData(button) {
    const text = button?.textContent || '';
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Обновляем...';
      }
      if (typeof window.__alteaResetPortalSnapshotState === 'function') window.__alteaResetPortalSnapshotState();
      const app = appState();
      if (app?.boot?.lazyReady) app.boot.lazyReady.skuPlanFact = false;
      if (app?.boot?.lazyLoads) delete app.boot.lazyLoads.skuPlanFact;
      resetAutoDate();
      if (typeof ensureViewData === 'function') await ensureViewData('sku-plan-fact');
      forceBaseRender();
      if (typeof updateSyncBadge === 'function') updateSyncBadge();
    } catch (error) {
      console.warn('[sku-plan-fact-stability-refresh]', error);
      if (typeof setAppError === 'function') setAppError(`План-факт SKU не смог обновить данные: ${error.message}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = text || 'Обновить данные';
      }
    }
  }

  function ensureDateControl(host, model) {
    const current = filters();
    const oldMonth = host.querySelector('#skuPlanFactMonth');
    const existingDate = host.querySelector('#skuPlanFactDate');
    if (!oldMonth && existingDate) {
      if (current.dateMode !== 'manual') {
        current.dateMode = 'latest';
        const latest = latestDateFromModel(model);
        if (latest) {
          existingDate.value = latest;
          current.date = latest;
          current.month = latest.slice(0, 7);
        }
        if (model?.months?.length) existingDate.min = `${model.months[model.months.length - 1]}-01`;
        if (dateKey(model?.maxFactDate)) existingDate.max = dateKey(model.maxFactDate);
      }
      return;
    }
    const input = document.createElement('input');
    input.id = 'skuPlanFactDate';
    input.type = 'date';
    input.title = 'Дата план-факта';
    input.setAttribute('aria-label', 'Дата план-факта');
    input.value = latestDateFromModel(model);
    if (model?.months?.length) input.min = `${model.months[model.months.length - 1]}-01`;
    if (dateKey(model?.maxFactDate)) input.max = dateKey(model.maxFactDate);
    current.date = input.value;
    current.dateMode = current.dateMode === 'manual' ? 'manual' : 'latest';
    if (oldMonth) oldMonth.replaceWith(input);
  }

  function ensureRefreshButton(host) {
    const stack = host.querySelector('.section-subhead .badge-stack');
    if (!stack || stack.querySelector('[data-sku-plan-fact-refresh]')) return;
    const button = document.createElement('button');
    button.className = 'quick-chip';
    button.type = 'button';
    button.dataset.skuPlanFactRefresh = '1';
    button.textContent = 'Обновить данные';
    stack.prepend(button);
  }

  function ensureSortHeaders(host) {
    const platformLabels = planFactPlatformLabels();
    const keys = sortKeys();
    const labels = [
      'SKU',
      'Owner',
      ...planFactPlatforms().map((platform) => `${platformLabels[platform] || platform} факт / план`),
      'Итого',
      'Средний чек',
      'Оборачиваемость',
      'Реклама / ДРР'
    ];
    host.querySelectorAll('.sku-plan-fact-table thead th').forEach((th, index) => {
      const key = keys[index];
      if (!key || th.querySelector('[data-sku-stable-sort]')) return;
      th.innerHTML = `<button class="table-sort-btn" type="button" data-sku-stable-sort="${key}"><span>${labels[index]}</span><span class="sort-mark"></span></button>`;
    });
    updateSortHeaders();
  }

  function updateSortHeaders() {
    const host = root();
    if (!host) return;
    const current = filters();
    host.querySelectorAll('.sku-plan-fact-table th').forEach((th) => {
      const button = th.querySelector('[data-sku-stable-sort]');
      const active = button && button.dataset.skuStableSort === current.sort;
      th.classList.toggle('is-sorted', Boolean(active));
      th.setAttribute('aria-sort', active ? (current.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
      const mark = button?.querySelector('.sort-mark');
      if (mark) mark.textContent = active ? (current.sortDir === 'asc' ? '↑' : '↓') : '';
    });
  }

  function bindControls(host) {
    const search = replaceWithoutListeners(host.querySelector('#skuPlanFactSearch'));
    const date = replaceWithoutListeners(host.querySelector('#skuPlanFactDate'));
    const owner = replaceWithoutListeners(host.querySelector('#skuPlanFactOwner'));
    const status = replaceWithoutListeners(host.querySelector('#skuPlanFactStatus'));
    const platform = replaceWithoutListeners(host.querySelector('#skuPlanFactPlatform'));
    const sort = replaceWithoutListeners(host.querySelector('#skuPlanFactSort'));
    const exportButton = replaceWithoutListeners(host.querySelector('[data-sku-plan-fact-export]'));
    const refreshButton = replaceWithoutListeners(host.querySelector('[data-sku-plan-fact-refresh]'));

    if (search) {
      const currentSearch = filters();
      search.value = currentSearch.search || '';
      search.addEventListener('input', (event) => {
        const current = filters();
        current.search = event.target.value;
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
          renderStableBody();
          const nextSearch = root()?.querySelector('#skuPlanFactSearch');
          if (nextSearch) {
            nextSearch.focus({ preventScroll: true });
            const position = String(current.search || '').length;
            if (typeof nextSearch.setSelectionRange === 'function') nextSearch.setSelectionRange(position, position);
          }
        }, 80);
      });
    }
    if (date) {
      date.addEventListener('change', (event) => {
        const current = filters();
        const next = dateKey(event.target.value);
        if (!next) return;
        current.date = next;
        current.month = next.slice(0, 7);
        current.dateMode = 'manual';
        forceBaseRender();
      });
    }
    if (owner) owner.addEventListener('change', (event) => { filters().owner = event.target.value; renderStableBody(); });
    if (status) status.addEventListener('change', (event) => { filters().status = event.target.value; renderStableBody(); });
    if (platform) platform.addEventListener('change', (event) => { filters().platform = event.target.value; renderStableBody(); });
    if (sort) {
      sort.addEventListener('change', (event) => {
        const current = filters();
        current.sort = event.target.value;
        current.sortDir = defaultSortDir(current.sort);
        renderStableBody();
      });
    }
    if (exportButton) exportButton.addEventListener('click', () => {
      const model = buildModel();
      if (model && typeof downloadSkuPlanFactExcel === 'function') {
        model.rows = sortRows(model.rows);
        downloadSkuPlanFactExcel(model);
      }
    });
    if (refreshButton) refreshButton.addEventListener('click', (event) => refreshData(event.currentTarget));

    host.querySelectorAll('[data-sku-stable-sort]').forEach((button) => {
      button.addEventListener('click', () => {
        const current = filters();
        const key = button.dataset.skuStableSort;
        if (current.sort === key) current.sortDir = current.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          current.sort = key;
          current.sortDir = defaultSortDir(key);
        }
        renderStableBody();
      });
    });
  }

  function enhance() {
    const host = root();
    if (!host || !host.innerHTML.trim()) return;
    const model = buildModel();
    ensureDateControl(host, model);
    ensureRefreshButton(host);
    ensureSortHeaders(host);
    bindControls(host);
    renderStableBody();
  }

  function wrapRenderers() {
    const renderCandidate = window.renderSkuPlanFact || (typeof renderSkuPlanFact === 'function' ? renderSkuPlanFact : null);
    if (renderCandidate && !baseRenderSkuPlanFact) {
      baseRenderSkuPlanFact = renderCandidate;
      const wrappedRender = function wrappedRenderSkuPlanFact(rootId) {
        const result = baseRenderSkuPlanFact.call(this, rootId || ROOT_ID);
        enhance();
        return result;
      };
      window.renderSkuPlanFact = wrappedRender;
      try { renderSkuPlanFact = wrappedRender; } catch {}
    }

    const rerenderCandidate = window.rerenderCurrentView || (typeof rerenderCurrentView === 'function' ? rerenderCurrentView : null);
    if (rerenderCandidate && !baseRerenderCurrentView) {
      baseRerenderCurrentView = rerenderCandidate;
      const wrappedRerender = function wrappedRerenderCurrentView() {
        const host = root();
        if (!forceRender && activeSkuPlanFact() && host?.querySelector('#skuPlanFactSearch')) {
          resetAutoDate();
          renderStableBody();
          enhance();
          return;
        }
        const result = baseRerenderCurrentView.apply(this, arguments);
        enhance();
        return result;
      };
      window.rerenderCurrentView = wrappedRerender;
      try { rerenderCurrentView = wrappedRerender; } catch {}
    }
  }

  function boot() {
    wrapRenderers();
    enhance();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener('altea:viewchange', () => window.setTimeout(boot, 0));
  window.addEventListener('load', boot);
  window.setTimeout(boot, 500);
  window.setTimeout(boot, 1600);
})();
