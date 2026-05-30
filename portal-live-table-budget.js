(function () {
  if (window.__ALTEA_LIVE_TABLE_BUDGET_20260531_NOTICE2__) return;
  window.__ALTEA_LIVE_TABLE_BUDGET_20260531_NOTICE2__ = true;
  window.__ALTEA_LIVE_TABLE_BUDGET_20260521__ = true;

  const SKU_VIEW = 'sku-plan-fact';
  const PRICES_VIEW = 'prices';
  const SKU_CONTOUR_VIEW = 'sku-contour';
  const SKUS_VIEW = 'skus';
  const LAUNCH_CONTROL_VIEW = 'launch-control';
  const ADS_FUNNEL_VIEW = 'ads-funnel';
  const SKU_LIMIT = 36;
  const PRICES_LIMIT = 45;
  const SKU_CONTOUR_LIMIT = 45;
  const SKUS_LIMIT = 35;
  const LAUNCH_CONTROL_LIMIT = 10;
  const ADS_FUNNEL_LIMIT = 80;
  const FULL_PREFIX = 'altea:render-budget:';

  let skuLastBudget = null;
  let pricesLastBudget = null;
  let skuScheduled = false;
  let pricesScheduled = false;
  let skuContourScheduled = false;

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
    const style = document.getElementById('altea-live-table-budget-style') || document.createElement('style');
    style.id = 'altea-live-table-budget-style';
    style.textContent = [
      '#view-sku-plan-fact .sku-plan-fact-table, #view-prices .pw-table-wrap { contain: content; }',
      '#view-prices .pw-table tbody tr, #view-sku-plan-fact .sku-plan-fact-table tbody tr { content-visibility: auto; contain-intrinsic-size: 44px; }',
      '.altea-render-budget-notice { position: relative; display: grid; grid-template-columns: minmax(0,1fr) minmax(130px,220px) auto; align-items: center; gap: 14px; margin: 14px 0 16px; padding: 12px 14px; border: 1px solid rgba(205, 164, 92, .34); border-radius: 8px; background: linear-gradient(135deg, rgba(38, 27, 17, .94), rgba(12, 9, 7, .96)); color: var(--text, #f8f1de); box-shadow: 0 16px 34px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.06); font-size: 13px; line-height: 1.35; overflow: hidden; }',
      '.altea-render-budget-notice::before { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(205,164,92,.11), transparent); pointer-events: none; }',
      '.altea-render-budget-copy { position: relative; color: rgba(248,241,222,.78); }',
      '.altea-render-budget-notice strong { font-weight: 800; color: #f6d68f; }',
      '.altea-render-budget-arrow { position: relative; min-height: 30px; border-radius: 999px; background: linear-gradient(90deg, rgba(205,164,92,.10), rgba(246,194,93,.36)); box-shadow: inset 0 0 0 1px rgba(246,214,143,.22), 0 0 24px rgba(205,164,92,.16); }',
      '.altea-render-budget-arrow::before { content: ""; position: absolute; left: 14px; right: 36px; top: 50%; height: 2px; transform: translateY(-50%); border-radius: 999px; background: linear-gradient(90deg, rgba(246,214,143,.20), rgba(246,214,143,.95)); }',
      '.altea-render-budget-arrow::after { content: ""; position: absolute; right: 16px; top: 50%; width: 12px; height: 12px; border-top: 2px solid #ffe9aa; border-right: 2px solid #ffe9aa; transform: translateY(-50%) rotate(45deg); }',
      '.altea-render-budget-notice button { position: relative; flex: 0 0 auto; border: 1px solid rgba(255,236,184,.34); border-radius: 999px; padding: 9px 15px; background: linear-gradient(180deg, #f5d18a, #b98737); color: #160f08; font: inherit; font-weight: 900; cursor: pointer; box-shadow: 0 10px 24px rgba(185,135,55,.22); }',
      '.altea-render-budget-notice button:hover { filter: brightness(1.08); }',
      '@media (max-width: 720px) { .altea-render-budget-notice { grid-template-columns: 1fr; align-items: stretch; } .altea-render-budget-arrow { display: none; } .altea-render-budget-notice button { width: 100%; } }'
    ].join('\n');
    if (!style.parentNode) (document.head || document.documentElement).appendChild(style);
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
        '<span class="altea-render-budget-copy"><strong>\u041f\u0435\u0440\u0432\u044b\u0435 ' + formatNumber(visible) + ' \u0438\u0437 ' + formatNumber(total) + '</strong> ' + label + ' \u043e\u0442\u043a\u0440\u044b\u0442\u044b \u0441\u0440\u0430\u0437\u0443. \u041f\u043e\u043b\u043d\u044b\u0439 \u0441\u043f\u0438\u0441\u043e\u043a \u0438 \u0432\u044b\u0433\u0440\u0443\u0437\u043a\u0430 - \u043f\u043e \u043a\u043d\u043e\u043f\u043a\u0435.</span>',
        '<span class="altea-render-budget-arrow" aria-hidden="true"></span>',
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

  function scheduleSkuContourApply() {
    if (skuContourScheduled) return;
    skuContourScheduled = true;
    const run = () => {
      skuContourScheduled = false;
      applySkuContourBudgetDom();
    };
    Promise.resolve().then(run);
    window.requestAnimationFrame(applySkuContourBudgetDom);
    window.setTimeout(applySkuContourBudgetDom, 0);
  }

  function ensureObserver(root, key, callback) {
    if (!root || root[key]) return;
    const observer = new MutationObserver(() => callback());
    observer.observe(root, { childList: true, subtree: true });
    root[key] = observer;
  }

  function afterFrame(callback) {
    window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
  }

  function installStrictWrapper(name, factory) {
    const current = window[name];
    if (typeof current !== 'function') return false;
    if (current.__alteaTableBudgetStrictWrapped) return true;
    const original = current.__alteaRenderBudgetOriginal || current.__alteaOriginalRender || current;
    const wrapped = factory(original);
    wrapped.__alteaTableBudgetStrictWrapped = true;
    wrapped.__alteaOriginalRender = original;
    window[name] = wrapped;
    return true;
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

  function applySkuContourBudgetDom() {
    const root = document.getElementById('view-sku-contour');
    if (!root) return;
    ensureStyles();
    ensureObserver(root, '__alteaSkuContourBudgetObserver', scheduleSkuContourApply);
    const tbodies = Array.from(root.querySelectorAll('.data-table tbody'));
    const tbody = tbodies.sort((left, right) => tableRows(right).length - tableRows(left).length)[0];
    const card = tbody && tbody.closest('.sku-plan-fact-card');
    const anchor = card && (card.querySelector('.section-subhead') || card.firstElementChild) || root.querySelector('.section-title') || root.firstElementChild;
    trimRows(root, tbody, SKU_CONTOUR_VIEW, SKU_CONTOUR_LIMIT, '\u0441\u0442\u0440\u043e\u043a \u043a\u043e\u043d\u0442\u0443\u0440\u0430 SKU', anchor);
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

  function hookSkuRegistryStrict() {
    return installStrictWrapper('renderSkuRegistry', (originalRender) => function tableBudgetRenderSkuRegistry() {
      if (isFull(SKUS_VIEW) || typeof window.getFilteredSkus !== 'function') {
        return originalRender.apply(this, arguments);
      }
      const originalGetFilteredSkus = window.getFilteredSkus;
      let total = 0;
      let visible = 0;
      window.getFilteredSkus = function tableBudgetGetFilteredSkus() {
        const items = originalGetFilteredSkus.apply(this, arguments);
        if (!Array.isArray(items)) return items;
        total = items.length;
        visible = Math.min(total, SKUS_LIMIT);
        return items.slice(0, SKUS_LIMIT);
      };
      try {
        return originalRender.apply(this, arguments);
      } finally {
        window.getFilteredSkus = originalGetFilteredSkus;
        afterFrame(() => {
          const root = document.getElementById('view-skus');
          const anchor = root && (root.querySelector('.section-title') || root.firstElementChild);
          placeNotice(root, SKUS_VIEW, visible, total, '\u0441\u0442\u0440\u043e\u043a \u0440\u0435\u0435\u0441\u0442\u0440\u0430 SKU', anchor);
        });
      }
    });
  }

  function hookLaunchControlStrict() {
    return installStrictWrapper('renderLaunchControl', (originalRender) => function tableBudgetRenderLaunchControl() {
      if (isFull(LAUNCH_CONTROL_VIEW) || typeof window.getLaunchViewModel !== 'function') {
        return originalRender.apply(this, arguments);
      }
      const originalGetLaunchViewModel = window.getLaunchViewModel;
      let total = 0;
      let visible = 0;
      window.getLaunchViewModel = function tableBudgetGetLaunchViewModel() {
        const model = originalGetLaunchViewModel.apply(this, arguments);
        const filteredItems = Array.isArray(model && model.filteredItems) ? model.filteredItems : [];
        total = filteredItems.length;
        visible = Math.min(total, LAUNCH_CONTROL_LIMIT);
        return Object.assign({}, model, {
          filteredItems: filteredItems.slice(0, LAUNCH_CONTROL_LIMIT),
          upcomingItems: Array.isArray(model && model.upcomingItems) ? model.upcomingItems.slice(0, 6) : model && model.upcomingItems,
          sections: Array.isArray(model && model.sections)
            ? model.sections.map((section) => Object.assign({}, section, { items: (section.items || []).slice(0, 4) }))
            : model && model.sections
        });
      };
      try {
        return originalRender.apply(this, arguments);
      } finally {
        window.getLaunchViewModel = originalGetLaunchViewModel;
        afterFrame(() => {
          const root = document.getElementById('view-launch-control');
          const anchor = root && (root.querySelector('.section-title') || root.firstElementChild);
          placeNotice(root, LAUNCH_CONTROL_VIEW, visible, total, '\u043f\u043e\u0437\u0438\u0446\u0438\u0439 \u0437\u0430\u043f\u0443\u0441\u043a\u0430', anchor);
        });
      }
    });
  }

  function hookAdsFunnelStrict() {
    return installStrictWrapper('renderAdsFunnel', (originalRender) => function tableBudgetRenderAdsFunnel() {
      if (isFull(ADS_FUNNEL_VIEW) || typeof window.adsFunnelBuildModel !== 'function') {
        return originalRender.apply(this, arguments);
      }
      const originalBuildModel = window.adsFunnelBuildModel;
      let total = 0;
      let visible = 0;
      window.adsFunnelBuildModel = function tableBudgetAdsFunnelBuildModel() {
        const model = originalBuildModel.apply(this, arguments);
        const rows = Array.isArray(model && model.rows) ? model.rows : [];
        total = rows.length;
        visible = Math.min(total, ADS_FUNNEL_LIMIT);
        return Object.assign({}, model, { rows: rows.slice(0, ADS_FUNNEL_LIMIT) });
      };
      try {
        return originalRender.apply(this, arguments);
      } finally {
        window.adsFunnelBuildModel = originalBuildModel;
        afterFrame(() => {
          const root = document.getElementById('view-ads-funnel');
          const anchor = root && (root.querySelector('.section-title') || root.firstElementChild);
          placeNotice(root, ADS_FUNNEL_VIEW, visible, total, '\u0441\u0442\u0440\u043e\u043a \u0440\u0435\u043a\u043b\u0430\u043c\u043d\u043e\u0439 \u0432\u043e\u0440\u043e\u043d\u043a\u0438', anchor);
        });
      }
    });
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
    if (view === SKU_CONTOUR_VIEW && typeof window.renderSkuContour === 'function') {
      window.renderSkuContour('view-sku-contour');
      return;
    }
    if (view === SKUS_VIEW && typeof window.renderSkuRegistry === 'function') {
      window.renderSkuRegistry();
      return;
    }
    if (view === LAUNCH_CONTROL_VIEW && typeof window.renderLaunchControl === 'function') {
      window.renderLaunchControl();
      return;
    }
    if (view === ADS_FUNNEL_VIEW && typeof window.renderAdsFunnel === 'function') {
      window.renderAdsFunnel();
      return;
    }
    if (typeof window.rerenderCurrentView === 'function') window.rerenderCurrentView();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('[data-altea-render-budget-expand]');
    if (!button) return;
    const view = button.dataset.alteaRenderBudgetExpand;
    if (view !== SKU_VIEW && view !== PRICES_VIEW && view !== SKU_CONTOUR_VIEW && view !== SKUS_VIEW && view !== LAUNCH_CONTROL_VIEW && view !== ADS_FUNNEL_VIEW) return;
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
    const skusReady = hookSkuRegistryStrict();
    const launchControlReady = hookLaunchControlStrict();
    const adsFunnelReady = hookAdsFunnelStrict();
    if (!isFull(SKU_VIEW)) applySkuBudgetDom();
    if (!isFull(PRICES_VIEW)) applyPricesBudgetDom();
    if (!isFull(SKU_CONTOUR_VIEW)) applySkuContourBudgetDom();
    return skuReady && pricesReady && skusReady && launchControlReady && adsFunnelReady;
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
