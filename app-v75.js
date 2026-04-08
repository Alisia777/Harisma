(function () {
  state.v75 = Object.assign({
    productStage: 'all',
    productMonth: 'all'
  }, state.v75 || {});

  const V75_STAGE_META = {
    planning: { label: 'План', kind: 'info' },
    development: { label: 'Разработка', kind: 'warn' },
    production: { label: 'Производство', kind: 'warn' },
    launch_ready: { label: 'Готово к запуску', kind: 'ok' },
    calculator: { label: 'Нет калькулятора', kind: 'danger' },
    backlog: { label: 'Бэклог', kind: '' }
  };

  function v75PatchChrome() {
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) brandSub.textContent = 'Imperial v7.5 · ops portal · product director · логистика · контроль';
    const topDesc = document.querySelector('.topbar p');
    if (topDesc) topDesc.textContent = 'v7.5: добавлен продуктовый блок Ксении — задачи, статусы, планы запусков и затраты по продукту.';
    const launchNavSmall = document.querySelector('.nav-btn[data-view="launches"] small');
    if (launchNavSmall) launchNavSmall.textContent = 'Директор по товару · матрица · планы';
    const launchNavText = document.querySelector('.nav-btn[data-view="launches"] span');
    if (launchNavText) launchNavText.textContent = 'Продукт / Ксения';
  }

  const v75BaseOwnerOptions = ownerOptions;
  ownerOptions = function () {
    const owners = new Set(v75BaseOwnerOptions());
    owners.add('Ксения');
    return [...owners].sort((a, b) => a.localeCompare(b, 'ru'));
  };

  function v75Num(value) {
    return numberOrZero(value);
  }

  function v75MonthKey(label) {
    const raw = String(label || '').trim();
    const parts = raw.split(' ');
    const map = {
      'Январь': 1, 'Февраль': 2, 'Март': 3, 'Апрель': 4, 'Май': 5, 'Июнь': 6,
      'Июль': 7, 'Август': 8, 'Сентябрь': 9, 'Октябрь': 10, 'Ноябрь': 11, 'Декабрь': 12
    };
    const month = map[parts[0]] || 99;
    const year = Number(parts[1]) || 2099;
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  function v75StageFromLaunch(item) {
    const text = `${item?.status || ''} ${item?.name || ''}`.toLowerCase();
    if (!item?.targetCost) return { key: 'calculator', meta: V75_STAGE_META.calculator };
    if (text.includes('печати') || text.includes('договор на производство') || text.includes('договор заключен')) return { key: 'production', meta: V75_STAGE_META.production };
    if (text.includes('тз') || text.includes('кп') || text.includes('nda') || text.includes('рецептур')) return { key: 'development', meta: V75_STAGE_META.development };
    const monthKey = v75MonthKey(item?.launchMonth);
    if (monthKey <= '2026-06') return { key: 'planning', meta: V75_STAGE_META.planning };
    if (monthKey <= '2026-08') return { key: 'launch_ready', meta: V75_STAGE_META.launch_ready };
    return { key: 'backlog', meta: V75_STAGE_META.backlog };
  }

  function v75ProductLaunches() {
    return [...(state.launches || [])]
      .map((item) => ({ ...item, stage: v75StageFromLaunch(item) }))
      .sort((a, b) => v75MonthKey(a.launchMonth).localeCompare(v75MonthKey(b.launchMonth)) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function v75StrategicProductTasks() {
    const items = [
      {
        id: 'product-price-corridor',
        title: 'Утвердить ценовой коридор по SKU и категориям',
        nextAction: 'Зафиксировать РРЦ / МРЦ / min price и правила отклонений по каналам.',
        reason: 'Сейчас коридор цен считается интуитивно от текущих цен.',
        owner: 'Ксения',
        due: plusDays(7),
        status: 'waiting_decision',
        type: 'price_margin',
        priority: 'critical',
        source: 'product_agenda',
        entityLabel: 'Ценовой коридор'
      },
      {
        id: 'product-order-plan',
        title: 'Собрать продуктовый план заказа заранее',
        nextAction: 'Согласовать матрицу новинок и SKU на пересмотр с demand / логистикой.',
        reason: 'Нужен план размещения заказа заранее под матрицу и pipeline.',
        owner: 'Ксения',
        due: plusDays(10),
        status: 'in_progress',
        type: 'launch',
        priority: 'high',
        source: 'product_agenda',
        entityLabel: 'План заказов'
      },
      {
        id: 'product-positioning',
        title: 'Пересобрать позиционирование и white-space по бренду',
        nextAction: 'Подготовить исследование по нишам, где у бренда есть пустота и право на запуск.',
        reason: 'Позиционирование и стратегия бренда не зафиксированы.',
        owner: 'Ксения',
        due: plusDays(14),
        status: 'new',
        type: 'general',
        priority: 'high',
        source: 'product_agenda',
        entityLabel: 'Позиционирование'
      },
      {
        id: 'product-bad-matrix',
        title: 'Пересмотреть матрицу БАДов и дубли продуктов',
        nextAction: 'Убрать дубли, проверить конфликт с женским брендом и подготовить продуктовые решения.',
        reason: 'Есть риск дублирования и конфликтов внутри матрицы.',
        owner: 'Ксения',
        due: plusDays(12),
        status: 'in_progress',
        type: 'launch',
        priority: 'medium',
        source: 'product_agenda',
        entityLabel: 'Матрица БАДов'
      }
    ];
    return items.map((item) => normalizeTask(item, 'manual'));
  }

  function v75ProductTasks() {
    const base = getAllTasks().filter((task) => {
      const hay = `${task.title || ''} ${task.reason || ''} ${task.nextAction || ''} ${task.entityLabel || ''}`.toLowerCase();
      return String(task.owner || '').toLowerCase() === 'ксения'
        || task.type === 'launch'
        || hay.includes('новин')
        || hay.includes('матриц')
        || hay.includes('ррц')
        || hay.includes('мрц')
        || hay.includes('ценов')
        || hay.includes('себесто')
        || hay.includes('позиционир');
    });
    const strategic = v75StrategicProductTasks();
    const ids = new Set(base.map((task) => task.id));
    return sortTasks([...base, ...strategic.filter((task) => !ids.has(task.id))]);
  }

  function v75PricingRiskRows() {
    const rows = state.repricer?.rows || [];
    return rows
      .map((row) => {
        const wb = row.wb || {};
        const ozon = row.ozon || {};
        const wbRisk = (wb.marginPct != null && v75Num(wb.marginPct) < 0.15) || wb.belowMin || v75Num(wb.changePct) > 0;
        const ozRisk = (ozon.marginPct != null && v75Num(ozon.marginPct) < 0.15) || ozon.belowMin || v75Num(ozon.changePct) > 0;
        return { ...row, wbRisk, ozRisk, riskScore: Number(wbRisk) + Number(ozRisk) + (v75Num(wb.changePct) > 0 ? 1 : 0) + (v75Num(ozon.changePct) > 0 ? 1 : 0) };
      })
      .filter((row) => row.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore || String(a.name || '').localeCompare(String(b.name || ''), 'ru'))
      .slice(0, 12);
  }

  function v75ProductModel() {
    const launches = v75ProductLaunches();
    const tasks = v75ProductTasks();
    const activeTasks = tasks.filter(isTaskActive);
    const waiting = activeTasks.filter((task) => task.status === 'waiting_decision');
    const overdue = activeTasks.filter(isTaskOverdue);
    const months = new Map();
    const stages = new Map();
    launches.forEach((item) => {
      const m = item.launchMonth || 'Без месяца';
      const monthRow = months.get(m) || { month: m, count: 0, plannedRevenue: 0, targetCostSum: 0, targetCostCount: 0 };
      monthRow.count += 1;
      monthRow.plannedRevenue += v75Num(item.plannedRevenue);
      if (item.targetCost != null && item.targetCost !== '') {
        monthRow.targetCostSum += v75Num(item.targetCost);
        monthRow.targetCostCount += 1;
      }
      months.set(m, monthRow);
      const stageKey = item.stage.key;
      const stageRow = stages.get(stageKey) || { key: stageKey, label: item.stage.meta.label, kind: item.stage.meta.kind, count: 0 };
      stageRow.count += 1;
      stages.set(stageKey, stageRow);
    });
    const reprSummary = state.repricer?.summary || {};
    const targetCostFilled = launches.filter((item) => item.targetCost != null && item.targetCost !== '').length;
    const targetCostAvg = targetCostFilled ? launches.reduce((acc, item) => acc + (item.targetCost != null && item.targetCost !== '' ? v75Num(item.targetCost) : 0), 0) / targetCostFilled : 0;
    return {
      launches,
      tasks,
      activeTasks,
      waiting,
      overdue,
      monthRows: [...months.values()].sort((a, b) => v75MonthKey(a.month).localeCompare(v75MonthKey(b.month))).slice(0, 8),
      stageRows: [...stages.values()].sort((a, b) => b.count - a.count),
      pricingRows: v75PricingRiskRows(),
      plannedRevenueTotal: launches.reduce((acc, item) => acc + v75Num(item.plannedRevenue), 0),
      targetCostAvg,
      targetCostMissing: launches.length - targetCostFilled,
      repricingSignals: (reprSummary.wbChangeCount || 0) + (reprSummary.ozonChangeCount || 0),
      marginRiskCount: (reprSummary.wbMarginRiskCount || 0) + (reprSummary.ozonMarginRiskCount || 0) + (reprSummary.wbBelowMinCount || 0) + (reprSummary.ozonBelowMinCount || 0)
    };
  }

  function v75TaskCard(task) {
    return `
      <div class="task-card ${isTaskOverdue(task) ? 'overdue' : ''}">
        <div class="head">
          <div>
            <div class="title">${escapeHtml(task.title || 'Задача')}</div>
            <div class="muted small">${escapeHtml(task.entityLabel || 'Продукт')}</div>
          </div>
          ${taskStatusBadge(task)}
        </div>
        <div class="meta">${taskPriorityBadge(task)}${taskTypeBadge(task)}${taskSourceBadge(task)}</div>
        <div class="muted small">${escapeHtml(task.reason || task.nextAction || '—')}</div>
        <div class="foot">
          <div class="muted small"><strong>${escapeHtml(task.owner || 'Без owner')}</strong><br>Срок: ${escapeHtml(task.due || '—')}</div>
          ${task.articleKey ? linkToSku(task.articleKey, 'Открыть SKU') : `<span class="muted small">${escapeHtml(task.nextAction || '')}</span>`}
        </div>
      </div>
    `;
  }

  function v75LaunchRow(item) {
    return `
      <tr>
        <td>${escapeHtml(item.launchMonth || '—')}</td>
        <td>
          <strong>${escapeHtml(item.name || 'Новинка')}</strong>
          <div class="muted small">${escapeHtml(item.reportGroup || '—')} · ${escapeHtml(item.subCategory || '—')}</div>
        </td>
        <td>${badge(item.tag || 'новинка', item.tag === 'тренд' ? 'warn' : 'info')}</td>
        <td>${badge(item.stage.meta.label, item.stage.meta.kind)}</td>
        <td>${fmt.money(item.targetCost)}</td>
        <td>${fmt.money(item.plannedRevenue)}</td>
        <td>${escapeHtml(item.production || '—')}</td>
      </tr>
    `;
  }

  function v75PricingRow(row) {
    return `
      <tr>
        <td>${linkToSku(row.articleKey || row.article, row.article || row.articleKey || 'SKU')}</td>
        <td>
          <strong>${escapeHtml(row.name || '—')}</strong>
          <div class="muted small">${escapeHtml(row.legalEntity || '—')}</div>
        </td>
        <td>
          <div class="muted small">WB: ${fmt.money(row.wb?.currentPrice)} → ${fmt.money(row.wb?.recPrice)}</div>
          <div class="muted small">Min WB: ${fmt.money(row.wb?.minPrice)}</div>
        </td>
        <td>
          <div class="muted small">Ozon: ${fmt.money(row.ozon?.currentPrice)} → ${fmt.money(row.ozon?.recPrice)}</div>
          <div class="muted small">Min Ozon: ${fmt.money(row.ozon?.minPrice)}</div>
        </td>
        <td>${marginBadge('WB', row.wb?.marginPct)} ${marginBadge('Ozon', row.ozon?.marginPct)}</td>
        <td><div class="muted small">${escapeHtml(row.wb?.strategy || row.ozon?.strategy || '—')}</div></td>
      </tr>
    `;
  }

  function v75RenderProductDirector() {
    const root = document.getElementById('view-launches');
    if (!root) return;
    const model = v75ProductModel();
    const filteredLaunches = model.launches.filter((item) => {
      if (state.v75.productMonth !== 'all' && item.launchMonth !== state.v75.productMonth) return false;
      if (state.v75.productStage !== 'all' && item.stage.key !== state.v75.productStage) return false;
      return true;
    });
    const monthOptions = [...new Set(model.launches.map((item) => item.launchMonth).filter(Boolean))]
      .sort((a, b) => v75MonthKey(a).localeCompare(v75MonthKey(b)));
    const taskRows = model.activeTasks.slice(0, 10).map(v75TaskCard).join('') || '<div class="empty">По Ксении пока нет активных задач — теперь их можно ставить прямо в задачнике на owner "Ксения".</div>';
    const agendaRows = [
      'Ценовой коридор / РРЦ / МРЦ по категориям',
      'Календарь новинок и решение по квартальным запускам',
      'План заказа заранее под матрицу и pipeline',
      'Пересмотр матрицы БАДов и конфликтов внутри ассортимента',
      'Позиционирование и white-space бренда'
    ].map((item) => `<div class="check-item"><strong>•</strong><div>${escapeHtml(item)}</div></div>`).join('');

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Продукт / Ксения</h2>
          <p>Отдельный контур директора по товару: задачи в работе, статусы продукта, планы запусков и затраты. Не только новинки, а вся продуктовая матрица вокруг Ксении.</p>
        </div>
        <div class="badge-stack">
          ${badge(`Активных задач ${fmt.int(model.activeTasks.length)}`, model.activeTasks.length ? 'info' : '')}
          ${badge(`Ждут решения ${fmt.int(model.waiting.length)}`, model.waiting.length ? 'danger' : '')}
          ${badge(`Просрочено ${fmt.int(model.overdue.length)}`, model.overdue.length ? 'danger' : '')}
        </div>
      </div>

      <div class="grid cards-2 v75-product-top">
        <div class="card v75-product-hero">
          <div class="eyebrow">Product director</div>
          <h3>Контур Ксении</h3>
          <p>Здесь Ксения как директор по товару видит: что в работе, где блокеры, какие запуски впереди, сколько плановой выручки в pipeline и где не хватает калькулятора / ценового коридора.</p>
          <div class="badge-stack" style="margin-top:10px;">
            ${model.stageRows.map((row) => badge(`${row.label} · ${fmt.int(row.count)}`, row.kind)).join('')}
          </div>
        </div>
        <div class="v75-product-kpi-grid">
          <div class="v73-kpi-card"><span>Продуктовых задач в работе</span><strong>${fmt.int(model.activeTasks.length)}</strong><small>owner = Ксения, launch и product agenda</small></div>
          <div class="v73-kpi-card"><span>Новинок в pipeline</span><strong>${fmt.int(model.launches.length)}</strong><small>из launch plan Алтея</small></div>
          <div class="v73-kpi-card"><span>Плановая выручка pipeline</span><strong>${fmt.money(model.plannedRevenueTotal)}</strong><small>сумма planned revenue по запускам</small></div>
          <div class="v73-kpi-card"><span>Средняя целевая себестоимость</span><strong>${fmt.money(model.targetCostAvg)}</strong><small>по launch plan, где cost заполнен</small></div>
          <div class="v73-kpi-card"><span>Без target cost</span><strong>${fmt.int(model.targetCostMissing)}</strong><small>нужно закрыть калькулятор</small></div>
          <div class="v73-kpi-card"><span>Сигналы по ценам</span><strong>${fmt.int(model.repricingSignals)}</strong><small>repricer / коридор / выравнивание</small></div>
        </div>
      </div>

      <div class="summary-grid v75-product-layout">
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>Что в работе у директора по товару</h3>
              <p class="small muted">Сюда попадают задачи owner=Ксения, launch-задачи и продуктовые сигналы.</p>
            </div>
            ${badge('Owner: Ксения', 'ok')}
          </div>
          <div class="stack">${taskRows}</div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>Статусы продукта</h3>
                <p class="small muted">Свод по pipeline, чтобы быстро видеть где разработка, производство и где нет калькулятора.</p>
              </div>
            </div>
            <div class="owner-summary">
              ${model.stageRows.map((row) => `
                <div class="owner-row">
                  <div class="head"><strong>${escapeHtml(row.label)}</strong>${badge(`${fmt.int(row.count)} SKU`, row.kind)}</div>
                  <div class="owner-bar"><span style="width:${Math.max(6, (row.count / Math.max(1, model.launches.length)) * 100)}%"></span></div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>Фокус директора по товару</h3>
                <p class="small muted">То, что должно быть под рукой у Ксении, а не теряться в блоке «Новинки».</p>
              </div>
            </div>
            <div class="check-list">${agendaRows}</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px;">
        <div class="section-subhead">
          <div>
            <h3>План запусков и затраты</h3>
            <p class="small muted">Месяц → новинка → статус → целевая себестоимость → план выручки. Это и есть рабочий блок Ксении, а не только список новинок.</p>
          </div>
          <div class="badge-stack">
            <select id="v75ProductMonth"><option value="all">Все месяцы</option>${monthOptions.map((month) => `<option value="${escapeHtml(month)}" ${state.v75.productMonth === month ? 'selected' : ''}>${escapeHtml(month)}</option>`).join('')}</select>
            <select id="v75ProductStage">
              <option value="all">Все статусы</option>
              ${Object.entries(V75_STAGE_META).map(([key, meta]) => `<option value="${key}" ${state.v75.productStage === key ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Месяц</th>
                <th>Новинка / продукт</th>
                <th>Тег</th>
                <th>Статус</th>
                <th>Target cost</th>
                <th>План выручки</th>
                <th>Производство</th>
              </tr>
            </thead>
            <tbody>${filteredLaunches.map(v75LaunchRow).join('') || '<tr><td colspan="7" class="text-center muted">Нет строк под текущий фильтр</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-top:14px;">
        <div class="section-subhead">
          <div>
            <h3>Ценовой коридор и unit-экономика</h3>
            <p class="small muted">Риск-панель по repricer: где Ксении нужно утвердить коридор цены, recPrice и продуктовый калькулятор.</p>
          </div>
          ${badge(`Сигналов ${fmt.int(model.pricingRows.length)}`, model.pricingRows.length ? 'warn' : 'ok')}
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Артикул</th>
                <th>SKU</th>
                <th>WB</th>
                <th>Ozon</th>
                <th>Маржа</th>
                <th>Стратегия / причина</th>
              </tr>
            </thead>
            <tbody>${model.pricingRows.map(v75PricingRow).join('') || '<tr><td colspan="6" class="text-center muted">Нет ценовых сигналов</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;

    root.querySelector('#v75ProductMonth')?.addEventListener('change', (event) => {
      state.v75.productMonth = event.target.value;
      v75RenderProductDirector();
    });
    root.querySelector('#v75ProductStage')?.addEventListener('change', (event) => {
      state.v75.productStage = event.target.value;
      v75RenderProductDirector();
    });
  }

  const v75BaseRenderLaunches = renderLaunches;
  renderLaunches = function () {
    if (!(state.launches || []).length) {
      v75BaseRenderLaunches();
      return;
    }
    v75RenderProductDirector();
  };

  const v75BaseRerender = rerenderCurrentView;
  rerenderCurrentView = function () {
    v75PatchChrome();
    v75BaseRerender();
  };

  document.addEventListener('DOMContentLoaded', v75PatchChrome);
  v75PatchChrome();
})();
