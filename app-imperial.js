
(function () {
  const OWNER_REMAP = { 'Кирилл': 'Олеся' };
  state.platformTrends = null;
  state.logistics = null;
  state.imperial = Object.assign({ targetDays: 14, riskPlatform: 'all' }, state.imperial || {});

  function imperialOwnerName(name) {
    const raw = String(name || '').trim();
    return OWNER_REMAP[raw] || raw;
  }

  function imperialEnsureOwnerState() {
    if (!Array.isArray(state.skus) || !state.skus.length) return false;

    for (const sku of state.skus) {
      sku.owner = sku.owner || {};
      const current = imperialOwnerName(sku.owner.name);
      if (current) sku.owner.name = current;
      if (sku.articleKey === 'retinol_boost_krem_dlya_vek_30ml' || sku.article === 'retinol_boost_krem_dlya_vek_30ml') {
        sku.owner.name = 'Олеся';
        sku.owner.source = 'manual override 2026-04';
        sku.flags = sku.flags || {};
        sku.flags.assigned = true;
      }
    }

    if (state.storage) {
      if (Array.isArray(state.storage.tasks)) {
        state.storage.tasks = state.storage.tasks.map((task) => ({
          ...task,
          owner: imperialOwnerName(task.owner)
        }));
      }
      if (Array.isArray(state.storage.decisions)) {
        state.storage.decisions = state.storage.decisions.map((item) => ({
          ...item,
          owner: imperialOwnerName(item.owner)
        }));
      }
      if (Array.isArray(state.storage.ownerOverrides)) {
        state.storage.ownerOverrides = state.storage.ownerOverrides.map((item) => ({
          ...item,
          ownerName: imperialOwnerName(item.ownerName)
        }));
        const retinolIdx = state.storage.ownerOverrides.findIndex((item) => item.articleKey === 'retinol_boost_krem_dlya_vek_30ml');
        const retinolOverride = {
          articleKey: 'retinol_boost_krem_dlya_vek_30ml',
          ownerName: 'Олеся',
          ownerRole: 'Owner SKU',
          note: 'manual override 2026-04',
          updatedAt: new Date().toISOString(),
          assignedBy: 'Portal migration'
        };
        if (retinolIdx >= 0) state.storage.ownerOverrides[retinolIdx] = retinolOverride;
        else state.storage.ownerOverrides.unshift(retinolOverride);
      }
      applyOwnerOverridesToSkus();
      saveLocalStorage();
    }
    return true;
  }

  const baseOwnerOptions = ownerOptions;
  ownerOptions = function () {
    const set = new Set(baseOwnerOptions());
    set.delete('Кирилл');
    set.add('Артем');
    set.add('Олеся');
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'));
  };

  const baseNormalizeTask = normalizeTask;
  normalizeTask = function (task, sourceHint = 'manual') {
    const normalized = baseNormalizeTask(task, sourceHint);
    normalized.owner = imperialOwnerName(normalized.owner);
    return normalized;
  };

  const baseNormalizeOwnerOverride = normalizeOwnerOverride;
  normalizeOwnerOverride = function (item = {}) {
    const normalized = baseNormalizeOwnerOverride(item);
    normalized.ownerName = imperialOwnerName(normalized.ownerName);
    return normalized;
  };

  function platformTrend(key) {
    return (state.platformTrends?.platforms || []).find((item) => item.key === key) || null;
  }

  function svgLinePath(values, width, height, padding) {
    const clean = values.map((v) => Number(v) || 0);
    const max = Math.max(...clean, 1);
    const min = Math.min(...clean, 0);
    const range = max - min || 1;
    return clean.map((value, index) => {
      const x = padding + (index * ((width - padding * 2) / Math.max(clean.length - 1, 1)));
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  function renderSparkline(series, metricKey, lineClass) {
    const width = 360;
    const height = 130;
    const padding = 16;
    const values = (series || []).map((point) => Number(point?.[metricKey]) || 0);
    const path = svgLinePath(values, width, height, padding);
    const max = Math.max(...values, 1);
    const ticks = [0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: (height - padding - ratio * (height - padding * 2)).toFixed(1),
      label: metricKey === 'estimatedMargin' || metricKey === 'revenue'
        ? fmt.money(max * ratio)
        : fmt.int(max * ratio)
    }));
    const labels = (series || []).map((point, index) => {
      const x = padding + (index * ((width - padding * 2) / Math.max((series || []).length - 1, 1)));
      return `<text x="${x.toFixed(1)}" y="${height - 2}" text-anchor="middle">${escapeHtml(point.label || '')}</text>`;
    }).join('');
    const dots = (series || []).map((point, index) => {
      const x = padding + (index * ((width - padding * 2) / Math.max((series || []).length - 1, 1)));
      const min = Math.min(...values, 0);
      const range = (Math.max(...values, 1) - min) || 1;
      const y = height - padding - (((Number(point?.[metricKey]) || 0) - min) / range) * (height - padding * 2);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" class="${lineClass}-dot"></circle>`;
    }).join('');
    return `
      <svg viewBox="0 0 ${width} ${height}" class="imperial-chart-svg" role="img" aria-label="Тренд ${escapeHtml(metricKey)}">
        ${ticks.map((tick) => `<line x1="${padding}" x2="${width - padding}" y1="${tick.y}" y2="${tick.y}" class="imperial-grid-line"></line>`).join('')}
        ${ticks.map((tick) => `<text x="${padding}" y="${Number(tick.y) - 4}" class="imperial-grid-label">${escapeHtml(tick.label)}</text>`).join('')}
        <path d="${path}" class="imperial-line ${lineClass}"></path>
        ${dots}
        ${labels}
      </svg>
    `;
  }

  function renderPlatformMiniCard(item) {
    const series = item?.series || [];
    if (!series.length) return '';
    const latest = series[series.length - 1];
    const totalMargin = series.reduce((acc, point) => acc + (Number(point.estimatedMargin) || 0), 0);
    const totalUnits = series.reduce((acc, point) => acc + (Number(point.units) || 0), 0);
    const lineClass = `imperial-${item.key}`;
    return `
      <div class="imperial-mini-card">
        <div class="imperial-mini-head">
          <div>
            <h4>${escapeHtml(item.label)}</h4>
            <div class="muted small">10 последних дневных точек</div>
          </div>
          <div class="badge-stack">
            ${badge(`D-1 ${fmt.money(latest.estimatedMargin)}`, Number(latest.estimatedMargin) < 0 ? 'danger' : 'ok')}
          </div>
        </div>
        ${renderSparkline(series, 'estimatedMargin', lineClass)}
        <div class="imperial-mini-meta">
          <span>${fmt.int(totalUnits)} шт.</span>
          <span>${fmt.money(totalMargin)} оцен. маржа</span>
        </div>
      </div>
    `;
  }

  function renderImperialDashboardPulse() {
    if (!state.platformTrends?.platforms?.length) {
      return `
        <section class="card imperial-section">
          <div class="section-subhead">
            <div>
              <h3>Пульс маржи по площадкам</h3>
              <p class="small muted">Ждём оперативный слой по платформам.</p>
            </div>
          </div>
          <div class="empty">Файл platform_trends.json ещё не загружен.</div>
        </section>
      `;
    }
    const miniCards = state.platformTrends.platforms
      .filter((item) => item.key !== 'all')
      .map(renderPlatformMiniCard)
      .join('');
    const total = platformTrend('all');
    const wb = platformTrend('wb');
    const ozon = platformTrend('ozon');
    const ya = platformTrend('ya');
    const pulseCards = [
      { label: 'Все площадки · D-1', value: fmt.money(total?.series?.at(-1)?.estimatedMargin), hint: 'Операционный pulse по оценочной марже' },
      { label: 'WB · D-1', value: fmt.money(wb?.series?.at(-1)?.estimatedMargin), hint: 'Оценочная маржа WB' },
      { label: 'Ozon · D-1', value: fmt.money(ozon?.series?.at(-1)?.estimatedMargin), hint: 'Оценочная маржа Ozon' },
      { label: 'Я.Маркет · D-1', value: fmt.money(ya?.series?.at(-1)?.estimatedMargin), hint: 'Fallback pulse по Я.Маркету' }
    ].map((card) => `
      <div class="hero-kpi imperial-pulse-kpi">
        <span>${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(card.value)}</strong>
        <small>${escapeHtml(card.hint)}</small>
      </div>
    `).join('');
    return `
      <section class="imperial-section">
        <div class="section-title">
          <div>
            <h2>Имперский pulse по марже и площадкам</h2>
            <p>Вынесли отдельным красивым слоем операционный график по дням: WB, Ozon, Я.Маркет и общий свод.</p>
          </div>
          <div class="badge-stack">
            ${badge('оценочная маржа', 'info')}
            ${badge('10 последних точек', 'ok')}
          </div>
        </div>
        <div class="hero-grid imperial-pulse-grid">${pulseCards}</div>
        <div class="imperial-mini-grid">${miniCards}</div>
        <div class="imperial-note">${escapeHtml(state.platformTrends.note || '')}</div>
      </section>
    `;
  }

  function logisticTargetNeed(row, target) {
    const key = `targetNeed${target}`;
    return Number(row?.[key]) || 0;
  }

  function turnoverBadge(days) {
    if (days == null || Number.isNaN(Number(days))) return badge('Покрытие —');
    const value = Number(days);
    if (value < 7) return badge(`${fmt.num(value, 1)} дн.`, 'danger');
    if (value < 14) return badge(`${fmt.num(value, 1)} дн.`, 'warn');
    return badge(`${fmt.num(value, 1)} дн.`, 'ok');
  }

  function renderImperialTableRows(rows, mode, targetDays) {
    if (!rows.length) return '<tr><td colspan="10" class="text-center muted">Нет строк под текущий фильтр</td></tr>';
    if (mode === 'cluster') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.name)}</strong></td>
          <td>${fmt.int(row.units)}</td>
          <td>${fmt.num(row.avgDailyUnits28, 1)}</td>
          <td>${fmt.int(row.available)}</td>
          <td>${fmt.int(row.inTransit)}</td>
          <td>${turnoverBadge(row.coverageDays)}</td>
          <td>${badge(`need ${fmt.int(logisticTargetNeed(row, targetDays))}`, logisticTargetNeed(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
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
          <td>${badge(`need ${fmt.int(logisticTargetNeed(row, targetDays))}`, logisticTargetNeed(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
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
          <td>${badge(`need ${fmt.int(logisticTargetNeed(row, targetDays))}`, logisticTargetNeed(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
          <td>${fmt.money(row.payout)}</td>
          <td>${fmt.int(row.skuCount)}</td>
        </tr>
      `).join('');
    }
    return rows.map((row) => `
      <tr>
        <td>${badge(row.platform, row.platform === 'Ozon' ? 'info' : 'ok')}</td>
        <td><strong>${escapeHtml(row.place)}</strong></td>
        <td>${linkToSku(row.article, row.article)}</td>
        <td>${escapeHtml(row.name || 'Без названия')}</td>
        <td>${escapeHtml(row.owner || 'Без owner')}</td>
        <td>${fmt.num(row.avgDaily, 1)}</td>
        <td>${fmt.int(row.inStock)}</td>
        <td>${fmt.int(row.inTransit)}</td>
        <td>${turnoverBadge(row.turnoverDays)}</td>
        <td>${badge(`need ${fmt.int(logisticTargetNeed(row, targetDays))}`, logisticTargetNeed(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
      </tr>
    `).join('');
  }

  function renderImperialLogistics() {
    if (!state.logistics) {
      return `
        <section class="card imperial-section">
          <div class="section-subhead">
            <div>
              <h3>Логистика и заказ</h3>
              <p class="small muted">Подгружаем кластера, склады и алерты по оборачиваемости…</p>
            </div>
          </div>
          <div class="empty">Нет data/logistics.json</div>
        </section>
      `;
    }
    const data = state.logistics;
    const target = Number(state.imperial?.targetDays || 14);
    const riskPlatform = state.imperial?.riskPlatform || 'all';
    const riskRows = (data.riskRows || [])
      .filter((row) => riskPlatform === 'all' ? true : (row.platform || '').toLowerCase() === riskPlatform)
      .filter((row) => logisticTargetNeed(row, target) > 0 || Number(row.turnoverDays || 0) < target)
      .sort((a, b) => logisticTargetNeed(b, target) - logisticTargetNeed(a, target) || Number(a.turnoverDays || 999) - Number(b.turnoverDays || 999))
      .slice(0, 140);

    const cardHtml = (data.summaryCards || []).map((card) => `
      <div class="mini-kpi ${String(card.label).includes('Ожидает') || String(card.label).includes('<') ? 'warn' : ''}">
        <span>${escapeHtml(card.label)}</span>
        <strong>${card.valuePct != null ? fmt.pct(card.valuePct) : fmt.int(card.value)}</strong>
        <span>${escapeHtml(card.hint || '')}</span>
      </div>
    `).join('');

    const statusHtml = (data.statusCards || []).map((row) => `
      <div class="check-item">
        <strong>${fmt.int(row.orders)}</strong>
        <span>${escapeHtml(row.label)} · ${fmt.int(row.units)} шт.</span>
      </div>
    `).join('');

    const backlogHtml = (data.backlogByCluster || []).map((row) => `
      <div class="alert-row">
        <div>
          <strong>${escapeHtml(row.cluster)}</strong>
          <div class="muted small">backlog orders ${fmt.int(row.orders)}</div>
        </div>
        <div class="badge-stack">
          ${badge(`сборка ${fmt.int(row.waitingAssembly)}`, row.waitingAssembly ? 'warn' : 'ok')}
          ${badge(`отгрузка ${fmt.int(row.waitingShip)}`, row.waitingShip ? 'danger' : 'ok')}
        </div>
      </div>
    `).join('');

    return `
      <section class="imperial-section">
        <div class="section-title">
          <div>
            <h2>Логистика, кластера и заказ</h2>
            <p>Вынесли отдельным слоем то, о чём говорил Виктор: локальность / нелокальность, статус отгрузки, статус склада, кластера, склады, артикулы и алерты по оборачиваемости.</p>
          </div>
          <div class="badge-stack">
            ${data.targetOptions.map((days) => `<button class="quick-chip imperial-target ${target === days ? 'active' : ''}" type="button" data-imperial-target="${days}">${days} дн.</button>`).join('')}
          </div>
        </div>

        <div class="kpi-strip imperial-kpi-strip">${cardHtml}</div>

        <div class="two-col">
          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>Статус потока отгрузки</h3>
                <p class="small muted">Сначала смотрим не заказ как таковой, а где застряла цепочка: собрали / отгрузили / не отгрузили.</p>
              </div>
              ${badge(`${data.window?.days || 28} дн.`, 'info')}
            </div>
            <div class="check-list">${statusHtml}</div>
            <div class="note-box">Локальность Ozon за окно: <strong>${fmt.pct((data.summaryCards || [])[0]?.valuePct)}</strong>. Если она проседает — видим это до спора «почему упали заказы».</div>
          </div>
          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>Где застряли backlog-кластера</h3>
                <p class="small muted">Кластера, в которых лежит сборка / отгрузка прямо сейчас.</p>
              </div>
              ${badge('операционный чек', 'warn')}
            </div>
            <div class="alert-stack">${backlogHtml || '<div class="empty">Нет backlog по кластерам</div>'}</div>
            <div class="metric-list" style="margin-top:12px">
              <div class="metric-row"><span>Балашиха · остаток</span><strong>${fmt.int(data.centralWarehouse?.stock)} шт.</strong></div>
              <div class="metric-row"><span>Отгружено Ozon</span><strong>${fmt.int(data.centralWarehouse?.shippedOzon)} шт.</strong></div>
              <div class="metric-row"><span>Отгружено WB</span><strong>${fmt.int(data.centralWarehouse?.shippedWB)} шт.</strong></div>
              <div class="metric-row"><span>SKU в центральном остатке</span><strong>${fmt.int(data.centralWarehouse?.skuCount)}</strong></div>
            </div>
          </div>
        </div>

        <div class="dashboard-grid-3 imperial-log-grid">
          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>Кластера Ozon</h3>
                <p class="small muted">Продажи, покрытие, локальность и потребность на выбранную цель.</p>
              </div>
              ${badge(`цель ${target} дн.`, 'info')}
            </div>
            <div class="table-wrap imperial-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Кластер</th><th>Заказы, шт.</th><th>Ср./день</th><th>Остаток</th><th>В пути</th><th>Покрытие</th><th>Need</th><th>Локальность</th><th>SKU</th>
                  </tr>
                </thead>
                <tbody>${renderImperialTableRows((data.ozonClusters || []).slice(0, 24), 'cluster', target)}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>Склады Ozon</h3>
                <p class="small muted">Где лежит остаток и где уже нужен подвоз по кластерам.</p>
              </div>
              ${badge(`цель ${target} дн.`, 'info')}
            </div>
            <div class="table-wrap imperial-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Склад</th><th>Заказы, шт.</th><th>Ср./день</th><th>Остаток</th><th>В пути</th><th>Покрытие</th><th>Need</th><th>Локальность</th><th>SKU</th>
                  </tr>
                </thead>
                <tbody>${renderImperialTableRows((data.ozonWarehouses || []).slice(0, 24), 'warehouse-ozon', target)}</tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>Склады WB</h3>
                <p class="small muted">Слой для логистов: склад → продажи → покрытие → потребность.</p>
              </div>
              ${badge(`цель ${target} дн.`, 'info')}
            </div>
            <div class="table-wrap imperial-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Склад</th><th>Заказы, шт.</th><th>Ср./день</th><th>Остаток</th><th>Покрытие</th><th>Need</th><th>Payout</th><th>SKU</th>
                  </tr>
                </thead>
                <tbody>${renderImperialTableRows((data.wbWarehouses || []).slice(0, 24), 'warehouse-wb', target)}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card imperial-risk-card">
          <div class="section-subhead">
            <div>
              <h3>Артикулы в риске по оборачиваемости</h3>
              <p class="small muted">Широким пластом: кластера / остатки / owner / need под выбранную цель.</p>
            </div>
            <div class="badge-stack">
              <button class="quick-chip ${riskPlatform === 'all' ? 'active' : ''}" type="button" data-risk-platform="all">Все</button>
              <button class="quick-chip ${riskPlatform === 'ozon' ? 'active' : ''}" type="button" data-risk-platform="ozon">Ozon</button>
              <button class="quick-chip ${riskPlatform === 'wb' ? 'active' : ''}" type="button" data-risk-platform="wb">WB</button>
            </div>
          </div>
          <div class="table-wrap imperial-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Площадка</th><th>Точка</th><th>Артикул</th><th>Название</th><th>Owner</th><th>Ср./день</th><th>Остаток</th><th>В пути</th><th>Покрытие</th><th>Need</th>
                </tr>
              </thead>
              <tbody>${renderImperialTableRows(riskRows, 'risk', target)}</tbody>
            </table>
          </div>
          <div class="imperial-note">Кнопки 7 / 14 / 28 дней меняют целевую оборачиваемость и сразу показывают, где именно нужно пополнение, а где проблема в локальности или неотгруженном потоке.</div>
        </div>
      </section>
    `;
  }

  const baseRenderDashboard = renderDashboard;
  renderDashboard = function () {
    baseRenderDashboard();
    const root = document.getElementById('view-dashboard');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', renderImperialDashboardPulse());
  };

  const baseRenderOrderCalculator = renderOrderCalculator;
  renderOrderCalculator = function () {
    baseRenderOrderCalculator();
    const root = document.getElementById('view-order');
    if (!root) return;
    root.insertAdjacentHTML('afterbegin', renderImperialLogistics());

    root.querySelectorAll('[data-imperial-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.imperial.targetDays = Number(btn.dataset.imperialTarget) || 14;
        renderOrderCalculator();
      });
    });
    root.querySelectorAll('[data-risk-platform]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.imperial.riskPlatform = btn.dataset.riskPlatform || 'all';
        renderOrderCalculator();
      });
    });

    const manualTitle = root.querySelector('.order-layout .card h3');
    if (manualTitle) manualTitle.textContent = 'Ручной калькулятор SKU';
  };

  function patchLabels() {
    const orderBtn = document.querySelector('.nav-btn[data-view="order"]');
    if (orderBtn) {
      const span = orderBtn.querySelector('span');
      const small = orderBtn.querySelector('small');
      if (span) span.textContent = 'Логистика и заказ';
      if (small) small.textContent = 'Кластера · склады · отгрузка';
    }
    const dashBtn = document.querySelector('.nav-btn[data-view="dashboard"] small');
    if (dashBtn) dashBtn.textContent = 'Имперский pulse + лидеры';
    const topDesc = document.querySelector('.topbar p');
    if (topDesc) topDesc.textContent = 'Версия Imperial v7: красивый дашборд, platform pulse, логистический слой по кластерам и складам, командный контур задач и закрепление owner по SKU.';
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) brandSub.textContent = 'Imperial v7 · только Алтея · pulse + логистика + команда';
  }

  async function loadImperialData() {
    try {
      const [platformTrends, logistics] = await Promise.all([
        loadJson('data/platform_trends.json'),
        loadJson('data/logistics.json')
      ]);
      state.platformTrends = platformTrends;
      state.logistics = logistics;
      rerenderCurrentView();
    } catch (error) {
      console.warn('Imperial layer data not loaded', error);
    }
  }

  function bootImperial() {
    if (!imperialEnsureOwnerState()) {
      setTimeout(bootImperial, 160);
      return;
    }
    patchLabels();
    loadImperialData();
    rerenderCurrentView();
  }

  bootImperial();
})();
