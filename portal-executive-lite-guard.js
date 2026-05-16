(function () {
  if (window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN3__) return;
  window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN3__ = true;

  const VERSION = '20260516execlean3';
  const PLATFORM_KEYS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product', 'cross'];
  const PLATFORM_META = {
    wb: { label: 'WB', title: 'РОП WB' },
    ozon: { label: 'Ozon', title: 'РОП Ozon' },
    ya: { label: 'Я.Маркет', title: 'Яндекс Маркет' },
    goldapple: { label: 'ЗЯ', title: 'Золотое яблоко' },
    letu: { label: "Л'Этуаль", title: "Л'Этуаль" },
    magnit: { label: 'Магнит', title: 'Магнит Маркет' },
    product: { label: 'Продукт', title: 'Продукт / новинки' },
    cross: { label: 'Общее', title: 'Общий контур' }
  };

  let scheduled = false;
  let rendering = false;
  let observer = null;

  function appState() {
    return window.__alteaAppState || window.state || {};
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function fmt(value) {
    return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
  }

  function badge(text, tone) {
    return `<span class="badge ${tone || ''}">${escapeHtml(text)}</span>`;
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

  function skuFor(task) {
    try {
      return typeof window.getSku === 'function' ? window.getSku(task?.articleKey) : null;
    } catch {
      return null;
    }
  }

  function platformKey(task) {
    const sku = skuFor(task);
    try {
      if (typeof window.controlWorkstreamKey === 'function') {
        const key = window.controlWorkstreamKey(task, sku);
        if (PLATFORM_META[key]) return key;
      }
    } catch {}

    const raw = String(task?.platform || sku?.platform || sku?.marketplace || '').toLowerCase();
    if (raw.includes('ozon')) return 'ozon';
    if (raw.includes('wb') || raw.includes('wild')) return 'wb';
    if (raw.includes('yandex') || raw.includes('янд') || raw.includes('ya')) return 'ya';
    if (raw.includes('gold') || raw.includes('золот')) return 'goldapple';
    if (raw.includes('лет') || raw.includes('letu')) return 'letu';
    if (raw.includes('magnit') || raw.includes('магнит')) return 'magnit';
    if (raw.includes('product') || raw.includes('новин')) return 'product';
    return task?.articleKey ? 'product' : 'cross';
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

  function taskOwner(task) {
    return task?.owner || 'без owner';
  }

  function rowFor(key, tasks) {
    const items = tasks.filter((task) => platformKey(task) === key);
    const overdue = items.filter(isOverdue);
    const critical = items.filter((task) => task?.priority === 'critical');
    const waitingRop = items.filter((task) => task?.status === 'waiting_rop');
    const waitingFinal = items.filter((task) => task?.status === 'waiting_decision');
    const noOwner = items.filter((task) => !task?.owner);
    const risk = overdue.length * 4 + critical.length * 3 + waitingFinal.length * 2 + waitingRop.length + noOwner.length;
    return { key, items, overdue, critical, waitingRop, waitingFinal, noOwner, risk };
  }

  function dataSignature(tasks) {
    return tasks.map((task) => [
      task?.id || task?.articleKey || '',
      task?.status || '',
      task?.priority || '',
      task?.owner || '',
      task?.due || '',
      task?.platform || ''
    ].join(':')).join('|');
  }

  function platformCard(row) {
    const meta = PLATFORM_META[row.key] || PLATFORM_META.cross;
    const tone = row.overdue.length || row.critical.length ? 'danger'
      : row.waitingFinal.length || row.noOwner.length ? 'warn'
        : row.waitingRop.length ? 'info'
          : row.items.length ? 'info' : 'ok';
    const status = row.overdue.length ? `${fmt(row.overdue.length)} проср.`
      : row.critical.length ? `${fmt(row.critical.length)} крит.`
        : row.waitingFinal.length ? `${fmt(row.waitingFinal.length)} финал`
          : row.waitingRop.length ? `${fmt(row.waitingRop.length)} у РОПа`
            : row.items.length ? `${fmt(row.items.length)} актив.` : 'чисто';

    return `
      <button class="executive-lite-card ${row.risk ? 'has-risk' : ''} ${row.items.length ? '' : 'is-empty'}" type="button" data-executive-lite-open="${escapeHtml(row.key)}">
        <span class="executive-lite-card-top"><span>${escapeHtml(meta.title)}</span>${badge(status, tone)}</span>
        <strong>${escapeHtml(meta.label)}</strong>
        <span class="executive-lite-metrics">
          <span><b>${fmt(row.items.length)}</b> активных</span>
          <span><b>${fmt(row.waitingRop.length)}</b> у РОПа</span>
          <span><b>${fmt(row.waitingFinal.length)}</b> финал</span>
          <span><b>${fmt(row.noOwner.length)}</b> без owner</span>
        </span>
      </button>`;
  }

  function taskCard(task) {
    const overdue = isOverdue(task);
    const priority = task?.priority === 'critical' ? 'Критично' : task?.priority === 'high' ? 'Высокий' : 'Средний';
    return `
      <button class="executive-lite-task ${overdue ? 'is-overdue' : ''}" type="button" data-executive-lite-task="${escapeHtml(task?.id || '')}">
        <strong>${escapeHtml(taskTitle(task))}</strong>
        <span>${escapeHtml(taskOwner(task))} · ${escapeHtml(task?.due || 'без срока')}</span>
        <em>${escapeHtml(priority)}</em>
      </button>`;
  }

  function bind(root) {
    root.querySelectorAll('[data-executive-lite-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-executive-lite-open') || 'cross';
        const state = appState();
        state.controlFilters = state.controlFilters || {};
        state.controlFilters.platform = key;
        state.controlFilters.peopleRole = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product'].includes(key) ? key : 'leader';
        state.controlFilters.status = 'active';
        state.controlFilters.horizon = 'all';
        state.controlFilters.source = 'all';
        state.controlFilters.lazyQueue = 'now';
        if (typeof window.setView === 'function') window.setView('control');
        else window.location.hash = '#control';
      });
    });

    root.querySelectorAll('[data-executive-lite-task]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-executive-lite-task');
        if (id && typeof window.renderTaskModal === 'function') window.renderTaskModal(id);
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('executive-lite-guard-style')) return;
    const style = document.createElement('style');
    style.id = 'executive-lite-guard-style';
    style.textContent = `
      #view-executive[data-executive-layer]{display:flex;flex-direction:column;gap:14px}
      #view-executive[data-executive-layer] .section-title.executive-lite-title{margin-bottom:0}
      .executive-lite-copy{margin-top:8px;color:var(--muted);line-height:1.45;max-width:960px}
      .executive-lite-surface,.executive-lite-focus{border:1px solid rgba(212,164,74,.2);border-radius:12px;background:rgba(255,255,255,.025);padding:14px}
      .executive-lite-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .executive-lite-head span{display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted)}
      .executive-lite-head strong{display:block;margin-top:3px;color:#fff7e6;font-size:18px;line-height:1.15}
      .executive-lite-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .executive-lite-card{display:flex;flex-direction:column;gap:9px;min-height:132px;text-align:left;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(0,0,0,.22);color:inherit;padding:12px;cursor:pointer}
      .executive-lite-card:hover{border-color:rgba(212,164,74,.46);background:rgba(212,164,74,.06)}
      .executive-lite-card.has-risk{border-color:rgba(212,164,74,.34);background:rgba(212,164,74,.055)}
      .executive-lite-card.is-empty{opacity:.68}
      .executive-lite-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;font-size:11px;color:var(--muted)}
      .executive-lite-card>strong{font-size:18px;line-height:1.1;color:#fff7e6}
      .executive-lite-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:auto}
      .executive-lite-metrics span{border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(0,0,0,.18);padding:7px;font-size:11px;color:var(--muted)}
      .executive-lite-metrics b{display:block;color:#fff7e6;font-size:15px;line-height:1}
      .executive-lite-task-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .executive-lite-task{text-align:left;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(0,0,0,.18);padding:12px;color:inherit;cursor:pointer}
      .executive-lite-task.is-overdue{border-color:rgba(217,83,79,.42);background:rgba(217,83,79,.08)}
      .executive-lite-task strong{display:block;color:#fff7e6;line-height:1.25}
      .executive-lite-task span{display:block;margin-top:6px;font-size:12px;color:var(--muted)}
      .executive-lite-task em{display:inline-block;margin-top:9px;font-style:normal;font-size:11px;border:1px solid rgba(212,164,74,.25);border-radius:999px;padding:4px 8px;color:#f3dfad}
      @media (max-width:1280px){.executive-lite-grid,.executive-lite-task-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (max-width:820px){.executive-lite-grid,.executive-lite-task-grid{grid-template-columns:1fr}.executive-lite-head{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function renderNow(force) {
    const root = document.getElementById('view-executive');
    if (!root) return;

    const tasks = activeTasks();
    const signature = dataSignature(tasks);
    const oldText = root.textContent || '';
    const stale = force
      || root.dataset.executiveLayer !== VERSION
      || root.dataset.executiveSignature !== signature
      || !root.querySelector('[data-executive-lite-panel]')
      || root.querySelector('[data-portal-view-guide], .portal-view-guide, .executive-guide')
      || oldText.includes('очередь директора')
      || oldText.includes('очередь руководителя')
      || oldText.includes('общий уровень риска');

    if (!stale) return;

    const rows = PLATFORM_KEYS.map((key) => rowFor(key, tasks));
    const focus = tasks
      .filter((task) => isOverdue(task) || task?.priority === 'critical' || task?.status === 'waiting_decision' || task?.status === 'waiting_rop' || !task?.owner)
      .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || Number(b?.priority === 'critical') - Number(a?.priority === 'critical'))
      .slice(0, 8);
    const waitingFinal = tasks.filter((task) => task?.status === 'waiting_decision');
    const waitingRop = tasks.filter((task) => task?.status === 'waiting_rop');
    const overdue = tasks.filter(isOverdue);
    const noOwner = tasks.filter((task) => !task?.owner);

    rendering = true;
    try {
      root.dataset.executiveLayer = VERSION;
      root.dataset.executiveSignature = signature;
      root.innerHTML = `
        <div class="section-title executive-lite-title">
          <div>
            <h2>Руководителю</h2>
            <div class="executive-lite-copy">Сначала площадки: WB, Ozon и остальные контуры. РОП открывает свой список, руководитель видит только финал и риски.</div>
          </div>
          <div class="badge-stack">${badge(`${fmt(waitingFinal.length)} финал`, waitingFinal.length ? 'warn' : 'ok')}${badge(`${fmt(waitingRop.length)} у РОПа`, waitingRop.length ? 'info' : 'ok')}</div>
        </div>
        <div class="executive-lite-surface" data-executive-lite-panel>
          <div class="executive-lite-head">
            <div>
              <span>Площадки</span>
              <strong>Куда смотреть сейчас</strong>
            </div>
            <div class="badge-stack">${badge(`${fmt(tasks.length)} активных`, tasks.length ? 'info' : 'ok')}${badge(`${fmt(overdue.length)} проср.`, overdue.length ? 'danger' : 'ok')}${badge(`${fmt(noOwner.length)} без owner`, noOwner.length ? 'warn' : 'ok')}</div>
          </div>
          <div class="executive-lite-grid">${rows.map(platformCard).join('')}</div>
        </div>
        <div class="executive-lite-focus">
          <div class="executive-lite-head">
            <div>
              <span>Фокус</span>
              <strong>Что требует решения сегодня</strong>
            </div>
            ${badge(`${fmt(focus.length)} задач`, focus.length ? 'danger' : 'ok')}
          </div>
          <div class="executive-lite-task-grid">${focus.map(taskCard).join('') || '<div class="empty">Срочных решений нет</div>'}</div>
        </div>`;
      bind(root);
      watch();
    } finally {
      rendering = false;
    }
  }

  function isExecutiveActive() {
    const state = appState();
    return window.location.hash === '#executive' || state.activeView === 'executive';
  }

  function schedule(force) {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      if (!isExecutiveActive()) return;
      injectStyles();
      renderNow(Boolean(force));
    });
  }

  function watch() {
    const root = document.getElementById('view-executive');
    if (!root || typeof MutationObserver !== 'function' || observer) return;
    observer = new MutationObserver(() => {
      if (!rendering) schedule(false);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  window.__ALTEA_EXECUTIVE_LITE_GUARD_READY__ = VERSION;
  window.renderExecutive = function () {
    injectStyles();
    renderNow(true);
  };
  try { renderExecutive = window.renderExecutive; } catch {}

  window.addEventListener('hashchange', () => schedule(true));
  window.addEventListener('altea:viewchange', () => schedule(true));
  window.addEventListener('altea:portal-storage-updated', () => schedule(false));
  window.addEventListener('load', () => schedule(false), { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(false), { once: true });

  schedule(false);
  window.setTimeout(() => schedule(false), 120);
  window.setTimeout(() => schedule(false), 700);
})();
