(function () {
  if (window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN11__) return;
  window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN11__ = true;

  const VERSION = '20260516execlean11';
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
  let renderApi = null;

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
    ].join(':')).sort().join('|');
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

  function taskRiskScore(task) {
    return (isOverdue(task) ? 80 : 0)
      + (task?.priority === 'critical' ? 45 : 0)
      + (task?.status === 'waiting_decision' ? 28 : 0)
      + (task?.status === 'waiting_rop' ? 18 : 0)
      + (!task?.owner ? 12 : 0);
  }

  function focusPlatformGroup(row, focusItems) {
    const meta = PLATFORM_META[row.key] || PLATFORM_META.cross;
    const items = focusItems
      .filter((task) => platformKey(task) === row.key)
      .sort((left, right) => taskRiskScore(right) - taskRiskScore(left) || String(left?.due || '9999-12-31').localeCompare(String(right?.due || '9999-12-31')));
    if (!items.length) return '';
    const shown = items.slice(0, 4);
    const hidden = Math.max(0, items.length - shown.length);
    const tone = row.overdue.length || row.critical.length ? 'danger'
      : row.waitingFinal.length || row.waitingRop.length || row.noOwner.length ? 'warn'
        : 'info';
    return `
      <section class="executive-lite-focus-group">
        <div class="executive-lite-focus-group-head">
          <div>
            <span>${escapeHtml(meta.title)}</span>
            <strong>${escapeHtml(meta.label)}</strong>
          </div>
          <div class="badge-stack">
            ${badge(`${fmt(items.length)} задач`, tone)}
            ${row.overdue.length ? badge(`${fmt(row.overdue.length)} проср.`, 'danger') : ''}
            ${row.noOwner.length ? badge(`${fmt(row.noOwner.length)} без owner`, 'warn') : ''}
          </div>
        </div>
        <div class="executive-lite-task-list">${shown.map(taskCard).join('')}${hidden ? `<div class="executive-lite-more">Еще ${fmt(hidden)} в этом контуре</div>` : ''}</div>
        <button class="btn ghost small-btn" type="button" data-executive-lite-open="${escapeHtml(row.key)}">Открыть контур</button>
      </section>
    `;
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

    root.querySelector('[data-executive-lite-create]')?.addEventListener('click', () => {
      const state = appState();
      state.controlFilters = state.controlFilters || {};
      state.controlFilters.platform = state.controlFilters.platform || 'all';
      state.controlFilters.status = 'active';
      state.controlFilters.horizon = 'all';
      state.controlFilters.source = 'all';
      state.controlFilters.taskLiteCreateOpen = true;
      if (typeof window.setView === 'function') window.setView('control');
      else window.location.hash = '#control';
    });
  }

  function injectStyles() {
    if (document.getElementById('executive-lite-guard-style')) return;
    const style = document.createElement('style');
    style.id = 'executive-lite-guard-style';
    style.textContent = `
      #view-executive[data-executive-layer]{display:flex;flex-direction:column;gap:14px}
      #view-executive[data-executive-layer] [data-portal-view-guide],
      #view-executive[data-executive-layer] .portal-view-guide,
      #view-executive[data-executive-layer] .executive-guide{display:none!important}
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
      .executive-lite-focus-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .executive-lite-focus-group{display:flex;flex-direction:column;gap:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(0,0,0,.18);padding:12px}
      .executive-lite-focus-group-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
      .executive-lite-focus-group-head span{display:block;font-size:11px;color:var(--muted);line-height:1.25}
      .executive-lite-focus-group-head strong{display:block;margin-top:2px;color:#fff7e6;font-size:18px;line-height:1.1}
      .executive-lite-task-list{display:flex;flex-direction:column;gap:8px}
      .executive-lite-more{border:1px dashed rgba(255,255,255,.12);border-radius:8px;padding:8px;color:var(--muted);font-size:12px}
      .executive-lite-task{text-align:left;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(0,0,0,.18);padding:12px;color:inherit;cursor:pointer}
      .executive-lite-task.is-overdue{border-color:rgba(217,83,79,.42);background:rgba(217,83,79,.08)}
      .executive-lite-task strong{display:block;color:#fff7e6;line-height:1.25}
      .executive-lite-task span{display:block;margin-top:6px;font-size:12px;color:var(--muted)}
      .executive-lite-task em{display:inline-block;margin-top:9px;font-style:normal;font-size:11px;border:1px solid rgba(212,164,74,.25);border-radius:999px;padding:4px 8px;color:#f3dfad}
      @media (max-width:1280px){.executive-lite-grid,.executive-lite-task-grid,.executive-lite-focus-board{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (max-width:820px){.executive-lite-grid,.executive-lite-task-grid,.executive-lite-focus-board{grid-template-columns:1fr}.executive-lite-head{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function renderNow(force) {
    const root = document.getElementById('view-executive');
    if (!root) return;

    const tasks = activeTasks();
    const signature = dataSignature(tasks);
    const stale = force
      || root.dataset.executiveLayer !== VERSION
      || root.dataset.executiveSignature !== signature
      || !root.querySelector('[data-executive-lite-panel]');

    if (!stale) return;

    const rows = PLATFORM_KEYS.map((key) => rowFor(key, tasks));
    const focus = tasks
      .filter((task) => isOverdue(task) || task?.priority === 'critical' || task?.status === 'waiting_decision' || task?.status === 'waiting_rop' || !task?.owner)
      .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || Number(b?.priority === 'critical') - Number(a?.priority === 'critical'))
      .slice(0, 24);
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
          <div class="badge-stack"><button class="btn primary" type="button" data-executive-lite-create>Поставить задачу</button>${badge(`${fmt(waitingFinal.length)} финал`, waitingFinal.length ? 'warn' : 'ok')}${badge(`${fmt(waitingRop.length)} у РОПа`, waitingRop.length ? 'info' : 'ok')}</div>
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
              <strong>Что требует решения сегодня по площадкам</strong>
            </div>
            ${badge(`${fmt(focus.length)} задач`, focus.length ? 'danger' : 'ok')}
          </div>
          <div class="executive-lite-focus-board">${rows.map((row) => focusPlatformGroup(row, focus)).join('') || '<div class="empty">Срочных решений нет</div>'}</div>
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

  function installRenderLock() {
    renderApi = function executiveLiteRender() {
      injectStyles();
      renderNow(false);
    };
    renderApi.__alteaExecutiveLite = true;

    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'renderExecutive');
      if (!descriptor || descriptor.configurable) {
        Object.defineProperty(window, 'renderExecutive', {
          configurable: true,
          get() {
            return renderApi;
          },
          set(next) {
            if (next && next.__alteaExecutiveLite) renderApi = next;
          }
        });
      } else {
        window.renderExecutive = renderApi;
      }
    } catch {
      window.renderExecutive = renderApi;
    }

    try { renderExecutive = renderApi; } catch {}
  }

  function restoreRenderApi() {
    if (!renderApi) return;
    try {
      if (window.renderExecutive !== renderApi) window.renderExecutive = renderApi;
    } catch {}
    try {
      if (renderExecutive !== renderApi) renderExecutive = renderApi;
    } catch {}
  }

  window.__ALTEA_EXECUTIVE_LITE_GUARD_READY__ = VERSION;
  installRenderLock();
  restoreRenderApi();

  window.addEventListener('hashchange', () => { restoreRenderApi(); schedule(false); });
  window.addEventListener('altea:viewchange', () => { restoreRenderApi(); schedule(false); });
  window.addEventListener('altea:portal-storage-updated', () => { restoreRenderApi(); schedule(false); });
  window.addEventListener('load', () => { restoreRenderApi(); schedule(false); }, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(false), { once: true });

  schedule(false);
  [60, 180, 420, 900, 1800, 3600, 7000].forEach((delay) => window.setTimeout(restoreRenderApi, delay));
  window.setTimeout(() => schedule(false), 120);
  window.setTimeout(() => schedule(false), 700);
})();
