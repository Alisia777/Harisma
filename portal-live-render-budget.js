(function () {
  if (window.__ALTEA_LIVE_RENDER_BUDGET__) return;
  window.__ALTEA_LIVE_RENDER_BUDGET__ = true;

  const VERSION = '20260521budget1';
  const LIMITS = {
    skus: 55,
    launchControl: 18,
    adsFunnel: 140,
    orderRows: 28,
    orderPlaces: 18,
    repricerPlatformRows: 90
  };
  const expanded = Object.create(null);
  const lastBudget = Object.create(null);

  function storageKey(view) {
    return `altea:render-budget:${view}`;
  }

  function isExpanded(view) {
    if (expanded[view]) return true;
    try {
      return window.sessionStorage.getItem(storageKey(view)) === 'full';
    } catch (error) {
      return false;
    }
  }

  function setExpanded(view) {
    expanded[view] = true;
    try {
      window.sessionStorage.setItem(storageKey(view), 'full');
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

  function rootFor(view) {
    return document.getElementById(`view-${view}`);
  }

  function ensureStyle() {
    if (document.getElementById('altea-live-render-budget-style')) return;
    const style = document.createElement('style');
    style.id = 'altea-live-render-budget-style';
    style.textContent = `
      .altea-render-budget-notice {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 12px 0 14px;
        padding: 10px 12px;
        border: 1px solid rgba(205, 164, 92, 0.32);
        border-radius: 8px;
        background: rgba(255, 248, 226, 0.07);
        color: inherit;
      }
      .altea-render-budget-notice strong {
        font-weight: 700;
      }
      .altea-render-budget-notice button {
        flex: 0 0 auto;
      }
      #view-launch-control .list-item,
      #view-launches .launch-card-list > *,
      #view-product-leaderboard .list-item,
      #view-repricer .repricer-operator-sku,
      #view-repricer .repricer-sku-card,
      #view-order .altea-order-procurement__table-card,
      #view-sku-contour .sku-plan-fact-card,
      #view-ads-funnel .table-wrap,
      #view-skus .table-wrap,
      #view-wb-rating .table-wrap {
        content-visibility: auto;
        contain-intrinsic-size: 240px;
      }
      @media (max-width: 720px) {
        .altea-render-budget-notice {
          align-items: stretch;
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function noticeText(view, visible, total, extra) {
    const base = `Быстрый первый экран: ${formatInt(visible)} из ${formatInt(total)}.`;
    if (extra) return `${base} ${extra}`;
    if (view === 'order') return `${base} Полная таблица кластера раскрывается по кнопке.`;
    return `${base} Полный список раскрывается по кнопке.`;
  }

  function addBudgetNotice(view, visible, total, extra) {
    if (isExpanded(view) || !Number.isFinite(total) || total <= visible) return;
    const root = rootFor(view);
    if (!root) return;
    const old = root.querySelector('[data-altea-render-budget-notice]');
    if (old) old.remove();

    const notice = document.createElement('div');
    notice.className = 'altea-render-budget-notice';
    notice.setAttribute('data-altea-render-budget-notice', view);

    const label = document.createElement('div');
    label.innerHTML = `<strong>Оптимизированный рендер.</strong> ${noticeText(view, visible, total, extra)}`;

    const button = document.createElement('button');
    button.className = 'quick-chip portal-action-secondary';
    button.type = 'button';
    button.textContent = 'Показать все';
    button.setAttribute('data-altea-render-budget-expand', view);

    notice.append(label, button);
    const first = root.firstElementChild;
    if (first) first.insertAdjacentElement('afterend', notice);
    else root.appendChild(notice);
  }

  function clearViewCaches(view) {
    if (view === 'order') {
      try {
        if (typeof ORDER_PROCUREMENT_RUNTIME !== 'undefined') {
          ORDER_PROCUREMENT_RUNTIME.lastRenderedSignature = '';
        }
      } catch (error) {
        // Runtime may not be loaded yet.
      }
    }
    if (view === 'repricer') {
      try {
        if (typeof REPRICER_ROWS_CACHE !== 'undefined' && REPRICER_ROWS_CACHE) {
          REPRICER_ROWS_CACHE.signature = '';
          REPRICER_ROWS_CACHE.rows = null;
        }
      } catch (error) {
        // Repricer cache may not be loaded yet.
      }
    }
  }

  function rerenderBudgetedView(view) {
    clearViewCaches(view);
    const renderers = {
      skus: 'renderSkuRegistry',
      'launch-control': 'renderLaunchControl',
      'ads-funnel': 'renderAdsFunnel',
      order: 'renderOrderCalculator',
      repricer: 'renderRepricer'
    };
    const renderer = renderers[view];
    if (renderer && typeof window[renderer] === 'function') {
      window[renderer]();
      return;
    }
    if (typeof window.rerenderCurrentView === 'function') {
      window.rerenderCurrentView();
    }
  }

  function installWrapper(name, factory) {
    const original = window[name];
    if (typeof original !== 'function' || original.__alteaRenderBudgetWrapped) return false;
    const wrapped = factory(original);
    wrapped.__alteaRenderBudgetWrapped = true;
    wrapped.__alteaRenderBudgetOriginal = original;
    window[name] = wrapped;
    return true;
  }

  function afterFrame(callback) {
    window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
  }

  function patchSkuRegistry() {
    installWrapper('renderSkuRegistry', (originalRender) => function patchedRenderSkuRegistry(...args) {
      if (isExpanded('skus') || typeof window.getFilteredSkus !== 'function') {
        return originalRender.apply(this, args);
      }
      const originalGetFilteredSkus = window.getFilteredSkus;
      let total = 0;
      let visible = 0;
      window.getFilteredSkus = function budgetedGetFilteredSkus(...getterArgs) {
        const items = originalGetFilteredSkus.apply(this, getterArgs);
        if (!Array.isArray(items)) return items;
        total = items.length;
        visible = Math.min(total, LIMITS.skus);
        return items.slice(0, LIMITS.skus);
      };
      try {
        return originalRender.apply(this, args);
      } finally {
        window.getFilteredSkus = originalGetFilteredSkus;
        afterFrame(() => addBudgetNotice('skus', visible, total));
      }
    });
  }

  function patchLaunchControl() {
    installWrapper('renderLaunchControl', (originalRender) => function patchedRenderLaunchControl(...args) {
      if (isExpanded('launch-control') || typeof window.getLaunchViewModel !== 'function') {
        return originalRender.apply(this, args);
      }
      const originalGetLaunchViewModel = window.getLaunchViewModel;
      let total = 0;
      let visible = 0;
      window.getLaunchViewModel = function budgetedGetLaunchViewModel(...modelArgs) {
        const model = originalGetLaunchViewModel.apply(this, modelArgs);
        const filteredItems = Array.isArray(model?.filteredItems) ? model.filteredItems : [];
        total = filteredItems.length;
        visible = Math.min(total, LIMITS.launchControl);
        return {
          ...model,
          filteredItems: filteredItems.slice(0, LIMITS.launchControl),
          upcomingItems: Array.isArray(model?.upcomingItems) ? model.upcomingItems.slice(0, 8) : model?.upcomingItems,
          sections: Array.isArray(model?.sections)
            ? model.sections.map((section) => ({ ...section, items: (section.items || []).slice(0, 6) }))
            : model?.sections
        };
      };
      try {
        return originalRender.apply(this, args);
      } finally {
        window.getLaunchViewModel = originalGetLaunchViewModel;
        afterFrame(() => addBudgetNotice('launch-control', visible, total));
      }
    });
  }

  function patchAdsFunnel() {
    installWrapper('renderAdsFunnel', (originalRender) => function patchedRenderAdsFunnel(...args) {
      if (isExpanded('ads-funnel') || typeof window.adsFunnelBuildModel !== 'function') {
        return originalRender.apply(this, args);
      }
      const originalBuildModel = window.adsFunnelBuildModel;
      let total = 0;
      let visible = 0;
      window.adsFunnelBuildModel = function budgetedAdsFunnelBuildModel(...modelArgs) {
        const model = originalBuildModel.apply(this, modelArgs);
        const rows = Array.isArray(model?.rows) ? model.rows : [];
        total = rows.length;
        visible = Math.min(total, LIMITS.adsFunnel);
        return { ...model, rows: rows.slice(0, LIMITS.adsFunnel) };
      };
      try {
        return originalRender.apply(this, args);
      } finally {
        window.adsFunnelBuildModel = originalBuildModel;
        afterFrame(() => addBudgetNotice('ads-funnel', visible, total));
      }
    });
  }

  function patchOrderProcurement() {
    installWrapper('buildOrderProcurementModel', (originalBuildModel) => function patchedBuildOrderProcurementModel(...args) {
      const model = originalBuildModel.apply(this, args);
      if (isExpanded('order') || !model) return model;
      const rows = Array.isArray(model.rows) ? model.rows : [];
      const places = Array.isArray(model.places) ? model.places : [];
      const visibleRows = Math.min(rows.length, LIMITS.orderRows);
      const visiblePlaces = Math.min(places.length, LIMITS.orderPlaces);
      lastBudget.order = {
        rows: rows.length,
        places: places.length,
        visibleRows,
        visiblePlaces
      };
      return {
        ...model,
        rows: rows.slice(0, LIMITS.orderRows),
        places: places.slice(0, LIMITS.orderPlaces),
        hiddenPlaceCount: Math.max(0, Number(model.hiddenPlaceCount || 0) + places.length - visiblePlaces)
      };
    });

    installWrapper('orderProcurementRenderInto', (originalRenderInto) => function patchedOrderProcurementRenderInto(...args) {
      const result = originalRenderInto.apply(this, args);
      const budget = lastBudget.order;
      if (budget) {
        afterFrame(() => addBudgetNotice(
          'order',
          budget.visibleRows,
          budget.rows,
          `Кластеры: ${formatInt(budget.visiblePlaces)} из ${formatInt(budget.places)}.`
        ));
      }
      return result;
    });
  }

  function patchRepricer() {
    installWrapper('buildRepricerRowsFresh', (originalBuildFresh) => function patchedBuildRepricerRowsFresh(...args) {
      if (isExpanded('repricer')) return originalBuildFresh.apply(this, args);
      let portalState = null;
      try {
        portalState = window.state || (typeof state !== 'undefined' ? state : null);
      } catch (error) {
        portalState = null;
      }
      const platforms = portalState?.smartPriceWorkbench?.platforms;
      if (!platforms || typeof platforms !== 'object') return originalBuildFresh.apply(this, args);

      const saved = [];
      ['wb', 'ozon'].forEach((platform) => {
        const bucket = platforms[platform];
        const rows = Array.isArray(bucket?.rows) ? bucket.rows : [];
        if (rows.length > LIMITS.repricerPlatformRows) {
          saved.push({ platform, bucket, rows });
          platforms[platform] = { ...bucket, rows: rows.slice(0, LIMITS.repricerPlatformRows) };
        }
      });

      lastBudget.repricer = {
        rows: saved.reduce((sum, item) => sum + item.rows.length, 0),
        visibleRows: saved.reduce((sum, item) => sum + Math.min(item.rows.length, LIMITS.repricerPlatformRows), 0)
      };

      try {
        return originalBuildFresh.apply(this, args);
      } finally {
        saved.forEach((item) => {
          platforms[item.platform] = item.bucket;
        });
      }
    });

    installWrapper('renderRepricer', (originalRender) => function patchedRenderRepricer(...args) {
      const result = originalRender.apply(this, args);
      const budget = lastBudget.repricer;
      if (budget && budget.rows > budget.visibleRows) {
        afterFrame(() => addBudgetNotice('repricer', budget.visibleRows, budget.rows));
      }
      return result;
    });
  }

  function patchAll() {
    ensureStyle();
    patchSkuRegistry();
    patchLaunchControl();
    patchAdsFunnel();
    patchOrderProcurement();
    patchRepricer();
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-altea-render-budget-expand]');
    if (!button) return;
    const view = button.getAttribute('data-altea-render-budget-expand') || '';
    if (!view) return;
    event.preventDefault();
    setExpanded(view);
    rerenderBudgetedView(view);
  });

  patchAll();
  window.setTimeout(patchAll, 0);
  window.setTimeout(patchAll, 800);
  document.addEventListener('DOMContentLoaded', patchAll);
  window.__ALTEA_RENDER_BUDGET_VERSION__ = VERSION;
})();