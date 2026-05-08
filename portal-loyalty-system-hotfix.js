(function () {
  if (window.__ALTEA_LOYALTY_SYSTEM_HOTFIX__) return;
  window.__ALTEA_LOYALTY_SYSTEM_HOTFIX__ = true;

  const EMPTY_LOYALTY_SYSTEM = {
    generatedAt: '',
    asOfDate: '',
    source: {},
    summary: {},
    months: [],
    daily: [],
    byProgram: [],
    byPlatform: [],
    rows: [],
    diagnostics: {}
  };

  function cloneEmptyLoyaltySystem() {
    return JSON.parse(JSON.stringify(EMPTY_LOYALTY_SYSTEM));
  }

  function html(value) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(value)
      : String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function numeric(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getLoyaltyFilters() {
    if (typeof state !== 'object') return { month: 'latest', tab: 'drr' };
    if (!state.iuDrrFilters || typeof state.iuDrrFilters !== 'object') state.iuDrrFilters = { month: 'latest' };
    if (!state.iuDrrFilters.tab) state.iuDrrFilters.tab = 'drr';
    return state.iuDrrFilters;
  }

  function loyaltyPayload() {
    if (typeof state !== 'object') return cloneEmptyLoyaltySystem();
    if (!state.loyaltySystem || typeof state.loyaltySystem !== 'object') state.loyaltySystem = cloneEmptyLoyaltySystem();
    const payload = state.loyaltySystem;
    return {
      ...cloneEmptyLoyaltySystem(),
      ...payload,
      source: payload.source || {},
      summary: payload.summary || {},
      months: Array.isArray(payload.months) ? payload.months : [],
      daily: Array.isArray(payload.daily) ? payload.daily : [],
      byProgram: Array.isArray(payload.byProgram) ? payload.byProgram : [],
      byPlatform: Array.isArray(payload.byPlatform) ? payload.byPlatform : [],
      rows: Array.isArray(payload.rows) ? payload.rows : [],
      diagnostics: payload.diagnostics || {}
    };
  }

  function aggregateLoyaltyRows(rows, keySelector) {
    const buckets = new Map();
    for (const row of rows) {
      const key = keySelector(row) || '';
      if (!key) continue;
      const current = buckets.get(key) || { key, label: key, rows: 0, spend: 0, points: 0, orders: 0, revenue: 0, customers: 0 };
      current.rows += 1;
      current.spend += numeric(row.spend);
      current.points += numeric(row.points);
      current.orders += numeric(row.orders);
      current.revenue += numeric(row.revenue);
      current.customers += numeric(row.customers);
      buckets.set(key, current);
    }
    return Array.from(buckets.values())
      .map((item) => ({
        ...item,
        spend: Number(item.spend.toFixed(2)),
        points: Number(item.points.toFixed(2)),
        orders: Number(item.orders.toFixed(4)),
        revenue: Number(item.revenue.toFixed(2)),
        customers: Number(item.customers.toFixed(4))
      }))
      .sort((left, right) => right.spend - left.spend || right.revenue - left.revenue || String(left.label).localeCompare(String(right.label)));
  }

  function summarizeLoyaltyRows(rows) {
    return rows.reduce((acc, row) => {
      acc.rows += 1;
      acc.spend += numeric(row.spend);
      acc.points += numeric(row.points);
      acc.orders += numeric(row.orders);
      acc.revenue += numeric(row.revenue);
      acc.customers += numeric(row.customers);
      return acc;
    }, { rows: 0, spend: 0, points: 0, orders: 0, revenue: 0, customers: 0 });
  }

  function loyaltyMonthOptions(payload) {
    const months = Array.isArray(payload.months) ? payload.months.filter((item) => item?.key) : [];
    if (months.length) return months;
    const monthKeys = Array.from(new Set(payload.rows.map((row) => row.month).filter(Boolean))).sort().reverse();
    return monthKeys.map((key) => ({ key, label: key }));
  }

  function selectedLoyaltyMonth(payload) {
    const filters = getLoyaltyFilters();
    const months = loyaltyMonthOptions(payload);
    if (!months.length) return '';
    if (filters.month && filters.month !== 'latest' && months.some((item) => item.key === filters.month)) return filters.month;
    return months[0].key;
  }

  function formatMonthLabel(month) {
    if (!month) return 'Все месяцы';
    const [year, monthNumber] = String(month).split('-');
    return monthNumber && year ? `${monthNumber}.${year}` : month;
  }

  function renderIuDrrTabs(active) {
    return `
      <div class="badge-stack">
        <button class="quick-chip ${active === 'drr' ? 'active' : ''}" type="button" data-iu-drr-tab="drr" aria-pressed="${active === 'drr'}">ИУ / ДРР</button>
        <button class="quick-chip ${active === 'loyalty' ? 'active' : ''}" type="button" data-iu-drr-tab="loyalty" aria-pressed="${active === 'loyalty'}">Система лояльности</button>
      </div>
    `;
  }

  function attachIuDrrTabEvents(root) {
    root.querySelectorAll('[data-iu-drr-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        getLoyaltyFilters().tab = String(button.dataset.iuDrrTab || 'drr');
        rerenderCurrentView();
      });
    });
  }

  function insertIuDrrTabs(root) {
    if (!root || root.querySelector('[data-iu-drr-tab]')) return;
    const title = root.querySelector('.section-title');
    const htmlBlock = `<div class="control-filters" style="margin-top:12px">${renderIuDrrTabs('drr')}</div>`;
    if (title) title.insertAdjacentHTML('afterend', htmlBlock);
    else root.insertAdjacentHTML('afterbegin', htmlBlock);
    attachIuDrrTabEvents(root);
  }

  function renderLoyaltyRaw(row) {
    const pairs = Object.entries(row.raw || {})
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .slice(0, 4);
    if (!pairs.length) return '';
    return `<div class="muted small">${pairs.map(([key, value]) => `${html(key)}: ${html(value)}`).join(' · ')}</div>`;
  }

  function renderLoyaltySystem(rootId = 'view-iu-drr') {
    const root = document.getElementById(rootId);
    if (!root) return;
    const payload = loyaltyPayload();
    const months = loyaltyMonthOptions(payload);
    const selectedMonth = selectedLoyaltyMonth(payload);
    const rows = selectedMonth ? payload.rows.filter((row) => row.month === selectedMonth) : payload.rows;
    const summary = summarizeLoyaltyRows(rows);
    const byProgram = aggregateLoyaltyRows(rows, (row) => row.program).slice(0, 12);
    const recentRows = rows.slice().sort((left, right) => String(right.date).localeCompare(String(left.date))).slice(0, 40);
    const sheetFound = Boolean(payload.diagnostics?.sheetFound || payload.source?.sheetName);
    const expectedNames = (payload.diagnostics?.expectedSheetNames || []).slice(0, 4).join(' / ');
    const sourceBadge = sheetFound
      ? badge(payload.source?.sheetName || 'Google Sheets', 'ok')
      : badge('лист не найден', 'warn');

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Система лояльности</h2>
          <p>Срез из Google Sheets для контура ИУ / ДРР.</p>
        </div>
        <div class="badge-stack">
          ${sourceBadge}
          ${badge(payload.generatedAt ? `обновлено ${fmt.date(payload.generatedAt)}` : 'ожидает срез', payload.generatedAt ? 'info' : 'warn')}
          ${badge(payload.asOfDate ? `срез ${payload.asOfDate}` : 'нет даты', payload.asOfDate ? 'info' : 'warn')}
        </div>
      </div>

      <div class="control-filters" style="margin-top:12px">
        ${renderIuDrrTabs('loyalty')}
        ${months.length ? `
          <select id="loyaltySystemMonth">
            ${months.map((option) => `<option value="${html(option.key)}" ${option.key === selectedMonth ? 'selected' : ''}>${html(option.label || formatMonthLabel(option.key))}</option>`).join('')}
          </select>
        ` : ''}
      </div>

      <div class="kpi-strip" style="margin-top:14px">
        <div class="mini-kpi"><span>Строки</span><strong>${fmt.int(summary.rows)}</strong><span>${sheetFound ? 'из листа' : 'лист ожидается'}</span></div>
        <div class="mini-kpi ${summary.spend ? 'warn' : ''}"><span>Расход</span><strong>${fmt.money(summary.spend)}</strong><span>${html(formatMonthLabel(selectedMonth))}</span></div>
        <div class="mini-kpi"><span>Баллы / бонусы</span><strong>${fmt.num(summary.points, 0)}</strong><span>по строкам источника</span></div>
        <div class="mini-kpi"><span>Заказы</span><strong>${fmt.num(summary.orders, 0)}</strong><span>атрибутировано</span></div>
        <div class="mini-kpi"><span>Оборот</span><strong>${fmt.money(summary.revenue)}</strong><span>по программе</span></div>
        <div class="mini-kpi"><span>Клиенты</span><strong>${fmt.num(summary.customers, 0)}</strong><span>если есть в файле</span></div>
      </div>

      ${rows.length ? `
        <div class="two-col" style="margin-top:14px">
          <div class="card">
            <div class="section-subhead">
              <div><h3>Программы</h3><p class="small muted">Расход, баллы и оборот по типам лояльности.</p></div>
              ${badge(`${fmt.int(byProgram.length)} программ`, 'info')}
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Программа</th>
                    <th>Строки</th>
                    <th>Расход</th>
                    <th>Баллы</th>
                    <th>Заказы</th>
                    <th>Оборот</th>
                  </tr>
                </thead>
                <tbody>
                  ${byProgram.map((item) => `
                    <tr>
                      <td><strong>${html(item.label)}</strong></td>
                      <td>${fmt.int(item.rows)}</td>
                      <td>${fmt.money(item.spend)}</td>
                      <td>${fmt.num(item.points, 0)}</td>
                      <td>${fmt.num(item.orders, 0)}</td>
                      <td>${fmt.money(item.revenue)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="section-subhead">
              <div><h3>Дневная динамика</h3><p class="small muted">Последние даты в выбранном месяце.</p></div>
              ${badge(selectedMonth ? formatMonthLabel(selectedMonth) : 'все даты', 'info')}
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Строки</th>
                    <th>Расход</th>
                    <th>Баллы</th>
                    <th>Оборот</th>
                  </tr>
                </thead>
                <tbody>
                  ${aggregateLoyaltyRows(rows, (row) => row.date).sort((left, right) => String(right.key).localeCompare(String(left.key))).slice(0, 14).map((item) => `
                    <tr>
                      <td><strong>${html(item.key)}</strong></td>
                      <td>${fmt.int(item.rows)}</td>
                      <td>${fmt.money(item.spend)}</td>
                      <td>${fmt.num(item.points, 0)}</td>
                      <td>${fmt.money(item.revenue)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:14px">
          <div class="section-subhead">
            <div><h3>Строки источника</h3><p class="small muted">Нормализованный срез из файла.</p></div>
            ${badge(`${fmt.int(recentRows.length)} строк`, 'info')}
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Программа</th>
                  <th>SKU / площадка</th>
                  <th>Расход</th>
                  <th>Баллы</th>
                  <th>Заказы</th>
                  <th>Оборот</th>
                </tr>
              </thead>
              <tbody>
                ${recentRows.map((row) => `
                  <tr>
                    <td><strong>${html(row.date || '—')}</strong></td>
                    <td>${html(row.program || '—')}${renderLoyaltyRaw(row)}</td>
                    <td>${row.articleKey ? linkToSku(row.articleKey, row.articleKey) : '—'}<div class="muted small">${html(row.platform || '')}</div></td>
                    <td>${fmt.money(row.spend)}</td>
                    <td>${fmt.num(row.points, 0)}</td>
                    <td>${fmt.num(row.orders, 0)}</td>
                    <td>${fmt.money(row.revenue)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : `
        <div class="card" style="margin-top:14px">
          <div class="section-subhead">
            <div><h3>Срез Google Sheets</h3><p class="small muted">${sheetFound ? 'Лист найден, строк для витрины пока нет.' : 'В текущей книге лист системы лояльности пока не найден.'}</p></div>
            ${sourceBadge}
          </div>
          <div class="alert-stack" style="margin-top:12px">
            <div class="alert-row">
              <div>
                <strong>Google Sheets обновляется ежедневно в 10:00</strong>
                <div class="muted small">${expectedNames ? `Ожидаемые имена листа: ${html(expectedNames)}` : 'Слой готов к появлению листа в файле.'}</div>
              </div>
              ${badge(payload.source?.portalRefreshTimeLocal || '10:00 Europe/Moscow', 'info')}
            </div>
          </div>
        </div>
      `}
    `;

    attachIuDrrTabEvents(root);
    root.querySelector('#loyaltySystemMonth')?.addEventListener('change', (event) => {
      getLoyaltyFilters().month = String(event.target.value || 'latest');
      rerenderCurrentView();
    });
  }

  if (typeof state === 'object' && !state.loyaltySystem) {
    state.loyaltySystem = cloneEmptyLoyaltySystem();
  }

  if (typeof PORTAL_SNAPSHOT_PATH_MAP === 'object') {
    PORTAL_SNAPSHOT_PATH_MAP['data/loyalty_system.json'] = 'loyalty_system';
  }

  if (typeof LAZY_DATA_LOADERS === 'object' && typeof LAZY_DATA_LOADERS.iuDrr === 'function') {
    const originalIuDrrLoader = LAZY_DATA_LOADERS.iuDrr;
    LAZY_DATA_LOADERS.iuDrr = async function loyaltyAwareIuDrrLoader() {
      await originalIuDrrLoader();
      const payload = await loadJsonOrFallback(
        'data/loyalty_system.json',
        cloneEmptyLoyaltySystem(),
        'Система лояльности'
      );
      state.loyaltySystem = payload && typeof payload === 'object' ? payload : cloneEmptyLoyaltySystem();
    };
  }

  if (typeof renderIuDrr === 'function') {
    const originalRenderIuDrr = renderIuDrr;
    renderIuDrr = function patchedRenderIuDrr(rootId = 'view-iu-drr') {
      const filters = getLoyaltyFilters();
      if (filters.tab === 'loyalty') {
        renderLoyaltySystem(rootId);
        return;
      }
      originalRenderIuDrr(rootId);
      insertIuDrrTabs(document.getElementById(rootId));
    };
  }
})();
