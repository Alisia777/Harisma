(function () {
  if (window.__ALTEA_PORTAL_UI_HOTFIX_20260417D__) return;
  window.__ALTEA_PORTAL_UI_HOTFIX_20260417D__ = true;

  const STYLE_ID = 'altea-portal-ui-hotfix-20260417d';

  function ensureImperialState() {
    if (typeof state !== 'object' || !state) return {};
    state.imperial = state.imperial || {};
    if (!state.imperial.targetDays) state.imperial.targetDays = 14;
    if (!state.imperial.riskPlatform) state.imperial.riskPlatform = 'all';
    if (!state.imperial.clusterFilter) state.imperial.clusterFilter = 'all';
    if (!state.imperial.warehouseFilter) state.imperial.warehouseFilter = 'all';
    return state.imperial;
  }

  function toNumber(value) {
    if (typeof numberOrZero === 'function') return numberOrZero(value);
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return 0;
    return Number(value);
  }

  function average(values) {
    const numbers = values.map(toNumber).filter((value) => Number.isFinite(value));
    if (!numbers.length) return 0;
    return numbers.reduce((acc, value) => acc + value, 0) / numbers.length;
  }

  function parseIsoDate(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatRuDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  function uniq(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .portal-ui-hotfix-dashboard {
        margin-top: 18px;
        padding: 18px;
      }
      .portal-ui-hotfix-dashboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .portal-ui-hotfix-card {
        border: 1px solid rgba(212, 164, 74, 0.14);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(23, 17, 12, 0.94), rgba(12, 10, 9, 0.96));
        padding: 14px;
      }
      .portal-ui-hotfix-card.is-danger {
        border-color: rgba(203, 88, 65, 0.45);
      }
      .portal-ui-hotfix-card.is-warn {
        border-color: rgba(212, 164, 74, 0.45);
      }
      .portal-ui-hotfix-card.is-ok {
        border-color: rgba(118, 180, 121, 0.4);
      }
      .portal-ui-hotfix-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }
      .portal-ui-hotfix-metric,
      .portal-ui-hotfix-filter select {
        border-radius: 14px;
      }
      .portal-ui-hotfix-metric {
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.045);
      }
      .portal-ui-hotfix-metric span,
      .portal-ui-hotfix-filter span {
        display: block;
        color: rgba(255, 244, 229, 0.62);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 6px;
      }
      .portal-ui-hotfix-metric strong {
        display: block;
        font-size: 24px;
        line-height: 1.1;
      }
      .portal-ui-hotfix-foot {
        margin-top: 10px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .portal-ui-hotfix-logistics {
        margin-top: 18px;
      }
      .portal-ui-hotfix-ops-grid {
        display: grid;
        grid-template-columns: 1.2fr 1.2fr 1fr;
        gap: 12px;
        margin-top: 14px;
      }
      .portal-ui-hotfix-stack {
        display: grid;
        gap: 14px;
        margin-top: 14px;
      }
      .portal-ui-hotfix-filters {
        display: grid;
        grid-template-columns: minmax(180px, 260px) minmax(180px, 320px) auto 1fr;
        gap: 12px;
        align-items: end;
        margin-top: 14px;
      }
      .portal-ui-hotfix-filter select {
        width: 100%;
        border: 1px solid rgba(212, 164, 74, 0.18);
        background: rgba(17, 14, 11, 0.96);
        color: #fff1dd;
        padding: 10px 12px;
      }
      .portal-ui-hotfix-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
      }
      .portal-ui-hotfix-table .table-wrap {
        margin-top: 12px;
      }
      .portal-ui-hotfix-caption {
        margin-top: 8px;
        color: rgba(255, 244, 229, 0.55);
        font-size: 12px;
      }
      @media (max-width: 1320px) {
        .portal-ui-hotfix-ops-grid {
          grid-template-columns: 1fr;
        }
        .portal-ui-hotfix-filters {
          grid-template-columns: 1fr 1fr;
        }
        .portal-ui-hotfix-actions {
          justify-content: flex-start;
        }
      }
      @media (max-width: 900px) {
        .portal-ui-hotfix-metrics {
          grid-template-columns: 1fr;
        }
        .portal-ui-hotfix-filters {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function platformSeries(key) {
    const platforms = Array.isArray(state.platformTrends?.platforms) ? state.platformTrends.platforms : [];
    return platforms.find((item) => item.key === key) || null;
  }

  function toneClass(pct) {
    if (pct >= 1) return 'is-ok';
    if (pct >= 0.85) return 'is-warn';
    return 'is-danger';
  }

  function buildDailyExecutionModel() {
    const summary = state.dashboard?.brandSummary?.[0] || {};
    const monthPlanUnits = toNumber(summary.apr_plan_units);
    const overallToDatePct = toNumber(summary.apr_plan_completion_to_date_pct);
    const asOfDate = parseIsoDate(state.dashboard?.dataFreshness?.asOfDate);
    const today = new Date();
    const monthRef = asOfDate || today;
    const monthDays = new Date(monthRef.getFullYear(), monthRef.getMonth() + 1, 0).getDate();
    const dailyPlanBase = monthPlanUnits > 0 && monthDays > 0 ? monthPlanUnits / monthDays : 0;

    const detailedPlatforms = ['wb', 'ozon', 'ya']
      .map((key) => platformSeries(key))
      .filter(Boolean);
    const totalRecentUnits = detailedPlatforms.reduce((acc, item) => acc + item.series.reduce((sum, point) => sum + toNumber(point?.units), 0), 0);

    const cards = [];
    const totalSeries = platformSeries('all');
    if (totalSeries?.series?.length && dailyPlanBase > 0) {
      const latest = totalSeries.series[totalSeries.series.length - 1];
      const pct = toNumber(latest?.units) / dailyPlanBase;
      cards.push({
        label: 'Все площадки',
        targetUnits: dailyPlanBase,
        factUnits: toNumber(latest?.units),
        trailingUnits: average(totalSeries.series.slice(-3).map((point) => point?.units)),
        share: 1,
        pct
      });
    }

    for (const item of detailedPlatforms) {
      const totalUnits = item.series.reduce((acc, point) => acc + toNumber(point?.units), 0);
      const share = totalRecentUnits > 0 ? totalUnits / totalRecentUnits : 0;
      const latest = item.series[item.series.length - 1];
      const targetUnits = dailyPlanBase * share;
      const pct = targetUnits > 0 ? toNumber(latest?.units) / targetUnits : 0;
      cards.push({
        label: item.label || item.key.toUpperCase(),
        targetUnits,
        factUnits: toNumber(latest?.units),
        trailingUnits: average(item.series.slice(-3).map((point) => point?.units)),
        share,
        pct
      });
    }

    return {
      cards,
      monthLabel: monthRef.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }),
      todayLabel: formatRuDate(today),
      asOfLabel: formatRuDate(asOfDate || today),
      overallToDatePct
    };
  }

  function renderDashboardExecution() {
    const model = buildDailyExecutionModel();
    if (!model.cards.length) return '';
    return `
      <section class="card portal-ui-hotfix-dashboard" data-portal-ui-hotfix-dashboard>
        <div class="section-subhead">
          <div>
            <h3>Выполнение площадок на текущий день</h3>
            <p class="small muted">Линейный план дня на ${escapeHtml(model.todayLabel)}. Последний доступный факт в данных портала: ${escapeHtml(model.asOfLabel)}.</p>
          </div>
          <div class="badge-stack">
            ${badge(`Месяц: ${model.monthLabel}`, 'info')}
            ${badge(`К дате: ${fmt.pct(model.overallToDatePct)}`, model.overallToDatePct >= 1 ? 'ok' : (model.overallToDatePct >= 0.85 ? 'warn' : 'danger'))}
          </div>
        </div>
        <div class="portal-ui-hotfix-dashboard-grid">
          ${model.cards.map((card) => `
            <div class="portal-ui-hotfix-card ${toneClass(card.pct)}">
              <div class="section-subhead">
                <div>
                  <h3>${escapeHtml(card.label)}</h3>
                  <p class="small muted">План на ${escapeHtml(model.todayLabel)} · факт последнего доступного дня ${escapeHtml(model.asOfLabel)}</p>
                </div>
                ${badge(fmt.pct(card.pct), card.pct >= 1 ? 'ok' : (card.pct >= 0.85 ? 'warn' : 'danger'))}
              </div>
              <div class="portal-ui-hotfix-metrics">
                <div class="portal-ui-hotfix-metric">
                  <span>План дня</span>
                  <strong>${escapeHtml(fmt.int(card.targetUnits))}</strong>
                </div>
                <div class="portal-ui-hotfix-metric">
                  <span>Факт D-1</span>
                  <strong>${escapeHtml(fmt.int(card.factUnits))}</strong>
                </div>
                <div class="portal-ui-hotfix-metric">
                  <span>Среднее 3 дня</span>
                  <strong>${escapeHtml(fmt.int(card.trailingUnits))}</strong>
                </div>
              </div>
              <div class="portal-ui-hotfix-foot muted small">
                <span>Доля в операционном миксе: ${escapeHtml(fmt.pct(card.share))}</span>
                <span>Темп к дневному плану: ${escapeHtml(fmt.pct(card.pct))}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function getNeedForTarget(row, targetDays) {
    return toNumber(row?.[`targetNeed${targetDays}`]);
  }

  function turnoverBadge(days) {
    if (days === null || days === undefined || Number.isNaN(Number(days))) return badge('Покрытие —');
    const value = Number(days);
    if (value < 7) return badge(`${fmt.num(value, 1)} дн.`, 'danger');
    if (value < 14) return badge(`${fmt.num(value, 1)} дн.`, 'warn');
    return badge(`${fmt.num(value, 1)} дн.`, 'ok');
  }

  function renderEmptyRows(colspan, text) {
    return `<tr><td colspan="${colspan}" class="text-center muted">${escapeHtml(text)}</td></tr>`;
  }

  function renderRows(rows, mode, targetDays) {
    if (!rows.length) {
      if (mode === 'status') return renderEmptyRows(3, 'Нет строк под текущий фильтр');
      if (mode === 'backlog') return renderEmptyRows(5, 'Нет backlog по текущему фильтру');
      if (mode === 'central') return renderEmptyRows(2, 'Нет данных центрального склада');
      if (mode === 'cluster' || mode === 'warehouse-ozon') return renderEmptyRows(9, 'Нет строк под текущий фильтр');
      if (mode === 'warehouse-wb') return renderEmptyRows(8, 'Нет строк под текущий фильтр');
      return renderEmptyRows(10, 'Нет строк под текущий фильтр');
    }

    if (mode === 'status') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.label || 'Статус')}</strong></td>
          <td>${fmt.int(row.orders)}</td>
          <td>${fmt.int(row.units)}</td>
        </tr>
      `).join('');
    }

    if (mode === 'backlog') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.cluster)}</strong></td>
          <td>${fmt.int(row.orders)}</td>
          <td>${fmt.int(row.units)}</td>
          <td>${badge(`сборка ${fmt.int(row.waitingAssembly)}`, toNumber(row.waitingAssembly) > 0 ? 'warn' : 'ok')}</td>
          <td>${badge(`отгрузка ${fmt.int(row.waitingShip)}`, toNumber(row.waitingShip) > 0 ? 'danger' : 'ok')}</td>
        </tr>
      `).join('');
    }

    if (mode === 'central') {
      return rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td><strong>${escapeHtml(row.value)}</strong></td>
        </tr>
      `).join('');
    }

    if (mode === 'cluster') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.name)}</strong></td>
          <td>${fmt.int(row.units)}</td>
          <td>${fmt.num(row.avgDailyUnits28, 1)}</td>
          <td>${fmt.int(row.available)}</td>
          <td>${fmt.int(row.inTransit)}</td>
          <td>${turnoverBadge(row.coverageDays)}</td>
          <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
          <td>${fmt.pct(row.localShare)}</td>
          <td>${fmt.int(row.skuCount)}</td>
        </tr>
      `).join('');
    }

    if (mode === 'warehouse-ozon') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.warehouse)}</strong><div class="muted small">${escapeHtml(row.cluster || '—')}</div></td>
          <td>${fmt.int(row.units)}</td>
          <td>${fmt.num(row.avgDailyUnits28, 1)}</td>
          <td>${fmt.int(row.available)}</td>
          <td>${fmt.int(row.inTransit)}</td>
          <td>${turnoverBadge(row.coverageDays)}</td>
          <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
          <td>${fmt.pct(row.localShare)}</td>
          <td>${fmt.int(row.skuCount)}</td>
        </tr>
      `).join('');
    }

    if (mode === 'warehouse-wb') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.name)}</strong></td>
          <td>${fmt.int(row.ordersUnits)}</td>
          <td>${fmt.num(row.avgDailyUnits, 1)}</td>
          <td>${fmt.int(row.stock)}</td>
          <td>${turnoverBadge(row.coverageDays)}</td>
          <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
          <td>${fmt.money(row.payout)}</td>
          <td>${fmt.int(row.skuCount)}</td>
        </tr>
      `).join('');
    }

    return rows.map((row) => `
      <tr>
        <td>${badge(row.platform, String(row.platform).toLowerCase() === 'ozon' ? 'info' : 'ok')}</td>
        <td><strong>${escapeHtml(row.place)}</strong></td>
        <td>${typeof linkToSku === 'function' ? linkToSku(row.article, row.article) : escapeHtml(row.article)}</td>
        <td>${escapeHtml(row.name || 'Без названия')}</td>
        <td>${escapeHtml(row.owner || 'Без owner')}</td>
        <td>${fmt.num(row.avgDaily, 1)}</td>
        <td>${fmt.int(row.inStock)}</td>
        <td>${fmt.int(row.inTransit)}</td>
        <td>${turnoverBadge(row.turnoverDays)}</td>
        <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
      </tr>
    `).join('');
  }

  function tableCard(title, subtitle, rows, mode, headers, targetDays, metaHtml = '', caption = '') {
    return `
      <div class="card portal-ui-hotfix-table">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p class="small muted">${escapeHtml(subtitle)}</p>
          </div>
          <div class="badge-stack">${metaHtml}</div>
        </div>
        <div class="table-wrap imperial-table-wrap">
          <table>
            <thead>
              <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
            </thead>
            <tbody>${renderRows(rows, mode, targetDays)}</tbody>
          </table>
        </div>
        ${caption ? `<div class="portal-ui-hotfix-caption">${escapeHtml(caption)}</div>` : ''}
      </div>
    `;
  }

  function warehouseOptions(data) {
    const ozon = (data.ozonWarehouses || []).map((row) => ({ value: String(row.warehouse || ''), label: `Ozon · ${row.warehouse}` }));
    const wb = (data.wbWarehouses || []).map((row) => ({ value: String(row.name || ''), label: `WB · ${row.name}` }));
    return uniq([...ozon, ...wb].map((item) => JSON.stringify(item))).map((value) => JSON.parse(value));
  }

  function buildLogisticsModel() {
    const data = state.logistics;
    const imperialState = ensureImperialState();
    const target = Number(imperialState.targetDays || 14);
    const riskPlatform = imperialState.riskPlatform || 'all';
    const clusterFilter = imperialState.clusterFilter || 'all';
    const warehouseFilter = imperialState.warehouseFilter || 'all';

    const selectedOzonWarehouse = (data.ozonWarehouses || []).find((row) => String(row.warehouse || '') === warehouseFilter) || null;
    const derivedCluster = selectedOzonWarehouse
      ? String(selectedOzonWarehouse.cluster || '')
      : (warehouseFilter !== 'all' ? '__none__' : 'all');
    const effectiveCluster = clusterFilter !== 'all' ? clusterFilter : derivedCluster;

    return {
      data,
      target,
      riskPlatform,
      clusterFilter,
      warehouseFilter,
      clusterOptions: uniq((data.ozonClusters || []).map((row) => String(row.name || ''))),
      warehouseOptions: warehouseOptions(data),
      clusterRows: (data.ozonClusters || [])
        .filter((row) => effectiveCluster === 'all' ? true : String(row.name || '') === effectiveCluster),
      ozonWarehouseRows: (data.ozonWarehouses || [])
        .filter((row) => effectiveCluster === 'all' ? true : String(row.cluster || '') === effectiveCluster)
        .filter((row) => warehouseFilter === 'all' ? true : String(row.warehouse || '') === warehouseFilter),
      wbWarehouseRows: (data.wbWarehouses || [])
        .filter((row) => warehouseFilter === 'all' ? true : String(row.name || '') === warehouseFilter),
      riskRows: (data.riskRows || [])
        .filter((row) => riskPlatform === 'all' ? true : String(row.platform || '').toLowerCase() === riskPlatform)
        .filter((row) => getNeedForTarget(row, target) > 0 || toNumber(row.turnoverDays) < target)
        .filter((row) => {
          if (warehouseFilter !== 'all') return String(row.place || '') === warehouseFilter;
          if (clusterFilter !== 'all') return String(row.platform || '').toLowerCase() === 'ozon' && String(row.place || '') === clusterFilter;
          if (derivedCluster !== 'all' && derivedCluster !== '__none__') {
            return String(row.platform || '').toLowerCase() === 'ozon' && String(row.place || '') === derivedCluster;
          }
          return true;
        })
        .sort((a, b) => getNeedForTarget(b, target) - getNeedForTarget(a, target) || toNumber(a.turnoverDays || 999) - toNumber(b.turnoverDays || 999))
        .slice(0, 160)
    };
  }

  function renderLogisticsSection() {
    if (!state.logistics) return '';
    const model = buildLogisticsModel();
    const data = model.data;
    const statusRows = (data.statusCards || []).slice(0, 12);
    const backlogRows = (data.backlogByCluster || []).slice(0, 16);
    const centralRows = [
      { label: 'Балашиха · остаток', value: `${fmt.int(data.centralWarehouse?.stock)} шт.` },
      { label: 'Отгружено Ozon', value: `${fmt.int(data.centralWarehouse?.shippedOzon)} шт.` },
      { label: 'Отгружено WB', value: `${fmt.int(data.centralWarehouse?.shippedWB)} шт.` },
      { label: 'SKU в центральном остатке', value: fmt.int(data.centralWarehouse?.skuCount) }
    ];

    return `
      <section class="imperial-section portal-ui-hotfix-logistics" data-portal-ui-hotfix-logistics>
        <div class="section-title">
          <div>
            <h2>Логистика, кластера и заказ</h2>
            <p>Широкий табличный слой для логистов: кластера, склады, backlog и фильтры в одном месте.</p>
          </div>
          <div class="badge-stack">
            ${(data.targetOptions || [7, 14, 28]).map((days) => `<button class="quick-chip imperial-target ${model.target === days ? 'active' : ''}" type="button" data-portal-ui-hotfix-target="${days}">${days} дн.</button>`).join('')}
          </div>
        </div>

        <div class="kpi-strip imperial-kpi-strip">
          ${(data.summaryCards || []).map((card) => `
            <div class="mini-kpi ${String(card.label).includes('Ожидает') || String(card.label).includes('<') ? 'warn' : ''}">
              <span>${escapeHtml(card.label)}</span>
              <strong>${card.valuePct != null ? fmt.pct(card.valuePct) : fmt.int(card.value)}</strong>
              <span>${escapeHtml(card.hint || '')}</span>
            </div>
          `).join('')}
        </div>

        <div class="portal-ui-hotfix-ops-grid">
          ${tableCard('Статус потока отгрузки', 'Сначала смотрим, где тормозит цепочка: сборка, отгрузка, доставка.', statusRows, 'status', ['Статус', 'Заказы', 'Шт.'], model.target, `${badge(`${data.window?.days || 28} дн.`, 'info')}`)}
          ${tableCard('Backlog по кластерам', 'Сразу видно, в каком кластере зависли сборка и отгрузка.', backlogRows, 'backlog', ['Кластер', 'Заказы', 'Шт.', 'Сборка', 'Отгрузка'], model.target, `${badge(`${fmt.int(backlogRows.length)} строк`, backlogRows.length ? 'warn' : 'ok')}`)}
          ${tableCard('Центральный склад', 'Короткий срез по Балашихе и отгрузкам в каналы.', centralRows, 'central', ['Показатель', 'Значение'], model.target, `${badge('центральный остаток', 'info')}`)}
        </div>

        <div class="card" style="margin-top:14px">
          <div class="section-subhead">
            <div>
              <h3>Фильтры по кластерам и складам</h3>
              <p class="small muted">Фильтр применяется ко всем широким таблицам ниже. Если выбран склад Ozon, автоматически сузим и кластерный слой.</p>
            </div>
            <div class="badge-stack">
              ${badge(`Платформа: ${model.riskPlatform === 'all' ? 'все' : model.riskPlatform.toUpperCase()}`, model.riskPlatform === 'all' ? 'info' : '')}
              ${badge(`Цель: ${model.target} дн.`, 'info')}
            </div>
          </div>
          <div class="portal-ui-hotfix-filters">
            <label class="portal-ui-hotfix-filter">
              <span>Кластер Ozon</span>
              <select id="portalUiHotfixClusterFilter">
                <option value="all">Все кластера</option>
                ${model.clusterOptions.map((item) => `<option value="${escapeHtml(item)}"${model.clusterFilter === item ? ' selected' : ''}>${escapeHtml(item)}</option>`).join('')}
              </select>
            </label>
            <label class="portal-ui-hotfix-filter">
              <span>Склад / точка</span>
              <select id="portalUiHotfixWarehouseFilter">
                <option value="all">Все склады</option>
                ${model.warehouseOptions.map((item) => `<option value="${escapeHtml(item.value)}"${model.warehouseFilter === item.value ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
              </select>
            </label>
            <button class="quick-chip" type="button" data-portal-ui-hotfix-reset>Сбросить фильтры</button>
            <div class="portal-ui-hotfix-actions">
              <button class="quick-chip ${model.riskPlatform === 'all' ? 'active' : ''}" type="button" data-portal-ui-hotfix-risk="all">Все</button>
              <button class="quick-chip ${model.riskPlatform === 'ozon' ? 'active' : ''}" type="button" data-portal-ui-hotfix-risk="ozon">Ozon</button>
              <button class="quick-chip ${model.riskPlatform === 'wb' ? 'active' : ''}" type="button" data-portal-ui-hotfix-risk="wb">WB</button>
            </div>
          </div>
        </div>

        <div class="portal-ui-hotfix-stack">
          ${tableCard('Кластера Ozon', 'Продажи, покрытие, локальность и потребность на выбранную цель в полном формате.', model.clusterRows.slice(0, 40), 'cluster', ['Кластер', 'Заказы, шт.', 'Ср./день', 'Остаток', 'В пути', 'Покрытие', 'Need', 'Локальность', 'SKU'], model.target, `${badge(`${fmt.int(model.clusterRows.length)} строк`, model.clusterRows.length ? 'ok' : 'warn')}${badge(`цель ${model.target} дн.`, 'info')}`, 'Если выбран конкретный склад Ozon, таблица автоматически показывает связанный кластер.')}
          ${tableCard('Склады Ozon', 'Где лежит остаток и где уже нужен подвоз по выбранному кластеру или складу.', model.ozonWarehouseRows.slice(0, 60), 'warehouse-ozon', ['Склад', 'Заказы, шт.', 'Ср./день', 'Остаток', 'В пути', 'Покрытие', 'Need', 'Локальность', 'SKU'], model.target, `${badge(`${fmt.int(model.ozonWarehouseRows.length)} строк`, model.ozonWarehouseRows.length ? 'ok' : 'warn')}${badge(`цель ${model.target} дн.`, 'info')}`)}
          ${tableCard('Склады WB', 'Полный слой для логистов: склад, скорость продаж, покрытие и потребность по WB.', model.wbWarehouseRows.slice(0, 60), 'warehouse-wb', ['Склад', 'Заказы, шт.', 'Ср./день', 'Остаток', 'Покрытие', 'Need', 'Payout', 'SKU'], model.target, `${badge(`${fmt.int(model.wbWarehouseRows.length)} строк`, model.wbWarehouseRows.length ? 'ok' : 'warn')}${badge(`цель ${model.target} дн.`, 'info')}`)}
          ${tableCard('Артикулы в риске по оборачиваемости', 'Фильтр по платформе, кластеру и складу сразу сужает short-list для пополнения.', model.riskRows, 'risk', ['Площадка', 'Точка', 'Артикул', 'Название', 'Owner', 'Ср./день', 'Остаток', 'В пути', 'Покрытие', 'Need'], model.target, `${badge(`${fmt.int(model.riskRows.length)} строк`, model.riskRows.length ? 'warn' : 'ok')}${badge(`цель ${model.target} дн.`, 'info')}`, 'Показываем только строки, где уже есть дефицит к цели или покрытие меньше выбранного горизонта.')}
        </div>
      </section>
    `;
  }

  function bindLogisticsControls(root) {
    const rerender = () => {
      if (typeof renderOrderCalculator === 'function') renderOrderCalculator();
      else if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    };

    root.querySelectorAll('[data-portal-ui-hotfix-target]').forEach((button) => {
      button.addEventListener('click', () => {
        ensureImperialState().targetDays = Number(button.dataset.portalUiHotfixTarget) || 14;
        rerender();
      });
    });

    root.querySelectorAll('[data-portal-ui-hotfix-risk]').forEach((button) => {
      button.addEventListener('click', () => {
        ensureImperialState().riskPlatform = button.dataset.portalUiHotfixRisk || 'all';
        rerender();
      });
    });

    root.querySelector('#portalUiHotfixClusterFilter')?.addEventListener('change', (event) => {
      ensureImperialState().clusterFilter = event.target.value || 'all';
      rerender();
    });

    root.querySelector('#portalUiHotfixWarehouseFilter')?.addEventListener('change', (event) => {
      ensureImperialState().warehouseFilter = event.target.value || 'all';
      rerender();
    });

    root.querySelector('[data-portal-ui-hotfix-reset]')?.addEventListener('click', () => {
      const imperialState = ensureImperialState();
      imperialState.clusterFilter = 'all';
      imperialState.warehouseFilter = 'all';
      imperialState.riskPlatform = 'all';
      rerender();
    });
  }

  function installDashboardEnhancer() {
    if (typeof renderDashboard !== 'function') return;
    const original = renderDashboard;
    renderDashboard = function patchedRenderDashboard() {
      original.apply(this, arguments);
      injectStyles();
      const root = document.getElementById('view-dashboard');
      if (!root) return;
      root.querySelector('[data-portal-ui-hotfix-dashboard]')?.remove();
      const hero = root.querySelector('.hero-panel');
      const html = renderDashboardExecution();
      if (!html) return;
      if (hero) hero.insertAdjacentHTML('afterend', html);
      else root.insertAdjacentHTML('afterbegin', html);
    };
  }

  function installLogisticsEnhancer() {
    if (typeof renderOrderCalculator !== 'function') return;
    const original = renderOrderCalculator;
    renderOrderCalculator = function patchedRenderOrderCalculator() {
      original.apply(this, arguments);
      injectStyles();
      const root = document.getElementById('view-order');
      if (!root || !state.logistics) return;
      const section = root.querySelector('section.imperial-section');
      if (!section) return;
      section.outerHTML = renderLogisticsSection();
      bindLogisticsControls(document.getElementById('view-order'));
      const manualTitle = root.querySelector('.order-layout .card h3');
      if (manualTitle) manualTitle.textContent = 'Ручной калькулятор SKU';
    };
  }

  function rerenderSoon() {
    const refresh = () => {
      try {
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      } catch (error) {
        console.error('[portal-ui-hotfix] rerender', error);
      }
    };
    window.setTimeout(refresh, 1200);
    window.setTimeout(refresh, 4200);
  }

  ensureImperialState();
  installDashboardEnhancer();
  installLogisticsEnhancer();
  rerenderSoon();
  if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
})();
