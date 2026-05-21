(function () {
  if (window.__ALTEA_LIVE_LAUNCH_BUDGET__) return;
  window.__ALTEA_LIVE_LAUNCH_BUDGET__ = true;

  const VIEW = 'launches';
  const STORAGE_KEY = 'altea:render-budget:launches';

  function isExpanded() {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) === 'full';
    } catch (error) {
      return false;
    }
  }

  function setExpanded() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, 'full');
    } catch (error) {
      // Session storage can be unavailable in hardened browsers.
    }
  }

  function formatInt(value) {
    const number = Math.max(0, Math.round(Number(value) || 0));
    try {
      if (window.fmt && typeof window.fmt.int === 'function') return window.fmt.int(number);
    } catch (error) {
      // Fall back to a local formatter.
    }
    return String(number).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function chip(label, tone = '') {
    try {
      if (typeof window.badge === 'function') return window.badge(label, tone);
    } catch (error) {
      // Fall back to a simple chip below.
    }
    const toneClass = tone ? ` ${escapeHtml(tone)}` : '';
    return `<span class="chip${toneClass}">${escapeHtml(label)}</span>`;
  }

  function installWrapper(name, factory) {
    const original = window[name];
    if (typeof original !== 'function' || original.__alteaLaunchBudgetWrapped) return false;
    const wrapped = factory(original);
    wrapped.__alteaLaunchBudgetWrapped = true;
    wrapped.__alteaLaunchBudgetOriginal = original;
    window[name] = wrapped;
    return true;
  }

  function renderLightLaunchGraph(items = []) {
    const list = Array.isArray(items) ? items : [];
    const monthCounts = new Map();
    list.forEach((item) => {
      const label = String(item?.launchMonth || item?.launchDate || 'Без месяца').trim() || 'Без месяца';
      monthCounts.set(label, (monthCounts.get(label) || 0) + 1);
    });
    const topMonths = Array.from(monthCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ru'))
      .slice(0, 5);
    const withoutOwner = list.filter((item) => !String(item?.owner || '').trim()).length;
    const linkedSku = list.filter((item) => String(item?.articleKey || '').trim()).length;

    return `
      <div class="card launch-auto-graph-card">
        <div class="section-subhead">
          <div>
            <h3>План запусков по месяцам</h3>
            <p class="small muted">Быстрый сводный режим без тяжёлого календаря задач.</p>
          </div>
          <div class="badge-stack">
            ${chip(`${formatInt(list.length)} новинок`, list.length ? 'info' : 'warn')}
            ${chip(`${formatInt(linkedSku)} связаны с SKU`, linkedSku ? 'ok' : 'warn')}
            ${withoutOwner ? chip(`${formatInt(withoutOwner)} без owner`, 'warn') : chip('owner назначены', 'ok')}
          </div>
        </div>
        <div class="launch-month-plan-grid">
          ${topMonths.map(([label, count]) => `
            <div class="launch-month-plan-card">
              <div class="launch-month-plan-head">
                <div>
                  <strong>${escapeHtml(label)}</strong>
                  <span>${formatInt(count)} запусков</span>
                </div>
                ${chip('сводка', 'info')}
              </div>
            </div>
          `).join('') || '<div class="empty">План запусков пока пуст.</div>'}
        </div>
        <div class="altea-render-budget-notice" style="margin-bottom:0">
          <div><strong>Календарь облегчен.</strong> Полный график с задачами и контрольными точками открывается по кнопке.</div>
          <button class="quick-chip portal-action-secondary" type="button" data-altea-render-budget-expand="launches">Показать полный календарь</button>
        </div>
      </div>
    `;
  }

  function patchLaunches() {
    installWrapper('renderLaunchAutoGraph', (originalRender) => function patchedRenderLaunchAutoGraph(items = []) {
      if (isExpanded()) return originalRender.apply(this, arguments);
      return renderLightLaunchGraph(items);
    });
  }

  function rerenderLaunches() {
    if (typeof window.renderLaunches === 'function') {
      window.renderLaunches();
      return;
    }
    if (typeof window.rerenderCurrentView === 'function') {
      window.rerenderCurrentView();
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-altea-render-budget-expand="launches"]');
    if (!button) return;
    event.preventDefault();
    setExpanded();
    rerenderLaunches();
  }, true);

  patchLaunches();
  window.setTimeout(patchLaunches, 0);
  window.setTimeout(patchLaunches, 800);
  document.addEventListener('DOMContentLoaded', patchLaunches);
  window.__ALTEA_LAUNCH_BUDGET_VERSION__ = '20260521launchbudget1';
})();