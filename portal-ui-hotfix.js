(function () {
  if (window.__ALTEA_PORTAL_UI_HOTFIX_20260421A__) return;
  window.__ALTEA_PORTAL_UI_HOTFIX_20260421A__ = true;

  const STYLE_ID = 'altea-portal-ui-hotfix-20260421a';
  const HOTFIX_VERSION = '20260421a';
  const hotfixCache = {
    dashboard: null,
    platformTrends: null,
    logistics: null,
    logisticsLive: null,
    smartPriceWorkbench: null,
    smartPriceWorkbenchLive: null,
    warehouseStockOverlay: null
  };

  function appState(key) {
    if (typeof state !== 'object' || !state) return null;
    return state[key] || null;
  }

  function cachedData(key) {
    return appState(key) || hotfixCache[key] || null;
  }

  function logisticsData() {
    const primary = cachedData('logistics');
    const fallback = cachedData('logisticsLive');
    const primaryRows = Array.isArray(primary?.allRows) ? primary.allRows.length : 0;
    const fallbackRows = Array.isArray(fallback?.allRows) ? fallback.allRows.length : 0;
    return fallbackRows > primaryRows ? fallback : primary;
  }

  function smartWorkbenchData() {
    const primary = cachedData('smartPriceWorkbench');
    const fallback = cachedData('smartPriceWorkbenchLive');
    const primaryRows = collectWorkbenchRows(primary);
    const fallbackRows = collectWorkbenchRows(fallback);
    const primaryHasWarehouse = primaryRows.some((row) => row?.stockWarehouse != null || row?.warehouseStock != null || row?.myWarehouseStock != null);
    const fallbackHasWarehouse = fallbackRows.some((row) => row?.stockWarehouse != null || row?.warehouseStock != null || row?.myWarehouseStock != null);
    if (fallbackHasWarehouse && !primaryHasWarehouse) return fallback;
    return primary || fallback;
  }

  async function ensureHotfixJson(path, key) {
    const existing = cachedData(key);
    if (existing) return existing;

    if (typeof window.__alteaLoadPortalSnapshot === 'function') {
      try {
        const snapshot = await window.__alteaLoadPortalSnapshot(path);
        if (snapshot !== null && snapshot !== undefined) {
          hotfixCache[key] = snapshot;
          if (typeof state === 'object' && state && !state[key]) {
            state[key] = snapshot;
          }
          return snapshot;
        }
      } catch (error) {
        console.warn(`[portal-ui-hotfix] snapshot ${path}`, error);
      }
    }

    const resolvedPath = path.includes('?') ? path : `${path}?v=${HOTFIX_VERSION}`;
    const response = await fetch(resolvedPath, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load ${path}`);

    const rawText = await response.text();
    const sanitized = typeof sanitizeLooseJson === 'function' ? sanitizeLooseJson(rawText) : rawText;
    const parsed = JSON.parse(sanitized);
    hotfixCache[key] = parsed;

    if (typeof state === 'object' && state && !state[key]) {
      state[key] = parsed;
    }

    return parsed;
  }

  function ensureImperialState() {
    if (typeof state !== 'object' || !state) return {};
    state.imperial = state.imperial || {};
    if (!state.imperial.targetDays) state.imperial.targetDays = 14;
    if (!state.imperial.riskPlatform) state.imperial.riskPlatform = 'all';
    if (!state.imperial.clusterFilter) state.imperial.clusterFilter = 'all';
    if (!state.imperial.warehouseFilter) state.imperial.warehouseFilter = 'all';
    if (!state.imperial.orderTargetDays) state.imperial.orderTargetDays = 30;
    if (!state.imperial.orderPlatform) state.imperial.orderPlatform = 'wb';
    return state.imperial;
  }

  function toNumber(value) {
    if (typeof numberOrZero === 'function') return numberOrZero(value);
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return 0;
    return Number(value);
  }

  function average(values) {
    const numbers = values.map(toNumber).filter((value) => Number.isFinite(value));
    if (!numbers.length) return 0;
    return numbers.reduce((acc, value) => acc + value, 0) / numbers.length;
  }

  function parseIsoDate(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatRuDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  function uniq(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .portal-ui-hotfix-dashboard {
        margin-top: 18px;
        padding: 18px;
      }
      .portal-ui-hotfix-dashboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .portal-ui-hotfix-card {
        border: 1px solid rgba(212, 164, 74, 0.14);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(23, 17, 12, 0.94), rgba(12, 10, 9, 0.96));
        padding: 14px;
      }
      .portal-ui-hotfix-card.is-danger {
        border-color: rgba(203, 88, 65, 0.45);
      }
      .portal-ui-hotfix-card.is-warn {
        border-color: rgba(212, 164, 74, 0.45);
      }
      .portal-ui-hotfix-card.is-ok {
        border-color: rgba(118, 180, 121, 0.4);
      }
      .portal-ui-hotfix-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }
      .portal-ui-hotfix-metric,
      .portal-ui-hotfix-filter select {
        border-radius: 14px;
      }
      .portal-ui-hotfix-metric {
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.045);
      }
      .portal-ui-hotfix-metric span,
      .portal-ui-hotfix-filter span {
        display: block;
        color: rgba(255, 244, 229, 0.62);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 6px;
      }
      .portal-ui-hotfix-metric strong {
        display: block;
        font-size: 24px;
        line-height: 1.1;
      }
      .portal-ui-hotfix-foot {
        margin-top: 10px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .portal-ui-hotfix-hero-pulse {
        margin-top: 16px;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(212, 164, 74, 0.16);
        background: linear-gradient(180deg, rgba(24, 18, 14, 0.9), rgba(13, 10, 8, 0.94));
      }
      .portal-ui-hotfix-hero-pulse-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .portal-ui-hotfix-hero-card {
        padding: 12px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        background: rgba(255, 255, 255, 0.025);
      }
      .portal-ui-hotfix-hero-card.is-ok {
        border-color: rgba(118, 180, 121, 0.36);
      }
      .portal-ui-hotfix-hero-card.is-warn {
        border-color: rgba(212, 164, 74, 0.4);
      }
      .portal-ui-hotfix-hero-card.is-danger {
        border-color: rgba(203, 88, 65, 0.42);
      }
      .portal-ui-hotfix-hero-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .portal-ui-hotfix-hero-name {
        color: rgba(255, 244, 229, 0.8);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .portal-ui-hotfix-hero-value {
        margin-top: 10px;
        font-size: 28px;
        line-height: 1;
        font-weight: 700;
      }
      .portal-ui-hotfix-hero-sub {
        margin-top: 6px;
        color: rgba(255, 244, 229, 0.62);
        font-size: 12px;
      }
      .portal-ui-hotfix-progress {
        margin-top: 12px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.07);
        overflow: hidden;
      }
      .portal-ui-hotfix-progress > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(212, 164, 74, 0.95), rgba(236, 203, 123, 0.95));
      }
      .portal-ui-hotfix-progress.is-ok > span {
        background: linear-gradient(90deg, rgba(95, 189, 121, 0.95), rgba(155, 219, 171, 0.95));
      }
      .portal-ui-hotfix-progress.is-danger > span {
        background: linear-gradient(90deg, rgba(203, 88, 65, 0.95), rgba(232, 125, 102, 0.95));
      }
      .portal-ui-hotfix-sparkline {
        display: block;
        width: 100%;
        height: 54px;
        margin-top: 12px;
      }
      .portal-ui-hotfix-sparkline path {
        fill: none;
        stroke: rgba(236, 203, 123, 0.96);
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .portal-ui-hotfix-sparkline .track {
        opacity: 0.28;
      }
      .portal-ui-hotfix-sparkline .fill {
        fill: rgba(236, 203, 123, 0.24);
        opacity: 0.14;
      }
      .portal-ui-hotfix-hero-card.is-ok .portal-ui-hotfix-sparkline path {
        stroke: rgba(140, 223, 162, 0.96);
      }
      .portal-ui-hotfix-hero-card.is-ok .portal-ui-hotfix-sparkline .fill {
        fill: rgba(140, 223, 162, 0.22);
      }
      .portal-ui-hotfix-hero-card.is-danger .portal-ui-hotfix-sparkline path {
        stroke: rgba(232, 125, 102, 0.96);
      }
      .portal-ui-hotfix-hero-card.is-danger .portal-ui-hotfix-sparkline .fill {
        fill: rgba(232, 125, 102, 0.22);
      }
      .portal-ui-hotfix-logistics {
        margin-top: 18px;
      }
      .portal-ui-hotfix-ops-grid {
        display: grid;
        grid-template-columns: 1.2fr 1.2fr 1fr;
        gap: 12px;
        margin-top: 14px;
      }
      .portal-ui-hotfix-stack {
        display: grid;
        gap: 14px;
        margin-top: 14px;
      }
      .portal-ui-hotfix-filters {
        display: grid;
        grid-template-columns: minmax(180px, 260px) minmax(180px, 320px) auto 1fr;
        gap: 12px;
        align-items: end;
        margin-top: 14px;
      }
      .portal-ui-hotfix-filter select {
        width: 100%;
        border: 1px solid rgba(212, 164, 74, 0.18);
        background: rgba(17, 14, 11, 0.96);
        color: #fff1dd;
        padding: 10px 12px;
      }
      .portal-ui-hotfix-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
      }
      .portal-ui-hotfix-table .table-wrap {
        margin-top: 12px;
      }
      .portal-ui-hotfix-procurement {
        margin-top: 18px;
      }
      .portal-ui-hotfix-procurement-controls {
        display: grid;
        grid-template-columns: minmax(180px, 220px) auto 1fr auto;
        gap: 12px;
        align-items: end;
        margin-top: 14px;
      }
      .portal-ui-hotfix-procurement-input input {
        width: 100%;
        border-radius: 14px;
        border: 1px solid rgba(212, 164, 74, 0.18);
        background: rgba(17, 14, 11, 0.96);
        color: #fff1dd;
        padding: 10px 12px;
      }
      .portal-ui-hotfix-procurement-platforms {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .portal-ui-hotfix-procurement-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        flex-wrap: wrap;
      }
      .portal-ui-hotfix-procurement-summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .portal-ui-hotfix-procurement-table-wrap {
        margin-top: 14px;
        overflow: auto;
      }
      .portal-ui-hotfix-procurement-table {
        width: 100%;
        min-width: 1280px;
        border-collapse: collapse;
      }
      .portal-ui-hotfix-procurement-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: rgba(18, 14, 11, 0.98);
        white-space: nowrap;
      }
      .portal-ui-hotfix-procurement-table thead tr:first-child th {
        top: 0;
        z-index: 3;
        border-bottom: 1px solid rgba(212, 164, 74, 0.22);
      }
      .portal-ui-hotfix-procurement-table thead tr:last-child th {
        top: 38px;
      }
      .portal-ui-hotfix-procurement-table td,
      .portal-ui-hotfix-procurement-table th {
        vertical-align: top;
      }
      .portal-ui-hotfix-procurement-table td:first-child,
      .portal-ui-hotfix-procurement-table th:first-child {
        min-width: 260px;
      }
      .portal-ui-hotfix-procurement-table td:nth-child(2),
      .portal-ui-hotfix-procurement-table th:nth-child(2) {
        min-width: 150px;
      }
      .portal-ui-hotfix-procurement-table td:nth-child(3),
      .portal-ui-hotfix-procurement-table td:nth-child(4),
      .portal-ui-hotfix-procurement-table td:nth-child(5) {
        min-width: 110px;
      }
      .portal-ui-hotfix-procurement-group {
        text-align: center;
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      .portal-ui-hotfix-sku-cell strong {
        display: block;
        margin-bottom: 4px;
      }
      .portal-ui-hotfix-sku-meta {
        color: rgba(255, 244, 229, 0.58);
        font-size: 12px;
        line-height: 1.45;
      }
      .portal-ui-hotfix-number {
        text-align: right;
        white-space: nowrap;
      }
      .portal-ui-hotfix-total-need {
        min-width: 110px;
      }
      .portal-ui-hotfix-empty-row td {
        text-align: center;
        color: rgba(255, 244, 229, 0.68);
        padding: 18px 12px;
      }
      .portal-ui-hotfix-caption {
        margin-top: 8px;
        color: rgba(255, 244, 229, 0.55);
        font-size: 12px;
      }
      @media (max-width: 1320px) {
        .portal-ui-hotfix-ops-grid {
          grid-template-columns: 1fr;
        }
        .portal-ui-hotfix-filters {
          grid-template-columns: 1fr 1fr;
        }
        .portal-ui-hotfix-procurement-controls {
          grid-template-columns: 1fr 1fr;
        }
        .portal-ui-hotfix-procurement-summary {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .portal-ui-hotfix-actions {
          justify-content: flex-start;
        }
      }
      @media (max-width: 900px) {
        .portal-ui-hotfix-metrics {
          grid-template-columns: 1fr;
        }
        .portal-ui-hotfix-hero-pulse-grid {
          grid-template-columns: 1fr;
        }
        .portal-ui-hotfix-filters {
          grid-template-columns: 1fr;
        }
        .portal-ui-hotfix-procurement-controls,
        .portal-ui-hotfix-procurement-summary {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function platformSeries(key) {
    const platforms = Array.isArray(cachedData('platformTrends')?.platforms) ? cachedData('platformTrends').platforms : [];
    return platforms.find((item) => item.key === key) || null;
  }

  function toneClass(pct) {
    if (pct >= 1) return 'is-ok';
    if (pct >= 0.85) return 'is-warn';
    return 'is-danger';
  }

  function buildDailyExecutionModel() {
    const dashboard = cachedData('dashboard') || {};
    const summary = dashboard?.brandSummary?.[0] || {};
    const monthPlanUnits = toNumber(summary.apr_plan_units);
    const overallToDatePct = toNumber(summary.apr_plan_completion_to_date_pct);
    const asOfDate = parseIsoDate(dashboard?.dataFreshness?.asOfDate);
    const today = new Date();
    const monthRef = asOfDate || today;
    const monthDays = new Date(monthRef.getFullYear(), monthRef.getMonth() + 1, 0).getDate();
    const dailyPlanBase = monthPlanUnits > 0 && monthDays > 0 ? monthPlanUnits / monthDays : 0;

    const detailedPlatforms = ['wb', 'ozon', 'ya']
      .map((key) => platformSeries(key))
      .filter(Boolean);
    const totalRecentUnits = detailedPlatforms.reduce((acc, item) => acc + item.series.reduce((sum, point) => sum + toNumber(point?.units), 0), 0);

    const cards = [];
    const totalSeries = platformSeries('all');
    if (totalSeries?.series?.length && dailyPlanBase > 0) {
      const latest = totalSeries.series[totalSeries.series.length - 1];
      const pct = toNumber(latest?.units) / dailyPlanBase;
      cards.push({
        key: 'all',
        label: 'Все площадки',
        targetUnits: dailyPlanBase,
        factUnits: toNumber(latest?.units),
        trailingUnits: average(totalSeries.series.slice(-3).map((point) => point?.units)),
        share: 1,
        pct
      });
    }

    for (const item of detailedPlatforms) {
      const totalUnits = item.series.reduce((acc, point) => acc + toNumber(point?.units), 0);
      const share = totalRecentUnits > 0 ? totalUnits / totalRecentUnits : 0;
      const latest = item.series[item.series.length - 1];
      const targetUnits = dailyPlanBase * share;
      const pct = targetUnits > 0 ? toNumber(latest?.units) / targetUnits : 0;
      cards.push({
        key: item.key,
        label: item.label || item.key.toUpperCase(),
        targetUnits,
        factUnits: toNumber(latest?.units),
        trailingUnits: average(item.series.slice(-3).map((point) => point?.units)),
        share,
        pct
      });
    }

    return {
      cards,
      monthLabel: monthRef.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }),
      todayLabel: formatRuDate(today),
      asOfLabel: formatRuDate(asOfDate || today),
      overallToDatePct
    };
  }

  function sparklineGeometry(values) {
    const clean = values.map(toNumber).filter((value) => Number.isFinite(value));
    if (!clean.length) return null;
    const width = 176;
    const height = 54;
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const range = Math.max(1, max - min);
    const points = clean.map((value, index) => {
      const x = clean.length === 1 ? width / 2 : (index / Math.max(1, clean.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      width,
      height,
      line: `M ${points.join(' L ')}`,
      fill: `M ${points.join(' L ')} L ${width},${height} L 0,${height} Z`
    };
  }

  function renderHeroPulse() {
    const model = buildDailyExecutionModel();
    if (!model.cards.length) return '';
    const cards = model.cards.slice(0, 4);
    return `
      <div class="portal-ui-hotfix-hero-pulse" data-portal-ui-hotfix-hero>
        <div class="section-subhead">
          <div>
            <h3>Живой темп площадок</h3>
            <p class="small muted">Текущий ритм по последнему факту и короткой динамике за несколько дней.</p>
          </div>
          <div class="badge-stack">
            ${badge(`К дате: ${fmt.pct(model.overallToDatePct)}`, model.overallToDatePct >= 1 ? 'ok' : (model.overallToDatePct >= 0.85 ? 'warn' : 'danger'))}
            ${badge(`Факт: ${model.asOfLabel}`, 'info')}
          </div>
        </div>
        <div class="portal-ui-hotfix-hero-pulse-grid">
          ${cards.map((card) => {
            const tone = toneClass(card.pct);
            const series = platformSeries(card.key)?.series || [];
            const spark = sparklineGeometry(series.map((point) => point?.units));
            const progressWidth = Math.max(6, Math.min(100, Math.round(toNumber(card.pct) * 100)));
            return `
              <div class="portal-ui-hotfix-hero-card ${tone}">
                <div class="portal-ui-hotfix-hero-head">
                  <span class="portal-ui-hotfix-hero-name">${escapeHtml(card.label)}</span>
                  ${badge(fmt.pct(card.pct), card.pct >= 1 ? 'ok' : (card.pct >= 0.85 ? 'warn' : 'danger'))}
                </div>
                <div class="portal-ui-hotfix-hero-value">${escapeHtml(fmt.int(card.factUnits))}</div>
                <div class="portal-ui-hotfix-hero-sub">План дня ${escapeHtml(fmt.int(card.targetUnits))} · среднее 3 дня ${escapeHtml(fmt.int(card.trailingUnits))}</div>
                <div class="portal-ui-hotfix-progress ${tone}"><span style="width:${progressWidth}%"></span></div>
                ${spark ? `
                  <svg class="portal-ui-hotfix-sparkline" viewBox="0 0 ${spark.width} ${spark.height}" preserveAspectRatio="none" aria-hidden="true">
                    <path class="fill" d="${spark.fill}"></path>
                    <path class="track" d="${spark.line}"></path>
                    <path d="${spark.line}"></path>
                  </svg>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderDashboardExecution() {
    const model = buildDailyExecutionModel();
    if (!model.cards.length) return '';
    return `
      <section class="card portal-ui-hotfix-dashboard" data-portal-ui-hotfix-dashboard>
        <div class="section-subhead">
          <div>
            <h3>Выполнение площадок на текущий день</h3>
            <p class="small muted">Линейный план дня на ${escapeHtml(model.todayLabel)}. Последний доступный факт в данных портала: ${escapeHtml(model.asOfLabel)}.</p>
          </div>
          <div class="badge-stack">
            ${badge(`Месяц: ${model.monthLabel}`, 'info')}
            ${badge(`К дате: ${fmt.pct(model.overallToDatePct)}`, model.overallToDatePct >= 1 ? 'ok' : (model.overallToDatePct >= 0.85 ? 'warn' : 'danger'))}
          </div>
        </div>
        <div class="portal-ui-hotfix-dashboard-grid">
          ${model.cards.map((card) => `
            <div class="portal-ui-hotfix-card ${toneClass(card.pct)}">
              <div class="section-subhead">
                <div>
                  <h3>${escapeHtml(card.label)}</h3>
                  <p class="small muted">План на ${escapeHtml(model.todayLabel)} · факт последнего доступного дня ${escapeHtml(model.asOfLabel)}</p>
                </div>
                ${badge(fmt.pct(card.pct), card.pct >= 1 ? 'ok' : (card.pct >= 0.85 ? 'warn' : 'danger'))}
              </div>
              <div class="portal-ui-hotfix-metrics">
                <div class="portal-ui-hotfix-metric">
                  <span>План дня</span>
                  <strong>${escapeHtml(fmt.int(card.targetUnits))}</strong>
                </div>
                <div class="portal-ui-hotfix-metric">
                  <span>Факт D-1</span>
                  <strong>${escapeHtml(fmt.int(card.factUnits))}</strong>
                </div>
                <div class="portal-ui-hotfix-metric">
                  <span>Среднее 3 дня</span>
                  <strong>${escapeHtml(fmt.int(card.trailingUnits))}</strong>
                </div>
              </div>
              <div class="portal-ui-hotfix-foot muted small">
                <span>Доля в операционном миксе: ${escapeHtml(fmt.pct(card.share))}</span>
                <span>Темп к дневному плану: ${escapeHtml(fmt.pct(card.pct))}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function getNeedForTarget(row, targetDays) {
    return toNumber(row?.[`targetNeed${targetDays}`]);
  }

  function turnoverBadge(days) {
    if (days === null || days === undefined || Number.isNaN(Number(days))) return badge('Покрытие —');
    const value = Number(days);
    if (value < 7) return badge(`${fmt.num(value, 1)} дн.`, 'danger');
    if (value < 14) return badge(`${fmt.num(value, 1)} дн.`, 'warn');
    return badge(`${fmt.num(value, 1)} дн.`, 'ok');
  }

  function renderEmptyRows(colspan, text) {
    return `<tr><td colspan="${colspan}" class="text-center muted">${escapeHtml(text)}</td></tr>`;
  }

  function renderRows(rows, mode, targetDays) {
    if (!rows.length) {
      if (mode === 'status') return renderEmptyRows(3, 'Нет строк под текущий фильтр');
      if (mode === 'backlog') return renderEmptyRows(5, 'Нет backlog по текущему фильтру');
      if (mode === 'central') return renderEmptyRows(2, 'Нет данных центрального склада');
      if (mode === 'cluster' || mode === 'warehouse-ozon') return renderEmptyRows(9, 'Нет строк под текущий фильтр');
      if (mode === 'warehouse-wb') return renderEmptyRows(8, 'Нет строк под текущий фильтр');
      return renderEmptyRows(10, 'Нет строк под текущий фильтр');
    }

    if (mode === 'status') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.label || 'Статус')}</strong></td>
          <td>${fmt.int(row.orders)}</td>
          <td>${fmt.int(row.units)}</td>
        </tr>
      `).join('');
    }

    if (mode === 'backlog') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.cluster)}</strong></td>
          <td>${fmt.int(row.orders)}</td>
          <td>${fmt.int(row.units)}</td>
          <td>${badge(`сборка ${fmt.int(row.waitingAssembly)}`, toNumber(row.waitingAssembly) > 0 ? 'warn' : 'ok')}</td>
          <td>${badge(`отгрузка ${fmt.int(row.waitingShip)}`, toNumber(row.waitingShip) > 0 ? 'danger' : 'ok')}</td>
        </tr>
      `).join('');
    }

    if (mode === 'central') {
      return rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td><strong>${escapeHtml(row.value)}</strong></td>
        </tr>
      `).join('');
    }

    if (mode === 'cluster') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.name)}</strong></td>
          <td>${fmt.int(row.units)}</td>
          <td>${fmt.num(row.avgDailyUnits28, 1)}</td>
          <td>${fmt.int(row.available)}</td>
          <td>${fmt.int(row.inTransit)}</td>
          <td>${turnoverBadge(row.coverageDays)}</td>
          <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
          <td>${fmt.pct(row.localShare)}</td>
          <td>${fmt.int(row.skuCount)}</td>
        </tr>
      `).join('');
    }

    if (mode === 'warehouse-ozon') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.warehouse)}</strong><div class="muted small">${escapeHtml(row.cluster || '—')}</div></td>
          <td>${fmt.int(row.units)}</td>
          <td>${fmt.num(row.avgDailyUnits28, 1)}</td>
          <td>${fmt.int(row.available)}</td>
          <td>${fmt.int(row.inTransit)}</td>
          <td>${turnoverBadge(row.coverageDays)}</td>
          <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
          <td>${fmt.pct(row.localShare)}</td>
          <td>${fmt.int(row.skuCount)}</td>
        </tr>
      `).join('');
    }

    if (mode === 'warehouse-wb') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.name)}</strong></td>
          <td>${fmt.int(row.ordersUnits)}</td>
          <td>${fmt.num(row.avgDailyUnits, 1)}</td>
          <td>${fmt.int(row.stock)}</td>
          <td>${turnoverBadge(row.coverageDays)}</td>
          <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
          <td>${fmt.money(row.payout)}</td>
          <td>${fmt.int(row.skuCount)}</td>
        </tr>
      `).join('');
    }

    return rows.map((row) => `
      <tr>
        <td>${badge(row.platform, String(row.platform).toLowerCase() === 'ozon' ? 'info' : 'ok')}</td>
        <td><strong>${escapeHtml(row.place)}</strong></td>
        <td>${typeof linkToSku === 'function' ? linkToSku(row.article, row.article) : escapeHtml(row.article)}</td>
        <td>${escapeHtml(row.name || 'Без названия')}</td>
        <td>${escapeHtml(row.owner || 'Без owner')}</td>
        <td>${fmt.num(row.avgDaily, 1)}</td>
        <td>${fmt.int(row.inStock)}</td>
        <td>${fmt.int(row.inTransit)}</td>
        <td>${turnoverBadge(row.turnoverDays)}</td>
        <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
      </tr>
    `).join('');
  }

  function tableCard(title, subtitle, rows, mode, headers, targetDays, metaHtml = '', caption = '') {
    return `
      <div class="card portal-ui-hotfix-table">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p class="small muted">${escapeHtml(subtitle)}</p>
          </div>
          <div class="badge-stack">${metaHtml}</div>
        </div>
        <div class="table-wrap imperial-table-wrap">
          <table>
            <thead>
              <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
            </thead>
            <tbody>${renderRows(rows, mode, targetDays)}</tbody>
          </table>
        </div>
        ${caption ? `<div class="portal-ui-hotfix-caption">${escapeHtml(caption)}</div>` : ''}
      </div>
    `;
  }

  function warehouseOptions(data) {
    const ozon = (data.ozonWarehouses || []).map((row) => ({ value: String(row.warehouse || ''), label: `Ozon · ${row.warehouse}` }));
    const wb = (data.wbWarehouses || []).map((row) => ({ value: String(row.name || ''), label: `WB · ${row.name}` }));
    return uniq([...ozon, ...wb].map((item) => JSON.stringify(item))).map((value) => JSON.parse(value));
  }

  function normalizeArticleKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_-]+/gu, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function collectWorkbenchRows(source) {
    if (!source) return [];
    if (Array.isArray(source)) return source;
    if (Array.isArray(source.rows)) return source.rows;
    if (Array.isArray(source.payload)) return source.payload;
    if (Array.isArray(source.items)) return source.items;
    return [];
  }

  function buildWarehouseSupportMap() {
    const overlayRows = collectWorkbenchRows(cachedData('warehouseStockOverlay'));
    const supportRows = collectWorkbenchRows(smartWorkbenchData());
    const supportMap = new Map();

    overlayRows.forEach((row) => {
      const key = normalizeArticleKey(row?.articleKey || row?.article || row?.sku || '');
      if (!key) return;
      supportMap.set(key, {
        stockWarehouse: toNumber(row?.stockWarehouse),
        inboundWarehouse: toNumber(row?.inboundWarehouse),
        accepted: toNumber(row?.accepted),
        shippedOzon: toNumber(row?.shippedOzon),
        shippedWB: toNumber(row?.shippedWB)
      });
    });

    supportRows.forEach((row) => {
      const key = normalizeArticleKey(row?.articleKey || row?.article || row?.sku || '');
      if (!key) return;
      const current = supportMap.get(key) || {};
      const stockWarehouse = row?.stockWarehouse ?? row?.warehouseStock ?? row?.myWarehouseStock;
      const inboundWarehouse = row?.warehouseInTransit ?? row?.inTransitToWarehouse ?? row?.stockWarehouseTransit ?? row?.warehouseSupply;
      if (stockWarehouse != null && current.stockWarehouse == null) current.stockWarehouse = toNumber(stockWarehouse);
      if (inboundWarehouse != null && current.inboundWarehouse == null) current.inboundWarehouse = toNumber(inboundWarehouse);
      supportMap.set(key, current);
    });

    return supportMap;
  }

  function getOrdersForPeriod(row, targetDays) {
    const exact = toNumber(row?.[`sales${targetDays}`]);
    if (exact > 0) return Math.ceil(exact);
    const avgDaily = toNumber(row?.avgDaily ?? row?.avgDailyUnits28 ?? row?.avgDailyUnits);
    return Math.ceil(Math.max(0, avgDaily * targetDays));
  }

  function getClusterNeedForTarget(row, targetDays) {
    const exactNeed = toNumber(row?.[`targetNeed${targetDays}`]);
    if (exactNeed > 0) return Math.ceil(exactNeed);
    const demand = getOrdersForPeriod(row, targetDays);
    const stock = toNumber(row?.inStock ?? row?.available ?? row?.stock);
    const transit = toNumber(row?.inTransit) + toNumber(row?.inRequest);
    return Math.max(0, Math.ceil(demand - stock - transit));
  }

  function orderPlatformLabel(platform) {
    return platform === 'ozon' ? 'Ozon' : 'WB';
  }

  function buildSkuLookup() {
    const rows = Array.isArray(appState('skus')) ? appState('skus') : [];
    const lookup = new Map();
    rows.forEach((row) => {
      const byArticle = normalizeArticleKey(row?.article);
      const byKey = normalizeArticleKey(row?.articleKey);
      if (byArticle && !lookup.has(byArticle)) lookup.set(byArticle, row);
      if (byKey && !lookup.has(byKey)) lookup.set(byKey, row);
    });
    return lookup;
  }

  function exportCell(value) {
    const raw = value == null ? '' : String(value);
    return `"${raw.replace(/"/g, '""')}"`;
  }

  function downloadProcurementExport(model) {
    const headers = ['SKU / номенклатура', 'Артикул', 'Остаток мой склад', 'В пути на склад', 'Итого к заказу'];
    model.placeNames.forEach((name) => {
      headers.push(`${name} · Остаток MP`, `${name} · Заказы`, `${name} · Оборачиваемость`, `${name} · Рек. к заказу`);
    });

    const lines = [headers.map(exportCell).join(';')];
    model.rows.forEach((row) => {
      const cells = [
        row.name || row.articleKey || row.article,
        row.article,
        row.warehouseStock,
        row.inboundWarehouse,
        row.totalNeed
      ];
      model.placeNames.forEach((place) => {
        const cluster = row.clusters[place] || {};
        cells.push(
          cluster.mpStock ?? 0,
          cluster.orders ?? 0,
          cluster.turnover == null ? '' : Number(cluster.turnover).toFixed(1),
          cluster.need ?? 0
        );
      });
      lines.push(cells.map(exportCell).join(';'));
    });

    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `zakaz-tovara-${model.platform}-${model.targetDays}d-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function renderProcurementTable(model) {
    const headerGroups = model.placeNames.map((place) => `
      <th class="portal-ui-hotfix-procurement-group" colspan="4">${escapeHtml(place)}</th>
    `).join('');

    const headerMetrics = model.placeNames.map(() => `
      <th>Остаток MP</th>
      <th>Заказы</th>
      <th>Оборач.</th>
      <th>Рек. к заказу</th>
    `).join('');

    const body = model.rows.length
      ? model.rows.map((row) => {
          const totalTone = row.totalNeed > (row.warehouseStock + row.inboundWarehouse) ? 'danger' : (row.totalNeed > 0 ? 'warn' : 'ok');
          const clusterCells = model.placeNames.map((place) => {
            const cluster = row.clusters[place] || {};
            const needTone = toNumber(cluster.need) > 0 ? 'warn' : 'ok';
            return `
              <td class="portal-ui-hotfix-number">${fmt.int(cluster.mpStock)}</td>
              <td class="portal-ui-hotfix-number">${fmt.int(cluster.orders)}</td>
              <td>${turnoverBadge(cluster.turnover)}</td>
              <td class="portal-ui-hotfix-total-need">${badge(`${fmt.int(cluster.need)}`, needTone)}</td>
            `;
          }).join('');

          return `
            <tr>
              <td class="portal-ui-hotfix-sku-cell">
                <strong>${escapeHtml(row.name || row.articleKey || row.article)}</strong>
                <div class="portal-ui-hotfix-sku-meta">${escapeHtml(row.articleKey || row.article || '—')} · ${escapeHtml(row.owner || 'Без owner')}</div>
              </td>
              <td>${typeof linkToSku === 'function' ? linkToSku(row.article, row.article) : escapeHtml(row.article)}</td>
              <td class="portal-ui-hotfix-number">${fmt.int(row.warehouseStock)}</td>
              <td class="portal-ui-hotfix-number">${fmt.int(row.inboundWarehouse)}</td>
              <td class="portal-ui-hotfix-total-need">${badge(`${fmt.int(row.totalNeed)}`, totalTone)}</td>
              ${clusterCells}
            </tr>
          `;
        }).join('')
      : `<tr class="portal-ui-hotfix-empty-row"><td colspan="${5 + model.placeNames.length * 4}">Нет SKU по выбранной площадке и доступным кластерным данным.</td></tr>`;

    return `
      <div class="portal-ui-hotfix-procurement-table-wrap imperial-table-wrap">
        <table class="portal-ui-hotfix-procurement-table" id="portalUiHotfixOrderTable">
          <thead>
            <tr>
              <th rowspan="2">SKU / номенклатура</th>
              <th rowspan="2">Артикул</th>
              <th rowspan="2">Остаток мой склад</th>
              <th rowspan="2">В пути на склад</th>
              <th rowspan="2">Итого к заказу</th>
              ${headerGroups}
            </tr>
            <tr>${headerMetrics}</tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function buildLogisticsModel() {
    const data = logisticsData() || {};
    const imperialState = ensureImperialState();
    const platform = imperialState.orderPlatform === 'ozon' ? 'ozon' : 'wb';
    const targetDays = Math.max(1, Math.min(180, Number(imperialState.orderTargetDays || 30) || 30));
    const sourceRows = (data.allRows || []).filter((row) => String(row?.platform || '').trim().toLowerCase() === platform);
    const skuLookup = buildSkuLookup();
    const warehouseSupport = buildWarehouseSupportMap();
    const platformPlaces = platform === 'ozon'
      ? (data.ozonClusters || []).map((row) => String(row?.name || '').trim()).filter(Boolean)
      : (data.wbWarehouses || []).map((row) => String(row?.name || '').trim()).filter(Boolean);
    const discoveredPlaces = sourceRows.map((row) => String(row?.place || '').trim()).filter(Boolean);
    const placeNames = uniq([...platformPlaces, ...discoveredPlaces]);
    const rowMap = new Map();

    sourceRows.forEach((row) => {
      const article = String(row?.article || '').trim();
      const articleKey = normalizeArticleKey(article);
      if (!articleKey) return;
      const sku = skuLookup.get(articleKey) || {};
      const support = warehouseSupport.get(articleKey) || {};
      const place = String(row?.place || '').trim();
      const entry = rowMap.get(articleKey) || {
        articleKey,
        article,
        name: sku?.name || row?.name || article,
        owner: sku?.owner?.name || row?.owner || '',
        warehouseStock: toNumber(support.stockWarehouse),
        inboundWarehouse: toNumber(support.inboundWarehouse),
        totalNeed: 0,
        totalOrders: 0,
        clusters: {}
      };

      const orders = getOrdersForPeriod(row, targetDays);
      const need = getClusterNeedForTarget(row, targetDays);
      entry.totalNeed += need;
      entry.totalOrders += orders;
      entry.clusters[place] = {
        mpStock: toNumber(row?.inStock ?? row?.available ?? row?.stock),
        orders,
        turnover: row?.turnoverDays,
        need
      };
      rowMap.set(articleKey, entry);
    });

    const rows = [...rowMap.values()].sort((a, b) => b.totalNeed - a.totalNeed || b.totalOrders - a.totalOrders || String(a.article).localeCompare(String(b.article), 'ru'));
    const totals = rows.reduce((acc, row) => {
      acc.warehouseStock += toNumber(row.warehouseStock);
      acc.inboundWarehouse += toNumber(row.inboundWarehouse);
      acc.totalNeed += toNumber(row.totalNeed);
      return acc;
    }, { warehouseStock: 0, inboundWarehouse: 0, totalNeed: 0 });

    return {
      data,
      platform,
      platformLabel: orderPlatformLabel(platform),
      targetDays,
      placeNames,
      rows,
      totals,
      warehouseDataReady: rows.some((row) => toNumber(row.warehouseStock) > 0 || toNumber(row.inboundWarehouse) > 0),
      warehouseOverlayReady: Array.isArray(cachedData('warehouseStockOverlay')?.rows) && cachedData('warehouseStockOverlay').rows.length > 0,
      generatedAt: data.generatedAt || null,
      notes: Array.isArray(data.notes) ? data.notes : []
    };
  }

  function renderLogisticsSection() {
    if (!logisticsData()) return '';
    const model = buildLogisticsModel();
    const periodNote = model.generatedAt ? formatRuDate(parseIsoDate(model.generatedAt)) : 'последний доступный срез';
    const warehouseCaption = model.warehouseOverlayReady
      ? 'Колонка "Остаток мой склад" уже подхвачена из файла "Склад Балашиха.xlsx". Колонка "В пути на склад" пока оставлена отдельным будущим слоем, потому что источника еще нет.'
      : (model.warehouseDataReady
        ? 'Остаток моего склада и путь до склада уже подхвачены из support-слоя. Когда подключим Excel/1С, этот же экран останется без переработки.'
        : 'Колонки "Остаток мой склад" и "В пути на склад" уже заложены в форму. Пока внешний Excel/1С не подключен, они заполняются только там, где источник уже отдал поля.');

    return `
      <section class="imperial-section portal-ui-hotfix-procurement" data-portal-ui-hotfix-logistics>
        <div class="section-title">
          <div>
            <h2>Заказ товара по кластерам</h2>
            <p>Экран закупщика: выбираем площадку и целевую оборачиваемость, дальше видим, сколько нужно отправить в каждый кластер и сколько получается в сумме по SKU.</p>
          </div>
          <div class="badge-stack">
            ${badge(`Площадка: ${model.platformLabel}`, model.platform === 'wb' ? 'ok' : 'info')}
            ${badge(`Цель: ${model.targetDays} дн.`, 'info')}
            ${badge(`SKU: ${fmt.int(model.rows.length)}`, model.rows.length ? 'ok' : 'warn')}
          </div>
        </div>

        <div class="card">
          <div class="portal-ui-hotfix-procurement-controls">
            <label class="portal-ui-hotfix-filter portal-ui-hotfix-procurement-input">
              <span>Целевая оборачиваемость, дней</span>
              <input id="portalUiHotfixOrderTargetDays" type="number" min="1" max="180" step="1" value="${escapeHtml(model.targetDays)}">
            </label>
            <div class="portal-ui-hotfix-filter">
              <span>Площадка</span>
              <div class="portal-ui-hotfix-procurement-platforms">
                <button class="quick-chip ${model.platform === 'wb' ? 'active' : ''}" type="button" data-portal-ui-hotfix-order-platform="wb">WB</button>
                <button class="quick-chip ${model.platform === 'ozon' ? 'active' : ''}" type="button" data-portal-ui-hotfix-order-platform="ozon">OZ</button>
              </div>
            </div>
            <div class="badge-stack">
              ${badge(`Кластеры: ${fmt.int(model.placeNames.length)}`, model.placeNames.length ? 'ok' : 'warn')}
              ${badge(`Срез: ${periodNote}`, 'info')}
            </div>
            <div class="portal-ui-hotfix-procurement-actions">
              <button class="btn" type="button" data-portal-ui-hotfix-export-order>Выгрузить в Excel</button>
            </div>
          </div>

          <div class="portal-ui-hotfix-procurement-summary">
            <div class="mini-kpi"><span>SKU в расчете</span><strong>${fmt.int(model.rows.length)}</strong><span>по площадке ${escapeHtml(model.platformLabel)}</span></div>
            <div class="mini-kpi"><span>Мой склад</span><strong>${fmt.int(model.totals.warehouseStock)}</strong><span>сумма по найденному support-слою</span></div>
            <div class="mini-kpi"><span>В пути на склад</span><strong>${fmt.int(model.totals.inboundWarehouse)}</strong><span>будет точнее после Excel / 1С</span></div>
            <div class="mini-kpi warn"><span>Итого к заказу</span><strong>${fmt.int(model.totals.totalNeed)}</strong><span>сумма рекомендованного заказа по всем кластерам</span></div>
          </div>
        </div>

        <div class="card" style="margin-top:14px">
          <div class="section-subhead">
            <div>
              <h3>Таблица формирования заказа</h3>
              <p class="small muted">Слева SKU и итог по центральному контуру, справа по каждому кластеру: остаток на MP, потребность за период, оборачиваемость и сколько рекомендуем отправить.</p>
            </div>
            <div class="badge-stack">
              ${badge(`Горизонт ${model.targetDays} дн.`, 'info')}
              ${badge(model.platform === 'ozon' ? 'Переключатель кластеров Ozon' : 'Переключатель складов WB', model.platform === 'ozon' ? 'info' : 'ok')}
            </div>
          </div>
          ${renderProcurementTable(model)}
          <div class="portal-ui-hotfix-caption">${escapeHtml(warehouseCaption)}</div>
        </div>
      </section>
    `;
  }

  function bindLogisticsControls(root) {
    const rerender = () => {
      if (typeof renderOrderCalculator === 'function') renderOrderCalculator();
      else if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    };

    root.querySelectorAll('[data-portal-ui-hotfix-order-platform]').forEach((button) => {
      button.addEventListener('click', () => {
        ensureImperialState().orderPlatform = button.dataset.portalUiHotfixOrderPlatform || 'wb';
        rerender();
      });
    });

    root.querySelector('#portalUiHotfixOrderTargetDays')?.addEventListener('change', (event) => {
      ensureImperialState().orderTargetDays = Math.max(1, Math.min(180, Number(event.target.value || 30) || 30));
      rerender();
    });

    root.querySelector('[data-portal-ui-hotfix-export-order]')?.addEventListener('click', () => {
      try {
        downloadProcurementExport(buildLogisticsModel());
      } catch (error) {
        console.error('[portal-ui-hotfix] order export', error);
        if (typeof setAppError === 'function') setAppError('Не удалось выгрузить таблицу заказа. Попробуйте ещё раз.');
      }
    });
  }

  function applyDashboardEnhancement() {
    const root = document.getElementById('view-dashboard');
    if (!root || !portalUiViewIsActive('dashboard', root)) return;
    injectStyles();
    if (!root) return;
    root.querySelector('[data-portal-ui-hotfix-hero]')?.remove();
    root.querySelector('[data-portal-ui-hotfix-dashboard]')?.remove();
    const hero = root.querySelector('.hero-panel');
    const heroHtml = renderHeroPulse();
    if (heroHtml) {
      const heroCopy = hero?.querySelector('.hero-copy');
      if (heroCopy) heroCopy.insertAdjacentHTML('beforeend', heroHtml);
      else if (hero) hero.insertAdjacentHTML('afterbegin', heroHtml);
      else root.insertAdjacentHTML('afterbegin', heroHtml);
    }
    const html = renderDashboardExecution();
    if (!html) return;
    if (hero) hero.insertAdjacentHTML('afterend', html);
    else root.insertAdjacentHTML('afterbegin', html);
  }

  function applyLogisticsEnhancement() {
    if (window.__ALTEA_ORDER_PROCUREMENT_ENABLED__) return;
    const root = document.getElementById('view-order');
    if (!root || !portalUiViewIsActive('order', root)) return;
    injectStyles();
    if (!root || !logisticsData()) return;
    root.innerHTML = renderLogisticsSection();
    bindLogisticsControls(root);
    const manualTitle = root.querySelector('.order-layout .card h3');
    if (manualTitle) manualTitle.textContent = 'Р СѓС‡РЅРѕР№ РєР°Р»СЊРєСѓР»СЏС‚РѕСЂ SKU';
  }

  async function ensureDashboardSources() {
    try {
      await Promise.all([
        ensureHotfixJson('data/dashboard.json', 'dashboard'),
        ensureHotfixJson('data/platform_trends.json', 'platformTrends')
      ]);
    } catch (error) {
      console.warn('[portal-ui-hotfix] dashboard sources', error);
    }
  }

  async function ensureLogisticsSources() {
    if (window.__ALTEA_ORDER_PROCUREMENT_ENABLED__) return;
    try {
      await ensureHotfixJson('data/logistics.json', 'logistics');
      try {
        await ensureHotfixJson('tmp-logistics-live.json', 'logisticsLive');
      } catch (innerError) {
        console.warn('[portal-ui-hotfix] tmp logistics live source', innerError);
      }
      try {
        await ensureHotfixJson('data/warehouse_stock_overlay.json', 'warehouseStockOverlay');
      } catch (innerError) {
        console.warn('[portal-ui-hotfix] warehouse stock overlay source', innerError);
      }
      try {
        await ensureHotfixJson('data/smart_price_workbench.json', 'smartPriceWorkbench');
      } catch (innerError) {
        console.warn('[portal-ui-hotfix] smart price workbench source', innerError);
      }
      try {
        await ensureHotfixJson('tmp-smart_price_workbench-live.json', 'smartPriceWorkbenchLive');
      } catch (innerError) {
        console.warn('[portal-ui-hotfix] tmp smart price workbench live source', innerError);
      }
    } catch (error) {
      console.warn('[portal-ui-hotfix] logistics sources', error);
    }
  }

  function portalUiActiveView() {
    const hashView = String(window.location.hash || '').replace(/^#/, '').trim();
    if (hashView) return hashView;
    if (typeof state === 'object' && state?.activeView) return String(state.activeView || '').trim();
    const activeRoot = document.querySelector('.view.active');
    return activeRoot ? String(activeRoot.id || '').replace(/^view-/, '').trim() : '';
  }

  function portalUiViewIsActive(viewKey, root) {
    const normalized = String(viewKey || '').trim();
    if (!normalized) return false;
    const active = portalUiActiveView();
    if (active && active !== normalized) return false;
    return Boolean(root?.classList?.contains('active')) || active === normalized;
  }

  function portalUiHasEnhancementView() {
    return portalUiViewIsActive('dashboard', document.getElementById('view-dashboard'))
      || portalUiViewIsActive('order', document.getElementById('view-order'));
  }

  async function refreshEnhancements() {
    const dashboardRoot = document.getElementById('view-dashboard');
    const orderRoot = document.getElementById('view-order');
    const jobs = [];
    if (portalUiViewIsActive('dashboard', dashboardRoot)) jobs.push(ensureDashboardSources());
    if (portalUiViewIsActive('order', orderRoot)) jobs.push(ensureLogisticsSources());
    await Promise.all(jobs);
    applyDashboardEnhancement();
    applyLogisticsEnhancement();
  }

  function installDashboardEnhancer() {
    if (typeof renderDashboard !== 'function') return;
    const original = renderDashboard;
    renderDashboard = function patchedRenderDashboard() {
      original.apply(this, arguments);
      applyDashboardEnhancement();
    };
  }

  function installLogisticsEnhancer() {
    if (window.__ALTEA_ORDER_PROCUREMENT_ENABLED__) return;
    if (typeof renderOrderCalculator !== 'function') return;
    const original = renderOrderCalculator;
    renderOrderCalculator = function patchedRenderOrderCalculator() {
      original.apply(this, arguments);
      injectStyles();
      const root = document.getElementById('view-order');
      if (!root || !portalUiViewIsActive('order', root)) return;
      if (!root || !(logisticsData() || state.logistics)) return;
      root.innerHTML = renderLogisticsSection();
      bindLogisticsControls(root);
      const manualTitle = root.querySelector('.order-layout .card h3');
      if (manualTitle) manualTitle.textContent = 'Ручной калькулятор SKU';
    };
  }

  function installRenderBridge() {
    if (typeof rerenderCurrentView !== 'function' || rerenderCurrentView.__portalUiHotfixWrapped) return;
    const original = rerenderCurrentView;
    const wrapped = function portalUiHotfixRerenderBridge() {
      const result = original.apply(this, arguments);
      if (!portalUiHasEnhancementView()) return result;
      [40, 220].forEach((delay) => window.setTimeout(() => {
        try {
          applyDashboardEnhancement();
          applyLogisticsEnhancement();
        } catch (error) {
          console.error('[portal-ui-hotfix] bridge', error);
        }
      }, delay));
      return result;
    };
    wrapped.__portalUiHotfixWrapped = true;
    rerenderCurrentView = wrapped;
  }

  function rerenderSoon() {
    const refresh = () => {
      try {
        if (!portalUiHasEnhancementView()) return;
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      } catch (error) {
        console.error('[portal-ui-hotfix] rerender', error);
      }
    };
    window.setTimeout(refresh, 1200);
    window.setTimeout(refresh, 4200);
    window.setTimeout(refresh, 9000);
  }

  applyLogisticsEnhancement = function applyLogisticsEnhancementPatched() {
    if (window.__ALTEA_ORDER_PROCUREMENT_ENABLED__) return;
    const root = document.getElementById('view-order');
    if (!root || !portalUiViewIsActive('order', root)) return;
    injectStyles();
    if (!root || !logisticsData()) return;
    root.innerHTML = renderLogisticsSection();
    bindLogisticsControls(root);
    const manualTitle = root.querySelector('.order-layout .card h3');
    if (manualTitle) manualTitle.textContent = 'Ручной калькулятор SKU';
  };

  installLogisticsEnhancer = function installLogisticsEnhancerPatched() {
    if (window.__ALTEA_ORDER_PROCUREMENT_ENABLED__) return;
    if (typeof renderOrderCalculator !== 'function') return;
    const original = renderOrderCalculator;
    renderOrderCalculator = function patchedRenderOrderCalculator() {
      original.apply(this, arguments);
      applyLogisticsEnhancement();
    };
  };

  rerenderSoon = function rerenderSoonPatched() {
    const refresh = async () => {
      try {
        if (!portalUiHasEnhancementView()) return;
        await refreshEnhancements();
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
        window.setTimeout(() => {
          applyDashboardEnhancement();
          applyLogisticsEnhancement();
        }, 80);
      } catch (error) {
        console.error('[portal-ui-hotfix] rerender', error);
      }
    };
    [120, 1200, 3200, 6200, 12000, 18000].forEach((delay) => window.setTimeout(refresh, delay));
  };

  const DASHBOARD_CLARITY_STYLE_ID = 'altea-dashboard-clarity-20260513market3';
  const DASHBOARD_PERIODS = [
    { key: 'mtd', label: '1', hint: 'с 1 числа' },
    { key: '7', label: '7', hint: '7 дней' },
    { key: '14', label: '14', hint: '14 дней' },
    { key: '30', label: '30', hint: '30 дней' }
  ];
  const DASHBOARD_PLATFORMS = ['all', 'wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'];
  const DASHBOARD_PLATFORM_LABELS = {
    all: 'Все площадки',
    wb: 'WB',
    ozon: 'Ozon',
    ya: 'Я.Маркет',
    goldapple: 'Золотое яблоко',
    letu: "Л'Этуаль",
    magnit: 'Магнит Маркет'
  };

  function ensureDashboardClarityState() {
    if (typeof state !== 'object' || !state) return { period: 'mtd', platform: 'all' };
    state.dashboardClarity = state.dashboardClarity || {};
    if (!state.dashboardClarity.period) state.dashboardClarity.period = 'mtd';
    if (!state.dashboardClarity.platform) state.dashboardClarity.platform = 'all';
    return state.dashboardClarity;
  }

  function injectDashboardClarityStyles() {
    if (document.getElementById(DASHBOARD_CLARITY_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = DASHBOARD_CLARITY_STYLE_ID;
    style.textContent = `
      .portal-ui-period-bar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
      }
      .portal-ui-period-btn {
        min-width: 42px;
        padding: 7px 12px;
        border-radius: 999px;
        border: 1px solid rgba(212, 164, 74, 0.22);
        background: rgba(18, 14, 10, 0.96);
        color: #fff1dd;
        font: inherit;
        cursor: pointer;
        transition: border-color .18s ease, transform .18s ease, background .18s ease;
      }
      .portal-ui-period-btn:hover {
        border-color: rgba(236, 203, 123, 0.48);
        transform: translateY(-1px);
      }
      .portal-ui-period-btn.is-active {
        border-color: rgba(236, 203, 123, 0.76);
        background: linear-gradient(180deg, rgba(83, 55, 20, 0.94), rgba(33, 22, 11, 0.96));
        color: #fff7ea;
      }
      .portal-ui-platform-bar {
        justify-content: flex-start;
      }
      .portal-ui-period-meta {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 12px;
      }
      .portal-ui-range-note {
        color: rgba(255, 244, 229, 0.62);
        font-size: 12px;
      }
      .portal-ui-hotfix-hero-sub,
      .portal-ui-hotfix-foot {
        gap: 10px;
      }
      .portal-ui-hotfix-date-row {
        margin-top: 8px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        color: rgba(255, 244, 229, 0.56);
        font-size: 11px;
      }
      .portal-ui-hotfix-insights {
        margin-top: 18px;
        padding: 18px;
      }
      .portal-ui-hotfix-insight-grid,
      .portal-ui-hotfix-ads-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .portal-ui-hotfix-insight-card,
      .portal-ui-hotfix-ads-card {
        border-radius: 18px;
        border: 1px solid rgba(212, 164, 74, 0.14);
        background: linear-gradient(180deg, rgba(23, 17, 12, 0.94), rgba(12, 10, 9, 0.96));
        padding: 14px;
      }
      .portal-ui-hotfix-insight-top,
      .portal-ui-hotfix-ads-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .portal-ui-hotfix-insight-value,
      .portal-ui-hotfix-ads-value {
        margin-top: 10px;
        font-size: 26px;
        line-height: 1.05;
        font-weight: 700;
      }
      .portal-ui-hotfix-insight-sub,
      .portal-ui-hotfix-ads-sub {
        margin-top: 6px;
        color: rgba(255, 244, 229, 0.62);
        font-size: 12px;
      }
      .portal-ui-hotfix-ads-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }
      .portal-ui-hotfix-ads-metric {
        border-radius: 14px;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.045);
      }
      .portal-ui-hotfix-ads-metric span {
        display: block;
        margin-bottom: 6px;
        color: rgba(255, 244, 229, 0.62);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .portal-ui-hotfix-ads-metric strong {
        display: block;
        font-size: 20px;
        line-height: 1.1;
      }
      @media (max-width: 900px) {
        .portal-ui-period-bar {
          justify-content: flex-start;
        }
        .portal-ui-hotfix-ads-metrics {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function pickDashboardMetric(summary, keys) {
    for (const key of keys) {
      const value = summary?.[key];
      if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
    return 0;
  }

  async function safeOptionalHotfixJson(path, key) {
    try {
      return await ensureHotfixJson(path, key);
    } catch (error) {
      const message = String(error?.message || '');
      if (/Failed to load/i.test(message)) return null;
      console.warn(`[portal-ui-hotfix] optional ${path}`, error);
      return null;
    }
  }

  function formatMoney(value) {
    if (typeof fmt === 'object' && fmt && typeof fmt.money === 'function') return fmt.money(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(toNumber(value)));
  }

  function shortRuDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
  }

  function latestTrendDate() {
    const platforms = Array.isArray(cachedData('platformTrends')?.platforms) ? cachedData('platformTrends').platforms : [];
    let latest = null;
    for (const platform of platforms) {
      for (const point of platform?.series || []) {
        const parsed = parseIsoDate(point?.label);
        if (parsed && (!latest || parsed > latest)) latest = parsed;
      }
    }
    return latest;
  }

  function resolveTrendDate(point, asOfDate) {
    const parsed = parseIsoDate(point?.label);
    if (parsed) return parsed;
    const offset = Number(point?.dayOffset);
    if (!(asOfDate instanceof Date) || Number.isNaN(asOfDate.getTime()) || !Number.isFinite(offset)) return null;
    const resolved = new Date(asOfDate);
    resolved.setDate(resolved.getDate() - offset);
    return resolved;
  }

  function monthKeyFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function normalizeTrendSeries(key, asOfDate) {
    return (platformSeries(key)?.series || [])
      .map((point) => ({
        date: resolveTrendDate(point, asOfDate),
        units: toNumber(point?.units),
        revenue: toNumber(point?.revenue),
        estimatedMargin: toNumber(point?.estimatedMargin)
      }))
      .filter((point) => point.date instanceof Date && !Number.isNaN(point.date.getTime()))
      .sort((left, right) => left.date - right.date);
  }

  function filterSeriesByPeriod(series, period, asOfDate) {
    const prepared = series.filter((point) => point.date <= asOfDate);
    if (!prepared.length) return [];
    if (period === 'mtd') {
      const monthStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
      const scoped = prepared.filter((point) => point.date >= monthStart);
      return scoped.length ? scoped : prepared;
    }
    const days = Math.max(1, Number(period) || 1);
    return prepared.slice(-days);
  }

  function rangeLabelFromSeries(series) {
    if (!series.length) return 'нет дат';
    const first = series[0].date;
    const last = series[series.length - 1].date;
    if (!first || !last) return 'нет дат';
    return `${shortRuDate(first)} — ${shortRuDate(last)}`;
  }

  function periodTitle(period) {
    if (period === 'mtd') return 'с 1 числа по сегодня';
    return `последние ${period} дней`;
  }

  function renderPeriodControls(activePeriod) {
    return `
      <div class="portal-ui-period-bar">
        ${DASHBOARD_PERIODS.map((item) => `
          <button
            type="button"
            class="portal-ui-period-btn ${item.key === activePeriod ? 'is-active' : ''}"
            data-portal-ui-period="${item.key}"
            title="${item.hint}"
          >${item.label}</button>
        `).join('')}
      </div>
    `;
  }

  function platformLabel(key) {
    const canonical = String(key || 'all').trim().toLowerCase();
    return DASHBOARD_PLATFORM_LABELS[canonical] || platformSeries(canonical)?.label || canonical.toUpperCase();
  }

  function renderPlatformControls(activePlatform) {
    return `
      <div class="portal-ui-period-bar portal-ui-platform-bar">
        ${DASHBOARD_PLATFORMS.map((key) => `
          <button
            type="button"
            class="portal-ui-period-btn ${key === activePlatform ? 'is-active' : ''}"
            data-portal-ui-platform="${key}"
          >${escapeHtml(platformLabel(key))}</button>
        `).join('')}
      </div>
    `;
  }

  function lookupPlatformPlan(asOfDate, key) {
    const monthKey = monthKeyFromDate(asOfDate);
    return toNumber(cachedData('platformPlan')?.months?.[monthKey]?.platforms?.[key]?.units);
  }

  function buildDashboardClarityModel() {
    const dashboard = cachedData('dashboard') || {};
    const summary = dashboard?.brandSummary?.[0] || {};
    const period = ensureDashboardClarityState().period || 'mtd';
    const selectedPlatform = ensureDashboardClarityState().platform || 'all';
    const asOfDate = parseIsoDate(dashboard?.dataFreshness?.asOfDate) || latestTrendDate() || new Date();
    const monthDays = new Date(asOfDate.getFullYear(), asOfDate.getMonth() + 1, 0).getDate();
    const allSeries = normalizeTrendSeries('all', asOfDate);
    const detailedSeries = DASHBOARD_PLATFORMS.filter((key) => key !== 'all')
      .map((key) => ({ key, label: platformSeries(key)?.label || key.toUpperCase(), fullSeries: normalizeTrendSeries(key, asOfDate) }))
      .filter((item) => item.fullSeries.length);

    const allMonthPlan = lookupPlatformPlan(asOfDate, 'all') || pickDashboardMetric(summary, ['plan_units', 'apr_plan_units', 'feb_plan_units']);
    const detailedUnitBase = detailedSeries.reduce((sum, item) => sum + item.fullSeries.reduce((acc, point) => acc + point.units, 0), 0);
    const cards = [];

    const buildCard = (key, label, fullSeries, shareFallback, monthPlanUnits) => {
      const scopedSeries = filterSeriesByPeriod(fullSeries, period, asOfDate);
      if (!scopedSeries.length) return null;
      const plannedDays = period === 'mtd'
        ? Math.max(1, Math.min(asOfDate.getDate(), scopedSeries.length))
        : Math.max(1, Math.min(Number(period) || 1, scopedSeries.length));
      const targetUnits = monthPlanUnits > 0 && monthDays > 0 ? (monthPlanUnits / monthDays) * plannedDays : 0;
      const factUnits = scopedSeries.reduce((sum, point) => sum + point.units, 0);
      const revenue = scopedSeries.reduce((sum, point) => sum + point.revenue, 0);
      const margin = scopedSeries.reduce((sum, point) => sum + point.estimatedMargin, 0);
      const pctToPlan = targetUnits > 0 ? factUnits / targetUnits : 0;
      const avgDailyUnits = factUnits / Math.max(1, scopedSeries.length);
      return {
        key,
        label,
        series: scopedSeries,
        factUnits,
        revenue,
        margin,
        avgDailyUnits,
        targetUnits,
        dailyPlanUnits: monthPlanUnits > 0 && monthDays > 0 ? monthPlanUnits / monthDays : 0,
        monthPlanUnits,
        pct: pctToPlan,
        share: shareFallback,
        windowLabel: rangeLabelFromSeries(scopedSeries)
      };
    };

    const allCard = buildCard('all', 'Все площадки', allSeries, 1, allMonthPlan);
    if (allCard) cards.push(allCard);

    for (const item of detailedSeries) {
      const fullUnits = item.fullSeries.reduce((sum, point) => sum + point.units, 0);
      const shareFallback = detailedUnitBase > 0 ? fullUnits / detailedUnitBase : 0;
      const monthPlanUnits = lookupPlatformPlan(asOfDate, item.key) || (allMonthPlan > 0 ? allMonthPlan * shareFallback : 0);
      const card = buildCard(item.key, item.label, item.fullSeries, shareFallback, monthPlanUnits);
      if (card) cards.push(card);
    }

    const visibleCards = selectedPlatform === 'all'
      ? cards
      : cards.filter((card) => card.key === selectedPlatform);

    return {
      cards: visibleCards,
      allCards: cards,
      selectedPlatform,
      selectedPlatformLabel: platformLabel(selectedPlatform),
      period,
      periodTitle: periodTitle(period),
      monthLabel: asOfDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }),
      asOfDate,
      asOfLabel: formatRuDate(asOfDate),
      overallToDatePct: allCard?.pct || pickDashboardMetric(summary, ['plan_completion_to_date_pct', 'apr_plan_completion_to_date_pct', 'plan_completion_feb26_pct']),
      rangeLabel: visibleCards[0]?.windowLabel || cards[0]?.windowLabel || rangeLabelFromSeries(allSeries)
    };
  }

  function renderDashboardHeroPulse() {
    const model = buildDashboardClarityModel();
    const cards = model.cards.length ? model.cards : (model.allCards || []);
    if (!cards.length) return '';
    return `
      <div class="portal-ui-hotfix-hero-pulse" data-portal-ui-hotfix-hero>
        <div class="section-subhead">
          <div>
            <h3>Операционный темп площадок</h3>
            <p class="small muted">Кнопка 1 считает период с 1 числа текущего месяца. Остальные кнопки переключают скользящие окна 7, 14 и 30 дней.</p>
          </div>
          <div class="badge-stack">
            ${badge(`К плану: ${fmt.pct(model.overallToDatePct)}`, model.overallToDatePct >= 1 ? 'ok' : (model.overallToDatePct >= 0.85 ? 'warn' : 'danger'))}
            ${badge(`Факт: ${model.asOfLabel}`, 'info')}
            ${badge(`Площадка: ${model.selectedPlatformLabel}`, model.selectedPlatform === 'all' ? 'info' : 'ok')}
          </div>
        </div>
        <div class="portal-ui-period-meta">
          ${renderPeriodControls(model.period)}
          ${renderPlatformControls(model.selectedPlatform)}
          <span class="portal-ui-range-note">Диапазон: ${escapeHtml(model.rangeLabel)} · Сейчас выбран горизонт: ${escapeHtml(model.periodTitle)}</span>
        </div>
        <div class="portal-ui-hotfix-hero-pulse-grid">
          ${cards.slice(0, 4).map((card) => {
            const tone = toneClass(card.pct);
            const spark = sparklineGeometry(card.series.map((point) => point.units));
            const progressWidth = Math.max(6, Math.min(100, Math.round(toNumber(card.pct) * 100)));
            return `
              <div class="portal-ui-hotfix-hero-card ${tone}">
                <div class="portal-ui-hotfix-hero-head">
                  <span class="portal-ui-hotfix-hero-name">${escapeHtml(card.label)}</span>
                  ${badge(fmt.pct(card.pct), card.pct >= 1 ? 'ok' : (card.pct >= 0.85 ? 'warn' : 'danger'))}
                </div>
                <div class="portal-ui-hotfix-hero-value">${escapeHtml(fmt.int(card.factUnits))}</div>
                <div class="portal-ui-hotfix-hero-sub">План периода ${escapeHtml(fmt.int(card.targetUnits))} · среднее в день ${escapeHtml(fmt.int(card.avgDailyUnits))}</div>
                <div class="portal-ui-hotfix-progress ${tone}"><span style="width:${progressWidth}%"></span></div>
                ${spark ? `
                  <svg class="portal-ui-hotfix-sparkline" viewBox="0 0 ${spark.width} ${spark.height}" preserveAspectRatio="none" aria-hidden="true">
                    <path class="fill" d="${spark.fill}"></path>
                    <path class="track" d="${spark.line}"></path>
                    <path d="${spark.line}"></path>
                  </svg>
                ` : ''}
                <div class="portal-ui-hotfix-date-row">
                  <span>${escapeHtml(card.windowLabel)}</span>
                  <span>Выручка ${escapeHtml(formatMoney(card.revenue))}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderDashboardExecutionClarity() {
    const model = buildDashboardClarityModel();
    const cards = model.cards.length ? model.cards : (model.allCards || []);
    if (!cards.length) return '';
    return `
      <section class="card portal-ui-hotfix-dashboard" data-portal-ui-hotfix-dashboard>
        <div class="section-subhead">
          <div>
            <h3>Выполнение площадок за выбранный период</h3>
            <p class="small muted">План и факт считаются по диапазону "${escapeHtml(model.periodTitle)}". Последний доступный факт в витрине: ${escapeHtml(model.asOfLabel)}.</p>
          </div>
          <div class="badge-stack">
            ${badge(`Месяц: ${model.monthLabel}`, 'info')}
            ${badge(`Диапазон: ${model.rangeLabel}`, 'warn')}
            ${badge(`Площадка: ${model.selectedPlatformLabel}`, model.selectedPlatform === 'all' ? 'info' : 'ok')}
          </div>
        </div>
        <div class="portal-ui-period-meta" style="margin: 0 0 12px;">
          ${renderPlatformControls(model.selectedPlatform)}
        </div>
        <div class="portal-ui-hotfix-dashboard-grid">
          ${cards.map((card) => `
            <div class="portal-ui-hotfix-card ${toneClass(card.pct)}">
              <div class="section-subhead">
                <div>
                  <h3>${escapeHtml(card.label)}</h3>
                  <p class="small muted">${escapeHtml(card.windowLabel)} · линейный план дня ${escapeHtml(fmt.int(card.dailyPlanUnits))}</p>
                </div>
                ${badge(fmt.pct(card.pct), card.pct >= 1 ? 'ok' : (card.pct >= 0.85 ? 'warn' : 'danger'))}
              </div>
              <div class="portal-ui-hotfix-metrics">
                <div class="portal-ui-hotfix-metric">
                  <span>План периода</span>
                  <strong>${escapeHtml(fmt.int(card.targetUnits))}</strong>
                </div>
                <div class="portal-ui-hotfix-metric">
                  <span>Факт периода</span>
                  <strong>${escapeHtml(fmt.int(card.factUnits))}</strong>
                </div>
                <div class="portal-ui-hotfix-metric">
                  <span>Среднее / день</span>
                  <strong>${escapeHtml(fmt.int(card.avgDailyUnits))}</strong>
                </div>
              </div>
              <div class="portal-ui-hotfix-foot muted small">
                <span>Выручка периода: ${escapeHtml(formatMoney(card.revenue))}</span>
                <span>План месяца по площадке: ${escapeHtml(fmt.int(card.monthPlanUnits))}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderInsightsSection() {
    const model = buildDashboardClarityModel();
    const cards = model.cards.length ? model.cards : (model.allCards || []);
    if (!cards.length) return '';
    return `
      <section class="card portal-ui-hotfix-insights" data-portal-ui-hotfix-insights>
        <div class="section-subhead">
          <div>
            <h3>Динамика маржи и выручки</h3>
            <p class="small muted">Бывший нижний блок перенесли выше и сделали привязанным к выбранному периоду, чтобы видно было не "имперский pulse", а конкретную динамику по датам.</p>
          </div>
          <div class="badge-stack">
            ${badge(`Факт: ${model.asOfLabel}`, 'info')}
            ${badge(`Диапазон: ${model.rangeLabel}`, 'warn')}
          </div>
        </div>
        <div class="portal-ui-hotfix-insight-grid">
          ${cards.map((card) => {
            const tone = toneClass(card.pct);
            const spark = sparklineGeometry(card.series.map((point) => point.estimatedMargin));
            return `
              <div class="portal-ui-hotfix-insight-card ${tone}">
                <div class="portal-ui-hotfix-insight-top">
                  <div>
                    <h3>${escapeHtml(card.label)}</h3>
                    <div class="portal-ui-hotfix-insight-sub">${escapeHtml(card.windowLabel)}</div>
                  </div>
                  ${badge(fmt.pct(card.pct), card.pct >= 1 ? 'ok' : (card.pct >= 0.85 ? 'warn' : 'danger'))}
                </div>
                <div class="portal-ui-hotfix-insight-value">${escapeHtml(formatMoney(card.margin))}</div>
                <div class="portal-ui-hotfix-insight-sub">Оценочная маржа за период · Выручка ${escapeHtml(formatMoney(card.revenue))} · ${escapeHtml(fmt.int(card.factUnits))} шт.</div>
                ${spark ? `
                  <svg class="portal-ui-hotfix-sparkline" viewBox="0 0 ${spark.width} ${spark.height}" preserveAspectRatio="none" aria-hidden="true">
                    <path class="fill" d="${spark.fill}"></path>
                    <path class="track" d="${spark.line}"></path>
                    <path d="${spark.line}"></path>
                  </svg>
                ` : ''}
                <div class="portal-ui-hotfix-date-row">
                  <span>${escapeHtml(card.windowLabel)}</span>
                  <span>Среднее в день ${escapeHtml(formatMoney(card.margin / Math.max(1, card.series.length)))}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function buildAdsClarityModel() {
    const adsSummary = cachedData('adsSummary');
    if (!adsSummary || !Array.isArray(adsSummary.platforms)) return null;
    const period = ensureDashboardClarityState().period || 'mtd';
    const asOfDate = parseIsoDate(adsSummary.asOfDate) || latestTrendDate() || new Date();
    const cards = adsSummary.platforms
      .map((platform) => {
        const series = (platform.series || [])
          .map((point) => ({
            date: resolveTrendDate(point, asOfDate),
            views: toNumber(point.views),
            clicks: toNumber(point.clicks),
            spend: toNumber(point.spend),
            orders: toNumber(point.orders),
            revenue: toNumber(point.revenue)
          }))
          .filter((point) => point.date instanceof Date && !Number.isNaN(point.date.getTime()))
          .sort((left, right) => left.date - right.date);
        const scopedSeries = filterSeriesByPeriod(series, period, asOfDate);
        if (!scopedSeries.length) return null;
        const views = scopedSeries.reduce((sum, point) => sum + point.views, 0);
        const clicks = scopedSeries.reduce((sum, point) => sum + point.clicks, 0);
        const spend = scopedSeries.reduce((sum, point) => sum + point.spend, 0);
        const orders = scopedSeries.reduce((sum, point) => sum + point.orders, 0);
        const revenue = scopedSeries.reduce((sum, point) => sum + point.revenue, 0);
        return {
          key: platform.key,
          label: platform.label,
          spend,
          orders,
          revenue,
          clicks,
          views,
          drr: revenue > 0 ? spend / revenue : 0,
          windowLabel: rangeLabelFromSeries(scopedSeries)
        };
      })
      .filter(Boolean);
    if (!cards.length) return null;
    return { cards, asOfLabel: formatRuDate(asOfDate) };
  }

  function renderAdsSection() {
    const model = buildAdsClarityModel();
    if (!model) return '';
    return `
      <section class="card portal-ui-hotfix-insights" data-portal-ui-hotfix-ads>
        <div class="section-subhead">
          <div>
            <h3>Реклама и ДРР</h3>
            <p class="small muted">Воронка по рекламе: затраты, клики, заказы и ДРР за тот же выбранный период, что и весь верхний блок главной.</p>
          </div>
          <div class="badge-stack">
            ${badge(`Факт: ${model.asOfLabel}`, 'info')}
          </div>
        </div>
        <div class="portal-ui-hotfix-ads-grid">
          ${model.cards.map((card) => `
            <div class="portal-ui-hotfix-ads-card">
              <div class="portal-ui-hotfix-ads-top">
                <div>
                  <h3>${escapeHtml(card.label)}</h3>
                  <div class="portal-ui-hotfix-ads-sub">${escapeHtml(card.windowLabel)}</div>
                </div>
                ${badge(`ДРР ${fmt.pct(card.drr)}`, card.drr <= 0.15 ? 'ok' : (card.drr <= 0.22 ? 'warn' : 'danger'))}
              </div>
              <div class="portal-ui-hotfix-ads-value">${escapeHtml(formatMoney(card.spend))}</div>
              <div class="portal-ui-hotfix-ads-sub">Затраты за период · выручка ${escapeHtml(formatMoney(card.revenue))}</div>
              <div class="portal-ui-hotfix-ads-metrics">
                <div class="portal-ui-hotfix-ads-metric">
                  <span>Показы</span>
                  <strong>${escapeHtml(fmt.int(card.views))}</strong>
                </div>
                <div class="portal-ui-hotfix-ads-metric">
                  <span>Клики</span>
                  <strong>${escapeHtml(fmt.int(card.clicks))}</strong>
                </div>
                <div class="portal-ui-hotfix-ads-metric">
                  <span>Заказы</span>
                  <strong>${escapeHtml(fmt.int(card.orders))}</strong>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function bindDashboardClarityControls(root) {
    root.querySelectorAll('[data-portal-ui-period]').forEach((button) => {
      button.addEventListener('click', () => {
        ensureDashboardClarityState().period = button.dataset.portalUiPeriod || 'mtd';
        applyDashboardEnhancement();
      });
    });
    root.querySelectorAll('[data-portal-ui-platform]').forEach((button) => {
      button.addEventListener('click', () => {
        ensureDashboardClarityState().platform = button.dataset.portalUiPlatform || 'all';
        applyDashboardEnhancement();
      });
    });
  }

  ensureDashboardSources = async function ensureDashboardSourcesPatched() {
    try {
      await Promise.all([
        ensureHotfixJson('data/dashboard.json', 'dashboard'),
        ensureHotfixJson('data/platform_trends.json', 'platformTrends'),
        safeOptionalHotfixJson('data/platform_plan.json', 'platformPlan'),
        safeOptionalHotfixJson('data/ads_summary.json', 'adsSummary')
      ]);
    } catch (error) {
      console.warn('[portal-ui-hotfix] dashboard sources', error);
    }
  };

  applyDashboardEnhancement = function applyDashboardEnhancementPatched() {
    const root = document.getElementById('view-dashboard');
    if (!root || !portalUiViewIsActive('dashboard', root)) return;
    const ceoMotionOwnsDashboard = Boolean(
      window.__ALTEA_DASHBOARD_CEO_MOTION_ACTIVE__
        || window.__ALTEA_DASHBOARD_CEO_MOTION_V1__?.render
        || root.dataset.dashboardCeoMotion
        || root.querySelector('.ceo-motion-v1')
    );

    root.querySelector('[data-portal-livefix]')?.remove();
    root.querySelector('[data-portal-ui-hotfix-hero]')?.remove();
    root.querySelector('[data-portal-ui-hotfix-dashboard]')?.remove();
    root.querySelector('[data-portal-ui-hotfix-insights]')?.remove();
    root.querySelector('[data-portal-ui-hotfix-ads]')?.remove();
    root.querySelectorAll('section.imperial-section').forEach((section) => section.remove());
    if (ceoMotionOwnsDashboard) return;

    injectStyles();
    injectDashboardClarityStyles();
    ensureDashboardClarityState();

    const hero = root.querySelector('.hero-panel');
    const heroHtml = renderDashboardHeroPulse();
    if (heroHtml) {
      const heroCopy = hero?.querySelector('.hero-copy');
      if (heroCopy) heroCopy.insertAdjacentHTML('beforeend', heroHtml);
      else if (hero) hero.insertAdjacentHTML('afterbegin', heroHtml);
      else root.insertAdjacentHTML('afterbegin', heroHtml);
    }

    const stackHtml = [
      renderDashboardExecutionClarity(),
      renderAdsSection(),
      renderInsightsSection()
    ].join('');
    if (stackHtml) {
      if (hero) hero.insertAdjacentHTML('afterend', stackHtml);
      else root.insertAdjacentHTML('afterbegin', stackHtml);
    }
    bindDashboardClarityControls(root);
  };

  ensureImperialState();
  installDashboardEnhancer();
  installLogisticsEnhancer();
  installRenderBridge();
  rerenderSoon();
  refreshEnhancements().finally(() => {
    if (!portalUiHasEnhancementView()) return;
    if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    window.setTimeout(() => {
      applyDashboardEnhancement();
      applyLogisticsEnhancement();
    }, 80);
  });
})();
