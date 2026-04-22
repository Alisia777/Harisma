(function () {
  if (window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260422D__) return;
  window.__ALTEA_DASHBOARD_PRIME_HOTFIX_20260422D__ = true;

  const hotfixCache = {
    orderProcurementPromise: null,
    smartPriceWorkbenchPromise: null
  };

  function num(value) {
    const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function parseIsoDate(value) {
    const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dayCount(start, end) {
    if (!(start instanceof Date) || !(end instanceof Date)) return 0;
    const left = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const right = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.max(0, Math.round((right - left) / 86400000) + 1);
  }

  function monthKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthRange(month) {
    const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);
    return { start, end };
  }

  function formatInt(value) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(num(value)));
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0
    }).format(num(value));
  }

  function formatPct(value) {
    return `${(num(value) * 100).toFixed(1)}%`;
  }

  function getNativeFetch() {
    return window.__ALTEA_DASHBOARD_PRIME_NATIVE_FETCH__ || window.fetch?.bind(window) || null;
  }

  async function loadJsonCached(key, url, fallback) {
    if (hotfixCache[key]) return hotfixCache[key];
    const nativeFetch = getNativeFetch();
    hotfixCache[key] = (async () => {
      if (typeof nativeFetch !== 'function') return fallback;
      try {
        const response = await nativeFetch(url, { cache: 'no-store' });
        if (!response || !response.ok) throw new Error(url);
        return await response.json();
      } catch (error) {
        console.warn('[portal-dashboard-prime-hotfix] load', url, error);
        return fallback;
      }
    })();
    return hotfixCache[key];
  }

  function procurementPlatformKey(platformKey) {
    if (platformKey === 'ym' || platformKey === 'ya') return 'ya';
    return normalizeKey(platformKey);
  }

  function workbenchRowForArticle(workbench, platformKey, article) {
    const rows = workbench?.platforms?.[platformKey]?.rows;
    if (!rows || !article) return null;
    const target = normalizeKey(article);
    return Object.values(rows).find((row) => normalizeKey(row?.article || row?.articleKey) === target) || null;
  }

  function resolveWorkbenchUnitPrice(workbench, platformKey, article) {
    const row = workbenchRowForArticle(workbench, platformKey, article);
    if (!row) return null;
    const fallback = [
      row.currentClientPrice,
      row.currentFillPrice,
      row.planMonthCheck,
      row.basePrice,
      row.price,
      row.minPrice
    ].map((value) => num(value)).find((value) => value > 0);
    return fallback || null;
  }

  function procurementRowsForArticle(procurement, platformKey, article) {
    const rows = Array.isArray(procurement?.rows) ? procurement.rows : [];
    const targetPlatform = procurementPlatformKey(platformKey);
    const targetArticle = normalizeKey(article);
    return rows.filter((row) => {
      return procurementPlatformKey(row?.platform) === targetPlatform
        && normalizeKey(row?.article) === targetArticle;
    });
  }

  function procurementUnitsForDays(row, days) {
    if (days === 7 && row?.sales7 !== undefined) return Math.max(0, num(row.sales7));
    if (days === 14 && row?.sales14 !== undefined) return Math.max(0, num(row.sales14));
    if (days === 28 && row?.sales28 !== undefined) return Math.max(0, num(row.sales28));
    return Math.max(0, num(row?.avgDaily) * days);
  }

  function procurementPlanForRange(row, start, end) {
    if (!(start instanceof Date) || !(end instanceof Date)) return null;
    if (monthKey(start) !== monthKey(end)) return null;
    const bounds = monthRange(monthKey(start));
    if (!bounds) return null;
    const rangeDays = dayCount(start, end);
    const monthDays = dayCount(bounds.start, bounds.end);
    if (rangeDays <= 0 || monthDays <= 0) return null;
    return (num(row?.planMonth) / monthDays) * rangeDays;
  }

  async function resolveProcurementFacts(platformKey, article, startIso, endIso) {
    const start = parseIsoDate(startIso);
    const end = parseIsoDate(endIso);
    if (!article || !(start instanceof Date) || !(end instanceof Date)) return null;

    const [procurement, workbench] = await Promise.all([
      loadJsonCached('orderProcurementPromise', 'data/order_procurement.json', { rows: [] }),
      loadJsonCached('smartPriceWorkbenchPromise', 'data/smart_price_workbench.json', { platforms: {} })
    ]);

    const rows = procurementRowsForArticle(procurement, platformKey, article);
    if (!rows.length) return null;

    const days = dayCount(start, end);
    const actualUnits = rows.reduce((sum, row) => sum + procurementUnitsForDays(row, days), 0);
    const planUnits = rows.reduce((sum, row) => sum + (procurementPlanForRange(row, start, end) ?? 0), 0);
    const unitPrice = resolveWorkbenchUnitPrice(workbench, platformKey, article);
    const revenue = unitPrice && actualUnits > 0 ? actualUnits * unitPrice : 0;

    return {
      actualUnits,
      planUnits: planUnits > 0 ? planUnits : null,
      revenue,
      completionPct: planUnits > 0 ? actualUnits / planUnits : null
    };
  }

  function parseDisplayedNumber(text) {
    const normalized = String(text || '')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u20BD%]/g, '')
      .replace(/[^\d,.\- ]+/g, '')
      .trim();
    if (!normalized || normalized === '-' || normalized === '\u2014') return null;
    const compact = normalized.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(compact);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function cellLooksEmpty(cell) {
    if (!cell) return true;
    const text = String(cell.textContent || '').trim();
    if (!text || text === '-' || text === '\u2014') return true;
    const parsed = parseDisplayedNumber(text);
    return parsed !== null && parsed === 0;
  }

  function findColumnIndex(headers, patterns) {
    return headers.findIndex((header) => patterns.some((pattern) => header.includes(pattern)));
  }

  async function patchSkuFactTable(table) {
    const headerTexts = Array.from(table.querySelectorAll('thead th')).map((node) => normalizeKey(node.textContent));
    if (!headerTexts.includes('sku')) return;

    const revenueIndex = findColumnIndex(headerTexts, ['\u0432\u044b\u0440\u0443\u0447']);
    const actualIndex = findColumnIndex(headerTexts, ['\u0444\u0430\u043a\u0442']);
    const planIndex = findColumnIndex(headerTexts, ['\u043f\u043b\u0430\u043d']);
    const pctIndex = findColumnIndex(headerTexts, ['%', '\u0432\u044b\u043f\u043e\u043b\u043d']);
    const sourceIndex = findColumnIndex(headerTexts, ['\u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a']);

    const rows = Array.from(table.querySelectorAll('tbody tr[data-open-price-article]'));
    if (!rows.length) return;

    for (const row of rows) {
      if (row.dataset.procurementPatched === '1') continue;
      const cells = Array.from(row.children);
      const facts = await resolveProcurementFacts(
        row.dataset.openPriceMarket || 'wb',
        row.dataset.openPriceArticle || '',
        row.dataset.openPriceFrom || '',
        row.dataset.openPriceTo || ''
      );
      if (!facts) continue;

      let changed = false;

      if (actualIndex >= 0 && cellLooksEmpty(cells[actualIndex]) && facts.actualUnits > 0) {
        cells[actualIndex].textContent = formatInt(facts.actualUnits);
        changed = true;
      }

      if (planIndex >= 0 && cellLooksEmpty(cells[planIndex]) && facts.planUnits !== null) {
        cells[planIndex].textContent = formatInt(facts.planUnits);
        changed = true;
      }

      if (revenueIndex >= 0 && cellLooksEmpty(cells[revenueIndex]) && facts.revenue > 0) {
        cells[revenueIndex].textContent = formatMoney(facts.revenue);
        changed = true;
      }

      if (pctIndex >= 0 && cellLooksEmpty(cells[pctIndex]) && facts.completionPct !== null) {
        cells[pctIndex].textContent = formatPct(facts.completionPct);
        changed = true;
      }

      if (sourceIndex >= 0) {
        const sourceCell = cells[sourceIndex];
        const sourceText = normalizeKey(sourceCell?.textContent || '');
        if (!sourceText || sourceText === '\u043d\u0435\u0442') {
          sourceCell.textContent = 'procurement';
          changed = true;
        }
      }

      if (changed) row.dataset.procurementPatched = '1';
    }
  }

  async function patchVisibleDashboardModal() {
    const modal = document.getElementById('portalDashboardExecutiveModal');
    if (!modal || !modal.classList.contains('is-open')) return;
    const tables = Array.from(modal.querySelectorAll('.portal-exec-modal-table'));
    for (const table of tables) {
      await patchSkuFactTable(table);
    }
  }

  let modalPatchTimer = 0;

  function scheduleModalPatch(delay = 80) {
    window.clearTimeout(modalPatchTimer);
    modalPatchTimer = window.setTimeout(() => {
      patchVisibleDashboardModal().catch((error) => {
        console.warn('[portal-dashboard-prime-hotfix] modal patch', error);
      });
    }, delay);
  }

  function installDashboardModalPatchObserver() {
    if (window.__ALTEA_DASHBOARD_MODAL_PROCUREMENT_PATCH_20260422D__) return;
    window.__ALTEA_DASHBOARD_MODAL_PROCUREMENT_PATCH_20260422D__ = true;

    const attach = () => {
      const modal = document.getElementById('portalDashboardExecutiveModal');
      if (!modal || modal.dataset.procurementObserverBound === '1') return false;
      const observer = new MutationObserver(() => scheduleModalPatch(60));
      observer.observe(modal, { attributes: true, childList: true, subtree: true });
      modal.dataset.procurementObserverBound = '1';
      scheduleModalPatch(60);
      return true;
    };

    if (attach()) return;

    const bodyObserver = new MutationObserver(() => {
      if (attach()) bodyObserver.disconnect();
    });
    bodyObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
    window.setTimeout(() => bodyObserver.disconnect(), 15000);
  }

  function installPriceWorkbenchSupportRedirect() {
    if (window.__ALTEA_PRICE_SUPPORT_REDIRECT_20260422D__) return;
    window.__ALTEA_PRICE_SUPPORT_REDIRECT_20260422D__ = true;

    const nativeFetch = window.fetch?.bind(window);
    if (typeof nativeFetch === 'function') window.__ALTEA_DASHBOARD_PRIME_NATIVE_FETCH__ = nativeFetch;
    if (typeof nativeFetch !== 'function') return;

    const fallbackPayload = JSON.stringify({
      generatedAt: new Date().toISOString(),
      platforms: {
        wb: { rows: {} },
        ozon: { rows: {} },
        ym: { rows: {} }
      }
    });

    function jsonResponse(text) {
      return new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    async function inflateBase64Gzip(base64) {
      const normalized = String(base64 || '').replace(/\s+/g, '');
      if (!normalized || typeof DecompressionStream !== 'function') return '';
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).text();
    }

    async function loadSupportLiteParts() {
      const partUrls = [
        'portal-dashboard-support-lite.gz.part01.txt?v=20260422i',
        'portal-dashboard-support-lite.gz.part02.txt?v=20260422i',
        'portal-dashboard-support-lite.gz.part03.txt?v=20260422i',
        'portal-dashboard-support-lite.gz.part04.txt?v=20260422i'
      ];
      try {
        const parts = await Promise.all(partUrls.map(async (url) => {
          const response = await nativeFetch(url, { cache: 'no-store' });
          if (!response || !response.ok) throw new Error(url);
          return response.text();
        }));
        const text = await inflateBase64Gzip(parts.join(''));
        if (text && text.trim()) return jsonResponse(text);
      } catch {}
      return null;
    }

    async function loadSupportPayload() {
      const candidates = [
        'data/price_workbench_support.compact.json',
        'data/price_workbench_support.dashboard-compact.json'
      ];
      for (const candidate of candidates) {
        try {
          const response = await nativeFetch(candidate, { cache: 'no-store' });
          if (response && response.ok) {
            const text = await response.text();
            if (text && text.trim()) return jsonResponse(text);
          }
        } catch {}
      }
      const liteResponse = await loadSupportLiteParts();
      if (liteResponse) return liteResponse;
      return jsonResponse(fallbackPayload);
    }

    window.fetch = function redirectedFetch(input, init) {
      try {
        const rawUrl = typeof input === 'string'
          ? input
          : (input && typeof input.url === 'string' ? input.url : '');
        if (rawUrl && rawUrl.includes('data/price_workbench_support.json')) {
          return loadSupportPayload();
        }
      } catch {}
      return nativeFetch(input, init);
    };
  }

  function isDashboardActive() {
    return (typeof state === 'object' && state && state.activeView === 'dashboard')
      || !!document.getElementById('view-dashboard')?.classList.contains('active');
  }

  let softPrimeTimer = 0;

  function safePrimeDashboard() {
    installPriceWorkbenchSupportRedirect();
    installDashboardModalPatchObserver();
    scheduleModalPatch(80);
    if (!isDashboardActive()) return;
    if (document.getElementById('portalDashboardExecutiveRoot')) return;

    try {
      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
        return;
      }
      if (typeof window.rerenderCurrentView === 'function') {
        window.rerenderCurrentView();
      }
    } catch (error) {
      console.warn('[portal-dashboard-prime-hotfix] soft prime', error);
    }
  }

  function scheduleSoftPrime(delay = 120) {
    window.clearTimeout(softPrimeTimer);
    softPrimeTimer = window.setTimeout(safePrimeDashboard, delay);
  }

  installPriceWorkbenchSupportRedirect();
  installDashboardModalPatchObserver();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleSoftPrime(120), { once: true });
  } else {
    scheduleSoftPrime(120);
  }

  window.addEventListener('load', () => scheduleSoftPrime(240), { once: true });
  window.addEventListener('altea:viewchange', (event) => {
    if (event?.detail?.view === 'dashboard') {
      scheduleSoftPrime(120);
      scheduleModalPatch(140);
    }
  });
  document.addEventListener('click', () => scheduleModalPatch(140), true);
})();
