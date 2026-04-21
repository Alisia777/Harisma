(function () {
  if (window.__ALTEA_LAUNCH_CONTROL_HOTFIX_20260421E__) return;
  window.__ALTEA_LAUNCH_CONTROL_HOTFIX_20260421E__ = true;

  const STYLE_ID = 'altea-launch-control-hotfix-20260421e';

  function escape(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function int(value) {
    if (typeof fmt === 'object' && fmt && typeof fmt.int === 'function') return fmt.int(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function money(value) {
    if (typeof fmt === 'object' && fmt && typeof fmt.money === 'function') return fmt.money(value);
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function num(value) {
    if (typeof numberOrZero === 'function') return numberOrZero(value);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function chip(text, tone) {
    if (typeof badge === 'function') return badge(text, tone || '');
    return `<span class="chip ${tone || ''}">${escape(text)}</span>`;
  }

  function launchOwner(sku) {
    if (typeof ownerName === 'function') return ownerName(sku);
    return sku?.owner?.name || '';
  }

  function launchStock(sku) {
    if (typeof totalSkuStock === 'function') return totalSkuStock(sku);
    return num(sku?.wb?.stock) + num(sku?.ozon?.stockProducts ?? sku?.ozon?.stock);
  }

  function launchRevenue(sku) {
    if (typeof monthRevenue === 'function') return monthRevenue(sku);
    return num(sku?.orders?.value);
  }

  function launchTraffic(sku) {
    if (typeof externalTrafficLabel === 'function') return externalTrafficLabel(sku);
    return sku?.flags?.hasExternalTraffic ? 'есть внешний трафик' : 'без внешнего трафика';
  }

  function launchTaskCount(articleKey) {
    if (typeof getSkuControlTasks !== 'function') return 0;
    const tasks = getSkuControlTasks(articleKey);
    if (!Array.isArray(tasks)) return 0;
    return tasks.filter((task) => (typeof isTaskActive === 'function' ? isTaskActive(task) : task?.status === 'new' || task?.status === 'in_progress')).length;
  }

  function deriveLaunchStatusHotfix(sku) {
    if (!launchOwner(sku)) return 'Нужен owner';
    if (sku?.flags?.negativeMargin || sku?.flags?.toWork) return 'Нужна корректировка экономики';
    if (launchStock(sku) <= 0) return 'Ждём поставку';
    if (!sku?.flags?.hasExternalTraffic) return 'Готовим трафик';
    return 'В работе';
  }

  function deriveLaunchPhaseHotfix(sku) {
    if (!launchOwner(sku)) return 'owner';
    if (launchStock(sku) <= 0) return 'supply';
    if (!sku?.flags?.hasExternalTraffic) return 'content';
    if (sku?.flags?.negativeMargin || sku?.flags?.toWork) return 'economy';
    return 'scale';
  }

  function launchPhaseMetaHotfix(phase) {
    const map = {
      owner: { label: 'Нужен owner', tone: 'warn' },
      supply: { label: 'Поставка', tone: 'warn' },
      content: { label: 'Контент / трафик', tone: 'info' },
      economy: { label: 'Экономика', tone: 'danger' },
      scale: { label: 'Масштабирование', tone: 'ok' }
    };
    return map[phase] || map.content;
  }

  function normalizeLaunchItemHotfix(item) {
    const value = item || {};
    return {
      id: value.id || `launch-${value.articleKey || value.name || value.title || 'item'}`,
      articleKey: String(value.articleKey || '').trim(),
      name: value.name || value.title || 'Новинка',
      reportGroup: value.reportGroup || value.segment || 'Продукт',
      subCategory: value.subCategory || value.category || '—',
      launchMonth: value.launchMonth || state?.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус',
      status: value.status || 'Статус не указан',
      phase: value.phase || 'content',
      owner: value.owner || '',
      production: value.production || '',
      plannedRevenue: num(value.plannedRevenue),
      targetCost: num(value.targetCost),
      externalTraffic: value.externalTraffic || 'без внешнего трафика',
      activeTasks: num(value.activeTasks),
      blockers: Array.isArray(value.blockers) ? value.blockers.filter(Boolean) : []
    };
  }

  function buildLaunchItemsFromSkusHotfix() {
    const skus = Array.isArray(state?.skus) ? state.skus : [];
    return skus
      .filter((sku) => {
        const segment = String(sku?.segment || '').toUpperCase();
        const status = String(sku?.status || '').toLowerCase();
        return segment === 'GROWTH' || status.includes('нов');
      })
      .map((sku) => {
        const phase = deriveLaunchPhaseHotfix(sku);
        const blockers = [];
        if (!launchOwner(sku)) blockers.push('не назначен owner');
        if (launchStock(sku) <= 0) blockers.push('нет остатка');
        if (!sku?.flags?.hasExternalTraffic) blockers.push('нет внешнего трафика');
        if (sku?.flags?.negativeMargin) blockers.push('маржа в риске');
        if (sku?.flags?.highReturn) blockers.push('высокие возвраты');
        return normalizeLaunchItemHotfix({
          articleKey: sku.articleKey,
          name: sku.name || sku.article || sku.articleKey,
          reportGroup: sku.segment || 'GROWTH',
          subCategory: sku.category || '—',
          launchMonth: state?.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус',
          status: deriveLaunchStatusHotfix(sku),
          phase,
          owner: launchOwner(sku),
          production: launchStock(sku) > 0 ? `Остаток ${int(launchStock(sku))}` : 'Без остатка',
          plannedRevenue: launchRevenue(sku),
          targetCost: 0,
          externalTraffic: launchTraffic(sku),
          activeTasks: launchTaskCount(sku.articleKey),
          blockers
        });
      })
      .sort((left, right) => right.activeTasks - left.activeTasks || right.plannedRevenue - left.plannedRevenue || String(left.name).localeCompare(String(right.name), 'ru'));
  }

  function getLaunchItemsHotfix() {
    const source = Array.isArray(state?.launches) && state.launches.length
      ? state.launches.map(normalizeLaunchItemHotfix)
      : buildLaunchItemsFromSkusHotfix();
    return source.slice(0, 24);
  }

  function renderLaunchesHotfix() {
    const root = document.getElementById('view-launches');
    if (!root) return;
    const items = getLaunchItemsHotfix();
    const rows = items.map((item) => {
      const meta = launchPhaseMetaHotfix(item.phase);
      const title = item.articleKey && typeof linkToSku === 'function'
        ? linkToSku(item.articleKey, item.name || 'Новинка')
        : escape(item.name || 'Новинка');
      return `
        <div class="list-item">
          <div class="head">
            <div>
              <strong>${title}</strong>
              <div class="muted small">${escape(item.reportGroup || '—')} · ${escape(item.subCategory || '—')}</div>
            </div>
            ${chip(item.launchMonth || '—', 'info')}
          </div>
          <div class="badge-stack">
            ${chip(meta.label, meta.tone)}
            ${item.production ? chip(item.production) : ''}
            ${item.owner ? chip(item.owner, 'info') : chip('Без owner', 'warn')}
          </div>
          <div class="muted small" style="margin-top:8px">${escape(item.status || 'Статус не указан')}</div>
          <div class="muted small" style="margin-top:8px">План выручки: ${money(item.plannedRevenue)} · Трафик: ${escape(item.externalTraffic || '—')}</div>
          <div class="badge-stack" style="margin-top:8px">
            ${chip(`${int(item.activeTasks || 0)} активн. задач`, item.activeTasks ? 'warn' : 'ok')}
            ${(item.blockers || []).slice(0, 2).map((text) => chip(text, 'warn')).join('')}
          </div>
        </div>
      `;
    }).join('');

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Новинки и pipeline</h2>
          <p>Собрала product-layer по SKU роста и новинкам: карточка, owner, экономика, трафик и текущие блокеры в одном месте.</p>
        </div>
        <div class="badge-stack">
          ${chip(`${int(items.length)} SKU в запуске`, items.length ? 'info' : 'warn')}
          ${chip(`${int(items.filter((item) => !item.owner).length)} без owner`, items.filter((item) => !item.owner).length ? 'warn' : 'ok')}
          ${chip(`${int(items.filter((item) => item.activeTasks).length)} с активными задачами`, items.filter((item) => item.activeTasks).length ? 'warn' : 'ok')}
        </div>
      </div>
      <div class="card">
        <div class="launch-hotfix-strip">
          <span>Owner</span><span>Поставка</span><span>Контент</span><span>Трафик</span><span>Экономика</span><span>Масштаб</span>
        </div>
        <div class="list" style="margin-top:14px">${rows || '<div class="empty">Нет новинок в текущем срезе</div>'}</div>
      </div>
    `;
  }

  function renderLaunchControlHotfix() {
    const root = document.getElementById('view-launch-control');
    if (!root) return;
    const items = getLaunchItemsHotfix();
    const phaseOrder = ['owner', 'supply', 'content', 'economy', 'scale'];
    const groups = phaseOrder
      .map((key) => ({ key, meta: launchPhaseMetaHotfix(key), items: items.filter((item) => item.phase === key) }))
      .filter((group) => group.items.length);

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Запуск новинок</h2>
          <p>Сверху видно, где именно сейчас блокируется запуск, а ниже можно пройтись по SKU как по чек-листу.</p>
        </div>
        <div class="badge-stack">
          ${chip(`${int(items.length)} в запуске`, items.length ? 'info' : 'warn')}
          ${chip(`${int(items.filter((item) => item.phase === 'owner').length)} ждут owner`, items.filter((item) => item.phase === 'owner').length ? 'warn' : 'ok')}
          ${chip(`${int(items.filter((item) => item.phase === 'content').length)} ждут трафик`, items.filter((item) => item.phase === 'content').length ? 'warn' : 'ok')}
        </div>
      </div>
      <div class="grid cards" style="margin-top:14px">
        ${groups.map((group) => `
          <div class="card kpi">
            <div class="label">${escape(group.meta.label)}</div>
            <div class="value">${int(group.items.length)}</div>
            <div class="hint">SKU в этой фазе запуска</div>
            <div class="badge-stack" style="margin-top:10px">${group.items.slice(0, 3).map((item) => chip(item.owner || item.name, item.owner ? '' : 'warn')).join('')}</div>
          </div>
        `).join('') || '<div class="card"><div class="empty">Нет SKU в запуске</div></div>'}
      </div>
      <div class="card" style="margin-top:14px">
        <div class="list launch-hotfix-list">
          ${items.map((item) => {
            const meta = launchPhaseMetaHotfix(item.phase);
            const title = item.articleKey && typeof linkToSku === 'function'
              ? linkToSku(item.articleKey, item.name || item.articleKey)
              : escape(item.name || 'Новинка');
            return `
              <div class="list-item">
                <div class="head">
                  <div>
                    <strong>${title}</strong>
                    <div class="muted small">${escape(item.reportGroup || '—')} · ${escape(item.subCategory || '—')}</div>
                  </div>
                  ${chip(meta.label, meta.tone)}
                </div>
                <div class="launch-hotfix-meta">
                  <span>${item.owner ? `Owner: ${escape(item.owner)}` : 'Owner не назначен'}</span>
                  <span>${escape(item.production || 'Поставка не подтверждена')}</span>
                  <span>Активных задач: ${int(item.activeTasks || 0)}</span>
                </div>
                <div class="muted small" style="margin-top:8px">${escape(item.status || 'Статус не указан')}</div>
                <div class="badge-stack" style="margin-top:10px">
                  ${chip(`Выручка ${money(item.plannedRevenue)}`, 'info')}
                  ${chip(item.externalTraffic || 'без внешнего трафика', item.externalTraffic && !String(item.externalTraffic).includes('без') ? 'ok' : 'warn')}
                  ${(item.blockers || []).slice(0, 3).map((text) => chip(text, 'warn')).join('')}
                </div>
              </div>
            `;
          }).join('') || '<div class="empty">Нет SKU в запуске</div>'}
        </div>
      </div>
    `;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .launch-hotfix-strip {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
        color: rgba(255, 244, 229, 0.62);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .launch-hotfix-strip span {
        display: inline-flex;
        justify-content: center;
        padding: 10px 8px;
        border: 1px solid rgba(212, 164, 74, 0.14);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.025);
      }
      .launch-hotfix-list {
        margin-top: 0;
      }
      .launch-hotfix-meta {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 10px;
        color: rgba(255, 244, 229, 0.65);
        font-size: 12px;
      }
      @media (max-width: 900px) {
        .launch-hotfix-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `;
    document.head.appendChild(style);
  }

  function applyHotfix() {
    injectStyles();
    window.renderLaunches = renderLaunchesHotfix;
    window.renderLaunchControl = renderLaunchControlHotfix;
    renderLaunchesHotfix();
    renderLaunchControlHotfix();
  }

  function wrapRerender() {
    if (typeof rerenderCurrentView !== 'function' || rerenderCurrentView.__alteaLaunchHotfixWrapped) return false;
    const original = rerenderCurrentView;
    const wrapped = function alteaLaunchHotfixRerenderWrapper() {
      const result = original.apply(this, arguments);
      try {
        renderLaunchControlHotfix();
      } catch (error) {
        console.error('[launch-control-hotfix] renderLaunchControl', error);
      }
      return result;
    };
    wrapped.__alteaLaunchHotfixWrapped = true;
    rerenderCurrentView = wrapped;
    return true;
  }

  function boot() {
    if (typeof state !== 'object' || !state || typeof renderLaunches !== 'function' || typeof rerenderCurrentView !== 'function') {
      setTimeout(boot, 250);
      return;
    }
    wrapRerender();
    applyHotfix();
    setTimeout(applyHotfix, 600);
    setTimeout(applyHotfix, 1800);
  }

  boot();
})();
