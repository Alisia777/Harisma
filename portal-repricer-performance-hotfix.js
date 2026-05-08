(function () {
  if (window.__ALTEA_REPRICER_PERFORMANCE_HOTFIX_20260508A__) return;
  window.__ALTEA_REPRICER_PERFORMANCE_HOTFIX_20260508A__ = true;

  const ROOT_ID = 'view-repricer';
  const TEMPLATE_ATTR = 'data-repricer-lite-template';
  const BOUND_ATTR = 'data-repricer-lite-bound';
  const HYDRATED_ATTR = 'data-repricer-lite-hydrated';
  let optimizeTimer = 0;
  let observer = null;
  let lastRenderAt = 0;

  function readBinding(name) {
    try {
      if (typeof window[name] !== 'undefined') return window[name];
    } catch {}
    try {
      return Function(`return typeof ${name} === "undefined" ? undefined : ${name}`)();
    } catch {
      return undefined;
    }
  }

  function assignBinding(name, value) {
    try { window[name] = value; } catch {}
    try { Function('value', `${name} = value;`)(value); } catch {}
  }

  function appState() {
    try {
      if (typeof state === 'object' && state) return state;
    } catch {}
    return window.state || window.__alteaAppState || null;
  }

  function root() {
    return document.getElementById(ROOT_ID);
  }

  function activeRepricer() {
    const app = appState();
    if (String(app?.activeView || '') === 'repricer') return true;
    return document.querySelector(`#${ROOT_ID}.view.active`) != null;
  }

  function hasRenderedRepricer() {
    const host = root();
    return Boolean(host?.querySelector('.repricer-card, [data-repricer-export], #repricerSearchInput'));
  }

  function preserveScroll(callback) {
    const shouldRestore = activeRepricer() && hasRenderedRepricer();
    const x = window.scrollX;
    const y = window.scrollY;
    const result = callback();
    if (shouldRestore) {
      requestAnimationFrame(() => {
        if (activeRepricer() && Math.abs(window.scrollY - y) > 8) {
          window.scrollTo(x, y);
        }
      });
    }
    return result;
  }

  function directChildrenAfterSummary(details) {
    const summary = Array.from(details.children).find((child) => child.tagName === 'SUMMARY');
    if (!summary) return [];
    const nodes = [];
    let node = summary.nextSibling;
    while (node) {
      const next = node.nextSibling;
      if (!(node.nodeType === Node.ELEMENT_NODE && node.hasAttribute(TEMPLATE_ATTR))) nodes.push(node);
      node = next;
    }
    return nodes;
  }

  function hydrateDetails(details) {
    const template = Array.from(details.children).find((child) => child.tagName === 'TEMPLATE' && child.hasAttribute(TEMPLATE_ATTR));
    if (!template) {
      details.setAttribute(HYDRATED_ATTR, '1');
      return;
    }
    details.append(...Array.from(template.content.childNodes));
    template.remove();
    details.setAttribute(HYDRATED_ATTR, '1');
  }

  function dehydrateDetails(details) {
    if (!details || details.open) return;
    if (details.getAttribute(HYDRATED_ATTR) === '0') return;
    const nodes = directChildrenAfterSummary(details);
    const movable = nodes.filter((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim();
      return node.nodeType === Node.ELEMENT_NODE;
    });
    if (!movable.length) {
      details.setAttribute(HYDRATED_ATTR, '0');
      return;
    }
    const template = document.createElement('template');
    template.setAttribute(TEMPLATE_ATTR, '1');
    movable.forEach((node) => template.content.appendChild(node));
    details.appendChild(template);
    details.setAttribute(HYDRATED_ATTR, '0');
  }

  function bindDetails(details) {
    if (!details || details.getAttribute(BOUND_ATTR) === '1') return;
    details.setAttribute(BOUND_ATTR, '1');
    details.addEventListener('toggle', () => {
      if (details.open) {
        hydrateDetails(details);
      } else {
        requestAnimationFrame(() => dehydrateDetails(details));
      }
    });
  }

  function optimizeRepricerDom() {
    const host = root();
    if (!host || !activeRepricer()) return;

    host.querySelectorAll('details').forEach((details) => {
      bindDetails(details);
      if (!details.open) dehydrateDetails(details);
    });

    host.dataset.repricerLiteForms = String(host.querySelectorAll('form').length);
    host.dataset.repricerLiteControls = String(host.querySelectorAll('input, select, textarea, button').length);
  }

  function scheduleOptimize(delay = 0) {
    window.clearTimeout(optimizeTimer);
    optimizeTimer = window.setTimeout(optimizeRepricerDom, delay);
  }

  function wrapRenderRepricer() {
    const candidate = readBinding('renderRepricer');
    if (typeof candidate !== 'function' || candidate.__repricerPerformanceWrapped) return;
    const wrapped = function wrappedRenderRepricer() {
      lastRenderAt = Date.now();
      const result = preserveScroll(() => candidate.apply(this, arguments));
      scheduleOptimize(0);
      scheduleOptimize(120);
      return result;
    };
    wrapped.__repricerPerformanceWrapped = true;
    wrapped.__repricerPerformanceBase = candidate;
    assignBinding('renderRepricer', wrapped);
  }

  function wrapRerenderCurrentView() {
    const candidate = readBinding('rerenderCurrentView');
    if (typeof candidate !== 'function' || candidate.__repricerPerformanceWrapped) return;
    const wrapped = function wrappedRerenderCurrentView() {
      const app = appState();
      const ready = Boolean(app?.boot?.lazyReady?.repricer);
      const loaded = activeRepricer() && ready && hasRenderedRepricer();
      if (loaded && Date.now() - lastRenderAt > 1500) {
        scheduleOptimize(0);
        return undefined;
      }
      const result = preserveScroll(() => candidate.apply(this, arguments));
      scheduleOptimize(0);
      scheduleOptimize(120);
      return result;
    };
    wrapped.__repricerPerformanceWrapped = true;
    wrapped.__repricerPerformanceBase = candidate;
    assignBinding('rerenderCurrentView', wrapped);
  }

  function installObserver() {
    const host = root();
    if (!host || observer) return;
    observer = new MutationObserver(() => scheduleOptimize(80));
    observer.observe(host, { childList: true, subtree: true });
  }

  function boot() {
    wrapRenderRepricer();
    wrapRerenderCurrentView();
    installObserver();
    scheduleOptimize(0);
    scheduleOptimize(500);
    scheduleOptimize(1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener('load', boot, { once: true });
  window.addEventListener('altea:viewchange', () => window.setTimeout(boot, 0));
  window.setTimeout(boot, 1200);
})();
