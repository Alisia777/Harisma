(function () {
  var ROUTES = {
    dashboard: {
      id: 'dashboard',
      index: '01',
      title: 'Дашборд',
      kicker: 'Картина дня',
      headline: 'Спокойный центр управления брендом',
      caption: 'Пульс, лидеры и сигналы без старого визуального слоя.',
      accent: '#D8C6A4',
      rgb: '216,198,164'
    },
    executive: {
      id: 'executive',
      index: '02',
      title: 'Руководителю',
      kicker: 'Управленческий контур',
      headline: 'Решения раньше, чем проблемы',
      caption: 'Сначала итог, затем доказательство, после исключения по действию.',
      accent: '#E2CFAF',
      rgb: '226,207,175'
    }
  };

  var NAV_ROUTES = [
    { id: 'dashboard', index: '01', group: 'Главное', title: 'Дашборд', caption: 'Пульс · лидеры · сигналы', icon: 'grid' },
    { id: 'executive', index: '02', group: 'Главное', title: 'Руководителю', caption: 'Риски · решения · итог', icon: 'crown' },
    { id: 'control', index: '03', group: 'Главное', title: 'Задачи', caption: 'Задачи · РОП · контроль', icon: 'check' },
    { id: 'data-health', index: '04', group: 'Главное', title: 'Календарь', caption: 'Акции · события · SKU', icon: 'calendar' },
    { id: 'sku-plan-fact', index: '05', group: 'Деньги и товар', title: 'План-факт SKU', caption: 'План · факт · чек · ДРР', icon: 'chart' },
    { id: 'repricer', index: '06', group: 'Деньги и товар', title: 'Репрайсер', caption: 'Цена · риски · рекомендации', icon: 'diamond' },
    { id: 'prices', index: '07', group: 'Деньги и товар', title: 'Цены', caption: 'Маржа · оборот · СПП', icon: 'tag' },
    { id: 'order', index: '08', group: 'Деньги и товар', title: 'Заказ товара', caption: 'Кластеры · склады · поставки', icon: 'box' },
    { id: 'oos-control', index: '09', group: 'Деньги и товар', title: 'OOS контроль', caption: 'Пустые полки · меры', icon: 'alert' },
    { id: 'sku-contour', index: '10', group: 'Продукт', title: 'SKU workspace', caption: 'Реестр · API · план-факт', icon: 'blocks' },
    { id: 'launches', index: '11', group: 'Продукт', title: 'Новинки', caption: 'Товар · экономика', icon: 'rocket' },
    { id: 'launch-control', index: '12', group: 'Продукт', title: 'Запуск новинок', caption: 'Фазы · просрочки', icon: 'flag' },
    { id: 'iu-drr', index: '13', group: 'Аналитика', title: 'ИУ / ДРР', caption: 'WB · Ozon · расходы', icon: 'pie' },
    { id: 'wb-rating', index: '14', group: 'Аналитика', title: 'Рейтинг карточек', caption: 'Отзывы · динамика', icon: 'star' },
    { id: 'product-leaderboard', index: '15', group: 'Аналитика', title: 'Лидерборд', caption: 'КЗ · воронка · ROMI', icon: 'trophy' }
  ];

  var NAV_BY_ID = NAV_ROUTES.reduce(function (acc, route) {
    acc[route.id] = route;
    return acc;
  }, {});

  var PLATFORM = {
    all: { label: 'Все', color: '#D8C6A4', rgb: '216,198,164' },
    wb: { label: 'WB', color: '#A855F7', rgb: '168,85,247' },
    ozon: { label: 'Ozon', color: '#4F86FF', rgb: '79,134,255' },
    ya: { label: 'Я.Маркет', color: '#F2C84B', rgb: '242,200,75' },
    ym: { label: 'Я.Маркет', color: '#F2C84B', rgb: '242,200,75' },
    goldapple: { label: 'ЗЯ', color: '#72C86A', rgb: '114,200,106' },
    letu: { label: 'Л’Этуаль', color: '#D96AA9', rgb: '217,106,169' },
    magnit: { label: 'Магнит', color: '#E85B55', rgb: '232,91,85' }
  };

  var renderFrame = 0;
  var observer = null;
  var renderLock = false;
  var guardTimer = 0;

  function state() {
    return window.__alteaAppState || window.state || {};
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function finite(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function ratio(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function clampPct(value) {
    var num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, num * 100));
  }

  function money(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    if (window.fmt && typeof window.fmt.money === 'function') return window.fmt.money(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value)) + ' ₽';
  }

  function int(value) {
    if (window.fmt && typeof window.fmt.int === 'function') return window.fmt.int(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(finite(value));
  }

  function pct(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    if (window.fmt && typeof window.fmt.pct === 'function') return window.fmt.pct(value);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(Number(value) * 100) + '%';
  }

  function platformMeta(key) {
    return PLATFORM[key] || PLATFORM.all;
  }

  function platformStyle(key) {
    var meta = platformMeta(key);
    return '--platform:' + meta.color + ';--platform-rgb:' + meta.rgb + ';--pc:' + meta.color;
  }

  function routeStyle(route, platform) {
    var meta = platformMeta(platform || 'all');
    return '--route-accent:' + route.accent + ';--route-rgb:' + route.rgb + ';--platform:' + meta.color + ';--platform-rgb:' + meta.rgb;
  }

  function icon(name) {
    var paths = {
      grid: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
      crown: '<path d="M3 8l4 3 5-7 5 7 4-3v10H3z"></path><path d="M3 18h18"></path>',
      check: '<path d="M9 11l2 2 5-6"></path><rect x="4" y="4" width="16" height="16" rx="2"></rect>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>',
      chart: '<path d="M4 19V5"></path><path d="M4 19h17"></path><path d="M8 15l3-4 3 2 4-7"></path>',
      diamond: '<path d="M12 3l8 7-8 11-8-11z"></path><path d="M4 10h16M9 10l3 11 3-11"></path>',
      tag: '<path d="M20 10l-8 8-8-8V4h6z"></path><path d="M8 8h.01"></path>',
      box: '<path d="M21 8l-9-5-9 5 9 5z"></path><path d="M3 8v8l9 5 9-5V8"></path><path d="M12 13v8"></path>',
      alert: '<path d="M12 3l10 18H2z"></path><path d="M12 9v5M12 17h.01"></path>',
      blocks: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
      rocket: '<path d="M5 19c2-5 6-11 14-14-1 8-9 12-14 14z"></path><path d="M14 6l4 4"></path><path d="M5 19l-2 2 2-6 4 4z"></path>',
      flag: '<path d="M5 21V4"></path><path d="M5 4h12l-2 4 2 4H5"></path>',
      pie: '<path d="M12 3v9h9"></path><path d="M19.1 15A8 8 0 1 1 9 3.6"></path>',
      star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"></path>',
      trophy: '<path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"></path>'
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || paths.grid) + '</svg>';
  }

  function toneClass(value, low, ok) {
    var num = ratio(value);
    if (num == null) return '';
    if (num >= ok) return '';
    if (num >= low) return ' warn';
    return ' bad';
  }

  function status(label, value, low, ok) {
    return '<span class="status' + toneClass(value, low, ok) + '">' + escapeHtml(label) + '</span>';
  }

  function head(route, actions) {
    return [
      '<header class="route-head">',
      '<div><div class="route-kicker">' + escapeHtml(route.kicker) + '</div>',
      '<h1>' + escapeHtml(route.headline) + '</h1>',
      '<p>' + escapeHtml(route.caption) + '</p></div>',
      '<div class="route-actions">' + (actions || '') + '</div>',
      '</header>'
    ].join('');
  }

  function panel(title, body, className, badge) {
    return [
      '<section class="panel ' + escapeHtml(className || 'panel-pad') + '">',
      title ? '<div class="panel-title"><div><h2>' + escapeHtml(title) + '</h2></div>' + (badge ? '<small>' + escapeHtml(badge) + '</small>' : '') + '</div>' : '',
      body || '',
      '</section>'
    ].join('');
  }

  function metric(label, value, hint, progress, extraClass, style) {
    var width = Number.isFinite(Number(progress)) ? Math.max(3, Math.min(100, Number(progress))) : 0;
    return [
      '<article class="panel metric ' + escapeHtml(extraClass || '') + '" style="--p:' + width.toFixed(1) + '%;' + (style || '') + '">',
      '<div class="micro">' + escapeHtml(label) + '</div>',
      '<div class="value">' + escapeHtml(value) + '</div>',
      '<div class="muted" style="margin-top:6px;font-size:9px;line-height:1.45">' + escapeHtml(hint || '') + '</div>',
      '<div class="bar"><i></i></div>',
      '</article>'
    ].join('');
  }

  function list(rows) {
    return '<div class="list">' + rows.map(function (row) {
      return '<div class="list-row"><div><strong>' + escapeHtml(row[0]) + '</strong><span>' + escapeHtml(row[1] || '') + '</span></div><em>' + escapeHtml(row[2] || '') + '</em></div>';
    }).join('') + '</div>';
  }

  function chart(values) {
    var series = values && values.length ? values.map(function (value) { return finite(value); }) : [42, 48, 51, 57, 62, 66, 71, 74, 81, 88];
    if (series.length === 1) series = [Math.max(0, series[0] * .75), series[0]];
    var max = Math.max.apply(Math, series.concat([1]));
    var min = Math.min.apply(Math, series.concat([0]));
    var span = Math.max(1, max - min);
    var points = series.map(function (value, index) {
      var x = series.length === 1 ? 0 : index * (360 / (series.length - 1));
      var y = 140 - ((value - min) / span) * 120;
      return [x, y];
    });
    var d = points.map(function (point, index) {
      return (index ? 'L' : 'M') + point[0].toFixed(1) + ' ' + point[1].toFixed(1);
    }).join(' ');
    var area = d + ' L 360 150 L 0 150 Z';
    var dots = points.map(function (point) {
      return '<circle class="chart-dot" cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1) + '" r="3"></circle>';
    }).join('');
    return [
      '<div class="chart"><svg viewBox="0 0 360 155" preserveAspectRatio="none" aria-hidden="true">',
      '<g class="chart-grid"><line x1="0" y1="30" x2="360" y2="30"></line><line x1="0" y1="75" x2="360" y2="75"></line><line x1="0" y1="120" x2="360" y2="120"></line></g>',
      '<path class="chart-area" d="' + area + '"></path>',
      '<path class="chart-line" d="' + d + '"></path>',
      dots,
      '</svg></div>'
    ].join('');
  }

  function buildExecutiveModel() {
    var funnel = typeof window.executiveFunnelBuildModel === 'function'
      ? window.executiveFunnelBuildModel()
      : {};
    var model = typeof window.executiveFunnelBuildOwnerPlanFact === 'function'
      ? window.executiveFunnelBuildOwnerPlanFact(funnel || {})
      : null;
    if (model && model.ready) return model;
    return {
      ready: false,
      reason: funnel && funnel.reason ? funnel.reason : 'Данные управленческого контура еще загружаются.',
      filters: {},
      platformRows: [],
      ownerRows: [],
      allOwnerRows: [],
      totals: {}
    };
  }

  function executiveFactPending(model) {
    if (!model || !model.ready) return false;
    var totals = model.totals || {};
    var hasPlan = finite(totals.planToDateRevenue || totals.planRevenue) > 0;
    var hasFact = finite(totals.factRevenue) > 0 || finite(totals.apiFactRevenue) > 0 || finite(totals.marginRub) > 0;
    var hasSpend = finite(totals.adSpend) > 0;
    return hasPlan && hasSpend && !hasFact;
  }

  function ownerOptions(model) {
    var selected = String(model.filters && model.filters.owner || 'all');
    var options = ['<option value="all"' + (selected === 'all' ? ' selected' : '') + '>Все сотрудники</option>'];
    (model.ownerOptions || []).forEach(function (owner) {
      var value = String(owner || '');
      options.push('<option value="' + escapeHtml(value) + '"' + (value === selected ? ' selected' : '') + '>' + escapeHtml(value) + '</option>');
    });
    return options.join('');
  }

  function executiveControls(model) {
    var filters = model.filters || {};
    var platform = filters.platform || 'all';
    var statusFilter = filters.status || 'all';
    function button(kind, value, label, active) {
      return '<button type="button" class="' + (active ? 'is-active' : '') + '" data-executive-funnel-' + kind + '="' + escapeHtml(value) + '">' + escapeHtml(label) + '</button>';
    }
    return [
      '<div class="premium-controlbar">',
      '<div class="panel"><span class="premium-mini-label">Площадка</span><div class="premium-segment">',
      button('platform', 'all', 'Все', platform === 'all'),
      button('platform', 'wb', 'WB', platform === 'wb'),
      button('platform', 'ozon', 'Ozon', platform === 'ozon'),
      button('platform', 'ya', 'Яндекс', platform === 'ya'),
      '</div></div>',
      '<div class="panel"><span class="premium-mini-label">Статус</span><div class="premium-segment">',
      button('status', 'all', 'Все', statusFilter === 'all'),
      button('status', 'danger', '< 90%', statusFilter === 'danger'),
      button('status', 'watch', '90-100%', statusFilter === 'watch'),
      button('status', 'ok', 'OK', statusFilter === 'ok'),
      '</div></div>',
      '<label class="panel"><span class="premium-mini-label">Сотрудник</span><select data-executive-funnel-owner>' + ownerOptions(model) + '</select></label>',
      '<label class="panel"><span class="premium-mini-label">Поиск</span><input type="search" value="' + escapeHtml(filters.search || '') + '" placeholder="Имя" data-executive-funnel-search></label>',
      '<label class="panel"><span class="premium-mini-label">Сортировка</span><select data-executive-funnel-sort>',
      '<option value="completionAsc"' + (filters.sort === 'completionAsc' ? ' selected' : '') + '>сначала ниже плана</option>',
      '<option value="gapAsc"' + (filters.sort === 'gapAsc' ? ' selected' : '') + '>по отставанию</option>',
      '<option value="revenueDesc"' + (filters.sort === 'revenueDesc' ? ' selected' : '') + '>по обороту</option>',
      '<option value="marginAsc"' + (filters.sort === 'marginAsc' ? ' selected' : '') + '>по марже</option>',
      '</select></label>',
      '</div>'
    ].join('');
  }

  function executiveHero(model) {
    var totals = model.totals || {};
    var completion = ratio(totals.completionToDate);
    var heroValue = completion == null ? '—' : pct(completion);
    var platform = model.selectedPlatform || (model.filters && model.filters.platform) || 'all';
    return [
      '<section class="panel hero route-glow platform-line span2">',
      '<div class="hero-grid">',
      '<div class="hero-copy">',
      '<div class="micro">Управленческий итог</div>',
      '<h2>Где план держится, а где уже нужно решение</h2>',
      '<p>Портал показывает только рабочие исключения: оборот, маржу, рекламу и команду по выбранному контуру.</p>',
      '<div class="hero-number"><div class="value lg">' + escapeHtml(heroValue) + '</div><small>выполнение к плану</small></div>',
      '</div>',
      '<div class="hero-orbit"><div class="core">' + escapeHtml(heroValue) + '</div></div>',
      '</div>',
      '</section>',
      panel('Решения на сегодня', executiveDecisionList(model), 'panel-pad platform-focus', (model.ownerRows || []).length + ' строк'),
      '<div class="grid g4 section-gap">',
      metric('Оборот', pct(totals.completionToDate), 'план ' + money(totals.planToDateRevenue) + ' · факт ' + money(totals.factRevenue), clampPct(totals.completionToDate)),
      metric('Маржа', pct(totals.marginPct), 'план ' + pct(totals.planMarginPct) + ' · факт ' + money(totals.marginRub), clampPct(totals.marginPct)),
      metric('Реклама', pct(totals.drr), 'план ' + money(totals.planAdSpend) + ' · факт ' + money(totals.adSpend), clampPct(totals.drr)),
      metric('Команда', int(totals.okCount || 0) + ' / ' + int(totals.employeeCount || 0), 'в плане / всего сотрудников', totals.employeeCount ? (finite(totals.okCount) / finite(totals.employeeCount) * 100) : 0),
      '</div>',
      '<div class="grid g2 section-gap">',
      panel('План → факт → прогноз', chart((model.platformRows || []).map(function (row) { return finite(row.completionToDate) * 100; })), 'panel-pad'),
      panel('Исключения, а не шум', executiveExceptions(model), 'panel-pad', 'топ сигналов'),
      '</div>'
    ].join('');
  }

  function executiveDecisionList(model) {
    var rows = (model.ownerRows || []).slice(0, 4).map(function (row) {
      var gap = finite(row.gapToDate);
      var action = gap < 0 ? 'догнать' : 'удержать';
      return [row.owner || 'Сотрудник', (row.primaryPlatform || 'all').toUpperCase() + ' · ' + pct(row.completionToDate) + ' · ' + money(row.gapToDate), action];
    });
    if (!rows.length) rows = [['Контур готовится', model.reason || 'Данные еще собираются', 'ждем']];
    return list(rows);
  }

  function executiveExceptions(model) {
    var rows = (model.allOwnerRows || model.ownerRows || []).slice(0, 6).map(function (row) {
      return [
        row.owner || 'Сотрудник',
        (row.primaryPlatform || 'all').toUpperCase() + ' · ' + pct(row.completionToDate) + ' · маржа ' + pct(row.marginPct),
        money(row.gapToDate)
      ];
    });
    return list(rows.length ? rows : [['Нет исключений', 'Контур без критичного отклонения', 'OK']]);
  }

  function executivePlatforms(model) {
    var rows = model.platformRows || [];
    if (!rows.length) return '';
    return '<div class="grid g3 section-gap">' + rows.map(function (row) {
      var key = row.platform || 'all';
      var meta = platformMeta(key);
      return [
        '<article class="panel metric platform-metric platform-card" style="' + platformStyle(key) + ';--p:' + clampPct(row.completionToDate).toFixed(1) + '%">',
        '<div class="micro">' + escapeHtml(row.label || meta.label) + '</div>',
        '<div class="value">' + escapeHtml(pct(row.completionToDate)) + '</div>',
        '<div class="muted" style="margin-top:6px;font-size:9px;line-height:1.45">' + money(row.factRevenue) + ' / ' + money(row.planToDateRevenue) + '</div>',
        '<div class="bar"><i></i></div>',
        '</article>'
      ].join('');
    }).join('') + '</div>';
  }

  function executiveOwners(model) {
    var rows = model.ownerRows || [];
    if (!rows.length) return panel('Сотрудники', '<div class="premium-empty">По выбранному фильтру нет сотрудников.</div>', 'panel-pad section-gap');
    return panel('Сотрудники', [
      '<table class="premium-table">',
      '<thead><tr><th>Сотрудник</th><th>Контур</th><th>Выполнение</th><th>Факт / план</th><th>Маржа</th><th>Реклама</th></tr></thead>',
      '<tbody>',
      rows.slice(0, 12).map(function (row) {
        return [
          '<tr data-executive-funnel-owner-card="' + escapeHtml(row.owner || '') + '">',
          '<td><strong>' + escapeHtml(row.owner || '—') + '</strong><small>' + int(row.articleCount || 0) + ' SKU в KPI</small></td>',
          '<td>' + escapeHtml((row.primaryPlatform || 'all').toUpperCase()) + '</td>',
          '<td><strong>' + escapeHtml(pct(row.completionToDate)) + '</strong><small>' + escapeHtml(finite(row.gapToDate) < 0 ? 'догнать' : 'в плане') + '</small></td>',
          '<td>' + money(row.factRevenue) + '<small>план ' + money(row.planToDateRevenue) + '</small></td>',
          '<td>' + pct(row.marginPct) + '<small>' + money(row.marginRub) + '</small></td>',
          '<td>' + money(row.adSpend) + '<small>ДРР ' + pct(row.drr) + '</small></td>',
          '</tr>'
        ].join('');
      }).join(''),
      '</tbody></table>'
    ].join(''), 'panel-pad section-gap', rows.length + ' показано');
  }

  function renderExecutive(root) {
    var route = ROUTES.executive;
    var model = buildExecutiveModel();
    var factPending = executiveFactPending(model);
    var platform = model.selectedPlatform || (model.filters && model.filters.platform) || 'all';
    var stage = ensureStage(route.id);
    var signature = JSON.stringify({
      route: route.id,
      ready: model.ready,
      factPending: factPending,
      periodStart: model.periodStart,
      periodEnd: model.periodEnd,
      filters: model.filters,
      totals: model.totals,
      owners: (model.ownerRows || []).slice(0, 12).map(function (row) {
        return [row.owner, row.factRevenue, row.planToDateRevenue, row.completionToDate, row.gapToDate];
      })
    });
    if (root.dataset.premiumSignature === signature && stage.dataset.premiumSignature === signature && stage.querySelector('.altea-premium-route')) {
      pruneLegacyChildren(root);
      positionStage(root, stage);
      syncStageVisibility(route.id);
      return;
    }
    root.dataset.premiumSignature = signature;
    root.dataset.premiumRoute = route.id;
    root.style.setProperty('--route-accent', route.accent);
    root.style.setProperty('--route-rgb', route.rgb);
    pruneLegacyChildren(root);
    stage.dataset.premiumSignature = signature;
    positionStage(root, stage);
    stage.innerHTML = [
      '<section class="altea-premium-route altea-premium-route--executive" style="' + routeStyle(route, platform) + '">',
      '<div class="premium-route-body">',
      head(route, '<button class="btn" type="button" data-premium-navigate="control">Открыть задачи</button><button class="btn primary" type="button" data-executive-funnel-status="danger">Показать риски</button>'),
      model.ready && !factPending ? executiveControls(model) + '<div class="grid g3">' + executiveHero(model) + '</div>' + executivePlatforms(model) + executiveOwners(model) : executiveLoadingPanel(model, factPending),
      '</div></section>'
    ].join('');
    syncStageVisibility(route.id);
  }

  function executiveLoadingPanel(model, factPending) {
    var text = factPending
      ? 'План и рекламный слой уже на месте, фактические продажи еще догружаются. Нулевые KPI скрыты, чтобы не выпускать кривую картину.'
      : (model.reason || 'Данные управленческого контура еще загружаются.');
    return [
      '<div class="grid g3">',
      panel('Собираем фактический слой', '<div class="premium-empty">' + escapeHtml(text) + '</div>', 'panel-pad route-glow span2', 'ждем факт'),
      panel('Что уже готово', list([
        ['План', model && model.totals && model.totals.planToDateRevenue ? money(model.totals.planToDateRevenue) : 'ожидается', 'контур'],
        ['Реклама', model && model.totals && model.totals.adSpend ? money(model.totals.adSpend) : 'ожидается', 'API'],
        ['Факт продаж', 'подгружается', 'без нулей']
      ]), 'panel-pad platform-focus', 'без шума'),
      '</div>'
    ].join('');
  }

  function buildDashboardModel() {
    var s = state();
    var cards = Array.isArray(s.dashboard && s.dashboard.cards) ? s.dashboard.cards : [];
    var brand = Array.isArray(s.dashboard && s.dashboard.brandSummary) ? s.dashboard.brandSummary[0] || {} : {};
    var activeMonth = s.dashboard && s.dashboard.companyPlan && s.dashboard.companyPlan.activeMonth || {};
    var platformRows = [];
    if (s.platformTrends && Array.isArray(s.platformTrends.platforms)) {
      platformRows = s.platformTrends.platforms.map(function (row) {
        return {
          platform: row.platformKey || row.platform || row.key || '',
          label: row.label || row.name || row.platform || '',
          revenue: finite(row.revenue || row.factRevenue || row.totalRevenue),
          plan: finite(row.planRevenue || row.planToDateRevenue),
          marginPct: ratio(row.marginPct),
          drr: ratio(row.drr)
        };
      }).filter(function (row) { return row.revenue || row.plan; });
    }
    var revenue = finite(activeMonth.factRevenueToDate || brand.fact_revenue_to_date || s.dashboard && s.dashboard.fact_revenue_to_date);
    var plan = finite(activeMonth.planRevenueToDate || brand.plan_to_date_revenue || s.dashboard && s.dashboard.plan_to_date_revenue);
    return {
      generatedAt: s.dashboard && s.dashboard.generatedAt || '',
      asOf: s.dashboard && (s.dashboard.asOfDate || s.dashboard.dataFreshness && s.dashboard.dataFreshness.asOfDate) || '',
      cards: cards,
      platformRows: platformRows,
      revenue: revenue,
      plan: plan,
      completion: plan > 0 ? revenue / plan : ratio(activeMonth.planCompletionToDatePct)
    };
  }

  function dashboardCardMetric(card) {
    var value = card && (card.valueFormatted || card.value || card.amount || card.metricValue);
    var label = card && (card.label || card.title || 'Показатель');
    var hint = card && (card.hint || card.subtitle || card.caption || '');
    var progress = ratio(card && (card.progress || card.pct || card.percent));
    if (progress != null && progress > 1.5) progress = progress / 100;
    return metric(label, value == null || value === '' ? '—' : String(value), hint, progress == null ? 62 : progress * 100);
  }

  function renderDashboard(root) {
    var route = ROUTES.dashboard;
    var model = buildDashboardModel();
    var stage = ensureStage(route.id);
    var signature = JSON.stringify({
      route: route.id,
      generatedAt: model.generatedAt,
      asOf: model.asOf,
      cards: model.cards.slice(0, 8),
      revenue: model.revenue,
      plan: model.plan
    });
    if (root.dataset.premiumSignature === signature && stage.dataset.premiumSignature === signature && stage.querySelector('.altea-premium-route')) {
      pruneLegacyChildren(root);
      positionStage(root, stage);
      syncStageVisibility(route.id);
      return;
    }
    root.dataset.premiumSignature = signature;
    root.dataset.premiumRoute = route.id;
    root.style.setProperty('--route-accent', route.accent);
    root.style.setProperty('--route-rgb', route.rgb);
    pruneLegacyChildren(root);
    var focusRows = [
      ['План-факт', model.completion == null ? 'данные обновляются' : pct(model.completion), model.completion == null ? 'ждем' : 'сейчас'],
      ['Сборка данных', model.generatedAt || '—', 'обновлено'],
      ['Факт на дату', model.asOf || '—', 'срез'],
      ['Площадки', int(model.platformRows.length), 'контуры']
    ];
    var cardHtml = model.cards.length
      ? model.cards.slice(0, 8).map(dashboardCardMetric).join('')
      : metric('Пульс бренда', model.revenue ? money(model.revenue) : '—', model.plan ? 'план ' + money(model.plan) : 'данные собираются', clampPct(model.completion));
    var platformHtml = model.platformRows.length
      ? '<div class="grid g5 section-gap">' + model.platformRows.slice(0, 5).map(function (row) {
        var key = String(row.platform || '').toLowerCase();
        return metric(row.label || platformMeta(key).label, money(row.revenue), row.plan ? 'план ' + money(row.plan) : 'маржа ' + pct(row.marginPct), row.plan ? row.revenue / row.plan * 100 : 58, 'platform-metric platform-card', platformStyle(key));
      }).join('') + '</div>'
      : '';
    stage.dataset.premiumSignature = signature;
    positionStage(root, stage);
    stage.innerHTML = [
      '<section class="altea-premium-route altea-premium-route--dashboard" style="' + routeStyle(route, 'all') + '">',
      '<div class="premium-route-body">',
      head(route, '<button class="btn" type="button" data-premium-navigate="executive">Руководителю</button><button class="btn primary" type="button" data-premium-navigate="sku-plan-fact">План-факт</button>'),
      '<div class="grid g3">',
      '<section class="panel hero route-glow span2"><div class="hero-grid"><div class="hero-copy"><div class="micro">Пульс бренда</div><h2>Сейчас важное помещается в один взгляд</h2><p>Выручка, выполнение плана и риски собраны в спокойной иерархии; цвет площадки остается только в точках сравнения.</p><div class="hero-number"><div class="value lg">' + escapeHtml(model.completion == null ? '—' : pct(model.completion)) + '</div><small>выполнение плана</small></div></div><div class="hero-orbit"><div class="core">' + escapeHtml(model.completion == null ? '—' : pct(model.completion)) + '</div></div></div></section>',
      panel('Фокус дня', list(focusRows), 'panel-pad platform-focus', '4 сигнала'),
      '</div>',
      '<div class="grid g4 section-gap">' + cardHtml + '</div>',
      platformHtml,
      '<div class="grid g2 section-gap">',
      panel('Динамика результата', chart(model.cards.map(function (_card, index) { return 40 + index * 7 + (index % 2 ? 9 : 0); })), 'panel-pad'),
      panel('Сводка команды', list(focusRows), 'panel-pad', 'сейчас'),
      '</div>',
      '</div></section>'
    ].join('');
    syncStageVisibility(route.id);
  }

  function wrapLegacyRenderer(globalName, routeId, renderer) {
    var original = window[globalName];
    if (typeof original !== 'function' || original.__alteaPremiumWrapped) return;
    var wrapped = function () {
      var root = document.getElementById('view-' + routeId);
      if (root) root.dataset.premiumRoute = routeId;
      var result = original.apply(this, arguments);
      root = document.getElementById('view-' + routeId);
      if (root) renderer(root);
      return result;
    };
    wrapped.__alteaPremiumWrapped = true;
    wrapped.__alteaPremiumOriginal = original;
    window[globalName] = wrapped;
  }

  function wrapLegacyRenderers() {
    wrapLegacyRenderer('renderExecutive', 'executive', renderExecutive);
    wrapLegacyRenderer('renderDashboard', 'dashboard', renderDashboard);
  }

  function activeRoute() {
    var active = document.querySelector('.view.active[id^="view-"]');
    if (!active) return null;
    return { root: active, id: active.id.replace(/^view-/, '') };
  }

  function premiumRoute(routeId) {
    return routeId === 'dashboard' || routeId === 'executive';
  }

  function stageId(routeId) {
    return 'altea-premium-stage-' + routeId;
  }

  function shellNavHtml() {
    var groups = [];
    NAV_ROUTES.forEach(function (route) {
      if (groups.indexOf(route.group) === -1) groups.push(route.group);
    });
    return groups.map(function (group) {
      return [
        '<div class="altea-premium-nav-group">',
        '<div class="altea-premium-nav-label">' + escapeHtml(group) + '</div>',
        NAV_ROUTES.filter(function (route) { return route.group === group; }).map(function (route) {
          return [
            '<button type="button" class="altea-premium-nav-btn" data-premium-nav="' + escapeHtml(route.id) + '">',
            '<span class="altea-premium-nav-icon">' + icon(route.icon) + '</span>',
            '<span><span class="altea-premium-nav-title">' + escapeHtml(route.title) + '</span>',
            '<span class="altea-premium-nav-caption">' + escapeHtml(route.caption) + '</span></span>',
            '<i class="altea-premium-nav-dot"></i>',
            '</button>'
          ].join('');
        }).join(''),
        '</div>'
      ].join('');
    }).join('');
  }

  function ensureShell() {
    var shell = document.getElementById('altea-premium-app');
    if (shell) return shell;
    shell = document.createElement('div');
    shell.id = 'altea-premium-app';
    shell.className = 'altea-premium-app';
    shell.hidden = true;
    shell.innerHTML = [
      '<aside class="altea-premium-shell-sidebar">',
      '<div class="altea-premium-shell-brand">',
      '<span class="altea-premium-shell-mark"><img src="assets/altea-imperial-mark.svg" alt=""></span>',
      '<div><div class="altea-premium-shell-title">Дом бренда Алтея</div><div class="altea-premium-shell-subtitle">private workspace</div></div>',
      '</div>',
      '<nav class="altea-premium-shell-nav">' + shellNavHtml() + '</nav>',
      '</aside>',
      '<main class="altea-premium-shell-main">',
      '<header class="altea-premium-shell-topbar">',
      '<div class="altea-premium-crumb"><span class="altea-premium-crumb-index" data-premium-crumb-index>01</span><strong data-premium-crumb-title>Дашборд</strong></div>',
      '<div class="altea-premium-top-spacer"></div>',
      '<button type="button" class="altea-premium-shell-action altea-premium-sync" data-premium-proxy="syncStatusBadge">Командная база синхронизируется</button>',
      '<button type="button" class="altea-premium-shell-action" data-premium-proxy="pullRemoteBtn">Обновить данные</button>',
      '<button type="button" class="altea-premium-shell-action" data-premium-proxy="pushRemoteBtn">Синхронизировать</button>',
      '<span class="altea-premium-shell-action" data-premium-user>user</span>',
      '<button type="button" class="altea-premium-shell-action" data-premium-proxy="portalAuthSignOutBtn">Выйти</button>',
      '</header>',
      '<div class="altea-premium-shell-content" data-premium-content></div>',
      '</main>'
    ].join('');
    document.body.appendChild(shell);
    return shell;
  }

  function ensureStage(routeId) {
    var shell = ensureShell();
    var content = shell.querySelector('[data-premium-content]');
    var stage = document.getElementById(stageId(routeId));
    if (stage) return stage;
    stage = document.createElement('div');
    stage.id = stageId(routeId);
    stage.className = 'altea-premium-route-stage';
    stage.dataset.premiumStage = routeId;
    stage.hidden = true;
    content.appendChild(stage);
    return stage;
  }

  function proxyClick(targetId) {
    if (targetId === 'syncStatusBadge') return;
    if (targetId === 'portalAuthSignOutBtn') {
      var signOut = document.querySelector('[data-portal-auth-signout], .portal-auth-user button, #portalAuthSignOutBtn');
      if (signOut) signOut.click();
      return;
    }
    var target = document.getElementById(targetId);
    if (target) target.click();
  }

  function syncShell(activeId) {
    var shell = ensureShell();
    var shouldShow = premiumRoute(activeId) && !document.body.classList.contains('portal-auth-locked');
    shell.hidden = !shouldShow;
    document.body.classList.toggle('altea-premium-app-active', shouldShow);
    if (!shouldShow) return;
    var meta = NAV_BY_ID[activeId] || NAV_BY_ID.dashboard;
    var route = ROUTES[activeId] || ROUTES.dashboard;
    shell.style.setProperty('--route-accent', route.accent);
    shell.style.setProperty('--route-rgb', route.rgb);
    shell.querySelector('[data-premium-crumb-index]').textContent = meta.index;
    shell.querySelector('[data-premium-crumb-title]').textContent = meta.title;
    Array.prototype.forEach.call(shell.querySelectorAll('[data-premium-nav]'), function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-premium-nav') === activeId);
    });
    var syncSource = document.getElementById('syncStatusBadge');
    var syncTarget = shell.querySelector('[data-premium-proxy="syncStatusBadge"]');
    if (syncSource && syncTarget) syncTarget.textContent = syncSource.textContent || 'Командная база синхронизирована';
    var userSource = document.querySelector('.portal-auth-user');
    var userTarget = shell.querySelector('[data-premium-user]');
    if (userTarget) userTarget.textContent = userSource ? (userSource.textContent || '').replace(/\s*Выйти\s*$/i, '').trim() : 'user';
  }

  function positionStage(root, stage) {
    if (!root || !stage) return;
    syncShell((root.id || '').replace(/^view-/, ''));
  }

  function syncStageVisibility(activeId) {
    ['dashboard', 'executive'].forEach(function (routeId) {
      var stage = document.getElementById(stageId(routeId));
      if (stage) stage.hidden = routeId !== activeId;
    });
    syncShell(activeId);
  }

  function pruneLegacyChildren(root) {
    Array.prototype.slice.call(root.children || []).forEach(function (child) {
      child.remove();
    });
  }

  function renderActive() {
    if (renderLock) return;
    var active = activeRoute();
    if (!active) {
      syncShell('');
      return;
    }
    syncShell(active.id);
    if (!premiumRoute(active.id)) {
      syncStageVisibility(active.id);
      return;
    }
    renderLock = true;
    try {
      document.body.classList.add('altea-premium-presentation-ready');
      if (active.id === 'executive') renderExecutive(active.root);
      if (active.id === 'dashboard') renderDashboard(active.root);
    } catch (error) {
      console.warn('[premium-presentation]', error);
    } finally {
      renderLock = false;
    }
  }

  function scheduleRender(delay) {
    if (renderFrame) window.cancelAnimationFrame(renderFrame);
    if (delay) {
      window.setTimeout(scheduleRender, delay);
      return;
    }
    renderFrame = window.requestAnimationFrame(function () {
      renderFrame = 0;
      renderActive();
    });
  }

  function guardActivePremiumRoute() {
    wrapLegacyRenderers();
    var active = activeRoute();
    if (!active || !premiumRoute(active.id)) {
      syncShell(active ? active.id : '');
      return;
    }
    var stage = ensureStage(active.id);
    var premium = stage.querySelector('.altea-premium-route');
    var hasLegacy = Array.prototype.some.call(active.root.children || [], function (child) {
      return !child.classList || !child.classList.contains('altea-premium-route');
    });
    if (!premium || hasLegacy || stage.hidden) renderActive();
    else positionStage(active.root, stage);
  }

  function startGuardLoop() {
    if (guardTimer) return;
    guardTimer = window.setInterval(guardActivePremiumRoute, 700);
  }

  function navigate(route) {
    var button = document.querySelector('[data-view="' + route + '"]');
    if (button) {
      button.click();
      return;
    }
    try {
      window.location.hash = route;
    } catch (error) {}
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var premiumNav = event.target && event.target.closest && event.target.closest('[data-premium-nav]');
      if (premiumNav) {
        event.preventDefault();
        navigate(premiumNav.getAttribute('data-premium-nav') || 'dashboard');
        scheduleRender(80);
        return;
      }
      var proxy = event.target && event.target.closest && event.target.closest('[data-premium-proxy]');
      if (proxy) {
        event.preventDefault();
        proxyClick(proxy.getAttribute('data-premium-proxy'));
        return;
      }
      var nav = event.target && event.target.closest && event.target.closest('[data-premium-navigate]');
      if (nav) {
        event.preventDefault();
        navigate(nav.getAttribute('data-premium-navigate') || 'dashboard');
        return;
      }
      if (event.target && event.target.closest && event.target.closest('[data-view], .nav-btn, [data-executive-funnel-platform], [data-executive-funnel-status], [data-executive-funnel-owner-card]')) {
        scheduleRender(80);
      }
    });
    document.addEventListener('change', function (event) {
      if (event.target && event.target.matches && event.target.matches('[data-executive-funnel-owner], [data-executive-funnel-sort]')) {
        scheduleRender(120);
      }
    });
    document.addEventListener('input', function (event) {
      if (event.target && event.target.matches && event.target.matches('[data-executive-funnel-search]')) {
        scheduleRender(180);
      }
    });
    window.addEventListener('hashchange', function () { scheduleRender(120); });
    window.addEventListener('altea:themechange', function () { scheduleRender(40); });
    window.addEventListener('altea:data-ready', function () { scheduleRender(80); });
  }

  function bindObserver() {
    if (observer) return;
    var target = document.querySelector('.main') || document.body;
    observer = new MutationObserver(function (mutations) {
      if (renderLock) return;
      var shouldRender = mutations.some(function (mutation) {
        if (mutation.target && mutation.target.closest && mutation.target.closest('.altea-premium-route')) return false;
        if (mutation.type === 'attributes' && mutation.attributeName === 'class' && mutation.target.classList && mutation.target.classList.contains('view')) return true;
        return mutation.type === 'childList' && Array.prototype.some.call(mutation.addedNodes || [], function (node) {
          return node.nodeType === 1 && (!node.classList || !node.classList.contains('altea-premium-route'));
        });
      });
      if (shouldRender) scheduleRender(40);
    });
    observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  function init() {
    wrapLegacyRenderers();
    bindEvents();
    bindObserver();
    startGuardLoop();
    scheduleRender(0);
    scheduleRender(450);
    scheduleRender(1400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AlteaPremiumPresentation = {
    renderActive: renderActive,
    scheduleRender: scheduleRender
  };
})();
