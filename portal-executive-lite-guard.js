(function () {
  if (window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN5__) return;
  window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN5__ = true;

  const VERSION = '20260516execlean5';
  const KEYS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product', 'cross'];
  const META = {
    wb: { label: 'WB', title: 'РОП WB' },
    ozon: { label: 'Ozon', title: 'РОП Ozon' },
    ya: { label: 'Я.Маркет', title: 'Яндекс Маркет' },
    goldapple: { label: 'ЗЯ', title: 'Золотое яблоко' },
    letu: { label: "Л'Этуаль", title: "Л'Этуаль" },
    magnit: { label: 'Магнит', title: 'Магнит Маркет' },
    product: { label: 'Продукт', title: 'Продукт / новинки' },
    cross: { label: 'Общее', title: 'Общий контур' }
  };

  let queued = false;
  let rendering = false;
  let observer = null;

  function state() { return window.__alteaAppState || window.state || {}; }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }
  function fmt(value) { return new Intl.NumberFormat('ru-RU').format(Number(value) || 0); }
  function badge(text, tone) { return `<span class="badge ${tone || ''}">${esc(text)}</span>`; }

  function activeTasks() {
    try {
      if (typeof window.getControlSnapshot === 'function') {
        const snapshot = window.getControlSnapshot();
        if (Array.isArray(snapshot?.active)) return snapshot.active;
      }
    } catch {}
    const app = state();
    const tasks = app.storage?.tasks || app.tasks || [];
    return Array.isArray(tasks) ? tasks.filter((task) => !['done', 'cancelled'].includes(String(task?.status || ''))) : [];
  }

  function skuFor(task) {
    try { return typeof window.getSku === 'function' ? window.getSku(task?.articleKey) : null; }
    catch { return null; }
  }

  function platformKey(task) {
    const sku = skuFor(task);
    try {
      if (typeof window.controlWorkstreamKey === 'function') {
        const key = window.controlWorkstreamKey(task, sku);
        if (META[key]) return key;
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

  function overdue(task) {
    try { if (typeof window.isTaskOverdue === 'function') return Boolean(window.isTaskOverdue(task)); }
    catch {}
    if (!task?.due) return false;
    const due = new Date(`${task.due}T23:59:59`);
    return Number.isFinite(due.getTime()) && due < new Date();
  }

  function rowFor(key, tasks) {
    const items = tasks.filter((task) => platformKey(task) === key);
    const late = items.filter(overdue);
    const critical = items.filter((task) => task?.priority === 'critical');
    const rop = items.filter((task) => task?.status === 'waiting_rop');
    const final = items.filter((task) => task?.status === 'waiting_decision');
    const noOwner = items.filter((task) => !task?.owner);
    const risk = late.length * 4 + critical.length * 3 + final.length * 2 + rop.length + noOwner.length;
    return { key, items, late, critical, rop, final, noOwner, risk };
  }

  function signature(tasks) {
    return tasks.map((task) => [task?.id || task?.articleKey || '', task?.status || '', task?.priority || '', task?.owner || '', task?.due || '', task?.platform || ''].join(':')).join('|');
  }

  function card(row) {
    const meta = META[row.key] || META.cross;
    const tone = row.late.length || row.critical.length ? 'danger' : row.final.length || row.noOwner.length ? 'warn' : row.rop.length ? 'info' : row.items.length ? 'info' : 'ok';
    const status = row.late.length ? `${fmt(row.late.length)} проср.`
      : row.critical.length ? `${fmt(row.critical.length)} крит.`
        : row.final.length ? `${fmt(row.final.length)} финал`
          : row.rop.length ? `${fmt(row.rop.length)} у РОПа`
            : row.items.length ? `${fmt(row.items.length)} актив.` : 'чисто';
    return `<button class="executive-lite-card ${row.risk ? 'has-risk' : ''} ${row.items.length ? '' : 'is-empty'}" type="button" data-executive-lite-open="${esc(row.key)}"><span class="executive-lite-card-top"><span>${esc(meta.title)}</span>${badge(status, tone)}</span><strong>${esc(meta.label)}</strong><span class="executive-lite-metrics"><span><b>${fmt(row.items.length)}</b> активных</span><span><b>${fmt(row.rop.length)}</b> у РОПа</span><span><b>${fmt(row.final.length)}</b> финал</span><span><b>${fmt(row.noOwner.length)}</b> без owner</span></span></button>`;
  }

  function taskCard(task) {
    const priority = task?.priority === 'critical' ? 'Критично' : task?.priority === 'high' ? 'Высокий' : 'Средний';
    return `<button class="executive-lite-task ${overdue(task) ? 'is-overdue' : ''}" type="button" data-executive-lite-task="${esc(task?.id || '')}"><strong>${esc(task?.title || task?.entityLabel || task?.articleKey || 'Задача')}</strong><span>${esc(task?.owner || 'без owner')} · ${esc(task?.due || 'без срока')}</span><em>${esc(priority)}</em></button>`;
  }

  function styles() {
    if (document.getElementById('executive-lite-guard-style')) return;
    const style = document.createElement('style');
    style.id = 'executive-lite-guard-style';
    style.textContent = `#view-executive[data-executive-layer]{display:flex;flex-direction:column;gap:14px}#view-executive[data-executive-layer] [data-portal-view-guide],#view-executive[data-executive-layer] .portal-view-guide,#view-executive[data-executive-layer] .executive-guide{display:none!important}#view-executive[data-executive-layer] .section-title.executive-lite-title{margin-bottom:0}.executive-lite-copy{margin-top:8px;color:var(--muted);line-height:1.45;max-width:960px}.executive-lite-surface,.executive-lite-focus{border:1px solid rgba(212,164,74,.2);border-radius:12px;background:rgba(255,255,255,.025);padding:14px}.executive-lite-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.executive-lite-head span{display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted)}.executive-lite-head strong{display:block;margin-top:3px;color:#fff7e6;font-size:18px;line-height:1.15}.executive-lite-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.executive-lite-card{display:flex;flex-direction:column;gap:9px;min-height:132px;text-align:left;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(0,0,0,.22);color:inherit;padding:12px;cursor:pointer}.executive-lite-card:hover{border-color:rgba(212,164,74,.46);background:rgba(212,164,74,.06)}.executive-lite-card.has-risk{border-color:rgba(212,164,74,.34);background:rgba(212,164,74,.055)}.executive-lite-card.is-empty{opacity:.68}.executive-lite-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;font-size:11px;color:var(--muted)}.executive-lite-card>strong{font-size:18px;line-height:1.1;color:#fff7e6}.executive-lite-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:auto}.executive-lite-metrics span{border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(0,0,0,.18);padding:7px;font-size:11px;color:var(--muted)}.executive-lite-metrics b{display:block;color:#fff7e6;font-size:15px;line-height:1}.executive-lite-task-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.executive-lite-task{text-align:left;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(0,0,0,.18);padding:12px;color:inherit;cursor:pointer}.executive-lite-task.is-overdue{border-color:rgba(217,83,79,.42);background:rgba(217,83,79,.08)}.executive-lite-task strong{display:block;color:#fff7e6;line-height:1.25}.executive-lite-task span{display:block;margin-top:6px;font-size:12px;color:var(--muted)}.executive-lite-task em{display:inline-block;margin-top:9px;font-style:normal;font-size:11px;border:1px solid rgba(212,164,74,.25);border-radius:999px;padding:4px 8px;color:#f3dfad}@media (max-width:1280px){.executive-lite-grid,.executive-lite-task-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:820px){.executive-lite-grid,.executive-lite-task-grid{grid-template-columns:1fr}.executive-lite-head{flex-direction:column}}`;
    document.head.appendChild(style);
  }

  function render() {
    const root = document.getElementById('view-executive');
    if (!root) return;
    const tasks = activeTasks();
    const sig = signature(tasks);
    const oldText = root.textContent || '';
    const stale = root.dataset.executiveLayer !== VERSION
      || root.dataset.executiveSignature !== sig
      || !root.querySelector('[data-executive-lite-panel]')
      || oldText.includes('очередь директора')
      || oldText.includes('очередь руководителя')
      || oldText.includes('общий уровень риска');
    if (!stale) return;

    const rows = KEYS.map((key) => rowFor(key, tasks));
    const focus = tasks.filter((task) => overdue(task) || task?.priority === 'critical' || task?.status === 'waiting_decision' || task?.status === 'waiting_rop' || !task?.owner).slice(0, 8);
    const final = tasks.filter((task) => task?.status === 'waiting_decision');
    const rop = tasks.filter((task) => task?.status === 'waiting_rop');
    const late = tasks.filter(overdue);
    const noOwner = tasks.filter((task) => !task?.owner);

    rendering = true;
    try {
      root.dataset.executiveLayer = VERSION;
      root.dataset.executiveSignature = sig;
      root.innerHTML = `<div class="section-title executive-lite-title"><div><h2>Руководителю</h2><div class="executive-lite-copy">Сначала площадки: WB, Ozon и остальные контуры. РОП открывает свой список, руководитель видит только финал и риски.</div></div><div class="badge-stack">${badge(`${fmt(final.length)} финал`, final.length ? 'warn' : 'ok')}${badge(`${fmt(rop.length)} у РОПа`, rop.length ? 'info' : 'ok')}</div></div><div class="executive-lite-surface" data-executive-lite-panel><div class="executive-lite-head"><div><span>Площадки</span><strong>Куда смотреть сейчас</strong></div><div class="badge-stack">${badge(`${fmt(tasks.length)} активных`, tasks.length ? 'info' : 'ok')}${badge(`${fmt(late.length)} проср.`, late.length ? 'danger' : 'ok')}${badge(`${fmt(noOwner.length)} без owner`, noOwner.length ? 'warn' : 'ok')}</div></div><div class="executive-lite-grid">${rows.map(card).join('')}</div></div><div class="executive-lite-focus"><div class="executive-lite-head"><div><span>Фокус</span><strong>Что требует решения сегодня</strong></div>${badge(`${fmt(focus.length)} задач`, focus.length ? 'danger' : 'ok')}</div><div class="executive-lite-task-grid">${focus.map(taskCard).join('') || '<div class="empty">Срочных решений нет</div>'}</div></div>`;
      bind(root);
      watch(root);
    } finally {
      rendering = false;
    }
  }

  function bind(root) {
    root.querySelectorAll('[data-executive-lite-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-executive-lite-open') || 'cross';
        const app = state();
        app.controlFilters = app.controlFilters || {};
        Object.assign(app.controlFilters, {
          platform: key,
          peopleRole: ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product'].includes(key) ? key : 'leader',
          status: 'active', horizon: 'all', source: 'all', lazyQueue: 'now'
        });
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

  function active() { return location.hash === '#executive' || state().activeView === 'executive'; }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!active()) return;
      styles();
      render();
    });
  }
  function watch(root) {
    if (observer || typeof MutationObserver !== 'function' || !root) return;
    observer = new MutationObserver(() => { if (!rendering) schedule(); });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  window.__ALTEA_EXECUTIVE_LITE_GUARD_READY__ = VERSION;
  window.renderExecutive = function () { styles(); render(); };
  try { renderExecutive = window.renderExecutive; } catch {}

  window.addEventListener('hashchange', schedule);
  window.addEventListener('altea:viewchange', schedule);
  window.addEventListener('altea:portal-storage-updated', schedule);
  window.addEventListener('load', schedule, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  schedule();
  setTimeout(schedule, 120);
  setTimeout(schedule, 700);
})();
