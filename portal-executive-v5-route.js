(function () {
  'use strict';

  if (window.__ALTEA_EXECUTIVE_V5_ROUTE_20260624__) return;
  window.__ALTEA_EXECUTIVE_V5_ROUTE_20260624__ = true;

  const VERSION = '20260624-executive-owner-detail';
  const PLATFORM_KEYS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit'];
  const PLATFORM_LABELS = {
    all: 'Все',
    wb: 'WB',
    ozon: 'Ozon',
    ya: 'Я.Маркет',
    goldapple: 'ЗЯ',
    letu: "Л'Этуаль",
    megamarket: 'Мегамаркет',
    samokat: 'Самокат',
    magnit: 'Магнит'
  };
  const NO_OWNER = 'Без owner';
  const FILTERS = window.__ALTEA_EXECUTIVE_V5_FILTERS__ || {
    platform: 'all',
    owner: 'all',
    status: 'all',
    search: ''
  };
  window.__ALTEA_EXECUTIVE_V5_FILTERS__ = FILTERS;

  let scheduled = false;
  let renderApi = null;

  function appState() {
    return window.__alteaAppState || window.state || {};
  }

  function html(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function number(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
  }

  function fmtInt(value) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(number(value)));
  }

  function fmtMoney(value) {
    const n = number(value);
    if (Math.abs(n) >= 1000000) return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n / 1000000)} млн ₽`;
    if (Math.abs(n) >= 1000) return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n / 1000)} тыс. ₽`;
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n)} ₽`;
  }

  function fmtPct(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(Number(value) * 100)}%`;
  }

  function signedMoney(value) {
    const n = number(value);
    if (!n) return '+0 ₽';
    return `${n > 0 ? '+' : ''}${fmtMoney(n)}`;
  }

  function activeView() {
    return String(appState().activeView || window.location.hash.replace('#', '') || 'dashboard');
  }

  function isExecutiveActive() {
    return activeView() === 'executive' || window.location.hash === '#executive';
  }

  function activeTasks() {
    try {
      if (typeof window.getControlSnapshot === 'function') {
        const snapshot = window.getControlSnapshot();
        if (Array.isArray(snapshot?.active)) return snapshot.active;
      }
    } catch {}
    const state = appState();
    const tasks = state.storage?.tasks || state.tasks || [];
    return Array.isArray(tasks)
      ? tasks.filter((task) => !['done', 'cancelled'].includes(String(task?.status || '')))
      : [];
  }

  function isOverdue(task) {
    try {
      if (typeof window.isTaskOverdue === 'function') return Boolean(window.isTaskOverdue(task));
    } catch {}
    if (!task?.due) return false;
    const due = new Date(`${task.due}T23:59:59`);
    return Number.isFinite(due.getTime()) && due < new Date();
  }

  function taskTitle(task) {
    return task?.title || task?.entityLabel || task?.articleKey || 'Задача';
  }

  function taskPlatform(task) {
    const raw = String(task?.platform || task?.marketplace || '').toLowerCase();
    if (raw.includes('ozon')) return 'ozon';
    if (raw.includes('wb') || raw.includes('wild')) return 'wb';
    if (raw.includes('ya') || raw.includes('yandex') || raw.includes('янд')) return 'ya';
    return 'all';
  }

  function taskPriorityScore(task) {
    if (isOverdue(task)) return 6;
    if (task?.priority === 'critical') return 5;
    if (task?.status === 'waiting_decision') return 4;
    if (task?.status === 'waiting_rop') return 3;
    if (!task?.owner) return 2;
    return 1;
  }

  function taskStatusText(task) {
    const status = String(task?.status || 'new');
    if (status === 'waiting_rop') return 'ждет РОП';
    if (status === 'waiting_decision') return 'ждет финал';
    if (status === 'in_progress') return 'в работе';
    if (status === 'waiting_team') return 'у команды';
    return 'новая';
  }

  function planModel() {
    try {
      if (typeof window.skuPlanFactBuildModel === 'function') {
        return window.skuPlanFactBuildModel(null, { persistFilters: false });
      }
    } catch (error) {
      console.warn('[executive-v5-plan-model]', error);
    }
    return null;
  }

  function metricFor(row, platform) {
    if (!row) return null;
    if (platform && platform !== 'all') return row.platforms?.[platform] || row[platform] || null;
    return {
      planRevenue: row.planRevenue,
      planToDateRevenue: row.planToDateRevenue,
      factRevenue: row.factRevenue,
      adSpend: row.adSpend,
      planAdSpend: row.planAdSpend,
      marginPct: row.marginPct,
      planMarginPct: row.planMarginPct
    };
  }

  function ownerFor(row, platform) {
    const supportKey = platform === 'ya' ? 'ym' : (platform === 'ym' ? 'ya' : platform);
    const scoped = platform && platform !== 'all'
      ? (
        row?.ownerByPlatform?.[platform]
        || row?.ownerByPlatform?.[supportKey]
        || row?.ownersByPlatform?.[platform]
        || row?.ownersByPlatform?.[supportKey]
        || row?.ownersByPlatform?.[`${platform}Support`]
      )
      : '';
    return String(scoped || row?.owner || row?.ownerBase || NO_OWNER).trim() || NO_OWNER;
  }

  function hasMetric(metric) {
    if (!metric) return false;
    return number(metric.planRevenue)
      || number(metric.planToDateRevenue)
      || number(metric.factRevenue)
      || number(metric.adSpend)
      || number(metric.planAdSpend);
  }

  function emptyAgg(label = '') {
    return {
      label,
      planRevenue: 0,
      planToDateRevenue: 0,
      factRevenue: 0,
      adSpend: 0,
      planAdSpend: 0,
      marginWeight: 0,
      marginValue: 0,
      planMarginWeight: 0,
      planMarginValue: 0,
      skuCount: 0,
      underPlan: 0,
      noPlan: 0
    };
  }

  function addMetric(target, metric) {
    if (!metric) return target;
    target.planRevenue += number(metric.planRevenue);
    target.planToDateRevenue += number(metric.planToDateRevenue);
    target.factRevenue += number(metric.factRevenue);
    target.adSpend += number(metric.adSpend);
    target.planAdSpend += number(metric.planAdSpend);
    const marginPct = Number(metric.marginPct);
    const marginWeight = number(metric.factRevenue) || number(metric.planToDateRevenue) || number(metric.planRevenue);
    if (Number.isFinite(marginPct) && marginWeight > 0) {
      target.marginValue += marginPct * marginWeight;
      target.marginWeight += marginWeight;
    }
    const planMarginPct = Number(metric.planMarginPct);
    const planMarginWeight = number(metric.planToDateRevenue) || number(metric.planRevenue);
    if (Number.isFinite(planMarginPct) && planMarginWeight > 0) {
      target.planMarginValue += planMarginPct * planMarginWeight;
      target.planMarginWeight += planMarginWeight;
    }
    return target;
  }

  function finishAgg(target) {
    target.completion = target.planToDateRevenue > 0 ? target.factRevenue / target.planToDateRevenue : null;
    target.gap = target.factRevenue - target.planToDateRevenue;
    target.drr = target.factRevenue > 0 ? target.adSpend / target.factRevenue : null;
    target.marginPct = target.marginWeight > 0 ? target.marginValue / target.marginWeight : null;
    target.planMarginPct = target.planMarginWeight > 0 ? target.planMarginValue / target.planMarginWeight : null;
    target.marginRub = target.marginPct === null ? null : target.factRevenue * target.marginPct;
    return target;
  }

  function collectExecutiveModel() {
    const model = planModel();
    const rows = (Array.isArray(model?.allRows) ? model.allRows : Array.isArray(model?.rows) ? model.rows : [])
      .filter((row) => row && !row.syntheticUnmapped && !row.syntheticUnallocated);
    const platforms = FILTERS.platform === 'all' ? PLATFORM_KEYS : [FILTERS.platform].filter((key) => PLATFORM_KEYS.includes(key));
    const ownerMap = new Map();
    const platformMap = new Map();
    const overall = emptyAgg('Итого');

    rows.forEach((row) => {
      platforms.forEach((platform) => {
        const metric = metricFor(row, platform);
        if (!hasMetric(metric)) return;
        const owner = ownerFor(row, platform);
        if (!ownerMap.has(owner)) ownerMap.set(owner, emptyAgg(owner));
        const ownerAgg = ownerMap.get(owner);
        addMetric(ownerAgg, metric);
        ownerAgg.skuCount += 1;
        if (number(metric.planToDateRevenue) > 0 && number(metric.factRevenue) < number(metric.planToDateRevenue)) ownerAgg.underPlan += 1;
        if (number(metric.planRevenue) <= 0 && number(metric.factRevenue) > 0) ownerAgg.noPlan += 1;

        if (!platformMap.has(platform)) platformMap.set(platform, emptyAgg(PLATFORM_LABELS[platform] || platform));
        const platformAgg = platformMap.get(platform);
        addMetric(platformAgg, metric);
        platformAgg.skuCount += 1;

        addMetric(overall, metric);
        overall.skuCount += 1;
      });
    });

    const ownerRows = Array.from(ownerMap.values()).map(finishAgg);
    const platformRows = Array.from(platformMap.entries()).map(([key, value]) => ({ key, ...finishAgg(value) }));
    finishAgg(overall);

    const owners = ownerRows.map((row) => row.label).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'));
    let filteredOwners = ownerRows;
    if (FILTERS.owner !== 'all') filteredOwners = filteredOwners.filter((row) => row.label === FILTERS.owner);
    const search = String(FILTERS.search || '').trim().toLowerCase();
    if (search) filteredOwners = filteredOwners.filter((row) => row.label.toLowerCase().includes(search));
    if (FILTERS.status === 'under') filteredOwners = filteredOwners.filter((row) => row.completion !== null && row.completion < 0.9);
    if (FILTERS.status === 'risk') filteredOwners = filteredOwners.filter((row) => row.underPlan || row.noPlan || row.planToDateRevenue <= 0);
    if (FILTERS.status === 'ok') filteredOwners = filteredOwners.filter((row) => row.completion !== null && row.completion >= 0.9);
    filteredOwners = filteredOwners
      .sort((left, right) => {
        const leftScore = left.completion === null ? -1 : left.completion;
        const rightScore = right.completion === null ? -1 : right.completion;
        return leftScore - rightScore || number(left.gap) - number(right.gap);
      })
      .slice(0, 12);

    const tasks = activeTasks();
    const focusTasks = tasks
      .filter((task) => taskPriorityScore(task) > 1)
      .sort((left, right) => taskPriorityScore(right) - taskPriorityScore(left))
      .slice(0, 8);

    return {
      ready: Boolean(model),
      source: model,
      period: model ? `${model.periodStart || '—'} — ${model.periodEnd || model.selectedDate || '—'}` : 'данные еще грузятся',
      overall,
      owners,
      ownerRows: filteredOwners,
      platformRows,
      tasks,
      focusTasks
    };
  }

  function tone(row) {
    if (row.completion === null) return 'muted';
    if (row.completion >= 1) return 'ok';
    if (row.completion >= 0.9) return 'warn';
    return 'danger';
  }

  function badge(text, kind = '') {
    return `<span class="executive-v5-badge ${html(kind)}">${html(text)}</span>`;
  }

  function kpiCard(label, value, hint, kind = '') {
    return `
      <article class="executive-v5-kpi ${html(kind)}">
        <span>${html(label)}</span>
        <strong>${html(value)}</strong>
        <em>${html(hint)}</em>
      </article>
    `;
  }

  function platformCard(row) {
    return `
      <button class="executive-v5-platform ${FILTERS.platform === row.key ? 'active' : ''}" type="button" data-exec-v5-platform="${html(row.key)}">
        <span>${html(row.label)}</span>
        <strong>${fmtPct(row.completion)}</strong>
        <em>${fmtMoney(row.factRevenue)} / ${fmtMoney(row.planToDateRevenue)}</em>
        <i><b style="width:${Math.max(0, Math.min(130, number(row.completion) * 100)).toFixed(1)}%"></b></i>
      </button>
    `;
  }

  function ownerCard(row, index) {
    const rowTone = tone(row);
    return `
      <article class="executive-v5-owner ${html(rowTone)}" data-exec-v5-owner-card="${html(row.label)}" role="button" tabindex="0">
        <div class="executive-v5-owner-head">
          <span>#${index + 1}</span>
          <strong>${html(row.label)}</strong>
          <b>${fmtPct(row.completion)}</b>
        </div>
        <div class="executive-v5-owner-meta">
          ${badge(`${fmtInt(row.skuCount)} SKU`, '')}
          ${row.planToDateRevenue > 0 ? badge(row.completion >= 0.9 ? 'в плане' : 'догнать', rowTone) : badge('без плана', 'danger')}
          ${row.underPlan ? badge(`${fmtInt(row.underPlan)} ниже`, 'danger') : ''}
        </div>
        <div class="executive-v5-progress"><i style="width:${Math.max(0, Math.min(130, number(row.completion) * 100)).toFixed(1)}%"></i></div>
        <div class="executive-v5-metrics">
          <div><span>План к дате</span><strong>${fmtMoney(row.planToDateRevenue)}</strong></div>
          <div><span>Факт</span><strong>${fmtMoney(row.factRevenue)}</strong></div>
          <div><span>Разрыв</span><strong class="${row.gap >= 0 ? 'good' : 'bad'}">${signedMoney(row.gap)}</strong></div>
          <div><span>Маржа</span><strong>${fmtPct(row.marginPct)}</strong></div>
          <div><span>Реклама</span><strong>${fmtMoney(row.adSpend)}</strong></div>
          <div><span>ДРР</span><strong>${fmtPct(row.drr)}</strong></div>
        </div>
      </article>
    `;
  }

  function decisionCard(task) {
    const platform = taskPlatform(task);
    return `
      <article class="executive-v5-decision">
        <span>${html(PLATFORM_LABELS[platform] || 'Общее')} · ${html(taskStatusText(task))}${isOverdue(task) ? ' · просрочено' : ''}</span>
        <strong>${html(taskTitle(task))}</strong>
        <em>${html(task.owner || NO_OWNER)}${task.due ? ` · срок ${html(task.due)}` : ''}</em>
      </article>
    `;
  }

  function renderFilters(model) {
    const ownerOptions = ['<option value="all">Все сотрудники</option>']
      .concat(model.owners.map((owner) => `<option value="${html(owner)}" ${FILTERS.owner === owner ? 'selected' : ''}>${html(owner)}</option>`))
      .join('');
    return `
      <section class="executive-v5-filters">
        <div class="executive-v5-platform-tabs">
          ${['all'].concat(PLATFORM_KEYS).map((key) => `<button type="button" data-exec-v5-platform="${html(key)}" class="${FILTERS.platform === key ? 'active' : ''}">${html(PLATFORM_LABELS[key] || key)}</button>`).join('')}
        </div>
        <label><span>Сотрудник</span><select data-exec-v5-owner>${ownerOptions}</select></label>
        <label><span>Статус</span><select data-exec-v5-status>
          <option value="all" ${FILTERS.status === 'all' ? 'selected' : ''}>Все</option>
          <option value="under" ${FILTERS.status === 'under' ? 'selected' : ''}>Ниже 90%</option>
          <option value="risk" ${FILTERS.status === 'risk' ? 'selected' : ''}>Риск / без плана</option>
          <option value="ok" ${FILTERS.status === 'ok' ? 'selected' : ''}>В плане</option>
        </select></label>
        <label><span>Поиск</span><input data-exec-v5-search type="search" value="${html(FILTERS.search)}" placeholder="Имя сотрудника"></label>
      </section>
    `;
  }

  function renderNow() {
    const root = document.getElementById('view-executive');
    if (!root) return;
    const model = collectExecutiveModel();
    const overall = model.overall;
    const teamInPlan = model.ownerRows.filter((row) => row.completion !== null && row.completion >= 0.9).length;
    const teamTotal = model.owners.length;
    const renderKey = [
      VERSION,
      FILTERS.platform,
      FILTERS.owner,
      FILTERS.status,
      FILTERS.search,
      overall.factRevenue,
      overall.planToDateRevenue,
      teamTotal,
      model.tasks.length
    ].join('|');
    if (root.dataset.executiveV5RenderKey === renderKey && root.querySelector('[data-executive-v5]')) return;
    root.dataset.executiveV5RenderKey = renderKey;
    root.dataset.executiveLayer = VERSION;
    root.innerHTML = `
      <section class="altea-premium-route--executive executive-v5-shell" data-executive-v5 data-version="${html(VERSION)}">
        <header class="executive-v5-hero">
          <div>
            <span>ALTEA · EXECUTIVE V5</span>
            <h2>Руководителю</h2>
            <p>План-факт по сотрудникам, отклонения и решения без старого task-lite слоя. Все цифры берутся из действующей матрицы SKU и API-факта.</p>
          </div>
          <div class="executive-v5-badges">
            ${badge(`период ${model.period}`, 'info')}
            ${badge(`${fmtInt(teamInPlan)} / ${fmtInt(teamTotal)} в плане`, teamInPlan === teamTotal && teamTotal ? 'ok' : 'warn')}
            ${badge(`${fmtInt(model.focusTasks.length)} решений`, model.focusTasks.length ? 'danger' : 'ok')}
          </div>
        </header>

        <section class="executive-v5-kpis">
          ${kpiCard('Оборот', fmtPct(overall.completion), `факт ${fmtMoney(overall.factRevenue)} · план ${fmtMoney(overall.planToDateRevenue)}`, tone(overall))}
          ${kpiCard('Разрыв', signedMoney(overall.gap), 'отклонение к плану на дату', overall.gap >= 0 ? 'ok' : 'danger')}
          ${kpiCard('Маржа', fmtPct(overall.marginPct), `маржа ${fmtMoney(overall.marginRub)}`, 'ok')}
          ${kpiCard('Реклама', fmtPct(overall.drr), `расход ${fmtMoney(overall.adSpend)}`, overall.drr && overall.drr > 0.12 ? 'warn' : 'ok')}
          ${kpiCard('Команда', `${fmtInt(teamInPlan)} / ${fmtInt(teamTotal)}`, 'сотрудники в плане / всего', teamInPlan === teamTotal && teamTotal ? 'ok' : 'warn')}
        </section>

        ${renderFilters(model)}

        <section class="executive-v5-platforms">
          ${(model.platformRows.length ? model.platformRows : PLATFORM_KEYS.map((key) => finishAgg({ ...emptyAgg(PLATFORM_LABELS[key]), key }))).map(platformCard).join('')}
        </section>

        <section class="executive-v5-section">
          <div class="executive-v5-section-head">
            <div><span>Сотрудники</span><h3>KPI, маржа, реклама и разрыв</h3></div>
            ${badge(`${fmtInt(model.ownerRows.length)} показано`, 'info')}
          </div>
          <div class="executive-v5-owner-grid">
            ${model.ownerRows.length ? model.ownerRows.map(ownerCard).join('') : '<div class="executive-v5-empty">По текущим фильтрам сотрудников нет.</div>'}
          </div>
        </section>

        <section class="executive-v5-bottom">
          <div class="executive-v5-section">
            <div class="executive-v5-section-head"><div><span>Решения</span><h3>Что требует внимания</h3></div>${badge(`${fmtInt(model.focusTasks.length)} задач`, model.focusTasks.length ? 'danger' : 'ok')}</div>
            <div class="executive-v5-decision-list">
              ${model.focusTasks.length ? model.focusTasks.map(decisionCard).join('') : '<div class="executive-v5-empty">Срочных решений по задачам нет.</div>'}
            </div>
          </div>
          <div class="executive-v5-section">
            <div class="executive-v5-section-head"><div><span>Качество данных</span><h3>Что может исказить KPI</h3></div></div>
            <div class="executive-v5-risk-grid">
              <article><span>Без плана</span><strong>${fmtInt(model.ownerRows.filter((row) => row.planToDateRevenue <= 0 && row.factRevenue > 0).length)}</strong><em>сотрудников/контуров</em></article>
              <article><span>Ниже плана</span><strong>${fmtInt(model.ownerRows.filter((row) => row.completion !== null && row.completion < 0.9).length)}</strong><em>требуют догнать</em></article>
              <article><span>Активные задачи</span><strong>${fmtInt(model.tasks.length)}</strong><em>в задачнике</em></article>
              <article><span>Источник</span><strong>${model.ready ? 'OK' : '...'}</strong><em>План-факт SKU</em></article>
            </div>
          </div>
        </section>
      </section>
    `;
    bind(root);
  }

  function bind(root) {
    root.querySelectorAll('[data-exec-v5-platform]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-exec-v5-platform') || 'all';
        FILTERS.platform = PLATFORM_KEYS.includes(key) ? key : 'all';
        schedule(true);
      });
    });
    root.querySelector('[data-exec-v5-owner]')?.addEventListener('change', (event) => {
      FILTERS.owner = event.target.value || 'all';
      schedule(true);
    });
    root.querySelector('[data-exec-v5-status]')?.addEventListener('change', (event) => {
      FILTERS.status = event.target.value || 'all';
      schedule(true);
    });
    root.querySelector('[data-exec-v5-search]')?.addEventListener('input', (event) => {
      FILTERS.search = event.target.value || '';
      schedule(true);
    });
    root.querySelectorAll('[data-exec-v5-owner-card]').forEach((card) => {
      const openOwner = () => {
        const owner = card.getAttribute('data-exec-v5-owner-card') || 'all';
        if (owner !== 'all' && window.AlteaExecutiveOwnerSkuDrawer?.open) {
          window.AlteaExecutiveOwnerSkuDrawer.open(owner);
          return;
        }
        FILTERS.owner = owner;
        schedule(true);
      };
      card.addEventListener('click', openOwner);
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openOwner();
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('executive-v5-route-style')) return;
    const style = document.createElement('style');
    style.id = 'executive-v5-route-style';
    style.textContent = `
      #view-executive[data-executive-layer]{display:block}
      .executive-v5-shell,.executive-v5-shell *{box-sizing:border-box;min-width:0}
      .executive-v5-shell{--ev5-bg:#080706;--ev5-panel:#12100d;--ev5-line:rgba(222,190,128,.18);--ev5-line2:rgba(222,190,128,.28);--ev5-text:#f8f1de;--ev5-muted:rgba(248,241,222,.62);--ev5-gold:#d8b36c;--ev5-good:#78e2a0;--ev5-warn:#f2c76d;--ev5-bad:#ff7f73;display:grid;gap:16px;color:var(--ev5-text);animation:executiveV5In .28s ease both}
      .executive-v5-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;border-bottom:1px solid rgba(222,190,128,.14);padding:4px 0 12px}
      .executive-v5-hero span,.executive-v5-section-head span,.executive-v5-kpi span,.executive-v5-filters span,.executive-v5-risk-grid span{display:block;color:#d8bc82;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:0}
      .executive-v5-hero h2{margin:6px 0;font-size:clamp(34px,3.6vw,56px);line-height:.98}
      .executive-v5-hero p{margin:0;max-width:820px;color:var(--ev5-muted);font-size:14px;line-height:1.5}
      .executive-v5-badges,.executive-v5-owner-meta{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
      .executive-v5-badge{display:inline-flex;align-items:center;min-height:28px;border:1px solid rgba(222,190,128,.18);border-radius:999px;background:rgba(255,255,255,.035);color:rgba(248,241,222,.78);padding:5px 10px;font-size:11px;font-weight:850}
      .executive-v5-badge.ok{border-color:rgba(120,226,160,.34);color:#9cf0b8}.executive-v5-badge.warn{border-color:rgba(242,199,109,.42);color:#f7dc98}.executive-v5-badge.danger{border-color:rgba(255,127,115,.45);color:#ffaaa2}.executive-v5-badge.info{border-color:rgba(216,179,108,.34);color:#f1d69a}
      .executive-v5-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
      .executive-v5-kpi,.executive-v5-section,.executive-v5-platform,.executive-v5-owner,.executive-v5-filters,.executive-v5-risk-grid article{border:1px solid var(--ev5-line);border-radius:8px;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.012));box-shadow:inset 0 1px 0 rgba(255,255,255,.045)}
      .executive-v5-kpi{min-height:112px;padding:15px;display:grid;align-content:space-between;gap:10px}
      .executive-v5-kpi strong{font-size:clamp(22px,2vw,34px);line-height:1;font-variant-numeric:tabular-nums}.executive-v5-kpi em{font-style:normal;color:var(--ev5-muted);font-size:12px}
      .executive-v5-kpi.ok{border-color:rgba(120,226,160,.28)}.executive-v5-kpi.warn{border-color:rgba(242,199,109,.36)}.executive-v5-kpi.danger{border-color:rgba(255,127,115,.40);background:linear-gradient(145deg,rgba(126,36,30,.18),rgba(255,255,255,.012))}
      .executive-v5-filters{position:sticky;top:8px;z-index:80;display:grid;grid-template-columns:minmax(280px,1.4fr) minmax(190px,.8fr) minmax(170px,.7fr) minmax(220px,.8fr);gap:10px;align-items:end;padding:14px;background:linear-gradient(135deg,rgba(22,18,13,.96),rgba(8,7,6,.96))}
      .executive-v5-platform-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.executive-v5-platform-tabs button,.executive-v5-filters input,.executive-v5-filters select{min-height:40px;border:1px solid rgba(222,190,128,.18);border-radius:8px;background:rgba(0,0,0,.32);color:var(--ev5-text);padding:0 12px;font:inherit;font-size:12px;font-weight:850}.executive-v5-platform-tabs button{cursor:pointer}.executive-v5-platform-tabs button.active{background:linear-gradient(180deg,#f1d793,#b78332);color:#130e08;border-color:rgba(255,235,184,.42)}
      .executive-v5-filters label{display:grid;gap:6px}
      .executive-v5-platforms{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.executive-v5-platform{text-align:left;display:grid;gap:7px;min-height:104px;padding:14px;color:inherit;cursor:pointer}.executive-v5-platform.active{border-color:rgba(216,179,108,.62)}.executive-v5-platform strong{font-size:25px}.executive-v5-platform em{font-style:normal;color:var(--ev5-muted);font-size:12px}.executive-v5-platform i,.executive-v5-progress{display:block;height:6px;border-radius:999px;background:rgba(255,255,255,.09);overflow:hidden}.executive-v5-platform b,.executive-v5-progress i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#d8b36c,#78e2a0)}
      .executive-v5-section{padding:16px}.executive-v5-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.executive-v5-section-head h3{margin:4px 0 0;font-size:clamp(22px,2vw,34px);line-height:1}
      .executive-v5-owner-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.executive-v5-owner{padding:14px;display:grid;gap:12px;cursor:pointer}.executive-v5-owner.ok{border-color:rgba(120,226,160,.26)}.executive-v5-owner.warn{border-color:rgba(242,199,109,.32)}.executive-v5-owner.danger{border-color:rgba(255,127,115,.42);background:linear-gradient(145deg,rgba(126,36,30,.18),rgba(255,255,255,.012))}
      .executive-v5-owner-head{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start}.executive-v5-owner-head span{width:30px;height:30px;border:1px solid rgba(222,190,128,.22);border-radius:999px;display:grid;place-items:center;color:#d8bc82;font-size:12px;font-weight:900}.executive-v5-owner-head strong{font-size:20px;line-height:1.1}.executive-v5-owner-head b{font-size:26px}
      .executive-v5-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.executive-v5-metrics div{border:1px solid rgba(222,190,128,.11);border-radius:8px;background:rgba(0,0,0,.22);padding:9px}.executive-v5-metrics span{display:block;color:var(--ev5-muted);font-size:11px}.executive-v5-metrics strong{display:block;margin-top:4px;font-size:14px}.executive-v5-metrics .good{color:#8feab0}.executive-v5-metrics .bad{color:#ff9e95}
      .executive-v5-bottom{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.62fr);gap:12px}.executive-v5-decision-list{display:grid;gap:8px}.executive-v5-decision{border:1px solid rgba(222,190,128,.13);border-radius:8px;background:rgba(0,0,0,.22);padding:11px}.executive-v5-decision span{display:block;color:#d8bc82;font-size:11px;font-weight:850}.executive-v5-decision strong{display:block;margin-top:5px}.executive-v5-decision em{display:block;margin-top:5px;color:var(--ev5-muted);font-style:normal;font-size:12px}
      .executive-v5-risk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.executive-v5-risk-grid article{padding:12px}.executive-v5-risk-grid strong{display:block;margin-top:8px;font-size:24px}.executive-v5-risk-grid em{display:block;margin-top:4px;color:var(--ev5-muted);font-style:normal;font-size:12px}
      .executive-v5-empty{border:1px dashed rgba(222,190,128,.2);border-radius:8px;padding:18px;color:var(--ev5-muted);background:rgba(255,255,255,.02)}
      @keyframes executiveV5In{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @media(max-width:1320px){.executive-v5-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.executive-v5-owner-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.executive-v5-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.executive-v5-bottom{grid-template-columns:1fr}}
      @media(max-width:760px){.executive-v5-hero,.executive-v5-section-head{display:grid}.executive-v5-kpis,.executive-v5-platforms,.executive-v5-owner-grid,.executive-v5-filters,.executive-v5-platform-tabs,.executive-v5-risk-grid{grid-template-columns:1fr}.executive-v5-hero h2{font-size:34px}.executive-v5-badges{justify-content:flex-start}}
      @media(prefers-reduced-motion:reduce){.executive-v5-shell{animation:none}.executive-v5-shell *{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function schedule(force = false) {
    if (scheduled && !force) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      if (!isExecutiveActive()) return;
      injectStyles();
      renderNow();
    });
  }

  function installRenderApi() {
    renderApi = function executiveV5RouteRender() {
      injectStyles();
      renderNow();
    };
    renderApi.__alteaExecutiveV5Route = true;
    window.renderExecutiveV5Route = renderApi;
    try {
      Object.defineProperty(window, 'renderExecutive', {
        configurable: true,
        get() {
          return renderApi;
        },
        set(next) {
          if (next && next.__alteaExecutiveV5Route) renderApi = next;
        }
      });
    } catch {
      window.renderExecutive = renderApi;
    }
    try { renderExecutive = renderApi; } catch {}
  }

  window.__ALTEA_EXECUTIVE_V5_ROUTE_READY__ = VERSION;
  installRenderApi();

  ['hashchange', 'altea:viewchange', 'altea:portal-storage-updated', 'altea:data-ready', 'altea:marketplacechange'].forEach((eventName) => {
    window.addEventListener(eventName, () => schedule(false));
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => schedule(false), { once: true });
  } else {
    schedule(false);
  }
  [80, 420, 1400, 4200, 9000, 18000].forEach((delay) => window.setTimeout(() => schedule(true), delay));
})();
