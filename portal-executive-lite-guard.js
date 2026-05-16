(function () {
  if (window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516__) return;
  window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516__ = true;

  const VERSION = '20260516execlean2';
  const KEYS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'cross', 'product'];
  const META = {
    wb: { label: 'WB', title: 'РОП WB' },
    ozon: { label: 'Ozon', title: 'РОП Ozon' },
    ya: { label: 'Я.Маркет', title: 'Яндекс Маркет' },
    goldapple: { label: 'ЗЯ', title: 'Золотое яблоко' },
    letu: { label: "Л'Этуаль", title: "Л'Этуаль" },
    magnit: { label: 'Магнит', title: 'Магнит Маркет' },
    cross: { label: 'Общее', title: 'Общий контур' },
    product: { label: 'Продукт', title: 'Продукт / новинки' }
  };

  function state() { return window.__alteaAppState || {}; }
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
    const list = app.storage?.tasks || app.tasks || [];
    return Array.isArray(list) ? list.filter((task) => !['done', 'cancelled'].includes(String(task?.status || ''))) : [];
  }

  function getSku(task) {
    try { return typeof window.getSku === 'function' ? window.getSku(task?.articleKey) : null; }
    catch { return null; }
  }

  function platformKey(task) {
    const sku = getSku(task);
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

  function rows(tasks) {
    return KEYS.map((key) => {
      const items = tasks.filter((task) => platformKey(task) === key);
      const late = items.filter(overdue);
      const crit = items.filter((task) => task?.priority === 'critical');
      const rop = items.filter((task) => task?.status === 'waiting_rop');
      const final = items.filter((task) => task?.status === 'waiting_decision');
      const noOwner = items.filter((task) => !task?.owner);
      return { key, items, late, crit, rop, final, noOwner, risk: late.length || crit.length || rop.length || final.length };
    });
  }

  function platformCard(row) {
    const meta = META[row.key] || META.cross;
    const tone = row.late.length || row.crit.length ? 'danger' : row.final.length || row.rop.length ? 'warn' : row.items.length ? 'info' : 'ok';
    const status = row.late.length ? `${fmt(row.late.length)} проср.` : row.crit.length ? `${fmt(row.crit.length)} крит.` : row.final.length ? `${fmt(row.final.length)} финал` : row.rop.length ? `${fmt(row.rop.length)} у РОПа` : row.items.length ? `${fmt(row.items.length)} актив.` : 'чисто';
    return `<button class="executive-lite-card ${row.risk ? 'has-risk' : ''} ${row.items.length ? '' : 'is-empty'}" type="button" data-executive-lite-open="${esc(row.key)}"><span class="executive-lite-card-top"><span>${esc(meta.title)}</span>${badge(status, tone)}</span><strong>${esc(meta.label)}</strong><span class="executive-lite-metrics"><span><b>${fmt(row.items.length)}</b> активных</span><span><b>${fmt(row.rop.length)}</b> РОП</span><span><b>${fmt(row.final.length)}</b> финал</span><span><b>${fmt(row.noOwner.length)}</b> без owner</span></span></button>`;
  }

  function taskTitle(task) { return task?.title || task?.entityLabel || task?.articleKey || 'Задача'; }
  function taskCard(task) {
    const priority = task?.priority === 'critical' ? 'Критично' : task?.priority === 'high' ? 'Высокий' : 'Средний';
    return `<button class="executive-lite-task ${overdue(task) ? 'is-overdue' : ''}" type="button" data-executive-lite-task="${esc(task?.id || '')}"><strong>${esc(taskTitle(task))}</strong><span>${esc(task?.owner || 'без owner')} · ${esc(task?.due || 'без срока')}</span><em>${priority}</em></button>`;
  }

  function injectStyles() {
    if (document.getElementById('executive-lite-guard-style')) return;
    const style = document.createElement('style');
    style.id = 'executive-lite-guard-style';
    style.textContent = `#view-executive[data-executive-layer]{display:flex;flex-direction:column;gap:14px}.executive-lite-title{margin-bottom:0}.executive-lite-surface,.executive-lite-focus{border:1px solid rgba(212,164,74,.2);border-radius:12px;background:rgba(255,255,255,.025);padding:14px}.executive-lite-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.executive-lite-head span{display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted)}.executive-lite-head strong{display:block;margin-top:3px;color:#fff7e6;font-size:18px;line-height:1.15}.executive-lite-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.executive-lite-card{display:flex;flex-direction:column;gap:9px;min-height:142px;text-align:left;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(0,0,0,.22);color:inherit;padding:12px;cursor:pointer}.executive-lite-card:hover{border-color:rgba(212,164,74,.46);background:rgba(212,164,74,.06)}.executive-lite-card.has-risk{border-color:rgba(212,164,74,.34);background:rgba(212,164,74,.055)}.executive-lite-card.is-empty{opacity:.68}.executive-lite-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;font-size:11px;color:var(--muted)}.executive-lite-card>strong{font-size:18px;line-height:1.1;color:#fff7e6}.executive-lite-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:auto}.executive-lite-metrics span{border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(0,0,0,.18);padding:7px;font-size:11px;color:var(--muted)}.executive-lite-metrics b{display:block;color:#fff7e6;font-size:15px;line-height:1}.executive-lite-task-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.executive-lite-task{text-align:left;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(0,0,0,.18);padding:12px;color:inherit;cursor:pointer}.executive-lite-task.is-overdue{border-color:rgba(217,83,79,.42);background:rgba(217,83,79,.08)}.executive-lite-task strong{display:block;color:#fff7e6;line-height:1.25}.executive-lite-task span{display:block;margin-top:6px;font-size:12px;color:var(--muted)}.executive-lite-task em{display:inline-block;margin-top:9px;font-style:normal;font-size:11px;border:1px solid rgba(212,164,74,.25);border-radius:999px;padding:4px 8px;color:#f3dfad}@media (max-width:1280px){.executive-lite-grid,.executive-lite-task-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:820px){.executive-lite-grid,.executive-lite-task-grid{grid-template-columns:1fr}.executive-lite-head{flex-direction:column}}`;
    document.head.appendChild(style);
  }

  function render() {
    const root = document.getElementById('view-executive');
    if (!root) return;
    root.querySelectorAll('[data-portal-view-guide], .portal-view-guide, .executive-guide').forEach((node) => node.remove());
    const tasks = activeTasks();
    const focus = tasks.filter((task) => overdue(task) || task?.priority === 'critical' || task?.status === 'waiting_decision' || task?.status === 'waiting_rop' || !task?.owner).slice(0, 8);
    const final = tasks.filter((task) => task?.status === 'waiting_decision');
    const rop = tasks.filter((task) => task?.status === 'waiting_rop');
    const late = tasks.filter(overdue);
    const noOwner = tasks.filter((task) => !task?.owner);
    root.dataset.executiveLayer = VERSION;
    root.innerHTML = `<div class="section-title executive-lite-title"><div><h2>Руководителю</h2><p>Сначала площадки: WB, Ozon и остальные контуры. РОП открывает свой список, руководитель видит только финал и риски.</p></div><div class="badge-stack">${badge(`${fmt(final.length)} финал`, final.length ? 'warn' : 'ok')}${badge(`${fmt(rop.length)} у РОПа`, rop.length ? 'info' : 'ok')}</div></div><div class="executive-lite-surface" data-executive-lite-panel><div class="executive-lite-head"><div><span>Площадки</span><strong>Куда смотреть сейчас</strong></div><div class="badge-stack">${badge(`${fmt(tasks.length)} активных`, tasks.length ? 'info' : 'ok')}${badge(`${fmt(late.length)} проср.`, late.length ? 'danger' : 'ok')}${badge(`${fmt(noOwner.length)} без owner`, noOwner.length ? 'warn' : 'ok')}</div></div><div class="executive-lite-grid">${rows(tasks).map(platformCard).join('')}</div></div><div class="executive-lite-focus"><div class="executive-lite-head"><div><span>Фокус</span><strong>Что требует решения сегодня</strong></div>${badge(`${fmt(focus.length)} задач`, focus.length ? 'danger' : 'ok')}</div><div class="executive-lite-task-grid">${focus.map(taskCard).join('') || '<div class="empty">Срочных решений нет</div>'}</div></div>`;
    root.querySelectorAll('[data-executive-lite-open]').forEach((button) => button.addEventListener('click', () => {
      const key = button.getAttribute('data-executive-lite-open') || 'cross';
      const app = state();
      app.controlFilters = app.controlFilters || {};
      Object.assign(app.controlFilters, { platform: key, peopleRole: ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product'].includes(key) ? key : 'leader', status: 'active', horizon: 'all', source: 'all', lazyQueue: 'now' });
      if (typeof window.setView === 'function') window.setView('control'); else window.location.hash = '#control';
    }));
    root.querySelectorAll('[data-executive-lite-task]').forEach((button) => button.addEventListener('click', () => {
      const id = button.getAttribute('data-executive-lite-task');
      if (id && typeof window.renderTaskModal === 'function') window.renderTaskModal(id);
    }));
  }

  let scheduled = false;
  let rendering = false;
  let observer = null;
  function stale(root) {
    const title = root?.querySelector('.section-title p')?.textContent || '';
    return !root?.querySelector('[data-executive-lite-panel]') || title.includes('общий уровень риска') || title.includes('очередь руководителя') || title.includes('очередь директора');
  }
  function watch() {
    if (observer || typeof MutationObserver !== 'function') return;
    const root = document.getElementById('view-executive');
    if (!root) return;
    observer = new MutationObserver(() => { if (!rendering && stale(root)) schedule(); });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (location.hash === '#executive' || state().activeView === 'executive') {
        rendering = true;
        try { injectStyles(); render(); watch(); }
        finally { rendering = false; }
      }
    });
  }

  window.renderExecutive = render;
  try { renderExecutive = render; } catch {}
  window.addEventListener('hashchange', schedule);
  window.addEventListener('altea:viewchange', schedule);
  document.addEventListener('click', (event) => { if (event.target?.closest?.('[data-view="executive"], [data-view-executive]')) setTimeout(schedule, 30); }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  schedule();
  setTimeout(schedule, 250);
  setTimeout(schedule, 900);
  setTimeout(schedule, 1800);
  setTimeout(schedule, 3500);
})();
