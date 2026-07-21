(function () {
  'use strict';

  if (window.__ALTEA_ANALYTICS_DATE_FRESHNESS_V1__) return;
  window.__ALTEA_ANALYTICS_DATE_FRESHNESS_V1__ = true;

  const STORAGE_KEY = 'altea.portal.analyticsDateMax.v1';
  const targetId = ['i', 'u', 'D', 'r', 'r', 'V3', 'DateTo'].join('');
  const TARGETS = [
    { key: 'dashboard-primary', selector: '[data-ceo-date-to]' },
    { key: 'dashboard-executive', selector: '[data-portal-exec-end]' },
    { key: 'plan-fact', selector: '#skuPlanFactDateTo' },
    { key: 'marketing-window', selector: `#${targetId}` }
  ];
  let timer = 0;

  function dateKey(value) {
    const key = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
  }

  function readMaxima() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeMaxima(maxima) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(maxima));
    } catch (_) {}
  }

  function refreshDates() {
    timer = 0;
    const maxima = readMaxima();
    let changedStorage = false;
    TARGETS.forEach((target) => {
      const input = document.querySelector(target.selector);
      if (!(input instanceof HTMLInputElement)) return;
      const value = dateKey(input.value);
      const maxDate = dateKey(input.max);
      const previousMaxDate = dateKey(maxima[target.key]);
      if (!maxDate) return;
      if (maxima[target.key] !== maxDate) {
        maxima[target.key] = maxDate;
        changedStorage = true;
      }
      if (!value || value >= maxDate) return;
      if (previousMaxDate && value !== previousMaxDate) return;
      input.value = maxDate;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (changedStorage) writeMaxima(maxima);
  }

  function schedule() {
    if (timer) return;
    timer = window.setTimeout(refreshDates, 40);
  }

  ['DOMContentLoaded', 'hashchange', 'altea:app-ready', 'altea:data-ready', 'altea:datarefresh', 'altea:viewchange']
    .forEach((eventName) => window.addEventListener(eventName, schedule));

  const observer = new MutationObserver(schedule);
  const start = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    schedule();
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
