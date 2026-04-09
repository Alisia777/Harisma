(function () {
  state.v79 = Object.assign({
    prices: null,
    loading: false,
    error: '',
    filters: {
      market: 'wb',
      search: ''
    }
  }, state.v79 || {});

  function v79EnsurePricesData() {
    if (state.v79.loading || state.v79.prices) return;
    state.v79.loading = true;
    loadJson('data/prices.json')
      .then((data) => {
        state.v79.prices = data;
        state.v79.error = '';
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      })
      .catch((error) => {
        console.error(error);
        state.v79.error = error.message;
        const root = document.getElementById('view-prices');
        if (root) {
          root.innerHTML = `<div class="card"><div class="head"><div><h3>Цены</h3><div class="muted small">Не удалось загрузить price matrix</div></div>${badge('ошибка', 'danger')}</div><div class="muted" style="margin-top:10px">${escapeHtml(error.message)}</div></div>`;
        }
      })
      .finally(() => {
        state.v79.loading = false;
      });
  }

  function v79MarketLabel(key) {
    return ({ wb: 'WB', ozon: 'ОЗ', ym: 'ЯМ' })[key] || key;
  }

  function v79FmtPct(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  function v79FmtMoneyShort(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value))} ₽`;
  }

  function v79BuildSummary(rows) {
    const withMargin = rows.filter((row) => row.avgMargin7dPct != null && row.allowedMarginPct != null);
    const belowAllowed = withMargin.filter((row) => Number(row.avgMargin7dPct) < Number(row.allowedMarginPct));
    const avgTurnover = rows.filter((row) => row.currentTurnoverDays != null).reduce((acc, row) => acc + Number(row.currentTurnoverDays), 0) / Math.max(1, rows.filter((row) => row.currentTurnoverDays != null).length);
    const avgPrice = rows.filter((row) => row.currentPrice != null).reduce((acc, row) => acc + Number(row.currentPrice), 0) / Math.max(1, rows.filter((row) => row.currentPrice != null).length);
    return [
      { label: 'SKU в матрице цен', value: fmt.int(rows.length), hint: 'Фильтр текущего маркетплейса.' },
      { label: 'Ниже допустимой маржи', value: fmt.int(belowAllowed.length), hint: 'Средняя маржа 7д ниже допустимого порога.' },
      { label: 'Средняя оборачиваемость', value: avgTurnover ? `${fmt.num(avgTurnover, 1)} дн.` : '—', hint: 'По всем складам и выбранному MP.' },
      { label: 'Средняя цена', value: avgPrice ? fmt.money(avgPrice) : '—', hint: 'Текущая seller price по выбранному MP.' }
    ];
  }

  function v79RowClass(row) {
    const marginRisk = row.allowedMarginPct != null && row.avgMargin7dPct != null && Number(row.avgMargin7dPct) < Number(row.allowedMarginPct);
    return marginRisk ? 'margin-risk' : '';
  }

  function v79CellClass(value, type, row) {
    if (value == null || value === '') return 'empty';
    if (type === 'margin' && row.allowedMarginPct != null && Number(value) < Number(row.allowedMarginPct)) return 'bad';
    if (type === 'turnover') {
      if (Number(value) >= 60) return 'bad';
      if (Number(value) >= 45) return 'warn';
      return 'ok';
    }
    if (type === 'price' && row.minPrice != null && Number(value) < Number(row.minPrice)) return 'bad';
    if (type === 'spp') {
      if (Number(value) >= 0.45) return 'warn';
    }
    return '';
  }

  function v79RenderTable(rows, platformKey, dates) {
    if (!rows.length) {
      const emptyNote = (((state.v79.prices || {}).platforms || {})[platformKey] || {}).emptyNote || 'Данные по площадке ещё не подключены.';
      return `<div class="card"><div class="empty">${escapeHtml(emptyNote)}</div></div>`;
    }

    const headDates = dates.map((date) => `<th class="price-date-group" colspan="3">${escapeHtml(date.label)}</th>`).join('');
    const subHead = dates.map(() => '<th>Обор.</th><th>Цена</th><th>СПП</th>').join('');
    const body = rows.map((row) => {
      const dailyCells = row.daily.map((cell) => `
        <td class="${v79CellClass(cell.turnoverDays, 'turnover', row)}">${cell.turnoverDays == null ? '—' : `${fmt.num(cell.turnoverDays, 1)} дн.`}</td>
        <td class="${v79CellClass(cell.price, 'price', row)}">${v79FmtMoneyShort(cell.price)}</td>
        <td class="${v79CellClass(cell.sppPct, 'spp', row)}">${v79FmtPct(cell.sppPct)}</td>
      `).join('');
      return `
        <tr class="${v79RowClass(row)}">
          <td class="price-sticky price-col-sku">
            <div class="price-sku-cell">
              ${linkToSku(row.articleKey, row.article || row.articleKey)}
              <div class="muted small">${escapeHtml(row.name || 'Без названия')}</div>
            </div>
          </td>
          <td class="price-sticky price-col-allowed ${v79CellClass(row.allowedMarginPct, 'margin', row)}">${v79FmtPct(row.allowedMarginPct)}</td>
          <td class="price-sticky price-col-margin ${v79CellClass(row.avgMargin7dPct, 'margin', row)}">${v79FmtPct(row.avgMargin7dPct)}</td>
          <td class="${v79CellClass(row.currentTurnoverDays, 'turnover', row)}">${row.currentTurnoverDays == null ? '—' : `${fmt.num(row.currentTurnoverDays, 1)} дн.`}</td>
          <td class="${v79CellClass(row.currentPrice, 'price', row)}">${v79FmtMoneyShort(row.currentPrice)}</td>
          ${dailyCells}
        </tr>
      `;
    }).join('');

    return `
      <div class="price-matrix-wrap">
        <table class="price-matrix-table">
          <thead>
            <tr>
              <th rowspan="2" class="price-sticky price-col-sku">Артикул</th>
              <th rowspan="2" class="price-sticky price-col-allowed">Допустимая маржа</th>
              <th rowspan="2" class="price-sticky price-col-margin">Средняя маржа 7д</th>
              <th rowspan="2">Обор. ср. все склады</th>
              <th rowspan="2">Цена</th>
              ${headDates}
            </tr>
            <tr>${subHead}</tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function v79FilteredRows() {
    const data = state.v79.prices;
    if (!data) return [];
    const market = state.v79.filters.market || 'wb';
    const rows = (((data.platforms || {})[market] || {}).rows || []).slice();
    const q = String(state.v79.filters.search || '').trim().toLowerCase();
    const filtered = q ? rows.filter((row) => `${row.article} ${row.name} ${row.owner}`.toLowerCase().includes(q)) : rows;
    filtered.sort((a, b) => {
      const riskA = a.allowedMarginPct != null && a.avgMargin7dPct != null && Number(a.avgMargin7dPct) < Number(a.allowedMarginPct) ? 1 : 0;
      const riskB = b.allowedMarginPct != null && b.avgMargin7dPct != null && Number(b.avgMargin7dPct) < Number(b.allowedMarginPct) ? 1 : 0;
      if (riskA !== riskB) return riskB - riskA;
      return (Number(b.currentTurnoverDays) || 0) - (Number(a.currentTurnoverDays) || 0);
    });
    return filtered;
  }

  function renderPrices() {
    const root = document.getElementById('view-prices');
    if (!root) return;
    if (state.v79.loading && !state.v79.prices) {
      root.innerHTML = '<div class="card"><div class="empty">Загружаю price matrix…</div></div>';
      return;
    }
    if (state.v79.error && !state.v79.prices) {
      root.innerHTML = `<div class="card"><div class="empty">Не удалось загрузить price matrix: ${escapeHtml(state.v79.error)}</div></div>`;
      return;
    }
    if (!state.v79.prices) {
      root.innerHTML = '<div class="card"><div class="empty">Price matrix ещё не загружен.</div></div>';
      return;
    }

    const rows = v79FilteredRows();
    const cards = v79BuildSummary(rows).map((card) => `
      <div class="card kpi control-card">
        <div class="label">${escapeHtml(card.label)}</div>
        <div class="value">${card.value}</div>
        <div class="hint">${escapeHtml(card.hint)}</div>
      </div>
    `).join('');

    const marketButtons = ['wb', 'ozon', 'ym'].map((key) => `
      <button type="button" class="quick-chip ${state.v79.filters.market === key ? 'active' : ''}" data-price-market="${key}">${v79MarketLabel(key)}</button>
    `).join('');

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Цены</h2>
          <p>Отдельный ценовой контур: слева закреплены артикулы, допустимая маржа и средняя маржа 7д; дальше — текущая оборачиваемость по всем складам, цена и помесячная матрица по датам с колонками оборачиваемость / цена / СПП.</p>
        </div>
        <div class="quick-actions price-market-switch">
          ${marketButtons}
        </div>
      </div>

      <div class="footer-note" style="margin-bottom:14px">${escapeHtml(state.v79.prices.note || '')}</div>

      <div class="grid cards">${cards}</div>

      <div class="filters" style="margin-top:14px">
        <input id="priceSearchInput" placeholder="Поиск по артикулу, названию или owner" value="${escapeHtml(state.v79.filters.search)}">
        <div class="price-month-pill">${escapeHtml(state.v79.prices.month?.label || '')}</div>
      </div>

      ${v79RenderTable(rows, state.v79.filters.market, state.v79.prices.dates || [])}
    `;

    const searchInput = document.getElementById('priceSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        state.v79.filters.search = event.target.value;
        renderPrices();
      });
    }
    root.querySelectorAll('[data-price-market]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.v79.filters.market = btn.dataset.priceMarket;
        renderPrices();
      });
    });
  }

  const originalRerender = rerenderCurrentView;
  rerenderCurrentView = function () {
    originalRerender();
    try {
      renderPrices();
    } catch (error) {
      console.error(error);
      renderViewFailure('view-prices', 'Цены', error);
      state.runtimeErrors = state.runtimeErrors || [];
      if (!state.runtimeErrors.includes(`Цены: ${error.message}`)) state.runtimeErrors.push(`Цены: ${error.message}`);
      setAppError(`Портал загрузил не всё: Цены: ${error.message}`);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', v79EnsurePricesData, { once: true });
  } else {
    v79EnsurePricesData();
  }
})();
