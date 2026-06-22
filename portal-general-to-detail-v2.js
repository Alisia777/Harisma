(function () {
  'use strict';

  const VERSION = '20260622-general-to-detail-v2';
  const MODE_KEY = 'altea.generalToDetail.v2.mode';
  const ROUTES = {
    'sku-plan-fact': {
      rootId: 'view-sku-plan-fact',
      title: 'План-факт SKU',
      kicker: 'общее -> кто -> что',
      modes: [
        ['general', 'Общее'],
        ['who', 'Кто сделал'],
        ['what', 'Что сделало']
      ]
    },
    repricer: {
      rootId: 'view-repricer',
      title: 'Репрайсер',
      kicker: 'готовность -> решения -> аудит',
      modes: [
        ['general', 'Готовность'],
        ['decisions', 'Решения'],
        ['audit', 'Аудит']
      ]
    },
    'oos-control': {
      rootId: 'view-oos-control',
      title: 'OOS контроль',
      kicker: 'бренд -> SKU -> кластер',
      modes: [
        ['general', 'Общее'],
        ['articles', 'Артикулы'],
        ['clusters', 'Кластеры']
      ]
    }
  };

  const moneyFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const pctFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const intFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

  function numberOrZero(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function numberOrNull(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtMoney(value) {
    const parsed = numberOrNull(value);
    return parsed === null ? '—' : `${moneyFmt.format(Math.round(parsed))} ₽`;
  }

  function fmtInt(value) {
    const parsed = numberOrNull(value);
    return parsed === null ? '—' : intFmt.format(Math.round(parsed));
  }

  function fmtPct(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return '—';
    const normalized = Math.abs(parsed) <= 3 ? parsed * 100 : parsed;
    return `${pctFmt.format(normalized)}%`;
  }

  function ratio(num, den) {
    const n = numberOrNull(num);
    const d = numberOrNull(den);
    if (n === null || d === null || d === 0) return null;
    return n / d;
  }

  function readModes() {
    try {
      return JSON.parse(localStorage.getItem(MODE_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function routeMode(route) {
    const stored = readModes()[route];
    const config = ROUTES[route];
    return config?.modes.some(([mode]) => mode === stored) ? stored : config?.modes[0]?.[0] || 'general';
  }

  function setRouteMode(route, mode) {
    const modes = readModes();
    modes[route] = mode;
    try { localStorage.setItem(MODE_KEY, JSON.stringify(modes)); } catch (_) {}
  }

  function activeRoute() {
    const fromState = window.state?.activeView;
    if (fromState && ROUTES[fromState]) return fromState;
    const active = document.querySelector('.view.active[id^="view-"]');
    const fromDom = active?.id?.replace(/^view-/, '');
    if (fromDom && ROUTES[fromDom]) return fromDom;
    return null;
  }

  function isActiveRoute(route) {
    return activeRoute() === route;
  }

  function clearInactiveShells(active) {
    Object.entries(ROUTES).forEach(([route, config]) => {
      if (route === active) return;
      document.getElementById(config.rootId)?.querySelector('[data-gtd-v2]')?.remove();
    });
  }

  function platformLabel(platform) {
    const key = String(platform || '').toLowerCase();
    if (key === 'wb' || key === 'wildberries') return 'WB';
    if (key === 'ozon') return 'Ozon';
    if (key === 'ym' || key === 'ya' || key.includes('yandex')) return 'Я.Маркет';
    return platform || 'Все';
  }

  function platformTone(platform) {
    const key = String(platform || '').toLowerCase();
    if (key === 'wb' || key === 'wildberries') return '#a855f7';
    if (key === 'ozon') return '#4f86ff';
    if (key === 'ym' || key === 'ya' || key.includes('yandex')) return '#f2c84b';
    if (key.includes('gold') || key.includes('золот')) return '#72c86a';
    if (key.includes('letu') || key.includes('лэту')) return '#d96aa9';
    if (key.includes('magnit') || key.includes('магнит')) return '#e85b55';
    return '#dbc7a3';
  }

  function setGlobalMarketplace(platform) {
    const normalized = String(platform || 'all').toLowerCase();
    try { localStorage.setItem('altea.portal.marketplace', normalized); } catch (_) {}
    document.documentElement.dataset.marketplace = normalized;
    document.body.dataset.marketplace = normalized;
    window.dispatchEvent(new CustomEvent('altea:marketplacechange', { detail: { platform: normalized } }));
  }

  function ensureStyle() {
    if (document.getElementById('altea-general-to-detail-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'altea-general-to-detail-v2-style';
    style.textContent = `
      .gtd-v2{--gtd-line:rgba(219,199,163,.18);--gtd-surface:rgba(17,15,12,.84);--gtd-muted:rgba(244,238,228,.64);--gtd-faint:rgba(244,238,228,.42);--gtd-accent:#dbc7a3;display:block;margin:0 0 14px;color:#f4eee4;animation:gtdV2In 240ms cubic-bezier(.22,.82,.22,1) both}
      .gtd-v2 *{box-sizing:border-box}
      .gtd-v2-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:10px}
      .gtd-v2-kicker{margin:0 0 5px;color:var(--gtd-accent);font-size:9px;font-weight:850;letter-spacing:.16em;text-transform:uppercase}
      .gtd-v2-title{margin:0;font:500 24px/1.08 Georgia,serif;letter-spacing:0}
      .gtd-v2-lead{margin:6px 0 0;color:var(--gtd-muted);font-size:11px;line-height:1.45}
      .gtd-v2-tabs{display:flex;gap:4px;padding:4px;border:1px solid var(--gtd-line);border-radius:999px;background:rgba(10,9,7,.86)}
      .gtd-v2-tab{height:30px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--gtd-muted);padding:0 12px;font-size:10px;font-weight:850;white-space:nowrap;cursor:pointer;transition:transform 160ms ease,border 160ms ease,background 160ms ease}
      .gtd-v2-tab:hover{transform:translateY(-1px)}
      .gtd-v2-tab[aria-selected="true"]{background:linear-gradient(180deg,#f0dfbf,#b89455);color:#17110a}
      .gtd-v2-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
      .gtd-v2-card,.gtd-v2-wide,.gtd-v2-drawer-card{position:relative;border:1px solid var(--gtd-line);border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));box-shadow:inset 0 1px rgba(255,255,255,.025);overflow:hidden}
      .gtd-v2-card{--pc:var(--gtd-accent);min-height:92px;padding:12px;text-align:left;color:inherit;cursor:pointer}
      .gtd-v2-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--pc);opacity:.78}
      .gtd-v2-card small,.gtd-v2-wide small{display:block;color:var(--gtd-faint);font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}
      .gtd-v2-card strong{display:block;margin-top:9px;font-size:20px;line-height:1.05}
      .gtd-v2-card span{display:block;margin-top:7px;color:var(--gtd-muted);font-size:10px;line-height:1.35}
      .gtd-v2-bar{height:4px;margin-top:10px;border-radius:999px;background:rgba(255,255,255,.11);overflow:hidden}
      .gtd-v2-bar i{display:block;height:100%;width:calc(var(--v,0)*1%);max-width:100%;border-radius:inherit;background:var(--pc);animation:gtdV2Bar 560ms cubic-bezier(.22,1,.36,1) both}
      .gtd-v2-wide{margin-top:9px;padding:12px}
      .gtd-v2-row-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:9px}
      .gtd-v2-note{margin:8px 0 0;color:var(--gtd-muted);font-size:10px;line-height:1.45}
      .gtd-v2-drawer-back{position:fixed;inset:0;z-index:130;background:rgba(0,0,0,.56);opacity:0;pointer-events:none;transition:opacity 240ms cubic-bezier(.22,.82,.22,1)}
      .gtd-v2-drawer-back.is-open{opacity:1;pointer-events:auto}
      .gtd-v2-drawer{position:absolute;right:0;top:0;width:min(620px,94vw);height:100%;padding:22px;border-left:1px solid var(--gtd-line);background:#0e0d0b;transform:translateX(100%);transition:transform 260ms cubic-bezier(.22,1,.36,1);overflow:auto}
      .gtd-v2-drawer-back.is-open .gtd-v2-drawer{transform:none}
      .gtd-v2-drawer h2{margin:0;font:500 28px/1.08 Georgia,serif}
      .gtd-v2-drawer p{color:var(--gtd-muted);font-size:11px;line-height:1.5}
      .gtd-v2-drawer-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
      .gtd-v2-drawer-card{padding:11px}
      .gtd-v2-drawer-card strong{display:block;margin-top:7px;font-size:15px}
      .gtd-v2-close{position:absolute;right:14px;top:14px;width:32px;height:32px;border:1px solid var(--gtd-line);border-radius:999px;background:#15120f;color:#f4eee4}
      .sku-plan-fact-row,.repricer-card,.oos-signal{cursor:pointer}
      @keyframes gtdV2In{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
      @keyframes gtdV2Bar{from{width:0}}
      @media(max-width:1350px){.gtd-v2-grid{grid-template-columns:repeat(3,1fr)}.gtd-v2-row-list{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:760px){.gtd-v2-head{flex-direction:column;align-items:flex-start}.gtd-v2-grid,.gtd-v2-row-list{grid-template-columns:1fr}.gtd-v2-tabs{overflow:auto;max-width:100%}.gtd-v2-drawer-grid{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){.gtd-v2 *,.gtd-v2 *::before,.gtd-v2 *::after{animation:none!important;transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function card(label, value, hint, options = {}) {
    const tone = options.tone || '#dbc7a3';
    const progress = numberOrNull(options.progress);
    const width = progress === null ? 0 : Math.max(0, Math.min(100, progress * 100));
    const attrs = options.attrs || '';
    return `
      <button class="gtd-v2-card" type="button" style="--pc:${escapeHtml(tone)}" ${attrs}>
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(hint || '')}</span>
        <div class="gtd-v2-bar" aria-hidden="true"><i style="--v:${width.toFixed(2)}"></i></div>
      </button>
    `;
  }

  function shell(route, inner) {
    const config = ROUTES[route];
    const mode = routeMode(route);
    const tabs = config.modes.map(([key, label]) => `
      <button class="gtd-v2-tab" type="button" data-gtd-v2-route="${escapeHtml(route)}" data-gtd-v2-mode="${escapeHtml(key)}" aria-selected="${key === mode ? 'true' : 'false'}">${escapeHtml(label)}</button>
    `).join('');
    return `
      <section class="gtd-v2" data-gtd-v2="${escapeHtml(route)}" data-gtd-v2-version="${escapeHtml(VERSION)}">
        <div class="gtd-v2-head">
          <div>
            <p class="gtd-v2-kicker">${escapeHtml(config.kicker)}</p>
            <h2 class="gtd-v2-title">${escapeHtml(config.title)}</h2>
            <p class="gtd-v2-lead">Новый слой ведет от общего показателя к рабочей детализации. Таблицы, фильтры, экспорт и расчетные модели ниже остаются native.</p>
          </div>
          <div class="gtd-v2-tabs" role="tablist">${tabs}</div>
        </div>
        ${inner}
      </section>
    `;
  }

  function inject(root, route, html) {
    if (!root) return;
    root.querySelector('[data-gtd-v2]')?.remove();
    root.insertAdjacentHTML('afterbegin', html);
    bindRoot(root, route);
  }

  function metricForPlanRow(row, model) {
    try {
      if (typeof window.skuPlanFactDisplayMetric === 'function') return window.skuPlanFactDisplayMetric(row, model) || row;
    } catch (_) {}
    return row || {};
  }

  function enhancePlanFact() {
    if (!isActiveRoute('sku-plan-fact')) return;
    const root = document.getElementById('view-sku-plan-fact');
    if (!root || typeof window.skuPlanFactBuildModel !== 'function') return;
    const model = window.skuPlanFactBuildModel();
    const rows = Array.isArray(model.rows) ? model.rows : [];
    const totals = model.totals || {};
    const mode = routeMode('sku-plan-fact');
    const cards = [
      card('Выполнение', fmtPct(totals.completionToDate), `${fmtMoney(totals.factRevenue)} / ${fmtMoney(totals.planToDateRevenue)}`, { progress: totals.completionToDate, tone: totals.completionToDate >= 1 ? '#74c99a' : '#e0b760' }),
      card('Разрыв к дате', fmtMoney(totals.gapToDate), `месячный план ${fmtMoney(totals.planRevenue || totals.monthPlanRevenue)}`, { tone: numberOrZero(totals.gapToDate) >= 0 ? '#74c99a' : '#e7786b' }),
      card('Маржа', fmtPct(totals.marginPct), `маржа RUB ${fmtMoney(totals.marginRub)}`, { progress: totals.marginPct, tone: '#74c99a' }),
      card('Реклама / ДРР', fmtMoney(totals.adSpend), `ДРР ${fmtPct(totals.drr)}`, { progress: totals.drr, tone: '#e0b760' }),
      card('SKU в срезе', fmtInt(rows.length), `owner ${fmtInt((model.owners || []).length)}`, { progress: rows.length ? 1 : 0, tone: '#76a9ea' })
    ];
    const platformMap = new Map();
    const ownerMap = new Map();
    rows.forEach((row) => {
      const metric = metricForPlanRow(row, model);
      const platform = metric.platform || row.platform || row.primaryPlatform || 'all';
      const owner = row.owner || 'Без owner';
      const add = (map, key) => {
        const current = map.get(key) || { key, count: 0, plan: 0, fact: 0, gap: 0 };
        current.count += 1;
        current.plan += numberOrZero(metric.planToDateRevenue ?? metric.planRevenue);
        current.fact += numberOrZero(metric.factRevenue);
        current.gap += numberOrZero(metric.gapToDate ?? metric.gap);
        map.set(key, current);
      };
      add(platformMap, platform);
      add(ownerMap, owner);
    });
    const platformCards = Array.from(platformMap.values()).sort((a, b) => b.fact - a.fact).slice(0, 6).map((item) => {
      const completion = ratio(item.fact, item.plan);
      return card(platformLabel(item.key), fmtPct(completion), `${fmtMoney(item.fact)} · ${fmtInt(item.count)} SKU`, {
        tone: platformTone(item.key),
        progress: completion,
        attrs: `data-gtd-platform="${escapeHtml(item.key)}"`
      });
    }).join('');
    const ownerCards = Array.from(ownerMap.values()).sort((a, b) => a.gap - b.gap).slice(0, 10).map((item) => {
      const completion = ratio(item.fact, item.plan);
      return card(item.key, fmtPct(completion), `${fmtMoney(item.fact)} · gap ${fmtMoney(item.gap)}`, {
        tone: item.gap < 0 ? '#e7786b' : '#74c99a',
        progress: completion,
        attrs: `data-gtd-owner="${escapeHtml(item.key)}"`
      });
    }).join('');
    const body = mode === 'who'
      ? `<div class="gtd-v2-grid">${ownerCards || cards.join('')}</div><p class="gtd-v2-note">Клик по owner открывает SKU сотрудника, исходная таблица ниже остается рабочей.</p>`
      : mode === 'what'
        ? `<div class="gtd-v2-wide"><small>Полная рабочая таблица</small><p class="gtd-v2-note">Все строки ниже кликабельны: открывают контекст SKU с планом, фактом, маржей и рекламой. Фильтры и Excel-выгрузка сохранены.</p></div>`
        : `<div class="gtd-v2-grid">${cards.join('')}</div><div class="gtd-v2-wide"><small>Площадки</small><div class="gtd-v2-row-list">${platformCards}</div></div>`;
    inject(root, 'sku-plan-fact', shell('sku-plan-fact', body));
  }

  function enhanceRepricer() {
    if (!isActiveRoute('repricer')) return;
    const root = document.getElementById('view-repricer');
    if (!root || typeof window.buildRepricerRows !== 'function') return;
    const rows = window.buildRepricerRows();
    const sideRows = rows.flatMap((row) => [row.wb, row.ozon].filter(Boolean));
    const changed = rows.filter((row) => row.changed || row.hasManualOverride).length;
    const safe = sideRows.filter((side) => side.safeToExport || side.promoSafeToExport).length;
    const audit = sideRows.filter((side) => side.confidence === 'yellow').length;
    const stop = sideRows.filter((side) => side.confidence === 'red' || side.criticalGate === 'BLOCK').length;
    const belowMin = sideRows.filter((side) => side.belowMin || side.floorRaiseReady).length;
    const mode = routeMode('repricer');
    const cards = [
      card('Готовность контура', fmtPct(ratio(safe, Math.max(sideRows.length, 1))), `${fmtInt(safe)} безопасных из ${fmtInt(sideRows.length)}`, { progress: ratio(safe, Math.max(sideRows.length, 1)), tone: safe ? '#74c99a' : '#e0b760' }),
      card('Решения', fmtInt(changed), 'изменения цены / ручные решения', { progress: ratio(changed, Math.max(rows.length, 1)), tone: '#e0b760', attrs: 'data-gtd-repricer-filter="changes"' }),
      card('Аудит', fmtInt(audit), 'желтые строки без автопубликации', { progress: ratio(audit, Math.max(sideRows.length, 1)), tone: '#76a9ea', attrs: 'data-gtd-repricer-filter="audit"' }),
      card('Стоп', fmtInt(stop), 'красные guard-ограничения', { progress: ratio(stop, Math.max(sideRows.length, 1)), tone: '#e7786b', attrs: 'data-gtd-repricer-filter="blocked"' }),
      card('Ниже MIN', fmtInt(belowMin), 'поднять или проверить вручную', { progress: ratio(belowMin, Math.max(sideRows.length, 1)), tone: '#e0b760', attrs: 'data-gtd-repricer-filter="below_min"' })
    ];
    const body = mode === 'decisions'
      ? `<div class="gtd-v2-grid">${cards.slice(1, 5).join('')}</div><p class="gtd-v2-note">Режим решений использует текущий guard/workflow репрайсера. Дизайн-клик не помечает строку безопасной.</p>`
      : mode === 'audit'
        ? `<div class="gtd-v2-grid">${cards.slice(2, 5).join('')}</div><p class="gtd-v2-note">Аудит и стоп-логика остаются native: выгрузки и импорт ниже работают как раньше.</p>`
        : `<div class="gtd-v2-grid">${cards.join('')}</div>`;
    inject(root, 'repricer', shell('repricer', body));
  }

  function enhanceOos() {
    if (!isActiveRoute('oos-control')) return;
    const root = document.getElementById('view-oos-control');
    if (!root) return;
    const payload = typeof window.oosControlPayload === 'function' ? window.oosControlPayload() : {};
    const rows = typeof window.oosControlFilteredRows === 'function'
      ? window.oosControlFilteredRows()
      : (typeof window.oosControlRows === 'function' ? window.oosControlRows() : []);
    const summary = payload.summary || {};
    const critical = rows.filter((row) => numberOrZero(row.turnoverDays ?? row.daysLeft ?? row.coverageDays) < 10).length;
    const watch = rows.filter((row) => {
      const days = numberOrZero(row.turnoverDays ?? row.daysLeft ?? row.coverageDays);
      return days >= 10 && days < 28;
    }).length;
    const riskDay = rows.reduce((total, row) => total + numberOrZero(row.lostRevenueDay ?? row.riskRevenueDay ?? row.revenueAtRiskDay), 0) || numberOrZero(summary.lostRevenueDay || summary.riskRevenueDay);
    const platforms = new Map();
    rows.forEach((row) => {
      const key = row.platform || row.marketplace || 'all';
      const current = platforms.get(key) || { key, count: 0, risk: 0 };
      current.count += 1;
      current.risk += numberOrZero(row.lostRevenueDay ?? row.riskRevenueDay ?? row.revenueAtRiskDay);
      platforms.set(key, current);
    });
    const cards = [
      card('Риск / день', fmtMoney(riskDay), `месяц ${fmtMoney(riskDay * 30)}`, { tone: '#e7786b', progress: riskDay ? 1 : 0 }),
      card('< 10 дней', fmtInt(critical || summary.oosSoonCount || summary.oosCount), 'критический горизонт', { tone: '#e7786b', progress: ratio(critical, Math.max(rows.length, 1)) }),
      card('10-28 дней', fmtInt(watch), 'watch-зона', { tone: '#e0b760', progress: ratio(watch, Math.max(rows.length, 1)) }),
      card('SKU x кластер', fmtInt(rows.length), 'рабочие сигналы в текущем фильтре', { tone: '#76a9ea', progress: rows.length ? 1 : 0 }),
      card('Свежесть', summary.dataDate || payload.dataFreshness?.dataDate || '—', 'источник OOS builder', { tone: '#74c99a', progress: 1 })
    ];
    const platformCards = Array.from(platforms.values()).sort((a, b) => b.risk - a.risk).slice(0, 6).map((item) => card(
      platformLabel(item.key),
      fmtMoney(item.risk),
      `${fmtInt(item.count)} сигналов`,
      { tone: platformTone(item.key), progress: ratio(item.risk, Math.max(riskDay, 1)), attrs: `data-gtd-platform="${escapeHtml(item.key)}"` }
    )).join('');
    const mode = routeMode('oos-control');
    const body = mode === 'articles'
      ? `<div class="gtd-v2-grid">${cards.slice(1, 4).join('')}</div><p class="gtd-v2-note">Ниже остается native-очередь SKU с задачами, причинами и контрмерами.</p>`
      : mode === 'clusters'
        ? `<div class="gtd-v2-wide"><small>Кластеры</small><p class="gtd-v2-note">Клик по native OOS-сигналу ниже сохраняет текущий рабочий фокус. Детализация кластера берется из OOS builder, без подстановки демо-цифр.</p></div>`
        : `<div class="gtd-v2-grid">${cards.join('')}</div><div class="gtd-v2-wide"><small>Площадки</small><div class="gtd-v2-row-list">${platformCards}</div></div>`;
    inject(root, 'oos-control', shell('oos-control', body));
  }

  function drawerMetric(label, value) {
    return `<div class="gtd-v2-drawer-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`;
  }

  function openDrawer(title, subtitle, metrics, note = '') {
    let back = document.querySelector('.gtd-v2-drawer-back');
    if (!back) {
      back = document.createElement('div');
      back.className = 'gtd-v2-drawer-back';
      back.innerHTML = '<aside class="gtd-v2-drawer"><button class="gtd-v2-close" type="button" aria-label="Закрыть">×</button><div data-gtd-v2-drawer-content></div></aside>';
      document.body.appendChild(back);
      back.addEventListener('click', (event) => {
        if (event.target === back || event.target.closest('.gtd-v2-close')) back.classList.remove('is-open');
      });
    }
    const content = back.querySelector('[data-gtd-v2-drawer-content]');
    content.innerHTML = `
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(subtitle || '')}</p>
      <div class="gtd-v2-drawer-grid">${metrics.map(([label, value]) => drawerMetric(label, value)).join('')}</div>
      ${note ? `<p>${escapeHtml(note)}</p>` : ''}
    `;
    back.classList.add('is-open');
  }

  function openPlanSkuDrawer(articleKey) {
    if (typeof window.skuPlanFactBuildModel !== 'function') return;
    const model = window.skuPlanFactBuildModel();
    const rows = Array.isArray(model.allRows) ? model.allRows : (model.rows || []);
    const row = rows.find((item) => String(item.articleKey || item.article || '') === String(articleKey));
    if (!row) return;
    const metric = metricForPlanRow(row, model);
    openDrawer(row.name || row.article || articleKey, `${row.owner || 'Без owner'} · ${platformLabel(metric.platform || row.platform)}`, [
      ['План к дате', fmtMoney(metric.planToDateRevenue ?? metric.planRevenue)],
      ['Факт', fmtMoney(metric.factRevenue)],
      ['Выполнение', fmtPct(metric.completionToDate)],
      ['Разрыв', fmtMoney(metric.gapToDate ?? metric.gap)],
      ['Маржа', fmtPct(metric.marginPct)],
      ['Реклама', fmtMoney(metric.adSpend)]
    ], 'Карточка открыта из нового слоя, но исходная SKU-логика и рабочие действия остаются native.');
  }

  function openOwnerDrawer(owner) {
    if (typeof window.skuPlanFactBuildModel !== 'function') return;
    const model = window.skuPlanFactBuildModel();
    const rows = (model.rows || []).filter((row) => String(row.owner || '') === String(owner));
    const fact = rows.reduce((total, row) => total + numberOrZero(metricForPlanRow(row, model).factRevenue), 0);
    const plan = rows.reduce((total, row) => total + numberOrZero(metricForPlanRow(row, model).planToDateRevenue), 0);
    openDrawer(owner, `${fmtInt(rows.length)} SKU в текущем срезе`, [
      ['Факт', fmtMoney(fact)],
      ['План к дате', fmtMoney(plan)],
      ['Выполнение', fmtPct(ratio(fact, plan))],
      ['Gap', fmtMoney(fact - plan)]
    ], 'Для глубокой работы оставлена полная таблица ниже: фильтры, сортировка и Excel не менялись.');
  }

  function bindRoot(root, route) {
    if (!root || root.dataset.gtdV2Bound) return;
    root.dataset.gtdV2Bound = '1';
    root.addEventListener('click', (event) => {
      const modeButton = event.target.closest('[data-gtd-v2-mode]');
      if (modeButton) {
        const nextRoute = modeButton.getAttribute('data-gtd-v2-route') || route;
        const nextMode = modeButton.getAttribute('data-gtd-v2-mode') || 'general';
        setRouteMode(nextRoute, nextMode);
        if (nextRoute === 'repricer' && window.state?.repricerFilters) {
          if (nextMode === 'decisions') window.state.repricerFilters.mode = 'changes';
          if (nextMode === 'audit') window.state.repricerFilters.mode = 'blocked';
        }
        renderRoute(nextRoute);
        return;
      }
      const platformButton = event.target.closest('[data-gtd-platform]');
      if (platformButton) {
        setGlobalMarketplace(platformButton.getAttribute('data-gtd-platform') || 'all');
        return;
      }
      const ownerButton = event.target.closest('[data-gtd-owner]');
      if (ownerButton) {
        openOwnerDrawer(ownerButton.getAttribute('data-gtd-owner') || '');
        return;
      }
      const skuRow = event.target.closest('.sku-plan-fact-row[data-sku-plan-article], [data-sku-plan-article]');
      if (route === 'sku-plan-fact' && skuRow) {
        openPlanSkuDrawer(skuRow.getAttribute('data-sku-plan-article') || skuRow.dataset.skuPlanArticle);
      }
    });
  }

  function renderRoute(route) {
    if (route === 'sku-plan-fact' && typeof window.renderSkuPlanFact === 'function') window.renderSkuPlanFact('view-sku-plan-fact', { force: true });
    if (route === 'repricer' && typeof window.renderRepricer === 'function') window.renderRepricer();
    if (route === 'oos-control' && typeof window.renderOosControl === 'function') window.renderOosControl('view-oos-control');
  }

  function enhanceVisible() {
    const route = activeRoute();
    clearInactiveShells(route);
    if (route === 'sku-plan-fact') enhancePlanFact();
    if (route === 'repricer') enhanceRepricer();
    if (route === 'oos-control') enhanceOos();
  }

  function wrapRenderers() {
    const wrap = (name, after) => {
      const original = window[name];
      if (typeof original !== 'function' || original.gtdV2Wrapped) return;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        after();
        return result;
      };
      wrapped.gtdV2Wrapped = true;
      window[name] = wrapped;
    };
    wrap('renderSkuPlanFact', enhancePlanFact);
    wrap('renderRepricer', enhanceRepricer);
    wrap('renderOosControl', enhanceOos);
  }

  function boot() {
    ensureStyle();
    wrapRenderers();
    window.addEventListener('altea:viewchange', () => clearInactiveShells(activeRoute()));
    enhanceVisible();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
