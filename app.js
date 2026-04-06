const state = {
  dashboard: null,
  skus: [],
  launches: [],
  meetings: [],
  storage: { comments: [], tasks: [] },
  filters: { search: '', segment: 'all', focus: 'all' },
  activeView: 'dashboard',
  activeSku: null
};

const STORAGE_KEY = 'brand-portal-local-v1';

const fmt = {
  int(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value));
  },
  money(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value));
  },
  pct(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return `${(Number(value) * 100).toFixed(1)}%`;
  },
  num(value, digits = 1) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value));
  },
  text(value) {
    return value === null || value === undefined || value === '' ? '—' : String(value);
  },
  date(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return value;
    }
  }
};

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function linkToSku(articleKey, label) {
  return `<button class="link-btn sku-pill" data-open-sku="${escapeHtml(articleKey)}">${escapeHtml(label || articleKey)}</button>`;
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Не удалось загрузить ${path}`);
  return res.json();
}

function loadLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { comments: [], tasks: [] };
    const parsed = JSON.parse(raw);
    return {
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
    };
  } catch {
    return { comments: [], tasks: [] };
  }
}

function saveLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.storage));
}

function mergeSeedStorage(seed) {
  const existingComments = new Set(state.storage.comments.map(c => `${c.articleKey}|${c.author}|${c.createdAt}|${c.text}`));
  const existingTasks = new Set(state.storage.tasks.map(t => `${t.articleKey}|${t.owner}|${t.due}|${t.title}`));
  for (const c of seed.comments || []) {
    const key = `${c.articleKey}|${c.author}|${c.createdAt}|${c.text}`;
    if (!existingComments.has(key)) state.storage.comments.push(c);
  }
  for (const t of seed.tasks || []) {
    const key = `${t.articleKey}|${t.owner}|${t.due}|${t.title}`;
    if (!existingTasks.has(key)) state.storage.tasks.push(t);
  }
  saveLocalStorage();
}

function scoreChip(score) {
  if (score >= 5) return `<span class="chip danger">Фокус ${score}</span>`;
  if (score >= 4) return `<span class="chip warn">Фокус ${score}</span>`;
  if (score >= 2) return `<span class="chip info">Наблюдать ${score}</span>`;
  return `<span class="chip">База ${score}</span>`;
}

function badge(text, kind = '') {
  return `<span class="chip ${kind}">${escapeHtml(text)}</span>`;
}

function marginBadge(label, value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return badge(`${label} —`);
  return badge(`${label} ${fmt.pct(value)}`, Number(value) < 0 ? 'danger' : 'ok');
}

function priorityBadges(sku) {
  const parts = [];
  if (sku?.flags?.toWork) parts.push(`<span class="chip danger">В работу</span>`);
  if (sku?.flags?.negativeMargin) parts.push(`<span class="chip danger">Маржа < 0</span>`);
  parts.push(scoreChip(sku?.focusScore || 0));
  return `<div class="badge-stack">${parts.join('')}</div>`;
}

function getSku(articleKey) {
  return state.skus.find(x => x.articleKey === articleKey || x.article === articleKey) || null;
}

function getSkuComments(articleKey) {
  return state.storage.comments.filter(c => c.articleKey === articleKey).sort((a,b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getSkuTasks(articleKey) {
  return state.storage.tasks.filter(t => t.articleKey === articleKey).sort((a,b) => (a.due || '').localeCompare(b.due || ''));
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelector(`#view-${view}`)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  if (view === 'dashboard') renderDashboard();
  if (view === 'skus') renderSkuRegistry();
  if (view === 'launches') renderLaunches();
  if (view === 'meetings') renderMeetings();
}


function renderDashboard() {
  const root = document.getElementById('view-dashboard');
  const cards = state.dashboard.cards.map(card => `
    <div class="card kpi">
      <div class="label">${escapeHtml(card.label)}</div>
      <div class="value">${typeof card.value === 'number' && card.label.includes('₽') ? fmt.money(card.value) : fmt.int(card.value)}</div>
      <div class="hint">${escapeHtml(card.hint)}</div>
    </div>
  `).join('');

  const brandRows = state.dashboard.brandSummary.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.brand || '—')}</strong></td>
      <td>${fmt.int(row.sku_count)}</td>
      <td>${fmt.int(row.total_stock)}</td>
      <td>${fmt.money(row.orders_value)}</td>
      <td>${fmt.int(row.feb_plan_units)}</td>
      <td>${fmt.int(row.feb_fact_units)}</td>
      <td>${fmt.pct(row.plan_completion_feb26_pct)}</td>
      <td>${fmt.int(row.returns_units)}</td>
      <td>${fmt.int(row.negative_margin_sku)}</td>
      <td>${fmt.int(row.to_work_sku)}</td>
    </tr>
  `).join('');

  const focusRows = state.dashboard.focusTop.map(row => {
    const work = String(row.focus_reasons || '').includes('В работе');
    return `
      <tr>
        <td>${linkToSku(row.article, row.article)}</td>
        <td><div><strong>${escapeHtml(row.product_name_final || 'Без названия')}</strong></div><div class="muted small">${escapeHtml(row.focus_reasons || '—')}</div></td>
        <td><div class="badge-stack">${work ? '<span class="chip danger">В работу</span>' : ''}${scoreChip(row.focus_score || 0)}</div></td>
        <td>${fmt.pct(row.plan_completion_feb26_pct)}</td>
        <td>${fmt.int(row.total_mp_stock)}</td>
        <td>${row.content_romi == null ? '—' : fmt.num(row.content_romi, 1)}</td>
      </tr>
    `;
  }).join('');

  const toWork = (state.dashboard.toWork || []).map(row => `
    <div class="list-item">
      <div class="head">
        <div>
          <div><strong>${linkToSku(row.article, row.product_name_final || row.article)}</strong></div>
          <div class="muted small">${escapeHtml(row.brand || 'Алтея')}</div>
        </div>
        ${badge(fmt.pct(row.plan_completion_feb26_pct), 'danger')}
      </div>
      <div class="badge-stack">
        <span class="chip danger">В работу</span>
        ${marginBadge('WB', row.wb_margin_pct)}
        ${marginBadge('Ozon', row.ozon_margin_pct)}
        ${badge(`Остаток ${fmt.int(row.total_mp_stock)} шт.`, row.total_mp_stock <= 50 ? 'warn' : '')}
      </div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(row.focus_reasons || 'Ниже плана и отрицательная маржа')}</div>
    </div>
  `).join('');

  const topContent = state.dashboard.topContent.map(row => `
    <div class="list-item">
      <div class="head">
        <div>
          <div><strong>${linkToSku(row.article, row.product_name_final || row.article)}</strong></div>
          <div class="muted small">${escapeHtml(row.brand || '—')} · ${escapeHtml(row.article)}</div>
        </div>
        ${badge(`ROMI ${fmt.num(row.content_romi, 1)}`, row.content_romi >= 300 ? 'ok' : 'info')}
      </div>
      <div class="badge-stack">
        ${badge(`Доход ${fmt.money(row.content_income)}`)}
        ${badge(`Выручка ${fmt.money(row.content_revenue)}`)}
        ${badge(`Публикации ${fmt.int(row.content_posts)}`)}
        ${badge(`Клики ${fmt.int(row.content_clicks)}`)}
      </div>
    </div>
  `).join('');

  const lowStock = state.dashboard.lowStock.map(row => `
    <div class="list-item">
      <div class="head">
        <div>
          <div><strong>${linkToSku(row.article, row.product_name_final || row.article)}</strong></div>
          <div class="muted small">${escapeHtml(row.brand || '—')}</div>
        </div>
        ${badge(`Всего ${fmt.int(row.total_mp_stock)} шт.`, row.total_mp_stock <= 10 ? 'danger' : 'warn')}
      </div>
      <div class="badge-stack">
        ${badge(`WB ${fmt.int(row.wb_stock)}`)}
        ${badge(`Ozon ${fmt.int(row.ozon_stock_final)}`)}
        ${badge(`В пути ${fmt.int(row.ozon_in_transit)}`)}
      </div>
    </div>
  `).join('');

  const underPlan = state.dashboard.underPlan.map(row => {
    const percent = row.plan_completion_feb26_pct;
    const bar = Math.max(2, Math.min(100, Math.round((percent || 0) * 100)));
    return `
      <div class="list-item">
        <div class="head">
          <div>
            <div><strong>${linkToSku(row.article, row.product_name_final || row.article)}</strong></div>
            <div class="muted small">${escapeHtml(row.brand || '—')}</div>
          </div>
          <div class="badge-stack">
            ${row.negative_margin_flag ? '<span class="chip danger">Маржа < 0</span>' : ''}
            ${badge(fmt.pct(percent), percent < .4 ? 'danger' : 'warn')}
          </div>
        </div>
        <div class="metric">
          <strong>План / факт Feb 2026</strong>
          <div class="bar"><span style="width:${bar}%"></span></div>
          <span>${fmt.int(row.fact_feb26_units)} / ${fmt.int(row.plan_feb26_units)}</span>
        </div>
      </div>
    `;
  }).join('');

  const topReturns = state.dashboard.topReturns.map(row => `
    <div class="list-item">
      <div class="head">
        <div>
          <div><strong>${linkToSku(row.article, row.product_name_final || row.article)}</strong></div>
          <div class="muted small">${escapeHtml(row.brand || '—')}</div>
        </div>
        ${badge(`${fmt.int(row.returns_units)} шт.`, row.returns_units >= 100 ? 'danger' : 'warn')}
      </div>
      <div class="muted small">${escapeHtml(row.top_return_reason || 'Причина не указана')}</div>
    </div>
  `).join('');

  root.innerHTML = `
    <div class="banner">
      <div>⚠️</div>
      <div>
        <strong>Altea · GitHub Pages MVP</strong>
        Эта версия уже отфильтрована только по бренду Алтея. Общие комментарии пока хранятся локально в браузере; для общей истории нужен backend.
      </div>
    </div>

    <div class="section-title">
      <div>
        <h2>Обзор бренда Алтея</h2>
        <p>Собрано из repricer, план/факт, товаров Ozon, заказов, остатков, возвратов, лидерборда контента и календаря новинок.</p>
      </div>
      <div class="badge-stack">
        <span class="chip info">Только бренд: Алтея</span>
        <span class="chip">Артикулы в работе = ниже плана + отрицательная маржа</span>
      </div>
    </div>

    <div class="grid cards">${cards}</div>

    <div class="section-title">
      <div>
        <h2>Сводка по бренду</h2>
        <p>Один бренд, один контур. Здесь видно объём, выполнение плана, отрицательную маржу и количество SKU в работе.</p>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Бренд</th>
            <th>SKU</th>
            <th>Остатки</th>
            <th>Заказы</th>
            <th>План Feb 26</th>
            <th>Факт Feb 26</th>
            <th>Выполнение</th>
            <th>Возвраты</th>
            <th>Маржа &lt; 0</th>
            <th>В работе</th>
          </tr>
        </thead>
        <tbody>${brandRows || `<tr><td colspan="10" class="text-center muted">Нет данных</td></tr>`}</tbody>
      </table>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>SKU в работе</h3>
        <p class="small muted">Берём в работу артикулы, которые отстают от плана и при этом дают отрицательную маржу.</p>
        <div class="list">${toWork || '<div class="empty">Сейчас нет SKU, которые одновременно ниже плана и в отрицательной марже</div>'}</div>
      </div>
      <div class="card">
        <h3>Фокусные SKU</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Артикул</th>
                <th>SKU</th>
                <th>Приоритет</th>
                <th>Выполнение</th>
                <th>Остатки</th>
                <th>ROMI</th>
              </tr>
            </thead>
            <tbody>${focusRows || `<tr><td colspan="6" class="text-center muted">Нет данных</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Сильный контент</h3>
        <div class="list">${topContent || '<div class="empty">Нет данных</div>'}</div>
      </div>
      <div class="card">
        <h3>Низкие остатки</h3>
        <div class="list">${lowStock || '<div class="empty">Нет данных</div>'}</div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Ниже плана</h3>
        <div class="list">${underPlan || '<div class="empty">Нет данных</div>'}</div>
      </div>
      <div class="card">
        <h3>Возвраты</h3>
        <div class="list">${topReturns || '<div class="empty">Нет данных</div>'}</div>
      </div>
    </div>

    <div class="footer-note">
      Последняя генерация данных: ${escapeHtml(state.dashboard.generatedAt)}. В этой версии бренд уже ограничен только Алтеей.
    </div>
  `;
}


function filteredSkus() {
  return state.skus.filter(sku => {
    const search = state.filters.search.trim().toLowerCase();
    const hay = [sku.article, sku.articleKey, sku.brand, sku.name, sku.category, sku.type].filter(Boolean).join(' ').toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (state.filters.segment !== 'all' && (sku.segment || '—') !== state.filters.segment) return false;
    if (state.filters.focus === 'toWork' && !sku.flags?.toWork) return false;
    if (state.filters.focus === 'focus4' && (sku.focusScore || 0) < 4) return false;
    if (state.filters.focus === 'underPlan' && !sku.flags?.underPlan) return false;
    if (state.filters.focus === 'negativeMargin' && !sku.flags?.negativeMargin) return false;
    if (state.filters.focus === 'lowStock' && !sku.flags?.lowStock) return false;
    if (state.filters.focus === 'highReturn' && !sku.flags?.highReturn) return false;
    return true;
  }).sort((a,b) =>
    Number(Boolean(b.flags?.toWork)) - Number(Boolean(a.flags?.toWork)) ||
    Number(Boolean(b.flags?.negativeMargin)) - Number(Boolean(a.flags?.negativeMargin)) ||
    (b.focusScore || 0) - (a.focusScore || 0) ||
    (a.planFact?.completionFeb26Pct ?? 9) - (b.planFact?.completionFeb26Pct ?? 9) ||
    (b.orders?.value || 0) - (a.orders?.value || 0)
  );
}


function renderSkuRegistry() {
  const root = document.getElementById('view-skus');
  const segments = [...new Set(state.skus.map(s => s.segment || '—'))].sort((a,b) => a.localeCompare(b, 'ru'));
  const rows = filteredSkus().map(sku => `
    <tr>
      <td>${linkToSku(sku.articleKey, sku.article)}</td>
      <td>${escapeHtml(sku.brand || '—')}</td>
      <td>
        <div><strong>${escapeHtml(sku.name || 'Без названия')}</strong></div>
        <div class="muted small">${escapeHtml([sku.category, sku.type].filter(Boolean).join(' · ') || '—')}</div>
      </td>
      <td>${priorityBadges(sku)}</td>
      <td>${fmt.pct(sku.planFact?.completionFeb26Pct)}</td>
      <td>
        <div class="small">WB ${fmt.pct(sku.wb?.marginPct)}</div>
        <div class="small muted">Ozon ${fmt.pct(sku.ozon?.marginPct)}</div>
      </td>
      <td>${fmt.int((sku.wb?.stock || 0) + (sku.ozon?.stock || 0))}</td>
      <td>${sku.content?.romi == null ? '—' : fmt.num(sku.content.romi, 1)}</td>
      <td>${escapeHtml(sku.focusReasons || '—')}</td>
    </tr>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Реестр SKU · Алтея</h2>
        <p>Одна строка = один артикул Алтея. Приоритет в работе — те, кто ниже плана и одновременно уходит в отрицательную маржу.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(filteredSkus().length)} SKU`)}
        ${badge('Только Алтея', 'info')}
      </div>
    </div>

    <div class="filters filters-altea">
      <input id="skuSearchInput" placeholder="Поиск по артикулу, названию, категории…" value="${escapeHtml(state.filters.search)}">
      <select id="skuSegmentFilter">
        <option value="all">Все сегменты</option>
        ${segments.map(s => `<option value="${escapeHtml(s)}" ${state.filters.segment === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
      </select>
      <select id="skuFocusFilter">
        <option value="all" ${state.filters.focus === 'all' ? 'selected' : ''}>Все SKU</option>
        <option value="toWork" ${state.filters.focus === 'toWork' ? 'selected' : ''}>В работе: план &lt; 80% + маржа &lt; 0</option>
        <option value="negativeMargin" ${state.filters.focus === 'negativeMargin' ? 'selected' : ''}>Отрицательная маржа</option>
        <option value="underPlan" ${state.filters.focus === 'underPlan' ? 'selected' : ''}>Ниже плана</option>
        <option value="focus4" ${state.filters.focus === 'focus4' ? 'selected' : ''}>Фокус score ≥ 4</option>
        <option value="lowStock" ${state.filters.focus === 'lowStock' ? 'selected' : ''}>Низкий остаток</option>
        <option value="highReturn" ${state.filters.focus === 'highReturn' ? 'selected' : ''}>Высокие возвраты</option>
      </select>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Артикул</th>
            <th>Бренд</th>
            <th>SKU</th>
            <th>Приоритет</th>
            <th>Выполнение Feb 26</th>
            <th>Маржа WB / Ozon</th>
            <th>Остатки</th>
            <th>ROMI</th>
            <th>Причины</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="9" class="text-center muted">Ничего не найдено</td></tr>`}</tbody>
      </table>
    </div>

    <div class="footer-note">Белый бейдж слева оставил на артикуле. Основной операционный фильтр — «В работе», чтобы сразу отдавать команде проблемные SKU.</div>
  `;

  document.getElementById('skuSearchInput').addEventListener('input', e => { state.filters.search = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuSegmentFilter').addEventListener('change', e => { state.filters.segment = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuFocusFilter').addEventListener('change', e => { state.filters.focus = e.target.value; renderSkuRegistry(); });
}

function commentTypeChip(type) {
  const map = {
    signal: 'info',
    risk: 'danger',
    focus: 'warn',
    idea: 'ok'
  };
  return badge(type || 'comment', map[type] || '');
}

function renderSkuModal(articleKey) {
  const sku = getSku(articleKey);
  if (!sku) return;
  state.activeSku = sku.articleKey;
  const comments = getSkuComments(sku.articleKey);
  const tasks = getSkuTasks(sku.articleKey);

  document.getElementById('skuModalBody').innerHTML = `
    <div class="modal-head">
      <div>
        <h2>${escapeHtml(sku.name || sku.article)}</h2>
        <div class="modal-sub">${escapeHtml([sku.brand, sku.article, sku.category].filter(Boolean).join(' · '))}</div>
        <div class="badge-stack" style="margin-top:12px">
          ${sku.flags?.toWork ? badge('В работу', 'danger') : ''}
          ${sku.flags?.negativeMargin ? badge('Маржа < 0', 'danger') : ''}
          ${scoreChip(sku.focusScore || 0)}
          ${sku.segment ? badge(sku.segment, 'info') : ''}
          ${sku.abc ? badge(`ABC ${sku.abc}`) : ''}
          ${sku.flags?.underPlan ? badge('Ниже плана', 'danger') : ''}
          ${sku.flags?.lowStock ? badge('Низкий остаток', 'warn') : ''}
          ${sku.flags?.highReturn ? badge('Высокие возвраты', 'danger') : ''}
        </div>
      </div>
      <button class="btn" id="closeModalBtn">Закрыть</button>
    </div>

    <div class="modal-grid">
      <div>
        <div class="detail-grid">
          <div class="card">
            <div class="label muted">Остатки MP</div>
            <div class="value">${fmt.int((sku.wb?.stock || 0) + (sku.ozon?.stock || 0))}</div>
            <div class="hint muted">WB ${fmt.int(sku.wb?.stock)} · Ozon ${fmt.int(sku.ozon?.stock)}</div>
          </div>
          <div class="card">
            <div class="label muted">План / факт Feb 2026</div>
            <div class="value">${fmt.pct(sku.planFact?.completionFeb26Pct)}</div>
            <div class="hint muted">${fmt.int(sku.planFact?.factFeb26Units)} / ${fmt.int(sku.planFact?.planFeb26Units)} шт.</div>
          </div>
          <div class="card">
            <div class="label muted">ROMI контента</div>
            <div class="value">${sku.content?.romi == null ? '—' : fmt.num(sku.content.romi, 1)}</div>
            <div class="hint muted">Доход ${fmt.money(sku.content?.income)}</div>
          </div>
          <div class="card">
            <div class="label muted">Возвраты</div>
            <div class="value">${fmt.int(sku.returns?.units)}</div>
            <div class="hint muted">${fmt.int(sku.returns?.count)} отправлений</div>
          </div>
        </div>

        <div class="card" style="margin-top:14px">
          <h3>Платформы и цены</h3>
          <div class="kv">
            <div class="kv-item">
              <div class="k">WB текущая / min / реком.</div>
              <div class="v">${fmt.money(sku.wb?.currentPrice)} / ${fmt.money(sku.wb?.minPrice)} / ${fmt.money(sku.wb?.recPrice)}</div>
              <div class="badge-stack" style="margin-top:10px">
                ${sku.wb?.belowMin ? badge('Ниже min price', 'danger') : badge('В коридоре', 'ok')}
                ${marginBadge('Маржа', sku.wb?.marginPct)}
                ${badge(`Оборач. ${fmt.num(sku.wb?.turnoverDays, 1)} дн.`)}
                ${badge(`Цель ${fmt.num(sku.wb?.targetTurnoverDays, 1)} дн.`)}
              </div>
            </div>
            <div class="kv-item">
              <div class="k">Ozon текущая / min / реком.</div>
              <div class="v">${fmt.money(sku.ozon?.currentPrice)} / ${fmt.money(sku.ozon?.minPrice)} / ${fmt.money(sku.ozon?.recPrice)}</div>
              <div class="badge-stack" style="margin-top:10px">
                ${sku.ozon?.belowMin ? badge('Ниже min price', 'danger') : badge('В коридоре', 'ok')}
                ${marginBadge('Маржа', sku.ozon?.marginPct)}
                ${badge(`Оборач. ${fmt.num(sku.ozon?.turnoverDays, 1)} дн.`)}
                ${badge(`Цель ${fmt.num(sku.ozon?.targetTurnoverDays, 1)} дн.`)}
              </div>
            </div>
            <div class="kv-item">
              <div class="k">Ozon supply</div>
              <div class="v">${fmt.int(sku.ozon?.stockInTransit)} в пути</div>
              <div class="badge-stack" style="margin-top:10px">
                ${badge(`В заявках ${fmt.int(sku.ozon?.stockInSupplyRequest)}`)}
                ${badge(`Возвраты в пути ${fmt.int(sku.returns?.inTransit)}`)}
              </div>
            </div>
            <div class="kv-item">
              <div class="k">Коммерческий контур</div>
              <div class="v">${fmt.money(sku.orders?.value)}</div>
              <div class="badge-stack" style="margin-top:10px">
                ${badge(`Заказы ${fmt.int(sku.orders?.count)}`)}
                ${badge(`Pending ${fmt.int(sku.orders?.pendingCount)}`)}
                ${badge(`Доставляется ${fmt.int(sku.orders?.deliveringCount)}`)}
              </div>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:14px">
          <h3>План / факт и аналитика</h3>
          <div class="kv">
            <div class="kv-item">
              <div class="k">План Feb 2026</div>
              <div class="v">${fmt.int(sku.planFact?.planFeb26Units)} шт.</div>
            </div>
            <div class="kv-item">
              <div class="k">Факт Feb 2026</div>
              <div class="v">${fmt.int(sku.planFact?.factFeb26Units)} шт.</div>
            </div>
            <div class="kv-item">
              <div class="k">План Mar 2026</div>
              <div class="v">${fmt.int(sku.planFact?.planMar26Units)} шт.</div>
            </div>
            <div class="kv-item">
              <div class="k">План Apr 2026</div>
              <div class="v">${fmt.int(sku.planFact?.planApr26Units)} шт.</div>
            </div>
            <div class="kv-item">
              <div class="k">Forecast 6m</div>
              <div class="v">${fmt.int(sku.planFact?.forecast6mUnits)} шт.</div>
            </div>
            <div class="kv-item">
              <div class="k">Net revenue Feb 2026</div>
              <div class="v">${fmt.money(sku.planFact?.factFeb26NetRevenue)}</div>
            </div>
            <div class="kv-item">
              <div class="k">Маржа Feb 2026</div>
              <div class="v">${fmt.pct(sku.planFact?.factFeb26MarginPct)}</div>
            </div>
            <div class="kv-item">
              <div class="k">Revenue total</div>
              <div class="v">${fmt.money(sku.planFact?.factTotalRevenue)}</div>
            </div>
          </div>

          <div class="note" style="margin-top:12px">
            <strong>Причины фокуса:</strong> ${escapeHtml(sku.focusReasons || 'Нет явных триггеров')}
          </div>
        </div>

        <div class="card" style="margin-top:14px">
          <h3>Стратегии repricer</h3>
          <div class="list">
            <div class="list-item">
              <div class="head">
                <strong>WB</strong>
                ${badge(sku.wb?.strategy || '—')}
              </div>
              <div class="muted small">${escapeHtml(sku.wb?.reason || 'Причина не указана')}</div>
            </div>
            <div class="list-item">
              <div class="head">
                <strong>Ozon</strong>
                ${badge(sku.ozon?.strategy || '—')}
              </div>
              <div class="muted small">${escapeHtml(sku.ozon?.reason || 'Причина не указана')}</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <h3>Комментарии по SKU</h3>
          <p class="small">На GitHub Pages эта версия хранит комментарии локально в браузере. Для общей истории комментариев нужен backend.</p>
          <div class="list" id="commentList">
            ${comments.length ? comments.map(c => `
              <div class="list-item">
                <div class="head">
                  <div>
                    <strong>${escapeHtml(c.author || 'Без автора')}</strong>
                    <div class="muted small">${escapeHtml(c.team || '—')} · ${fmt.date(c.createdAt)}</div>
                  </div>
                  ${commentTypeChip(c.type)}
                </div>
                <div>${escapeHtml(c.text || '')}</div>
              </div>
            `).join('') : `<div class="empty">Пока нет комментариев по этому SKU</div>`}
          </div>

          <div style="margin-top:12px">
            <div class="form-grid">
              <input class="input" id="commentAuthor" placeholder="Автор">
              <input class="input" id="commentTeam" placeholder="Команда / отдел">
            </div>
            <div class="form-grid" style="margin-top:10px">
              <select class="input" id="commentType">
                <option value="signal">Signal</option>
                <option value="risk">Risk</option>
                <option value="focus">Focus</option>
                <option value="idea">Idea</option>
              </select>
              <input class="input" id="commentCreatedAt" type="datetime-local">
            </div>
            <textarea class="textarea" id="commentText" placeholder="Что случилось, причина, что делаем, срок, нужна ли помощь?" style="margin-top:10px"></textarea>
            <button class="btn btn-primary" id="addCommentBtn" style="margin-top:10px">Добавить комментарий</button>
          </div>
        </div>

        <div class="card" style="margin-top:14px">
          <h3>Задачи и owner</h3>
          <div class="list" id="taskList">
            ${tasks.length ? tasks.map((t, idx) => `
              <div class="list-item">
                <div class="head">
                  <div>
                    <strong>${escapeHtml(t.title || 'Без названия')}</strong>
                    <div class="muted small">${escapeHtml(t.owner || '—')} · срок ${escapeHtml(t.due || '—')}</div>
                  </div>
                  ${badge(t.status || 'open', t.status === 'done' ? 'ok' : t.status === 'blocked' ? 'danger' : 'warn')}
                </div>
              </div>
            `).join('') : `<div class="empty">Пока нет задач по этому SKU</div>`}
          </div>

          <div style="margin-top:12px">
            <div class="form-grid">
              <input class="input" id="taskTitle" placeholder="Задача">
              <input class="input" id="taskOwner" placeholder="Owner">
            </div>
            <div class="form-grid" style="margin-top:10px">
              <input class="input" id="taskDue" type="date">
              <select class="input" id="taskStatus">
                <option value="open">open</option>
                <option value="done">done</option>
                <option value="blocked">blocked</option>
              </select>
            </div>
            <button class="btn" id="addTaskBtn" style="margin-top:10px">Добавить задачу</button>
          </div>
        </div>

        <div class="card" style="margin-top:14px">
          <h3>Контент и коммерция</h3>
          <div class="badge-stack">
            ${badge(`ROMI ${sku.content?.romi == null ? '—' : fmt.num(sku.content.romi, 1)}`)}
            ${badge(`Доход ${fmt.money(sku.content?.income)}`)}
            ${badge(`Выручка ${fmt.money(sku.content?.revenue)}`)}
            ${badge(`Посты ${fmt.int(sku.content?.posts)}`)}
            ${badge(`Клики ${fmt.int(sku.content?.clicks)}`)}
            ${badge(`Заказы контент ${fmt.int(sku.content?.orders)}`)}
          </div>
          <div class="badge-stack" style="margin-top:10px">
            ${badge(`Отзывы ${fmt.int(sku.reviews)}`)}
            ${badge(`Рейтинг ${fmt.text(sku.rating)}`)}
            ${badge(`Lead time ${fmt.int(sku.leadTimeDays)} дн.`)}
            ${badge(`Юрлицо ${fmt.text(sku.legalEntity)}`)}
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('skuModal').classList.add('open');
  document.getElementById('closeModalBtn').addEventListener('click', closeSkuModal);
  document.getElementById('addCommentBtn').addEventListener('click', addComment);
  document.getElementById('addTaskBtn').addEventListener('click', addTask);

  const dt = document.getElementById('commentCreatedAt');
  const now = new Date();
  dt.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

function closeSkuModal() {
  document.getElementById('skuModal').classList.remove('open');
  state.activeSku = null;
}

function addComment() {
  const articleKey = state.activeSku;
  const author = document.getElementById('commentAuthor').value.trim();
  const team = document.getElementById('commentTeam').value.trim();
  const type = document.getElementById('commentType').value;
  const createdAt = document.getElementById('commentCreatedAt').value || new Date().toISOString();
  const text = document.getElementById('commentText').value.trim();
  if (!text) return alert('Добавь текст комментария');
  state.storage.comments.push({ articleKey, author, team, type, createdAt, text });
  saveLocalStorage();
  renderSkuModal(articleKey);
}

function addTask() {
  const articleKey = state.activeSku;
  const title = document.getElementById('taskTitle').value.trim();
  const owner = document.getElementById('taskOwner').value.trim();
  const due = document.getElementById('taskDue').value;
  const status = document.getElementById('taskStatus').value;
  if (!title) return alert('Добавь название задачи');
  state.storage.tasks.push({ articleKey, title, owner, due, status });
  saveLocalStorage();
  renderSkuModal(articleKey);
}

function renderLaunches() {
  const root = document.getElementById('view-launches');
  const grouped = {};
  for (const item of state.launches) {
    const month = item.launchMonth || 'Без месяца';
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(item);
  }
  const monthOrder = Object.keys(grouped).sort((a,b) => a.localeCompare(b, 'ru'));
  const html = monthOrder.map(month => `
    <div class="month-col">
      <h3>${escapeHtml(month)} <span class="muted">· ${grouped[month].length}</span></h3>
      ${grouped[month].map(item => `
        <div class="launch-card">
          <div class="head">
            <div>
              <strong>${escapeHtml(item.name || 'Без названия')}</strong>
              <div class="muted small">${escapeHtml([item.reportGroup, item.subCategory, item.tag].filter(Boolean).join(' · '))}</div>
            </div>
            ${item.status ? badge(item.status, 'info') : ''}
          </div>
          <div class="badge-stack" style="margin-top:10px">
            ${item.production ? badge(item.production) : ''}
            ${item.plannedRevenue != null ? badge(`План ${fmt.money(item.plannedRevenue)}`, 'warn') : ''}
            ${item.targetCost != null ? badge(`Себест. ${fmt.money(item.targetCost)}`) : ''}
          </div>
          ${item.characteristic ? `<div class="muted small" style="margin-top:10px">${escapeHtml(item.characteristic)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Календарь новинок</h2>
        <p>Основа для пайплайна запуска Алтея: месяц запуска, статус, производство и плановая выручка.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(state.launches.length)} позиций`)}
        ${badge('Источник: календарь новинок', 'info')}
      </div>
    </div>
    <div class="month-groups">${html || '<div class="empty">Нет данных по новинкам</div>'}</div>
  `;
}

function renderMeetings() {
  const root = document.getElementById('view-meetings');
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Рабочий ритм и IBP-контур</h2>
        <p>Этот экран нужен, чтобы портал не был просто витриной цифр. Здесь зашит ритм weekly / monthly / PMR вокруг SKU.</p>
      </div>
    </div>

    <div class="grid">
      ${state.meetings.map(m => `
        <div class="card">
          <div class="head">
            <div>
              <h3>${escapeHtml(m.title)}</h3>
              <div class="muted">${escapeHtml(m.cadence)} · ${escapeHtml(m.duration)}</div>
            </div>
            ${badge(m.id.toUpperCase(), 'info')}
          </div>
          <p style="margin-top:10px">${escapeHtml(m.question)}</p>
          <div class="three-col" style="margin-top:12px">
            <div>
              <strong class="small">Участники</strong>
              <div class="badge-stack" style="margin-top:8px">${m.participants.map(x => badge(x)).join('')}</div>
            </div>
            <div style="grid-column: span 2">
              <strong class="small">Обязательные выходы</strong>
              <div class="list" style="margin-top:8px">
                ${m.outputs.map(x => `<div class="list-item small">${escapeHtml(x)}</div>`).join('')}
              </div>
            </div>
          </div>
        </div>
      `).join('')}

      <div class="card">
        <h3>Что следующий шаг после этого MVP</h3>
        <div class="list">
          <div class="list-item">1. Поднять backend для общих комментариев, задач и прав доступа.</div>
          <div class="list-item">2. Автоматизировать пересборку JSON из выгрузок (скрипт уже лежит в /scripts).</div>
          <div class="list-item">3. Добавить авторизацию сотрудников и журнал решений.</div>
          <div class="list-item">4. Подключить домен и HTTPS в Pages settings.</div>
        </div>
      </div>
    </div>
  `;
}

function exportStorage() {
  const blob = new Blob([JSON.stringify(state.storage, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'portal-comments-and-tasks.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importStorage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state.storage = {
        comments: Array.isArray(parsed.comments) ? parsed.comments : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
      };
      saveLocalStorage();
      if (state.activeSku) renderSkuModal(state.activeSku);
      alert('Импорт завершён');
    } catch {
      alert('Не удалось прочитать JSON');
    }
  };
  reader.readAsText(file);
}

function attachGlobalListeners() {
  document.body.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-open-sku]');
    if (openBtn) {
      renderSkuModal(openBtn.dataset.openSku);
      return;
    }
    const navBtn = e.target.closest('.nav-btn');
    if (navBtn) {
      setView(navBtn.dataset.view);
      return;
    }
    if (e.target.id === 'closeModalBackdrop') closeSkuModal();
  });

  document.getElementById('skuModal').addEventListener('click', (e) => {
    if (e.target.id === 'skuModal') closeSkuModal();
  });

  document.getElementById('exportStorageBtn').addEventListener('click', exportStorage);
  document.getElementById('importStorageInput').addEventListener('change', (e) => {
    const [file] = e.target.files || [];
    if (file) importStorage(file);
  });
}

async function init() {
  try {
    state.storage = loadLocalStorage();
    const [dashboard, skus, launches, meetings, seed] = await Promise.all([
      loadJson('data/dashboard.json'),
      loadJson('data/skus.json'),
      loadJson('data/launches.json'),
      loadJson('data/meetings.json'),
      loadJson('data/seed_comments.json')
    ]);
    state.dashboard = dashboard;
    state.skus = skus;
    state.launches = launches;
    state.meetings = meetings;
    mergeSeedStorage(seed);
    attachGlobalListeners();
    setView('dashboard');
  } catch (error) {
    document.getElementById('appError').classList.remove('hidden');
    document.getElementById('appError').innerHTML = `Ошибка инициализации: ${escapeHtml(error.message)}`;
    console.error(error);
  }
}

init();