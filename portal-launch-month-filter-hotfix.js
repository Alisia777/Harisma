(function () {
  if (window.__ALTEA_LAUNCH_MONTH_FILTER_HOTFIX_20260422A__) return;
  window.__ALTEA_LAUNCH_MONTH_FILTER_HOTFIX_20260422A__ = true;

  function getLaunchFilters() {
    if (typeof state !== 'object' || !state) return { month: 'all' };
    state.launchFilters = state.launchFilters || {};
    state.launchFilters.month = state.launchFilters.month || 'all';
    return state.launchFilters;
  }

  function normalizeLaunchMonthLabel(value) {
    const label = String(value || '').trim();
    return label || 'Без месяца';
  }

  function launchMonthSortValue(label) {
    const normalized = normalizeLaunchMonthLabel(label).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized || normalized === 'без месяца') return Number.MAX_SAFE_INTEGER - 1;
    if (normalized.includes('текущий') || normalized.includes('фокус')) return Number.MAX_SAFE_INTEGER - 2;
    const monthMap = {
      'январь': 1,
      'февраль': 2,
      'март': 3,
      'апрель': 4,
      'май': 5,
      'июнь': 6,
      'июль': 7,
      'август': 8,
      'сентябрь': 9,
      'октябрь': 10,
      'ноябрь': 11,
      'декабрь': 12
    };
    const match = normalized.match(/^([а-яё]+)\s+(\d{4})$/i);
    if (!match) return Number.MAX_SAFE_INTEGER;
    const month = monthMap[match[1]];
    const year = Number(match[2]);
    if (!month || !Number.isFinite(year)) return Number.MAX_SAFE_INTEGER;
    return year * 100 + month;
  }

  function getLaunchMonthOptions(items) {
    const counts = new Map();
    (items || []).forEach((item) => {
      const label = normalizeLaunchMonthLabel(item?.launchMonth);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((left, right) => launchMonthSortValue(left[0]) - launchMonthSortValue(right[0]) || left[0].localeCompare(right[0], 'ru'))
      .map(([label, count]) => ({ label, count }));
  }

  function getLaunchViewModel() {
    const items = typeof getLaunchItems === 'function' ? getLaunchItems() : [];
    const filters = getLaunchFilters();
    const months = getLaunchMonthOptions(items);
    if (filters.month !== 'all' && !months.some((item) => item.label === filters.month)) {
      filters.month = 'all';
    }
    const filteredItems = filters.month === 'all'
      ? items
      : items.filter((item) => normalizeLaunchMonthLabel(item?.launchMonth) === filters.month);
    const sectionMap = new Map();
    filteredItems.forEach((item) => {
      const label = normalizeLaunchMonthLabel(item?.launchMonth);
      const bucket = sectionMap.get(label) || [];
      bucket.push(item);
      sectionMap.set(label, bucket);
    });
    const sections = [...sectionMap.entries()]
      .sort((left, right) => launchMonthSortValue(left[0]) - launchMonthSortValue(right[0]) || left[0].localeCompare(right[0], 'ru'))
      .map(([label, monthItems]) => ({ label, items: monthItems }));
    return { items, filters, months, filteredItems, sections };
  }

  function renderLaunchMonthFilters(model) {
    return `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Фильтр по месяцам</h3>
            <p class="small muted">Ксения может открыть только нужный месяц запуска или держать всю карту новинок сразу.</p>
          </div>
          <div class="badge-stack">${badge(`${fmt.int(model.months.length)} мес.`, model.months.length ? 'info' : '')}${model.filters.month !== 'all' ? badge(model.filters.month, 'warn') : badge('Все месяцы', 'ok')}</div>
        </div>
        <div class="quick-actions">
          <button class="quick-chip ${model.filters.month === 'all' ? 'active' : ''}" type="button" data-launch-month="all">Все месяцы · ${fmt.int(model.items.length)}</button>
          ${model.months.map((item) => `<button class="quick-chip ${model.filters.month === item.label ? 'active' : ''}" type="button" data-launch-month="${escapeHtml(item.label)}">${escapeHtml(item.label)} · ${fmt.int(item.count)}</button>`).join('')}
        </div>
      </div>
    `;
  }

  function bindLaunchMonthFilters(root) {
    root.querySelectorAll('[data-launch-month]').forEach((button) => {
      button.addEventListener('click', () => {
        getLaunchFilters().month = button.dataset.launchMonth || 'all';
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      });
    });
  }

  function renderLaunchItem(item) {
    return `
      <div class="list-item">
        <div class="head">
          <div>
            <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || 'Новинка') : escapeHtml(item.name || 'Новинка')}</strong>
            <div class="muted small">${escapeHtml(item.reportGroup || '—')} · ${escapeHtml(item.subCategory || '—')}</div>
          </div>
          ${badge(item.launchMonth || '—', 'info')}
        </div>
        <div class="badge-stack">${badge(launchPhaseMeta(item.phase).label, launchPhaseMeta(item.phase).tone)}${item.production ? badge(item.production) : ''}${item.owner ? badge(item.owner, 'info') : badge('Без owner', 'warn')}</div>
        <div class="muted small" style="margin-top:8px">${escapeHtml(item.status || 'Статус не указан')}</div>
        <div class="muted small" style="margin-top:8px">План выручки: ${fmt.money(item.plannedRevenue)} · Трафик: ${escapeHtml(item.externalTraffic || '—')}</div>
        <div class="badge-stack" style="margin-top:8px">${badge(`${fmt.int(item.activeTasks || 0)} активн. задач`, item.activeTasks ? 'warn' : 'ok')}${(item.blockers || []).slice(0, 2).map((text) => badge(text, 'warn')).join('')}</div>
      </div>
    `;
  }

  function overrideLaunchScreens() {
    if (typeof getLaunchItems !== 'function' || typeof launchPhaseMeta !== 'function' || typeof badge !== 'function' || typeof fmt !== 'object') {
      return false;
    }

    const renderLaunchesWithMonthFilters = function renderLaunchesWithMonthFilters() {
      const root = document.getElementById('view-launches');
      if (!root) return;
      const model = getLaunchViewModel();
      root.innerHTML = `
        <div class="section-title">
          <div>
            <h2>Новинки и pipeline</h2>
            <p>Собрала product-layer по SKU роста и новинкам: карточка, owner, экономика, трафик и текущие блокеры в одном месте.</p>
          </div>
          <div class="badge-stack">${badge(`${fmt.int(model.filteredItems.length)} SKU в фокусе`, model.filteredItems.length ? 'info' : 'warn')}${badge(`${fmt.int(model.filteredItems.filter((item) => !item.owner).length)} без owner`, model.filteredItems.filter((item) => !item.owner).length ? 'warn' : 'ok')}${badge(`${fmt.int(model.filteredItems.filter((item) => item.activeTasks).length)} с активными задачами`, model.filteredItems.filter((item) => item.activeTasks).length ? 'warn' : 'ok')}</div>
        </div>
        ${renderLaunchMonthFilters(model)}
        <div class="card" style="margin-top:14px">
          <div class="pipeline-strip">
            <span>Owner</span><span>Поставка</span><span>Контент</span><span>Трафик</span><span>Экономика</span><span>Масштаб</span>
          </div>
          <div class="muted small" style="margin-top:12px">Сначала фильтруем по месяцу, потом разбираем карточки внутри месяца. Так Ксения снова видит pipeline блоками, а не одной длинной лентой.</div>
        </div>
        ${model.sections.map((section) => `
          <div class="card" style="margin-top:14px">
            <div class="section-subhead">
              <div>
                <h3>${escapeHtml(section.label)}</h3>
                <p class="small muted">Карточки новинок, которые относятся к этому месяцу запуска.</p>
              </div>
              <div class="badge-stack">${badge(`${fmt.int(section.items.length)} SKU`, section.items.length ? 'info' : '')}${badge(`${fmt.int(section.items.filter((item) => !item.owner).length)} без owner`, section.items.filter((item) => !item.owner).length ? 'warn' : 'ok')}</div>
            </div>
            <div class="list" style="margin-top:14px">${section.items.map(renderLaunchItem).join('') || '<div class="empty">Нет новинок в этом месяце.</div>'}</div>
          </div>
        `).join('') || '<div class="card" style="margin-top:14px"><div class="empty">Нет новинок в текущем срезе</div></div>'}
      `;
      bindLaunchMonthFilters(root);
    };

    const renderLaunchControlWithMonthFilters = function renderLaunchControlWithMonthFilters() {
      const root = document.getElementById('view-launch-control');
      if (!root) return;
      const model = getLaunchViewModel();
      const items = model.filteredItems;
      const phaseOrder = ['owner', 'supply', 'content', 'economy', 'scale'];
      const groups = phaseOrder
        .map((key) => ({ key, meta: launchPhaseMeta(key), items: items.filter((item) => item.phase === key) }))
        .filter((group) => group.items.length);

      root.innerHTML = `
        <div class="section-title">
          <div>
            <h2>Запуск новинок</h2>
            <p>Отдельный экран запуска: сверху видно, где именно сейчас блокируется запуск, а ниже можно пройтись по SKU как по чек-листу.</p>
          </div>
          <div class="badge-stack">
            ${badge(`${fmt.int(items.length)} в запуске`, items.length ? 'info' : 'warn')}
            ${badge(`${fmt.int(items.filter((item) => item.phase === 'owner').length)} ждут owner`, items.filter((item) => item.phase === 'owner').length ? 'warn' : 'ok')}
            ${badge(`${fmt.int(items.filter((item) => item.phase === 'content').length)} ждут трафик`, items.filter((item) => item.phase === 'content').length ? 'warn' : 'ok')}
          </div>
        </div>

        ${renderLaunchMonthFilters(model)}

        <div class="grid cards" style="margin-top:14px">
          ${groups.map((group) => `
            <div class="card kpi">
              <div class="label">${escapeHtml(group.meta.label)}</div>
              <div class="value">${fmt.int(group.items.length)}</div>
              <div class="hint">SKU в этой фазе запуска</div>
              <div class="badge-stack" style="margin-top:10px">${group.items.slice(0, 3).map((item) => badge(item.owner || item.name, item.owner ? '' : 'warn')).join('')}</div>
            </div>
          `).join('') || '<div class="card"><div class="empty">Нет SKU в запуске</div></div>'}
        </div>

        ${groups.map((group) => `
          <div class="card" style="margin-top:14px">
            <div class="section-subhead">
              <div>
                <h3>${escapeHtml(group.meta.label)}</h3>
                <p class="small muted">Что надо закрыть на этом этапе, чтобы SKU не зависал между отделами.</p>
              </div>
              ${badge(`${fmt.int(group.items.length)} SKU`, group.meta.tone)}
            </div>
            <div class="list">
              ${group.items.map((item) => `
                <div class="list-item">
                  <div class="head">
                    <div>
                      <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || 'Новинка') : escapeHtml(item.name || 'Новинка')}</strong>
                      <div class="muted small">${escapeHtml(item.subCategory || '—')}</div>
                    </div>
                    <div class="badge-stack">${item.owner ? badge(item.owner, 'info') : badge('Без owner', 'warn')}${badge(`${fmt.int(item.activeTasks || 0)} задач`, item.activeTasks ? 'warn' : 'ok')}</div>
                  </div>
                  <div class="check-list">
                    <div class="check-item"><strong>1.</strong><span>${ownerName(getSku(item.articleKey)) ? 'Owner назначен' : 'Назначить owner и зону ответственности'}</span></div>
                    <div class="check-item"><strong>2.</strong><span>${totalSkuStock(getSku(item.articleKey)) > 0 ? `Остаток есть: ${fmt.int(totalSkuStock(getSku(item.articleKey)))}` : 'Проверить поставку и доступность SKU'}</span></div>
                    <div class="check-item"><strong>3.</strong><span>${getSku(item.articleKey)?.flags?.hasExternalTraffic ? `Трафик есть: ${escapeHtml(item.externalTraffic)}` : 'Подготовить запуск трафика / контента'}</span></div>
                    <div class="check-item"><strong>4.</strong><span>${(item.blockers || []).length ? `Блокеры: ${escapeHtml(item.blockers.join(', '))}` : 'Критичных блокеров не видно'}</span></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      `;

      bindLaunchMonthFilters(root);
    };

    // The app rerender pipeline calls the global bindings directly,
    // not always through window.renderLaunches/window.renderLaunchControl.
    renderLaunches = renderLaunchesWithMonthFilters;
    renderLaunchControl = renderLaunchControlWithMonthFilters;
    window.renderLaunches = renderLaunchesWithMonthFilters;
    window.renderLaunchControl = renderLaunchControlWithMonthFilters;

    return true;
  }

  function installOverrides() {
    if (!overrideLaunchScreens()) return false;
    if (typeof rerenderCurrentView === 'function' && (state?.activeView === 'launches' || state?.activeView === 'launch-control')) {
      rerenderCurrentView();
    }
    return true;
  }

  if (!installOverrides()) {
    const timer = window.setInterval(() => {
      if (installOverrides()) window.clearInterval(timer);
    }, 120);
    window.setTimeout(() => window.clearInterval(timer), 15000);
  }

  window.addEventListener('altea:viewchange', (event) => {
    const view = event?.detail?.view;
    if (!view || (view !== 'launches' && view !== 'launch-control')) return;
    window.setTimeout(() => {
      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    }, 80);
  });
})();
