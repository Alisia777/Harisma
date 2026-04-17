(function () {
  if (window.__ALTEA_PORTAL_LIVEFIX_20260417G__) return;
  window.__ALTEA_PORTAL_LIVEFIX_20260417G__ = true;

  const LIVEFIX_VERSION = '20260417g';
  const STYLE_ID = 'altea-portal-livefix-20260417g';
  const cache = {
    dashboard: null,
    platformTrends: null
  };

  function appState() {
    return typeof state === 'object' && state ? state : null;
  }

  function current(key) {
    const app = appState();
    return (app && app[key]) || cache[key] || null;
  }

  function escape(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function int(value) {
    if (typeof fmt === 'object' && fmt && typeof fmt.int === 'function') return fmt.int(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(num(value)));
  }

  function pct(value) {
    if (typeof fmt === 'object' && fmt && typeof fmt.pct === 'function') return fmt.pct(value);
    return `${(num(value) * 100).toFixed(1)}%`;
  }

  function badgeChip(text, tone = '') {
    if (typeof badge === 'function') return badge(text, tone);
    return `<span class="portal-livefix-chip ${tone}">${escape(text)}</span>`;
  }

  function avg(values) {
    const clean = values.map(num).filter((value) => Number.isFinite(value));
    if (!clean.length) return 0;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
  }

  function parseDate(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long'
    }).format(date);
  }

  function toneClass(value) {
    if (value >= 1) return 'is-ok';
    if (value >= 0.85) return 'is-warn';
    return 'is-danger';
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .portal-livefix-pulse {
        margin-top: 16px;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(212, 164, 74, 0.16);
        background: linear-gradient(180deg, rgba(24, 18, 14, 0.9), rgba(13, 10, 8, 0.94));
      }
      .portal-livefix-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .portal-livefix-card {
        padding: 12px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        background: rgba(255, 255, 255, 0.025);
      }
      .portal-livefix-card.is-ok {
        border-color: rgba(118, 180, 121, 0.36);
      }
      .portal-livefix-card.is-warn {
        border-color: rgba(212, 164, 74, 0.4);
      }
      .portal-livefix-card.is-danger {
        border-color: rgba(203, 88, 65, 0.42);
      }
      .portal-livefix-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .portal-livefix-name {
        color: rgba(255, 244, 229, 0.8);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .portal-livefix-value {
        margin-top: 10px;
        font-size: 28px;
        line-height: 1;
        font-weight: 700;
      }
      .portal-livefix-sub {
        margin-top: 6px;
        color: rgba(255, 244, 229, 0.62);
        font-size: 12px;
      }
      .portal-livefix-progress {
        margin-top: 12px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.07);
        overflow: hidden;
      }
      .portal-livefix-progress > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(212, 164, 74, 0.95), rgba(236, 203, 123, 0.95));
      }
      .portal-livefix-progress.is-ok > span {
        background: linear-gradient(90deg, rgba(95, 189, 121, 0.95), rgba(155, 219, 171, 0.95));
      }
      .portal-livefix-progress.is-danger > span {
        background: linear-gradient(90deg, rgba(203, 88, 65, 0.95), rgba(232, 125, 102, 0.95));
      }
      .portal-livefix-sparkline {
        display: block;
        width: 100%;
        height: 54px;
        margin-top: 12px;
      }
      .portal-livefix-sparkline path {
        fill: none;
        stroke: rgba(236, 203, 123, 0.96);
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .portal-livefix-sparkline .track {
        opacity: 0.28;
      }
      .portal-livefix-sparkline .fill {
        fill: rgba(236, 203, 123, 0.24);
        opacity: 0.14;
      }
      .portal-livefix-card.is-ok .portal-livefix-sparkline path {
        stroke: rgba(140, 223, 162, 0.96);
      }
      .portal-livefix-card.is-ok .portal-livefix-sparkline .fill {
        fill: rgba(140, 223, 162, 0.22);
      }
      .portal-livefix-card.is-danger .portal-livefix-sparkline path {
        stroke: rgba(232, 125, 102, 0.96);
      }
      .portal-livefix-card.is-danger .portal-livefix-sparkline .fill {
        fill: rgba(232, 125, 102, 0.22);
      }
      .portal-livefix-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 999px;
        border: 1px solid rgba(212, 164, 74, 0.26);
        color: #f5e8cf;
        background: rgba(17, 13, 10, 0.9);
        font-size: 11px;
      }
      @media (max-width: 900px) {
        .portal-livefix-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  async function ensureJson(key, path) {
    const existing = current(key);
    if (existing) return existing;
    const response = await fetch(`${path}?v=${LIVEFIX_VERSION}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    const rawText = await response.text();
    const sanitized = typeof sanitizeLooseJson === 'function' ? sanitizeLooseJson(rawText) : rawText;
    const parsed = JSON.parse(sanitized);
    cache[key] = parsed;
    const app = appState();
    if (app && !app[key]) app[key] = parsed;
    return parsed;
  }

  function normalizeSyncBadge() {
    const app = appState();
    const badgeEl = document.getElementById('syncStatusBadge');
    if (!app?.team || !badgeEl) return;
    const note = String(app.team.note || '');
    if (app.team.mode !== 'error' && !/Ошибка|Supabase/i.test(note)) return;
    app.team.mode = 'local';
    app.team.ready = false;
    app.team.note = 'Локальный режим · командная база недоступна';
    if (typeof updateSyncBadge === 'function') {
      updateSyncBadge();
      return;
    }
    badgeEl.className = 'sync-status local';
    badgeEl.textContent = app.team.note;
  }

  function platformSeries(key) {
    const platforms = Array.isArray(current('platformTrends')?.platforms) ? current('platformTrends').platforms : [];
    return platforms.find((item) => item.key === key) || null;
  }

  function sparkline(values) {
    const clean = values.map(num).filter((value) => Number.isFinite(value));
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

  function pickNumber(summary, keys) {
    for (const key of keys) {
      const value = summary?.[key];
      if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) return Number(value);
    }
    return 0;
  }

  function buildModel() {
    const dashboard = current('dashboard') || {};
    const summary = dashboard?.brandSummary?.[0] || {};
    const asOfDate = parseDate(dashboard?.dataFreshness?.asOfDate) || parseDate(dashboard?.generatedAt);
    const today = new Date();
    const monthRef = asOfDate || today;
    const monthDays = new Date(monthRef.getFullYear(), monthRef.getMonth() + 1, 0).getDate();
    const monthPlanUnits = pickNumber(summary, ['apr_plan_units', 'feb_plan_units', 'plan_units']);
    const overallToDatePct = pickNumber(summary, ['apr_plan_completion_to_date_pct', 'plan_completion_feb26_pct']);
    const dailyPlanBase = monthPlanUnits > 0 && monthDays > 0 ? monthPlanUnits / monthDays : 0;

    const detailed = ['wb', 'ozon', 'ya']
      .map((key) => platformSeries(key))
      .filter(Boolean);
    const recentTotal = detailed.reduce((sum, item) => sum + item.series.reduce((acc, point) => acc + num(point?.units), 0), 0);
    const cards = [];

    const totalSeries = platformSeries('all');
    if (totalSeries?.series?.length && dailyPlanBase > 0) {
      const latest = totalSeries.series.at(-1);
      cards.push({
        key: 'all',
        label: 'Все площадки',
        targetUnits: dailyPlanBase,
        factUnits: num(latest?.units),
        trailingUnits: avg(totalSeries.series.slice(-3).map((point) => point?.units)),
        pct: num(latest?.units) / dailyPlanBase
      });
    }

    for (const item of detailed) {
      const totalUnits = item.series.reduce((sum, point) => sum + num(point?.units), 0);
      const share = recentTotal > 0 ? totalUnits / recentTotal : 0;
      const latest = item.series.at(-1);
      const targetUnits = dailyPlanBase * share;
      cards.push({
        key: item.key,
        label: item.label || item.key.toUpperCase(),
        targetUnits,
        factUnits: num(latest?.units),
        trailingUnits: avg(item.series.slice(-3).map((point) => point?.units)),
        pct: targetUnits > 0 ? num(latest?.units) / targetUnits : 0
      });
    }

    return {
      cards: cards.slice(0, 4),
      overallToDatePct,
      asOfLabel: formatDate(asOfDate || today)
    };
  }

  function renderPulse() {
    const model = buildModel();
    if (!model.cards.length) return '';
    return `
      <div class="portal-livefix-pulse" data-portal-livefix>
        <div class="section-subhead">
          <div>
            <h3>Живой темп площадок</h3>
            <p class="small muted">Сжали пустую hero-зону в рабочий pulse: текущий факт, короткая динамика и темп к дневному плану.</p>
          </div>
          <div class="badge-stack">
            ${badgeChip(`К дате: ${pct(model.overallToDatePct)}`, model.overallToDatePct >= 1 ? 'ok' : (model.overallToDatePct >= 0.85 ? 'warn' : 'danger'))}
            ${badgeChip(`Факт: ${model.asOfLabel}`, 'info')}
          </div>
        </div>
        <div class="portal-livefix-grid">
          ${model.cards.map((card) => {
            const tone = toneClass(card.pct);
            const points = platformSeries(card.key)?.series || [];
            const chart = sparkline(points.map((point) => point?.units));
            const progressWidth = Math.max(6, Math.min(100, Math.round(num(card.pct) * 100)));
            return `
              <div class="portal-livefix-card ${tone}">
                <div class="portal-livefix-head">
                  <span class="portal-livefix-name">${escape(card.label)}</span>
                  ${badgeChip(pct(card.pct), card.pct >= 1 ? 'ok' : (card.pct >= 0.85 ? 'warn' : 'danger'))}
                </div>
                <div class="portal-livefix-value">${escape(int(card.factUnits))}</div>
                <div class="portal-livefix-sub">План дня ${escape(int(card.targetUnits))} · среднее 3 дня ${escape(int(card.trailingUnits))}</div>
                <div class="portal-livefix-progress ${tone}"><span style="width:${progressWidth}%"></span></div>
                ${chart ? `
                  <svg class="portal-livefix-sparkline" viewBox="0 0 ${chart.width} ${chart.height}" preserveAspectRatio="none" aria-hidden="true">
                    <path class="fill" d="${chart.fill}"></path>
                    <path class="track" d="${chart.line}"></path>
                    <path d="${chart.line}"></path>
                  </svg>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function applyPulse() {
    injectStyles();
    normalizeSyncBadge();
    const root = document.getElementById('view-dashboard');
    if (!root) return;
    root.querySelector('[data-portal-livefix]')?.remove();
    const heroCopy = root.querySelector('.hero-panel .hero-copy');
    const hero = root.querySelector('.hero-panel');
    const html = renderPulse();
    if (!html) return;
    if (heroCopy) heroCopy.insertAdjacentHTML('beforeend', html);
    else if (hero) hero.insertAdjacentHTML('afterbegin', html);
    else root.insertAdjacentHTML('afterbegin', html);
  }

  function installBridge() {
    if (typeof rerenderCurrentView === 'function' && !rerenderCurrentView.__portalLivefixWrapped) {
      const original = rerenderCurrentView;
      const wrapped = function portalLivefixRerenderBridge() {
        const result = original.apply(this, arguments);
        [40, 220].forEach((delay) => window.setTimeout(applyPulse, delay));
        return result;
      };
      wrapped.__portalLivefixWrapped = true;
      rerenderCurrentView = wrapped;
    }

    if (typeof renderDashboard === 'function' && !renderDashboard.__portalLivefixWrapped) {
      const original = renderDashboard;
      const wrapped = function portalLivefixDashboardBridge() {
        const result = original.apply(this, arguments);
        applyPulse();
        return result;
      };
      wrapped.__portalLivefixWrapped = true;
      renderDashboard = wrapped;
    }
  }

  async function refresh() {
    await Promise.all([
      ensureJson('dashboard', 'data/dashboard.json'),
      ensureJson('platformTrends', 'data/platform_trends.json')
    ]);
    applyPulse();
  }

  installBridge();
  [120, 1200, 3200, 6200, 12000, 18000].forEach((delay) => {
    window.setTimeout(() => {
      refresh().catch((error) => console.warn('[portal-livefix]', error));
    }, delay);
  });
  refresh().catch((error) => console.warn('[portal-livefix]', error));
})();