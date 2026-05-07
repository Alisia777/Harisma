(function () {
  if (window.__ALTEA_PORTAL_LAZY_RENDER_HOTFIX_20260418L__) return;
  window.__ALTEA_PORTAL_LAZY_RENDER_HOTFIX_20260418L__ = true;

  const LAZY_MODE_DELAY_MS = 9000;
  const DASHBOARD_LOADER_VERSION = '20260418w';
  const DASHBOARD_SCRIPT_PATH = '/portal-dashboard-interactive-hotfix.js';
  const VIEW_RENDERERS = {
    dashboard: ['view-dashboard', 'Дашборд', () => typeof renderDashboard === 'function' && renderDashboard()],
    documents: ['view-documents', 'Документы', () => typeof renderDocuments === 'function' && renderDocuments()],
    repricer: ['view-repricer', 'Репрайсер', () => typeof renderRepricer === 'function' && renderRepricer()],
    prices: ['view-prices', 'Цены', () => typeof window.renderPriceWorkbench === 'function' && window.renderPriceWorkbench()],
    order: ['view-order', 'Логистика и заказ', () => typeof renderOrderCalculator === 'function' && renderOrderCalculator()],
    control: ['view-control', 'Задачи', () => typeof renderControlCenter === 'function' && renderControlCenter()],
    skus: ['view-skus', 'Реестр SKU', () => typeof renderSkuRegistry === 'function' && renderSkuRegistry()],
    launches: ['view-launches', 'Продукт / Ксения', () => typeof renderLaunches === 'function' && renderLaunches()],
    'ads-funnel': ['view-ads-funnel', 'Рекламная воронка', () => typeof renderAdsFunnel === 'function' && renderAdsFunnel('view-ads-funnel')],
    'iu-drr': ['view-iu-drr', 'ИУ / ДРР', () => typeof renderIuDrr === 'function' && renderIuDrr('view-iu-drr')],
    'product-leaderboard': ['view-product-leaderboard', 'Продуктовый лидерборд', () => typeof renderProductLeaderboard === 'function' && renderProductLeaderboard('view-product-leaderboard')],
    'launch-control': ['view-launch-control', 'Запуск новинок', () => typeof renderLaunchControl === 'function' && renderLaunchControl()],
    meetings: ['view-meetings', 'Ритм работы', () => typeof renderMeetings === 'function' && renderMeetings()],
    executive: ['view-executive', 'Руководителю', () => typeof renderExecutive === 'function' && renderExecutive()]
  };

  function getActiveViewKey() {
    const explicit = typeof state === 'object' && state ? state.activeView : '';
    if (explicit && VIEW_RENDERERS[explicit]) return explicit;
    const domView = document.querySelector('.view.active')?.id?.replace(/^view-/, '') || 'dashboard';
    return VIEW_RENDERERS[domView] ? domView : 'dashboard';
  }

  function clearInactiveViews(activeKey) {
    Object.entries(VIEW_RENDERERS).forEach(([key, [rootId]]) => {
      const root = document.getElementById(rootId);
      if (!root) return;
      if (key === activeKey) {
        delete root.dataset.lazyPruned;
        return;
      }
      if (!root.dataset.lazyPruned && root.innerHTML.trim()) {
        root.innerHTML = '';
        root.dataset.lazyPruned = '1';
      }
    });
  }

  function applyUiState(errors) {
    if (typeof state === 'object' && state) state.runtimeErrors = errors;
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
    if (typeof setAppError === 'function') {
      if (errors.length) setAppError(`Портал загрузил не всё: ${errors[0]}`);
      else setAppError('');
    }
  }

  async function ensureDashboardLoader() {
    if (window.__ALTEA_DASHBOARD_INTERACTIVE_20260418A__) return;
    if (window.__ALTEA_DASHBOARD_INTERACTIVE_LOADING_20260418W__) return;
    window.__ALTEA_DASHBOARD_INTERACTIVE_LOADING_20260418W__ = true;
    try {
      if (!window.__ALTEA_DASHBOARD_INTERACTIVE_20260418A__) {
        const response = await fetch(DASHBOARD_SCRIPT_PATH + '?v=' + DASHBOARD_LOADER_VERSION, { cache: 'no-store' });
        if (!response.ok) throw new Error('interactive dashboard script failed to load');
        const source = await response.text();
        const runner = new Function(source + '\n//# sourceURL=portal-dashboard-interactive-hotfix.runtime.js?v=' + DASHBOARD_LOADER_VERSION);
        runner.call(window);
      }
      if (!window.__ALTEA_DASHBOARD_INTERACTIVE_20260418A__) throw new Error('interactive dashboard did not initialize');
    } catch (error) {
      console.warn('[portal-lazy-render-hotfix]', error && error.message ? error.message : error);
    } finally {
      window.__ALTEA_DASHBOARD_INTERACTIVE_LOADING_20260418W__ = false;
    }
  }

  function installLazyRenderer() {
    if (typeof rerenderCurrentView !== 'function' || rerenderCurrentView.__portalLazyRenderWrapped) return false;
    const original = rerenderCurrentView;
    const wrapped = function rerenderOnlyActiveView() {
      if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
      const activeKey = getActiveViewKey();
      if (!VIEW_RENDERERS[activeKey]) {
        return original.apply(this, arguments);
      }
      const [rootId, title, renderer] = VIEW_RENDERERS[activeKey];
      const errors = [];
      try {
        renderer();
      } catch (error) {
        console.error(error);
        errors.push(`${title}: ${error.message}`);
        if (typeof renderViewFailure === 'function') renderViewFailure(rootId, title, error);
      }
      clearInactiveViews(activeKey);
      applyUiState(errors);
    };
    wrapped.__portalLazyRenderWrapped = true;
    rerenderCurrentView = wrapped;
    return true;
  }

  function activateLazyMode() {
    if (!installLazyRenderer()) return;
    const activeKey = getActiveViewKey();
    if (VIEW_RENDERERS[activeKey]) {
      clearInactiveViews(activeKey);
      applyUiState([]);
    }
  }

  function scheduleActivation() {
    window.setTimeout(activateLazyMode, LAZY_MODE_DELAY_MS);
  }

  function bindDashboardLoader() {
    document.querySelectorAll('.nav-btn[data-view="dashboard"]').forEach((button) => {
      if (button.dataset.portalDashboardLoaderBound) return;
      button.dataset.portalDashboardLoaderBound = '1';
      button.addEventListener('click', () => window.setTimeout(() => { void ensureDashboardLoader(); }, 40));
    });
    [2200, 4800].forEach((delay) => {
      window.setTimeout(() => {
        if (!window.__ALTEA_DASHBOARD_INTERACTIVE_20260418A__) void ensureDashboardLoader();
      }, delay);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindDashboardLoader();
      scheduleActivation();
    }, { once: true });
  } else {
    bindDashboardLoader();
    scheduleActivation();
  }
})();
