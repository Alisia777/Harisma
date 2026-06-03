(function () {
  if (window.__ALTEA_SKU_PLAN_FACT_STABILITY_20260513A__) return;
  window.__ALTEA_SKU_PLAN_FACT_STABILITY_20260513A__ = true;

  const ROOT_ID = 'view-sku-plan-fact';
  let baseRenderSkuPlanFact = null;
  let baseRerenderCurrentView = null;
  let searchTimer = 0;
  let forceRender = false;
  let lastStableBodySignature = '';

  function planFactPlatforms() {
    return Array.isArray(window.SKU_PLAN_FACT_PLATFORMS) && window.SKU_PLAN_FACT_PLATFORMS.length
      ? window.SKU_PLAN_FACT_PLATFORMS
      : ['wb', 'ozon'];
  }

  function planFactPlatformLabel(platform) {
    return window.SKU_PLAN_FACT_PLATFORM_LABELS?.[platform] || String(platform || '').toUpperCase();
  }

  function sortKeys() {
    return ['article', 'owner', 'platform', 'completion', 'gap', 'margin', 'ad', 'action'];
  }

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
      dateFrom: '',
      dateTo: '',
      dateMode: 'latest',
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
    return ['fact', 'plan', 'drr', 'avgCheck', 'turnover', 'ad', 'margin', 'platform', 'action', ...planFactPlatforms()].includes(sort) ? 'desc' : 'asc';
  }

  function latestDateFromModel(model) {
    const existing = dateKey(filters().dateTo || filters().date);
    if (existing) return existing;
    return dateKey(model?.periodEnd) || dateKey(model?.selectedDate) || dateKey(model?.maxFactDate) || new Date().toISOString().slice(0, 10);
  }

  function startDateFromModel(model) {
    const existing = dateKey(filters().dateFrom);
    if (existing) return existing;
    const latest = latestDateFromModel(model);
    return dateKey(model?.periodStart) || (latest ? `${latest.slice(0, 7)}-01` : '');
  }

  function resetAutoDate() {
    const current = filters();
    if (current.dateMode === 'manual') return;
    current.date = '';
    current.dateFrom = '';
    current.dateTo = '';
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
    if (key === 'platform') return row.activePlatformCount || 0;
    if (key === 'completion') return row.completionToDate;
    if (key === 'fact') return row.factRevenue;
    if (key === 'plan') return row.planRevenue;
    if (key === 'margin') return row.marginPct;
    if (key === 'drr') return row.drr;
    if (planFactPlatforms().includes(key)) return row.platforms?.[key]?.factRevenue ?? row[key]?.factRevenue;
    if (key === 'avgCheck') return row.factUnits > 0 ? row.factRevenue / row.factUnits : null;
    if (key === 'turnover') {
      const values = planFactPlatforms()
        .map((platform) => row.platforms?.[platform]?.turnoverDays ?? row[platform]?.turnoverDays)
        .filter((value) => Number.isFinite(Number(value)));
      return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
    }
    if (key === 'ad') return row.adSpend;
    if (key === 'action') {
      if (typeof skuPlanFactAttentionScore === 'function') return skuPlanFactAttentionScore(row);
      return row.matrixProblemState && row.matrixProblemState !== 'ok' ? 1 : 0;
    }
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

  function signedMoney(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fmt.money(0);
    return `${numeric > 0 ? '+' : ''}${fmt.money(numeric)}`;
  }

  function updateSalaryKpiCard(host, model) {
    if (!host || !model || typeof fmt !== 'object') return;
    const card = host.querySelector('.salary-plan-kpi-card');
    const stats = card?.querySelector('.sku-salary-xp-stats');
    if (!card || !stats) return;
    const apiFact = Number(model.totals?.apiFactRevenue ?? model.totals?.payrollOriginal?.factRevenue ?? 0);
    const kpiFact = Number(model.totals?.kpiFactRevenue ?? model.totals?.factRevenue ?? 0);
    if (!Number.isFinite(apiFact) || apiFact <= 0 || !Number.isFinite(kpiFact) || kpiFact <= 0) return;
    const delta = kpiFact - apiFact;
    const ensureStat = (selector, html, anchorSelector = '') => {
      const existing = stats.querySelector(selector);
      if (existing) {
        existing.outerHTML = html;
        return;
      }
      const anchor = anchorSelector ? stats.querySelector(anchorSelector) : null;
      if (anchor) anchor.insertAdjacentHTML('afterend', html);
      else stats.insertAdjacentHTML('afterbegin', html);
    };
    ensureStat(
      '[data-sku-salary-api-fact]',
      `<span data-sku-salary-api-fact><em>API-факт</em><b>${fmt.money(apiFact)}</b></span>`,
      'span'
    );
    ensureStat(
      '[data-sku-salary-kpi-delta]',
      `<span data-sku-salary-kpi-delta><em>дельта KPI/API</em><b>${signedMoney(delta)}</b></span>`,
      '[data-sku-salary-api-fact]'
    );
    const titleParts = [
      `KPI-факт: ${fmt.money(kpiFact)}`,
      `API-факт: ${fmt.money(apiFact)}`,
      `Дельта KPI к API: ${signedMoney(delta)}`,
      `План к дате: ${fmt.money(model.totals?.planToDateRevenue)}`
    ];
    card.title = titleParts.join(' · ');
    card.querySelector('.sku-salary-xp-track')?.setAttribute('title', card.title);
  }

  function renderStableBody() {
    const host = root();
    if (!host) return;
    const model = buildModel();
    if (!model) return;
    const current = filters();
    const rows = sortRows(model.rows);
    model.rows = rows;
    const tableWrap = host.querySelector('.sku-plan-fact-table');
    const body = tableWrap?.querySelector('tbody');
    const scrollSnapshot = tableWrap
      ? { left: tableWrap.scrollLeft || 0, top: tableWrap.scrollTop || 0 }
      : null;
    const bodySignature = JSON.stringify({
      filters: {
        search: current.search || '',
        owner: current.owner || '',
        status: current.status || '',
        platform: current.platform || '',
        date: current.date || '',
        dateFrom: current.dateFrom || '',
        dateTo: current.dateTo || '',
        sort: current.sort || '',
        sortDir: current.sortDir || ''
      },
      periodStart: model.periodStart || '',
      periodEnd: model.periodEnd || '',
      selectedDate: model.selectedDate || '',
      maxFactDate: model.maxFactDate || '',
      rows: rows.map((row) => [
        row.articleKey || row.article || '',
        row.owner || '',
        row.status || '',
        Math.round(Number(row.factRevenue) || 0),
        Math.round(Number(row.planToDateRevenue) || 0),
        Math.round(Number(row.gapToDate) || 0),
        Math.round(Number(row.planAdSpend) || 0),
        Math.round((Number(row.planMarginPct) || 0) * 10000)
      ].join(':'))
    });
    if (!forceRender && body && body.dataset.skuStableSignature === bodySignature && lastStableBodySignature === bodySignature) {
      updateSortHeaders();
      updatePlatformShell(host, model);
      updateSalaryKpiCard(host, model);
      return;
    }
    lastStableBodySignature = bodySignature;
    const totals = rows.reduce((acc, row) => {
      acc.planRevenue += row.planRevenue || 0;
      acc.planToDateRevenue += row.planToDateRevenue || 0;
      acc.factRevenue += row.factRevenue || 0;
      acc.planUnits += row.planUnits || 0;
      acc.factUnits += row.factUnits || 0;
      acc.adSpend += row.adSpend || 0;
      if (row.planAdSpend !== null && row.planAdSpend !== undefined) {
        acc.planAdSpend += Number(row.planAdSpend || 0);
        acc.hasPlanAdSpend = true;
      }
      const marginPct = typeof skuPlanFactNormalizeRatio === 'function'
        ? skuPlanFactNormalizeRatio(row.marginPct)
        : (Number.isFinite(Number(row.marginPct)) ? Number(row.marginPct) : null);
      const marginWeight = Number(row.factRevenue || 0) || Number(row.planToDateRevenue || 0) || Number(row.planRevenue || 0);
      if (marginPct !== null && marginWeight > 0) {
        acc.marginValue += marginPct * marginWeight;
        acc.marginWeight += marginWeight;
      }
      const planMarginPct = typeof skuPlanFactNormalizeRatio === 'function'
        ? skuPlanFactNormalizeRatio(row.planMarginPct)
        : (Number.isFinite(Number(row.planMarginPct)) ? Number(row.planMarginPct) : null);
      const planMarginWeight = Number(row.planToDateRevenue || 0) || Number(row.planRevenue || 0);
      if (planMarginPct !== null && planMarginWeight > 0) {
        acc.planMarginValue += planMarginPct * planMarginWeight;
        acc.planMarginWeight += planMarginWeight;
      }
      if (row.planToDateRevenue > 0 && row.factRevenue < row.planToDateRevenue) acc.underPlan += 1;
      return acc;
    }, { planRevenue: 0, planToDateRevenue: 0, factRevenue: 0, planUnits: 0, factUnits: 0, adSpend: 0, planAdSpend: 0, hasPlanAdSpend: false, marginValue: 0, marginWeight: 0, planMarginValue: 0, planMarginWeight: 0, underPlan: 0 });
    totals.completionToDate = totals.planToDateRevenue > 0 ? totals.factRevenue / totals.planToDateRevenue : null;
    totals.completionMonth = totals.planRevenue > 0 ? totals.factRevenue / totals.planRevenue : null;
    totals.avgCheck = totals.factUnits > 0 ? totals.factRevenue / totals.factUnits : null;
    totals.gapToDate = totals.factRevenue - totals.planToDateRevenue;
    totals.drr = totals.factRevenue > 0 ? totals.adSpend / totals.factRevenue : null;
    totals.planAdSpend = totals.hasPlanAdSpend ? totals.planAdSpend : null;
    totals.planDrr = totals.planToDateRevenue > 0 && totals.planAdSpend !== null ? totals.planAdSpend / totals.planToDateRevenue : null;
    totals.marginPct = totals.marginWeight > 0 ? totals.marginValue / totals.marginWeight : null;
    totals.marginRub = totals.marginPct === null ? null : totals.factRevenue * totals.marginPct;
    totals.planMarginPct = totals.planMarginWeight > 0 ? totals.planMarginValue / totals.planMarginWeight : null;
    totals.planMarginRub = totals.planMarginPct === null ? null : totals.planToDateRevenue * totals.planMarginPct;
    const headlineTotals = model.totals?.payrollSourceTotals ? model.totals : totals;
    const headlineUsesKpi = Boolean(model.totals?.payrollSourceTotals);
    const headlineApiFact = headlineUsesKpi
      ? Number(model.totals?.apiFactRevenue ?? model.totals?.payrollOriginal?.factRevenue ?? totals.factRevenue ?? 0)
      : Number(totals.factRevenue || 0);
    const headlineFactDelta = headlineUsesKpi && headlineApiFact > 0
      ? Number(headlineTotals.factRevenue || 0) - headlineApiFact
      : 0;
    const factHint = headlineUsesKpi
      ? `план к дате ${fmt.money(headlineTotals.planToDateRevenue)} · API-факт ${fmt.money(headlineApiFact)} · дельта KPI ${fmt.money(headlineFactDelta)}`
      : `план к дате ${fmt.money(headlineTotals.planToDateRevenue)}`;

    if (body && typeof skuPlanFactRowHtml === 'function') {
      const tableColspan = 8;
      body.innerHTML = rows.length
        ? rows.map((row) => skuPlanFactRowHtml(row, model)).join('')
        : `<tr><td colspan="${tableColspan}"><div class="empty">По текущим фильтрам нет SKU.</div></td></tr>`;
      body.dataset.skuStableSignature = bodySignature;
    }

    const platformBoard = host.querySelector('.sku-plan-platform-board');
    if (platformBoard && typeof skuPlanFactPlatformBoardHtml === 'function') {
      const temp = document.createElement('div');
      temp.innerHTML = skuPlanFactPlatformBoardHtml(model).trim();
      const nextBoard = temp.firstElementChild;
      if (nextBoard) platformBoard.replaceWith(nextBoard);
    }

    const cards = host.querySelector('.grid.cards');
    if (cards && typeof fmt === 'object') {
      const deltaClass = typeof skuPlanFactDeltaClass === 'function' ? skuPlanFactDeltaClass : (() => '');
      cards.innerHTML = [
        kpiHtml(headlineUsesKpi ? 'KPI-факт оборота' : 'Факт оборота', fmt.money(headlineTotals.factRevenue), factHint),
        kpiHtml('Выполнение к дате', fmt.pct(headlineTotals.completionToDate), `месячный план: ${fmt.pct(headlineTotals.completionMonth)}`, deltaClass(headlineTotals.completionToDate - 1)),
        kpiHtml('Отклонение к дате', fmt.money(headlineTotals.gapToDate), `${fmt.int(totals.underPlan)} SKU ниже плана`, deltaClass(headlineTotals.gapToDate)),
        kpiHtml('Средний чек', fmt.money(totals.avgCheck), `${fmt.int(totals.factUnits)} шт. факт`),
        kpiHtml('Реклама / ДРР', `${fmt.money(headlineTotals.adSpend)} · ${fmt.pct(headlineTotals.drr)}`, `план ${fmt.money(headlineTotals.planAdSpend)} · ДРР план ${fmt.pct(headlineTotals.planDrr)}`)
      ].join('');
    }

    const titleStack = host.querySelector('.section-title .badge-stack');
    if (titleStack && typeof fmt === 'object') {
      const titleChips = [...titleStack.querySelectorAll('.chip')];
      const setChip = (match, text, tone = '') => {
        const chip = titleChips.find((item) => match(String(item.textContent || '')));
        if (!chip) return;
        chip.className = `chip ${tone}`.trim();
        chip.textContent = text;
      };
      setChip((text) => text.includes('SKU'), `${fmt.int(rows.length)} SKU`, 'info');
      setChip((text) => text.includes('API'), `${fmt.int(model.unmappedCount || 0)} API без пары`, model.unmappedCount ? 'warn' : 'ok');
      setChip((text) => text.includes('маржа'), `маржа ${fmt.pct(headlineTotals.marginPct)}`, typeof skuPlanFactMarginTone === 'function' ? skuPlanFactMarginTone(headlineTotals.marginPct) : '');
      setChip((text) => text.includes('период') || text.includes('факт до'), `период ${model.periodStart || '—'} - ${model.periodEnd || model.maxFactDate || '—'}`, 'ok');
    }
    host.querySelector('#skuPlanFactSort') && (host.querySelector('#skuPlanFactSort').value = current.sort || 'gap');
    host.querySelector('#skuPlanFactPlatform') && (host.querySelector('#skuPlanFactPlatform').value = current.platform || 'all');
    host.querySelector('#skuPlanFactDateFrom') && (host.querySelector('#skuPlanFactDateFrom').value = model.periodStart || current.dateFrom || '');
    host.querySelector('#skuPlanFactDateTo') && (host.querySelector('#skuPlanFactDateTo').value = model.periodEnd || current.dateTo || current.date || '');
    updatePlatformShell(host, model);
    updateSalaryKpiCard(host, model);
    updateSortHeaders();
    if (tableWrap && scrollSnapshot) {
      tableWrap.scrollLeft = scrollSnapshot.left;
      tableWrap.scrollTop = scrollSnapshot.top;
    }
    bindPlatformCards(host);
  }

  function updatePlatformShell(host, model) {
    const shell = host?.querySelector('.sku-plan-fact-shell');
    if (!shell) return;
    const current = filters();
    const platform = current.platform !== 'all' ? current.platform : '';
    shell.classList.toggle('is-platform-drill', Boolean(platform));
    shell.dataset.skuPlanActivePlatform = platform || 'all';
    if (platform && typeof skuPlanFactCardStyle === 'function') {
      shell.setAttribute('style', skuPlanFactCardStyle(platform, model?.totals?.completionToDate ?? null));
    } else {
      shell.removeAttribute('style');
    }
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
    const rangeFrom = host.querySelector('#skuPlanFactDateFrom');
    const rangeTo = host.querySelector('#skuPlanFactDateTo');
    const existingDate = host.querySelector('#skuPlanFactDate');
    if (rangeFrom || rangeTo) {
      const latest = latestDateFromModel(model);
      const start = startDateFromModel(model);
      const minDate = model?.dateMin || (model?.months?.length ? `${model.months[model.months.length - 1]}-01` : '');
      const maxDate = dateKey(model?.maxAvailableDate || model?.maxFactDate || latest);
      if (rangeFrom) {
        rangeFrom.value = start;
        if (minDate) rangeFrom.min = minDate;
        if (maxDate) rangeFrom.max = maxDate;
      }
      if (rangeTo) {
        rangeTo.value = latest;
        if (minDate) rangeTo.min = minDate;
        if (maxDate) rangeTo.max = maxDate;
      }
      if (current.dateMode !== 'manual') {
        current.dateFrom = start;
        current.dateTo = latest;
        current.date = latest;
        current.month = latest ? latest.slice(0, 7) : current.month;
        current.dateMode = 'latest';
      }
      return;
    }
    if (!oldMonth && existingDate) {
      if (current.dateMode !== 'manual') {
        current.dateMode = 'latest';
        const latest = latestDateFromModel(model);
        if (latest) {
          existingDate.value = latest;
          current.date = latest;
          current.dateTo = latest;
          current.dateFrom = startDateFromModel(model);
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
    current.dateTo = input.value;
    current.dateFrom = startDateFromModel(model);
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
    const labels = ['SKU', 'Owner', 'Площадка', 'Выполнение', 'Факт / план', 'Маржа', 'Реклама / ДРР', 'Карточка'];
    host.querySelectorAll('.sku-plan-fact-table thead th').forEach((th, index) => {
      const key = sortKeys()[index];
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

  function bindPlatformCards(host) {
    host?.querySelectorAll('[data-sku-plan-fact-platform-card]').forEach((button) => {
      if (button.dataset.skuStablePlatformBound === '1') return;
      button.dataset.skuStablePlatformBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const current = filters();
        const value = button.dataset.skuPlanFactPlatformCard || 'all';
        current.platform = current.platform === value ? 'all' : value;
        renderStableBody();
      });
    });
  }

  function bindControls(host) {
    const search = replaceWithoutListeners(host.querySelector('#skuPlanFactSearch'));
    const date = replaceWithoutListeners(host.querySelector('#skuPlanFactDate'));
    const dateFrom = replaceWithoutListeners(host.querySelector('#skuPlanFactDateFrom'));
    const dateTo = replaceWithoutListeners(host.querySelector('#skuPlanFactDateTo'));
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
        current.dateTo = next;
        if (!current.dateFrom || current.dateFrom > next || current.dateFrom.slice(0, 7) !== next.slice(0, 7)) current.dateFrom = `${next.slice(0, 7)}-01`;
        current.month = next.slice(0, 7);
        current.dateMode = 'manual';
        forceBaseRender();
      });
    }
    if (dateFrom) {
      dateFrom.addEventListener('change', (event) => {
        const current = filters();
        const next = dateKey(event.target.value);
        if (!next) return;
        current.dateFrom = next;
        current.month = next.slice(0, 7);
        current.dateMode = 'manual';
        if (!current.dateTo || current.dateTo.slice(0, 7) !== next.slice(0, 7) || current.dateTo < next) {
          current.dateTo = next;
          current.date = next;
        }
        forceBaseRender();
      });
    }
    if (dateTo) {
      dateTo.addEventListener('change', (event) => {
        const current = filters();
        const next = dateKey(event.target.value);
        if (!next) return;
        current.date = next;
        current.dateTo = next;
        current.month = next.slice(0, 7);
        current.dateMode = 'manual';
        if (!current.dateFrom || current.dateFrom.slice(0, 7) !== next.slice(0, 7) || current.dateFrom > next) {
          current.dateFrom = `${next.slice(0, 7)}-01`;
        }
        forceBaseRender();
      });
    }
    if (owner) owner.addEventListener('change', (event) => { filters().owner = event.target.value; renderStableBody(); });
    if (status) status.addEventListener('change', (event) => { filters().status = event.target.value; renderStableBody(); });
    if (platform) platform.addEventListener('change', (event) => { filters().platform = event.target.value; renderStableBody(); });
    bindPlatformCards(host);
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
