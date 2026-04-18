(function () {
  if (window.__ALTEA_PORTAL_LAZY_RENDER_HOTFIX_20260418L__) return;
  window.__ALTEA_PORTAL_LAZY_RENDER_HOTFIX_20260418L__ = true;

  const LAZY_MODE_DELAY_MS = 9000;
  const VIEW_RENDERERS = {
    dashboard: ['view-dashboard', 'Дашборд', () => typeof renderDashboard === 'function' && renderDashboard()],
    documents: ['view-documents', 'Документы', () => typeof renderDocuments === 'function' && renderDocuments()],
    repricer: ['view-repricer', 'Репрайсер', () => typeof renderRepricer === 'function' && renderRepricer()],
    order: ['view-order', 'Логистика и заказ', () => typeof renderOrderCalculator === 'function' && renderOrderCalculator()],
    control: ['view-control', 'Задачи', () => typeof renderControlCenter === 'function' && renderControlCenter()],
    skus: ['view-skus', 'Реестр SKU', () => typeof renderSkuRegistry === 'function' && renderSkuRegistry()],
    launches: ['view-launches', 'Продукт / Ксения', () => typeof renderLaunches === 'function' && renderLaunches()],
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleActivation, { once: true });
  } else {
    scheduleActivation();
  }
})();
