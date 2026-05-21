(function () {
  if (window.__ALTEA_LIVE_TABLE_BUDGET_20260521__) return;
  window.__ALTEA_LIVE_TABLE_BUDGET_20260521__ = true;

  const SKU_VIEW = 'sku-plan-fact';
  const PRICES_VIEW = 'prices';
  const SKU_LIMIT = 60;
  const PRICES_LIMIT = 80;
  const FULL_PREFIX = 'altea:render-budget:';

  let skuLastBudget = null;
  let pricesLastBudget = null;
  let skuScheduled = false;
  let pricesScheduled = false;

  function storageGet(key) {
    try {
      return window.sessionStorage && window.sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(key, value);
    } catch (error) {
      // Ignore private-mode storage failures; the button still rerenders the full view once.
    }
  }

  function isFull(view) {
    return storageGet(FULL_PREFIX + view) === 'full';
  }

  function setFull(view) {
    storageSet(FULL_PREFIX + view, 'full');
  }

  function formatNumber(value) {
    const number = Number(value) || 0;
    try {
      return number.toLocaleString('ru-RU');
    } catch (error) {
      return String(number);
    }
  }

  function ensureStyles() {
    if (document.getElementById('altea-live-table-budget-style')) return;
    const style = document.createElement('style');
    style.id = 'altea-live-table-budget-style';
    style.textContent = [
      '#view-sku-plan-fact .sku-plan-fact-table, #view-prices .pw-table-wrap { contain: content; }',
      '#view-prices .pw-table tbody tr, #view-sku-plan-fact .sku-plan-fact-table tbody tr { content-visibility: auto; contain-intrinsic-size: 44px; }',
      '.altea-render-budget-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 0; padding: 10px 12px; border: 1px solid rgba(30, 64, 175, .18); border-radius: 8px; background: rgba(239, 246, 255, .92); color: #1f2937; font-size: 13px; line-height: 1.35; }',
      '.altea-render-budget-notice strong { font-weight: 700; color: #1d4ed8; }',
      '.altea-render-budget-notice button { flex: 0 0 auto; border: 0; border-radius: 7px; padding: 8px 11px; background: #2563eb; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }',
      '.altea-render-budget-notice button:hover { background: #1d4ed8; }',
      '@media (max-width: 720px) { .altea-render-budget-notice { align-items: stretch; flex-direction: column; } .altea-render-budget-notice button { width: 100%; } }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function removeNotice(root, view) {
    if (!root) return;
    root.querySelectorAll('[data-altea-render-budget-notice="' + view + '"]').forEach((node) => node.remove());
  }

  function placeNotice(root, view, visible, total, label, anchor) {
    if (!root || isFull(view) || total <= visible) {
      removeNotice(root, view);
      return;
    }
    ensureStyles();
    let notice = root.querySelector('[data-altea-render-budget-notice="' + view + '"]');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'altea-render-budget-notice';
      notice.dataset.alteaRenderBudgetNotice = view;
    }
    if (notice.dataset.alteaBudgetVisible !== String(visible) || notice.dataset.alteaBudgetTotal !== String(total)) {
      notice.dataset.alteaBudgetVisible = String(visible);
      notice.dataset.alteaBudgetTotal = String(total);
      notice.innerHTML = [
        '<span><strong>\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u044b \u043f\u0435\u0440\u0432\u044b\u0435 ' + formatNumber(visible) + '</strong> \u0438\u0437 ' + formatNumber(total) + ' ' + label + ' \u0434\u043b\u044f \u0431\u044b\u0441\u0442\u0440\u043e\u0433\u043e \u043e\u0442\u043a\u0440\u044b\u0442\u0438\u044f \u0432\u043a\u043b\u0430\u0434\u043a\u0438. \u041f\u043e\u043b\u043d\u044b\u0439 \u0441\u043f\u0438\u0441\u043e\u043a \u0438 \u0432\u044b\u0433\u0440\u0443\u0437\u043a\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u043f\u043e\u0441\u043b\u0435 \u0440\u0430\u0441\u043a\u0440\u044b\u0442\u0438\u044f.</span>',
        '<button type="button" data-altea-render-budget-expand="' + view + '">\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0432\u0441\u0435</button>'
      ].join('');
    }

    const target = anchor && anchor.parentNode ? anchor : null;
    if (target) {
      if (target.nextSibling !== notice) target.parentNode.insertBefore(notice, target.nextSibling);
    } else if (root.firstChild !== notice) {
      root.insertBefore(notice, root.firstChild);
    }
  }

  function tableRows(tbody) {
    return Array.from((tbody && tbody.children) || []).filter((row) => String(row.tagName || '').toLowerCase() === 'tr');
  }

  function trimRows(root, tbody, view, limit, label, anchor, knownTotal) {
    if (!root || !tbody) return;
    if (isFull(view)) {
      removeNotice(root, view);
      return;
    }

    let rows = tableRows(tbody);
    let total = Number(knownTotal) || rows.length;

    if (rows.length > limit) {
      total = rows.length;
      rows.slice(limit).forEach((row) => row.remove());
      rows = rows.slice(0, limit);
      tbody.dataset.alteaBudgetTrimmed = view;
      tbody.dataset.alteaBudgetTotal = String(total);
      tbody.dataset.alteaBudgetVisible = String(rows.length);
    } else if (tbody.dataset.alteaBudgetTrimmed === view) {
      total = Number(tbody.dataset.alteaBudgetTotal) || total;
    } else if (knownTotal && knownTotal > rows.length) {
      tbody.dataset.alteaBudgetTrimmed = view;
      tbody.dataset.alteaBudgetTotal = String(knownTotal);
      tbody.dataset.alteaBudgetVisible = String(rows.length);
      total = knownTotal;
    } else {
      removeNotice(root, view);
      return;
    }

    const visible = Math.min(rows.length || limit, limit, total);
    placeNotice(root, view, visible, total, label, anchor);
  }

  function scheduleSkuApply() {
    if (skuScheduled) return;
    skuScheduled = true;
    const run = () => {
      skuScheduled = false;
      applySkuBudgetDom();
    };
    Promise.resolve().then(run);
    window.requestAnimationFrame(applySkuBudgetDom);
    window.setTimeout(applySkuBudgetDom, 0);
  }

  function schedulePricesApply() {
    if (pricesScheduled) return;
    pricesScheduled = true;
    const run = () => {
      pricesScheduled = false;
      applyPricesBudgetDom();
    };
    Promise.resolve().then(run);
    window.requestAnimationFrame(applyPricesBudgetDom);
    window.setTimeout(applyPricesBudgetDom, 0);
  }

  function ensureObserver(root, key, callback) {
    if (!root || root[key]) return;
    const observer = new MutationObserver(() => callback());
    observer.observe(root, { childList: true, subtree: true });
    root[key] = observer;
  }

  function skuBudgetModel(model) {
    if (!model || !Array.isArray(model.rows) || isFull(SKU_VIEW)) {
      skuLastBudget = null;
      return model;
    }
    const total = model.rows.length;
    if (total <= SKU_LIMIT) {
      skuLastBudget = null;
      return model;
    }
    skuLastBudget = { visible: SKU_LIMIT, total: total };
    return Object.assign({}, model, {
      rows: model.rows.slice(0, SKU_LIMIT),
      alteaBudgetVisibleRows: SKU_LIMIT,
      alteaBudgetTotalRows: total
    });
  }

  function applySkuBudgetDom() {
    const root = document.getElementById('view-sku-plan-fact');
    if (!root) return;
    ensureStyles();
    ensureObserver(root, '__alteaSkuPlanFactBudgetObserver', scheduleSkuApply);
    const tbody = root.querySelector('.sku-plan-fact-table tbody');
    const anchor = root.querySelector('.sku-plan-fact-toolbar') || root.querySelector('.sku-plan-fact-card h2') || root.querySelector('.sku-plan-fact-card');
    const knownTotal = skuLastBudget && skuLastBudget.total;
    trimRows(root, tbody, SKU_VIEW, SKU_LIMIT, '\u0441\u0442\u0440\u043e\u043a \u043f\u043b\u0430\u043d-\u0444\u0430\u043a\u0442\u0430 SKU', anchor, knownTotal);
  }

  function hookSkuPlanFact() {
    if (typeof window.renderSkuPlanFact !== 'function') return false;
    if (window.renderSkuPlanFact.__alteaTableBudgetWrapped) {
      applySkuBudgetDom();
      return true;
    }

    const originalRender = window.renderSkuPlanFact;
    function wrappedRenderSkuPlanFact() {
      const originalBuild = window.skuPlanFactBuildModel;
      let swappedBuild = false;
      if (!isFull(SKU_VIEW) && typeof originalBuild === 'function') {
        window.skuPlanFactBuildModel = function () {
          return skuBudgetModel(originalBuild.apply(this, arguments));
        };
        swappedBuild = true;
      }
      try {
        return originalRender.apply(this, arguments);
      } finally {
        if (swappedBuild) window.skuPlanFactBuildModel = originalBuild;
        window.requestAnimationFrame(applySkuBudgetDom);
        window.setTimeout(applySkuBudgetDom, 0);
      }
    }
    wrappedRenderSkuPlanFact.__alteaTableBudgetWrapped = true;
    wrappedRenderSkuPlanFact.__alteaOriginalRender = originalRender;
    window.renderSkuPlanFact = wrappedRenderSkuPlanFact;
    applySkuBudgetDom();
    return true;
  }

  function applyPricesBudgetDom() {
    const root = document.getElementById('view-prices');
    if (!root) return;
    ensureStyles();
    ensureObserver(root, '__alteaPricesBudgetObserver', schedulePricesApply);
    const tbody = root.querySelector('.pw-table tbody');
    const anchor = root.querySelector('.pw-table-head') || root.querySelector('.pw-card h2') || root.querySelector('.pw-card');
    const knownTotal = pricesLastBudget && pricesLastBudget.total;
    trimRows(root, tbody, PRICES_VIEW, PRICES_LIMIT, '\u0441\u0442\u0440\u043e\u043a \u043f\u0440\u0430\u0439\u0441-\u0432\u043e\u0440\u043a\u0431\u0435\u043d\u0447\u0430', anchor, knownTotal);
  }

  function looksLikePriceRows(rows) {
    if (!rows || rows.length <= PRICES_LIMIT) return false;
    const row = rows[0];
    return !!(row && typeof row === 'object' && row.articleKey && row.market && ('currentFillPrice' in row || 'repricerDisplay' in row));
  }

  function renderWithPriceBudget(originalRender, thisArg, args) {
    if (isFull(PRICES_VIEW)) {
      pricesLastBudget = null;
      return originalRender.apply(thisArg, args);
    }

    const originalMap = Array.prototype.map;
    let applied = false;
    Array.prototype.map = function (callback, mapThisArg) {
      if (!applied && looksLikePriceRows(this)) {
        pricesLastBudget = { visible: PRICES_LIMIT, total: this.length };
        applied = true;
        return originalMap.call(this.slice(0, PRICES_LIMIT), callback, mapThisArg);
      }
      return originalMap.call(this, callback, mapThisArg);
    };

    try {
      return originalRender.apply(thisArg, args);
    } finally {
      Array.prototype.map = originalMap;
      if (!applied) pricesLastBudget = null;
    }
  }

  function hookPrices() {
    if (typeof window.renderPriceWorkbench !== 'function') return false;
    if (window.renderPriceWorkbench.__alteaTableBudgetWrapped) {
      applyPricesBudgetDom();
      return true;
    }

    const originalRender = window.renderPriceWorkbench;
    function wrappedRenderPriceWorkbench() {
      const result = renderWithPriceBudget(originalRender, this, arguments);
      window.requestAnimationFrame(applyPricesBudgetDom);
      window.setTimeout(applyPricesBudgetDom, 0);
      return result;
    }
    wrappedRenderPriceWorkbench.__alteaTableBudgetWrapped = true;
    wrappedRenderPriceWorkbench.__alteaOriginalRender = originalRender;
    window.renderPriceWorkbench = wrappedRenderPriceWorkbench;
    applyPricesBudgetDom();
    return true;
  }

  function rerenderView(view) {
    if (view === SKU_VIEW && typeof window.renderSkuPlanFact === 'function') {
      window.renderSkuPlanFact('view-sku-plan-fact');
      return;
    }
    if (view === PRICES_VIEW && typeof window.renderPriceWorkbench === 'function') {
      window.renderPriceWorkbench();
      return;
    }
    if (typeof window.rerenderCurrentView === 'function') window.rerenderCurrentView();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('[data-altea-render-budget-expand]');
    if (!button) return;
    const view = button.dataset.alteaRenderBudgetExpand;
    if (view !== SKU_VIEW && view !== PRICES_VIEW) return;
    event.preventDefault();
    event.stopPropagation();
    setFull(view);
    const root = document.getElementById('view-' + view);
    removeNotice(root, view);
    rerenderView(view);
  }, true);

  function hookAll() {
    const skuReady = hookSkuPlanFact();
    const pricesReady = hookPrices();
    if (!isFull(SKU_VIEW)) applySkuBudgetDom();
    if (!isFull(PRICES_VIEW)) applyPricesBudgetDom();
    return skuReady && pricesReady;
  }

  window.__alteaApplyTableBudgets = hookAll;
  window.addEventListener('altea:viewchange', () => window.setTimeout(hookAll, 0));
  document.addEventListener('DOMContentLoaded', hookAll, { once: true });
  hookAll();

  let attempts = 0;
  const interval = window.setInterval(() => {
    attempts += 1;
    if (hookAll() || attempts > 240) window.clearInterval(interval);
  }, 250);
})();
