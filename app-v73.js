(function () {
  state.v73 = Object.assign({
    logisticsPlatform: 'ozon',
    logisticsTarget: 14,
    logisticsPoint: '__all__',
    logisticsArticle: '',
    logisticsSearch: '',
    dashboardMode: 'margin',
    adminVisible: false
  }, state.v73 || {});

  const V73_PLATFORM_LABELS = {
    all: 'Все площадки',
    wb: 'WB',
    ozon: 'Ozon',
    yandex: 'Я.Маркет',
    yamarket: 'Я.Маркет',
    ym: 'Я.Маркет'
  };

  function v73AdminEnabled() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return Boolean(window.APP_CONFIG?.adminUi) || params.get('admin') === '1' || state.v73.adminVisible;
    } catch (error) {
      return Boolean(window.APP_CONFIG?.adminUi) || state.v73.adminVisible;
    }
  }

  function v73Html(value) {
    return escapeHtml(value == null ? '' : String(value));
  }

  function v73PatchChrome() {
    document.title = 'Altea Portal · v7.4 Ops';
    const topTitle = document.querySelector('.topbar h1');
    if (topTitle) topTitle.textContent = 'Портал бренда Алтея';
    const topDesc = document.querySelector('.topbar p');
    if (topDesc) topDesc.textContent = 'v7.4: починен sync-рендер, лидеры стали кликабельными, а логистика переведена в широкий рабочий формат.';

    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) brandSub.textContent = 'Imperial v7.4 · ops portal · sync fix · логистика · контроль';

    const navMap = {
      dashboard: 'Pulse + KPI + лидеры',
      documents: 'Регламенты + рабочие ссылки',
      repricer: 'Цена · риски · рекомендации',
      order: 'Кластера · склады · оборачиваемость',
      control: 'РОП · приоритеты · сотрудники',
      executive: 'Риски · эскалации · итог'
    };
    Object.entries(navMap).forEach(([view, text]) => {
      const el = document.querySelector(`.nav-btn[data-view="${view}"] small`);
      if (el) el.textContent = text;
    });

    document.querySelectorAll('.sidebar-foot').forEach((el) => el.classList.add('v73-sidebar-foot'));
    v73PatchSyncUi();
  }

  function v73PatchSyncUi() {
    const badgeEl = document.getElementById('syncStatusBadge');
    const pullBtn = document.getElementById('pullRemoteBtn');
    const pushBtn = document.getElementById('pushRemoteBtn');
    const exportBtn = document.getElementById('exportStorageBtn');
    const importBtn = document.querySelector('.file-input');
    const adminBtn = document.getElementById('toggleAdminBarBtn');
    const adminVisible = v73AdminEnabled();
    const adminAllowed = Boolean(window.APP_CONFIG?.adminUi) || (() => { try { return new URLSearchParams(window.location.search || '').get('admin') === '1'; } catch (error) { return false; } })();

    if (adminBtn) {
      adminBtn.classList.toggle('hidden', !adminAllowed);
      adminBtn.textContent = adminVisible ? 'Скрыть админ' : 'Админ';
    }
    if (exportBtn) exportBtn.classList.toggle('hidden', !adminVisible);
    if (importBtn) importBtn.classList.toggle('hidden', !adminVisible);

    const ready = state.team.mode === 'ready';
    const pending = state.team.mode === 'pending';
    const errored = state.team.mode === 'error';
    if (badgeEl) {
      badgeEl.classList.remove('sync-ready', 'sync-pending', 'sync-error', 'sync-local');
      badgeEl.classList.add(ready ? 'sync-ready' : pending ? 'sync-pending' : errored ? 'sync-error' : 'sync-local');
      if (ready) badgeEl.textContent = `Командная база online${state.team.lastSyncAt ? ` · ${fmt.date(state.team.lastSyncAt)}` : ''}`;
      if (pending) badgeEl.textContent = state.team.note || 'Синхронизация…';
      if (errored) badgeEl.textContent = `Ошибка синка${state.team.error ? ` · ${state.team.error}` : ''}`;
      if (state.team.mode === 'local') badgeEl.textContent = 'Локальный режим';
      badgeEl.title = state.team.note || badgeEl.textContent;
    }
    [pullBtn, pushBtn].forEach((btn) => {
      if (!btn) return;
      btn.disabled = !ready;
      btn.classList.toggle('disabled-btn', !ready);
      btn.title = ready ? '' : (state.team.mode === 'local' ? 'Сначала включи Supabase mode и дождись online-статуса.' : (state.team.note || 'Синк недоступен'));
    });
  }

  const v73BaseUpdateSyncBadge = updateSyncBadge;
  updateSyncBadge = function () {
    v73BaseUpdateSyncBadge();
    v73PatchSyncUi();
  };

  function v73SeriesPoints(series, field) {
    const values = (series || []).map((item) => numberOrZero(item?.[field]));
    const max = Math.max(1, ...values);
    const min = Math.min(...values);
    const range = Math.max(1, max - min);
    const width = 320;
    const height = 120;
    const points = (series || []).map((item, index) => {
      const x = (index / Math.max(1, series.length - 1)) * width;
      const y = height - ((numberOrZero(item?.[field]) - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return { points, width, height, max, min, last: values[values.length - 1] || 0 };
  }

  function v73TrendCard(platform) {
    const series = platform?.series || [];
    const trend = v73SeriesPoints(series, 'estimatedMargin');
    const revenueTrend = v73SeriesPoints(series, 'revenue');
    const last = series[series.length - 1] || {};
    const first = series[0] || {};
    const delta = numberOrZero(last.estimatedMargin) - numberOrZero(first.estimatedMargin);
    const tone = delta >= 0 ? 'up' : 'down';
    return `
      <div class="v73-trend-card ${tone}">
        <div class="v73-trend-head">
          <div>
            <strong>${v73Html(platform?.label || 'Площадка')}</strong>
            <div class="muted small">${v73Html(V73_PLATFORM_LABELS[platform?.key] || platform?.label || '')}</div>
          </div>
          <div class="badge-stack">
            ${badge(`D-1 ${fmt.money(last.estimatedMargin)}`, delta >= 0 ? 'ok' : 'warn')}
          </div>
        </div>
        <svg viewBox="0 0 ${trend.width} ${trend.height + 12}" class="v73-trend-svg" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="${trend.points}" class="v73-trend-line margin-line"></polyline>
          <polyline points="${revenueTrend.points}" class="v73-trend-line revenue-line"></polyline>
        </svg>
        <div class="v73-trend-meta">
          <span>${fmt.int(last.units)} шт.</span>
          <span>выручка ${fmt.money(last.revenue)}</span>
          <span>оцен. маржа ${fmt.money(last.estimatedMargin)}</span>
        </div>
      </div>
    `;
  }

  function v73DashboardKpis(model) {
    const cards = [
      { label: 'SKU в базе', value: fmt.int(model.totalSku), hint: 'Только Алтея' },
      { label: 'SKU в работе', value: fmt.int(model.toWorkCount), hint: 'План + маржа' },
      { label: 'Без owner', value: fmt.int(model.unassignedCount), hint: 'Нужно закрепить' },
      { label: 'Внешний трафик', value: fmt.int(model.trafficCount), hint: 'KZ / VK / внешний контур' },
      { label: 'Среднее выполнение', value: fmt.pct(model.avgCompletion), hint: 'По SKU с планом' },
      { label: 'Средняя маржа', value: fmt.pct(model.avgMargin), hint: 'Оценка по доступному срезу' },
      { label: 'Выручка за срез', value: fmt.money(model.revenueTotal), hint: 'Сумма факта / order value' },
      { label: 'Net revenue', value: fmt.money(model.netRevenueTotal), hint: 'Чистая выручка' }
    ];
    return cards.map((card) => `
      <div class="v73-kpi-card">
        <span>${v73Html(card.label)}</span>
        <strong>${v73Html(card.value)}</strong>
        <small>${v73Html(card.hint)}</small>
      </div>
    `).join('');
  }

  function v73RenderDashboard() {
    const root = document.getElementById('view-dashboard');
    if (!root) return;
    const model = buildVisualDashboardModel();
    const trendPlatforms = (state.platformTrends?.platforms || []).slice();
    const salesMax = Math.max(1, ...model.leadersSales.map((item) => numberOrZero(item.metricValue)));
    const turnoverMax = Math.max(1, ...model.turnoverCandidates.map((item) => numberOrZero(item.metricValue)));
    const romiMax = Math.max(1, ...model.romiLeaders.map((item) => numberOrZero(item.metricValue)));

    const salesRows = model.leadersSales.map((item, index) => renderLeaderRow(
      item,
      index,
      salesMax,
      (value) => fmt.money(value),
      `${badge(item.owner || 'Без owner', item.owner ? 'ok' : 'warn')}${marginBadge('Маржа', item.marginPct)}${badge(`${fmt.int(item.units)} шт.`)}${badge(item.traffic, item.traffic.includes('без') ? '' : 'info')}`
    )).join('');

    const turnoverRows = model.turnoverCandidates.map((item, index) => renderInverseLeaderRow(
      item,
      index,
      turnoverMax,
      (value) => `${fmt.num(value, 1)} дн.`,
      `${badge(`Цель ${fmt.num(item.target, 0)} дн.`, 'info')}${badge(`Остаток ${fmt.int(item.stock)} шт.`)}${badge(item.owner || 'Без owner', item.owner ? 'ok' : 'warn')}`
    )).join('');

    const romiRows = model.romiLeaders.map((item, index) => renderLeaderRow(
      item,
      index,
      romiMax,
      (value) => fmt.num(value, 1),
      `${badge(`${fmt.int(item.posts)} постов`)}${badge(`${fmt.int(item.clicks)} кликов`)}${badge(`${fmt.int(item.orders)} заказов`, 'info')}`
    )).join('');

    const pulseCards = trendPlatforms.length
      ? trendPlatforms.map(v73TrendCard).join('')
      : '<div class="empty">Pulse-данные пока не загружены.</div>';

    root.innerHTML = `
      <section class="v73-dashboard-shell">
        <div class="card v73-pulse-stage">
          <div class="section-subhead">
            <div>
              <h2>Имперский pulse бренда</h2>
              <p>Сверху — маржа по дням и площадкам. Ниже — KPI, лидеры продаж, оборачиваемости и контент-потенциала без лишней декоративной шапки.</p>
            </div>
            <div class="badge-stack">
              ${badge(`План/факт ${v73Html(model.freshness.planFactMonth || '—')}`)}
              ${badge(`Лидерборд ${(model.freshness.contentPeriods || []).join(' / ') || '—'}`, 'info')}
              ${badge(`Новинки ${v73Html(model.freshness.launchPlanHorizon || '—')}`)}
            </div>
          </div>
          <div class="v73-pulse-grid">${pulseCards}</div>
        </div>

        <div class="v73-kpi-grid">${v73DashboardKpis(model)}</div>

        <div class="dashboard-grid-3 v73-leaders-grid">
          <div class="card visual-card">
            <div class="section-subhead">
              <div>
                <h3>Лидеры продаж</h3>
                <p class="small muted">Что несёт выручку прямо сейчас.</p>
              </div>
              ${badge(`${fmt.int(model.leadersSales.length)} SKU`, 'ok')}
            </div>
            <div class="leader-list">${salesRows || '<div class="empty">Нет данных</div>'}</div>
          </div>

          <div class="card visual-card">
            <div class="section-subhead">
              <div>
                <h3>Лидеры по оборачиваемости</h3>
                <p class="small muted">Чем меньше дней, тем быстрее крутится SKU.</p>
              </div>
              ${badge('быстрее = лучше', 'info')}
            </div>
            <div class="leader-list">${turnoverRows || '<div class="empty">Нет данных</div>'}</div>
          </div>

          <div class="card visual-card">
            <div class="section-subhead">
              <div>
                <h3>Лидеры по контенту / ROMI</h3>
                <p class="small muted">Где есть сигнал на масштабирование контента.</p>
              </div>
              ${badge('контент-потенциал', 'info')}
            </div>
            <div class="leader-list">${romiRows || '<div class="empty">Нет данных</div>'}</div>
          </div>
        </div>
      </section>
    `;
  }

  function v73DocGroups() {
    const groups = state.documents?.groups || [];
    const byTitle = new Map(groups.map((group) => [group.title, group.items || []]));
    const strategy = byTitle.get('Стратегия и процессы') || [];
    const planning = byTitle.get('Планирование и аналитика') || [];
    const pricing = byTitle.get('Цена и репрайсер') || [];
    const supply = byTitle.get('Новинки и supply') || [];

    return [
      {
        title: 'Регламенты и ритм работы',
        tone: 'info',
        items: strategy.filter((item) => /IBP|Заметки|Карта процессов/i.test(item.title))
      },
      {
        title: 'Планы и аналитика',
        tone: 'ok',
        items: planning.filter((item) => !/Каталог/i.test(item.title))
      },
      {
        title: 'Цены и закрепления',
        tone: 'warn',
        items: pricing.filter((item) => !/Рабочие спецификации/i.test(item.title))
      },
      {
        title: 'Логистика и supply',
        tone: 'warn',
        items: supply.filter((item) => !/Планирование новинок/i.test(item.title))
      },
      {
        title: 'Новинки и запуск',
        tone: 'info',
        items: [
          ...(supply.filter((item) => /Планирование новинок/i.test(item.title))),
          ...(planning.filter((item) => /Лидерборд/i.test(item.title)))
        ]
      }
    ].filter((group) => group.items.length);
  }

  function v73FilteredDocGroups() {
    const groups = v73DocGroups();
    const search = String(state.docFilters.search || '').trim().toLowerCase();
    const selectedGroup = state.docFilters.group || 'all';
    return groups
      .filter((group) => selectedGroup === 'all' || group.title === selectedGroup)
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const hay = [item.title, item.description, item.type, item.filename].filter(Boolean).join(' ').toLowerCase();
          return !search || hay.includes(search);
        })
      }))
      .filter((group) => group.items.length);
  }

  function v73RenderDocuments() {
    const root = document.getElementById('view-documents');
    if (!root) return;
    const groups = v73DocGroups();
    const filtered = v73FilteredDocGroups();
    const totalDocs = groups.reduce((acc, group) => acc + group.items.length, 0);
    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Рабочая библиотека</h2>
          <p>Здесь только то, что нужно сотрудникам: регламенты, планы, репрайсер, логистика и запуск новинок. Техдок спрятан из основного контура.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(totalDocs)} рабочих файлов`, 'ok')}</div>
      </div>

      <div class="banner">
        <div>📎</div>
        <div><strong>Лучший следующий шаг:</strong> заменить локальные demo-файлы на Google Drive / SharePoint ссылки с доступом по ролям. Тогда портал останется порталом, а не папкой с техдоками.</div>
      </div>

      <div class="filters docs-filters">
        <input id="docSearchInput" placeholder="Поиск по рабочим документам…" value="${v73Html(state.docFilters.search)}">
        <select id="docGroupFilter">
          <option value="all">Все разделы</option>
          ${groups.map((group) => `<option value="${v73Html(group.title)}" ${state.docFilters.group === group.title ? 'selected' : ''}>${v73Html(group.title)}</option>`).join('')}
        </select>
      </div>

      <div class="doc-groups">
        ${filtered.map((group) => `
          <div class="card v73-doc-group">
            <div class="section-subhead">
              <div>
                <h3>${v73Html(group.title)}</h3>
                <p class="small muted">${group.title === 'Регламенты и ритм работы' ? 'Как работаем и какие выходы должны быть на встречах.' : group.title === 'Логистика и supply' ? 'Склады, остатки, returns и поставки.' : 'Рабочие файлы по направлению.'}</p>
              </div>
              ${badge(`${fmt.int(group.items.length)} шт.`, group.tone)}
            </div>
            <div class="doc-grid">
              ${group.items.map((item) => `
                <a class="doc-card" href="${v73Html(item.href)}" target="_blank" rel="noopener">
                  <div class="doc-top"><span class="doc-type">${v73Html(item.type)}</span><span class="muted small">${v73Html(String(item.sizeMb || '0'))} MB</span></div>
                  <strong>${v73Html(item.title)}</strong>
                  <p>${v73Html(item.description || 'Рабочий файл')}</p>
                  <span class="doc-action">Открыть →</span>
                </a>
              `).join('')}
            </div>
          </div>
        `).join('') || '<div class="empty">По текущим фильтрам документов ничего не найдено.</div>'}
      </div>
    `;

    root.querySelector('#docSearchInput')?.addEventListener('input', (event) => {
      state.docFilters.search = event.target.value;
      v73RenderDocuments();
    });
    root.querySelector('#docGroupFilter')?.addEventListener('change', (event) => {
      state.docFilters.group = event.target.value;
      v73RenderDocuments();
    });
  }

  function v73RiskNeed(row, target) {
    return numberOrZero(row?.[`targetNeed${target}`]);
  }

  function v73AllLogisticsRows() {
    const platformLabel = state.v73.logisticsPlatform === 'wb' ? 'WB' : 'Ozon';
    const rows = (state.logistics?.allRows || state.logistics?.riskRows || [])
      .filter((row) => row.platform === platformLabel)
      .filter((row) => state.v73.logisticsPoint === '__all__' ? true : row.place === state.v73.logisticsPoint);
    const search = String(state.v73.logisticsSearch || '').trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (!search) return true;
      const hay = [row.article, row.name, row.owner, row.place].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(search);
    });
    return filtered.sort((a, b) => v73RiskNeed(b, state.v73.logisticsTarget) - v73RiskNeed(a, state.v73.logisticsTarget)
      || numberOrZero(a.turnoverDays) - numberOrZero(b.turnoverDays)
      || numberOrZero(b.avgDaily) - numberOrZero(a.avgDaily)
      || String(a.article || '').localeCompare(String(b.article || ''), 'ru'));
  }

  function v73AggregatePoint(rows, label, key='__all__') {
    const totalAvg = rows.reduce((sum, row) => sum + numberOrZero(row.avgDaily), 0);
    const totalStock = rows.reduce((sum, row) => sum + numberOrZero(row.inStock), 0);
    const totalTransit = rows.reduce((sum, row) => sum + numberOrZero(row.inTransit) + numberOrZero(row.inRequest), 0);
    const totalNeed = rows.reduce((sum, row) => sum + v73RiskNeed(row, state.v73.logisticsTarget), 0);
    const unitWeight = rows.reduce((sum, row) => sum + Math.max(1, numberOrZero(row.sales28 || row.avgDaily)), 0);
    const localShare = state.v73.logisticsPlatform === 'ozon' && rows.length
      ? rows.reduce((sum, row) => sum + numberOrZero(row.localShare) * Math.max(1, numberOrZero(row.sales28 || row.avgDaily)), 0) / Math.max(1, unitWeight)
      : null;
    return {
      key,
      label,
      coverageDays: totalAvg > 0 ? totalStock / totalAvg : 0,
      avgDaily: totalAvg,
      stock: totalStock,
      inTransit: totalTransit,
      localShare,
      need: totalNeed,
      skuCount: rows.length,
      units: rows.reduce((sum, row) => sum + numberOrZero(row.sales28 || row.avgDaily * 28), 0),
      kind: key === '__all__' ? 'all' : 'point'
    };
  }

  function v73PointOptions() {
    const log = state.logistics || {};
    const options = state.v73.logisticsPlatform === 'wb'
      ? (log.wbWarehouses || []).map((row) => ({
          key: row.name,
          label: row.name,
          coverageDays: numberOrZero(row.coverageDays),
          avgDaily: numberOrZero(row.avgDailyUnits),
          stock: numberOrZero(row.stock),
          inTransit: 0,
          localShare: null,
          need: numberOrZero(row[`targetNeed${state.v73.logisticsTarget}`]),
          skuCount: numberOrZero(row.skuCount),
          units: numberOrZero(row.ordersUnits),
          kind: 'warehouse'
        }))
      : (log.ozonClusters || []).map((row) => ({
          key: row.name,
          label: row.name,
          coverageDays: numberOrZero(row.coverageDays),
          avgDaily: numberOrZero(row.avgDailyUnits28),
          stock: numberOrZero(row.available),
          inTransit: numberOrZero(row.inTransit) + numberOrZero(row.inRequest),
          localShare: row.localShare,
          need: numberOrZero(row[`targetNeed${state.v73.logisticsTarget}`]),
          skuCount: numberOrZero(row.skuCount),
          units: numberOrZero(row.units),
          kind: 'cluster'
        }));
    const baseRows = (state.logistics?.allRows || state.logistics?.riskRows || []).filter((row) => row.platform === (state.v73.logisticsPlatform === 'wb' ? 'WB' : 'Ozon'));
    const allOption = v73AggregatePoint(baseRows, state.v73.logisticsPlatform === 'wb' ? 'Все склады' : 'Все кластера', '__all__');
    return [allOption, ...options.sort((a, b) => b.need - a.need || a.coverageDays - b.coverageDays || a.label.localeCompare(b.label, 'ru'))];
  }

  function v73EnsureLogisticsSelection() {
    const options = v73PointOptions();
    if (!options.length) return { options: [], selectedPoint: null, rows: [], selectedRow: null, pointMap: new Map() };
    if (!options.some((item) => item.key === state.v73.logisticsPoint)) state.v73.logisticsPoint = '__all__';
    const rows = v73AllLogisticsRows();
    if (!rows.some((row) => row.article === state.v73.logisticsArticle)) state.v73.logisticsArticle = rows[0]?.article || '';
    const selectedRow = rows.find((row) => row.article === state.v73.logisticsArticle) || rows[0] || null;
    return { options, selectedPoint: options.find((item) => item.key === state.v73.logisticsPoint) || options[0], rows, selectedRow, pointMap: new Map(options.map((item) => [item.label, item])) };
  }

  function v73RootCauses(row, point) {
    const causes = [];
    const need = v73RiskNeed(row, state.v73.logisticsTarget);
    const inbound = numberOrZero(row?.inTransit) + numberOrZero(row?.inRequest);
    if (row && numberOrZero(row.inStock) <= 0 && inbound > 0) causes.push('остаток 0, товар уже в потоке');
    if (row && need > 0 && inbound === 0) causes.push('нужна новая заявка / пополнение');
    if (row && row.localShare != null && numberOrZero(row.localShare) < 0.6) causes.push('низкая локальность');
    if (point && point.coverageDays < state.v73.logisticsTarget) causes.push('точка не держит целевую оборачиваемость');
    const backlog = (state.logistics?.backlogByCluster || []).find((item) => item.cluster === point?.label || item.cluster === row?.place);
    if (backlog && numberOrZero(backlog.waitingShip) > 0) causes.push('часть объёма ждёт отгрузки');
    if (backlog && numberOrZero(backlog.waitingAssembly) > 0) causes.push('часть объёма ждёт сборки');
    return causes.slice(0, 4);
  }

  function v73MetricCell(label, value, hint = '') {
    return `
      <div class="v73-metric-cell">
        <span>${v73Html(label)}</span>
        <strong>${v73Html(value)}</strong>
        ${hint ? `<small>${v73Html(hint)}</small>` : ''}
      </div>
    `;
  }

  function v73RenderLogistics() {
    const root = document.getElementById('view-order');
    if (!root) return;
    const log = state.logistics || {};
    const { options, selectedPoint, rows, selectedRow, pointMap } = v73EnsureLogisticsSelection();
    const backlog = (log.backlogByCluster || []).find((item) => item.cluster === selectedPoint?.label);
    const summaryCards = log.summaryCards || [];
    const statusCards = log.statusCards || [];
    const central = log.centralWarehouse || {};
    const target = state.v73.logisticsTarget;

    const topSummary = [
      ...(summaryCards.slice(0, 4).map((item) => ({ label: item.label, value: item.valuePct != null ? fmt.pct(item.valuePct) : fmt.int(item.value), hint: item.hint || '' }))),
      { label: 'Центральный остаток', value: fmt.int(central.stock), hint: 'Балашиха' },
      { label: 'Отгружено WB', value: fmt.int(central.shippedWB), hint: 'центральный склад' },
      { label: 'Отгружено Ozon', value: fmt.int(central.shippedOzon), hint: 'центральный склад' }
    ].map((item) => `
      <div class="v73-kpi-card compact">
        <span>${v73Html(item.label)}</span>
        <strong>${v73Html(item.value)}</strong>
        <small>${v73Html(item.hint)}</small>
      </div>
    `).join('');

    const backlogCards = statusCards.map((item) => `
      <div class="mini-kpi ${item.key === 'waitingShip' || item.key === 'waitingAssembly' ? 'warn' : ''}">
        <span>${v73Html(item.label)}</span>
        <strong>${fmt.int(item.orders)}</strong>
        <span>${fmt.int(item.units)} шт.</span>
      </div>
    `).join('');

    const pointChips = options.slice(0, 30).map((point) => `
      <button class="quick-chip ${point.key === state.v73.logisticsPoint ? 'active' : ''}" type="button" data-v73-point="${v73Html(point.key)}">
        ${v73Html(point.label)}
      </button>
    `).join('');

    const pointSummary = selectedPoint ? `
      <div class="v73-point-summary">
        ${v73MetricCell(state.v73.logisticsPlatform === 'wb' ? 'Склад' : 'Кластер', selectedPoint.label)}
        ${v73MetricCell('SKU в точке', fmt.int(selectedPoint.skuCount))}
        ${v73MetricCell('Ср./день', fmt.num(selectedPoint.avgDaily, 1))}
        ${v73MetricCell('Дней покрытия', `${fmt.num(selectedPoint.coverageDays, 1)} дн.`)}
        ${v73MetricCell('Need по цели', fmt.int(selectedPoint.need), `${target} дн.`)}
        ${v73MetricCell('Локальность', selectedPoint.localShare == null ? '—' : fmt.pct(selectedPoint.localShare), state.v73.logisticsPlatform === 'ozon' ? 'по точке' : '—')}
      </div>
    ` : '';

    const tableRows = rows.length ? rows.map((row) => {
      const point = pointMap.get(row.place) || selectedPoint;
      const causes = v73RootCauses(row, point);
      const need = v73RiskNeed(row, target);
      const isActive = row.article === state.v73.logisticsArticle;
      return `
        <tr class="${isActive ? 'active' : ''}" data-v73-select-row="${v73Html(row.article)}">
          <td class="sticky-col">${linkToSku(row.article, row.article)}</td>
          <td><div class="table-title">${v73Html(row.name || 'Без названия')}</div></td>
          <td>${v73Html(row.place || '—')}</td>
          <td>${row.owner ? badge(row.owner, 'ok') : badge('Без owner', 'warn')}</td>
          <td>${fmt.num(row.avgDaily, 1)}</td>
          <td>${fmt.int(row.sales7 != null ? row.sales7 : Math.round(numberOrZero(row.avgDaily) * 7))}</td>
          <td>${fmt.int(row.sales14 != null ? row.sales14 : Math.round(numberOrZero(row.avgDaily) * 14))}</td>
          <td>${fmt.int(row.planMonth != null ? row.planMonth : Math.round(numberOrZero(row.avgDaily) * 30))}</td>
          <td>${fmt.int(row.inStock)}</td>
          <td>${fmt.int(row.inRequest)}</td>
          <td>${fmt.int(row.inTransit)}</td>
          <td>${fmt.num(row.turnoverDays, 1)} дн.</td>
          <td>${need > 0 ? `<span class="need-pill danger">${fmt.int(need)}</span>` : `<span class="need-pill ok">0</span>`}</td>
          <td>${row.localShare == null ? '—' : fmt.pct(row.localShare)}</td>
          <td>${fmt.money(row.sourceValue)}</td>
          <td class="causes-cell">${causes.length ? causes.map((cause) => `<span class="cause-chip">${v73Html(cause)}</span>`).join('') : '<span class="cause-chip ok">ok</span>'}</td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="16"><div class="empty" style="padding:18px 0">По выбранной точке строк не найдено.</div></td></tr>';

    let detailHtml = '<div class="empty">Выбери SKU в таблице выше.</div>';
    if (selectedRow) {
      const point = pointMap.get(selectedRow.place) || selectedPoint;
      const causes = v73RootCauses(selectedRow, point);
      const inbound = numberOrZero(selectedRow.inTransit) + numberOrZero(selectedRow.inRequest);
      detailHtml = `
        <div class="section-subhead">
          <div>
            <h3>${linkToSku(selectedRow.article, selectedRow.article)}</h3>
            <p class="small muted">${v73Html(selectedRow.name || 'Без названия')}</p>
          </div>
          <div class="badge-stack">
            ${selectedRow.owner ? badge(selectedRow.owner, 'ok') : badge('Без owner', 'warn')}
            ${badge(state.v73.logisticsPlatform === 'wb' ? 'WB' : 'Ozon', 'info')}
            ${badge(selectedRow.place || selectedPoint?.label || 'Точка', 'info')}
          </div>
        </div>

        <div class="v73-metric-grid">
          ${v73MetricCell('Продажи 7д', fmt.int(selectedRow.sales7 != null ? selectedRow.sales7 : Math.round(numberOrZero(selectedRow.avgDaily) * 7)), 'операционно')}
          ${v73MetricCell('Продажи 14д', fmt.int(selectedRow.sales14 != null ? selectedRow.sales14 : Math.round(numberOrZero(selectedRow.avgDaily) * 14)), 'операционно')}
          ${v73MetricCell('План/день', fmt.num(selectedRow.avgDaily, 1), 'расчётно')}
          ${v73MetricCell('План/мес', fmt.int(selectedRow.planMonth != null ? selectedRow.planMonth : Math.round(numberOrZero(selectedRow.avgDaily) * 30)), 'расчётно')}
          ${v73MetricCell('Запас', fmt.int(selectedRow.inStock), 'шт. в точке')}
          ${v73MetricCell('В потоке', fmt.int(inbound), 'request + transit')}
          ${v73MetricCell('Реком.', fmt.int(v73RiskNeed(selectedRow, target)), `цель ${target} дн.`)}
          ${v73MetricCell('Локальность', selectedRow.localShare == null ? '—' : fmt.pct(selectedRow.localShare), state.v73.logisticsPlatform === 'ozon' ? 'доля локальных заказов' : 'для WB не считаем')}
          ${v73MetricCell('Покрытие', `${fmt.num(selectedRow.turnoverDays, 1)} дн.`, 'по текущему остатку')}
          ${v73MetricCell('Выручка среза', fmt.money(selectedRow.sourceValue), 'операционный срез')}
        </div>

        <div class="card v73-detail-callout">
          <div class="section-subhead">
            <div>
              <h3>Почему проседает</h3>
              <p class="small muted">Root cause по выбранному SKU — локальность, отгрузка, запас или новая заявка.</p>
            </div>
            ${badge(`${fmt.int(causes.length)} сигнала`, causes.length ? 'warn' : 'ok')}
          </div>
          <div class="badge-stack">${causes.length ? causes.map((cause) => badge(cause, 'warn')).join('') : badge('Явных красных причин не найдено', 'ok')}</div>
          ${backlog ? `<div class="metric-list" style="margin-top:12px"><div class="metric-row"><span>Ждёт сборки</span><strong>${fmt.int(backlog.waitingAssembly)}</strong></div><div class="metric-row"><span>Ждёт отгрузки</span><strong>${fmt.int(backlog.waitingShip)}</strong></div><div class="metric-row"><span>Backlog всего</span><strong>${fmt.int(backlog.units)} шт.</strong></div></div>` : ''}
        </div>
      `;
    }

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Логистика по кластерам и складам</h2>
          <p>Теперь логистику можно смотреть общим пластом: сверху площадка и цель, ниже — точки и широкая таблица как в рабочем разборе.</p>
        </div>
        <div class="badge-stack">${badge(`цель ${target} дн.`, 'info')}${badge(state.v73.logisticsPlatform === 'wb' ? 'WB' : 'Ozon', 'ok')}${badge(`${fmt.int(rows.length)} строк`, 'info')}</div>
      </div>

      <div class="v73-kpi-grid logistics-top-grid">${topSummary}</div>
      <div class="kpi-strip logistics-backlog-strip">${backlogCards}</div>

      <div class="card v73-logistics-panel">
        <div class="section-subhead">
          <div>
            <h3>Рабочий разбор по точкам</h3>
            <p class="small muted">Площадка, цели оборачиваемости, точки и полная таблица по артикулам. По артикулу можно сразу открыть карточку.</p>
          </div>
          <div class="badge-stack">
            <button class="quick-chip ${state.v73.logisticsPlatform === 'ozon' ? 'active' : ''}" type="button" data-v73-platform="ozon">Ozon</button>
            <button class="quick-chip ${state.v73.logisticsPlatform === 'wb' ? 'active' : ''}" type="button" data-v73-platform="wb">WB</button>
            <button class="quick-chip ${target === 7 ? 'active' : ''}" type="button" data-v73-target="7">7 дней</button>
            <button class="quick-chip ${target === 14 ? 'active' : ''}" type="button" data-v73-target="14">14 дней</button>
            <button class="quick-chip ${target === 28 ? 'active' : ''}" type="button" data-v73-target="28">28 дней</button>
          </div>
        </div>

        <div class="filters v74-logistics-filters">
          <input id="v73LogisticsSearch" placeholder="Поиск по артикулу, названию, owner или точке…" value="${v73Html(state.v73.logisticsSearch)}">
          <div class="badge-stack">${badge('Слева — точки', 'info')}${badge('Ниже — общая таблица', 'ok')}</div>
        </div>

        <div class="v73-point-chips">${pointChips || '<div class="empty">Нет точек для выбранной площадки.</div>'}</div>
        ${pointSummary}

        <div class="v74-logistics-table-wrap">
          <table class="v74-logistics-table">
            <thead>
              <tr>
                <th class="sticky-col">Артикул</th>
                <th>Товар</th>
                <th>${state.v73.logisticsPlatform === 'wb' ? 'Склад' : 'Кластер'}</th>
                <th>Owner</th>
                <th>План/день</th>
                <th>Продажи 7д</th>
                <th>Продажи 14д</th>
                <th>План/мес</th>
                <th>Запас</th>
                <th>В заявке</th>
                <th>В пути</th>
                <th>Покрытие</th>
                <th>Реком.</th>
                <th>Локальность</th>
                <th>Выручка</th>
                <th>Почему</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>

        <div class="card v74-logistics-detail-pane">${detailHtml}</div>
      </div>
    `;

    root.querySelectorAll('[data-v73-platform]').forEach((btn) => btn.addEventListener('click', () => {
      state.v73.logisticsPlatform = btn.dataset.v73Platform || 'ozon';
      state.v73.logisticsPoint = '__all__';
      state.v73.logisticsArticle = '';
      v73RenderLogistics();
    }));
    root.querySelectorAll('[data-v73-target]').forEach((btn) => btn.addEventListener('click', () => {
      state.v73.logisticsTarget = Number(btn.dataset.v73Target) || 14;
      state.v73.logisticsPoint = '__all__';
      state.v73.logisticsArticle = '';
      v73RenderLogistics();
    }));
    root.querySelectorAll('[data-v73-point]').forEach((btn) => btn.addEventListener('click', () => {
      state.v73.logisticsPoint = btn.dataset.v73Point || '__all__';
      state.v73.logisticsArticle = '';
      v73RenderLogistics();
    }));
    root.querySelector('#v73LogisticsSearch')?.addEventListener('input', (event) => {
      state.v73.logisticsSearch = event.target.value;
      state.v73.logisticsArticle = '';
      v73RenderLogistics();
    });
    root.querySelectorAll('[data-v73-select-row]').forEach((rowEl) => rowEl.addEventListener('click', (event) => {
      if (event.target.closest('[data-open-sku]')) return;
      state.v73.logisticsArticle = rowEl.dataset.v73SelectRow || '';
      v73RenderLogistics();
    }));
  }

  async function v73EnsureData() {
    try {
      if (!state.platformTrends) state.platformTrends = await loadJson('data/platform_trends.json');
      if (!state.logistics) state.logistics = await loadJson('data/logistics.json');
    } catch (error) {
      console.warn('v7.4 data layer not ready', error);
    }
  }

  function v73Boot() {
    v73PatchChrome();
    v73EnsureData().then(() => {
      try { rerenderCurrentView(); } catch (error) { console.error(error); }
    });
  }

  const v73BaseRenderDashboard = renderDashboard;
  renderDashboard = function () {
    if (!state.platformTrends) {
      v73BaseRenderDashboard();
      return;
    }
    v73RenderDashboard();
  };

  const v73BaseRenderDocuments = renderDocuments;
  renderDocuments = function () {
    if (!state.documents) {
      v73BaseRenderDocuments();
      return;
    }
    v73RenderDocuments();
  };

  const v73BaseRenderOrder = renderOrderCalculator;
  renderOrderCalculator = function () {
    if (!state.logistics) {
      v73BaseRenderOrder();
      return;
    }
    v73RenderLogistics();
  };

  const v73BaseRerender = rerenderCurrentView;
  rerenderCurrentView = function () {
    v73PatchChrome();
    v73BaseRerender();
  };

  document.addEventListener('DOMContentLoaded', () => {
    const adminBtn = document.getElementById('toggleAdminBarBtn');
    if (adminBtn && !adminBtn.dataset.v73Bound) {
      adminBtn.dataset.v73Bound = '1';
      adminBtn.addEventListener('click', () => {
        state.v73.adminVisible = !v73AdminEnabled();
        v73PatchSyncUi();
      });
    }
    v73Boot();
  });

  v73Boot();
})();
